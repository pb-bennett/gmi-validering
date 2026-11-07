'use client';

import { useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { CAPTURE_TIME_ERRORS, composeCaptureTime } from '@/lib/photos/photoCaptureTimeInput.mjs';
import { completionSummary, isHeldBack, manualFillRows, photoCount, selectedPhotoCount } from '@/lib/photos/photoCompletion.mjs';
import PhotoCaptureTimeField from './PhotoCaptureTimeField';
import { CompletionCounts, CompletionDone, CompletionGroups, CompletionHeading, CompletionNotes, CompletionSelection, completionButton, completionRowButton } from './PhotoCompletionRows';
import PhotoExportStatus from './PhotoExportStatus';

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
export default function PhotoCompletionTimePanel({ task, title, requirementLabel, note, recommendations, readiness, reading, excluded, layerId, selected, scope, onSelection, onEdit, onStatus }) {
  const heldBack = task.rows.filter(isHeldBack).length;
  const rowAction = (row) => row.state === 'pending' ? null
    : <button type="button" className={completionRowButton} onClick={() => onEdit(row.photoId)}>{row.state === 'conflict' ? 'Velg verdi…' : 'Rediger…'}</button>;

  return <section aria-label="Opptakstid" data-completion-panel="captureTime">
    <CompletionHeading title={title} requirementLabel={requirementLabel} note={note} excluded={excluded} />
    {task.rows.length === 0 && <p>Ingen plasserte bilder ennå.</p>}
    {task.rows.length > 0 && <CompletionCounts counts={completionSummary(task, selected)} />}
    {task.rows.length > 0 && <PhotoExportStatus readiness={readiness} reading={reading} />}
    <CompletionNotes items={recommendations} />
    {heldBack > 0 && <p className="photo-completion-requirement-note" data-held-back>{photoCount(heldBack)} venter på bildedata og er ikke med i handlingene ennå.</p>}
    {task.rows.length > task.done.length && <SameTimeForm rows={manualFillRows(task.rows, selected)} layerId={layerId} onStatus={onStatus} />}
    <CompletionSelection count={selected.length} scope={scope.length} onClear={() => onSelection([])} />
    <CompletionGroups groups={task.groups} selected={selected} onSelection={onSelection} rowAction={rowAction} />
    <CompletionDone rows={task.done} rowAction={rowAction} />
  </section>;
}
