/**
 * Normalizes a feature to the internal GMI-like structure.
 *
 * Existing app code expects:
 * - point.coordinates: [{x,y,z}]
 * - line.coordinates: [{x,y,z}, ...]
 */

const toCoordObj = (coord) => {
  if (!coord) return null;

  // Already in GMI-like shape
  if (typeof coord === 'object' && !Array.isArray(coord)) {
    if (
      Number.isFinite(Number(coord.x)) &&
      Number.isFinite(Number(coord.y))
    ) {
      return {
        x: Number(coord.x),
        y: Number(coord.y),
        z: Number.isFinite(Number(coord.z)) ? Number(coord.z) : 0,
      };
    }
    return null;
  }

  // GeoJSON-like [x,y,z?]
  if (Array.isArray(coord)) {
    const [x, y, z] = coord;
    if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
      return null;
    }
    return {
      x: Number(x),
      y: Number(y),
      z: Number.isFinite(Number(z)) ? Number(z) : 0,
    };
  }

  return null;
};

export function normalizeFeature({
  id,
  type,
  coordinates,
  attributes = {},
  guid = null,
  extent = null,
}) {
  let normalizedCoordinates = [];

  if (type === 'point') {
    const c = toCoordObj(coordinates);
    normalizedCoordinates = c ? [c] : [];
  } else if (type === 'line') {
    normalizedCoordinates = Array.isArray(coordinates)
      ? coordinates.map(toCoordObj).filter(Boolean)
      : [];
  }

  return {
    id,
    type,
    extent,
    attributes,
    guid,
    coordinates: normalizedCoordinates,
  };
}
