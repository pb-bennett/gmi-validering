import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [panel, mapView, layerPanel, layerManager, mapInner, styles] = await Promise.all([
  read('../src/components/LayerHighlightPanel.js'),
  read('../src/components/MapView.js'),
  read('../src/components/LayerPanel.js'),
  read('../src/components/LayerManager.js'),
  read('../src/components/MapInner.js'),
  read('../src/app/globals.css'),
]);

test('map panel lists uploaded layers, handles long names, and has an empty state', () => {
  assert.match(mapView, /<LayerHighlightPanel \/>/);
  assert.match(panel, /layerOrder\.map\(\(layerId, index\) =>/);
  assert.match(panel, /<LayerHighlightControls[\s\S]*?key=\{layerId\}[\s\S]*?index=\{index\}/);
  assert.match(panel, /className="truncate text-sm font-medium text-gmi-text" title=\{layer\.name\}/);
  assert.match(panel, /style=\{\{ backgroundColor: style\.color \}\}/);
  assert.match(panel, /Ingen lag er lastet inn\./);
});

test('panel controls target each layer and share the sidebar enable state', () => {
  assert.match(panel, /setEnabled\(layerId, event\.currentTarget\.checked\)/);
  assert.match(panel, /setColor\(layerId, event\.currentTarget\.value\)/);
  assert.match(panel, /setOpacity\(layerId, percent \/ 100\)/);
  assert.match(panel, /setSpread\(layerId, pixels\)/);
  assert.match(panel, /resetStyle\(layerId\)/);
  assert.match(layerPanel, /toggleLayerHighlightAll\(layerId\)/);
  assert.match(layerManager, /layerOrder\.map\(\(layerId\) =>/);
  assert.match(panel, /moveLayerUp\(layerId\)/);
  assert.match(panel, /moveLayerDown\(layerId\)/);
  assert.match(panel, /disabled=\{index === 0\}/);
  assert.match(panel, /disabled=\{index === layerCount - 1\}/);
  assert.match(panel, /Flytt laget opp/);
  assert.match(panel, /Flytt laget ned/);
  for (const label of ['Lagmarkering', 'Markeringsfarge', 'Styrke', 'Bredde', 'Nullstill']) {
    assert.ok(panel.includes(label));
  }
  assert.match(panel, /min="20"[\s\S]*?max="80"[\s\S]*?step="5"/);
  assert.match(panel, /min="2"[\s\S]*?max="8"[\s\S]*?step="1"/);
});

test('slider drafts commit on release or keyboard completion, leaving the map free while open', () => {
  assert.match(panel, /document\.addEventListener\('pointerup', finish\)/);
  assert.match(panel, /document\.addEventListener\('pointercancel', finish\)/);
  assert.match(panel, /onKeyUp: commit/);
  assert.match(panel, /onBlur: commit/);
  assert.match(panel, /onChange: \(event\) => \{[\s\S]*?setDraft\(next\)/);
  assert.match(panel, /onChange=\{opacity\.onChange\}/);
  assert.match(panel, /onChange=\{spread\.onChange\}/);
  assert.doesNotMatch(panel, /closeOnOutsidePointer/);
});

test('floating control has bounded stacking and isolates map interactions', () => {
  assert.match(panel, /<PaletteIcon size=\{16\} weight="regular"/);
  assert.match(panel, /absolute right-4 top-14 z-\[1200\]/);
  assert.match(panel, /absolute right-4 top-26 z-\[1250\]/);
  assert.match(panel, /layer-highlight-panel gmi-elevated-surface/);
  assert.match(panel, /overflow-y-auto p-3/);
  assert.match(styles, /\.layer-highlight-panel \{\s*max-height: calc\(100% - 7rem\)/);
  assert.match(styles, /@media \(max-height: 1000px\) and \(min-width: 1024px\) \{[\s\S]*?\.layer-highlight-panel \{[\s\S]*?width: 19rem;[\s\S]*?max-height: min\(calc\(100% - 7rem\), 26rem\)/);
  assert.match(styles, /\.layer-highlight-card \{\s*padding: 0\.5rem 0\.625rem/);
  assert.match(styles, /\.layer-highlight-setting \{\s*margin-top: 0\.375rem/);
  assert.match(panel, /onClick=\{stopMapEvent\}/);
  assert.match(panel, /onPointerDown=\{stopMapEvent\}/);
  assert.match(panel, /onWheel=\{stopMapEvent\}/);
  assert.match(panel, /event\.key !== 'Escape'/);
  assert.match(mapInner, /interactive=\{false\}/);
});
