import assert from 'node:assert/strict';
import test from 'node:test';
import { runGmiValidationV2, getValidationRule } from '../src/lib/validation-v2/index.js';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';
import { buildFieldDiagnostics, renderValidationV2Diagnostic } from '../src/lib/validation-v2/diagnostics.js';

const cause = 'Stedfestings\u00e5rsak';
function run(points = [], lines = []) {
  const fields = (items) => Object.fromEntries([...new Set(items.flatMap(Object.keys))].map((key) => [key, {}]));
  const dataset = { points: points.map((attributes) => ({ attributes })), lines: lines.map((attributes) => ({ attributes })), fieldAnalysis: { points: fields(points), lines: fields(lines) } };
  return runGmiValidationV2({ layerId: 'non-new-policy', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-28' });
}
function outcome(result, scope, ruleId, index) {
  const item = result.outcomes.find((candidate) => candidate.objectRef.geometryScope === scope && candidate.ruleId === ruleId && candidate.objectRef.sourceIndex === index);
  assert.ok(item, `${scope} ${ruleId} ${index}`);
  return item;
}
const causes = ['NYTT', 'UENDR', 'FJERN', undefined, 'INVALID'];
const expected = ['FAIL', 'CHECK', 'CHECK', 'CHECK', 'CHECK'];

test('applicable point construction fields soften only missing non-NYTT values', () => {
  const pointFields = [
    ['Byggemetode', 'innmaling.point.construction-method.valid', 'BAD'],
    ['Kjegle', 'innmaling.point.cone.valid', 'BAD'],
    ['Tykkelse', 'innmaling.point.wall-thickness.integer', '-1'],
    ['Avst_BunnInnvUnderUtv', 'innmaling.point.bottom-distance.decimal', '-1'],
  ];
  for (const [field, ruleId, invalid] of pointFields) {
    const points = [...causes.map((code) => ({ Tema: 'KUM', ...(code === undefined ? {} : { [cause]: code }) })), { Tema: 'KUM', [cause]: 'UENDR', [field]: invalid }];
    const result = run(points);
    assert.deepEqual(causes.map((_, i) => outcome(result, 'point', ruleId, i).state), expected, field);
    assert.equal(outcome(result, 'point', ruleId, 5).state, 'FAIL', field);
    for (const i of [1, 2, 3, 4]) assert.equal(outcome(result, 'point', ruleId, i).reasonCode, 'NON_NEW_REQUIRED_VALUE_MISSING');
    assert.equal(outcome(result, 'point', 'innmaling.common.positioning-cause.valid', 3).state, 'FAIL');
    assert.equal(outcome(result, 'point', 'innmaling.common.positioning-cause.valid', 4).state, 'FAIL');
  }
  const outside = run([{ Tema: 'STR', [cause]: 'UENDR' }]);
  for (const [, ruleId] of pointFields) assert.equal(outcome(outside, 'point', ruleId, 0).state, 'PASS');
});

test('line Tykkelse, required SDR and required Ringstivhet use the same missing split', () => {
  const lines = [...causes.map((code) => ({ Tema: 'VL', Material: 'PE100', ...(code === undefined ? {} : { [cause]: code }) })),
    ...causes.map((code) => ({ Tema: 'AF', Material: 'PVC', ...(code === undefined ? {} : { [cause]: code }) })),
    { Tema: 'VL', Material: 'PE100', [cause]: 'UENDR', Tykkelse: '-1', SDR: 'bad' },
    { Tema: 'AF', Material: 'PVC', [cause]: 'UENDR', Ringstivhet: 'BAD' }];
  const result = run([], lines);
  for (const ruleId of ['innmaling.line.wall-thickness.required', 'innmaling.line.sdr.valid']) {
    assert.deepEqual(causes.map((_, i) => outcome(result, 'line', ruleId, i).state), expected, ruleId);
    assert.equal(outcome(result, 'line', ruleId, 10).state, 'FAIL');
  }
  assert.deepEqual(causes.map((_, i) => outcome(result, 'line', 'innmaling.line.ring-stiffness.valid', i + 5).state), expected);
  assert.equal(outcome(result, 'line', 'innmaling.line.ring-stiffness.valid', 11).state, 'FAIL');
  for (const i of [3, 4, 8, 9]) assert.equal(outcome(result, 'line', 'innmaling.common.positioning-cause.valid', i).state, 'FAIL');
  const dependencies = run([], [
    { Tema: 'AFS', Material: 'PVC', [cause]: 'NYTT' },
    { Tema: 'AF', Material: 'BET', [cause]: 'NYTT' },
    { Tema: 'VL', [cause]: 'UENDR' },
    { Tema: 'BAD', Material: 'PVC', [cause]: 'UENDR' },
  ]);
  assert.equal(outcome(dependencies, 'line', 'innmaling.line.sdr.valid', 0).state, 'CHECK');
  assert.equal(outcome(dependencies, 'line', 'innmaling.line.ring-stiffness.valid', 0).state, 'CHECK');
  assert.equal(outcome(dependencies, 'line', 'innmaling.line.ring-stiffness.valid', 1).state, 'PASS');
  assert.equal(outcome(dependencies, 'line', 'innmaling.line.sdr.valid', 2).state, 'NOT_EVALUATED');
  assert.equal(outcome(dependencies, 'line', 'innmaling.line.sdr.valid', 3).state, 'NOT_EVALUATED');
  assert.equal(outcome(dependencies, 'line', 'innmaling.line.pressure-class.valid', 2).state, 'CHECK');
});

test('strict missing fields and Anleggsår retain their existing severities', () => {
  const point = run([{ Tema: 'DIV', [cause]: 'UENDR' }, { Tema: 'KUM', [cause]: 'UENDR' }]);
  for (const id of ['innmaling.point.type.valid', 'innmaling.point.inside-outside.valid']) assert.equal(outcome(point, 'point', id, 0).state, 'FAIL');
  for (const id of ['innmaling.point.manhole-shape.valid', 'innmaling.point.inside-outside.valid', 'innmaling.point.width.integer']) assert.equal(outcome(point, 'point', id, 1).state, 'FAIL');
  const line = run([], [{ Tema: 'AF', [cause]: 'UENDR', Rørform: 'E' }]);
  for (const id of ['dimension.required', 'vertical-dimension.valid', 'material.required', 'network-type.valid', 'inside-outside.valid']) assert.equal(outcome(line, 'line', `innmaling.line.${id}`, 0).state, 'FAIL', id);
  const missingShape = run([], [{ Tema: 'AF', [cause]: 'UENDR' }]);
  assert.equal(outcome(missingShape, 'line', 'innmaling.line.pipe-shape.valid', 0).state, 'FAIL');
  const years = run([{ Tema: 'KUM', [cause]: 'NYTT' }, { Tema: 'KUM', [cause]: 'UENDR' }, { Tema: 'KUM' }], [{ Tema: 'AF', [cause]: 'NYTT' }, { Tema: 'AF', [cause]: 'FJERN' }]);
  assert.deepEqual([0, 1, 2].map((i) => outcome(years, 'point', 'innmaling.common.installation-year.required', i).state), ['FAIL', 'CHECK', 'CHECK']);
  assert.deepEqual([0, 1].map((i) => outcome(years, 'line', 'innmaling.common.installation-year.required', i).state), ['FAIL', 'CHECK']);
});

test('review diagnostics retain required context and factual coverage', () => {
  const result = run([{ Tema: 'KUM', [cause]: 'NYTT', Tykkelse: '10' }, { Tema: 'KUM', [cause]: 'UENDR' }]);
  const rule = getValidationRule('innmaling.point.wall-thickness.integer');
  const model = buildFieldDiagnostics({ result, rule, field: { canonicalFieldId: 'wallThickness', displayName: 'Tykkelse' }, geometryScope: 'point', summary: { objectCount: 2 } });
  const diagnostic = model.diagnostics.find((item) => item.state === 'CHECK');
  assert.ok(diagnostic);
  assert.match(renderValidationV2Diagnostic(diagnostic), /normalt påkrevd.*ikke merket NYTT.*bør kontrolleres/);
  assert.equal(model.coverage?.applicableCount, 2);
  assert.equal(model.coverage?.presentCount, 1);
});
