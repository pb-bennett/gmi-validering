'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { validateGmiFieldLexeme } from '@/lib/gmi-edit/index.mjs';
import { GMI_BATCH_FIELDS, prepareGmiBatchReview, initialGmiBatchSelection, buildGmiBatchSelection } from '@/lib/gmiEditBatchView.mjs';
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
      setPreview(result); setSelected(initialGmiBatchSelection(result)); setReplace(false); setQuery(''); setOnlyNewErrors(false); setPage(0); setStep('select');
    } catch { setMessage('Utvalget kunne ikke beregnes. Prøv igjen.'); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const confirm = () => {
    const current = gmiEditSessions.getSession(view.handle);
    const result = current.ok ? buildGmiBatchSelection(current.session, preview, selected, replace) : current;
    if (!result.ok) { setMessage(gmiEditMessage(result.code || result.rejections?.[0]?.code)); return; }
    setReview(result.changeSet); setStep('confirm'); setPage(0); setQuery(''); setOnlyNewErrors(false);
  };
  const stage = () => {
    if (gmiEditSessions.getSession(view.handle).session !== preview.session) { setMessage('Utvalget er utdatert. Beregn og se gjennom på nytt.'); return; }
    const result = gmiEditSessions.stage(view.handle, review);
    if (!result.ok) { setMessage(gmiEditMessage(result.code)); return; }
    onDirtyChange(false); onStaged(review); reset();
  };
  const selectedRows = preview ? preview.rows.filter((row) => selected.has(row.key)) : [];
  const conflicts = selectedRows.filter((row) => row.changedBy.length && row.current !== lexeme);
  const appliedKeys = new Set(review?.cells.map((cell) => cell.key) || []);
  const inspectedRows = preview ? (step === 'confirm' ? selectedRows.filter((row) => appliedKeys.has(row.key)) : preview.rows) : [];
  const hasNewErrors = (row) => row.findings.some((finding) => finding.state === 'FAIL' && finding.batchIntroduced);
  const shown = inspectedRows.filter((row) => (!onlyNewErrors || hasNewErrors(row))
    && `${describeGmiObject(row.scope, row.sourceIndex, row.objectId)} ${gmiObjectContext(row.object.attributes)} ${row.guid || ''}`.toLowerCase().includes(query.toLowerCase()));
  const skipped = preview?.eligibility.counts.skippedByReason || {};
  return <>
    <dialog ref={dialogRef} className="gmi-edit-dialog gmi-batch-dialog" aria-labelledby={headingId} data-gmi-batch-step={step} aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); cancel(); }}>
      <header className="gmi-batch-header"><div><h2 id={headingId}>Masseendringer</h2><p className="gmi-edit-muted">1. Velg verdi · 2. Se gjennom utvalg · 3. Bekreft</p></div>
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
            <span>Valgt: {selected.size}</span><span>Utelatt av deg: {preview.rows.length - selected.size}</span>
            <span>Hoppet over: {preview.eligibility.counts.skipped}</span>
            {Object.entries(skipped).map(([reason, count]) => <span key={reason}>{skipLabel(reason)}: {count}</span>)}
            <span>Tidligere rettet felt: {preview.eligibility.counts.previouslyChanged}</span>
          </div>
          {step === 'select' && <div className="gmi-batch-tools">
            <button type="button" className={control} disabled={stale} onClick={() => setSelected(new Set(preview.rows.map((row) => row.key)))}>Velg alle kvalifiserte</button>
            <button type="button" className={control} onClick={() => setSelected(new Set())}>Velg ingen</button>
            <span>{selectedRows.filter((row) => row.overwrite && row.current !== lexeme).length} utfylte verdier overskrives</span>
          </div>}
          {conflicts.length > 0 && <label className="gmi-edit-confirm"><input type="checkbox" checked={replace} disabled={step === 'confirm'} onChange={(event) => setReplace(event.target.checked)} />
            Erstatt tidligere rettinger for {conflicts.length} valgte objekter</label>}
          {step === 'confirm' && <p className="gmi-edit-note"><strong>{review.cells.length} objekter endres i én retting.</strong> {review.cells.filter((cell) => cell.overwritesPopulated).length} utfylte verdier overskrives.
            {' '}{review.unchanged.length} valgte objekter har allerede ny verdi. Opprettet: {new Date(review.createdAt).toLocaleString('nb-NO')}.
            {' '}FEIL/SJEKK under er rådgivende. Nye FEIL er merket per objekt. NYTT-år på tvers av objekter vurderes ikke lokalt.</p>}
          {step === 'confirm' && review.skipped.length > 0 && <p className="gmi-edit-message" data-tone="warning">Hoppes også over i valgt utvalg: {Object.entries(review.skipped.reduce((counts, cell) => ({ ...counts, [cell.reason]: (counts[cell.reason] || 0) + 1 }), {}))
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
              {row.changedBy.length > 0 && <small>Tidligere rettet: {row.changedBy.join(', ')}</small>}
              {!selected.has(row.key) && <small>Utelatt fra utvalget</small>}</th>
            <td><Lexeme value={row.original} /></td><td><Lexeme value={row.current} /></td><td><Lexeme value={preview.lexeme} />
              {row.overwrite && <small>Overskriver utfylt verdi</small>}<Warnings findings={row.findings} />
              {row.otherFindings.length > 0 && <details><summary>Andre objektfunn ({row.otherFindings.length})</summary><Warnings findings={row.otherFindings} /></details>}</td>
          </tr>)}</tbody></table>{!shown.length && <p className="gmi-edit-empty">Ingen objekter i utvalget.</p>}</div>
          <div className="gmi-batch-tools"><button type="button" className={control} disabled={page === 0} onClick={() => setPage(page - 1)}>Forrige side</button>
            <span>{shown.length ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, shown.length)} av {shown.length}</span>
            <button type="button" className={control} disabled={(page + 1) * PAGE_SIZE >= shown.length} onClick={() => setPage(page + 1)}>Neste side</button></div>
          <details><summary>Hvorfor hoppes objekter over? ({preview.eligibility.skipped.length})</summary>
            <SkippedObjects entries={preview.eligibility.skipped} />
          </details>
        </>}
      </div>
      <footer className="gmi-batch-footer">
        <button type="button" className={control} onClick={cancel}>Avbryt</button>
        {step !== 'configure' && <button type="button" className={control} onClick={() => { setStep(step === 'confirm' ? 'select' : 'configure'); setReview(null); }}>Tilbake</button>}
        {busy ? <span role="status">Beregner utvalg og objektkontroll…</span>
          : stale ? <button type="button" className={primary} onClick={calculate}>Beregn utvalget på nytt</button>
            : step === 'configure' ? <button type="submit" form="gmi-batch-config" className={primary} disabled={Boolean(problem) || !lexeme.trim()}>Beregn utvalg</button>
              : step === 'select' ? <button type="button" className={primary} disabled={!selected.size || (conflicts.length > 0 && !replace)} onClick={confirm}>Se gjennom masseendringen</button>
                : <button type="button" className={primary} disabled={!review.cells.length} onClick={stage}>Legg til masseendring</button>}
      </footer>
    </dialog>
    {cancelOpen && <GmiConfirmDialog title="Forkaste masseendringen?" confirmLabel="Forkast skjemaet" onCancel={() => setCancelOpen(false)} onConfirm={reset} testId="batch-cancel">
      <p>Verdien og utvalget er ikke lagt til som retting. Forkaster du skjemaet, beholdes tidligere rettinger.</p>
    </GmiConfirmDialog>}
  </>;
}

function SkippedObjects({ entries }) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const rows = entries.filter((row) => `${describeGmiObject(row.scope, row.sourceIndex, row.objectId)} ${skipLabel(row.reason)}`.toLowerCase().includes(query.toLowerCase()));
  return <div><input aria-label="Søk i objekter som hoppes over" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
    <ul>{rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((entry, index) => <li key={entry.key || index}>{describeGmiObject(entry.scope, entry.sourceIndex, entry.objectId)} · {skipLabel(entry.reason)}{entry.changedBy?.length ? ' · Tidligere rettet' : ''}</li>)}</ul>
    <button type="button" className={control} disabled={!page} onClick={() => setPage(page - 1)}>Forrige</button> {rows.length} objekter
    <button type="button" className={control} disabled={(page + 1) * PAGE_SIZE >= rows.length} onClick={() => setPage(page + 1)}>Neste</button>
  </div>;
}
