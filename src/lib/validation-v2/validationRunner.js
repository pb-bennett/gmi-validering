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
  evaluateRequiredField,
  evaluateTemaRequired,
} from './ruleEvaluation.js';
import { getValidationRules } from './registry/rules.js';

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

function getRuleEvidence({ rule, ref, dataset, datasetRevision, schemaBinding, layerId }) {
  if (rule.canonicalFieldId === 'tema') {
    const binding = getBinding(schemaBinding, rule.canonicalFieldId, ref.geometryScope);
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
    canonicalFieldId: rule.canonicalFieldId,
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
    if (key !== 'rawValue') {
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

function evaluateRule({ rule, evidence }) {
  if (rule.evaluatorKind === RuleEvaluatorKind.REQUIRED) {
    return rule.canonicalFieldId === 'tema'
      ? evaluateTemaRequired(evidence)
      : evaluateRequiredField(evidence);
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
  return {
    ruleId: rule.ruleId,
    rule,
    state: evaluation.state,
    objectRef: ref,
    canonicalFieldId: rule.canonicalFieldId,
    geometryScope: ref.geometryScope,
    reasonCode: evaluation.reasonCode || RuleReasonCode.BINDING_AMBIGUOUS,
    observed: getObservedEvidence(evidence),
    expectedValues: rule.evaluatorKind === RuleEvaluatorKind.ALLOWED_VALUE
      ? rule.allowedValues
      : null,
  };
}

function createRuleResult(rule, refs, context) {
  const findings = [];
  let passCount = 0;
  let failCount = 0;
  let notEvaluatedCount = 0;
  let indeterminateCount = 0;

  for (const ref of refs) {
    const evidenceKey = `${rule.canonicalFieldId}|${ref.key}`;
    let evidence = context.evidenceCache.get(evidenceKey);
    if (!evidence) {
      evidence = getRuleEvidence({
        rule,
        ref,
        dataset: context.dataset,
        datasetRevision: context.datasetRevision,
        schemaBinding: context.schemaBinding,
        layerId: context.layerId,
      });
      context.evidenceCache.set(evidenceKey, evidence);
    }
    const evaluation = evaluateRule({ rule, evidence });
    if (evaluation.state === EvaluationState.PASS) passCount += 1;
    if (evaluation.state === EvaluationState.FAIL) failCount += 1;
    if (evaluation.state === EvaluationState.NOT_EVALUATED) notEvaluatedCount += 1;
    if (evaluation.state === EvaluationState.INDETERMINATE) indeterminateCount += 1;
    if (evaluation.state === EvaluationState.FAIL || evaluation.state === EvaluationState.INDETERMINATE) {
      findings.push(createFinding({ rule, ref, evidence, evaluation }));
    }
  }

  return {
    rule,
    evaluatedObjectCount: refs.length,
    passCount,
    failCount,
    notEvaluatedCount,
    indeterminateCount,
    findings,
    affectedObjectRefs: findings.map((finding) => finding.objectRef),
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
  const context = {
    layerId: input.layerId,
    dataset: input.dataset,
    datasetRevision: input.datasetRevision,
    schemaBinding,
    evidenceCache: new Map(),
  };
  const ruleResults = rules.map((rule) =>
    createRuleResult(rule, getRefsForRule(rule, objectRefs), context)
  );
  const findings = ruleResults.flatMap((result) => result.findings);

  return deepFreeze({
    layerId: input.layerId,
    datasetRevision: input.datasetRevision,
    sourceFormat: GMI_SOURCE_FORMAT,
    schemaBinding,
    sourceFieldDiagnostics: schemaBinding.sourceFieldDiagnostics,
    ruleResults,
    summary: {
      totalRules: ruleResults.length,
      rulesWithFailures: ruleResults.filter((result) => result.failCount > 0).length,
      failFindingCount: findings.filter((finding) => finding.state === EvaluationState.FAIL).length,
      indeterminateFindingCount: findings.filter((finding) => finding.state === EvaluationState.INDETERMINATE).length,
      evaluatedPointCount: objectRefs.pointRefs.length,
      evaluatedLineCount: objectRefs.lineRefs.length,
    },
  });
}
