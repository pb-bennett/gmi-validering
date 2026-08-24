import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const api = await import('../src/lib/validation-v2/index.js');
const {
  evaluateAllowedValue,
  evaluateRequiredAllowedValue,
  evaluateRequiredField,
  evaluateTemaRequired,
} = await import(
  '../src/lib/validation-v2/ruleEvaluation.js'
);
const {
  createFinding,
  createUnavailableTemaEvidence,
} = await import('../src/lib/validation-v2/validationRunner.js');
const { bindGmiLayerSchemaWithRegistry } = await import(
  '../src/lib/validation-v2/gmiLayerSchemaBinding.js'
);
const {
  BindingState,
  EvaluationState,
  ObjectValueState,
  RuleCategory,
  RuleProvenance,
  RuleReasonCode,
  RuleSeverity,
  TemaIdentityState,
  bindGmiLayerSchema,
  createObjectRef,
  extractGmiObjectFieldValue,
  getValidationRules,
  getCanonicalField,
  runGmiValidationV2,
  validateRuleRegistry,
} = api;

const layerId = 'layer-a';
const datasetRevision = 'synthetic-rev-a5';

function makeDataset({
  pointSchema = { Høydereferanse: {}, Tema: {} },
  lineSchema = { Høydereferanse: {}, Tema: {} },
  pointAttributes = { Høydereferanse: 'TOPP_INNVENDIG', Tema: 'VL' },
  lineAttributes = { Høydereferanse: 'TOPP_INNVENDIG', Tema: 'SP' },
  points,
  lines,
  includeFieldAnalysis = true,
} = {}) {
  const dataset = {
    points: points ?? [{ attributes: pointAttributes }],
    lines: lines ?? [{ attributes: lineAttributes }],
  };
  if (includeFieldAnalysis) {
    dataset.fieldAnalysis = { points: pointSchema, lines: lineSchema };
  }
  return dataset;
}

function run(dataset, overrides = {}) {
  return runGmiValidationV2({
    layerId,
    dataset,
    datasetRevision,
    sourceFormat: 'gmi',
    ...overrides,
  });
}

function ruleResult(result, ruleId) {
  return result.ruleResults.find((rule) => rule.rule.ruleId === ruleId);
}

function syntheticAmbiguousBinding(
  dataset,
  canonicalFieldId = 'heightReference',
  competingCanonicalFieldId = 'syntheticTarget'
) {
  return bindGmiLayerSchemaWithRegistry(
    {
      layerId,
      dataset,
      datasetRevision,
      sourceFormat: 'gmi',
    },
    [
      {
        canonicalFieldId,
        directGmiSourceKey: 'COLLISION',
        acceptedFallbackKeys: [],
        disabledLegacyAliases: [],
        recognizedUnresolvedKeys: [],
        mappingEvidenceConfidence: 'HIGH',
      },
      {
        canonicalFieldId: competingCanonicalFieldId,
        directGmiSourceKey: 'COLLISION',
        acceptedFallbackKeys: [],
        disabledLegacyAliases: [],
        recognizedUnresolvedKeys: [],
        mappingEvidenceConfidence: 'HIGH',
      },
    ]
  );
}

function syntheticRef() {
  return createObjectRef({
    layerId,
    datasetRevision,
    geometryScope: 'point',
    objectIndex: 0,
  });
}

const HEIGHT_VALID = 'innmaling.common.height-reference.valid';
const POINT_TEMA_REQUIRED = 'innmaling.point.tema.required';
const LINE_TEMA_REQUIRED = 'innmaling.line.tema.required';

test('rule registry retains the reviewed A5 rules and validates structurally', () => {
  const rules = getValidationRules();
  assert.equal(validateRuleRegistry(), true);
  assert(rules.length >= 3);
  assert(rules.some((rule) => rule.ruleId === HEIGHT_VALID));
  assert(rules.some((rule) => rule.ruleId === POINT_TEMA_REQUIRED));
  assert(rules.some((rule) => rule.ruleId === LINE_TEMA_REQUIRED));
  assert.equal(new Set(rules.map((rule) => rule.ruleId)).size, rules.length);
  assert(rules.every((rule) => rule.provenance === RuleProvenance.STANDARD));
  assert(rules.every((rule) => rule.severity === RuleSeverity.ERROR));
  assert.equal(rules.find((rule) => rule.ruleId === HEIGHT_VALID).category, RuleCategory.REQUIRED_ALLOWED_VALUE);
  assert.equal(rules.find((rule) => rule.ruleId === POINT_TEMA_REQUIRED).category, RuleCategory.REQUIRED_FIELD);
  assert.equal(rules.find((rule) => rule.ruleId === LINE_TEMA_REQUIRED).category, RuleCategory.REQUIRED_FIELD);
  assert(rules.every((rule) => Object.isFrozen(rule)));
  assert(rules.every((rule) => Object.isFrozen(rule.geometryScopes)));
  assert(rules.every((rule) => Object.isFrozen(rule.source)));
  assert(rules.every((rule) => Object.isFrozen(rule.allowedValues)));
  assert(rules.every((rule) => getValidationRules().includes(rule)));
  assert(rules.every((rule) => rule.ruleId.includes('innmaling.')));
  assert(rules.every((rule) => getCanonicalField(rule.canonicalFieldId)));

  const duplicateRules = rules.map((rule) => ({ ...rule }));
  duplicateRules[1].ruleId = duplicateRules[0].ruleId;
  assert.throws(() => validateRuleRegistry(duplicateRules), /duplicate ruleId/);

  const unknownFieldRules = rules.map((rule) => ({ ...rule }));
  unknownFieldRules[0].canonicalFieldId = 'not-a-canonical-field';
  assert.throws(() => validateRuleRegistry(unknownFieldRules), /unknown field/);
});

test('Høydereferanse allowed values are independently source-verified', () => {
  // Explicit transcription of the seven codes shown in Appendix A p. 7.
  const sourceExpected = [
    'BUNN_INNVENDIG',
    'PÅ_BAKKEN',
    'SENTER',
    'TOPP_INNVENDIG',
    'TOPP_UTVENDIG',
    'UKJENT',
    'UNDERKANT_UTVENDIG',
  ];
  const rule = getValidationRules().find((candidate) => candidate.ruleId === HEIGHT_VALID);

  assert.deepEqual(rule.allowedValues, sourceExpected);
  assert.equal(new Set(rule.allowedValues).size, 7);
  for (const value of sourceExpected) {
    assert.equal(
      evaluateAllowedValue({ state: ObjectValueState.VALUE_PRESENT, sourceValue: value }, sourceExpected).state,
      EvaluationState.PASS,
      value
    );
  }
});

test('runs exactly one explicit layer and retains layer-qualified findings', () => {
  const result = run(makeDataset({
    pointSchema: { Tema: {} },
    lineSchema: { Tema: {} },
    pointAttributes: { Tema: null },
    lineAttributes: { Tema: 'SP' },
  }));
  const pointTema = ruleResult(result, POINT_TEMA_REQUIRED);

  assert.equal(result.layerId, layerId);
  assert.equal(result.datasetRevision, datasetRevision);
  assert.equal(result.sourceFormat, 'gmi');
  assert.equal(pointTema.failCount, 1);
  assert.equal(pointTema.findings.length, 1);
  assert.equal(pointTema.findings[0].objectRef.layerId, layerId);
  assert.equal(pointTema.findings[0].objectRef.datasetRevision, datasetRevision);
  assert.equal(pointTema.findings[0].objectRef.geometryScope, 'point');
  assert.equal(pointTema.findings[0].objectRef.sourceIndex, 0);
  assert.equal(pointTema.affectedObjectRefs[0], pointTema.findings[0].objectRef);

  assert.throws(
    () => run(makeDataset(), { layerId: '', datasetRevision }),
    /non-empty layerId/
  );
  assert.throws(
    () => run(makeDataset(), { datasetRevision: 42 }),
    /non-empty datasetRevision/
  );
  assert.throws(
    () => run(makeDataset(), { sourceFormat: 'GMI' }),
    /exactly gmi/
  );
  assert.throws(
    () => run({ points: [] }),
    /points and lines arrays/
  );
});

test('required evaluator maps all A4 states without rereading values', () => {
  assert.deepEqual(evaluateRequiredField({ state: ObjectValueState.VALUE_PRESENT }), {
    state: EvaluationState.PASS,
    reasonCode: null,
  });
  assert.deepEqual(evaluateRequiredField({ state: ObjectValueState.FIELD_ABSENT }), {
    state: EvaluationState.FAIL,
    reasonCode: RuleReasonCode.REQUIRED_FIELD_ABSENT,
  });
  assert.deepEqual(evaluateRequiredField({ state: ObjectValueState.VALUE_MISSING }), {
    state: EvaluationState.FAIL,
    reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING,
  });
  for (const state of [
    ObjectValueState.BINDING_AMBIGUOUS,
    ObjectValueState.UNRESOLVED_SOURCE,
    ObjectValueState.SCHEMA_UNAVAILABLE,
  ]) {
    assert.equal(evaluateRequiredField({ state }).state, EvaluationState.INDETERMINATE);
  }
});

test('allowed-value evaluator is exact and leaves missing values to requiredness', () => {
  assert.equal(
    evaluateAllowedValue({ state: ObjectValueState.VALUE_PRESENT, sourceValue: 'X' }, ['X']).state,
    EvaluationState.PASS
  );
  assert.equal(
    evaluateAllowedValue({ state: ObjectValueState.VALUE_PRESENT, sourceValue: 'x' }, ['X']).state,
    EvaluationState.FAIL
  );
  assert.equal(
    evaluateAllowedValue({ state: ObjectValueState.VALUE_PRESENT, sourceValue: 1 }, ['1']).state,
    EvaluationState.FAIL
  );
  for (const state of [ObjectValueState.FIELD_ABSENT, ObjectValueState.VALUE_MISSING]) {
    assert.equal(evaluateAllowedValue({ state }, ['X']).state, EvaluationState.NOT_EVALUATED);
  }
  for (const state of [
    ObjectValueState.BINDING_AMBIGUOUS,
    ObjectValueState.UNRESOLVED_SOURCE,
    ObjectValueState.SCHEMA_UNAVAILABLE,
  ]) {
    assert.equal(evaluateAllowedValue({ state }, ['X']).state, EvaluationState.INDETERMINATE);
  }
});

test('combined Høydereferanse rule distinguishes missing, invalid, and uncertain evidence', () => {
  const allowedValues = getValidationRules().find((rule) => rule.ruleId === HEIGHT_VALID).allowedValues;
  assert.equal(
    evaluateRequiredAllowedValue({ state: ObjectValueState.VALUE_PRESENT, sourceValue: allowedValues[0] }, allowedValues).state,
    EvaluationState.PASS,
  );
  assert.equal(
    evaluateRequiredAllowedValue({ state: ObjectValueState.VALUE_PRESENT, sourceValue: 'not-authorized' }, allowedValues).reasonCode,
    RuleReasonCode.VALUE_NOT_ALLOWED,
  );
  assert.equal(
    evaluateRequiredAllowedValue({ state: ObjectValueState.VALUE_MISSING }, allowedValues).reasonCode,
    RuleReasonCode.REQUIRED_VALUE_MISSING,
  );

  const absent = run(makeDataset({
    pointSchema: { Tema: {} },
    lineSchema: { Tema: {} },
    pointAttributes: { Tema: 'VL' },
    lineAttributes: { Tema: 'SP' },
  }));
  assert.equal(ruleResult(absent, HEIGHT_VALID).failCount, 2);
  assert.equal(ruleResult(absent, HEIGHT_VALID).findings[0].reasonCode, RuleReasonCode.REQUIRED_FIELD_ABSENT);

  const missing = run(makeDataset({
    pointAttributes: { Høydereferanse: null, Tema: 'VL' },
    lineAttributes: { Høydereferanse: '', Tema: 'SP' },
  }));
  assert.equal(ruleResult(missing, HEIGHT_VALID).failCount, 2);
  assert.equal(ruleResult(missing, HEIGHT_VALID).findings[0].reasonCode, RuleReasonCode.REQUIRED_VALUE_MISSING);
  assert.equal(ruleResult(missing, HEIGHT_VALID).notEvaluatedCount, 0);

  const valid = run(makeDataset({
    pointAttributes: { Høydereferanse: allowedValues[0], Tema: 'VL' },
    lineAttributes: { Høydereferanse: allowedValues[6], Tema: 'SP' },
  }));
  assert.equal(ruleResult(valid, HEIGHT_VALID).passCount, 2);

  const invalid = run(makeDataset({
    pointAttributes: { Høydereferanse: 'TOPP_INNVENDIG ', Tema: 'VL' },
    lineAttributes: { Høydereferanse: 'not-authorized', Tema: 'SP' },
  }));
  assert.equal(ruleResult(invalid, HEIGHT_VALID).failCount, 2);
  assert(ruleResult(invalid, HEIGHT_VALID).findings.every(
    (finding) => finding.reasonCode === RuleReasonCode.VALUE_NOT_ALLOWED,
  ));

  const unresolved = run(makeDataset({
    pointSchema: { HREF: {} },
    lineSchema: { HREF: {} },
    pointAttributes: { HREF: 'NN2000' },
    lineAttributes: { HREF: 'NN2000' },
  }));
  assert.equal(ruleResult(unresolved, HEIGHT_VALID).indeterminateCount, 2);
  assert.equal(ruleResult(unresolved, HEIGHT_VALID).findings[0].reasonCode, RuleReasonCode.UNRESOLVED_SOURCE);

  const unavailable = run(makeDataset({
    includeFieldAnalysis: false,
    points: [{}],
    lines: [{}],
  }));
  assert.equal(ruleResult(unavailable, HEIGHT_VALID).indeterminateCount, 2);
  assert.equal(ruleResult(unavailable, HEIGHT_VALID).findings[0].reasonCode, RuleReasonCode.SCHEMA_UNAVAILABLE);
});

test('point and line Tema rules use A3 identity semantics and never cross geometry', () => {
  const result = run(makeDataset({
    pointSchema: { Tema: {}, Høydereferanse: {} },
    lineSchema: { Tema: {}, Høydereferanse: {} },
    pointAttributes: { Tema: 'VL', Høydereferanse: 'TOPP_INNVENDIG' },
    lineAttributes: { Tema: null, Høydereferanse: 'TOPP_INNVENDIG' },
  }));
  assert.equal(ruleResult(result, POINT_TEMA_REQUIRED).passCount, 1);
  assert.equal(ruleResult(result, LINE_TEMA_REQUIRED).failCount, 1);
  assert.equal(ruleResult(result, LINE_TEMA_REQUIRED).findings[0].objectRef.geometryScope, 'line');

  const conflict = run(makeDataset({
    pointSchema: { Tema: {}, S_FCODE: {} },
    lineSchema: { Tema: {}, S_FCODE: {} },
    pointAttributes: { Tema: 'VL', S_FCODE: 'SP', Høydereferanse: 'TOPP_INNVENDIG' },
    lineAttributes: { Tema: 'SP', S_FCODE: 'VL', Høydereferanse: 'TOPP_INNVENDIG' },
  }));
  assert.equal(ruleResult(conflict, POINT_TEMA_REQUIRED).indeterminateCount, 1);
  assert.equal(ruleResult(conflict, LINE_TEMA_REQUIRED).indeterminateCount, 1);
  assert.equal(ruleResult(conflict, POINT_TEMA_REQUIRED).findings[0].reasonCode, RuleReasonCode.TEMA_CONFLICT);
});

test('Tema fallback satisfies requiredness, while unresolved and conflicting identity remain non-pass', () => {
  const fallback = run(makeDataset({
    pointSchema: { Tema: {}, S_FCODE: {}, Høydereferanse: {} },
    pointAttributes: { Tema: null, S_FCODE: 'VL', Høydereferanse: 'TOPP_INNVENDIG' },
  }));
  assert.equal(ruleResult(fallback, POINT_TEMA_REQUIRED).passCount, 1);

  const unresolved = run(makeDataset({
    pointSchema: { PTEMA: {}, Høydereferanse: {} },
    pointAttributes: { PTEMA: 'VL', Høydereferanse: 'TOPP_INNVENDIG' },
  }));
  assert.equal(ruleResult(unresolved, POINT_TEMA_REQUIRED).indeterminateCount, 1);
  assert.equal(
    ruleResult(unresolved, POINT_TEMA_REQUIRED).findings[0].reasonCode,
    RuleReasonCode.UNRESOLVED_SOURCE
  );
});

test('A1 schema ambiguity retains compact competing-target provenance in an A5 finding', () => {
  const attributes = {};
  Object.defineProperty(attributes, 'COLLISION', {
    enumerable: true,
    get() {
      throw new Error('ambiguous schema must not read object attributes');
    },
  });
  const dataset = makeDataset({
    pointSchema: { COLLISION: {} },
    points: [{ attributes }],
    lines: [],
  });
  const schemaBinding = syntheticAmbiguousBinding(dataset);
  const evidence = extractGmiObjectFieldValue({
    layerId,
    dataset,
    datasetRevision,
    sourceFormat: 'gmi',
    schemaBinding,
    objectRef: syntheticRef(),
    canonicalFieldId: 'heightReference',
  });
  const finding = createFinding({
    rule: getValidationRules().find((rule) => rule.ruleId === HEIGHT_VALID),
    ref: syntheticRef(),
    evidence,
    evaluation: evaluateRequiredField(evidence),
  });

  assert.equal(finding.state, EvaluationState.INDETERMINATE);
  assert.deepEqual(finding.observed.schemaCandidates.map((candidate) => candidate.sourceKey), [
    'COLLISION',
  ]);
  assert.deepEqual([...finding.observed.conflicts[0].canonicalFieldIds].sort(), [
    'heightReference',
    'syntheticTarget',
  ]);
});

test('A1 schema ambiguity never substitutes unresolved-source provenance', () => {
  const dataset = makeDataset({
    pointSchema: { COLLISION: {} },
    points: [{ attributes: {} }],
    lines: [],
  });
  const schemaBinding = syntheticAmbiguousBinding(dataset);
  const evidence = extractGmiObjectFieldValue({
    layerId,
    dataset,
    datasetRevision,
    sourceFormat: 'gmi',
    schemaBinding,
    objectRef: syntheticRef(),
    canonicalFieldId: 'heightReference',
  });
  const finding = createFinding({
    rule: getValidationRules().find((rule) => rule.ruleId === HEIGHT_VALID),
    ref: syntheticRef(),
    evidence,
    evaluation: evaluateRequiredField(evidence),
  });

  assert.deepEqual(finding.observed.unresolvedCandidates, []);
  assert.notEqual(finding.observed.schemaCandidates, finding.observed.unresolvedCandidates);
  assert.equal(finding.observed.schemaCandidates[0].mappingKind, 'DIRECT');
});

test('accepted A4 object-value conflicts retain observations separately from schema evidence', () => {
  const result = run(makeDataset({
    pointSchema: {
      Høydereferanse: {},
      HØYDEREFERANSE: {},
      Tema: {},
    },
    lineSchema: {},
    points: [{
      attributes: {
        Høydereferanse: 'TOPP_INNVENDIG',
        HØYDEREFERANSE: 'PÅ_BAKKEN',
        Tema: 'VL',
      },
    }],
    lines: [],
  }));
  const finding = ruleResult(result, HEIGHT_VALID).findings[0];

  assert.equal(finding.state, EvaluationState.INDETERMINATE);
  assert.deepEqual(finding.observed.conflicts.map((observation) => observation.rawValue), [
    'TOPP_INNVENDIG',
    'PÅ_BAKKEN',
  ]);
  assert.equal(finding.observed.schemaCandidates.length, 2);
  assert.deepEqual(finding.observed.unresolvedCandidates, []);
});

test('Tema A1 schema ambiguity retains compact competing schema provenance', () => {
  const dataset = makeDataset({
    pointSchema: { COLLISION: {} },
    points: [{ attributes: {} }],
    lines: [],
  });
  const schemaBinding = syntheticAmbiguousBinding(dataset, 'tema', 'syntheticTemaTarget');
  const temaBinding = schemaBinding.bindings.find(
    (binding) => binding.canonicalFieldId === 'tema' && binding.geometryScope === 'point'
  );
  const evidence = createUnavailableTemaEvidence(temaBinding);
  const finding = createFinding({
    rule: getValidationRules().find((rule) => rule.ruleId === POINT_TEMA_REQUIRED),
    ref: syntheticRef(),
    evidence,
    evaluation: evaluateTemaRequired(evidence),
  });

  assert.equal(finding.state, EvaluationState.INDETERMINATE);
  assert.deepEqual(finding.observed.schemaCandidates.map((candidate) => candidate.sourceKey), [
    'COLLISION',
  ]);
  assert.deepEqual([...finding.observed.conflicts[0].canonicalFieldIds].sort(), [
    'syntheticTemaTarget',
    'tema',
  ]);
  assert.deepEqual(finding.observed.unresolvedCandidates, []);
});

test('Tema/S_FCODE value conflicts retain A3 observations, not unresolved-source evidence', () => {
  const result = run(makeDataset({
    pointSchema: { Tema: {}, S_FCODE: {}, Høydereferanse: {} },
    lineSchema: {},
    pointAttributes: {
      Tema: 'VL',
      S_FCODE: 'SP',
      Høydereferanse: 'TOPP_INNVENDIG',
    },
    lines: [],
  }));
  const finding = ruleResult(result, POINT_TEMA_REQUIRED).findings[0];

  assert.equal(finding.reasonCode, RuleReasonCode.TEMA_CONFLICT);
  assert.deepEqual(finding.observed.conflicts.map((observation) => observation.rawValue), [
    'VL',
    'SP',
  ]);
  assert.deepEqual(finding.observed.unresolvedCandidates, []);
  assert.deepEqual(finding.observed.schemaCandidates, []);
});

test('equal local indexes remain layer-qualified and cannot cross layer ownership', () => {
  const layerA = run(makeDataset({
    points: [{ attributes: { Høydereferanse: null, Tema: null } }],
    lines: [],
  }), { layerId: 'layer-a' });
  const layerB = run(makeDataset({
    points: [{ attributes: { Høydereferanse: 'TOPP_INNVENDIG', Tema: 'VL' } }],
    lines: [],
  }), { layerId: 'layer-b' });
  const findingA = ruleResult(layerA, POINT_TEMA_REQUIRED).findings[0];

  assert.equal(findingA.objectRef.sourceIndex, 0);
  assert.equal(findingA.objectRef.layerId, 'layer-a');
  assert.equal(ruleResult(layerB, POINT_TEMA_REQUIRED).findings.length, 0);
  assert.notEqual(findingA.objectRef.key, `${layerB.layerId}:0`);
  assert(layerA.ruleResults.flatMap((rule) => rule.findings).every(
    (finding) => finding.objectRef.layerId === 'layer-a'
  ));
});

test('runner preserves PASS, FAIL, NOT_EVALUATED, and INDETERMINATE aggregation', () => {
  const result = run(makeDataset({
    points: [
      { attributes: { Høydereferanse: 'not-authorized', Tema: 'VL' } },
      { attributes: { Høydereferanse: null, Tema: null } },
    ],
    lines: [
      { attributes: { Høydereferanse: 'TOPP_INNVENDIG', Tema: 'SP' } },
    ],
  }));

  assert.deepEqual(ruleResult(result, HEIGHT_VALID), {
    rule: ruleResult(result, HEIGHT_VALID).rule,
    evaluatedObjectCount: 3,
    passCount: 1,
    failCount: 2,
    notEvaluatedCount: 0,
    indeterminateCount: 0,
    geometryBreakdown: {
      point: {
        evaluatedCount: 2,
        passCount: 0,
        failCount: 2,
        notEvaluatedCount: 0,
        indeterminateCount: 0,
        findingCount: 2,
      },
      line: {
        evaluatedCount: 1,
        passCount: 1,
        failCount: 0,
        notEvaluatedCount: 0,
        indeterminateCount: 0,
        findingCount: 0,
      },
    },
    findings: ruleResult(result, HEIGHT_VALID).findings,
    affectedObjectRefs: ruleResult(result, HEIGHT_VALID).affectedObjectRefs,
  });
  assert.equal(ruleResult(result, POINT_TEMA_REQUIRED).passCount, 1);
  assert.equal(ruleResult(result, POINT_TEMA_REQUIRED).failCount, 1);
  assert.equal(ruleResult(result, LINE_TEMA_REQUIRED).passCount, 1);
  assert.equal(result.summary.totalRules, getValidationRules().length);
  assert.equal(
    result.summary.rulesWithFailures,
    result.ruleResults.filter((rule) => rule.failCount > 0).length,
  );
  assert.equal(
    result.summary.failFindingCount + result.summary.indeterminateFindingCount,
    result.ruleResults.flatMap((rule) => rule.findings).length,
  );
  assert.equal(result.summary.evaluatedPointCount, 2);
  assert.equal(result.summary.evaluatedLineCount, 1);
});

test('unknown source fields stay informational and are preserved in run diagnostics', () => {
  const result = run(makeDataset({
    pointSchema: { Høydereferanse: {}, Tema: {}, CUSTOM_FIELD_X: {} },
    lineSchema: { Høydereferanse: {}, Tema: {}, CUSTOM_FIELD_X: {} },
  }));
  const unknown = result.sourceFieldDiagnostics.filter(
    (diagnostic) => diagnostic.sourceKey === 'CUSTOM_FIELD_X'
  );
  assert.equal(unknown.length, 2);
  assert(unknown.every((diagnostic) => diagnostic.classification === 'UNKNOWN_SOURCE_FIELD'));
  assert.equal(
    result.ruleResults.flatMap((rule) => rule.findings)
      .some((finding) => finding.canonicalFieldId === 'CUSTOM_FIELD_X'),
    false,
  );
});

test('malformed bound attributes are runtime errors, not validation findings', () => {
  const dataset = makeDataset({
    points: [{}],
    lineSchema: {},
    lines: [],
  });
  assert.throws(
    () => run(dataset),
    /feature\.attributes must be an object container/
  );

  const temaOnlyDataset = makeDataset({
    pointSchema: { Tema: {} },
    lineSchema: {},
    points: [{ attributes: null }],
    lines: [],
  });
  assert.throws(
    () => run(temaOnlyDataset),
    /feature\.attributes must be an object container for bound Tema resolution/
  );
});

test('runner reads only enabled rule fields and never object metadata or unrelated attributes', () => {
  const attributes = {};
  Object.defineProperty(attributes, 'Høydereferanse', {
    enumerable: true,
    get: () => 'TOPP_INNVENDIG',
  });
  Object.defineProperty(attributes, 'Tema', {
    enumerable: true,
    get: () => 'VL',
  });
  Object.defineProperty(attributes, 'UNRELATED', {
    enumerable: true,
    get: () => {
      throw new Error('unrelated attribute getter fired');
    },
  });
  const object = { attributes };
  for (const property of ['id', 'guid', 'coordinates', 'type']) {
    Object.defineProperty(object, property, {
      enumerable: true,
      get: () => {
        throw new Error(`${property} getter fired`);
      },
    });
  }
  const result = run(makeDataset({
    pointSchema: { Høydereferanse: {}, Tema: {} },
    lineSchema: {},
    points: [object],
    lines: [],
  }));
  assert.equal(ruleResult(result, POINT_TEMA_REQUIRED).passCount, 1);
   assert.equal(ruleResult(result, HEIGHT_VALID).passCount, 1);
});

test('finding projection does not freeze or expose caller-owned object values', () => {
  const rawObject = { unexpected: true };
  const dataset = makeDataset({
    pointAttributes: { Høydereferanse: rawObject, Tema: 'VL' },
    lineAttributes: { Høydereferanse: 'TOPP_INNVENDIG', Tema: 'SP' },
  });
  const result = run(dataset);
   const finding = ruleResult(result, HEIGHT_VALID).findings[0];

  assert.equal(finding.state, EvaluationState.FAIL);
  assert.equal(Object.prototype.hasOwnProperty.call(finding.observed, 'sourceValue'), false);
  assert.equal(Object.isFrozen(rawObject), false);
  assert.equal(Object.isFrozen(dataset.points[0].attributes), false);
});

test('run results, rule results, findings, and summaries are immutable', () => {
  const result = run(makeDataset({
    pointAttributes: { Høydereferanse: null, Tema: null },
  }));
  assert(Object.isFrozen(result));
  assert(Object.isFrozen(result.ruleResults));
  assert(Object.isFrozen(result.ruleResults[0]));
  assert(Object.isFrozen(result.summary));
  assert(Object.isFrozen(result.ruleResults[0].findings));
  assert.throws(() => result.ruleResults.push({}), TypeError);
  assert.throws(() => { result.summary.totalRules = 99; }, TypeError);
});

test('A5 runtime has no legacy/planning dependencies or later application APIs', async () => {
  const runtimePaths = [
    '../src/lib/validation-v2/contracts.js',
    '../src/lib/validation-v2/index.js',
    '../src/lib/validation-v2/registry/rules.js',
    '../src/lib/validation-v2/ruleEvaluation.js',
    '../src/lib/validation-v2/validationRunner.js',
  ];
  const source = await Promise.all(
    runtimePaths.map((relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8'))
  );
  const runtimeSource = source.join('\n');
  for (const forbiddenImport of [
    'src/lib/validation/fieldValidation.js',
    'src/data/fields.json',
    'src/lib/validation/validator.js',
    'src/lib/store.js',
    'gmi-adapter-spec.json',
    'gmi-adapter-test-vectors.json',
  ]) {
    assert.equal(runtimeSource.includes(forbiddenImport), false, forbiddenImport);
  }
  assert.equal('runValidationV2' in api, false);
  assert.equal('classifyHydraulicType' in api, false);
  assert.equal('createObjectRefFromValue' in api, false);
});
