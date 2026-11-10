import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table';
import { createBatchReviewColumnAccessors, batchReviewSortValue, getBatchReviewColumnWidths } from '../src/lib/gmiTableReviewPresentation.mjs';
import { getOrdinaryColumnWidth } from '../src/lib/objectTablePresentation.js';

const change = { from: '', to: '11' };
const error = { tone: 'error', introduced: true };
const warning = { tone: 'warning', introduced: true };
const entries = [
  undefined,
  { outcome: 'skipped', hypothetical: { change, findings: [error] } },
  { outcome: 'change', change, findings: [warning] },
  { outcome: 'manual', change, findings: [error] },
  { outcome: 'unchanged' },
  { outcome: 'excluded', findings: [error] },
  { outcome: 'stale' },
  { outcome: 'added' },
  { outcome: 'change', change, findings: [{ ...error, introduced: false }] },
  { outcome: 'change', change, findings: [] },
];
const rows = Object.fromEntries(entries.map((entry, index) => [`line:${index}`, entry]));
const data = entries.map((_, __index) => ({ __index, id: 100 + __index, attributes: {} }));
function sorted(id, desc = false) {
  const table = createTable({ data, columns: createBatchReviewColumnAccessors({ rows, scope: 'line' }),
    state: { sorting: [{ id, desc }] }, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  return table.getRowModel().rows.map((row) => row.original.__index);
}

test('status sorting keeps actual/manual ties in source order and unrelated rows last in both directions', () => {
  assert.deepEqual(sorted('batchStatus'), [2, 3, 8, 9, 4, 5, 1, 6, 7, 0]);
  assert.deepEqual(sorted('batchStatus', true), [6, 7, 1, 5, 4, 2, 3, 8, 9, 0]);
  assert.deepEqual(data.map((row) => row.id), entries.map((_, index) => 100 + index));
});

test('change sorting groups actual changes, never hypothetical or excluded changes', () => {
  assert.deepEqual(sorted('batchValue').slice(0, 4), [2, 3, 8, 9]);
  assert.deepEqual(sorted('batchValue', true).slice(0, 5), [1, 4, 5, 6, 7]);
  assert.equal(batchReviewSortValue(entries[1], 'batchValue'), 1);
});

test('findings rank only introduced severity on actual changes; equal groups remain stable', () => {
  assert.deepEqual(sorted('batchFindings'), [3, 2, 1, 4, 5, 6, 7, 8, 9, 0]);
  assert.deepEqual(sorted('batchFindings', true), [1, 4, 5, 6, 7, 8, 9, 2, 3, 0]);
  assert.equal(batchReviewSortValue(entries[1], 'batchFindings'), 2, 'hypothetical FEIL');
  assert.equal(batchReviewSortValue(entries[5], 'batchFindings'), 2, 'excluded FEIL');
  assert.equal(batchReviewSortValue(entries[8], 'batchFindings'), 2, 'existing FEIL');
});

test('selective widths reclaim short codes/numbers/empty fields while prose keeps comfortable space', () => {
  const width = (field, values, format) => getOrdinaryColumnWidth({ field, label: field, values, format });
  assert.equal(width('S_FCODE', ['VL', 'SP']), 56);
  assert(width('Nett type', ['VL', 'SP'], 'Kode') < 100);
  assert(width('InnvendigUtvendig', ['ID', 'UD'], 'Kode') < 100);
  assert(width('Langt numerisk attributtnavn', [null, '', 0, 150]) < 100);
  assert.equal(width('Et tomt attributt med langt navn', [null, '', undefined]), 72);
  assert.equal(width('En beskrivelse med lang overskrift', ['Dette er en lengre beskrivelse']), 180);
  assert(width('Høydereferanse', ['UNDERKANT_UTVENDIG'], 'Kode') > width('Høydereferanse', ['ID'], 'Kode'));
  assert.equal(width('S_FCODE', ['x'.repeat(10000)]), 180);
  const ordinary = getBatchReviewColumnWidths({ a: { outcome: 'change', change, findings: [] } });
  const manual = getBatchReviewColumnWidths({ a: { outcome: 'manual', change, canManual: true, findings: [error] } });
  assert(ordinary.batchStatus < manual.batchStatus);
  assert(ordinary.batchFindings < manual.batchFindings);
});
