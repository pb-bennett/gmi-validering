'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleNotchIcon, XIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { geminiSession } from '@/lib/gemini-wfs/geminiSession.mjs';
import { getGeminiSurveySources, resolveGeminiSourceId, getGeminiUiError } from '@/lib/gemini-wfs/geminiWorkflowUi.mjs';
import useGeminiSession from './useGeminiSession';

export default function GeminiConnectionModal({ onClose, initialSourceId }) {
  const session = useGeminiSession();
  const layers = useStore((state) => state.layers);
  const layerOrder = useStore((state) => state.layerOrder);
  const sources = useMemo(() => getGeminiSurveySources(layers, layerOrder), [layers, layerOrder]);
  // Unsubmitted source choice is a form draft, not a change of result ownership.
  const [draftSourceId, setDraftSourceId] = useState(() => initialSourceId ?? session.source?.sourceLayerId);
  const sourceId = resolveGeminiSourceId(sources, draftSourceId);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef(null), formRef = useRef(null);
  const pending = useRef(false), closed = useRef(false);
  const connected = session.connectionStatus === 'connected';
  const busy = submitting || session.status === 'loading';
  const errorText = (error || session.error) ? getGeminiUiError(error || session.error) : null;

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
    const select = dialog.querySelector('select');
    dialog.querySelector(select.options.length > 1 ? 'select' : '#gemini-va-username')?.focus();
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
    if (pending.current || geminiSession.getSnapshot().status === 'loading' || !sourceId) return;
    pending.current = true; setSubmitting(true); setError(null);
    try {
      // Native values also work when a password manager autofills without a
      // React change event. Credentials never become React/global UI state.
      {
        const values = new FormData(event.currentTarget);
        const username = values.get('username'), password = values.get('password');
        if (username || password || geminiSession.getSnapshot().connectionStatus !== 'connected') {
          geminiSession.setCredentials({ username, password });
        }
      }
      geminiSession.selectSource(sourceId);
      const outcome = await geminiSession.fetch(sourceId);
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
      <h2 id="gemini-va-heading" className="text-lg font-semibold text-gmi-navy">Gemini VA</h2>
      <button type="button" onClick={close} aria-label="Lukk Gemini VA" title="Lukk Gemini VA"
        className="gmi-compact-button gmi-focus-ring p-1"><XIcon size={20} weight="regular" aria-hidden="true" /></button>
    </header>
    <form ref={formRef} id="gemini-va-connection-form" method="post" onSubmit={submit} aria-busy={busy}
      aria-describedby={errorText ? 'gemini-va-error' : 'gemini-va-description'} className="space-y-3 p-4">
      <p id="gemini-va-description" className="text-xs text-gmi-text-muted">Hent eksisterende VA-anlegg rundt en innmålingsfil. Tilgangen brukes bare i denne økten. Nettleserens passordbehandler kan huske den for deg.</p>
      <label htmlFor="gemini-va-source" className="block text-sm font-medium">Innmålingsfil</label>
      <select id="gemini-va-source" name="sourceLayerId" value={sourceId} disabled={busy || !sources.length} required
        onChange={(event) => { setDraftSourceId(event.target.value); setError(null); }}
        className="gmi-compact-field w-full px-3 py-2 text-sm">
        {!sourceId && <option value="">{sources.length ? 'Velg innmålingsfil' : 'Ingen innmålingsfil'}</option>}
        {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
      </select>
      {!sources.length && <p role="status" className="text-xs text-gmi-text-muted">Importer en innmålingsfil i GMI-, SOSI- eller KOF-format først.</p>}
      {connected && <p className="text-xs text-gmi-text-muted">Tilgang er oppgitt for økten. La begge feltene stå tomme for å bruke den, eller fyll ut begge for å bytte bruker.</p>}
      <fieldset disabled={busy || !sourceId} className="space-y-3">
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
      {session.stale && !errorText && <p role="status" className="text-xs text-gmi-text-muted">Innmålingsgrunnlaget er endret. Hent referansen på nytt.</p>}
      {busy && <p role="status" className="flex items-center gap-2 text-xs text-gmi-text-muted"><CircleNotchIcon size={16} weight="regular" className="animate-spin" aria-hidden="true" />Henter eksisterende anlegg … Lukk for å avbryte.</p>}
      <footer className="flex flex-wrap items-center justify-end gap-2 pt-2">
        {connected && <button type="button" onClick={() => { geminiSession.disconnect(); close(); }} className="gmi-compact-button gmi-focus-ring mr-auto px-2 py-2 text-xs">Koble fra Gemini VA</button>}
        <button type="button" onClick={close} className="gmi-compact-button gmi-focus-ring px-3 py-2 text-sm">{busy ? 'Avbryt henting' : 'Avbryt'}</button>
        <button type="submit" disabled={busy || !sourceId} className="gmi-primary-control gmi-focus-ring px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">Hent eksisterende anlegg</button>
      </footer>
    </form>
  </dialog>;
}
