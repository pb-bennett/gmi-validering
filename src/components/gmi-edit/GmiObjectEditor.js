'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowCounterClockwiseIcon, CheckCircleIcon, CrosshairSimpleIcon, LockSimpleIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react';
import fieldsData from '@/data/fields.json';
import { createGmiObjectCorrection, listGmiObjectCells } from '@/lib/gmi-edit/index.mjs';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import {
  describeGmiObject, gmiEditFieldPolicy, gmiEditMessage, gmiLexemeSegments, gmiObjectContext,
  gmiObjectCorrectionLabel, gmiSkipReasonLabel, planGmiObjectForm,
} from '@/lib/gmiEditView.mjs';
import PhotoIconButton from '@/components/photos/PhotoIconButton';
import useGmiObjectValidation from './useGmiObjectValidation';

function FindingIcon({ finding }) {
  return <PhotoIconButton icon={finding.transition === 'resolved' ? CheckCircleIcon : WarningCircleIcon} size={14}
    label={finding.tooltip} tooltip={finding.tooltip} className="gmi-edit-finding"
    data-gmi-finding={finding.ruleId} data-severity={finding.state} data-transition={finding.transition} />;
}

const fieldLabel = (field) => fieldsData.find((entry) => entry.fieldKey === field)?.label || null;
const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-3 py-1.5 text-xs font-medium';
const primary = 'gmi-primary-control gmi-focus-ring px-3 py-1.5 text-xs font-medium';

/** A lexeme exactly as delivered: leading/trailing whitespace shown as ·, empty shown as a dash. */
export function Lexeme({ value, empty = 'tom' }) {
  const segments = gmiLexemeSegments(value);
  if (!segments.length) return <span className="gmi-edit-lexeme gmi-edit-lexeme-empty">{empty}</span>;
  return <span className="gmi-edit-lexeme" title={JSON.stringify(String(value))}>
    {segments.map((segment, index) => segment.whitespace
      ? <span key={index} className="gmi-edit-whitespace" aria-label={`${segment.text.length} mellomrom`}>{'·'.repeat(segment.text.length)}</span>
      : <span key={index}>{segment.text}</span>)}
  </span>;
}

function rowsFor(view, scope, sourceIndex) {
  const cells = view?.document ? listGmiObjectCells(view.document, scope, sourceIndex) : null;
  if (!cells) return null;
  return cells.filter((cell) => cell.field !== '' || cell.lexeme).map((cell) => {
    const policy = gmiEditFieldPolicy(cell);
    const current = policy.editable ? gmiEditSessions.cell(view.handle, { scope, sourceIndex, field: cell.field }) : null;
    const original = current?.ok ? current.original : (cell.parserLexeme ?? cell.lexeme);
    return {
      field: cell.field,
      label: fieldLabel(cell.field),
      position: cell.position,
      editable: policy.editable && Boolean(current?.ok),
      reason: policy.editable && !current?.ok ? current?.code : policy.reason,
      original,
      proposed: current?.ok ? current.proposed : original,
      changed: Boolean(current?.ok && current.changed),
      touched: Boolean(current?.ok && current.touched),
      history: current?.ok ? current.history : [],
    };
  });
}

/**
 * Object inspector and editor of the Rettinger workspace.
 *
 * Two separate states are always kept apart:
 * - the local form (`drafts`): typed values that are not part of the editing
 *   session yet ("Ikke lagt til");
 * - the staged ChangeSets in the registry, shown as "Foreslått".
 * A correction is built with M2 `createGmiObjectCorrection` against the
 * current session value, reviewed, then staged through the registry. The
 * imported layer data is never written.
 */
export default function GmiObjectEditor({ view, status, object, scope, sourceIndex, onDirtyChange, onStaged, onLocate, onShowChangeSet }) {
  // Opted out of the React Compiler: it turns optional chains on nullable session views (`view?.x`)
  // into non-optional memo dependencies and crashes before a session exists. Derived values are
  // memoized explicitly per published editing revision instead.
  'use no memo';
  const editable = status?.state === 'editable' && Boolean(view);
  const rows = useMemo(() => rowsFor(view, scope, sourceIndex), [view, scope, sourceIndex]);
  const [drafts, setDrafts] = useState({});
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [allowReplace, setAllowReplace] = useState(false);
  const [review, setReview] = useState(null);   // { changeSet } built against one session value
  const [message, setMessage] = useState(null);
  const validation = useGmiObjectValidation(view, scope, sourceIndex, rows, drafts);
  const unboundFindings = validation.findings.filter((finding) => !finding.fields.some((field) => rows?.some((row) => row.field === field)));

  const editableRows = useMemo(() => (rows ? rows.filter((row) => row.editable) : []), [rows]);
  // No optional chains inside memo bodies (React Compiler dependency inference).
  const encodingClass = view && view.document ? view.document.encoding.encodingClass : null;
  const plan = useMemo(() => planGmiObjectForm(editableRows, drafts, encodingClass), [editableRows, drafts, encodingClass]);
  const dirty = plan.edited.length > 0;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Unsubmitted form values also block closing the tab (the M3 guard covers staged edits only).
  useEffect(() => {
    if (!dirty) return undefined;
    const listener = (event) => { event.preventDefault(); event.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);

  // A review is bound to the session value it was built on; any staged, undone or discarded change voids it.
  const reviewStale = review && review.stateKey !== view?.session?.stateKey;

  if (!object) return <div className="gmi-edit-inspector-empty"><p>Velg et objekt i listen eller i datatabellen for å se og rette verdiene.</p></div>;

  const title = describeGmiObject(scope, sourceIndex, object.id ?? null);
  const context = gmiObjectContext(object.attributes);
  const blockedOverwrite = plan.needsOverwrite.length > 0 && !allowOverwrite;
  const blockedReplace = plan.needsReplace.length > 0 && !allowReplace;

  const setDraft = (field, value) => { setMessage(null); setDrafts((current) => ({ ...current, [field]: value })); };
  const clearDraft = (field) => setDrafts((current) => { const next = { ...current }; delete next[field]; return next; });
  const resetForm = () => { setDrafts({}); setAllowOverwrite(false); setAllowReplace(false); setReview(null); setMessage(null); };

  const buildReview = () => {
    if (!plan.valid || blockedOverwrite || blockedReplace) return;
    const { session } = gmiEditSessions.getSession(view.handle);
    if (!session) { setMessage({ tone: 'error', text: gmiEditMessage('session-disposed') }); return; }
    const fields = Object.keys(plan.values);
    const result = createGmiObjectCorrection(session, {
      scope, sourceIndex, objectId: object.id ?? null, guid: object.guid ?? null,
      values: plan.values,
      mode: plan.needsOverwrite.length && allowOverwrite ? 'overwrite' : 'fill-missing',
      conflictPolicy: plan.needsReplace.length && allowReplace ? 'replace' : 'skip',
      label: gmiObjectCorrectionLabel(fields, scope, sourceIndex, object.id ?? null),
      createdAt: new Date().toISOString(),
    });
    if (!result.ok) {
      setMessage({ tone: 'error', text: [...new Set(result.rejections.map((rejection) => gmiEditMessage(rejection.code)))].join(' ') });
      return;
    }
    setReview({ changeSet: result.changeSet, stateKey: session.stateKey });
  };

  const stage = () => {
    const result = gmiEditSessions.stage(view.handle, review.changeSet);
    if (!result.ok) {
      setReview(null);
      setMessage({ tone: 'error', text: gmiEditMessage(result.code) });
      return;
    }
    const applied = review.changeSet.counts.applied;
    resetForm();
    if (result.staged) {
      setMessage({ tone: 'ok', text: `Rettingen er lagt til (${applied} felt). Den er ikke lastet ned ennå.` });
      onStaged?.(review.changeSet);
    } else setMessage({ tone: 'info', text: 'Ingen verdier ble endret, så ingen retting ble lagt til.' });
  };

  return <div className="gmi-edit-editor" data-gmi-object={`${scope}:${sourceIndex}`}>
    <header className="gmi-edit-editor-header">
      <div className="min-w-0">
        <h2>{title}</h2>
        <p className="gmi-edit-muted">{[context, object.guid ? `GUID ${object.guid}` : 'Uten GUID'].filter(Boolean).join(' · ')}</p>
      </div>
      <PhotoIconButton icon={CrosshairSimpleIcon} label={`Vis ${title} i kartet`} tooltip="Vis i kartet" onClick={onLocate} />
    </header>

    {!rows && <p className="gmi-edit-note" role="note">Originalfilen er ikke åpnet for retting. Verdiene under er tolket fra laget og kan avvike fra filens eksakte tekst.</p>}
    {rows && !editable && <p className="gmi-edit-note" role="note"><LockSimpleIcon size={14} aria-hidden="true" /> Verdiene vises nøyaktig slik de står i filen, men kan ikke rettes.</p>}

    {review && !reviewStale ? <section className="gmi-edit-review" aria-label="Se gjennom retting">
      <h3>Se gjennom før du legger til</h3>
      <p className="gmi-edit-muted">Endringen legges i listen over rettinger. Den importerte filen og laget endres ikke.</p>
      {review.changeSet.cells.length ? <table className="gmi-edit-review-table">
        <thead><tr><th scope="col">Felt</th><th scope="col">Nå</th><th scope="col">Ny verdi</th></tr></thead>
        <tbody>{review.changeSet.cells.map((cell) => <tr key={cell.key}>
          <th scope="row">{cell.field}</th>
          <td><Lexeme value={cell.previous} /></td>
          <td><Lexeme value={cell.next} />
            {cell.overwritesPopulated && <span className="gmi-edit-badge gmi-edit-badge-warning">Overskriver verdi</span>}
            {cell.overwrote && <span className="gmi-edit-badge">Erstatter {cell.overwrote.changeSetId}</span>}</td>
        </tr>)}</tbody>
      </table> : <p className="gmi-edit-note">Ingen verdier ville blitt endret.</p>}
      {review.changeSet.skipped.length > 0 && <div className="gmi-edit-skipped" role="note">
        <WarningIcon size={14} aria-hidden="true" /> Hoppes over: {review.changeSet.skipped.map((cell) => `${cell.field} (${gmiSkipReasonLabel(cell.reason).toLowerCase()})`).join(', ')}
      </div>}
      <div className="gmi-edit-actions">
        <button type="button" className={control} onClick={() => setReview(null)}>Tilbake</button>
        <button type="button" className={primary} disabled={!review.changeSet.cells.length} onClick={stage}>Legg til retting</button>
      </div>
    </section> : <form className="gmi-edit-form" onSubmit={(event) => { event.preventDefault(); buildReview(); }} aria-label={`Felt for ${title}`}>
      {reviewStale && <p className="gmi-edit-message" data-tone="warning" role="status">{gmiEditMessage('stale-change-set')}</p>}
      <table className="gmi-edit-fields">
        <thead><tr><th scope="col">Felt</th><th scope="col">Original</th><th scope="col">Foreslått / ny verdi</th></tr></thead>
        <tbody>
          {(rows || Object.entries(object.attributes || {}).filter(([field]) => field !== '').map(([field, value]) => ({ field, label: fieldLabel(field), editable: false, reason: null, original: value === null ? '' : String(value), proposed: null, parsed: true })))
            .map((row) => {
              const draft = Object.hasOwn(drafts, row.field) ? drafts[row.field] : undefined;
              const editing = draft !== undefined && draft !== row.proposed;
              const problem = plan.problems[row.field];
              const inputId = `gmi-edit-${scope}-${sourceIndex}-${row.position ?? row.field}`;
              return <tr key={row.field} data-field={row.field} data-state={editing ? 'draft' : row.changed ? 'proposed' : undefined}>
                <th scope="row">
                  <span className="gmi-edit-field-heading">
                    <label htmlFor={row.editable ? inputId : undefined} className="gmi-edit-field-name">{row.field}</label>
                    {validation.findings.filter((finding) => finding.fields.includes(row.field)).map((finding) =>
                      <FindingIcon key={`${finding.key}:${finding.transition}`} finding={finding} />)}
                  </span>
                  {row.label && row.label !== row.field && <span className="gmi-edit-muted">{row.label}</span>}
                </th>
                <td><Lexeme value={row.original} /></td>
                <td>
                  {row.editable && editable ? <div className="gmi-edit-input-cell">
                    <input id={inputId} type="text" spellCheck={false} autoComplete="off" value={draft ?? row.proposed}
                      aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${inputId}-problem` : undefined}
                      className={`gmi-edit-input${editing ? ' gmi-edit-input-draft' : ''}${row.changed && !editing ? ' gmi-edit-input-proposed' : ''}`}
                      onChange={(event) => setDraft(row.field, event.target.value)} />
                    {editing && <PhotoIconButton icon={ArrowCounterClockwiseIcon} size={14} label={`Angre skrivingen i ${row.field}`} tooltip="Angre skrivingen" onClick={() => clearDraft(row.field)} />}
                    {!editing && row.changed && <button type="button" className="gmi-edit-link" onClick={() => setDraft(row.field, row.original)}>Bruk original</button>}
                  </div> : <span className="gmi-edit-readonly" title={row.reason ? gmiEditMessage(row.reason) : undefined}>
                    {row.proposed !== null && row.proposed !== undefined && row.proposed !== row.original ? <Lexeme value={row.proposed} /> : null}
                    {row.reason && row.reason !== 'document-not-editable' && <span className="gmi-edit-reason"><LockSimpleIcon size={12} aria-hidden="true" /> {gmiEditMessage(row.reason)}</span>}
                  </span>}
                  {editing && <span className="gmi-edit-state-pill">Ikke lagt til</span>}
                  {!editing && row.changed && <span className="gmi-edit-state-pill gmi-edit-state-pill-proposed">Foreslått{row.history.length ? ` · ${row.history.at(-1).changeSetId}` : ''}</span>}
                  {!editing && row.changed && row.history.length > 0 && <button type="button" className="gmi-edit-link" onClick={() => onShowChangeSet?.(row.history.at(-1).changeSetId)}>Vis retting</button>}
                  {problem && <span id={`${inputId}-problem`} className="gmi-edit-problem" role="alert">{problem}</span>}
                </td>
              </tr>;
            })}
        </tbody>
      </table>
      {editable && <div className="gmi-edit-form-footer">
        {plan.needsOverwrite.length > 0 && <label className="gmi-edit-confirm">
          <input type="checkbox" checked={allowOverwrite} onChange={(event) => setAllowOverwrite(event.target.checked)} />
          <span>Overskriv utfylte verdier fra leveransen: <strong>{plan.needsOverwrite.join(', ')}</strong></span>
        </label>}
        {plan.needsReplace.length > 0 && <label className="gmi-edit-confirm">
          <input type="checkbox" checked={allowReplace} onChange={(event) => setAllowReplace(event.target.checked)} />
          <span>Erstatt tidligere rettinger i: <strong>{plan.needsReplace.join(', ')}</strong></span>
        </label>}
        {(blockedOverwrite || blockedReplace) && <p className="gmi-edit-muted">Bekreft overskrivingen over, eller angre skrivingen i feltet.</p>}
        <div className="gmi-edit-actions">
          <button type="button" className={control} disabled={!dirty} onClick={resetForm}>Forkast skjema</button>
          <button type="submit" className={primary} disabled={!plan.valid || blockedOverwrite || blockedReplace}>
            Se gjennom {plan.edited.length ? `(${plan.edited.length})` : ''}
          </button>
        </div>
      </div>}
    </form>}
    {view && <p className="gmi-edit-muted" data-gmi-object-validation aria-live="polite">
      {validation.pending ? 'Kontrollerer objektet…' : 'Objektkontroll: rødt = FEIL · oransje = SJEKK · + = nytt · grønn hake = løst.'}
      {' '}NYTT-år på tvers av objekter vurderes ikke lokalt.
    </p>}
    {unboundFindings.length > 0 && <details className="gmi-edit-unbound-findings">
      <summary>Funn i felt som mangler i skjemaet ({unboundFindings.length})</summary>
      <ul>{unboundFindings.map((finding) => <li key={`${finding.key}:${finding.transition}`}>
        <FindingIcon finding={finding} /> {finding.reason}
      </li>)}</ul>
    </details>}
    {message && <p className="gmi-edit-message" data-tone={message.tone} role="status">{message.text}</p>}
    <p className="gmi-edit-hint">Geometri, koordinater, objektnummer, GUID og filhode kan ikke rettes. Nye kolonner kan ikke legges til.</p>
  </div>;
}
