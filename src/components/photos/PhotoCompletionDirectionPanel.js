'use client';

import { useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { planEvidenceAdoption } from '@/lib/photos/photoEvidenceAdoption.mjs';
import { canAcceptGmlZero, canAdopt, canReviewOnMap, canSetOnMap, completionCounts, isHeldBack, manualFillRows, placementCount, scopedRows, selectedPlacementCount } from '@/lib/photos/photoCompletion.mjs';
import { CompletionCounts, CompletionDone, CompletionGroups, CompletionHeading, CompletionNotes, CompletionSelection, completionButton, completionRowButton } from './PhotoCompletionRows';

const SOURCES = Object.freeze([['exif', 'EXIF-retning'], ['gml', 'GML-retning']]);
const canAdoptAny = (row) => SOURCES.some(([kind]) => canAdopt(kind)(row));
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
export default function PhotoCompletionDirectionPanel({ task, title, requirementLabel, note, recommendations, excluded, photos, layerId, selected, scope, onSelection, onStatus, onOpenMap }) {
  const heldBack = task.rows.filter(isHeldBack).length;
  const zeroRows = scopedRows(task.rows, scope, canAcceptGmlZero);
  const mapRows = scopedRows(task.rows, scope, canSetOnMap);
  const reviewRows = task.rows.filter(canReviewOnMap);
  // These buttons move with the blocks above them, so a second click of a double-click never counts here either.
  const openMap = (event, mapScope, rows, focusId = null) => { if (event.detail < 2) onOpenMap({ task: 'direction', scope: mapScope, photoIds: rows.map((row) => row.photoId), focusId }); };
  const correctAction = (row) => <button type="button" className={completionRowButton} aria-label={`Rett ${row.filename}${row.occurrence ? `, ${row.occurrence}` : ''} på kartet`}
    onClick={(event) => openMap(event, 'review', canReviewOnMap(row) ? reviewRows : [row], row.photoId)}>Rett på kartet</button>;
  const adopt = (kind, label, rows, options) => {
    const result = photoSession.adoptSourceEvidence(layerId, 'direction', kind, rows.map((row) => row.photoId), options);
    onStatus(result.ok ? `${label} er godtatt for ${placementCount(result.counts.adopted)}.` : 'Kildeverdien kunne ikke brukes.');
  };
  const sources = SOURCES.filter(([kind]) => task.rows.some(canAdopt(kind))).map(([kind, label]) => {
    const rows = scopedRows(task.rows, scope, canAdopt(kind));
    return { kind, label, rows, shared: planEvidenceAdoption(photos, 'direction', kind, rows.map((row) => row.photoId)).counts.repeatedApplications };
  });

  return <section aria-label="Retning" data-completion-panel="direction">
    <CompletionHeading title={title} requirementLabel={requirementLabel} note={note} excluded={excluded} />
    {task.rows.length === 0 && <p>Ingen plasserte bilder ennå.</p>}
    {task.rows.length > 0 && <CompletionCounts counts={completionCounts(task, selected, canAdoptAny)} />}
    <CompletionNotes items={recommendations} />
    {sources.length > 0 && <div className="photo-completion-actions" data-completion-actions="direction">
      <div className="photo-completion-action-buttons">
        {sources.map(({ kind, label, rows }) => <button key={kind} type="button" className={completionButton} data-adopt={kind} disabled={!rows.length} onClick={() => adopt(kind, label, rows)}>
          Bruk {label} for {counted(scope, rows.length)}
        </button>)}
      </div>
      {sources.some(({ shared }) => shared > 0) && <p className="photo-completion-requirement-note" data-shared-original>Samme retning brukes på hver plassering av et delt originalbilde. Det dokumenterer ikke separate kameraobservasjoner.</p>}
      <p className="photo-completion-requirement-note">Godtatte verdier beholdes. GML-retning 0° er ikke med her.</p>
    </div>}
    {task.rows.some(canAcceptGmlZero) && <div className="photo-completion-zero" data-completion-zero role="group" aria-label="GML-retning 0°">
      <p>0° kan bety at retningen mangler i kildesystemet. Godta bare hvis bildene er tatt mot nord.</p>
      {/* The block above can go between two clicks and move this button under the cursor, so a double-click never counts here. */}
      <button type="button" className={completionButton} disabled={!zeroRows.length} onClick={(event) => { if (event.detail < 2) adopt('gml', 'GML-retning 0°', zeroRows, { includeZero: true }); }}>
        Godta GML-retning 0° for {counted(scope, zeroRows.length)}
      </button>
    </div>}
    {task.rows.some(canSetOnMap) && <div className="photo-completion-actions" data-completion-actions="map">
      <button type="button" className={completionButton} disabled={!mapRows.length} onClick={(event) => openMap(event, 'missing', mapRows)}>Angi på kartet</button>
      <p className="photo-completion-requirement-note">Gjelder {counted(scope, mapRows.length)}. Du kommer tilbake hit etterpå, og retningene er ikke godtatt før du lagrer dem.</p>
    </div>}
    {reviewRows.length > 0 && <div className="photo-completion-actions" data-completion-actions="review">
      <button type="button" className={completionButton} onClick={(event) => openMap(event, 'review', reviewRows)}>Kontroller 0° på kartet</button>
      <p className="photo-completion-requirement-note">{placementCount(reviewRows.length)} har godtatt GML-retning 0°. Rett retningen på kartet hvis bildet ikke er tatt mot nord.</p>
    </div>}
    {heldBack > 0 && <p className="photo-completion-requirement-note" data-held-back>{placementCount(heldBack)} venter på bildedata og er ikke med i handlingene ennå.</p>}
    {task.rows.length > task.done.length && <SameDirectionForm rows={manualFillRows(task.rows, selected)} layerId={layerId} onStatus={onStatus} />}
    <CompletionSelection count={selected.length} scope={scope.length} onClear={() => onSelection([])} />
    <CompletionGroups groups={task.groups} selected={selected} onSelection={onSelection} />
    <CompletionDone rows={task.done} rowAction={correctAction} />
  </section>;
}
