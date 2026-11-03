'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Pane, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import PhotoMapPopup from './PhotoMapPopup';
import { photoPositionSourceKind, photoPositionSourcePresentation, photoThumbnailsVisible } from '@/lib/photos/photoMarkerPresentation.mjs';
import { photoDirectionLabel } from '@/lib/photos/photoDirection.mjs';
import { gmiObjectLabel } from '@/lib/photos/gmiPhotoSource.mjs';
import { PHOTO_MARKER_PANE, PHOTO_MARKER_Z_INDEX } from '@/lib/photos/photoMapPanes.mjs';
import { photoMarkerIcon } from './photoMarkerIcons';

const PREVIEW_DELAY_MS = 250;
const hoverCapable = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

export function photoMarkerLabel(photo) {
  const source = photoPositionSourcePresentation(photoPositionSourceKind(photo));
  const filename = photo?.originalFilename || 'Bilde';
  const context = photo?.repeatGroup?.occurrenceCount > 1
    ? ` · plassering ${photo.repeatGroup.occurrenceIndex} av ${photo.repeatGroup.occurrenceCount}${photo.occurrence ? ` · ${gmiObjectLabel(photo.occurrence.object)}` : ''}` : '';
  const direction = photo?.direction?.current ? ` · retning ${photoDirectionLabel(photo.direction.current.degrees)}` : '';
  return `Vis bilde: ${filename}${context} · plassering: ${source.label}${direction}`;
}

// The presentation model is derived once per render from already-built photos: no session lookups per marker.
function markerModels(items, workspace, thumbnails) {
  const stacks = new Map();
  const workspaceItems = workspace ? items.filter((item) => item.layerId === workspace.layerId && item.photo.id !== workspace.hiddenPhotoId) : [];
  for (const item of workspaceItems) {
    const [lng, lat] = item.feature.geometry.coordinates;
    const key = `${lat}|${lng}`;
    if (!stacks.has(key)) stacks.set(key, []);
    stacks.get(key).push(item.photo);
  }
  const stackTop = new Map();
  for (const [key, members] of stacks) {
    if (members.length < 2) continue;
    stackTop.set(key, members.find((photo) => photo.id === workspace.photoId) || members.findLast((photo) => photo.staged) || members.at(-1));
  }
  return items.flatMap((item) => {
    const { layerId, photo, feature } = item;
    const inWorkspace = workspace?.layerId === layerId;
    if (inWorkspace && photo.id === workspace.hiddenPhotoId) return [];
    const [lng, lat] = feature.geometry.coordinates;
    const members = inWorkspace ? stacks.get(`${lat}|${lng}`) : null;
    const top = members && stackTop.get(`${lat}|${lng}`);
    const selected = inWorkspace && photo.id === workspace.photoId;
    const options = {
      sourceKind: photoPositionSourceKind(photo), selected, degrees: photo.direction?.current?.degrees ?? null,
      staged: Boolean(photo.staged), directionStaged: Boolean(photo.staged?.direction),
      sibling: inWorkspace && !selected && Boolean(workspace.activeAssetId) && photo.assetId === workspace.activeAssetId,
      stackCount: top === photo ? members.length : 1, editing: false,
      thumbnailUrl: photo.preview?.thumbnailUrl || null,
    };
    const mode = inWorkspace && thumbnails ? 'thumbnails' : 'markers';
    return [{ markerKey: feature.id, layerId, photoId: photo.id, lat, lng, mode, icon: photoMarkerIcon(mode, options),
      zIndexOffset: selected ? 1000 : photo.staged ? 500 : top === photo ? 100 : 0,
      label: photoMarkerLabel(photo), inWorkspace,
      // Edit mode: other FOTO layers are context only, so no popup can switch layers by accident.
      interactive: !(workspace?.editing && !inWorkspace),
      stackIds: top === photo ? members.map((member) => member.id).join('\n') : '',
      thumbnailUrl: options.thumbnailUrl, filename: photo.originalFilename || 'Bilde',
      popupPhoto: inWorkspace || workspace?.editing ? null : photo }];
  });
}

const PhotoMarker = memo(function PhotoMarker({ markerKey, layerId, photoId, lat, lng, mode, icon, zIndexOffset, label, inWorkspace,
  interactive, stackIds, thumbnailUrl, filename, popupPhoto, actions }) {
  const ref = useRef(null);
  const position = useMemo(() => [lat, lng], [lat, lng]);
  const eventHandlers = useMemo(() => ({
    click: () => { if (inWorkspace) actions.current.select(photoId, stackIds); },
    keydown: (event) => {
      if (!['Enter', ' '].includes(event.originalEvent?.key)) return;
      event.originalEvent.preventDefault();
      event.originalEvent.stopPropagation();
      if (inWorkspace) actions.current.select(photoId, stackIds);
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
    const preview = { lat, lng, thumbnailUrl, filename, element };
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
  }, [actions, icon, label, mode, interactive, layerId, photoId, lat, lng, thumbnailUrl, filename, zIndexOffset]);
  return <Marker ref={ref} key={markerKey} position={position} pane={PHOTO_MARKER_PANE} icon={icon} zIndexOffset={zIndexOffset}
    interactive={interactive} keyboard={interactive} eventHandlers={eventHandlers}>
    {popupPhoto && <Popup pane="popupPane" maxWidth={230} minWidth={190}>
      <PhotoMapPopup photo={popupPhoto} onOpen={() => actions.current.openPhoto(layerId, photoId)} />
    </Popup>}
  </Marker>;
});

export default function PhotoMarkersLayer({ items, workspace = null, onOpenPhoto, onSelectPhoto }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const thumbnails = Boolean(workspace) && photoThumbnailsVisible(workspace.displayMode, zoom);
  const models = markerModels(items, workspace, thumbnails);
  const actions = useRef(null);
  const preview = useRef({ tooltip: null, timer: null, element: null });

  useEffect(() => {
    const state = preview.current;
    state.tooltip = L.tooltip({ direction: 'top', offset: [0, -26], className: 'photo-thumb-preview', opacity: 1, interactive: false });
    return () => { clearTimeout(state.timer); if (state.tooltip && map.hasLayer(state.tooltip)) map.closeTooltip(state.tooltip); };
  }, [map]);

  useEffect(() => {
    const state = preview.current;
    const open = ({ lat, lng, thumbnailUrl, filename, element }) => {
      clearTimeout(state.timer);
      if (!thumbnailUrl || map.getContainer().classList.contains('photo-edit-gesture')) return;
      const content = document.createElement('figure');
      const image = document.createElement('img');
      image.src = thumbnailUrl; image.alt = ''; image.decoding = 'async'; image.draggable = false;
      const caption = document.createElement('figcaption');
      caption.textContent = filename;
      content.append(image, caption);
      state.element = element;
      state.tooltip.setLatLng([lat, lng]).setContent(content);
      map.openTooltip(state.tooltip);
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
      closePreview: (element) => {
        clearTimeout(state.timer);
        if (state.element === element && state.tooltip && map.hasLayer(state.tooltip)) map.closeTooltip(state.tooltip);
      },
    };
  });

  return (
    <Pane name={PHOTO_MARKER_PANE} style={{ zIndex: PHOTO_MARKER_Z_INDEX }}>
      {models.map((model) => <PhotoMarker key={`${model.markerKey}:${model.interactive ? 'i' : 'n'}`} {...model} actions={actions} />)}
    </Pane>
  );
}
