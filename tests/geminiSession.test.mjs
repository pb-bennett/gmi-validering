import { TEST_CONNECTION } from './fixtures/gemini-wfs/connection.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
register('./esmJsLoader.mjs', import.meta.url);
const { createGeminiSession, EMPTY_GEMINI_SNAPSHOT } = await import('../src/lib/gemini-wfs/geminiSession.mjs');
const { GeminiServiceError } = await import('../src/lib/gemini-wfs/geminiErrors.mjs');
const { getDatasetRevision } = await import('../src/lib/validation-v2/datasetRevision.js');

const credentials = () => ({ username: randomUUID(), password: ` ${randomUUID()} ` });
const survey = (x = 579300) => ({ file: { format: 'GMI' }, data: { format: 'GMI', header: { COSYS_EPSG: 25832 },
  points: [{ coordinates: [{ x, y: 6559200, z: 0 }] }], lines: [] } });
const pair = (tag = 'synthetic') => Object.freeze({
  lines: Object.freeze({ source: { tag, records: [] }, display: { type: 'FeatureCollection', features: [] } }),
  points: Object.freeze({ source: { tag, records: [] }, display: { type: 'FeatureCollection', features: [] } }),
  counts: Object.freeze({ lines: 0, points: 0, total: 0 }),
});
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(requestPair = async () => pair()) {
  const layers = { a: survey(), b: survey(579500) }, calls = [];
  const session = createGeminiSession({ getLayer: (id) => layers[id], now: () => 123456,
    requestPair: (args) => { calls.push(args); return requestPair(args, calls.length); } });
  const account = credentials(); session.setConnection(TEST_CONNECTION); session.setCredentials(account);
  return { session, layers, calls, account };
}
function assertPrivate(value, account) {
  const serialized = JSON.stringify(value);
  assert(!serialized.includes(account.username) && !serialized.includes(account.password), 'No credentials in observable data');
  assert(!serialized.includes('Authorization')); assert(!serialized.includes('password'));
}

test('atomic pair, credential-free snapshots, fixed buffer, counts and stable provenance', async () => {
  const { session, calls, layers, account } = fixture();
  const snapshots = []; session.subscribe(() => snapshots.push(session.getSnapshot()));
  const outcome = await session.fetch('a');
  assert.equal(outcome.ok, true); assert.equal(calls.length, 1);
  assert(calls[0].credentials.username === account.username && calls[0].credentials.password === account.password);
  assert.deepEqual(calls[0].bbox, [579200, 6559100, 579400, 6559300]);
  const state = session.getSnapshot(), provenance = state.result.provenance;
  assert.equal(state.status, 'ready'); assert.equal(state.stale, false);
  assert.equal(provenance.datasetRevision, getDatasetRevision(layers.a.data));
  assert.equal(provenance.sourceLayerId, 'a'); assert.equal(provenance.connectionId, 'gemini-wfs');
  assert.equal(provenance.accountGeneration, state.accountGeneration);
  assert.equal(provenance.bufferMetres, 100); assert.equal(state.result.fetchedAt, 123456);
  assert.deepEqual(provenance.counts, { lines: 0, points: 0, total: 0 });
  assertPrivate(snapshots, account); assertPrivate(outcome, account);
  assert(snapshots.filter((entry) => entry.status === 'loading').every((entry) => entry.result === null));
});
test('identical simultaneous fetch/refresh coalesce; good result reuse and explicit later refresh', async () => {
  const gate = deferred();
  const { session, calls } = fixture(() => gate.promise);
  const first = session.fetch('a'), second = session.fetch('a');
  assert.strictEqual(first, second);
  assert.strictEqual(session.refresh('a'), first);
  await tick(); assert.equal(calls.length, 1);
  gate.resolve(pair()); await first;
  assert.equal((await session.fetch('a')).reused, true); assert.equal(calls.length, 1);
  assert.equal((await session.refresh('a')).reused, false); assert.equal(calls.length, 2);
});
test('refresh failure retains exact previous good pair/provenance/time with a separate sanitized error', async () => {
  const { session, account } = fixture(async (_args, count) => {
    if (count > 1) throw new Error(account.password); return pair();
  });
  await session.fetch('a'); const good = session.getSnapshot().result;
  const failure = await session.refresh('a');
  assert.equal(failure.ok, false); assert.equal(session.getSnapshot().status, 'error');
  assert.strictEqual(session.getSnapshot().result, good);
  assert.equal(good.fetchedAt, 123456); assertPrivate(session.getSnapshot(), account);
});
test('new source supersedes old; late ignored transport cannot publish or overwrite', async () => {
  const gates = [deferred(), deferred()];
  const { session, calls } = fixture((_args, count) => gates[count - 1].promise);
  const old = session.fetch('a'); await tick();
  const newer = session.fetch('b'); await tick();
  assert(calls[0].signal.aborted);
  gates[1].resolve(pair('new')); assert.equal((await newer).ok, true);
  gates[0].resolve(pair('old')); assert.equal((await old).error.code, 'request_aborted');
  assert.equal(session.getSnapshot().result.lines.source.tag, 'new');
  assert.equal(session.getSnapshot().result.provenance.sourceLayerId, 'b');
});
test('reset, disconnect, clear and disposal invalidate pending work even if transport ignores abort', async () => {
  for (const action of ['reset', 'disconnect', 'clearResult', 'dispose']) {
    const gate = deferred(); const { session, calls } = fixture(() => gate.promise);
    const pending = session.fetch('a'); await tick(); session[action]();
    assert(calls[0].signal.aborted);
    gate.resolve(pair('late')); assert.equal((await pending).ok, false);
    assert.equal(session.getSnapshot().result, null);
    if (['reset', 'disconnect', 'dispose'].includes(action)) {
      assert.deepEqual(session.getSnapshot(), { ...EMPTY_GEMINI_SNAPSHOT, connection: TEST_CONNECTION, connectionId: TEST_CONNECTION.id });
      const error = (await session.fetch('a')).error;
      assert.equal(error.code, action === 'dispose' ? 'session_disposed' : 'credentials_unavailable');
    } else assert.equal((await session.fetch('a')).ok, true);
  }
});
test('account replacement clears old data, rotates opaque identity and aborts pending work', async () => {
  const gate = deferred(); const { session, calls, account } = fixture((_args, count) => count === 1 ? pair('old-account') : gate.promise);
  await session.fetch('a'); const previousGeneration = session.getSnapshot().accountGeneration;
  const pending = session.refresh('a'); await tick();
  const replacement = credentials(); session.setConnection(TEST_CONNECTION); session.setCredentials(replacement);
  assert(calls[1].signal.aborted); assert.equal(session.getSnapshot().result, null);
  assert.notEqual(session.getSnapshot().accountGeneration, previousGeneration);
  gate.resolve(pair('late')); await pending;
  await session.fetch('a'); assertPrivate(session.getSnapshot(), account); assertPrivate(session.getSnapshot(), replacement);
  assert(calls.at(-1).credentials.username === replacement.username);
});
test('source removal clears only its reference; dataset revision change marks good data stale and prevents reuse', async () => {
  const { session, layers, calls } = fixture();
  await session.fetch('a'); const previous = session.getSnapshot().result;
  layers.a = survey(); session.reconcileSource();
  assert.equal(session.getSnapshot().stale, true); assert.strictEqual(session.getSnapshot().result, previous);
  await session.fetch('a'); assert.equal(calls.length, 2);
  assert.notEqual(session.getSnapshot().result.provenance.datasetRevision, previous.provenance.datasetRevision);
  delete layers.b; session.reconcileSource(); assert(session.getSnapshot().result);
  delete layers.a; session.reconcileSource(); assert.equal(session.getSnapshot().result, null);
});
test('in-flight source removal/revision change aborts and late completion never publishes', async () => {
  for (const remove of [true, false]) {
    const gate = deferred(); const { session, layers, calls } = fixture(() => gate.promise);
    const pending = session.fetch('a'); await tick();
    if (remove) delete layers.a; else layers.a = survey();
    session.reconcileSource(); assert(calls[0].signal.aborted);
    gate.resolve(pair()); assert.equal((await pending).error.code, 'request_aborted');
    assert.equal(session.getSnapshot().result, null);
  }
});
test('publication rechecks revision even without a store subscription', async () => {
  const gate = deferred(); const { session, layers } = fixture(() => gate.promise);
  const pending = session.fetch('a'); await tick();
  layers.a = survey(); gate.resolve(pair());
  assert.equal((await pending).error.code, 'request_aborted'); assert.equal(session.getSnapshot().result, null);
});
test('selection and visibility/photo/view changes never dispatch; selected layer overrides legacy data', async () => {
  const { session, layers, calls } = fixture();
  session.selectSource('a');
  layers.a.visible = false; layers.a.data.filtered = []; layers.a.photos = [{ x: 0, y: 0 }];
  layers.a.viewport = [0, 0]; session.reconcileSource();
  assert.equal(calls.length, 0);
  await session.fetch('a'); const count = calls.length;
  layers.a.visible = true; session.reconcileSource(); assert.equal(calls.length, count);
  assert.deepEqual(Object.keys(layers), ['a', 'b']);
  assert.equal(layers.a.data.points.length, 1); assert.equal(layers.a.data.lines.length, 0);
});
test('credentials required, auth failure clears private slot, cancellation and safe preflight errors', async () => {
  const { session, calls } = fixture(async () => { throw new GeminiServiceError('authentication_failed'); });
  assert.equal((await session.fetch('a')).error.code, 'authentication_failed');
  assert.equal(session.getSnapshot().connectionStatus, 'credentials-required');
  assert.equal((await session.fetch('a')).error.code, 'credentials_unavailable'); assert.equal(calls.length, 1);
  assert.equal((await session.fetch('missing')).error.code, 'no_survey_source');
  const gate = deferred(); const other = fixture(() => gate.promise);
  const pending = other.session.fetch('a'); await tick(); other.session.cancel();
  assert.equal((await pending).error.code, 'request_aborted'); assert(other.calls[0].signal.aborted);
  gate.reject(new Error('synthetic late failure')); await tick();
});
test('removing an old retained source clears its data while another selected source is loading', async () => {
  const gate = deferred(); const { session, layers } = fixture((_args, count) => count === 1 ? pair() : gate.promise);
  await session.fetch('a'); const pending = session.fetch('b'); await tick();
  assert.equal(session.getSnapshot().stale, true);
  delete layers.a; session.reconcileSource(); assert.equal(session.getSnapshot().result, null);
  gate.resolve(pair('b')); assert.equal((await pending).ok, true);
});
