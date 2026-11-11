'use client';

import { useEffect, useRef } from 'react';
import { ArrowArcLeftIcon, CheckCircleIcon, HandPointingIcon, TableIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { describeGmiObject, formatGmiChangeTime, gmiChangeSetCellViews, gmiSkipReasonLabel, summarizeGmiChangeSet } from '@/lib/gmiEditView.mjs';
import { gmiBatchSkipSummary } from '@/lib/gmiBatchInspectorView.mjs';
import { Lexeme } from './GmiObjectEditor';

const ORIGIN = Object.freeze({ 'object-editor': 'Objektretting', batch: 'Samleretting' });
const control = 'gmi-compact-button gmi-focus-ring inline-flex items-center gap-1 border border-gmi-border-strong px-2 py-1';

/**
 * Readable details of one staged ChangeSet in the right inspector: what was
 * changed, object by object, read only from the M2 ChangeSet. Used directly
 * after staging and when a history entry is opened from Endringer.
 */
export default function GmiChangeSetDetail({ layerId, changeSet, number, effective, downloadState, editable, isLast, variant = 'history',
  onSelectObject, onShowProposed, onUndo, onDiscard, onClose }) {
  'use no memo';
  const summary = summarizeGmiChangeSet(changeSet);
  const cells = gmiChangeSetCellViews(changeSet, effective);
  const multipleFields = summary.fields.length > 1;
  const focusKey = `change-set:${changeSet.id}`;
  const fieldsKey = summary.fields.join('\u0000');
  // Bring the corrected fields forward in the Data Table while this is open.
  useEffect(() => {
    useStore.setState({ gmiEditColumnFocus: { layerId, key: focusKey, fields: fieldsKey.split('\u0000') } });
    return () => { if (useStore.getState().gmiEditColumnFocus?.key === focusKey) useStore.setState({ gmiEditColumnFocus: null }); };
  }, [layerId, focusKey, fieldsKey]);
  // S5: right after staging, the button that staged is gone; keyboard focus lands on the visible result.
  const successRef = useRef(null);
  useEffect(() => { if (variant === 'staged') successRef.current?.focus(); }, [variant]);
  const manual = changeSet.eligibility?.manualOverrides || [];
  return <section className="gmi-change-detail" data-gmi-change-detail={changeSet.id} data-variant={variant} aria-label={`Retting ${number}: ${summary.title}`}>
    {variant === 'staged' && <p ref={successRef} tabIndex={-1} className="gmi-change-detail-success gmi-focus-ring" role="status" data-gmi-staged-success><CheckCircleIcon size={16} weight="regular" aria-hidden="true" /> Lagt til i arbeidskopien – originalfilen er uendret</p>}
    <div className="gmi-change-detail-head">
      <div className="min-w-0">
        <p className="gmi-edit-kicker">Retting {number} · {ORIGIN[changeSet.origin] || 'Retting'}</p>
        <h3 className="gmi-change-detail-title">{summary.title}</h3>
        <p className="gmi-change-detail-meta">
          <span>{summary.objectsLabel}</span>
          {formatGmiChangeTime(changeSet.createdAt) && <span>{formatGmiChangeTime(changeSet.createdAt)}</span>}
          <span className="gmi-change-detail-state" data-download-state={downloadState}
            title="Originalfilen er uendret. Endringen leveres først når du laster ned revidert GMI.">{downloadState === 'downloaded' ? 'Med i siste nedlasting' : 'I arbeidskopien · ikke lastet ned'}</span>
        </p>
      </div>
      {onClose && <button type="button" className="gmi-compact-button gmi-focus-ring flex h-6 w-6 shrink-0 items-center justify-center text-gmi-text-muted" aria-label="Lukk detaljer" title="Lukk detaljer" onClick={onClose}>
        <XIcon size={14} weight="regular" aria-hidden="true" />
      </button>}
    </div>
    {manual.length > 0 && <div className="gmi-manual-note">
      <HandPointingIcon size={14} weight="regular" aria-hidden="true" />
      <div><p><strong>{manual.length} manuelt inkludert</strong> utenfor Validatorens anbefaling</p>
        <ul>{manual.map((entry) => <li key={entry.key}>{describeGmiObject(entry.scope, entry.sourceIndex, entry.objectId)}: {gmiBatchSkipSummary(entry, entry.field || summary.fields[0])}</li>)}</ul></div>
    </div>}
    <div className="gmi-change-detail-scroll">
      <table className="gmi-change-detail-table" data-gmi-change-detail-cells>
        <thead><tr><th scope="col">Objekt</th>{multipleFields && <th scope="col">Felt</th>}<th scope="col">Original</th><th scope="col">Foreslått</th></tr></thead>
        <tbody>{cells.map((cell) => <tr key={cell.key} data-superseded={cell.superseded || undefined}>
          <th scope="row"><button type="button" className="gmi-edit-link gmi-focus-ring" onClick={() => onSelectObject({ scope: cell.scope, sourceIndex: cell.sourceIndex }, changeSet.id)}>{cell.object}</button></th>
          {multipleFields && <td>{cell.field}</td>}
          <td><Lexeme value={cell.original} /></td>
          <td className="gmi-change-detail-next"><Lexeme value={cell.next} />
            {cell.previous !== cell.original && <span className="gmi-edit-muted"> (var <Lexeme value={cell.previous} />)</span>}
            {cell.overwritesPopulated && <span className="gmi-edit-badge gmi-edit-badge-warning">Overskrev verdi</span>}
            {cell.superseded && <span className="gmi-edit-badge">Erstattet senere</span>}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {changeSet.skipped.length > 0 && <details className="gmi-change-detail-skipped"><summary>{changeSet.skipped.length} hoppet over</summary>
      <ul>{changeSet.skipped.map((cell) => <li key={cell.key}>{describeGmiObject(cell.scope, cell.sourceIndex, cell.objectId ?? null)} · {cell.field} · {gmiSkipReasonLabel(cell.reason)}</li>)}</ul>
    </details>}
    <div className="gmi-change-detail-actions">
      <button type="button" className={`${control} text-gmi-interactive`} onClick={() => onShowProposed(changeSet)}><TableIcon size={14} weight="regular" aria-hidden="true" /> Vis i Foreslått</button>
      {editable && isLast && <button type="button" className={control} onClick={onUndo}><ArrowArcLeftIcon size={14} weight="regular" aria-hidden="true" /> Angre</button>}
      {editable && <button type="button" className="gmi-edit-icon-text gmi-focus-ring" onClick={() => onDiscard(changeSet.id)}><TrashIcon size={14} weight="regular" aria-hidden="true" /> Forkast</button>}
    </div>
  </section>;
}
