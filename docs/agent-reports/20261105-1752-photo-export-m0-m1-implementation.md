# FOTO export M0 + M1 — implementation

Date: 2026-11-05, Europe/Oslo. Branch `feature/photo-workspace`, starting from clean HEAD `5705880`. **Nothing was committed, pushed or deployed.**

Specification: `20261104-1823-photo-export-overhaul-planning.md`, decisions D1–D7. Only M0 and M1 were implemented.

Norwegian text in `«…»` is UI copy.

---

## 1. Summary

**The defect is fixed.** On the private 148-photo Ekenesstokken corpus with its GML attached:

| Measure | Before (HEAD) | After |
|---|---|---|
| Photos with a false capture-time conflict | 148 | **0** |
| Photos eligible for explicit EXIF adoption | 0 | **148** |
| `fotograferingstidspunkt` elements after adoption | 0 | **148, all matching EXIF to the second** |
| Photos with GML direction evidence | 0 | 148, all `usable-zero`, none accepted |

The result holds in Node and in the real app through to the downloaded ZIP (§5).

The Gemini output is unchanged. All seven golden documents still match, no frozen export file has a diff, and Legacy and AsBuilt bytes are identical.

**One point to review closely:** on this corpus all 148 GML directions are `0°`, and the explicit `0°` route has no UI until M3. Gemini still requires direction, so a user can export this corpus today only by entering a direction manually. That follows D1 and D2, but it means capture times alone do not unblock the corpus (§8).

---

## 2. M0 baseline, before any production change

M0 tests were written and run first, with `git status` showing no change under `src/`.

| Check | Result |
|---|---|
| Domain selection at clean HEAD, before new tests | 1,260 tests: 1,249 pass, 6 fail, 5 skip |
| Domain selection with M0 tests added | 1,291 tests: 1,280 pass, the same 6 fail, 5 skip |
| New M0 tests, with corpus | **31 tests: 31 pass** |
| Export and compatibility regressions (9 files) | 141 tests: 140 pass, 1 skip (`REF_FILES` absent) |
| External XSD harness | 12 of 12 as expected (§7) |
| M0 tests rerun against a pristine `git archive` of HEAD | 31 of 31 pass |

The six failures are the known unrelated contract tests: three `validationV2WorkspaceInspector`, two `statsUiContract` and one `appInfoUiContract`.

### What M0 adds

| File | Protects |
|---|---|
| `tests/photoExportBaseline.test.mjs` | Gemini golden documents, UUIDv4 strategy, document head, root attribute order, namespace, EPSG:5972 and Z placeholder, package layout, `Attachments` paths, original bytes, profile set, Gemini time policy, plan errors per scenario |
| `tests/fixtures/photo-export-gemini/*.gml` | Seven golden documents: seconds, fraction + offset + repeated, UTC, missing time, date-only, minute, Unicode collision |
| `tests/photoEvidenceExportChain.test.mjs` | Permanent real JPEG bytes → exifr → evidence → explicit adoption → XML for all three profiles. Closes the test gap in plan §3 |
| `tests/photoExportCorpus.test.mjs` | Opt-in corpus regression using `PHOTO_GML_FIXTURE` |

UUIDs in goldens are replaced in order of first appearance, not blanked. Identity relationships therefore stay pinned, such as feature `gml:id` = `id` + `lokalId`. Generated XML is compared untouched, so a stray CR still fails. Only the stored golden side folds CRLF, because `core.autocrlf` is on.

There is deliberately no golden update mode: a golden failure means accepted output moved.

The M0 corpus test covers only what stays true after M1 (the EXIF-only route, and evidence retained after attaching GML), so it did not need to change. The M1 assertions are in a separate file.

**M0 files were not changed by M1.** SHA-256 of all 11 M0 test and golden files matched after the final build.

---

## 3. M1 implementation

### Capture-time agreement (F1, F4)

`captureTimesAgree(a, b)` and `allCaptureTimesAgree(values)` are in `photoCaptureMetadata.mjs`. Two values agree when their wall clocks match at the lower precision of the two and their offsets are equal or at least one is unknown. `+00:00` and `Z` count as the same offset.

`evidenceValuesConflict` in `photoEvidenceAdoption.mjs` is now the single definition of conflict. `evidenceEligibility` and `photoMetadataConflict` both use it, and a test checks that they agree across a grid of 12 × 12 × 13 evidence combinations. A search of `src` found no other capture-time conflict evaluation.

### GML direction evidence (F7)

`gmlDirectionEvidence(source, entry)` is in `photoDirection.mjs`.

| Input | Status | Value |
|---|---|---|
| Plain decimal in range, unit `1`, reference `1` | `usable` | Parsed |
| Value that normalizes to exactly 0 | `usable-zero` | 0 |
| Valid value, any other or missing unit or reference | `unsupported-reference` | `null` |
| Empty, negative, out of range, exponent, hex, comma decimal | `invalid` | `null` |
| No direction element | No evidence | |

- Raw text, source id, filename and entry id stay on the evidence. They also carry into `direction.current.basis` on adoption.
- Assets now start with `directionEvidence: []`, and `drainMetadata` keeps non-EXIF items, so GML evidence survives EXIF finishing later, with success or failure.
- `adoptSourceEvidence(…, 'direction', 'gml', ids, { includeZero: true })` is the explicit domain route for M3. It has no UI.
- `planEvidenceAdoption` adds `counts.zeroNeedsReview`.

### Other corrections

| Item | Change |
|---|---|
| F5 | `photoCaptureTimeStatus` gives `«Opptakstid kjent»`, `«Opptakstid i kilde»` or `«Uten opptakstid»`. The `Mangler opptakstid` filter stays accepted-based |
| F12 | `hasPlaceholderSeconds` plus a dialog guard. Saving the untouched `:00` prefill shows `«Kilden har ikke sekunder. Oppgi sekunder.»` and writes nothing |
| F13 (D5) | A valid `DateTimeOriginal` survives a bad offset or subsecond tag. Raw tags stay, and `issues` names what was ignored (`invalid-offset`, `invalid-subsecond`) |
| F16 | The import preview uses `formatPhotoCaptureTime` |

---

## 4. Evidence-handling decisions

**Taken directly from the plan**

- Subseconds are ignored. `14:33:02.012` and `14:33:02.5` therefore agree, as §8.3 specifies. No precision is lost, because the requested source's exact value is what gets accepted.
- `12:33:02Z` and `14:33:02+02:00` conflict, because Gemini would export different clocks.
- Agreement never moves information between sources. Adopting GML beside an EXIF `+02:00` leaves the timezone unknown.

**Decided during implementation, for your review**

1. **`includeZero` does not override a real heading.** With EXIF 45° and GML 0°, an explicit `includeZero` request reports `conflicting`. The plan's exclusion protects a real EXIF heading from a false conflict, so letting the zero win when asked would defeat its purpose. The default request reports `zeroNeedsReview`, and EXIF adoption still works.
2. **GML `360` counts as `usable-zero`.** Anything that normalizes to exactly 0 takes the cautious route, so there is one rule. The raw `360` is kept.
3. **A `GML-retning` row was added to the existing export dialog.** Without it, non-zero GML direction would be supported in the domain but unreachable by users until M3. It is an explicit button and shows the held-back `0°` count. It is one tuple plus one count fragment, and it is easy to drop if you prefer to wait for M3.
4. **Several agreeing sources of one kind offer the value with seconds.** This state only became reachable through M1: two GML sources at minute and second precision now agree.
5. **The direction disclosure was renamed** from `«Retningsdata fra bildet»` to `«Retningsdata fra kilder»`, because it now shows GML. Each line names its source. GML unit mismatches read `«Ukjent enhet eller referanse»`, since a wrong unit is not a magnetic reference.

**Not changed**

- Genuine EXIF north (`0°`, reference `T`) stays ordinary evidence and still conflicts with a real non-zero GML heading.
- No direction or time is accepted automatically.
- Gemini capture time stays non-blocking.

---

## 5. Real 148-photo corpus

Private files stayed in `C:\Temp\gmi-photo-test`. Tests assert counts only, so no filename or time reaches a log. Nothing private was added to Git.

**Defect reproduced on a pristine HEAD export:** `{"photos":148,"eligible":0,"conflicting":148,"inspectorConflicts":148,"gmlDirectionEvidence":0}`

| # | Acceptance step | Node: real exifr, real parser, xmldom | Real app: Chrome, production build |
|---|---|---|---|
| 1 | Parse 148 JPEGs | 148 | 148 |
| 2 | Attach the GML | 148 with EXIF + GML evidence | Attached through the workspace wizard |
| 3 | Zero false conflicts | 0 in adoption, 0 in inspector | `0 i konflikt`, no inspector warning on the selected photo |
| 4 | All eligible for adoption | 148 from EXIF, 148 from GML | `EXIF-tid: 148 kan brukes`, `GML-tid: 148 kan brukes` |
| 5 | Explicit EXIF adoption | 148, provenance `exif` with both sources recorded | `Bruk EXIF-tid for alle mulige (148)` |
| 6 | Gemini export | 0 plan errors, 148 features | ZIP downloaded and unzipped |
| 7 | Times match EXIF to the second | 148 of 148 | 148 of 148 |

Direction handling differed between the two runs, because Gemini blocks without it:

- The Node run first confirms 148 `direction-required` errors, then uses `includeZero`.
- The browser run enters one manual value, because no UI accepts GML `0°` before M3.

In the browser run, the expected times were read from the JPEGs by a separate exifr call in the test process, not through the app. This run also closes the plan's open item for a full browser pass over import, GML, adoption and download, including exifr's real chunked `File` path.

---

## 6. Files changed

**Production (10 files).** None of `photoExportPlan.mjs`, `photoExportXml.mjs`, `photoExportPackage.mjs`, `attachmentNames.mjs` or `exportContract.mjs` has a diff. `git diff --stat -- src/lib/photos/export/` is empty.

| File | Change |
|---|---|
| `src/lib/photos/photoCaptureMetadata.mjs` | Agreement functions; D5 |
| `src/lib/photos/photoEvidenceAdoption.mjs` | Shared conflict rule; zero handling; `zeroNeedsReview` |
| `src/lib/photos/photoDirection.mjs` | `gmlDirectionEvidence`; source metadata on adoption |
| `src/lib/photos/photoSession.mjs` | GML direction on attach; late-EXIF fix; `includeZero` |
| `src/lib/photos/photoPresentation.mjs` | Chip status; evidence text; GML source label; shared conflict |
| `src/lib/photos/photoCaptureTimeInput.mjs` | `hasPlaceholderSeconds` |
| `src/components/photos/PhotoCaptureMetadataDialog.js` | Minute-precision guard |
| `src/components/photos/PhotoWorkspaceInspector.js` | Chip; direction evidence text |
| `src/components/photos/PhotoImportPreview.js` | Shared formatter |
| `src/components/photos/PhotoEvidenceActions.js` | `GML-retning` row |

**New tests.** The M0 files in §2, plus `photoCaptureAgreement`, `photoGmlDirectionEvidence`, `photoCaptureEvidenceCorpus` and `photoEvidenceUi`. Helpers: `photoExportGolden`, `photoEvidenceFixtures`, `photoCorpusFixtures`.

**Changed tests.**

- `photoCaptureMetadata.test.mjs`: the planned intentional D5 change. Malformed offset and subsecond now keep the clock, and an invalid date still gives `null`.
- `photoInspectorPresentation.test.mjs`: additions only.

No other existing assertion was changed or weakened.

---

## 7. Final verification

All runs used the final code and a production build of it. Corpus runs set `PHOTO_UI_URL=http://localhost:3110` and `PHOTO_GML_FIXTURE`, with `--test-concurrency=1` for browser suites.

| Check | Result |
|---|---|
| Production build | Pass |
| ESLint, 22 changed and new files | 0 errors, 0 warnings |
| `git diff --check` | Clean |
| Focused M0 + M1 selection (11 files) | 195 tests: 195 pass. Run before the last wording changes; the same tests are in the final domain run below |
| Domain selection | **1,364 tests: 1,354 pass, 6 fail, 4 skip** |
| Photo/GMI browser selection (all `*Ui.test.mjs` except `statsChartUi`) | **85 tests: 84 pass, 0 fail, 1 skip**, 329 s |
| Gemini browser suites + `geminiWorkflowUi` | **107 tests: 107 pass** |
| `terrainPhotoGml` | 1 fail, baseline (see below) |
| Gemini goldens | All 7 unchanged |
| Legacy and AsBuilt SHA-256 baselines | Pass, assertions unchanged |
| Legacy and AsBuilt synthetic XSD output | Byte-identical before and after M1 (5 documents compared) |

### Baseline failures and regressions

**No new failures.**

- The 6 domain failures match the baseline by name.
- `terrainPhotoGml` fails with `Failed to fetch dynamically imported module`, before any check runs. It fails identically on a pristine HEAD export, as reports since Pass 1 have recorded. **Its checks therefore provide no coverage here.**

The domain skip count fell from 5 to 4 only because this run set `PHOTO_UI_URL`, which enabled the `rendered FOTO dialog` test, and it passed. The remaining skips are three GMI corpus tests (`GMI_PHOTO_CORPUS` and `GMI_PHOTO_EKENES` unset) and the `REF_FILES` comparator. The one browser skip is the private G01/G04 suite, for the same reason.

### XSD harness

Run offline with the existing lxml 6.1.3 and libxml2 2.11.9, on the 57 cached schema files, with no network. The results match plan §4 before and after M1, 12 of 12 each:

| Output | Result |
|---|---|
| Gemini with seconds; with fraction and offset; UTC | Valid |
| Gemini with missing, date-only or minute time | Invalid at `fotograferingstidspunkt`, as expected |
| Gemini with direction removed (test shape only) | Invalid at `retningsvektor`, as expected |
| Legacy and AsBuilt, EPSG:25832 and 25833 | Valid |
| AsBuilt with unknown direction | Valid |

The contract is unchanged. Gemini still produces schema-invalid output when times are missing, with 0 plan errors. M2 addresses that reporting.

---

## 8. Known limitations

- **The corpus still needs a direction before Gemini export.** All 148 GML directions are `0°`, and no UI accepts them until M3. Today's only route is entering a value manually. Note that the old dialog's bulk field accepts `0`, which D1 warns against encouraging; its M3 replacement carries the warning copy.
- **Agreement ignores subseconds entirely.** Two sources differing only below one second are accepted as agreeing. The accepted source's exact fraction reaches Legacy and AsBuilt XML.
- **An accepted minute value cannot gain only a timezone.** Saving requires changing the time field, because otherwise seconds would be invented.
- **A true `:00` needs a deliberate edit.** The user must change the time field and change it back. Retyping `00` over `00` may fire no change event in Chrome.
- **`issues` on EXIF evidence are not shown in the UI.** The inspector shows the raw tags and the `tidssone ukjent` note.
- **Offsets, EXIF direction and placeholder tags are proven on synthetic files only**, because the corpus has none. This repeats plan §3.
- **The F2/F3 silent omission remains for users who do not adopt.** Gemini still exports without times and says little about it. M2 and the wizard fix that.
- **Goldens are fixed to synthetic input.** They do not cover real-file coordinate values.

---

## 9. Remaining tasks for M2

- Extract `photoExportRules.mjs` and call it from the plan, with M0 goldens as the gate.
- Add `photoExportReadiness.mjs` with the three levels, profile metadata, `PHOTO_EXPORT_IMPORT_EVIDENCE` and `classifyCaptureTime`.
- Extend the `PLAN_ERRORS` table in `photoExportBaseline.test.mjs` into the full parity matrix.
- Add the level matrix, so missing-time Gemini output is reported as a schema gap (F17).
- Add `capture-time-utc`, `direction-all-zero` and the other questionable-value rules, with thresholds.
- Fix `direction-required` wording (F9) and add diagnostic labels (F3, F10). The M0 tests pin codes, not messages, so these will not fail them.
- Fix the `Z` warning text (F14).

M3 can build the `0°` action on `includeZero` and `zeroNeedsReview`, which are both ready.

The real Gemini gates G1–G3 are unchanged and still need someone with Gemini VA access.

---

## 10. Browser acceptance needed

Automated browser runs cover these, but none has had a human review. No screenshots were taken.

| Where | Check |
|---|---|
| Inspector chip | `«Opptakstid i kilde»` fits at narrow widths and reads well beside the other chips |
| Inspector | `«Retningsdata fra kilder»` lines read clearly, including `0°` and long GML filenames |
| Rediger opptaksdata | Minute-precision source: the message is clear, and the `:00` confirmation route is acceptable. Check native time input behaviour |
| Eksporter dialog | New `GML-retning` row, and whether you want to keep it before M3 |
| Import preview | `Tatt` now reads `12.05.2026 14:33:02,012` instead of the old locale format |
| Whole flow | One manual run of the corpus: import, GML, adopt, download |

Pass 1D acceptance stays separate and was not affected. All Pass 1D browser suites passed in the selection above.

---

## 11. Reproduction

```
npm run build
npx next start -p 3110

$env:PHOTO_UI_URL='http://localhost:3110'
$env:PHOTO_GML_FIXTURE='C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml'

node --loader ./tests/esmJsLoader.mjs --test tests/photoExportBaseline.test.mjs tests/photoEvidenceExportChain.test.mjs tests/photoExportCorpus.test.mjs tests/photoCaptureAgreement.test.mjs tests/photoGmlDirectionEvidence.test.mjs tests/photoCaptureEvidenceCorpus.test.mjs
node --test --test-concurrency=1 tests/photoEvidenceUi.test.mjs
```

**Readiness:** M0 and M1 are ready for Git review. The only failures are the seven baseline failures above. Browser acceptance in §10 is still pending.
