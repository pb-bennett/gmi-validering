# R6A — Shared Tema/Felt filters in Rettinger

Date: 2026-11-10, Europe/Oslo. Branch: `feature/photo-workspace`. Starting HEAD: `c64e85b`; working tree initially clean. No commit, push or deployment was performed.

R6A adds a **Filter** tab to Rettinger using the ordinary layer sidebar's extracted Tema and Felt controls. **Objekter** remains available and remains the initial tab; **Endringer (n)** and the existing footer remain available. R5 handoff, selection provenance/restrictions and the batch inspector implementation were not changed. This report records automated verification with synthetic files, not manual acceptance of R5 or R6A.

## Components and files

| File | Change |
| --- | --- |
| `src/components/LayerFilterSections.js` (new) | Moves `LayerTemaSection`, `LayerFeltSection` and private `LayerFeltValueSection` out of LayerPanel. Retains the existing statistics, grouping, toggles, hover actions, labels, bulk hide/show controls and appearance. Adds optional dataset and controlled Felt-geometry props, a default label lookup for the new host, disclosure attributes and test identifiers. Carets remain Phosphor Regular. |
| `src/components/LayerPanel.js` | Imports the extracted sections; removes their former inline implementations and unused imports. The ordinary host supplies its existing layer, lookup, disclosure state and global Felt callback. |
| `src/components/gmi-edit/GmiLayerFilters.js` (new) | Rettinger host for those same sections, with the table's dataset basis and geometry, a clear basis note and existing reset action. |
| `src/components/gmi-edit/GmiEditWorkspace.js` | Imports the filter host and adds a Filter tab/render branch. Object list, changes view, handoff and inspector behavior remain intact. |
| `src/components/gmi-edit/gmiEdit.css` | Styles scoped to the new filter host: wrapping basis note, bounded value tables and readable column widths. No ordinary-sidebar or general Data Table styling change. |
| `tests/gmiLayerFilters.test.mjs` (new) | Two focused Node tests for shared hosting and real store/registry/row-derivation behavior. |
| `tests/gmiLayerFiltersUi.test.mjs` (new) | Production-browser test with five scenarios plus parent: both hosts, shared state, geometry, selection, live batch review, dataset basis and laptop layout. |
| `tests/statusBrowsing.test.mjs` | Existing field-discovery and raw Status-value assertions now read the extracted module instead of their previous inline location. Assertions were retained. |
| This report and `assets/20261110-gmi-r6a/` | Completion record and two production screenshots. |

## State ownership and geometry

There are no new store fields or filtering actions. Both hosts read the same layer's `hiddenCodes`, `hiddenTypes` and `feltHiddenValues`, and use the existing `toggleLayerHiddenCode`, `toggleLayerHiddenType`, `toggleLayerFeltHiddenValue` and `resetLayerFilters` actions. Only disclosure state is local UI state. Counts and value discovery have one shared component implementation, moved from LayerPanel rather than copied into Rettinger.

Tema/Type retain their existing layer-wide semantics, including missing-value handling and point-type grouping. Felt/value filters remain geometry-specific. Filters survive navigation in both directions. Closing the Filter tab or leaving Rettinger does not reset them.

In Rettinger, Felt receives `ui.layerDataTable.activeTabByLayer[layerId]` as its controlled geometry. Switching the Data Table's Punkter/Ledninger tab updates the open Felt section immediately. Explicitly pressing Felt's geometry tab uses the existing table-tab action. Opening/closing a section or hiding/showing filter values does not write geometry. The ordinary host retains its previous local geometry behavior, including synchronisation when opening Felt from the current table/inspection context.

Neither shared component nor the Rettinger filter host changes object selection, provenance or preview state. The Data Table still uses the unmodified `deriveLayerTableRows`. Selected-only display still bypasses filters as in R3; filters may hide selected rows in ordinary filtered display without deselecting them. The production test confirms that filtering during an R4 review leaves the preview valid and the exact selected objects available for explicit approval.

## Original/Foreslått basis

The Rettinger host reads the existing per-layer `gmiEditTableView` and uses the same `gmiProposedViewForStatus` helper/cache and published session status as the Data Table. It supplies the resulting verified dataset to both shared sections, while filter membership remains on the original layer object.

- **Original:** counts and value options use `layer.data`.
- **Foreslått:** counts and options use the verified proposed dataset.
- **Kun endrede:** uses the proposed dataset for filter options/counts; the table independently limits its rows to changed objects.
- If a proposed view is unavailable, the filter host falls back to Original like the table and explains that fallback.

The note **Filtrert på: Original/Foreslått** names this basis. Its accompanying text explains that counts describe the whole layer, while search, selection and Kun endrede are separate table constraints. Changing the view never rewrites hidden values. A hidden proposed value may therefore be absent from Original's value list while remaining configured; **Nullstill filtre** remains available.

The ordinary layer sidebar retains its existing source-data counts and appearance. Map data/rendering and its established filtering behavior were not redesigned. No additional filtering predicate or eligible-object calculation was introduced.

## Verification results

| Gate | Result |
| --- | --- |
| Relevant Node gate | **199 tests: 187 pass, 3 existing baseline failures, 9 skips.** Both new focused Node tests pass. |
| Existing serial production-browser gate | **62/62 pass**, including parent tests. Covers R1 geometry, R3 selection, R4 inspector/UX, legacy modal, workspace/export/history, draft guards and R5 Validator handoff. |
| New `gmiLayerFiltersUi` against the final production build | **6/6 pass**, including parent; no runtime exceptions and unchanged input bytes. |
| Targeted ESLint for all changed source/test files | **Pass: 0 errors, 0 warnings.** |
| `npm run build` | **Pass:** compilation, TypeScript and static generation. |
| `git diff --check` | **Pass**, with normal LF/CRLF notices only. |

Node command:

```powershell
node --test tests/gmiLayerFilters.test.mjs tests/statusBrowsing.test.mjs tests/layerTableRows.test.mjs tests/layerHighlightPanel.test.mjs tests/mapBackgroundControl.test.mjs tests/gmiEdit*.test.mjs tests/gmiBatchInspector.test.mjs tests/gmiR4UxPolish.test.mjs tests/gmiValidatorEditing.test.mjs tests/validationV2Workspace*.test.mjs
```

Production browser gate used `PHOTO_UI_URL=http://localhost:3123` with `next start`, serially:

```powershell
node --test --test-concurrency=1 tests/layerDataTableGeometryUi.test.mjs tests/gmiEditSelectionUi.test.mjs tests/gmiBatchInspectorUi.test.mjs tests/gmiR4UxPolishUi.test.mjs tests/gmiValidatorEditingUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/gmiEditBatchUi.test.mjs tests/gmiEditWorkspaceUi.test.mjs
node --test tests/gmiLayerFiltersUi.test.mjs
```

The three Node failures are the unchanged, previously documented `validationV2WorkspaceInspector` source-contract failures: normal sidebar width, workspace-shell placement, and map/3D resize composition. No new failure remains in the executed gates. The full repository suite was not rerun for this slice.

The browser scenarios exercise Tema and Felt in both hosts, filters retained across navigation, explicit geometry changes, filter-induced empty geometry without switching, hidden selected objects, selected-only display, an existing batch preview surviving filter changes, explicit staging, and an SDR value visible only in the proposed dataset. The status-browsing suite continues to verify exact raw filter values and labels after extraction.

Logs in `%TEMP%`: `r6a-node.log`, `r6a-browser-gate.log`, `r6a-filters-ui-final.log`, `r6a-eslint.log`, `r6a-build-final.log`.

## Layout and limitations

Both final screenshots were opened and visually inspected. Tests at **1366×768** and **1280×720** assert no page/sidebar horizontal overflow, usable filter-body height and single-line value-table headings. Filter content scrolls within the existing left body; the footer and tabs remain available. Scoped column widths keep Vis, Verdi, Antall and % readable without changing the ordinary sidebar.

- [1366×768: Filter tab beside the integrated inspector](assets/20261110-gmi-r6a/r6a-filter-1366x768.png)
- [1280×720: bounded filter body and available footer](assets/20261110-gmi-r6a/r6a-filter-1280x720.png)

R6A deliberately retains the Objekter list, the ordinary host's existing filter semantics and the legacy batch modal. No Validator finding-based selection, new filter normalization, map-selection behavior, R7 retirement or later sidebar redesign was implemented. Switching away from Filter remounts its disclosure UI on return; the configured layer filters remain intact. Manual acceptance with a real delivery is outstanding.

## Manual acceptance instructions

1. At 1366×768, import a real GMI with points and lines. In the ordinary layer sidebar, open Ledninger in the Data Table. Hide a Tema and a Material/Felt value, including Skjul alle/Vis alle. Confirm an empty result stays on Ledninger.
2. Enter Rettinger and choose **Filter**. Confirm the same Tema/Felt check states and rows remain filtered. Confirm **Objekter** still opens the existing list and **Endringer** remains available. Confirm the basis note initially matches the current table view.
3. Open Felt. Switch the table to Punkter and back; the open Felt section must follow. Explicitly switch geometry using Felt's own tabs and confirm the table follows. Hiding/showing values must never change geometry.
4. Select several source objects in the table. Hide some or all through Filter. Confirm the selection count is retained and **Bare valgte** reveals the same source objects. Reset filters and confirm no selection or correction changed.
5. Open **Rediger valgte**, enter a suitable correction and calculate its preview. While the preview is present, change Tema/Felt filters. The preview must stay valid and selection membership must stay unchanged. Review and explicitly apply the approved correction.
6. Choose **Foreslått**, then open the corrected field under Felt. Confirm its value counts match the proposed dataset. Hide the proposed value, switch to **Kun endrede** and **Original**, and verify the table rows and basis note agree with the chosen dataset. Returning to Foreslått must retain that hidden value. Use **Nullstill filtre** when finished.
7. Leave Rettinger. Confirm the ordinary layer sidebar retains filters set in Rettinger. Change them there, re-enter Rettinger and confirm the updated state. Existing undo/redo and export should continue through their established workflow.
8. Smoke-test **Validator → Lag retting…**: the R5 exact restricted selection, empty correction value and integrated inspector must still appear. This slice does not constitute manual acceptance of R5.
9. Repeat the core Filter/Felt/selection flow at **1280×720**. Scroll the left filter body to later fields and values, and confirm no horizontal page/sidebar overflow and that tabs/footer actions remain reachable.
