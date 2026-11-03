'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

// Leaflet 1.9.4 leaves its 250 ms zoom fallback timer alive after remove().
// Mark the animation finished before that callback can read the removed map pane.
export default function MapLifecycleGuard() {
  const map = useMap();
  useEffect(() => {
    const finishZoom = () => { map._animatingZoom = false; };
    map.on('unload', finishZoom);
    return () => {
      finishZoom();
      map.off('unload', finishZoom);
    };
  }, [map]);
  return null;
}
