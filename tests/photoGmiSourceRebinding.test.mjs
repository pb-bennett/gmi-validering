import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeliveryPlan, captureDeliverySnapshot } from '../src/lib/delivery/index.mjs';
import { createGmiEditSessions, createGmiObjectCorrection } from '../src/lib/gmi-edit/index.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { createGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { createLoadedGmiSources } from '../src/lib/photos/loadedGmiSource.mjs';
import { buildGmiText, latin1Bytes } from './helpers/gmiHyperlinkRemovalFixtures.mjs';
import { exportFixture, syntheticContext } from './helpers/photoExportFixtures.mjs';
import { saveStagedSource } from './helpers/photoSourceDraft.mjs';

const hyperlink = 'h:1(link:"Attachments\\shared.png") ';
const text = buildGmiText({ points: [{ hyperlink }, { hyperlink }, { hyperlink }] });
const file = new File([latin1Bytes(text)], 'synthetic.gmi');

async function setup() {
  const { session, layerId } = await exportFixture({ names: ['shared.png'], unplaced: true });
  const live = new Map();
  const getLayer = (id) => live.get(id);
  const sources = createLoadedGmiSources({ getLayer });
  const registry = createGmiEditSessions({ sources, getLayer });
  const review = () => session.getSnapshot().sourceReviews[layerId];
  const source = () => session.getLayer(layerId).spatialSources[0];
  const workflow = session.beginSourceWorkflow(layerId);
  assert(await session.stageLayerSource(layerId, file, 'gmi'));
  assert(saveStagedSource(session, workflow, review()).ok);
  session.endSourceWorkflow(workflow);

  const add = async (id, original = file, alter = (evidence) => evidence) => {
    const parser = new GMIParser(decodeGmiBytes(new Uint8Array(await original.arrayBuffer())));
    const data = parser.toObject();
    const binding = sources.register(id, data, original, alter(createGmiPhotoSource(parser)));
    live.set(id, { id, data, file: { name: original.name, format: 'GMI' } });
    return binding;
  };
  const input = (id) => {
    const ticket = sources.begin(id);
    return { binding: ticket.binding, read: () => sources.read(ticket), isLive: sources.isLive };
  };
  const remove = (id) => {
    live.delete(id);
    sources.reconcile();
    session.reconcileLoadedGmiBindings(sources.isLive);
  };
  const startReview = async (id) => {
    const ticket = session.beginSourceWorkflow(layerId);
    const ready = await session.stageLayerSource(layerId, input(id), 'gmi');
    return { ready, ticket, reviewed: review() };
  };
  const associate = (id) => sources.associate(id, session);
  const capture = (handle) => captureDeliverySnapshot({ mode: 'combined', registry, handle, photoSession: session, photoLayerId: layerId });
  const plan = (handle) => buildDeliveryPlan(capture(handle), { profile: 'gemini-legacy2019', crs: 'EPSG:25832', context: syntheticContext });
  return { session, layerId, sources, registry, source, add, input, remove, startReview, associate, capture, plan };
}

test('automatic association enables combined export and preserves repeated occurrences, photo work and Rettinger corrections', async (t) => {
  const f = await setup(); t.after(() => f.session.clear());
  const { session, layerId, registry } = f;
  const binding = await f.add('survey');
  const opened = await registry.open('survey'); assert(opened.ok);
  const { handle } = opened;
  const correction = createGmiObjectCorrection(registry.getSession(handle).session, { scope: 'point', sourceIndex: 0,
    values: { Merknad: 'Staged synthetic correction' }, mode: 'overwrite', label: 'Synthetic correction' });
  assert(correction.ok); assert(registry.stage(handle, correction.changeSet).ok);
  const edits = registry.inspect(handle).changeSets;
  const ids = session.getLayer(layerId).photoIds;
  assert.equal(ids.length, 3);
  for (const [index, id] of ids.entries()) {
    assert(session.applyPhotoEdits(session.beginPhotoEdits(layerId), [{ photoId: id,
      position: { crs: 'EPSG:4326', longitude: 10.43 + index * .001, latitude: 59.225 }, degrees: index * 30 }]).ok);
    assert(session.setDeliveryIntent(layerId, [id], ['transfer', 'exclude', 'keep-link'][index]).ok);
  }
  const before = session.getLayerPhotos(layerId);
  const prior = f.source();
  assert((await f.plan(handle)).errors.some(({ code }) => code === 'loaded-gmi-binding-required'));
  let publications = 0;
  const stop = session.subscribe(() => publications++);
  assert(await f.associate('survey'));
  stop();
  assert.equal(publications, 1);
  assert.deepEqual(f.source(), { ...prior, loadedBinding: { ...binding, live: true } });
  assert.strictEqual(f.source().associationLedger, prior.associationLedger);
  assert.strictEqual(f.source().references, prior.references);
  assert.deepEqual(session.getLayerPhotos(layerId), before);
  assert.deepEqual(registry.inspect(handle).changeSets, edits);
  const plan = await f.plan(handle);
  assert.equal(plan.status, 'ready', JSON.stringify(plan.errors));
  assert.equal(plan.counts.features, 1);
});

test('same filename with different bytes stays independent and combined export remains blocked', async (t) => {
  const f = await setup(); t.after(() => f.session.clear());
  const prior = f.source();
  const other = new File([latin1Bytes(text.replace('581947.000', '581948.000'))], file.name);
  assert.notDeepEqual(await other.arrayBuffer(), await file.arrayBuffer());
  await f.add('survey', other);
  assert.equal(await f.associate('survey'), false);
  const staged = await f.startReview('survey');
  assert(staged.ready);
  assert.equal(staged.reviewed.recheck, false);
  assert.notEqual(staged.reviewed.source.fingerprint, prior.fingerprint);
  assert.strictEqual(f.source(), prior);
  const { handle } = await f.registry.open('survey');
  assert((await f.plan(handle)).errors.some(({ code }) => code === 'loaded-gmi-binding-required'));
});

test('overlapping registrations with matching bytes stay ambiguous until a user explicitly selects a layer', async (t) => {
  const f = await setup(); t.after(() => f.session.clear());
  let release, started;
  const waiting = new Promise((resolve) => { release = resolve; });
  const reading = new Promise((resolve) => { started = resolve; });
  const original = new File([await file.arrayBuffer()], file.name);
  const first = await f.add('first', original);
  original.arrayBuffer = async () => { started(); await waiting; return file.arrayBuffer(); };
  const pending = f.associate('first');
  await reading;
  await f.add('second');
  release();
  assert.deepEqual(await Promise.all([pending, f.associate('second')]), [false, false]);
  const prior = f.source();
  assert.equal(prior.loadedBinding, undefined);
  const { ready, ticket, reviewed } = await f.startReview('first');
  assert(ready);
  assert.deepEqual(reviewed.rebinding, { ...first, live: true });
  assert.strictEqual(f.source(), prior);
  const before = f.session.getLayerPhotos(f.layerId);
  assert(saveStagedSource(f.session, ticket, reviewed).ok);
  assert.deepEqual(f.source(), { ...prior, loadedBinding: { ...first, live: true } });
  assert.strictEqual(f.source().associationLedger, prior.associationLedger);
  assert.deepEqual(f.session.getLayerPhotos(f.layerId), before);
  const bound = f.source();
  const refused = await f.startReview('second');
  assert.equal(refused.reviewed.errorCode, 'source-bound-elsewhere');
  assert.equal(await f.associate('second'), false);
  assert.strictEqual(f.source(), bound);
  assert(await f.session.beginLoadedGmiImport(f.input('second'), f.layerId));
  const append = f.session.reviewLoadedGmiImport();
  assert.equal(append.error, 'source-bound-elsewhere');
  assert.equal(f.session.applyLoadedGmiImport(append).ok, false);
  assert.strictEqual(f.source(), bound);
});

test('byte match cannot override mismatched reference or object evidence', async (t) => {
  const f = await setup(); t.after(() => f.session.clear());
  const prior = f.source();
  await f.add('survey', file, (evidence) => ({ ...evidence, references: evidence.references.slice(1) }));
  assert.equal((await f.input('survey').read()).fingerprint, prior.fingerprint);
  assert.equal(await f.associate('survey'), false);
  assert.equal((await f.startReview('survey')).reviewed.errorCode, 'source-evidence-mismatch');
  assert.strictEqual(f.source(), prior);
  f.remove('survey');
  await f.add('survey', file, (evidence) => ({ ...evidence, objectsByKey: {} }));
  assert.equal(await f.associate('survey'), false);
  assert.equal((await f.startReview('survey')).reviewed.errorCode, 'source-evidence-mismatch');
  assert.strictEqual(f.source(), prior);
});

test('removed and replaced identities are refused at save, and a fresh import can rebind', async (t) => {
  const f = await setup(); t.after(() => f.session.clear());
  const first = await f.add('survey');
  assert(await f.associate('survey'));
  const old = await f.registry.open('survey'); assert(old.ok);
  f.remove('survey');
  assert.equal(f.source().loadedBinding.live, false);
  assert.throws(() => f.capture(old.handle));
  const second = await f.add('survey');
  const staged = await f.startReview('survey'); assert(staged.ready);
  f.remove('survey');
  const third = await f.add('survey');
  assert.notEqual(third.inputId, second.inputId);
  assert.deepEqual(saveStagedSource(f.session, staged.ticket, staged.reviewed), { ok: false, error: 'loaded-source-unavailable' });
  assert.deepEqual(f.source().loadedBinding, { ...first, live: false });
  assert(await f.associate('survey'));
  assert.deepEqual(f.source().loadedBinding, { ...third, live: true });
  const fresh = await f.registry.open('survey'); assert(fresh.ok);
  assert.doesNotThrow(() => f.capture(fresh.handle));
  assert.equal(f.sources.isLive({ ...third, datasetRevision: first.datasetRevision }), false);
  assert.equal(f.sources.isLive(first), false);
});
