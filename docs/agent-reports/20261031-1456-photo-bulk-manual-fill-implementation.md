# Photo manual bulk fill implementation

Date: 2026-10-31, Europe/Oslo. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`. Starting HEAD: **`c185357e083aa622fcd324cdc0bfe4728dfd597b` — Add bulk photo export readiness actions**.

## Preflight and outcome

Confirmed root, branch, exact requested HEAD and clean worktree before editing. Read the export-readiness, dual-export and capture-metadata reports plus current-state continuations. Inspected evidence eligibility/adoption, canonical metadata/direction/provenance, session ownership/lifecycle, workspace selection, inspector controls, export readiness, plan validation and package staleness guards. No sub-agents, private corpus access, commit or push.

Implemented explicit manual fill of missing capture time, photographer and direction for workspace selections and the whole current FOTO layer. Existing accepted values are preserved. Evidence adoption remains a separate preferred path. Manual values use existing accepted records with honest manual bulk provenance; no evidence is manufactured. Export validation, XML writers, context and positioning are unchanged.

## Architecture and APIs

New `photoManualFill.mjs` provides `normalizeManualPhotoFill(field, input)` and `planManualPhotoFill(photos, field, photoIds)`. Normalization reuses canonical capture-time/photographer functions, the existing XML text validator and the direction domain. The pure plan counts current unknown accepted fields rather than ranking source evidence. This allows an explicit operator choice even when sources conflict.

The session API is:

```js
session.fillMissingPhotoValues(layerId, field, input, photoIds = null)
```

Fields are restricted to `captureTime`, `photographer`, `direction`. Null/omitted IDs mean the whole current layer; an explicit empty selection means no targets. The action reconstructs live owner membership and accepted state at invocation, validates input before any write, deduplicates owners, applies one synchronous transaction and publishes once if any target changed. It never delegates to the older overwrite-capable metadata setter.

Results contain `ok`, `field`, `targets` and `counts`: `inspected`, `eligible`, `adopted`, `alreadyAccepted`, `stale`, `deduplicated`, `repeatedApplications`, `invalidInput`. Eligible/missing count describes the actual live targets before the write. Invalid input returns `ok: false`, `error: invalid-value`, zero adopted and one invalid input, without changing any target. Removed/foreign IDs are stale; duplicate submitted IDs are ignored, and selected sibling occurrences of one asset are reported as deduplicated. Invalid fields are rejected. No-op/invalid operations do not publish or invalidate a valid plan.

Metadata writes update the existing private asset map directly; direction writes update separate occurrence records. New planning/writing is O(layer membership + selected IDs), without a full-layer scan per target, per-target React state or hardcoded delivery counts.

## Capture time and timezone

Manual bulk capture time must normalize to `second` or `fraction` precision. Date-only/minute-only, invalid calendar/clock/offset and empty values are rejected. The existing model retains ISO text, precision, timezone-known flag and explicit offset. Up to nine fractional digits are preserved. Space-separated input normalizes to `T` using existing rules.

Supplied `Z` or numeric offsets remain as supplied by the canonical normalizer. No suffix means timezone unknown/local-unspecified; there is no browser-local `Date` parsing, conversion to UTC or invented seconds. File/import/edit times are never substituted. A focused subprocess test compares timezone-free normalization under UTC, America/Los_Angeles and Asia/Tokyo and obtains identical values.

The UI uses one unprefilled ISO text input and explicitly says seconds are required, timezone should be omitted if unknown, and the same operator value applies to every still-missing image. No current date/time is prefilled and no confirmation modal was added.

## Photographer

Existing trimming/whitespace collapsing is reused, preserving spelling, capitalization and name order. Empty input and XML-illegal raw input are rejected before writing; this also prevents normalization from silently removing an illegal control character. Legitimate XML-sensitive text such as `&` and `<` remains accepted text for the existing serializer to escape.

Photographer stays asset-owned and optional for export eligibility. Modern image-information omission rules remain intact. There is no browser/account identity default or fabricated source identifier.

## Direction

New `normalizeExactPhotoDirection()` in the existing direction domain requires a finite numeric value in [0,360]. Fractions are preserved; 360 normalizes to 0, consistent with existing north normalization. Negative, greater-than-360, nonfinite and nonnumeric inputs are rejected rather than wrapped or rounded.

The existing `acceptManualPhotoDirection()` supports `{ mode: bulk }` for this path while retaining its existing integer manual-editor behavior for ordinary calls. Accepted direction still means clockwise degrees from geographic/true north under the existing experimental contract. Explicit 0 is known north and is never treated as missing. No direction input is prefilled with zero. UI guidance names north/east/south/west and states that zero accepts north for every targeted unknown occurrence.

Accepted manual, EXIF and other source directions are preserved. No magnetic correction, GML direction conversion or geometric heading inference was introduced.

## Ownership, scopes and provenance

Capture time and photographer target unique asset IDs, so selected repeated occurrences write one shared accepted field. Direction targets selected occurrence IDs and keeps separate records. Whole-layer direction may fill several unknown sibling occurrences; `repeatedApplications` reports those applications. Selection does not change an unselected sibling's direction. Occurrences/features are not collapsed, and the existing shared-image/camera-observation disclosure remains visible.

Metadata bulk provenance is `{ kind: manual, mode: bulk }`. Direction uses `basis: { kind: manual, mode: bulk }`, `acceptance: manual`. Both retain `acceptedAt` as edit/session time, not capture time. Individual manual edit provenance remains `kind: manual` without bulk mode; EXIF/GML adoption remains source provenance. No UI selection list, fake source ID or fake evidence record is stored.

## Evidence/manual interaction and preview

Evidence actions appear first in **Eksportberedskap**. A separate bordered **Manuell utfylling · bare manglende verdier** section explains that sources should be used first when correct, that the operator supplies one value, and that existing accepted values remain unchanged. It shows forms only for fields with remaining unknown targets. Counts distinguish unique images from occurrences. Each action button states field, missing target count and ownership unit immediately before submission.

The same component is available inside workspace selection metadata actions and inside the whole-layer export dialog. No selection of 117 separate images or inspector visits is needed. Existing overwrite-oriented selected metadata forms were removed from this UI; individual editing, replacement/reset and source adoption remain intact. The existing metadata setter API itself is retained for existing callers.

The session recomputes eligibility at click time: if evidence adoption accepted seven of ten timestamps after a manual form was displayed, manual fill affects only the remaining three. Manual-first acceptance survives later EXIF arrival and later explicit bulk adoption. An unknown field with conflicting EXIF/GML values can be filled manually; its provenance records the operator's value, not either source, and raw evidence remains unchanged.

Successful manual fills use the same export invalidation callback as evidence adoption. The dialog discards the preview and instructs **Lag eksportforhåndsvisning** again. Domain snapshots also become stale through canonical accepted-value identity changes. No issued plan is mutated and no export error is suppressed. Serializer/package guards still reject invalid/stale plans; Legacy still requires full accepted time/direction and AsBuilt still requires truthful valid context.

## Related issues and limits

The closely related safety issue was the old workspace batch setter UI overwriting accepted fields. It now uses the same fill-missing path as Export, with correct asset/occurrence counts and provenance. Dead batch-only branches in its shared form were removed; single-item behavior is unchanged. No additional accepted-field fallback was justified: AsBuilt already has whole-export inputs, while position remains in the central positioning workflow. No same-coordinate, attachment/path, Z or other fallback was added.

An already accepted date/minute time remains accepted and is not replaced by fill-missing; it can still block export and requires deliberate individual review/edit. The app does not verify whether the operator's common timestamp/heading is factually correct. Scope/count/help text makes that explicit choice visible without extra modal friction. Accepted data remains session-only. GML direction, persistence, association export, Z, 3D/WFS/topology/Validator changes, extra schemas and broad UI cleanup remain deferred. No Gemini compatibility claim.

## Files changed

Production:

- `src/lib/photos/photoManualFill.mjs`: canonical input validation and pure missing-target/count projection.
- `src/lib/photos/photoDirection.mjs`: exact bounded heading normalization and manual bulk provenance support.
- `src/lib/photos/photoSession.mjs`: owner-scoped live fill-missing transaction.
- `src/components/photos/PhotoManualFillActions.js`: empty-by-default manual forms, missing-only visibility, scope/help/results and invalidation callback.
- `src/components/photos/PhotoEvidenceActions.js`: separate manual fallback following evidence actions, reused by Export and selection.
- `src/components/photos/PhotoMetadataEditor.js`: replaces overwrite-oriented batch forms while preserving single-photo forms.

Tests: `tests/photoManualFill.test.mjs` (29 new tests), `tests/photoLoadedGmiUi.test.mjs` (extends production readiness/export and selected-scope acceptance). Documentation: this report and the appended current-state continuation. Dependencies, export validators/writers, positioning and WFS production code are unchanged.

## Validation results

Final disjoint selections, including Node parent/nested subtests:

| Selection | Files | Tests | Pass | Fail | Skip | Cancelled/todo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Photo/export/domain/store/shared/WFS contracts and Terrain browser integration | 44 | 473 | 470 | 0 | 3 | 0/0 |
| Production-app photo browser regression | 6 | 18 | 16 | 0 | 2 | 0/0 |
| WFS map/workflow/popup browser regression | 3 | 51 | 51 | 0 | 0 | 0/0 |
| **Total** | **53** | **542** | **537** | **0** | **5** | **0/0** |

The first focused command passed **123/123**, including **29/29 new manual-fill tests**, with zero failures/skips:

```powershell
node --test --test-concurrency=1 tests/photoManualFill.test.mjs tests/photoEvidenceAdoption.test.mjs tests/photoCaptureMetadata.test.mjs tests/photoDirection.test.mjs tests/photoExportPlan.test.mjs tests/photoExportSerializers.test.mjs tests/photoExportPackage.test.mjs
```

New tests cover one/many/mixed missing targets, selected/whole scopes, repeated assets, correct counts, single publish, existing manual/source preservation, 0/90/180/270/fraction/360, invalid/nonfinite headings, second precision, fractions/offsets/local-unspecified time, host timezone independence, calendar/clock errors, photographer normalization/XML rejection, stale/foreign/removal/reset, provenance, late evidence, conflicts and the seven-EXIF-plus-three-manual scenario. A 150-image transaction checks one publication. Preview/package tests verify invalid/no-op versus successful mutation, strict context validation and package generation.

The broad domain selection uses the previous reports' predicate: test filenames beginning `photo|gmiPhoto|terrainPhotoGml|exifGps|hyperlinkFilenames|layerPresentation|layerOrder|layerHighlight|mapPaneToolbar|mapBackgroundControl|featurePopupContent|featureHoverTooltip|geminiExtent|geminiSession|geminiStoreLifecycle|geminiReferencePresentation|geminiWorkflowUi`, excluding `Ui.test.mjs` except `geminiWorkflowUi`, and excluding `photoDialogLayout.test.mjs`; run with concurrency 1.

Production browser commands, with `PHOTO_UI_URL=http://127.0.0.1:3100` against the fresh production build:

```powershell
node --test --test-concurrency=1 tests/photoLoadedGmiUi.test.mjs tests/photoDialogLayout.test.mjs tests/photoDirectionUi.test.mjs tests/photoPositioningUi.test.mjs tests/gmiPhotoAssociationsUi.test.mjs tests/gmiPhotoPlacementsUi.test.mjs
node --test --test-concurrency=1 tests/geminiReferenceBrowser.test.mjs tests/geminiWorkflowBrowser.test.mjs tests/geminiPopupBrowser.test.mjs
```

The extended full-app test uses seven generated originals/eight occurrences, one repeated original, existing manual time/direction, EXIF values on most originals and two without time/direction. It verifies initially empty manual controls, evidence adoption reducing exported capture blockers 2→1 and direction blockers 3→1, then explicit whole-layer manual time/photographer/direction fill for the two remaining unknown targets in the complete layer. Rebuilt exported blocker groups reach zero; completed-field forms disappear. Existing manual/source values remain unchanged. Selected metadata fill later affects exactly one unknown shared asset and preserves all other photos' metadata.

The workflow downloads Legacy and AsBuilt ZIPs with explicit modern context, checks four features/three attachments/one shared original, exact manually filled offset/fraction time, 0/90/359.875 headings and original-byte integrity. WFS remains at exactly the original two synthetic requests. Individual controls, append/recheck, selection, source-positioning and responsive dialog regressions also pass. No hidden canonical-state seeding or private corpus was used.

Five skips are unchanged optional private modes: three domain corpus cases, G01/G04 browser and 148-photo browser. None was inspected or claimed reaccepted.

Focused ESLint: **8 changed/new JS/MJS files, 0 errors, 0 warnings**. Production **`npx next build --webpack`: passed**. **`git diff --check`: passed**. Existing stale Browserslist and Node module-type notices remain; no unrelated lint/dependency debt was repaired.

XSD: **9/9 checks passed** using the existing outside-Git harness/cache, lxml6.1.3/libxml2 2.11.9 and 57 resolved official dependencies. Four freshly generated manual-fill documents validate (both profiles × both CRSs), including shared originals, manual known north/fractional heading, offset/fractional and timezone-free capture times. The existing modern unknown-direction positive also validates. Four expected negatives remain rejected (missing Legacy direction, wrong Legacy order, missing modern quality, partial modern image info). No XML writer/schema change or weakening was needed.

Intermediate browser result: **18 tests, 13 pass, 3 fail, 2 skip**. The newly added append-preservation assertion read inspector text after the previous test had exited the workspace, causing a null read, one subsequent workflow failure and the parent failure. The capture was moved before workspace exit; the complete final six-file browser selection passed **16 pass, 0 fail, 2 skip**. No production change or assertion removal was needed. WFS passed 51/51 on its first run in this milestone.

Logs and generated schema instances are in `%TEMP%/photo-bulk-manual-fill/`: `domain.log`, `app.log`, `app-final.log`, `wfs.log`, `lint-final.log`, `build.log`, `xsd.log`, `validate.py`, `schema-dependencies.json` and generated profile/CRS `.gml` files. The validator reuses the existing `%TEMP%/photo-dual-export/schema-cache/` and modern unknown-direction fixture; no new runtime dependency was added.

## Large-delivery impact

A layer with approximately 117 assets/123 occurrences can first adopt trustworthy evidence, then explicitly fill its remaining unknown accepted time/photographer/direction through three whole-layer inputs. Metadata remains asset-counted and directions occurrence-counted; no counts are hardcoded. Only genuine unresolved position/file/projection/context/precision requirements remain blocking. The private real delivery was not inspected or asserted ready. Monday Gemini testing still needs the documented recipient/profile/XY/path/shared-feature checks; successful app/XSD validation does not establish desktop import compatibility.
