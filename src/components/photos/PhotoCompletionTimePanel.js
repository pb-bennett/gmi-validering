'use client';

import { useState } from 'react';
import { CalendarBlankIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { ESTIMATED_DATE_HELP, estimatedDateReviewSignature } from '@/lib/photos/photoEstimatedDates.mjs';
import { captureCompletionSignature, selectedCaptureCompletionRows } from '@/lib/photos/photoCaptureCompletion.mjs';
import { formatPhotoCaptureTime } from '@/lib/photos/photoPresentation.mjs';
import { CAPTURE_TIME_ERRORS, composeCaptureTime } from '@/lib/photos/photoCaptureTimeInput.mjs';
import { captureStepResultText, completionSummary, isHeldBack, manualFillRows, photoCount, selectedPhotoCount, technicalCompletionExplanation } from '@/lib/photos/photoCompletion.mjs';
import PhotoCaptureTimeField from './PhotoCaptureTimeField';
import { CompletionCounts, CompletionDone, CompletionGroups, CompletionHeading, CompletionNotes, CompletionSelection, completionButton, completionRowButton } from './PhotoCompletionRows';
import PhotoExportStatus from './PhotoExportStatus';

const displayDate = (date) => date ? date.split('-').reverse().join('.') : '';

const valueText = (value, provenance) => { const time = formatPhotoCaptureTime(value, provenance); return time ? [time.text, ...time.notes].join(' · ') : ''; };
// Date-only and minute values are always offered, counted and listed apart from complete values.
const STEPS = Object.freeze({
  source: { title: 'Opptakstid fra kildene', groups: [['complete', 'Dato og klokkeslett'], ['minute', 'Klokkeslett uten sekunder'], ['date', 'Kun dato']], action: 'Bruk valgte kildeverdier' },
  filename: { title: 'Dato tolket fra filnavn', groups: [['complete', 'Dato og klokkeslett'], ['minute', 'Klokkeslett uten sekunder'], ['date', 'Kun dato']], action: 'Bruk valgte filnavndatoer' },
  technical: { title: 'Teknisk utfylling (valgfritt)', groups: [['noon', (count) => `Fyll ut kl. 12:00:00 for ${photoCount(count)} med kun dato.`],
    ['seconds', (count) => `Fyll ut 00 sekunder for ${photoCount(count)} med klokkeslett uten sekunder.`]], action: 'Fyll ut' },
});

// M5 (C1): one step of the Opptakstid flow. Every option starts unchecked; one button writes the checked groups at once
// and offers an undo. A step with nothing to offer and nothing to undo is hidden.
// C1.2: the outcome stays beside its undo, with the actual counts from the write, and is not repeated in the footer.
// C1.4: `compact` folds an optional step away until it is opened or holds a result.
function CaptureCompletionStep({ number, step, lists, layerId, onStatus, undo, onUndo, explanation = null, compact = false }) {
  const [checked, setChecked] = useState({});
  const [error, setError] = useState(null);
  const definition = STEPS[step];
  const groups = definition.groups.filter(([key]) => lists[key]?.length);
  if (!groups.length && !undo) return null;
  const chosen = groups.filter(([key]) => checked[key]).map(([key]) => key);
  const rows = groups.flatMap(([key]) => lists[key]);
  const apply = () => {
    const selected = selectedCaptureCompletionRows({ [step]: lists }, { step, groups: chosen });
    const result = photoSession.completeCaptureTimes(layerId, { step, groups: chosen, expected: captureCompletionSignature(selected) });
    if (!result.ok) { setError(result.error === 'review-changed' ? 'Opplysningene er endret. Kontroller forslagene og prøv igjen.' : 'Ingen verdier ble endret.'); return; }
    setError(null); setChecked({}); onUndo(step, { token: result.undoToken, text: captureStepResultText(step, result) });
    onStatus('');
  };
  const revert = () => {
    const result = photoSession.undoCaptureTimeFill(undo?.token);
    onUndo(step, null);
    onStatus(result.ok ? `Angret for ${photoCount(result.restored)}.${result.skipped ? ` ${photoCount(result.skipped)} med senere endringer ble ikke endret.` : ''}` : 'Endringen kan ikke angres lenger.');
  };
  const heading = <h4 id={`capture-step-${step}`}>{number}. {definition.title}</h4>;
  const body = <>
    {groups.length > 0 && explanation && <p data-capture-explanation>{explanation}</p>}
    {groups.length > 0 && <fieldset className="photo-capture-step-options"><legend className="sr-only">{definition.title}</legend>
      {groups.map(([key, label]) => <label key={key} className="photo-gml-capture-choice" data-capture-group={key}>
        <input type="checkbox" className="accent-gmi-interactive" checked={Boolean(checked[key])} onChange={(event) => setChecked({ ...checked, [key]: event.target.checked })} />
        {typeof label === 'function' ? label(lists[key].length) : `${label} (${lists[key].length})`}
      </label>)}
    </fieldset>}
    {rows.length > 0 && <details className="photo-capture-step-proposals" data-capture-proposals={rows.length}>
      <summary>Vis forslag ({rows.length})</summary>
      <ul>{rows.map((row) => <li key={row.assetId}><strong>{row.filename}</strong> · {row.from ? `${valueText(row.from)} → ` : ''}{valueText(row.value, row.provenance)}</li>)}</ul>
    </details>}
    {error && <p role="alert">{error}</p>}
    {groups.length > 0 && <div className="photo-capture-step-actions">
      <button type="button" className={completionButton} disabled={!chosen.length} onClick={apply} data-capture-apply={step}>{definition.action}</button>
    </div>}
    {undo && <div className="photo-capture-result" data-capture-result={step}>
      <p role="status">{undo.text}</p>
      <button type="button" className={completionButton} onClick={revert} data-capture-undo={step}><ArrowCounterClockwiseIcon size={16} weight="regular" aria-hidden="true" />Angre</button>
    </div>}
  </>;
  return <section className="photo-completion-estimated photo-capture-step" data-capture-step={step} aria-labelledby={`capture-step-${step}`}>
    {compact && !undo ? <details className="photo-capture-step-compact" data-capture-compact>
      <summary>{heading}<span className="photo-capture-step-count">{photoCount(rows.length)}</span></summary>
      <div className="photo-capture-step-body">{body}</div>
    </details> : <>{heading}{body}</>}
  </section>;
}

// C3/C1.3: the median estimate. The date is prefilled only within 7 days' spread; a longer spread (months or years)
// still offers the median, which must then be chosen. With too few known dates only a date entered by hand is possible.
// Leaving it empty is always valid.
function EstimatedDateForm({ model, number, layerId, onStatus, dateUndo, onDateUndo }) {
  // null follows a prefilled suggestion that arrives with source data; an explicit choice, including clearing, stays put.
  const [chosenDate, setChosenDate] = useState(null);
  const [error, setError] = useState(null);
  const date = chosenDate ?? (model.proposal === 'prefill' ? model.suggestedDate : null) ?? '';
  const suggested = Boolean(model.suggestedDate && date === model.suggestedDate);
  const submit = (event) => {
    event.preventDefault();
    const result = photoSession.fillMissingPhotoValues(layerId, 'captureTime', date, null,
      { estimated: true, expectedEstimate: estimatedDateReviewSignature(model) });
    if (!result.ok) {
      setError(result.error === 'review-changed' ? 'Datogrunnlaget er endret. Kontroller datoen og prøv igjen.' : CAPTURE_TIME_ERRORS['invalid-value']);
      return;
    }
    setError(null);
    if (result.undoToken) onDateUndo({ token: result.undoToken,
      text: `Anslått dato ${displayDate(date)} er brukt på ${photoCount(result.counts.adopted)} uten datobevis. Eksisterende opptaksdatoer er beholdt. Kl. 12:00:00 er teknisk standard, ikke målt.` });
    onStatus('');
  };
  const undo = () => {
    const result = photoSession.undoCaptureTimeFill(dateUndo?.token);
    onDateUndo(null);
    onStatus(result.ok ? `Anslått dato angret for ${photoCount(result.restored)}.${result.skipped ? ` ${photoCount(result.skipped)} med senere endringer eller fjernede bilder ble ikke endret.` : ''}` : 'Endringen kan ikke angres lenger.');
  };
  if (!model.missing && !dateUndo) return null;
  const heading = <h4><CalendarBlankIcon size={18} weight="regular" aria-hidden="true" /> {number}. Anslått opptaksdato (valgfritt)</h4>;
  return <div className="photo-completion-estimated" data-estimated-dates>
    {model.missing > 0 && <form onSubmit={submit}>
      {heading}
      <p data-estimate-basis>{model.suggestedDate
        ? `Forslag: ${displayDate(model.suggestedDate)} — median av ${model.basis} kjente opptaksdatoer i fotolaget (${model.first === model.last ? displayDate(model.first) : `${displayDate(model.first)}–${displayDate(model.last)}`}). Gjelder ${photoCount(model.missing)} uten datobevis. Lagres som anslått dato med kl. 12:00:00 som teknisk standard.`
        : 'For få kjente datoer til å foreslå en dato. Velg en dato selv.'}</p>
      {model.proposal === 'confirm' && <div className="photo-capture-estimate-spread" data-estimate-spread={model.spreadDays}>
        <p>De kjente datoene spenner over {model.spreadDays} dager. Medianen er foreslått, men du må velge den selv.</p>
        {!suggested && <button type="button" className={completionButton} onClick={() => setChosenDate(model.suggestedDate)} data-use-suggested-date>Bruk foreslått dato</button>}
      </div>}
      <PhotoCaptureTimeField value={{ date }} onChange={(fields) => setChosenDate(fields.date)} dateOnly legend="Anslått dato for alle bilder uten opptaksdato" help={ESTIMATED_DATE_HELP} error={error} />
      <p data-estimated-date-summary>{photoCount(model.missing)} uten opptaksdato i hele FOTO-laget{date ? ` får ${displayDate(date)}` : ''}. Eksisterende datoer beholdes.</p>
      <button type="submit" className="gmi-primary-control gmi-focus-ring min-h-9 px-3 py-1.5 text-sm font-medium" disabled={!date}>
        Bruk {suggested ? 'foreslått' : 'valgt'} dato på {photoCount(model.missing)}
      </button>
    </form>}
    {dateUndo && <>
      {!model.missing && heading}
      <div className="photo-capture-result" data-capture-result="estimate">
        <p role="status">{dateUndo.text}</p>
        <button type="button" className={completionButton} onClick={undo} data-undo-estimated-dates><ArrowCounterClockwiseIcon size={16} weight="regular" aria-hidden="true" />Angre anslått dato</button>
      </div>
    </>}
  </div>;
}

function SameTimeForm({ rows, layerId, onStatus }) {
  const [fields, setFields] = useState({ date: '', time: '', zone: '', customOffset: '' });
  const [error, setError] = useState(null);
  const submit = (event) => {
    event.preventDefault();
    const composed = composeCaptureTime(fields, { requireSeconds: true });
    if (!composed.ok) { setError(CAPTURE_TIME_ERRORS[composed.error]); return; }
    const result = photoSession.fillMissingPhotoValues(layerId, 'captureTime', composed.value.iso, rows.map((row) => row.photoId));
    if (!result.ok) { setError(CAPTURE_TIME_ERRORS['invalid-value']); return; }
    setError(null);
    onStatus(`Manuell opptakstid er godtatt for ${photoCount(result.counts.adopted)}.`);
  };
  return <details className="photo-completion-manual" data-manual-fill="captureTime">
    <summary>Samme tidspunkt for valgte bilder</summary>
    <form onSubmit={submit}>
      <PhotoCaptureTimeField value={fields} onChange={setFields} error={error} legend="Samme tidspunkt for valgte bilder" help="Sekunder kreves. Godtatte verdier beholdes." />
      {rows.length ? <p>Samme tidspunkt brukes på {photoCount(rows.length)}.</p> : <p>Velg bilder i listen først.</p>}
      <button type="submit" className={completionButton} disabled={!rows.length}>Bruk på {selectedPhotoCount(rows.length)}</button>
    </form>
  </details>;
}

// Unaccepted source times and corrections use the existing per-photo metadata dialog. M5 (C1): the batch steps come
// first, in order of evidence; every one is optional, and leaving values blank stays valid.
export default function PhotoCompletionTimePanel({ task, title, requirementLabel, note, recommendations, readiness, reading, excluded, layerId, selected, scope, onSelection, onEdit, onStatus, undos = {}, onUndo }) {
  const schemaName = readiness?.levels?.schema?.name ?? null;
  // Steps with nothing to offer and nothing to undo are hidden; the visible ones are numbered in order.
  const visibleSteps = !task.completion ? [] : ['source', 'filename', 'technical']
    .filter((step) => Object.values(task.completion[step]).some((rows) => rows.length) || undos[step]);
  const heldBack = task.rows.filter(isHeldBack).length;
  const rowAction = (row) => row.state === 'pending' ? null
    : <button type="button" className={completionRowButton} onClick={() => onEdit(row.photoId)}>{row.state === 'conflict' ? 'Velg verdi…' : 'Rediger…'}</button>;
  const technicalRows = task.completion ? [...task.completion.technical.noon, ...task.completion.technical.seconds] : [];

  return <section aria-label="Opptakstid" data-completion-panel="captureTime">
    <CompletionHeading title={title} requirementLabel={requirementLabel} note={note} />
    {excluded > 0 && <p className="photo-completion-requirement-note">{excluded} uten posisjon vises ikke i listene nedenfor. Datohandlingen gjelder hele FOTO-laget.</p>}
    {task.rows.length === 0 && <p>Ingen plasserte bilder ennå.</p>}
    {task.rows.length > 0 && <CompletionCounts counts={completionSummary(task, selected)} />}
    {task.completion && <div className="photo-capture-steps" data-capture-completion>
      {visibleSteps.map((step, index) => <CaptureCompletionStep key={step} number={index + 1} step={step} lists={task.completion[step]}
        layerId={layerId} onStatus={onStatus} undo={undos[step] || null} onUndo={onUndo}
        explanation={step === 'technical' && technicalRows.length ? technicalCompletionExplanation(technicalRows, task.requirement, schemaName) : null}
        compact={step === 'technical' && task.requirement !== 'required'} />)}
    </div>}
    <EstimatedDateForm model={task.estimatedDates} number={visibleSteps.length + 1} layerId={layerId} onStatus={onStatus} dateUndo={undos.estimate || null} onDateUndo={(entry) => onUndo('estimate', entry)} />
    {task.rows.length > 0 && <PhotoExportStatus readiness={readiness} reading={reading} />}
    <CompletionNotes items={recommendations} />
    {heldBack > 0 && <p className="photo-completion-requirement-note" data-held-back>{photoCount(heldBack)} venter på bildedata og er ikke med i handlingene ennå.</p>}
    {task.rows.length > task.done.length && <SameTimeForm rows={manualFillRows(task.rows, selected)} layerId={layerId} onStatus={onStatus} />}
    <CompletionSelection count={selected.length} scope={scope.length} onClear={() => onSelection([])} />
    <CompletionGroups groups={task.groups} selected={selected} onSelection={onSelection} rowAction={rowAction} />
    <CompletionDone rows={task.done} rowAction={rowAction} />
  </section>;
}
