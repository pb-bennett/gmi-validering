import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getLineStyle,
  getLineLegendSwatchStyle,
  getOverflowDashArray,
  LINE_LEGEND_ITEMS,
} from '../src/lib/map/lineStyle.mjs';

const colors = { AF: '#ff0000', SP: '#02D902', VL: '#0101FF', OV: '#2a2a2a', DR: '#8B4513' };
const colorForCode = (code) => colors[code];

test('overflow lines inherit parent colours and add dashes without changing parent strokes', () => {
  assert.deepEqual(getLineStyle('AF', colorForCode), { color: '#ff0000', dashArray: null });
  assert.deepEqual(getLineStyle('SP', colorForCode), { color: '#02D902', dashArray: null });
  assert.deepEqual(getLineStyle('AFO', colorForCode, 1), { color: '#ff0000', dashArray: '5, 5' });
  assert.deepEqual(getLineStyle('SPO', colorForCode, 1), { color: '#02D902', dashArray: '5, 5' });
  assert.equal(getOverflowDashArray('AF'), null);
  assert.equal(getOverflowDashArray('DR'), null);
});

test('thick overflow strokes receive proportionally larger bounded dashes and gaps', () => {
  for (const code of ['AFO', 'SPO']) {
    const thin = getOverflowDashArray(code, 1);
    const thick = getOverflowDashArray(code, 8);
    const extreme = getOverflowDashArray(code, 1000);
    const [dash, gap] = thick.split(', ').map(Number);

    assert.equal(thin, '5, 5');
    assert.equal(thick, '20, 20');
    assert.ok(gap >= 2 * 8, `${code} gap should remain at least twice the thick stroke`);
    assert.equal(extreme, '24, 24', 'maximum prevents excessive dash lengths');
    assert.deepEqual(getLineStyle(code, colorForCode, 8).color, code === 'AFO' ? '#ff0000' : '#02D902');
    assert.ok(dash > 5);
  }
});

test('existing drainage dashes and other line colours remain intact', () => {
  assert.deepEqual(getLineStyle('DR', colorForCode), { color: '#8B4513', dashArray: '5, 5' });
  assert.deepEqual(getLineStyle('VL', colorForCode), { color: '#0101FF', dashArray: null });
  assert.deepEqual(getLineStyle('OV', colorForCode), { color: '#2a2a2a', dashArray: null });
});

test('2D legend includes parent and overflow entries with matching stroke samples', () => {
  assert.deepEqual(
    LINE_LEGEND_ITEMS.map(({ fcode }) => fcode),
    ['AF', 'AFO', 'VL', 'SP', 'SPO', 'OV', 'DR'],
  );
  assert.match(LINE_LEGEND_ITEMS.find(({ fcode }) => fcode === 'AFO').label, /Avløp overløp/);
  assert.match(LINE_LEGEND_ITEMS.find(({ fcode }) => fcode === 'SPO').label, /Spillvann overløp/);
  assert.deepEqual(getLineLegendSwatchStyle('AF', colorForCode), { backgroundColor: '#ff0000' });
  assert.deepEqual(getLineLegendSwatchStyle('SP', colorForCode), { backgroundColor: '#02D902' });
  assert.match(getLineLegendSwatchStyle('AFO', colorForCode).backgroundImage, /#ff0000 5px, transparent 5px, transparent 10px/);
  assert.match(getLineLegendSwatchStyle('SPO', colorForCode).backgroundImage, /#02D902 5px, transparent 5px, transparent 10px/);
  assert.match(getLineLegendSwatchStyle('DR', colorForCode).backgroundImage, /#8B4513 3px, transparent 3px, transparent 6px/);
});

test('map and legend consume the shared 2D line style functions', async () => {
  const [map, legend] = await Promise.all([
    readFile(new URL('../src/components/MapInner.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/MapLegend.js', import.meta.url), 'utf8'),
  ]);
  assert.match(map, /const baseWeight = getLineWeight\(feature\.properties\)/);
  assert.match(map, /const lineStyle = getLineStyle\(fcode, getColorByFCode, weight\)/);
  assert.match(map, /getLineStyle\(fcode, getColorByFCode, baseWeight\)/);
  assert.match(map, /dashArray: lineStyle\.dashArray/);
  assert.match(map, /const weight = 8;[\s\S]*?getLineStyle\(fcode, getColorByFCode, weight\)/);
  assert.match(map, /const weight = 2;[\s\S]*?getLineStyle\(fcode, getColorByFCode, weight\)/);
  assert.match(legend, /LINE_LEGEND_ITEMS\.map/);
  assert.match(legend, /style=\{getLineLegendSwatchStyle\(fcode,/);
});
