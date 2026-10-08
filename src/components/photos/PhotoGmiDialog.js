'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import PhotoGmiSummary from './PhotoGmiSummary';
import './photoGmi.css';

const control = 'gmi-compact-button gmi-focus-ring';
const emptyReview = Object.freeze({});
const errors = { 'gmi-too-large': 'GMI-filen er for stor (maks. 10 MiB).',
  'invalid-gmi': 'Filen kunne ikke leses som en gyldig GMI-fil.' };

export default function PhotoGmiDialog({ layer, review = emptyReview, initialSourceId, onClose }) {
  const dialogRef = useRef(null), inputRef = useRef(null), liveRef = useRef(false), requestRef = useRef(0);
  const [error, setError] = useState('');
  const [memberIds] = useState(() => [...layer.photoIds]);
  const membership = layer.photoIds.join('\0'), initialMembership = memberIds.join('\0');
  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement;
    liveRef.current = true;
    photoSession.cancelLayerSourceReview(layer.id);
    dialog.showModal();
    if (initialSourceId) photoSession.recheckLayerSource(layer.id, initialSourceId);
    return () => {
      liveRef.current = false;
      if (photoSession.getLayer(layer.id)) photoSession.cancelLayerSourceReview(layer.id);
      dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [layer.id, initialSourceId]);
  useEffect(() => { if (membership !== initialMembership) onClose(); }, [membership, initialMembership, onClose]);
  const readFile = useCallback(async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    const request = ++requestRef.current; setError('');
    await photoSession.stageLayerSource(layer.id, file, 'gmi');
    if (!liveRef.current || request !== requestRef.current) return;
    const result = photoSession.getSnapshot().sourceReviews[layer.id];
    if (result?.errorCode === 'duplicate-source') photoSession.recheckLayerSource(layer.id, result.attachedSourceId);
  }, [layer.id]);
  const ready = review?.state === 'ready' && review.source?.kind === 'gmi';
  const sourceId = review.source?.id;
  const associationLedger = review.associationLedger;
  return <dialog ref={dialogRef} className="photo-gmi-dialog" aria-labelledby="photo-gmi-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h2 id="photo-gmi-title">Koble GMI-referanser</h2>
      <button type="button" className={control} aria-label="Lukk GMI-referanser" onClick={onClose}>Lukk</button></header>
    <div className="photo-gmi-content">
      <p>Velg en GMI-fil for å analysere bildereferansene mot bildene i {layer.name}.</p>
      <button type="button" className={control} onClick={() => inputRef.current?.click()}>Velg GMI-fil</button>
      <input ref={inputRef} type="file" accept=".gmi" hidden aria-label="Velg GMI med bildereferanser" onChange={readFile} />
      {review?.state === 'pending' && <p role="status">Analyserer GMI-filen …</p>}
      {review?.state === 'error' && <p role="alert">{errors[review.errorCode] || 'GMI-filen kunne ikke leses. Velg en annen fil.'}</p>}
      {error && <p role="alert">{error}</p>}
      {ready && <section aria-label="Analyserte GMI-referanser">
        {review.recheck && <p>Kilden finnes i laget. Treffene kontrolleres på nytt.</p>}
        <PhotoGmiSummary source={review.source} ledger={review.associationLedger} />
        <p>Kilden og bildereferansene beholdes også uten treff. Nye bilder kan kobles ved en senere kontroll.</p>
      </section>}
    </div>
    <footer><p>Bekreft for å beholde kilden og koblingene i denne økten.</p>
      <div><button type="button" className={control} onClick={onClose}>Avbryt</button>
        <button type="button" className={`${control} photo-gmi-primary`} disabled={!ready} onClick={() => {
          if (!ready) return;
          const result = photoSession.applyGmiAssociations(layer.id, { confirmed: true, sourceId,
            memberIds, associationLedger });
          if (result.ok) onClose();
          else setError('Bildene eller kilden er endret. Analyser filen på nytt før du bekrefter.');
        }}>Bekreft GMI-koblinger</button></div>
    </footer>
  </dialog>;
}
