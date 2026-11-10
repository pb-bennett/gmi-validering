import test from 'node:test';
import assert from 'node:assert/strict';
import { getValidationV2PresentationRules } from '../src/lib/validation-v2/resultPresentation.js';
import { runGmiValidationV2 } from '../src/lib/validation-v2/validationRunner.js';

const rule = { ruleId: 'counts', canonicalFieldId: 'insideOutside', geometryScopes: ['point'] };
const outcome = (key, state, extra = {}) => ({ objectRef: { key, geometryScope: 'point' }, state, ...extra });
const counts = (outcomes) => getValidationV2PresentationRules([{ rule, outcomes }], 'point')[0]?.counts;
const distribution = (counts) => [counts.evaluatedCount, counts.failCount, counts.checkCount, counts.passCount];

test('mixed, only OK, and zero categories use explicit object outcomes', () => {
  assert.deepEqual(distribution(counts([outcome('a', 'FAIL'), outcome('b', 'CHECK'), outcome('c', 'PASS')])), [3, 1, 1, 1]);
  assert.deepEqual(distribution(counts([outcome('a', 'PASS'), outcome('b', 'PASS')])), [2, 0, 0, 2]);
  assert.deepEqual(distribution(counts([outcome('a', 'FAIL')])), [1, 1, 0, 0]);
  assert.equal(counts([]), undefined);
});

test('multiple findings and owners count each object once with FEIL > SJEKK > OK', () => {
  const outcomes = [outcome('a', 'PASS'), outcome('a', 'CHECK'), outcome('a', 'FAIL'), outcome('a', 'FAIL'),
    outcome('b', 'PASS'), outcome('b', 'INDETERMINATE'), outcome('c', 'PASS')];
  const view = getValidationV2PresentationRules([
    { rule, outcomes: outcomes.slice(0, 4), findings: Array(10).fill({ objectRef: { key: 'a' } }) },
    { rule: { ...rule, ruleId: 'second-owner' }, outcomes: outcomes.slice(4) },
  ], 'point')[0];
  assert.deepEqual(distribution(view.counts), [3, 1, 1, 1]);
});

test('skipped outcomes stay omitted; unresolved dependencies retain existing SJEKK presentation', () => {
  assert.deepEqual(distribution(counts([outcome('a', 'PASS'), outcome('b', 'NOT_EVALUATED'),
    outcome('c', 'NOT_EVALUATED', { reasonCode: 'DEPENDENT_TEMA_UNRESOLVED' }),
    outcome('d', 'NOT_EVALUATED', { suppression: true }), outcome('e', 'UNSUPPORTED')])), [3, 0, 2, 1]);
  const view = getValidationV2PresentationRules([{ rule, geometryBreakdown: { point: {
    evaluatedCount: 10, failCount: 1, checkCount: 0, indeterminateCount: 0, passCount: 2, notEvaluatedCount: 7,
  } } }], 'point')[0];
  assert.deepEqual(distribution(view.counts), [10, 1, 0, 2]);
});

test('real inside/outside results and updated results agree with detailed owner counts', () => {
  const attributes = [
    ...Array.from({ length: 5 }, () => ({ Tema: 'KUM', Bredde: '600' })),
    { Tema: 'KUM', Bredde: '600', InnvendigUtvendig: 'OD' },
    ...Array.from({ length: 67 }, () => ({ Tema: 'KUM', Bredde: '600', InnvendigUtvendig: 'ID' })),
  ];
  const run = (records) => runGmiValidationV2({ layerId: 'counts', datasetRevision: JSON.stringify(records), sourceFormat: 'gmi',
    dataset: { points: records.map((attributes) => ({ attributes })), lines: [],
      fieldAnalysis: { points: { Tema: {}, Bredde: {}, InnvendigUtvendig: {} }, lines: {} } } });
  for (const [records, expected] of [[attributes, [73, 5, 1, 67]],
    [attributes.map((record) => ({ ...record, InnvendigUtvendig: 'ID' })), [73, 0, 0, 73]]]) {
    const result = run(records);
    const view = getValidationV2PresentationRules(result.ruleResults, 'point').find((item) => item.rule.canonicalFieldId === 'insideOutside');
    assert.deepEqual(distribution(view.counts), expected);
    assert.deepEqual(distribution(view.ruleResult.geometryBreakdown.point), expected);
  }
});
