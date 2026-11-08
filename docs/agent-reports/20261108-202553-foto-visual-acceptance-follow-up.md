# FOTO visual acceptance follow-up

Date: 2026-11-08, Europe/Oslo. Branch `feature/photo-workspace`, HEAD `3ec86c0`. **Nothing was committed or pushed.** This follows `20261108-185612-foto-browser-acceptance-corrections.md`.

Norwegian text in `«…»` is UI copy.

---

## 1. Summary

| Item | Result |
|---|---|
| 1A. Simplified done screen missing in the browser | **The code at `3ec86c0` renders the new screen.** A browser test now checks the rendered text. The old screen cannot come from this commit (§2) |
| 1B. Gemini wording under Standard | Same finding. The rendered hub shows the Standard text for every target change (§2) |
| 2. Kontroll review reasons | Each reason now has its own explanation, and each row names the compared sources and the distance (§3) |
| 3. Arrows over neighbouring photos | Investigated, not implemented. It needs a separate arrow layer. Options are in §4 |
| 4. Blocking icon | Phosphor Regular `WarningCircle` in the app's error red. All export tone icons are now Regular (§5) |

| Gate, on a fresh production build of the working tree | Result |
|---|---|
| All 24 browser suites, 148-photo corpus included (23 earlier ones plus 1 new) | **140 tests: 139 pass, 0 fail, 1 skip** (the known G01/G04 fixture skip). All 8 corpus tests ran and passed |
| Non-browser, 151 files | 1,714 tests: 1,702 pass, 5 skip, **7 fail: exactly the established baseline**, at the same files and lines |
| `next build`, direct ESLint, `git diff --check` | Clean |

---

## 2. Priority 1: why the two fixes were not visible

### What the code at `3ec86c0` contains

- **Source.** `PhotoExportPackageStep.js` at HEAD has `done: 'ZIP-pakken er klar'`, and no import steps or repeat-download paragraph. `photoCompletion.mjs` has the target-specific hint.
  - `git grep` finds **no remaining source** of `«ZIP-pakken er laget og sendt til nedlasting»`, `«Pakk ut ZIP-filen»`, `«Importer … i Gemini VA»`, `«Last ned på nytt gir …»` or `«valgfritt for Gemini VA»` anywhere under `src/`.
  - The only match is a comment in a test.
- **Rendering paths.** I found no duplicate copy and no other branch.
  - The done screen has one renderer: `PhotoExportPackageStep` → `DownloadDone`.
  - The hub's missing-time group is rendered only by `CompletionGroups`. It prints `group.hint` from `photoCompletionModel`, which is the helper I changed.
  - I found no stale component-level copy and no alternative wiring.
- **Built bundle.** The production chunk built from this tree contains `«ZIP-pakken er klar»` and `«Opptakstid med sekunder kreves …»`. It contains none of the old strings.
- **Rendered UI.** The new browser suite (§6) reads the text Chrome actually renders, and passes:
  - Hub with `Skråfoto 2019 (standard)`: `«Ingen kilde har en brukbar tid. Opptakstid med sekunder kreves for Skråfoto 2019, og må fylles ut før eksport.»`
  - Done screen: `«ZIP-pakken er klar»`, the ZIP name, `«1 bilde mangler opptakstid. Pakken følger derfor ikke Skråfoto 2019-skjemaet.»`, then `Last ned på nytt` and `Lukk`. There are no numbered steps.

### Deployment

| Fact | Evidence |
|---|---|
| `3ec86c0` was pushed only to **`origin/test/validator-v2-v32-ui`** | `git branch -r --contains 3ec86c0` |
| `origin/feature/photo-workspace` is 19 commits behind, at `4707f22` (3 Nov) | `git status -sb` |
| Vercel built `3ec86c0` successfully: "Deployment has completed", 2026-11-08 18:31 UTC (19:31 Oslo) | GitHub commit status. Inspector: `https://vercel.com/paul-bennetts-projects/gmi-validator/3zj3rm3wDZhueNpTR3SLN2LBpoVM` |
| The old done screen existed from `17cdfd2` (7 Nov) until `3ec86c0` | `git log` |

**Conclusion:** the page that showed the old UI was running JavaScript built before `3ec86c0`. Code built from `3ec86c0` cannot render those strings. Likely causes, which I cannot tell apart from here:

- **A deployment-specific URL**, such as `gmi-validator-<hash>-….vercel.app`, from an earlier push. These URLs never update.
- **A branch or production alias that does not follow `test/validator-v2-v32-ui`.** `main` and `feature/photo-workspace` on the remote are both older.
- **A test started before the 19:31 deployment finished.**

I could not open the preview from this machine (connection failed, or Vercel authentication), so I could not read the deployed bundle directly.

**To confirm:**

1. Open the inspector link above.
2. Check that **Source** is `3ec86c0`.
3. Use the **Visit** or **Domains** link from that page, not a saved URL.

**Option, not implemented:** show the commit (`VERCEL_GIT_COMMIT_SHA`) in the app's info dialog, so the running build is visible to anyone testing.

**No change was made to the helper or the done screen**, because both already render correctly.

---

## 3. Priority 2: Kontroll review explanations

`PhotoPositioningWizard.js`: `«Bør kontrolleres (n)»` is now grouped by reason. Each group has a heading, an explanation written once, and one row per photo with the compared sources and the distance.

| Reason | Heading | Explanation | Row |
|---|---|---|---|
| Selected photo whose sources are more than 20 m apart | `«Kildene oppgir posisjoner mer enn 20 m fra hverandre (n)»` | `«GML er foreslått fordi den prioriteres når den finnes, men det betyr ikke at GML-posisjonen er riktig. Se på bildet og kartet, og velg en annen kilde i Plassering hvis den passer bedre.»` If something other than GML was chosen: `«Den valgte kilden er ikke nødvendigvis riktig. …»` | `«EXIF GPS og GML: avvik.gml (1): ca. 44,9 m fra hverandre. Valgt: GML: avvik.gml (1).»` |
| Moves an existing position more than 20 m | `«Flytter en eksisterende posisjon mer enn 20 m»` | `«Bildet har allerede en posisjon. Den valgte kilden flytter det langt, så kontroller at den nye posisjonen er riktig.»` | `«Fra <current source> til <chosen source>: ca. X m.»` |
| 0/0 GPS chosen | `«GPS oppgir 0°/0°»` | `«Dette er nesten alltid en manglende GPS-posisjon i kameraet, ikke et virkelig sted.»` | `«Valgt: …»` |
| Remains unplaced | `«Forblir uten posisjon»` | `«Disse bildene blir ikke med i leveransen før de får en posisjon.»` | `«Ingen kilde har en brukbar posisjon.»` or `«En posisjon finnes, men er ikke valgt.»` |

- The two compared sources are the pair that lies furthest apart on that row.
- **Only presentation changed.** Preselection, choices, `Neste`, the apply button and the apply call are untouched, along with the 0.01 m tolerance and the 20 m presentation threshold. The browser test confirms GML is still preselected and that both selected positions are applied.

---

## 4. Priority 3: arrow layering, investigated but not implemented

### Why the current structure cannot do it

- Each arrow is drawn inside its own marker's `L.divIcon`.
- Leaflet positions every marker icon with `transform: translate3d(...)` (`DomUtil.setPosition`), and gives it an inline `z-index` (`Marker._updateZIndex`).
- Each icon is therefore its own stacking context. **No CSS can move an arrow below another marker's icon.** It can only sit under its own photo, which it does today.

### Options

| Option | How | Risks |
|---|---|---|
| **A. A separate arrow pane** (recommended if approved) | A new Leaflet pane just below `photo-markers` (z 620). `PhotoMarkersLayer` adds a second non-interactive marker per photo with an arrow-only `divIcon` at the same lat/lng, so it has the same anchor and turns with the existing geometry. Pointer events off, so hit testing is unchanged | Doubles the marker DOM, which is fine at 148 but should be measured at larger layers. **The edit target** (placement pane, z 640) moves during a drag, and a separate arrow would need to follow `drag` events. Simplest is to keep the edit target's arrow inside its own icon, since it is selected and above everything anyway. **Tests:** about 20 selectors in 8 files read `.photo-direction-indicator` inside a marker icon (`photoWorkspaceEditUi` ×8, `photoMarkerProvenanceUi` ×3, `photoMarkerPresentation` ×3, `gmiPhotoPlacementsUi`, `photoDirection`, `photoDirectionUi`, `photoWorkspaceUi`, `gmiPhotoAssociationsUi`). They would need to look up the arrow by photo id instead |
| B. One SVG overlay | Draw every arrow into one SVG (or canvas) layer in a lower pane, re-projected on zoom and move | More code: projection, zoom animation, and thumbnail mode switching. Fewer DOM nodes. The same edit-target and test migration as A |
| C. Arrows only for the selected photo in dense clusters | Hide arrows where markers overlap | Loses information. Not recommended |

**Recommendation:** Option A, as its own approved task, with the edit target keeping its own arrow and the test migration done in the same change. About 60–100 lines of product code plus the test migration. Arrow length, 80% opacity, heading geometry, anchors and edit behaviour stay as they are.

---

## 5. Priority 4: icons

`PhotoExportStatus.js`, `PhotoExportTone`:

- **Blocking (`stop`):** `WarningOctagon` filled becomes **`WarningCircle`, weight `regular`**.
- **Every tone is now `regular`**: wait, good, info, caution, stop and download. This matches the Validator, which uses `weight="regular"` throughout.
- **Colour:** `#b42318` becomes `var(--color-red-700, #b91c1c)`. That is Tailwind `red-700`, the Validator's error text colour (`ValidationV2RuleList`, and `text-red-700` 21 times across the app). The browser test checks the icon colour equals `text-red-700`.
- **Nearby icons:** the hub's `Plassering` completed check and the positioning stage check moved from `fill` to `regular` too.
- **No validation state changed.** Only which icon a tone uses, and how it is drawn.

---

## 6. Tests

### New: `tests/photoAcceptanceRenderingUi.test.mjs`

It is opt-in through `PHOTO_UI_URL` and saves screenshots when `PHOTO_SCREENSHOT_DIR` is set.

| Test | Checks against rendered text |
|---|---|
| `rendered hub: the missing-time explanation follows Mål, and Standard never calls the time optional` | The exact hint for Gemini, Standard and AsBuilt, through changes in both directions. The hub is opened from export, as in acceptance, then on its own. No old copy anywhere in the hub. Standard blocks. Then Leveranse is blocked, with the `stop` icon in `text-red-700` |
| `rendered done screen: …` | Heading, ZIP name, exact warning, no `ol` or `li`, no old copy, buttons `[Last ned på nytt, Lukk]`, and `Last ned på nytt` hands over the same filename again |
| `rendered Kontroll: …` | A generated GML with `far.jpg` 45 m from its own EXIF GPS, `near.jpg` 5 m away, and `none.jpg` with no source. GML preselected for both. `Bør kontrolleres (2)`. The 20 m group with the exact explanation, and a row naming EXIF GPS and the GML with `ca. 44,9 m`. `near.jpg` is not listed. The unplaced group. No move or 0/0 group. Applying gives 2 markers |

**One rounding fix during development:** the 45 m UTM offset measures 44.9 m geodesically, so the test accepts either value.

### Commands

```
npx next build && npx next start -p 3110
PHOTO_UI_URL=http://localhost:3110 PHOTO_GML_FIXTURE='C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml' \
  node --test --test-concurrency=1 <24 files that read PHOTO_UI_URL>        # 140: 139 pass, 1 skip
PHOTO_GML_FIXTURE=<same> node --test <151 other test files>                 # 1,714: 1,702 pass, 7 baseline fail, 5 skip
npx eslint <changed .js/.mjs> ; git diff --check                             # clean
```

The 7 non-browser failures are the established baseline at the same lines: `validationV2WorkspaceInspector` :7, :34, :103; `statsUiContract` :8, :129; `appInfoUiContract` :90; `terrainPhotoGml` :12. The `photoEditCommit` timing failure seen once earlier did not occur.

### Unchanged behaviour

`git diff` touches **none** of these:

- `src/lib/photos/export/` (serializers, package, naming, rules, readiness, plan)
- `photoSession`, `photoEditSession`, `photoAutoMetadata`, `photoPositioning.mjs`, `photoPositionSources`, `photoCaptureMetadata`
- `gmiPhotoSource`, `loadedGmiSource`, parsing, `store.js`, `page.js`

Their suites pass, including the goldens, naming, the edit transactions, the positioning workflow and the corpus.

---

## 7. Changed files

| File | Change |
|---|---|
| `src/components/photos/PhotoPositioningWizard.js` | Kontroll review groups. Stage check icon set to Regular |
| `src/components/photos/photoPositioningWizard.css` | Styles for the review groups |
| `src/components/photos/PhotoExportStatus.js` | `WarningCircle`, every tone Regular |
| `src/components/photos/photoExportWizard.css` | Stop tone uses `--color-red-700` |
| `src/components/photos/PhotoCompletionDetailsPanels.js` | Completed-state check set to Regular |
| `tests/photoAcceptanceRenderingUi.test.mjs` | New |

`git diff --stat`: 5 files, +60/−20, plus the new test and this report.

---

## 8. Screenshots

All from the fresh production build, in `C:\Users\furr_\AppData\Local\Temp\claude\48e85b8705b14ab6\f0dafb95-9e08-43fc-aae5-5ae838a8cb87\scratchpad\shots-visual\`:

| File | Shows |
|---|---|
| `hub-standard-missing-time.png` | Hub with `Skråfoto 2019 (standard)`: the `«Mangler opptakstid»` group with the Standard hint, and `«1 må rettes før eksport»` |
| `export-done.png` | `«ZIP-pakken er klar»`, the ZIP name, the schema warning, `Last ned på nytt` and `Lukk` |
| `positioning-kontroll-review.png` | Kontroll with the 20 m group (EXIF GPS against GML, 44,9 m) and the unplaced group |
| `leveranse-blocked-icon.png` | Leveranse blocked for Standard, with the outlined warning circle |

To regenerate them: set `PHOTO_UI_URL` and `PHOTO_SCREENSHOT_DIR`, and run `tests/photoAcceptanceRenderingUi.test.mjs`.

---

## 9. Remaining issues

1. **Deployment identity (§2).** Confirm which deployment was tested. Consider showing the commit in the app.
2. **Arrow layering (§4)** waits for approval of Option A.
3. **The 20 m threshold** is still a presentation choice of mine.
4. **The positioning scroll-to-top** still has no automated assertion (previous report, 12.4).

## 10. Manual acceptance

1. Open the `3ec86c0` deployment from the Vercel inspector. Download a ZIP with missing times. Expect `«ZIP-pakken er klar»` with no numbered steps.
2. Hub with `Mål: Skråfoto 2019 (standard)`: the missing-time group says the time is required.
3. Torkopp delivery, `Koble og posisjoner bilder`, Kontroll: each listed photo names EXIF GPS and GML and the distance, under an explanation.
4. Leveranse blocked: the icon is an outlined circle, matching the Validator.

No commits or pushes were made. Stopping for review.
