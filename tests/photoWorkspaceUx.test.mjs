import assert from 'node:assert/strict';
import test from 'node:test';
import { photoImageFit, clampPhotoPan, zoomPhotoView } from '../src/lib/photos/photoImageView.mjs';
import { newPhotoCandidateCount } from '../src/lib/photos/photoSourceReviewPresentation.mjs';

test('portrait/landscape fit preserve aspect ratio, do not upscale and handle zero initial viewport', () => {
  assert.equal(photoImageFit({ width: 4000, height: 6000 }, { width: 1600, height: 800 }), 776 / 6000);
  assert.equal(photoImageFit({ width: 6000, height: 4000 }, { width: 1000, height: 800 }), 976 / 6000);
  assert.equal(photoImageFit({ width: 120, height: 80 }, { width: 1000, height: 800 }), 1);
  assert.equal(photoImageFit({ width: 4000, height: 6000 }, { width: 0, height: 0 }), 1);
});

test('pan stays within scaled image; fitting clears offsets and cursor zoom preserves its image location', () => {
  const image = { width: 4000, height: 6000 }, viewport = { width: 1600, height: 800 };
  assert.deepEqual(clampPhotoPan({ x: 5000, y: -5000 }, 1, image, viewport), { x: 1200, y: -2600 });
  const fit = photoImageFit(image, viewport);
  const fitted = zoomPhotoView({ scale: 1, x: 800, y: 400 }, 0.01, { x: 0, y: 0 }, image, viewport);
  assert.equal(fitted.scale, fit); assert.equal(fitted.x, 0); assert.equal(fitted.y, 0);
  assert.deepEqual(zoomPhotoView({ scale: 1, x: 0, y: 0 }, 2, { x: 200, y: 100 }, image, viewport), { mode: 'zoom', scale: 2, x: -200, y: -100 });
  assert.equal(zoomPhotoView({ scale: 1, x: 0, y: 0 }, 100, { x: 0, y: 0 }, image, viewport).scale, 8);
});

test('source review counts newly attached evidence, including invalid diagnostics, without guessing or duplicating', () => {
  const review = { source: { id: 'source', entries: [
    { id: 'existing', status: 'viable' }, { id: 'new', status: 'viable' },
    { id: 'invalid', status: 'invalid' }, { id: 'ambiguous', status: 'viable' },
  ] }, ledger: { matches: [
    { entryId: 'existing', status: 'matched', photoId: 'a' },
    { entryId: 'new', status: 'matched', photoId: 'b' },
    { entryId: 'invalid', status: 'matched', photoId: 'b' },
    { entryId: 'ambiguous', status: 'ambiguous', photoIds: ['a', 'b'] },
  ] } };
  const photos = [{ id: 'a', spatial: { candidates: [{ sourceId: 'source', sourceEntryId: 'existing' }] } },
    { id: 'b', spatial: { candidates: [] } }];
  assert.equal(newPhotoCandidateCount(null, photos), 0);
  assert.equal(newPhotoCandidateCount(review, photos), 2);
  assert.equal(newPhotoCandidateCount({ ...review, source: { ...review.source, id: 'changed-source' } }, photos), 3);
  assert.equal(newPhotoCandidateCount(review, [photos[0]]), 0, 'removed assets are not counted');
});
