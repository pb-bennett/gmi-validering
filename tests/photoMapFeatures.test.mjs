import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildPhotoMapFeatures, photoLayerMapFit, resolvePhotoLocate } from '../src/lib/photos/photoMapFeatures.mjs';
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

test('FOTO fit uses only valid accepted positions, with zoom 18 for a point or a cluster under 10 metres', () => {
  const placed = (coordinates) => ({ spatial: { current: { position: { ...position, ...coordinates } } } });
  const unplaced = { spatial: { current: null, candidates: [{ position }] } };
  const invalid = placed({ latitude: Infinity });
  assert.equal(photoLayerMapFit([unplaced, invalid]), null);
  assert.deepEqual(photoLayerMapFit([placed({}), unplaced]), { bounds: [[59, 10], [59, 10]], zoom: 18 });
  assert.deepEqual(photoLayerMapFit([placed({}), placed({}), invalid]), { bounds: [[59, 10], [59, 10]], zoom: 18 });
  assert.deepEqual(photoLayerMapFit([placed({ latitude: 59.00008 }), placed({})]), { bounds: [[59, 10], [59.00008, 10]], zoom: 18 });
  assert.deepEqual(photoLayerMapFit([placed({ longitude: 10.001 }), placed({ latitude: 59.0001 })]),
    { bounds: [[59, 10], [59.0001, 10.001]], maxZoom: 20 });
  // Just above the 10 m boundary (≈10.6 m) the general cap applies instead of the fixed point zoom.
  assert.deepEqual(photoLayerMapFit([placed({ latitude: 59.000095 }), placed({})]), { bounds: [[59, 10], [59.000095, 10]], maxZoom: 20 });
});

test('automatic FOTO fit is wired only to positioned creation and successful initial source placement', async () => {
  const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const [page, wizard, controller] = await Promise.all(['app/page.js', 'components/photos/PhotoPositioningWizard.js', 'components/photos/PhotoMapController.js'].map(read));
  assert.match(page, /openPhotoLayer\(result\.layer\.id, null, null, \{ fit: !append && result\.outcome\.placed > 0 \}\)/);
  assert.match(page, /if \(fit\) requestPhotoFit\(id\)/);
  assert.match(page, /if \(layerId === workspaceLayer\?\.id && initialPlacement && acceptedIds\.length\) requestPhotoFit\(layerId\)/);
  assert.equal([...page.matchAll(/requestPhotoFit\(/g)].length, 2);
  assert.match(wizard, /const initialPlacement = !photoSession\.getLayerPhotos\(layer\.id\)\.some\(\(photo\) => photo\.spatial\.current\)/);
  // B3: the saved transaction's result drives the fit when the wizard is closed from «Endringer lagret».
  assert.match(wizard, /setSaved\(\{ \.\.\.result, layerId: layer\.id, initialPlacement, stepKeys: steps\.map\(\(\{ key \}\) => key\) \}\)/);
  assert.match(wizard, /const close = \(\) => \{\s*if \(saved\) onApplied\?\.\(saved\);/);
  assert.equal([...wizard.matchAll(/onApplied\?\.\(/g)].length, 1, 'only a saved transaction is reported; connection-only has no accepted ids, so no fit');
  assert.match(controller, /\[map, fitRequest, onFitHandled\]/);
  assert.match(controller, /\[map, panRequest\]/);
  assert.match(controller, /map\.panInside\(/);
  assert.doesNotMatch(controller, /initialFitDone|hasSurveyData/);
});
