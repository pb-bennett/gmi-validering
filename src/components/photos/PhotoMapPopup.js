'use client';

/* eslint-disable @next/next/no-img-element -- Reuse the session thumbnail; never create an original URL for map inspection. */
import { useEffect, useState } from 'react';
import { ArrowSquareOutIcon, CaretLeftIcon, CaretRightIcon, XIcon } from '@phosphor-icons/react';
import { photoCaptureTime } from '@/lib/photos/photoPresentation.mjs';
import { photoPositionSourceDescription, photoPositionSourceKind, photoPositionSourcePresentation, photoSourceGlyph } from '@/lib/photos/photoMarkerPresentation.mjs';
import { photoDirectionLabel } from '@/lib/photos/photoDirection.mjs';
import PhotoIconButton from './PhotoIconButton';
import PhotoOccurrenceContext from './PhotoOccurrenceContext';
import './photoWorkspace.css';

// Main-map inspection only. A stack (identical coordinates) pages through its members inside one popup.
export default function PhotoMapPopup({ photo: topPhoto, stack = null, onOpen, onClose, onLayout }) {
  const members = stack?.length > 1 ? stack : [topPhoto];
  const [index, setIndex] = useState(() => Math.max(0, members.findIndex((member) => member.id === topPhoto.id)));
  const photo = members[Math.min(index, members.length - 1)] || topPhoto;
  const captureTime = photoCaptureTime(photo);
  const source = photoPositionSourcePresentation(photoPositionSourceKind(photo));
  useEffect(() => { onLayout?.(); }, [photo.id, onLayout]);
  const page = (step) => setIndex((value) => (value + step + members.length) % members.length);
  return <div className="photo-map-popup" data-photo-id={photo.id}>
    <div className="photo-map-popup-preview">
      {photo.preview.thumbnailUrl ? <img src={photo.preview.thumbnailUrl} alt={photo.originalFilename} onLoad={onLayout} /> : <span>Forhåndsvisning mangler</span>}
      <PhotoIconButton icon={XIcon} label="Lukk bildeforhåndsvisning" onClick={onClose} className="photo-map-popup-close" />
    </div>
    <div className="photo-map-popup-body" key={photo.id}>
      <p className="photo-map-popup-title font-semibold">{photo.originalFilename}</p>
      <p className="photo-map-popup-placement">
        <span style={{ color: source.color }} dangerouslySetInnerHTML={{ __html: photoSourceGlyph(source.kind, 15) }} />
        <span>{photo.spatial.current ? photoPositionSourceDescription(source.kind) : 'Uplassert'}</span>
        {photo.direction?.current && <span className="photo-map-popup-direction">{photoDirectionLabel(photo.direction.current.degrees)}</span>}
      </p>
      <PhotoOccurrenceContext occurrence={photo.occurrence} count={photo.repeatGroup?.occurrenceCount} index={photo.repeatGroup?.occurrenceIndex} objectCount={photo.repeatGroup?.referringObjectCount} compact />
      {captureTime && <p className="photo-map-popup-capture">Godtatt opptakstid: {captureTime}</p>}
      <details className="photo-map-popup-details" onToggle={onLayout}>
        <summary>Bildedetaljer</summary>
        <dl>
          {photo.dimensions && <div><dt>Størrelse</dt><dd>{photo.dimensions.width} × {photo.dimensions.height} px</dd></div>}
          {photo.captureMetadata?.photographer && <div><dt>Fotograf</dt><dd>{photo.captureMetadata.photographer.value}</dd></div>}
          {photo.occurrence && <>
            <div><dt>GUID</dt><dd>{photo.occurrence.object.guid || 'Ikke oppgitt'}</dd></div>
            <div><dt>TEMA / type</dt><dd>{photo.occurrence.object.tema || 'Ikke oppgitt'} / {photo.occurrence.object.type || 'Ikke oppgitt'}</dd></div>
            <div><dt>Kilde</dt><dd>{photo.occurrence.sourceFilename}</dd></div>
          </>}
        </dl>
      </details>
    </div>
    <div className="photo-map-popup-footer">
      {members.length > 1 && <div className="photo-map-popup-stack" role="group" aria-label="Bilder på samme sted">
        <PhotoIconButton icon={CaretLeftIcon} size={14} label="Forrige bilde på samme sted" onClick={() => page(-1)} />
        <span aria-live="polite">{index + 1} av {members.length} på samme sted</span>
        <PhotoIconButton icon={CaretRightIcon} size={14} label="Neste bilde på samme sted" onClick={() => page(1)} />
      </div>}
      <button type="button" className="photo-map-popup-open gmi-primary-control gmi-focus-ring" onClick={() => onOpen(photo.id)}>
        <ArrowSquareOutIcon size={15} weight="regular" aria-hidden="true" />Åpne i bildemodul
      </button>
    </div>
  </div>;
}
