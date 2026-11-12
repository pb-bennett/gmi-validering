# T1 row reveal and «Vis i Foreslått» — completion

Date: 2026-11-12, Europe/Oslo. Branch: `feature/photo-workspace`; starting and final HEAD: `a4134e6`.

## Scope and outcome

Implemented T1 from sections 5 and 9 of `20261111-085500-gmi-validator-rettinger-unified-workflow-planning.md`. Correction details now issue a table-only reveal request with their source objects and fields. The table locates the first visible target in its actual TanStack sorted model, centers the virtualized row, moves its keyboard cursor, and outlines it for five seconds. Edited fields receive horizontal navigation using existing column order/widths.

Navigation does not invoke object selection, the inspector draft guard, checkbox membership changes, or map highlight actions. Original/Foreslått availability and explicit view intent continue through the existing view setter and availability helper. No H3 handoff, ChangeSet, validation, source byte, export, or eligibility changes were made.

Hidden targets produce an accessible explanation for Tema/Felt filters, search, or Bare valgte, with an explicit «Nullstill filtre» action. That action resets the existing layer filters, clears search, exits selection-only display without changing membership, and retries the pending reveal. Absent targets receive an explanation without a misleading reset action. Requests are consumed by identity; table opening/closing, layer removal and global reset clear outstanding store requests. Local pending navigation clears on table/geometry/inspection/source changes.

**Decision/deviation:** section 5 proposed automatically clearing search and leaving Bare valgte. The implementation follows this task's stricter instruction to explain hidden targets and require explicit reset. Multi-object corrections choose the first currently visible object in sorted order; if none is visible, the explanation remains until reset or dismissal. Geometry follows the correction's first cell, matching the existing action.

## Changed files

- `src/lib/layerTableReveal.mjs`: pure classification using existing final sorted, pre-filter, filtered and searched row sets.
- `src/components/LayerDataTable.js`: request consumption, virtualized scrolling/cursor/marker, hidden/absent explanations and explicit reset.
- `src/lib/store.js`: transient reveal request/consume API and cleanup.
- `src/components/gmi-edit/GmiEditWorkspace.js`: correction-details action emits reveal candidates after existing view/geometry navigation.
- `tests/layerTableReveal.test.mjs`: visible/sorted/multiple targets, filter, search, selected-only and absent cases.
- `tests/layerTableRevealUi.test.mjs`: synthetic 300-line production workflow; late-row correction, ascending/descending sorting, scrolling, search and Felt exclusion, explicit reset, selection-only exclusion, retained membership and inspector focus at both laptop sizes.
- This report.

## Verification

Passed:

- Focused Node gate: **113 tests, 110 passed, 3 baseline failures, 0 skipped**:
  `node --test tests/gmiRettingerSidebar.test.mjs tests/gmiLayerFilters.test.mjs tests/statusBrowsing.test.mjs tests/layerTableRows.test.mjs tests/layerTableReveal.test.mjs tests/tableSearch.test.mjs tests/objectTableInspection.test.mjs tests/gmiEditSelection.test.mjs tests/gmiEditWorkspace.test.mjs tests/gmiValidatorEditing.test.mjs tests/gmiBatchInspector.test.mjs tests/validationV2WorkspaceInspector.test.mjs`.
- New helper tests independently: **3/3 passed**.
- Full serial Node gate: `node --test --test-concurrency=1 "tests/*.test.mjs"`: **2,105 total; 1,980 passed, 7 failed, 118 skipped**. Failures below; skips include production browser suites without `PHOTO_UI_URL` and optional/private acceptance. They are not real-file acceptance.
- Final fresh production build: `npm.cmd run build` passed, including compilation and static generation.
- Final serial production browser gate: **49/49 passed, 0 skipped**, using task-owned `http://127.0.0.1:3171`, `PHOTO_UI_URL`, and `GMI_EDIT_SCREENSHOT_DIR=%TEMP%/gmi-t1-screenshots`:
  `node --test --test-concurrency=1 tests/layerTableRevealUi.test.mjs tests/gmiRettingerSidebarUi.test.mjs tests/gmiValidatorSelectionUi.test.mjs tests/gmiValidatorEditingUi.test.mjs tests/gmiEditSelectionUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/layerDataTableKeyboardUi.test.mjs tests/gmiS5FocusContinuityUi.test.mjs`.
- Visually inspected `t1-hidden-1280.png`, `t1-revealed-1280.png`, `t1-hidden-1366.png`, and `t1-revealed-1366.png` at **1280×720** and **1366×768**. Message/reset controls and outlined row fit the table dock; inspector remains visible. Existing H2 regression also checks selection map halos.
- ESLint on all six changed JS/MJS files: **0 errors, 1 existing warning** (`react-hooks/incompatible-library` on TanStack `useReactTable`). Reproduced the same warning by piping starting-HEAD `LayerDataTable.js` into ESLint with its original filename.
- `git diff --check` passed.

Failed checks and baseline evidence, separately:

- Before application changes, `gmiRettingerSidebar` + `validationV2WorkspaceInspector` produced **8 total, 5 passed, 3 failed**: sidebar width, workspace-shell placement, map/3D composition. The same three fail in both final Node gates.
- Full serial gate additionally fails unchanged `appInfoUiContract` (one header assertion), `statsUiContract` (two UI source assertions), and `terrainPhotoGml` (cannot dynamically import `/tests/browser/photoSpatialChecks.mjs`). Verified the relevant source/test files have no diff against starting HEAD; these agree with the H2 completion report's seven baseline failures. No assertions were weakened.
- Initial sandboxed builds could not fetch the existing Roboto Google Font; approved builds with network access passed. Initial sandboxed Chrome checks timed out enabling Runtime; approved Chrome execution passed. The slow sandbox full-suite attempt was stopped and superseded by the completed full serial run with Chrome access. `npm.cmd`/`npx.cmd` were used because PowerShell blocks `.ps1` shims.
- The first new browser-test draft incorrectly expected individual staging to open correction details automatically. Corrected the test to open existing Endringer/details controls; final implementation/browser gate passes.

## Remaining acceptance and risks

- Real contractor/manual acceptance was not run; all new fixtures are synthetic. Manual Tema-filter navigation remains recommended; automated browser exclusion covers Felt, search and selected-only, and Node classification uses the table's shared Tema/Felt-derived rows.
- Browser multi-object sort choice is covered by the pure helper rather than a new batch staging scenario. Existing batch, editing and source-safety regressions run in the full Node suite; existing S5 production batch/focus coverage passes in the browser gate.
- The seven unrelated full-suite failures remain unresolved and are not acceptance of those areas.

## Git and process status

No staging, commit, push, branch change or synchronization. Preserved the three pre-existing untracked planning reports. Only this task's application/test/report files were added or modified. The task-owned production server on port 3171 was stopped; browser profiles and synthetic temporary fixtures were cleaned by their harnesses. Logs and screenshots remain under the system temporary directory, outside tracked source.
