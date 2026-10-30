import proj4 from 'proj4';
import '../map/coordinateProjection.js'; // Existing definitions only; no fallback transform.
import { getOperationalEpsg } from '../telemetry/crs.mjs';
import { getLayerType } from '../layerPresentation.mjs';
import { GeminiServiceError } from './geminiErrors.mjs';
import { GEMINI_ABSOLUTE_SIDE_METRES, GEMINI_ABSOLUTE_AREA_SQUARE_METRES } from './geminiCoveragePolicy.mjs';

export const GEMINI_BUFFER_METRES = 100;
const SURVEY_TYPES = new Set(['GMI', 'SOSI', 'KOF']);

export function isGeminiSurveyLayer(layer) {
  // Only the application's survey domain. Explicit external/reference types cannot masquerade as surveys.
  return Boolean(layer?.data && (!layer.type || SURVEY_TYPES.has(layer.type)) && SURVEY_TYPES.has(getLayerType(layer)) &&
    [layer.data.points, layer.data.lines].some((features) => Array.isArray(features) &&
      features.some((feature) => Array.isArray(feature?.coordinates) && feature.coordinates.length > 0)));
}

// Leaflet bounds are WGS84, independently of the survey's declared CRS. Sample
// every edge as well as corners so projection curvature contributes to the envelope.
export function getGeminiMapExtent(bounds, { project = proj4 } = {}) {
  const west = bounds.getWest(), east = bounds.getEast(), south = bounds.getSouth(), north = bounds.getNorth();
  if (![west, east, south, north].every(Number.isFinite) || west < -180 || east > 180 ||
    south < -90 || north > 90 || west >= east || south >= north) throw new GeminiServiceError('invalid_bbox');
  const coordinates = [];
  for (let i = 0; i <= 16; i += 1) {
    const longitude = west + (east - west) * i / 16, latitude = south + (north - south) * i / 16;
    for (const xy of [[longitude, south], [longitude, north], [west, latitude], [east, latitude]]) {
      let projected;
      try { projected = project('EPSG:4326', 'EPSG:25832', xy); }
      catch { throw new GeminiServiceError('extent_projection_failed'); }
      if (!Array.isArray(projected) || projected.length < 2 || !projected.every(Number.isFinite)) throw new GeminiServiceError('extent_projection_failed');
      coordinates.push(projected);
    }
  }
  // No rounding or survey buffer is added to a map request.
  return Object.freeze([Math.min(...coordinates.map(([x]) => x)), Math.min(...coordinates.map(([, y]) => y)),
    Math.max(...coordinates.map(([x]) => x)), Math.max(...coordinates.map(([, y]) => y))]);
}

export function validateGeminiBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || ![...bbox].every(Number.isFinite)) {
    throw new GeminiServiceError('invalid_bbox');
  }
  const [minX, minY, maxX, maxY] = bbox;
  const width = maxX - minX, height = maxY - minY, area = width * height;
  if (width <= 0 || height <= 0 || !Number.isFinite(area)) throw new GeminiServiceError('invalid_bbox');
  // Mirror M1's local-query limits without importing server target/auth policy.
  if (width > GEMINI_ABSOLUTE_SIDE_METRES || height > GEMINI_ABSOLUTE_SIDE_METRES || area > GEMINI_ABSOLUTE_AREA_SQUARE_METRES) {
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
