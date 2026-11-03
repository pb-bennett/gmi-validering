'use client';

import { useEffect, useRef } from 'react';

const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-3 py-1.5 text-sm';

export default function RemovePhotosConfirmation({ count, occurrences, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={ref} className="photo-remove-confirmation" aria-labelledby="photo-remove-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <h2 id="photo-remove-title">{`Fjern ${occurrences ? `${count} ${count === 1 ? 'plassering' : 'plasseringer'}` : count === 1 ? 'bildet' : `${count} bilder`} fra laget?`}</h2>
    <p>Valgte {occurrences ? 'plasseringer' : 'bilder'} fjernes fra laget. Bildet beholdes så lenge det har en annen plassering. Originalfilene på disken endres ikke.</p>
    <div><button type="button" className={control} onClick={onCancel} autoFocus>Avbryt</button>
      <button type="button" className={`${control} photo-remove-confirm`} onClick={onConfirm}>Fjern fra lag</button></div>
  </dialog>;
}
