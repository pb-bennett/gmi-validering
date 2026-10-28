import proj4 from 'proj4';
import '../map/coordinateProjection.js'; // Existing definitions only; no fallback transform.
import { getOperationalEpsg } from '../telemetry/crs.mjs';
import { getLayerType } from '../layerPresentation.mjs';
import { GeminiServiceError } from './geminiErrors.mjs';

export const GEMINI_BUFFER_METRES = 100;
const SURVEY_TYPES = new Set(['GMI', 'SOSI', 'KOF']);

export function validateGeminiBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || ![...bbox].every(Number.isFinite)) {
    throw new GeminiServiceError('invalid_bbox');
  }
  const [minX, minY, maxX, maxY] = bbox;
  const width = maxX - minX, height = maxY - minY, area = width * height;
  if (width <= 0 || height <= 0 || !Number.isFinite(area)) throw new GeminiServiceError('invalid_bbox');
  // Mirror M1's local-query limits without importing server target/auth policy.
  if (width > 2000 || height > 2000 || area > 4_000_000) {
    throw new GeminiServiceError('extent_too_large', { dimensions: { width, height, area } });
  }
  if (minX < 100000 || maxX > 900000 || minY < 0 || maxY > 10000000) throw new GeminiServiceError('invalid_bbox');
}

export function getGeminiExtent(layer, { bufferMetres = GEMINI_BUFFER_METRES, project = proj4 } = {}) {
  if (!layer?.data || !SURVEY_TYPES.has(getLayerType(layer))) throw new GeminiServiceError('no_survey_source');
  const data = layer.data;
  const epsg = getOperationalEpsg(data);
  if (!epsg) throw new GeminiServiceError('unsupported_crs');
  if (!Number.isFinite(bufferMetres) || bufferMetres <= 0) throw new GeminiServiceError('invalid_bbox');
  if (!Array.isArray(data.points) || !Array.isArray(data.lines)) throw new GeminiServiceError('invalid_survey_coordinate');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, coordinateCount = 0;
  for (const collection of [data.points, data.lines]) {
    for (const feature of collection) {
      if (!Array.isArray(feature?.coordinates) || !feature.coordinates.length) {
        throw new GeminiServiceError('invalid_survey_coordinate');
      }
      for (const coordinate of feature.coordinates) {
        if (!Number.isFinite(coordinate?.x) || !Number.isFinite(coordinate?.y)) {
          throw new GeminiServiceError('invalid_survey_coordinate');
        }
        let xy = [coordinate.x, coordinate.y];
        if (epsg !== 25832) {
          if (epsg === 4326 && (Math.abs(xy[0]) > 180 || Math.abs(xy[1]) > 90)) {
            throw new GeminiServiceError('invalid_survey_coordinate');
          }
          try { xy = project(`EPSG:${epsg}`, 'EPSG:25832', xy); }
          catch { throw new GeminiServiceError('extent_projection_failed'); }
        }
        if (!Array.isArray(xy) || !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) {
          throw new GeminiServiceError('extent_projection_failed');
        }
        minX = Math.min(minX, xy[0]); minY = Math.min(minY, xy[1]);
        maxX = Math.max(maxX, xy[0]); maxY = Math.max(maxY, xy[1]); coordinateCount += 1;
      }
    }
  }
  if (!coordinateCount) throw new GeminiServiceError('no_source_geometry');
  const bbox = Object.freeze([Math.floor(minX - bufferMetres), Math.floor(minY - bufferMetres),
    Math.ceil(maxX + bufferMetres), Math.ceil(maxY + bufferMetres)]);
  validateGeminiBbox(bbox);
  return Object.freeze({ bbox, bufferMetres, sourceCrs: `EPSG:${epsg}`, crs: 'EPSG:25832', coordinateCount });
}
