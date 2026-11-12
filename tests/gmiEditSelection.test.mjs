import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table';
import { gmiSelectionBinding, sameGmiSelectionHost, reduceGmiEditSelection, reconcileGmiEditSelection, gmiSelectionCounts, gmiSelectedFeatureIds } from '../src/lib/gmiEditSelection.mjs';
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


test('R5 Validator origin is shrink-only across every shared action, even after clear; explicit conversion preserves keys', () => {
  const ordinary = add(['line:1', 'line:3']);
  const locked = { ...ordinary, showOnly: true, origin: { kind: 'validator', targets: [{ scope: 'line', sourceIndex: 1 }, { scope: 'line', sourceIndex: 3 }] } };
  for (const action of [
    { type: 'toggle', key: 'line:2' }, { type: 'add', keys: ['line:0', 'line:1'] },
    { type: 'range', key: 'line:4', orderedKeys: ['line:1', 'line:2', 'line:3', 'line:4'] },
    { type: 'add', keys: Array.from({ length: 80 }, (_, i) => `line:${i}`) },
    { type: 'toggle', scope: 'point', key: 'point:0', replace: true },
  ]) assert.equal(reduce(locked, action), locked);
  const shrunk = reduce(locked, { type: 'toggle', key: 'line:1' });
  assert.deepEqual(shrunk.keys, ['line:3']); assert.equal(shrunk.origin, locked.origin);
  assert.equal(reduce(shrunk, { type: 'toggle', key: 'line:1' }), shrunk, 'removed original targets cannot implicitly widen either');
  assert.deepEqual(reduce(locked, { type: 'range', key: 'line:1', orderedKeys: ['line:1'], checked: false }).keys, ['line:3']);
  const empty = reduce(locked, { type: 'clear' });
  assert.deepEqual(empty.keys, []); assert.equal(empty.origin, locked.origin);
  assert.equal(reduce(empty, { type: 'add', keys: ['line:1'] }), empty);
  assert.equal(reduce(empty, { type: 'toggle', scope: 'point', key: 'point:0', replace: true }), empty);
  const converted = reduce(shrunk, { type: 'make-ordinary' });
  assert.deepEqual(converted.keys, shrunk.keys); assert.equal(converted.showOnly, true); assert.equal(converted.origin, null);
  assert.deepEqual(reduce(converted, { type: 'add', keys: ['line:2'] }).keys, ['line:3', 'line:2']);
});

test('H1 host identity defaults to Rettinger and requires a nonempty inspection key', () => {
  assert.deepEqual(add(['line:1']).host, { kind: 'rettinger' });
  assert.equal(sameGmiSelectionHost(undefined, { kind: 'rettinger' }), true, 'legacy R5 selections belong to Rettinger');
  assert.equal(sameGmiSelectionHost({ kind: 'inspection', key: 'field' }, { kind: 'inspection', key: 'field' }), true);
  for (const host of [null, { kind: 'other' }, { kind: 'inspection' }, { kind: 'inspection', key: '' }, { kind: 'inspection', key: 1 }]) {
    assert.equal(sameGmiSelectionHost(host, host), false);
    assert.equal(reduce(null, { type: 'add', keys: ['line:1'] }, { binding, counts, host }), null);
  }
  assert.equal(sameGmiSelectionHost({ kind: 'inspection', key: 'a' }, { kind: 'inspection', key: 'b' }), false);
  assert.equal(sameGmiSelectionHost({ kind: 'inspection', key: 'a' }, { kind: 'rettinger' }), false);
});

test('H1 membership and presentation actions never reuse another host selection or its R5 lock', () => {
  const host = { kind: 'inspection', key: 'a|line|sdr' }, context = { binding, counts, host };
  const ordinary = { ...add(['line:3']), anchor: 'line:3', showOnly: true, origin: { kind: 'validator' } };
  const inspected = reduce(ordinary, { type: 'range', key: 'line:7', orderedKeys: ['line:3', 'line:4', 'line:7'] }, context);
  assert.deepEqual(inspected.keys, ['line:7'], 'range cannot use another host anchor');
  assert.equal(inspected.showOnly, false);
  assert.equal(inspected.origin, undefined);
  assert.deepEqual(inspected.host, host);
  host.key = 'mutated';
  assert.equal(inspected.host.key, 'a|line|sdr', 'host is a snapshot');
  const sameHost = { binding, counts, host: { ...inspected.host } };
  assert.deepEqual(reduce(inspected, { type: 'add', keys: ['line:8'] }, sameHost).keys, ['line:7', 'line:8']);
  for (const next of [undefined, { kind: 'inspection', key: 'a|line|material' }]) {
    const nextContext = { binding, counts, host: next };
    const fresh = reduce(inspected, { type: 'toggle', scope: 'point', key: 'point:1' }, nextContext);
    assert.deepEqual(fresh.keys, ['point:1'], 'host change also resets the geometry');
    for (const type of ['show-only', 'make-ordinary', 'clear', 'remove']) {
      assert.equal(reduce(inspected, { type, keys: ['line:7'], value: true }, nextContext), null, type);
    }
  }
});

test('H1 inspection lifecycle follows its field key, geometry, layer and editable source/session', () => {
  const host = { kind: 'inspection', key: 'a|line|sdr' };
  const selection = reduce(null, { type: 'add', keys: ['line:1', 'line:3'] }, { binding, counts, host });
  const inspection = { layerId: 'a', geometryScope: 'line', selectionContext: { key: host.key }, activeView: 'focus' };
  const context = { workspaceLayerId: null, inspection, layers: { a: { data: { lines: Array(80) } } }, statuses: { a: { ...binding, state: 'editable' } } };
  assert.equal(reconcileGmiEditSelection(selection, context), selection, 'Rettinger need not be open');
  assert.equal(reconcileGmiEditSelection(selection, { ...context, inspection: { ...inspection, id: 'next-diagnostic', activeView: 'scope' },
    statuses: { a: { ...binding, state: 'editable', revision: 99 } } }), selection, 'same field and source survive diagnostics/view/history changes');
  for (const patch of [
    { inspection: null }, { inspection: { ...inspection, selectionContext: { key: 'a|line|material' } } },
    { inspection: { ...inspection, selectionContext: null } }, { inspection: { ...inspection, layerId: 'b' } },
    { inspection: { ...inspection, geometryScope: 'point' } }, { layers: {} }, { statuses: {} },
    ...['read-only', 'unavailable', 'invalidated', 'loading'].map((state) => ({ statuses: { a: { ...binding, state } } })),
    { statuses: { a: { ...binding, state: 'editable', sessionId: 'replacement' } } },
    { statuses: { a: { ...binding, state: 'editable', fingerprint: 'replacement' } } },
  ]) assert.equal(reconcileGmiEditSelection(selection, { ...context, workspaceLayerId: 'a', ...patch }), null, JSON.stringify(patch));
});

test('H2 restricts inspection membership and ranges to the complete evaluated field population', () => {
  const host = { kind: 'inspection', key: 'field' }, allowedKeys = new Set(['line:1', 'line:3']);
  const context = { binding, counts, host, allowedKeys };
  const first = reduce(null, { type: 'add', keys: ['line:0', 'line:1', 'line:2', 'line:3'] }, context);
  assert.deepEqual(first.keys, ['line:1', 'line:3']);
  assert.equal(reduce(first, { type: 'toggle', key: 'line:2' }, context), first);
  assert.equal(reduce(first, { type: 'range', key: 'line:2', orderedKeys: ['line:1', 'line:2'] }, context), first);
  const pruned = reconcileGmiEditSelection(first, { inspection: { layerId: 'a', geometryScope: 'line', selectionContext: { key: 'field' }, scopeIndices: [1] },
    layers: { a: { data: { lines: Array(80) } } }, statuses: { a: { ...binding, state: 'editable' } } });
  assert.deepEqual(pruned.keys, ['line:1']);
});
