'use client';

import { CaretRightIcon, TrashIcon } from '@phosphor-icons/react';
import { formatGmiChangeTime, gmiChangeSetCellViews, gmiSkipReasonLabel, describeGmiObject, summarizeGmiChangeSet } from '@/lib/gmiEditView.mjs';
import { Lexeme } from './GmiObjectEditor';

const ORIGIN = Object.freeze({ 'object-editor': 'Objektretting', batch: 'Samleretting' });

const OBJECT_PREVIEW = 6;

const undoneCount = (count) => `${count} angret ${count === 1 ? 'retting' : 'rettinger'} kan gjøres om`;

/** The next redo as a visible action while editing is possible; otherwise only the count. */
function RedoHint({ redoCount, redoLabel, onRedo, className }) {
  if (!redoCount) return null;
  if (!onRedo || !redoLabel) return <p className={className}>{undoneCount(redoCount)}.</p>;
  return <p className={className}>
    <button type="button" className="gmi-edit-link gmi-focus-ring" data-gmi-context-redo="changes" onClick={onRedo}>Gjør om: {redoLabel}</button>
    {redoCount > 1 && <> · {undoneCount(redoCount)}</>}
  </p>;
}

/**
 * Staged ChangeSets in order, newest last (the M2 history; nothing is kept
 * here). A compact history/navigation surface: single-object corrections keep
 * their small field table; multi-object corrections show a summary, and their
 * object-by-object values open in the right inspector («Vis detaljer»).
 */
export default function GmiChangeList({ changeSets, redoCount, redoLabel, onRedo, effective, activeChangeSetId, detailChangeSetId, editable, onSelectObject, onDiscard, onShowDetail }) {
  // Opted out of the React Compiler: it turns optional chains on nullable session views (`view?.x`)
  // into non-optional memo dependencies and crashes before a session exists. Derived values are
  // memoized explicitly per published editing revision instead.
  'use no memo';
  if (!changeSets.length) {
    return <div className="gmi-edit-empty">
      <p>Ingen rettinger er lagt til.</p>
      <p className="gmi-edit-muted">Velg et objekt, endre verdier og velg «Se gjennom» for å legge til en retting.</p>
      <RedoHint redoCount={redoCount} redoLabel={redoLabel} onRedo={onRedo} className="gmi-edit-muted" />
    </div>;
  }
  return <>
    <ol className="gmi-edit-change-list" aria-label="Rettinger">
      {changeSets.map((changeSet, index) => {
        const cells = gmiChangeSetCellViews(changeSet, effective);
        const objects = [...new Map(cells.map((cell) => [`${cell.scope}:${cell.sourceIndex}`, cell])).values()];
        const summary = summarizeGmiChangeSet(changeSet);
        const compact = objects.length > 1;
        return <li key={changeSet.id} data-change-set={changeSet.id} data-detail-open={detailChangeSetId === changeSet.id || undefined}
          className={activeChangeSetId === changeSet.id || detailChangeSetId === changeSet.id ? 'gmi-edit-change-active' : undefined}>
          <div className="gmi-edit-change-head">
            <span className="gmi-edit-change-number" aria-hidden="true">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="gmi-edit-change-label">{changeSet.label || changeSet.id}</p>
              <p className="gmi-edit-muted">{[ORIGIN[changeSet.origin] || 'Retting', formatGmiChangeTime(changeSet.createdAt), changeSet.id].filter(Boolean).join(' · ')}</p>
            </div>
            {editable && <button type="button" className="gmi-edit-icon-text gmi-focus-ring" aria-label={`Forkast ${changeSet.label || changeSet.id}`} onClick={() => onDiscard(changeSet.id)}>
              <TrashIcon size={14} aria-hidden="true" /> Forkast
            </button>}
          </div>
          {compact && <p className="gmi-edit-change-summary">{summary.uniform
            ? <><span>{summary.fields[0]}</span> → <Lexeme value={summary.value} /></>
            : <>{summary.fields.join(', ')} · {summary.objectsLabel}</>}</p>}
          <div className="gmi-edit-change-objects">
            {(compact ? objects.slice(0, OBJECT_PREVIEW) : objects).map((cell) => <button key={`${cell.scope}:${cell.sourceIndex}`} type="button" className="gmi-edit-link"
              onClick={() => onSelectObject({ scope: cell.scope, sourceIndex: cell.sourceIndex }, changeSet.id)}>{cell.object}</button>)}
            {compact && objects.length > OBJECT_PREVIEW && <span className="gmi-edit-muted">+{objects.length - OBJECT_PREVIEW} til</span>}
          </div>
          {changeSet.eligibility?.manualOverrides?.length > 0 && <details className="gmi-edit-manual-history">
            <summary>Manuelt overstyrt anvendelighet ({changeSet.eligibility.manualOverrides.length})</summary>
            <ul>{changeSet.eligibility.manualOverrides.map((entry) => <li key={entry.key}>
              {describeGmiObject(entry.scope, entry.sourceIndex, entry.objectId)} · {gmiSkipReasonLabel(entry.reason)}
              {entry.evidence?.diagnosticFacts?.context?.length > 0 && ` · ${entry.evidence.diagnosticFacts.context.map((fact) => `${fact.fieldId === 'tema' ? 'Tema' : fact.fieldId === 'material' ? 'Material' : fact.fieldId}: ${fact.value}`).join(' · ')}`}
              {!changeSet.cells.some((cell) => cell.key === entry.key) && ' · Ingen verdi endret'}
            </li>)}</ul>
          </details>}
          {!compact && <table className="gmi-edit-change-cells">
            <thead><tr><th scope="col">Felt</th><th scope="col">Original</th><th scope="col">Foreslått</th></tr></thead>
            <tbody>{cells.map((cell) => <tr key={cell.key} data-superseded={cell.superseded || undefined}>
              <th scope="row">{cell.field}</th>
              <td><Lexeme value={cell.original} /></td>
              <td><Lexeme value={cell.next} />
                {cell.previous !== cell.original && <span className="gmi-edit-muted"> (var <Lexeme value={cell.previous} />)</span>}
                {cell.overwritesPopulated && <span className="gmi-edit-badge gmi-edit-badge-warning">Overskrev verdi</span>}
                {cell.superseded && <span className="gmi-edit-badge">Erstattet senere</span>}</td>
            </tr>)}</tbody>
          </table>}
          {onShowDetail && <button type="button" className="gmi-edit-change-detail-link gmi-focus-ring" aria-pressed={detailChangeSetId === changeSet.id}
            onClick={() => onShowDetail(changeSet.id)}>{compact ? `Vis detaljer for ${summary.objectsLabel}` : 'Vis detaljer'} <CaretRightIcon size={12} weight="regular" aria-hidden="true" /></button>}
          {compact && changeSet.skipped.length > 0 && <p className="gmi-edit-skipped">{changeSet.skipped.length} hoppet over – se detaljer.</p>}
          {!compact && changeSet.skipped.length > 0 && <p className="gmi-edit-skipped">
            Hoppet over: {changeSet.skipped.map((cell) => `${cell.field} på ${describeGmiObject(cell.scope, cell.sourceIndex, cell.objectId ?? null)} (${gmiSkipReasonLabel(cell.reason).toLowerCase()})`).join('; ')}
          </p>}
          {changeSet.conflicts.some((conflict) => conflict.resolution === 'replaced') && <p className="gmi-edit-muted">
            Erstattet tidligere forslag fra {[...new Set(changeSet.conflicts.flatMap((conflict) => conflict.with))].join(', ')}.
          </p>}
        </li>;
      })}
    </ol>
    <RedoHint redoCount={redoCount} redoLabel={redoLabel} onRedo={onRedo} className="gmi-edit-muted gmi-edit-pad" />
  </>;
}
