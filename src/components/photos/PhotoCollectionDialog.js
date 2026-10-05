'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagesIcon, UploadSimpleIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import usePhotoSession from './usePhotoSession';
import PhotoCollectionPanel, { SelectedPhotoInspector } from './PhotoCollectionPanel';

export default function PhotoCollectionDialog({ onClose, onCreate, openerRef, layerId = null }) {
  const session = usePhotoSession();
  const [inspectedId, setInspectedId] = useState(null);
  const layer = session.photoLayers.find((item) => item.id === layerId);
  const photos = layerId ? photoSession.getLayerPhotos(layerId) : session.photos;
  const selectedId = layerId ? (photos.find((photo) => photo.id === inspectedId)?.id || photos[0]?.id) : session.selectedId;
  const { lastImport, batchSelectedIds } = session;
  const readOnly = Boolean(layerId);
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const selected = photos.find((photo) => photo.id === selectedId);
  const pendingCount = photos.filter((photo) => photo.preview.state === 'pending').length;
  const errorCount = photos.filter((photo) => photo.preview.state === 'error').length;

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = openerRef?.current || document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Native modal behavior supplies background inertness, focus containment and Escape.
    dialog.showModal();
    const preventFileNavigation = (event) => {
      if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', preventFileNavigation, true);
    window.addEventListener('drop', preventFileNavigation, true);
    return () => {
      window.removeEventListener('dragover', preventFileNavigation, true);
      window.removeEventListener('drop', preventFileNavigation, true);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [openerRef]);

  const handlePhotoDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length && !readOnly) photoSession.importFiles(files);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="photo-collection-title"
      aria-describedby="photo-collection-session-note"
      className="photo-collection-dialog bg-gmi-surface text-gmi-text shadow-2xl"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onDrop={handlePhotoDrop}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      }}
      onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); }}
    >
      <div className="photo-collection-frame">
        <header className="photo-collection-header border-b border-gmi-border">
          <div className="flex min-w-0 items-center gap-2">
            <ImagesIcon size={24} aria-hidden="true" className="text-gmi-interactive" />
            <div>
              <h2 id="photo-collection-title" className="text-lg font-semibold text-gmi-navy">{readOnly ? layer?.name || 'Fotokartlag' : 'Importer bilder til nytt fotokartlag'}</h2>
              <p className="text-xs text-gmi-text-muted">{readOnly ? `${photos.length} bilder i laget · Kun visning` : `${photos.length} bilder i importen · ${batchSelectedIds.length} valgt`}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!readOnly && <>
              <button type="button" className="gmi-primary-control gmi-focus-ring inline-flex min-h-9 items-center gap-2 px-3 text-sm" onClick={() => inputRef.current?.click()}>
                <UploadSimpleIcon size={17} aria-hidden="true" />Legg til bilder
              </button>
              <button type="button" disabled={!photos.length} onClick={() => photoSession.selectAll()} className="gmi-compact-button gmi-focus-ring min-h-9 border border-gmi-border-strong px-3 text-sm disabled:opacity-40">Velg alle</button>
              <button type="button" disabled={!batchSelectedIds.length} onClick={() => photoSession.clearSelection()} className="gmi-compact-button gmi-focus-ring min-h-9 border border-gmi-border-strong px-3 text-sm disabled:opacity-40">Fjern valg</button>
              <button type="button" disabled={!batchSelectedIds.length} onClick={() => photoSession.removeSelected()} className="gmi-compact-button gmi-focus-ring inline-flex min-h-9 items-center gap-2 border border-gmi-border-strong px-3 text-sm disabled:opacity-40">
                <TrashIcon size={17} aria-hidden="true" />Fjern valgte
              </button>
            </>}
            <button type="button" onClick={onClose} aria-label={readOnly ? 'Lukk bilder' : 'Avbryt bildeimport'} title={readOnly ? 'Lukk' : 'Avbryt og forkast importen'} className="gmi-compact-button gmi-focus-ring inline-flex h-9 w-9 items-center justify-center border border-gmi-border-strong">
              <XIcon size={19} aria-hidden="true" />
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.tif,.tiff,.svg,.svgz,.gif,.bmp,.avif,.ico,.jxl"
            className="hidden"
            aria-label="Velg bildefiler"
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              if (files.length && !readOnly) photoSession.importFiles(files);
            }}
          />
        </header>
        <div className="photo-collection-notice border-b border-gmi-border text-xs text-gmi-text-muted">
          <p id="photo-collection-session-note">{readOnly ? 'Bildene beholdes i denne økten til laget fjernes eller appen nullstilles.' : 'Legg til bilder, kontroller utvalget og fjern eventuelle bilder før du oppretter laget. Alle gjenværende bilder blir med; prikkene velger bare bilder for fjerning.'} Bilder forsvinner ved omlasting.</p>
          <p role="status" aria-live="polite">
            {pendingCount > 0 ? `Lager miniatyrbilder: ${photos.length - pendingCount} av ${photos.length} ferdig.` : `${photos.length} bilder i samlingen.`}
            {errorCount > 0 && ` ${errorCount} uten forhåndsvisning.`}
            {!readOnly && lastImport && ` Siste import: ${lastImport.acceptedCount} lagt til, ${lastImport.rejectedNames.length} avvist.`}
          </p>
          {!readOnly && lastImport?.rejectedNames.length > 0 && (
            <details className="photo-collection-rejections">
              <summary className="cursor-pointer font-medium text-red-700">Avviste filer er ikke bilder ({lastImport.rejectedNames.length})</summary>
              <ul className="mt-1 list-inside list-disc break-all">{lastImport.rejectedNames.map((name, index) => <li key={index}>{name}</li>)}</ul>
            </details>
          )}
        </div>
        <div className="photo-collection-body">
          <PhotoCollectionPanel photos={photos} selectedId={selectedId} batchSelectedIds={readOnly ? null : batchSelectedIds} onInspect={readOnly ? setInspectedId : photoSession.select} />
          <SelectedPhotoInspector key={selectedId || 'empty'} photo={selected} />
        </div>
        <footer className="photo-import-footer border-t border-gmi-border">
          {readOnly ? <button type="button" onClick={onClose} className="gmi-compact-button gmi-focus-ring min-h-10 border border-gmi-border-strong px-4 text-sm">Lukk</button> : <>
            <p className="mr-auto text-xs text-gmi-text-muted">Avbryt forkaster denne importen. Originalfilene på disken beholdes.</p>
            <button type="button" onClick={onClose} className="gmi-compact-button gmi-focus-ring min-h-10 border border-gmi-border-strong px-4 text-sm">Avbryt</button>
            <button type="button" disabled={!photos.length} onClick={onCreate} className="gmi-primary-control gmi-focus-ring min-h-10 px-4 text-sm font-medium">Opprett fotokartlag ({photos.length} bilder)</button>
          </>}
        </footer>
      </div>
    </dialog>
  );
}
