import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const api = await import('../src/lib/validation-v2/index.js');
const { evaluateAllowedValue } = await import('../src/lib/validation-v2/ruleEvaluation.js');
const {
  EvaluationState,
  RuleEvaluatorKind,
  getFieldInformation,
  getValidationRules,
  getValidationV2FieldDataSummary,
  runGmiValidationV2,
} = api;
const {
  EXPECTED_KUMFORM_VALUES,
  EXPECTED_BYGGEMETODE_VALUES,
  EXPECTED_KJEGLE_VALUES,
} = await import('./fixtures/validationV2GmiV32DomainValues.mjs');
const { getDatasetRevision } = await import('../src/lib/validation-v2/datasetRevision.js');

const CASES = [
  ['manholeShape', 'Kumform', 'innmaling.point.manhole-shape.valid', EXPECTED_KUMFORM_VALUES, '14'],
  ['constructionMethod', 'Byggemetode', 'innmaling.point.construction-method.valid', EXPECTED_BYGGEMETODE_VALUES, '15'],
  ['cone', 'Kjegle', 'innmaling.point.cone.valid', EXPECTED_KJEGLE_VALUES, '15'],
];

function datasetFor(attributes, { points = null, lines = [], pointSchema = null } = {}) {
  const schema = pointSchema || Object.fromEntries(Object.keys(attributes).map((key) => [key, {}]));
  return {
    points: points || [{ attributes }],
    lines,
    fieldAnalysis: { points: schema, lines: {} },
  };
}

function run(attributes, options = {}) {
  return runGmiValidationV2({
    layerId: 'point-code-list-layer',
    dataset: datasetFor(attributes, options),
    datasetRevision: 'point-code-list-revision',
    sourceFormat: 'gmi',
  });
}

function resultFor(result, ruleId) {
  const item = result.ruleResults.find(({ rule }) => rule.ruleId === ruleId);
  assert.ok(item, `missing ${ruleId}`);
  return item;
}

test('registry has exactly three optional point code-list rules and expected counts', () => {
  const rules = getValidationRules();
  assert.equal(rules.length, 29);
  assert.equal(rules.filter(({ geometryScopes }) => geometryScopes.includes('point')).length, 22);
  assert.equal(rules.filter(({ geometryScopes }) => geometryScopes.includes('line')).length, 21);
  for (const [, , ruleId, values] of CASES) {
    const rule = rules.find(({ ruleId: candidate }) => candidate === ruleId);
    assert.equal(rule.evaluatorKind, RuleEvaluatorKind.ALLOWED_VALUE);
    assert.deepEqual(rule.allowedValues, values);
    assert.deepEqual(rule.geometryScopes, ['point']);
    assert.equal(new Set(rule.allowedValues).size, values.length);
  }
});

test('production lists match independent exact set/count oracle', () => {
  for (const [, , ruleId, expected] of CASES) {
    const actual = getValidationRules().find(({ ruleId: candidate }) => candidate === ruleId).allowedValues;
    assert.equal(actual.length, expected.length);
    assert.deepEqual(new Set(actual), new Set(expected));
    assert.deepEqual(actual, expected);
  }
});

for (const [canonicalFieldId, sourceKey, ruleId, values] of CASES) {
  test(`${sourceKey} accepts only exact supplied current codes and remains optional`, () => {
    for (const value of values) {
      const result = resultFor(run({ [sourceKey]: value }), ruleId);
      assert.equal(result.passCount, 1, value);
      assert.equal(result.failCount, 0, value);
    }
    for (const supplied of ['', ' ', ` ${values[0]}`, `${values[0]} `, values[0].toLowerCase(), 'LEGACY', 'explanatory text']) {
      const result = resultFor(run({ [sourceKey]: supplied }), ruleId);
      if (supplied === '') {
        assert.equal(result.notEvaluatedCount, 1, supplied);
      } else {
        assert.equal(result.failCount, 1, supplied);
      }
    }
    for (const supplied of [undefined, null]) {
      const result = resultFor(run(supplied === undefined ? {} : { [sourceKey]: null }), ruleId);
      assert.equal(result.notEvaluatedCount, 1, String(supplied));
      assert.equal(result.findings.length, 0);
    }

    const missing = resultFor(run({}), ruleId);
    assert.equal(missing.notEvaluatedCount, 1);
    assert.equal(missing.findings.length, 0);

    const lineOnly = run({}, { points: [], lines: [{ attributes: { [sourceKey]: values[0] } }] });
    const lineResult = resultFor(lineOnly, ruleId);
    assert.equal(lineResult.evaluatedObjectCount, 0);
    assert.equal(lineResult.notEvaluatedCount, 0);

    const mixed = run({ [sourceKey]: values[0] }, { lines: [{ attributes: { [sourceKey]: 'bad' } }] });
    const mixedResult = resultFor(mixed, ruleId);
    assert.equal(mixedResult.passCount, 1);
    assert.equal(mixedResult.geometryBreakdown.line.evaluatedCount, 0);

    const ambiguous = evaluateAllowedValue({ state: 'BINDING_AMBIGUOUS' }, values);
    assert.equal(ambiguous.state, 'INDETERMINATE');

    const fieldInfo = getFieldInformation(canonicalFieldId);
    assert.deepEqual(Object.keys(fieldInfo.valueInfo), values);
    assert.equal(fieldInfo.appliesTo.join(','), 'point');
    assert.match(fieldInfo.description, /Point-only field; optional/);
    assert.equal(fieldInfo.sources[0].pages, canonicalFieldId === 'manholeShape' ? '14' : '15');
    assert.deepEqual(fieldInfo.sources[0].auditSourceRuleIds, [ruleId]);
  });
}

test('ordinary Fildata remains available for each point code-list rule', () => {
  const dataset = datasetFor({ Kumform: 'R', Byggemetode: 'B', Kjegle: 'U' });
  const result = runGmiValidationV2({
    layerId: 'field-data-layer', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi',
  });
  for (const [canonicalFieldId, sourceKey, ruleId] of CASES) {
    const summary = getValidationV2FieldDataSummary({
      layerId: 'field-data-layer', dataset, result, geometryScope: 'point', canonicalFieldId,
      ruleId,
    });
    assert.equal(summary.rows.length, 1, sourceKey);
    assert.equal(summary.rows[0].ruleAcceptance, 'Gyldig', sourceKey);
  }
});
