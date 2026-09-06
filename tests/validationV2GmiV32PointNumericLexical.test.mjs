import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const api = await import('../src/lib/validation-v2/index.js');
const { evaluateIntegerFormat } = await import('../src/lib/validation-v2/ruleEvaluation.js');
const { GMIParser } = await import('../src/lib/parsing/gmiParser.js');
const { GMI_SOURCE_LEXEMES } = await import('../src/lib/parsing/gmiLexicalEvidence.js');
const { getDatasetRevision } = await import('../src/lib/validation-v2/datasetRevision.js');

const {
  BindingState,
  EvaluationState,
  ObjectValueState,
  RuleCategory,
  RuleEvaluatorKind,
  RuleReasonCode,
  composeFieldInformation,
  getFieldInformation,
  getValidationRule,
  getValidationRules,
  getValidationV2FieldDataSummary,
  runGmiValidationV2,
} = api;

const FIELDS = [
  {
    canonicalFieldId: 'width',
    sourceKey: 'Bredde',
    caseKey: 'BREDDE',
    ruleId: 'innmaling.point.width.integer',
  },
  {
    canonicalFieldId: 'length',
    sourceKey: 'Lengde',
    caseKey: 'LENGDE',
    ruleId: 'innmaling.point.length.integer',
  },
];

const EXPECTED_VALUE_NOT_INTEGER = 'VALUE_NOT_INTEGER';
const EXPECTED_NUMERIC_PRECISION_UNAVAILABLE = 'NUMERIC_PRECISION_UNAVAILABLE';

function schemaFor(keys) {
  return Object.fromEntries(keys.map((key) => [key, {}]));
}

function datasetFor({
  points = [],
  lines = [],
  pointSchema = null,
  lineSchema = null,
} = {}) {
  const inferredPointKeys = [...new Set(points.flatMap(({ attributes }) =>
    attributes && typeof attributes === 'object' ? Object.keys(attributes) : []))];
  const inferredLineKeys = [...new Set(lines.flatMap(({ attributes }) =>
    attributes && typeof attributes === 'object' ? Object.keys(attributes) : []))];
  return {
    format: 'GMI',
    points,
    lines,
    fieldAnalysis: {
      points: pointSchema ?? schemaFor(inferredPointKeys),
      lines: lineSchema ?? schemaFor(inferredLineKeys),
    },
  };
}

function run(dataset, layerId = 'numeric-layer', datasetRevision = 'numeric-revision') {
  return runGmiValidationV2({
    layerId,
    dataset,
    datasetRevision,
    sourceFormat: 'gmi',
  });
}

function resultFor(result, ruleId) {
  const ruleResult = result.ruleResults.find(({ rule }) => rule.ruleId === ruleId);
  assert.ok(ruleResult, `missing result for ${ruleId}`);
  return ruleResult;
}

function addLexeme(attributes, sourceKey, sourceLexeme) {
  Object.defineProperty(attributes, GMI_SOURCE_LEXEMES, {
    value: Object.freeze({ [sourceKey]: sourceLexeme }),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return attributes;
}

function runRuntime(field, sourceValue, { propertyPresent = true } = {}) {
  const attributes = propertyPresent ? { [field.sourceKey]: sourceValue } : {};
  return resultFor(run(datasetFor({
    points: [{ attributes }],
    pointSchema: schemaFor([field.sourceKey]),
  })), field.ruleId);
}

function parsePoint(field, sourceLexeme) {
  const gmi = `[GMIFILE_ASCII]\n` +
    `[P_]\n_FIELDNAMES ${field.sourceKey}\n` +
    `[+P_]\n:P 1\n_FIELDVALUES ${sourceLexeme}\n/XYZ\n1 2 3\n`;
  const parsed = new GMIParser(gmi).toObject();
  assert.deepEqual(parsed.errors, []);
  return parsed;
}

test('registry exposes Bredde/Lengde point-only integer contracts and 45/38/21 totals', () => {
  const rules = getValidationRules();
  assert.equal(rules.length, 45);
  assert.equal(rules.filter(({ geometryScopes }) => geometryScopes.includes('point')).length, 38);
  assert.equal(rules.filter(({ geometryScopes }) => geometryScopes.includes('line')).length, 21);
  for (const field of FIELDS) {
    const rule = getValidationRule(field.ruleId);
    assert.equal(rule.canonicalFieldId, field.canonicalFieldId);
    assert.deepEqual(rule.geometryScopes, ['point']);
    assert.equal(rule.evaluatorKind, RuleEvaluatorKind.INTEGER_FORMAT);
    assert.equal(rule.category, RuleCategory.VALUE_FORMAT);
    assert.equal(rule.severity, 'ERROR');
    assert.equal(rule.provenance, 'STANDARD');
    assert.deepEqual(rule.source, { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 9' });
    assert.equal(Object.hasOwn(rule, 'allowedValues'), false);
    assert.equal(Object.hasOwn(rule, 'valueComparison'), false);
  }
});

for (const field of FIELDS) {
  test(`${field.sourceKey} preserves direct, preferred-direct, unique-case and ambiguous binding semantics`, () => {
    const direct = resultFor(run(datasetFor({
      points: [{ attributes: { [field.sourceKey]: '1000' } }],
    })), field.ruleId);
    assert.equal(direct.passCount, 1);

    const directWins = run(datasetFor({
      points: [{ attributes: { [field.sourceKey]: '1000', [field.caseKey]: undefined } }],
      pointSchema: schemaFor([field.caseKey, field.sourceKey]),
    }));
    assert.equal(resultFor(directWins, field.ruleId).passCount, 1);
    const binding = directWins.schemaBinding.bindings.find((candidate) =>
      candidate.geometryScope === 'point' && candidate.canonicalFieldId === field.canonicalFieldId);
    assert.equal(binding.preferredSourceKey, field.sourceKey);

    const caseOnly = run(datasetFor({
      points: [{ attributes: { [field.caseKey]: '01000' } }],
    }));
    assert.equal(resultFor(caseOnly, field.ruleId).passCount, 1);
    const caseBinding = caseOnly.schemaBinding.bindings.find((candidate) =>
      candidate.geometryScope === 'point' && candidate.canonicalFieldId === field.canonicalFieldId);
    assert.equal(caseBinding.mappingKind, 'CASE_NORMALIZED');

    const lowerKey = field.sourceKey.toLowerCase();
    const ambiguous = run(datasetFor({
      points: [{ attributes: { [field.caseKey]: '1000', [lowerKey]: '1001' } }],
    }));
    const ambiguousResult = resultFor(ambiguous, field.ruleId);
    assert.equal(ambiguousResult.indeterminateCount, 1);
    assert.equal(ambiguousResult.findings[0].reasonCode, RuleReasonCode.BINDING_AMBIGUOUS);
  });

  test(`${field.sourceKey} is optional for absent schema/property and undefined/null/empty values`, () => {
    const absentSchema = resultFor(run(datasetFor({ points: [{ attributes: {} }] })), field.ruleId);
    assert.equal(absentSchema.notEvaluatedCount, 1);
    assert.equal(absentSchema.findings.length, 0);

    for (const [label, ruleResult] of [
      ['absent property', runRuntime(field, undefined, { propertyPresent: false })],
      ['undefined', runRuntime(field, undefined)],
      ['null', runRuntime(field, null)],
      ['empty', runRuntime(field, '')],
    ]) {
      assert.equal(ruleResult.notEvaluatedCount, 1, label);
      assert.equal(ruleResult.findings.length, 0, label);
    }
  });

  test(`${field.sourceKey} independently enforces the exact source-lexeme integer grammar`, () => {
    const accepted = ['1000', '01000', '+1000', '-1', '0', '-0'];
    const rejected = [
      '1000.0', '1.5', '1,5', '1e3', '1E3',
      ' 1000', '1000 ', ' 1000 ', '1000mm', '--1', '+', 'abc',
    ];
    for (const sourceLexeme of accepted) {
      const parsed = parsePoint(field, sourceLexeme);
      assert.equal(parsed.points[0].attributes[GMI_SOURCE_LEXEMES][field.sourceKey], sourceLexeme);
      const ruleResult = resultFor(run(parsed), field.ruleId);
      assert.equal(ruleResult.passCount, 1, sourceLexeme);
      assert.equal(ruleResult.failCount, 0, sourceLexeme);
    }
    for (const sourceLexeme of rejected) {
      const parsed = parsePoint(field, sourceLexeme);
      assert.equal(parsed.points[0].attributes[GMI_SOURCE_LEXEMES][field.sourceKey], sourceLexeme);
      const ruleResult = resultFor(run(parsed), field.ruleId);
      assert.equal(ruleResult.failCount, 1, sourceLexeme);
      assert.equal(ruleResult.findings[0].reasonCode, EXPECTED_VALUE_NOT_INTEGER, sourceLexeme);
    }

    const whitespace = parsePoint(field, '   ');
    assert.equal(whitespace.points[0].attributes[field.sourceKey], null);
    assert.equal(whitespace.points[0].attributes[GMI_SOURCE_LEXEMES][field.sourceKey], '   ');
    const whitespaceResult = resultFor(run(whitespace), field.ruleId);
    assert.equal(whitespaceResult.notEvaluatedCount, 1);
    assert.equal(whitespaceResult.findings.length, 0);
  });

  test(`${field.sourceKey} uses the exact no-lexeme runtime fallback`, () => {
    for (const value of [1000, 1000.0, -1, 0, -0]) {
      assert.equal(runRuntime(field, value).passCount, 1, String(value));
    }
    for (const value of [1.5, NaN, Infinity, -Infinity, true, {}, '1000.0', ' 1000']) {
      const ruleResult = runRuntime(field, value);
      assert.equal(ruleResult.failCount, 1, String(value));
      assert.equal(ruleResult.findings[0].reasonCode, EXPECTED_VALUE_NOT_INTEGER, String(value));
    }
    for (const value of ['1000', '01000', '+1000', '-1', '0', '-0']) {
      assert.equal(runRuntime(field, value).passCount, 1, value);
    }
    const unsafe = runRuntime(field, Number.MAX_SAFE_INTEGER + 1);
    assert.equal(unsafe.indeterminateCount, 1);
    assert.equal(unsafe.findings[0].reasonCode, EXPECTED_NUMERIC_PRECISION_UNAVAILABLE);
    assert.equal(unsafe.failCount, 0);
  });
}

test('forbidden width aliases and length near-matches never become canonical bindings', () => {
  for (const sourceKey of ['DIM', 'DIMENSJON', 'Dimensjon', 'DIAMETER']) {
    const result = run(datasetFor({ points: [{ attributes: { [sourceKey]: 'bad' } }] }));
    const binding = result.schemaBinding.bindings.find((candidate) =>
      candidate.geometryScope === 'point' && candidate.canonicalFieldId === 'width');
    assert.notEqual(binding.state, BindingState.BOUND, sourceKey);
    assert.equal(binding.preferredSourceKey, null, sourceKey);
    assert.equal(resultFor(result, 'innmaling.point.width.integer').findings.some(
      ({ reasonCode }) => reasonCode === EXPECTED_VALUE_NOT_INTEGER), false, sourceKey);
  }
  for (const sourceKey of ['LENGTH', 'Lengde_mm', 'LENGD']) {
    const result = run(datasetFor({ points: [{ attributes: { [sourceKey]: 'bad' } }] }));
    const binding = result.schemaBinding.bindings.find((candidate) =>
      candidate.geometryScope === 'point' && candidate.canonicalFieldId === 'length');
    assert.equal(binding.state, BindingState.FIELD_ABSENT, sourceKey);
    assert.equal(resultFor(result, 'innmaling.point.length.integer').notEvaluatedCount, 1, sourceKey);
  }
});

test('integer evaluator preserves unresolved/schema reason codes without custom lookup', () => {
  for (const [state, reasonCode] of [
    [ObjectValueState.BINDING_AMBIGUOUS, RuleReasonCode.BINDING_AMBIGUOUS],
    [ObjectValueState.UNRESOLVED_SOURCE, RuleReasonCode.UNRESOLVED_SOURCE],
    [ObjectValueState.SCHEMA_UNAVAILABLE, RuleReasonCode.SCHEMA_UNAVAILABLE],
  ]) {
    assert.deepEqual(evaluateIntegerFormat({ state }), {
      state: EvaluationState.INDETERMINATE,
      reasonCode,
    });
  }
  for (const state of [ObjectValueState.FIELD_ABSENT, ObjectValueState.VALUE_MISSING]) {
    assert.deepEqual(evaluateIntegerFormat({ state }), {
      state: EvaluationState.NOT_EVALUATED,
      reasonCode: null,
    });
  }
});

test('new rules are point-only in line-only and mixed datasets', () => {
  const lineOnly = run(datasetFor({
    lines: [{ attributes: { Bredde: 'bad', Lengde: 'bad' }, coordinates: [{ x: 0, y: 0 }, { x: 3, y: 4 }] }],
  }));
  for (const field of FIELDS) {
    const ruleResult = resultFor(lineOnly, field.ruleId);
    assert.equal(ruleResult.evaluatedObjectCount, 0);
    assert.equal(ruleResult.geometryBreakdown.line.evaluatedCount, 0);
  }

  const mixed = run(datasetFor({
    points: [{ attributes: { Bredde: '1000', Lengde: 'bad' } }],
    lines: [{ attributes: { Bredde: 'bad', Lengde: '1000' }, coordinates: [{ x: 0, y: 0 }, { x: 0, y: 1000 }] }],
  }));
  assert.equal(resultFor(mixed, 'innmaling.point.width.integer').passCount, 1);
  assert.equal(resultFor(mixed, 'innmaling.point.length.integer').failCount, 1);
  assert.equal(resultFor(mixed, 'innmaling.point.length.integer').findings[0].objectRef.geometryScope, 'point');
});

test('Lengde is never geometry-derived and malformed supplied point Lengde stays failed', () => {
  for (const coordinates of [
    [{ x: 0, y: 0 }, { x: 3, y: 4 }],
    [{ x: 0, y: 0 }, { x: 0, y: 1000 }],
  ]) {
    const absent = run(datasetFor({
      points: [{ attributes: {}, coordinates: [{ x: 1, y: 2 }] }],
      lines: [{ attributes: {}, coordinates }],
    }));
    assert.equal(resultFor(absent, 'innmaling.point.length.integer').notEvaluatedCount, 1);
  }

  const malformed = run(datasetFor({
    points: [{ attributes: { Lengde: '1000.0' }, coordinates: [{ x: 1, y: 2 }] }],
    lines: [{ attributes: {}, coordinates: [{ x: 0, y: 0 }, { x: 0, y: 1000 }] }],
  }));
  assert.equal(resultFor(malformed, 'innmaling.point.length.integer').failCount, 1);
});

for (const field of FIELDS) {
  test(`${field.sourceKey} format outcome is independent of Tema applicability and resolution`, () => {
    const temaVariants = [
      { attributes: { [field.sourceKey]: '1.5', Tema: 'KUM' }, schema: [field.sourceKey, 'Tema'] },
      { attributes: { [field.sourceKey]: '1.5', Tema: 'KRN' }, schema: [field.sourceKey, 'Tema'] },
      { attributes: { [field.sourceKey]: '1.5', Tema: 'KMR' }, schema: [field.sourceKey, 'Tema'] },
      { attributes: { [field.sourceKey]: '1.5' }, schema: [field.sourceKey] },
      { attributes: { [field.sourceKey]: '1.5', Tema: 'KUM', S_FCODE: 'KRN' }, schema: [field.sourceKey, 'Tema', 'S_FCODE'] },
    ];
    for (const [index, variant] of temaVariants.entries()) {
      const result = run(datasetFor({
        points: [{ attributes: variant.attributes }],
        pointSchema: schemaFor(variant.schema),
      }));
      const ruleResult = resultFor(result, field.ruleId);
      assert.equal(ruleResult.failCount, 1, String(index));
      assert.equal(ruleResult.findings[0].reasonCode, EXPECTED_VALUE_NOT_INTEGER, String(index));
    }
  });
}

test('findings retain exact rule, field, layer, revision and point ObjectRef ownership', () => {
  const result = run(datasetFor({
    points: [{ attributes: { Bredde: 'bad', Lengde: '1.5' } }],
  }), 'owned-layer', 'owned-revision');
  for (const field of FIELDS) {
    const finding = resultFor(result, field.ruleId).findings[0];
    assert.equal(finding.ruleId, field.ruleId);
    assert.equal(finding.canonicalFieldId, field.canonicalFieldId);
    assert.equal(finding.geometryScope, 'point');
    assert.equal(finding.objectRef.layerId, 'owned-layer');
    assert.equal(finding.objectRef.datasetRevision, 'owned-revision');
    assert.equal(finding.objectRef.geometryScope, 'point');
    assert.equal(finding.objectRef.sourceIndex, 0);
  }
  assert.equal(result.ruleResults.length, 45);
});

for (const field of FIELDS) {
  test(`${field.sourceKey} Field Info and Fildata expose partial optional format coverage`, () => {
    const information = getFieldInformation(field.canonicalFieldId);
    assert.equal(information.displayName, field.sourceKey);
    assert.deepEqual(information.appliesTo, ['point']);
    assert.equal(information.documentationStatus, 'PARTIAL');
    assert.equal(information.documentedFormat, 'Heltall');
    assert.equal(information.units, 'mm');
    assert.deepEqual(information.valueInfo, {});
    assert.deepEqual([...new Set(information.sources.flatMap(({ auditSourceRuleIds }) => auditSourceRuleIds))], [field.ruleId]);
    const composed = composeFieldInformation({
      canonicalFieldId: field.canonicalFieldId,
      geometryScope: 'point',
      rule: getValidationRule(field.ruleId),
    });
    assert.equal(composed.required, false);
    assert.equal(composed.requiredness, 'NOT_REQUIRED');
    assert.deepEqual(composed.allowedValues, []);

    const points = [
      { attributes: addLexeme({ [field.sourceKey]: 1000 }, field.sourceKey, '01000') },
      { attributes: addLexeme({ [field.sourceKey]: 1000 }, field.sourceKey, '1000.0') },
      { attributes: { [field.sourceKey]: Number.MAX_SAFE_INTEGER + 1 } },
      { attributes: {} },
    ];
    const dataset = datasetFor({ points, pointSchema: schemaFor([field.sourceKey]) });
    const datasetRevision = getDatasetRevision(dataset);
    const result = run(dataset, 'numeric-layer', datasetRevision);
    const summary = getValidationV2FieldDataSummary({
      layerId: 'numeric-layer',
      dataset,
      result,
      geometryScope: 'point',
      canonicalFieldId: field.canonicalFieldId,
      ruleId: field.ruleId,
    });
    assert.equal(summary.rows.find(({ deliveredValue }) => deliveredValue === '"01000"').ruleAcceptance, 'Gyldig');
    assert.equal(summary.rows.find(({ deliveredValue }) => deliveredValue === '"1000.0"').ruleAcceptance, 'Ugyldig');
    assert.equal(summary.rows.find(({ deliveredValue }) => deliveredValue === String(Number.MAX_SAFE_INTEGER + 1)).ruleAcceptance, 'Må vurderes');
    assert.equal(summary.rows.find(({ deliveredValue }) => deliveredValue === '⟨ikke levert⟩').ruleAcceptance, '-');
  });
}
