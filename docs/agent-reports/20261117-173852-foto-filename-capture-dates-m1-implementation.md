# FOTO M1: filename-derived capture dates in the import wizard

**IMPLEMENTED — M1 only, uncommitted**

Date: 2026-11-17, Europe/Oslo. Branch `feature/photo-workspace`, HEAD `f6df6b1`, clean working tree at start. Plan: `20261117-135049-foto-capture-date-filename-gml-reconciliation-planning.md`, §4, §5, §6.1, §7.1, §9, §12.1 and the M1 brief in §14. No subagents. Nothing staged, committed or pushed.

## 1. Outcome

During FOTO import, photos with no usable EXIF capture time and no usable time in the selected draft GML can take a date or date and time from their filename. This happens only if the user ticks it on the wizard's final step, and the values are written before the layer's first publication. M2–M5 are not implemented. Automatic GML adoption, the positioning wizard, GML export, «Anslått dato», export naming, positioning, delivery decisions and LOK/TOP → KUM are unchanged.

## 2. Files changed

| File | Change |
|---|---|
| `src/lib/photos/photoFilenameCaptureTime.mjs` (new) | Pure parser `parseFilenameCaptureTime`, pattern table `FILENAME_CAPTURE_PATTERNS`, planner `planFilenameCaptureSuggestions`, write builders `filenameCaptureTimeWrite` / `selectedFilenameCaptureWrites`, `localCalendarDate` |
| `src/lib/photos/photoSession.mjs` | `today` option; `draftCaptureSuggestions`, `captureIdentity`, `applyCaptureTimeWrites`; `previewImport` returns `captureSuggestions` and guards capture identity; `completeImport({ …, captureSuggestions })`; `createLayer`/`appendImport`/`applyLoadedGmiImport` accept `{ captureTimeWrites }` and apply them before their single `publish` |
| `src/lib/photos/photoImportWizardState.mjs` | `captureSuggestions: { complete: false, dateOnly: false }`, a `captureSuggestions` action, and a `canAdvance` reason «Leser opptakstid fra bildene …» while a choice is on and EXIF is pending |
| `src/lib/photos/photoPresentation.mjs` | `photoSourceLabel('filename')` → «Filnavn», which `photoMetadataSourceLabel` also uses |
| `src/components/photos/PhotoImportCaptureTimeChoices.js` (new) | SJEKK panel |
| `src/components/photos/PhotoImportWizard.js` | Renders the panel on the final step (Plassering with «Uten plassering», otherwise Kontroll) and passes the choices to `completeImport` |
| `src/components/photos/PhotoImportReviewStep.js` | `captureChoices` slot, before «Trenger kontroll» |
| `src/components/photos/photoCollectionPanel.css` | Scoped `.photo-import-capture*` layout rules (tokens only) |
| `tests/photoFilenameCaptureTime.test.mjs` (new) | Parser and planner, 8 tests |
| `tests/photoCaptureSuggestions.test.mjs` (new) | Session commit paths, 15 tests |
| `tests/photoImportWizardState.test.mjs` | +1 test: default-off, independent choices, persistence across steps and placement |
| `tests/photoImportWizardUi.test.mjs` | +1 browser test |

## 3. Behaviour

### 3.1 Parser (§5)

- **Input.** The basename only. The extension is stripped, and `PXL_…` and WhatsApp `IMG-YYYYMMDD-WA…` names are rejected.
- **Date tokens.** These must be digit-bounded. The forms are:
  - `YYYYMMDD`;
  - `YYYY-MM-DD` or `YYYY_MM_DD`;
  - dotted `DD.MM.YYYY`;
  - 14-digit `YYYYMMDDHHmmss`.

  Runs of 12, 13, 15 or more digits, two-digit years, and hyphen/underscore day-first or month-first forms produce nothing.
- **Times.** A time counts only if it directly follows the date after exactly one separator from `_`, `-`, space or `T`:
  - `HHmmss` or `HHmm`;
  - or a separated `HH?mm?ss` / `HH?mm` with one consistent separator from `-`, `.` or `_`.
- **Validation.** The year must be 2000–2099, the calendar date must be real (leap years included), and the clock must be ≤ 23:59:59 with no leap second. The date may be no later than `today` + 1.
- **Several tokens.** If the date tokens differ, or their times differ, the name gets no suggestion.
- **Output.** The output is `normalizeCaptureTime` of exactly what was read: `date`, `minute` or `second`. `offset` is always `null` and `timezoneKnown` is `false`. Nothing is padded, so a date-only value has no `T`.
- **Counter guard (§5.6).** Compact `HHmm` readings fall back to the date when they meet two conditions:
  - at least three names with the same date have compact 4-digit suffixes;
  - those suffixes form a consecutive integer run.

  The whole date group is downgraded. The provenance then records `pattern: 'ymd-compact'` or `'dmy-dotted'` with `downgraded: 'sequence-counter'`.

### 3.2 Candidates and precedence

`planFilenameCaptureSuggestions` works per asset, removing duplicates. It skips assets that have any of the following:

- an accepted value or a `captureTimeCleared` record;
- an EXIF `captureTime` evidence item with a value, including date-only or minute EXIF;
- a matched draft-GML entry with a capture value.

Photos still being read for EXIF are never offered. `pending` counts only those whose filename has a date, so a batch without dated names never shows the reading status.

Minute and second values go to `complete` and date-only values to `dateOnly`. `missing` is the number of unique incoming assets with no usable time.

### 3.3 Wizard

- **Where it appears.** The panel renders only on the final step, and only when at least one suggestion exists. It uses `data-validation-tone="warning"` with `.gmi-validation-panel`, and its title is a Phosphor `WarningIcon` followed by «SJEKK n bilder mangler opptakstid.».
- **Checkboxes.** «Bruk dato og klokkeslett fra filnavn (n)» and «Bruk kun dato fra filnavn (n)». Both are unchecked by default, carry `accent-gmi-interactive` and are hidden when their count is zero.
- **Suggestion list.** «Vis forslag (n)» is a `<details>` list showing each filename with its `formatPhotoCaptureTime` text and notes (`uten sekunder`, `bare dato`, `tidssone ukjent`).
- **While EXIF is pending.** Only «Leser opptakstid fra bildene …» is shown. If a choice is on, the final button is disabled with the same reason.
- **Persistence.** The choices live in the reducer, so they survive back navigation and placement changes. The counts are recalculated from each new preview.

### 3.4 Commit and transactional safety (§9)

- **Stale guard.** The preview guard also records the identity of each incoming asset's `captureMetadata` and `metadataEvidence`.
- **Pending EXIF.** `completeImport` refuses with `pending-exif` when a choice is on and any import photo is still being read.
- **Re-planning.** It re-plans against live assets. If the re-planned set differs from what the preview showed (for example, the day changed), it returns `review-changed`.
- **Writes.** Each write is passed to the committing method and applied to eligible incoming assets only, after source attachment and before that method's single `publish`. A write never replaces an accepted or removed value.
  - The written shape is `{ value, provenance: { kind: 'filename', raw, token, pattern, via: 'import-suggestion' }, acceptedAt }`.
  - It has no `acceptance` field, so `autoAcceptMetadata` treats it as protected.
  - No filename item is added to `metadataEvidence`.
- **Covered by tests:**
  - No publication shows the new layer without its approved values.
  - Cancelling or a refused commit writes nothing.
  - Photos already in the target layer are untouched when appending.
  - Repeated GMI occurrences share one asset write.
  - Original bytes, `File` identity and evidence stay the same.

### 3.5 Source presentation

Inspector «Opptakstid fra», the metadata dialog «Godtatt: … · Filnavn» and the completion «acceptedText» now say «Filnavn» through `photoMetadataSourceLabel`. The `bare dato` and `uten sekunder` notes are unchanged.

## 4. Deviations and interpretations

1. **Panel copy.** §7.1 sketches a second sentence: «Filnavnene gir dato og klokkeslett for 7 bilder, og kun dato for 3.» It is left out because the checkbox labels already show those counts, and AGENTS.md forbids restating visible counts. Only «n bilder mangler opptakstid.» remains.
2. **Invalid clock after a valid date.** A name such as `20261014_2400` or `…_143360` gets no suggestion at all; it does not fall back to date-only. This fails closed. Please confirm.
3. **Inconsistent separated time.** `2026-10-14_14-33.02` is read as **date-only**. The time is rejected but the date is still offered.
4. **Counter guard scope.** It downgrades the whole date group and also applies to compact `dmy-hm`, not only `ymd-hm-*`. Separated `HH-mm` is never downgraded.
5. **Conflicting date tokens.** Any date-like 8-digit token makes the name strict. `DSC_12345678_20261014` gets no suggestion because `12345678` is an invalid date token.
6. **`today`.** This is the host's local calendar date (`localCalendarDate`), used only for the future-date check. Tests inject it through the new `createPhotoSession({ today })` option.

## 5. Commands and results

| Check | Result |
|---|---|
| `node --test tests/photoFilenameCaptureTime.test.mjs` | 8/8 pass |
| `node --test tests/photoCaptureSuggestions.test.mjs tests/photoImportWizardState.test.mjs` | 21/21 pass |
| Plan §12.1 regression baseline (the ten listed files plus `photoAutoMetadata`, which is one of them) | **195/195 pass**: 194 baseline + 1 new wizard-state test |
| `photoManualFill`, `photoExportReadiness`, `photoExportPlan`, `photoExportSerializers`, `photoGeminiCompatibility`, `photoImportLayers`, `photoDeliveryPlanning` | 126 tests: 125 pass, 1 skipped (contractor reference folder unavailable) |
| `npx --no-install eslint` (all touched and new JS/MJS files) | Clean |
| `npm run build` | Pass |
| Browser: `tests/photoImportWizardUi.test.mjs` against a fresh `next start -p 3187` | 2/2 pass (existing case + new case) |
| Browser: `tests/photoImportAcceptanceFixesUi.test.mjs` | 1/1 pass |
| Full serial `node --test --test-concurrency=1 "tests/*.test.mjs"` (no browser env) | 2325 tests: 2181 pass, **1 fail**, 143 skipped |
| `git diff --check` | Clean |

**The one full-suite failure is pre-existing and unrelated.** `tests/validationV2GmiA7.test.mjs` › «Validator exposes only the automatic V2 workflow» fails on `/aria-label="Lukk Validator"/`. It fails the same way at unmodified `f6df6b1`. I checked this in a temporary detached worktree, which was removed afterwards. No Validator file was touched.

**What the new browser case checks:**

- The SJEKK panel is absent on Bilder, and present on the Plassering final step and on Kontroll.
- The «5 bilder mangler opptakstid.» text, the counts (3/1) and the default unchecked state.
- A computed accent colour of `rgb(0, 117, 149)`.
- The four «Vis forslag» rows with precision notes.
- The choice survives a placement change to EXIF and two back navigations.
- Space toggles a focused checkbox.
- After commit, the inspector shows «Filnavn» with `bare dato` and `uten sekunder`, and an EXIF photo keeps «EXIF DateTimeOriginal».
- No runtime exceptions.
- No horizontal overflow, and footer actions stay inside the viewport, at 1280×720 and 1366×768.

The screenshots were inspected visually (placement-final and review-final). At 1280×720 on Plassering, the panel sits below the source cards inside the step's own scroll area, which is the existing behaviour.

The server I started was stopped, and port 3187 was confirmed released.

## 6. Remaining risks and manual acceptance

- **Real filename patterns are unverified (D7).** No private corpus was examined. Check a real contractor delivery for false positives, especially project or KUM numbers next to dates, and for counter suffixes.
- **The counter guard is a heuristic.** Three photos taken in consecutive minutes are downgraded to the date. This is safe because it only loses precision, but it may surprise users.
- **Interim provenance in readiness.** Filename values count as «Fra kilde» in completion and readiness until M4 (D6). Exports carry no filename provenance warning yet.
- **Date-only filename values.** These are accepted values, so «Anslått dato» skips them (D8, M5 deferred), and Gemini/Legacy/AsBuilt treat them as incomplete times, as with any date-only value.
- **Manual acceptance:**
  1. Import a real mixed set with and without EXIF time.
  2. Tick each option separately.
  3. Confirm the inspector source and precision notes.
  4. Confirm that cancelling and appending leave existing photos untouched.
  5. Confirm that an approved value survives a later GML source in the positioning wizard. Today's automatic policy does not replace it.

## 7. Side findings (not changed)

- `PhotoImportReviewStep` still uses the text glyph `⚠` in attention rows (plan §13, side finding 2). M1 did not edit that row; it is recorded for the styling audit.
- The pre-existing Validator test failure above.

## 8. Git

The branch is `feature/photo-workspace` and HEAD is `f6df6b1`, unchanged. Nothing was staged, committed, pushed or deployed. The modified and untracked files are listed in §2, plus this report.
