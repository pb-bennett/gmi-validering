import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'exifr/dist/full.esm.mjs';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { readExifGps } from '../src/lib/photos/exifGps.mjs';
import { exifDirectionEvidence } from '../src/lib/photos/photoDirection.mjs';
import { exifCaptureEvidence } from '../src/lib/photos/photoCaptureMetadata.mjs';
import { planEvidenceAdoption } from '../src/lib/photos/photoEvidenceAdoption.mjs';
import { groupPhotoExportDiagnostics } from '../src/lib/photos/export/photoExportDiagnostics.mjs';
import { capturePhotoExportSnapshot, buildPhotoExportPlan, assertExportablePlan } from '../src/lib/photos/export/photoExportPlan.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { gpsJpeg, gpsPng } from './helpers/photoGpsFixtures.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { syntheticContext } from './helpers/photoExportFixtures.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const time = '2026:05:12 14:33:02';
const image = (name = 'a.png', options = {}) => new File([gpsPng({ noLocation: true, captureTime: time, artist: 'Synthetic Artist', direction: 0, directionRef: 'T', ...options })], name, { type: 'image/png' });
function setup(options = {}) {
  let id = 0;
  return createPhotoSession({ createId: () => `bulk-${++id}`, yieldJob: tick,
    extractGps: (file) => readExifGps(file, { parse: (blob, config) => blob.arrayBuffer().then((buffer) => parse(buffer, config)) }),
    createThumbnail: async () => ({ thumbnailBlob: new Blob(['preview']), dimensions: { width: 1, height: 1 } }),
    urls: { createObjectURL: () => `blob:${++id}`, revokeObjectURL() {} }, ...options });
}
async function settle(s, layerId) {
  for (let n = 0; n < 200; n++) {
    if (s.getLayerPhotos(layerId).every((photo) => photo.spatial.exifRead.state !== 'pending')) return;
    await tick();
  }
  assert.fail('EXIF did not finish');
}
async function repeated(s) {
  const ids = s.importFiles([image(), image('b.png')]).acceptedIds, layer = s.createLayer();
  await s.stageLayerSource(layer.id, gmiFile([{ hyperlink: 'h:1(link:"a.png") ' }, { hyperlink: 'h:1(link:"a.png") ' }]), 'gmi');
  const review = s.getSnapshot().sourceReviews[layer.id];
  assert(s.applyGmiAssociations(layer.id, { confirmed: true, sourceId: review.source.id, memberIds: review.memberIds, associationLedger: review.associationLedger }).ok);
  await settle(s, layer.id);
  return { layerId: layer.id, ids, photos: s.getLayerPhotos(layer.id) };
}

for (const container of [gpsJpeg, gpsPng]) {
  for (const [label, options, status, value] of [
    ['north', { direction: 0, directionRef: 'T' }, 'usable', 0],
    ['fraction near bound', { direction: 359.875, directionRef: 'T' }, 'usable', 359.875],
    ['full turn', { direction: 360, directionRef: 'T' }, 'usable', 0],
    ['magnetic', { direction: 42, directionRef: 'M' }, 'unsupported-reference', null],
    ['missing reference', { direction: 42 }, 'unsupported-reference', null],
    ['unknown reference', { direction: 42, directionRef: 'X' }, 'unsupported-reference', null],
    ['nonfinite rational', { direction: 0, directionRef: 'T', denominator: 0 }, 'invalid', null],
    ['out of range', { direction: 361, directionRef: 'T' }, 'invalid', null],
  ]) test(`installed exifr ${container.name}: ${label}, no GPS location required`, async () => {
    const file = new File([container({ noLocation: true, captureTime: time, subsecond: '012', offsetTime: '+02:00', artist: ' Artist ', ...options })], 'synthetic');
    const result = await readExifGps(file, { parse: (blob, config) => blob.arrayBuffer().then((bytes) => parse(bytes, config)) });
    assert.equal(result.state, 'no-gps');
    assert.equal(result.directionEvidence[0].status, status);
    assert.equal(result.directionEvidence[0].value, value);
    assert.equal(result.metadataEvidence[0].value.iso, '2026-05-12T14:33:02.012+02:00');
    assert.equal(result.metadataEvidence[1].value, 'Artist');
  });
  for (const options of [{}, { subsecond: '007' }, { offsetTime: '-03:00' }]) test(`installed exifr ${container.name}: capture-only ${JSON.stringify(options)}`, async () => {
    const result = await readExifGps(new File([container({ noLocation: true, captureTime: time, ...options })], 'synthetic'),
      { parse: (blob, config) => blob.arrayBuffer().then((bytes) => parse(bytes, config)) });
    assert.equal(result.state, 'no-gps'); assert.equal(result.directionEvidence.length, 0);
    assert.equal(result.metadataEvidence.length, 1); assert(result.metadataEvidence[0].value);
  });
  test(`installed exifr ${container.name}: Artist alone without time, direction or GPS`, async () => {
    const result = await readExifGps(new File([container({ noLocation: true, artist: 'Synthetic Artist' })], 'synthetic'),
      { parse: (blob, config) => blob.arrayBuffer().then((bytes) => parse(bytes, config)) });
    assert.equal(result.state, 'no-gps'); assert.deepEqual(result.directionEvidence, []);
    assert.equal(result.metadataEvidence.length, 1); assert.equal(result.metadataEvidence[0].field, 'photographer');
  });
}

test('malformed direction and unrelated orientation never become usable direction', () => {
  for (const direction of [-1, Infinity, NaN, '90', null]) assert.equal(exifDirectionEvidence({ GPSImgDirection: direction, GPSImgDirectionRef: 'T' })[0].status, 'invalid');
  assert.deepEqual(exifDirectionEvidence({ Orientation: 6, GPSDestBearing: 90, GPSTrack: 42 }), []);
});

test('photographer: one value for the asset, on every occurrence; manual and removed values stay, and adoption is only for after a removal', async () => {
  const s = setup();
  try {
    const { layerId, photos } = await repeated(s), [first, second] = photos.filter((photo) => photo.originalFilename === 'a.png').map((photo) => photo.id);
    const accepted = s.getPhoto(first).captureMetadata.photographer;
    assert.equal(accepted.provenance.kind, 'exif'); assert.equal(accepted.provenance.tag, 'Artist'); assert.equal(accepted.acceptance, 'auto');
    assert.strictEqual(s.getPhoto(second).captureMetadata.photographer, accepted);
    assert.equal(s.adoptSourceEvidence(layerId, 'photographer').counts.adopted, 0);
    s.setCaptureMetadata(layerId, [first], 'photographer', 'Manual');
    const manual = s.getPhoto(first).captureMetadata.photographer;
    s.setLayerVisibility(layerId, false); s.setLayerVisibility(layerId, true);
    assert.strictEqual(s.getPhoto(first).captureMetadata.photographer, manual);
    s.setCaptureMetadata(layerId, [first], 'photographer', null);
    s.setLayerVisibility(layerId, false); s.setLayerVisibility(layerId, true);
    assert.equal(s.getPhoto(first).captureMetadata.photographer, null, 'a removal is not undone');
    assert.equal(s.adoptSourceEvidence(layerId, 'photographer', 'exif', [first]).counts.adopted, 1, 'the source value can still be chosen on purpose');
    assert.equal(s.getPhoto(first).captureMetadata.photographer.value, 'Synthetic Artist');
  } finally { s.clear(); }
});

test('missing, invalid and insufficient times stay unknown; where sources differ GML is used and EXIF kept', async () => {
  const s = setup({ parseGml: async () => ({ entries: [{ id: 'date', raw: { fotolink: 'a.png', photographedAtText: '2025-01-01T01:02:03' }, status: 'invalid', position: null }] }) });
  try {
    const ids = s.importFiles([image(), image('missing.png', { captureTime: undefined, artist: undefined }), image('invalid.png', { captureTime: 'uncertain', artist: ' ' }), image('date.png', { captureTime: '2026-05-12' })]).acceptedIds;
    const layer = s.createLayer(); await settle(s, layer.id);
    await s.stageLayerSource(layer.id, new File(['source'], 'dates.gml')); s.applyLayerSource(layer.id);
    const accepted = s.getPhoto(ids[0]).captureMetadata.captureTime;
    assert.equal(accepted.value.iso, '2025-01-01T01:02:03'); assert.equal(accepted.provenance.kind, 'gml');
    assert.equal(s.getPhoto(ids[0]).metadataEvidence.filter((item) => item.field === 'captureTime').length, 2);
    for (const id of ids.slice(1)) assert.equal(s.getPhoto(id).captureMetadata.captureTime, null);
    const counts = s.adoptSourceEvidence(layer.id, 'captureTime').counts;
    assert.equal(counts.alreadyAccepted, 1); assert.equal(counts.missing, 1); assert.equal(counts.unusable, 1); assert.equal(counts.insufficientPrecision, 1);
    const photographer = s.adoptSourceEvidence(layer.id, 'photographer').counts;
    assert.equal(photographer.adopted, 0); assert.equal(photographer.alreadyAccepted, 2); assert.equal(photographer.missing, 2); assert.equal(photographer.unusable, 0);
  } finally { s.clear(); }
});

test('GML-only and agreeing EXIF/GML times preserve every agreeing provenance', async () => {
  const s = setup({ parseGml: async () => ({ entries: ['a.png', 'b.png'].map((name) => ({ id: name, raw: { fotolink: name, photographedAtText: '2026-05-12T14:33:02' }, status: 'invalid', position: null })) }) });
  try {
    const ids = s.importFiles([image(), image('b.png', { captureTime: undefined })]).acceptedIds;
    const layer = s.createLayer(); await settle(s, layer.id);
    await s.stageLayerSource(layer.id, new File(['dates'], 'dates.gml')); s.applyLayerSource(layer.id);
    assert.equal(s.getPhoto(ids[0]).captureMetadata.captureTime.provenance.evidence.length, 2);
    const provenance = s.getPhoto(ids[1]).captureMetadata.captureTime.provenance;
    assert.equal(provenance.kind, 'gml'); assert.equal(provenance.sourceFilename, 'dates.gml'); assert(provenance.sourceEntryId);
  } finally { s.clear(); }
});

test('direction per occurrence: automatic on every placement, manual preserved, source lifecycle and reset', async () => {
  const s = setup();
  try {
    const { layerId, photos } = await repeated(s), ids = photos.map((photo) => photo.id);
    for (const photo of photos) {
      const accepted = photo.direction.current;
      assert.equal(accepted.degrees, 0); assert.equal(accepted.basis.kind, 'exif'); assert.equal(accepted.acceptance, 'auto');
      assert.equal(accepted.basis.raw.GPSImgDirectionRef, 'T');
    }
    s.applyPhotoEdits(s.beginPhotoEdits(layerId), [{ photoId: ids[0], degrees: 90 }]);
    const manual = s.getPhoto(ids[0]).direction.current;
    const source = s.getLayer(layerId).spatialSources.find((item) => item.kind === 'gmi');
    s.removeGmiSource(layerId, source.id, { confirmed: true });
    assert.strictEqual(s.getPhoto(ids[0]).direction.current, manual);
    assert.equal(s.getPhoto(ids[1]).direction.current.basis.kind, 'exif');
    s.removeLayerPhotos(layerId, [ids[1]], { confirmed: true });
    assert.equal(s.adoptSourceEvidence(layerId, 'direction', 'exif', [ids[1]]).counts.stale, 1);
    s.clear(); assert.equal(s.getPhoto(ids[0]), null);
    const fresh = s.importFiles([image()]).acceptedIds[0]; s.createLayer();
    assert.equal(s.getPhoto(fresh).direction.current, null, 'nothing is assigned before the EXIF read has finished');
  } finally { s.clear(); }
});

test('direction skip counts use assets for missing evidence and occurrences for unsupported, invalid and conflicting', () => {
  const photos = [
    { id: 'a1', assetId: 'a', directionEvidence: [] }, { id: 'a2', assetId: 'a', directionEvidence: [] },
    { id: 'b', assetId: 'b', directionEvidence: exifDirectionEvidence({ GPSImgDirection: 10, GPSImgDirectionRef: 'M' }) },
    { id: 'c', assetId: 'c', directionEvidence: exifDirectionEvidence({ GPSImgDirection: NaN }) },
    { id: 'd', assetId: 'd', directionEvidence: [...exifDirectionEvidence({ GPSImgDirection: 10, GPSImgDirectionRef: 'T' }), { id: 'future', kind: 'future', field: 'direction', value: 20 }] },
  ].map((photo) => ({ ...photo, direction: { current: null } }));
  const { counts } = planEvidenceAdoption(photos, 'direction');
  assert.equal(counts.missing, 2); assert.equal(counts.missingAssets, 1); assert.equal(counts.unsupportedReference, 1);
  assert.equal(counts.unusable, 1); assert.equal(counts.conflicting, 1); assert.equal(counts.eligible, 0);
});

test('hundreds of diagnostics group without losing detail; a changed value still makes a preview stale', async () => {
  const s = setup();
  try {
    const { layerId, photos } = await repeated(s);
    for (const photo of photos) s.applyPhotoEdits(s.beginPhotoEdits(layerId), [{ photoId: photo.id, position: { crs: 'EPSG:4326', longitude: 10, latitude: 59 } }]);
    const config = { profile: 'legacy2019', crs: 'EPSG:25832' };
    const hundreds = Array.from({ length: 600 }, (_, i) => ({ code: 'direction-required', occurrenceId: `occurrence-${i}`, message: `image-${i}.png` }));
    const grouped = groupPhotoExportDiagnostics(hundreds);
    assert.equal(grouped.length, 1); assert.equal(grouped[0].count, 600); assert.deepEqual(grouped[0].items, hundreds);
    const plan = await buildPhotoExportPlan(capturePhotoExportSnapshot(s, layerId), config);
    assert.deepEqual(plan.errors, []); assertExportablePlan(plan);
    s.setCaptureMetadata(layerId, [photos[0].id], 'captureTime', '2025-01-02T01:02:03');
    assert.equal(plan.isLive(), false); assert.throws(() => assertExportablePlan(plan));
    const ready = await buildPhotoExportPlan(capturePhotoExportSnapshot(s, layerId), config);
    assert.deepEqual(ready.errors, []); assertExportablePlan(ready);
    const modern = await buildPhotoExportPlan(capturePhotoExportSnapshot(s, layerId), { ...config, profile: 'asbuilt52' });
    assert.equal(modern.errors.filter((item) => item.code === 'invalid-context').length, 7);
    assert.throws(() => assertExportablePlan(modern));
  } finally { s.clear(); }
});

test('fractional true-north direction remains exact in both XML profiles', async () => {
  const s = setup();
  try {
    const [id] = s.importFiles([image('a.png', { direction: 359.875 })]).acceptedIds, layer = s.createLayer();
    await settle(s, layer.id);
    s.applyPhotoEdits(s.beginPhotoEdits(layer.id), [{ photoId: id, position: { crs: 'EPSG:4326', longitude: 10, latitude: 59 } }]);
    s.adoptSourceEvidence(layer.id, 'captureTime'); s.adoptSourceEvidence(layer.id, 'direction');
    for (const profile of ['legacy2019', 'asbuilt52']) {
      const plan = await buildPhotoExportPlan(capturePhotoExportSnapshot(s, layer.id), { profile, crs: 'EPSG:25832', context: syntheticContext });
      assert(serializePhotoExport(plan).includes('<app:retningsverdi>359.875</app:retningsverdi>'));
    }
  } finally { s.clear(); }
});

test('photographer conflict and agreeing normalized sources use the same conservative rule', () => {
  const [artist] = exifCaptureEvidence({ Artist: ' Synthetic   Artist ' });
  const photo = { id: 'one', assetId: 'asset', captureMetadata: { photographer: null }, metadataEvidence: [artist,
    { id: 'other', field: 'photographer', kind: 'future', value: 'Other Artist', raw: 'Other Artist' }] };
  assert.equal(planEvidenceAdoption([photo], 'photographer').counts.conflicting, 1);
  photo.metadataEvidence[1].value = 'Synthetic Artist';
  const plan = planEvidenceAdoption([photo], 'photographer');
  assert.equal(plan.counts.eligible, 1); assert.equal(plan.targets[0].agreeingEvidence.length, 2);
});

test('late EXIF completion after reset never resurrects assets or accepted values', async () => {
  let finish;
  const s = setup({ extractGps: () => new Promise((resolve) => { finish = resolve; }) });
  const [id] = s.importFiles([image()]).acceptedIds, layer = s.createLayer();
  while (!finish) await tick();
  s.clear();
  finish({ state: 'no-gps', directionEvidence: exifDirectionEvidence({ GPSImgDirection: 0, GPSImgDirectionRef: 'T' }), metadataEvidence: exifCaptureEvidence({ DateTimeOriginal: time, Artist: 'Late' }) });
  await tick(); await tick();
  assert.equal(s.getPhoto(id), null); assert.equal(s.adoptSourceEvidence(layer.id, 'captureTime', 'exif', [id]).counts.stale, 1);
  assert.equal(s.getSnapshot().photos.length, 0);
});
