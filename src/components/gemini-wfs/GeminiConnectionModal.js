'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleNotchIcon, XIcon } from '@phosphor-icons/react';
import { geminiSession } from '@/lib/gemini-wfs/geminiSession.mjs';
import { getGeminiUiError } from '@/lib/gemini-wfs/geminiWorkflowUi.mjs';
import useGeminiSession from './useGeminiSession';
import { normalizeGeminiWfsUrl, validateGeminiConnection, readGeminiConnection, saveGeminiConnection } from '@/lib/gemini-wfs/geminiConnection.mjs';
import { GeminiServiceError } from '@/lib/gemini-wfs/geminiErrors.mjs';

export default function GeminiConnectionModal({ onClose }) {
  const session = useGeminiSession();
  const [initialConnection] = useState(() => session.connection ?? readGeminiConnection());
  const [storageNotice, setStorageNotice] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef(null), formRef = useRef(null);
  const pending = useRef(false), closed = useRef(false);
  const connected = session.connectionStatus === 'connected';
  const busy = submitting || session.status === 'loading';
  const errorText = (error || session.error) ? getGeminiUiError(error || session.error) : null;

  const applyConnection = (form) => {
    try {
      const values = new FormData(form);
      const url = normalizeGeminiWfsUrl(String(values.get('connectionUrl') ?? '').trim());
      const previous = geminiSession.getSnapshot().connection ?? initialConnection;
      const connection = validateGeminiConnection({
        id: previous?.url === url ? previous.id : crypto.randomUUID(),
        name: values.get('connectionName'), url,
      });
      geminiSession.setConnection(connection);
      setStorageNotice(saveGeminiConnection(connection) ? 'Tilkoblingen er lagret i denne nettleseren.' :
        'Tilkoblingen brukes i økten, men kunne ikke lagres i nettleseren.');
      return connection;
    } catch { throw new GeminiServiceError('invalid_connection'); }
  };

  const clearInputs = () => {
    for (const name of ['username', 'password']) {
      const input = formRef.current?.elements.namedItem(name);
      if (input) input.value = '';
    }
  };
  const close = () => {
    closed.current = true;
    if (pending.current || geminiSession.getSnapshot().status === 'loading') geminiSession.cancel();
    clearInputs();
    onClose();
  };
  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closed.current = false;
    dialog.showModal();
    dialog.querySelector('#gemini-va-username')?.focus();
    return () => {
      closed.current = true;
      if (pending.current) geminiSession.cancel();
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (pending.current || geminiSession.getSnapshot().status === 'loading') return;
    pending.current = true; setSubmitting(true); setError(null);
    try {
      applyConnection(event.currentTarget);
      // Native values also work when a password manager autofills without a
      // React change event. Credentials never become React/global UI state.
      {
        const values = new FormData(event.currentTarget);
        const username = values.get('username'), password = values.get('password');
        if (username || password || geminiSession.getSnapshot().connectionStatus !== 'connected') {
          geminiSession.setCredentials({ username, password });
        }
      }
      const outcome = await geminiSession.fetch();
      if (!closed.current) {
        clearInputs();
        if (outcome.ok) { pending.current = false; onClose(); }
        else setError(outcome.error);
      }
    } catch (failure) {
      if (!closed.current) { clearInputs(); setError(failure); }
    } finally {
      pending.current = false;
      if (!closed.current) setSubmitting(false);
    }
  };

  return <dialog ref={dialogRef} aria-labelledby="gemini-va-heading" aria-describedby="gemini-va-description"
    onCancel={(event) => { event.preventDefault(); close(); }}
    className="m-auto max-h-[90dvh] w-[min(94vw,440px)] overflow-y-auto rounded-xl border border-gmi-border-strong bg-gmi-surface p-0 text-gmi-text shadow-xl backdrop:bg-gmi-ink/60">
    <header className="flex items-center justify-between border-b border-gmi-border p-4">
      <h2 id="gemini-va-heading" className="text-lg font-semibold text-gmi-navy">Gemini WFS</h2>
      <button type="button" onClick={close} aria-label="Lukk Gemini WFS" title="Lukk Gemini WFS"
        className="gmi-compact-button gmi-focus-ring p-1"><XIcon size={20} weight="regular" aria-hidden="true" /></button>
    </header>
    <form ref={formRef} id="gemini-va-connection-form" method="post" onSubmit={submit} aria-busy={busy}
      aria-describedby={errorText ? 'gemini-va-error' : 'gemini-va-description'} className="space-y-3 p-4">
      <p id="gemini-va-description" className="text-xs text-gmi-text-muted">Gemini WFS henter eksisterende VA-anlegg rundt innlastede innmålingslag. Nye innmålingslag legges til automatisk mens tilkoblingen er aktiv. Tilgangen brukes bare i denne økten. Nettleserens passordbehandler kan huske den for deg.</p>
      <div className="space-y-2">
        <label htmlFor="gemini-wfs-connection-name" className="block text-sm font-medium">Tilkoblingsnavn</label>
        <input id="gemini-wfs-connection-name" name="connectionName" defaultValue={initialConnection?.name ?? ''}
          type="text" required maxLength={100} disabled={busy} className="gmi-compact-field w-full px-3 py-2 text-sm" />
        <label htmlFor="gemini-wfs-url" className="block text-sm font-medium">WFS-URL</label>
        <input id="gemini-wfs-url" name="connectionUrl" defaultValue={initialConnection?.url ?? ''}
          type="url" required maxLength={500} disabled={busy} autoComplete="off"
          className="gmi-compact-field w-full px-3 py-2 text-sm" />
        <p className="text-xs text-gmi-text-muted">HTTPS-adresse på en Gemini Suite-vert med stien /portal/api/proxy/map/… .wfs, uten URL-parametere. Navn og URL lagres her; passord lagres ikke av appen.</p>
        <button type="button" disabled={busy} aria-label="Lagre Gemini WFS-tilkobling" className="gmi-compact-button gmi-focus-ring px-2 py-1 text-xs"
          onClick={() => { try { applyConnection(formRef.current); setError(null); } catch (failure) { setError(failure); } }}>Lagre tilkobling</button>
        {storageNotice && <p role="status" className="text-xs text-gmi-text-muted">{storageNotice}</p>}
      </div>
      {connected && <p className="text-xs text-gmi-text-muted">Tilgang er oppgitt for økten. La begge feltene stå tomme for å bruke den, eller fyll ut begge for å bytte bruker.</p>}
      <fieldset disabled={busy} className="space-y-3">
        <div>
          <label htmlFor="gemini-va-username" className="mb-1 block text-sm font-medium">Brukernavn</label>
          <input id="gemini-va-username" name="username" type="text" autoComplete="username" required={!connected} maxLength={256}
            className="gmi-compact-field w-full px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="gemini-va-password" className="mb-1 block text-sm font-medium">Passord</label>
          <input id="gemini-va-password" name="password" type="password" autoComplete="current-password" required={!connected} maxLength={1024}
            className="gmi-compact-field w-full px-3 py-2 text-sm" />
        </div>
      </fieldset>
      {errorText && <p id="gemini-va-error" role="alert" className="rounded-lg border border-gmi-border bg-gmi-surface-soft p-2 text-sm">{errorText}</p>}
      {busy && <p role="status" className="flex items-center gap-2 text-xs text-gmi-text-muted"><CircleNotchIcon size={16} weight="regular" className="animate-spin" aria-hidden="true" />Henter eksisterende anlegg … Lukk for å avbryte.</p>}
      <footer className="flex flex-wrap items-center justify-end gap-2 pt-2">
        {connected && <button type="button" onClick={() => { geminiSession.disconnect(); close(); }} className="gmi-compact-button gmi-focus-ring mr-auto px-2 py-2 text-xs">Koble fra Gemini WFS</button>}
        <button type="button" onClick={close} className="gmi-compact-button gmi-focus-ring px-3 py-2 text-sm">{busy ? 'Avbryt henting' : 'Avbryt'}</button>
        <button type="submit" disabled={busy} className="gmi-primary-control gmi-focus-ring px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">Hent eksisterende anlegg</button>
      </footer>
    </form>
  </dialog>;
}
