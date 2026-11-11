'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwiseIcon, CheckCircleIcon, CheckIcon, HandPointingIcon, SealWarningIcon, WarningIcon, WarningOctagonIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { getGmiProposedState } from '@/lib/gmi-edit/index.mjs';
import { GMI_SOURCE_LEXEMES } from '@/lib/parsing/gmiLexicalEvidence.js';
import { checkGmiFieldDraft } from '@/lib/gmiEditFields.mjs';
import { prepareGmiFieldBatch, buildGmiFieldBatch, getGmiFieldBatchApproval } from '@/lib/gmiFieldBatchPlan.mjs';
import GmiFieldValueInput from './GmiFieldValueInput';
import useGmiBatchValidation from './useGmiBatchValidation';
import { gmiSelectionTargets, gmiInspectorFields, gmiFieldInspectorRows, gmiInspectorMixedFields, gmiBatchDatasetFindings, gmiBatchFindingList, gmiBatchSkipSummary, GMI_BATCH_OUTCOME_LABELS } from '@/lib/gmiBatchInspectorView.mjs';
import { gmiEditMessage, gmiLexemeProblem, describeGmiObject, gmiObjectCountLabel } from '@/lib/gmiEditView.mjs';
import GmiConfirmDialog from './GmiConfirmDialog';
import { Lexeme } from './GmiObjectEditor';

const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1';
const primary = 'gmi-primary-control gmi-focus-ring gmi-batch-primary';
const MODES = Object.freeze([['fill-missing', 'Fyll manglende verdier'], ['set', 'Sett verdi']]);
const modeLabel = (mode) => MODES.find(([value]) => value === mode)?.[1] || mode;
const STEPS = ['Velg objekter', 'Oppsett', 'Forhåndsvis', 'Lagt til'];
const newCount = (count, label) => `${count} ${count === 1 ? 'ny' : 'nye'} ${label}`;

/** "1 ny FEIL" / "0 nye SJEKK": always visible, coloured only when non-zero. */
function SeverityCount({ count, tone, label }) {
  const Icon = tone === 'error' ? WarningOctagonIcon : WarningIcon;
  return <span className="gmi-severity-count" data-validation-tone={count ? tone : undefined} data-count={count}>
    <Icon size={14} weight="regular" aria-hidden="true" />{newCount(count, label)}
  </span>;
}

/** Finding list for the risk dialog: most severe group first, with objects. */
function RiskFindings({ tone, title, findings }) {
  if (!findings.length) return null;
  const Icon = tone === 'error' ? WarningOctagonIcon : WarningIcon;
  return <div className="gmi-risk-group" data-validation-tone={tone}>
    <p className="gmi-risk-group-title"><Icon size={16} weight="regular" aria-hidden="true" />{title}</p>
    <ul>{findings.map((finding) => <li key={finding.key}><strong>{finding.objects.join(', ')}</strong>: {finding.reason}</li>)}</ul>
  </div>;
}

export default function GmiBatchInspector({ view, onDirtyChange, registerReset, onClose, onRequestClose, onStaged, inspected, onInspectClose, renderChangeSet }) {
  'use no memo';
  const selection = useStore((state) => state.gmiEditSelection);
  const [field, setField] = useState(''), [lexeme, setLexeme] = useState(''), [mode, setMode] = useState('fill-missing');
  const [review, setReview] = useState(null), [manual, setManual] = useState(new Set()), [advanced, setAdvanced] = useState(false);
  const [replace, setReplace] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(null), [risk, setRisk] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [staged, setStaged] = useState(null); // id of the ChangeSet just staged from this inspector
  const generation = useRef(0);
  const scopeExpanded = useRef(false);
  const dirty = Boolean(lexeme || review || mode !== 'fill-missing');
  const referenceDate = useStore((state) => state.gmiValidatorReferenceDate);
  const fields = useMemo(() => gmiInspectorFields(view, selection?.scope), [view, selection?.scope]);
  const column = fields.find((entry) => entry.sourceKey === field);
  const currentDataset = useMemo(() => getGmiProposedState(view.session).dataset, [view.session]);
  const emptyCount = field && selection?.keys.reduce((total, key) => {
    const object = currentDataset?.[selection.scope === 'point' ? 'points' : 'lines']?.[Number(key.split(':')[1])];
    const value = object?.attributes?.[GMI_SOURCE_LEXEMES]?.[field] ?? object?.attributes?.[field];
    return total + Number(String(value ?? '').trim() === '');
  }, 0);
  const scopeProblem = gmiSelectionTargets(view, selection);
  const stale = review ? review.preview.session !== view.session || !scopeProblem.ok || selection.scope !== review.preview.scope
    ? 'stale-session' : expanded || selection.keys.some((key) => !review.keys.includes(key)) ? 'expanded' : null : null;
  useEffect(() => { if (stale === 'expanded') setExpanded(true); }, [stale]);
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
  // The edited field leads the Data Table while previewing.
  const focusField = review?.preview.sourceKey || null;
  useEffect(() => {
    if (!focusField) return undefined;
    const key = `batch:${focusField}`;
    useStore.setState({ gmiEditColumnFocus: { layerId: view.session.layerId, key, fields: [focusField] } });
    return () => { if (useStore.getState().gmiEditColumnFocus?.key === key) useStore.setState({ gmiEditColumnFocus: null }); };
  }, [focusField, view.session.layerId]);
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
      const result = await prepareGmiFieldBatch(view, { scope: currentSelection.scope, sourceKey: field, operation: mode, value: lexeme, targets: targets.targets }, {
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
    const mixed = gmiInspectorMixedFields(review.preview, checked.dryRun.current.dataset, selection);
    const unvalidated = review.preview.column.validatorKind !== 'bound' || !review.preview.column.governingRuleId;
    if (!approval && (manualRows.length || changeSet.counts.populatedOverwrites || changeSet.counts.overwritten
      || checked.dryRun.diff.newCounts.fail || mixed.length || unvalidated)) {
      const findings = gmiBatchDatasetFindings(checked.dryRun).map((finding) => ({ ...finding,
        objects: [finding.objectRef ? describeGmiObject(finding.objectRef.geometryScope, finding.objectRef.sourceIndex,
          checked.dryRun.current.dataset[finding.objectRef.geometryScope === 'line' ? 'lines' : 'points'][finding.objectRef.sourceIndex]?.id) : 'Datasettet'] }));
      setRisk({ changeSet, selection, review, plan, findings, manualRows, mixed, unvalidated }); return;
    }
    const result = gmiEditSessions.stage(view.handle, changeSet);
    if (!result.ok) { setMessage(gmiEditMessage(result.code)); return; }
    invalidate(); setLexeme(''); setField(''); onDirtyChange(false); setRisk(null); setStaged(changeSet.id); onStaged(changeSet);
  };
  const draft = checkGmiFieldDraft(column, lexeme, view.document.encoding.encodingClass);
  const problem = lexeme ? draft.problem?.code === 'value-out-of-domain' ? 'Velg en verdi fra listen.' : gmiLexemeProblem(draft.problem, lexeme) : null;
  const conflicts = plan?.rows?.filter((row) => selection.keys.includes(row.key) && row.changedBy?.length && row.current !== lexeme).length || 0;
  const detail = inspected ? getGmiProposedState(view.session).dataset?.[inspected.scope === 'line' ? 'lines' : 'points']?.[inspected.sourceIndex] : null;
  const inspectedReview = inspected && review ? review.preview.rows.find((row) => row.scope === inspected.scope && row.sourceIndex === inspected.sourceIndex) : null;
  const inspectedOutcome = inspected ? tableRows?.[`${inspected.scope}:${inspected.sourceIndex}`] : null;
  const count = selection?.keys.length || 0;
  const countLabel = gmiObjectCountLabel(count, selection?.scope);
  const canPreview = Boolean(field && column && !column.disabled) && !busy && scopeProblem.ok && !problem && Boolean(lexeme.trim());
  const step = stagedChangeSet ? 3 : review && !stale ? 2 : 1;
  const counts = plan?.counts ? { ...plan.counts, selected: selection.keys.length,
    unchanged: Object.values(tableRows).filter((row) => row.outcome === 'unchanged').length,
    skipped: review.preview.rows.filter((row) => selection.keys.includes(row.key) && tableRows[row.key]?.outcome === 'skipped').length,
    excluded: review.keys.length - selection.keys.length, manual: plan.rows.filter((row) => tableRows[row.key]?.outcome === 'manual').length,
    newErrors: plan.datasetCounts?.introduced.fail ?? plan.counts.newErrors, newChecks: plan.datasetCounts?.introduced.check ?? plan.counts.newChecks } : null;
  const breakdown = counts ? [['Hoppes over', counts.skipped], ['Utelatt av deg', counts.excluded], ['Manuelt inkludert', counts.manual],
    ['Uendret', counts.unchanged], ['Overskriver utfylte', plan.ok ? plan.changeSet.counts.populatedOverwrites : 0]].filter(([, value]) => value > 0) : [];
  const stageBlocked = busy || Boolean(stale) || !plan?.ok || !plan.changeSet.cells.length || (conflicts > 0 && !replace) || validation.state?.status !== 'ready';
  const newBatch = () => { setStaged(null); setConfigOpen(true); setMessage(null); };
  const configForm = <form onSubmit={(event) => { event.preventDefault(); if (canPreview) calculate(); }} className="gmi-inspector-config" data-gmi-batch-config>
    <label>Felt<select aria-label="Felt for masseendring" value={field} disabled={busy} onChange={(event) => { invalidate(); setField(event.target.value); setLexeme(''); }}>
      <option value="">Velg felt…</option>
      {fields.map((entry, index) => <option key={index} value={entry.sourceKey ?? `absent:${entry.canonicalFieldId}`} disabled={entry.disabled}>
        {entry.sourceKey || entry.label || '(uten navn)'}{entry.explanation ? ` – ${entry.explanation}` : ''}
      </option>)}
    </select></label>
    {field && <p className="gmi-edit-muted">{field}: tom i {emptyCount} av {count}.</p>}
    <GmiFieldValueInput column={column} value={lexeme} problem={problem} disabled={busy || !field} onChange={(value) => { invalidate(); setLexeme(value); }} />
    <fieldset className="gmi-batch-modes"><legend>Hvordan skal verdien brukes?</legend>
      {MODES.map(([value, label]) => <label key={value}><input type="radio" name="inspector-batch-mode" checked={mode === value} onChange={() => { invalidate(); setMode(value); }} /> {label}</label>)}
    </fieldset>
    {problem && <p role="alert" className="gmi-edit-problem">{problem}</p>}
    {!stale && <button className={primary} disabled={!canPreview}>{busy ? 'Lager forhåndsvisning…' : review ? 'Oppdater forhåndsvisning' : 'Forhåndsvis endringer'}</button>}
  </form>;
  return <section className="gmi-edit-editor gmi-batch-inspector" data-gmi-batch-inspector data-batch-step={step} aria-label="Masseendring av valgte objekter" aria-busy={busy || Boolean(candidate?.ok && candidate.changeSet.cells.length && (!validation.state || validation.state.status === 'running'))}>
    <header className="gmi-batch-head">
      <div className="min-w-0"><p className="gmi-edit-kicker">Masseendring</p><h2>{countLabel} valgt</h2></div>
      <button type="button" className={control} onClick={onRequestClose}>Avslutt</button>
    </header>
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
          {review.preview.mode === 'fill-missing' && <><span className="gmi-batch-proposal-from">tom</span><span aria-hidden="true"> → </span><span className="sr-only"> til </span></>}
          {review.preview.mode !== 'fill-missing' && <span aria-hidden="true"> → </span>}
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
          <p className="gmi-batch-severity"><SeverityCount count={counts.newErrors} tone="error" label="FEIL" /><SeverityCount count={counts.newChecks} tone="warning" label="SJEKK" /></p>
          {plan && !plan.ok && plan.included?.size > 0 && <p className="gmi-edit-problem">{gmiEditMessage(plan.code, 'Forhåndsvisningen kunne ikke kontrolleres. Oppdater den.')}</p>}
          {plan?.ok === false && !plan.included?.size && <p className="gmi-edit-muted">Ingen av de valgte objektene kan endres med dette oppsettet.</p>}
        </>}
      </div>}
      {(!review || configOpen) && <div className="gmi-inspector-configuration">{review && <p className="gmi-edit-muted">Endringer i oppsettet krever ny forhåndsvisning.</p>}{configForm}</div>}

      {plan?.counts && !stale && <div className="gmi-batch-options">
        <details className="gmi-edit-muted"><summary>Slik leser du tabellen</summary>Status og «Endring» i datatabellen viser det som faktisk legges til. Utelatte og hoppede objekter får ingen endring. Klikk en rad for detaljer. Nye funn er rådgivende; NYTT-år på tvers av objekter kontrolleres separat.</details>
        <label className="gmi-edit-check gmi-batch-advanced"><input type="checkbox" checked={advanced} onChange={(event) => { setRisk(null); setReplace(false); setAdvanced(event.target.checked); setManual(new Set()); }} />Tillat manuelt utvalg utenfor Validatorens anbefaling</label>
        {advanced && <p className="gmi-manual-note"><HandPointingIcon size={14} weight="regular" aria-hidden="true" /><span>Bruk «Inkluder manuelt» per objekt i tabellen. Manuelle tillegg kan gi FEIL og krever egen godkjenning.</span></p>}
        {conflicts > 0 && <label className="gmi-edit-check"><input type="checkbox" checked={replace} onChange={(event) => { setRisk(null); setReplace(event.target.checked); }} />Erstatt tidligere rettinger for {conflicts} valgte objekter</label>}
      </div>}
      {candidate?.ok && candidate.changeSet.cells.length > 0 && !stale && <div className="gmi-edit-muted" data-gmi-batch-dry-run role="status">
        Full kontroll av forslaget: {validation.state?.status === 'ready' ? `OK · ${plan.datasetCounts.resolved.fail} FEIL og ${plan.datasetCounts.resolved.check} SJEKK løst`
          : validation.state?.status === 'running' ? `trinn ${Math.min(validation.state.phase, 4)} av 4…`
            : validation.state?.status === 'cancelled' ? 'Avbrutt – må kjøres før godkjenning' : 'Ikke godkjent – full kontroll kreves'}
        {validation.state?.status === 'running' ? <button type="button" className={control} onClick={validation.cancel}>Avbryt full kontroll</button>
          : validation.state?.status !== 'ready' && <button type="button" className={control} onClick={validation.retry}>Kjør full kontroll</button>}
        {validation.state?.status === 'failed' && <p role="alert">{gmiEditMessage(validation.state.batch?.code, 'Forslaget kunne ikke verifiseres og kontrolleres. Kjør full kontroll på nytt.')}</p>}
        {plan.crossObject?.introduced.length > 0 && <p>{plan.crossObject.introduced.length} nye funn utenfor objektene som endres.</p>}
        {plan.dryRun && <details><summary>Se nye og løste funn i hele datasettet</summary><ul>
          {[...gmiBatchDatasetFindings(plan.dryRun), ...gmiBatchDatasetFindings(plan.dryRun, 'resolved')].map((finding) => <li key={finding.key}>
            {finding.introduced ? 'Nytt' : 'Løst'} · {finding.severity} · {finding.objectRef ? describeGmiObject(finding.objectRef.geometryScope, finding.objectRef.sourceIndex,
              plan.dryRun.current.dataset[finding.objectRef.geometryScope === 'line' ? 'lines' : 'points'][finding.objectRef.sourceIndex]?.id) : 'Datasettet'}: {finding.reason}
          </li>)}
        </ul></details>}
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
        {inspectedReview.resolvedFindings?.length > 0 && <ul>{inspectedReview.resolvedFindings.map((finding) => <li key={finding.key}>Løses hvis objektet endres: {finding.reason}</li>)}</ul>}
        {['change', 'manual'].includes(inspectedOutcome?.outcome) ? null : <p className="gmi-edit-muted">Funnene under gjelder bare hvis objektet faktisk endres.</p>}
        <ul className="gmi-batch-finding-list">{[...gmiBatchFindingList(inspectedReview.findings), ...gmiBatchFindingList(inspectedReview.otherFindings)].map((finding) => <li key={finding.key} data-validation-tone={finding.tone}>
          <strong>{finding.severity}{finding.introduced ? ' (ny)' : ''}</strong>: {finding.reason}</li>)}</ul></>}
      <dl>{Object.entries(detail.attributes).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{detail.attributes[GMI_SOURCE_LEXEMES]?.[key] ?? String(value ?? '')}</dd></div>)}</dl>
    </details>}
    {risk && <GmiConfirmDialog testId="batch-risk" tone="risk" confirmIcon={SealWarningIcon}
      title={risk.manualRows.length ? 'Bekreft manuelt overstyrt masseendring' : 'Bekreft masseendring'}
      confirmLabel="Godkjenn og legg til" cancelLabel="Tilbake til utvalget" destructive={false} onCancel={() => setRisk(null)} onConfirm={() => stage(risk)}>
      <p className="gmi-risk-operation"><strong>{risk.review.preview.sourceKey} → «{risk.review.preview.lexeme}»</strong> · {gmiObjectCountLabel(risk.changeSet.cells.length, review.preview.scope)} endres</p>
      {[['error', 'FEIL'], ['warning', 'SJEKK']].map(([tone, label]) => {
        const findings = risk.findings.filter((finding) => finding.tone === tone && finding.introduced);
        return <RiskFindings key={tone} tone={tone} title={newCount(findings.length, label)} findings={findings} />;
      })}
      {risk.mixed.length > 0 && <p>Blandet utvalg: {risk.mixed.join(', ')}. Bekreft at samme verdi skal brukes på disse objektene.</p>}
      {risk.unvalidated && <p>Feltet kontrolleres ikke av Validator. Bekreft at verdien er vurdert manuelt.</p>}
      {risk.manualRows.length > 0 && <div className="gmi-manual-note gmi-risk-manual">
        <HandPointingIcon size={16} weight="regular" aria-hidden="true" />
        <div><p><strong>{risk.manualRows.length} manuelt inkludert</strong> utenfor Validatorens anbefaling; dette kan gi FEIL.</p>
          <ul>{risk.manualRows.map((row) => <li key={row.key} title={row.explanation}><strong>{row.label}</strong>: {row.reason}</li>)}</ul></div>
      </div>}
      {(risk.changeSet.counts.populatedOverwrites > 0 || risk.changeSet.counts.overwritten > 0) && <p>{risk.changeSet.counts.populatedOverwrites} utfylte verdier overskrives. {risk.changeSet.counts.overwritten} tidligere rettinger erstattes.</p>}
      {risk.findings.some((finding) => !finding.introduced) && <details className="gmi-edit-muted"><summary>Eksisterende funn på feltet ({risk.findings.filter((finding) => !finding.introduced).length})</summary>
        <ul>{risk.findings.filter((finding) => !finding.introduced).map((finding) => <li key={finding.key}>{finding.severity}: {finding.reason} ({finding.objects.join(', ')})</li>)}</ul></details>}
      {!risk.findings.some((finding) => finding.introduced) && <p className="gmi-severity-none"><CheckCircleIcon size={14} weight="regular" aria-hidden="true" /> Ingen nye FEIL eller SJEKK for objektene som endres.</p>}
    </GmiConfirmDialog>}
  </section>;
}
