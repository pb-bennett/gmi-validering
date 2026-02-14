'use client';

import {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  LayersControl,
  WMSTileLayer,
  useMap,
  useMapEvents,
  CircleMarker,
  Tooltip,
  Polyline,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import useStore from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import { analyzeIncline } from '@/lib/analysis/incline';
import proj4 from 'proj4';
import AuthenticatedWmsLayer from './AuthenticatedWmsLayer';

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
  '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
);
proj4.defs(
  'EPSG:25833',
  '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
);
proj4.defs(
  'EPSG:32632',
  '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs',
);
proj4.defs(
  'EPSG:32633',
  '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs',
);
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

// --- Styling Functions ---

// Infrastructure type categories for symbols
const INFRA_CATEGORIES = {
  WATER: 'water', // Vannledninger - circle
  WASTEWATER: 'wastewater', // Spillvann - square
  STORMWATER: 'stormwater', // Overvann - triangle
  DRAINAGE: 'drainage', // Drensering - diamond
  MANHOLE: 'manhole', // Kum - hexagon
  GAS: 'gas', // Gass - pentagon
  ELECTRIC: 'electric', // Elektrisk - star
  TELECOM: 'telecom', // Tele - cross
  HEATING: 'heating', // Fjernvarme - flame
  SLS_SLU: 'sls_slu', // SLS/SLU - black square with vertical cross
  DIV: 'div', // DIV - small circle (less intrusive)
  GROKONSTR: 'grokonstr', // GRØKONSTR - large rectangle with hashes
  KRN: 'krn', // KRN - blue square with diagonal cross (smaller)
  ANBORING: 'anboring', // ANBORING - small blue circle like DIV
  GRN: 'grn', // GRN - small green circle like DIV
  SAN: 'san', // SAN - black square with circle inside
  LOK: 'lok', // LOK - small centered dot (kumlokk)
  OTHER: 'other', // Annet - circle
};

// Norwegian infrastructure color system (single source of truth)
export const FCODE_COLORS = {
  // Water infrastructure - BLUE shades
  VL: '#0101FF', // Vannledninger (Water lines)
  VF: '#0080ff', // Vannforsyning

  // Wastewater - GREEN shades
  SP: '#02D902', // Spillvannsledning (Wastewater lines)
  SPP: '#32CD32', // Spillvann pumpe

  // Surface water - BLACK/DARK shades
  OV: '#2a2a2a', // Overvannsledning (Surface water lines)
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
  DIV: '#666666', // DIV - dark grey
  GRØKONSTR: '#cccccc', // GRØKONSTR - light grey
  KRN: '#0066cc', // KRN - blue
  ANBORING: '#0066cc', // ANBORING - blue like KRN
  GRN: '#00cc00', // GRN - green
  SAN: '#000000', // SAN - black
  LOK: '#ff00ff', // LOK - magenta

  // Other/Unknown - PURPLE (default)
  ANNET: '#800080',
};

const getCategoryByFCode = (fcode) => {
  // Defensive: ensure fcode is a string
  if (!fcode || typeof fcode !== 'string')
    return INFRA_CATEGORIES.OTHER;

  // Check specific codes first
  if (fcode === 'SLS' || fcode === 'SLU')
    return INFRA_CATEGORIES.SLS_SLU;
  if (fcode === 'DIV') return INFRA_CATEGORIES.DIV;
  if (fcode === 'GRØKONSTR') return INFRA_CATEGORIES.GROKONSTR;
  if (fcode === 'KRN') return INFRA_CATEGORIES.KRN;
  if (fcode.includes('ANBORING')) return INFRA_CATEGORIES.ANBORING;
  if (fcode === 'GRN' || fcode.includes('GRN'))
    return INFRA_CATEGORIES.GRN;
  if (fcode === 'SAN' || fcode.includes('SAN'))
    return INFRA_CATEGORIES.SAN;
  if (fcode === 'LOK') return INFRA_CATEGORIES.LOK;

  // Then check partial matches
  if (
    fcode.includes('VL') ||
    fcode.includes('VANN') ||
    fcode.includes('VF')
  )
    return INFRA_CATEGORIES.WATER;
  if (fcode.includes('SP') || fcode.includes('SPILLVANN'))
    return INFRA_CATEGORIES.WASTEWATER;
  if (fcode.includes('OV') || fcode.includes('OVERVANN'))
    return INFRA_CATEGORIES.STORMWATER;
  if (fcode.includes('DR') || fcode.includes('DREN'))
    return INFRA_CATEGORIES.DRAINAGE;
  if (fcode.includes('KUM')) return INFRA_CATEGORIES.MANHOLE;
  if (fcode.includes('GAS')) return INFRA_CATEGORIES.GAS;
  if (fcode.includes('EL') || fcode.includes('ELEKTR'))
    return INFRA_CATEGORIES.ELECTRIC;
  if (fcode.includes('TELE') || fcode.includes('TEL'))
    return INFRA_CATEGORIES.TELECOM;
  if (fcode.includes('FJERN')) return INFRA_CATEGORIES.HEATING;

  return INFRA_CATEGORIES.OTHER;
};

const getColorByFCode = (fcode) => {
  // Defensive: ensure fcode is a string
  if (!fcode || typeof fcode !== 'string') return '#808080'; // Default gray for unknown

  // Norwegian infrastructure color system
  const colorMap = FCODE_COLORS;
  // (colorMap is defined above as FCODE_COLORS)

  // Try exact match first
  if (colorMap[fcode]) {
    return colorMap[fcode];
  }

  // Try partial matches for complex codes
  if (fcode.includes('VL') || fcode.includes('VANN'))
    return '#0101FF';
  if (fcode.includes('SP') || fcode.includes('SPILLVANN'))
    return '#02D902';
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

const normalizeFcode = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value);
  return str.trim() === '' ? null : str;
};

const LAYER_HIGHLIGHT_COLORS = [
  '#00E5FF',
  '#FF6B6B',
  '#51CF66',
  '#FFD43B',
  '#845EF7',
  '#FF922B',
  '#20C997',
  '#339AF0',
  '#F06595',
  '#ADB5BD',
];

// SVG shape generators for point markers
const createSvgMarker = (
  category,
  color,
  isHighlighted = false,
  highlightColor = '#00FFFF',
) => {
  // Adjust base sizes per category
  let baseSize;
  if (category === INFRA_CATEGORIES.LOK) {
    baseSize = 8; // Very small dot for LOK so it doesn't hide KUM
  } else if (
    category === INFRA_CATEGORIES.DIV ||
    category === INFRA_CATEGORIES.ANBORING ||
    category === INFRA_CATEGORIES.GRN
  ) {
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
        <line x1="${rectX + 3}" y1="${rectY}" x2="${rectX}" y2="${
          rectY + 3
        }"/>
        <line x1="${rectX + 8}" y1="${rectY}" x2="${rectX}" y2="${
          rectY + 8
        }"/>
        <line x1="${rectX + 13}" y1="${rectY}" x2="${rectX}" y2="${
          rectY + 13
        }"/>
        <line x1="${rectX + 18}" y1="${rectY}" x2="${
          rectX + 5
        }" y2="${rectY + 13}"/>
        <line x1="${rectX + 22}" y1="${rectY + 2}" x2="${
          rectX + 10
        }" y2="${rectY + 14}"/>
        <line x1="${rectX + 22}" y1="${rectY + 7}" x2="${
          rectX + 15
        }" y2="${rectY + 14}"/>
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
      svgPath = `<circle cx="${half}" cy="${half}" r="${
        half - strokeWidth
      }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case INFRA_CATEGORIES.WASTEWATER:
      // Square (spillvann)
      const sqInset = strokeWidth;
      svgPath = `<rect x="${sqInset}" y="${sqInset}" width="${
        size - sqInset * 2
      }" height="${
        size - sqInset * 2
      }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
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
      svgPath = `<polygon points="${half},${strokeWidth} ${
        size - strokeWidth
      },${half} ${half},${
        size - strokeWidth
      } ${strokeWidth},${half}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
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
      ]
        .map((p) => p.join(','))
        .join(' ');
      svgPath = `<polygon points="${hexPoints}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case INFRA_CATEGORIES.GAS:
      // Pentagon (gas)
      const pR = half - strokeWidth;
      const pentPoints = [];
      for (let i = 0; i < 5; i++) {
        const angle = ((i * 72 - 90) * Math.PI) / 180;
        pentPoints.push([
          half + pR * Math.cos(angle),
          half + pR * Math.sin(angle),
        ]);
      }
      svgPath = `<polygon points="${pentPoints
        .map((p) => p.join(','))
        .join(
          ' ',
        )}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case INFRA_CATEGORIES.ELECTRIC:
      // Star/bolt shape (elektrisk)
      const starR = half - strokeWidth;
      const innerR = starR * 0.4;
      const starPoints = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? starR : innerR;
        const angle = ((i * 36 - 90) * Math.PI) / 180;
        starPoints.push([
          half + r * Math.cos(angle),
          half + r * Math.sin(angle),
        ]);
      }
      svgPath = `<polygon points="${starPoints
        .map((p) => p.join(','))
        .join(
          ' ',
        )}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case INFRA_CATEGORIES.TELECOM:
      // Cross/plus (tele)
      const cw = size * 0.3;
      const co = (size - cw) / 2;
      svgPath = `<path d="M${co},${strokeWidth} h${cw} v${
        co - strokeWidth
      } h${co - strokeWidth} v${cw} h-${co - strokeWidth} v${
        co - strokeWidth
      } h-${cw} v-${co - strokeWidth} h-${
        co - strokeWidth
      } v-${cw} h${
        co - strokeWidth
      } z" fill="${fill}" stroke="${stroke}" stroke-width="${
        strokeWidth * 0.7
      }"/>`;
      break;

    case INFRA_CATEGORIES.HEATING:
      // Flame/teardrop shape (fjernvarme)
      svgPath = `<path d="M${half},${strokeWidth} C${
        size - strokeWidth
      },${half} ${size - strokeWidth},${size - strokeWidth} ${half},${
        size - strokeWidth
      } C${strokeWidth},${
        size - strokeWidth
      } ${strokeWidth},${half} ${half},${strokeWidth} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case INFRA_CATEGORIES.SLS_SLU:
      // Black square with vertical cross
      const slsInset = strokeWidth;
      const crossW = 2;
      svgPath = `
        <rect x="${slsInset}" y="${slsInset}" width="${
          size - slsInset * 2
        }" height="${
          size - slsInset * 2
        }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <line x1="${half}" y1="${slsInset + 2}" x2="${half}" y2="${
          size - slsInset - 2
        }" stroke="${stroke}" stroke-width="${crossW}"/>
        <line x1="${slsInset + 2}" y1="${half}" x2="${
          size - slsInset - 2
        }" y2="${half}" stroke="${stroke}" stroke-width="${crossW}"/>`;
      break;

    case INFRA_CATEGORIES.DIV:
      // Small circle (less intrusive)
      svgPath = `<circle cx="${half}" cy="${half}" r="${
        half - strokeWidth
      }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case INFRA_CATEGORIES.ANBORING:
      // Small blue circle like DIV
      svgPath = `<circle cx="${half}" cy="${half}" r="${
        half - strokeWidth
      }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case INFRA_CATEGORIES.KRN:
      // Blue square with diagonal cross
      const krnInset = strokeWidth;
      const diagCrossW = 2;
      svgPath = `
        <rect x="${krnInset}" y="${krnInset}" width="${
          size - krnInset * 2
        }" height="${
          size - krnInset * 2
        }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <line x1="${krnInset + 2}" y1="${krnInset + 2}" x2="${
          size - krnInset - 2
        }" y2="${
          size - krnInset - 2
        }" stroke="${stroke}" stroke-width="${diagCrossW}"/>
        <line x1="${size - krnInset - 2}" y1="${krnInset + 2}" x2="${
          krnInset + 2
        }" y2="${
          size - krnInset - 2
        }" stroke="${stroke}" stroke-width="${diagCrossW}"/>`;
      break;

    case INFRA_CATEGORIES.GRN:
      // Small green circle like DIV
      svgPath = `<circle cx="${half}" cy="${half}" r="${
        half - strokeWidth
      }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case INFRA_CATEGORIES.SAN:
      // Black square with circle inside (same size as SLU)
      const sanInset = strokeWidth;
      const innerCircleR = (size - sanInset * 4) / 2;
      svgPath = `
        <rect x="${sanInset}" y="${sanInset}" width="${
          size - sanInset * 2
        }" height="${
          size - sanInset * 2
        }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <circle cx="${half}" cy="${half}" r="${innerCircleR}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case INFRA_CATEGORIES.LOK:
      // Very small filled circle (kumlokk) - will appear on top of KUM without hiding it
      svgPath = `<circle cx="${half}" cy="${half}" r="${
        half - strokeWidth
      }" fill="${stroke}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    default:
      // Default circle
      svgPath = `<circle cx="${half}" cy="${half}" r="${
        half - strokeWidth
      }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
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
  {
    category: INFRA_CATEGORIES.WATER,
    label: 'Vannledning (VL)',
    color: FCODE_COLORS.VL,
  },
  {
    category: INFRA_CATEGORIES.WASTEWATER,
    label: 'Spillvann (SP)',
    color: FCODE_COLORS.SP,
  },
  {
    category: INFRA_CATEGORIES.STORMWATER,
    label: 'Overvann (OV)',
    color: FCODE_COLORS.OV,
  },
  {
    category: INFRA_CATEGORIES.DRAINAGE,
    label: 'Drenering (DR)',
    color: FCODE_COLORS.DR,
  },
  {
    category: INFRA_CATEGORIES.MANHOLE,
    label: 'Kum (KUM)',
    color: FCODE_COLORS.KUM,
  },
  {
    category: INFRA_CATEGORIES.SLS_SLU,
    label: 'SLS/SLU',
    color: FCODE_COLORS.SLS,
  },
  {
    category: INFRA_CATEGORIES.SAN,
    label: 'SAN',
    color: FCODE_COLORS.SAN,
  },
  {
    category: INFRA_CATEGORIES.DIV,
    label: 'DIV (diverse)',
    color: FCODE_COLORS.DIV,
  },
  {
    category: INFRA_CATEGORIES.ANBORING,
    label: 'Anboring (ANB)',
    color: FCODE_COLORS.ANBORING,
  },
  {
    category: INFRA_CATEGORIES.GROKONSTR,
    label: 'Grøftekonstruksjon',
    color: FCODE_COLORS.GRØKONSTR,
  },
  {
    category: INFRA_CATEGORIES.KRN,
    label: 'Kran (KRN)',
    color: FCODE_COLORS.KRN,
  },
  {
    category: INFRA_CATEGORIES.GRN,
    label: 'Grenpunkt (GRN)',
    color: FCODE_COLORS.GRN,
  },
  {
    category: INFRA_CATEGORIES.LOK,
    label: 'Kumlokk (LOK)',
    color: FCODE_COLORS.LOK,
  },
  {
    category: INFRA_CATEGORIES.OTHER,
    label: 'Annet',
    color: FCODE_COLORS.ANNET,
  },
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
        <line x1="${rectX + 2}" y1="${rectY}" x2="${rectX}" y2="${
          rectY + 2
        }"/>
        <line x1="${rectX + 6}" y1="${rectY}" x2="${rectX}" y2="${
          rectY + 6
        }"/>
        <line x1="${rectX + 10}" y1="${rectY}" x2="${rectX}" y2="${
          rectY + 10
        }"/>
        <line x1="${rectX + 14}" y1="${rectY}" x2="${
          rectX + 4
        }" y2="${rectY + 10}"/>
        <line x1="${rectX + 18}" y1="${rectY + 2}" x2="${
          rectX + 8
        }" y2="${rectY + 12}"/>
      </g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${svgPath}</svg>`;
  }

  let svgPath;

  switch (category) {
    case INFRA_CATEGORIES.WATER:
      svgPath = `<circle cx="${half}" cy="${half}" r="${
        half - strokeWidth
      }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.WASTEWATER:
      const sqInset = strokeWidth;
      svgPath = `<rect x="${sqInset}" y="${sqInset}" width="${
        size - sqInset * 2
      }" height="${
        size - sqInset * 2
      }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.STORMWATER:
      const triTop = strokeWidth;
      const triBottom = size - strokeWidth;
      const triLeft = strokeWidth;
      const triRight = size - strokeWidth;
      svgPath = `<polygon points="${half},${triTop} ${triRight},${triBottom} ${triLeft},${triBottom}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.DRAINAGE:
      svgPath = `<polygon points="${half},${strokeWidth} ${
        size - strokeWidth
      },${half} ${half},${
        size - strokeWidth
      } ${strokeWidth},${half}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
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
      ]
        .map((p) => p.join(','))
        .join(' ');
      svgPath = `<polygon points="${hexPoints}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.GAS:
      const pR = half - strokeWidth;
      const pentPoints = [];
      for (let i = 0; i < 5; i++) {
        const angle = ((i * 72 - 90) * Math.PI) / 180;
        pentPoints.push([
          half + pR * Math.cos(angle),
          half + pR * Math.sin(angle),
        ]);
      }
      svgPath = `<polygon points="${pentPoints
        .map((p) => p.join(','))
        .join(
          ' ',
        )}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.ELECTRIC:
      const starR = half - strokeWidth;
      const innerR = starR * 0.4;
      const starPoints = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? starR : innerR;
        const angle = ((i * 36 - 90) * Math.PI) / 180;
        starPoints.push([
          half + r * Math.cos(angle),
          half + r * Math.sin(angle),
        ]);
      }
      svgPath = `<polygon points="${starPoints
        .map((p) => p.join(','))
        .join(
          ' ',
        )}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.TELECOM:
      const cw = size * 0.3;
      const co = (size - cw) / 2;
      svgPath = `<path d="M${co},${strokeWidth} h${cw} v${
        co - strokeWidth
      } h${co - strokeWidth} v${cw} h-${co - strokeWidth} v${
        co - strokeWidth
      } h-${cw} v-${co - strokeWidth} h-${
        co - strokeWidth
      } v-${cw} h${
        co - strokeWidth
      } z" fill="${fill}" stroke="${stroke}" stroke-width="${
        strokeWidth * 0.7
      }"/>`;
      break;
    case INFRA_CATEGORIES.HEATING:
      svgPath = `<path d="M${half},${strokeWidth} C${
        size - strokeWidth
      },${half} ${size - strokeWidth},${size - strokeWidth} ${half},${
        size - strokeWidth
      } C${strokeWidth},${
        size - strokeWidth
      } ${strokeWidth},${half} ${half},${strokeWidth} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.SLS_SLU:
      const slsInset = strokeWidth;
      const crossW = 1.5;
      svgPath = `
        <rect x="${slsInset}" y="${slsInset}" width="${
          size - slsInset * 2
        }" height="${
          size - slsInset * 2
        }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <line x1="${half}" y1="${slsInset + 1}" x2="${half}" y2="${
          size - slsInset - 1
        }" stroke="${stroke}" stroke-width="${crossW}"/>
        <line x1="${slsInset + 1}" y1="${half}" x2="${
          size - slsInset - 1
        }" y2="${half}" stroke="${stroke}" stroke-width="${crossW}"/>`;
      break;
    case INFRA_CATEGORIES.DIV:
      svgPath = `<circle cx="${half}" cy="${half}" r="${
        half - strokeWidth
      }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.ANBORING:
      svgPath = `<circle cx="${half}" cy="${half}" r="${
        half - strokeWidth
      }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.KRN:
      const krnInset = strokeWidth;
      const diagCrossW = 1.5;
      svgPath = `
        <rect x="${krnInset}" y="${krnInset}" width="${
          size - krnInset * 2
        }" height="${
          size - krnInset * 2
        }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <line x1="${krnInset + 1}" y1="${krnInset + 1}" x2="${
          size - krnInset - 1
        }" y2="${
          size - krnInset - 1
        }" stroke="${stroke}" stroke-width="${diagCrossW}"/>
        <line x1="${size - krnInset - 1}" y1="${krnInset + 1}" x2="${
          krnInset + 1
        }" y2="${
          size - krnInset - 1
        }" stroke="${stroke}" stroke-width="${diagCrossW}"/>`;
      break;
    case INFRA_CATEGORIES.GRN:
      svgPath = `<circle cx="${half}" cy="${half}" r="${
        half - strokeWidth
      }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.SAN:
      const sanInset = strokeWidth;
      const innerCircleR = (size - sanInset * 4) / 2;
      svgPath = `
        <rect x="${sanInset}" y="${sanInset}" width="${
          size - sanInset * 2
        }" height="${
          size - sanInset * 2
        }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <circle cx="${half}" cy="${half}" r="${innerCircleR}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    case INFRA_CATEGORIES.LOK:
      // Small filled circle for legend
      svgPath = `<circle cx="${half}" cy="${half}" r="${
        half - strokeWidth
      }" fill="${stroke}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;
    default:
      svgPath = `<circle cx="${half}" cy="${half}" r="${
        half - strokeWidth
      }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
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
        String(properties[field]).replace(/[^\d.]/g, ''),
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

function BoundsController({
  geoJsonData,
  ignoredFeatureIds,
  fitBoundsKey,
}) {
  const map = useMap();
  const lastFitKeyRef = useRef(null);

  useEffect(() => {
    if (!map || !geoJsonData) return;

    if (fitBoundsKey && lastFitKeyRef.current === fitBoundsKey) {
      return;
    }

    try {
      let boundsData = geoJsonData;

      if (
        ignoredFeatureIds &&
        geoJsonData &&
        Array.isArray(geoJsonData.features)
      ) {
        const filteredFeatures = geoJsonData.features.filter(
          (feature) => {
            const props = feature?.properties || {};
            const geometryType = feature?.geometry?.type;

            const featureId =
              props.featureId ||
              (props.id !== undefined &&
              (geometryType === 'Point' ||
                geometryType === 'MultiPoint')
                ? `punkter-${props.id}`
                : props.id !== undefined &&
                    (geometryType === 'LineString' ||
                      geometryType === 'MultiLineString')
                  ? `ledninger-${props.id}`
                  : null);

            if (!featureId) return true;
            return !ignoredFeatureIds.has(featureId);
          },
        );

        // Avoid empty bounds (fallback to full data)
        if (filteredFeatures.length > 0) {
          boundsData = {
            ...geoJsonData,
            features: filteredFeatures,
          };
        }
      }

      const geoJsonLayer = L.geoJSON(boundsData);
      const bounds = geoJsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 20 });
        if (fitBoundsKey) {
          lastFitKeyRef.current = fitBoundsKey;
        }
      }
    } catch (e) {
      console.warn('Could not fit bounds', e);
    }
  }, [map, geoJsonData, ignoredFeatureIds, fitBoundsKey]);

  return null;
}

function LayerFitBoundsController({ geoJsonData }) {
  const map = useMap();
  const target = useStore((state) => state.ui.layerFitBoundsTarget);
  const clearLayerFitBoundsTarget = useStore(
    (state) => state.clearLayerFitBoundsTarget,
  );

  useEffect(() => {
    if (!map || !geoJsonData || !target?.layerId) return;

    try {
      const features = Array.isArray(geoJsonData.features)
        ? geoJsonData.features.filter(
            (feature) =>
              feature?.properties?._layerId === target.layerId,
          )
        : [];

      if (features.length === 0) return;

      const layerData = {
        type: 'FeatureCollection',
        features,
      };
      const geoJsonLayer = L.geoJSON(layerData);
      const bounds = geoJsonLayer.getBounds();

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 20 });
      }
    } catch (e) {
      console.warn('Could not fit layer bounds', e);
    } finally {
      clearLayerFitBoundsTarget();
    }
  }, [map, geoJsonData, target, clearLayerFitBoundsTarget]);

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

// Clear highlighted feature when clicking on empty map space
function MapClickHandler() {
  const setHighlightedFeature = useStore(
    (state) => state.setHighlightedFeature,
  );
  const highlightedFeatureId = useStore(
    (state) => state.ui.highlightedFeatureId,
  );
  const measureMode = useStore((state) => state.ui.measureMode);

  useMapEvents({
    click: (e) => {
      // Don't handle clicks when measure mode is active
      if (measureMode) return;

      // Only clear if there's a highlighted feature and click wasn't on a layer
      if (highlightedFeatureId && !e.originalEvent._featureClicked) {
        setHighlightedFeature(null);
      }
    },
  });
  return null;
}

// Calculate distance between two lat/lng points in meters
function calculateDistance(p1, p2) {
  const R = 6371000; // Earth radius in meters
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;
  const deltaLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const deltaLng = ((p2.lng - p1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Calculate total distance of measure points
function calculateTotalDistance(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += calculateDistance(points[i - 1], points[i]);
  }
  return total;
}

// Format distance for display
function formatDistance(meters) {
  if (meters < 1) return `${(meters * 100).toFixed(0)} cm`;
  if (meters < 1000) return `${meters.toFixed(2)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

// Measure tool component
function MeasureTool() {
  const map = useMap();
  const measureMode = useStore((state) => state.ui.measureMode);
  const measurePoints = useStore((state) => state.ui.measurePoints);
  const addMeasurePoint = useStore((state) => state.addMeasurePoint);
  const clearMeasurePoints = useStore(
    (state) => state.clearMeasurePoints,
  );
  const toggleMeasureMode = useStore(
    (state) => state.toggleMeasureMode,
  );

  const [hoverPoint, setHoverPoint] = useState(null);

  useMapEvents({
    click: (e) => {
      if (!measureMode) return;

      // Prevent propagation to other click handlers
      e.originalEvent._measureClick = true;

      addMeasurePoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    },

    mousemove: (e) => {
      if (!measureMode) return;
      setHoverPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    },

    mouseout: () => {
      if (!measureMode) return;
      setHoverPoint(null);
    },
  });

  // Change cursor when in measure mode
  useEffect(() => {
    const container = map.getContainer();
    if (measureMode) {
      // Ensure existing popups don't interfere with measuring
      map.closePopup();
      container.style.cursor = 'crosshair';
      container.classList.add('measure-mode');
    } else {
      container.style.cursor = '';
      container.classList.remove('measure-mode');
    }
    return () => {
      container.style.cursor = '';
      container.classList.remove('measure-mode');
    };
  }, [map, measureMode]);

  if (!measureMode) return null;

  const totalDistance = calculateTotalDistance(measurePoints || []);
  const lastPoint = measurePoints?.length
    ? measurePoints[measurePoints.length - 1]
    : null;
  const hoverDistance =
    lastPoint && hoverPoint
      ? calculateDistance(lastPoint, hoverPoint)
      : 0;

  return (
    <>
      {/* Measure points */}
      {(measurePoints || []).map((point, i) => (
        <CircleMarker
          key={`measure-${i}`}
          center={[point.lat, point.lng]}
          radius={6}
          pathOptions={{
            fillColor: i === 0 ? '#22c55e' : '#3b82f6',
            fillOpacity: 1,
            color: 'white',
            weight: 2,
          }}
        >
          <Tooltip permanent direction="top" offset={[0, -10]}>
            <span className="text-xs font-medium">
              {i === 0 ? 'Start' : `Punkt ${i + 1}`}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Measure line */}
      {(measurePoints || []).length >= 2 && (
        <Polyline
          positions={(measurePoints || []).map((p) => [p.lat, p.lng])}
          pathOptions={{
            color: '#3b82f6',
            weight: 3,
            dashArray: '8, 8',
          }}
        />
      )}

      {/* Live preview line from last point to cursor */}
      {measurePoints.length >= 1 && hoverPoint && (
        <>
          <Polyline
            positions={[
              [lastPoint.lat, lastPoint.lng],
              [hoverPoint.lat, hoverPoint.lng],
            ]}
            pathOptions={{
              color: '#3b82f6',
              weight: 2,
              dashArray: '4, 6',
              opacity: 0.8,
            }}
          />
          <CircleMarker
            center={[hoverPoint.lat, hoverPoint.lng]}
            radius={0}
            pathOptions={{ opacity: 0, fillOpacity: 0 }}
          >
            <Tooltip permanent direction="right" offset={[12, 0]}>
              <span className="text-xs font-bold bg-white px-1 rounded">
                {formatDistance(hoverDistance)}
              </span>
            </Tooltip>
          </CircleMarker>
        </>
      )}

      {/* Segment distances */}
      {measurePoints.length >= 2 &&
        measurePoints.slice(1).map((point, i) => {
          const prevPoint = measurePoints[i];
          const midLat = (point.lat + prevPoint.lat) / 2;
          const midLng = (point.lng + prevPoint.lng) / 2;
          const segmentDist = calculateDistance(prevPoint, point);

          return (
            <CircleMarker
              key={`segment-${i}`}
              center={[midLat, midLng]}
              radius={0}
              pathOptions={{ opacity: 0, fillOpacity: 0 }}
            >
              <Tooltip permanent direction="center">
                <span className="text-xs font-bold bg-white px-1 rounded">
                  {formatDistance(segmentDist)}
                </span>
              </Tooltip>
            </CircleMarker>
          );
        })}

      {/* Control panel */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          backgroundColor: 'white',
          padding: '12px 16px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '16px',
        }}
      >
        <div style={{ minWidth: '280px' }}>
          <div className="text-sm">
            <span className="text-gray-600">Total avstand: </span>
            <span className="font-bold text-blue-600">
              {formatDistance(totalDistance)}
            </span>
            <span className="text-gray-400 ml-2">
              ({measurePoints.length}{' '}
              {measurePoints.length === 1 ? 'punkt' : 'punkter'})
            </span>
          </div>

          {measurePoints.length >= 2 && (
            <div
              className="mt-2 text-xs text-gray-700"
              style={{ maxHeight: '110px', overflowY: 'auto' }}
            >
              {measurePoints.slice(1).map((point, i) => {
                const prevPoint = measurePoints[i];
                const segmentDist = calculateDistance(
                  prevPoint,
                  point,
                );
                return (
                  <div
                    key={`seg-list-${i}`}
                    className="flex justify-between gap-4 py-0.5"
                  >
                    <span className="text-gray-500">
                      Linje {i + 1}
                    </span>
                    <span className="font-semibold">
                      {formatDistance(segmentDist)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <button
            onClick={() => clearMeasurePoints()}
            className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            title="Nullstill måling"
          >
            Nullstill
          </button>

          <button
            onClick={() => toggleMeasureMode(false)}
            className="px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors"
            title="Lukk måleverktøy"
          >
            ✕ Lukk
          </button>
        </div>
      </div>
    </>
  );
}

// Button to activate measure tool (positioned on map)
function MeasureToolButton() {
  const measureMode = useStore((state) => state.ui.measureMode);
  const toggleMeasureMode = useStore(
    (state) => state.toggleMeasureMode,
  );

  if (measureMode) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '80px',
        left: '10px',
        zIndex: 1000,
      }}
    >
      <button
        onClick={() => toggleMeasureMode(true)}
        title="Måleverktøy - Mål avstander på kartet"
        style={{
          width: '34px',
          height: '34px',
          backgroundColor: 'white',
          border: '2px solid rgba(0,0,0,0.2)',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 5px rgba(0,0,0,0.15)',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = '#f4f4f4')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = 'white')
        }
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z" />
          <path d="m14.5 12.5 2-2" />
          <path d="m11.5 9.5 2-2" />
          <path d="m8.5 6.5 2-2" />
          <path d="m17.5 15.5 2-2" />
        </svg>
      </button>
    </div>
  );
}

// Invalidate map size when layout changes (sidebar/table toggle)
// Uses multiple mechanisms to ensure proper detection
function MapSizeInvalidator() {
  const map = useMap();

  // Effect 2: Use ResizeObserver on the map container for reliable detection
  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      // Small delay to let the resize settle
      setTimeout(() => {
        map.invalidateSize({ animate: false });
      }, 10);
    });

    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [map]);

  return null;
}

function ZoomToFeatureHandler() {
  const map = useMap();
  const data = useStore((state) => state.data);
  const setHighlightedFeature = useStore(
    (state) => state.setHighlightedFeature,
  );

  useEffect(() => {
    const handleZoomToFeature = (e) => {
      const { x, y, featureId } = e.detail;

      if (x !== undefined && y !== undefined) {
        // Determine source projection from data
        let sourceProj = 'EPSG:4326';
        if (data?.header?.COSYS_EPSG) {
          const epsg = `EPSG:${data.header.COSYS_EPSG}`;
          if (proj4.defs(epsg)) {
            sourceProj = epsg;
          }
        } else if (data?.header?.COSYS) {
          if (
            data.header.COSYS.includes('UTM') &&
            data.header.COSYS.includes('32')
          ) {
            sourceProj = 'EPSG:25832';
          } else if (
            data.header.COSYS.includes('UTM') &&
            data.header.COSYS.includes('33')
          ) {
            sourceProj = 'EPSG:25833';
          }
        }

        // Transform coordinates to WGS84 if needed
        let transformedCoords;
        if (sourceProj === 'EPSG:4326') {
          transformedCoords = [x, y];
        } else {
          try {
            transformedCoords = proj4(sourceProj, 'EPSG:4326', [
              x,
              y,
            ]);
          } catch (err) {
            console.error('Coordinate transformation error:', err);
            transformedCoords = [x, y];
          }
        }

        // Leaflet expects [lat, lng]
        // proj4 returns [lng, lat] for geographic projections
        const [lng, lat] = transformedCoords;

        // Force map to recognize its current size before zooming
        // This is critical when sidebar has just been hidden and map gained width
        map.invalidateSize({ animate: false, pan: false });

        // Wait for DOM to fully update, then force a complete view recalculation
        setTimeout(() => {
          // Invalidate size again
          map.invalidateSize({ animate: false, pan: false });

          // Use setView instead of flyTo - it forces a complete recalculation of center
          // First set the view to force center recalculation
          map.setView([lat, lng], 18, { animate: false });

          // Then optionally animate to it for smooth transition
          setTimeout(() => {
            map.setView([lat, lng], 18, {
              animate: true,
              duration: 0.5,
            });
          }, 50);
        }, 100);

        if (featureId) {
          setHighlightedFeature(featureId);
        }
      }
    };

    window.addEventListener('zoomToFeature', handleZoomToFeature);

    return () => {
      window.removeEventListener(
        'zoomToFeature',
        handleZoomToFeature,
      );
    };
  }, [map, data, setHighlightedFeature]);

  return null;
}

function FeatureHighlighter({ geoJsonData }) {
  const map = useMap();
  const highlightedFeatureId = useStore(
    (state) => state.ui.highlightedFeatureId,
  );
  const mapCenterTarget = useStore(
    (state) => state.ui.mapCenterTarget,
  );
  const isAnalysisOpen = useStore((state) => state.analysis.isOpen);

  useEffect(() => {
    // If analysis is open, let AnalysisZoomHandler handle the zooming
    if (!highlightedFeatureId || !geoJsonData || isAnalysisOpen)
      return;

    // If we have an explicit center/zoom request for this feature, don't override it
    // (FeatureHighlighter uses fitBounds with maxZoom 18 which can fight with setView zoom 21).
    if (mapCenterTarget?.featureId === highlightedFeatureId) return;

    // Find feature in GeoJSON
    // Construct ID to match: ledninger-{id} or punkter-{id}
    const feature = geoJsonData.features.find((f) => {
      const type =
        f.properties.featureType === 'Line' ? 'ledninger' : 'punkter';
      const id = `${type}-${f.properties.id}`;
      return id === highlightedFeatureId;
    });

    if (feature) {
      const layer = L.geoJSON(feature);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
      }
    }
  }, [
    map,
    geoJsonData,
    highlightedFeatureId,
    isAnalysisOpen,
    mapCenterTarget,
  ]);

  return null;
}

function FieldValidationZoomHandler({ geoJsonData }) {
  const map = useMap();
  const filteredFeatureIds = useStore(
    (state) => state.ui.filteredFeatureIds,
  );
  const fieldValidationFilterActive = useStore(
    (state) => state.ui.fieldValidationFilterActive,
  );
  const analysisResults = useStore((state) => state.analysis.results);
  const setAnalysisResults = useStore(
    (state) => state.setAnalysisResults,
  );
  const setAnalysisLayerId = useStore(
    (state) => state.setAnalysisLayerId,
  );
  const setLayerAnalysisResults = useStore(
    (state) => state.setLayerAnalysisResults,
  );
  const toggleAnalysisModal = useStore(
    (state) => state.toggleAnalysisModal,
  );
  const selectAnalysisPipe = useStore(
    (state) => state.selectAnalysisPipe,
  );
  const inclineRequirementMode = useStore(
    (state) => state.settings.inclineRequirementMode,
  );

  useEffect(() => {
    if (
      !map ||
      !geoJsonData ||
      !fieldValidationFilterActive ||
      !filteredFeatureIds ||
      !filteredFeatureIds.size
    ) {
      return;
    }

    try {
      const features = geoJsonData.features.filter((f) => {
        const type =
          f.properties?.featureType === 'Line'
            ? 'ledninger'
            : 'punkter';
        const id = `${type}-${f.properties?.id}`;
        return filteredFeatureIds.has(id);
      });

      if (features.length === 0) return;

      const layer = L.geoJSON({
        type: 'FeatureCollection',
        features,
      });
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
      }
    } catch (e) {
      console.warn('Could not fit bounds for feltvalidering', e);
    }
  }, [
    map,
    geoJsonData,
    filteredFeatureIds,
    fieldValidationFilterActive,
  ]);

  return null;
}

function MapCenterHandler() {
  const map = useMap();
  const data = useStore((state) => state.data);
  const mapCenterTarget = useStore(
    (state) => state.ui.mapCenterTarget,
  );

  useEffect(() => {
    if (!mapCenterTarget || !map) return;

    const { coordinates, zoom } = mapCenterTarget;

    if (
      coordinates &&
      Array.isArray(coordinates) &&
      coordinates.length === 2
    ) {
      // coordinates are [y, x] from GMI (northing, easting)
      // Need to transform from UTM to WGS84
      let sourceProj = 'EPSG:4326';
      if (data?.header?.COSYS_EPSG) {
        const epsg = `EPSG:${data.header.COSYS_EPSG}`;
        if (proj4.defs(epsg)) {
          sourceProj = epsg;
        }
      } else if (data?.header?.COSYS) {
        if (
          data.header.COSYS.includes('UTM') &&
          data.header.COSYS.includes('32')
        ) {
          sourceProj = 'EPSG:25832';
        } else if (
          data.header.COSYS.includes('UTM') &&
          data.header.COSYS.includes('33')
        ) {
          sourceProj = 'EPSG:25833';
        }
      }

      let lat, lng;
      if (sourceProj === 'EPSG:4326') {
        // Already WGS84, coordinates are [lat, lng]
        [lat, lng] = coordinates;
      } else {
        try {
          // coordinates are [y, x] from GMI, need to transform [x, y] (easting, northing)
          const [transformedLng, transformedLat] = proj4(
            sourceProj,
            'EPSG:4326',
            [coordinates[1], coordinates[0]],
          );
          lat = transformedLat;
          lng = transformedLng;
        } catch (e) {
          console.error('Coordinate transform failed:', e);
          // Fallback - try interpreting as [lat, lng]
          [lat, lng] = coordinates;
        }
      }

      // Force map size update before moving
      map.invalidateSize({ animate: false });

      setTimeout(() => {
        map.setView([lat, lng], zoom || 18, {
          animate: true,
          duration: 0.5,
        });
      }, 100);
    }
  }, [map, data, mapCenterTarget]);

  return null;
}

export default function MapInner({ onZoomChange }) {
  const data = useStore((state) => state.data);
  const multiLayerModeEnabled = useStore(
    (state) => state.ui.multiLayerModeEnabled,
  );
  // Use shallow comparison for layers to avoid re-renders on unrelated layer updates
  // Only extract what we need for GeoJSON data: layer data, visibility, and highlight status
  const layers = useStore((state) => state.layers);
  const layerOrder = useStore(
    useShallow((state) => state.layerOrder),
  );

  // Memoize layer data extraction for GeoJSON - only changes when actual data changes
  const layerDataForGeoJson = useMemo(() => {
    if (layerOrder.length === 0) return null;
    return layerOrder
      .map((id) => {
        const layer = layers[id];
        if (!layer) return null;
        return {
          layerId: id,
          data: layer.data,
          visible: layer.visible,
          hiddenCodes: layer.hiddenCodes,
          hiddenTypes: layer.hiddenTypes,
          feltHiddenValues: layer.feltHiddenValues,
        };
      })
      .filter(Boolean);
  }, [layers, layerOrder]);

  // Separate memoization for highlight states (changes more frequently, but shouldn't remount GeoJSON)
  const layerHighlightStates = useMemo(() => {
    const map = new Map();
    layerOrder.forEach((id) => {
      const layer = layers[id];
      if (layer) {
        map.set(id, {
          highlightAll: layer.highlightAll || false,
          color:
            LAYER_HIGHLIGHT_COLORS[
              layerOrder.indexOf(id) % LAYER_HIGHLIGHT_COLORS.length
            ],
        });
      }
    });
    return map;
  }, [layers, layerOrder]);

  const layerHighlightColors = useMemo(() => {
    const map = new Map();
    layerOrder.forEach((id, idx) => {
      map.set(
        id,
        LAYER_HIGHLIGHT_COLORS[idx % LAYER_HIGHLIGHT_COLORS.length],
      );
    });
    return map;
  }, [layerOrder]);
  // Narrow selectors for analysis state to avoid re-renders on unrelated changes
  const analysisIsOpen = useStore((state) => state.analysis.isOpen);
  const analysisSelectedPipeIndex = useStore(
    (state) => state.analysis.selectedPipeIndex,
  );
  const analysisLayerId = useStore((state) => state.analysis.layerId);
  const measureMode = useStore((state) => state.ui.measureMode);
  const addMeasurePoint = useStore((state) => state.addMeasurePoint);
  const highlightedCode = useStore(
    (state) => state.ui.highlightedCode,
  );
  const hiddenCodes = useStore((state) => state.ui.hiddenCodes);
  const highlightedType = useStore(
    (state) => state.ui.highlightedType,
  );
  const highlightedTypeContext = useStore(
    (state) => state.ui.highlightedTypeContext,
  );
  const hiddenTypes = useStore((state) => state.ui.hiddenTypes);
  const highlightedFeatureId = useStore(
    (state) => state.ui.highlightedFeatureId,
  );
  const highlightedFeatureIds = useStore(
    (state) => state.ui.highlightedFeatureIds,
  );
  const filteredFeatureIds = useStore(
    (state) => state.ui.filteredFeatureIds,
  );
  const fieldValidationFilterActive = useStore(
    (state) => state.ui.fieldValidationFilterActive,
  );
  // Felt filter state
  const feltFilterActive = useStore(
    (state) => state.ui.feltFilterActive,
  );
  const feltHiddenValues = useStore(
    (state) => state.ui.feltHiddenValues,
  );
  // Felt highlighting on hover
  const highlightedFeltField = useStore(
    (state) => state.ui.highlightedFeltField,
  );
  const highlightedFeltValue = useStore(
    (state) => state.ui.highlightedFeltValue,
  );
  const highlightedFeltObjectType = useStore(
    (state) => state.ui.highlightedFeltObjectType,
  );

  const outlierResults = useStore((state) => state.outliers.results);
  const hideOutliers = useStore(
    (state) => state.outliers.hideOutliers,
  );
  const setActiveViewTab = useStore(
    (state) => state.setActiveViewTab,
  );
  const setSelected3DObject = useStore(
    (state) => state.setSelected3DObject,
  );
  const mapBaseLayer = useStore(
    (state) => state.ui.mapBaseLayer || 'Kartverket Topo',
  );
  const mapOverlayVisibility = useStore(
    (state) =>
      state.ui.mapOverlayVisibility || {
        data: true,
        geminiWms: true,
        eiendomsgrenser: true,
      },
  );
  const setMapBaseLayer = useStore((state) => state.setMapBaseLayer);
  const setMapOverlayVisibility = useStore(
    (state) => state.setMapOverlayVisibility,
  );
  const toggleCustomWmsEnabled = useStore(
    (state) => state.toggleCustomWmsEnabled,
  );
  const openDataInspector = useStore(
    (state) => state.openDataInspector,
  );
  const analysisResults = useStore((state) => state.analysis.results);
  const setAnalysisResults = useStore(
    (state) => state.setAnalysisResults,
  );
  const setLayerAnalysisResults = useStore(
    (state) => state.setLayerAnalysisResults,
  );
  const setAnalysisLayerId = useStore(
    (state) => state.setAnalysisLayerId,
  );
  const toggleAnalysisModal = useStore(
    (state) => state.toggleAnalysisModal,
  );
  const selectAnalysisPipe = useStore(
    (state) => state.selectAnalysisPipe,
  );
  const inclineRequirementMode = useStore(
    (state) => state.settings.inclineRequirementMode,
  );

  // Custom WMS layer configuration (credentials only in memory)
  const customWmsConfig = useStore((state) => state.customWmsConfig);

  // Handle "Vis i 3D" button clicks in popups
  useEffect(() => {
    const handleVisI3D = (e) => {
      const btn = e.target.closest('.vis-i-3d-btn');
      if (btn) {
        const featureType = btn.dataset.featureType;
        const index = parseInt(btn.dataset.index, 10);
        const layerId = btn.dataset.layerId || null;

        // Switch to 3D view
        setActiveViewTab('3d');

        // Set selected object in 3D view
        if (setSelected3DObject) {
          setSelected3DObject({
            type: featureType === 'Point' ? 'point' : 'line',
            index: index,
            layerId: layerId || null,
          });
        }
      }
    };

    document.addEventListener('click', handleVisI3D);
    return () => document.removeEventListener('click', handleVisI3D);
  }, [setActiveViewTab, setSelected3DObject]);

  // Handle "Inspiser data" button clicks in popups
  useEffect(() => {
    const handleInspectData = (e) => {
      const btn = e.target.closest('.inspect-data-btn');
      if (btn) {
        const featureType = btn.dataset.featureType;
        const index = parseInt(btn.dataset.index, 10);
        const layerId = btn.dataset.layerId || null;

        if (!Number.isNaN(index)) {
          openDataInspector({
            type: featureType === 'Point' ? 'point' : 'line',
            index,
            layerId,
          });
        }
      }
    };

    document.addEventListener('click', handleInspectData);
    return () =>
      document.removeEventListener('click', handleInspectData);
  }, [openDataInspector]);

  // Handle "Vis profilanalyse" button clicks in popups
  useEffect(() => {
    const handleShowProfile = (e) => {
      const btn = e.target.closest('.show-profile-btn');
      if (btn) {
        const featureType = btn.dataset.featureType;
        const index = parseInt(btn.dataset.index, 10);
        const layerId = btn.dataset.layerId || null;

        if (featureType !== 'Line' || Number.isNaN(index)) return;

        const layerData = layerId ? layers[layerId]?.data : data;
        const layerResults = layerId
          ? layers[layerId]?.analysis?.results
          : analysisResults;

        if (
          (!layerResults || layerResults.length === 0) &&
          layerData
        ) {
          const results = analyzeIncline(layerData, {
            minInclineMode: inclineRequirementMode,
          });
          if (layerId) {
            setLayerAnalysisResults(layerId, results);
          }
          setAnalysisResults(results);
        } else if (layerResults) {
          setAnalysisResults(layerResults);
        }

        setAnalysisLayerId(layerId || null);
        toggleAnalysisModal(true);
        selectAnalysisPipe(index, layerId || null);
      }
    };

    document.addEventListener('click', handleShowProfile);
    return () =>
      document.removeEventListener('click', handleShowProfile);
  }, [
    analysisResults,
    data,
    layers,
    inclineRequirementMode,
    setAnalysisResults,
    setLayerAnalysisResults,
    setAnalysisLayerId,
    toggleAnalysisModal,
    selectAnalysisPipe,
  ]);

  // Build set of outlier feature IDs for filtering
  const outlierFeatureIds = useMemo(() => {
    if (!outlierResults || !hideOutliers) return null;
    return new Set(outlierResults.outliers.map((o) => o.featureId));
  }, [outlierResults, hideOutliers]);

  // Build set of outlier feature IDs for bounds (always ignore for fitBounds)
  const outlierFeatureIdsForBounds = useMemo(() => {
    if (!outlierResults || !Array.isArray(outlierResults.outliers))
      return null;
    if (outlierResults.outliers.length === 0) return null;
    return new Set(outlierResults.outliers.map((o) => o.featureId));
  }, [outlierResults]);

  const geoJsonData = useMemo(() => {
    // Support both legacy single-data mode and multi-layer mode
    const isMultiLayerMode =
      layerDataForGeoJson && layerDataForGeoJson.length > 0;

    // Collect data sources: either layers or legacy single data
    const dataSources = [];

    if (isMultiLayerMode) {
      // Multi-layer mode: use pre-extracted layer data (avoids closure over full layers object)
      for (const layerInfo of layerDataForGeoJson) {
        if (!layerInfo.visible || !layerInfo.data) continue;
        dataSources.push({
          layerId: layerInfo.layerId,
          data: layerInfo.data,
          hiddenCodes: layerInfo.hiddenCodes || [],
          hiddenTypes: layerInfo.hiddenTypes || [],
          feltHiddenValues: layerInfo.feltHiddenValues || [],
        });
      }
    } else if (data) {
      // Legacy single-file mode
      dataSources.push({
        layerId: null,
        data,
        opacity: 1,
        hiddenCodes: [],
        hiddenTypes: [],
        feltHiddenValues: [],
      });
    }

    if (dataSources.length === 0) {
      // Return empty FeatureCollection instead of null to keep map visible
      return { type: 'FeatureCollection', features: [] };
    }

    const features = [];

    // Process each data source
    for (const source of dataSources) {
      const { points, lines, header } = source.data;
      const layerId = source.layerId;

      // Determine source projection
      let sourceProj = 'EPSG:4326'; // Default to WGS84
      if (header?.COSYS_EPSG) {
        const epsg = `EPSG:${header.COSYS_EPSG}`;
        if (proj4.defs(epsg)) {
          sourceProj = epsg;
        } else {
          console.warn(
            `Unknown EPSG code: ${header.COSYS_EPSG}, assuming raw coordinates are compatible or WGS84`,
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
            transform(c.x, c.y),
          );
          features.push({
            type: 'Feature',
            properties: {
              ...line.attributes,
              id: idx,
              featureType: 'Line',
              _layerId: layerId,
              _layerHiddenCodes: source.hiddenCodes,
              _layerHiddenTypes: source.hiddenTypes,
              _layerFeltHiddenValues: source.feltHiddenValues,
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
              _layerId: layerId,
              _layerHiddenCodes: source.hiddenCodes,
              _layerHiddenTypes: source.hiddenTypes,
              _layerFeltHiddenValues: source.feltHiddenValues,
            },
            geometry: {
              type: 'Point',
              coordinates: coords,
            },
          });
        }
      });
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  }, [data, layerDataForGeoJson]);

  // Stable key for GeoJSON - only changes when actual data structure changes, not style/visibility
  // This prevents expensive remounting of the entire GeoJSON layer
  const geoJsonDataKey = useMemo(() => {
    if (layerOrder.length > 0) {
      return layerOrder
        .filter((id) => layers[id]?.data && layers[id]?.visible)
        .map((id) => {
          const layerData = layers[id]?.data;
          const headerName = layerData?.header?.filename || '';
          const pointsCount = layerData?.points?.length || 0;
          const linesCount = layerData?.lines?.length || 0;
          return `${id}:${headerName}:${pointsCount}:${linesCount}`;
        })
        .join('|');
    }

    if (!data) return '';
    const headerName = data?.header?.filename || '';
    const pointsCount = data?.points?.length || 0;
    const linesCount = data?.lines?.length || 0;
    return `single:${headerName}:${pointsCount}:${linesCount}`;
  }, [data, layers, layerOrder]);

  const fitBoundsKey = useMemo(() => {
    if (layerOrder.length > 0) {
      return layerOrder
        .filter((id) => layers[id]?.data)
        .map((id) => {
          const layerData = layers[id]?.data;
          const headerName = layerData?.header?.filename || '';
          const pointsCount = layerData?.points?.length || 0;
          const linesCount = layerData?.lines?.length || 0;
          return `${id}:${headerName}:${pointsCount}:${linesCount}`;
        })
        .join('|');
    }

    if (!data) return '';
    const headerName = data?.header?.filename || '';
    const pointsCount = data?.points?.length || 0;
    const linesCount = data?.lines?.length || 0;
    return `single:${headerName}:${pointsCount}:${linesCount}`;
  }, [data, layers, layerOrder]);

  // Use store-level map update nonce to trigger GeoJSON remounts when filters/visibility change
  const mapUpdateNonce = useStore((state) => state.ui.mapUpdateNonce);

  // Include highlighted feature IDs content (not just size) so single-item hover
  // updates trigger immediate style refresh when moving between rows.
  const highlightedFeatureIdsKey = useMemo(() => {
    if (!highlightedFeatureIds || highlightedFeatureIds.size === 0)
      return '';

    const ids = Array.from(highlightedFeatureIds);
    if (ids.length <= 32) return ids.join(',');

    // Keep key bounded for very large sets while still changing on content.
    return `${ids.length}:${ids.slice(0, 32).join(',')}`;
  }, [highlightedFeatureIds]);

  // Compute a style version key that changes only when styles need to update
  // This replaces the complex inline key computation
  const styleVersionKey = useMemo(() => {
    const parts = [
      hiddenCodes.join(','),
      highlightedCode || '',
      hiddenTypes.map((ht) => `${ht.type}:${ht.code}`).join(';'),
      highlightedType || '',
      highlightedTypeContext || '',
      highlightedFeatureId || '',
      highlightedFeatureIdsKey,
      analysisIsOpen ? `open-${analysisSelectedPipeIndex}` : 'closed',
      filteredFeatureIds ? filteredFeatureIds.size : 0,
      outlierFeatureIds ? outlierFeatureIds.size : 0,
      feltFilterActive ? 1 : 0,
      feltHiddenValues.length,
      highlightedFeltField || '',
      highlightedFeltValue || '',
      highlightedFeltObjectType || '',
      fieldValidationFilterActive ? 1 : 0,
      measureMode ? 1 : 0,
      // Layer highlight states
      [...layerHighlightStates.entries()]
        .map(([id, s]) => `${id}:${s.highlightAll ? 1 : 0}`)
        .join(';'),
      mapUpdateNonce,
    ];
    return parts.join('|');
  }, [
    hiddenCodes,
    highlightedCode,
    hiddenTypes,
    highlightedType,
    highlightedTypeContext,
    highlightedFeatureId,
    highlightedFeatureIdsKey,
    analysisIsOpen,
    analysisSelectedPipeIndex,
    filteredFeatureIds,
    outlierFeatureIds,
    feltFilterActive,
    feltHiddenValues.length,
    highlightedFeltField,
    highlightedFeltValue,
    highlightedFeltObjectType,
    fieldValidationFilterActive,
    measureMode,
    layerHighlightStates,
    mapUpdateNonce,
  ]);

  // Check if we have any data to render - show map even with empty features if layers exist
  const hasData =
    data || layerOrder.length > 0 || multiLayerModeEnabled;

  // Memoized helper to check if feature is hidden by felt filter
  const isHiddenByFeltFilter = useCallback(
    (feature, objectType) => {
      const props = feature.properties || {};

      // Check per-layer felt hidden values attached to feature properties
      const layerFeltHidden = props._layerFeltHiddenValues || [];
      if (
        Array.isArray(layerFeltHidden) &&
        layerFeltHidden.length > 0
      ) {
        const match = layerFeltHidden.some((hidden) => {
          if (hidden.objectType !== objectType) return false;
          const featureValue = props[hidden.fieldName];
          const normalizedFeatureValue =
            featureValue === null ||
            featureValue === undefined ||
            featureValue === ''
              ? '(Mangler)'
              : String(featureValue);
          return normalizedFeatureValue === hidden.value;
        });
        if (match) return true;
      }

      // Fall back to global felt filter when active
      if (!feltFilterActive || feltHiddenValues.length === 0)
        return false;

      return feltHiddenValues.some((hidden) => {
        if (hidden.objectType !== objectType) return false;
        const featureValue = props[hidden.fieldName];
        const normalizedFeatureValue =
          featureValue === null ||
          featureValue === undefined ||
          featureValue === ''
            ? '(Mangler)'
            : String(featureValue);
        return normalizedFeatureValue === hidden.value;
      });
    },
    [feltFilterActive, feltHiddenValues],
  );

  // Memoized helper to check if feature is highlighted by Felt hover
  const isHighlightedByFeltHover = useCallback(
    (feature, objectType) => {
      if (!highlightedFeltField || !highlightedFeltValue)
        return false;
      if (highlightedFeltObjectType !== objectType) return false;
      const props = feature.properties || {};
      const featureValue = props[highlightedFeltField];
      // Handle null/undefined values
      const normalizedFeatureValue =
        featureValue === null ||
        featureValue === undefined ||
        featureValue === ''
          ? '(Mangler)'
          : String(featureValue);
      return normalizedFeatureValue === highlightedFeltValue;
    },
    [
      highlightedFeltField,
      highlightedFeltValue,
      highlightedFeltObjectType,
    ],
  );

  const getFeatureIds = useCallback((feature, objectType) => {
    const props = feature.properties || {};
    const id = props.id;
    const layerId = props._layerId || null;
    const prefix = objectType === 'points' ? 'punkter' : 'ledninger';
    const baseId = id !== undefined ? `${prefix}-${id}` : null;
    const layeredId =
      layerId && id !== undefined
        ? `${prefix}-${layerId}-${id}`
        : baseId;
    return { id, layerId, baseId, layeredId };
  }, []);

  const setHasFeatureId = useCallback((set, layeredId, baseId) => {
    if (!set || !set.has) return false;
    if (layeredId && set.has(layeredId)) return true;
    if (baseId && set.has(baseId)) return true;
    return false;
  }, []);

  // Memoized lineStyle function - only recreated when its dependencies change
  const lineStyle = useCallback(
    (feature) => {
      const fcode = normalizeFcode(feature.properties?.S_FCODE);
      const typeVal = feature.properties?.Type || '(Mangler Type)';
      const { baseId, layeredId, layerId } = getFeatureIds(
        feature,
        'lines',
      );
      const featureId = layeredId;
      const layerHiddenCodes =
        feature.properties?._layerHiddenCodes || [];
      const layerHiddenTypes =
        feature.properties?._layerHiddenTypes || [];
      // Use pre-computed layer highlight states to avoid closure over entire layers object
      const layerState = layerId
        ? layerHighlightStates.get(layerId)
        : null;
      const layerHighlightActive = layerState?.highlightAll === true;
      const layerHighlightColor = layerState?.color || '#00FFFF';

      // When field validation filter is active, ignore other filters
      let isHidden = false;
      if (!fieldValidationFilterActive) {
        if (feltFilterActive) {
          isHidden = isHiddenByFeltFilter(feature, 'lines');
        } else {
          // Check both global and per-layer hidden codes
          const globalHiddenByCode = hiddenCodes.includes(fcode);
          const layerHiddenByCode = layerHiddenCodes.includes(fcode);
          const isHiddenByCode =
            globalHiddenByCode || layerHiddenByCode;

          // Check if this specific type+code combination is hidden (global or layer)
          const globalHiddenByType = hiddenTypes.some(
            (ht) =>
              ht.type === typeVal &&
              (ht.code === null || ht.code === fcode),
          );
          const layerHiddenByType = layerHiddenTypes.some(
            (ht) =>
              ht.type === typeVal &&
              (ht.code === null || ht.code === fcode),
          );
          const isHiddenByType =
            globalHiddenByType || layerHiddenByType;
          isHidden = isHiddenByCode || isHiddenByType;
        }
      }

      const isHighlightedByCode = highlightedCode === fcode;
      // Type highlighting should respect the code context if one is set
      const isHighlightedByType =
        highlightedType === typeVal &&
        (highlightedTypeContext === null ||
          highlightedTypeContext === fcode);
      const isHighlightedByFeature =
        featureId &&
        (highlightedFeatureId === featureId ||
          highlightedFeatureId === baseId);
      const isHighlightedByFeatures =
        featureId &&
        highlightedFeatureIds &&
        highlightedFeatureIds.has &&
        setHasFeatureId(highlightedFeatureIds, featureId, baseId);
      // Felt (field value) highlighting on hover
      const isHighlightedByFelt = isHighlightedByFeltHover(
        feature,
        'lines',
      );
      const hasOtherHighlight =
        isHighlightedByCode ||
        isHighlightedByType ||
        isHighlightedByFeature ||
        isHighlightedByFeatures ||
        isHighlightedByFelt;
      const isHighlighted = hasOtherHighlight || layerHighlightActive;

      // Filtered View Logic (Missing Fields Report)
      const isFilteredOut =
        filteredFeatureIds &&
        featureId &&
        filteredFeatureIds.has &&
        !setHasFeatureId(filteredFeatureIds, featureId, baseId);

      // Outlier filtering
      const isOutlier =
        !fieldValidationFilterActive &&
        outlierFeatureIds &&
        featureId &&
        setHasFeatureId(outlierFeatureIds, featureId, baseId);

      if (isHidden || isFilteredOut || isOutlier) {
        return {
          opacity: 0,
          weight: 0,
          fillOpacity: 0,
          interactive: false,
        };
      }

      // Analysis Mode Highlighting
      if (analysisIsOpen && analysisSelectedPipeIndex !== null) {
        // Match by ID (we added 'id' property in geoJsonData creation which corresponds to index)
        const isSelected =
          feature.properties.id === analysisSelectedPipeIndex &&
          feature.properties.featureType === 'Line' &&
          (!analysisLayerId ||
            feature.properties._layerId === analysisLayerId);

        if (
          analysisLayerId &&
          feature.properties._layerId !== analysisLayerId
        ) {
          return {
            color: getColorByFCode(fcode),
            weight: getLineWeight(feature.properties),
            opacity: 0.9,
            dashArray: fcode && fcode.includes('DR') ? '5, 5' : null,
          };
        }

        if (isSelected) {
          return {
            color: getColorByFCode(fcode), // Keep original color
            weight: 8, // Thicker
            opacity: 1.0,
            dashArray: null,
          };
        } else {
          return {
            color: getColorByFCode(fcode),
            weight: 2,
            opacity: 0.3, // Fade out but keep visible
            dashArray: null,
          };
        }
      }

      const color = isHighlighted
        ? layerHighlightActive && !hasOtherHighlight
          ? layerHighlightColor
          : '#00FFFF'
        : getColorByFCode(fcode);
      const baseWeight = getLineWeight(feature.properties);
      const weight = isHighlighted ? baseWeight + 4 : baseWeight;
      const opacity = isHighlighted ? 1 : 0.9;

      return {
        color: color,
        weight: weight,
        opacity: opacity,
        dashArray: fcode && fcode.includes('DR') ? '5, 5' : null,
        shadowBlur: isHighlighted ? 10 : 0,
      };
    },
    [
      layerHighlightStates,
      fieldValidationFilterActive,
      feltFilterActive,
      isHiddenByFeltFilter,
      hiddenCodes,
      hiddenTypes,
      highlightedCode,
      highlightedType,
      highlightedTypeContext,
      highlightedFeatureId,
      highlightedFeatureIds,
      isHighlightedByFeltHover,
      filteredFeatureIds,
      outlierFeatureIds,
      analysisIsOpen,
      analysisSelectedPipeIndex,
      analysisLayerId,
      getFeatureIds,
      setHasFeatureId,
    ],
  );

  // Memoized pointToLayer function
  const pointToLayer = useCallback(
    (feature, latlng) => {
      const fcode = normalizeFcode(feature.properties?.S_FCODE);
      const typeVal = feature.properties?.Type || '(Mangler Type)';
      const { baseId, layeredId, layerId } = getFeatureIds(
        feature,
        'points',
      );
      const featureId = layeredId;
      const layerHiddenCodes =
        feature.properties?._layerHiddenCodes || [];
      const layerHiddenTypes =
        feature.properties?._layerHiddenTypes || [];
      // Use pre-computed layer highlight states to avoid closure over entire layers object
      const layerState = layerId
        ? layerHighlightStates.get(layerId)
        : null;
      const layerHighlightActive = layerState?.highlightAll === true;
      const layerHighlightColor = layerState?.color || '#00FFFF';

      // When field validation filter is active, ignore other filters
      let isHidden = false;
      if (!fieldValidationFilterActive) {
        if (feltFilterActive) {
          isHidden = isHiddenByFeltFilter(feature, 'points');
        } else {
          // Check both global and per-layer hidden codes
          const globalHiddenByCode = hiddenCodes.includes(fcode);
          const layerHiddenByCode = layerHiddenCodes.includes(fcode);
          const isHiddenByCode =
            globalHiddenByCode || layerHiddenByCode;

          // Check if this specific type+code combination is hidden (global or layer)
          const globalHiddenByType = hiddenTypes.some(
            (ht) =>
              ht.type === typeVal &&
              (ht.code === null || ht.code === fcode),
          );
          const layerHiddenByType = layerHiddenTypes.some(
            (ht) =>
              ht.type === typeVal &&
              (ht.code === null || ht.code === fcode),
          );
          const isHiddenByType =
            globalHiddenByType || layerHiddenByType;
          isHidden = isHiddenByCode || isHiddenByType;
        }
      }

      const isHighlightedByCode = highlightedCode === fcode;
      // Type highlighting should respect the code context if one is set
      const isHighlightedByType =
        highlightedType === typeVal &&
        (highlightedTypeContext === null ||
          highlightedTypeContext === fcode);
      const isHighlightedByFeature =
        featureId &&
        (highlightedFeatureId === featureId ||
          highlightedFeatureId === baseId);
      const isHighlightedByFeatures =
        featureId &&
        highlightedFeatureIds &&
        highlightedFeatureIds.has &&
        setHasFeatureId(highlightedFeatureIds, featureId, baseId);
      // Felt (field value) highlighting on hover
      const isHighlightedByFelt = isHighlightedByFeltHover(
        feature,
        'points',
      );
      const hasOtherHighlight =
        isHighlightedByCode ||
        isHighlightedByType ||
        isHighlightedByFeature ||
        isHighlightedByFeatures ||
        isHighlightedByFelt;
      const isHighlighted = hasOtherHighlight || layerHighlightActive;

      // Filtered View Logic (Missing Fields Report)
      const isFilteredOut =
        filteredFeatureIds &&
        featureId &&
        filteredFeatureIds.has &&
        !setHasFeatureId(filteredFeatureIds, featureId, baseId);

      // Outlier filtering
      const isOutlier =
        !fieldValidationFilterActive &&
        outlierFeatureIds &&
        featureId &&
        setHasFeatureId(outlierFeatureIds, featureId, baseId);

      if (isHidden || isFilteredOut || isOutlier) {
        // Return a dummy marker that is invisible
        return L.marker(latlng, {
          opacity: 0,
          interactive: false,
        });
      }

      const color = getColorByFCode(fcode);
      const category = getCategoryByFCode(fcode);
      const icon = createSvgMarker(
        category,
        color,
        isHighlighted,
        layerHighlightActive && !hasOtherHighlight
          ? layerHighlightColor
          : '#00FFFF',
      );

      return L.marker(latlng, { icon });
    },
    [
      layerHighlightStates,
      fieldValidationFilterActive,
      feltFilterActive,
      isHiddenByFeltFilter,
      hiddenCodes,
      hiddenTypes,
      highlightedCode,
      highlightedType,
      highlightedTypeContext,
      highlightedFeatureId,
      highlightedFeatureIds,
      isHighlightedByFeltHover,
      filteredFeatureIds,
      outlierFeatureIds,
      getFeatureIds,
      setHasFeatureId,
    ],
  );

  // Memoized onEachFeature function
  const onEachFeature = useCallback(
    (feature, layer) => {
      // If hidden by code, type, or felt filter, don't bind popup or do anything
      const fcode = normalizeFcode(feature.properties?.S_FCODE);
      const typeVal = feature.properties?.Type || '(Mangler Type)';
      const objectType =
        feature.properties?.featureType === 'Point'
          ? 'points'
          : 'lines';
      const { baseId, layeredId, layerId } = getFeatureIds(
        feature,
        objectType,
      );
      const featureId = layeredId;

      // Check felt filter or tema filter based on what's active
      let isHidden;
      if (feltFilterActive) {
        isHidden = isHiddenByFeltFilter(feature, objectType);
      } else {
        const isHiddenByType = hiddenTypes.some(
          (ht) =>
            ht.type === typeVal &&
            (ht.code === null || ht.code === fcode),
        );
        isHidden = hiddenCodes.includes(fcode) || isHiddenByType;
      }

      if (isHidden) {
        return;
      }

      // When measure tool is active: disable popups and route clicks to measuring
      if (measureMode) {
        layer.off('click');
        layer.on('click', (e) => {
          if (e.originalEvent) {
            e.originalEvent._measureClick = true;
            e.originalEvent._featureClicked = true;
          }

          addMeasurePoint({
            lat: e.latlng.lat,
            lng: e.latlng.lng,
          });

          // Prevent any default interaction/popup behavior
          if (e.originalEvent) {
            L.DomEvent.stopPropagation(e.originalEvent);
            L.DomEvent.preventDefault(e.originalEvent);
          }
        });

        return;
      }

      // Mark click events on features so MapClickHandler doesn't clear the highlight
      layer.on('click', (e) => {
        if (e.originalEvent) {
          e.originalEvent._featureClicked = true;
        }
      });

      if (feature.properties) {
        const props = feature.properties;
        const color = getColorByFCode(fcode);
        const featureId =
          props.featureType === 'Point'
            ? props._layerId
              ? `punkter-${props._layerId}-${props.id}`
              : `punkter-${props.id}`
            : props._layerId
              ? `ledninger-${props._layerId}-${props.id}`
              : `ledninger-${props.id}`;

        let content = `<div class="text-[11px] leading-tight max-h-72 flex flex-col gap-1 p-1">`;
        content += `<div class="font-semibold flex items-center gap-1 whitespace-nowrap">`;
        content += `<span>Type:</span><span>${props.featureType}</span>`;
        if (fcode) {
          content += `<span class="text-gray-400">•</span><span>Code:</span><span style="color: ${color}; font-weight: 700;">${fcode}</span>`;
        }
        content += `</div>`;

        content +=
          '<div class="mt-1 border-t pt-1 flex-1 overflow-auto">';
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
        content += '</div>';

        // Add "Vis i 3D" button
        content += `<div class="mt-1 pt-2 border-t grid grid-cols-2 gap-2">
        <button 
          class="vis-i-3d-btn px-2 py-1 text-[11px] bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          data-feature-id="${featureId}"
          data-feature-type="${props.featureType}"
          data-index="${props.id}"
          data-layer-id="${props._layerId || ''}"
        >
          Vis i 3D
        </button>
        <button 
          class="inspect-data-btn px-2 py-1 text-[11px] bg-gray-700 hover:bg-gray-800 text-white rounded transition-colors"
          data-feature-id="${featureId}"
          data-feature-type="${props.featureType}"
          data-index="${props.id}"
          data-layer-id="${props._layerId || ''}"
        >
          Inspiser data
        </button>
      `;

        if (props.featureType === 'Line') {
          content += `
        <button 
          class="show-profile-btn col-span-2 px-2 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
          data-feature-id="${featureId}"
          data-feature-type="${props.featureType}"
          data-index="${props.id}"
          data-layer-id="${props._layerId || ''}"
        >
          Vis profilanalyse
        </button>`;
        }

        content += `</div>`;
        content += '</div>';
        layer.bindPopup(content);
      }
    },
    [
      feltFilterActive,
      isHiddenByFeltFilter,
      hiddenTypes,
      hiddenCodes,
      measureMode,
      addMeasurePoint,
      getFeatureIds,
    ],
  );

  // Early return AFTER all hooks
  if (!hasData) return null;

  return (
    <MapContainer
      center={[59.9139, 10.7522]}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
      maxZoom={25} // Allow higher zoom levels globally
    >
      <LayersControl
        key={`layers-control-${customWmsConfig?.url ?? 'none'}`}
        position="topright"
      >
        <LayersControl.BaseLayer
          checked={mapBaseLayer === 'Kartverket Topo'}
          name="Kartverket Topo"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
            url="https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png"
            maxZoom={25}
            maxNativeZoom={18}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer
          checked={mapBaseLayer === 'Kartverket Gråtone'}
          name="Kartverket Gråtone"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
            url="https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png"
            maxZoom={25}
            maxNativeZoom={18}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer
          checked={mapBaseLayer === 'OpenStreetMap'}
          name="OpenStreetMap"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={25}
            maxNativeZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer
          checked={mapBaseLayer === 'Ingen'}
          name="Ingen"
        >
          <TileLayer
            url="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect width='256' height='256' fill='%23f3f4f6'/></svg>"
            tileSize={256}
            maxZoom={25}
            maxNativeZoom={25}
          />
        </LayersControl.BaseLayer>

        <LayersControl.Overlay
          checked={mapOverlayVisibility.data !== false}
          name="Data"
        >
          <GeoJSON
            key={`geojson-${geoJsonDataKey}-${styleVersionKey}`}
            data={geoJsonData}
            style={lineStyle}
            pointToLayer={pointToLayer}
            onEachFeature={onEachFeature}
          />
        </LayersControl.Overlay>

        {customWmsConfig?.url &&
          customWmsConfig?.username &&
          customWmsConfig?.password && (
            <LayersControl.Overlay
              checked={mapOverlayVisibility.geminiWms !== false}
              name="Gemini WMS"
            >
              <AuthenticatedWmsLayer
                key={`wms-${customWmsConfig.url ?? 'none'}-${customWmsConfig.username ?? ''}-${customWmsConfig.layers ?? ''}`}
                url={customWmsConfig.url}
                username={customWmsConfig.username}
                password={customWmsConfig.password}
                layers={customWmsConfig.layers}
                opacity={1}
                zIndex={450}
                maxZoom={25}
                maxNativeZoom={25}
              />
            </LayersControl.Overlay>
          )}

        <LayersControl.Overlay
          checked={mapOverlayVisibility.eiendomsgrenser !== false}
          name="Eiendomsgrenser"
        >
          <WMSTileLayer
            url="https://wms.geonorge.no/skwms1/wms.matrikkel"
            layers="eiendomsgrense,eiendoms_id"
            format="image/png"
            transparent
            version="1.3.0"
            minZoom={15}
            maxZoom={25}
            attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
          />
        </LayersControl.Overlay>
      </LayersControl>

      <LayerControlPersistence
        onBaseLayerChange={setMapBaseLayer}
        onOverlayChange={setMapOverlayVisibility}
        onGeminiWmsToggle={toggleCustomWmsEnabled}
      />

      {/* Force immediate refresh of AuthenticatedWmsLayer when config changes */}
      <WmsLayerRefresher customWmsConfig={customWmsConfig} />

      <BoundsController
        geoJsonData={geoJsonData}
        ignoredFeatureIds={outlierFeatureIdsForBounds}
        fitBoundsKey={fitBoundsKey}
      />
      <LayerFitBoundsController geoJsonData={geoJsonData} />
      <FeatureHighlighter geoJsonData={geoJsonData} />
      <FieldValidationZoomHandler geoJsonData={geoJsonData} />
      {onZoomChange && <ZoomHandler onZoomChange={onZoomChange} />}
      <MapSizeInvalidator />
      <ZoomToFeatureHandler />
      <MapCenterHandler />
      <MapClickHandler />
      <MeasureTool />
      <MeasureToolButton />
      <AnalysisPointsLayer />
      <AnalysisZoomHandler />
    </MapContainer>
  );
}

function AnalysisPointsLayer() {
  const analysisIsOpen = useStore((state) => state.analysis.isOpen);
  const analysisSelectedPipeIndex = useStore(
    (state) => state.analysis.selectedPipeIndex,
  );
  const analysisLayerId = useStore((state) => state.analysis.layerId);
  const data = useStore((state) => state.data);

  const { points, pipeColor, lineCoords, sourceProj } =
    useMemo(() => {
      // Use getState() to read layers only when needed
      const layers = useStore.getState().layers;
      if (
        !analysisIsOpen ||
        analysisSelectedPipeIndex === null ||
        !(analysisLayerId ? layers[analysisLayerId]?.data : data) ||
        !(analysisLayerId
          ? layers[analysisLayerId]?.data?.lines
          : data?.lines)
      ) {
        return {
          points: [],
          pipeColor: '#3388ff',
          lineCoords: [],
          sourceProj: 'EPSG:4326',
        };
      }

      const activeData = analysisLayerId
        ? layers[analysisLayerId]?.data
        : data;
      const line = activeData?.lines?.[analysisSelectedPipeIndex];
      if (!line || !line.coordinates)
        return {
          points: [],
          pipeColor: '#3388ff',
          lineCoords: [],
          sourceProj: 'EPSG:4326',
        };

      const fcode = normalizeFcode(
        line.attributes?.Tema || line.attributes?.S_FCODE,
      );
      const color = getColorByFCode(fcode || '');

      // Determine source projection
      let sourceProj = 'EPSG:4326';
      if (activeData?.header?.COSYS_EPSG) {
        const epsg = `EPSG:${activeData.header.COSYS_EPSG}`;
        if (proj4.defs(epsg)) sourceProj = epsg;
      } else if (activeData?.header?.COSYS) {
        if (
          activeData.header.COSYS.includes('UTM') &&
          activeData.header.COSYS.includes('32')
        )
          sourceProj = 'EPSG:25832';
        else if (
          activeData.header.COSYS.includes('UTM') &&
          activeData.header.COSYS.includes('33')
        )
          sourceProj = 'EPSG:25833';
      }

      const pts = line.coordinates.map((c, i) => {
        let lat, lng;
        if (sourceProj === 'EPSG:4326') {
          lat = c.y;
          lng = c.x;
        } else {
          try {
            const [l, t] = proj4(sourceProj, 'EPSG:4326', [c.x, c.y]);
            lng = l;
            lat = t;
          } catch (e) {
            lat = c.y;
            lng = c.x;
          }
        }
        return { lat, lng, z: c.z, index: i };
      });

      return {
        points: pts,
        pipeColor: color,
        lineCoords: line.coordinates,
        sourceProj,
      };
    }, [
      analysisIsOpen,
      analysisSelectedPipeIndex,
      analysisLayerId,
      data,
    ]);

  // Subscribe to hoveredTerrainPoint separately (changes frequently during hover)
  const hoveredTerrainPoint = useStore(
    (state) => state.analysis.hoveredTerrainPoint,
  );

  const hoveredTerrainLatLng = useMemo(() => {
    const target = hoveredTerrainPoint;
    if (!target || !lineCoords || lineCoords.length < 2) return null;

    const targetDist =
      target.lineDist !== undefined ? target.lineDist : target.dist;

    let distSoFar = 0;
    for (let i = 0; i < lineCoords.length - 1; i++) {
      const p1 = lineCoords[i];
      const p2 = lineCoords[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (segLen < 0.0001) continue;

      if (targetDist <= distSoFar + segLen) {
        const t = (targetDist - distSoFar) / segLen;
        const x = p1.x + (p2.x - p1.x) * t;
        const y = p1.y + (p2.y - p1.y) * t;
        let lat, lng;
        if (sourceProj === 'EPSG:4326') {
          lat = y;
          lng = x;
        } else {
          try {
            const [l, tLat] = proj4(sourceProj, 'EPSG:4326', [x, y]);
            lng = l;
            lat = tLat;
          } catch (e) {
            lat = y;
            lng = x;
          }
        }
        return [lat, lng];
      }

      distSoFar += segLen;
    }

    return null;
  }, [hoveredTerrainPoint, lineCoords, sourceProj]);

  // Subscribe to hoveredSegment separately
  const hoveredSegment = useStore(
    (state) => state.analysis.hoveredSegment,
  );

  const hoveredPointIndex = useStore(
    (state) => state.analysis.hoveredPointIndex,
  );

  const hoveredSegmentPolyline = useMemo(() => {
    if (!hoveredSegment || points.length === 0) return null;

    const { p1, p2 } = hoveredSegment;
    // Find points with these indices
    const point1 = points.find((p) => p.index === p1);
    const point2 = points.find((p) => p.index === p2);

    if (point1 && point2) {
      return [
        [point1.lat, point1.lng],
        [point2.lat, point2.lng],
      ];
    }
    return null;
  }, [hoveredSegment, points]);

  if (points.length === 0) return null;

  return (
    <>
      {hoveredSegmentPolyline && (
        <Polyline
          positions={hoveredSegmentPolyline}
          pathOptions={{ color: '#ffff00', weight: 10, opacity: 0.6 }}
        />
      )}
      {points.map((p) => {
        const isHovered = hoveredPointIndex === p.index;
        return (
          <CircleMarker
            key={p.index}
            center={[p.lat, p.lng]}
            radius={isHovered ? 8 : 5}
            pathOptions={{
              color: isHovered ? '#ff0000' : pipeColor,
              fillColor: isHovered ? '#ff0000' : 'white',
              fillOpacity: 1,
              weight: 2,
              zIndexOffset: 1000, // Attempt to force on top, though CircleMarker doesn't support this directly
            }}
            pane="markerPane" // Render in markerPane which is above overlayPane (where GeoJSON usually is)
            eventHandlers={{
              mouseover: (e) => {
                e.target.openTooltip();
              },
              mouseout: (e) => {
                if (!isHovered) e.target.closeTooltip();
              },
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -10]}
              opacity={1}
              permanent={isHovered}
            >
              <span>
                P{p.index} (Z: {p.z?.toFixed(2)})
              </span>
            </Tooltip>
          </CircleMarker>
        );
      })}
      {hoveredTerrainLatLng && (
        <CircleMarker
          center={hoveredTerrainLatLng}
          radius={6}
          pathOptions={{
            color: '#3b82f6',
            fillColor: '#dbeafe',
            fillOpacity: 1,
            weight: 2,
          }}
          pane="markerPane"
        />
      )}
    </>
  );
}

function WmsLayerRefresher({ customWmsConfig }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !customWmsConfig) return;

    // Build auth header if credentials present
    const authHeader =
      customWmsConfig.username && customWmsConfig.password
        ? `Basic ${btoa(`${customWmsConfig.username}:${customWmsConfig.password}`)}`
        : null;

    // Iterate over layers and refresh the Gemini WMS layer
    map.eachLayer((layer) => {
      try {
        const opts = layer?.options || {};
        const attr = opts.attribution || '';
        if (attr && attr.toString().includes('Gemini WMS')) {
          // Apply auth header if available
          if (authHeader) {
            layer._authHeader = authHeader;
          }
          // Ensure layers param is up to date
          if (typeof layer.setParams === 'function') {
            layer.setParams({ layers: customWmsConfig.layers || '' });
          }
          // Force redraw to fetch tiles with new auth header/params
          if (typeof layer.redraw === 'function') {
            layer.redraw();
          }
        }
      } catch (e) {
        // Best-effort: we don't want exceptions to break rendering
        // eslint-disable-next-line no-console
        console.warn('WMS refresher error', e);
      }
    });
  }, [
    map,
    customWmsConfig?.url,
    customWmsConfig?.username,
    customWmsConfig?.password,
    customWmsConfig?.layers,
    customWmsConfig?.enabled,
  ]);

  return null;
}

function LayerControlPersistence({
  onBaseLayerChange,
  onOverlayChange,
  onGeminiWmsToggle,
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const handleBaseLayerChange = (event) => {
      const name = event?.name;
      if (!name || !onBaseLayerChange) return;
      onBaseLayerChange(name);
    };

    const handleOverlayAdd = (event) => {
      const name = event?.name;
      if (!name || !onOverlayChange) return;

      if (name === 'Data') {
        onOverlayChange('data', true);
      } else if (name === 'Gemini WMS') {
        onOverlayChange('geminiWms', true);
        onGeminiWmsToggle?.(true);
      } else if (name === 'Eiendomsgrenser') {
        onOverlayChange('eiendomsgrenser', true);
      }
    };

    const handleOverlayRemove = (event) => {
      const name = event?.name;
      if (!name || !onOverlayChange) return;

      if (name === 'Data') {
        onOverlayChange('data', false);
      } else if (name === 'Gemini WMS') {
        onOverlayChange('geminiWms', false);
        onGeminiWmsToggle?.(false);
      } else if (name === 'Eiendomsgrenser') {
        onOverlayChange('eiendomsgrenser', false);
      }
    };

    map.on('baselayerchange', handleBaseLayerChange);
    map.on('overlayadd', handleOverlayAdd);
    map.on('overlayremove', handleOverlayRemove);

    return () => {
      map.off('baselayerchange', handleBaseLayerChange);
      map.off('overlayadd', handleOverlayAdd);
      map.off('overlayremove', handleOverlayRemove);
    };
  }, [map, onBaseLayerChange, onOverlayChange, onGeminiWmsToggle]);

  return null;
}

function AnalysisZoomHandler() {
  const map = useMap();
  const analysisIsOpen = useStore((state) => state.analysis.isOpen);
  const analysisSelectedPipeIndex = useStore(
    (state) => state.analysis.selectedPipeIndex,
  );
  const analysisLayerId = useStore((state) => state.analysis.layerId);
  const data = useStore((state) => state.data);

  useEffect(() => {
    // Use getState() to read layers only when zoom effect runs
    const layers = useStore.getState().layers;
    const activeData = analysisLayerId
      ? layers[analysisLayerId]?.data
      : data;

    if (
      analysisIsOpen &&
      analysisSelectedPipeIndex !== null &&
      activeData &&
      activeData.lines
    ) {
      const line = activeData.lines[analysisSelectedPipeIndex];
      if (line && line.coordinates && line.coordinates.length > 0) {
        // Determine source projection
        let sourceProj = 'EPSG:4326';
        if (activeData.header?.COSYS_EPSG) {
          const epsg = `EPSG:${activeData.header.COSYS_EPSG}`;
          if (proj4.defs(epsg)) sourceProj = epsg;
        } else if (activeData.header?.COSYS) {
          if (
            activeData.header.COSYS.includes('UTM') &&
            activeData.header.COSYS.includes('32')
          )
            sourceProj = 'EPSG:25832';
          else if (
            activeData.header.COSYS.includes('UTM') &&
            activeData.header.COSYS.includes('33')
          )
            sourceProj = 'EPSG:25833';
        }

        const latLngs = line.coordinates.map((c) => {
          if (sourceProj === 'EPSG:4326') return [c.y, c.x];
          try {
            const [lng, lat] = proj4(sourceProj, 'EPSG:4326', [
              c.x,
              c.y,
            ]);
            return [lat, lng];
          } catch (e) {
            return [c.y, c.x];
          }
        });

        const bounds = L.latLngBounds(latLngs);
        if (bounds.isValid()) {
          const southWest = bounds.getSouthWest();
          const northEast = bounds.getNorthEast();
          const diagonalMeters = southWest.distanceTo(northEast);

          // Determine maxZoom and padding based on feature size
          let maxZoom = 19;
          let padding = [100, 100];

          if (diagonalMeters < 20) {
            maxZoom = 22;
            padding = [50, 50];
          } else if (diagonalMeters < 50) {
            maxZoom = 21;
            padding = [50, 50];
          } else if (diagonalMeters < 100) {
            maxZoom = 20;
            padding = [80, 80];
          } else if (diagonalMeters < 200) {
            maxZoom = 19;
            padding = [80, 80];
          }

          map.fitBounds(bounds, {
            padding: padding,
            maxZoom: maxZoom,
          });
        }
      }
    }
  }, [
    analysisIsOpen,
    analysisSelectedPipeIndex,
    analysisLayerId,
    data,
    map,
  ]);

  return null;
}
