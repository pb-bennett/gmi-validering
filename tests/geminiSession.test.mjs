import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { randomUUID } from 'node:crypto';
import { TEST_CONNECTION } from './fixtures/gemini-wfs/connection.mjs';
register('./esmJsLoader.mjs', import.meta.url);
const { createGeminiSession, EMPTY_GEMINI_SNAPSHOT } = await import('../src/lib/gemini-wfs/geminiSession.mjs');
const { GeminiServiceError } = await import('../src/lib/gemini-wfs/geminiErrors.mjs');
export const survey = (x = 579300, format = 'GMI') => ({ file: { format }, visible: false,
  data: { format, header: { COSYS_EPSG: 25832 }, points: [{ coordinates: [{ x, y: 6559200 }] }], lines: [] } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function pair(ids = ['shared'], points = ids) {
  const side = (names, type) => {
    const records = Object.freeze(names.map((id) => Object.freeze({ key: JSON.stringify(['connection', type, id]), typeName: type })));
    return Object.freeze({ source: Object.freeze({ records }), display: Object.freeze({ type: 'FeatureCollection', features: Object.freeze(records.map((record) => Object.freeze({ id: record.key }))) }) });
  };
  return Object.freeze({ lines: side(ids, 'VA_LINE'), points: side(points, 'VA_MPNT') });
}
function fixture(layers = { a: survey() }, requestPair = async () => pair()) {
  const calls = [], account = { username: randomUUID(), password: randomUUID() };
  const session = createGeminiSession({ getLayers: () => layers, now: () => 123,
    requestPair: (args) => { calls.push(args); return requestPair(args, calls.length); } });
  session.setConnection(TEST_CONNECTION); session.setCredentials(account);
  return { session, layers, calls, account };
}

test('one hidden survey uses exactly one atomic pair and fixed 100 m buffer; credentials stay private', async () => {
  const { session, calls, account } = fixture(); const snapshots = [];
  session.subscribe(() => snapshots.push(session.getSnapshot()));
  assert.equal((await session.fetch()).ok, true);
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].bbox, [579200, 6559100, 579400, 6559300]);
  assert.equal(session.getSnapshot().coverages[0].bufferMetres, 100);
  assert.equal(session.getSnapshot().coverages[0].sourceLayerId, 'a');
  assert.equal(session.getSnapshot().result.fetchedAt, 123);
  assert.equal(calls[0].credentials.password, account.password);
  assert(!JSON.stringify(snapshots).includes(account.password)); assert(!JSON.stringify(snapshots).includes(account.username));
});

test('empty connected workspace automatically covers a later import; repeated fetches reuse/coalesce existing units', async () => {
  const gate = deferred(); const { session, layers, calls } = fixture({}, () => gate.promise);
  await session.fetch(); layers.a = survey();
  const additions = session.reconcileSources(), first = session.fetch(), duplicate = session.refresh();
  await tick(); assert.equal(calls.length, 1);
  gate.resolve(pair()); await Promise.all([...additions, first, duplicate]);
  assert.equal((await session.fetch()).reused, true); assert.equal(calls.length, 1);
});

test('separated GMI/SOSI/KOF surveys have separate BBOXes, never a giant union; concurrency is two units', async () => {
  const gates = [deferred(), deferred(), deferred()];
  const { session, calls } = fixture({ a: survey(), b: survey(600000, 'SOSI'), c: survey(650000, 'KOF') }, (_args, n) => gates[n - 1].promise);
  const pending = session.fetch(); await tick(); assert.equal(calls.length, 2);
  gates[0].resolve(pair()); await tick(); assert.equal(calls.length, 3);
  gates[1].resolve(pair()); gates[2].resolve(pair()); await pending;
  assert.deepEqual(calls.map((call) => call.bbox), [[579200, 6559100, 579400, 6559300], [599900, 6559100, 600100, 6559300], [649900, 6559100, 650100, 6559300]]);
});

test('overlap deduplicates by immutable provider/type identity; equal line and point IDs remain separate', async () => {
  const first = pair(['shared', 'only-a']), second = pair(['shared', 'only-b']);
  const { session } = fixture({ a: survey(), b: survey(579350) }, (_args, n) => n === 1 ? first : second);
  await session.fetch(); const result = session.getSnapshot().result;
  assert.deepEqual(result.counts, { lines: 3, points: 3, total: 6 });
  assert.strictEqual(result.lines.source.records[0], first.lines.source.records[0]);
  assert(Object.isFrozen(first.lines.source.records[0]));
});

test('new eligible layer fetches once and merges; styles, visibility, selection and feature edits never fetch', async () => {
  const { session, layers, calls } = fixture(); await session.fetch();
  layers.b = survey(579350, 'SOSI'); await Promise.all(session.reconcileSources());
  assert.equal(calls.length, 2); assert.equal(session.getSnapshot().result.counts.lines, 1);
  layers.a = { ...layers.a, visible: true, highlightAll: true, color: '#FFFFFF', selected: 'a', data: survey(579500).data };
  session.reconcileSources(); session.reconcileSources(); await tick(); assert.equal(calls.length, 2);
  assert.deepEqual(Object.keys(layers), ['a', 'b']); // No reference insertion into surveys.
});

test('empty/non-geometric/FOTO/WMS/reference layers are excluded even if they claim a survey format', async () => {
  const { session, calls } = fixture({ empty: { ...survey(), data: { ...survey().data, points: [] } },
    photo: { ...survey(), type: 'FOTO' }, wms: { ...survey(), type: 'WMS' }, external: { ...survey(), type: 'GEMINI_WFS_REFERENCE' } });
  assert.equal((await session.fetch()).ok, true); assert.equal(calls.length, 0);
  assert.equal(session.getSnapshot().connectionStatus, 'connected'); assert.equal(session.getSnapshot().coverages.length, 0);
});

test('removal subtracts only owned coverage, retains shared identities and never requests', async () => {
  const { session, layers, calls } = fixture({ a: survey(), b: survey(579350) }, (_args, n) => pair(['shared', `only-${n}`]));
  await session.fetch(); delete layers.a; session.reconcileSources();
  assert.equal(calls.length, 2); assert.equal(session.getSnapshot().coverages.length, 1);
  assert.equal(session.getSnapshot().result.counts.lines, 2);
  delete layers.b; session.reconcileSources(); assert.equal(session.getSnapshot().result.counts.total, 0);
});

test('manual coverage merges independently, has no buffer and equivalent map requests refresh one entry', async () => {
  const { session, layers, calls } = fixture(); await session.fetch();
  const bbox = [579201.1, 6559101.1, 579401.1, 6559301.1];
  await session.fetchMap(bbox); await session.fetchMap(bbox.map((value) => value + 0.1));
  assert.equal(calls.length, 3); assert.deepEqual(calls[1].bbox, bbox);
  assert.equal(session.getSnapshot().coverages.length, 2);
  assert.equal(session.getSnapshot().coverages[1].bufferMetres, 0);
  delete layers.a; session.reconcileSources(); assert.equal(session.getSnapshot().coverages[0].kind, 'map');
  assert.equal(session.getSnapshot().result.counts.total, 2);
});

test('soft map extent requires explicit confirmation; hard extent cannot be overridden', async () => {
  const { session, calls } = fixture({});
  const soft = [579000, 6559000, 579900, 6559900];
  assert.equal((await session.fetchMap(soft)).confirmationRequired, true); assert.equal(calls.length, 0);
  await session.fetchMap(soft, { confirmed: true }); assert.equal(calls.length, 1);
  for (const confirmed of [false, true]) {
    assert.equal((await session.fetchMap([579000, 6559000, 581000, 6561000], { confirmed })).error.code, 'map_extent_too_large');
  }
  assert.equal(calls.length, 1);
});

test('refresh recalculates each automatic extent, retains recorded manual BBOX and old data until pair success', async () => {
  const gates = [deferred(), deferred()];
  const { session, layers, calls } = fixture({ a: survey() }, (_args, n) => n > 2 ? gates[n - 3].promise : pair(['old']));
  await session.fetch(); const map = [579210, 6559110, 579410, 6559310]; await session.fetchMap(map);
  const good = session.getSnapshot().result; layers.a = survey(580000);
  const pending = session.refresh(); await tick();
  assert.strictEqual(session.getSnapshot().result, good);
  assert.deepEqual(calls[2].bbox, [579900, 6559100, 580100, 6559300]); assert.deepEqual(calls[3].bbox, map);
  gates[0].resolve(pair(['fresh'])); await tick();
  assert.equal(session.getSnapshot().result.counts.total, 4); // New auto pair + old manual pair.
  gates[1].reject(new Error('UNTRUSTED')); assert.equal((await pending).ok, false);
  assert.equal(session.getSnapshot().result.counts.total, 4); assert(!JSON.stringify(session.getSnapshot()).includes('UNTRUSTED'));
});

test('failed pair refresh retains exact previous good result', async () => {
  const { session } = fixture({ a: survey() }, (_args, n) => { if (n > 1) throw new Error('secret'); return pair(); });
  await session.fetch(); const good = session.getSnapshot().result;
  assert.equal((await session.refresh()).ok, false); assert.strictEqual(session.getSnapshot().result, good);
});

test('pending/queued removal cancels owned work, late ignored transport cannot publish', async () => {
  const gates = [deferred(), deferred()];
  const { session, layers, calls } = fixture({ a: survey(), b: survey(), c: survey() }, (_args, n) => gates[n - 1].promise);
  const pending = session.fetch(); await tick(); delete layers.a; delete layers.c; session.reconcileSources();
  assert(calls[0].signal.aborted); gates[0].resolve(pair(['removed'])); gates[1].resolve(pair(['kept'])); await pending;
  assert.equal(calls.length, 2); assert.equal(session.getSnapshot().result.counts.total, 2);
  assert.equal(session.getSnapshot().coverages[0].sourceLayerId, 'b');
});

test('ordinary geometry changes do not cancel a pending lookup; next refresh uses changed geometry', async () => {
  const gate = deferred(); const { session, layers, calls } = fixture({ a: survey() }, () => gate.promise);
  const pending = session.fetch(); await tick(); layers.a = survey(580000); session.reconcileSources();
  assert(!calls[0].signal.aborted); gate.resolve(pair()); assert.equal((await pending).ok, true);
  await session.refresh(); assert.equal(calls[1].bbox[0], 579900);
});

test('disconnect clears credentials, features, coverages and pending work; saved config survives and reconnect starts fresh', async () => {
  const { session, layers, calls } = fixture(); await session.fetch(); await session.fetchMap([579200, 6559100, 579400, 6559300]);
  session.disconnect(); await tick();
  assert.deepEqual(session.getSnapshot(), { ...EMPTY_GEMINI_SNAPSHOT, connection: TEST_CONNECTION, connectionId: TEST_CONNECTION.id });
  assert.equal((await session.fetch()).error.code, 'credentials_unavailable');
  delete layers.a; layers.b = survey(580000); session.setCredentials({ username: 'invented', password: 'invented' });
  await session.fetch(); assert.equal(session.getSnapshot().coverages.length, 1);
  assert.equal(session.getSnapshot().coverages[0].sourceLayerId, 'b'); assert.equal(calls.length, 3);
});

test('cancel/reset/account replacement/disposal invalidate pending work and preserve private boundaries', async () => {
  for (const action of ['cancel', 'reset', 'disconnect', 'dispose', 'setCredentials']) {
    const gate = deferred(); const { session, calls } = fixture({ a: survey() }, () => gate.promise);
    const pending = session.fetch(); await tick();
    session[action]({ username: 'replacement', password: 'replacement' });
    assert(calls[0].signal.aborted); gate.resolve(pair()); assert.equal((await pending).ok, false);
    assert.equal(session.getSnapshot().result, null);
    assert.equal(session.getSnapshot().status, action === 'cancel' ? 'cancelled' : 'idle');
  }
});

test('auth failure clears credentials and reports safely; one failed area does not prevent unrelated success', async () => {
  const { session, calls } = fixture({ a: survey(), b: survey() }, (_args, n) => {
    if (n === 1) throw new GeminiServiceError('authentication_failed'); return pair();
  });
  assert.equal((await session.fetch()).ok, false); assert.equal(session.getSnapshot().connectionStatus, 'credentials-required');
  assert.equal(session.getSnapshot().result.counts.total, 2);
  assert.equal((await session.refresh()).error.code, 'credentials_unavailable'); assert.equal(calls.length, 2);
});
