'use client';

import { photoSession } from '@/lib/photos/photoSession.mjs';
import { photoPositionDistance } from '@/lib/photos/photoPositioning.mjs';
import './photoManualPlacement.css';

export default function PhotoManualPlacementControls({ photo, layerId, placement }) {
  const visible = photoSession.getLayer(layerId)?.visible;
  const transaction = placement.transaction;
  const active = transaction?.ticket.photoId === photo.id && transaction.ticket.layerId === layerId;
  const position = active ? transaction.position : null;
  const distance = position && transaction.ticket.expectedCurrent
    ? photoPositionDistance(transaction.ticket.expectedCurrent.position, position) : null;
  const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1 disabled:opacity-40';
  return <section className="photo-manual-controls" aria-label="Manuell plassering">
    {!active ? <button type="button" className={`${control} photo-manual-start`} disabled={!visible} onClick={() => placement.begin(layerId, photo.id)}>
      {photo.spatial.current ? 'Flytt på kartet' : 'Plasser på kartet'}
    </button> : <>
      <h5>{transaction.ticket.expectedCurrent ? 'Flytt bilde' : 'Plasser bilde'}</h5>
      <p>Klikk i kartet for å velge posisjon, eller trykk Enter når kartet har fokus. Du kan dra den oransje markøren.</p>
      <div aria-live="polite">{position ? <>
        <p>{Math.abs(position.latitude).toFixed(7)}° {position.latitude < 0 ? 'S' : 'N'}, {Math.abs(position.longitude).toFixed(7)}° {position.longitude < 0 ? 'V' : 'Ø'} (WGS84)</p>
        {distance !== null && <p>Flyttes ca. {distance.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} m</p>}
      </> : <p>Ingen ny plassering valgt.</p>}</div>
      <div className="flex flex-wrap gap-2"><button type="button" className={control} disabled={!position} onClick={placement.apply}>Bruk plassering</button>
        <button type="button" className={control} onClick={() => placement.cancel(true)}>Avbryt</button></div>
      <p>Gjeldende posisjon endres først når du bruker plasseringen. Kildedata beholdes.</p>
    </>}
    {!visible && <p>Vis laget på kartet for å plassere bildet.</p>}
  </section>;
}
