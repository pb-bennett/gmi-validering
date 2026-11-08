# FOTO browser acceptance corrections

Date: 2026-11-08, Europe/Oslo. Branch `feature/photo-workspace`, starting from `ede99d6` (M6e `3759dd5` plus the GMI editing planning report). **Nothing was committed or pushed.** No GMI editing functionality was touched.

Norwegian text in `«…»` is UI copy. "Hub" means `Fullfør opplysninger…`.

---

## 1. Summary

| Priority | Result |
|---|---|
| 1. Export return navigation | **Not reproduced.** The page's state changes were traced, and the sequence was replayed in five ways (§2). Regression tests now pin the expected behaviour. No code change was made, because I found no cause |
| 2. Profile-specific wording | Fixed. The missing-time hint now follows the target |
| 3. Positioning wizard | Restyled. Koblinger shows the two commitments, Plassering starts with the distance, Kontroll is a compact summary |
| 4. Direction arrows | Redrawn. Each arrow starts behind its photo, and the tip sits 8 px (camera) or 10 px (thumbnail) past the edge at any heading |
| 5. Teal styling | One scoped stylesheet, built from the existing `--gmi-*` tokens |
| 6. Post-download screen | Heading, filename, schema warning when relevant, `Last ned på nytt` and `Lukk` |
| 7. Hub polish | Teal checkboxes, quiet focus on groups, a completed state for Plassering, and guidance in `Rediger opptaksdata` |

| Gate | Result |
|---|---|
| All 23 browser suites, with the 148-photo corpus | 137 tests: 127 pass, 1 skip, 9 fail. All 9 were one deliberate test change, see §8. After it was updated: Pass 1D 12/12 |
| Re-run on the final build: positioning, return, placements, loaded GMI, export flow, workspace | 49/49 |
| Non-browser suite, 151 files | 1,714 tests: 1,701 pass, 5 skip, **8 fail: the 7 known baseline failures, plus 1 timing-flaky test** (§8) |
| `next build` | Clean |
| Direct ESLint on changed files | Clean |
| `git diff --check` | Clean |

**Please review these:**

1. **Priority 1 is still open.** I could not make the hub lose `Tilbake til eksport` (§2). I need more detail on how it happened to you.
2. **The edit bar's `Lagre` is now teal, not navy.** A Pass 1D test pinned navy, and I changed that test on purpose (§8).
3. **Copy changes on purpose:** the done heading is now `«ZIP-pakken er klar»`, the amber `«Ulike posisjoner fra kildene»` became a distance, and the time hint is new. One positioning test was updated for this.
4. **A new 20 m presentation threshold** in the positioning wizard decides what counts as a notable difference (§4). It is my choice, and easy to change.

---

## 2. Priority 1: export return navigation

### What I traced

`fromExport` on the hub is `photoExportReturn?.layerId === workspaceLayer.id` in `page.js`. Changing `Mål` calls `onConfigChange`, which only sets `photoExportConfigs`. Nothing reached from that call clears `photoExportReturn`, closes the hub or reopens it.

The return state is cleared in these places:

- `endPhotoExportTrip`, from a live flow that has become invalid, or from a failed commit
- the unsaved-changes boundary, when a handoff is live
- `enterPhotoLayer`, `exitPhotoWorkspace` and `handleReset`
- `openCompletePhotoDetails` (the Verktøy entry), `openExportFromCompletion`, and the Verktøy export entry
- the session subscriber, when the layer is gone

None of these is reached from a target change, and the session does not publish on a profile change. I found no code path that produces what you saw.

### Attempts

| Attempt | Result |
|---|---|
| Production build, keyboard change of a focused `<select>` (trusted input) | Still `Tilbake til eksport` |
| Production build, mouse-opened native picker, then a trusted key choice | Same |
| `next dev` (strict mode), same sequence | Same |
| Existing synthetic change test (AsBuilt) | Passes |
| New: export → hub → `Mål` → map → Save or Discard → hub → `Mål` | Passes |

Headless Chrome cannot click an option inside the native picker, so **a mouse click on an option in a real window is the one interaction I could not replay.** The Torkopp delivery is not on this machine, so I used fixtures and 40 corpus photos instead.

### Regression tests added (`tests/photoExportReturnUi.test.mjs`)

- **The exact sequence:** Gemini, open the hub from export, choose `Skråfoto 2019 (standard)` by trusted key press. The test then checks:
  - the footer still says `Tilbake til eksport`
  - the hub status becomes `blocked`
  - after several changes and a return, Leveranse shows Standard, `EPSG:25832`, the label, and `blocked` readiness
  - ✕ and Escape after a change also lead back
  - closing ends the journey, and a hub on its own stays on its own whatever the target
- **The journey through the map**, with an unplaced photo and a `Mål` change on the way, in one test for Save and one for Discard.

### What I need from you

- Was it the Vercel deployment or `localhost`?
- Was the target chosen with the mouse?
- Did anything happen earlier in the session: a map trip, a notice `«Redigeringen ble avsluttet …»`, more than one photo layer?

If it happens again, the footer buttons and the text of any notice will narrow it down.

---

## 3. Priority 2: wording

`photoCompletion.mjs`: the hint for the `«Mangler opptakstid»` group now comes from the target's own requirement, taken from readiness:

| Target | Hint |
|---|---|
| Gemini (recommended) | `«Ingen kilde har en brukbar tid. Eksporten kan lages uten, men GML-filen følger da ikke Skråfoto 2019-skjemaet.»` |
| Standard (required) | `«… Opptakstid med sekunder kreves for Skråfoto 2019, og må fylles ut før eksport.»` |
| AsBuilt (required) | `«… Opptakstid med sekunder kreves for AsBuilt 5.2, og må fylles ut før eksport.»` |

**Other Gemini references I checked:**

- The schema warning only appears where the time is not required, so it is never shown for Standard or AsBuilt.
- The UTC recommendation only runs for Gemini.
- `captureTimeHelp` already follows the profile.
- The `«Import i Gemini VA»` status row still appears for every target. It says the import is unverified, which is true and not contradictory, so I left it.

Rules, readiness and the missing-time policy are unchanged. A domain test checks all three hints and that blocking is unchanged.

---

## 4. Priority 3: positioning wizard

### Koblinger

- Content lines up with the header instead of sitting in a centred column with odd indentation.
- **Two cards show the separate commitments.**
  - Card 1: `«Lagre GML-kilden i fotolaget»`, which saves the file and matches and changes no positions.
  - Card 2: `«Velg posisjoner»`, which are applied only after confirmation in Kontroll.
- After saving, card 1 shows a check and card 2 becomes the current card.
- **The button labels are unchanged** (`Behold GML-kilden`, `Kontroller tilgjengelige posisjoner`), because test helpers use them. The cards supply the explanation.
- The save transaction is untouched.

### Plassering

- A shorter lead sentence, with the caveats underneath in muted text.
- The selected count is a pill.
- **The selects look interactive:** white, bordered, their own chevron, a teal edge on hover and a teal ring on keyboard focus.
- **The comparison leads with the distance:** `«ca. 3,2 m mellom kildene»`, `«ca. 12,0 m fra gjeldende»` or `«Kildene oppgir samme posisjon»`. Coordinates are behind `«Vis koordinater»`, as a small definition list.
- **The amber `«Ulike posisjoner fra kildene»` line is gone.** Differences are neutral text. Only a difference over **20 m**, the new presentation-only threshold, takes the caution colour.
- The action tag (`Plasseres`, `Flyttes ca. …`) is teal text, never amber.
- `«GMI: koblet til 0 objekter»` is hidden when the count is 0.
- Automatic preselection and the 0.01 m tolerance are unchanged.

### Kontroll

- **Tiles:** Plasseres, Flyttes, Samme posisjon (only when there is one) and Uendret.
- **`«Bør kontrolleres (n)»` stays visible.** It lists:
  - sources more than 20 m apart
  - a move of more than 20 m
  - a 0°/0° GPS position
  - photos that stay unplaced
  
  With none, it says `«Ingen avvik å kontrollere.»`
- **The per-photo list is folded in `Vis detaljer (n)`.**
- Confirmation and apply logic are unchanged.
- **The step body now scrolls to the top on each step.** At 1093×510 and 125%, Kontroll opened where Plassering was left, which hid the summary.
- **The heading no longer gets a black focus ring.** It still receives focus.

---

## 5. Priority 4: arrows

`photoDirectionArrow` in `photoMarkerPresentation.mjs` now:

- computes the marker's reach at the heading, as a box for the camera body and thumbnail, or a circle for the selection and sibling rings
- runs the shaft from behind the marker to a tip **8 px past the edge for camera markers and 10 px for thumbnails**, so a 45° arrow reaches past the thumbnail's corner
- uses a smaller head on cameras and a slightly larger one on thumbnails
- is drawn first in the icon, so the photo covers the root
- has opacity 0.8 and keeps its white casing for contrast
- keeps `pointer-events: none`

**Behaviour checked in a real browser:**

| Check | Result |
|---|---|
| Anchor drift between Markører and Miniatyrer, all markers | 0 px |
| `pointer-events` on arrows | `none` |
| Opacity | 0.8 |

Unit tests cover 0°, 45°, 90°, 135°, 180° and 300° on thumbnails, and four headings on camera markers. Selected markers clear their ring.

**Unchanged:** stored position and direction, transforms, provenance, the edit transaction, and the knob.

**Limit:** with overlapping markers, the upper marker's short arrow can paint over the lower photo. Putting every arrow under every photo would mean a separate map pane, which I left alone.

---

## 6. Priorities 5, 6 and 7

### Priority 5: `src/components/photos/photoTheme.css` (new)

The stylesheet is scoped to the FOTO dialogs, the edit bar, the boundary dialog and the map card. Hover and pressed shades are mixed from `--gmi-interactive` and `--gmi-ink` with `color-mix`, so no new palette was added.

| Control | Treatment |
|---|---|
| Primary buttons | Teal, darker on hover and when pressed |
| Secondary buttons | Teal edge and tint on hover |
| Radios and checkboxes | Teal accent |
| Fields | Teal edge on hover |
| Selected and pressed controls | Teal edge on cyan-soft |
| Wizard steps | Current step teal, earlier steps teal on hover |
| Focus | One teal `:focus-visible` ring. No ring on headings that only receive focus on arrival, and none on a fold clicked with the mouse |

- The old navy hover rules in `photoExportWizard.css` and `photoEdit.css` were removed.
- Global `.gmi-primary-control` is unchanged.
- Warning, success and provenance colours (GML purple, EXIF green, manual orange) are untouched.

### Priority 6: post-download screen

The screen now shows only:

- `«ZIP-pakken er klar»`
- the ZIP filename
- `«N bilder mangler opptakstid. Pakken følger derfor ikke Skråfoto 2019-skjemaet.»` when relevant
- `Last ned på nytt` and `Lukk`

The import steps and repeat-download paragraphs are gone. Repeat download still gives identical bytes, which the existing test checks.

### Priority 7: hub

- Checkboxes and fold focus come from the theme.
- The active task gets a teal inset bar.
- **Plassering with nothing missing** shows one line: `«Alle N plasseringer har posisjon. Ingenting å gjøre her.»`
- **`Rediger opptaksdata` with no accepted time** now says what to do.
  - With no usable source, it shows `«Mangler, og ingen kilde har en brukbar tid. Skriv inn dato og klokkeslett med sekunder nedenfor, og trykk Lagre.»` and opens `Annen verdi` straight away.
  - With a source value, it points to the source value or `Annen verdi`.
  - Nothing is written until the user types.

---

## 7. Changed files

| Area | Files |
|---|---|
| Source | `src/lib/photos/photoCompletion.mjs`, `src/lib/photos/photoMarkerPresentation.mjs`, `src/app/globals.css` (one arrow rule) |
| Components | `PhotoPositioningWizard.js`, `PhotoExportPackageStep.js`, `PhotoCaptureMetadataDialog.js`, `PhotoCompletionDetailsPanels.js`, `PhotoCompletionDialog.js` (one prop), and theme imports in `PhotoSourceOption.js`, `PhotoEditCommandBar.js`, `PhotoEditBoundaryDialog.js`, `PhotoMapDisplayCard.js` |
| CSS | `photoTheme.css` (new), `photoPositioningWizard.css`, `photoCompletion.css`, `photoWorkspace.css`, `photoExportWizard.css`, `photoEdit.css` |
| Tests | `photoExportReturnUi`, `photoCompletion`, `photoMarkerPresentation`, `photoExportWizardUi`, `photoLoadedGmiUi`, `photoPositioningUi`, `photoWorkspacePass1dUi` |

**Not changed:** serializers, package, naming, rules, readiness, export plan, sessions, edit session, `page.js`, and fixtures.

---

## 8. Tests

### New

- `photoExportReturnUi`: three tests (§2).
- `photoCompletion`: missing-time hint by target, with blocking unchanged.
- `photoMarkerPresentation`: arrow geometry at six headings and in both modes, DOM order, the anchor, and the opacity and pointer rule.

### Changed on purpose

| Test | Change |
|---|---|
| `photoExportWizardUi` | The done screen: new heading, warning text, footer buttons, and no import steps |
| `photoLoadedGmiUi` | The done screen names the ZIP and has no guidance |
| `photoPositioningUi` | `«Ulike posisjoner fra kildene»` is now the distance summary on a row whose sources differ |
| `photoWorkspacePass1dUi` | Save button teal, legible and darker on hover. Secondary hover now has a teal edge. The colour parser accepts `color(srgb …)` |

### Failures not caused by this work

- **The 7 baseline failures, unchanged:** `validationV2WorkspaceInspector` ×3, `statsUiContract` ×2, `appInfoUiContract` ×1, `terrainPhotoGml` ×1.
- **`photoEditCommit` › `repeated GMI occurrences of one asset are committed independently`** failed once in the full parallel run.
  - It received a default 0° direction where it expected `null`, which points to an EXIF-read timing race.
  - It passed 5/5 alone, and also passed with my changes stashed.
  - It is not in the M6e baseline list, so treat it as a flaky test found here, not a regression.

### Coverage gaps

- **The full browser run was on the build before the final scroll fix.** The six suites that drive the positioning wizard or the export journey were re-run on the final build (49/49). The other 17 were not.
- **125% zoom was emulated** (1093×510, device scale 1.25). The export and hub layout suite passed at all nine sizes, and the positioning UI suite checks five sizes.

---

## 9. Screenshots

Temporary, in the session scratchpad: `C:\Users\furr_\AppData\Local\Temp\claude\48e85b8705b14ab6\f0dafb95-9e08-43fc-aae5-5ae838a8cb87\scratchpad\`

| Folder and file | Shows |
|---|---|
| `shots-before\` | The same screens before the changes |
| `shots-after\p2a-koblinger-review.png`, `p2b-koblinger-saved.png` | Koblinger, before and after saving |
| `shots-after\p3a…`, `p3b-plassering-comparison.png`, `p3c…hover` | Plassering |
| `shots-after\p4-kontroll.png` | Kontroll |
| `shots-after\a1-markers-z20.png`, `a5-markers-selected-z21.png` | Arrows on camera markers: eight headings, two overlapping photos, selected |
| `shots-after\a2-thumbnails-z20.png`, `a3-thumbnails-z21.png`, `a4-thumbnails-selected-z21.png` | Arrows on thumbnails |
| `shots-after\b1-boundary.png`, `b2-boundary-hover-primary.png` | Boundary dialog |
| `shots-after\e3-done.png` | Post-download screen. These corpus photos all have times, so there is no warning; its text is pinned by a test |
| `shots-after\laptop-1366x625\`, `shots-after\small-125-1093x510\` | The wizard at laptop size and at 125% |

The scripts are `repro\shots.mjs` (wizard, 40 corpus photos) and `repro\shots2.mjs` (arrows, boundary, export; 10 corpus photos with a generated GML).

---

## 10. Remaining issues

1. **Priority 1 is unresolved** (§2).
2. **Arrows on overlapping markers** can sit over a neighbour's photo (§5).
3. **The 20 m threshold** is a judgement call.
4. **Camera-marker arrows are compact.** Please check at normal zoom whether 8 px is enough.
5. **`Uendret 0`** is always shown, because you asked for that count.
6. **Hover was checked on the boundary dialog only.** No test asserts the other hover states.

---

## 11. Manual acceptance

Use the Torkopp delivery.

1. **Priority 1 with the mouse:** open Eksporter, then `Fullfør opplysninger…`, then choose `Skråfoto 2019 (standard)` in `Mål` with a click. The footer should still say `Tilbake til eksport`. If not, note what happened just before.
2. With Standard selected, the `«Mangler opptakstid»` group says the time is required, with no mention of Gemini.
3. `Koble og posisjoner bilder`: read Koblinger before and after `Behold GML-kilden`. Is the difference between saving and applying clear?
4. Plassering: do the dropdowns look clickable? Do the distances feel calm, with large differences still noticeable?
5. Kontroll: tiles, `«Bør kontrolleres»`, then `Vis detaljer`.
6. Map arrows at 0°, a diagonal, and overlapping photos, in Markører and Miniatyrer. Do they look attached?
7. Teal: hover over buttons, Tab through each dialog, and check radios, checkboxes and the steps.
8. Download a ZIP with missing times. Check the warning, then `Last ned på nytt`.
9. In the hub, use `Rediger…` on a photo without a time.
10. Ctrl-plus to 125% on a real laptop.

**Deferred:** real Gemini VA import and terminology.

No commits or pushes were made. Stopping for review.

---

## 12. Final validation

Date: 2026-11-08, Europe/Oslo. The working tree is unchanged since §1–11. This pass only tested. **No production or test file was changed**, and nothing was committed or pushed.

**Priority 1 decision.** Your retest on Vercel kept `Tilbake til eksport` for all three targets, and readiness updated for each. The original observation is treated as intermittent and unconfirmed. `page.js` is not in the diff, and the three regression tests from §2 stay.

### 12.1 Commands

All runs used a fresh production build of the final tree, served by `next start -p 3110`.

```
npx next build
npx next start -p 3110
# Browser: every test file that reads PHOTO_UI_URL (23 files)
PHOTO_UI_URL=http://localhost:3110 PHOTO_GML_FIXTURE='C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml' \
  node --test --test-concurrency=1 <23 browser files>
# Non-browser: every other tests/*.test.mjs (151 files)
PHOTO_GML_FIXTURE=<same> node --test <151 files>
node --test tests/photoEditCommit.test.mjs   # 5 times, alone
npx eslint <every changed .js/.mjs file>
git diff --check
```

### 12.2 Results

| Gate | Result |
|---|---|
| `next build` | Exit 0, no errors or warnings |
| Browser, 23 suites | **137 tests: 136 pass, 0 fail, 1 skip** |
| Non-browser, 151 files | **1,714 tests: 1,702 pass, 7 fail, 5 skip** |
| `photoEditCommit` alone | 6/6 in each of 5 runs. It also passed in the full run |
| ESLint, all changed `.js` and `.mjs` files | Exit 0, no findings |
| `git diff --check` | Clean |

**Browser skip.** `private G01/G04 browser` skipped, as in M6e, because it needs a separate fixture.

**The corpus tests ran, with no skips:**

- `private corpus through the hub`
- `private corpus in the real app`
- `private corpus: 148 occurrences need nothing by hand`
- `real append duplicate correction: 148 minus six`
- `real 148-photo import retains GML/EXIF evidence`
- `production FOTO UI: real corpus markers`
- `manual FOTO placement in Edit mode: real corpus`

**Compared with §8.** The earlier browser run was on the build before the scroll fix, and had 9 failures from the Pass 1D Save button assertion. That test was corrected in §8, and now all 137 browser tests run on the final build with **no new failures**.

### 12.3 Baseline comparison

The 7 non-browser failures are **exactly** the established baseline, at the same files and lines:

| File | Line | Test |
|---|---|---|
| `validationV2WorkspaceInspector.test.mjs` | 7 | normal sidebar width is preserved and shared by the Validator and docked inspector |
| `validationV2WorkspaceInspector.test.mjs` | 34 | workspace shell places a full-height left list beside a shared upper row and full-width bottom dock |
| `validationV2WorkspaceInspector.test.mjs` | 103 | 2D map resize invalidation and parent-sized 3D canvas remain in place |
| `statsUiContract.test.mjs` | 8 | statistics UI exposes the Norwegian uptake and kommune controls |
| `statsUiContract.test.mjs` | 129 | Stats trigger visibility follows table, docked inspector, and profile ownership only |
| `appInfoUiContract.test.mjs` | 90 | working header stays above one conditional feature branch with full-height normal resize reach |
| `terrainPhotoGml.test.mjs` | 12 | actual browser XML parser, File/EXIF and session integration |

**`photoEditCommit` › `repeated GMI occurrences of one asset are committed independently`: not reproduced.**

- It failed once in the earlier parallel run.
- This time it passed in the full run, and 5 of 5 runs alone.
- The file imports only `photoSession`, `photoEditSession` and `photoExportPlan`. None of them is changed.
- That failure received an automatic default direction where it expected `null`. This fits an EXIF-read timing race under load, so it is a separate test-infrastructure observation and not a regression. I did not pursue it further.

### 12.4 Approved behaviour: covering tests, all passing on the final build

| Behaviour | Tests |
|---|---|
| Automatic GML positioning preselected | `unified source workflow: GMI/GML checkpoints …`, which checks `3 valgt` and that a manual current is never proposed. `GML checkpoint retains evidence only …`. The corpus `real 148-photo import …` |
| Direction GML → EXIF → default 0° | `direction priority: GML, then EXIF, then a default kept apart from a source 0°` |
| Manual Save, Discard and Fortsett redigering | `Save and Discard: no automatic write reaches a layer with an open Edit session`. `wizard → hub → map → Save → hub → wizard`. `the same route with Discard and Fortsett redigering`. Edit-mode suites |
| Export settings survive the hub round trip | `wizard → hub → wizard: settings stay …` |
| Changing `Mål` keeps the export return | `changing Mål in a hub opened from export keeps the way back …`, and the Save and Discard map-journey variants (§2) |
| Capture-time wording follows the target | `missing time: the group hint follows the chosen target, and only Gemini lets it through` |
| ZIP and GML naming, serializers, attachment references | `an empty label gives the timestamp alone, and ZIP and GML always share one basename`. `preview and download use the one name the plan was given`. All `Gemini golden: … byte-identical` tests. `colliding filenames produce … exactly matching XML paths`. **`src/lib/photos/export/` has no diff** |
| Simplified done screen keeps repeat download | `normal path: Gemini is chosen, the screens agree, and the same package can be downloaded again`. It checks the new screen, then the same name and identical bytes from `Last ned på nytt` |

**Not covered by any test: the scroll-to-top on each positioning step (§4).** No test asserts it. It was checked by screenshot only (`shots-after\small-125-1093x510\p4-kontroll.png`). The six suites that drive the wizard pass with it in place, so it breaks nothing. A one-line assertion in `photoPositioningUi` would cover it, but adding one was outside this validation-only pass.

### 12.5 Test-only corrections in this pass

None. All test changes are those already listed in §8.

### 12.6 Final changed-file inventory

`git diff --stat`: **24 tracked files, +416 / −96**. Two files are untracked:

- `src/components/photos/photoTheme.css` (new)
- this report

| Group | Files |
|---|---|
| Library | `src/lib/photos/photoCompletion.mjs`, `src/lib/photos/photoMarkerPresentation.mjs` |
| Global CSS | `src/app/globals.css`, +2 lines: the arrow opacity and pointer rule |
| Components | `PhotoPositioningWizard.js`, `PhotoExportPackageStep.js`, `PhotoCaptureMetadataDialog.js`, `PhotoCompletionDetailsPanels.js`, `PhotoCompletionDialog.js`, `PhotoSourceOption.js`, `PhotoEditCommandBar.js`, `PhotoEditBoundaryDialog.js`, `PhotoMapDisplayCard.js` |
| Component CSS | `photoTheme.css` (new), `photoPositioningWizard.css`, `photoCompletion.css`, `photoWorkspace.css`, `photoExportWizard.css`, `photoEdit.css` |
| Tests | `photoExportReturnUi`, `photoCompletion`, `photoMarkerPresentation`, `photoExportWizardUi`, `photoLoadedGmiUi`, `photoPositioningUi`, `photoWorkspacePass1dUi` |

**GMI editing is untouched.** None of the files named in `20261108-gmi-editing-combined-delivery-planning.md` is modified:

- `src/app/page.js`, `src/lib/store.js`, `src/lib/parsing/*`, `src/components/FileUpload.js`
- `src/lib/photos/gmiPhotoSource.mjs`, `src/lib/photos/loadedGmiSource.mjs`, `src/lib/hyperlinkFilenames.mjs`
- `tests/helpers/*`, `tests/fixtures/*`

There is no `src/lib/gmi-edit/` or `src/lib/delivery/`. The planning report itself is unchanged since `ede99d6`.

### 12.7 Remaining known issues

1. **Priority 1** is intermittent and unconfirmed (see the decision above). The regression tests stay.
2. **The positioning scroll-to-top has no automated assertion** (12.4).
3. **The `photoEditCommit` timing race** was seen once and did not reproduce (12.3).
4. **Open from §10, unchanged:**
   - A short arrow on an overlapping marker can sit over its neighbour's photo.
   - The 20 m notable-difference threshold is my judgement.
   - Camera-marker arrows are compact.
   - Hover states are asserted only on the edit bar.
   - 125% zoom was emulated, not set by hand.
5. **Deferred:** real Gemini VA import and terminology.

### 12.8 Recommendation

**Ready to commit.** The full browser and non-browser suites pass apart from the 7 established baseline failures, and every approved behaviour above is held by a passing test. The build, ESLint and `git diff --check` are clean, and the GMI-editing area is untouched.

Two things to know before committing, neither blocking:

- The positioning scroll-to-top has no test.
- The one-off `photoEditCommit` failure is not caused by this work.

Stopping here. No commits or pushes were made.
