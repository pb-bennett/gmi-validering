# GMI Validator 2.0 implementation verification

Verified on 19 November 2026, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `0472c7285fdb90efaefff6297be439f8b3fb5eb5`. The starting tree contained 62 modified tracked files and 16 untracked files from the implementation and planning work.

The scope was final verification of Batches A, B, C, D and F, import atomicity, and demonstrated regressions. [Approved plan](20261119-083618-real-data-acceptance-batches-a-b-planning.md) · [Implementation report and original acceptance checklist](20261119-100500-gmi-validator-2-0-batches-a-b-c-d-f-implementation.md)

## Import transaction

- **Legg til bilder** plans the full final import on draft copies of the layer, asset, occurrence and delivery maps. Layer creation or append, evidence sources, GMI associations, selected filename and GML capture times, automatic metadata, positions, and delivery defaults are prepared before the first accepted write. The reviewed position set is compared by candidate and stable occurrence identity, including temporary GMI occurrences.
- Import and positioning share the guarded map writer and rollback. Commit failure preserves accepted values and the import draft, including files and their preview resources. Excluded resources are released after accepted writes succeed. Failure leaves the wizard open with recovery guidance. Success publishes once and opens FOTO with counts calculated from the actual saved state.
- A review that intentionally approves zero positions can commit successfully. If an approved position cannot be applied, the transaction refuses the save.
- Tests inject a failure at every accepted write in a GML creation and a GMI append, including excluded file removal. They check that no partial snapshot is published, prior layer and delivery state are preserved, files remain available for retry, and successful publication contains the expected data. Cancellation, replaced reviews, loaded-source liveness, and intentional zero-placement paths also pass.

## Independent safety review

| Area | Findings and resolution |
| --- | --- |
| Positioning wizard | A cached review could retain a loaded GMI binding that had become unavailable without a photo-state update. Draft derivation now includes the loaded and retained binding liveness, and a source-only save checks the reviewed draft identity. The refresh notice compares the reviewed evidence with the live draft view. During final save, the callback uses the originating ticket and the close paths are disabled. Automatic direction and other metadata, positions, counts and delivery defaults participate in the accepted writes. |
| Capture-date completion | Source eligibility excludes pending, removed, accepted and conflicting values. Filename dates are offered when usable EXIF or GML dates are absent. Technical completion retains known components, offset and original provenance and carries an explicit marker in the session and an advisory in export. Estimates use unique assets, the lower median, the three-photo and 25% thresholds, and the approved 7- and 31-day bands. Estimated fill now rechecks the reviewed basis and target set, batch signatures include full provenance, and repeated group keys cannot duplicate writes. Undo restores only its own unchanged accepted values. |
| Session loss | Reset and FOTO layer removal cancel without discarding accepted state. The existing Rettinger discard restriction remains guarded by explicit confirmation. The Node contract now checks the conditional discard value used by the shared reset dialog. The production reload tests assert and accept the native warning and then check that session data is gone. A bare CDP reload had previously left Chrome waiting at that prompt. The session-loss test now opens the Reset action from the direct toolbar or its overflow menu after FOTO closes. |
| FOTO visibility | At both laptop sizes hide/show preserved the selected occurrence, inspector, list and display mode. Markers and arrows returned with the floating preview and the map extent stayed fixed. |
| Street View | FOTO placement listened in the same map capture phase and could intercept the Street View toolbar and a picked map click. The toolbar is exempt from placement, the pick is consumed before reaching the map, and Escape gives the active Street View action priority. At both laptop sizes, real pointer tests check isolation from survey and FOTO marker selection, Rettinger state and click-to-place. A subsequent ordinary map click still goes to FOTO. Street View navigation was recorded locally by the harness. |

## Main-map marker regression

An isolated production build of HEAD passed the original stack journey with diagnostics added to the temporary test copy. After stack popup paging and viewport changes, the `solo1` thumbnail center was at `1536,791` at zoom 19 and was hit-testable. The working build reproduced the timeout at zoom 20 with the same center at `1927,799`, seven pixels past the 1920-pixel map edge.

The test assumed the prior popup sequence left the next marker center visible. It now uses the normal map zoom control when the marker center is out of reach, waits for a real hit, and checks the exact thumbnail, popup, placement context and occurrence opened in FOTO. The approved zoom cap remains 20. Both laptop sizes are covered by the fit and popup layout tests.

## Verification

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Focused Node transaction, metadata, session loss and Street View checks | 80 | 0 | 0 |
| Focused Node reset contract and additional import, positioning, date and Street View regression checks | 84 | 0 | 0 |
| Isolated HEAD stack reproduction with marker diagnostics | 15 | 0 | 0 |
| Isolated HEAD Validator-to-Rettinger handoff | 8 | 0 | 0 |
| Focused production completion, reload and Street View | 16 | 0 | 2 |
| Focused session-loss test and forced narrow-toolbar diagnostic | 2 | 0 | 0 |
| Full serial Node regression | 2283 | 0 | 154 |
| Complete production browser regression | 486 | 0 | 11 |

- Full Node command was `node --test --test-concurrency=1 --test-reporter=tap "tests/*.test.mjs"`. The browser command used the same serial runner with `"tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"` and `PHOTO_UI_URL` set to a task-owned localhost `next start`. Private-corpus and next-dev opt-ins remained unset. The final runs recorded 2,437 Node cases in 153 seconds and 497 browser cases in 650 seconds, including nested cases.
- Fresh `npm.cmd run build` exited 0 in an isolated final source copy. SHA-256 checks matched all 376 files from `src`, `public`, and build configurations with the working tree. The repository build output was left in place. Build networking fetched the existing Roboto dependency. Chrome required execution outside the sandbox for its localhost debugger.
- `npx.cmd --no-install eslint` checked 79 affected JavaScript files and the 65 corresponding files present at HEAD. Both returned exit 1 for the same 8 errors and 4 warnings in `src/components/MapInner.js`, with line shifts only. The remaining files had zero diagnostics. ESLint also passed on the final Reset test edit.
- `git diff --check` passed. The untracked files were also checked for introduced whitespace errors.
- Before the toolbar-test correction, the complete browser run recorded 485 passed, 1 failed and 11 skipped. The session-loss test queried the direct Reset button immediately after changing the workspace width. The responsive toolbar can instead offer Reset under «Flere kartverktøy». The test now uses either existing control and keeps every session-loss assertion. A separate 900×720 diagnostic forced the narrow mode and verified the overflow route.
- The Validator-to-Rettinger handoff passed the completed browser runs and focused checks on both HEAD and the final application. It stalled once during a superseded run. That stall was not reproduced during the focused comparison. Superseded test runs were stopped when their replacements were ready.
- The production screenshots and browser assertions covered the 1280×720 and 1366×768 layouts, including FOTO fit and visibility, completion, Street View, positioning receipts and the session-loss confirmations.

## Remaining acceptance

- **Import a technically completed timestamp package into a real Gemini VA database.** Use an unpatched export that contains a date completed to 12:00:00 and a minute completed with 00 seconds. Verify the imported photos, timestamps, and expected clock and offset handling. The prior real Gemini VA import verified omitted timestamps. Automated tests in this run verified the generated XML and package.
- Finish the open real-layer checks in the implementation report, including the one-transaction import and positioning journeys on retained GMI/GML sources, mixed timestamp evidence and undo, and Street View navigation to the expected location in a real browser. The private corpus and next-dev paths remain gated.
- Large-layer draft copy cost remains unmeasured. The deferred Masseendringer footer manual check remains open. [Implementation checklist](20261119-100500-gmi-validator-2-0-batches-a-b-c-d-f-implementation.md)

## Additional file inventory

Application files edited during verification

- `src/app/page.js`
- `src/components/StreetViewControl.js`
- `src/components/photos/PhotoCompletionTimePanel.js`
- `src/components/photos/PhotoEditLayer.js`
- `src/components/photos/PhotoImportWizard.js`
- `src/components/photos/PhotoPositioningWizard.js`
- `src/lib/photos/photoCaptureCompletion.mjs`
- `src/lib/photos/photoEstimatedDates.mjs`
- `src/lib/photos/photoSession.mjs`

Test files edited during verification

- `tests/gmiEditWorkspace.test.mjs`
- `tests/helpers/sessionReset.mjs`
- `tests/photoDirectionUi.test.mjs`
- `tests/photoEstimatedDates.test.mjs`
- `tests/photoImportComplete.test.mjs`
- `tests/photoManualPlacementUi.test.mjs`
- `tests/photoSourceWorkflowDraft.test.mjs`
- `tests/photoSpatialUi.test.mjs`
- `tests/photoWorkspaceEditUi.test.mjs`
- `tests/photoWorkspaceStacksUi.test.mjs`
- `tests/photoWorkspaceUi.test.mjs`
- `tests/sessionLossUi.test.mjs`
- `tests/streetView.test.mjs`
- `tests/streetViewUi.test.mjs`

This report is the only new file. The 71 modified tracked files and 17 untracked files remain in the working tree. HEAD and branch are unchanged. The index is empty. No commit, push or deploy occurred. Only task-owned test processes and servers were stopped. No subagents were used. The scratch evidence is under `%TEMP%/gmi-verification-20261119-130316`, including `complete-node.log`, `complete-browser.log`, and `final-pass-build.log`.
