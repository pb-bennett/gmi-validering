# FOTO export M6b — Export wizard test migration

Date: 2026-11-07, Europe/Oslo. Branch `feature/photo-workspace`, starting commit `86baec4`. **Nothing was committed or pushed.** Implements §6 M6b of `20261107-162116-photo-export-m6-wizard-planning.md`, with the gates of §7.1.

---

## 1. Summary

**The five browser suites now drive the existing export dialog through one shared helper, and their results are unchanged.** There is no change to production code, export rules, serializers, readiness, navigation or the M6a model. `git diff` is empty for `src` and `tests/fixtures`.

| Measure | Before | After |
|---|---|---|
| Five browser suites, with the real 148-photo corpus | 56 of 56, 0 skipped | **56 of 56, 0 skipped** |
| Test names and results | | **Identical** (compared by `diff`) |

**Three things to review:**

1. **The plan does not list the AsBuilt context as an intentional test change, but M6c will have to change it** (§6, item 1). This is the main finding.
2. **I added two helper operations beyond the seven proposed:** `setContextField` and `canDownload`, plus the exported `exportDialog` selector (§2).
3. **The migration made some waits stricter or longer** (§4). No wait became shorter, and no assertion became weaker.

---

## 2. Helper

`tests/helpers/photoExportWizard.mjs` is new, at 60 lines.

| Export | What it does on the old dialog |
|---|---|
| `exportDialog` | Selector expression, replacing six local copies and two inline ones |
| `openExport(browser)` | `Verktøy` → `Eksporter…`, then waits for the dialog |
| `chooseFormat(browser, profile)` | Sets `Eksportprofil` |
| `setLabel(browser, label)` | Sets `Eksportetikett` |
| `setContextField(browser, field, value)` | **Added.** Sets an AsBuilt field, such as `Prosjektnavn` |
| `buildPreview(browser)` | Clicks `Lag eksportforhåndsvisning`, waits for the section and for `Bygger forhåndsvisning` to go |
| `previewNames(browser)` | Returns `{ zip, gml }` from `data-export-zip` and `data-export-gml` |
| `canDownload(browser)` | **Added.** Whether `Last ned testpakke` is enabled. Replaces three copies of the same expression |
| `downloadZip(browser, directory)` | Saves the ZIP and returns `{ zip, gml, entries }`. Replaces three copies of the polling loop |
| `closeExport(browser)` | Clicks `Lukk eksport`, waits until the dialog is gone |

**Why the additions:** both were repeated in the suites and name the old dialog's controls, so leaving them out would have put old-dialog details into M6c's diff.

**Deliberately left out of the helper:**

- **Reading diagnostics, status rows and counts.** These are the behaviour under test, so they stay visible in the suites.
- **Opening export where a boundary must stop it.** `photoExportFlowUi:383,390` and `photoWorkspaceEditUi:414` expect the dialog *not* to open, so `openExport`, which waits for it, would be wrong. They still use `openTool`.
- **The assertions M6c inverts.** For example, `photoCompletionUi:318` and `photoLoadedGmiUi:206-207` stay as plain assertions, so the inversion appears in M6c's diff.

---

## 3. Tests migrated and assertions preserved

| Suite | Tests | `assert` calls before | After | Migrated |
|---|---|---|---|---|
| `photoCompletionUi` | 10 | 115 | 114 | Shared-context scenario, corpus download |
| `photoEvidenceUi` | 2 | 23 | 22 | Both open steps, corpus download |
| `photoExportFlowUi` | 13 | 133 | 133 | Boundary-to-export scenario, plan after Save |
| `photoLoadedGmiUi` | 10 | 78 | 78 | Bulk readiness, whole-layer fill, three-profile export |
| `photoWorkspaceEditUi` | 21 | 163 | 163 | Selector only, because this suite never builds a plan |

"Tests" counts `test`, `layerTest` and `t.test` declarations in the source. They add up to the 56 the runner reports, before and after.

**The two missing `assert` calls are not lost.** Both were `assert(zip, 'ZIP download not completed')`. That check now lives in `downloadZip`, which throws the same message.

**Equivalent rewrites:**

| Before | After |
|---|---|
| `assert(… 'Last ned testpakke' … .disabled)`, twice | `assert(!await canDownload(browser))` |
| `assert.equal(… .disabled, false)` | `assert(await canDownload(browser))` |
| `gmlName`, a shared variable reassigned by each download | `legacy.gml`, `gemini.gml`, `modern.gml`, each tied to its own package |

No test was removed, skipped or loosened.

### Mutation check on the helper

Moving logic into a helper can stop it from failing when it should. I broke the helper in four ways, ran `photoLoadedGmiUi` for each, and restored the file, confirming it matched byte for byte.

| Fault | Result |
|---|---|
| `canDownload` always true | Caught |
| `previewNames` swaps ZIP and GML | Caught, by the filename pattern |
| `setLabel` does nothing | Caught, by `a new label needs a new preview…` |
| `chooseFormat` always picks Legacy | Caught |

---

## 4. Small differences in test behaviour

These come from sharing one implementation. Each is the same as or stricter than before, except where the limit is noted as longer.

| Change | Affects | Effect |
|---|---|---|
| `openExport` always waits for the dialog | `photoLoadedGmiUi`, which did not wait in two places | Stricter |
| `closeExport` always waits for it to close | `photoLoadedGmiUi`, which did not wait | Stricter |
| `buildPreview` also waits for `Bygger forhåndsvisning` to go | `photoExportFlowUi`, first `photoLoadedGmiUi` scenario | Stricter |
| The photo-workspace check looks for any export dialog, not only `[open]` | `photoWorkspaceEditUi` | Stricter |
| `setContextField` and `setLabel` search the dialog, not the document | `photoLoadedGmiUi` | Stricter |
| Failure limits are 120 s for preview and download, and 30 s for the file to arrive | `photoExportFlowUi`, `photoLoadedGmiUi`, which had 30 s and 10 s | **Longer, only on failure.** A passing wait returns at once. The corpus suites already used these values |
| `Browser.setDownloadBehavior` is set inside `downloadZip` | The three suites that download | Set just before the click, not earlier. A caller can no longer forget it |
| The value is always set through the native setter | `photoEvidenceUi`, `photoLoadedGmiUi` | The other suites already did this |

---

## 5. Verification

All runs used a production build on `http://localhost:3110`, with `PHOTO_GML_FIXTURE` set to the real corpus and `--test-concurrency=1` for browser suites. The baseline was run on the unmigrated suites, on the same build.

| Check | Result |
|---|---|
| Five browser suites, baseline | 56 of 56, 0 skipped |
| Five browser suites, migrated | **56 of 56, 0 skipped.** The three corpus tests ran, including both real ZIP downloads |
| Export and completion domain, 18 files, including goldens, parity, package, serializers, Gemini compatibility and `photoExportWizard` | 364: **359 pass, 0 fail, 5 skip** |
| Non-browser suite, 142 files | 1,589: 1,574 pass, **6 fail (baseline, below)**, 9 skip. Same totals as M6a |
| `next build`, after the migration | Passes |
| ESLint on the six test files, run directly | 0 errors, 0 warnings |
| `git diff --check` | Clean |
| `git diff` on `src` and `tests/fixtures` | Empty |

The domain file set is wider than M6a's 16, as I selected it by filename, so its total is not directly comparable.

### Baseline failures, reported separately and not touched

These are the same six as M6a, by name and by line.

| File | Line | Test |
|---|---|---|
| `validationV2WorkspaceInspector.test.mjs` | 7 | normal sidebar width is preserved and shared by the Validator and docked inspector |
| `validationV2WorkspaceInspector.test.mjs` | 34 | workspace shell places a full-height left list beside a shared upper row and full-width bottom dock |
| `validationV2WorkspaceInspector.test.mjs` | 103 | 2D map resize invalidation and parent-sized 3D canvas remain in place |
| `statsUiContract.test.mjs` | 8 | statistics UI exposes the Norwegian uptake and kommune controls |
| `statsUiContract.test.mjs` | 129 | Stats trigger visibility follows table, docked inspector, and profile ownership only |
| `appInfoUiContract.test.mjs` | 90 | working header stays above one conditional feature branch with full-height normal resize reach |

I did not rerun these on a pristine checkout, because M6a already did that on `c529073`. At least one of them compares source text with a regex, and the failing output contains CRLF line endings, so line endings may be the cause. I did not confirm this.

**`npm run lint` still does not work,** as M6a reported, so ESLint was run directly.

### Not run

The XSD harness and Gemini import. Neither is an M6b gate, and no export code changed. V1 remains open.

---

## 6. Requirements and concerns for M6c

### Confirmed requirements from the M6a review, not implemented here

1. **Hide the old readiness and status presentation while EXIF reads are pending.** `PhotoExportStatus` reads readiness directly, so without this the false `må rettes` blocker returns.
2. **Prevent an asynchronous ZIP download from firing after the wizard closes.** The old dialog does this with a version token that its cleanup increments, checked after `await buildPhotoExportPackage`. The reducer cannot do it, because dispatch cannot stop the handler.

Neither has a browser test yet. M6c should add one for each, as the helper does not cover them.

### Found during this migration

1. **The AsBuilt context is missing from the plan's list of intentional test changes.** §3.2 and §9 keep the context form in the hub only, so `setContextField` has no control to drive in the wizard. Two scenarios depend on it, and §6's table lists neither:
   - `photoCompletionUi:318-322` reads `Prosjektnavn` in the export dialog and writes `Datasettets navn` there, then asserts `one set of delivery values`.
   - `photoLoadedGmiUi:244` fills all seven fields in the export dialog before the AsBuilt download.

   **Recommendation:** fill these through the hub in M6c, keep the AsBuilt download in place, and list both in the M6c report. The Completion test's two-way check becomes one-way, because the wizard has nothing to write, so that assertion needs an explicit decision and not a quiet removal. `setContextField` can then be deleted.

2. **`chooseFormat` and `setLabel` are called with a built preview on screen.** This happens at `photoLoadedGmiUi:224` and in the following format changes. In the wizard those controls are on `Leveranse`, so the helper must press `Tilbake` first. That also changes what `a new label needs a new preview` proves, because the plan is now discarded by going back. Plan row `photoLoadedGmiUi:252-255` covers this, at the old line numbers.

3. **`chooseFormat` will have to open `Flere formater`** for Legacy and AsBuilt, and select a card, not a dropdown.

4. **`buildPreview` will fail where blockers exist,** because `Neste` is disabled. The calls before `capture-time-required` in the first `photoLoadedGmiUi` scenario and before `Datafangstdato: oppgi` in the third are in this group. The plan's last table row covers them.

5. **`closeExport` relies on the wizard leaving the DOM.** `exportDialog` has no `[open]`, so a wizard that stays mounted would time out here. Set the selector with that in mind.

6. **Three texts are hard-coded in the helper and will change:** `Lag eksportforhåndsvisning`, `Last ned testpakke` and `ZIP-pakken er klar`. Plan §3.3 proposes `Neste`, `Last ned ZIP` and `ZIP-pakken er laget og sendt til nedlasting`.

7. **Line numbers in the plan's §6 table are now out of date,** because this migration shortened the suites. The scenarios are the same, and this report gives the current numbers.

---

## 7. Files changed

| File | Change |
|---|---|
| `tests/helpers/photoExportWizard.mjs` | **New** |
| `tests/photoCompletionUi.test.mjs` | Migrated |
| `tests/photoEvidenceUi.test.mjs` | Migrated |
| `tests/photoExportFlowUi.test.mjs` | Migrated |
| `tests/photoLoadedGmiUi.test.mjs` | Migrated. The largest diff, mostly `${scope}` becoming `${exportDialog}` |
| `tests/photoWorkspaceEditUi.test.mjs` | Shared selector |
| `docs/agent-reports/20261107-165513-photo-export-m6b-test-migration.md` | This report |

The suites total 92 insertions and 154 deletions.

`docs/agent-reports/20261107-162116-photo-export-m6-wizard-planning.md` was already untracked before this work and is untouched.

No commits or pushes were made. Stopping here for review.
