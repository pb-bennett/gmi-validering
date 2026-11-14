# A5: hide FOTO map markers while Rettinger is active (implementation report)

- **Branch:** `feature/photo-workspace`, starting HEAD `d5e6ce3` (verified at start; the three unrelated untracked planning reports were left untouched).
- **Source plan:** `docs/agent-reports/20261114-160730-rettinger-export-ux-consolidation-plan.md`, §4.4 and slice A5. D2 was implemented as recommended: every entry hides photos again.
- **Scope:** A5 only. Nothing was staged, committed, pushed or deployed.

## Outcome

- Entering Rettinger removes every FOTO marker, direction arrow, popup and hover preview from the map. GMI/GML geometry and other layers are unchanged.
- A compact «Vis bilder» toggle in the map toolbar shows the markers again for the current visit. It has `aria-pressed`, and its tooltip reads «Vis bilder» or «Skjul bilder».
- Leaving Rettinger restores the previous map exactly. Re-entering, switching the Rettinger layer, or visiting FOTO and coming back hides the markers again.
- `photoSession` is never written. Layer visibility, photo records, positions and delivery decisions are untouched, and Layer Manager and layer cards stay authoritative.

## Implementation decisions

1. **Render-time override with no persistent state** (`src/lib/workspace/rettingerPhotoVisibility.mjs`, a pure helper).
   - `page.js` holds `{ layerId, shown }` in React state.
   - During render, `reconcileRettingerPhotoOverride` replaces the state with a fresh hidden override whenever the current *visit layer* differs. This is React's "adjust state during render" pattern, so no frame ever shows a stale «Vis bilder» choice.
   - No storage is used, and `setLayerVisibility` is never called.
2. **A visit = Rettinger actually owning the workspace.** The visit key is `gmiEditActive ? gmiEditLayerId : null`, not the raw `gmiEditLayerId`.
   - **Deviation from the plan wording.** The plan says to reset on close or on a layer change. But `gmiEditLayerId` stays set while the FOTO workspace temporarily takes over (the page has "FOTO wins"). Keying on the raw id would carry «Vis bilder» across a trip to FOTO.
   - With this key, returning from FOTO counts as a new visit and hides photos again, which matches requirement 4.
3. **Suppression point:** `MapInner` builds no photo items while `photoDisplay.suppressed` is set and no FOTO workspace layer exists.
   - Because the markers unmount, Leaflet closes their bound popups, and `PhotoMarker`'s effect cleanup closes any hover preview and clears its timer. No invisible active marker is left.
   - The camera, extent and GMI selection are not touched. `PhotoMapController` does no initial fit, because survey data is present.
4. **Legend:** `MapLegend` hides its «Bilder» mode section while photos are suppressed, so it reflects effective visibility. U3's legend collapse on entry is unchanged.
5. **Control placement (deviation from the plan; worth reviewing).** The plan put the control in the toolbar's right cluster. Browser measurement showed that in Rettinger that cluster *already* overlaps the centred Kart/3D switcher before A5:
   - 1366×768, map pane 583px, constrained mode: «Del app» starts at x=643, but the switcher ends at x=753.
   - 1600×900: 802 vs 832.
   - Adding a 36px button there made it worse. The toggle now sits in the same toolbar (`role=toolbar`, «Kartverktøy») in a left slot just right of Leaflet's zoom control, beside the other map-display controls. It is clear of the switcher, the zoom control and the right cluster at 1280×720 and 1366×768, and is first in the toolbar's tab order.
6. **Styling.**
   - The control reuses `PhotoIconButton`: `aria-label`, a tooltip after hover delay and immediately on keyboard focus, no native `title`, `.gmi-compact-button` and `.gmi-focus-ring`.
   - The icon is Phosphor `ImagesIcon` (regular), the established FOTO icon.
   - A scoped `.photo-icon-button.gmi-map-toolbar-icon-button` rule in `globals.css` (next to the existing `layer-card-icon-button` rule) uses only existing tokens:
     - 36px square with an 8px radius, matching its toolbar neighbours;
     - `--gmi-border-strong` border;
     - hover on `--gmi-surface-soft`;
     - pressed state `[aria-pressed=true]`: `--gmi-cyan-soft` surface, `--gmi-interactive` edge and icon (about 4.9:1), with a `color-mix` hover.
   - No new colour or variant was introduced.
7. **Accessible name.** The name is fixed as «Vis bilder», with `aria-pressed` showing the state. The tooltip shows the action («Skjul bilder» when pressed). A toggle that changes its own name and also uses `aria-pressed` would be announced contradictorily.
8. **When the control is offered:** only while Rettinger is active, and only if at least one FOTO layer is visible by its own setting and has placed photos. A layer the user hid stays hidden and offers no control.

## Files changed

| File | Change |
|---|---|
| `src/lib/workspace/rettingerPhotoVisibility.mjs` (new) | Pure helpers: create, reconcile, toggle, suppressed and available. |
| `src/app/page.js` | Override state and reconciliation during render. Passes `photoDisplay.suppressed` to the map and `photoToggle` to `MapPaneToolbar`. |
| `src/components/MapInner.js` | Builds no photo items while suppressed (FOTO workspace excluded). |
| `src/components/MapLegend.js` | «Bilder» modes are hidden while suppressed. |
| `src/components/MapPaneToolbar.js` | `photoToggle` prop; `PhotoIconButton` in the left slot of the toolbar. |
| `src/app/globals.css` | Scoped `.gmi-map-toolbar-icon-button` rules (tokens only). |
| `tests/rettingerPhotoVisibility.test.mjs` (new) | Node tests: helper lifecycle and source-wiring contracts. |
| `tests/rettingerPhotoVisibilityUi.test.mjs` (new) | Production-browser A5 acceptance test. |
| `tests/gmiEditDraftGuardUi.test.mjs` | **Deliberate contract change.** See below. |

**Contract change in `gmiEditDraftGuardUi`:**
- That suite opens FOTO from a map photo marker *inside Rettinger*. After A5 no marker exists until the user chooses «Vis bilder».
- The test now asserts that markers are hidden on entry, clicks «Vis bilder» (the intended user path), and then runs the same draft-guard steps unchanged.
- Safety coverage is equivalent: the guard is still exercised through the same marker popup.

## Commands and results

**Node and static checks**
- `node --test tests/rettingerPhotoVisibility.test.mjs tests/mapPaneToolbar.test.mjs tests/photoMapFeatures.test.mjs tests/photoDeliveryPlanning.test.mjs`: **26 passed, 0 failed**. This includes the FOTO delivery colour parity test.
- `node --test --test-concurrency=1 "tests/*.test.mjs"`: **2234 tests, 2104 passed, 0 failed, 130 skipped**.
  - The skips are browser and private-corpus suites without `PHOTO_UI_URL` or corpus variables.
  - This run came before the visit-key refinement (decision 2), which changed only `page.js` and one source assertion. The focused suite was rerun afterwards and passed.
- ESLint:
  - The new and changed files `rettingerPhotoVisibility.mjs`, `MapLegend.js`, `page.js` and the three test files are clean.
  - `MapInner.js` (8 errors) and `MapPaneToolbar.js` (1 error, `set-state-in-effect`) have **pre-existing** `react-hooks` errors. Linting the HEAD versions through `--stdin` gives identical counts (8 and 1), so A5 adds none.
- `npm run build` (`next build`): **passed**.
  - It ran in an isolated copy under the session scratchpad, because other processes were serving this repository's `.next` on ports 3110, 3112 and 3113. Those were left alone.
  - A `node_modules` junction was rejected by Turbopack ("Symlink node_modules is invalid, it points out of the filesystem root"), so `node_modules` was copied instead.
- `git diff --check`: clean.

**Production-browser tests** (isolated build served on port 3140; `PHOTO_UI_URL=http://localhost:3140/`; run serially)
- `tests/rettingerPhotoVisibilityUi.test.mjs`: **10/10 passed**:
  1. normal map shows markers and the legend «Bilder» modes, with no toggle;
  2. Rettinger entry leaves 0 photo markers and 0 direction arrows, GMI geometry is still drawn, the toggle is unpressed, and the expanded legend has no «Bilder» section;
  3. Tab reaches the toggle with `:focus-visible`, a visible ring and an immediate tooltip. Enter shows the markers (`aria-pressed=true`, tooltip «Skjul bilder», settled pressed colours confirmed). Space hides them, and focus stays on the control;
  4. a layer switch resets to hidden. The layer card is not rendered inside Rettinger, so the switch went through exit and entry, which the test notes as a diagnostic. The direct in-Rettinger switch is covered by the Node test;
  5. leaving restores both markers and the GMI feature count is unchanged; re-entering after «Vis bilder» hides them again; the layer-card checkbox is unchanged;
  6. a FOTO layer the user hid stays hidden in and after Rettinger, with no toggle offered;
  7. the FOTO workspace delivery pills are identical before and after, and the workspace draws its markers;
  8. at 1280×720 and 1366×768 the toggle is 36×36, inside the toolbar, clear of the switcher, zoom and right cluster, with no horizontal page scroll;
  9. Rettinger → «Åpne Validator» brings the markers back, with no toggle.
- `gmiEditDraftGuardUi`, `gmiEditWorkspaceUi`, `mapTeardownUi`, `photoMarkerProvenanceUi`, `photoDeliveryIntentUi`, `deliveryWizardUi`: **43/43 subtests passed**.
- The full `tests/*Ui.test.mjs` serial run: **351 tests, 339 passed, 1 failed, 11 skipped** (private corpus and `next dev` suites).
  - The failure is `gmiTableReviewUi.test.mjs`, «R4 follow-up production»: a Data Table cell computes `text-overflow: clip`, but the test expects `'ellipsis'`. It fails the same way every time.
  - **Pre-existing, with evidence:** the same isolated copy was rebuilt with the five changed source files restored to their HEAD versions, and the test failed identically (`'clip' !== 'ellipsis'`). A5 does not touch the Data Table. Not fixed here.

**Screenshots** (temporary session scratchpad, not tracked: `C:\Users\furr_\AppData\Local\Temp\claude\48e85b8705b14ab6\53da1db3-fc72-45f7-bcde-02a9c976f879\scratchpad\a5-shots-2\`):
- `a5-rettinger-hidden-1366x768.png`
- `a5-rettinger-focus-1366x768.png`
- `a5-rettinger-shown-1366x768.png`
- `a5-rettinger-toolbar-1280x720.png`
- `a5-rettinger-toolbar-1366x768.png`
- `a5-validator-after-rettinger-1366x768.png`

The synthetic GPS photos lie outside the GMI viewport, so marker presence is proved by DOM counts rather than being visible in the screenshots.

## Observed issues outside A5 (recorded for the styling audit, not fixed)

- **Pre-existing:** in Rettinger at 1366×768 and 1600×900 (constrained mode), the toolbar's right cluster («Del app», «Nullstill og åpne ny fil», «Mer») overlaps the centred Kart/3D switcher. With `?testmodus=1` at 1920×1080 (normal mode), the Testmodus control overlaps it too.
- **Pre-existing:** the expanded «Tegnforklaring» card can overlap the toolbar's «Mer» button in a narrow Rettinger map pane.

## Remaining risks and unverified items

- The left toolbar slot assumes Leaflet's default top-left zoom control (10px offset, 34px wide). This is verified at 1280 and 1366 widths only.
- **Not verified:** a mouse hover mid-popup while the user clicks «Skjul bilder». Marker unmount closes the popups by construction, and `mapTeardownUi` passed, but there is no dedicated pointer-hover automation.
- Real-file and manual acceptance have not been done. The automation uses synthetic fixtures only.

## Manual acceptance checklist

- [ ] With a GMI and a visible FOTO layer that has placed photos, open Rettinger from the layer card. The photo markers disappear and the GMI geometry stays.
- [ ] Hover and Tab to the image button beside the zoom control. Its tooltip reads «Vis bilder». Press Enter: the markers return, the button looks pressed and the tooltip reads «Skjul bilder». Press it again: they hide.
- [ ] Open a photo popup («Vis bilder», then click a marker), then press «Skjul bilder». The popup closes and no stray preview remains.
- [ ] Press «Tilbake til appen». The markers are back and the FOTO layer card checkbox is unchanged.
- [ ] Re-open Rettinger after choosing «Vis bilder». The markers are hidden again.
- [ ] Hide the FOTO layer in Layer Manager, then open Rettinger. There is no toggle; leave, and the layer is still hidden.
- [ ] From Rettinger, open FOTO via a marker popup, then come back. The markers are hidden again. In FOTO, the delivery choices are unchanged.
- [ ] «Åpne Validator» from Rettinger: the markers are visible in the Validator.
- [ ] Check the button row at 1280×720 and 1366×768.

## Git status and publication

- **Modified:** `src/app/globals.css`, `src/app/page.js`, `src/components/MapInner.js`, `src/components/MapLegend.js`, `src/components/MapPaneToolbar.js`, `tests/gmiEditDraftGuardUi.test.mjs`.
- **New:** `src/lib/workspace/rettingerPhotoVisibility.mjs`, `tests/rettingerPhotoVisibility.test.mjs`, `tests/rettingerPhotoVisibilityUi.test.mjs` and this report.
- The three pre-existing untracked planning reports are unchanged.
- No staging, commit, push or deploy.
