import assert from 'node:assert/strict';
import test from 'node:test';
import { planAutoCaptureTime, planAutoDirection, planAutoPhotographer } from '../src/lib/photos/photoAutoMetadata.mjs';
import { emptyCaptureMetadata, normalizeCaptureTime } from '../src/lib/photos/photoCaptureMetadata.mjs';
import { directionsAgree, emptyDirection, exifDirectionEvidence, gmlDirectionEvidence, isDefaultPhotoDirection, photoDirectionLabel } from '../src/lib/photos/photoDirection.mjs';
import { evidenceValuesConflict } from '../src/lib/photos/photoEvidenceAdoption.mjs';
import { planPhotoSourcePositions, photoSourcePositionChoices, selectedPhotoSourcePositions } from '../src/lib/photos/photoPositioning.mjs';
import { photoMissingDirection } from '../src/lib/photos/photoWorkspaceView.mjs';
import { photoDirectionSourceLabel } from '../src/lib/photos/photoPresentation.mjs';
import { completionRecommendations, photoCompletionStatus } from '../src/lib/photos/photoCompletion.mjs';
import { createPhotoExportFlow, photoExportFlowProgress } from '../src/lib/photos/photoExportFlow.mjs';
import { emptyPhotoWorkspace } from '../src/lib/photos/photoWorkspaceState.mjs';
import { createPhotoEditState, photoEditChanges, photoEditReducer } from '../src/lib/photos/photoEditSession.mjs';
import { buildPhotoExportPlan, capturePhotoExportSnapshot } from '../src/lib/photos/export/photoExportPlan.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { acceptGmlPositions, attachGml, evidenceSession, exportedTimes, placeAll, readRealExif, settleExif, tick } from './helpers/photoEvidenceFixtures.mjs';
import { completionGml, completionLayer, completionView, jpeg } from './helpers/photoCompletionFixtures.mjs';

const source = { id: 'source', filename: 'kilde.gml' };
const gml = (valueText, unitText = '1', referenceText = '1') => gmlDirectionEvidence(source, { id: 'entry', raw: { direction: { valueText, unitText, referenceText } } })[0];
const exif = (degrees, ref = 'T') => exifDirectionEvidence({ GPSImgDirection: degrees, GPSImgDirectionRef: ref })[0];
const time = (kind, iso, id = `${kind}:time`) => ({ id, field: 'captureTime', kind, raw: iso, value: normalizeCaptureTime(iso) });
const exifTime = { captureTime: '2026:05:12 14:33:02' };

// Source priority, as a pure rule
test('direction priority: GML, then EXIF, then a default kept apart from a source 0°', () => {
  const plan = (...evidence) => planAutoDirection(emptyDirection(), evidence).current;
  assert.deepEqual([plan(gml('45.5'), exif(90)).degrees, plan(gml('45.5'), exif(90)).basis.kind], [45.5, 'gml']);
  assert.deepEqual([plan(gml('0'), exif(90)).degrees, plan(gml('0'), exif(90)).basis.kind], [0, 'gml'], 'GML 0° is a value like any other');
  assert.deepEqual([plan(exif(90)).degrees, plan(exif(90)).basis.kind], [90, 'exif']);
  assert.deepEqual([plan(gml('45', 'grader', 'nord'), exif(90)).degrees, plan(gml('abc'), exif(90)).basis.kind], [90, 'exif'], 'an unusable GML value falls through');
  assert.equal(plan().degrees, 0); assert.equal(plan().basis.kind, 'default'); assert.equal(plan().acceptance, 'auto');
  assert.equal(plan(exif(90, 'M')).basis.kind, 'default', 'a magnetic heading is not used');
  assert.equal(isDefaultPhotoDirection(plan()), true);
  assert.equal(isDefaultPhotoDirection(plan(gml('0'))), false);
  assert.equal(isDefaultPhotoDirection(plan(exif(0))), false);
});

test('direction: source precision is kept and only the display rounds', () => {
  const accepted = planAutoDirection(emptyDirection(), [gml('123.4567')]).current;
  assert.equal(accepted.degrees, 123.4567);
  assert.equal(accepted.basis.raw.valueText, '123.4567');
  assert.equal(photoDirectionLabel(accepted.degrees), '123° SØ');
  assert.equal(photoDirectionLabel(359.6), '0° N');
});

test('direction: a manual or explicitly chosen value is never replaced, and an automatic one only by a better source', () => {
  for (const acceptance of ['manual', 'source']) assert.equal(planAutoDirection({ current: { degrees: 12, basis: { kind: 'manual' }, acceptance } }, [gml('45')]), null, acceptance);
  const fromExif = planAutoDirection(emptyDirection(), [exif(90)]);
  assert.equal(planAutoDirection(fromExif, [exif(90)]), null, 'the same choice writes nothing, so identities hold');
  assert.equal(planAutoDirection(fromExif, [exif(90), gml('45')]).current.degrees, 45);
  const defaulted = planAutoDirection(emptyDirection(), []);
  assert.equal(planAutoDirection(defaulted, []), null);
  assert.equal(planAutoDirection(defaulted, [exif(90)]).current.basis.kind, 'exif');
});

test('direction: no default while EXIF is being read, but GML does not have to wait', () => {
  assert.equal(planAutoDirection(emptyDirection(), [], { exifPending: true }), null);
  assert.equal(planAutoDirection(emptyDirection(), [gml('45')], { exifPending: true }).current.degrees, 45);
});

test('capture time priority: complete GML, then complete EXIF, and otherwise nothing', () => {
  const plan = (...evidence) => planAutoCaptureTime(emptyCaptureMetadata(), evidence);
  const fullGml = time('gml', '2026-05-12T14:33:02'), fullExif = time('exif', '2026-05-12T09:00:00');
  assert.equal(plan(fullExif, fullGml).value.iso, '2026-05-12T14:33:02');
  assert.equal(plan(fullExif, fullGml).provenance.kind, 'gml');
  assert.equal(plan(fullExif, fullGml).acceptance, 'auto');
  assert.equal(plan(time('gml', '2026-05-12T14:33'), fullExif).provenance.kind, 'exif', 'GML without seconds is not complete');
  assert.equal(plan(time('gml', '2026-05-12')), null, 'a date is not stretched into a time');
  assert.equal(plan(time('exif', '2026-05-12T14:33')), null, 'seconds are never invented');
  assert.equal(plan({ ...time('gml', 'nonsense') }), null);
  assert.equal(plan(), null);
  const zoned = plan(time('gml', '2026-05-12T14:33:02'), time('exif', '2026-05-12T14:33:02+02:00'));
  assert.equal(zoned.value.iso, '2026-05-12T14:33:02'); assert.equal(zoned.value.timezoneKnown, false, 'a timezone is not borrowed from the other source');
});

test('capture time: manual, explicit and removed values stay; automatic ones give way to GML', () => {
  const evidence = [time('gml', '2026-05-12T14:33:02')];
  assert.equal(planAutoCaptureTime({ ...emptyCaptureMetadata(), captureTime: { value: normalizeCaptureTime('2020-01-01T10:00:00'), provenance: { kind: 'manual' } } }, evidence), null);
  assert.equal(planAutoCaptureTime({ ...emptyCaptureMetadata(), captureTime: { value: normalizeCaptureTime('2020-01-01T10:00:00'), provenance: { kind: 'exif', evidenceId: 'x' } } }, evidence), null, 'a chosen source is a decision too');
  assert.equal(planAutoCaptureTime({ ...emptyCaptureMetadata(), captureTimeCleared: true }, evidence), null);
  const fromExif = planAutoCaptureTime(emptyCaptureMetadata(), [time('exif', '2026-05-12T09:00:00')]);
  const metadata = { ...emptyCaptureMetadata(), captureTime: fromExif };
  assert.equal(planAutoCaptureTime(metadata, [time('exif', '2026-05-12T09:00:00')]), null);
  assert.equal(planAutoCaptureTime(metadata, [time('exif', '2026-05-12T09:00:00'), ...evidence]).provenance.kind, 'gml');
});

// Precision-aware, circular comparison
for (const [a, b, agree, why] of [
  [gml('123'), exif(123.4), true, 'whole degrees against decimals'],
  [gml('123'), exif(123.9), true, 'a truncated source'],
  [gml('123.46'), exif(123.4567), true, 'rounded to two decimals'],
  [gml('123.5'), exif(123.456), true, 'rounded to one decimal'],
  [gml('10.1'), exif(10.4), true, 'under half a displayed degree'],
  [gml('0'), exif(359.9), true, 'across north'],
  [gml('359.9'), exif(0.1), true, 'across north, both with decimals'],
  [gml('123'), exif(124), false, 'one whole degree between whole-degree sources'],
  [gml('10.1'), exif(10.9), false, 'more than half a degree between precise sources'],
  [gml('0'), exif(90), false, 'a real difference'],
  [gml('350'), exif(10), false, 'twenty degrees across north'],
]) test(`directions ${a.value} and ${b.value} ${agree ? 'agree' : 'differ'}: ${why}`, () => {
  assert.equal(directionsAgree(a, b), agree);
  assert.equal(directionsAgree(b, a), agree, 'the comparison has no direction of its own');
  assert.equal(evidenceValuesConflict([a, b], 'direction'), !agree);
});

test('capture times that differ only in precision are no conflict', () => {
  const conflict = (...items) => evidenceValuesConflict(items, 'captureTime');
  assert.equal(conflict(time('gml', '2026-05-12T14:33'), time('exif', '2026-05-12T14:33:02')), false);
  assert.equal(conflict(time('gml', '2026-05-12T14:33:02'), time('exif', '2026-05-12T14:33:02.125')), false);
  assert.equal(conflict(time('gml', '2026-05-12'), time('exif', '2026-05-12T14:33:02')), false);
  assert.equal(conflict(time('gml', '2026-05-12T14:33:03'), time('exif', '2026-05-12T14:33:02')), true);
});

// Initial import
test('initial import: GML is read before the layer exists and everything lands on layer creation', async () => {
  const session = evidenceSession();
  try {
    const ids = session.importFiles([jpeg('a.jpg', { ...exifTime, direction: 90, directionRef: 'T' }), jpeg('b.jpg')]).acceptedIds;
    assert(await session.importPositioningGml(completionGml([{ name: 'a.jpg', time: '2026-05-12T14:33:02', direction: '45.25' }, { name: 'b.jpg', direction: '0' }])));
    assert.equal(session.getPhoto(ids[0]).direction.current, null, 'a draft is not a layer yet');
    const layer = session.createLayer();
    await settleExif(session, layer.id);
    const [a, b] = session.getLayerPhotos(layer.id);
    assert.deepEqual([a.direction.current.degrees, a.direction.current.basis.kind, a.captureMetadata.captureTime.provenance.kind], [45.25, 'gml', 'gml']);
    assert.deepEqual([b.direction.current.degrees, b.direction.current.basis.kind, b.captureMetadata.captureTime], [0, 'gml', null]);
  } finally { session.clear(); }
});

test('initial import through the wizard route: GML placement, direction and time in one step', async () => {
  const session = evidenceSession();
  try {
    session.importFiles([jpeg('a.jpg', exifTime)]);
    assert(await session.importPositioningGml(completionGml([{ name: 'a.jpg', direction: '45' }])));
    while (session.getSnapshot().photos.some((photo) => photo.spatial.exifRead.state === 'pending')) await tick();
    const placement = { kind: 'gml', exifFallback: false };
    const result = session.completeImport({ placement, preview: session.previewImport({ placement }) });
    assert.equal(result.ok, true); assert.equal(result.outcome.placed, 1);
    const [photo] = session.getLayerPhotos(result.layer.id);
    assert.equal(photo.direction.current.degrees, 45);
    assert.equal(photo.captureMetadata.captureTime.provenance.kind, 'exif');
  } finally { session.clear(); }
});

test('appended photos get the same treatment, and photos already in the layer are left alone', async () => {
  const { session, layerId, ids: [first] } = await completionLayer([jpeg('a.jpg', exifTime)]);
  try {
    const before = session.getPhoto(first);
    assert(session.beginImport(layerId));
    session.importFiles([jpeg('b.jpg', { ...exifTime, direction: 30, directionRef: 'T' })]);
    while (session.getSnapshot().photos.some((photo) => photo.spatial.exifRead.state === 'pending')) await tick();
    session.appendImport();
    const photos = session.getLayerPhotos(layerId);
    assert.strictEqual(photos[0].direction, before.direction);
    assert.strictEqual(photos[0].captureMetadata.captureTime, before.captureMetadata.captureTime);
    assert.equal(photos[1].direction.current.degrees, 30);
  } finally { session.clear(); }
});

// Late sources
test('late GML matching: defaults and EXIF give way, evidence stays, and repeating it changes nothing', async () => {
  const { session, layerId, ids: [a, b] } = await completionLayer([jpeg('a.jpg', { ...exifTime, direction: 90, directionRef: 'T' }), jpeg('b.jpg')]);
  try {
    assert.deepEqual([a, b].map((id) => session.getPhoto(id).direction.current.basis.kind), ['exif', 'default']);
    await attachGml(session, layerId, completionGml([{ name: 'a.jpg', time: '2026-05-12T15:00:00', direction: '45' }, { name: 'b.jpg', time: '2026-05-12T15:01:00', direction: '10.5' }]));
    const [liveA, liveB] = [a, b].map((id) => session.getPhoto(id));
    assert.deepEqual([liveA.direction.current.degrees, liveA.direction.current.basis.kind], [45, 'gml']);
    assert.deepEqual([liveB.direction.current.degrees, liveB.direction.current.basis.kind], [10.5, 'gml']);
    assert.equal(liveA.captureMetadata.captureTime.value.iso, '2026-05-12T15:00:00');
    assert.deepEqual(liveA.directionEvidence.map((item) => item.kind).sort(), ['exif', 'gml'], 'the original evidence is retained');
    assert(session.recheckLayerSource(layerId, session.getLayer(layerId).spatialSources[0].id));
    assert(session.applyLayerSource(layerId));
    assert.strictEqual(session.getPhoto(a).direction, liveA.direction, 'nothing is rewritten');
  } finally { session.clear(); }
});

test('late GML matching: manual directions, times and positions survive it', async () => {
  const { session, layerId, ids: [a] } = await completionLayer([jpeg('a.jpg', exifTime)]);
  try {
    assert(session.applyPhotoEdits(session.beginPhotoEdits(layerId), [{ photoId: a, degrees: 200, position: { crs: 'EPSG:4326', longitude: 11, latitude: 60 } }]).ok);
    session.setCaptureMetadata(layerId, [a], 'captureTime', '2020-01-01T10:00:00');
    const before = session.getPhoto(a);
    await attachGml(session, layerId, completionGml([{ name: 'a.jpg', time: '2026-05-12T15:00:00', direction: '45' }]));
    const after = session.getPhoto(a);
    assert.strictEqual(after.direction.current, before.direction.current);
    assert.strictEqual(after.captureMetadata.captureTime, before.captureMetadata.captureTime);
    assert.strictEqual(after.spatial.current, before.spatial.current);
    assert.equal(after.metadataEvidence.filter((item) => item.kind === 'gml').length, 1);
  } finally { session.clear(); }
});

test('late EXIF: a default gives way to it, and GML that arrived first keeps its place', async () => {
  const gates = [];
  const session = evidenceSession({ extractGps: async (file) => { await new Promise((resolve) => gates.push(resolve)); return readRealExif(file); } });
  try {
    const ids = session.importFiles([jpeg('a.jpg', { direction: 90, directionRef: 'T' }), jpeg('b.jpg', { direction: 30, directionRef: 'T' })]).acceptedIds;
    const layerId = session.createLayer().id;
    await attachGml(session, layerId, completionGml([{ name: 'a.jpg', direction: '45' }]));
    assert.deepEqual(ids.map((id) => session.getPhoto(id).direction.current?.degrees ?? null), [45, null]);
    for (let turn = 0; turn < 2; turn++) { while (!gates.length) await tick(); gates.shift()(); await tick(); }
    await settleExif(session, layerId);
    assert.deepEqual(ids.map((id) => session.getPhoto(id).direction.current.degrees), [45, 30]);
  } finally { session.clear(); }
});

test('a GMI occurrence created later gets a direction of its own, and a manual value on its sibling stays', async () => {
  const { sharedOriginalLayer } = await import('./helpers/photoCompletionFixtures.mjs');
  const { session, ids } = await sharedOriginalLayer(jpeg('a.jpg', { direction: 90, directionRef: 'T' }));
  try {
    assert.deepEqual(ids.map((id) => session.getPhoto(id).direction.current.degrees), [90, 90]);
    assert(ids.every((id) => session.getPhoto(id).direction.current.basis.kind === 'exif'));
  } finally { session.clear(); }
});

test('a time a person removed is not brought back, and a chosen source is not replaced', async () => {
  const { session, layerId, ids: [a] } = await completionLayer([jpeg('a.jpg', exifTime)]);
  try {
    assert(session.setCaptureMetadata(layerId, [a], 'captureTime', null).ok);
    assert.equal(session.getPhoto(a).captureMetadata.captureTime, null);
    await attachGml(session, layerId, completionGml([{ name: 'a.jpg', time: '2026-05-12T15:00:00' }]));
    assert.equal(session.getPhoto(a).captureMetadata.captureTime, null, 'not even by a new source');
    const { model } = completionView(session, layerId);
    assert.equal(model.captureTime.rows[0].state, 'conflict');
    assert(session.setCaptureMetadata(layerId, [a], 'captureTime', null, { evidenceId: 'exif:captureTime' }).ok);
    assert.equal(session.getPhoto(a).captureMetadata.captureTime.provenance.kind, 'exif');
    assert.equal(session.getPhoto(a).captureMetadata.captureTimeCleared, undefined, 'a new decision replaces the old one');
  } finally { session.clear(); }
});

// Position proposals
const planFor = (session, layerId) => planPhotoSourcePositions(session.getLayerPhotos(layerId), session.getLayer(layerId).spatialSources);
const gpsPhoto = (name) => jpeg(name, { noLocation: false });

test('positions: every GML match is proposed at once, with no change to the current positions until confirmed', async () => {
  const names = Array.from({ length: 40 }, (_, index) => `${index}.jpg`);
  const { session, layerId, ids } = await completionLayer(names.map(gpsPhoto), { place: false, gml: names.map((name, index) => ({ name })) });
  try {
    const plan = planFor(session, layerId);
    assert(plan.rows.every((row) => row.options.length === 2), 'both EXIF and GML are on offer');
    const selected = selectedPhotoSourcePositions(plan, photoSourcePositionChoices(plan));
    assert.equal(selected.length, 40, 'no row needs a dropdown change');
    assert(selected.every((row) => row.proposal.kind === 'gml' && row.action === 'place'));
    assert(ids.every((id) => session.getPhoto(id).spatial.current === null), 'a proposal is not an acceptance');
  } finally { session.clear(); }
});

test('positions: GML is proposed over a current EXIF position, never over a manual or current GML one', async () => {
  const { session, layerId, ids: [exifPlaced, manual, gmlPlaced] } = await completionLayer(['a', 'b', 'c'].map((name) => gpsPhoto(`${name}.jpg`)),
    { place: false, gml: ['a', 'b', 'c'].map((name, index) => ({ name: `${name}.jpg` })) });
  try {
    const candidate = (id, kind) => session.getPhoto(id).spatial.candidates.find((item) => item.kind === kind).id;
    session.acceptCandidates(layerId, [{ photoId: exifPlaced, candidateId: candidate(exifPlaced, 'exif') }, { photoId: gmlPlaced, candidateId: candidate(gmlPlaced, 'gml') }]);
    assert(session.applyPhotoEdits(session.beginPhotoEdits(layerId), [{ photoId: manual, position: { crs: 'EPSG:4326', longitude: 11, latitude: 60 } }]).ok);
    const [exifRow, manualRow, gmlRow] = planFor(session, layerId).rows;
    assert.equal(exifRow.defaultChoice, candidate(exifPlaced, 'gml'));
    assert.equal(manualRow.defaultChoice, '');
    assert.equal(gmlRow.defaultChoice, '');
  } finally { session.clear(); }
});

test('positions: a GML source added during a review is proposed, but a choice already made is not touched', async () => {
  const { session, layerId } = await completionLayer([gpsPhoto('a.jpg'), gpsPhoto('b.jpg')], { place: false });
  try {
    const first = planFor(session, layerId);
    const made = photoSourcePositionChoices(first);
    const [a, b] = first.rows.map((row) => row.photoId);
    assert.equal(first.rows[0].options[0].kind, 'exif');
    await attachGml(session, layerId, completionGml(['a.jpg', 'b.jpg'].map((name, index) => ({ name }))));
    const next = planFor(session, layerId);
    const choices = photoSourcePositionChoices(next, first, { ...made, [b]: '' }, null, { editedIds: new Set([b]) });
    assert.equal(choices[a], made[a], 'the proposal already chosen stands');
    assert.equal(choices[b], '', 'a row the person changed stays as they left it');
    const fresh = photoSourcePositionChoices(next, first, { [a]: '' });
    assert.equal(next.rows[0].options.find((item) => item.id === fresh[a]).kind, 'gml');
  } finally { session.clear(); }
});

// Edit mode transaction
test('Save and Discard: no automatic write reaches a layer with an open Edit session', async () => {
  const gates = [];
  const session = evidenceSession({ extractGps: async (file) => { await new Promise((resolve) => gates.push(resolve)); return readRealExif(file); } });
  try {
    const [id] = session.importFiles([jpeg('a.jpg', { ...exifTime, direction: 90, directionRef: 'T' })]).acceptedIds;
    const layerId = session.createLayer().id;
    placeAll(session, layerId, [id]);
    const ticket = session.beginPhotoEdits(layerId);
    while (!gates.length) await tick();
    gates.shift()();
    await settleExif(session, layerId);
    assert.equal(session.getPhoto(id).direction.current, null, 'the session owns the layer until it ends');
    assert.equal(session.getPhoto(id).metadataEvidence.length, 1, 'evidence still arrives');
    session.endPhotoEdits(ticket);
    assert.equal(session.getPhoto(id).direction.current.degrees, 90, 'Discard catches up');
    assert.equal(session.getPhoto(id).captureMetadata.captureTime.provenance.kind, 'exif');
  } finally { session.clear(); }
});

test('Save and Discard: a save with staged values applies them, then catches up on everything else', async () => {
  const gates = [];
  const session = evidenceSession({ extractGps: async (file) => { await new Promise((resolve) => gates.push(resolve)); return readRealExif(file); } });
  try {
    const ids = session.importFiles([jpeg('a.jpg', { direction: 90, directionRef: 'T' }), jpeg('b.jpg', { direction: 30, directionRef: 'T' })]).acceptedIds;
    const layerId = session.createLayer().id;
    placeAll(session, layerId, ids);
    const ticket = session.beginPhotoEdits(layerId);
    for (let turn = 0; turn < 2; turn++) { while (!gates.length) await tick(); gates.shift()(); await tick(); }
    await settleExif(session, layerId);
    assert(session.applyPhotoEdits(ticket, [{ photoId: ids[0], degrees: 200 }]).ok, 'no false edit conflict');
    assert.deepEqual([session.getPhoto(ids[0]).direction.current.degrees, session.getPhoto(ids[0]).direction.current.basis.kind], [200, 'manual']);
    assert.deepEqual([session.getPhoto(ids[1]).direction.current.degrees, session.getPhoto(ids[1]).direction.current.basis.kind], [30, 'exif']);
  } finally { session.clear(); }
});

test('Save and Discard: a default is 0° in Edit mode, restaging 0° changes nothing, and a real value replaces it', async () => {
  const { session, layerId, ids: [id] } = await completionLayer([jpeg('a.jpg')]);
  try {
    const before = session.getPhoto(id).direction.current;
    assert.equal(before.basis.kind, 'default');
    const ticket = session.beginPhotoEdits(layerId);
    let state = createPhotoEditState(ticket);
    assert.equal(state.baseline[id].direction, 0);
    state = photoEditReducer(state, { type: 'stage', photoId: id, field: 'direction', value: 0 });
    assert.deepEqual(photoEditChanges(state), []);
    state = photoEditReducer(state, { type: 'stage', photoId: id, field: 'direction', value: 90 });
    assert.deepEqual(photoEditChanges(state), [{ photoId: id, degrees: 90 }]);
    session.endPhotoEdits(ticket);
    assert.strictEqual(session.getPhoto(id).direction.current, before, 'Discard keeps the identity, so nothing looks changed');
    assert(session.applyPhotoEdits(session.beginPhotoEdits(layerId), [{ photoId: id, degrees: 90 }]).ok);
    assert.deepEqual([session.getPhoto(id).direction.current.degrees, session.getPhoto(id).direction.current.basis.kind], [90, 'manual']);
  } finally { session.clear(); }
});

test('a default reads as ordinary north, and only its provenance sets it apart from a source 0°', async () => {
  const { session, layerId, ids: [north, unknown] } = await completionLayer(['north', 'unknown'].map((name) => jpeg(`${name}.jpg`)), { gml: [{ name: 'north.jpg', direction: '0' }] });
  try {
    const [source, defaulted] = [north, unknown].map((id) => session.getPhoto(id).direction.current);
    assert.deepEqual([source.degrees, defaulted.degrees], [0, 0]);
    assert.equal(photoDirectionLabel(defaulted.degrees), '0° N');
    assert.deepEqual(session.getLayerPhotos(layerId).map(photoMissingDirection), [false, false], 'a default is not a missing direction');
    assert.equal(defaulted.basis.kind, 'default');
    assert.match(photoDirectionSourceLabel(defaulted), /^Standardverdi/);
    assert.match(photoDirectionSourceLabel(source), /^GML/);
  } finally { session.clear(); }
});

test('a default is complete: nothing remains in the hub, the map bar counts defaults by name, and the note stays', async () => {
  const { session, layerId, ids } = await completionLayer(['a', 'b'].map((name) => jpeg(`${name}.jpg`, exifTime)));
  try {
    const { model, readiness } = completionView(session, layerId);
    assert.equal(model.tasks.find((task) => task.key === 'direction').outstanding, 0);
    assert.equal(photoCompletionStatus(readiness).text, 'Ingen opplysninger mangler for dette målet');
    assert.deepEqual(completionRecommendations(readiness, 'direction').map(({ code }) => code), ['direction-defaulted'], 'still said once, in the panel');
    const flow = createPhotoExportFlow({ layerId, task: 'direction', workIds: ids, photos: session.getLayerPhotos(layerId), workspace: { ...emptyPhotoWorkspace, layerId, photoIds: ids, activePhotoId: ids[0] } });
    assert.equal(photoExportFlowProgress(flow, session.getLayerPhotos(layerId), ids[0]).countLabel, 'Standardretning');
  } finally { session.clear(); }
});

// EXIF Artist
const artist = (value, raw = value) => ({ id: 'exif:photographer', field: 'photographer', kind: 'exif', tag: 'Artist', raw, value });

test('photographer: usable EXIF Artist is taken with provenance; missing, invalid, manual and removed values stay', () => {
  const plan = (metadata, ...evidence) => planAutoPhotographer({ ...emptyCaptureMetadata(), ...metadata }, evidence);
  const accepted = plan({}, artist('Kari Nordmann', ' Kari  Nordmann '));
  assert.deepEqual([accepted.value, accepted.acceptance, accepted.provenance.kind, accepted.provenance.tag, accepted.provenance.raw], ['Kari Nordmann', 'auto', 'exif', 'Artist', ' Kari  Nordmann ']);
  assert.equal(plan({}), null, 'nothing is invented');
  assert.equal(plan({}, artist(null, ' ')), null);
  assert.equal(plan({}, artist('Bad\u0001Name')), null, 'a name no delivery could carry stays evidence');
  assert.equal(plan({ photographer: { value: 'Ola', provenance: { kind: 'manual' } } }, artist('Kari')), null);
  assert.equal(plan({ photographerCleared: true }, artist('Kari')), null);
  assert.equal(plan({ photographer: accepted }, artist('Kari Nordmann')), null, 'the same choice writes nothing');
});

test('photographer: arrives with a late EXIF read, once per asset, and survives correction and removal', async () => {
  const gates = [];
  const session = evidenceSession({ extractGps: async (file) => { await new Promise((resolve) => gates.push(resolve)); return readRealExif(file); } });
  try {
    const [id, other] = session.importFiles([jpeg('a.jpg', { artist: 'Kari Nordmann' }), jpeg('b.jpg', { artist: 'Ola Nordmann' })]).acceptedIds;
    const layerId = session.createLayer().id;
    assert.equal(session.getPhoto(id).captureMetadata.photographer, null);
    for (let turn = 0; turn < 2; turn++) { while (!gates.length) await tick(); gates.shift()(); await tick(); }
    await settleExif(session, layerId);
    assert.equal(session.getPhoto(id).captureMetadata.photographer.value, 'Kari Nordmann');
    assert(session.setCaptureMetadata(layerId, [id], 'photographer', 'Rettet Navn').ok);
    assert(session.setCaptureMetadata(layerId, [other], 'photographer', null).ok);
    await attachGml(session, layerId, completionGml([{ name: 'a.jpg', direction: '45' }]));
    assert.equal(session.getPhoto(id).captureMetadata.photographer.value, 'Rettet Navn');
    assert.equal(session.getPhoto(other).captureMetadata.photographer, null, 'not brought back by a later publication');
    assert.equal(session.getPhoto(other).metadataEvidence.filter((item) => item.field === 'photographer').length, 1, 'the evidence stays');
  } finally { session.clear(); }
});

test('photographer: Gemini XML is unchanged, and Legacy carries the name as it did once accepted', async () => {
  const { session, layerId } = await completionLayer([jpeg('a.jpg', { ...exifTime, artist: 'Kari Nordmann' })]);
  try {
    const xml = async (profile) => serializePhotoExport(await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), { profile, crs: 'EPSG:25832' }));
    const gemini = await xml('gemini-legacy2019');
    assert(!gemini.includes('Kari Nordmann')); assert(!gemini.includes('fotoinformasjon'));
    assert((await xml('legacy2019')).includes('<app:fotograf>Kari Nordmann</app:fotograf>'));
  } finally { session.clear(); }
});

// Export
test('missing capture time: Gemini still generates, with no placeholder and the element left out', async () => {
  const { session, layerId } = await completionLayer([jpeg('a.jpg'), jpeg('b.jpg', exifTime)]);
  try {
    const plan = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), { profile: 'gemini-legacy2019', crs: 'EPSG:25832' });
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.counts.missingTimestampCount, 1);
    assert.deepEqual([...exportedTimes(serializePhotoExport(plan)).values()].sort(), ['2026-05-12T14:33:02', null].sort());
    const legacy = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), { profile: 'legacy2019', crs: 'EPSG:25832' });
    assert.deepEqual(legacy.errors.map(({ code }) => code), ['capture-time-required'], 'the other profiles keep their requirement');
  } finally { session.clear(); }
});

test('a default direction exports as 0° and exact source precision reaches the XML', async () => {
  const { session, layerId } = await completionLayer(['a', 'b'].map((name) => jpeg(`${name}.jpg`)), { gml: [{ name: 'a.jpg', direction: '123.4567' }] });
  try {
    const xml = serializePhotoExport(await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), { profile: 'gemini-legacy2019', crs: 'EPSG:25832' }));
    assert(xml.includes('<app:retningsverdi>123.4567</app:retningsverdi>'));
    assert(xml.includes('<app:retningsverdi>0</app:retningsverdi>'));
  } finally { session.clear(); }
});

// The acceptance dataset, rebuilt from its reported shape. Every value is invented.
test('contractor shape: 40 matched photos end as 40 GML positions, 40 directions, 26 times and 14 left empty', async () => {
  const names = Array.from({ length: 40 }, (_, index) => `foto-${index}.jpg`);
  const direction = (index) => index < 11 ? 10 + index * 30 + .46 : 0;
  const files = names.map((name, index) => jpeg(name, { ...(index < 26 ? exifTime : {}), ...(index < 11 ? { direction: Number(direction(index).toFixed(4)) + .0033, directionRef: 'T' } : {}) }));
  const features = names.map((name, index) => ({ name, direction: String(direction(index)) }));
  const session = evidenceSession();
  try {
    session.importFiles(files);
    const layerId = session.createLayer().id;
    await settleExif(session, layerId);
    await attachGml(session, layerId, completionGml(features));
    const plan = planFor(session, layerId);
    const selected = selectedPhotoSourcePositions(plan, photoSourcePositionChoices(plan));
    assert.equal(selected.length, 40);
    assert.equal(acceptGmlPositions(session, layerId).length, 40);

    const { model, readiness } = completionView(session, layerId);
    assert.equal(model.direction.done.length, 40, 'every photo has an accepted direction');
    assert(model.direction.done.every((row) => row.accepted.basis.kind === 'gml'));
    assert.equal(model.direction.done.filter((row) => row.accepted.degrees === 0).length, 29);
    assert.equal(model.direction.done.filter((row) => row.sources.length === 2).length, 11);
    assert.equal(model.direction.done.filter((row) => row.sourcesDiffer).length, 0, 'rounding is not a conflict');
    assert.equal(model.direction.groups.length, 0);
    assert.equal(model.captureTime.done.length, 26);
    assert.equal(model.captureTime.rows.filter((row) => row.state === 'none').length, 14);
    assert.deepEqual(readiness.blocking, []);
    assert.equal(readiness.levels.generation, 'possible');
    assert.deepEqual(readiness.levels.schema.gaps, [{ field: 'captureTime', count: 14, missing: 14, insufficientPrecision: 0 }]);
    assert.deepEqual(readiness.recommendations.map(({ code }) => code), []);
    assert.deepEqual(model.tasks.filter((task) => task.outstanding).map(({ key, outstanding }) => [key, outstanding]), [['captureTime', 14]]);
  } finally { session.clear(); }
});
