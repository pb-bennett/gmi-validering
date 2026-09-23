# S6 Bottom LayerDataTable styling

Date: 2026-09-23. Starting SHA: `b08cacd` (`Refine Validator inspector geometry`). Repository root: `C:/GitHub/gmi-validering-test`. Branch: `feature/styling-overhaul-integrated`. The starting working tree was clean.

## Files changed

- `src/components/LayerDataTable.js` — active bottom-table presentation and approved action icons.
- `docs/agent-reports/20260923-styling-overhaul-s6-layer-data-table.md` — this report.

No test assertion required a change.

## Table treatment

The outer frame uses GMI Surface and a Strong Border top seam. The existing compact toolbar uses Soft, Border, Navy for “Datatabell,” Muted for object context and counts, and Subtle for layer context and secondary counts. Punkter/Ledninger and Utvalg/Alle use the neutral selected-control recipe with existing padding and behavior. The reset and close controls use compact action and focus treatments. The footer instruction and horizontal-scroll context use Soft and Subtle.

Column headers use an opaque Soft background, Strong Border separation, Muted labels, Interactive sort indicators, and a clearer pinned-column shadow. Existing header truncation, full-label title, contextual multiline treatment, sort, and drag handling remain. Body cells retain their 10px text density; missing values retain their existing `-` or `Mangler` wording and italic presentation, now in Subtle. Rows use a restrained Soft hover. Opaque sticky cells follow that hover; contextual pinned field cells retain their existing semantic backgrounds. The table has no separate selected-row state, so none was added. Existing Feil red, Sjekk amber, and Pass green result text and contextual field backgrounds remain unchanged.

The approved regular Phosphor conversions are row zoom to `CornersOutIcon`, filter reset to `ArrowCounterClockwiseIcon`, and the existing table X glyph to `XIcon`. The source X button invokes `closeLayerDataTable`; there is no separate clear-selection button in this component. Its close action is unchanged, and it now has an explicit “Lukk datatabell” name and tooltip. The zoom action retains its 20px button and “Zoom til” tooltip and has an explicit accessible name.

## Protected contracts

The 62/38 workspace/table split remains in `WorkspaceShell.js`; this file was untouched. `ROW_HEIGHT = 28`, `zoom: 36`, zoom-column `size: 36`, sticky-column membership, `stickyLeftFor` offsets, `z-20`/`z-30`/`z-10` ordering, horizontal overflow, table height/scroll ownership, and opaque pinned backgrounds remain. The row virtualizer still uses the same scroll element, 28px estimate, overscan 10, keying, and visible-range rendering. Column widths and measurement assumptions remain unchanged.

Open/close, Utvalg/Alle scope, filters/reset, row click/hover highlighting, row zoom, and map selection handoff retain their handlers and data. No map, store, Validator, shell, or Stats code changed. The Stats predicate remains `!(layerDataTableOpen || dockedInspectorOpen)`. S5A list/filter/sort/rule surfaces and S5B inspector/detail/modal content and 28rem width were untouched. S7+ map toolbar, controls, overlays, legend, WMS, 3D, profile, charts, Stats UI, AppInfo, Testmodus, and global modals were excluded.

## Verification

- `git diff --check`: passed (Git emitted an LF-to-CRLF working-copy warning).
- `node --loader ./tests/esmJsLoader.mjs --test tests/objectTableInspection.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/statsUiContract.test.mjs tests/mapPaneToolbar.test.mjs tests/validationV2RealDataPolish.test.mjs`: 33/33 passed. Node emitted its existing experimental-loader warning.
- `npm.cmd run build`: passed, including compilation, type checking, page-data collection, and static generation. Browserslist reported stale local data; dependencies were not changed.

Browser review remains pending. The browser skill was available, but its browser connection failed before any tab could be inspected. Normal map, Validator sidebar, docked inspector, selection/Utvalg/Alle, horizontal scrolling and pinned seams, row hover, statuses/missing values, zoom, reset, close/reopen, and narrow viewport states therefore still need rendered review. No visual acceptance is claimed.

## Final status

No commit, push, deploy, dependency update, branch switch, reset, stash, clean, or S7 work was performed. Final `git status --short`:

```text
 M src/components/LayerDataTable.js
?? docs/agent-reports/20260923-styling-overhaul-s6-layer-data-table.md
```
