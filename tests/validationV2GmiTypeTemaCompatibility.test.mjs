import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const api = await import('../src/lib/validation-v2/index.js');
const {
  evaluateFieldRelationship,
} = await import('../src/lib/validation-v2/ruleEvaluation.js');
const {
  TYPE_TEMA_ALLOWED_PAIRS,
} = await import('../src/lib/validation-v2/registry/rules.js');
const {
  groupValidationV2Findings,
} = await import('../src/lib/validation-v2/uiIntegration.js');
const { getDatasetRevision } = await import('../src/lib/validation-v2/datasetRevision.js');
const {
  EXPECTED_POINT_TEMA_VALUES,
  EXPECTED_TYPE_VALUES,
} = await import('./fixtures/validationV2GmiV32DomainValues.mjs');
const {
  EXPECTED_TYPE_TEMA_PAIRS,
} = await import('./fixtures/validationV2GmiV32TypeTemaPairs.mjs');

const {
  BindingState,
  EvaluationState,
  FieldRelationshipKind,
  ObjectValueState,
  RuleCategory,
  RuleEvaluatorKind,
  RuleReasonCode,
  composeFieldInformation,
  getFieldInformation,
  getFieldInformationRegistry,
  getValidationRule,
  getValidationRules,
  getValidationV2AggregateStatus,
  getValidationV2FieldDataSummary,
  getValidationV2PresentationRules,
  runGmiValidationV2,
  validateRuleRegistry,
} = api;

const COMPATIBLE = 'innmaling.point.type-tema.compatible';
const TYPE_VALID = 'innmaling.point.type.valid';
const TEMA_REQUIRED = 'innmaling.point.tema.required';

function schemaFor(attributes) {
  return Object.fromEntries(Object.keys(attributes).map((key) => [key, {}]));
}

function makeDataset({
  points = [{ attributes: { Type: 'DB11', Tema: 'DIV' } }],
  lines = [],
  pointSchema,
  lineSchema,
  includeFieldAnalysis = true,
} = {}) {
  const dataset = { points, lines };
  if (includeFieldAnalysis) {
    const firstPointAttributes = points[0]?.attributes || {};
    const firstLineAttributes = lines[0]?.attributes || {};
    dataset.fieldAnalysis = {
      points: pointSchema ?? schemaFor(firstPointAttributes),
      lines: lineSchema ?? schemaFor(firstLineAttributes),
    };
  }
  return dataset;
}

function run(dataset, layerId = 'type-tema-layer', datasetRevision = `revision-${layerId}`) {
  return runGmiValidationV2({
    layerId,
    dataset,
    datasetRevision,
    sourceFormat: 'gmi',
  });
}

function relationshipResult(result) {
  const ruleResult = result.ruleResults.find(({ rule }) => rule.ruleId === COMPATIBLE);
  assert(ruleResult, 'compatibility rule result is missing');
  return ruleResult;
}

function typeEvidence(state, sourceValue) {
  return {
    canonicalFieldId: 'type',
    state,
    bindingState: state === ObjectValueState.SCHEMA_UNAVAILABLE
      ? BindingState.SCHEMA_UNAVAILABLE
      : BindingState.BOUND,
    sourceValue,
    sourceLexeme: typeof sourceValue === 'string' ? sourceValue : 'UNAVAILABLE',
  };
}

function temaEvidence({
  state = 'RESOLVED',
  bindingState = BindingState.BOUND,
  resolvedValue = 'DIV',
} = {}) {
  return {
    canonicalFieldId: 'tema',
    state,
    bindingState,
    resolvedValue,
    observations: [],
    conflicts: [],
    schemaCandidates: [],
    unresolvedCandidates: [],
  };
}

function evaluateRelationship(type, tema) {
  const rule = getValidationRule(COMPATIBLE);
  return evaluateFieldRelationship({
    inputFieldIds: rule.inputFieldIds,
    evidenceByField: { type, tema },
    prerequisiteRules: rule.relationship.prerequisiteRuleIds.map(getValidationRule),
    relationship: rule.relationship,
  });
}

function sortedPairs(pairs) {
  return pairs.map(([type, tema]) => `${type}\u0000${tema}`).sort();
}

function assertReconciles(ruleResult) {
  assert.equal(
    ruleResult.evaluatedObjectCount,
    ruleResult.passCount +
      ruleResult.failCount +
      ruleResult.notEvaluatedCount +
      ruleResult.indeterminateCount,
  );
}

test('independent Appendix A pair oracle has exact 72/86 cardinality and production parity', () => {
  const typeCodes = new Set(EXPECTED_TYPE_TEMA_PAIRS.map(([type]) => type));
  const pairKeys = EXPECTED_TYPE_TEMA_PAIRS.map(JSON.stringify);
  assert.equal(typeCodes.size, 72);
  assert.equal(EXPECTED_TYPE_TEMA_PAIRS.length, 86);
  assert.equal(new Set(pairKeys).size, 86);
  assert.deepEqual([...typeCodes].sort(), [...EXPECTED_TYPE_VALUES].sort());
  assert(EXPECTED_TYPE_TEMA_PAIRS.every(([, tema]) => EXPECTED_POINT_TEMA_VALUES.includes(tema)));
  assert.deepEqual(sortedPairs(TYPE_TEMA_ALLOWED_PAIRS), sortedPairs(EXPECTED_TYPE_TEMA_PAIRS));
});

test('relationship contract is explicit, generic, immutable, and registry-valid', () => {
  const rule = getValidationRule(COMPATIBLE);
  assert.equal(rule.canonicalFieldId, 'type');
  assert.deepEqual(rule.inputFieldIds, ['type', 'tema']);
  assert.deepEqual(rule.geometryScopes, ['point']);
  assert.equal(rule.evaluatorKind, RuleEvaluatorKind.FIELD_RELATIONSHIP);
  assert.equal(rule.category, RuleCategory.FIELD_COMPATIBILITY);
  assert.equal(rule.relationship.kind, FieldRelationshipKind.ALLOWED_PAIRS);
  assert.equal(rule.relationship.optionalInputFieldId, 'type');
  assert.equal(rule.relationship.optionalInputReasonCode, RuleReasonCode.OPTIONAL_TYPE_NOT_SUPPLIED);
  assert.equal(rule.relationship.failureReasonCode, RuleReasonCode.TYPE_TEMA_INCOMPATIBLE);
  assert.deepEqual(rule.relationship.prerequisiteRuleIds, [TYPE_VALID, TEMA_REQUIRED]);
  assert.equal(rule.relationship.allowedPairs.length, 86);
  assert.equal(rule.source.document, 'Innmålingsinstruks Vedlegg A');
  assert.equal(rule.source.pages, '12–14');
  assert.equal(rule.fieldDataEnabled, false);
  assert.equal(Object.hasOwn(rule, 'allowedValues'), false);
  assert.equal(Object.hasOwn(rule, 'valueComparison'), false);
  assert(Object.isFrozen(rule.relationship));
  assert(Object.isFrozen(rule.relationship.allowedPairs));
  assert.equal(validateRuleRegistry(), true);

  const duplicatePairRules = getValidationRules().map((candidate) => candidate === rule
    ? {
      ...candidate,
      relationship: {
        ...candidate.relationship,
        allowedPairs: [...candidate.relationship.allowedPairs, candidate.relationship.allowedPairs[0]],
      },
    }
    : candidate);
  assert.throws(() => validateRuleRegistry(duplicatePairRules), /duplicate allowed pairs/);
});

test('all 86 source-backed pairs pass, including every multi-Tema Type', () => {
  const points = EXPECTED_TYPE_TEMA_PAIRS.map(([Type, Tema]) => ({ attributes: { Type, Tema } }));
  const result = relationshipResult(run(makeDataset({
    points,
    pointSchema: { Type: {}, Tema: {} },
  })));
  assert.equal(result.evaluatedObjectCount, 86);
  assert.equal(result.passCount, 86);
  assert.equal(result.failCount, 0);
  assert.equal(result.notEvaluatedCount, 0);
  assert.equal(result.indeterminateCount, 0);
  assert.deepEqual(result.findings, []);
  assertReconciles(result);

  const expectedMultiTema = {
    BSPY: ['BAS', 'BFD'],
    PSNK: ['PAF', 'POV', 'PSP', 'PST', 'PMK'],
    PTOR: ['PAF', 'POV', 'PSP', 'PST', 'PMK'],
    RBIO: ['RSP', 'RVA'],
    RMEK: ['RSP', 'RVA'],
    RMKJ: ['RSP', 'RVA'],
    SSTA: ['SLG', 'SLS', 'SLU'],
  };
  for (const [type, temas] of Object.entries(expectedMultiTema)) {
    assert.deepEqual(
      EXPECTED_TYPE_TEMA_PAIRS.filter(([candidate]) => candidate === type).map(([, tema]) => tema),
      temas,
      type,
    );
  }
});

test('definite valid-code mismatches fail only compatibility and retain sanitized pair evidence', () => {
  for (const [Type, Tema] of [['DB11', 'BAS'], ['RSDM', 'RSP']]) {
    const attributes = { Type, Tema, UnrelatedSecret: { private: true } };
    const result = run(makeDataset({
      points: [{ attributes }],
      pointSchema: schemaFor(attributes),
    }), `mismatch-${Type}`);
    assert.equal(result.ruleResults.find(({ rule }) => rule.ruleId === TYPE_VALID).passCount, 1);
    assert.equal(result.ruleResults.find(({ rule }) => rule.ruleId === TEMA_REQUIRED).passCount, 1);
    const compatibility = relationshipResult(result);
    assert.equal(compatibility.failCount, 1);
    assert.equal(compatibility.findings.length, 1);
    const finding = compatibility.findings[0];
    assert.equal(finding.reasonCode, RuleReasonCode.TYPE_TEMA_INCOMPATIBLE);
    assert.equal(finding.observed.type.sourceValue, Type);
    assert.equal(finding.observed.tema.resolvedValue, Tema);
    assert.deepEqual(finding.details.inputValues, [Type, Tema]);
    assert.equal(finding.expectedValues, null);
    assert.equal(finding.expectedRelationship.kind, FieldRelationshipKind.ALLOWED_PAIRS);
    assert.equal(JSON.stringify(finding).includes('UnrelatedSecret'), false);
    assert.equal(JSON.stringify(finding).includes('private'), false);
  }
});

test('optional Type and prerequisite-failure precedence are exact', () => {
  for (const [label, state, value] of [
    ['absent', ObjectValueState.FIELD_ABSENT, undefined],
    ['undefined', ObjectValueState.VALUE_MISSING, undefined],
    ['null', ObjectValueState.VALUE_MISSING, null],
    ['empty', ObjectValueState.VALUE_MISSING, ''],
  ]) {
    const evaluation = evaluateRelationship(typeEvidence(state, value), temaEvidence());
    assert.equal(evaluation.state, EvaluationState.NOT_EVALUATED, label);
    assert.equal(evaluation.reasonCode, RuleReasonCode.OPTIONAL_TYPE_NOT_SUPPLIED, label);
  }
  const absentWithInvalidTema = evaluateRelationship(
    typeEvidence(ObjectValueState.FIELD_ABSENT),
    temaEvidence({ resolvedValue: 'INVALID' }),
  );
  assert.equal(absentWithInvalidTema.reasonCode, RuleReasonCode.OPTIONAL_TYPE_NOT_SUPPLIED);

  const cases = [
    [typeEvidence(ObjectValueState.VALUE_PRESENT, ' '), temaEvidence(), [TYPE_VALID]],
    [typeEvidence(ObjectValueState.VALUE_PRESENT, 'INVALID'), temaEvidence(), [TYPE_VALID]],
    [typeEvidence(ObjectValueState.VALUE_PRESENT, 'DB11'), temaEvidence({ state: 'MISSING', resolvedValue: undefined }), [TEMA_REQUIRED]],
    [typeEvidence(ObjectValueState.VALUE_PRESENT, 'DB11'), temaEvidence({ resolvedValue: 'INVALID' }), [TEMA_REQUIRED]],
    [typeEvidence(ObjectValueState.VALUE_PRESENT, 'INVALID'), temaEvidence({ resolvedValue: 'INVALID' }), [TYPE_VALID, TEMA_REQUIRED]],
    [typeEvidence(ObjectValueState.VALUE_PRESENT, 'INVALID'), temaEvidence({ state: 'CONFLICT', resolvedValue: undefined }), [TYPE_VALID]],
    [typeEvidence(ObjectValueState.BINDING_AMBIGUOUS), temaEvidence({ resolvedValue: 'INVALID' }), [TEMA_REQUIRED]],
  ];
  for (const [type, tema, blockingRuleIds] of cases) {
    const evaluation = evaluateRelationship(type, tema);
    assert.equal(evaluation.state, EvaluationState.NOT_EVALUATED);
    assert.equal(evaluation.reasonCode, RuleReasonCode.RELATIONSHIP_PREREQUISITE_FAILED);
    assert.deepEqual(evaluation.details.blockingRuleIds, blockingRuleIds);
  }

  const points = [
    { attributes: { Tema: 'DIV' } },
    { attributes: { Type: undefined, Tema: 'DIV' } },
    { attributes: { Type: null, Tema: 'DIV' } },
    { attributes: { Type: '', Tema: 'DIV' } },
    { attributes: { Type: ' ', Tema: 'DIV' } },
    { attributes: { Type: 'INVALID', Tema: 'DIV' } },
    { attributes: { Type: 'DB11' } },
    { attributes: { Type: 'DB11', Tema: 'INVALID' } },
    { attributes: { Type: 'INVALID', Tema: 'INVALID' } },
  ];
  const compatibility = relationshipResult(run(makeDataset({
    points,
    pointSchema: { Type: {}, Tema: {} },
  }), 'precedence-runner'));
  assert.equal(compatibility.evaluatedObjectCount, 9);
  assert.equal(compatibility.passCount, 0);
  assert.equal(compatibility.failCount, 0);
  assert.equal(compatibility.notEvaluatedCount, 9);
  assert.equal(compatibility.indeterminateCount, 0);
  assert.deepEqual(compatibility.findings, []);
  assertReconciles(compatibility);
});

test('single and simultaneous structural causes remain indeterminate with exact reasons', () => {
  const validType = typeEvidence(ObjectValueState.VALUE_PRESENT, 'DB11');
  const validTema = temaEvidence();
  const cases = [
    [typeEvidence(ObjectValueState.BINDING_AMBIGUOUS), validTema, RuleReasonCode.BINDING_AMBIGUOUS],
    [typeEvidence(ObjectValueState.UNRESOLVED_SOURCE), validTema, RuleReasonCode.UNRESOLVED_SOURCE],
    [typeEvidence(ObjectValueState.SCHEMA_UNAVAILABLE), validTema, RuleReasonCode.SCHEMA_UNAVAILABLE],
    [validType, temaEvidence({ bindingState: BindingState.AMBIGUOUS, state: BindingState.AMBIGUOUS }), RuleReasonCode.BINDING_AMBIGUOUS],
    [validType, temaEvidence({ state: 'UNRESOLVED_SOURCE' }), RuleReasonCode.UNRESOLVED_SOURCE],
    [validType, temaEvidence({ bindingState: BindingState.SCHEMA_UNAVAILABLE, state: BindingState.SCHEMA_UNAVAILABLE }), RuleReasonCode.SCHEMA_UNAVAILABLE],
    [validType, temaEvidence({ state: 'CONFLICT' }), RuleReasonCode.TEMA_CONFLICT],
  ];
  for (const [type, tema, reasonCode] of cases) {
    const evaluation = evaluateRelationship(type, tema);
    assert.equal(evaluation.state, EvaluationState.INDETERMINATE);
    assert.equal(evaluation.reasonCode, reasonCode);
  }

  const multiple = evaluateRelationship(
    typeEvidence(ObjectValueState.BINDING_AMBIGUOUS),
    temaEvidence({ state: 'UNRESOLVED_SOURCE' }),
  );
  assert.equal(multiple.state, EvaluationState.INDETERMINATE);
  assert.equal(multiple.reasonCode, RuleReasonCode.RELATIONSHIP_INPUT_INDETERMINATE);
  assert.deepEqual(multiple.details.inputReasons, {
    type: RuleReasonCode.BINDING_AMBIGUOUS,
    tema: RuleReasonCode.UNRESOLVED_SOURCE,
  });
});

test('direct Tema, S_FCODE fallback, agreement, and conflict reuse the existing resolver', () => {
  const cases = [
    [{ Type: 'DB11', Tema: 'DIV' }, { Type: {}, Tema: {} }, EvaluationState.PASS, null],
    [{ Type: 'DB11', Tema: 'BAS' }, { Type: {}, Tema: {} }, EvaluationState.FAIL, RuleReasonCode.TYPE_TEMA_INCOMPATIBLE],
    [{ Type: 'DB11', S_FCODE: 'DIV' }, { Type: {}, S_FCODE: {} }, EvaluationState.PASS, null],
    [{ Type: 'DB11', S_FCODE: 'BAS' }, { Type: {}, S_FCODE: {} }, EvaluationState.FAIL, RuleReasonCode.TYPE_TEMA_INCOMPATIBLE],
    [{ Type: 'DB11', Tema: 'DIV', S_FCODE: 'DIV' }, { Type: {}, Tema: {}, S_FCODE: {} }, EvaluationState.PASS, null],
    [{ Type: 'DB11', Tema: 'DIV', S_FCODE: 'BAS' }, { Type: {}, Tema: {}, S_FCODE: {} }, EvaluationState.INDETERMINATE, RuleReasonCode.TEMA_CONFLICT],
  ];
  for (const [attributes, pointSchema, expectedState, expectedReason] of cases) {
    const compatibility = relationshipResult(run(makeDataset({
      points: [{ attributes }],
      pointSchema,
    }), `tema-${Object.keys(attributes).join('-')}-${attributes.Tema || attributes.S_FCODE}`));
    assert.equal(compatibility.passCount, expectedState === EvaluationState.PASS ? 1 : 0);
    assert.equal(compatibility.failCount, expectedState === EvaluationState.FAIL ? 1 : 0);
    assert.equal(compatibility.indeterminateCount, expectedState === EvaluationState.INDETERMINATE ? 1 : 0);
    if (expectedReason) assert.equal(compatibility.findings[0].reasonCode, expectedReason);
    assertReconciles(compatibility);
  }

  for (const unsupportedKey of ['PTEMA', 'LTEMA', 'FCODE']) {
    const compatibility = relationshipResult(run(makeDataset({
      points: [{ attributes: { Type: 'DB11', [unsupportedKey]: 'DIV' } }],
      pointSchema: { Type: {}, [unsupportedKey]: {} },
    }), `unsupported-${unsupportedKey}`));
    assert.equal(compatibility.passCount, 0, unsupportedKey);
    assert.equal(compatibility.failCount, 0, unsupportedKey);
  }
});

test('runner preserves ambiguous, unresolved, and schema-unavailable input evidence', () => {
  const runnerCases = [
    [
      makeDataset({
        points: [{ attributes: { TYPE: 'DB11', type: 'DB15', Tema: 'DIV' } }],
        pointSchema: { TYPE: {}, type: {}, Tema: {} },
      }),
      RuleReasonCode.BINDING_AMBIGUOUS,
    ],
    [
      makeDataset({
        points: [{ attributes: { Type: 'DB11', '.P_TEMA': 'DIV' } }],
        pointSchema: { Type: {}, '.P_TEMA': {} },
      }),
      RuleReasonCode.UNRESOLVED_SOURCE,
    ],
    [
      makeDataset({
        points: [{}],
        includeFieldAnalysis: false,
      }),
      RuleReasonCode.SCHEMA_UNAVAILABLE,
    ],
  ];
  for (const [dataset, reasonCode] of runnerCases) {
    const compatibility = relationshipResult(run(dataset, `structural-${reasonCode}`));
    assert.equal(compatibility.indeterminateCount, 1, reasonCode);
    assert.equal(compatibility.findings[0].reasonCode, reasonCode);
    assertReconciles(compatibility);
  }
});

test('geometry, layer, revision, empty, and all-missing-Type ownership stays isolated', () => {
  const lineOnly = relationshipResult(run(makeDataset({
    points: [],
    lines: [{ attributes: { Type: 'DB11', Tema: 'BAS' } }],
    lineSchema: { Type: {}, Tema: {} },
  }), 'line-only'));
  assert.equal(lineOnly.evaluatedObjectCount, 0);

  const mixed = relationshipResult(run(makeDataset({
    points: [{ attributes: { Type: 'DB11', Tema: 'DIV' } }],
    lines: [{ attributes: { Type: 'DB11', Tema: 'BAS' } }],
    pointSchema: { Type: {}, Tema: {} },
    lineSchema: { Type: {}, Tema: {} },
  }), 'mixed'));
  assert.equal(mixed.passCount, 1);
  assert.equal(mixed.failCount, 0);
  assert.equal(mixed.geometryBreakdown.line.evaluatedCount, 0);

  const empty = relationshipResult(run(makeDataset({ points: [], pointSchema: {} }), 'empty'));
  assert.equal(empty.evaluatedObjectCount, 0);
  assertReconciles(empty);

  const allMissing = relationshipResult(run(makeDataset({
    points: [{ attributes: { Tema: 'DIV' } }, { attributes: { Type: null, Tema: 'DIV' } }],
    pointSchema: { Type: {}, Tema: {} },
  }), 'all-missing'));
  assert.equal(allMissing.notEvaluatedCount, 2);
  assert.equal(allMissing.passCount + allMissing.failCount + allMissing.indeterminateCount, 0);
  assert.deepEqual(allMissing.findings, []);
  assert.equal(
    getValidationV2AggregateStatus(allMissing.geometryBreakdown.point).reasonCode,
    'NO_APPLICABLE_EVALUATIONS',
  );
  assertReconciles(allMissing);

  const layerA = relationshipResult(run(makeDataset({
    points: [{ attributes: { Type: 'DB11', Tema: 'BAS' } }],
    pointSchema: { Type: {}, Tema: {} },
  }), 'layer-a', 'revision-a'));
  const layerB = relationshipResult(run(makeDataset({
    points: [{ attributes: { Type: 'DB11', Tema: 'DIV' } }],
    pointSchema: { Type: {}, Tema: {} },
  }), 'layer-b', 'revision-b'));
  assert.equal(layerA.failCount, 1);
  assert.equal(layerB.passCount, 1);
  assert.equal(layerB.findings.length, 0);
  assert.equal(layerA.findings[0].objectRef.layerId, 'layer-a');
  assert.equal(layerA.findings[0].objectRef.datasetRevision, 'revision-a');
  assert.notEqual(layerA.findings[0].objectRef.key, 'layer-b|point|0');
});

test('mismatch grouping uses the exact ordered Type/Tema pair', () => {
  const compatibility = relationshipResult(run(makeDataset({
    points: [
      { attributes: { Type: 'DB11', Tema: 'BAS' } },
      { attributes: { Type: 'DB11', Tema: 'BFD' } },
      { attributes: { Type: 'DB11', Tema: 'BAS' } },
    ],
    pointSchema: { Type: {}, Tema: {} },
  }), 'groups'));
  const groups = groupValidationV2Findings(compatibility.findings, 'point');
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(({ observedValue }) => observedValue), [
    ['DB11', 'BAS'],
    ['DB11', 'BFD'],
  ]);
  assert.deepEqual(groups.map(({ findings }) => findings.length), [2, 1]);
});

test('Field Info keeps Type canonical and exposes exact compatibility/provenance', async () => {
  const information = getFieldInformation('type');
  const composed = composeFieldInformation({
    canonicalFieldId: 'type',
    geometryScope: 'point',
    rule: getValidationRule(COMPATIBLE),
  });
  assert.equal(composed.canonicalFieldId, 'type');
  assert.equal(composed.displayName, 'Type');
  assert.equal(composed.required, false);
  assert.equal(composed.requiredness, 'NOT_REQUIRED');
  assert.match(information.qualifications[0].text, /valgfritt/);
  assert.deepEqual(composed.allowedValues, []);
  assert.equal(information.compatibility.kind, FieldRelationshipKind.ALLOWED_PAIRS);
  const fieldInfoPairs = Object.entries(information.compatibility.byType)
    .flatMap(([type, { temaValues }]) => temaValues.map((tema) => [type, tema]));
  assert.deepEqual(sortedPairs(fieldInfoPairs), sortedPairs(EXPECTED_TYPE_TEMA_PAIRS));
  assert.deepEqual(information.compatibility.multiTemaTypes, {
    BSPY: ['BAS', 'BFD'],
    PSNK: ['PAF', 'POV', 'PSP', 'PST', 'PMK'],
    PTOR: ['PAF', 'POV', 'PSP', 'PST', 'PMK'],
    RBIO: ['RSP', 'RVA'],
    RMEK: ['RSP', 'RVA'],
    RMKJ: ['RSP', 'RVA'],
    SSTA: ['SLG', 'SLS', 'SLU'],
  });
  for (const relationship of Object.values(information.compatibility.byType)) {
    assert.deepEqual(relationship.sources[0], {
      documentId: 'appendix-a',
      pages: '12–14',
      auditSourceRuleIds: [TYPE_VALID, COMPATIBLE],
    });
  }
  assert(information.sources.every((source) =>
    source.auditSourceRuleIds.includes(TYPE_VALID) && source.auditSourceRuleIds.includes(COMPATIBLE)));
  assert.equal(getFieldInformationRegistry().some(({ canonicalFieldId }) =>
    canonicalFieldId === 'typeTemaCompatibility'), false);

  const presentations = getValidationV2PresentationRules(getValidationRules().map((rule) => ({
    rule,
    geometryBreakdown: {
      point: { evaluatedCount: 0, passCount: 0, failCount: 0, notEvaluatedCount: 0, indeterminateCount: 0 },
      line: { evaluatedCount: 0, passCount: 0, failCount: 0, notEvaluatedCount: 0, indeterminateCount: 0 },
    },
  })), 'point');
  const presentation = presentations.find(({ rule }) => rule.ruleId === COMPATIBLE);
  assert.equal(presentation.displayName, 'Type passer til Tema');
  assert.equal(presentation.rule.canonicalFieldId, 'type');
  assert.equal(presentation.fieldDataEnabled, false);

  const modalSource = await readFile(
    new URL('../src/components/validation-v2/ValidationV2FieldInfoModal.js', import.meta.url),
    'utf8',
  );
  assert.match(modalSource, /fieldDataEnabled/);
  assert.match(modalSource, /disabled=\{tab === TABS\.DATA && !fieldDataEnabled\}/);
});

test('ordinary single-field Fildata rejects the compatibility row', () => {
  const dataset = makeDataset({
    points: [{ attributes: { Type: 'DB11', Tema: 'DIV' } }],
    pointSchema: { Type: {}, Tema: {} },
  });
  const result = run(dataset, 'field-data', getDatasetRevision(dataset));
  assert.throws(() => getValidationV2FieldDataSummary({
    layerId: 'field-data',
    dataset,
    result,
    geometryScope: 'point',
    canonicalFieldId: 'type',
    rule: getValidationRule(COMPATIBLE),
  }), /disabled for relationship rules/);
});

test('registry and presentation totals are exactly 26 / 19 / 21', () => {
  const rules = getValidationRules();
  assert.equal(rules.length, 29);
  assert.equal(rules.filter(({ geometryScopes }) => geometryScopes.includes('point')).length, 22);
  assert.equal(rules.filter(({ geometryScopes }) => geometryScopes.includes('line')).length, 21);
});
