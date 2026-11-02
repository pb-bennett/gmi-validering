import { normalizePhotoDirection } from './photoDirection.mjs';

export const PHOTO_POSITION_SOURCES = Object.freeze([
  Object.freeze({ kind: 'exif', label: 'EXIF', color: '#19785b' }),
  Object.freeze({ kind: 'gmi', label: 'GMI', color: '#2463b5' }),
  Object.freeze({ kind: 'gml', label: 'GML', color: '#a03b82' }),
  Object.freeze({ kind: 'manual', label: 'Manuell', color: '#b06a08' }),
]);
const unknownSource = Object.freeze({ kind: 'unknown', label: 'Ukjent', color: '#64748b' });

export function photoPositionSourcePresentation(kind) {
  return PHOTO_POSITION_SOURCES.find((source) => source.kind === kind) || unknownSource;
}

export function photoPositionSourceKind(photo) {
  const basis = photo?.spatial?.current?.basis;
  // Candidate-backed acceptance points to one exact occurrence candidate, never the available evidence as a whole.
  const kind = basis?.kind === 'candidate'
    ? photo.spatial.candidates?.find((candidate) => candidate.id === basis.candidateId)?.kind
    : basis?.kind;
  return photoPositionSourcePresentation(kind).kind;
}

export function photoCameraGlyph({ sourceKind = 'unknown', size = 16, selected = false } = {}) {
  const source = photoPositionSourcePresentation(sourceKind);
  const ring = selected ? '<circle cx="12" cy="12" r="14" fill="none" stroke="white" stroke-width="4"/><circle cx="12" cy="12" r="14" fill="none" stroke="#172b3a" stroke-width="2"/>' : '';
  return `<svg class="photo-camera-glyph" data-position-source="${source.kind}" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" stroke-linejoin="round">${ring}<path d="M3 7h4l2-3h6l2 3h4v13H3z" fill="${source.color}" stroke="white" stroke-width="4"/><path d="M3 7h4l2-3h6l2 3h4v13H3z" fill="${source.color}" stroke="#172b3a" stroke-width="1.5"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="white" stroke-width="2"/></svg>`;
}

export function cameraMarkerOptions({ sourceKind = 'unknown', selected = false, degrees = null, proposed = false } = {}) {
  const heading = selected ? normalizePhotoDirection(degrees) : null;
  // Rotate inside the SVG around its geographic anchor. Leaflet owns the outer transform.
  const indicator = heading === null ? '' : `<svg class="photo-direction-indicator" aria-hidden="true" width="64" height="64" viewBox="0 0 64 64" data-degrees="${heading}" data-proposed="${proposed}"><g transform="rotate(${heading} 32 32)"><path d="M32 18V3m-5 6 5-6 5 6" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 18V3m-5 6 5-6 5 6" fill="none" stroke="${proposed ? '#a34c00' : '#075e9a'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
  return { className: `photo-camera-marker${selected ? ' photo-camera-marker-selected' : ''}`,
    iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -9], html: indicator + photoCameraGlyph({ sourceKind, size: selected ? 22 : 16, selected }) };
}

export const proposalMarkerOptions = {
  className: 'photo-proposed-marker', iconSize: [32, 32], iconAnchor: [16, 16],
  html: '<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24"><path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="white" stroke-width="5"/><circle cx="12" cy="12" r="6" fill="#fff4df" stroke="white" stroke-width="5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="#a34c00" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="#fff4df" stroke="#a34c00" stroke-width="2"/></svg>',
};
