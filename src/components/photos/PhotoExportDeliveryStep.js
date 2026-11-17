'use client';

import { useId, useState } from 'react';
import { PHOTO_EXPORT_PROFILE_METADATA } from '@/lib/photos/export/photoExportRules.mjs';
import { exportFilenamePreview, EXPORT_FILENAME_ADVISORY_LENGTH } from '@/lib/photos/export/photoExportNaming.mjs';
import PhotoExportStatus, { PhotoExportDiagnostics, PhotoExportTone } from './PhotoExportStatus';
import PhotoSourceOption, { photoSourceButton } from './PhotoSourceOption';

const TONES = Object.freeze({ reading: 'wait', blocked: 'stop', 'schema-gap': 'caution', recommendations: 'info', ready: 'good' });
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

/**
 * One filename field: grey timestamp prefix, the editable descriptive name, grey `_revNN.ext` suffix. `filename` is
 * derived by the wizard: { descriptive, timestamp, revision, showRevision, extension, issueText, onUseSuggestion }.
 * The timestamp itself is read when the plan is built, so the prefix shows a placeholder of the same length.
 */
export function ExportFilenameEditor({ filename, onConfigChange }) {
  const id = useId();
  const { descriptive, timestamp, revision, showRevision, revisionChecked, extension, issueText, onUseSuggestion } = filename;
  const preview = exportFilenamePreview({ descriptive, timestamp, revision, extension });
  const long = !preview.issue && preview.length > EXPORT_FILENAME_ADVISORY_LENGTH;
  const message = preview.issue ? issueText : long ? `Filnavnet er over ${EXPORT_FILENAME_ADVISORY_LENGTH} tegn.` : '';
  const describedBy = [preview.prefix && `${id}-prefix`, `${id}-suffix`, message && `${id}-message`].filter(Boolean).join(' ');
  return <div className="delivery-filename-field" data-export-filename-editor>
    <label htmlFor={`${id}-input`} className="delivery-filename-label">Filnavn</label>
    <div className="delivery-filename" data-validation-tone={preview.issue ? 'error' : long ? 'warning' : undefined}>
      {preview.prefix && <span id={`${id}-prefix`} className="delivery-filename-affix" data-export-filename-prefix>{preview.prefix}</span>}
      <input id={`${id}-input`} type="text" autoComplete="off" spellCheck={false} value={descriptive}
        aria-describedby={describedBy} aria-invalid={preview.issue ? 'true' : undefined}
        onChange={(event) => onConfigChange({ label: event.target.value })} />
      <span id={`${id}-suffix`} className="delivery-filename-affix" data-export-filename-suffix>{preview.suffix}</span>
    </div>
    <div className="delivery-filename-options">
      <label><input type="checkbox" className="accent-gmi-interactive" checked={timestamp}
        onChange={(event) => onConfigChange({ filenameTimestamp: event.target.checked })} />Tidsstempel</label>
      {showRevision && <label><input type="checkbox" className="accent-gmi-interactive" checked={revisionChecked}
        onChange={(event) => onConfigChange({ filenameRevision: event.target.checked })} />Revisjonsnummer</label>}
      {onUseSuggestion && <button type="button" className="gmi-compact-button gmi-focus-ring text-gmi-interactive px-2 py-1" onClick={onUseSuggestion}>Bruk forslag</button>}
    </div>
    {message && <p id={`${id}-message`} className="delivery-filename-message" data-export-filename-message={preview.issue ?? 'long'}>{message}</p>}
  </div>;
}

// Everything that shapes the package is chosen here, before a plan exists. Status follows each choice at once.
export function PhotoExportSettings({ config, onConfigChange, filename }) {
  const [moreOpen, setMoreOpen] = useState(false);
  // A chosen format is never hidden, whether it was chosen here or in Fullfør opplysninger.
  const advanced = PHOTO_EXPORT_PROFILE_METADATA[config.profile]?.tier !== 'primary';
  return <>
      <p className="photo-export-section-title">Format</p>
      {formats('primary').map(([profile, card]) => <FormatCard key={profile} profile={profile} card={card} config={config} onConfigChange={onConfigChange} />)}
      <details className="photo-export-more" open={moreOpen || advanced} onToggle={(event) => setMoreOpen(event.currentTarget.open)}>
        <summary onClick={(event) => { if (advanced) event.preventDefault(); }}>Flere formater</summary>
        {formats('advanced').map(([profile, card]) => <FormatCard key={profile} profile={profile} card={card} config={config} onConfigChange={onConfigChange} />)}
      </details>
      {filename && <ExportFilenameEditor filename={filename} onConfigChange={onConfigChange} />}
  </>;
}

export default function PhotoExportDeliveryStep({ config, model, readiness, onConfigChange, onOpenCompletion }) {
  return <div className="photo-export-body" data-export-step="delivery">
    <div className="photo-export-choices"><PhotoExportSettings config={config} onConfigChange={onConfigChange} /></div>
    <div className="photo-export-state">
      <h3 tabIndex={-1} data-export-heading data-delivery-state={model.state}><PhotoExportTone tone={TONES[model.state]} />{model.heading}</h3>
      <PhotoExportStatus readiness={readiness} reading={model.state === 'reading'} />
      {model.blockers.length > 0 && <div className="photo-export-diagnostics" data-export-blockers><PhotoExportDiagnostics groups={model.blockers} /></div>}
      {model.checks.length > 0 && <ul className="photo-completion-notes" aria-label="Bør kontrolleres">{model.checks.map((item) => <li key={item.code} data-delivery-check={item.code}>{item.text}</li>)}</ul>}
      {model.excludedText && <p className="photo-export-excluded" data-export-excluded>{model.excludedText}</p>}
      <div><button type="button" className={model.completionPrimary ? 'gmi-primary-control gmi-focus-ring min-h-10 px-4' : photoSourceButton} data-export-completion onClick={onOpenCompletion}>Fullfør opplysninger…</button></div>
      {model.notes.length > 0 && <details className="photo-export-disclosure" data-delivery-notes>
        <summary>Slik blir leveransen ({model.notes.length})</summary>
        <ul>{model.notes.map((item) => <li key={item.code} data-readiness-note={item.code}>{item.text}</li>)}</ul>
      </details>}
    </div>
  </div>;
}
