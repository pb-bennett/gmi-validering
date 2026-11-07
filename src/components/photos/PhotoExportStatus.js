'use client';

import { photoCaptureTimeSchemaWarning, photoExportLevels } from '@/lib/photos/photoCompletion.mjs';
import './photoCompletion.css';

// Shared by Fullfør opplysninger and the export dialog, so both answer the three questions the same way.
export default function PhotoExportStatus({ readiness }) {
  const warning = photoCaptureTimeSchemaWarning(readiness);
  return <div className="photo-export-status" data-export-status>
    {warning && <p className="photo-completion-warning" data-export-warning="capture-time-schema">{warning}</p>}
    <dl className="photo-export-levels" aria-label="Eksportstatus">
      {photoExportLevels(readiness).map(({ key, label, text }) => <div key={key} data-export-level={key}><dt>{label}</dt><dd>{text}</dd></div>)}
    </dl>
  </div>;
}
