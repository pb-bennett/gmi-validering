'use client';
import { WarningIcon } from '@phosphor-icons/react';
import { formatPhotoCaptureTime } from '@/lib/photos/photoPresentation.mjs';

// Filename capture-time suggestions on the import wizard's final step. Nothing is applied unless chosen.
export default function PhotoImportCaptureTimeChoices({ suggestions, choices, onChange }) {
  if (!suggestions) return null;
  if (suggestions.pending) return <p role="status" className="photo-import-capture-pending">Leser opptakstid fra bildene …</p>;
  const rows = [...suggestions.complete, ...suggestions.dateOnly];
  if (!rows.length) return null;
  const choice = (key, label, count) => count > 0 && <label className="photo-import-capture-choice">
    <input type="checkbox" className="accent-gmi-interactive" checked={Boolean(choices?.[key])} onChange={(event) => onChange({ [key]: event.target.checked })} />
    {label} ({count})
  </label>;
  return <section className="photo-import-capture gmi-validation-panel" data-validation-tone="warning" aria-labelledby="photo-import-capture-title">
    <p id="photo-import-capture-title" className="photo-import-capture-title"><WarningIcon size={16} weight="regular" aria-hidden="true" className="gmi-validation-accent" />
      <strong>SJEKK</strong> {suggestions.missing} {suggestions.missing === 1 ? 'bilde mangler' : 'bilder mangler'} opptakstid.</p>
    {choice('complete', 'Bruk dato og klokkeslett fra filnavn', suggestions.complete.length)}
    {choice('dateOnly', 'Bruk kun dato fra filnavn', suggestions.dateOnly.length)}
    <details>
      <summary>Vis forslag ({rows.length})</summary>
      <ul className="photo-import-capture-list">{rows.map((row) => {
        const time = formatPhotoCaptureTime(row.value);
        return <li key={row.assetId}><span className="photo-import-capture-file">{row.filename}</span>
          <span className="photo-import-capture-time">{time?.text}{time?.notes.length ? ` · ${time.notes.join(' · ')}` : ''}</span></li>;
      })}</ul>
    </details>
  </section>;
}
