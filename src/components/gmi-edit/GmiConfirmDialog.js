'use client';

import { useEffect, useId, useRef } from 'react';

const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-3 py-1.5 text-sm';

/**
 * Modal confirmation used by every action that could lose GMI corrections.
 * Cancel is the default (focused, Escape); the destructive action is explicit.
 */
export default function GmiConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Avbryt', destructive = true, onCancel, onConfirm, testId }) {
  const ref = useRef(null), headingId = useId();
  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={ref} className="gmi-edit-dialog gmi-edit-confirm-dialog" aria-labelledby={headingId} data-gmi-confirm={testId}
    onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <h2 id={headingId}>{title}</h2>
    <div className="gmi-edit-confirm-body">{children}</div>
    <div className="gmi-edit-actions">
      <button type="button" className={control} onClick={onCancel} autoFocus>{cancelLabel}</button>
      <button type="button" className={`${control}${destructive ? ' gmi-edit-destructive' : ''}`} onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </dialog>;
}

/** Body text listing layers whose corrections would be discarded. */
export function UnsavedGmiLayers({ layers, names = {} }) {
  return <ul className="gmi-edit-unsaved-layers">
    {layers.map((entry) => <li key={entry.layerId}>
      <strong>{names[entry.layerId] || entry.filename || 'GMI-lag'}</strong>: {entry.changeSetCount} {entry.changeSetCount === 1 ? 'retting' : 'rettinger'}, {entry.changedCells} endrede felt
    </li>)}
  </ul>;
}
