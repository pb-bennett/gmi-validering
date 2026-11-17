'use client';

/* eslint-disable @next/next/no-img-element -- Session-owned blob URLs: the thumbnail, then its display preview. */
import { useEffect } from 'react';
import { ArrowsOutCardinalIcon, XIcon } from '@phosphor-icons/react';
import PhotoIconButton from './PhotoIconButton';
import PhotoDeliveryCycleButton from './PhotoDeliveryCycleButton';
import { useDisplayPreview } from './PhotoMapPopup';
import './photoWorkspace.css';

// FOTO workspace only: the persistent preview opened by a marker click. Deliberately small (image and filename);
// delivery and placement controls reuse the existing actions for this exact occurrence.
export default function PhotoWorkspaceMapPreview({ photo, deliveryEntry = null, onCycleDelivery, onEditPlacement, onClose, onLayout }) {
  const imageUrl = useDisplayPreview(photo);
  useEffect(() => { onLayout?.(); }, [photo.id, imageUrl, onLayout]);
  const repeat = photo.repeatGroup?.occurrenceCount > 1 ? `plassering ${photo.repeatGroup.occurrenceIndex} av ${photo.repeatGroup.occurrenceCount}` : null;
  const filename = photo.originalFilename || 'Bilde';
  return <div className="photo-map-popup photo-workspace-map-preview" data-photo-id={photo.id}>
    <div className="photo-map-popup-preview">
      {imageUrl ? <img src={imageUrl} alt={filename} onLoad={onLayout} /> : <span>Forhåndsvisning mangler</span>}
      {onEditPlacement && <PhotoIconButton icon={ArrowsOutCardinalIcon} label="Juster plassering og retning" tooltip="Juster plassering og retning" onClick={onEditPlacement} className="photo-workspace-map-preview-edit" />}
      <PhotoIconButton icon={XIcon} label="Lukk bildeforhåndsvisning" onClick={onClose} className="photo-map-popup-close" />
    </div>
    <div className="photo-workspace-map-preview-caption">
      <p className="photo-map-popup-title font-semibold" title={filename}>{filename}{repeat && <span className="photo-workspace-map-preview-repeat"> · {repeat}</span>}</p>
      {deliveryEntry && <PhotoDeliveryCycleButton entry={deliveryEntry} label={`${filename}${repeat ? ` · ${repeat}` : ''}`} onCycle={onCycleDelivery} />}
    </div>
  </div>;
}
