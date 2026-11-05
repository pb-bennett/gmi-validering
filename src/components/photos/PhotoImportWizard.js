 'use client';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ImagesIcon, FolderOpenIcon, XIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { initialImportState, importSteps, importWizardReducer, canAdvance, canNavigateBack } from '@/lib/photos/photoImportWizardState.mjs';
import FileDropOverlay from '@/components/FileDropOverlay';
import useFileDragTracker from '@/components/useFileDragTracker';
import { hasFileDrag } from '@/lib/fileDragState.mjs';
import usePhotoSession from './usePhotoSession';
import PhotoCollectionPanel from './PhotoCollectionPanel';
import PhotoImportPreview from './PhotoImportPreview';
import PhotoImportPlacementStep from './PhotoImportPlacementStep';
import PhotoImportReviewStep from './PhotoImportReviewStep';
import PhotoWizardSteps from './PhotoWizardSteps';

const STEP_LABELS = { photos: 'Bilder', placement: 'Plassering', review: 'Kontroll' };

export default function PhotoImportWizard({ context, onClose, onComplete, openerRef, loadedSources = [], onLoadedSource }) {
  const session = usePhotoSession();
  const [state, dispatch] = useReducer(importWizardReducer, context, initialImportState);
  const [error, setError] = useState('');
  const { active: fileDragActive, tracker: fileDrag } = useFileDragTracker();
  const dialogRef = useRef(null), inputRef = useRef(null), folderRef = useRef(null), heading = useRef(null);
  const photos = session.photos;
  const target = session.photoLayers.find((layer) => layer.id === session.draftTargetLayerId);
  const steps = importSteps(context, state.placement);
  // The external session snapshot invalidates reviews even when navigation choices stay unchanged.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const review = useMemo(() => state.placement.kind === 'gmi' ? photoSession.reviewLoadedGmiImport({ includeUnreferenced: state.includeUnreferenced }) : null, [session, state.placement.kind, state.includeUnreferenced]);
  const preview = useMemo(() => {
    if (state.step === 'photos' || (state.placement.kind === 'gmi' && !review)) return null;
    try { return photoSession.previewImport({ loadedReview: review, placement: state.placement }); } catch { return null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- External session revision is a required invalidation boundary.
  }, [session, review, state.step, state.placement]);
  const advance = canAdvance(state.step, session, state);
  const final = state.step === 'review' || (state.step === 'placement' && state.placement.kind === 'none');
  const primary = final ? (session.draftTargetLayerId ? 'Legg til i fotolaget' : 'Opprett fotolag') : 'Neste';
  const acceptsDrop = state.step === 'photos';
  const addFiles = (files) => {
    if (!files?.length) return;
    setError(''); photoSession.importFiles(Array.from(files));
  };
  const navigateBack = (step) => {
    dispatch({ type: 'back', context, step });
    setError('');
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

  useEffect(() => { heading.current?.focus(); }, [state.step]);
  const acquisition = <div className="photo-import-acquisition">
    <button type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => inputRef.current.click()}><ImagesIcon size={22} aria-hidden="true" />Velg bilder</button>
    <button type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => folderRef.current.click()}><FolderOpenIcon size={22} aria-hidden="true" />Velg mappe</button>
  </div>;
  const toolbar = photos.length > 0 && <div className="photo-import-grid-toolbar">
    <p>{photos.length} bilder · {session.batchSelectedIds.length} valgt for fjerning</p>
    <div className="flex flex-wrap gap-2"><button type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => photoSession.selectAll()}>Velg alle</button>
    <button type="button" className="gmi-compact-button gmi-focus-ring" disabled={!session.batchSelectedIds.length} onClick={() => photoSession.clearSelection()}>Fjern valg</button>
    <button type="button" className="gmi-compact-button gmi-focus-ring" disabled={!session.batchSelectedIds.length} onClick={() => photoSession.removeSelected()}>Fjern valgte ({session.batchSelectedIds.length})</button></div>{acquisition}
    {session.appendStatus && <p className="photo-append-summary text-sm">{session.appendStatus.newCount} nye bilder · {session.appendStatus.skippedIds.length} bilder finnes allerede · {session.appendStatus.appendableIds.length} legges til</p>}
    {session.lastImport?.rejectedNames.length > 0 && <details><summary>Avviste filer ({session.lastImport.rejectedNames.length})</summary>{session.lastImport.rejectedNames.join(', ')}</details>}
    {session.duplicateNames.length > 0 && <details><summary>Like filnavn ({session.duplicateNames.length})</summary>{session.duplicateNames.map((item) => <p key={item.filename}>{item.filename}</p>)}</details>}
  </div>;
  return <dialog ref={dialogRef} className="photo-collection-dialog bg-gmi-surface text-gmi-text shadow-2xl" aria-labelledby="photo-collection-title" data-thumbnails-pending={photos.filter((photo) => photo.preview.state === 'pending').length} data-exif-pending={photos.filter((photo) => photo.spatial.exifRead.state === 'pending').length}
    onCancel={(event) => {
      // File inputs emit a bubbling cancel event when their native picker is dismissed.
      // Only a cancel targeted at this dialog (Escape) cancels the import session.
      if (event.target !== event.currentTarget) return;
      event.preventDefault(); onClose();
    }}
    onDragEnter={(event) => { if (acceptsDrop && hasFileDrag(event)) fileDrag.enter(); }}
    onDragLeave={(event) => { if (acceptsDrop && hasFileDrag(event)) fileDrag.leave(); }}
    onDragOver={(event) => {
      event.preventDefault(); event.stopPropagation();
      if (!hasFileDrag(event)) return;
      if (acceptsDrop) fileDrag.over(); else event.dataTransfer.dropEffect = 'none';
    }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); fileDrag.reset(); if (acceptsDrop) addFiles(event.dataTransfer.files); }}>
    <div className="photo-collection-frame">
      {fileDragActive && <FileDropOverlay contained icon={ImagesIcon} title="Slipp bilder her" />}
      <header className="photo-collection-header"><div><h2 id="photo-collection-title">Legg til bilder</h2><p className="text-sm text-gmi-text-muted">{context.kind === 'gmi-layer' ? `Til ${session.loadedImport?.binding?.filename || ''}` : target ? `Legg til i ${target.name}` : 'Nytt fotolag'}</p></div><button type="button" className="gmi-focus-ring" aria-label="Lukk bilder" onClick={onClose}><XIcon size={22} /></button></header>
      <PhotoWizardSteps steps={steps.map((step) => ({ key: step, label: STEP_LABELS[step] }))} current={state.step}
        canGoBack={(step) => canNavigateBack(context, state, step)} onBack={navigateBack} />
      <h3 ref={heading} tabIndex={-1} className="photo-import-heading">{STEP_LABELS[state.step]}</h3>
      {state.step === 'photos' && session.loadedImport?.state === 'error' && <p role="alert" className="px-4">GMI-laget er ikke lenger tilgjengelig. Avbryt og start på nytt fra GMI-laget.</p>}
      {!photos.length && session.lastImport?.rejectedNames.length > 0 && <p role="alert" className="px-4">Ingen bilder ble lagt til. Avviste filer: {session.lastImport.rejectedNames.join(', ')}</p>}
      <input hidden ref={inputRef} type="file" multiple accept="image/*" aria-label="Velg bildefiler" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
      <input hidden ref={folderRef} type="file" multiple webkitdirectory="" directory="" aria-label="Velg mappe" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
      {state.step === 'photos' ? <div className="photo-collection-body">
        <PhotoCollectionPanel photos={photos} selectedId={session.selectedId} batchSelectedIds={session.batchSelectedIds} appendStatus={session.appendStatus} toolbar={toolbar}
          emptyState={<div className="photo-import-empty">{acquisition}<p>Slipp bilder her.</p><p>Bildene blir på denne maskinen. Nettleseren kan kalle mappevalget «opplasting».</p>{context.kind === 'gmi-layer' && <p>Velg bildene som hører til laget.</p>}</div>} />
        {photos.length > 0 && <PhotoImportPreview key={session.selectedId} photo={photos.find((photo) => photo.id === session.selectedId)} />}
      </div> : <div className="photo-import-step-body">
        {state.step === 'placement' ? <PhotoImportPlacementStep session={session} placement={state.placement} loadedSources={loadedSources} onLoadedSource={onLoadedSource} onChange={(kind) => {
          photoSession.clearDraftGmiSource(); photoSession.clearDraftPositioningGml(); dispatch({ type: 'placement', placement: { kind, exifFallback: false } }); setError('');
        }} /> : <>
          {context.kind === 'gmi-layer' && session.loadedImport?.state === 'error' ? <p role="alert">GMI-laget er ikke lenger tilgjengelig. Avbryt og start på nytt fra GMI-laget.</p> : <PhotoImportReviewStep preview={preview} review={review} session={session} context={context} state={state}
            onInclude={(value) => dispatch({ type: 'include', value })} onFallback={(exifFallback) => dispatch({ type: 'placement', placement: { exifFallback } })}
            onTarget={(id) => photoSession.setLoadedGmiTarget(id)} />}
        </>}
      </div>}
      <footer className="photo-import-footer border-t border-gmi-border">
        <div className="mr-auto text-sm" id="photo-import-status" role="status">{error || advance.reason || (preview ? `${preview.outcome.total} bilder · ${preview.outcome.placed} plassert · ${preview.outcome.unplaced} uten posisjon` : '')}</div>
        <button type="button" className="gmi-compact-button gmi-focus-ring border border-gmi-border px-3 py-2 text-gmi-text-muted" onClick={onClose}>Avbryt</button>
        {state.step !== 'photos' && <button type="button" className="gmi-compact-button gmi-focus-ring border border-gmi-border-strong bg-gmi-surface px-4 py-2" onClick={() => navigateBack(steps[steps.indexOf(state.step) - 1])}>Tilbake</button>}
        <button type="button" className="gmi-primary-control gmi-focus-ring min-h-10 px-4" disabled={!advance.ok || (final && (!preview || (!target && !preview.outcome.total)))} aria-describedby="photo-import-status" onClick={() => {
          if (!final) { dispatch({ type: 'step', step: steps[steps.indexOf(state.step) + 1] }); return; }
          const result = photoSession.completeImport({ loadedReview: review, placement: state.placement, preview });
          if (result.ok) onComplete(result); else setError('Bildene eller kilden er endret. Kontrollen er oppdatert – se over før du fortsetter.');
        }}>{primary}</button>
      </footer>
    </div>
  </dialog>;
}
