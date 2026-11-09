import L from 'leaflet';
import { photoDirectionIconKey, photoDirectionMarkerOptions, photoMarkerIconKey, photoMarkerOptions } from '@/lib/photos/photoMarkerPresentation.mjs';

// Identical presentation shares one L.divIcon, so React re-renders never call setIcon needlessly.
const MAX_CACHED_ICONS = 2000;
const icons = new Map();
const directionIcons = new Map();

function cached(cache, key, create) {
  let icon = cache.get(key);
  if (!icon) {
    if (cache.size >= MAX_CACHED_ICONS) cache.clear();
    icon = create();
    cache.set(key, icon);
  }
  return icon;
}

export function photoMarkerIcon(mode, options) {
  return cached(icons, photoMarkerIconKey(mode, options), () => L.divIcon(photoMarkerOptions(mode, options)));
}

// Arrow icons hold no URLs, so they survive clearPhotoMarkerIcons. Unknown direction: no icon, no arrow marker.
export function photoDirectionIcon(mode, options) {
  const key = photoDirectionIconKey(mode, options);
  return key === null ? null : cached(directionIcons, key, () => L.divIcon(photoDirectionMarkerOptions(mode, options)));
}

// Thumbnail URLs are revoked by the session on release; drop icons that may reference them.
export function clearPhotoMarkerIcons() { icons.clear(); }
