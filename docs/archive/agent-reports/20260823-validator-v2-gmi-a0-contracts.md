# Validator 2.0 GMI-A0 contracts and registry

- Date: 2026-08-23
- Scope: GMI-A0 only
- Runtime namespace: `src/lib/validation-v2/`

## Implementation

Added:

- `src/lib/validation-v2/contracts.js`
- `src/lib/validation-v2/index.js`
- `src/lib/validation-v2/registry/fields.js`
- `src/lib/validation-v2/registry/registry.js`
- `tests/validationV2GmiA0.test.mjs`

The runtime contracts define frozen constants for geometry scope, binding state,
object value state, Tema identity state, mapping kind, source kind, authority
state, confidence, and the conservative `UNIQUE_CASE_ONLY` policy. JSDoc
typedefs document `GmiLayerAdapterInput`, `LayerFieldBinding`, `ObjectRef`,
and `ObjectFieldValue`. The documented input and object contracts retain
explicit layer ownership and `datasetRevision`; object values require a
layer-qualified `ObjectRef`.

## Canonical registry

The application-authored registry contains exactly 41 canonical fields, 41
unique canonical IDs, and 41 unique direct GMI source keys. It does not import
or dynamically load either planning JSON artifact. Geometry is represented in
`expectedRuleScopes`, not in canonical IDs.

The registry retains direct source identity, display/source labels, rule scopes,
case policy, accepted fallbacks, disabled candidates, recognized unresolved
candidates, authority metadata, evidence confidence, and concise boundary
notes. Legacy field keys are not used as runtime identity metadata; suffixes
needed for protection remain explicit disabled aliases.

Tema has direct `Tema` as its source and exactly `S_FCODE` as its accepted
non-direct fallback. `Tema_punkt`, `Tema_led`, `PTEMA`, `LTEMA`, and `FCODE`
are disabled. `.P_TEMA` and `.L_TEMA` remain recognized unresolved candidates.
No Tema precedence or object-value resolution is implemented.

`width` maps directly to `Bredde` with point scope and no accepted fallback.
`dimension` maps directly to `Dimensjon` with line scope; `DIM` remains
unresolved. The width registry explicitly rejects `DIM`, `DIMENSJON`,
`Dimensjon`, and `DIAMETER` as fallbacks.

The four measurement concepts remain independent:
`measurementMethod`/`Målemetode`, `horizontalAccuracy`/`Nøyaktighet`,
`heightMeasurementMethod`/`MålemetodeHøyde`, and
`verticalAccuracy`/`NøyaktighetHøyde`. H_* candidates are not accepted
fallbacks.

All nine legacy geometry-suffixed logical keys are excluded from direct GMI
source identity. Structural guards also reject geometry-suffixed canonical IDs,
unknown scopes or case policies, duplicate list values, direct keys disabled as
aliases, duplicate IDs/direct mappings, and invalid Tema/width/dimension or
measurement metadata.

Registry data is deeply frozen, including nested arrays. The public API exposes
only frozen query results and small deterministic queries:
`getCanonicalField`, `getCanonicalFields`, `hasCanonicalField`,
`getCanonicalFieldByDirectSourceKey`, and `validateCanonicalRegistry`, together
with the stable A0 constants.

## Tests and isolation

`tests/validationV2GmiA0.test.mjs` covers count and uniqueness, every direct
source mapping, exact queries, deep immutability, enum uniqueness/freeze,
suffix protection, Tema metadata, XY/Z separation, Bredde/Dimensjon separation,
malformed-registry rejection, and absence of legacy/planning imports. It also
asserts that no resolver, schema binder, value extractor, or validation-run API
is exported.

No legacy validator, `fields.json`, parser, store, UI, map behavior, telemetry,
rules, hydraulic classification, or production application wiring was changed.

## Explicit boundary

This slice does not resolve GMI fields, inspect or bind dataset schemas, extract
object values, resolve Tema/S_FCODE, create ObjectRefs at runtime, evaluate
validation rules, classify hydraulics, or implement `runValidationV2`.

The recommended GMI-A1 boundary is a pure, one-selected-layer schema-binding
phase that consumes an explicit `{ layerId, dataset, datasetRevision,
sourceFormat: 'gmi' }` input, establishes point/line schema provenance once,
and returns `LayerFieldBinding` records without reading object values. A1 must
retain the A0 exact mappings and conservative case-policy guardrails.

## Discrepancies

No discrepancy was found between the approved planning matrix and the runtime
registry. The planning artifact's optional `legacyFieldKeys` provenance was
omitted because it is not needed for A0 queries or the planned A1 binding
boundary; the relevant suffix decisions are retained in disabled metadata.

## Sol review correction

The Trykklasse metadata was corrected so `Trykklasse` remains the direct source,
`TRYKKLASSE` is available only to future `UNIQUE_CASE_ONLY` matching, and the
unsupported `PN` and extra-K `TRYKKKLASSE` spellings are disabled. A0 still does
not perform case matching.

The focused registry test now asserts the complete 41-entry
`canonicalFieldId -> directGmiSourceKey` table, so swapped mappings fail even
when the unordered source-key set remains unchanged. It also explicitly checks
the Trykklasse policy. After this correction, the targeted suite passes 11/11
tests and the full existing suite passes 119/119 tests.
