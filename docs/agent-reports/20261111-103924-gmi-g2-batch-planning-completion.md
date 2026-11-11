# G2 — General batch planning engine: completion

Date: 2026-11-11, Europe/Oslo. Scope: G2 in §8 of [the architecture plan](20261111-092840-gmi-general-batch-editing-architecture.md). Started from committed G1 on `feature/photo-workspace`, HEAD `442a395e29649d169a490b71f590ee55122efef6`.

## Outcome

Implemented `prepareGmiFieldBatch` and `buildGmiFieldBatch` for existing editable point/line columns and operations `fill-missing` / `set`. Preparation is inspection-only; building returns one M2 ChangeSet without staging it. No G3 dry run, G4 controls, replace/clear operation, linked-Tema writes or later-stage work.

Generic planning uses G1 capabilities and strict draft domains, M1 source-cell resolution, effective session lexemes and before/after per-object Validator diagnostics. Rows retain exact physical column identity and source order, original/current lexemes, correction history, governing outcomes, applicability, introduced/resolved findings and deferred flags. Unchanged, operation-mismatched, previously corrected, non-applicable, unresolved and technically refused objects have separate states. No applicability policy is duplicated.

Default inclusion follows §6.1. Explicit `included` sets contain object keys (`point:0` / `line:0`). Manual applicability inclusion requires `approvals.allowApplicabilityOverride === true`; replacing existing corrections requires the existing `replace` decision. Technical refusals cannot be overridden. G4 remains responsible for UI confirmations for populated overwrite, new findings and unvalidated columns.

Both current and original lexemes must be missing for generic fill. `set` uses M2 overwrite mode. Builds retain M2 conflict handling and identity guards, rebuild the history label with the actual applied count, and never insert columns. Frozen previews are registered privately and tied to the exact session value, handle binding and source integrity. Preparation yields initially and every 20 objects. The caller's `isLive` callback must track immutable session/selection replacement during work; optional bound selection input also rejects rebinding/expansion and supports narrowing when building.

Hydraulic columns delegate to unchanged eligibility evaluation and `prepareGmiBatchReview` / `buildGmiBatchSelection`. Their genuine eligibility tokens, manual restrictions and lexical behavior are preserved, including SDR `11`. No hydraulic field is built through the generic explicit-target branch. Caller identity guards are checked before delegation because the existing eligibility API intentionally projects targets down to geometry/index. Lowercase delivered hydraulic source keys remain lowercase in patches.

## Files

- Added `src/lib/gmiFieldBatchPlan.mjs`: preparation, classification, snapshot guards, hydraulic routing and exact-subset construction.
- Updated `src/lib/gmiEditValidation.mjs`: optional governing-rule outcome and deferred rule IDs; existing findings remain unchanged.
- Updated `src/lib/gmi-edit/changeSet.mjs`: optional intent metadata, copied to the specified shape and deeply frozen; `null` on existing paths. Malformed metadata is refused. Existing session builder option forwarding already passes intent through, so `session.mjs` needed no change.
- Updated `src/lib/gmiEditBatchView.mjs`: optional final intent argument forwarded to the existing hydraulic builder; no eligibility/selection policy changes.
- Updated `src/lib/gmiBatchInspectorView.mjs`: point target resolution with source identity checks, plus explicit `lineOnly` compatibility option.
- Updated two calls in `src/components/gmi-edit/GmiBatchInspector.js` to retain the existing hydraulic-only UI guard. This is compatibility wiring, not G4 UI.
- Added `tests/gmiFieldBatchPlan.test.mjs` (15 tests) and `tests/helpers/gmiFieldBatchFixture.mjs` (synthetic data only). Updated the existing target test in `tests/gmiBatchInspector.test.mjs` for geometry-neutral target resolution.

Regression coverage includes points/lines; missing, whitespace, populated, unchanged and out-of-list delivered values; applicability and effective cross-field context; conflicts and replacement; invalid identities/indices, malformed targets, foreign and stale selections/sessions; cancellation; source mutation; irregular source objects; refused/reserved fields; aliases and unknown columns; intent copying/freezing/defaults; all existing date spellings; numeric/year findings and deferred dataset checks. Independent byte verification includes previous corrections as well as new changes and preserves opaque synthetic sections. Hydraulic rows, skipped rows, cells and eligibility summaries are compared directly with the existing path for all three fields and both modes.

## Verification results

Passed:

- `node --test tests/gmiFieldBatchPlan.test.mjs tests/gmiEditChangeSets.test.mjs tests/gmiEditBatch.test.mjs tests/gmiEditValidation.test.mjs tests/gmiBatchInspector.test.mjs`: **58 tests: 57 passed, 0 failed, 1 skipped**. This final focused run includes the last malformed-input and byte-verification assertions.
- Required full serial gate, `node --test --test-concurrency=1 "tests/*.test.mjs"`: **2,054 tests: 1,936 passed, 7 failed, 111 skipped**. This subsumes the standing Node set and required correction/batch/validation regressions. All G2 tests passed. Final small planner input-guard hardening was additionally checked in the focused run above.
- `npx.cmd --no-install eslint` on all nine changed/added JS/MJS files: passed.
- `npm.cmd run build`: passed with permitted network access for the existing Roboto font fetch. Existing Browserslist age warning remains; no dependency changes.
- Fresh production server on free port 3138, `PHOTO_UI_URL=http://localhost:3138`, serial browser gate from the plan: `gmiEditWorkspaceUi`, `gmiEditDraftGuardUi`, `gmiEditValidationUi`, `gmiValidatorEditingUi`, `gmiLayerFiltersUi`, `gmiEditSelectionUi`, `gmiBatchInspectorUi`, `gmiR4UxPolishUi`, `gmiEditBatchUi`, `layerDataTableGeometryUi`, `layerDataTableKeyboardUi`, `gmiRettingerSidebarUi`: **87 passed, 0 failed/skipped**. Existing hydraulic UI, individual editing, history, guards and verified exports pass. Inspected screenshots at **1280×720** and **1366×768**; inspector, table, history and scrolling remain usable.
- `git diff --check`: passed. Git reports its configured LF→CRLF conversion notice for two edited files; byte-exact fixtures and manifests were untouched.

Failed / baseline evidence:

- Full gate failures: one `appInfoUiContract` header/layout assertion, two `statsUiContract` assertions, three `validationV2WorkspaceInspector` assertions, and the `terrainPhotoGml` browser dynamic-module import failure. Materialized tracked HEAD `src`, `tests`, `public` and `package.json` into an isolated temporary directory with a dependency junction, without changing Git refs. Ran those four failing test files there with the same browser access: **23 tests, 16 passed, the identical 7 failed**. These failures are established at the starting HEAD, not inferred from historical counts. The terrain test fails to import its browser module; this is not classified as a private-corpus skip.
- An initial sandboxed full-suite attempt hit Chromium timeouts and was stopped. Permitted browser access was used for the completed full gate, baseline reproduction and production browser gate.
- While extending the byte-verification helper to include earlier corrections, a development run exposed incorrect use of `compileGmiEffectiveEdits` as an array. Corrected the test helper to assert its result and use `.edits`; final focused tests pass.

Skipped / remaining acceptance:

- The focused skip is the opt-in private GMI-edit corpus check. Full-suite skips include unconfigured production-browser and opt-in corpus tests; the separately configured production gate had no skips.
- No private/reference corpus, real-delivery manual acceptance or largest-real-file performance measurement. The user requested synthetic performance measurement; G2 specifies no manual acceptance step. Synthetic automation is not a real-file acceptance claim.

Local temporary logs: `%TEMP%/gmi-g2-focused-final.log`, `gmi-g2-full-verified.log`, `gmi-g2-head-baseline-final.log`, `gmi-g2-browser.log`. Screenshots: `%TEMP%/gmi-g2-screenshots/`.

## Synthetic performance

Fabricated document: 1,200 points plus 1,200 lines. Each scope measured at 100, 1,000 and all 1,200 selected objects, editing Merknad. Timings below are from the final focused run, after source loading/parsing; the same session is reused and caches warm between selection sizes. An immediate yield callback isolates processing cost; default production preparation still yields every 20 objects.

| Scope | Selected | Prepare | Build (two M2 builds) |
| --- | ---: | ---: | ---: |
| Points | 100 | 373.8 ms | 1.5 ms |
| Points | 1,000 | 4,138.8 ms | 16.0 ms |
| Points | 1,200 (all) | 3,277.9 ms | 21.1 ms |
| Lines | 100 | 400.8 ms | 1.5 ms |
| Lines | 1,000 | 4,075.5 ms | 18.4 ms |
| Lines | 1,200 (all) | 3,992.8 ms | 14.9 ms |

Observed cost is dominated by the existing per-object Validator overlays, not ChangeSet construction. No selection cap or speculative optimization was added. G4 callers must maintain liveness checks and present cancellable progress; dataset-level consequences remain explicitly deferred for G3.

## Git and process state

Branch/HEAD unchanged: `feature/photo-workspace`, `442a395e29649d169a490b71f590ee55122efef6`. The three pre-existing untracked planning reports (`20261111-085500-…`, `20261111-092840-…`, `20261111-093345-…`) were preserved without edits. Task changes are the nine implementation/test files listed above and this report. No stage, commit, push, synchronization or Git ref change. The production server started for this task was stopped; port 3138 no longer listens. No unrelated processes were stopped.
