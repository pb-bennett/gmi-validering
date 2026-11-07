import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { normalizeManualPhotoFill, planManualPhotoFill } from '../src/lib/photos/photoManualFill.mjs';
import { exifCaptureEvidence } from '../src/lib/photos/photoCaptureMetadata.mjs';
import { exifDirectionEvidence } from '../src/lib/photos/photoDirection.mjs';
import { capturePhotoExportSnapshot, assertExportablePlan } from '../src/lib/photos/export/photoExportPlan.mjs';
import { buildPhotoExportPackage } from '../src/lib/photos/export/photoExportPackage.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { exportFixture } from './helpers/photoExportFixtures.mjs';

const time = '2026-09-17T10:30:02';
const inputs = { captureTime: time, photographer: ' Synthetic   Artist ', direction: 0 };
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function setup(options = {}) {
  return exportFixture({ names: ['a.png', 'b.png'], repeated: true, time: null, photographer: null, direction: null, ...options });
}
const accepted = (photo, field) => field === 'direction' ? photo.direction.current : photo.captureMetadata[field];

for (const field of ['captureTime', 'photographer', 'direction']) test(`${field}: selection, shared asset ownership, whole layer, counts, provenance and single publish`, async () => {
  const f = await setup(), s = f.session;
  try {
    const photos = s.getLayerPhotos(f.layerId), a = photos.filter((photo) => photo.originalFilename === 'a.png'), b = photos.find((photo) => photo.originalFilename === 'b.png');
    assert.equal(a.length, 2);
    let publications = 0;
    const unsubscribe = s.subscribe(() => publications++);
    const result = s.fillMissingPhotoValues(f.layerId, field, inputs[field], [a[0].id, a[1].id, a[0].id, 'removed']);
    unsubscribe();
    assert.equal(publications, 1);
    assert.equal(result.counts.adopted, field === 'direction' ? 2 : 1);
    assert.equal(result.counts.eligible, result.counts.adopted); assert.equal(result.counts.stale, 1);
    assert.equal(result.counts.deduplicated, field === 'direction' ? 0 : 1);
    assert.equal(result.counts.repeatedApplications, field === 'direction' ? 2 : 0);
    assert.equal(accepted(s.getPhoto(b.id), field), null);
    const value = accepted(s.getPhoto(a[0].id), field);
    const provenance = field === 'direction' ? value.basis : value.provenance;
    assert.deepEqual(provenance, { kind: 'manual', mode: 'bulk' }); assert(Number.isFinite(value.acceptedAt));
    assert.equal(s.getPhoto(a[0].id).metadataEvidence.length, 0);
    assert.equal(s.getPhoto(a[0].id).directionEvidence.length, 0);
    if (field !== 'direction') assert.strictEqual(accepted(s.getPhoto(a[1].id), field), value);
    else assert.notStrictEqual(accepted(s.getPhoto(a[1].id), field), value);
    const whole = s.fillMissingPhotoValues(f.layerId, field, field === 'direction' ? 270 : field === 'captureTime' ? '2025-01-01T01:02:03Z' : 'Other');
    assert.equal(whole.counts.adopted, 1); assert.equal(whole.counts.alreadyAccepted, field === 'direction' ? 2 : 1);
    assert.strictEqual(accepted(s.getPhoto(a[0].id), field), value);
    assert.equal(s.fillMissingPhotoValues(f.layerId, field, inputs[field], []).counts.adopted, 0);
    assert.equal(s.fillMissingPhotoValues(f.layerId, field, inputs[field]).counts.adopted, 0);
  } finally { s.clear(); }
});

for (const [field, input] of Object.entries(inputs)) test(`${field}: invalid input is atomic, existing single manual values survive, foreign/removed/reset safety`, async () => {
  const f = await setup(), s = f.session;
  try {
    const photos = s.getLayerPhotos(f.layerId), id = photos[0].id;
    if (field === 'direction') s.applyPhotoEdits(s.beginPhotoEdits(f.layerId), [{ photoId: id, degrees: 0 }]);
    else s.setCaptureMetadata(f.layerId, [id], field, field === 'captureTime' ? '2024-01-01' : 'Existing');
    const before = accepted(s.getPhoto(id), field);
    const failed = s.fillMissingPhotoValues(f.layerId, field, field === 'direction' ? Infinity : '');
    assert.equal(failed.ok, false); assert.equal(failed.counts.invalidInput, 1); assert.equal(failed.counts.adopted, 0);
    assert(photos.some((photo) => accepted(s.getPhoto(photo.id), field) === null));
    s.fillMissingPhotoValues(f.layerId, field, input);
    assert.strictEqual(accepted(s.getPhoto(id), field), before);
    assert.equal((field === 'direction' ? before.basis : before.provenance).mode, undefined);
    const foreign = s.importFiles([new File(['image'], 'foreign.png')]).acceptedIds[0];
    assert.equal(s.fillMissingPhotoValues(f.layerId, field, input, [foreign]).counts.stale, 1);
    s.removeLayerPhotos(f.layerId, [id], { confirmed: true });
    assert.equal(s.fillMissingPhotoValues(f.layerId, field, input, [id]).counts.stale, 1);
    s.clear();
    assert.equal(s.fillMissingPhotoValues(f.layerId, field, input, [id]).counts.stale, 1);
    const fresh = s.importFiles([new File(['fresh'], 'fresh.png')]).acceptedIds[0]; s.createLayer();
    assert.equal(accepted(s.getPhoto(fresh), field), null);
  } finally { s.clear(); }
});

for (const [input, offset, precision] of [
  [time, null, 'second'], ['2026-09-17 10:30:02.012345678', null, 'fraction'],
  [`${time}+02:30`, '+02:30', 'second'], [`${time}.012Z`, 'Z', 'fraction'], [`${time}-00:00`, '-00:00', 'second'],
]) test(`full canonical capture time preserved: ${input}`, async () => {
  const f = await setup({ names: ['one.png'], repeated: false });
  try {
    const result = f.session.fillMissingPhotoValues(f.layerId, 'captureTime', input);
    assert.equal(result.counts.adopted, 1);
    const value = f.session.getPhoto(f.ids[0]).captureMetadata.captureTime.value;
    assert.equal(value.iso, input.replace(' ', 'T')); assert.equal(value.offset, offset);
    assert.equal(value.timezoneKnown, offset !== null); assert.equal(value.precision, precision);
  } finally { f.session.clear(); }
});

test('capture time normalization is independent of host timezone', () => {
  const script = `import {normalizeManualPhotoFill} from './src/lib/photos/photoManualFill.mjs'; console.log(JSON.stringify(normalizeManualPhotoFill('captureTime','${time}')))`;
  const outputs = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map((TZ) => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  });
  assert.equal(new Set(outputs).size, 1); assert.equal(JSON.parse(outputs[0]).iso, time);
});

test('capture time rejects insufficient precision, invalid calendar/time/offset and invented defaults', () => {
  for (const value of [null, '', '2026-09-17', '2026-09-17T10:30', '2026-09-17T10:30Z', '2026-02-29T10:30:00',
    '2026-13-01T10:30:00', '2026-09-17T24:00:00', '2026-09-17T10:60:00', '2026-09-17T10:30:60', `${time}+14:01`, `${time} Europe/Oslo`]) {
    assert.equal(normalizeManualPhotoFill('captureTime', value), null, String(value));
  }
});

test('photographer normalizes whitespace only and rejects blank/XML-illegal input', () => {
  assert.equal(normalizeManualPhotoFill('photographer', '  KaRi\n  van Nord  '), 'KaRi van Nord');
  for (const value of ['', '   ', null, 'Name\u0000', 'Name\u000b', '\ud800', '\ufffe']) assert.equal(normalizeManualPhotoFill('photographer', value), null);
  assert.equal(normalizeManualPhotoFill('photographer', 'Name & <Other>'), 'Name & <Other>');
});

for (const [input, expected] of [[0, 0], [90, 90], [180, 180], [270, 270], [359.875, 359.875], [360, 0]]) test(`manual direction ${input} stays exact/known`, async () => {
  const f = await setup({ names: ['one.png'], repeated: false });
  try {
    assert.equal(f.session.fillMissingPhotoValues(f.layerId, 'direction', input).counts.adopted, 1);
    const current = f.session.getPhoto(f.ids[0]).direction.current;
    assert.equal(current.degrees, expected); assert.equal(current.acceptance, 'manual');
    assert.deepEqual(current.basis, { kind: 'manual', mode: 'bulk' });
  } finally { f.session.clear(); }
});

test('direction rejects nonfinite/out-of-range/malformed values instead of wrapping/rounding them', () => {
  for (const value of [NaN, Infinity, -Infinity, -1, 360.001, 720, '0', '', null, undefined]) assert.equal(normalizeManualPhotoFill('direction', value), null, String(value));
});

test('a default stays open to manual fill, an unselected sibling keeps its default, and EXIF north is preserved', async () => {
  let n = 0;
  const f = await setup({ extractGps: async () => ({ state: 'no-gps', directionEvidence: n++ === 1 ? exifDirectionEvidence({ GPSImgDirection: 0, GPSImgDirectionRef: 'T' }) : [] }) });
  try {
    const s = f.session;
    while (s.getLayerPhotos(f.layerId).some((photo) => photo.spatial.exifRead.state === 'pending')) await tick();
    const photos = s.getLayerPhotos(f.layerId), a = photos.filter((photo) => photo.originalFilename === 'a.png'), b = photos.find((photo) => photo.originalFilename === 'b.png');
    const source = s.getPhoto(b.id).direction.current;
    assert.equal(source.basis.kind, 'exif');
    assert.equal(s.fillMissingPhotoValues(f.layerId, 'direction', 42.125, [a[0].id]).counts.adopted, 1);
    assert.equal(s.getPhoto(a[1].id).direction.current.basis.kind, 'default');
    const result = s.fillMissingPhotoValues(f.layerId, 'direction', 180);
    assert.equal(result.counts.adopted, 1); assert.equal(result.counts.repeatedApplications, 1);
    assert.equal(result.counts.alreadyAccepted, 2); assert.strictEqual(s.getPhoto(b.id).direction.current, source);
  } finally { f.session.clear(); }
});

test('evidence first: seven of ten timestamps accepted on their own, live manual fallback fills exactly three', async () => {
  const f = await setup({ repeated: false, names: Array.from({ length: 10 }, (_, i) => `${i}.png`),
    extractGps: async (file) => ({ state: 'no-gps', metadataEvidence: Number(file.name.split('.')[0]) < 7 ? exifCaptureEvidence({ DateTimeOriginal: '2026:05:12 14:33:02' }) : [] }) });
  try {
    const s = f.session;
    while (s.getLayerPhotos(f.layerId).some((photo) => photo.spatial.exifRead.state === 'pending')) await tick();
    const ids = [...f.ids];
    assert.equal(planManualPhotoFill(s.getLayerPhotos(f.layerId), 'captureTime').counts.eligible, 3);
    const source = s.getPhoto(ids[0]).captureMetadata.captureTime;
    const result = s.fillMissingPhotoValues(f.layerId, 'captureTime', time, ids);
    assert.equal(result.counts.adopted, 3); assert.equal(result.counts.alreadyAccepted, 7);
    assert.strictEqual(s.getPhoto(ids[0]).captureMetadata.captureTime, source);
  } finally { f.session.clear(); }
});

test('manual first and late EXIF evidence: no automatic or explicit bulk adoption overwrite', async () => {
  let finish;
  const f = await setup({ names: ['one.png'], repeated: false, extractGps: () => new Promise((resolve) => { finish = resolve; }) });
  try {
    const s = f.session;
    for (const [field, input] of Object.entries(inputs)) s.fillMissingPhotoValues(f.layerId, field, input);
    const before = s.getPhoto(f.ids[0]);
    while (!finish) await tick();
    finish({ state: 'no-gps', metadataEvidence: exifCaptureEvidence({ DateTimeOriginal: '2025:01:01 01:02:03', Artist: 'Different' }),
      directionEvidence: exifDirectionEvidence({ GPSImgDirection: 90, GPSImgDirectionRef: 'T' }) });
    while (!s.getPhoto(f.ids[0]).metadataEvidence.length) await tick();
    for (const field of Object.keys(inputs)) {
      assert.equal(s.adoptSourceEvidence(f.layerId, field).counts.adopted, 0);
      assert.strictEqual(accepted(s.getPhoto(f.ids[0]), field), accepted(before, field));
    }
  } finally { f.session.clear(); }
});

test('a per-photo manual correction replaces a source value, keeps the evidence, and later sources leave it alone', async () => {
  const f = await setup({ names: ['a.png'], repeated: false,
    extractGps: async () => ({ state: 'no-gps', metadataEvidence: exifCaptureEvidence({ DateTimeOriginal: '2026:05:12 14:33:02' }) }),
    parseGml: async () => ({ entries: [{ id: 'entry', raw: { fotolink: 'a.png', photographedAtText: '2025-01-01T01:02:03' }, status: 'invalid', position: null }] }) });
  try {
    const s = f.session;
    while (!s.getPhoto(f.ids[0]).metadataEvidence.length) await tick();
    assert(s.setCaptureMetadata(f.layerId, f.ids, 'captureTime', time).ok);
    await s.stageLayerSource(f.layerId, new File(['source'], 'source.gml')); s.applyLayerSource(f.layerId);
    const photo = s.getPhoto(f.ids[0]);
    assert.equal(photo.captureMetadata.captureTime.provenance.kind, 'manual'); assert.equal(photo.captureMetadata.captureTime.value.iso, time);
    assert.equal(photo.metadataEvidence.length, 2);
  } finally { f.session.clear(); }
});

for (const field of Object.keys(inputs)) test(`${field}: preview invalidated, failed/no-op fill leaves plan live, package guards remain strict`, async () => {
  const f = await setup();
  try {
    const snapshot = capturePhotoExportSnapshot(f.session, f.layerId), blocked = await f.plan();
    const failed = f.session.fillMissingPhotoValues(f.layerId, field, field === 'direction' ? NaN : '');
    assert.equal(failed.ok, false); assert.equal(snapshot.isLive(), true);
    f.session.fillMissingPhotoValues(f.layerId, field, inputs[field]);
    assert.equal(snapshot.isLive(), false); assert.equal(blocked.isLive(), false); await assert.rejects(buildPhotoExportPackage(blocked));
    for (const [other, input] of Object.entries(inputs)) f.session.fillMissingPhotoValues(f.layerId, other, input);
    const plan = await f.plan(); assert.deepEqual(plan.errors, []); assertExportablePlan(plan);
    assert.equal(f.session.fillMissingPhotoValues(f.layerId, field, inputs[field]).counts.adopted, 0); assert.equal(plan.isLive(), true);
    const xml = serializePhotoExport(plan); assert(xml.includes(time)); assert(xml.includes('<app:retningsverdi>0</app:retningsverdi>'));
    assert((await buildPhotoExportPackage(plan)).size > 0);
    assert.deepEqual((await f.plan({ profile: 'asbuilt52' })).errors, []);
    assert.equal((await f.plan({ profile: 'asbuilt52', context: {} })).errors.filter((error) => error.code === 'invalid-context').length, 7);
  } finally { f.session.clear(); }
});

test('manual batch publishes once for a large layer; zero targets/invalid field never publish', () => {
  let id = 0;
  const s = createPhotoSession({ createId: () => `large-${++id}`, yieldJob: tick,
    createThumbnail: async () => ({ thumbnailBlob: new Blob(['preview']) }), extractGps: async () => ({ state: 'no-gps' }),
    urls: { createObjectURL: () => 'blob:synthetic', revokeObjectURL() {} } });
  try {
    s.importFiles(Array.from({ length: 150 }, (_, n) => new File(['image'], `${n}.png`))); const layer = s.createLayer();
    let calls = 0; const unsubscribe = s.subscribe(() => calls++);
    assert.equal(s.fillMissingPhotoValues(layer.id, 'captureTime', time).counts.adopted, 150); assert.equal(calls, 1);
    s.fillMissingPhotoValues(layer.id, 'captureTime', time); s.fillMissingPhotoValues(layer.id, 'position', 'fake'); assert.equal(calls, 1);
    unsubscribe();
  } finally { s.clear(); }
});
