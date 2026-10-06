'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { resolvePhotoLocate } from '@/lib/photos/photoMapFeatures.mjs';

export default function PhotoMapController({ features, hasSurveyData, locateRequest, onLocateHandled }) {
  const map = useMap();
  const initialFitDone = useRef(false);
  useEffect(() => {
    if (hasSurveyData || locateRequest) { initialFitDone.current = true; return; }
    if (initialFitDone.current || !features.length) return;
    initialFitDone.current = true;
    const coordinates = features.map((feature) => [feature.geometry.coordinates[1], feature.geometry.coordinates[0]]);
    const bounds = L.latLngBounds(coordinates);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
  }, [map, features, hasSurveyData, locateRequest]);

  useEffect(() => {
    if (!locateRequest) return;
    const position = resolvePhotoLocate(photoSession, locateRequest);
    if (position) {
      map.invalidateSize({ animate: false, pan: false });
      map.setView([position.latitude, position.longitude], 18, { animate: false });
    }
    onLocateHandled?.();
  }, [map, locateRequest, onLocateHandled]);
  return null;
}
