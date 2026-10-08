import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { photoSession } from '../src/lib/photos/photoSession.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';

register('./esmJsLoader.mjs', import.meta.url);
const { default: useStore } = await import('../src/lib/store.js');

test('actual application reset clears attached GMI references/indexes without creating a survey map layer', async () => {
  useStore.getState().resetAll();
  const id = photoSession.importFiles([new File(['image'], 'a.jpg')]).acceptedIds[0];
  const layer = photoSession.createLayer();
  await photoSession.stageLayerSource(layer.id, gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }]), 'gmi');
  const review = photoSession.getSnapshot().sourceReviews[layer.id];
  assert(photoSession.applyGmiAssociations(layer.id, { confirmed: true, sourceId: review.source.id,
    memberIds: review.memberIds, associationLedger: review.associationLedger }).ok);
  assert.equal(photoSession.getGmiPhotoAssociations(layer.id, id).length, 1);
  assert.deepEqual(useStore.getState().layerOrder, []);
  assert.equal(useStore.getState().data, null);
  useStore.getState().resetAll();
  assert.equal(photoSession.getGmiPhotoAssociations(layer.id, id).length, 0);
  assert.deepEqual(photoSession.getSnapshot().sourceReviews, {});
  assert.deepEqual(photoSession.getSnapshot().photoLayers, []);
});

test('survey data/layer/view/error operations preserve photos; full reset clears both domains', () => {
  const original = new File(['retained'], 'unsupported.heic');
  const id = photoSession.importFiles([original]).acceptedIds[0];
  const state = useStore.getState();
  const data = { points: [], lines: [], header: {} };
  state.setData(data);
  state.clearData();
  state.clearFile();
  state.addLayer({ file: { name: 'survey.gmi', size: 10 }, data });
  const layerId = useStore.getState().layerOrder[0];
  assert(layerId);
  state.removeLayer(layerId);
  useStore.setState({ parsing: { status: 'error', error: 'failed survey import' }, ui: { ...useStore.getState().ui, activeViewTab: '3d' } });
  assert.strictEqual(photoSession.getFile(id), original);
  assert.equal(photoSession.getSnapshot().selectedId, id);
  state.resetAll();
  assert.equal(photoSession.getFile(id), null);
  assert.equal(photoSession.getSnapshot().photos.length, 0);
  assert.deepEqual(useStore.getState().layerOrder, []);
  assert.equal(useStore.getState().data, null);
  state.resetAll();
});

test('full reset invalidates a pending thumbnail batch before it can publish', async () => {
  const ids = photoSession.importFiles([new File(['pending'], 'pending.jpg')]).acceptedIds;
  assert.equal(photoSession.getSnapshot().photos[0].preview.state, 'pending');
  useStore.getState().resetAll();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(photoSession.getSnapshot().photos.length, 0);
  assert.equal(photoSession.getFile(ids[0]), null);
});

test('actual reset clears created FOTO layers and a new temporary import together', () => {
  const one = photoSession.importFiles([new File(['one'], 'one.heic')]).acceptedIds[0];
  const layer = photoSession.createLayer();
  const two = photoSession.importFiles([new File(['two'], 'two.heic')]).acceptedIds[0];
  assert.equal(photoSession.getSnapshot().photoLayers[0].type, 'FOTO');
  assert(!useStore.getState().layers[layer.id], 'photo layer stays out of survey selectors');
  useStore.getState().clearData();
  assert(photoSession.getFile(one));
  useStore.getState().resetAll();
  assert.deepEqual(photoSession.getSnapshot().photoLayers, []);
  assert.deepEqual(photoSession.getSnapshot().photos, []);
  assert.equal(photoSession.getFile(one), null);
  assert.equal(photoSession.getFile(two), null);
});

test('actual application reset clears accepted direction and invalidates its pending ticket', () => {
  const id = photoSession.importFiles([new File(['one'], 'one.heic')]).acceptedIds[0];
  const layer = photoSession.createLayer();
  assert(photoSession.applyDirectionEdit(photoSession.beginDirectionEdit(layer.id, id), 0).ok);
  const ticket = photoSession.beginDirectionEdit(layer.id, id);
  assert.equal(photoSession.getPhoto(id).direction.current.degrees, 0);
  useStore.getState().resetAll();
  assert.equal(photoSession.directionEditIsLive(ticket), false);
  assert.equal(photoSession.applyDirectionEdit(ticket, 90).ok, false);
  assert.equal(photoSession.getPhoto(id), null);
});
