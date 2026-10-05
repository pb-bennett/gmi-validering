import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession, EMPTY_PHOTO_SNAPSHOT } from '../src/lib/photos/photoSession.mjs';

const source = (name) => new File(['original bytes'], name, { type: 'image/jpeg', lastModified: 123 });
const preview = () => ({ dimensions: { width: 100, height: 50 }, thumbnailBlob: new Blob(['thumbnail']) });
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('Photo work did not complete');
}
function setup(createThumbnail = async () => preview()) {
  let id = 0;
  const revoked = [];
  const allocated = [];
  const session = createPhotoSession({ createThumbnail, createId: () => `id-${++id}`,
    yieldJob: () => new Promise((resolve) => setImmediate(resolve)),
    urls: {
      createObjectURL: () => { const url = `blob:${allocated.length}`; allocated.push(url); return url; },
      revokeObjectURL: (url) => revoked.push(url),
    },
  });
  return { session, revoked, allocated };
}

test('batch selection is independent of inspected photo; toggle/select all/clear work', () => {
  const { session } = setup();
  const ids = session.importFiles([source('a.jpg'), source('b.jpg'), source('c.jpg')]).acceptedIds;
  session.toggleBatchSelection(ids[1]);
  assert.equal(session.getSnapshot().selectedId, ids[0]);
  assert.deepEqual(session.getSnapshot().batchSelectedIds, [ids[1]]);
  session.select(ids[2]);
  assert.deepEqual(session.getSnapshot().batchSelectedIds, [ids[1]]);
  session.toggleBatchSelection(ids[1]);
  assert.deepEqual(session.getSnapshot().batchSelectedIds, []);
  session.toggleBatchSelection('missing');
  session.selectAll();
  assert.deepEqual(session.getSnapshot().batchSelectedIds, ids);
  session.clearSelection();
  assert.equal(session.getSnapshot().selectedId, ids[2]);
  assert.deepEqual(session.getSnapshot().batchSelectedIds, []);
  session.clear();
});

test('removal preserves remaining order, chooses a next inspected photo, releases only removed resources', async () => {
  const { session, revoked } = setup();
  const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'].map(source);
  const ids = session.importFiles(files).acceptedIds;
  await until(() => session.getSnapshot().photos.every((p) => p.preview.state === 'ready'));
  const removedUrls = [session.getPhoto(ids[1]).preview.thumbnailUrl, session.getPhoto(ids[3]).preview.thumbnailUrl];
  session.select(ids[1]);
  session.toggleBatchSelection(ids[1]); session.toggleBatchSelection(ids[3]);
  session.removeSelected();
  assert.deepEqual(session.getSnapshot().photos.map((p) => p.id), [ids[0], ids[2]]);
  assert.equal(session.getSnapshot().selectedId, ids[2]);
  assert.deepEqual(session.getSnapshot().batchSelectedIds, []);
  assert.deepEqual(revoked, removedUrls);
  assert.equal(session.getFile(ids[1]), null);
  assert.strictEqual(session.getFile(ids[2]), files[2]);
  session.selectAll(); session.removeSelected();
  assert.equal(session.getSnapshot().selectedId, null);
  assert.equal(session.getSnapshot().photos.length, 0);
  session.clear();
});

test('append preserves inspection and batch selection; new photos are not batch-selected', () => {
  const { session } = setup();
  const first = session.importFiles([source('a.jpg'), source('b.jpg')]).acceptedIds;
  session.select(first[1]); session.selectAll();
  const next = session.importFiles([source('next.jpg')]).acceptedIds;
  assert.deepEqual(session.getSnapshot().photos.map((p) => p.id), [...first, ...next]);
  assert.deepEqual(session.getSnapshot().batchSelectedIds, first);
  assert.equal(session.getSnapshot().selectedId, first[1]);
  session.clear();
});

test('creation includes every remaining photo irrespective of dots; moves membership without releasing originals/URLs', async () => {
  const { session, revoked } = setup();
  assert.equal(session.createLayer(), null);
  const files = [source('same.jpg'), source('same.jpg'), source('remove.jpg')];
  const ids = session.importFiles(files).acceptedIds;
  session.toggleBatchSelection(ids[2]); session.removeSelected();
  await until(() => session.getSnapshot().photos.every((p) => p.preview.state === 'ready'));
  session.toggleBatchSelection(ids[0]);
  const layer = session.createLayer();
  assert.equal(layer.type, 'FOTO'); assert.equal(layer.name, 'Bilder');
  assert.equal(layer.photoCount, 2); assert.equal(layer.visible, true);
  assert(layer.createdAt > 0);
  assert.deepEqual(layer.photoIds, ids.slice(0, 2));
  assert.deepEqual(session.getSnapshot().photos, []);
  assert.deepEqual(session.getSnapshot().batchSelectedIds, []);
  assert.equal(session.getSnapshot().selectedId, null);
  assert.equal(session.getSnapshot().lastImport, null);
  assert.deepEqual(session.getLayerPhotos(layer.id).map((p) => p.id), layer.photoIds);
  layer.photoIds.forEach((id, index) => assert.strictEqual(session.getFile(id), files[index]));
  assert.equal(revoked.length, 0, 'transfer does not revoke retained thumbnail URLs');
  assert(!('file' in session.getLayerPhotos(layer.id)[0]));
  assert(!('data' in layer), 'FOTO is not parsed survey features');
  session.beginImport(); session.cancelImport();
  assert.strictEqual(session.getFile(ids[0]), files[0]);
  session.clear();
});

test('cancel releases only the temporary import; previously created layer and its URLs survive', async () => {
  const { session, revoked } = setup();
  const original = source('kept.jpg');
  const kept = session.importFiles([original]).acceptedIds[0];
  await until(() => session.getPhoto(kept).preview.state === 'ready');
  const layer = session.createLayer();
  const temporary = session.importFiles([source('cancel.jpg')]).acceptedIds[0];
  await until(() => session.getPhoto(temporary).preview.state === 'ready');
  const temporaryUrl = session.getPhoto(temporary).preview.thumbnailUrl;
  session.cancelImport(); session.cancelImport();
  assert.deepEqual(revoked, [temporaryUrl]);
  assert.equal(session.getFile(temporary), null);
  assert.strictEqual(session.getFile(kept), original);
  assert.deepEqual(session.getSnapshot().photoLayers, [layer]);
  assert.equal(session.createLayer(), null);
  session.clear();
});

test('two distinct imports create separate layers with independent ownership, names, counts and visibility', async () => {
  const { session, revoked } = setup();
  const repeated = source('same.jpg');
  const firstId = session.importFiles([repeated]).acceptedIds[0];
  const first = session.createLayer();
  const secondIds = session.importFiles([repeated, source('b.jpg')]).acceptedIds;
  const second = session.createLayer();
  assert.notEqual(first.id, second.id);
  assert.equal(second.name, 'Bilder (2)');
  assert.notEqual(firstId, secondIds[0]);
  assert.strictEqual(session.getFile(firstId), session.getFile(secondIds[0]));
  assert.deepEqual(session.getSnapshot().photoLayers.map((p) => p.photoCount), [2, 1]);
  session.setLayerVisibility(first.id, false);
  assert.equal(session.getSnapshot().photoLayers.find((p) => p.id === first.id).visible, false);
  assert.equal(session.getSnapshot().photoLayers.find((p) => p.id === second.id).visible, true);
  session.setAllLayersVisible(false);
  assert(session.getSnapshot().photoLayers.every((p) => !p.visible));
  session.setAllLayersVisible(true);
  await until(() => session.getLayerPhotos(second.id).every((p) => p.preview.state === 'ready'));
  const firstUrl = session.getPhoto(firstId).preview.thumbnailUrl;
  session.deleteLayer(first.id); session.deleteLayer(first.id);
  assert.deepEqual(revoked, [firstUrl]);
  assert.equal(session.getFile(firstId), null);
  assert.strictEqual(session.getFile(secondIds[0]), repeated);
  assert.deepEqual(session.getSnapshot().photoLayers.map((p) => p.id), [second.id]);
  session.clear();
});

test('transfer while decoding allows completion in the new owner; canceling a new import does not cancel it', async () => {
  let finish;
  let signal;
  const { session } = setup((_, options) => { signal = options.signal; return new Promise((resolve) => { finish = resolve; }); });
  const id = session.importFiles([source('pending.jpg')]).acceptedIds[0];
  await until(() => finish);
  const layer = session.createLayer();
  session.importFiles([source('cancel.jpg')]); session.cancelImport();
  assert.equal(signal.aborted, false);
  finish(preview());
  await until(() => session.getPhoto(id).preview.state === 'ready');
  assert.equal(session.getLayerPhotos(layer.id)[0].preview.state, 'ready');
  assert.equal(session.getSnapshot().photos.length, 0);
  session.clear();
});

for (const action of ['remove', 'cancel', 'delete']) {
  test(`${action} during decoding drops only its assets and ignores late success`, async () => {
    let finish;
    let signal;
    const { session, allocated } = setup((_, options) => { signal = options.signal; return new Promise((resolve) => { finish = resolve; }); });
    const ids = session.importFiles([source('pending.jpg'), source('queued.jpg')]).acceptedIds;
    await until(() => finish);
    if (action === 'remove') { session.selectAll(); session.removeSelected(); }
    if (action === 'cancel') session.cancelImport();
    if (action === 'delete') session.deleteLayer(session.createLayer().id);
    assert(signal.aborted);
    finish(preview());
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(allocated.length, 0);
    ids.forEach((id) => assert.equal(session.getFile(id), null));
    assert.equal(session.getSnapshot().photos.length, 0);
    assert.equal(session.getSnapshot().photoLayers.length, 0);
    session.clear();
  });
}

test('full clear releases import plus multiple layers and all thumbnail resources exactly once', async () => {
  const { session, allocated, revoked } = setup();
  const ids = [];
  for (let i = 0; i < 3; i++) {
    ids.push(...session.importFiles([source(`${i}.jpg`)]).acceptedIds);
    if (i < 2) session.createLayer();
  }
  await until(() => allocated.length === 3);
  session.clear(); session.clear();
  assert.deepEqual(session.getSnapshot(), EMPTY_PHOTO_SNAPSHOT);
  ids.forEach((id) => assert.equal(session.getFile(id), null));
  assert.deepEqual(revoked, allocated);
});
