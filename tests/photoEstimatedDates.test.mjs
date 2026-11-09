import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { estimatedCaptureTime, midpointCaptureDate, photoEstimatedDateModel } from '../src/lib/photos/photoEstimatedDates.mjs';
import { formatPhotoCaptureTime, photoCaptureTimeStatus, photoMetadataSourceLabel } from '../src/lib/photos/photoPresentation.mjs';
import { completionSummary, photoCaptureTimeSchemaWarning } from '../src/lib/photos/photoCompletion.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { buildPhotoExportPackage } from '../src/lib/photos/export/photoExportPackage.mjs';
import { capturePhotoExportSnapshot, buildPhotoExportPlan } from '../src/lib/photos/export/photoExportPlan.mjs';
import { unzipSync, strFromU8 } from 'fflate';
import { completionLayer, completionView, jpeg, sharedOriginalLayer } from './helpers/photoCompletionFixtures.mjs';

for (const [first, last, expected] of [
  ['2026-01-30', '2026-02-03', '2026-02-01'],
  ['2025-12-30', '2026-01-03', '2026-01-01'],
  ['2024-02-28', '2024-03-01', '2024-02-29'],
  ['2026-03-28', '2026-03-30', '2026-03-29'],
  ['2026-10-24', '2026-10-26', '2026-10-25'],
  ['2026-01-01', '2026-01-02', '2026-01-01'],
  ['2026-01-01', '2026-01-01', '2026-01-01'],
  ['0099-12-31', '0100-01-02', '0100-01-01'],
]) test(`calendar midpoint ${first} – ${last}: ${expected}, independent of endpoint order`, () => {
  assert.equal(midpointCaptureDate(first, last), expected);
  assert.equal(midpointCaptureDate(last, first), expected);
});

test('calendar midpoint and noon are identical in every host timezone', () => {
  const script = `import {midpointCaptureDate,estimatedCaptureTime} from './src/lib/photos/photoEstimatedDates.mjs'; console.log(JSON.stringify([midpointCaptureDate('2025-12-30','2026-01-03'),estimatedCaptureTime('2026-03-29')]));`;
  const outputs = ['UTC', 'Europe/Oslo', 'America/Los_Angeles', 'Pacific/Kiritimati'].map((TZ) => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  });
  assert.equal(new Set(outputs).size, 1);
  assert.equal(JSON.parse(outputs[0])[1].iso, '2026-03-29T12:00:00');
  for (const invalid of ['', '2026-02-29', '2026-01-01T13:00:00', null]) {
    assert.equal(estimatedCaptureTime(invalid), null);
    assert.equal(midpointCaptureDate(invalid, '2026-01-01'), null);
  }
});

async function layer(options = {}) {
  return completionLayer([
    jpeg('old.jpg', { captureTime: '2025:12:30 23:59:59', offsetTime: '-12:00' }),
    jpeg('new.jpg', { captureTime: '2026:01:03 00:00:01', offsetTime: '+14:00' }),
    jpeg('missing-a.jpg'), jpeg('missing-b.jpg'),
  ], options);
}
const fill = (f, date) => f.session.fillMissingPhotoValues(f.layerId, 'captureTime', date, null, { estimated: true });
const model = (f) => photoEstimatedDateModel(f.session.getLayerPhotos(f.layerId));
const time = (f, id) => f.session.getPhoto(id).captureMetadata.captureTime;

test('one click fills every missing original, preserves known clocks/EXIF/files, publishes once, and never applies twice', async () => {
  const f = await layer({ place: false }), s = f.session;
  try {
    const before = f.ids.map((id) => ({ time: time(f, id), file: s.getFile(id), evidence: s.getPhoto(id).metadataEvidence }));
    const bytes = await Promise.all(before.map((item) => item.file.arrayBuffer()));
    assert.deepEqual(model(f), { first: '2025-12-30', last: '2026-01-03', suggestedDate: '2026-01-01', missing: 2 });
    let published = 0;
    const unsubscribe = s.subscribe(() => published++);
    const result = fill(f, model(f).suggestedDate);
    assert.equal(result.counts.adopted, 2);
    assert.equal(published, 1);
    assert.equal(model(f).missing, 0);
    assert.equal(model(f).suggestedDate, '2026-01-01');
    for (const id of f.ids.slice(2)) {
      assert.equal(time(f, id).value.iso, '2026-01-01T12:00:00');
      assert.deepEqual(time(f, id).provenance, { kind: 'manual', mode: 'bulk', estimated: true });
    }
    assert.strictEqual(time(f, f.ids[0]), before[0].time);
    assert.strictEqual(time(f, f.ids[1]), before[1].time);
    assert.equal(fill(f, '2030-01-01').counts.adopted, 0);
    assert.equal(published, 1);
    unsubscribe();
    for (const [index, id] of f.ids.entries()) {
      assert.strictEqual(s.getFile(id), before[index].file);
      assert.strictEqual(s.getPhoto(id).metadataEvidence, before[index].evidence);
      assert.deepEqual(await s.getFile(id).arrayBuffer(), bytes[index]);
    }
  } finally { s.clear(); }
});

test('three-photo package with one known date proposes that calendar date for both missing photographs', async () => {
  const f = await completionLayer([jpeg('known.jpg', { captureTime: '2026:10:25 00:30:01', offsetTime: '+02:00' }), jpeg('a.jpg'), jpeg('b.jpg')]);
  try {
    assert.deepEqual(model(f), { first: '2026-10-25', last: '2026-10-25', suggestedDate: '2026-10-25', missing: 2 });
    const known = time(f, f.ids[0]);
    assert.equal(fill(f, model(f).suggestedDate).counts.adopted, 2);
    assert.strictEqual(time(f, f.ids[0]), known);
    assert.equal(time(f, f.ids[1]).value.iso, '2026-10-25T12:00:00');
    assert.equal(time(f, f.ids[2]).value.iso, '2026-10-25T12:00:00');
  } finally { f.session.clear(); }
});

test('manual bulk dates, individual estimated adjustments, precise editing, and safe undo preserve later edits', async () => {
  const f = await layer(), s = f.session;
  try {
    const result = fill(f, '2024-02-29');
    assert.equal(time(f, f.ids[2]).value.iso, '2024-02-29T12:00:00');
    assert(s.setCaptureMetadata(f.layerId, [f.ids[2]], 'captureTime', '2026-02-03', { estimated: true }).ok);
    assert.equal(time(f, f.ids[2]).value.iso, '2026-02-03T12:00:00');
    s.setCaptureMetadata(f.layerId, [f.ids[3]], 'photographer', 'Later edit');
    assert.deepEqual(s.undoCaptureTimeFill(result.undoToken), { ok: true, restored: 1, skipped: 1 });
    assert.equal(time(f, f.ids[3]), null);
    assert.equal(s.getPhoto(f.ids[3]).captureMetadata.photographer.value, 'Later edit');
    assert.equal(time(f, f.ids[2]).value.iso, '2026-02-03T12:00:00');
    assert.equal(s.undoCaptureTimeFill(result.undoToken).ok, false);
    assert(s.setCaptureMetadata(f.layerId, [f.ids[2]], 'captureTime', '2026-02-03T17:34:59+01:00').ok);
    assert.equal(time(f, f.ids[2]).provenance.estimated, undefined);
    assert.equal(time(f, f.ids[2]).value.iso, '2026-02-03T17:34:59+01:00');
    const next = fill(f, '2025-01-01');
    assert.equal(next.counts.adopted, 1);
    assert.deepEqual(s.undoCaptureTimeFill(next.undoToken), { ok: true, restored: 1, skipped: 0 });
  } finally { s.clear(); }
});

test('missing-date action preserves accepted date-only values; invalid dates are atomic', async () => {
  const f = await layer(), s = f.session;
  try {
    s.setCaptureMetadata(f.layerId, [f.ids[2]], 'captureTime', '2026-04-01');
    const accepted = time(f, f.ids[2]);
    for (const invalid of ['', '2026-02-29', '2026-01-01T05:00:00']) {
      assert.equal(fill(f, invalid).ok, false);
      assert.equal(time(f, f.ids[3]), null);
      assert.equal(s.setCaptureMetadata(f.layerId, [f.ids[3]], 'captureTime', invalid, { estimated: true }).ok, false);
    }
    assert.equal(fill(f, '2026-05-01').counts.adopted, 1);
    assert.strictEqual(time(f, f.ids[2]), accepted);
  } finally { s.clear(); }
});

test('undo restores clear decisions, deduplicates shared originals, and rejects removed/reset sessions', async () => {
  const f = await sharedOriginalLayer(jpeg('shared.jpg')), s = f.session;
  try {
    s.setCaptureMetadata(f.layerId, f.ids, 'captureTime', null);
    const result = fill(f, '2026-05-01');
    assert.equal(result.counts.adopted, 1);
    assert.strictEqual(time(f, f.ids[0]), time(f, f.ids[1]));
    assert.equal(s.getPhoto(f.ids[0]).captureMetadata.captureTimeCleared, undefined);
    assert.equal(s.undoCaptureTimeFill(result.undoToken).restored, 1);
    assert.equal(s.getPhoto(f.ids[0]).captureMetadata.captureTimeCleared, true);
    const removed = fill(f, '2026-05-01');
    s.removeLayerPhotos(f.layerId, f.ids, { confirmed: true });
    assert.equal(s.undoCaptureTimeFill(removed.undoToken).restored, 0);
    s.clear();
    assert.equal(s.undoCaptureTimeFill(removed.undoToken).ok, false);
  } finally { s.clear(); }
});

test('one reliable original supplies both endpoints; estimates and conflicting auto sources do not feed suggestions', async () => {
  const f = await sharedOriginalLayer(jpeg('shared.jpg', { captureTime: '2026:01:01 10:00:00' }));
  try {
    assert.equal(model(f).suggestedDate, '2026-01-01', 'one reliable original defines a zero-width range');
    f.session.setCaptureMetadata(f.layerId, f.ids, 'captureTime', '2099-01-01', { estimated: true });
    assert.equal(model(f).suggestedDate, null);
  } finally { f.session.clear(); }
  const g = await completionLayer([jpeg('a.jpg', { captureTime: '2026:01:01 10:00:00' }), jpeg('b.jpg'), jpeg('c.jpg')], {
    gml: [{ name: 'a.jpg', time: '2025-01-01T10:00:00' }],
  });
  try {
    assert.equal(model(g).suggestedDate, null);
    assert.equal(fill(g, '2026-05-01').counts.adopted, 2, 'manual entry is available without a range');
    assert.equal(model(g).suggestedDate, null, 'estimated dates cannot become anchors');
  } finally { g.session.clear(); }
});

test('readiness, warnings, completion counts and real Gemini GML/ZIP update immediately and reverse on undo', async () => {
  const f = await layer(), s = f.session;
  const plan = () => buildPhotoExportPlan(capturePhotoExportSnapshot(s, f.layerId), { profile: 'gemini-legacy2019', crs: 'EPSG:5972' });
  try {
    assert.equal(completionView(s, f.layerId).model.captureTime.outstanding, 2);
    assert(photoCaptureTimeSchemaWarning(completionView(s, f.layerId).readiness));
    const before = await plan();
    const result = fill(f, '2026-01-01');
    assert.equal(before.isLive(), false);
    const view = completionView(s, f.layerId);
    assert.equal(view.model.captureTime.outstanding, 0);
    assert.equal(view.readiness.levels.schema.met, true);
    assert.equal(photoCaptureTimeSchemaWarning(view.readiness), null);
    assert.equal(view.readiness.recommendations.find((item) => item.code === 'capture-time-estimated').count, 2);
    assert(!view.readiness.recommendations.some((item) => item.code === 'capture-time-bulk'), 'estimated dates have their own precise explanation');
    assert.equal(completionSummary(view.model.captureTime, []).find((item) => item.key === 'estimated').count, 2);
    const photo = s.getPhoto(f.ids[2]), accepted = time(f, f.ids[2]);
    assert.match(photoCaptureTimeStatus(photo), /Anslått/);
    assert.equal(photoMetadataSourceLabel('captureTime', accepted.provenance), 'Anslått');
    assert.match(formatPhotoCaptureTime(accepted.value, accepted.provenance).text, /01\.01\.2026 · Anslått/);
    const after = await plan();
    assert.deepEqual(after.errors, []);
    assert.equal(after.counts.missingTimestampCount, 0);
    assert.match(after.warnings.find((item) => item.code === 'capture-time-estimated').message, /ikke målt opptakstid/);
    const xml = serializePhotoExport(after);
    assert.equal((xml.match(/<app:fotograferingstidspunkt>2026-01-01T12:00:00<\/app:fotograferingstidspunkt>/g) || []).length, 2);
    assert(xml.includes('2025-12-30T23:59:59'));
    assert(xml.includes('2026-01-03T00:00:01'));
    const zip = unzipSync(new Uint8Array(await (await buildPhotoExportPackage(after)).arrayBuffer()));
    assert.equal(strFromU8(zip[after.naming.gmlFilename]), xml);
    for (const asset of after.assets) {
      const attachment = after.attachments.find((item) => item.assetId === asset.assetId);
      assert(attachment);
      assert.deepEqual(zip[attachment.path], new Uint8Array(await s.getAssetFile(asset.assetId).arrayBuffer()));
    }
    s.undoCaptureTimeFill(result.undoToken);
    assert.equal(after.isLive(), false);
    const undone = completionView(s, f.layerId);
    assert.equal(undone.model.captureTime.outstanding, 2);
    assert(photoCaptureTimeSchemaWarning(undone.readiness));
    assert(!undone.readiness.recommendations.some((item) => item.code === 'capture-time-estimated'));
  } finally { s.clear(); }
});
