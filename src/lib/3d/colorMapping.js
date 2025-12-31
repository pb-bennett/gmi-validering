/**
 * Map S_FCODE to colors for 3D visualization
 * Based on the color scheme from MapInner.js
 */

const colorMap = {
  // Water lines (Vannledninger) - Blue shades
  VL: '#0101FF',
  VF: '#0080ff',
  VLA: '#0088FF',
  VLB: '#0099FF',
  VLH: '#00AAFF',
  VANN: '#0101FF',

  // Wastewater (Spillvann) - Green shades
  SP: '#02D902',
  SPA: '#32CD32',
  SPB: '#02D902',
  SPH: '#00CC00',
  SPILLVANN: '#02D902',

  // Stormwater (Overvann) - Dark gray/black shades
  OV: '#2a2a2a',
  OVA: '#333333',
  OVB: '#2a2a2a',
  OVH: '#1a1a1a',
  OVERVANN: '#2a2a2a',

  // Combined sewer (Avløp felles) - Purple
  AF: '#9932CC',
  AFA: '#AA44DD',
  AFB: '#9932CC',
  AFH: '#8822BB',

  // Drainage (Drensering) - Brown
  DR: '#8B4513',
  DRA: '#A0522D',
  DRB: '#8B4513',
  DRH: '#654321',

  // Gas - Orange
  GA: '#FF8C00',
  GAH: '#FF7700',

  // Electric - Red
  EL: '#FF0000',
  ELH: '#EE0000',

  // Telecom - Cyan
  TE: '#00FFFF',
  TEH: '#00EEEE',

  // Heating (Fjernvarme) - Pink
  FV: '#FF1493',
  FVH: '#EE1188',
};

/**
 * Get color for a given S_FCODE
 * @param {string} fcode - The S_FCODE value
 * @returns {string} Hex color code
 */
export function getColorByFCode(fcode) {
  if (!fcode) return '#888888'; // Default gray

  const upperFCode = String(fcode).toUpperCase();

  // Check exact match first
  if (colorMap[upperFCode]) {
    return colorMap[upperFCode];
  }

  // Check partial matches
  if (upperFCode.includes('VL') || upperFCode.includes('VANN'))
    return '#0066CC';
  if (upperFCode.includes('SP') || upperFCode.includes('SPILLVANN'))
    return '#8B4513';
  if (upperFCode.includes('OV') || upperFCode.includes('OVERVANN'))
    return '#44FF88';
  if (upperFCode.includes('AF')) return '#9932CC';
  if (upperFCode.includes('DR')) return '#FFD700';
  if (upperFCode.includes('GA')) return '#FF8C00';
  if (upperFCode.includes('EL')) return '#FF0000';
  if (upperFCode.includes('TE')) return '#00FFFF';
  if (upperFCode.includes('FV')) return '#FF1493';

  // Default
  return '#888888';
}

/**
 * Get all color mappings for legend
 * @returns {Array} Array of { fcode, label, color }
 */
export function getColorLegend() {
  return [
    { fcode: 'VL', label: 'Vannledning', color: '#0066CC' },
    { fcode: 'SP', label: 'Spillvann', color: '#8B4513' },
    { fcode: 'OV', label: 'Overvann', color: '#44FF88' },
    { fcode: 'AF', label: 'Avløp felles', color: '#9932CC' },
    { fcode: 'DR', label: 'Drensering', color: '#FFD700' },
    { fcode: 'GA', label: 'Gass', color: '#FF8C00' },
    { fcode: 'EL', label: 'Elektrisk', color: '#FF0000' },
    { fcode: 'TE', label: 'Tele', color: '#00FFFF' },
    { fcode: 'FV', label: 'Fjernvarme', color: '#FF1493' },
  ];
}
