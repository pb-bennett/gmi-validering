# FOTO marker interaction intermittent: stale Leaflet size in the selection pan

Date: 2026-11-18. Repository: `C:/GitHub/gmi-validering-test`. Branch: `feature/photo-workspace`. HEAD: `b48f6dc` (unchanged). Starting tree: clean.

Inputs: root `AGENTS.md`, [regression failure resolution](20261118-184646-regression-failure-resolution.md) (Remaining issue 1 and the verification selection), and the S5 section of [final acceptance refinements](20261118-170741-final-acceptance-refinements-s5-s9-s10.md).

## Outcome

The intermittent failure in `tests/photoMapInteractionSlice2Ui.test.mjs:337` is a **genuine product defect** (a race), not an incorrect test assumption, and it is **not caused by the S5 fit refinements**.

The FOTO selection pan (`panClearOfOverlays` in `PhotoMapController.js`) measures the overlay padding from the live DOM (`getBoundingClientRect`), but `map.panInside` uses Leaflet's cached container size. Leaflet refreshes that cache only when `invalidateSize` runs: on the window `resize` event, after a `requestAnimationFrame`, or through the app's `ResizeObserver` with a 10 ms timer. If a selection pan runs after the layout changes but before either of those, the pan mixes the new overlay geometry with the old map size. It then lands the marker in the wrong place.

The test switches from 1366×768 to 1280×720 and selects `Kum 3` immediately afterwards. At 1280×720 the selection pan has to move Kum 3 out from under the display card ("Bilder på kartet"). In a correct pan the marker centre clears the card's left edge by only about 20 px. With the stale 1366 size (576 × 768 instead of 516 × 720), the pan stops 60 px short, and the marker settles under the card. No later pan corrects it, so the `elementFromPoint` wait times out.

**Correction:** sync Leaflet's size (`map.invalidateSize({ animate: false })`, keeping the centre exactly as Leaflet's own resize handler does) before measuring and panning. This is the same pattern the fit path already uses. The S5 fit margins, zoom precision, selection-pan margins, delivery colours, previews and direction indicators are unchanged.

## Evidence

All evidence was collected with the synthetic fixture of the test itself, against an isolated production build (see Verification). A scratchpad diagnostic copy of the test replaced the line 337 wait with a 100 ms poll. Each poll recorded the topmost element and `elementsFromPoint` stack at the marker centre, the marker, container and card rectangles, the marker `z-index`, the map-pane transform, the zoom, pan/zoom animation classes, previews and the command bar. The live Leaflet map was located through the React context fiber and instrumented: it logged `panInside` with Leaflet's size against the DOM size, Leaflet `resize` with old and new size, `moveend` and window `resize`.

### Normal runs (old build, 4 standalone runs plus 1 instrumented run: all passed)

At 1280×720, before the selection, Kum 3 sits under the card (marker x 850–880, card x 704–880, y 345–640; topmost element `section.photo-map-display-card`). The pan runs after Leaflet's `resize` (576×768 → 516×720), with `leafletSize` = `domSize` = 516×720 and padding `[60,60]`/`[216,60]`. The marker settles at x ≈ 669 (centre ≈ 684), about 20 px clear of the card, and becomes topmost (`div.leaflet-marker-icon.photo-camera-marker-selected…`, z-index 1534). Zoom 17 throughout; no zoom animation, preview, hover preview or command bar is involved.

### Natural stale pan observed

In a "forced" variant that issues the viewport change and the row click back to back, the 1366×768 iteration logged `panInside` **before** the window `resize`: `leafletSize [516,720]`, `domSize [576,768]`. That proves the race occurs without artificial intervention. At 1366 the stale size is harmless because the map grows and the marker is already clear. At 1280 the resize happened to win in all 5 forced runs, matching the low natural failure rate.

### Deterministic reproduction (old build: 2 of 2 failed)

The resize notifications were held back until just after the click: Leaflet's window `resize` listener was blocked, and `invalidateSize` calls arriving before the click were queued. This is equivalent to the frame arriving after the click. The original symptom then reproduced every time:

- `panInside`: `leafletSize [576,768]`, `domSize [516,720]`, padding right 216 (from the fresh card rectangle).
- Final, settled state (no pan animation): marker `[725, 360, 30, 30]`, centre (740, 375); container `[380, 0, 516, 720]`; card `[704, 345, 176, 295]`; pane `translate3d(42px, -159px, 0px)`; zoom 17.
- `elementsFromPoint` at the centre: `section.photo-map-display-card` (z-1000, a stacking context above the map panes), then the selected marker. The marker's own z-index cannot lift it above the card.
- The queued resize then applied, but during the pan animation its centre compensation was overwritten by the animation's absolute positions. No further pan was requested.

Screenshot: [before-held-resize-1280x720](assets/20261118-201555-foto-marker-interaction-intermittent/before-held-resize-1280x720.png). The selected `b.png`/Kum 3 marker is hidden behind "Bilder på kartet".

### Classification of other suspects

- **S5 map fitting (`8731e45`):** not involved. No fit runs in this step. The selection-pan padding (`margin` 60, bar +40) is unchanged by S5, because S5 changed only the no-point (fit) values. The quarter-level `zoomSnap` is restored in `finally`, and zoom was the integer 17 throughout.
- **Animation:** only Leaflet's own 0.25 s pan animation. It amplifies the problem (it overwrites the late resize compensation) but does not cause it.
- **Overlays and previews:** the click preview, hover preview and command bar were absent. The covering element is the display card, which is the overlay the pan is meant to clear.
- **Test assumption:** valid. The test comment states the intended behaviour ("Selecting pans the marker clear of the map card"), and the stale pan violates it.

### With the fix (same held-resize reproduction: 2 of 2 passed)

The pan's `invalidateSize` first applies the pending size change (`resize` 576×768 → 516×720, centre kept). `panInside` then runs with `leafletSize` = `domSize` = 516×720, from the same container point (x 485) as an unraced run, and the marker becomes topmost. The queued notifications released afterwards are no-ops (no size change).

## Changes

| File | Change |
| --- | --- |
| `src/components/photos/PhotoMapController.js` | `panClearOfOverlays` calls `map.invalidateSize({ animate: false })` before measuring and panning (3 lines including a comment). It is a no-op when the size is current. |
| `tests/photoMapInteractionSlice2Ui.test.mjs` | The line 337 wait is unchanged (same condition and timeout). On timeout it now throws an error naming the covering element, with marker, map and card rectangles, pane transform and zoom, and keeps the original error as `cause`. |

No timeouts, retries or assertions were added, relaxed or removed. There is no styling, dependency or fixture change.

## Verification

Isolation: other processes' `next start` servers on ports 3110–3113 (two serving the repository `.next`, one a scratchpad copy) were left untouched. The repository `.next` was not rebuilt. The production build and server (port 3207) ran from a scratchpad copy of `src`, `public`, `data`, package and config files, and a copied `node_modules` (Turbopack rejects a junction). Before the final build, `diff -r` confirmed that the copied sources were identical to the working tree.

| Check | Command | Result |
| --- | --- | --- |
| Production build (fixed sources) | `next build` (isolated copy) | Passed |
| Deterministic reproduction, old build | diagnostic copy, held resize | 2/2 failed as described |
| Deterministic reproduction, fixed build | same | 2/2 passed |
| Focused FOTO suites (both laptop sizes inside the suites) | `PHOTO_UI_URL=http://127.0.0.1:3207 node --test --test-concurrency=1 tests/photoMapInteractionSlice2Ui.test.mjs tests/photoMarkerProvenanceUi.test.mjs tests/photoMapFitUi.test.mjs tests/photoWorkspaceUi.test.mjs tests/photoWorkspaceEditUi.test.mjs tests/photoWorkspacePass1dUi.test.mjs tests/photoWorkspaceStacksUi.test.mjs tests/photoPositioningUi.test.mjs tests/photoSpatialUi.test.mjs tests/deliveryWizardUi.test.mjs` | 82 tests: 78 passed, 0 failed, 4 skipped (private-corpus and real-JPEG gates) |
| Repeated standalone runs | `tests/photoMapInteractionSlice2Ui.test.mjs` ×5 | 5/5 passed |
| Node unit | `node --test tests/photoMapFeatures.test.mjs` | 4/4 passed |
| ESLint | `npx --no-install eslint src/components/photos/PhotoMapController.js tests/photoMapInteractionSlice2Ui.test.mjs` | Clean |
| Whitespace | `git diff --check` | Clean |
| Full production browser | `PHOTO_UI_URL=http://127.0.0.1:3207 PHOTO_SCREENSHOT_DIR=<scratchpad> node --test --test-concurrency=1 --test-reporter=tap "tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"` (selection from the preceding report), run once | 492 tests: **481 passed, 0 failed, 11 skipped**, 580 s. Skips match the preceding report: private-corpus, nested real-JPEG EXIF and next-dev StrictMode gates |

Screenshots after the fix (the test's own captures, selected Kum 3 with the click preview):

- [after-slice2-preview-1280x720](assets/20261118-201555-foto-marker-interaction-intermittent/after-slice2-preview-1280x720.png)
- [after-slice2-preview-1366x768](assets/20261118-201555-foto-marker-interaction-intermittent/after-slice2-preview-1366x768.png)

The marker is clear of the card and the preview is inside the map at both sizes.

## Remaining uncertainties and acceptance

- Five clean standalone runs do not prove the absence of an intermittent. The deterministic held-resize reproduction is the stronger evidence for the cause and the fix. That diagnostic lived in the scratchpad and is not tracked, because it needs private Leaflet and React-fiber access that is not appropriate for the regression suite.
- For a real user the race needs a layout change and a list selection in the same frame (for example, a window resize or side-pane change at the moment of a click). It is rare, but it hides the selected marker until the next selection. The same correction also covers the edit-entry pan request, which goes through the same function.
- Not addressed (out of scope, unchanged): the M10 editor disappearance and the `layerDataTableKeyboardUi` R2 intermittent from the previous report.
- Synthetic automation is not manual acceptance. A brief manual check of list selection after resizing the browser window at both laptop sizes is recommended.

## File inventory

- Modified: `src/components/photos/PhotoMapController.js`
- Modified: `tests/photoMapInteractionSlice2Ui.test.mjs`
- Added: `docs/agent-reports/20261118-201555-foto-marker-interaction-intermittent.md` (this report)
- Added: `docs/agent-reports/assets/20261118-201555-foto-marker-interaction-intermittent/{before-held-resize-1280x720,after-slice2-preview-1280x720,after-slice2-preview-1366x768}.png`

## Processes and Git

The task-owned production server (port 3207) and all test Chrome instances (`gmi-photo-chrome-*` profiles) were stopped and verified gone. The servers on ports 3110–3113 were not started by this task and were left running. The scratchpad build copy and diagnostics are temporary and untracked. Nothing was staged, committed, pushed or deployed. HEAD remains `b48f6dc`.
