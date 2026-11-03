import L from 'leaflet';
import { photoMarkerIconKey, photoMarkerOptions } from '@/lib/photos/photoMarkerPresentation.mjs';

// Identical presentation shares one L.divIcon, so React re-renders never call setIcon needlessly.
const MAX_CACHED_ICONS = 2000;
const icons = new Map();

export function photoMarkerIcon(mode, options) {
  const key = photoMarkerIconKey(mode, options);
  let icon = icons.get(key);
  if (!icon) {
    if (icons.size >= MAX_CACHED_ICONS) icons.clear();
    icon = L.divIcon(photoMarkerOptions(mode, options));
    icons.set(key, icon);
  }
  return icon;
}

// Thumbnail URLs are revoked by the session on release; drop icons that may reference them.
export function clearPhotoMarkerIcons() { icons.clear(); }
