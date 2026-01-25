/**
 * Z-Validation Analysis
 *
 * Checks that all objects have valid Z values.
 * - All points (all coordinates in point geometry)
 * - All line vertices (all coordinates in line geometry)
 */

const isValidZ = (value) => {
  if (value === null || value === undefined) return false;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return false;
  return num !== 0;
};

const getObjectLabel = (attributes = {}) => {
  return (
    attributes.S_FCODE ||
    attributes.Tema ||
    attributes.FCODE ||
    attributes.Type ||
    attributes.objekttypenavn ||
    attributes.OBJEKTTYPENAVN ||
    'Ukjent'
  );
};

export function analyzeZValues(data) {
  if (!data) {
    return {
      summary: {
        totalPoints: 0,
        totalLines: 0,
        totalPointCoords: 0,
        totalLineCoords: 0,
        missingPointObjects: 0,
        missingLineObjects: 0,
        missingPointCoords: 0,
        missingLineCoords: 0,
      },
      missingPoints: [],
      missingLines: [],
    };
  }

  const points = Array.isArray(data.points) ? data.points : [];
  const lines = Array.isArray(data.lines) ? data.lines : [];

  const missingPoints = [];
  const missingLines = [];

  let totalPointCoords = 0;
  let totalLineCoords = 0;
  let missingPointCoords = 0;
  let missingLineCoords = 0;

  points.forEach((point, index) => {
    const coords = Array.isArray(point?.coordinates)
      ? point.coordinates
      : [];
    totalPointCoords += coords.length;

    const missingIndices = [];
    coords.forEach((coord, coordIndex) => {
      if (!isValidZ(coord?.z)) {
        missingIndices.push(coordIndex);
        missingPointCoords += 1;
      }
    });

    if (missingIndices.length > 0) {
      missingPoints.push({
        index,
        label: getObjectLabel(point?.attributes),
        missingIndices,
        totalCoords: coords.length,
      });
    }
  });

  lines.forEach((line, index) => {
    const coords = Array.isArray(line?.coordinates)
      ? line.coordinates
      : [];
    totalLineCoords += coords.length;

    const missingIndices = [];
    coords.forEach((coord, coordIndex) => {
      if (!isValidZ(coord?.z)) {
        missingIndices.push(coordIndex);
        missingLineCoords += 1;
      }
    });

    if (missingIndices.length > 0) {
      missingLines.push({
        index,
        label: getObjectLabel(line?.attributes),
        missingIndices,
        totalCoords: coords.length,
      });
    }
  });

  return {
    summary: {
      totalPoints: points.length,
      totalLines: lines.length,
      totalPointCoords,
      totalLineCoords,
      missingPointObjects: missingPoints.length,
      missingLineObjects: missingLines.length,
      missingPointCoords,
      missingLineCoords,
    },
    missingPoints,
    missingLines,
  };
}
