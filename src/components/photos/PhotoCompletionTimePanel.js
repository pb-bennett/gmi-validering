'use client';

import { useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { CAPTURE_TIME_ERRORS, composeCaptureTime } from '@/lib/photos/photoCaptureTimeInput.mjs';
import { canAdopt, completionCounts, isHeldBack, manualFillRows, photoCount, scopedRows, selectedPhotoCount } from '@/lib/photos/photoCompletion.mjs';
import PhotoCaptureTimeField from './PhotoCaptureTimeField';
import { CompletionCounts, CompletionDone, CompletionGroups, CompletionHeading, CompletionNotes, CompletionSelection, completionButton, completionRowButton } from './PhotoCompletionRows';

const SOURCES = Object.freeze([['exif', 'EXIF-tid'], ['gml', 'GML-tid']]);
const canAdoptAny = (row) => SOURCES.some(([kind]) => canAdopt(kind)(row));

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

// Evidence first, then manual entry. Conflicts and values that replace an accepted one go through the per-photo dialog.
export default function PhotoCompletionTimePanel({ task, title, requirementLabel, note, recommendations, excluded, layerId, selected, scope, onSelection, onEdit, onStatus }) {
  const adoptable = task.rows.filter(canAdoptAny);
  const sample = adoptable[0];
  const agreeing = adoptable.filter((row) => row.sourcesAgree).length;
  const heldBack = task.rows.filter(isHeldBack).length;
  const adopt = (kind, label, rows) => {
    const result = photoSession.adoptSourceEvidence(layerId, 'captureTime', kind, rows.map((row) => row.photoId));
    onStatus(result.ok ? `${label} er godtatt for ${photoCount(result.counts.adopted)}.` : 'Kildeverdien kunne ikke brukes.');
  };
  const rowAction = (row) => row.state === 'pending' ? null
    : <button type="button" className={completionRowButton} onClick={() => onEdit(row.photoId)}>{row.state === 'conflict' ? 'Velg verdi…' : 'Rediger…'}</button>;

  return <section aria-label="Opptakstid" data-completion-panel="captureTime">
    <CompletionHeading title={title} requirementLabel={requirementLabel} note={note} excluded={excluded} />
    {task.rows.length === 0 && <p>Ingen plasserte bilder ennå.</p>}
    {task.rows.length > 0 && <CompletionCounts counts={completionCounts(task, selected, canAdoptAny)} />}
    <CompletionNotes items={recommendations} />
    {adoptable.length > 0 && <div className="photo-completion-actions" data-completion-actions="captureTime">
      {agreeing > 0 && <p data-completion-agreement>Kildene stemmer overens for {photoCount(agreeing)}. Hver kildeverdi beholdes, og du velger hvilken som brukes.</p>}
      <div className="photo-completion-sample"><p>Eksempel: {sample.filename}</p>{sample.sources.map((source) => <p key={source.key}>{source.text}</p>)}</div>
      <div className="photo-completion-action-buttons">
        {SOURCES.map(([kind, label]) => {
          if (!task.rows.some(canAdopt(kind))) return null;
          const rows = scopedRows(task.rows, scope, canAdopt(kind));
          return <button key={kind} type="button" className={completionButton} data-adopt={kind} disabled={!rows.length} onClick={() => adopt(kind, label, rows)}>
            Bruk {label} for {scope.length ? selectedPhotoCount(rows.length) : photoCount(rows.length)}
          </button>;
        })}
      </div>
      <p className="photo-completion-requirement-note">Godtatte verdier beholdes. Tidssone settes bare når kilden oppgir den.</p>
    </div>}
    {heldBack > 0 && <p className="photo-completion-requirement-note" data-held-back>{photoCount(heldBack)} venter på bildedata og er ikke med i handlingene ennå.</p>}
    {task.rows.length > task.done.length && <SameTimeForm rows={manualFillRows(task.rows, selected)} layerId={layerId} onStatus={onStatus} />}
    <CompletionSelection count={selected.length} scope={scope.length} onClear={() => onSelection([])} />
    <CompletionGroups groups={task.groups} selected={selected} onSelection={onSelection} rowAction={rowAction} />
    <CompletionDone rows={task.done} rowAction={rowAction} />
  </section>;
}
