# R2: Data Table row derivation and keyboard accessibility

Date: 2026-11-10, Europe/Oslo. Branch `feature/photo-workspace`, starting HEAD `8596556` verified. Working tree was clean at the start. No commit or push.

## 1. Implementation

Extracted the existing view, sidebar-filter and search preparation into a pure module used directly by LayerDataTable. TanStack still owns sorting and the final row model. Added keyboard object navigation to the existing virtualized table, using the same row activation function as mouse clicks and therefore the same Rettinger object-request and draft-guard path.

R1 geometry stability remains intact. No selection checkboxes, multi-object state, batch UI, panel extraction, Validator handoff change, editing-engine change or FOTO behavior change was implemented. The Rettinger object list and Masseendringer modal remain available.

## 2. Files changed

- `src/lib/layerTableRows.mjs`: pure shared preparation and the extracted hiding predicate.
- `src/components/LayerDataTable.js`: consume shared rows; grid semantics, keyboard cursor, virtual focus handling, sortable header buttons and active-object indication.
- `src/components/FilenameCopyButton.js`: optional `tabIndex` prop, used only by the table to expose tools through F2. Existing callers retain the default native tab behavior.
- `tests/layerTableRows.test.mjs`: ten focused parity tests with explicit expected source-index sets.
- `tests/layerDataTableKeyboardUi.test.mjs`: production-browser keyboard, draft guard, virtualization, sorting/search, mouse and point-navigation coverage.
- `tests/tableSearch.test.mjs`, `tests/objectTableInspection.test.mjs`, `tests/hyperlinkFilenames.test.mjs`: update existing source-shape assertions for the shared helper and accessible controls.
- This report.

## 3. Shared API and R3 reuse

```js
deriveLayerTableRows({
  dataset, tab, filters, view, changedByObject,
  inspectionRows: null, searchQuery: '',
});
// => { allItemsWithIndex, items, searchedItems }
```

All inputs are explicit; the module imports no React or store code and mutates neither inputs nor application state.

- `dataset`: the displayed Original or already verified Foreslått dataset.
- `tab`: `punkter` or `ledninger`.
- `filters`: existing `hiddenCodes`, `hiddenTypes`, `feltHiddenValues` arrays.
- `view`: existing `original`, `proposed`, `changed` values. `changedByObject` supplies the existing scope/source-index keys.
- `inspectionRows`: already resolved, revision-checked exact/contextual rows; `null` means ordinary browsing. An empty inspection array remains empty.
- `allItemsWithIndex`: source-indexed, view-constrained rows before sidebar hiding.
- `items`: rows after sidebar hiding, before search; still used for counts and ordinary column discovery.
- `searchedItems`: rows after literal search, supplied directly to TanStack.

`isLayerTableItemHidden(item, tab, filters)` contains the single extracted predicate. No alternate filtering implementation was added.

For R3, the exact final visible object set is **`table.getRowModel().rows.map(row => row.original)`**, including the current TanStack sorting and search. This includes every matching object, not just mounted viewport rows. A selection bar owned by the table should receive this row-model snapshot or a callback returning it. Code outside the table can reuse the preparation helper with the same explicit inputs; it must not independently reproduce sorting or infer objects from virtual row positions. Source identity remains `__index`, and TanStack IDs remain `layerId:tab:__index`.

## 4. Filtering and view parity

Preserved the order: choose displayed dataset/geometry → assign source indices → apply Kun endrede → sidebar hiding → search → TanStack sorting → virtualization.

Tema and Type remain layer-wide; Felt remains geometry-specific. Historical normalization is unchanged: null/blank/whitespace Tema becomes `(Ingen verdi)`, falsy Type uses `(Mangler Type)`, and null/undefined/empty Felt becomes `(Mangler)`. Zero remains a Felt value. No attempt was made to reconcile sidebar normalization differences.

Foreslått filters and searches displayed proposed attributes. Kun endrede uses original parser indices and geometry-specific keys before filtering/search. Exact/contextual inspections retain resolver order, `__index` and diagnostic metadata; they bypass sidebar hiding and ordinary view constraints while still applying table search. Revision validation, contextual complete-scope column discovery, column order/visibility, sort functions and sort-state ownership stay in the existing code.

Tests assert explicit expected indices for both geometries, combinations of Tema/Type/Felt/search, proposed and changed-only views, resolved inspection rows, empty results and stable TanStack sort ties. Existing resolver tests still verify exact/contextual ownership and stale-revision refusal.

## 5. Accessibility and keyboard behavior

The table is a named, read-only ARIA grid containing indexed header/data rows, column headers and grid cells. Header sort controls are native buttons with `aria-sort` on their headers. The grid has one object-navigation tab stop and uses `aria-activedescendant` to identify its keyboard row.

- Tab reaches the grid; Up/Down traverse the complete sorted row model.
- Home/End reach its first/last row, including initially unmounted objects.
- Enter invokes the existing mouse row activation function. In Rettinger this emits the existing guarded object request; focusing/moving the cursor alone never opens an object or asks to discard a draft.
- F2 enters the current row's existing zoom/copy controls. Left/Right traverse those controls; Escape returns to the grid. Ordinary cells and row tools add no repeated tab stops.
- Tab remains available to leave the grid or its tools; search and native header buttons remain in normal keyboard navigation.

The keyboard row has a visible 2px outline. The existing active map object has a persistent cyan background/leading marker and `aria-current`, separate from transient hover. No `aria-selected` is declared because R2 implements navigation rather than selection. Hover still uses the original separate map-highlight channel.

DOM focus stays on the grid while virtual rows recycle. Virtual keys use source-based TanStack IDs; the range extractor keeps the current descendant mounted. Sorting preserves the cursor's source identity. A removed cursor falls back to the first remaining sorted row; an empty result has no active descendant. Navigation/focus return scrolls the current row into view. Existing draft cancellation/confirmation is verified with native keyboard input, including preserved draft contents after cancellation.

## 6. Verification

| Check | Result |
| --- | --- |
| Focused Data Table + Rettinger/Validator node gate | **188 tests: 180 pass, 0 fail, 8 expected skips** |
| Production R2 + established R1/Rettinger/Validator/FOTO browser gate | **80 tests: 77 pass, 0 fail, 3 expected skips** |
| Extended R2 browser test, including Chromium accessibility tree and filename-copy tool navigation | **6/6 pass** |
| Full serial suite without `PHOTO_UI_URL` | **1,983 tests: 1,871 pass, 7 known baseline failures, 105 skips** |
| Targeted ESLint on all eight changed JS/MJS files | **0 errors**, one existing TanStack `react-hooks/incompatible-library` warning |
| Production build | **Pass**, including compilation, TypeScript and static-page generation |
| `git diff --check` | **Pass**; only Git's existing LF/CRLF conversion notices |

Node command: `node --test tests/layerTableRows.test.mjs tests/tableSearch.test.mjs tests/objectTableInspection.test.mjs tests/hyperlinkFilenames.test.mjs tests/gmiEdit*.test.mjs tests/gmiValidatorEditing.test.mjs`.

Browser gate: `PHOTO_UI_URL=http://localhost:3123 node --test --test-concurrency=1` with `layerDataTableKeyboardUi`, `layerDataTableGeometryUi`, `gmiEditWorkspaceUi`, `gmiEditBatchUi`, `gmiValidatorEditingUi`, `gmiEditValidationUi`, `gmiEditDraftGuardUi`, `photoLoadedGmiUi`, `photoImportWizardUi`, `mapTeardownUi`, `photoWorkspacePass1dUi`, `gmiPhotoAssociationsUi`, `photoWorkspaceUi`. It uses the real production app and synthetic data. The R2 fixture has 80 lines, so End/Home and scrolling exercise virtualization. The extended test also verifies the focused grid in Chromium's accessibility tree, row copy controls and point navigation.

The known full-suite baseline is `appInfoUiContract` (1), `statsUiContract` (2), optional external-corpus `terrainPhotoGml` (1), `validationV2WorkspaceInspector` (3), as documented in R1. An initial full run additionally found an outdated copy/search source-shape assertion; it was updated to follow the extracted helper, passed locally, and the serial gate was repeated. Early keyboard-test failures were fixed by sending native Enter text and waiting for dialog closure before checking focus return.

Build and Chrome commands ran with the permissions required for the existing Google font downloads and Chrome debugging port. No dependency or environment configuration was changed. Logs are in `%TEMP%/gmi-r2-node-gate.log`, `gmi-r2-browser-gate.log`, `gmi-r2-full-serial-final.log`, `gmi-r2-eslint-final.log`; successful build output was inspected directly.

## 7. Known limitations

This is row navigation, not spreadsheet cell navigation. Screen-reader behavior has not been manually checked with NVDA/JAWS; Chromium accessibility-tree exposure and keyboard focus were checked automatically. Optional private/real-corpus scenarios retain their existing skip gates. The existing full-suite baseline failures and TanStack lint warning remain outside R2.

The current marker represents the existing map navigation target. As before, row activation updates that map target before Rettinger's draft decision; cancelling keeps the editor and its draft on the original object. R2 does not change that interaction or equate the map marker with an accepted editor selection.

## 8. Manual acceptance checklist

1. Load a mixed GMI and open the table. Tab into the grid, move with Up/Down, then press Enter. Confirm the correct object is highlighted and the keyboard outline differs from hover.
2. Enter Rettinger. Use only the keyboard to activate a table row, reach an editor input and type a draft. Activate a different row: cancel, then repeat and confirm. Verify draft preservation on cancel and the correct new source object after confirmation.
3. On a large GMI, use End/Home and arrows beyond the first viewport. Scroll while the grid retains focus, then navigate again. Confirm source identity and focus stay predictable.
4. Use F2, Left/Right and Escape for row zoom/copy controls. Tab away and back. Confirm controls remain operable without tabbing through every cell.
5. Sort a column using its header button. Search, obtain zero results, clear the search and switch geometry. Confirm counts, ordering, active descendant and source-object activation.
6. Repeat R1: Ledninger → Felt/Material → Skjul alle/Vis alle, then Tema → Skjul alle/Vis alle. Confirm geometry remains Ledninger.
7. Verify Original/Foreslått/Kun endrede after staging a single correction, then open a Validator exact/contextual inspection. Confirm row sets, source indices and inspection geometry.
8. Smoke-test the retained object list, Masseendringer modal and FOTO navigation/import. Check keyboard outlines at 1366×768 and 1280×720 and, if available, with a screen reader.

## 9. Before R3

Keep final-set ownership at the existing TanStack table and pass its row-model snapshot to future selection consumers. Persisted filters, local search, proposed-session revision and inspection revision are distinct inputs; use the same snapshot for counts and explicit selection operations.

Selection must be separate from both the keyboard cursor and `highlightedFeatureId`/hover IDs. The latter are navigation/map state and are not suitable as selected-object state or proof that a draft switch was accepted. Continue to use geometry/source-index keys and source/session lifecycle binding when implementing R3; no such state was added here.
