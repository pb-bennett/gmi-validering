# Validator 2.0 GMI-A5 rule engine foundation

- Date: 2026-08-23
- Scope: GMI-A5 only
- Runtime namespace: `src/lib/validation-v2/`

## Files

Added:

- `src/lib/validation-v2/registry/rules.js`
- `src/lib/validation-v2/ruleEvaluation.js`
- `src/lib/validation-v2/validationRunner.js`
- `tests/validationV2GmiA5.test.mjs`
- this report

Updated:

- `src/lib/validation-v2/contracts.js` with rule/evaluation/finding/run
  contracts, stable A5 enums, and explicit rule categories.
- `src/lib/validation-v2/index.js` with the A5 runner and rule-registry query
  surface.
- `src/lib/validation-v2/temaIdentity.js` with the A4-aligned runtime guard for
  malformed attributes on an accepted Tema/S_FCODE binding.

No parser, legacy validator, store, UI, map, telemetry, or production wiring
was changed.

## Source basis and rule scope

The A5 rules were checked against the bundled Innmålingsinstruks main document,
its Vedlegg A code-table document, and the repository's
`20260820-innmalingsinstruks-rule-source-mapping.md` research. The research
marks the four starter rules READY/high-confidence. The seven exact
Høydereferanse codes are transcribed from Vedlegg A p. 7:

- `BUNN_INNVENDIG`
- `PÅ_BAKKEN`
- `SENTER`
- `TOPP_INNVENDIG`
- `TOPP_UTVENDIG`
- `UKJENT`
- `UNDERKANT_UTVENDIG`

Implemented rules are exactly:

- `innmaling.common.height-reference.required`
- `innmaling.common.height-reference.allowed-value`
- `innmaling.point.tema.required`
- `innmaling.line.tema.required`

No proposed rule was omitted from this four-rule set for lack of evidence. All
other fields, Tema allowed-value rules, geometry applicability rules, hydraulic
classification, Z checks, and profile rules remain deferred because the source
mapping identifies unresolved applicability, transcription, or domain-policy
questions.

## Rule registry

The separate frozen rule registry carries stable rule ID, canonical field ID,
geometry scopes, evaluator kind, category, title, description, fixed severity,
`STANDARD` provenance, source document/page metadata, and allowed values where
required.
Import-time and explicit guards reject duplicate IDs, unknown canonical fields,
invalid scopes/evaluator kinds, invalid severity/provenance, duplicate allowed
values, and missing source metadata.

The source-backed rules use fixed `ERROR` severity for explicit violations.
Severity is rule metadata, never a prevalence or percentage heuristic.
`INDETERMINATE` remains separate from violation severity.

## Public runner

`runGmiValidationV2({ layerId, dataset, datasetRevision, sourceFormat: 'gmi' })`
validates exactly one explicit selected layer. It calls A1 schema binding once,
creates A2 point/line ObjectRefs once, reuses those refs for enabled rules, and
calls A3/A4 only for the fields needed by the four rules. It reads no global
state, visible-layer collections, merged datasets, or alternate layers.

The immutable result retains layer/revision/source identity, the A1 schema
binding and source diagnostics, four rule results, and a compact run summary.
It does not include the dataset, all input objects, coordinates, or unrelated
attributes.

Evidence is cached once per canonical field and layer-qualified ObjectRef, so
the two height-reference rules reuse one A4 extraction per object. Finding
projections retain primitive observed values and provenance; caller-owned object
values are omitted from findings rather than frozen or exposed recursively.

## Evaluators and states

The generic required evaluator consumes existing A4 states without rereading
raw values:

- `VALUE_PRESENT` -> `PASS`;
- `FIELD_ABSENT` or `VALUE_MISSING` -> `FAIL`;
- `BINDING_AMBIGUOUS`, `UNRESOLVED_SOURCE`, or `SCHEMA_UNAVAILABLE` ->
  `INDETERMINATE`.

The generic allowed-value evaluator compares the raw A4 value against the
source-authorized set with exact `Object.is` semantics. `VALUE_PRESENT` is pass
or fail; `FIELD_ABSENT` and `VALUE_MISSING` are `NOT_EVALUATED` so the required
rule owns missingness; ambiguous, unresolved, and unavailable states are
`INDETERMINATE`.

For Tema required rules, A3 remains authoritative: `RESOLVED` passes, `MISSING`
fails, and `CONFLICT`/`UNRESOLVED_SOURCE` are indeterminate. A1 unavailable or
ambiguous schema states are represented as indeterminate runner evidence
without calling A3's intentionally rejecting API. A3 `FIELD_ABSENT` provenance
is retained through its binding state and produces the absent-specific required
reason.

No evaluator trims, case-normalizes, transliterates, parses, stringifies,
coerces, or rereads values. A4's raw missing policy and A3's Tema policy are
shared through `valueSemantics.js`.

## Findings and aggregation

Only `FAIL` and `INDETERMINATE` evaluations produce object-level findings.
Findings retain rule metadata, state, the layer-qualified ObjectRef, canonical
field, geometry, stable reason code, expected values where relevant, and compact
observed source/value or identity provenance. PASS and NOT_EVALUATED contribute
to counts without producing bulky success records.

Each rule result contains evaluated, pass, fail, not-evaluated, and indeterminate
counts, findings, and affected ObjectRefs derived directly from those findings.
The run summary contains total rules, rules with explicit failures, FAIL and
INDETERMINATE finding counts, and point/line object counts. Findings never use a
second index-only identity representation.

Unknown A1 source-field diagnostics are preserved unchanged at run level and do
not create validation findings. Possible mislabeled-field inference remains
outside A5.

Malformed runtime input, invalid dataset structure, or malformed bound feature
attributes remains a thrown contract error. This includes A3 Tema resolution
when an accepted Tema/S_FCODE binding meets a non-object attributes container.
It is never converted to a missing-field finding. Normal schema uncertainty is
represented as INDETERMINATE.

## Immutability and isolation

Rule metadata, registry arrays, rule results, findings, affected ObjectRefs, and
summary records are frozen. A1/A3/A4 evidence is consumed without mutation;
findings retain references only to already immutable metadata/refs or compact
copies. Raw values are retained without recursively freezing caller-owned raw
objects. The runner does not import legacy validation modules, parser modules,
stores, UI, map code, telemetry, or planning JSON.

## Tests

`tests/validationV2GmiA5.test.mjs` contains 22 focused synthetic tests covering
the exact rule registry and source values, one-layer input, required and
allowed-value evaluators, absent/missing/present/uncertain states, point/line
Tema rules and A3 compatibility, fallback/conflict behavior, cross-layer
identity, aggregation, unknown diagnostics, malformed data, targeted reads,
caller-input preservation, immutability, and architectural isolation. The full
current canonical field set is exercised through existing A4 generic coverage;
A5 does not copy the 41-field mapping table.

The added provenance regressions cover A1 schema ambiguity, separation of
accepted A4 object-value conflicts from unresolved source candidates, Tema
schema ambiguity, and Tema/S_FCODE value conflicts.

## Verification

- Targeted A5 tests: `22/22`
- A4 tests: `15/15`
- A3 tests: `16/16`
- A2 tests: `12/12`
- A1 tests: `20/20`
- A0 tests: `11/11`
- Full suite (`node --test`): `205/205`

## A0-A4 compatibility and explicit non-goals

A5 consumes A0 canonical fields and stable states, A1 schema bindings and
diagnostics, A2 layer-qualified ObjectRefs, A3 Tema identity, and A4 raw field
evidence. The only earlier-slice adjustment is the A3 malformed-bound-attribute
guard, aligned with A4's established runtime contract; normal A3 identity
semantics are unchanged.

This slice does not implement custom profiles, municipality/practice rules,
hydraulic classification, SDR/Ringstivhet/Trykklasse policy, all 41 rules,
possible-mislabeled-field analysis, SOSI/KOF parity, UI, map/table
synchronization, or production integration.

## Recommended next slice

The next slice should be GMI-A6, the first V2 beta UI. It should present V2 as
partial/beta coverage, clearly separate FAIL from INDETERMINATE, show rule-level
aggregates and affected layer-qualified objects, and keep the existing legacy
validator selectable and unchanged. It should consume this immutable run result
without adding rule policy to React.
