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
  // S4 (deliberate update): prose is sized by content with the heading as minimum, 30 chars → 204 (was heading-only 180).
  assert.equal(width('En beskrivelse med lang overskrift', ['Dette er en lengre beskrivelse']), 204);
  assert(width('Høydereferanse', ['UNDERKANT_UTVENDIG'], 'Kode') > width('Høydereferanse', ['ID'], 'Kode'));
  assert.equal(width('S_FCODE', ['x'.repeat(10000)]), 180);
  const ordinary = getBatchReviewColumnWidths({ a: { outcome: 'change', change, findings: [] } });
  const manual = getBatchReviewColumnWidths({ a: { outcome: 'manual', change, canManual: true, findings: [error] } });
  assert(ordinary.batchStatus < manual.batchStatus);
  assert(ordinary.batchFindings < manual.batchFindings);
});

test('S4: free text is content-sized with the heading as minimum and a 240 px cap; other columns are unchanged', () => {
  const merknad = (values, format = 'Tekst') => getOrdinaryColumnWidth({ field: 'Merknad', label: 'Merknad', values, format });
  const before = (field, values, format) => getOrdinaryColumnWidth({ field, label: field, values, format });
  assert.equal(merknad(['Kort']), 73, 'short values keep the unchanged compact rule');
  assert.equal(merknad(['Kontrollert i felt']), 132, '18 characters');
  assert.equal(merknad(['Kontrollert av feltmåler etter graving.']), 240, '40 characters reach the cap');
  assert.equal(merknad(['Merknad '.repeat(10)]), 240, '80 characters');
  assert.equal(merknad(['x'.repeat(10000)]), 240, 'very long values are capped');
  assert.equal(merknad(['Kontrollert i felt'], undefined), 132, 'unknown free-text fields follow the same rule');
  assert.equal(merknad(['', null, undefined]), 72, 'empty column');
  // Codes, numbers and S_FCODE keep their earlier rule, however long the values are.
  assert(before('Høydereferanse', ['UNDERKANT_UTVENDIG_MED_LANG_KODE'], 'Kode') <= 180);
  assert(before('Dimensjon', ['1234567890123'], undefined) <= 180);
  assert.equal(before('S_FCODE', ['x'.repeat(10000)]), 180);
  // Stability: the width depends only on the complete scope's values, not their order or a filtered subset view.
  const scope = ['Kort', 'Kontrollert av feltmåler etter graving.', ''];
  assert.equal(merknad(scope), merknad([...scope].reverse()));
});

test('S4: the review «Endring» column may use the same 240 px cap only for a free-text field', () => {
  const long = { a: { outcome: 'change', change: { from: '', to: 'Kontrollert av feltmåler etter graving i 2026.' }, findings: [] } };
  assert.equal(getBatchReviewColumnWidths(long).batchValue, 200);
  assert.equal(getBatchReviewColumnWidths(long, { textField: true }).batchValue, 240);
  assert.equal(getBatchReviewColumnWidths({ a: { outcome: 'change', change, findings: [] } }, { textField: true }).batchValue, 104);
});

test('S2: transition records keep the review sort (worsened = new FEIL, improved = new SJEKK, existing not ranked)', () => {
  const entry = (findings) => ({ outcome: 'change', change, findings });
  assert.equal(batchReviewSortValue(entry([{ tone: 'error', introduced: true, transition: 'worsened' }]), 'batchFindings'), 0);
  assert.equal(batchReviewSortValue(entry([{ tone: 'warning', introduced: true, transition: 'improved' }]), 'batchFindings'), 1);
  assert.equal(batchReviewSortValue(entry([]), 'batchFindings'), 2, 'only existing findings: «Ingen nye funn»');
});
