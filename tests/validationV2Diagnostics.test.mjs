import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFieldDiagnostics,
  getDiagnosticMappingCoverage,
  getValidationV2DependencyPresentation,
  getValidationV2DiagnosticPresentation,
  getValidationV2CoveragePresentation,
  renderValidationV2DependencyNote,
  renderValidationV2Coverage,
  renderValidationV2Diagnostic,
  renderValidationV2DiagnosticBreakdown,
  renderValidationV2ResultHeading,
  ValidationV2DiagnosticType,
} from '../src/lib/validation-v2/diagnostics.js';
import { getValidationRule } from '../src/lib/validation-v2/registry/rules.js';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';
import { runGmiValidationV2 } from '../src/lib/validation-v2/validationRunner.js';
import { evaluateDateFormat } from '../src/lib/validation-v2/ruleEvaluation.js';
import { projectDiagnostic } from '../scripts/research/validator-v2-diagnostic-gallery/privacy.mjs';

const rule = {
  ruleId: 'test.vertical-level',
  canonicalFieldId: 'verticalLevel',
  geometryScopes: ['point'],
  evaluatorKind: 'ALLOWED_VALUE',
  allowedValues: ['UNDER_GRUNN', 'OVER_GRUNN'],
};
const field = { canonicalFieldId: 'verticalLevel', displayName: 'Vertikalnivå' };

function ref(sourceIndex) {
  return { key: `point-${sourceIndex}`, sourceIndex, geometryScope: 'point' };
}

function finding(state, reasonCode, sourceIndex, sourceValue, details = null) {
  return {
    ruleId: rule.ruleId,
    rule,
    state,
    objectRef: ref(sourceIndex),
    canonicalFieldId: rule.canonicalFieldId,
    geometryScope: 'point',
    reasonCode,
    observed: { sourceValue, sourceLexeme: String(sourceValue) },
    expectedValues: rule.allowedValues,
    details,
  };
}

test('diagnostic mapping covers all active owners and canonical fields', () => {
  const coverage = getDiagnosticMappingCoverage();
  assert.equal(coverage.activeOwnerCount, 45);
  assert.equal(coverage.canonicalFieldCount, 41);
  assert.equal(coverage.complete, true);
  assert.deepEqual(coverage.unmappedReasonCodes, []);
});

test('builder groups equal causes, keeps status separate, orders Feil first, and bounds evidence', () => {
  const findings = [
    finding('FAIL', 'VALUE_NOT_ALLOWED', 0, 'underGrunnen'),
    finding('FAIL', 'VALUE_NOT_ALLOWED', 1, 'underGrunnen'),
    finding('CHECK', 'UNUSUAL_VALID_VALUE', 2, 'OVER_GRUNN'),
  ];
  const model = buildFieldDiagnostics({
    result: {
      ruleResults: [{ rule, geometryBreakdown: { point: { evaluatedCount: 3, failCount: 2, checkCount: 1, indeterminateCount: 0, passCount: 0 } }, findings }],
      outcomes: [],
      schemaFindings: [],
    },
    rule,
    field,
    geometryScope: 'point',
    summary: { objectCount: 3 },
  });
  assert.equal(model.diagnostics.length, 2);
  assert.equal(model.diagnostics[0].type, ValidationV2DiagnosticType.INVALID_VALUE);
  assert.equal(model.diagnostics[0].count, 2);
  assert.equal(model.diagnostics[1].type, ValidationV2DiagnosticType.VALID_VALUE_REVIEW);
  assert.equal(model.diagnostics[0].values[0].supplied, 'underGrunnen');
  assert.match(renderValidationV2Diagnostic(model.diagnostics[0]), /ikke er godkjente/);
  assert.match(renderValidationV2ResultHeading({ field, ...model }), /Feil i Vertikalnivå/);
});

test('Type/Tema incompatibility exposes bounded pair evidence and guidance', () => {
  const relationshipRule = {
    ruleId: 'innmaling.point.type-tema.compatible',
    canonicalFieldId: 'type',
    geometryScopes: ['point'],
    evaluatorKind: 'FIELD_RELATIONSHIP',
  };
  const pairs = [
    ['DB11', 'KUM'], ['DB11', 'KUM'], ['ABC', 'SAN'],
    ['C', 'SLU'], ['D', 'KUM'], ['E', 'SAN'], ['F', 'KMR'], ['G', 'SLU'],
  ];
  const findings = pairs.map(([type, tema], index) => ({
    ruleId: relationshipRule.ruleId,
    rule: relationshipRule,
    state: 'FAIL',
    objectRef: ref(index),
    canonicalFieldId: 'type',
    geometryScope: 'point',
    reasonCode: 'TYPE_TEMA_INCOMPATIBLE',
    observed: {
      type: { sourceValue: type },
      tema: { resolvedValue: tema },
    },
    details: {
      inputValues: [type, tema],
      diagnosticFacts: { context: [{ fieldId: 'tema', value: tema }], explanationContextFieldIds: ['tema'] },
    },
  }));
  const model = buildFieldDiagnostics({
    result: {
      ruleResults: [{ rule: relationshipRule, geometryBreakdown: { point: { evaluatedCount: pairs.length, failCount: pairs.length, checkCount: 0, indeterminateCount: 0, passCount: 0 } }, findings }],
      outcomes: [],
      schemaFindings: [],
    },
    rule: relationshipRule,
    field: { canonicalFieldId: 'type', displayName: 'Type', geometryScope: 'point' },
    geometryScope: 'point',
    summary: { objectCount: pairs.length },
  });
  assert.equal(model.diagnostics.length, 1);
  const diagnostic = model.diagnostics[0];
  assert.equal(diagnostic.count, 8);
  assert.deepEqual(diagnostic.relationshipPairs.slice(0, 3), [
    { type: 'DB11', tema: 'KUM', count: 2 },
    { type: 'ABC', tema: 'SAN', count: 1 },
    { type: 'C', tema: 'SLU', count: 1 },
  ]);
  assert.equal(diagnostic.additionalRelationshipPairCount, 2);
  const presentation = getValidationV2DiagnosticPresentation(diagnostic);
  assert.match(presentation.summary, /Type som ikke passer til Tema/);
  assert.match(presentation.detailLines[0], /Type DB11 \+ Tema KUM — 2 objekter/);
  assert.equal(presentation.detailLines.at(-1), 'og 2 andre kombinasjoner');
  assert.match(presentation.guidance, /gyldige hver for seg/);
  assert.match(presentation.guidance, /Kontroller Type og Tema/);
});

test('dependency suppression is a neutral note and not a status diagnostic', () => {
  const model = buildFieldDiagnostics({
    result: {
      ruleResults: [{ rule, geometryBreakdown: { point: { evaluatedCount: 2, failCount: 0, checkCount: 0, indeterminateCount: 0, passCount: 0 } }, findings: [] }],
      outcomes: [{ ruleId: rule.ruleId, objectRef: ref(0), state: 'NOT_EVALUATED', reasonCode: 'DEPENDENT_TEMA_UNRESOLVED', suppression: 'HYDRAULIC_TEMA_UNRESOLVED' }],
      schemaFindings: [],
    },
    rule,
    field,
    geometryScope: 'point',
    summary: { objectCount: 2 },
  });
  assert.equal(model.diagnostics.length, 0);
  assert.equal(model.unresolved.length, 1);
  assert.match(renderValidationV2DependencyNote(model.unresolved[0]), /kunne ikke vurderes/);
  assert.match(renderValidationV2ResultHeading({ field, ...model }), /bør kontrolleres/);
});

test('Resultat distinguishes direct Pass from non-applicable Pass-shaped outcomes', () => {
  const dataset = {
    points: [{ attributes: { Tema: 'KUM', S_HYPERLINK: 'SYNTHETIC_TEST_ATTACHMENT' } }],
    lines: [{ attributes: { Tema: 'SP', S_HYPERLINK: 'SYNTHETIC_TEST_ATTACHMENT', Rørform: 'S', VertikalDimensjon: null } }],
    fieldAnalysis: { points: { Tema: {}, S_HYPERLINK: {} }, lines: { Tema: {}, S_HYPERLINK: {}, Rørform: {}, VertikalDimensjon: {} } },
  };
  const result = runGmiValidationV2({ layerId: 'resultat-semantics', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-09' });
  const point = buildFieldDiagnostics({ result, rule: getValidationRule('innmaling.point.attachment-link.policy'), field: { canonicalFieldId: 'attachmentLink', displayName: 'S_HYPERLINK' }, geometryScope: 'point', summary: { objectCount: 1 } });
  const lineAttachment = buildFieldDiagnostics({ result, rule: getValidationRule('innmaling.point.attachment-link.policy'), field: { canonicalFieldId: 'attachmentLink', displayName: 'S_HYPERLINK' }, geometryScope: 'line', summary: { objectCount: 1 } });
  const lineVertical = buildFieldDiagnostics({ result, rule: getValidationRule('innmaling.line.vertical-dimension.valid'), field: { canonicalFieldId: 'verticalDimension', displayName: 'VertikalDimensjon' }, geometryScope: 'line', summary: { objectCount: 1 } });
  assert.match(renderValidationV2ResultHeading({ field: point.field || { displayName: 'S_HYPERLINK' }, ...point }), /består/);
  assert.equal(renderValidationV2ResultHeading({ field: { displayName: 'S_HYPERLINK' }, ...lineAttachment }), 'Ingen objekter i laget var aktuelle for denne kontrollen.');
  assert.equal(renderValidationV2ResultHeading({ field: { displayName: 'VertikalDimensjon' }, ...lineVertical }), 'Ingen objekter i laget var aktuelle for denne kontrollen.');
});

test('Resultat keeps dependency wording ahead of neutral no-applicable wording', () => {
  const dataset = { points: [], lines: [{ attributes: {} }], fieldAnalysis: { points: {}, lines: {} } };
  const result = runGmiValidationV2({ layerId: 'resultat-dependency', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-09' });
  const model = buildFieldDiagnostics({ result, rule: getValidationRule('innmaling.point.attachment-link.policy'), field: { canonicalFieldId: 'attachmentLink', displayName: 'S_HYPERLINK' }, geometryScope: 'line', summary: { objectCount: 1 } });
  const heading = renderValidationV2ResultHeading({ field: { displayName: 'S_HYPERLINK' }, ...model });
  assert.match(heading, /bør kontrolleres/);
  assert.doesNotMatch(heading, /Ingen objekter i laget/);
  assert.match(getValidationV2DependencyPresentation(model.unresolved[0]).summary, /kunne ikke vurderes/);
});

test('Resultat retains normal direct Pass wording for VertikalDimensjon', () => {
  const dataset = { points: [], lines: [{ attributes: { Rørform: 'E', VertikalDimensjon: 31 } }], fieldAnalysis: { points: {}, lines: { Rørform: {}, VertikalDimensjon: {} } } };
  const result = runGmiValidationV2({ layerId: 'resultat-direct', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-09' });
  const model = buildFieldDiagnostics({ result, rule: getValidationRule('innmaling.line.vertical-dimension.valid'), field: { canonicalFieldId: 'verticalDimension', displayName: 'VertikalDimensjon' }, geometryScope: 'line', summary: { objectCount: 1 } });
  assert.match(renderValidationV2ResultHeading({ field: { displayName: 'VertikalDimensjon' }, ...model }), /1 objekt består/);
});

test('Type dependency note names Tema and gives neutral guidance', () => {
  const presentation = getValidationV2DependencyPresentation({
    field: { canonicalFieldId: 'type', displayName: 'Type' },
    count: 461,
    dependency: 'HYDRAULIC_TEMA_UNRESOLVED',
  });
  assert.equal(presentation.summary, 'Type kunne ikke kontrolleres mot Tema for 461 objekter.');
  assert.match(presentation.detailLines[0], /Tema er ugyldig eller uavklart/);
  assert.match(presentation.guidance, /Kontroller Tema\/S_FCODE først/);
  assert.doesNotMatch(`${presentation.summary} ${presentation.detailLines.join(' ')} ${presentation.guidance}`, /nødvendig forutsetning|positioningCause|resolvedTheme/);
});

test('schema findings use schema scope without becoming object failures', () => {
  const model = buildFieldDiagnostics({
    result: {
      ruleResults: [{ rule, geometryBreakdown: { point: { evaluatedCount: 4, failCount: 0, checkCount: 0, indeterminateCount: 0, passCount: 4 } }, findings: [] }],
      outcomes: [],
      schemaFindings: [{ geometryScope: 'point', canonicalFieldId: 'verticalLevel', state: 'CHECK', reasonCode: 'SCHEMA_TEMA_SFCODE_COEXISTENCE' }],
    },
    rule,
    field,
    geometryScope: 'point',
    summary: { objectCount: 4 },
  });
  assert.equal(model.diagnostics.length, 1);
  assert.equal(model.diagnostics[0].type, ValidationV2DiagnosticType.SCHEMA_OR_SOURCE_ISSUE);
  assert.equal(model.diagnostics[0].count, 1);
});

test('compact YYYYMMDD is accepted while impossible and future dates remain failures', () => {
  assert.deepEqual(evaluateDateFormat({ state: 'VALUE_PRESENT', sourceValue: '20250305', sourceLexeme: '20250305' }), { state: 'PASS', reasonCode: null });
  assert.deepEqual(evaluateDateFormat({ state: 'VALUE_PRESENT', sourceValue: '20250229', sourceLexeme: '20250229' }).state, 'FAIL');
  const dataset = {
    points: [{ attributes: { Datafangstdato: '20270305', Anleggsår: '2026', Stedfestingsårsak: 'NYTT', Tema: 'KUM' } }],
    lines: [],
    fieldAnalysis: { points: { Datafangstdato: {}, Anleggsår: {}, Stedfestingsårsak: {}, Tema: {} }, lines: {} },
  };
  const result = runGmiValidationV2({ layerId: 'compact-date', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-09' });
  const outcome = result.outcomes.find((item) => item.ruleId === 'innmaling.common.capture-date.required');
  assert.equal(outcome.state, 'FAIL');
  assert.equal(outcome.reasonCode, 'DATE_FUTURE');
});

test('expected contextual missing wording is not presented as required', () => {
  const dataset = {
    points: [{ attributes: { Tema: 'KUM' } }],
    lines: [],
    fieldAnalysis: { points: { Tema: {}, Adkomst: {}, S_HYPERLINK: {} }, lines: {} },
  };
  const result = runGmiValidationV2({ layerId: 'expected-wording', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-09' });
  for (const [ruleId, canonicalFieldId, displayName] of [
    ['innmaling.point.access.valid', 'access', 'Adkomst'],
    ['innmaling.point.attachment-link.policy', 'attachmentLink', 'S_HYPERLINK'],
  ]) {
    const model = buildFieldDiagnostics({ result, rule: getValidationRule(ruleId), field: { canonicalFieldId, displayName }, geometryScope: 'point', summary: { objectCount: 1 } });
    assert.equal(model.diagnostics[0].state, 'CHECK');
    const text = renderValidationV2Diagnostic(model.diagnostics[0]);
    assert.doesNotMatch(text, /påkrevd/);
    assert.doesNotMatch(text, /positioningCause/);
    assert.match(text, /ønsket/);
    assert.doesNotMatch(text, /forventes normalt/);
  }
});

test('required contextual wording remains explicit', () => {
  const diagnostic = {
    type: ValidationV2DiagnosticType.CONTEXT_REQUIRED_MISSING,
    state: 'FAIL',
    count: 3,
    field: { canonicalFieldId: 'sdr', displayName: 'SDR' },
    contextFacts: {
      requirement: 'REQUIRED',
      explanationContextFieldIds: ['tema', 'material'],
      context: [{ fieldId: 'tema', value: 'TR' }, { fieldId: 'material', value: 'PE100' }],
    },
    values: [],
  };
  const text = renderValidationV2Diagnostic(diagnostic);
  assert.match(text, /påkrevd/);
  assert.doesNotMatch(text, /ønsket/);
});

test('contextual coverage uses only applicable objects and excludes unresolved applicability', () => {
  const dataset = {
    points: [
      { attributes: { Tema: 'KUM' } },
      { attributes: { Tema: 'STR' } },
      { attributes: {} },
      { attributes: { Tema: 'KUM', Adkomst: 'BAD' } },
    ],
    lines: [],
    fieldAnalysis: { points: { Tema: {}, Adkomst: {} }, lines: {} },
  };
  const result = runGmiValidationV2({ layerId: 'coverage-access', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-09' });
  const model = buildFieldDiagnostics({ result, rule: getValidationRule('innmaling.point.access.valid'), field: { canonicalFieldId: 'access', displayName: 'Adkomst', geometryScope: 'point' }, geometryScope: 'point' });
  assert.deepEqual(model.coverage, { applicableCount: 2, presentCount: 1, missingCount: 1, unresolvedCount: 1, requirement: 'EXPECTED' });
  assert.equal(model.coverage.presentCount + model.coverage.missingCount, model.coverage.applicableCount);
  assert.match(renderValidationV2Coverage({ coverage: model.coverage, field: { canonicalFieldId: 'access', displayName: 'Adkomst', geometryScope: 'point' } }), /1 av 2 kummer/);
  assert.equal(getValidationV2CoveragePresentation({ coverage: model.coverage, field: { canonicalFieldId: 'access', displayName: 'Adkomst', geometryScope: 'point' } }).secondary, '1 mangler · 50 % dekning');
});

test('coverage presentation uses applicable population, natural zero/one wording, and no status', () => {
  const accessField = { canonicalFieldId: 'access', displayName: 'Adkomst', geometryScope: 'point' };
  const zero = getValidationV2CoveragePresentation({ coverage: { applicableCount: 64, presentCount: 0, missingCount: 64 }, field: accessField });
  assert.equal(zero.main, '0 av 64 kummer har Adkomst');
  assert.equal(zero.secondary, '64 mangler · 0 % dekning');
  const one = getValidationV2CoveragePresentation({ coverage: { applicableCount: 1, presentCount: 1, missingCount: 0 }, field: accessField });
  assert.equal(one.main, '1 av 1 kum har Adkomst');
  assert.equal(one.secondary, '0 mangler · 100 % dekning');
  const generic = getValidationV2CoveragePresentation({ coverage: { applicableCount: 3, presentCount: 1, missingCount: 2 }, field: { canonicalFieldId: 'other', displayName: 'Bredde', geometryScope: 'point' } });
  assert.equal(generic.main, '1 av 3 aktuelle objekter har Bredde');
  assert.doesNotMatch(`${generic.main} ${generic.secondary}`, /Feil|Sjekk|Pass/);
});

test('S_HYPERLINK expected missing findings aggregate with Tema evidence', () => {
  const attachmentRule = getValidationRule('innmaling.point.attachment-link.policy');
  const themes = [...Array(16).fill('SAN'), ...Array(11).fill('KUM'), ...Array(3).fill('SLU')];
  const findings = themes.map((tema, index) => ({
    ruleId: attachmentRule.ruleId,
    rule: attachmentRule,
    state: 'CHECK',
    objectRef: ref(index),
    canonicalFieldId: 'attachmentLink',
    geometryScope: 'point',
    reasonCode: 'APPLICABILITY_REQUIRED_MISSING',
    details: { diagnosticFacts: { requirement: 'EXPECTED', context: [{ fieldId: 'tema', value: tema }] } },
  }));
  const outcomes = Array.from({ length: 83 }, (_, index) => ({
    ruleId: attachmentRule.ruleId,
    objectRef: ref(index),
    state: index < 30 ? 'CHECK' : 'PASS',
    diagnosticFacts: { coverageApplicability: 'EXPECTED', presence: index < 30 ? 'MISSING' : 'PRESENT' },
  }));
  const model = buildFieldDiagnostics({
    result: {
      ruleResults: [{ rule: attachmentRule, geometryBreakdown: { point: { evaluatedCount: 83, failCount: 0, checkCount: 30, indeterminateCount: 0, passCount: 53 } }, findings }],
      outcomes,
      schemaFindings: [],
    },
    rule: attachmentRule,
    field: { canonicalFieldId: 'attachmentLink', displayName: 'S_HYPERLINK', geometryScope: 'point' },
    geometryScope: 'point',
    summary: { objectCount: 83 },
  });
  assert.equal(model.coverage.applicableCount, 83);
  assert.equal(model.coverage.presentCount, 53);
  assert.equal(model.coverage.missingCount, 30);
  assert.equal(model.diagnostics.length, 1);
  assert.equal(model.diagnostics[0].count, 30);
  assert.equal(renderValidationV2Diagnostic(model.diagnostics[0]), '30 objekter mangler bilder. Bilder er normalt ønsket for denne typen objekt og bør kontrolleres.');
  assert.equal(renderValidationV2DiagnosticBreakdown(model.diagnostics[0]), 'SAN 16 · KUM 11 · SLU 3');
  assert.match(renderValidationV2Diagnostic({ ...model.diagnostics[0], type: ValidationV2DiagnosticType.SCHEMA_OR_SOURCE_ISSUE, count: 1, wordingKey: 'S_HYPERLINK_LOK_TOP', field: { canonicalFieldId: 'attachmentLink', displayName: 'S_HYPERLINK' } }), /har bilder/);
  assert.doesNotMatch(renderValidationV2Diagnostic({ ...model.diagnostics[0], type: ValidationV2DiagnosticType.SCHEMA_OR_SOURCE_ISSUE, count: 1, wordingKey: 'S_HYPERLINK_LOK_TOP', field: { canonicalFieldId: 'attachmentLink', displayName: 'S_HYPERLINK' } }), /Vedlegg/);
});

test('invalid supplied contextual values count as present while required coverage remains separate', () => {
  const dataset = {
    points: [],
    lines: [
      { attributes: { Tema: 'VL', Material: 'PE100' } },
      { attributes: { Tema: 'VL', Material: 'PE100', SDR: '12' } },
      { attributes: { Tema: 'VL', Material: 'BET' } },
      { attributes: { Tema: 'BAD', Material: 'PE100' } },
    ],
    fieldAnalysis: { points: {}, lines: { Tema: {}, Material: {}, SDR: {} } },
  };
  const result = runGmiValidationV2({ layerId: 'coverage-sdr', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-09' });
  const model = buildFieldDiagnostics({ result, rule: getValidationRule('innmaling.line.sdr.valid'), field: { canonicalFieldId: 'sdr', displayName: 'SDR', geometryScope: 'line' }, geometryScope: 'line' });
  assert.deepEqual(model.coverage, { applicableCount: 2, presentCount: 1, missingCount: 1, unresolvedCount: 1, requirement: 'REQUIRED' });
  assert.equal(model.coverage.presentCount + model.coverage.missingCount, model.coverage.applicableCount);
});

test('rendered context uses Norwegian display names and does not expose object references', () => {
  const diagnostic = {
    type: ValidationV2DiagnosticType.CONTEXT_REQUIRED_MISSING,
    state: 'CHECK',
    count: 2,
    field: { displayName: 'Adkomst' },
    contextFacts: {
      requirement: 'EXPECTED',
      explanationContextFieldIds: ['tema'],
      context: [{ fieldId: 'tema', value: 'KUM' }, { fieldId: 'positioningCause', value: 'NYTT' }],
    },
    values: [],
    affectedObjects: { sampleRefs: ['Punkt 1', 'Punkt 2'] },
  };
  const text = renderValidationV2Diagnostic(diagnostic);
  assert.match(text, /Tema/);
  assert.doesNotMatch(text, /positioningCause|verticalLevel|pipeShape|material/);
  assert.doesNotMatch(text, /Punkt 1|Punkt 2/);
});

test('count nouns use singular for one and plural for zero, two, and larger counts', () => {
  const base = { field: { canonicalFieldId: 'verticalLevel', displayName: 'Vertikalnivå' }, values: [] };
  assert.match(renderValidationV2Diagnostic({ ...base, type: ValidationV2DiagnosticType.REQUIRED_MISSING, count: 1 }), /^1 objekt /);
  assert.match(renderValidationV2Diagnostic({ ...base, type: ValidationV2DiagnosticType.REQUIRED_MISSING, count: 0 }), /^0 objekter /);
  assert.match(renderValidationV2Diagnostic({ ...base, type: ValidationV2DiagnosticType.REQUIRED_MISSING, count: 2 }), /^2 objekter /);
  assert.equal(getValidationV2DependencyPresentation({ field: { canonicalFieldId: 'verticalDimension', displayName: 'VertikalDimensjon' }, count: 1, dependency: 'PIPE_SHAPE_UNRESOLVED' }).summary, 'VertikalDimensjon kunne ikke vurderes for 1 objekt fordi Rørform er ugyldig eller uavklart.');
  assert.equal(renderValidationV2ResultHeading({ field: { displayName: 'Saksnummer' }, diagnostics: [], unresolved: [], counts: { pass: 1 } }), '1 objekt består Saksnummer-kontrollen');
  assert.equal(renderValidationV2ResultHeading({ field: { displayName: 'Saksnummer' }, diagnostics: [], unresolved: [], counts: { pass: 2 } }), 'Alle 2 objekter består Saksnummer-kontrollen');
});

test('ordinary diagnostics with hidden context aggregate counts and supplied values deterministically', () => {
  const findings = ['17', '17', '17'].map((value, index) => finding('CHECK', 'UNUSUAL_VALID_VALUE', index, value, { diagnosticFacts: { requirement: 'REQUIRED', context: [{ fieldId: 'material', value: index === 0 ? 'PE100' : 'PVC' }], explanationContextFieldIds: ['material'] } }));
  const model = buildFieldDiagnostics({ result: { ruleResults: [{ rule, geometryBreakdown: { point: { evaluatedCount: 3, failCount: 0, checkCount: 3, indeterminateCount: 0, passCount: 0 } }, findings }], outcomes: [], schemaFindings: [] }, rule, field, geometryScope: 'point', summary: { objectCount: 3 } });
  assert.equal(model.diagnostics.length, 1); assert.equal(model.diagnostics[0].count, 3); assert.deepEqual(model.diagnostics[0].values, [{ supplied: '17', count: 3 }]);
  const required = finding('CHECK', 'REQUIRED_VALUE_MISSING', 3, null, { diagnosticFacts: { requirement: 'REQUIRED' } });
  const expected = finding('CHECK', 'REQUIRED_VALUE_MISSING', 4, null, { diagnosticFacts: { requirement: 'EXPECTED' } });
  const separate = buildFieldDiagnostics({ result: { ruleResults: [{ rule, geometryBreakdown: { point: { evaluatedCount: 2, failCount: 0, checkCount: 2, indeterminateCount: 0, passCount: 0 } }, findings: [required, expected] }], outcomes: [], schemaFindings: [] }, rule, field, geometryScope: 'point', summary: { objectCount: 2 } });
  assert.equal(separate.diagnostics.length, 2);
});

test('bounded evidence is explicitly non-exhaustive and sensitive evidence stays absent', () => {
  const findings = ['A', 'B', 'C', 'D', 'E', 'F'].map((value, index) => finding('CHECK', 'UNUSUAL_VALID_VALUE', index, value));
  const model = buildFieldDiagnostics({ result: { ruleResults: [{ rule, geometryBreakdown: { point: { evaluatedCount: 6, failCount: 0, checkCount: 6, indeterminateCount: 0, passCount: 0 } }, findings }], outcomes: [], schemaFindings: [] }, rule, field, geometryScope: 'point', summary: { objectCount: 6 } });
  const diagnostic = model.diagnostics[0]; assert.equal(diagnostic.additionalValueCount, 1); assert.match(renderValidationV2Diagnostic(diagnostic), /Eksempler:/); assert.match(renderValidationV2Diagnostic(diagnostic), /\+ 1 andre verdier/);
  const sensitive = { ...diagnostic, field: { canonicalFieldId: 'caseNumber', displayName: 'Saksnummer' }, values: [{ supplied: 'PRIVATE', count: 1 }] };
  assert.equal(projectDiagnostic(sensitive).values.length, 0);
});

test('known dependency and schema causes use structured safe explanations', () => {
  for (const [dependency, label] of [['MATERIAL_UNRESOLVED', 'Material'], ['PIPE_SHAPE_UNRESOLVED', 'Rørform'], ['HYDRAULIC_TEMA_UNRESOLVED', 'Tema']]) {
    const presentation = getValidationV2DependencyPresentation({ field: { canonicalFieldId: 'sdr', displayName: 'SDR' }, count: 2, dependency });
    assert.match(`${presentation.summary} ${presentation.detailLines.join(' ')}`, new RegExp(label));
    assert.doesNotMatch(presentation.summary, /nødvendig forutsetning/);
  }
  const diagnostic = { ...finding('CHECK', 'REQUIRED_FIELD_ABSENT', 0, null), field, type: ValidationV2DiagnosticType.SCHEMA_OR_SOURCE_ISSUE, schemaCause: 'Feltet finnes ikke i skjemaet.' };
  const presentation = getValidationV2DiagnosticPresentation(diagnostic); assert.match(presentation.detailLines[0], /finnes ikke i skjemaet/); assert.match(presentation.guidance, /skjema/);
  const singular = renderValidationV2Diagnostic({ ...diagnostic, count: 1 });
  assert.equal(singular, 'Det er funnet et skjema- eller kildeproblem for Vertikalnivå som berører 1 objekt.');
  assert.doesNotMatch(singular, /1 objekt eller kilder/);
  assert.match(renderValidationV2Diagnostic({ ...diagnostic, count: 22 }), /berører 22 objekter/);
});

test('Type/Tema dependency notes include only genuinely unresolved Tema outcomes', () => {
  const relationshipRule = getValidationRule('innmaling.point.type-tema.compatible');
  const makeOutcome = (index, reasonCode, suppression = null) => ({ ruleId: relationshipRule.ruleId, objectRef: ref(index), state: 'NOT_EVALUATED', reasonCode, suppression });
  const result = { ruleResults: [{ rule: relationshipRule, geometryBreakdown: { point: { evaluatedCount: 5, failCount: 0, checkCount: 5, indeterminateCount: 0, passCount: 0 } }, findings: [] }], outcomes: [
    makeOutcome(0, 'RELATIONSHIP_PREREQUISITE_FAILED'), makeOutcome(1, 'RELATIONSHIP_PREREQUISITE_FAILED'),
    makeOutcome(2, 'DEPENDENT_TEMA_UNRESOLVED'), makeOutcome(3, 'DEPENDENT_TEMA_UNRESOLVED'), makeOutcome(4, 'DEPENDENT_TEMA_UNRESOLVED'),
  ], schemaFindings: [] };
  const model = buildFieldDiagnostics({ result, rule: relationshipRule, field: { canonicalFieldId: 'type', displayName: 'Type' }, geometryScope: 'point', summary: { objectCount: 5 } });
  assert.equal(model.unresolved.length, 1); assert.equal(model.unresolved[0].count, 3); assert.equal(model.unresolved[0].dependency, 'DEPENDENT_TEMA_UNRESOLVED');
});

test('resolved and invalid Tema contexts do not leak raw Tema into Eier diagnostics', () => {
  const dataset = {
    points: [{ attributes: { Tema: 'SP200' } }, { attributes: { Tema: 'KUM' } }], lines: [],
    fieldAnalysis: { points: { Tema: {}, Eier: {}, Type: {} }, lines: {} },
  };
  const result = runGmiValidationV2({ layerId: 'eier-context', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-11' });
  const model = buildFieldDiagnostics({ result, rule: getValidationRule('innmaling.point.owner.valid'), field: { canonicalFieldId: 'owner', displayName: 'Eier', geometryScope: 'point' }, geometryScope: 'point', summary: { objectCount: 2 } });
  const rendered = model.diagnostics.map(renderValidationV2Diagnostic).join(' ');
  assert.doesNotMatch(rendered, /Tema SP200/);
});

test('Type required-missing wording retains the resolved Tema DIV context without changing outcomes', () => {
  const temas = [
    ...Array(165).fill('DIV'), ...Array(64).fill('KUM'), ...Array(16).fill('SAN'),
    ...Array(3).fill('SLU'), ...Array(222).fill('GRN'),
  ];
  const dataset = {
    points: temas.map((Tema) => ({ attributes: { Tema, Type: '' } })),
    lines: [],
    fieldAnalysis: { points: { Tema: {}, Type: {} }, lines: {} },
  };
  const result = runGmiValidationV2({ layerId: 'type-required-context', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-11' });
  const typeRule = getValidationRule('innmaling.point.type.valid');
  const outcomes = result.outcomes.filter((outcome) => outcome.ruleId === typeRule.ruleId);
  const counts = outcomes.reduce((accumulator, outcome) => {
    accumulator[outcome.state] = (accumulator[outcome.state] || 0) + 1;
    return accumulator;
  }, {});
  assert.deepEqual(counts, { FAIL: 165, CHECK: 83, PASS: 222 });
  const failures = outcomes.filter((outcome) => outcome.state === 'FAIL');
  assert.ok(failures.every((outcome) => outcome.reasonCode === 'REQUIRED_VALUE_MISSING'
    && outcome.diagnosticFacts.requirement === 'REQUIRED'
    && outcome.diagnosticFacts.context.find((item) => item.fieldId === 'tema')?.value === 'DIV'));
  assert.ok(failures.every((outcome) => outcome.diagnosticFacts.applicability === 'CONDITIONAL'));

  const model = buildFieldDiagnostics({ result, rule: typeRule, field: { canonicalFieldId: 'type', displayName: 'Type' }, geometryScope: 'point', summary: { objectCount: temas.length } });
  const required = model.diagnostics.find((diagnostic) => diagnostic.state === 'FAIL');
  assert.equal(renderValidationV2Diagnostic(required), '165 objekter med Tema `DIV` mangler Type. Feltet er påkrevd for disse objektene.');
  assert.equal((renderValidationV2Diagnostic(required).match(/med Tema/g) || []).length, 1);
  const checks = model.diagnostics.filter((diagnostic) => diagnostic.state === 'CHECK');
  assert.deepEqual(checks.map((diagnostic) => renderValidationV2Diagnostic(diagnostic)), [
    '64 objekter med Tema `KUM` mangler Type. Feltet er ønskelig i denne konteksten og bør kontrolleres.',
    '16 objekter med Tema `SAN` mangler Type. Feltet er ønskelig i denne konteksten og bør kontrolleres.',
    '3 objekter med Tema `SLU` mangler Type. Feltet er ønskelig i denne konteksten og bør kontrolleres.',
  ]);
});

test('context wording groups values and includes only the applicable dimensions', () => {
  const base = {
    type: ValidationV2DiagnosticType.CONTEXT_REQUIRED_MISSING,
    state: 'FAIL', count: 2,
    field: { canonicalFieldId: 'sdr', displayName: 'SDR' },
    values: [],
    contextFacts: {
      requirement: 'REQUIRED',
      explanationContextFieldIds: ['tema', 'material'],
      context: [
        { fieldId: 'tema', value: 'KUM' }, { fieldId: 'tema', value: 'SAN' },
        { fieldId: 'material', value: 'PE100' }, { fieldId: 'positioningCause', value: 'NYTT' },
      ],
    },
    affectedObjects: { sampleRefs: ['private-object-id'] },
  };
  const text = renderValidationV2Diagnostic(base);
  assert.equal(text, '2 objekter med Tema `KUM` eller `SAN` og Material `PE100` mangler SDR. Feltet er påkrevd for disse objektene.');
  assert.doesNotMatch(text, /positioningCause|NYTT|private-object-id/);
});

test('representative contextual and unconditional missing rules retain relevant context only', () => {
  const dataset = {
    points: [{ attributes: { Tema: 'KUM', Type: '', Byggemetode: '', Kjegle: '', Avst_BunnInnvUnderUtv: '', Målemetode: '' } }],
    lines: [{ attributes: { Tema: 'VL', Material: 'PE100', SDR: '' } }],
    fieldAnalysis: {
      points: { Tema: {}, Type: {}, Byggemetode: {}, Kjegle: {}, Avst_BunnInnvUnderUtv: {}, Målemetode: {} },
      lines: { Tema: {}, Material: {}, SDR: {} },
    },
  };
  const result = runGmiValidationV2({ layerId: 'representative-context', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-11' });
  const renderFor = (ruleId, canonicalFieldId, displayName, geometryScope) => {
    const rule = getValidationRule(ruleId);
    const model = buildFieldDiagnostics({ result, rule, field: { canonicalFieldId, displayName }, geometryScope });
    return model.diagnostics.map(renderValidationV2Diagnostic);
  };
  assert.match(renderFor('innmaling.point.type.valid', 'type', 'Type', 'point')[0], /med Tema `KUM`/);
  assert.match(renderFor('innmaling.point.construction-method.valid', 'constructionMethod', 'Byggemetode', 'point')[0], /med Tema `KUM`/);
  assert.match(renderFor('innmaling.point.cone.valid', 'cone', 'Kjegle', 'point')[0], /med Tema `KUM`/);
  assert.match(renderFor('innmaling.point.bottom-distance.decimal', 'innerBottomToOuterUndersideDistance', 'Avst_BunnInnvUnderUtv', 'point')[0], /med Tema `KUM`/);
  assert.match(renderFor('innmaling.line.sdr.valid', 'sdr', 'SDR', 'line')[0], /med Tema `VL` og Material `PE100`/);
  const measurementMethod = renderFor('innmaling.common.measurement-method.required', 'measurementMethod', 'Målemetode', 'point')[0];
  assert.equal(measurementMethod, '1 objekt mangler Målemetode. Feltet er påkrevd.');
  assert.doesNotMatch(measurementMethod, /med Tema/);
});

test('unresolved Type context remains dependency wording and never guesses Tema', () => {
  const dataset = { points: [{ attributes: { Type: '' } }], lines: [], fieldAnalysis: { points: { Type: {} }, lines: {} } };
  const result = runGmiValidationV2({ layerId: 'type-unresolved-context', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-11' });
  const rule = getValidationRule('innmaling.point.type.valid');
  const model = buildFieldDiagnostics({ result, rule, field: { canonicalFieldId: 'type', displayName: 'Type' }, geometryScope: 'point' });
  assert.equal(model.diagnostics.length, 0);
  assert.equal(model.unresolved.length, 1);
  const note = getValidationV2DependencyPresentation(model.unresolved[0]);
  assert.match(note.summary, /kunne ikke kontrolleres mot Tema/);
  assert.doesNotMatch(`${note.summary} ${note.detailLines.join(' ')}`, /Tema `[^`]+`|missing|private|point-/i);
});
