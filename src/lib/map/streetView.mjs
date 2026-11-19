// Batch F: Google Street View from a map position. Only a public URL in a new browser tab: no embedded map, no API key
// and no coverage lookup. Nothing is sent anywhere until the user drops the symbol or picks a point explicitly.
export const STREET_VIEW_BASE = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=';

const wrapLongitude = (longitude) => ((((longitude + 180) % 360) + 360) % 360) - 180;

/**
 * The Street View URL for a geographic position (WGS84 degrees), or null when it cannot be one. Longitudes from a
 * wrapped world are brought back to −180…180; latitudes outside ±90 are refused. Seven decimals (about 1 cm).
 */
export function streetViewUrl(position) {
  const latitude = Number(position?.lat ?? position?.latitude);
  const longitude = Number(position?.lng ?? position?.lon ?? position?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90) return null;
  const fixed = (value) => value.toFixed(7).replace(/\.?0+$/, '').replace(/^-0$/, '0');
  return `${STREET_VIEW_BASE}${fixed(latitude)},${fixed(wrapLongitude(longitude))}`;
}

/**
 * Opens the URL in a new tab without giving it a handle back to this app. Returns false when the browser blocked the
 * tab, so the caller can offer an explicit link instead.
 */
export function openStreetView(url, open = globalThis.window?.open?.bind(globalThis.window)) {
  if (!url || !open) return false;
  const tab = open(url, '_blank');
  if (!tab) return false;
  try { tab.opener = null; } catch { /* a cross-origin tab already has no access */ }
  return true;
}
