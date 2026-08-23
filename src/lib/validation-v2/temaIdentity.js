import {
  BindingState,
  GMI_SOURCE_FORMAT,
  MappingKind,
  ObjectValueState,
  TemaIdentityState,
} from './contracts.js';
import { assertObjectRefOwnership } from './objectRef.js';
import { getCanonicalField } from './registry/registry.js';
import { isMissingValue } from './valueSemantics.js';

const ACCEPTED_MAPPING_KINDS = new Set([
  MappingKind.DIRECT,
  MappingKind.CASE_NORMALIZED,
  MappingKind.ACCEPTED_FALLBACK,
]);
const UNSUPPORTED_MAPPING_KIND = MappingKind.UNSUPPORTED_CANDIDATE;
const TEMA_CANONICAL_FIELD_ID = 'tema';

function assertInputObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('resolveGmiTemaIdentity requires an input object');
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

function getTemaBinding(schemaBinding, geometryScope) {
  const matches = schemaBinding.bindings.filter(
    (binding) =>
      binding.canonicalFieldId === TEMA_CANONICAL_FIELD_ID &&
      binding.geometryScope === geometryScope
  );
  if (matches.length !== 1) {
    throw new Error('schemaBinding must contain exactly one Tema binding for the object geometry');
  }
  const binding = matches[0];
  if (
    binding.layerId !== schemaBinding.layerId ||
    binding.datasetRevision !== schemaBinding.datasetRevision ||
    binding.sourceFormat !== GMI_SOURCE_FORMAT
  ) {
    throw new Error('Tema binding ownership does not match schemaBinding');
  }
  if (!Array.isArray(binding.candidates)) {
    throw new TypeError('Tema binding must contain candidates');
  }
  return binding;
}

function getAcceptedCandidates(binding) {
  const accepted = binding.candidates.filter((candidate) =>
    ACCEPTED_MAPPING_KINDS.has(candidate.mappingKind)
  );
  for (const candidate of accepted) {
    if (
      candidate.canonicalFieldId !== TEMA_CANONICAL_FIELD_ID ||
      typeof candidate.sourceKey !== 'string' ||
      candidate.sourceKey.length === 0
    ) {
      throw new Error('Tema binding contains an invalid accepted candidate');
    }
  }
  return accepted;
}

function getUnresolvedCandidates(binding) {
  return binding.candidates.filter((candidate) => {
    if (candidate.mappingKind !== UNSUPPORTED_MAPPING_KIND) {
      return false;
    }
    if (candidate.canonicalFieldId !== TEMA_CANONICAL_FIELD_ID) {
      throw new Error('Tema binding contains an invalid unsupported candidate');
    }
    return true;
  });
}

function copyUnresolvedCandidate(candidate) {
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

function observeCandidate(attributes, candidate) {
  const propertyPresent = Object.prototype.hasOwnProperty.call(
    attributes,
    candidate.sourceKey
  );
  const rawValue = propertyPresent ? attributes[candidate.sourceKey] : undefined;
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
    propertyName === 'resolvedValue'
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
  bindingState,
  state,
  resolvedValue = null,
  preferredSourceKey = null,
  mappingKind = null,
  observations = [],
  conflicts = [],
  unresolvedCandidates = [],
}) {
  return deepFreeze({
    layerId,
    datasetRevision,
    sourceFormat: GMI_SOURCE_FORMAT,
    objectRef,
    canonicalFieldId: TEMA_CANONICAL_FIELD_ID,
    bindingState,
    state,
    resolvedValue,
    preferredSourceKey,
    mappingKind,
    observations,
    conflicts,
    unresolvedCandidates,
  });
}

/**
 * Resolve canonical Tema identity for one existing ObjectRef and one exact
 * A1 binding result. Only accepted Tema/S_FCODE properties are read.
 *
 * @param {Object} input
 * @param {string} input.layerId
 * @param {Object} input.dataset
 * @param {string} input.datasetRevision
 * @param {'gmi'} input.sourceFormat
 * @param {Object} input.schemaBinding
 * @param {import('./contracts.js').ObjectRef} input.objectRef
 * @returns {import('./contracts.js').TemaIdentityResult}
 */
export function resolveGmiTemaIdentity(input) {
  assertInputObject(input);
  const {
    layerId,
    dataset,
    datasetRevision,
    sourceFormat,
    schemaBinding,
    objectRef,
  } = input;
  assertNonEmptyString(layerId, 'layerId');
  assertNonEmptyString(datasetRevision, 'datasetRevision');
  if (sourceFormat !== GMI_SOURCE_FORMAT) {
    throw new TypeError('sourceFormat must be exactly gmi');
  }
  assertDataset(dataset);
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

  const binding = getTemaBinding(schemaBinding, objectRef.geometryScope);
  const canonicalTema = getCanonicalField(TEMA_CANONICAL_FIELD_ID);
  if (!canonicalTema) {
    throw new Error('canonical Tema field is unavailable');
  }

  if (binding.state === BindingState.SCHEMA_UNAVAILABLE) {
    throw new Error('cannot resolve Tema when schema is unavailable');
  }
  if (binding.state === BindingState.AMBIGUOUS) {
    throw new Error('cannot resolve Tema from an ambiguous schema binding');
  }

  const acceptedCandidates = getAcceptedCandidates(binding);
  const unresolvedCandidates = getUnresolvedCandidates(binding).map(
    copyUnresolvedCandidate
  );
  if (binding.state === BindingState.UNRESOLVED_SOURCE) {
    if (acceptedCandidates.length > 0) {
      throw new Error('unresolved Tema binding cannot contain accepted candidates');
    }
    return createResult({
      layerId,
      datasetRevision,
      objectRef,
      bindingState: binding.state,
      state: TemaIdentityState.UNRESOLVED_SOURCE,
      unresolvedCandidates,
    });
  }
  if (binding.state === BindingState.FIELD_ABSENT) {
    if (acceptedCandidates.length > 0 || unresolvedCandidates.length > 0) {
      throw new Error('absent Tema binding contains source candidates');
    }
    return createResult({
      layerId,
      datasetRevision,
      objectRef,
      bindingState: binding.state,
      state: TemaIdentityState.MISSING,
    });
  }
  if (
    binding.state !== BindingState.BOUND &&
    binding.state !== BindingState.MULTIPLE_ACCEPTED
  ) {
    throw new Error('unsupported Tema binding state');
  }
  if (acceptedCandidates.length === 0) {
    throw new Error('accepted Tema binding has no accepted candidates');
  }

  const object = geometryCollection[objectRef.sourceIndex];
  const attributes = object && object.attributes;
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    throw new TypeError('feature.attributes must be an object container for bound Tema resolution');
  }
  const safeAttributes = attributes;
  const observations = acceptedCandidates.map((candidate) =>
    observeCandidate(safeAttributes, candidate)
  );
  const presentObservations = observations.filter(
    (observation) => observation.valueState === ObjectValueState.VALUE_PRESENT
  );

  if (presentObservations.length === 0) {
    return createResult({
      layerId,
      datasetRevision,
      objectRef,
      bindingState: binding.state,
      state: TemaIdentityState.MISSING,
      observations,
      unresolvedCandidates,
    });
  }

  const firstValue = presentObservations[0].rawValue;
  const valuesAgree = presentObservations.every((observation) =>
    Object.is(observation.rawValue, firstValue)
  );
  if (!valuesAgree) {
    return createResult({
      layerId,
      datasetRevision,
      objectRef,
      bindingState: binding.state,
      state: TemaIdentityState.CONFLICT,
      observations,
      conflicts: presentObservations,
      unresolvedCandidates,
    });
  }

  const preferred = presentObservations[0];
  return createResult({
    layerId,
    datasetRevision,
    objectRef,
    bindingState: binding.state,
    state: TemaIdentityState.RESOLVED,
    resolvedValue: preferred.rawValue,
    preferredSourceKey: preferred.sourceKey,
    mappingKind: preferred.mappingKind,
    observations,
    unresolvedCandidates,
  });
}
