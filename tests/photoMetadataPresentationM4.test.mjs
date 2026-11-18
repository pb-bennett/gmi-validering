import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync } from 'fflate';
import { completionGml, completionLayer, completionView, jpeg } from './helpers/photoCompletionFixtures.mjs';
import { evidenceSession, placeAll, tick } from './helpers/photoEvidenceFixtures.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { syntheticContext } from './helpers/photoExportFixtures.mjs';
import { completionSummary } from '../src/lib/photos/photoCompletion.mjs';
import { buildPhotoExportPlan, capturePhotoExportSnapshot } from '../src/lib/photos/export/photoExportPlan.mjs';
import { buildPhotoExportPackage } from '../src/lib/photos/export/photoExportPackage.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { photoExportReadiness } from '../src/lib/photos/export/photoExportReadiness.mjs';

const configuration = { profile: 'gemini-legacy2019', crs: 'EPSG:25832', now: Date.UTC(2026, 10, 18) };
const advisory = (items) => items.find((item) => item.code === 'capture-time-filename');

async function filenameLayer(names) {
  const session = evidenceSession({ today: () => '2026-11-18' });
  session.beginImport();
  session.importFiles(names.map((name) => jpeg(name)));
  for (let turn = 0; turn < 200000 && session.getSnapshot().photos.some((photo) => photo.spatial.exifRead.state === 'pending'); turn++) await tick();
  const placement = { kind: 'none' }, preview = session.previewImport({ placement });
  const result = session.completeImport({ placement, preview, captureSuggestions: { complete: true, dateOnly: true } });
  assert(result.ok);
  const ids = session.getLayer(result.layer.id).photoIds;
  placeAll(session, result.layer.id, ids, 0);
  return { session, layerId: result.layer.id, ids };
}

test('M4: filename provenance is separate in completion/readiness, and partial precision stays visible', async () => {
  const { session, layerId } = await filenameLayer(['20261014_143302.jpg', '20261015_1433.jpg', '20261016.jpg']);
  try {
    const { model, readiness } = completionView(session, layerId);
    assert.deepEqual(completionSummary(model.captureTime, []), [{ key: 'filename', label: 'Filnavn', count: 3 }]);
    assert(readiness.tasks.captureTime.items.every((item) => item.origin === 'filename'));
    assert(model.captureTime.rows.every((item) => item.origin === 'filename' && item.acceptedText.endsWith('Filnavn')));
    assert.match(model.captureTime.rows[1].acceptedText, /uten sekunder/);
    assert.match(model.captureTime.rows[2].acceptedText, /bare dato/);
    assert.equal(model.captureTime.rows[1].note, null, 'precision is already stated in the accepted value');
    const warning = advisory(readiness.recommendations);
    assert.equal(warning.count, 3);
    assert.equal(warning.completeAssetIds.length, 1);
    assert.equal(warning.incompleteAssetIds.length, 2);
    assert.doesNotMatch(warning.message, /mangler|sekunder|utelates/, 'existing precision/schema diagnostics own these facts');
    const photos = session.getLayerPhotos(layerId);
    const selected = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), configuration, { occurrenceIds: [photos[1].id] });
    assert.deepEqual(advisory(selected.warnings).assetIds, [photos[1].assetId]);
    assert.equal(advisory(selected.warnings).count, 1);
    assert.deepEqual(advisory(selected.warnings).completeAssetIds, []);
  } finally { session.clear(); }
});

test('M4: declined complete/date/minute GML evidence is unaccepted, not removed; accepted EXIF/GML stay settled', async () => {
  const names = ['full.jpg', 'date.jpg', 'minute.jpg', 'exif.jpg'];
  const gml = names.map((name, index) => ({ name, time: ['2026-05-12T14:33:02', '2026-05-12', '2026-05-12T14:33', '2026-05-12T15:00:00'][index] }));
  const { session, layerId, ids } = await completionLayer(names.map((name) => jpeg(name, name === 'exif.jpg' ? { captureTime: '2026:05:12 14:33:02' } : {})), { gml });
  try {
    let { model, readiness } = completionView(session, layerId);
    assert.equal(model.captureTime.groups.find((group) => group.state === 'adoptable').label, 'Opptakstid i kilde');
    for (const row of model.captureTime.rows.slice(0, 3)) {
      assert.equal(row.accepted, null);
      assert.equal(row.note, 'GML-verdien er ikke godtatt.');
      assert.equal(row.cleared, false);
    }
    assert.equal(readiness.notes.find((item) => item.code === 'capture-time-in-source').count, 3);
    const exif = model.captureTime.rows[3];
    assert.match(exif.acceptedText, /EXIF DateTimeOriginal/);
    assert.equal(exif.note, 'Kildene oppgir ulike tider.');
    assert.doesNotMatch(JSON.stringify(readiness), /prioriterte/);
    const source = session.getPhoto(ids[0]).metadataEvidence.find((item) => item.kind === 'gml' && item.field === 'captureTime');
    assert(session.setCaptureMetadata(layerId, [ids[0]], 'captureTime', null, { evidenceId: source.id }).ok);
    ({ model, readiness } = completionView(session, layerId));
    assert.match(model.captureTime.rows[0].acceptedText, /GML/);
    assert.equal(model.captureTime.rows[0].note, null);
    assert.equal(readiness.notes.find((item) => item.code === 'capture-time-in-source').count, 2);
    assert(session.setCaptureMetadata(layerId, [ids[0]], 'captureTime', null).ok);
    assert.equal(completionView(session, layerId).model.captureTime.rows[0].cleared, true);
    for (const id of ids.slice(0, 3)) {
      const evidence = session.getPhoto(id).metadataEvidence.find((item) => item.kind === 'gml' && item.field === 'captureTime');
      assert(session.setCaptureMetadata(layerId, [id], 'captureTime', null, { evidenceId: evidence.id }).ok);
      const row = completionView(session, layerId).model.captureTime.rows.find((item) => item.photoId === id);
      assert.equal(row.note, null, 'explicit GML date/minute/complete values are accepted, regardless of export precision');
      assert.equal(row.accepted.value.iso, evidence.value.iso);
    }
    assert.equal(completionView(session, layerId).readiness.notes.find((item) => item.code === 'capture-time-in-source'), undefined);
  } finally { session.clear(); }
});

test('M4: unique delivered assets only; advisory leaves serialized time and original JPEG bytes identical', async () => {
  const name = '20261014_143302.jpg';
  const { session, layerId } = await filenameLayer([name]);
  try {
    await session.stageLayerSource(layerId, gmiFile([{ hyperlink: `h:1(link:"${name}") ` }, { hyperlink: `h:1(link:"${name}") ` }]), 'gmi');
    const review = session.getSnapshot().sourceReviews[layerId];
    assert(session.applyGmiAssociations(layerId, { confirmed: true, sourceId: review.source.id, memberIds: review.memberIds, associationLedger: review.associationLedger }).ok);
    const ids = session.getLayer(layerId).photoIds;
    placeAll(session, layerId, ids, 0);
    const snapshot = capturePhotoExportSnapshot(session, layerId);
    const plan = await buildPhotoExportPlan(snapshot, { ...configuration, profile: 'legacy2019' });
    assert.equal(plan.occurrences.length, 2);
    assert.equal(advisory(plan.warnings).count, 1);
    assert.equal(advisory(completionView(session, layerId).readiness.recommendations).count, 1);
    const manualSnapshot = { ...snapshot, assets: snapshot.assets.map((asset) => ({ ...asset,
      metadata: { ...asset.metadata, captureTime: { ...asset.metadata.captureTime, provenance: { kind: 'manual' } } } })) };
    const manualPlan = await buildPhotoExportPlan(manualSnapshot, { ...configuration, profile: 'legacy2019' });
    assert.equal(serializePhotoExport(plan), serializePhotoExport(manualPlan), 'provenance never enters XML');
    assert.equal(advisory(manualPlan.warnings), undefined);
    assert.equal((serializePhotoExport(plan).match(/2026-10-14T14:33:02/g) || []).length, 2);
    const zip = unzipSync(new Uint8Array(await (await buildPhotoExportPackage(plan)).arrayBuffer()));
    assert.deepEqual(zip[plan.attachments[0].path], new Uint8Array(await snapshot.assets[0].file.arrayBuffer()));
    const excludedPlan = await buildPhotoExportPlan(snapshot, configuration, { occurrenceIds: [] });
    assert.equal(advisory(excludedPlan.warnings), undefined);
    const unplaced = session.getLayerPhotos(layerId).map((photo) => ({ ...photo, spatial: { ...photo.spatial, current: null } }));
    assert.equal(advisory(photoExportReadiness(unplaced, configuration).recommendations), undefined);
  } finally { session.clear(); }
});

for (const filename of ['20261015_1433.jpg', '20261016.jpg']) test(`M4: ${filename} retains precision blockers and Gemini omission`, async () => {
  const { session, layerId } = await filenameLayer([filename]);
  try {
    const snapshot = capturePhotoExportSnapshot(session, layerId);
    const before = session.getLayerPhotos(layerId)[0].captureMetadata.captureTime;
    for (const profile of ['gemini-legacy2019', 'legacy2019', 'asbuilt52']) {
      const plan = await buildPhotoExportPlan(snapshot, { ...configuration, profile, context: syntheticContext });
      assert.equal(advisory(plan.warnings).incompleteAssetIds.length, 1);
      assert.equal(plan.errors.some((item) => item.code === 'capture-time-precision'), profile !== 'gemini-legacy2019');
      if (profile === 'gemini-legacy2019') {
        assert.equal(plan.errors.length, 0);
        assert.doesNotMatch(serializePhotoExport(plan), /<app:fotograferingstidspunkt>/);
        assert.equal(plan.counts.missingTimestampCount, 1);
      }
    }
    assert.strictEqual(session.getLayerPhotos(layerId)[0].captureMetadata.captureTime, before);
  } finally { session.clear(); }
});
