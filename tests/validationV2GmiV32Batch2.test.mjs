import assert from 'node:assert/strict';
import test from 'node:test';
import { BATCH2_RULES, BATCH2_LIMITS } from './fixtures/validationV2GmiV32Batch2.mjs';

const api = await import('../src/lib/validation-v2/index.js');
const { GMIParser } = await import('../src/lib/parsing/gmiParser.js');
const { GMI_SOURCE_LEXEMES } = await import('../src/lib/parsing/gmiLexicalEvidence.js');
const { getDatasetRevision } = await import('../src/lib/validation-v2/datasetRevision.js');
const { getValidationV2GeometryView } = await import('../src/lib/validation-v2/uiIntegration.js');
const {
  evaluateDecimalFormat,
  evaluateYearFormat,
  evaluateDateFormat,
  evaluateTextMaxLength,
} = await import('../src/lib/validation-v2/ruleEvaluation.js');

function parse(attributes, lineAttributes = null) {
  const names = Object.keys(attributes);
  const values = Object.values(attributes);
  const text = ['[GMIFILE_ASCII]', '[P_]', `_FIELDNAMES ${names.join(';')}`, '[+P_]', ':P 1',
    `_FIELDVALUES ${values.join(';')}`, '/XYZ', '1 2 3', ...(lineAttributes ? ['[L_]', `_FIELDNAMES ${Object.keys(lineAttributes).join(';')}`, '[+L_]', ':L 1', `_FIELDVALUES ${Object.values(lineAttributes).join(';')}`, '/XYZ', '2 3 4'] : []), ''].join('\n');
  const data = new GMIParser(text).toObject();
  assert.deepEqual(data.errors, []);
  return data;
}

function runtime(attributes, lineAttributes = null) {
  return {
    format: 'GMI',
    points: [{ attributes }],
    lines: lineAttributes ? [{ attributes: lineAttributes }] : [],
    fieldAnalysis: {
      points: Object.fromEntries(Object.keys(attributes).map((key) => [key, {}])),
      lines: Object.fromEntries(Object.keys(lineAttributes || {}).map((key) => [key, {}])),
    },
  };
}

function run(dataset, layerId = 'batch2-layer') {
  return api.runGmiValidationV2({ dataset, layerId, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi' });
}

function resultFor(result, ruleId) {
  const found = result.ruleResults.find((entry) => entry.rule.ruleId === ruleId);
  assert.ok(found, ruleId);
  return found;
}

function outcome(result, ruleId, state, reasonCode = null) {
  const entry = resultFor(result, ruleId);
  assert.deepEqual([entry.passCount, entry.failCount, entry.notEvaluatedCount, entry.indeterminateCount], {
    PASS: [1, 0, 0, 0], FAIL: [0, 1, 0, 0], NOT_EVALUATED: [0, 0, 1, 0], INDETERMINATE: [0, 0, 0, 1],
  }[state], ruleId);
  if (reasonCode) assert.equal(entry.findings[0].reasonCode, reasonCode, ruleId);
  return entry;
}

function fildata(dataset, result, ruleId, canonicalFieldId, geometryScope = 'point') {
  return api.getValidationV2FieldDataSummary({
    dataset,
    result,
    layerId: result.layerId,
    geometryScope,
    canonicalFieldId,
    ruleId,
  });
}

test('Batch 2 owns exactly four point-only rules and final result counts', () => {
  const rules = api.getValidationRules();
  assert.equal(rules.length, 45);
  assert.equal(rules.filter((rule) => rule.geometryScopes.includes('point')).length, 38);
  assert.equal(rules.filter((rule) => rule.geometryScopes.includes('line')).length, 21);
  for (const [ruleId, field, sourceProperty, unit, pages] of BATCH2_RULES) {
    const rule = api.getValidationRule(ruleId);
    assert.ok(rule);
    assert.equal(rule.canonicalFieldId, field);
    assert.deepEqual(rule.geometryScopes, ['point']);
    assert.equal(rule.category, 'VALUE_FORMAT');
    assert.equal(rule.severity, 'ERROR');
    assert.equal(rule.provenance, 'STANDARD');
    assert.equal(api.getCanonicalField(field).directGmiSourceKey, sourceProperty);
    const info = api.composeFieldInformation({ canonicalFieldId: field, geometryScope: 'point', rule });
    assert.equal(info.required, false);
    assert.equal(info.requiredness, 'NOT_REQUIRED');
    assert.equal(info.units, unit);
    assert.ok(info.sources.some((source) => source.pages === pages && source.auditSourceRuleIds.includes(ruleId)));
  }
  const empty = run({ points: [], lines: [], fieldAnalysis: { points: {}, lines: {} } });
  assert.equal(empty.ruleResults.length, 45);
  assert.equal(getValidationV2GeometryView(empty, 'point').ruleResults.length, 38);
  assert.equal(getValidationV2GeometryView(empty, 'line').ruleResults.length, 21);
  assert.equal(api.POINT_FIELD_APPLICABILITY_POLICY.policyRevision, '2026-09-04.3');
});

test('decimal format accepts only the source-backed plain signed grammar', () => {
  assert.equal(BATCH2_LIMITS.decimalGrammar.test('+12.50'), true);
  for (const value of ['0', '-0', '+0', '12', '-12,5', '+12.50', '0001.20', '9999999999999999999999999999999,1']) {
    const dataset = parse({ Avst_BunnInnvUnderUtv: value });
    assert.equal(dataset.points[0].attributes[GMI_SOURCE_LEXEMES].Avst_BunnInnvUnderUtv, value);
    outcome(run(dataset), BATCH2_RULES[0][0], 'PASS');
  }
  for (const value of ['1e2', '1E-2', '.5', ',5', '1.', '1,', ' 1 ', '1 ']) {
    outcome(run(parse({ Avst_BunnInnvUnderUtv: value })), BATCH2_RULES[0][0], 'INDETERMINATE', 'DECIMAL_NOTATION_UNRESOLVED');
  }
  for (const value of ['e', 'E', '.', ',', '+', '-', '1--2', '1++2', '1ee2', '1e', '1e+', '1..2', '1,,2', '1.,2', 'abc', '12m', '1 2', '--1']) {
    outcome(run(parse({ Avst_BunnInnvUnderUtv: value })), BATCH2_RULES[0][0], 'FAIL', 'VALUE_NOT_DECIMAL');
  }
  outcome(run(runtime({ Avst_BunnInnvUnderUtv: 1.5 })), BATCH2_RULES[0][0], 'INDETERMINATE', 'LEXICAL_FORMAT_UNAVAILABLE');
  outcome(run(runtime({ Avst_BunnInnvUnderUtv: Infinity })), BATCH2_RULES[0][0], 'FAIL', 'VALUE_NOT_DECIMAL');
  outcome(run(runtime({})), BATCH2_RULES[0][0], 'NOT_EVALUATED');
  assert.deepEqual(evaluateDecimalFormat({ state: 'VALUE_PRESENT', sourceValue: '1,5', sourceLexeme: '1,5' }), { state: 'PASS', reasonCode: null });
});

test('year format is four digits without invented ranges or padding', () => {
  for (const value of ['0000', '1' .padStart(4, '0'), '2026', '9999']) outcome(run(parse({ Anleggsår: value })), BATCH2_RULES[1][0], 'PASS');
  for (const value of ['26', '20260', '+2026', '20.6', '2e3', ' 2026', '2026 ']) outcome(run(parse({ Anleggsår: value })), BATCH2_RULES[1][0], 'FAIL', 'YEAR_FORMAT_INVALID');
  outcome(run(runtime({ Anleggsår: 2026 })), BATCH2_RULES[1][0], 'PASS');
  outcome(run(runtime({ Anleggsår: 26 })), BATCH2_RULES[1][0], 'INDETERMINATE', 'LEXICAL_FORMAT_UNAVAILABLE');
  outcome(run(runtime({})), BATCH2_RULES[1][0], 'NOT_EVALUATED');
  assert.deepEqual(evaluateYearFormat({ state: 'VALUE_PRESENT', sourceValue: '0000', sourceLexeme: '0000' }), { state: 'PASS', reasonCode: null });
});

test('date format is lexical DD.MM.YYYY only and intentionally not calendar validation', () => {
  for (const value of ['01.01.2026', '31.02.2026', '00.00.0000', ' 01.01.2026 ']) {
    const expected = value.startsWith(' ') ? 'FAIL' : 'PASS';
    outcome(run(parse({ Datafangstdato: value })), BATCH2_RULES[2][0], expected, expected === 'FAIL' ? 'DATE_FORMAT_INVALID' : null);
  }
  for (const value of ['1.01.2026', '01/01/2026', '2026-01-01', '01.1.2026', '01.01.26', '01.01.2026T00:00:00Z']) outcome(run(parse({ Datafangstdato: value })), BATCH2_RULES[2][0], 'FAIL', 'DATE_FORMAT_INVALID');
  outcome(run(runtime({ Datafangstdato: new Date('2026-01-01') })), BATCH2_RULES[2][0], 'INDETERMINATE', 'LEXICAL_FORMAT_UNAVAILABLE');
  outcome(run(runtime({})), BATCH2_RULES[2][0], 'NOT_EVALUATED');
  assert.equal(BATCH2_LIMITS.date.test('31.02.2026'), true);
  assert.deepEqual(evaluateDateFormat({ state: 'VALUE_PRESENT', sourceValue: '01.01.2026', sourceLexeme: '01.01.2026' }), { state: 'PASS', reasonCode: null });
});

test('note length counts Unicode code points, whitespace, and original lexemes', () => {
  const key = 'Merknad';
  const ruleId = BATCH2_RULES[3][0];
  const samples = [
    ['a'.repeat(255), 'PASS'],
    ['a'.repeat(256), 'FAIL'],
    [' '.repeat(254) + 'x', 'PASS'],
    [' '.repeat(255), 'PASS'],
    [' '.repeat(256), 'FAIL'],
    ['😀'.repeat(255), 'PASS'],
    ['😀'.repeat(256), 'FAIL'],
    ['e\u0301'.repeat(255), 'FAIL'],
  ];
  for (const [value, expected] of samples) {
    const dataset = parse({ [key]: value });
    assert.equal(dataset.points[0].attributes[GMI_SOURCE_LEXEMES][key], value);
    const effectiveExpected = value.startsWith('ð') ? 'FAIL' : expected;
    const expectedState = expected;
    outcome(run(dataset), ruleId, expectedState, expectedState === 'FAIL' ? 'TEXT_LENGTH_EXCEEDED' : null);
    assert.equal(fildata(dataset, run(dataset), ruleId, 'note').rows[0].ruleAcceptance, expectedState === 'FAIL' ? 'Ugyldig' : expectedState === 'NOT_EVALUATED' ? '-' : 'Gyldig');
  }
  const astral = String.fromCodePoint(0x1F600).repeat(255);
  const astralDataset = parse({ [key]: astral });
  outcome(run(astralDataset), ruleId, 'PASS');
  outcome(run(runtime({ [key]: 12345 })), ruleId, 'INDETERMINATE', 'LEXICAL_FORMAT_UNAVAILABLE');
  outcome(run(runtime({})), ruleId, 'NOT_EVALUATED');
  assert.equal([...('😀'.repeat(255))].length, BATCH2_LIMITS.noteCodePoints);
  assert.deepEqual(evaluateTextMaxLength({ state: 'VALUE_PRESENT', sourceValue: 'x'.repeat(255), sourceLexeme: 'UNAVAILABLE' }, 255), { state: 'PASS', reasonCode: null });

  const equivalentWhitespace = parse({
    Merknad: ' '.repeat(255),
    MERKNAD: ' '.repeat(255),
  });
  outcome(run(equivalentWhitespace), ruleId, 'PASS');

  for (const attributes of [
    { Merknad: ' '.repeat(255), MERKNAD: ' '.repeat(256) },
    { Merknad: ' '.repeat(256), MERKNAD: ' '.repeat(255) },
  ]) {
    const conflictingWhitespace = parse(attributes);
    const conflictingResult = run(conflictingWhitespace);
    outcome(conflictingResult, ruleId, 'INDETERMINATE', 'BINDING_AMBIGUOUS');
    assert.equal(
      fildata(conflictingWhitespace, conflictingResult, ruleId, 'note').rows[0].ruleAcceptance,
      'Må vurderes',
    );
  }
});

test('Batch 2 preserves duplicate lexical ambiguity, point scope, and completed-result Fildata ownership', () => {
  for (const [, field, key] of BATCH2_RULES) {
    const ruleId = BATCH2_RULES.find((entry) => entry[1] === field)[0];
    const valid = field === 'innerBottomToOuterUndersideDistance' ? '1.5' : field === 'installationYear' ? '2026' : field === 'captureDate' ? '01.01.2026' : 'ok';
    const equivalentParsed = parse({ [key]: valid, [key.toUpperCase()]: valid });
    outcome(run(equivalentParsed), ruleId, 'PASS');
    assert.equal(equivalentParsed.points[0].attributes[GMI_SOURCE_LEXEMES][key], valid);
    assert.equal(equivalentParsed.points[0].attributes[GMI_SOURCE_LEXEMES][key.toUpperCase()], valid);
    const conflictingParsed = parse({ [key]: valid, [key.toUpperCase()]: ` ${valid}` });
    outcome(run(conflictingParsed), ruleId, 'INDETERMINATE', 'BINDING_AMBIGUOUS');
    assert.equal(conflictingParsed.points[0].attributes[GMI_SOURCE_LEXEMES][key.toUpperCase()], ` ${valid}`);
    const duplicate = runtime({ [key]: valid, [key.toUpperCase()]: ` ${valid}` });
    outcome(run(duplicate), ruleId, 'INDETERMINATE', 'BINDING_AMBIGUOUS');
    const lineOnly = run({ ...runtime({}, { [key]: valid }), points: [] });
    assert.equal(resultFor(lineOnly, ruleId).evaluatedObjectCount, 0);
    const pointDataset = runtime({ [key]: valid });
    const pointResult = run(pointDataset);
    const summary = fildata(pointDataset, pointResult, ruleId, field);
    assert.equal(summary.rows[0].ruleAcceptance, 'Gyldig');
    const replacement = runtime({ [key]: valid });
    assert.throws(() => fildata(replacement, pointResult, ruleId, field), /revision|current|ownership/i);
  }
});

test('Batch 2 never consumes applicability as validation', () => {
  const dataset = runtime({ Avst_BunnInnvUnderUtv: 'bad', Anleggsår: 'bad', Datafangstdato: 'bad', Merknad: 'x'.repeat(256) });
  const result = run(dataset);
  assert.equal(result.ruleResults.filter((entry) => entry.rule.ruleId.includes('applicability')).length, 0);
  assert.equal(result.ruleResults.length, 45);
  assert.equal(api.POINT_FIELD_APPLICABILITY_POLICY.policyRevision, '2026-09-04.3');
  assert.equal(api.POINT_FIELD_APPLICABILITY_POLICY.cells.length, 88);
  assert.equal(api.POINT_FIELD_APPLICABILITY_POLICY.cells.filter((cell) => cell.state === 'APPLICABLE').length, 71);
  assert.equal(api.POINT_FIELD_APPLICABILITY_POLICY.cells.filter((cell) => cell.state === 'NOT_APPLICABLE').length, 9);
  assert.equal(api.POINT_FIELD_APPLICABILITY_POLICY.cells.filter((cell) => cell.state === 'UNKNOWN').length, 8);
});
