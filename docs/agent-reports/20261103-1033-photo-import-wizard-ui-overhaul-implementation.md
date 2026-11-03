# Photo import wizard UI overhaul implementation

Date: 2026-11-03, Europe/Oslo.

## Task and starting state

Implemented the approved report `20261103-0917-photo-import-wizard-ui-overhaul-planning.md` in one working-tree change. Repository: `C:/GitHub/gmi-validering-test`; branch: `feature/photo-workspace`; starting and final HEAD: `de208f9 Fix Gemini photo export GUID compatibility`. The approved planning report was the only pre-existing untracked file. It was read in full and left unchanged. No sub-agents, commit or push were used.

## Final architecture

`PhotoImportWizard` owns one navigation reducer and consumes the session snapshot; it does not maintain a second list of photos. `page.js` now has one `photoImport` context for new, initiating GMI and fixed FOTO append entry. General/append flow is Bilder -> Plassering -> Kontroll -> completion; choosing no placement completes directly from Plassering. Initiating GMI skips Plassering. Successful completion opens the FOTO workspace and supplies a dismissible result notice. Append notices include the number added. Safe position refusal supplies a distinct photos-added/positions-not-applied notice.

The native dialog lifecycle, opener restoration, Escape, body overflow lock and file-navigation prevention are retained. File and directory inputs share `importFiles` in all contexts. Ordinary file drops remain supported. No recursive filesystem traversal was introduced.

The populated acquisition screen has a sticky toolbar adjacent to the grid. Inspection and batch removal are separate: the inspected card says Vises; removal toggles have aria-pressed and visible check marks. Collision overrides remain on thumbnails. Empty acquisition contains the two acquisition actions, drop hint and local trust copy. The new preview owns a local original URL and large-image viewer, and shows read-only filename/folder/size/resolution and available EXIF facts. It contains no metadata, position or direction editors.

Plassering offers none, loaded/file GMI, GML and EXIF. Missing GPS disables EXIF with a reason. Source reads and errors are inline. Kontroll presents asset counts and outcome text first, exceptions outside disclosures, automatic successes collapsed, and the existing GMI/GML summary under technical details. Object context uses parsed attributes plus the existing hover-label helper and fallback label, without a new dictionary.

## Session and placement safety

Added `setDraftGmiSource`, `clearDraftGmiSource`, `clearDraftPositioningGml`, `previewImport` and `completeImport`. `beginLoadedGmiImport` remains a begin/reset plus attach wrapper. File-origin and loaded-origin GMI converge on the existing reconciliation review/commit methods; source liveness is checked only for bindings that actually exist. Late reads cannot revive cleared or replaced operations.

The preview projects the existing GMI association planner without writing records. Projection uses deterministic temporary occurrence IDs, so reviewing does not consume session IDs. GML candidates are projected using the same reference matcher and candidate validation used for retained evidence. `planPhotoSourcePositions` then feeds the shared pure `importPlacementRequests` policy for both preview and final position commit. It requires one viable option of the requested kind, allows explicit EXIF fallback, excludes questionable zero GPS and skips every row with an accepted current position. Counts group repeated occurrences by asset; an asset is fully placed only when all its occurrences have positions.

`completeImport` checks the reviewed generation, draft membership, append eligibility, target identity, spatial evidence, source operation, GML state and policy before Commit A. Existing loaded-review, fingerprint, target and liveness guards remain in force. Commit B uses the existing source-workflow ticket, review and apply guards. It never requests a move of a placed occurrence. A safely refused/failed Commit B preserves Commit A and returns a valid layer with a placement error. No artificial rollback or transactional atomicity is claimed.

Explicit session-snapshot dependencies on React memoized reviews are necessary: React compiler caching otherwise retained a stale review after target/append changes. Browser regressions exposed this and confirmed the corrected invalidation boundary without weakening guards.

Preserved domain suites cover asset ownership/release, repeated/shared references, POINT/LINE behavior, relative paths, suffix and unique basename fallback, Unicode/case, unsafe references, ambiguity, append overrides, GMI rechecks, metadata evidence and existing accepted positions.

## Obsolete paths removed

Deleted the old import dialog and reconciliation component. Removed their header/notice clusters, count-table CSS, import use of SelectedPhotoInspector, proposedEntry plumbing and dead draft-only spatial guards. Removed automatic `initialPositions` behavior from the workspace positioning wizard and its page invocation. The workspace positioning wizard still exists once, for subsequent source/position work. No old/new import state machines run in parallel.

Final source grep returned no occurrences of `loadedGmi=`, `initialPositions`, `PhotoGmiReconciliation`, `Kontroller referanser`, `Bekreft bilder og koblinger`, `UploadSimpleIcon`, `proposedEntry`, `photo-collection-notice` or `photo-reconciliation-counts`.

## Norwegian copy

Applied the approved open/validate heading, empty GMI-layer message, open-file action, reset/open-file toolbar and opened-GMI-files help wording. Updated toolbar tests for the approved labels. Statistics wording, statistics assertions and release notes were not changed. `DataDisplay.js` has no callers/imports in src and its dead copy was deliberately left alone. Acquisition uses the existing Phosphor Images and FolderOpen icons. The trust hint explains the browser's directory prompt; the native Chrome wording cannot be changed.

## Tests and migrations

Added pure state/policy/object-context tests and session completion/parity tests. Coverage includes none/EXIF/GML/GMI, file and loaded sources, attach/switch without clearing files, stale/cancel/reset, repeated references, ambiguous/LINE/missing-CRS cases, include/exclude, EXIF fallback, zero GPS, append, loaded append rechecks, liveness and safe Commit B refusal.

Added `tests/helpers/photoImportWizard.mjs` with shared acquisition, thumbnail readiness, source choice and creation helpers. Migrated all eleven identified browser files and the old thumbnail-status waits. Workspace regressions that need retained but unaccepted GML now create without positioning and add that evidence through the existing workspace source checkpoint; the new wizard test independently exercises actual import-time GML positioning. Layout checks accept the intentionally single-pane empty acquisition screen while preserving populated-pane geometry assertions. Domain suites were not weakened.

The focused wizard browser test uses synthetic images and sources and covers file/folder acquisition, relative paths, removal, read-only preview, toolbar proximity, all entry contexts, none/EXIF/GML/file GMI/loaded GMI, shared references, unresolved/ambiguous/LINE results, append collision override, Escape/cancel/reopen, loaded GMI attachment after acquisition, initiating-source disappearance and target deletion.

## Exact validation results

- New focused tests: `node --test tests/photoImportComplete.test.mjs tests/photoImportOutcome.test.mjs tests/photoImportWizardState.test.mjs`: **23 passed, 0 failed, 0 skipped**.
- All photo/GMI domain tests selected with `Get-ChildItem tests -Filter '*.test.mjs'` filtered to names starting `photo` or `gmiPhoto` and excluding `Ui|Layout`, then `node --test --test-concurrency=1 @tests`: **394 tests, 391 passed, 0 failed, 3 optional/private corpus skips**. This includes the relevant unchanged loaded-GMI, matching, placement, append, source workflow, session, export and ownership suites.
- Complete migrated photo browser selection, with `PHOTO_UI_URL=http://127.0.0.1:3011` against the production build: **29 tests, 23 passed, 0 failed, 6 optional/private-fixture skips**. Selection: photoImportWizardUi, photoLoadedGmiUi, photoDialogLayout, photoDirectionUi, photoPositioningUi, gmiPhotoAssociationsUi, gmiPhotoPlacementsUi, photoAppendDuplicatesUi, photoManualPlacementUi, photoMarkerProvenanceUi, photoSpatialUi and photoWorkspaceUi. The same final selection passed against development as well.
- WFS/browser regression selection: `node --test --test-concurrency=1 tests/geminiReferenceBrowser.test.mjs tests/geminiWorkflowBrowser.test.mjs tests/geminiPopupBrowser.test.mjs`: **51 passed, 0 failed, 0 skipped**. Loaded-GMI browser tests additionally assert no import-triggered WFS requests.
- `tests/mapPaneToolbar.test.mjs`: **10 passed** with the approved copy assertions.
- `npm.cmd run build`: **passed**, optimized compilation, TypeScript, page generation and route output. The final rebuild first encountered a transient Google Fonts/Roboto network failure inside the sandbox; rerunning outside the sandbox passed. Existing Browserslist freshness warning remains. npm.cmd is required because PowerShell blocks npm.ps1 on this machine.
- Focused ESLint on every changed/added src JS/MJS file: **0 new findings against HEAD**. One pre-existing `react-hooks/set-state-in-effect` error remains at MapPaneToolbar.js:63. Piping `git show HEAD:src/components/MapPaneToolbar.js` through ESLint with the same stdin filename reproduces the identical error. The changed photo/session/page files have no lint findings.
- Additional unchanged `statsUiContract.test.mjs`: **2 failed**, both baseline source-pattern assertions about the statistics trigger's old visibility predicate. A temporary copy using `git show HEAD:<path>` for every read reproduces **the same 2 failures against HEAD**. No statistics assertions or product behavior were changed to hide these failures.
- `git diff --check`: **passed**.
- Required obsolete source paths/labels and targeted old GMI upload labels: **no matches in applicable live source files**. Historical documentation and unused DataDisplay copy were not removed to force an empty grep.

Browser runs initially stalled at Chrome DevTools Runtime.enable inside the sandbox. The authorized browser commands were rerun outside it and completed. Initial migration failures were corrected; final results above are the final successful runs. Logs are temporary files under the OS temp directory, not repository artifacts.

## Rendered acceptance

Captured and visually inspected all six requested states at **1920x1080** and **1280x720**, using synthetic/non-customer images. Temporary directory: `C:/Users/Gemini-Backup/AppData/Local/Temp/photo-import-wizard-acceptance`.

| State | 1920x1080 | 1280x720 |
|---|---|---|
| Empty acquisition | Pass: two focused actions and trust hint | Pass: primary action/footer visible |
| Populated review, 24 photos and two selected | Pass: grid toolbar, clear checks, large preview | Pass: three columns and at least two visible rows |
| Successful GMI Kontroll | Pass: compact figures, collapsed successes/details | Pass: outcome and final action above the fold |
| GMI exceptions | Pass: prominent LINE/ambiguity cards and missing-reference disclosure | Pass: outcome stays above the scrolling list, footer visible |
| General Plassering | Pass: four simple cards | Pass: disabled missing-GPS reason and final action visible |
| Final Kontroll/footer | Pass: three counts and clear completion action | Pass: footer accessible without scrolling |

There is no horizontal overflow. Grid toolbar belongs visually and structurally to the gallery. Large preview has no metadata editing controls. Technical reconciliation does not dominate. The initial screen is substantially simpler than the original documented screen. Screenshot files remain outside the repository.

## Deviations and limitations

- Optional recursive folder drag-and-drop was explicitly omitted as instructed.
- The outcome module consumes a projected position plan rather than independently rebuilding GMI point/occurrence placement rules. The session reuses its actual association planner for that projection, reducing duplicated domain logic and ensuring parity for repeated references and append rechecks.
- Some existing workspace regressions now attach their candidate-only GML fixture after unplaced creation, because choosing GML during import intentionally applies accepted positions at completion. Focused wizard coverage tests that new behavior directly.
- Private-corpus browser tests were migrated but could not execute without PHOTO_GML_FIXTURE/private corpus configuration. Their skips are reported above; synthetic coverage and all available domain/browser regressions were executed.
- The existing toolbar lint error and two existing statistics source-pattern failures remain outside this task.

## Explicit deferrals and recommended manual checks

No FOTO workspace redesign, inspector overhaul, map Edit mode, move/rotation handles, undo/redo or session save/discard, map thumbnails, metadata/date-time editor redesign, export/readiness redesign, WFS redesign, persistence, 3D or topology changes were made. The workspace only receives the import result notice and loses its obsolete draft-only branches.

Recommended manual checks: run the migrated private 148-photo suites with the usual fixture configuration; use actual browser OS file/directory pickers and inspect Chrome's native folder prompt; perform a keyboard/screen-reader pass in the supported deployment browser; inspect a representative deployment dataset containing mixed point/line links and ambiguous filenames. These complement the synthetic rendered and automated checks and are not claimed as already executed.

## Files

### Added

- `src/components/photos/PhotoImportPlacementStep.js`
- `src/components/photos/PhotoImportPreview.js`
- `src/components/photos/PhotoImportReviewStep.js`
- `src/components/photos/PhotoImportWizard.js`
- `src/lib/photos/photoImportOutcome.mjs`
- `src/lib/photos/photoImportPresentation.mjs`
- `src/lib/photos/photoImportWizardState.mjs`
- `tests/helpers/photoImportWizard.mjs`
- `tests/photoImportComplete.test.mjs`
- `tests/photoImportOutcome.test.mjs`
- `tests/photoImportWizardState.test.mjs`
- `tests/photoImportWizardUi.test.mjs`
- `docs/agent-reports/20261103-1033-photo-import-wizard-ui-overhaul-implementation.md`

### Changed

- `src/app/globals.css`
- `src/app/page.js`
- `src/components/AppInfoModal.js`
- `src/components/LayerManager.js`
- `src/components/MapPaneToolbar.js`
- `src/components/photos/PhotoCollectionPanel.js`
- `src/components/photos/PhotoPositioningWizard.js`
- `src/components/photos/PhotoSpatialInspector.js`
- `src/components/photos/PhotoWorkspaceCollection.js`
- `src/components/photos/photoCollectionPanel.css`
- `src/lib/photos/photoSession.mjs`
- `tests/gmiPhotoAssociationsUi.test.mjs`
- `tests/gmiPhotoPlacementsUi.test.mjs`
- `tests/helpers/photoDialogLayout.mjs`
- `tests/mapPaneToolbar.test.mjs`
- `tests/photoAppendDuplicatesUi.test.mjs`
- `tests/photoDialogLayout.test.mjs`
- `tests/photoDirectionUi.test.mjs`
- `tests/photoLoadedGmiUi.test.mjs`
- `tests/photoManualPlacementUi.test.mjs`
- `tests/photoMarkerProvenanceUi.test.mjs`
- `tests/photoPositioningUi.test.mjs`
- `tests/photoSpatialUi.test.mjs`
- `tests/photoWorkspaceUi.test.mjs`

### Deleted

- `src/components/photos/PhotoCollectionDialog.js`
- `src/components/photos/PhotoGmiReconciliation.js`

