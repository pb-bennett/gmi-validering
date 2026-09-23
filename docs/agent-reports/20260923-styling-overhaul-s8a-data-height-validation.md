# S8A data inspection and height validation styling

Date: 2026-09-23. Starting SHA: `bf07d6c` (`Refresh map chrome styling`). Repository root: `C:/GitHub/gmi-validering-test`. Branch: `feature/styling-overhaul-integrated`. The starting working tree was clean.

## Active ownership

- `src/app/page.js` mounts `DataDisplayModal` and `ZValidationModal` directly. `DataDisplayModal.js` owns the native data tables, target detail views, layer selector, and data-inspector frame. The map popup handoff in `MapInner.js` and the store's target actions feed that component; they were inspected and left unchanged.
- `ZValidationModal.js` owns the height/Z results frame, summaries, missing-object lists, native tables, map-focus actions, and close control. `Sidebar.js`, `LayerPanel.js`, and `MapView.js` invoke the existing analysis or results modal; their data, rules, and targeting paths were left unchanged.
- The S6 `LayerDataTable.js` is a separate virtualized bottom table and was not edited.

## Files changed

- `src/components/DataDisplayModal.js`
- `src/components/ZValidationModal.js`
- This report

## Presentation changes

The data inspector now uses GMI Surface and Soft for its frame, header, table headers, and inset technical views; Border and Strong Border for seams and fields; Navy, Text, Muted, and Subtle for hierarchy; and Interactive for selected tabs and focus. Its native header, point, line, coordinate, and terrain tables remain compact, with their original cells, values, order, and table structure. The layer select uses `gmi-compact-field`; buttons use `gmi-compact-button` and `gmi-focus-ring`. The target-return and line-focus actions use a restrained neutral selected treatment. The data-inspector close glyph is regular Phosphor `XIcon` and has an explicit accessible name.

The Z modal frame, summary blocks, missing-object tables, headings, and controls use the same restrained palette. Missing-object counts are red when nonzero and green when zero; the existing no-missing result is green. Error text in data inspection remains red. No warning outcome was recolored; the existing amber/orange meaning remains untouched elsewhere. Cyan is reserved for interactive focus and selection. The Z close glyph is regular Phosphor `XIcon` with an accessible name.

## Protected contracts

The data inspector retains its `max-w-5xl h-[82%]` frame, outer stacking, `flex-1 overflow-auto` scroll owner, nested `max-h-60 overflow-auto` tables, `max-h-72 overflow-auto` attribute blocks, and existing sticky headers. The Z frame retains `max-w-4xl max-h-[85%]`, its body `overflow-auto`, the two `max-h-64 overflow-auto` table wrappers, sticky headers, and stacking. Native horizontal and vertical scrolling and browser scroll behavior were not rewritten. No virtualizer, sticky-column architecture, row measurement, or new scrolling logic was introduced.

All target checks and their handoffs remain: current data/layer fallback, popup target, layer select, point/line indexing, target detail and return actions, object focus, close/reopen, and map-focus handlers. No state action, event handler, data value, field name, ordering, terrain fetch, height/Z calculation, validation threshold, geometry check, result wording, or rule semantics changed. There is no change to portal ownership, Escape handling, or focus-restoration logic.

S6 `LayerDataTable.js`, its 28px rows, 36px gutter, 62/38 workspace split, virtualization, sticky columns, and interactions were untouched. S7 legend, measurement, popup, and diagnostics owners were untouched. S8B profile/terrain/standards presentation, S9 3D, S10 dialogs, S11 Stats, and S12 convergence were not started.

## Verification

- `git diff --check`: passed. Git emitted a local LF-to-CRLF working-copy warning for `ZValidationModal.js` only.
- `node --loader ./tests/esmJsLoader.mjs --test tests/objectTableInspection.test.mjs tests/featurePopupContent.test.mjs tests/profileAnalysisActiveDataCrash.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/validationV2GmiA7.test.mjs`: 38/38 passed. The existing experimental-loader warning appeared. Repository search found no direct tests rendering `DataDisplayModal` or `ZValidationModal`; these are the closest existing object inspection, map popup, active-data, workspace, and height-rule tests.
- `npm.cmd run build`: passed, including compilation, type checking, and static generation. The existing Browserslist age warning appeared; dependencies were not changed.

Browser review: pending. The available in-app browser failed during connection, before a tab could open, with `js: codex/sandbox-state-meta: missing field sandboxPolicy`. The requested target, long-value, missing-value, overflow, close/reopen, valid/invalid, and cross-feature rendered checks remain pending. No visual acceptance is claimed.

Deferred concerns: browser verification of native horizontal/vertical scroll, sticky headers, long values, focused targets, Z missing-object lists, and coexistence with the accepted S6/S7 surfaces. No calculation or targeting defect was changed or identified in this styling slice.

No commit, push, deploy, dependency update, branch switch, reset, stash, or clean was performed. Final `git status --short`:

```text
 M src/components/DataDisplayModal.js
 M src/components/ZValidationModal.js
?? docs/agent-reports/20260923-styling-overhaul-s8a-data-height-validation.md
```
