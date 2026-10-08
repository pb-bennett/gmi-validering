import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { acceptManualPhotoDirection, normalizePhotoDirection, photoDirectionLabel } from '../src/lib/photos/photoDirection.mjs';
import { cameraMarkerOptions, proposalMarkerOptions } from '../src/lib/photos/photoMarkerPresentation.mjs';
import { planPhotoPositioning, photoPositioningRequests } from '../src/lib/photos/photoPositioning.mjs';

const point = { crs: 'EPSG:4326', longitude: 10.43, latitude: 59.22 };
const raw = { fotolink: 'a.jpg', direction: { valueText: '0', unitText: 'grader', referenceText: 'nord' } };
const source = { entries: [{ id: 'entry', status: 'viable', position: point, raw }] };
const tick = () => new Promise(resolve => setImmediate(resolve));
const until = async condition => { for (let i = 0; i < 1000; i++) { if (condition()) return; await tick(); } assert.fail('Timed out'); };
function setup(options = {}) {
  let serial = 0;
  return createPhotoSession({ createId: () => `id-${++serial}`, yieldJob: tick,
    createThumbnail: async () => ({ thumbnailBlob: new Blob(['thumb']), dimensions: { width: 1, height: 1 } }),
    extractGps: async () => ({ state: 'viable', candidate: { status: 'viable', position: { ...point, longitude: 10.431 } } }),
    parseGml: async () => source, ...options });
}
async function createLayer(session) {
  const ids = session.importFiles(['a.jpg', 'b.jpg'].map(name => new File(['original'], name))).acceptedIds;
  await session.importPositioningGml(new File(['gml'], 'positions.gml'));
  const layer = session.createLayer();
  await until(() => session.getLayerPhotos(layer.id).every(photo => photo.preview.state === 'ready' && photo.spatial.exifRead.state !== 'pending'));
  return { layer, ids };
}

test('direction normalization distinguishes unknown from explicit north and freezes manual provenance', () => {
  for (const [input, expected] of [[0, 0], [359, 359], [360, 0], [-1, 359], [-360, 0], [721, 1], [41.6, 42], [359.8, 0]]) {
    assert.equal(normalizePhotoDirection(input), expected);
    const direction = acceptManualPhotoDirection(input, 1234);
    assert.deepEqual(direction, { current: { degrees: expected, basis: { kind: 'manual' }, acceptance: 'manual', acceptedAt: 1234 } });
    assert(Object.isFrozen(direction) && Object.isFrozen(direction.current) && Object.isFrozen(direction.current.basis));
  }
  for (const invalid of [null, undefined, NaN, Infinity, -Infinity, '42', {}, true]) {
    assert.equal(normalizePhotoDirection(invalid), null);
    assert.equal(acceptManualPhotoDirection(invalid), null);
  }
  assert.equal(photoDirectionLabel(null), 'Ikke angitt');
  for (const [degrees, label] of [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']]) {
    assert.equal(photoDirectionLabel(degrees), `${degrees}° ${label}`);
  }
});

test('legacy GML raw zero stays evidence; begin/cancel unknown writes nothing; apply north publishes exactly once', async () => {
  const session = setup(), { layer, ids } = await createLayer(session);
  assert(session.getLayerPhotos(layer.id).every(photo => photo.direction.current === null));
  const before = session.getPhoto(ids[0]), ticket = session.beginDirectionEdit(layer.id, ids[0]);
  assert.equal(ticket.expectedCurrent?.degrees ?? 0, 0, 'temporary editor starts north');
  assert.strictEqual(session.getPhoto(ids[0]).direction, before.direction);
  session.cancelDirectionEdit(ticket);
  assert.equal(session.getPhoto(ids[0]).direction.current, null);
  assert.equal(session.applyDirectionEdit(ticket, 0).ok, false);
  const next = session.beginDirectionEdit(layer.id, ids[0]);
  let publications = 0; const unsubscribe = session.subscribe(() => publications++);
  assert.equal(session.applyDirectionEdit(next, 0).ok, true);
  assert.equal(publications, 1); unsubscribe();
  const photo = session.getPhoto(ids[0]);
  assert.equal(photo.direction.current.degrees, 0);
  assert.strictEqual(photo.spatial, before.spatial);
  assert.deepEqual(photo.spatial.candidates.find(candidate => candidate.kind === 'gml').raw, raw);
  assert.equal(session.applyDirectionEdit(next, 90).ok, false, 'consumed once');
  assert.strictEqual(session.getPhoto(ids[1]).direction.current, null);
  session.clear();
});

test('known direction begin/proposal/cancel retains exact 42; apply 90 changes only direction', async () => {
  const session = setup(), { layer, ids } = await createLayer(session);
  session.applyDirectionEdit(session.beginDirectionEdit(layer.id, ids[0]), 42);
  const before = session.getPhoto(ids[0]), ticket = session.beginDirectionEdit(layer.id, ids[0]);
  assert.equal(ticket.expectedCurrent.degrees, 42);
  // Temporary slider proposals are UI values, never domain writes.
  for (const proposed of [90, 180, 270, 359]) {
    assert.equal(normalizePhotoDirection(proposed), proposed);
    assert.strictEqual(session.getPhoto(ids[0]).direction, before.direction);
  }
  session.cancelDirectionEdit(ticket);
  assert.strictEqual(session.getPhoto(ids[0]).direction, before.direction);
  assert(session.applyDirectionEdit(session.beginDirectionEdit(layer.id, ids[0]), 90).ok);
  const after = session.getPhoto(ids[0]);
  assert.equal(after.direction.current.degrees, 90);
  for (const key of ['spatial', 'preview', 'dimensions']) assert.strictEqual(after[key], before[key]);
  session.clear();
});

test('manual move, candidate acceptance, GML/EXIF wizard and source attachment retain the exact accepted direction', async () => {
  const session = setup(), { layer, ids } = await createLayer(session);
  session.applyDirectionEdit(session.beginDirectionEdit(layer.id, ids[0]), 42);
  const direction = session.getPhoto(ids[0]).direction;
  const preserved = () => assert.strictEqual(session.getPhoto(ids[0]).direction, direction);
  session.applyManualPlacement(session.beginManualPlacement(layer.id, ids[0]), { ...point, longitude: 10.432 }); preserved();
  for (const kind of ['gml', 'exif']) {
    const candidate = session.getPhoto(ids[0]).spatial.candidates.find(candidate => candidate.kind === kind);
    session.acceptCandidates(layer.id, [{ photoId: ids[0], candidateId: candidate.id }]); preserved();
    if (kind === 'gml') session.recheckLayerSource(layer.id, layer.spatialSources[0].id);
    const plan = planPhotoPositioning(session.getLayerPhotos(layer.id), { kind, source: kind === 'gml' ? session.getSnapshot().sourceReviews[layer.id].source : null });
    assert(session.applyPhotoPositioning(layer.id, { kind, sourceId: plan.sourceId, memberIds: plan.memberIds,
      requests: photoPositioningRequests(plan, [ids[0]]) }).ok); preserved();
  }
  const ticket = session.beginDirectionEdit(layer.id, ids[0]);
  session.acceptCandidates(layer.id, [{ photoId: ids[0], candidateId: session.getPhoto(ids[0]).spatial.candidates.find(candidate => candidate.kind === 'gml').id }]);
  assert(session.directionEditIsLive(ticket), 'position identity is independent of direction');
  const position = session.getPhoto(ids[0]).spatial;
  session.applyDirectionEdit(ticket, 90);
  assert.strictEqual(session.getPhoto(ids[0]).spatial, position);
  session.clear();
});

for (const action of ['remove', 'delete', 'reset', 'hidden', 'cancel', 'new-direction', 'start-placement']) test(`direction stale apply rejected after ${action}`, async () => {
  const session = setup(), { layer, ids } = await createLayer(session);
  const ticket = session.beginDirectionEdit(layer.id, ids[0]);
  if (action === 'remove') session.removeLayerPhotos(layer.id, [ids[0]], { confirmed: true });
  if (action === 'delete') session.deleteLayer(layer.id);
  if (action === 'reset') session.clear();
  if (action === 'hidden') { session.setLayerVisibility(layer.id, false); session.setLayerVisibility(layer.id, true); }
  if (action === 'cancel') session.cancelDirectionEdit(ticket);
  if (action === 'new-direction') session.beginDirectionEdit(layer.id, ids[0]);
  if (action === 'start-placement') session.beginManualPlacement(layer.id, ids[0]);
  const before = session.getPhoto(ids[0])?.direction;
  assert.equal(session.directionEditIsLive(ticket), false);
  assert.equal(session.applyDirectionEdit(ticket, 90).ok, false);
  assert.strictEqual(session.getPhoto(ids[0])?.direction, before);
  session.clear();
});

test('starting direction cancels placement at domain boundary; fabricated/foreign/wrong-owner/nonfinite applies rejected', async () => {
  const session = setup(), { layer, ids } = await createLayer(session);
  const other = setup(), otherLayer = await createLayer(other);
  const placement = session.beginManualPlacement(layer.id, ids[0]);
  const ticket = session.beginDirectionEdit(layer.id, ids[0]);
  assert.equal(session.applyManualPlacement(placement, point).ok, false);
  assert.equal(session.beginDirectionEdit('missing', ids[0]), null);
  assert.equal(session.beginDirectionEdit(layer.id, 'missing'), null);
  assert.equal(session.applyDirectionEdit({ ...ticket }, 90).ok, false);
  assert.equal(session.applyDirectionEdit(other.beginDirectionEdit(otherLayer.layer.id, otherLayer.ids[0]), 90).ok, false);
  for (const degrees of [NaN, Infinity, -Infinity, null, '90']) assert.equal(session.applyDirectionEdit(ticket, degrees).error, 'invalid-direction');
  assert.equal(session.getPhoto(ids[0]).direction.current, null);
  assert(session.applyDirectionEdit(ticket, 360).ok);
  assert.equal(session.getPhoto(ids[0]).direction.current.degrees, 0);
  session.clear(); other.clear();
});

test('late metadata/thumbnail completion does not invalidate direction or overwrite accepted manual north', async () => {
  let finishGps, finishThumbnail, started = 0;
  const gps = new Promise(resolve => { finishGps = resolve; });
  const thumbnail = new Promise(resolve => { finishThumbnail = resolve; });
  const session = setup({ extractGps: () => { started++; return gps; }, createThumbnail: () => { started++; return thumbnail; } });
  const id = session.importFiles([new File(['original'], 'a.jpg')]).acceptedIds[0], layer = session.createLayer();
  await until(() => started === 2);
  const ticket = session.beginDirectionEdit(layer.id, id);
  finishGps({ state: 'viable', candidate: { status: 'viable', position: point } });
  await until(() => session.getPhoto(id).spatial.exifRead.state === 'viable');
  assert(session.directionEditIsLive(ticket));
  session.applyDirectionEdit(ticket, 0);
  const direction = session.getPhoto(id).direction;
  finishThumbnail({ thumbnailBlob: new Blob(['thumb']), dimensions: { width: 1, height: 1 } });
  await until(() => session.getPhoto(id).preview.state === 'ready');
  assert.strictEqual(session.getPhoto(id).direction, direction);
  assert.equal(direction.current.degrees, 0);
  session.clear();
});

test('unknown/unselected icons have no north arrow; all variants retain geometric center anchors', () => {
  for (const selected of [false, true]) {
    assert(!cameraMarkerOptions({ selected }).html.includes('photo-direction-indicator'));
  }
  assert(!cameraMarkerOptions({ degrees: 0 }).html.includes('photo-direction-indicator'));
  for (const degrees of [0, 90, 180, 270]) {
    assert(cameraMarkerOptions({ selected: true, degrees }).html.includes(`rotate(${degrees} 32 32)`));
  }
  for (const options of [cameraMarkerOptions(), cameraMarkerOptions({ selected: true }), cameraMarkerOptions({ selected: true, degrees: 90 }), proposalMarkerOptions]) {
    assert.deepEqual(options.iconAnchor, options.iconSize.map(size => size / 2));
  }
});
