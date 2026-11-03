'use client';
import { useRef } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { readErrors } from '@/lib/photos/photoImportPresentation.mjs';
const sourceButton = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong bg-gmi-surface px-3 py-2';
export default function PhotoImportPlacementStep({ session, placement, onChange, loadedSources, onLoadedSource }) {
  const gmi = useRef(null), gml = useRef(null);
  const gps = session.photos.filter((photo) => photo.spatial.candidates.some((candidate) => candidate.kind === 'exif' && candidate.status === 'viable')).length;
  const pending = session.photos.some((photo) => photo.spatial.exifRead.state === 'pending');
  const source = placement.kind === 'gmi' ? session.loadedImport : session.positioning;
  return <section className="photo-import-placement" aria-label="Velg plassering">
    {[
      ['none', 'Uten plassering', 'Plasser bildene senere i fotolaget.'],
      ['gmi', 'Fra GMI', ''], ['gml', 'Fra GML-fil', ''],
      ['exif', 'Fra EXIF-data i bildene', pending ? 'Leser EXIF-data fra bildene …' : gps ? `${gps} av ${session.photos.length} bilder har GPS-posisjon` : 'Ingen av bildene har GPS-posisjon'],
    ].map(([kind, label, hint]) => <div className="photo-import-source" key={kind}>
      <label><input type="radio" name="import-placement" value={kind} checked={placement.kind === kind} disabled={kind === 'exif' && (!gps || pending)} onChange={() => onChange(kind)} /> <strong>{label}</strong></label>
      {hint && <p>{hint}</p>}
      {placement.kind === kind && kind === 'gmi' && <div className="photo-import-source-actions flex flex-wrap gap-2">{loadedSources.map((item) => <button type="button" className={sourceButton} key={item.id} onClick={() => onLoadedSource(item.id)}>Bruk {item.name}</button>)}<button type="button" className={sourceButton} onClick={() => gmi.current.click()}>Velg GMI-fil …</button></div>}
      {placement.kind === kind && kind === 'gml' && <div className="photo-import-source-actions"><button type="button" className={sourceButton} onClick={() => gml.current.click()}>Velg GML-fil …</button></div>}
      {placement.kind === kind && ['gmi', 'gml'].includes(kind) && <>
        {source?.state === 'ready' && <p role="status">{source.source.filename}</p>}
        {source?.state === 'pending' && <p role="status">Leser {kind.toUpperCase()}-filen …</p>}
        {source?.state === 'error' && <p role="alert">{readErrors[source.errorCode] || 'Kildefilen kunne ikke leses. Velg filen på nytt.'}</p>}
      </>}
    </div>)}
    <input hidden ref={gmi} type="file" accept=".gmi" aria-label="Velg GMI-fil" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void photoSession.setDraftGmiSource({ file }); }} />
    <input hidden ref={gml} type="file" accept=".gml" aria-label="Velg GML med bildeposisjoner" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void photoSession.importPositioningGml(file); }} />
  </section>;
}
