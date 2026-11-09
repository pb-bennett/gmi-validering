'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Pane, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { normalizePhotoDirection, photoDirectionLabel, photoDirectionSpokenLabel } from '@/lib/photos/photoDirection.mjs';
import { photoPositionSourceKind, photoThumbnailsVisible, PHOTO_STAGED_COLOR } from '@/lib/photos/photoMarkerPresentation.mjs';
import { photoPositionDistance } from '@/lib/photos/photoPositioning.mjs';
import { isPhotoPosition } from '@/lib/photos/photoSpatial.mjs';
import { formatPhotoMoveDistance } from '@/lib/photos/photoPresentation.mjs';
import { PHOTO_PLACEMENT_PANE, PHOTO_PLACEMENT_Z_INDEX } from '@/lib/photos/photoMapPanes.mjs';
import { photoDirectionIcon, photoMarkerIcon } from './photoMarkerIcons';
import { attachPhotoIconTooltip } from './photoIconTooltip';
import { PhotoDirectionMarker, photoMarkerLabel } from './PhotoMarkersLayer';
import './photoEdit.css';

const KNOB_DISTANCE = 56;
const DRAG_THRESHOLD = 3;
const CLICK_AFTER_DRAG_MS = 250;
const positionFrom = (latlng) => ({ crs: 'EPSG:4326', longitude: latlng.wrap().lng, latitude: latlng.lat });
const OVERLAY_SELECTOR = '.leaflet-control, .photo-edit-knob, .leaflet-photo-markers-pane .leaflet-marker-icon, .leaflet-photo-placement-pane .leaflet-marker-icon';

// Unplaced selected photo: one click (never a pan) stages its position. Enter on the focused map uses the centre.
// throughMarkers (explicit «Flytt med klikk» for a placed photo): photo markers no longer catch the click, so a
// crowded spot can be targeted exactly; Escape leaves the mode without staging anything.
function PlacementCapture({ active, throughMarkers = false, onPlace, onCancel }) {
  const map = useMap();
  const latest = useRef({ onPlace, onCancel });
  useEffect(() => { latest.current = { onPlace, onCancel }; });
  useEffect(() => {
    if (!active) return undefined;
    const container = map.getContainer();
    const overlay = throughMarkers ? '.leaflet-control, .photo-edit-knob' : OVERLAY_SELECTOR;
    map.closePopup();
    container.classList.add('photo-edit-placing');
    if (throughMarkers) container.classList.add('photo-edit-click-move');
    let pointerStart = null, pointerDragged = false;
    const down = (event) => {
      pointerDragged = false;
      pointerStart = event.target.closest(overlay) ? null : { x: event.clientX, y: event.clientY, id: event.pointerId };
    };
    const move = (event) => {
      if (pointerStart?.id === event.pointerId && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > DRAG_THRESHOLD) pointerDragged = true;
    };
    const up = (event) => { move(event); pointerStart = null; };
    // Capture before Leaflet's feature, survey highlight and measure handlers. Photo markers still select.
    const click = (event) => {
      if (event.target.closest(overlay)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (pointerDragged || map.dragging?.moved() || map.boxZoom?.moved()) return;
      latest.current.onPlace(positionFrom(map.mouseEventToLatLng(event)));
    };
    const keyboard = (event) => {
      if (event.key !== 'Enter' || event.target !== container) return;
      event.preventDefault(); event.stopImmediatePropagation();
      latest.current.onPlace(positionFrom(map.getCenter()));
    };
    // Escape order: this explicit mode is left first, before the page-level Edit-mode boundary.
    const escape = (event) => {
      if (!throughMarkers || event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault(); event.stopImmediatePropagation();
      latest.current.onCancel?.();
    };
    container.addEventListener('pointerdown', down, true);
    container.addEventListener('pointermove', move, true);
    container.addEventListener('pointerup', up, true);
    container.addEventListener('pointercancel', up, true);
    container.addEventListener('click', click, true);
    container.addEventListener('keydown', keyboard, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      container.classList.remove('photo-edit-placing', 'photo-edit-click-move');
      document.removeEventListener('keydown', escape, true);
      container.removeEventListener('pointerdown', down, true); container.removeEventListener('pointermove', move, true);
      container.removeEventListener('pointerup', up, true); container.removeEventListener('pointercancel', up, true);
      container.removeEventListener('click', click, true); container.removeEventListener('keydown', keyboard, true);
    };
  }, [map, active, throughMarkers]);
  return null;
}

// Imperative handle at the photo position: guide/live arrow, slider knob and readout. React only syncs it
// when the staged value changes; pointer moves update the DOM directly and stage once on release.
function RotationKnob({ photoId, filename, lat, lng, degrees, innerRadius, onStage, onAnnounce, apiRef }) {
  const map = useMap();
  const latest = useRef(null);
  useEffect(() => { latest.current = { photoId, filename, lat, lng, degrees, innerRadius, onStage, onAnnounce }; });
  useEffect(() => {
    const initial = latest.current;
    const marker = L.marker([initial.lat, initial.lng], { pane: PHOTO_PLACEMENT_PANE, interactive: false, keyboard: false, zIndexOffset: 2000,
      icon: L.divIcon({ className: 'photo-edit-knob-marker', html: '', iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(map);
    const root = marker.getElement();
    const size = (KNOB_DISTANCE + 34) * 2;
    root.innerHTML = `<svg class="photo-edit-knob-guide" aria-hidden="true" width="${size}" height="${size}" viewBox="${-size / 2} ${-size / 2} ${size} ${size}"><path class="photo-edit-knob-halo"/><path class="photo-edit-knob-line"/><path class="photo-edit-knob-head"/></svg><div class="photo-edit-knob" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="359"></div><span class="photo-edit-knob-readout" aria-hidden="true"></span>`;
    const knob = root.querySelector('.photo-edit-knob'), readout = root.querySelector('.photo-edit-knob-readout');
    const [halo, line, head] = root.querySelectorAll('path');
    const container = map.getContainer();
    const tooltip = attachPhotoIconTooltip(knob);
    let shown = initial.degrees ?? null, gesture = null, ghostPrompted = false;

    const point = (heading, radius) => {
      const angle = heading * Math.PI / 180;
      return [radius * Math.sin(angle), -radius * Math.cos(angle)];
    };
    const describe = () => {
      const { filename: name } = latest.current;
      const ghost = shown === null;
      const label = ghost ? `Legg til retning for ${name}` : `Retning for ${name}`;
      const text = ghost ? 'Legg til retning' : 'Endre retning';
      knob.setAttribute('aria-label', label);
      knob.dataset.iconTooltip = text;
      if (ghost) { knob.removeAttribute('aria-valuenow'); knob.setAttribute('aria-valuetext', 'Ingen retning angitt'); }
      else { knob.setAttribute('aria-valuenow', String(shown)); knob.setAttribute('aria-valuetext', photoDirectionSpokenLabel(shown)); }
      tooltip.update({ text, label });
    };
    const render = (heading, { rotating = false } = {}) => {
      const ghost = heading === null;
      const [x, y] = point(ghost ? 0 : heading, KNOB_DISTANCE);
      knob.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      knob.classList.toggle('photo-edit-knob-ghost', ghost);
      root.classList.toggle('photo-edit-knob-rotating', rotating);
      if (ghost) { for (const path of [halo, line, head]) path.setAttribute('d', ''); }
      else {
        const [x1, y1] = point(heading, latest.current.innerRadius), [x2, y2] = point(heading, KNOB_DISTANCE - 9);
        const shaft = `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
        halo.setAttribute('d', rotating ? shaft : '');
        line.setAttribute('d', shaft);
        const [hx, hy] = point(heading, KNOB_DISTANCE - 9), left = point(heading - 155, 7), right = point(heading + 155, 7);
        head.setAttribute('d', rotating ? `M${(hx + left[0]).toFixed(1)} ${(hy + left[1]).toFixed(1)}L${hx.toFixed(1)} ${hy.toFixed(1)}L${(hx + right[0]).toFixed(1)} ${(hy + right[1]).toFixed(1)}` : '');
      }
      if (rotating && !ghost) {
        const [rx, ry] = point(heading, KNOB_DISTANCE + 24);
        readout.textContent = photoDirectionLabel(heading);
        readout.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      } else if (!root.classList.contains('photo-edit-knob-moving')) readout.textContent = '';
    };
    const showMove = (text) => {
      root.classList.toggle('photo-edit-knob-moving', Boolean(text));
      readout.textContent = text || '';
      readout.style.transform = `translate(0px, ${KNOB_DISTANCE + 2}px) translate(-50%, -50%)`;
    };
    const angleAt = (event) => {
      const rect = container.getBoundingClientRect(), anchor = map.latLngToContainerPoint(marker.getLatLng());
      // 0° is screen-up, i.e. geographic north on the north-up map; bearings run clockwise.
      return normalizePhotoDirection(Math.atan2(event.clientX - rect.left - anchor.x, -(event.clientY - rect.top - anchor.y)) * 180 / Math.PI);
    };
    const finish = (commit) => {
      const ended = gesture; gesture = null;
      if (!ended) return;
      document.removeEventListener('keydown', escape, true);
      container.classList.remove('photo-edit-gesture', 'photo-edit-rotating');
      if (knob.hasPointerCapture?.(ended.id)) knob.releasePointerCapture(ended.id);
      map.dragging?.enable();
      if (commit && ended.moved && ended.value !== null && ended.value !== ended.start) {
        latest.current.onStage(latest.current.photoId, 'direction', ended.value);
      } else render(ended.start);
    };
    function escape(event) {
      if (event.key !== 'Escape' || !gesture) return;
      event.preventDefault(); event.stopImmediatePropagation();
      finish(false);
      latest.current.onAnnounce?.('Retningsendringen ble avbrutt');
    }
    const down = (event) => {
      if (event.button !== 0 || gesture) return;
      event.preventDefault(); event.stopPropagation();
      tooltip.hide();
      knob.setPointerCapture?.(event.pointerId);
      map.dragging?.disable();
      gesture = { id: event.pointerId, start: shown, value: shown, moved: false, x: event.clientX, y: event.clientY };
      container.classList.add('photo-edit-gesture', 'photo-edit-rotating');
      document.addEventListener('keydown', escape, true);
    };
    const move = (event) => {
      if (gesture?.id !== event.pointerId) return;
      if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= DRAG_THRESHOLD) return;
      gesture.moved = true; gesture.value = angleAt(event);
      render(gesture.value, { rotating: true });
    };
    const up = (event) => { if (gesture?.id === event.pointerId) finish(true); };
    const cancel = (event) => { if (gesture?.id === event.pointerId) finish(false); };
    const keydown = (event) => {
      const steps = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 15, PageDown: -15 };
      let step = steps[event.key];
      if (step === undefined || gesture) return;
      if (event.shiftKey && Math.abs(step) === 1) step *= 15;
      event.preventDefault(); event.stopPropagation();
      const { photoId: id, onStage: stage, onAnnounce: announce } = latest.current;
      // Unknown is never treated as north implicitly: the first key press on the ghost only explains.
      if (shown === null && !ghostPrompted) { ghostPrompted = true; announce?.('Angi retning med piltastene eller i feltet Retning'); return; }
      stage(id, 'direction', normalizePhotoDirection((shown ?? 0) + step), `${id}:direction:keyboard`);
    };
    // Map dragging and clicks must not start from the knob.
    L.DomEvent.on(knob, 'mousedown touchstart dblclick contextmenu', L.DomEvent.stopPropagation);
    knob.addEventListener('pointerdown', down);
    knob.addEventListener('pointermove', move);
    knob.addEventListener('pointerup', up);
    knob.addEventListener('pointercancel', cancel);
    knob.addEventListener('lostpointercapture', cancel);
    knob.addEventListener('keydown', keydown);
    apiRef.current = {
      follow: (latlng, moveText = '') => { marker.setLatLng(latlng); showMove(moveText); },
      sync: (next) => { if (gesture) return; shown = next ?? null; describe(); render(shown); },
      place: (latlng) => { if (!gesture) marker.setLatLng(latlng); },
      focus: () => knob.focus(),
    };
    describe(); render(shown);
    return () => {
      if (gesture) { container.classList.remove('photo-edit-gesture', 'photo-edit-rotating'); map.dragging?.enable(); }
      document.removeEventListener('keydown', escape, true);
      tooltip.destroy(); marker.remove(); apiRef.current = null;
    };
  }, [map, photoId, apiRef]);
  useEffect(() => { apiRef.current?.place([lat, lng]); }, [apiRef, lat, lng]);
  useEffect(() => { apiRef.current?.sync(degrees); }, [apiRef, degrees, filename, innerRadius]);
  return null;
}

// The actual selected marker is the move handle. Its icon/position props are frozen from dragstart to
// dragend so React can never call setIcon/setLatLng (which would abort Leaflet's drag) mid-gesture.
// Its arrow is a separate marker in the direction pane, below every photo like all other arrows. It moves in the
// same drag lifecycle (drag, Escape, and the reset after every gesture), so it never stays behind at the old spot.
// A plain click (no drag) on a stacked selection selects the next occurrence at the same coordinates,
// exactly like stack cycling outside Edit mode; it never moves anything.
function EditableMarker({ photo, mode, stackIds = [], onSelectPhoto, onStage, onAnnounce, knobApi, connectorRef }) {
  const map = useMap();
  const ref = useRef(null);
  const { latitude: lat, longitude: lng } = photo.spatial.current.position;
  const savedPosition = photo.saved ? photo.saved.current?.position : photo.spatial.current.position;
  const icon = photoMarkerIcon(mode, { sourceKind: photoPositionSourceKind(photo), selected: true,
    staged: Boolean(photo.staged), editing: true, thumbnailUrl: photo.preview?.thumbnailUrl || null, stackCount: stackIds.length });
  const directionIcon = photoDirectionIcon(mode, { degrees: photo.direction?.current?.degrees ?? null, directionStaged: Boolean(photo.staged?.direction),
    selected: true, editing: true });
  const arrowRef = useRef(null);
  const position = useMemo(() => [lat, lng], [lat, lng]);
  const [frozen, setFrozen] = useState(null);
  const latest = useRef(null);
  const gesture = useRef(null);
  const dragEndedAt = useRef(-Infinity);
  const label = photoMarkerLabel(photo);
  useEffect(() => { latest.current = { icon, position, photoId: photo.id, savedPosition, onStage, onAnnounce, stackIds, onSelectPhoto }; });
  useEffect(() => {
    const element = ref.current?.getElement();
    if (!element) return;
    element.dataset.photoId = photo.id; element.dataset.editTarget = 'true'; element.dataset.displayMode = mode;
    element.dataset.stackCount = String(stackIds.length || 1);
    const stack = stackIds.length > 1 ? ` ${stackIds.length} bilder på samme sted; klikk for å velge neste.` : '';
    element.setAttribute('aria-label', `${label}. Dra eller bruk piltastene for å flytte.${stack}`);
    element.removeAttribute('title');
  }, [icon, label, mode, photo.id, stackIds.length]);
  // A gesture that ended without a staged change must leave the marker (and its arrow) where React says it is.
  useEffect(() => { if (!frozen) { ref.current?.setLatLng(position); arrowRef.current?.setLatLng(position); } }, [frozen, position]);
  useEffect(() => {
    const active = gesture;
    return () => active.current?.finish(active.current.start);
  }, []);
  const handlers = useMemo(() => ({
    dragstart: (event) => {
      const marker = event.target, container = map.getContainer(), start = marker.getLatLng();
      const finish = (at) => {
        document.removeEventListener('keydown', escape, true);
        container.classList.remove('photo-edit-gesture');
        knobApi.current?.follow(at, '');
        gesture.current = null;
        setFrozen(null);
      };
      function escape(keyEvent) {
        if (keyEvent.key !== 'Escape') return;
        keyEvent.preventDefault(); keyEvent.stopImmediatePropagation();
        // disable() detaches dragend before ending the drag, so restoring here is the whole cancel.
        marker.dragging.disable(); marker.setLatLng(start); marker.dragging.enable();
        arrowRef.current?.setLatLng(start);
        const saved = latest.current.savedPosition;
        if (saved) connectorRef.current?.setLatLngs([[saved.latitude, saved.longitude], start]);
        finish(start);
        latest.current.onAnnounce?.('Flyttingen ble avbrutt');
      }
      gesture.current = { start, finish };
      document.addEventListener('keydown', escape, true);
      container.classList.add('photo-edit-gesture');
      setFrozen({ icon: latest.current.icon, position: latest.current.position });
    },
    drag: (event) => {
      const saved = latest.current.savedPosition;
      const distance = saved ? photoPositionDistance(saved, positionFrom(event.latlng)) : null;
      knobApi.current?.follow(event.latlng, distance === null ? '' : `Flyttes ${formatPhotoMoveDistance(distance)}`);
      arrowRef.current?.setLatLng(event.latlng);
      if (saved) connectorRef.current?.setLatLngs([[saved.latitude, saved.longitude], event.latlng]);
    },
    dragend: (event) => {
      const active = gesture.current;
      if (!active) return;
      const latlng = event.target.getLatLng();
      active.finish(latlng);
      // Staging re-renders the icon; Leaflet's setIcon replaces its drag handler, so it can no longer tell that
      // the trailing click belongs to this drag. Never let that click cycle the stack.
      dragEndedAt.current = performance.now();
      latest.current.onStage(latest.current.photoId, 'position', positionFrom(latlng));
    },
    click: () => {
      // A plain click only: not during a gesture and not the click that ends a drag.
      const { stackIds: ids, photoId, onSelectPhoto: select } = latest.current;
      if (gesture.current || ids.length < 2 || performance.now() - dragEndedAt.current < CLICK_AFTER_DRAG_MS) return;
      select?.(ids[(ids.indexOf(photoId) + 1) % ids.length]);
    },
    keydown: (event) => {
      const original = event.originalEvent;
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[original.key];
      if (!direction || gesture.current) return;
      original.preventDefault(); original.stopPropagation();
      const step = original.shiftKey ? 50 : 5;
      const pixel = map.project(event.target.getLatLng());
      const { photoId, onStage: stage } = latest.current;
      stage(photoId, 'position', positionFrom(map.unproject(pixel.add(L.point(direction[0] * step, direction[1] * step)))), `${photoId}:position:keyboard`);
    },
  }), [map, knobApi, connectorRef]);
  return <>
    {directionIcon && <PhotoDirectionMarker markerRef={arrowRef} photoId={photo.id} lat={(frozen?.position || position)[0]} lng={(frozen?.position || position)[1]}
      mode={mode} icon={directionIcon} zIndexOffset={1500} editing />}
    <Marker ref={ref} pane={PHOTO_PLACEMENT_PANE} position={frozen?.position || position} icon={frozen?.icon || icon}
      draggable keyboard zIndexOffset={1500} eventHandlers={handlers} />
  </>;
}

export default function PhotoEditLayer({ photo, displayMode, connectors = [], stackIds = [], onSelectPhoto, clickMove = false, onClickMoveEnd,
  onStage, onAnnounce, centerRef }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const knobApi = useRef(null), connectorRef = useRef(null);
  const mode = photoThumbnailsVisible(displayMode, zoom) ? 'thumbnails' : 'markers';
  const placed = Boolean(photo) && isPhotoPosition(photo.spatial?.current?.position);
  useEffect(() => {
    const container = map.getContainer();
    container.classList.add('photo-edit-mode');
    map.closePopup();
    if (centerRef) centerRef.current = () => positionFrom(map.getCenter());
    return () => { container.classList.remove('photo-edit-mode'); if (centerRef) centerRef.current = null; };
  }, [map, centerRef]);
  const saved = photo?.saved ? photo.saved.current?.position : photo?.spatial?.current?.position;
  const current = placed ? photo.spatial.current.position : null;
  return <Pane name={PHOTO_PLACEMENT_PANE} style={{ zIndex: PHOTO_PLACEMENT_Z_INDEX }}>
    {connectors.filter((item) => item.photoId !== photo?.id).map((item) => <Polyline key={item.photoId} positions={item.positions} interactive={false}
      pane={PHOTO_PLACEMENT_PANE} className="photo-edit-connector" pathOptions={{ color: PHOTO_STAGED_COLOR, weight: 1.5, dashArray: '4 4', opacity: 0.85 }} />)}
    {placed && saved && <Polyline ref={connectorRef} positions={[[saved.latitude, saved.longitude], [current.latitude, current.longitude]]} interactive={false}
      pane={PHOTO_PLACEMENT_PANE} className="photo-edit-connector photo-edit-connector-selected" pathOptions={{ color: PHOTO_STAGED_COLOR, weight: 1.5, dashArray: '4 4', opacity: 0.9 }} />}
    <PlacementCapture active={Boolean(photo) && (!placed || clickMove)} throughMarkers={placed && clickMove}
      onPlace={(position) => { onStage(photo.id, 'position', position); if (clickMove) onClickMoveEnd?.(); }}
      onCancel={() => { onClickMoveEnd?.(); onAnnounce?.('Flytting med klikk ble avbrutt'); }} />
    {placed && <EditableMarker key={photo.id} photo={photo} mode={mode} stackIds={stackIds} onSelectPhoto={onSelectPhoto} onStage={onStage} onAnnounce={onAnnounce}
      knobApi={knobApi} connectorRef={connectorRef} />}
    {placed && <RotationKnob key={`knob:${photo.id}`} photoId={photo.id} filename={photo.originalFilename || 'Bilde'} lat={current.latitude} lng={current.longitude}
      degrees={photo.direction?.current?.degrees ?? null} innerRadius={mode === 'thumbnails' ? 26 : 14} onStage={onStage} onAnnounce={onAnnounce} apiRef={knobApi} />}
  </Pane>;
}
