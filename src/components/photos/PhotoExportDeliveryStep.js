'use client';

import { useId, useState } from 'react';
import { WarningIcon } from '@phosphor-icons/react';
import { PHOTO_EXPORT_PROFILE_METADATA } from '@/lib/photos/export/photoExportRules.mjs';
import { describeExportNameCharacter, exportFilenamePreview, exportNameCompatibilitySuggestion, exportNameUncommonCharacters, sanitizeExportDescriptive,
  EXPORT_FILENAME_NOTICE_LENGTH, EXPORT_FILENAME_ADVISORY_LENGTH } from '@/lib/photos/export/photoExportNaming.mjs';
import PhotoSourceOption from './PhotoSourceOption';

const FILENAME_PLACEHOLDER = 'beskrivende navn';
const formats = (tier) => Object.entries(PHOTO_EXPORT_PROFILE_METADATA).filter(([, card]) => card.tier === tier);

function FormatCard({ profile, card, config, onConfigChange }) {
  const selected = config.profile === profile;
  const title = <>{card.title}{card.badge && <span className="photo-export-badge">{card.badge}</span>}</>;
  return <PhotoSourceOption name="photo-export-format" value={profile} label={title} hint={card.destination} checked={selected} onChange={(value) => onConfigChange({ profile: value })}>
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
  const threshold = preview.length > EXPORT_FILENAME_ADVISORY_LENGTH ? EXPORT_FILENAME_ADVISORY_LENGTH
    : preview.length > EXPORT_FILENAME_NOTICE_LENGTH ? EXPORT_FILENAME_NOTICE_LENGTH : null;
  const countTone = threshold === EXPORT_FILENAME_ADVISORY_LENGTH ? 'error' : threshold ? 'warning' : undefined;
  // A timestamp-only name is valid; recommend a description without blocking (A3). A blocking issue states its own error.
  const recommendDescription = !preview.issue && timestamp && !sanitizeExportDescriptive(descriptive);
  // Batch 2C: characters not every program handles in a file or folder name. Advisory: nothing is renamed by itself.
  const uncommon = preview.issue ? [] : exportNameUncommonCharacters(sanitizeExportDescriptive(descriptive));
  const suggestion = uncommon.length ? exportNameCompatibilitySuggestion(descriptive) : '';
  const describedBy = [preview.prefix && `${id}-prefix`, `${id}-suffix`, `${id}-count`,
    threshold && `${id}-advisory`, preview.issue && `${id}-message`, recommendDescription && `${id}-recommendation`,
    uncommon.length && `${id}-compatibility`].filter(Boolean).join(' ');
  return <div className="delivery-filename-field" data-export-filename-editor>
    <label htmlFor={`${id}-input`} className="delivery-filename-control">
      <span className="delivery-filename-heading">
        <span id={`${id}-label`} className="delivery-filename-label">Filnavn</span>
        <span id={`${id}-count`} className="delivery-filename-count" data-export-filename-count data-validation-tone={countTone}>
          {threshold && <WarningIcon size={12} weight="regular" aria-hidden="true" />}{preview.length} tegn
        </span>
        {threshold && <span id={`${id}-advisory`} className="sr-only">Filnavnet er over {threshold} tegn.</span>}
      </span>
      <span className="delivery-filename" data-validation-tone={preview.issue ? 'error' : undefined}>
        {preview.prefix && <span id={`${id}-prefix`} className="delivery-filename-affix" data-export-filename-prefix>{preview.prefix}</span>}
        <span className="delivery-filename-description">
          {/* The sizer mirrors the placeholder while empty, so the editable area stays visible at the placeholder's width. */}
          <span aria-hidden="true" data-export-filename-sizer>{descriptive || FILENAME_PLACEHOLDER}</span>
          <input id={`${id}-input`} type="text" autoComplete="off" spellCheck={false} value={descriptive} placeholder={FILENAME_PLACEHOLDER}
            aria-labelledby={`${id}-label`} aria-describedby={describedBy} aria-invalid={preview.issue ? 'true' : undefined}
            onChange={(event) => onConfigChange({ label: event.target.value })} />
        </span>
        <span id={`${id}-suffix`} className="delivery-filename-affix" data-export-filename-suffix>{preview.suffix}</span>
      </span>
    </label>
    <div className="delivery-filename-options">
      <label><input type="checkbox" className="accent-gmi-interactive" checked={timestamp}
        onChange={(event) => onConfigChange({ filenameTimestamp: event.target.checked })} />Tidsstempel</label>
      {showRevision && <label><input type="checkbox" className="accent-gmi-interactive" checked={revisionChecked}
        onChange={(event) => onConfigChange({ filenameRevision: event.target.checked })} />Revisjonsnummer</label>}
      {onUseSuggestion && <button type="button" className="gmi-compact-button gmi-focus-ring text-gmi-interactive px-2 py-1" onClick={onUseSuggestion}>Bruk forslag</button>}
    </div>
    {preview.issue && <p id={`${id}-message`} className="delivery-filename-message" data-export-filename-message={preview.issue}>{issueText}</p>}
    {recommendDescription && <p id={`${id}-recommendation`} className="delivery-filename-recommendation" data-export-filename-recommendation>
      Filnavnet har ingen beskrivende del. Vi anbefaler et navn som beskriver leveransen.</p>}
    {uncommon.length > 0 && <div className="delivery-filename-compatibility" data-export-filename-compatibility>
      <p id={`${id}-compatibility`} className="delivery-filename-recommendation">
        <WarningIcon size={12} weight="regular" aria-hidden="true" />{' '}
        Navnet har tegn som ikke alle programmer håndterer i fil- og mappenavn: {uncommon.map(describeExportNameCharacter).join(', ')}.
        {' '}Gemini VA kan for eksempel ha problemer med dem{extension === '.zip' ? ', også i mappen ZIP-filen pakkes ut i' : ''}.
        {suggestion && <> Forslag: <span className="font-mono" data-export-filename-suggestion>{suggestion}</span>.</>}
      </p>
      {suggestion && <button type="button" className="gmi-compact-button gmi-focus-ring text-gmi-interactive px-2 py-1"
        onClick={() => onConfigChange({ label: suggestion })}>Bruk foreslått navn</button>}
    </div>}
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
