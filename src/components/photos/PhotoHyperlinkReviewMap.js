'use client';

import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { photoCurrentSource } from '@/lib/photos/photoPresentation.mjs';

// The evidence map has no base map, so it may zoom past tile levels: at zoom 24 a 0,16 m separation is ~30 px.
const EVIDENCE_MAX_ZOOM = 24;
function Fit({ positions }) {
  const map = useMap();
  const key = JSON.stringify(positions);
  useEffect(() => {
    map.invalidateSize();
    const points = JSON.parse(key);
    if (points.length) map.fitBounds(points, { padding: [32, 32], maxZoom: EVIDENCE_MAX_ZOOM, animate: false });
  }, [map, key]);
  return null;
}
const latLng = (position) => position ? [position.latitude, position.longitude] : null;
const objectName = (object) => `${object.tema || 'Uavklart Tema'} · ${object.pointName}`;

/**
 * Evidence map, without changing the main map's selection or any photo position. By default it shows only the source
 * object, the selected recipient, the photograph's accepted position (with its provenance) and the proposed move;
 * `others` adds the other point objects of the current candidate page.
 */
export default function PhotoHyperlinkReviewMap({ row, selected, others = [] }) {
  const original = latLng(row.placement?.position), proposed = latLng(selected?.target.placement?.position);
  const current = row.relatedPhotos.flatMap((photo) => {
    const point = latLng(photo.spatial.current?.position);
    return point ? [{ point, id: photo.id, label: `${photo.originalFilename} · ${photoCurrentSource(photo) || 'akseptert posisjon'}` }] : [];
  });
  const shown = others.filter(({ target }) => target.objectKey !== selected?.target.objectKey);
  const evidence = [original, proposed, ...current.map((entry) => entry.point)].filter(Boolean);
  if (!evidence.length) return <p>Kartet krever en sikkert tolket original-, nå- eller mottakerposisjon.</p>;
  // Other point objects are fitted only when the user asks for them; by default the view zooms to the evidence itself.
  const positions = [...evidence, ...shown.map(({ target }) => latLng(target.placement?.position)).filter(Boolean)];
  return <div className="photo-link-map" aria-label="Kart: kildeobjekt, bildets posisjon og valgt mottaker">
    <ul className="photo-link-map-legend">
      <li><span className="photo-link-map-swatch" data-kind="source" aria-hidden="true" />Kilde: {objectName(row)}</li>
      {selected && <li><span className="photo-link-map-swatch" data-kind="recipient" aria-hidden="true" />Mottaker: {objectName(selected.target)}</li>}
      <li><span className="photo-link-map-swatch" data-kind="photo" aria-hidden="true" />{current.length ? `Bilde: ${current.map((entry) => entry.label).join('; ')}` : 'Bilde: uplassert'}</li>
      {shown.length > 0 && <li><span className="photo-link-map-swatch" data-kind="other" aria-hidden="true" />Andre punktobjekter ({shown.length})</li>}
    </ul>
    <MapContainer center={evidence[0]} zoom={18} zoomControl={false} attributionControl={false} scrollWheelZoom={false}>
      <Fit positions={positions} />
      {shown.map(({ target }) => { const point = latLng(target.placement?.position); return point && <CircleMarker key={target.objectKey} center={point} radius={3}
        pathOptions={{ color: 'var(--gmi-text-subtle)', fillColor: 'var(--gmi-surface)', fillOpacity: 1, weight: 1 }} className="photo-link-map-other"><Tooltip>{objectName(target)} · point:{target.sourceIndex}</Tooltip></CircleMarker>; })}
      {current.map((entry) => <CircleMarker key={entry.id} center={entry.point} radius={14} pathOptions={{ color: 'var(--gmi-text-muted)', fill: false, dashArray: '3 3', weight: 2 }} className="photo-link-map-photo"><Tooltip>Bilde: {entry.label}</Tooltip></CircleMarker>)}
      {original && proposed && <Polyline positions={[original, proposed]} pathOptions={{ color: 'var(--gmi-interactive)', dashArray: '5 5', weight: 2 }} className="photo-link-map-move" />}
      {original && <CircleMarker center={original} radius={10} pathOptions={{ color: 'var(--gmi-navy)', fill: false, weight: 3 }} className="photo-link-map-source"><Tooltip>Kilde: {objectName(row)}{row.identifierText ? ` · ${row.identifierText}` : ''}</Tooltip></CircleMarker>}
      {proposed && <CircleMarker center={proposed} radius={5} pathOptions={{ color: 'var(--gmi-surface)', fillColor: 'var(--gmi-interactive)', fillOpacity: 1, weight: 2 }} className="photo-link-map-recipient">
        <Tooltip>Mottaker: {objectName(selected.target)}{selected.target.identifierText ? ` · ${selected.target.identifierText}` : ''}</Tooltip></CircleMarker>}
    </MapContainer>
  </div>;
}
