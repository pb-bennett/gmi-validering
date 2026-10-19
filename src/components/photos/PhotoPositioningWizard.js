'use client';

/* eslint-disable @next/next/no-img-element -- Reuses session-owned thumbnail URLs only. */
import { useEffect, useRef, useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { photoPositionDistance, PHOTO_POSITION_TOLERANCE_METRES, photoSourceEvidenceSignature, selectedPhotoSourcePositions } from '@/lib/photos/photoPositioning.mjs';
import { photoSourceLabel } from '@/lib/photos/photoPresentation.mjs';
import PhotoGmlSummary from './PhotoGmlSummary';
import PhotoGmiSummary from './PhotoGmiSummary';
import './photoPositioningWizard.css';
import './photoGmi.css';

const control = 'gmi-compact-button gmi-focus-ring';
const coordinates = (position) => position ? `${position.latitude.toFixed(7)}°, ${position.longitude.toFixed(7)}° (WGS84)` : 'Ingen posisjon';
const metres = (distance) => distance < .1 && distance > .01 ? 'under 0,1 m'
  : `${distance.toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
const actionLabel = (row) => row.action === 'move' ? `Flyttes ca. ${metres(row.distanceMetres)}` : row.action === 'same' ? 'Samme posisjon' : 'Plasseres';
const sourceLabels = { gmi: 'GMI – objektenes bildereferanser', gml: 'GML – bildeposisjoner' };
const savedMessage = 'Kilder og koblinger er lagret. Posisjoner er ikke endret.';
const readErrors = {
  'invalid-xml': 'GML-filen er ikke gyldig XML.', 'invalid-gmi': 'Filen kunne ikke leses som en gyldig GMI-fil.',
  'unsupported-gml-profile': 'Velg en GML-fil med Skråfoto i Terrain-formatet fra 2019.',
  'gml-too-large': 'GML-filen er for stor (maks. 10 MiB).', 'gmi-too-large': 'GMI-filen er for stor (maks. 10 MiB).',
  'gml-doctype-not-supported': 'GML med eksterne entiteter eller dokumenttype støttes ikke.',
};

export default function PhotoPositioningWizard({ layer, photos, review, initialSourceId, focusedPhotoId, onClose }) {
  const dialogRef = useRef(null), inputRef = useRef(null), ticketRef = useRef(null);
  const [step, setStep] = useState(initialSourceId ? 2 : 1);
  const [kind, setKind] = useState('gml');
  const [plan, setPlan] = useState(null), [choices, setChoices] = useState({});
  const [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [removeSourceId, setRemoveSourceId] = useState(null);
  const ready = review?.state === 'ready';
  const selected = plan ? selectedPhotoSourcePositions(plan, choices) : [];
  const positionRows = !plan ? [] : !focusedPhotoId ? plan.rows : [
    ...plan.rows.filter((row) => row.photoId === focusedPhotoId), ...plan.rows.filter((row) => row.photoId !== focusedPhotoId),
  ];
  const pendingExif = photos.filter((photo) => photo.spatial.exifRead.state === 'pending').length;
  const viableExif = photos.filter((photo) => photo.spatial.candidates.some((candidate) => candidate.kind === 'exif' && candidate.status === 'viable')).length;
  const newEvidence = plan && plan.evidenceSignature !== photoSourceEvidenceSignature(photos);
  const saved = Boolean(notice);

  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement;
    const ticket = photoSession.beginSourceWorkflow(layer.id);
    ticketRef.current = ticket;
    dialog.showModal();
    if (initialSourceId) photoSession.recheckLayerSource(layer.id, initialSourceId);
    return () => {
      ticketRef.current = null;
      photoSession.endSourceWorkflow(ticket);
      dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [layer.id, initialSourceId]);
  useEffect(() => {
    if (!photoSession.sourceWorkflowIsLive(ticketRef.current)) onClose();
  }, [layer.photoIds, onClose]);

  const readFile = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    const ticket = ticketRef.current;
    if (!file || review || !photoSession.sourceWorkflowIsLive(ticket)) return;
    setError(''); setStep(2); setPlan(null); setRemoveSourceId(null);
    await photoSession.stageLayerSource(layer.id, file, kind);
    if (ticketRef.current !== ticket || !photoSession.sourceWorkflowIsLive(ticket)) return;
    const result = photoSession.getSnapshot().sourceReviews[layer.id];
    if (result?.errorCode === 'duplicate-source') photoSession.recheckLayerSource(layer.id, result.attachedSourceId);
  };
  const recheck = (sourceId) => {
    if (review || !photoSession.sourceWorkflowIsLive(ticketRef.current)) return;
    photoSession.recheckLayerSource(layer.id, sourceId);
    setStep(2); setPlan(null); setError(''); setRemoveSourceId(null);
  };
  const discard = () => {
    photoSession.cancelLayerSourceReview(layer.id);
    setStep(1); setError('');
  };
  const keepSource = () => {
    const result = photoSession.saveSourceWorkflowSource(ticketRef.current, review);
    if (!result.ok) { setError('Bildene eller kilden er endret. Kontroller kilden på nytt før du bekrefter.'); return; }
    setNotice(savedMessage); setPlan(null); setError('');
  };
  const positions = (refresh = false) => {
    const next = photoSession.reviewSourceWorkflowPositions(ticketRef.current);
    if (!next) { setError('Behold eller forkast den usparte kilden før du kontrollerer posisjoner.'); return; }
    setChoices(Object.fromEntries(next.rows.map((row) => [row.photoId, refresh
      ? row.options.some((option) => option.id === choices[row.photoId]) ? choices[row.photoId] : ''
      : focusedPhotoId && row.photoId !== focusedPhotoId ? '' : row.defaultChoice])));
    setPlan(next); setStep(3); setError(''); setRemoveSourceId(null);
  };
  const apply = () => {
    const result = photoSession.applySourceWorkflowPositions(ticketRef.current, plan,
      selected.map((row) => ({ photoId: row.photoId, candidateId: row.proposal.id })));
    if (result.ok) onClose();
    else { setError('Bildene, kildene eller posisjonene er endret. Oppdater kontrollen før du bekrefter på nytt.'); setStep(3); }
  };
  const optionLabel = (candidate) => candidate.kind === 'exif' ? 'EXIF GPS' :
    `GML: ${candidate.sourceFilename || layer.spatialSources.find((source) => source.id === candidate.sourceId)?.filename} (${layer.spatialSources.findIndex((source) => source.id === candidate.sourceId) + 1})`;

  return <dialog ref={dialogRef} className="photo-positioning-wizard" aria-labelledby="photo-positioning-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h2 id="photo-positioning-title">Koble og posisjoner bilder</h2>
      <button type="button" className={control} aria-label={saved ? 'Lukk kildekontroll' : 'Avbryt kildekontroll'} onClick={onClose}>{saved ? 'Lukk' : 'Avbryt'}</button></header>
    <ol className="photo-positioning-steps" aria-label="Steg i kildekontroll">{['Kilder', 'Koblinger', 'Posisjoner', 'Oppsummer'].map((label, index) =>
      <li key={label} aria-current={step === index + 1 ? 'step' : undefined}>{index + 1} {label}</li>)}</ol>
    {notice && <p className="photo-source-saved" role="status">{notice}</p>}
    <div className="photo-positioning-content">
      {error && <p role="alert">{error}</p>}
      {step === 1 && <section aria-label="Kilder og koblinger"><h3>Kilder og koblinger</h3>
        <p>{layer.name} · {photos.length} bilder. Behold først kildedata og koblinger. Posisjoner brukes bare etter egen bekreftelse.</p>
        <div className="photo-source-inventory">
          <section><h4>EXIF GPS – fra bildene</h4><p>{viableExif} bilder: Posisjon tilgjengelig · {photos.length - viableExif - pendingExif} uten brukbar GPS</p>
            {pendingExif > 0 && <p role="status">Leser GPS … {pendingExif} bilder. Nye posisjoner velges ikke automatisk.</p>}</section>
          {layer.spatialSources.map((source, index) => <section key={source.id} data-source-id={source.id}>
            <h4>{index + 1}. {sourceLabels[source.kind]}</h4><p className="photo-source-filename">{source.filename}</p>
            <details><summary>Kildedetaljer</summary>{source.kind === 'gmi' ? <PhotoGmiSummary source={source} /> : <PhotoGmlSummary source={source} ledger={source.ledger} />}</details>
            <button type="button" className={control} disabled={Boolean(review)} onClick={() => recheck(source.id)}>Kontroller på nytt</button>
            {source.kind === 'gmi' && <button type="button" className={control} disabled={Boolean(review)} onClick={() => setRemoveSourceId(source.id)}>Fjern kilde</button>}
            {removeSourceId === source.id && <div className="photo-source-removal"><p>Fjern {source.filename} og GMI-koblingene fra laget? Bilder, posisjoner og retning beholdes.</p>
              <button type="button" className={control} onClick={() => setRemoveSourceId(null)}>Avbryt fjerning</button>
              <button type="button" className={control} onClick={() => {
                if (photoSession.sourceWorkflowIsLive(ticketRef.current) && photoSession.removeGmiSource(layer.id, source.id, { confirmed: true })) {
                  setNotice('GMI-kilden og koblingene er fjernet. Posisjoner er ikke endret.'); setPlan(null);
                }
                setRemoveSourceId(null);
              }}>Fjern GMI-kilde</button></div>}
          </section>)}
        </div>
        <h3>Legg til en kilde</h3>
        <fieldset disabled={Boolean(review)}><legend>Hva vil du hente?</legend>
          {Object.entries(sourceLabels).map(([value, label]) => <label key={value}><input type="radio" name="photo-external-source" value={value} checked={kind === value} onChange={() => setKind(value)} />{label}</label>)}
        </fieldset>
        <p>GMI kobler bilder til objekter. Den gir ikke bildeposisjoner.</p>
        <button type="button" className={control} disabled={Boolean(review)} onClick={() => inputRef.current?.click()}>Velg {kind.toUpperCase()}-fil</button>
        <input ref={inputRef} type="file" accept={`.${kind}`} hidden aria-label={`Velg ${kind.toUpperCase()}-kilde`} onChange={readFile} />
        {review && <p>Du har en uspart kilde. <button type="button" className={control} onClick={() => setStep(2)}>Se uspart kilde</button></p>}
      </section>}
      {step === 2 && <section aria-label="Kontroller koblinger"><h3>Koblinger</h3>
        {review?.state === 'pending' && <p role="status">Analyserer kilden …</p>}
        {review?.state === 'error' && <p role="alert">{readErrors[review.errorCode] || 'Kilden kunne ikke leses. Forkast denne kontrollen og velg filen på nytt.'}</p>}
        {ready && <>
          {review.recheck && <p>Kilden finnes i laget. Treffene kontrolleres på nytt.</p>}
          {review.source.kind === 'gmi' ? <><PhotoGmiSummary source={review.source} ledger={review.associationLedger} />
            <p>GMI kobler bilder til objekter. Den gir ikke bildeposisjoner.</p><p>Kilden beholdes også uten treff. Flere bilder kan kobles ved en senere kontroll.</p></>
            : <PhotoGmlSummary source={review.source} ledger={review.ledger} />}
          <p>Bekreft for å beholde kildedata. Gjeldende posisjoner og retning endres ikke.</p>
        </>}
        {!review && <p>{saved ? 'Kilden er beholdt. Du kan legge til en kilde til, fullføre eller kontrollere tilgjengelige posisjoner.' : 'Ingen ekstern kilde er valgt. EXIF GPS trenger ingen filkobling.'}</p>}
        {review && <button type="button" className={control} onClick={discard}>Forkast uspart kilde</button>}
        {!review && <button type="button" className={control} onClick={() => setStep(1)}>Legg til en kilde</button>}
      </section>}
      {step === 3 && plan && <section aria-label="Kontroller posisjoner"><h3>Posisjoner</h3>
        <p>Velg én posisjon per bilde, eller behold gjeldende. GMI-koblinger gir ingen bildeposisjon. Avstander er omtrentlige og sier ikke noe om kildepresisjon.</p>
        {focusedPhotoId && <p>Åpnet for {photos.find((photo) => photo.id === focusedPhotoId)?.originalFilename}. Valgene gjelder bare denne kontrollen.</p>}
        {newEvidence && <div role="status"><p>Nye posisjoner eller GPS-status er tilgjengelige. Oppdater kontrollen for å se dem; valgene utvides ikke automatisk.</p>
        </div>}
        <div className="photo-positioning-selection"><strong>{selected.length} valgt</strong>
          <button type="button" className={control} onClick={() => positions(true)}>Oppdater kontrollen</button>
          <button type="button" className={control} onClick={() => setChoices({})}>Behold alle gjeldende</button>
          {['gml', 'exif'].map((sourceKind) => <button key={sourceKind} type="button" className={control} onClick={() => setChoices(Object.fromEntries(plan.rows.map((row) => {
            const options = row.options.filter((option) => option.kind === sourceKind);
            return [row.photoId, options.length === 1 ? options[0].id : ''];
          })))}>Foreslå {sourceKind.toUpperCase()} for viste</button>)}
        </div>
        <ul className="photo-positioning-rows" aria-label="Tilgjengelige bildeposisjoner">{positionRows.map((row) => {
          const chosen = selected.find((item) => item.photoId === row.photoId);
          const conflict = row.options.some((a, index) => row.options.slice(index + 1).some((b) => photoPositionDistance(a.position, b.position) > PHOTO_POSITION_TOLERANCE_METRES));
          return <li key={row.photoId} data-photo-id={row.photoId} data-focused={row.photoId === focusedPhotoId || undefined} data-action={chosen?.action || 'keep'}>
            <div className="photo-positioning-row">
              {row.thumbnailUrl ? <img src={row.thumbnailUrl} alt="" loading="lazy" /> : <span className="photo-positioning-thumbnail">Bilde</span>}
              <div className="photo-positioning-filename"><strong>{row.filename}</strong>
                <small>{row.current ? `Gjeldende: ${photoSourceLabel(row.currentKind)}` : 'Uplassert'}{row.currentSourceFilename ? ` · ${row.currentSourceFilename}` : ''}</small>
                <small>GMI: koblet til {row.objectCount} {row.objectCount === 1 ? 'objekt' : 'objekter'}</small>
                {row.exifState === 'pending' && <small>Leser GPS …</small>}
                {row.exifState === 'no-gps' && <small>Ingen GPS-data</small>}
                {['invalid', 'error', 'unsupported-format'].includes(row.exifState) && <small>EXIF GPS: Kan ikke brukes</small>}
                {!row.options.length && <small>Ingen brukbar posisjon tilgjengelig</small>}
              </div>
              <label className="photo-position-choice">Posisjon
                <select aria-label={`Velg posisjon for ${row.filename}`} value={choices[row.photoId] || ''} onChange={(event) => setChoices({ ...choices, [row.photoId]: event.target.value })}>
                  <option value="">{row.current ? 'Behold gjeldende' : 'La bildet være uplassert'}</option>
                  {row.options.map((candidate) => <option key={candidate.id} value={candidate.id}>{optionLabel(candidate)}</option>)}
                </select>
              </label>
              <strong className="photo-positioning-action">{chosen ? actionLabel(chosen) : row.current ? 'Behold gjeldende' : 'Uplassert'}</strong>
            </div>
            {conflict && <p className="photo-position-conflict">Ulike posisjoner fra kildene</p>}
            <details className="photo-positioning-comparison"><summary>Sammenlign posisjoner</summary>
              <p>Gjeldende: {coordinates(row.current?.position)}</p>
              {row.options.map((candidate) => <p key={candidate.id}>{optionLabel(candidate)}: {coordinates(candidate.position)}
                {row.current ? ` · ${metres(photoPositionDistance(row.current.position, candidate.position))} fra gjeldende` : ''}
                {candidate.issues?.includes('questionable-zero-gps') && ' · GPS er 0°/0°. Kontroller kilden før du bruker posisjonen.'}</p>)}
            </details>
          </li>;
        })}</ul>
      </section>}
      {step === 4 && plan && <section className="photo-positioning-summary" aria-label="Oppsummer posisjonering"><h3>Oppsummer</h3>
        <p className="photo-positioning-selected-count">{selected.length} {selected.length === 1 ? 'bilde valgt' : 'bilder valgt'}</p>
        <dl>{[['Plasseres', 'place'], ['Flyttes', 'move'], ['Samme posisjon', 'same']].map(([label, action]) =>
          <div key={action}><dt>{label}</dt><dd>{selected.filter((row) => row.action === action).length}</dd></div>)}</dl>
        <p>{plan.rows.length - selected.length} bilder beholdes uendret.</p>
        <ul>{selected.map((row) => <li key={row.photoId}>{row.filename}: {optionLabel(row.proposal)} · {actionLabel(row)}</li>)}</ul>
        <p>«Samme posisjon» kan endre hvilken kilde gjeldende posisjon bygger på. Bare valgte posisjoner endres. Retning, koblinger, kildedata og originalfiler beholdes.</p>
        {newEvidence && <p role="status">Nye posisjoner er tilgjengelige. Gå tilbake og oppdater kontrollen for å inkludere dem.</p>}
      </section>}
    </div>
    <footer><button type="button" className={control} onClick={onClose}>{saved ? 'Fullfør uten å endre posisjoner' : 'Avbryt'}</button>
      <div>{step > 1 && <button type="button" className={control} onClick={() => setStep(step === 4 ? 3 : 1)}>Tilbake</button>}
        {step === 1 && <button type="button" className={`${control} photo-positioning-primary`} disabled={Boolean(review)} onClick={() => positions()}>Kontroller tilgjengelige posisjoner</button>}
        {step === 2 && (review ? <button type="button" className={`${control} photo-positioning-primary`} disabled={!ready} onClick={keepSource}>
          {review.source?.kind === 'gmi' ? review.recheck ? 'Oppdater koblinger' : 'Behold kilde og koblinger' : review.recheck ? 'Oppdater treff' : 'Behold GML-kilden'}</button>
          : <button type="button" className={`${control} photo-positioning-primary`} onClick={() => positions()}>Kontroller tilgjengelige posisjoner</button>)}
        {step === 3 && <button type="button" className={`${control} photo-positioning-primary`} disabled={!selected.length} onClick={() => setStep(4)}>Neste</button>}
        {step === 4 && <button type="button" className={`${control} photo-positioning-primary`} disabled={!selected.length} onClick={apply}>Bruk valgte posisjoner for {selected.length} {selected.length === 1 ? 'bilde' : 'bilder'}</button>}
      </div>
    </footer>
  </dialog>;
}
