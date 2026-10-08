'use client';

import PhotoManualPlacementControls from './PhotoManualPlacementControls';
import PhotoDirectionControls from './PhotoDirectionControls';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { exifGpsMessage } from '@/lib/photos/exifGps.mjs';
import { photoSourceLabel as label } from '@/lib/photos/photoPresentation.mjs';

const coordinates = (position) => position ? `${Math.abs(position.latitude).toFixed(7)}° ${position.latitude < 0 ? 'S' : 'N'}, ${Math.abs(position.longitude).toFixed(7)}° ${position.longitude < 0 ? 'V' : 'Ø'} (WGS84)` : 'Ingen posisjon';
const buttonStyle = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1 disabled:opacity-40';

export default function PhotoSpatialInspector({ photo, layerId, onLocate, proposedEntry, manualPlacement, directionEditor }) {
  const spatial = photo.spatial;
  const basis = spatial.candidates.find((candidate) => candidate.id === spatial.current?.basis?.candidateId);
  const canEdit = Boolean(layerId);
  return (
    <section className="photo-spatial-inspector text-xs" aria-label="Bildeposisjon og kilder">
      <h4 className="font-semibold text-gmi-navy">Posisjon og kilder</h4>
      <p>{spatial.current ? `Gjeldende posisjon (${label(basis?.kind || spatial.current.basis.kind)})` : 'Uplassert'}</p>
      {basis?.sourceFilename && <p className="break-all text-gmi-text-muted">Fra {basis.sourceFilename}</p>}
      <p className="text-gmi-text-muted">{coordinates(spatial.current?.position)}</p>
      {canEdit && <button type="button" className={buttonStyle} disabled={!spatial.current} onClick={() => onLocate?.({ layerId, photoId: photo.id })}>Zoom til posisjon</button>}
      {canEdit && manualPlacement && <PhotoManualPlacementControls photo={photo} layerId={layerId} placement={manualPlacement} />}
      <PhotoDirectionControls photo={photo} layerId={layerId} editor={directionEditor} />
      <p className="text-gmi-text-muted">{exifGpsMessage(spatial.exifRead.state, spatial.exifRead.errorCode)}</p>
      {proposedEntry && <p className="text-gmi-text-muted">GML i importen: {proposedEntry.status === 'viable' ? 'Posisjonen blir gjeldende når laget opprettes.' : 'Posisjonen kan ikke brukes.'}</p>}
      {[...spatial.candidates, ...(proposedEntry ? [{ ...proposedEntry, kind: 'gml', proposed: true }] : [])].map((candidate) => (
        <div key={candidate.id} className="mt-2 border-t border-gmi-border pt-2">
          <p className="font-medium">{label(candidate.kind)}{candidate.proposed ? ' (foreslått)' : ' kandidat'}{candidate.status !== 'viable' ? ' · Kan ikke brukes' : ''}{candidate.id === basis?.id ? ' · I bruk' : ''}</p>
          {candidate.sourceFilename && <p className="break-all text-gmi-text-muted">{candidate.sourceFilename}</p>}
          <p className="text-gmi-text-muted">{coordinates(candidate.position)}</p>
          {candidate.issues?.includes('questionable-zero-gps') && <p className="text-amber-800">GPS er 0°/0°. Kontroller kilden før du bruker posisjonen.</p>}
          {candidate.errorCode && <p className="text-red-700">{candidate.errorCode}</p>}
          {canEdit && candidate.status === 'viable' && <div className="mt-1 flex flex-wrap gap-2">
            <button type="button" className={buttonStyle} onClick={() => onLocate?.({ layerId, photoId: photo.id, candidateId: candidate.id })}>Zoom til {label(candidate.kind)}</button>
            <button type="button" className={buttonStyle} onClick={() => photoSession.acceptCandidates(layerId, [{ photoId: photo.id, candidateId: candidate.id }])}>Bruk {label(candidate.kind)}-posisjon</button>
          </div>}
          <details className="mt-1 text-gmi-text-muted">
            <summary className="cursor-pointer">Kildeinformasjon ({label(candidate.kind)})</summary>
            {candidate.sourceFilename && <p className="break-all">Kildefil: {candidate.sourceFilename}</p>}
            {candidate.sourceId && <p className="break-all">Kilde-ID: {candidate.sourceId}</p>}
            {candidate.kind === 'exif' && <p>GPS er støttedata. Originalbildet beholdes uendret.</p>}
            {candidate.crsResolution?.method === 'terrain-envelope-fallback' && <p>CRS er hentet fra samlingens avgrensning i eldre Terrain GML. Bare horisontal posisjon er transformert.</p>}
            <pre className="whitespace-pre-wrap break-all">{JSON.stringify({ raw: candidate.raw, crs: candidate.crsResolution, transform: candidate.transform }, null, 2)}</pre>
          </details>
        </div>
      ))}
      {canEdit && <p className="mt-2 text-gmi-text-muted">Bruk av en kandidat endrer bare gjeldende posisjon. Kildene og originalfilen beholdes.</p>}
    </section>
  );
}
