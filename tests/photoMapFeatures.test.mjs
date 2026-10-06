import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPhotoMapFeatures, resolvePhotoLocate } from '../src/lib/photos/photoMapFeatures.mjs';
const position = { crs: 'EPSG:4326', longitude: 10, latitude: 59 };
test('visible current positions only; stable photo identities, geographic order, no co-location deduplication', () => {
  const layers = [{ id: 'l', visible: true }];
  const photos = [{ id: 'a', spatial: { current: { position } } }, { id: 'b', spatial: { current: { position } } }, { id: 'c', spatial: { current: null, candidates: [{ position }] } }];
  const features = buildPhotoMapFeatures(layers, () => photos);
  assert.equal(features.length, 2);
  assert.deepEqual(features[0].geometry.coordinates, [10, 59]);
  assert.deepEqual(Object.keys(features[0].properties), ['kind', 'layerId', 'photoId']);
  assert.notEqual(features[0].id, features[1].id);
  assert.equal(buildPhotoMapFeatures([{ ...layers[0], visible: false }], () => photos).length, 0);
  photos[0].spatial.current.position = { ...position, longitude: 11 };
  assert.equal(buildPhotoMapFeatures(layers, () => photos)[0].geometry.coordinates[0], 11);
});
test('photo locate uses owner-scoped geography regardless of visibility and never mutates current', () => {
  const photo = { spatial: { current: { position }, candidates: [{ id: 'e', status: 'viable', position: { ...position, longitude: 12 } }] } };
  const session = { getLayer: (id) => id === 'l' ? { visible: false, photoIds: ['p'] } : null, getPhoto: () => photo };
  const request = { kind: 'photo', layerId: 'l', photoId: 'p' };
  assert.strictEqual(resolvePhotoLocate(session, request), position);
  assert.equal(resolvePhotoLocate(session, { ...request, candidateId: 'e' }).longitude, 12);
  assert.strictEqual(photo.spatial.current.position, position);
  assert.equal(resolvePhotoLocate(session, { ...request, layerId: 'deleted' }), null);
  assert.equal(resolvePhotoLocate(session, { ...request, photoId: 'other' }), null);
  assert.equal(resolvePhotoLocate(session, { ...request, candidateId: 'missing' }), null);
});
