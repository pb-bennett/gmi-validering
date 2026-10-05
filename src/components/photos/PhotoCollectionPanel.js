'use client';

/* eslint-disable @next/next/no-img-element -- Local Blob URLs must render in the browser without server image optimization. */
import { useEffect, useRef, useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { photoPreviewMessage } from '@/lib/photos/imagePreview.mjs';

function formatSize(size) {
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} MB`
    : `${(size / 1024).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} kB`;
}

export default function PhotoCollectionPanel({ photos, selectedId, batchSelectedIds, onInspect = photoSession.select }) {
  return (
    <section className="photo-collection-gallery" aria-label="Alle importerte bilder">
      {photos.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-gmi-text-muted">
          <h3 className="text-lg font-semibold text-gmi-navy">Ingen bilder ennå</h3>
          <p className="max-w-sm text-sm">Importer flere bilder eller slipp dem her. Nye importer legges til i samlingen.</p>
          <p className="text-xs">Forhåndsvisning: JPEG, PNG og WebP.</p>
        </div>
      ) : (
        <ul className="photo-collection-grid">
          {photos.map((photo) => (
            <li key={photo.id} className="relative min-w-0">
              <button
                type="button"
                onClick={() => onInspect(photo.id)}
                aria-pressed={photo.id === selectedId}
                aria-label={`Vis ${photo.originalFilename}`}
                className={`photo-collection-card gmi-focus-ring ${photo.id === selectedId ? 'photo-collection-card-selected' : ''}`}
              >
                <div className="photo-collection-thumbnail">
                  {photo.preview.state === 'ready' ? (
                    <img src={photo.preview.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="p-2 text-xs text-gmi-text-muted">
                      {photo.preview.state === 'pending' ? 'Lager miniatyrbilde …' : photoPreviewMessage(photo.preview.errorCode)}
                    </span>
                  )}
                </div>
                <span className="block truncate px-2 pt-2 text-xs font-medium" title={photo.originalFilename}>{photo.originalFilename}</span>
                <span className="block px-2 pb-2 pt-1 text-[11px] text-gmi-text-subtle">
                  {photo.id === selectedId ? 'Vises · ' : ''}{formatSize(photo.size)}
                </span>
              </button>
              {batchSelectedIds && (
                <button type="button" className="photo-batch-toggle gmi-focus-ring"
                  aria-label={`Velg ${photo.originalFilename} for fjerning`}
                  aria-pressed={batchSelectedIds.includes(photo.id)}
                  title="Velg for fjerning; klikk bildet for å inspisere"
                  onClick={() => photoSession.toggleBatchSelection(photo.id)}>
                  <span className="photo-batch-circle" aria-hidden="true"><span /></span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SelectedPhotoInspector({ photo }) {
  const imageRef = useRef(null);
  const [inspectionFailed, setInspectionFailed] = useState(false);
  const canInspect = photo?.preview.state === 'ready'
    || (photo?.preview.errorCode === 'thumbnail-failed' && Boolean(photo?.dimensions));
  const id = photo?.id;

  useEffect(() => {
    if (!canInspect) return;
    const file = photoSession.getFile(id);
    const image = imageRef.current;
    if (!file || !image) return;
    const url = URL.createObjectURL(file);
    image.src = url;
    return () => {
      image.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [id, canInspect]);

  return (
    <section className="photo-collection-inspector" aria-label="Bilde som vises">
      <h3 className="truncate text-sm font-semibold text-gmi-navy" title={photo?.originalFilename}>
        {photo?.originalFilename || 'Velg et bilde'}
      </h3>
      <div className="photo-collection-original">
        {photo && canInspect ? (
          <>
            <img ref={imageRef} alt={photo.originalFilename} decoding="async" onError={() => setInspectionFailed(true)} hidden={inspectionFailed} />
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
      {photo && (
        <dl className="photo-collection-facts text-xs text-gmi-text-muted">
          <div><dt>Filnavn</dt><dd className="break-all">{photo.originalFilename}</dd></div>
          <div><dt>Størrelse</dt><dd>{formatSize(photo.size)}</dd></div>
          <div><dt>MIME/type</dt><dd className="break-all">{photo.mimeType || 'Ikke oppgitt'}</dd></div>
          <div><dt>Bildedimensjoner</dt><dd>{photo.dimensions ? `${photo.dimensions.width} × ${photo.dimensions.height} px` : 'Ikke tilgjengelig'}</dd></div>
          <div><dt>Sist endret</dt><dd>{new Date(photo.lastModified).toLocaleString('nb-NO')}</dd></div>
        </dl>
      )}
    </section>
  );
}
