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

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value))
    return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(',', '.').trim();
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function getObjectRadiusMeters(point) {
  const attrs = point?.attributes;
  if (!attrs) return 0.3;

  const raw =
    attrs?.['Bredde (diameter)'] ??
    attrs?.Bredde ??
    attrs?.Diameter ??
    attrs?.Dimensjon ??
    attrs?.InnvendigDimensjon ??
    attrs?.UtvendigDimensjon ??
    attrs?.VertikalDimensjon ??
    null;

  const n = parseNumber(raw);
  if (!n) return 0.3;

  // Heuristic: values in GMI are typically mm for these fields.
  // If it's "small" (e.g. 0.8), assume meters.
  const diameterMeters = n > 10 ? n / 1000 : n;
  const radius = diameterMeters / 2;
  if (!Number.isFinite(radius) || radius <= 0) return 0.3;

  // Clamp to avoid absurd tolerances from malformed values
  return Math.min(Math.max(radius, 0.3), 5);
}

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

  const pointRadiusMeters = getObjectRadiusMeters(point);

  for (const lok of loks) {
    if (!lok.coordinates || lok.coordinates.length === 0) continue;

    const lokCoord = lok.coordinates[0];
    const dist = distance2D(pointCoord, lokCoord);

    const lokRadiusMeters = getObjectRadiusMeters(lok);
    const sizeAwareTolerance = Math.max(
      MATCH_TOLERANCE,
      (pointRadiusMeters || 0.3) + Math.max(lokRadiusMeters, 0.3)
    );

    if (dist < sizeAwareTolerance && dist < bestDistance) {
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
    return {
      results: [],
      orphanLoks: [],
      summary: { total: 0, missing: 0, ok: 0, orphanLokCount: 0 },
    };
  }

  const results = [];

  // Separate points by type
  const loks = data.points.filter(
    (p) => p.attributes?.S_FCODE === 'LOK'
  );

  const requiresLok = data.points.filter((p) =>
    REQUIRES_LOK.includes(p.attributes?.S_FCODE)
  );

  // Track which LOKs are matched
  const matchedLokIndices = new Set();

  // Check each point that requires a LOK
  requiresLok.forEach((point, index) => {
    const fcode = point.attributes?.S_FCODE || 'UNKNOWN';
    const coord = point.coordinates?.[0];
    const matchingLok = findMatchingLok(point, loks);

    if (matchingLok) {
      matchedLokIndices.add(data.points.indexOf(matchingLok));
    }

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

  // Find orphan LOKs (LOK without corresponding KUM/SLU/SLS/SAN)
  const orphanLoks = [];
  loks.forEach((lok) => {
    const lokIndex = data.points.indexOf(lok);
    if (!matchedLokIndices.has(lokIndex)) {
      const coord = lok.coordinates?.[0];
      orphanLoks.push({
        pointIndex: lokIndex,
        fcode: 'LOK',
        status: 'warning',
        message: 'LOK uten tilhørende KUM/SLU',
        coordinates: coord
          ? { x: coord.x, y: coord.y, z: coord.z }
          : null,
        attributes: lok.attributes || {},
      });
    }
  });

  const summary = {
    total: results.length,
    missing: results.filter((r) => r.status === 'error').length,
    ok: results.filter((r) => r.status === 'ok').length,
    lokCount: loks.length,
    orphanLokCount: orphanLoks.length,
  };

  return { results, orphanLoks, summary };
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
