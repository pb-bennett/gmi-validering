import assert from 'node:assert/strict';
import test from 'node:test';
import { createTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table';
import { deriveLayerTableRows, isLayerTableItemHidden } from '../src/lib/layerTableRows.mjs';

const object = (S_FCODE, Type, Material, Name) => Object.freeze({ attributes: Object.freeze({ S_FCODE, Type, Material, Name }) });
const dataset = Object.freeze({
  lines: Object.freeze([
    object('VL', 'A', 'PE', 'Alpha'), object('SP', 'A', 'PVC', 'Bravo'),
    object('VL', 'B', 'PE', 'Charlie'), object(null, '', '', 'Delta'),
    object('VL', 'A', 0, 'Echo'), object('  ', null, null, 'Foxtrot'),
  ]),
  points: Object.freeze([object('VL', 'A', 'PE', 'Point Alpha'), object('KUM', 'B', null, 'Point Bravo')]),
});
const indices = (rows) => rows.map((row) => row.__index);
const derive = (options = {}) => deriveLayerTableRows({ dataset, tab: 'ledninger', ...options });

test('ordinary rows retain source order and indices without mutating delivered objects', () => {
  const result = derive();
  assert.deepEqual(indices(result.searchedItems), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(indices(derive({ tab: 'punkter' }).searchedItems), [0, 1]);
  assert.equal(result.items[2].attributes, dataset.lines[2].attributes);
  assert.equal(Object.hasOwn(dataset.lines[2], '__index'), false);
});

test('Tema is layer-wide and preserves historical missing/whitespace normalization', () => {
  const filters = { hiddenCodes: ['VL', '(Ingen verdi)'] };
  assert.deepEqual(indices(derive({ filters }).items), [1]);
  assert.deepEqual(indices(derive({ tab: 'punkter', filters }).items), [1]);
  assert.equal(isLayerTableItemHidden(object(' VL ', 'A', 'PE'), 'ledninger', { hiddenCodes: ['VL'] }), false);
});

test('Type is code-specific unless code is null; missing Type stays distinct', () => {
  assert.deepEqual(indices(derive({ filters: { hiddenTypes: [{ type: 'A', code: 'VL' }] } }).items), [1, 2, 3, 5]);
  assert.deepEqual(indices(derive({ filters: { hiddenTypes: [{ type: 'A', code: null }] } }).items), [2, 3, 5]);
  assert.deepEqual(indices(derive({ filters: { hiddenTypes: [{ type: '(Mangler Type)', code: null }] } }).items), [0, 1, 2, 4]);
});

test('Felt is geometry-specific, missing values normalize, zero is a value', () => {
  const filters = { feltHiddenValues: [{ fieldName: 'Material', value: 'PE', objectType: 'lines' },
    { fieldName: 'Material', value: '(Mangler)', objectType: 'lines' }] };
  assert.deepEqual(indices(derive({ filters }).items), [1, 4]);
  assert.deepEqual(indices(derive({ filters, tab: 'punkter' }).items), [0, 1]);
  assert.deepEqual(indices(derive({ filters: { feltHiddenValues: [{ fieldName: 'Material', value: '0', objectType: 'lines' }] } }).items), [0, 1, 2, 3, 5]);
});

test('combined hide predicates precede literal search; counts and columns use pre-search rows', () => {
  const result = derive({ filters: { hiddenCodes: ['SP'], hiddenTypes: [{ type: 'B', code: 'VL' }],
    feltHiddenValues: [{ fieldName: 'Material', value: '(Mangler)', objectType: 'lines' }] }, searchQuery: ' ALPHA ' });
  assert.deepEqual(indices(result.allItemsWithIndex), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(indices(result.items), [0, 4]);
  assert.deepEqual(indices(result.searchedItems), [0]);
  assert.deepEqual(indices(derive({ tab: 'punkter', searchQuery: 'bravo' }).searchedItems), [1]);
  assert.deepEqual(derive({ searchQuery: 'not present' }).searchedItems, []);
});

test('Foreslått filtering/search read displayed proposed attributes with original source indices', () => {
  const proposed = { ...dataset, lines: dataset.lines.map((row, index) => index === 1 ? object('VL', 'A', 'PE', 'New name') : row) };
  const filters = { feltHiddenValues: [{ fieldName: 'Material', value: 'PVC', objectType: 'lines' }] };
  assert.deepEqual(indices(derive({ filters, searchQuery: 'bravo' }).searchedItems), []);
  assert.deepEqual(indices(derive({ dataset: proposed, view: 'proposed', filters, searchQuery: 'new name' }).searchedItems), [1]);
  const changed = derive({ dataset: proposed, view: 'changed', changedByObject: new Map([['line:1', new Map()]]), filters, searchQuery: 'new name' });
  assert.deepEqual(indices(changed.searchedItems), [1]);
  assert.deepEqual(indices(derive({ dataset: proposed, view: 'proposed', filters: { hiddenCodes: ['VL'] } }).items), [3, 5]);
  assert.equal(dataset.lines[1].attributes.Material, 'PVC');
});

test('Kun endrede uses scope and original index before sidebar filters/search', () => {
  const changedByObject = new Map([['line:1', new Map()], ['line:4', new Map()], ['point:0', new Map()]]);
  const result = derive({ view: 'changed', changedByObject, filters: { hiddenCodes: ['SP'] }, searchQuery: 'echo' });
  assert.deepEqual(indices(result.allItemsWithIndex), [1, 4]);
  assert.deepEqual(indices(result.items), [4]);
  assert.deepEqual(indices(result.searchedItems), [4]);
  assert.deepEqual(indices(derive({ tab: 'punkter', view: 'changed', changedByObject }).items), [0]);
  assert.deepEqual(derive({ view: 'changed' }).items, []);
});

test('exact/contextual rows retain resolved indices, order and metadata; bypass view and sidebar, retain search', () => {
  const inspectionRows = Object.freeze([
    Object.freeze({ ...dataset.lines[4], __index: 4, __contextualResult: 'FAIL' }),
    Object.freeze({ ...dataset.lines[1], __index: 1, __contextualResult: 'PASS' }),
  ]);
  const result = derive({ inspectionRows, view: 'changed', changedByObject: new Map(), filters: { hiddenCodes: ['VL', 'SP'] }, searchQuery: 'bravo' });
  assert.equal(result.allItemsWithIndex, inspectionRows);
  assert.equal(result.items, inspectionRows);
  assert.deepEqual(indices(result.searchedItems), [1]);
  assert.equal(result.searchedItems[0].__contextualResult, 'PASS');
  assert.deepEqual(derive({ inspectionRows: [] }).searchedItems, []);
});

test('empty datasets and filtering every row never fall back to the other geometry', () => {
  assert.deepEqual(derive({ dataset: null }).searchedItems, []);
  assert.deepEqual(derive({ dataset: { points: dataset.points, lines: [] } }).searchedItems, []);
  assert.deepEqual(derive({ filters: { hiddenCodes: ['VL', 'SP', '(Ingen verdi)'] } }).searchedItems, []);
});

test('TanStack final row model sorts prepared search subset, preserving identity and stable ties', () => {
  const { searchedItems } = derive({ searchQuery: 'a', filters: { hiddenCodes: ['(Ingen verdi)'] } });
  const table = createTable({ data: searchedItems, columns: [{ id: 'type', accessorFn: (row) => row.attributes.Type }],
    state: { sorting: [{ id: 'type', desc: false }] }, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => `layer:ledninger:${row.__index}` });
  assert.deepEqual(table.getRowModel().rows.map((row) => row.original.__index), [0, 1, 4, 2]);
  assert.deepEqual(table.getRowModel().rows.map((row) => row.id), ['layer:ledninger:0', 'layer:ledninger:1', 'layer:ledninger:4', 'layer:ledninger:2']);
});
