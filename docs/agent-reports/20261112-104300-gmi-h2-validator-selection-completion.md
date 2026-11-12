# H2 — Validator inspection checkbox selection: completion

Date: 2026-11-12, Europe/Oslo. Branch `feature/photo-workspace`. Starting/final HEAD: `dcfdab64b27b0d18567faedc2f16c30cb5bf65ac`.

Implemented H2 from [the unified workflow plan](20261111-085500-gmi-validator-rettinger-unified-workflow-planning.md), sections 3.2–3.3, 4.1 and 9, building on [H1/U4](20261112-100725-gmi-h1-u4-completion.md). No H3 handoff or placeholder handoff button was added. Nothing was staged, committed, pushed or deployed.

## Outcome and decisions

- Validator field requests publish selection context containing canonical field, rule IDs, label and dataset kind. The contextual inspection validates and freezes that context, including its rule-ID array. Ordinary exact and contextual requests without selection context retain their existing behavior.
- The stable host key encodes `[layerId, geometryScope, canonicalFieldId, datasetKind]` as JSON. Including dataset kind extends the plan's suggested key so even atomic Original/Foreslått replacement invalidates selection. Diagnostic identity, focus subset, search and sort do not participate in the key.
- The existing `useGmiEditLayer` auto-open option initializes an unloaded session only after a selectable inspection opens. It never stages anything or enters Rettinger. Read-only, unavailable, unsupported and error descriptors do not enable checkboxes; the table shows the existing Norwegian status explanation. Loading shows “Klargjør objektutvalg…”.
- The existing table checkbox column, header checkbox, keyboard/range handlers, counts, select-visible and clear actions now pass the H1 inspection host. Membership is restricted to the complete evaluated field population, rather than just its current diagnostic subset. Selection survives same-field FEIL/SJEKK, Utvalg/Alle, search and sorting. Inspection bars contain no selected-only or editing actions.
- Source/session bindings, geometry and host identity remain mandatory. Inspection writes also verify the current inspection dataset/basis. Source/session replacement, layer removal, different field/geometry/layer/dataset, table closure and Validator closure invalidate selection. Proposed inspection selections also invalidate immediately when history replaces their exact immutable session snapshot; Original selections retain H1's source-identity semantics. Snapshot checks run on status/inspection changes rather than on every hover update.
- The map uses the selection's own layer for inspection hosts and retains the existing selection halo renderer. No separate highlight state was introduced.
- At modal widths, opening the object table dismisses the field modal and focuses the grid. Resizing a docked inspection to modal width also exposes the table. Reopening the same field can show another diagnostic without clearing its selection. This was necessary at 1280×720: screenshot inspection found that the old field modal otherwise covered the table despite DOM-driven checkbox tests succeeding. Final tests verify pointer hit-testing and actual mouse events.
- R5 “Lag retting…” remains intact, including its guarded exact handoff, shrink-only selection and staging checks. Its browser test now asserts the deliberate narrow-modal dismissal instead of clicking a close button that is already gone. Its source-index, original/proposed and subsequent handoff assertions remain.

No G5 controls, ChangeSet engine, validation rules, eligibility/approval gates, source bytes, exports, dependencies or byte-exact fixtures/manifests were changed. Selection never grants cell-editing eligibility.

## Changed files

| File | Change |
| --- | --- |
| `src/lib/validation-v2/tableInspection.js` | Publish stable field selection context. |
| `src/lib/objectTableInspection.js` | Validate/freeze context and construct its stable key. |
| `src/lib/gmiEditSelection.mjs` | Reuse the reducer with optional field-population bounds; prune members outside the inspection scope. |
| `src/lib/gmiEditSessions.mjs` | Reconcile exact proposed inspection snapshots on history/session changes. |
| `src/lib/store.js` | Verify inspection basis/revision, supply allowed members, and reject mismatched dataset/basis requests. |
| `src/components/validation-v2/ValidationV2Workspace.js` | Session initialization, lifecycle closure, same-field reopening and modal-width table access. |
| `src/components/LayerDataTable.js` | Host-aware checkboxes/bar, unavailable explanations, inspection-only actions and grid focus. |
| `src/components/MapInner.js` | Reuse map halos for the inspection host's layer. |
| `tests/objectTableInspection.test.mjs` | Context identity, immutability, malformed/foreign ownership and ordinary inspections. |
| `tests/gmiEditSelection.test.mjs` | Complete field-population bounds and pruning. |
| `tests/gmiEditWorkspace.test.mjs` | Real inspection requests, dataset/basis refusal, no staging/source mutation, history invalidation and noneditable sessions. |
| `tests/gmiValidatorSelectionUi.test.mjs` | New synthetic production browser suite for H2. |
| `tests/gmiValidatorEditingUi.test.mjs` | Deliberate narrow-modal assertion update; retain R5 regression coverage. |
| This report | Implementation, verification and remaining acceptance. |

## Verification

### Passed

| Check | Result |
| --- | --- |
| Focused Node: inspection, selection and workspace suites | **51 passed, 0 failed, 0 skipped.** |
| Expanded focused Node: those suites plus `gmiValidatorEditing` and `validationV2WorkspaceInspector` | **71 total: 68 passed, 3 baseline failures, 0 skipped.** |
| Fresh `npm.cmd run build` after the final application changes | **Passed.** |
| Final serial production browser gate below | **123 passed, 0 failed, 0 skipped.** |
| ESLint on changed files other than `MapInner.js` | **0 new errors**; the existing table/TanStack warning remains. Full-file ESLint limitations are recorded below. |
| `git diff --check` | **Passed.** |

Focused Node commands:

```text
node --test tests/objectTableInspection.test.mjs tests/gmiEditSelection.test.mjs tests/gmiEditWorkspace.test.mjs
node --test tests/objectTableInspection.test.mjs tests/gmiEditSelection.test.mjs tests/gmiEditWorkspace.test.mjs tests/gmiValidatorEditing.test.mjs tests/validationV2WorkspaceInspector.test.mjs
```

Production browser gate used the final fresh build on task-owned port **3163**, `PHOTO_UI_URL=http://127.0.0.1:3163` and `GMI_EDIT_SCREENSHOT_DIR=%TEMP%/gmi-h2-screenshots`:

```text
node --test --test-concurrency=1 tests/gmiValidatorSelectionUi.test.mjs tests/gmiBatchFieldValueInputUi.test.mjs tests/gmiFieldValueInputUi.test.mjs tests/gmiEditWorkspaceUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/gmiEditValidationUi.test.mjs tests/gmiValidatorEditingUi.test.mjs tests/gmiLayerFiltersUi.test.mjs tests/gmiEditSelectionUi.test.mjs tests/gmiBatchInspectorUi.test.mjs tests/gmiR4UxPolishUi.test.mjs tests/gmiEditBatchUi.test.mjs tests/layerDataTableGeometryUi.test.mjs tests/layerDataTableKeyboardUi.test.mjs tests/gmiRettingerSidebarUi.test.mjs tests/gmiS5FocusContinuityUi.test.mjs tests/validationV2RuleCountsBrowser.test.mjs
```

The new H2 suite covers a layer never opened in Rettinger; first-open initialization without selection/staging; line and point halos; FEIL/SJEKK persistence; hidden/visible counts; search, sorting, clear and keyboard ranges; actual pointer interaction at **1280×720** and **1366×768**; field/geometry/layer/dataset/table/Validator invalidation; Original and Foreslått checkbox selection; read-only mixed-line-ending and simulated unreadable sources; and zero staged corrections afterwards. Node tests cover unavailable/unsupported states and source/session lifecycle cases that lack a direct production UI action.

Inspected final `h2-selected-1280x720.png`, `h2-selected-1366x768.png` and `h2-read-only-1366x768.png`. The table is exposed at both laptop sizes, with usable controls and scrolling, visible counts/halos and no page overflow. The read-only table has an explanation and no checkbox column. The final pointer checks prevent the earlier modal-covered table from passing unnoticed.

### Baseline failures, separately established

Before editing, the requested Node baseline (`objectTableInspection`, `gmiEditSelection`, `gmiEditWorkspace`, `appInfoUiContract`, `statsUiContract`, `validationV2WorkspaceInspector`) recorded **68 total: 62 passed, 6 failed, 0 skipped**. The separate unchanged `terrainPhotoGml` check reproduced its additional failure.

Final full serial run:

```text
node --test --test-concurrency=1 "tests/*.test.mjs"
```

**2,101 total: 1,977 passed, 7 failed, 117 skipped.** The same seven baseline failures remain:

- `appInfoUiContract`: working header / conditional branch / resize source assertion (1).
- `statsUiContract`: Norwegian controls and trigger-visibility source assertions (2).
- `validationV2WorkspaceInspector`: sidebar width, workspace-shell placement and map/3D composition source assertions (3). These are the three expanded focused-gate failures.
- `terrainPhotoGml`: the optional external-corpus browser test cannot dynamically import `/tests/browser/photoSpatialChecks.mjs` (1), before corpus acceptance.

Full-file ESLint was run on all **13** changed JS/MJS files. It reports **8 errors and 5 warnings**, all reproduced from starting-HEAD source: `MapInner.js` has 8 existing `react-hooks/refs` errors and 4 warnings; `LayerDataTable.js` has the existing TanStack/React Compiler warning. Baseline source was supplied directly from `git show HEAD:<path>` to ESLint using Node byte streams. No lint suppression or unrelated map refactor was added. The full lint command therefore remains failing on these baseline errors.

No H2 regression remains failing. Development browser failures from selector/import waits, synthetic point applicability and existing dataset geometry resets were corrected in the test setup. The R5 modal-close assertion was deliberately updated for the H2 layout behavior; none of its safety assertions was removed. Initial DOM-only testing missed the modal obstruction; final screenshot review and pointer tests caught and resolved it.

### Environment and skips

- Used `npm.cmd`/`npx.cmd` because PowerShell blocks their `.ps1` shims. A sandboxed build could not fetch the existing Roboto Google Font; the approved outside-sandbox build passed. Chrome debugger tests also used the approved outside-sandbox execution path. No dependency or environment-policy change was made.
- The 117 full-suite skips include unconfigured production browser entries and opt-in checks. Configured production coverage is reported separately; skips are not manual/private-corpus acceptance.
- Logs are in `%TEMP%`: `gmi-h2-node-baseline.txt`, `gmi-h2-terrain-baseline.txt`, `gmi-h2-node-focused.txt`, `gmi-h2-node-full.txt`, `gmi-h2-build.txt`, `gmi-h2-eslint.txt`, `gmi-h2-eslint-without-map.txt`, `gmi-h2-map-eslint-baseline.txt`, `gmi-h2-table-eslint-baseline.txt`, `gmi-h2-browser-targeted.txt`, `gmi-h2-browser-gate.txt`. Screenshots remain under `gmi-h2-screenshots`.

## Remaining acceptance and Git/resources

- Real-delivery/manual acceptance for Original and Foreslått, real source replacement and assistive-technology review remain outstanding. Automated checks use synthetic inputs only; no private/reference corpus contents were copied or modified.
- H3 and later workflow slices remain outside scope. There is no transfer-to-Rettinger action in the inspection selection bar.
- The seven Node baseline failures and existing map lint errors remain outside this implementation.
- Branch and HEAD are unchanged. The three original untracked planning reports are preserved. All task changes, the new browser test and this report remain unstaged; no commit, push, Git-ref change or publication occurred.
- Only the task-owned production server on port 3163 was started/stopped. Existing browser harnesses clean their profiles, and the new browser suite checks its temporary fixture directory before removal.
