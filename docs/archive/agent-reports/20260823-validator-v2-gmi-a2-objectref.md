# Validator 2.0 GMI-A2 ObjectRef isolation

- Date: 2026-08-23
- Scope: GMI-A2 only
- Runtime namespace: `src/lib/validation-v2/`

## Files

Added:

- `src/lib/validation-v2/objectRef.js`
- `tests/validationV2GmiA2.test.mjs`
- this report

Updated:

- `src/lib/validation-v2/contracts.js` with the explicit A2
  `geometryScope` ObjectRef property.
- `src/lib/validation-v2/index.js` with the minimal ObjectRef public API.

No parser, A1 binder, registry metadata, application wiring, or legacy code was
changed.

## Actual parser structures

The inspected GMI parser output contains dense `points[]` and `lines[]`
collections. Point and line objects include parser/domain properties such as
`id`, `type`, `attributes`, `guid`, and coordinates. A2 does not inspect any of
those object properties. It uses only the explicit selected dataset's collection
presence and lengths.

## Public API

`createObjectRef({ layerId, datasetRevision, geometryScope, objectIndex })`
creates one immutable reference for a structurally valid non-negative,
zero-based geometry-local position. It does not require a dataset and therefore
does not perform dereferencing or out-of-range checks.

`createGmiObjectRefs({ layerId, dataset, datasetRevision, sourceFormat: 'gmi' })`
strictly validates one selected dataset with `points` and `lines` arrays, then
returns frozen `pointRefs` and `lineRefs` collections. It enumerates only the
supplied collections.

`assertObjectRefOwnership({ objectRef, layerId, datasetRevision,
geometryScope? })` validates the ObjectRef shape and asserts exact owner,
revision, and optional geometry ownership. It never searches another layer or
dataset.

## Identity model

Every ObjectRef retains:

- `layerId`;
- `datasetRevision`;
- `geometryScope` and the A0-compatible `geometryType`;
- `sourceIndex` and `localIdentity: { kind: 'index', value }`;
- a collision-safe `key` containing all four identity dimensions.

Array position is intentionally only a local locator. It is meaningful within
one geometry collection and one exact dataset revision, not globally and not
across revisions. Layer identity prevents equal point positions in two layers
from colliding. Geometry identity prevents equal point and line positions from
colliding. Revision identity prevents stale references from being treated as
current objects.

The key uses length-prefixed parts, so separators appearing inside layer or
revision strings cannot create an ambiguous serialized identity.

The parser's `id` and `guid` properties were inspected but are not used as the
core A2 identity. This preserves the approved model and avoids depending on
domain/user data, duplicated IDs, missing IDs, or renamed fields.

## Isolation and immutability

Constructor validation rejects blank layer/revision strings, unsupported
geometry, negative/fractional/string indexes, and malformed inputs without
coercion. GMI enumeration rejects missing/malformed datasets and any source
format other than exact lowercase `gmi`.

Point refs are generated only from `dataset.points`, and line refs only from
`dataset.lines`. A2 does not inspect `fieldAnalysis`, attributes, delivered
identity-like fields, values, coordinates, global state, stores, or extra layer
collections. Throwing getters on feature properties, dataset schema, and extra
layers prove this boundary.

Refs, nested local identities, result collections, and result records are
frozen. The caller-provided non-empty string revision is retained exactly. No
caller-owned revision objects are accepted by the contract, and the
implementation does not mutate the dataset or its objects.

No general dereference API was added. Structural construction may create a
valid out-of-range local position; only a future dataset-aware consumer may
decide whether that position exists in the exact dataset revision.

## Tests

`tests/validationV2GmiA2.test.mjs` contains 10 focused synthetic tests covering
strict constructor and enumeration validation, point/line enumeration, all
identity dimensions, ownership assertions, empty collections, throwing getter
protection, global/extra-layer isolation, immutability, out-of-range
construction boundaries, and public-surface isolation. The tests prove that
no delivered attributes or object values are read and that no A2 result creates
an `ObjectFieldValue` or validation result.

## Compatibility and future consumers

A2 is independent of A1 schema binding: ObjectRefs can be created when schema
binding is absent, unresolved, or not requested. Future Tema identity,
ObjectFieldValue, validation findings, map/table focus, caches, and legacy/V2
comparisons must carry these layer-qualified ObjectRefs rather than inventing
index-only identities.

The recommended next GMI-A3 boundary is per-object Tema/`S_FCODE` identity
resolution. A3 should require an existing ObjectRef, read only the exact
selected layer/dataset/revision, preserve source provenance, and produce
`RESOLVED`, `MISSING`, `CONFLICT`, or `UNRESOLVED_SOURCE`. It must not default
unknown identity to gravity and must not yet perform hydraulic classification or
general validation.

## Explicit non-goals

This slice does not extract or evaluate object fields, resolve Tema identity,
classify hydraulics, apply validation rules, analyze values or coordinates,
modify parsers, connect stores/UI/map behavior, add telemetry, or change the
legacy validator.

## Sol review correction

`datasetRevision` is now standardized across the shared adapter contract, A1,
and A2 as a non-empty string. A1 rejects numeric, object, null, blank, and
whitespace-only revisions just as A2 does; revisions remain caller-provided and
opaque in meaning but are not arbitrary runtime objects.

The public ObjectRef typedef is narrowed to index-only identity:
`layerId`, string `datasetRevision`, `geometryScope`, and a geometry-local
non-negative index. `localIdentity` is exactly `{ kind: 'index', value }`, with
`sourceIndex` and `geometryType` retained only as consistent redundant fields.
Parser IDs, GUIDs, and delivered attributes are not advertised or used.

Ownership validation recomputes and verifies every identity dimension and the
canonical key, rejecting forged keys, mismatched local identity, geometry
aliases, and non-index identity kinds. Adversarial separator, length-prefix,
digit, empty-looking, and composed/decomposed Unicode vectors prove the
serialized key remains collision-resistant without normalizing literal layer or
revision strings.

The focused A2 suite now passes 12/12 tests, the A1 suite passes 20/20, the A0
suite passes 11/11, and the full existing suite passes 151/151.
