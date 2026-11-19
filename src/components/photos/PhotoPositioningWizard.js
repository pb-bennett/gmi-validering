'use client';

/* eslint-disable @next/next/no-img-element -- Reuses session-owned thumbnail URLs only. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, CircleNotchIcon, XIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { photoPositionDistance, PHOTO_POSITION_TOLERANCE_METRES, photoSourceEvidenceSignature, photoSourcePositionChoices, photoSourceProposalKinds, selectedPhotoSourcePositions } from '@/lib/photos/photoPositioning.mjs';
import { photoSourceLabel } from '@/lib/photos/photoPresentation.mjs';
import { readErrors } from '@/lib/photos/photoImportPresentation.mjs';
import { EMPTY_GML_CAPTURE_DECISION } from '@/lib/photos/photoGmlCaptureReconciliation.mjs';
import PhotoGmlSummary from './PhotoGmlSummary';
import PhotoGmlCaptureTimeChoices from './PhotoGmlCaptureTimeChoices';
import PhotoGmiSummary from './PhotoGmiSummary';
import PhotoOccurrenceContext from './PhotoOccurrenceContext';
import PhotoSourceOption, { photoSourceButton } from './PhotoSourceOption';
import PhotoWizardSteps from './PhotoWizardSteps';
import GmiConfirmDialog from '../gmi-edit/GmiConfirmDialog';
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
// The completion state after «Lagre endringer»: not a step, and not navigable.
const SAVED = 5;
const stageText = 'Kilden tas med i endringene. Ingenting lagres før du velger Lagre endringer.';
const draftErrors = {
  'source-staged': 'Kilden er allerede tatt med i endringene.',
  'duplicate-source': 'Kilden finnes allerede i fotolaget.',
  'source-removed': 'Kilden er fjernet fra fotolaget. Angre endringen som gjelder den.',
  'review-changed': 'Bildene, kildene eller posisjonene er endret. Oppdater kontrollen før du lagrer.',
  'commit-failed': 'Endringene kunne ikke lagres. Ingenting er endret.',
};
const errorText = (code) => draftErrors[code] || readErrors[code] || 'Bildene eller kilden er endret. Kontroller kilden på nytt.';
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
// How a staged source change is named, on its card (tag) and in Kontroll and the receipt.
const opTag = (op) => op.kind === 'remove-gmi' ? 'Fjernes' : op.rebinding ? `Kobles til lag «${op.rebinding.filename}»` : op.recheck ? 'Kontrolleres på nytt' : 'Ny';
const captureOptionText = (decision) => [decision?.complete && 'fullstendig', decision?.partial && 'ufullstendig eller kun dato', decision?.conflicts === 'gml' && 'avvik erstattes']
  .filter(Boolean).join(', ');

// Kontroll: the whole transaction, one section per kind of change; empty sections are left out.
function DraftSummary({ draft }) {
  if (!draft?.ops.length) return null;
  const linked = draft.ops.filter((op) => op.kind === 'gmi' && !op.rebinding);
  const capture = draft.ops.filter((op) => op.captureTimeCount > 0);
  return <>
    <section className="photo-positioning-kontroll-section" data-kontroll="sources" aria-label="Kilder">
      <h4>Kilder ({draft.ops.length})</h4>
      <ul>{draft.ops.map((op) => <li key={op.id} data-kontroll-op={op.kind}><strong>{op.filename}</strong> · {opTag(op) === 'Ny' ? 'Legges til' : opTag(op)}</li>)}</ul>
    </section>
    {linked.length > 0 && <section className="photo-positioning-kontroll-section" data-kontroll="links" aria-label="Koblinger">
      <h4>Koblinger</h4>
      <p>{plural(draft.occurrencesAdded, 'ny plassering', 'nye plasseringer')} · {plural(linked.reduce((sum, op) => sum + op.updated, 0), 'oppdatert plassering', 'oppdaterte plasseringer')} · {plural(linked.reduce((sum, op) => sum + op.objects, 0), 'objekt', 'objekter')} med punktposisjon</p>
    </section>}
    {capture.length > 0 && <section className="photo-positioning-kontroll-section" data-kontroll="capture" aria-label="Opptakstid">
      <h4>Opptakstid</h4>
      <ul>{capture.map((op) => <li key={op.id}>{plural(op.captureTimeCount, 'bilde', 'bilder')} får opptakstid fra {op.filename} ({captureOptionText(op.captureDecision)}).</li>)}</ul>
    </section>}
    {draft.directions > 0 && <section className="photo-positioning-kontroll-section" data-kontroll="direction" aria-label="Retning">
      <h4>Retning</h4>
      <p>{plural(draft.directions, 'bilde', 'bilder')} får retning fra GML automatisk.</p>
    </section>}
  </>;
}

// B1.1: the delivery consequences of the selected positions. The same lines are shown in Kontroll (from the session's
// read-only preview) and in Endringer lagret (from the commit receipt). Explicit GMI choices are kept, but listed for review.
function deliveryLines({ gml = 0, gmi = 0, keptExplicit = 0, keptUnavailable = 0 }, saved = false) {
  return [
    gml && { key: 'gml', text: `${plural(gml, 'plassering', 'plasseringer')} ${saved ? 'satt til' : 'settes til'} GML i leveransen, slik at den godkjente posisjonen leveres` },
    gmi && { key: 'gmi', text: `${plural(gmi, 'plassering', 'plasseringer')} leveres i GMI igjen fordi posisjonen er tilbake ved GMI-objektet` },
    keptExplicit && { key: 'kept-explicit', review: true, text: `${plural(keptExplicit, 'plassering', 'plasseringer')} flyttes bort fra GMI-objektet, men beholder GMI fordi du har valgt det. Kontroller leveringsvalget i FOTO.` },
    keptUnavailable && { key: 'kept-unavailable', review: true, text: `${plural(keptUnavailable, 'plassering', 'plasseringer')} flyttes bort fra GMI-objektet, men GMI-koblingen kan ikke overføres til GML nå. Kontroller leveringsvalget i FOTO.` },
  ].filter(Boolean);
}

function DeliverySummary({ effects }) {
  const lines = effects ? deliveryLines(effects) : [];
  if (!lines.length) return null;
  return <section className="photo-positioning-kontroll-section" data-kontroll="delivery" aria-label="Levering">
    <h4>Levering</h4>
    <ul>{lines.map((line) => <li key={line.key} data-kontroll-delivery={line.key}>{line.text}</li>)}</ul>
  </section>;
}

// What «Lagre endringer» actually saved, from the commit receipt. Only non-zero lines.
function receiptLines(receipt) {
  const names = (ops) => ops.map((op) => op.filename).join(', ');
  return [
    receipt.added.length && `Kilder lagt til: ${names(receipt.added)}`,
    receipt.rechecked.length && `Kontrollert på nytt: ${names(receipt.rechecked)}`,
    receipt.rebound.length && `Koblet til lastet GMI-lag: ${names(receipt.rebound)}`,
    receipt.removed.length && `Kilder fjernet: ${names(receipt.removed)}`,
    receipt.occurrencesAdded && `${plural(receipt.occurrencesAdded, 'ny plassering', 'nye plasseringer')} fra GMI-koblinger`,
    receipt.captureTimes && `Opptakstid lagret for ${plural(receipt.captureTimes, 'bilde', 'bilder')}`,
    receipt.directions && `Retning fra GML for ${plural(receipt.directions, 'bilde', 'bilder')}`,
    (receipt.placed || receipt.moved || receipt.same) && `Posisjoner: ${[receipt.placed && `${receipt.placed} plassert`, receipt.moved && `${receipt.moved} flyttet`, receipt.same && `${receipt.same} samme posisjon`].filter(Boolean).join(' · ')}`,
    ...deliveryLines({ gml: receipt.gmlDelivery, gmi: receipt.gmiDelivery, keptExplicit: receipt.deliveryKeptExplicit,
      keptUnavailable: receipt.deliveryKeptUnavailable }, true).map((line) => line.text),
  ].filter(Boolean);
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

// Works on the photos already in the FOTO layer: no new import, no photo selection. Presented in the same frame, step
// list and source cards as the import wizard. One transaction (B): sources, removals, links, capture times and position
// choices are staged in the session-owned draft of this workflow's ticket. Only «Lagre endringer» writes, atomically;
// the wizard then shows what was saved. Cancel or close before that discards the draft and leaves the layer as it was.
export default function PhotoPositioningWizard({ layer, photos, review, draft = null, initialSourceId, focusedPhotoId, loadedSources = [], loadedSourceInput, onApplied, onClose }) {
  const dialogRef = useRef(null), inputRef = useRef(null), ticketRef = useRef(null), heading = useRef(null), content = useRef(null);
  const editedIds = useRef(new Set());
  const [step, setStep] = useState(initialSourceId ? 2 : 1);
  // A4: no external source is pre-chosen; the sources already in the layer are enough to continue.
  const [kind, setKind] = useState(null);
  const [plan, setPlan] = useState(null), [choices, setChoices] = useState({});
  const [error, setError] = useState(''), [stagedNotice, setStagedNotice] = useState('');
  const [removeSourceId, setRemoveSourceId] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState(null);
  const ready = review?.state === 'ready';
  // GML capture-time choices belong to one review: navigation keeps them; another source or a recheck starts again
  // from the unchecked defaults. They are sent with «Ta med kilden» and saved only with «Lagre endringer».
  const captureKey = ready && review.source.kind === 'gml' ? `${review.source.id}:${review.recheck ? 'recheck' : 'new'}` : null;
  const [captureChoice, setCaptureChoice] = useState({ key: null, ...EMPTY_GML_CAPTURE_DECISION });
  const captureDecision = captureChoice.key === captureKey ? captureChoice : { key: captureKey, ...EMPTY_GML_CAPTURE_DECISION };
  // The draft summary (from the session snapshot) changes identity on every relevant publication; the review and the
  // capture plan are re-derived from the draft and the live photos it was made from.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- draft and photos are the session revision boundary.
  const draftReview = useMemo(() => photoSession.reviewLayerSourceDraft(layer.id), [layer.id, draft, photos]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The review identity and draft version are the revision boundary.
  const capturePlan = useMemo(() => captureKey ? photoSession.planLayerSourceCaptureTimes(layer.id) : null, [captureKey, review, layer.id, draft?.version]);
  const ops = draftReview?.ops || [];
  const opsBySource = new Map(ops.map((op) => [op.sourceId, op]));
  const newOps = ops.filter((op) => op.kind !== 'remove-gmi' && !op.recheck);
  const selected = plan ? selectedPhotoSourcePositions(plan, choices) : [];
  const positionRows = !plan ? [] : !focusedPhotoId ? plan.rows : [
    ...plan.rows.filter((row) => row.photoId === focusedPhotoId), ...plan.rows.filter((row) => row.photoId !== focusedPhotoId),
  ];
  const assets = [...new Map(photos.map((photo) => [photo.assetId || photo.id, photo])).values()];
  const repeats = (plan?.rows.length ?? photos.length) > assets.length;
  const selectionUnit = repeats ? selected.length === 1 ? 'plassering' : 'plasseringer' : selected.length === 1 ? 'bilde' : 'bilder';
  const pendingExif = assets.filter((photo) => photo.spatial.exifRead.state === 'pending').length;
  const viableExif = assets.filter((photo) => photo.spatial.candidates.some((candidate) => candidate.kind === 'exif' && candidate.status === 'viable')).length;
  const newEvidence = plan && plan.evidenceSignature !== (draftReview?.evidenceSignature ?? photoSourceEvidenceSignature(photos));
  const done = step === SAVED;
  // B1.3: Endringer lagret shows the steps the saved workflow actually had (Koblinger only when it was used).
  const steps = STEPS.map((label, index) => ({ key: index + 1, label }))
    .filter(({ key }) => done && saved?.stepKeys ? saved.stepKeys.includes(key) : key !== 2 || review || ops.length || step === 2);
  const canSave = !saving && (ops.length > 0 || selected.length > 0) && draftReview?.ok !== false;
  // B1.1: Kontroll's delivery consequences, from the session's read-only preview of the same commit planning.
  const previewDelivery = () => step === 4 && plan && selected.length ? photoSession.previewSourceWorkflowDelivery(ticketRef.current,
    { plan, requests: selected.map((row) => ({ photoId: row.photoId, candidateId: row.proposal.id })) }) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- plan, choices and the draft review are the revision boundary.
  const deliveryPreview = useMemo(previewDelivery, [step, plan, choices, draftReview]);

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
    setError(''); setStagedNotice(''); setStep(2); setRemoveSourceId(null);
    await photoSession.stageLayerSource(layer.id, input, sourceKind);
    if (ticketRef.current !== ticket || !photoSession.sourceWorkflowIsLive(ticket)) return;
    const result = photoSession.getSnapshot().sourceReviews[layer.id];
    if (!input.binding && result?.errorCode === 'duplicate-source') photoSession.recheckLayerSource(layer.id, result.attachedSourceId);
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
    setStep(2); setError(''); setStagedNotice(''); setRemoveSourceId(null);
  };
  const discard = () => {
    photoSession.cancelLayerSourceReview(layer.id);
    setStep(1); setError('');
  };
  // «Ta med kilden»: the review joins the draft. Nothing is saved.
  const includeSource = () => {
    const { key: _key, ...decision } = captureDecision;
    const kindOfSource = review.source.kind;
    const result = photoSession.stageSourceWorkflowSource(ticketRef.current, review,
      kindOfSource === 'gml' ? { captureTime: { ...decision, plan: capturePlan } } : undefined);
    if (!result.ok) { setError(errorText(result.error)); return; }
    setCaptureChoice({ key: null, ...EMPTY_GML_CAPTURE_DECISION });
    setError(''); setStagedNotice(`«${review.source.filename}» er tatt med i endringene.`);
    if (kindOfSource === 'gmi') positions(review.source.id);
  };
  const undoOp = (opId) => {
    const result = photoSession.unstageSourceWorkflowOp(ticketRef.current, opId);
    if (!result.ok) setError(errorText(result.error));
    else { setError(''); setPlan(null); }
  };
  const positions = (newGmiSourceId = null) => {
    const next = photoSession.reviewSourceWorkflowPositions(ticketRef.current);
    if (!next) {
      const current = photoSession.reviewLayerSourceDraft(layer.id);
      setError(current && !current.ok ? errorText(current.error) : 'Ta med eller forkast kilden som er valgt før du kontrollerer posisjoner.');
      return;
    }
    setChoices(photoSourcePositionChoices(next, plan, choices, focusedPhotoId, { newGmiSourceId, editedIds: editedIds.current }));
    setPlan(next); setStep(3); setError(''); setRemoveSourceId(null);
  };
  const save = () => {
    if (!canSave) return;
    setSaving(true); setError('');
    const ticket = ticketRef.current;
    const initialPlacement = !photoSession.getLayerPhotos(layer.id).some((photo) => photo.spatial.current);
    // Let «Lagrer …» render before the synchronous commit.
    requestAnimationFrame(() => {
      const result = photoSession.commitSourceWorkflow(ticket, { plan, version: draftReview?.version ?? null,
        requests: selected.map((row) => ({ photoId: row.photoId, candidateId: row.proposal.id })) });
      setSaving(false);
      if (!result.ok) { setError(result.message || errorText(result.error)); return; }
      editedIds.current.clear();
      setSaved({ ...result, layerId: layer.id, initialPlacement, stepKeys: steps.map(({ key }) => key) }); setStep(SAVED);
    });
  };
  const close = () => {
    if (saved) onApplied?.(saved);
    onClose();
  };
  const optionLabel = (candidate) => candidate.kind === 'exif' ? 'EXIF GPS' : candidate.kind === 'gmi' ? 'GMI – objektposisjon' :
    `GML: ${candidate.sourceFilename || layer.spatialSources.find((source) => source.id === candidate.sourceId)?.filename} (${(draftReview?.sources || layer.spatialSources).findIndex((source) => source.id === candidate.sourceId) + 1})`;
  const goBack = (target) => { setStep(target); setError(''); };
  const requestClose = () => {
    if (saving) return;
    if (!done && (ops.length || editedIds.current.size)) setConfirmClose(true); else close();
  };
  const nextFromSources = () => { if (review) goBack(2); else positions(); };
  const status = step >= 3 && !done && plan ? `${selected.length} ${selectionUnit} valgt` : '';
  const receipt = saved ? receiptLines(saved.receipt) : [];
  const primary = 'gmi-primary-control gmi-focus-ring min-h-10 px-4 photo-positioning-primary';

  return <dialog ref={dialogRef} className="photo-collection-dialog photo-positioning-wizard bg-gmi-surface text-gmi-text shadow-2xl" aria-labelledby="photo-positioning-title"
    onKeyDown={(event) => {
      if (event.key === 'Escape' && !event.defaultPrevented && event.target.closest('dialog') === event.currentTarget) {
        event.preventDefault(); event.stopPropagation(); requestClose();
      }
    }}
    data-step={step} data-saved={done || undefined} onCancel={(event) => { if (event.target !== event.currentTarget) return; event.preventDefault(); requestClose(); }}>
    <div className="photo-collection-frame">
      <header className="photo-collection-header"><div><h2 id="photo-positioning-title">Koble og posisjoner bilder</h2>
        <p className="text-sm text-gmi-text-muted">{layer.name} · {assets.length} bilder{photos.length > assets.length ? ` · ${photos.length} plasseringer` : ''}</p></div>
        <button type="button" className="gmi-focus-ring disabled:pointer-events-none disabled:opacity-50" aria-label={done ? 'Lukk kildekontroll' : 'Avbryt kildekontroll'} disabled={saving} onClick={requestClose}><XIcon size={22} aria-hidden="true" /></button>
      </header>
      <PhotoWizardSteps label="Steg i kildekontroll" steps={steps} current={done ? null : step} done={done}
        canGoBack={(target) => !done && !saving && target < step && (target !== 3 || Boolean(plan))} onBack={goBack} />
      <h3 ref={heading} tabIndex={-1} className="photo-import-heading">{done ? 'Endringer lagret' : STEPS[step - 1]}</h3>
      <div ref={content} className="photo-import-step-body photo-positioning-content">
        <div className="photo-positioning-step">
          {error && <p role="alert">{error}</p>}
          {step === 1 && <section aria-label="Kilder og koblinger">
            <h4 className="photo-positioning-subheading">Kilder i fotolaget</h4>
            <div className="photo-source-inventory">
              <PhotoSourceOption as="section" value="exif" label="Fra EXIF-data i bildene"
                hint={`${viableExif} bilder: Posisjon tilgjengelig · ${assets.length - viableExif - pendingExif} uten brukbar GPS`}>
                {pendingExif > 0 && <p role="status">Leser GPS … {pendingExif} bilder. Nye posisjoner velges ikke automatisk.</p>}
              </PhotoSourceOption>
              {layer.spatialSources.map((source, index) => {
                const op = opsBySource.get(source.id);
                return <PhotoSourceOption as="section" key={source.id} sourceId={source.id} value={source.kind}
                  label={`${index + 1}. ${sourceLabels[source.kind]}`}>
                  <p className="photo-source-filename">{source.filename}{op && <span className="photo-source-staged-tag" data-staged-op={op.kind}>{opTag(op)}</span>}</p>
                  {op?.kind === 'remove-gmi' && <p data-staged-removal>{source.filename} fjernes når du lagrer endringene.</p>}
                  <details><summary>Kildedetaljer</summary>{source.kind === 'gmi' ? <PhotoGmiSummary source={source} /> : <PhotoGmlSummary source={source} ledger={source.ledger} />}</details>
                  <div className="photo-import-source-actions flex flex-wrap gap-2">
                    {op ? <button type="button" className={photoSourceButton} onClick={() => undoOp(op.id)}>Angre</button> : <>
                      <button type="button" className={photoSourceButton} disabled={Boolean(review)} onClick={() => recheck(source.id)}>Kontroller på nytt</button>
                      {source.kind === 'gmi' && <button type="button" className={photoSourceButton} disabled={Boolean(review)} onClick={() => setRemoveSourceId(source.id)}>Fjern kilde</button>}
                    </>}
                  </div>
                  {removeSourceId === source.id && !op && <div className="photo-source-removal"><p>Fjerne {source.filename} og GMI-koblingene fra laget når du lagrer endringene? Bilder, posisjoner og retning beholdes.</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={photoSourceButton} onClick={() => setRemoveSourceId(null)}>Avbryt fjerning</button>
                      <button type="button" className={`${photoSourceButton} gmi-edit-destructive`} onClick={() => {
                        const result = photoSession.stageSourceWorkflowRemoval(ticketRef.current, source.id);
                        if (!result.ok) setError(errorText(result.error)); else setPlan(null);
                        setRemoveSourceId(null);
                      }}>Fjern GMI-kilde</button>
                    </div></div>}
                </PhotoSourceOption>;
              })}
              {newOps.map((op) => <PhotoSourceOption as="section" key={op.id} sourceId={op.sourceId} value={op.sourceKind}
                label={`${layer.spatialSources.length + newOps.indexOf(op) + 1}. ${sourceLabels[op.sourceKind]}`}>
                <p className="photo-source-filename">{op.filename}<span className="photo-source-staged-tag" data-staged-op="new">Ny</span></p>
                <div className="photo-import-source-actions flex flex-wrap gap-2">
                  <button type="button" className={photoSourceButton} onClick={() => undoOp(op.id)}>Angre</button>
                </div>
              </PhotoSourceOption>)}
            </div>
            <h4 className="photo-positioning-subheading">Legg til en kilde (valgfritt)</h4>
            {(layer.spatialSources.length > 0 || newOps.length > 0 || viableExif > 0) && <p className="photo-positioning-note" data-positioning-optional-source>Du kan gå videre med kildene som allerede finnes.</p>}
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
            {kind && <input ref={inputRef} type="file" accept={`.${kind}`} hidden aria-label={`Velg ${kind.toUpperCase()}-kilde`} onChange={readFile} />}
            {review && <p>En valgt kilde venter i Koblinger.</p>}
          </section>}
          {step === 2 && <section aria-label="Kontroller koblinger" className="photo-positioning-links">
            {review?.state === 'pending' && <p role="status">Analyserer kilden …</p>}
            {review?.state === 'error' && <p role="alert">{readErrors[review.errorCode] || 'Kilden kunne ikke leses. Forkast denne kontrollen og velg filen på nytt.'}</p>}
            {ready && <>
              {review.rebinding ? <p>Kilden kobles til GMI-laget «{review.rebinding.filename}».</p>
                : review.recheck && <p>Kilden finnes i laget. Treffene kontrolleres på nytt.</p>}
              {review.source.kind === 'gmi' ? <><PhotoGmiSummary source={review.source} ledger={review.associationLedger} />
                <p>Hvert punktobjekt gir en egen plassering som du kan bekrefte i neste steg. Linjer gir bare koblinger.</p><p>Kilden beholdes også uten treff. Flere bilder kan kobles ved en senere kontroll.</p></>
                : <><PhotoGmlSummary source={review.source} ledger={review.ledger} />
                  <PhotoGmlCaptureTimeChoices plan={capturePlan} choices={captureDecision} onChange={(patch) => setCaptureChoice({ ...captureDecision, ...patch })}
                    thumbnailFor={(assetId) => photos.find((photo) => (photo.assetId || photo.id) === assetId)?.preview?.thumbnailUrl || null} /></>}
              <p className="photo-positioning-stage-note" data-positioning-stage-note>{stageText}</p>
            </>}
            {!review && stagedNotice && <p role="status" data-positioning-staged>{stagedNotice}</p>}
            {!review && !stagedNotice && <p>Ingen ekstern kilde er valgt. EXIF GPS trenger ingen filkobling.</p>}
            <div className="flex flex-wrap gap-2">
              {review && <button type="button" className={photoSourceButton} onClick={discard}>Forkast kilden</button>}
            </div>
          </section>}
          {step === 3 && plan && <section aria-label="Kontroller posisjoner">
            <p className="photo-positioning-lead">Entydige posisjoner er forhåndsvalgt. Manuelle posisjoner beholdes.</p>
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
          {step === 4 && <section aria-label="Kontroller endringene" className="photo-positioning-kontroll" data-positioning-kontroll>
            {draftReview && !draftReview.ok && <p role="alert">{errorText(draftReview.error)}</p>}
            <DraftSummary draft={draftReview} />
            {plan && selected.length > 0 ? <section aria-label="Posisjoner" data-kontroll="positions"><h4 className="photo-positioning-subheading">Posisjoner</h4>
              <PositioningSummary plan={plan} selected={selected} selectionUnit={selectionUnit} repeats={repeats} optionLabel={optionLabel} newEvidence={newEvidence} /></section>
              : <p className="photo-positioning-note" data-kontroll="positions">Ingen posisjoner endres.</p>}
            <DeliverySummary effects={deliveryPreview} />
          </section>}
          {done && <section aria-label="Lagret" data-positioning-receipt>
            <ul className="photo-positioning-receipt">{receipt.map((line) => <li key={line}><CheckIcon size={16} weight="regular" aria-hidden="true" />{line}</li>)}</ul>
          </section>}
        </div>
      </div>
      <footer className="photo-import-footer border-t border-gmi-border" data-positioning-footer>
        <div className="mr-auto text-sm" role="status">{status}</div>
        {done ? <button type="button" className={primary} onClick={close} data-positioning-close>Lukk</button> : <>
          <button type="button" className={`${control} border border-gmi-border-strong px-3 py-2 text-gmi-text-muted`} onClick={requestClose} disabled={saving} data-positioning-cancel>Avbryt</button>
          {step > 1 && <button type="button" className={`${control} border border-gmi-border-strong bg-gmi-surface px-4 py-2`} disabled={saving} onClick={() => goBack(steps[steps.findIndex(({ key }) => key === step) - 1].key)} data-positioning-back>Tilbake</button>}
          {step === 1 && <button type="button" className={primary} onClick={nextFromSources} data-positioning-next>Neste</button>}
          {step === 2 && (review ? <button type="button" className={primary} disabled={!ready} onClick={includeSource} data-positioning-stage>
            {review.source?.kind === 'gmi' ? 'Ta med kilde og koblinger' : 'Ta med kilden'}</button>
            : <button type="button" className={primary} onClick={() => positions()} data-positioning-next>Neste</button>)}
          {step === 3 && <button type="button" className={primary} disabled={!selected.length && !ops.length} onClick={() => setStep(4)} data-positioning-next>Neste</button>}
          {step === 4 && <button type="button" className={`${primary} photo-positioning-final`} disabled={!canSave} aria-busy={saving || undefined} onClick={save} data-positioning-apply>
            {saving ? <CircleNotchIcon size={16} weight="regular" aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <CheckIcon size={16} weight="regular" aria-hidden="true" />}{saving ? 'Lagrer …' : 'Lagre endringer'}</button>}
        </>}
      </footer>
    </div>
    {confirmClose && <div onKeyDown={(event) => {
      // Consume the nested modal's Escape before native dialog dismissal reaches the parent.
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setConfirmClose(false); }
    }}><GmiConfirmDialog testId="positioning-draft" title="Forkaste endringene?" confirmLabel="Forkast endringer" cancelLabel="Fortsett"
      onCancel={() => setConfirmClose(false)} onConfirm={onClose}>
      <p>Kilder, koblinger, opptakstider og posisjonsvalg i denne kontrollen lagres ikke. Fotolaget beholdes som før.</p>
    </GmiConfirmDialog></div>}
  </dialog>;
}
