'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagesIcon, UploadSimpleIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import usePhotoSession from './usePhotoSession';
import PhotoCollectionPanel, { SelectedPhotoInspector } from './PhotoCollectionPanel';
import PhotoGmlSummary from './PhotoGmlSummary';
import { photoSpatialCounts } from '@/lib/photos/photoSpatial.mjs';

export default function PhotoCollectionDialog({ onClose, onCreate, openerRef, targetLayerId = null }) {
  const session = usePhotoSession();
  const [dropError, setDropError] = useState(null);
  const layer = session.photoLayers.find((item) => item.id === targetLayerId);
  const photos = session.photos;
  const selectedId = session.selectedId;
  const { lastImport, batchSelectedIds } = session;
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const gmlInputRef = useRef(null);
  const selected = photos.find((photo) => photo.id === selectedId);
  const pendingCount = photos.filter((photo) => photo.preview.state === 'pending').length;
  const errorCount = photos.filter((photo) => photo.preview.state === 'error').length;
  const counts = photoSpatialCounts(photos);
  const positioning = session.positioning;
  const appendStatus = targetLayerId ? session.appendStatus : null;
  const appendCount = appendStatus?.appendableIds.length ?? photos.length;
  const proposedMatch = positioning.ledger?.matches.find((match) => match.status === 'matched' && match.photoId === selectedId);
  const proposedEntry = proposedMatch ? positioning.source.entries.find((entry) => entry.id === proposedMatch.entryId) : null;
  const addFiles = (files) => {
    const gmlFiles = files.filter((file) => /\.gml$/i.test(file.name));
    const images = files.filter((file) => !/\.gml$/i.test(file.name));
    if (images.length) photoSession.importFiles(images);
    setDropError(gmlFiles.length > 1 ? 'multiple-gml-files' : null);
    if (gmlFiles.length === 1) void photoSession.importPositioningGml(gmlFiles[0]);
  };

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
    if (files.length) addFiles(files);
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
              <h2 id="photo-collection-title" className="text-lg font-semibold text-gmi-navy">{targetLayerId ? `Legg til bilder i ${layer?.name || 'fotokartlaget'}` : 'Importer bilder til nytt fotokartlag'}</h2>
              <p className="text-xs text-gmi-text-muted">{photos.length} bilder i importen · {batchSelectedIds.length} valgt</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <>
              <button type="button" className="gmi-primary-control gmi-focus-ring inline-flex min-h-9 items-center gap-2 px-3 text-sm" onClick={() => inputRef.current?.click()}>
                <UploadSimpleIcon size={17} aria-hidden="true" />Legg til bilder
              </button>
              <button type="button" className="gmi-compact-button gmi-focus-ring min-h-9 border border-gmi-border-strong px-3 text-sm" onClick={() => gmlInputRef.current?.click()}>Legg til posisjoner (GML)</button>
              <button type="button" disabled={!photos.length} onClick={() => photoSession.selectAll()} className="gmi-compact-button gmi-focus-ring min-h-9 border border-gmi-border-strong px-3 text-sm disabled:opacity-40">Velg alle</button>
              <button type="button" disabled={!batchSelectedIds.length} onClick={() => photoSession.clearSelection()} className="gmi-compact-button gmi-focus-ring min-h-9 border border-gmi-border-strong px-3 text-sm disabled:opacity-40">Fjern valg</button>
              <button type="button" disabled={!batchSelectedIds.length} onClick={() => photoSession.removeSelected()} className="gmi-compact-button gmi-focus-ring inline-flex min-h-9 items-center gap-2 border border-gmi-border-strong px-3 text-sm disabled:opacity-40">
                <TrashIcon size={17} aria-hidden="true" />Fjern valgte
              </button>
            </>
            <button type="button" onClick={onClose} aria-label="Avbryt bildeimport" title="Avbryt og forkast importen" className="gmi-compact-button gmi-focus-ring inline-flex h-9 w-9 items-center justify-center border border-gmi-border-strong">
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
              if (files.length) addFiles(files);
            }}
          />
          <input ref={gmlInputRef} type="file" accept=".gml" className="hidden" aria-label="Velg GML med bildeposisjoner" onChange={(event) => {
            const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) addFiles(files);
          }} />
        </header>
        <div className="photo-collection-notice border-b border-gmi-border text-xs text-gmi-text-muted">
          <p id="photo-collection-session-note">Legg til bilder, kontroller utvalget og fjern eventuelle bilder før du bekrefter. {targetLayerId ? 'Nye bilder blir med; filnavn som finnes i laget hoppes over med mindre du velger «Legg til likevel». Prikkene velger bare bilder for fjerning.' : 'Alle gjenværende bilder blir med; prikkene velger bare bilder for fjerning.'} Bilder forsvinner ved omlasting.</p>
          <p role="status" aria-live="polite">
            {pendingCount > 0 ? `Lager miniatyrbilder: ${photos.length - pendingCount} av ${photos.length} ferdig.` : `${photos.length} bilder i samlingen.`}
            {errorCount > 0 && ` ${errorCount} uten forhåndsvisning.`}
            {lastImport && ` Siste import: ${lastImport.acceptedCount} lagt til, ${lastImport.rejectedNames.length} avvist.`}
          </p>
          <p>{counts.exifCandidateCount} bilder med EXIF GPS-kandidat. EXIF blir bare gjeldende posisjon når du velger det selv.</p>
          <p>Entydige, brukbare GML-treff blir gjeldende posisjoner når importen bekreftes.</p>
          <PhotoGmlSummary {...positioning} onDiscardError={() => photoSession.discardPositioningError()} />
          {dropError && <p role="alert" className="text-red-700">Velg én GML-fil med bildeposisjoner om gangen.</p>}
          {targetLayerId && <p>Bare de nye bildene legges til. Eksisterende bilder og posisjoner beholdes.</p>}
          {appendStatus && photos.length > 0 && <div className="photo-append-summary" role="status" aria-live="polite">
            <p className="font-medium">{photos.length} bilder i importen · {appendStatus.newCount} nye bilder · {appendCount} legges til</p>
            {appendStatus.targetCollisions.length > 0 && <>
              <p>{appendStatus.skippedIds.length} {appendStatus.skippedIds.length === 1 ? 'bilde finnes' : 'bilder finnes'} allerede i laget og blir ikke lagt til.
                {appendStatus.overrideIds.length > 0 && ` ${appendStatus.overrideIds.length} legges til likevel.`}</p>
              <p>Like filnavn betyr ikke nødvendigvis samme bilde. Bruk «Legg til likevel» på et bilde for å legge det til som en egen post.</p>
              {appendCount === 0 && <p className="font-medium">Alle bildene i importen finnes allerede i laget. Ingen bilder legges til.</p>}
            </>}
          </div>}
          {session.duplicateNames.length > 0 && <details className="text-amber-800"><summary>Like filnavn i importen ({session.duplicateNames.length}) – bildene beholdes hver for seg</summary><p>Dette er kollisjoner mellom innkommende filer. Store/små bokstaver og Unicode-normalisering tas med i sammenligningen. Ingen bilder slås sammen; posisjonskilder med tvetydige treff brukes ikke.</p><ul>{session.duplicateNames.map((group) => <li key={group.filename}>{group.filename}: {group.photoIds.length} bilder</li>)}</ul></details>}
          {lastImport?.rejectedNames.length > 0 && (
            <details className="photo-collection-rejections">
              <summary className="cursor-pointer font-medium text-red-700">Avviste filer er ikke bilder ({lastImport.rejectedNames.length})</summary>
              <ul className="mt-1 list-inside list-disc break-all">{lastImport.rejectedNames.map((name, index) => <li key={index}>{name}</li>)}</ul>
            </details>
          )}
        </div>
        <div className="photo-collection-body">
          <PhotoCollectionPanel photos={photos} selectedId={selectedId} batchSelectedIds={batchSelectedIds} onInspect={photoSession.select} appendStatus={appendStatus} />
          <SelectedPhotoInspector key={selectedId || 'empty'} photo={selected} proposedEntry={proposedEntry} />
        </div>
        <footer className="photo-import-footer border-t border-gmi-border">
          <>
            <p className="mr-auto text-xs text-gmi-text-muted">Avbryt forkaster denne importen. Originalfilene på disken beholdes.</p>
            <button type="button" onClick={onClose} className="gmi-compact-button gmi-focus-ring min-h-10 border border-gmi-border-strong px-4 text-sm">Avbryt</button>
            <button type="button" disabled={!appendCount || ['pending', 'error'].includes(positioning.state)} onClick={onCreate} className="gmi-primary-control gmi-focus-ring min-h-10 px-4 text-sm font-medium">{targetLayerId ? `Legg til ${appendCount} ${appendCount === 1 ? 'bilde' : 'bilder'} i laget` : `Opprett fotokartlag (${photos.length} bilder)`}</button>
          </>
        </footer>
      </div>
    </dialog>
  );
}
