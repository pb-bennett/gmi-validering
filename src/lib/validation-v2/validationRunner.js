import {
  BindingState,
  EvaluationState,
  GMI_SOURCE_FORMAT,
  MappingKind,
  RuleEvaluatorKind,
  RuleReasonCode,
} from './contracts.js';
import { bindGmiLayerSchema } from './gmiLayerSchemaBinding.js';
import { createGmiObjectRefs } from './objectRef.js';
import { extractGmiObjectFieldValue } from './objectFieldValue.js';
import { resolveGmiTemaIdentity } from './temaIdentity.js';
import {
  evaluateAllowedValue,
  evaluateFieldRelationship,
  evaluateIntegerFormat,
  evaluateDecimalFormat,
  evaluateYearFormat,
  evaluateDateFormat,
  evaluateTextMaxLength,
  evaluateRequiredAllowedValue,
  evaluateRequiredField,
  evaluateTemaRequiredAllowedValue,
  evaluateTemaRequired,
} from './ruleEvaluation.js';
import { getValidationRules } from './registry/rules.js';
import { evaluateFieldPolicy, evaluateValidatedTema } from './fieldPolicy.js';
import { classifyHydraulicTema } from './registry/hydraulicTemaClassification.js';

function deepFreeze(value, propertyName) {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.isFrozen(value) ||
    propertyName === 'sourceValue' ||
    propertyName === 'resolvedValue' ||
    propertyName === 'rawValue'
  ) {
    return value;
  }
  Object.freeze(value);
  for (const [key, child] of Object.entries(value)) {
    deepFreeze(child, key);
  }
  return value;
}

function getRefsForRule(rule, objectRefs) {
  const refs = [];
  for (const geometryScope of rule.geometryScopes) {
    refs.push(...(
      geometryScope === 'point' ? objectRefs.pointRefs : objectRefs.lineRefs
    ));
  }
  return refs;
}

function getBinding(schemaBinding, canonicalFieldId, geometryScope) {
  const matches = schemaBinding.bindings.filter(
    (binding) =>
      binding.canonicalFieldId === canonicalFieldId &&
      binding.geometryScope === geometryScope
  );
  if (matches.length !== 1) {
    throw new Error('schemaBinding lacks exactly one requested field binding');
  }
  return matches[0];
}

export function createUnavailableTemaEvidence(binding) {
  const schemaCandidates = binding.candidates
    .filter((candidate) => candidate.mappingKind !== MappingKind.UNSUPPORTED_CANDIDATE)
    .map(copySchemaCandidate);
  const unresolvedCandidates = binding.candidates
    .filter((candidate) => candidate.mappingKind === MappingKind.UNSUPPORTED_CANDIDATE)
    .map(copySchemaCandidate);
  return {
    canonicalFieldId: 'tema',
    state: binding.state,
    bindingState: binding.state,
    sourceKey: null,
    mappingKind: null,
    observations: [],
    conflicts: copyConflictEvidence(binding.conflicts),
    schemaCandidates,
    unresolvedCandidates,
  };
}

function getFieldEvidence({ canonicalFieldId, ref, dataset, datasetRevision, schemaBinding, layerId }) {
  if (canonicalFieldId === 'tema') {
    const binding = getBinding(schemaBinding, canonicalFieldId, ref.geometryScope);
    if (binding.state === BindingState.SCHEMA_UNAVAILABLE || binding.state === BindingState.AMBIGUOUS) {
      return createUnavailableTemaEvidence(binding);
    }
    return resolveGmiTemaIdentity({
      layerId,
      dataset,
      datasetRevision,
      sourceFormat: GMI_SOURCE_FORMAT,
      schemaBinding,
      objectRef: ref,
    });
  }
  return extractGmiObjectFieldValue({
    layerId,
    dataset,
    datasetRevision,
    sourceFormat: GMI_SOURCE_FORMAT,
    schemaBinding,
    objectRef: ref,
    canonicalFieldId,
  });
}

function isSafeObservedValue(value) {
  return value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint';
}

function copyObservedCandidate(candidate) {
  const copy = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (key !== 'rawValue' && key !== 'sourceLexeme') {
      copy[key] = Array.isArray(value) ? [...value] : value;
    }
  }
  if (isSafeObservedValue(candidate.rawValue)) {
    copy.rawValue = candidate.rawValue;
  }
  return copy;
}

function copyObservedCandidates(candidates = []) {
  return candidates.map(copyObservedCandidate);
}

function copySchemaCandidate(candidate) {
  return {
    canonicalFieldId: candidate.canonicalFieldId,
    sourceKey: candidate.sourceKey,
    mappingKind: candidate.mappingKind,
    sourceKind: candidate.sourceKind,
    validationAuthoritative: candidate.validationAuthoritative,
    authorityState: candidate.authorityState,
    confidence: candidate.confidence,
  };
}

function copySchemaCandidates(candidates = []) {
  return candidates.map(copySchemaCandidate);
}

function copyConflictEvidence(conflicts = []) {
  return conflicts.map((conflict) => {
    if (
      Array.isArray(conflict.sourceKeys) ||
      Array.isArray(conflict.canonicalFieldIds)
    ) {
      return {
        sourceKeys: [...(conflict.sourceKeys ?? [])],
        canonicalFieldIds: [...(conflict.canonicalFieldIds ?? [])],
      };
    }
    return copyObservedCandidate(conflict);
  });
}

function evaluateRule({ rule, evidence, rulesById, policyContext }) {
  if (rule.evaluatorKind === RuleEvaluatorKind.FIELD_POLICY) {
    return rule.canonicalFieldId === 'tema'
      ? evaluateValidatedTema(evidence, rule.allowedValues)
      : evaluateFieldPolicy(evidence, rule.policy, rule, policyContext);
  }
  if (rule.evaluatorKind === RuleEvaluatorKind.FIELD_RELATIONSHIP) {
    return evaluateFieldRelationship({
      inputFieldIds: rule.inputFieldIds,
      evidenceByField: evidence,
      prerequisiteRules: rule.relationship.prerequisiteRuleIds.map((ruleId) => rulesById.get(ruleId)),
      relationship: rule.relationship,
    });
  }
  if (rule.evaluatorKind === RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE) {
    if (rule.canonicalFieldId === 'tema') {
      return evaluateTemaRequiredAllowedValue(evidence, rule.allowedValues);
    }
    return evaluateRequiredAllowedValue(evidence, rule.allowedValues, rule.valueComparison);
  }
  if (rule.evaluatorKind === RuleEvaluatorKind.REQUIRED) {
    return rule.canonicalFieldId === 'tema'
      ? evaluateTemaRequired(evidence)
      : evaluateRequiredField(evidence);
  }
  if (rule.evaluatorKind === RuleEvaluatorKind.INTEGER_FORMAT) {
    return evaluateIntegerFormat(evidence);
  }
  if (rule.evaluatorKind === RuleEvaluatorKind.DECIMAL_FORMAT) {
    return evaluateDecimalFormat(evidence);
  }
  if (rule.evaluatorKind === RuleEvaluatorKind.YEAR_FORMAT) {
    return evaluateYearFormat(evidence);
  }
  if (rule.evaluatorKind === RuleEvaluatorKind.DATE_FORMAT) {
    return evaluateDateFormat(evidence);
  }
  if (rule.evaluatorKind === RuleEvaluatorKind.TEXT_MAX_LENGTH) {
    return evaluateTextMaxLength(evidence, rule.maximumLength);
  }
  return evaluateAllowedValue(evidence, rule.allowedValues);
}

function getObservedEvidence(evidence) {
  if (evidence.canonicalFieldId === 'tema' || evidence.state === 'RESOLVED') {
    return {
      identityState: evidence.state,
      bindingState: evidence.bindingState,
      sourceKey: evidence.preferredSourceKey ?? null,
      mappingKind: evidence.mappingKind ?? null,
      ...(isSafeObservedValue(evidence.resolvedValue)
        ? { resolvedValue: evidence.resolvedValue }
        : {}),
      observations: copyObservedCandidates(evidence.observations),
      conflicts: copyConflictEvidence(evidence.conflicts),
      schemaCandidates: copySchemaCandidates(evidence.schemaCandidates),
      unresolvedCandidates: copySchemaCandidates(evidence.unresolvedCandidates),
    };
  }
  return {
    objectValueState: evidence.state,
    bindingState: evidence.bindingState,
    sourceKey: evidence.sourceKey ?? null,
    mappingKind: evidence.mappingKind ?? null,
    ...(isSafeObservedValue(evidence.sourceValue)
      ? { sourceValue: evidence.sourceValue }
      : {}),
    candidates: copyObservedCandidates(evidence.candidates),
    conflicts: copyConflictEvidence(evidence.conflicts),
    schemaCandidates: copySchemaCandidates(evidence.schemaCandidates),
    unresolvedCandidates: copySchemaCandidates(evidence.unresolvedCandidates),
  };
}

export function createFinding({ rule, ref, evidence, evaluation }) {
  const isRelationship = rule.evaluatorKind === RuleEvaluatorKind.FIELD_RELATIONSHIP;
  const observed = isRelationship
    ? Object.fromEntries(rule.inputFieldIds.map((fieldId) => [
      fieldId,
      getObservedEvidence(evidence[fieldId]),
    ]))
    : getObservedEvidence(evidence);
  const inputValues = evaluation.details?.inputValues || [];
  const allowedValuesForPrimary = isRelationship
    ? rule.relationship.allowedPairs
      .filter((pair) => Object.is(pair[0], inputValues[0]))
      .map((pair) => pair[1])
    : [];
  return {
    ruleId: rule.ruleId,
    rule,
    state: evaluation.state,
    objectRef: ref,
    canonicalFieldId: rule.canonicalFieldId,
    geometryScope: ref.geometryScope,
    reasonCode: evaluation.reasonCode || RuleReasonCode.BINDING_AMBIGUOUS,
    observed,
    expectedValues: Array.isArray(rule.allowedValues) && rule.allowedValues.length > 0
      ? rule.allowedValues
      : null,
    expectedRelationship: isRelationship
      ? {
        kind: rule.relationship.kind,
        inputFieldIds: [...rule.inputFieldIds],
        allowedValuesForPrimary,
      }
      : null,
    details: evaluation.details || null,
  };
}

function createRuleResult(rule, refs, context) {
  const findings = [];
  const outcomes = [];
  let passCount = 0;
  let failCount = 0;
  let checkCount = 0;
  let notEvaluatedCount = 0;
  let indeterminateCount = 0;
  const geometryBreakdown = {
    point: createGeometryCounts(),
    line: createGeometryCounts(),
  };

  for (const ref of refs) {
    const inputFieldIds = rule.inputFieldIds || [rule.canonicalFieldId];
    const evidenceByField = Object.fromEntries(inputFieldIds.map((canonicalFieldId) => {
      const evidenceKey = `${canonicalFieldId}|${ref.key}`;
      let fieldEvidence = context.evidenceCache.get(evidenceKey);
      if (!fieldEvidence) {
        fieldEvidence = getFieldEvidence({
          canonicalFieldId,
          ref,
          dataset: context.dataset,
          datasetRevision: context.datasetRevision,
          schemaBinding: context.schemaBinding,
          layerId: context.layerId,
        });
        context.evidenceCache.set(evidenceKey, fieldEvidence);
      }
      return [canonicalFieldId, fieldEvidence];
    }));
    const evidence = rule.policy === 'typeCompatibility' ? evidenceByField.type : rule.evaluatorKind === RuleEvaluatorKind.FIELD_RELATIONSHIP
      ? evidenceByField
      : evidenceByField[rule.canonicalFieldId];
    const evaluation = rule.policy === 'typeCompatibility'
      ? evaluateFieldPolicy(evidence, rule.policy, rule, context.policyContexts.get(ref.key))
      : evaluateRule({ rule, evidence, rulesById: context.rulesById, policyContext: context.policyContexts.get(ref.key) });
    outcomes.push({ objectRef: ref, canonicalFieldId: rule.canonicalFieldId, ruleId: rule.ruleId,
      state: evaluation.state, reasonCode: evaluation.reasonCode || null,
      suppression: evaluation.details?.suppression || null });
    const geometryCounts = geometryBreakdown[ref.geometryScope];
    geometryCounts.evaluatedCount += 1;
    if (evaluation.state === EvaluationState.PASS) passCount += 1;
    if (evaluation.state === EvaluationState.PASS) geometryCounts.passCount += 1;
    if (evaluation.state === EvaluationState.FAIL) failCount += 1;
    if (evaluation.state === EvaluationState.FAIL) geometryCounts.failCount += 1;
    if (evaluation.state === EvaluationState.CHECK) checkCount += 1;
    if (evaluation.state === EvaluationState.CHECK) geometryCounts.checkCount += 1;
    if (evaluation.state === EvaluationState.NOT_EVALUATED) notEvaluatedCount += 1;
    if (evaluation.state === EvaluationState.NOT_EVALUATED) geometryCounts.notEvaluatedCount += 1;
    if (evaluation.state === EvaluationState.INDETERMINATE) indeterminateCount += 1;
    if (evaluation.state === EvaluationState.INDETERMINATE) geometryCounts.indeterminateCount += 1;
    if (evaluation.state === EvaluationState.FAIL || evaluation.state === EvaluationState.CHECK || evaluation.state === EvaluationState.INDETERMINATE) {
      findings.push(createFinding({ rule, ref, evidence: rule.policy === 'typeCompatibility' ? evidenceByField : evidence, evaluation }));
      geometryCounts.findingCount += 1;
    }
  }

  return {
    rule,
    evaluatedObjectCount: refs.length,
    passCount,
    failCount,
    checkCount,
    notEvaluatedCount,
    indeterminateCount,
    geometryBreakdown,
    findings,
    outcomes,
    affectedObjectRefs: findings.map((finding) => finding.objectRef),
  };
}

function createGeometryCounts() {
  return {
    evaluatedCount: 0,
    passCount: 0,
    failCount: 0,
    checkCount: 0,
    notEvaluatedCount: 0,
    indeterminateCount: 0,
    findingCount: 0,
  };
}

/**
 * Run the small source-backed Validator 2.0 beta rule set for one GMI layer.
 *
 * @param {import('./contracts.js').GmiLayerAdapterInput} input
 * @returns {import('./contracts.js').ValidationRunV2}
 */
export function runGmiValidationV2(input) {
  const schemaBinding = bindGmiLayerSchema(input);
  const objectRefs = createGmiObjectRefs(input);
  const rules = getValidationRules();
  const referenceDate = input.referenceDate ? new Date(`${input.referenceDate}T00:00:00Z`) : new Date();
  const context = {
    layerId: input.layerId,
    dataset: input.dataset,
    datasetRevision: input.datasetRevision,
    schemaBinding,
    evidenceCache: new Map(),
    rulesById: new Map(rules.map((rule) => [rule.ruleId, rule])),
    policyContexts: new Map(),
    referenceDate,
    currentYear: referenceDate.getUTCFullYear(),
  };
  const allRefs = [...objectRefs.pointRefs, ...objectRefs.lineRefs];
  const evidenceFor = (ref, canonicalFieldId) => {
    const key = `${canonicalFieldId}|${ref.key}`;
    if (!context.evidenceCache.has(key)) context.evidenceCache.set(key, getFieldEvidence({ canonicalFieldId, ref, dataset: context.dataset, datasetRevision: context.datasetRevision, schemaBinding: context.schemaBinding, layerId: context.layerId }));
    return context.evidenceCache.get(key);
  };
  const raw = (evidence) => typeof evidence?.sourceLexeme === 'string' && evidence.sourceLexeme !== 'UNAVAILABLE' ? evidence.sourceLexeme : evidence?.sourceValue;
  const causeValues = ['FJERN', 'FLYTT_DELV', 'FLYTT_HELT', 'NYTT', 'PÅVI', 'UENDR'];
  const nyttYears = new Set();
  for (const ref of allRefs) {
    const cause = evidenceFor(ref, 'positioningCause'); const year = evidenceFor(ref, 'installationYear'); const y = raw(year);
    if (raw(cause) === 'NYTT' && typeof y === 'string' && /^[0-9]{4}$/.test(y) && Number(y) > 0 && Number(y) <= context.currentYear) nyttYears.add(Number(y));
  }
  const typeRelationship = rules.find((rule) => rule.ruleId === 'innmaling.point.type-tema.compatible');
  const pipeShapeRule = rules.find((rule) => rule.ruleId === 'innmaling.line.pipe-shape.valid');
  const materialRule = rules.find((rule) => rule.ruleId === 'innmaling.line.material.required');
  const typeTemas = new Set(typeRelationship?.relationship.allowedPairs.map(([, tema]) => tema) || []);
  const typeValues = new Set(typeRelationship?.relationship.allowedPairs.map(([type]) => type) || []);
  for (const ref of allRefs) context.policyContexts.set(ref.key, {
    tema: evidenceFor(ref, 'tema'),
    temaValid: (() => { const identity = evidenceFor(ref, 'tema'); return identity.state === 'RESOLVED' && (ref.geometryScope === 'point' ? rules.find((r) => r.ruleId === 'innmaling.point.tema.required') : rules.find((r) => r.ruleId === 'innmaling.line.tema.required'))?.allowedValues.includes(identity.resolvedValue); })(),
    positioningCause: evidenceFor(ref, 'positioningCause'), installationYear: evidenceFor(ref, 'installationYear'),
    pipeShape: evidenceFor(ref, 'pipeShape'), pipeShapeValues: pipeShapeRule?.allowedValues || [],
    material: evidenceFor(ref, 'material'), materialValid: (() => { const material = evidenceFor(ref, 'material'); return material?.state === 'VALUE_PRESENT' && materialRule?.allowedValues.includes(raw(material)); })(), hydraulicClass: (() => { const identity = evidenceFor(ref, 'tema'); return identity.state === 'RESOLVED' && (ref.geometryScope === 'line') ? classifyHydraulicTema(identity.resolvedValue, rules.find((r) => r.ruleId === 'innmaling.line.tema.required')?.allowedValues || []) : null; })(),
    nyttYears, typeTemas, typeValues, referenceDate, currentYear: context.currentYear,
  });
  const ruleResults = rules.map((rule) =>
    createRuleResult(rule, getRefsForRule(rule, objectRefs), context)
  );
  const findings = ruleResults.flatMap((result) => result.findings);
  const outcomes = ruleResults.flatMap((result) => result.outcomes);
  const schemaFindings = ['point', 'line'].flatMap((geometryScope) => {
    const binding = schemaBinding.bindings.find((item) => item.geometryScope === geometryScope && item.canonicalFieldId === 'tema');
    const keys = binding?.candidates?.filter((item) => item.mappingKind !== MappingKind.UNSUPPORTED_CANDIDATE).map((item) => item.sourceKey) || [];
    return keys.includes('Tema') && keys.includes('S_FCODE') ? [{ layerId: input.layerId, datasetRevision: input.datasetRevision, geometryScope, canonicalFieldId: 'tema', state: EvaluationState.CHECK, reasonCode: RuleReasonCode.SCHEMA_TEMA_SFCODE_COEXISTENCE }] : [];
  });

  return deepFreeze({
    layerId: input.layerId,
    datasetRevision: input.datasetRevision,
    sourceFormat: GMI_SOURCE_FORMAT,
    schemaBinding,
    sourceFieldDiagnostics: schemaBinding.sourceFieldDiagnostics,
    ruleResults,
    outcomes,
    schemaFindings,
    runContext: { referenceDate: referenceDate.toISOString().slice(0, 10) },
    summary: {
      totalRules: ruleResults.length,
      rulesWithFailures: ruleResults.filter((result) => result.failCount > 0).length,
      failFindingCount: findings.filter((finding) => finding.state === EvaluationState.FAIL).length,
      checkFindingCount: findings.filter((finding) => finding.state === EvaluationState.CHECK).length + schemaFindings.length,
      indeterminateFindingCount: findings.filter((finding) => finding.state === EvaluationState.INDETERMINATE).length,
      evaluatedPointCount: objectRefs.pointRefs.length,
      evaluatedLineCount: objectRefs.lineRefs.length,
    },
  });
}
