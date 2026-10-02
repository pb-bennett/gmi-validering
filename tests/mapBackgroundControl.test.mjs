import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import test from 'node:test';

register('./esmJsLoader.mjs', import.meta.url);
const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};
globalThis.window = { localStorage: globalThis.localStorage };
const { default: useStore } = await import('../src/lib/store.js?map-background-test');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [map, css, sidebar, leaflet] = await Promise.all([
  read('../src/components/MapInner.js'),
  read('../src/app/globals.css'),
  read('../src/components/LayerPanel.js'),
  read('../node_modules/leaflet/src/control/Control.Layers.js'),
]);
const control = map.slice(map.indexOf('      <LayersControl'), map.indexOf('      </LayersControl>'));
const persisted = () => JSON.parse(values.get('gmi-validator-storage')).state;

test('existing right-edge Leaflet picker keeps four radio backgrounds and one boundary checkbox', () => {
  assert.deepEqual([...control.matchAll(/<LayersControl.BaseLayer[\s\S]*?name="([^"]+)"/g)].map((m) => m[1]),
    ['Kartverket Topo', 'Kartverket Gråtone', 'OpenStreetMap', 'Ingen']);
  assert.deepEqual([...control.matchAll(/<LayersControl.Overlay[\s\S]*?name="([^"]+)"/g)].map((m) => m[1]), ['Eiendomsgrenser']);
  assert.match(control, /position="topright"/);
  assert.match(control, /checked=\{mapOverlayVisibility.eiendomsgrenser !== false\}/);
  assert.match(map, /map.on\('baselayerchange', handleBaseLayerChange\)/);
  assert.match(map, /map.on\('overlayadd', handleOverlayAdd\)/);
  assert.match(map, /map.on\('overlayremove', handleOverlayRemove\)/);
  // The retained mechanism supplies real labelled inputs and map-event isolation.
  assert.match(leaflet, /createElement\('label'\)/);
  assert.match(leaflet, /input.type = 'checkbox'/);
  assert.match(leaflet, /_createRadioElement/);
  assert.match(leaflet, /disableClickPropagation/);
  assert.match(leaflet, /disableScrollPropagation/);
  assert.match(leaflet, /collapsed: true/);
  assert.match(css, /accent-color: var\(--gmi-interactive\)/);
  assert.match(css, /\.leaflet-control-layers-selector:focus-visible/);
  assert.match(css, /\.leaflet-control-layers-toggle:focus-visible/);
});

test('semantic GeoJSON and casing render outside the picker under sidebar layer visibility', () => {
  assert.doesNotMatch(map, /name="Data"|mapOverlayVisibility.data|onOverlayChange\('data'/);
  assert.doesNotMatch(control, /<GeoJSON/);
  const afterControl = map.slice(map.indexOf('      </LayersControl>'));
  assert.match(afterControl, /data=\{casingData\}/);
  assert.match(afterControl, /data=\{geoJsonData\}[\s\S]*?style=\{lineStyle\}[\s\S]*?pointToLayer=\{pointToLayer\}[\s\S]*?onEachFeature=\{onEachFeature\}/);
  assert.match(map, /if \(!layerInfo.visible \|\| !layerInfo.data\) continue/);
  assert.match(sidebar, /checked=\{layer.visible\}/);
  const data = { format: 'GMI', header: {}, points: [], lines: [] };
  const id = useStore.getState().addLayer({ file: { name: 'visible.gmi' }, data });
  assert.equal(useStore.getState().layers[id].visible, true);
  useStore.getState().toggleLayerVisibility(id);
  assert.equal(useStore.getState().layers[id].visible, false);
  useStore.getState().toggleLayerVisibility(id);
  assert.equal(useStore.getState().layers[id].visible, true);
  assert.equal(useStore.getState().layers[id].data, data);
});

test('fresh and legacy missing boundary preferences resolve ON; explicit booleans survive hydration', async () => {
  assert.equal(useStore.getState().ui.mapOverlayVisibility.eiendomsgrenser, true);
  for (const overlay of [undefined, {}, { eiendomsgrenser: true }, { eiendomsgrenser: false }]) {
    values.set('gmi-validator-storage', JSON.stringify({ version: 3, state: { ui: { mapOverlayVisibility: overlay } } }));
    await useStore.persist.rehydrate();
    assert.equal(useStore.getState().ui.mapOverlayVisibility.eiendomsgrenser, overlay?.eiendomsgrenser !== false);
  }
});

test('OFF and ON toggles persist and reload without persisting uploaded layers; basemap persistence survives', async () => {
  for (const visible of [false, true]) {
    useStore.getState().setMapOverlayVisibility('eiendomsgrenser', visible);
    assert.equal(persisted().ui.mapOverlayVisibility.eiendomsgrenser, visible);
    await useStore.persist.rehydrate();
    assert.equal(useStore.getState().ui.mapOverlayVisibility.eiendomsgrenser, visible);
    assert.equal(persisted().layers, undefined);
    assert.equal(persisted().layerOrder, undefined);
    assert.equal(persisted().data, undefined);
  }
  useStore.getState().setMapBaseLayer('Ingen');
  assert.equal(persisted().ui.mapBaseLayer, 'Ingen');
  await useStore.persist.rehydrate();
  assert.equal(useStore.getState().ui.mapBaseLayer, 'Ingen');
});
