import { photoPositionSourceKind } from './photoMarkerPresentation.mjs';
import { gmiObjectContext } from './photoImportOutcome.mjs';
import { isPhotoPosition } from './photoSpatial.mjs';
import { DEFAULT_PHOTO_FILTER, DEFAULT_PHOTO_SORT, photoFilterIsDefault } from './photoWorkspaceState.mjs';

export const PHOTO_SORT_MODES = Object.freeze([
  Object.freeze({ key: 'filename-asc', label: 'Filnavn A–Å' }),
  Object.freeze({ key: 'filename-desc', label: 'Filnavn Å–A' }),
  Object.freeze({ key: 'capture-asc', label: 'Opptakstid, eldst først' }),
  Object.freeze({ key: 'capture-desc', label: 'Opptakstid, nyest først' }),
  Object.freeze({ key: 'unplaced-first', label: 'Uplasserte først' }),
  Object.freeze({ key: 'source', label: 'Posisjonskilde' }),
  Object.freeze({ key: 'object', label: 'GMI-objekt / AnleggsID' }),
]);
export const PHOTO_PLACEMENT_FILTERS = Object.freeze([
  Object.freeze({ key: 'all', label: 'Alle' }), Object.freeze({ key: 'placed', label: 'Plassert' }),
  Object.freeze({ key: 'unplaced', label: 'Uplassert' }), Object.freeze({ key: 'exif', label: 'EXIF' }),
  Object.freeze({ key: 'gmi', label: 'GMI' }), Object.freeze({ key: 'gml', label: 'GML' }),
  Object.freeze({ key: 'manual', label: 'Manuell' }), Object.freeze({ key: 'unknown', label: 'Ukjent' }),
]);
const SOURCE_ORDER = ['exif', 'gmi', 'gml', 'manual', 'unknown', 'unplaced'];
const collator = new Intl.Collator('nb', { numeric: true, sensitivity: 'base' });

export const photoSortLabel = (key) => PHOTO_SORT_MODES.find((mode) => mode.key === key)?.label || PHOTO_SORT_MODES[0].label;
export const photoIsPlaced = (photo) => isPhotoPosition(photo.spatial?.current?.position);
export const photoPlacementKind = (photo) => photoIsPlaced(photo) ? photoPositionSourceKind(photo) : 'unplaced';
export const photoIsRepeated = (photo) => (photo.repeatGroup?.occurrenceCount || 1) > 1 || (photo.repeatGroup?.referringObjectCount || 0) > 1;
export const photoMissingDirection = (photo) => photoIsPlaced(photo) && photo.direction?.current == null;
export const photoMissingCaptureTime = (photo) => photo.captureMetadata?.captureTime == null;

// Compare the local date-time part only. Mixed offsets are never converted: no timezone is invented.
export const photoLocalCaptureKey = (photo) => photo.captureMetadata?.captureTime?.value?.iso?.replace(/(Z|[+-]\d{2}:\d{2})$/, '') || null;

function matchesPlacement(photo, placement) {
  if (placement === 'all') return true;
  if (placement === 'placed') return photoIsPlaced(photo);
  if (placement === 'unplaced') return !photoIsPlaced(photo);
  return photoPlacementKind(photo) === placement;
}

export function photoMatchesFilter(photo, filter, changedIds) {
  return matchesPlacement(photo, filter.placement)
    && (!filter.missingDirection || photoMissingDirection(photo))
    && (!filter.missingCaptureTime || photoMissingCaptureTime(photo))
    && (!filter.repeated || photoIsRepeated(photo))
    && (!filter.changed || changedIds.has(photo.id));
}

function compareFilename(a, b) {
  return collator.compare(a.photo.originalFilename || '', b.photo.originalFilename || '')
    || (a.photo.repeatGroup?.occurrenceIndex || 0) - (b.photo.repeatGroup?.occurrenceIndex || 0) || a.index - b.index;
}
function knownFirst(a, b, compare) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b);
}

const comparators = {
  'filename-asc': compareFilename,
  'filename-desc': (a, b) => -collator.compare(a.photo.originalFilename || '', b.photo.originalFilename || '')
    || (a.photo.repeatGroup?.occurrenceIndex || 0) - (b.photo.repeatGroup?.occurrenceIndex || 0) || a.index - b.index,
  'capture-asc': (a, b) => knownFirst(a.capture, b.capture, (x, y) => x < y ? -1 : x > y ? 1 : 0) || compareFilename(a, b),
  'capture-desc': (a, b) => knownFirst(a.capture, b.capture, (x, y) => x < y ? 1 : x > y ? -1 : 0) || compareFilename(a, b),
  'unplaced-first': (a, b) => Number(photoIsPlaced(a.photo)) - Number(photoIsPlaced(b.photo)) || compareFilename(a, b),
  source: (a, b) => SOURCE_ORDER.indexOf(photoPlacementKind(a.photo)) - SOURCE_ORDER.indexOf(photoPlacementKind(b.photo)) || compareFilename(a, b),
  object: (a, b) => knownFirst(a.object, b.object, (x, y) => collator.compare(x, y)) || compareFilename(a, b),
};

export function photoPlacementCounts(photos) {
  const counts = Object.fromEntries(PHOTO_PLACEMENT_FILTERS.map((item) => [item.key, 0]));
  for (const photo of photos) {
    counts.all++;
    if (photoIsPlaced(photo)) { counts.placed++; counts[photoPlacementKind(photo)]++; } else counts.unplaced++;
  }
  return counts;
}

export function photoFilterSummary(filter) {
  return [
    filter.placement !== 'all' && PHOTO_PLACEMENT_FILTERS.find((item) => item.key === filter.placement)?.label,
    filter.missingDirection && 'Mangler retning', filter.missingCaptureTime && 'Mangler opptakstid',
    filter.repeated && 'Flere plasseringer', filter.changed && 'Endret',
  ].filter(Boolean);
}

// One derived view for the list and the workspace map. The selected occurrence is never hidden:
// when filtered out it is pinned in the list and still rendered on the map.
export function photoWorkspaceView(photos, { activePhotoId = null, filter = DEFAULT_PHOTO_FILTER, sort = DEFAULT_PHOTO_SORT } = {}, { changedIds = new Set() } = {}) {
  const entries = photos.map((photo, index) => ({ photo, index, capture: photoLocalCaptureKey(photo),
    object: photo.occurrence?.object ? gmiObjectContext(photo.occurrence.object) : null }));
  const hasObjects = entries.some((entry) => entry.object !== null);
  const sortKey = comparators[sort] && (sort !== 'object' || hasObjects) ? sort : DEFAULT_PHOTO_SORT;
  const matching = entries.filter((entry) => photoMatchesFilter(entry.photo, filter, changedIds));
  const rows = matching.sort(comparators[sortKey]).map((entry) => entry.photo);
  const active = photos.find((photo) => photo.id === activePhotoId) || null;
  const pinned = active && !rows.includes(active) ? active : null;
  const visibleIds = new Set(rows.map((photo) => photo.id));
  if (pinned) visibleIds.add(pinned.id);
  return {
    rows, pinned, visibleIds, sort: sortKey, hasObjects,
    filterActive: !photoFilterIsDefault(filter), sortActive: sortKey !== DEFAULT_PHOTO_SORT,
    summary: photoFilterSummary(filter), shownCount: rows.length, totalCount: photos.length,
    counts: { ...photoPlacementCounts(photos),
      missingDirection: photos.filter(photoMissingDirection).length,
      missingCaptureTime: photos.filter(photoMissingCaptureTime).length,
      repeated: photos.filter(photoIsRepeated).length,
      changed: photos.filter((photo) => changedIds.has(photo.id)).length },
  };
}
