import { getPointHaloSpread, getPointHaloSvg } from './layerHighlight.mjs';
import { getLineStyle } from './lineStyle.mjs';

export const INFRA_CATEGORIES = {
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

export const getCategoryByFCode = (fcode) => {
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

export const getColorByFCode = (fcode) => {
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

export const normalizeFcode = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value);
  return str.trim() === '' ? null : str;
};

// SVG shape generators for point markers
export const createPointSymbol = (
  category,
  color,
  isHighlighted = false,
  highlightColor = '#00FFFF',
  layerHighlightStyle = null,
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
  const renderMarker = (svgPath) => {
    const padding = layerHighlightStyle
      ? Math.ceil(strokeWidth / 2 + getPointHaloSpread(layerHighlightStyle.spread) + 2)
      : 0;
    const iconSize = size + 2 * padding;
    const halo = layerHighlightStyle
      ? getPointHaloSvg(category, size, strokeWidth, layerHighlightStyle)
      : '';
    const content = padding
      ? `<g transform="translate(${padding} ${padding})">${halo}${svgPath}</g>`
      : svgPath;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}">${content}</svg>`;
    return ({
      html: svg,
      className: 'custom-div-icon',
      iconSize: [iconSize, iconSize],
      iconAnchor: [iconSize / 2, iconSize / 2],
      popupAnchor: [0, -iconSize / 2],
    });
  };

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

    return renderMarker(svgPath);
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

  return renderMarker(svgPath);
};

export const getLineWeight = (properties) => {
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

export function getSemanticLineStyle(properties, highlighted = false) {
  const weight = getLineWeight(properties) + (highlighted ? 4 : 0);
  const style = getLineStyle(normalizeFcode(properties.S_FCODE), getColorByFCode, weight);
  return { color: highlighted ? '#00FFFF' : style.color, weight,
    opacity: highlighted ? 1 : 0.9, dashArray: style.dashArray,
    shadowBlur: highlighted ? 10 : 0 };
}

export function getSemanticPointSymbol(properties, highlighted = false, marking = null) {
  const code = normalizeFcode(properties.S_FCODE);
  return createPointSymbol(getCategoryByFCode(code), getColorByFCode(code), highlighted, '#00FFFF', marking);
}
