# Validator 2.0 GMI-A1 schema binding

- Date: 2026-08-23
- Scope: GMI-A1 only
- Runtime namespace: `src/lib/validation-v2/`

## Files

Added:

- `src/lib/validation-v2/gmiLayerSchemaBinding.js`
- `tests/validationV2GmiA1.test.mjs`
- this report

Updated:

- `src/lib/validation-v2/contracts.js` with A1 diagnostic/result JSDoc and
  `SourceFieldDiagnosticKind`.
- `src/lib/validation-v2/index.js` with the public `bindGmiLayerSchema` and
  diagnostic-kind export.

The A0 registry files remain the source of canonical field metadata and were
consumed through their existing query API. No parser or application wiring was
changed.

## Public API

`bindGmiLayerSchema({ layerId, dataset, datasetRevision, sourceFormat: 'gmi' })`
accepts exactly one explicit dataset owner. It rejects a missing/blank layer ID,
missing dataset object, missing/blank revision string, or any source format other
than the exact lowercase `gmi`. It does not inspect global state, visible-layer
collections, or extra layer properties.

The result retains `layerId`, `datasetRevision`, and `sourceFormat`, and contains
`geometryContexts`, `bindings`, and `sourceFieldDiagnostics`. There is one
binding for each of the 41 canonical fields in each point/line context. Results,
bindings, contexts, candidates, and diagnostics are frozen. `datasetRevision` is
retained exactly as a non-empty string.

## Actual parser structures

`GMIParser.toObject()` returns `format: 'GMI'`, `points`, `lines`, and
`fieldAnalysis`. The parser's `fieldAnalysis.points` and `.lines` values are
objects keyed by literal source field names; their values contain analysis data
such as `present`, `types`, `nullCount`, and `totalCount`. Feature collections
are `points[]` and `lines[]`; each feature has an `attributes` object. The parser
currently populates field analysis from field names and parsed attributes.

The A1 input boundary intentionally requires `sourceFormat: 'gmi'` as specified;
the dataset's parser display format is not inferred or rewritten.

## Schema source and binding algorithm

For each geometry independently, the binder:

1. Uses own keys of `dataset.fieldAnalysis.points` or `.lines` when that
   geometry's explicit metadata object exists. An empty metadata object proves a
   known empty schema.
2. Otherwise uses the sorted union of own enumerable keys from
   `feature.attributes` in only that geometry's collection. It reads property
   names, not attribute values.
3. Returns `SCHEMA_UNAVAILABLE` when neither explicit metadata nor an attribute
   schema from a non-empty collection exists.

The binder consumes A0's canonical registry query API and does not duplicate the
41 mapping table. Exact direct keys are considered first, then unique
case-normalized direct keys, then exact/case-normalized accepted fallbacks. The
only accepted fallback is `S_FCODE` for `tema`. Exact direct/case/fallback
candidates are retained with mapping, source, authority, and confidence
metadata. Multiple accepted candidates produce `MULTIPLE_ACCEPTED` without
reading values.

Case comparison NFC-normalizes for comparison and uses uppercase comparison only
when the normalized code-point lengths remain equal. Literal source keys remain
unchanged. No transliteration, separator changes, punctuation removal,
abbreviation expansion, fuzzy matching, or typo correction is performed.

## States and diagnostics

The binder uses the A0 states as follows:

- `BOUND`: one accepted representation.
- `MULTIPLE_ACCEPTED`: multiple accepted representations coexist.
- `FIELD_ABSENT`: known schema with no accepted or recognized unsupported
  candidate for that canonical field.
- `AMBIGUOUS`: an accepted source key has an unresolved tie between semantic
  targets.
- `UNRESOLVED_SOURCE`: only recognized unsupported/disabled representations
  exist for that canonical field.
- `SCHEMA_UNAVAILABLE`: schema cannot be established for that context.

Every accepted source key is retained in its canonical binding candidates.
Non-accepted literal keys are retained in `sourceFieldDiagnostics` with one of:
`RECOGNIZED_UNRESOLVED`, `DISABLED_UNSUPPORTED`, or
`UNKNOWN_SOURCE_FIELD`. Diagnostics retain layer, revision, geometry, literal
key, possible canonical targets, mapping/authority status where known, source
kind, and confidence. A known unsupported key may also be retained as a
candidate for its canonical binding; this preserves evidence without accepting
it. Unknown fields are not called invalid and do not create validation errors.

Expected rule scope is not used as a discovery filter. For example, an
unexpected point `Material` key can still bind `material` as source evidence,
while a point `DIMENSJON` can bind `dimension` by case-only identity and never
bind `width`. Point and line schemas remain separate even within one dataset.

## Value and future-feature boundary

No attribute value is read, inspected, counted, typed, normalized, compared, or
validated. Throwing getters on fallback attribute values pass because schema
collection uses `Object.keys`. The binder does not calculate null rates,
distinct values, allowed-value matches, requiredness, suspected equivalence, or
object identity. It creates no `ObjectRef` or `ObjectFieldValue`, and it does
not resolve Tema identity, classify hydraulics, or evaluate rules.

A later feature may suggest a possible mislabeled required field, for example an
unknown `HOYDEREF` alongside missing `Høydereferanse`, when name, geometry, type,
and value evidence are available. A1 only inventories the literal unknown key;
it cannot perform that analysis and must never let a suspected field satisfy a
canonical field.

## Compatibility and isolation

The 41 A0 canonical IDs and direct mappings are unchanged. `Tema` and
`S_FCODE` coexist as schema-level accepted candidates and are not resolved per
object. `Trykklasse` case-only handling uses the corrected A0 metadata, while
`TRYKKKLASSE` remains disabled and `TRYKKLASSE` is eligible only through the
case-only policy.

The A1 runtime imports neither planning JSON nor legacy validation modules. The
legacy validator, parsers, stores, UI, map behavior, telemetry, and production
application remain untouched.

## Tests

`tests/validationV2GmiA1.test.mjs` contains 20 focused tests covering input
guards, all 41 direct mappings, exact/case-only behavior, transliteration and
separator rejection, Tema fallback/coexistence, unresolved candidates,
width/dimension separation, all nine suffix keys, absent/unavailable schemas,
metadata precedence, all-null explicit schemas, same-geometry fallback,
multiple case variants, unknown-field inventory, global/layer isolation,
immutability, input preservation, and runtime dependency isolation. Throwing
getters prove that schema binding does not read attribute values.

## GMI-A2/A3 boundary

GMI-A2 is now the completed ObjectRef prerequisite: it creates layer-qualified
references and enforces layer, dataset-revision, geometry, and local-position
isolation independently of A1 schema binding. The next per-object Tema/
`S_FCODE` identity slice is GMI-A3. A3 should require an existing ObjectRef,
preserve all accepted candidate provenance, and produce `RESOLVED`, `MISSING`,
`CONFLICT`, or `UNRESOLVED_SOURCE`. Object extraction, value equivalence, and
any validation or classification consumer remain outside this A1 implementation.

## Sol review correction

Accepted canonical evidence now takes precedence over disabled or unresolved
metadata belonging to another canonical target. Valid `Dimensjon`, `Kumform`,
and `Rørform` keys remain clean accepted evidence without contradictory
unsupported diagnostics; the defensive registry metadata remains unchanged.

The internal registry-parameterized test seam now exercises a synthetic future
collision. `AMBIGUOUS` bindings preserve every competing canonical target ID
and source candidate provenance without exposing the seam through the public
index or reading values.

Regression coverage increased the focused A1 suite to 20/20 passing tests. The
A0 suite passes 11/11 and the full existing suite passes 139/139.
