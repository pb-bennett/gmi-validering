# S5A Validator list styling reconnaissance

Date: 2026-09-23. Read-only source review at `7bdd89607f090f7aa5b0434dc022a14030eb5717` on `feature/styling-overhaul-integrated`. Repository root is `C:/GitHub/gmi-validering-test`; initial `git status --short` was empty. This report prepares S5A only; no application source, tests, or other docs were changed.

## Ownership and slice boundary

| Surface | Owner | S5A scope |
| --- | --- | --- |
| Validator root, layer selector, geometry tabs/counts, object totals, filter/sort/reset controls and panels, no-layer/unsupported/loading/run-error messaging, unknown-field disclosure | `src/components/validation-v2/ValidationV2Workspace.js` | In scope for appearance-only edits. This file also contains S5B inspector mounting and state; leave those branches and their props/callbacks intact. |
| Rule rows, aggregate status dot, Feil/Sjekk/Pass counts, expansion and Vis action | `src/components/validation-v2/ValidationV2RuleList.js` | In scope for appearance-only edits. |
| Validator error fallback | `src/components/validation-v2/ValidationV2ErrorBoundary.js` | In scope for error-panel appearance only. |
| Validator footer Kontakt access and outer feature wrapper | `src/components/FieldValidationSidebar.js` | In scope only for the Validator branch/footer. The legacy validation implementation earlier in this file is a separate, out-of-slice surface. |
| Filter, sort, presentation state, status precedence/count aggregation | `src/lib/validation-v2/resultPresentation.js` | Behaviour owner; do not edit for S5A styling. |
| Status dot role mapping | `src/components/validation-v2/ValidationV2RuleList.js` (`STATUS_DOT_CLASSES`) | Presentation mapping; keep semantic red/amber/green distinctions. |

There is no explicit empty/no-match component today: the rule list renders an empty bordered container when `presentations` is empty. A future S5A empty message belongs at the `ValidationV2Workspace` call site around `ValidationV2RuleList`, distinguishing zero active results from an empty filtered result if a message is added. Preserve the existing loading, no selected layer, unsupported format, run failure, schema warning, and unknown-field messages.

S5B owns the details surface and its presentation. Do not touch `src/components/validation-v2/ValidationV2FieldDetailContent.js`, `ValidationV2FieldInspector.js`, `ValidationV2FieldInfoModal.js`, or `fieldDetailLayout.js`; these implement shared rule details, docked inspector, fallback modal, detail tabs, field/result states, actions, and docking geometry. Do not change the `selectedValidatorField` conditional rendering, inspector portal, `inspectorHost`, field opener/focus restoration, or detail props in `ValidationV2Workspace.js`. The legacy `FieldDetailModal.js` imported by the legacy branch is also outside S5A.

## Current visual-state inventory

The Validator uses many legacy `gray-*` surfaces/text/borders, blue selected/focus treatments, and browser-native `<select>`/`<input type="search">`. Density is intentionally compact: 8px workspace gutters, 8px header/control padding, 32px icon controls, 11–12px labels, 10–11px counts, 40px minimum rule rows, and a 2-column status filter grid. The shell fixes the left column at the current 380px default, with a 76px ProductHeader above the feature slot; the list scrolls inside a `min-h-0 flex-1 overflow-y-auto` region. Keep these allocation and scroll classes intact.

- Header/selection: white compact header, Validator title, close icon; native layer select. Geometry tabs show Punkter/Ledninger and raw counts, with blue underline/text for the selected geometry.
- Summary/status: object count, failure and check counts in neutral text; amber schema-coexistence notice is semantic warning.
- Filters/sort: filter active state and dot are blue; native search input; selected status filter is blue; sort menu uses a white elevated panel and blue focus. Reset is disabled until search/status/sort state changes. Menu dismissal uses outside pointer and Escape listeners.
- Rule rows: red, amber, green status dots from `presentation.status.visualToken`; names truncate; row is hover-gray and gets an inset blue keyboard focus ring. The button's `aria-expanded`/`aria-controls` owns expansion. Expanded metrics are deliberately `flex-nowrap`; Feil is red, Sjekk amber, Pass green. The Vis action currently uses slate/cyan rather than the three status colors.
- Empty/error/access: no explicit no-match copy; several plain muted empty/loading messages; run and error-boundary messages use red. Validator has a separate, very compact white Kontakt footer. AppInfo Om is not in this footer: S3A moved it to the persistent `ProductHeader` in `WorkspaceShell`.

S1 provides `text-gmi-*`, `bg-gmi-*`, `border-gmi-*`, `ring-gmi-interactive`, and related semantic utilities. S2 provides `.gmi-elevated-surface`, `.gmi-compact-button`, `.gmi-focus-ring`, `.gmi-compact-field`, `.gmi-selected-control`, and `.gmi-primary-control`. These are candidates for neutral surfaces, native field boundaries, buttons, selection, and focus. They do not replace semantic error/warning/success colours; S1 explicitly deferred those mappings. Brand cyan `#53EAFD` and interactive cyan `#007595` have separate roles.

## Protected behavior and geometry

- Preserve status vocabulary and order Feil → Sjekk → Pass; the displayed Sjekk count includes `checkCount + indeterminateCount`. Status aggregation gives Feil precedence, then Sjekk, then Pass; not-evaluated-only owners are omitted. Never repurpose the status colors as brand colors.
- Search is trimmed, Norwegian-locale case-insensitive matching on `displayName`. Status filtering supports Alle, Krever oppmerksomhet (Feil or Sjekk), Feil, Sjekk, Pass. Sort modes are attention order, Norwegian A–Å, Å–A, and registry order; ties retain registry order. Filter counts reflect the searched universe before the selected status filter. Reset restores default presentation.
- Preserve click-to-expand, one expanded key, collapse when the open row is filtered out, geometry/layer/new-result reset rules, active geometry selection, layer selection, callbacks, and exact result freshness behavior.
- Preserve native layer select/search semantics, all labels/ARIA relationships, tab roles/selection, radio-menu checked states, keyboard focus rings, outside-click/Escape dismissal, rule-row button semantics, and focus restoration from detail views.
- Do not add keys/remounts or move state across the Validator branch. `WorkspaceShell` conditionally mounts Validator vs normal Sidebar; the Validator controller, validation reruns, cleanup, reset, and store callbacks belong to that lifecycle.
- Preserve root `flex/min-h-0/overflow-hidden`, the scroll region, and footer `mt-auto` reachability. Sidebar stays 380px by default (normal-sidebar resize bounds remain 200–800px); S5A must still fit at 380px and at the existing compact/narrow viewport. Stats suppression is owned by `src/app/page.js`: the floating Stats trigger is hidden while the layer data table or docked inspector is open. AppInfo and Kontakt access remain available through `ProductHeader` and the Validator footer.
- Long rule labels already truncate; layer option labels rely on native select rendering and may clip. Long sort label “Status – krever oppmerksomhet” and filter label “Krever oppmerksomhet” must fit without widening the sidebar or causing horizontal page overflow.

## Relevant tests

- `tests/validationV2GmiA81ResultsWorkflow.test.mjs` — protects aggregate status precedence, suppression, canonical-field grouping/counts, geometry reuse, schema warning, and the Pass/Sjekk/Feil UI vocabulary. Run after S5A; retain every behavioral assertion.
- `tests/validationV2WorkspaceInspector.test.mjs` — protects 380px width, compact one-row expanded metrics/Vis action (including current exact density class assertions), shell layout, inspector ownership, lifecycle, and table/docking independence. Run after S5A. If the approved visual treatment necessarily changes the asserted metric density classes, update only those styling-specific assertions to the new intended compact contract; do not weaken width, one-row, inspector, or lifecycle checks.
- `tests/validationV2RulePresentation.test.mjs` — protects presentation composition and aggregate Pass semantics; useful after touching rule-list presentation wiring.
- `tests/validationV2GmiA81FieldInfo.test.mjs` — protects field info and data presentation behind the Vis/details path; run as a boundary regression if the rule-row opener changes (it should not).
- `tests/objectTableInspection.test.mjs` — protects Validator-triggered object inspection and selected geometry/table contracts; run as a boundary regression when editing the shared Workspace component.
- `tests/mapPaneToolbar.test.mjs` and `tests/statsUiContract.test.mjs` — protect Stats suppression and independent modal access relationship; run after Workspace/shell-adjacent changes.

The source-level `validationV2GmiA81ResultsWorkflow` check for status vocabulary is intentional and should remain. The `validationV2WorkspaceInspector` regexes for the exact `flex-nowrap` and 10/11px metric sizes are presentation assertions that may be adjusted if S5A changes their visual recipe; assertions about 380px, same-row fit, ownership, lifecycle, callbacks, and inspector geometry are behavioral/geometry contracts and must not be weakened. No test file should be changed as part of this reconnaissance.

## Recommended implementation order and risks

1. Style `ValidationV2RuleList.js`: migrate neutral row/list/surface/text/focus treatment while keeping semantic status dots/counts and the nowrap metrics row. Inspect long names and the expanded Feil/Sjekk/Pass + Vis row at 380px.
2. Style only the list-side blocks in `ValidationV2Workspace.js`: header, native layer control, geometry tabs/counts, toolbar, sort/filter panels, zero-match treatment, and neutral supporting text. Preserve class-driven geometry, menu positioning/z-index, IDs/ARIA, and all handlers. Avoid edits to inspector JSX/state.
3. Style the dedicated error fallback and Validator-only Kontakt footer in `ValidationV2ErrorBoundary.js` and `FieldValidationSidebar.js`; preserve red error meaning and footer reachability.
4. Run the targeted tests above; review 380px and narrower browser widths, long labels, scrolling, and keyboard interaction.

Main traps: `ValidationV2Workspace.js` mixes S5A list controls and S5B inspector implementation; scope any patch narrowly. `min-h-0`, `flex-1`, `overflow-y-auto/hidden`, fixed 32px controls, `min-w-0`, truncation, two-column filters, absolute sort menu, and `flex-nowrap` affect geometry. Wrapping or larger type/padding can push the count/Vis row or filter labels past 380px. Keep domain status red/amber/green distinct from cyan branding. Ensure the footer remains visible/reachable when results scroll. At narrow width, test the longest search/filter/sort labels and browser-native select/search appearance; do not change native control types or their widths to mask a styling issue. Current rule list has no no-match copy, so introducing one must account for filtered result count without changing filtering behavior.

## Browser review checklist

- At 380px, inspect header/select, geometry tabs/counts, object summary, toolbar, and all status filters.
- Open search/filter and sort panels; check longest labels, selected states, menu clipping/z-order, reset disabled/enabled states, outside click, and Escape.
- Search for a match and a no-match; exercise each status filter and all sort modes. Confirm counts/order and stable geometry.
- Inspect long/truncated rule labels and expanded rows containing Feil, Sjekk, Pass, and Vis together; keyboard-expand, tab through controls, and verify visible focus.
- Scroll a long result set to the bottom and confirm Kontakt stays reachable; check no horizontal overflow at compact/narrow widths.
- Confirm warning/error/success hues remain semantic, and loading, unsupported layer, run error, error boundary, and unknown-field disclosure remain legible.
- Open Vis once in docked desktop and once in fallback width; verify S5B appearance/geometry is unchanged. Confirm the Stats trigger suppression relationship and Om/Kontakt access remain intact.

## Final proposed scope

1. Exact proposed S5A file set: `src/components/validation-v2/ValidationV2Workspace.js` (list/control JSX only), `src/components/validation-v2/ValidationV2RuleList.js`, `src/components/validation-v2/ValidationV2ErrorBoundary.js`, `src/components/FieldValidationSidebar.js` (Validator footer only). Keep tests and `resultPresentation.js` unchanged unless a later authorized styling implementation requires narrowly updating presentation-only source assertions.
2. Exact S5B files/components to avoid: `src/components/validation-v2/ValidationV2FieldDetailContent.js`, `ValidationV2FieldInspector.js`, `ValidationV2FieldInfoModal.js`, `fieldDetailLayout.js`, and the inspector/portal/modal rendering branch and detail state/callback wiring inside `ValidationV2Workspace.js`; also legacy `src/components/FieldDetailModal.js`.
3. Relevant tests: `tests/validationV2GmiA81ResultsWorkflow.test.mjs`, `tests/validationV2WorkspaceInspector.test.mjs`, `tests/validationV2RulePresentation.test.mjs`, `tests/validationV2GmiA81FieldInfo.test.mjs`, `tests/objectTableInspection.test.mjs`, `tests/mapPaneToolbar.test.mjs`, `tests/statsUiContract.test.mjs`.
4. Biggest risks: shared Workspace file spans S5A and S5B; compact 380px metric/filter layout; flex/scroll/footer geometry; preserving Norwegian filter/sort semantics and keyboard/focus behavior; keeping semantic status colors separate from brand cyan.
5. Final `git status --short`:

   ```text
   ?? docs/agent-reports/20260923-s5a-reconnaissance.md
   ```
