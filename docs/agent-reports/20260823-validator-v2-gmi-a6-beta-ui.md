# Validator 2.0 GMI-A6 beta UI integration

- Date: 2026-08-23
- Scope: GMI-A6 first beta UI integration
- Runtime namespace: `src/lib/validation-v2/`

## Files changed

Added:

- `src/components/validation-v2/ValidationV2ErrorBoundary.js`
- `src/components/validation-v2/ValidationV2Workspace.js`
- `src/lib/validation-v2/datasetRevision.js`
- `src/lib/validation-v2/uiIntegration.js`
- `tests/validationV2GmiA6.test.mjs`
- this report

Updated:

- `src/components/FieldValidationSidebar.js` with the isolated mode selector
  and V2 workspace host.

No parser, legacy rule, telemetry, production configuration, map, or data-table
implementation was changed.

## Existing application architecture

The current application mounts `FieldValidationSidebar` from `src/app/page.js`
when the existing `ui.fieldValidationOpen` state is active. The legacy sidebar
reads `state.data` and calls `validateFields()`. It remains the default path.

Uploads parse a file, create a layer through `addLayer({ file, data })`, and
also retain the same parsed dataset in legacy `state.data`. Layers are stored as
`layers[layerId]` with `id`, `name`, `data`, and visibility state; `layerOrder`
stores their display order. `ui.expandedLayerId` identifies the layer currently
expanded in the existing layer manager. Layer controls previously opened the
legacy field-validation sidebar without passing layer ownership.

Parser output uses `data.format` as authoritative format metadata. The inspected
parsers produce `GMI`, `SOSI`, or `KOF`; the GMI parser also provides
`points[]`, `lines[]`, `fieldAnalysis`, and feature `attributes` objects.

## Mode selector and legacy behavior

`FieldValidationSidebar` now contains a keyboard-usable two-button selector:
`Validator 1.0` and `Validator 2.0 (beta)`. Local state defaults to
`legacy`, so the existing validator remains the initial and unchanged
implementation. The legacy sidebar is kept in a separate
`LegacyFieldValidationSidebar` component and is not rewritten to use V2.

Selecting beta mounts `ValidationV2Workspace` inside
`ValidationV2ErrorBoundary`. Switching back unmounts the V2 workspace and
restores the existing legacy workspace. V2 results are local component state and
are not added to Zustand or persisted.

## Selected-layer ownership

The beta workspace has an explicit `Lag som kontrolleres` selector populated
only from current `layerOrder` entries with layer data. The existing
`expandedLayerId` is used only as the initial selection hint. The selected layer
is always resolved as `layers[selectedLayerId]` and the runner input is built as:

```text
{
  layerId: selectedLayer.id,
  dataset: selectedLayer.data,
  datasetRevision,
  sourceFormat: 'gmi'
}
```

No global `state.data`, merged data, visible-layer aggregation, or
`getVisibleLayersData()` path is used. There is no validate-all-layers action.
Affected rows use A5 `ObjectRef.key` as their React key and display only
geometry-local labels such as `Punkt 1` or `Linje 1`.

## Dataset revision

No existing application revision token accurately identified an in-memory
dataset instance. `datasetRevision.js` therefore uses a module-local
`WeakMap<object, string>`. The first request for a dataset object receives an
opaque generated `v2-...` token using `crypto.randomUUID()` where available,
with a local random/time/sequence fallback. The same object retains its token;
a replacement object receives a new token. The mechanism does not inspect or
mutate dataset contents and does not derive identity from filenames, layer
names, coordinates, object values, or customer metadata.

## GMI-only gating

`isGmiLayer()` checks the authoritative parsed `selectedLayer.data.format ===
'GMI'`. `createValidationV2Input()` returns no runner input for SOSI, KOF, or
other formats. The workspace instead displays the concise Norwegian message
`Validator 2.0 beta støtter foreløpig GMI-data.` No GMI validation is attempted
for unsupported formats.

## V2 run lifecycle

The user starts validation with `Kjør Validator 2.0`. The actual synchronous A5
runner is called directly without an artificial delay; the button exposes the
real running state as `Validerer ...` while disabled. Runner exceptions are
caught locally, logged only to the developer console, and represented by a
generic beta-specific Norwegian error message. No raw error details or stack
traces are rendered.

Results are rendered only when their layer ID and dataset revision match the
currently selected layer. A changed selection, removed layer, or replacement
dataset therefore cannot display the old result as current. Explicit selection
also clears local result/error state immediately.

## V2 component structure

- `ValidationV2Workspace.js` owns local selection, run, expansion, and error
  state and consumes `runGmiValidationV2()`.
- `ValidationV2ErrorBoundary.js` contains render/runtime failures outside the
  workspace event handler and preserves the application shell.
- `uiIntegration.js` contains small integration helpers for format gating,
  explicit runner-input construction, current-result checks, and safe object
  labels.
- The existing `FieldValidationSidebar.js` is the neutral host for the mode
  selector and keeps legacy presentation isolated from the V2 workspace.

## Summary and coverage presentation

The V2 header identifies `Validator 2.0`, `Beta - begrenset regeldekning`, and
GMI support. It states that three rules are currently checked. After a run, the
compact summary displays the selected layer, active rule count, FAIL finding
count, INDETERMINATE finding count, point count, and line count.

Rule statuses are derived from A5 rule-result counts and metadata, not raw data:

- FAIL is shown as `Må rettes`.
- INDETERMINATE is shown as `Må vurderes`.
- all evaluated objects passing is shown as `Bestått`.
- no evaluated objects is shown as `Ikke kontrollert`.
- mixed pass/not-evaluated results are shown neutrally as `Delvis kontrollert`.

FAIL and INDETERMINATE counts remain separate. No prevalence or new severity
policy is introduced.

## Rule results and affected objects

All three A5 rule results are listed using the registry title and result counts:
pass, FAIL, INDETERMINATE, and NOT_EVALUATED. Each rule is an accessible
button with `aria-expanded`; expansion shows its A5 findings and affected
layer-qualified ObjectRefs.

Finding rows display only a neutral point/line label, translated stable reason
code, expected primitive values where present, and primitive observed/conflict
values where available. Coordinates, parser IDs, GUIDs, arbitrary attributes,
and operational identifiers are not displayed. Reason-code translation is
limited to the seven existing A5 reason codes and is presentation-only.

## Unknown fields

The workspace retains A5 `sourceFieldDiagnostics` and exposes them through a
compact `Andre felt i datasettet` disclosure. It reports counts for unknown
fields and known-but-unsupported names. These diagnostics are informational and
do not contribute to the FAIL count. No unknown-field values are read or
displayed, and no mislabel inference is attempted.

## Accessibility and responsive behavior

The mode selector uses semantic buttons with pressed state. Layer selection uses
a labelled native `select`. Rule expansion uses semantic buttons with
`aria-expanded`; the unknown-field section uses native `details`/`summary`.
Status text accompanies visual border/background cues, so color is not the sole
distinction. The workspace uses the existing utility-class styling and a
responsive two/three-column summary grid that remains usable in the existing
sidebar at smaller widths.

## Tests and verification

`tests/validationV2GmiA6.test.mjs` contains eight focused synthetic tests for:

- legacy-default mode and isolated V2 host;
- two-layer explicit ownership and layer-qualified results;
- stale-result rejection on layer/revision changes;
- WeakMap dataset revision stability and replacement behavior;
- authoritative GMI-only gating;
- A5-only workspace boundaries and absence of all-layer/map/table paths;
- geometry-local affected-object labels and identity keys;
- summary, status, unknown-field, and accessibility presentation contracts.

Verification results:

- A6 tests: `8/8`
- A5 tests: `21/21`
- A4 tests: `15/15`
- A3 tests: `16/16`
- A2 tests: `12/12`
- A1 tests: `20/20`
- A0 tests: `11/11`
- Full Node suite (`node --test`): `219/219`
- Frontend build (`npm run build`): passed
- Changed-file ESLint: passed
- `git diff --check`: passed

No operational or customer files were used. A browser manual smoke run was not
performed in this environment; the build and synthetic integration tests cover
the selected-layer, format, revision, run, rendering-boundary, and error
containment decisions.

## Sol review correction

Rules with zero applicable objects now display `Ikke kontrollert` and can no
longer fall through to `Bestått`. Behavioral regressions cover point-only rules
with no points, line-only rules with no lines, empty datasets, normal passing
objects, FAIL and INDETERMINATE precedence, and meaningful mixed
NOT_EVALUATED results. The resulting focused A6 suite remains `8/8`, the A5
suite remains `21/21`, the full suite is now `219/219`, and the frontend build
continues to pass.

## A5 compatibility and explicit non-goals

A6 consumes the existing A5 public runner and rule registry without changing
rule semantics, evaluator behavior, result states, provenance, or the three-rule
set. The legacy validator remains selectable and default.

This slice does not add map navigation, map/table synchronization, table
redesign, virtual required-field columns, validation rules, hydraulic
classification, custom profiles, possible-mislabeled-field inference, parser
changes, legacy rule changes, telemetry, persistence of V2 results, deployment,
or production wiring beyond the local UI host.

## Recommended next slice

The next step is user beta testing against real GMI files. Review whether the
three source-backed checks, status separation, selected-layer behavior, and
affected-object presentation are understandable and useful before selecting a
follow-up slice. Do not expand rule coverage automatically.
