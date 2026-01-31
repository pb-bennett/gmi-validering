import { getColorByFCode } from './colorMapping';

/**
 * Transform GMI lines data to 3D pipe format
 * @param {Array} lines - GMI lines array
 * @param {Object} header - GMI header with coordinate system info
 * @returns {Object} { pipes: Array, center: [x, y, z], extent: { width, height, depth } }
 */
export function transformPipes(lines, header) {
  if (!lines || lines.length === 0) {
    return {
      pipes: [],
      center: [0, 0, 0],
      extent: { width: 100, height: 10, depth: 100 },
    };
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

  // Calculate extent for dynamic grid sizing
  const width = maxX - minX || 100;
  const height = maxZ - minZ || 10;
  const depth = maxY - minY || 100;
  const extent = { width, height, depth };

  // Second pass: create pipe segments
  const pipes = [];

  lines.forEach((line, lineIndex) => {
    if (!line.coordinates || line.coordinates.length < 2) return;

    const fcode = line.attributes?.S_FCODE || 'UNKNOWN';
    const color = getColorByFCode(fcode);
    const dimensjon = line.attributes?.Dimensjon || 200; // Default 200mm
    const radius = dimensjon / 2000; // Convert mm to meters, scale down
    const diameter = dimensjon / 1000; // Diameter in meters

    // Get height reference and calculate vertical offset
    const hoyderef = line.attributes?.Høydereferanse || 'UKJENT';
    let zOffset = 0;

    // Adjust Z based on height reference to position pipe center correctly
    switch (hoyderef) {
      case 'BUNN_INNVENDIG':
        // Measured from bottom inside - move center up by radius
        zOffset = radius;
        break;
      case 'UNDERKANT_UTVENDIG':
        // Measured from bottom outside - move center up by radius
        zOffset = radius;
        break;
      case 'TOPP_UTVENDIG':
        // Measured from top outside - move center down by radius
        zOffset = -radius;
        break;
      case 'TOPP_INNVENDIG':
        // Measured from top inside - move center down by radius
        zOffset = -radius;
        break;
      case 'SENTER':
        // Already at center, no offset needed
        zOffset = 0;
        break;
      case 'PÅ_BAKKEN':
        // Measured at ground level - assume pipe is below, move down by radius
        zOffset = -radius;
        break;
      default:
        // Unknown - assume center
        zOffset = 0;
    }

    // Create segments between consecutive coordinates
    for (let i = 0; i < line.coordinates.length - 1; i++) {
      const start = line.coordinates[i];
      const end = line.coordinates[i + 1];

      // Apply height reference offset to Z coordinates
      const startZ = (start.z || 0) + zOffset - centerZ;
      const endZ = (end.z || 0) + zOffset - centerZ;

      pipes.push({
        start: [
          start.x - centerX,
          startZ, // Z becomes Y in Three.js (adjusted for height reference)
          -(start.y - centerY), // Negate to fix north-south orientation
        ],
        end: [
          end.x - centerX,
          endZ,
          -(end.y - centerY), // Negate to fix north-south orientation
        ],
        radius: radius,
        color: color,
        fcode: fcode,
        lineIndex: lineIndex, // Track which line this segment belongs to
        hoyderef: hoyderef, // Include height reference for debugging
        attributes: line.attributes || {},
      });
    }
  });

  return { pipes, center, extent };
}

/**
 * Transform GMI points data to 3D format
 * @param {Array} points - GMI points array
 * @param {Object} header - GMI header with coordinate system info
 * @param {Array} center - Center offset from transformPipes
 * @param {Array} lines - Optional lines array to check for nearby large pipes
 * @returns {Object} { cylinders: Array, spheres: Array, loks: Array }
 */
export function transformPoints(
  points,
  header,
  center,
  lines = null,
) {
  if (!points || points.length === 0) {
    return { cylinders: [], spheres: [], loks: [] };
  }

  let resolvedCenter = center;

  if (
    !Array.isArray(resolvedCenter) ||
    resolvedCenter.length < 3 ||
    (resolvedCenter[0] === 0 &&
      resolvedCenter[1] === 0 &&
      resolvedCenter[2] === 0 &&
      (!lines || lines.length === 0))
  ) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    points.forEach((p) => {
      if (!p.coordinates || p.coordinates.length === 0) return;
      const c = p.coordinates[0];
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
      minZ = Math.min(minZ, c.z || 0);
      maxZ = Math.max(maxZ, c.z || 0);
    });

    if (
      Number.isFinite(minX) &&
      Number.isFinite(minY) &&
      Number.isFinite(minZ)
    ) {
      resolvedCenter = [
        (minX + maxX) / 2,
        (minY + maxY) / 2,
        (minZ + maxZ) / 2,
      ];
    } else {
      resolvedCenter = [0, 0, 0];
    }
  }

  const [centerX, centerY, centerZ] = resolvedCenter;

  const cylinders = []; // KUM, SLU, SLS, SAN - vertical cylinders with depth
  const spheres = []; // Other punkter - spheres
  const loks = []; // LOK - flat discs

  // Types that get rendered as vertical cylinders (have depth)
  const cylinderTypes = ['KUM', 'SLU', 'SLS', 'SAN'];

  // Default cylinder depth when no LOK found
  const DEFAULT_DEPTH = 2.0; // 2 meters

  // Tolerance for matching LOK to KUM (in meters)
  const LOK_MATCH_TOLERANCE = 1.0;

  // LOK rendering thickness (meters)
  const LOK_THICKNESS = 0.07;
  // Small gap so cylinder doesn't overlap LOK disc
  const CYLINDER_TOP_GAP = 0.02;

  // First pass: collect all LOKs for matching
  const lokPoints = points.filter(
    (p) => p.attributes?.S_FCODE === 'LOK',
  );

  // Helper function to find matching LOK for a point
  const findMatchingLok = (point, pointRadiusMeters) => {
    if (!point.coordinates || point.coordinates.length === 0)
      return null;
    const coord = point.coordinates[0];

    let bestLok = null;
    let bestDistance = Infinity;

    for (const lok of lokPoints) {
      if (!lok.coordinates || lok.coordinates.length === 0) continue;
      const lokCoord = lok.coordinates[0];

      const lokBredde =
        lok.attributes?.['Bredde (diameter)'] ||
        lok.attributes?.Bredde ||
        lok.attributes?.Dimensjon ||
        800;
      const lokRadiusMeters = lokBredde / 2000;

      const dx = coord.x - lokCoord.x;
      const dy = coord.y - lokCoord.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Prefer size-aware matching (object radii) but keep a sensible minimum
      const sizeAwareTolerance = Math.max(
        LOK_MATCH_TOLERANCE,
        (pointRadiusMeters || 0.3) + Math.max(lokRadiusMeters, 0.3),
      );

      if (distance < sizeAwareTolerance && distance < bestDistance) {
        bestDistance = distance;
        bestLok = lok;
      }
    }

    return bestLok;
  };

  // Helper function to find max pipe diameter near a point
  const NEAR_PIPE_TOLERANCE = 2.0; // 2 meters
  const findNearbyMaxPipeDiameter = (coord) => {
    if (!lines || lines.length === 0) return 0;

    let maxDiameter = 0;

    for (const line of lines) {
      if (!line.coordinates || line.coordinates.length === 0)
        continue;
      const dimensjon = line.attributes?.Dimensjon || 200;

      // Check if any coordinate of the line is near the point
      for (const lineCoord of line.coordinates) {
        const dx = coord.x - lineCoord.x;
        const dy = coord.y - lineCoord.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < NEAR_PIPE_TOLERANCE) {
          maxDiameter = Math.max(maxDiameter, dimensjon);
          break; // Found a near point on this line, no need to check more
        }
      }
    }

    return maxDiameter;
  };

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
      (coord.z || 0) - centerZ, // Z becomes Y in Three.js
      -(coord.y - centerY), // Negate to fix north-south orientation
    ];

    if (fcode === 'LOK') {
      // LOK - flat disc (7cm thick)
      const radius = bredde / 2000; // mm to meters
      loks.push({
        position: position,
        radius: Math.max(radius, 0.3), // Min 30cm radius
        thickness: LOK_THICKNESS, // 7cm thick
        color: '#ec4899', // Distinct pink color for LOK to distinguish from KUM
        fcode: fcode,
        pointIndex: pointIndex,
        type: point.attributes?.Type || '(Mangler Type)',
        attributes: point.attributes || {},
      });
    } else if (cylinderTypes.includes(fcode)) {
      // KUM, SLU, SLS, SAN - vertical cylinders
      const radius = bredde / 2000;

      // Try to find matching LOK to determine surface level
      const matchingLok = findMatchingLok(
        point,
        Math.max(radius, 0.3),
      );
      let depth = DEFAULT_DEPTH;
      let surfaceZ = null;

      if (matchingLok && matchingLok.coordinates?.[0]) {
        // Calculate depth as difference between LOK surface and KUM base
        const lokZ = matchingLok.coordinates[0].z || 0;
        const baseZ = coord.z || 0;
        const calculatedDepth = lokZ - baseZ;

        if (calculatedDepth > 0.1 && calculatedDepth < 20) {
          // Sanity check: depth should be between 10cm and 20m
          depth = Math.max(calculatedDepth - CYLINDER_TOP_GAP, 0.1);
          surfaceZ = lokZ - centerZ - CYLINDER_TOP_GAP;
        }
      } else {
        // No matching LOK - use Dybde attribute or default
        const dybdeAttr = point.attributes?.Dybde;
        if (dybdeAttr) {
          depth = dybdeAttr / 1000; // mm to meters
        }
      }

      // Adjust position so cylinder ends at surface (LOK level) or extends up from base
      // Position is base Z, we need to position the cylinder so it extends upward
      const basePosition = [
        coord.x - centerX,
        (coord.z || 0) - centerZ, // Base at point's Z coordinate
        -(coord.y - centerY),
      ];

      cylinders.push({
        position: basePosition,
        radius: Math.max(radius, 0.3),
        depth: depth,
        color: color,
        fcode: fcode,
        pointIndex: pointIndex,
        surfaceZ: surfaceZ,
        hasMatchingLok: !!matchingLok,
        type: point.attributes?.Type || '(Mangler Type)',
        attributes: point.attributes || {},
      });
    } else {
      // All other punkter - spheres
      // Scale sphere size based on nearby pipe diameter to avoid visual clutter
      const nearbyPipeDiameter = findNearbyMaxPipeDiameter(coord);
      const baseRadius = Math.max(bredde / 2000, 0.1); // At least 10cm base radius

      let finalRadius;
      if (nearbyPipeDiameter > 500) {
        // Large pipe nearby (>500mm) - scale sphere up proportionally
        // But cap it so it doesn't get too big
        const pipeRadius = nearbyPipeDiameter / 2000;
        finalRadius = Math.min(baseRadius * 1.2, pipeRadius * 0.6);
      } else if (nearbyPipeDiameter > 200) {
        // Medium pipe nearby (200-500mm) - use moderate size
        finalRadius = baseRadius * 0.6;
      } else {
        // Small or no pipe nearby - use compact size
        finalRadius = baseRadius * 0.4;
      }

      // Ensure minimum visibility
      finalRadius = Math.max(finalRadius, 0.08); // At least 8cm radius

      spheres.push({
        position: position,
        radius: finalRadius,
        color: color,
        fcode: fcode,
        pointIndex: pointIndex,
        type: point.attributes?.Type || '(Mangler Type)',
        attributes: point.attributes || {},
        nearbyPipeDiameter: nearbyPipeDiameter, // Include for debugging
      });
    }
  });

  return { cylinders, spheres, loks };
}

/**
 * Get color for point objects - matches MapInner.js colors
 */
function getPointColor(fcode) {
  if (!fcode || typeof fcode !== 'string') return '#800080';
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

    // LOK - Magenta
    LOK: '#ff00ff',

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
