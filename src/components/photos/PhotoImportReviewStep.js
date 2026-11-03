'use client';
/* eslint-disable @next/next/no-img-element -- Session thumbnails. */
import PhotoGmiSummary from './PhotoGmiSummary';
import PhotoGmlSummary from './PhotoGmlSummary';
const reasons = { ambiguous: 'Flere bilder har samme navn – kobles ikke automatisk.', 'linked-no-position': 'GMI-objektet mangler brukbar punktposisjon.', 'not-referenced': 'Ikke nevnt i GMI-filen.', excluded: 'Bildet tas ikke med.', 'no-position': 'Ingen brukbar posisjon fra den valgte kilden.', 'questionable-gps': 'GPS-posisjonen ser feil ut (0°, 0°).' };
export default function PhotoImportReviewStep({ preview, review, session, context, state, onInclude, onFallback, onTarget }) {
  const outcome = preview?.outcome;
  if (!outcome) return <p role="status">Klargjør kontroll …</p>;
  const row = (item) => <li key={item.assetId} tabIndex={item.status === 'placed' ? undefined : 0} className="photo-import-result">{item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" />}<div><strong>{item.filename}</strong><p>{item.status === 'placed' ? item.objects.join(' · ') : `⚠ ${item.reason || reasons[item.status]}`}</p></div></li>;
  return <section className="photo-import-review">
    <p className="photo-import-outcome">{review ? `${outcome.autoLinked} av ${outcome.total} bilder ble koblet automatisk` : `${outcome.placed} av ${outcome.total} bilder får posisjon fra ${state.placement.kind === 'exif' ? 'GPS' : 'GML-filen'}`}</p>
    {outcome.attention.length > 0 && <p className="font-semibold">{outcome.attention.length} {outcome.attention.length === 1 ? 'bilde' : 'bilder'} trenger kontroll</p>}
    <dl className="photo-import-figures">{[['Bilder', outcome.total], ['Plassert', outcome.placed], ['Uten posisjon', outcome.unplaced]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {context.kind === 'gmi-layer' && <label>Legg bildene i <select aria-label="Velg FOTO-mållag" value={session.draftTargetLayerId || ''} onChange={(event) => onTarget(event.target.value || null)}><option value="">Nytt fotolag</option>{session.photoLayers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>}
    {review?.unreferencedIds.length > 0 && <label className="block my-3"><input type="checkbox" checked={state.includeUnreferenced} onChange={(event) => onInclude(event.target.checked)} /> Ta med bilder som ikke er nevnt i GMI-filen</label>}
    {['gmi', 'gml'].includes(state.placement.kind) && preview.rows.some((row) => row.canUseExifFallback) && <label className="block my-3"><input type="checkbox" checked={state.placement.exifFallback} onChange={(event) => onFallback(event.target.checked)} /> Bruk GPS fra bildet når {state.placement.kind.toUpperCase()} mangler posisjon</label>}
    {outcome.attention.length > 0 && <section aria-label="Trenger kontroll"><h4>Trenger kontroll</h4><ul>{outcome.attention.map(row)}</ul></section>}
    {outcome.missingReferences.length > 0 && <details><summary>GMI-filen viser til {outcome.missingReferences.length} bilder som ikke er valgt.</summary><ul>{outcome.missingReferences.map((ref) => <li key={ref.id}>{ref.referenceRaw}</li>)}</ul><p>Gå tilbake for å legge dem til.</p></details>}
    {outcome.repeatedPhotos > 0 && <p>{outcome.repeatedPhotos} bilder brukes av flere objekter og får én plassering per objekt.</p>}
    <details><summary>Vis automatiske koblinger ({preview.rows.filter((item) => item.status === 'placed').length})</summary><ul>{preview.rows.filter((item) => item.status === 'placed').map(row)}</ul></details>
    <details><summary>Tekniske detaljer</summary>{review ? <PhotoGmiSummary source={review.source} ledger={review.associationLedger} /> : state.placement.kind === 'gml' ? <PhotoGmlSummary {...session.positioning} /> : <p>{outcome.placed} bilder med brukbar GPS.</p>}</details>
    <p className="text-xs text-gmi-text-muted">Fotolaget finnes bare i denne økten.</p>
  </section>;
}
