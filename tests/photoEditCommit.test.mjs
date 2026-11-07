import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { createPhotoEditState, effectivePhoto, photoEditChanges, photoEditReducer } from '../src/lib/photos/photoEditSession.mjs';
import { capturePhotoExportSnapshot } from '../src/lib/photos/export/photoExportPlan.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';

const at = (longitude, latitude = 59.22) => ({ crs: 'EPSG:4326', longitude, latitude });
const source = { entries: [{ id: 'entry', status: 'viable', position: at(10.43), raw: { fotolink: 'a.jpg' } }] };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const until = async (condition) => { for (let i = 0; i < 1000; i++) { if (condition()) return; await tick(); } assert.fail('Timed out'); };
function setup(options = {}) {
  let serial = 0;
  return createPhotoSession({ createId: () => `id-${++serial}`, yieldJob: tick,
    createThumbnail: async () => ({ thumbnailBlob: new Blob(['thumb']), dimensions: { width: 1, height: 1 } }),
    extractGps: async () => ({ state: 'viable', candidate: { status: 'viable', position: at(10.431) } }),
    parseGml: async () => source, ...options });
}
async function placedLayer(session) {
  const ids = session.importFiles(['a.jpg', 'b.jpg', 'c.jpg'].map((name) => new File(['original'], name))).acceptedIds;
  await session.importPositioningGml(new File(['gml'], 'positions.gml'));
  const layer = session.createLayer();
  await until(() => session.getLayerPhotos(layer.id).every((photo) => photo.spatial.exifRead.state !== 'pending'));
  // a: GML-accepted; b: EXIF-accepted; c: unplaced.
  session.acceptCandidates(layer.id, [{ photoId: ids[0], candidateId: session.getPhoto(ids[0]).spatial.candidates.find((item) => item.kind === 'gml').id },
    { photoId: ids[1], candidateId: `${ids[1]}:exif` }]);
  return { layer: session.getLayer(layer.id), ids };
}
const stage = (state, photoId, field, value) => photoEditReducer(state, { type: 'stage', photoId, field, value, at: Date.now() });

test('begin requires an existing non-empty layer; staging never writes or publishes canonical state', async () => {
  const session = setup(), { layer, ids } = await placedLayer(session);
  assert.equal(session.beginPhotoEdits('missing'), null);
  session.importFiles([new File(['x'], 'x.jpg')]);
  const snapshot = session.getSnapshot();
  let publishes = 0; const unsubscribe = session.subscribe(() => publishes++);
  const ticket = session.beginPhotoEdits(layer.id);
  assert(Object.isFrozen(ticket) && Object.isFrozen(ticket.baseline));
  const photosBefore = session.getLayerPhotos(layer.id);
  const exportBefore = JSON.stringify(capturePhotoExportSnapshot(session, layer.id).occurrences.map((item) => [item.current, item.direction]));
  let state = createPhotoEditState(ticket);
  state = stage(state, ids[0], 'position', at(10.5));
  state = stage(state, ids[0], 'direction', 90);
  state = stage(state, ids[2], 'position', at(10.6));
  assert.equal(publishes, 0);
  assert.strictEqual(session.getSnapshot(), snapshot, 'snapshot identity unchanged');
  session.getLayerPhotos(layer.id).forEach((photo, index) => {
    assert.strictEqual(photo.spatial.current, photosBefore[index].spatial.current);
    assert.strictEqual(photo.direction.current, photosBefore[index].direction.current);
  });
  const exportAfter = JSON.stringify(capturePhotoExportSnapshot(session, layer.id).occurrences.map((item) => [item.current, item.direction]));
  assert.equal(exportAfter, exportBefore, 'export can never see staged coordinates');
  // Discard: ending the session leaves canonical state exactly as it was.
  session.endPhotoEdits(ticket);
  assert.equal(publishes, 0); assert.strictEqual(session.getSnapshot(), snapshot);
  assert.deepEqual(session.getLayerPhotos(layer.id).map((photo) => [photo.spatial.current, photo.direction.current]),
    photosBefore.map((photo) => [photo.spatial.current, photo.direction.current]));
  unsubscribe(); session.clear();
});

test('save applies every staged change with one publish, shared acceptedAt and manual basis, preserving evidence', async () => {
  const session = setup(), { layer, ids } = await placedLayer(session);
  const before = Object.fromEntries(ids.map((id) => [id, session.getPhoto(id)]));
  const ticket = session.beginPhotoEdits(layer.id);
  let state = createPhotoEditState(ticket);
  state = stage(state, ids[0], 'position', at(10.5));
  state = stage(state, ids[1], 'direction', 271);
  state = stage(state, ids[2], 'position', at(10.6));
  state = stage(state, ids[2], 'direction', 45);
  let publishes = 0; const unsubscribe = session.subscribe(() => publishes++);
  const result = session.applyPhotoEdits(ticket, photoEditChanges(state));
  assert(result.ok); assert.deepEqual(result.changedIds.sort(), [...ids].sort());
  assert.equal(publishes, 1); unsubscribe();
  const [a, b, c] = ids.map((id) => session.getPhoto(id));
  assert.deepEqual(a.spatial.current.position, at(10.5));
  assert.equal(a.spatial.current.basis.kind, 'manual'); assert.equal(a.spatial.current.acceptance, 'manual');
  assert.strictEqual(a.spatial.candidates, before[ids[0]].spatial.candidates, 'GML/EXIF evidence and candidates are kept');
  assert.strictEqual(a.direction, before[ids[0]].direction, 'untouched field keeps identity');
  assert.strictEqual(b.spatial.current, before[ids[1]].spatial.current, 'direction-only change keeps the accepted EXIF position');
  assert.equal(b.direction.current.degrees, 271); assert.equal(b.direction.current.basis.kind, 'manual');
  assert.deepEqual(b.directionEvidence, before[ids[1]].directionEvidence);
  assert.equal(c.spatial.current.basis.kind, 'manual', 'an unplaced occurrence becomes placed');
  assert.equal(c.direction.current.degrees, 45, 'a manual direction replaces the default');
  assert.equal(session.getLayer(layer.id).placedCount, 3);
  const times = new Set([a.spatial.current.acceptedAt, b.direction.current.acceptedAt, c.spatial.current.acceptedAt, c.direction.current.acceptedAt]);
  assert.equal(times.size, 1, 'one save shares one acceptedAt');
  assert.equal(session.photoEditsAreLive(ticket), false, 'save ends the session; there is no undo into it');
  session.clear();
});

test('conflict on any occurrence prevents every write; dropping stale entries lets the rest commit', async () => {
  const session = setup(), { layer, ids } = await placedLayer(session);
  const ticket = session.beginPhotoEdits(layer.id);
  let state = createPhotoEditState(ticket);
  state = stage(state, ids[0], 'position', at(10.5));
  state = stage(state, ids[1], 'direction', 12);
  // Another tool changes b's accepted direction after the session began.
  assert.equal(session.fillMissingPhotoValues(layer.id, 'direction', 5, [ids[1]]).counts.adopted, 1);
  const snapshot = session.getSnapshot();
  const result = session.applyPhotoEdits(ticket, photoEditChanges(state));
  assert.deepEqual(result, { ok: false, error: 'edit-conflict', staleIds: [ids[1]] });
  assert.strictEqual(session.getSnapshot(), snapshot, 'nothing published');
  assert.notDeepEqual(session.getPhoto(ids[0]).spatial.current.position, at(10.5), 'no partial write');
  state = photoEditReducer(state, { type: 'drop', photoIds: result.staleIds });
  assert(session.applyPhotoEdits(ticket, photoEditChanges(state)).ok);
  assert.deepEqual(session.getPhoto(ids[0]).spatial.current.position, at(10.5));
  assert.equal(session.getPhoto(ids[1]).direction.current.degrees, 5, 'a value written by another tool is never silently overwritten');
  session.clear();
});

test('removed occurrences are stale; clear and deleteLayer end the session; a new begin supersedes the old ticket', async () => {
  const session = setup(), { layer, ids } = await placedLayer(session);
  const first = session.beginPhotoEdits(layer.id);
  session.removeLayerPhotos(layer.id, [ids[2]], { confirmed: true });
  assert.deepEqual(session.applyPhotoEdits(first, [{ photoId: ids[2], degrees: 4 }]).staleIds, [ids[2]]);
  const second = session.beginPhotoEdits(layer.id);
  assert.equal(session.photoEditsAreLive(first), false);
  assert(session.photoEditsAreLive(second));
  assert.equal(session.applyPhotoEdits(first, [{ photoId: ids[0], degrees: 4 }]).error, 'session-ended');
  session.endPhotoEdits(first);
  assert(session.photoEditsAreLive(second), 'ending a superseded ticket never ends the newer session');
  session.deleteLayer(layer.id);
  assert.equal(session.photoEditsAreLive(second), false);
  const again = setup(), other = await placedLayer(again);
  const ticket = again.beginPhotoEdits(other.layer.id);
  again.clear();
  assert.equal(again.photoEditsAreLive(ticket), false);
  assert.equal(again.applyPhotoEdits(ticket, [{ photoId: other.ids[0], degrees: 1 }]).error, 'session-ended');
});

test('a late EXIF completion during the session neither conflicts nor loses the staged move', async () => {
  let finishGps; const gps = new Promise((resolve) => { finishGps = resolve; });
  const session = setup({ extractGps: () => gps });
  const [id] = session.importFiles([new File(['x'], 'late.jpg')]).acceptedIds, layer = session.createLayer();
  const ticket = session.beginPhotoEdits(layer.id);
  let state = stage(createPhotoEditState(ticket), id, 'position', at(10.7));
  finishGps({ state: 'viable', candidate: { status: 'viable', position: at(10.1) } });
  await until(() => session.getPhoto(id).spatial.exifRead.state === 'viable');
  assert(session.photoEditsAreLive(ticket));
  assert.equal(effectivePhoto(session.getPhoto(id), state).spatial.candidates.length, 1, 'the overlay reads fresh evidence');
  assert(session.applyPhotoEdits(ticket, photoEditChanges(state)).ok);
  assert.equal(session.getPhoto(id).spatial.candidates.length, 1);
  assert.deepEqual(session.getPhoto(id).spatial.current.position, at(10.7));
  session.clear();
});

test('repeated GMI occurrences of one asset are committed independently', async () => {
  const session = setup({ parseGml: undefined });
  const [assetId] = session.importFiles([new File(['x'], 'shared.png', { type: 'image/png' })]).acceptedIds;
  const layer = session.createLayer();
  const gmi = new File([gmiText([0, 1].map((i) => ({ label: `K${i}`, hyperlink: 'h:1(link:"shared.png") ', xyz: `${581930 + i * 50} 6566000 1` })))], 'survey.gmi');
  assert(await session.stageLayerSource(layer.id, gmi, 'gmi'));
  const review = session.getSnapshot().sourceReviews[layer.id];
  assert(session.applyGmiAssociations(layer.id, { confirmed: true, sourceId: review.source.id, memberIds: session.getLayer(layer.id).photoIds, associationLedger: review.associationLedger }).ok);
  const occurrences = session.getLayerPhotos(layer.id).filter((photo) => photo.assetId === assetId);
  assert.equal(occurrences.length, 2);
  const sibling = occurrences.find((photo) => photo.id !== occurrences[0].id);
  const ticket = session.beginPhotoEdits(layer.id);
  let state = stage(createPhotoEditState(ticket), occurrences[0].id, 'position', at(10.8));
  state = stage(state, occurrences[0].id, 'direction', 45);
  assert(session.applyPhotoEdits(ticket, photoEditChanges(state)).ok);
  assert.equal(session.getPhoto(occurrences[0].id).direction.current.degrees, 45);
  assert.strictEqual(session.getPhoto(sibling.id).spatial.current, sibling.spatial.current);
  assert.strictEqual(session.getPhoto(sibling.id).direction.current, null);
  assert.strictEqual(session.getPhoto(sibling.id).occurrence, sibling.occurrence);
  session.clear();
});
