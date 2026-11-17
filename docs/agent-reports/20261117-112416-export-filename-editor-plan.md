# Export filename editor redesign: plan

**Status: PLANNING — NOT IMPLEMENTED.** No source, test or configuration file was changed.
**Date:** 2026-11-17
**Repository / branch / HEAD:** `C:/GitHub/gmi-validering-test`, `feature/photo-workspace`, `2e3a05d` (clean tree at start).
**Inputs:** the approved design in the task brief; implementation history in [the revision plan](20261116-161830-export-revision-filename-plan.md) and [its completion report](20261116-165829-export-revision-filename-completion.md). Where the history conflicts with the new requirements, the new requirements win.

Labels: **Observed** = read in code at HEAD. **Recommendation** = proposal. **Assumption** = not verified.

---

## 1. Summary

- **One owner for names already exists.** Every export filename comes from `photoExportNames` in `src/lib/photos/export/photoExportNaming.mjs`. A single `date` from `buildDeliveryPlan` feeds it. The redesign changes that module's rules and passes two flags plus a revision string through the existing configuration object. It adds no second naming path.
- **The 48-character limit is not only in the UI.** `sanitizePhotoExportLabel` truncates the label in the actual GMI, GML, ZIP and report filenames. The suggestion helper truncates to 42 characters plus the suffix. The Kun GMI input also has `maxLength={60}`. All three must go (§2.4).
- **Core state change.** The revision moves out of the editable text. `config.label` becomes the descriptive part only. The revision suffix is always derived from the live source, and `filenameTimestamp` and `filenameRevision` are two independent booleans (§3).
- **Contract changes needing explicit approval:** the timestamp format `HHmmss → HHmm`; the sanitizer now keeping `æøå`, spaces and ordinary punctuation instead of transliterating to ASCII (this also applies to FOTO Kun GML); and empty or reserved names failing closed. Several tests lock the old contracts and must be updated on purpose (§7.1).
- **One decision blocks implementation (D1):** a leading `YYYYMMDD-HHmm-` cannot be told apart from a contractor date-time prefix of the same shape (§6).

## 2. Confirmed findings (observed)

### 2.1 Flow from wizard state to download

| Stage | Location | What happens |
|---|---|---|
| Entry points | `src/components/gmi-edit/GmiExportDialog.js` (Rettinger, `gmi-only`, fresh `localConfig`); `src/components/photos/PhotoExportWizard.js` (FOTO, page-owned config per photo layer, kept for the session, not persisted) | Both render `src/components/delivery/DeliveryWizard.js` |
| Config default | `src/lib/photos/photoExportConfig.mjs:2` | `{ profile, crs, context, label: '', labelEdited: false }` |
| Config owner selection | `DeliveryWizard.js:130` | supplied config only while `photoId === initialPhotoLayerId`, otherwise `localConfig` |
| Source filename | `DeliveryWizard.js:131` | `gmi.descriptor?.filename`, which is the live binding's `File.name` (see the 2026-11-16 plan §2.5) |
| Suggestion | `DeliveryWizard.js:132-133` | `suggestRevisionLabel(sourceFilename)`; effective `label = config.labelEdited ? config.label : suggested` |
| Edit flag | `DeliveryWizard.js:134-138` | any patch containing `label` sets `labelEdited: true` |
| «Bruk forslag» | `DeliveryWizard.js:139-140`, `PhotoExportDeliveryStep.js:28` | shown when edited and different from the suggestion; resets to `{ label: '', labelEdited: false }` |
| Inputs (two copies) | Kun GMI: `DeliveryWizard.js:254-255` (`aria-label="Eksportetikett"`, `maxLength={60}`); other modes: `PhotoExportSettings`, `PhotoExportDeliveryStep.js:47-50` (no `maxLength`) | both followed by `FilenameHint` |
| Redundant text | `FilenameHint`, `PhotoExportDeliveryStep.js:23-32` | «Foreslått ut fra …» (`data-export-name-source`), the «Filnavn: ÅÅÅÅMMDD-TTmmss-…» line with «Tidspunktet settes når leveransen kontrolleres.» (`data-export-name-format`), and the «Etiketten har ingen tegn …» fallback |
| Plan build (one clock read) | `DeliveryWizard.js:192` → `buildDeliveryPlan(snapshot, { ...config, label })`, `src/lib/delivery/deliveryPlan.mjs:118-125` | `date = now()` once, at «Kontroller leveransen»; `naming = photoExportNames({ date, label })`, `naming.gmiFilename = basename + '.gmi'` |
| Kun GMI payload | `deliveryPlan.mjs:131` → `buildGmiFieldExport(..., { date, label })` → `gmiExportNames`, `src/lib/gmi-edit/exportGmi.mjs:45-50, 121` | builds its own copy of the name from the same inputs. The payload `filename` is informational only; the download uses `plan.filename` (`deliveryPlan.mjs:215`) |
| GML naming | `deliveryPlan.mjs:135, 158` → `buildPhotoExportPlan(..., { now: () => date })` → `photoExportPlan.mjs:61` `photoExportNames({ label: configuration.label, date: now() })` | a second call with the same date and label, so the names match |
| ZIP entries | `src/lib/delivery/deliveryPackage.mjs:14-16` | `naming.gmiFilename`, `naming.gmlFilename`, `Attachments/…` |
| Download | `src/lib/delivery/deliveryWizard.mjs:185` `save(blob, plan.filename)`; `DeliveryWizard.js:179-184` `<a download>` | the browser picks the final path |
| Report | `DeliveryWizard.js:219` | `${naming.basename}-leveranserapport.txt`; the report text lists `plan.filename` (`deliveryWizard.mjs:111`) |
| Pakke / review display | `DeliveryWizard.js:96, 275` | `plan.filename`, plus `data-export-zip` / `data-export-gml` |

### 2.2 Timestamp

- `formatPhotoExportTimestamp` (`photoExportNaming.mjs:13-19`) formats `YYYYMMDD-HHmmss` in Europe/Oslo time. `gmiExportNames` imports it too (`exportGmi.mjs:27`).
- The timestamp is taken when the plan is built, not when the editor opens. The download, report and ZIP entries all reuse that plan, so one export has one timestamp across all its artifacts. `tests/photoExportNaming.test.mjs:140-152` locks this («one clock read per generated export»). It also asserts that a plan built **one second** later gets a new name, a property that minute precision removes (§5.5).

### 2.3 Sanitizer and parsing

- `sanitizePhotoExportLabel` (`:25-31`): NFC; `æøå` transliterated to `ae/oe/aa`; accents stripped; every run outside `[A-Za-z0-9_]` becomes `-`; mixed runs collapse to `_` or `-`; leading separator trimmed; **`.slice(0, 48)`**; trailing separator trimmed.
- `suggestRevisionLabel` (`:34-46`): takes the last path segment; strips `.gmi` and ` (n)`; repeatedly strips plausible `YYYYMMDD-HHmmss` prefixes followed by `-` or the end of the name; detects a trailing `rev` revision with `/(?:^|[\s._-]+)rev[\s._-]?(\d{1,4})$/i`; returns the **sanitized**, truncated descriptive text joined with `_revNN`, or `revNN` when nothing descriptive is left.
- **The current rules damage contractor names on their own.** A date-only prefix such as `20261110 Ledninger` survives the prefix strip, but the sanitizer then rewrites it to `20261110-Ledninger`, transliterates `ø`, and truncates it. Only a contractor prefix of the exact `YYYYMMDD-HHmmss` shape is removed outright.

### 2.4 Where the 48 limit applies (investigation item)

1. **Actual filenames:** `sanitizePhotoExportLabel`, used by `photoExportNames` (GMI, GML, ZIP and report names) and by `gmiExportNames`.
2. **Suggestion:** `suggestRevisionLabel` cuts the descriptive part to `48 − suffix length`.
3. **UI:** Kun GMI `maxLength={60}`. This silently drops pasted text beyond 60 characters. `PhotoExportSettings` has no limit.
4. **Not present** in export configuration, readiness (`photoExportWizard.mjs` ignores the label) or validation.
5. **Tests that lock it:** `photoExportNaming.test.mjs:91-95, 205`.

### 2.5 Filename safety and collisions

- **No collision safeguard exists for the exported file itself.** Uniqueness relies on the seconds in the timestamp. Downloads go through the browser, which by default adds ` (1)` to a duplicate name rather than overwriting it. `suggestRevisionLabel` already strips that counter on re-import.
- **The "collision" code that exists covers ZIP-internal attachment paths only:**
  - `attachmentNames.mjs:45-58` handles attachment names;
  - `deliveryAttachments.mjs:25, 47` reserves `Attachments/` names against retained GMI paths.
  - GMI and GML sit at the ZIP root under different extensions, so they cannot collide with each other or with `Attachments/…`. These safeguards are unaffected by the redesign.
- **Non-ASCII ZIP entry names:** fflate sets general-purpose bit 11 (UTF-8) when the encoded name differs from the JS string length (`node_modules/fflate/esm/browser.js:1882`, `d[b++] = u && 8`). `æøå` in GMI and GML entry names will therefore be flagged as UTF-8. Whether Gemini VA and FME honour the flag is **unverified** (§9).
- **Reserved names:** the current comment («the label always follows the timestamp, so it cannot form a reserved device name») stops being true once the timestamp can be turned off.

### 2.6 Differences between artifact paths

- **Kun GMI:** file `<basename>.gmi`. The report uses the same basename.
- **Samlet / Delt:** ZIP `<basename>.zip` containing `<basename>.gmi`, and `<basename>.gml` when GML is included. Report as above.
- **Kun GML med bilder:** ZIP and GML only. There is no GMI source, so no revision source either (D7 from 2026-11-16 keeps it without a suggestion).
- **All paths share one `basename`.** The only divergence risk is the two independent calls, in `gmiExportNames` and in `photoExportPlan.mjs:61`, which must receive the same new options (§4.3).

## 3. Proposed state model

Extend the existing config. No new state owner:

```js
DEFAULT_PHOTO_EXPORT_CONFIG = { profile, crs, context,
  label: '',              // descriptive part as typed (no revision, no timestamp)
  labelEdited: false,     // unchanged meaning: user text wins once edited
  filenameTimestamp: true,
  filenameRevision: true }
```

Derived at render time in `DeliveryWizard` (no effects):

```js
const parts = parseSourceFilename(sourceFilename);      // { descriptive, nextRevision } | null
const descriptive = config.labelEdited ? config.label : parts?.descriptive ?? '';
const revision = hasGmi && config.filenameRevision && parts ? `rev${parts.nextRevision}` : '';
const filename = { descriptive, timestamp: config.filenameTimestamp, revision };
```

- **The revision always follows the live source.** It is never stored and never part of the user's text. Editing the descriptive part therefore no longer freezes the revision. Switching to a different GMI-kartlag updates the suffix and keeps the user's text.
- **«Bruk forslag»** restores only the descriptive part (`{ label: '', labelEdited: false }`, as today). It does not touch the checkboxes.
- **Checkbox toggles** are plain config patches and never set `labelEdited`. FOTO keeps them for the session per photo layer, as with every other setting. Rettinger starts fresh with both checked.
- **Kun GML:** there is no source, so `revision` is always `''` and the Revisjonsnummer checkbox is hidden (D4).

## 4. Filename construction rules

### 4.1 Parsing the source (`parseSourceFilename`, replaces `suggestRevisionLabel`)

1. Return `null` for an empty or non-string input. Otherwise NFC, trim, and keep the last `/` or `\` segment.
2. Strip `.gmi` (any case) and a trailing ` (n)`.
3. Strip leading **generated** prefixes, repeating while one matches. Each must be a plausible date and time followed by `-` or the end of the name:
   - `YYYYMMDD-HHmmss` (legacy);
   - `YYYYMMDD-HHmm` (new), subject to **D1**.
   - Nothing else is stripped: `20261110 Ledninger`, `20261110-Ledninger`, `2026-11-10_Ledninger` and `20261110_1430_…` stay.
4. Detect a trailing revision with the existing regex. `nextRevision = n + 1`, padded to `max(2, digits)` (unchanged). The descriptive part is the text before the match; without a match it is the whole stem and `nextRevision = '01'`.
5. Return the descriptive text **raw**: not sanitized and not truncated. The field shows what the contractor wrote.

### 4.2 Sanitizing the descriptive part (replaces `sanitizePhotoExportLabel`; applied only when composing)

- NFC.
- Replace each run of control characters (`\u0000-\u001F`, `\u007F`) and of `< > : " / \ | ? *` with `-`.
- Collapse whitespace runs to one space. Trim, then strip leading `.` and trailing `.` or space.
- Keep `æøåÆØÅ`, other letters, digits, spaces, `_ - . , ( ) & + '` and other characters Windows, macOS and Linux all accept. **No length cut.**
- Recognising `rev` still works on the raw text, because the regex accepts space, `.`, `_` and `-` as separators.
- **D2:** whether spaces are kept or mapped to `_`/`-`.

### 4.3 Composition (`photoExportNames({ date, descriptive, timestamp = true, revision = '' })`)

```
stamp = timestamp ? formatPhotoExportTimestamp(date) : ''      // 'YYYYMMDD-HHmm'
desc  = sanitizeExportDescriptive(descriptive)
base  = [stamp, desc].filter(Boolean).join('-')
basename = revision ? (desc ? `${base}_${revision}` : base ? `${base}-${revision}` : revision) : base
```

| Tidsstempel | Desc | Revisjon | Basename |
|---|---|---|---|
| ✓ | `Ledninger Nord` | ✓ | `20261117-1124-Ledninger Nord_rev02` |
| ✓ | `Ledninger Nord` | – | `20261117-1124-Ledninger Nord` |
| – | `Ledninger Nord` | ✓ | `Ledninger Nord_rev02` |
| – | `Ledninger Nord` | – | `Ledninger Nord` |
| ✓ | empty | ✓ | `20261117-1124-rev02` (re-import parses to `rev03`) |
| ✓ | empty | – | `20261117-1124` |
| – | empty | ✓ | `rev02` |
| – | empty | – | **invalid → blocked** |

- **Fail closed** (the wizard disables «Kontroller leveransen» and shows one line of text, and `photoExportNames` throws a coded error as a second line of defence):
  - `filename-empty`: «Filnavnet er tomt.»
  - `filename-reserved`: basename matches `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i`. «Filnavnet er reservert i Windows.»
  - `filename-too-long`: the longest artifact name, `<basename>-leveranserapport.txt`, exceeds 255 UTF-8 bytes. «Filnavnet er for langt for filsystemet.» (**D3**). This is a hard filesystem limit, not the advisory threshold.
- **Keep the API backwards compatible:** an existing `label` argument stays accepted as an alias for `descriptive`, so FOTO-only callers keep working. Make `gmiExportNames` delegate to `photoExportNames` so both use one rule. `buildDeliveryPlan` passes `{ descriptive, timestamp, revision }` from the configuration into all three sites: `deliveryPlan.mjs:124`, `:131` (`buildGmiFieldExport`) and `photoExportPlan.mjs:61` (via `photoOptions`).

### 4.4 Advisory length

- `exportFilenameLength({ descriptive, timestamp, revision, extension })` counts code points. A shown timestamp counts as the fixed 14 characters of `YYYYMMDD-HHmm-`, so the warning can be shown before the real time exists.
- The extension is that of the primary artifact: `.gmi` for Kun GMI, `.zip` otherwise.
- Constant `EXPORT_FILENAME_ADVISORY_LENGTH = 80`, exported from the naming module.
- Above it, show the warning; at or below it, remove it. Nothing else changes: no block, no truncation.

## 5. UI recommendation

### 5.1 Layout (replaces both label inputs and `FilenameHint`)

```
Filnavn
┌──────────────────────────────────────────────────────────────┐
│ ååååmmdd-ttmm- │ 20261110 Ledninger Nord sone 4    │ _rev02.gmi │
└──────────────────────────────────────────────────────────────┘
[✓] Tidsstempel   [✓] Revisjonsnummer                 Bruk forslag
Filnavnet er over 80 tegn.                     ← only when exceeded
```

- **New component:** `ExportFilenameEditor`, in `src/components/photos/PhotoExportDeliveryStep.js`, replacing `FilenameHint`. It renders in the same place for every mode.
  - `PhotoExportSettings` renders it instead of its label/input.
  - The Kun GMI branch in `DeliveryWizard.js:254-255` renders it instead of its inline input.
  - The result is one editor instead of two copies.
- **Wrapper:** a `div.delivery-filename` (flex, `--gmi-border-strong` border, `--gmi-surface` background). Keep the existing 34px height and 4px radius of `.photo-export-label input` so it matches the neighbouring selects.
- **Prefix and suffix:** non-editable `<span>`s in `--gmi-text-muted`, using tabular numerals.
  - The suffix shows `_revNN` (when on) plus the extension.
  - Showing the extension is a recommendation: it makes the 80-character count visible and replaces the old extension hint.
  - The placeholder text is `ååååmmdd-ttmm-` as approved.
- **Input:** `flex: 1; min-width: 0`, no `maxLength`, `autoComplete="off"`.
  - Long text scrolls inside the input. The text itself is never cut, and the full name shows in Pakke (`plan.filename`).
  - Its focus indicator moves to the wrapper: `.delivery-filename:focus-within` with the teal focus ring. The input's own outline may only be removed because the wrapper replaces it.
- **Accessibility:**
  - The visible label «Filnavn» is a `<label htmlFor>`.
  - The input gets `aria-describedby` = prefix id, suffix id and, when shown, the warning id, so screen readers hear the full structure without extra visible text.
  - The accessible name changes from «Eksportetikett» to «Filnavn» (D5).
- **Checkboxes:**
  - Native `<input type="checkbox">` inside visible `<label>`s, side by side (`flex; gap: 12px`), coloured with `accent-gmi-interactive`. The existing scoped `.delivery-exclusion input` already uses `accent-color: var(--gmi-interactive)`.
  - Revisjonsnummer is hidden in Kun GML.
  - When unchecked, the prefix or suffix span is removed. The editor does not reflow beyond that.
- **«Bruk forslag»:** stays the existing low-emphasis text button (`gmi-compact-button gmi-focus-ring text-gmi-interactive`), right-aligned in the checkbox row, under the same condition as today.
- **Warning:**
  - The wrapper gets `data-validation-tone="warning"`; scoped CSS uses `var(--validation-border)` and `var(--validation-bg)` (amber, orange-200/50) for border and fill.
  - The one-line text uses `--gmi-validation-compact-warning-text` and is referenced by `aria-describedby`. Use no `aria-invalid`, because the name is still valid.
  - **Contrast check needed:** the muted prefix on the orange-50 background must still reach 4.5:1.
- **Blocking errors** (§4.3) use the same slot. Set `aria-invalid="true"` on the input, use the error tone and disable the primary button. These are the required fail-closed explanations.
- **CSS:** add a few scoped rules under `.delivery-wizard .delivery-filename…` in `src/components/delivery/deliveryWizard.css`. Add no new colours.

### 5.2 Text removed

- «Foreslått ut fra …», «Filnavn: ÅÅÅÅMMDD-TTmmss-… .zip og .gml. Tidspunktet settes når leveransen kontrolleres.»
- «Etiketten har ingen tegn som kan brukes i filnavn …»: the new sanitizer keeps nearly everything, and a fully stripped name becomes `filename-empty`.
- The label «Etikett i filnavnet (valgfritt)».

### 5.3 Unchanged

- Pakke still shows the real `plan.filename`.
- Kontroll's summary, the report contents, delivery modes and the GMI-kartlag and Fotolag selects are unchanged.
- No wizard step is added.

### 5.4 Revision behaviour

| Scenario | Next suggestion |
|---|---|
| Both on: `20261117-1124-Ledninger_rev02.gmi` re-imported | `Ledninger` + `_rev03` |
| Timestamp off: `Ledninger_rev02.gmi` re-imported | `Ledninger` + `_rev03` |
| Revision off: `20261117-1124-Ledninger.gmi` re-imported | `Ledninger` + `_rev01` (the cycle restarts by design) |
| Both off: `Ledninger.gmi` | `Ledninger` + `_rev01` |
| Legacy `20261116-105236-Nord_rev001.gmi` | `Nord` + `_rev002` |
| User types `Ledninger_rev05` with revision on | `Ledninger_rev05_rev02`. The user's text is never rewritten; the warning and the visible suffix make this obvious |

### 5.5 Timestamp consequences

- With minute precision, two «Kontroller leveransen» runs in the same minute with the same inputs produce identical names.
- Inside one export the names stay consistent (one `date`).
- Across downloads, browsers add ` (1)` rather than overwrite, and the parser strips that counter on re-import.
- **Recommendation:** accept this. Add no further collision mechanism, because the brief asked for no seconds.

## 6. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| **D1** (blocking) | A leading `YYYYMMDD-HHmm-` is both the new generated format and a plausible contractor date-time. (A) Always strip it, so re-imports never duplicate a timestamp, but a contractor prefix of exactly that shape is lost. (B) Strip it only when the rest ends with a recognised revision or is empty; exports made with Revisjonsnummer off then gain a second timestamp on re-import. | **A**, with a unit test documenting the trade-off. Please confirm what shape the real contractor prefix had (for example `YYYYMMDD`, `YYYYMMDD-HHmmss` or `YYYY-MM-DD`), without sharing contents. The current code already strips `YYYYMMDD-HHmmss`, which may explain the acceptance finding. |
| D2 | Keep spaces in filenames, or map them to `_`? (`æøå` kept either way.) | Keep spaces. Risk: Gemini VA import is unverified (§9) |
| D3 | Hard limit: block above 255 UTF-8 bytes for the report name (the longest artifact)? | Yes. It is filesystem safety, not a style limit |
| D4 | Kun GML: hide Revisjonsnummer (no source), or show a fixed `_rev01`? | Hide |
| D5 | Rename the accessible name «Eksportetikett» to «Filnavn» (browser test selectors update)? | Yes |
| D6 | Include the extension in the grey suffix? | Yes, the primary artifact's extension |

## 7. Implementation boundaries

### 7.1 Files

1. `src/lib/photos/export/photoExportNaming.mjs`:
   - timestamp `HHmm`;
   - `parseSourceFilename`, replacing `suggestRevisionLabel`;
   - `sanitizeExportDescriptive`, replacing the label sanitizer;
   - `photoExportNames` options and coded errors;
   - length helper and constant;
   - remove `PHOTO_EXPORT_LABEL_MAX_LENGTH`;
   - update the header comment.
2. `src/lib/gmi-edit/exportGmi.mjs`: `gmiExportNames` delegates to `photoExportNames`; `buildGmiFieldExport` accepts and forwards the filename options. Bytes are untouched.
3. `src/lib/delivery/deliveryPlan.mjs:124, 131`: pass `{ descriptive, timestamp, revision }`. A naming error becomes a blocked plan or `DeliveryError`, mapped in `deliveryWizard.mjs` `deliveryMessage`.
4. `src/lib/photos/export/photoExportPlan.mjs:61`: same options from `configuration`.
5. `src/lib/photos/photoExportConfig.mjs`: two new booleans.
6. `src/components/delivery/DeliveryWizard.js`: derivation (§3), `canBuild` naming check, single editor in both branches, removal of the inline input.
7. `src/components/photos/PhotoExportDeliveryStep.js`: `ExportFilenameEditor` replaces `FilenameHint`; `PhotoExportSettings` uses it.
8. `src/components/delivery/deliveryWizard.css`: scoped editor rules.

**Not changed:**

- `deliveryPackage.mjs`, `exportZip.mjs`, attachment naming, source registry and edit sessions;
- verification and stale-source gates, GMI patching and bytes;
- GML XML (it never contains its own filename: `photoExportNaming.test.mjs:115`);
- delivery decisions and photo metadata.

### 7.2 Contract tests to update deliberately

- `tests/photoExportNaming.test.mjs`:
  - timestamp table and timezone checks (`:18-32`) → `HHmm`;
  - basename expectations (`:39-45, 106-108, 151, 160`);
  - sanitizer cases (`æøå` kept, no truncation);
  - E1-E20 table rewritten for `parseSourceFilename`;
  - `:151` becomes «same minute → same name; +60 s → new name».
- `tests/gmiEditSessions.test.mjs:325, 345, 477-479` and `tests/gmiEditWorkspace.test.mjs:307`: new format. `Å/../CON: x` → `20261109-1111-Å..-CON- x`-style output, with the exact expectation fixed in the test.
- `tests/deliveryPlan.test.mjs:360-367`.
- `tests/deliveryWizardUi.test.mjs:88-137`: selectors, source note and format hint assertions removed or replaced.
- `tests/photoLoadedGmiUi.test.mjs:245-265`: `-Groeft-nord.zip` hint replaced by the composed name.
- `tests/photoExportWizardUi.test.mjs:115`: unlabelled `^\d{8}-\d{4}\.zip$`.
- `tests/gmiEditWorkspaceUi.test.mjs:259-266`.
- `tests/photoCompletion.test.mjs` and `tests/photoExportWizard.test.mjs`: config shape and wiring assertions.

## 8. Regression and acceptance plan

### 8.1 Unit (`node --test`)

- **Parsing:**
  - contractor dates kept: `20261110 Ledninger`, `20261110-Ledninger_rev03`, `2026-11-10_Ledninger`;
  - generated prefixes stripped: legacy `HHmmss`, new `HHmm`, stacked;
  - implausible prefix kept;
  - ` (1)` stripped;
  - 120-character name returned whole;
  - `Grøft nord` returned raw;
  - D1 trade-off case pinned.
- **Sanitizer:**
  - reserved characters and control characters replaced;
  - no leading `.`, no trailing `.` or space;
  - `æøå` and spaces kept (per D2);
  - idempotent;
  - no length cut.
- **Composition:** the full matrix in §4.3, including `rev`-only, timestamp-only, `filename-empty`, `filename-reserved` (`CON`, `nul.txt`) and `filename-too-long` at 255/256 bytes.
- **Advisory length:** 80 → no warning, 81 → warning, counted with and without timestamp, for `.gmi` and `.zip`.
- **Delivery plan, per combination of the two checkboxes:**
  - `naming.basename`, `gmiFilename`, `gmlFilename`, `zipFilename`, `photoPlan.naming.gmlFilename`, the Kun GMI payload filename and the report name all share one basename;
  - one clock read;
  - ZIP entry names round-trip through `unzipSync`;
  - the local header of a `Grøft nord….gmi` entry has bit 11 set;
  - the GMI entry bytes equal the plan's GMI bytes, and a no-op is byte-identical to the source.
- **Focused files:** `photoExportNaming`, `gmiEditSessions`, `gmiEditWorkspace`, `deliveryPlan`, `deliveryWizard`, `deliveryExclusion`, `photoCompletion`, `photoExportWizard`.

### 8.2 Browser (fresh production build, serial, free port)

**Suite `deliveryWizardUi`:**

- The editor shows `ååååmmdd-ttmm-` with the full 70+ character contractor name untruncated and `_rev02.gmi`.
- Unchecking each box removes its part; the downloaded names match:
  - `^\d{8}-\d{4}-…_rev02\.gmi$`;
  - `^…_rev02\.gmi$`;
  - `^\d{8}-\d{4}-…\.gmi$`.
- Both boxes off with an empty field disables «Kontroller leveransen» and shows its reason.
- The warning appears at 81 characters and disappears at 80.
- The checkboxes' computed `accent-color` is `rgb(0, 117, 149)`.
- «Bruk forslag» restores the descriptive part. Navigation Kontroll ↔ Innhold keeps text and checkboxes.
- Switching GMI-kartlag keeps edited text and updates the suffix.
- Three export → re-import → export cycles with revision on, then one with timestamp off. The no-op GMI download stays byte-identical.

**Suites to re-run with updated expectations:** `gmiEditWorkspaceUi`, `photoExportWizardUi`, `photoLoadedGmiUi`, `photoExportReturnUi`.

**Screenshots** at 1280×720 and 1366×768: Kun GMI and Samlet, each with a short name, a long name with the warning, and both boxes off. Check that the row fits, nothing overflows horizontally, and the footer stays visible.

### 8.3 Other gates

`npx --no-install eslint` on the changed files, `npm run build`, the full serial Node suite (known baseline failures in memory/reports must be re-established at HEAD before being called pre-existing), and `git diff --check`.

### 8.4 Manual acceptance (real data, not automatable here)

- Real contractor file with a long name and a leading date: the name is preserved whole and the revision progresses over two export/re-import cycles.
- **Gemini VA import** of a GMI whose name contains `æøå` and spaces, and of a ZIP (Samlet) whose GMI and GML entry names contain them.
- Two downloads in the same minute: the browser keeps both files.

## 9. Risks

- **Assumption:** Gemini VA and FME accept non-ASCII and space-containing GMI filenames and UTF-8-flagged ZIP entry names. This is the largest unverified risk. If it fails, D2 or a transliteration fallback must be revisited. This plan does not reintroduce ASCII-only names, because the brief asks to preserve Norwegian characters.
- Changing the timestamp format and the sanitizer also changes FOTO Kun GML names. This is deliberate, for consistent naming across all paths.
- D1 (A) can remove a contractor prefix of exactly `YYYYMMDD-HHmm-`.
- Long names scroll inside the input. The full name is visible in Pakke, not in the editor at once.

## 10. Implementation brief (Sol Medium)

> **Task:** implement the export filename editor per `docs/agent-reports/20261117-112416-export-filename-editor-plan.md` §3-§5 and §7, with decisions D1-D6 as resolved by the user (defaults: D1-A, keep spaces, 255-byte block, hide revision in Kun GML, accessible name «Filnavn», extension in suffix).
> Branch `feature/photo-workspace`; verify HEAD and a clean tree first.
>
> **Library** (`photoExportNaming.mjs`):
> - timestamp `YYYYMMDD-HHmm` (Europe/Oslo, unchanged clock source);
> - `parseSourceFilename` → `{ descriptive (raw, untruncated), nextRevision }`, stripping only path, `.gmi`, ` (n)`, plausible legacy `YYYYMMDD-HHmmss-` and new `YYYYMMDD-HHmm-` prefixes, and a trailing `rev` suffix;
> - `sanitizeExportDescriptive`: filesystem safety only, keep `æøå`, no truncation;
> - `photoExportNames({ date, descriptive|label, timestamp = true, revision = '' })` per §4.3, throwing coded `filename-empty`, `filename-reserved` and `filename-too-long` errors;
> - `exportFilenameLength` plus `EXPORT_FILENAME_ADVISORY_LENGTH = 80`;
> - remove the 48 limit.
>
> **Wiring:**
> - `gmiExportNames` delegates to `photoExportNames`;
> - `buildDeliveryPlan` and `buildPhotoExportPlan` pass the same `{ descriptive, timestamp, revision }` to every naming call, keeping the single `date`;
> - naming errors block the plan with a Norwegian `deliveryMessage`.
>
> **Config:** add `filenameTimestamp: true` and `filenameRevision: true`. `label` holds only the descriptive text; `labelEdited` keeps its meaning.
>
> **Wizard:**
> - derive descriptive and revision at render time (no effects);
> - the revision follows the live source and is never stored;
> - `canBuild` also requires a valid composed name.
>
> **UI:**
> - replace `FilenameHint` and both label inputs with one `ExportFilenameEditor` (grey prefix `ååååmmdd-ttmm-`, editable input without `maxLength`, grey `_revNN.ext` suffix, focus ring on the wrapper via `:focus-within`);
> - checkboxes «Tidsstempel» and «Revisjonsnummer» side by side with `accent-gmi-interactive`, Revisjonsnummer hidden in Kun GML;
> - «Bruk forslag» as the existing text button;
> - amber warning tone and the line «Filnavnet er over 80 tegn.» only above 80;
> - remove «Foreslått ut fra …», the «Filnavn: ÅÅÅÅMMDD-TTmmss…» line and the label «Etikett i filnavnet»;
> - scoped CSS only, existing tokens only.
>
> **Do not change:** GMI bytes, patching and verification, ZIP construction, attachment naming, delivery decisions or photo metadata.
>
> **Tests:** update the §7.2 contracts deliberately; add the §8.1 unit and §8.2 browser coverage, including the ZIP UTF-8 flag check and byte-identical no-op downloads. Run focused Node, ESLint, `npm run build` in an isolated copy if the shared `.next` is in use, the serial browser suites on a free port, the full serial Node suite and `git diff --check`. Inspect screenshots at 1280×720 and 1366×768.
>
> **Report:** write a timestamped completion report. Do not stage, commit or push without authorisation. No subagents.

## 11. Commands and Git status

- **Commands:** read-only checks only: `git rev-parse`, `git status`, `grep`, `sed`/`cat` reads and one `date`. Nothing was built or run.
- **Changes:** no source, tests, configuration or `AGENTS.md` changed. The only new file is this untracked report.
- **Git:** nothing was staged, committed or pushed.
