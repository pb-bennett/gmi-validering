'use client';

import { useEffect, useId, useRef } from 'react';
import { isDefaultPhotoDirection } from '@/lib/photos/photoDirection.mjs';
import { photoPlacementCounts } from '@/lib/photos/photoWorkspaceView.mjs';
import PhotoGmiSummary from './PhotoGmiSummary';
import PhotoGmlSummary from './PhotoGmlSummary';
import './photoGmi.css';

const button = 'gmi-compact-button gmi-focus-ring min-h-9 border px-3 py-1.5 text-sm font-medium';
const sourceKindLabel = (kind) => kind === 'gmi' ? 'GMI – objektenes bildereferanser' : 'GML – bildeposisjoner';

// Read-only overview. Per-source recheck/removal stays in step 1 of "Koble og posisjoner bilder".
export default function PhotoSourcesInfoDialog({ layer, photos, onClose, onOpenSources }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  const counts = photoPlacementCounts(photos);
  const assets = new Map(photos.map((photo) => [photo.assetId, photo]));
  const exifPending = [...assets.values()].filter((photo) => photo.spatial.exifRead.state === 'pending').length;
  const repeated = new Set(photos.filter((photo) => photo.repeatGroup?.repeated).map((photo) => photo.assetId)).size;
  const gmiSources = layer.spatialSources.filter((source) => source.kind === 'gmi');
  const linked = gmiSources.reduce((sum, source) => sum + (source.associationLedger?.summary.matchedPhotoCount || 0), 0);
  const unresolved = gmiSources.reduce((sum, source) => sum + (source.associationLedger?.summary.unmatchedCount || 0), 0);
  const ambiguous = gmiSources.reduce((sum, source) => sum + (source.associationLedger?.summary.ambiguousCount || 0), 0);
  const overview = [
    ['Bilder', assets.size], ['Plasseringer', photos.length],
    ['Plassert fra EXIF', counts.exif], ['Plassert fra GMI', counts.gmi], ['Plassert fra GML', counts.gml], ['Plassert manuelt', counts.manual],
    ['Uplassert', counts.unplaced], ['Bilder med EXIF GPS', layer.exifCandidateCount], ...(exifPending ? [['EXIF leses fortsatt', exifPending]] : []),
    ['Med retning', photos.filter((photo) => photo.direction?.current).length], ['Standardretning', photos.filter((photo) => isDefaultPhotoDirection(photo.direction?.current)).length],
    ['Med opptakstid', [...assets.values()].filter((photo) => photo.captureMetadata?.captureTime).length],
  ];
  return <dialog ref={ref} className="photo-gmi-dialog photo-sources-info" aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h2 id={`${id}-title`}>Kilder og koblinger</h2></header>
    <div className="photo-gmi-content">
      <section aria-label="Oversikt" className="photo-gmi-summary">
        <h3 className="font-semibold">Oversikt</h3>
        <dl>{overview.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </section>
      <section aria-label="Kilder">
        <h3 className="font-semibold">Kilder ({layer.spatialSources.length})</h3>
        {!layer.spatialSources.length && <p>Ingen GMI- eller GML-kilder er knyttet til fotolaget. Posisjoner kan likevel komme fra EXIF eller manuell plassering.</p>}
        {layer.spatialSources.map((source) => <article key={source.id} className="photo-sources-card" data-source-id={source.id}>
          <p><strong>{sourceKindLabel(source.kind)}</strong></p>
          <p className="break-all">{source.filename}</p>
          {source.importedAt && <p className="text-gmi-text-muted">Lagt til {new Date(source.importedAt).toLocaleString('nb-NO')}</p>}
          {source.loadedBinding && <p>{source.loadedBinding.live ? 'Koblet til lastet GMI-lag.' : 'Det opprinnelige GMI-laget er ikke lenger tilgjengelig. Lagrede koblinger beholdes.'}</p>}
          <details><summary>Detaljer</summary>
            {source.kind === 'gmi' ? <PhotoGmiSummary source={source} /> : <PhotoGmlSummary source={source} ledger={source.ledger} />}
          </details>
        </article>)}
      </section>
      {gmiSources.length > 0 && <section aria-label="Koblinger" className="photo-gmi-summary">
        <h3 className="font-semibold">Koblinger</h3>
        <dl>{[['Bilder koblet til GMI-objekter', linked], ['Gjentatte eller delte bilder', repeated], ['Referanser uten treff', unresolved], ['Tvetydige referanser', ambiguous]]
          .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </section>}
    </div>
    <footer><div>
      <button type="button" className={`${button} border-gmi-border-strong`} onClick={onClose}>Lukk</button>
      {photos.length > 0 && <button type="button" className={`${button} photo-gmi-primary`} onClick={onOpenSources}>Koble og posisjoner bilder…</button>}
    </div></footer>
  </dialog>;
}
