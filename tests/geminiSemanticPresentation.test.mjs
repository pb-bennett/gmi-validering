import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { getGeminiPresentationInput } from '../src/lib/gemini-wfs/geminiPresentationAdapter.mjs';
import { getSemanticLineStyle, getSemanticPointSymbol, FCODE_COLORS } from '../src/lib/map/semanticPresentation.mjs';
import { getLineCasingStyle } from '../src/lib/map/layerHighlight.mjs';

const record = (values) => ({ attributes: Object.fromEntries(Object.entries(values).map(([key, rawText]) => [key, { state: 'text', rawText }])) });

for (const [title, code] of [['Vannledning', 'VL'], ['Spillvannsledning', 'SP'], ['Overvannsledning', 'OV'], ['Drensledning', 'DR']]) {
  test(`Gemini ${title} uses identical survey semantic presentation`, () => {
    const input = getGeminiPresentationInput(record({ FCODE: '001', FCODE_TITLE: title, DIM: '160.00' }));
    for (const selected of [false, true]) {
      assert.deepEqual(getSemanticLineStyle(input, selected), getSemanticLineStyle({ S_FCODE: code, DIM: '160.00' }, selected));
    }
    assert.equal(getSemanticLineStyle(input).color, FCODE_COLORS[code]);
    // Point symbols use the same classification/renderer for supported codes.
    assert.deepEqual(getSemanticPointSymbol(input), getSemanticPointSymbol({ S_FCODE: code }));
  });
}

test('canonical Gemini point codes and reliable titles reuse survey symbols, including manholes', () => {
  for (const code of Object.keys(FCODE_COLORS)) {
    const input = getGeminiPresentationInput(record({ FCODE: code }));
    for (const marking of [null, { color: '#123456', spread: 4, opacity: 0.55 }]) {
      assert.deepEqual(getSemanticPointSymbol(input, false, marking), getSemanticPointSymbol({ S_FCODE: code }, false, marking));
    }
  }
  for (const [title, code] of [['Avløpskum', 'KUM'], ['Kumlokk', 'LOK'], ['Sluk', 'SLU'], ['Sandfang', 'SAN']]) {
    assert.deepEqual(getSemanticPointSymbol(getGeminiPresentationInput(record({ FCODE: '002', FCODE_TITLE: title }))), getSemanticPointSymbol({ S_FCODE: code }));
  }
});

test('unknown/nil/ambiguous lookup IDs do not invent semantic types or change source attributes', () => {
  const source = record({ FCODE: '001', FCODE_TITLE: 'Ukjent objekt', NETTYPE_TITLE: 'Vann' });
  const before = JSON.stringify(source);
  const input = getGeminiPresentationInput(source);
  assert.equal(input.S_FCODE, null);
  assert.deepEqual(getSemanticLineStyle(input), getSemanticLineStyle({ S_FCODE: null }));
  assert.deepEqual(getSemanticPointSymbol(input), getSemanticPointSymbol({ S_FCODE: null }));
  assert.equal(JSON.stringify(source), before);
});

test('shared marking changes only casing, and the shared point renderer includes or omits its halo', () => {
  const properties = { S_FCODE: 'SP', DIM: '160' }, foreground = getSemanticLineStyle(properties);
  for (const style of [{ color: '#123456', spread: 2, opacity: 0.2 }, { color: '#ABCDEF', spread: 8, opacity: 0.8 }]) {
    const halo = getLineCasingStyle(foreground, style);
    assert.equal(halo.weight, foreground.weight + style.spread);
    assert.equal(halo.opacity, style.opacity);
    assert.equal(halo.color, style.color);
    assert.deepEqual(getSemanticLineStyle(properties), foreground);
    const symbol = getSemanticPointSymbol(properties, false, style);
    assert(symbol.html.includes(`stroke="${style.color}"`));
    assert(symbol.html.includes(`stroke="${foreground.color}"`));
  }
  assert(!getSemanticPointSymbol(properties).html.includes('stroke-opacity'));
});

test('both data domains call shared renderers; external settings use the existing Lagmarkering panel', async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
  const [survey, external, panel] = await Promise.all([read('../src/components/MapInner.js'), read('../src/components/gemini-wfs/GeminiInspectionSide.js'), read('../src/components/LayerHighlightPanel.js')]);
  for (const source of [survey, external]) for (const helper of ['getSemanticLineStyle', 'getSemanticPointSymbol']) assert(source.includes(helper));
  assert.match(panel, /actions=\{geminiMarkingActions\}/);
  assert.doesNotMatch(external, /useStore|addLayer\(|setState|validation|analysis/);
  assert.doesNotMatch(external, /circleMarker|getGeminiFeatureStyle|getGeminiHaloStyle/);
});
