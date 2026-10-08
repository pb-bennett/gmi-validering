'use client';

import { useEffect } from 'react';
import { Marker, Pane, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { proposalMarkerOptions } from '@/lib/photos/photoMarkerPresentation.mjs';
import './photoManualPlacement.css';

const proposalIcon = L.divIcon(proposalMarkerOptions);
const positionFrom = (latlng) => ({ crs: 'EPSG:4326', longitude: latlng.wrap().lng, latitude: latlng.lat });

export default function PhotoManualPlacementLayer({ transaction, onPropose }) {
  const map = useMap();
  const active = Boolean(transaction);
  useEffect(() => {
    if (!active) return;
    const container = map.getContainer();
    map.closePopup();
    container.classList.add('photo-placement-active');
    let pointerStart = null;
    let pointerDragged = false;
    const down = (event) => {
      pointerDragged = false;
      pointerStart = event.target.closest('.leaflet-control, .photo-proposed-marker') ? null
        : { x: event.clientX, y: event.clientY, id: event.pointerId };
    };
    const move = (event) => {
      if (pointerStart?.id === event.pointerId && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 3) pointerDragged = true;
    };
    const up = (event) => { move(event); pointerStart = null; };
    // Capture before Leaflet's feature, survey highlight and measure handlers.
    const click = (event) => {
      if (event.target.closest('.leaflet-control, .photo-proposed-marker')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      // A pan/box-zoom gesture must never become a placement click.
      if (pointerDragged || map.dragging?.moved() || map.boxZoom?.moved()) return;
      onPropose(positionFrom(map.mouseEventToLatLng(event)));
    };
    const keyboard = (event) => {
      if (event.key !== 'Enter' || event.target !== container) return;
      event.preventDefault(); event.stopImmediatePropagation(); onPropose(positionFrom(map.getCenter()));
    };
    container.addEventListener('pointerdown', down, true);
    container.addEventListener('pointermove', move, true);
    container.addEventListener('pointerup', up, true);
    container.addEventListener('pointercancel', up, true);
    container.addEventListener('click', click, true);
    container.addEventListener('keydown', keyboard, true);
    return () => {
      container.classList.remove('photo-placement-active');
      container.removeEventListener('pointerdown', down, true); container.removeEventListener('pointermove', move, true);
      container.removeEventListener('pointerup', up, true); container.removeEventListener('pointercancel', up, true);
      container.removeEventListener('click', click, true); container.removeEventListener('keydown', keyboard, true);
    };
  }, [map, active, onPropose]);
  if (!transaction?.position) return null;
  const { position, ticket } = transaction;
  const point = [position.latitude, position.longitude];
  const current = ticket.expectedCurrent?.position;
  return <Pane name="photo-placement" style={{ zIndex: 610 }}>
    {current && <Polyline positions={[[current.latitude, current.longitude], point]} interactive={false} className="photo-placement-connector"
      pathOptions={{ color: '#a34c00', weight: 1, dashArray: '4 4', opacity: 0.8 }} />}
    <Marker position={point} icon={proposalIcon} draggable keyboard zIndexOffset={1500}
      title="Foreslått bildeposisjon. Dra eller bruk piltastene for å justere." alt="Foreslått bildeposisjon"
      eventHandlers={{ dragend: (event) => onPropose(positionFrom(event.target.getLatLng())), keydown: (event) => {
        const original = event.originalEvent;
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const direction = directions[original.key];
        if (!direction) return;
        original.preventDefault(); original.stopPropagation();
        const pixel = map.project(event.target.getLatLng());
        const step = original.shiftKey ? 50 : 5;
        onPropose(positionFrom(map.unproject(pixel.add(L.point(direction[0] * step, direction[1] * step)))));
      } }} />
  </Pane>;
}
