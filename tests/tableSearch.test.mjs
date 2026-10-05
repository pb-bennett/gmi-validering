import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeTableSearchQuery, valueContainsTableSearch, rowMatchesTableSearch, filterTableSearchRows, segmentTableSearchText } from '../src/lib/tableSearch.js';
import { createAttributeColumnAccessors } from '../src/lib/objectTablePresentation.js';
import { createTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table';

const matches = (attributes, query) => rowMatchesTableSearch({ attributes }, normalizeTableSearchQuery(query));

test('normalization and literal case-insensitive substring semantics', () => {
  assert.equal(normalizeTableSearchQuery('  IMG_104  '), 'img_104');
  assert(matches({ value: 'IMG_1047.JPG' }, 'img_104'));
  assert(matches({ value: 'Nedlagt anlegg' }, 'NEDLAGT'));
  assert(matches({ value: 'a.*[b]' }, '.*['));
  assert(!matches({ value: 'a anything b' }, '.*'));
  assert(!matches({ value: 'one two' }, 'two one'));
});

test('useful scalars, Dates, and absent/unsupported values', () => {
  assert(matches({ diameter: 160 }, '160'));
  assert(matches({ enabled: false }, 'FALSE'));
  assert(matches({ date: new Date('2026-10-05T12:00:00Z') }, '2026-10-05'));
  for (const value of [null, undefined, NaN, Infinity, -Infinity, Symbol('needle'), () => 'needle', new Date(NaN)]) {
    assert(!matches({ value }, 'needle'));
  }
  assert(!matches({ value: Infinity }, 'infinity'));
  assert(!matches({ value: null }, 'null'));
});

test('nested objects, arrays, unknown fields and data-only traversal', () => {
  assert(matches({ Unknown: { other: { value: 'needle' } } }, 'need'));
  assert(matches({ Unknown: ['unrelated', ['needle']] }, 'need'));
  assert(matches({ Unknown: [{ other: 'needle' }] }, 'need'));
  const plain = Object.create(null);
  plain.value = 'needle';
  assert(matches({ plain }, 'needle'));
  const data = { visible: 'ordinary' };
  Object.defineProperty(data, 'metadata', { value: 'needle', enumerable: false });
  Object.defineProperty(data, 'getter', { enumerable: true, get() { throw new Error('must not invoke'); } });
  data[Symbol('metadata')] = 'needle';
  assert(!matches(data, 'needle'));
  class Internal { constructor() { this.value = 'needle'; } }
  assert(!matches({ internal: new Internal() }, 'needle'));
  assert(!valueContainsTableSearch(Object.create({ inherited: 'needle' }), 'needle'));
  assert(!matches({ needle: 'ordinary' }, 'needle'), 'keys are not field values');
});

test('cycles and shared branches do not crash or mutate data', () => {
  const shared = { value: 'IMG_4827.JPG' };
  const attributes = { first: shared, second: shared };
  attributes.self = attributes;
  assert(matches(attributes, '4827'));
  assert(!matches(attributes, 'absent'));
  assert.equal(attributes.self, attributes);
  assert.equal(attributes.first, shared);
  assert.deepEqual(shared, { value: 'IMG_4827.JPG' });
  const frozen = Object.freeze({ nested: Object.freeze(['needle']) });
  assert(matches(frozen, 'needle'));
});

test('photo references: actual scalar S_HYPERLINK and synthetic nested attachment shape', () => {
  const scalar = { S_FCODE: 'KUM', S_HYPERLINK: 'photos/IMG_4827.JPG' };
  // Synthetic nested schema; tracked GMI fixtures establish S_HYPERLINK, not Bilder.Filnavn.
  const nested = { S_FCODE: 'KUM', GUID: 'synthetic', Bilder: [{ Filnavn: 'IMG_4827.JPG' }] };
  for (const attributes of [scalar, nested]) {
    for (const query of ['IMG_4827.JPG', '4827', 'img_48', 'img_4827.jpg']) assert(matches(attributes, query));
    assert(!matches(attributes, 'IMG_9999.JPG'));
  }
  assert.equal(String(nested.Bilder[0]), '[object Object]');
  assert(!matches({ value: {} }, '[object Object]'));
});

test('search narrows existing scope, clear restores it, and source indices stay stable', () => {
  const A = { __index: 0, attributes: { value: 'other' } };
  const B = { __index: 1, attributes: { value: 'needle' } };
  const C = { __index: 2, attributes: { value: 'other' } };
  const D = { __index: 3, attributes: { value: 'needle' } };
  const scoped = [A, B, C];
  const results = filterTableSearchRows(scoped, 'needle');
  assert.deepEqual(results, [B]);
  assert.equal(results[0], B);
  assert.equal(results[0].__index, 1);
  assert(!results.includes(D));
  assert.equal(filterTableSearchRows(scoped, normalizeTableSearchQuery('  ')), scoped);
  assert.equal(filterTableSearchRows(scoped, ''), scoped);
  const lines = [{ __index: 0, attributes: { value: 'needle line' } }];
  assert.deepEqual(filterTableSearchRows(lines, 'needle'), lines);
  assert(!filterTableSearchRows(lines, 'needle').includes(B));
});

test('search is independent of columns, geometry and implementation metadata', () => {
  const row = { __index: 4827, coordinates: [4827], attributes: { left: 'ordinary', farRight: { filename: 'IMG_1047.JPG' } } };
  const visibleColumns = createAttributeColumnAccessors(['left']);
  assert.equal(visibleColumns[0].accessorFn(row), 'ordinary');
  assert(rowMatchesTableSearch(row, '1047'));
  assert(!rowMatchesTableSearch(row, '4827'));
});

test('TanStack search subset preserves sorting, original objects and action indices', () => {
  const rows = [
    { __index: 7, attributes: { name: 'needle', dimension: 160 } },
    { __index: 8, attributes: { name: 'other', dimension: 50 } },
    { __index: 9, attributes: { name: 'needle', dimension: 100 } },
  ];
  const options = {
    data: filterTableSearchRows(rows, 'needle'),
    columns: createAttributeColumnAccessors(['name', 'dimension']),
    state: { sorting: [{ id: 'dimension', desc: false }] },
    getRowId: (row) => `layer:punkter:${row.__index}`,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  };
  const table = createTable(options);
  const displayed = table.getRowModel().rows;
  assert.deepEqual(displayed.map((row) => row.id), ['layer:punkter:9', 'layer:punkter:7']);
  assert.equal(displayed[0].original, rows[2]);
  assert.equal(displayed[1].original.__index, 7);
  table.setOptions({ ...options, data: filterTableSearchRows(rows, '') });
  assert.deepEqual(table.getRowModel().rows.map((row) => row.original.__index), [8, 9, 7]);
});

test('highlight segmentation preserves actual text and highlights all literal occurrences', () => {
  assert.deepEqual(segmentTableSearchText('IMG_1047.JPG', '1047'), [
    { text: 'IMG_', match: false }, { text: '1047', match: true }, { text: '.JPG', match: false },
  ]);
  assert.deepEqual(segmentTableSearchText('IMG_IMG_104.jpg', 'img').filter((part) => part.match).map((part) => part.text), ['IMG', 'IMG']);
  assert.deepEqual(segmentTableSearchText('a.*[b]', '.*['), [{ text: 'a', match: false }, { text: '.*[', match: true }, { text: 'b]', match: false }]);
  assert.deepEqual(segmentTableSearchText('160', '160'), [{ text: '160', match: true }]);
  for (const query of ['', 'absent']) assert.deepEqual(segmentTableSearchText('ordinary', query), [{ text: 'ordinary', match: false }]);
  assert.deepEqual(segmentTableSearchText('İMG', 'i'), [{ text: 'İ', match: true }, { text: 'MG', match: false }]);
  assert.deepEqual(segmentTableSearchText('ΟΣ', 'ος'), [{ text: 'ΟΣ', match: true }]);
});

test('table UI contract: compact toolbar input, local state, clear/focus, counts and unchanged controls', async () => {
  const source = await readFile(new URL('../src/components/LayerDataTable.js', import.meta.url), 'utf8');
  const toolbar = source.slice(source.indexOf('Datatabell'), source.indexOf('ref={tableContainerRef}'));
  assert.match(toolbar, /aria-label="Søk i data"/);
  assert.match(toolbar, /placeholder="Søk i data…"/);
  assert.match(toolbar, /onChange=\{\(event\) => setSearchQuery\(event.target.value\)\}/);
  assert.match(toolbar, /searchQuery !== ''/);
  assert.match(toolbar, /aria-label="Tøm søk"/);
  assert.match(toolbar, /setSearchQuery\(''\);\s*searchInputRef.current\?\.focus\(\)/);
  assert.match(toolbar, /normalizedSearchQuery &&/);
  assert.match(toolbar, /\{searchedItems.length\} treff/); // Norwegian: 0 treff, 1 treff, 3 treff.
  assert.match(toolbar, /setLayerDataTableTab\(layerId, 'punkter'\)/);
  assert.match(toolbar, /setLayerDataTableTab\(layerId, 'ledninger'\)/);
  assert.match(source, /\[searchQuery, setSearchQuery\] = useState\(''\)/);
  assert.match(source, /filterTableSearchRows\(items, normalizedSearchQuery\)/);
  assert.match(source, /data: searchedItems/);
  assert.match(source, /const filteredCount = items.length/);
  assert.match(source, /const fieldItems = isContextualInspection \? contextualScopeRows : items/);
  assert.match(source, /getRowId: \(row\) => `\$\{layerId\}:\$\{activeTab\}:\$\{row.__index\}`/);
  assert.match(source, /getSortedRowModel: getSortedRowModel\(\)/);
  assert.match(source, /row.original.__index/);
  assert.match(source, /tableSearchScalarText\(value\) !== null/);
  assert.match(source, /<mark[^>]*>[\s\S]*?segment.text/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|localStorage|setGlobalFilter/);
});
