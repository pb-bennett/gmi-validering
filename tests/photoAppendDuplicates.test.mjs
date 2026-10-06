import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { duplicatePhotoNames, photoAppendPolicy } from '../src/lib/photos/photoPositionSources.mjs';
import { buildPhotoMapFeatures } from '../src/lib/photos/photoMapFeatures.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const file = (name, bytes = name) => new File([bytes], name, { type: 'image/jpeg' });
const entry = (name) => ({ id: name, reference: name, status: 'viable', position: { crs: 'EPSG:4326', latitude: 60, longitude: 10 } });
const source = (names) => new File([JSON.stringify({ entries: names.map(entry) })], 'positions.gml');
function setup(options = {}) {
  let id = 0; const reads = [], revoked = [];
  const session = createPhotoSession({ createId: () => String(++id), yieldJob: tick,
    createThumbnail: async () => ({ thumbnailBlob: new Blob(['thumbnail']), dimensions: { width: 20, height: 10 } }),
    extractGps: async (photo) => { reads.push(photo); return { state: 'viable', candidate: entry(photo.name) }; },
    parseGml: async (gml) => JSON.parse(await gml.text()),
    urls: { createObjectURL: () => `blob:${++id}`, revokeObjectURL: (url) => revoked.push(url) }, ...options });
  return { session, reads, revoked };
}
async function settled(session) {
  for (let n = 0; n < 400; n++) {
    const photos = [...session.getSnapshot().photos, ...session.getSnapshot().photoLayers.flatMap((layer) => session.getLayerPhotos(layer.id))];
    if (photos.every((photo) => photo.preview.state !== 'pending' && photo.spatial.exifRead.state !== 'pending')) return;
    await tick();
  }
  assert.fail('photo tasks did not settle');
}

test('148 incoming / 142 existing: six appendable, select-all excludes 142, only six acquire/transfer spatial evidence', async () => {
  const { session, reads, revoked } = setup();
  const names = Array.from({ length: 148 }, (_, index) => `photo-${index}.jpg`);
  const originals = names.map((name) => file(name));
  const ids = session.importFiles(originals).acceptedIds;
  await session.importPositioningGml(source(names));
  const layer = session.createLayer(); await settled(session);
  session.removeLayerPhotos(layer.id, ids.slice(0, 6), { confirmed: true });
  const before = session.getLayerPhotos(layer.id), previousSource = session.getLayer(layer.id).spatialSources[0];
  session.beginImport(layer.id);
  const incoming = session.importFiles(names.map((name) => file(name))).acceptedIds;
  const status = session.getSnapshot().appendStatus;
  assert.equal(status.newCount, 6); assert.equal(status.targetCollisions.length, 142);
  assert.deepEqual(status.appendableIds, incoming.slice(0, 6)); assert.deepEqual(status.skippedIds, incoming.slice(6));
  assert.equal(session.getSnapshot().duplicateNames.length, 0, 'target collisions are not incoming-batch duplicates');
  session.selectAll(); assert.deepEqual(session.getSnapshot().batchSelectedIds, incoming.slice(0, 6));
  await session.importPositioningGml(source(names));
  assert.equal(session.getSnapshot().positioning.ledger.summary.matchedCount, 6);
  assert.equal(session.getSnapshot().positioning.ledger.summary.unmatchedCount, 142);
  await settled(session);
  assert.equal(reads.length, 154, 'no EXIF reads for skipped incoming records');
  incoming.slice(6).forEach((id) => {
    assert.equal(session.getPhoto(id).spatial.current, null);
    assert.deepEqual(session.getPhoto(id).spatial.candidates, []);
    assert.equal(session.getPhoto(id).spatial.exifRead.state, 'skipped-duplicate');
  });
  const skippedUrls = incoming.slice(6).map((id) => session.getPhoto(id).preview.thumbnailUrl);
  session.appendImport();
  assert.equal(session.getLayer(layer.id).photoCount, 148);
  assert.equal(buildPhotoMapFeatures([session.getLayer(layer.id)], session.getLayerPhotos).length, 148);
  assert.strictEqual(session.getLayer(layer.id).spatialSources[0], previousSource);
  before.forEach((photo, index) => {
    assert.deepEqual(session.getPhoto(photo.id), photo);
    assert.strictEqual(session.getPhoto(photo.id).spatial, photo.spatial);
    assert.strictEqual(session.getFile(photo.id), originals[index + 6]);
  });
  incoming.slice(6).forEach((id) => assert.equal(session.getFile(id), null));
  skippedUrls.forEach((url) => assert.equal(revoked.filter((item) => item === url).length, 1));
  assert.equal(session.getSnapshot().appendStatus, null); session.clear();
});

test('zero-new append is blocked in the domain; an individual explicit override can append distinct bytes with the same filename', async () => {
  const { session, reads } = setup();
  const original = file('a.jpg', 'first original');
  const [first] = session.importFiles([original]).acceptedIds; const layer = session.createLayer(); await settled(session);
  const before = session.getPhoto(first);
  session.beginImport(layer.id);
  const intentional = file('A.JPG', 'different original');
  const [added] = session.importFiles([intentional]).acceptedIds;
  await settled(session);
  assert.equal(reads.length, 1); assert.equal(session.getSnapshot().appendStatus.appendableIds.length, 0);
  assert.equal(session.appendImport(), null); session.selectAll(); assert.deepEqual(session.getSnapshot().batchSelectedIds, []);
  assert.equal(session.setAppendDuplicateOverride(first, true), false, 'cannot override an existing owner');
  assert(session.setAppendDuplicateOverride(added, true));
  assert.deepEqual(session.getSnapshot().appendStatus.overrideIds, [added]);
  session.selectAll(); assert.deepEqual(session.getSnapshot().batchSelectedIds, [added]);
  session.appendImport(); await settled(session);
  assert.equal(session.getLayer(layer.id).photoCount, 2);
  assert.deepEqual(session.getPhoto(first), before); assert.strictEqual(session.getFile(first), original);
  assert.strictEqual(session.getFile(added), intentional); assert.equal(reads.length, 2);
  assert.equal(session.getPhoto(added).spatial.current, null, 'EXIF remains candidate only'); session.clear();
});

test('target collisions use case/NFC comparison, count incoming records, and remain distinct from incoming-batch collisions', () => {
  const existing = [{ id: 'old1', originalFilename: 'blå.jpg' }, { id: 'old2', originalFilename: 'BLÅ.JPG' }];
  const incoming = [{ id: 'new1', originalFilename: 'BLA\u030a.JPG' }, { id: 'new2', originalFilename: 'blå.jpg' }, { id: 'new3', originalFilename: 'other.jpg' }];
  const policy = photoAppendPolicy(incoming, existing);
  assert.equal(policy.targetCollisions.length, 2);
  assert.deepEqual(policy.targetCollisions[0].existingPhotoIds, ['old1', 'old2']);
  assert.deepEqual(policy.appendableIds, ['new3']); assert.equal(policy.newCount, 1);
  assert.equal(duplicatePhotoNames(incoming).length, 1);
  assert(Object.isFrozen(policy.targetCollisions[0].existingPhotoIds));
});

test('within-batch duplicates remain distinct originals and GML ambiguity is never guessed', async () => {
  const { session } = setup(); session.importFiles([file('old.jpg')]); const layer = session.createLayer(); await settled(session);
  session.beginImport(layer.id);
  const incoming = [file('new.jpg', 'one'), file('NEW.JPG', 'two')];
  const ids = session.importFiles(incoming).acceptedIds;
  assert.equal(session.getSnapshot().duplicateNames.length, 1);
  assert.equal(session.getSnapshot().appendStatus.targetCollisions.length, 0);
  assert.deepEqual(session.getSnapshot().appendStatus.appendableIds, ids);
  await session.importPositioningGml(source(['new.jpg']));
  assert.equal(session.getSnapshot().positioning.ledger.summary.ambiguousCount, 1);
  session.appendImport(); await settled(session);
  assert.equal(session.getLayer(layer.id).photoCount, 3);
  ids.forEach((id, index) => { assert.strictEqual(session.getFile(id), incoming[index]); assert.equal(session.getPhoto(id).spatial.current, null); });
  session.clear();
});

test('cancel discards both skipped and overridden files without touching target members or sources', async () => {
  const { session } = setup(); session.importFiles([file('a.jpg')]); const layer = session.createLayer(); await settled(session);
  const before = session.getLayer(layer.id), photo = session.getLayerPhotos(layer.id)[0];
  session.beginImport(layer.id); const ids = session.importFiles([file('a.jpg'), file('A.JPG'), file('new.jpg')]).acceptedIds;
  session.setAppendDuplicateOverride(ids[0], true); session.cancelImport(); await tick();
  ids.forEach((id) => assert.equal(session.getFile(id), null));
  assert.strictEqual(session.getLayer(layer.id), before); assert.deepEqual(session.getPhoto(photo.id), photo);
  assert.equal(session.getSnapshot().appendStatus, null); session.clear();
});

test('revoke an override during EXIF extraction: late completion cannot create evidence; re-enable transfers only the live job', async () => {
  let resolve, calls = 0;
  const delayed = setup({ extractGps: async (photo) => {
    if (++calls === 1) return { state: 'no-gps', candidate: null };
    return new Promise((done) => { resolve = () => done({ state: 'viable', candidate: entry(photo.name) }); });
  } }).session;
  delayed.importFiles([file('a.jpg')]); const owner = delayed.createLayer(); await settled(delayed);
  delayed.beginImport(owner.id); const [incoming] = delayed.importFiles([file('a.jpg')]).acceptedIds;
  delayed.setAppendDuplicateOverride(incoming, true);
  while (!resolve) await tick();
  delayed.setAppendDuplicateOverride(incoming, false); resolve(); await tick(); await tick();
  assert.deepEqual(delayed.getPhoto(incoming).spatial.candidates, []);
  assert.equal(delayed.getPhoto(incoming).spatial.exifRead.state, 'skipped-duplicate');
  assert.equal(delayed.appendImport(), null);
  resolve = null; delayed.setAppendDuplicateOverride(incoming, true);
  while (!resolve) await tick();
  delayed.appendImport(); resolve(); await settled(delayed);
  assert.equal(delayed.getPhoto(incoming).spatial.candidates.length, 1);
  assert.equal(delayed.getLayer(owner.id).photoCount, 2); delayed.clear();
});

test('target member removal during a draft makes the previously skipped File appendable and starts its GPS read', async () => {
  const { session, reads } = setup(); const [old] = session.importFiles([file('a.jpg')]).acceptedIds;
  const layer = session.createLayer(); await settled(session);
  session.beginImport(layer.id); const [added] = session.importFiles([file('a.jpg')]).acceptedIds;
  assert.deepEqual(session.getSnapshot().appendStatus.skippedIds, [added]);
  session.removeLayerPhotos(layer.id, [old], { confirmed: true });
  assert.deepEqual(session.getSnapshot().appendStatus.appendableIds, [added]);
  session.appendImport(); await settled(session);
  assert.equal(session.getLayer(layer.id).photoCount, 1); assert.equal(reads.length, 2); session.clear();
});
