'use client';
import { useRef } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { readErrors } from '@/lib/photos/photoImportPresentation.mjs';
export default function PhotoImportPlacementStep({ session, placement, onChange, loadedSources, onLoadedSource }) {
  const gmi = useRef(null), gml = useRef(null);
  const gps = session.photos.filter((photo) => photo.spatial.candidates.some((candidate) => candidate.kind === 'exif' && candidate.status === 'viable')).length;
  const pending = session.photos.some((photo) => photo.spatial.exifRead.state === 'pending');
  const source = placement.kind === 'gmi' ? session.loadedImport : session.positioning;
  return <section className="photo-import-placement" aria-label="Velg plassering">
    {[
      ['none', 'Uten plassering', 'Plasser bildene senere i fotolaget.'],
      ['gmi', 'Fra GMI', ''], ['gml', 'Fra GML-fil', ''],
      ['exif', 'Fra bildenes GPS', pending ? 'Leser GPS fra bildene …' : gps ? `${gps} av ${session.photos.length} bilder har GPS` : 'Ingen av bildene har GPS'],
    ].map(([kind, label, hint]) => <div className="photo-import-source" key={kind}>
      <label><input type="radio" name="import-placement" value={kind} checked={placement.kind === kind} disabled={kind === 'exif' && (!gps || pending)} onChange={() => onChange(kind)} /> <strong>{label}</strong></label>
      {hint && <p>{hint}</p>}
      {placement.kind === kind && kind === 'gmi' && <div className="flex flex-wrap gap-2">{loadedSources.map((item) => <button type="button" className="gmi-compact-button gmi-focus-ring" key={item.id} onClick={() => onLoadedSource(item.id)}>Bruk {item.name}</button>)}<button type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => gmi.current.click()}>Velg GMI-fil …</button></div>}
      {placement.kind === kind && kind === 'gml' && <button type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => gml.current.click()}>Velg GML-fil …</button>}
      {placement.kind === kind && ['gmi', 'gml'].includes(kind) && <>
        {source?.state === 'ready' && <p role="status">{source.source.filename}</p>}
        {source?.state === 'pending' && <p role="status">Leser {kind.toUpperCase()}-filen …</p>}
        {source?.state === 'error' && <p role="alert">{readErrors[source.errorCode] || 'Kildefilen kunne ikke leses. Velg filen på nytt.'}</p>}
      </>}
    </div>)}
    <input hidden ref={gmi} type="file" accept=".gmi" aria-label="Velg GMI-fil" onChange={(event) => { const file = event.target.files[0]; event.target.value = ''; if (file) void photoSession.setDraftGmiSource({ file }); }} />
    <input hidden ref={gml} type="file" accept=".gml" aria-label="Velg GML med bildeposisjoner" onChange={(event) => { const file = event.target.files[0]; event.target.value = ''; if (file) void photoSession.importPositioningGml(file); }} />
  </section>;
}
