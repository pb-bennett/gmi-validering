'use client';

/* eslint-disable @next/next/no-img-element -- Reuses session-owned thumbnail URLs only. */
import { useEffect, useRef, useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { planPhotoPositioning, summarizePhotoPositioning, photoPositioningRequests, photoPositionDistance } from '@/lib/photos/photoPositioning.mjs';
import { photoSourceLabel } from '@/lib/photos/photoPresentation.mjs';
import PhotoGmlSummary from './PhotoGmlSummary';
import './photoPositioningWizard.css';

const control = 'gmi-compact-button gmi-focus-ring';
const coordinates = (position) => position ? `${position.latitude.toFixed(7)}°, ${position.longitude.toFixed(7)}° (WGS84)` : 'Ingen posisjon';
const metres = (distance) => distance < .1 && distance > .01 ? 'under 0,1 m'
  : `${distance.toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
const actionLabel = (row) => ({ place: 'Plasseres', same: 'Samme posisjon', unavailable: 'Kan ikke plasseres',
  ambiguous: 'Tvetydig', unmatched: 'Ingen treff' }[row.action] || `Flyttes ${metres(row.distanceMetres)}`);
const readErrors = {
  'invalid-xml': 'Filen er ikke gyldig XML.',
  'unsupported-gml-profile': 'Velg en GML-fil med Skråfoto i Terrain-formatet fra 2019.',
  'gml-too-large': 'GML-filen er for stor (maks. 10 MiB).',
  'gml-doctype-not-supported': 'GML med eksterne entiteter eller dokumenttype støttes ikke.',
};

export default function PhotoPositioningWizard({ layer, photos, review, initialSourceId, onClose }) {
  const dialogRef = useRef(null), inputRef = useRef(null), liveRef = useRef(false), readRef = useRef(0);
  const [memberIds] = useState(() => [...layer.photoIds]);
  const membership = layer.photoIds.join('\0'), initialMembership = memberIds.join('\0');
  const [kind, setKind] = useState('gml'), [step, setStep] = useState(1);
  const [plan, setPlan] = useState(null), [selectedIds, setSelectedIds] = useState([]), [error, setError] = useState('');
  const viableExif = photos.filter((photo) => photo.spatial.candidates.some((item) => item.kind === 'exif' && item.status === 'viable')).length;
  const pendingExif = photos.filter((photo) => photo.spatial.exifRead.state === 'pending').length;
  const summary = plan ? summarizePhotoPositioning(plan, selectedIds) : null;

  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement;
    liveRef.current = true; dialog.showModal();
    if (initialSourceId) photoSession.recheckLayerSource(layer.id, initialSourceId);
    return () => {
      liveRef.current = false;
      if (photoSession.getLayer(layer.id)) photoSession.cancelLayerSourceReview(layer.id);
      dialog.close(); if (opener?.isConnected) opener.focus();
    };
  }, [layer.id, initialSourceId]);
  useEffect(() => { if (membership !== initialMembership) onClose(); }, [membership, initialMembership, onClose]);

  const choose = (next) => {
    readRef.current++; photoSession.cancelLayerSourceReview(layer.id);
    setKind(next); setPlan(null); setError('');
  };
  const readFile = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    const request = ++readRef.current; setError('');
    await photoSession.stageLayerSource(layer.id, file);
    if (!liveRef.current || readRef.current !== request) return;
    const result = photoSession.getSnapshot().sourceReviews[layer.id];
    if (result?.errorCode === 'duplicate-source') photoSession.recheckLayerSource(layer.id, result.attachedSourceId);
  };
  const analyse = () => {
    const analysis = planPhotoPositioning(photoSession.getLayerPhotos(layer.id), { kind, source: kind === 'gml' ? review.source : null });
    setPlan(analysis); setSelectedIds([...analysis.defaultSelectedIds]); setError(''); setStep(2);
  };
  const apply = () => {
    const result = photoSession.applyPhotoPositioning(layer.id, { kind, sourceId: plan.sourceId,
      memberIds: plan.memberIds, requests: photoPositioningRequests(plan, selectedIds) });
    if (result.ok) onClose();
    else { setError('Bildene eller posisjonene er endret. Kontroller posisjonene på nytt før du bruker dem.'); setStep(1); setPlan(null); }
  };
  return <dialog ref={dialogRef} className="photo-positioning-wizard" aria-labelledby="photo-positioning-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h2 id="photo-positioning-title">Posisjoner bilder</h2>
      <button type="button" className={control} aria-label="Lukk posisjonering" onClick={onClose}>Lukk</button></header>
    <ol className="photo-positioning-steps" aria-label="Steg i posisjonering">{['Kilde', 'Kontroller', 'Oppsummer'].map((label, index) =>
      <li key={label} aria-current={step === index + 1 ? 'step' : undefined}>{index + 1} {label}</li>)}</ol>
    <div className="photo-positioning-content">
      {error && <p role="alert">{error}</p>}
      {step === 1 && <section aria-label="Velg posisjonskilde"><h3>Velg posisjonskilde</h3>
        <fieldset><legend>Hvordan vil du hente posisjoner?</legend>
          <label><input type="radio" name="photo-position-source" value="gml" checked={kind === 'gml'} onChange={() => choose('gml')} />GML-fil</label>
          <label><input type="radio" name="photo-position-source" value="exif" checked={kind === 'exif'} onChange={() => choose('exif')} />EXIF GPS</label>
        </fieldset>
        {kind === 'gml' ? <>
          <p>Velg en GML-fil med bildeposisjoner fra Gemini Terrain. Filnavnene kobler posisjonene til bildene i laget.</p>
          <button type="button" className={control} onClick={() => inputRef.current?.click()} disabled={review?.state === 'pending'}>Velg GML-fil</button>
          <input ref={inputRef} type="file" accept=".gml" hidden aria-label="Velg GML for posisjonering" onChange={readFile} />
          {layer.spatialSources.length > 0 && <label className="photo-positioning-existing-source">Eller bruk en kilde i laget
            <select aria-label="Bruk GML-kilde i laget" value={review?.state === 'ready' && review.recheck ? review.source.id : ''} onChange={(event) => {
              readRef.current++; setError(''); photoSession.recheckLayerSource(layer.id, event.target.value);
            }}><option value="" disabled>Velg kilde</option>{layer.spatialSources.filter((source) => source.kind === 'gml').map((source, index) =>
              <option key={source.id} value={source.id}>{index + 1}. {source.filename}</option>)}</select></label>}
          {review?.state === 'pending' && <p role="status">Analyserer GML-filen …</p>}
          {review?.state === 'error' && <p role="alert">{readErrors[review.errorCode] || 'GML-filen kunne ikke leses. Velg en annen fil.'}</p>}
          {review?.state === 'ready' && <div role="status"><p>{review.source.filename}</p>
            <p>{review.ledger.summary.matchedCount} treff · {review.ledger.summary.unmatchedCount} uten bilde · {review.ledger.summary.ambiguousCount} tvetydige</p>
            {review.recheck && <p>Kilden finnes allerede i laget og brukes på nytt.</p>}
            <p>Ingen posisjoner er endret. Fortsett for å kontrollere bildene.</p></div>}
        </> : <>
          <p>Bruk GPS-posisjonene som allerede er lest fra originalbildene. GPS kan være feil; kontroller før du bruker posisjonene.</p>
          <p>{viableExif} bilder med brukbar EXIF GPS · {photos.length - viableExif - pendingExif} uten brukbar GPS</p>
          {pendingExif > 0 && <p role="status">Leser fortsatt GPS for {pendingExif} bilder. Du kan vente eller kontrollere posisjonene som er klare.</p>}
        </>}
      </section>}
      {step === 2 && plan && <section aria-label="Kontroller posisjoner"><h3>Kontroller posisjoner</h3>
        <p>Velg bildene som skal bruke {photoSourceLabel(kind)}. Avstandene er omtrentlige og sier ikke noe om kildepresisjon.</p>
        <div className="photo-positioning-selection"><strong>{summary.selectedCount} {summary.selectedCount === 1 ? 'bilde valgt' : 'bilder valgt'}</strong>
          <button type="button" className={control} onClick={() => setSelectedIds([...plan.defaultSelectedIds])}>Velg alle brukbare</button>
          <button type="button" className={control} onClick={() => setSelectedIds([])}>Fjern alle valg</button></div>
        <ul className="photo-positioning-rows" aria-label="Foreslåtte bildeposisjoner">{plan.rows.map((row) => <li key={row.photoId} data-photo-id={row.photoId} data-action={row.action}>
          <label className="photo-positioning-row"><input type="checkbox" aria-label={`Posisjoner ${row.filename}`} disabled={!row.eligible} checked={selectedIds.includes(row.photoId)} onChange={() =>
            setSelectedIds((ids) => ids.includes(row.photoId) ? ids.filter((id) => id !== row.photoId) : [...ids, row.photoId])} />
            {row.thumbnailUrl ? <img src={row.thumbnailUrl} alt="" loading="lazy" /> : <span className="photo-positioning-thumbnail">Bilde</span>}
            <span className="photo-positioning-filename">{row.filename}<small>{row.current ? `Gjeldende: ${photoSourceLabel(row.currentKind)}` : 'Uplassert'} · foreslått: {photoSourceLabel(kind)}</small></span>
            <strong className={`photo-positioning-action photo-positioning-${row.action}`}>{actionLabel(row)}</strong>
          </label>
          {row.eligible && <details className="photo-positioning-comparison"><summary>Sammenlign posisjoner</summary>
            <p>Gjeldende ({row.current ? photoSourceLabel(row.currentKind) : 'uplassert'}): {coordinates(row.current?.position)}</p>
            <p>Foreslått ({photoSourceLabel(kind)}): {coordinates(row.proposal.position)}{row.distanceMetres !== null ? ` · forskjell ${metres(row.distanceMetres)}` : ''}</p>
            {row.alternatives.filter((candidate) => candidate.id !== row.proposal.id).map((candidate) => <p key={candidate.id}>
              {photoSourceLabel(candidate.kind)}{candidate.sourceFilename ? ` (${candidate.sourceFilename})` : ''}: {coordinates(candidate.position)} · {metres(photoPositionDistance(row.proposal.position, candidate.position))} fra foreslått</p>)}
          </details>}
        </li>)}</ul>
        {kind === 'gml' && <details><summary>GML-treff og kildedetaljer</summary><PhotoGmlSummary source={review.source} ledger={plan.ledger} /></details>}
      </section>}
      {step === 3 && plan && <section className="photo-positioning-summary" aria-label="Oppsummer posisjonering"><h3>Oppsummering</h3>
        <p className="photo-positioning-selected-count">{summary.selectedCount} {summary.selectedCount === 1 ? 'bilde valgt' : 'bilder valgt'}</p>
        <dl><div><dt>Plasseres</dt><dd>{summary.placeCount}</dd></div><div><dt>Flyttes</dt><dd>{summary.moveCount}</dd></div><div><dt>Har allerede samme posisjon</dt><dd>{summary.sameCount}</dd></div></dl>
        <p>{summary.deselectedCount} brukbare bilder er valgt bort. {summary.unavailableCount} kan ikke plasseres og er ikke valgt.</p>
        {kind === 'gml' && <><p>{plan.ledger.summary.matchedCount} GML-treff · {plan.ledger.summary.unmatchedCount} referanser uten bilde · {plan.ledger.summary.ambiguousCount} tvetydige referanser</p>
          <details><summary>Kildedetaljer</summary><PhotoGmlSummary source={review.source} ledger={plan.ledger} /></details></>}
        <p>Bare valgte bilder oppdateres. Originalfilene endres ikke. Alle kilder og posisjonsdata beholdes.</p>
        <p>«Samme posisjon» kan likevel endre hvilken kilde den gjeldende posisjonen bygger på.</p>
      </section>}
    </div>
    <footer><button type="button" className={control} onClick={onClose}>Avbryt</button>
      <div>{step > 1 && <button type="button" className={control} onClick={() => setStep(step - 1)}>Tilbake</button>}
        {step < 3 ? <button type="button" className={`${control} photo-positioning-primary`} disabled={step === 1 ? kind === 'gml' && review?.state !== 'ready' : !summary.selectedCount}
          onClick={() => step === 1 ? analyse() : setStep(3)}>Neste</button>
          : <button type="button" className={`${control} photo-positioning-primary`} disabled={!summary.selectedCount} onClick={apply}>Bruk {photoSourceLabel(kind)}-posisjon for {summary.selectedCount} {summary.selectedCount === 1 ? 'bilde' : 'bilder'}</button>}</div>
    </footer>
  </dialog>;
}
