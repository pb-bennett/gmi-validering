import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { acceptManualPhotoDirection, normalizePhotoDirection, photoDirectionCompassWord, photoDirectionLabel, photoDirectionSpokenLabel } from '../src/lib/photos/photoDirection.mjs';
import { cameraMarkerOptions, photoDirectionMarkerOptions, thumbnailMarkerOptions } from '../src/lib/photos/photoMarkerPresentation.mjs';
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
const edit = (session, layerId, photoId, change) => session.applyPhotoEdits(session.beginPhotoEdits(layerId), [{ photoId, ...change }]);

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
});

test('direction labels use Norwegian compass letters and spoken words', async () => {
  assert.equal(photoDirectionLabel(null), 'Ikke angitt');
  assert.equal(photoDirectionSpokenLabel(null), 'Ikke angitt');
  assert.equal(photoDirectionCompassWord(null), null);
  const expected = [[0, 'N', 'nord'], [45, 'NØ', 'nordøst'], [90, 'Ø', 'øst'], [135, 'SØ', 'sørøst'], [180, 'S', 'sør'],
    [225, 'SV', 'sørvest'], [270, 'V', 'vest'], [315, 'NV', 'nordvest'], [359, 'N', 'nord']];
  for (const [degrees, letters, word] of expected) {
    assert.equal(photoDirectionLabel(degrees), `${degrees}° ${letters}`);
    assert.equal(photoDirectionCompassWord(degrees), word);
    assert.equal(photoDirectionSpokenLabel(degrees), `${degrees} grader, ${word}`);
  }
  assert.equal(photoDirectionLabel(123), '123° SØ');
  assert.equal(photoDirectionLabel(359.875), '0° N', 'whole degrees on screen; the value itself keeps its precision');
  assert.equal(photoDirectionLabel(22.5), '23° NØ');
  assert.equal(photoDirectionLabel(360), '0° N');
  assert.equal(photoDirectionSpokenLabel(1), '1 grad, nord');
  const module = await readFile(new URL('../src/lib/photos/photoDirection.mjs', import.meta.url), 'utf8');
  for (const english of ["'NE'", "'SE'", "'SW'", "'NW'", "'E'", "'W'"]) assert(!module.includes(english), english);
});

test('a default is recorded as one; begin/end writes nothing; staged north applies and publishes exactly once', async () => {
  const session = setup(), { layer, ids } = await createLayer(session);
  assert(session.getLayerPhotos(layer.id).every(photo => photo.direction.current.basis.kind === 'default'));
  const before = session.getPhoto(ids[0]), ticket = session.beginPhotoEdits(layer.id);
  assert.strictEqual(ticket.baseline[ids[0]].direction, before.direction.current);
  assert.strictEqual(session.getPhoto(ids[0]).direction, before.direction);
  session.endPhotoEdits(ticket);
  assert.strictEqual(session.getPhoto(ids[0]).direction, before.direction);
  assert.equal(session.applyPhotoEdits(ticket, [{ photoId: ids[0], degrees: 0 }]).error, 'session-ended');
  const next = session.beginPhotoEdits(layer.id);
  let publications = 0; const unsubscribe = session.subscribe(() => publications++);
  assert.equal(session.applyPhotoEdits(next, [{ photoId: ids[0], degrees: 0 }]).ok, true);
  assert.equal(publications, 1); unsubscribe();
  const photo = session.getPhoto(ids[0]);
  assert.equal(photo.direction.current.degrees, 0);
  assert.equal(photo.direction.current.basis.kind, 'manual');
  assert.strictEqual(photo.spatial, before.spatial);
  assert.deepEqual(photo.spatial.candidates.find(candidate => candidate.kind === 'gml').raw, raw);
  assert.equal(session.applyPhotoEdits(next, [{ photoId: ids[0], degrees: 90 }]).ok, false, 'consumed once');
  assert.equal(session.getPhoto(ids[1]).direction.current.basis.kind, 'default');
  session.clear();
});

test('known direction retains exact 42 until commit; apply 90 changes only direction', async () => {
  const session = setup(), { layer, ids } = await createLayer(session);
  assert(edit(session, layer.id, ids[0], { degrees: 42 }).ok);
  const before = session.getPhoto(ids[0]), ticket = session.beginPhotoEdits(layer.id);
  assert.strictEqual(ticket.baseline[ids[0]].direction, before.direction.current);
  // Staged values live outside the session; nothing is written before apply.
  for (const proposed of [90, 180, 270, 359]) {
    assert.equal(normalizePhotoDirection(proposed), proposed);
    assert.strictEqual(session.getPhoto(ids[0]).direction, before.direction);
  }
  session.endPhotoEdits(ticket);
  assert.strictEqual(session.getPhoto(ids[0]).direction, before.direction);
  assert(edit(session, layer.id, ids[0], { degrees: 90 }).ok);
  const after = session.getPhoto(ids[0]);
  assert.equal(after.direction.current.degrees, 90);
  for (const key of ['spatial', 'preview', 'dimensions']) assert.strictEqual(after[key], before[key]);
  session.clear();
});

test('manual move, candidate acceptance, GML/EXIF wizard and source attachment retain the exact accepted direction', async () => {
  const session = setup(), { layer, ids } = await createLayer(session);
  assert(edit(session, layer.id, ids[0], { degrees: 42 }).ok);
  const direction = session.getPhoto(ids[0]).direction;
  const preserved = () => assert.strictEqual(session.getPhoto(ids[0]).direction, direction);
  assert(edit(session, layer.id, ids[0], { position: { ...point, longitude: 10.432 } }).ok); preserved();
  for (const kind of ['gml', 'exif']) {
    const candidate = session.getPhoto(ids[0]).spatial.candidates.find(candidate => candidate.kind === kind);
    session.acceptCandidates(layer.id, [{ photoId: ids[0], candidateId: candidate.id }]); preserved();
    if (kind === 'gml') session.recheckLayerSource(layer.id, layer.spatialSources[0].id);
    const plan = planPhotoPositioning(session.getLayerPhotos(layer.id), { kind, source: kind === 'gml' ? session.getSnapshot().sourceReviews[layer.id].source : null });
    assert(session.applyPhotoPositioning(layer.id, { kind, sourceId: plan.sourceId, memberIds: plan.memberIds,
      requests: photoPositioningRequests(plan, [ids[0]]) }).ok); preserved();
  }
  // A canonical position change after begin conflicts even for a direction-only change; nothing is written.
  const ticket = session.beginPhotoEdits(layer.id);
  session.acceptCandidates(layer.id, [{ photoId: ids[0], candidateId: session.getPhoto(ids[0]).spatial.candidates.find(candidate => candidate.kind === 'gml').id }]);
  assert(session.photoEditsAreLive(ticket), 'a canonical change elsewhere does not end the session');
  const spatial = session.getPhoto(ids[0]).spatial;
  const conflict = session.applyPhotoEdits(ticket, [{ photoId: ids[0], degrees: 90 }]);
  assert.equal(conflict.error, 'edit-conflict');
  assert.deepEqual(conflict.staleIds, [ids[0]]);
  preserved(); assert.strictEqual(session.getPhoto(ids[0]).spatial, spatial);
  assert(session.applyPhotoEdits(ticket, [{ photoId: ids[1], degrees: 90 }]).ok, 'an unaffected occurrence still commits');
  preserved(); assert.strictEqual(session.getPhoto(ids[0]).spatial, spatial);
  session.clear();
});

for (const action of ['remove', 'delete', 'reset', 'end', 'new-session', 'direction-change']) test(`direction stale apply rejected after ${action}`, async () => {
  const session = setup(), { layer, ids } = await createLayer(session);
  const ticket = session.beginPhotoEdits(layer.id);
  if (action === 'remove') session.removeLayerPhotos(layer.id, [ids[0]], { confirmed: true });
  if (action === 'delete') session.deleteLayer(layer.id);
  if (action === 'reset') session.clear();
  if (action === 'end') session.endPhotoEdits(ticket);
  if (action === 'new-session') session.beginPhotoEdits(layer.id);
  if (action === 'direction-change') session.fillMissingPhotoValues(layer.id, 'direction', 12, [ids[0]]);
  const before = session.getPhoto(ids[0])?.direction;
  const result = session.applyPhotoEdits(ticket, [{ photoId: ids[0], degrees: 90 }]);
  assert.equal(result.ok, false);
  if (['remove', 'direction-change'].includes(action)) {
    assert.equal(result.error, 'edit-conflict'); assert.deepEqual(result.staleIds, [ids[0]]);
    assert(session.photoEditsAreLive(ticket), 'a conflict writes nothing and keeps the session for the user to resolve');
  } else assert.equal(session.photoEditsAreLive(ticket), false);
  assert.strictEqual(session.getPhoto(ids[0])?.direction, before);
  session.clear();
});

test('visibility no longer participates in liveness; fabricated/foreign/wrong-owner/nonfinite applies rejected', async () => {
  const session = setup(), { layer, ids } = await createLayer(session);
  const other = setup(), otherLayer = await createLayer(other);
  const ticket = session.beginPhotoEdits(layer.id);
  session.setLayerVisibility(layer.id, false); session.setLayerVisibility(layer.id, true);
  assert(session.photoEditsAreLive(ticket), 'Edit mode forces visibility; a toggle is not a data conflict');
  assert.equal(session.beginPhotoEdits('missing'), null);
  assert.equal(session.applyPhotoEdits({ ...ticket }, [{ photoId: ids[0], degrees: 90 }]).error, 'session-ended');
  assert.equal(session.applyPhotoEdits(other.beginPhotoEdits(otherLayer.layer.id), [{ photoId: otherLayer.ids[0], degrees: 90 }]).ok, false);
  assert.equal(session.applyPhotoEdits(ticket, [{ photoId: 'missing', degrees: 90 }]).error, 'edit-conflict');
  for (const degrees of [NaN, Infinity, -Infinity, '90']) assert.equal(session.applyPhotoEdits(ticket, [{ photoId: ids[0], degrees }]).error, 'invalid-change');
  assert.equal(session.applyPhotoEdits(ticket, [{ photoId: ids[0] }]).error, 'invalid-change');
  assert.equal(session.getPhoto(ids[0]).direction.current.basis.kind, 'default');
  assert(session.applyPhotoEdits(ticket, [{ photoId: ids[0], degrees: 360 }]).ok);
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
  const ticket = session.beginPhotoEdits(layer.id);
  finishGps({ state: 'viable', candidate: { status: 'viable', position: point } });
  await until(() => session.getPhoto(id).spatial.exifRead.state === 'viable');
  assert(session.photoEditsAreLive(ticket));
  assert(session.applyPhotoEdits(ticket, [{ photoId: id, degrees: 0 }]).ok);
  const direction = session.getPhoto(id).direction;
  finishThumbnail({ thumbnailBlob: new Blob(['thumb']), dimensions: { width: 1, height: 1 } });
  await until(() => session.getPhoto(id).preview.state === 'ready');
  assert.strictEqual(session.getPhoto(id).direction, direction);
  assert.equal(direction.current.degrees, 0);
  session.clear();
});

test('unknown direction draws no arrow; any known direction draws one in every mode, selected or not', () => {
  for (const selected of [false, true]) {
    assert.equal(photoDirectionMarkerOptions('markers', { selected }), null);
    assert.equal(photoDirectionMarkerOptions('thumbnails', { selected }), null);
    for (const degrees of [0, 45, 90, 135, 180, 270]) {
      assert(photoDirectionMarkerOptions('markers', { selected, degrees }).html.includes(`rotate(${degrees} 32 32)`));
      assert(photoDirectionMarkerOptions('thumbnails', { selected, degrees }).html.includes(`rotate(${degrees} 50 50)`));
      // The arrow is its own marker: a photo icon never carries one, whatever its direction.
      assert(!cameraMarkerOptions({ selected, degrees }).html.includes('photo-direction-indicator'));
      assert(!thumbnailMarkerOptions({ selected, degrees }).html.includes('photo-direction-indicator'));
    }
  }
  for (const options of [cameraMarkerOptions(), cameraMarkerOptions({ selected: true }), cameraMarkerOptions({ selected: true, degrees: 90 }), thumbnailMarkerOptions({ degrees: 90 })]) {
    assert.deepEqual(options.iconAnchor, options.iconSize.map(size => size / 2));
  }
});
