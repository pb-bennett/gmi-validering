# Photo export-readiness implementation

Date: 2026-10-31, Europe/Oslo. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`. Starting HEAD: **`e2f20c348d9c05545cd1cc6384bc28338e5bdc74` — Add experimental photo export profiles**.

## Preflight and outcome

Confirmed the root, branch, exact requested HEAD and clean worktree before editing. Read the metadata implementation, export contract audit, dual-export implementation and current-state continuations. Inspected installed exifr 7.1.3 integration, asset/occurrence ownership, metadata adoption, direction, workspace selection, central positioning, both profile validators, package guards and export dialog. No sub-agents, private corpus access, commit or push.

Implemented explicit batch adoption of EXIF capture time, EXIF Artist and usable true-north EXIF image direction, plus safe GML capture-time adoption. Selected workspace photos and the whole layer in Export can fill unknown accepted values together, retaining provenance and reporting results. Conflicting usable evidence remains a review case. Export errors/warnings are grouped without losing individual diagnostics. Validation and frozen-plan guards remain authoritative.

## Blocker/repetition audit

**A:** already-loaded, unambiguous evidence supports explicit batch adoption. **B:** user review/choice is necessary. **C:** information is absent, invalid or requires unsupported semantic conversion. A never means automatic acceptance.

| Category / diagnostic code | Ownership/profile | Finding and action |
| --- | --- | --- |
| Missing accepted capture time / `capture-time-required` | Unique exported asset, both profiles | A for one full EXIF/GML timestamp: implemented. B for conflicting normalized sources. C for absent/unusable evidence. |
| Insufficient accepted capture precision | Asset, both | C: date/minute precision cannot acquire invented seconds. Added distinct `capture-time-precision`; existing accepted values remain preserved. |
| Missing accepted direction / `direction-required` | Placed occurrence, Legacy | A for usable true-north EXIF: implemented. B for different normalized headings. C for absent/invalid/magnetic/unknown-reference values. AsBuilt may still omit unknown direction. |
| GML raw direction value/unit/reference | Source evidence | Deferred from adoption. The parser retains raw strings; there is no existing tested GML source-direction normalizer covering that contract. The export unit1/reference1 assumption is not an existing source acceptance/conversion API. No gon/radian/local/magnetic conversion was introduced. |
| Photographer unknown / evidence only | Asset, optional Legacy information | A for EXIF Artist: implemented. Unknown photographer is not a blocker. Modern `photographer-omitted` remains because real focal length/camera type are missing. |
| Unknown accepted position / `unplaced-excluded`, `no-placed-photos` | Occurrence, both | Existing central whole-layer wizard already supports source proposals, explicit review and applying selected positions together (A/B). No second positioning model needed. Unplaced items remain excluded; all-unplaced remains blocked. |
| Missing/invalid AsBuilt context / `invalid-context` | Seven delivery-level fields | C: EXIF capture time is not survey date; GMI personnel are not inferred photographer/context. Existing layer-wide inputs already avoid per-photo repetition. |
| Missing/empty/read-failing original / `missing-file`, `file-read-failed` | Asset | C: evidence, thumbnail or path cannot replace original bytes. Package hash/liveness checks retained. |
| Attachment names / `attachment-naming` | Asset | Existing deterministic collision/safety processing already operates in bulk. Failure remains blocking. |
| Projection / `projection-failed`, `invalid-crs` | Occurrence/configuration | C: strict supported-CRS transformation retained; no inferred point/CRS. |
| Invalid accepted direction/XML / `invalid-direction`, `invalid-xml-text` | Occurrence/serialized field | C: invalid data remains blocking. Valid fractional accepted EXIF headings are supported without rounding within [0,360). |
| Repeated assets/occurrences | Shared original, distinct placements | A for explicitly disclosed original-image heading applications; metadata counted once per asset and direction per target occurrence. No occurrence collapse or separate-camera-observation claim. |
| Configuration/staleness / `invalid-profile`, `stale-plan` | Profile/frozen plan | Explicit profile selection and rebuilding retained. Adoption changes canonical state and invalidates preview. |
| Association/shared-original/experimental warnings | Plan/profile | `associations-omitted`, `shared-attachments`, `experimental-mapping`, `direction-assumption`, `path-convention`, `experimental-2d` retained in grouped details. No new serialization semantics or compatibility claim. |

No duplicate validator layer was emitting one asset's capture failure for every occurrence: the plan already validated each asset once and each placed occurrence's direction once. That ownership is preserved. No distinct errors were removed or deduplicated by message text. Existing lower-kebab stable code conventions are retained; missing versus insufficient capture time now have separate codes.

## Evidence eligibility, conflicts and provenance

`photoEvidenceAdoption.mjs` supplies the shared pure eligibility/target/count projection. The canonical session action recomputes from live owner membership when clicked. Callers cannot submit stale evidence values as accepted data. Metadata selection deduplicates occurrence IDs by asset ID; direction deduplicates occurrence IDs. Removed/foreign selection IDs are counted as stale. Writes publish once per batch.

Eligibility requires an unknown accepted field, a usable value from the explicitly requested source, and exactly one distinct normalized value across **all** legitimate normalized sources for that field. Batch timestamp adoption additionally requires second/fraction precision. Different usable EXIF/GML times block both source actions; neither source outranks the other. Equivalent timestamp spellings with trailing fractional zeroes or `+00:00`/`Z` may agree; no host-timezone inference occurs. Other differences conservatively require review. Every agreeing evidence record, including raw/source identifiers, is copied into accepted provenance.

Photographer uses existing whitespace normalization. Different normalized names also require review; the focused tests exercise future additional sources although current production evidence is EXIF-only. Installed exifr omits a blank Artist tag, which is correctly unavailable rather than an invented author.

## Capture-time and photographer adoption

Original-time extraction remains restricted to `DateTimeOriginal`, `SubSecTimeOriginal`, `OffsetTimeOriginal` and `Artist`; evidence arrival never accepts values. Explicit EXIF time/photographer actions appear beside selected workspace metadata controls and in whole-layer Export readiness. The separate GML time action uses confidently matched retained `photographedAtText`, with source/file/entry provenance. Invalid/date/minute evidence remains unavailable for batch readiness adoption. Existing per-photo review, explicit adoption, manual replacement and reset remain available.

Metadata stays exclusively asset-owned and projected into occurrence views. Bulk writes update the private asset map directly, avoiding a record scan per accepted asset. Existing accepted manual/source values keep their exact value/object/provenance. Results distinguish adopted, already accepted, missing source, unusable, insufficient precision, conflict and stale selection.

## EXIF direction support and semantics

The existing pass explicitly requests `GPSImgDirection` and `GPSImgDirectionRef` from exifr's GPS directory. These tags are separate from the position allowlist: heading without GPS coordinates does not create an invalid position candidate or prevent metadata extraction. Existing GPS behavior is preserved.

Only finite numeric values in [0,360] with reference exactly `T` become usable geographic/true-north clockwise-degree evidence. 360 normalizes to 0; 0 stays known north; fractional headings below 360 retain their precision. Negative, nonfinite, malformed and out-of-range values remain invalid raw evidence. Magnetic `M`, missing and unsupported references remain raw with `unsupported-reference` status. No orientation/rotation, movement track, destination bearing, filename, GMI/map/object geometry or magnetic correction is used.

Evidence belongs to the asset and is surfaced in each occurrence's inspector. Accepted direction remains occurrence-owned. Manual direction retains `basis.kind = manual` / `acceptance = manual`; evidence adoption records `basis.kind = exif`, evidence ID/tag/raw and all agreeing evidence, with `acceptance = source`. Provenance is self-contained after source detachment/removal; the model can distinguish future source kinds.

For one occurrence, adoption updates that occurrence. For repeated images, selection changes only targeted eligible occurrences; whole-layer adoption changes all eligible unknown occurrences independently. The UI explicitly states this is one original camera observation, not proof of separate observations at object placements. Counts report repeated-occurrence applications separately. Accepted direction is never replaced by batch adoption. The inspector also exposes raw status/provenance and a single-occurrence EXIF adoption button.

The existing integer manual controls are unchanged. Export validation now permits finite fractional canonical direction within [0,360), preserving real EXIF precision rather than quantizing it through manual normalization. Both serializers retain the explicit experimental true-north clockwise degrees/unit1/reference1 contract. Unknown direction still blocks Legacy; modern may omit it. Full-XSD validation covers fractional headings in both profiles/CRSs.

GML direction remains raw evidence without a new adoption normalizer. In particular, this milestone does not introduce untested unit/reference conversion just to reduce blockers. Consequently raw GML direction is not classified as a normalized usable direction source; future normalized sources participate in the same conflict rule (tested).

## Grouped diagnostics and whole-layer workflow

Open **Eksporter**, select the intended profile/CRS and inspect **Eksportberedskap**. It shows unique-image versus occurrence counts, missing accepted values and each source action's eligible/already-accepted/unavailable/precision/reference/conflict counts. Scope explicitly includes unplaced photos; export exclusion behavior is stated. Selecting 117 individual images is unnecessary.

Use **Bruk EXIF-tid for alle mulige**, **Bruk EXIF-fotograf for alle mulige**, **Bruk EXIF-retning for alle mulige**, or the separate GML time action. Read actual adopted/skipped/stale/repeated counts, then choose **Lag eksportforhåndsvisning** again. Adoption changes canonical state and clears the dialog preview. It never mutates an issued plan; external state changes retain existing staleness checks.

`groupPhotoExportDiagnostics()` aggregates by stable code in linear time. Each native expandable group starts collapsed and retains its complete affected-item list. Every individual diagnostic remains in the immutable plan. Capture counts stay asset-level; direction counts stay occurrence-level. Direction/projection details now include filename and exact occurrence ID. There is no domain truncation or message-based suppression.

## Additional closely related fixes

- Bulk GML time adoption closes the same known-evidence repetition gap without a second metadata model or source preference.
- Agreeing-source provenance retention avoids losing the other agreeing source or falsely treating harmless timestamp spelling differences as conflicts.
- Separate precision diagnostics identify accepted values that filling unknown fields cannot repair.
- Fractional EXIF direction is preserved instead of silently rounded; schema validation remains strict.
- Whole-layer photo querying groups peers once instead of rescanning layer membership per photo; shared-attachment counting uses one occurrence aggregation. Bulk metadata writes avoid a record scan per asset. New eligibility/grouping work is linear in photos/evidence/diagnostics, with no corpus-specific counts. Unrelated source-ledger/rendering architecture was not redesigned.

## Changed files

Production (10 files):

- `src/lib/photos/photoEvidenceAdoption.mjs`: shared eligibility/targets/counts.
- `src/lib/photos/photoSession.mjs`: live owner-scoped adoption, evidence projection, bulk asset writes and peer aggregation.
- `src/lib/photos/photoDirection.mjs`: EXIF heading evidence/status and source provenance.
- `src/lib/photos/exifGps.mjs`: standard direction tags independent of location.
- `src/lib/photos/export/photoExportPlan.mjs`: precision code, filename details, fractional validation and shared counts.
- `src/lib/photos/export/photoExportDiagnostics.mjs`: grouping by stable code.
- `src/components/photos/PhotoEvidenceActions.js`: selected/whole-layer readiness and result counts.
- `src/components/photos/PhotoMetadataEditor.js`: selected evidence actions.
- `src/components/photos/PhotoDirectionControls.js`: evidence inspection and per-occurrence adoption/provenance display.
- `src/components/photos/PhotoExportDialog.js`: readiness, grouped diagnostics and preview invalidation.

Tests (4 files): `tests/photoEvidenceAdoption.test.mjs` (35 new focused tests), `tests/helpers/photoGpsFixtures.mjs` (standard heading/reference and location-free generated EXIF), `tests/photoExportSerializers.test.mjs` (precision code), `tests/photoLoadedGmiUi.test.mjs` (production-app readiness acceptance). Documentation: this report and the appended current-state continuation. Dependencies/lockfile, WFS production code and historical report text are unchanged.

## Validation

Final disjoint selections, counting Node parent/nested tests:

| Selection | Files | Tests | Pass | Fail | Skip | Cancelled/todo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Photo/export/domain/store/shared/WFS contracts and Terrain browser integration | 43 | 444 | 441 | 0 | 3 | 0/0 |
| Production-app photo browser regression | 6 | 18 | 16 | 0 | 2 | 0/0 |
| WFS map/workflow/popup, final per-file results | 3 | 51 | 51 | 0 | 0 | 0/0 |
| **Total** | **52** | **513** | **508** | **0** | **5** | **0/0** |

The domain command uses the previous report's filename predicate: prefixes `photo|gmiPhoto|terrainPhotoGml|exifGps|hyperlinkFilenames|layerPresentation|layerOrder|layerHighlight|mapPaneToolbar|mapBackgroundControl|featurePopupContent|featureHoverTooltip|geminiExtent|geminiSession|geminiStoreLifecycle|geminiReferencePresentation|geminiWorkflowUi`; omit `Ui.test.mjs` except `geminiWorkflowUi`, and omit `photoDialogLayout.test.mjs`; run `node --test --test-concurrency=1`. It includes new evidence tests and existing metadata/EXIF/direction/lifecycle/export plan/serializer/package regressions.

Production-browser commands with `PHOTO_UI_URL=http://127.0.0.1:3100`:

```powershell
node --test --test-concurrency=1 tests/photoLoadedGmiUi.test.mjs tests/photoDialogLayout.test.mjs tests/photoDirectionUi.test.mjs tests/photoPositioningUi.test.mjs tests/gmiPhotoAssociationsUi.test.mjs tests/gmiPhotoPlacementsUi.test.mjs
node --test --test-concurrency=1 tests/geminiReferenceBrowser.test.mjs tests/geminiWorkflowBrowser.test.mjs tests/geminiPopupBrowser.test.mjs
```

The new production subtest imports seven generated originals/eight occurrences, with one repeated original and one image lacking time/direction. It sets manual time/direction, checks collapsed groups retain every detail, bulk-adopts time/photographer/direction, observes capture blockers 2→1 and direction blockers 3→1 among placed exported occurrences, verifies unresolved photos remain blocked and manual values preserved, and checks the sibling's exact 359.875-degree EXIF heading. The following export subtest completes requirements, downloads both packages and checks features/shared attachments/original bytes. WFS remains at exactly the initial two synthetic requests. No hidden canonical-state seeding or private images.

Generated real JPEG/PNG bytes exercise capture-only, subseconds, offsets, Artist-only, true-north 0/fraction/360, magnetic/absent/unsupported references, malformed rational/nonfinite/out-of-range values and metadata/direction without GPS location. Other tests cover unique-asset selection, repeated occurrences, manual/source preservation, conflicts/agreement, unusable/precision/missing counts, stale removal/reset/late completion, provenance, GML time, 600 same-code diagnostics with every detail, correct ownership counts and preview blocker reduction without weakening AsBuilt context.

Five skips are existing optional private corpus modes: three domain cases, G01/G04 browser and 148-photo browser. None was probed or reaccepted.

Focused ESLint: **14 changed/new JS/MJS files, 0 errors, 0 warnings**. Production **`npx next build --webpack` passed**. **`git diff --check` passed**. Existing stale Browserslist and Node module-type notices remain; unrelated lint/dependency debt was not repaired.

Independent full XSD verification: **9/9 checks passed** using cached official schemas outside Git, lxml6.1.3/libxml2 2.11.9 and 57 resolved dependencies. Four freshly generated fractional-heading documents validate (both profiles × both CRSs); the existing modern unknown-direction instance validates; four deliberately invalid instances are rejected (Legacy missing direction/wrong order; modern missing quality/partial image info). No schema was weakened. This does not establish Gemini acceptance.

Intermediate results: the first new focused run was 31 pass/1 fail because a test expected blank Artist to survive exifr; installed exifr omits it, so the expected missing count was corrected. Final new tests: 35/35. The first WFS selection reported 48 pass/3 fail: a post-drag popup-open timeout prevented refresh, causing the following request-count assertion and parent to fail. An unchanged isolated `geminiPopupBrowser.test.mjs` rerun passed **16/16**. With the other files' **35/35**, final per-file WFS results are **51/51**. No WFS production/test change or assertion removal was used.

Logs and current generated XSD instances are in `%TEMP%/photo-export-readiness/`: `domain-final.log`, `app.log`, `wfs.log`, `wfs-popup-rerun.log`, `lint.log`, `build.log`, `validate.py`, `schema-dependencies.json` and profile/CRS `.gml` files. The validator reuses `%TEMP%/photo-dual-export/schema-cache/` and its existing modern unknown-direction fixture. No new application dependency or private corpus access.

## Remaining blockers, delivery impact and Monday Gemini test

For 117 unique assets/123 occurrences, each explicit action can fill every eligible unknown target at once. Capture metadata is not inflated to 123 assets; direction maintains separate accepted records and repeated-application counts. No counts are hardcoded and the private real delivery is not claimed reaccepted.

Missing/invalid/insufficient/conflicting metadata, magnetic/unknown headings, unresolved positions, missing originals, projection errors and truthful AsBuilt context remain real unresolved requirements. Accepted date/minute values require deliberate review/edit rather than bulk overwrite. GML direction normalization remains deferred with raw value/unit/reference intact. No invented data, automatic import/export acceptance, inferred camera placement, magnetic correction, association export, Z, persistence or other excluded work was added.

The existing Monday manual import matrix remains necessary. Large layers can now reach a useful preview through a few explicit actions. In addition to prior north/cardinal/time/path/XY/repeated-feature/photographer cases, inspect fractional true-north bearings and separate accepted directions for shared-image features. Record actual Gemini product/version/schema/import command and results. AsBuilt photographer omission and all experimental mapping/north/path/XY notices remain. XSD/browser success is not a Gemini compatibility claim.
