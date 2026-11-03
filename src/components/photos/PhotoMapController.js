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
    map.panInside([lat, lng], { padding: [60, 60] });
  }, [map, panRequest]);
  return null;
}
