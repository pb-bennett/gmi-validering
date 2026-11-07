# FOTO automatic metadata adoption

Date: 2026-11-07, Europe/Oslo. Branch `feature/photo-workspace`, starting from `cec1ba9`. **Nothing was committed or pushed.**

Norwegian text in `«…»` is UI copy.

---

## 1. Summary

**Available source metadata is now accepted automatically, and users only step in to correct something or supply what no source has.** The rule lives in the canonical session, not the UI.

| | Before | After |
|---|---|---|
| Direction | Adopted by hand, separate GML `0°` workflow | GML, then EXIF, then a default `0°` that is recorded as a default |
| Capture time | Adopted by hand per source | Complete GML, then complete EXIF, otherwise left empty |
| Position | Up to one dropdown change per photo | GML proposed on every matching row, then one confirmation |
| Real corpus (148 photos), hub status | `148 må rettes før eksport` | `Ingen opplysninger mangler for dette målet`, with no action taken |

**Contractor shape, rebuilt synthetically:** 40 positions proposed and accepted, 40 directions (29 × `0°`, 11 non-zero), 0 false conflicts, 26 times, 14 left empty, nothing blocking. **The real 40-photo delivery was not available to me**, so this still needs your browser acceptance (§10).

**Test result: no new regressions.** The only domain failures are the same six baseline ones. All FOTO browser suites pass, apart from the private suite that is skipped.

**Four things need your attention:**

1. **GML `0°` beats a real EXIF heading.** This is what you specified, but it means a contractor system that writes `0` for "not recorded" will override a true EXIF heading. It is reported calmly (§3.2), never hidden.
2. **I removed the `direction-all-zero` recommendation.** `0°` is now ordinary, so warning on it contradicts the new policy. `direction-defaulted` takes its place (§3.2).
3. **Fotograf is unchanged, so EXIF Artist still needs adopting.** It was not in the agreed rules. Tell me if you want it automatic too (§9).
4. **Many existing tests were rewritten**, because they pinned the superseded policy. That is the largest risk in reviewing this pass (§7).

---

## 2. Design

**One pure policy module, one call site.**

- `src/lib/photos/photoAutoMetadata.mjs` holds the rules: `planAutoDirection` and `planAutoCaptureTime`. Each returns the value to write, or `null` to leave things alone.
- `autoAcceptMetadata()` in `photoSession.mjs` applies them to layer members **before every publication**. No route that brings in a source, photo or occurrence can miss it: initial import, append, late GML, late EXIF, or new GMI occurrences.

**`acceptance: 'auto'` is what makes a value replaceable.** Anything else is a person's decision and is never touched. That covers manual values, an explicitly chosen source, and the older `'source'` acceptance.

| Current value | A better source arrives |
|---|---|
| None, or default `0°` | Replaced |
| Automatic EXIF | Replaced by GML |
| Automatic GML | Kept. A second GML does not displace the first |
| Manual, or a source chosen by a person | Never replaced |
| Time removed by a person | Stays empty (`captureTimeCleared`), even if a new source arrives |

**Why a repeated run is safe:** a plan returns `null` when the same evidence is already in use, so identities hold and export plans do not go stale for no reason.

**Evidence is never altered.** EXIF and GML values stay in `metadataEvidence` and `directionEvidence`. Accepted values keep their source precision, so `123.4567` is exported exactly and shown as `123°`.

---

## 3. Implementation decisions

### 3.1 Position

`planPhotoSourcePositions` now proposes GMI object positions, then GML, then a lone EXIF position.

- **A proposal is not an acceptance.** The user still confirms it. Nothing moves until then.
- GML is also proposed over an **EXIF** position already in use, never over a manual or GML one.
- A GML file added during a review is proposed for rows nobody has touched. Late EXIF still never widens a review.
- **Added beyond the brief:** `Foreslå GML/EXIF for viste` now skips manual positions. A manual position can only be replaced on its own row. This follows "preserve manually corrected positions", but it does change that button.
- Two GML sources matching one photo give no proposal, because neither has authority. The user chooses.

### 3.2 Direction

- **The default waits for the EXIF read.** A heading still being read is never exported as a default. GML does not wait.
- `basis: { kind: 'default' }` separates a default from a source `0°`.
- **On the map a default reads as unknown:** no arrow, a ghost knob, and an empty Edit field. Otherwise it would look like an observed north heading. It still exports as `0°`.
- **Confirming north works.** Typing `0` over a default saves a manual `0°`, because the Edit baseline treats a default as unset.
- **Comparison is circular and precision-aware** (`directionsAgree`). Two headings agree when the gap is within the last place of the coarser source, or under half a degree, whichever is larger. So `123` and `123.9` agree, `359.9` and `0.1` agree, and `123` and `124` differ. The half-degree floor is my choice: below it, whole-degree display cannot show a difference.
- `usable-zero`, `zero-review`, `includeZero` and `Kontroller 0° på kartet` are gone.
- New recommendations: `direction-defaulted` and `direction-sources-differ`. The second only reports automatic values, because a person's value has already settled the question.

### 3.3 Capture time

- Complete means second or fraction precision. A GML time without seconds falls through to a complete EXIF time.
- A time without seconds stays as evidence with `Tid uten sekunder`. Nothing is invented.
- A timezone is never borrowed from the other source.
- `capture-time-sources-differ` reports real differences. Precision-only differences are not reported, using the existing `captureTimesAgree`.

### 3.4 Missing capture time (Option A)

Gemini generation already did not block on time, so the serializer and plan are unchanged. What is new:

- `PhotoExportStatus` appears in the hub and the export dialog, with a specific warning:
  «2 bilder mangler full opptakstid. Eksporten kan lages, men GML-filen oppfyller ikke kravet til opptakstid i Skråfoto 2019-skjemaet. Det er ikke verifisert at Gemini VA godtar en slik pakke.»
- Three separate answers follow it: `Eksportpakke`, `Skråfoto 2019-skjema` and `Import i Gemini VA`.
- The schema line always says `XSD-validering er ikke kjørt`, because only rules are checked.
- The import line never claims success.
- Legacy and AsBuilt still block on missing time, so the warning does not appear there.

### 3.5 Edit transaction

**A layer with an open Edit session is skipped, and catches up when the session ends.** Save and Discard compare against a fixed baseline, so an EXIF read finishing mid-session would otherwise cause a false `edit-conflict`. Evidence still arrives during the session; only acceptance waits. Staged values still never reach `photoSession`.

### 3.6 Fullfør opplysninger

- Adoption buttons, the sample block, the agreement text and the `0°` block are removed.
- Summary strip: `Fra kilde`, `Manuelt`, `Standardverdi`, `Mangler`.
- A default is **not** outstanding work, so Retning shows done. It has its own open group, `Standardretning 0°`, with selection, `Angi på kartet` and `Samme retning…`.
- Every accepted row has `Rett på kartet`. Source values are folded under `Kildeverdier (n)`.
- The opening task is now whatever is genuinely missing.
- Routine notes are neutral, so amber is reserved for the schema warning.
- The hub's return note counts defaults (`Retning: 3 gjenstår.`), to agree with the map bar, even though the task itself shows done.

---

## 4. Files changed

**Created**

| File | Purpose |
|---|---|
| `src/lib/photos/photoAutoMetadata.mjs` | The policy |
| `src/components/photos/PhotoExportStatus.js` | Warning and three-level status |
| `tests/photoAutoMetadata.test.mjs` | 36 regression tests |

**Modified, domain:** `photoSession`, `photoDirection`, `photoCaptureMetadata`, `photoEvidenceAdoption`, `photoManualFill`, `photoPositioning`, `photoEditSession`, `photoCompletion`, `photoPresentation`, `photoWorkspaceView`, `export/photoExportReadiness`, `export/photoExportDiagnostics`.

**Modified, UI:** `PhotoCompletionDialog`, `…DirectionPanel`, `…TimePanel`, `…Rows`, `photoCompletion.css`, `PhotoCaptureMetadataDialog`, `PhotoEditCommandBar`, `PhotoEditLayer`, `PhotoEvidenceActions`, `PhotoExportDialog`, `PhotoMapPopup`, `PhotoMarkersLayer`, `PhotoPositioningWizard`, `PhotoSourcesInfoDialog`, `PhotoWorkspaceCollection`, `PhotoWorkspaceInspector`.

**Not changed:** `photoExportXml`, `photoExportPlan`, `photoExportPackage`, `photoExportRules`, `page.js` and the M0 golden fixtures. Unrelated Validator rules were not touched.

---

## 5. Test results

Production build, Chrome, `PHOTO_GML_FIXTURE` set to the real 148-photo corpus, `--test-concurrency=1` for browser suites.

| Check | Baseline | Final |
|---|---|---|
| Domain suite | 1,490: 1,474 pass, 6 fail, 10 skip (no corpus) | **1,523: 1,513 pass, 6 fail, 4 skip** (corpus on) |
| FOTO/GMI browser suites (18 files) | Not measured on this commit | **102: 101 pass, 0 fail, 1 skip** |
| ESLint on photo code, `page.js` and the new test | 0 errors | **0 errors** |
| Production build | Pass | **Pass** |
| `git diff --check` | Clean | **Clean** |

The final full browser run had one failure, in `pending EXIF`. It was a test bug: the test read folded text. I fixed the test and reran `photoCompletionUi` on the same build, which gave 10 of 10. The other 17 files were not rerun after that test-only change.

The browser test count fell because I deleted two tests whose feature is gone (§7).

**Baseline failures, unchanged by name:** three `validationV2WorkspaceInspector`, two `statsUiContract`, one `appInfoUiContract`.

**Skips:** the private G01/G04 browser suite, plus GMI corpus and `REF_FILES` tests needing other fixtures.

**Not run:**

- **The external XSD harness.** No serializer changed, so this is inferred rather than re-measured.
- **Gemini WFS browser suites.** No code they cover changed; not re-measured.
- **`terrainPhotoGml`.** Excluded, as it fails at import on baseline and gives no coverage.
- **A real Gemini VA import** of a package with missing times. That is exactly what remains unverified.

---

## 6. Requested regression coverage

| Area | Where |
|---|---|
| Initial import | `photoAutoMetadata`: draft route, wizard route, append |
| Late GML matching | `photoAutoMetadata`: defaults and EXIF give way; recheck rewrites nothing |
| Source priority | `photoAutoMetadata`: pure rules for direction and time |
| Manual overrides | `photoAutoMetadata`: direction, time, position, removed time, chosen source |
| GML zero / default zero | `photoAutoMetadata`, `photoGmlDirectionEvidence`, `photoCompletion` |
| Missing capture time | `photoAutoMetadata`, `photoCompletion`, `photoCompletionUi` |
| Source precision | 11 comparison cases, XML precision test, whole-degree labels |
| Save/Discard | `photoAutoMetadata`, `photoExportFlow`, `photoExportFlowUi` |
| The 40-photo shape | `contractor shape` in `photoAutoMetadata` |

---

## 7. Existing tests changed

**Reviewing this matters more than usual: 28 test files changed, because they pinned the policy you replaced.**

- **Deleted:** two browser tests for a removed feature (double-click into adoption buttons, and the `0°` action), plus the domain tests of the `0°` route. Selection narrowing and double-click guards stay covered in `photoExportFlowUi` and `photoCompletion`.
- **Rewritten to the new outcome:** adoption tests in the session, chain, corpus and hub suites.
- **Fixtures:**
  - `exportFixture({ direction: null })` now holds the EXIF read pending, because that is the only state where a direction can be unknown. This kept the parity matrix honest with no test-only flag in production code.
  - `photoWorkspaceFixtures` no longer gives `IMG_2` a heading.
  - `photoDirectionUi` now always uses its synthetic source. **It no longer runs against the real corpus,** whose GML `0°` values would answer the question it asks. The corpus is still covered by the hub, flow and evidence suites.
- **Unchanged and passing:** the parity matrix, serializer tests and M0 goldens. Those assertions are as they were; only the fixture above changed.

---

## 8. Remaining issues

1. **An export preview built while EXIF is still reading goes stale** when defaults land. The app then asks for a new preview. This is correct, but users may notice it on large imports.
2. **Direction is applied to unplaced occurrences too.** Harmless, as they are not exported, but the inspector shows `Standardretning 0°` for an unplaced photo.
3. **Two GML sources that disagree:** the first attached stays and the difference is reported. The brief did not cover this.
4. **A photo with one complete and one partial time that differ** uses the complete one and reports the difference.
5. **`PhotoEvidenceActions` remains in the export dialog.** Its time and direction buttons are almost always `0 kan brukes` now. See §9.

---

## 9. Deferred

**To the export wizard**

- Remove or replace `PhotoEvidenceActions` and its manual fill in the export dialog.
- Decide where `PhotoExportStatus` belongs in the wizard.
- Move the `Bildedata leses` and stale-preview states into the wizard's flow.

**Later UI refinements (not done)**

- Position comparison: visual hierarchy, provenance colours, concise distance differences.
- `Ulike posisjoner fra kildene` is still shown in its existing amber style. Only the hub notes were made neutral.
- Clearer wizard actions and bulk-selection scopes.
- Collapsing long lists by default in the positioning wizard.
- Teal checkbox styling. The hub checkboxes are still browser default.

**Your decision**

- Should EXIF Artist be accepted automatically? It is not exported to Gemini, so nothing depends on it yet.

---

## 10. Recommended manual acceptance

Use the independent contractor delivery (40 photographs and the matched GML).

1. Import the photos with `Fra GML-fil`. Expect 40 placed with no dropdown changes.
2. Open `Fullfør opplysninger…`. Expect Retning done, Opptakstid showing 14 and the amber warning naming 14.
3. Confirm there is no `direction-sources-differ` note. The 11 rounded angles must not appear as differences. **This is the check I could not run on real values.**
4. Open `Ferdig` in Retning and check that `Kildeverdier` shows the decimals while the row shows whole degrees.
5. Import without GML, then add it through `Koble og posisjoner bilder…`. Expect GML proposed on every row and `40 valgt`.
6. Correct one position and one direction by hand, then recheck the GML. Both must survive.
7. `Rett på kartet` on a `0°` row: Discard keeps it, Save replaces it.
8. Fill a missing time and check that the warning count drops.
9. Generate the Gemini package with the times still missing, and **import it into Gemini VA**. That result should update `PHOTO_EXPORT_IMPORT_EVIDENCE.missingCaptureTime`.
