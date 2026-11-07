# FOTO export M5 — Export filename and package naming

Date: 2026-11-07, Europe/Oslo. Starting commit: `f00e439`, branch `feature/photo-workspace`. **Nothing was committed, pushed or deployed.**

Norwegian text in `«…»` is UI copy.

---

## 1. Summary

**FOTO exports now get one timestamped name, shared by the ZIP and its GML, with an optional label.** It works for all three profiles.

| Label | ZIP | GML inside it |
|---|---|---|
| none | `20261107-153500.zip` | `20261107-153500.gml` |
| `Torkopp PS` | `20261107-153500-Torkopp-PS.zip` | `20261107-153500-Torkopp-PS.gml` |

The old names, `photos-<profile>-<crs>.zip` and `photos.gml`, are gone.

**GML content is unchanged.** The seven Gemini goldens, the XML serializer and attachment naming have no diff. A new test also confirms that a labelled plan produces golden output.

**No regressions.** The only failures are six that also fail by name on a pristine `f00e439` (§6).

**Three things to review:**

1. **Filenames no longer show the profile or CRS.** The old name carried both. The new convention, as specified, does not, so two exports can only be told apart by time and label (§5).
2. **Norwegian letters become ASCII:** `Ø` → `Oe`, `Å` → `Aa`, `Æ` → `Ae`. This is my decision, because the brief left the handling open (§3).
3. **I did not see the new field on screen.** It sits below the fold in the screenshots the suite takes. Its behaviour is browser-tested, but its appearance needs a manual look (§9).

---

## 2. Final naming convention and timezone

`YYYYMMDD-HHmmss[-label]`, followed by `.zip` or `.gml`.

**Timezone: always Europe/Oslo wall-clock time, whatever the machine's timezone.**

- The same instant always gives the same name.
- The timestamp matches what Norwegian users see on the clock. UTC would be one or two hours off.
- In the hour repeated when summer time ends, two instants can format alike. This is documented in the module.

**The timestamp is read once, when the plan (the preview) is built.** That is the point where the Gemini UUIDs are also generated, so one plan means one set of identities and one name.

---

## 3. Label rules

`sanitizePhotoExportLabel`, applied in this order:

1. Normalise to NFC, so `å` typed as `a` + combining ring is treated like `å`.
2. Replace `æ ø å Æ Ø Å` with `ae oe aa Ae Oe Aa`.
3. Decompose and strip marks: `é` → `e`.
4. Turn every run of anything other than `A–Z a–z 0–9` into one `-`.
5. Drop a leading `-`, cut to **48 characters**, drop a trailing `-`.

**Results:**

- The output can only contain ASCII letters, digits and single hyphens. Traversal, Windows-invalid characters, control characters and trailing dots cannot survive.
- A label that reduces to nothing, such as `...` or `日本語`, gives the timestamp-only name.
- Reserved names such as `CON` need no handling, because the label always follows the timestamp.
- `_` and `.` also become `-`, so `fase_2.v3` becomes `fase-2-v3`.
- The Sámi letters `đ ŋ ŧ` do not decompose, so they become separators. `š č ž` become plain letters.

**Why ASCII rather than keeping `æøå`:** attachments keep their Norwegian names, but the package name passes through more tools (unzip utilities, FME, email), and ASCII is the one form that cannot be garbled. `Oe`/`Aa` are the standard Norwegian transliteration, whereas stripping `ø` to `o` would change words.

---

## 4. Implementation

**New module, `src/lib/photos/export/photoExportNaming.mjs`.** It has no dependencies and exports:

- `photoExportNames({ label, date })` returns `{ label, sanitizedLabel, timestamp, basename, zipFilename, gmlFilename }`, frozen.
- `sanitizePhotoExportLabel(label)` is also used for the live hint in the dialog.
- `formatPhotoExportTimestamp(date)`
- `PHOTO_EXPORT_LABEL_MAX_LENGTH`

**Plan.** `buildPhotoExportPlan` takes `configuration.label` and a new injectable `now` hook, and stores the result as `plan.naming`. `label` keeps the text as entered and `sanitizedLabel` is what reaches filenames.

**Package.** The GML member is now `plan.naming.gmlFilename`. This is one shared code path, so no exporter has its own naming.

**Dialog.**

- New field `«Etikett i filnavnet (valgfritt)»` with a live hint, for example `«Filnavn: ÅÅÅÅMMDD-TTmmss-Torkopp-PS.zip»`.
- The preview shows both filenames, and the download uses `plan.naming.zipFilename`.
- **Changing the label clears the preview**, like every other export setting, so a displayed name can never be out of date.

**Guidance text.**

- The Gemini `compatibility-import` warning named `photos.gml`. It now names the actual GML, because leaving it would have been wrong.
- The static dialog hint now says `«GML-filen»`, because the name does not exist until the preview does.

**Behaviour worth knowing:**

- A new preview is a new export, with a new timestamp and new Gemini UUIDs.
- Downloading the same preview twice gives the same name and the same bytes. The browser adds its usual `(1)` to the second file.
- Two previews in the same second with the same label would share a name. The browser's `(1)` keeps the files apart, and a person is unlikely to do this.

---

## 5. Compatibility

- **Unchanged:** namespaces, schema details, feature and geometry IDs, UUID generation, `fotolink` values, attachment names and paths, image bytes, ZIP member order, the fixed ZIP member time, and the `Attachments` folder beside the GML.
- **ZIP bytes now depend on the plan's name**, since the GML member name is stored in the archive. Two plans are only byte-identical with the same clock and label, so the existing determinism test now uses a fixed clock. The same plan is still byte-stable.
- **Gemini import of a GML not named `photos.gml` has not been tested.** Nothing in the XML refers to its own filename, so I expect no effect, but that is inferred, not measured. **Please include it in the next manual Gemini test.**
- **Filename no longer identifies the profile or CRS.** If that matters when several profiles are exported side by side, the label is the place for it for now, and M6 could suggest one.

---

## 6. Tests and build

Production build on `http://localhost:3110`, with `PHOTO_GML_FIXTURE` set to the Ekenesstokken corpus GML and `--test-concurrency=1` for browser suites.

| Check | Result |
|---|---|
| New `tests/photoExportNaming.test.mjs` | **14 of 14** |
| Export gate (16 files, including goldens, parity, package, serializers, Gemini compatibility) | 282: **277 pass, 0 fail, 5 skip** |
| All non-browser tests (143 files) | 1,550: 1,535 pass, **6 fail (baseline)**, 9 skip |
| Export browser suites (`photoLoadedGmiUi`, `photoEvidenceUi`, `photoCompletionUi`, `photoExportFlowUi`) | **35 of 35**, including corpus runs |
| Other photo/GMI browser suites (15 files) | 68: 67 pass, 0 fail, 1 skip |
| Production build | Pass, exit 0 |
| ESLint, all changed and new files | 0 errors, 0 warnings |
| `git diff --check` | Clean |
| `git diff tests/fixtures` | Empty |

**ESLint was run directly** on the changed files, not via `npm run lint`.

**Baseline failures, reported separately, not touched.** Three `validationV2WorkspaceInspector`, two `statsUiContract`, one `appInfoUiContract`. I ran those three files on a pristine `git archive` of `f00e439`: both give 22 tests, 16 pass, and the same 6 fail by name.

**Mutation checks.** Each of these failed at least one test and was then reverted:

| Mutation | Caught by |
|---|---|
| Use the machine's timezone | Timezone test |
| Remove NFC | Label table |
| Remove the length bound | Long labels |
| Allow dots in labels | Three label tests |
| Restore the fixed `photos.gml` member | All three profile tests, preview/download test |
| Restore `photos.gml` in the guidance | Import guidance test |

The first check exposed a flaw: my timezone test proved nothing on an Oslo machine, because the formatter is built on import. It now runs in child processes under Tokyo, New York and UTC.

**Requested coverage:**

| Area | Where |
|---|---|
| Matching basenames, empty and ordinary labels | `photoExportNaming`; browser in `photoLoadedGmiUi` |
| Norwegian characters, including decomposed `å` | `photoExportNaming` |
| Invalid characters, path traversal | `photoExportNaming` |
| Long labels | `photoExportNaming` |
| Stable timestamps | Fixed clock, summer/winter/midnight, one clock read per plan |
| Preview/download consistency | `photoExportNaming`; browser reads the name from the preview and opens the file with that exact name |
| All profiles, ZIP structure, attachment references | One test per profile, from `PHOTO_EXPORT_PROFILES` |

**Test changes to existing files.** Tests that named `photos.gml` or `photos-*.zip` now read the name from the plan or the preview. `photoLoadedGmiUi` also exercises a label through the real dialog.

**Not run:**

- The external XSD harness. GML content is unchanged, so it would compare identical output, but that is inferred.
- `tests/helpers/generateGeminiPhotoPackage.mjs`. It was updated for the new name but not executed.
- The full non-browser run predates the final timezone test edit. The export gate, which includes that test, was rerun after it.

---

## 7. Files changed

**New**

- `src/lib/photos/export/photoExportNaming.mjs`
- `tests/photoExportNaming.test.mjs`
- `docs/agent-reports/20261107-160845-photo-export-m5-naming.md`

**Modified, source**

- `src/lib/photos/export/photoExportPlan.mjs`
- `src/lib/photos/export/photoExportPackage.mjs`
- `src/components/photos/PhotoExportDialog.js`

**Modified, tests**

- `tests/helpers/generateGeminiPhotoPackage.mjs`
- `tests/photoCompletionUi.test.mjs`
- `tests/photoEvidenceUi.test.mjs`
- `tests/photoExportBaseline.test.mjs`
- `tests/photoExportPackage.test.mjs`
- `tests/photoGeminiCompatibility.test.mjs`
- `tests/photoLoadedGmiUi.test.mjs`

---

## 8. Deferred to M6

- **Move the label field into the wizard.** Pass `label` in the plan configuration and read `plan.naming`. No naming work is needed.
- **Label lifetime.** It is dialog state and is lost on close, like profile and CRS. If the wizard should remember it per layer, it belongs in `photoExportConfig.mjs`.
- **Default profile.** Skråfoto 2019 as the default is untouched.
- **Profile in the filename.** Decide whether the wizard should suggest a label, given §5.

---

## 9. Manual browser acceptance

1. Load a FOTO layer and open `Eksporter…`.
2. **Check the field's appearance:** scroll to `«Etikett i filnavnet (valgfritt)»` above `Lag eksportforhåndsvisning`. Confirm it looks right and the hint reads `«Filnavn: ÅÅÅÅMMDD-TTmmss.zip …»`.
3. Choose `Gemini VA · Skråfoto 2019`, leave the label empty and make a preview. Confirm `ZIP:` and `GML:` show the same current Norwegian time.
4. Download. Confirm the file has exactly the previewed name and the GML inside shares it, beside `Attachments`.
5. Type `  Grøft / nord  `. Confirm the preview disappears, the hint shows `-Groeft-nord.zip`, and the field still shows what you typed.
6. Make a new preview. Confirm the name has a newer timestamp and ends `-Groeft-nord`, and that the `«Importveiledning»` warning names the same GML.
7. Download and confirm the name again.
8. Enter a long label and `../../x`. Confirm the hint stays bounded and shows no path characters.
9. Repeat steps 3–4 with Legacy and AsBuilt 5.2.
10. **Import the unzipped package into Gemini**, since a GML not named `photos.gml` is untested there (§5).
