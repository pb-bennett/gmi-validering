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
const move = (session, layerId, photoId, position) => session.applyPhotoEdits(session.beginPhotoEdits(layerId), [{ photoId, position }]);

test('manual current normalizes geography, deeply freezes metadata and creates no source candidate', () => {
  const spatial = emptySpatial();
  const result = acceptManualPhotoPosition(spatial, { ...moved, altitude: 123, extra: 'discard' }, 1234);
  assert.strictEqual(result.candidates, spatial.candidates);
  assert.deepEqual(result.current, { position: moved, basis: { kind: 'manual' }, acceptance: 'manual', acceptedAt: 1234 });
  assert(Object.isFrozen(result.current.position));
  for (const invalid of [null, { ...moved, latitude: 91 }, { ...moved, longitude: Infinity }, { ...moved, longitude: NaN }, { ...moved, crs: 'EPSG:3857' }, { ...moved, latitude: '59' }]) assert.equal(acceptManualPhotoPosition(spatial, invalid), null);
});

test('unplaced begin/end is a no-op; apply publishes once and counts/features change immediately', () => {
  const session = setup();
  const id = session.importFiles([new File(['a'], 'a.jpg')]).acceptedIds[0], layer = session.createLayer();
  let publishes = 0; const unsubscribe = session.subscribe(() => publishes++);
  const ticket = session.beginPhotoEdits(layer.id);
  assert.equal(session.getPhoto(id).spatial.current, null);
  session.endPhotoEdits(ticket);
  assert.equal(publishes, 0, 'begin/end never publish');
  assert.equal(session.applyPhotoEdits(ticket, [{ photoId: id, position: moved }]).ok, false);
  const next = session.beginPhotoEdits(layer.id);
  assert.equal(session.applyPhotoEdits(next, [{ photoId: id, position: moved }]).ok, true);
  assert.equal(publishes, 1); unsubscribe();
  assert.equal(session.getLayer(layer.id).placedCount, 1);
  assert.equal(buildPhotoMapFeatures([session.getLayer(layer.id)], session.getLayerPhotos).length, 1);
  assert.equal(session.applyPhotoEdits(next, [{ photoId: id, position: originalPosition }]).ok, false, 'session consumed once');
  session.clear();
});

test('ending a move keeps exact current; repeated manual/source switching preserves evidence, Files, preview and other members', async () => {
  const session = setup(); const { layer, ids } = await layerWithSources(session);
  const before = session.getPhoto(ids[0]); const file = session.getFile(ids[0]); const other = session.getPhoto(ids[1]);
  const ticket = session.beginPhotoEdits(layer.id);
  assert.strictEqual(ticket.baseline[ids[0]].current, before.spatial.current);
  session.endPhotoEdits(ticket);
  assert.strictEqual(session.getPhoto(ids[0]).spatial.current, before.spatial.current);
  const evidence = before.spatial.candidates;
  for (let i = 0; i < 3; i++) {
    assert.equal(move(session, layer.id, ids[0], moved).ok, true);
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

for (const action of ['remove', 'delete', 'reset', 'current-change', 'explicit-end']) test(`stale move rejected after ${action}`, async () => {
  const session = setup(); const { layer, ids } = await layerWithSources(session);
  const ticket = session.beginPhotoEdits(layer.id);
  if (action === 'remove') session.removeLayerPhotos(layer.id, [ids[0]], { confirmed: true });
  if (action === 'delete') session.deleteLayer(layer.id);
  if (action === 'reset') session.clear();
  if (action === 'current-change') session.acceptCandidates(layer.id, [{ photoId: ids[0], candidateId: `${ids[0]}:exif` }]);
  if (action === 'explicit-end') session.endPhotoEdits(ticket);
  const before = session.getPhoto(ids[0])?.spatial.current;
  const result = session.applyPhotoEdits(ticket, [{ photoId: ids[0], position: moved }]);
  assert.equal(result.ok, false);
  assert.equal(result.error, ['remove', 'current-change'].includes(action) ? 'edit-conflict' : 'session-ended');
  assert.strictEqual(session.getPhoto(ids[0])?.spatial.current, before);
  session.clear();
});

test('invalid, fabricated, foreign-session and wrong-owner requests cannot write current', async () => {
  const session = setup(); const { layer, ids } = await layerWithSources(session);
  const otherSession = setup(); const other = await layerWithSources(otherSession);
  assert.equal(session.beginPhotoEdits('missing'), null);
  const ticket = session.beginPhotoEdits(layer.id);
  assert.equal(session.applyPhotoEdits({ ...ticket }, [{ photoId: ids[0], position: moved }]).ok, false);
  assert.equal(session.applyPhotoEdits(otherSession.beginPhotoEdits(other.layer.id), [{ photoId: other.ids[0], position: moved }]).ok, false);
  assert.equal(session.applyPhotoEdits(ticket, [{ photoId: 'not-a-member', position: moved }]).error, 'edit-conflict', 'non-member occurrence is never in this baseline');
  assert.equal(session.applyPhotoEdits(ticket, [{ photoId: ids[0], position: { ...moved, latitude: 91 } }]).error, 'invalid-change');
  assert.equal(session.applyPhotoEdits(ticket, [{ photoId: ids[0], position: moved }, { photoId: ids[0], degrees: 9 }]).error, 'invalid-change', 'duplicate occurrence');
  assert.strictEqual(session.getPhoto(ids[0]).spatial.current, ticket.baseline[ids[0]].current);
  assert.equal(session.applyPhotoEdits(ticket, [{ photoId: ids[0], position: moved }]).ok, true);
  session.clear(); otherSession.clear();
});

test('invalid change anywhere fails before any write (no partial apply)', async () => {
  const session = setup(); const { layer, ids } = await layerWithSources(session);
  const ticket = session.beginPhotoEdits(layer.id);
  const before = ids.map((id) => session.getPhoto(id).spatial.current);
  assert.equal(session.applyPhotoEdits(ticket, [{ photoId: ids[0], position: moved }, { photoId: ids[1], degrees: NaN }]).error, 'invalid-change');
  assert.deepEqual(ids.map((id) => session.getPhoto(id).spatial.current), before);
  assert(session.photoEditsAreLive(ticket));
  session.clear();
});

test('late EXIF and thumbnails preserve manual current and do not invalidate a live session', async () => {
  const thumbnail = deferred(), gps = deferred(); let started = 0;
  const session = setup({ createThumbnail: () => { started++; return thumbnail.promise; }, extractGps: () => { started++; return gps.promise; } });
  const id = session.importFiles([new File(['original'], 'a.jpg')]).acceptedIds[0], layer = session.createLayer();
  await until(() => started === 2);
  const ticket = session.beginPhotoEdits(layer.id);
  gps.resolve({ state: 'viable', candidate: { status: 'viable', position: originalPosition } });
  await until(() => session.getPhoto(id).spatial.exifRead.state === 'viable');
  assert(session.photoEditsAreLive(ticket));
  assert.equal(session.applyPhotoEdits(ticket, [{ photoId: id, position: moved }]).ok, true);
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
  assert.equal(move(session, layer.id, id, moved).ok, true);
  const current = session.getPhoto(id).spatial.current;
  gps.resolve({ state: 'viable', candidate: { status: 'viable', position: originalPosition } });
  thumbnail.resolve({ dimensions: { width: 1, height: 1 }, thumbnailBlob: new Blob(['thumb']) });
  await until(() => session.getPhoto(id).spatial.exifRead.state === 'viable' && session.getPhoto(id).preview.state === 'ready');
  assert.strictEqual(session.getPhoto(id).spatial.current, current);
  assert.equal(session.getPhoto(id).spatial.candidates.length, 1);
  session.clear();
});
