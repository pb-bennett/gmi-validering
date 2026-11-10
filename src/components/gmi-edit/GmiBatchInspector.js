'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwiseIcon, CheckCircleIcon, CheckIcon, HandPointingIcon, SealWarningIcon, WarningIcon, WarningOctagonIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { validateGmiFieldLexeme, getGmiProposedState } from '@/lib/gmi-edit/index.mjs';
import { GMI_SOURCE_LEXEMES } from '@/lib/parsing/gmiLexicalEvidence.js';
import { GMI_BATCH_FIELDS, prepareGmiBatchReview } from '@/lib/gmiEditBatchView.mjs';
import { gmiSelectionTargets, gmiBatchScopeState, planGmiInspectorBatch, gmiBatchReviewRows, gmiBatchFindingList, gmiBatchSkipSummary, GMI_BATCH_OUTCOME_LABELS } from '@/lib/gmiBatchInspectorView.mjs';
import { gmiEditMessage, gmiLexemeProblem, describeGmiObject, gmiObjectCountLabel } from '@/lib/gmiEditView.mjs';
import GmiConfirmDialog from './GmiConfirmDialog';
import { Lexeme } from './GmiObjectEditor';

const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1';
const primary = 'gmi-primary-control gmi-focus-ring gmi-batch-primary';
const MODES = Object.freeze([['fill-missing', 'Fyll manglende verdier'], ['overwrite', 'Overskriv eksisterende verdier']]);
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
  const [field, setField] = useState('sdr'), [lexeme, setLexeme] = useState(''), [mode, setMode] = useState('fill-missing');
  const [review, setReview] = useState(null), [manual, setManual] = useState(new Set()), [advanced, setAdvanced] = useState(false);
  const [replace, setReplace] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(null), [risk, setRisk] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [staged, setStaged] = useState(null); // id of the ChangeSet just staged from this inspector
  const generation = useRef(0);
  const scopeExpanded = useRef(false);
  const dirty = Boolean(lexeme || review || field !== 'sdr' || mode !== 'fill-missing');
  const scopeProblem = gmiSelectionTargets(view, selection);
  const stale = review ? gmiBatchScopeState(view, selection, review) || (expanded ? 'expanded' : null) : null;
  useEffect(() => { if (stale === 'expanded') setExpanded(true); }, [stale]);
  useEffect(() => useStore.subscribe((state, previous) => {
    if (!review || state.gmiEditSelection === previous.gmiEditSelection) return;
    const before = new Set(previous.gmiEditSelection?.keys || []);
    if (state.gmiEditSelection?.keys.some((key) => !before.has(key))) {
      scopeExpanded.current = true; setExpanded(true); setRisk(null);
    }
  }), [review]);
  const plan = useMemo(() => review && !stale ? planGmiInspectorBatch(view, selection, review, manual, replace, advanced) : null,
    [view, selection, review, manual, replace, advanced, stale]);
  const toggleManual = useCallback((key) => { setRisk(null); setManual((current) => {
    const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next;
  }); }, []);
  const stagedChangeSet = staged ? view.changeSets.find((changeSet) => changeSet.id === staged) || null : null;
  // An undo/discard of the just-staged correction returns to the configuration.
  useEffect(() => { if (staged && !stagedChangeSet) setStaged(null); }, [staged, stagedChangeSet]);
  // Per-object outcome of exactly the ChangeSet that would be staged now.
  const tableRows = useMemo(() => review ? gmiBatchReviewRows({ review, plan, selection, advanced, stale }) : null,
    [review, plan, selection, advanced, stale]);
  // Only small presentation records cross to the table. Documents/eligibility stay here.
  useEffect(() => {
    if (!review) { useStore.setState({ gmiBatchTableReview: null }); return undefined; }
    const rows = tableRows;
    useStore.setState({ gmiBatchTableReview: { layerId: view.session.layerId, session: view.session.stateKey,
      revision: gmiEditSessions.describe(view.session.layerId)?.revision, selection, rows, valid: Boolean(plan && !stale),
      field: review.preview.eligibility.field, lexeme: review.preview.lexeme, onManual: toggleManual } });
    return () => useStore.setState({ gmiBatchTableReview: null });
  }, [plan, review, selection, view, toggleManual, stale, tableRows]);
  // The edited field leads the Data Table while previewing.
  const focusField = review?.preview.eligibility.field || null;
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
      const result = await prepareGmiBatchReview(view, { canonicalFieldId: field, mode, lexeme, targets: targets.targets }, {
        isLive: () => token === generation.current && gmiEditSessions.getSession(view.handle).session === view.session
          && useStore.getState().gmiEditSelection === currentSelection,
      });
      if (token !== generation.current) return;
      if (!result.ok) { setMessage(result.code === 'field-absent' ? 'Feltet mangler i originalfilen. Kolonnen kan ikke opprettes.' : gmiEditMessage(result.code)); return; }
      // prepare yields for rendering; also verify the final chunk's exact scope.
      if (gmiEditSessions.getSession(view.handle).session !== view.session || useStore.getState().gmiEditSelection !== currentSelection) {
        setMessage('Utvalget eller økten er endret – oppdater forhåndsvisningen.'); return;
      }
      setReview({ preview: result, binding: currentSelection.binding, keys: [...currentSelection.keys] });
      setConfigOpen(false);
    } catch { setMessage('Forhåndsvisningen kunne ikke lages. Prøv igjen.'); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const currentPlan = () => {
    const live = gmiEditSessions.getSession(view.handle);
    if (!live.ok || live.session !== view.session || expanded || scopeExpanded.current || !review) return null;
    return planGmiInspectorBatch(view, useStore.getState().gmiEditSelection, review, manual, replace, advanced);
  };
  const stage = (approval = null) => {
    const latest = currentPlan();
    if (!latest?.ok || !latest.changeSet.cells.length) { setRisk(null); setMessage('Forhåndsvisningen er utdatert – oppdater den.'); return; }
    // A compact risk dialog approves an exact selection and configuration only.
    if (approval && (approval.selection !== useStore.getState().gmiEditSelection || approval.review !== review || approval.manual !== manual || approval.replace !== replace || approval.advanced !== advanced)) {
      setRisk(null); setMessage('Utvalget er endret. Se gjennom og godkjenn på nytt.'); return;
    }
    const changeSet = latest.changeSet;
    if (!approval && (changeSet.eligibility.manualOverrides.length || changeSet.counts.populatedOverwrites || changeSet.counts.overwritten)) {
      // Findings of the cells that actually change, grouped with their objects.
      const findings = new Map();
      const changing = new Set(changeSet.cells.map((cell) => cell.key));
      for (const row of latest.rows.filter((entry) => changing.has(entry.key))) for (const finding of gmiBatchFindingList(row.findings)) {
        const existing = findings.get(finding.key) || { ...finding, objects: [] };
        existing.objects.push(describeGmiObject(row.scope, row.sourceIndex, row.objectId));
        findings.set(finding.key, existing);
      }
      const manualRows = changeSet.eligibility.manualOverrides.map((entry) => {
        const basis = review.preview.skippedRows.find((row) => row.key === entry.key);
        return { key: entry.key, label: describeGmiObject(entry.scope, entry.sourceIndex, entry.objectId),
          reason: basis ? gmiBatchSkipSummary(basis, review.preview.eligibility.field, entry.reason) : '', explanation: basis?.explanation || '' };
      });
      setRisk({ changeSet, selection, review, manual, replace, advanced, findings: [...findings.values()], manualRows }); return;
    }
    const result = gmiEditSessions.stage(view.handle, changeSet);
    if (!result.ok) { setMessage(gmiEditMessage(result.code)); return; }
    invalidate(); setLexeme(''); onDirtyChange(false); setRisk(null); setStaged(changeSet.id); onStaged(changeSet);
  };
  const problem = gmiLexemeProblem(validateGmiFieldLexeme(lexeme, view.document.encoding.encodingClass), lexeme);
  const conflicts = plan?.rows?.filter((row) => plan.included.has(row.key) && row.changedBy.length && row.current !== lexeme).length || 0;
  const detail = inspected ? getGmiProposedState(view.session).dataset?.[inspected.scope === 'line' ? 'lines' : 'points']?.[inspected.sourceIndex] : null;
  const inspectedReview = inspected && review ? [...review.preview.rows, ...review.preview.skippedRows].find((row) => row.scope === inspected.scope && row.sourceIndex === inspected.sourceIndex) : null;
  const inspectedOutcome = inspected ? tableRows?.[`${inspected.scope}:${inspected.sourceIndex}`] : null;
  const count = selection?.keys.length || 0;
  const countLabel = gmiObjectCountLabel(count, selection?.scope);
  const canPreview = !busy && scopeProblem.ok && !problem && Boolean(lexeme.trim());
  const step = stagedChangeSet ? 3 : review && !stale ? 2 : 1;
  const counts = plan?.counts;
  const breakdown = counts ? [['Hoppes over', counts.skipped], ['Utelatt av deg', counts.excluded], ['Manuelt inkludert', counts.manual],
    ['Uendret', counts.unchanged], ['Overskriver utfylte', plan.ok ? plan.changeSet.counts.populatedOverwrites : 0]].filter(([, value]) => value > 0) : [];
  const stageBlocked = busy || Boolean(stale) || !plan?.ok || !plan.changeSet.cells.length || (conflicts > 0 && !replace);
  const newBatch = () => { setStaged(null); setConfigOpen(true); setMessage(null); };
  const configForm = <form onSubmit={(event) => { event.preventDefault(); if (canPreview) calculate(); }} className="gmi-inspector-config" data-gmi-batch-config>
    <label>Felt<select aria-label="Felt for masseendring" value={field} disabled={busy} onChange={(event) => { invalidate(); setField(event.target.value); }}>{GMI_BATCH_FIELDS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
    <label>Ny verdi<input aria-label="Ny verdi" value={lexeme} autoComplete="off" spellCheck={false} aria-invalid={Boolean(problem)} onChange={(event) => { invalidate(); setLexeme(event.target.value); }} /></label>
    <fieldset className="gmi-batch-modes"><legend>Hvordan skal verdien brukes?</legend>
      {MODES.map(([value, label]) => <label key={value}><input type="radio" name="inspector-batch-mode" checked={mode === value} onChange={() => { invalidate(); setMode(value); }} /> {label}</label>)}
    </fieldset>
    {problem && <p role="alert" className="gmi-edit-problem">{problem}</p>}
    {!stale && <button className={primary} disabled={!canPreview}>{busy ? 'Lager forhåndsvisning…' : review ? 'Oppdater forhåndsvisning' : 'Forhåndsvis endringer'}</button>}
  </form>;
  return <section className="gmi-edit-editor gmi-batch-inspector" data-gmi-batch-inspector data-batch-step={step} aria-label="Masseendring av valgte objekter" aria-busy={busy}>
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
        <p className="gmi-batch-proposal-change"><span className="gmi-batch-proposal-field">{review.preview.eligibility.field}</span>
          {review.preview.mode === 'fill-missing' && <><span className="gmi-batch-proposal-from">tom</span><span aria-hidden="true"> → </span><span className="sr-only"> til </span></>}
          {review.preview.mode !== 'fill-missing' && <span aria-hidden="true"> → </span>}
          <strong className="gmi-batch-proposal-value"><Lexeme value={review.preview.lexeme} /></strong></p>
        <p className="gmi-batch-proposal-mode">{modeLabel(review.preview.mode)}</p>
        {stale ? <div className="gmi-batch-stale" role="alert">
          <p><ArrowsClockwiseIcon size={14} weight="regular" aria-hidden="true" />{stale === 'expanded'
            ? 'Utvalget er utvidet etter forhåndsvisningen. Oppdater forhåndsvisningen før endringen kan legges til.'
            : 'Utvalget eller rettingene er endret. Oppdater forhåndsvisningen før endringen kan legges til.'}</p>
          <button type="button" className={primary} disabled={!canPreview} onClick={calculate}>{busy ? 'Lager forhåndsvisning…' : 'Oppdater forhåndsvisning'}</button>
        </div> : counts && <>
          <p className="gmi-batch-proposal-count" data-gmi-batch-changed={counts.changed}><strong>{counts.changed}</strong> av {gmiObjectCountLabel(counts.selected, 'line')} endres</p>
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
      {inspectedReview && <><p>{inspectedReview.explanation}</p><p>Forhåndsvisning: {review.preview.eligibility.field} → «{review.preview.lexeme}»{inspectedOutcome ? ` · ${GMI_BATCH_OUTCOME_LABELS[inspectedOutcome.outcome]}` : ''}</p>
        {['change', 'manual'].includes(inspectedOutcome?.outcome) ? null : <p className="gmi-edit-muted">Funnene under gjelder bare hvis objektet faktisk endres.</p>}
        <ul className="gmi-batch-finding-list">{[...gmiBatchFindingList(inspectedReview.findings), ...gmiBatchFindingList(inspectedReview.otherFindings)].map((finding) => <li key={finding.key} data-validation-tone={finding.tone}>
          <strong>{finding.severity}{finding.introduced ? ' (ny)' : ''}</strong>: {finding.reason}</li>)}</ul></>}
      <dl>{Object.entries(detail.attributes).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{detail.attributes[GMI_SOURCE_LEXEMES]?.[key] ?? String(value ?? '')}</dd></div>)}</dl>
    </details>}
    {risk && <GmiConfirmDialog testId="batch-risk" tone="risk" confirmIcon={SealWarningIcon}
      title={risk.changeSet.eligibility.manualOverrides.length ? 'Bekreft manuelt overstyrt masseendring' : 'Bekreft overskriving og erstatning'}
      confirmLabel="Godkjenn og legg til" cancelLabel="Tilbake til utvalget" destructive={false} onCancel={() => setRisk(null)} onConfirm={() => stage(risk)}>
      <p className="gmi-risk-operation"><strong>{risk.review.preview.eligibility.field} → «{risk.review.preview.lexeme}»</strong> · {gmiObjectCountLabel(risk.changeSet.cells.length, 'line')} endres</p>
      {[['error', 'FEIL'], ['warning', 'SJEKK']].map(([tone, label]) => {
        const findings = risk.findings.filter((finding) => finding.tone === tone && finding.introduced);
        return <RiskFindings key={tone} tone={tone} title={newCount(findings.length, label)} findings={findings} />;
      })}
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
