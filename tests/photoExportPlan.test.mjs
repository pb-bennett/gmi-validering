import assert from 'node:assert/strict';
import test from 'node:test';
import { exportFixture, syntheticContext } from './helpers/photoExportFixtures.mjs';
import { capturePhotoExportSnapshot, buildPhotoExportPlan, assertExportablePlan, formatExportCoordinate } from '../src/lib/photos/export/photoExportPlan.mjs';
import { planAttachmentNames } from '../src/lib/photos/export/attachmentNames.mjs';

test('one asset/occurrence snapshots accepted values, File, provenance and original checksum without mutation', async () => {
  const f = await exportFixture();
  try {
    const before = f.session.getPhoto(f.ids[0]), plan = await f.plan();
    assert.deepEqual(plan.errors, []); assert.equal(plan.assets.length, 1); assert.equal(plan.occurrences.length, 1);
    assert.strictEqual(plan.assets[0].file, f.session.getAssetFile(before.assetId));
    assert.strictEqual(plan.assets[0].metadata, before.captureMetadata); assert.match(plan.assets[0].checksum, /^[a-f0-9]{64}$/);
    assert.equal(plan.occurrences[0].current.basis.kind, 'manual'); assert(Object.isFrozen(plan));
    assert.strictEqual(f.session.getPhoto(f.ids[0]).spatial.current, before.spatial.current);
  } finally { f.session.clear(); }
});
test('one original/two accepted POINT occurrences: distinct identities, two features, one attachment and retained relationships', async () => {
  const f = await exportFixture({ repeated: true });
  try {
    const plan = await f.plan(); assert.deepEqual(plan.errors, []);
    assert.equal(plan.occurrences.length, 2); assert.equal(plan.assets.length, 1); assert.equal(plan.attachments.length, 1);
    assert.equal(new Set(plan.occurrences.map((row) => row.guid)).size, 2);
    assert.equal(plan.counts.associationCount, 2); assert.equal(plan.counts.sharedAttachments, 1);
    assert(plan.warnings.some((item) => item.code === 'associations-omitted'));
    assert.notDeepEqual(plan.occurrences[0].point, plan.occurrences[1].point);
  } finally { f.session.clear(); }
});
test('accepted GMI position retains exact candidate/source provenance without serializing associations', async () => {
  const f = await exportFixture({ repeated: true });
  try {
    const candidate = f.session.getPhoto(f.ids[0]).spatial.candidates.find((row) => row.kind === 'gmi');
    f.session.acceptCandidates(f.layerId, [{ photoId: f.ids[0], candidateId: candidate.id }]);
    const plan = await f.plan(); const occurrence = plan.occurrences.find((row) => row.occurrenceId === f.ids[0]);
    assert.strictEqual(occurrence.positionProvenance.source, candidate);
    assert.equal(occurrence.positionProvenance.basis.candidateId, candidate.id);
    assert(occurrence.associations.every((link) => link.sourceFingerprint));
  } finally { f.session.clear(); }
});
for (const [label, names] of [['duplicate', ['same.jpg', 'same.jpg']], ['case', ['A.jpg', 'a.JPG']], ['NFC/NFD', ['Grøft é.jpg', 'Grøft e\u0301.jpg']]]) {
  test(`deterministic ${label} collisions preserve separate assets`, async () => {
    const assets = names.map((originalFilename, index) => ({ assetId: `a-${index}`, originalFilename }));
    const first = await planAttachmentNames(assets), reversed = await planAttachmentNames([...assets].reverse());
    assert.equal(new Set(first.map((row) => row.filename.normalize('NFC').toLowerCase())).size, 2);
    assert(first.every((row) => row.renamed && /--[a-f0-9]{12}/.test(row.filename)));
    assert.deepEqual(first, reversed.reverse());
  });
}
test('safe Unicode/space names preserved; unsafe/reserved/long names sanitized and natural suffix collisions resolved', async () => {
  const names = ['Grøft æ image.JPG', '../bad?:%#\\name.png', 'CON.jpg', 'nul', 'x'.repeat(300) + '.png', 'bad\u0000name.jpg', '\ud800.jpg'];
  const rows = await planAttachmentNames(names.map((originalFilename, index) => ({ originalFilename, assetId: String(index) })));
  assert.equal(rows[0].filename, names[0]);
  for (const row of rows) {
    assert(!/[<>:"\\|?*%#]/.test(row.filename)); assert(!row.filename.startsWith('.'));
    assert(new TextEncoder().encode(row.filename).length <= 180); assert.equal(row.path, `Attachments/${row.filename}`);
  }
  const pair = [{ assetId: '1', originalFilename: 'a.jpg' }, { assetId: '2', originalFilename: 'A.jpg' }];
  const [natural] = await planAttachmentNames(pair);
  const collision = await planAttachmentNames([...pair, { assetId: '3', originalFilename: natural.filename }]);
  assert.equal(new Set(collision.map((row) => row.filename.toLowerCase())).size, 3);
});
test('unplaced excluded and reported; all-unplaced plan blocks; placed invalid data never uses evidence fallback', async () => {
  const f = await exportFixture({ unplaced: true });
  try {
    const empty = await f.plan(); assert.equal(empty.counts.excluded, 1); assert.equal(empty.attachments.length, 0);
    assert(empty.errors.some((item) => item.code === 'no-placed-photos'));
    f.session.beginImport(f.layerId); f.session.importFiles([new File(['image'], 'extra.png')]); f.session.appendImport();
    f.session.applyManualPlacement(f.session.beginManualPlacement(f.layerId, f.ids[0]), { crs: 'EPSG:4326', longitude: 10, latitude: 59 });
    const partial = await f.plan(); assert.equal(partial.counts.excluded, 1); assert.equal(partial.counts.features, 1);
    assert.equal(partial.attachments.length, 1);
  } finally { f.session.clear(); }
});
test('deterministic key ordering/IDs across reordered input; explicit profile/CRS only, strict projection and negative zero', async () => {
  const f = await exportFixture({ names: ['a.png', 'b.png'] });
  try {
    const snapshot = capturePhotoExportSnapshot(f.session, f.layerId);
    const config = { profile: 'legacy2019', crs: 'EPSG:25833', context: syntheticContext };
    const first = await buildPhotoExportPlan(snapshot, config);
    const second = await buildPhotoExportPlan({ ...snapshot, assets: [...snapshot.assets].reverse(), occurrences: [...snapshot.occurrences].reverse() }, config);
    assert.deepEqual(first.occurrences, second.occurrences); assert.deepEqual(first.attachments, second.attachments);
    assert.equal((await f.plan({ profile: '' })).errors[0].code, 'invalid-profile');
    assert.equal((await f.plan({ profile: 'toString' })).errors[0].code, 'invalid-profile');
    assert((await f.plan({ crs: 'EPSG:5972' })).errors.some((item) => item.code === 'invalid-crs'));
    assert((await f.plan({}, { transform: () => [NaN, 1] })).errors.some((item) => item.code === 'projection-failed'));
    assert((await f.plan({}, { transform: () => { throw new Error(); } })).errors.some((item) => item.code === 'projection-failed'));
    const bad = { ...snapshot, occurrences: snapshot.occurrences.map((row) => ({ ...row, current: { position: { crs: 'EPSG:4326', longitude: Infinity, latitude: 91 } } })) };
    assert((await buildPhotoExportPlan(bad, config)).errors.some((item) => item.code === 'projection-failed'));
    assert.equal(formatExportCoordinate(-.0001), '0.000');
  } finally { f.session.clear(); }
});
for (const action of ['metadata', 'direction', 'position', 'append', 'remove', 'delete', 'reset']) test(`stale ${action} invalidates snapshot and completed plan`, async () => {
  const f = await exportFixture();
  try {
    const snapshot = capturePhotoExportSnapshot(f.session, f.layerId), plan = await f.plan();
    if (action === 'metadata') f.session.setCaptureMetadata(f.layerId, f.ids, 'photographer', 'Changed');
    if (action === 'direction') f.session.applyDirectionEdit(f.session.beginDirectionEdit(f.layerId, f.ids[0]), 90);
    if (action === 'position') f.session.applyManualPlacement(f.session.beginManualPlacement(f.layerId, f.ids[0]), { crs: 'EPSG:4326', longitude: 11, latitude: 59 });
    if (action === 'append') { f.session.beginImport(f.layerId); f.session.importFiles([new File(['image'], 'new.png')]); f.session.appendImport(); }
    if (action === 'remove') f.session.removeLayerPhotos(f.layerId, f.ids, { confirmed: true });
    if (action === 'delete') f.session.deleteLayer(f.layerId);
    if (action === 'reset') f.session.clear();
    assert.equal(snapshot.isLive(), false); assert.throws(() => assertExportablePlan(plan), /utdatert/);
    assert((await buildPhotoExportPlan(snapshot, { profile: 'legacy2019', crs: 'EPSG:25832' })).errors.some((item) => item.code === 'stale-plan'));
  } finally { f.session.clear(); }
});
test('missing/unreadable originals and invalid accepted direction are precise blocking errors', async () => {
  const f = await exportFixture();
  try {
    const snapshot = capturePhotoExportSnapshot(f.session, f.layerId), config = { profile: 'legacy2019', crs: 'EPSG:25832' };
    const missing = await buildPhotoExportPlan({ ...snapshot, assets: snapshot.assets.map((asset) => ({ ...asset, file: null })) }, config);
    assert(missing.errors.some((item) => item.code === 'missing-file'));
    const unreadable = await buildPhotoExportPlan({ ...snapshot, assets: snapshot.assets.map((asset) => ({ ...asset, file: { size: 1, arrayBuffer: async () => { throw new Error(); } } })) }, config);
    assert(unreadable.errors.some((item) => item.code === 'file-read-failed'));
    const direction = await buildPhotoExportPlan({ ...snapshot, occurrences: snapshot.occurrences.map((row) => ({ ...row, direction: { degrees: NaN } })) }, config);
    assert(direction.errors.some((item) => item.code === 'invalid-direction'));
  } finally { f.session.clear(); }
});
test('reset while preview hashes originals is reported as stale, never a valid late plan', async () => {
  const f = await exportFixture();
  try {
    const snapshot = capturePhotoExportSnapshot(f.session, f.layerId), file = snapshot.assets[0].file;
    const read = file.arrayBuffer.bind(file);
    file.arrayBuffer = async () => { f.session.clear(); return read(); };
    const plan = await buildPhotoExportPlan(snapshot, { profile: 'legacy2019', crs: 'EPSG:25832' });
    assert(plan.errors.some((item) => item.code === 'stale-plan')); assert.throws(() => assertExportablePlan(plan));
  } finally { f.session.clear(); }
});
