'use client';

import { useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { canSetOnMap, completionSummary, isHeldBack, manualFillRows, placementCount, scopedRows, selectedPlacementCount } from '@/lib/photos/photoCompletion.mjs';
import { CompletionCounts, CompletionDone, CompletionGroups, CompletionHeading, CompletionNotes, CompletionSelection, completionButton, completionRowButton } from './PhotoCompletionRows';

const counted = (scope, count) => scope.length ? selectedPlacementCount(count) : placementCount(count);

function SameDirectionForm({ rows, layerId, onStatus }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const degrees = value === '' ? null : Number(value);
  const submit = (event) => {
    event.preventDefault();
    const result = photoSession.fillMissingPhotoValues(layerId, 'direction', degrees, rows.map((row) => row.photoId));
    if (!result.ok) { setError('Oppgi et tall fra 0 til 360 grader.'); return; }
    setError(null); setValue('');
    onStatus(`Manuell retning er godtatt for ${placementCount(result.counts.adopted)}.`);
  };
  return <details className="photo-completion-manual" data-manual-fill="direction">
    <summary>Samme retning for valgte plasseringer</summary>
    <form onSubmit={submit}>
      <label>Retning i grader, med klokken fra geografisk nord
        <input className="gmi-focus-ring" type="number" min="0" max="360" step="any" value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      {(degrees === 0 || degrees === 360) && <p data-zero-direction-note>0° betyr nord, ikke ukjent retning.</p>}
      {error && <p role="alert" className="photo-capture-time-error">{error}</p>}
      {!rows.length && <p>Velg plasseringer i listen først.</p>}
      <button type="submit" className={completionButton} disabled={!rows.length || degrees === null}>Bruk på {selectedPlacementCount(rows.length)}</button>
    </form>
  </details>;
}

// Direction belongs to the occurrence, so a shared original has one row per placement and can end up with different values.
// Source directions and defaults are already in place. What is left here is optional correction.
export default function PhotoCompletionDirectionPanel({ task, title, requirementLabel, note, recommendations, excluded, layerId, selected, scope, onSelection, onStatus, onOpenMap }) {
  const heldBack = task.rows.filter(isHeldBack).length;
  const mapRows = scopedRows(task.rows, scope, canSetOnMap);
  // These buttons move with the blocks above them, so a second click of a double-click never counts here either.
  const openMap = (event, mapScope, rows, focusId = null) => { if (event.detail < 2) onOpenMap({ task: 'direction', scope: mapScope, photoIds: rows.map((row) => row.photoId), focusId }); };
  const correctAction = (row) => row.accepted ? <button type="button" className={completionRowButton} aria-label={`Rett ${row.filename}${row.occurrence ? `, ${row.occurrence}` : ''} på kartet`}
    onClick={(event) => openMap(event, 'review', [row], row.photoId)}>Rett på kartet</button> : null;

  return <section aria-label="Retning" data-completion-panel="direction">
    <CompletionHeading title={title} requirementLabel={requirementLabel} note={note} excluded={excluded} />
    {task.rows.length === 0 && <p>Ingen plasserte bilder ennå.</p>}
    {task.rows.length > 0 && <CompletionCounts counts={completionSummary(task, selected)} />}
    <CompletionNotes items={recommendations} />
    {task.rows.some((row) => row.occurrence && row.origin === 'source') && <p className="photo-completion-requirement-note" data-shared-original>Samme retning brukes på hver plassering av et delt originalbilde. Det dokumenterer ikke separate kameraobservasjoner.</p>}
    {task.rows.some(canSetOnMap) && <div className="photo-completion-actions" data-completion-actions="map">
      <button type="button" className={completionButton} disabled={!mapRows.length} onClick={(event) => openMap(event, 'missing', mapRows)}>Angi på kartet</button>
      <p className="photo-completion-requirement-note">Gjelder {counted(scope, mapRows.length)}. Du kommer tilbake hit etterpå, og retningene er ikke godtatt før du lagrer dem.</p>
    </div>}
    {heldBack > 0 && <p className="photo-completion-requirement-note" data-held-back>{placementCount(heldBack)} venter på bildedata og er ikke med i handlingene ennå.</p>}
    {task.rows.length > task.done.length && <SameDirectionForm rows={manualFillRows(task.rows, selected)} layerId={layerId} onStatus={onStatus} />}
    <CompletionSelection count={selected.length} scope={scope.length} onClear={() => onSelection([])} />
    <CompletionGroups groups={task.groups} selected={selected} onSelection={onSelection} rowAction={correctAction} />
    <CompletionDone rows={task.done} rowAction={correctAction} />
  </section>;
}
