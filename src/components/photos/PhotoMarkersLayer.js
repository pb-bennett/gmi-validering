'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Pane, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { PHOTO_DELIVERY_LABELS, photoStackDeliveryState } from '@/lib/photos/photoMarkerPresentation.mjs';
import PhotoMapPopup from './PhotoMapPopup';
import { photoPositionProvenanceKind, photoPositionSourceDescription, photoPositionSourceKind, photoPositionSourcePresentation, photoThumbnailsVisible } from '@/lib/photos/photoMarkerPresentation.mjs';
import PhotoWorkspaceMapPreview from './PhotoWorkspaceMapPreview';
import { photoDirectionLabel } from '@/lib/photos/photoDirection.mjs';
import { gmiObjectLabel } from '@/lib/photos/gmiPhotoSource.mjs';
import { PHOTO_DIRECTION_PANE, PHOTO_DIRECTION_Z_INDEX, PHOTO_MARKER_PANE, PHOTO_MARKER_Z_INDEX } from '@/lib/photos/photoMapPanes.mjs';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { photoDirectionIcon, photoMarkerIcon } from './photoMarkerIcons';

const PREVIEW_DELAY_MS = 250;
const PREVIEW_SIZE = 220;
const hoverCapable = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

export function photoMarkerLabel(photo, stackCount = 1) {
  const source = photoPositionSourcePresentation(photoPositionSourceKind(photo));
  const filename = photo?.originalFilename || 'Bilde';
  const context = photo?.repeatGroup?.occurrenceCount > 1
    ? ` · plassering ${photo.repeatGroup.occurrenceIndex} av ${photo.repeatGroup.occurrenceCount}${photo.occurrence ? ` · ${gmiObjectLabel(photo.occurrence.object)}` : ''}` : '';
  const direction = photo?.direction?.current ? ` · retning ${photoDirectionLabel(photo.direction.current.degrees)}` : '';
  const stack = stackCount > 1 ? ` · ${stackCount} bilder på samme sted` : '';
  return `Vis bilde: ${filename}${context} · plassering: ${source.label}${direction}${stack}`;
}

// The frame takes the photo's final size before the image loads, so Leaflet positions the tooltip only once.
function previewContent({ thumbnailUrl, filename, photoWidth, photoHeight, sourceKind }) {
  const source = photoPositionSourcePresentation(sourceKind);
  const content = document.createElement('figure');
  const frame = document.createElement('div');
  frame.className = 'photo-thumb-preview-frame';
  if (photoWidth > photoHeight && photoHeight > 0) frame.style.height = `${Math.round(PREVIEW_SIZE * photoHeight / photoWidth)}px`;
  const image = document.createElement('img');
  image.src = thumbnailUrl; image.alt = ''; image.decoding = 'sync'; image.draggable = false;
  frame.append(image);
  const dot = document.createElement('span');
  dot.className = 'photo-source-dot'; dot.style.setProperty('--photo-source', source.color);
  dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', photoPositionSourceDescription(source.kind));
  const name = document.createElement('span');
  name.className = 'photo-thumb-preview-name'; name.textContent = filename;
  const label = document.createElement('span');
  label.className = 'photo-thumb-preview-source'; label.textContent = source.label; label.setAttribute('aria-hidden', 'true');
  const caption = document.createElement('figcaption');
  caption.append(dot, name, label);
  content.append(frame, caption);
  return { content, image };
}

// The presentation model is derived once per render from already-built photos: no session lookups per marker.
// Exact-coordinate stacks are grouped per FOTO layer (workspace and main map alike). In Edit mode the selected
// occurrence is drawn by PhotoEditLayer instead; it still counts as a stack member and carries the stack badge
// there, so no hidden member below it shows a second, smaller count.
// Delivery colours are the default everywhere. Outside the workspace each FOTO layer's saved delivery entries are read
// once per session publish (mainDeliveries), never per marker; the workspace layer uses the workspace's own delivery.
function markerModels(items, workspace, thumbnails, mainDeliveries) {
  const stacks = new Map();
  for (const item of items) {
    if (workspace && item.layerId !== workspace.layerId) continue;
    const [lng, lat] = item.feature.geometry.coordinates;
    const key = `${item.layerId}|${lat}|${lng}`;
    if (!stacks.has(key)) stacks.set(key, []);
    stacks.get(key).push(item.photo);
  }
  const stackTop = new Map();
  for (const [key, members] of stacks) {
    if (members.length < 2) continue;
    if (workspace?.hiddenPhotoId && members.some((photo) => photo.id === workspace.hiddenPhotoId)) continue;
    stackTop.set(key, members.find((photo) => photo.id === workspace?.photoId) || members.findLast((photo) => photo.staged) || members.at(-1));
  }
  return items.flatMap((item) => {
    const { layerId, photo, feature } = item;
    const inWorkspace = workspace?.layerId === layerId;
    if (inWorkspace && photo.id === workspace.hiddenPhotoId) return [];
    const [lng, lat] = feature.geometry.coordinates;
    const stackKey = `${layerId}|${lat}|${lng}`;
    const members = stacks.get(stackKey) || null;
    const top = members && stackTop.get(stackKey);
    const selected = inWorkspace && photo.id === workspace.photoId;
    // Delivery colours apply in every mode and on the main map (default «Leveringsvalg»); only the FOTO workspace offers
    // «Plasseringskilde», drawn from the original source (provenance), so a moved photo keeps its source colour.
    // A drawn stack is coloured by all of its occurrences, so a mixed group never takes the colour of its top member.
    const entries = inWorkspace ? workspace.delivery?.byPhotoId : mainDeliveries?.get(layerId);
    const options = {
      sourceKind: photoPositionProvenanceKind(photo), selected,
      colourMode: inWorkspace ? workspace.colourMode : 'delivery',
      deliveryColourState: entries && members && top === photo ? photoStackDeliveryState(members, entries) : null,
      deliveryStatus: entries?.[photo.id]?.status || null,
      staged: Boolean(photo.staged),
      sibling: inWorkspace && !selected && Boolean(workspace.activeAssetId) && photo.assetId === workspace.activeAssetId,
      stackCount: top === photo ? members.length : 1, editing: false,
      thumbnailUrl: photo.preview?.thumbnailUrl || null,
    };
    // Workspace: miniatures for the workspace layer only. Main map: for every visible FOTO layer.
    const mode = thumbnails && (!workspace || inWorkspace) ? 'thumbnails' : 'markers';
    // The arrow follows the same occurrence, mode and selection as its photo, from this same model.
    const directionIcon = photoDirectionIcon(mode, { degrees: photo.direction?.current?.degrees ?? null, directionStaged: Boolean(photo.staged?.direction),
      selected, sibling: options.sibling });
    return [{ markerKey: feature.id, layerId, photoId: photo.id, lat, lng, mode, icon: photoMarkerIcon(mode, options), directionIcon,
      zIndexOffset: selected ? 1000 : photo.staged ? 500 : top === photo ? 100 : 0,
      label: photoMarkerLabel(photo, top === photo ? members.length : 1)
        + (options.deliveryStatus ? ` · Planlagt: ${PHOTO_DELIVERY_LABELS[options.deliveryStatus]}` : '') + (options.deliveryColourState === 'mixed' ? ' \u00b7 Ulike leveringsvalg p\u00e5 samme sted' : ''), inWorkspace,
      // Edit mode: other FOTO layers are context only, so no popup can switch layers by accident.
      interactive: !(workspace?.editing && !inWorkspace),
      stackIds: top === photo ? members.map((member) => member.id).join('\n') : '',
      thumbnailUrl: options.thumbnailUrl, filename: photo.originalFilename || 'Bilde', assetId: photo.assetId,
      // The hover preview keeps its accepted current-source dot.
      photoWidth: photo.dimensions?.width || 0, photoHeight: photo.dimensions?.height || 0, sourceKind: photoPositionSourceKind(photo),
      // Main map: inspection only. A stack's popup pages through its members; it never edits.
      popupPhoto: inWorkspace || workspace?.editing ? null : photo,
      popupStack: !inWorkspace && !workspace?.editing && top === photo ? members : null }];
  });
}

// Non-interactive and never focusable: hit testing, labels and previews stay on the photo marker above it. Its own
// data-direction-* attributes keep every photo-marker selector ([data-photo-id], [data-edit-target]) off the arrows.
export const PhotoDirectionMarker = memo(function PhotoDirectionMarker({ layerId = null, photoId, lat, lng, mode, icon, zIndexOffset = 0, editing = false, markerRef }) {
  const ownRef = useRef(null);
  const ref = markerRef || ownRef;
  const position = useMemo(() => [lat, lng], [lat, lng]);
  useEffect(() => {
    const element = ref.current?.getElement();
    if (!element) return;
    element.dataset.directionPhotoId = photoId; element.dataset.directionMode = mode;
    if (layerId) element.dataset.directionLayerId = layerId;
    if (editing) element.dataset.directionEditTarget = 'true';
    element.setAttribute('aria-hidden', 'true');
  }, [ref, icon, layerId, photoId, mode, editing]);
  return <Marker ref={ref} position={position} pane={PHOTO_DIRECTION_PANE} icon={icon} zIndexOffset={zIndexOffset}
    interactive={false} keyboard={false} />;
});

const PhotoMarker = memo(function PhotoMarker({ markerKey, layerId, photoId, lat, lng, mode, icon, zIndexOffset, label, inWorkspace,
  interactive, stackIds, thumbnailUrl, filename, assetId, photoWidth, photoHeight, sourceKind, popupPhoto, popupStack, popupWidth, popupHeight, actions }) {
  const ref = useRef(null);
  const popupRef = useRef(null);
  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;
    // Leaflet popup sizing options are construction-only in React Leaflet; keep the viewer inside a resized map.
    Object.assign(popup.options, { minWidth: popupWidth, maxWidth: popupWidth, maxHeight: popupHeight });
    if (popup.isOpen()) popup.update();
  }, [popupWidth, popupHeight]);
  const position = useMemo(() => [lat, lng], [lat, lng]);
  const eventHandlers = useMemo(() => ({
    // Workspace marker click selects and opens the persistent preview; it never changes delivery by itself.
    click: () => { if (inWorkspace) actions.current.select(photoId, stackIds, { preview: true }); },
    popupopen: () => actions.current.clearPreview(),
    keydown: (event) => {
      if (!['Enter', ' '].includes(event.originalEvent?.key)) return;
      event.originalEvent.preventDefault();
      event.originalEvent.stopPropagation();
      if (inWorkspace) actions.current.select(photoId, stackIds, { preview: true });
      else event.target.openPopup();
    },
  }), [actions, inWorkspace, photoId, stackIds]);
  // Leaflet keeps one icon element per marker; accessible name and preview listeners follow the current icon.
  useEffect(() => {
    const element = ref.current?.getElement();
    if (!element) return undefined;
    element.dataset.photoId = photoId; element.dataset.layerId = layerId; element.dataset.displayMode = mode;
    element.dataset.lat = String(lat); element.dataset.lng = String(lng);
    element.setAttribute('aria-label', label);
    // Thumbnail mode shows its own preview; a native title would duplicate it.
    if (mode === 'thumbnails') element.removeAttribute('title'); else element.title = label;
    if (mode !== 'thumbnails' || !interactive) return undefined;
    const preview = { lat, lng, thumbnailUrl, filename, assetId, photoWidth, photoHeight, sourceKind, element };
    const marker = ref.current;
    // Overlapping miniatures: the hovered one comes to the front imperatively, without React state.
    const enter = () => { marker.setZIndexOffset(Math.max(zIndexOffset, 800)); if (hoverCapable()) actions.current.schedulePreview(preview); };
    const focus = () => actions.current.openPreview(preview);
    const leave = () => { marker.setZIndexOffset(zIndexOffset); actions.current?.closePreview(element); };
    element.addEventListener('mouseenter', enter); element.addEventListener('mouseleave', leave);
    element.addEventListener('focus', focus); element.addEventListener('blur', leave);
    return () => {
      element.removeEventListener('mouseenter', enter); element.removeEventListener('mouseleave', leave);
      element.removeEventListener('focus', focus); element.removeEventListener('blur', leave);
      leave();
    };
  }, [actions, icon, label, mode, interactive, layerId, photoId, lat, lng, thumbnailUrl, filename, assetId, photoWidth, photoHeight, sourceKind, zIndexOffset]);
  return <Marker ref={ref} key={markerKey} position={position} pane={PHOTO_MARKER_PANE} icon={icon} zIndexOffset={zIndexOffset}
    interactive={interactive} keyboard={interactive} eventHandlers={eventHandlers}>
    {popupPhoto && <Popup ref={popupRef} pane="popupPane" className="photo-map-viewer-popup" maxWidth={popupWidth} minWidth={popupWidth}
      maxHeight={popupHeight} closeButton={false} autoPanPadding={[24, 24]}>
      <PhotoMapPopup photo={popupPhoto} stack={popupStack} onClose={() => ref.current?.closePopup()}
        onLayout={() => popupRef.current?.update()}
        onOpen={(shownId) => actions.current.openPhoto(layerId, shownId || photoId)} />
    </Popup>}
  </Marker>;
});

// FOTO persistent preview at the selected occurrence. Closed by X or Escape (focus returns to its marker when it was
// inside the map); no map click closes it. React Leaflet re-adds the same popup when it follows another marker, so
// only a close from outside (another map popup opening, say) leaves it off the map; the open state then follows.
function WorkspacePreviewPopup({ photo, lat, lng, mode, width, maxHeight, deliveryEntry, onCycleDelivery, onClose }) {
  const map = useMap();
  const popupRef = useRef(null);
  const latest = useRef(onClose);
  useEffect(() => { latest.current = onClose; });
  const position = useMemo(() => [lat, lng], [lat, lng]);
  const photoId = photo.id;
  const close = useMemo(() => (restoreFocus) => {
    latest.current();
    if (restoreFocus) map.getContainer().querySelector(`.leaflet-photo-markers-pane [data-photo-id="${CSS.escape(photoId)}"]`)?.focus();
  }, [map, photoId]);
  const events = useMemo(() => ({ remove: () => setTimeout(() => {
    const popup = popupRef.current;
    if (popup && !map.hasLayer(popup)) latest.current();
  }, 0) }), [map]);
  useEffect(() => {
    const escape = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      close(map.getContainer().contains(document.activeElement));
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [map, close]);
  return <Popup ref={popupRef} position={position} pane="popupPane" className="photo-workspace-preview-popup" minWidth={width} maxWidth={width}
    maxHeight={maxHeight} offset={[0, mode === 'thumbnails' ? -20 : -6]} closeButton={false} closeOnClick={false} closeOnEscapeKey={false}
    autoPanPadding={[24, 24]} eventHandlers={events}>
    <PhotoWorkspaceMapPreview photo={photo} deliveryEntry={deliveryEntry} onCycleDelivery={(id) => onCycleDelivery?.(id)}
      onClose={() => close(true)} onLayout={() => popupRef.current?.update()} />
  </Popup>;
}

// displayMode: the shared Markører/Miniatyrer preference. In the workspace it applies to the workspace layer;
// on the main map to every visible FOTO layer, with the same zoom-16 fallback to ordinary markers.
export default function PhotoMarkersLayer({ items, workspace = null, displayMode = 'markers', onOpenPhoto, onSelectPhoto }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  const [mapSize, setMapSize] = useState(() => map.getSize());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()), resize: () => setMapSize(map.getSize()) });
  const thumbnails = photoThumbnailsVisible(workspace ? workspace.displayMode : displayMode, zoom);
  // items is rebuilt on every session publish, so the saved delivery entries are re-read exactly then.
  const mainDeliveries = useMemo(() => new Map([...new Set(items.map((item) => item.layerId))]
    .map((layerId) => [layerId, photoSession.getLayerDelivery(layerId)?.byPhotoId || null])), [items]);
  const models = markerModels(items, workspace, thumbnails, mainDeliveries);
  const actions = useRef(null);
  // FOTO persistent preview: open/closed only. It always shows the selected occurrence, so list, inspector and
  // stack cycling stay the one selection. It closes with X, Escape, edit mode, a cleared selection or when the
  // selected occurrence leaves the map (filter or delivery change); it never reopens by itself.
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewModel = workspace && !workspace.editing && workspace.photoId
    ? models.find((model) => model.inWorkspace && model.photoId === workspace.photoId) || null : null;
  if (previewOpen && !previewModel) setPreviewOpen(false);
  const previewPhoto = previewOpen && previewModel ? workspace.photos?.find((photo) => photo.id === previewModel.photoId) || null : null;
  const preview = useRef({ tooltip: null, timer: null, element: null, request: null });

  useEffect(() => {
    const state = preview.current;
    state.tooltip = L.tooltip({ direction: 'top', offset: [0, -26], className: 'photo-thumb-preview', opacity: 1, interactive: false });
    return () => { clearTimeout(state.timer); state.request?.abort(); if (state.tooltip && map.hasLayer(state.tooltip)) map.closeTooltip(state.tooltip); };
  }, [map]);

  useEffect(() => {
    const state = preview.current;
    const open = ({ lat, lng, thumbnailUrl, filename, assetId, photoWidth, photoHeight, sourceKind, element }) => {
      clearTimeout(state.timer);
      if (!thumbnailUrl || map.getContainer().classList.contains('photo-edit-gesture') || map.getContainer().querySelector('.photo-map-viewer-popup')) return;
      state.request?.abort();
      const { content, image } = previewContent({ thumbnailUrl, filename, photoWidth, photoHeight, sourceKind });
      state.element = element;
      state.tooltip.setLatLng([lat, lng]).setContent(content);
      map.openTooltip(state.tooltip);
      const request = new AbortController();
      state.request = request;
      photoSession.requestDisplayPreview(assetId, { signal: request.signal }).then((url) => {
        if (url && !request.signal.aborted) image.src = url;
      });
    };
    actions.current = {
      select: (photoId, stackIds, { preview: withPreview = false } = {}) => {
        const members = stackIds ? stackIds.split('\n') : [];
        // Clicking a stack whose member is already active cycles through the identical coordinates.
        const index = members.indexOf(workspace?.photoId);
        onSelectPhoto?.(index >= 0 ? members[(index + 1) % members.length] : photoId);
        // As with the main-map popups, the transient hover thumbnail gives way to the opened preview.
        if (withPreview && !workspace?.editing) { actions.current.clearPreview(); setPreviewOpen(true); }
      },
      openPhoto: (layerId, photoId) => { map.closePopup(); onOpenPhoto?.(layerId, photoId); },
      schedulePreview: (target) => { clearTimeout(state.timer); state.timer = setTimeout(() => open(target), PREVIEW_DELAY_MS); },
      openPreview: open,
      clearPreview: () => {
        clearTimeout(state.timer);
        state.request?.abort();
        if (state.tooltip && map.hasLayer(state.tooltip)) map.closeTooltip(state.tooltip);
        state.element = null;
      },
      closePreview: (element) => {
        clearTimeout(state.timer);
        if (state.element !== element) return;
        state.request?.abort();
        if (state.tooltip && map.hasLayer(state.tooltip)) map.closeTooltip(state.tooltip);
      },
    };
  });

  // Every arrow is in the lower pane, below every photo in any FOTO layer, including the edit target's arrow
  // (PhotoEditLayer adds it to this pane). One arrow per occurrence; none for unknown direction or a hidden photo.
  return (
    <>
      <Pane name={PHOTO_DIRECTION_PANE} style={{ zIndex: PHOTO_DIRECTION_Z_INDEX, pointerEvents: 'none' }}>
        {models.map((model) => model.directionIcon && <PhotoDirectionMarker key={model.markerKey} layerId={model.layerId} photoId={model.photoId}
          lat={model.lat} lng={model.lng} mode={model.mode} icon={model.directionIcon} zIndexOffset={model.zIndexOffset} />)}
      </Pane>
      <Pane name={PHOTO_MARKER_PANE} style={{ zIndex: PHOTO_MARKER_Z_INDEX }}>
        {models.map(({ directionIcon, ...model }) => <PhotoMarker key={`${model.markerKey}:${model.interactive ? 'i' : 'n'}`} {...model}
          popupWidth={Math.min(340, Math.max(160, mapSize.x - 64))} popupHeight={Math.max(160, mapSize.y - 80)} actions={actions} />)}
      </Pane>
      {previewPhoto && <WorkspacePreviewPopup photo={previewPhoto} lat={previewModel.lat} lng={previewModel.lng} mode={previewModel.mode}
        width={Math.min(320, Math.max(160, mapSize.x - 64))} maxHeight={Math.max(160, mapSize.y - 80)}
        deliveryEntry={workspace.delivery?.byPhotoId[previewPhoto.id] || null} onCycleDelivery={workspace.onToggleDelivery}
        onClose={() => setPreviewOpen(false)} />}
    </>
  );
}
