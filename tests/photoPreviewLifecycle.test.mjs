import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPhotoFile, createPhotoThumbnail, thumbnailDimensions } from '../src/lib/photos/imagePreview.mjs';

test('classifies supported MIME, uppercase/empty/unreliable MIME extensions and unsupported image candidates', () => {
  for (const [name, type] of [['x', 'image/jpeg'], ['x', 'image/png'], ['x', 'image/webp'], ['A.JPG', ''], ['A.JPEG', 'application/octet-stream'], ['A.PNG', 'image/x-png'], ['A.WEBP', '']]) {
    assert.deepEqual([classifyPhotoFile({ name, type }).candidate, classifyPhotoFile({ name, type }).supported], [true, true], name);
  }
  for (const [name, type] of [['x.HEIC', ''], ['x.HEIF', ''], ['x.TIFF', ''], ['x.svg', 'image/jpeg'], ['x.jpg', 'image/svg+xml'], ['x.gif', ''], ['x', 'image/unknown']]) {
    assert.deepEqual(classifyPhotoFile({ name, type }), { candidate: true, supported: false, format: null });
  }
  for (const [name, type] of [['notes.txt', 'text/plain'], ['survey.gmi', ''], ['x.pdf', 'application/pdf'], ['constructor', '']]) {
    assert.equal(classifyPhotoFile({ name, type }).candidate, false);
  }
});

test('bounded thumbnail sizing preserves proportions without enlargement', () => {
  assert.deepEqual(thumbnailDimensions(4000, 3000), { width: 320, height: 240 });
  assert.deepEqual(thumbnailDimensions(3000, 4000), { width: 240, height: 320 });
  assert.deepEqual(thumbnailDimensions(100, 50), { width: 100, height: 50 });
  assert.deepEqual(thumbnailDimensions(10, 10000), { width: 1, height: 320 });
  assert.deepEqual(thumbnailDimensions(640, 640, 160), { width: 160, height: 160 });
  assert.throws(() => thumbnailDimensions(0, 3));
});

function browserFakes({ failDecode = false, failEncode = false, noContext = false, decode } = {}) {
  const created = [];
  const revoked = [];
  const draws = [];
  const encodings = [];
  let released = false;
  const image = { naturalWidth: 4000, naturalHeight: 3000,
    decode: decode || (async () => { if (failDecode) throw new Error('corrupt'); }),
    removeAttribute: (name) => { assert.equal(name, 'src'); released = true; },
  };
  const canvas = {
    getContext: () => noContext ? null : { drawImage: (...args) => draws.push(args) },
    toBlob: (callback, type, quality) => {
      encodings.push({ width: canvas.width, height: canvas.height, type, quality });
      callback(failEncode ? null : new Blob(['thumbnail']));
    },
  };
  return { created, revoked, draws, encodings, image, canvas, released: () => released,
    options: { createImage: () => image, createCanvas: () => canvas,
      urls: { createObjectURL: (file) => { created.push(file); return 'blob:decode'; }, revokeObjectURL: (url) => revoked.push(url) },
    },
  };
}

test('real preview flow uses a bounded canvas/Blob and releases temporary decode resources on success', async () => {
  const fakes = browserFakes();
  const original = new File(['image'], 'original.jpg', { type: 'image/jpeg' });
  const result = await createPhotoThumbnail(original, fakes.options);
  assert.deepEqual(result.dimensions, { width: 4000, height: 3000 });
  assert(result.thumbnailBlob instanceof Blob);
  assert.strictEqual(fakes.created[0], original);
  assert.deepEqual(fakes.encodings, [{ width: 320, height: 240, type: 'image/jpeg', quality: 0.8 }]);
  assert.deepEqual(fakes.draws[0].slice(1), [0, 0, 320, 240]);
  assert.deepEqual(fakes.revoked, ['blob:decode']);
  assert(fakes.released());
  assert.equal(fakes.canvas.width, 0);
  assert.equal(fakes.canvas.height, 0);
});

test('PNG and WebP thumbnails preserve alpha using PNG encoding', async () => {
  for (const extension of ['png', 'webp']) {
    const fakes = browserFakes();
    await createPhotoThumbnail(new File(['image'], `x.${extension}`), fakes.options);
    assert.equal(fakes.encodings[0].type, 'image/png');
  }
});

test('decode/context/encoding failures revoke temporary URLs and release image/canvas', async () => {
  for (const options of [{ failDecode: true }, { failEncode: true }, { noContext: true }]) {
    const fakes = browserFakes(options);
    await assert.rejects(createPhotoThumbnail(new File(['bad'], 'x.jpg'), fakes.options), (error) => {
      assert.equal(error.code, options.failDecode ? 'decode-failed' : 'thumbnail-failed');
      return true;
    });
    assert.deepEqual(fakes.revoked, ['blob:decode']);
    assert(fakes.released());
    if (!options.failDecode) assert.equal(fakes.canvas.width, 0);
  }
});

test('zero byte and unsupported inputs never allocate decode URLs, including SVG', async () => {
  const fakes = browserFakes();
  await assert.rejects(createPhotoThumbnail(new File([], 'empty.jpg'), fakes.options), { code: 'empty-file' });
  await assert.rejects(createPhotoThumbnail(new File(['<svg/>'], 'x.svg'), fakes.options), { code: 'unsupported-format' });
  assert.equal(fakes.created.length, 0);
});

test('clear cancellation releases a pending decode URL immediately and safely ignores its late completion', async () => {
  let finish;
  const fakes = browserFakes({ decode: () => new Promise((resolve) => { finish = resolve; }) });
  const controller = new AbortController();
  const work = createPhotoThumbnail(new File(['image'], 'x.jpg'), { ...fakes.options, signal: controller.signal });
  controller.abort();
  await assert.rejects(work, { code: 'cancelled' });
  assert.deepEqual(fakes.revoked, ['blob:decode']);
  assert(fakes.released());
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fakes.encodings.length, 0);
});

test('cancellation during toBlob releases resources and ignores late encoding', async () => {
  const fakes = browserFakes();
  let callback;
  fakes.canvas.toBlob = (done) => { callback = done; };
  const controller = new AbortController();
  const work = createPhotoThumbnail(new File(['image'], 'x.jpg'), { ...fakes.options, signal: controller.signal });
  while (!callback) await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(work, { code: 'cancelled' });
  assert.deepEqual(fakes.revoked, ['blob:decode']);
  assert.equal(fakes.canvas.width, 0);
  callback(new Blob(['late']));
});
