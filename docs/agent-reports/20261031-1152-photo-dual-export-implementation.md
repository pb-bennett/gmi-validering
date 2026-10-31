# Experimental dual-profile photo export

Date: 2026-10-31, Europe/Oslo. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`. Starting HEAD: **`2f126ab408b85bf8bf7bca27fca9660be7ce7b29` — Document photo export contract audit**.

## Outcome and preflight

Implemented an explicit, experimental **Legacy Skråfoto 2019** and **Norsk Vann AsBuilt 5.2** export path. Both create ZIP test packages from the current FOTO layer through the same immutable export plan. Neither is claimed Gemini-compatible. Local desktop Gemini import has not been performed.

Verified repository root, exact branch/HEAD and clean worktree before changes. Read the current-state audit, capture-metadata implementation report and export-contract audit, and inspected the current asset/occurrence/File/association APIs. Re-fetched the two official application XSDs and checked their hashes, inheritance, property sequences, types and code enumerations before serialization. Their SHA-256 values match the audit:

- Legacy: `84ea31b1388338e442f2f4db03e3e7091d7df3935003df10c4851b8ca5716c5e`.
- AsBuilt: `7798e35194d102b5729dc7a7b0a2015111f9affea339576b9a9eb3cefb33cf70`.

The previous NOT READY audit remains a historical assessment of a complete production delivery contract. This milestone implements the user's subsequently explicit experimental occurrence mapping, XY geometry and path convention for empirical testing; it does not resolve those interoperability questions by assertion. No sub-agents, private corpus, commit or push were used.

## Architecture and shared plan

```text
photo session read-only snapshot
  -> deterministic plan + profile validation
  -> explicit Legacy / AsBuilt XML serializer
  -> original-byte ZIP package
```

The dedicated domain is `src/lib/photos/export/`. React only requests a snapshot/plan, presents diagnostics, and initiates download. XML is produced from an authenticated completed plan, never directly from React/session state.

`capturePhotoExportSnapshot(session, layerId)` copies layer identity, unique assets, occurrences and association/source context without changing photoSession. File handles remain private in transient export objects. `buildPhotoExportPlan()` snapshots explicit profile/CRS/context configuration, sorts by stable identity, resolves deterministic names/IDs, hashes originals, projects accepted positions and returns immutable data plus warnings/errors. No persistence was added.

Assets contain asset ID, original name/relative path, planned export filename, original File, accepted capture metadata/photographer and provenance, and SHA-256 of original bytes. Separately imported assets are never merged, even when their names or bytes match.

Occurrences contain occurrence/asset identity, accepted current position and basis, exact selected candidate provenance where applicable, accepted direction and provenance, occurrence context, retained source/object associations and deterministic feature/application/geometry IDs. Association entries retain source identity/fingerprint and loaded-binding context. Accepted values remain separate from source evidence.

Attachment entries contain asset identity, exported filename/path and rename status. Scope counts distinguish all images/occurrences in the layer, placed occurrences, excluded unplaced occurrences, planned features, physical attachments, shared original images and distinct asset/object associations. A placed occurrence failing its profile requirements blocks the package; it is not silently dropped. Unplaced occurrences are explicitly excluded, and an all-unplaced layer is blocked.

## Experimental repeated-photo policy

**One accepted occurrence = one Skråfoto feature.** Two placements of one original create two distinct features and exactly one physical attachment. Both links use the same `Attachments/<filename>` path. Positions are neither averaged nor selected first; the exporter uses each accepted occurrence position unchanged apart from projection/rounding. No new camera position is inferred.

This mapping is visible in the dialog and plan warnings. It deliberately preserves current app placement semantics for testing; it is not proof that several object-derived positions are several physical camera observations or that Gemini will preserve those features.

Many-to-many GMI associations stay in the plan/app. Counts deduplicate shared occurrences by asset/source/object identity. Preview reports the number retained in the app but omitted from the test export. No parent VA features, reverse relationship fields, source GUID edits, original GMI writes or S_HYPERLINK rewrites are emitted.

## Legacy 2019 contract

Namespace: `http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101`.

Schema: [official Legacy XSD](https://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101/LedningsnettEtablertEllerFlyttet.xsd).

Output is GML FeatureCollection/featureMember/app:Skråfoto. Application properties follow the exact required sequence:

1. `fotograferingspunkt/gml:Point/gml:pos`;
2. `fotolink`;
3. `retningsvektor/Retning`, containing value, unit, reference in that order;
4. `identifikasjon/Identifikasjon`, containing local ID then namespace;
5. `fotograferingstidspunkt`;
6. optional `fotoinformasjon/Bildeinformasjon/fotograf` when photographer is accepted.

Accepted direction and full accepted dateTime are required. Unknown direction blocks; known 0 degrees is valid north. Unknown photographer omits the optional block. Photographer-only legacy image information is supported without inventing camera/focal values. XML-illegal photographer text blocks Legacy because the value would be serialized.

## AsBuilt 5.2 contract and explicit context

Namespace: `https://skjema.geonorge.no/SOSI/produktspesifikasjon/Norskvann-Asbuilt/5.2`.

Schema: [official AsBuilt XSD](https://skjema.geonorge.no/SOSI/produktspesifikasjon/Norskvann-Asbuilt/5.2/Asbuilt.xsd).

Inherited SOSI_Objekt required properties precede the photo extension in exact schema order: `datafangstdato`, `datasett_navn`, `identifikasjon`, `kvalitet`, `prosjektnavn`, `stedfestingsårsak`, `stedfestingsforhold`. Identification supplies a generated photo GUID. Quality contains required `målemetode` followed by `målemetodeHøyde`; optional accuracy properties are omitted.

The photo extension then emits photographing point, required capture dateTime, photo link and optional direction. Modern direction uses `Retningsvektor` with unit, reference, value ordering.

Export-context inputs have no invented defaults or GMI/photo autofill:

| Plan input | Target | Validation |
| --- | --- | --- |
| surveyDate | datafangstdato | Explicit valid calendar date, separate from capture/edit/import time |
| datasetName | datasett_navn | Nonempty XML-valid text |
| projectName | prosjektnavn | Nonempty XML-valid text |
| horizontalMethod | kvalitet/Posisjonskvalitet/målemetode | Explicit schema enumeration |
| verticalMethod | kvalitet/Posisjonskvalitet/målemetodeHøyde | Explicit schema enumeration, even though no Z is emitted |
| surveyReason | stedfestingsårsak | Explicit schema enumeration |
| surveyConditions | stedfestingsforhold | Explicit schema enumeration |

Pinned supported enumerations were extracted from the official XSD: **69 horizontal methods, 35 vertical methods, 6 causes, 14 conditions**. Invalid/blank codes block. The schema also permits `other:` extensions; this first experimental UI deliberately offers only listed codes, rather than arbitrary extensions. All context values apply uniformly to the layer; the operator must choose values truthful for that scope. Mixed-context per-feature editing is outside this milestone.

The entire optional modern image-information block is omitted: its required focal length/camera type are absent from the canonical domain. Each affected accepted photographer produces an explicit omission warning. No partial block, zero focal length, empty camera placeholder or substitute photographer property is emitted. Invalid characters in an omitted photographer do not block modern output.

## Geometry, direction and capture time

Only explicitly accepted positions are used. Raw GPS/GML/GMI geometry is never substituted. Strict proj4 transformation runs from accepted EPSG:4326 lon/lat into selected **EPSG:25832 or EPSG:25833**, using the existing registered ETRS89 horizontal definitions. Invalid geographic coordinates, exceptions and nonfinite projected values block output. Output is **Easting Northing**, three fixed decimal places, with negative zero normalized. It is a deterministic map approximation, not a millimetre accuracy claim.

Each Point declares its selected CRS as an OGC URN and `srsDimension="2"`; no Z is emitted. EPSG:5972 is rejected. Legacy photo XY follows the audited no-Z exception. Modern XY is an explicit experiment whose generated fixtures pass XSD validation, but whose Gemini acceptance remains unknown. No terrain sampling or source/object height reuse exists.

Direction mapping is explicitly experimental: accepted integer degrees clockwise from true/geographic north, unit1/reference1. Unknown remains distinct from north. Legacy blocks unknown; modern omits its optional block. No source heading adoption, magnetic/grid correction or automatic direction inference was added.

Capture time must already be an accepted normalized full dateTime at second/fraction precision, with consistent stored timezone metadata. Date-only, minute-only or unknown blocks both profiles. No midnight, seconds, timezone, UTC conversion or file/session timestamp is invented. Supplied offsets, timezone-free values and up to nine accepted fractional digits remain unchanged.

## Identity, filenames, XML and package

Application GUIDs use deterministic RFC9562 UUIDv5: fixed DNS namespace plus an application/version prefix and layer/occurrence key. XML feature/geometry IDs use distinct `photo-`/`point-` prefixes and that GUID. Legacy localId uses the same photo GUID with exporter-owned namespace `urn:gmi-validator:experimental-photo-export:v1`. Source object GUIDs, filenames and row numbers are not reused as photo identity. Repeated exports of unchanged session state/configuration have identical IDs; no cross-reload identity guarantee is added.

Names start from original filename, normalize NFC, retain safe Unicode/spaces/extension, sanitize separators/control/Windows-invalid/URI-sensitive characters and reserved device basenames, and fit within 180 UTF-8 bytes with reserved extension/suffix space. Case/NFC collision groups receive deterministic asset-key SHA-256 suffixes. Suffixes extend and all final names are rechecked against natural names/collisions. A too-long extension or unresolved full-hash collision is an error. Separate identical assets remain separate files; repeated occurrences reuse their asset's single name. Rename mappings are visible before download.

The application test convention is **`Attachments/<exported-filename>`**, forward slashes, literal relative path text with ordinary XML escaping. It is not claimed as a vendor/schema-mandated folder convention. No percent encoding, absolute path, drive path, Blob URL, traversal or GMI wrapper is used.

Serializers escape every dynamic text value and reject XML-illegal characters. Namespaces and element names/order are fixed by the selected profile. Output is XML1.0 with explicit UTF-8 declaration, no BOM, LF, stable indentation/property/feature order. Assets/occurrences are sorted by stable keys, independent of job/membership enumeration order. Root collection ID is unique within each document.

Each download contains exactly:

```text
photos.gml
Attachments/<one original per exported unique asset>
```

No manifest or diagnostics JSON is included. Original bytes and EXIF remain unchanged. Package building re-reads each File, verifies its SHA-256 against preview and uses fflate ZIP pass-through entries, without image transcoding or ZIP compression work on images. XML is the first member; attachments follow stable asset ordering. Entry time is pinned to local DOS date 2000-01-01, with fixed OS/attributes. Tests prove byte-identical ZIPs within the same runtime and deterministic member identity/order.

## Staleness and resource safety

Snapshot guards compare exact live layer membership/source references, accepted metadata/current position/direction/occurrence references and original File identity. Changed values, append/removal, deletion and reset invalidate the preview. Late hashing cannot create a valid stale plan. Serializers/packages reject unissued, invalid or stale plans. Packaging checks liveness before and after asynchronous reads/hashes and before returning the Blob; checksum mismatch rejects changed bytes.

UI configuration changes invalidate the previous preview and operation token. Closing/unmounting prevents a late download; temporary download URLs are tracked and revoked on cleanup or after dispatch. No persistence, retained export registry in photoSession, server upload or WFS subscription was added. Web Crypto hashing requires HTTPS or localhost and produces an explicit error on unsupported insecure origins. ZIP construction is in browser memory; very large delivery stress/performance and ZIP64 are not claimed supported by this test milestone.

## Minimal UI

One **Eksporter** action was added to the FOTO workspace. The native dialog requires an explicit profile (initially blank), shows CRS, whole-layer scope, experimental mapping/north/path assumptions and profile requirements. AsBuilt exposes all required context controls and the XY/photographer omission notices.

Preview precedes download and shows unique images, occurrences, accepted positions, excluded/unplaced counts, planned features, attachment/shared-original counts, renames, warnings and blocking errors. Invalid/stale plans cannot download. No profile is selected according to available metadata. No map buttons/labels or unrelated controls were redesigned. Screenshots at 1920×1080 and 1280×720 were visually inspected; the modal remains inside the viewport and scrolls without horizontal overflow. Styling remains deliberately basic.

## Files and dependencies

Production:

- New `src/lib/photos/export/exportContract.mjs`: explicit profiles, context contract, XML/dateTime checks and data freezing.
- New `asbuiltCodes.mjs`: source-linked/hash-pinned schema enumerations.
- New `attachmentNames.mjs`: deterministic safe names, SHA-256 and UUIDv5 identity.
- New `photoExportPlan.mjs`: read-only snapshot, shared plan, profile validation, counts/provenance and liveness.
- New `photoExportXml.mjs`: separate Legacy/AsBuilt feature serializers over the shared plan.
- New `photoExportPackage.mjs`: guarded, checksum-verified original-byte ZIP builder.
- New `src/components/photos/PhotoExportDialog.js`, `photoExport.css`; additive export action in `PhotoWorkspaceCollection.js`.

Tests: new `tests/photoExportPlan.test.mjs`, `photoExportSerializers.test.mjs`, `photoExportPackage.test.mjs`, `tests/helpers/photoExportFixtures.mjs`; added production-app export subtest in `tests/photoLoadedGmiUi.test.mjs`.

Dependency: **[fflate](https://github.com/101arrowz/fflate) 0.8.3** pinned as a direct dependency. It was already present transitively as 0.8.2; package/lock changes promote it and update that one library. No hand-written ZIP implementation or unrelated dependency upgrades. A temporary lxml installation outside Git was used only for independent XSD verification, not added to application dependencies.

Documentation: this report plus an appended current-audit continuation. Historical reports were not rewritten.

## Validation: exact final results

Disjoint Node selections, counting parent/nested subtests as reported:

| Selection | Files | Tests | Pass | Fail | Skip | Cancelled/todo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Photo/export/domain/store/shared/WFS contracts and Terrain browser integration | 42 | 409 | 406 | 0 | 3 | 0/0 |
| Production-app photo browser selection | 6 | 17 | 15 | 0 | 2 | 0/0 |
| WFS map/workflow/popup browser selection | 3 | 51 | 51 | 0 | 0 | 0/0 |
| **Total** | **51** | **477** | **472** | **0** | **5** | **0/0** |

The first row includes **37 new export tests**: 18 plan, 13 serializers, 6 package. They prove separate assets/repeated occurrences, naming collisions and unsafe names, provenance, exclusions, strict transforms, both exact sequences/CRS, dateTime/north/photographer differences, required context/codes, escaping, original-byte integrity, deterministic XML/ZIP, forged/invalid plan rejection and async stale/reset/checksum protection.

The full-app export subtest imports generated images with EXIF through loaded GMI, explicitly accepts positions/metadata/direction, observes Legacy errors, produces/downloads Legacy ZIP, switches profile, observes missing-context errors, enters synthetic explicit context, downloads modern ZIP, checks omitted modern photographer info/shared attachments/original bytes, and asserts WFS remains at the original **two requests**. Existing ordinary import/reconciliation/append/recheck/positioning/direction/viewer/map/resource regressions also ran. The Terrain integration reports seven internal browser checks within one Node test.

The five skips are unchanged optional private modes: three GMI corpus domain cases, G01/G04 browser case and 148-photo browser case. No private corpus was probed or reaccepted.

Reproducible new export selection:

```powershell
node --test --test-concurrency=1 tests/photoExportPlan.test.mjs tests/photoExportSerializers.test.mjs tests/photoExportPackage.test.mjs
```

The broad domain selection uses the same filename predicate documented in the previous report: prefixes `photo|gmiPhoto|terrainPhotoGml|exifGps|hyperlinkFilenames|layerPresentation|layerOrder|layerHighlight|mapPaneToolbar|mapBackgroundControl|featurePopupContent|featureHoverTooltip|geminiExtent|geminiSession|geminiStoreLifecycle|geminiReferencePresentation|geminiWorkflowUi`; omit `Ui.test.mjs` except `geminiWorkflowUi`, and omit `photoDialogLayout.test.mjs`; concurrency1. New photoExport files are included by that predicate.

Against the fresh production build with PHOTO_UI_URL=http://127.0.0.1:3100:

```powershell
node --test --test-concurrency=1 tests/photoLoadedGmiUi.test.mjs tests/photoDialogLayout.test.mjs tests/photoDirectionUi.test.mjs tests/photoPositioningUi.test.mjs tests/gmiPhotoAssociationsUi.test.mjs tests/gmiPhotoPlacementsUi.test.mjs
node --test --test-concurrency=1 tests/geminiReferenceBrowser.test.mjs tests/geminiWorkflowBrowser.test.mjs tests/geminiPopupBrowser.test.mjs
```

Focused ESLint: **13 changed/new JS/MJS files, 0 errors, 0 warnings**. Production `npx next build --webpack`: **passed**, final production source. `git diff --check`: **passed**; new files also checked separately for whitespace/UTF-8. Existing Browserslist-age notice remains; no unrelated lint debt was repaired.

An intermediate browser run had **17 tests: 13 pass, 2 fail, 2 skip**, from corrupted Unicode selector literals in the newly inserted test (failed subtest plus parent). Corrected the test text to UTF-8 and restored the untouched baseline outside the additive subtest; all final selections above pass. No assertions were removed to make the feature pass.

### Actual XSD validation

Independent **lxml6.1.3 / libxml2 2.11.9** compiled the complete official application schemas with **57 resolved dependency URLs**, cached outside Git. HTTPS retrieval, allowed official hosts, dependency SHA-256 ledger and no unresolved-import fallback were used. Current OGC dependency files under `/3.2.1/` declare 3.2.2; this is recorded rather than hidden.

**9/9 explicit schema checks passed:** five generated positive documents validate (both profiles × both CRSs, plus modern unknown direction), and four deliberately invalid documents are rejected (missing required Legacy direction, wrong Legacy property order, missing modern quality, partial modern photographer block). These are real full-instance XSD checks of those fixtures, not a claim that every possible output or Gemini importer has been accepted. Structural Node tests additionally exercise runtime contract edges. No schema files were silently modified or weakened.

Logs and independent validator/cache are in `%TEMP%/photo-dual-export/`: `domain-final.log`, `app-final.log`, `wfs-final.log`, `build-final.log`, `validate.py`, `schema-dependencies.json`, `schema-cache/`, and `screenshots/`. Source schema hashes are above. The external Python verification harness/dependency cache is a local audit artifact, not a new mandatory dependency of normal Node tests.

## Monday Gemini manual acceptance matrix

**No results have been recorded.** Generated samples use only invented test data and tiny generated PNGs, with synthetic context explicitly separate from real delivery facts. Do not reuse their context as truthful project defaults.

Prepared outside Git in `%TEMP%/photo-dual-export/`:

- `legacy2019-25832.zip`: 5 features / 4 original attachments, including a shared attachment across two different accepted positions, 0/90/180/270-degree examples, Unicode/space filename, offset and timezone-free capture values, accepted photographer.
- `asbuilt52-25832.zip`: same feature/attachment cases with explicit synthetic required context, XY geometry and deliberately omitted image-information/photographer block.
- `asbuilt52-25832-unknown-direction.zip`: 1 feature / 1 attachment, optional direction absent.
- `legacy2019-25833.zip`, `asbuilt52-25833.zip`: same core set in the other supported output CRS.

Extract each ZIP into its own clean directory so sibling `photos.gml` and `Attachments/` remain together. Record actual Gemini product/version, selected import function, installed schema/version, CRS selection and every diagnostic. Do not describe success until inspecting imported results.

| Case | Legacy2019 expectation to inspect | AsBuilt5.2 expectation to inspect |
| --- | --- | --- |
| One ordinary accepted occurrence | One Skråfoto with available image | Same; inherited context readable |
| Shared original, two features | Both features retained; one physical image resolves from both | Same; note collapse/rejection/duplication behavior explicitly |
| Cardinal directions | 0 north,90 east,180 south,270 west | Same for present direction; absent case must not become north silently |
| Unicode and spaces | Filename/path opens without repair | Same |
| Offset vs local dateTime | Capture values read without unexpected UTC/zone changes | Same; document display conversion/precision |
| Photographer | Accepted name present where supported | No photographer claimed; block intentionally absent |
| EPSG:25832 XY | Correct easting/northing/map location, no fabricated height | Explicit XY acceptance/rejection is a key experiment |
| EPSG:25833 XY | Correct transformed location if tested | Same |
| Original attachment integrity | Image/EXIF bytes not altered by our ZIP; record any importer copy behavior | Same |
| Schema/import diagnostics | Save complete diagnostic categories and field/path errors | Especially inherited context/vertical method/XY requirements |

Also generate one fresh package through the app with values truthful for the local test project, using the actual agreed import workflow. Missing accepted time/direction/context cases should be blocked in preview as specified, not repaired manually inside generated XML to conceal errors. Object association preservation is not expected or claimed.

## Remaining limits and unproven compatibility

Neither profile is proven importable into the local Gemini installation. XSD success does not establish image resolution, north/time interpretation, repeated-file feature retention, recipient-specific requiredness or cross-format associations. Modern XY, the occurrence-preserving mapping and forward-slash Attachments convention remain explicit test assumptions.

Only entire current FOTO layer scope and uniform AsBuilt context are supported. Date/minute precision is not promoted; camera/focal fields remain absent; modern photographer omission is visible. Only two horizontal CRSs are supported, with no accepted camera height. Source image support/decodability in Gemini, very large packages, cross-reload IDs and app re-import of modern/repeated-file GML remain unproven or outside scope. The current GML input matcher still treats repeated references as ambiguous; this exporter does not rewrite it as a false round-trip oracle.

No GMI/object rewriting, relationship serialization, automatic camera inference, accepted-Z invention, terrain sampling, source-direction adoption, metadata-domain expansion, persistence, extra profiles, WFS/3D/topology/Validator changes or broad UI cleanup. Next step is the documented local Gemini import experiment and a precise evidence-based follow-up from its results.
