# Validator 2.0 GMI-A4 field extraction

- Date: 2026-08-23
- Scope: GMI-A4 only
- Runtime namespace: `src/lib/validation-v2/`

## Files

Added:

- `src/lib/validation-v2/objectFieldValue.js`
- `src/lib/validation-v2/valueSemantics.js`
- `tests/validationV2GmiA4.test.mjs`
- this report

Updated:

- `src/lib/validation-v2/temaIdentity.js` to use the shared raw missing-value
  predicate without changing A3 semantics.
- `src/lib/validation-v2/contracts.js` with the A4 result/observation contract.
- `src/lib/validation-v2/index.js` with `extractGmiObjectFieldValue`.

No parser, registry metadata, store, UI, map, telemetry, or legacy validator
was changed.

## Public API and dependencies

`extractGmiObjectFieldValue({ layerId, dataset, datasetRevision,
sourceFormat: 'gmi', schemaBinding, objectRef, canonicalFieldId })` extracts
one canonical field for one existing A2 ObjectRef from one explicit dataset.
The canonical ID is checked against the A0 registry. The selected A1 binding
must match the layer, revision, source format, canonical field, and ObjectRef
geometry. A4 does not rerun A1 matching and does not use a second source map.

The returned immutable `ObjectFieldValue` retains the ObjectRef, canonical ID,
A1 binding state, object state, selected provenance, raw source value, source
metadata, candidate observations, conflict observations, unresolved source
provenance, and the current unavailable source-lexeme marker.

## Parser access path and ownership

The inspected GMI parser stores objects in `dataset.points[]` and
`dataset.lines[]`, with delivered attributes at `feature.attributes`. A4 uses
`objectRef.geometryScope` to select exactly one collection and
`objectRef.sourceIndex` to select exactly one object. It validates A2 ownership
and exact collection bounds before reading that object.

It also verifies top-level A1 result ownership and source format, then verifies
the selected field binding ownership. A point reference never reads a line and
an out-of-range reference never falls back to another geometry, object, layer,
or revision.

## State semantics

The A1 binding state maps as follows:

- `FIELD_ABSENT` -> `FIELD_ABSENT`; object attributes are not read.
- `SCHEMA_UNAVAILABLE` -> `SCHEMA_UNAVAILABLE`; object attributes are not read.
- `UNRESOLVED_SOURCE` -> `UNRESOLVED_SOURCE`; unsupported values are not read
  and copied unresolved provenance is retained.
- `AMBIGUOUS` -> the existing approved `BINDING_AMBIGUOUS` ObjectValueState;
  schema candidates and conflicts are retained without reading values.
- `BOUND`/`MULTIPLE_ACCEPTED` -> accepted literal candidates are observed.

The existing A0 ObjectValueState name `BINDING_AMBIGUOUS` is used for both
schema ambiguity and conflicting accepted object values; no new state was
invented. `FIELD_ABSENT` remains distinct from `VALUE_MISSING`.

## Accepted candidates and raw values

A4 reads only A1 candidates with mapping kinds `DIRECT`, `CASE_NORMALIZED`, or
`ACCEPTED_FALLBACK`. For each candidate it checks own-property presence and
reads only that literal key. Observations preserve literal source key, mapping
kind, source/authority/confidence metadata, own-property presence, value state,
and the unmodified raw value.

A1 candidate order supplies precedence: exact direct, case-normalized direct,
exact fallback, then case-normalized fallback. A single present candidate gives
`VALUE_PRESENT`; all missing candidates give `VALUE_MISSING`. Multiple present
values that agree under `Object.is` give `VALUE_PRESENT` with the highest
precedence present candidate selected. Different raw values give
`BINDING_AMBIGUOUS` with no selected source value. All observations remain.

The shared `isMissingValue` predicate treats only `undefined`, `null`, and `''`
as missing. Zero, `"0"`, false, and whitespace-only strings are present. No
trimming, case folding, transliteration, parsing, stringification, coercion, or
field-specific validation is performed.

Canonical `tema` follows the same generic A1 candidate behavior as A3:
`Tema` and `S_FCODE` may both be observed, fallback works when direct is
missing, equal raw values are present, and disagreement is ambiguous. A3
continues to provide specialized `RESOLVED`/`MISSING`/`CONFLICT`/
`UNRESOLVED_SOURCE` identity semantics; A4 does not perform identity
resolution or classification.

## Own-property and isolation boundaries

Only own source properties can supply a value. Inherited properties do not
satisfy a candidate. For `BOUND` and `MULTIPLE_ACCEPTED` bindings, the selected
feature must provide a non-array object `attributes` container; absent, null,
array, and primitive containers are rejected as malformed runtime data. A valid
empty object remains a valid container and produces `VALUE_MISSING` when the
bound source property is absent. `FIELD_ABSENT`, `SCHEMA_UNAVAILABLE`,
`UNRESOLVED_SOURCE`, and schema `AMBIGUOUS` paths do not read attributes.
Unknown, disabled, and unresolved candidate keys are never read, and unrelated
attributes are never enumerated. IDs, GUIDs, coordinates, geometry, and
field-analysis statistics are not accessed.

The result has no validation severity, requiredness, allowed-value outcome,
hydraulic classification, or suspected-mislabel inference. A present raw value
may still be invalid later.

## Immutability

A4-owned result objects, candidate observations, conflict arrays, schema
candidate copies, and unresolved provenance copies are frozen. A1 candidate
objects are copied rather than exposed or frozen. Raw source values, the input
ObjectRef, the dataset, the object, and attributes are not recursively frozen
or mutated. The normal A2 ObjectRef is already immutable.

## Tests

`tests/validationV2GmiA4.test.mjs` contains 15 focused synthetic tests covering
canonical and ownership validation, forged/out-of-range references, all basic
binding states, all 41 generic direct mappings, exact/case-only candidates,
missing/present raw-value policy, multiple accepted candidates and conflicts,
A3 Tema compatibility, point/line separation, own-property/prototype safety,
throwing unrelated getters, malformed attributes, schema ambiguity propagation,
three accepted candidates, copied provenance, immutability, and public-boundary
isolation. Tests use no operational/customer data.

## Compatibility and next boundary

A4 is compatible with A0 registry contracts, A1 geometry-scoped bindings, A2
layer-qualified ObjectRefs, and A3 Tema semantics. It is intentionally a
single-field extractor and has no batch runner or whole-layer validation path.

The recommended next slice is the first small V2 rule-engine beta, GMI-A5. It
should consume A4 ObjectFieldValue results and emit findings tied to
layer-qualified ObjectRefs for a deliberately narrow set of high-confidence
rules. Validation rules, hydraulic classification, and UI integration remain
outside A4.

## Sol review correction

For value-reading `BOUND` and `MULTIPLE_ACCEPTED` states, malformed or missing
feature attribute containers are now deterministic runtime-contract failures;
they no longer masquerade as `VALUE_MISSING`. A valid empty attributes object
still produces `VALUE_MISSING` when its bound source property is absent. The
non-reading states remain unchanged.

Regression coverage now directly verifies A1 `AMBIGUOUS` propagation to the
approved `BINDING_AMBIGUOUS` ObjectValueState without reading attributes, and
tests three accepted candidates for all-equal, one-differing, and one-missing
cases. All observations, conflicts, and preferred provenance are checked.

After this correction, the targeted A4 suite passes 15/15, A3 passes 16/16, A2
passes 12/12, A1 passes 20/20, A0 passes 11/11, and the full suite passes
182/182.
