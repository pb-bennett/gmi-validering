import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { exportFixture } from './helpers/photoExportFixtures.mjs';
import { assertGeminiConventions } from './helpers/geminiPhotoConventions.mjs';
import { buildPhotoExportPlan, capturePhotoExportSnapshot } from '../src/lib/photos/export/photoExportPlan.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { buildPhotoExportPackage } from '../src/lib/photos/export/photoExportPackage.mjs';
const config = { profile: 'gemini-legacy2019' };
for (const time of [null, '2026-05-12', '2026-05-12T14:33', '2026-05-12T14:33:02.123+02:00', '2026-05-12T14:33:02Z']) test(`Gemini conventions, canonical preservation, deterministic original-byte package: ${time}`, async () => {
  const f = await exportFixture({ repeated: true, time, direction: null });
  try {
    f.session.fillMissingPhotoValues(f.layerId, 'direction', 359.875);
    const truth = () => f.ids.map((id) => { const photo = f.session.getPhoto(id); return { position: photo.spatial.current, direction: photo.direction.current, metadata: photo.captureMetadata, occurrence: photo.occurrence }; });
    const before = truth();
    const p = await f.plan(config); assert.deepEqual(p.errors, []); assert.equal(p.crs, 'EPSG:5972');
    const xml = serializePhotoExport(p); const { photos, envelope } = assertGeminiConventions(xml);
    assert.equal(p.counts.compatibilityZCount, 2); assert.equal(p.counts.sharedAttachments, 1);
    assert.equal(p.counts.missingTimestampCount, time?.includes(':02') ? 0 : 2);
    assert.equal(p.counts.timezoneTransformCount, time?.endsWith('Z') || time?.endsWith('+02:00') ? 2 : 0);
    assert.equal(photos[0].getElementsByTagNameNS('*', 'fotograferingstidspunkt')[0]?.textContent, time?.includes(':02') ? '2026-05-12T14:33:02' : undefined);
    assert(xml.includes('<app:retningsverdi>359.875</app:retningsverdi>')); assert(!xml.includes('fotoinformasjon'));
    assert.deepEqual(p.occurrences.map((row) => row.point.z), ['0.000000', '0.000000']);
    // Independent pinned horizontal fixture already used by the standard profiles.
    assert(p.occurrences.some((row) => Math.abs(Number(row.point.easting) - 581932.579) < .001));
    assert(p.occurrences.some((row) => Math.abs(Number(row.point.northing) - 6566001.892) < .001));
    const positions = p.occurrences.map((row) => [Number(row.point.easting), Number(row.point.northing), 0]);
    for (const [tag, operation] of [['lowerCorner', Math.min], ['upperCorner', Math.max]]) assert.deepEqual(envelope.getElementsByTagNameNS('*', tag)[0].textContent.split(' ').map(Number), [0, 1, 2].map((axis) => operation(...positions.map((point) => point[axis]))));
    const bytes = new Uint8Array(await (await buildPhotoExportPackage(p)).arrayBuffer()), zip = unzipSync(bytes);
    assert.deepEqual(Object.keys(zip), ['photos.gml', ...p.attachments.map((a) => a.path)]);
    assert.equal(strFromU8(zip['photos.gml']), xml);
    for (const a of p.attachments) assert.deepEqual(zip[a.path], new Uint8Array(await p.assets.find((asset) => asset.assetId === a.assetId).file.arrayBuffer()));
    assert.equal(xml, serializePhotoExport(await f.plan(config)));
    assert.deepEqual(truth(), before);
    if (!time || !time.includes(':02')) assert((await f.plan()).errors.some((e) => e.code.startsWith('capture-time')));
  } finally { f.session.clear(); }
});
test('Gemini unknown direction and empty/all-unplaced layers block; known north is explicit', async () => {
  for (const options of [{ direction: null }, { unplaced: true }]) {
    const f = await exportFixture(options);
    try { const p = await f.plan(config); assert(p.errors.length); assert.throws(() => serializePhotoExport(p)); }
    finally { f.session.clear(); }
  }
  const f = await exportFixture({ time: null, direction: 0 });
  try {
    const snapshot = capturePhotoExportSnapshot(f.session, f.layerId);
    const empty = await buildPhotoExportPlan({ ...snapshot, occurrences: [], assets: [] }, config);
    assert(empty.errors.some((e) => e.code === 'no-placed-photos')); assert.throws(() => serializePhotoExport(empty));
    assert(serializePhotoExport(await f.plan(config)).includes('<app:retningsverdi>0</app:retningsverdi>')); }
  finally { f.session.clear(); }
});
test('Gemini collision-safe Unicode filenames, projection failure and stale plan protection', async () => {
  const f = await exportFixture({ names: ['Grøft æ image.png', 'GRØFT Æ IMAGE.PNG'] });
  try {
    const p = await f.plan(config); assertGeminiConventions(serializePhotoExport(p));
    assert.equal(new Set(p.attachments.map((a) => a.filename.toLowerCase())).size, 2);
    const failed = await f.plan(config, { transform() { return [NaN, Infinity]; } }); assert(failed.errors.some((e) => e.code === 'projection-failed'));
    f.session.clear(); assert.throws(() => serializePhotoExport(p)); await assert.rejects(buildPhotoExportPackage(p));
  } finally { f.session.clear(); }
});
test('optional read-only contractor structural comparator', async (t) => {
  const folder = path.resolve('REF_FILES/GML-leveranse'); let files;
  try { files = await readdir(folder); } catch (e) { if (e.code === 'ENOENT') return t.skip('Reference folder unavailable; portable synthetic checks still run.'); throw e; }
  const gml = files.filter((name) => name.toLowerCase().endsWith('.gml')); assert.equal(gml.length, 1);
  const { photos } = assertGeminiConventions(await readFile(path.join(folder, gml[0]), 'utf8'));
  assert.equal(photos.length, 40); assert.equal(photos.filter((p) => !p.getElementsByTagNameNS('*', 'fotograferingstidspunkt').length).length, 14);
  const links = photos.map((p) => p.getElementsByTagNameNS('*', 'fotolink')[0].textContent);
  assert.equal(new Set(links).size, 40);
  for (const link of links) await readFile(path.join(folder, ...link.split('\\')));
  t.diagnostic('40 reference features checked read-only; private filenames and coordinates excluded from output.');
});
