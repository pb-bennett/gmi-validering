# Canonical accepted photo capture metadata

Date: 2026-10-31, Europe/Oslo. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`. Starting HEAD: **`da25114856957bc5d191db6ca689365fb19f862f` — Add loaded GMI photo reconciliation**.

## Preflight and outcome

Verified repository root, branch, required HEAD and clean worktree before editing. Read the current-state audit and loaded-GMI implementation report, then inspected asset/occurrence/resource ownership, source matching, GML raw dates, installed exifr dictionaries/options, inspector, workspace selection and browser harnesses. No sub-agents, commit, push or private corpus were used.

Implemented session-only accepted capture time and photographer, explicit EXIF/GML adoption, per-photo manual edit/replace/clear and batch setters. Existing positioning/direction remains separate. No export, persistence, delivery mapping, source-heading acceptance or general UI cleanup was added.

## Ownership and querying

`photoSession`'s private asset map exclusively owns `captureMetadata` and `metadataEvidence`. Occurrence construction and asset-to-record propagation explicitly exclude both fields. `publicPhoto()` projects the asset's immutable objects into public photo views; repeated occurrences reference the exact same accepted metadata object. No independently editable occurrence copies exist.

`getPhoto(id)` and `getLayerPhotos(layerId)` expose accepted fields and provenance, with `assetId` for future exporter deduplication. Unknown is `null` for each field. A metadata update changes only the owning asset's accepted field and publishes once. Position, direction and original/thumbnail resources retain their current ownership.

## Capture time

An accepted time is `{ value, provenance, acceptedAt }`. `value` contains:

- `iso`: normalized ISO-style calendar text, preserving the supplied offset rather than converting through the machine timezone;
- `precision`: `date`, `minute`, `second` or `fraction`;
- `timezoneKnown`: explicit boolean;
- `offset`: supplied `Z`/numeric offset, otherwise `null`.

Calendar dates, leap years, clock components and offsets (through ±14:00) are validated without host-local Date parsing. Date-only and minute-level entries do not acquire invented time/seconds. Fractions retain up to nine digits. Unsupported/ambiguous text remains raw evidence with no usable normalized value. Neither file modification/import time nor position/direction acceptance time is consulted. Metadata `acceptedAt` is an edit/session fact, separate from capture time.

## Photographer

An accepted photographer is `{ value: text, provenance, acceptedAt }`. Normalization trims and collapses whitespace; spelling, capitalization and name order are preserved. Empty/whitespace-only manual submission is rejected; the explicit reset button clears to unknown. No username, path, owner, contractor or GMI operator inference exists.

## Evidence and acceptance

The existing lazy JPEG/PNG EXIF pass now also reads the installed exifr library's `DateTimeOriginal`, `SubSecTimeOriginal`, `OffsetTimeOriginal` and IFD0 `Artist`. Date revival remains disabled so raw camera time cannot be implicitly interpreted in the browser timezone. Original camera date/time and its matching offset/subseconds form one evidence value. Unsupported fields, including TIFF modification `DateTime`, file dates, camera owner and heading, are excluded. GPS normalization/diagnostics remain independent and retain their existing raw spatial allowlist.

EXIF metadata is returned alongside GPS results, including when no GPS exists. Original source values are retained separately from normalized suggestions. Generated real TIFF-in-JPEG/PNG fixtures pass through the installed exifr parser; no customer images are needed.

Matched retained GML entries expose `raw.photographedAtText` as asset evidence independently of geometry viability. Only explicitly supported ISO-style text becomes usable; uncertain text is visible with an explanation and disabled adoption. Matching/ambiguity behavior is unchanged: duplicate/contested GML references are not guessed. No GMI capture-date or photographer semantics were invented.

Source arrival never sets accepted fields. Manual edits use `provenance.kind = manual`; explicit adoption records source kind, evidence ID, applicable source filename/ID/entry ID or EXIF tag, and raw evidence. Accepted provenance remains self-contained after source removal. Existing accepted values remain until an explicit replacement/reset. There is no automatic source ranking or background overwrite.

## Controls and batch behavior

A compact functional metadata section was added to the existing selected-photo inspector, including import inspection and workspace inspection. Each field shows accepted value/source, a manual text input/save, reset-to-unknown and expandable raw/normalized source values with explicit adoption buttons. Inputs explain ISO syntax and unknown timezone behavior. There is no new map editing surface.

Workspace selection now has a collapsed metadata batch section stating the number of unique photos affected and that other placements share the result. It provides separate photographer and capture-time setters. The session API independently checks current owner membership and deduplicates occurrence IDs to asset IDs before writing. Invalid values fail before writes; stale/foreign occurrences are ignored; remaining live selection can apply safely. Results report the actual unique asset IDs/count. Both selected occurrences of one asset cause exactly one write per field.

The existing small popup date line now shows accepted capture time, with an accurate label, and optionally accepted photographer. Unaccepted raw GML dates no longer masquerade as accepted capture time. No unrelated popup buttons, map labels, styles or hierarchy were redesigned.

## Lifecycle and resources

Metadata survives loaded-GMI reconciliation, append, source recheck/removal, initiating survey removal, position acceptance/manual movement, direction edits, visibility and removal of one sibling occurrence. Tests check metadata object identity across these operations. Removing the final occurrence removes the asset and its metadata; reset/cancel follow existing ownership/resource cleanup. Late source/EXIF completion patches only evidence and cannot overwrite accepted values or resurrect removed assets. There is no new resource registry, object URL, storage mechanism or persistence subscription.

## Changed files

Production:

- New `src/lib/photos/photoCaptureMetadata.mjs`: canonical empty state, validation/normalization and EXIF/GML evidence adapters.
- `src/lib/photos/photoSession.mjs`: asset-only storage, public projection, source evidence attachment and owner-scoped deduplicated edit/adoption API.
- `src/lib/photos/exifGps.mjs`: restricted original-time/Artist extraction in the existing EXIF pass.
- `src/lib/photos/photoPresentation.mjs`: accepted capture-time query.
- New `src/components/photos/PhotoMetadataEditor.js`: per-photo and batch controls.
- `src/components/photos/PhotoCollectionPanel.js`, `PhotoWorkspaceCollection.js`: inspector/batch wiring.
- `src/components/photos/PhotoMapPopup.js`: compact accepted metadata display.

Tests:

- New `tests/photoCaptureMetadata.test.mjs`: eight focused tests covering defaults, validation, precision/timezones, manual replacement/reset, real JPEG/PNG evidence/adoption, raw uncertainty, late evidence, shared asset identity, deduplicated batch, stale selection and lifecycle.
- `tests/helpers/photoGpsFixtures.mjs`: synthetic TIFF original-time/offset/subseconds/Artist support; existing endian/GPS fixtures preserved.
- `tests/photoLoadedGmi.test.mjs`: draft metadata survives reconciliation and survey removal.
- `tests/photoLoadedGmiUi.test.mjs`: full-app manual edit, EXIF adoption, clear, batch, every occurrence, append preservation and WFS request isolation.
- `tests/photoPositioningUi.test.mjs`: real production GML parse/attach/explicit metadata adoption.
- `tests/photoWorkspace.test.mjs`: source-only date is unknown until explicit adoption.

Documentation: this report and an appended continuation to the workflow audit. Historical reports were not rewritten. Manifests/lockfile and WFS production code are unchanged.

## Validation

Final disjoint runs (Node parent/nested tests counted as reported):

| Selection | Files | Tests | Pass | Fail | Skip | Cancelled/todo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Photo/domain/store/shared/WFS contracts and actual-browser Terrain/EXIF integration | 39 | 372 | 369 | 0 | 3 | 0/0 |
| Production-app photo browser regression | 6 | 16 | 14 | 0 | 2 | 0/0 |
| WFS map/workflow/popup browser regression | 3 | 51 | 51 | 0 | 0 | 0/0 |
| **Total** | **48** | **439** | **434** | **0** | **5** | **0/0** |

The new eight metadata domain tests are included in the first row. The full-app metadata subtest covers seven unique assets/eight occurrences, with generated PNG EXIF and no hidden domain seeding. Existing synthetic direction/manual positioning, repeated references, large viewer, marker/popup, loaded reconciliation and resource tests also ran. The Terrain integration reports seven internal browser checks within its one counted Node test. WFS remains at the original two synthetic requests through the loaded-photo metadata workflow.

Skips: three optional external GMI corpus domain cases, private G01/G04 app case and private 148-photo app case. No private corpus was probed or claimed reaccepted.

Domain command is the same disjoint filename selection documented in the previous implementation report, now including `photoCaptureMetadata.test.mjs`: names beginning `photo|gmiPhoto|terrainPhotoGml|exifGps|hyperlinkFilenames|layerPresentation|layerOrder|layerHighlight|mapPaneToolbar|mapBackgroundControl|featurePopupContent|featureHoverTooltip|geminiExtent|geminiSession|geminiStoreLifecycle|geminiReferencePresentation|geminiWorkflowUi`, excluding `Ui.test.mjs` except `geminiWorkflowUi`, and excluding `photoDialogLayout.test.mjs`; run with `node --test --test-concurrency=1`.

Browser commands against the fresh production build at `PHOTO_UI_URL=http://127.0.0.1:3100`:

```powershell
node --test --test-concurrency=1 tests/photoLoadedGmiUi.test.mjs tests/photoDialogLayout.test.mjs tests/photoDirectionUi.test.mjs tests/photoPositioningUi.test.mjs tests/gmiPhotoAssociationsUi.test.mjs tests/gmiPhotoPlacementsUi.test.mjs
node --test --test-concurrency=1 tests/geminiReferenceBrowser.test.mjs tests/geminiWorkflowBrowser.test.mjs tests/geminiPopupBrowser.test.mjs
```

Focused ESLint: **14 changed/new JS/MJS files, zero errors, zero warnings**. Production `npx next build --webpack`: **passed**. `git diff --check`: **passed**. Build emitted the existing stale Browserslist dataset warning; dependencies were not changed. Unrelated global lint debt was not repaired.

During development, a synthetic GML test initially used two contested references in one source and correctly received no confident match; it was corrected to use two distinct sources. The first broader run found the old source-date presentation assertion; it was updated to verify unknown-before-adoption and the accepted value afterward. All final selections above pass.

## Limits and next milestone

Session-only state disappears on reload. Supported metadata evidence is deliberately limited to original-time EXIF/Artist in JPEG/PNG and matched retained Terrain/GML date text. XMP/IPTC authors, alternative camera timestamps, fuzzy/localized date parsing, metadata history/undo, export schema and serialization remain outside this change. Manual edits deliberately replace the current accepted field; provenance is retained for that accepted value, not as a full history.

Recommended next milestone: define and implement the photo export contract/mapping from canonical accepted asset metadata plus occurrence placement/direction and associations. Keep broad UI/UX cleanup as its separately planned pass; persistence, packaging, source-direction adoption and other explicitly deferred work need their own scope.
