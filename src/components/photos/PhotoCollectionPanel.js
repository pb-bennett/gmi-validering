'use client';

/* eslint-disable @next/next/no-img-element -- Local Blob URLs must render in the browser without server image optimization. */
import { CheckIcon, PlusIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { photoPreviewMessage } from '@/lib/photos/imagePreview.mjs';
import './photoCollectionPanel.css';

function formatSize(size) {
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} MB`
    : `${(size / 1024).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} kB`;
}

export default function PhotoCollectionPanel({ photos, selectedId, batchSelectedIds, onInspect = photoSession.select, appendStatus, toolbar, emptyState }) {
  const collisions = new Set(appendStatus?.targetCollisions.map((item) => item.photoId));
  const skipped = new Set(appendStatus?.skippedIds);
  return (
    <section className="photo-collection-gallery" aria-label="Alle importerte bilder">
      {toolbar}
      {photos.length === 0 ? (emptyState || (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-gmi-text-muted">
          <h3 className="text-lg font-semibold text-gmi-navy">Ingen bilder ennå</h3>
          <p className="max-w-sm text-sm">Importer flere bilder eller slipp dem her. Nye importer legges til i samlingen.</p>
          <p className="text-xs">Forhåndsvisning: JPEG, PNG og WebP.</p>
        </div>
      )) : (
        <ul className="photo-collection-grid">
          {photos.map((photo) => (
            <li key={photo.id} data-photo-id={photo.id} data-append-status={collisions.has(photo.id) ? skipped.has(photo.id) ? 'skipped' : 'override' : undefined} className="relative min-w-0">
              <button
                type="button"
                onClick={() => onInspect(photo.id)}
                aria-pressed={photo.id === selectedId}
                aria-label={`Vis ${photo.originalFilename}`}
                className={`photo-collection-card gmi-focus-ring ${photo.id === selectedId ? 'photo-collection-card-selected' : ''}`}
              >
                <div className="photo-collection-thumbnail relative">
                  {photo.preview.state === 'ready' ? (
                    <img src={photo.preview.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="p-2 text-xs text-gmi-text-muted">
                      {photo.preview.state === 'pending' ? 'Lager miniatyrbilde …' : photoPreviewMessage(photo.preview.errorCode)}
                    </span>
                  )}
                  {collisions.has(photo.id) && <span className="photo-append-badge">{skipped.has(photo.id) ? 'Finnes allerede' : 'Legges til'}</span>}
                </div>
                <span className="block truncate px-2 pt-2 text-xs font-medium" title={photo.sourceRelativePath || photo.originalFilename}>{photo.originalFilename}</span>
                <span className="block px-2 pb-2 pt-1 text-[11px] text-gmi-text-subtle">
                  {photo.id === selectedId ? 'Vises · ' : ''}{formatSize(photo.size)}
                </span>
              </button>
              {collisions.has(photo.id) && <button type="button" className="photo-append-override gmi-compact-button gmi-focus-ring"
                title={skipped.has(photo.id) ? 'Legg til likevel' : 'Ikke legg til'}
                aria-label={skipped.has(photo.id) ? `Legg til ${photo.originalFilename} likevel` : `Ikke legg til ${photo.originalFilename}`} aria-pressed={!skipped.has(photo.id)}
                onClick={() => photoSession.setAppendDuplicateOverride(photo.id, skipped.has(photo.id))}>
                {skipped.has(photo.id) ? <PlusIcon size={16} aria-hidden="true" /> : <CheckIcon size={16} aria-hidden="true" />}
              </button>}
              {batchSelectedIds && (
                <button type="button" className="photo-batch-toggle gmi-focus-ring"
                  aria-label={`Velg ${photo.originalFilename}`}
                  aria-pressed={batchSelectedIds.includes(photo.id)}
                  title="Velg for fjerning; klikk bildet for å inspisere"
                  onClick={() => photoSession.toggleBatchSelection(photo.id)}>
                  <span className="photo-batch-circle" aria-hidden="true">{batchSelectedIds.includes(photo.id) ? <CheckIcon size={16} /> : null}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
