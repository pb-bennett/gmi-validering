'use client';

import { useState } from 'react';
import { PHOTO_EXPORT_PROFILE_METADATA } from '@/lib/photos/export/photoExportRules.mjs';
import { sanitizePhotoExportLabel } from '@/lib/photos/export/photoExportNaming.mjs';
import PhotoExportStatus, { PhotoExportDiagnostics } from './PhotoExportStatus';
import PhotoSourceOption, { photoSourceButton } from './PhotoSourceOption';

const formats = (tier) => Object.entries(PHOTO_EXPORT_PROFILE_METADATA).filter(([, card]) => card.tier === tier);

function FormatCard({ profile, card, config, onConfigChange }) {
  const selected = config.profile === profile;
  const title = <>{card.title}{card.badge && <span className="photo-export-badge">{card.badge}</span>}</>;
  return <PhotoSourceOption name="photo-export-format" value={profile} label={title} hint={card.destination} checked={selected} onChange={(value) => onConfigChange({ profile: value })}>
    <p className="photo-export-compatibility">{card.compatibility}</p>
    {selected && card.tier !== 'primary' && <label className="photo-export-crs">Koordinatsystem
      <select className="gmi-focus-ring" aria-label="Eksport-CRS" value={config.crs} onChange={(event) => onConfigChange({ crs: event.target.value })}><option>EPSG:25832</option><option>EPSG:25833</option></select>
    </label>}
  </PhotoSourceOption>;
}

function FilenameHint({ label }) {
  const part = sanitizePhotoExportLabel(label);
  if (label.trim() && !part) return <p className="photo-export-hint" data-export-name-format>Etiketten har ingen tegn som kan brukes i filnavn. Bare tidspunktet brukes.</p>;
  return <p className="photo-export-hint" data-export-name-format>Filnavn: ÅÅÅÅMMDD-TTmmss{part && `-${part}`}.zip og .gml. Tidspunktet settes når pakken lages.</p>;
}

// Everything that shapes the package is chosen here, before a plan exists. Status follows each choice at once.
export default function PhotoExportDeliveryStep({ config, model, readiness, onConfigChange, onOpenCompletion }) {
  const [moreOpen, setMoreOpen] = useState(false);
  // A chosen format is never hidden, whether it was chosen here or in Fullfør opplysninger.
  const advanced = PHOTO_EXPORT_PROFILE_METADATA[config.profile]?.tier !== 'primary';
  return <div className="photo-export-body" data-export-step="delivery">
    <div className="photo-export-choices">
      <p className="photo-export-section-title">Format</p>
      {formats('primary').map(([profile, card]) => <FormatCard key={profile} profile={profile} card={card} config={config} onConfigChange={onConfigChange} />)}
      <details className="photo-export-more" open={moreOpen || advanced} onToggle={(event) => setMoreOpen(event.currentTarget.open)}>
        <summary onClick={(event) => { if (advanced) event.preventDefault(); }}>Flere formater</summary>
        {formats('advanced').map(([profile, card]) => <FormatCard key={profile} profile={profile} card={card} config={config} onConfigChange={onConfigChange} />)}
      </details>
      <label className="photo-export-label">Etikett i filnavnet (valgfritt)
        <input className="gmi-focus-ring" type="text" autoComplete="off" aria-label="Eksportetikett" value={config.label} onChange={(event) => onConfigChange({ label: event.target.value })} />
      </label>
      <FilenameHint label={config.label} />
    </div>
    <div className="photo-export-state">
      <h3 tabIndex={-1} data-export-heading data-delivery-state={model.state}>{model.heading}</h3>
      <PhotoExportStatus readiness={readiness} reading={model.state === 'reading'} />
      <div><button type="button" className={model.completionPrimary ? 'gmi-primary-control gmi-focus-ring min-h-10 px-4' : photoSourceButton} data-export-completion onClick={onOpenCompletion}>Fullfør opplysninger…</button></div>
      {model.excludedText && <p className="photo-export-excluded" data-export-excluded>{model.excludedText}</p>}
      {model.blockers.length > 0 && <div className="photo-export-diagnostics" data-export-blockers><PhotoExportDiagnostics groups={model.blockers} /></div>}
      {model.checks.length > 0 && <ul className="photo-completion-notes" aria-label="Bør kontrolleres">{model.checks.map((item) => <li key={item.code} data-delivery-check={item.code}>{item.text}</li>)}</ul>}
      {model.notes.length > 0 && <details className="photo-export-disclosure" data-delivery-notes>
        <summary>Slik blir leveransen ({model.notes.length})</summary>
        <ul>{model.notes.map((item) => <li key={item.code} data-readiness-note={item.code}>{item.text}</li>)}</ul>
      </details>}
    </div>
  </div>;
}
