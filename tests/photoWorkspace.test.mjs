import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { emptyPhotoWorkspace, photoWorkspaceReducer } from '../src/lib/photos/photoWorkspaceState.mjs';
import { photoBatchCandidateRequests, reviewPhotoSource } from '../src/lib/photos/photoPositionSources.mjs';
import { photoCaptureTime, photoCurrentSource } from '../src/lib/photos/photoPresentation.mjs';
import { buildPhotoMapFeatures } from '../src/lib/photos/photoMapFeatures.mjs';

const file = (name) => new File(['original'], name, { type: 'image/jpeg' });
const entry = (id, name, longitude = 10) => ({ id, reference: name, status: 'viable', position: { crs: 'EPSG:4326', longitude, latitude: 60 }, raw: { photographedAtText: '2025-11-20T12:00:00' } });
const parsed = (...entries) => ({ namespace: 'verified', entries });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(options = {}) {
  let id = 0;
  const revoked = [];
  const session = createPhotoSession({ createId: () => `id-${++id}`, yieldJob: tick,
    createThumbnail: async () => ({ thumbnailBlob: new Blob(['derived']), dimensions: { width: 20, height: 10 } }),
    extractGps: async () => ({ state: 'viable', candidate: entry('exif', 'unused', 11) }),
    parseGml: async (source) => JSON.parse(await source.text()),
    urls: { createObjectURL: () => `blob:${++id}`, revokeObjectURL: (url) => revoked.push(url) }, ...options });
  return { session, revoked };
}
const source = (data, name = 'source.gml') => new File([JSON.stringify(data)], name);
async function ready(session) {
  for (let n = 0; n < 100; n++) {
    if (session.getSnapshot().photoLayers.every((layer) => session.getLayerPhotos(layer.id)
      .every((photo) => photo.preview.state === 'ready' && photo.spatial.exifRead.state !== 'pending'))) return;
    await tick();
  }
  assert.fail('queue did not finish');
}

test('workspace active photo and batch selection are independent, with next-photo fallback and exit/reopen', () => {
  let state = photoWorkspaceReducer(emptyPhotoWorkspace, { type: 'enter', layerId: 'layer', photoIds: ['a', 'b', 'c'], photoId: 'b' });
  state = photoWorkspaceReducer(state, { type: 'toggle', photoId: 'c' });
  assert.equal(state.activePhotoId, 'b');
  state = photoWorkspaceReducer(state, { type: 'active', photoId: 'a' });
  assert.deepEqual(state.selectedIds, ['c']);
  state = photoWorkspaceReducer(state, { type: 'reconcile', layer: { photoIds: ['b', 'c'] } });
  assert.equal(state.activePhotoId, 'b');
  state = photoWorkspaceReducer(state, { type: 'reconcile', layer: { photoIds: [] } });
  assert.equal(state.activePhotoId, null); assert.deepEqual(state.selectedIds, []);
  assert.deepEqual(photoWorkspaceReducer(state, { type: 'exit' }), emptyPhotoWorkspace);
  assert.equal(photoWorkspaceReducer(state, { type: 'reconcile', layer: null }).layerId, null);
  state = photoWorkspaceReducer(emptyPhotoWorkspace, { type: 'enter', layerId: 'layer', photoIds: ['a', 'b', 'c', 'd'], photoId: 'b' });
  assert.equal(photoWorkspaceReducer(state, { type: 'reconcile', layer: { photoIds: ['c', 'd'] } }).activePhotoId, 'c');
});

test('target import cancellation leaves owner unchanged; append transfers pending writers and preserves existing evidence', async () => {
  const { session } = setup();
  const original = file('one.jpg');
  const [first] = session.importFiles([original]).acceptedIds;
  await session.importPositioningGml(source(parsed(entry('one', 'one.jpg'))));
  const layer = session.createLayer(); await ready(session);
  const before = session.getPhoto(first);
  session.beginImport(layer.id);
  const [cancelled] = session.importFiles([file('cancel.jpg')]).acceptedIds;
  assert.equal(session.createLayer(), null);
  session.cancelImport();
  assert.equal(session.getFile(cancelled), null); assert.deepEqual(session.getLayer(layer.id).photoIds, [first]);
  session.beginImport(layer.id);
  const [added] = session.importFiles([file('ONE.JPG')]).acceptedIds;
  assert.equal(session.getSnapshot().appendStatus.targetCollisions.length, 1);
  assert.equal(session.appendImport(), null, 'collision requires a deliberate override');
  session.setAppendDuplicateOverride(added, true);
  await session.importPositioningGml(source(parsed(entry('new', 'ONE.JPG', 12))));
  assert.equal(session.getSnapshot().positioning.ledger.summary.matchedCount, 1, 'incoming source scoped to new assets');
  session.appendImport(); await ready(session);
  assert.deepEqual(session.getLayer(layer.id).photoIds, [first, added]);
  assert.strictEqual(session.getPhoto(first).spatial, before.spatial);
  assert.strictEqual(session.getPhoto(first).preview, before.preview);
  assert.strictEqual(session.getFile(first), original);
  assert.equal(session.getPhoto(added).spatial.current.position.longitude, 12);
  assert.equal(session.getPhoto(added).spatial.candidates.length, 2);
  assert.equal(session.getSnapshot().draftTargetLayerId, null);
  session.clear();
});

test('late source stays candidate-only even unplaced, conflicts are shown, acceptance is reversible and batch explicit', async () => {
  const { session } = setup();
  const ids = session.importFiles([file('a.jpg'), file('b.jpg')]).acceptedIds;
  const layer = session.createLayer(); await ready(session);
  session.acceptCandidates(layer.id, [{ photoId: ids[0], candidateId: `${ids[0]}:exif` }]);
  const before = session.getPhoto(ids[0]).spatial.current;
  assert(await session.stageLayerSource(layer.id, source(parsed(entry('a', 'a.jpg'), entry('b', 'b.jpg'), entry('missing', 'missing.jpg')))));
  let review = session.getSnapshot().sourceReviews[layer.id];
  assert.equal(review.ledger.summary.matchedCount, 2); assert.equal(review.ledger.summary.unmatchedCount, 1);
  assert.equal(review.conflicts.length, 1); assert.deepEqual(review.unplacedPhotoIds, [ids[1]]);
  assert.equal(session.getPhoto(ids[0]).spatial.candidates.length, 1, 'staging changes no evidence');
  assert(session.applyLayerSource(layer.id));
  assert.strictEqual(session.getPhoto(ids[0]).spatial.current, before);
  assert.equal(session.getPhoto(ids[1]).spatial.current, null);
  const photos = session.getLayerPhotos(layer.id), candidates = photos.map((photo) => photo.spatial.candidates);
  const requests = photoBatchCandidateRequests(photos, ids, 'gml');
  assert.deepEqual(session.acceptCandidates(layer.id, requests), ids);
  assert.equal(session.getLayer(layer.id).placedCount, 2);
  session.acceptCandidates(layer.id, photoBatchCandidateRequests(session.getLayerPhotos(layer.id), ids, 'exif'));
  assert.equal(session.getPhoto(ids[0]).spatial.current.position.longitude, 11);
  ids.forEach((id, index) => assert.strictEqual(session.getPhoto(id).spatial.candidates, candidates[index]));
  assert.equal(photoCurrentSource(session.getPhoto(ids[0])), 'EXIF');
  assert.equal(photoCaptureTime(session.getPhoto(ids[0])), '2025-11-20T12:00:00');
  session.clear();
});

test('duplicate source is diagnosed, changed sources accumulate, batch needs explicit source, recheck adds newly matched assets only', async () => {
  const { session } = setup();
  const [a] = session.importFiles([file('a.jpg')]).acceptedIds;
  const initial = source(parsed(entry('a', 'a.jpg'), entry('b', 'b.jpg')));
  await session.importPositioningGml(initial); const layer = session.createLayer(); await ready(session);
  assert.equal(await session.stageLayerSource(layer.id, initial), false);
  assert.equal(session.getSnapshot().sourceReviews[layer.id].errorCode, 'duplicate-source');
  assert.equal(session.getSnapshot().sourceReviews[layer.id].attachedSourceId, session.getLayer(layer.id).spatialSources[0].id,
    'duplicate review points to the attached source, including renamed files');
  session.cancelLayerSourceReview(layer.id);
  session.beginImport(layer.id); const [b] = session.importFiles([file('b.jpg')]).acceptedIds;
  session.appendImport(); await ready(session);
  const firstSource = session.getLayer(layer.id).spatialSources[0];
  const original = session.getPhoto(a).spatial;
  assert(session.recheckLayerSource(layer.id, firstSource.id)); assert(session.applyLayerSource(layer.id));
  assert.strictEqual(session.getPhoto(a).spatial, original);
  assert.equal(session.getPhoto(b).spatial.current, null);
  assert.equal(session.getPhoto(b).spatial.candidates.filter((item) => item.kind === 'gml').length, 1);
  assert(await session.stageLayerSource(layer.id, source(parsed(entry('a', 'a.jpg', 13), entry('b', 'b.jpg', 13)), 'changed.gml')));
  assert(session.applyLayerSource(layer.id));
  assert.equal(session.getLayer(layer.id).spatialSources.length, 2);
  assert.equal(photoBatchCandidateRequests(session.getLayerPhotos(layer.id), [a, b], 'gml'), null);
  assert.equal(photoBatchCandidateRequests(session.getLayerPhotos(layer.id), [a, b], 'gml', firstSource.id).length, 2);
  assert.equal(session.getPhoto(a).spatial.current.position.longitude, 10);
  const sourceOrder = session.getLayer(layer.id).spatialSources.map((item) => item.id);
  session.recheckLayerSource(layer.id, firstSource.id); session.applyLayerSource(layer.id);
  assert.deepEqual(session.getLayer(layer.id).spatialSources.map((item) => item.id), sourceOrder, 'recheck retains source identity and display order');
  session.clear();
});

test('failed replacement retains previous staged source; ambiguity and unsupported positions are never guessed', async () => {
  const { session } = setup();
  session.importFiles([file('a.jpg'), file('A.JPG'), file('b.jpg')]); const layer = session.createLayer(); await ready(session);
  await session.stageLayerSource(layer.id, source(parsed(entry('a', 'a.jpg'), { ...entry('b', 'b.jpg'), status: 'unsupported-crs', position: null, errorCode: 'unsupported-crs' })));
  const valid = session.getSnapshot().sourceReviews[layer.id].source;
  assert.equal(await session.stageLayerSource(layer.id, new File(['invalid'], 'broken.gml')), false);
  assert.strictEqual(session.getSnapshot().sourceReviews[layer.id].source, valid);
  assert.equal(session.applyLayerSource(layer.id), false);
  session.discardLayerSourceError(layer.id);
  assert.equal(session.getSnapshot().sourceReviews[layer.id].state, 'ready');
  session.recheckLayerSource(layer.id, 'missing');
  await session.stageLayerSource(layer.id, source(parsed(entry('a', 'a.jpg'), { ...entry('b', 'b.jpg'), status: 'unsupported-crs', position: null })));
  const review = session.getSnapshot().sourceReviews[layer.id];
  assert.equal(review.ledger.summary.ambiguousCount, 1); assert.equal(review.ledger.summary.invalidCount, 1);
  session.applyLayerSource(layer.id);
  assert.equal(session.getLayerPhotos(layer.id)[0].spatial.candidates.length, 1, 'EXIF only on ambiguous photo');
  assert.equal(session.getLayer(layer.id).placedCount, 0);
  session.clear();
});

test('confirmed member removal releases records, source associations, markers and URLs, retains empty layer', async () => {
  const { session, revoked } = setup();
  const ids = session.importFiles([file('a.jpg'), file('b.jpg')]).acceptedIds;
  await session.importPositioningGml(source(parsed(entry('a', 'a.jpg'), entry('b', 'b.jpg'))));
  const layer = session.createLayer(); await ready(session);
  assert.deepEqual(session.removeLayerPhotos(layer.id, ids), []);
  const original = session.getFile(ids[0]);
  assert.deepEqual(session.removeLayerPhotos(layer.id, [ids[0], 'foreign'], { confirmed: true }), [ids[0]]);
  assert.equal(session.getFile(ids[0]), null); assert.equal(await original.text(), 'original');
  assert.equal(session.getLayer(layer.id).photoCount, 1); assert.equal(session.getLayer(layer.id).placedCount, 1);
  assert.equal(buildPhotoMapFeatures(session.getSnapshot().photoLayers, session.getLayerPhotos).length, 1);
  assert(!JSON.stringify(session.getLayer(layer.id).spatialSources).includes(`\"${ids[0]}\"`));
  assert.equal(revoked.length, 1);
  session.removeLayerPhotos(layer.id, ids, { confirmed: true });
  assert.equal(session.getLayer(layer.id).photoCount, 0); assert.equal(session.getLayer(layer.id).unplacedCount, 0);
  assert.equal(revoked.length, 2); session.clear();
});

test('late parsing cannot revive a deleted/reset owner or cancelled review; metadata transfers then ignores removed assets', async () => {
  let finishParse, finishGps;
  const { session } = setup({ parseGml: () => new Promise((resolve) => { finishParse = resolve; }),
    extractGps: () => new Promise((resolve) => { finishGps = resolve; }) });
  const [id] = session.importFiles([file('a.jpg')]).acceptedIds;
  const layer = session.createLayer(); await tick(); await tick();
  const pending = session.stageLayerSource(layer.id, file('positions.gml'));
  session.deleteLayer(layer.id);
  finishParse(parsed(entry('a', 'a.jpg')));
  if (finishGps) finishGps({ state: 'viable', candidate: entry('exif', 'a.jpg') });
  assert.equal(await pending, false); await tick();
  assert.equal(session.getPhoto(id), null); assert.deepEqual(session.getSnapshot().sourceReviews, {});
  session.clear();
});

test('future source adapters share the layer evidence seam without new ownership or GML coupling', async () => {
  const { session } = setup({ sourceAdapters: { 'synthetic-position-source': async () => parsed(entry('synthetic', 'a.jpg', 12)) } });
  const [id] = session.importFiles([file('a.jpg')]).acceptedIds;
  const layer = session.createLayer();
  assert(await session.stageLayerSource(layer.id, file('future.synthetic'), 'synthetic-position-source'));
  session.applyLayerSource(layer.id);
  assert.equal(session.getPhoto(id).spatial.candidates.find((item) => item.kind === 'synthetic-position-source').position.longitude, 12);
  assert.equal(session.getPhoto(id).spatial.current, null);
  const review = reviewPhotoSource(parsed(entry('x', 'a.jpg')), session.getLayerPhotos(layer.id));
  assert.deepEqual(review.unplacedPhotoIds, [id]); session.clear();
});

for (const action of ['cancel', 'reset', 'remove-member']) {
  test(`in-flight late source reads current membership and cannot revive records after ${action}`, async () => {
    let finish;
    const { session } = setup({ parseGml: () => new Promise((resolve) => { finish = resolve; }) });
    const ids = session.importFiles([file('a.jpg'), file('b.jpg')]).acceptedIds;
    const layer = session.createLayer(); await ready(session);
    const pending = session.stageLayerSource(layer.id, file('positions.gml'));
    if (action === 'cancel') session.cancelLayerSourceReview(layer.id);
    if (action === 'reset') session.clear();
    if (action === 'remove-member') session.removeLayerPhotos(layer.id, [ids[0]], { confirmed: true });
    finish(parsed(entry('a', 'a.jpg'), entry('b', 'b.jpg')));
    assert.equal(await pending, action === 'remove-member');
    if (action === 'remove-member') {
      assert.equal(session.getSnapshot().sourceReviews[layer.id].ledger.summary.matchedCount, 1);
      session.applyLayerSource(layer.id);
      assert.equal(session.getPhoto(ids[0]), null);
      assert.equal(session.getPhoto(ids[1]).spatial.current, null);
    } else assert.deepEqual(session.getSnapshot().sourceReviews, {});
    session.clear();
  });
}

test('source import and duplicate detection still work without secure-context Web Crypto', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  const { session } = setup();
  try {
    session.importFiles([file('a.jpg')]);
    const positions = source(parsed(entry('a', 'a.jpg')));
    assert(await session.importPositioningGml(positions));
    const layer = session.createLayer();
    assert.equal(layer.placedCount, 1);
    assert.equal(await session.stageLayerSource(layer.id, positions), false);
    assert.equal(session.getSnapshot().sourceReviews[layer.id].errorCode, 'duplicate-source');
  } finally {
    session.clear(); Object.defineProperty(globalThis, 'crypto', descriptor);
  }
});
