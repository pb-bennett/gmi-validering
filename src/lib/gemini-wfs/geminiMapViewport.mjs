import { getGeminiMapExtent } from './geminiExtent.mjs';
import { GeminiServiceError } from './geminiErrors.mjs';

let readBounds = null;
// A getter reads the actual Leaflet viewport only when the user requests it.
export function bindGeminiMapViewport(getBounds) {
  readBounds = getBounds;
  return () => { if (readBounds === getBounds) readBounds = null; };
}
export function readGeminiMapBbox() {
  if (!readBounds) throw new GeminiServiceError('map_unavailable');
  return getGeminiMapExtent(readBounds());
}
