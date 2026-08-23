# Validator 2.0 A7 compact geometry tabs

- Date: 2026-08-23
- Scope: compact GMI beta UI and Høydereferanse rule consolidation
- Runtime namespace: `src/lib/validation-v2/`

## Files changed

Added:

- `src/lib/validation-v2/validationViewController.js`
- `tests/validationV2GmiA7.test.mjs`
- this report

Updated:

- `src/lib/validation-v2/contracts.js`
- `src/lib/validation-v2/ruleEvaluation.js`
- `src/lib/validation-v2/registry/rules.js`
- `src/lib/validation-v2/validationRunner.js`
- `src/lib/validation-v2/uiIntegration.js`
- `src/components/validation-v2/ValidationV2Workspace.js`
- `src/components/FieldValidationSidebar.js` visible legacy mode label
- A5 and A6 reports with the consolidated rule/count wording

No parser, legacy validation rule implementation, legacy field catalog, map,
data-table, telemetry, or production configuration was changed.

## Høydereferanse consolidation

The two user-facing Høydereferanse checks are now one active source-backed rule:

- `innmaling.common.height-reference.valid`

The rule uses a dedicated `REQUIRED_ALLOWED_VALUE` evaluator. It answers the
user question “Har objektet en gyldig Høydereferanse?” in one result while
retaining distinct missing-field, missing-value, and invalid-value reason codes.
Missing values are FAIL findings, not NOT_EVALUATED results. Binding ambiguity,
unresolved source evidence, and unavailable schema remain INDETERMINATE.

The exact seven source-authorized values are unchanged:

- `BUNN_INNVENDIG`
- `PÅ_BAKKEN`
- `SENTER`
- `TOPP_INNVENDIG`
- `TOPP_UTVENDIG`
- `UKJENT`
- `UNDERKANT_UTVENDIG`

The rule remains common to point and line geometry, has `STANDARD` provenance,
Vedlegg A source metadata, and fixed `ERROR` severity. No legacy
`fields.json` value set was used as authority.

## Active registry

The active beta registry now contains exactly three rules:

1. `innmaling.common.height-reference.valid`
2. `innmaling.point.tema.required`
3. `innmaling.line.tema.required`

The old Høydereferanse required and allowed-value rule IDs are no longer active.
Tema semantics and the exact A5 four-state distinction remain unchanged.

## One-run and geometry contract

One run still validates exactly one selected layer and may contain both points
and lines. A7 does not rerun validation when the user changes the presentation
tab. It continues to pass the explicit A6 input:

```text
{
  layerId: selectedLayer.id,
  dataset: selectedLayer.data,
  datasetRevision,
  sourceFormat: 'gmi'
}
```

Each rule result now includes:

```text
geometryBreakdown: {
  point: { evaluatedCount, passCount, failCount,
           notEvaluatedCount, indeterminateCount, findingCount },
  line:  { evaluatedCount, passCount, failCount,
           notEvaluatedCount, indeterminateCount, findingCount }
}
```

Top-level counts remain unchanged and are calculated from the same evaluations.
Point and line breakdown counts reconcile with whole-rule counts, including PASS
objects that do not produce findings. ObjectRef geometry is the authoritative
partition.

## Validator 1.0

The visible legacy mode label is now `Validator 1.0`. It remains the default
mode and continues to use the existing `validateFields()` path and UI. No legacy
validation behavior or result state was otherwise changed.

## Punkt/Ledning tabs

The compact V2 workspace presents accessible `Punkter` and `Ledninger` tabs
with geometry-local object counts. Both tabs are backed by the same completed
run result. The default is points when points exist, otherwise lines when only
lines exist; an empty dataset has a deterministic empty state.

The point tab shows only the common Høydereferanse rule and point Tema. The line
tab shows only the common Høydereferanse rule and line Tema. The opposite
geometry's Tema rule is not rendered as an empty row.

## Compact presentation

The large A6 summary cards and repeated beta explanation were removed. The
header now combines `Validator 2.0`, `Beta · GMI · 3 regler`, a compact layer
select, and the `Kjør` action. The selected geometry shows one compact summary
line with object, FAIL, and INDETERMINATE counts.

Each rule is a compact title/status row plus a count row. Status is derived from
the geometry breakdown and preserves this order: FAIL -> `Må rettes`,
INDETERMINATE -> `Må vurderes`, zero applicable objects -> `Ikke kontrollert`,
genuine all-pass -> `Bestått`, and mixed meaningful NOT_EVALUATED -> neutral
`Delvis kontrollert` or `Ikke kontrollert`.

## Finding grouping and show-more

Expanded rules group findings by stable `reasonCode` and, for invalid values,
the relevant safe primitive observed value. The translated reason is shown once
per group, followed by the affected geometry-local positions. Expected values
and conflict observations are shown once where useful.

Groups initially show at most 15 positions. Larger groups provide semantic
`Vis alle N` and `Vis færre` buttons. React identity remains the full
layer-qualified `ObjectRef.key`; source indexes are display positions only. No
coordinates, GUIDs, parser IDs, arbitrary attributes, or operational identifiers
are displayed.

Unknown A1 diagnostics remain a compact informational disclosure labelled
`Andre felt i datasettet · N`; they do not affect validation counts and their
values are not read.

## Accessibility

The geometry controls use semantic buttons with `role="tab"`,
`aria-selected`, and a labelled tab panel. The layer selector has a visible
label and native select semantics. Rule details and show-more controls are
semantic buttons with expansion state. Status text accompanies visual styling,
so color is not the only distinction. Existing responsive utility styling is
retained and the compact layout reduces sidebar scrolling.

## Tests and build

`tests/validationV2GmiA7.test.mjs` contains eight focused synthetic tests for
the three-rule registry, combined Høydereferanse states, geometry breakdown
reconciliation, one-run/tabs behavior, stable finding grouping, show-more
boundaries, and the Validator 1.0 label/default.

Verification results:

- A7 tests: `8/8`
- A6 tests: `8/8`
- A5 tests: `21/21`
- A4 tests: `15/15`
- A3 tests: `16/16`
- A2 tests: `12/12`
- A1 tests: `20/20`
- A0 tests: `11/11`
- Full Node suite (`node --test`): `220/220`
- Frontend build (`npm run build`): passed
- Changed-file ESLint: passed
- `git diff --check`: passed

No operational or customer data was used. Manual browser beta smoke is the
recommended next step; use a real GMI file to inspect both geometry tabs,
expand a grouped finding, switch layers, and confirm Validator 1.0 remains
usable.

## Sol review corrections

Finding grouping now uses deterministic typed structural encoding with explicit
primitive type, length prefixes, array boundaries, and array order. Numeric
encoding preserves the `Object.is` distinction between `0` and `-0`; delimiter
text in Tema conflict arrays cannot merge separate groups. Regression coverage
proves signed-zero separation, delimiter-bearing array separation, and ordinary
identical-evidence grouping.

Geometry tab state now initializes from the selected layer and changes only at
layer-selection transitions or explicit user tab actions. It no longer applies
a render-time line fallback, so empty Punkter and Ledninger tabs remain
selectable and user-authoritative. Behavioral coverage proves point-only,
line-only, and empty defaults plus explicit empty-tab selection without a new
run, revision, or result identity.

The `RuleDefinition` JSDoc now documents the active
`REQUIRED_ALLOWED_VALUE` evaluator and category. A behavioral presentation-view
regression proves both geometry views derive from one run/result while preserving
dataset revision identity, and a synthetic INDETERMINATE case verifies all
point/line breakdown counters reconcile with the whole-rule totals.

## Explicit non-goals

This slice adds no validation rules beyond consolidating the two existing
Høydereferanse checks, no Tema allowed-value rule, no map navigation, no table
redesign, no hydraulic classification, no profiles, no mislabel inference, no
parser changes, no legacy-rule changes, no telemetry, no persistence, no
deployment, and no production wiring.
