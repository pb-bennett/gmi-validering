import { getDatasetRevision } from './datasetRevision.js';

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

export function isCurrentValidationV2Result(result, layerId, datasetRevision) {
  return Boolean(
    result &&
      result.layerId === layerId &&
      result.datasetRevision === datasetRevision,
  );
}

export function getValidationV2RuleStatus(ruleResult) {
  if (ruleResult.failCount > 0) {
    return { label: 'Må rettes', className: 'text-red-700 bg-red-50 border-red-200' };
  }
  if (ruleResult.indeterminateCount > 0) {
    return { label: 'Må vurderes', className: 'text-amber-700 bg-amber-50 border-amber-200' };
  }
  if (ruleResult.evaluatedObjectCount === 0) {
    return { label: 'Ikke kontrollert', className: 'text-gray-700 bg-gray-50 border-gray-200' };
  }
  if (ruleResult.notEvaluatedCount > 0 && ruleResult.passCount === 0) {
    return { label: 'Ikke kontrollert', className: 'text-gray-700 bg-gray-50 border-gray-200' };
  }
  if (ruleResult.notEvaluatedCount > 0) {
    return { label: 'Delvis kontrollert', className: 'text-gray-700 bg-gray-50 border-gray-200' };
  }
  return { label: 'Bestått', className: 'text-green-700 bg-green-50 border-green-200' };
}
