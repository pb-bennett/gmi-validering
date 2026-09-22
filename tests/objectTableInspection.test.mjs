import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectRef } from '../src/lib/validation-v2/objectRef.js';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';
import {
  createExactObjectInspection,
  createContextualObjectInspection,
  resolveExactObjectInspectionRows,
} from '../src/lib/objectTableInspection.js';
import { buildValidatorFieldInspectionRequest } from '../src/lib/validation-v2/tableInspection.js';
import { getContextualColumnWidth, getContextualOrdinaryColumnWidth, getContextualStickyOffsets, hasRealSuppliedValue } from '../src/lib/objectTablePresentation.js';

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
  assert.deepEqual(getContextualStickyOffsets({ temaWidth, fieldWidth: typeWidth }), { zoom: 0, tema: 36, field: 36 + temaWidth, result: 36 + temaWidth + typeWidth });
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
  assert.deepEqual(getContextualStickyOffsets({ temaWidth: 80, fieldWidth: compactWidth }), { zoom: 0, tema: 36, field: 116, result: 220 });
});

test('contextual missing-field display is presentation-only and whole-layer cell behavior stays unchanged', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/components/LayerDataTable.js', import.meta.url), 'utf8'));
  assert.match(source, /missingLabel=\{isContextualInspection && field === inspection\.presentation\.fieldColumn \? 'Mangler' : '-'\}/);
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
  assert.match(source, /contextualOrdinary:/);
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
