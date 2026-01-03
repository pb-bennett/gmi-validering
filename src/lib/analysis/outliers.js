/**
 * Outlier Detection Module
 *
 * Detects objects that are far from the main dataset cluster.
 * Uses statistical methods to identify spatial outliers.
 */

/**
 * Calculate the centroid of all coordinates
 * @param {Array} allCoords - Array of {x, y} coordinates
 * @returns {{x: number, y: number}}
 */
function calculateCentroid(allCoords) {
  if (allCoords.length === 0) return { x: 0, y: 0 };

  const sum = allCoords.reduce(
    (acc, coord) => ({ x: acc.x + coord.x, y: acc.y + coord.y }),
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / allCoords.length,
    y: sum.y / allCoords.length,
  };
}

/**
 * Calculate distance from centroid
 * @param {Object} coord - {x, y} coordinate
 * @param {Object} centroid - {x, y} centroid
 * @returns {number}
 */
function distanceFromCentroid(coord, centroid) {
  const dx = coord.x - centroid.x;
  const dy = coord.y - centroid.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate standard deviation
 * @param {Array} values - Array of numbers
 * @param {number} mean - Mean of values
 * @returns {number}
 */
function calculateStdDev(values, mean) {
  if (values.length === 0) return 0;

  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const avgSquaredDiff =
    squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Detect outliers in the dataset
 * Uses Z-score method: points more than 3 standard deviations from the centroid
 *
 * @param {Object} data - GMI data object with points and lines
 * @param {number} threshold - Z-score threshold (default: 3)
 * @returns {Object} - Outlier detection results
 */
export function detectOutliers(data, threshold = 3) {
  if (!data) {
    return {
      outliers: [],
      summary: { totalObjects: 0, outlierCount: 0, threshold },
    };
  }

  const outliers = [];
  const allCoords = [];

  // Collect all coordinates
  (data.points || []).forEach((point, index) => {
    if (point.coordinates && point.coordinates[0]) {
      allCoords.push({
        type: 'point',
        index,
        x: point.coordinates[0].x,
        y: point.coordinates[0].y,
        fcode: point.attributes?.S_FCODE,
        guid: point.guid,
      });
    }
  });

  (data.lines || []).forEach((line, index) => {
    if (line.coordinates && line.coordinates.length > 0) {
      // Use first coordinate of line
      allCoords.push({
        type: 'line',
        index,
        x: line.coordinates[0].x,
        y: line.coordinates[0].y,
        fcode: line.attributes?.S_FCODE,
        guid: line.guid,
      });
    }
  });

  if (allCoords.length < 3) {
    return {
      outliers: [],
      summary: {
        totalObjects: allCoords.length,
        outlierCount: 0,
        threshold,
      },
    };
  }

  // Calculate centroid
  const centroid = calculateCentroid(allCoords);

  // Calculate distances from centroid
  const distances = allCoords.map((c) =>
    distanceFromCentroid(c, centroid)
  );

  // Calculate mean and standard deviation
  const meanDistance =
    distances.reduce((a, b) => a + b, 0) / distances.length;
  const stdDev = calculateStdDev(distances, meanDistance);

  // Identify outliers using Z-score
  allCoords.forEach((coord, i) => {
    const distance = distances[i];
    const zScore =
      stdDev > 0 ? (distance - meanDistance) / stdDev : 0;

    if (zScore > threshold) {
      outliers.push({
        ...coord,
        distance,
        zScore,
        featureId:
          coord.type === 'point'
            ? `punkter-${coord.index}`
            : `ledninger-${coord.index}`,
      });
    }
  });

  // Sort by z-score (most outlying first)
  outliers.sort((a, b) => b.zScore - a.zScore);

  return {
    outliers,
    centroid,
    summary: {
      totalObjects: allCoords.length,
      outlierCount: outliers.length,
      threshold,
      meanDistance,
      stdDev,
    },
  };
}

/**
 * Get IDs of outlier features for filtering
 * @param {Array} outliers - Array of outlier objects
 * @returns {Set<string>}
 */
export function getOutlierFeatureIds(outliers) {
  return new Set(outliers.map((o) => o.featureId));
}
