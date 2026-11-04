'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { resolvePhotoLocate } from '@/lib/photos/photoMapFeatures.mjs';

export default function PhotoMapController({ items, hasSurveyData, locateRequest, onLocateHandled, panRequest }) {
  const map = useMap();
  const initialFitDone = useRef(false);
  useEffect(() => {
    if (hasSurveyData || locateRequest) { initialFitDone.current = true; return; }
    if (initialFitDone.current || !items.length) return;
    initialFitDone.current = true;
    // A first manual placement is already in the user's chosen map view.
    if (items.every((item) => item.photo.spatial.current?.basis.kind === 'manual')) return;
    const bounds = L.latLngBounds(items.map((item) => [item.feature.geometry.coordinates[1], item.feature.geometry.coordinates[0]]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
  }, [map, items, hasSurveyData, locateRequest]);

  useEffect(() => {
    if (!locateRequest) return;
    const position = resolvePhotoLocate(photoSession, locateRequest);
    if (position) {
      map.invalidateSize({ animate: false, pan: false });
      map.setView([position.latitude, position.longitude], 18, { animate: false });
    }
    onLocateHandled?.();
  }, [map, locateRequest, onLocateHandled]);

  // List selection keeps the selected photo in view without changing zoom; zooming stays explicit.
  // Only the request identity triggers a pan, so later item updates never move the map.
  const latestItems = useRef(items);
  useEffect(() => { latestItems.current = items; });
  useEffect(() => {
    if (!panRequest) return;
    const item = latestItems.current.find((entry) => entry.layerId === panRequest.layerId && entry.photo.id === panRequest.photoId);
    if (!item) return;
    const [lng, lat] = item.feature.geometry.coordinates;
    // A previous selection pan may still be animating. Measuring now would use a moving map, and map.stop()
    // re-centres on the mid-animation centre, so wait for that animation to end (private Leaflet 1.9 flag).
    const pan = () => panClearOfOverlays(map, lat, lng);
    if (map._panAnim?._inProgress) { map.once('moveend', pan); return () => map.off('moveend', pan); }
    pan();
    return undefined;
  }, [map, panRequest]);
  return null;
}

// Keep the selected photo clear of the overlays floating on the map: the Edit command bar (top band) and the
// display card (right). On a small map a padding is dropped rather than leaving no usable area.
function panClearOfOverlays(map, lat, lng) {
  const box = map.getContainer().getBoundingClientRect();
  const bar = document.querySelector('.photo-edit-command-bar')?.getBoundingClientRect();
  const card = document.querySelector('.photo-map-display-card')?.getBoundingClientRect();
  const point = map.latLngToContainerPoint([lat, lng]), x = box.left + point.x, y = box.top + point.y;
  // Each overlay only matters for photos in its own band, so large maps are not panned needlessly.
  let top = bar && x >= bar.left - 24 && x <= bar.right + 24 ? Math.max(60, Math.round(bar.bottom - box.top + 40)) : 60;
  const landedY = Math.min(Math.max(y, box.top + top), box.bottom - 60);
  let right = card && landedY >= card.top - 24 && landedY <= card.bottom + 24 ? Math.max(60, Math.round(box.right - card.left + 24)) : 60;
  if (box.height - top - 60 < 80) top = 60;
  if (box.width - right - 60 < 80) right = 60;
  map.panInside([lat, lng], { paddingTopLeft: [60, top], paddingBottomRight: [right, 60] });
}
