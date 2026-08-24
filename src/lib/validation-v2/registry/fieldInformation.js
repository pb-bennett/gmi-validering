import fieldInformationData from '../../../data/validation-v2/field-information.json' with { type: 'json' };
import { getCanonicalField } from './registry.js';

const REQUIRED_FIELD_INFORMATION = Object.freeze([
  'heightReference',
  'installationYear',
  'captureDate',
  'surveyedBy',
  'caseNumber',
  'horizontalAccuracy',
  'verticalAccuracy',
  'maxHorizontalDeviation',
  'maxVerticalDeviation',
  'positioningCondition',
  'positioningCause',
  'visibility',
  'tema',
  'insideOutside',
  'wallThickness',
  'nobbVavvsNumber',
  'nobbVavvsFrameNumber',
  'dimension',
  'networkType',
  'pipeShape',
]);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export function validateFieldInformationRegistry(entries = fieldInformationData) {
  if (!Array.isArray(entries)) throw new Error('Validator 2.0 field information must be an array');
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') throw new Error('Validator 2.0 field information entry must be an object');
    if (!entry.canonicalFieldId || ids.has(entry.canonicalFieldId)) {
      throw new Error(`Duplicate or missing field information ID: ${entry.canonicalFieldId || '?'}`);
    }
    if (!entry.displayName || !Array.isArray(entry.appliesTo)) {
      throw new Error(`Incomplete field information: ${entry.canonicalFieldId}`);
    }
    if (!entry.appliesTo.every((scope) => scope === 'point' || scope === 'line')) {
      throw new Error(`Invalid field information geometry: ${entry.canonicalFieldId}`);
    }
    if (!['COMPLETE', 'PARTIAL', 'MISSING'].includes(entry.documentationStatus)) {
      throw new Error(`Invalid documentation status: ${entry.canonicalFieldId}`);
    }
    if (!['VERIFIED_SOURCE_REFERENCE', 'TRACEABILITY_PENDING'].includes(entry.sourceStatus)) {
      throw new Error(`Invalid source status: ${entry.canonicalFieldId}`);
    }
    if (!Array.isArray(entry.sources)) throw new Error(`Sources must be an array: ${entry.canonicalFieldId}`);
    for (const source of entry.sources) {
      if (!source || !source.documentId || !source.pages || !Array.isArray(source.auditSourceRuleIds)) {
        throw new Error(`Incomplete source reference: ${entry.canonicalFieldId}`);
      }
    }
    if (!entry.valueInfo || typeof entry.valueInfo !== 'object' || Array.isArray(entry.valueInfo)) {
      throw new Error(`Value information must be an object: ${entry.canonicalFieldId}`);
    }
    for (const [value, valueInfo] of Object.entries(entry.valueInfo)) {
      if (!valueInfo || typeof valueInfo.label !== 'string' || !Array.isArray(valueInfo.sources)) {
        throw new Error(`Incomplete value information: ${entry.canonicalFieldId}.${value}`);
      }
    }
    if (entry.byGeometry && Object.keys(entry.byGeometry).some((scope) => !['point', 'line'].includes(scope))) {
      throw new Error(`Invalid geometry overlay: ${entry.canonicalFieldId}`);
    }
    ids.add(entry.canonicalFieldId);
  }
  for (const fieldId of REQUIRED_FIELD_INFORMATION) {
    if (!ids.has(fieldId)) throw new Error(`Missing active field information: ${fieldId}`);
  }
  return true;
}

validateFieldInformationRegistry();

export const FIELD_INFORMATION = deepFreeze(fieldInformationData);
const byId = new Map(FIELD_INFORMATION.map((entry) => [entry.canonicalFieldId, entry]));

export function getFieldInformation(canonicalFieldId) {
  return byId.get(canonicalFieldId);
}

export function composeFieldInformation({ canonicalFieldId, geometryScope, rule }) {
  const information = getFieldInformation(canonicalFieldId);
  const canonicalField = getCanonicalField(canonicalFieldId);
  if (!information || !canonicalField || !rule) return null;
  const overlay = information.byGeometry?.[geometryScope] || {};
  return {
    ...information,
    ...overlay,
    canonicalFieldId,
    displayName: information.displayName,
    directGmiSourceKey: canonicalField.directGmiSourceKey,
    appliesTo: [...information.appliesTo],
    geometryScope,
    required: rule.evaluatorKind !== 'ALLOWED_VALUE',
    requiredness: rule.evaluatorKind !== 'ALLOWED_VALUE' ? 'REQUIRED' : 'NOT_REQUIRED',
    allowedValues: [...(rule.allowedValues || [])],
    ruleId: rule.ruleId,
  };
}

export function getFieldInformationRegistry() {
  return FIELD_INFORMATION;
}
