import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import test from 'node:test';
import { getLineStyle } from '../src/lib/map/lineStyle.mjs';
import {
  DEFAULT_HIGHLIGHT_OPACITY,
  DEFAULT_HIGHLIGHT_SPREAD,
  LAYER_HIGHLIGHT_PALETTE,
  getLayerHighlightStyle,
  getLineCasingStyle,
  getPointHaloSpread,
  getPointHaloSvg,
} from '../src/lib/map/layerHighlight.mjs';

register('./esmJsLoader.mjs', import.meta.url);
const { default: useStore } = await import('../src/lib/store.js?layer-halo-test');
const source = await readFile(new URL('../src/components/MapInner.js', import.meta.url), 'utf8');

const emptyData = { format: 'GMI', header: {}, points: [], lines: [] };
const add = (name) => useStore.getState().addLayer({ file: { name }, data: emptyData });
const colors = { VL: '#0101FF', SP: '#02D902', AF: '#ff0000', DR: '#8B4513' };
const semantic = (code, weight, opacity = 0.9) => ({
  ...getLineStyle(code, (key) => colors[key], weight),
  weight,
  opacity,
});

test('new layers receive stable default styles and remain off until toggled', () => {
  const first = add('new.gmi');
  const second = add('existing.sos');
  const state = useStore.getState();
  assert.equal(state.layers[first].highlightAll, false);
  assert.equal(state.layers[second].highlightAll, false);
  assert.deepEqual(state.layers[first].highlightStyle, {
    color: '#D946EF', opacity: 0.55, spread: 4,
  });
  assert.deepEqual(state.layers[second].highlightStyle, {
    color: '#F59E0B', opacity: 0.55, spread: 4,
  });
  assert.equal(state.layers[first].defaultHighlightColor, '#D946EF');
  assert.equal(state.layers[second].defaultHighlightColor, '#F59E0B');
  assert.notEqual(state.layers[first].highlightStyle.color, '#00BFD8');
  assert.notEqual(state.layers[second].highlightStyle.color, '#00BFD8');
  assert.deepEqual(LAYER_HIGHLIGHT_PALETTE.slice(0, 3), [
    '#D946EF', '#F59E0B', '#00BFD8',
  ]);
  assert.equal(state.layers[first].highlightStyle.opacity, 0.55);
  assert.equal(state.layers[first].highlightStyle.spread, 4);
  const third = add('third.gmi');
  assert.equal(useStore.getState().layers[third].highlightStyle.color, '#00BFD8');
  state.toggleLayerVisibility(first);
  assert.equal(useStore.getState().layers[second].highlightStyle.color, '#F59E0B');
  state.removeLayer(first);
  assert.equal(useStore.getState().layers[second].highlightStyle.color, '#F59E0B');
  const fourth = add('fourth.gmi');
  assert.equal(useStore.getState().layers[fourth].highlightStyle.color, '#D946EF');
  useStore.getState().toggleLayerHighlightAll(second);
  assert.equal(useStore.getState().layers[second].highlightAll, true);
});

test('missing or invalid in-memory style gets safe stable fallback', () => {
  const a = getLayerHighlightStyle({ highlightAll: true }, 'old-layer');
  const b = getLayerHighlightStyle({ highlightAll: true }, 'old-layer');
  assert.deepEqual(a, b);
  assert.equal(a.opacity, DEFAULT_HIGHLIGHT_OPACITY);
  assert.equal(a.spread, DEFAULT_HIGHLIGHT_SPREAD);
  assert.equal(DEFAULT_HIGHLIGHT_OPACITY, 0.55);
  assert.equal(DEFAULT_HIGHLIGHT_SPREAD, 4);
  assert.match(a.color, /^#[0-9A-F]{6}$/);
  assert.deepEqual(getLayerHighlightStyle({ highlightStyle: {
    color: 'invalid', opacity: 4, spread: -5,
  } }, 'old-layer'), { color: a.color, opacity: 0.8, spread: 2 });
});

test('panel actions update one layer, clamp values, and reset its assigned colour without changing enablement', () => {
  const first = add('controls-a.gmi');
  const second = add('controls-b.sos');
  const original = useStore.getState().layers[first].defaultHighlightColor;
  const otherStyle = useStore.getState().layers[second].highlightStyle;
  const actions = useStore.getState();

  actions.setLayerHighlightEnabled(first, true);
  assert.equal(useStore.getState().layers[first].highlightAll, true);
  actions.setLayerHighlightEnabled(first, false);
  assert.equal(useStore.getState().layers[first].highlightAll, false);
  actions.toggleLayerHighlightAll(first);
  assert.equal(useStore.getState().layers[first].highlightAll, true);

  actions.setLayerHighlightColor(first, '#123abc');
  assert.equal(useStore.getState().layers[first].highlightStyle.color, '#123ABC');
  actions.setLayerHighlightColor(first, 'invalid');
  assert.equal(useStore.getState().layers[first].highlightStyle.color, '#123ABC');
  actions.setLayerHighlightOpacity(first, 0.1);
  assert.equal(useStore.getState().layers[first].highlightStyle.opacity, 0.2);
  actions.setLayerHighlightOpacity(first, 0.95);
  assert.equal(useStore.getState().layers[first].highlightStyle.opacity, 0.8);
  actions.setLayerHighlightSpread(first, 0);
  assert.equal(useStore.getState().layers[first].highlightStyle.spread, 2);
  actions.setLayerHighlightSpread(first, 12);
  assert.equal(useStore.getState().layers[first].highlightStyle.spread, 8);
  assert.deepEqual(useStore.getState().layers[second].highlightStyle, otherStyle);

  const top = semantic('AFO', 8);
  const configured = getLayerHighlightStyle(useStore.getState().layers[first], first);
  assert.deepEqual(getLineCasingStyle(top, configured).dashArray, '20, 20');
  assert.equal(getLineCasingStyle(top, configured).weight, 16);
  assert.equal(getLineCasingStyle(top, configured).opacity, 0.8);
  assert.match(getPointHaloSvg('water', 18, 2, configured), /stroke="#123ABC"/);
  assert.equal(getPointHaloSpread(configured.spread), 2);

  actions.resetLayerHighlightStyle(first);
  assert.deepEqual(useStore.getState().layers[first].highlightStyle, {
    color: original, opacity: 0.55, spread: 4,
  });
  assert.equal(useStore.getState().layers[first].highlightAll, true);
  assert.deepEqual(useStore.getState().layers[second].highlightStyle, otherStyle);
});

test('changing a palette colour does not give its reset slot to the next upload', () => {
  const palette = LAYER_HIGHLIGHT_PALETTE;
  const occupied = new Set(useStore.getState().layerOrder.map(
    (id) => useStore.getState().layers[id].defaultHighlightColor,
  ));
  const slot = palette.find((color) => !occupied.has(color));
  if (!slot) return;
  const first = add('assigned-colour.gmi');
  assert.equal(useStore.getState().layers[first].defaultHighlightColor, slot);
  useStore.getState().setLayerHighlightColor(first, '#112233');
  const next = add('next-colour.gmi');
  assert.notEqual(useStore.getState().layers[next].defaultHighlightColor, slot);
  useStore.getState().resetLayerHighlightStyle(first);
  assert.equal(useStore.getState().layers[first].highlightStyle.color, slot);
});

test('line casing uses final width, independent colour and opacity, and matching overflow/drainage dashes', () => {
  const layer = { color: '#D946EF', opacity: 0.55, spread: 4 };
  for (const [code, topColor] of [['VL', '#0101FF'], ['SP', '#02D902'], ['AF', '#ff0000']]) {
    const top = semantic(code, 3);
    const halo = getLineCasingStyle(top, layer);
    assert.equal(top.color, topColor);
    assert.equal(halo.color, layer.color);
    assert.equal(halo.weight, 7);
    assert.equal(halo.opacity, 0.55);
    assert.equal(halo.dashArray, null);
    assert.equal(halo.interactive, false);
  }
  for (const code of ['AFO', 'SPO']) {
    const large = semantic(code, 8);
    const selected = semantic(code, 12, 1);
    assert.equal(large.dashArray, '20, 20');
    assert.equal(getLineCasingStyle(large, layer).dashArray, '20, 20');
    assert.equal(getLineCasingStyle(large, layer).weight, 12);
    assert.equal(getLineCasingStyle(large, layer).lineCap, 'butt');
    assert.equal(selected.dashArray, '24, 24');
    assert.equal(getLineCasingStyle(selected, layer).dashArray, '24, 24');
    assert.equal(getLineCasingStyle(selected, layer).weight, 16);
  }
  assert.equal(getLineCasingStyle(semantic('DR', 3), layer).dashArray, '5, 5');
});

test('hidden and faded semantic lines cannot leave a dominant casing', () => {
  const layer = { color: '#00BFD8', opacity: 0.55, spread: 4 };
  assert.equal(getLineCasingStyle({ weight: 0, opacity: 0 }, layer), null);
  assert.equal(getLineCasingStyle({ weight: 2, opacity: 0 }, layer), null);
  const faded = getLineCasingStyle(semantic('SP', 2, 0.3), layer);
  assert.equal(faded.weight, 6);
  assert.ok(faded.opacity > 0.18 && faded.opacity < 0.19);
  assert.equal(semantic('SP', 2, 0.3).opacity, 0.3);
});

test('point casing follows representative silhouettes and leaves semantic SVG as a separate foreground', () => {
  const layer = { color: '#D946EF', opacity: 0.55, spread: 4 };
  assert.equal(getPointHaloSpread(6), 2);
  assert.equal(getPointHaloSpread(4), 2);
  assert.equal(getPointHaloSpread(2), 1);
  assert.equal(getPointHaloSpread(100), 2);
  for (const [category, tag] of [
    ['water', 'circle'], ['wastewater', 'rect'], ['stormwater', 'polygon'],
    ['drainage', 'polygon'], ['manhole', 'polygon'], ['lok', 'circle'],
    ['grokonstr', 'rect'], ['san', 'rect'], ['krn', 'rect'],
  ]) {
    const halo = getPointHaloSvg(category, category === 'lok' ? 8 : 18, 2, layer);
    assert.match(halo, new RegExp(`^<${tag} `));
    assert.match(halo, /stroke="#D946EF"/);
    assert.match(halo, /stroke-opacity="0.55"/);
    assert.match(halo, /fill="none"/);
  }
  assert.match(source, /const content = padding[\s\S]*?\$\{halo\}\$\{svgPath\}/);
  assert.match(source, /iconAnchor: \[iconSize \/ 2, iconSize \/ 2\]/);
  assert.match(source, /return L\.marker\(latlng, \{ icon, zIndexOffset \}\)/);
  assert.match(source, /if \(isHidden \|\| isFilteredOut \|\| isOutlier\)/);
});

test('underlay is line-only, non-interactive and has no popup or measurement handler', () => {
  assert.match(source, /feature\.geometry\?\.type === 'LineString'/);
  assert.match(source, /pane="layer-highlight-casing"/);
  assert.match(source, /pointerEvents: 'none'/);
  assert.match(source, /interactive=\{false\}/);
  assert.match(source, /data=\{casingData\}[\s\S]*?style=\{casingStyle\}[\s\S]*?interactive=\{false\}/);
  assert.match(source, /data=\{geoJsonData\}[\s\S]*?onEachFeature=\{onEachFeature\}/);
  assert.doesNotMatch(source, /layerHighlightActive \|\| hasOtherHighlight/);
});
