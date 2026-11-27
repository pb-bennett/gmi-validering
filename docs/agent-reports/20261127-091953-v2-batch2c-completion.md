# GMI Validator 2.0 — Batch 2C: final functional polish (completion)

2026-11-27. `feature/photo-workspace`, HEAD `b2b1b09` (unchanged). Agent: Claude Opus. No subagents. Sources: the task brief and the committed reports ([Batch 2A](20261125-091633-v2-batch2a-completion.md), [Batch 2B](20261125-152437-v2-batch2b-completion.md), [release planning 20 Nov](20261120-154700-final-functional-reconciliation-release-planning.md), [FOTO correctness slice 1](20261116-124320-foto-correctness-slice1-completion.md)). The untracked pre-release audit is not on this machine and was not recreated.

## Outcome

Items 1–5 are implemented, with tests. For item 6, four open follow-ups were verified in the current code and are documented below, not implemented. Automated checks pass. **Manual acceptance is outstanding**, including one real Gemini VA import (item 3). Parsers, the GMI byte path, the GML serializer, export identifiers and Gemini WFS were not changed.

| # | Finding | Root cause | Now |
|---|---|---|---|
| 1a | An unsupported file type showed «Ugyldig GMI-fil» | `detectFormat` fell back to GMI for every unknown extension, so the GMI parser reported the failure. The picker's `accept` list does not stop «Alle filer» | The name is checked before anything is read: «Filtypen .xlsx støttes ikke. Velg en .gmi-, .sos-, .sosi- eller .kof-fil.» No file, layer or parsing state is touched apart from the error. A `.txt` with neither GMI nor SOSI content: «Innholdet i tekstfilen ble ikke gjenkjent som GMI eller SOSI …». A malformed `.gmi` keeps the parser's GMI error |
| 1b | The import error stayed as a workspace banner after «Legg til nytt lag» was closed | The banner showed whenever `parsing.status === 'error'` and the dialog was closed. Closing the dialog left the error in place, so the same message reappeared outside it | Closing the dialog (×, Escape, backdrop) dismisses an error the dialog has already shown (`restoreParsing`). The banner remains for an error that arrives while the dialog is closed (window drop), with «Prøv igjen» and «Lukk feilmelding» |
| 2 | FOTO: a GMI-placed photo became GML when moved, but not when rotated | `applyPhotoEdits` passed only position writes to the B1.1 delivery planner. Slice 1 accepted «rotation alone keeps GMI», but a GMI hyperlink cannot carry a direction, so a rotated photo delivered in GMI lost its direction in export | A confirmed rotation of an untouched GMI default makes the same automatic GMI → GML transfer as a move away. It is proposed while editing and committed with the save. See [FOTO](#2-foto-rotation) |
| 3 | Gemini VA `Set_fopen_s_Error — errno=22` with an en dash in the extracted folder name | Not proven. The descriptive part of the name (proposed from the source GMI filename) keeps typographic characters, and ZIP extraction normally names the folder after the ZIP | Non-blocking advice in the filename editor, with a suggested name applied only by its own button. Separate checks in Kontroll for attachment names and long extracted paths. Nothing is renamed by itself |
| 4 | The info dialog showed «v1.2.0» next to «Versjon: <commit>» | The Git SHA was labelled «Versjon». The application version already has one source with a parity test against `package.json` | The SHA is labelled «Commit». A Preview or local build adds «Kan inneholde endringer som ikke er utgitt etter v1.2.0». «Fremtiden» no longer lists two features this build already has |
| 5 | «Lagmarkering» and «Marker alt i laget» use different icons | They are not the same function (see [item 5](#5-layer-marking)) | Icons and entry points kept. The pressed tooltip «Skru av laghighlight» → «Skru av lagmarkering» |

## 1. Import errors

- **New `src/lib/parsing/surveyFileType.mjs`** holds the one list of supported extensions (`gmi sos sosi kof txt`) and the messages. `fileDragState.surveyFileDropAccepted` now uses the same rule, so the picker and drop paths cannot disagree. The only behaviour change there is an edge case: a file named exactly `.gmi` (no stem) is no longer accepted.
- **`FileUpload.handleFile`** refuses an unsupported name before `setFile`, `startParsing` and `FileReader`. `detectFormat` returns `null` for unrecognised `.txt` content instead of «GMI».
- **Refused drops are unchanged.** A drop with an unsupported name is still ignored without a message. `photoWorkspacePass1dUi` pins this as an accepted contract: no read, no persisted change. Image, PDF and video drags are already shown as refused before the drop.
- **`page.js closeAddLayer`** calls `restoreParsing()` when the status is `error`. A successful import also closes through it, but then the status is `done`, so nothing changes. If the dialog is closed while a file is still being read, a later failure appears as the workspace notice.
- Retry, layers, map, Rettinger corrections, FOTO layers and the session-loss guard are kept (covered by the existing F-05 suites).

## 2. FOTO rotation

**Rule.** The [slice 1 rule](20261116-124320-foto-correctness-slice1-completion.md) for a move is unchanged: an untouched GMI default that is moved away from its GMI point becomes an automatic GML transfer. A confirmed change of direction now does the same. «Untouched» is the existing predicate: linked, `keep-link`, not explicit, not chosen by the user, transferable. It is now one shared function, used by both moves and rotations.

| Case | Result |
|---|---|
| Rotation only | GML (automatic transfer). The position record itself is kept, so the GMI candidate remains the basis |
| Move only | Unchanged |
| Move and rotation | GML, including a «move» back within tolerance |
| Open and cancel, save without changes, save the saved direction again | No change. A direction equal to the saved one is not a rotation (compared after normalisation) |
| Undo or rotate back to the start before saving | No proposal (the staged value is removed) |
| Explicit GMI, stored GML/Ikke, transfer not possible, photo without a GMI link | Unchanged. The rotation is saved; the delivery choice is not changed |
| Move back to the GMI point after an automatic transfer | Restores GMI as before, **unless the photo has a direction the user set** (`basis.kind === 'manual'`, also from an earlier save or bulk fill). Otherwise the direction would silently drop out of the delivery again. This applies in every positioning path that uses the shared planner |

**Traceability.** The occurrence key (the GMI object relationship), the GMI candidate, the `origin` provenance and the GMI file are unchanged, as for a move.

**UI.** While editing, the pill and marker show the proposed GML, and the inspector explains it: «Foreslått GML fordi retningen er endret. Retningen kan bare leveres i GML. …» (separate wording for move only and for move with rotation). After saving, the toast shows the existing «n plasseringer overføres til GML».

**Export.** No export code changed. A Node test builds the `legacy2019` GML from the session after rotation-only and combined edits, restricted to the transferred occurrences (as the delivery plan does), and finds `<app:retningsverdi>` 123 and 200: the values that were set. Gemini GUIDs, naming and attachment handling are untouched.

**Contract change (deliberate).** «Rotation alone keeps GMI» was an accepted B1.1/slice 1 assertion. It is replaced in `photoDeliveryDefaults.test.mjs` and `photoDeliveryDefaultsUi.test.mjs`, and the transfer and retained counts there follow from the change. The «conflicting save writes nothing» check now compares against the state after the rotation, so it still asserts that nothing changed. No other FOTO assertion was changed.

**Not changed (residual).** «Fyll inn manglende» with direction (bulk fill) on GMI-linked photos does not make them GML. The direction is accepted, but a GMI delivery does not carry it. That is a fill of missing values, not a rotation, and it was outside the reported defect. Recommend a decision before 2.0.

## 3. Export filenames and Gemini VA

**ZIP layout (unchanged):** `<basename>.gmi`, `<basename>.gml`, `Attachments/<photo names>`. The basename is `[YYYYMMDD-HHmm-]<descriptive>[_revNN]`. The descriptive part is proposed from the source GMI filename and keeps the user's text (spaces, æøå, dashes), with only filesystem-invalid characters replaced. Windows «Pakk ut alle» and similar tools usually extract into a folder named after the ZIP. That is how an en dash from the contractor's filename can reach the folder that Gemini VA opens.

**Advice, not rules:**

- **Characters.** Characters outside printable ASCII and the Latin‑1 letters (æøå, é and similar are fine) are reported: en and em dashes, typographic quotes, non-breaking space, soft hyphen, arrows, emoji, ½, × and others. These are listed only to prompt a check: Gemini VA's actual list of refused characters is not known.
- **Filename editor (Innhold).** «Navnet har tegn som ikke alle programmer håndterer i fil- og mappenavn: tankestrek (U+2013, –). Gemini VA kan for eksempel ha problemer med dem, også i mappen ZIP-filen pakkes ut i. Forslag: …» The «Bruk foreslått navn» button replaces dashes with `-`, removes typographic quotes, turns special spaces into ordinary ones and replaces anything else with `_`. Nothing happens unless the user clicks it. «Bruk forslag» still returns to the source name. The field is not `aria-invalid`, and «Kontroller leveransen» stays enabled.
- **Kontroll** (two separate checks under «Bør kontrolleres», and in the TXT delivery report):
  - `package-name-characters` names attachment names with such characters. They come from the photos (and GMI links) and are never renamed.
  - `package-path-length` reports the longest path counted from the extraction folder (`<basename>/Attachments/<name>`), above 150 characters. The text says the app does not know where the files will be extracted. 150 is advisory headroom within the classic Windows path length, not a known Gemini VA limit.
- These checks are derived from the plan in `deliveryWizard.mjs` (`deliveryNameCompatibility`). The plan, the names, the GMI/GML bytes and the identifiers are not changed. Export profiles are unchanged.

**Residual risk.** The real cause inside Gemini VA is unproven, so a name that passes these checks may still fail, and some flagged names may work. Manual acceptance: one real export whose source name contains an en dash, opened in Gemini VA before and after «Bruk foreslått navn».

## 4. Version information

- **One source.** `src/data/appReleases.mjs` (`CURRENT_APP_VERSION = APP_RELEASES[0].version`) feeds the toolbar «Om appen · v…», the dialog pill, the hero and the contact e-mail. `tests/appReleases.test.mjs` already requires `package.json`, `package-lock.json` and `packages[""]` to match it. No second literal was found.
- **Commit.** `BuildIdentity` labels the SHA «Commit:» (it was «Versjon:») and keeps «Miljø». In Preview and local builds it adds «Kan inneholde endringer som ikke er utgitt etter v1.2.0». Production does not show this. Nothing claims that 2.0 is released.
- **Fremtiden.** «Full støtte for bilder» (FOTO) and «Redigering av feltverdier i GMI-filer» (Rettinger) were removed, because this build has both. «Bedre tilbakemeldinger» (screenshots in Kontakt) remains: Kontakt has no attachments. Version history, Nytt and Kontakt are unchanged. 1.1.0's «Oversikt over planlagt videre utvikling» stays as history.

**Activating 2.0 at release** (one change, in the release commit):

1. Add a `2.0.0` entry first in `APP_RELEASES`, with `releasedOn`, `type: 'major'`, title, summary, `changes`, `news` and `announce: true`. Describe FOTO, Rettinger and delivery there.
2. `npm version 2.0.0 --no-git-tag-version` (updates `package.json` and `package-lock.json`). The parity test fails if this step is skipped.
3. Update the catalog assertions in `tests/appReleases.test.mjs` (`['2.0.0', '1.2.0', …]`, current version and its fields) and `tests/appInfoUiContract.test.mjs` (`version: '2.0.0'`). Update the Nytt tab if 2.0 gets its own news section.
4. Review «Fremtiden» again.
5. Deploy to production; the Preview-only note then disappears by itself.

## 5. Layer marking

The two handlers are not equivalent, so they keep their own icons:

| | «Marker alt i laget» (layer card, Analyse) | «Lagmarkering» (map toolbar) |
|---|---|---|
| Type | Toggle for one layer, `aria-pressed` | Opens a panel, `aria-expanded`/`aria-controls` |
| Action | `toggleLayerHighlightAll(layerId)` | Shows settings for every layer and the Gemini WFS reference: on/off, colour, strength, width, draw order and reset |
| Shared | Both write `highlightAll` through `setLayerHighlightEnabled` | |
| Icon | `HighlighterIcon` (marker pen) | `PaletteIcon` (settings) |

Changing the panel trigger to the marker pen would suggest a toggle where a settings panel opens. Only the mixed-language tooltip was changed. A source test now pins the shared state, the two roles and the terminology. The existing `PaletteIcon` and analysis-row icon contracts are unchanged.

## 6. Delivery-receipt and report follow-ups (documented, not implemented)

These four were listed in the [20 Nov release planning](20261120-154700-final-functional-reconciliation-release-planning.md#narrow-accepted-follow-ups) as one narrow closure batch. All four were re-checked in the code at `b2b1b09` and are still present:

| Finding | Evidence at `b2b1b09` | Proposed correction |
|---|---|---|
| The import receipt omits the automatic GMI/GML delivery changes | `photoSession.mjs:1065` discards `acceptSourcePositionsCore(...).delivery`. `completeImport` returns only the total, placed and unplaced counts (`:1073`). The source-wizard receipt includes the delivery counts | Pass `applied.delivery` through `planned.result` into the `completeImport` result and render it with the existing `deliveryLines`. Omit zero lines; keep cancel and failure atomic; test preview against saved decisions |
| `direction-assumption` is counted as a warning | `photoExportPlan.mjs:124` always adds it. The `informational` set in `deliveryWizard.mjs` does not include it, so Kontroll, the «n merknader» line and the TXT report count it | Classify as information (technical detail). Keep real direction problems as warnings |
| «Fortsett uten opptakstid» also appears when a usable date exists | `photoExportWizard.mjs:35` | Wording that tells an existing date apart from an omitted incomplete time |
| Development terms in export messages | `photoExportPlan.mjs:122` «forekomst-features», and similar | Review the wording for actionability; move internal assumptions to technical details |

They change receipt and report semantics and their tests. The brief allows them only with sufficient evidence, and none of them is a new real-world defect. Recommend them as one small follow-up batch.

## Changed files

- **Application (12 modified):** `src/app/page.js`, `src/components/` `AppInfoModal`, `FileUpload`, `LayerPanel`, `delivery/deliveryWizard.css`, `photos/PhotoDeliveryControls`, `photos/PhotoExportDeliveryStep`; `src/lib/` `delivery/deliveryWizard.mjs`, `fileDragState.mjs`, `photos/export/photoExportNaming.mjs`, `photos/photoDeliveryChoice.mjs`, `photos/photoSession.mjs`
- **Application (1 new):** `src/lib/parsing/surveyFileType.mjs`
- **Tests (2 new):** `tests/importErrorMessages.test.mjs`, `tests/exportNameCompatibility.test.mjs`
- **Tests (8 modified):** `photoDeliveryDefaults` (contract change plus two new tests, including GML output), `photoDeliveryDefaultsUi` (rotation proposal, discard and save), `shellAnalysisCorrectnessUi` and `shellAccessibilityUi` (no stale notice; the notice is now produced by a window drop; unsupported, `.txt` and `.dwg` cases), `deliveryWizardUi` (filename advice, suggestion and reset), `buildInfo` («Commit», Preview note), `appInfoUiContract` (Fremtiden), `layerHighlightPanel` (item 5)
- **Report:** this file and [screenshots](20261127-091953-v2-batch2c/)

**Contract changes:** rotation → GML (item 2); no workspace notice after closing the dialog (items 1b, 2A F-05 and 2B F-08 assertions, now covered by a drop); «Commit:» label and the Fremtiden list (item 4). No fixture, hash, export identifier or safety assertion was relaxed.

## Verification

Level: **Expanded, escalated to the FOTO, delivery and export browser suites**, because FOTO delivery and export contracts are involved. The full Node suite was not run: no parser, store slice, validation or GMI byte code changed.

| Check | Result |
|---|---|
| New and changed Node tests against a HEAD export (`git archive`) | `importErrorMessages`, `exportNameCompatibility`: fail on import (no helpers). `photoDeliveryDefaults` with the new helper imports removed: **4 failed** (rotation-only, combined, conflict baseline, pure effect). `buildInfo` 1 failed, `appInfoUiContract` future-roadmap test failed, `layerHighlightPanel` 1 failed: the defects and the old content are detected |
| Expanded Node set, 89 files (photo, delivery, export, GMI-photo, hyperlink, wizard transaction, app info, release, build info, file drag, layer highlight, shell and stats) | **1,171 tests: 1,163 passed, 0 failed, 8 skipped** |
| ESLint, all 21 changed or new JS/MJS files | 0 errors, 1 warning: `FileUpload.js` `react-hooks/exhaustive-deps` (`detectFormat`), also present at HEAD |
| Isolated production build `%TEMP%/gmi-2c-build`, `npm run build -- --webpack` | Exit 0; `src/` identical to the working tree (`diff -rq --strip-trailing-cr`) |
| Changed browser suites (`shellAnalysisCorrectnessUi`, `shellAccessibilityUi`, `photoDeliveryDefaultsUi`), port 3221 | **20 passed, 0 failed** |
| Escalated browser suites, 38 files (delivery wizard, all `photo*Ui`, `photoDialogLayout`, `gmiPhoto*Ui`, `layerAnalysisUi`, `gmiEditDraftGuardUi`, `wizardNavigationUi`) | **201 tests: 190 passed, 0 failed, 11 skipped** (449 s). This run started before the filename case was added to `deliveryWizardUi` |
| `deliveryWizardUi` after adding the filename case | **17 passed, 0 failed** |
| `git diff --check` | Exit 0 |

**Skipped, not passed:** 11 browser cases that need the private 148-photo or G01/G04 corpus, `next dev` or an optional fixture (EXIF orientation), and 8 Node cases of the same kind. **Omitted:** the full Node suite, Gemini WFS and Validator browser suites, real contractor files, Gemini VA, hosted services and screen readers.

## Remaining risks

1. Item 3's cause is unproven; the advice is a heuristic (see above).
2. Bulk-filled directions on GMI-linked photos are still not delivered in GMI (item 2, residual).
3. A rotation now changes the delivery state of untouched GMI defaults. Users who rotated photos only for display will see GML proposed. This is the requested behaviour, but it is visible in existing sessions on the next save.
4. Refused drops of unsupported files remain silent (an accepted contract). Only the picker path shows the type message.
5. The four item-6 follow-ups remain open.

## Manual acceptance

- **Import:** pick an `.xlsx` and a `.dwg` with «Alle filer» on the upload screen and in «Legg til fil»; a malformed `.gmi`; a valid file afterwards. Close the dialog after an error (no banner). Drop a malformed `.gmi` on the map (banner, «Prøv igjen», «Lukk feilmelding»).
- **FOTO:** with a real GMI-linked layer, try rotation only, move only, both, cancel, and saving without changes. Check the pill, the inspector text and the toast. Export «Samlet levering» and confirm in the GML (and in Gemini) that the rotated direction is present and the GMI link was removed for that photo.
- **Gemini VA:** export with an en dash in the name, extract with Windows, open in Gemini VA. Then repeat with «Bruk foreslått navn».
- **Info dialog** on a Preview deployment: «v1.2.0 · Commit … · Miljø: Preview · Kan inneholde endringer …», and Fremtiden.
- **Layer marking:** both entry points and the tooltip text with a mouse.

## Git and processes

Nothing was staged, committed, pushed, reset, restored, stashed or cleaned. `AGENTS.md` is unchanged. No untracked reports from other tasks were present or touched. Three working-tree files that this task's edits had left with LF or mixed line endings were returned to CRLF; the index stays LF. The task-owned server on port 3221 was started from `%TEMP%/gmi-2c-build` and stopped after the runs (its command line was checked first; the port is free). No other server was touched. Temporary copies remain in `%TEMP%/gmi-2c-build` and `%TEMP%/gmi-2c-head` (`node_modules` in both is a junction to the repository).
