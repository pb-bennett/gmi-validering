# G3 — Dataset dry run and preview validation: completion

Date: 2026-11-11, Europe/Oslo. Scope: G3 in §8 of [the architecture plan](20261111-092840-gmi-general-batch-editing-architecture.md). Starting and final branch/HEAD: `feature/photo-workspace`, `7b85194a70af4d8d032d77e9dcd434ec123c3128` (committed G1/G2).

## Outcome and files

- Added `src/lib/gmi-edit/dryRun.mjs`, exported through `src/lib/gmi-edit/index.mjs`: asynchronous `dryRunGmiChangeSet` creates a hypothetical immutable staged session, obtains its independently verified proposed copy through the existing compilation/splice/verification path, and runs the full Validator before and after. The baseline is the **current proposed dataset**, including previous corrections. No registry/store import, live stage, publication, export serialization or original-byte mutation occurs.
- Added `src/lib/validation-v2/findingDiff.js`: extracted the existing stable object-identity comparison from `gmiValidatorEditing.mjs`; the latter retains its existing exported comparison and semantics. G3 adapts severity changes into both a resolved old finding and an introduced new finding, matching rule/object/state/reason transitions despite changed dataset revisions. Includes schema findings, severity counts and grouping by source geometry/index.
- Updated `src/lib/gmi-edit/proposed.mjs`: exported its existing Kontrolldato normalizer for reuse, without changing accepted inputs or normalization behavior. Reuses the existing proposed-state and full-validation caches; no separate dry-run dataset cache.
- Updated `src/lib/gmiFieldBatchPlan.mjs`: raw G2 construction remains synchronous and returns frozen, unvalidated candidates (`approvalReady: false`). `dryRunGmiFieldBatch` validates the **same ChangeSet object**, attaches dataset findings to rows, and reports consequences outside edited objects. `isCurrentGmiFieldBatchValidation` / `getGmiFieldBatchApproval` require genuine current evidence before returning the candidate for approval. Rebuilding a candidate or starting a newer check invalidates obsolete validation. Session/source identity, narrowed selection, date changes and cancellation remain guarded.
- Added `tests/gmiEditDryRun.test.mjs`: 13 tests, including one opt-in private-corpus benchmark. Covers live registry session identity/revision/notifications and a nonempty redo stack remaining unchanged, byte preservation, real-stage cache hits, cross-object NYTT-year introduction/resolution, finding identities/severity/reasons, all existing delivered date spellings, invalid/stale/foreign candidates, actual source corruption, proposed-path failures, corrupt cached output, cancellation at all four phase boundaries, concurrent checks, selection narrowing, rebuilt candidates and all three hydraulic fields.
- Updated `tests/gmiEditProduction.test.mjs`: explicitly includes the planned G3 module in the core-module contract and allows only its specific pure finding-diff dependency. Existing browser-safe dependency restrictions remain; the dry-run test additionally forbids registry/store/export and serialization dependencies.

No G4 UI or later-stage work, dependency changes, Validator policy changes, fixture/hash/manifest changes, or alterations to existing individual/hydraulic staging and export flows. SDR numeric spellings and genuine M2 eligibility tokens remain unchanged. Delivered `DD.MM.YYYY`, `YYYY-MM-DD` and `YYYYMMDD` values are retained exactly.

## Integration and limits

To preserve G2's synchronous API and make cancellation meaningful, validation is an explicit asynchronous step after building the candidate. Future G4 callers must run `dryRunGmiFieldBatch` after each decision/rebuild, and query `getGmiFieldBatchApproval` with the **live session and Kontrolldato immediately before staging**. The immutable `approvalReady` field is a snapshot, not a substitute for that query. Failed/cancelled validation does not return an approvable ChangeSet.

`isLive` tracks caller-owned live session/selection generations. Optional `getReferenceDate` detects Kontrolldato changes during work and after completion, including attempts to reuse an old captured date. Cancellation yields between verification and the full before/after Validator phases; it cannot interrupt an individual synchronous M1 or Validator call. User-facing risk confirmation and progress controls remain G4 work. The existing low-level staging API is intentionally unchanged.

## Verification

Passed:

- Focused shared-engine gate: `node --test tests/gmiEditDryRun.test.mjs tests/gmiFieldBatchPlan.test.mjs tests/gmiEditChangeSets.test.mjs tests/gmiEditBatch.test.mjs tests/gmiEditValidation.test.mjs tests/gmiValidatorEditing.test.mjs`: **80 tests, 78 passed, 0 failed, 2 skipped**.
- Final strengthened safety/immutability gate: `node --test tests/gmiEditDryRun.test.mjs tests/gmiEditProduction.test.mjs`: **25 tests, 24 passed, 0 failed, 1 skipped**.
- Full serial gate, `node --test --test-concurrency=1 "tests/*.test.mjs"`: **2,067 tests, 1,948 passed, 7 failed, 112 skipped**. Subsumes the standing Node gate and required correction/batch/validation suites. All G3 and source-safety tests passed.
- `npx.cmd --no-install eslint` on the eight changed/added JS/MJS files: passed.
- `npm.cmd run build`: passed with permitted network access for the configured Roboto font. Existing Browserslist age warning remains.
- Fresh production server on free port 3139 with `PHOTO_UI_URL=http://localhost:3139`; the plan's serial browser gate (`gmiEditWorkspaceUi`, `gmiEditDraftGuardUi`, `gmiEditValidationUi`, `gmiValidatorEditingUi`, `gmiLayerFiltersUi`, `gmiEditSelectionUi`, `gmiBatchInspectorUi`, `gmiR4UxPolishUi`, `gmiEditBatchUi`, `layerDataTableGeometryUi`, `layerDataTableKeyboardUi`, `gmiRettingerSidebarUi`): **87 passed, 0 failed/skipped**. Inspected screenshots at **1280×720** and **1366×768**; existing inspector/table/history/footer layout and scrolling remain usable.
- `git diff --check`: passed. Git emits its configured LF→CRLF notice for the edited planner; no byte-exact fixture was changed.

Failed checks / established baseline:

- The full suite's remaining failures are one `appInfoUiContract` assertion, two `statsUiContract` assertions, three `validationV2WorkspaceInspector` assertions and the `terrainPhotoGml` browser dynamic-module import failure. Independently archived starting HEAD's tracked `src`, `tests`, `public` and `package.json` into a temporary directory, supplied the existing dependencies through a junction and ran those four test files with Chromium: **23 tests, 16 passed, the identical 7 failed**. No Git refs or working files changed for the baseline. The terrain failure is an actual failed browser import, not counted as a private-corpus skip.
- The first full run additionally found the core-module allowlist missing the newly planned module. Updated the explicit contract as described above; the final full run passes it without weakening the existing dependency checks.
- An initial new registry test omitted its handle in the test view; corrected the harness wiring. The final test proves unchanged live state, including retained redo history.

Skipped / not established:

- Focused skips are opt-in corpus checks. Full-suite skips include unconfigured browser/corpus tests; the separately configured production browser gate had no skips.
- `GMI_EDIT_CORPUS` was not configured. The largest-private-file benchmark is included but **skipped**; no private/reference corpus was searched or opened. Its opt-in path reads the largest configured file, runs an in-memory dry run and reports aggregate timing/size only. No real-file performance or manual acceptance claim is made. G3 specifies no manual acceptance step.

Local logs: `%TEMP%/gmi-g3-focused.log`, `gmi-g3-safety.log`, `gmi-g3-full-final.log`, `gmi-g3-head-baseline.log`, `gmi-g3-browser.log`. Screenshots: `%TEMP%/gmi-g3-screenshots/`.

## Performance observations

Final full-suite measurements on a **173,365-byte synthetic document with 1,200 points and 1,200 lines**. Candidates edit Merknad on the indicated number of lines. Source loading/parsing and G2 local preview preparation are outside these timings. The same session/cache is reused between sizes; later runs benefit from cached baseline validation. Immediate yield callbacks isolate computation from event-loop scheduling.

| Selected lines | Full dry run | Subsequent real-stage proposed-cache read |
| ---: | ---: | ---: |
| 100 | 2,536.2 ms | 0.5 ms |
| 1,000 | 1,564.5 ms | 1.7 ms |
| 1,200 (all) | 1,533.2 ms | 2.4 ms |

The synthetic benchmark's execution budget is 180 seconds; observed dry runs stayed below 3 seconds on this machine. This is evidence for this synthetic workload, not a largest-real-delivery latency guarantee. Real-stage reads assert zero additional proposed computations and return the identical verified proposed object. Cache integrity corruption evicts derived output and triggers fresh verification; original source corruption blocks success.

## Git and process state

Preserved the three existing untracked planning reports (`20261111-085500-…`, `20261111-092840-…`, `20261111-093345-…`) without edits. Task changes are the eight implementation/test files above and this report. No stage, commit, push, synchronization or Git ref change. The production server started for verification was stopped; port 3139 no longer listens. No unrelated processes were stopped.
