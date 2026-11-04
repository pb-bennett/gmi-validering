import assert from 'node:assert/strict';
import test from 'node:test';
import { groupPhotoStacks, photoAssetNavigation, photoAssetSequence, photoSameLocationAssets, photoStackKey, photoStackMembers } from '../src/lib/photos/photoStacks.mjs';
import { photoWorkspaceView } from '../src/lib/photos/photoWorkspaceView.mjs';

const at = (latitude, longitude) => ({ current: { position: { crs: 'EPSG:4326', latitude, longitude } }, candidates: [] });
const photo = (id, assetId, spatial, filename = `${assetId}.jpg`) => ({ id, assetId, originalFilename: filename, spatial, repeatGroup: { occurrenceIndex: 1, occurrenceCount: 1 } });

test('stacks are exact identical coordinates only, never a distance threshold', () => {
  const photos = [photo('a', 'A', at(60, 10)), photo('b', 'B', at(60, 10)), photo('c', 'C', at(60, 10.0000001)), photo('u', 'U', { current: null, candidates: [] })];
  assert.equal(photoStackKey(null), null);
  assert.deepEqual([...groupPhotoStacks(photos).values()].map((members) => members.map((item) => item.id)), [['a', 'b'], ['c']]);
  assert.deepEqual(photoStackMembers(photos, photos[0]).map((item) => item.id), ['a', 'b']);
  assert.deepEqual(photoStackMembers(photos, photos[3]), [], 'an unplaced photo has no stack');
});

test('same-location gallery: one entry per asset, keeping the selected occurrence for its own asset', () => {
  const photos = [photo('a1', 'A', at(60, 10)), photo('b1', 'B', at(60, 10)), photo('a2', 'A', at(60, 10)), photo('c1', 'C', at(61, 10))];
  assert.deepEqual(photoSameLocationAssets(photos, photos[2]).map((item) => item.id), ['a2', 'b1']);
  assert.deepEqual(photoSameLocationAssets(photos, photos[0]).map((item) => item.id), ['a1', 'b1']);
  assert.deepEqual(photoSameLocationAssets(photos, photos[3]).map((item) => item.id), ['c1']);
});

test('layer-wide navigation: unique assets in the list sort order, independent of the filter, no wrapping', () => {
  const photos = [photo('b1', 'B', at(60, 10), 'b.jpg'), photo('a1', 'A', at(60, 10), 'a.jpg'), photo('b2', 'B', at(61, 10), 'b.jpg'),
    photo('c1', 'C', { current: null, candidates: [] }, 'c.jpg')];
  photos[2].repeatGroup = { occurrenceIndex: 2, occurrenceCount: 2 };
  const view = photoWorkspaceView(photos, { filter: { placement: 'unplaced', missingDirection: false, missingCaptureTime: false, repeated: false, changed: false } });
  assert.deepEqual(view.rows.map((item) => item.id), ['c1'], 'the list is filtered');
  assert.deepEqual(view.assetSequence.map((item) => item.id), ['a1', 'b1', 'c1'], 'navigation covers the whole layer, once per asset');
  assert.deepEqual(photoWorkspaceView(photos, { sort: 'filename-desc' }).assetSequence.map((item) => item.id), ['c1', 'b1', 'a1']);
  const first = photoAssetNavigation(view.assetSequence, 'A'), last = photoAssetNavigation(view.assetSequence, 'C');
  assert.deepEqual([first.index, first.total, first.previous, first.next?.id], [0, 3, null, 'b1']);
  assert.deepEqual([last.index, last.previous?.id, last.next], [2, 'b1', null]);
  assert.equal(photoAssetNavigation(view.assetSequence, 'missing').index, -1);
  assert.deepEqual(photoAssetSequence([photos[0], photos[2]]).map((item) => item.id), ['b1']);
});
