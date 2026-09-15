import { getCanonicalField } from './registry/registry.js';

const RESULT_RANK = Object.freeze({ PASS: 0, CHECK: 1, FAIL: 2 });

function outcomeResult(outcome) {
  if (outcome?.state === 'FAIL') return 'FAIL';
  if (outcome?.state === 'CHECK' || outcome?.state === 'INDETERMINATE') return 'CHECK';
  if (outcome?.state === 'PASS') return 'PASS';
  return null; // NOT_EVALUATED is deliberately outside the evaluated field population.
}

function resolveBoundColumn(field, objects) {
  const keys = [field.directGmiSourceKey, ...(field.acceptedFallbackKeys || [])];
  return keys.find((key) => objects.some((object) => Object.hasOwn(object?.attributes || {}, key)))
    || field.directGmiSourceKey;
}

/** Build Validator's rich request from structured outcomes only. */
export function buildValidatorFieldInspectionRequest({
  layerId, datasetRevision, geometryScope, objects, rules, result, diagnostic, fieldLabel,
}) {
  if (!diagnostic?.hasCompleteExactObjectRefs || !Array.isArray(diagnostic.exactObjectRefs)) return null;
  const ruleIds = new Set((rules || []).map((rule) => rule?.ruleId).filter(Boolean));
  if (!ruleIds.size) return null;
  const refsByKey = new Map();
  const resultByObjectKey = {};
  for (const outcome of result?.outcomes || []) {
    if (!ruleIds.has(outcome.ruleId) || outcome.objectRef?.geometryScope !== geometryScope) continue;
    const status = outcomeResult(outcome);
    if (!status) continue;
    const previous = resultByObjectKey[outcome.objectRef.key];
    if (!previous || RESULT_RANK[status] > RESULT_RANK[previous]) {
      refsByKey.set(outcome.objectRef.key, outcome.objectRef);
      resultByObjectKey[outcome.objectRef.key] = status;
    }
  }
  // A field session is only valid with a complete evaluated population.
  if (!refsByKey.size) return null;
  const canonicalField = diagnostic.field?.canonicalFieldId;
  const currentField = getCanonicalField(canonicalField);
  const temaField = getCanonicalField('tema');
  if (!currentField || !temaField) return null;
  const sourceObjects = Array.isArray(objects) ? objects : [];
  const temaColumn = resolveBoundColumn(temaField, sourceObjects);
  const fieldColumn = resolveBoundColumn(currentField, sourceObjects);
  return {
    scope: {
      kind: 'contextual-object-set', layerId, datasetRevision, geometryScope,
      objectRefs: [...refsByKey.values()],
    },
    contextual: {
      focusObjectRefs: diagnostic.exactObjectRefs,
      resultByObjectKey,
      presentation: { temaColumn, fieldColumn, fieldLabel },
    },
  };
}
