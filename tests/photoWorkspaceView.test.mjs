import assert from 'node:assert/strict';
import test from 'node:test';
import { photoWorkspaceView, photoLocalCaptureKey, photoSortLabel, PHOTO_SORT_MODES } from '../src/lib/photos/photoWorkspaceView.mjs';
import { DEFAULT_PHOTO_FILTER } from '../src/lib/photos/photoWorkspaceState.mjs';
import { buildPhotoMapItems } from '../src/lib/photos/photoMapFeatures.mjs';
import { createPhotoEditState, effectivePhoto, photoEditReducer } from '../src/lib/photos/photoEditSession.mjs';

const at = (longitude) => ({ crs: 'EPSG:4326', longitude, latitude: 59 });
const placed = (kind, longitude) => kind === 'manual' ? { position: at(longitude), basis: { kind: 'manual' } }
  : { position: at(longitude), basis: { kind: 'candidate', candidateId: kind } };
const time = (iso) => ({ value: { iso } });
const object = (anleggsId) => ({ objectKey: `o${anleggsId}`, geometryScope: 'point', attributes: {}, identifiers: { AnleggsID: anleggsId } });
function photo(id, filename, { kind = null, degrees = null, capture = null, repeat = [1, 1], refs = 0, occurrence = null, longitude = 10 } = {}) {
  return { id, assetId: id.split(':')[0], originalFilename: filename,
    spatial: { candidates: ['exif', 'gmi', 'gml'].map((item) => ({ id: item, kind: item })), current: kind ? placed(kind, longitude) : null },
    direction: { current: degrees === null ? null : { degrees } },
    captureMetadata: { captureTime: capture ? time(capture) : null, photographer: null },
    repeatGroup: { occurrenceCount: repeat[1], occurrenceIndex: repeat[0], referringObjectCount: refs }, occurrence };
}
const photos = [
  photo('p10', 'IMG_10.jpg', { kind: 'gmi', degrees: 90, capture: '2026-05-12T14:33:02+02:00', occurrence: { object: object(20) } }),
  photo('p2', 'IMG_2.jpg', { kind: 'exif', capture: '2026-05-12T09:00:00Z' }),
  photo('s:1', 'shared.jpg', { kind: 'gmi', repeat: [1, 2], refs: 2, occurrence: { object: object(3) } }),
  photo('s:2', 'shared.jpg', { kind: 'manual', degrees: 10, repeat: [2, 2], refs: 2, capture: '2026-05-12', occurrence: { object: object(100) } }),
  photo('u', 'img_1.jpg'),
  photo('g', 'Z.jpg', { kind: 'gml', capture: '2026-05-13T08:00' }),
];
const view = (workspace, options) => photoWorkspaceView(photos, { filter: DEFAULT_PHOTO_FILTER, ...workspace }, options);
const ids = (result) => result.rows.map((item) => item.id);

test('default sort is filename A–Å with numeric, case-insensitive collation and sibling adjacency', () => {
  const result = view({});
  assert.deepEqual(ids(result), ['u', 'p2', 'p10', 's:1', 's:2', 'g']);
  assert.equal(result.filterActive, false); assert.equal(result.sortActive, false);
  assert.deepEqual(ids(view({ sort: 'filename-desc' })), ['g', 's:1', 's:2', 'p10', 'p2', 'u']);
  assert.equal(photoSortLabel('nope'), 'Filnavn A–Å');
  assert.equal(PHOTO_SORT_MODES[0].key, 'filename-asc');
});

test('capture sorts compare local date-time without timezone conversion and keep unknown last', () => {
  assert.equal(photoLocalCaptureKey(photos[0]), '2026-05-12T14:33:02');
  assert.equal(photoLocalCaptureKey(photos[1]), '2026-05-12T09:00:00');
  assert.deepEqual(ids(view({ sort: 'capture-asc' })), ['s:2', 'p2', 'p10', 'g', 'u', 's:1']);
  assert.deepEqual(ids(view({ sort: 'capture-desc' })), ['g', 'p10', 'p2', 's:2', 'u', 's:1']);
});

test('unplaced-first, source and object sorts', () => {
  assert.deepEqual(ids(view({ sort: 'unplaced-first' })), ['u', 'p2', 'p10', 's:1', 's:2', 'g']);
  assert.deepEqual(ids(view({ sort: 'source' })), ['p2', 'p10', 's:1', 'g', 's:2', 'u']);
  const objectSort = view({ sort: 'object' });
  assert(objectSort.hasObjects);
  assert.deepEqual(ids(objectSort), ['s:1', 'p10', 's:2', 'u', 'p2', 'g'], 'AnleggsID numeric, then unlinked by filename');
  const noObjects = photoWorkspaceView(photos.filter((item) => !item.occurrence), { sort: 'object' });
  assert.equal(noObjects.sort, 'filename-asc', 'object sort is unavailable without linked occurrences');
});

test('every filter, AND combination and counts', () => {
  const { counts } = view({});
  assert.deepEqual([counts.all, counts.placed, counts.unplaced, counts.exif, counts.gmi, counts.gml, counts.manual], [6, 5, 1, 1, 2, 1, 1]);
  assert.equal(counts.missingDirection, 3, 'only placed occurrences can miss a direction');
  assert.equal(counts.missingCaptureTime, 2);
  assert.equal(counts.repeated, 2);
  for (const [placement, expected] of [['placed', ['p2', 'p10', 's:1', 's:2', 'g']], ['unplaced', ['u']], ['exif', ['p2']], ['gmi', ['p10', 's:1']], ['gml', ['g']], ['manual', ['s:2']]]) {
    assert.deepEqual(ids(view({ filter: { ...DEFAULT_PHOTO_FILTER, placement } })), expected, placement);
  }
  assert.deepEqual(ids(view({ filter: { ...DEFAULT_PHOTO_FILTER, missingDirection: true } })), ['p2', 's:1', 'g']);
  assert.deepEqual(ids(view({ filter: { ...DEFAULT_PHOTO_FILTER, missingCaptureTime: true } })), ['u', 's:1']);
  assert.deepEqual(ids(view({ filter: { ...DEFAULT_PHOTO_FILTER, repeated: true } })), ['s:1', 's:2']);
  const combined = view({ filter: { ...DEFAULT_PHOTO_FILTER, placement: 'gmi', missingDirection: true, repeated: true } });
  assert.deepEqual(ids(combined), ['s:1']);
  assert.deepEqual(combined.summary, ['GMI', 'Mangler retning', 'Flere plasseringer']);
  assert(combined.filterActive); assert.equal(combined.shownCount, 1); assert.equal(combined.totalCount, 6);
});

test('the selected occurrence stays visible: pinned in the list and kept in the map include set', () => {
  const result = view({ activePhotoId: 'u', filter: { ...DEFAULT_PHOTO_FILTER, placement: 'gmi' } });
  assert.deepEqual(ids(result), ['p10', 's:1']);
  assert.equal(result.pinned.id, 'u');
  assert.deepEqual([...result.visibleIds].sort(), ['p10', 's:1', 'u']);
  assert.equal(view({ activePhotoId: 'p10', filter: { ...DEFAULT_PHOTO_FILTER, placement: 'gmi' } }).pinned, null);
  // The map renders exactly the same filtered set, with the selected photo always present.
  const selectedPlaced = view({ activePhotoId: 'g', filter: { ...DEFAULT_PHOTO_FILTER, placement: 'exif' } });
  const items = buildPhotoMapItems([{ id: 'layer', visible: true }], () => photos, { include: { layerId: 'layer', ids: selectedPlaced.visibleIds } });
  assert.deepEqual(items.map((item) => item.photo.id).sort(), ['g', 'p2']);
  const other = buildPhotoMapItems([{ id: 'layer', visible: true }, { id: 'other', visible: true }], (id) => id === 'other' ? [photos[0]] : photos,
    { include: { layerId: 'layer', ids: selectedPlaced.visibleIds } });
  assert.equal(other.filter((item) => item.layerId === 'other').length, 1, 'other layers are not filtered');
});

test('effective staged sources drive filters; the changed filter uses staged ids', () => {
  const ticket = { id: 't', layerId: 'layer', baseline: Object.fromEntries(photos.map((item) => [item.id, { current: item.spatial.current, direction: item.direction.current }])) };
  let state = createPhotoEditState(ticket);
  state = photoEditReducer(state, { type: 'stage', photoId: 'p2', field: 'position', value: at(11), at: 1 });
  state = photoEditReducer(state, { type: 'stage', photoId: 'u', field: 'position', value: at(12), at: 2 });
  const effective = photos.map((item) => effectivePhoto(item, state));
  const changedIds = new Set(Object.keys(state.staged));
  const result = photoWorkspaceView(effective, { filter: { ...DEFAULT_PHOTO_FILTER, placement: 'manual' } }, { changedIds });
  assert.deepEqual(ids(result), ['u', 'p2', 's:2'], 'staged moves count as Manuell');
  assert.equal(result.counts.unplaced, 0);
  assert.deepEqual(ids(photoWorkspaceView(effective, { filter: { ...DEFAULT_PHOTO_FILTER, changed: true } }, { changedIds })), ['u', 'p2']);
  assert.equal(photoWorkspaceView(effective, {}, { changedIds }).counts.changed, 2);
  const items = buildPhotoMapItems([{ id: 'layer', visible: true }], () => photos, { photosByLayer: new Map([['layer', effective]]) });
  assert.deepEqual(items.find((item) => item.photo.id === 'u').feature.geometry.coordinates, [12, 59], 'staged placement of an unplaced photo reaches the map');
  assert.deepEqual(items.find((item) => item.photo.id === 'p2').feature.geometry.coordinates, [11, 59], 'staged move overrides canonical position');
});
