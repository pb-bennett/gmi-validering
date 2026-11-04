'use client';

/* eslint-disable @next/next/no-img-element -- Reuse the session thumbnail; never create an original URL for map inspection. */
import { useState } from 'react';
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { photoCaptureTime, photoCurrentSource } from '@/lib/photos/photoPresentation.mjs';
import PhotoIconButton from './PhotoIconButton';
import PhotoOccurrenceContext from './PhotoOccurrenceContext';
import './photoWorkspace.css';

// Main-map inspection only. A stack (identical coordinates) pages through its members inside one popup.
export default function PhotoMapPopup({ photo: topPhoto, stack = null, onOpen }) {
  const members = stack?.length > 1 ? stack : [topPhoto];
  const [index, setIndex] = useState(() => Math.max(0, members.findIndex((member) => member.id === topPhoto.id)));
  const photo = members[Math.min(index, members.length - 1)] || topPhoto;
  const captureTime = photoCaptureTime(photo);
  const page = (step) => setIndex((value) => (value + step + members.length) % members.length);
  return <div className="photo-map-popup" data-photo-id={photo.id}>
    {members.length > 1 && <div className="photo-map-popup-stack" role="group" aria-label="Bilder på samme sted">
      <PhotoIconButton icon={CaretLeftIcon} size={14} label="Forrige bilde på samme sted" onClick={() => page(-1)} />
      <span aria-live="polite">{index + 1} av {members.length} på samme sted</span>
      <PhotoIconButton icon={CaretRightIcon} size={14} label="Neste bilde på samme sted" onClick={() => page(1)} />
    </div>}
    {photo.preview.thumbnailUrl && <img src={photo.preview.thumbnailUrl} alt="" />}
    <p className="font-semibold">{photo.originalFilename}</p>
    <PhotoOccurrenceContext occurrence={photo.occurrence} count={photo.repeatGroup?.occurrenceCount} index={photo.repeatGroup?.occurrenceIndex} objectCount={photo.repeatGroup?.referringObjectCount} compact />
    <p>{photo.spatial.current ? `Plassert · ${photoCurrentSource(photo)}` : 'Uplassert'}</p>
    {photo.dimensions && <p>{photo.dimensions.width} × {photo.dimensions.height} px</p>}
    {captureTime && <p>Godtatt opptakstid: {captureTime}</p>}
    {photo.captureMetadata?.photographer && <p>Fotograf: {photo.captureMetadata.photographer.value}</p>}
    <button type="button" className="gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1" onClick={() => onOpen(photo.id)}>Åpne i bildemodul</button>
  </div>;
}
