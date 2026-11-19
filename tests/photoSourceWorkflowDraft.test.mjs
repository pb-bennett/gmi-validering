import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { EMPTY_GML_CAPTURE_DECISION } from '../src/lib/photos/photoGmlCaptureReconciliation.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { saveStagedSource } from './helpers/photoSourceDraft.mjs';
import { completionGml, completionLayer, jpeg } from './helpers/photoCompletionFixtures.mjs';

// Batch B (B-2): «Koble og posisjoner bilder» is one transaction. Staging a source, staging a removal and reviewing
// positions change no accepted data; «Lagre endringer» commits the whole draft atomically and publishes once.
const point = (longitude = 10) => ({ crs: 'EPSG:4326', longitude, latitude: 60 });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const image = (name) => new File(['original'], name, { type: 'image/jpeg' });
const gml = (names = ['a.jpg', 'b.jpg'], { longitude = 11, name = 'positions.gml', time = null, direction = null } = {}) => new File([JSON.stringify({ issues: [],
  entries: names.map((reference, index) => ({ id: `entry-${index}`, reference, kind: 'gml', status: 'viable', position: point(longitude),
    raw: { fotolink: reference, ...(time ? { fotograferingstidspunkt: time } : {}), ...(direction !== null ? { retningsverdi: String(direction) } : {}) } })) })], name);

async function setup({ names = ['a.jpg', 'b.jpg', 'c.jpg'], options = {} } = {}) {
  let id = 0;
  const session = createPhotoSession({ createId: () => String(++id), yieldJob: tick,
    createThumbnail: async () => ({ dimensions: { width: 1, height: 1 }, thumbnailBlob: new Blob(['thumb']) }),
    extractGps: async () => ({ state: 'viable', candidate: { status: 'viable', position: point(), raw: { GPSLatitude: 60 } } }),
    parseGml: async (file) => JSON.parse(await file.text()), ...options });
  const ids = session.importFiles(names.map(image)).acceptedIds, layer = session.createLayer();
  for (let i = 0; i < 100 && session.getLayerPhotos(layer.id).some((photo) => photo.spatial.exifRead.state === 'pending'); i++) await tick();
  return { session, layerId: layer.id, ids };
}
// Every accepted value the wizard could touch, by identity.
function accepted(session, layerId) {
  const layer = session.getLayer(layerId);
  return { layer, photos: layer.photoIds.map((id) => { const photo = session.getPhoto(id);
    return [id, photo.spatial, photo.direction, photo.captureMetadata, photo.metadataEvidence, photo.directionEvidence]; }),
  delivery: JSON.stringify(session.getLayerDelivery(layerId)) };
}
function assertUnchanged(session, layerId, before, message) {
  const now = accepted(session, layerId);
  assert.strictEqual(now.layer, before.layer, `${message}: layer`);
  assert.equal(now.photos.length, before.photos.length, `${message}: occurrences`);
  now.photos.forEach((row, index) => row.forEach((value, field) => assert.strictEqual(value, before.photos[index][field], `${message}: ${row[0]} field ${field}`)));
  assert.equal(now.delivery, before.delivery, `${message}: delivery`);
}
const stage = async (session, layerId, ticket, file, kind = 'gml', captureTime = undefined) => {
  assert(await session.stageLayerSource(layerId, file, kind));
  const review = session.getSnapshot().sourceReviews[layerId];
  const options = captureTime ? { captureTime: { ...EMPTY_GML_CAPTURE_DECISION, ...captureTime, plan: session.planLayerSourceCaptureTimes(layerId) } } : undefined;
  return session.stageSourceWorkflowSource(ticket, review, options);
};
const gmlRequests = (plan) => plan.rows.flatMap((row) => { const option = row.options.find((item) => item.kind === 'gml');
  return option ? [{ photoId: row.photoId, candidateId: option.id }] : []; });

test('cancel after each step leaves every accepted value identity-equal and publishes nothing accepted', async () => {
  for (const stop of ['stage-gml', 'stage-gmi', 'stage-removal', 'positions']) {
    const { session, layerId, ids } = await setup();
    // A saved GMI source first, so a removal can be staged.
    const first = session.beginSourceWorkflow(layerId);
    assert(await session.stageLayerSource(layerId, gmiFile([{ hyperlink: 'h:1(link:"c.jpg") ' }]), 'gmi'));
    assert.equal(saveStagedSource(session, first, session.getSnapshot().sourceReviews[layerId]).ok, true);
    session.endSourceWorkflow(first);
    const before = accepted(session, layerId);
    const ticket = session.beginSourceWorkflow(layerId);
    assert.equal((await stage(session, layerId, ticket, gml(), 'gml', { complete: true })).ok, true);
    assertUnchanged(session, layerId, before, `${stop}: after staging GML`);
    if (stop !== 'stage-gml') {
      assert.equal((await stage(session, layerId, ticket, gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }, { hyperlink: 'h:1(link:"a.jpg") ' }]), 'gmi')).ok, true);
      assertUnchanged(session, layerId, before, `${stop}: after staging GMI`);
    }
    if (['stage-removal', 'positions'].includes(stop)) {
      const saved = session.getLayer(layerId).spatialSources.find((source) => source.kind === 'gmi');
      assert.equal(session.stageSourceWorkflowRemoval(ticket, saved.id).ok, true);
      assertUnchanged(session, layerId, before, `${stop}: after staging the removal`);
    }
    if (stop === 'positions') {
      const plan = session.reviewSourceWorkflowPositions(ticket);
      assert(plan.rows.length > ids.length, 'the draft offers the staged GMI occurrences');
      assertUnchanged(session, layerId, before, `${stop}: after reviewing positions`);
    }
    session.endSourceWorkflow(ticket);
    assertUnchanged(session, layerId, before, `${stop}: after cancel`);
    assert.deepEqual(session.getSnapshot().sourceWorkflowDrafts, {});
    session.clear();
  }
});

// The same changes as two transactions (source, then positions) and as one: identical accepted results.
test('one atomic commit equals the former two-phase result', async () => {
  const normalise = (session, layerId) => JSON.stringify({ sources: session.getLayer(layerId).spatialSources.map((source) => source.id),
    photos: session.getLayerPhotos(layerId) }, (key, value) => (['acceptedAt', 'importedAt', 'createdAt', 'lastModified'].includes(key) ? 0 : value));
  const files = () => [jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')];
  const features = [{ name: 'a.jpg', time: '2026-05-12T10:00:00', direction: '90' }, { name: 'b.jpg', time: '2026-05-12T11:00:00', direction: '45' }];
  const two = await completionLayer(files(), { place: false }), one = await completionLayer(files(), { place: false });
  const t2 = two.session.beginSourceWorkflow(two.layerId);
  assert(await two.session.stageLayerSource(two.layerId, completionGml(features, 'positions.gml')));
  const review2 = two.session.getSnapshot().sourceReviews[two.layerId];
  assert.equal(saveStagedSource(two.session, t2, review2, { captureTime: { ...EMPTY_GML_CAPTURE_DECISION, complete: true, plan: two.session.planLayerSourceCaptureTimes(two.layerId) } }).ok, true);
  const plan2 = two.session.reviewSourceWorkflowPositions(t2);
  assert.equal(two.session.applySourceWorkflowPositions(t2, plan2, gmlRequests(plan2)).ok, true);

  const t1 = one.session.beginSourceWorkflow(one.layerId);
  assert.equal((await stage(one.session, one.layerId, t1, completionGml(features, 'positions.gml'), 'gml', { complete: true })).ok, true);
  const plan1 = one.session.reviewSourceWorkflowPositions(t1);
  let publications = 0; const unsubscribe = one.session.subscribe(() => publications++);
  const result = one.session.commitSourceWorkflow(t1, { plan: plan1, requests: gmlRequests(plan1), version: one.session.reviewSourceWorkflowDraft(t1).version });
  unsubscribe();
  assert.equal(result.ok, true);
  assert.equal(publications, 1, 'published once');
  assert.equal(normalise(one.session, one.layerId), normalise(two.session, two.layerId));
  assert.deepEqual({ ...result.receipt, added: result.receipt.added.map((op) => op.filename) }, { added: ['positions.gml'], rechecked: [], rebound: [], removed: [],
    occurrencesAdded: 0, captureTimes: 2, directions: 2, placed: 2, moved: 0, same: 0, gmlDelivery: 2,
    gmiDelivery: 0, deliveryKeptExplicit: 0, deliveryKeptUnavailable: 0 });
  two.session.clear(); one.session.clear();
});

test('fault injection: a failure after any write restores every value and publishes nothing', async () => {
  let failAt = Infinity, writes = 0;
  const commitFault = (count) => { writes = Math.max(writes, count); if (count === failAt) throw new Error('injected'); };
  const scenario = async () => {
    const fixture = await setup({ options: { commitFault } });
    const ticket = fixture.session.beginSourceWorkflow(fixture.layerId);
    assert.equal((await stage(fixture.session, fixture.layerId, ticket, gml(), 'gml', { complete: false })).ok, true);
    assert.equal((await stage(fixture.session, fixture.layerId, ticket, gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }, { hyperlink: 'h:1(link:"c.jpg") ' }]), 'gmi')).ok, true);
    const plan = fixture.session.reviewSourceWorkflowPositions(ticket);
    return { ...fixture, ticket, plan, requests: gmlRequests(plan) };
  };
  const counting = await scenario();
  assert.equal(counting.session.commitSourceWorkflow(counting.ticket, { plan: counting.plan, requests: counting.requests }).ok, true);
  const total = writes;
  assert(total >= 6, `layers, assets, records and delivery are all written (${total})`);
  counting.session.clear();
  for (failAt = 1; failAt <= total; failAt++) {
    const run = await scenario();
    const before = accepted(run.session, run.layerId);
    let publications = 0; const unsubscribe = run.session.subscribe(() => publications++);
    const result = run.session.commitSourceWorkflow(run.ticket, { plan: run.plan, requests: run.requests });
    unsubscribe();
    assert.deepEqual([result.ok, result.error, result.message], [false, 'commit-failed', 'Endringene kunne ikke lagres. Ingenting er endret.'], `write ${failAt}`);
    assert.equal(publications, 0, `no publication after a failure at write ${failAt}`);
    assertUnchanged(run.session, run.layerId, before, `rollback at write ${failAt}`);
    run.session.clear();
  }
});

test('a stale commit writes nothing: a live change after review refuses the save', async () => {
  const { session, layerId, ids } = await setup();
  const ticket = session.beginSourceWorkflow(layerId);
  assert.equal((await stage(session, layerId, ticket, gml())).ok, true);
  const plan = session.reviewSourceWorkflowPositions(ticket);
  session.applyPhotoEdits(session.beginPhotoEdits(layerId), [{ photoId: ids[0], position: point(15) }]);
  const before = accepted(session, layerId);
  assert.deepEqual(session.commitSourceWorkflow(ticket, { plan, requests: gmlRequests(plan) }), { ok: false, error: 'review-changed' });
  assertUnchanged(session, layerId, before, 'stale');
  // A refreshed review can still be saved.
  const fresh = session.reviewSourceWorkflowPositions(ticket);
  assert.equal(session.commitSourceWorkflow(ticket, { plan: fresh, requests: gmlRequests(fresh).filter((request) => request.photoId !== ids[0]) }).ok, true);
  assert.equal(session.getLayer(layerId).spatialSources.length, 1);
  session.clear();
});

test('a changed draft version, a capture-time change after Koblinger and an unsaved review all refuse the save', async () => {
  const { session, layerId, ids } = await setup();
  const ticket = session.beginSourceWorkflow(layerId);
  assert.equal((await stage(session, layerId, ticket, gml(['a.jpg'], { time: '2026-05-12T10:00:00' }), 'gml', { complete: true })).ok, true);
  const version = session.reviewSourceWorkflowDraft(ticket).version;
  // M3 guard: the reviewed capture plan no longer matches the photo after a manual time was set.
  session.setCaptureMetadata(layerId, [ids[0]], 'captureTime', '2026-05-12T08:00:00');
  const before = accepted(session, layerId);
  assert.deepEqual(session.commitSourceWorkflow(ticket, { version }), { ok: false, error: 'review-changed' });
  assertUnchanged(session, layerId, before, 'capture guard');
  assert.equal(session.reviewSourceWorkflowDraft(ticket).ok, false, 'Kontroll shows the draft cannot be saved');
  assert.deepEqual(session.commitSourceWorkflow(ticket, { version: version - 1 }), { ok: false, error: 'review-changed' });
  assert(await session.stageLayerSource(layerId, gml(['b.jpg'], { name: 'other.gml', longitude: 12 })));
  assert.deepEqual(session.commitSourceWorkflow(ticket), { ok: false, error: 'review-changed' }, 'a source still under review blocks the save');
  session.clear();
});

test('staging the same GML twice is refused; a staged GMI that is removed again leaves nothing to save', async () => {
  const { session, layerId } = await setup();
  const ticket = session.beginSourceWorkflow(layerId);
  assert.equal((await stage(session, layerId, ticket, gml())).ok, true);
  assert(await session.stageLayerSource(layerId, gml()));
  assert.deepEqual(session.stageSourceWorkflowSource(ticket, session.getSnapshot().sourceReviews[layerId]), { ok: false, error: 'source-staged' });
  session.cancelLayerSourceReview(layerId);
  const gmiStage = await stage(session, layerId, ticket, gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }]), 'gmi');
  assert.equal(gmiStage.ok, true);
  const staged = session.reviewSourceWorkflowDraft(ticket).ops.find((op) => op.kind === 'gmi');
  assert.equal(session.stageSourceWorkflowRemoval(ticket, staged.sourceId).ok, true);
  assert.deepEqual(session.reviewSourceWorkflowDraft(ticket).ops.map((op) => op.kind), ['gml'], 'staged then removed: no-op');
  const gmlOp = session.reviewSourceWorkflowDraft(ticket).ops[0];
  assert.equal(session.unstageSourceWorkflowOp(ticket, gmlOp.id).ok, true);
  const before = accepted(session, layerId);
  assert.deepEqual(session.commitSourceWorkflow(ticket), { ok: false, error: 'invalid-selection' });
  assertUnchanged(session, layerId, before, 'nothing staged');
  session.clear();
});

test('a staged removal hides that source\'s positions and keeps its occurrences; it is applied only at save', async () => {
  const { session, layerId } = await setup();
  const first = session.beginSourceWorkflow(layerId);
  assert(await session.stageLayerSource(layerId, gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }]), 'gmi'));
  assert.equal(saveStagedSource(session, first, session.getSnapshot().sourceReviews[layerId]).ok, true);
  session.endSourceWorkflow(first);
  const source = session.getLayer(layerId).spatialSources[0];
  const ticket = session.beginSourceWorkflow(layerId);
  assert(session.reviewSourceWorkflowPositions(ticket).rows.some((row) => row.options.some((option) => option.sourceId === source.id)));
  assert.equal(session.stageSourceWorkflowRemoval(ticket, source.id).ok, true);
  assert.equal(session.getLayer(layerId).spatialSources.length, 1, 'still saved until Lagre endringer');
  assert(!session.reviewSourceWorkflowPositions(ticket).rows.some((row) => row.options.some((option) => option.sourceId === source.id)));
  const result = session.commitSourceWorkflow(ticket);
  assert.equal(result.ok, true);
  assert.deepEqual(result.receipt.removed.map((op) => op.filename), [source.filename]);
  assert.equal(session.getLayer(layerId).spatialSources.length, 0);
  session.clear();
});

test('metadata-only and connection-only commits change capture times or links, never positions', async () => {
  const meta = await completionLayer([jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')], { place: false });
  const t1 = meta.session.beginSourceWorkflow(meta.layerId);
  assert.equal((await stage(meta.session, meta.layerId, t1, completionGml([{ name: 'a.jpg', time: '2026-05-12T10:00:00' }, { name: 'b.jpg', time: '2026-05-12T10:30:00' }]), 'gml', { complete: true })).ok, true);
  const currents = meta.ids.map((id) => meta.session.getPhoto(id).spatial.current);
  const saved = meta.session.commitSourceWorkflow(t1);
  assert.equal(saved.ok, true);
  assert.equal(saved.receipt.captureTimes, 2);
  assert.deepEqual([saved.receipt.placed, saved.receipt.moved, saved.receipt.same], [0, 0, 0]);
  meta.ids.forEach((id, index) => assert.strictEqual(meta.session.getPhoto(id).spatial.current, currents[index]));
  assert.equal(meta.session.getPhoto(meta.ids[0]).captureMetadata.captureTime.value.iso, '2026-05-12T10:00:00');
  meta.session.clear();

  const link = await setup();
  const t2 = link.session.beginSourceWorkflow(link.layerId);
  assert.equal((await stage(link.session, link.layerId, t2, gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }, { hyperlink: 'h:1(link:"a.jpg") ' }]), 'gmi')).ok, true);
  const draft = link.session.reviewSourceWorkflowDraft(t2);
  assert.equal(draft.occurrencesAdded, 1, 'Kontroll counts the new occurrence before anything is saved');
  assert.equal(link.session.getLayer(link.layerId).photoIds.length, 3);
  const linked = link.session.commitSourceWorkflow(t2);
  assert.equal(linked.ok, true);
  assert.equal(linked.receipt.occurrencesAdded, 1);
  assert.equal(link.session.getLayer(link.layerId).photoIds.length, 4);
  assert(link.session.getLayerPhotos(link.layerId).every((photo) => photo.spatial.current === null), 'no position was accepted');
  assert(link.session.sourceWorkflowIsLive(t2), 'the wizard stays open on its receipt after new occurrences');
  link.session.clear();
});

test('S2: a stale loaded-GMI binding at save is refused and nothing changes', async () => {
  const { session, layerId } = await setup();
  let live = true;
  const binding = { layerId: 'gmi-layer', inputId: 'input-1', datasetRevision: 1, filename: 'kart.gmi' };
  const file = gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }]);
  const parsed = await (await import('../src/lib/photos/gmiPhotoSource.mjs')).parseGmiPhotoSource(file);
  const ticket = session.beginSourceWorkflow(layerId);
  assert(await session.stageLayerSource(layerId, { binding, isLive: () => live, read: async () => parsed }, 'gmi'));
  assert.equal(session.stageSourceWorkflowSource(ticket, session.getSnapshot().sourceReviews[layerId]).ok, true);
  assert(session.reviewSourceWorkflowDraft(ticket).ok, 'cache the ready view before the external binding changes');
  const plan = session.reviewSourceWorkflowPositions(ticket);
  live = false;
  const before = accepted(session, layerId);
  assert.deepEqual(session.commitSourceWorkflow(ticket, { plan }), { ok: false, error: 'loaded-source-unavailable' });
  assertUnchanged(session, layerId, before, 'stale binding');
  session.clear();
});

test('a source-only confirmation must refresh if its reviewed draft is re-derived', async () => {
  const { session, layerId } = await setup();
  try {
    const ticket = session.beginSourceWorkflow(layerId);
    assert.equal((await stage(session, layerId, ticket, gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }]), 'gmi')).ok, true);
    const plan = session.reviewSourceWorkflowPositions(ticket);
    assert.equal(session.reviewSourceWorkflowDraft(ticket).evidenceSignature, plan.evidenceSignature);
    const [id] = session.getLayer(layerId).photoIds;
    assert(session.setCaptureMetadata(layerId, [id], 'captureTime', '2026-11-19').ok);
    const before = accepted(session, layerId);
    assert.deepEqual(session.commitSourceWorkflow(ticket, { plan }), { ok: false, error: 'review-changed' });
    assertUnchanged(session, layerId, before, 'source-only confirmation');
    assert(session.commitSourceWorkflow(ticket, { plan: session.reviewSourceWorkflowPositions(ticket) }).ok);
  } finally { session.clear(); }
});
