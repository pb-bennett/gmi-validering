const CARTO_POSITRON_RASTER_URL =
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

export const CARTO_BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function getCartoBasemapUrl(key) {
  const configuredKey = typeof key === 'string' ? key.trim() : '';
  return configuredKey
    ? `${CARTO_POSITRON_RASTER_URL}?key=${encodeURIComponent(configuredKey)}`
    : null;
}
