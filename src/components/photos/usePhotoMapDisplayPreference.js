'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { PHOTO_MAP_DISPLAY_MODES } from '@/lib/photos/photoMarkerPresentation.mjs';

// A non-sensitive presentation preference only; no photo data is stored.
export const PHOTO_MAP_DISPLAY_KEY = 'gmi-photo-map-display';
const listeners = new Set();
let fallback = 'markers';

function read() {
  try {
    const value = window.localStorage.getItem(PHOTO_MAP_DISPLAY_KEY);
    return PHOTO_MAP_DISPLAY_MODES.includes(value) ? value : fallback;
  } catch { return fallback; }
}
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

export default function usePhotoMapDisplayPreference() {
  const mode = useSyncExternalStore(subscribe, read, () => 'markers');
  const setMode = useCallback((next) => {
    if (!PHOTO_MAP_DISPLAY_MODES.includes(next)) return;
    fallback = next;
    try { window.localStorage.setItem(PHOTO_MAP_DISPLAY_KEY, next); } catch { /* Storage may be unavailable; keep the in-memory choice. */ }
    for (const listener of listeners) listener();
  }, []);
  return [mode, setMode];
}
