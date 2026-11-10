import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table';
import { gmiSelectionBinding, reduceGmiEditSelection, reconcileGmiEditSelection, gmiSelectionCounts, gmiSelectedFeatureIds } from '../src/lib/gmiEditSelection.mjs';
import { deriveLayerTableRows } from '../src/lib/layerTableRows.mjs';

const binding = { layerId: 'a', sessionId: 'session-a', fingerprint: 'sha-a' };
const counts = { line: 80, point: 3 };
const reduce = (state, action, context = { binding, counts }) => reduceGmiEditSelection(state, { scope: 'line', ...action }, context);
const add = (keys) => reduce(null, { type: 'add', keys });

test('toggle/deselect and union are immutable and reject invalid source keys', () => {
  const first = add(['line:0', 'line:2', 'line:2', 'line:80', 'point:1', 'line:-1']);
  assert.deepEqual(first.keys, ['line:0', 'line:2']);
  assert.deepEqual(reduce(first, { type: 'toggle', key: 'line:0' }).keys, ['line:2']);
  assert.deepEqual(reduce(first, { type: 'add', keys: ['line:3', 'line:2'] }).keys, ['line:0', 'line:2', 'line:3']);
  assert.deepEqual(first.keys, ['line:0', 'line:2']);
  assert.equal(reduce(first, { type: 'remove', keys: first.keys }), null);
  assert.equal(reduce(first, { type: 'clear' }), null);
});

test('range uses actual ordered keys, keeps source identity and unions or shrinks', () => {
  const start = reduce(add(['line:9']), { type: 'toggle', key: 'line:4' });
  const orderedKeys = ['line:4', 'line:2', 'line:7', 'line:0'];
  const range = reduce(start, { type: 'range', key: 'line:7', orderedKeys });
  assert.deepEqual(range.keys, ['line:9', 'line:4', 'line:2', 'line:7']);
  assert.deepEqual(reduce(range, { type: 'range', key: 'line:2', orderedKeys, checked: false }).keys, ['line:9', 'line:7']);
  assert.deepEqual(reduce(range, { type: 'range', key: 'line:1', orderedKeys: ['line:1'] }).keys, ['line:9', 'line:4', 'line:2', 'line:7', 'line:1']);
});

test('geometry replacement requires an explicit flag; display geometry alone is not a selection action', () => {
  const lines = add(['line:1']);
  assert.equal(reduce(lines, { type: 'toggle', scope: 'point', key: 'point:0' }), lines);
  assert.deepEqual(reduce(lines, { type: 'toggle', scope: 'point', key: 'point:0', replace: true }).keys, ['point:0']);
  assert.equal(reduce(lines, { type: 'filter' }), lines);
  assert.equal(reduce(lines, { type: 'focus', key: 'line:2' }), lines);
});

test('bulk snapshot comes from the complete sorted TanStack model, not a virtual viewport', () => {
  const dataset = { lines: Array.from({ length: 80 }, (_, i) => ({ attributes: { Name: `Object ${String(i).padStart(2, '0')}`, S_FCODE: i % 2 ? 'SP' : 'VL' } })) };
  const prepared = deriveLayerTableRows({ dataset, tab: 'ledninger', filters: { hiddenCodes: ['SP'] }, searchQuery: 'Object 1' });
  const table = createTable({ data: prepared.displayItems, columns: [{ id: 'Name', accessorFn: (row) => row.attributes.Name }], state: { sorting: [{ id: 'Name', desc: true }] }, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  const keys = table.getRowModel().rows.map((row) => `line:${row.original.__index}`);
  assert.deepEqual(keys, ['line:18', 'line:16', 'line:14', 'line:12', 'line:10']);
  const state = add(keys);
  assert.deepEqual(state.keys, keys);
  assert.deepEqual(gmiSelectionCounts(state, 'line', ['line:10', 'line:12']), { total: 5, visible: 2, hidden: 3, checked: true, indeterminate: false });
  assert.equal(gmiSelectionCounts(state, 'line', ['line:10', 'line:19']).indeterminate, true);
});

test('show-only reveals all selected rows despite sidebar/search/changed-only while keeping normal counts', () => {
  const dataset = { lines: [0, 1, 2].map((i) => ({ attributes: { Name: `Object ${i}`, Material: i ? 'PE' : 'PVC' } })) };
  const options = { dataset, tab: 'ledninger', view: 'changed', changedByObject: new Map([['line:1', {}]]), filters: { feltHiddenValues: [{ fieldName: 'Material', value: 'PE', objectType: 'lines' }] }, searchQuery: 'absent', selectionKeys: ['line:0', 'line:2'] };
  const result = deriveLayerTableRows(options);
  assert.deepEqual(result.displayItems.map((row) => row.__index), [0, 2]);
  assert.deepEqual(result.searchedItems, []);
  assert.equal(options.filters.feltHiddenValues.length, 1);
  assert.equal(options.searchQuery, 'absent');
});

test('binding ignores history/view revisions, rejects unavailable/read-only and resets a different source/session', () => {
  const state = add(['line:1']);
  assert.deepEqual(gmiSelectionBinding('a', { ...binding, state: 'editable', revision: 999 }), binding);
  for (const mode of ['read-only', 'unavailable', 'invalidated', 'loading']) assert.equal(gmiSelectionBinding('a', { ...binding, state: mode }), null);
  assert.equal(reduce(state, { type: 'add', keys: ['line:2'] }, { binding: null, counts }), null);
  assert.deepEqual(reduce(state, { type: 'add', keys: ['line:2'] }, { binding: { ...binding, sessionId: 'new' }, counts }).keys, ['line:2']);
});

test('reconcile clears exit/removal/reset/source loss and prunes impossible indices without consulting filters', () => {
  const state = add(['line:1', 'line:3']);
  const context = { workspaceLayerId: 'a', layers: { a: { data: { lines: Array(80), points: [] } } }, statuses: { a: { ...binding, state: 'editable' } } };
  assert.equal(reconcileGmiEditSelection(state, context), state);
  for (const patch of [{ workspaceLayerId: null }, { layers: {} }, { statuses: {} }, { statuses: { a: { ...binding, state: 'read-only' } } }, { statuses: { a: { ...binding, state: 'editable', fingerprint: 'new-source' } } }]) assert.equal(reconcileGmiEditSelection(state, { ...context, ...patch }), null);
  assert.deepEqual(reconcileGmiEditSelection(state, { ...context, layers: { a: { data: { lines: Array(2) } } } }).keys, ['line:1']);
});

test('map channel follows full selection content at equal cardinality, independent of hover/focus', () => {
  assert.deepEqual([...gmiSelectedFeatureIds(add(['line:1', 'line:2']), 'a')], ['ledninger-a-1', 'ledninger-a-2']);
  assert.deepEqual([...gmiSelectedFeatureIds(add(['line:3', 'line:4']), 'a')], ['ledninger-a-3', 'ledninger-a-4']);
  assert.equal(gmiSelectedFeatureIds(add(['line:1']), 'b').size, 0);
});
