# T3 (UX-03) - Checkbox soft focus: completion

Date: 2026-11-12, Europe/Oslo. Branch `feature/photo-workspace`; starting/final HEAD `633ad6c090a35821f99c7a7e507dd943c5a35dcf`. Starting working tree was clean. No staging, commit, push, branch/ref change or deployment.

## Outcome and decisions

Inspected table checkbox/grid navigation, the one-shot object request, selection binding/host validation, workspace draft guard, map highlight renderer, B3 individual navigation, and the committed H2-H4/B3 reports before editing. Development/privacy/security guidance and the existing T2 implementation were retained.

- An accepted row check now sends the existing object request with `soft: true`. This includes pointer checks, native checkbox Space, grid Space, and the clicked endpoint of a checked range. Requests are emitted only after the existing selection reducer accepts new membership with the live source/session binding and Rettinger host. Refused writes and unchecks produce no focus request. Header and select-all actions do not supply a focus target. Cross-geometry replacement retains its existing explicit selection confirmation; soft focus runs only after that membership is accepted.
- The workspace remains the inspector owner. A batch inspector uses its existing read-only object inspection, retaining configuration and draft values. A clean individual editor opens the object. A dirty individual editor retains object and values, while membership changes independently and a Norwegian status explains why the other object was not opened. This status does not steal keyboard focus and clears when the draft is resolved. Checkbox requests never invoke the draft guard.
- ChangeSet details return to the object editor through the same selection path as ordinary navigation. B3 continues to use its existing source binding, itinerary and guards.
- Ordinary Rettinger table row clicks now request navigation without preemptively changing the active map highlight. The workspace highlights only accepted focus/inspection, including reselecting the current object. Pending or cancelled ordinary navigation leaves the prior active object and highlight intact. Existing table behavior outside Rettinger and Validator inspection behavior remain unchanged. Hover and checkbox-selection halo channels remain separate from active focus.
- No new selection owner, navigation queue or draft guard was introduced. Source identity, selection membership and handoff provenance are not reconstructed by the focus path. No Validator rules, ChangeSet engine, source bytes, export or editing eligibility changed. No unrelated slice was implemented.

## Files changed

- `src/components/LayerDataTable.js`: post-selection soft requests for row checks; header/bulk actions stay focus-neutral; workspace owns accepted Rettinger row highlights.
- `src/components/gmi-edit/GmiEditWorkspace.js`: soft intent decisions, retained-draft status/lifecycle, existing batch inspection reuse, accepted highlight ownership.
- `src/lib/gmiEditSelection.mjs`: pure accepted-membership/source/host check for checkbox soft focus.
- `src/lib/gmiEditView.mjs`: pure inspector-state focus decision.
- `src/lib/store.js`: optional soft flag on the existing one-shot request.
- `tests/gmiCheckboxSoftFocus.test.mjs`: new pure intent/membership/range/refusal tests.
- `tests/gmiCheckboxSoftFocusUi.test.mjs`: new synthetic browser workflows at both laptop sizes.
- `tests/gmiEditWorkspace.test.mjs`: ordinary/soft intent and identity-based one-shot consumption, including superseding requests.
- `tests/gmiEditSelectionUi.test.mjs`: deliberate T3 contract update: a clean checkbox selection opens the last checked object. Appearance, halos, membership, range/search/history and draft assertions remain.
- This report.

## Passed checks

- Final focused Node: `node --test tests/gmiCheckboxSoftFocus.test.mjs tests/gmiEditWorkspace.test.mjs tests/gmiEditSelection.test.mjs`: **48 passed, 0 failed, 0 skipped**.
- Expanded Node gate: **277 total, 268 passed, 4 baseline failures, 5 skipped**. Included all non-UI `gmiEdit*.test.mjs`, plus `gmiCheckboxSoftFocus`, `gmiIndividualSelection`, `gmiSelectionProfile`, `gmiBatchRiskGate`, `gmiValidatorSelectionHandoff`, `gmiValidatorEditing`, `gmiBatchInspector`, `gmiFieldBatchPlan`, `gmiRettingerSidebar`, `gmiLayerFilters`, `objectTableInspection`, `layerTableReveal`, and `validationV2WorkspaceInspector` (all under `tests/`, suffix `.test.mjs`; wildcard paths expanded in PowerShell). The final focused rerun includes the last request/lifecycle edits.
- Fresh final `npm.cmd run build`: **passed**, normal Turbopack compilation and static generation. An intermediate build failed resolving the internal Turbopack Google-font module; retrying without application/dependency edits passed. The cause was not investigated. Final build also passed after the last status-lifecycle edit.
- `npx.cmd --no-install eslint` on all nine changed/new JS/MJS files: **0 errors, 1 baseline TanStack `useReactTable` incompatible-library warning**. Independently reproduced that warning on the archived starting-HEAD table.
- Final targeted T3 and updated selection browser suites: **9 passed, 0 failed, 0 skipped** before the final status cleanup. The final broad gate below repeats these suites against the final fresh build.
- Visual inspection of `t3-notice-*` and `t3-dirty-*` screenshots at **1280x720** and **1366x768**: retained-draft status is readable, current object/draft remains in the right editor, checked rows and map context remain visible, toolbar fits and editor/table scrolling remains usable. No page horizontal overflow. Files remain in `%TEMP%/gmi-t3-screenshots/`.
- `git diff --check`: **passed**. Task files retain CRLF.

New browser acceptance covers actual pointer checkbox activation, native checkbox Space, grid End/Space, preserved grid DOM focus, uncheck, header select/unselect, select-all, clean and dirty ranges, dirty draft retention with selected membership and no dialog, visible explanation, read-only batch inspection with an unfinished batch value, history-detail exit via a check, and ordinary row-click guard cancellation. It compares active source row and actual rendered map path geometry/styles before, during and after cancellation; synthetic source-file bytes remain identical. The new suites report no browser runtime exceptions.

Production gate uses task-owned `http://127.0.0.1:3204`, `PHOTO_UI_URL` and `GMI_EDIT_SCREENSHOT_DIR=%TEMP%/gmi-t3-screenshots`, with fresh production output and serial shared-server tests:

```text
node --test --test-concurrency=1 tests/gmiCheckboxSoftFocusUi.test.mjs tests/gmiValidatorSelectionUi.test.mjs tests/gmiValidatorSelectionHandoffUi.test.mjs tests/gmiValidatorReturnUi.test.mjs tests/gmiIndividualSelectionUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/gmiEditSelectionUi.test.mjs tests/gmiBatchInspectorUi.test.mjs tests/gmiEditWorkspaceUi.test.mjs tests/gmiEditValidationUi.test.mjs tests/gmiValidatorEditingUi.test.mjs tests/gmiS5FocusContinuityUi.test.mjs tests/layerTableRevealUi.test.mjs tests/layerDataTableKeyboardUi.test.mjs tests/layerDataTableGeometryUi.test.mjs tests/gmiRettingerSidebarUi.test.mjs tests/gmiSelectionProfileUi.test.mjs tests/gmiBatchRiskGateUi.test.mjs
```

Final serial gate on the final fresh build: **114 total, 108 passed, 6 reproduced baseline R5 failures, 0 skipped**. T3, H2-H4, B1-B3, T1/T2, the ordinary draft guards and all other executed Rettinger browser suites pass. The six baseline failures and remaining acceptance are separated below. No unresolved T3 regression was observed.

## Baseline failures and resolved iterations

An isolated `git archive HEAD` at `%TEMP%/gmi-t3-baseline-20261112-221039` supplied starting-commit evidence; no Git refs were changed.

- Baseline Node command: `node --test tests/gmiRettingerSidebar.test.mjs tests/validationV2WorkspaceInspector.test.mjs`: **8 total, 4 passed, 4 failed**. These reproduce all four expanded-gate failures: R6B source wiring; normal sidebar width; workspace-shell placement; map/3D composition source contracts. They remain outside T3 scope.
- Baseline production R5 command: `node --test --test-concurrency=1 tests/gmiValidatorEditingUi.test.mjs`: **7 total, 1 passed, 6 failed**. A separate fresh baseline webpack build, linked repository dependencies and task-owned port **3205** reproduce the current-code inspector/grid viewport-bounds failure before staging. Four subsequent dependent subtests fail because the preceding flow did not complete, plus the failed parent. Webpack was used for the isolated archive to support its external dependency junction; repository configuration/dependencies were unchanged. R5 is not claimed fully green.
- The first new browser attempt waited for a layer-casing pane that does not represent active-object styling. Corrected the test to inspect the actual feature paths in the overlay pane. Separate browser instances per viewport also avoid carrying a failed/unsaved workflow across page reloads. Final new tests pass.
- The initial existing-selection suite failed its deliberate old expectation that checks never open an object. Updated only that expectation/title to T3 behavior; the complete selection suite passes. No membership, halo, source-safety or guard assertion was relaxed.

## Skipped and outstanding checks

Five expanded Node checks skipped because `GMI_EDIT_CORPUS` is unset. No contractor/private/reference corpus was opened or modified. Full `tests/*.test.mjs`, a separate development Strict Mode run, real-delivery/manual acceptance and assistive-technology review were not performed. Synthetic automation does not establish those acceptance steps. R5's later browser acceptance remains blocked by its reproduced baseline layout assertion; the report does not claim a completely green regression suite.

## Git and resources

All task edits are unstaged, with the new tests/report untracked. No publication action occurred; branch and HEAD are unchanged. Task-owned production servers on ports 3204 and 3205 were stopped after testing; existing listeners on 3110-3113 were left alone. Harnesses cleaned their own temporary browser profiles and fixture directories. Baseline archive, logs and screenshots remain under the system temporary directory for review.

Logs: `%TEMP%/gmi-t3-node-{gate,complete}.log`, `gmi-t3-browser-{gate,final,complete}.log`, `gmi-t3-ui-final-retest.log`, `gmi-t3-build-complete.log`, `gmi-t3-eslint-{complete,baseline}.log`, `gmi-t3-baseline-{node,browser,build}.log`.
