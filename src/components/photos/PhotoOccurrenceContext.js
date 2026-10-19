'use client';

import { gmiObjectLabel } from '@/lib/photos/gmiPhotoSource.mjs';

// Compact shared-asset identity, with exact occurrence provenance on demand.
export default function PhotoOccurrenceContext({ occurrence, count = 1, index = 1, objectCount = 0, compact = false }) {
  if (!occurrence && count <= 1 && objectCount <= 1) return null;
  return <div className="photo-occurrence-context">
    {(count > 1 || objectCount > 1) && <p className="photo-repeat-warning" role="status">
      <strong>{count > 1 ? 'Flere plasseringer' : 'Gjentas'}</strong> · Samme bilde{count > 1 ? ` · ${index} av ${count}` : ''}
      {!compact && objectCount > 0 && <span> · Bildet er referert fra {objectCount} GMI-objekter.</span>}
    </p>}
    {occurrence && (compact ? <p>{gmiObjectLabel(occurrence.object)}</p> : <details>
      <summary>Plassering: {gmiObjectLabel(occurrence.object)}</summary>
      <p>TEMA: {occurrence.object.tema || 'Ikke oppgitt'} · Type: {occurrence.object.type || 'Ikke oppgitt'}</p>
      <p>GUID: {occurrence.object.guid || 'Ikke oppgitt'}</p>
      <p className="break-all">Kilde: {occurrence.sourceFilename}</p>
    </details>)}
  </div>;
}
