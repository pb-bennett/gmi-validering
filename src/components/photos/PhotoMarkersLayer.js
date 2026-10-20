'use client';

import { Marker, Pane, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import PhotoMapPopup from './PhotoMapPopup';
import { cameraMarkerOptions } from '@/lib/photos/photoMarkerPresentation.mjs';
import { gmiObjectLabel } from '@/lib/photos/gmiPhotoSource.mjs';
import { PHOTO_MARKER_PANE, PHOTO_MARKER_Z_INDEX } from '@/lib/photos/photoMapPanes.mjs';

const cameraIcon = L.divIcon(cameraMarkerOptions());
const selectedCameraIcon = L.divIcon(cameraMarkerOptions({ selected: true }));

export default function PhotoMarkersLayer({ features, onOpenPhoto, photoWorkspaceSelection, onSelectPhoto, placementActive = false, directionEdit }) {
  const map = useMap();
  return (
    <Pane name={PHOTO_MARKER_PANE} style={{ zIndex: PHOTO_MARKER_Z_INDEX }}>
      {features.map((feature) => {
        const { layerId, photoId } = feature.properties;
        const photo = photoSession.getPhoto(photoId);
        const filename = photo?.originalFilename || 'Bilde';
        const context = photo?.repeatGroup?.occurrenceCount > 1
          ? ` · plassering ${photo.repeatGroup.occurrenceIndex} av ${photo.repeatGroup.occurrenceCount}${photo.occurrence ? ` · ${gmiObjectLabel(photo.occurrence.object)}` : ''}` : '';
        const inWorkspace = photoWorkspaceSelection?.layerId === layerId;
        const selected = inWorkspace && photoWorkspaceSelection.photoId === photoId;
        const editingDirection = selected && directionEdit?.ticket.photoId === photoId && directionEdit.ticket.layerId === layerId;
        const degrees = editingDirection ? directionEdit.degrees : photo?.direction?.current?.degrees;
        const icon = selected && degrees != null
          ? L.divIcon(cameraMarkerOptions({ selected: true, degrees, proposed: Boolean(editingDirection) }))
          : selected ? selectedCameraIcon : cameraIcon;
        const inspect = () => {
          if (placementActive) return;
          if (inWorkspace) onSelectPhoto?.(photoId);
          // Normal click is handled once by Leaflet's bound Popup.
          // Opening it here too can make its toggle handler immediately close it.
        };
        return <Marker key={feature.id} position={[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]}
          pane={PHOTO_MARKER_PANE} icon={icon} zIndexOffset={selected ? 1000 : 0}
          title={`Vis bilde: ${filename}${context}`} alt={`Vis bilde: ${filename}${context}`} keyboard
          eventHandlers={{ click: inspect, keydown: (event) => {
            if (!['Enter', ' '].includes(event.originalEvent?.key)) return;
            event.originalEvent.preventDefault();
            event.originalEvent.stopPropagation();
            if (!placementActive && !inWorkspace) event.target.openPopup();
            else inspect();
          } }}>
          {!placementActive && !inWorkspace && photo && <Popup pane="popupPane" maxWidth={230} minWidth={190}>
            <PhotoMapPopup photo={photo} onOpen={() => { map.closePopup(); onOpenPhoto?.(layerId, photoId); }} />
          </Popup>}
        </Marker>;
      })}
    </Pane>
  );
}
