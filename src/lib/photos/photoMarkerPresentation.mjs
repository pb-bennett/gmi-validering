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

// Phosphor Regular Camera / Cube / FileCode / Hand / Question paths for the photo popup's placement line.
// Static SVG keeps the shared Leaflet icon model DOM-free and does not render React per marker.
const sourceGlyphPaths = Object.freeze({
  exif: 'M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.71,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm8,136a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H80a8,8,0,0,0,6.66-3.56L100.28,48h55.43l13.63,20.44A8,8,0,0,0,176,72h32a8,8,0,0,1,8,8ZM128,88a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,88Zm0,72a28,28,0,1,1,28-28A28,28,0,0,1,128,160Z',
  gmi: 'M223.68,66.15,135.68,18h0a15.88,15.88,0,0,0-15.36,0l-88,48.17a16,16,0,0,0-8.32,14v95.64a16,16,0,0,0,8.32,14l88,48.17a15.88,15.88,0,0,0,15.36,0l88-48.17a16,16,0,0,0,8.32-14V80.18A16,16,0,0,0,223.68,66.15ZM128,32h0l80.34,44L128,120,47.66,76ZM40,90l80,43.78v85.79L40,175.82Zm96,129.57V133.82L216,90v85.78Z',
  gml: 'M181.66,146.34a8,8,0,0,1,0,11.32l-24,24a8,8,0,0,1-11.32-11.32L164.69,152l-18.35-18.34a8,8,0,0,1,11.32-11.32Zm-72-24a8,8,0,0,0-11.32,0l-24,24a8,8,0,0,0,0,11.32l24,24a8,8,0,0,0,11.32-11.32L91.31,152l18.35-18.34A8,8,0,0,0,109.66,122.34ZM216,88V216a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V40A16,16,0,0,1,56,24h96a8,8,0,0,1,5.66,2.34l56,56A8,8,0,0,1,216,88Zm-56-8h28.69L160,51.31Zm40,136V96H152a8,8,0,0,1-8-8V40H56V216H200Z',
  manual: 'M188,48a27.75,27.75,0,0,0-12,2.71V44a28,28,0,0,0-54.65-8.6A28,28,0,0,0,80,60v64l-3.82-6.13a28,28,0,0,0-48.6,27.82c16,33.77,28.93,57.72,43.72,72.69C86.24,233.54,103.2,240,128,240a88.1,88.1,0,0,0,88-88V76A28,28,0,0,0,188,48Zm12,104a72.08,72.08,0,0,1-72,72c-20.38,0-33.51-4.88-45.33-16.85C69.44,193.74,57.26,171,41.9,138.58a6.36,6.36,0,0,0-.3-.58,12,12,0,0,1,20.79-12,1.76,1.76,0,0,0,.14.23l18.67,30A8,8,0,0,0,96,152V60a12,12,0,0,1,24,0v60a8,8,0,0,0,16,0V44a12,12,0,0,1,24,0v76a8,8,0,0,0,16,0V76a12,12,0,0,1,24,0Z',
  unknown: 'M140,180a12,12,0,1,1-12-12A12,12,0,0,1,140,180ZM128,72c-22.06,0-40,16.15-40,36v4a8,8,0,0,0,16,0v-4c0-11,10.77-20,24-20s24,9,24,20-10.77,20-24,20a8,8,0,0,0-8,8v8a8,8,0,0,0,16,0v-.72c18.24-3.35,32-17.9,32-35.28C168,88.15,150.06,72,128,72Zm104,56A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z',
});

export function photoPositionSourceDescription(kind) {
  const source = photoPositionSourcePresentation(kind);
  return source.kind === 'manual' ? 'Manuelt plassert' : source.kind === 'unknown' ? 'Ukjent plasseringskilde' : `Plassering fra ${source.label}`;
}

export function photoSourceGlyph(kind, size = 13) {
  const source = photoPositionSourcePresentation(kind);
  return `<svg class="photo-source-glyph" data-source-glyph="${source.kind}" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor"><path d="${sourceGlyphPaths[source.kind]}"/></svg>`;
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
      + `<span class="photo-source-dot photo-thumb-source" role="img" aria-label="${photoPositionSourceDescription(source.kind)}" style="--photo-source:${source.color}"></span>`
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
