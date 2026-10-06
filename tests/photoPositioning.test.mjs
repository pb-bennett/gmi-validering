import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { planPhotoPositioning, summarizePhotoPositioning, photoPositioningRequests, photoPositionDistance } from '../src/lib/photos/photoPositioning.mjs';
import { buildPhotoMapFeatures } from '../src/lib/photos/photoMapFeatures.mjs';

const point = (longitude = 10) => ({ crs: 'EPSG:4326', longitude, latitude: 60 });
const entry = (id, filename, longitude = 10) => ({ id, reference: filename, kind: 'gml', status: 'viable', position: point(longitude), raw: { fotolink: filename } });
const source = (...entries) => new File([JSON.stringify({ entries })], 'positions.gml');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(options = {}) {
  let id = 0;
  return createPhotoSession({ createId: () => String(++id), yieldJob: tick,
    createThumbnail: async () => ({ thumbnailBlob: new Blob(['thumb']), dimensions: { width: 10, height: 10 } }),
    extractGps: async (file) => file.name === 'none.jpg' ? { state: 'no-gps', candidate: null }
      : { state: 'viable', candidate: { id: 'gps', kind: 'exif', status: 'viable', position: point(), raw: { GPSLatitude: 60 } } },
    parseGml: async (file) => JSON.parse(await file.text()),
    urls: { createObjectURL: () => `blob:${++id}`, revokeObjectURL: () => {} }, ...options });
}
async function layerWithPhotos(session, names = ['a.jpg', 'b.jpg', 'none.jpg']) {
  session.importFiles(names.map((name) => new File(['original'], name, { type: 'image/jpeg' })));
  const layer = session.createLayer();
  for (let attempt = 0; attempt < 100; attempt++) {
    if (session.getLayerPhotos(layer.id).every((photo) => photo.spatial.exifRead.state !== 'pending')) return session.getLayer(layer.id);
    await tick();
  }
  throw new Error('metadata did not finish');
}
function plan(session, layer, kind) {
  return planPhotoPositioning(session.getLayerPhotos(layer.id), { kind,
    source: kind === 'gml' ? session.getSnapshot().sourceReviews[layer.id].source : null });
}
function apply(session, layer, review, ids = review.defaultSelectedIds) {
  return session.applyPhotoPositioning(layer.id, { kind: review.kind, sourceId: review.sourceId,
    memberIds: review.memberIds, requests: photoPositioningRequests(review, ids) });
}

test('EXIF review selects usable rows only, summarizes selection, and explicitly applies selected current positions', async () => {
  const session = setup(), layer = await layerWithPhotos(session);
  const before = session.getLayerPhotos(layer.id), review = plan(session, layer, 'exif');
  assert.equal(review.defaultSelectedIds.length, 2);
  assert.deepEqual(review.rows.map((row) => row.action), ['place', 'place', 'unavailable']);
  assert.equal(session.getLayer(layer.id).placedCount, 0);
  assert.deepEqual(summarizePhotoPositioning(review, [review.rows[0].photoId]), {
    selectedCount: 1, placeCount: 1, moveCount: 0, sameCount: 0, unavailableCount: 1, deselectedCount: 1,
  });
  assert.equal(summarizePhotoPositioning(review, []).selectedCount, 0);
  assert(apply(session, layer, review, [review.rows[0].photoId]).ok);
  const after = session.getLayerPhotos(layer.id);
  assert(after[0].spatial.current); assert.equal(after[1].spatial.current, null);
  after.forEach((photo, i) => assert.strictEqual(photo.spatial.candidates, before[i].spatial.candidates));
  assert.equal(buildPhotoMapFeatures([session.getLayer(layer.id)], session.getLayerPhotos).length, 1);
  assert.equal(session.getLayer(layer.id).placedCount, 1);
  session.clear();
});

test('GML confirmation attaches evidence and selected positions atomically; deselected positions and originals stay intact', async () => {
  const session = setup(), layer = await layerWithPhotos(session);
  const originals = session.getLayerPhotos(layer.id).map((photo) => session.getFile(photo.id));
  await session.stageLayerSource(layer.id, source(entry('a', 'a.jpg'), entry('b', 'b.jpg'), entry('missing', 'missing.jpg')));
  const review = plan(session, layer, 'gml');
  assert.equal(review.ledger.summary.matchedCount, 2); assert.equal(review.ledger.summary.unmatchedCount, 1);
  assert.deepEqual(review.rows.map((row) => row.action), ['place', 'place', 'unmatched']);
  assert.equal(session.getLayer(layer.id).spatialSources.length, 0);
  const publications = []; const unsubscribe = session.subscribe(() => publications.push(session.getSnapshot()));
  assert(apply(session, layer, review, [review.rows[0].photoId]).ok); unsubscribe();
  assert.equal(publications.length, 1);
  assert.equal(publications[0].photoLayers[0].spatialSources.length, 1);
  assert.equal(publications[0].photoLayers[0].placedCount, 1);
  const photos = session.getLayerPhotos(layer.id);
  assert.equal(photos[1].spatial.current, null);
  assert(photos[1].spatial.candidates.some((candidate) => candidate.kind === 'gml'), 'deselected evidence preserved');
  photos.forEach((photo, i) => assert.strictEqual(session.getFile(photo.id), originals[i]));
  assert.equal(session.getSnapshot().sourceReviews[layer.id], undefined);
  session.clear();
});

test('place/move/same and approximate comparison use shared one-centimetre tolerance; source basis stays explicit', async () => {
  const session = setup(), layer = await layerWithPhotos(session, ['a.jpg', 'b.jpg', 'c.jpg']);
  const exif = plan(session, layer, 'exif'); apply(session, layer, exif, exif.defaultSelectedIds.slice(0, 2));
  await session.stageLayerSource(layer.id, source(entry('a', 'a.jpg', 10.00000001), entry('b', 'b.jpg', 10.0002), entry('c', 'c.jpg')));
  const review = plan(session, layer, 'gml');
  assert.deepEqual(review.rows.map((row) => row.action), ['same', 'move', 'place']);
  assert(review.rows[1].distanceMetres > 10 && review.rows[1].distanceMetres < 12);
  assert.equal(review.rows[1].currentKind, 'exif'); assert.equal(review.rows[1].proposal.kind, 'gml');
  assert.equal(summarizePhotoPositioning(review, [review.rows[0].photoId, review.rows[2].photoId]).moveCount, 0);
  assert(apply(session, layer, review).ok);
  const photos = session.getLayerPhotos(layer.id);
  assert.equal(photos[0].spatial.candidates.find((item) => item.id === photos[0].spatial.current.basis.candidateId).kind, 'gml');
  assert(photos.every((photo) => photo.spatial.candidates.filter((item) => ['exif', 'gml'].includes(item.kind)).length === 2));
  assert(Object.isFrozen(review.rows) && Object.isFrozen(review.rows[0].proposal));
  assert.equal(photoPositionDistance(point(), { crs: 'bad', latitude: 0, longitude: 0 }), null);
  session.clear();
});

test('ambiguous, unmatched and invalid GML rows cannot be selected or applied', async () => {
  const session = setup(), layer = await layerWithPhotos(session, ['a.jpg', 'A.JPG', 'invalid.jpg', 'none.jpg']);
  await session.stageLayerSource(layer.id, source(entry('a', 'a.jpg'), { ...entry('bad', 'invalid.jpg'), status: 'unsupported-crs', position: null }));
  const review = plan(session, layer, 'gml');
  assert.deepEqual(review.rows.map((row) => row.action), ['ambiguous', 'ambiguous', 'unavailable', 'unmatched']);
  assert.deepEqual(review.defaultSelectedIds, []);
  assert.equal(photoPositioningRequests(review, layer.photoIds).length, 0);
  assert.equal(apply(session, layer, review).ok, false);
  assert.equal(session.getLayer(layer.id).spatialSources.length, 0);
  session.clear();
});

test('existing identical/renamed GML is reused and rechecked without duplicate evidence or automatic acceptance', async () => {
  const session = setup(), layer = await layerWithPhotos(session);
  const file = source(entry('a', 'a.jpg'), entry('b', 'b.jpg'));
  await session.stageLayerSource(layer.id, file); assert(apply(session, layer, plan(session, layer, 'gml')).ok);
  const before = session.getLayerPhotos(layer.id);
  assert.equal(await session.stageLayerSource(layer.id, new File([await file.text()], 'renamed.gml')), false);
  session.recheckLayerSource(layer.id, session.getSnapshot().sourceReviews[layer.id].attachedSourceId);
  const review = plan(session, layer, 'gml');
  assert.equal(summarizePhotoPositioning(review, review.defaultSelectedIds).sameCount, 2);
  assert(apply(session, layer, review).ok);
  assert.equal(session.getLayer(layer.id).spatialSources.length, 1);
  session.getLayerPhotos(layer.id).forEach((photo, i) => assert.strictEqual(photo.spatial.candidates, before[i].spatial.candidates));
  session.clear();
});

for (const step of ['source', 'review', 'summary']) test(`cancel at ${step} leaves current and attached evidence intact`, async () => {
  const session = setup(), layer = await layerWithPhotos(session);
  await session.stageLayerSource(layer.id, source(entry('a', 'a.jpg'))); apply(session, layer, plan(session, layer, 'gml'));
  const before = session.getLayerPhotos(layer.id), sources = session.getLayer(layer.id).spatialSources;
  await session.stageLayerSource(layer.id, source(entry('a', 'a.jpg', 11)));
  if (step !== 'source') { const review = plan(session, layer, 'gml'); summarizePhotoPositioning(review, review.defaultSelectedIds); }
  session.cancelLayerSourceReview(layer.id);
  assert.strictEqual(session.getLayer(layer.id).spatialSources, sources);
  assert.deepEqual(session.getLayerPhotos(layer.id), before);
  assert.equal(session.getSnapshot().sourceReviews[layer.id], undefined);
  session.clear();
});

for (const change of ['remove', 'delete', 'reset', 'current', 'source', 'duplicate-request']) test(`confirmation safely aborts after ${change} without partial writes`, async () => {
  const session = setup(), layer = await layerWithPhotos(session);
  await session.stageLayerSource(layer.id, source(entry('a', 'a.jpg'), entry('b', 'b.jpg')));
  const review = plan(session, layer, 'gml');
  if (change === 'remove') session.removeLayerPhotos(layer.id, [layer.photoIds[1]], { confirmed: true });
  if (change === 'delete') session.deleteLayer(layer.id);
  if (change === 'reset') session.clear();
  if (change === 'current') apply(session, layer, plan(session, layer, 'exif'), [layer.photoIds[0]]);
  if (change === 'source') await session.stageLayerSource(layer.id, source(entry('a', 'a.jpg', 11)));
  const before = session.getLayerPhotos(layer.id), sources = session.getLayer(layer.id)?.spatialSources;
  const requests = photoPositioningRequests(review, review.defaultSelectedIds);
  if (change === 'duplicate-request') requests.push(requests[0]);
  assert.equal(session.applyPhotoPositioning(layer.id, { kind: 'gml', sourceId: review.sourceId, memberIds: review.memberIds, requests }).ok, false);
  assert.deepEqual(session.getLayerPhotos(layer.id), before);
  assert.strictEqual(session.getLayer(layer.id)?.spatialSources, sources);
  session.clear();
});

test('failed GML parsing and late results after cancellation cannot attach or apply anything', async () => {
  const session = setup(), layer = await layerWithPhotos(session);
  assert.equal(await session.stageLayerSource(layer.id, new File(['broken'], 'broken.gml')), false);
  assert.equal(session.getLayer(layer.id).placedCount, 0); session.clear();
  let resolve; const delayed = setup({ parseGml: () => new Promise((done) => { resolve = done; }) });
  const owner = await layerWithPhotos(delayed), read = delayed.stageLayerSource(owner.id, source(entry('a', 'a.jpg')));
  delayed.cancelLayerSourceReview(owner.id); resolve({ entries: [entry('a', 'a.jpg')] });
  assert.equal(await read, false); assert.equal(delayed.getLayer(owner.id).spatialSources.length, 0);
  assert.equal(delayed.getLayer(owner.id).placedCount, 0); delayed.clear();
});
