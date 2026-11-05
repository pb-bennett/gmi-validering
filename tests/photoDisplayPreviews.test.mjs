import assert from 'node:assert/strict';
import test from 'node:test';
import { createDisplayPreviewCache, DISPLAY_PREVIEW_MAX_EDGE } from '../src/lib/photos/photoDisplayPreviews.mjs';
import { THUMBNAIL_MAX_EDGE } from '../src/lib/photos/imagePreview.mjs';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fixture(options = {}) {
  const jobs = [], revoked = [];
  let urlId = 0;
  const createPreview = (file, { signal }) => new Promise((resolve, reject) => {
    const job = { file, signal, resolve: () => resolve({ thumbnailBlob: { file } }), reject };
    signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'cancelled' })));
    jobs.push(job);
  });
  const cache = createDisplayPreviewCache({ createPreview, maxEntries: 2, ...options,
    urls: { createObjectURL: () => `blob:preview-${++urlId}`, revokeObjectURL: (url) => revoked.push(url) } });
  return { cache, jobs, revoked };
}

test('one decode per photo: concurrent and later requests share the same URL', async () => {
  const { cache, jobs } = fixture();
  const [first, second] = [cache.request('a', 'file-a'), cache.request('a', 'file-a')];
  await flush();
  assert.equal(jobs.length, 1);
  jobs[0].resolve();
  assert.deepEqual(await Promise.all([first, second]), ['blob:preview-1', 'blob:preview-1']);
  assert.equal(await cache.request('a', 'file-a'), 'blob:preview-1');
  assert.equal(jobs.length, 1);
});

test('only one decode runs at a time and the newest request goes first', async () => {
  const { cache, jobs } = fixture();
  const a = cache.request('a', 'file-a'), b = cache.request('b', 'file-b'), c = cache.request('c', 'file-c');
  await flush();
  assert.deepEqual(jobs.map((job) => job.file), ['file-a']);
  jobs[0].resolve(); await a; await flush();
  assert.deepEqual(jobs.map((job) => job.file), ['file-a', 'file-c']);
  jobs[1].resolve(); await c; await flush();
  jobs[2].resolve(); await b;
});

test('abandoned requests resolve to null, and queued work nobody wants is never decoded', async () => {
  const { cache, jobs } = fixture();
  const running = new AbortController(), queued = new AbortController();
  const a = cache.request('a', 'file-a', { signal: running.signal }), b = cache.request('b', 'file-b', { signal: queued.signal });
  await flush();
  queued.abort();
  assert.equal(await b, null);
  running.abort();
  assert.equal(await a, null);
  assert.equal(jobs[0].signal.aborted, true, 'the running decode is cancelled too');
  await flush();
  assert.equal(jobs.length, 1, 'the queued photo was never decoded');
  assert.equal(cache.size(), 0);
  assert.equal(await cache.request('c', 'file-c', { signal: AbortSignal.abort() }), null);
});

test('a request survives while another caller still waits for the same photo', async () => {
  const { cache, jobs } = fixture();
  const leaving = new AbortController();
  const gone = cache.request('a', 'file-a', { signal: leaving.signal }), staying = cache.request('a', 'file-a');
  await flush();
  leaving.abort();
  assert.equal(await gone, null);
  assert.equal(jobs[0].signal.aborted, false);
  jobs[0].resolve();
  assert.equal(await staying, 'blob:preview-1');
});

test('the cache is bounded: the least recently requested URL is revoked', async () => {
  const { cache, jobs, revoked } = fixture();
  const load = async (id) => { const request = cache.request(id, `file-${id}`); await flush(); jobs.at(-1).resolve(); return request; };
  await load('a'); await load('b');
  await cache.request('a', 'file-a');
  await load('c');
  assert.deepEqual(revoked, ['blob:preview-2'], '"b" was the oldest after "a" was requested again');
  assert.equal(cache.size(), 2);
});

test('a failed decode resolves to null, is not cached and can be retried', async () => {
  const { cache, jobs } = fixture();
  const failed = cache.request('a', 'file-a');
  await flush();
  jobs[0].reject(new Error('decode-failed'));
  assert.equal(await failed, null);
  const retried = cache.request('a', 'file-a');
  await flush();
  jobs[1].resolve();
  assert.equal(await retried, 'blob:preview-1');
});

test('dropping a photo cancels its work and revokes its URL, and a late result creates no URL', async () => {
  const { cache, jobs, revoked } = fixture();
  const ready = cache.request('a', 'file-a');
  await flush(); jobs[0].resolve(); await ready;
  cache.drop('a');
  assert.deepEqual(revoked, ['blob:preview-1']);
  const pending = cache.request('b', 'file-b');
  await flush();
  cache.drop('b');
  assert.equal(await pending, null);
  await flush();
  assert.equal(cache.size(), 0);
  assert.deepEqual(revoked, ['blob:preview-1']);
});

function sessionFixture({ width = 1951, height = 2600 } = {}) {
  const calls = [], created = [], revoked = [];
  let id = 0;
  const session = createPhotoSession({
    createId: () => `id-${++id}`, yieldJob: async () => {}, extractGps: async () => ({ state: 'empty' }),
    createThumbnail: async (file, options = {}) => { calls.push({ file, ...options }); return { dimensions: { width, height }, thumbnailBlob: new Blob([options.maxEdge ? 'preview' : 'thumbnail']) }; },
    urls: { createObjectURL: (blob) => { const url = `blob:${created.length}`; created.push({ url, blob }); return url; }, revokeObjectURL: (url) => revoked.push(url) },
  });
  const importPhoto = async (name = 'a.jpg') => {
    const photoId = session.importFiles([new File(['x'], name, { type: 'image/jpeg' })]).acceptedIds[0];
    for (let i = 0; i < 20 && session.getPhoto(photoId).preview.state !== 'ready'; i++) await flush();
    return session.getPhoto(photoId);
  };
  return { session, calls, created, revoked, importPhoto };
}

test('session: a larger original gets a preview sized for display, decoded on request only', async () => {
  const { session, calls, created, importPhoto } = sessionFixture();
  const photo = await importPhoto();
  assert.equal(calls.length, 1, 'importing stays limited to the thumbnail');
  assert.equal(calls[0].maxEdge, undefined);
  const url = await session.requestDisplayPreview(photo.assetId);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].maxEdge, DISPLAY_PREVIEW_MAX_EDGE);
  assert.equal(calls[1].file, calls[0].file, 'same original file');
  assert.notEqual(url, photo.preview.thumbnailUrl);
  assert.equal(await created.at(-1).blob.text(), 'preview');
  assert.equal(session.getPhoto(photo.id).preview.thumbnailUrl, photo.preview.thumbnailUrl, 'the session thumbnail is untouched');
});

test('session: originals no larger than the thumbnail reuse it without decoding', async () => {
  const { session, calls, importPhoto } = sessionFixture({ width: THUMBNAIL_MAX_EDGE, height: 200 });
  const photo = await importPhoto();
  assert.equal(await session.requestDisplayPreview(photo.assetId), photo.preview.thumbnailUrl);
  assert.equal(calls.length, 1);
});

test('session: unknown or unfinished assets return null, and releasing an asset revokes its preview', async () => {
  const { session, revoked, importPhoto } = sessionFixture();
  assert.equal(await session.requestDisplayPreview('missing'), null);
  const photo = await importPhoto();
  const url = await session.requestDisplayPreview(photo.assetId);
  session.cancelImport();
  assert(revoked.includes(url), 'preview URL released with the asset');
  assert(revoked.includes(photo.preview.thumbnailUrl));
  assert.equal(await session.requestDisplayPreview(photo.assetId), null);
});
