import { getDatasetRevision } from './datasetRevision.js';
import { getValidationV2AggregateStatus } from './resultPresentation.js';

export const VALIDATION_V2_SOURCE_FORMAT = 'gmi';

export function isGmiLayer(layer) {
  return layer?.data?.format === 'GMI';
}

/**
 * Build the exact one-layer input expected by the A5 runner.
 */
export function createValidationV2Input(selectedLayer) {
  if (!selectedLayer?.id || !selectedLayer.data || !isGmiLayer(selectedLayer)) {
    return null;
  }

  return {
    layerId: selectedLayer.id,
    dataset: selectedLayer.data,
    datasetRevision: getDatasetRevision(selectedLayer.data),
    sourceFormat: VALIDATION_V2_SOURCE_FORMAT,
  };
}

export function getValidationV2ObjectLabel(objectRef) {
  const label = objectRef?.geometryScope === 'line' ? 'Linje' : 'Punkt';
  const number = Number.isInteger(objectRef?.sourceIndex)
    ? objectRef.sourceIndex + 1
    : '?';
  return `${label} ${number}`;
}

export function getDefaultValidationV2Geometry(layer) {
  if (layer?.data?.points?.length > 0) return 'point';
  if (layer?.data?.lines?.length > 0) return 'line';
  return 'point';
}

export function getValidationV2GeometrySelection(layer, requestedGeometry) {
  if (requestedGeometry === 'point' || requestedGeometry === 'line') {
    return requestedGeometry;
  }
  return getDefaultValidationV2Geometry(layer);
}

export function isCurrentValidationV2Result(result, layerId, datasetRevision) {
  return Boolean(
    result &&
      result.layerId === layerId &&
      result.datasetRevision === datasetRevision,
  );
}

export function getValidationV2RuleStatus(ruleResult) {
  return getValidationV2AggregateStatus({
    evaluatedCount: ruleResult.evaluatedObjectCount,
    passCount: ruleResult.passCount,
    failCount: ruleResult.failCount,
    notEvaluatedCount: ruleResult.notEvaluatedCount,
    indeterminateCount: ruleResult.indeterminateCount,
  });
}

export function getValidationV2GeometryRuleStatus(ruleResult, geometryScope) {
  return getValidationV2AggregateStatus(
    ruleResult.geometryBreakdown?.[geometryScope] || {
      evaluatedCount: 0,
      passCount: 0,
      failCount: 0,
      notEvaluatedCount: 0,
      indeterminateCount: 0,
    },
  );
}

export function getValidationV2GeometrySummary(result, geometryScope) {
  const objectCount = geometryScope === 'point'
    ? result.summary.evaluatedPointCount
    : result.summary.evaluatedLineCount;
  const rules = result.ruleResults.filter((ruleResult) =>
    ruleResult.rule.geometryScopes.includes(geometryScope)
  );
  return rules.reduce(
    (summary, ruleResult) => {
      const counts = ruleResult.geometryBreakdown[geometryScope];
      summary.failCount += counts.failCount;
      summary.indeterminateCount += counts.indeterminateCount;
      summary.findingCount += counts.findingCount;
      return summary;
    },
    { objectCount, failCount: 0, indeterminateCount: 0, findingCount: 0 },
  );
}

function isSafeGroupValue(value) {
  return value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint';
}

function groupValueKey(value) {
  if (Array.isArray(value)) {
    const encodedItems = value.map((item) => {
      const encoded = groupValueKey(item);
      return `${encoded.length}:${encoded}`;
    }).join('');
    return `array:${value.length}:${encodedItems}`;
  }
  if (!isSafeGroupValue(value)) return 'unsupported:0:';
  if (typeof value === 'number') {
    const numberValue = Number.isNaN(value)
      ? 'NaN'
      : Object.is(value, -0)
        ? '-0'
        : String(value);
    return `number:${numberValue.length}:${numberValue}`;
  }
  const primitiveValue = value === null ? 'null' : String(value);
  return `${typeof value}:${primitiveValue.length}:${primitiveValue}`;
}

function getFindingGroupValue(finding) {
  const observed = finding.observed || {};
  if (finding.reasonCode === 'VALUE_NOT_ALLOWED') {
    return observed.sourceValue;
  }
  if (finding.reasonCode === 'TEMA_CONFLICT') {
    return (observed.conflicts || []).map((conflict) => conflict.rawValue);
  }
  if (finding.reasonCode === 'TYPE_TEMA_INCOMPATIBLE') {
    return [observed.type?.sourceValue, observed.tema?.resolvedValue];
  }
  return null;
}

export function groupValidationV2Findings(findings, geometryScope) {
  const groups = new Map();
  for (const finding of findings) {
    if (finding.geometryScope !== geometryScope) continue;
    const value = getFindingGroupValue(finding);
    const key = `${finding.reasonCode}|${groupValueKey(value)}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        reasonCode: finding.reasonCode,
        observedValue:
          (finding.reasonCode === 'VALUE_NOT_ALLOWED' && isSafeGroupValue(value)) ||
          (finding.reasonCode === 'TYPE_TEMA_INCOMPATIBLE' && Array.isArray(value))
            ? value
            : null,
        findings: [],
      };
      groups.set(key, group);
    }
    group.findings.push(finding);
  }
  return [...groups.values()];
}

export function getValidationV2GeometryView(result, geometryScope) {
  return {
    result,
    geometryScope,
    summary: getValidationV2GeometrySummary(result, geometryScope),
    ruleResults: result.ruleResults.filter((ruleResult) =>
      ruleResult.rule.geometryScopes.includes(geometryScope)
    ),
  };
}
