# S8B profile, standards, and terrain presentation

Date: 2026-09-23. Starting SHA: `4effba9` (`Refresh data inspection styling`). Repository root: `C:/GitHub/gmi-validering-test`. Branch: `feature/styling-overhaul-integrated`. Starting working tree: clean.

## Active owners

- `src/app/page.js` mounts the lower `InclineAnalysisModal` beneath the map and owns `primaryViewHeight = analysisOpen ? '55%' : '100%'`. It also mounts `TerrainFetcher`, which renders nothing and owns background fetch processing. Neither file was edited.
- `src/components/InclineAnalysisModal.js` owns the 45vh lower profile panel, selected result/list, settings entry, overcover input, terrain refresh/status, profile SVG/chart, hover tooltip, chart legend, and reset-view action. The component's `PipeProfileVisualization` owns plot sizing, refs, pointer handlers, tooltip placement, terrain/pipe series, and map hover state updates.
- `src/components/StandardsInfoModal.js` is opened by the profile settings button and owns the standards/reference presentation and incline requirement radio setting. Its analysis call and setting handler were left unchanged.
- `src/components/TerrainFetcher.js` is a background data-processing owner with no presentation. The map/3D hover consumers were inspected for ownership and left unchanged.

## Files changed

- `src/components/InclineAnalysisModal.js`
- `src/components/StandardsInfoModal.js`
- This report

## S8B presentation

The lower profile frame, header, result metadata, list, type tabs, chart frame, SVG background/border, legend frame, tooltip surface, empty profile state, and terrain loading surface now use GMI Surface, Soft, Border, Strong Border, Navy, Text, Muted, Subtle, and Interactive roles. List selection remains a compact neutral surface with its existing left indicator geometry. The overcover number field uses `gmi-compact-field`; appropriate actions use `gmi-compact-button` and `gmi-focus-ring`. Chart values, technical density, and the compact sidebar remain primary.

Terrain refresh retains its label, handler, disabled condition, loading spinner, status text, and fetch behavior. Its normal action now includes regular Phosphor `ArrowClockwiseIcon`. The plot reset action keeps its `Reset` label and transform handler and adds regular `ArrowCounterClockwiseIcon`. The profile settings action uses regular `GearSixIcon`; profile and standards close actions use regular `XIcon`. These are the reviewed action mappings, with decorative icons hidden from assistive technology. Terrain and warning domain marks in the result list and chart legend remain unchanged.

The standards frame, reference headings, radio setting area, links, close controls, and technical copy hierarchy use the same GMI vocabulary. The existing amber overcover explanation remains amber. Standards wording, categories, order, values, URLs, radio values, defaults, `analyzeIncline` call, and settings update path were not edited. Semantic red/amber/green status badges, threshold marks, pipe/terrain series colors, and other domain colors retain their meanings. The tooltip's red/green values use darker shades for legibility on its light surface; their conditions and content are unchanged.

## Protected contracts

The map's `55%` height in `page.js` and the profile's `h-[45vh]` are unchanged. The `w-80` list, `minHeight: '300px'` chart frame, observed container dimensions, SVG `width`/`height`, plot padding, scales, axes, paths, points, gradients, hit regions, transforms, pointer handlers, tooltip placement, and plotted data are unchanged. No chart calculation or architecture was refactored. Added action icons do not change the plot's measured container or SVG dimensions; rendered overlap still needs browser review.

The selected pipe, list/chart synchronization, hover indices, mouseleave/reset behavior, map/3D highlighting handoff, settings values/defaults, filter toggles, terrain fetch/refresh/cache state, and map/profile relationship retain their handlers and data. The existing overflow owners, stacking, parent flex/min-height behavior, and separation from the bottom `LayerDataTable` were not changed. S6 LayerDataTable, S7 map chrome, S8A Datautforsker/Z surfaces, and S9+ 3D/dialogs/Stats/final convergence were untouched.

## Verification

- `git diff --check`: passed. Git emitted only a local LF-to-CRLF working-copy warning for `StandardsInfoModal.js`.
- `node --loader ./tests/esmJsLoader.mjs --test tests/profileAnalysisActiveDataCrash.test.mjs tests/mapPaneToolbar.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/statsUiContract.test.mjs`: 23/23 passed. Repository test search found no direct profile chart, terrain refresh, or standards settings test. The existing experimental-loader warning appeared.
- `npm.cmd run build`: passed, including compilation, type checking, and static generation. The existing Browserslist age warning appeared; dependencies were not changed.

Browser review: pending. The in-app browser connection failed before opening a tab with `js: codex/sandbox-state-meta: missing field sandboxPolicy`. Profile plot size, axes, hover precision/tooltip, list/chart correspondence, terrain states, settings, standards, close/reopen, map coexistence, Validator coexistence, and LayerDataTable exclusion need rendered verification. No visual acceptance is claimed.

Deferred concern: the added compact action icons occupy a little more width in the existing header and plot-corner controls; rendered overlap and narrow widths remain to be checked. No data, hover, terrain, standards, or calculation defect was changed in this styling slice.

No commit, push, deploy, dependency update, branch switch, reset, stash, clean, or S9 work was performed. Final `git status --short`:

```text
 M src/components/InclineAnalysisModal.js
 M src/components/StandardsInfoModal.js
?? docs/agent-reports/20260923-styling-overhaul-s8b-profile-standards.md
```

## Accepted Stats-trigger visibility follow-up

The accepted Stats-trigger behavior now also suppresses the trigger while the lower profile analysis panel is open. `src/app/page.js` uses the existing `analysisOpen` subscription (`state.analysis.isOpen`) in the trigger guard, alongside `layerDataTableOpen` and `dockedInspectorOpen`. This does not add state or change the profile layout.

The trigger returns when these suppressing surfaces close. The fallback `FieldDetailModal` remains independent because it does not participate in this guard. The separately controlled `StatsModal` remains rendered with `isOpen={showStats}`, so hiding the trigger does not close an already-open modal. Stats cue styling and reduced-motion behavior were not changed.

Follow-up files: `src/app/page.js`, `tests/statsUiContract.test.mjs`, and this report. The existing Stats UI contract test now checks the exact three-surface predicate and evaluates its visible/suppressed cases; it also checks fallback modal independence and the independent modal state. Existing table, docked inspector, and modal lifecycle assertions remain.

Follow-up verification:

- `git diff --check`: passed; only local LF-to-CRLF working-copy warnings were emitted.
- `node --loader ./tests/esmJsLoader.mjs --test tests/statsUiContract.test.mjs tests/statsChartUi.test.mjs tests/profileAnalysisActiveDataCrash.test.mjs tests/mapPaneToolbar.test.mjs tests/validationV2WorkspaceInspector.test.mjs`: 29/29 passed. Existing experimental-loader warnings appeared.
- `npm.cmd run build`: passed, including compilation, type checking, and static generation. The existing Browserslist age warning appeared.

Final working-tree additions for this follow-up:

```text
 M src/app/page.js
 M src/components/InclineAnalysisModal.js
 M src/components/StandardsInfoModal.js
 M tests/statsUiContract.test.mjs
?? docs/agent-reports/20260923-styling-overhaul-s8b-profile-standards.md
```

## Profile list label and checkbox accent correction

Pipe-type/category labels in `AnalysisResultRow` retain type hue with calmer existing text utilities. The class is selected from the existing `getColorByFCode` result, so the established type mapping is reused without changing category logic. Mapping for list text only:

| Existing series hue | Profile-list text utility |
| --- | --- |
| VL/VANN `#0101FF` | `text-blue-700` |
| SP/SPILLVANN `#02D902` | `text-green-700` |
| OV/OVERVANN `#2a2a2a` | `text-gmi-text` |
| AF/FELLES `#ff0000` | `text-red-700` |
| Other `#808080` | `text-gmi-text-muted` |

Chart series, map/domain colors, profile marks, and warning/status colors are unchanged. The supporting line retains `text-gmi-text`. The Advarsel and OK native checkbox accents and focus rings both use `gmi-interactive`; labels, values, toggles, and dimensions remain unchanged.

Only `src/components/InclineAnalysisModal.js` and this report were changed for this presentation correction.

## Profile-list emoji and warning-glyph cleanup

The mountain emoji in the terrain success/warning chips represented terrain data being available, a meaning distinct from the incline `StatusBadge`. It was replaced with a small regular Phosphor `MountainsIcon`, marked decorative; the chips retain their existing titles, warning count, and status colors. The warning-sign glyph repeated the warning already conveyed by the count, title, and red chip, so it was removed without replacement. The repeated warning-sign suffixes in the profile header and tooltip values were also removed; their red/green text, conditions, counts, and explanatory warning text remain.

The S8B presentation scan found no other emoji/pictogram in `StandardsInfoModal` or the non-rendering `TerrainFetcher`. The chart legend's small `!` marks are chart warning marks and remain unchanged. Middle-dot metadata separators, Greek delta, per-mille marks, and localized text are ordinary content, not emoji, and remain unchanged.

For this cleanup, only `src/components/InclineAnalysisModal.js` and this report were changed.

Cleanup verification:

- `git diff --check`: passed; Git emitted only working-copy LF-to-CRLF warnings.
- `node --loader ./tests/esmJsLoader.mjs --test tests/profileAnalysisActiveDataCrash.test.mjs tests/statsUiContract.test.mjs tests/statsChartUi.test.mjs tests/mapPaneToolbar.test.mjs tests/validationV2WorkspaceInspector.test.mjs`: 29/29 passed. Existing experimental-loader warnings appeared.
- `npm.cmd run build`: passed, including production compile and static generation. The existing Browserslist age warning appeared; dependencies were unchanged.

Final working tree after this cleanup:

```text
 M src/app/page.js
 M src/components/InclineAnalysisModal.js
 M src/components/StandardsInfoModal.js
 M tests/statsUiContract.test.mjs
?? docs/agent-reports/20260923-styling-overhaul-s8b-profile-standards.md
```

## Standards radio accent follow-up

The two active `StandardsInfoModal` radio inputs now use `accent-gmi-interactive` so the selected indicator follows the accepted GMI Interactive color. Radio size, values, labels, focus behavior, settings logic, defaults, handlers, and modal layout were left unchanged.

Verification for this follow-up:

- `git diff --check`: passed (Git emitted working-copy LF-to-CRLF notices).
- Relevant profile/standards/Stats tests: 29/29 passed via `node --loader ./tests/esmJsLoader.mjs --test tests/profileAnalysisActiveDataCrash.test.mjs tests/statsUiContract.test.mjs tests/statsChartUi.test.mjs tests/mapPaneToolbar.test.mjs tests/validationV2WorkspaceInspector.test.mjs`. Existing experimental-loader warnings appeared.
- `npm.cmd run build`: passed, including production compilation and static generation. Existing Browserslist data age warning appeared; dependencies were unchanged.
