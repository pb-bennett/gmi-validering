'use client';

import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function Fit({ positions }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (positions.length) map.fitBounds(positions, { padding: [28, 28], maxZoom: 21, animate: false });
  }, [map, positions]);
  return null;
}
const latLng = (position) => position ? [position.latitude, position.longitude] : null;

// Evidence map, without changing the main map's selection or any photo position.
export default function PhotoHyperlinkReviewMap({ row, candidates, selected }) {
  const original = latLng(row.placement?.position), proposed = latLng(selected?.target.placement?.position);
  const current = row.relatedPhotos.flatMap((photo) => { const point = latLng(photo.spatial.current?.position); return point ? [{ point, id: photo.id, label: photo.originalFilename }] : []; });
  const positions = [original, proposed, ...current.map((entry) => entry.point)].filter(Boolean);
  if (!positions.length) return <p>Kartet krever en sikkert tolket original-, nå- eller mottakerposisjon.</p>;
  return <div className="photo-link-map" aria-label="Kart: original LOK/TOP, akseptert bilde og foreslått mottaker">
    <p>Ring: original LOK/TOP · liten sirkel: punktobjekt på gjeldende side · stiplet ring: akseptert bilde · linje: foreslått flytting</p>
    <MapContainer center={positions[0]} zoom={18} zoomControl={false} attributionControl={false} scrollWheelZoom={false}>
      <Fit positions={positions} />
      {candidates.map(({ target }) => { const point = latLng(target.placement?.position); return point && <CircleMarker key={target.objectKey} center={point} radius={selected?.target.objectKey === target.objectKey ? 8 : 4}
        pathOptions={{ color: 'var(--gmi-interactive)', fillColor: 'var(--gmi-cyan-soft)', fillOpacity: 1, weight: 2 }}><Tooltip>{target.tema || 'Uavklart Tema'} · {target.pointName} · point:{target.sourceIndex}</Tooltip></CircleMarker>; })}
      {current.map((entry) => <CircleMarker key={entry.id} center={entry.point} radius={12} pathOptions={{ color: 'var(--gmi-text-muted)', fill: false, dashArray: '3 3', weight: 2 }}><Tooltip>Akseptert: {entry.label}</Tooltip></CircleMarker>)}
      {original && <CircleMarker center={original} radius={6} pathOptions={{ color: 'var(--gmi-navy)', fill: false, weight: 3 }}><Tooltip>Original LOK/TOP · {row.label}</Tooltip></CircleMarker>}
      {original && proposed && <Polyline positions={[original, proposed]} pathOptions={{ color: 'var(--gmi-interactive)', dashArray: '5 5' }} />}
    </MapContainer>
  </div>;
}
