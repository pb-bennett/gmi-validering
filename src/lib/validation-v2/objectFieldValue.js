import {
  AuthorityState,
  BindingState,
  GMI_SOURCE_FORMAT,
  MappingKind,
  ObjectValueState,
  SourceKind,
} from './contracts.js';
import { assertObjectRefOwnership } from './objectRef.js';
import { getCanonicalField } from './registry/registry.js';
import { isMissingValue } from './valueSemantics.js';
import { GMI_SOURCE_LEXEMES } from '../parsing/gmiLexicalEvidence.js';

const ACCEPTED_MAPPING_KINDS = new Set([
  MappingKind.DIRECT,
  MappingKind.CASE_NORMALIZED,
  MappingKind.ACCEPTED_FALLBACK,
]);
const UNSUPPORTED_MAPPING_KIND = MappingKind.UNSUPPORTED_CANDIDATE;

function assertInputObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('extractGmiObjectFieldValue requires an input object');
  }
}

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertDataset(dataset) {
  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) {
    throw new TypeError('dataset must be an object');
  }
  if (!Array.isArray(dataset.points) || !Array.isArray(dataset.lines)) {
    throw new TypeError('dataset must contain points and lines arrays');
  }
}

function assertSchemaBinding(schemaBinding, layerId, datasetRevision) {
  if (!schemaBinding || typeof schemaBinding !== 'object' || Array.isArray(schemaBinding)) {
    throw new TypeError('schemaBinding must be an A1 schema-binding result');
  }
  if (schemaBinding.layerId !== layerId) {
    throw new Error('schemaBinding belongs to a different layer');
  }
  if (schemaBinding.datasetRevision !== datasetRevision) {
    throw new Error('schemaBinding belongs to a different dataset revision');
  }
  if (schemaBinding.sourceFormat !== GMI_SOURCE_FORMAT) {
    throw new Error('schemaBinding has an unsupported source format');
  }
  if (!Array.isArray(schemaBinding.bindings)) {
    throw new TypeError('schemaBinding must contain bindings');
  }
}

function assertCanonicalField(canonicalFieldId) {
  assertNonEmptyString(canonicalFieldId, 'canonicalFieldId');
  const field = getCanonicalField(canonicalFieldId);
  if (!field) {
    throw new Error(`unknown canonicalFieldId ${canonicalFieldId}`);
  }
  return field;
}

function getFieldBinding(schemaBinding, canonicalFieldId, geometryScope) {
  const matches = schemaBinding.bindings.filter(
    (binding) =>
      binding.canonicalFieldId === canonicalFieldId &&
      binding.geometryScope === geometryScope
  );
  if (matches.length !== 1) {
    throw new Error('schemaBinding must contain exactly one binding for the requested field and geometry');
  }
  const binding = matches[0];
  if (
    binding.layerId !== schemaBinding.layerId ||
    binding.datasetRevision !== schemaBinding.datasetRevision ||
    binding.sourceFormat !== GMI_SOURCE_FORMAT
  ) {
    throw new Error('field binding ownership does not match schemaBinding');
  }
  if (!Array.isArray(binding.candidates)) {
    throw new TypeError('field binding must contain candidates');
  }
  return binding;
}

function getAcceptedCandidates(binding, canonicalFieldId) {
  const accepted = binding.candidates.filter((candidate) =>
    ACCEPTED_MAPPING_KINDS.has(candidate.mappingKind)
  );
  for (const candidate of accepted) {
    if (
      candidate.canonicalFieldId !== canonicalFieldId ||
      typeof candidate.sourceKey !== 'string' ||
      candidate.sourceKey.length === 0
    ) {
      throw new Error('field binding contains an invalid accepted candidate');
    }
  }
  return accepted;
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

function getUnresolvedCandidates(binding, canonicalFieldId) {
  return binding.candidates.filter((candidate) => {
    if (candidate.mappingKind !== UNSUPPORTED_MAPPING_KIND) {
      return false;
    }
    if (candidate.canonicalFieldId !== canonicalFieldId) {
      throw new Error('field binding contains an invalid unsupported candidate');
    }
    return true;
  }).map(copySchemaCandidate);
}

function observeCandidate(attributes, candidate) {
  const propertyPresent = Object.prototype.hasOwnProperty.call(
    attributes,
    candidate.sourceKey
  );
  const rawValue = propertyPresent ? attributes[candidate.sourceKey] : undefined;
  const sourceLexemes = attributes[GMI_SOURCE_LEXEMES];
  const sourceLexeme = sourceLexemes && Object.prototype.hasOwnProperty.call(
    sourceLexemes,
    candidate.sourceKey,
  )
    ? sourceLexemes[candidate.sourceKey]
    : 'UNAVAILABLE';
  return {
    sourceKey: candidate.sourceKey,
    mappingKind: candidate.mappingKind,
    sourceKind: candidate.sourceKind,
    validationAuthoritative: candidate.validationAuthoritative,
    authorityState: candidate.authorityState,
    confidence: candidate.confidence,
    propertyPresent,
    valueState: isMissingValue(rawValue)
      ? ObjectValueState.VALUE_MISSING
      : ObjectValueState.VALUE_PRESENT,
    rawValue,
    sourceLexeme,
  };
}

function deepFreeze(value, propertyName) {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.isFrozen(value) ||
    propertyName === 'datasetRevision' ||
    propertyName === 'objectRef' ||
    propertyName === 'rawValue' ||
    propertyName === 'sourceValue'
  ) {
    return value;
  }
  Object.freeze(value);
  for (const [key, child] of Object.entries(value)) {
    deepFreeze(child, key);
  }
  return value;
}

function createResult({
  layerId,
  datasetRevision,
  objectRef,
  canonicalFieldId,
  bindingState,
  state,
  sourceKey = null,
  mappingKind = null,
  sourceKind = SourceKind.UNKNOWN,
  validationAuthoritative = null,
  authorityState = AuthorityState.UNRESOLVED,
  confidence = 'LOW',
  sourceValue,
  sourceLexeme = 'UNAVAILABLE',
  candidates = [],
  conflicts = [],
  unresolvedCandidates = [],
  schemaCandidates = [],
}) {
  return deepFreeze({
    objectRef,
    canonicalFieldId,
    state,
    bindingState,
    sourceKey,
    mappingKind,
    sourceKind,
    validationAuthoritative,
    authorityState,
    confidence,
    sourceValue,
    sourceLexeme,
    normalizedValue: null,
    lexicalFlags: [],
    candidates,
    conflicts,
    unresolvedCandidates,
    schemaCandidates,
    layerId,
    datasetRevision,
    sourceFormat: GMI_SOURCE_FORMAT,
  });
}

/**
 * Extract one raw canonical field value for one existing layer-qualified
 * ObjectRef and one compatible A1 schema-binding result.
 *
 * @param {Object} input
 * @param {string} input.layerId
 * @param {Object} input.dataset
 * @param {string} input.datasetRevision
 * @param {'gmi'} input.sourceFormat
 * @param {Object} input.schemaBinding
 * @param {import('./contracts.js').ObjectRef} input.objectRef
 * @param {string} input.canonicalFieldId
 * @returns {import('./contracts.js').ObjectFieldValue}
 */
export function extractGmiObjectFieldValue(input) {
  assertInputObject(input);
  const {
    layerId,
    dataset,
    datasetRevision,
    sourceFormat,
    schemaBinding,
    objectRef,
    canonicalFieldId,
  } = input;
  assertNonEmptyString(layerId, 'layerId');
  assertNonEmptyString(datasetRevision, 'datasetRevision');
  if (sourceFormat !== GMI_SOURCE_FORMAT) {
    throw new TypeError('sourceFormat must be exactly gmi');
  }
  assertDataset(dataset);
  const canonicalField = assertCanonicalField(canonicalFieldId);
  assertSchemaBinding(schemaBinding, layerId, datasetRevision);
  assertObjectRefOwnership({
    objectRef,
    layerId,
    datasetRevision,
    geometryScope: objectRef?.geometryScope,
  });

  const geometryCollection = objectRef.geometryScope === 'point'
    ? dataset.points
    : dataset.lines;
  if (objectRef.sourceIndex >= geometryCollection.length) {
    throw new RangeError('objectRef sourceIndex is outside the selected dataset geometry');
  }

  const binding = getFieldBinding(
    schemaBinding,
    canonicalField.canonicalFieldId,
    objectRef.geometryScope
  );
  const unresolvedCandidates = getUnresolvedCandidates(
    binding,
    canonicalField.canonicalFieldId
  );
  const schemaCandidates = binding.candidates
    .filter((candidate) => ACCEPTED_MAPPING_KINDS.has(candidate.mappingKind))
    .map(copySchemaCandidate);

  if (binding.state === BindingState.FIELD_ABSENT) {
    if (binding.candidates.length > 0) {
      throw new Error('absent field binding contains source candidates');
    }
    return createResult({
      layerId,
      datasetRevision,
      objectRef,
      canonicalFieldId: canonicalField.canonicalFieldId,
      bindingState: binding.state,
      state: ObjectValueState.FIELD_ABSENT,
    });
  }
  if (binding.state === BindingState.SCHEMA_UNAVAILABLE) {
    if (binding.candidates.length > 0) {
      throw new Error('unavailable field binding contains source candidates');
    }
    return createResult({
      layerId,
      datasetRevision,
      objectRef,
      canonicalFieldId: canonicalField.canonicalFieldId,
      bindingState: binding.state,
      state: ObjectValueState.SCHEMA_UNAVAILABLE,
    });
  }
  if (binding.state === BindingState.UNRESOLVED_SOURCE) {
    if (getAcceptedCandidates(binding, canonicalField.canonicalFieldId).length > 0) {
      throw new Error('unresolved field binding contains accepted candidates');
    }
    return createResult({
      layerId,
      datasetRevision,
      objectRef,
      canonicalFieldId: canonicalField.canonicalFieldId,
      bindingState: binding.state,
      state: ObjectValueState.UNRESOLVED_SOURCE,
      unresolvedCandidates,
      schemaCandidates,
    });
  }
  if (binding.state === BindingState.AMBIGUOUS) {
    return createResult({
      layerId,
      datasetRevision,
      objectRef,
      canonicalFieldId: canonicalField.canonicalFieldId,
      bindingState: binding.state,
      state: ObjectValueState.BINDING_AMBIGUOUS,
      unresolvedCandidates,
      schemaCandidates,
      conflicts: Array.isArray(binding.conflicts)
        ? binding.conflicts.map((conflict) => ({
          sourceKeys: [...conflict.sourceKeys],
          canonicalFieldIds: [...conflict.canonicalFieldIds],
        }))
        : [],
    });
  }
  if (
    binding.state !== BindingState.BOUND &&
    binding.state !== BindingState.MULTIPLE_ACCEPTED
  ) {
    throw new Error('unsupported field binding state');
  }

  const acceptedCandidates = getAcceptedCandidates(binding, canonicalField.canonicalFieldId);
  if (acceptedCandidates.length === 0) {
    throw new Error('bound field binding has no accepted candidates');
  }
  const object = geometryCollection[objectRef.sourceIndex];
  const attributes = object && object.attributes;
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    throw new TypeError('feature.attributes must be an object container for bound field extraction');
  }
  const candidates = acceptedCandidates.map((candidate) =>
    observeCandidate(attributes, candidate)
  );
  const presentCandidates = candidates.filter(
    (candidate) => candidate.valueState === ObjectValueState.VALUE_PRESENT
  );

  if (presentCandidates.length === 0) {
    const preferred = acceptedCandidates[0];
    return createResult({
      layerId,
      datasetRevision,
      objectRef,
      canonicalFieldId: canonicalField.canonicalFieldId,
      bindingState: binding.state,
      state: ObjectValueState.VALUE_MISSING,
      sourceKey: preferred.sourceKey,
      mappingKind: preferred.mappingKind,
      sourceKind: preferred.sourceKind,
      validationAuthoritative: preferred.validationAuthoritative,
      authorityState: preferred.authorityState,
      confidence: preferred.confidence,
      sourceValue: undefined,
      sourceLexeme: preferred.sourceLexeme,
      candidates,
      unresolvedCandidates,
      schemaCandidates,
    });
  }

  const firstValue = presentCandidates[0].rawValue;
  const valuesAgree = presentCandidates.every((candidate) =>
    Object.is(candidate.rawValue, firstValue)
  );
  if (!valuesAgree) {
    return createResult({
      layerId,
      datasetRevision,
      objectRef,
      canonicalFieldId: canonicalField.canonicalFieldId,
      bindingState: binding.state,
      state: ObjectValueState.BINDING_AMBIGUOUS,
      sourceValue: undefined,
      candidates,
      conflicts: presentCandidates,
      unresolvedCandidates,
      schemaCandidates,
    });
  }

  const preferred = presentCandidates[0];
  return createResult({
    layerId,
    datasetRevision,
    objectRef,
    canonicalFieldId: canonicalField.canonicalFieldId,
    bindingState: binding.state,
    state: ObjectValueState.VALUE_PRESENT,
    sourceKey: preferred.sourceKey,
    mappingKind: preferred.mappingKind,
    sourceKind: preferred.sourceKind,
    validationAuthoritative: preferred.validationAuthoritative,
    authorityState: preferred.authorityState,
    confidence: preferred.confidence,
    sourceValue: preferred.rawValue,
    sourceLexeme: preferred.sourceLexeme,
    candidates,
    unresolvedCandidates,
    schemaCandidates,
  });
}
