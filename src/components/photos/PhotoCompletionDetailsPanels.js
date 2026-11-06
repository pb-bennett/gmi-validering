'use client';

import { useId, useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { ASBUILT_CODES, EXPORT_CONTEXT_FIELDS } from '@/lib/photos/export/exportContract.mjs';
import { canAdoptPhotographer, completionCounts, manualFillRows, photoCount, photographerSuggestions, placementCount, scopedRows, selectedPhotoCount } from '@/lib/photos/photoCompletion.mjs';
import { CompletionCounts, CompletionDone, CompletionGroups, CompletionHeading, CompletionSelection, completionButton, completionRowButton } from './PhotoCompletionRows';

function SamePhotographerForm({ rows, suggestions, layerId, onStatus }) {
  const id = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const submit = (event) => {
    event.preventDefault();
    const result = photoSession.fillMissingPhotoValues(layerId, 'photographer', value, rows.map((row) => row.photoId));
    if (!result.ok) { setError('Oppgi et navn uten ugyldige tegn.'); return; }
    setError(null); setValue('');
    onStatus(`Manuell fotograf er godtatt for ${photoCount(result.counts.adopted)}.`);
  };
  return <details className="photo-completion-manual" data-manual-fill="photographer">
    <summary>Samme fotograf for valgte bilder</summary>
    <form onSubmit={submit}>
      <label>Navn<input className="gmi-focus-ring" list={`${id}-names`} value={value} autoComplete="off" onChange={(event) => setValue(event.target.value)} /></label>
      <datalist id={`${id}-names`}>{suggestions.map((name) => <option key={name} value={name} />)}</datalist>
      {error && <p role="alert" className="photo-capture-time-error">{error}</p>}
      {!rows.length && <p>Velg bilder i listen først.</p>}
      <button type="submit" className={completionButton} disabled={!rows.length || !value.trim()}>Bruk på {selectedPhotoCount(rows.length)}</button>
    </form>
  </details>;
}

export function PhotoCompletionPhotographerPanel({ task, title, requirementLabel, note, excluded, layerId, selected, scope, onSelection, onEdit, onStatus }) {
  const rows = scopedRows(task.rows, scope, canAdoptPhotographer);
  const available = task.rows.some(canAdoptPhotographer);
  const adopt = () => {
    const result = photoSession.adoptSourceEvidence(layerId, 'photographer', 'exif', rows.map((row) => row.photoId));
    onStatus(result.ok ? `EXIF-fotograf er godtatt for ${photoCount(result.counts.adopted)}.` : 'Kildeverdien kunne ikke brukes.');
  };
  const rowAction = (row) => <button type="button" className={completionRowButton} onClick={() => onEdit(row.photoId)}>{row.state === 'conflict' ? 'Velg verdi…' : 'Rediger…'}</button>;

  return <section aria-label="Fotograf" data-completion-panel="photographer">
    <CompletionHeading title={title} requirementLabel={requirementLabel} note={note} excluded={excluded} />
    {task.rows.length === 0 && <p>Ingen plasserte bilder ennå.</p>}
    {task.rows.length > 0 && <CompletionCounts counts={completionCounts(task, selected, canAdoptPhotographer)} />}
    {available && <div className="photo-completion-actions" data-completion-actions="photographer">
      <button type="button" className={completionButton} data-adopt="exif" disabled={!rows.length} onClick={adopt}>
        Bruk EXIF-fotograf for {scope.length ? selectedPhotoCount(rows.length) : photoCount(rows.length)}
      </button>
    </div>}
    {task.rows.length > task.done.length && <SamePhotographerForm rows={manualFillRows(task.rows, selected)} suggestions={photographerSuggestions(task)} layerId={layerId} onStatus={onStatus} />}
    <CompletionSelection count={selected.length} scope={scope.length} onClear={() => onSelection([])} />
    <CompletionGroups groups={task.groups} selected={selected} onSelection={onSelection} rowAction={rowAction} />
    <CompletionDone rows={task.done} rowAction={rowAction} />
  </section>;
}

// Placement itself happens in the existing tools. Automatic handoff and return belong to a later step.
export function PhotoCompletionPlacementPanel({ task, title, requirementLabel, onOpenSources }) {
  return <section aria-label="Plassering" data-completion-panel="placement">
    <CompletionHeading title={title} requirementLabel={requirementLabel} note={task.unplaced ? `${placementCount(task.unplaced)} mangler posisjon og blir ikke med i leveransen.` : 'Alle plasseringer har posisjon.'} />
    {task.unplaced > 0 && <>
      <div className="photo-completion-actions" data-completion-actions="placement">
        <button type="button" className={completionButton} onClick={onOpenSources}>Koble og posisjoner bilder…</button>
        <p className="photo-completion-requirement-note">Dette lukker Fullfør opplysninger. Enkeltbilder kan også plasseres med «Juster plassering og retning» i Verktøy.</p>
      </div>
      <ul className="photo-completion-rows">{task.rows.map((row) => <li key={row.key} data-completion-row={row.key} data-state="unplaced">
        <div className="photo-completion-row-body"><p className="photo-completion-filename">{row.filename}{row.occurrence && <small> · {row.occurrence}</small>}</p></div>
      </li>)}</ul>
    </>}
  </section>;
}

// Delivery-level values, kept in the layer's export choices and never on photos. Nothing here is prefilled from photos.
export function PhotoCompletionContextPanel({ title, requirementLabel, context, missing, onChange }) {
  const issues = new Map(missing.map((item) => [item.field, item.message]));
  const set = (key, value) => onChange({ ...context, [key]: value });
  return <section aria-label="Leveranseopplysninger" data-completion-panel="context">
    <CompletionHeading title={title} requirementLabel={requirementLabel} note="Gjelder hele leveransen. Oppgi sannferdige verdier. Dette fylles ikke fra bildene eller GMI." />
    <div className="photo-completion-context">
      {EXPORT_CONTEXT_FIELDS.map(({ key, label, type }) => <label key={key} data-context-field={key} data-missing={issues.has(key) || undefined}>{label}
        {type === 'code'
          ? <select className="gmi-focus-ring" value={context[key] || ''} onChange={(event) => set(key, event.target.value)}>
            <option value="">Velg kode</option>{ASBUILT_CODES[key].map((item) => <option key={item.value} value={item.value}>{item.value} · {item.label}</option>)}
          </select>
          : <input className="gmi-focus-ring" type={type} value={context[key] || ''} onChange={(event) => set(key, event.target.value)} />}
        {issues.has(key) && <small>{issues.get(key)}</small>}
      </label>)}
    </div>
  </section>;
}
