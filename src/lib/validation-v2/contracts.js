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
 * Rule evaluation outcomes. These are separate from object and binding states.
 */
export const EvaluationState = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  NOT_EVALUATED: 'NOT_EVALUATED',
  INDETERMINATE: 'INDETERMINATE',
});

/**
 * Generic evaluator kinds used by the first V2 rule set.
 */
export const RuleEvaluatorKind = Object.freeze({
  REQUIRED: 'REQUIRED',
  ALLOWED_VALUE: 'ALLOWED_VALUE',
});

/**
 * Source provenance for rule definitions.
 */
export const RuleProvenance = Object.freeze({
  STANDARD: 'STANDARD',
});

/**
 * Fixed severity metadata for the first source-backed rule set.
 */
export const RuleSeverity = Object.freeze({
  ERROR: 'ERROR',
});

/**
 * Stable categories for the first source-backed rule set.
 */
export const RuleCategory = Object.freeze({
  REQUIRED_FIELD: 'REQUIRED_FIELD',
  ALLOWED_VALUE: 'ALLOWED_VALUE',
});

/**
 * Stable machine-readable reason codes for rule findings.
 */
export const RuleReasonCode = Object.freeze({
  REQUIRED_FIELD_ABSENT: 'REQUIRED_FIELD_ABSENT',
  REQUIRED_VALUE_MISSING: 'REQUIRED_VALUE_MISSING',
  VALUE_NOT_ALLOWED: 'VALUE_NOT_ALLOWED',
  BINDING_AMBIGUOUS: 'BINDING_AMBIGUOUS',
  UNRESOLVED_SOURCE: 'UNRESOLVED_SOURCE',
  SCHEMA_UNAVAILABLE: 'SCHEMA_UNAVAILABLE',
  TEMA_CONFLICT: 'TEMA_CONFLICT',
});

/**
 * Classification for source-field diagnostics that are not accepted canonical
 * evidence.
 */
export const SourceFieldDiagnosticKind = Object.freeze({
  RECOGNIZED_UNRESOLVED: 'RECOGNIZED_UNRESOLVED',
  DISABLED_UNSUPPORTED: 'DISABLED_UNSUPPORTED',
  UNKNOWN_SOURCE_FIELD: 'UNKNOWN_SOURCE_FIELD',
});

/**
 * The only source format represented by the A0 input contract.
 */
export const GMI_SOURCE_FORMAT = 'gmi';

/**
 * @typedef {Object} GmiLayerAdapterInput
 * @property {string} layerId Non-empty browser-local identity of the selected layer.
 * @property {Object} dataset The exact parsed dataset owned by layerId.
 * @property {string} datasetRevision Non-empty caller-provided ownership and staleness identity.
 * @property {'gmi'} sourceFormat The source format; must be GMI for this contract.
 */

/**
 * @typedef {Object} LayerFieldBinding
 * @property {string} layerId Exact owner of the bound dataset.
 * @property {string} datasetRevision Non-empty staleness identity for that owner dataset.
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
 * @typedef {Object} TemaCandidateObservation
 * @property {string} sourceKey Literal accepted Tema source key.
 * @property {'DIRECT'|'CASE_NORMALIZED'|'ACCEPTED_FALLBACK'} mappingKind
 * @property {'DELIVERED_GMI_PROPERTY'} sourceKind
 * @property {boolean} validationAuthoritative
 * @property {'AUTHORITATIVE'} authorityState
 * @property {'HIGH'|'MEDIUM'|'LOW'} confidence
 * @property {boolean} propertyPresent Whether the object owns this source key.
 * @property {'VALUE_PRESENT'|'VALUE_MISSING'} valueState
 * @property {*} rawValue Unmodified value, when present.
 */

/**
 * @typedef {Object} TemaIdentityResult
 * @property {string} layerId
 * @property {string} datasetRevision
 * @property {'gmi'} sourceFormat
 * @property {ObjectRef} objectRef
 * @property {'tema'} canonicalFieldId
 * @property {'BOUND'|'MULTIPLE_ACCEPTED'|'FIELD_ABSENT'|'UNRESOLVED_SOURCE'} bindingState
 * @property {'RESOLVED'|'MISSING'|'CONFLICT'|'UNRESOLVED_SOURCE'} state
 * @property {*} resolvedValue Present only as a usable resolved identity value.
 * @property {string|null} preferredSourceKey
 * @property {'DIRECT'|'CASE_NORMALIZED'|'ACCEPTED_FALLBACK'|null} mappingKind
 * @property {Array<TemaCandidateObservation>} observations
 * @property {Array<TemaCandidateObservation>} conflicts
 * @property {Array<Object>} unresolvedCandidates
 */

/**
 * @typedef {Object} SourceFieldDiagnostic
 * @property {string} layerId
 * @property {string} datasetRevision Non-empty caller-provided revision identity.
 * @property {'point'|'line'} geometryScope
 * @property {string} sourceKey Literal schema key.
 * @property {'RECOGNIZED_UNRESOLVED'|'DISABLED_UNSUPPORTED'|'UNKNOWN_SOURCE_FIELD'} classification
 * @property {string|null} canonicalFieldId Set when there is one possible known target.
 * @property {Array<string>} possibleCanonicalFieldIds Known possible targets.
 * @property {'UNSUPPORTED_CANDIDATE'|null} mappingKind
 * @property {'DELIVERED_GMI_PROPERTY'} sourceKind
 * @property {boolean|null} validationAuthoritative
 * @property {'AUTHORITATIVE'|'NON_AUTHORITATIVE'|'UNRESOLVED'} authorityState
 * @property {'HIGH'|'MEDIUM'|'LOW'} confidence
 */

/**
 * @typedef {Object} GmiLayerSchemaBindingResult
 * @property {string} layerId
 * @property {string} datasetRevision Non-empty caller-provided revision identity.
 * @property {'gmi'} sourceFormat
 * @property {{point: Object, line: Object}} geometryContexts
 * @property {Array<LayerFieldBinding>} bindings
 * @property {Array<SourceFieldDiagnostic>} sourceFieldDiagnostics
 */

/**
 * @typedef {Object} ValidationFinding
 * @property {string} ruleId
 * @property {RuleDefinition} rule
 * @property {'FAIL'|'INDETERMINATE'} state
 * @property {ObjectRef} objectRef
 * @property {string} canonicalFieldId
 * @property {'point'|'line'} geometryScope
 * @property {string} reasonCode
 * @property {Object} observed
 * @property {Array<*>|null} expectedValues
 */

/**
 * @typedef {Object} ObjectRef
 * @property {string} key Layer-qualified ephemeral identity.
 * @property {string} layerId Exact owner layer.
 * @property {string} datasetRevision Non-empty staleness identity for the exact run dataset.
 * @property {'point'|'line'} geometryScope Geometry-local identity context.
 * @property {'point'|'line'} geometryType Always equal to geometryScope.
 * @property {number} sourceIndex Zero-based index only within this layer, revision, and geometry.
 * @property {{kind: 'index', value: number}} localIdentity Index-only identity.
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
 * @property {Array<Object>} schemaCandidates Accepted schema candidates.
 * @property {Array<Object>} unresolvedCandidates Unsupported source candidates.
 */

/**
 * @typedef {Object} RuleDefinition
 * @property {string} ruleId
 * @property {string} canonicalFieldId
 * @property {Array<'point'|'line'>} geometryScopes
 * @property {'REQUIRED'|'ALLOWED_VALUE'} evaluatorKind
 * @property {'REQUIRED_FIELD'|'ALLOWED_VALUE'} category
 * @property {string} title
 * @property {string} description
 * @property {'ERROR'} severity
 * @property {'STANDARD'} provenance
 * @property {{document: string, pages: string}} source
 * @property {Array<*>} allowedValues
 */

/**
 * @typedef {Object} RuleResult
 * @property {RuleDefinition} rule
 * @property {number} evaluatedObjectCount
 * @property {number} passCount
 * @property {number} failCount
 * @property {number} notEvaluatedCount
 * @property {number} indeterminateCount
 * @property {Array<Object>} findings
 * @property {Array<ObjectRef>} affectedObjectRefs
 */

/**
 * @typedef {Object} ValidationRunV2
 * @property {string} layerId
 * @property {string} datasetRevision
 * @property {'gmi'} sourceFormat
 * @property {Object} schemaBinding
 * @property {Array<SourceFieldDiagnostic>} sourceFieldDiagnostics
 * @property {Array<RuleResult>} ruleResults
 * @property {Object} summary
 */
