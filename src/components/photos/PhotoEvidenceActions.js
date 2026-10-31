'use client';

import { useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { planEvidenceAdoption } from '@/lib/photos/photoEvidenceAdoption.mjs';

const actions = [
  ['captureTime', 'exif', 'EXIF-tid'], ['photographer', 'exif', 'EXIF-fotograf'],
  ['direction', 'exif', 'EXIF-retning'], ['captureTime', 'gml', 'GML-tid'],
];
const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1 text-xs disabled:opacity-40';

export default function PhotoEvidenceActions({ photos, layerId, selectedIds, onAdopt }) {
  const [message, setMessage] = useState('');
  const ids = selectedIds || photos.map((photo) => photo.id);
  const selected = new Set(ids);
  const chosen = photos.filter((photo) => selected.has(photo.id));
  const unique = [...new Map(chosen.map((photo) => [photo.assetId, photo])).values()];
  return <section aria-label="Eksportberedskap" className="space-y-2 p-2 text-xs">
    <h3>Eksportberedskap · {selectedIds ? 'valgte bilder' : 'hele FOTO-laget'}</h3>
    <p>{unique.length} unike bilder undersøkt · {chosen.length} forekomster.</p>
    <p>{unique.filter((photo) => !photo.captureMetadata.captureTime).length} bilder mangler godtatt opptakstid · {chosen.filter((photo) => !photo.direction.current).length} forekomster mangler godtatt retning.</p>
    <p>Fyller bare ukjente verdier. Ulike brukbare kildeverdier krever gjennomgang. Uplasserte bilder er også med; eksport utelater dem til posisjon er godtatt.</p>
    <p>EXIF-retning gjelder originalbildets kameraobservasjon. For delte bilder brukes samme retning på hver valgt, ukjent forekomst. Dette dokumenterer ikke separate kameraobservasjoner ved objektplasseringene.</p>
    {actions.map(([field, kind, label]) => {
      const { counts } = planEvidenceAdoption(photos, field, kind, ids);
      return <div key={`${field}:${kind}`} data-evidence-action={`${kind}:${field}`}>
        <p>{label}: {counts.eligible} kan brukes · {counts.alreadyAccepted} allerede godtatt · {counts.missing} uten kildeverdi{field === 'direction' ? ` (${counts.missingAssets} bilder)` : ''} · {counts.unusable + counts.insufficientPrecision} ugyldig/utilstrekkelig presisjon · {counts.unsupportedReference} ukjent/magnetisk referanse · {counts.conflicting} i konflikt.</p>
        {field === 'direction' && <p>{counts.repeatedApplications} mulige anvendelser på forekomster med delt originalbilde.</p>}
        <button type="button" className={control} disabled={!counts.eligible} onClick={() => {
          const result = photoSession.adoptSourceEvidence(layerId, field, kind, ids);
          if (!result.ok) return;
          const c = result.counts;
          setMessage(`${label}: ${c.adopted} godtatt · ${c.alreadyAccepted} allerede godtatt · ${c.missing} uten kildeverdi · ${c.unusable + c.insufficientPrecision} ugyldig/utilstrekkelig presisjon · ${c.unsupportedReference} ukjent/magnetisk referanse · ${c.conflicting} i konflikt · ${c.stale} fjernet/utdatert · ${c.repeatedApplications} anvendelser på delte forekomster. Lag ny eksportforhåndsvisning.`);
          onAdopt?.();
        }}>Bruk {label} for alle mulige ({counts.eligible})</button>
      </div>;
    })}
    {message && <p role="status">{message}</p>}
  </section>;
}
