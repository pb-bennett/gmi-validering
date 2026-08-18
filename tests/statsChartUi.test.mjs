import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { filterActiveTooltipEntries } from '../src/lib/stats/chartTooltip.mjs';

const read = (relativePath) =>
  fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const entry = (dataKey, value, periodCount) => ({
  dataKey,
  value,
  payload: { periodCounts: { [dataKey]: periodCount } },
});

test('statistics chart starts in per-kommune mode with existing defaults', () => {
  const modal = read('src/components/StatsModal.js');

  assert.match(modal, /useState\('daily'\)/);
  assert.match(modal, /useState\('count'\)/);
  assert.match(modal, /useState\('per'\)/);
  assert.match(modal, /onClick=\{\(\) => changeChartMode\('total'\)\}/);
  assert.match(modal, /onClick=\{\(\) => changeChartMode\('per'\)\}/);
});

test('count tooltips include only active municipality and unresolved series', () => {
  const visible = filterActiveTooltipEntries(
    [
      entry('A', 3, 3),
      entry('B', 0, 0),
      entry('C', 1, 1),
      entry('__unresolved__', 2, 2),
    ],
    'per',
  );

  assert.deepEqual(visible.map(({ dataKey }) => dataKey), [
    'A',
    'C',
    '__unresolved__',
  ]);
  assert.deepEqual(
    filterActiveTooltipEntries([entry('__unresolved__', 0, 0)], 'per'),
    [],
  );
});

test('cumulative tooltips filter by new activity but preserve cumulative values', () => {
  const visible = filterActiveTooltipEntries(
    [entry('A', 20, 0), entry('B', 12, 2)],
    'per',
  );

  assert.deepEqual(visible, [entry('B', 12, 2)]);
  assert.equal(visible[0].value, 12);
});

test('total tooltips remain unfiltered', () => {
  const payload = [entry('total', 3, 0)];
  assert.deepEqual(filterActiveTooltipEntries(payload, 'total'), payload);
});

test('comparison rows retain plotted values and carry period counts separately', () => {
  const modal = read('src/components/StatsModal.js');

  assert.match(modal, /const row = \{ period: point\[field\], periodCounts: \{\} \}/);
  assert.match(modal, /row\.periodCounts\[id\]/);
  assert.match(modal, /valueMode === 'cumulative'/);
  assert.match(modal, /previous\.get\(id\)/);
  assert.match(modal, /filterActiveTooltipEntries\(payload, chartMode\)/);
});
