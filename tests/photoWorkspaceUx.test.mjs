import assert from 'node:assert/strict';
import test from 'node:test';
import { photoImageFit, clampPhotoPan, zoomPhotoView } from '../src/lib/photos/photoImageView.mjs';

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
