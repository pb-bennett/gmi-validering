import {
  BindingState,
  EvaluationState,
  GMI_SOURCE_FORMAT,
  ObjectValueState,
  RuleEvaluatorKind,
} from './contracts.js';
import { createGmiObjectRefs } from './objectRef.js';
import { extractGmiObjectFieldValue } from './objectFieldValue.js';
import { resolveGmiTemaIdentity } from './temaIdentity.js';
import {
  evaluateAllowedValue,
  evaluateIntegerFormat,
  evaluateDecimalFormat,
  evaluateYearFormat,
  evaluateDateFormat,
  evaluateTextMaxLength,
  evaluateRequiredAllowedValue,
} from './ruleEvaluation.js';
import { getValidationRule } from './registry/rules.js';
import { getDatasetRevision } from './datasetRevision.js';
import { isCurrentValidationV2Result } from './uiIntegration.js';

const MAX_CACHE_ENTRIES = 8;
const MAX_VISIBLE_ROWS = 500;
const MISSING_LABELS = Object.freeze({
  EMPTY: '⟨tom⟩',
  NULL: '⟨null⟩',
  NOT_DELIVERED: '⟨ikke levert⟩',
  UNRESOLVED: '⟨kan ikke fastslås⟩',
  CONFLICT: '⟨motstridende kilder⟩',
});

let datasetCaches = new WeakMap();

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

function assertInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('getValidationV2FieldDataSummary requires an input object');
  }
  const required = ['layerId', 'dataset', 'result', 'geometryScope', 'canonicalFieldId'];
  for (const property of required) {
    if (input[property] === undefined || input[property] === null) {
      throw new TypeError(`${property} is required`);
    }
  }
  if (input.geometryScope !== 'point' && input.geometryScope !== 'line') {
    throw new TypeError('geometryScope must be point or line');
  }
}

function getBinding(result, canonicalFieldId, geometryScope) {
  return result.schemaBinding?.bindings?.find((candidate) =>
    candidate.canonicalFieldId === canonicalFieldId && candidate.geometryScope === geometryScope
  ) || null;
}

function getBindingSignature(binding) {
  if (!binding) return 'missing-binding';
  const candidates = (binding.candidates || []).map((candidate) =>
    `${candidate.mappingKind}:${candidate.sourceKey}`
  ).join('|');
  return `${binding.state}:${candidates}`;
}

function getCacheKey({ layerId, datasetRevision, geometryScope, canonicalFieldId, rule, binding }) {
  return [
    layerId,
    datasetRevision,
    geometryScope,
    canonicalFieldId,
    rule.ruleId,
    getBindingSignature(binding),
  ].join('|');
}

function formatTypedValue(value) {
  if (value === undefined) return MISSING_LABELS.NOT_DELIVERED;
  if (value === null) return MISSING_LABELS.NULL;
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (Object.is(value, -0)) return '-0';
    return String(value);
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return `${String(value)}n`;
  return '[kompleks verdi]';
}

function typedValueKey(value) {
  if (value === undefined) return 'undefined:';
  if (value === null) return 'null:';
  if (typeof value === 'number' && Object.is(value, -0)) return 'number:-0';
  if (typeof value === 'number' && Number.isNaN(value)) return 'number:NaN';
  if (typeof value === 'string') return `string:${value.length}:${value}`;
  if (typeof value === 'object') return `object:${Object.prototype.toString.call(value)}`;
  return `${typeof value}:${String(value)}`;
}

function getDeliveredValue(record) {
  if (record.category === 'unresolved') {
    return record.conflict ? MISSING_LABELS.CONFLICT : MISSING_LABELS.UNRESOLVED;
  }
  if (record.sourceLexeme !== 'UNAVAILABLE') {
    if (record.sourceLexeme === '') return MISSING_LABELS.EMPTY;
    return JSON.stringify(record.sourceLexeme);
  }
  if (record.category === 'missing' && record.sourceValue === '') return MISSING_LABELS.EMPTY;
  return formatTypedValue(record.sourceValue);
}

function getDeliveredKey(record) {
  if (record.category === 'unresolved') {
    return record.conflict ? 'missing:conflict' : 'missing:unresolved';
  }
  if (record.sourceLexeme !== 'UNAVAILABLE') return `lexeme:${record.sourceLexeme}`;
  if (record.category === 'missing' && record.sourceValue === '') return 'missing:empty';
  if (record.category === 'missing' && record.sourceValue === null) return 'missing:null';
  if (record.category === 'missing' && record.sourceValue === undefined) return 'missing:not-delivered';
  return `typed:${typedValueKey(record.sourceValue)}`;
}

function getInterpretation(record) {
  if (record.category !== 'present') return '-';
  if (record.sourceLexeme === 'UNAVAILABLE') return formatTypedValue(record.sourceValue);
  return formatTypedValue(record.sourceValue);
}

function getLookupValue(record) {
  if (record.category !== 'present') return null;
  const value = record.sourceLexeme !== 'UNAVAILABLE' ? record.sourceLexeme : record.sourceValue;
  if (typeof value === 'string') return value.length <= 64 && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getRuleOutcome(record, rule, result, objectRef) {
  const completed = result.outcomes?.find((outcome) => outcome.ruleId === rule.ruleId && outcome.objectRef.key === objectRef.key);
  if (completed) return {
    acceptance: ({ PASS: 'Pass', CHECK: 'Sjekk', FAIL: 'Feil', INDETERMINATE: 'Sjekk' })[completed.state] || '-',
    diagnosticFacts: completed.diagnosticFacts || null,
    reasonCode: completed.reasonCode || null,
  };
  if (
    rule.evaluatorKind !== RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE &&
    rule.evaluatorKind !== RuleEvaluatorKind.ALLOWED_VALUE &&
    rule.evaluatorKind !== RuleEvaluatorKind.INTEGER_FORMAT &&
    rule.evaluatorKind !== RuleEvaluatorKind.DECIMAL_FORMAT &&
    rule.evaluatorKind !== RuleEvaluatorKind.YEAR_FORMAT &&
    rule.evaluatorKind !== RuleEvaluatorKind.DATE_FORMAT &&
    rule.evaluatorKind !== RuleEvaluatorKind.TEXT_MAX_LENGTH
  ) return { acceptance: null, diagnosticFacts: null, reasonCode: null };
  const evaluate = rule.evaluatorKind === RuleEvaluatorKind.INTEGER_FORMAT
    ? evaluateIntegerFormat
    : rule.evaluatorKind === RuleEvaluatorKind.DECIMAL_FORMAT
      ? evaluateDecimalFormat
      : rule.evaluatorKind === RuleEvaluatorKind.YEAR_FORMAT
        ? evaluateYearFormat
        : rule.evaluatorKind === RuleEvaluatorKind.DATE_FORMAT
          ? evaluateDateFormat
          : rule.evaluatorKind === RuleEvaluatorKind.TEXT_MAX_LENGTH
            ? evaluateTextMaxLength
            : rule.evaluatorKind === RuleEvaluatorKind.ALLOWED_VALUE
              ? evaluateAllowedValue
              : evaluateRequiredAllowedValue;
  const evaluation = rule.evaluatorKind === RuleEvaluatorKind.TEXT_MAX_LENGTH
    ? evaluate(record.evidence, rule.maximumLength)
    : evaluate(
      record.evidence,
      rule.allowedValues,
      rule.valueComparison,
    );
  const acceptance = evaluation.state === EvaluationState.PASS ? 'Pass'
    : evaluation.state === EvaluationState.FAIL ? 'Feil'
      : evaluation.state === EvaluationState.CHECK || evaluation.state === EvaluationState.INDETERMINATE ? 'Sjekk' : '-';
  return { acceptance, diagnosticFacts: null, reasonCode: evaluation.reasonCode || null };
}

function safeOutcomeContext(diagnosticFacts) {
  if (!diagnosticFacts) return null;
  const applicability = diagnosticFacts.coverageApplicability || diagnosticFacts.applicability || null;
  const allowed = Array.isArray(diagnosticFacts.explanationContextFieldIds)
    ? diagnosticFacts.explanationContextFieldIds : [];
  const context = (applicability === 'NOT_APPLICABLE' ? [] : (diagnosticFacts.context || [])).filter((item) =>
    allowed.includes(item.fieldId) &&
    typeof item.value === 'string' && item.value.length <= 64 &&
    !/[\u0000-\u001f\u007f]/.test(item.value)
  ).map(({ fieldId, value }) => ({ fieldId, value }));
  return {
    context,
    applicability,
    requirement: diagnosticFacts.requirement || null,
  };
}

function extractRecord({ layerId, dataset, datasetRevision, result, geometryScope, canonicalFieldId, objectRef }) {
  const commonInput = {
    layerId,
    dataset,
    datasetRevision,
    sourceFormat: GMI_SOURCE_FORMAT,
    schemaBinding: result.schemaBinding,
    objectRef,
    canonicalFieldId,
  };
  let evidence;
  let conflict = false;
  if (canonicalFieldId === 'tema') {
    const binding = result.schemaBinding?.bindings?.find((candidate) =>
      candidate.canonicalFieldId === canonicalFieldId && candidate.geometryScope === geometryScope
    );
    const identity = binding?.state === BindingState.SCHEMA_UNAVAILABLE || binding?.state === BindingState.AMBIGUOUS
      ? null
      : resolveGmiTemaIdentity({ ...commonInput });
    if (identity?.state === 'CONFLICT') conflict = true;
    evidence = extractGmiObjectFieldValue(commonInput);
    if (identity?.state === 'RESOLVED') {
      evidence = {
        ...evidence,
        state: ObjectValueState.VALUE_PRESENT,
        sourceValue: identity.resolvedValue,
        sourceLexeme: identity.sourceLexeme,
        sourceKey: identity.preferredSourceKey,
      };
    } else if (identity?.state === 'MISSING') {
      evidence = { ...evidence, state: ObjectValueState.VALUE_MISSING, sourceValue: undefined };
    } else if (identity?.state === 'CONFLICT') {
      evidence = { ...evidence, state: ObjectValueState.BINDING_AMBIGUOUS };
    }
  } else {
    evidence = extractGmiObjectFieldValue(commonInput);
  }
  conflict = conflict || (Array.isArray(evidence.conflicts) && evidence.conflicts.length > 0);
  const unresolved = evidence.state === ObjectValueState.BINDING_AMBIGUOUS ||
    evidence.state === ObjectValueState.UNRESOLVED_SOURCE ||
    evidence.state === ObjectValueState.SCHEMA_UNAVAILABLE;
  const missing = evidence.state === ObjectValueState.FIELD_ABSENT ||
    evidence.state === ObjectValueState.VALUE_MISSING;
  const preferredCandidate = evidence.candidates?.[0];
  return {
    evidence,
    category: unresolved ? 'unresolved' : missing ? 'missing' : 'present',
    conflict,
    sourceValue: evidence.sourceValue !== undefined
      ? evidence.sourceValue
      : preferredCandidate?.rawValue,
    sourceLexeme: evidence.sourceLexeme !== undefined
      ? evidence.sourceLexeme
      : preferredCandidate?.sourceLexeme || 'UNAVAILABLE',
    sourceKey: evidence.sourceKey || null,
  };
}

function getSourceColumns(binding) {
  const keys = (binding?.candidates || [])
    .filter((candidate) => candidate.mappingKind !== 'UNSUPPORTED_CANDIDATE')
    .map((candidate) => candidate.sourceKey);
  return [...new Set(keys)];
}

function scanFieldData(input, rule, binding, datasetRevision) {
  const refs = createGmiObjectRefs({
    layerId: input.layerId,
    dataset: input.dataset,
    datasetRevision,
    sourceFormat: GMI_SOURCE_FORMAT,
  })[input.geometryScope === 'point' ? 'pointRefs' : 'lineRefs'];
  const buckets = new Map();
  let withValueCount = 0;
  let missingCount = 0;
  let unresolvedCount = 0;

  for (const objectRef of refs) {
    const record = extractRecord({
      ...input,
      result: input.result,
      datasetRevision,
      objectRef,
    });
    if (record.category === 'present') withValueCount += 1;
    if (record.category === 'missing') missingCount += 1;
    if (record.category === 'unresolved') unresolvedCount += 1;
    const key = getDeliveredKey(record);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        deliveredValue: getDeliveredValue(record),
        interpretedValue: getInterpretation(record),
        lookupValue: getLookupValue(record),
        isMissing: record.category === 'missing',
        isUnresolved: record.category === 'unresolved',
        count: 0,
        outcomeBreakdown: { Pass: 0, Sjekk: 0, Feil: 0 },
        outcomeGroups: new Map(),
      };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const outcome = getRuleOutcome(record, rule, input.result, objectRef);
    const acceptance = outcome.acceptance || 'Sjekk';
    if (bucket.outcomeBreakdown[acceptance] !== undefined) bucket.outcomeBreakdown[acceptance] += 1;
    const context = safeOutcomeContext(outcome.diagnosticFacts);
    const groupKey = JSON.stringify({ acceptance, context });
    const group = bucket.outcomeGroups.get(groupKey) || { status: acceptance, count: 0, context, reasonCode: outcome.reasonCode };
    group.count += 1;
    bucket.outcomeGroups.set(groupKey, group);
  }

  const objectCount = refs.length;
  const rows = [...buckets.values()]
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .map((bucket) => ({
      ...bucket, outcomeGroups: [...bucket.outcomeGroups.values()], ruleAcceptance: bucket.outcomeBreakdown.Feil ? 'Feil' : bucket.outcomeBreakdown.Sjekk ? 'Sjekk' : 'Pass',
      percentage: objectCount > 0 ? (bucket.count / objectCount) * 100 : 0,
    }));
  const sourceColumns = getSourceColumns(binding);
  const sourceColumn = sourceColumns.length === 1 ? sourceColumns[0] : null;
  const summary = {
    layerId: input.layerId,
    datasetRevision,
    geometryScope: input.geometryScope,
    canonicalFieldId: input.canonicalFieldId,
    ruleId: rule.ruleId,
    bindingState: binding?.state || BindingState.FIELD_ABSENT,
    sourceColumn,
    sourceColumns,
    objectCount,
    withValueCount,
    missingCount,
    unresolvedCount,
    uniqueValueCount: rows.length,
    rows: rows.slice(0, MAX_VISIBLE_ROWS),
    omittedRowCount: Math.max(0, rows.length - MAX_VISIBLE_ROWS),
    maxVisibleRows: MAX_VISIBLE_ROWS,
  };
  return freeze(summary);
}

/**
 * Aggregate one canonical field only when the field-data tab requests it.
 * The existing immutable result owns schema binding and freshness; this helper
 * only enumerates the selected geometry and reuses A3/A4 evidence.
 */
export function getValidationV2FieldDataSummary(input) {
  assertInput(input);
  const datasetRevision = getDatasetRevision(input.dataset);
  if (!isCurrentValidationV2Result(input.result, input.layerId, datasetRevision)) {
    throw new Error('field data requires the current Validator 2.0 result');
  }
  const rule = input.rule || getValidationRule(input.ruleId);
  if (!rule || rule.canonicalFieldId !== input.canonicalFieldId || !rule.geometryScopes.includes(input.geometryScope)) {
    throw new Error('field data rule does not match the requested field and geometry');
  }
  if (rule.fieldDataEnabled === false) {
    throw new Error('field data is disabled for relationship rules');
  }
  const binding = getBinding(input.result, input.canonicalFieldId, input.geometryScope);
  let cache = datasetCaches.get(input.dataset);
  if (!cache) {
    cache = new Map();
    datasetCaches.set(input.dataset, cache);
  }
  const cacheKey = getCacheKey({ ...input, datasetRevision, rule, binding });
  const cached = cache.get(cacheKey);
  if (cached) {
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);
    return cached;
  }
  const summary = scanFieldData(input, rule, binding, datasetRevision);
  cache.set(cacheKey, summary);
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  return summary;
}

export function getValidationV2FieldDataCacheStats(dataset) {
  return { size: datasetCaches.get(dataset)?.size || 0, maxEntries: MAX_CACHE_ENTRIES };
}

export function clearValidationV2FieldDataCache() {
  datasetCaches = new WeakMap();
}
