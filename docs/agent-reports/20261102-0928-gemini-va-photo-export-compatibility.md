# Experimental Gemini VA photo delivery compatibility

Current acceptance update (2026-11-02): the user reports successful Foto mapping and GeoFoto import after replacing UUIDv5 export identities with UUIDv4. See the dated acceptance continuation below; earlier pending/UUIDv5 statements describe the initial implementation. The updated production exporter still needs one untouched UI-package import.

Starting HEAD: `d005e1f Refine photo marker colors and placement cursor`. Root `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, clean worktree confirmed before edits. No sub-agents, commits or pushes. Reference: `C:\GitHub\gmi-validering-test\REF_FILES\GML-leveranse`.

## Evidence and privacy

Read the four requested 20261031 reports and current plan, serializers, package, fixtures and UI. Direct read-only inventory: one root `.gml` (44,607 bytes), one `Attachments` subfolder, 40 `.jpg` files, no XML/other files or deeper folders. All 40 relative references resolve with exact spelling/case to the 40 images; no duplicate references, shared images, missing or unreferenced images. Filenames include Norwegian Unicode; all extensions are lowercase `.jpg`. No reference bytes were changed. Customer filenames, coordinates and photographic content are deliberately excluded from this report and committed fixtures.

Generated representative pre-change Legacy and AsBuilt documents with two occurrences sharing one synthetic original using the actual current plan/serializers. Baselines are outside Git in `%TEMP%/gemini-va-photo-compatibility/{legacy2019,asbuilt52}-baseline.gml`.

## Structural comparison completed before production changes

| Aspect | Working contractor | Current Legacy | Current AsBuilt | Likely compatibility significance |
| --- | --- | --- | --- | --- |
| XML declaration / encoding / newlines | XML 1.0 UTF-8, standalone=no, no BOM, LF | XML 1.0 UTF-8, no standalone, LF | Same as Legacy | Probably incidental; reproduce declaration |
| Root | gml:FeatureCollection | Same | Same | Confirmed working convention |
| Namespaces / declaration order | gml, app(20190101), xlink(unused), xsi | gml, app(20190101), xsi | gml, app(AsBuilt5.2), xsi | Legacy vocabulary likely significant; declaration order has no evidence of significance |
| schemaLocation | 20190101 namespace and matching HTTP XSD | Same | Modern HTTPS namespace/XSD | Standards metadata, not importer proof |
| Collection ID | id + hyphenated lowercase UUID | photo-collection | photo-collection | Probably incidental syntax; reproduce safely |
| boundedBy | First collection child, one 3D Envelope | Absent | Absent | Gemini-likely convention |
| Envelope CRS / dimension | urn:ogc:def:crs:EPSG::5972 / 3 | Absent | Absent | Gemini-likely convention |
| Corners / axes | Easting Northing Z, mixed precision (1 to 10 decimal places) | Absent | Absent | Deterministic bounds required for this experiment |
| Container / feature | gml:featureMember / app:Skråfoto | Same | Same local name, modern namespace | Confirmed working convention |
| Feature IDs / local IDs | id + hyphenated UUID; localId equals UUID suffix | photo-UUID / same UUID | photo-UUID / guid UUID | Syntax probably incidental, reproduce |
| gml:name | All 40, equals attachment basename | Absent | Absent | Gemini-likely convention |
| Property sequence | name, point, link, direction, identification, optional time | point, link, direction, identification, required time, optional image info | inherited context, point, time, link, optional direction | Legacy extension order already agrees; inherited name precedes it |
| Point wrapper | fotograferingspunkt / gml:Point / gml:pos | Same | Same | Confirmed / schema structure |
| Point ID | Independent id + hyphenated UUID | point-UUID (same UUID as feature) | Same | Probably incidental; use distinct deterministic UUID |
| Point CRS | No srsName on any Point or pos; CRS only on sibling collection envelope | Explicit selected URN on Point | Same | Important empirical difference; collection fallback is importer convention, not ordinary XML ancestor inheritance |
| Point dimension | All 40 explicitly dimension 3 | 2 | 2 | Gemini-likely convention |
| Numeric precision / Z | All 120 ordinates six decimals; 38 zero Z, 2 nonzero | XY, three decimals, no Z | Same | Zero is empirically tolerated; no proof of measured heights |
| Coordinates | Projected E N Z | Projected E N, 25832 or 25833 | Same | Use 25832 horizontal infrastructure for 5972, no vertical conversion claim |
| fotolink / layout | Literal Attachments\basename.jpg, sibling Attachments directory | Attachments/basename, same directory layout | Same | Gemini-likely path convention; preserve Windows separators in XML |
| Filename case / Unicode | Exact case; Norwegian characters; lowercase jpg | Safe Unicode/space names, collision-safe renames | Same | Preserve existing safe naming; reference has no shared/collision evidence |
| Identification / navnerom | Identifikasjon: lokalId then empty navnerom, all 40 | Same order, exporter-owned nonempty namespace | Identifikasjon/guid | Empty namespace is confirmed working; no reason to change other profiles |
| Direction | All 40; Retning: value, unit, reference; unit=1/reference=1; 29 zero, 11 fractional | Same structure/codes, accepted fractional degrees | Retningsvektor: unit, reference, value | Retain direction requirement as conservative experimental policy, not proven importer necessity |
| Capture time | 26 full second timestamps, no fractions/zones; 14 absent | Required full seconds/fractions; offsets retained | Same requirement | Accepted delivery proves absence tolerated in this path; conflicts with Legacy XSD required cardinality |
| Missing/partial timestamp | Absent on 14 features | Blocks export | Blocks export | Separate profile permits absence; partial accepted dates omitted with warning |
| Photographer / image info | Entire block absent on all 40 | Optional accepted photographer | Block omitted, photographer warning | Initially omit in compatibility output |
| Relations / other optional properties | No relationships or other optional properties | No object relations | No relations; required modern context | Avoid adding unsupported complexity |
| Empty elements | 40 empty navnerom; no other empty application values | No intentionally empty values | Same | Reproduce empty namespace |
| UUID format | Hyphenated lowercase UUIDs, id prefix; distinct point/feature IDs | Deterministic UUIDv5; photo-/point- prefixes | Same | Exact contractor generator is unnecessary |
| Feature ordering / filename identity | Not lexically sorted by filename; feature UUID does not encode filename | Stable occurrence ID ordering | Same | Probably incidental; preserve deterministic ordering |
| Duplicate/shared attachments | None: 40 distinct links for 40 features | Supported, one original per asset | Same | Manual experiment needed for repeated occurrences |

## Classification and limits

Confirmed working means observed in this one accepted delivery, not required by Gemini. Geometry, links, identification and sequence have public schema support; exact CRS, dimensionality, filename name, path separators and empty namespace are empirical compatibility hypotheses. Envelope fallback and timestamp absence must not be silently corrected to fit our schema assumptions. ID randomness, whitespace, decimal precision, namespace declaration order and unused xlink are probably incidental. No controlled Gemini import experiment has isolated a causal requirement; the exact cause of previous failures remains unknown until manual tests.

Timestamp absence is stronger empirical evidence than the current exporter policy: 14/40 absent, 26/40 present, 0 timezone suffixes and 0 fractional seconds. Legacy XSD requires time, so intentional timestamp omission can be schema-invalid while matching the accepted dialect. Nonzero Z provenance is unknown until supporting EXIF inspection; zero must never be represented as measured height.

## Further empirical findings

The reference envelope has mixed decimal precision and differs slightly from feature extrema. Tiny XY rounding differences leave some points nominally outside; all lie within a 1 mm tolerance. Z is enclosed. This is documented rather than silently treating the reference as mathematically exact. Generated compatibility bounds deliberately enclose all serialized point tuples exactly and use six decimals. All Point/pos values, in contrast to the envelope, have exactly six decimal places.

There are 17 Unicode filenames and no filenames containing spaces. The synthetic manual package uses Unicode with underscores; portable collision/escaping tests additionally exercise spaces as an unverified importer edge. Reference feature order is not filename lexical order. Every feature ID is exactly `id` plus its own localId. All 81 root/feature/point IDs follow lowercase hyphenated UUID syntax; the proposed no-hyphen hypothesis was disproven.

Basic EXIF inspection was read-only and aggregate: 26 images have original capture time, all 26 exactly match GML local second timestamps. Eleven images have EXIF image direction and eleven have altitude; both nonzero GML Z records have altitude evidence. No photographic pixels were inspected or reproduced. Height datum, vertical accuracy and provenance remain unknown: presence of EXIF altitude alone does not make it an accepted camera height. The current domain has no accepted Z, so no source altitude is promoted or copied.

## Implementation architecture and profile

Profile key: `gemini-legacy2019`. Selector label: **Gemini VA · Skråfoto 2019 (eksperimentell)**. The existing frozen snapshot -> profile plan -> serializer -> original-byte ZIP architecture is retained. Legacy and AsBuilt requirements and serialized conventions remain available and unchanged. The common plan only gains export diagnostics and collection ID data; no canonical state or acceptance API is modified.

The compatibility profile fixes output to EPSG:5972 and transforms horizontal accepted WGS84 lon/lat with the existing proj4 EPSG:25832 infrastructure (the horizontal component of 5972). No projection formula, EPSG:3857, vertical transform or datum/accuracy claim is introduced. Portable tests reuse the pinned independent horizontal fixture already used by the standards profiles and verify Easting/Northing ordering. All output points are XYZ with export-only `0.000000` Z. All three manual-package points are placeholders, not measured heights. The 3D envelope uses deterministic min/max of exported E/N/Z, six decimal places, lower and upper Z zero. Empty/all-unplaced exports block; no fictitious empty envelope is emitted.

To reproduce the accepted delivery, CRS is declared on the collection Envelope only; each Point has dimension 3 but no srsName. This relies on the observed importer envelope convention rather than ordinary ancestor inheritance. The package retains POSIX ZIP entry separators, correctly extracting into sibling `Attachments`; only XML links use literal backslashes.

Every feature gains filename `gml:name` before the existing legacy sequence. IDs use `id` plus deterministic UUIDv5, with distinct semantic keys for collection, occurrence and geometry; localId is the occurrence UUID. Empty navnerom is explicit. Existing safe Unicode naming, collision handling, staleness guards and original-byte checksums remain authoritative. Filename is never the sole identity. XML declaration includes standalone=no, and unused xlink declaration is reproduced as an incidental convention with no claimed causal importance.

Capture time is optional in this profile. Only accepted, internally consistent second/fraction precision timestamps are emitted. Missing or date/minute precision values are omitted with aggregate preview diagnostics; no seconds, midnight or source evidence is substituted. Serialization removes offset/Z suffix and fractional seconds, preserving the accepted local clock portion. It neither converts to UTC nor changes canonical metadata. Warnings explicitly disclose these transformations. Existing Legacy/AsBuilt retain full accepted timestamps and block missing/partial capture time.

Direction remains conservatively required for compatibility output because all 40 reference features contain it, not because necessity has been demonstrated. Known north stays numeric zero; fractional degrees remain exact. Retning emits value/unit/reference, codes 1/1. Geographic-north clockwise meaning remains an explicit app assumption; the reference proves codes and numbers, not the contractor's actual semantic interpretation. No inference from object geometry is introduced.

The entire optional image-information block is omitted; preview reports omitted accepted photographer count. Associations remain in the app and are counted as omitted. No canonical photo position, capture metadata, direction, EXIF evidence, provenance, association, loaded GMI, or persistence code changes were made.

Minimal UI additions: selector entry, fixed CRS/XYZ explanation, optional-time readiness explanation, extraction instructions, and preview counts for Z placeholders, missing full timestamps and timezone removals. Existing collapsed diagnostics expose omissions and transformations. The missing-value readiness counts remain truthful counts; the compatibility explanation explicitly states missing time is not blocking. No date picker, large technical panel or export redesign was added.

## Files changed

- `src/lib/photos/export/exportContract.mjs`: third explicit profile.
- `src/lib/photos/export/photoExportPlan.mjs`: scoped requirements, horizontal mapping, XYZ placeholders, IDs and diagnostics.
- `src/lib/photos/export/photoExportXml.mjs`: scoped contractor-style XML and bounds.
- `src/components/photos/PhotoExportDialog.js`: profile-specific instructions and preview.
- `src/components/photos/PhotoEvidenceActions.js`: optional-time explanation scoped to compatibility.
- `tests/photoGeminiCompatibility.test.mjs`: eight portable/reference comparison tests.
- `tests/helpers/geminiPhotoConventions.mjs`: structural assertion helper shared by synthetic, reference and browser checks; no private fixture.
- `tests/helpers/generateGeminiPhotoPackage.mjs`: repeatable outside-Git synthetic JPEG package generator.
- `tests/helpers/photoExportFixtures.mjs`: optional supplied original Files for synthetic generation, default unchanged.
- `tests/photoLoadedGmiUi.test.mjs`: third-profile preview/download/original-byte acceptance alongside existing two profiles.
- This report and appended export-contract audit continuation.

## Validation

| Final selection | Tests | Pass | Fail | Skip |
| --- | ---: | ---: | ---: | ---: |
| Photo/export/domain + selected shared WFS contracts + embedded Terrain browser integration (38 files) | 435 | 432 | 0 | 3 |
| Production-app export/loaded-GMI and direction browser acceptance (2 files) | 12 | 12 | 0 | 0 |
| WFS production browser regressions (3 files) | 51 | 51 | 0 | 0 |
| **Disjoint Node total** | **498** | **495** | **0** | **3** |
| Focused export plan/serializer/package/Gemini rerun (subset of domain; not additive) | 45 | 45 | 0 | 0 |
| Independent XSD expectations | 9 | 9 | 0 | 0 |

Three domain skips are existing optional private GMI corpus cases; unrelated private corpora were not opened. The optional contractor comparator **ran and passed**, checking all 40 reference features read-only. When the reference directory is absent, that single comparator explicitly skips while portable synthetic tests continue.

Focused ESLint: ten changed/new JS/MJS files, **0 errors, 0 warnings**. Production `npx.cmd next build --webpack`: **passed** compilation, TypeScript and static generation. `git diff --check`: **passed**. No package/dependency changes. Existing Node module-type and Browserslist notices remain.

The earlier outside-Git XSD harness/cache documented by prior reports was unavailable in this environment. An equivalent independent lxml 6.1.3 harness was reconstructed under this task's TEMP directory, resolving 60 official schema URLs into a temporary cache. It validates fresh compatibility output with all timestamps and both pre-change baseline profiles, rejects compatibility missing time as expected, observes exactly 14 missing-time errors in the contractor GML, and preserves expected negative checks for absent Legacy direction, wrong Legacy order, absent modern quality and incomplete modern image info. **9/9 means expected outcomes, not nine schema-valid deliveries.** The synthetic import package intentionally contains a missing-time feature and is consequently not Legacy-XSD-valid. No schema was weakened.

Initial verification issues: fixture manual direction edit rounds fractional input; the new test now uses the existing fractional bulk-fill API. A whole-photo comparison included asynchronously arriving thumbnail dimensions; preservation assertions now compare canonical accepted position/direction/metadata/context specifically. The empty-layer fixture helper cannot construct a nonexistent layer, so the empty export snapshot is tested directly. Final tests retain fractional, empty and canonical-preservation coverage. Initial restricted Chrome integration timed out and Google Font fetching failed; reruns with local Chrome/network access passed. No unrelated production changes were needed.

## Generated manual artifacts and reproduction

Exact artifact directory: `C:\Users\GEMINI~1\AppData\Local\Temp\gemini-va-photo-compatibility` (the actual `%TEMP%` expansion).

- `gemini-compatibility-synthetic.zip`: manual transport package.
- `extracted/photos.gml`, sibling `extracted/Attachments/`: already extracted equivalent.
- `gemini-present.gml` / `gemini-missing.gml`: independent XSD instances.
- `legacy2019-baseline.gml` / `asbuilt52-baseline.gml`: pre-change comparison instances.
- `domain-final.log`, `export-final.log`, `browser-final.log`, `lint-final.log`, `build.log`, `xsd-final.log`, `wfs.log`, `validate.py`, `schema-cache/`: evidence outside Git.

The manual ZIP has **3 features / 2 original JPEG attachments / 1 shared original / 3 placeholder Z / 1 missing timestamp / 2 timezone removals**. Images are valid 64x64 synthetic color patterns generated through local Chrome canvas, never customer photos. Both original JPEGs are 896 bytes; output bytes are preserved unchanged. Cases include manual accepted positions, known north, fractional direction, present offset/fraction time, absent time, Unicode filename and repeated occurrences. Distinct EXIF/GMI/GML position-provenance variants are unnecessary for serialization: code selects only the accepted horizontal position and has no provenance-dependent output branch. Existing domain/browser regressions cover those acceptance paths.

Regenerate with `node tests/helpers/generateGeminiPhotoPackage.mjs` (requires installed headless Chrome). Portable tests: `node --test --test-concurrency=1 tests/photoExportPlan.test.mjs tests/photoExportSerializers.test.mjs tests/photoExportPackage.test.mjs tests/photoGeminiCompatibility.test.mjs`. Browser tests use `PHOTO_UI_URL=http://127.0.0.1:3100` against the fresh production build. Domain selection follows the filename predicate from previous reports with prefixes photo/gmiPhoto/terrainPhotoGml/exifGps/hyperlinkFilenames/geminiExtent/geminiSession/geminiStoreLifecycle/geminiReferencePresentation/geminiWorkflowUi, excluding Ui except geminiWorkflowUi and excluding photoDialogLayout.

For actual current FOTO data: open Eksporter, choose **Gemini VA · Skråfoto 2019 (eksperimentell)**, generate preview, review missing directions/positions and all transformations, then download the test package. Missing time is optional only in this profile. No acceptance or metadata autofill is performed by preview/export.

## Manual Gemini VA acceptance matrix

1. Extract the ZIP (or use `extracted`). Confirm `photos.gml` and sibling `Attachments` with the two JPEGs.
2. Import **photos.gml** using exactly the same Gemini VA function/settings that accepted the contractor delivery. ZIP import is not claimed.
3. Record the following results and compare against the contractor import method/settings:

| Check | Expected test observation | Actual result |
| --- | --- | --- |
| Acceptance and diagnostic text | Record accepted/rejected and exact message | Pending |
| Feature / visible photo counts | 3 separate features; record visible photo count | Pending |
| Attachment opening | Both original JPEGs open | Pending |
| Map positions | Three synthetic accepted placements appear in expected locations | Pending |
| Direction | Explicit north and fractional direction retained | Pending |
| Timestamp | Two local second timestamps, one absent; note importer interpretation | Pending |
| Shared attachment | Two occurrences reference one original without loss/merging | Pending |

## Remaining uncertainty (initial implementation; superseded in part below)

Actual Gemini VA import acceptance is **pending user manual testing**. This work identifies exact structural differences, not a proven causal failure mechanism. Envelope-only CRS, Windows links, name, XYZ and optional time are empirically motivated hypotheses, not certified/general importer requirements. Shared occurrences, zero-height interpretation, true/grid north semantics, Unicode edge cases, empty namespace handling and local timestamp interpretation still need manual inspection. If the bundle fails, use controlled one-convention-at-a-time experiments; do not reinterpret XSD success as desktop acceptance. No AsBuilt-specific Gemini work, state/persistence changes, object relationships, source ranking, topology, 3D display, vendor-support contact or other deferred work was implemented.



## 2026-11-02 acceptance continuation: UUIDv4 / Gemini VA-FME

**Empirically confirmed Gemini VA/FME compatibility behavior**, based on the user's controlled manual test supplied for this task. Classification: **Experimentally accepted in the user's tested Gemini VA/FME import path**. This is not certification, universal Gemini support, or a claim of standards purity. Exact Gemini VA build and FME version were not supplied; older reports' software version references must not be substituted for the tested version. No returned conversion artifact or log was independently supplied/read in this task; the following sequence is user-reported empirical evidence.

Initial app-generated compatibility package: Gemini/FME reported `Translation Successful`, but returned no usable Foto rows. Conversion diagnostics showed all four generated Skråfoto rejected with `SOSI.SOSI_Objekt.identifikasjon.lokalId is not a valid guid`. Their generated localIds were UUIDv5. Server translation success therefore did not establish usable photo output.

Controlled experiment: all export UUIDs were replaced with RFC 4122 UUIDv4 values while the rest of the then-current experimental package was preserved. Gemini discovered all four Foto records, populated GUIDs, zoomed to their extent, displayed photo symbols, completed import, and registered the photos in the GeoFoto database/map layer. This demonstrates the complete package -> FME conversion -> Foto mapping -> Gemini VA import -> GeoFoto workflow for that controlled package.

| Finding / experiment | Evidence classification |
| --- | --- |
| UUIDv5 feature lokalId rejection versus UUIDv4 acceptance | Confirmed blocker in the tested path; not a universal rule for every Gemini version |
| Collection/Point UUIDv4 | Present in successful package and now generated; logs specifically identify feature lokalId, not those other identities independently |
| gml:pos srsDimension=3 | Present in successful package; earlier dimension-only experiment did not resolve the failure |
| Contractor root attribute order | Present in successful package; earlier order-only experiment did not resolve the failure |
| Non-degenerate/nonzero-Z envelope | Earlier experiment failed to resolve the issue; no causal necessity established |
| Zero-Z geometry/envelope behavior | Successful package convention retained; zero is compatibility-only, never measured camera height |

Starting code at `ed73ec2` lacked the manually tested pos dimension attribute and contractor root attribute order. This fix explicitly carries those two successful manual refinements into Gemini-only serialization while changing GUID policy. Their necessity is still unproven. The root now orders xmlns:gml, gml:id, xmlns:app, xmlns:xlink, xmlns:xsi, schemaLocation, as the read-only contractor file does. Point and pos both declare dimension 3.

The compatibility plan now calls platform `crypto.randomUUID()` for separate collection, feature and Point identities. Feature `gml:id` is `id` plus the exact localId UUID. IDs are allocated once while building the frozen plan, checked for document uniqueness, and never regenerated during XML serialization or packaging. Rebuilding a plan requests fresh UUIDv4 values. Export GUIDs do not enter photoSession or persistence. Legacy/AsBuilt retain their deterministic UUIDv5 policy and exact serialized bytes. No UI GUID control or UI redesign was added.

The optional read-only reference comparator verifies 81/81 UUIDv4 collection/feature/Point IDs and 40 matching feature/localId relationships. No private UUIDs, filenames or coordinates are copied into fixtures. Missing capture time remains intentionally supported: the working reference omits it on 14/40 photos, and the official Legacy XSD still requires it. This discrepancy remains visible rather than being normalized away.

Remaining uncertainty is now narrower: the UUID version is the confirmed blocker; XML dimension/header and envelope experiments are not equally likely explanations after the controlled result. Actual equivalence of the updated production code and the manually patched package awaits one final **unmodified UI download** import. Duplicate/shared originals, other Gemini/FME versions and broader dataset combinations are not independently certified by the four-photo success.

Final manual acceptance: deploy/update the app, generate **Gemini VA · Skråfoto 2019 (eksperimentell)** from the UI, extract ZIP, import untouched `photos.gml` with sibling `Attachments`, and confirm Foto rows plus final registration in GeoFoto. Record conversion diagnostics, feature/photo counts and attachment opening. See [GUID-fix implementation and validation](20261102-1036-gemini-va-photo-guid-acceptance-fix.md).
