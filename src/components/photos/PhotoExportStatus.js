'use client';

import { photoCaptureTimeSchemaWarning, photoExportAwaitingSource, photoExportLevels } from '@/lib/photos/photoCompletion.mjs';
import './photoCompletion.css';

// Shared by Fullfør opplysninger and the export wizard, so both answer the three questions the same way. Until source data
// has been read, readiness can report blockers that are not real, so no answer is given. The wizard passes `reading`,
// because it also waits for photos that have no position yet.
export default function PhotoExportStatus({ readiness, reading = photoExportAwaitingSource(readiness) }) {
  if (reading) return <p className="photo-export-status" data-export-status-reading>Eksportstatus vises når bildedata er lest.</p>;
  const warning = photoCaptureTimeSchemaWarning(readiness);
  return <div className="photo-export-status" data-export-status>
    {warning && <p className="photo-completion-warning" data-export-warning="capture-time-schema">{warning}</p>}
    <dl className="photo-export-levels" aria-label="Eksportstatus">
      {photoExportLevels(readiness).map(({ key, label, text }) => <div key={key} data-export-level={key}><dt>{label}</dt><dd>{text}</dd></div>)}
    </dl>
  </div>;
}

// One folded group per diagnostic code, so a long list of the same problem stays one line.
export function PhotoExportDiagnostics({ groups }) {
  return groups.map((group) => <details key={group.code} className="photo-export-diagnostic" data-diagnostic-code={group.code}>
    <summary>{group.label} — {group.count}</summary>
    <ul>{group.items.map((item, index) => <li key={index}>{item.message}</li>)}</ul>
  </details>);
}
