# Export filename editor: completion report

**Status: IMPLEMENTED, NOT COMMITTED.**
**Date:** 2026-11-17
**Repository / branch / start HEAD:** `C:/GitHub/gmi-validering-test`, `feature/photo-workspace`, `2e3a05d`. At the start the only untracked file was the planning report.
**Plan:** [20261117-112416-export-filename-editor-plan.md](20261117-112416-export-filename-editor-plan.md), with decisions D1–D6 resolved as follows: D1-A, keep spaces, block above 255 bytes, hide revision in Kun GML, accessible name «Filnavn», extension in the suffix. The planning report is unchanged.

## 1. Outcome

There is now one compact editor in every delivery mode: `[ååååmmdd-ttmm-][descriptive name][_revNN.ext]`.

- **Checkboxes:** «Tidsstempel» and «Revisjonsnummer» are independent and checked by default. Revisjonsnummer is hidden in Kun GML.
- **Suggestion:** «Bruk forslag» restores the descriptive suggestion.
- **Warnings and blocks:**
  - Above 80 characters, the editor shows the amber warning «Filnavnet er over 80 tegn.». It never blocks.
  - An empty name, a reserved Windows name, or a name over 255 bytes blocks «Kontroller leveransen» and shows a one-line reason.
- **Removed:** the duplicate «Eksportetikett» inputs (including `maxLength={60}`), «Etikett i filnavnet (valgfritt)», «Foreslått ut fra …», the «Filnavn: ÅÅÅÅMMDD-TTmmss…» line and the timestamp help text.
- **Naming rules:**
  - The timestamp is now `YYYYMMDD-HHmm`.
  - The descriptive part keeps `æøå`, spaces, case and ordinary punctuation, and it is never cut.
  - GMI, GML, ZIP and the report share one basename from the plan's single clock read.

## 2. Implementation decisions

### Naming module (`photoExportNaming.mjs`, the single owner of names)

- **Exports:** `parseSourceFilename`, `sanitizeExportDescriptive`, `exportFilenamePreview`, `exportFilenameOptions`, `photoExportNames` (now with `descriptive` | `label`, `timestamp` and `revision`), `ExportFilenameError`, and constants for the 80-character advisory length, the 255-byte limit, the report suffix and the placeholder.
- **Removed:** `suggestRevisionLabel`, `sanitizePhotoExportLabel` and `PHOTO_EXPORT_LABEL_MAX_LENGTH` (48).

### Prefix stripping (D1)

- Leading `YYYYMMDD-HHmm-` and legacy `YYYYMMDD-HHmmss-` prefixes are stripped repeatedly, but only when the date and time are plausible.
- Contractor date-only and other formats are kept, for example `20261110 …`, `20261110-…`, `2026-11-10_…` and `20261110_1430_…`.
- **Accepted ambiguity:** a contractor prefix of exactly the shape `YYYYMMDD-HHmm-` is removed. A unit test pins this.

### Sanitizer

- **Replaced with `-`:** controls, `< > : " / \ | ? *` and unpaired surrogates.
- **Whitespace:** runs collapse to one space, and leading and trailing dots and spaces are removed.
- Text with no letter or digit left counts as empty. This is an addition to plan §4.2: it prevents names made of separators alone, such as `--.zip`.

### Composition and blocking

- Composition follows the §4.3 table.
- **Reserved names** match `CON|PRN|AUX|NUL|COM¹²³1-9|LPT¹²³1-9`, optionally followed by an extension.
- **Hard limit:** `<basename>-leveranserapport.txt` must be at most 255 UTF-8 bytes.

### Wiring

- **GMI names:** `gmiExportNames` delegates to `photoExportNames`. `buildGmiFieldExport` returns `{ok:false, code:'filename-…'}` for a bad name, before any work. The three codes were added to `GMI_EXPORT_FAILURES` and to the Norwegian `gmiEditView` messages: «Filnavnet er tomt.», «Filnavnet er reservert i Windows.» and «Filnavnet er for langt for filsystemet.».
- **Delivery plan:** `buildDeliveryPlan` calls `exportFilenameOptions(configuration)` once. Every naming site receives the same options and the same `date`: the plan naming, `buildGmiFieldExport` and `buildPhotoExportPlan`. A naming error becomes a `DeliveryError` with the same code (fail closed).
- **Report name:** `naming.reportFilename` is now the source of the report download name.

### State

- `DEFAULT_PHOTO_EXPORT_CONFIG` gains `filenameTimestamp: true` and `filenameRevision: true`.
- `label` now holds only the descriptive text.
- The wizard derives the descriptive text, the revision (`rev${nextRevision}` from the live source, never stored), the preview and the blocking issue at render time.
- Checkbox patches do not set `labelEdited`.

### UI

- `ExportFilenameEditor` lives in `PhotoExportDeliveryStep.js` and replaces `FilenameHint`.
- **Accessibility:** «Filnavn» is a `<label htmlFor>`. `aria-describedby` points to the prefix, the suffix and the message. Blocking errors set `aria-invalid="true"`.
- **Styling:** the CSS is scoped under `.delivery-wizard` and uses only existing tokens.
  - The wrapper carries the focus ring with `:focus-within`.
  - Warning and error tones come from `data-validation-tone`.
  - The checkboxes use `accent-gmi-interactive` and compute to `rgb(0, 117, 149)`.

## 3. Files changed

**Source:**
- `src/lib/photos/export/photoExportNaming.mjs`
- `src/lib/gmi-edit/exportGmi.mjs`
- `src/lib/delivery/deliveryPlan.mjs`
- `src/lib/photos/export/photoExportPlan.mjs`
- `src/lib/photos/photoExportConfig.mjs`
- `src/lib/gmiEditView.mjs`
- `src/components/delivery/DeliveryWizard.js`
- `src/components/photos/PhotoExportDeliveryStep.js`
- `src/components/delivery/deliveryWizard.css`

**Tests:**
- `tests/photoExportNaming.test.mjs` (rewritten)
- `tests/deliveryPlan.test.mjs`
- `tests/gmiEditSessions.test.mjs`
- `tests/gmiEditWorkspace.test.mjs`
- `tests/photoCompletion.test.mjs`
- `tests/photoExportWizard.test.mjs`
- `tests/deliveryWizardUi.test.mjs`
- `tests/gmiEditWorkspaceUi.test.mjs`
- `tests/photoExportWizardUi.test.mjs`
- `tests/photoLoadedGmiUi.test.mjs`
- `tests/photoExportReturnUi.test.mjs`
- `tests/photoExportLayoutUi.test.mjs`
- `tests/helpers/photoExportWizard.mjs`

**Docs:** this report.

**Not changed:** `deliveryPackage.mjs`, `exportZip`, attachment naming, GMI patching and verification, photo metadata, GML positioning, delivery decisions and LOK/TOP transfer.

## 4. Deliberate contract updates in tests

- **Timestamp:** `HHmmss` changes to `HHmm` everywhere.
- **Sanitizer:** expected values change from ASCII transliteration to preserved text, for example `Grøft - nord` and `Rettet SDR på kum`.
- **Config shape:** the configuration has two new booleans.
- **Revision table:** the E-table is now `{descriptive, nextRevision}` cases, with raw and untruncated text.
- **Second-precision tests:** two browser tests used a 1.1 s delay to get a new name. They now change the descriptive text, because names have minute precision. The unit test pins two things: the same minute gives the same name, and one minute later gives a new name.
- **Rettinger export:** its name now carries `_revNN`, because revision is on by default.
- **Keyboard-order harness** (`photoExportLayoutUi`):
  - It names checkboxes and text inputs by their `<label>`.
  - It accepts the focus ring on the `.delivery-filename` wrapper.
  - The expected stops are now «Filnavn» and «Tidsstempel» instead of «Eksportetikett».

## 5. Verification

| Check | Result |
|---|---|
| Focused Node: naming, gmiEditSessions/Workspace, deliveryPlan/Wizard/Exclusion/Polish, photoCompletion, photoExportWizard/Plan/Flow/Package | 249 pass, 0 fail |
| New unit coverage | Parser (prefix kinds, D1, ` (n)`, long and Norwegian names), sanitizer (idempotent, no cut), §4.3 matrix, reserved names, 234/235-byte and `ø` byte limits, advisory 80/81 for `.gmi` and `.zip`, revision progression over cycles in each checkbox combination |
| Delivery plan, every checkbox combination | One basename across GMI, GML, ZIP and report names; ZIP GMI entry equals planned bytes; local header bit 11 (UTF-8) set for `æ/ø` names; Kun GMI no-op byte-identical; empty, reserved and too-long names rejected with codes |
| ESLint, changed JS/MJS (21 files) | clean |
| `npm run build` (production) | success |
| Full serial Node, `node --test --test-concurrency=1 "tests/*.test.mjs"`, without a browser URL | 2300 tests: 2158 pass, **1 fail**, 141 skipped |
| Browser `deliveryWizardUi` (production server on free port 3123, serial) | 16/16 pass |
| Browser `gmiEditWorkspaceUi`, `photoExportWizardUi`, `photoLoadedGmiUi`, `photoExportReturnUi`, `photoExportLayoutUi`, `photoExportFlowUi` | 65 pass, 2 fail on the first run (the second-precision assumption above); after the fix, the two affected suites passed 31/31; 1 skipped (private corpus) |
| Browser `photoDeliveryExclusionUi`, `photoDeliveryIntentUi`, `photoDeliveryDefaultsUi`, `photoCompletionUi`, `gmiEditDraftGuardUi` | 24 pass, 1 skipped |
| `git diff --check` | clean |

### Full-suite failure

The one failure is `validationV2GmiA7` «Validator exposes only the automatic V2 workflow». It expects `aria-label="Lukk Validator"`, but `ValidationV2Workspace.js` at HEAD contains 0 occurrences. Neither file was touched in this task, which `git diff` confirms. This is the known baseline failure from the close-control refactor, not a new one.

### What the new browser test covers

- **Initial state:** the full structure on open; the accessible name «Filnavn» with no `aria-label` and no `maxLength`; the old controls absent; teal checked checkboxes.
- **Long source name:** a long contractor name, `20261110 … (Æ & Ø)_rev01.gmi` (over 80 characters), is shown whole with the warning, and its export name is untruncated.
- **Edited text:** it persists across GMI-kartlag and mode changes while the suffix follows the source (`_rev002.gmi` → `_rev002.zip` → `.zip` with no revision box in Kun GML).
- **Suggestion:** «Bruk forslag» restores the suggestion.
- **Limits:** the 80/81 boundary; blocks for a name that is too long, empty or reserved; `aria-invalid`.
- **Checkboxes:** combinations, and their persistence over Kontroll → Innhold.
- **Keyboard and focus:** the wrapper's focus ring; Tab moves to Tidsstempel and Space toggles it.
- **Layout at 1280×720 and 1366×768:** no horizontal overflow, the row stays inside its column, row height at most 40 px, footer visible.
- **Export cycles:** three export → re-import cycles (`_rev01`…`_rev03`), then one with the timestamp off (`Syntetisk M10_rev04.gmi`). Every no-op download is byte-identical to the source, and the report name matches the basename.

**Screenshots** (inspected): Kun GMI short and long (warning), and Samlet with edited text, at 1280×720 and 1366×768. The row is compact, the suffix stays right-aligned, the amber tone shows, and nothing overflows.

## 6. Deviations and notes

- **Empty-text rule:** text that sanitizes to no letter or digit counts as empty (see §2).
- **Leading dots:** a descriptive name such as `../x` becomes `-..-x`. Leading dots are stripped only at the very start. The result is safe, because no separator survives.
- **Line endings:** a few test files and two source files were edited with `sed`/Write, which leaves LF in the working tree, where `core.autocrlf=true` normally gives CRLF. Git normalizes them on staging and `git diff --check` is clean. The content diff is unaffected.
- **Server process:** stopping the background task left the server's child process (PID 13580, `next start -p 3123`) running. I started that process and stopped it explicitly; the port is free.

## 7. Remaining risks and real-data acceptance

- **Gemini VA / FME (largest risk, unverified):** import of a GMI whose name contains `æøå` and spaces, and of a Samlet ZIP whose GMI and GML entry names contain them. The ZIP flags UTF-8 (bit 11, verified), but whether the recipients honour the flag is unknown.
- **Real contractor file:** check that a long name with a leading date is preserved whole, and that the revision progresses over two export/re-import cycles.
- **Same-minute downloads:** two downloads in the same minute get the same name. The browser should keep both files (` (1)`), and re-import strips that counter.
- **D1 trade-off:** a contractor prefix of exactly `YYYYMMDD-HHmm-` is removed from the suggestion.
- **Session state:** FOTO configs created before this change, in the same browser session, lack the two booleans. The wizard treats `undefined` as checked.

## 8. Git

Nothing was staged, committed, pushed or deployed. The working tree has 22 modified files plus two untracked reports: the planning report (unchanged) and this report.
