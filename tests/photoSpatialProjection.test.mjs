import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
register('./esmJsLoader.mjs', import.meta.url);
const { projectPhotoCoordinate, projectCoordinateToWgs84 } = await import('../src/lib/map/coordinateProjection.js');
test('5972 horizontal component reaches WGS84 without changing raw height/geometry', () => {
  const raw = [581932.579311, 6566001.891835, 0];
  const result = projectPhotoCoordinate('EPSG:5972', raw);
  assert.equal(result.status, 'viable');
  assert(Math.abs(result.position.longitude - 10.43555) < 1e-7);
  assert(Math.abs(result.position.latitude - 59.2251222222) < 1e-7);
  assert.equal(result.transform.vertical, 'not-transformed');
  assert.deepEqual(raw, [581932.579311, 6566001.891835, 0]);
  assert.deepEqual(projectCoordinateToWgs84({ header: { COSYS_EPSG: 25832 } }, ...raw), [result.position.longitude, result.position.latitude]);
});
test('strict path reports unsupported, nonfinite, transform failure and invalid geography', () => {
  assert.equal(projectPhotoCoordinate('EPSG:9999', [1, 2]).status, 'unsupported-crs');
  assert.equal(projectPhotoCoordinate('EPSG:5972', [NaN, 2, 0]).errorCode, 'invalid-coordinates');
  assert.equal(projectPhotoCoordinate('EPSG:25832', [1, 2], () => { throw new Error('failure'); }).errorCode, 'transform-failed');
  assert.equal(projectPhotoCoordinate('EPSG:4326', [1000, 2000]).errorCode, 'invalid-geographic-result');
  const swapped = projectPhotoCoordinate('EPSG:5972', [6566001.89, 581932.58, 0]);
  assert(swapped.status !== 'viable' || Math.abs(swapped.position.latitude - 59.22512) > 1);
});
