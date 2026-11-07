# FOTO export M6c — Two-screen export wizard

Date: 2026-11-07, Europe/Oslo. Branch `feature/photo-workspace`, starting commit `f7b88b8`. **Nothing was committed or pushed.** Implements §6 M6c of `20261107-162116-photo-export-m6-wizard-planning.md`, on the M6a model and the M6b test helper.

Norwegian text in `«…»` is UI copy.

---

## 1. Summary

**The old export dialog is gone, and the wizard `Leveranse → Pakke` is the only export interface.** The normal path is `Eksporter…`, `Neste`, `Last ned ZIP`. The serializer, plan, package, naming, rules, readiness, export flow, command bar and positioning wizard all have an empty diff.

| Gate | Result |
|---|---|
| All 19 FOTO browser suites, with the real 148-photo corpus | 109 tests: **108 pass, 0 fail, 1 skip** |
| The five migrated suites (part of the above) | **56 of 56** |
| New wizard browser suite (part of the above) | **7 of 7** |
| Export and completion domain, 17 files, including goldens and Gemini compatibility | 337: **332 pass, 0 fail, 5 skip** |
| Non-browser suite, 142 files | 1,591: 1,576 pass, **6 fail (same baseline six)**, 9 skip |
| `next build`, direct ESLint, `git diff --check` | Clean |

**Four things to review:**

1. **A false blocker remains in the hub's footer** (§6, item 1). `PhotoExportStatus` is fixed as you asked, but while a read runs the hub footer still says `«1 må rettes før eksport»`. I saw this in the browser. It is outside the brief, so I left it.
2. **Bulk fill no longer reaches unplaced photos** (§5). The old dialog's fill covered the whole layer, and the hub covers placed photos only. Nothing that gets exported is affected, but it is a real change of behaviour.
3. **One safeguard is unproven** (§4). Removing `'use no memo'` did not fail the stale test, so I cannot show the directive is needed. I kept it as a precaution.
4. **The stale browser test works around the modal** (§4). A person cannot change data while the wizard is open, so the test uses scripted clicks behind the dialog.

---

## 2. Architecture and files

The shell owns the reducer, the async work and the dialog. The two steps only render. Profile, CRS, context and label stay in `photoExportConfigs` in `page.js`, and the plan lives only in the mounted wizard, so closing or going back discards it.

| File | Change |
|---|---|
| `src/components/photos/PhotoExportWizard.js` | **New.** Dialog, reducer, build and download handlers, footers, focus |
| `src/components/photos/PhotoExportDeliveryStep.js` | **New.** Format cards, label, live status |
| `src/components/photos/PhotoExportPackageStep.js` | **New.** Every Pakke state, including import guidance |
| `src/components/photos/photoExportWizard.css` | **New** |
| `src/components/photos/PhotoExportStatus.js` | Holds its answer while reading. Adds `PhotoExportDiagnostics`, shared by both steps |
| `src/lib/photos/photoCompletion.mjs` | Adds `photoExportAwaitingSource` |
| `src/app/page.js` | Mounts the wizard, records the opener for `Eksporter…`, opens the hub through the existing `openCompletePhotoDetails` |
| `PhotoExportDialog.js`, `PhotoEvidenceActions.js`, `PhotoManualFillActions.js`, `photoExport.css` | **Deleted** (staged by `git rm`) |
| `tests/helpers/photoExportWizard.mjs` | Now drives the wizard |
| `tests/photoExportWizardUi.test.mjs` | **New.** 7 browser tests |
| Five browser suites, `tests/photoExportWizard.test.mjs` | See §5 |

**Checked before deleting:** nothing else imported the four files. `planEvidenceAdoption` and `planManualPhotoFill` stay in use by the session, and `.photo-export-status` lives in `photoCompletion.css`.

---

## 3. Screens and interactions

### Leveranse

- Gemini is preselected. Legacy and AsBuilt sit under `Flere formater`, which stays open while one of them is selected, including one chosen in the hub.
- CRS appears only inside a selected Legacy or AsBuilt card.
- Format, CRS and label are kept per layer for the session, and never in browser storage.
- The heading gives the answer, followed by the schema warning, the three status rows, `Fullfør opplysninger…`, the excluded count, blockers, items to check and `Slik blir leveransen`.
- Missing time on Gemini warns, and the button reads `«Fortsett uten opptakstid»`.
- While any layer member is being read, `Neste` is disabled, no blocker or status row is shown, and the screen releases by itself.
- When blocked, `Fullfør opplysninger…` becomes the primary button and the footer gives the reason.

### Pakke

| State | Primary | Secondary |
|---|---|---|
| `building` | None | Avbryt, Tilbake |
| `build-failed`, `plan-errors` | None | Avbryt, Tilbake |
| `ready` | `Last ned ZIP` | Avbryt, Tilbake |
| `stale` | `Oppdater forhåndsvisning` (disabled during a read) | Avbryt, Tilbake |
| `packaging` | `Last ned ZIP`, disabled | Avbryt, Tilbake disabled |
| `packaging-failed` | `Prøv igjen` | Avbryt, Tilbake |
| `done` | `Lukk` | `Last ned på nytt` |

`ready` shows the real ZIP and GML names from `plan.naming`, format, counts, the status component, `Innhold i pakken` and `Tekniske detaljer`. `forekomst` and `feature` appear only under `Tekniske detaljer`.

**Historic import and this package stay separate.** The format row states the past import in a tested setup, and the `Import i Gemini VA` row says this package is not verified. `PHOTO_EXPORT_IMPORT_EVIDENCE` is unchanged.

### Small decisions the plan left open

| Decision | Why |
|---|---|
| `Avbryt` and ✕ stay active during `packaging` | You asked for closing during ZIP generation to be safe, so closing has to be possible |
| The step link `1. Leveranse` works in every Pakke state except `packaging` | `done` has no `Tilbake` in §2.4, and this is the way back from it |
| «En ny pakke får … nye ID-er» is Gemini only | Legacy and AsBuilt IDs are deterministic, so the §3.3 sentence would be false for them. They get a shorter sentence |
| Added «Last ned på nytt gir den samme pakken.» to the done screen | It explains the button next to the sentence about new packages |
| Added «Eksportstatus vises når bildedata er lest.» | The status component needs a line of its own for the hub |
| Size reads `«ca. 12,3 MB bildedata»` | Originals only, as M6a noted, so it does not pose as the ZIP size |
| Focus goes to the heading on each step | §3.1 asked for it, and it also stops a held Enter reaching the next button |
| `Eksporter…` now records its opener | Needed for focus to return to `Verktøy` (§2.5) |

---

## 4. Safety safeguards and evidence

**Mutation checks.** Each fault was applied alone, followed by a fresh production build and the wizard browser suite. Files were restored afterwards and confirmed by checksum.

| Safeguard | Fault | Result |
|---|---|---|
| Check after packaging | Check removed | Caught by the close test |
| Unmount cancels the operation | Cleanup no longer cancels | Caught by the close test |
| Packaging lock | Removed | Caught by the repeated-click test |
| Build guard | Removed | Caught by the repeated-click test |
| Double-click guard on `Neste` | Removed | Caught by the double-click test |
| Wizard hides status while reading | Forced off | Caught by the pending test |
| Status component's own guard | Removed | Caught by the pending test |
| `'use no memo'` | Removed | **Not caught** |

**The miss.** Render reads `plan.isLive()`, which does not depend on props or state, so I expected the compiler to cache it and hide staleness. Removing the directive changed nothing. I then guessed that `try…finally` made the compiler skip this component, and removed that too. The stale test still passed, so that guess was wrong, and **I do not know why it is not cached.** The directive stays because the render really is impure and it costs one line. The stale test would catch a future compiler change either way, so removing it is also defensible.

**Pending EXIF (browser).** With the read held, for all three formats: the heading reads `«Leser bildedata …»`, no text matches `må rettes`, `Kan ikke lages` or `Rett det som mangler`, no status row or diagnostic exists, and `Neste` is disabled. An unplaced photo being read is counted too. On release the wizard moves on without reopening, and a plan built then is `ready`, not stale.

**Closing during ZIP generation (browser).** The file read is held partway through packaging, the wizard is closed by ✕, by `Avbryt` and by Escape, and the read is released. The test waits until the abandoned ZIP has read both originals, then confirms no download started. **The control:** the same hold with the wizard left open gives exactly one download, under the previewed name.

**Repeated clicks (browser).** Three clicks in one tick on `Neste` give one plan, counted by file reads. Three on `Last ned ZIP` give one package and one download.

**Double-click (browser).** Trusted mouse input. The second click of a double-click on `Neste` lands on `Last ned ZIP`, and the test asserts that the two buttons really do share a place. No download starts.

**Stale (browser).** A photo is removed during Pakke. The download and filenames disappear, the alert appears, and the state is still `stale` after a wait, so nothing rebuilds silently. `Oppdater forhåndsvisning` then gives a new plan with a new name. A person cannot reach this, because the wizard is modal. The test script-clicks the real removal flow behind it. No test hook was added to the product.

**Same package again (browser).** `Last ned på nytt` gives the same name and byte-identical blobs. Chrome does not write a second numbered file here, so the test compares what was handed to the browser, not what reached disk.

**Dialog swap (browser).** §4.4 trap 3, wizard to hub direction: the hub is still open 800 ms after the swap, so a late `close` event does not reach it. The hub to wizard direction belongs to M6d.

---

## 5. Intentional test changes

No test was removed or skipped. `assert` calls went up in the changed suites and stayed level in the fifth:

| Suite | Before | After |
|---|---|---|
| `photoCompletionUi` | 114 | 118 |
| `photoEvidenceUi` | 22 | 23 |
| `photoExportFlowUi` | 133 | 135 |
| `photoLoadedGmiUi` | 78 | 87 |
| `photoWorkspaceEditUi` | 163 | 163 |

### The two special scenarios

| Scenario | What changed | What it proves now |
|---|---|---|
| `photoLoadedGmiUi`, AsBuilt | All seven fields filled through the hub, reached by `Fullfør opplysninger…`, then export reopened | Format is kept, the wizard reports no `invalid-context`, and the AsBuilt ZIP contains the project, date, dataset, reason and condition values. Stronger than before, which checked the dataset only. The ZIP name carries the label |
| `photoCompletionUi`, shared context | Two-way editing replaced by one-way | The wizard shows the hub's target, has no context form, and lists exactly the missing fields. An edit in the hub shortens that list, and the hub still holds the value afterwards. **The `one set of delivery values` assertion is kept**, with its direction reversed. This layer cannot build AsBuilt because times are missing, so the package check lives in the row above |

### Every other change

| Test | Before | After | Reason |
|---|---|---|---|
| `photoCompletionUi`, shared context | Export profile is `''` | Inverted: shows `asbuilt52` | Wizard reads config |
| `photoLoadedGmiUi`, dual export | Profile `''`, preview disabled | Inverted: earlier format kept, Gemini can advance | Default wired up |
| `photoLoadedGmiUi`, bulk readiness | Fill in the dialog, `2 manglende` per field | Fill in the hub, `1` per field | Fill moved to the hub. **See below** |
| `photoLoadedGmiUi`, bulk readiness | Preview built while blocked | Blockers read on Leveranse, `Neste` asserted disabled | Plan row |
| `photoLoadedGmiUi`, bulk readiness | Plan disappears after each fill, `Lag eksportforhåndsvisning igjen` | **Dropped.** Fill now happens with no plan open, so this cannot occur | Replaced in substance by the stale test |
| `photoLoadedGmiUi`, canonical metadata | Fill reaches every row | Placed rows filled, unplaced rows asserted unchanged | **See below** |
| `photoLoadedGmiUi`, dual export | `4 planlagte features · 3 vedlegg · 1 delte originalbilder` | Same counts under `Tekniske detaljer`, plus the main count line | New wording |
| `photoLoadedGmiUi`, dual export | `Gemini-kompatibilitet er ikke verifisert` | `Ikke testet med import i Gemini VA.` | Old copy gone, per plan |
| `photoLoadedGmiUi`, dual export | A new label removes the preview | Going back to change it discards the plan | Plan row |
| `photoLoadedGmiUi`, dual export | `innerText` for `EPSG:5972` and `Eksperimentell 2D` | `textContent` | Now in a closed disclosure |
| `photoEvidenceUi`, first test | `GML-retning: 0 kan brukes · 3 allerede godtatt` | Every list row shows an accepted direction | Adoption rows are gone. Photos here are unplaced, so the hub has no rows for them |
| `photoEvidenceUi`, corpus | Rows show `0 kan brukes · N allerede godtatt` | Hub counts `N` from source, for time and direction, with no adoption button | Plan row |
| `photoEvidenceUi`, corpus | Diagnostic summary by `innerText` | `textContent` | Closed disclosure |
| Three suites | `chooseFormat(gemini)` | `selectedFormat === gemini` | It is now the default |

**Bulk fill and unplaced photos.** The old `2 manglende` counted one placed and one unplaced photo. The hub lists placed photos only, so it shows `1`, and the unplaced photo keeps its gap until it is placed or edited on its own. The per-photo `Rediger opptaksdata…` dialog still reaches it. Unplaced photos are never exported, so no package changes. The plan said the hub "covers what remains", which holds for export but not for this one case. **If whole-layer fill matters, it needs a place in the hub.**

### Helper and domain tests

- `setContextField` is removed. Added: `backToDelivery`, `selectedFormat`, `deliveryState`, `canAdvance`, `packageState`, `readZip`, `openCompletionFromExport`, `fillContextInHub`.
- `chooseFormat` opens `Flere formater` as a user would, and `buildPreview` throws when the wizard cannot advance.
- Domain tests: 2 added (51 in the file). The wording scan now covers the three components. A new boundary test checks that they write no metadata, call no session method and use the plan's filename.

---

## 6. Findings for you

1. **Hub footer false blocker.** `photoCompletionStatus` feeds the hub's footer and has no reading state, so `«1 må rettes før eksport»` shows during a read. `Fullfør opplysninger…` stays available while reading, so a user can land on it from the wizard. I recommend M6e, with one question: should the hub get the same `Leser bildedata …` line?
2. **`Slik blir leveransen` still shows M6a's singular errors** on one photo, such as `«1 punkter får Z=0»`. Left for M6e, as M6a planned.
3. **`Tekniske detaljer` still shows the Q7 contradiction,** `Gemini-kompatibilitet er ikke verifisert`, and other `Eksperimentell` warnings. They come from the plan. No test pins that phrase any more, so Q7 is now a one-line change.
4. **The format card title wraps under its radio** at every width I looked at. Cosmetic, for M6e.

---

## 7. Verification

Production build on `http://localhost:3110`, `PHOTO_GML_FIXTURE` set to the Ekenesstokken corpus, `--test-concurrency=1` for browser suites. The final build followed the last source change.

The one browser skip is `private G01/G04 browser`, a GMI association test outside the export path. I did not look into why it skips.

**Screens viewed** in real Chrome: Leveranse at 1680×900 and 1093×510, and reading, Pakke and done at 1680×900. Footer and primary button stayed visible at 1093×510. Screenshots were also taken at 1280×720 and 800×700, and for blocked Legacy and Pakke at 1093×510, but I did not open those. The suite's bounds check covers Pakke at 1280×720.

### Baseline failures, reported separately and not touched

The same six as M6a and M6b, by name and line:

| File | Line | Test |
|---|---|---|
| `validationV2WorkspaceInspector.test.mjs` | 7 | normal sidebar width is preserved and shared by the Validator and docked inspector |
| `validationV2WorkspaceInspector.test.mjs` | 34 | workspace shell places a full-height left list beside a shared upper row and full-width bottom dock |
| `validationV2WorkspaceInspector.test.mjs` | 103 | 2D map resize invalidation and parent-sized 3D canvas remain in place |
| `statsUiContract.test.mjs` | 8 | statistics UI exposes the Norwegian uptake and kommune controls |
| `statsUiContract.test.mjs` | 129 | Stats trigger visibility follows table, docked inspector, and profile ownership only |
| `appInfoUiContract.test.mjs` | 90 | working header stays above one conditional feature branch with full-height normal resize reach |

`npm run lint` still does not work, as M6a reported, so ESLint was run directly on all changed files.

### Protected paths

`git diff HEAD` is empty for `src/lib/photos/export`, `photoExportFlow.mjs`, `photoExportWizard.mjs`, `photoExportConfig.mjs`, `PhotoEditCommandBar.js`, `PhotoPositioningWizard.js` and `tests/fixtures`. Gemini XML, UUID generation, attachment paths, naming and metadata acceptance are therefore unchanged, as is Save/Discard.

### Not run

The XSD harness and a real Gemini VA import. V1 stays open. No person has reviewed the screens.

---

## 8. Remaining work

**M6d:** `photoExportReturn`, `Tilbake til eksport`, `Gå til eksport` (Q6) and every §2.5 exit. Hub-to-wizard swap test. Today `Fullfør opplysninger…` is one-way, so a user must reopen `Eksporter…`. Format and label are kept meanwhile. The helper's `openCompletionFromExport` comment and the two scenarios that reopen export will need updating.

**M6e:** the §3.1 viewport matrix, wording (Q7, singulars, the `invalid-context` label), §6 items 1 and 4, the label typing check on the corpus and the XSD harness.

**V1:** real Gemini VA import, unchanged.

---

## 9. Manual browser acceptance

Use the contractor delivery of 40 photos and the 148-photo corpus.

1. `Eksporter…`: Gemini is selected, and the card reads as a past test, not a promise.
2. Contractor delivery: the heading shows the schema gap and the count of photos without time. The three status rows read separately.
3. `Fortsett uten opptakstid`: ZIP and GML names match, in Norwegian time, and the warning is still there.
4. `Last ned ZIP`: the saved name matches, the GML inside matches, and `Attachments` sits beside it. Read the guidance.
5. `Last ned på nytt`: same package. `Tilbake` by the step link, then `Neste`: new timestamp.
6. Type `  Grøft / nord  ` and check the hint shows `-Groeft-nord`. Then type `///`.
7. Choose Legacy with times missing: `Neste` is disabled and the reason is clear. `Flere formater` cannot be folded away.
8. Open the wizard straight after importing the 148 photos. Check for `Leser bildedata …`, no blockers, and that it releases itself.
9. Corpus: click `Last ned ZIP`, then close at once. No file should arrive. On the corpus this window is about a second.
10. AsBuilt: `Fullfør opplysninger…`, fill `Leveranseopplysninger`, close, reopen `Eksporter…`, export.
11. Double-click `Neste`, and check no download starts.
12. Escape from each screen. Focus returns to `Verktøy`.
13. Read every screen for tone: too technical, or too confident?

No commits or pushes were made. Stopping here for review.
