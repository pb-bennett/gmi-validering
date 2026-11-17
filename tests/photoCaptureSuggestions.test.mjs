import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceSession, tick } from './helpers/photoEvidenceFixtures.mjs';
import { completionGml, jpeg } from './helpers/photoCompletionFixtures.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { formatPhotoCaptureTime, photoMetadataSourceLabel, photoSourceLabel } from '../src/lib/photos/photoPresentation.mjs';

const exifTime = { captureTime: '2026:10:16 09:00:00' };
const files = () => [jpeg('20261014_143302.jpg'), jpeg('KUM12_20261015.jpg'), jpeg('20261016_1433.jpg', exifTime), jpeg('IMG_1234.jpg'), jpeg('20261013_0915.jpg')];
async function settleDraft(session) {
  for (let turn = 0; turn < 200000; turn++) {
    if (session.getSnapshot().photos.every((photo) => photo.spatial.exifRead.state !== 'pending')) return;
    await tick();
  }
  assert.fail('EXIF did not finish');
}
async function draft(list = files(), options = {}) {
  const session = evidenceSession(options);
  session.beginImport();
  session.importFiles(list);
  await settleDraft(session);
  return session;
}
const byName = (session, layerId) => Object.fromEntries(session.getLayerPhotos(layerId).map((photo) => [photo.originalFilename, photo]));
const commit = (session, captureSuggestions, placement = { kind: 'none' }, loadedReview = null, gmlCaptureTime = null) => {
  const preview = session.previewImport({ placement, loadedReview });
  return { preview, result: session.completeImport({ placement, preview, loadedReview, captureSuggestions, gmlCaptureTime }) };
};

test('preview offers filename suggestions only where EXIF has no time, split by precision', async () => {
  const session = await draft();
  const { captureSuggestions: plan } = session.previewImport({ placement: { kind: 'none' } });
  assert.equal(plan.missing, 4); assert.equal(plan.pending, 0);
  assert.deepEqual(plan.complete.map((item) => [item.filename, item.value.iso]), [['20261014_143302.jpg', '2026-10-14T14:33:02'], ['20261013_0915.jpg', '2026-10-13T09:15']]);
  assert.deepEqual(plan.dateOnly.map((item) => [item.filename, item.value.iso]), [['KUM12_20261015.jpg', '2026-10-15']]);
  session.clear();
});

for (const [label, choices, expected] of [
  ['both off', { complete: false, dateOnly: false }, {}],
  ['no choice', null, {}],
  ['date and time only', { complete: true }, { '20261014_143302.jpg': ['2026-10-14T14:33:02', 'second'], '20261013_0915.jpg': ['2026-10-13T09:15', 'minute'] }],
  ['date only', { dateOnly: true }, { 'KUM12_20261015.jpg': ['2026-10-15', 'date'] }],
  ['both', { complete: true, dateOnly: true }, { '20261014_143302.jpg': ['2026-10-14T14:33:02', 'second'], '20261013_0915.jpg': ['2026-10-13T09:15', 'minute'], 'KUM12_20261015.jpg': ['2026-10-15', 'date'] }],
]) test(`commit with ${label} writes exactly the chosen filename values before publication`, async () => {
  const session = await draft();
  const before = new Map(session.getSnapshot().photos.map((photo) => [photo.id, { file: session.getFile(photo.id), evidence: photo.metadataEvidence }]));
  const bytes = new Map(await Promise.all([...before].map(async ([id, item]) => [id, new Uint8Array(await item.file.arrayBuffer())])));
  const { result } = commit(session, choices);
  assert(result.ok);
  const photos = byName(session, result.layer.id);
  for (const [name, photo] of Object.entries(photos)) {
    const accepted = photo.captureMetadata.captureTime;
    if (name === '20261016_1433.jpg') { assert.equal(accepted.provenance.kind, 'exif'); assert.equal(accepted.value.iso, '2026-10-16T09:00:00'); continue; }
    if (!expected[name]) { assert.equal(accepted, null, name); continue; }
    assert.deepEqual([accepted.value.iso, accepted.value.precision, accepted.value.offset, accepted.value.timezoneKnown], [...expected[name], null, false]);
    assert.equal(accepted.provenance.kind, 'filename'); assert.equal(accepted.provenance.raw, name); assert.equal(accepted.provenance.via, 'import-suggestion');
    assert(!('acceptance' in accepted), 'approved filename values are not automatically replaceable');
    if (expected[name][1] === 'date') assert(!accepted.value.iso.includes('T'));
  }
  // Original bytes, filenames and source evidence are untouched; no filename evidence is stored.
  for (const photo of Object.values(photos)) {
    assert.strictEqual(session.getFile(photo.id), before.get(photo.assetId).file);
    assert.deepEqual(new Uint8Array(await session.getFile(photo.id).arrayBuffer()), bytes.get(photo.assetId));
    assert.strictEqual(photo.metadataEvidence, before.get(photo.assetId).evidence);
    assert(!photo.metadataEvidence.some((item) => item.kind === 'filename'));
  }
  session.clear();
});

test('a draft GML capture time excludes the photo; GML without a time does not', async () => {
  for (const gmlCaptureTime of [null, { complete: true, partial: false, conflicts: 'keep' }]) {
    const session = await draft([jpeg('20261014_143302.jpg'), jpeg('20261015_101010.jpg')]);
    assert(await session.importPositioningGml(completionGml([{ name: '20261014_143302.jpg', time: '2026-10-14T15:00:00' }, { name: '20261015_101010.jpg' }])));
    const placement = { kind: 'gml', exifFallback: false };
    const { preview, result } = commit(session, { complete: true }, placement, null, gmlCaptureTime);
    assert.deepEqual(preview.captureSuggestions.complete.map((item) => item.filename), ['20261015_101010.jpg']);
    assert.deepEqual(preview.gmlCaptureTimes.fill.map((row) => row.filename), ['20261014_143302.jpg'], 'the two candidate sets are disjoint');
    assert(result.ok);
    const photos = byName(session, result.layer.id);
    // M3: the GML time is used only on its own explicit choice; a declined one stays evidence and is never padded by the filename.
    assert.equal(photos['20261014_143302.jpg'].captureMetadata.captureTime?.provenance.kind ?? null, gmlCaptureTime ? 'gml' : null);
    assert(photos['20261014_143302.jpg'].metadataEvidence.some((item) => item.kind === 'gml' && item.field === 'captureTime'));
    assert.equal(photos['20261015_101010.jpg'].captureMetadata.captureTime.provenance.kind, 'filename');
    session.clear();
  }
});

test('later GML evidence does not replace an approved filename value automatically', async () => {
  const session = await draft([jpeg('20261014.jpg')]);
  const { result } = commit(session, { dateOnly: true });
  assert(await session.stageLayerSource(result.layer.id, completionGml([{ name: '20261014.jpg', time: '2026-10-14T15:00:00' }])));
  assert(session.applyLayerSource(result.layer.id));
  const [photo] = session.getLayerPhotos(result.layer.id);
  assert(photo.metadataEvidence.some((item) => item.kind === 'gml'));
  assert.equal(photo.captureMetadata.captureTime.provenance.kind, 'filename');
  assert.equal(photo.captureMetadata.captureTime.value.iso, '2026-10-14');
  session.clear();
});

test('pending EXIF hides suggestions and refuses a commit with a choice on', async () => {
  const session = evidenceSession();
  session.beginImport(); session.importFiles([jpeg('20261014_143302.jpg'), jpeg('IMG_1.jpg')]);
  const placement = { kind: 'none' }, preview = session.previewImport({ placement });
  assert.equal(preview.captureSuggestions.pending, 1);
  assert.equal(preview.captureSuggestions.complete.length, 0);
  assert.deepEqual(session.completeImport({ placement, preview, captureSuggestions: { complete: true } }), { ok: false, error: 'pending-exif' });
  assert.equal(session.getSnapshot().photoLayers.length, 0);
  assert(session.getSnapshot().photos.every((photo) => photo.captureMetadata.captureTime === null));
  // Without a choice the existing behaviour is unchanged: no placement, no wait.
  assert(session.completeImport({ placement, preview, captureSuggestions: { complete: false, dateOnly: false } }).ok);
  session.clear();
});

test('stale reviews fail closed: EXIF changes and a re-planned set that differs', async () => {
  let today = '2026-11-17';
  const session = evidenceSession({ today: () => today });
  session.beginImport(); session.importFiles([jpeg('20261014_143302.jpg')]);
  const placement = { kind: 'none' };
  const early = session.previewImport({ placement });
  await settleDraft(session);
  assert.deepEqual(session.completeImport({ placement, preview: early, captureSuggestions: { complete: true } }), { ok: false, error: 'review-changed' });
  session.importFiles([jpeg('20261120.jpg')]);
  await settleDraft(session);
  const preview = session.previewImport({ placement });
  assert.equal(preview.captureSuggestions.dateOnly.length, 0, 'future date not offered');
  today = '2026-11-20';
  assert.deepEqual(session.completeImport({ placement, preview, captureSuggestions: { complete: true } }), { ok: false, error: 'review-changed' });
  assert(session.getSnapshot().photos.every((photo) => photo.captureMetadata.captureTime === null));
  assert.equal(session.getSnapshot().photoLayers.length, 0);
  session.clear();
});

test('cancel leaves no layer and no accepted filename metadata', async () => {
  const session = await draft([jpeg('20261014_143302.jpg')]);
  session.previewImport({ placement: { kind: 'none' } });
  session.cancelImport();
  assert.equal(session.getSnapshot().photos.length, 0);
  assert.equal(session.getSnapshot().photoLayers.length, 0);
  session.beginImport(); session.importFiles([jpeg('20261014_143302.jpg')]); await settleDraft(session);
  assert.equal(session.getSnapshot().photos[0].captureMetadata.captureTime, null);
  session.clear();
});

test('append writes only the new photos and never touches the target layer', async () => {
  const session = await draft([jpeg('20261014.jpg'), jpeg('20261012_121212.jpg')]);
  const first = commit(session, null).result;
  const existing = byName(session, first.layer.id);
  session.beginImport(first.layer.id);
  session.importFiles([jpeg('20261015.jpg'), jpeg('20261014.jpg')]);
  await settleDraft(session);
  const { preview, result } = commit(session, { complete: true, dateOnly: true });
  assert.deepEqual(preview.captureSuggestions.dateOnly.map((item) => item.filename), ['20261015.jpg'], 'skipped duplicates are not offered');
  assert(result.ok && result.append);
  const after = byName(session, first.layer.id);
  assert.equal(after['20261015.jpg'].captureMetadata.captureTime.provenance.kind, 'filename');
  for (const name of ['20261014.jpg', '20261012_121212.jpg']) assert.strictEqual(after[name].captureMetadata, existing[name].captureMetadata, name);
  session.clear();
});

test('repeated GMI occurrences share one filename write per asset', async () => {
  const session = await draft([jpeg('20261014_143302.jpg')]);
  await session.setDraftGmiSource({ file: gmiFile([{ hyperlink: 'h:1(link:"20261014_143302.jpg") ' }, { hyperlink: 'h:1(link:"20261014_143302.jpg") ' }]) });
  const loadedReview = session.reviewLoadedGmiImport();
  const { preview, result } = commit(session, { complete: true }, { kind: 'gmi', exifFallback: false }, loadedReview);
  assert.equal(preview.captureSuggestions.complete.length, 1);
  assert(result.ok);
  const photos = session.getLayerPhotos(result.layer.id);
  assert.equal(photos.length, 2);
  assert.equal(new Set(photos.map((photo) => photo.assetId)).size, 1);
  for (const photo of photos) assert.equal(photo.captureMetadata.captureTime.provenance.kind, 'filename');
  assert.strictEqual(photos[0].captureMetadata, photos[1].captureMetadata);
  session.clear();
});

test('presentation names the filename source and keeps the precision notes', () => {
  assert.equal(photoSourceLabel('filename'), 'Filnavn');
  assert.equal(photoMetadataSourceLabel('captureTime', { kind: 'filename', raw: '20261014.jpg' }), 'Filnavn');
  assert.deepEqual(formatPhotoCaptureTime({ iso: '2026-10-14', precision: 'date' }), { text: '14.10.2026', notes: ['bare dato'] });
  assert.deepEqual(formatPhotoCaptureTime({ iso: '2026-10-14T14:33', precision: 'minute' }), { text: '14.10.2026 14:33', notes: ['uten sekunder', 'tidssone ukjent'] });
});

test('no publication shows the new layer before its approved filename values', async () => {
  const session = await draft([jpeg('20261014_143302.jpg'), jpeg('20261015.jpg')]);
  const seen = [];
  const stop = session.subscribe(() => {
    const layer = session.getSnapshot().photoLayers[0];
    if (layer) seen.push(session.getLayerPhotos(layer.id).map((photo) => photo.captureMetadata.captureTime?.provenance.kind ?? null));
  });
  const { result } = commit(session, { complete: true, dateOnly: true });
  stop();
  assert(result.ok); assert(seen.length > 0);
  for (const kinds of seen) assert.deepEqual(kinds, ['filename', 'filename']);
  session.clear();
});
