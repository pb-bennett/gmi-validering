'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Pane, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import PhotoDeliveryMapPopup from './PhotoDeliveryMapPopup';
import { PHOTO_DELIVERY_LABELS, photoStackDeliveryState } from '@/lib/photos/photoMarkerPresentation.mjs';
import PhotoMapPopup from './PhotoMapPopup';
import { photoPositionSourceDescription, photoPositionSourceKind, photoPositionSourcePresentation, photoThumbnailsVisible } from '@/lib/photos/photoMarkerPresentation.mjs';
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
function markerModels(items, workspace, thumbnails) {
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
    const options = {
      sourceKind: photoPositionSourceKind(photo), selected,
      colourMode: inWorkspace ? workspace.colourMode : 'provenance',
      deliveryColourState: inWorkspace && members ? photoStackDeliveryState(members, workspace.delivery?.byPhotoId) : null,
      deliveryStatus: inWorkspace ? workspace.delivery?.byPhotoId[photo.id]?.status : null,
      batchSelected: inWorkspace && workspace.deliveryMode && workspace.deliveryIds?.includes(photo.id),
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
      label: photoMarkerLabel(photo, top === photo ? members.length : 1).replace(/^Vis bilde:/, inWorkspace && workspace.deliveryMode ? 'Velg plassering:' : 'Vis bilde:')
        + (options.deliveryStatus ? ` · Planlagt: ${PHOTO_DELIVERY_LABELS[options.deliveryStatus]}` : '') + (options.deliveryColourState === 'mixed' ? ' \u00b7 Ulike leveringsvalg p\u00e5 samme sted; velg en plassering for detaljer' : '') + (options.batchSelected ? ' · Valgt for samlet levering' : ''), inWorkspace,
      deliveryWorkspace: inWorkspace && workspace.deliveryMode ? workspace : null,
      deliveryMembers: inWorkspace && workspace.deliveryMode ? (top === photo ? members : [photo]) : null,
      // Edit mode: other FOTO layers are context only, so no popup can switch layers by accident.
      interactive: !(workspace?.editing && !inWorkspace),
      stackIds: top === photo ? members.map((member) => member.id).join('\n') : '',
      thumbnailUrl: options.thumbnailUrl, filename: photo.originalFilename || 'Bilde', assetId: photo.assetId,
      photoWidth: photo.dimensions?.width || 0, photoHeight: photo.dimensions?.height || 0, sourceKind: options.sourceKind,
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
  interactive, stackIds, deliveryWorkspace, deliveryMembers, thumbnailUrl, filename, assetId, photoWidth, photoHeight, sourceKind, popupPhoto, popupStack, popupWidth, popupHeight, actions }) {
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
    click: () => { if (deliveryWorkspace) { if (deliveryMembers.length === 1) deliveryWorkspace.onToggleDelivery(photoId); } else if (inWorkspace) actions.current.select(photoId, stackIds); },
    popupopen: () => actions.current.clearPreview(),
    keydown: (event) => {
      if (!['Enter', ' '].includes(event.originalEvent?.key)) return;
      event.originalEvent.preventDefault();
      event.originalEvent.stopPropagation();
      if (deliveryWorkspace) { if (deliveryMembers.length === 1) deliveryWorkspace.onToggleDelivery(photoId); event.target.openPopup(); }
      else if (inWorkspace) actions.current.select(photoId, stackIds);
      else event.target.openPopup();
    },
  }), [actions, inWorkspace, photoId, stackIds, deliveryWorkspace, deliveryMembers]);
  // Leaflet keeps one icon element per marker; accessible name and preview listeners follow the current icon.
  useEffect(() => {
    const element = ref.current?.getElement();
    if (!element) return undefined;
    element.dataset.photoId = photoId; element.dataset.layerId = layerId; element.dataset.displayMode = mode;
    element.dataset.lat = String(lat); element.dataset.lng = String(lng);
    element.setAttribute('aria-label', label);
    if (deliveryWorkspace) element.setAttribute('aria-pressed', String(deliveryWorkspace.deliveryIds?.includes(photoId) || false));
    else element.removeAttribute('aria-pressed');
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
  }, [actions, icon, label, mode, interactive, layerId, photoId, lat, lng, thumbnailUrl, filename, assetId, photoWidth, photoHeight, sourceKind, zIndexOffset, deliveryWorkspace]);
  return <Marker ref={ref} key={markerKey} position={position} pane={PHOTO_MARKER_PANE} icon={icon} zIndexOffset={zIndexOffset}
    interactive={interactive} keyboard={interactive} eventHandlers={eventHandlers}>
    {deliveryWorkspace && <Popup className="photo-delivery-map-popup" maxWidth={320} maxHeight={280}>
      <PhotoDeliveryMapPopup members={deliveryMembers} workspace={deliveryWorkspace} layerId={layerId} onLayout={() => ref.current?.getPopup()?.update()} />
    </Popup>}
    {popupPhoto && <Popup ref={popupRef} pane="popupPane" className="photo-map-viewer-popup" maxWidth={popupWidth} minWidth={popupWidth}
      maxHeight={popupHeight} closeButton={false} autoPanPadding={[24, 24]}>
      <PhotoMapPopup photo={popupPhoto} stack={popupStack} onClose={() => ref.current?.closePopup()}
        onLayout={() => popupRef.current?.update()}
        onOpen={(shownId) => actions.current.openPhoto(layerId, shownId || photoId)} />
    </Popup>}
  </Marker>;
});

// displayMode: the shared Markører/Miniatyrer preference. In the workspace it applies to the workspace layer;
// on the main map to every visible FOTO layer, with the same zoom-16 fallback to ordinary markers.
export default function PhotoMarkersLayer({ items, workspace = null, displayMode = 'markers', onOpenPhoto, onSelectPhoto }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  const [mapSize, setMapSize] = useState(() => map.getSize());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()), resize: () => setMapSize(map.getSize()) });
  const thumbnails = photoThumbnailsVisible(workspace ? workspace.displayMode : displayMode, zoom);
  const models = markerModels(items, workspace, thumbnails);
  const actions = useRef(null);
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
      select: (photoId, stackIds) => {
        const members = stackIds ? stackIds.split('\n') : [];
        // Clicking a stack whose member is already active cycles through the identical coordinates.
        const index = members.indexOf(workspace?.photoId);
        onSelectPhoto?.(index >= 0 ? members[(index + 1) % members.length] : photoId);
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
    </>
  );
}
