import {
  AuthorityState,
  BindingState,
  CaseNormalizationPolicy,
  Confidence,
  GeometryScope,
  MappingKind,
  ObjectValueState,
  SourceKind,
  SourceFieldDiagnosticKind,
  TemaIdentityState,
} from '../contracts.js';
import { CANONICAL_FIELDS } from './fields.js';

const LEGACY_SUFFIX_KEYS = new Set([
  'InnvendigUtvendig_punkt',
  'InnvendigUtvendig_led',
  'Tykkelse_punkt',
  'Tykkelse_led',
  'Tema_punkt',
  'Tema_led',
  'NOBB-VAVVS-nr_punkt',
  'NOBB-VAVVS-nr_led',
  'S_HYPERLINK_punkt',
]);

const ENUMS = {
  GeometryScope,
  BindingState,
  ObjectValueState,
  TemaIdentityState,
  MappingKind,
  SourceKind,
  AuthorityState,
  Confidence,
  CaseNormalizationPolicy,
  SourceFieldDiagnosticKind,
};

function assertInvariant(condition, message) {
  if (!condition) {
    throw new Error(`Invalid Validator 2.0 GMI registry: ${message}`);
  }
}

function assertStringList(field, property) {
  const values = field[property];
  assertInvariant(Array.isArray(values), `${property} must be an array`);
  assertInvariant(
    values.every((value) => typeof value === 'string' && value.length > 0),
    `${field.canonicalFieldId}.${property} contains an empty or non-string value`
  );
  assertInvariant(
    new Set(values).size === values.length,
    `${field.canonicalFieldId}.${property} contains duplicates`
  );
}

function assertNonEmptyString(field, property) {
  assertInvariant(
    typeof field[property] === 'string' && field[property].length > 0,
    `${field.canonicalFieldId}.${property} must be a non-empty string`
  );
}

function assertEnumValuesAreUnique() {
  for (const [enumName, enumObject] of Object.entries(ENUMS)) {
    const values = Object.values(enumObject);
    assertInvariant(
      new Set(values).size === values.length,
      `${enumName} contains duplicate values`
    );
  }
}

/**
 * Validate the structural contract of a canonical field registry.
 *
 * This function performs no schema lookup, value lookup, or field resolution.
 * It returns true for convenient explicit checks and throws a deterministic
 * error when a registry invariant is violated.
 *
 * @param {Array<Object>} fields Canonical registry data to validate.
 * @returns {true}
 */
export function validateCanonicalRegistry(fields = CANONICAL_FIELDS) {
  assertEnumValuesAreUnique();
  assertInvariant(Array.isArray(fields), 'registry must be an array');
  assertInvariant(fields.length === 41, `expected 41 fields, got ${fields.length}`);

  const canonicalIds = new Set();
  const directKeys = new Set();

  for (const field of fields) {
    assertInvariant(field && typeof field === 'object', 'entry must be an object');
    assertInvariant(
      typeof field.canonicalFieldId === 'string' && field.canonicalFieldId.length > 0,
      'canonicalFieldId must be a non-empty string'
    );
    assertInvariant(
      !field.canonicalFieldId.endsWith('_punkt') &&
        !field.canonicalFieldId.endsWith('_led'),
      `${field.canonicalFieldId} contains a geometry suffix`
    );
    assertInvariant(
      !canonicalIds.has(field.canonicalFieldId),
      `duplicate canonicalFieldId ${field.canonicalFieldId}`
    );
    canonicalIds.add(field.canonicalFieldId);
    assertNonEmptyString(field, 'displayLabel');
    assertNonEmptyString(field, 'sourceProperty');

    assertInvariant(
      typeof field.directGmiSourceKey === 'string' && field.directGmiSourceKey.length > 0,
      `${field.canonicalFieldId} needs a direct GMI source key`
    );
    assertInvariant(
      !directKeys.has(field.directGmiSourceKey),
      `duplicate direct GMI source key ${field.directGmiSourceKey}`
    );
    assertInvariant(
      !LEGACY_SUFFIX_KEYS.has(field.directGmiSourceKey),
      `${field.directGmiSourceKey} is a legacy geometry-suffixed source key`
    );
    directKeys.add(field.directGmiSourceKey);

    assertInvariant(Array.isArray(field.expectedRuleScopes), `${field.canonicalFieldId} needs scopes`);
    assertInvariant(
      field.expectedRuleScopes.length > 0 &&
        field.expectedRuleScopes.every((scope) => Object.values(GeometryScope).includes(scope)),
      `${field.canonicalFieldId} has an unknown geometry scope`
    );
    assertInvariant(
      Object.values(CaseNormalizationPolicy).includes(field.caseNormalizationPolicy),
      `${field.canonicalFieldId} has an unknown case policy`
    );
    assertInvariant(
      Object.values(Confidence).includes(field.mappingEvidenceConfidence),
      `${field.canonicalFieldId} has unknown mapping confidence`
    );
    assertNonEmptyString(field, 'sourceAuthority');

    for (const property of [
      'acceptedFallbackKeys',
      'disabledLegacyAliases',
      'recognizedUnresolvedKeys',
    ]) {
      assertStringList(field, property);
    }
    assertInvariant(
      !field.disabledLegacyAliases.includes(field.directGmiSourceKey),
      `${field.canonicalFieldId} disables its direct source key`
    );
  }

  assertInvariant(canonicalIds.size === 41, 'canonical IDs are not unique');
  assertInvariant(directKeys.size === 41, 'direct mappings are not unique');

  const tema = fields.find((field) => field.canonicalFieldId === 'tema');
  assertInvariant(tema, 'tema entry is missing');
  assertInvariant(
    tema.acceptedFallbackKeys.length === 1 && tema.acceptedFallbackKeys[0] === 'S_FCODE',
    'tema must have exactly S_FCODE as its accepted fallback'
  );
  assertInvariant(
    tema.recognizedUnresolvedKeys.length === 2 &&
      tema.recognizedUnresolvedKeys.includes('.P_TEMA') &&
      tema.recognizedUnresolvedKeys.includes('.L_TEMA'),
    'tema must retain .P_TEMA and .L_TEMA as unresolved candidates'
  );
  assertInvariant(
    tema.disabledLegacyAliases.length === 5 &&
      ['Tema_punkt', 'Tema_led', 'PTEMA', 'LTEMA', 'FCODE'].every((key) =>
        tema.disabledLegacyAliases.includes(key)
      ),
    'tema must retain its five disabled candidates'
  );
  assertInvariant(
    !tema.acceptedFallbackKeys.some((key) => tema.recognizedUnresolvedKeys.includes(key)),
    'tema unresolved candidates cannot be accepted fallbacks'
  );

  const width = fields.find((field) => field.canonicalFieldId === 'width');
  assertInvariant(width, 'width entry is missing');
  assertInvariant(width.directGmiSourceKey === 'Bredde', 'width must map directly to Bredde');
  assertInvariant(
    width.expectedRuleScopes.length === 1 && width.expectedRuleScopes[0] === GeometryScope.POINT,
    'width must have point scope only'
  );
  assertInvariant(
    !['DIM', 'DIMENSJON', 'Dimensjon', 'DIAMETER'].some((key) =>
      width.acceptedFallbackKeys.includes(key)
    ),
    'width cannot accept dimension or diameter fallbacks'
  );
  assertInvariant(width.acceptedFallbackKeys.length === 0, 'width must have no accepted fallback');

  const dimension = fields.find((field) => field.canonicalFieldId === 'dimension');
  assertInvariant(dimension, 'dimension entry is missing');
  assertInvariant(
    dimension.directGmiSourceKey === 'Dimensjon',
    'dimension must map directly to Dimensjon'
  );
  assertInvariant(
    dimension.expectedRuleScopes.length === 1 && dimension.expectedRuleScopes[0] === GeometryScope.LINE,
    'dimension must have line scope only'
  );

  const measurementFields = new Set([
    'measurementMethod',
    'horizontalAccuracy',
    'heightMeasurementMethod',
    'verticalAccuracy',
  ]);
  assertInvariant(measurementFields.size === 4, 'XY/Z measurement concepts are not distinct');
  assertInvariant(
    fields.filter((field) => measurementFields.has(field.canonicalFieldId)).length === 4,
    'one or more XY/Z measurement fields are missing'
  );
  const hCandidates = ['H_MÅLEMETODE', 'H_MALEMETODE', 'H_NOYAKTIGHET'];
  assertInvariant(
    fields.every((field) =>
      hCandidates.every((candidate) => !field.acceptedFallbackKeys.includes(candidate))
    ),
    'H_* candidates cannot be accepted fallbacks'
  );
  const measurementSources = new Map([
    ['measurementMethod', 'Målemetode'],
    ['horizontalAccuracy', 'Nøyaktighet'],
    ['heightMeasurementMethod', 'MålemetodeHøyde'],
    ['verticalAccuracy', 'NøyaktighetHøyde'],
  ]);
  for (const [fieldId, sourceKey] of measurementSources) {
    const field = fields.find((entry) => entry.canonicalFieldId === fieldId);
    assertInvariant(field.directGmiSourceKey === sourceKey, `${fieldId} has the wrong direct source key`);
    assertInvariant(field.acceptedFallbackKeys.length === 0, `${fieldId} must have no accepted fallback`);
  }

  return true;
}

validateCanonicalRegistry();

const fieldsById = new Map(
  CANONICAL_FIELDS.map((field) => [field.canonicalFieldId, field])
);
const fieldsByDirectSourceKey = new Map(
  CANONICAL_FIELDS.map((field) => [field.directGmiSourceKey, field])
);

/**
 * @param {string} fieldId
 * @returns {Object|undefined}
 */
export function getCanonicalField(fieldId) {
  return fieldsById.get(fieldId);
}

/**
 * @returns {ReadonlyArray<Object>}
 */
export function getCanonicalFields() {
  return CANONICAL_FIELDS;
}

/**
 * @param {string} fieldId
 * @returns {boolean}
 */
export function hasCanonicalField(fieldId) {
  return fieldsById.has(fieldId);
}

/**
 * Query the registry's exact direct mapping only. This is not schema matching
 * and does not apply case normalization or fallback policy.
 *
 * @param {string} sourceKey
 * @returns {Object|undefined}
 */
export function getCanonicalFieldByDirectSourceKey(sourceKey) {
  return fieldsByDirectSourceKey.get(sourceKey);
}
