import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const api = await import('../src/lib/validation-v2/index.js');
const {
  POINT_FIELD_APPLICABILITY_POLICY,
  getPointFieldApplicability,
  getValidationRules,
  runGmiValidationV2,
} = api;

const EXPECTED_EXPLICIT_CELLS = [
  { tema: 'KUM', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'KUM', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'KUM', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'KUM', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'SAN', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'SAN', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'SAN', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'SAN', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'SLS', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'SLS', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'SLS', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'SLS', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'SLU', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'SLU', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'SLU', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'SLU', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'LOK', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'LOK', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'LOK', canonicalFieldId: 'manholeShape', state: 'UNKNOWN' },
  { tema: 'LOK', canonicalFieldId: 'cone', state: 'UNKNOWN' },
];

test('production policy has exactly the independent explicit 20-cell inventory', () => {
  const actualCells = POINT_FIELD_APPLICABILITY_POLICY.cells;
  const key = ({ tema, canonicalFieldId }) => `${tema}:${canonicalFieldId}`;
  const expectedKeys = EXPECTED_EXPLICIT_CELLS.map(key);
  const actualKeys = actualCells.map(key);

  assert.equal(actualCells.length, 20);
  assert.equal(new Set(actualKeys).size, 20);
  assert.equal(actualCells.filter(({ state }) => state === 'APPLICABLE').length, 18);
  assert.equal(actualCells.filter(({ state }) => state === 'UNKNOWN').length, 2);
  assert.equal(actualCells.filter(({ state }) => state === 'NOT_APPLICABLE').length, 0);

  for (const expected of EXPECTED_EXPLICIT_CELLS) {
    assert.equal(
      actualCells.filter(
        (actual) =>
          actual.tema === expected.tema &&
          actual.canonicalFieldId === expected.canonicalFieldId &&
          actual.state === expected.state
      ).length,
      1
    );
  }
  assert.deepEqual([...actualKeys].sort(), [...expectedKeys].sort());
});

test('approved current v3.2 Tema cells are exactly APPLICABLE', () => {
  for (const expected of EXPECTED_EXPLICIT_CELLS.filter(({ state }) => state === 'APPLICABLE')) {
    assert.equal(getPointFieldApplicability(expected.tema, expected.canonicalFieldId).state, 'APPLICABLE');
  }
});

test('LOK Kumform and Kjegle remain explicitly UNKNOWN', () => {
  assert.equal(getPointFieldApplicability('LOK', 'manholeShape').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability('LOK', 'cone').state, 'UNKNOWN');
});

test('unrelated current Tema remains UNKNOWN without a closed-world complement', () => {
  assert.equal(getPointFieldApplicability('STR', 'width').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability('KUMI', 'constructionMethod').state, 'UNKNOWN');
});

test('no NOT_APPLICABLE state is inferred', () => {
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.cells.some(({ state }) => state === 'NOT_APPLICABLE'), false);
  assert.equal(getPointFieldApplicability('STR', 'manholeShape').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability('not-a-current-tema', 'width').state, 'UNKNOWN');
});

test('Tema lookup uses exact current identity and does not normalize aliases or case', () => {
  assert.equal(getPointFieldApplicability('KUM', 'width').state, 'APPLICABLE');
  assert.equal(getPointFieldApplicability('kum', 'width').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability(' KUM', 'width').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability('KUM', 'Bredde').state, 'UNKNOWN');
});

test('policy metadata identifies project/domain authority and separate provenance', () => {
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.policyId, 'validator-2-point-field-applicability');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.policyVersion, '3.2.0');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.policyRevision, '2026-09-04.1');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.effectiveDate, '2026-09-04');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.decisionDate, '2026-09-04');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.authority, 'PROJECT/DOMAIN POLICY');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.standardProvenance, 'NOT_STANDARD_INNMALINGSINSTRUKS_BEHAVIOR');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.legacyProvenance, 'PRAKSIS');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.requiredness, 'SEPARATE_CONCERN');
});

test('metadata-only slice adds no active rule or result row and preserves counts', () => {
  const rules = getValidationRules();
  assert.equal(rules.length, 29);
  assert.equal(rules.filter(({ geometryScopes }) => geometryScopes.includes('point')).length, 22);
  assert.equal(rules.filter(({ geometryScopes }) => geometryScopes.includes('line')).length, 21);
  assert.equal(rules.some(({ ruleId }) => ruleId.includes('applicability')), false);

  const result = runGmiValidationV2({
    layerId: 'applicability-metadata-test',
    dataset: { points: [{ attributes: { Tema: 'KUM' } }], lines: [], fieldAnalysis: { points: { Tema: {} }, lines: {} } },
    datasetRevision: 'applicability-metadata-revision',
    sourceFormat: 'gmi',
  });
  assert.equal(result.ruleResults.length, 29);
  assert.equal(result.ruleResults.some(({ rule }) => rule.ruleId.includes('applicability')), false);
});
