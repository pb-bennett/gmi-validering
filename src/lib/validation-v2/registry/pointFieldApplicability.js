import { getCanonicalField } from './registry.js';

export const PointFieldApplicabilityState = Object.freeze({
  APPLICABLE: 'APPLICABLE',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  UNKNOWN: 'UNKNOWN',
});

const POLICY_AUTHORITY = 'PROJECT/DOMAIN POLICY';
const POLICY_RATIONALE =
  'Explicit domain-owner approval for the current v3.2 Tema identity; legacy subset behavior is retained as PRAKSIS evidence, not STANDARD behavior.';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const CELL_KEYS = ['constructionMethod', 'manholeShape', 'cone', 'width'];
const APPROVED_APPLICABLE_TEMAS = ['KUM', 'SAN', 'SLS', 'SLU'];

const cells = [];
for (const tema of APPROVED_APPLICABLE_TEMAS) {
  for (const canonicalFieldId of CELL_KEYS) {
    cells.push({
      tema,
      canonicalFieldId,
      state: PointFieldApplicabilityState.APPLICABLE,
      authority: POLICY_AUTHORITY,
      rationale: POLICY_RATIONALE,
    });
  }
}
for (const canonicalFieldId of ['constructionMethod', 'width']) {
  cells.push({
    tema: 'LOK',
    canonicalFieldId,
    state: PointFieldApplicabilityState.APPLICABLE,
    authority: POLICY_AUTHORITY,
    rationale:
      canonicalFieldId === 'width'
        ? 'Field width / Bredde was included in the legacy Bredde applicability subset and that legacy behavior is retained as PRAKSIS evidence; LOK × Bredde is explicitly approved by PROJECT/DOMAIN POLICY and is not STANDARD Innmålingsinstruks behavior.'
        : 'Explicit domain-owner approval; the legacy Byggemetode inclusion is preserved separately as PRAKSIS evidence.',
  });
}
for (const canonicalFieldId of ['manholeShape', 'cone']) {
  cells.push({
    tema: 'LOK',
    canonicalFieldId,
    state: PointFieldApplicabilityState.UNKNOWN,
    authority: POLICY_AUTHORITY,
    rationale: 'Explicitly unresolved by the approved partial policy; no affirmative evidence supports APPLICABLE or NOT_APPLICABLE.',
  });
}

export const POINT_FIELD_APPLICABILITY_POLICY = deepFreeze({
  policyId: 'validator-2-point-field-applicability',
  policyVersion: '3.2.0',
  policyRevision: '2026-09-04.1',
  effectiveDate: '2026-09-04',
  decisionDate: '2026-09-04',
  authority: POLICY_AUTHORITY,
  standardProvenance: 'NOT_STANDARD_INNMALINGSINSTRUKS_BEHAVIOR',
  legacyProvenance: 'PRAKSIS',
  requiredness: 'SEPARATE_CONCERN',
  defaultState: PointFieldApplicabilityState.UNKNOWN,
  cells,
});

const cellsByKey = new Map(
  cells.map((cell) => [`${cell.tema}:${cell.canonicalFieldId}`, cell])
);

function unknownCell(tema, canonicalFieldId) {
  return {
    tema,
    canonicalFieldId,
    state: PointFieldApplicabilityState.UNKNOWN,
    authority: POLICY_AUTHORITY,
    rationale: 'No approved cell is recorded for this exact current v3.2 Tema/field combination; applicability is not inferred.',
  };
}

/**
 * Exact lookup for this policy. It intentionally performs no alias or case
 * normalization and never treats an unlisted cell as NOT_APPLICABLE.
 */
export function getPointFieldApplicability(tema, canonicalFieldId) {
  if (typeof tema !== 'string' || typeof canonicalFieldId !== 'string') {
    return unknownCell(tema, canonicalFieldId);
  }
  if (!getCanonicalField(canonicalFieldId)) return unknownCell(tema, canonicalFieldId);
  return cellsByKey.get(`${tema}:${canonicalFieldId}`) || unknownCell(tema, canonicalFieldId);
}
