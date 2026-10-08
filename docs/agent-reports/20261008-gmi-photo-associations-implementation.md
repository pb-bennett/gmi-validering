# GMI photo associations implementation

Date: 2026-10-08. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`. Committed baseline: `b130780 Add photo direction editing`.

## 1. Task scope

Implemented hyperlink-centric GMI photo-object associations in the existing FOTO workspace. Both completed audits were read; the corpus audit governs its refinements. No private GMI or image file was copied into the repository. No agent delegation, commit, or push was performed.

**GMI association creation is driven by validated S_HYPERLINK image references on any object, independent of Type, TEMA, or geometry.**

**No GMI object geometry is used as a photo-position candidate in this milestone.**

The pre-existing `data/usage/aggregates.json` modification remains outside this task. Its starting SHA-256 is `0df54df2b5255bccce82db3072d1d5d2ff1d351b9b7242558a81ec8000105ff2`; final verification confirms the same hash. The two existing untracked audit reports are inputs, not implementation changes.

## 2. Architecture implemented

The session retains a generic `kind: 'gmi'` record in the existing owner-layer `spatialSources` registry. Storage is shared with retained GML sources, while GMI analysis, associations, confirmation and UI are separate from positioning. GMI sources have no position `entries`, candidates, accepted-position requests or coordinate conversion.

`gmiPhotoSource.mjs` owns the production decoder/parser adapter, association review, pruning and indexed inspector projection. `photoSession.mjs` owns staging, cancellation, source identity and atomic confirmation. The existing GML/EXIF/manual/direction paths continue to own photo state.

## 3. Shared hyperlink occurrence model

`extractHyperlinkOccurrences(value)` extends the existing shared extraction implementation. It returns raw source records, ordered members, canonical link occurrences and diagnostics. Occurrences preserve wrapper ordinal and delivered `h:n` number, source index/order, member ordinal, raw wrapper/member slices, raw reference path, basename, NFC/lowercase filename key, target validity and separate metadata such as `sign`.

Spans are UTF-16 character offsets into the original field string, not GMI byte offsets. Leading/trailing whitespace remains reconstructable. The existing wrapper grammar and whole-value malformed-wrapper rejection are unchanged. Presentation APIs use the same parsed members and retain their existing exact-filename copy-button deduplication. The canonical occurrence ledger never deduplicates.

All 12 exact family representatives intentionally recorded in the corpus audit are pinned as small literal fixtures. Tests cover one through seven wrappers; the five-wrapper sequence is explicitly synthetic because the corpus has no five-wrapper object. Optional/mixed signs, historical newline/sign regression, bare filenames, Attachments and Pictures/Kum paths, spaces, Norwegian characters, `.jpg`, `.jpeg`, `.JPEG`, trailing source space and exact reconstruction are covered.

`h:1(link:"Attachments\")` remains a structurally valid wrapper with an invalid `directory-target`, no derived filename, and no association. It is never reinterpreted as a file named Attachments.

## 4. GMI source model

One imported GMI byte revision produces one retained source containing:

- Session source ID, generic kind, original source filename, exact revision fingerprint and import time.
- Parsed header, `objectsByKey`, every valid/invalid target occurrence, source/identity diagnostics.
- An immutable `associationLedger` containing resolutions, `associationsById`, summaries and reverse indexes.

The adapter uses `decodeGmiBytes`, `GMIParser`, and `GMI_SOURCE_LEXEMES`. Both point and line collections are inspected. Every parsed object is retained once with GUID, geometry scope, parser ID, exact collection index, attributes, explicitly copied lexical fields, raw hyperlink, geometry, extent, S_FCODE/TEMA presentation evidence, Type and useful identifiers. No second GMI parser, map lookup or validation ObjectRef change was introduced.

Image-target eligibility uses the existing FOTO file classifier independently of preview support. An imported image with an unsupported or failed preview may still retain an association; non-image targets remain invalid.

## 5. Source revision/object identity

Full original bytes are SHA-256 fingerprinted where Web Crypto exists. The fallback retains exact bytes as hexadecimal evidence, avoiding a short hash or filename-based approximation. It is explicitly labelled `exact-bytes:`; it is not advertised as SHA-256.

Within a source, a unique GUID yields `guid:<normalized-guid>`. Missing/duplicate GUIDs use geometry scope plus exact collection index and retain diagnostics. GUID remains source evidence; it does not globally identify a source revision. Parser ID, geometry scope and collection index are retained independently.

The session prefixes occurrence IDs with source ID. Association IDs encode `[sourceId, objectKey, photoId]`. Identical bytes under a renamed filename offer explicit recheck instead of creating another source in the same owner layer. Different byte revisions retain separate objects and edges even with the same GUID and source filename.

## 6. Association ledger

Each reference has an explicit resolution: `confident`, `ambiguous`, `unmatched`, or `invalid`. Rows retain reference/object identity, possible owner-photo IDs, chosen photo ID when confident, match method and reason. Invalid/unmatched references remain useful source evidence.

Confident occurrences produce source/object/photo edges. Repeated occurrences for the same object/photo group under `referenceIds`, preserving every original member and all match methods. Reverse indexes support photo → association IDs, object → association IDs and reference → resolution. Full GMI objects are not copied into photo records.

## 7. Matching policy

An indexed asset resolver in `photoReferenceMatching.mjs` shares the established filename mechanics:

1. Collision-checked relative path.
2. Safe segment-boundary relative-path suffix.
3. Unique basename in the owner layer, including flattened Pictures/Kum references.
4. Case/NFC fallback only within a collision-free comparison bucket.

Original paths and filenames remain source/photo evidence; derived NFC/slash/case keys and methods are separate. NFC-only basename/path/suffix methods are distinguished in GMI review. A bare filename is presented as basename evidence rather than a folder-suffix claim.

Duplicate imported IDs remain ambiguous without resolving path evidence, including equal-content copies and same-name/different-content synthetic cases. Hash, EXIF, object geometry, Type/TEMA, fuzzy stems, extension substitutions and removal of `(1)` never resolve ties. GML's `duplicate-gml-reference` graph policy remains unchanged and continues to have regression coverage.

## 8. Owner-layer scope

Review receives only the selected FOTO layer's current imported assets. It never searches other FOTO layers, loaded GMI map layers, arbitrary folders or the filesystem. Private acceptance establishes sibling Attachments scopes explicitly in the test harness; production does not infer these folders.

Source review caches its ledger by immutable source and owner membership. Asset path/name/suffix buckets are built once per analysis/recheck. Inspector projection uses source reverse indexes and subscribes to session source changes so association-only writes update an already selected photo without changing that photo record.

## 9. Many-to-many behavior

One object may retain any number of confident photo edges. Several distinct source objects may refer to the same uniquely resolved photo. Distinct object keys and separate source revisions are never collapsed because filenames or GUIDs coincide.

Tests also cover repeated raw members grouped under one edge, without losing occurrence evidence, and two imported equal-content assets remaining ambiguous.

## 10. Real corpus acceptance

`GMI_PHOTO_CORPUS='C:\temp\gmi examples' node --test tests/gmiPhotoCorpus.test.mjs` runs the actual production adapter and resolver on all 12 private sources. The test reads original files, establishes each owner's sibling Attachments inventory, and checks every corpus file's hash before/after.

| Measure | Result |
| --- | ---: |
| GMI revisions | 12 |
| Retained parsed objects | 1,386 |
| Link occurrences | 303 |
| Confident valid image references | 302 |
| Invalid directory targets | 1 |
| Unmatched / ambiguous in explicit owner scopes | 0 / 0 |
| Exact relative-path resolutions | 271 |
| Unique basename resolutions | 31 |
| Unchanged corpus file hashes | 585 / 585 |

The basename resolutions include all eight Pictures/Kum references and 23 bare paths in G05. Deliberately flattening all 543 corpus images into one owner scope makes all 31 G05 references ambiguous; equal-content folder copies are not silently merged.

## 11. Seven-image object proof

G04 point parser ID 257, exact point collection index 18, GUID `ef536e8a-9b62-468f-bdf5-c033950a2ec2`, retains all seven original references and all seven photo edges. G05 retains another seven-edge source revision for the same GUID, with its changed bare/Pictures/Kum paths. Corpus acceptance asserts both source fingerprints differ and both preserve parser ID/index evidence.

Pinned domain evidence and browser acceptance inspect all seven linked photos independently. `64320(1).jpg` and `64320.JPEG` remain distinct assets/references. Real G04 browser acceptance imports 31 original images and resolves 31 reference occurrences.

## 12. Multi-object/same-photo proof

G01 filename `2026-02-20-14-34-36_f1ea8a41a3e3fb77de80703e30920e_KG1._.jpg` retains the separate GUIDs `b82604fa-abdb-40e2-acec-017788834274` and `cf6a001b-89ce-43a8-9450-bfbb97ada492` as two associations to one asset.

The domain test and actual private G01 browser test both verify two distinct objects. Browser acceptance imports all 92 sibling images and reports 94 matched occurrences plus one invalid directory target, without accepting any photo position or direction.

## 13. Repeated-GUID source revision handling

Corpus acceptance confirms all 95 repeated GUID groups and the two groups with changed raw geometry. These remain source scoped. Domain/browser tests attach changed revisions with the same GUIDs and show separate provenance rows/edges. A photo can show four object associations from two revisions of the real two-GUID pattern.

Exact duplicate-source recheck is idempotent. Source removal removes only that revision's edges and indexes.

## 14. UI behavior

The FOTO workspace provides **Koble GMI-referanser**, with **Velg GMI-fil**, automatic analysis, owner-layer matching summary and **Bekreft GMI-koblinger**. Summary distinguishes objects analysed, objects with valid image references, occurrence count, matched occurrences, matched photo assets, unmatched, ambiguous and invalid targets. Expandable rows show original paths, match methods and directory-target explanation.

Retained GMI sources appear under **Bildereferanser**, separate from **Posisjonsdata**. They provide explicit recheck and confirmed removal. The positioning wizard lists only GML sources and does not show an empty GML-source control just because a GMI source exists.

The selected photo's compact **Referert fra GMI** section counts distinct source objects. Nested details show AnleggsID or parser-object fallback, source filename, TEMA, Type and GUID. Its list has a bounded scroll area. It claims neither ownership nor camera/accepted position and provides no GMI navigation.

Production browser testing caught and fixed unsafe compiled access to an initially empty source review, and ensured the inspector reacts to source-only session updates. Desktop screenshots were inspected; the short-height review has an internal content scroller and a visible confirmation footer.

## 15. Lifecycle/recheck behavior

`applyGmiAssociations` requires explicit confirmation, the staged source ID, unchanged owner membership and the exact reviewed ledger. It publishes a complete retained source once and performs zero photo-record writes. Cancellation invalidates late reads and leaves no attached source/association residue. Sources with all references ambiguous/unmatched, and empty existing layers, can be attached.

Append changes membership only; it creates no GMI associations. Explicit recheck may resolve retained unmatched references. Previously confirmed live endpoints remain stable across rechecks, including a later duplicate append. Recheck does not duplicate objects, references or edge IDs.

Removing a photo prunes its live endpoints/indexes and changes formerly confident references to unresolved `photo-removed` rows. Ambiguous rows retain remaining alternatives without automatically accepting the last copy; explicit recheck is required. Removing a GMI source clears its indexes and cancels staged layer-source work. Layer deletion and actual application reset clear association state and invalidate late work.

Manual placement, GML/EXIF acceptance, direction editing and asynchronous thumbnail/metadata work remain independent. Domain tests check identical spatial/direction/preview/dimension/File references across association-only attachment; browser tests verify position/direction/source evidence and preview URL behavior.

## 16. Files changed

Production additions:

- `src/lib/photos/gmiPhotoSource.mjs`
- `src/components/photos/PhotoGmiDialog.js`
- `src/components/photos/PhotoGmiInspector.js`
- `src/components/photos/PhotoGmiSummary.js`
- `src/components/photos/photoGmi.css`

Production updates:

- `src/lib/hyperlinkFilenames.mjs`
- `src/lib/photos/photoReferenceMatching.mjs`
- `src/lib/photos/photoSession.mjs`
- `src/lib/photos/photoPresentation.mjs` (removes obsolete DFOT/object source-label stubs)
- `src/components/photos/PhotoWorkspaceCollection.js`
- `src/components/photos/PhotoSpatialInspector.js`
- `src/components/photos/PhotoPositioningWizard.js`

Test additions/updates:

- `tests/gmiPhotoAssociations.test.mjs`
- `tests/gmiPhotoAssociationsUi.test.mjs`
- `tests/gmiPhotoCorpus.test.mjs`
- `tests/helpers/gmiPhotoFixtures.mjs`
- `tests/photoResetIntegration.test.mjs`
- `tests/photoWorkspace.test.mjs` (replaces a pre-existing speculative DFOT positioning adapter test with a neutral synthetic source adapter)

This report is the nineteenth task file. Existing audit inputs and unrelated usage data are excluded from that count.

## 17. Tests/build/browser results

- **166 selected domain/regression tests passed**, zero failed/skipped: 158 across association, hyperlink/table/popup, source session, spatial, positioning, manual placement, direction, append, layer ownership, preview lifecycle, reset, matching, workspace, projection and parser lexical suites; eight additional EXIF/map-feature regression tests.
- **One complete private corpus acceptance test passed**, with all 585 file hashes unchanged and the counts in section 10.
- **Ten browser tests passed across nine files**: two GMI acceptance cases; seven existing FOTO suites; one existing DOMParser/EXIF/GML/session integration case.
- Existing FOTO browser suites: `photoWorkspaceUi`, `photoPositioningUi`, `photoManualPlacementUi`, `photoDirectionUi`, `photoAppendDuplicatesUi`, `photoSpatialUi`, `photoDialogLayout`. All seven used the existing acceptance setup and passed, including real 148-photo Ekenesstokken GML/EXIF flows where applicable. Existing constrained/narrow checks remain intact; no mobile redesign was introduced.
- New GMI desktop layouts: 1680×900, 1366×768, 1280×720, 1024×768, 1440×600. Synthetic acceptance uses fully decodable GPS PNG bitmap fixtures under the deliberately pinned reference filenames; this is distinct from the original private JPEG acceptance.
- Production `npm.cmd run build`: passed. Targeted ESLint for all changed JavaScript/modules: passed. `git diff --check`: passed.

Browser tests require `PHOTO_UI_URL` and installed Chrome. Private GMI acceptance additionally requires `GMI_PHOTO_CORPUS`; existing private GML tests use `PHOTO_GML_FIXTURE`. Chrome communication timed out inside this environment's sandbox; the same authorized local read-only browser checks passed through reviewed execution outside the sandbox. Initial test-fixture/selector/welcome-state issues and production review/inspector issues were corrected before recording final passes.

The build retains the existing outdated Browserslist database notice. Node retains the repository's existing module-type/storage warnings. These did not fail the selected checks. No dependencies/configuration were changed.

## 18. Known limitations

Sources and associations are session-only. A source must fit the 10 MiB analysis limit. Character spans are field-local UTF-16 offsets, not whole-file line/byte locators. The existing parser's field splitting/encoding limitations remain; malformed wrapper fields retain raw object evidence and diagnostics without inventing partial validated occurrences.

Type/TEMA are delivered metadata/presentation evidence; this adapter does not manufacture a validation binding or infer missing values from identifiers. Browser source selection imports a file, not a disk attachment namespace; available relative-path evidence remains what the owner FOTO import retained. No manual ambiguity chooser or association editing is included.

Confirmed live associations intentionally stay stable after a duplicate append. An unresolved ambiguous reference requires actual resolving asset/path evidence and an explicit recheck. Removing an asset does not silently attach an alternative.

## 19. Deferred work

GMI/DFOT-derived positions, camera assumptions, EXIF/GMI coordinate comparison, loaded-layer GUID binding, map navigation/highlight/zoom, validation ObjectRef changes, hyperlink editing, GMI writeback/export changes, Norsk Vann relationship export, cross-session persistence and broad photo metadata redesign remain deferred.

## 20. Recommended next milestone

Add explicit retained-source → loaded-map-revision binding and navigation for already confirmed associations, after verifying revision compatibility and missing/ambiguous GUID behavior. Keep association provenance and positioning independent; evaluate any future camera-position proposal in its own evidence/product milestone.
