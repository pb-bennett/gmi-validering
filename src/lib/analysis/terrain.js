/**
 * Terrain Height Service
 *
 * Fetches terrain elevation data from Geonorge Høydedata API.
 * Features:
 * - Batching requests (max 50 points per request)
 * - In-memory caching by (epsg, x, y)
 * - Rate limiting with concurrency control
 * - Statistics tracking for diagnostics
 *
 * API Docs: https://ws.geonorge.no/hoydedata/v1/
 */

const API_BASE = 'https://ws.geonorge.no/hoydedata/v1';
const MAX_POINTS_PER_REQUEST = 50;
const MAX_CONCURRENT_REQUESTS = 3;
const REQUEST_DELAY_MS = 100; // Minimum delay between requests

// In-memory cache: Map<string, TerrainPoint>
// Key format: `${epsg}:${x.toFixed(2)}:${y.toFixed(2)}`
const cache = new Map();

// Statistics tracking
const stats = {
  requestCount: 0,
  pointsRequested: 0,
  pointsFromCache: 0,
  totalRequestTimeMs: 0,
  errors: 0,
  terrainTypes: new Map(), // Track terrain type occurrences
};

// Request queue for rate limiting
let activeRequests = 0;
const requestQueue = [];

/**
 * Generate cache key for a point
 */
function getCacheKey(epsg, x, y) {
  // Round to 2 decimals for cache key (sufficient precision for terrain)
  return `${epsg}:${x.toFixed(2)}:${y.toFixed(2)}`;
}

/**
 * Get cached terrain point if available
 */
export function getCachedPoint(epsg, x, y) {
  return cache.get(getCacheKey(epsg, x, y)) || null;
}

/**
 * Store point in cache
 */
function cachePoint(epsg, point) {
  const key = getCacheKey(epsg, point.x, point.y);
  cache.set(key, point);
}

/**
 * Get current statistics
 */
export function getTerrainStats() {
  const cacheHitRate =
    stats.pointsRequested > 0
      ? (
          (stats.pointsFromCache / stats.pointsRequested) *
          100
        ).toFixed(1)
      : '0.0';
  const avgRequestTime =
    stats.requestCount > 0
      ? (stats.totalRequestTimeMs / stats.requestCount).toFixed(0)
      : '0';

  return {
    requestCount: stats.requestCount,
    pointsRequested: stats.pointsRequested,
    pointsFromCache: stats.pointsFromCache,
    cacheHitRate: `${cacheHitRate}%`,
    avgRequestTimeMs: `${avgRequestTime}ms`,
    cacheSize: cache.size,
    errors: stats.errors,
    terrainTypes: Object.fromEntries(stats.terrainTypes),
  };
}

/**
 * Reset statistics (for testing/debugging)
 */
export function resetTerrainStats() {
  stats.requestCount = 0;
  stats.pointsRequested = 0;
  stats.pointsFromCache = 0;
  stats.totalRequestTimeMs = 0;
  stats.errors = 0;
  stats.terrainTypes.clear();
}

/**
 * Clear cache (for testing/debugging)
 */
export function clearTerrainCache() {
  cache.clear();
}

/**
 * Process request queue with rate limiting
 */
async function processQueue() {
  if (
    activeRequests >= MAX_CONCURRENT_REQUESTS ||
    requestQueue.length === 0
  ) {
    return;
  }

  const { points, epsg, resolve, reject } = requestQueue.shift();
  activeRequests++;

  try {
    const result = await executeRequest(points, epsg);
    resolve(result);
  } catch (error) {
    reject(error);
  } finally {
    activeRequests--;
    // Small delay before processing next request
    setTimeout(() => processQueue(), REQUEST_DELAY_MS);
  }
}

/**
 * Execute a single API request
 */
async function executeRequest(points, epsg) {
  const startTime = performance.now();
  stats.requestCount++;

  // Format points as [[x,y], [x,y], ...]
  const punkter = points.map((p) => [p.x, p.y]);
  const url = `${API_BASE}/punkt?koordsys=${epsg}&punkter=${encodeURIComponent(
    JSON.stringify(punkter),
  )}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      stats.errors++;
      throw new Error(
        `Geonorge API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    const endTime = performance.now();
    stats.totalRequestTimeMs += endTime - startTime;

    // Process and cache results
    const results = (data.punkter || []).map((p, i) => {
      const terrainPoint = {
        x: p.x,
        y: p.y,
        z: p.z, // May be null for water/missing data
        terreng: p.terreng || null,
        datakilde: p.datakilde || null,
        // Include original request point for matching
        requestX: points[i]?.x,
        requestY: points[i]?.y,
      };

      // Track terrain types
      if (p.terreng) {
        stats.terrainTypes.set(
          p.terreng,
          (stats.terrainTypes.get(p.terreng) || 0) + 1,
        );
      }

      // Cache the result
      cachePoint(epsg, terrainPoint);

      return terrainPoint;
    });

    return results;
  } catch (error) {
    stats.errors++;
    const endTime = performance.now();
    stats.totalRequestTimeMs += endTime - startTime;
    throw error;
  }
}

/**
 * Queue a batch request
 */
function queueRequest(points, epsg) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ points, epsg, resolve, reject });
    processQueue();
  });
}

/**
 * Fetch terrain heights for an array of points.
 * Points should have { x, y } coordinates in the specified EPSG.
 *
 * @param {Array<{x: number, y: number}>} points - Array of points to query
 * @param {number} epsg - EPSG code (e.g., 25832)
 * @returns {Promise<Array<TerrainPoint>>} Array of terrain points with z values
 */
export async function fetchTerrainHeights(points, epsg) {
  if (!points || points.length === 0) {
    return [];
  }

  if (!epsg || typeof epsg !== 'number') {
    throw new Error('Valid EPSG code required for terrain lookup');
  }

  stats.pointsRequested += points.length;

  // Separate cached and uncached points
  const results = new Array(points.length);
  const uncachedPoints = [];
  const uncachedIndices = [];

  points.forEach((p, i) => {
    const cached = getCachedPoint(epsg, p.x, p.y);
    if (cached) {
      results[i] = cached;
      stats.pointsFromCache++;
    } else {
      uncachedPoints.push(p);
      uncachedIndices.push(i);
    }
  });

  // If all points are cached, return immediately
  if (uncachedPoints.length === 0) {
    return results;
  }

  // Batch uncached points into chunks of MAX_POINTS_PER_REQUEST
  const batches = [];
  for (
    let i = 0;
    i < uncachedPoints.length;
    i += MAX_POINTS_PER_REQUEST
  ) {
    batches.push({
      points: uncachedPoints.slice(i, i + MAX_POINTS_PER_REQUEST),
      indices: uncachedIndices.slice(i, i + MAX_POINTS_PER_REQUEST),
    });
  }

  // Execute all batches
  const batchResults = await Promise.all(
    batches.map((batch) => queueRequest(batch.points, epsg)),
  );

  // Merge results back into correct positions
  batches.forEach((batch, batchIndex) => {
    const batchResult = batchResults[batchIndex];
    batch.indices.forEach((originalIndex, resultIndex) => {
      results[originalIndex] = batchResult[resultIndex] || {
        x: batch.points[resultIndex].x,
        y: batch.points[resultIndex].y,
        z: null,
        terreng: null,
        datakilde: null,
        error: true,
      };
    });
  });

  return results;
}

/**
 * Fetch terrain heights for a single line's sampled points.
 * Returns points with terrainZ added.
 *
 * @param {Array<{x: number, y: number, z: number, dist: number}>} profilePoints
 * @param {number} epsg
 * @returns {Promise<Array<ProfilePointWithTerrain>>}
 */
export async function fetchTerrainForProfile(profilePoints, epsg) {
  const terrainResults = await fetchTerrainHeights(
    profilePoints,
    epsg,
  );

  return profilePoints.map((p, i) => ({
    ...p,
    terrainZ: terrainResults[i]?.z ?? null,
    terreng: terrainResults[i]?.terreng ?? null,
    datakilde: terrainResults[i]?.datakilde ?? null,
  }));
}

/**
 * Priority queue insert - adds request to front of queue for priority fetching
 */
export function priorityQueueRequest(points, epsg) {
  return new Promise((resolve, reject) => {
    // Insert at front of queue for priority processing
    requestQueue.unshift({ points, epsg, resolve, reject });
    processQueue();
  });
}

/**
 * Fetch terrain with priority (for currently selected pipe)
 */
export async function fetchTerrainHeightsPriority(points, epsg) {
  if (!points || points.length === 0) {
    return [];
  }

  if (!epsg || typeof epsg !== 'number') {
    throw new Error('Valid EPSG code required for terrain lookup');
  }

  stats.pointsRequested += points.length;

  // Separate cached and uncached points
  const results = new Array(points.length);
  const uncachedPoints = [];
  const uncachedIndices = [];

  points.forEach((p, i) => {
    const cached = getCachedPoint(epsg, p.x, p.y);
    if (cached) {
      results[i] = cached;
      stats.pointsFromCache++;
    } else {
      uncachedPoints.push(p);
      uncachedIndices.push(i);
    }
  });

  if (uncachedPoints.length === 0) {
    return results;
  }

  // Batch and use priority queue
  const batches = [];
  for (
    let i = 0;
    i < uncachedPoints.length;
    i += MAX_POINTS_PER_REQUEST
  ) {
    batches.push({
      points: uncachedPoints.slice(i, i + MAX_POINTS_PER_REQUEST),
      indices: uncachedIndices.slice(i, i + MAX_POINTS_PER_REQUEST),
    });
  }

  const batchResults = await Promise.all(
    batches.map((batch) => priorityQueueRequest(batch.points, epsg)),
  );

  batches.forEach((batch, batchIndex) => {
    const batchResult = batchResults[batchIndex];
    batch.indices.forEach((originalIndex, resultIndex) => {
      results[originalIndex] = batchResult[resultIndex] || {
        x: batch.points[resultIndex].x,
        y: batch.points[resultIndex].y,
        z: null,
        terreng: null,
        datakilde: null,
        error: true,
      };
    });
  });

  return results;
}

/**
 * Analyze overcover for a pipe given terrain data
 *
 * @param {Array} pipePoints - Pipe profile points with { dist, z }
 * @param {Array} terrainPoints - Terrain points with { dist, z }
 * @param {number} minOvercover - Minimum required overcover in meters (default 2)
 * @returns {Object} Overcover analysis result
 */
export function analyzeOvercover(
  pipePoints,
  terrainPoints,
  minOvercover = 2,
) {
  if (
    !terrainPoints ||
    terrainPoints.length === 0 ||
    !pipePoints ||
    pipePoints.length === 0
  ) {
    return {
      hasData: false,
      warnings: [],
      minOvercover: null,
      maxOvercover: null,
      avgOvercover: null,
    };
  }

  const warnings = [];
  let minOC = Infinity;
  let maxOC = -Infinity;
  let sumOC = 0;
  let countOC = 0;

  // For each pipe point, find the closest terrain point and calculate overcover
  for (const pp of pipePoints) {
    let closestTerrain = null;
    let minDistDiff = Infinity;

    for (const tp of terrainPoints) {
      if (tp.z === null || tp.z === undefined) continue;
      const diff = Math.abs(tp.dist - pp.dist);
      if (diff < minDistDiff) {
        minDistDiff = diff;
        closestTerrain = tp;
      }
    }

    if (!closestTerrain) continue;

    const overcover = closestTerrain.z - pp.z;

    if (overcover < minOC) minOC = overcover;
    if (overcover > maxOC) maxOC = overcover;
    sumOC += overcover;
    countOC++;

    // Flag warning if overcover is below minimum (but pipe is actually below terrain)
    if (overcover >= 0 && overcover < minOvercover) {
      warnings.push({
        pipeZ: pp.z,
        terrainZ: closestTerrain.z,
        overcover,
        dist: pp.dist,
        required: minOvercover,
      });
    }
  }

  return {
    hasData: countOC > 0,
    warnings,
    minOvercover: countOC > 0 ? minOC : null,
    maxOvercover: countOC > 0 ? maxOC : null,
    avgOvercover: countOC > 0 ? sumOC / countOC : null,
  };
}
