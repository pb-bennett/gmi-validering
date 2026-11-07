import assert from 'node:assert/strict';
import test from 'node:test';
import { runGmiValidationV2, getPointFieldApplicability, getValidationV2FieldDataSummary } from '../src/lib/validation-v2/index.js';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';
import { evaluateDateFormat } from '../src/lib/validation-v2/ruleEvaluation.js';

const rules = {
  date: 'innmaling.common.capture-date.required',
  width: 'innmaling.point.width.integer',
  level: 'innmaling.common.vertical-level.required',
};
const referenceDate = '2026-11-07';

function run(points = [], lines = [], schema = {}) {
  const fields = (items, extra = []) => Object.fromEntries(
    [...new Set([...extra, ...items.flatMap(Object.keys)])].map((key) => [key, {}])
  );
  const dataset = {
    points: points.map((attributes) => ({ attributes })),
    lines: lines.map((attributes) => ({ attributes })),
    fieldAnalysis: { points: fields(points, schema.point), lines: fields(lines, schema.line) },
  };
  const original = structuredClone(dataset);
  const result = runGmiValidationV2({
    layerId: 'contractor-corrections', dataset, datasetRevision: getDatasetRevision(dataset),
    sourceFormat: 'gmi', referenceDate,
  });
  assert.deepEqual(dataset, original, 'validation must preserve source values and schema');
  return { dataset, result };
}

function outcome(result, ruleId, index = 0, scope = 'point') {
  const item = result.outcomes.find((candidate) => candidate.ruleId === ruleId
    && candidate.objectRef.sourceIndex === index && candidate.objectRef.geometryScope === scope);
  assert.ok(item, `${scope} ${ruleId} at ${index}`);
  return item;
}

function dateValue(sourceLexeme) {
  return { state: 'VALUE_PRESENT', sourceValue: sourceLexeme, sourceLexeme };
}

test('both date evaluators accept ISO calendar dates and retain dotted and compact dates', () => {
  const values = ['2026-05-28', '28.05.2026', '20260528', '2024-02-29', '29.02.2024', '20240229', '2000-02-29'];
  const records = values.map((Datafangstdato) => ({ Datafangstdato }));
  const { result } = run(records, records);
  for (const [i, value] of values.entries()) {
    assert.deepEqual(evaluateDateFormat(dateValue(value)), { state: 'PASS', reasonCode: null }, value);
    for (const scope of ['point', 'line']) {
      const actual = outcome(result, rules.date, i, scope);
      assert.equal(actual.state, value === '2000-02-29' ? 'CHECK' : 'PASS', value);
      assert.equal(actual.reasonCode, value === '2000-02-29' ? 'DATE_OLDER_THAN_FIVE_YEARS' : null, value);
    }
  }
});

test('both date evaluators reject impossible dates and malformed spellings', () => {
  const values = ['2026-02-29', '1900-02-29', '2024-02-30', '2026-04-31', '2026-00-28', '2026-13-01',
    '2026-05-00', '2026-05-32', '2026-5-28', '26-05-28', '2026/05/28', '2026-05-28junk',
    ' 2026-05-28', '2026-05-28 ', '31.04.2026', '20260229'];
  const records = values.map((Datafangstdato) => ({ Datafangstdato }));
  const { result } = run(records, records);
  for (const [i, value] of values.entries()) {
    assert.deepEqual(evaluateDateFormat(dateValue(value)), { state: 'FAIL', reasonCode: 'DATE_FORMAT_INVALID' }, value);
    for (const scope of ['point', 'line']) assert.equal(outcome(result, rules.date, i, scope).reasonCode, 'DATE_FORMAT_INVALID', value);
  }
});

test('ISO dates retain future, installation-year and exact five-year boundaries on both geometries', () => {
  const cases = [
    [{ Datafangstdato: referenceDate }, 'PASS', null],
    [{ Datafangstdato: '2026-11-08' }, 'FAIL', 'DATE_FUTURE'],
    [{ Datafangstdato: '2021-11-07' }, 'PASS', null],
    [{ Datafangstdato: '2021-11-06' }, 'CHECK', 'DATE_OLDER_THAN_FIVE_YEARS'],
    [{ Datafangstdato: '2025-12-31', Anleggsår: '2026' }, 'FAIL', 'DATE_BEFORE_INSTALLATION'],
    [{ Datafangstdato: '2026-01-01', Anleggsår: '2026' }, 'PASS', null],
    [{ Datafangstdato: '2026-05-28', Anleggsår: 'BAD' }, 'PASS', null],
    [{ Datafangstdato: '' }, 'FAIL', 'REQUIRED_VALUE_MISSING'],
    [{}, 'FAIL', 'REQUIRED_VALUE_MISSING'],
  ];
  const records = cases.map(([attributes]) => attributes);
  const { result } = run(records, records);
  for (const [i, [, state, reasonCode]] of cases.entries()) {
    for (const scope of ['point', 'line']) {
      const actual = outcome(result, rules.date, i, scope);
      assert.equal(actual.state, state);
      assert.equal(actual.reasonCode, reasonCode);
    }
  }
  const absent = run([{}], [{}]).result;
  for (const scope of ['point', 'line']) assert.equal(outcome(absent, rules.date, 0, scope).reasonCode, 'REQUIRED_VALUE_MISSING');
});

test('GUT Bredde accepts supplied integers, reviews missing values and retains numeric boundaries', () => {
  const cases = [
    ['1600', 'PASS', null], ['20', 'PASS', null], ['19', 'CHECK', 'NUMERIC_OUTSIDE_PREFERRED_RANGE'],
    ['0', 'CHECK', 'NUMERIC_ZERO'], ['-1', 'FAIL', 'NUMERIC_OUTSIDE_ALLOWED_RANGE'],
    ['abc', 'FAIL', 'VALUE_NOT_INTEGER'], ['26,5', 'FAIL', 'VALUE_NOT_INTEGER'],
    ['26.5', 'FAIL', 'VALUE_NOT_INTEGER'], ['9007199254740992', 'FAIL', 'VALUE_NOT_INTEGER'],
    ['', 'CHECK', 'APPLICABILITY_REQUIRED_MISSING'], [undefined, 'CHECK', 'APPLICABILITY_REQUIRED_MISSING'],
  ];
  const { result } = run(cases.map(([Bredde]) => ({ Tema: 'GUT', ...(Bredde === undefined ? {} : { Bredde }) })));
  for (const [i, [, state, reasonCode]] of cases.entries()) {
    const actual = outcome(result, rules.width, i);
    assert.equal(actual.state, state);
    assert.equal(actual.reasonCode, reasonCode);
  }
  for (const cause of ['NYTT', 'UENDR']) {
    const absent = run([{ Tema: 'GUT', Stedfestingsårsak: cause }]).result;
    assert.equal(outcome(absent, rules.width).state, 'CHECK', cause);
  }
  assert.equal(getPointFieldApplicability('GUT', 'width').state, 'APPLICABLE');
  for (const field of ['constructionMethod', 'manholeShape', 'cone', 'wallThickness', 'innerBottomToOuterUndersideDistance']) {
    assert.equal(getPointFieldApplicability('GUT', field).state, 'UNKNOWN', field);
  }
  const controls = run([{ Tema: 'KUM' }, { Tema: 'LOK' }, { Tema: 'PSP' }, { Tema: 'STR', Bredde: '1600' }]).result;
  assert.deepEqual([0, 1, 2, 3].map((i) => outcome(controls, rules.width, i).state), ['FAIL', 'FAIL', 'PASS', 'CHECK']);
});

for (const Tema of ['LOK', 'GUT']) {
  test(`${Tema} Vertikalnivå passes above/on-ground and reviews underground with exact existing codes`, () => {
    const cases = [
      ['OVER_GRUNN', 'PASS', null], ['PÅ_GRUNN_VANNOVERF', 'PASS', null],
      ['UNDER_GRUNN', 'CHECK', 'UNUSUAL_VALID_VALUE'],
      ...['PÅ_BUNN', 'I_VANNSØYL', 'SLISSING', 'UNDER_BUNN'].map((value) => [value, 'CHECK', 'UNUSUAL_VALID_VALUE']),
      ...['BAD', 'over_grunn', 'OVER_GRUNN ', ' UNDER_GRUNN', 'PÅ_GRUNN'].map((value) => [value, 'FAIL', 'VALUE_NOT_ALLOWED']),
      ['', 'FAIL', 'REQUIRED_VALUE_MISSING'], [undefined, 'FAIL', 'REQUIRED_VALUE_MISSING'],
    ];
    const { result } = run(cases.map(([level]) => ({ Tema, ...(level === undefined ? {} : { Vertikalnivå: level }) })));
    for (const [i, [, state, reasonCode]] of cases.entries()) {
      const actual = outcome(result, rules.level, i);
      assert.equal(actual.state, state);
      assert.equal(actual.reasonCode, reasonCode);
    }
    assert.equal(outcome(run([{ Tema }]).result, rules.level).state, 'FAIL');
  });
}

test('other Tema and unresolved or conflicting identities retain the general vertical policy', () => {
  const values = ['UNDER_GRUNN', 'PÅ_GRUNN_VANNOVERF', 'OVER_GRUNN'];
  for (const identity of [{ Tema: 'KUM' }, {}, { Tema: 'BAD' }, { Tema: 'LOK', S_FCODE: 'GUT' }]) {
    const { result } = run(values.map((Vertikalnivå) => ({ ...identity, Vertikalnivå })));
    assert.deepEqual(values.map((_, i) => outcome(result, rules.level, i).state), ['PASS', 'PASS', 'CHECK']);
  }
  const lines = run([], values.map((Vertikalnivå) => ({ Tema: 'VL', Vertikalnivå }))).result;
  assert.deepEqual(values.map((_, i) => outcome(lines, rules.level, i, 'line').state), ['PASS', 'PASS', 'CHECK']);
  const fallback = run([{ S_FCODE: 'GUT', Vertikalnivå: 'OVER_GRUNN', Bredde: '1600' }]).result;
  assert.equal(outcome(fallback, rules.level).state, 'PASS');
  assert.equal(outcome(fallback, rules.width).state, 'PASS');
});

test('Fildata keeps the established Pass/Sjekk/Feil presentation for corrected outcomes', () => {
  const { dataset, result } = run([
    { Tema: 'GUT', Bredde: '1600', Vertikalnivå: 'OVER_GRUNN' },
    { Tema: 'GUT', Vertikalnivå: 'UNDER_GRUNN' },
    { Tema: 'GUT', Bredde: 'BAD', Vertikalnivå: 'BAD' },
  ]);
  for (const [canonicalFieldId, ruleId] of [['width', rules.width], ['verticalLevel', rules.level]]) {
    const summary = getValidationV2FieldDataSummary({
      layerId: 'contractor-corrections', dataset, result, geometryScope: 'point', canonicalFieldId, ruleId,
    });
    assert.deepEqual(summary.rows.map((row) => row.ruleAcceptance).sort(), ['Feil', 'Pass', 'Sjekk']);
  }
});
