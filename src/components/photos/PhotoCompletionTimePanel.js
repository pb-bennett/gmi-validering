'use client';

import { useState } from 'react';
import { CalendarBlankIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { ESTIMATED_DATE_HELP } from '@/lib/photos/photoEstimatedDates.mjs';
import { CAPTURE_TIME_ERRORS, composeCaptureTime } from '@/lib/photos/photoCaptureTimeInput.mjs';
import { completionSummary, isHeldBack, manualFillRows, photoCount, selectedPhotoCount } from '@/lib/photos/photoCompletion.mjs';
import PhotoCaptureTimeField from './PhotoCaptureTimeField';
import { CompletionCounts, CompletionDone, CompletionGroups, CompletionHeading, CompletionNotes, CompletionSelection, completionButton, completionRowButton } from './PhotoCompletionRows';
import PhotoExportStatus from './PhotoExportStatus';

const displayDate = (date) => date ? date.split('-').reverse().join('.') : '';

function EstimatedDateForm({ model, layerId, onStatus, dateUndo, onDateUndo }) {
  // null follows a suggestion that arrives with source data; an explicit choice, including clearing, stays put.
  const [chosenDate, setChosenDate] = useState(null);
  const [error, setError] = useState(null);
  const date = chosenDate ?? model.suggestedDate ?? '';
  const suggested = Boolean(model.suggestedDate && date === model.suggestedDate);
  const submit = (event) => {
    event.preventDefault();
    const result = photoSession.fillMissingPhotoValues(layerId, 'captureTime', date, null, { estimated: true });
    if (!result.ok) { setError(CAPTURE_TIME_ERRORS['invalid-value']); return; }
    setError(null);
    if (result.undoToken) onDateUndo(result.undoToken);
    onStatus(`Anslått dato er brukt på ${photoCount(result.counts.adopted)}. Eksisterende opptaksdatoer er beholdt.`);
  };
  const undo = () => {
    const result = photoSession.undoCaptureTimeFill(dateUndo);
    onDateUndo(null);
    onStatus(result.ok ? `Anslått dato angret for ${photoCount(result.restored)}.${result.skipped ? ` ${photoCount(result.skipped)} med senere endringer eller fjernede bilder ble ikke endret.` : ''}` : 'Endringen kan ikke angres lenger.');
  };
  if (!model.missing && !dateUndo) return null;
  return <div className="photo-completion-estimated" data-estimated-dates>
    {model.missing > 0 && <form onSubmit={submit}>
      <h4><CalendarBlankIcon size={18} weight="regular" aria-hidden="true" /> Anslått opptaksdato</h4>
      <p>{model.suggestedDate ? `Forslag: ${displayDate(model.suggestedDate)} · ${model.first === model.last ? 'Basert på kjent dato i laget.' : `Midt mellom ${displayDate(model.first)} og ${displayDate(model.last)}.`}` : 'Ingen sikker datoperiode å foreslå fra. Velg en dato selv.'}</p>
      <PhotoCaptureTimeField value={{ date }} onChange={(fields) => setChosenDate(fields.date)} dateOnly legend="Anslått dato for alle bilder uten opptaksdato" help={ESTIMATED_DATE_HELP} error={error} />
      <p data-estimated-date-summary>{photoCount(model.missing)} uten opptaksdato i hele FOTO-laget{date ? ` får ${displayDate(date)}` : ''}. Eksisterende datoer beholdes.</p>
      <button type="submit" className="gmi-primary-control gmi-focus-ring min-h-9 px-3 py-1.5 text-sm font-medium" disabled={!date}>
        Bruk {suggested ? 'foreslått' : 'valgt'} dato på {photoCount(model.missing)}
      </button>
    </form>}
    {dateUndo && <button type="button" className={completionButton} onClick={undo} data-undo-estimated-dates><ArrowCounterClockwiseIcon size={16} weight="regular" aria-hidden="true" /> Angre anslått dato</button>}
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

// Source times are already in use. What is left is what no source has, and corrections through the per-photo dialog.
export default function PhotoCompletionTimePanel({ task, title, requirementLabel, note, recommendations, readiness, reading, excluded, layerId, selected, scope, onSelection, onEdit, onStatus, dateUndo, onDateUndo }) {
  const heldBack = task.rows.filter(isHeldBack).length;
  const rowAction = (row) => row.state === 'pending' ? null
    : <button type="button" className={completionRowButton} onClick={() => onEdit(row.photoId)}>{row.state === 'conflict' ? 'Velg verdi…' : 'Rediger…'}</button>;

  return <section aria-label="Opptakstid" data-completion-panel="captureTime">
    <CompletionHeading title={title} requirementLabel={requirementLabel} note={note} />
    {excluded > 0 && <p className="photo-completion-requirement-note">{excluded} uten posisjon vises ikke i listene nedenfor. Datohandlingen gjelder hele FOTO-laget.</p>}
    {task.rows.length === 0 && <p>Ingen plasserte bilder ennå.</p>}
    {task.rows.length > 0 && <CompletionCounts counts={completionSummary(task, selected)} />}
    <EstimatedDateForm model={task.estimatedDates} layerId={layerId} onStatus={onStatus} dateUndo={dateUndo} onDateUndo={onDateUndo} />
    {task.rows.length > 0 && <PhotoExportStatus readiness={readiness} reading={reading} />}
    <CompletionNotes items={recommendations} />
    {heldBack > 0 && <p className="photo-completion-requirement-note" data-held-back>{photoCount(heldBack)} venter på bildedata og er ikke med i handlingene ennå.</p>}
    {task.rows.length > task.done.length && <SameTimeForm rows={manualFillRows(task.rows, selected)} layerId={layerId} onStatus={onStatus} />}
    <CompletionSelection count={selected.length} scope={scope.length} onClear={() => onSelection([])} />
    <CompletionGroups groups={task.groups} selected={selected} onSelection={onSelection} rowAction={rowAction} />
    <CompletionDone rows={task.done} rowAction={rowAction} />
  </section>;
}
