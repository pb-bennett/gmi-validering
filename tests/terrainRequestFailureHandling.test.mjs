import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const terrain = await import('../src/lib/analysis/terrain.js');
const point = (x) => ({ x, y: x + 1 });
const ok = (x) => ({ ok: true, json: async () => ({ punkter: [{ x, y: x + 1, z: 123, terreng: 'land', datakilde: 'test' }] }) });
const fail = (status) => ({ ok: false, status, statusText: 'Unavailable', headers: { get: () => null } });

async function withImmediateTimers(fn) {
  const original = globalThis.setTimeout;
  globalThis.setTimeout = (callback) => { queueMicrotask(callback); return 0; };
  try { await fn(); } finally { globalThis.setTimeout = original; }
}

test('successful terrain response is unchanged', async () => {
  terrain.clearTerrainCache(); terrain.resetTerrainStats();
  globalThis.fetch = async () => ok(1);
  const [result] = await terrain.fetchTerrainHeights([point(1)], 25832);
  assert.equal(result.z, 123);
  assert.equal(result.terreng, 'land');
});

test('504 retries then succeeds', async () => {
  terrain.clearTerrainCache(); terrain.resetTerrainStats();
  let calls = 0;
  globalThis.fetch = async () => (++calls < 2 ? fail(504) : ok(2));
  await withImmediateTimers(async () => {
    const [result] = await terrain.fetchTerrainHeights([point(2)], 25832);
    assert.equal(result.z, 123);
  });
  assert.equal(calls, 2);
});

test('transient statuses exhaust at three attempts and queue continues', async () => {
  for (const status of [429, 502, 503, 504]) {
    terrain.clearTerrainCache(); terrain.resetTerrainStats();
    let calls = 0;
    globalThis.fetch = async () => (++calls <= 3 ? fail(status) : ok(4));
    await withImmediateTimers(async () => {
      const first = await terrain.fetchTerrainHeights([point(3)], 25832);
      assert.equal(first[0].z, null);
      assert.equal(first[0].error, true);
      const second = await terrain.fetchTerrainHeights([point(4)], 25832);
      assert.equal(second[0].z, 123);
    });
    assert.equal(calls, 4);
    assert.equal(terrain.getTerrainStats().errors, 1);
  }
});

test('non-retryable HTTP response is controlled and not retried', async () => {
  terrain.clearTerrainCache(); terrain.resetTerrainStats();
  let calls = 0;
  globalThis.fetch = async () => (++calls, fail(400));
  const [result] = await terrain.fetchTerrainHeights([point(5)], 25832);
  assert.equal(calls, 1);
  assert.equal(result.z, null);
  assert.equal(terrain.getTerrainStats().errors, 1);
});

test('network failures retry and then degrade to missing terrain', async () => {
  terrain.clearTerrainCache(); terrain.resetTerrainStats();
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError('Failed to fetch'); };
  await withImmediateTimers(async () => {
    const [result] = await terrain.fetchTerrainHeights([point(6)], 25832);
    assert.equal(result.z, null);
  });
  assert.equal(calls, 3);
  assert.equal(terrain.getTerrainStats().errors, 1);
});

test('AbortError is not retried, rejected, or counted as a service failure', async () => {
  terrain.clearTerrainCache(); terrain.resetTerrainStats();
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
  const [result] = await terrain.fetchTerrainHeights([point(7)], 25832);
  assert.equal(calls, 1);
  assert.equal(result.aborted, true);
  assert.equal(terrain.getTerrainStats().errors, 0);
});
