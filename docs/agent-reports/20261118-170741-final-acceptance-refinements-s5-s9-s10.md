# Final acceptance refinements — S5, S9 and S10

18 November 2026, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `30dd02a3c4c601627e3b6123a522ca636637eda5`. Expected branch and HEAD verified; working tree was clean at start. No subagents, staging, commits, pushes, deployments or Git ref changes.

Read root AGENTS.md, development/security/privacy documentation, the [consolidated acceptance plan](20261118-085516-real-data-acceptance-corrections-planning.md), and implementation reports for [Batch A](20261118-103245-acceptance-batch-a-s4-s8-s5-implementation.md), [Batch B](20261118-112250-acceptance-batch-b-s12-s9-implementation.md) and [Batch D](20261118-135500-acceptance-batch-d-s10-s11-implementation.md). This batch refines the implemented findings; it does not repeat the planning investigation or start later milestones. «Lag retting …» remains unchanged.

## Exact application and test files changed

| File | Change |
| --- | --- |
| `src/components/photos/PhotoMapController.js` | S5 fit margins and fit-only zoom precision |
| `src/components/delivery/deliveryWizard.css` | S9 description/affix foregrounds and backgrounds only |
| `src/components/LayerPanel.js` | S10 analysis icon size and row gap only |
| `src/app/globals.css` | One analysis-row-scoped muted-colour rule; no global base-style changes |
| `tests/photoMapFitUi.test.mjs` | Fractional zoom parsing, tighter clear-area checks, minimum useful extent coverage, existing integer navigation snapping |
| `tests/deliveryWizardUi.test.mjs` | Computed filename palette and WCAG contrast checks at both laptop sizes |
| `tests/layerAnalysisUi.test.mjs` | 16 px icon/22 px target geometry, centring, 6 px gaps and muted colour checks |
| `tests/layerHighlightPanel.test.mjs` | Existing icon-collection assertion updated to 16 px |

Additional files: this report and the 20 PNG screenshots listed below, under `assets/20261118-170741-final-acceptance-refinements/`. No dependencies or fixtures changed.

## S5 — FOTO fitting

Automatic fits retain the existing request owner, triggers, requested layer, accepted-position filtering and next-frame size invalidation. The existing container measurement accounts for the open side panes. The existing overlay measurements reserve the display card and, when present, the edit command bar.

Fit edge margins are 32 px instead of 60 px; command-bar clearance is 24 px instead of 40 px. Display-card clearance remains 24 px. Selection pans retain all their previous margins and conditions. Bounds fits use quarter-level zoom rounding, avoiding the empty space caused by rounding down a whole zoom level. `map.options.zoomSnap` is restored immediately in `finally`; wheel/button settings remain unchanged and button navigation returns to the existing integer snap grid. Fixed single-point/sub-10 m zoom 18 and the other extent cap of 19 remain unchanged.

Observed before/after, using identical synthetic positioned imports with a distant survey loaded:

| Viewport | Before | After |
| --- | --- | --- |
| 1280×720 | Zoom 17; horizontal marker separation about 181 px | Zoom 17.5; separation about 256 px |
| 1366×768 | Zoom 17; horizontal marker separation about 181 px | Zoom 17.75; separation about 305 px |

Screenshots show both outer markers clear of the side pane and display card, with comfortable marker-edge clearance. Browser assertions require the extent to use at least 80% of the clear horizontal band. The point remains at zoom 18 and the close pair remains capped at 19. Selection, delivery cycling, rotation, manual position changes and save preserve the viewport in the regression test; explicit zoom-out retains integer snapping.

## S9 — Filename colours

The editable description now uses approved `--gmi-ink` on `--gmi-cyan-soft`; generated timestamp, revision and extension use `--gmi-text-subtle` on `--gmi-surface-soft`. This keeps one continuous field, one outer border and one focus ring, with no added gaps, borders, text or geometry changes. Computed colour pairs pass 4.5:1 contrast in Chrome at both viewports.

Before, generated and editable text were close in colour and the affix background was almost indistinguishable from white. After, the dark description on the soft cyan surface is immediately distinguishable from the subdued generated text. Screenshots confirm the complete filename still reads continuously. Naming, live counting, timestamp/revision toggles, suggestions, validation and export/reimport behaviour pass the existing production test unchanged.

## S10 — Analysis icon collection

All five icons use the existing 16 px standard icon-button size, Phosphor Regular and the shared PhotoIconButton. Compact targets remain 22×22 px; the row uses the established 6 px gap and `--gmi-text-muted`, with existing hover, focus, pressed and unavailable states. The colour rule is scoped to `.layer-analysis-actions`, leaving header actions alone.

Reviewed icon selection against existing application use: Highlighter, ChartLine, Mountains, ClipboardText and CircleHalf retain the established meanings; no remapping was needed. No extra stroke weight or custom glyphs were introduced. Before, 14 px subtle icons looked faint beside the adjacent actions. After, the collection is clearer and more evenly spaced while retaining its compact row. Chrome verifies icon centring within half a pixel in both axes at both sizes. Existing calculations/results, missing-Z dot, toggles, tooltips and KOF restrictions pass.

## Verification

| Gate | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Clean-HEAD targeted production Chrome baseline | 4 | 0 | 0 |
| Final focused Node tests | 140 | 0 | 0 |
| Final production Chrome, including nested delivery cases | 22 | 0 | 1 |
| Clean-HEAD and final production builds | 2 | 0 | 0 |
| Affected-file ESLint | clean | 0 | — |
| `git diff --check` | clean | 0 | — |

Commands:

```text
npm.cmd run build
node --test --test-concurrency=1 --test-name-pattern="FOTO fit|layer analysis|filename editor" tests/photoMapFitUi.test.mjs tests/layerAnalysisUi.test.mjs tests/deliveryWizardUi.test.mjs
node --test --test-concurrency=1 tests/photoMapFeatures.test.mjs tests/photoExportNaming.test.mjs tests/photoExportWizard.test.mjs tests/deliveryWizard.test.mjs tests/deliveryPlan.test.mjs tests/layerHighlightPanel.test.mjs tests/featureHoverTooltip.test.mjs
npx.cmd --no-install eslint src/components/photos/PhotoMapController.js src/components/LayerPanel.js tests/photoMapFitUi.test.mjs tests/layerAnalysisUi.test.mjs tests/layerHighlightPanel.test.mjs tests/deliveryWizardUi.test.mjs
npm.cmd run build
node --test --test-concurrency=1 tests/photoMapFitUi.test.mjs tests/layerAnalysisUi.test.mjs tests/deliveryWizardUi.test.mjs tests/photoMapInteractionSlice2Ui.test.mjs tests/photoPositioningUi.test.mjs
git diff --check
```

Browser commands used `PHOTO_UI_URL=http://127.0.0.1:3191`, local headless Chrome and serial execution. A task-owned `next start --hostname 127.0.0.1 --port 3191` ran against each fresh build and was stopped before rebuilding and after verification. Screenshot environment variables were set for the relevant harnesses. Unrelated regression screenshots were discarded; relevant evidence is retained below.

No unrelated or pre-existing test failures occurred in the checks run. The skipped case requires an opt-in private 148-photo GML corpus; no private corpus was opened. Build emitted the existing Browserslist age notice; Node emitted the existing package module-type warning. No dependency changes were made. The complete serial Node suite was not run; verification was scoped to these refinements and their workflow regressions.

## Screenshot evidence

All six primary before/after pairs were visually inspected as actual PNGs at the requested sizes, in addition to DOM checks. The S5 harness substitutes blank base tiles to keep feature framing independent of external map availability; this is not evidence of basemap image quality.

Each table cell links the exact files retained. Filenames preserve the existing harness names; `before` and `after` identify this batch's state.

| State | Before 1280×720 | After 1280×720 | Before 1366×768 | After 1366×768 |
| --- | --- | --- | --- | --- |
| Spread-photo fit | [PNG](assets/20261118-170741-final-acceptance-refinements/before/batch-a-fit-import-1280x720.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/after/batch-a-fit-import-1280x720.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/before/batch-a-fit-import-1366x768.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/after/batch-a-fit-import-1366x768.png) |
| Single-point cap | [PNG](assets/20261118-170741-final-acceptance-refinements/before/batch-a-fit-initial-position-1280x720.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/after/batch-a-fit-initial-position-1280x720.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/before/batch-a-fit-initial-position-1366x768.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/after/batch-a-fit-initial-position-1366x768.png) |
| Cluster cap | [PNG](assets/20261118-170741-final-acceptance-refinements/before/batch-a-fit-cluster-cap-1280x720.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/after/batch-a-fit-cluster-cap-1280x720.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/before/batch-a-fit-cluster-cap-1366x768.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/after/batch-a-fit-cluster-cap-1366x768.png) |
| Filename editor | [PNG](assets/20261118-170741-final-acceptance-refinements/before/batch-b-filename-1280x720.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/after/batch-b-filename-1280x720.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/before/batch-b-filename-1366x768.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/after/batch-b-filename-1366x768.png) |
| Analysis icons | [PNG](assets/20261118-170741-final-acceptance-refinements/before/batch-d-layer-analysis-1280x720.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/after/batch-d-layer-analysis-1280x720.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/before/batch-d-layer-analysis-1366x768.png) | [PNG](assets/20261118-170741-final-acceptance-refinements/after/batch-d-layer-analysis-1366x768.png) |

## Remaining acceptance and Git

Synthetic browser evidence does not replace real-file acceptance. Check representative real FOTO extents (wide, vertical and dense), user-resized side panes, actual filename descriptions and icon recognition at both laptop sizes. Quarter-level fits rely on Leaflet's supported fractional zoom in modern Chrome; other browser rendering paths have not been manually checked. No known failed acceptance gate remains in the scoped automated checks.

HEAD and branch remain unchanged. Eight tracked application/test files are modified and unstaged. This report and the twenty screenshots are untracked. Nothing staged, committed, pushed or deployed.
