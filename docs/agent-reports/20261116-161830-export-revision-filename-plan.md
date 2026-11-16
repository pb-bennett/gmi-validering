# Planning draft: revision-based filename suggestions in the export wizard

**Status:** PLANNING DRAFT. Nothing has been implemented. It needs review and the decisions in §8 before implementation.
**Date:** 2026-11-16
**Repository / branch / HEAD:** `C:/GitHub/gmi-validering-test`, `feature/photo-workspace`, `9877925`
**Working tree at start:** only the five untracked report files and assets listed in the session's git status. This task adds one file: this report.

Evidence labels: **Observed** means read in the code or run against it at HEAD. **Recommendation** is a proposal. **Assumption** has not been verified.

---

## 1. Summary

- **Where the change goes:** a single pure helper, `suggestRevisionLabel(sourceFilename)`, in the existing naming module `src/lib/photos/export/photoExportNaming.mjs`. It turns the imported GMI filename into a suggested *label*, the text in «Etikett i filnavnet».
- **Naming pipeline unchanged:** `photoExportNames` and `buildDeliveryPlan` stay as they are. They still turn `{date, label}` into the timestamped basename, so the GMI, GML, ZIP and report names keep one shared basename.
- **Wizard change:** `DeliveryWizard` shows the suggestion for as long as the user has not typed in the field. A new `labelEdited` flag in the existing export config records the first manual edit. From then on the user's text always wins.
- **Blocking question (D1):** the current sanitizer turns every `_` into `-`, so `_rev01` can never reach a filename as written. That rule is locked by `tests/photoExportNaming.test.mjs`. Before implementation the user must choose: allow `_` in labels (a deliberate contract change), or use `-rev01`.

## 2. Existing naming flow (observed)

### 2.1 One wizard, two entry points

| Entry | File | Mode / config owner |
|---|---|---|
| Rettinger «Last ned» | `src/components/gmi-edit/GmiExportDialog.js:7-9` | `initialMode="gmi-only"`, no `config` prop, so the wizard's own `localConfig` (fresh on every opening) |
| FOTO export | `src/components/photos/PhotoExportWizard.js:6-10` | page-owned per-photo-layer config from `src/app/page.js:178, 415, 744-747` (`photoExportConfigs` Map, kept for the session, never persisted: `photoExportConfig.mjs:1`) |

Both render `src/components/delivery/DeliveryWizard.js`. The steps are Innhold → Kontroll → Pakke / Last ned (`deliveryWizard.mjs:13`).

### 2.2 Label state

- `DEFAULT_PHOTO_EXPORT_CONFIG = { profile, crs, context, label: '' }` (`src/lib/photos/photoExportConfig.mjs:2`).
- `DeliveryWizard.js:119` `localConfig`. `:129` chooses which config applies: the supplied config only while `photoId === initialPhotoLayerId`, otherwise the local one. `:130-133` `changeConfig(patch)` sends the patch to the right owner.
- There are two label inputs, and both write only `config.label`:
  - gmi-only: an inline `<input aria-label="Eksportetikett" maxLength={60}>` (`DeliveryWizard.js:247-248`), with no filename hint.
  - photos-only/split/combined: `PhotoExportSettings` (`src/components/photos/PhotoExportDeliveryStep.js:41-44`), plus `FilenameHint`, which says «Filnavn: ÅÅÅÅMMDD-TTmmss-<label>.zip og .gml» (`:23-27`).
- The label is free text, stored as typed. Nothing recalculates it during step navigation, mode changes or layer changes (`:234, :237, :240` change mode/layer ids only). Today a manual edit therefore can never be overwritten.
- Readiness ignores the label on purpose (`src/lib/photos/photoExportWizard.mjs:8`).

### 2.3 From label to filenames

1. `build()` (`DeliveryWizard.js:178-190`) calls `buildDeliveryPlan(snapshot, config)`.
2. `buildDeliveryPlan` (`src/lib/delivery/deliveryPlan.mjs:118-125`) takes `date = now()` **once** and calls `photoExportNames({ date, label })`. That gives `basename`, `zipFilename` and `gmlFilename`. It then sets `naming.gmiFilename = basename + '.gmi'`.
3. In gmi-only mode `buildGmiFieldExport(..., { date, label })` (`deliveryPlan.mjs:131`) also builds its own names through `gmiExportNames` (`src/lib/gmi-edit/exportGmi.mjs:45-50`). It uses the same date and label, so the result is identical. The plan's `filename` comes from `naming` (`deliveryPlan.mjs:215`).
4. FOTO GML planning calls `photoExportNames({ label: configuration.label, date: now() })` again, with the shared date (`src/lib/photos/export/photoExportPlan.mjs:61`, `deliveryPlan.mjs:135, 158`).
5. ZIP entries are `naming.gmiFilename`, `naming.gmlFilename` and the attachments (`src/lib/delivery/deliveryPackage.mjs:14-16`). The report is `${naming.basename}-leveranserapport.txt` (`DeliveryWizard.js:212`).

**Observed consequence:** as long as the wizard hands one label to `buildDeliveryPlan`, the GMI, GML, ZIP and report names match. No other code needs to change to keep them consistent.

### 2.4 Name format and sanitizer (observed, run at HEAD)

- Basename: `YYYYMMDD-HHmmss` in Europe/Oslo time, plus `-<sanitizedLabel>` when a label is present (`photoExportNaming.mjs:16-19, 34-38`).
- `sanitizePhotoExportLabel` (`:25-30`): NFC, Norwegian letters transliterated (`ø→oe`, `å→aa`, `æ→ae`), accents stripped, every run of characters outside `[A-Za-z0-9]` becomes `-`, a leading `-` is trimmed, the result is cut to `PHOTO_EXPORT_LABEL_MAX_LENGTH = 48`, then a trailing `-` is trimmed.
- Current output from the sanitizer:

| Label in | Sanitized |
|---|---|
| `Ledninger_rev01` | `Ledninger-rev01` |
| `20261116-105236-Ledninger_rev03` | `20261116-105236-Ledninger-rev03` |
| `LEDNINGER_REV01` | `LEDNINGER-REV01` |
| `'x'×46 + '_rev01'` | `'x'×46 + '-r'`: **truncation cuts off the revision** |

- **Contracts in tests:** `tests/photoExportNaming.test.mjs` asserts `'fase_2.v3' → 'fase-2-v3'`. It also asserts that every ZIP name matches `/^\d{8}-\d{6}(?:-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)?\.zip$/`. `tests/gmiEditSessions.test.mjs:476-480` asserts `gmiExportNames`.

### 2.5 Where the original filename lives (observed)

- `createLoadedGmiSources().register(layerId, data, file)` saves `binding.filename = file.name`, the exact imported `File` (`src/lib/photos/loadedGmiSource.mjs:18`). It is kept in memory only, never in Zustand or persistence.
- The edit registry passes it on unchanged. `statusOf(entry)` includes `filename: entry.binding.filename` for the loading, error, editable and read-only states (`src/lib/gmi-edit/editSessions.mjs:110`). The document gets the same name (`:205`), and export payloads carry `source.filename` (`exportGmi.mjs:136`).
- In the wizard it is available as `gmi.descriptor?.filename` (`useGmiEditLayer`, `src/components/gmi-edit/useGmiEditLayer.js:30-33`). The wizard opens the session automatically in every GMI mode (`DeliveryWizard.js:125`). The `unloaded`/`unavailable` descriptors have **no** filename (`editSessions.mjs:176-180`). Export is blocked in those states anyway, because `canBuild` requires `descriptor.state === 'editable'` (`DeliveryWizard.js:144`).
- `layer.name` in the store is also `file.name` when the layer is added (`src/lib/store.js:2184`). It is persisted, though, and is not tied to the live source. **Recommendation:** do not use it.
- The source file is never written: the export path only reads bytes (`loadedGmiSource.mjs` `readBytes`; `exportGmi.mjs:18` «Nothing is ever written back»). A filename suggestion only changes the name of the downloaded file.

### 2.6 Existing tests that touch naming (observed)

- Unit: `tests/photoExportNaming.test.mjs`, `tests/gmiEditSessions.test.mjs:476`, `tests/deliveryPlan.test.mjs` (ZIP entry names), `tests/deliveryWizard.test.mjs`.
- Browser:
  - `tests/deliveryWizardUi.test.mjs` sets `M10` / `Fresh-check` through `[aria-label="Eksportetikett"]` and imports `Syntetisk M10.gmi`.
  - `tests/gmiEditWorkspaceUi.test.mjs:259-266` sets `Rettet` and expects `/^\d{8}-\d{6}-Rettet\.gmi$/`.
  - `tests/photoExportWizardUi.test.mjs:115` and `tests/photoLoadedGmiUi.test.mjs:245` expect an **unlabelled** `/^\d{8}-\d{6}\.zip$/` in photos-only mode.
  - `tests/photoLoadedGmiUi.test.mjs:258-265` checks that the field value keeps exactly what the user typed (`'  Grøft / nord  '`) and that the hint shows `-Groeft-nord.zip`.

## 3. Recommended design and behaviour

### 3.1 User-facing behaviour

- **GMI in the delivery** (Kun GMI, split and combined): when the wizard opens, «Etikett i filnavnet» is **prefilled** with the suggested next revision, for example `Ledninger_rev02`. It is a real field value, not a placeholder, so the user can see it is editable and edit it in place.
- **Source note:** a short line under the field names the source, for example «Foreslått ut fra Ledninger_rev01.gmi.». The filename hint shows the final form: `ÅÅÅÅMMDD-TTmmss-Ledninger_rev02.gmi` for gmi-only, `.zip` with `.gmi`/`.gml` for the ZIP modes. The exact copy is decision D4.
- **Manual edits win:** once the user types, the label is theirs. Changing step, delivery mode, GMI-kartlag or Fotolag never replaces it. Clearing the field is also a manual choice (timestamp only), not a request to restore the suggestion.
- **Restoring the suggestion:** a low-emphasis text button «Bruk forslag» appears when the manual text differs from the current suggestion (D3).
- **Kun GML med bilder (photos-only):** no suggestion; behaviour stays as today, timestamp only unless the user types a label. Reasons:
  - the GML package is not a revision of a GMI;
  - `deliveryPlan.mjs:134` says this mode deliberately keeps standalone scope and names;
  - the photos-only browser tests above assert unlabelled names.
- **No usable source filename** (no GMI layer selected, source not retained): no suggestion, so the empty label is kept as today.

### 3.2 Why a derived suggestion, not prefilling stored state

- **Observed:** the FOTO label lives in a page-owned config that is shared across wizard openings (`page.js:415`). Writing a suggestion into that config would need effects that overwrite it on source changes, and those effects would have to guess whether the text came from the user.
- **Recommendation:** keep `config.label` as the user's own text and compute the effective label at render time:

```js
const sourceFilename = hasGmi ? gmi.descriptor?.filename ?? null : null;
const suggestedLabel = suggestRevisionLabel(sourceFilename);          // '' when none
const label = config.labelEdited ? config.label : suggestedLabel;     // what the field shows and the plan gets
```

- This adds no effects, no stored suggestion and no race when the source changes. The suggestion follows the selected GMI until the user edits the field. After that it never changes the field.

## 4. Proposed helper and integration points

### 4.1 `suggestRevisionLabel(sourceFilename) → string`

It goes in `src/lib/photos/export/photoExportNaming.mjs`, next to the sanitizer it relies on. That module already owns every export name and is imported by `exportGmi.mjs`, so no second naming system is created. The function is pure and synchronous, and it returns a label, not a filename. Steps:

1. `''` if the input is not a non-empty string. Otherwise NFC, trim, and keep only the text after the last `/` or `\` (defensive; `File.name` has no path).
2. Remove a final `.gmi`, in any letter case. Other extensions are not removed (see E9).
3. Remove a trailing browser duplicate counter ` (n)` (`/\s*\(\d{1,3}\)$/`), added when the same name is downloaded twice (see D5).
4. Remove leading **generated** timestamp prefixes, repeating while one matches: `^YYYYMMDD-HHmmss` followed by `-` or the end of the name. Each prefix must be a plausible date and time (month 01-12, day 01-31, hour 00-23, minutes and seconds 00-59). Nothing else is removed, so dates inside the descriptive name stay.
5. Detect a trailing revision with `/(?:^|[\s._-]+)rev[\s._-]?(\d{1,4})$/i`. If found: `next = n + 1`, padded to `max(2, digits.length)`; the descriptive part is the text before it. Otherwise `next = 1` (`01`) and the whole stem is descriptive.
6. `suffix = '_rev' + NN` (or `-rev` under D1-B). `descriptive = sanitize(desc)` is cut to `48 − suffix.length`, then trailing separators are trimmed. This keeps the revision inside the 48-character limit (see §2.4).
7. Return `descriptive ? descriptive + suffix : 'rev' + NN`.

The returned label already has its final form, so the existing sanitizer leaves it unchanged. A unit test asserts this.

### 4.2 Config flag

- Add `labelEdited: false` to `DEFAULT_PHOTO_EXPORT_CONFIG` (`photoExportConfig.mjs:2`).
- In `DeliveryWizard.changeConfig`, any patch that contains `label` also sets `labelEdited: true`. Both existing inputs then work without their own changes.
- «Bruk forslag» sends `{ label: '', labelEdited: false }`.
- `reconcilePhotoExportConfig` already drops configs for removed photo layers.

### 4.3 Wizard wiring (`DeliveryWizard.js`)

- Compute `sourceFilename`, `suggestedLabel` and the effective `label` as in §3.2.
- Give the inputs the effective label as their value: `value={label}` for the gmi-only input, `config={{ ...config, label }}` for `PhotoExportSettings`.
- `buildDeliveryPlan(snapshot, { ...config, label })`. `buildDeliveryPlan`, `photoExportNames`, `gmiExportNames`, `deliveryPackage` and the report name stay unchanged.
- Show the source note and the D3 control next to the label field, in the gmi-only branch and through an optional prop on `PhotoExportSettings`/`FilenameHint`.

## 5. Rules for suggestions and manual overrides

| Situation | `labelEdited` | Field shows |
|---|---|---|
| Wizard opens with a GMI mode | false | suggestion from the selected GMI |
| User types (including clearing the field) | → true | exactly what was typed |
| Step Innhold ↔ Kontroll ↔ Pakke | unchanged | unchanged. The plan already holds its filename, and going back drops the review as today |
| Switch GMI-kartlag | false | new layer's suggestion |
| Switch GMI-kartlag | true | the user's text (never replaced) |
| Switch delivery mode to photos-only | false | empty (timestamp only) |
| Switch delivery mode to a GMI mode | false | suggestion |
| Switch delivery mode, any direction | true | the user's text |
| Switch Fotolag away from the FOTO entry layer | either | that layer's own config, as `:129` works today |
| Reopen the FOTO wizard in the same session | kept | as the user left it |
| Reopen the Rettinger wizard | fresh `localConfig` | suggestion (today: empty) |
| «Bruk forslag» | → false | current suggestion |
| Source becomes stale or unavailable | either | suggestion disappears if unedited. Build is blocked as today |

Timestamps are unchanged: they are set when the plan is built, so each «Kontroller leveransen» gets a new time and the same label.

## 6. Edge cases and expected outcomes

These outcomes assume D1-A (underscore allowed). Under D1-B, read `-rev` for `_rev` and `-` for `_` in the descriptive part.

| # | Imported filename | Suggested label | Note |
|---|---|---|---|
| E1 | `Ledninger.gmi` | `Ledninger_rev01` | default |
| E2 | `Ledninger_rev01.gmi` | `Ledninger_rev02` | |
| E3 | `Ledninger_rev09.gmi` | `Ledninger_rev10` | |
| E4 | `Ledninger-rev3.gmi` | `Ledninger_rev04` | separator normalised, minimum width 2 |
| E5 | `20261116-105236-Ledninger_rev03.gmi` | `Ledninger_rev04` | generated prefix removed |
| E5b | `20261116-105236-Ledninger-rev03.gmi` (today's real output) | `Ledninger_rev04` | |
| E6 | `Ledninger_rev99.gmi` / `_rev001.gmi` | `Ledninger_rev100` / `Ledninger_rev002` | width grows / is kept (D2) |
| E7 | `LEDNINGER_REV01.GMI`, `Ledninger Rev 1.gmi` | `LEDNINGER_rev02`, `Ledninger_rev02` | descriptive case kept, `rev` token lower case |
| E8 | `Ledninger` (no extension; GMI detected from content, `FileUpload.js` `detectFormat`) | `Ledninger_rev01` | |
| E9 | `Ledninger.txt` (GMI by content) | `Ledninger-txt_rev01` | only `.gmi` is removed |
| E10 | `Ledninger 2026-11-16.gmi`, `20261116 Ledninger.gmi`, `2026-11-16_Ledninger.gmi` | `Ledninger-2026-11-16_rev01`, `20261116-Ledninger_rev01`, `2026-11-16_Ledninger_rev01` | dates in names are not the generated prefix |
| E11 | `20261116-105236.gmi` (earlier unlabelled export) | `rev01` → file `…-rev01.gmi` → next time `rev02` | keeps the cycle going |
| E12 | `20261116-105236-20261115-090000-Ledninger_rev02.gmi` | `Ledninger_rev03` | stacked prefixes all removed |
| E13 | `20261399-999999-Ledninger.gmi` | `20261399-999999-Ledninger_rev01` | implausible prefix kept |
| E14 | `20261116-105236-Ledninger_rev03 (1).gmi` | `Ledninger_rev04` | browser duplicate counter (D5) |
| E15 | `Ledninger_rev01_final.gmi` | `Ledninger_rev01_final_rev01` | only a trailing revision is recognised |
| E16 | `Ledningerrev01.gmi`, `Ledninger_v2.gmi`, `Ledninger_rev.gmi` | `Ledningerrev01_rev01`, `Ledninger_v2_rev01`, `Ledninger_rev_rev01` | a separator before `rev` and digits after it are both required. `v2`/`r2` are not recognised (D6) |
| E17 | `Grøft nord.gmi` | `Groeft-nord_rev01` | existing transliteration |
| E18 | `日本語.gmi`, `.gmi` | `rev01` | nothing usable is left |
| E19 | 60-character name | first `48 − 6` characters + `_rev01` | the revision always fits |
| E20 | `rev05.gmi` | `rev06` | |

**Several input layers:** each delivery takes one GMI (the GMI-kartlag select). The suggestion follows that layer's live binding. Two layers with the same filename give the same suggestion. That is harmless, because the timestamp separates the downloads. **Observed:** `editSessions.mjs:20-21` never lets two layers share a session, even when the filenames match.

## 7. Implementation scope and test plan

### 7.1 Files likely to change

1. `src/lib/photos/export/photoExportNaming.mjs`: add `suggestRevisionLabel`. Under D1-A, also let the sanitizer keep `_` (see below).
2. `src/lib/photos/photoExportConfig.mjs`: add `labelEdited: false` to the default.
3. `src/components/delivery/DeliveryWizard.js`: effective label, `changeConfig` flag, plan input, source note and D3 control for the gmi-only field.
4. `src/components/photos/PhotoExportDeliveryStep.js`: optional `sourceNote`/`onUseSuggestion` props on `PhotoExportSettings`, and a per-mode extension in `FilenameHint` (D4). The FOTO-only use (`PhotoExportDeliveryStep`) stays unchanged.
5. Possibly `src/components/photos/photoExportWizard.css` (scoped) for the note line. Existing hint styles should be enough.
6. Tests (below), plus a completion report in `docs/agent-reports/`.

**Not changed:** `deliveryPlan.mjs`, `deliveryPackage.mjs`, `exportGmi.mjs` (except the comment under D1-A), source registry and edit sessions, verification gates.

**D1-A sanitizer change (if approved):**

- Keep `_`. Replace runs of other characters with `-`.
- A separator run that contains `_` collapses to `_`, otherwise to `-`.
- Trim leading and trailing `-`/`_`.
- Update the tests in `photoExportNaming.test.mjs` on purpose:
  - `'fase_2.v3' → 'fase_2-v3'`;
  - the safe-name regex gains `_` inside segments.
- Keep the remaining safety cases: traversal, reserved characters, control characters, the length bound and no trailing separator.
- This also changes FOTO names for labels that contain `_`. Underscore is safe on Windows, macOS, Linux and in ZIP entry names.

### 7.2 Focused tests

**Unit (`tests/photoExportNaming.test.mjs`):**

- the table E1-E20;
- the sanitizer returns `suggestRevisionLabel(x)` unchanged, for every case;
- the length bound keeps the revision;
- `null`, `undefined` and non-string input → `''`;
- the input value is never mutated (strings, trivially), and the function makes no I/O;
- under D1-A, the updated sanitizer expectations.

**Unit (`tests/deliveryPlan.test.mjs` / `tests/deliveryWizard.test.mjs`):** with label `Ledninger_rev02` in combined mode, the GMI and GML entries and the ZIP filename share `<ts>-Ledninger_rev02`, and the report name follows.

**Browser (`tests/deliveryWizardUi.test.mjs`, which already imports `Syntetisk M10.gmi`):**

- On opening, the field shows `Syntetisk-M10_rev01`.
- Kontroll → Tilbake keeps it.
- After typing `M10`, switching mode and survey layer keeps `M10`.
- «Bruk forslag» restores the suggestion.
- The downloaded GMI name matches `^\d{8}-\d{6}-Syntetisk-M10_rev01\.gmi$`, and its bytes stay identical to the existing assertions.

**Browser, existing suites to re-run unchanged:**

- `gmiEditWorkspaceUi` (sets `Rettet` explicitly);
- `photoExportWizardUi` and `photoLoadedGmiUi` (photos-only stays unlabelled; the typed label is kept as typed);
- `photoExportReturnUi`.

**Checks:**

- `npx --no-install eslint` on the changed files;
- `node --test` on the affected unit files;
- the browser suites above, run serially on a fresh production build;
- `npm run build`;
- `git diff --check`;
- a visual check of the Innhold step at 1280×720 and 1366×768, for gmi-only and combined.

## 8. Decisions needed from the user

| # | Decision | Recommendation |
|---|---|---|
| **D1** | Underscore: (A) allow `_` in sanitized labels so `Ledninger_rev02` appears as written. This is a contract change that also affects FOTO labels. (B) Keep the current sanitizer and suggest `Ledninger-rev02` | **A**. It matches the requested examples and keeps descriptive names such as `Ledninger_Nord` intact. Recognition works with either. |
| D2 | Width of an existing revision: keep a wider width (`rev001 → rev002`) or always use 2 digits | Keep, with minimum 2 |
| D3 | Offer «Bruk forslag» after a manual edit? | Yes, as a text-styled button, shown only when the text differs from the suggestion |
| D4 | Hint copy: «Foreslått ut fra <fil>.» and a per-mode extension hint, including for gmi-only, which has none today | Yes. Small copy change in the existing hint |
| D5 | Remove the browser duplicate counter ` (1)`? What about «- Kopi»/«- Copy»? | Remove ` (n)` only |
| D6 | Recognise only `rev` (with `-`, `_`, space or `.` before it), or also `v2`/`r2` | `rev` only. `v2` is too often part of a descriptive name |
| D7 | Photos-only (Kun GML): no suggestion (recommended), or a suggestion from a linked GMI | No suggestion |
| D8 | Rename the field label «Etikett i filnavnet (valgfritt)», for example to «Navn i filnavnet»? | Keep the label. Its tests and `aria-label` stay |

## 9. Risks and remaining acceptance

- **Assumption:** a Gemini VA re-import accepts `_` in filenames. The user's own examples use it; it has not been tested here.
- The suggestion depends on the live binding's `File.name`. If the browser reports a different name (for example after drag and drop from an archive), the suggestion follows it. Manual acceptance: run import → export → re-import twice with a real file and confirm the revision goes up each time.
- The existing `maxLength={60}` on the gmi-only input versus the 48-character sanitized length is not changed (recorded, out of scope).

## 10. Commands run and Git status

- Read-only checks only: `git status`/`branch`/`rev-parse`, ripgrep and file reads, and one `node --input-type=module -e` call that runs the existing sanitizer on sample labels (output in §2.4).
- No application code was changed and nothing was built. Nothing was staged, committed or pushed. The only new file is this report.
