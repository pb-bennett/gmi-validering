'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwiseIcon, CheckIcon, HandPointingIcon, SealWarningIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { getGmiProposedState } from '@/lib/gmi-edit/index.mjs';
import { GMI_SOURCE_LEXEMES } from '@/lib/parsing/gmiLexicalEvidence.js';
import { checkGmiFieldDraft } from '@/lib/gmiEditFields.mjs';
import { prepareGmiFieldBatch, buildGmiFieldBatch, getGmiFieldBatchApproval, gmiFieldBatchValues } from '@/lib/gmiFieldBatchPlan.mjs';
import GmiFieldValueInput from './GmiFieldValueInput';
import useGmiBatchValidation from './useGmiBatchValidation';
import { gmiSelectionTargets, gmiInspectorFields, gmiFieldInspectorRows, gmiInspectorMixedFields, gmiBatchDatasetTransitions, gmiObjectFindingTransitions, gmiBatchSkipSummary, gmiCurrentFindingSplit, gmiBatchRiskReasons, GMI_BATCH_OUTCOME_LABELS } from '@/lib/gmiBatchInspectorView.mjs';
import { gmiEditMessage, gmiLexemeProblem, describeGmiObject, gmiObjectCountLabel } from '@/lib/gmiEditView.mjs';
import GmiConfirmDialog from './GmiConfirmDialog';
import GmiSeverityIcon from './GmiSeverityIcon';
import { Lexeme } from './GmiObjectEditor';
import GmiSelectionProfile, { GmiCurrentFindingSplit } from './GmiSelectionProfile';
import { buildGmiSelectionProfile, gmiSelectionNarrowing, gmiSelectionProfileSources, gmiProfileMixedColumns, gmiProfileDistributionText } from '@/lib/gmiSelectionProfile.mjs';

const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1';
const primary = 'gmi-primary-control gmi-focus-ring gmi-batch-primary';
const MODES = Object.freeze([['fill-missing', 'Fyll manglende verdier'], ['set', 'Sett verdi'], ['replace', 'Erstatt verdi'], ['clear', 'Tøm verdi']]);
const modeLabel = (mode) => MODES.find(([value]) => value === mode)?.[1] || mode;
const STEPS = ['Velg objekter', 'Oppsett', 'Forhåndsvis', 'Lagt til'];
const newCount = (count, label) => `${count} ${count === 1 ? 'ny' : 'nye'} ${label}`;

/** "1 ny FEIL" / "0 nye SJEKK": always visible, coloured only when non-zero. */
function SeverityCount({ count, tone, label }) {
  return <span className="gmi-severity-count" data-validation-tone={count ? tone : undefined} data-count={count}>
    <GmiSeverityIcon tone={tone} size={14} />{newCount(count, label)}
  </span>;
}

/** S2: severity transitions and resolved findings, shown next to the new counts without expanding anything. */
function TransitionCount({ count, tone, text, title, always = false }) {
  if (!count && !always) return null;
  return <span className="gmi-transition-count" data-validation-tone={count ? tone : undefined} data-count={count} title={title}>
    <GmiSeverityIcon tone={tone} size={14} />{count} {text}
  </span>;
}

const objectLabel = (dryRun, finding) => finding.objectRef ? describeGmiObject(finding.objectRef.geometryScope, finding.objectRef.sourceIndex,
  dryRun.current.dataset[finding.objectRef.geometryScope === 'line' ? 'lines' : 'points'][finding.objectRef.sourceIndex]?.id) : 'Datasettet';

/** Finding list for the risk dialog: most severe group first, with objects. */
function RiskFindings({ tone, title, findings }) {
  if (!findings.length) return null;
  return <div className="gmi-risk-group" data-validation-tone={tone}>
    <p className="gmi-risk-group-title"><GmiSeverityIcon tone={tone} size={16} />{title}</p>
    <ul>{findings.map((finding) => <li key={finding.key} data-transition={finding.transition}><strong>{finding.objects.join(', ')}</strong>: {finding.transition && finding.transition !== 'new' ? `${finding.label} (${finding.note}) – ` : ''}{finding.reason}</li>)}</ul>
  </div>;
}

export default function GmiBatchInspector({ view, onDirtyChange, registerReset, onClose, onRequestClose, onStaged, inspected, onInspectClose, renderChangeSet, onEditIndividually }) {
  'use no memo';
  const selection = useStore((state) => state.gmiEditSelection);
  const [field, setField] = useState(''), [lexeme, setLexeme] = useState(''), [mode, setMode] = useState('fill-missing');
  const [match, setMatch] = useState(null);
  const [review, setReview] = useState(null), [manual, setManual] = useState(new Set()), [advanced, setAdvanced] = useState(false);
  const [replace, setReplace] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(null), [risk, setRisk] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [staged, setStaged] = useState(null); // id of the ChangeSet just staged from this inspector
  // S5: the field the user last chose. It leads the Data Table from the choice on, through staging and
  // «Ny masseendring», until another field is chosen. Presentation only: it never makes the form dirty.
  const [focusChoice, setFocusChoice] = useState('');
  const [profileNotice, setProfileNotice] = useState(null); // { selection, text }: shown only for the narrowed selection
  const fieldSelectRef = useRef(null), focusFieldSelect = useRef(false);
  const generation = useRef(0);
  const scopeExpanded = useRef(false);
  const dirty = Boolean(lexeme || review || mode !== 'fill-missing');
  const proposedLexeme = mode === 'clear' ? '' : lexeme;
  const referenceDate = useStore((state) => state.gmiValidatorReferenceDate);
  const fields = useMemo(() => gmiInspectorFields(view, selection?.scope), [view, selection?.scope]);
  const column = fields.find((entry) => entry.sourceKey === field);
  const currentDataset = useMemo(() => getGmiProposedState(view.session).dataset, [view.session]);
  const emptyCount = field && selection?.keys.reduce((total, key) => {
    const object = currentDataset?.[selection.scope === 'point' ? 'points' : 'lines']?.[Number(key.split(':')[1])];
    const keys = column?.linkedSourceKeys.length ? column.linkedSourceKeys : [field];
    return total + Number(keys.every(sourceKey => {
      const value = object?.attributes?.[GMI_SOURCE_LEXEMES]?.[sourceKey] ?? object?.attributes?.[sourceKey];
      return String(value ?? '').trim() === '';
    }));
  }, 0);
  const scopeProblem = gmiSelectionTargets(view, selection);
  const matchValues = useMemo(() => field ? gmiFieldBatchValues(view, selection, field) : null, [view, selection, field]);
  const matchAvailable = match !== null && matchValues?.values?.some((entry) => entry.lexeme === match);
  const stale = review ? review.preview.session !== view.session || !scopeProblem.ok || selection.scope !== review.preview.scope
    ? 'stale-session' : expanded || selection.keys.some((key) => !review.keys.includes(key)) ? 'expanded' : null : null;
  useEffect(() => { if (stale === 'expanded') setExpanded(true); }, [stale]);
  // B1: profile of the proposed working copy (staged corrections included); rule context only from a valid preview.
  const profileSources = useMemo(() => gmiSelectionProfileSources(view, selection?.scope), [view, selection?.scope]);
  const profile = useMemo(() => selection && scopeProblem.ok ? buildGmiSelectionProfile({ dataset: currentDataset, scope: selection.scope,
    keys: selection.keys, sources: profileSources, ruleRows: review && !stale ? review.preview.rows : null }) : null,
  [currentDataset, selection, scopeProblem.ok, profileSources, review, stale]);
  // B2: current findings on the edited field, from the preview's own Validator results; hidden once the preview is stale.
  const split = useMemo(() => review && !stale ? gmiCurrentFindingSplit(review.preview, selection) : null, [review, stale, selection]);
  useEffect(() => useStore.subscribe((state, previous) => {
    if (!review || state.gmiEditSelection === previous.gmiEditSelection) return;
    const before = new Set(previous.gmiEditSelection?.keys || []);
    if (state.gmiEditSelection?.keys.some((key) => !before.has(key))) {
      scopeExpanded.current = true; setExpanded(true); setRisk(null);
    }
  }), [review]);
  const candidate = useMemo(() => {
    if (!review || stale) return null;
    const keys = new Set(selection.keys);
    const included = new Set(review.preview.rows.filter((row) => keys.has(row.key)
      && (row.defaultIncluded || row.reason === 'conflict'
        || (row.canInclude && row.changedBy?.length && !row.reason && row.operationMatches)
        || (advanced && manual.has(row.key)))).map((row) => row.key));
    const result = buildGmiFieldBatch(view.session, review.preview, { included, replace, approvals: { allowApplicabilityOverride: advanced } });
    return result.ok ? result : { ...result, included, rows: review.preview.rows,
      counts: { selected: selection.keys.length, changed: 0, unchanged: 0, newErrors: 0, newChecks: 0 } };
  }, [view.session, selection, review, manual, replace, advanced, stale]);
  const validation = useGmiBatchValidation(view, candidate, referenceDate);
  const plan = validation.state?.status === 'ready' ? validation.state.batch : candidate;
  const toggleManual = useCallback((key) => { setRisk(null); setManual((current) => {
    const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next;
  }); }, []);
  const stagedChangeSet = staged ? view.changeSets.find((changeSet) => changeSet.id === staged) || null : null;
  // An undo/discard of the just-staged correction returns to the configuration.
  useEffect(() => { if (staged && !stagedChangeSet) setStaged(null); }, [staged, stagedChangeSet]);
  // Per-object outcome of exactly the ChangeSet that would be staged now.
  const tableRows = useMemo(() => review ? gmiFieldInspectorRows(review.preview, plan, selection, advanced, stale) : null,
    [review, plan, selection, advanced, stale]);
  // Only small presentation records cross to the table. Documents/eligibility stay here.
  useEffect(() => {
    if (!review) { useStore.setState({ gmiBatchTableReview: null }); return undefined; }
    const rows = tableRows;
    useStore.setState({ gmiBatchTableReview: { layerId: view.session.layerId, session: view.session.stateKey,
      revision: gmiEditSessions.describe(view.session.layerId)?.revision, selection, rows, valid: Boolean(plan && !stale),
      field: review.preview.sourceKey, lexeme: review.preview.lexeme, onManual: toggleManual } });
    return () => useStore.setState({ gmiBatchTableReview: null });
  }, [plan, review, selection, view, toggleManual, stale, tableRows]);
  // The edited field leads the Data Table as soon as it is chosen. While a staged ChangeSet is shown, its
  // details own the focus (same field); when they close («Ny masseendring», undo, discard) this one returns.
  const focusField = review?.preview.sourceKey
    || (focusChoice && fields.some((entry) => entry.sourceKey === focusChoice && !entry.disabled) ? focusChoice : null);
  const stagedFocusOwner = stagedChangeSet?.id || null;
  useEffect(() => {
    if (!focusField || stagedFocusOwner) return undefined;
    const key = `batch:${focusField}`;
    useStore.setState({ gmiEditColumnFocus: { layerId: view.session.layerId, key, fields: [focusField] } });
    return () => { if (useStore.getState().gmiEditColumnFocus?.key === key) useStore.setState({ gmiEditColumnFocus: null }); };
  }, [focusField, stagedFocusOwner, view.session.layerId]);
  // «Ny masseendring» unmounts its own button; keyboard focus continues in the field choice.
  useEffect(() => {
    if (!focusFieldSelect.current || stagedChangeSet) return;
    focusFieldSelect.current = false; fieldSelectRef.current?.focus();
  });
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => { registerReset(onClose); return () => registerReset(null); }, [registerReset, onClose]);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    if (!dirty) return;
    const listener = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', listener); return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);
  const invalidate = () => { generation.current++; scopeExpanded.current = false; setBusy(false); setReview(null); setRisk(null); setManual(new Set()); setAdvanced(false); setReplace(false); setExpanded(false); setMessage(null); };
  const calculate = async () => {
    const state = useStore.getState(), currentSelection = state.gmiEditSelection;
    const targets = gmiSelectionTargets(view, currentSelection);
    if (!targets.ok) return;
    const token = ++generation.current;
    scopeExpanded.current = false;
    setBusy(true); setMessage(null); setReview(null); setRisk(null); setManual(new Set()); setAdvanced(false); setReplace(false); setExpanded(false); setStaged(null);
    try {
      const result = await prepareGmiFieldBatch(view, { scope: currentSelection.scope, sourceKey: field, operation: mode, value: proposedLexeme, match, targets: targets.targets }, {
        isLive: () => token === generation.current && gmiEditSessions.getSession(view.handle).session === view.session
          && !scopeExpanded.current && useStore.getState().gmiEditSelection?.scope === currentSelection.scope
          && useStore.getState().gmiEditSelection?.keys.every((key) => currentSelection.keys.includes(key)),
      });
      if (token !== generation.current) return;
      if (!result.ok) { setMessage(result.code === 'field-absent' ? 'Feltet mangler i originalfilen. Kolonnen kan ikke opprettes.' : gmiEditMessage(result.code)); return; }
      // prepare yields for rendering; also verify the final chunk's exact scope.
      if (gmiEditSessions.getSession(view.handle).session !== view.session || useStore.getState().gmiEditSelection !== currentSelection) {
        setMessage('Utvalget eller økten er endret – oppdater forhåndsvisningen.'); return;
      }
      setReview({ preview: result.preview, binding: currentSelection.binding, keys: [...currentSelection.keys] });
      setConfigOpen(false);
    } catch { setMessage('Forhåndsvisningen kunne ikke lages. Prøv igjen.'); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const stage = (approval = null) => {
    // B2: an approval given for another selection is refused first, with the specific reason.
    if (approval && approval.selection !== useStore.getState().gmiEditSelection) {
      setRisk(null); setMessage('Utvalget er endret. Se gjennom og godkjenn på nytt.'); return;
    }
    const live = gmiEditSessions.getSession(view.handle);
    const checked = live.ok && !stale && !scopeExpanded.current && plan?.ok
      ? getGmiFieldBatchApproval(live.session, plan, { referenceDate: useStore.getState().gmiValidatorReferenceDate }) : null;
    if (!checked?.ok || !checked.changeSet.cells.length || selection !== useStore.getState().gmiEditSelection) {
      setRisk(null); setMessage('Forhåndsvisningen er utdatert – oppdater den.'); return;
    }
    if (approval && (approval.plan !== plan || approval.selection !== selection)) {
      setRisk(null); setMessage('Utvalget er endret. Se gjennom og godkjenn på nytt.'); return;
    }
    const changeSet = checked.changeSet;
    const manualRows = plan.rows.filter((row) => row.outcome === 'changed' && ['not-applicable', 'unresolved'].includes(row.reason))
      .map((row) => ({ key: row.key, label: describeGmiObject(row.scope, row.sourceIndex, row.objectId), reason: tableRows[row.key].detail }));
    // Only the objects that actually change in the checked ChangeSet can be mixed.
    const mixed = gmiInspectorMixedFields(review.preview, checked.dryRun.current.dataset, changeSet);
    const unvalidated = review.preview.column.validatorKind !== 'bound' || !review.preview.column.governingRuleId;
    // B2: the profile columns, over exactly the objects that change, on the checked working copy.
    const changing = [...new Set(changeSet.cells.map((cell) => `${cell.scope}:${cell.sourceIndex}`))];
    const mixedProfile = changing.length > 1 ? gmiProfileMixedColumns(buildGmiSelectionProfile({ dataset: checked.dryRun.current.dataset,
      scope: review.preview.scope, keys: changing, sources: profileSources, ruleRows: review.preview.rows })) : [];
    const reasons = gmiBatchRiskReasons({ manualRows, changeSetCounts: changeSet.counts, newFail: checked.dryRun.diff.newCounts.fail,
      mixedProfile, mixedFields: mixed, unvalidated, linkedTema: review.preview.linked });
    if (!approval && reasons.length) {
      // Presentation only: worsened FEIL are listed (once) under FEIL; the gate above still uses diff.newCounts.
      const transitions = gmiBatchDatasetTransitions(checked.dryRun);
      const findings = [...transitions.added, ...transitions.worsened, ...transitions.improved]
        .map((finding) => ({ ...finding, objects: [objectLabel(checked.dryRun, finding)] }));
      // The union keeps G4's Tema/edited-field names; the profile adds its columns with their distributions.
      const mixedNames = [...new Set([...mixed, ...mixedProfile.map((column) => column.label)])];
      setRisk({ changeSet, selection, review, plan, findings, manualRows, mixed: mixedNames, mixedProfile, unvalidated }); return;
    }
    const result = gmiEditSessions.stage(view.handle, changeSet);
    if (!result.ok) { setMessage(gmiEditMessage(result.code)); return; }
    if (!result.staged) { setMessage('Ingen verdier ble endret, så ingen retting ble lagt til.'); return; }
    invalidate(); setLexeme(''); setMatch(null); setField('');
    if (mode === 'replace' || mode === 'clear') setMode('fill-missing');
    onDirtyChange(false); setRisk(null); setStaged(changeSet.id); onStaged(changeSet);
  };
  // Domains offer values; the existing Validator/dry-run owns verdicts, including numeric equivalence.
  const draft = checkGmiFieldDraft(column, proposedLexeme, view.document.encoding.encodingClass, { restrictEnumeration: Boolean(column?.linkedSourceKeys.length) && mode !== 'clear' });
  const problem = proposedLexeme ? gmiLexemeProblem(draft.problem, proposedLexeme) : null;
  const conflicts = plan?.rows?.filter((row) => selection.keys.includes(row.key) && row.changedBy?.length && (row.physical ? row.physical.some(cell => cell.current !== proposedLexeme) : row.current !== proposedLexeme)
    && (!['replace', 'clear'].includes(mode) || (row.canInclude && row.operationMatches))).length || 0;
  const detail = inspected ? getGmiProposedState(view.session).dataset?.[inspected.scope === 'line' ? 'lines' : 'points']?.[inspected.sourceIndex] : null;
  const inspectedReview = inspected && review ? review.preview.rows.find((row) => row.scope === inspected.scope && row.sourceIndex === inspected.sourceIndex) : null;
  const inspectedOutcome = inspected ? tableRows?.[`${inspected.scope}:${inspected.sourceIndex}`] : null;
  const inspectedTransitions = inspectedReview ? gmiObjectFindingTransitions(inspectedReview) : null;
  const count = selection?.keys.length || 0;
  const countLabel = gmiObjectCountLabel(count, selection?.scope);
  const canPreview = Boolean(field && column && !column.disabled) && !busy && scopeProblem.ok && !problem && (mode === 'clear' || Boolean(lexeme.trim())) && (mode !== 'replace' || matchAvailable);
  const step = stagedChangeSet ? 3 : review && !stale ? 2 : 1;
  // S2: dataset findings with severity changes shown once (presentation only; approval keeps diff.newCounts).
  const datasetTransitions = plan?.dryRun ? gmiBatchDatasetTransitions(plan.dryRun) : null;
  const counts = plan?.counts ? { ...plan.counts, selected: selection.keys.length,
    unchanged: Object.values(tableRows).filter((row) => row.outcome === 'unchanged').length,
    skipped: review.preview.rows.filter((row) => selection.keys.includes(row.key) && tableRows[row.key]?.outcome === 'skipped').length,
    excluded: review.keys.length - selection.keys.length, manual: plan.rows.filter((row) => tableRows[row.key]?.outcome === 'manual').length,
    newErrors: datasetTransitions?.counts.newFail ?? plan.counts.newErrors, newChecks: datasetTransitions?.counts.newCheck ?? plan.counts.newChecks } : null;
  const breakdown = counts ? [['Allerede tomme', review.preview.rows.filter((row) => selection.keys.includes(row.key) && row.reason === 'already-empty').length], ['Hoppes over', counts.skipped], ['Utelatt av deg', counts.excluded], ['Manuelt inkludert', counts.manual],
    ['Uendret', counts.unchanged], ['Overskriver utfylte', plan.ok ? plan.changeSet.counts.populatedOverwrites : 0]].filter(([, value]) => value > 0) : [];
  const stageBlocked = busy || Boolean(stale) || !plan?.ok || !plan.changeSet.cells.length || (conflicts > 0 && !replace) || validation.state?.status !== 'ready';
  // «Behold bare disse»: one shrink-only reducer action. A shrink keeps the preview valid; approval is never carried over.
  const narrowSelection = (dimension, group) => {
    const current = useStore.getState().gmiEditSelection;
    if (busy || current !== selection) return false;
    const action = gmiSelectionNarrowing(current, group.keys);
    if (!action) return false;
    useStore.getState().changeGmiEditSelection(current.binding.layerId, { type: action.type, scope: action.scope, keys: [...action.keys] }, current.binding, current.host);
    const next = useStore.getState().gmiEditSelection;
    const before = new Set(current.keys);
    if (!next || next === current || next.keys.some((key) => !before.has(key))) return false;
    setRisk(null);
    setProfileNotice({ selection: next, text: `Utvalget er innsnevret til ${gmiObjectCountLabel(next.keys.length, next.scope)} (${dimension.label}: ${group.label}).` });
    return true;
  };
  const newBatch = () => { focusFieldSelect.current = true; setStaged(null); setConfigOpen(true); setMessage(null); };
  const configForm = <form onSubmit={(event) => { event.preventDefault(); if (canPreview) calculate(); }} className="gmi-inspector-config" data-gmi-batch-config>
    <label>Felt<select ref={fieldSelectRef} aria-label="Felt for masseendring" value={field} disabled={busy} onChange={(event) => { invalidate(); setField(event.target.value); setFocusChoice(event.target.value); setLexeme(''); setMatch(null); }}>
      <option value="">Velg felt…</option>
      {fields.map((entry, index) => <option key={index} value={entry.sourceKey ?? `absent:${entry.canonicalFieldId}`} disabled={entry.disabled}>
        {entry.label || entry.sourceKey || '(uten navn)'}{entry.explanation ? ` – ${entry.explanation}` : ''}
      </option>)}
    </select></label>
    {field && <p className="gmi-edit-muted">{field}: tom i {emptyCount} av {count}.</p>}
    {mode !== 'clear' && <GmiFieldValueInput key={`${selection?.scope}:${field}`} column={column} value={lexeme} problem={problem} disabled={busy || !field} onChange={(value) => { invalidate(); setLexeme(value); }} />}
    <fieldset className="gmi-batch-modes"><legend>Hvordan skal verdien brukes?</legend>
      {MODES.map(([value, label]) => <label key={value}><input type="radio" name="inspector-batch-mode" checked={mode === value} onChange={() => { invalidate(); setMode(value); setMatch(null); }} /> {label}</label>)}
    </fieldset>
    {mode === 'replace' && <div className="gmi-batch-match">
      <label>Eksisterende verdi<select aria-label="Eksisterende verdi som skal erstattes" disabled={busy || !field}
        value={matchAvailable ? String(matchValues.values.findIndex((entry) => entry.lexeme === match)) : ''}
        onChange={(event) => { invalidate(); setMatch(event.target.value === '' ? null : matchValues.values[Number(event.target.value)].lexeme); }}>
        <option value="">Velg eksisterende verdi…</option>
        {matchValues?.values?.map((entry, index) => <option key={index} value={index}>
          {entry.lexeme === '' ? '(tom streng)' : JSON.stringify(entry.lexeme).replace(/ /g, '·')} · {gmiObjectCountLabel(entry.count, selection.scope)}
          {entry.lexeme.trim() !== entry.lexeme ? ` · ${entry.lexeme.length} tegn, med mellomrom` : ''}
        </option>)}
      </select></label>
      <p className="gmi-edit-muted">Bare helt like verdier erstattes. Mellomrom og store/små bokstaver teller med. · viser mellomrom.</p>
      {matchValues?.blocked > 0 && <p className="gmi-edit-muted">{matchValues.blocked} objekter kan ikke leses som sikre kildeceller.</p>}
      {matchValues?.ambiguous > 0 && <p className="gmi-edit-muted">{matchValues.ambiguous} objekter har ulike Tema-verdier og kan bare rettes med «Sett verdi».</p>}
    </div>}
    {mode === 'clear' && <p className="gmi-edit-muted">Verdien fjernes bare fra objektene som kan endres. Allerede tomme verdier hoppes over.</p>}
    {problem && <p role="alert" className="gmi-edit-problem">{problem}</p>}
    {!stale && <button className={primary} disabled={!canPreview}>{busy ? 'Lager forhåndsvisning…' : review ? 'Oppdater forhåndsvisning' : 'Forhåndsvis endringer'}</button>}
  </form>;
  return <section className="gmi-edit-editor gmi-batch-inspector" data-gmi-batch-inspector data-batch-step={step} aria-label="Masseendring av valgte objekter" aria-busy={busy || Boolean(candidate?.ok && candidate.changeSet.cells.length && (!validation.state || validation.state.status === 'running'))}>
    <header className="gmi-batch-head">
      <div className="min-w-0"><p className="gmi-edit-kicker">Masseendring</p><h2>{countLabel} valgt</h2></div>
      <button type="button" className={control} onClick={onRequestClose}>Avslutt</button>
    </header>
    <div className="gmi-individual-alternative">
      <button type="button" className={control} disabled={!scopeProblem.ok || busy} onClick={onEditIndividually}>Rett én og én</button>
      <p className="gmi-edit-muted">Bruk ulike verdier eller rett andre felt på hvert objekt. Utvalget beholdes. SDR, Trykklasse og Ringstivhet kan bare masseendres på ledninger. Felt merket «Kan bare rettes enkeltvis» rettes i objektskjemaet; låste eller manglende felt kan ikke rettes der heller.</p>
    </div>
    <ol className="gmi-batch-steps" aria-label="Fremgang">
      {STEPS.map((label, index) => <li key={label} data-done={index < step || step === 3 || undefined} aria-current={index === step ? 'step' : undefined}>
        {index < step || step === 3 ? <CheckIcon size={11} weight="regular" aria-hidden="true" /> : <span aria-hidden="true">{index + 1}</span>}{label}
      </li>)}
    </ol>
    {!scopeProblem.ok && <p role="alert" className="gmi-edit-message" data-tone="warning">{scopeProblem.code === 'line-only' ? 'SDR, Trykklasse og Ringstivhet støttes bare for ledninger. Velg ledninger for å fortsette.' : 'Velg objekter fra den aktive kilden for å fortsette.'}</p>}

    {stagedChangeSet ? <>
      {renderChangeSet(stagedChangeSet)}
      <div className="gmi-batch-stage"><button type="button" className={primary} onClick={newBatch}>Ny masseendring for utvalget</button>
        <p className="gmi-edit-muted">Utvalget er beholdt ({countLabel}).</p></div>
    </> : <>
      {review && <div className="gmi-batch-proposal" data-gmi-batch-counts data-state={stale ? 'stale' : 'valid'} aria-live="polite">
        <div className="gmi-batch-proposal-head">
          <span className="gmi-batch-proposal-kicker">{stale ? 'Forhåndsvisningen er ugyldig' : 'Foreslått retting'}</span>
          <button type="button" className="gmi-edit-link gmi-focus-ring" aria-expanded={configOpen} onClick={() => setConfigOpen((open) => !open)}>{configOpen ? 'Skjul oppsett' : 'Endre oppsett'}</button>
        </div>
        <p className="gmi-batch-proposal-change"><span className="gmi-batch-proposal-field">{review.preview.sourceKey}</span>
          {review.preview.operation === 'replace' && <><Lexeme value={review.preview.match} /><span aria-hidden="true"> → </span></>}
          {review.preview.mode === 'fill-missing' && <><span className="gmi-batch-proposal-from">tom</span><span aria-hidden="true"> → </span><span className="sr-only"> til </span></>}
          {review.preview.mode !== 'fill-missing' && review.preview.operation !== 'replace' && <span aria-hidden="true"> → </span>}
          <strong className="gmi-batch-proposal-value"><Lexeme value={review.preview.lexeme} /></strong></p>
        <p className="gmi-batch-proposal-mode">{modeLabel(review.preview.operation)}</p>
        {stale ? <div className="gmi-batch-stale" role="alert">
          <p><ArrowsClockwiseIcon size={14} weight="regular" aria-hidden="true" />{stale === 'expanded'
            ? 'Utvalget er utvidet etter forhåndsvisningen. Oppdater forhåndsvisningen før endringen kan legges til.'
            : 'Utvalget eller rettingene er endret. Oppdater forhåndsvisningen før endringen kan legges til.'}</p>
          <button type="button" className={primary} disabled={!canPreview} onClick={calculate}>{busy ? 'Lager forhåndsvisning…' : 'Oppdater forhåndsvisning'}</button>
        </div> : counts && <>
          <p className="gmi-batch-proposal-count" data-gmi-batch-changed={counts.changed}><strong>{counts.changed}</strong> av {gmiObjectCountLabel(counts.selected, selection.scope)} endres</p>
          {breakdown.length > 0 && <p className="gmi-batch-breakdown">{breakdown.map(([label, value]) => <span key={label}>{label}: {value}</span>)}</p>}
          <p className="gmi-batch-severity"><SeverityCount count={counts.newErrors} tone="error" label="FEIL" /><SeverityCount count={counts.newChecks} tone="warning" label="SJEKK" />
            {datasetTransitions && <>
              <TransitionCount count={datasetTransitions.counts.worsened} tone="error" text="forverret" title="SJEKK → FEIL. Telles som ny FEIL ved godkjenning." />
              <TransitionCount count={datasetTransitions.counts.improved} tone="warning" text="forbedret" title="FEIL → SJEKK. SJEKK gjenstår." />
              <TransitionCount count={datasetTransitions.counts.resolvedFail + datasetTransitions.counts.resolvedCheck} tone="success" text="løst" always
                title={`${datasetTransitions.counts.resolvedFail} FEIL og ${datasetTransitions.counts.resolvedCheck} SJEKK løst`} />
            </>}</p>
          {plan && !plan.ok && plan.included?.size > 0 && <p className="gmi-edit-problem">{gmiEditMessage(plan.code, 'Forhåndsvisningen kunne ikke kontrolleres. Oppdater den.')}</p>}
          {plan?.ok === false && !plan.included?.size && <p className="gmi-edit-muted">Ingen av de valgte objektene kan endres med dette oppsettet.</p>}
        </>}
      </div>}
      {review?.preview.linked && <details className="gmi-edit-muted" data-gmi-linked-values><summary>Tema og S_FCODE: original og foreslått nå</summary>
        {review.preview.rows.map(row => <div key={row.key}><strong>{describeGmiObject(row.scope, row.sourceIndex, row.objectId)}</strong>
          {row.physical?.map(cell => <p key={cell.field}>{cell.field}: Original <Lexeme value={cell.original} /> · Foreslått nå <Lexeme value={cell.current} /></p>)}
          {row.disagreement && <p>Ulike verdier i Tema og S_FCODE.</p>}{!row.physical && <p>Begge kildeceller kunne ikke verifiseres. Objektet endres ikke.</p>}</div>)}
      </details>}
      {/* B1/B2: after the proposal, so a live preview stays visible without scrolling. */}
      <GmiCurrentFindingSplit split={split} scope={selection?.scope} disabled={busy} onNarrow={narrowSelection} />
      <GmiSelectionProfile profile={profile} disabled={busy} notice={profileNotice?.selection === selection ? profileNotice.text : null} onNarrow={narrowSelection} />
      {(review?.preview.linked || column?.linkedSourceKeys.length > 0) && <div className="gmi-edit-muted" data-gmi-linked-tema>
        <p>Tema og S_FCODE endres sammen. Ved ulike verdier må du bruke «Sett verdi». Andre operasjoner krever helt like verdier i begge kolonner.</p>
        <p role="note">FOTO bruker Tema fra originalfilen. Endringen påvirker ikke automatisk bildegrupperingen.</p>
      </div>}
      {(!review || configOpen) && <div className="gmi-inspector-configuration">{review && <p className="gmi-edit-muted">Endringer i oppsettet krever ny forhåndsvisning.</p>}{configForm}</div>}

      {plan?.counts && !stale && <div className="gmi-batch-options">
        <details className="gmi-edit-muted"><summary>Slik leser du tabellen</summary>Status og «Endring» i datatabellen viser det som faktisk legges til. Utelatte og hoppede objekter får ingen endring. Klikk en rad for detaljer. Nye funn er rådgivende; NYTT-år på tvers av objekter kontrolleres separat.</details>
        <label className="gmi-edit-check gmi-batch-advanced"><input type="checkbox" checked={advanced} onChange={(event) => { setRisk(null); setReplace(false); setAdvanced(event.target.checked); setManual(new Set()); }} />Tillat manuelt utvalg utenfor Validatorens anbefaling</label>
        {advanced && <p className="gmi-manual-note"><HandPointingIcon size={14} weight="regular" aria-hidden="true" /><span>Bruk «Inkluder manuelt» per objekt i tabellen. Manuelle tillegg kan gi FEIL og krever egen godkjenning.</span></p>}
        {conflicts > 0 && <label className="gmi-edit-check"><input type="checkbox" checked={replace} onChange={(event) => { setRisk(null); setReplace(event.target.checked); }} />Erstatt tidligere rettinger for {conflicts} valgte objekter</label>}
      </div>}
      {candidate?.ok && candidate.changeSet.cells.length > 0 && !stale && <div className="gmi-edit-muted" data-gmi-batch-dry-run role="status">
        Full kontroll av forslaget: {validation.state?.status === 'ready' && datasetTransitions ? `OK · ${datasetTransitions.counts.resolvedFail} FEIL og ${datasetTransitions.counts.resolvedCheck} SJEKK løst`
          : validation.state?.status === 'running' ? `trinn ${Math.min(validation.state.phase, 4)} av 4…`
            : validation.state?.status === 'cancelled' ? 'Avbrutt – må kjøres før godkjenning' : 'Ikke godkjent – full kontroll kreves'}
        {validation.state?.status === 'running' ? <button type="button" className={control} onClick={validation.cancel}>Avbryt full kontroll</button>
          : validation.state?.status !== 'ready' && <button type="button" className={control} onClick={validation.retry}>Kjør full kontroll</button>}
        {validation.state?.status === 'failed' && <p role="alert">{gmiEditMessage(validation.state.batch?.code, 'Forslaget kunne ikke verifiseres og kontrolleres. Kjør full kontroll på nytt.')}</p>}
        {plan.crossObject?.introduced.length > 0 && <p>{plan.crossObject.introduced.length} nye funn utenfor objektene som endres.</p>}
        {datasetTransitions && <details className="gmi-batch-dataset-findings"><summary>Se nye og løste funn i hele datasettet</summary>
          {[['Nye', datasetTransitions.added], ['Forverret', datasetTransitions.worsened], ['Forbedret', datasetTransitions.improved], ['Løst', datasetTransitions.resolved]]
            .filter(([, findings]) => findings.length).map(([group, findings]) => <div key={group} data-finding-group={group}>
              <p className="gmi-batch-finding-group">{group} ({findings.length})</p>
              <ul className="gmi-batch-finding-list">{findings.map((finding) => <li key={finding.key} data-validation-tone={finding.transition === 'resolved' ? 'success' : finding.tone} data-transition={finding.transition}>
                <GmiSeverityIcon tone={finding.transition === 'resolved' ? 'success' : finding.tone} size={13} /><strong>{finding.label}</strong>
                {finding.note ? ` (${finding.note})` : ''} · {objectLabel(plan.dryRun, finding)}: {finding.reason}</li>)}</ul>
            </div>)}
        </details>}
      </div>}
      {busy && <button type="button" className={control} onClick={() => { generation.current++; setBusy(false); setMessage('Forhåndsvisningen er avbrutt.'); }}>Avbryt forhåndsvisning</button>}
      <div className="gmi-batch-stage">
        <button type="button" className={primary} disabled={stageBlocked} onClick={() => stage()}>Legg til masseendring</button>
        <p className="gmi-edit-muted">{!review ? 'Forhåndsvis endringene først.' : stale ? 'Oppdater forhåndsvisningen først.'
          : conflicts > 0 && !replace ? 'Velg om tidligere rettinger skal erstattes før endringen kan legges til.'
            : !plan?.ok || !plan.changeSet.cells.length ? 'Ingen verdier endres med dette oppsettet.'
              : 'Legges til som én retting i arbeidskopien. Originalfilen endres ikke.'}</p>
      </div>
    </>}
    {message && <p role="status" className="gmi-edit-message">{message}</p>}
    {inspected && detail && <details open className="gmi-batch-object-detail"><summary>{describeGmiObject(inspected.scope, inspected.sourceIndex, detail.id)} · Foreslått nå · skrivebeskyttet</summary>
      <button type="button" className={control} onClick={onInspectClose}>Tilbake til masseendringen</button>
      {inspectedReview && <><p>{inspectedReview.explanation}</p><p>Forhåndsvisning: {review.preview.sourceKey} → «{review.preview.lexeme}»{inspectedOutcome ? ` · ${GMI_BATCH_OUTCOME_LABELS[inspectedOutcome.outcome]}` : ''}</p>
        <p>Original: <Lexeme value={inspectedReview.original} /> · Foreslått nå: <Lexeme value={inspectedReview.current} /></p>
        {['change', 'manual'].includes(inspectedOutcome?.outcome) ? null : <p className="gmi-edit-muted">Funnene under gjelder bare hvis objektet faktisk endres.</p>}
        {inspectedTransitions.findings.length ? <ul className="gmi-batch-finding-list" data-gmi-object-findings="changed">{inspectedTransitions.findings.map((finding) => <li key={finding.key} data-validation-tone={finding.tone} data-transition={finding.transition}>
          <GmiSeverityIcon tone={finding.tone} size={13} /><strong>{finding.label}</strong>{finding.note ? ` (${finding.note})` : ''}: {finding.reason}</li>)}</ul>
          : <p className="gmi-edit-muted" data-gmi-object-findings="none">Ingen nye funn.</p>}
        {inspectedTransitions.resolved.length > 0 && <ul className="gmi-batch-finding-list" data-gmi-object-findings="resolved">{inspectedTransitions.resolved.map((finding) => <li key={finding.key} data-validation-tone="success" data-transition="resolved">
          <GmiSeverityIcon tone="success" size={13} /><strong>Løses</strong> ({finding.severity}): {finding.reason}</li>)}</ul>}
        {inspectedTransitions.existing.length > 0 && <details className="gmi-batch-existing-findings" data-gmi-object-findings="existing"><summary>Eksisterende funn, uendret ({inspectedTransitions.existing.length})</summary>
          <ul className="gmi-batch-finding-list">{inspectedTransitions.existing.map((finding) => <li key={finding.key} data-validation-tone={finding.tone} data-transition="existing">
            <GmiSeverityIcon tone={finding.tone} size={13} /><strong>{finding.severity}</strong>: {finding.reason}</li>)}</ul></details>}</>}
      <dl>{Object.entries(detail.attributes).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{detail.attributes[GMI_SOURCE_LEXEMES]?.[key] ?? String(value ?? '')}</dd></div>)}</dl>
    </details>}
    {risk && <GmiConfirmDialog testId="batch-risk" tone="risk" confirmIcon={SealWarningIcon}
      title={risk.manualRows.length ? 'Bekreft manuelt overstyrt masseendring' : 'Bekreft masseendring'}
      confirmLabel="Godkjenn og legg til" cancelLabel="Tilbake til utvalget" destructive={false} onCancel={() => setRisk(null)} onConfirm={() => stage(risk)}>
      <p className="gmi-risk-operation"><strong>{['replace', 'clear'].includes(risk.review.preview.operation) ? <>
        {modeLabel(risk.review.preview.operation)}: {risk.review.preview.sourceKey}
        {risk.review.preview.operation === 'replace' && <> <Lexeme value={risk.review.preview.match} /></>} → <Lexeme value={risk.review.preview.lexeme} />
      </> : <>{risk.review.preview.sourceKey} → «{risk.review.preview.lexeme}»</>}</strong> · {gmiObjectCountLabel(risk.changeSet.objectCount, review.preview.scope)} endres</p>
      {[['error', 'FEIL'], ['warning', 'SJEKK']].map(([tone, label]) => {
        // FEIL lists new and worsened (SJEKK → FEIL) findings once each; improved findings are listed separately.
        const findings = risk.findings.filter((finding) => finding.tone === tone && finding.introduced && finding.transition !== 'improved');
        const worsened = findings.filter((finding) => finding.transition === 'worsened').length;
        return <RiskFindings key={tone} tone={tone} findings={findings}
          title={worsened ? `${findings.length} ${findings.length === 1 ? 'ny eller forverret' : 'nye eller forverrede'} ${label}` : newCount(findings.length, label)} />;
      })}
      <RiskFindings tone="warning" title={`${risk.findings.filter((finding) => finding.transition === 'improved').length} forbedret (FEIL → SJEKK, SJEKK gjenstår)`}
        findings={risk.findings.filter((finding) => finding.transition === 'improved')} />
      {risk.mixed.length > 0 && <div className="gmi-risk-mixed" data-gmi-risk-mixed>
        <p>Blandet blant objektene som endres: {risk.mixed.join(', ')}. Bekreft at samme verdi skal brukes på disse objektene.</p>
        {risk.mixedProfile.length > 0 && <ul>{risk.mixedProfile.map((column) => <li key={column.id} data-mixed-field={column.id}>
          <strong>{column.label}:</strong> {gmiProfileDistributionText(column)}</li>)}</ul>}
      </div>}
      {risk.review.preview.linked && <p>Tema og S_FCODE oppdateres samlet. Bekreft verdien for begge kolonner.</p>}
      {risk.unvalidated && <p>Feltet kontrolleres ikke av Validator. Bekreft at verdien er vurdert manuelt.</p>}
      {risk.manualRows.length > 0 && <div className="gmi-manual-note gmi-risk-manual">
        <HandPointingIcon size={16} weight="regular" aria-hidden="true" />
        <div><p><strong>{risk.manualRows.length} manuelt inkludert</strong> utenfor Validatorens anbefaling; dette kan gi FEIL.</p>
          <ul>{risk.manualRows.map((row) => <li key={row.key} title={row.explanation}><strong>{row.label}</strong>: {row.reason}</li>)}</ul></div>
      </div>}
      {(risk.changeSet.counts.populatedOverwrites > 0 || risk.changeSet.counts.overwritten > 0) && <p>{risk.changeSet.counts.populatedOverwrites} utfylte verdier overskrives. {risk.changeSet.counts.overwritten} tidligere rettinger erstattes.</p>}
      {risk.findings.some((finding) => !finding.introduced) && <details className="gmi-edit-muted"><summary>Eksisterende funn på feltet ({risk.findings.filter((finding) => !finding.introduced).length})</summary>
        <ul>{risk.findings.filter((finding) => !finding.introduced).map((finding) => <li key={finding.key}>{finding.severity}: {finding.reason} ({finding.objects.join(', ')})</li>)}</ul></details>}
      {!risk.findings.some((finding) => finding.introduced && finding.transition !== 'improved') && <p className="gmi-severity-none"><GmiSeverityIcon tone="success" size={14} /> Ingen nye FEIL eller SJEKK for objektene som endres.</p>}
    </GmiConfirmDialog>}
  </section>;
}
