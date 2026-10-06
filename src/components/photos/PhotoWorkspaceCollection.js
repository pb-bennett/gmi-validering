'use client';

/* eslint-disable @next/next/no-img-element -- Session thumbnail Blob URLs are already derived and browser-owned. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import PhotoPositioningWizard from './PhotoPositioningWizard';
import PhotoGmlSummary from './PhotoGmlSummary';
import './photoWorkspace.css';

const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1 text-xs disabled:opacity-40';

function RemovePhotosConfirmation({ count, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={ref} className="photo-remove-confirmation" aria-labelledby="photo-remove-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <h2 id="photo-remove-title">Fjern {count === 1 ? 'bildet' : `${count} bilder`} fra laget?</h2>
    <p>{count === 1 ? 'Bildet fjernes' : 'Bildene fjernes'} fra fotokartlaget og denne økten. Originalfilene på disken endres ikke.</p>
    <div><button type="button" className={control} onClick={onCancel} autoFocus>Avbryt</button>
      <button type="button" className={control} onClick={onConfirm}>Fjern fra lag</button></div>
  </dialog>;
}

export default function PhotoWorkspaceCollection({ layer, photos, workspace, dispatch, review, onExit, onAddPhotos }) {
  const [filter, setFilter] = useState('all');
  const [removalIds, setRemovalIds] = useState(null);
  const [wizard, setWizard] = useState(null);
  const closeWizard = useCallback(() => setWizard(null), []);
  const selectedIds = workspace.selectedIds;
  const shown = photos.filter((photo) => filter === 'all' || (filter === 'placed') === Boolean(photo.spatial.current));
  const removalCount = removalIds?.filter((id) => layer.photoIds.includes(id)).length || 0;
  return <section className="photo-workspace-collection" aria-label="Bildemodul">
    <header><div className="flex items-center justify-between gap-2"><h1 title={layer.name}>{layer.name}</h1><button type="button" className={control} onClick={onExit}>Tilbake til appen</button></div>
      <p>{layer.photoCount} {layer.photoCount === 1 ? 'bilde' : 'bilder'} · {layer.placedCount} plassert · {layer.unplacedCount} uplassert</p>
      <p className="sr-only">{layer.exifCandidateCount} bilder med EXIF GPS-kandidat</p>
      <label className="flex items-center gap-2"><input type="checkbox" aria-label={`Vis fotokartlag ${layer.name}`} checked={layer.visible} onChange={(event) => photoSession.setLayerVisibility(layer.id, event.target.checked)} />Vis på kartet</label>
      <button type="button" className={control} onClick={onAddPhotos}>Legg til bilder</button>
      <button type="button" className={control} aria-haspopup="dialog" disabled={!photos.length} onClick={() => setWizard({ sourceId: null })}>Posisjoner bilder</button>
    </header>
    <section className="photo-workspace-sources" aria-label="Posisjonsdata for laget"><details>
      <summary>Posisjonsdata · {layer.spatialSources.length} {layer.spatialSources.length === 1 ? 'kilde' : 'kilder'}</summary>
      <p>{layer.exifCandidateCount} bilder med EXIF GPS. Kildedata beholdes også når en annen posisjon brukes.</p>
      {layer.spatialSources.map((source, index) => <div key={source.id} className="photo-workspace-source-item">
        <details><summary title={source.id}>{index + 1}. {source.filename}</summary><PhotoGmlSummary source={source} ledger={source.ledger} /></details>
        <button type="button" className={control} onClick={() => setWizard({ sourceId: source.id })}>Sjekk treff på nytt</button>
      </div>)}
    </details></section>
    <div className="photo-workspace-batch" aria-label="Handlinger for valgte bilder">
      <div className="flex flex-wrap items-center gap-2"><label>Vis <select aria-label="Filtrer bilder" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Alle bilder</option><option value="placed">Plassert</option><option value="unplaced">Uplassert</option></select></label>
        <span>{selectedIds.length} valgt</span></div>
      <div className="flex flex-wrap gap-2"><button type="button" className={control} disabled={!shown.length} onClick={() => dispatch({ type: 'select-many', photoIds: shown.map((photo) => photo.id) })}>Velg alle viste</button>
        {selectedIds.length > 0 && <button type="button" className={control} onClick={() => dispatch({ type: 'select-many', photoIds: [] })}>Fjern valg</button>}</div>
      {selectedIds.length > 0 && <div className="photo-workspace-selected-actions">
      <button type="button" className={control} onClick={() => setRemovalIds([...selectedIds])}>Fjern fra lag</button>
      </div>}
    </div>
    <ul className="photo-workspace-list" aria-label="Bilder i fotokartlaget">
      {shown.map((photo) => <li key={photo.id} data-photo-id={photo.id} className={photo.id === workspace.activePhotoId ? 'photo-workspace-active' : ''}>
        <input type="checkbox" aria-label={`Velg ${photo.originalFilename}`} checked={selectedIds.includes(photo.id)} onChange={() => dispatch({ type: 'toggle', photoId: photo.id })} />
        <button type="button" className="gmi-focus-ring" aria-label={`Vis ${photo.originalFilename}`} aria-pressed={photo.id === workspace.activePhotoId} onClick={() => dispatch({ type: 'active', photoId: photo.id })}>
          {photo.preview.thumbnailUrl ? <img src={photo.preview.thumbnailUrl} alt="" loading="lazy" /> : <span className="photo-workspace-thumbnail-empty">Bilde</span>}
          <span><span className="photo-workspace-filename" title={photo.originalFilename}>{photo.originalFilename}</span><span className="text-gmi-text-muted">{photo.spatial.current ? 'Plassert' : 'Uplassert'}</span></span>
        </button>
      </li>)}
      {!shown.length && <li className="photo-workspace-empty">{photos.length ? 'Ingen bilder med denne statusen.' : 'Laget er tomt. Legg til bilder for å fortsette.'}</li>}
    </ul>
    {removalIds && <RemovePhotosConfirmation count={removalCount} onCancel={() => setRemovalIds(null)} onConfirm={() => {
      photoSession.removeLayerPhotos(layer.id, removalIds, { confirmed: true }); setRemovalIds(null);
    }} />}
    {wizard && <PhotoPositioningWizard layer={layer} photos={photos} review={review} initialSourceId={wizard.sourceId} onClose={closeWizard} />}
  </section>;
}
