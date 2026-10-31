import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { createGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { createLoadedGmiSources, isLoadedGmiSurveyLayer } from '../src/lib/photos/loadedGmiSource.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const linked = (reference, options = {}) => ({ hyperlink: `h:1(link:"${reference}") `, ...options });
const image = (name, relative = '') => {
  const file = new File(['synthetic image'], name, { type: 'image/png' });
  Object.defineProperty(file, 'webkitRelativePath', { value: relative }); return file;
};
async function setup(objects = [linked('a.png')], options = {}) {
  let id = 0, thumbnails = 0, gps = 0;
  const revoked = [], surveyLayers = new Map();
  const session = createPhotoSession({ createId: () => `id-${++id}`, yieldJob: tick,
    createThumbnail: async () => { thumbnails++; return { thumbnailBlob: new Blob(['preview']), dimensions: { width: 20, height: 10 } }; },
    extractGps: async () => { gps++; return { state: 'no-gps', candidate: null }; },
    urls: { createObjectURL: () => `blob:${++id}`, revokeObjectURL: (url) => revoked.push(url) }, ...options });
  const registry = createLoadedGmiSources({ getLayer: (layerId) => surveyLayers.get(layerId) });
  const file = gmiFile(objects, 'delivery.gmi');
  const parser = new GMIParser(decodeGmiBytes(new Uint8Array(await file.arrayBuffer())));
  const data = parser.toObject();
  surveyLayers.set('survey', { data, file: { name: file.name, format: 'GMI' } });
  const binding = registry.register('survey', data, file, createGmiPhotoSource(parser));
  const begin = async (target = null) => {
    const ticket = registry.begin('survey'); assert(ticket);
    assert(await session.beginLoadedGmiImport({ binding: ticket.binding, read: () => registry.read(ticket), isLive: registry.isLive }, target));
  };
  const reconcile = () => { registry.reconcile(); session.reconcileLoadedGmiBindings(registry.isLive); };
  return { session, registry, surveyLayers, binding, data, file, begin, reconcile, revoked, counts: () => ({ thumbnails, gps }) };
}

test('loaded parser evidence and exact File identity are reused; no source reselection or operational CRS promotion', async () => {
  const env = await setup([linked('a.png')]); await env.begin();
  const source = env.session.getSnapshot().loadedImport.source;
  assert.match(source.fingerprint, /^(sha256:|exact-bytes:)/);
  assert.equal(source.loadedBinding.datasetRevision, env.binding.datasetRevision);
  assert.equal(source.objectsByKey[Object.keys(source.objectsByKey)[0]].hyperlinkRaw, 'h:1(link:"a.png") ');
  assert.equal(env.registry.available('survey'), true);
  assert.equal(env.session.getSnapshot().photoLayers.length, 0);
  env.session.clear();
});

test('only actual GMI survey instances qualify, never FOTO/SOSI/KOF/WFS/WMS/external or restored metadata alone', async () => {
  for (const type of ['FOTO', 'WMS', 'GEMINI_WFS_REFERENCE', 'external', 'SOSI', 'KOF'])
    assert.equal(isLoadedGmiSurveyLayer({ type, data: { format: 'GMI' } }), false);
  const env = await setup();
  env.surveyLayers.set('other', { data: env.data, file: { name: 'delivery.gmi', format: 'GMI' } });
  assert.equal(env.registry.begin('other'), null);
  env.surveyLayers.set('survey', { data: { ...env.data }, file: { name: 'delivery.gmi', format: 'GMI' } });
  assert.equal(env.registry.begin('survey'), null);
});

test('reconciliation reports matched/repeated/ambiguous/not-selected/unreferenced and never guesses unsafe links', async () => {
  const env = await setup([linked('A/a.png'), linked('A/a.png'), linked('same.png'), linked('absent.png'),
    linked('../unsafe.png'), linked('https://invalid.example/remote.png'), linked('flat.png'), linked('b/B.png')]);
  await env.begin();
  env.session.importFiles([image('a.png', 'Delivery/A/a.png'), image('same.png', 'Delivery/X/same.png'),
    image('same.png', 'Delivery/Y/same.png'), image('flat.png'), image('b.png', 'Delivery/b/b.png'), image('orphan.png')]);
  const review = env.session.reviewLoadedGmiImport();
  assert.equal(review.associationLedger.summary.matchedReferenceCount, 4);
  assert.equal(review.repeatedCount, 1);
  assert.equal(review.associationLedger.summary.ambiguousCount, 1);
  assert.equal(review.associationLedger.summary.unmatchedCount, 3);
  assert.equal(review.unreferencedIds.length, 1);
  assert.equal(review.pathCount, 4);
  assert.equal(review.associationLedger.resolutions.filter((row) => row.reason === 'unsafe-reference').length, 2);
  const result = env.session.applyLoadedGmiImport(review); assert(result.ok);
  const photos = env.session.getLayerPhotos(result.layer.id);
  assert.equal(result.layer.assetCount, 6); assert.equal(photos.length, 7);
  assert(photos.every((photo) => photo.spatial.current === null));
  env.session.clear();
});

test('relative paths disambiguate duplicate basenames, case/NFC fallback survives and unreferenced inclusion is explicit', async () => {
  const env = await setup([linked('one/a.png'), linked('two/a.png'), linked('GR\u00d6FT.png')]); await env.begin();
  env.session.importFiles([image('a.png', 'Delivery/one/a.png'), image('a.png', 'Delivery/two/a.png'), image('gro\u0308ft.png'), image('extra.png')]);
  const review = env.session.reviewLoadedGmiImport({ includeUnreferenced: false });
  assert.equal(review.associationLedger.summary.matchedReferenceCount, 3);
  assert.equal(review.includedIds.length, 3); assert.equal(review.unreferencedIds.length, 1);
  const excluded = review.unreferencedIds[0];
  const result = env.session.applyLoadedGmiImport(review); assert(result.ok);
  assert.equal(env.session.getFile(excluded), null); assert.equal(result.layer.assetCount, 3);
  env.session.clear();
});

test('one original/two coincident POINT placements/LINE association: one job pair, exact candidates, explicit positions and final-owner release', async () => {
  const env = await setup([linked('a.png'), linked('a.png'), linked('a.png', { scope: 'line' })]); await env.begin();
  const file = image('a.png'); const [id] = env.session.importFiles([file]).acceptedIds;
  let publications = 0; const stop = env.session.subscribe(() => publications++);
  const result = env.session.applyLoadedGmiImport(env.session.reviewLoadedGmiImport()); assert(result.ok);
  assert.equal(publications, 1); stop();
  assert.equal(result.layer.assetCount, 1); assert.equal(result.layer.photoCount, 2); assert.equal(result.layer.placedCount, 0);
  const photos = env.session.getLayerPhotos(result.layer.id);
  assert.equal(photos[0].assetId, photos[1].assetId);
  assert.equal(env.session.getFile(photos[1].id), file);
  assert.notEqual(photos[0].occurrence.key, photos[1].occurrence.key);
  assert.deepEqual(photos[0].spatial.candidates[0].position, photos[1].spatial.candidates[0].position);
  assert.equal(env.session.getGmiPhotoAssociations(result.layer.id, id).length, 3);
  const ticket = env.session.beginSourceWorkflow(result.layer.id);
  const plan = env.session.reviewSourceWorkflowPositions(ticket);
  assert(env.session.applySourceWorkflowPositions(ticket, plan, plan.rows.map((row) => ({ photoId: row.photoId, candidateId: row.defaultChoice }))).ok);
  assert.equal(env.session.getLayer(result.layer.id).placedCount, 2);
  for (let n = 0; n < 30 && env.counts().thumbnails === 0; n++) await tick();
  assert.deepEqual(env.counts(), { thumbnails: 1, gps: 1 });
  env.session.removeLayerPhotos(result.layer.id, [id], { confirmed: true });
  assert.equal(env.session.getFile(photos[1].id), file); assert.equal(env.revoked.length, 0);
  env.session.removeLayerPhotos(result.layer.id, [photos[1].id], { confirmed: true });
  assert.equal(env.session.getFile(photos[1].id), null); assert.equal(env.revoked.length, 1);
  env.session.clear();
});

test('append/recheck reuses existing assets, preserves manual current/direction and resolves newly selected references idempotently', async () => {
  const env = await setup([linked('a.png'), linked('a.png'), linked('later.png')]); await env.begin();
  const [id] = env.session.importFiles([image('a.png')]).acceptedIds;
  const first = env.session.applyLoadedGmiImport(env.session.reviewLoadedGmiImport()); assert(first.ok);
  env.session.applyManualPlacement(env.session.beginManualPlacement(first.layer.id, id), { crs: 'EPSG:4326', longitude: 10, latitude: 60 });
  env.session.applyDirectionEdit(env.session.beginDirectionEdit(first.layer.id, id), 42);
  const before = env.session.getPhoto(id);
  await env.begin(first.layer.id);
  const duplicate = env.session.importFiles([image('a.png'), image('later.png')]).acceptedIds[0];
  const review = env.session.reviewLoadedGmiImport();
  assert.equal(review.includedIds.length, 1);
  const result = env.session.applyLoadedGmiImport(review); assert(result.ok);
  assert.equal(result.layer.assetCount, 2); assert.equal(result.layer.photoCount, 3);
  assert.equal(env.session.getFile(duplicate), null);
  assert.strictEqual(env.session.getPhoto(id).spatial.current, before.spatial.current);
  assert.strictEqual(env.session.getPhoto(id).direction, before.direction);
  assert.equal(result.layer.spatialSources.length, 1);
  await env.begin(result.layer.id);
  const again = env.session.applyLoadedGmiImport(env.session.reviewLoadedGmiImport()); assert(again.ok);
  assert.deepEqual(again.layer.photoIds, result.layer.photoIds);
  assert.equal(again.layer.spatialSources[0].associationLedger.summary.associationCount, 3);
  env.session.clear();
});

for (const change of ['source-delete', 'source-replace', 'source-register', 'source-bytes', 'target-delete', 'target-members', 'cancel', 'reset', 'selection'])
  test(`stale ${change} rejects the whole import without retaining source/new occurrences`, async () => {
    const env = await setup();
    env.session.importFiles([image('existing.png')]); const target = env.session.createLayer();
    await env.begin(target.id); env.session.importFiles([image('a.png')]);
    const review = env.session.reviewLoadedGmiImport();
    if (change === 'source-delete') env.surveyLayers.delete('survey');
    if (change === 'source-replace') env.surveyLayers.set('survey', { data: { ...env.data }, file: { name: 'delivery.gmi', format: 'GMI' } });
    if (change === 'source-register') env.registry.register('survey', env.data, env.file, review.source);
    if (change === 'source-bytes') env.registry.register('survey', env.data,
      new File([await env.file.arrayBuffer(), '\n'], env.file.name), review.source);
    if (change === 'target-delete') env.session.deleteLayer(target.id);
    if (change === 'target-members') env.session.removeLayerPhotos(target.id, target.photoIds, { confirmed: true });
    if (change === 'cancel') env.session.cancelImport();
    if (change === 'reset') env.session.clear();
    if (change === 'selection') env.session.importFiles([image('new.png')]);
    assert.equal(env.session.applyLoadedGmiImport(review).ok, false);
    assert.equal(env.session.getLayer(target.id)?.spatialSources.length || 0, 0);
    env.session.clear();
  });

test('cancel during source read or thumbnail/EXIF work releases draft and late work cannot recreate it', async () => {
  let resolveRead, resolvePreview, resolveGps;
  const env = await setup(undefined, { createThumbnail: () => new Promise((resolve) => { resolvePreview = resolve; }),
    extractGps: () => new Promise((resolve) => { resolveGps = resolve; }) });
  const pending = env.session.beginLoadedGmiImport({ binding: env.binding, isLive: env.registry.isLive,
    read: () => new Promise((resolve) => { resolveRead = resolve; }) });
  env.session.importFiles([image('a.png')]);
  for (let n = 0; n < 30 && (!resolvePreview || !resolveGps); n++) await tick();
  env.session.cancelImport();
  resolveRead(createGmiPhotoSource(new GMIParser(decodeGmiBytes(new Uint8Array(await env.file.arrayBuffer()))), 'fingerprint'));
  assert.equal(await pending, false);
  resolvePreview({ thumbnailBlob: new Blob(['late']), dimensions: { width: 20, height: 10 } }); resolveGps({ state: 'no-gps', candidate: null });
  await tick(); await tick();
  assert.equal(env.session.getSnapshot().photos.length, 0); assert.equal(env.session.getSnapshot().photoLayers.length, 0);
  assert.equal(env.session.getSnapshot().loadedImport, null);
});

test('successful source survives survey removal with accurate detached binding and unchanged current/original', async () => {
  const env = await setup(); await env.begin(); const [id] = env.session.importFiles([image('a.png')]).acceptedIds;
  const result = env.session.applyLoadedGmiImport(env.session.reviewLoadedGmiImport());
  env.session.applyManualPlacement(env.session.beginManualPlacement(result.layer.id, id), { crs: 'EPSG:4326', longitude: 10, latitude: 60 });
  const before = env.session.getPhoto(id), file = env.session.getFile(id);
  env.surveyLayers.delete('survey'); env.reconcile();
  assert.equal(env.session.getLayer(result.layer.id).spatialSources[0].loadedBinding.live, false);
  assert.strictEqual(env.session.getPhoto(id).spatial.current, before.spatial.current);
  assert.strictEqual(env.session.getFile(id), file);
  assert.equal(env.session.getGmiPhotoAssociations(result.layer.id, id).length, 1);
  env.session.clear();
});

test('explicit append collision override remains a distinct original and does not steal a confirmed association', async () => {
  const env = await setup(); await env.begin();
  const original = image('a.png'); const [id] = env.session.importFiles([original]).acceptedIds;
  const first = env.session.applyLoadedGmiImport(env.session.reviewLoadedGmiImport());
  await env.begin(first.layer.id);
  const copy = image('A.png'); const [incoming] = env.session.importFiles([copy]).acceptedIds;
  assert.equal(env.session.getSnapshot().appendStatus.skippedIds.length, 1);
  const stale = env.session.reviewLoadedGmiImport();
  assert(env.session.setAppendDuplicateOverride(incoming, true));
  assert.equal(env.session.applyLoadedGmiImport(stale).ok, false);
  const result = env.session.applyLoadedGmiImport(env.session.reviewLoadedGmiImport()); assert(result.ok);
  assert.equal(result.layer.assetCount, 2);
  assert.strictEqual(env.session.getFile(id), original); assert.strictEqual(env.session.getFile(incoming), copy);
  assert.equal(result.layer.spatialSources[0].associationLedger.reverseIndexes.byPhotoId[id].length, 1);
  assert.equal(env.session.getGmiPhotoAssociations(result.layer.id, incoming).length, 0);
  env.session.clear();
});

test('optional GML and asynchronous EXIF remain shared candidate evidence on every repeated occurrence, never current', async () => {
  const position = { crs: 'EPSG:4326', longitude: 10, latitude: 60 };
  const env = await setup([linked('a.png'), linked('a.png')], {
    extractGps: async () => ({ state: 'viable', candidate: { status: 'viable', position } }),
    parseGml: async () => ({ entries: [{ id: 'gml-entry', reference: 'a.png', status: 'viable', position }] }),
  });
  await env.begin(); env.session.importFiles([image('a.png')]);
  await env.session.importPositioningGml(new File(['synthetic'], 'positions.gml'));
  for (let n = 0; n < 30 && env.session.getSnapshot().photos[0].spatial.exifRead.state === 'pending'; n++) await tick();
  const result = env.session.applyLoadedGmiImport(env.session.reviewLoadedGmiImport()); assert(result.ok);
  const photos = env.session.getLayerPhotos(result.layer.id);
  for (const photo of photos) {
    assert.equal(photo.spatial.current, null);
    assert.deepEqual(photo.spatial.candidates.map((candidate) => candidate.kind).sort(), ['exif', 'gmi', 'gml']);
  }
  assert.strictEqual(photos[0].spatial.candidates.find((candidate) => candidate.kind === 'gml'), photos[1].spatial.candidates.find((candidate) => candidate.kind === 'gml'));
  env.session.clear();
});

test('a forged plan, target change or new operation cannot commit a reviewed import', async () => {
  const env = await setup(); await env.begin(); env.session.importFiles([image('a.png')]);
  const plan = env.session.reviewLoadedGmiImport();
  assert.equal(env.session.applyLoadedGmiImport({ ...plan }).ok, false);
  await env.begin(); env.session.importFiles([image('a.png')]);
  assert.equal(env.session.applyLoadedGmiImport(plan).ok, false);
  assert.equal(env.session.createLayer(), null, 'loaded import cannot bypass source confirmation through ordinary creation');
  env.session.cancelImport(); assert.equal(env.session.getSnapshot().photoLayers.length, 0);
});

test('invalid optional GML preflight writes no FOTO/source/occurrence state or partial evidence', async () => {
  const env = await setup(undefined, { parseGml: async () => ({ entries: [
    { id: 'good', reference: 'a.png', status: 'viable', position: { crs: 'EPSG:4326', longitude: 10, latitude: 60 } },
    { id: 'bad', reference: 'b.png', status: 'viable', position: { crs: 'EPSG:4326', longitude: 1000, latitude: 60 } },
  ] }) });
  await env.begin(); const ids = env.session.importFiles([image('a.png'), image('b.png')]).acceptedIds;
  await env.session.importPositioningGml(new File(['synthetic'], 'invalid-position.gml'));
  const result = env.session.applyLoadedGmiImport(env.session.reviewLoadedGmiImport());
  assert.equal(result.ok, false); assert.equal(result.error, 'invalid-source');
  assert.equal(env.session.getSnapshot().photoLayers.length, 0);
  assert(ids.every((id) => env.session.getPhoto(id).spatial.candidates.every((candidate) => candidate.kind === 'exif')));
  env.session.cancelImport(); assert(ids.every((id) => env.session.getFile(id) === null));
});
