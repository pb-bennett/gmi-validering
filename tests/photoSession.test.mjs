import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';

const file = (name, type = 'image/jpeg', content = 'original') => new File([content], name, { type, lastModified: 123 });
const result = () => ({ dimensions: { width: 1200, height: 800 }, thumbnailBlob: new Blob(['thumbnail']) });
const until = async (predicate) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('Timed out waiting for photo work');
};
function setup(options = {}) {
  const created = [];
  const revoked = [];
  let id = 0;
  const session = createPhotoSession({
    createId: () => `id-${++id}`,
    createThumbnail: async () => result(),
    yieldJob: () => new Promise((resolve) => setImmediate(resolve)),
    urls: {
      createObjectURL: (blob) => { const url = `blob:${created.length}`; created.push({ url, blob }); return url; },
      revokeObjectURL: (url) => revoked.push(url),
    },
    ...options,
  });
  return { session, created, revoked };
}

test('batch registers every original immediately in order, with separate IDs for duplicate names', async () => {
  const { session } = setup();
  const files = [file('same.jpg'), file('same.jpg', 'image/jpeg', 'different'), file('Third.PNG', '')];
  const { acceptedIds, rejectedNames } = session.importFiles(files);
  assert.equal(acceptedIds.length, 3);
  assert.equal(new Set(acceptedIds).size, 3);
  assert.deepEqual(rejectedNames, []);
  const snapshot = session.getSnapshot();
  assert.strictEqual(session.getSnapshot(), snapshot);
  assert.deepEqual(snapshot.photos.map((p) => p.originalFilename), files.map((f) => f.name));
  assert(snapshot.photos.every((p) => p.preview.state === 'pending' && !('file' in p)));
  acceptedIds.forEach((id, index) => assert.strictEqual(session.getFile(id), files[index]));
  assert.equal(session.getFile('missing'), null);
  assert.equal(snapshot.selectedId, acceptedIds[0]);
  await until(() => session.getSnapshot().photos.every((p) => p.preview.state === 'ready'));
  assert.equal(snapshot.photos[0].preview.state, 'pending', 'old snapshots do not mutate');
  session.clear();
});

test('second batch appends, including repeated File objects, and preserves selection and originals', async () => {
  const { session } = setup();
  const original = file('same.jpg');
  const first = session.importFiles([original, file('other.jpg')]).acceptedIds;
  session.select(first[1]);
  session.select('missing');
  const second = session.importFiles([original]).acceptedIds;
  assert.deepEqual(session.getSnapshot().photos.map((p) => p.id), [...first, ...second]);
  assert.equal(session.getSnapshot().selectedId, first[1]);
  assert.strictEqual(session.getFile(first[0]), session.getFile(second[0]));
  await until(() => session.getSnapshot().photos.every((p) => p.preview.state === 'ready'));
  session.clear();
});

test('unsupported and empty images remain; non-images are named rejections; corrupt errors do not stop the queue', async () => {
  const calls = [];
  const { session } = setup({ createThumbnail: async (source) => {
    calls.push(source.name);
    if (source.name === 'broken.jpg') throw new Error('bad bytes');
    return result();
  } });
  const imported = session.importFiles([file('a.HEIC', ''), file('empty.JPG', '', ''), file('notes.txt', 'text/plain'), file('broken.jpg'), file('good.webp', 'image/webp')]);
  assert.deepEqual(imported.rejectedNames, ['notes.txt']);
  assert.equal(imported.acceptedIds.length, 4);
  await until(() => session.getSnapshot().photos.every((p) => p.preview.state !== 'pending'));
  assert.deepEqual(calls, ['broken.jpg', 'good.webp']);
  assert.deepEqual(session.getSnapshot().photos.map((p) => p.preview.errorCode), ['unsupported-format', 'empty-file', 'decode-failed', null]);
  assert.equal(session.getSnapshot().lastImport.acceptedCount, 4);
  session.clear();
});

test('scheduler runs exactly one thumbnail job at a time across appended batches', async () => {
  let active = 0;
  let maximum = 0;
  const starts = [];
  const finishes = [];
  const { session } = setup({ createThumbnail: (source) => {
    starts.push(source.name);
    maximum = Math.max(maximum, ++active);
    return new Promise((resolve) => finishes.push(() => { active--; resolve(result()); }));
  } });
  session.importFiles([file('1.jpg'), file('2.jpg')]);
  await until(() => starts.length === 1);
  session.importFiles([file('3.jpg')]);
  assert.deepEqual(starts, ['1.jpg']);
  finishes.shift()();
  await until(() => starts.length === 2);
  finishes.shift()();
  await until(() => starts.length === 3);
  finishes.shift()();
  await until(() => session.getSnapshot().photos.every((p) => p.preview.state === 'ready'));
  assert.equal(maximum, 1);
  assert.deepEqual(starts, ['1.jpg', '2.jpg', '3.jpg']);
  session.clear();
});

test('clear releases all thumbnail URLs and originals, resets selection, and is idempotent', async () => {
  const { session, created, revoked } = setup();
  let notifications = 0;
  const unsubscribe = session.subscribe(() => notifications++);
  const { acceptedIds } = session.importFiles([file('1.jpg'), file('2.jpg')]);
  await until(() => created.length === 2);
  assert(created.every(({ blob }) => blob instanceof Blob && !(blob instanceof File)));
  session.clear();
  session.clear();
  assert.deepEqual(revoked, created.map((entry) => entry.url));
  acceptedIds.forEach((id) => assert.equal(session.getFile(id), null));
  assert.deepEqual(session.getSnapshot(), { photos: [], selectedId: null, lastImport: null });
  unsubscribe();
  const previousNotifications = notifications;
  session.clear();
  assert.equal(notifications, previousNotifications);
});

test('clear during work cancels the job, drops queued jobs, ignores late success, and allows reimport', async () => {
  const starts = [];
  let completeOld;
  let oldSignal;
  const { session, created, revoked } = setup({ createThumbnail: (source, { signal }) => {
    starts.push(source.name);
    if (source.name === 'old.jpg') {
      oldSignal = signal;
      return new Promise((resolve) => { completeOld = resolve; }); // Deliberately ignores abort.
    }
    return Promise.resolve(result());
  } });
  const old = session.importFiles([file('old.jpg'), file('queued.jpg')]).acceptedIds;
  await until(() => completeOld);
  session.clear();
  assert(oldSignal.aborted);
  const fresh = session.importFiles([file('fresh.jpg')]).acceptedIds[0];
  completeOld(result());
  await until(() => session.getSnapshot().photos[0]?.preview.state === 'ready');
  assert.deepEqual(starts, ['old.jpg', 'fresh.jpg']);
  assert.deepEqual(session.getSnapshot().photos.map((p) => p.id), [fresh]);
  old.forEach((id) => assert.equal(session.getFile(id), null));
  assert.equal(created.length, 1, 'stale work never allocates a thumbnail URL');
  session.clear();
  assert.equal(revoked.length, 1);
});

test('late failures after repeated clears cannot resurrect records', async () => {
  let fail;
  const { session } = setup({ createThumbnail: () => new Promise((_, reject) => { fail = reject; }) });
  session.importFiles([file('old.jpg')]);
  await until(() => fail);
  session.clear();
  session.clear();
  fail(new Error('late failure'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.getSnapshot().photos.length, 0);
});
