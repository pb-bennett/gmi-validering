'use client';

/* eslint-disable @next/next/no-img-element -- Reuses session-owned thumbnail URLs only. */
import { useEffect, useRef, useState } from 'react';
import { CheckCircleIcon, XIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { photoPositionDistance, PHOTO_POSITION_TOLERANCE_METRES, photoSourceEvidenceSignature, photoSourcePositionChoices, photoSourceProposalKinds, selectedPhotoSourcePositions } from '@/lib/photos/photoPositioning.mjs';
import { photoSourceLabel } from '@/lib/photos/photoPresentation.mjs';
import { readErrors } from '@/lib/photos/photoImportPresentation.mjs';
import PhotoGmlSummary from './PhotoGmlSummary';
import PhotoGmiSummary from './PhotoGmiSummary';
import PhotoOccurrenceContext from './PhotoOccurrenceContext';
import PhotoSourceOption, { photoSourceButton } from './PhotoSourceOption';
import PhotoWizardSteps from './PhotoWizardSteps';
import './photoPositioningWizard.css';
import './photoGmi.css';

const control = 'gmi-compact-button gmi-focus-ring';
const coordinates = (position) => position ? `${position.latitude.toFixed(7)}°, ${position.longitude.toFixed(7)}° (WGS84)` : 'Ingen posisjon';
const metres = (distance) => distance < .1 && distance > .01 ? 'under 0,1 m'
  : `${distance.toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
const actionLabel = (row) => row.action === 'move' ? `Flyttes ca. ${metres(row.distanceMetres)}` : row.action === 'same' ? 'Samme posisjon' : 'Plasseres';
// Presentation only. Sources that disagree by less than this are ordinary GPS spread and are shown neutrally; larger
// differences stay visible on the row and in Kontroll. Matching, proposals and the tolerance are unchanged.
const NOTABLE_METRES = 20;
const separationOf = (row) => row.options.length < 2 ? null
  : Math.max(...row.options.flatMap((a, index) => row.options.slice(index + 1).map((b) => photoPositionDistance(a.position, b.position))));
// The comparison leads with the distance; coordinates are the detail underneath.
function comparisonLead(row, chosen) {
  const separation = separationOf(row);
  if (separation !== null) return separation <= PHOTO_POSITION_TOLERANCE_METRES ? 'Kildene oppgir samme posisjon' : `ca. ${metres(separation)} mellom kildene`;
  if (chosen?.distanceMetres > PHOTO_POSITION_TOLERANCE_METRES) return `ca. ${metres(chosen.distanceMetres)} fra gjeldende`;
  return null;
}
const sourceLabels = { gmi: 'GMI – objektenes bildereferanser', gml: 'GML – bildeposisjoner' };
// Same wording as the import wizard's placement step.
const addLabels = { gmi: 'Fra GMI', gml: 'Fra GML-fil' };
const STEPS = Object.freeze(['Kilder', 'Koblinger', 'Plassering', 'Kontroll']);
const savedMessage = 'Kilder og koblinger er lagret. Posisjoner er ikke endret.';

// Saving a source and applying its positions are two separate commitments, so the step shows both and where the user is.
function SourceStages({ saved, kind }) {
  const name = kind === 'gmi' ? 'GMI-kilden og koblingene' : kind === 'gml' ? 'GML-kilden' : 'kilden';
  return <ol className="photo-positioning-stages" aria-label="To trinn">
    <li data-stage-state={saved ? 'done' : 'current'}>
      <span className="photo-positioning-stage-marker" aria-hidden="true">{saved ? <CheckCircleIcon size={22} weight="regular" /> : '1'}</span>
      <div><strong>{saved ? 'Kilden er lagret i fotolaget' : `Lagre ${name} i fotolaget`}</strong>
        <p>{saved ? 'Filen og treffene er beholdt. Ingen posisjoner er endret.' : 'Lagrer filen og treffene. Ingen posisjoner eller retninger endres.'}</p></div>
    </li>
    <li data-stage-state={saved ? 'current' : 'next'}>
      <span className="photo-positioning-stage-marker" aria-hidden="true">2</span>
      <div><strong>Velg posisjoner</strong>
        <p>{saved ? 'Kontroller hvilke posisjoner som skal brukes. Ingenting endres før du bekrefter i Kontroll.' : 'Etterpå velger du hvilke posisjoner som skal brukes, og bekrefter dem i Kontroll.'}</p></div>
    </li>
  </ol>;
}

// The two sources that lie furthest apart on a row, with their distance. Presentation only.
function farthestPair(row) {
  let pair = null;
  row.options.forEach((a, index) => row.options.slice(index + 1).forEach((b) => {
    const distance = photoPositionDistance(a.position, b.position);
    if (!pair || distance > pair.distance) pair = { a, b, distance };
  }));
  return pair;
}
const shortSourceName = (candidate, optionLabel) => candidate.kind === 'exif' ? 'EXIF GPS' : candidate.kind === 'gmi' ? 'GMI' : optionLabel(candidate);

// Why a row is listed in Kontroll. Each reason explains itself once, and each row says what was compared and how far apart.
// Only what is shown changes: the selection and the apply rule are the wizard's own and are untouched here.
function reviewGroups(plan, selected, optionLabel) {
  const name = (candidate) => shortSourceName(candidate, optionLabel);
  const sources = selected.map((row) => ({ row, pair: farthestPair(row) })).filter(({ pair }) => pair && pair.distance > NOTABLE_METRES);
  const proposedKinds = new Set(sources.map(({ row }) => row.proposal.kind));
  return [
    { key: 'sources', title: `Kildene oppgir posisjoner mer enn ${NOTABLE_METRES} m fra hverandre`,
      text: `${proposedKinds.size === 1 && proposedKinds.has('gml') ? 'GML er foreslått fordi den prioriteres når den finnes, men det betyr ikke at GML-posisjonen er riktig. '
        : 'Den valgte kilden er ikke nødvendigvis riktig. '}Se på bildet og kartet, og velg en annen kilde i Plassering hvis den passer bedre.`,
      rows: sources.map(({ row, pair }) => ({ row, detail: `${name(pair.a)} og ${name(pair.b)}: ca. ${metres(pair.distance)} fra hverandre. Valgt: ${name(row.proposal)}.` })) },
    { key: 'move', title: `Flytter en eksisterende posisjon mer enn ${NOTABLE_METRES} m`,
      text: 'Bildet har allerede en posisjon. Den valgte kilden flytter det langt, så kontroller at den nye posisjonen er riktig.',
      rows: selected.filter((row) => row.action === 'move' && row.distanceMetres > NOTABLE_METRES)
        .map((row) => ({ row, detail: `Fra ${photoSourceLabel(row.currentKind)} til ${name(row.proposal)}: ca. ${metres(row.distanceMetres)}.` })) },
    { key: 'zero', title: 'GPS oppgir 0°/0°',
      text: 'Dette er nesten alltid en manglende GPS-posisjon i kameraet, ikke et virkelig sted.',
      rows: selected.filter((row) => row.proposal.issues?.includes('questionable-zero-gps')).map((row) => ({ row, detail: `Valgt: ${name(row.proposal)}.` })) },
    { key: 'unplaced', title: 'Forblir uten posisjon',
      text: 'Disse bildene blir ikke med i leveransen før de får en posisjon.',
      rows: plan.rows.filter((row) => !row.current && !selected.some((item) => item.photoId === row.photoId))
        .map((row) => ({ row, detail: row.options.length ? 'En posisjon finnes, men er ikke valgt.' : 'Ingen kilde har en brukbar posisjon.' })) },
  ].filter((group) => group.rows.length);
}

// Kontroll: the counts first and anything unusual straight after; each decision is one fold away.
function PositioningSummary({ plan, selected, selectionUnit, repeats, optionLabel, newEvidence }) {
  const count = (action) => selected.filter((row) => row.action === action).length;
  const unchanged = plan.rows.length - selected.length;
  const unit = repeats ? 'plasseringer' : 'bilder';
  const groups = reviewGroups(plan, selected, optionLabel);
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const tiles = [['Plasseres', count('place'), 'place'], ['Flyttes', count('move'), 'move'], ['Samme posisjon', count('same'), 'same'], ['Uendret', unchanged, 'keep']]
    .filter(([, value, key]) => value > 0 || key !== 'same');
  return <section className="photo-positioning-summary" aria-label="Oppsummer posisjonering">
    <p className="photo-positioning-selected-count">{selected.length} {selectionUnit} valgt</p>
    <dl className="photo-positioning-tiles">{tiles.map(([label, value, key]) => <div key={key} data-summary={key}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {total > 0 ? <div className="photo-positioning-exceptions" data-positioning-exceptions={total}>
      <p><strong>Bør kontrolleres ({total})</strong></p>
      {groups.map((group) => <section key={group.key} className="photo-positioning-review" data-review-reason={group.key} aria-label={group.title}>
        <h4>{group.title} ({group.rows.length})</h4>
        <p>{group.text}</p>
        <ul>{group.rows.map(({ row, detail }) => <li key={row.photoId} data-review-row={row.photoId}><strong>{row.filename}</strong>
          <PhotoOccurrenceContext occurrence={row.occurrence} count={row.occurrenceCount} index={row.occurrenceIndex} objectCount={row.objectCount} compact />
          <span className="photo-positioning-review-detail">{detail}</span></li>)}</ul>
      </section>)}
    </div> : <p className="photo-positioning-clear" data-positioning-exceptions="0">Ingen avvik å kontrollere.</p>}
    <details className="photo-positioning-details" data-positioning-details>
      <summary>Vis detaljer ({selected.length})</summary>
      <ul>{selected.map((row) => <li key={row.photoId}>{row.filename}: {optionLabel(row.proposal)} · {actionLabel(row)}
        <PhotoOccurrenceContext occurrence={row.occurrence} count={row.occurrenceCount} index={row.occurrenceIndex} objectCount={row.objectCount} compact /></li>)}</ul>
    </details>
    <p className="photo-positioning-note">{unchanged > 0 ? `${unchanged} ${unit} beholdes uendret. ` : ''}Bare valgte posisjoner endres. Retning, koblinger, kildedata og originalfiler beholdes. «Samme posisjon» kan endre hvilken kilde posisjonen bygger på.</p>
    {newEvidence && <p role="status">Nye posisjoner er tilgjengelige. Gå tilbake og oppdater kontrollen for å inkludere dem.</p>}
  </section>;
}

// Works on the photos already in the FOTO layer: no new import, no photo selection. Presented in the same
// frame, step list and source cards as the import wizard; the lifecycle stays this workflow's own ticket:
// sources and links are kept explicitly, positions only change after explicit selection and confirmation,
// and cancelling leaves the layer as it was (a kept source stays, positions do not change).
export default function PhotoPositioningWizard({ layer, photos, review, initialSourceId, focusedPhotoId, loadedSources = [], loadedSourceInput, onClose }) {
  const dialogRef = useRef(null), inputRef = useRef(null), ticketRef = useRef(null), heading = useRef(null), content = useRef(null);
  const editedIds = useRef(new Set());
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
  const assets = [...new Map(photos.map((photo) => [photo.assetId || photo.id, photo])).values()];
  const repeats = photos.length > assets.length;
  const selectionUnit = repeats ? selected.length === 1 ? 'plassering' : 'plasseringer' : selected.length === 1 ? 'bilde' : 'bilder';
  const pendingExif = assets.filter((photo) => photo.spatial.exifRead.state === 'pending').length;
  const viableExif = assets.filter((photo) => photo.spatial.candidates.some((candidate) => candidate.kind === 'exif' && candidate.status === 'viable')).length;
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
  // Each step starts at its top: the body is one scroller, and Kontroll would otherwise open where Plassering was left.
  useEffect(() => { if (content.current) content.current.scrollTop = 0; heading.current?.focus(); }, [step]);

  // A File or an already-loaded GMI layer; an already attached source is rechecked instead of duplicated.
  const stage = async (input, sourceKind) => {
    const ticket = ticketRef.current;
    if (!input || review || !photoSession.sourceWorkflowIsLive(ticket)) return;
    setError(''); setStep(2); setRemoveSourceId(null);
    await photoSession.stageLayerSource(layer.id, input, sourceKind);
    if (ticketRef.current !== ticket || !photoSession.sourceWorkflowIsLive(ticket)) return;
    const result = photoSession.getSnapshot().sourceReviews[layer.id];
    if (result?.errorCode === 'duplicate-source') photoSession.recheckLayerSource(layer.id, result.attachedSourceId);
  };
  const readFile = (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    void stage(file, kind);
  };
  const stageLoadedSource = (gmiLayerId) => {
    const input = loadedSourceInput?.(gmiLayerId);
    if (!input) { setError('GMI-laget er ikke lenger tilgjengelig. Last GMI-filen inn på nytt.'); return; }
    void stage(input, 'gmi');
  };
  const recheck = (sourceId) => {
    if (review || !photoSession.sourceWorkflowIsLive(ticketRef.current)) return;
    photoSession.recheckLayerSource(layer.id, sourceId);
    setStep(2); setError(''); setRemoveSourceId(null);
  };
  const discard = () => {
    photoSession.cancelLayerSourceReview(layer.id);
    setStep(1); setError('');
  };
  const keepSource = () => {
    const result = photoSession.saveSourceWorkflowSource(ticketRef.current, review);
    if (!result.ok) { setError('Bildene eller kilden er endret. Kontroller kilden på nytt før du bekrefter.'); return; }
    setNotice(savedMessage); setError('');
    if (review.source.kind === 'gmi') positions(review.source.id);
  };
  const positions = (newGmiSourceId = null) => {
    const next = photoSession.reviewSourceWorkflowPositions(ticketRef.current);
    if (!next) { setError('Behold eller forkast den usparte kilden før du kontrollerer posisjoner.'); return; }
    setChoices(photoSourcePositionChoices(next, plan, choices, focusedPhotoId, { newGmiSourceId, editedIds: editedIds.current }));
    setPlan(next); setStep(3); setError(''); setRemoveSourceId(null);
  };
  const apply = () => {
    const result = photoSession.applySourceWorkflowPositions(ticketRef.current, plan,
      selected.map((row) => ({ photoId: row.photoId, candidateId: row.proposal.id })));
    if (result.ok) onClose();
    else { setError('Bildene, kildene eller posisjonene er endret. Oppdater kontrollen før du bekrefter på nytt.'); setStep(3); }
  };
  const optionLabel = (candidate) => candidate.kind === 'exif' ? 'EXIF GPS' : candidate.kind === 'gmi' ? 'GMI – objektposisjon' :
    `GML: ${candidate.sourceFilename || layer.spatialSources.find((source) => source.id === candidate.sourceId)?.filename} (${layer.spatialSources.findIndex((source) => source.id === candidate.sourceId) + 1})`;
  const goBack = (target) => { setStep(target); setError(''); };
  const status = step >= 3 && plan ? `${selected.length} ${selectionUnit} valgt` : '';

  return <dialog ref={dialogRef} className="photo-collection-dialog photo-positioning-wizard bg-gmi-surface text-gmi-text shadow-2xl" aria-labelledby="photo-positioning-title"
    data-step={step} onCancel={(event) => { if (event.target !== event.currentTarget) return; event.preventDefault(); onClose(); }}>
    <div className="photo-collection-frame">
      <header className="photo-collection-header"><div><h2 id="photo-positioning-title">Koble og posisjoner bilder</h2>
        <p className="text-sm text-gmi-text-muted">{layer.name} · {assets.length} bilder{repeats ? ` · ${photos.length} plasseringer` : ''}</p></div>
        <button type="button" className="gmi-focus-ring" aria-label={saved ? 'Lukk kildekontroll' : 'Avbryt kildekontroll'} onClick={onClose}><XIcon size={22} aria-hidden="true" /></button>
      </header>
      <PhotoWizardSteps label="Steg i kildekontroll" steps={STEPS.map((label, index) => ({ key: index + 1, label }))} current={step}
        canGoBack={(target) => target < step && (target !== 3 || Boolean(plan))} onBack={goBack} />
      <h3 ref={heading} tabIndex={-1} className="photo-import-heading">{STEPS[step - 1]}</h3>
      {notice && <p className="photo-source-saved" role="status">{notice}</p>}
      <div ref={content} className="photo-import-step-body photo-positioning-content">
        <div className="photo-positioning-step">
          {error && <p role="alert">{error}</p>}
          {step === 1 && <section aria-label="Kilder og koblinger">
            <p>Behold først kildedata og koblinger. Posisjoner brukes bare etter egen bekreftelse.</p>
            <h4 className="photo-positioning-subheading">Kilder i fotolaget</h4>
            <div className="photo-source-inventory">
              <PhotoSourceOption as="section" value="exif" label="Fra EXIF-data i bildene"
                hint={`${viableExif} bilder: Posisjon tilgjengelig · ${assets.length - viableExif - pendingExif} uten brukbar GPS`}>
                {pendingExif > 0 && <p role="status">Leser GPS … {pendingExif} bilder. Nye posisjoner velges ikke automatisk.</p>}
              </PhotoSourceOption>
              {layer.spatialSources.map((source, index) => <PhotoSourceOption as="section" key={source.id} sourceId={source.id} value={source.kind}
                label={`${index + 1}. ${sourceLabels[source.kind]}`}>
                <p className="photo-source-filename">{source.filename}</p>
                <details><summary>Kildedetaljer</summary>{source.kind === 'gmi' ? <PhotoGmiSummary source={source} /> : <PhotoGmlSummary source={source} ledger={source.ledger} />}</details>
                <div className="photo-import-source-actions flex flex-wrap gap-2">
                  <button type="button" className={photoSourceButton} disabled={Boolean(review)} onClick={() => recheck(source.id)}>Kontroller på nytt</button>
                  {source.kind === 'gmi' && <button type="button" className={photoSourceButton} disabled={Boolean(review)} onClick={() => setRemoveSourceId(source.id)}>Fjern kilde</button>}
                </div>
                {removeSourceId === source.id && <div className="photo-source-removal"><p>Fjern {source.filename} og GMI-koblingene fra laget? Bilder, posisjoner og retning beholdes.</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={photoSourceButton} onClick={() => setRemoveSourceId(null)}>Avbryt fjerning</button>
                    <button type="button" className={photoSourceButton} onClick={() => {
                      if (photoSession.sourceWorkflowIsLive(ticketRef.current) && photoSession.removeGmiSource(layer.id, source.id, { confirmed: true })) {
                        setNotice('GMI-kilden og koblingene er fjernet. Posisjoner er ikke endret.');
                      }
                      setRemoveSourceId(null);
                    }}>Fjern GMI-kilde</button>
                  </div></div>}
              </PhotoSourceOption>)}
            </div>
            <h4 className="photo-positioning-subheading">Legg til en kilde</h4>
            <fieldset className="photo-positioning-add" disabled={Boolean(review)}><legend className="sr-only">Hva vil du hente?</legend>
              {['gmi', 'gml'].map((value) => <PhotoSourceOption key={value} name="photo-external-source" value={value} label={addLabels[value]}
                hint={value === 'gmi' ? 'Kobler bilder til objekter og gir posisjoner fra punktobjekter. Linjer gir bare koblinger.' : 'Bildeposisjoner fra en Terrain GML-fil.'}
                checked={kind === value} onChange={setKind}>
                {kind === value && <div className="photo-import-source-actions flex flex-wrap gap-2">
                  {value === 'gmi' && loadedSources.map((item) => <button type="button" className={photoSourceButton} key={item.id} onClick={() => stageLoadedSource(item.id)}>Bruk {item.name}</button>)}
                  <button type="button" className={photoSourceButton} onClick={() => inputRef.current?.click()}>Velg {value.toUpperCase()}-fil …</button>
                </div>}
              </PhotoSourceOption>)}
            </fieldset>
            <input ref={inputRef} type="file" accept={`.${kind}`} hidden aria-label={`Velg ${kind.toUpperCase()}-kilde`} onChange={readFile} />
            {review && <p>Du har en uspart kilde. <button type="button" className={photoSourceButton} onClick={() => setStep(2)}>Se uspart kilde</button></p>}
          </section>}
          {step === 2 && <section aria-label="Kontroller koblinger" className="photo-positioning-links">
            {review?.state === 'pending' && <p role="status">Analyserer kilden …</p>}
            {review?.state === 'error' && <p role="alert">{readErrors[review.errorCode] || 'Kilden kunne ikke leses. Forkast denne kontrollen og velg filen på nytt.'}</p>}
            {ready && <>
              {review.recheck && <p>Kilden finnes i laget. Treffene kontrolleres på nytt.</p>}
              {review.source.kind === 'gmi' ? <><PhotoGmiSummary source={review.source} ledger={review.associationLedger} />
                <p>Hvert punktobjekt gir en egen plassering som du kan bekrefte i neste steg. Linjer gir bare koblinger.</p><p>Kilden beholdes også uten treff. Flere bilder kan kobles ved en senere kontroll.</p></>
                : <PhotoGmlSummary source={review.source} ledger={review.ledger} />}
            </>}
            {!review && !saved && <p>Ingen ekstern kilde er valgt. EXIF GPS trenger ingen filkobling.</p>}
            {(review || saved) && <SourceStages saved={saved && !review} kind={review?.source?.kind} />}
            <div className="flex flex-wrap gap-2">
              {review && <button type="button" className={photoSourceButton} onClick={discard}>Forkast uspart kilde</button>}
              {!review && <button type="button" className={photoSourceButton} onClick={() => setStep(1)}>Legg til en kilde</button>}
            </div>
          </section>}
          {step === 3 && plan && <section aria-label="Kontroller posisjoner">
            <p className="photo-positioning-lead">GML-posisjoner er valgt der de er entydige, og manuelle posisjoner beholdes. Endre bare det som ikke stemmer.</p>
            <p className="photo-positioning-note">Flere punktreferanser beholder hver sin plassering av samme bilde. Avstander er omtrentlige og sier ikke noe om kildepresisjon.</p>
            {focusedPhotoId && <p>Åpnet for {photos.find((photo) => photo.id === focusedPhotoId)?.originalFilename}. Valgene gjelder bare denne kontrollen.</p>}
            {newEvidence && <div role="status"><p>Nye posisjoner eller GPS-status er tilgjengelige. Oppdater kontrollen for å se dem; valgene utvides ikke automatisk.</p>
            </div>}
            <div className="photo-positioning-selection"><strong>{selected.length} valgt</strong>
              <button type="button" className={photoSourceButton} onClick={() => positions()}>Oppdater kontrollen</button>
              <button type="button" className={photoSourceButton} onClick={() => { positionRows.forEach((row) => editedIds.current.add(row.photoId)); setChoices({}); }}>Behold alle gjeldende</button>
              {photoSourceProposalKinds(positionRows).map((sourceKind) => <button key={sourceKind} type="button" className={photoSourceButton} onClick={() => setChoices(Object.fromEntries(positionRows.map((row) => {
                editedIds.current.add(row.photoId);
                const options = row.options.filter((option) => option.kind === sourceKind);
                // A manual position is only replaced by a choice made on its own row.
                return [row.photoId, options.length === 1 && row.currentKind !== 'manual' ? options[0].id : ''];
              })))}>Foreslå {sourceKind.toUpperCase()} for viste</button>)}
            </div>
            <ul className="photo-positioning-rows" aria-label="Tilgjengelige bildeposisjoner">{positionRows.map((row) => {
              const chosen = selected.find((item) => item.photoId === row.photoId);
              const separation = separationOf(row), lead = comparisonLead(row, chosen);
              return <li key={row.photoId} data-photo-id={row.photoId} data-focused={row.photoId === focusedPhotoId || undefined} data-action={chosen?.action || 'keep'}>
                <div className="photo-positioning-row">
                  {row.thumbnailUrl ? <img src={row.thumbnailUrl} alt="" loading="lazy" /> : <span className="photo-positioning-thumbnail">Bilde</span>}
                  <div className="photo-positioning-filename"><strong>{row.filename}</strong>
                    <PhotoOccurrenceContext occurrence={row.occurrence} count={row.occurrenceCount} index={row.occurrenceIndex} objectCount={row.objectCount} />
                    <small>{row.current ? `Gjeldende: ${photoSourceLabel(row.currentKind)}` : 'Uplassert'}{row.currentSourceFilename ? ` · ${row.currentSourceFilename}` : ''}</small>
                    {row.objectCount > 0 && <small>GMI: koblet til {row.objectCount} {row.objectCount === 1 ? 'objekt' : 'objekter'}</small>}
                    {row.exifState === 'pending' && <small>Leser GPS …</small>}
                    {row.exifState === 'no-gps' && <small>Ingen GPS-data</small>}
                    {['invalid', 'error', 'unsupported-format'].includes(row.exifState) && <small>EXIF GPS: Kan ikke brukes</small>}
                    {!row.options.length && <small>Ingen brukbar posisjon tilgjengelig</small>}
                    {row.gmiUnavailable && <small>GMI-posisjon utilgjengelig: {row.gmiUnavailable === 'missing-crs' ? 'Kilden mangler et kjent koordinatsystem.' : row.gmiUnavailable === 'unsupported-crs' ? 'Koordinatsystemet støttes ikke.' : 'Punktgeometrien kan ikke brukes.'}</small>}
                  </div>
                  <label className="photo-position-choice">Posisjon
                    <select className="gmi-focus-ring" aria-label={`Velg posisjon for ${row.filename}`} value={choices[row.photoId] || ''} onChange={(event) => { editedIds.current.add(row.photoId); setChoices({ ...choices, [row.photoId]: event.target.value }); }}>
                      <option value="">{row.current ? 'Behold gjeldende' : 'La bildet være uplassert'}</option>
                      {row.options.map((candidate) => <option key={candidate.id} value={candidate.id}>{optionLabel(candidate)}</option>)}
                    </select>
                  </label>
                  <strong className="photo-positioning-action" data-action={chosen?.action || 'keep'}>{chosen ? actionLabel(chosen) : row.current ? 'Behold gjeldende' : 'Uplassert'}</strong>
                </div>
                {(lead || row.options.length > 0) && <details className="photo-positioning-comparison" data-sources-differ={separation > PHOTO_POSITION_TOLERANCE_METRES || undefined}
                  data-notable={separation > NOTABLE_METRES || undefined}>
                  <summary>{lead && <span className="photo-positioning-separation">{lead}</span>}<span className="photo-positioning-coordinates-label">{lead ? 'Vis koordinater' : 'Vis posisjon'}</span></summary>
                  <dl>
                    <div><dt>Gjeldende</dt><dd>{coordinates(row.current?.position)}</dd></div>
                    {row.options.map((candidate) => <div key={candidate.id}><dt>{optionLabel(candidate)}</dt><dd>
                      {row.current && <span className="photo-positioning-separation">ca. {metres(photoPositionDistance(row.current.position, candidate.position))} fra gjeldende · </span>}
                      {coordinates(candidate.position)}
                      {candidate.issues?.includes('questionable-zero-gps') && <span className="photo-positioning-caution"> · GPS er 0°/0°. Kontroller kilden før du bruker posisjonen.</span>}</dd></div>)}
                  </dl>
                </details>}
              </li>;
            })}</ul>
          </section>}
          {step === 4 && plan && <PositioningSummary plan={plan} selected={selected} selectionUnit={selectionUnit} repeats={repeats} optionLabel={optionLabel} newEvidence={newEvidence} />}
        </div>
      </div>
      <footer className="photo-import-footer border-t border-gmi-border">
        <div className="mr-auto text-sm" role="status">{status}</div>
        <button type="button" className={`${control} border border-gmi-border px-3 py-2 text-gmi-text-muted`} onClick={onClose}>{saved ? 'Fullfør uten å endre posisjoner' : 'Avbryt'}</button>
        {step > 1 && <button type="button" className={`${control} border border-gmi-border-strong bg-gmi-surface px-4 py-2`} onClick={() => goBack(step === 4 ? 3 : 1)}>Tilbake</button>}
        {step === 1 && <button type="button" className={`gmi-primary-control gmi-focus-ring min-h-10 px-4 photo-positioning-primary`} disabled={Boolean(review)} onClick={() => positions()}>Kontroller tilgjengelige posisjoner</button>}
        {step === 2 && (review ? <button type="button" className={`gmi-primary-control gmi-focus-ring min-h-10 px-4 photo-positioning-primary`} disabled={!ready} onClick={keepSource}>
          {review.source?.kind === 'gmi' ? review.recheck ? 'Oppdater koblinger' : 'Behold kilde og koblinger' : review.recheck ? 'Oppdater treff' : 'Behold GML-kilden'}</button>
          : <button type="button" className={`gmi-primary-control gmi-focus-ring min-h-10 px-4 photo-positioning-primary`} onClick={() => positions()}>Kontroller tilgjengelige posisjoner</button>)}
        {step === 3 && <button type="button" className={`gmi-primary-control gmi-focus-ring min-h-10 px-4 photo-positioning-primary`} disabled={!selected.length} onClick={() => setStep(4)}>Neste</button>}
        {step === 4 && <button type="button" className={`gmi-primary-control gmi-focus-ring min-h-10 px-4 photo-positioning-primary`} disabled={!selected.length} onClick={apply}>Bruk valgte posisjoner for {selected.length} {selectionUnit}</button>}
      </footer>
    </div>
  </dialog>;
}
