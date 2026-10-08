'use client';

import { gmiObjectLabel, gmiPhotoAssociations } from '@/lib/photos/gmiPhotoSource.mjs';
import usePhotoSession from './usePhotoSession';
import './photoGmi.css';

export default function PhotoGmiInspector({ layerId, photoId }) {
  const session = usePhotoSession();
  const associations = gmiPhotoAssociations(session.photoLayers.find((layer) => layer.id === layerId), photoId);
  if (!associations.length) return null;
  return <section className="photo-gmi-inspector" aria-label="Referert fra GMI">
    <details><summary>Referert fra GMI · {associations.length} {associations.length === 1 ? 'objekt' : 'objekter'}</summary>
      <ul>{associations.map(({ association, sourceFilename, object }) => <li key={association.id}>
        <details><summary>{gmiObjectLabel(object)}</summary>
          <p>Kilde: {sourceFilename}</p>
          <p>TEMA: {object.tema ?? 'Ikke oppgitt'} · TYPE: {object.type ?? 'Ikke oppgitt'}</p>
          <p>GUID: {object.guid || 'Ikke oppgitt'}</p>
        </details>
      </li>)}</ul>
    </details>
  </section>;
}
