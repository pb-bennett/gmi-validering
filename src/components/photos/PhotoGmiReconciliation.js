'use client';

import PhotoGmiSummary from './PhotoGmiSummary';

export default function PhotoGmiReconciliation({ review, photos, onIncludeChange }) {
  const summary = review.associationLedger.summary;
  return <section className="photo-collection-gallery p-4 text-sm" aria-label="Kontroller bildereferanser">
    <h3 className="font-semibold text-gmi-navy">Bilder i leveransen · Referanser i GMI</h3>
    <p className="my-2">{review.targetLayerId ? 'Kontrollen omfatter valgte nye bilder og bildene som allerede finnes i mål-laget.' : 'Kontrollen omfatter bare bildene du har valgt.'} Posisjoner endres ikke ved denne bekreftelsen.</p>
    <dl className="photo-reconciliation-counts" aria-label="Treff i leveransen">
      {[
        ['Koblet (referanser)', summary.matchedReferenceCount],
        ['Gjentatt referanse (bilder brukt av flere objekter)', review.repeatedCount],
        ['Uavklart (referanser)', summary.ambiguousCount],
        ['Ikke funnet i valgte bilder', summary.unmatchedCount],
        ['Ikke referert i GMI (nye bilder)', review.unreferencedIds.length],
        ['Ugyldig referanse', summary.invalidCount],
      ].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
    </dl>
    <p className="my-2 text-gmi-text-muted">{review.pathCount} av {review.assetCount} bilder har relativ sti. Bilder valgt uten mappe har bare filnavn som treffgrunnlag. Uavklarte referanser kobles ikke automatisk.</p>
    {summary.ambiguousCount > 0 && <details><summary>Uavklarte treff · {summary.ambiguousCount}</summary><ul>
      {review.associationLedger.resolutions.filter((row) => row.status === 'ambiguous').map((row) => <li key={row.referenceId}>
        {review.source.references.find((reference) => reference.id === row.referenceId)?.referenceRaw}
        <ul>{row.photoIds.map((id) => { const file = review.files.find((item) => item.id === id);
          return <li key={id}>{file?.relativePath || file?.filename}</li>; })}</ul>
      </li>)}</ul></details>}
    <label className="my-3 flex items-center gap-2"><input type="checkbox" aria-label="Ta med bilder som ikke er referert i GMI" checked={review.includeUnreferenced}
      onChange={(event) => onIncludeChange(event.target.checked)} />Ta med bilder som ikke er referert i GMI</label>
    <p>{review.includedIds.length} nye bilder legges til. Koblinger opprettes bare for sikre treff.</p>
    {review.unreferencedIds.length > 0 && <details><summary>Ikke referert i GMI · {review.unreferencedIds.length}</summary>
      <ul>{photos.filter((photo) => review.unreferencedIds.includes(photo.id)).map((photo) => <li key={photo.id}>{photo.sourceRelativePath || photo.originalFilename}</li>)}</ul>
      <p>Disse kan senere plasseres med EXIF, GML eller manuelt. Ingen GMI-kobling opprettes.</p></details>}
    <details className="my-3"><summary>Referanser, gjentakelser og kildedetaljer</summary>
      <PhotoGmiSummary source={review.source} ledger={review.associationLedger} /></details>
  </section>;
}
