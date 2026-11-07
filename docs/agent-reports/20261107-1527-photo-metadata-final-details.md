# FOTO metadata: three final details

Date: 2026-11-07, Europe/Oslo. Follows `20261107-1439-photo-automatic-metadata-adoption.md`. **Nothing was committed or pushed.**

Where this report differs from the earlier one, this report applies: §3.2 (default shown as unknown), §3.6 (return note) and §9 (Fotograf decision) are superseded.

---

## 1. Summary

| Detail | Result |
|---|---|
| Default direction `0°` | Shown as an ordinary north heading on the map and as `0` in the Edit field. `basis.kind = 'default'` is kept, and the details show `Standardverdi` |
| Completion counts | A default is complete everywhere: nothing counts it as missing or remaining. Defaults are counted separately, by name |
| EXIF Artist | Fotograf fills in automatically. Manual and removed values stay, and Gemini XML is unchanged |

**No new regressions.** The only domain failures are the same six baseline ones.

**Two consequences to check:**

1. **A default can no longer be turned into a manual `0°`.** The Edit baseline is now `0`, so typing `0` changes nothing and `Standardverdi` stays. Any other value replaces it. To record "this really is north", a person would have to use `Samme retning…` in the hub.
2. **Legacy XML now carries EXIF Artist with no action,** because the value is accepted. This follows from your request and Gemini is not affected, but it does change Legacy output for photos with an Artist tag.

---

## 2. Default direction

`observedPhotoDegrees` is removed, so markers, popup, list row, Edit knob, Edit field and Edit baseline all read the accepted degrees directly.

- `Standardverdi, ingen kilde oppgir retning` stays in the inspector under `Retningskilde`, and `Standard: 0° N` stays in the hub.
- The inspector chip is now the ordinary `Retning 0° N`.
- The exported value and provenance are unchanged.

---

## 3. Completion counts

| Place | Before | After |
|---|---|---|
| Hub task | Done | Done (unchanged) |
| Hub status line | `Kan eksporteres, men 1 kan forbedres` | `Ingen opplysninger mangler for dette målet` |
| Return message | `Retning: 3 gjenstår.` | `Retning: 0 gjenstår. 3 har standardretning.` |
| Map command bar | `Mangler retning: 4` | `Standardretning: 4` |
| List filter from the hub | `Mangler retning` | `Standardretning` |
| `Neste` at the end of the list | `Ingen flere gjenstår` | `Ingen flere i listen` |
| Workspace filter `Retning (n)` | Counted defaults | Counts only a truly missing direction |

**`direction-defaulted` moved from a recommendation to a note.** A recommendation lowers the readiness status, which contradicted "complete". It is still shown once in the Retning panel. Defaults keep their own group, so they stay easy to find and correct.

The bar's work list is still `Angi på kartet`. The workspace filter no longer finds defaults, because they are not missing; the hub group is the place for them.

---

## 4. EXIF Artist

`planAutoPhotographer` in `photoAutoMetadata.mjs` follows the same rules as the other fields, through the same session call.

- **Source:** EXIF Artist only, with kind, tag and raw value kept as provenance.
- **Manual or chosen values** are never replaced.
- **Removed values** stay removed. `captureTimeCleared` became a per-field flag, so `photographerCleared` works the same way. The source value can still be chosen on purpose.
- **Nothing is invented.** A blank Artist stays empty.
- **Added beyond the brief:** a name with characters XML cannot carry stays as evidence. Otherwise a bad tag would newly block Legacy export with `invalid-xml-text`. The same text is already refused if typed.
- **Gemini:** a test confirms the name does not reach the XML.

The `Bruk EXIF-fotograf` button stays in the code, and appears only for a row that has an unused source value, such as after a removal.

---

## 5. Files changed

**Source:** `photoAutoMetadata`, `photoSession`, `photoDirection`, `photoEditSession`, `photoWorkspaceView`, `photoCompletion`, `photoExportFlow`, `export/photoExportReadiness`, `PhotoCompletionDialog`, `PhotoEditCommandBar`, `PhotoEditLayer`, `PhotoMarkersLayer`, `PhotoMapPopup`, `PhotoWorkspaceCollection`, `PhotoWorkspaceInspector`.

**Tests:** `photoAutoMetadata` (36 → 40 tests), plus assertions updated in `photoEditCommit`, `photoCaptureMetadata`, `photoEvidenceAdoption`, `photoExportReadiness`, `photoExportFlow`, `photoCompletion`, `photoExportFlowUi`, `photoCompletionUi`, `photoLoadedGmiUi`, `photoDirectionUi`, `photoWorkspaceEditUi` and `photoMarkerProvenanceUi`.

**Not changed:** export serializers, plan, package and rules; M0 goldens; `page.js`.

---

## 6. Test results

Production build, Chrome, real 148-photo corpus via `PHOTO_GML_FIXTURE`.

| Check | Result |
|---|---|
| Domain suite | **1,527: 1,516 pass, 6 fail, 5 skip** (one skip needed the running app; see below) |
| `photoDialogLayout`, run separately with the app running | **Pass** |
| FOTO/GMI browser suites, full run | 102: 96 pass, 5 fail, 1 skip |
| Rerun of the 3 suites with failures, after fixing their assertions | **30 of 30** |
| ESLint on photo code and two edited tests | 0 errors |
| `git diff --check` | Clean |

**The browser failures were all test assertions** still expecting the old behaviour: a ghost knob, or staging `0°` over a default. The fix touched tests only, on the same build. The other 15 browser files passed in the full run and were not rerun.

**Domain failures:** the same six baseline tests, in `validationV2WorkspaceInspector`, `statsUiContract` and `appInfoUiContract`.

**Not run:** the external XSD harness, Gemini WFS browser suites, and a real Gemini VA import. `terrainPhotoGml` stays excluded, as it fails at import on baseline.

---

## 7. Regression coverage added

| Area | Test |
|---|---|
| Default is `0°` in Edit, restaging `0` is no change, a real value replaces it, Discard keeps identity | `photoAutoMetadata`, `photoExportFlow` |
| Default reads as north, provenance differs from source `0°` | `photoAutoMetadata` |
| Default drawn on the map, `0` in the Edit field, no ghost knob | `photoDirectionUi`, `photoWorkspaceEditUi` |
| Hub, status and bar agree | `photoAutoMetadata`, `photoExportFlowUi` |
| Artist: usable, missing, invalid, manual, removed, repeated run | `photoAutoMetadata` |
| Artist: late EXIF, correction and removal survive later sources | `photoAutoMetadata` |
| Gemini XML unchanged, Legacy carries the name | `photoAutoMetadata` |

---

## 8. Manual acceptance

1. Import a photo with no direction in any source. Expect a north arrow, `0` in the Edit field, and `Standardverdi` under `Retningskilde`.
2. Open the hub. Expect Retning done and `Standardretning 0°` listed, with no "must improve" status.
3. `Angi på kartet`: the bar reads `Standardretning: n`. Change one, Save, and check the return message.
4. Import a photo with EXIF Artist: Fotograf is filled in. Correct one and remove another, add a GML, and confirm both stay.

Deferred UI items and the export wizard are unchanged from the earlier report.
