'use client';

import { useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import PhotoEvidenceActions from './PhotoEvidenceActions';

const fields = [['captureTime', 'Opptakstid'], ['photographer', 'Fotograf']];
const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1 text-xs';
const display = (field, value) => field === 'captureTime' ? value?.iso : value;
const sourceLabel = (kind) => ({ manual: 'Manuell', exif: 'EXIF', gml: 'GML' })[kind] || kind;

function MetadataForm({ layerId, photoIds, field, label, accepted, batch = false }) {
  const [message, setMessage] = useState('');
  return <form className="space-y-1" onSubmit={(event) => {
    event.preventDefault();
    const result = photoSession.setCaptureMetadata(layerId, photoIds, field, new FormData(event.currentTarget).get('value'));
    setMessage(result.ok ? `${result.assetIds.length} unike bilder oppdatert.` : 'Ugyldig verdi. Bruk gyldig ISO-dato eller dato og klokkeslett.');
  }}>
    <label className="block">{batch ? `Felles ${label.toLowerCase()}` : label}
      <input className="block w-full border border-gmi-border-strong px-1" name="value" aria-label={batch ? `Felles ${label.toLowerCase()}` : label}
        defaultValue={display(field, accepted?.value) || ''} placeholder={field === 'captureTime' ? '2026-05-12T14:33:02 (ev. +02:00)' : 'Navn'} required />
    </label>
    {field === 'captureTime' && <p>ISO-dato eller dato og tid. Utelat tidssone hvis ukjent.</p>}
    <button className={control} type="submit">{batch ? `Sett ${label.toLowerCase()} for valgte bilder` : `Lagre ${label.toLowerCase()}`}</button>
    {!batch && <button className={control} type="button" disabled={!accepted} onClick={() => {
      photoSession.setCaptureMetadata(layerId, photoIds, field, null); setMessage('');
    }}>{`Nullstill ${label.toLowerCase()}`}</button>}
    {message && <p role="status">{message}</p>}
  </form>;
}

export default function PhotoMetadataEditor({ photo, layerId }) {
  return <section className="space-y-2 p-2 text-xs" aria-label="Opptaksmetadata">
    <h4>Opptaksmetadata · delt av alle plasseringer</h4>
    {fields.map(([field, label]) => {
      const accepted = photo.captureMetadata[field];
      return <div key={field} className="space-y-1">
        <p data-accepted-metadata={field}>{`Godtatt ${label.toLowerCase()}: ${display(field, accepted?.value) || 'Ukjent'}${accepted ? ` (${sourceLabel(accepted.provenance.kind)})` : ''}`}</p>
        <MetadataForm key={`${photo.assetId}:${field}:${JSON.stringify(accepted)}`} layerId={layerId} photoIds={[photo.id]} field={field} label={label} accepted={accepted} />
        <details><summary>{label}: kildeverdier</summary>
          {photo.metadataEvidence.filter((item) => item.field === field).map((evidence) => <div key={evidence.id}>
            <p>{sourceLabel(evidence.kind)}{evidence.sourceFilename ? ` · ${evidence.sourceFilename}` : ''}: {typeof evidence.raw === 'string' ? evidence.raw : JSON.stringify(evidence.raw)}</p>
            <p>{evidence.value ? display(field, evidence.value) : 'Kan ikke tolkes sikkert; beholdt som rå kildedata.'}</p>
            <button type="button" className={control} disabled={!evidence.value} onClick={() => photoSession.setCaptureMetadata(layerId, [photo.id], field, null, { evidenceId: evidence.id })}>{`Bruk ${sourceLabel(evidence.kind)} som ${label.toLowerCase()}`}</button>
          </div>)}
          {!photo.metadataEvidence.some((item) => item.field === field) && <p>Ingen kildeverdi funnet.</p>}
        </details>
      </div>;
    })}
  </section>;
}

export function PhotoMetadataBatch({ photos, selectedIds, layerId }) {
  const selected = photos.filter((photo) => selectedIds.includes(photo.id));
  const count = new Set(selected.map((photo) => photo.assetId)).size;
  if (!count) return null;
  return <details className="p-2 text-xs" aria-label="Felles opptaksmetadata"><summary>Opptaksmetadata for {count} unike bilder</summary>
    <PhotoEvidenceActions photos={photos} layerId={layerId} selectedIds={selectedIds} />
    <p>Overskriver valgt felt for {count} unike bilder, også deres øvrige plasseringer.</p>
    {fields.map(([field, label]) => <MetadataForm key={field} layerId={layerId} photoIds={selected.map((photo) => photo.id)} field={field} label={label} batch />)}
  </details>;
}
