import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const api = await import('../src/lib/validation-v2/index.js');
const { getDatasetRevision } = await import('../src/lib/validation-v2/datasetRevision.js');
const { buildFieldDiagnostics, buildFieldDiagnosticsForRules, ValidationV2DiagnosticType } = await import('../src/lib/validation-v2/diagnostics.js');
const { buildValidatorFieldInspectionRequest } = await import('../src/lib/validation-v2/tableInspection.js');
const { createContextualObjectInspection } = await import('../src/lib/objectTableInspection.js');
const { GMIParser } = await import('../src/lib/parsing/gmiParser.js');
const { gmiObjectNumber, gmiObjectMatchesQuery, hasNativeGmiObjectNumbers } = await import('../src/lib/gmiEditView.mjs');
const { deriveLayerTableRows } = await import('../src/lib/layerTableRows.mjs');

const CONSTRUCTION = 'innmaling.point.construction-method.valid';
const WIDTH = 'innmaling.point.width.integer';
const PIPE_SHAPE = 'innmaling.line.pipe-shape.valid';
const VERTICAL = 'innmaling.line.vertical-dimension.valid';
const SDR = 'innmaling.line.sdr.valid';

function run({ points = [], lines = [] }, layerId = 'slice3') {
  const keys = (rows) => Object.fromEntries([...new Set(rows.flatMap(Object.keys))].map((key) => [key, {}]));
  const dataset = {
    points: points.map((attributes) => ({ attributes })),
    lines: lines.map((attributes) => ({ attributes })),
    fieldAnalysis: { points: keys(points), lines: keys(lines) },
  };
  return { dataset, result: api.runGmiValidationV2({ layerId, dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-11-16' }) };
}
const outcome = (result, ruleId, index, scope = 'point') => result.outcomes.find((item) => item.ruleId === ruleId && item.objectRef.geometryScope === scope && item.objectRef.sourceIndex === index);
const findings = (result, ruleId) => result.ruleResults.find((item) => item.rule.ruleId === ruleId).findings;

test('LOK and TOP: missing Byggemetode gives neither Feil nor Sjekk, also for NYTT objects', () => {
  const { result } = run({ points: [
    { Tema: 'LOK' }, { Tema: 'TOP' },
    { Tema: 'LOK', 'Stedfestingsårsak': 'NYTT' }, { Tema: 'TOP', 'Stedfestingsårsak': 'NYTT' },
  ] });
  for (const index of [0, 1, 2, 3]) assert.equal(outcome(result, CONSTRUCTION, index).state, 'PASS');
  assert.equal(findings(result, CONSTRUCTION).length, 0);
  for (const tema of ['LOK', 'TOP']) {
    assert.equal(api.getPointFieldApplicability(tema, 'constructionMethod').state, 'OPTIONAL_SUPPORTED');
  }
});

test('LOK and TOP: supplied Byggemetode is still validated normally and nothing is copied or invented', () => {
  const { dataset, result } = run({ points: [
    { Tema: 'LOK', Byggemetode: 'B' }, { Tema: 'TOP', Byggemetode: 'B' },
    { Tema: 'LOK', Byggemetode: 'UK' }, { Tema: 'TOP', Byggemetode: 'NOPE' },
  ] });
  assert.deepEqual([0, 1, 2, 3].map((index) => outcome(result, CONSTRUCTION, index).state), ['PASS', 'PASS', 'CHECK', 'FAIL']);
  assert.equal(Object.hasOwn(dataset.points[0].attributes, 'Material'), false, 'Byggemetode is not cover material');
});

test('Byggemetode requiredness is unchanged for applicable manhole Tema and other LOK rules still report', () => {
  const { result } = run({ points: [
    { Tema: 'KUM' }, { Tema: 'KUM', 'Stedfestingsårsak': 'NYTT' }, { Tema: 'SLU', 'Stedfestingsårsak': 'NYTT' },
    { Tema: 'LOK', 'Stedfestingsårsak': 'NYTT' },
  ] });
  assert.deepEqual([0, 1, 2].map((index) => outcome(result, CONSTRUCTION, index).state), ['CHECK', 'FAIL', 'FAIL']);
  // LOK × Bredde remains applicable: its missing-value finding is not suppressed.
  assert.notEqual(outcome(result, WIDTH, 3).state, 'PASS');
  assert(findings(result, WIDTH).some((finding) => finding.objectRef.sourceIndex === 3));
  for (const tema of ['KUM', 'SAN', 'SLS', 'SLU', 'KUMI']) {
    assert.equal(api.getPointFieldApplicability(tema, 'constructionMethod').state, 'APPLICABLE');
  }
  // Byggemetode-driven S_HYPERLINK policy on LOK/TOP is unchanged.
  const hyperlink = run({ points: [{ Tema: 'LOK', S_HYPERLINK: 'a.jpg' }, { Tema: 'TOP' }] }).result;
  assert.equal(outcome(hyperlink, 'innmaling.point.attachment-link.policy', 0).state, 'FAIL');
  assert.equal(outcome(hyperlink, 'innmaling.point.attachment-link.policy', 1).state, 'PASS');
});

test('Regel help text states the LOK/TOP exemption and the applicability list omits them', () => {
  const rule = api.getValidationRule(CONSTRUCTION);
  assert.match(rule.description, /kreves ikke for kumlokk \(LOK\/TOP\)/);
});

function pipeRun() {
  return run({ lines: [
    { Tema: 'VL', Material: 'PE100', Dimensjon: '110' },
    { Tema: 'VL', Material: 'PE100', Dimensjon: '110', 'Rørform': 'S' },
    { Tema: 'VL', Material: 'PE100', Dimensjon: '110', 'Rørform': 'BAD' },
  ] });
}

test('missing/invalid Rørform keeps one Feil per pipe and VertikalDimensjon stays a dependency Sjekk without a duplicate Feil', () => {
  const { result } = pipeRun();
  assert.equal(outcome(result, PIPE_SHAPE, 0, 'line').state, 'FAIL');
  assert.equal(outcome(result, PIPE_SHAPE, 2, 'line').state, 'FAIL');
  for (const index of [0, 2]) {
    const vertical = outcome(result, VERTICAL, index, 'line');
    assert.equal(vertical.state, 'NOT_EVALUATED');
    assert.equal(vertical.suppression, 'PIPE_SHAPE_UNRESOLVED');
  }
  assert.equal(findings(result, VERTICAL).length, 0, 'no second Feil for the same Rørform defect');
  const presentation = api.getValidationV2RulePresentations(result.ruleResults, 'line')
    .find((item) => item.rule.canonicalFieldId === 'verticalDimension');
  assert.equal(presentation.status.enum, 'CHECK');
  assert.equal(presentation.counts.checkCount, 2);
});

test('VertikalDimensjon dependency note exposes the exact blocked pipes and opens them through the Validator table request', () => {
  const { dataset, result } = pipeRun();
  const rule = api.getValidationRule(VERTICAL);
  const model = buildFieldDiagnostics({ result, rule, geometryScope: 'line' });
  assert.equal(model.diagnostics.length, 0);
  assert.equal(model.unresolved.length, 1);
  const [note] = model.unresolved;
  assert.equal(note.type, ValidationV2DiagnosticType.DEPENDENCY_UNRESOLVED);
  assert.equal(note.dependency, 'PIPE_SHAPE_UNRESOLVED');
  assert.equal(note.state, null);
  assert.equal(note.hasCompleteExactObjectRefs, true);
  assert.deepEqual(note.exactObjectRefs.map((ref) => ref.sourceIndex), [0, 2]);
  assert(Object.isFrozen(note.exactObjectRefs));
  // Same composed model the Validator inspector renders.
  const composed = buildFieldDiagnosticsForRules({ result, rules: [rule], geometryScope: 'line' });
  assert.deepEqual(composed.unresolved[0].exactObjectRefs.map((ref) => ref.sourceIndex), [0, 2]);

  const layer = { id: 'slice3', data: dataset };
  const request = buildValidatorFieldInspectionRequest({
    layerId: layer.id, datasetRevision: getDatasetRevision(dataset), geometryScope: 'line', objects: dataset.lines,
    rules: [rule], result, diagnostic: note, fieldLabel: 'VertikalDimensjon',
  });
  assert(request, 'the dependency note can open the shared Validator object table');
  assert.deepEqual(request.contextual.focusObjectRefs.map((ref) => ref.sourceIndex), [0, 2]);
  assert.deepEqual(request.scope.objectRefs.map((ref) => ref.sourceIndex).sort(), [0, 1, 2]);
  assert.equal(request.contextual.resultByObjectKey[note.exactObjectRefs[0].key], 'CHECK');
  assert.equal(request.contextual.resultByObjectKey[note.exactObjectRefs[1].key], 'CHECK');
  const inspection = createContextualObjectInspection({ layer, request: { ...request, context: { status: 'CHECK', source: 'validation-v2-diagnostic' } } });
  assert.deepEqual([...inspection.focusIndices], [0, 2]);
  assert.equal(inspection.context.status, 'CHECK');
});

test('comparable dependency notes (SDR blocked by Material, Type blocked by Tema) use the same exact-object action', () => {
  const lines = run({ lines: [{ Tema: 'VL' }, { Tema: 'VL', Material: 'PE100', SDR: '11.0' }] });
  const sdr = buildFieldDiagnostics({ result: lines.result, rule: api.getValidationRule(SDR), geometryScope: 'line' });
  const material = sdr.unresolved.find((note) => note.dependency === 'MATERIAL_UNRESOLVED');
  assert(material);
  assert.equal(material.hasCompleteExactObjectRefs, true);
  assert.deepEqual(material.exactObjectRefs.map((ref) => ref.sourceIndex), [0]);
  const points = run({ points: [{ Type: 'KBRE' }, { Tema: 'KUM', Type: 'KBRE' }] });
  const typeRule = api.getValidationRules().find((rule) => rule.ruleId === 'innmaling.point.type-tema.compatible');
  const typeModel = buildFieldDiagnostics({ result: points.result, rule: typeRule, geometryScope: 'point' });
  for (const note of typeModel.unresolved) {
    assert.equal(note.hasCompleteExactObjectRefs, true);
    assert.equal(note.exactObjectRefs.length, note.count);
  }
});

test('ordinary NOT_EVALUATED outcomes stay outside the inspected population', () => {
  const { dataset, result } = pipeRun();
  const rule = api.getValidationRule(VERTICAL);
  const [note] = buildFieldDiagnostics({ result, rule, geometryScope: 'line' }).unresolved;
  const stripped = { outcomes: result.outcomes.map((item) => item.ruleId === VERTICAL && item.state === 'NOT_EVALUATED'
    ? { ...item, suppression: null, reasonCode: 'DATASET_CONTEXT_REQUIRED' } : item) };
  const request = buildValidatorFieldInspectionRequest({ layerId: 'slice3', datasetRevision: getDatasetRevision(dataset), geometryScope: 'line',
    objects: dataset.lines, rules: [rule], result: stripped, diagnostic: note, fieldLabel: 'VertikalDimensjon' });
  assert.deepEqual(request.scope.objectRefs.map((ref) => ref.sourceIndex), [1]);
});

function syntheticGmi() {
  const out = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', 'COSYS_EPSG 25832',
    '[L_]', '_FIELDNAMES Tema;Merknad;', '[P_]', '_FIELDNAMES Tema;Merknad;', '[+L_]'];
  [1, 2, 3, 4, 5].forEach((number, index) => out.push(`:L ${number}`, `_FIELDVALUES VL;Line ${String.fromCharCode(69 - index)};`, '/XYZ', `581940 ${6566000 + index} 101`, `581945 ${6566001 + index} 101`));
  out.push('[+P_]');
  [3, 4, 5, 6, 11, 13, 15, 17, 20, 22, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35].forEach((number, index) => out.push(`:P ${number}`, `_FIELDVALUES KUM;Point ${index % 2 ? 'odd' : 'even'};`, '/XYZ', `581942 ${6566000 + index} 101`));
  out.push('[END]', '');
  return new GMIParser(out.join('\r\n')).parse();
}

test('standard Data Table numbers come from original nonconsecutive GMI point and line numbers', () => {
  const data = syntheticGmi();
  const pointNumbers = [3, 4, 5, 6, 11, 13, 15, 17, 20, 22, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
  assert.deepEqual(data.points.map((point) => point.id), pointNumbers);
  assert.deepEqual(data.lines.map((line) => line.id), [1, 2, 3, 4, 5]);
  assert.equal(hasNativeGmiObjectNumbers(data, 'point'), true);
  assert.equal(hasNativeGmiObjectNumbers(data, 'line'), true);
  const label = (scope, index) => gmiObjectNumber(scope, index, (scope === 'line' ? data.lines : data.points)[index].id);
  assert.deepEqual(pointNumbers.map((_, index) => label('point', index).text), pointNumbers.map(String), 'gaps are preserved');
  assert.equal(label('point', 0).label, 'Punkt 3');
  assert.equal(label('line', 2).label, 'Ledning 3', 'point and line numbering stay distinct');
  assert.equal(gmiObjectMatchesQuery('p3', 'point', 0, 3), true);
  assert.equal(gmiObjectMatchesQuery('l3', 'point', 0, 3), false);
  assert.equal(gmiObjectMatchesQuery('l3', 'line', 2, 3), true);
});

test('Nr. identity stays bound to the source object through filtering, search and selection display', () => {
  const data = syntheticGmi();
  const identityMatches = (scope) => (item, query) => gmiObjectMatchesQuery(query, scope, item.__index, (scope === 'line' ? data.lines : data.points)[item.__index].id);
  const searched = deriveLayerTableRows({ dataset: data, tab: 'punkter', searchQuery: '20', identityMatches: identityMatches('point') });
  assert.deepEqual(searched.displayItems.map((item) => data.points[item.__index].id), [20]);
  const byText = deriveLayerTableRows({ dataset: data, tab: 'punkter', searchQuery: 'odd', identityMatches: identityMatches('point') });
  assert.deepEqual(byText.displayItems.map((item) => data.points[item.__index].id), [4, 6, 13, 17, 22, 26, 28, 30, 32, 34]);
  const selected = deriveLayerTableRows({ dataset: data, tab: 'ledninger', selectionKeys: ['line:4', 'line:1'] });
  assert.deepEqual(selected.displayItems.map((item) => data.lines[item.__index].id), [2, 5]);
  // Sorting by Nr. uses the original number, never the row position.
  const sortValues = data.points.map((point, index) => gmiObjectNumber('point', index, point.id).sortValue);
  assert.deepEqual([...sortValues].sort((a, b) => b - a).slice(0, 3), [35, 34, 33]);
});

test('layers without native GMI object numbers get no fabricated Nr.', () => {
  assert.equal(hasNativeGmiObjectNumbers({ format: 'KOF', points: [{ id: 3 }] }, 'point'), false);
  assert.equal(hasNativeGmiObjectNumbers({ format: 'GMI', points: [{ attributes: {} }] }, 'point'), false);
  assert.equal(hasNativeGmiObjectNumbers({ format: 'GMI', points: [{ id: 3 }], lines: [] }, 'line'), false);
  assert.equal(hasNativeGmiObjectNumbers(null, 'point'), false);
});
