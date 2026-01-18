/**
 * Line Sampling Utility
 *
 * Generates sample points along a polyline at fixed intervals.
 * Used for terrain profile generation.
 *
 * Features:
 * - Vector-based sampling at configurable intervals (default 1m)
 * - Carries remainder across segments for uniform spacing
 * - Always includes endpoints
 * - Handles edge cases (zero-length segments, short lines)
 */

const DEFAULT_SAMPLE_INTERVAL = 1; // meters

/**
 * Calculate 2D distance between two points
 */
function distance2D(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Interpolate a point along a segment
 * @param {Object} p1 - Start point {x, y, z?}
 * @param {Object} p2 - End point {x, y, z?}
 * @param {number} t - Interpolation factor (0-1)
 * @returns {Object} Interpolated point
 */
function interpolatePoint(p1, p2, t) {
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t,
    // Optionally interpolate z if both points have it
    z:
      typeof p1.z === 'number' && typeof p2.z === 'number'
        ? p1.z + (p2.z - p1.z) * t
        : null,
  };
}

/**
 * Sample points along a polyline at fixed intervals.
 *
 * @param {Array<{x: number, y: number, z?: number}>} coordinates - Ordered list of polyline vertices
 * @param {number} interval - Sampling interval in meters (default 1m)
 * @returns {Array<{x: number, y: number, z?: number, dist: number, isVertex: boolean}>}
 */
export function samplePointsAlongLine(
  coordinates,
  interval = DEFAULT_SAMPLE_INTERVAL
) {
  if (!coordinates || coordinates.length === 0) {
    return [];
  }

  // Single point - just return it
  if (coordinates.length === 1) {
    return [
      {
        x: coordinates[0].x,
        y: coordinates[0].y,
        z: coordinates[0].z ?? null,
        dist: 0,
        isVertex: true,
        vertexIndex: 0,
      },
    ];
  }

  const samples = [];
  let cumulativeDistance = 0;
  let distanceToNextSample = 0; // Start at 0 to include first point

  // Add first point
  samples.push({
    x: coordinates[0].x,
    y: coordinates[0].y,
    z: coordinates[0].z ?? null,
    dist: 0,
    isVertex: true,
    vertexIndex: 0,
  });

  // Process each segment
  for (let i = 0; i < coordinates.length - 1; i++) {
    const p1 = coordinates[i];
    const p2 = coordinates[i + 1];
    const segmentLength = distance2D(p1, p2);

    // Skip zero-length segments (duplicate points)
    if (segmentLength < 0.0001) {
      continue;
    }

    // Position along this segment where we start sampling
    let positionInSegment = distanceToNextSample;

    // Place samples along this segment
    while (positionInSegment < segmentLength) {
      const t = positionInSegment / segmentLength;
      const point = interpolatePoint(p1, p2, t);

      samples.push({
        x: point.x,
        y: point.y,
        z: point.z,
        dist: cumulativeDistance + positionInSegment,
        isVertex: false,
        vertexIndex: null,
      });

      positionInSegment += interval;
    }

    // Calculate remainder to carry to next segment
    distanceToNextSample = positionInSegment - segmentLength;
    cumulativeDistance += segmentLength;

    // Check if end vertex should be added (if we're at the last segment)
    if (i === coordinates.length - 2) {
      // Check if last sample is not already at the end point
      const lastSample = samples[samples.length - 1];
      const distToEnd = cumulativeDistance - lastSample.dist;

      // Add end point if it's not too close to the last sample (avoid duplicates)
      if (distToEnd > 0.01) {
        samples.push({
          x: p2.x,
          y: p2.y,
          z: p2.z ?? null,
          dist: cumulativeDistance,
          isVertex: true,
          vertexIndex: coordinates.length - 1,
        });
      } else {
        // Mark last sample as vertex if it's essentially at the endpoint
        samples[samples.length - 1].isVertex = true;
        samples[samples.length - 1].vertexIndex = coordinates.length - 1;
      }
    }
  }

  return samples;
}

/**
 * Calculate total 2D length of a polyline
 */
export function calculateLineLength(coordinates) {
  if (!coordinates || coordinates.length < 2) {
    return 0;
  }

  let totalLength = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    totalLength += distance2D(coordinates[i], coordinates[i + 1]);
  }
  return totalLength;
}

/**
 * Generate profile points for a line, including all original vertices
 * plus sampled points at regular intervals.
 *
 * @param {Array<{x: number, y: number, z?: number}>} coordinates
 * @param {number} interval - Sampling interval in meters
 * @returns {Array<{x: number, y: number, z?: number, dist: number, isVertex: boolean}>}
 */
export function generateProfilePoints(
  coordinates,
  interval = DEFAULT_SAMPLE_INTERVAL
) {
  if (!coordinates || coordinates.length < 2) {
    return coordinates?.length === 1
      ? [
          {
            x: coordinates[0].x,
            y: coordinates[0].y,
            z: coordinates[0].z ?? null,
            dist: 0,
            isVertex: true,
            vertexIndex: 0,
          },
        ]
      : [];
  }

  // For very short lines (shorter than interval), just return endpoints
  const totalLength = calculateLineLength(coordinates);
  if (totalLength <= interval) {
    return [
      {
        x: coordinates[0].x,
        y: coordinates[0].y,
        z: coordinates[0].z ?? null,
        dist: 0,
        isVertex: true,
        vertexIndex: 0,
      },
      {
        x: coordinates[coordinates.length - 1].x,
        y: coordinates[coordinates.length - 1].y,
        z: coordinates[coordinates.length - 1].z ?? null,
        dist: totalLength,
        isVertex: true,
        vertexIndex: coordinates.length - 1,
      },
    ];
  }

  // Generate sampled points
  const sampledPoints = samplePointsAlongLine(coordinates, interval);

  // Build a combined list including all original vertices
  // The sampled points already include endpoints due to samplePointsAlongLine logic
  // We need to ensure all intermediate vertices are also included

  const allPoints = [...sampledPoints];
  let cumulativeDistance = 0;

  // Add any intermediate vertices that might have been skipped
  for (let i = 1; i < coordinates.length - 1; i++) {
    cumulativeDistance += distance2D(coordinates[i - 1], coordinates[i]);

    // Check if this vertex is already in the list (by distance)
    const existsInSamples = allPoints.some(
      (p) => Math.abs(p.dist - cumulativeDistance) < 0.01
    );

    if (!existsInSamples) {
      allPoints.push({
        x: coordinates[i].x,
        y: coordinates[i].y,
        z: coordinates[i].z ?? null,
        dist: cumulativeDistance,
        isVertex: true,
        vertexIndex: i,
      });
    }
  }

  // Sort by distance
  allPoints.sort((a, b) => a.dist - b.dist);

  return allPoints;
}

/**
 * Get only the points needed for terrain API calls (excludes points with valid Z
 * if we only want terrain, not pipe elevation).
 * For terrain profile, we need all sampled points regardless of pipe Z.
 *
 * @param {Array<{x: number, y: number, dist: number}>} profilePoints
 * @returns {Array<{x: number, y: number, dist: number}>}
 */
export function getTerrainQueryPoints(profilePoints) {
  // Return all points - we need terrain for every sample
  return profilePoints.map((p) => ({
    x: p.x,
    y: p.y,
    dist: p.dist,
  }));
}
