import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { buildPhotoMapFeatures } from '../src/lib/photos/photoMapFeatures.mjs';
import { gmiFile, gmiText, realGrammarFamilies, sevenGuid, sharedFilename, sharedGuids } from './helpers/gmiPhotoFixtures.mjs';
import { gmiPointPosition, parseGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { projectCoordinateToWgs84 } from '../src/lib/map/coordinateProjection.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const point = (longitude = 10) => ({ crs: 'EPSG:4326', longitude, latitude: 60 });
const link = (name = 'a.jpg') => `h:1(link:"${name}") `;
const objects = (count, scope = 'point') => Array.from({ length: count }, (_, index) => ({
  hyperlink: link(), scope, label: `K${index}`, xyz: `${581930 + index * 10} 6566000 1`,
}));
async function setup(options = {}, names = ['a.jpg']) {
  let next = 0, reads = 0, thumbnails = 0;
  const created = [], revoked = [];
  const session = createPhotoSession({ createId: () => `id-${++next}`, yieldJob: tick,
    urls: { createObjectURL: () => { const url = `blob:${created.length}`; created.push(url); return url; }, revokeObjectURL: (url) => revoked.push(url) },
    createThumbnail: async () => { thumbnails++; return { dimensions: { width: 3, height: 2 }, thumbnailBlob: new Blob(['thumb']) }; },
    extractGps: async () => { reads++; return { state: 'viable', candidate: { status: 'viable', position: point(), raw: { GPSLatitude: 60 } } }; },
    parseGml: async () => ({ entries: [{ id: 'gml-position', reference: 'a.jpg', status: 'viable', position: point(11) }] }), ...options });
  const files = names.map((name) => new File(['image'], name, { type: 'image/jpeg' }));
  const ids = session.importFiles(files).acceptedIds, layer = session.createLayer();
  for (let count = 0; count < 100 && session.getLayerPhotos(layer.id).some((photo) => photo.preview.state === 'pending' || photo.spatial.exifRead.state === 'pending'); count++) await tick();
  return { session, layer, files, ids, created, revoked, jobs: () => ({ reads, thumbnails }) };
}
async function save(context, file = gmiFile(objects(2)), kind = 'gmi', ticket = context.session.beginSourceWorkflow(context.layer.id)) {
  const { session, layer } = context;
  assert(await session.stageLayerSource(layer.id, file, kind));
  const review = session.getSnapshot().sourceReviews[layer.id];
  assert(session.saveSourceWorkflowSource(ticket, review).ok);
  return ticket;
}
function apply(context, ticket, kind = 'gmi') {
  const { session } = context, plan = session.reviewSourceWorkflowPositions(ticket);
  const requests = plan.rows.flatMap((row) => {
    const candidate = row.options.find((option) => option.kind === kind);
    return candidate ? [{ photoId: row.photoId, candidateId: candidate.id }] : [];
  });
  assert(session.applySourceWorkflowPositions(ticket, plan, requests).ok);
  return plan;
}

for (const count of [1, 2, 3, 7, 20]) test(`${count} distinct point references produce ${count} occurrences, shared asset and distinct marker IDs only after explicit apply`, async () => {
  const context = await setup(), { session, layer, files, created } = context;
  const ticket = await save(context, gmiFile(objects(count)));
  const photos = session.getLayerPhotos(layer.id);
  assert.equal(photos.length, count);
  assert(photos.every((photo) => photo.assetId === context.ids[0] && session.getFile(photo.id) === files[0]));
  assert(photos.every((photo) => photo.spatial.current === null && photo.direction.current === null));
  assert(photos.every((photo) => photo.preview === photos[0].preview));
  assert.equal(created.length, 1);
  assert.deepEqual(context.jobs(), { reads: 1, thumbnails: 1 });
  const plan = session.reviewSourceWorkflowPositions(ticket);
  assert(plan.rows.every((row) => row.options.filter((option) => option.kind === 'gmi').length === 1));
  assert(plan.rows.every((row) => row.options.some((option) => option.kind === 'exif')));
  assert(plan.rows.every((row) => row.defaultChoice === '', 'GMI and EXIF require an explicit choice'));
  assert.equal(session.getLayer(layer.id).placedCount, 0);
  apply(context, ticket);
  const features = buildPhotoMapFeatures([session.getLayer(layer.id)], session.getLayerPhotos);
  assert.equal(features.length, count);
  assert.equal(new Set(features.map((feature) => feature.id)).size, count);
  assert.equal(new Set(session.getLayerPhotos(layer.id).map((photo) => photo.occurrence.objectKey)).size, count);
  assert.equal(session.getLayer(layer.id).assetCount, 1);
  assert.equal(session.getLayer(layer.id).placedCount, count);
  session.clear();
  assert.deepEqual(context.revoked, created);
});

for (const epsg of [25832, 25833, 4326]) test(`GMI EPSG:${epsg} point uses raw source coordinates and agrees with map transformation`, async () => {
  const xyz = epsg === 4326 ? '10 60 1' : '581930 6566000 1';
  const source = await parseGmiPhotoSource(new File([gmiText([{ hyperlink: link(), xyz }]).replace('COSYS_EPSG 25832', `COSYS_EPSG ${epsg}`)], 'point.gmi'));
  const object = Object.values(source.objectsByKey)[0], candidate = gmiPointPosition(source, object);
  assert.equal(candidate.status, 'viable');
  const expected = projectCoordinateToWgs84(source, object.rawGeometry[0].x, object.rawGeometry[0].y);
  assert(Math.abs(candidate.position.longitude - expected[0]) < 1e-10);
  assert(Math.abs(candidate.position.latitude - expected[1]) < 1e-10);
  if (epsg === 25832) {
    assert(Math.abs(candidate.position.longitude - 10.435504110725644) < 1e-9);
    assert(Math.abs(candidate.position.latitude - 59.22510573717133) < 1e-9);
  }
});

for (const declaration of ['', 'COSYS_EPSG 99999', 'COSYS_EPSG invalid']) test(`unusable CRS (${declaration || 'missing'}) retains links and occurrence evidence, without a GMI option`, async () => {
  const context = await setup();
  const file = new File([gmiText(objects(1)).replace('COSYS_EPSG 25832', declaration)], 'unknown.gmi');
  const ticket = await save(context, file), { session, layer, ids } = context;
  assert.equal(session.getGmiPhotoAssociations(layer.id, ids[0]).length, 1);
  const row = session.reviewSourceWorkflowPositions(ticket).rows[0];
  assert(!row.options.some((candidate) => candidate.kind === 'gmi'));
  assert(row.gmiUnavailable);
  assert.equal(session.getPhoto(ids[0]).spatial.current, null);
  session.clear();
});

test('line-only repeats remain associations with no guessed midpoint, vertex or centroid', async () => {
  const context = await setup(), ticket = await save(context, gmiFile(objects(3, 'line')));
  const { session, layer, ids } = context, photo = session.getPhoto(ids[0]);
  assert.equal(session.getLayerPhotos(layer.id).length, 1);
  assert.equal(photo.repeatGroup.referringObjectCount, 3);
  assert.equal(photo.repeatGroup.pointObjectCount, 0);
  assert(photo.repeatGroup.repeated);
  assert.equal(session.getGmiPhotoAssociations(layer.id, ids[0]).length, 3);
  assert(!session.reviewSourceWorkflowPositions(ticket).rows[0].options.some((option) => option.kind === 'gmi'));
  assert.equal(photo.occurrence, null);
  session.clear();
});

test('a point object with missing or multiple source coordinates cannot use a first vertex or centroid', async () => {
  for (const xyz of ['\n', '581930 6566000 1\n581950 6566100 1']) {
    const context = await setup(), ticket = await save(context, gmiFile([{ hyperlink: link(), xyz }]));
    const { session, layer, ids } = context;
    assert.equal(session.getGmiPhotoAssociations(layer.id, ids[0]).length, 1);
    const row = session.reviewSourceWorkflowPositions(ticket).rows[0];
    assert.equal(row.gmiUnavailable, 'invalid-geometry');
    assert(!row.options.some((candidate) => candidate.kind === 'gmi'));
    session.clear();
  }
});

test('point + line retains every edge; identical point coordinates still have separate occurrences and exact raw provenance', async () => {
  const context = await setup();
  await save(context, gmiFile([...objects(2).map((object) => ({ ...object, xyz: '581930 6566000 1' })), ...objects(1, 'line')]));
  const { session, layer } = context, photos = session.getLayerPhotos(layer.id);
  assert.equal(photos.length, 2);
  for (const photo of photos) {
    assert.equal(session.getGmiPhotoAssociations(layer.id, photo.id).length, 3);
    assert.equal(photo.repeatGroup.pointObjectCount, 2);
    assert.equal(photo.repeatGroup.referringObjectCount, 3);
    assert.equal(photo.occurrence.ownerLayerId, layer.id);
    assert.equal(photo.occurrence.references.length, 1);
    assert.equal(photo.occurrence.references[0].rawMember, 'link:"a.jpg"');
    assert.equal(photo.occurrence.object.geometryScope, 'point');
    assert(photo.occurrence.sourceFingerprint.startsWith('sha256:'));
    assert.equal(photo.occurrence.object.sourceIndex, photos.indexOf(photo));
  }
  session.clear();
});

for (const kind of ['exif', 'gml']) test(`shared ${kind} evidence applies independently and never collapses GMI occurrences`, async () => {
  const context = await setup(), ticket = await save(context), { session, layer } = context;
  if (kind === 'gml') await save(context, new File(['positions'], 'positions.gml'), 'gml', ticket);
  const photos = session.getLayerPhotos(layer.id), candidate = photos[0].spatial.candidates.find((item) => item.kind === kind);
  assert.strictEqual(photos[1].spatial.candidates.find((item) => item.kind === kind), candidate);
  apply(context, ticket, kind);
  assert.equal(session.getLayerPhotos(layer.id).length, 2);
  assert.equal(session.getLayer(layer.id).placedCount, 2);
  assert.notEqual(photos[0].occurrence.key, photos[1].occurrence.key);
  session.clear();
});

test('manual movement and direction are per occurrence; existing accepted values default to keep current', async () => {
  const context = await setup(), { session, layer, ids } = context;
  session.applyManualPlacement(session.beginManualPlacement(layer.id, ids[0]), point(12));
  session.applyDirectionEdit(session.beginDirectionEdit(layer.id, ids[0]), 42);
  const before = session.getPhoto(ids[0]), ticket = await save(context), plan = session.reviewSourceWorkflowPositions(ticket);
  assert.equal(plan.rows[0].defaultChoice, '');
  assert.strictEqual(session.getPhoto(ids[0]).spatial.current, before.spatial.current);
  assert.strictEqual(session.getPhoto(ids[0]).direction, before.direction);
  apply(context, ticket);
  const [a, b] = session.getLayerPhotos(layer.id), bCurrent = b.spatial.current;
  session.applyManualPlacement(session.beginManualPlacement(layer.id, a.id), point(13));
  session.applyDirectionEdit(session.beginDirectionEdit(layer.id, b.id), 100);
  assert.strictEqual(session.getPhoto(b.id).spatial.current, bCurrent);
  assert.equal(session.getPhoto(a.id).direction.current.degrees, 42);
  assert.equal(session.getPhoto(b.id).direction.current.degrees, 100);
  session.clear();
});

test('remove original occurrence preserves shared File/preview, asset-scoped links and append duplicate policy; last removal releases once', async () => {
  const context = await setup(), { session, layer, ids, files } = context;
  await save(context);
  const [, b] = session.getLayerPhotos(layer.id);
  session.removeLayerPhotos(layer.id, [ids[0]], { confirmed: true });
  assert.equal(session.getFile(ids[0]), null);
  assert.strictEqual(session.getFile(b.id), files[0]);
  assert.equal(context.revoked.length, 0);
  assert.equal(session.getGmiPhotoAssociations(layer.id, b.id).length, 2);
  session.beginImport(layer.id);
  const duplicate = session.importFiles([new File(['new'], 'a.jpg')]).acceptedIds[0];
  assert.deepEqual(session.getSnapshot().appendStatus.skippedIds, [duplicate]);
  session.cancelImport();
  session.removeLayerPhotos(layer.id, [b.id], { confirmed: true });
  assert.deepEqual(context.revoked, context.created);
  assert.equal(session.getAssetFile(ids[0]), null);
  assert.equal(session.getLayer(layer.id).assetCount, 0);
  session.clear();
});

for (const action of ['batch', 'whole-asset', 'layer', 'reset']) test(`${action} removal releases one shared resource and all occurrence ownership`, async () => {
  const context = await setup(), { session, layer, ids } = context;
  await save(context, gmiFile(objects(7)));
  if (action === 'batch') session.removeLayerPhotos(layer.id, session.getLayer(layer.id).photoIds, { confirmed: true });
  if (action === 'whole-asset') session.removeLayerAssets(layer.id, ids, { confirmed: true });
  if (action === 'layer') session.deleteLayer(layer.id);
  if (action === 'reset') session.clear();
  assert.deepEqual(context.revoked, context.created);
  assert.equal(session.getAssetFile(ids[0]), null);
  session.clear();
  assert.deepEqual(context.revoked, context.created);
});

test('rechecks keep occurrence IDs; removal is not silently undone by recheck', async () => {
  const context = await setup(), ticket = await save(context), { session, layer } = context;
  const source = session.getLayer(layer.id).spatialSources[0], before = session.getLayer(layer.id).photoIds;
  for (let count = 0; count < 3; count++) {
    session.recheckLayerSource(layer.id, source.id);
    assert(session.saveSourceWorkflowSource(ticket, session.getSnapshot().sourceReviews[layer.id]).ok);
    assert.strictEqual(session.getLayer(layer.id).photoIds, before);
  }
  session.removeLayerPhotos(layer.id, [before[0]], { confirmed: true });
  const next = session.beginSourceWorkflow(layer.id);
  session.recheckLayerSource(layer.id, source.id);
  assert(session.saveSourceWorkflowSource(next, session.getSnapshot().sourceReviews[layer.id]).ok);
  assert.deepEqual(session.getLayer(layer.id).photoIds, [before[1]]);
  session.clear();
});

test('same GUID across source revisions remains two distinct source-scoped occurrences', async () => {
  const context = await setup(), ticket = await save(context, gmiFile([{ guid: sevenGuid, hyperlink: link() }]));
  await save(context, gmiFile([{ guid: sevenGuid, hyperlink: link(), xyz: '581940 6566000 1' }]), 'gmi', ticket);
  const photos = context.session.getLayerPhotos(context.layer.id);
  assert.equal(photos.length, 2);
  assert.equal(photos[0].occurrence.object.guid, photos[1].occurrence.object.guid);
  assert.notEqual(photos[0].occurrence.sourceFingerprint, photos[1].occurrence.sourceFingerprint);
  assert.notEqual(photos[0].occurrence.key, photos[1].occurrence.key);
  context.session.clear();
});

test('removing and reattaching exact source bytes reuses occurrences and restores usable GMI options', async () => {
  const context = await setup(), file = gmiFile(objects(2)), ticket = await save(context, file), { session, layer } = context;
  apply(context, ticket);
  const photos = session.getLayerPhotos(layer.id), sourceId = photos[0].occurrence.sourceId;
  assert(session.removeGmiSource(layer.id, sourceId, { confirmed: true }));
  await save(context, file, 'gmi', ticket);
  const current = session.getLayerPhotos(layer.id), plan = session.reviewSourceWorkflowPositions(ticket);
  assert.deepEqual(current.map((photo) => photo.id), photos.map((photo) => photo.id));
  assert(current.every((photo, index) => photo.spatial.current === photos[index].spatial.current));
  assert(plan.rows.every((row) => row.options.filter((option) => option.kind === 'gmi').length === 1));
  assert.notEqual(current[0].occurrence.sourceId, sourceId);
  session.clear();
});

test('stale source checkpoint with repeated references retains neither source nor new occurrences', async () => {
  const context = await setup(), { session, layer, ids } = context, ticket = session.beginSourceWorkflow(layer.id);
  await session.stageLayerSource(layer.id, gmiFile(objects(7)), 'gmi');
  const review = session.getSnapshot().sourceReviews[layer.id];
  session.beginImport(layer.id);
  session.importFiles([new File(['other'], 'b.jpg')]); session.appendImport();
  assert.equal(session.saveSourceWorkflowSource(ticket, review).ok, false);
  assert.equal(session.getLayer(layer.id).photoCount, 2);
  assert.equal(session.getLayer(layer.id).spatialSources.length, 0);
  assert.equal(session.getPhoto(ids[0]).occurrence, null);
  session.clear();
});

for (const invalidate of ['membership', 'current', 'source', 'reset', 'operation']) test(`stale repeated position batch (${invalidate}) rejects all writes`, async () => {
  const context = await setup(), ticket = await save(context), { session, layer } = context;
  const plan = session.reviewSourceWorkflowPositions(ticket), photos = session.getLayerPhotos(layer.id);
  const requests = plan.rows.map((row) => ({ photoId: row.photoId, candidateId: row.options.find((item) => item.kind === 'gmi').id }));
  if (invalidate === 'membership') session.removeLayerPhotos(layer.id, [photos[1].id], { confirmed: true });
  if (invalidate === 'current') session.applyManualPlacement(session.beginManualPlacement(layer.id, photos[1].id), point(14));
  if (invalidate === 'source') session.removeGmiSource(layer.id, photos[0].occurrence.sourceId, { confirmed: true });
  if (invalidate === 'reset') session.clear();
  if (invalidate === 'operation') session.beginSourceWorkflow(layer.id);
  const before = photos.map((photo) => session.getPhoto(photo.id)?.spatial.current);
  assert.equal(session.applySourceWorkflowPositions(ticket, plan, requests).ok, false);
  assert.deepEqual(photos.map((photo) => session.getPhoto(photo.id)?.spatial.current), before);
  session.clear();
});

test('pre-checkpoint cancel retains no source/occurrence; post-checkpoint cancel retains evidence only', async () => {
  const context = await setup(), { session, layer } = context;
  let ticket = session.beginSourceWorkflow(layer.id);
  await session.stageLayerSource(layer.id, gmiFile(objects(2)), 'gmi');
  session.endSourceWorkflow(ticket);
  assert.equal(session.getLayer(layer.id).photoCount, 1);
  assert.equal(session.getLayer(layer.id).spatialSources.length, 0);
  ticket = await save(context);
  session.endSourceWorkflow(ticket);
  assert.equal(session.getLayer(layer.id).photoCount, 2);
  assert(session.getLayerPhotos(layer.id).every((photo) => photo.spatial.current === null));
  session.clear();
});

test('late metadata/preview survives removal of first occurrence, shares evidence and preserves independent accepted state', async () => {
  let finishGps, finishPreview;
  const context = await setup({
    extractGps: () => new Promise((resolve) => { finishGps = resolve; }),
    createThumbnail: () => new Promise((resolve) => { finishPreview = resolve; }),
  });
  const { session, layer, ids } = context;
  const ticket = await save(context);
  apply(context, ticket);
  const [, survivor] = session.getLayerPhotos(layer.id);
  session.applyDirectionEdit(session.beginDirectionEdit(layer.id, survivor.id), 75);
  session.removeLayerPhotos(layer.id, ids, { confirmed: true });
  const current = session.getPhoto(survivor.id).spatial.current;
  finishGps({ state: 'viable', candidate: { status: 'viable', position: point() } });
  finishPreview({ dimensions: { width: 4, height: 2 }, thumbnailBlob: new Blob(['thumb']) });
  await tick(); await tick();
  const updated = session.getPhoto(survivor.id);
  assert.strictEqual(updated.spatial.current, current);
  assert.equal(updated.direction.current.degrees, 75);
  assert.equal(updated.preview.state, 'ready');
  assert.equal(updated.spatial.candidates.filter((item) => item.kind === 'exif').length, 1);
  assert.equal(updated.occurrence.key, survivor.occurrence.key);
  session.clear();
  assert.deepEqual(context.revoked, context.created);
});

test('real pinned many-to-many grammar: seven photos per object and shared-photo two objects retain exact edges', async () => {
  const references = (await parseGmiPhotoSource(gmiFile([{ hyperlink: realGrammarFamilies[11] }]))).references;
  const context = await setup({}, [...references.map((ref) => ref.filename), sharedFilename]);
  await save(context, gmiFile([{ guid: sevenGuid, hyperlink: realGrammarFamilies[11] }, ...sharedGuids.map((guid) => ({ guid, hyperlink: link(sharedFilename) }))]));
  const { session, layer } = context, source = session.getLayer(layer.id).spatialSources[0];
  assert.equal(source.associationLedger.reverseIndexes.byObjectKey[`guid:${sevenGuid}`].length, 7);
  assert.equal(source.associationLedger.summary.associationCount, 9);
  const repeated = session.getLayerPhotos(layer.id).filter((photo) => photo.originalFilename === sharedFilename);
  assert.equal(repeated.length, 2);
  assert(repeated.every((photo) => photo.repeatGroup.repeated));
  assert.equal(session.getLayer(layer.id).assetCount, 8);
  session.clear();
});
