# Validator 2.0 GMI-A3 Tema identity

- Date: 2026-08-23
- Scope: GMI-A3 only
- Runtime namespace: `src/lib/validation-v2/`

## Files

Added:

- `src/lib/validation-v2/temaIdentity.js`
- `tests/validationV2GmiA3.test.mjs`
- this report

Updated:

- `src/lib/validation-v2/contracts.js` with the A3 observation and result
  JSDoc contracts.
- `src/lib/validation-v2/index.js` with `resolveGmiTemaIdentity`.

No parser, registry metadata, store, UI, map, telemetry, or legacy validator
was changed.

## Public API and dependencies

`resolveGmiTemaIdentity({ layerId, dataset, datasetRevision, sourceFormat,
schemaBinding, objectRef })` requires one explicit GMI dataset, one compatible
A1 schema result, and one existing A2 ObjectRef. It uses A0 `getCanonicalField`
to verify the canonical `tema` entry and consumes accepted literal candidates
from A1; it does not rerun schema binding or duplicate the source mapping table.

The result is an immutable `TemaIdentityResult` retaining layer, revision,
source format, ObjectRef, canonical field ID, A1 binding state, Tema identity
state, resolved raw value when applicable, preferred source provenance, all
accepted observations, conflict observations, and copied unresolved schema
provenance.

## Parser access path and ownership

The inspected GMI parser returns `points[]` and `lines[]`. Each feature stores
attributes at `feature.attributes`. A3 selects exactly `dataset.points` for a
point ObjectRef or `dataset.lines` for a line ObjectRef, then accesses only the
feature at `objectRef.sourceIndex`.

Before that object access, A3 validates the ObjectRef through the A2 ownership
guard, requiring exact `layerId`, `datasetRevision`, and geometry agreement. It
also verifies A1 result ownership and source format, selects exactly one Tema
binding for the ObjectRef geometry, and rejects out-of-range indexes. It never
searches another layer, revision, object, or geometry.

`datasetRevision` is a non-empty string and must match exactly in the request,
schema binding, and ObjectRef. A point index cannot address a line, and equal
indexes in different layers or revisions cannot be substituted.

## Tema resolution

For `BOUND` or `MULTIPLE_ACCEPTED` Tema bindings, A3 reads only own properties
whose A1 mapping kind is `DIRECT`, `CASE_NORMALIZED`, or `ACCEPTED_FALLBACK`.
Candidate order comes from A1's direct/case/fallback precedence. Each accepted
candidate becomes an immutable observation retaining its literal key, mapping
kind, source provenance, authority, confidence, own-property presence, missing/
present state, and raw value.

The direct `Tema` candidate is preferred when present. `S_FCODE` is the only
accepted fallback and is preferred when direct Tema is missing. If multiple
accepted non-missing values exist, `Object.is` compares them without trimming,
case folding, transliteration, numeric coercion, parsing, or fuzzy matching.
Equal raw values resolve; different values produce `CONFLICT` and no preferred
winner. All observations and conflict values remain available.

The explicit missing predicate is only `undefined`, `null`, and `''`.
Numeric zero, string `"0"`, boolean false, and whitespace-only strings are
present raw values and are not silently normalized.

## Binding states

- `BOUND` and `MULTIPLE_ACCEPTED` inspect accepted candidates.
- `FIELD_ABSENT` returns Tema `MISSING` without reading object attributes.
- `UNRESOLVED_SOURCE` returns Tema `UNRESOLVED_SOURCE` and copies unsupported
  schema provenance without reading unsupported values.
- `SCHEMA_UNAVAILABLE` and `AMBIGUOUS` are rejected deterministically rather
  than misleadingly represented as one of the four Tema identity states.

If accepted Tema exists but is missing on the object while unsupported Tema
evidence also exists, the result is `MISSING`; unsupported fields never rescue
the accepted field. Unknown source fields never participate.

## Value and prototype boundaries

A3 is the first slice allowed to read selected object values, but it reads only
accepted Tema/S_FCODE own properties. It does not enumerate or inspect all
attributes, coordinates, parser IDs, GUIDs, field-analysis values, or unrelated
fields. Inherited `Tema` does not satisfy identity; an own `Tema` property does.
Unsupported/unresolved and unknown getters are not accessed.

No `ObjectFieldValue` is created. There is no general field extraction, value
validation, hydraulic classification, Tema normalization, or mislabel analysis.

## Immutability and isolation

The input dataset, object, attributes, ObjectRef, A1 binding, and registry are
not mutated. A3-owned observation and unresolved-candidate records are copied
before freezing, so mutable A1 candidate objects are not exposed through the
result. Results, observations, conflicts, and copied unresolved provenance are
frozen. Raw values and the existing ObjectRef are retained without recursively
freezing caller-owned values; normal A2 ObjectRefs are already immutable.

## Tests

`tests/validationV2GmiA3.test.mjs` contains 16 focused synthetic tests covering
point/line access, layer/revision/schema ownership, forged and out-of-range
references, direct and case-only Tema, exact and case-only S_FCODE fallback,
coexistence and conflicts, object-level fallback, missing-value policy, strict
raw comparison, unresolved/disabled candidates, absent/unavailable/ambiguous
bindings, own-property and unrelated-value safety, immutability, and public
boundary isolation.

Throwing getters prove that coordinates, IDs, GUIDs, unrelated attributes, and
unsupported candidates are not read. No operational/customer data is used.

## Compatibility and next boundary

A3 preserves the A0 identity states and metadata, consumes A1's geometry-scoped
bindings, and requires A2's layer-qualified ObjectRef. The next slice is
GMI-A4, general per-object canonical field extraction. A4 should consume the
same ObjectRef and A1 bindings, produce `ObjectFieldValue`, preserve raw
provenance, and distinguish field/value/binding/schema states without applying
validation rules.
