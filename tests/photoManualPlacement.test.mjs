import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { acceptManualPhotoPosition, emptySpatial } from '../src/lib/photos/photoSpatial.mjs';
import { planPhotoPositioning } from '../src/lib/photos/photoPositioning.mjs';
import { buildPhotoMapFeatures } from '../src/lib/photos/photoMapFeatures.mjs';

const originalPosition = { crs: 'EPSG:4326', longitude: 10.43, latitude: 59.22 };
const moved = { ...originalPosition, longitude: 10.431 };
const source = { entries: [{ id: 'entry', status: 'viable', position: originalPosition, raw: { fotolink: 'a.jpg' } }] };
const until = async (condition) => { for (let i = 0; i < 1000; i++) { if (condition()) return; await new Promise(resolve => setImmediate(resolve)); } assert.fail('Timed out'); };
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { resolve, promise }; };
function setup(options = {}) {
  let serial = 0;
  return createPhotoSession({ createId: () => `id-${++serial}`, yieldJob: () => new Promise(resolve => setImmediate(resolve)),
    createThumbnail: async () => ({ dimensions: { width: 1, height: 1 }, thumbnailBlob: new Blob(['thumb']) }),
    extractGps: async () => ({ state: 'viable', candidate: { status: 'viable', position: originalPosition, raw: { GPSLatitude: 59.22 } } }),
    parseGml: async () => source, ...options });
}
async function layerWithSources(session) {
  const ids = session.importFiles([new File(['original'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })]).acceptedIds;
  await session.importPositioningGml(new File(['gml'], 'positions.gml'));
  const layer = session.createLayer();
  await until(() => session.getLayer(layer.id).exifCandidateCount === 2);
  return { layer, ids };
}

test('manual current normalizes geography, deeply freezes metadata and creates no source candidate', () => {
  const spatial = emptySpatial();
  const result = acceptManualPhotoPosition(spatial, { ...moved, altitude: 123, extra: 'discard' }, 1234);
  assert.strictEqual(result.candidates, spatial.candidates);
  assert.deepEqual(result.current, { position: moved, basis: { kind: 'manual' }, acceptance: 'manual', acceptedAt: 1234 });
  assert(Object.isFrozen(result.current.position));
  for (const invalid of [null, { ...moved, latitude: 91 }, { ...moved, longitude: Infinity }, { ...moved, longitude: NaN }, { ...moved, crs: 'EPSG:3857' }, { ...moved, latitude: '59' }]) assert.equal(acceptManualPhotoPosition(spatial, invalid), null);
});

test('unplaced begin/cancel is a no-op; apply publishes once and counts/features change immediately', () => {
  const session = setup();
  const id = session.importFiles([new File(['a'], 'a.jpg')]).acceptedIds[0], layer = session.createLayer();
  const ticket = session.beginManualPlacement(layer.id, id);
  assert.equal(session.getPhoto(id).spatial.current, null);
  session.cancelManualPlacement(ticket);
  assert.equal(session.applyManualPlacement(ticket, moved).ok, false);
  const next = session.beginManualPlacement(layer.id, id);
  let publishes = 0; const unsubscribe = session.subscribe(() => publishes++);
  assert.equal(session.applyManualPlacement(next, moved).ok, true);
  assert.equal(publishes, 1); unsubscribe();
  assert.equal(session.getLayer(layer.id).placedCount, 1);
  assert.equal(buildPhotoMapFeatures([session.getLayer(layer.id)], session.getLayerPhotos).length, 1);
  assert.equal(session.applyManualPlacement(next, originalPosition).ok, false, 'ticket consumed once');
  session.clear();
});

test('move cancellation keeps exact current; repeated manual/source switching preserves evidence, Files, preview and other members', async () => {
  const session = setup(); const { layer, ids } = await layerWithSources(session);
  const before = session.getPhoto(ids[0]); const file = session.getFile(ids[0]); const other = session.getPhoto(ids[1]);
  const ticket = session.beginManualPlacement(layer.id, ids[0]);
  assert.strictEqual(ticket.expectedCurrent, before.spatial.current);
  session.cancelManualPlacement(ticket);
  assert.strictEqual(session.getPhoto(ids[0]).spatial.current, before.spatial.current);
  const evidence = before.spatial.candidates;
  for (let i = 0; i < 3; i++) {
    assert.equal(session.applyManualPlacement(session.beginManualPlacement(layer.id, ids[0]), moved).ok, true);
    const manual = session.getPhoto(ids[0]);
    assert.equal(manual.spatial.current.basis.kind, 'manual');
    assert.strictEqual(manual.spatial.candidates, evidence); assert.strictEqual(session.getFile(ids[0]), file);
    assert.strictEqual(manual.preview, before.preview);
    const plan = planPhotoPositioning([manual], { kind: 'exif' });
    assert.equal(plan.rows[0].currentKind, 'manual'); assert.equal(plan.rows[0].action, 'move');
    assert(plan.rows[0].distanceMetres > 50);
    const candidate = evidence.find(item => item.kind === (i % 2 ? 'gml' : 'exif'));
    session.acceptCandidates(layer.id, [{ photoId: ids[0], candidateId: candidate.id }]);
    assert.equal(session.getPhoto(ids[0]).spatial.current.basis.candidateId, candidate.id);
  }
  assert.strictEqual(session.getPhoto(ids[1]).spatial, other.spatial);
  session.clear();
});

for (const action of ['remove', 'delete', 'reset', 'hidden', 'current-change', 'explicit-cancel']) test(`stale proposal rejected after ${action}`, async () => {
  const session = setup(); const { layer, ids } = await layerWithSources(session);
  const ticket = session.beginManualPlacement(layer.id, ids[0]);
  if (action === 'remove') session.removeLayerPhotos(layer.id, [ids[0]], { confirmed: true });
  if (action === 'delete') session.deleteLayer(layer.id);
  if (action === 'reset') session.clear();
  if (action === 'hidden') { session.setLayerVisibility(layer.id, false); session.setLayerVisibility(layer.id, true); }
  if (action === 'current-change') session.acceptCandidates(layer.id, [{ photoId: ids[0], candidateId: `${ids[0]}:exif` }]);
  if (action === 'explicit-cancel') session.cancelManualPlacement(ticket);
  assert.equal(session.manualPlacementIsLive(ticket), false);
  const before = session.getPhoto(ids[0])?.spatial.current;
  assert.equal(session.applyManualPlacement(ticket, moved).ok, false);
  assert.strictEqual(session.getPhoto(ids[0])?.spatial.current, before);
  session.clear();
});

test('invalid, fabricated, foreign-session and wrong-owner requests cannot write current', async () => {
  const session = setup(); const { layer, ids } = await layerWithSources(session);
  const otherSession = setup(); const other = await layerWithSources(otherSession);
  assert.equal(session.beginManualPlacement('missing', ids[0]), null);
  assert.equal(session.beginManualPlacement(layer.id, 'missing'), null);
  const ticket = session.beginManualPlacement(layer.id, ids[0]);
  assert.equal(session.applyManualPlacement({ ...ticket }, moved).ok, false);
  assert.equal(session.applyManualPlacement(otherSession.beginManualPlacement(other.layer.id, other.ids[0]), moved).ok, false);
  assert.equal(session.applyManualPlacement(ticket, { ...moved, latitude: 91 }).error, 'invalid-position');
  assert.strictEqual(session.getPhoto(ids[0]).spatial.current, ticket.expectedCurrent);
  assert.equal(session.applyManualPlacement(ticket, moved).ok, true);
  session.clear(); otherSession.clear();
});

test('late EXIF and thumbnails preserve manual current and do not invalidate a live ticket', async () => {
  const thumbnail = deferred(), gps = deferred(); let started = 0;
  const session = setup({ createThumbnail: () => { started++; return thumbnail.promise; }, extractGps: () => { started++; return gps.promise; } });
  const id = session.importFiles([new File(['original'], 'a.jpg')]).acceptedIds[0], layer = session.createLayer();
  await until(() => started === 2);
  const ticket = session.beginManualPlacement(layer.id, id);
  gps.resolve({ state: 'viable', candidate: { status: 'viable', position: originalPosition } });
  await until(() => session.getPhoto(id).spatial.exifRead.state === 'viable');
  assert(session.manualPlacementIsLive(ticket));
  assert.equal(session.applyManualPlacement(ticket, moved).ok, true);
  const current = session.getPhoto(id).spatial.current;
  thumbnail.resolve({ dimensions: { width: 1, height: 1 }, thumbnailBlob: new Blob(['thumb']) });
  await until(() => session.getPhoto(id).preview.state === 'ready');
  assert.strictEqual(session.getPhoto(id).spatial.current, current);
  assert.equal(session.getPhoto(id).spatial.candidates.length, 1);
  session.clear();
});


test('both async readers finishing after manual acceptance retain the exact manual current', async () => {
  const thumbnail = deferred(), gps = deferred(); let started = 0;
  const session = setup({ createThumbnail: () => { started++; return thumbnail.promise; }, extractGps: () => { started++; return gps.promise; } });
  const id = session.importFiles([new File(['original'], 'a.jpg')]).acceptedIds[0], layer = session.createLayer();
  await until(() => started === 2);
  assert.equal(session.applyManualPlacement(session.beginManualPlacement(layer.id, id), moved).ok, true);
  const current = session.getPhoto(id).spatial.current;
  gps.resolve({ state: 'viable', candidate: { status: 'viable', position: originalPosition } });
  thumbnail.resolve({ dimensions: { width: 1, height: 1 }, thumbnailBlob: new Blob(['thumb']) });
  await until(() => session.getPhoto(id).spatial.exifRead.state === 'viable' && session.getPhoto(id).preview.state === 'ready');
  assert.strictEqual(session.getPhoto(id).spatial.current, current);
  assert.equal(session.getPhoto(id).spatial.candidates.length, 1);
  session.clear();
});
