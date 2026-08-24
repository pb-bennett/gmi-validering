# Validator 2.0 A8.1A compact results workflow implementation

- Date: 2026-08-24
- Branch: `feature/validator-v2-a8-results-workflow`
- Scope: A8.1A only; no A8.1B field inspection, A8.1C table handoff, new validation rules, commit, push, merge, deployment, or engine changes

## Implemented

### Aggregate presentation status

`src/lib/validation-v2/resultPresentation.js` contains the pure
`getValidationV2AggregateStatus` selector. It derives `applicableCount` from
PASS, FAIL, and INDETERMINATE counts and returns stable enum, Norwegian label,
attention rank, visual token, reason code, and applicable count metadata.

The approved precedence is preserved:

- FAIL with no PASS -> `NOT_MET` / `Ikke oppfylt` / red
- Any other FAIL or any INDETERMINATE -> `PARTIALLY_MET` / `Delvis oppfylt` / amber
- PASS with no FAIL or INDETERMINATE -> `MET` / `Oppfylt` / green
- No applicable evaluations -> `PARTIALLY_MET` / `Delvis oppfylt` / amber

The helper does not mutate counts, findings, results, or `EvaluationState`.
`uiIntegration.js` delegates its compatibility status selectors to this helper
so there is no second status implementation.

### Canonical short-name registry

`src/data/validation-v2/field-information.json` contains the 20 active
canonical field entries and their exact A8.1A display names. Each entry has
geometry applicability, empty source placeholders, and an explicit
`PENDING_A8_1B` documentation status. Shared fields use one canonical entry
for point and line contexts.

`src/lib/validation-v2/registry/fieldInformation.js` validates and deeply
freezes the registry. Validator 2.0 does not import Validator 1.0's
`fields.json`.

### Compact list and accordion

`ValidationV2Workspace.js` now owns local presentation state for search, status
filter, sort, and one expanded rule key. `ValidationV2RuleList.js` renders
compact rows with only the canonical short name, visible status text, colored
status dot, and disclosure control.

Expanded content is a compact count summary:

- `Objekter i grunnlaget`
- `Bestått`
- `Må rettes`
- `Må vurderes`
- `Ikke kontrollert` when non-zero

The old `FindingGroups` and individual object/source-index list are no longer
rendered by Validator 2.0. No table handoff or placeholder action was added.

The disclosure is a real button with stable `id`, `aria-expanded`, and
`aria-controls`. Its summary is a sibling region, so no interactive action is
nested in the heading. Native button keyboard behavior and visible focus
styles are retained. Only one expanded key exists at a time. Opening another
row replaces the key; clicking the current row clears it. Sorting retains a
visible expansion. Search/status changes clear it if the row is hidden.
Geometry changes, layer changes, and new validation results clear the expanded
row. Layer and new-result transitions also clear search and status filters but
retain the preferred sort mode.

### Search, filter, and sort

All operations are pure presentation derivations and do not invoke
`runGmiValidationV2`.

- Search is case-insensitive Norwegian substring matching against the short display name only.
- Status filters are `ALL`, `ATTENTION`, `NOT_MET`, `PARTIALLY_MET`, and `MET`.
- `ATTENTION` includes red and amber aggregate statuses.
- Counts are calculated for the active geometry and after search, before the selected status filter.
- Sorting supports attention order, Norwegian name ascending/descending, and exact registry order restoration.
- Name sorting uses `Intl.Collator('nb-NO', { sensitivity: 'base', numeric: true })` with registry index tie-breaking.
- Point and line universes remain 17 and 18 active controls respectively; the header remains the overall 23-rule count.

### Testmodus relocation

`TabSwitcher.js` is now the always-mounted shared top toolbar. It conditionally
renders `Kartoversikt` and `3D-visning`, but always mounts `TestModeControl` so
the exact `?testmodus=1` activation effect remains active before data exists.
The compact amber Testmodus pill appears immediately after the view controls.
The old fixed bottom-left floater is removed. Activation, hydration, query
cleanup, persisted `settings.testMode`, disable behavior, and telemetry
protection remain unchanged. `page.js` no longer mounts a second standalone
Testmodus control.

## Validation engine regression proof

No engine, parser, lexical-evidence, canonical binding, ObjectRef, result
contract, rule registry, evaluator, or runner file was changed. The only V2
runtime status change is presentation delegation from `uiIntegration.js` to the
pure selector. Existing A8 parser-to-runner lexical tests, rule inventory tests,
geometry tests, count-reconciliation tests, immutable-result tests, and
one-run controller tests all pass. This preserves the approved A8 rules,
counts, findings, ObjectRefs, lexical evidence, and one-run architecture.

The representative synthetic A8 run remains covered by the existing
multi-thousand-object test and passes unchanged: 23 rule results, 1,500 points,
1,500 lines, zero findings for valid data, and all reconciliation equations.

## Checks

Passed:

- `node --test tests/validationV2GmiA81ResultsWorkflow.test.mjs` — 7/7
- A6/A7/A8 focused Validator tests — 30/30
- Focused Testmodus, stats, and A8.1A tests — 13/13
- `node --test "tests/*.test.mjs"` — 247/247
- `npm run build` — passed; existing Browserslist age notice only
- Focused ESLint for all touched A8.1A source/test files, excluding the unrelated existing `page.js` hook diagnostic — passed
- `git diff --check` — passed

The full touched-file ESLint invocation still reports the pre-existing
`react-hooks/set-state-in-effect` diagnostic at `src/app/page.js:113` in the
statistics cue effect. A8.1A only removes the old TestMode import/mount from
that file and does not alter the diagnosed effect.

Manual browser keyboard and screen-reader QA remains required for the accordion
focus behavior, filtering while expanded, toolbar placement, and Testmodus
activation before and after data hydration.

## Files changed

Production:

- `src/app/page.js`
- `src/components/TabSwitcher.js`
- `src/components/TestModeControl.js`
- `src/components/validation-v2/ValidationV2RuleList.js`
- `src/components/validation-v2/ValidationV2Workspace.js`
- `src/data/validation-v2/field-information.json`
- `src/lib/validation-v2/index.js`
- `src/lib/validation-v2/registry/fieldInformation.js`
- `src/lib/validation-v2/resultPresentation.js`
- `src/lib/validation-v2/uiIntegration.js`

Tests:

- `tests/esmJsLoader.mjs`
- `tests/statsUiContract.test.mjs`
- `tests/testMode.test.mjs`
- `tests/validationV2GmiA6.test.mjs`
- `tests/validationV2GmiA7.test.mjs`
- `tests/validationV2GmiA8.test.mjs`
- `tests/validationV2GmiA81ResultsWorkflow.test.mjs`

The approved planning record
`docs/agent-reports/20260824-validator-v2-a8-results-workflow-plan.md` was
left unchanged.
