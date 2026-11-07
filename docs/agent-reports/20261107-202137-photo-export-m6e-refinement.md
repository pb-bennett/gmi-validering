# FOTO export M6e — Wizard refinement and final QA

Date: 2026-11-07, Europe/Oslo. Branch `feature/photo-workspace`, starting commit `6538f96`. **Nothing was committed or pushed.** Implements M6e of `20261107-162116-photo-export-m6-wizard-planning.md`, on M6c and M6d.

Norwegian text in `«…»` is UI copy. "Hub" means `Fullfør opplysninger…`.

---

## 1. Summary

**The two-screen wizard is finished and ready for your review.** It fits every planned size with the footer buttons visible, and the wording, the hub's false blocker and the dialog-close bug are all fixed. The serializers, attachments, naming, rules, readiness, session and goldens have an empty diff.

| Gate | Result |
|---|---|
| All 23 browser suites, with the real 148-photo corpus | 134 tests: **133 pass, 0 fail, 1 skip** |
| Non-browser suite, 150 files, including goldens and Gemini compatibility | 1,710 tests: 1,699 pass, **7 fail (all seven pre-existing, §7)**, 4 skip |
| `next dev` dialog smoke test | **1 of 1** (failed before the fix) |
| `next build`, direct ESLint, `git diff --check` | Clean |
| Mutation checks, one fault at a time on a fresh build | 5 of 5 caught |
| External XSD harness, on fresh GML | 9 of 9 expected outcomes (§6) |

**Five things to review:**

1. **I changed three strings the plan said to reuse unchanged** (§3): the schema warning, the blocked status row and the recommendation heading. You asked for less repetition, and the warning said the same thing as the heading. Pinned tests were updated on purpose.
2. **The review found a real defect in the failed-commit path, and I fixed it** (§5). It goes slightly beyond "review". A refused commit left the session registered, which held back automatic metadata for that layer.
3. **Neither failed-commit path can be reached from any screen** (§5). Their tests inject a fault. The retry after a conflict has no browser test.
4. **Each Leveranse column now scrolls by itself** (§2). This is new behaviour. It keeps the status in view while the format list scrolls.
5. **No person has reviewed this.** Zoom was emulated, not operated by hand (§7). V1 stays open.

---

## 2. Layout

| Change | Why |
|---|---|
| Radio in its own column, title and text aligned beside it | Fixes the title wrapping under the radio. The Gemini title and badge now fit on one line, and the badge wraps cleanly when a scrollbar narrows the card |
| Icon and colour on each heading, by state | Waiting, ready, check, schema gap and blocked read differently at a glance. Icons are hidden from screen readers, because they repeat the heading |
| Soft background on the format column, divider, framed status rows | Separates the choice from the answer |
| Blockers and checks come before `Fullfør opplysninger…` | The reader sees what is wrong, then the action |
| Columns scroll separately | With `Flere formater` open, the left column is long. The answer stays visible when a format is chosen further down |
| Compact chrome under 750 px height | Layer name joins the title, and header, steps and cards are tighter |
| Warning text at weight 500, not 600 | A long bold paragraph was hard to read |
| Stronger hover and pressed colour on primary buttons, hover border on cards, visible focus on radios and folds | The old hover was a faint opacity change |
| Filenames and guidance in a soft panel on Pakke | Makes what matters stand out |

Colours use the existing `--gmi-*` tokens and the green and amber already used by the hub. The one new value is the red `#b42318` on the blocked icon, because the theme has no red token.

### Measured sizes

`tests/photoExportLayoutUi.test.mjs` runs every state at every size below. It checks that the dialog is inside the window, every footer button is reachable by `elementFromPoint`, nothing overflows or clips sideways, and content that does not fit can be scrolled.

Height of the status column, visible/content, in pixels:

| Viewport | Represents | Leveranse, gap | Pakke, ready |
|---|---|---|---|
| 1920×1080 | Desktop | 588/588 | 588/588 |
| 1536×760 | Desktop at 125% | 542/542 | 542/542 |
| 1536×730 | Laptop, Windows 125% | 562/562 | 562/562 |
| 1366×768 | Laptop | 549/549 | 549/549 |
| 1366×625 | Same, less browser chrome | 463/463 | 463/463 |
| 1229×585 | Windows and browser both 125% | 425/425 | 425/425 |
| 1093×510 | Small laptop at 125% | 355/355 | 355/355 |
| 800×700 | One column | 534/567, one scroller | 534/534 |
| 390×700 | Phone | 488/742, one scroller | 534/534 |

**The status column does not need to scroll at any two-column size, in these fixtures.** Only the left column scrolls, and only with `Flere formater` open (for example 357/594 at 1093×510). A delivery with several blocker groups open will scroll. The hub scrolls in its panel from 1366×625 down, and its footer stays in view. On a phone the hub's task list scrolls sideways, by existing design, so the test measures the panel only.

---

## 3. Wording

| Item | Before | After |
|---|---|---|
| Singular | `1 punkter`, `1 originalbilder`, `1 godtatte fotografverdier` | `1 punkt`, `1 originalbilde`, `1 godtatt fotografverdi` |
| Technical details | `1 delte originalbilder`, `1 features` and others | `1 delt originalbilde`, `1 feature` |
| Recommendation heading | `Kan eksporteres, men 1 kan forbedres` | `«Kan eksporteres, men noe bør kontrolleres»` |
| Q7, `experimental-mapping` | Ended `Gemini-kompatibilitet er ikke verifisert.` | Sentence removed. Text only |
| `invalid-context` label | `Påkrevd AsBuilt-kontekst` | `«Leveranseopplysninger mangler»` |
| Blocked status row | `Kan ikke lages ennå: 10 må rettes` | `«Kan ikke lages ennå»`. The count stays in the heading |
| Schema warning | `3 bilder mangler full opptakstid. Eksporten kan lages, men GML-filen oppfyller ikke kravet til opptakstid i Skråfoto 2019-skjemaet. Det er ikke verifisert at Gemini VA godtar en slik pakke.` | `«3 bilder mangler full opptakstid, så GML-filen oppfyller ikke Skråfoto 2019-skjemaet. Det er ikke verifisert at Gemini VA godtar en slik pakke.»` |
| Guidance, Legacy and AsBuilt | `GML-filen og Attachments-mappen …` | `«{gmlFilename} og Attachments-mappen …»` |

- **Singular handling** is one table in `singularCopy`, applied when text is shown. The messages in readiness and the plan are unchanged, so that file stays within Q7. `PhotoExportDiagnostics` now applies it as well, which covers plan warnings.
- **The recommendation count was misleading** because it counted categories. One category with 14 photos read `1 kan forbedres`. Categories overlap and mix photos with placements, so a total cannot be right. The heading now gives no number, and the list below gives each real count. The hub footer has no such list beside it and shows the same line.
- **Gemini guidance already named the real GML.** Only the other two formats did not. A browser test now pins Legacy.
- **No certainty claims.** The existing banned-word test still passes, and `Ikke verifisert for denne pakken` is unchanged.

---

## 4. Hub reading state and dialog closing

### Pending EXIF in the hub

`photoCompletionStatus` now takes the reading count and returns `«Leser bildedata …»` before anything else. The hub shows that in a muted style with `«3 bilder er ikke ferdig lest. Kontrollen oppdateres av seg selv.»`, and the footer updates when the read ends, with no reopening.

The count comes from a new shared `photosBeingRead`, which looks at the **whole layer**, as the wizard does. The hub's status block in Opptakstid uses the same count, so an unplaced photo being read cannot make the footer and panel disagree.

### `PhotoCaptureMetadataDialog`

**Reproduced on `next dev`:** `Rediger opptaksdata` closed before the test could see it. I applied the same `live` and `!open` guard as the other two dialogs. The dialog is now stable and still closes by `Avbryt`, Escape and a close the browser makes itself, and the hub stays open behind it.

`tests/photoDialogDevUi.test.mjs` covers this, along with the wizard and hub. It needs `PHOTO_DEV_UI_URL`, skips without it, and asserts that it really is on dev.

**A trap for anyone extending that test.** With scripted clicks, one Escape closed the hub as well. I believe Chrome groups the close watchers of dialogs opened without user activation, which is an inference from the behaviour. With a trusted click the problem went away, so the test uses trusted input and I do not consider it an app bug.

---

## 5. Failed map-edit commits

**Finding: a registration leak.** `savePhotoEdits` clears the ticket ref before committing. On a failure other than conflict, `endPhotoEditSession` then found no ticket and never released it. For `session-ended` that is harmless. For `invalid-change` the ticket is still live, so `autoAcceptMetadata` keeps skipping the layer. A browser test shows the effect: a photo that finished reading during the session never got its default direction, and Gemini then reported a real-looking blocker.

**Fix.** Both paths had the same four statements, so they now call one `abandonPhotoEdits(ticket)`, which puts the ticket back first. `endPhotoEdits` is a no-op for a ticket that has ended. `photoSession.mjs`, `photoEditSession.mjs` and the command bar have no diff, so the M4 transaction is unchanged.

**Reachability.** No screen can trigger these paths today. `stage()` validates each value, so even the page's own `onStage` cannot stage an invalid one, and the subscriber clears a ticket that has ended. They are defensive code.

**Coverage.**

| Path | Coverage |
|---|---|
| `savePhotoEdits`, by the bar | Browser, fault injected |
| `savePhotoEdits`, by the boundary | Browser, fault injected |
| Retry after a conflict | **No browser test.** No screen can produce the conflict. A source test confirms it calls the same function |

The fault is a real staged change and a real Save, with `Number.isFinite` returning false for that one click, so the session refuses with the ticket live. The tests confirm nothing is saved, no dialog opens, the notice appears, settings stay, and the journey ends: `Fullfør opplysninger…` then shows `Gå til eksport` and `Lukk`. The leak test stages through `onStage` found in the React fiber. No test hook was added to the product.

### Mutation checks

Each fault was applied alone, followed by a fresh build, and restored by checksum.

| Fault | Result |
|---|---|
| A. `abandonPhotoEdits` does not release the ticket | Caught |
| B. `abandonPhotoEdits` does not end the trip | Caught |
| C. Hub ignores reading | Caught |
| D. Card rule also hits the CRS label | Caught |
| E. Step body no longer contains its content | Caught, 2 tests |

Fault D is a regression I introduced and then saw in a screenshot, because the layout test missed it. The check was added for that reason. The metadata guard needed no mutation: the same test failed before the fix and passes after it.

---

## 6. Export and compatibility

**No diff** in `photoExportXml`, `photoExportPackage`, `attachmentNames`, `exportContract`, `photoExportNaming`, `photoExportRules`, `photoExportReadiness`, `photoExportFlow`, `photoEditSession`, `photoSession`, `PhotoEditCommandBar`, `PhotoEditBoundaryDialog`, `PhotoPositioningWizard` or `tests/fixtures`.

`photoExportPlan.mjs` has one changed string (Q7). `photoExportDiagnostics.mjs` has one changed label. The package ignores `plan.warnings`, so no bytes change. Gemini default, missing-time policy, M5 names, UUIDs, all three profiles and the goldens are all covered by passing suites.

### XSD harness, reported separately

**Available, and run.** `%TEMP%/photo-dual-export/validate.py` ran **unmodified** on a copy of its folder, with `TEMP` redirected, so the old GML there was not used. Inputs were fresh output from this working tree, through the real plan and package. lxml 6.1.3, libxml2 2.11.9, 57 resolved dependencies from the offline cache.

| Input | Expected | Result |
|---|---|---|
| Legacy, EPSG:25832 and 25833 | Valid | Valid |
| AsBuilt, EPSG:25832 and 25833 | Valid | Valid |
| AsBuilt, unknown direction | Valid | Valid |
| Four deliberately broken documents | Rejected | Rejected |

**9 of 9 means expected outcomes, not nine valid deliveries.**

The harness has no Gemini check, and the earlier one no longer exists. I added a 25-line check in the session scratchpad, outside the repository, against the same schema and cache. It is an addition and not part of the harness.

| Gemini input | Expected | Result |
|---|---|---|
| Fixture, all times | Valid | Valid |
| Fixture, one missing | Invalid | Invalid, 1 error, a missing child element |
| **Real wizard download**, all times | Valid | Valid |
| **Real wizard download**, one missing | Invalid | Invalid, 1 error, a missing child element |

This matches the wizard's warning. It says nothing about import. **Real Gemini VA import remains V1, and has not been run.**

---

## 7. Verification

Production build on `http://localhost:3110`, `PHOTO_GML_FIXTURE` set to the Ekenesstokken corpus, `--test-concurrency=1` for browser suites. The last source edit came before the final build, and all results below are from that build, apart from the dev smoke test, which ran on `next dev`.

- **Corpus.** The 148-photo suites ran and passed, including `private corpus in the real app`, which reaches a downloaded Gemini package.
- **Label typing on the corpus** (plan §6). 23 trusted key presses at 1366×625: median 38 ms, worst 48 ms, from key to painted frame, including the debugging round trip. No lag, so commit-on-blur is not needed.
- **Keyboard.** At 1093×510, each Tab stop on Leveranse is on screen, inside its scroller, and shows focus. Escape closes, and focus returns to `Verktøy`. M6d's whole-trip keyboard, focus and repeated-Escape tests still pass.
- **Skip.** `private G01/G04 browser`, as before.

### New and changed tests

| File | Change |
|---|---|
| `tests/photoExportLayoutUi.test.mjs` | **New.** Every state at nine sizes, keyboard at laptop size, screenshots with `PHOTO_SCREENSHOT_DIR` |
| `tests/photoDialogDevUi.test.mjs` | **New.** `next dev` smoke test |
| `tests/photoExportWizardUi.test.mjs` | Two tests added: hub reading, ticket release. One pinned warning updated |
| `tests/photoExportReturnUi.test.mjs` | One test added: failed commit, bar and boundary |
| `tests/photoExportWizard.test.mjs` | Six tests added. Three expected headings updated |
| `tests/photoCompletion.test.mjs` | Singular cases added. One pinned warning updated |
| `tests/photoCompletionUi.test.mjs` | One pinned warning updated |
| `tests/photoLoadedGmiUi.test.mjs` | Pinned singular updated. Legacy guidance assertion added |

No test was removed or skipped.

### Failures not caused by this work

The same seven as M6d. **None is new**: same files and lines, none touching this work. I did not re-run them on a clean checkout, and rely on M6d's check for the seventh.

| File | Line | Test |
|---|---|---|
| `validationV2WorkspaceInspector.test.mjs` | 7 | normal sidebar width is preserved and shared by the Validator and docked inspector |
| `validationV2WorkspaceInspector.test.mjs` | 34 | workspace shell places a full-height left list beside a shared upper row and full-width bottom dock |
| `validationV2WorkspaceInspector.test.mjs` | 103 | 2D map resize invalidation and parent-sized 3D canvas remain in place |
| `statsUiContract.test.mjs` | 8 | statistics UI exposes the Norwegian uptake and kommune controls |
| `statsUiContract.test.mjs` | 129 | Stats trigger visibility follows table, docked inspector, and profile ownership only |
| `appInfoUiContract.test.mjs` | 90 | working header stays above one conditional feature branch with full-height normal resize reach |
| `terrainPhotoGml.test.mjs` | 12 | actual browser XML parser, File/EXIF and session integration (`Failed to fetch dynamically imported module … photoSpatialChecks.mjs`) |

`npm run lint` still does not work, as earlier reports noted, so ESLint was run directly on all changed files.

### Not done

- **125% zoom was emulated**, as the plan specified: the CSS viewport shrunk, with device scale 1.25 for the screenshots. Nobody pressed Ctrl-plus in a real window.
- **Hover states are CSS only.** No test asserts them, and no screenshot shows them.
- **No screen reader test.**
- **Only the export-path dialogs were run on dev**, not the whole suite.

---

## 8. Screenshots

Temporary, not committed, in the session scratchpad:

`C:\Users\furr_\AppData\Local\Temp\claude\48e85b8705b14ab6\55907cc2-e1a7-41cb-9c58-c2db31379533\scratchpad\m6e-review-screenshots\`

| File | Screen | Viewed by me |
|---|---|---|
| `1-leveranse-ready.png` | Leveranse, normal ready state | Yes |
| `2-leveranse-gemini-missing-time.png` | Gemini with missing times | Yes |
| `3a-leveranse-legacy-blocked.png` | Legacy blocked | Yes |
| `3b-leveranse-asbuilt-blocked.png` | AsBuilt blocked | Yes |
| `4-pakke-ready.png` | Pakke, ready | Earlier version only |
| `5-pakke-done.png` | Pakke, after download | Yes |
| `6-hub-from-export.png` | Hub reached from export | At laptop size (7e) |
| `7a-leveranse-laptop-1366x625.png` | Laptop | Yes |
| `7b-pakke-small-laptop-125.png` | Pakke at 1093×510, scale 1.25 | Yes |
| `7c-leveranse-small-laptop-125.png` | Leveranse at the same size | Earlier version only |
| `7d-leveranse-asbuilt-small-laptop-125.png` | AsBuilt at the same size | Yes |
| `7e-hub-small-laptop-125.png` | Hub at the same size | Yes |

To regenerate them: set `PHOTO_UI_URL` and `PHOTO_SCREENSHOT_DIR`, then run `tests/photoExportLayoutUi.test.mjs`.

---

## 9. Remaining issues

**Compatibility restrictions, unchanged:**

- Real Gemini VA import is unverified. V1a renamed GML, V1b missing time and V1c default direction are all open.
- Missing capture time stays allowed for Gemini, with a warning. The package then fails the Skråfoto 2019 schema, as §6 shows.
- `Importert i testet oppsett` reports a past import and says nothing about the next package.

**Small items left alone:**

1. **`Tekniske detaljer` still has `Eksperimentell …`, `testkonvensjon` and `denne testeksporten`.** They are plan warnings, and your approval covered Q7 only. Each is a one-line change if you want them gone.
2. **The heading text for recommendations is my wording.** `«Kan eksporteres, men noe bør kontrolleres»` is the line most worth a native reader's check.
3. **✕ keeps the name `Lukk Fullfør opplysninger` during a journey**, as M6d raised.
4. **`PhotoPositioningWizard` and `PhotoLayerCard` can still show `1 bilder`.** They are outside the export path.
5. **I searched only for the exact `onClose={onClose}` pattern.** Other `showModal` dialogs were not run on dev.
6. **Held Escape still walks out step by step** (M6d). Bulk fill still skips unplaced photos, as agreed.
7. **`'use no memo'` stays unproven** (M6c).

---

## 10. Manual acceptance

Use the contractor delivery of 40 photos and the 148-photo corpus.

1. Open `Eksporter…` on a real laptop at 100%, then at 125% with Ctrl-plus. Footer buttons stay visible, and the title sits beside its radio.
2. Contractor delivery: read the heading, warning and status rows together. Is anything still said twice?
3. Hover and Tab across cards and buttons. Are the states clear enough?
4. Choose AsBuilt, scroll the left column, and check that the status stays put. Does separate scrolling feel natural?
5. Open the hub straight after importing the 148 photos. The footer shows `Leser bildedata …`, never `må rettes`, and settles by itself.
6. Run once on `next dev`: open `Rediger…` in the hub and from the inspector. Both stay open.
7. One placed photo: open `Slik blir leveransen` and `Tekniske detaljer`, and read the singulars.
8. Legacy or AsBuilt download: the guidance names the real GML.
9. Read every screen for tone: too technical, or too confident?
10. Keyboard only, ideally with a screen reader.
11. **Deferred: V1.**

No commits or pushes were made. Stopping here for review.
