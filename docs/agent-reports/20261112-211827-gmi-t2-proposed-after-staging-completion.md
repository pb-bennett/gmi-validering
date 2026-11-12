# T2 (UX-06) - Proposed table after staging: completion

Date: 2026-11-12, Europe/Oslo. Branch `feature/photo-workspace`; starting and final HEAD `9c980312e44707fbcfae387aa1a580d9d621a565`. Starting working tree was clean.

## Scope and outcome

Read the committed H1/U4, H3, H4 and B3 completion reports, development/privacy/security guidance, and the current view-intent helper, store action, individual editor and both batch staging routes before editing.

Most T2 behavior already exists in S5: `gmiTableViewAfterStage` and `showGmiEditProposedAfterStage` switch automatic/default Original to proposed; explicit Original survives repeated stages; proposed/changed choices remain selected. Successful individual, selection-batch and modal-batch callbacks already use this action. It reuses `setGmiEditTableView(..., { by: 'auto' })`; explicit Original returns before that setter, preserving the stored user-intent map. U4 zero-correction derivation and verified-proposed fallback remain unchanged, as do H3 handoff and H4 return navigation. No duplicate view mechanism was added.

The missing defensive behavior was in both batch callers: they treated any `ok` result as successful staging, although the registry also supports `ok: true, staged: false` for an empty correction. Both now require `result.staged` before publishing `onStaged`, changing the displayed view, clearing the form or opening the staged result. A no-op instead explains that no correction was added. The individual editor already had this guard.

No ChangeSet engine, Validator rules, source bytes, patch/export paths, editing eligibility, dependencies, geometry or navigation owner changed. No T3 or unrelated slice was implemented.

## Changed files

- `src/components/gmi-edit/GmiBatchInspector.js`: require a genuinely staged result before the existing success callback.
- `src/components/gmi-edit/GmiBatchDialog.js`: same guard for the modal route.
- `tests/gmiEditWorkspace.test.mjs`: automatic view changes preserve every other store reference; repeated staging preserves explicit user intent; both batch routes retain the no-op guard before success publication.
- `tests/gmiS5FocusContinuityUi.test.mjs`: subsequent individual and batch stages, preview/pending/cancelled approval, explicit Original, undo/redo, and table/map continuity assertions.
- This report.

## Verification - passed

- Final `node --test tests/gmiEditWorkspace.test.mjs`: **33 passed, 0 failed, 0 skipped**.
- Focused Node regression gate: **331 total, 322 passed, 4 baseline failures, 5 skipped**. Included all non-UI `gmiEdit*.test.mjs`, plus `gmiEditWorkspace`, `gmiEditSelection`, `gmiIndividualSelection`, `gmiSelectionProfile`, `gmiBatchRiskGate`, `gmiValidatorSelectionHandoff`, `gmiValidatorEditing`, `gmiBatchInspector`, `gmiFieldBatchPlan`, `gmiRettingerSidebar`, `gmiLayerFilters`, `layerTableRows`, `objectTableInspection`, `layerTableReveal`, and `validationV2WorkspaceInspector` (all `tests/`, `.test.mjs`). Wildcards were expanded in PowerShell.
- `npx.cmd --no-install eslint src/components/gmi-edit/GmiBatchDialog.js src/components/gmi-edit/GmiBatchInspector.js tests/gmiEditWorkspace.test.mjs tests/gmiS5FocusContinuityUi.test.mjs`: **passed, no errors or warnings**.
- Fresh final `npm.cmd run build`: **passed**, normal production Turbopack build; existing Browserslist age notice.
- Final T2/S5 browser suite: **4 passed**, including all three subtests. First/subsequent individual and batch stages preserve automatic proposed view; explicit Original stays selected. Preview, pending approval and cancelled approval do not switch. Undo/redo alone preserve the explicit view. Existing success-message focus, staged-result focus and keyboard continuation remain intact.
- Browser continuity compares geometry, both table scroll offsets, selected source rows, active source row, and map highlight path/opacity values across staging. The individual case sets horizontal scroll before staging. The batch case asserts that highlight paths actually exist. The object and batch inspector remain on their existing editing/result routes; the new guard introduces no focus or navigation operation. Store coverage asserts every state reference except view/intent remains identical during the automatic view action.
- Inspected staged-result screenshots at **1280x720** and **1366x768**: active proposed mode, selected rows and map context visible; table toolbar fits, right inspector scrolls, result focus remains visible, no horizontal page overflow. Screenshots: `%TEMP%/gmi-s5-staged-{1280x720,1366x768}.png`.
- `git diff --check`: **passed**.

Production browser gate used the fresh build on task-owned `http://127.0.0.1:3202`, `PHOTO_UI_URL` and `GMI_EDIT_SCREENSHOT_DIR=%TEMP%/gmi-t2-screenshots`, serially:

```text
node --test --test-concurrency=1 tests/gmiS5FocusContinuityUi.test.mjs tests/gmiIndividualSelectionUi.test.mjs tests/gmiSelectionProfileUi.test.mjs tests/gmiBatchRiskGateUi.test.mjs tests/gmiValidatorSelectionHandoffUi.test.mjs tests/gmiValidatorReturnUi.test.mjs tests/gmiValidatorSelectionUi.test.mjs tests/gmiEditWorkspaceUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/gmiEditValidationUi.test.mjs tests/gmiValidatorEditingUi.test.mjs tests/gmiLayerFiltersUi.test.mjs tests/gmiEditSelectionUi.test.mjs tests/gmiBatchInspectorUi.test.mjs tests/gmiR4UxPolishUi.test.mjs tests/gmiEditBatchUi.test.mjs tests/layerDataTableGeometryUi.test.mjs tests/layerDataTableKeyboardUi.test.mjs tests/gmiRettingerSidebarUi.test.mjs tests/gmiFieldValueInputUi.test.mjs tests/gmiBatchFieldValueInputUi.test.mjs tests/layerTableRevealUi.test.mjs
```

Initial gate: **148 total, 137 passed, 11 failed, 0 skipped**. Three failures (B2 subtests and parent) were a task setup error: the screenshot output directory did not exist, followed by a dependent failure. Created the directory and reran B2, final T2/S5 and M5C serially: **15 total, 9 passed, 6 baseline failures, 0 skipped**. B2 and final T2/S5 pass completely. The other eight failures from the initial gate were reproduced on starting HEAD as described below; no unresolved task regression was observed. Passing suites were not repeatedly rerun.

## Baseline failures - separately reproduced

Created an isolated `git archive HEAD` under `%TEMP%/gmi-t2-baseline-20261112-211057`; no branch/ref changes. Direct baseline command:

```text
node --test tests/gmiRettingerSidebar.test.mjs tests/validationV2WorkspaceInspector.test.mjs
```

**8 total, 4 passed, 4 failed, 0 skipped**, matching all four focused Node failures:

- R6B source contract expects the former selection/navigation wiring.
- Three workspace-inspector contracts expect former sidebar width, shell placement and map/3D composition source patterns.

Baseline production browser verification used the unmodified archived source with linked repository dependencies, built using `next build --webpack`, served on task-owned port **3203**. The initial baseline Turbopack attempt could not resolve the dependency junction outside its filesystem root, so webpack was used only for this isolated baseline evidence. Both production builds completed; no dependency/configuration change was made in the repository.

```text
node --test --test-concurrency=1 tests/gmiR4UxPolishUi.test.mjs tests/gmiValidatorEditingUi.test.mjs
```

**16 total, 8 passed, 8 failed, 0 skipped**, reproducing the same current-code failures:

- R4 UX: the existing expanded-table preview summary fails the assertion that it is within 140 px of the inspector top (plus failed parent).
- M5C/R5: existing inspector/grid viewport bounds assertion fails before staging; subsequent dependent subtests fail because that workflow did not complete (five failed subtests plus parent).

These baseline layout/source contracts were left outside T2 scope. This report does not claim the entire regression gate is green.

## Skipped and outstanding acceptance

- Five focused Node checks skipped because `GMI_EDIT_CORPUS` is unset; no private/contractor corpus was opened or modified.
- Full `tests/*.test.mjs` and a separate development Strict Mode pass were not run. Verification targeted the authorized editing, source-safety, U4, B1-B3, H3/H4 and Rettinger paths.
- Real-delivery/manual and assistive-technology acceptance remain unperformed. Synthetic browser acceptance is not real-file acceptance.
- The no-op result is defensively guarded and source-contract tested; ordinary UI eligibility already prevents an empty batch. No production testing hook was introduced to force that otherwise unavailable route.

## Git and resources

No staging, commit, push, merge, branch/ref change, synchronization or deployment. All task changes are unstaged, plus this untracked report; branch and HEAD remain unchanged. Existing listeners on ports 3110-3113 were left alone. Task-owned production servers on ports 3202 and 3203 were stopped after verification. Browser harnesses cleaned their own profiles/fixtures. Temporary baseline archive, logs and screenshots remain under the system temporary directory for review.

Logs: `%TEMP%/gmi-t2-{workspace-final,node,build-final,browser-gate,browser-rerun,baseline-final,browser-baseline,baseline-build-webpack}.log`. Final T2 browser evidence is in `browser-rerun`; all four T2/S5 tests passed after the final test additions.
