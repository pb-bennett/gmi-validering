import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
register('./esmJsLoader.mjs', import.meta.url);
const { getGeminiExtent, getGeminiMapExtent, validateGeminiBbox, GEMINI_BUFFER_METRES } = await import('../src/lib/gemini-wfs/geminiExtent.mjs');
const { validateWfsBbox } = await import('../src/lib/gemini-wfs/wfsProxyPolicy.mjs');

export const survey = (points = [], lines = [], epsg = 25832, format = 'GMI') => ({
  id: 'survey-a', file: { format }, data: { format, header: { COSYS_EPSG: epsg },
    points: points.map((coordinates) => ({ coordinates })), lines: lines.map((coordinates) => ({ coordinates })) },
});
const xy = (x = 579300, y = 6559200, z = 0) => ({ x, y, z });
const code = (expected) => (error) => error.code === expected;

test('one point, flat geometry and fixed 100 m buffer are valid', () => {
  assert.equal(GEMINI_BUFFER_METRES, 100);
  const result = getGeminiExtent(survey([[xy()]]));
  assert.deepEqual(result.bbox, [579200, 6559100, 579400, 6559300]);
  assert.equal(result.coordinateCount, 1);
  assert.equal(result.sourceCrs, 'EPSG:25832');
  assert.equal(result.crs, 'EPSG:25832');
  assert.deepEqual(getGeminiExtent(survey([], [[xy(), xy()]])).bbox, result.bbox);
});
test('all point coordinates and all intermediate line vertices determine coverage', () => {
  const layer = survey([[xy(), xy(579700, 6559300)]], [[xy(), xy(579100, 6559500), xy(579800, 6559000), xy()]]);
  layer.data.points[0].visible = false;
  layer.data.lines[0].outlier = true;
  layer.data.filteredFeatures = [];
  layer.data.extent = '-1 -1 1 1';
  layer.photos = [{ coordinates: [xy(-100000, -100000)] }];
  layer.viewport = [0, 0];
  const result = getGeminiExtent(layer);
  assert.deepEqual(result.bbox, [579000, 6558900, 579900, 6559600]);
  assert.equal(result.coordinateCount, 6);
});
test('buffer rounds outward to whole metres; explicit test buffer is supported', () => {
  const layer = survey([[xy(579300.25, 6559200.8)]]);
  assert.deepEqual(getGeminiExtent(layer).bbox, [579200, 6559100, 579401, 6559301]);
  assert.deepEqual(getGeminiExtent(layer, { bufferMetres: 10 }).bbox, [579290, 6559190, 579311, 6559211]);
});
test('25832 identity preserves XY and does not project Z or mutate normalized data', () => {
  const layer = survey([[xy(579300, 6559200, null)]]);
  const before = JSON.stringify(layer);
  getGeminiExtent(layer, { project: () => { throw new Error('Identity must not project'); } });
  assert.equal(JSON.stringify(layer), before);
});
test('25833 and operational 4326 transform every coordinate individually', () => {
  // Known photo/M2 reference: 10.43555 E, 59.2251222222 N -> 581932.579311, 6566001.891835.
  const geographic = getGeminiExtent(survey([[xy(10.43555, 59.2251222222)]], [], 4326));
  assert.deepEqual(geographic.bbox, [581832, 6565901, 582033, 6566102]);
  const calls = [];
  const layer = survey([[xy(250000, 6560000)]], [[xy(250001, 6560001), xy(250002, 6560002)]], 25833);
  getGeminiExtent(layer, { project: (from, to, tuple) => {
    calls.push([from, to, [...tuple]]); return [579300 + tuple[0] - 250000, 6559200 + tuple[1] - 6560000];
  } });
  assert.equal(calls.length, 3);
  assert(calls.every(([from, to, tuple]) => from === 'EPSG:25833' && to === 'EPSG:25832' && tuple.length === 2));
  assert.deepEqual(getGeminiExtent(survey([[xy(250000, 6560000)]], [], 25833)).bbox,
    [593436, 6552862, 593637, 6553063]);
});
test('supported survey formats and existing operational user-assumed CRS', () => {
  for (const format of ['GMI', 'SOSI', 'KOF']) assert.equal(getGeminiExtent(survey([[xy()]], [], 25832, format)).coordinateCount, 1);
  const assumed = survey([[xy()]]);
  assumed.data.crsContext = { status: 'assumed', epsg: 25832 };
  // FileUpload's explicit user choice also updates this operational header.
  assert.equal(getGeminiExtent(assumed).sourceCrs, 'EPSG:25832');
  assert.throws(() => getGeminiExtent(survey([[xy()]], [], 25832, 'FOTO')), code('no_survey_source'));
});
test('unknown, unsupported and non-operational CRS fail without identity fallback', () => {
  for (const epsg of [null, '', undefined, 9999, 3857, 'invalid']) {
    const layer = survey([[xy()]]); layer.data.header.COSYS_EPSG = epsg;
    assert.throws(() => getGeminiExtent(layer), code('unsupported_crs'));
  }
  assert.throws(() => getGeminiExtent(survey([[xy()]], [], 4326)), code('invalid_survey_coordinate'));
  assert.throws(() => getGeminiExtent(survey([[xy(10, 59)]], [], 4326), { project: () => { throw new Error('private'); } }), code('extent_projection_failed'));
  assert.throws(() => getGeminiExtent(survey([[xy(10, 59)]], [], 4326), { project: () => [NaN, 1] }), code('extent_projection_failed'));
});
test('invalid, missing or nonnumeric XY cannot silently reduce coverage or manufacture zero', () => {
  for (const invalid of [null, '', undefined, '579300', NaN, Infinity, -Infinity]) {
    for (const axis of ['x', 'y']) {
      assert.throws(() => getGeminiExtent(survey([[xy(), { ...xy(), [axis]: invalid }]])), code('invalid_survey_coordinate'));
    }
  }
  for (const coordinates of [[], null, [undefined], [null]]) {
    const layer = survey(); layer.data.lines = [{ coordinates }];
    assert.throws(() => getGeminiExtent(layer), code('invalid_survey_coordinate'));
  }
  assert.throws(() => getGeminiExtent(survey()), code('no_source_geometry'));
});
test('oversized width, height and area fail explicitly with useful dimensions; no cropping', () => {
  for (const [dx, dy] of [[1801, 0], [0, 1801], [1900, 1900]]) {
    assert.throws(() => getGeminiExtent(survey([[xy(), xy(579300 + dx, 6559200 + dy)]])), (error) => {
      assert.equal(error.code, 'extent_too_large');
      assert.deepEqual(error.dimensions, { width: dx + 200, height: dy + 200, area: (dx + 200) * (dy + 200) }); return true;
    });
  }
  validateGeminiBbox([579000, 6559000, 581000, 6561000]); // inclusive 4 km² limit
  for (const bbox of [[1, 1, 2, 2], [579300, 6559200, 579300, 6559300], [1, 1, Infinity, 2], ['1', 1, 2, 2]]) {
    assert.throws(() => validateGeminiBbox(bbox), code('invalid_bbox'));
  }
});
test('client safety envelope agrees with M1 at exact boundaries and one-metre excesses', () => {
  for (const bbox of [
    [100000, 0, 102000, 2000], [898000, 9998000, 900000, 10000000],
    [99999, 0, 100001, 1], [899999, 0, 900001, 1],
    [100000, -1, 100001, 1], [100000, 9999999, 100001, 10000001],
    [579000, 6559000, 581001, 6559001], [579000, 6559000, 579001, 6561001],
    [579000, 6559000, 581001, 6561001],
  ]) {
    const accepts = (validate) => { try { validate(bbox); return true; } catch { return false; } };
    assert.equal(accepts(validateGeminiBbox), accepts(validateWfsBbox));
  }
});


test('Leaflet viewport uses strict WGS84 projection and the visible envelope without rounding or 100 m buffer', () => {
  const bounds = { getWest: () => 10, getEast: () => 10.01, getSouth: () => 59, getNorth: () => 59.01 };
  const calls = [];
  const bbox = getGeminiMapExtent(bounds, { project: (from, to, xy) => {
    calls.push([from, to, xy]); return [xy[0] * 1000 + 500000, xy[1] * 1000 + 6500000];
  } });
  assert.deepEqual(bbox, [510000, 6559000, 510010, 6559010]);
  assert.equal(calls.length, 68); assert(calls.every(([from, to]) => from === 'EPSG:4326' && to === 'EPSG:25832'));
  const real = getGeminiMapExtent(bounds);
  assert(Math.abs(real[0] - 557434.2814033268) < 0.001); assert(real[2] > real[0]); assert(real[3] > real[1]);
  assert.throws(() => getGeminiMapExtent(bounds, { project: () => [NaN, 0] }), code('extent_projection_failed'));
  assert.throws(() => getGeminiMapExtent({ ...bounds, getWest: () => -181 }), code('invalid_bbox'));
  assert.throws(() => getGeminiMapExtent(bounds, { project: () => { throw new Error('private'); } }), code('extent_projection_failed'));
});
