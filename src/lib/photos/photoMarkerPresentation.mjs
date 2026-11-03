import { normalizePhotoDirection } from './photoDirection.mjs';

export const PHOTO_POSITION_SOURCES = Object.freeze([
  Object.freeze({ kind: 'exif', label: 'EXIF', color: '#19785b' }),
  Object.freeze({ kind: 'gmi', label: 'GMI', color: '#2463b5' }),
  Object.freeze({ kind: 'gml', label: 'GML', color: '#a03b82' }),
  Object.freeze({ kind: 'manual', label: 'Manuell', color: '#b06a08' }),
]);
const unknownSource = Object.freeze({ kind: 'unknown', label: 'Ukjent', color: '#64748b' });

// Initial acceptance value; thumbnails below this zoom fall back to ordinary markers.
export const PHOTO_THUMBNAIL_MIN_ZOOM = 16;
export const PHOTO_THUMBNAIL_SIZE = 44;
// Direction is navy with a white halo: distinct from every provenance colour and the edit teal.
export const PHOTO_DIRECTION_COLOR = '#0F172B';
export const PHOTO_SIBLING_COLOR = '#64748b';
export const PHOTO_STAGED_COLOR = '#007595';
export const PHOTO_STAGED_DASH = '3.5 3';
export const PHOTO_MAP_DISPLAY_MODES = Object.freeze(['markers', 'thumbnails']);

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

const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Map icons only ever reuse session-owned derived thumbnails, never another URL scheme.
const safeThumbnailUrl = (url) => typeof url === 'string' && /^(blob:|data:image\/)/.test(url) ? url : null;

export function photoCameraGlyph({ sourceKind = 'unknown', size = 16, selected = false, sibling = false } = {}) {
  const source = photoPositionSourcePresentation(sourceKind);
  const ring = selected ? '<circle cx="12" cy="12" r="14" fill="none" stroke="white" stroke-width="4"/><circle cx="12" cy="12" r="14" fill="none" stroke="#172b3a" stroke-width="2"/>'
    : sibling ? `<circle class="photo-sibling-ring" cx="12" cy="12" r="14" fill="none" stroke="white" stroke-width="3"/><circle cx="12" cy="12" r="14" fill="none" stroke="${PHOTO_SIBLING_COLOR}" stroke-width="1.5" stroke-dasharray="3 2.5"/>` : '';
  return `<svg class="photo-camera-glyph" data-position-source="${source.kind}" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" stroke-linejoin="round">${ring}<path d="M3 7h4l2-3h6l2 3h4v13H3z" fill="${source.color}" stroke="white" stroke-width="4"/><path d="M3 7h4l2-3h6l2 3h4v13H3z" fill="${source.color}" stroke="#172b3a" stroke-width="1.5"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="white" stroke-width="2"/></svg>`;
}

// Rotation happens inside the SVG around the geographic anchor; Leaflet owns the outer transform.
// 0° = up = geographic north, clockwise. Unknown direction draws nothing, never an implicit north.
export function photoDirectionArrow({ degrees = null, staged = false, mode = 'markers' } = {}) {
  const heading = normalizePhotoDirection(degrees);
  if (heading === null) return '';
  const thumbnail = mode === 'thumbnails';
  const size = thumbnail ? 100 : 64, centre = size / 2, inner = thumbnail ? 26 : 14, outer = thumbnail ? 46 : 29;
  const shaft = `M${centre} ${centre - inner}V${centre - outer}`, head = `M${centre - 5} ${centre - outer + 6}l5-6 5 6`;
  const stroke = (d, color, width, cap = 'round', extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="round"${extra}/>`;
  // Staged is a dashed shaft with butt caps; round caps would close the gaps and read as solid.
  return `<svg class="photo-direction-indicator" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" data-degrees="${heading}" data-staged="${Boolean(staged)}"><g transform="rotate(${heading} ${centre} ${centre})">${stroke(`${shaft}${head}`, 'white', 5)}${staged ? stroke(shaft, PHOTO_DIRECTION_COLOR, 2.5, 'butt', ` stroke-dasharray="${PHOTO_STAGED_DASH}"`) : stroke(shaft, PHOTO_DIRECTION_COLOR, 2.5)}${stroke(head, PHOTO_DIRECTION_COLOR, 2.5)}</g></svg>`;
}

// Compact legend sample of the same navy arrow (solid = accepted, dashed = staged).
export function photoLegendArrow({ staged = false } = {}) {
  const shaft = 'M5 15L14 6', head = 'M8 6h6v6';
  return `<svg class="photo-legend-arrow" aria-hidden="true" width="20" height="20" viewBox="0 0 20 20"><path d="${shaft}${head}" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="${shaft}" fill="none" stroke="${PHOTO_DIRECTION_COLOR}" stroke-width="2.25" stroke-linecap="${staged ? 'butt' : 'round'}"${staged ? ' stroke-dasharray="2.5 2"' : ''}/><path d="${head}" fill="none" stroke="${PHOTO_DIRECTION_COLOR}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const stagedDot = (staged) => staged ? '<span class="photo-marker-staged-dot" aria-hidden="true"></span>' : '';
const stackBadge = (count) => count > 1 ? `<span class="photo-marker-stack" aria-hidden="true">${Math.min(count, 99)}</span>` : '';
const modifierClasses = ({ selected, sibling, staged, editing }) => [selected && 'photo-marker-selected', sibling && 'photo-marker-sibling',
  staged && 'photo-marker-staged', editing && 'photo-marker-editing'].filter(Boolean).join(' ');

export function cameraMarkerOptions({ sourceKind = 'unknown', selected = false, degrees = null, staged = false, directionStaged = false,
  sibling = false, stackCount = 1, editing = false } = {}) {
  const modifiers = modifierClasses({ selected, sibling: sibling && !selected, staged, editing });
  return { className: `photo-camera-marker${selected ? ' photo-camera-marker-selected' : ''}${modifiers ? ` ${modifiers}` : ''}`,
    iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -9],
    html: photoDirectionArrow({ degrees, staged: directionStaged, mode: 'markers' })
      + photoCameraGlyph({ sourceKind, size: selected ? 22 : 16, selected, sibling: sibling && !selected }) + stagedDot(staged) + stackBadge(stackCount) };
}

const thumbnailFallback = '<svg class="photo-thumb-fallback" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><path d="M3 7h4l2-3h6l2 3h4v13H3z" fill="#e2e8f0" stroke="#475569" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="#475569" stroke-width="1.5"/></svg>';

export function thumbnailMarkerOptions({ sourceKind = 'unknown', selected = false, degrees = null, staged = false, directionStaged = false,
  sibling = false, stackCount = 1, editing = false, thumbnailUrl = null } = {}) {
  const source = photoPositionSourcePresentation(sourceKind);
  const url = safeThumbnailUrl(thumbnailUrl);
  const image = url ? `<img src="${escapeHtml(url)}" alt="" decoding="async" draggable="false">` : thumbnailFallback;
  const modifiers = modifierClasses({ selected, sibling: sibling && !selected, staged, editing });
  return { className: `photo-thumb-marker${modifiers ? ` ${modifiers}` : ''}`,
    iconSize: [PHOTO_THUMBNAIL_SIZE, PHOTO_THUMBNAIL_SIZE], iconAnchor: [PHOTO_THUMBNAIL_SIZE / 2, PHOTO_THUMBNAIL_SIZE / 2], popupAnchor: [0, -24],
    html: photoDirectionArrow({ degrees, staged: directionStaged, mode: 'thumbnails' })
      + `<div class="photo-thumb" data-position-source="${source.kind}" data-thumbnail="${url ? 'ready' : 'fallback'}" style="--photo-source:${source.color}">${image}</div>`
      + (editing && selected ? '<span class="photo-thumb-anchor" aria-hidden="true"></span>' : '') + stagedDot(staged) + stackBadge(stackCount) };
}

export function photoMarkerOptions(mode, options) {
  return mode === 'thumbnails' ? thumbnailMarkerOptions(options) : cameraMarkerOptions(options);
}

// Stable cache key: identical presentation reuses one L.divIcon instance (and DOM-free comparisons).
export function photoMarkerIconKey(mode, { sourceKind = 'unknown', selected = false, degrees = null, staged = false, directionStaged = false,
  sibling = false, stackCount = 1, editing = false, thumbnailUrl = null } = {}) {
  return JSON.stringify([mode === 'thumbnails' ? 't' : 'm', photoPositionSourcePresentation(sourceKind).kind, Boolean(selected), normalizePhotoDirection(degrees),
    Boolean(staged), Boolean(directionStaged), Boolean(sibling && !selected), stackCount > 1 ? Math.min(stackCount, 99) : 1, Boolean(editing),
    mode === 'thumbnails' ? safeThumbnailUrl(thumbnailUrl) : null]);
}

export const photoThumbnailsVisible = (mode, zoom) => mode === 'thumbnails' && Number.isFinite(zoom) && zoom >= PHOTO_THUMBNAIL_MIN_ZOOM;
