import assert from 'node:assert/strict';
import test from 'node:test';
import { runGmiValidationV2, getValidationRule } from '../src/lib/validation-v2/index.js';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';
import { buildFieldDiagnostics, renderValidationV2Diagnostic, getValidationV2CoveragePresentation } from '../src/lib/validation-v2/diagnostics.js';
import { buildValidatorFieldInspectionRequest } from '../src/lib/validation-v2/tableInspection.js';
import { createContextualObjectInspection, resolveExactObjectInspectionRows } from '../src/lib/objectTableInspection.js';

const cause = 'Stedfestingsårsak';
function fixture(attributes, ruleId, geometryScope = 'line') {
  const collection = geometryScope === 'line' ? 'lines' : 'points';
  const dataset = { points: [], lines: [], fieldAnalysis: { points: {}, lines: {} } };
  dataset[collection] = attributes.map((attributes) => ({ attributes }));
  dataset.fieldAnalysis[collection] = Object.fromEntries([...new Set(attributes.flatMap(Object.keys))].map((key) => [key, {}]));
  const datasetRevision = getDatasetRevision(dataset);
  const result = runGmiValidationV2({ layerId: 'grouping', dataset, datasetRevision, sourceFormat: 'gmi', referenceDate: '2026-10-02' });
  const rule = getValidationRule(`innmaling.${geometryScope}.${ruleId}`);
  const model = () => buildFieldDiagnostics({ result, rule, field: { canonicalFieldId: rule.canonicalFieldId }, geometryScope });
  return { dataset, datasetRevision, result, rule, model, geometryScope, collection };
}
const pipe = (Tema, Material, extra = {}) => ({ Tema, Material, [cause]: 'UENDR', ...extra });
const wording = (count, field) => `${count} ${count === 1 ? 'objekt' : 'objekter'} mangler ${field}. ${count === 1 ? 'Objektet er' : 'Objektene er'} ikke registrert som NYTT, og opplysningen kan derfor mangle for eksisterende anlegg. Kontroller dersom verdien er kjent.`;

function assertSelection(f, diagnostic, indexes) {
  assert.equal(diagnostic.count, indexes.length);
  assert.equal(diagnostic.hasCompleteExactObjectRefs, true);
  const request = buildValidatorFieldInspectionRequest({ layerId: 'grouping', datasetRevision: f.datasetRevision, geometryScope: f.geometryScope, objects: f.dataset[f.collection], rules: [f.rule], result: f.result, diagnostic });
  assert.deepEqual(request.contextual.focusObjectRefs.map((ref) => ref.sourceIndex).sort(), indexes);
  assert.equal(new Set(request.contextual.focusObjectRefs.map((ref) => ref.key)).size, indexes.length);
  const layer = { id: 'grouping', data: f.dataset };
  const inspection = createContextualObjectInspection({ layer, request });
  assert.deepEqual(resolveExactObjectInspectionRows({ layer, inspection }).map((row) => row.__index).sort(), indexes);
}

test('SDR real-world materials consolidate with unchanged coverage and exact selection', () => {
  const f = fixture([pipe('VL', 'PE100'), pipe('VL', 'PVC'), pipe('VL', 'PE100', { SDR: '17' })], 'sdr.valid');
  const model = f.model();
  assert.equal(model.diagnostics.length, 1);
  const diagnostic = model.diagnostics[0];
  assert.equal(diagnostic.state, 'CHECK');
  assertSelection(f, diagnostic, [0, 1]);
  assert.equal(renderValidationV2Diagnostic(diagnostic), wording(2, 'SDR'));
  assert.deepEqual([model.coverage.applicableCount, model.coverage.presentCount, model.coverage.missingCount], [3, 1, 2]);
  const coverage = getValidationV2CoveragePresentation({ coverage: model.coverage, field: diagnostic.field });
  assert.equal(coverage.main, '1 av 3 aktuelle trykkledninger har SDR');
  assert.match(coverage.secondary, /2 mangler.*33/);
  const sourceContexts = f.result.ruleResults.find((item) => item.rule.ruleId === f.rule.ruleId).findings.map((finding) => finding.details.diagnosticFacts.context.find((item) => item.fieldId === 'material').value);
  assert.deepEqual(sourceContexts, ['PE100', 'PVC']);
});

test('SDR preserves NYTT FEIL, invalid FEIL and singular non-NYTT wording', () => {
  const f = fixture([pipe('VL', 'PE100'), pipe('VL', 'PVC', { [cause]: 'NYTT' }), pipe('VL', 'PE100', { SDR: 'bad' })], 'sdr.valid');
  const groups = f.model().diagnostics;
  assert.equal(groups.length, 3);
  const missing = groups.find((group) => group.reasonCodes.includes('NON_NEW_REQUIRED_VALUE_MISSING'));
  assert.equal(renderValidationV2Diagnostic(missing), wording(1, 'SDR'));
  assertSelection(f, missing, [0]);
  assert.equal(groups.find((group) => group.reasonCodes.includes('REQUIRED_VALUE_MISSING')).state, 'FAIL');
  assert.equal(groups.find((group) => group.reasonCodes.includes('VALUE_NOT_DECIMAL')).state, 'FAIL');
});

for (const [ruleId, field, rows, invalid] of [
  ['ring-stiffness.valid', 'Ringstivhet', [pipe('AF', 'PVC'), pipe('OV', 'PP')], { Ringstivhet: 'BAD' }],
  ['pressure-class.valid', 'Trykklasse', [pipe('VL', 'PE100'), pipe('SPP', 'PVC')], { Trykklasse: 'BAD' }],
  ['wall-thickness.required', 'Tykkelse', [pipe('VL', 'PE100'), pipe('AF', 'PVC')], { Tykkelse: '-1' }],
  ['vertical-dimension.valid', 'VertikalDimensjon', [pipe('AF', 'PVC', { Rørform: 'E' }), pipe('OV', 'PP', { Rørform: 'R' })], { VertikalDimensjon: 'bad' }],
]) {
  test(`${field} equivalent missing contexts consolidate, invalid values stay separate and counts deduplicate`, () => {
    const f = fixture([...rows, { ...rows[0], ...invalid }], ruleId);
    const groups = f.model().diagnostics;
    assert.equal(groups.length, 2);
    const missing = groups.find((group) => group.reasonCodes.some((code) => ['NON_NEW_REQUIRED_VALUE_MISSING', 'REQUIRED_VALUE_MISSING'].includes(code)));
    assertSelection(f, missing, [0, 1]);
    if (missing.reasonCodes.includes('NON_NEW_REQUIRED_VALUE_MISSING')) assert.equal(renderValidationV2Diagnostic(missing), wording(2, field));
    assert.equal(groups.find((group) => group !== missing).state, 'FAIL');
    const owner = f.result.ruleResults.find((item) => item.rule.ruleId === f.rule.ruleId);
    const duplicatedResult = { ...f.result, ruleResults: f.result.ruleResults.map((item) => item === owner ? { ...item, findings: [...item.findings, item.findings[0]] } : item) };
    const duplicatedModel = buildFieldDiagnostics({ result: duplicatedResult, rule: f.rule, field: { canonicalFieldId: f.rule.canonicalFieldId }, geometryScope: 'line' });
    assertSelection(f, duplicatedModel.diagnostics.find((group) => group.reasonCodes.includes(missing.reasonCodes[0])), [0, 1]);
  });
}

test('hydraulic expected SPECIAL missing remains distinct from applicable pressure missing', () => {
  const f = fixture([pipe('VL', 'PVC'), pipe('AFS', 'PVC')], 'pressure-class.valid');
  assert.equal(f.model().diagnostics.length, 2);
});

test('NYTT SDR missing consolidates equivalent materials without mixing non-NYTT', () => {
  const f = fixture([pipe('VL', 'PE100', { [cause]: 'NYTT' }), pipe('VLP', 'PVC', { [cause]: 'NYTT' }), pipe('VL', 'PVC')], 'sdr.valid');
  const groups = f.model().diagnostics;
  assert.equal(groups.length, 2);
  assertSelection(f, groups.find((group) => group.state === 'FAIL'), [0, 1]);
  assertSelection(f, groups.find((group) => group.state === 'CHECK'), [2]);
});

for (const [id, field, invalid] of [
  ['construction-method.valid', 'Byggemetode', 'BAD'],
  ['cone.valid', 'Kjegle', 'BAD'],
  ['wall-thickness.integer', 'Tykkelse', '-1'],
  ['bottom-distance.decimal', 'Avst_BunnInnvUnderUtv', '-1'],
  ['manhole-shape.valid', 'Kumform', 'BAD'],
  ['width.integer', 'Bredde', '-1'],
]) {
  test(`point ${field} missing consolidates across applicable Tema, retaining invalid and NYTT policy`, () => {
    const rows = [{ Tema: 'KUM', [cause]: 'UENDR' }, { Tema: 'SAN', [cause]: 'UENDR' }, { Tema: 'KUM', [cause]: 'NYTT' }, { Tema: 'SAN', [cause]: 'UENDR', [field]: invalid }];
    const f = fixture(rows, id, 'point');
    const groups = f.model().diagnostics;
    const softened = ['Byggemetode', 'Kjegle', 'Tykkelse', 'Avst_BunnInnvUnderUtv'].includes(field);
    assert.equal(groups.length, softened ? 3 : 2);
    const missing = groups.find((group) => group.reasonCodes.includes(softened ? 'NON_NEW_REQUIRED_VALUE_MISSING' : 'APPLICABILITY_REQUIRED_MISSING'));
    assert.equal(missing.state, softened ? 'CHECK' : 'FAIL');
    assertSelection(f, missing, softened ? [0, 1] : [0, 1, 2]);
    if (softened) assert.equal(renderValidationV2Diagnostic(missing), wording(2, field));
    assert.equal(groups.find((group) => group.exactObjectRefs.some((ref) => ref.sourceIndex === 3)).state, 'FAIL');
  });
}
