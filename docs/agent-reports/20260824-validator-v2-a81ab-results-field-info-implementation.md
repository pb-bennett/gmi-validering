# Validator 2.0 A8.1A browser correction and A8.1B field information

- Date: 2026-08-24
- Branch: `feature/validator-v2-a8-results-workflow`
- Scope: browser-driven A8.1A correction plus approved A8.1B only
- Excluded: A8.1C table handoff, new validation rules, engine changes, commit, push, merge, and deployment

## Browser feedback addressed

The original A8.1A result workflow was functionally correct but too bulky in
the browser. This revision removes redundant visible status badges, reduces row
and summary density, collapses the filter controls by default, replaces the
status/sort native dropdowns with small custom menus, adds reset control, and
adds the real field-information action.

## Compact result workflow

`ValidationV2RuleList.js` now renders collapsed rows with the short canonical
field name, one colored round status indicator, and a compact disclosure
chevron. `Oppfylt`, `Delvis oppfylt`, and `Ikke oppfylt` are not visible in the
normal row, but remain available through the dot's accessible label/title and
the disclosure button's accessible name. The dot uses explicit green, amber,
and red tokens and is therefore not the sole assistive-technology status
carrier.

Rows use reduced gaps and padding while retaining a keyboard-sized button and
visible focus ring. Expanded content uses a plain compact count grid instead of
large metric cards. It shows `Objekter i grunnlaget`, `Bestått`, `Må rettes`,
`Må vurderes`, and non-zero `Ikke kontrollert`. Individual objects, source
indexes, FindingGroups, and A8.1C table actions remain absent.

The one-open accordion behavior is unchanged and remains reducer-backed:
opening another row closes the previous row, toggling the current row closes
it, sorting retains a visible expansion, filtering/search hiding the row closes
it, and geometry/layer/result transitions close it. Layer/result transitions
also clear search/status while preserving the preferred sort.

## Filter, sort, and reset controls

`ValidationV2Workspace.js` now shows only a compact filter icon, sort icon, and
reset icon in the permanent toolbar. The filter panel is closed by default and
contains the search field, `Alle`, `Krever oppmerksomhet`, and the three exact
status options. An active-filter dot makes non-default filtering apparent.

The sort icon opens a lightweight keyboard-accessible menu for:

- Status – krever oppmerksomhet
- Navn A–Å
- Navn Å–A
- Instruksrekkefølge

Menus close on selection, Escape, and outside pointer interaction. Status and
sort no longer use native selects. The layer selector remains the existing
native layer control and is unrelated to status/sort.

`Nullstill filter og sortering` restores empty search, `ALL`, and attention
sort, collapses the presentation state, and never invokes validation.

## A8.1B field information

`field-information.json` now contains the approved 20-field canonical registry
with exact short names, conservative audited descriptions, formats/units where
supported, source/page references, verified value labels where available, and
explicit partial/pending documentation status. It does not contain executable
requiredness or allowed-value policy. The Validator 1.0 `fields.json` is not
imported.

`registry/fieldInformation.js` validates IDs, geometry scopes, documentation and
source status, source references, value-information shape, and geometry
overlays. `composeFieldInformation` combines static documentation with the
canonical registry's literal GMI source column and the active executable rule.
Requiredness and allowed values shown in the modal therefore come from the
selected rule.

`ValidationV2FieldInfoModal.js` provides:

- accessible `role="dialog"`, `aria-modal`, and labelled heading;
- Escape close, focus-on-open, focus trapping, and opener focus restoration;
- background-blocking overlay and visible focus styles;
- `Instruks` and `Fildata` tabs with tablist/tab/tabpanel semantics;
- Arrow/Home/End tab navigation and roving tab index;
- explicit missing-documentation fallback: `Ikke dokumentert i kontrollert kildemateriale`.

The Instruks tab renders canonical identity, source GMI column, applicability,
active-rule requiredness, description, format/unit/range/qualification, exact
active allowed values, verified value meanings, and source/page references.
Static value metadata is used only to explain tokens; it cannot alter the
runner.

## Fildata aggregation

`src/lib/validation-v2/fieldData.js` implements lazy aggregation. The modal
does not scan on open or while Instruks is selected. Scanning begins only when
Fildata is selected and uses the current selected dataset, current immutable
V2 result, dataset revision, geometry, existing result schema binding, and
existing A3/A4 extraction functions. It does not rerun schema binding or
validation.

The summary includes binding/source columns, object count, with-value count,
missing count, unresolved count, exact unique bucket count, deterministic rows,
and omission count. The table uses:

`Levert verdi | Tolket verdi | Antall | Andel | Regelverdi`

For allowed-value rules, `Regelverdi` calls the existing
`evaluateRequiredAllowedValue` with the rule's existing comparison policy. It
does not implement a second includes or normalization policy. Required-only
rules omit that column.

Delivered source lexemes are primary bucket identity when available. Typed
fallback keys preserve primitive type distinctions, including `-0`, strings,
numbers, booleans, null, and undefined. Empty, null, not delivered, unresolved,
and conflict representations remain deliberate and separate. The private
lexical Symbol is accessed only through the existing extractor's selected-field
path and is never enumerated or placed in UI/state.

Results are cached in a module-local per-dataset WeakMap with an eight-entry
LRU. Cache values are frozen, memory-only, and keyed by layer, revision,
geometry, canonical field, rule, and binding signature. The table renders at
most 500 deterministic rows and reports `Viser 500 av N unike verdier` when
needed.

## Performance and rendering

Search, status filtering, sorting, reset, menus, accordion transitions, and
geometry selection operate on the small rule presentation model and do not call
`runGmiValidationV2`. Presentation derivations are memoized in the workspace.
Fildata scanning is deferred, cached, bounded, and not repeated on ordinary
modal rerenders. No worker or UI dependency was added.

## Regression boundary

No validation runner, parser, lexical-evidence implementation, rule registry,
evaluator, ObjectRef, dataset-revision, store, table, map, Profile Analysis, or
telemetry implementation was changed. Existing A0-A8 tests continue to verify
the rule inventory, parser lexical behavior, findings, counts, ObjectRefs,
geometry isolation, immutable results, and one-run architecture.

A8.1C remains intentionally unimplemented. In particular, there is no
`Vis avvik i tabell`, fail-only table subset, table-store action, or shared table
integration.

## Checks

Passed:

- focused A8.1A results workflow tests
- focused A8.1B field-info/Fildata tests
- A0-A8 Validator tests
- parser lexical tests
- Testmodus and statistics tests
- full Node suite: 254/254
- focused ESLint on touched A8.1A/A8.1B source and tests
- `npm run build`
- `git diff --check`

The build emitted only the existing Browserslist age notice. No browser test
harness was added. Manual browser keyboard/screen-reader QA remains required
for row focus, menu close behavior, modal focus trapping/opener restoration,
exact keyboard tab navigation, and pre-data Testmodus activation.
