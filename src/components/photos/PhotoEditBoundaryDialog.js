'use client';

import { useEffect, useRef } from 'react';
import './photoEdit.css';

const button = 'gmi-compact-button gmi-focus-ring min-h-9 border px-3 py-1.5 text-sm font-medium';
const photos = (count) => `${count} ${count === 1 ? 'bilde' : 'bilder'}`;

// variant: 'boundary' (an action needs Edit mode to end), 'discard' (Forkast endringer), 'conflict' (commit refused).
// Escape and the default focus always mean "continue editing": a single keypress never discards anything.
export default function PhotoEditBoundaryDialog({ variant = 'boundary', changedCount = 0, staleCount = 0, onSave, onDiscard, onContinue }) {
  const ref = useRef(null), continueRef = useRef(null);
  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement;
    dialog.showModal();
    continueRef.current?.focus();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  const remaining = Math.max(0, changedCount - staleCount);
  const title = variant === 'discard' ? `Forkaste endringer på ${photos(changedCount)}?`
    : variant === 'conflict' ? `${photos(staleCount)} er endret et annet sted siden du begynte`
      : `Du har ulagrede endringer på ${photos(changedCount)}`;
  const body = variant === 'discard' ? 'Alle endringer i denne redigeringen forkastes. Lagrede posisjoner og retninger beholdes uendret.'
    : variant === 'conflict' ? 'Ingenting er lagret. De berørte bildene er endret av et annet verktøy, og de endringene overskrives ikke.'
      : 'Lagre eller forkast endringene før du fortsetter.';
  return <dialog ref={ref} className="photo-edit-boundary" aria-labelledby="photo-edit-boundary-title" aria-describedby="photo-edit-boundary-body"
    onCancel={(event) => { event.preventDefault(); onContinue(); }}>
    <h2 id="photo-edit-boundary-title">{title}</h2>
    <p id="photo-edit-boundary-body">{body}</p>
    <div className="photo-edit-boundary-actions">
      <button ref={continueRef} type="button" className={`${button} border-gmi-border-strong bg-gmi-surface`} onClick={onContinue}>Fortsett redigering</button>
      {variant === 'discard' && <button type="button" className={`${button} border-red-700 bg-gmi-surface text-red-800`} onClick={onDiscard}>Forkast</button>}
      {variant === 'boundary' && <>
        <button type="button" className={`${button} border-gmi-border-strong bg-gmi-surface`} onClick={onDiscard}>Forkast endringer</button>
        <button type="button" className={`${button} gmi-primary-control border-gmi-navy`} onClick={onSave}>Lagre endringer</button>
      </>}
      {variant === 'conflict' && remaining > 0 && <button type="button" className={`${button} gmi-primary-control border-gmi-navy`} onClick={onSave}>Lagre de øvrige {remaining}</button>}
    </div>
  </dialog>;
}
