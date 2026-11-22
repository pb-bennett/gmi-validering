'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { photoLayerMapFit, resolvePhotoLocate } from '@/lib/photos/photoMapFeatures.mjs';
import { photoHyperlinkTransferPresentedPhotos } from '@/lib/photos/photoHyperlinkTransferScope.mjs';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';

export default function PhotoMapController({ items, fitRequest, onFitHandled, locateRequest, onLocateHandled, panRequest }) {
  const map = useMap();
  useEffect(() => {
    if (!fitRequest) return;
    map.invalidateSize({ animate: false, pan: false });
    const frame = requestAnimationFrame(() => {
      // Fit what the map shows: a moved photograph sits at its Foreslått (recipient) position, also if it was unplaced.
      const target = photoLayerMapFit(photoHyperlinkTransferPresentedPhotos({ registry: gmiEditSessions, photoSession, photoLayerId: fitRequest.layerId }));
      if (target) fitPhotoLayer(map, target);
      onFitHandled(fitRequest.token);
    });
    return () => cancelAnimationFrame(frame);
  }, [map, fitRequest, onFitHandled]);

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

function fitPhotoLayer(map, { bounds, zoom, maxZoom }) {
  const padding = photoOverlayPadding(map);
  if (zoom === undefined) {
    // Whole-level rounding can leave almost half the usable map empty. Use finer
    // steps for this fit only; keep the existing wheel/button navigation steps.
    const zoomSnap = map.options.zoomSnap;
    try {
      map.options.zoomSnap = 0.25;
      map.fitBounds(bounds, { ...padding, maxZoom, animate: false });
    } finally {
      map.options.zoomSnap = zoomSnap;
    }
    return;
  }
  // Offset the fixed-zoom centre into the same usable area as a bounds fit.
  const centre = map.project(L.latLngBounds(bounds).getCenter(), zoom);
  const offset = L.point(padding.paddingBottomRight).subtract(L.point(padding.paddingTopLeft)).divideBy(2);
  map.setView(map.unproject(centre.add(offset), zoom), zoom, { animate: false });
}

function panClearOfOverlays(map, lat, lng) {
  // The overlay padding is measured from the live DOM, but Leaflet caches its size until the next frame after a
  // resize. Sync it first (keeping the centre, as Leaflet's own resize handler would) so both agree.
  map.invalidateSize({ animate: false });
  const location = [lat, lng];
  map.panInside(location, photoOverlayPadding(map, map.latLngToContainerPoint(location)));
}

// A fit reserves both overlay bands. A selection pan only reserves the band containing the selected point.
function photoOverlayPadding(map, point = null) {
  const container = map.getContainer();
  const box = container.getBoundingClientRect();
  const workspace = container.closest('.photo-workspace-primary');
  const bar = workspace?.querySelector('.photo-edit-command-bar')?.getBoundingClientRect();
  const card = workspace?.querySelector('.photo-map-display-card')?.getBoundingClientRect();
  const margin = point ? 60 : 32;
  const x = box.left + (point?.x ?? 0), y = box.top + (point?.y ?? 0);
  let top = bar && (!point || (x >= bar.left - 24 && x <= bar.right + 24)) ? Math.max(margin, Math.round(bar.bottom - box.top + (point ? 40 : 24))) : margin;
  const landedY = Math.min(Math.max(y, box.top + top), box.bottom - margin);
  let right = card && (!point || (landedY >= card.top - 24 && landedY <= card.bottom + 24)) ? Math.max(margin, Math.round(box.right - card.left + 24)) : margin;
  // On narrow maps a pan can still clear an overlay even when the remaining band is too small for a bounds fit.
  const minimumSpan = point ? 1 : 80;
  if (box.height - top - margin < minimumSpan) top = margin;
  if (box.width - right - margin < minimumSpan) right = margin;
  return { paddingTopLeft: [margin, top], paddingBottomRight: [right, margin] };
}
