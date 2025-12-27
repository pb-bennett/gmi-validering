'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  LayersControl,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import useStore from '@/lib/store';
import proj4 from 'proj4';

// Fix for default Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Define common projections
proj4.defs(
  'EPSG:25832',
  '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
);
proj4.defs(
  'EPSG:25833',
  '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
);
proj4.defs(
  'EPSG:32632',
  '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs'
);
proj4.defs(
  'EPSG:32633',
  '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs'
);
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

// --- Styling Functions ---

// Infrastructure type categories for symbols
const INFRA_CATEGORIES = {
  WATER: 'water',      // Vannledninger - circle
  WASTEWATER: 'wastewater', // Spillvann - square
  STORMWATER: 'stormwater', // Overvann - triangle
  DRAINAGE: 'drainage', // Drensering - diamond
  MANHOLE: 'manhole',   // Kum - hexagon
  GAS: 'gas',          // Gass - pentagon
  ELECTRIC: 'electric', // Elektrisk - star
  TELECOM: 'telecom',   // Tele - cross
  HEATING: 'heating',   // Fjernvarme - flame
  SLS_SLU: 'sls_slu',  // SLS/SLU - black square with vertical cross
  DIV: 'div',          // DIV - small circle (less intrusive)
  GROKONSTR: 'grokonstr', // GRØKONSTR - large rectangle with hashes
  KRN: 'krn',          // KRN - blue square with diagonal cross (smaller)
  ANBORING: 'anboring', // ANBORING - small blue circle like DIV
  GRN: 'grn',          // GRN - small green circle like DIV
  SAN: 'san',          // SAN - black square with circle inside
  OTHER: 'other',      // Annet - circle
};

const getCategoryByFCode = (fcode) => {
  if (!fcode) return INFRA_CATEGORIES.OTHER;
  
  // Check specific codes first
  if (fcode === 'SLS' || fcode === 'SLU')
    return INFRA_CATEGORIES.SLS_SLU;
  if (fcode === 'DIV')
    return INFRA_CATEGORIES.DIV;
  if (fcode === 'GRØKONSTR')
    return INFRA_CATEGORIES.GROKONSTR;
  if (fcode === 'KRN')
    return INFRA_CATEGORIES.KRN;
  if (fcode.includes('ANBORING'))
    return INFRA_CATEGORIES.ANBORING;
  if (fcode === 'GRN' || fcode.includes('GRN'))
    return INFRA_CATEGORIES.GRN;
  if (fcode === 'SAN' || fcode.includes('SAN'))
    return INFRA_CATEGORIES.SAN;
  
  // Then check partial matches
  if (fcode.includes('VL') || fcode.includes('VANN') || fcode.includes('VF'))
    return INFRA_CATEGORIES.WATER;
  if (fcode.includes('SP') || fcode.includes('SPILLVANN'))
    return INFRA_CATEGORIES.WASTEWATER;
  if (fcode.includes('OV') || fcode.includes('OVERVANN'))
    return INFRA_CATEGORIES.STORMWATER;
  if (fcode.includes('DR') || fcode.includes('DREN'))
    return INFRA_CATEGORIES.DRAINAGE;
  if (fcode.includes('KUM'))
    return INFRA_CATEGORIES.MANHOLE;
  if (fcode.includes('GAS'))
    return INFRA_CATEGORIES.GAS;
  if (fcode.includes('EL') || fcode.includes('ELEKTR'))
    return INFRA_CATEGORIES.ELECTRIC;
  if (fcode.includes('TELE') || fcode.includes('TEL'))
    return INFRA_CATEGORIES.TELECOM;
  if (fcode.includes('FJERN'))
    return INFRA_CATEGORIES.HEATING;
  
  return INFRA_CATEGORIES.OTHER;
};

const getColorByFCode = (fcode) => {
  if (!fcode) return '#808080'; // Default gray for unknown

  // Norwegian infrastructure color system
  const colorMap = {
    // Water infrastructure - BLUE shades
    VL: '#0066cc', // Vannledninger (Water lines)
    VF: '#0080ff', // Vannforsyning

    // Wastewater - GREEN shades
    SP: '#228B22', // Spillvannsledning (Wastewater lines)
    SPP: '#32CD32', // Spillvann pumpe

    // Surface water - BLACK/DARK shades
    OV: '#2a2a2a', // Overvannsledning (Surface water lines) - slightly lighter for visibility
    OVP: '#333333', // Overvann pumpe

    // Drainage - BROWN shades
    DR: '#8B4513', // Drenseledning (Drainage lines)
    DRK: '#A0522D', // Drenering kum

    // Manholes/Infrastructure points - RED shades
    KUM: '#cc3300', // Kummer (Manholes)
    KUM_SP: '#dc143c', // Spillvann kum
    KUM_OV: '#b22222', // Overvann kum
    KUM_VL: '#cd5c5c', // Vann kum

    // Gas - YELLOW shades
    GAS: '#ffd700', // Gass ledninger
    GASL: '#ffff00', // Gass lavtrykk

    // Electric/Telecom - ORANGE shades
    EL: '#ff6600', // Elektrisk
    TELE: '#ff8c00', // Telekommunikasjon

    // District heating - MAGENTA
    FJERNVARME: '#ff00ff',

    // Special infrastructure codes
    AF: '#ff0000', // AF lines - RED
    SLS: '#000000', // SLS - black
    SLU: '#000000', // SLU - black
    DIV: '#666666', // DIV - dark grey (less intrusive)
    GRØKONSTR: '#cccccc', // GRØKONSTR - light grey
    KRN: '#0066cc', // KRN - blue
    ANBORING: '#0066cc', // ANBORING - blue like KRN
    GRN: '#00cc00', // GRN - green
    SAN: '#000000', // SAN - black like SLS/SLU

    // Other/Unknown - PURPLE (default)
    ANNET: '#800080',
  };

  // Try exact match first
  if (colorMap[fcode]) {
    return colorMap[fcode];
  }

  // Try partial matches for complex codes
  if (fcode.includes('VL') || fcode.includes('VANN'))
    return '#0066cc';
  if (fcode.includes('SP') || fcode.includes('SPILLVANN'))
    return '#228B22';
  if (fcode.includes('OV') || fcode.includes('OVERVANN'))
    return '#2a2a2a';
  if (fcode.includes('DR') || fcode.includes('DREN'))
    return '#8B4513';
  if (fcode.includes('KUM')) return '#cc3300';
  if (fcode.includes('GAS')) return '#ffd700';
  if (fcode.includes('EL') || fcode.includes('ELEKTR'))
    return '#ff6600';
  if (fcode.includes('TELE') || fcode.includes('TEL'))
    return '#ff8c00';
  if (fcode.includes('FJERN')) return '#ff00ff';

  // Everything else - purple
  return '#800080';
};

// SVG shape generators for point markers
const createSvgMarker = (category, color, isHighlighted = false) => {
  // Adjust base sizes per category
  let baseSize;
  if (category === INFRA_CATEGORIES.DIV || category === INFRA_CATEGORIES.ANBORING || category === INFRA_CATEGORIES.GRN) {
    baseSize = 12; // Even smaller for DIV, ANBORING, and GRN
  } else if (category === INFRA_CATEGORIES.KRN) {
    baseSize = 14; // Smaller for KRN
  } else if (category === INFRA_CATEGORIES.MANHOLE) {
    baseSize = 20; // Larger for manholes
  } else {
    baseSize = 18; // Standard size
  }
  
  const size = isHighlighted ? baseSize + 6 : baseSize;
  const strokeWidth = isHighlighted ? 3 : 2;
  const highlightColor = '#00FFFF';
  const stroke = isHighlighted ? highlightColor : color;
  const fill = '#FFFFFF';
  const half = size / 2;
  
  // Special handling for GRØKONSTR - make it larger and rectangular
  if (category === INFRA_CATEGORIES.GROKONSTR) {
    const rectWidth = isHighlighted ? 28 : 22;
    const rectHeight = isHighlighted ? 18 : 14;
    const rectX = (size - rectWidth) / 2;
    const rectY = (size - rectHeight) / 2;
    // Rectangle with diagonal hash pattern
    const svgPath = `
      <rect x="${rectX}" y="${rectY}" width="${rectWidth}" height="${rectHeight}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
      <g stroke="${stroke}" stroke-width="1" opacity="0.6">
        <line x1="${rectX + 3}" y1="${rectY}" x2="${rectX}" y2="${rectY + 3}"/>
        <line x1="${rectX + 8}" y1="${rectY}" x2="${rectX}" y2="${rectY + 8}"/>
        <line x1="${rectX + 13}" y1="${rectY}" x2="${rectX}" y2="${rectY + 13}"/>
        <line x1="${rectX + 18}" y1="${rectY}" x2="${rectX + 5}" y2="${rectY + 13}"/>
        <line x1="${rectX + 22}" y1="${rectY + 2}" x2="${rectX + 10}" y2="${rectY + 14}"/>
        <line x1="${rectX + 22}" y1="${rectY + 7}" x2="${rectX + 15}" y2="${rectY + 14}"/>
      </g>`;
    
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${svgPath}</svg>`;
    return L.divIcon({
      html: svg,
      className: 'custom-div-icon',
      iconSize: [size, size],
      iconAnchor: [half, half],
      popupAnchor: [0, -half],
    });
  }
  
  let svgPath;
  
  switch (category) {
    case INFRA_CATEGORIES.WATER:
      // Circle (standard for water)
      svgPath = `<circle cx="${half}" cy="${half}" r="${half - strokeWidth}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
      
    case INFRA_CATEGORIES.WASTEWATER:
      // Square (spillvann)
      const sqInset = strokeWidth;
      svgPath = `<rect x="${sqInset}" y="${sqInset}" width="${size - sqInset * 2}" height="${size - sqInset * 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
      
    case INFRA_CATEGORIES.STORMWATER:
      // Triangle pointing up (overvann)
      const triTop = strokeWidth;
      const triBottom = size - strokeWidth;
      const triLeft = strokeWidth;
      const triRight = size - strokeWidth;
      svgPath = `<polygon points="${half},${triTop} ${triRight},${triBottom} ${triLeft},${triBottom}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
      
    case INFRA_CATEGORIES.DRAINAGE:
      // Diamond (drenering)
      svgPath = `<polygon points="${half},${strokeWidth} ${size - strokeWidth},${half} ${half},${size - strokeWidth} ${strokeWidth},${half}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
      
    case INFRA_CATEGORIES.MANHOLE:
      // Hexagon (kum)
      const h = size / 4;
      const hexPoints = [
        [half, strokeWidth],
        [size - strokeWidth, h + strokeWidth],
        [size - strokeWidth, size - h - strokeWidth],
        [half, size - strokeWidth],
        [strokeWidth, size - h - strokeWidth],
        [strokeWidth, h + strokeWidth],
      ].map(p => p.join(',')).join(' ');
      svgPath = `<polygon points="${hexPoints}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
      
    case INFRA_CATEGORIES.GAS:
      // Pentagon (gas)
      const pR = half - strokeWidth;
      const pentPoints = [];
      for (let i = 0; i < 5; i++) {
        const angle = (i * 72 - 90) * Math.PI / 180;
        pentPoints.push([half + pR * Math.cos(angle), half + pR * Math.sin(angle)]);
      }
      svgPath = `<polygon points="${pentPoints.map(p => p.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
      
    case INFRA_CATEGORIES.ELECTRIC:
      // Star/bolt shape (elektrisk)
      const starR = half - strokeWidth;
      const innerR = starR * 0.4;
      const starPoints = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? starR : innerR;
        const angle = (i * 36 - 90) * Math.PI / 180;
        starPoints.push([half + r * Math.cos(angle), half + r * Math.sin(angle)]);
      }
      svgPath = `<polygon points="${starPoints.map(p => p.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
      
    case INFRA_CATEGORIES.TELECOM:
      // Cross/plus (tele)
      const cw = size * 0.3;
      const co = (size - cw) / 2;
      svgPath = `<path d="M${co},${strokeWidth} h${cw} v${co - strokeWidth} h${co - strokeWidth} v${cw} h-${co - strokeWidth} v${co - strokeWidth} h-${cw} v-${co - strokeWidth} h-${co - strokeWidth} v-${cw} h${co - strokeWidth} z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth * 0.7}"/>`;
      break;
      
    case INFRA_CATEGORIES.HEATING:
      // Flame/teardrop shape (fjernvarme)
      svgPath = `<path d="M${half},${strokeWidth} C${size - strokeWidth},${half} ${size - strokeWidth},${size - strokeWidth} ${half},${size - strokeWidth} C${strokeWidth},${size - strokeWidth} ${strokeWidth},${half} ${half},${strokeWidth} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
      
    case INFRA_CATEGORIES.SLS_SLU:
      // Black square with vertical cross
      const slsInset = strokeWidth;
      const crossW = 2;
      svgPath = `
        <rect x="${slsInset}" y="${slsInset}" width="${size - slsInset * 2}" height="${size - slsInset * 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <line x1="${half}" y1="${slsInset + 2}" x2="${half}" y2="${size - slsInset - 2}" stroke="${stroke}" stroke-width="${crossW}"/>
        <line x1="${slsInset + 2}" y1="${half}" x2="${size - slsInset - 2}" y2="${half}" stroke="${stroke}" stroke-width="${crossW}"/>`;
      break;
      
    case INFRA_CATEGORIES.DIV:
      // Small circle (less intrusive)
      svgPath = `<circle cx="${half}" cy="${half}" r="${half - strokeWidth}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
      
    case INFRA_CATEGORIES.ANBORING:
      // Small blue circle like DIV
      svgPath = `<circle cx="${half}" cy="${half}" r="${half - strokeWidth}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
      
    case INFRA_CATEGORIES.KRN:
      // Blue square with diagonal cross
      const krnInset = strokeWidth;
      const diagCrossW = 2;
      svgPath = `
        <rect x="${krnInset}" y="${krnInset}" width="${size - krnInset * 2}" height="${size - krnInset * 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <line x1="${krnInset + 2}" y1="${krnInset + 2}" x2="${size - krnInset - 2}" y2="${size - krnInset - 2}" stroke="${stroke}" stroke-width="${diagCrossW}"/>
        <line x1="${size - krnInset - 2}" y1="${krnInset + 2}" x2="${krnInset + 2}" y2="${size - krnInset - 2}" stroke="${stroke}" stroke-width="${diagCrossW}"/>`;
      break;
      
    case INFRA_CATEGORIES.GRN:
      // Small green circle like DIV
      svgPath = `<circle cx="${half}" cy="${half}" r="${half - strokeWidth}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
      
    case INFRA_CATEGORIES.SAN:
      // Black square with circle inside (same size as SLU)
      const sanInset = strokeWidth;
      const innerCircleR = (size - sanInset * 4) / 2;
      svgPath = `
        <rect x="${sanInset}" y="${sanInset}" width="${size - sanInset * 2}" height="${size - sanInset * 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <circle cx="${half}" cy="${half}" r="${innerCircleR}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
      
    default:
      // Default circle
      svgPath = `<circle cx="${half}" cy="${half}" r="${half - strokeWidth}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  }
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${svgPath}</svg>`;
  
  return L.divIcon({
    html: svg,
    className: 'custom-div-icon',
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
  });
};

// Export legend data for the Legend component
export const LEGEND_ITEMS = [
  { category: INFRA_CATEGORIES.WATER, label: 'Vannledning (VL)', color: '#0066cc' },
  { category: INFRA_CATEGORIES.WASTEWATER, label: 'Spillvann (SP)', color: '#228B22' },
  { category: INFRA_CATEGORIES.STORMWATER, label: 'Overvann (OV)', color: '#2a2a2a' },
  { category: INFRA_CATEGORIES.DRAINAGE, label: 'Drenering (DR)', color: '#8B4513' },
  { category: INFRA_CATEGORIES.MANHOLE, label: 'Kum (KUM)', color: '#cc3300' },
  { category: INFRA_CATEGORIES.GAS, label: 'Gass', color: '#ffd700' },
  { category: INFRA_CATEGORIES.ELECTRIC, label: 'Elektrisk (EL)', color: '#ff6600' },
  { category: INFRA_CATEGORIES.TELECOM, label: 'Telekom (TELE)', color: '#ff8c00' },
  { category: INFRA_CATEGORIES.HEATING, label: 'Fjernvarme', color: '#ff00ff' },
  { category: INFRA_CATEGORIES.SLS_SLU, label: 'SLS/SLU', color: '#000000' },
  { category: INFRA_CATEGORIES.DIV, label: 'DIV (diverse)', color: '#666666' },
  { category: INFRA_CATEGORIES.ANBORING, label: 'Anboring', color: '#0066cc' },
  { category: INFRA_CATEGORIES.GROKONSTR, label: 'Grøntkonstr.', color: '#cccccc' },
  { category: INFRA_CATEGORIES.KRN, label: 'KRN', color: '#0066cc' },
  { category: INFRA_CATEGORIES.GRN, label: 'GRN', color: '#00cc00' },
  { category: INFRA_CATEGORIES.SAN, label: 'SAN', color: '#000000' },
  { category: INFRA_CATEGORIES.OTHER, label: 'Annet', color: '#800080' },
];

// Generate SVG for legend (exported for Legend component)
export const getLegendSvg = (category, color, size = 20) => {
  const strokeWidth = 2;
  const fill = '#FFFFFF';
  const stroke = color;
  const half = size / 2;
  
  // Special handling for GRØKONSTR - make it rectangular
  if (category === INFRA_CATEGORIES.GROKONSTR) {
    const rectWidth = size * 1.2;
    const rectHeight = size * 0.7;
    const rectX = (size - rectWidth) / 2;
    const rectY = (size - rectHeight) / 2;
    const svgPath = `
      <rect x="${rectX}" y="${rectY}" width="${rectWidth}" height="${rectHeight}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
      <g stroke="${stroke}" stroke-width="0.8" opacity="0.6">
        <line x1="${rectX + 2}" y1="${rectY}" x2="${rectX}" y2="${rectY + 2}"/>
        <line x1="${rectX + 6}" y1="${rectY}" x2="${rectX}" y2="${rectY + 6}"/>
        <line x1="${rectX + 10}" y1="${rectY}" x2="${rectX}" y2="${rectY + 10}"/>
        <line x1="${rectX + 14}" y1="${rectY}" x2="${rectX + 4}" y2="${rectY + 10}"/>
        <line x1="${rectX + 18}" y1="${rectY + 2}" x2="${rectX + 8}" y2="${rectY + 12}"/>
      </g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${svgPath}</svg>`;
  }
  
  let svgPath;
  
  switch (category) {
    case INFRA_CATEGORIES.WATER:
      svgPath = `<circle cx="${half}" cy="${half}" r="${half - strokeWidth}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.WASTEWATER:
      const sqInset = strokeWidth;
      svgPath = `<rect x="${sqInset}" y="${sqInset}" width="${size - sqInset * 2}" height="${size - sqInset * 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.STORMWATER:
      const triTop = strokeWidth;
      const triBottom = size - strokeWidth;
      const triLeft = strokeWidth;
      const triRight = size - strokeWidth;
      svgPath = `<polygon points="${half},${triTop} ${triRight},${triBottom} ${triLeft},${triBottom}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.DRAINAGE:
      svgPath = `<polygon points="${half},${strokeWidth} ${size - strokeWidth},${half} ${half},${size - strokeWidth} ${strokeWidth},${half}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.MANHOLE:
      const h = size / 4;
      const hexPoints = [
        [half, strokeWidth],
        [size - strokeWidth, h + strokeWidth],
        [size - strokeWidth, size - h - strokeWidth],
        [half, size - strokeWidth],
        [strokeWidth, size - h - strokeWidth],
        [strokeWidth, h + strokeWidth],
      ].map(p => p.join(',')).join(' ');
      svgPath = `<polygon points="${hexPoints}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.GAS:
      const pR = half - strokeWidth;
      const pentPoints = [];
      for (let i = 0; i < 5; i++) {
        const angle = (i * 72 - 90) * Math.PI / 180;
        pentPoints.push([half + pR * Math.cos(angle), half + pR * Math.sin(angle)]);
      }
      svgPath = `<polygon points="${pentPoints.map(p => p.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.ELECTRIC:
      const starR = half - strokeWidth;
      const innerR = starR * 0.4;
      const starPoints = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? starR : innerR;
        const angle = (i * 36 - 90) * Math.PI / 180;
        starPoints.push([half + r * Math.cos(angle), half + r * Math.sin(angle)]);
      }
      svgPath = `<polygon points="${starPoints.map(p => p.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.TELECOM:
      const cw = size * 0.3;
      const co = (size - cw) / 2;
      svgPath = `<path d="M${co},${strokeWidth} h${cw} v${co - strokeWidth} h${co - strokeWidth} v${cw} h-${co - strokeWidth} v${co - strokeWidth} h-${cw} v-${co - strokeWidth} h-${co - strokeWidth} v-${cw} h${co - strokeWidth} z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth * 0.7}"/>`;
      break;
    case INFRA_CATEGORIES.HEATING:
      svgPath = `<path d="M${half},${strokeWidth} C${size - strokeWidth},${half} ${size - strokeWidth},${size - strokeWidth} ${half},${size - strokeWidth} C${strokeWidth},${size - strokeWidth} ${strokeWidth},${half} ${half},${strokeWidth} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.SLS_SLU:
      const slsInset = strokeWidth;
      const crossW = 1.5;
      svgPath = `
        <rect x="${slsInset}" y="${slsInset}" width="${size - slsInset * 2}" height="${size - slsInset * 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <line x1="${half}" y1="${slsInset + 1}" x2="${half}" y2="${size - slsInset - 1}" stroke="${stroke}" stroke-width="${crossW}"/>
        <line x1="${slsInset + 1}" y1="${half}" x2="${size - slsInset - 1}" y2="${half}" stroke="${stroke}" stroke-width="${crossW}"/>`;
      break;
    case INFRA_CATEGORIES.DIV:
      svgPath = `<circle cx="${half}" cy="${half}" r="${half - strokeWidth}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.ANBORING:
      svgPath = `<circle cx="${half}" cy="${half}" r="${half - strokeWidth}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.KRN:
      const krnInset = strokeWidth;
      const diagCrossW = 1.5;
      svgPath = `
        <rect x="${krnInset}" y="${krnInset}" width="${size - krnInset * 2}" height="${size - krnInset * 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <line x1="${krnInset + 1}" y1="${krnInset + 1}" x2="${size - krnInset - 1}" y2="${size - krnInset - 1}" stroke="${stroke}" stroke-width="${diagCrossW}"/>
        <line x1="${size - krnInset - 1}" y1="${krnInset + 1}" x2="${krnInset + 1}" y2="${size - krnInset - 1}" stroke="${stroke}" stroke-width="${diagCrossW}"/>`;
      break;
    case INFRA_CATEGORIES.GRN:
      svgPath = `<circle cx="${half}" cy="${half}" r="${half - strokeWidth}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.SAN:
      const sanInset = strokeWidth;
      const innerCircleR = (size - sanInset * 4) / 2;
      svgPath = `
        <rect x="${sanInset}" y="${sanInset}" width="${size - sanInset * 2}" height="${size - sanInset * 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <circle cx="${half}" cy="${half}" r="${innerCircleR}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    default:
      svgPath = `<circle cx="${half}" cy="${half}" r="${half - strokeWidth}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  }
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${svgPath}</svg>`;
};

const getLineWeight = (properties) => {
  // Common dimension field names in Norwegian infrastructure data
  const dimensionFields = [
    'Dimensjon',
    'DIMENSJON',
    'DIMENSION',
    'DIM',
    'DIAMETER',
    'BREDDE',
    'WIDTH',
    'ROER_DIM',
    'NOMINAL_DIM',
    'SIZE',
    'DN',
  ];

  let dimension = null;

  // Try to find dimension value from any of the common field names
  for (const field of dimensionFields) {
    if (
      properties[field] !== undefined &&
      properties[field] !== null &&
      properties[field] !== ''
    ) {
      const value = parseFloat(
        String(properties[field]).replace(/[^\d.]/g, '')
      );
      if (!isNaN(value) && value > 0) {
        dimension = value;
        break;
      }
    }
  }

  if (dimension === null) return 3; // Default weight

  // Scale dimension to line weight
  if (dimension <= 50) return 1; // Very thin pipes
  if (dimension <= 100) return 2; // Small pipes
  if (dimension <= 200) return 3; // Medium pipes
  if (dimension <= 300) return 4; // Large pipes
  if (dimension <= 500) return 6; // Very large pipes
  return 8; // Huge pipes
};

// --- Components ---

function BoundsController({ geoJsonData }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !geoJsonData) return;

    try {
      const geoJsonLayer = L.geoJSON(geoJsonData);
      const bounds = geoJsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    } catch (e) {
      console.warn('Could not fit bounds', e);
    }
  }, [map, geoJsonData]);

  return null;
}

function ZoomHandler({ onZoomChange }) {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });
  return null;
}

export default function MapInner({ onZoomChange }) {
  const data = useStore((state) => state.data);
  const highlightedCode = useStore(
    (state) => state.ui.highlightedCode
  );
  const hiddenCodes = useStore((state) => state.ui.hiddenCodes);
  const highlightedType = useStore(
    (state) => state.ui.highlightedType
  );
  const highlightedTypeContext = useStore(
    (state) => state.ui.highlightedTypeContext
  );
  const hiddenTypes = useStore((state) => state.ui.hiddenTypes);

  const geoJsonData = useMemo(() => {
    if (!data) return null;

    const { points, lines, header } = data;
    const features = [];

    // Determine source projection
    let sourceProj = 'EPSG:4326'; // Default to WGS84
    if (header?.COSYS_EPSG) {
      const epsg = `EPSG:${header.COSYS_EPSG}`;
      if (proj4.defs(epsg)) {
        sourceProj = epsg;
      } else {
        console.warn(
          `Unknown EPSG code: ${header.COSYS_EPSG}, assuming raw coordinates are compatible or WGS84`
        );
      }
    } else if (header?.COSYS) {
      // Simple heuristic for COSYS string
      if (
        header.COSYS.includes('UTM') &&
        header.COSYS.includes('32')
      ) {
        sourceProj = 'EPSG:25832';
      } else if (
        header.COSYS.includes('UTM') &&
        header.COSYS.includes('33')
      ) {
        sourceProj = 'EPSG:25833';
      }
    }

    // Helper to transform coordinate
    const transform = (x, y) => {
      if (sourceProj === 'EPSG:4326') return [x, y]; // No transform needed if already WGS84
      try {
        return proj4(sourceProj, 'EPSG:4326', [x, y]);
      } catch (e) {
        return [x, y];
      }
    };

    // Process Lines
    lines.forEach((line, idx) => {
      if (line.coordinates && line.coordinates.length > 0) {
        const coords = line.coordinates.map((c) =>
          transform(c.x, c.y)
        );
        features.push({
          type: 'Feature',
          properties: {
            ...line.attributes,
            id: idx,
            featureType: 'Line',
          },
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
        });
      }
    });

    // Process Points
    points.forEach((point, idx) => {
      if (point.coordinates && point.coordinates.length > 0) {
        const c = point.coordinates[0];
        const coords = transform(c.x, c.y);
        features.push({
          type: 'Feature',
          properties: {
            ...point.attributes,
            id: idx,
            featureType: 'Point',
          },
          geometry: {
            type: 'Point',
            coordinates: coords,
          },
        });
      }
    });

    return {
      type: 'FeatureCollection',
      features,
    };
  }, [data]);

  if (!data || !geoJsonData) return null;

  const lineStyle = (feature) => {
    const fcode = feature.properties?.S_FCODE;
    const typeVal = feature.properties?.Type || '(Mangler Type)';
    const isHiddenByCode = hiddenCodes.includes(fcode);
    // Check if this specific type+code combination is hidden
    const isHiddenByType = hiddenTypes.some(
      (ht) => ht.type === typeVal && (ht.code === null || ht.code === fcode)
    );
    const isHidden = isHiddenByCode || isHiddenByType;
    const isHighlightedByCode = highlightedCode === fcode;
    // Type highlighting should respect the code context if one is set
    const isHighlightedByType = highlightedType === typeVal && 
      (highlightedTypeContext === null || highlightedTypeContext === fcode);
    const isHighlighted = isHighlightedByCode || isHighlightedByType;

    if (isHidden) {
      return {
        opacity: 0,
        weight: 0,
        fillOpacity: 0,
        interactive: false,
      };
    }

    const color = isHighlighted ? '#00FFFF' : getColorByFCode(fcode);
    const baseWeight = getLineWeight(feature.properties);
    const weight = isHighlighted ? baseWeight + 4 : baseWeight;
    const opacity = isHighlighted ? 1 : 0.9;

    return {
      color: color,
      weight: weight,
      opacity: opacity,
      dashArray: fcode && fcode.includes('DR') ? '5, 5' : null,
      shadowBlur: isHighlighted ? 10 : 0, // Note: Leaflet doesn't support shadowBlur natively in simple path options, but we can simulate "glow" with color/weight
    };
  };

  const pointToLayer = (feature, latlng) => {
    const fcode = feature.properties?.S_FCODE;
    const typeVal = feature.properties?.Type || '(Mangler Type)';
    const isHiddenByCode = hiddenCodes.includes(fcode);
    // Check if this specific type+code combination is hidden
    const isHiddenByType = hiddenTypes.some(
      (ht) => ht.type === typeVal && (ht.code === null || ht.code === fcode)
    );
    const isHidden = isHiddenByCode || isHiddenByType;
    const isHighlightedByCode = highlightedCode === fcode;
    // Type highlighting should respect the code context if one is set
    const isHighlightedByType = highlightedType === typeVal && 
      (highlightedTypeContext === null || highlightedTypeContext === fcode);
    const isHighlighted = isHighlightedByCode || isHighlightedByType;

    if (isHidden) {
      // Return a dummy marker that is invisible
      return L.marker(latlng, {
        opacity: 0,
        interactive: false,
      });
    }

    const color = getColorByFCode(fcode);
    const category = getCategoryByFCode(fcode);
    const icon = createSvgMarker(category, color, isHighlighted);
    
    return L.marker(latlng, { icon });
  };

  const onEachFeature = (feature, layer) => {
    // If hidden by code or type, don't bind popup or do anything
    const fcode = feature.properties?.S_FCODE;
    const typeVal = feature.properties?.Type || '(Mangler Type)';
    const isHiddenByType = hiddenTypes.some(
      (ht) => ht.type === typeVal && (ht.code === null || ht.code === fcode)
    );
    if (
      hiddenCodes.includes(fcode) ||
      isHiddenByType
    ) {
      return;
    }

    if (feature.properties) {
      const props = feature.properties;
      const color = getColorByFCode(fcode);

      let content = `<div class="text-sm max-h-60 overflow-auto">`;
      content += `<strong>Type:</strong> ${props.featureType}<br/>`;
      if (fcode) {
        content += `<strong>Code:</strong> <span style="color: ${color}; font-weight: bold;">${fcode}</span><br/>`;
      }

      content += '<div class="mt-2 border-t pt-1">';
      Object.entries(props).forEach(([key, value]) => {
        if (
          key !== 'featureType' &&
          key !== 'id' &&
          key !== 'S_FCODE' &&
          value !== null &&
          value !== ''
        ) {
          content += `<strong>${key}:</strong> ${value}<br/>`;
        }
      });
      content += '</div></div>';
      layer.bindPopup(content);
    }
  };

  return (
    <MapContainer
      center={[59.9139, 10.7522]}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Kartverket Topo">
          <TileLayer
            attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
            url="https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png"
            maxZoom={22}
            maxNativeZoom={18}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Kartverket Gråtone">
          <TileLayer
            attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
            url="https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png"
            maxZoom={22}
            maxNativeZoom={18}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="OpenStreetMap">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={22}
            maxNativeZoom={19}
          />
        </LayersControl.BaseLayer>

        <LayersControl.Overlay checked name="Data">
          <GeoJSON
            key={`${
              data?.header?.filename || 'data'
            }-${hiddenCodes.join(',')}-${
              highlightedCode || 'none'
            }-${hiddenTypes.join(',')}-${highlightedType || 'none'}-${highlightedTypeContext || 'none'}`}
            data={geoJsonData}
            style={lineStyle}
            pointToLayer={pointToLayer}
            onEachFeature={onEachFeature}
          />
        </LayersControl.Overlay>
      </LayersControl>

      <BoundsController geoJsonData={geoJsonData} />
      {onZoomChange && <ZoomHandler onZoomChange={onZoomChange} />}
    </MapContainer>
  );
}
