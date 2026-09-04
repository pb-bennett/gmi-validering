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
  { tema: 'KUMI', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'KUMI', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'KUMI', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'KUMI', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'SANI', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'SANI', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'SANI', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'SANI', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'SLI', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'SLI', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'SLI', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'SLI', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'SLG', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'SLG', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'SLG', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'SLG', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'KOTREKUM', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'KOTREKUM', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'KOTREKUM', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'KOTREKUM', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'MKS', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'MKS', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'MKS', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'MKS', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'MKV', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'MKV', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'MKV', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'MKV', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'PMK', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'PMK', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'PMK', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'PMK', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'PMKAF', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'PMKAF', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'PMKAF', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'PMKAF', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'PMKOV', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'PMKOV', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'PMKOV', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'PMKOV', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'PMKSP', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'PMKSP', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'PMKSP', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'PMKSP', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'PMKVL', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'PMKVL', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'PMKVL', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'PMKVL', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'RED', canonicalFieldId: 'constructionMethod', state: 'APPLICABLE' },
  { tema: 'RED', canonicalFieldId: 'manholeShape', state: 'APPLICABLE' },
  { tema: 'RED', canonicalFieldId: 'cone', state: 'APPLICABLE' },
  { tema: 'RED', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'STR', canonicalFieldId: 'constructionMethod', state: 'NOT_APPLICABLE' },
  { tema: 'STR', canonicalFieldId: 'manholeShape', state: 'NOT_APPLICABLE' },
  { tema: 'STR', canonicalFieldId: 'cone', state: 'NOT_APPLICABLE' },
  { tema: 'STR', canonicalFieldId: 'width', state: 'APPLICABLE' },
  { tema: 'KRN', canonicalFieldId: 'constructionMethod', state: 'NOT_APPLICABLE' },
  { tema: 'KRN', canonicalFieldId: 'manholeShape', state: 'NOT_APPLICABLE' },
  { tema: 'KRN', canonicalFieldId: 'cone', state: 'NOT_APPLICABLE' },
  { tema: 'KRN', canonicalFieldId: 'width', state: 'NOT_APPLICABLE' },
  { tema: 'KMR', canonicalFieldId: 'constructionMethod', state: 'UNKNOWN' },
  { tema: 'KMR', canonicalFieldId: 'manholeShape', state: 'UNKNOWN' },
  { tema: 'KMR', canonicalFieldId: 'cone', state: 'UNKNOWN' },
  { tema: 'KMR', canonicalFieldId: 'width', state: 'UNKNOWN' },
  { tema: 'SUMP', canonicalFieldId: 'constructionMethod', state: 'UNKNOWN' },
  { tema: 'SUMP', canonicalFieldId: 'manholeShape', state: 'UNKNOWN' },
  { tema: 'SUMP', canonicalFieldId: 'cone', state: 'UNKNOWN' },
  { tema: 'SUMP', canonicalFieldId: 'width', state: 'UNKNOWN' },
];

test('production policy has exactly the independent explicit 88-cell inventory', () => {
  const actualCells = POINT_FIELD_APPLICABILITY_POLICY.cells;
  const key = ({ tema, canonicalFieldId }) => `${tema}:${canonicalFieldId}`;
  const expectedKeys = EXPECTED_EXPLICIT_CELLS.map(key);
  const actualKeys = actualCells.map(key);

  assert.equal(actualCells.length, 88);
  assert.equal(new Set(actualKeys).size, 88);
  assert.equal(actualCells.filter(({ state }) => state === 'APPLICABLE').length, 71);
  assert.equal(actualCells.filter(({ state }) => state === 'UNKNOWN').length, 10);
  assert.equal(actualCells.filter(({ state }) => state === 'NOT_APPLICABLE').length, 7);

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

test('every expected explicit lookup returns its independent literal state', () => {
  for (const expected of EXPECTED_EXPLICIT_CELLS) {
    assert.equal(
      getPointFieldApplicability(expected.tema, expected.canonicalFieldId).state,
      expected.state
    );
  }
});

test('LOK Kumform and Kjegle remain explicitly UNKNOWN', () => {
  assert.equal(getPointFieldApplicability('LOK', 'manholeShape').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability('LOK', 'cone').state, 'UNKNOWN');
});

test('unlisted and current-but-unapproved Tema combinations remain UNKNOWN', () => {
  assert.equal(getPointFieldApplicability('KNP', 'width').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability('DIV', 'constructionMethod').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability('STR', 'not-a-field').state, 'UNKNOWN');
});

test('NOT_APPLICABLE is returned only for the seven explicit approved cells', () => {
  const explicitNotApplicable = EXPECTED_EXPLICIT_CELLS.filter(
    ({ state }) => state === 'NOT_APPLICABLE'
  );
  assert.equal(explicitNotApplicable.length, 7);
  for (const expected of explicitNotApplicable) {
    assert.equal(
      getPointFieldApplicability(expected.tema, expected.canonicalFieldId).state,
      'NOT_APPLICABLE'
    );
  }
  for (const [tema, canonicalFieldId] of [
    ['KNP', 'width'],
    ['DIV', 'constructionMethod'],
    ['not-a-current-tema', 'width'],
    ['KUMI', 'Bredde'],
  ]) {
    assert.notEqual(getPointFieldApplicability(tema, canonicalFieldId).state, 'NOT_APPLICABLE');
  }
});

test('Tema lookup uses exact current identity and does not normalize aliases or case', () => {
  assert.equal(getPointFieldApplicability('KUM', 'width').state, 'APPLICABLE');
  assert.equal(getPointFieldApplicability('KUMI', 'constructionMethod').state, 'APPLICABLE');
  assert.equal(getPointFieldApplicability('kum', 'width').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability(' KUM', 'width').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability('KUM ', 'width').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability('KUMi', 'constructionMethod').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability('KUMISH', 'width').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability('KUM', 'Bredde').state, 'UNKNOWN');
  assert.equal(getPointFieldApplicability('KUM', 'width-extra').state, 'UNKNOWN');
});

test('policy metadata identifies project/domain authority and separate provenance', () => {
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.policyId, 'validator-2-point-field-applicability');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.policyVersion, '3.2.0');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.policyRevision, '2026-09-04.2');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.effectiveDate, '2026-09-04');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.decisionDate, '2026-09-04');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.authority, 'PROJECT/DOMAIN POLICY');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.standardProvenance, 'NOT_STANDARD_INNMALINGSINSTRUKS_BEHAVIOR');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.legacyProvenance, 'PRAKSIS');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.requiredness, 'SEPARATE_CONCERN');
});

test('policy, cells collection, and canonical cells remain immutable', () => {
  assert.equal(Object.isFrozen(POINT_FIELD_APPLICABILITY_POLICY), true);
  assert.equal(Object.isFrozen(POINT_FIELD_APPLICABILITY_POLICY.cells), true);
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.cells.every((cell) => Object.isFrozen(cell)), true);

  const canonicalCell = getPointFieldApplicability('KUM', 'width');
  assert.equal(Object.isFrozen(canonicalCell), true);
  assert.throws(() => {
    canonicalCell.state = 'UNKNOWN';
  }, TypeError);
  assert.equal(getPointFieldApplicability('KUM', 'width').state, 'APPLICABLE');

  const fallback = getPointFieldApplicability('unlisted', 'width');
  fallback.state = 'APPLICABLE';
  assert.equal(getPointFieldApplicability('unlisted', 'width').state, 'UNKNOWN');
  assert.equal(
    POINT_FIELD_APPLICABILITY_POLICY.cells.some(
      ({ tema, canonicalFieldId }) => tema === 'unlisted' && canonicalFieldId === 'width'
    ),
    false
  );
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
