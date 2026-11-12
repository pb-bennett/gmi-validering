# H3 — Validator selection handoff to Rettinger: completion

Date: 2026-11-12, Europe/Oslo. Branch `feature/photo-workspace`; starting/final HEAD `eb866e48813a8fbdb8607dc97a06bdb1b299caaa`.

## Scope and outcome

Implemented H3 from [the unified workflow plan](20261111-085500-gmi-validator-rettinger-unified-workflow-planning.md), sections 3.4–3.5, 4.1–4.3 and H3 in section 9. Inspected the current H1/H2 selection ownership, T1 reveal, R5 guarded handoff and G5 individual/batch control implementations and relevant completion reports before editing.

The Validator inspection selection bar now offers **Åpne i Rettinger (N)**. A single checked source object enters its individual editor, with its geometry, checkbox, active highlight and one-shot T1 row reveal. Several objects enter the batch inspector at Oppsett, with exactly the checked source indices, Bare valgte enabled, no chosen field, empty value and no preview. Both paths retain the inspected Original/Foreslått dataset and create no correction or ChangeSet. Provenance is informational and the selection can subsequently widen. Existing R5 **Lag retting…**, including its separate restriction, remains available.

No H4/H5, ChangeSet engine, validation rules, source-byte/patch/export implementation, field/cell eligibility, G5 value controls, dependencies or fixtures/manifests were changed.

## Implementation decisions

- `validatorSelectionHandoff` checks the selection binding, live handle/session ID, exact immutable session/document, fingerprint, document editability and private source-byte integrity. Every canonical point/line source-index key must exist in both the source document and imported layer with equal ID and GUID. Empty, duplicate, mixed-geometry, malformed and out-of-range keys fail closed. Field/rule provenance never grants editing permission.
- The existing R5 `openGmiEditWorkspace` path retains validate → draft guard → revalidate → atomic update. H3 additionally binds the request to the current checked selection and inspection snapshots, their geometry, host and dataset basis. Changed selection/inspection, replaced source or changed session during a pending guard refuses the transition. The stale explanation is visible in the Validator table; navigation is not committed.
- One update transfers selection ownership to Rettinger, informational provenance, object/batch entry mode, matching table geometry/dataset, automatic view intent, and (for one object) active highlight plus a field-free T1 reveal. It also clears any old table review/column focus. The table uses its existing selection and map-halo mechanisms.
- Single-object entry keeps ordinary filtered display. T1 continues to explain hidden targets and offer explicit filter reset; H3 does not silently change filters/search. Several-object entry starts with Bare valgte and can later use the existing widening controls.
- Validator can inspect Foreslått before any correction exists. A narrowly opt-in presentation allowance preserves that identical proposed dataset for H3. Ordinary U4 behavior remains unchanged; Kun endrede still requires corrections. Existing explicit/automatic view-intent behavior is retained.
- Workspace unmount cleanup is deferred by one microtask with an effect-generation check. React development Strict Mode's effect replay no longer clears the incoming selection; real unmount cleanup remains in place.
- Browser stale-source coverage injects an incorrect GUID into the existing subscribed synthetic imported-layer snapshot through React's fiber. It restores that value afterwards. No production test hook or source-file write was introduced.

## Changed files

| File | Change |
| --- | --- |
| `src/lib/gmiValidatorEditing.mjs` | General point/line navigation handoff validation. |
| `src/lib/store.js` | Capture inspection selection, reuse two-phase R5 transition, atomic H3 navigation/reveal and stale errors. |
| `src/lib/gmiEditView.mjs` | Opt-in retention of identical proposed dataset identity. |
| `src/components/LayerDataTable.js` | Handoff button, informational provenance, stale explanation and H3 proposed-view presentation. |
| `src/components/gmi-edit/GmiEditWorkspace.js` | Object/batch handoff entry and Strict Mode-safe cleanup. |
| `tests/gmiValidatorSelectionHandoff.test.mjs` | Both-geometry refusal matrix, exact order/identity, modes, source bytes and no-staging assertions. |
| `tests/gmiEditWorkspace.test.mjs` | H3 atomicity, dataset/view intent, widening, no staging and post-guard refusal/acceptance. |
| `tests/gmiValidatorSelectionHandoffUi.test.mjs` | Synthetic production/development handoff, late row reveal, highlights, provenance, datasets, existing correction and stale refusal. |
| `tests/gmiValidatorSelectionUi.test.mjs` | H2 bar assertion now permits and checks the H3 action; other H2 acceptance remains. |
| This report | Decisions, verification and remaining acceptance. |

## Passed checks

| Check | Result |
| --- | --- |
| Focused helper/store Node suites, final | **31 passed, 0 failed, 0 skipped.** |
| Expanded relevant Node gate (before final extra presentation assertion) | **104 passed, 0 failed, 0 skipped.** |
| Final full serial Node suite | **2,116 total: 1,990 passed, 7 baseline failures, 119 skipped.** |
| Fresh final production build | **Passed**, compilation and static generation. |
| Final serial production browser gate | **135 passed, 0 failed, 0 skipped.** |
| H3 browser suite under `next dev` / Strict Mode | **11 passed, 0 failed, 0 skipped.** |
| ESLint on all nine changed JS/MJS files | **0 errors, 1 existing TanStack warning**, independently reproduced from starting-HEAD table source. |
| `git diff --check` | **Passed.** |

Commands:

```text
node --test --test-reporter=tap tests/gmiValidatorSelectionHandoff.test.mjs tests/gmiEditWorkspace.test.mjs
node --test --test-reporter=tap tests/gmiValidatorSelectionHandoff.test.mjs tests/gmiEditWorkspace.test.mjs tests/gmiValidatorEditing.test.mjs tests/gmiEditSelection.test.mjs tests/gmiBatchInspector.test.mjs tests/gmiFieldBatchPlan.test.mjs tests/objectTableInspection.test.mjs tests/layerTableReveal.test.mjs
node --test --test-reporter=tap --test-concurrency=1 "tests/*.test.mjs"
npm.cmd run build
npx.cmd --no-install eslint src/lib/gmiValidatorEditing.mjs src/lib/store.js src/lib/gmiEditView.mjs src/components/LayerDataTable.js src/components/gmi-edit/GmiEditWorkspace.js tests/gmiValidatorSelectionHandoff.test.mjs tests/gmiEditWorkspace.test.mjs tests/gmiValidatorSelectionUi.test.mjs tests/gmiValidatorSelectionHandoffUi.test.mjs
git diff --check
```

The final production gate used task-owned `http://127.0.0.1:3183`, `PHOTO_UI_URL` and `GMI_EDIT_SCREENSHOT_DIR=%TEMP%/gmi-h3-final-screenshots`, with a fresh final build:

```text
node --test --test-reporter=tap --test-concurrency=1 tests/gmiValidatorSelectionHandoffUi.test.mjs tests/gmiValidatorSelectionUi.test.mjs tests/layerTableRevealUi.test.mjs tests/gmiBatchFieldValueInputUi.test.mjs tests/gmiFieldValueInputUi.test.mjs tests/gmiEditWorkspaceUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/gmiEditValidationUi.test.mjs tests/gmiValidatorEditingUi.test.mjs tests/gmiLayerFiltersUi.test.mjs tests/gmiEditSelectionUi.test.mjs tests/gmiBatchInspectorUi.test.mjs tests/gmiR4UxPolishUi.test.mjs tests/gmiEditBatchUi.test.mjs tests/layerDataTableGeometryUi.test.mjs tests/layerDataTableKeyboardUi.test.mjs tests/gmiRettingerSidebarUi.test.mjs tests/gmiS5FocusContinuityUi.test.mjs tests/validationV2RuleCountsBrowser.test.mjs
```

The development check ran `node node_modules/next/dist/bin/next dev -p 3184`, then the H3 browser suite alone with `PHOTO_UI_URL=http://127.0.0.1:3184`. It covers the same one-point/multiple-line transitions and row/selection/map assertions under development effect replay.

H3 browser coverage includes source point index **149** revealed inside a 160-point ordinary virtual table, line indices **1 and 3** transferred into an empty batch setup, later widening to **0, 1 and 3**, provenance, no draft/review/staging, Original/Foreslått entry both without and with an existing correction, and a stale imported GUID refused while Validator stays open. Synthetic input-file bytes are unchanged. Node refusal coverage also includes document/session/handle/layer/fingerprint/source-byte mismatches, wrong ID/GUID, duplicates, empty selection, invalid indices and mixed geometries. Store tests use GUID-bearing synthetic source fixtures and verify atomic publication and no engine/session mutation.

Visually inspected final production screenshots at **1280×720** and **1366×768**, including entry button, point editor/outlined late row, empty batch/provenance and stale explanation. Controls remain reachable, the table and inspector scroll, and no page overflow was observed. Screenshots and automation use synthetic data; they are not real-delivery acceptance.

## Failures and baseline evidence

- Before editing, the focused baseline including `validationV2WorkspaceInspector` recorded **102 total: 99 passed, 3 failed, 0 skipped**. Those three failures are its existing sidebar-width, workspace-shell placement and map/3D composition source assertions.
- The additional unchanged `appInfoUiContract`, `statsUiContract` and `terrainPhotoGml` suites were rerun separately with Chrome access: **16 total: 12 passed, 4 failed, 0 skipped**. They reproduce one app-header source assertion, two Stats source assertions and the failed dynamic import of `tests/browser/photoSpatialChecks.mjs`. Their tests and referenced page/harness source are unchanged from starting HEAD, verified with Git diff. Together these account for all seven failures in the final full suite; no H3 regression failure remains.
- An earlier restricted invocation of the additional baseline checks timed out enabling Chrome Runtime. The approved run above supersedes that environment failure and establishes the actual existing dynamic-import failure.
- The first sandboxed build could not fetch the existing Roboto Google Font. The approved final production build passed. Development logs also show existing Browserslist age and Next.js development-origin notices; no dependency/configuration changes were made for them.
- Intermediate H3 browser-test drafts had selector quoting, diagnostic-population and inspection-render timing mistakes. Corrected the tests to use existing SDR diagnostics and await the contextual table. Final production and development gates pass. An obsolete browser run was stopped; final process inspection found no remaining harness Chrome process.

## Skipped and outstanding acceptance

- The full serial suite's **119 skips** include unconfigured production-UI entry tests and optional/private-corpus acceptance. The configured production gate above ran separately with no skips.
- Manual acceptance on the real delivery remains outstanding: one point missing InnvendigUtvendig and twelve lines missing SDR. No contractor/private corpus was opened or modified, and no real-file/manual acceptance is claimed.
- The seven baseline full-suite failures remain unresolved. H4/H5 and other later slices remain out of scope.

Logs are under `%TEMP%/gmi-h3-*.log`; production/development screenshots are under `%TEMP%/gmi-h3-final-screenshots/` and `%TEMP%/gmi-h3-dev-screenshots/`.

## Git and resources

No staging, commit, push, merge, branch/ref change, synchronization or deployment. The three original untracked planning files remain untouched. Only the nine task code/test files and this completion report were added/modified. Task-owned production/development servers on ports 3183/3184 were stopped after checks; synthetic browser fixtures/profiles were cleaned by their harnesses. Logs/screenshots remain in the system temporary directory.
