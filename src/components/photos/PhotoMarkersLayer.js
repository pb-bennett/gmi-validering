'use client';

import { Marker, Pane, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import PhotoMapPopup from './PhotoMapPopup';

const cameraGlyph = (size, selected = false) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" stroke-linejoin="round"><path d="M3 7h4l2-3h6l2 3h4v13H3z" fill="${selected ? 'currentColor' : '#ffffffcc'}" stroke="white" stroke-width="4"/><path d="M3 7h4l2-3h6l2 3h4v13H3z" fill="${selected ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="${selected ? 'white' : 'currentColor'}" stroke-width="2"/></svg>`;
const cameraIcon = L.divIcon({ className: 'photo-camera-marker', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -9], html: cameraGlyph(16) });
const selectedCameraIcon = L.divIcon({ className: 'photo-camera-marker photo-camera-marker-selected', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -9], html: cameraGlyph(22, true) });

export default function PhotoMarkersLayer({ features, onOpenPhoto, photoWorkspaceSelection, onSelectPhoto }) {
  const map = useMap();
  return (
    <Pane name="photo-markers" style={{ zIndex: 590 }}>
      {features.map((feature) => {
        const { layerId, photoId } = feature.properties;
        const photo = photoSession.getPhoto(photoId);
        const filename = photo?.originalFilename || 'Bilde';
        const inWorkspace = photoWorkspaceSelection?.layerId === layerId;
        const selected = inWorkspace && photoWorkspaceSelection.photoId === photoId;
        const inspect = (event) => {
          if (inWorkspace) onSelectPhoto?.(photoId);
          else event.target.openPopup();
        };
        return <Marker key={feature.id} position={[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]}
          icon={selected ? selectedCameraIcon : cameraIcon} zIndexOffset={selected ? 1000 : 0}
          title={`Vis bilde: ${filename}`} alt={`Vis bilde: ${filename}`} keyboard
          eventHandlers={{ click: inspect, keydown: (event) => {
            if (!['Enter', ' '].includes(event.originalEvent?.key)) return;
            event.originalEvent.preventDefault();
            event.originalEvent.stopPropagation();
            inspect(event);
          } }}>
          {!inWorkspace && photo && <Popup pane="popupPane" maxWidth={230} minWidth={190}>
            <PhotoMapPopup photo={photo} onOpen={() => { map.closePopup(); onOpenPhoto?.(layerId, photoId); }} />
          </Popup>}
        </Marker>;
      })}
    </Pane>
  );
}
