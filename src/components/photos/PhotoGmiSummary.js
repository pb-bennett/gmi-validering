'use client';

import { gmiObjectLabel } from '@/lib/photos/gmiPhotoSource.mjs';

const statusLabels = { confident: 'Matchet', ambiguous: 'Tvetydig', unmatched: 'Ikke matchet', invalid: 'Ugyldig referanse' };
const methods = { 'exact-relative-path': 'Relativ sti', 'relative-path-suffix': 'Stisuffiks',
  'exact-basename': 'Unikt filnavn', 'case-insensitive-relative-path': 'Relativ sti (bokstav/Unicode)',
  'case-insensitive-path-suffix': 'Stisuffiks (bokstav/Unicode)', 'case-insensitive-basename': 'Filnavn (bokstav/Unicode)',
  'nfc-basename': 'Unikt filnavn (Unicode)', 'nfc-relative-path': 'Relativ sti (Unicode)',
  'nfc-relative-path-suffix': 'Stisuffiks (Unicode)' };

export default function PhotoGmiSummary({ source, ledger = source.associationLedger }) {
  const summary = ledger.summary;
  return <div className="photo-gmi-summary">
    <p className="photo-gmi-filename">GMI-fil: {source.filename}</p>
    <dl aria-label="Oppsummering av bildereferanser">
      {[
        ['Objekter analysert', summary.objectCount], ['Objekter med bildereferanser', summary.referencingObjectCount],
        ['Referanser funnet', summary.referenceCount], ['Matchet (referanser)', summary.matchedReferenceCount],
        ['Matchet til bilder', summary.matchedPhotoCount], ['Ikke matchet', summary.unmatchedCount],
        ['Tvetydig', summary.ambiguousCount], ['Ugyldig referanse', summary.invalidCount],
      ].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
    </dl>
    <details><summary>Referanser og treff</summary>
      <ul className="photo-gmi-reference-list">{source.references.map((reference) => {
        const row = ledger.reverseIndexes.byReferenceId[reference.id];
        return <li key={reference.id} data-reference-status={row.status}>
          <strong>{statusLabels[row.status]}</strong> · {gmiObjectLabel(source.objectsByKey[reference.objectKey])}
          <p>{reference.referenceRaw}</p>
          {row.method && <small>{methods[row.method] || row.method}</small>}
          {row.reason === 'directory-target' && <p>Målet er en mappe uten filnavn.</p>}
          {row.reason === 'non-image-target' && <p>Målet er ikke en støttet bildefil.</p>}
          {row.status === 'ambiguous' && <p>{row.photoIds.length} mulige bilder i laget. Ingen kobling er valgt.</p>}
          {row.status === 'unmatched' && <p>Ingen treff i dette FOTO-laget.</p>}
        </li>;
      })}</ul>
    </details>
    {source.issues.length > 0 && <details><summary>Kildemerknader ({source.issues.length})</summary>
      <ul>{source.issues.map((issue, index) => <li key={index}>{issue.code}{issue.objectKey ? ` · ${gmiObjectLabel(source.objectsByKey[issue.objectKey])}` : ''}</li>)}</ul>
    </details>}
  </div>;
}
