# R3: Data Table multi-object selection

Date: 2026-11-10, Europe/Oslo. Branch `feature/photo-workspace`, starting HEAD `764ef67` verified. The initial working tree was clean. No commit or push.

## 1. Summary

Added source-bound, in-memory GMI object selection to the Data Table in editable Rettinger workspaces. Users can check individual objects, select a filtered result snapshot across virtualization, select ranges, inspect the complete selection and clear it. A compact bar distinguishes selected, normally visible and hidden objects. A dedicated teal map overlay marks selected objects independently of hover and the focused object.

R1 geometry stability and R2 navigation remain in place. This implements R3 only: no batch action, eligibility calculation, ChangeSet creation, inspector batch editing, M5B/M5C implementation change, engine change, panel extraction or FOTO selection change. The existing object list and Masseendringer modal remain functional.

## 2. Files modified

- `src/lib/gmiEditSelection.mjs`: pure binding, reducer, reconciliation, count and map-ID helpers.
- `src/lib/store.js`: one selection slice and a guarded selection action.
- `src/lib/gmiEditSessions.mjs`: selection lifecycle reconciliation in the existing app/session store binding.
- `src/lib/layerTableRows.mjs`: explicit selected-only display override alongside the normal row derivation.
- `src/components/LayerDataTable.js`: Rettinger-only selection column/bar, geometry-replacement dialog, keyboard selection and count presentation.
- `src/components/MapInner.js`: separate noninteractive selection pane and overlay.
- `src/components/gmi-edit/GmiEditWorkspace.js`: clear selection on workspace unmount, including FOTO navigation.
- `tests/gmiEditSelection.test.mjs`: eight pure selection/row-boundary tests.
- `tests/gmiEditSelectionUi.test.mjs`: six production-browser scenarios plus the parent test.
- `tests/gmiEditSessions.test.mjs`: actual store/registry lifecycle and source-safety regression.
- `tests/layerDataTableKeyboardUi.test.mjs`, `tests/tableSearch.test.mjs`, `tests/objectTableInspection.test.mjs`: update R2 assertions for real checked selection and the shared display rows.
- This report.

## 3. State and lifecycle

One top-level `gmiEditSelection` value belongs to the active Rettinger workspace:

```js
{
  binding: { layerId, sessionId, fingerprint },
  scope: 'line',
  keys: ['line:0', 'line:12'],
  anchor: 'line:0',
  showOnly: false
}
```

`null` means no selection. A single slice is sufficient because the app has one active Rettinger workspace and selections clear on exit; there is no inactive per-layer selection cache. This is the planning recommendation's exit policy, with a smaller storage shape than a per-layer map.

The binding uses the editing registry's session identity and original document fingerprint. That session already owns the exact source input/File lineage. Selection actions re-check the live registry status and the captured binding, require the active workspace and reject non-editable or stale contexts. Invalid keys, mixed scopes and out-of-range source indices are rejected. Confirmation actions also carry their original binding, so an old modal cannot select objects in a replacement document.

The existing app/session binding reconciles selection after store changes, re-reading state after registry source reconciliation. It clears on session/source invalidation, unavailable/read-only state, layer removal, reset or workspace exit. Workspace unmount additionally clears it when another surface such as FOTO is opened through the existing draft guard. Impossible source indices are pruned defensively.

Editing revision and stateKey are intentionally absent from the binding: staging, undo/redo, Original/Foreslått, sorting, filtering and search preserve the same source-index identities and selection. Selection is outside `ui` and excluded from the existing localStorage partialization. No source bytes or document objects are stored in the slice.

## 4. Final row-model integration

Individual/range/bulk actions use `scope:sourceIndex` keys. Bulk and range operations take their exact snapshot from **`table.getRowModel().rows`**, after R2 preparation and TanStack sorting. They never inspect virtual DOM rows or duplicate filtering/sorting. Header selection adds all displayed keys to the existing same-geometry selection; deselecting a checked header removes those displayed keys and preserves hidden selected objects.

R2 preparation now returns `displayItems` as well as the normal `allItemsWithIndex`, `items` and `searchedItems`. Normally `displayItems === searchedItems`. With explicit `selectionKeys`, `displayItems` contains the selected source rows from the displayed dataset before sidebar hiding, search and changed-only membership constraints. TanStack sorts that display as usual.

This permits the complete selection to be inspected, including objects hidden by Tema/Felt, search or Kun endrede, without modifying any underlying filter, query or view setting. Proposed attributes still come from the existing verified Foreslått dataset. Column discovery uses selected display rows during this override, so hidden filters cannot leave the selection without its ordinary attribute columns. Normal-filter membership counts still come from R2's normal `searchedItems`; sorting cannot change membership.

The bar explicitly distinguishes override rows from normal matches. For example: normal mode `3 valgt · 2 synlige · 1 skjult av filter/søk/visning`; selected-only mode `3 valgt · 3 vises · 2 treffer filter/søk/visning · 1 utenfor`. The toolbar shows the selected display count, and any search counter is labelled as normal-view results during the override.

## 5. Interaction and geometry constraints

- Checkboxes appear only in an editable ordinary Rettinger table, never in the base table or exact/contextual inspections.
- Checkbox actions do not open the object editor, change the navigation cursor or invoke the draft guard. Ordinary row clicks and Enter continue through the unchanged object-request path.
- Space in the R2 grid toggles the keyboard row. Shift+Space or Shift+click extends/removes a range in the current final sorted row order. Hidden anchors fall back safely to the requested row.
- F2 still enters the existing zoom control. Left reaches the preceding row checkbox; Left/Right traverse row tools, and Escape returns to grid navigation. Native checkbox Space/Enter works without activating the row. The header checkbox remains in normal tab navigation.
- Grid rows now expose actual checked membership through `aria-selected`, and the grid declares `aria-multiselectable`. Keyboard cursor and `aria-current` retain their separate R2 meanings.
- Geometry tabs preserve selection. Selecting an object in the other geometry opens an explicit replacement confirmation. Cancel preserves the old selection; confirmation replaces it. “Vis bare valgte” explicitly returns to the selection's geometry when needed.
- The header has unchecked/checked/indeterminate states based on its actual displayed row set. No editing/eligibility action is exposed.

## 6. Map implementation

`gmiSelectedFeatureIds` derives a dedicated feature-ID Set from selection and the active workspace. Neither `highlightedFeatureId` nor hover-owned `highlightedFeatureIds` is repurposed.

A noninteractive `gmi-edit-selection` pane at z-index 399 renders teal dashed line casings and point rings. Existing semantic lines/markers, focus highlighting, layer highlighting, Validator styling, click handlers and popups remain separate. The overlay respects existing map visibility/filtering; checking an object does not make a hidden map feature visible or rewrite filters.

The overlay key includes the full selected-ID content, not just its count or a truncated prefix. The browser test replaces selected objects at equal cardinality and verifies changed paths. Selected points explicitly use the selection pane, including the custom Leaflet point-to-layer callback. Clearing selection or leaving Rettinger removes the overlay.

## 7. Styling and rendered inspection

Native checkboxes use the approved `var(--gmi-interactive)` accent, currently **#007595**, plus the existing focus-ring class. Selection cells are a fixed compact 32px wide, with flex centring in both axes and the existing 28px row height. Checked rows remain legible with existing compact typography and cyan/teal tokens. The selection bar uses ordinary compact controls and adds no disabled future batch button or large banner. No new icons or icon library were introduced.

The production test measures actual computed `accentColor` for both a checked row checkbox and an indeterminate header checkbox: **`rgb(0, 117, 149)`**. Their horizontal/vertical centres differ from their parent cell centres by at most one pixel. The captured screenshot was opened and visually inspected; both native states render teal rather than browser blue. Artifact: `%TEMP%/gmi-r3-rendered-checkboxes.png`.

## 8. Automated verification

| Gate | Result |
| --- | --- |
| Relevant Data Table, selection, Rettinger and Validator node suites | **198 tests: 189 pass, 0 fail, 9 expected skips** |
| Production R3 + R1/R2 + Rettinger/Validator/FOTO gate | **87 tests: 84 pass, 0 fail, 3 expected skips** |
| Final R3 browser rerun after toolbar count clarification | **7/7 pass** |
| Strengthened final selection/store lifecycle tests | **27/27 pass** |
| Full serial suite without `PHOTO_UI_URL` | **1,993 tests: 1,880 pass, 7 known baseline failures, 106 skips** |
| Production build | **Pass**, compilation, TypeScript and static-page generation |
| Targeted ESLint excluding the pre-existing MapInner diagnostics | **0 errors**, existing TanStack warning |
| Targeted ESLint including MapInner | **8 pre-existing errors, 5 existing warnings; no new diagnostics** |
| `git diff --check` | **Pass**, with ordinary LF/CRLF conversion notices |

Node gate: `node --test tests/gmiEdit*.test.mjs tests/gmiValidatorEditing.test.mjs tests/layerTableRows.test.mjs tests/tableSearch.test.mjs tests/objectTableInspection.test.mjs tests/hyperlinkFilenames.test.mjs`.

Production gate at `http://localhost:3123`, `--test-concurrency=1`: `gmiEditSelectionUi`, `layerDataTableKeyboardUi`, `layerDataTableGeometryUi`, `gmiEditWorkspaceUi`, `gmiEditBatchUi`, `gmiValidatorEditingUi`, `gmiEditValidationUi`, `gmiEditDraftGuardUi`, `photoLoadedGmiUi`, `photoImportWizardUi`, `mapTeardownUi`, `photoWorkspacePass1dUi`, `gmiPhotoAssociationsUi`, `photoWorkspaceUi`.

The synthetic selection fixture contains 80 lines and a point; Felt reduces it to 40 lines. Browser coverage checks three individual selections, one selected object hidden by search, complete-selection override/restore, full-model selection beyond mounted rows, sort/history/proposed identity, draft-safe checkboxes and guarded row navigation, explicit geometry replacement, point/line map halos, equal-cardinality repainting, exit/removal/reimport, persistence exclusion, rendered colour/alignment and runtime exceptions.

Actual same-layer source replacement/invalidation, stale binding refusal, removal and reset are exercised through the real store/registry in node tests. They also assert that selecting creates no ChangeSet and leaves original bytes/data intact. The production UI has no same-layer source-replacement control; browser lifecycle coverage uses actual removal and reimport instead.

The seven full-suite failures are the documented baseline: `appInfoUiContract` (1), `statsUiContract` (2), optional external-corpus `terrainPhotoGml` (1), `validationV2WorkspaceInspector` (3). MapInner's eight `react-hooks/refs` errors are in its existing projected-feature cache. Linting a byte-for-byte `git show HEAD:src/components/MapInner.js` copy under the same ESLint config reproduces eight errors/four warnings; the fifth warning is the existing TanStack table warning. This unrelated map cache was not refactored or lint-suppressed in R3.

Logs: `%TEMP%/gmi-r3-node-final.log`, `gmi-r3-browser-gate.log`, `gmi-r3-browser-final-counts.log`, `gmi-r3-full-serial.log`, `gmi-r3-lifecycle-final.log`, `gmi-r3-eslint-final.log`, `gmi-r3-eslint-without-baseline-map.log`, `gmi-r3-map-eslint-baseline.log`. Chrome/font downloads used the permissions already required by these production gates. No dependencies changed. A point-ring pane error found during development was corrected before the passing browser gate. Final count-label clarification was rebuilt and rechecked separately.

## 9. Known limitations

Manual R2/R3 acceptance on a real GMI and with NVDA/JAWS remains to be performed. Optional private/corpus tests retain their existing skips. Baseline suite/lint failures above remain.

The object list still ignores Tema/Felt filtering, as before; filter-panel integration belongs to a later milestone. Selected-only mode deliberately overrides changed-only membership as well as filters/search so the complete selection remains inspectable. Map halos respect the map's own filters and visibility. The original map uses original source geometry/semantics, while the table can show proposed values; selection links them by stable source identity.

As in R2, a row-navigation request can update the map focus before the draft decision; cancelling still preserves the original editor/draft. Checked selection is independent of that focus channel.

## 10. Manual acceptance checklist

1. Load a mixed real GMI. Confirm the base table has no selection column. Enter Rettinger and confirm the compact column appears with teal native checkboxes.
2. Check three lines. Confirm no editor opens and the bar reports three selected. Focus another object and compare its marker, keyboard outline and checked membership.
3. Search/filter so one selected line is outside the normal results. Confirm two visible/one hidden, then enable “Vis bare valgte”. All three must appear with explicit normal-match counts; returning restores the same filters and selection.
4. Use a large filtered result, scroll partway and select the header. Confirm every matching object is selected, not only rendered rows. Deselect the header and verify hidden selections remain; clear the entire selection with “Fjern utvalg”.
5. Verify Shift+click and grid Space/Shift+Space range selection after sorting. Use F2/Left/Right/Escape to reach checkbox and zoom/copy controls. Enter on the grid should still navigate normally.
6. Start an object draft, then change checkboxes. No discard prompt should appear. Activate another row, cancel its draft prompt, then confirm on a second attempt. Confirm the draft guard still works.
7. Stage a single ordinary correction, switch Original/Foreslått/Kun endrede, undo/redo and verify checked source identities remain. In selected-only mode verify all selected objects remain inspectable even if unchanged.
8. Switch geometry without changing selection. Begin checking the other geometry: cancel replacement, then repeat and explicitly replace. Check both point and line halos.
9. Move the pointer away and confirm map halos persist. Replace selected objects at equal count and verify map updates. Clear selection; popups, hover and object focus must continue working normally.
10. Leave/re-enter Rettinger, navigate to FOTO/Validator, remove/reimport the GMI and reset the app. Selection must not carry to a new document or workspace entry. Source invalidation must clear it.
11. At 1366×768 and 1280×720, inspect checked, unchecked, indeterminate and focus states, cell alignment and bar height. Smoke-test the retained object list, Masseendringer modal, Validator inspection/handoff and FOTO import/navigation.

## 11. R4 considerations

Use this binding and explicit source-key snapshot as R4's input. Selected count is not eligibility: keep applicability/eligibility in the existing M5B helper. Do not interpret the current filtered row set, keyboard cursor, map focus or hover as the selection.

A preview should bind to session/source identity and the explicit selection snapshot; shrink/widen handling and stale-preview checks remain R4 work. The bar currently exposes only functional selection controls. Add “Rediger valgte (N)” only when the real inspector workflow exists, passing through the existing draft guard at that deliberate transition.
