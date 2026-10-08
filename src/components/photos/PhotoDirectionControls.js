'use client';

import { useId } from 'react';
import { photoDirectionLabel } from '@/lib/photos/photoDirection.mjs';
import usePhotoSession from './usePhotoSession';
import './photoDirection.css';

export default function PhotoDirectionControls({ photo, layerId, editor }) {
  const id = useId();
  const { photoLayers } = usePhotoSession();
  const visible = photoLayers.find(layer => layer.id === layerId)?.visible;
  const transaction = editor?.transaction;
  const active = transaction?.ticket.photoId === photo.id && transaction.ticket.layerId === layerId;
  const accepted = photo.direction?.current?.degrees;
  const degrees = active ? transaction.degrees : null;
  const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1 disabled:opacity-40';
  return <section className="photo-direction-controls" aria-label="Bilderetning">
    <div className="photo-direction-summary"><div><h5 className="font-semibold">Retning</h5>
      <p className="photo-direction-accepted">{accepted == null ? 'Ikke angitt' : `${accepted}°`}</p></div>
      {editor && !active && <button type="button" className={`${control} photo-direction-start`}
        disabled={!visible} onClick={() => editor.begin(layerId, photo.id)}>Juster retning</button>}
    </div>
    {active && <div className="photo-direction-editor">
      <label htmlFor={`${id}-slider`}>Foreslått retning: <strong>{photoDirectionLabel(degrees)}</strong></label>
      <input id={`${id}-slider`} type="range" min="0" max="359" step="1" value={degrees ?? accepted ?? 0}
        aria-label="Foreslått retning" aria-valuetext={photoDirectionLabel(degrees)}
        onChange={(event) => editor.propose(Number(event.target.value))} autoFocus />
      <p className="text-gmi-text-muted">0° N · 90° E · 180° S · 270° W. Med klokken.</p>
      <div className="photo-direction-fine">
        <button type="button" className={control} aria-label="Reduser retning med én grad" onClick={() => editor.propose((degrees ?? 0) - 1)}>−1°</button>
        <label htmlFor={`${id}-number`}>Grader</label>
        <input id={`${id}-number`} type="number" min="0" max="359" step="1" value={degrees ?? ''} aria-label="Retning i grader"
          onChange={(event) => editor.propose(event.target.validity.valid && event.target.value !== '' ? event.target.valueAsNumber : null)} />
        <button type="button" className={control} aria-label="Øk retning med én grad" onClick={() => editor.propose((degrees ?? 0) + 1)}>+1°</button>
      </div>
      {!photo.spatial.current && <p className="text-gmi-text-muted">Plasser bildet for å se retningen på kartet.</p>}
      {degrees === null && <p role="status">Angi en retning mellom 0° og 359°.</p>}
      <div className="flex flex-wrap gap-2"><button type="button" className={control} disabled={degrees === null} onClick={editor.apply}>Bruk retning</button>
        <button type="button" className={control} onClick={() => editor.cancel(true)}>Avbryt</button></div>
    </div>}
  </section>;
}
