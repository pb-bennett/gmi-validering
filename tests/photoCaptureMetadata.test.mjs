import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'exifr/dist/full.esm.mjs';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { normalizeCaptureTime, normalizePhotographer, exifCaptureEvidence } from '../src/lib/photos/photoCaptureMetadata.mjs';
import { readExifGps } from '../src/lib/photos/exifGps.mjs';
import { gpsJpeg, gpsPng } from './helpers/photoGpsFixtures.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const image = (name = 'a.png') => new File([gpsPng()], name, { type: 'image/png' });
function setup(options = {}) {
  let id = 0;
  return createPhotoSession({ createId: () => `metadata-${++id}`, yieldJob: tick,
    extractGps: async () => ({ state: 'no-gps', candidate: null }),
    createThumbnail: async () => ({ thumbnailBlob: new Blob(['preview']), dimensions: { width: 1, height: 1 } }),
    urls: { createObjectURL: () => `blob:${++id}`, revokeObjectURL() {} }, ...options });
}
async function repeated(s) {
  s.importFiles([image()]); const layer = s.createLayer();
  await s.stageLayerSource(layer.id, gmiFile([{ hyperlink: 'h:1(link:"a.png") ' }, { hyperlink: 'h:1(link:"a.png") ' }] ), 'gmi');
  const review = s.getSnapshot().sourceReviews[layer.id];
  assert(s.applyGmiAssociations(layer.id, { confirmed: true, sourceId: review.source.id, memberIds: review.memberIds, associationLedger: review.associationLedger }).ok);
  return s.getLayer(layer.id);
}

test('capture normalization preserves calendar precision and known/unknown timezone; rejects invalid values', () => {
  for (const input of ['2026-02-29', '2026-13-01', '2026-01-00', '2026-01-01T24:00', '2026-01-01T12:00:60', '2026-01-01T12:00+14:01', '2026-01-01T12:00+01:99', '2026/05/12', '', null]) assert.equal(normalizeCaptureTime(input), null, String(input));
  assert.equal(normalizeCaptureTime('2024-02-29').precision, 'date');
  assert.equal(normalizeCaptureTime('2026-05-12 14:33:02').iso, '2026-05-12T14:33:02');
  assert.equal(normalizeCaptureTime('2026-05-12T14:33:02').timezoneKnown, false);
  assert.equal(normalizeCaptureTime('2026-05-12T14:33:02.012+02:00').offset, '+02:00');
  assert.equal(normalizeCaptureTime('2026-05-12T14:33Z').timezoneKnown, true);
  assert.equal(normalizePhotographer('  Kari\n  Nordmann  '), 'Kari Nordmann');
  assert.equal(normalizePhotographer('  '), null);
});

test('unknown defaults, explicit manual replacement/clear and invalid atomic writes', () => {
  const s = setup(); const ids = s.importFiles([image(), image('b.png')]).acceptedIds;
  assert.deepEqual(s.getPhoto(ids[0]).captureMetadata, { captureTime: null, photographer: null });
  assert.equal(s.setCaptureMetadata(null, ids, 'captureTime', 'yesterday').ok, false);
  assert(s.setCaptureMetadata(null, ids, 'captureTime', '2026-05-12T14:33:02').ok);
  assert(s.setCaptureMetadata(null, ids, 'photographer', '  Kari   Nordmann ').ok);
  assert.equal(s.getPhoto(ids[0]).captureMetadata.photographer.value, 'Kari Nordmann');
  assert.equal(s.getPhoto(ids[0]).captureMetadata.captureTime.provenance.kind, 'manual');
  s.setCaptureMetadata(null, ids, 'photographer', 'Anne');
  assert.equal(s.getPhoto(ids[0]).captureMetadata.photographer.value, 'Anne');
  for (const field of ['captureTime', 'photographer']) s.setCaptureMetadata(null, ids, field, null);
  assert.deepEqual(s.getPhoto(ids[0]).captureMetadata, { captureTime: null, photographer: null }); s.clear();
});

for (const container of [gpsJpeg, gpsPng]) test(`actual EXIF ${container.name}: capture originals/artist raw evidence, offset/subseconds, no acceptance`, async () => {
  const bytes = container({ captureTime: '2026:05:12 14:33:02', artist: 'Kari Nordmann', subsecond: '012', offsetTime: '+02:00' });
  const read = (file) => readExifGps(file, { parse: async (f, opts) => parse(new Uint8Array(await f.arrayBuffer()), opts) });
  const file = new File([bytes], container === gpsJpeg ? 'a.jpg' : 'a.png');
  const result = await read(file);
  assert.equal(result.metadataEvidence[0].value.iso, '2026-05-12T14:33:02.012+02:00');
  assert.equal(result.metadataEvidence[1].value, 'Kari Nordmann');
  const s = setup({ extractGps: read }); const [id] = s.importFiles([file]).acceptedIds;
  for (let i = 0; i < 20 && !s.getPhoto(id).metadataEvidence.length; i++) await tick();
  assert.equal(s.getPhoto(id).captureMetadata.captureTime, null);
  assert(s.setCaptureMetadata(null, [id], 'captureTime', null, { evidenceId: 'exif:captureTime' }).ok);
  assert.equal(s.getPhoto(id).captureMetadata.captureTime.provenance.raw.DateTimeOriginal, '2026:05:12 14:33:02');
  assert(s.setCaptureMetadata(null, [id], 'photographer', null, { evidenceId: 'exif:photographer' }).ok);
  assert.equal(s.getPhoto(id).captureMetadata.photographer.provenance.kind, 'exif'); s.clear();
});

test('repeated occurrences share asset metadata; batch deduplicates and safely ignores partial/stale selection', async () => {
  const s = setup(); const layer = await repeated(s), ids = layer.photoIds;
  assert.equal(ids.length, 2);
  let publications = 0; const stop = s.subscribe(() => publications++);
  for (const [field, value] of [['photographer', 'Kari'], ['captureTime', '2026-05-12T14:33:02']]) {
    const result = s.setCaptureMetadata(layer.id, [...ids, ids[0], 'stale'], field, value);
    assert.equal(result.assetIds.length, 1);
    const photos = s.getLayerPhotos(layer.id);
    assert.equal(photos[0].captureMetadata, photos[1].captureMetadata);
    assert.equal(photos[0].captureMetadata[field].value.iso || photos[0].captureMetadata[field].value, value);
  }
  assert.equal(publications, 2); stop();
  const metadata = s.getPhoto(ids[0]).captureMetadata;
  s.removeLayerPhotos(layer.id, [ids[0]], { confirmed: true });
  assert.equal(s.getPhoto(ids[1]).captureMetadata, metadata);
  assert.equal(s.setCaptureMetadata(layer.id, [ids[0], 'stale'], 'photographer', 'Other').assetIds.length, 0);
  s.removeLayerPhotos(layer.id, [ids[1]], { confirmed: true }); assert.equal(s.getPhoto(ids[1]), null);
  s.importFiles([image()]); assert.equal(s.getSnapshot().photos[0].captureMetadata.photographer, null);
  s.clear(); assert.equal(s.getSnapshot().photos.length, 0);
});

test('later GML/EXIF evidence, append, recheck, source removal, position/direction and reset preserve ownership rules', async () => {
  let finish;
  const s = setup({ extractGps: () => new Promise((resolve) => { finish = resolve; }), parseGml: async (file) => ({ entries: [
    { id: file.name === 'dates.gml' ? 'valid' : 'uncertain', raw: { fotolink: 'a.png', photographedAtText: file.name === 'dates.gml' ? '2026-05-12T12:00:00' : '12. mai, kanskje' }, status: 'invalid', position: null },
  ] }) });
  const layer = await repeated(s), ids = layer.photoIds;
  s.setCaptureMetadata(layer.id, [ids[1]], 'captureTime', '2025-01-01');
  s.setCaptureMetadata(layer.id, [ids[1]], 'photographer', 'Accepted');
  const metadata = s.getPhoto(ids[0]).captureMetadata;
  await tick(); finish({ state: 'no-gps', metadataEvidence: [{ id: 'exif:photographer', kind: 'exif', field: 'photographer', value: 'Later', raw: 'Later' }] }); await tick(); await tick();
  await s.stageLayerSource(layer.id, new File(['gml'], 'dates.gml')); s.applyLayerSource(layer.id);
  await s.stageLayerSource(layer.id, new File(['other gml'], 'uncertain.gml')); s.applyLayerSource(layer.id);
  const evidence = s.getPhoto(ids[0]).metadataEvidence;
  assert.equal(evidence.filter((item) => item.kind === 'gml').length, 2);
  assert.equal(evidence.find((item) => item.sourceEntryId === 'uncertain').value, null);
  assert.equal(s.getPhoto(ids[1]).captureMetadata, metadata);
  const gml = evidence.find((item) => item.sourceEntryId === 'valid');
  assert(s.setCaptureMetadata(layer.id, [ids[0]], 'captureTime', null, { evidenceId: gml.id }).ok);
  assert.equal(s.getPhoto(ids[1]).captureMetadata.captureTime.provenance.kind, 'gml');
  const accepted = s.getPhoto(ids[0]).captureMetadata;
  const gmi = s.getLayer(layer.id).spatialSources.find((item) => item.kind === 'gmi');
  s.recheckLayerSource(layer.id, gmi.id); const review = s.getSnapshot().sourceReviews[layer.id];
  s.applyGmiAssociations(layer.id, { confirmed: true, sourceId: gmi.id, memberIds: review.memberIds, associationLedger: review.associationLedger });
  s.beginImport(layer.id); s.importFiles([image('b.png')]); s.appendImport();
  const ticket = s.beginManualPlacement(layer.id, ids[0]);
  assert(s.applyManualPlacement(ticket, { crs: 'EPSG:4326', longitude: 10, latitude: 59 }).ok);
  assert(s.applyDirectionEdit(s.beginDirectionEdit(layer.id, ids[0]), 125).ok);
  s.removeGmiSource(layer.id, gmi.id, { confirmed: true });
  assert.equal(s.getPhoto(ids[1]).captureMetadata, accepted);
  s.clear(); assert.equal(s.getPhoto(ids[0]), null);
});

test('batch applies once to each selected unique asset and leaves unselected photos unchanged', () => {
  const s = setup(), ids = s.importFiles([image(), image('b.png'), image('c.png')]).acceptedIds;
  const layer = s.createLayer();
  for (const [field, input] of [['photographer', 'Shared'], ['captureTime', '2026-05-12']]) {
    const result = s.setCaptureMetadata(layer.id, [ids[0], ids[1], ids[0], 'stale'], field, input);
    assert.equal(result.assetIds.length, 2);
    assert.equal(s.getPhoto(ids[2]).captureMetadata[field], null);
  }
  s.clear();
});

test('EXIF uncertainty is retained raw, local original time stays local, unrelated timestamp/author fields are excluded', () => {
  const evidence = exifCaptureEvidence({ DateTimeOriginal: '2026:05:12 14:33:02', Artist: '  Kari   Nordmann ', DateTime: '2030:01:01 00:00:00', OwnerName: 'Not photographer' });
  assert.equal(evidence[0].value.timezoneKnown, false);
  assert.equal(evidence[0].value.iso, '2026-05-12T14:33:02');
  assert.equal(evidence[1].value, 'Kari Nordmann');
  assert.equal(evidence[1].raw, '  Kari   Nordmann ');
  assert.equal(evidence.length, 2);
  for (const tags of [{ DateTimeOriginal: '2026:02:30 10:00:00' }, { DateTimeOriginal: '2026:05:12 14:33:02', OffsetTimeOriginal: '?' }, { DateTimeOriginal: '2026:05:12 14:33:02', SubSecTimeOriginal: 'abc' }]) {
    const [item] = exifCaptureEvidence(tags);
    assert.equal(item.value, null); assert.deepEqual(item.raw, tags);
  }
  assert.deepEqual(exifCaptureEvidence({ DateTime: '2026:05:12 14:33:02', OwnerName: 'Not photographer' }), []);
});
