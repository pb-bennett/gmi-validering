'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { validateGmiFieldLexeme } from '@/lib/gmi-edit/index.mjs';
import { GMI_BATCH_FIELDS, prepareGmiBatchReview, initialGmiBatchSelection, buildGmiBatchSelection, canManuallySelectGmiBatchRow } from '@/lib/gmiEditBatchView.mjs';
import { describeGmiObject, gmiObjectContext, gmiEditMessage, gmiLexemeProblem, gmiSkipReasonLabel } from '@/lib/gmiEditView.mjs';
import PhotoIconButton from '@/components/photos/PhotoIconButton';
import GmiConfirmDialog from './GmiConfirmDialog';
import { Lexeme } from './GmiObjectEditor';

const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-3 py-1.5 text-xs';
const primary = 'gmi-primary-control gmi-focus-ring px-3 py-1.5 text-xs';
const PAGE_SIZE = 50;
// M2 eligibility considers current proposals; do not call every populated value "delivered".
const skipLabel = (reason) => reason === 'populated' ? 'Allerede utfylt (original eller foreslått)' : gmiSkipReasonLabel(reason);

function Warnings({ findings }) {
  return findings.map((finding) => <span key={finding.key} className="gmi-batch-warning" data-validation-tone={finding.state === 'FAIL' ? 'error' : 'warning'}>
    <WarningCircleIcon size={16} aria-hidden="true" />
    <span><strong>{finding.state === 'FAIL' ? 'FEIL' : 'SJEKK'}{finding.batchIntroduced ? ' · Nytt i denne masseendringen' : ''}</strong> · {finding.reason}</span>
  </span>);
}

export default function GmiBatchDialog({ view, onClose, onDirtyChange, onStaged, registerReset }) {
  'use no memo';
  const dialogRef = useRef(null), headingId = useId(), generation = useRef(0);
  const [field, setField] = useState('sdr'), [lexeme, setLexeme] = useState(''), [mode, setMode] = useState('fill-missing');
  const [preview, setPreview] = useState(null), [selected, setSelected] = useState(new Set());
  const [step, setStep] = useState('configure'), [busy, setBusy] = useState(false), [message, setMessage] = useState(null);
  const [query, setQuery] = useState(''), [page, setPage] = useState(0), [replace, setReplace] = useState(false), [review, setReview] = useState(null);
  const [onlyNewErrors, setOnlyNewErrors] = useState(false);
  const [advanced, setAdvanced] = useState(false), [riskOpen, setRiskOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const dirty = Boolean(lexeme || preview || mode !== 'fill-missing' || field !== 'sdr');
  const stale = Boolean(preview && preview.session !== view.session);
  const reset = () => { generation.current++; onClose(); };
  useEffect(() => { registerReset(reset); return () => registerReset(null); });
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement;
    dialog.showModal();
    return () => {
      // This is an async request generation counter, not a DOM ref captured by the effect.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      dialog.close(); if (opener?.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    if (!dirty) return undefined;
    const listener = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);
  const cancel = () => { if (dirty) setCancelOpen(true); else reset(); };
  const problem = gmiLexemeProblem(validateGmiFieldLexeme(lexeme, view.document.encoding.encodingClass), lexeme);
  const calculate = async () => {
    const token = ++generation.current;
    const basis = gmiEditSessions.getSession(view.handle);
    if (!basis.ok || basis.session !== view.session) { setMessage('Økten er endret. Åpne masseendringer på nytt.'); return; }
    setBusy(true); setMessage(null); setReview(null); if (preview) setStep('select');
    try {
      const result = await prepareGmiBatchReview(view, { canonicalFieldId: field, mode, lexeme }, {
        isLive: () => token === generation.current && gmiEditSessions.getSession(view.handle).session === view.session,
      });
      if (token !== generation.current) return;
      if (!result.ok) { setMessage(result.code === 'field-absent' ? 'Feltet mangler i originalfilen. Masseendringen kan ikke opprette kolonnen.'
        : result.code === 'field-binding-unresolved' ? 'Feltkoblingen er tvetydig eller uavklart. Ingen objekter kan endres.' : gmiEditMessage(result.code)); return; }
      setPreview(result); setSelected(preview ? new Set() : initialGmiBatchSelection(result)); setAdvanced(false); setReplace(false); setQuery(''); setOnlyNewErrors(false); setPage(0); setStep('select');
    } catch { setMessage('Utvalget kunne ikke beregnes. Prøv igjen.'); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const stage = (changeSet) => {
    if (gmiEditSessions.getSession(view.handle).session !== preview.session) { setRiskOpen(false); setMessage('Utvalget er utdatert. Beregn og se gjennom på nytt.'); return; }
    const result = gmiEditSessions.stage(view.handle, changeSet);
    if (!result.ok) { setMessage(gmiEditMessage(result.code)); return; }
    onDirtyChange(false); onStaged(changeSet); reset();
  };
  const confirm = () => {
    const current = gmiEditSessions.getSession(view.handle);
    const result = current.ok ? buildGmiBatchSelection(current.session, preview, selected, replace, undefined, advanced) : current;
    if (!result.ok) { setMessage(gmiEditMessage(result.code || result.rejections?.[0]?.code)); return; }
    if (result.changeSet.eligibility.manualOverrides.length || result.changeSet.counts.populatedOverwrites || result.changeSet.counts.overwritten) {
      setReview(result.changeSet); setRiskOpen(true);
    } else stage(result.changeSet);
  };
  const plan = useMemo(() => preview && selected.size && !stale ? buildGmiBatchSelection(view.session, preview, selected, replace, undefined, advanced) : null,
    [view.session, preview, selected, replace, advanced, stale]);
  const planned = plan?.ok ? plan.changeSet : null;
  const selectedRows = preview ? [...preview.rows, ...preview.skippedRows].filter((row) => selected.has(row.key)) : [];
  const conflicts = selectedRows.filter((row) => row.changedBy.length && row.current !== lexeme);
  const inspectedRows = preview ? [...preview.rows, ...preview.skippedRows.filter((row) => selected.has(row.key))] : [];
  const hasNewErrors = (row) => row.findings.some((finding) => finding.state === 'FAIL' && finding.batchIntroduced);
  const shown = inspectedRows.filter((row) => (!onlyNewErrors || hasNewErrors(row))
    && `${describeGmiObject(row.scope, row.sourceIndex, row.objectId)} ${gmiObjectContext(row.object.attributes)} ${row.guid || ''}`.toLowerCase().includes(query.toLowerCase()));
  const riskCellKeys = new Set(review?.cells.map((cell) => cell.key) || []);
  const riskFindings = selectedRows.filter((row) => riskCellKeys.has(row.key)).flatMap((row) => row.findings)
    .reduce((groups, finding) => { const previous = groups.get(finding.key); groups.set(finding.key, { ...finding, count: (previous?.count || 0) + 1 }); return groups; }, new Map());
  return <>
    <dialog ref={dialogRef} className="gmi-edit-dialog gmi-batch-dialog" aria-labelledby={headingId} data-gmi-batch-step={step} aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); cancel(); }}>
      <header className="gmi-batch-header"><div><h2 id={headingId}>Masseendringer</h2><p className="gmi-edit-muted">1. Velg verdi · 2. Se gjennom og bekreft</p></div>
        <PhotoIconButton icon={XIcon} label="Lukk masseendringer" onClick={cancel} /></header>
      <div className="gmi-batch-content">
        <p className="gmi-edit-muted">Originalfilen endres ikke. Godkjente verdier legges til som én reverserbar retting.</p>
        {stale && <p className="gmi-edit-message" data-tone="error" role="alert">Utvalget er utdatert fordi rettinger eller kildegrunnlaget er endret. Beregn utvalget på nytt og se gjennom igjen.</p>}
        {message && <p role="alert" className="gmi-edit-message" data-tone="error">{message}</p>}
        {step === 'configure' ? <form id="gmi-batch-config" onSubmit={(event) => { event.preventDefault(); calculate(); }}>
          <div className="gmi-batch-config">
            <label>Felt<select aria-label="Felt for masseendring" value={field} onChange={(event) => setField(event.target.value)} disabled={busy}>
              {GMI_BATCH_FIELDS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select></label>
            <label>Ny verdi<input aria-label="Ny verdi" value={lexeme} onChange={(event) => setLexeme(event.target.value)} disabled={busy} autoComplete="off" spellCheck={false} aria-invalid={Boolean(problem)} /></label>
          </div>
          {problem && <p role="alert" className="gmi-edit-problem">{problem}</p>}
          <fieldset className="gmi-batch-modes"><legend>Hvordan skal verdien brukes?</legend>
            <label><input type="radio" name="batch-mode" value="fill-missing" checked={mode === 'fill-missing'} disabled={busy} onChange={() => setMode('fill-missing')} /> Fyll manglende verdier</label>
            <label><input type="radio" name="batch-mode" value="overwrite" checked={mode === 'overwrite'} disabled={busy} onChange={() => setMode('overwrite')} /> Overskriv utfylte verdier</label>
          </fieldset>
          {mode === 'overwrite' && <p className="gmi-edit-message" data-tone="error"><strong>Overskriving:</strong> Utfylte verdier kan erstattes. Kontroller hvert objekt og godkjenn eventuelle konflikter med tidligere rettinger.</p>}
          <p className="gmi-edit-muted">Du velger verdien selv. Anvendelighet og uavklarte objekter avgjøres av Validator-reglene.</p>
        </form> : preview && <>
          <p><strong>{preview.eligibility.field} → {preview.lexeme}</strong> · {preview.mode === 'overwrite' ? 'Overskriv utfylte verdier' : 'Fyll manglende verdier'}</p>
          <div className="gmi-batch-counts" aria-live="polite">
            <span>Undersøkt: {preview.eligibility.counts.total}</span><span>Kvalifisert: {preview.rows.length}</span>
            <span>Valgt: {selected.size}</span><span>Utelatt av deg: {preview.rows.filter((row) => !selected.has(row.key)).length}</span>
            <span>Hoppet over: {preview.skippedRows.filter((row) => !selected.has(row.key)).length}</span>
            <span>Tidligere rettet felt: {preview.eligibility.counts.previouslyChanged}</span>
          </div>
          {step === 'select' && <div className="gmi-batch-tools">
            <button type="button" className={control} disabled={stale} onClick={() => setSelected(new Set(preview.rows.map((row) => row.key)))}>Velg alle kvalifiserte</button>
            <button type="button" className={control} onClick={() => setSelected(new Set())}>Velg ingen</button>
          </div>}
          {conflicts.length > 0 && <label className="gmi-edit-confirm"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />
            Erstatt tidligere rettinger for {conflicts.length} valgte objekter</label>}
          <p className="gmi-edit-note" aria-live="polite"><strong>{planned?.cells.length || 0} objekter endres i én retting.</strong> {planned?.counts.populatedOverwrites || 0} utfylte verdier overskrives.
            {' '}{planned?.unchanged.length || 0} valgte objekter har allerede ny verdi.
            {' '}FEIL/SJEKK under er rådgivende. Nye FEIL er merket per objekt. NYTT-år på tvers av objekter vurderes ikke lokalt.</p>
          {planned?.skipped.length > 0 && <p className="gmi-edit-message" data-tone="warning">Hoppes også over i valgt utvalg: {Object.entries(planned.skipped.reduce((counts, cell) => ({ ...counts, [cell.reason]: (counts[cell.reason] || 0) + 1 }), {}))
            .map(([reason, count]) => `${skipLabel(reason)}: ${count}`).join(' · ')}</p>}
          <label className="gmi-edit-check"><input type="checkbox" checked={onlyNewErrors} onChange={(event) => { setOnlyNewErrors(event.target.checked); setPage(0); }} />
            Vis bare objekter med nye FEIL ({inspectedRows.filter(hasNewErrors).length})</label>
          <label className="gmi-batch-search">Søk i utvalget<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Objektnummer, tema, material eller GUID" /></label>
          <div className="gmi-batch-table-scroll"><table className="gmi-edit-review-table gmi-batch-table" data-selection={step === 'select'}><thead><tr>
            {step === 'select' && <th>Ta med</th>}<th>Objekt / Tema / Material</th><th>Original</th><th>Foreslått nå</th><th>Ny verdi / Validator</th>
          </tr></thead><tbody>{shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row) => <tr key={row.key} data-batch-object={row.key}>
            {step === 'select' && <td><input type="checkbox" aria-label={`Ta med ${describeGmiObject(row.scope, row.sourceIndex, row.objectId)}`} checked={selected.has(row.key)} disabled={stale}
              onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(row.key); else next.delete(row.key); return next; })} /></td>}
            <th scope="row">{describeGmiObject(row.scope, row.sourceIndex, row.objectId)}<small>{gmiObjectContext(row.object.attributes)}</small>
              {row.reason && <small className="gmi-edit-badge gmi-edit-badge-warning">Manuelt overstyrt · {skipLabel(row.reason)}</small>}
              {row.changedBy.length > 0 && <small>Tidligere rettet: {row.changedBy.join(', ')}</small>}
              {!selected.has(row.key) && <small>Utelatt fra utvalget</small>}</th>
            <td><Lexeme value={row.original} /></td><td><Lexeme value={row.current} /></td><td><Lexeme value={preview.lexeme} />
              {row.overwrite && <small>Overskriver utfylt verdi</small>}<Warnings findings={row.findings} />
              {row.otherFindings.length > 0 && <details><summary>Andre objektfunn ({row.otherFindings.length})</summary><Warnings findings={row.otherFindings} /></details>}</td>
          </tr>)}</tbody></table>{!shown.length && <p className="gmi-edit-empty">Ingen objekter i utvalget.</p>}</div>
          <div className="gmi-batch-tools"><button type="button" className={control} disabled={page === 0} onClick={() => setPage(page - 1)}>Forrige side</button>
            <span>{shown.length ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, shown.length)} av {shown.length}</span>
            <button type="button" className={control} disabled={(page + 1) * PAGE_SIZE >= shown.length} onClick={() => setPage(page + 1)}>Neste side</button></div>
          <label className="gmi-edit-check"><input type="checkbox" data-batch-advanced checked={advanced} disabled={stale || busy} onChange={(event) => {
            setAdvanced(event.target.checked); setReplace(false);
            if (!event.target.checked) setSelected(new Set(preview.rows.filter((row) => selected.has(row.key)).map((row) => row.key)));
          }} /> Avansert: Tillat manuelt utvalg utenfor Validatorens anbefaling</label>
          {advanced && <div className="gmi-batch-tools"><p className="gmi-edit-message" data-tone="warning">Manuelle tillegg kan gi FEIL. Velg objektene uttrykkelig; utfylte verdier krever fortsatt overskrivingsmodus.</p>
            <button type="button" className={control} disabled={stale || busy} onClick={() => setSelected(new Set([...preview.rows, ...preview.skippedRows.filter((row) => canManuallySelectGmiBatchRow(row, preview.mode))].map((row) => row.key)))}>Velg alle teknisk redigerbare i valgt verdimodus</button></div>}
          <SkippedGroups entries={preview.skippedRows} selected={selected} advanced={advanced} mode={preview.mode} stale={stale || busy}
            onToggle={(row, checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(row.key); else next.delete(row.key); return next; })} />
        </>}
      </div>
      <footer className="gmi-batch-footer">
        <button type="button" className={control} onClick={cancel}>Avbryt</button>
        {step !== 'configure' && <button type="button" className={control} disabled={busy} onClick={() => { setStep('configure'); setReview(null); setPreview(null); setSelected(new Set()); setAdvanced(false); setReplace(false); }}>Tilbake</button>}
        {busy ? <span role="status">Beregner utvalg og objektkontroll…</span>
          : stale ? <button type="button" className={primary} onClick={calculate}>Beregn utvalget på nytt</button>
            : step === 'configure' ? <button type="submit" form="gmi-batch-config" className={primary} disabled={Boolean(problem) || !lexeme.trim()}>Beregn utvalg</button>
              : <button type="button" className={primary} disabled={!planned?.cells.length || (conflicts.length > 0 && !replace)} onClick={confirm}>Legg til masseendring</button>}
      </footer>
    </dialog>
    {riskOpen && review && <GmiConfirmDialog title={review.eligibility.manualOverrides.length ? 'Bekreft manuelt overstyrt masseendring' : 'Bekreft overskriving og erstatning'}
      testId="batch-risk" destructive={false} cancelLabel="Tilbake til utvalget" confirmLabel="Godkjenn og legg til" onCancel={() => setRiskOpen(false)} onConfirm={() => stage(review)}>
      <p><strong>{preview.eligibility.field} → {preview.lexeme}</strong> · {review.cells.length} objekter.</p>
      {review.eligibility.manualOverrides.length > 0 && <p>{review.eligibility.manualOverrides.length} objekter er manuelt inkludert utenfor Validatorens anbefaling. Dette kan føre til FEIL i leveransen.</p>}
      <p>{review.counts.populatedOverwrites} utfylte verdier overskrives. {review.counts.overwritten} tidligere rettinger i felt erstattes.</p>
      <ul>{Object.entries(review.eligibility.manualOverrides.reduce((counts, row) => ({ ...counts, [row.reason]: (counts[row.reason] || 0) + 1 }), {})).map(([reason, count]) => <li key={reason}>{skipLabel(reason)}: {count}</li>)}</ul>
      <p>{selectedRows.filter((row) => row.findings.some((finding) => finding.batchIntroduced && finding.state === 'FAIL')).length} valgte objekter får nye FEIL. Se de merkede funnene i utvalget før du godkjenner.</p>
      <div className="gmi-batch-risk-findings">{[...riskFindings.values()].map((finding) => <div key={finding.key}><span>{finding.count} objekter:</span><Warnings findings={[finding]} /></div>)}</div>
      {stale && <p role="alert">Utvalget er utdatert. Gå tilbake og beregn på nytt.</p>}
    </GmiConfirmDialog>}
    {cancelOpen && <GmiConfirmDialog title="Forkaste masseendringen?" confirmLabel="Forkast skjemaet" onCancel={() => setCancelOpen(false)} onConfirm={reset} testId="batch-cancel">
      <p>Verdien og utvalget er ikke lagt til som retting. Forkaster du skjemaet, beholdes tidligere rettinger.</p>
    </GmiConfirmDialog>}
  </>;
}

function SkippedGroups({ entries, ...props }) {
  const groups = Object.groupBy(entries, (row) => row.reason);
  return <section aria-label="Objekter utenfor automatisk utvalg" className="gmi-batch-groups">
    <h3>Hvorfor hoppes objekter over?</h3>
    {Object.entries(groups).map(([reason, rows]) => <details key={reason} data-skip-group={reason}>
      <summary>{skipLabel(reason)} · {rows.length} objekter{rows.some((row) => props.selected.has(row.key)) ? ` · ${rows.filter((row) => props.selected.has(row.key)).length} manuelt valgt` : ''}</summary>
      <SkippedObjects entries={rows} {...props} />
    </details>)}
  </section>;
}

function SkippedObjects({ entries, selected, advanced, mode, stale, onToggle }) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const rows = entries.filter((row) => `${describeGmiObject(row.scope, row.sourceIndex, row.objectId)} ${gmiObjectContext(row.object.attributes)} ${row.explanation}`.toLowerCase().includes(query.toLowerCase()));
  return <div><input aria-label="Søk i objekter som hoppes over" placeholder="Søk objekt, tema, material eller årsak" className="gmi-batch-group-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
    <div className="gmi-batch-table-scroll"><ul className="gmi-batch-exclusions">{rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row, index) => <li key={row.key || index} data-batch-exclusion={`${row.scope}:${row.sourceIndex}`}>
      <div className="gmi-batch-tools">
        {advanced && <label><input type="checkbox" aria-label={`Ta med manuelt ${describeGmiObject(row.scope, row.sourceIndex, row.objectId)}`}
          checked={selected.has(row.key)} disabled={stale || !canManuallySelectGmiBatchRow(row, mode)} onChange={(event) => onToggle(row, event.target.checked)} /> Ta med manuelt</label>}
        <strong>{describeGmiObject(row.scope, row.sourceIndex, row.objectId)}</strong><span>{gmiObjectContext(row.object.attributes)}</span>
        <PhotoIconButton icon={WarningCircleIcon} size={16} tooltipTone="warning" data-validation-tone="warning" label={row.explanation} tooltip={row.explanation} />
      </div>
      <p>Original: <Lexeme value={row.original} empty={row.key ? 'tom' : 'kan ikke leses sikkert'} /> · Foreslått nå: <Lexeme value={row.current} empty={row.key ? 'tom' : 'kan ikke leses sikkert'} /> · Status: {({ NOT_APPLICABLE: 'Ikke anbefalt', UNRESOLVED: 'Uavklart', EXPECTED: 'Usikker / spesiell klasse', APPLICABLE: 'Anvendelig' })[row.applicability] || 'Kan ikke rettes sikkert'}</p>
      <p>{row.explanation}</p>
      {advanced && !canManuallySelectGmiBatchRow(row, mode) && <p className="gmi-edit-muted">{row.key && ['not-applicable', 'unresolved', 'populated'].includes(row.reason) ? 'Utfylte originalverdier eller foreslåtte verdier krever overskrivingsmodus.' : 'Teknisk sperre: kildestrukturen kan ikke overstyres.'}</p>}
      {selected.has(row.key) && <p className="gmi-edit-badge gmi-edit-badge-warning">Manuelt overstyrt · {skipLabel(row.reason)}</p>}
      <Warnings findings={row.currentFindings.filter((finding) => finding.fields.includes(row.field))} />
      {advanced && <div><p className="gmi-edit-muted">Validator ved ny verdi:</p><Warnings findings={row.findings} /></div>}
      <details><summary>Inspiser attributter og øvrige funn</summary>
        <div className="gmi-batch-table-scroll"><table className="gmi-edit-review-table"><thead><tr><th>Felt</th><th>Foreslått nå</th></tr></thead>
          <tbody>{row.values.filter((cell) => cell.field).map((cell) => <tr key={cell.field}><th>{cell.field}</th><td><Lexeme value={cell.proposed} /></td></tr>)}</tbody></table></div>
        <Warnings findings={row.currentFindings.filter((finding) => !finding.fields.includes(row.field))} />
      </details>
    </li>)}</ul></div>
    <button type="button" className={control} disabled={!page} onClick={() => setPage(page - 1)}>Forrige</button> {rows.length} objekter
    <button type="button" className={control} disabled={(page + 1) * PAGE_SIZE >= rows.length} onClick={() => setPage(page + 1)}>Neste</button>
  </div>;
}
