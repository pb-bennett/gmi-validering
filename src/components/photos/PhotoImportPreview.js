 'use client';
/* eslint-disable @next/next/no-img-element -- Session-owned local original URLs. */
import { useEffect, useRef, useState } from 'react';
import { ArrowsOutIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { photoPreviewMessage } from '@/lib/photos/imagePreview.mjs';
import PhotoImageViewer from './PhotoImageViewer';
const formatSize = (size) => `${(size / 1024).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} kB`;
export default function PhotoImportPreview({ photo, enableLargeView = true }) {
  const imageRef = useRef(null);
  const [inspectionFailed, setInspectionFailed] = useState(false);
  const [largeImageUrl, setLargeImageUrl] = useState(null);
  const canInspect = photo?.preview.state === 'ready'
    || (photo?.preview.errorCode === 'thumbnail-failed' && Boolean(photo?.dimensions));
  const assetId = photo?.assetId || photo?.id;

  useEffect(() => {
    if (!canInspect) return;
    const file = photoSession.getAssetFile(assetId);
    const image = imageRef.current;
    if (!file || !image) return;
    const url = URL.createObjectURL(file);
    image.src = url;
    return () => {
      image.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [assetId, canInspect]);

  return (
    <section className="photo-collection-inspector" aria-label="Bilde som vises">
      <h3 className="truncate text-sm font-semibold text-gmi-navy" title={photo?.originalFilename}>
        {photo?.originalFilename || 'Velg et bilde'}
      </h3>
      <div className="photo-collection-original">
        {photo && canInspect ? (
          <>
            <img ref={imageRef} alt={photo.originalFilename} decoding="async" onError={() => setInspectionFailed(true)} hidden={inspectionFailed} />
            {enableLargeView && !inspectionFailed && <button type="button" className="photo-preview-open gmi-focus-ring" title="Vis stort" aria-label="Vis stort" onClick={() => {
              const src = imageRef.current?.getAttribute('src'); if (src) setLargeImageUrl(src);
            }}><ArrowsOutIcon size={20} aria-hidden="true" /></button>}
            {inspectionFailed && <p className="p-4 text-sm text-gmi-text-muted">Originalbildet kunne ikke vises.</p>}
          </>
        ) : (
          <p className="p-6 text-center text-sm text-gmi-text-muted">
            {!photo ? 'Velg et bilde fra samlingen for å se originalen her.'
              : photo.preview.state === 'pending' ? 'Forhåndsvisningen klargjøres …'
                : photoPreviewMessage(photo.preview.errorCode)}
          </p>
        )}
      </div>
      {photo && <dl className="photo-collection-facts text-xs">
        <div><dt>Filnavn</dt><dd>{photo.originalFilename}</dd></div>
        {photo.sourceRelativePath?.includes('/') && <div><dt>Mappe</dt><dd>{photo.sourceRelativePath.slice(0, photo.sourceRelativePath.lastIndexOf('/'))}</dd></div>}
        <div><dt>Størrelse</dt><dd>{formatSize(photo.size)}</dd></div>
        <div><dt>Oppløsning</dt><dd>{photo.dimensions ? `${photo.dimensions.width} × ${photo.dimensions.height} px` : 'Ikke tilgjengelig'}</dd></div>
        {photo.metadataEvidence?.filter((item) => item.kind === 'exif' && ['captureTime', 'photographer'].includes(item.field)).map((item) => <div key={item.id}><dt>{item.field === 'captureTime' ? 'Tatt' : 'Fotograf'}</dt><dd>{item.field === 'captureTime' ? (item.value?.iso ? new Date(item.value.iso.replace(/Z$|[+-]\d{2}:\d{2}$/, '') + 'Z').toLocaleString('nb-NO', { timeZone: 'UTC' }) : '') : String(item.value)}</dd></div>)}
        <div><dt>GPS</dt><dd>{photo.spatial.exifRead.state === 'pending' ? 'Leses …' : photo.spatial.candidates.some((item) => item.kind === 'exif' && item.status === 'viable') ? 'Har posisjon' : photo.spatial.exifRead.state === 'no-gps' ? 'Ingen posisjon' : 'Kan ikke brukes'}</dd></div>
        {photo.directionEvidence?.some((item) => item.status === 'usable') && <div><dt>Retning</dt><dd>Har kompassretning</dd></div>}
      </dl>}
      {largeImageUrl && photo?.dimensions && <PhotoImageViewer src={largeImageUrl} filename={photo.originalFilename}
        dimensions={photo.dimensions} onClose={() => setLargeImageUrl(null)} />}
    </section>
  );
}
