import proj4 from 'proj4';
// Reuse the existing proj4 CRS definitions, not the permissive map transform.
import '../map/coordinateProjection.js';
import { GEMINI_SOURCE_CRS, GeminiGmlError } from './parseGeminiGml.mjs';

export function buildGeminiMapFeatures(parsed, { project = proj4 } = {}) {
  const features = parsed.records.map((record) => {
    const geometry = record.geometry;
    if (record.sourceCrs !== GEMINI_SOURCE_CRS || !['Point', 'LineString'].includes(geometry.type)) {
      throw new GeminiGmlError('invalid-display-projection');
    }
    const tuples = geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates;
    const coordinates = tuples.map((tuple) => {
      let result;
      try {
        // A copy protects immutable source evidence even from a mutating adapter.
        result = project(GEMINI_SOURCE_CRS, 'EPSG:4326', tuple.slice(0, 2));
      } catch {
        throw new GeminiGmlError('invalid-display-projection');
      }
      if (!Array.isArray(result) || result.length < 2) throw new GeminiGmlError('invalid-display-projection');
      const [longitude, latitude] = result;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) ||
        Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
        throw new GeminiGmlError('invalid-display-projection');
      }
      return Object.freeze([longitude, latitude]);
    });
    return Object.freeze({
      type: 'Feature', id: record.key,
      properties: Object.freeze({ kind: 'gemini-reference', sourceKey: record.key, typeName: record.typeName }),
      geometry: Object.freeze({ type: geometry.type,
        coordinates: geometry.type === 'Point' ? coordinates[0] : Object.freeze(coordinates) }),
    });
  });
  return Object.freeze({ type: 'FeatureCollection', features: Object.freeze(features) });
}
