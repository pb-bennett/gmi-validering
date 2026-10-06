'use client';

/* eslint-disable @next/next/no-img-element -- Reuse the session thumbnail; never create an original URL for map inspection. */
import { photoCaptureTime, photoCurrentSource } from '@/lib/photos/photoPresentation.mjs';
import './photoWorkspace.css';

export default function PhotoMapPopup({ photo, onOpen }) {
  const captureTime = photoCaptureTime(photo);
  return <div className="photo-map-popup">
    {photo.preview.thumbnailUrl && <img src={photo.preview.thumbnailUrl} alt="" />}
    <p className="font-semibold">{photo.originalFilename}</p>
    <p>{photo.spatial.current ? `Plassert · ${photoCurrentSource(photo)}` : 'Uplassert'}</p>
    {photo.dimensions && <p>{photo.dimensions.width} × {photo.dimensions.height} px</p>}
    {captureTime && <p>Fotografert (GML): {captureTime}</p>}
    <button type="button" className="gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1" onClick={onOpen}>Åpne i bildemodul</button>
  </div>;
}
