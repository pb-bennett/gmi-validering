'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowCounterClockwiseIcon, CrosshairSimpleIcon, LockSimpleIcon, WarningIcon } from '@phosphor-icons/react';
import fieldsData from '@/data/fields.json';
import { createGmiObjectCorrection, listGmiObjectCells } from '@/lib/gmi-edit/index.mjs';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import {
  describeGmiObject, gmiEditFieldPolicy, gmiEditMessage, gmiLexemeSegments, gmiObjectContext,
  gmiLinkedTemaGroup, gmiObjectCorrectionLabel, gmiSkipReasonLabel, planGmiObjectForm,
} from '@/lib/gmiEditView.mjs';
import PhotoIconButton from '@/components/photos/PhotoIconButton';
import useGmiObjectValidation from './useGmiObjectValidation';
import GmiSeverityIcon, { GMI_SEVERITY_ICONS, gmiFindingTone } from './GmiSeverityIcon';
import GmiFieldValueInput from './GmiFieldValueInput';
import { describeGmiEditColumns, gmiLinkedTemaChangeSetComplete, gmiLinkedTemaPair } from '@/lib/gmiEditFields.mjs';
import { gmiEditObjectReviewConsequences } from '@/lib/gmiEditValidation.mjs';

const PHOTO_TEMA_WARNING = 'FOTO bruker Tema fra originalfilen. Endringen påvirker ikke automatisk bildegrupperingen.';

function FindingIcon({ finding }) {
  const tone = gmiFindingTone(finding);
  return <PhotoIconButton icon={GMI_SEVERITY_ICONS[tone]} size={18}
    label={finding.tooltip} tooltip={finding.tooltip} className="gmi-edit-finding"
    tooltipTone={tone} data-validation-tone={tone}
    data-gmi-finding={finding.ruleId} data-severity={finding.state} data-transition={finding.transition} />;
}

/** One severity in the object-check legend: the same symbol as the field icons, plus its name. */
const LegendItem = ({ tone, children }) => <span className="gmi-edit-legend-item" data-validation-tone={tone}><GmiSeverityIcon tone={tone} size={12} />{children}</span>;

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
  const columns = describeGmiEditColumns(view, scope).columns;
  return cells.filter((cell) => cell.field !== '' || cell.lexeme).map((cell) => {
    const policy = gmiEditFieldPolicy(cell);
    const current = policy.editable ? gmiEditSessions.cell(view.handle, { scope, sourceIndex, field: cell.field }) : null;
    const original = current?.ok ? current.original : (cell.parserLexeme ?? cell.lexeme);
    return {
      field: cell.field,
      label: fieldLabel(cell.field),
      position: cell.position,
      domain: columns.find((column) => column.position === cell.position && column.sourceKey === cell.field)?.domain || null,
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
export default function GmiObjectEditor({ view, status, object, scope, sourceIndex, onDirtyChange, onStaged, onLocate, onShowChangeSet, validatorCheck = null }) {
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
  // S5: staging unmounts «Legg til retting»; keyboard focus moves to the result instead of falling to body.
  const messageRef = useRef(null), focusMessage = useRef(false);
  useEffect(() => {
    if (!focusMessage.current || !message) return;
    focusMessage.current = false; messageRef.current?.focus();
  }, [message]);
  const validation = useGmiObjectValidation(view, scope, sourceIndex, rows, drafts);
  const unboundFindings = validation.findings.filter((finding) => !finding.fields.some((field) => rows?.some((row) => row.field === field)));

  const editableRows = useMemo(() => (rows ? rows.filter((row) => row.editable) : []), [rows]);
  // No optional chains inside memo bodies (React Compiler dependency inference).
  const encodingClass = view && view.document ? view.document.encoding.encodingClass : null;
  // G8: an accepted Tema/S_FCODE pair is one logical field; neither physical column is editable alone.
  const linked = useMemo(() => (rows && view && view.document ? gmiLinkedTemaGroup(rows, gmiLinkedTemaPair(view, scope)) : null), [rows, view, scope]);
  const plan = useMemo(() => planGmiObjectForm(editableRows, drafts, encodingClass, linked), [editableRows, drafts, encodingClass, linked]);
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

  if (!object) return <div className="gmi-edit-inspector-empty"><p>Velg en rad i datatabellen for å se og rette objektets verdier.</p></div>;

  const title = describeGmiObject(scope, sourceIndex, object.id ?? null);
  const context = gmiObjectContext(object.attributes);
  const blockedOverwrite = plan.needsOverwrite.length > 0 && !allowOverwrite;
  const blockedReplace = plan.needsReplace.length > 0 && !allowReplace;

  const setDraft = (field, value) => { setMessage(null); setDrafts((current) => ({ ...current, [field]: value })); };
  const clearDraft = (field) => setDrafts((current) => { const next = { ...current }; delete next[field]; return next; });
  // Both physical drafts always change together, so the planner and object check see the pair.
  const setLinkedDraft = (value) => { setMessage(null); setDrafts((current) => ({ ...current, ...Object.fromEntries(linked.keys.map((key) => [key, value])) })); };
  const clearLinkedDraft = () => setDrafts((current) => { const next = { ...current }; linked.keys.forEach((key) => delete next[key]); return next; });
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
    // G8: a linked request is complete (both cells changed or unchanged, same value) or nothing is reviewed.
    const linkedRequested = Boolean(linked) && linked.keys.some((key) => Object.hasOwn(plan.values, key));
    if (linkedRequested && (!linked.editable || !linked.keys.every((key) => Object.hasOwn(plan.values, key))
      || !gmiLinkedTemaChangeSetComplete(result.changeSet, linked.keys, 1))) {
      setMessage({ tone: 'error', text: gmiEditMessage('linked-tema-incomplete') });
      return;
    }
    const consequences = gmiEditObjectReviewConsequences({ view, scope, sourceIndex, rows,
      values: Object.fromEntries(result.changeSet.cells.map((cell) => [cell.field, cell.next])) });
    const linkedChanged = linkedRequested && result.changeSet.cells.some((cell) => linked.keys.includes(cell.field));
    setReview({ changeSet: result.changeSet, stateKey: session.stateKey, ...consequences, allowNewErrors: false,
      linked: linkedChanged ? { keys: linked.keys, value: plan.values[linked.primary] } : null, allowLinked: false });
  };

  const reviewBlocked = (candidate) => (candidate.newErrors.length > 0 && !candidate.allowNewErrors) || (candidate.linked && !candidate.allowLinked);
  const stage = () => {
    if (!editable || !review || reviewStale || reviewBlocked(review)) return;
    focusMessage.current = true;
    const result = gmiEditSessions.stage(view.handle, review.changeSet);
    if (!result.ok) {
      setReview(null);
      setMessage({ tone: 'error', text: gmiEditMessage(result.code) });
      return;
    }
    const applied = review.changeSet.counts.applied;
    resetForm();
    if (result.staged) {
      setMessage({ tone: 'ok', text: `Rettingen er lagt til (${applied} felt). Den er ikke lastet ned ennå.`, changeSet: review.changeSet });
      onStaged?.(review.changeSet);
    } else setMessage({ tone: 'info', text: 'Ingen verdier ble endret, så ingen retting ble lagt til.' });
  };

  // G8: one logical Tema row. Both physical values are shown; one control edits both drafts.
  const linkedRow = (row) => {
    const draft = Object.hasOwn(drafts, linked.primary) ? drafts[linked.primary] : undefined;
    const editing = draft !== undefined && linked.members.some((member) => member.proposed !== draft);
    const problem = plan.problems[linked.primary];
    const inputId = `gmi-edit-${scope}-${sourceIndex}-${row.position ?? row.field}`;
    const findings = validation.findings.filter((finding) => finding.fields.some((field) => linked.keys.includes(field)));
    const restorable = !editing && linked.changed && !linked.originalDisagreement;
    return <tr key={`linked:${linked.label}`} data-field={linked.primary} data-gmi-linked-tema-row={linked.label}
      data-state={editing ? 'draft' : linked.changed ? 'proposed' : undefined}>
      <th scope="row">
        <span className="gmi-edit-field-heading">
          <label htmlFor={linked.editable && editable ? inputId : undefined} className="gmi-edit-field-name">Tema</label>
          {findings.map((finding) => <FindingIcon key={`${finding.key}:${finding.transition}`} finding={finding} />)}
        </span>
        <span className="gmi-edit-muted">{linked.label}</span>
      </th>
      <td><span className="gmi-edit-linked-values" data-gmi-linked-original>
        {linked.members.map((member) => <span key={member.field} data-gmi-linked-physical={member.field}>
          <span className="gmi-edit-muted">{member.field}</span> <Lexeme value={member.original} /></span>)}
      </span></td>
      <td>
        {linked.editable && editable ? <div className="gmi-edit-input-cell">
          <GmiFieldValueInput variant="object" domain={linked.domain} id={inputId} value={draft ?? linked.proposed ?? ''}
            strictListed emptyLabel="Velg Tema…" aria-invalid={problem ? true : undefined}
            aria-describedby={[`${inputId}-linked`, problem ? `${inputId}-problem` : null].filter(Boolean).join(' ')}
            className={`gmi-edit-input${editing ? ' gmi-edit-input-draft' : ''}${linked.changed && !editing ? ' gmi-edit-input-proposed' : ''}`}
            onChange={setLinkedDraft} />
          {editing && <PhotoIconButton icon={ArrowCounterClockwiseIcon} size={14} label="Angre skrivingen i Tema" tooltip="Angre skrivingen" onClick={clearLinkedDraft} />}
          {restorable && <button type="button" className="gmi-edit-link" onClick={() => setLinkedDraft(linked.original)}>Bruk original</button>}
        </div> : <span className="gmi-edit-readonly" title={linked.reason ? gmiEditMessage(linked.reason) : undefined}>
          {linked.reason && linked.reason !== 'document-not-editable' && <span className="gmi-edit-reason"><LockSimpleIcon size={12} aria-hidden="true" /> {gmiEditMessage(linked.reason)}</span>}
        </span>}
        {(linked.changed || linked.disagreement) && <span className="gmi-edit-linked-values" data-gmi-linked-effective>
          {linked.members.map((member) => <span key={member.field} data-gmi-linked-current={member.field}>
            <span className="gmi-edit-muted">{member.field} nå</span> <Lexeme value={member.proposed} /></span>)}
        </span>}
        {linked.disagreement && !editing && <span className="gmi-edit-badge gmi-edit-badge-warning" data-gmi-linked-disagreement>Ulike verdier</span>}
        {editing && <span className="gmi-edit-state-pill">Ikke lagt til</span>}
        {!editing && linked.changed && <span className="gmi-edit-state-pill gmi-edit-state-pill-proposed">Foreslått{linked.history.length ? ` · ${linked.history.at(-1).changeSetId}` : ''}</span>}
        {!editing && linked.changed && linked.history.length > 0 && <button type="button" className="gmi-edit-link" onClick={() => onShowChangeSet?.(linked.history.at(-1).changeSetId)}>Vis retting</button>}
        <span id={`${inputId}-linked`} className="gmi-edit-muted gmi-edit-linked-note" data-gmi-linked-note>Tema og S_FCODE oppdateres sammen med samme kode.</span>
        {editing && <span className="gmi-edit-muted gmi-edit-linked-note" role="note" data-gmi-photo-tema-warning>{PHOTO_TEMA_WARNING}</span>}
        {problem && <span id={`${inputId}-problem`} className="gmi-edit-problem" role="alert">{problem}</span>}
      </td>
    </tr>;
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
        </tr>)}
        {review.linked && review.changeSet.unchanged.filter((cell) => review.linked.keys.includes(cell.field)).map((cell) => <tr key={cell.key} data-gmi-linked-unchanged={cell.field}>
          <th scope="row">{cell.field}</th>
          <td><Lexeme value={cell.current} /></td>
          <td><Lexeme value={cell.current} /> <span className="gmi-edit-badge">Allerede riktig</span></td>
        </tr>)}</tbody>
      </table> : <p className="gmi-edit-note">Ingen verdier ville blitt endret.</p>}
      {review.linked && <div className="gmi-edit-linked-review" data-gmi-linked-review>
        <p>Tema og S_FCODE får samme verdi i én retting. Angre og Gjør om gjelder begge feltene.</p>
        <p className="gmi-edit-muted" role="note" data-gmi-photo-tema-warning>{PHOTO_TEMA_WARNING}</p>
        {review.resolved.length > 0 && <div data-gmi-resolved-findings>
          <p>Løser {review.resolved.length} funn i Validator:</p>
          <ul className="gmi-edit-review-errors">{review.resolved.map((finding) => <li key={finding.key}>{finding.state === 'FAIL' ? 'FEIL' : 'SJEKK'}: {finding.reason}</li>)}</ul>
        </div>}
        {review.newChecks.length > 0 && <div data-gmi-new-checks>
          <p className="gmi-edit-problem">Forslaget gir {review.newChecks.length} nye SJEKK i Validator.</p>
          <ul className="gmi-edit-review-errors">{review.newChecks.map((finding) => <li key={finding.key}>{finding.reason}</li>)}</ul>
        </div>}
        {review.unblocked > 0 && <p className="gmi-edit-muted" data-gmi-unblocked-checks>{review.unblocked} kontroller som var avhengige av Tema, kan nå vurderes.</p>}
        {!review.resolved.length && !review.newChecks.length && !review.newErrors.length && <p className="gmi-edit-muted">Validator finner ingen nye eller løste funn for objektet.</p>}
        <label className="gmi-edit-confirm"><input type="checkbox" data-gmi-linked-confirm checked={review.allowLinked}
          onChange={(event) => setReview({ ...review, allowLinked: event.target.checked })} />
          <span>Sett både Tema og S_FCODE til «{review.linked.value}»</span></label>
      </div>}
      {review.changeSet.skipped.length > 0 && <div className="gmi-edit-skipped" role="note">
        <WarningIcon size={14} aria-hidden="true" /> Hoppes over: {review.changeSet.skipped.map((cell) => `${cell.field} (${gmiSkipReasonLabel(cell.reason).toLowerCase()})`).join(', ')}
      </div>}
      {review.newErrors.length > 0 && <div data-gmi-new-errors>
        <p className="gmi-edit-problem">Forslaget gir {review.newErrors.length} nye FEIL i Validator.</p>
        <ul className="gmi-edit-review-errors">{review.newErrors.map((finding) => <li key={finding.key}>{finding.reason}</li>)}</ul>
        <label className="gmi-edit-confirm"><input type="checkbox" checked={review.allowNewErrors}
          onChange={(event) => setReview({ ...review, allowNewErrors: event.target.checked })} />
          <span>Legg til selv om Validator gir ny FEIL</span></label>
      </div>}
      <div className="gmi-edit-actions">
        <button type="button" className={control} onClick={() => setReview(null)}>Tilbake</button>
        <button type="button" className={primary} disabled={!review.changeSet.cells.length || reviewBlocked(review)} onClick={stage}>Legg til retting</button>
      </div>
    </section> : <form className="gmi-edit-form" onSubmit={(event) => { event.preventDefault(); buildReview(); }} aria-label={`Felt for ${title}`}>
      {reviewStale && <p className="gmi-edit-message" data-tone="warning" role="status">{gmiEditMessage('stale-change-set')}</p>}
      <table className="gmi-edit-fields">
        <thead><tr><th scope="col">Felt</th><th scope="col">Original</th><th scope="col">Foreslått / ny verdi</th></tr></thead>
        <tbody>
          {(rows || Object.entries(object.attributes || {}).filter(([field]) => field !== '').map(([field, value]) => ({ field, label: fieldLabel(field), editable: false, reason: null, original: value === null ? '' : String(value), proposed: null, parsed: true })))
            .map((row) => {
              if (linked && linked.keys.includes(row.field)) return row === rows.find((entry) => linked.keys.includes(entry.field)) ? linkedRow(row) : null;
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
                    <GmiFieldValueInput variant="object" domain={row.domain} id={inputId} value={draft ?? row.proposed}
                      aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${inputId}-problem` : undefined}
                      className={`gmi-edit-input${editing ? ' gmi-edit-input-draft' : ''}${row.changed && !editing ? ' gmi-edit-input-proposed' : ''}`}
                      onChange={(value) => setDraft(row.field, value)} />
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
      {validation.pending ? 'Kontrollerer objektet…' : <>Objektkontroll: <LegendItem tone="error">FEIL</LegendItem> · <LegendItem tone="warning">SJEKK</LegendItem> · + = nytt
        · <LegendItem tone="success">løst</LegendItem>.</>}
      {' '}NYTT-år på tvers av objekter vurderes ikke lokalt.
    </p>}
    {unboundFindings.length > 0 && <details className="gmi-edit-unbound-findings">
      <summary>Funn i felt som mangler i skjemaet ({unboundFindings.length})</summary>
      <ul>{unboundFindings.map((finding) => <li key={`${finding.key}:${finding.transition}`}>
        <FindingIcon finding={finding} /> {finding.reason}
      </li>)}</ul>
    </details>}
    {message && <p ref={messageRef} tabIndex={-1} className="gmi-edit-message gmi-focus-ring" data-tone={message.tone} role="status" data-gmi-object-message>{message.text}
      {/* H4: same rule context as the staged ChangeSet details; absent for ordinary corrections. */}
      {message.changeSet && validatorCheck?.(message.changeSet) && <>{' '}<button type="button" className="gmi-edit-link gmi-focus-ring" data-gmi-validator-check
        onClick={validatorCheck(message.changeSet)}>Kontroller i Validator (Foreslått)</button></>}</p>}
    <p className="gmi-edit-hint">Geometri, koordinater, objektnummer, GUID og filhode kan ikke rettes. Nye kolonner kan ikke legges til.</p>
  </div>;
}
