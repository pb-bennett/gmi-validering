import assert from 'node:assert/strict';
import test from 'node:test';
import { runGmiValidationV2, getPointFieldApplicability } from '../src/lib/validation-v2/index.js';

const cause = 'Stedfestingsårsak';
const rules = {
  method: 'innmaling.point.construction-method.valid',
  width: 'innmaling.point.width.integer',
  thickness: 'innmaling.point.wall-thickness.integer',
};

function run(points) {
  const fields = Object.fromEntries([...new Set(points.flatMap(Object.keys))].map((key) => [key, {}]));
  return runGmiValidationV2({
    layerId: 'real-data-corrections',
    dataset: { points: points.map((attributes) => ({ attributes })), lines: [], fieldAnalysis: { points: fields, lines: {} } },
    datasetRevision: 'real-data-corrections',
    sourceFormat: 'gmi',
    referenceDate: '2026-09-28',
  });
}

function outcome(result, ruleId, index) {
  const item = result.outcomes.find((candidate) => candidate.ruleId === ruleId && candidate.objectRef.sourceIndex === index);
  assert.ok(item, `${ruleId} at ${index}`);
  return item;
}

test('PSP permits supplied Byggemetode but still checks invalid codes and missing-field separation', () => {
  const result = run([
    { Tema: 'PSP', [cause]: 'NYTT', Byggemetode: 'G' },
    { Tema: 'PSP', [cause]: 'NYTT', Byggemetode: 'BAD' },
    { Tema: 'PSP', [cause]: 'NYTT' },
    { Tema: 'STR', [cause]: 'NYTT', Byggemetode: 'G' },
    { Tema: 'KUM', [cause]: 'NYTT' },
    { Tema: 'KUM', [cause]: 'UENDR' },
  ]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => outcome(result, rules.method, i).state),
    ['PASS', 'FAIL', 'PASS', 'CHECK', 'FAIL', 'CHECK']);
  assert.equal(outcome(result, rules.method, 1).reasonCode, 'VALUE_NOT_ALLOWED');
  assert.equal(outcome(result, rules.method, 3).reasonCode, 'APPLICABILITY_UNEXPECTED_VALUE');
  assert.equal(outcome(result, rules.method, 5).reasonCode, 'NON_NEW_REQUIRED_VALUE_MISSING');
});

test('PSP permits supplied Bredde but retains format, range and missing-field checks', () => {
  const result = run([
    { Tema: 'PSP', Bredde: '1600' },
    { Tema: 'PSP', Bredde: 'abc' },
    { Tema: 'PSP' },
    { Tema: 'STR', Bredde: '1600' },
    { Tema: 'PSP', Bredde: '10' },
    { Tema: 'PSP', Bredde: '-1' },
    { Tema: 'KUM' },
  ]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((i) => outcome(result, rules.width, i).state),
    ['PASS', 'FAIL', 'PASS', 'CHECK', 'CHECK', 'FAIL', 'FAIL']);
  assert.equal(outcome(result, rules.width, 1).reasonCode, 'VALUE_NOT_INTEGER');
  assert.equal(outcome(result, rules.width, 3).reasonCode, 'APPLICABILITY_UNEXPECTED_VALUE');
  assert.equal(outcome(result, rules.width, 4).reasonCode, 'NUMERIC_OUTSIDE_PREFERRED_RANGE');
});

test('other PSP applicability cells stay unresolved', () => {
  for (const field of ['manholeShape', 'cone', 'wallThickness', 'innerBottomToOuterUndersideDistance']) {
    assert.equal(getPointFieldApplicability('PSP', field).state, 'UNKNOWN');
  }
});

test('point Tykkelse accepts plain decimal forms and keeps range and lexical failures', () => {
  const values = ['26', '26,5', '26.5', '+26', '0', '-1', '-1,5', 'abc', '26,', '26,5,2', '+26,5', ' 26,5', '26,5 ', '9007199254740992'];
  const result = run(values.map((Tykkelse) => ({ Tema: 'KUM', [cause]: 'NYTT', Tykkelse })));
  assert.deepEqual(values.map((_, i) => outcome(result, rules.thickness, i).state),
    ['PASS', 'PASS', 'PASS', 'PASS', 'CHECK', 'FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL']);
  assert.equal(outcome(result, rules.thickness, 4).reasonCode, 'NUMERIC_ZERO');
  assert.equal(outcome(result, rules.thickness, 6).reasonCode, 'NUMERIC_OUTSIDE_ALLOWED_RANGE');
  assert.equal(outcome(result, rules.thickness, 7).reasonCode, 'VALUE_NOT_DECIMAL');
});

test('other integer-only point measurements retain integer format', () => {
  const result = run([{ Tema: 'KUM', Bredde: '26,5', Nøyaktighet: '2,5' }]);
  assert.equal(outcome(result, rules.width, 0).state, 'FAIL');
  assert.equal(outcome(result, 'innmaling.common.horizontal-accuracy.required', 0).state, 'FAIL');
});
