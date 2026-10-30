import { TEST_CONNECTION } from './fixtures/gemini-wfs/connection.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { randomUUID } from 'node:crypto';
import { photoSession } from '../src/lib/photos/photoSession.mjs';
register('./esmJsLoader.mjs', import.meta.url);
const { default: useStore } = await import('../src/lib/store.js');
const { geminiSession } = await import('../src/lib/gemini-wfs/geminiSession.mjs');
const layer = () => ({ file: { format: 'GMI' }, data: { format: 'GMI', header: { COSYS_EPSG: 25832 },
  points: [{ coordinates: [{ x: 579300, y: 6559200 }] }], lines: [] } });
const account = () => ({ username: randomUUID(), password: randomUUID() });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('actual store removal aborts Gemini only for its source and preserves photos/WMS/other surveys', async (t) => {
  useStore.getState().resetAll();
  const a = layer(), b = layer();
  const photoId = photoSession.importFiles([new File(['synthetic'], 'keep.heic')]).acceptedIds[0];
  useStore.setState({ layers: { a, b }, layerOrder: ['a', 'b'], data: b.data });
  const settings = useStore.getState().settings;
  const signals = [];
  t.mock.method(globalThis, 'fetch', (_url, init) => { signals.push(init.signal); return new Promise(() => {}); });
  geminiSession.setConnection(TEST_CONNECTION); geminiSession.setCredentials(account());
  const pending = geminiSession.fetch('a'); await tick(); assert.equal(signals.length, 2);
  useStore.getState().removeLayer('b');
  assert(signals.every((signal) => !signal.aborted));
  assert.strictEqual(useStore.getState().layers.a, a);
  useStore.getState().removeLayer('a');
  assert(signals.every((signal) => signal.aborted));
  assert.equal((await pending).error.code, 'request_aborted');
  assert.equal(geminiSession.getSnapshot().source, null);
  assert(photoSession.getFile(photoId)); assert.strictEqual(useStore.getState().settings, settings);
  assert.equal(geminiSession.getSnapshot().result, null);
  useStore.getState().resetAll();
});
test('actual full reset clears credentials/results and invalidates late transport without changing store schema', async (t) => {
  useStore.getState().resetAll();
  useStore.setState({ layers: { a: layer() }, layerOrder: ['a'], data: { legacy: true } });
  const keys = Object.keys(useStore.getState()).sort();
  const late = [], signals = [];
  t.mock.method(globalThis, 'fetch', (_url, init) => {
    signals.push(init.signal); return new Promise((resolve) => late.push(resolve));
  });
  const credentials = account(); geminiSession.setConnection(TEST_CONNECTION); geminiSession.setCredentials(credentials);
  const pending = geminiSession.fetch('a'); await tick();
  // Extent came from selected layer, despite unrelated legacy state.data.
  assert.deepEqual(geminiSession.getSnapshot().request.bbox, [579200, 6559100, 579400, 6559300]);
  useStore.getState().resetAll(); assert(signals.every((signal) => signal.aborted));
  for (const resolve of late) resolve(new Response('late synthetic XML'));
  assert.equal((await pending).error.code, 'request_aborted');
  assert.equal(geminiSession.getSnapshot().result, null);
  assert.equal(geminiSession.getSnapshot().connectionStatus, 'disconnected');
  useStore.setState({ layers: { a: layer() }, layerOrder: ['a'] });
  assert.equal((await geminiSession.fetch('a')).error.code, 'credentials_unavailable');
  assert.equal(signals.length, 2); assert.deepEqual(Object.keys(useStore.getState()).sort(), keys);
  assert(!JSON.stringify(useStore.getState()).includes(credentials.username));
  useStore.getState().resetAll();
});
test('store revision changes abort Gemini; unrelated store/photo changes never fetch', async (t) => {
  useStore.getState().resetAll(); const original = layer();
  useStore.setState({ layers: { a: original }, layerOrder: ['a'] });
  let called = 0; const signals = [];
  t.mock.method(globalThis, 'fetch', (_url, init) => { called++; signals.push(init.signal); return new Promise(() => {}); });
  geminiSession.setConnection(TEST_CONNECTION); geminiSession.setCredentials(account()); geminiSession.selectSource('a');
  useStore.setState({ layers: { a: { ...original, visible: false } } });
  photoSession.importFiles([new File(['synthetic'], 'photo.heic')]);
  useStore.setState({ ui: { ...useStore.getState().ui, activeViewTab: '3d' } });
  assert.equal(called, 0);
  const pending = geminiSession.fetch('a'); await tick();
  useStore.setState({ layers: { a: layer() } });
  assert(signals.every((signal) => signal.aborted));
  assert.equal((await pending).error.code, 'request_aborted'); assert.equal(called, 2);
  useStore.getState().resetAll();
});
