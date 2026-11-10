'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStore from '@/lib/store';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { validateGmiFieldLexeme, getGmiProposedState } from '@/lib/gmi-edit/index.mjs';
import { GMI_SOURCE_LEXEMES } from '@/lib/parsing/gmiLexicalEvidence.js';
import { GMI_BATCH_FIELDS, prepareGmiBatchReview, canManuallySelectGmiBatchRow } from '@/lib/gmiEditBatchView.mjs';
import { gmiSelectionTargets, gmiBatchScopeState, planGmiInspectorBatch } from '@/lib/gmiBatchInspectorView.mjs';
import { gmiEditMessage, gmiLexemeProblem, gmiSkipReasonLabel, describeGmiObject } from '@/lib/gmiEditView.mjs';
import GmiConfirmDialog from './GmiConfirmDialog';

const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1';
const primary = 'gmi-primary-control gmi-focus-ring px-2 py-1';

export default function GmiBatchInspector({ view, onDirtyChange, registerReset, onClose, onRequestClose, onStaged, inspected, onInspectClose }) {
  'use no memo';
  const selection = useStore((state) => state.gmiEditSelection);
  const [field, setField] = useState('sdr'), [lexeme, setLexeme] = useState(''), [mode, setMode] = useState('fill-missing');
  const [review, setReview] = useState(null), [manual, setManual] = useState(new Set()), [advanced, setAdvanced] = useState(false);
  const [replace, setReplace] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(null), [risk, setRisk] = useState(null);
  const [expanded, setExpanded] = useState(false);
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
  // Only small presentation records cross to the table. Documents/eligibility stay here.
  useEffect(() => {
    const currentRows = new Map((plan?.rows || []).map((row) => [`${row.scope}:${row.sourceIndex}`, row]));
    const rows = Object.fromEntries((review ? [...review.preview.rows, ...review.preview.skippedRows] : []).map((basis) => {
      const objectKey = `${basis.scope}:${basis.sourceIndex}`, row = currentRows.get(objectKey) || basis;
      const selected = currentRows.has(objectKey);
      return [objectKey, {
      label: describeGmiObject(row.scope, row.sourceIndex, row.objectId),
      status: selected ? row.status : 'Utelatt av deg', reason: selected && row.skipReason ? gmiSkipReasonLabel(row.skipReason) : '', explanation: row.explanation,
      original: row.original, current: row.current, proposed: review.preview.lexeme, manual: Boolean(row.manual),
      findings: row.findings.map((finding) => `${finding.state === 'FAIL' ? 'FEIL' : 'SJEKK'}${finding.batchIntroduced ? ' (ny)' : ''}: ${finding.reason}`).join(' · '),
      newError: row.findings.some((finding) => finding.state === 'FAIL' && finding.batchIntroduced),
      canManual: selected && advanced && canManuallySelectGmiBatchRow(row, review.preview.mode), cellKey: row.key,
    }]; }));
    useStore.setState({ gmiBatchTableReview: plan ? { layerId: view.session.layerId, session: view.session.stateKey,
      revision: gmiEditSessions.describe(view.session.layerId)?.revision, selection, rows, onManual: toggleManual } : null });
    return () => useStore.setState({ gmiBatchTableReview: null });
  }, [plan, advanced, review, selection, view, toggleManual]);
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
    setBusy(true); setMessage(null); setReview(null); setRisk(null); setManual(new Set()); setAdvanced(false); setReplace(false); setExpanded(false);
    try {
      const result = await prepareGmiBatchReview(view, { canonicalFieldId: field, mode, lexeme, targets: targets.targets }, {
        isLive: () => token === generation.current && gmiEditSessions.getSession(view.handle).session === view.session
          && useStore.getState().gmiEditSelection === currentSelection,
      });
      if (token !== generation.current) return;
      if (!result.ok) { setMessage(result.code === 'field-absent' ? 'Feltet mangler i originalfilen. Kolonnen kan ikke opprettes.' : gmiEditMessage(result.code)); return; }
      // prepare yields for rendering; also verify the final chunk's exact scope.
      if (gmiEditSessions.getSession(view.handle).session !== view.session || useStore.getState().gmiEditSelection !== currentSelection) {
        setMessage('Utvalget eller økten er endret – beregn på nytt.'); return;
      }
      setReview({ preview: result, binding: currentSelection.binding, keys: [...currentSelection.keys] });
    } catch { setMessage('Utvalget kunne ikke beregnes. Prøv igjen.'); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const currentPlan = () => {
    const live = gmiEditSessions.getSession(view.handle);
    if (!live.ok || live.session !== view.session || expanded || scopeExpanded.current || !review) return null;
    return planGmiInspectorBatch(view, useStore.getState().gmiEditSelection, review, manual, replace, advanced);
  };
  const stage = (approval = null) => {
    const latest = currentPlan();
    if (!latest?.ok || !latest.changeSet.cells.length) { setRisk(null); setMessage('Utvalget er utdatert – beregn på nytt.'); return; }
    // A compact risk dialog approves an exact selection and configuration only.
    if (approval && (approval.selection !== useStore.getState().gmiEditSelection || approval.review !== review || approval.manual !== manual || approval.replace !== replace || approval.advanced !== advanced)) {
      setRisk(null); setMessage('Utvalget er endret. Se gjennom og godkjenn på nytt.'); return;
    }
    const changeSet = latest.changeSet;
    if (!approval && (changeSet.eligibility.manualOverrides.length || changeSet.counts.populatedOverwrites || changeSet.counts.overwritten)) {
      const findings = new Map();
      const changing = new Set(changeSet.cells.map((cell) => cell.key));
      for (const row of latest.rows.filter((entry) => changing.has(entry.key))) for (const finding of row.findings) {
        const existing = findings.get(finding.key); findings.set(finding.key, { ...finding, count: (existing?.count || 0) + 1 });
      }
      setRisk({ changeSet, selection, review, manual, replace, advanced, findings: [...findings.values()] }); return;
    }
    const result = gmiEditSessions.stage(view.handle, changeSet);
    if (!result.ok) { setMessage(gmiEditMessage(result.code)); return; }
    invalidate(); setLexeme(''); onDirtyChange(false); setMessage(`Lagt til: ${changeSet.label}. Utvalget er beholdt.`); onStaged(changeSet);
  };
  const problem = gmiLexemeProblem(validateGmiFieldLexeme(lexeme, view.document.encoding.encodingClass), lexeme);
  const conflicts = plan?.rows?.filter((row) => plan.included.has(row.key) && row.changedBy.length && row.current !== lexeme).length || 0;
  const detail = inspected ? getGmiProposedState(view.session).dataset?.[inspected.scope === 'line' ? 'lines' : 'points']?.[inspected.sourceIndex] : null;
  const inspectedReview = inspected && review ? [...review.preview.rows, ...review.preview.skippedRows].find((row) => row.scope === inspected.scope && row.sourceIndex === inspected.sourceIndex) : null;
  return <section className="gmi-edit-editor gmi-batch-inspector" data-gmi-batch-inspector aria-label="Masseendring av valgte objekter" aria-busy={busy}>
    <div className="flex items-center justify-between gap-2"><h2>Masseendring · {selection?.keys.length || 0} valgt</h2><button className={control} onClick={onRequestClose}>Avslutt</button></div>
    {!scopeProblem.ok && <p role="alert">{scopeProblem.code === 'line-only' ? 'SDR, Trykklasse og Ringstivhet støttes bare for ledninger. Velg ledninger for å fortsette.' : 'Velg objekter fra den aktive kilden for å fortsette.'}</p>}
    <details open={!review} className="gmi-inspector-configuration"><summary>{review ? `${review.preview.eligibility.field} → ${review.preview.lexeme} · Endre oppsett` : 'Oppsett'}</summary>
    <form onSubmit={(event) => { event.preventDefault(); calculate(); }} className="gmi-inspector-config">
      <label>Felt<select aria-label="Felt for masseendring" value={field} disabled={busy} onChange={(event) => { invalidate(); setField(event.target.value); }}>{GMI_BATCH_FIELDS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
      <label>Ny verdi<input aria-label="Ny verdi" value={lexeme} autoComplete="off" spellCheck={false} aria-invalid={Boolean(problem)} onChange={(event) => { invalidate(); setLexeme(event.target.value); }} /></label>
      <fieldset className="gmi-batch-modes"><legend>Hvordan skal verdien brukes?</legend>
        {[['fill-missing', 'Fyll manglende verdier'], ['overwrite', 'Overskriv eksisterende verdier']].map(([value, label]) => <label key={value}><input type="radio" name="inspector-batch-mode" checked={mode === value} onChange={() => { invalidate(); setMode(value); }} /> {label}</label>)}
      </fieldset>
      {problem && <p role="alert" className="gmi-edit-problem">{problem}</p>}
      <button className={primary} disabled={busy || !scopeProblem.ok || Boolean(problem) || !lexeme.trim()}>{busy ? 'Beregner…' : 'Beregn utvalg'}</button>
    </form>
    </details>
    {stale && <p role="alert" className="gmi-edit-message">{stale === 'expanded' ? 'Utvalget er utvidet – beregn på nytt.' : 'Utvalget eller økten er endret – beregn på nytt.'}</p>}
    {stale && <button className={primary} disabled={busy || !scopeProblem.ok || Boolean(problem) || !lexeme.trim()} onClick={calculate}>Beregn utvalget på nytt</button>}
    {plan?.counts && <>
      <div className="gmi-batch-counts" data-gmi-batch-counts aria-live="polite">{Object.entries({ Valgt: plan.counts.selected, Kvalifisert: plan.counts.eligible, 'Hoppes over': plan.counts.skipped, 'Manuelt inkludert': plan.counts.manual, Endres: plan.counts.changed, Uendret: plan.counts.unchanged, 'Nye FEIL': plan.counts.newErrors }).map(([label, count]) => <span key={label}>{label}: {count}</span>)}</div>
      <details className="gmi-edit-muted"><summary>Gjennomgang i datatabellen</summary>Se status, eksakte verdier og funn i datatabellen. Klikk en rad for å inspisere objektet. Nye funn er rådgivende; NYTT-år på tvers av objekter kontrolleres separat.</details>
      <label className="gmi-edit-check"><input type="checkbox" checked={advanced} onChange={(event) => { setRisk(null); setReplace(false); setAdvanced(event.target.checked); setManual(new Set()); }} />Tillat manuelt utvalg utenfor Validatorens anbefaling</label>
      {advanced && <p className="gmi-edit-muted">Bruk «Inkluder manuelt» per objekt i tabellen. Manuelle tillegg kan gi FEIL.</p>}
      {conflicts > 0 && <label className="gmi-edit-check"><input type="checkbox" checked={replace} onChange={(event) => { setRisk(null); setReplace(event.target.checked); }} />Erstatt tidligere rettinger for {conflicts} valgte objekter</label>}
      <p className="gmi-edit-muted">{plan.ok ? plan.changeSet.counts.populatedOverwrites : 0} utfylte verdier overskrives.</p>
    </>}
    <button className={primary} disabled={busy || Boolean(stale) || !plan?.ok || !plan.changeSet.cells.length || (conflicts > 0 && !replace)} onClick={() => stage()}>Legg til masseendring</button>
    {message && <p role="status" className="gmi-edit-message">{message}</p>}
    {inspected && detail && <details open className="gmi-batch-object-detail"><summary>{describeGmiObject(inspected.scope, inspected.sourceIndex, detail.id)} · Foreslått nå · skrivebeskyttet</summary>
      <button className={control} onClick={onInspectClose}>Tilbake til masseendringen</button>
      {inspectedReview && <><p>{inspectedReview.explanation}</p><p>Forhåndsvisning: {review.preview.eligibility.field} → «{review.preview.lexeme}»</p>
        <ul>{[...inspectedReview.findings, ...inspectedReview.otherFindings].map((finding) => <li key={finding.key} data-validation-tone={finding.state === 'FAIL' ? 'error' : 'warning'} style={{ color: 'var(--validation-text)' }}>{finding.state === 'FAIL' ? 'FEIL' : 'SJEKK'}{finding.batchIntroduced ? ' (ny)' : ''}: {finding.reason}</li>)}</ul></>}
      <dl>{Object.entries(detail.attributes).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{detail.attributes[GMI_SOURCE_LEXEMES]?.[key] ?? String(value ?? '')}</dd></div>)}</dl>
    </details>}
    {risk && <GmiConfirmDialog testId="batch-risk" title={risk.changeSet.eligibility.manualOverrides.length ? 'Bekreft manuelt overstyrt masseendring' : 'Bekreft overskriving og erstatning'} confirmLabel="Godkjenn og legg til" cancelLabel="Tilbake til utvalget" destructive={false} onCancel={() => setRisk(null)} onConfirm={() => stage(risk)}>
      <p><strong>{risk.review.preview.eligibility.field} → «{risk.review.preview.lexeme}»</strong></p>
      <p>{risk.changeSet.cells.length} objekter endres. {risk.changeSet.eligibility.manualOverrides.length} manuelt inkludert utenfor Validatorens anbefaling; dette kan gi FEIL.</p>
      <p>{risk.changeSet.counts.populatedOverwrites} utfylte verdier overskrives. {risk.changeSet.counts.overwritten} tidligere rettinger erstattes.</p>
      <ul>{risk.changeSet.eligibility.manualOverrides.map((row) => <li key={row.key}>{describeGmiObject(row.scope, row.sourceIndex, row.objectId)}: {gmiSkipReasonLabel(row.reason)}</li>)}</ul>
      <p>{plan?.counts.newErrors || 0} objekter får nye FEIL. Kontroller de merkede funnene i tabellen før godkjenning.</p>
      <ul>{risk.findings.map((finding) => <li key={finding.key}>{finding.count} × {finding.state === 'FAIL' ? 'FEIL' : 'SJEKK'}{finding.batchIntroduced ? ' (ny)' : ''}: {finding.reason}</li>)}</ul>
    </GmiConfirmDialog>}
  </section>;
}
