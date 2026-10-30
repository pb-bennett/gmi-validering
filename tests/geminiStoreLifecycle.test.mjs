import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { randomUUID } from 'node:crypto';
import { TEST_CONNECTION } from './fixtures/gemini-wfs/connection.mjs';
import { collection, partialZLine, independentPoint } from './fixtures/gemini-wfs/syntheticProfile.mjs';
import { photoSession } from '../src/lib/photos/photoSession.mjs';
register('./esmJsLoader.mjs', import.meta.url);
const { default: useStore } = await import('../src/lib/store.js');
const { geminiSession } = await import('../src/lib/gemini-wfs/geminiSession.mjs');
const { parseNodeXml } = await import('../src/lib/gemini-wfs/nodeXmlParser.mjs');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const layer = (x = 579300, format = 'GMI') => ({ file: { format, name: `invented.${format.toLowerCase()}` },
  data: { format, header: { COSYS_EPSG: 25832 }, points: [{ id: 'p', attributes: {}, coordinates: [{ x, y: 6559200 }] }], lines: [] } });
const connect = () => { geminiSession.setConnection(TEST_CONNECTION); geminiSession.setCredentials({ username: randomUUID(), password: randomUUID() }); };

test('actual addLayer import automatically adds one pair; ordinary store mutations send zero requests; removal keeps shared data/photos/WMS', async (t) => {
  useStore.getState().resetAll();
  t.after(() => useStore.getState().resetAll());
  const previousParser = globalThis.DOMParser;
  globalThis.DOMParser = class { parseFromString(xml) { return parseNodeXml(xml); } };
  t.after(() => { if (previousParser) globalThis.DOMParser = previousParser; else delete globalThis.DOMParser; });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    return new Response(collection([body.featureType === 'lines' ? partialZLine : independentPoint]), { headers: { 'Content-Type': 'application/gml+xml' } });
  });
  const first = useStore.getState().addLayer(layer());
  const photoId = photoSession.importFiles([new File(['synthetic'], 'keep.heic')]).acceptedIds[0];
  const settings = useStore.getState().settings;
  connect(); await geminiSession.fetch(); assert.equal(calls.length, 2);
  const second = useStore.getState().addLayer(layer(600000, 'KOF')); await tick();
  await geminiSession.fetch(); assert.equal(calls.length, 4);
  assert.deepEqual(calls.slice(2).map((call) => call.bbox), [[599900, 6559100, 600100, 6559300], [599900, 6559100, 600100, 6559300]]);
  assert.deepEqual(geminiSession.getSnapshot().result.counts, { lines: 1, points: 1, total: 2 });
  useStore.setState((state) => ({ layers: { ...state.layers, [first]: { ...state.layers[first], visible: false,
    color: '#123456', highlightAll: true, selected: 'p', data: { ...state.layers[first].data } } } }));
  photoSession.importFiles([new File(['synthetic'], 'another.heic')]);
  await tick(); assert.equal(calls.length, 4);
  useStore.getState().removeLayer(first); await tick(); assert.equal(calls.length, 4);
  assert.equal(geminiSession.getSnapshot().coverages.length, 1); assert.equal(geminiSession.getSnapshot().result.counts.total, 2);
  assert(photoSession.getFile(photoId)); assert.strictEqual(useStore.getState().settings, settings);
  assert.deepEqual(Object.keys(useStore.getState().layers), [second]);
});

test('actual store removes only owned pending coverage and aborts its pair', async (t) => {
  useStore.getState().resetAll(); t.after(() => useStore.getState().resetAll());
  useStore.setState({ layers: { a: layer(), b: layer(600000) }, layerOrder: ['a', 'b'] });
  const calls = [];
  t.mock.method(globalThis, 'fetch', (_url, init) => { calls.push({ signal: init.signal, bbox: JSON.parse(init.body).bbox }); return new Promise(() => {}); });
  connect(); const pending = geminiSession.fetch(); await tick(); assert.equal(calls.length, 4);
  useStore.getState().removeLayer('b'); assert(calls.slice(2).every(({ signal }) => signal.aborted));
  assert(calls.slice(0, 2).every(({ signal }) => !signal.aborted));
  useStore.getState().removeLayer('a'); assert(calls.every(({ signal }) => signal.aborted));
  assert.equal((await pending).ok, false); assert.equal(geminiSession.getSnapshot().result.counts.total, 0);
});

test('full reset clears credentials/results/coverages, invalidates late transport and preserves store schema', async (t) => {
  useStore.getState().resetAll(); t.after(() => useStore.getState().resetAll());
  useStore.setState({ layers: { a: layer() }, layerOrder: ['a'], data: { legacy: true } });
  const keys = Object.keys(useStore.getState()).sort(), calls = [], releases = [];
  t.mock.method(globalThis, 'fetch', (_url, init) => { calls.push(init); return new Promise((resolve) => releases.push(resolve)); });
  connect(); const pending = geminiSession.fetch(); await tick();
  assert.deepEqual(JSON.parse(calls[0].body).bbox, [579200, 6559100, 579400, 6559300]);
  useStore.getState().resetAll(); assert(calls.every((call) => call.signal.aborted));
  releases.forEach((resolve) => resolve(new Response('late invented XML')));
  assert.equal((await pending).ok, false); assert.equal(geminiSession.getSnapshot().result, null);
  assert.equal(geminiSession.getSnapshot().connectionStatus, 'disconnected');
  assert.equal(geminiSession.getSnapshot().coverages.length, 0);
  assert.equal((await geminiSession.fetch()).error.code, 'credentials_unavailable');
  assert.deepEqual(Object.keys(useStore.getState()).sort(), keys);
});
