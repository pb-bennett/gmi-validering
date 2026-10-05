import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getFallbackLayerHighlightColor, getLayerHighlightStyle } from '../src/lib/map/layerHighlight.mjs';

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
  assert.match(layerManager, /getWorkspaceLayerEntries\(layers, layerOrder, photoLayers\)/);
  assert.match(layerManager, /entries.map\(\(entry\) => entry.kind === 'photo'/);
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

test('sidebar rows show each stored layer colour with a stable fallback and existing controls', () => {
  assert.match(layerPanel, /getLayerHighlightStyle\(layer, layerId\)\.color/);
  assert.match(layerPanel, /className="h-2 w-2 shrink-0 rounded-full border border-gmi-border-strong"/);
  assert.match(layerPanel, /style=\{\{ backgroundColor: layerColor \}\}/);
  assert.match(layerPanel, /title=\{`Markeringsfarge: \$\{layerColor\}`\}/);
  assert.match(layerPanel, /<input[\s\S]*?checked=\{layer\.visible\}/);
  assert.match(layerPanel, /truncate text-xs font-medium text-gmi-text/);
  assert.match(layerPanel, /\{pointCount\} punkt, \{lineCount\} ledn\./);
  assert.match(layerPanel, /title="Zoom til lag"/);
  assert.match(layerPanel, /title="Fjern lag"/);

  const first = { highlightAll: false, highlightStyle: { color: '#123ABC' } };
  const second = { highlightAll: true, highlightStyle: { color: '#45ABCD' } };
  assert.equal(getLayerHighlightStyle(first, 'first').color, '#123ABC');
  first.highlightStyle.color = '#ABCDEF'; // Updated Markeringsfarge value.
  assert.equal(getLayerHighlightStyle(first, 'first').color, '#ABCDEF');
  assert.notEqual(getLayerHighlightStyle(first, 'first').color, getLayerHighlightStyle(second, 'second').color);
  const layers = { first, second };
  const orderedColors = ['first', 'second'].map((id) => getLayerHighlightStyle(layers[id], id).color);
  const reorderedColors = ['second', 'first'].map((id) => getLayerHighlightStyle(layers[id], id).color);
  assert.deepEqual(reorderedColors, [...orderedColors].reverse());
  assert.equal(getLayerHighlightStyle({ highlightAll: false }, 'legacy-layer').color,
    getFallbackLayerHighlightColor('legacy-layer'));
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
  assert.match(panel, /absolute left-\[10px\] top-\[124px\] z-\[1200\]/);
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

test('Lagmarkering trigger aligns with the left edge below zoom and ruler', () => {
  assert.match(panel, /absolute left-\[10px\] top-\[124px\] z-\[1200\]/);
  assert.doesNotMatch(panel, /absolute right-\[14rem\] top-14/);
  assert.match(mapInner, /top: '80px',[\s\S]*?left: '10px'/);
  assert.match(mapInner, /<LayersControl[\s\S]*?position="topright"/);
  assert.match(styles, /\.leaflet-top\.leaflet-right \.leaflet-control-layers \{\s*margin-top: 58px/);
  const constrainedDesktopStyles = styles.match(/@media \(max-height: 1000px\) and \(min-width: 1024px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.doesNotMatch(constrainedDesktopStyles, /right-4 top-14|right:\s*1rem/);
  assert.match(panel, /absolute right-4 top-26 z-\[1250\]/); // Existing useful panel position stays put.
});
