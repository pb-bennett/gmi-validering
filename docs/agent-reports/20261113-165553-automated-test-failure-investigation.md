# Automated-test failure investigation

Repository: `C:/GitHub/gmi-validering-test`. Branch: `feature/photo-workspace`. Starting/final HEAD: `d77f867`. Starting working tree was clean. Scope: the eight reported Node failures and three legacy FOTO export-browser failures, plus one download-harness race exposed by the regression run. **Only tests changed; no production behavior, dependencies, fixture bytes or hashes changed.**

Read root AGENTS.md (no nested instructions found), development/security/privacy guidance, the two requested FOTO reports, and relevant M10, automatic metadata adoption, R6B and checkbox soft-focus completion reports. No later milestone was implemented.

## Reproduction and baseline evidence

Ran each of the five affected Node files individually before editing. All eight failures reproduced. Built the current application with `npm.cmd run build` and ran each affected browser file individually against production: all three reported browser failures reproduced (the loaded-GMI parent also failed).

Created a detached worktree at `%TEMP%/gmi-test-baseline-163243d`, with the existing installed dependencies linked by a junction. Ran the same five Node files individually there. All eight failures reproduced with the same assertions/errors. Built that isolated application with `npm.cmd run build -- --webpack`, served it on port 3252, and ran its original `photoAcceptanceRenderingUi` and `photoLoadedGmiUi` individually: the same three browser failures reproduced. Baseline Webpack and current Turbopack both built successfully; baseline did not copy the main workspace's environment file. This is an explicit build-environment difference, not evidence of identical build configuration.

The baseline server, dependency junction and detached worktree were removed after comparison. The user's branch was never switched or reset. Current production tests used this task's server on port 3251.

| Investigated failure | Observed cause and classification | Resolution and retained contract |
|---|---|---|
| `appInfoUiContract`: working header/feature branch | Obsolete two-branch source expectation: `sidebar={fieldValidationOpen ? …}`. FOTO and Rettinger now precede Validator and normal sidebar branches. Reproduced on `163243d`; `git show 7fb6f59 -- src/app/page.js` shows the FOTO branch introduction. | Assert all four branches under the shared header. Keep header placement, resize reach and sidebar controls assertions. |
| `gmiRettingerSidebar`: R6B guarded selection | Obsolete exact call signature and inline guard-body expectation. `8ec0c25` deliberately added `soft: request.soft === true` and an `accept` callback guarded according to focus intent. The T3 completion report explains dirty-draft retention versus ordinary guarded navigation. Reproduced on `163243d`. | Assert the soft request flag, intent derivation, retain return, selection callback and `guard(accept)` path. Keep the two tabs, geometry owner, table-only navigation and existing editing components. Pure and production T3/draft checks supplement the source contract. |
| `statsUiContract`: controls/source integration | Obsolete exact predicate and workspace-start marker. FOTO deliberately suppresses Stats and allows a workspace with photo layers but no parsed survey. Both changes are visible in `7fb6f59`; reproduced on `163243d`. | Preserve all control/style/content assertions and test the current workspace entry. |
| `statsUiContract`: trigger visibility | Same obsolete predicate, expecting only table/inspector/profile suppression. Reproduced on `163243d`. | Extract the actual four-input predicate and exercise all 16 combinations, including FOTO suppression and normal-workspace visibility. |
| `validationV2WorkspaceInspector`: sidebar width | Obsolete assumption that Validator is the first sidebar branch. Normal/Validator width remains shared; FOTO and Rettinger have their accepted widths. Reproduced on `163243d`. | Assert the Validator branch and width handoff, plus explicit FOTO/Rettinger/normal width choice. Preserve inspector width and resize assertions. |
| `validationV2WorkspaceInspector`: bottom dock | Obsolete `bottomDockOpen={layerDataTableOpen}` and prop-free MapView expectations. FOTO suppresses the normal dock and MapView now receives photo controls. Reproduced on `163243d`; corresponding changes appear in `7fb6f59`. | Assert FOTO suppression, retain the LayerDataTable dock and layout ratios, and allow MapView's additional props. |
| `validationV2WorkspaceInspector`: map resize/3D | Obsolete self-closing MapView spelling with no additional props. Reproduced on `163243d`. | Retain zoom-handler wiring, MapView/Viewer3D order, ResizeObserver/invalidateSize and parent-sized Canvas assertions. |
| `terrainPhotoGml`: browser dynamic import | Harness failure: network diagnostic captured HTTP 404 for `/src/data/validation-v2/authoritative-value-tables.js`. The session import graph reaches this tracked module, but the harness allowed only `src/lib`, browser checks and dependencies. Reproduced on `163243d`. | Add only the required `src/data/validation-v2/` subtree to the harness allowlist; preserve root containment. No parser/application fix. |
| `terrainPhotoGml`: assertion exposed after module loading | Obsolete heading policy: “Raw GML zero does not establish operational north.” A temporary baseline diagnostic with only the allowlist corrected reproduced this assertion on `163243d`. Commit `f00e439` and the automatic-metadata completion report explicitly replace this policy: GML north is ordinary automatically accepted source metadata. | Require accepted `0°`, GML provenance and `acceptance: auto`, and separately assert raw GML zero evidence remains intact. Preserve explicit position acceptance, conflicting evidence, original File identity, marker visibility and cleanup checks. The equivalent optional-corpus direction expectation is updated to the same policy; that private branch was not run. |
| `photoAcceptanceRenderingUi`: missing legacy heading icon | Obsolete M6 rendering contract. M10 blocks on Innhold before the control/package heading exists. Reproduced on `163243d`; `04d9bdb` and the M10 report explicitly replace the two-screen interface. | Assert blocked readiness, disabled advance, no download, the actual missing filename after opening its diagnostic, and an available completion route. Keep target-specific missing-time explanations and standalone/return behavior. Do not restore the retired icon location. |
| `photoAcceptanceRenderingUi`: done screen | Obsolete success copy/footer/file element. M10 intentionally says “Nedlastingen er startet”, exposes the filename in `data-downloaded-filename`, retains package/report/back actions and uses the fuller schema/Gemini warning. Reproduced on `163243d`. | Assert the actual initiated-download heading and filename, full warning and footer actions. Keep repeated same-filename download, prohibited old copy and absence of numbered import instructions. Permit the accepted package-tree list items. |
| `photoLoadedGmiUi`: dual-export summary | Obsolete combined summary sentence and secondary package presentation assumptions. Reproduced on `163243d`. Relevant `DeliveryWizard`, `deliveryWizard`, `photoCompletion`, export-plan and content-step source files are identical between `163243d` and `d77f867`. | Assert structured summary values: four GML records, three attachment files and one shared original diagnostic. Use the displayed downloaded filename and structured EPSG:5972/Z-placeholder diagnostic. Preserve excluded placements, profile/context/label choices, UUID/Gemini XML conventions, original attachment bytes, repeated occurrence independence, append and WFS isolation assertions. |

No investigated failure demonstrated a production regression requiring an application correction.

## Additional regression finding: M10 download helper

The first grouped production run had **75 tests: 68 passed, 7 failed, 0 skipped**. One root failure compared combined-delivery bytes with the earlier split-delivery bytes; five later subtests and the parent failed dependently because the first failure interrupted navigation. The unchanged M10/T3 rerun passed **14/14**; this alone was not treated as proof of a harmless transient.

Inspection showed `downloaded()` waited for browser initiation and then read an existing timestamped filename. Separate plans can share a filename within one second. A synthetic delayed-handoff reproducer confirmed the risk: the old filename-only read returned `split bytes`, then the completed second download contained `combined bytes`. An ordinary same-name Chrome probe also confirmed that the destination path is reused. These probes used only temporary synthetic files and the existing Chrome harness.

Changed the helper to allocate an empty child directory and set Chrome's download path before each handoff. The same filename and exact-byte assertions remain unchanged, including repeated-download byte equality. This isolates asynchronous downloads without adding sleeps, changing names or changing application export behavior. The corrected M10 suite passed **12/12** individually. Its fresh directories are covered by the fixture's existing checked cleanup.

## Exact files changed

- `tests/appInfoUiContract.test.mjs`
- `tests/browser/photoSpatialChecks.mjs`
- `tests/deliveryWizardUi.test.mjs`
- `tests/gmiRettingerSidebar.test.mjs`
- `tests/photoAcceptanceRenderingUi.test.mjs`
- `tests/photoLoadedGmiUi.test.mjs`
- `tests/statsUiContract.test.mjs`
- `tests/terrainPhotoGml.test.mjs`
- `tests/validationV2WorkspaceInspector.test.mjs`
- This report.

## Verification

Passed:

- Each of the five affected Node files individually after correction: **24 tests passed, no failures/skips**. Terrain's one Node test executed seven synthetic browser integration checks.
- Each affected export-browser file individually after correction: `photoAcceptanceRenderingUi` **3/3**, `photoLoadedGmiUi` **10/10**, no skips.
- Grouped Node command: `node --test --test-concurrency=1 tests/appInfoUiContract.test.mjs tests/gmiRettingerSidebar.test.mjs tests/statsUiContract.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/terrainPhotoGml.test.mjs tests/gmiCheckboxSoftFocus.test.mjs tests/gmiEditWorkspace.test.mjs tests/photoAutoMetadata.test.mjs tests/photoGmlDirectionEvidence.test.mjs`: **129 passed, 0 failed, 0 skipped**.
- Full serial command: `node --test --test-concurrency=1 "tests/*.test.mjs"`: **2,197 tests, 2,070 passed, 0 failed, 127 skipped**. This ran after the original failures were corrected and before the final M10 browser-helper isolation; that browser suite is skipped in this invocation without `PHOTO_UI_URL`, and its final helper was verified separately in production.
- Current production build: `npm.cmd run build` passed. Application inputs remained unchanged throughout this test-only task. Isolated baseline Webpack build also passed.
- ESLint on all nine changed JS/MJS files passed. `git diff --check` passed.

Final grouped production-browser run: **77 passed, 0 failed, 0 skipped**. Command: `node --test --test-concurrency=1 tests/photoAcceptanceRenderingUi.test.mjs tests/photoLoadedGmiUi.test.mjs tests/deliveryWizardUi.test.mjs tests/photoExportWizardUi.test.mjs tests/photoExportReturnUi.test.mjs tests/photoExportLayoutUi.test.mjs tests/gmiRettingerSidebarUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/gmiCheckboxSoftFocusUi.test.mjs`, with `PHOTO_UI_URL=http://127.0.0.1:3251`. Existing layout/soft-focus tests include 1280×720 and 1366×768, with additional desktop/mobile sizes.

Failed attempts, separately: original/current/baseline reproductions are documented above; intermediate browser reruns exposed additional obsolete warning/count/footer selectors behind the first assertion, and these were migrated to the accepted M10 presentation. The initial grouped M10 byte failure was resolved in the harness as described above. No failing assertion was skipped or meaningful byte/source/download assertion removed.

Skipped/unverified: the full suite's **127 skips** include suites requiring explicit production URLs and opt-in/private fixtures. No skip gates were added. The private 148-photo terrain branch was not executed; the synthetic terrain checks passed. No new real-file/manual, assistive-technology or Gemini-import acceptance was performed. Existing module-type/Browserslist-age warnings remain. Logs are retained under the Windows temporary directory as `investigate-*.log`, `baseline-163243d-*.log`, `corrected-*.log` and `investigation-*.log`; no private corpus contents were used.

## Remaining issues and milestone recommendation

**Recommendation: automated-test health is sufficient to proceed with the next scoped Rettinger milestone.** All original failures are resolved by justified test/harness corrections, the full Node suite is green, and the final relevant production-browser group is green. No investigated production defect remains open. Retain milestone-specific regression gates and the existing real-file/manual acceptance requirements; this result does not certify browser suites outside the listed runs or supersede remaining acceptance in earlier reports.

## Git and publication

All task edits remain unstaged and uncommitted on `feature/photo-workspace` at `d77f867`. No stage, commit, push, deploy, reset, branch switch or synchronization occurred. The detached comparison worktree was task-owned and removed. Unrelated planning reports were untouched. Both task-owned production servers (3251/3252) were stopped. Final status contains only the nine test-file edits and this report; `git diff --check` passed again after report completion.
