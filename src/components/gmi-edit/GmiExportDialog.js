'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { DownloadSimpleIcon, FlaskIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { buildGmiFieldExport, createGmiExportBlob, getGmiExportReadiness, gmiExportNames, recordGmiExportDownload } from '@/lib/gmi-edit/index.mjs';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { describeGmiObject, gmiEditMessage } from '@/lib/gmiEditView.mjs';
import { Lexeme } from './GmiObjectEditor';

const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-3 py-1.5 text-sm';
const primary = 'gmi-primary-control gmi-focus-ring inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium';
const SHOWN_CHANGES = 40;

function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Field-only download of a revised GMI (M3 export service). The summary is
 * taken from the state the dialog opened on; the download is refused if the
 * editing state or the source changed while the file was being prepared.
 * `recordGmiExportDownload` runs only after the browser download was started,
 * and only for that same payload (revision).
 */
export default function GmiExportDialog({ layerId, view, status, onClose }) {
  // Opted out of the React Compiler: it turns optional chains on nullable session views (`view?.x`)
  // into non-optional memo dependencies and crashes before a session exists. Derived values are
  // memoized explicitly per published editing revision instead.
  'use no memo';
  const ref = useRef(null), headingId = useId(), labelId = useId();
  const [label, setLabel] = useState('');
  const [phase, setPhase] = useState('ready');   // ready | building | done | failed
  const [result, setResult] = useState(null);
  const busy = useRef(false);
  const [now] = useState(() => new Date());
  // Bound to the revision the user is looking at.
  const [basis] = useState(() => ({ revision: status?.revision, effectiveKey: gmiEditSessions.effectiveKey(view.handle)?.effectiveKey ?? null }));
  const readiness = useMemo(() => getGmiExportReadiness(gmiEditSessions, view.handle), [view.handle]);
  const names = useMemo(() => { try { return gmiExportNames({ date: now, label }); } catch { return null; } }, [now, label]);

  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, []);

  const changes = view.changedCells;
  const byField = changes.reduce((map, cell) => map.set(cell.field, (map.get(cell.field) || 0) + 1), new Map());

  const download = async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase('building'); setResult(null);
    try {
      const payload = await buildGmiFieldExport(gmiEditSessions, view.handle, { date: new Date(), label });
      if (!payload.ok) { setPhase('failed'); setResult({ text: gmiEditMessage(payload.code, 'Den reviderte filen kunne ikke lages.') }); return; }
      const current = useStore.getState().gmiEditStatus?.[layerId];
      if (payload.effectiveKey !== basis.effectiveKey || current?.revision !== basis.revision) {
        setPhase('failed'); setResult({ text: gmiEditMessage('state-changed') }); return;
      }
      saveFile(createGmiExportBlob(payload), payload.filename);
      const recorded = recordGmiExportDownload(gmiEditSessions, payload);
      setPhase('done');
      setResult({ filename: payload.filename, fingerprint: payload.fingerprint, size: payload.size, identical: payload.identical, recorded: recorded.ok,
        text: recorded.ok ? null : 'Filen ble lastet ned, men rettingene er endret siden. De er fortsatt merket som ikke lastet ned.' });
    } catch {
      setPhase('failed'); setResult({ text: 'Den reviderte filen kunne ikke lages.' });
    } finally { busy.current = false; }
  };

  return <dialog ref={ref} className="gmi-edit-dialog gmi-edit-export" aria-labelledby={headingId} data-export-phase={phase}
    onCancel={(event) => { event.preventDefault(); if (phase !== 'building') onClose(); }}>
    <h2 id={headingId}>Last ned revidert GMI</h2>
    <p className="gmi-edit-experimental"><FlaskIcon size={16} aria-hidden="true" /><span><strong>Eksperimentell.</strong> Reviderte GMI-filer er ennå ikke akseptansetestet i Gemini VA. Kontroller filen før den leveres videre.</span></p>
    <dl className="gmi-edit-export-facts">
      <div><dt>Originalfil</dt><dd>{status?.filename || 'GMI-fil'} (endres ikke)</dd></div>
      <div><dt>Rettinger</dt><dd>{status?.changeSetCount || 0}</dd></div>
      <div><dt>Endrede felt</dt><dd>{status?.changedCells || 0} i {status?.changedObjects || 0} {status?.changedObjects === 1 ? 'objekt' : 'objekter'}</dd></div>
      {byField.size > 0 && <div><dt>Per felt</dt><dd>{[...byField].map(([field, count]) => `${field} (${count})`).join(', ')}</dd></div>}
    </dl>
    {changes.length === 0 ? <p className="gmi-edit-note">Ingen rettinger. Filen blir byte for byte lik originalen.</p>
      : <details className="gmi-edit-export-changes" open={changes.length <= 8}>
        <summary>Endringer som tas med ({changes.length})</summary>
        <table className="gmi-edit-change-cells">
          <thead><tr><th scope="col">Objekt</th><th scope="col">Felt</th><th scope="col">Original</th><th scope="col">Ny verdi</th></tr></thead>
          <tbody>{changes.slice(0, SHOWN_CHANGES).map((cell) => <tr key={cell.key}>
            <td>{describeGmiObject(cell.scope, cell.sourceIndex, cell.objectId)}</td><th scope="row">{cell.field}</th>
            <td><Lexeme value={cell.original} /></td><td><Lexeme value={cell.proposed} /></td></tr>)}</tbody>
        </table>
        {changes.length > SHOWN_CHANGES && <p className="gmi-edit-muted">…og {changes.length - SHOWN_CHANGES} til.</p>}
      </details>}
    <label className="gmi-edit-export-label" htmlFor={labelId}>Valgfri merkelapp i filnavnet
      <input id={labelId} type="text" className="gmi-compact-field px-2 py-1 text-sm" value={label} maxLength={60} disabled={phase === 'building' || phase === 'done'}
        onChange={(event) => setLabel(event.target.value)} />
    </label>
    <p className="gmi-edit-muted">Filnavn: <code data-export-filename>{names?.filename || '—'}</code> (ny fil; originalen overskrives ikke)</p>
    {!readiness.ready && <p className="gmi-edit-message" data-tone="error" role="alert">{readiness.blocking.map((code) => gmiEditMessage(code)).join(' ')}</p>}
    {phase === 'failed' && result?.text && <p className="gmi-edit-message" data-tone="error" role="alert">{result.text}</p>}
    {phase === 'done' && <div className="gmi-edit-message" data-tone="ok" role="status">
      <p>Lastet ned <strong data-downloaded-filename>{result.filename}</strong> ({result.size} byte{result.identical ? ', identisk med originalen' : ''}).</p>
      <p className="gmi-edit-muted">SHA-256: <code data-downloaded-fingerprint>{String(result.fingerprint).replace(/^sha256:/, '')}</code></p>
      {result.text && <p>{result.text}</p>}
    </div>}
    <div className="gmi-edit-actions">
      <button type="button" className={control} disabled={phase === 'building'} onClick={onClose}>{phase === 'done' ? 'Lukk' : 'Avbryt'}</button>
      {phase !== 'done' && <button type="button" className={primary} disabled={!readiness.ready || phase === 'building'} onClick={download}>
        <DownloadSimpleIcon size={16} aria-hidden="true" />{phase === 'building' ? 'Lager fil…' : 'Last ned'}
      </button>}
    </div>
  </dialog>;
}
