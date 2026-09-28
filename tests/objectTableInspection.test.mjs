import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, getCoreRowModel } from '@tanstack/react-table';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { createObjectRef } from '../src/lib/validation-v2/objectRef.js';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';
import {
  createExactObjectInspection,
  createContextualObjectInspection,
  resolveExactObjectInspectionRows,
} from '../src/lib/objectTableInspection.js';
import { buildValidatorFieldInspectionRequest } from '../src/lib/validation-v2/tableInspection.js';
import { getContextualColumnWidth, getContextualOrdinaryColumnWidth, getContextualStickyOffsets, getDiagnosticColumnOrder, createLayerDataTableColumns, hasRealSuppliedValue } from '../src/lib/objectTablePresentation.js';

function layer(id = 'synthetic-layer') {
  return {
    id,
    data: {
      points: [{ attributes: { Name: 'point 0' } }, { attributes: { Name: 'point 1' } }],
      lines: [{ attributes: { Name: 'line 0' } }],
    },
  };
}

function request(target, geometryScope, indexes) {
  const datasetRevision = getDatasetRevision(target.data);
  return {
    scope: {
      kind: 'exact-object-set',
      layerId: target.id,
      datasetRevision,
      geometryScope,
      objectRefs: indexes.map((objectIndex) => createObjectRef({ layerId: target.id, datasetRevision, geometryScope, objectIndex })),
    },
    context: { title: 'Synthetic', reason: 'Synthetic exact scope', source: 'test' },
  };
}

test('exact scope deduplicates refs, retains zero-row scopes, and resolves only supplied source rows', () => {
  const target = layer();
  const populated = createExactObjectInspection({ layer: target, request: request(target, 'point', [1, 1, 0]) });
  assert.deepEqual(populated.sourceIndices, [1, 0]);
  assert.deepEqual(resolveExactObjectInspectionRows({ layer: target, inspection: populated }).map((row) => row.__index), [1, 0]);
  const empty = createExactObjectInspection({ layer: target, request: request(target, 'point', []) });
  assert.deepEqual(empty.sourceIndices, []);
  assert.deepEqual(resolveExactObjectInspectionRows({ layer: target, inspection: empty }), []);
});

test('exact scope rejects mixed ownership, forged refs, and out-of-range source indices', () => {
  const target = layer();
  const valid = request(target, 'point', [0]);
  const other = layer('other-layer');
  valid.scope.objectRefs.push(createObjectRef({ layerId: other.id, datasetRevision: getDatasetRevision(other.data), geometryScope: 'point', objectIndex: 0 }));
  assert.throws(() => createExactObjectInspection({ layer: target, request: valid }));
  const forged = request(target, 'point', [0]);
  forged.scope.objectRefs[0] = { ...forged.scope.objectRefs[0], sourceIndex: 1 };
  assert.throws(() => createExactObjectInspection({ layer: target, request: forged }));
  assert.throws(() => createExactObjectInspection({ layer: target, request: request(target, 'line', [1]) }));
});

test('a replacement dataset invalidates an exact session before any stale source index resolves', () => {
  const target = layer();
  const inspection = createExactObjectInspection({ layer: target, request: request(target, 'line', [0]) });
  target.data = { points: [], lines: [{ attributes: { Name: 'replacement' } }] };
  assert.equal(resolveExactObjectInspectionRows({ layer: target, inspection }), null);
});

test('contextual field scope is deduplicated, focus stays exact, and switching views never broadens to the layer', () => {
  const target = layer();
  const revision = getDatasetRevision(target.data);
  const refs = [0, 1].map((objectIndex) => createObjectRef({ layerId: target.id, datasetRevision: revision, geometryScope: 'point', objectIndex }));
  const inspection = createContextualObjectInspection({ layer: target, request: {
    scope: { kind: 'contextual-object-set', layerId: target.id, datasetRevision: revision, geometryScope: 'point', objectRefs: [refs[1], refs[0], refs[1]] },
    contextual: { focusObjectRefs: [refs[1], refs[1]], resultByObjectKey: { [refs[0].key]: 'PASS', [refs[1].key]: 'FAIL' }, presentation: { temaColumn: 'S_FCODE', fieldColumn: 'Type' } },
  } });
  assert.deepEqual(inspection.scopeIndices, [1, 0]);
  assert.deepEqual(inspection.focusIndices, [1]);
  assert.deepEqual(resolveExactObjectInspectionRows({ layer: target, inspection }).map((row) => row.__index), [1]);
  const all = { ...inspection, activeView: 'scope' };
  assert.deepEqual(resolveExactObjectInspectionRows({ layer: target, inspection: all }).map((row) => row.__index), [1, 0]);
  const lineRef = createObjectRef({ layerId: target.id, datasetRevision: revision, geometryScope: 'line', objectIndex: 0 });
  const invalidRequest = {
    scope: { kind: 'contextual-object-set', layerId: target.id, datasetRevision: revision, geometryScope: 'point', objectRefs: refs },
    contextual: { focusObjectRefs: [refs[0], lineRef], resultByObjectKey: { [refs[0].key]: 'PASS', [refs[1].key]: 'FAIL' }, presentation: { temaColumn: 'S_FCODE', fieldColumn: 'Type' } },
  };
  assert.throws(() => createContextualObjectInspection({ layer: target, request: invalidRequest }));
});

test('Validator field request aggregates grouped outcomes by ObjectRef with Feil over Sjekk over Pass and omits NOT_EVALUATED', () => {
  const target = layer(); const revision = getDatasetRevision(target.data);
  const ref = (index) => createObjectRef({ layerId: target.id, datasetRevision: revision, geometryScope: 'point', objectIndex: index });
  const diagnostic = { hasCompleteExactObjectRefs: true, exactObjectRefs: [ref(0)], field: { canonicalFieldId: 'type' } };
  const request = buildValidatorFieldInspectionRequest({ layerId: target.id, datasetRevision: revision, geometryScope: 'point', objects: target.data.points, rules: [{ ruleId: 'one' }, { ruleId: 'two' }], diagnostic, fieldLabel: 'Type', result: { outcomes: [
    { ruleId: 'one', state: 'PASS', objectRef: ref(0) }, { ruleId: 'two', state: 'FAIL', objectRef: ref(0) }, { ruleId: 'one', state: 'CHECK', objectRef: ref(1) }, { ruleId: 'two', state: 'NOT_EVALUATED', objectRef: ref(1) },
  ] } });
  assert.equal(request.scope.objectRefs.length, 2);
  assert.equal(request.contextual.resultByObjectKey[ref(0).key], 'FAIL');
  assert.equal(request.contextual.resultByObjectKey[ref(1).key], 'CHECK');
  assert.equal(request.contextual.presentation.fieldColumn, 'Type');
});

test('contextual widths use the complete scope, keep normal Type and Tema codes readable, and bound pathological values', () => {
  const typeWidth = getContextualColumnWidth({ label: 'Type', values: ['BAD', 'FORAKLOSS'], kind: 'field' });
  const focusOnlyWidth = getContextualColumnWidth({ label: 'Type', values: ['BAD'], kind: 'field' });
  const temaWidth = getContextualColumnWidth({ label: 'Tema', values: ['KUM', 'DIV', 'KOTREKUM'], kind: 'tema' });
  assert.ok(typeWidth >= 'FORAKLOSS'.length * 8 + 24);
  assert.ok(typeWidth >= focusOnlyWidth);
  assert.ok(temaWidth >= 'KOTREKUM'.length * 8 + 24);
  assert.equal(getContextualColumnWidth({ label: 'Merknad', values: ['x'.repeat(5000)], kind: 'field' }), 320);
  assert.deepEqual(getContextualStickyOffsets({ temaWidth, fieldWidth: typeWidth }), { zoom: 0, tema: 36, field: 36 + temaWidth });
});

test('all-missing contextual fields use a compact stable width while populated complete scopes retain full values', () => {
  const missingScope = [null, undefined, ''];
  const compactWidth = getContextualColumnWidth({ label: 'MaksAvvikVertikalt', values: missingScope, kind: 'field' });
  const populatedScopeWidth = getContextualColumnWidth({ label: 'Type', values: [null, 'FORAKLOSS'], kind: 'field' });
  assert.equal(hasRealSuppliedValue(missingScope), false);
  assert.equal(compactWidth, 104);
  assert.ok(compactWidth < 'MaksAvvikVertikalt'.length * 8 + 24);
  assert.equal(getContextualColumnWidth({ label: 'MaksAvvikVertikalt', values: missingScope.slice(0, 1), kind: 'field' }), compactWidth);
  assert.equal(hasRealSuppliedValue([null, 'FORAKLOSS']), true);
  assert.ok(populatedScopeWidth >= 'FORAKLOSS'.length * 8 + 24);
  assert.deepEqual(getContextualStickyOffsets({ temaWidth: 80, fieldWidth: compactWidth }), { zoom: 0, tema: 36, field: 116 });
});

test('diagnostic columns keep technical leaders and place available context immediately after the inspected field', () => {
  const fields = ['Merknad', 'Type', 'Other', 'Stedfestingsårsak', 'S_FCODE'];
  assert.deepEqual(getDiagnosticColumnOrder(fields, { temaColumn: 'S_FCODE', fieldColumn: 'Type' }),
    ['S_FCODE', 'Type', 'Stedfestingsårsak', 'Merknad', 'Other']);
  assert.deepEqual(getDiagnosticColumnOrder(fields, { temaColumn: 'S_FCODE', fieldColumn: 'Stedfestingsårsak' }),
    ['S_FCODE', 'Stedfestingsårsak', 'Merknad', 'Type', 'Other']);
  assert.deepEqual(getDiagnosticColumnOrder(fields, { temaColumn: 'S_FCODE', fieldColumn: 'Merknad' }),
    ['S_FCODE', 'Merknad', 'Stedfestingsårsak', 'Type', 'Other']);
  assert.deepEqual(getDiagnosticColumnOrder(['Type', 'Other'], { temaColumn: 'Tema', fieldColumn: 'Type' }),
    ['Type', 'Other']);
  assert.deepEqual(getDiagnosticColumnOrder(['Type', 'Merknad', 'Other'], { temaColumn: 'Tema', fieldColumn: 'Type' }),
    ['Type', 'Merknad', 'Other']);
  assert.deepEqual(getDiagnosticColumnOrder(['Other', 'Type', 'Stedfestingsårsak'], { temaColumn: 'Tema', fieldColumn: 'Type' }),
    ['Type', 'Stedfestingsårsak', 'Other']);
});

test('final normal and diagnostic TanStack columns reject blank parser fields and keep stable unique ids', () => {
  const parsedAttributes = new GMIParser()._parseFieldValues('KUM;K', ['S_FCODE', 'Type', '']);
  assert.ok(Object.hasOwn(parsedAttributes, ''));
  assert.equal(parsedAttributes[''], null);
  const rejectedTable = createTable({
    data: [{ attributes: parsedAttributes }],
    columns: [{ id: '', accessorFn: (row) => row.attributes[''] }],
    getCoreRowModel: getCoreRowModel(), state: {}, onStateChange: () => {},
  });
  assert.throws(() => rejectedTable.getAllColumns(), /Columns require an id when using an accessorFn/);
  const normalFields = ['S_FCODE', 'Type', 'Name'];
  const diagnosticFields = getDiagnosticColumnOrder(
    ['Name', 'Merknad', 'Type', 'Stedfestingsårsak', 'S_FCODE', ''],
    { temaColumn: 'S_FCODE', fieldColumn: 'Type' },
  );
  for (const fields of [normalFields, diagnosticFields]) {
    const contextual = fields === diagnosticFields;
    const columns = createLayerDataTableColumns({
      orderedFields: fields,
      columnWidths: {},
      isContextualInspection: contextual,
      inspection: contextual ? { presentation: { temaColumn: 'S_FCODE', fieldColumn: 'Type' } } : null,
      getFieldLabel: (field) => field,
      zoomCell: () => null,
      dataCell: () => null,
    });
    assert.deepEqual(columns.map((column) => column.id), ['zoom', ...fields]);
    assert.equal(new Set(columns.map((column) => column.id)).size, columns.length);
    assert.ok(columns.every((column) => typeof column.accessorFn !== 'function' || (typeof column.id === 'string' && column.id.length > 0)));
    assert.equal(columns[2].accessorFn({ attributes: { [fields[1]]: 'value' } }), 'value');
    const table = createTable({ data: [{ attributes: parsedAttributes }], columns, getCoreRowModel: getCoreRowModel(), state: {}, onStateChange: () => {} });
    assert.deepEqual(table.getAllColumns().map((column) => column.id), ['zoom', ...fields]);
  }
  assert.deepEqual(diagnosticFields, ['S_FCODE', 'Type', 'Stedfestingsårsak', 'Merknad', 'Name']);
});

test('diagnostic table keeps result in row metadata, inspected-field colour, movable context, and table geometry', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/components/LayerDataTable.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /__validator_resultat/);
  assert.match(source, /return createLayerDataTableColumns\(\{/);
  assert.match(source, /getDiagnosticColumnOrder\(fields, inspection\.presentation\)/);
  assert.match(source, /const fieldItems = isContextualInspection \? contextualScopeRows : items/);
  assert.match(source, /contextualColumnOrder\?\.inspectionId === inspection\.id/);
  assert.match(source, /setContextualColumnOrder\(\{ inspectionId: inspection\.id, fields: nextOrder \}\)/);
  assert.match(source, /draggable=\{!isZoom && \(!isContextualInspection \|\| !isFixed\)\}/);
  const presentation = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/lib/objectTablePresentation.js', import.meta.url), 'utf8'));
  assert.match(presentation, /isFixed: id === 'S_FCODE'/);
  assert.match(presentation, /pinned: isContextualInspection && \(id === inspection\.presentation\.temaColumn \|\| id === inspection\.presentation\.fieldColumn\)/);
  assert.match(presentation, /contextualField: isContextualInspection && id === inspection\.presentation\.fieldColumn/);
  assert.match(source, /row\.original\.__contextualResult === 'FAIL' \? '#fef2f2' : row\.original\.__contextualResult === 'CHECK' \? '#fffbeb' : '#f0fdf4'/);
  assert.match(source, /const ROW_HEIGHT = 28/);
  assert.match(source, /const widths = \{ zoom: 36 \}/);
  assert.match(source, /useVirtualizer\(/);
  assert.match(source, /className="flex-1 overflow-auto"/);
});

test('contextual missing-field display is presentation-only and whole-layer cell behavior stays unchanged', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/components/LayerDataTable.js', import.meta.url), 'utf8'));
  assert.match(source, /missingLabel=\{isContextualInspection && id === inspection\.presentation\.fieldColumn \? 'Mangler' : '-'\}/);
  assert.match(source, /line-clamp-2/);
  assert.match(source, /title=\{fullHeaderLabel \|\| undefined\}/);
  assert.match(source, /const DataCell = React\.memo\(function DataCell\(\{ value, missingLabel = '-' \}\)/);
});

test('ordinary contextual attributes size from complete-scope content rather than long headers', () => {
  const shortValuesWidth = getContextualOrdinaryColumnWidth({ values: ['ID', '-', 'ID'] });
  const numericWidth = getContextualOrdinaryColumnWidth({ values: ['50', '150', '180', '-'] });
  const longValueWidth = getContextualOrdinaryColumnWidth({ values: ['FORAKLOSS', 'BUNN_INNVENDIG'] });
  assert.equal(shortValuesWidth, 64);
  assert.equal(numericWidth, 64);
  assert.ok(longValueWidth > shortValuesWidth);
  assert.equal(getContextualOrdinaryColumnWidth({ values: ['x'.repeat(10000)] }), 220);
  assert.equal(getContextualOrdinaryColumnWidth({ values: ['ID'] }), shortValuesWidth);
});

test('ordinary contextual headers wrap accessibly without changing special or whole-layer sizing', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/components/LayerDataTable.js', import.meta.url), 'utf8'));
  assert.match(source, /getContextualOrdinaryColumnWidth\(\{ values: contextualScopeRows/);
  const presentation = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/lib/objectTablePresentation.js', import.meta.url), 'utf8'));
  assert.match(presentation, /contextualOrdinary:/);
  assert.match(source, /contextualField \|\| header\.column\.columnDef\.meta\?\.contextualOrdinary/);
  assert.match(source, /line-clamp-2 leading-3/);
  assert.match(source, /else \{\s*widths\[field\] = estimateColumnWidth/);
});

test('Validator close targets only Validator-owned inspection sessions and leaves generic sessions alone', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/lib/store.js', import.meta.url), 'utf8'));
  const workspace = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/components/validation-v2/ValidationV2Workspace.js', import.meta.url), 'utf8'));
  assert.match(source, /closeValidatorOwnedObjectTable/);
  assert.match(source, /context\?\.source\?\.startsWith\('validation-v2-'/);
  assert.match(source, /objectTableInspection: null/);
  assert.match(workspace, /const closeValidator = \(\) => \{[\s\S]*?closeValidatorOwnedObjectTable\(\)[\s\S]*?toggleFieldValidation\(false\)/);
  assert.match(workspace, /const closeFieldInspector = \(\) => \{[\s\S]*?setSelectedValidatorField\(null\)/);
});

test('table runtime inspection state is excluded from persisted store serialization', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/lib/store.js', import.meta.url), 'utf8'));
  assert.match(source, /objectTableInspection: null/);
  const partialize = source.slice(source.indexOf('partialize:'), source.indexOf('migrate:'));
  assert.doesNotMatch(partialize, /objectTableInspection/);
  assert.match(partialize, /layerDataTable:[\s\S]*?isOpen: false,[\s\S]*?layerId: null/);
});
