import { getColorByFCode } from './colorMapping';

/**
 * Transform GMI lines data to 3D pipe format
 * @param {Array} lines - GMI lines array
 * @param {Object} header - GMI header with coordinate system info
 * @returns {Object} { pipes: Array, center: [x, y, z] }
 */
export function transformPipes(lines, header) {
  if (!lines || lines.length === 0) {
    return { pipes: [], center: [0, 0, 0] };
  }

  // Calculate bounding box to center the scene
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  // First pass: find bounds
  lines.forEach((line) => {
    if (!line.coordinates || line.coordinates.length < 2) return;

    line.coordinates.forEach((coord) => {
      minX = Math.min(minX, coord.x);
      maxX = Math.max(maxX, coord.x);
      minY = Math.min(minY, coord.y);
      maxY = Math.max(maxY, coord.y);
      minZ = Math.min(minZ, coord.z || 0);
      maxZ = Math.max(maxZ, coord.z || 0);
    });
  });

  // Calculate center
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const center = [centerX, centerY, centerZ];

  // Second pass: create pipe segments
  const pipes = [];

  lines.forEach((line, lineIndex) => {
    if (!line.coordinates || line.coordinates.length < 2) return;

    const fcode = line.attributes?.S_FCODE || 'UNKNOWN';
    const color = getColorByFCode(fcode);
    const dimensjon = line.attributes?.Dimensjon || 200; // Default 200mm
    const radius = dimensjon / 2000; // Convert mm to meters, scale down

    // Create segments between consecutive coordinates
    for (let i = 0; i < line.coordinates.length - 1; i++) {
      const start = line.coordinates[i];
      const end = line.coordinates[i + 1];

      pipes.push({
        start: [
          start.x - centerX,
          start.z || 0 - centerZ, // Z becomes Y in Three.js
          -(start.y - centerY), // Negate to fix north-south orientation
        ],
        end: [
          end.x - centerX,
          end.z || 0 - centerZ,
          -(end.y - centerY), // Negate to fix north-south orientation
        ],
        radius: radius,
        color: color,
        fcode: fcode,
        lineIndex: lineIndex, // Track which line this segment belongs to
      });
    }
  });

  return { pipes, center };
}

/**
 * Transform GMI points data to 3D format
 * @param {Array} points - GMI points array
 * @param {Object} header - GMI header with coordinate system info
 * @param {Array} center - Center offset from transformPipes
 * @returns {Object} { cylinders: Array, spheres: Array, loks: Array }
 */
export function transformPoints(points, header, center) {
  if (!points || points.length === 0) {
    return { cylinders: [], spheres: [], loks: [] };
  }

  const [centerX, centerY, centerZ] = center;

  const cylinders = []; // KUM, SLU, SLS, SAN - vertical cylinders with depth
  const spheres = []; // Other punkter - spheres
  const loks = []; // LOK - flat discs

  // Types that get rendered as vertical cylinders (have depth)
  const cylinderTypes = ['KUM', 'SLU', 'SLS', 'SAN'];

  points.forEach((point, pointIndex) => {
    if (!point.coordinates || point.coordinates.length === 0) return;

    const coord = point.coordinates[0];
    const fcode = point.attributes?.S_FCODE || 'UNKNOWN';
    const color = getPointColor(fcode);

    const bredde =
      point.attributes?.['Bredde (diameter)'] ||
      point.attributes?.Bredde ||
      point.attributes?.Dimensjon ||
      800; // Default 800mm

    const position = [
      coord.x - centerX,
      coord.z || 0 - centerZ, // Z becomes Y in Three.js
      -(coord.y - centerY), // Negate to fix north-south orientation
    ];

    if (fcode === 'LOK') {
      // LOK - flat disc (7cm thick)
      const radius = bredde / 2000; // mm to meters
      loks.push({
        position: position,
        radius: Math.max(radius, 0.3), // Min 30cm radius
        thickness: 0.07, // 7cm thick
        color: color,
        fcode: fcode,
        pointIndex: pointIndex,
      });
    } else if (cylinderTypes.includes(fcode)) {
      // KUM, SLU, SLS, SAN - vertical cylinders
      const radius = bredde / 2000;
      const dybde = point.attributes?.Dybde || 2000;
      const depth = dybde / 1000;

      cylinders.push({
        position: position,
        radius: Math.max(radius, 0.3),
        depth: depth,
        color: color,
        fcode: fcode,
        pointIndex: pointIndex,
      });
    } else {
      // All other punkter - spheres (compact size)
      const radius = Math.max(bredde / 2000, 0.15); // At least 15cm radius

      spheres.push({
        position: position,
        radius: radius * 0.7, // Smaller spheres for cleaner look
        color: color,
        fcode: fcode,
        pointIndex: pointIndex,
      });
    }
  });

  return { cylinders, spheres, loks };
}

/**
 * Get color for point objects - matches MapInner.js colors
 */
function getPointColor(fcode) {
  const colors = {
    // Manholes - Red shades
    KUM: '#cc3300',
    KUM_SP: '#dc143c',
    KUM_OV: '#b22222',
    KUM_VL: '#cd5c5c',

    // SLS/SLU/SAN - Black
    SLS: '#000000',
    SLU: '#000000',
    SAN: '#1a1a1a',

    // LOK - Red (same as KUM)
    LOK: '#cc3300',

    // Water related - Blue
    VL: '#0101FF',
    VANN: '#0066CC',
    KRN: '#0066cc',
    ANBORING: '#0066cc',

    // Wastewater - Green
    SP: '#02D902',
    GRN: '#00cc00',

    // Stormwater - Dark gray/black
    OV: '#2a2a2a',

    // Drainage - Brown
    DR: '#8B4513',
    DRK: '#A0522D',

    // Misc
    DIV: '#666666',
    GRØKONSTR: '#cccccc',
  };

  // Exact match
  if (colors[fcode]) return colors[fcode];

  // Partial match
  if (fcode.includes('KUM')) return '#cc3300';
  if (fcode.includes('VL') || fcode.includes('VANN'))
    return '#0101FF';
  if (fcode.includes('SP')) return '#02D902';
  if (fcode.includes('OV')) return '#2a2a2a';
  if (fcode.includes('DR')) return '#8B4513';

  return '#800080'; // Default purple for unknown
}
