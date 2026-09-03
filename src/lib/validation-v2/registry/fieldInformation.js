import fieldInformationData from '../../../data/validation-v2/field-information.json' with { type: 'json' };
import { getCanonicalField } from './registry.js';
import {
  HEIGHT_MEASUREMENT_METHOD_VALUES,
  LINE_TEMA_VALUES,
  MATERIAL_VALUES,
  MEASUREMENT_METHOD_VALUES,
  POINT_TEMA_VALUES,
  TYPE_TEMA_COMPATIBILITY_BY_TYPE,
  TYPE_VALUES,
  VERTICAL_LEVEL_VALUES,
} from './rules.js';

const MEASUREMENT_VALUE_INFO = Object.fromEntries(
  MEASUREMENT_METHOD_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '23–25' }],
  }]),
);
const HEIGHT_MEASUREMENT_VALUE_INFO = Object.fromEntries(
  HEIGHT_MEASUREMENT_METHOD_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '25–27' }],
  }]),
);
const VERTICAL_LEVEL_VALUE_INFO = Object.fromEntries(
  VERTICAL_LEVEL_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '4, 9' }],
  }]),
);
const MATERIAL_VALUE_INFO = Object.fromEntries(
  MATERIAL_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '19–21' }],
  }]),
);
const POINT_TEMA_VALUE_INFO = Object.fromEntries(
  POINT_TEMA_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '10–12' }],
  }]),
);
const LINE_TEMA_VALUE_INFO = Object.fromEntries(
  LINE_TEMA_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '16–19' }],
  }]),
);
const TYPE_VALUE_INFO = Object.fromEntries(
  TYPE_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '12–14' }],
  }]),
);
const TYPE_TEMA_COMPATIBILITY_SOURCE = {
  documentId: 'appendix-a',
  pages: '12–14',
  auditSourceRuleIds: [
    'innmaling.point.type.valid',
    'innmaling.point.type-tema.compatible',
  ],
};
const TYPE_TEMA_COMPATIBILITY_INFO = {
  kind: 'ALLOWED_PAIRS',
  inputFieldIds: ['type', 'tema'],
  byType: Object.fromEntries(Object.entries(TYPE_TEMA_COMPATIBILITY_BY_TYPE).map(
    ([type, temaValues]) => [type, {
      temaValues: [...temaValues],
      sources: [{ ...TYPE_TEMA_COMPATIBILITY_SOURCE }],
    }],
  )),
  multiTemaTypes: Object.fromEntries(Object.entries(TYPE_TEMA_COMPATIBILITY_BY_TYPE)
    .filter(([, temaValues]) => temaValues.length > 1)
    .map(([type, temaValues]) => [type, [...temaValues]])),
  sources: [{ ...TYPE_TEMA_COMPATIBILITY_SOURCE }],
};

const FIELD_INFORMATION_WITH_MEASUREMENT_LISTS = fieldInformationData.map((entry) => {
  if (entry.canonicalFieldId === 'measurementMethod') {
    return {
      ...entry,
      documentationStatus: 'COMPLETE',
      qualifications: [],
      valueInfo: MEASUREMENT_VALUE_INFO,
      sources: entry.sources.map((source) => ({
        ...source,
        pages: '4, 6–7, 23–25',
        auditSourceRuleIds: ['innmaling.common.measurement-method.required'],
      })),
    };
  }
  if (entry.canonicalFieldId === 'heightMeasurementMethod') {
    return {
      ...entry,
      documentationStatus: 'COMPLETE',
      qualifications: [],
      valueInfo: HEIGHT_MEASUREMENT_VALUE_INFO,
      sources: entry.sources.map((source) => ({
        ...source,
        pages: '4, 7, 25–27',
        auditSourceRuleIds: ['innmaling.common.height-measurement-method.required'],
      })),
    };
  }
  if (entry.canonicalFieldId === 'verticalLevel') {
    return {
      ...entry,
      documentationStatus: 'COMPLETE',
      qualifications: [],
      valueInfo: VERTICAL_LEVEL_VALUE_INFO,
      sources: entry.sources.map((source) => ({
        ...source,
        pages: '4, 9',
        auditSourceRuleIds: ['innmaling.common.vertical-level.required'],
      })),
    };
  }
  if (entry.canonicalFieldId === 'material') {
    return {
      ...entry,
      documentationStatus: 'COMPLETE',
      qualifications: [],
      valueInfo: MATERIAL_VALUE_INFO,
      sources: entry.sources.map((source) => ({
        ...source,
        pages: '5, 19–21',
        auditSourceRuleIds: ['innmaling.line.material.required'],
      })),
    };
  }
  if (entry.canonicalFieldId === 'tema') {
    return {
      ...entry,
      documentationStatus: 'COMPLETE',
      qualifications: [],
      valueInfo: {},
      byGeometry: {
        ...(entry.byGeometry || {}),
        point: { ...(entry.byGeometry?.point || {}), valueInfo: POINT_TEMA_VALUE_INFO },
        line: { ...(entry.byGeometry?.line || {}), valueInfo: LINE_TEMA_VALUE_INFO },
      },
      sources: entry.sources.map((source) => ({
        ...source,
        pages: '4, 10–12; line 16–19',
        auditSourceRuleIds: [
          'innmaling.point.tema.required',
          'innmaling.line.tema.required',
        ],
      })),
    };
  }
  if (entry.canonicalFieldId === 'type') {
    return {
      ...entry,
      documentationStatus: 'COMPLETE',
      valueInfo: TYPE_VALUE_INFO,
      compatibility: TYPE_TEMA_COMPATIBILITY_INFO,
      sources: entry.sources.map((source) => ({
        ...source,
        pages: '4, 12–14',
        auditSourceRuleIds: [
          'innmaling.point.type.valid',
          'innmaling.point.type-tema.compatible',
        ],
      })),
    };
  }
  return entry;
});

const REQUIRED_FIELD_INFORMATION = Object.freeze([
  'heightReference',
  'measurementMethod',
  'heightMeasurementMethod',
  'verticalLevel',
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
  'tema',
  'insideOutside',
  'wallThickness',
  'material',
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
    if (entry.compatibility) {
      if (
        entry.compatibility.kind !== 'ALLOWED_PAIRS' ||
        !Array.isArray(entry.compatibility.inputFieldIds) ||
        !entry.compatibility.byType ||
        !Array.isArray(entry.compatibility.sources)
      ) {
        throw new Error(`Invalid compatibility information: ${entry.canonicalFieldId}`);
      }
      for (const [type, relationship] of Object.entries(entry.compatibility.byType)) {
        if (!Array.isArray(relationship.temaValues) || !Array.isArray(relationship.sources)) {
          throw new Error(`Invalid compatibility relationship: ${entry.canonicalFieldId}.${type}`);
        }
      }
    }
    ids.add(entry.canonicalFieldId);
  }
  for (const fieldId of REQUIRED_FIELD_INFORMATION) {
    if (!ids.has(fieldId)) throw new Error(`Missing active field information: ${fieldId}`);
  }
  return true;
}

validateFieldInformationRegistry(FIELD_INFORMATION_WITH_MEASUREMENT_LISTS);

export const FIELD_INFORMATION = deepFreeze(FIELD_INFORMATION_WITH_MEASUREMENT_LISTS);
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
    required: rule.evaluatorKind === 'REQUIRED' || rule.evaluatorKind === 'REQUIRED_ALLOWED_VALUE',
    requiredness:
      rule.evaluatorKind === 'REQUIRED' || rule.evaluatorKind === 'REQUIRED_ALLOWED_VALUE'
        ? 'REQUIRED'
        : 'NOT_REQUIRED',
    allowedValues: [...(rule.allowedValues || [])],
    ruleId: rule.ruleId,
  };
}

export function getFieldInformationRegistry() {
  return FIELD_INFORMATION;
}
