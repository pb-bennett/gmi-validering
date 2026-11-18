# FOTO acceptance corrections batch A — S4, S8 and S5

18 November 2026, Europe/Oslo. Implemented S4 → S8 → S5 on `feature/photo-workspace` at `9c772d1`. The checkout was clean at the start and two commits ahead of its tracking ref. Scope follows [the acceptance plan](20261118-085516-real-data-acceptance-corrections-planning.md) and the Batch A clarifications.

## Baseline at clean HEAD

| Gate | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Combined Node regression, 994 tests | 986 | 1 | 7 |
| Chrome production regression, 65 cases and subtests | 59 | 3 | 3 |

- The Node failure was the `Lukk Validator` source assertion in `validationV2GmiA7.test.mjs`.
- The browser baseline reproduced the map-preview suite's final laptop marker hit-test timeout and the stack count selector matching delivery totals together with the placement label. Node counts the stack suite's parent as a failure as well.
- The baseline production build passed. The browser suites ran serially against `next start` on `127.0.0.1:61917`.

## S4 — EXIF delivery defaults (B1)

The session computes delivery defaults after all requested positions pass review. Accepted EXIF and GML use the same existing eligibility predicate and commit the GML inclusion alongside the accepted position. Both import and subsequent source positioning use that policy. The direct `applyPhotoPositioning` entry point also uses it. GMI links, explicit decisions, photos without accepted positions and ineligible occurrences retain their delivery state.

- Application files — `src/lib/photos/photoSession.mjs` and `src/lib/photos/photoDeliveryChoice.mjs`.
- Regression files — `tests/photoDeliveryDefaults.test.mjs` and `tests/photoImportWizardUi.test.mjs`.
- Focused Node — 89 passed, zero failed or skipped across delivery defaults, import wizard state, delivery intent, import completion, positioning and the source workflow. Cases exercise placed and unplaced photos, point and line GMI links, eligibility and explicit `Ikke` for both later-positioning entry points.
- Production Chrome — the EXIF import renders a GML pill. The existing GML round trip, GMI retention, transfer and filtering cases passed.
- Deferred manual acceptance — re-import real EXIF photos and confirm the delivery counts and eligibility feedback, including an explicit `Ikke` choice retained during later positioning.

## S8 — Shared FOTO sidebar width (C1)

FOTO passes the page's shared `sidebarWidth` through `WorkspaceShell`. The FOTO desktop and small-laptop width overrides were removed. The right inspector clamp, the 340 px constrained-width inspector and the existing stacked layout at 700 px and below were preserved. The shared width reduced the command-bar space at 1280×720. An existing compact container rule now uses 6 px vertical spacing so a staged stack edit still meets the 220 px height contract. Layers showing both repeated placements and unplaced photos give the delivery totals their own row so adding the `Ikke` count during cycling leaves the list in place.

- Application files — `src/app/page.js`, `src/components/photos/PhotoWorkspaceCollection.js`, `src/components/photos/photoWorkspace.css` and `src/components/photos/photoEdit.css`.
- Regression files — `tests/photoWorkspaceEditUi.test.mjs`, `tests/photoWorkspaceStacksUi.test.mjs`, `tests/photoWorkspaceUi.test.mjs`, `tests/validationV2WorkspaceInspector.test.mjs` and `tests/validatorDataTableSlice3Ui.test.mjs`.
- Focused Node — 30 passed, zero failed or skipped across shared sidebar and workspace contracts.
- Production Chrome — Lagbehandling, Validator, Rettinger and FOTO each measured a 380 px left pane and the same map edge at both laptop sizes. With the FOTO inspector open the map measured 516 px at 1280×720 and about 576 px at 1366×768. The list, display card and edit controls fit. Cycling through the mixed delivery choices kept the list position at both sizes. The staged stack workflow kept its controls and selected photo reachable at 1024×620 as well as both laptop sizes. A 390×700 check confirmed the stacked layout.
- Layout limit — fixed side panes can consume the available map width just above the retained 700 px stack breakpoint, particularly with a user-resized sidebar. The accepted laptop checks used the shared default width.
- Deferred manual acceptance — check list scrolling, inspector and map controls with real names, images and dense stacks at the two laptop sizes.

## S5 — Automatic FOTO map fitting (B2)

The page owns a one-time `{ layerId, token }` request. A newly created layer with positioned photos requests a fit when it opens. Appending to an existing layer preserves the view. Successful positioning from the source wizard reports whether the active layer had any accepted position immediately before apply. Only the first successful apply for a previously unplaced active layer requests a fit. Connection-only completion follows the existing close action.

The controller invalidates Leaflet size and fits on the next animation frame using valid accepted positions on the requested layer. Survey layers and other FOTO layers are excluded from those bounds. Extents under 10 m use zoom 18, including a single position. Other extents use a maximum zoom of 19. The existing selection-pan measurements are shared with the fit to reserve space for the right display card and the top edit bar. On a short or narrow map, a single-point pan can use a smaller clear span than an extent fit. The mount-time fit was removed. Normal selection retains its pan-only behavior.

- Application files — `src/app/page.js`, `src/components/MapInner.js`, `src/components/photos/PhotoMapController.js`, `src/components/photos/PhotoPositioningWizard.js` and `src/lib/photos/photoMapFeatures.mjs`.
- Regression files — `tests/photoMapFeatures.test.mjs`, `tests/photoMapFitUi.test.mjs`, `tests/photoPositioningUi.test.mjs`, `tests/photoMapInteractionSlice2Ui.test.mjs` and the zoom-threshold case in `tests/photoWorkspaceEditUi.test.mjs`.
- Focused Node — 118 passed initially and 125 passed on the map and shared-layout recheck, with zero failures or skips. Tests cover accepted bounds, the two zoom decisions and the request wiring.
- Production Chrome — both laptop sizes passed positioned import against a distant loaded survey, first placement at zoom 18, the cluster cap at 19 and viewport stability during selection of an in-view marker, position and direction editing and delivery cycling. The production positioning suite verified that connection-only completion preserved the viewport, sources and delivery.
- Deferred manual acceptance — check fitting with real survey data and photo collections, including tight stacks and widely separated points, then verify navigation and editing at both laptop sizes.

## Consolidated verification

- Passed — `npm.cmd run build` on the completed application. Production verification exposed the compact stack edit bar exceeding its height contract and the mixed delivery counts wrapping after cycling. The corrected build passed and was used for the final Chrome suites on `127.0.0.1:61922` and the serial browser retests on port `61923`. The test servers were stopped.
- Passed — the final focused Node union ran 180 tests with zero failures or skips.
- Passed — production import and combined delivery regressions preserved S1 filename suggestions, S2 source rebinding, preselection and byte verification, and S3 connection-only completion.
- Browser totals — 102 passed, two failed and four skipped across 108 tests and subtests, using the final result for each case. The import suite retest sampled the resting colour and the preview suite retest waited for the initial photo fit before operating the zoom. Both suites passed. The remaining failures are the original stack count assertion and its parent suite. All other stack subtests passed.
- Browser suites — `photoMapFitUi`, `photoMapInteractionSlice2Ui`, `photoPositioningUi`, `validatorDataTableSlice3Ui`, `photoDeliveryDefaultsUi`, `photoWorkspaceUi`, `photoWorkspaceEditUi`, `photoWorkspaceStacksUi`, `photoImportWizardUi`, `deliveryWizardUi`, `photoManualPlacementUi`, `photoDirectionUi`, `photoDirectionLayerUi`, `photoWorkspacePass1dUi`, `photoLoadedGmiUi`, `rettingerPhotoVisibilityUi` and `photoImportAcceptanceFixesUi`.
- Failed — the combined Node gate returned 991 passes, one failure and seven skips across 999 tests. The failure matches the clean-HEAD Validator close-label assertion.
- Failed — affected-file `npx.cmd --no-install eslint` reported eight errors and four warnings in `MapInner.js`. Linting the clean-HEAD source via stdin reproduced the same rules, severities and source statements. All other affected JS/MJS files linted cleanly.
- Passed — `git diff --check`.
- Skipped — seven Node fixtures or browser-configured gates and four production browser cases required opt-in inputs, including private GML and the EXIF-orientation fixture. Manual real-data acceptance remains deferred.

### Screenshots

Synthetic Chrome artifacts were saved in `%TEMP%/gmi-batch-a-final-screenshots`. The laptop sidebar and fit captures were visually inspected.

| Evidence | 1280×720 | 1366×768 |
| --- | --- | --- |
| Shared sidebar and edit bar | [Screenshot](C:/Users/GEMINI~1/AppData/Local/Temp/gmi-batch-a-final-screenshots/batch-a-shared-sidebar-edit-1280x720.png) | [Screenshot](C:/Users/GEMINI~1/AppData/Local/Temp/gmi-batch-a-final-screenshots/batch-a-shared-sidebar-edit-1366x768.png) |
| Stable list with mixed delivery counts | [Screenshot](C:/Users/GEMINI~1/AppData/Local/Temp/gmi-batch-a-final-screenshots/acceptance-preview-1280x720.png) | [Screenshot](C:/Users/GEMINI~1/AppData/Local/Temp/gmi-batch-a-final-screenshots/acceptance-preview-1366x768.png) |
| Positioned import with survey loaded | [Screenshot](C:/Users/GEMINI~1/AppData/Local/Temp/gmi-batch-a-final-screenshots/batch-a-fit-import-1280x720.png) | [Screenshot](C:/Users/GEMINI~1/AppData/Local/Temp/gmi-batch-a-final-screenshots/batch-a-fit-import-1366x768.png) |
| Initial positioning at zoom 18 | [Screenshot](C:/Users/GEMINI~1/AppData/Local/Temp/gmi-batch-a-final-screenshots/batch-a-fit-initial-position-1280x720.png) | [Screenshot](C:/Users/GEMINI~1/AppData/Local/Temp/gmi-batch-a-final-screenshots/batch-a-fit-initial-position-1366x768.png) |
| Cluster capped at zoom 19 | [Screenshot](C:/Users/GEMINI~1/AppData/Local/Temp/gmi-batch-a-final-screenshots/batch-a-fit-cluster-cap-1280x720.png) | [Screenshot](C:/Users/GEMINI~1/AppData/Local/Temp/gmi-batch-a-final-screenshots/batch-a-fit-cluster-cap-1366x768.png) |

## Git inventory

HEAD remained `9c772d1`. No staging, commits, pushes, ref changes or deployments. No subagents.

```text
## feature/photo-workspace...origin/feature/photo-workspace [ahead 2]
 M src/app/page.js
 M src/components/MapInner.js
 M src/components/photos/PhotoMapController.js
 M src/components/photos/PhotoPositioningWizard.js
 M src/components/photos/PhotoWorkspaceCollection.js
 M src/components/photos/photoEdit.css
 M src/components/photos/photoWorkspace.css
 M src/lib/photos/photoDeliveryChoice.mjs
 M src/lib/photos/photoMapFeatures.mjs
 M src/lib/photos/photoSession.mjs
 M tests/photoDeliveryDefaults.test.mjs
 M tests/photoImportWizardUi.test.mjs
 M tests/photoMapFeatures.test.mjs
 M tests/photoMapInteractionSlice2Ui.test.mjs
 M tests/photoPositioningUi.test.mjs
 M tests/photoWorkspaceEditUi.test.mjs
 M tests/photoWorkspaceStacksUi.test.mjs
 M tests/photoWorkspaceUi.test.mjs
 M tests/validationV2WorkspaceInspector.test.mjs
 M tests/validatorDataTableSlice3Ui.test.mjs
?? docs/agent-reports/20261118-103245-acceptance-batch-a-s4-s8-s5-implementation.md
?? tests/photoMapFitUi.test.mjs
```
