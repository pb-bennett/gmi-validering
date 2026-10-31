import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { randomUUID } from 'node:crypto';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { photoSession } from '../src/lib/photos/photoSession.mjs';
import { loadedGmiSources } from '../src/lib/photos/loadedGmiSource.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { createGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { TEST_CONNECTION } from './fixtures/gemini-wfs/connection.mjs';
import { collection, partialZLine, independentPoint } from './fixtures/gemini-wfs/syntheticProfile.mjs';
register('./esmJsLoader.mjs', import.meta.url);
const { default: useStore } = await import('../src/lib/store.js');
const { geminiSession } = await import('../src/lib/gemini-wfs/geminiSession.mjs');
const { parseNodeXml } = await import('../src/lib/gemini-wfs/nodeXmlParser.mjs');
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function load() {
  const file = gmiFile([{ hyperlink: 'h:1(link:"a.png") ' }], 'Synthetic loaded.gmi');
  const parser = new GMIParser(decodeGmiBytes(new Uint8Array(await file.arrayBuffer())));
  const data = parser.toObject();
  const id = useStore.getState().addLayer({ file: { name: file.name, format: 'GMI' }, data,
    sourceInput: { file, evidence: createGmiPhotoSource(parser) } });
  return { id, data };
}
const begin = (id, target = null) => {
  const ticket = loadedGmiSources.begin(id); assert(ticket);
  return photoSession.beginLoadedGmiImport({ binding: ticket.binding, isLive: loadedGmiSources.isLive,
    read: () => loadedGmiSources.read(ticket) }, target);
};

test('actual survey store captures the original outside persisted data; normal UI changes preserve binding, replacement invalidates draft', async (t) => {
  useStore.getState().resetAll(); t.after(() => useStore.getState().resetAll());
  const { id, data } = await load();
  assert(loadedGmiSources.available(id));
  assert.equal('sourceInput' in useStore.getState().layers[id], false);
  assert.strictEqual(useStore.getState().layers[id].data, data);
  useStore.getState().toggleLayerVisibility(id);
  assert(loadedGmiSources.available(id));
  await begin(id); const [photoId] = photoSession.importFiles([new File(['synthetic'], 'a.png')]).acceptedIds;
  const review = photoSession.reviewLoadedGmiImport();
  useStore.setState((state) => ({ layers: { ...state.layers, [id]: { ...state.layers[id], data: { ...data } } } }));
  assert.equal(loadedGmiSources.available(id), false);
  assert.equal(photoSession.getSnapshot().loadedImport.state, 'error');
  assert.equal(photoSession.getFile(photoId), null);
  assert.equal(photoSession.applyLoadedGmiImport(review).ok, false);
});

test('workspace-wide WFS fetches only survey coverage: loaded-GMI photo import/edit/append/remove generate zero additional requests', async (t) => {
  useStore.getState().resetAll(); t.after(() => useStore.getState().resetAll());
  const previousParser = globalThis.DOMParser;
  globalThis.DOMParser = class { parseFromString(xml) { return parseNodeXml(xml); } };
  t.after(() => { if (previousParser) globalThis.DOMParser = previousParser; else delete globalThis.DOMParser; });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    return new Response(collection([body.featureType === 'lines' ? partialZLine : independentPoint]), { headers: { 'Content-Type': 'application/gml+xml' } });
  });
  const { id } = await load();
  geminiSession.setConnection(TEST_CONNECTION); geminiSession.setCredentials({ username: randomUUID(), password: randomUUID() });
  await geminiSession.fetch(); assert.equal(calls.length, 2);
  await begin(id); const [photoId] = photoSession.importFiles([new File(['synthetic'], 'a.png')]).acceptedIds;
  const result = photoSession.applyLoadedGmiImport(photoSession.reviewLoadedGmiImport()); assert(result.ok);
  photoSession.applyManualPlacement(photoSession.beginManualPlacement(result.layer.id, photoId), { crs: 'EPSG:4326', longitude: 10, latitude: 60 });
  photoSession.applyDirectionEdit(photoSession.beginDirectionEdit(result.layer.id, photoId), 90);
  await begin(id, result.layer.id); photoSession.importFiles([new File(['synthetic'], 'a.png')]);
  assert(photoSession.applyLoadedGmiImport(photoSession.reviewLoadedGmiImport()).ok);
  photoSession.setLayerVisibility(result.layer.id, false); photoSession.setLayerVisibility(result.layer.id, true);
  await tick(); assert.equal(calls.length, 2);
  assert.equal(geminiSession.getSnapshot().coverages.length, 1);
  const current = photoSession.getPhoto(photoId).spatial.current;
  useStore.getState().removeLayer(id); await tick();
  assert.equal(calls.length, 2);
  assert.equal(photoSession.getLayer(result.layer.id).spatialSources[0].loadedBinding.live, false);
  assert.strictEqual(photoSession.getPhoto(photoId).spatial.current, current);
  assert(photoSession.getFile(photoId));
  photoSession.deleteLayer(result.layer.id); assert.equal(photoSession.getFile(photoId), null);
});

test('actual full reset drops source input availability, originals and stale reconciliation plans', async (t) => {
  useStore.getState().resetAll(); t.after(() => useStore.getState().resetAll());
  const { id } = await load(); await begin(id);
  const [photoId] = photoSession.importFiles([new File(['synthetic'], 'a.png')]).acceptedIds;
  const review = photoSession.reviewLoadedGmiImport();
  useStore.getState().resetAll();
  assert.equal(loadedGmiSources.begin(id), null); assert.equal(photoSession.getFile(photoId), null);
  assert.equal(photoSession.applyLoadedGmiImport(review).ok, false);
  assert.equal(photoSession.getSnapshot().photoLayers.length, 0);
});
