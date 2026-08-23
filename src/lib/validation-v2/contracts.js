/**
 * Stable geometry scopes used by Validator 2.0 field bindings and rules.
 */
export const GeometryScope = Object.freeze({
  POINT: 'point',
  LINE: 'line',
});

/**
 * Schema binding outcomes. These describe structure, not validation results.
 */
export const BindingState = Object.freeze({
  BOUND: 'BOUND',
  MULTIPLE_ACCEPTED: 'MULTIPLE_ACCEPTED',
  FIELD_ABSENT: 'FIELD_ABSENT',
  AMBIGUOUS: 'AMBIGUOUS',
  UNRESOLVED_SOURCE: 'UNRESOLVED_SOURCE',
  SCHEMA_UNAVAILABLE: 'SCHEMA_UNAVAILABLE',
});

/**
 * Per-object value outcomes for a previously established binding.
 */
export const ObjectValueState = Object.freeze({
  VALUE_PRESENT: 'VALUE_PRESENT',
  VALUE_MISSING: 'VALUE_MISSING',
  FIELD_ABSENT: 'FIELD_ABSENT',
  BINDING_AMBIGUOUS: 'BINDING_AMBIGUOUS',
  UNRESOLVED_SOURCE: 'UNRESOLVED_SOURCE',
  SCHEMA_UNAVAILABLE: 'SCHEMA_UNAVAILABLE',
});

/**
 * Identity outcomes for the canonical Tema field.
 */
export const TemaIdentityState = Object.freeze({
  RESOLVED: 'RESOLVED',
  MISSING: 'MISSING',
  CONFLICT: 'CONFLICT',
  UNRESOLVED_SOURCE: 'UNRESOLVED_SOURCE',
});

/**
 * Provenance mapping kinds used by future binding and extraction phases.
 */
export const MappingKind = Object.freeze({
  DIRECT: 'DIRECT',
  CASE_NORMALIZED: 'CASE_NORMALIZED',
  ACCEPTED_FALLBACK: 'ACCEPTED_FALLBACK',
  UNSUPPORTED_CANDIDATE: 'UNSUPPORTED_CANDIDATE',
  DERIVED: 'DERIVED',
});

/**
 * Source provenance kinds.
 */
export const SourceKind = Object.freeze({
  DELIVERED_GMI_PROPERTY: 'DELIVERED_GMI_PROPERTY',
  PARSER_DERIVED: 'PARSER_DERIVED',
  SYNTHETIC: 'SYNTHETIC',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Authority of a source candidate for canonical field identity.
 */
export const AuthorityState = Object.freeze({
  AUTHORITATIVE: 'AUTHORITATIVE',
  NON_AUTHORITATIVE: 'NON_AUTHORITATIVE',
  UNRESOLVED: 'UNRESOLVED',
});

/**
 * Evidence confidence levels.
 */
export const Confidence = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
});

/**
 * Conservative key comparison policy. A policy does not itself perform
 * schema matching.
 */
export const CaseNormalizationPolicy = Object.freeze({
  UNIQUE_CASE_ONLY: 'UNIQUE_CASE_ONLY',
});

/**
 * The only source format represented by the A0 input contract.
 */
export const GMI_SOURCE_FORMAT = 'gmi';

/**
 * @typedef {Object} GmiLayerAdapterInput
 * @property {string} layerId Non-empty browser-local identity of the selected layer.
 * @property {Object} dataset The exact parsed dataset owned by layerId.
 * @property {*} datasetRevision Opaque ownership and staleness identity.
 * @property {'gmi'} sourceFormat The source format; must be GMI for this contract.
 */

/**
 * @typedef {Object} LayerFieldBinding
 * @property {string} layerId Exact owner of the bound dataset.
 * @property {*} datasetRevision Staleness identity for that owner dataset.
 * @property {'gmi'} sourceFormat
 * @property {'point'|'line'} geometryScope
 * @property {string} canonicalFieldId
 * @property {'BOUND'|'MULTIPLE_ACCEPTED'|'FIELD_ABSENT'|'AMBIGUOUS'|'UNRESOLVED_SOURCE'|'SCHEMA_UNAVAILABLE'} state
 * @property {string|null} preferredSourceKey Literal accepted source key, when one exists.
 * @property {'DIRECT'|'CASE_NORMALIZED'|'ACCEPTED_FALLBACK'|'UNSUPPORTED_CANDIDATE'|'DERIVED'|null} mappingKind
 * @property {'DELIVERED_GMI_PROPERTY'|'PARSER_DERIVED'|'SYNTHETIC'|'UNKNOWN'} sourceKind
 * @property {boolean|null} validationAuthoritative
 * @property {'AUTHORITATIVE'|'NON_AUTHORITATIVE'|'UNRESOLVED'} authorityState
 * @property {'HIGH'|'MEDIUM'|'LOW'} confidence
 * @property {Array<Object>} candidates Accepted and recognized unsupported literal candidates.
 * @property {Array<Object>} conflicts Schema ambiguity details only.
 */

/**
 * @typedef {Object} ObjectRef
 * @property {string} key Layer-qualified ephemeral identity.
 * @property {string} layerId Exact owner layer.
 * @property {*} datasetRevision Staleness identity for the exact run dataset.
 * @property {'point'|'line'} geometryType
 * @property {number} sourceIndex Index only within this layer and revision.
 * @property {{kind: 'guid'|'parser-id'|'index', value: string|number}} localIdentity
 * @property {string|number|undefined} parserId Optional delivered/parser identity.
 * @property {string|undefined} guid Optional delivered GUID.
 */

/**
 * @typedef {Object} ObjectFieldValue
 * @property {ObjectRef} objectRef A layer-qualified reference is mandatory.
 * @property {string} canonicalFieldId
 * @property {'VALUE_PRESENT'|'VALUE_MISSING'|'FIELD_ABSENT'|'BINDING_AMBIGUOUS'|'UNRESOLVED_SOURCE'|'SCHEMA_UNAVAILABLE'} state
 * @property {'BOUND'|'MULTIPLE_ACCEPTED'|'FIELD_ABSENT'|'AMBIGUOUS'|'UNRESOLVED_SOURCE'|'SCHEMA_UNAVAILABLE'} bindingState
 * @property {string|null} sourceKey Selected literal source key, when one exists.
 * @property {'DIRECT'|'CASE_NORMALIZED'|'ACCEPTED_FALLBACK'|'UNSUPPORTED_CANDIDATE'|'DERIVED'|null} mappingKind
 * @property {'DELIVERED_GMI_PROPERTY'|'PARSER_DERIVED'|'SYNTHETIC'|'UNKNOWN'} sourceKind
 * @property {boolean|null} validationAuthoritative
 * @property {*} sourceValue Unmodified parser attribute value.
 * @property {string} sourceLexeme Original lexical value or 'UNAVAILABLE'.
 * @property {*} normalizedValue Optional future field-specific value.
 * @property {Array<string>} lexicalFlags Non-validating observations.
 * @property {Array<Object>} candidates
 * @property {Array<Object>} conflicts
 */
