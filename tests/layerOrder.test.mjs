import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import test from 'node:test';
import {
  getLayerMarkerZIndexOffset,
  getLayerPaintOrder,
  moveLayerInOrder,
} from '../src/lib/map/layerOrder.mjs';

register('./esmJsLoader.mjs', import.meta.url);
const { default: useStore } = await import('../src/lib/store.js?layer-order-test');
const mapSource = await readFile(new URL('../src/components/MapInner.js', import.meta.url), 'utf8');
const emptyData = { format: 'GMI', header: {}, points: [], lines: [] };
const add = (name) => useStore.getState().addLayer({ file: { name }, data: emptyData });

test('front-to-back UI order paints bottom-to-top without mutating the list', () => {
  const order = ['new-gmi', 'existing-sosi', 'older'];
  assert.deepEqual(getLayerPaintOrder(order), ['older', 'existing-sosi', 'new-gmi']);
  assert.deepEqual(order, ['new-gmi', 'existing-sosi', 'older']);
  assert.deepEqual(moveLayerInOrder(order, 'existing-sosi', -1), ['existing-sosi', 'new-gmi', 'older']);
  assert.deepEqual(moveLayerInOrder(order, 'existing-sosi', 1), ['new-gmi', 'older', 'existing-sosi']);
  assert.equal(moveLayerInOrder(order, 'new-gmi', -1), order);
  assert.equal(moveLayerInOrder(order, 'older', 1), order);
  assert.equal(moveLayerInOrder(order, 'unknown', -1), order);
});

test('new uploads stay visually in front and reorder only the authoritative order', () => {
  const oldest = add('old.sos');
  const middle = add('middle.gmi');
  const newest = add('new.gmi');
  const before = useStore.getState();
  assert.deepEqual(before.layerOrder, [newest, middle, oldest]);
  assert.deepEqual(getLayerPaintOrder(before.layerOrder), [oldest, middle, newest]);

  before.setAnalysisLayerId(middle);
  before.setHighlightedLayer(middle);
  before.updateLayer(middle, { hiddenCodes: ['VL'], hiddenTypes: [{ type: 'x', code: null }] });
  before.toggleLayerVisibility(oldest);
  const guarded = useStore.getState();
  const layerRefs = guarded.layers;
  const dataRef = guarded.layers[middle].data;
  const styleRef = guarded.layers[middle].highlightStyle;
  const color = guarded.layers[middle].defaultHighlightColor;
  const nonce = guarded.ui.mapUpdateNonce;

  guarded.moveLayerUp(middle);
  let after = useStore.getState();
  assert.deepEqual(after.layerOrder, [middle, newest, oldest]);
  assert.equal(after.layers, layerRefs);
  assert.equal(after.layers[middle].data, dataRef);
  assert.equal(after.layers[middle].highlightStyle, styleRef);
  assert.equal(after.layers[middle].defaultHighlightColor, color);
  assert.equal(after.layers[middle].visible, true);
  assert.equal(after.layers[oldest].visible, false);
  assert.deepEqual(after.layers[middle].hiddenCodes, ['VL']);
  assert.deepEqual(after.layers[middle].hiddenTypes, [{ type: 'x', code: null }]);
  assert.equal(after.analysis.layerId, middle);
  assert.equal(after.ui.highlightedLayerId, middle);
  assert.equal(after.ui.mapUpdateNonce, nonce);

  after.moveLayerDown(middle);
  after = useStore.getState();
  assert.deepEqual(after.layerOrder, [newest, middle, oldest]);
  const orderRef = after.layerOrder;
  after.moveLayerUp(newest);
  after.moveLayerDown(oldest);
  after.moveLayerUp('unknown-layer');
  assert.equal(useStore.getState().layerOrder, orderRef);
});

test('marker rank follows order and selected points remain above ordinary points', () => {
  const order = ['gmi', 'sosi', 'third'];
  const top = getLayerMarkerZIndexOffset(order, 'gmi');
  const bottom = getLayerMarkerZIndexOffset(order, 'third');
  assert.ok(top - bottom > 10000);
  assert.ok(getLayerMarkerZIndexOffset(order, 'third', true) > top);
  const reversed = ['third', 'sosi', 'gmi'];
  assert.ok(getLayerMarkerZIndexOffset(reversed, 'third') >
    getLayerMarkerZIndexOffset(reversed, 'gmi'));
  assert.equal(getLayerMarkerZIndexOffset(order, 'unknown'), 0);
});

test('semantic and casing paths share ordered projected features; marker anchor and popup remain singular', () => {
  assert.match(mapSource, /const paintOrder = useMemo\(\(\) => getLayerPaintOrder\(layerOrder\)/);
  assert.match(mapSource, /return paintOrder\s*\.map\(\(id\) =>/);
  assert.match(mapSource, /const casingData = useMemo\(\(\) => \{[\s\S]*?geoJsonData\.features\.filter/);
  assert.match(mapSource, /data=\{casingData\}[\s\S]*?data=\{geoJsonData\}/);
  assert.match(mapSource, /getLayerMarkerZIndexOffset\(visibleLayerOrder, id, true\)/);
  assert.match(mapSource, /return L\.marker\(latlng, \{ icon, zIndexOffset \}\)/);
  assert.match(mapSource, /iconAnchor: \[iconSize \/ 2, iconSize \/ 2\]/);
  assert.match(mapSource, /layer\.bindPopup\(/);
  assert.match(mapSource, /cached\.data === source\.data/);
  assert.match(mapSource, /projectedLayerFeaturesRef\.current\.set\(layerId/);
  assert.match(mapSource, /const fitBoundsKey = useMemo\([\s\S]*?\.sort\(\)/);
});
