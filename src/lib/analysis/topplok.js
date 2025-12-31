/**
 * Topplok Kontroll (Lid Control)
 *
 * Checks that all KUM, SLU, SLS, SAN have a corresponding LOK (lid).
 * LOK is the surface-level lid that covers manholes and chambers.
 *
 * Matching is done by XY proximity (within tolerance).
 */

// Types that should have a LOK
const REQUIRES_LOK = ['KUM', 'SLU', 'SLS', 'SAN'];

// Distance tolerance in meters for matching LOK to KUM
const MATCH_TOLERANCE = 1.0; // 1 meter

/**
 * Calculate 2D distance between two points
 */
function distance2D(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Find matching LOK for a point
 * @param {Object} point - The point to find a LOK for
 * @param {Array} loks - Array of LOK points
 * @returns {Object|null} - Matching LOK or null
 */
function findMatchingLok(point, loks) {
  if (!point.coordinates || point.coordinates.length === 0)
    return null;

  const pointCoord = point.coordinates[0];
  let bestMatch = null;
  let bestDistance = Infinity;

  for (const lok of loks) {
    if (!lok.coordinates || lok.coordinates.length === 0) continue;

    const lokCoord = lok.coordinates[0];
    const dist = distance2D(pointCoord, lokCoord);

    if (dist < MATCH_TOLERANCE && dist < bestDistance) {
      bestDistance = dist;
      bestMatch = lok;
    }
  }

  return bestMatch;
}

/**
 * Analyze points for missing LOK
 * @param {Object} data - GMI data object with points array
 * @returns {Object} - Analysis results
 */
export function analyzeTopplok(data) {
  if (!data || !data.points) {
    return { results: [], summary: { total: 0, missing: 0, ok: 0 } };
  }

  const results = [];

  // Separate points by type
  const loks = data.points.filter(
    (p) => p.attributes?.S_FCODE === 'LOK'
  );

  const requiresLok = data.points.filter((p) =>
    REQUIRES_LOK.includes(p.attributes?.S_FCODE)
  );

  // Check each point that requires a LOK
  requiresLok.forEach((point, index) => {
    const fcode = point.attributes?.S_FCODE || 'UNKNOWN';
    const coord = point.coordinates?.[0];
    const matchingLok = findMatchingLok(point, loks);

    const result = {
      pointIndex: data.points.indexOf(point),
      fcode: fcode,
      status: matchingLok ? 'ok' : 'error',
      message: matchingLok
        ? `LOK funnet (${distance2D(
            coord,
            matchingLok.coordinates[0]
          ).toFixed(2)}m avstand)`
        : 'Mangler LOK',
      coordinates: coord
        ? { x: coord.x, y: coord.y, z: coord.z }
        : null,
      matchingLok: matchingLok
        ? {
            pointIndex: data.points.indexOf(matchingLok),
            coordinates: matchingLok.coordinates[0],
            distance: distance2D(coord, matchingLok.coordinates[0]),
          }
        : null,
      attributes: point.attributes || {},
    };

    results.push(result);
  });

  const summary = {
    total: results.length,
    missing: results.filter((r) => r.status === 'error').length,
    ok: results.filter((r) => r.status === 'ok').length,
    lokCount: loks.length,
  };

  return { results, summary };
}

/**
 * Get surface height (LOK Z) for a point if it has a matching LOK
 * This is used for 3D rendering to extend cylinders to surface
 * @param {Object} point - The point (KUM, SLU, SLS, SAN)
 * @param {Array} allPoints - All points in the data
 * @returns {number|null} - Surface Z height or null
 */
export function getSurfaceHeight(point, allPoints) {
  if (!point.coordinates || point.coordinates.length === 0)
    return null;

  const loks = allPoints.filter(
    (p) => p.attributes?.S_FCODE === 'LOK'
  );
  const matchingLok = findMatchingLok(point, loks);

  if (matchingLok && matchingLok.coordinates?.[0]) {
    return matchingLok.coordinates[0].z;
  }

  return null;
}

/**
 * Build a map of point index to LOK surface height for 3D rendering
 * @param {Array} points - All points
 * @returns {Map<number, number>} - Map of point index to surface Z
 */
export function buildLokHeightMap(points) {
  if (!points) return new Map();

  const loks = points.filter((p) => p.attributes?.S_FCODE === 'LOK');
  const heightMap = new Map();

  points.forEach((point, index) => {
    const fcode = point.attributes?.S_FCODE;
    if (!REQUIRES_LOK.includes(fcode)) return;

    const matchingLok = findMatchingLok(point, loks);
    if (matchingLok && matchingLok.coordinates?.[0]) {
      heightMap.set(index, matchingLok.coordinates[0].z);
    }
  });

  return heightMap;
}
