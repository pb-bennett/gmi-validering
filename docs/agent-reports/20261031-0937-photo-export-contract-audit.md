# Photo export contract and schema audit

Audit date: 2026-10-31, Europe/Oslo. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`. Starting HEAD: **`0287918d89b8f3ef11712b967ac7002f954ab972` — Add photo capture metadata**.

**Decision: NOT READY for the complete production Gemini photo exporter.** Official schemas substantially narrow the contract, but camera-position versus object-placement semantics, mandatory modern AsBuilt metadata and the exact receiving Gemini profile remain unresolved. This report proposes a lossless internal export plan and conditional serialization contracts. It implements nothing.

## 1. Preflight, method and authority

Confirmed repository root, exact branch/HEAD and clean worktree before substantive work. Read all three requested reports. Searched tracked files and the working tree, including ignored filenames while excluding Git internals, dependencies, build output and usage data. Searched schema/document/sample extensions, Norsk Vann, photo/bilde/foto, attachment/hyperlink, identity, geometry, direction, date, namespace and file-export terms. No private corpus environment variable was configured. No historical customer path, guessed private location, credential file or photo original was opened.

Labels throughout:

- **SCHEMA:** inspected official XSD, including inherited types and sequence/cardinality.
- **DOC:** official documentation, with version/scope stated.
- **SAMPLE:** observed in an official public example; not a requirement.
- **HISTORY:** repository report of earlier source inspection; not renewed acceptance.
- **APP:** current code/tests; not a delivery standard.
- **DESIGN:** proposed application policy; not a schema requirement.
- **UNKNOWN:** insufficient evidence or a decision requiring confirmation.

The requested evidence hierarchy was retained. No authoritative photo XSD or original instruction PDF is committed at this HEAD. External official XSDs are identified separately below. Synthetic fixtures and derived rule metadata do not become schema authority.

## 2. Repository evidence inventory

| Files / group | Classification and relevance |
| --- | --- |
| `docs/agent-reports/20261030-1543-photo-workflow-current-state-audit.md` | HISTORY: architecture/export gaps; read dated continuations with the original snapshot. |
| `20261030-1633-photo-loaded-gmi-reconciliation-implementation.md`, `20261031-0920-photo-metadata-implementation.md` in that directory | HISTORY: current asset/occurrence/resource and accepted-metadata model. |
| `20261006-photo-spatial-milestone-planning.md`, `20261006-photo-spatial-milestone-implementation.md` | HISTORY: external Terrain delivery structure, IDs, paths, local dateTimes, zero Z, Unicode; not reopened here. |
| `20261008-gmi-photo-source-audit.md`, `20261008-gmi-photo-corpus-audit.md`, `20261008-gmi-photo-associations-implementation.md` | HISTORY: real GMI grammar/GUID/many-to-many observations; no official photo GML schema. |
| `20261008-photo-direction-implementation.md`, `20261019-gmi-photo-placement-correction.md`, `20261020-gmi-photo-defaults-and-marker-ordering.md` | HISTORY: direction, POINT occurrences and default proposals. |
| `20261019-photo-unified-source-workflow-planning.md`, `20261019-photo-unified-source-workflow-slice1-implementation.md` | HISTORY: evidence/acceptance separation. |
| Earlier `20261005-photo-*`, workspace/manual-placement/filename-copy reports | HISTORY: product intent and implementation; no demonstrated desktop Gemini output round trip. |
| `docs/archive/agent-reports/20260820-innmalingsinstruks-rule-source-mapping.md`, `20260831-validator-v2-v32-rebaseline-plan.md`, `20260831-validator-v2-v32-baseline-implementation.md` | HISTORY: earlier full PDF reads; v3.2 August 2026 and Gemini VA 5.15 revision 4040. Actual PDFs absent now. |
| `docs/validation-v2/{innmalingsinstruks-rule-source-map,gmi-adapter-spec,gmi-adapter-test-vectors,gmi-header-evidence,field-resolution-census,legacy-rule-provenance-map}.json` | Derived source maps/application contracts, not original documentation or GML schemas. |
| `src/data/validation-v2/{field-information.json,authoritative-value-tables.js}`, `src/lib/validation-v2/registry/{fields,rules}.js`, `src/data/fields.json`, `src/data/rules/{points.json,lines.json,custom/point-logic.js,custom/line-logic.js}` | APP/derived instruction metadata: S_HYPERLINK, DFOT/Fotopunkt, survey policies; no GML conversion contract. |
| `src/lib/photos/terrainPhotoGml.mjs` | APP: legacy input compatibility parser. |
| `src/lib/photos/{photoSession,photoSpatial,photoCaptureMetadata,photoDirection,exifGps,gmiPhotoSource,loadedGmiSource}.mjs` | APP: canonical state, provenance and resources. |
| `src/lib/photos/{photoReferenceMatching,photoPositionSources,photoPositioning,photoSourceReviewPresentation,photoPresentation,photoMapFeatures,imagePreview}.mjs`, `src/lib/map/coordinateProjection.js`, `src/lib/hyperlinkFilenames.mjs` | APP: matching, ambiguity, projection, supported images and reference grammar. |
| `src/components/photos/{PhotoGmlSummary,PhotoGmiSummary,PhotoGmiInspector,PhotoOccurrenceContext,PhotoSpatialInspector,PhotoMetadataEditor,PhotoMapPopup,PhotoCollectionDialog,PhotoCollectionPanel,PhotoPositioningWizard,PhotoWorkspaceCollection,PhotoDirectionControls}.js` | APP: presentation and explicit editing, not schema authority. |
| `src/lib/parsing/{gmiParser,gmiDecoding,gmiLexicalEvidence,sosiParser,kofParser}.js` | APP: input parsers. GMI Latin-1 is not a GML encoding rule. |
| `src/lib/gemini-wfs/{parseGeminiGml,geminiXmlEncoding,nodeXmlParser}.mjs`, `tests/fixtures/gemini-wfs/{README.md,syntheticProfile.mjs,popupProfile.mjs,connection.mjs}`, `tests/browser/geminiGmlChecks.mjs`, `tests/geminiNodeXmlParser.test.mjs` | APP/synthetic service-input profile. WFS namespace and VA_LINE/VA_MPNT are not photo export vocabulary. |
| WFS M2/M7 reports, including `20261028-gemini-wfs-m2-gml-parser-implementation.md`, `20261029-gemini-wfs-m7-real-service-acceptance.md`, `20261030-gemini-wfs-m7-presentation-closeout.md` | HISTORY: service reading, not photo GML import into desktop Gemini. |
| `README.md`, `src/components/StandardsInfoModal.js` | General capability/reference links, not photo specification. |

`git ls-files` found **zero committed `.xsd`, `.gml`, `.xml`, `.pdf`, `.docx` or delivery `.zip` files**. There are 13 committed `.gmi` files, explicitly synthetic. Referenced old `src/data/...v3-1.pdf` and ignored `REF_FILES/innmalingsinstruks/2026-v3.2/...` originals are absent from this checkout. No alternative private paths were probed.

No existing non-photo GML/survey writer, attachment packager or reusable delivery serializer was found. JavaScript `export` declarations are module exports, not file export. Thumbnail/original Blob URL creation is resource handling. No committed real photo GML delivery is available as a golden fixture.

### Synthetic and generated input inventory

- Actual DOMParser/generated legacy XML: `tests/browser/photoSpatialChecks.mjs`, `tests/terrainPhotoGml.test.mjs`.
- Generated full-app GML strings: `tests/{photoDirectionUi,photoPositioningUi,photoWorkspaceUi,gmiPhotoAssociationsUi}.test.mjs`. Some omit required properties or reorder them; passing these proves parser tolerance only.
- Metadata/source/geometry objects: `tests/{photoCaptureMetadata,photoDirection,photoManualPlacement,photoPositioning,photoReferenceMatching,photoSourceWorkflow,photoSpatial,photoSpatialProjection,photoWorkspace}.test.mjs`.
- GMI/repeated/resource fixtures: `tests/{gmiPhotoAssociations,gmiPhotoPlacements,gmiPhotoPlacementsUi,photoLoadedGmi,photoLoadedGmiStore,photoLoadedGmiUi,photoGmiDefaults,photoAppendDuplicates,photoAppendDuplicatesUi,photoSession,photoImportLayers,photoResetIntegration,photoMapFeatures,photoPreviewLifecycle}.test.mjs`.
- Generators/harnesses: `tests/helpers/{gmiPhotoFixtures,photoGpsFixtures,photoSourceWorkflow,photoDialogLayout}.mjs`. GMI envelopes are generated; several pinned literals originated in historical audits. Those literals were not reused as illustrative output here.
- Optional private modes: `tests/{gmiPhotoCorpus,gmiPhotoPlacementCorpus,photoSpatialUi,photoManualPlacementUi,photoWorkspaceUi}.test.mjs`; not executed against private data.
- `tests/fixtures/gmi-v32/{README.md,manifest.json}`; `valid/{batch2-oracle,installation-history,line-clean-modern,line-dimensions-shapes,line-hydraulic,point-applicability-tema,point-boundaries,point-clean-modern,point-text-placeholders}.gmi`; `invalid/{comprehensive-bad,parser-no-geometry,parser-no-signature,parser-truncated-object}.gmi`. README explicitly classifies all as fabricated Latin-1/LF inputs.

Other photo UI/layout/resource tests and styles provide no independent schema or importer authority.

## 3. Official external reference inventory

Public references were fetched only after repository inspection established the evidence gap.

| ID | Reference | Authority and limitation |
| --- | --- | --- |
| S1 | [2019 LedningsnettEtablertEllerFlyttet XSD][S1] | Official legacy application schema matching the parser namespace. |
| S2 | [Norsk Vann Asbuilt 5.2 XSD][S2] | Production-hosted modern schema; inherited requiredness inspected. |
| S3 | [Norsk Vann Eksisterende 5.2 XSD][S3] | Different delivery purpose/cardinality. Test-hosted copy was byte-identical. |
| S4 | [AsBuilt 5.2 product specification][S4] | Official PDF, 214 pages. Relevant tables rendered/visually inspected. Page 11 still calls December 2025 version a proposal despite production hosting; confirm recipient profile/status. |
| S5 | [2019 official example][S5] | One Skråfoto, remote image URL, local dateTime, direction codes 1/1, XYZ with collection EPSG:5973; not Gemini acceptance. |
| S6 | [Eksisterende 5.2 test-area example][S6] | One Skråfoto, placeholder link, offset/fractional dateTime, Point EPSG:5972/XYZ. Uses test-host namespace while downloaded XSD targetNamespace uses production host; not an unchanged validated golden file. |
| S7 | [Geonorge 2019 Skråfoto catalogue][S7] | Official camera-position/direction semantics and explicit no-required-photo-Z statement. |
| S8 | [Gemini Terrain 21.0 import documentation][S8] | Vendor search-visible documentation: schema-driven GML and copying attachments/updating hyperlink paths. Direct reopen failed. General capability only, not exact photo/VA acceptance. |
| S9 | [Norsk Vann C23/2026 report][S9] | Official search/cache-visible revision/relationship discussion. Origin download returned 404; not treated as a pinned fully inspected source. |
| S10 | [W3C XML Schema dateTime][S10] | Normative lexical rules, not Gemini implementation limits. |
| S11 | [Geonorge coordinate-system guidance][S11] | Official horizontal zone guidance, not one mandatory zone for every package. |
| S12–14 | [GML base][S12], [geometry][S13], [feature][S14] schemas | Official generic dependencies; current files under `/3.2.1/` report version `3.2.2`. Pin resolved bytes for future validation. |

Downloads, XML summaries, PDF text/renders and test log are outside Git in `%TEMP%/photo-export-contract-audit/`. No linked example image was fetched. Temporary PyMuPDF was installed only there for visual review; repository dependencies/manifests were unchanged.

| Download | Bytes | SHA-256 |
| --- | ---: | --- |
| S1 | 121032 | `84ea31b1388338e442f2f4db03e3e7091d7df3935003df10c4851b8ca5716c5e` |
| S2 | 751100 | `7798e35194d102b5729dc7a7b0a2015111f9affea339576b9a9eb3cefb33cf70` |
| S3 | 753507 | `65e3b5f3650980fd45896b2f6d9fac415d52c0c5e4f66e22b85cfe6f33a537c7` |
| S4 | 4177256 | `1a7f97fb8df594f605f3518f82234aee3ff9a76dbe86c0678f5fcfa885102d6a` |
| S5 | 37224 | `15b347a255eddf1bd2bc5bc819c2a26e6fd649816edb09aca747b1d0bb5aa480` |
| S6 | 146532 | `6829f4ba9f8e35bdb99e04616419367b92ed2a2ffcd293ac631ebc99df942837` |

## 4. Current domain mapping

| Current data | Export-plan ownership | Mapping status |
| --- | --- | --- |
| Asset ID, original File/name/path | Asset; one attachment per selected original | DESIGN; never merge imports by filename. |
| Accepted capture time/photographer and provenance | Asset accepted values | APP; source evidence is not fallback truth. |
| Metadata/spatial evidence | Diagnostics/evidence references | APP; not automatically serialized. |
| Occurrence ID/asset ID/POINT context | Separate occurrence record | APP; preserve coincident and repeated placements. |
| Current position and basis | Accepted EPSG:4326 lon/lat with provenance | APP; no accepted camera Z. |
| Accepted direction | Occurrence bearing/provenance | APP; degree/cardinal behavior; affirm geographic north semantics. |
| GMI object/GUID/source ledger | Separate logical relationships | APP; not photo identity or camera location. |
| File/import/edit timestamps | Session audit facts | Never substitute for capture/survey time. |

`getPhoto()`/`getLayerPhotos()` project shared asset metadata; `getAssetFile()` supplies original bytes. A future plan must snapshot membership, accepted values and File handles, then guard async completion against stale/reset state. No domain change is proposed as an audit action.

## 5. Exact Terrain/Skråfoto input profile

**APP**, `terrainPhotoGml.mjs` and existing tests:

- DOMParser input, maximum 10 MiB; DOCTYPE/entities and XML errors rejected; maximum 20,000 photos.
- Root expanded name: `{http://www.opengis.net/gml/3.2}FeatureCollection`. Direct `gml:featureMember` children must each contain exactly one `app:Skråfoto` in the 20190101 namespace. At least one required; mixed feature members rejected. Prefix spelling is irrelevant.
- Exactly one `fotograferingspunkt/gml:Point/gml:pos` for viable geometry. No other geometry, featureMembers array or WFS container. Application child order is not validated.
- `fotolink` text is matching reference; `gml:name` is a label. No XLink image-path property.
- `fotograferingstidspunkt` becomes raw `photographedAtText`; input parser does not require it. Separate metadata normalizer can offer evidence, never acceptance.
- `retningsvektor/Retning/{retningsverdi,retningsenhet,retningsreferanse}` stays raw; no heading adoption.
- Retains root/feature/Point `gml:id`, nested `Identifikasjon/lokalId` and `navnerom`. Missing IDs are tolerated; no schema ID/cardinality validation.
- CRS syntax: EPSG shorthand, OGC URN, HTTP(S) OGC definition URI. Viable codes only **25832, 25833, 5972**.
- CRS lookup: pos, Point, geometry property, feature, root; otherwise one explicitly declared collection envelope supplies a recorded Terrain compatibility fallback. That sibling-envelope fallback is application logic, not ancestor inheritance. Pos/Point conflicts and ambiguous fallback envelopes are diagnosed.
- XY or XYZ finite numbers, consistent pos/Point dimension declarations; 5972 requires XYZ. Raw Z retained, only horizontal coordinates transformed. No accepted vertical coordinate.
- Matching uses NFC/separator normalization, collision-checked path/suffix/basename and case fallback. Unsafe/ambiguous targets excluded; explicit file URI decoding differs from literal local paths. Repeated GML references targeting one asset are ambiguous, unlike the GMI many-to-many ledger.

**Target classification: plausible legacy fallback.** S1 proves the vocabulary is real, but parser acceptance is weaker than XSD validity and proves no Gemini output acceptance. Generated tests reorder children or omit required legacy properties. S5 uses EPSG:5973, outside the parser's supported set. Successful or failed app re-import alone is not a standards-conformance oracle.

## 6. Proven schema fields and cardinality

**SCHEMA**, [S1], [S2], [S3]. All nested sequence order matters; “required within block” applies only when optional parent is emitted.

| Concept | Proven property/type | Required legacy / Asbuilt5.2 / Eksisterende5.2? | Cardinality | Source | Confidence |
| --- | --- | --- | --- | --- | --- |
| Photo type | `app:Skråfoto`, `SkråfotoType` | Selected feature | Per feature | S1–3 | High |
| Position | `fotograferingspunkt`, `gml:PointPropertyType` | Yes / Yes / Yes | 1 | S1–3 | High |
| File | `fotolink`, xs:string | Yes / Yes / Yes | 1 | S1–3 | High |
| Capture time | `fotograferingstidspunkt`, xs:dateTime | Yes / Yes / No | 1 / 1 / 0..1 | S1–3 | High |
| Direction | `retningsvektor` | Yes / No / No | 1 / 0..1 / 0..1 | S1–3 | High |
| Value | legacy `Retning/retningsverdi`; modern `Retningsvektor/retningsverdi`, double | Within block | 1 | S1–3 | High |
| Unit/reference | `retningsenhet`, `retningsreferanse`, code types | Within block | 1 each | S1–3 | High |
| Image info | `fotoinformasjon/Bildeinformasjon` | Optional all | 0..1 | S1–3 | High |
| Photographer | nested `fotograf`, string | Optional / required within block / required within block | 0..1 / 1 / 1 | S1–3 | High |
| Focal length/camera | nested `brennvidde` double, `kameratype` string | Same as photographer | Same | S1–3 | High |
| Application ID | legacy `Identifikasjon/{lokalId,navnerom}`; modern `Identifikasjon/guid` | Required | 1 each | S1–3 | High |
| Modern local ID/namespace | `Identifikasjon/{lokalId,navnerom}` | Modern optional | 0..1 each | S2–3 | High |
| Object relations | Supported parent's `foto`, modern GUID string | Optional | 0..* modern | S2–3 | High structure, unresolved GMI mapping |
| Other file relation | inherited modern `link_referanse`, string | Optional | 0..* | S2–3 | High |
| Z | Point tuple, no photo-specific XYZ XSD restriction | Legacy explicitly not required; modern profile/receiver unresolved | One tuple | S1/S7, S2–3 | Mixed |
| CRS | Not EPSG-constrained by photo property XSD | Product/receiver policy | Geometry CRS | S1–4 | High that XSD alone does not select |

Legacy Skråfoto directly extends `gml:AbstractFeatureType`. Modern extends `SOSI_ObjektType`. **Asbuilt additionally requires inherited** `datafangstdato`, `datasett_navn`, `identifikasjon`, `kvalitet`, `prosjektnavn`, `stedfestingsårsak`, `stedfestingsforhold`. Required quality children include `målemetode` and `målemetodeHøyde`; accuracy children are optional. In Eksisterende those common properties other than identification are optional. Do not select Eksisterende solely to evade AsBuilt requiredness. [S2], [S3]

**GMI instruction v3.2/2026 is not these XML schema versions.** Derived GMI field registries support S_HYPERLINK and DFOT, but no authoritative GML photo conversion. `Innmålt_av` is survey personnel, not photographer; GMI `Dato` is not proven capture time. Original 2026 PDFs are unavailable here, so their complete photo-delivery requirements remain HISTORY/UNKNOWN rather than newly proven documentation.

## 7. Identity and repeated placements

**SCHEMA:** a photo feature has one photographing point and one file link. Modern descriptions explicitly support one photo related to multiple utility objects through the **objects'** `foto` properties. This supports Model A for one actual camera observation plus many logical relationships; it does not introduce multiple camera points inside one Skråfoto. [S1], [S2], [S3]

| Model | Assessment |
| --- | --- |
| A: asset/camera feature with multiple relationships | Best semantic fit when relationships share one real capture location. Cannot automatically discard app occurrences. |
| B: occurrence features sharing attachment | Equal fotolink strings on several features are not prohibited by inspected XSD. But different object points are not proof of multiple camera locations for one image. Gemini behavior unverified. Conditional option only. |
| C: primary photo plus association records | Modern parent utility properties support relationships. No independent standalone arbitrary-GMI association feature was proven. Do not invent one. |

**DESIGN:** preserve assets, every occurrence and explicit relationships separately in the plan. One asset owns one attachment. Each occurrence retains accepted point/direction, identity and source context, even if coincident. LINE relationships add no guessed point. Defer occurrence→feature serialization until camera-versus-placement semantics and recipient behavior are agreed. No implicit collapse, averaging, first-wins or duplicated original bytes.

Filename is not identity. GMI object GUID is not photo GUID. Legacy `lokalId`/`navnerom` describes application identity; modern `guid` identifies the photo object. `gml:id` is XML document identity, distinct from application identity. Provider IDs and parser row numbers cannot be substituted for these identities without mapping.

Proposed deterministic identity policy: NCName-safe collection/feature/geometry IDs with distinct prefixes and full SHA-256 of a namespaced semantic key. Modern application GUIDs can be UUIDv5 from a fixed documented exporter namespace and that key, subject to recipient approval. Legacy needs its own approved ID namespace, not copied object identity. These algorithms are DESIGN, not prescribed by XSD. Session IDs support repeatability within unchanged session state, not cross-reload identity. Content digests verify bytes but must not merge separately imported originals. Generate unique output IDs even where generic GML presence is permissive; pin OGC dependencies before asserting exact schema validation.

## 8. Position, CRS, dimensionality and Z

**SCHEMA/DOC:** photographing point means where the image was taken. Legacy explicitly does not require photo Z. Generic Point supports a coordinate tuple without a photo-specific height sentinel or EPSG restriction. Modern product documentation lists EUREF89 UTM zones 32/33/35 with NN2000, but does not settle receiver-approved photo-only XY handling. [S1], [S2], [S7]; [S4 section 6, p.188][S4]

**APP:** current positions contain only WGS84 lon/lat. Existing proj4 definitions cover horizontal 25832/25833 and a 5972→25832 horizontal approximation. There is no accepted camera altitude, epoch-aware transformation or NN2000 conversion. Raw EXIF altitude, GML Z and GMI infrastructure Z are evidence, not accepted camera height.

**DESIGN:** select delivery horizontal CRS explicitly. For an approved 2D profile, strictly transform `[longitude, latitude]` from EPSG:4326 to selected ETRS89 UTM zone and emit **easting northing**, with the same CRS on each Point. Zone 35 needs additional reviewed support. Never use Leaflet EPSG:3857 or survey projection fallback on error. Reject nonfinite/unsupported/out-of-area results and disclose the current map approximation's accuracy limits. Zone choice is not inferred from map display. [S11]

Legacy XY can use EPSG:25832/25833 with dimension 2. Never label two ordinates EPSG:5972. XYZ requires actual accepted camera height, known vertical datum and the matching compound CRS. No zero/-9999/copied object Z/terrain-derived height is authorized. Historical zero-Z output is not a sentinel rule. Modern AsBuilt XY remains UNKNOWN pending recipient/photo exception confirmation; if XYZ is required, the domain currently blocks it.

Numeric proposal: projected metres to three fractional decimals, one pinned rounding step after projection, negative zero normalized, envelope recomputed from serialized coordinates. This is DESIGN for diffability, not an official precision or millimetre-accuracy claim. Agree target zone, operation and precision with recipient.

## 9. Direction

**SCHEMA:** legacy block is `retningsvektor/Retning` with value→unit→reference order; modern is `retningsvektor/Retningsvektor`, unit→reference→value. Unit `1` is clockwise degrees/360, `2` clockwise gon/400, `3` clockwise radians. Reference `1` is true/geographic north, `2` magnetic, `3` local. Value is double without an inspected 0–359 facet. Legacy block required; modern optional, with all nested components required when present. [S1], [S2], [S3]

Direct attribute inspection confirmed true-north code **`1`**. “(default)” is documentation, not part of its XSD value; visually checked product table p.171 agrees. No code-list conflict was found.

**Conditional DESIGN mapping:** affirm the app's clockwise geographic-bearing contract, then emit accepted degrees with unit1/reference1. UI cardinal geometry supports this interpretation but accepted direction has no explicit reference/unit fields. Never silently reinterpret it as projected-grid/magnetic bearing. North 0 is a known value; unknown remains omitted in modern, and blocks a schema-complete legacy feature. Converting magnetic/local/grid directions needs a separate reviewed method and inputs. Source-direction adoption remains deferred.

## 10. Capture date/time

All inspected photo time fields are `xs:dateTime`, not date. Timezone-free dateTime and fractional seconds are supported by the datatype; lexical seconds are required. Date-only/minute-only are not dateTime forms. [S10]

| Accepted value | Proposed representation | Eligibility |
| --- | --- | --- |
| Seconds/fraction, known offset | Preserve ISO value and supplied Z/offset | Datatype-supported; importer precision handling unverified. |
| Seconds/fraction, unknown timezone | Preserve local time with no suffix | Datatype-supported; never fabricate UTC. |
| Date only | No midnight invention | Block required-time profiles; omit with warning only in appropriate optional-time profile. |
| Minute precision | No invented :00 seconds | Same policy; preserve original precision in plan. |
| Unknown | Omit only if optional | Block legacy/Asbuilt; Eksisterende can omit with warning. |

Provenance remains in the plan; no dedicated target property for app acceptance provenance was established. File modification/import/position acceptance timestamps are not substitutes. Unaccepted source evidence is never serialized as accepted capture time. Recipient must confirm offsets, timezone-free values and fraction limits.

## 11. Photographer

**SCHEMA:** explicit text property is `fotoinformasjon/Bildeinformasjon/fotograf`, without code list. Legacy permits photographer alone in an optional block. Modern optional block requires **brennvidde, fotograf, kameratype**, in that order. [S1], [S2], [S3]

Legacy can include accepted name and omit unknown. Modern must obtain real required siblings or omit the entire optional block with an explicit photographer-loss warning. Current domain has no accepted focal length/camera type. Do not invent zero focal length/empty metadata to satisfy syntax or repurpose generic information as a documented photographer mapping. Retain the accepted name/provenance in the plan. Unknown photographer does not itself block a photo when the entire optional info block is omitted.

## 12. Attachment reference and deterministic naming

**SCHEMA:** fotolink is element-text string, not XLink or S_HYPERLINK wrapper. XSD does not prescribe basename/folder, URI encoding, separator, filename uniqueness, extension or case. Parent `foto` and `link_referanse` serve different purposes. [S1], [S2], [S3]

**SAMPLE/HISTORY:** S5 uses an HTTP image URL; S6 a placeholder string. Neither establishes package layout. Historical Terrain output used sibling Attachments and Windows backslash paths with spaces/Norwegian characters. This proves producer behavior, not a general delivery rule or successful recipient import.

**Conditional DESIGN:** one flat `Attachments/<exportName>` relative reference, forward slash, XML-escaped literal text. No absolute/drive/traversal paths, remote fetching or browser URLs. Basename-only and subdirectories are not schema requirements. Do not percent-encode a string as URI without evidence the importer decodes it. Sanitize URI-sensitive names instead, with visible rename mapping.

Naming policy proposed for a future plan:

1. One entry per asset identity; every occurrence/feature of it uses that entry. Byte-preserve original File; do not mutate session filename or transcode.
2. Start from original basename; NFC-normalize output name, preserve safe Unicode/spaces/spelling and original extension/case. Separate extension before suffix/truncation; changing extension must not imply conversion.
3. Replace separators, controls, Windows-invalid `< > : " / \\ | ? *` and conservatively `% #` with `_`. Remove leading/trailing spaces/dots; avoid empty stems, dot traversal and Windows device basenames. Fallback stem `photo`. Record renames.
4. Detect all names after NFC and a pinned locale-independent case-fold. Test case-only and NFC/NFD collisions. No filesystem/asynchronous ordering determines a winner.
5. Limit full filename to a proposed 180 UTF-8 bytes, truncating stem at code-point boundaries and reserving extension/suffix space. This is an application choice, not Gemini evidence. Unsafe/overlong extensions require explicit error or approved mapping.
6. Every member of a collision group gets `--<asset-key-hash-prefix>` before extension. Begin at 12 hex digits, extend deterministically, then recheck globally against natural names and normalized/case collisions. Full digest collision means error, not first-wins.

Two invented IMG_0001.jpg assets get different stable suffixes; two placements of either reuse its exact exported name. Content checksum is separate from asset-key hash. Capture metadata, occurrence count and current clock do not affect names. JPEG/PNG are sensible initial candidates, but recipient container/length support needs confirmation; app recognition does not prove Gemini support for WebP/HEIC/TIFF.

## 13. VA/GMI associations and relation to loaded survey

Modern repeatable parent `foto` GUID-string fields exist on Borehull, Grøft, Kanal, Kulvert, Trase, Trasenode, Trekkerør, Tunnel, VA_Avløpsledning, VA_Kum, VA_Nettstasjon, VA_Overvannsledning and VA_Vannledning. They point to **photo identifikasjon.guid**. Modern inherited link_referanse is a separate file-reference list. Legacy NettverkskomponentType/foto is singular optional photo-property association with GML association attributes. [S1], [S2], [S3]

The app's many-to-many GMI ledger does not establish conversion to these parent feature types or a recipient database update identity. No approved standalone reverse photo→arbitrary GMI GUID field or independent association-record type was found. Modern multi-object support is in the parent utility dataset, not invented photo properties.

First scope should retain relationships in plan/preview and disclose that standalone photo delivery does not serialize them until an approved parent workflow exists. Do not claim relationship preservation from keeping only camera/file references. Distinguish object-derived placement, logical relationship and file path.

Of choices A–D, **separate photo GML plus attachments imported alongside survey (C/A)** is the smallest proposed workflow, still unproven for intended Gemini VA version. **B: modify original GMI** is unnecessary for that proposal and requires a separate reviewed writer/update contract. Do not create DFOT objects or rewrite S_HYPERLINK automatically. Detached source does not remove owned Files/accepted metadata, but prevents claims of a live survey update.

## 14. Packaging and encoding

**DOC:** AsBuilt delivery is XML/GML3.2.1, Norwegian, UTF-8; delivery medium unspecified. No mandated ZIP, Attachments folder or manifest was established. [S4 section 11, p.193][S4]

**DESIGN pending confirmation:** extracted directory with `photos.gml` and `Attachments/`. Later ZIP is transport convenience preserving relative layout, not schema requirement. No mandatory manifest was proven; preserve mapping/diagnostics in preview, adding a documented sidecar only for an agreed need. GML without referenced image bytes is not a complete application delivery. No package was generated here.

Recommend XML1.0 UTF-8 declaration, no BOM, LF, deterministic indentation and a real XML serializer. No-BOM is DESIGN: both official examples have UTF-8 BOM. Preserve Norwegian/Unicode text, escape text/attributes exactly once, reject XML-illegal controls, and keep normalized output filename/reference identical. Do not reuse GMI Latin-1 policy. Attachment bytes remain unchanged.

## 15. Exact namespaces and collection structure

All inspected photo schemas use GML namespace `http://www.opengis.net/gml/3.2`; xsi is `http://www.w3.org/2001/XMLSchema-instance`. Prefix spelling is arbitrary; fixed app/gml/xsi aliases are a deterministic DESIGN choice.

| Profile | Feature namespace | Container/schemaLocation |
| --- | --- | --- |
| Legacy2019 | `http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101` | S5 observes gml:FeatureCollection/featureMember. Namespace paired with S1 XSD URL; HTTPS retrieval does not change literal http namespace. |
| Asbuilt5.2 | `https://skjema.geonorge.no/SOSI/produktspesifikasjon/Norskvann-Asbuilt/5.2` | Feature substitution supports collection membership; proposed FeatureCollection/featureMember needs full validation/recipient test. schemaLocation pairs namespace with S2 URL. |
| Eksisterende5.2 | `https://skjema.geonorge.no/SOSI/produktspesifikasjon/Norskvann-Eksisterende/5.2` | Production pair uses S3 URL. S6 test-host namespace mismatch is not an interchangeable alias. |
| Gemini WFS input | `http://www.powel.com/gemini` | Different response interface, not photo delivery. |

S2 URL is `https://skjema.geonorge.no/SOSI/produktspesifikasjon/Norskvann-Asbuilt/5.2/Asbuilt.xsd`; S3 substitutes `Norskvann-Eksisterende/5.2/Eksisterende.xsd`. Legacy exact S1 link is in references below. No fetched/committed Asbuilt example proves the chosen standalone container. Declare XLink only where a supported association uses it. Namespace and schemaLocation must come from selected profile, not parser-derived guesses.

## 16. Minimal supported feature proposal

Pseudo-structure only; **R required, O optional, U unresolved**, not a generated/validated delivery:

```text
Modern Asbuilt app:Skråfoto
  @gml:id [DESIGN unique XML-safe ID]
  inherited SOSI_Objekt sequence [R properties listed in section 6]
    identifikasjon/Identifikasjon/guid [R photo identity]
  fotograferingspunkt/gml:Point/gml:pos [R camera point; CRS/dimension U]
  fotograferingstidspunkt [R accepted full xs:dateTime]
  fotoinformasjon/Bildeinformasjon [O; if present R sequence:]
    brennvidde, fotograf, kameratype
  fotolink [R attachment-reference string]
  retningsvektor/Retningsvektor [O; if present R sequence:]
    retningsenhet, retningsreferanse, retningsverdi
```

Legacy exact application-child order: R photographing point, R fotolink, R retningsvektor/Retning, R identifikasjon/Identifikasjon, R capture time, O photo info. Legacy optional image-info order: kameratype, brennvidde, fotograf. Photographer-only is possible. Generic optional GML name/description properties precede application children. [S1], [S2]

No full “valid export GML” is asserted while profile, mandatory real metadata and feature mapping remain unresolved. Future illustrative examples must use invented identifiers/coordinates/filenames only.

## 17. Export eligibility proposal

These are DESIGN gates informed by schema, separate from object Validator results. “Allowed” assumes all other profile conditions pass.

| Situation | Classification | Reason |
| --- | --- | --- |
| Missing/invalid accepted horizontal point | Blocked | No unaccepted candidate/placeholder fallback. |
| Original File unavailable | Blocked complete package | Thumbnail/path is not original bytes. |
| Direction unknown | Modern allowed with warning; legacy blocked | Never replace unknown with north. |
| Capture unknown/date-only/minute-only | Asbuilt/legacy blocked; appropriate Eksisterende omission warning | Required dateTime versus optional property. |
| Photographer unknown | Allowed with warning | Entire optional image-info block may be omitted. |
| Photographer known, missing camera/focal data | Modern permitted only with explicit photographer-loss warning; legacy can include | Nested modern required siblings. |
| No camera height | Legacy XY allowed; modern depends on confirmed rule | No invented sentinel. |
| Repeat with identical camera facts | Mapping decision required | Preserve every plan occurrence, no silent collapse. |
| Same image at differing object-derived points | Block automatic camera-feature serialization | Different object locations are not proven camera observations. |
| Detached GMI source | Independent photo export allowed with warning | No claimed live survey update. |
| Unreferenced ordinary image | Allowed if otherwise complete | No mandatory parent on Skråfoto proven. |
| Manual accepted point | Allowed only when confirmed as camera location | Source kind does not establish semantics/accuracy. |
| EXIF accepted point | Allowed, provenance/accuracy warning as relevant | Explicit camera evidence, no survey-accuracy guarantee. |
| GML accepted point | Allowed after profile/CRS checks | Source camera intent is not output compatibility. |
| GMI-derived accepted point | Depends on semantics; block if only object point is known | No automatic object→camera inference. |
| LINE relation | Plan association only | No inferred midpoint/heading. |
| Missing inherited Asbuilt metadata | Blocked | No fabricated date, quality, project/dataset or survey context. |
| Unsupported container/extension mismatch | Depends on confirmed recipient; otherwise blocked | No silent renaming/transcoding. |

Choose scope explicitly. Layer visibility, map bounds and incidental table filters must not silently select exports. Show unique assets, occurrences, resolved features and attachments separately, including exclusions and omitted fields. A successful object validation is not certification of a photo delivery.

## 18. Export preview / plan model

Serialization-independent conceptual proposal, not domain implementation:

```text
ExportPlan
  version, sourceSessionRevision, explicitScope, profileRevision/hash
  coordinatePolicy, numericPolicy, namingPolicyVersion, identityPolicyVersion
  assets[]
    assetKey, originalFilename/relativePath, private original File handle
    accepted captureTime/photographer + provenance
    byteLength, container/MIME checks, contentDigest
  occurrences[]
    occurrenceKey, assetKey, layerKey
    accepted geographic point + provenance
    accepted bearing + provenance; camera-semantic confirmation/unknown state
    source POINT context; proposed featureKey or unresolved mapping
  associations[]
    assetKey, relevant occurrenceKeys, source fingerprint/revision
    source objectKey/GUID/geometry scope, live/detached status
    proposed supported relation or explicit not-serialized reason
  features[]
    semantic featureKey, source occurrenceKeys, output ID/GUID
    accepted camera facts, projected point/CRS/dimension
    profile eligibility, serializable fields, explicit omissions
  attachments[]
    assetKey, exportName, relativePackagePath, digest/byteLength
    rename reason, referencing featureKeys
  warnings[], errors[], exclusions[]
    stable code, asset/occurrence/feature key, field, reason, remediation
  counts, inputFingerprint, outputFingerprint when bytes exist
```

Keep all original occurrences/relationships even when features cannot be resolved. The feature list records mapping decisions, not destructive grouping. Localized UI messages and XML names do not belong in this plan. Freeze/review/validate first, serialize selected profile second, package last. Provenance remains in the plan unless a documented output property supports it. Invalidate obsolete plans rather than mixing edits made during async work.

## 19. Determinism

DESIGN: sort assets/attachments by fixed code-point asset key, occurrences by layer/occurrence key and features by semantic feature key. Pin tie-breakers, not localeCompare/platform enumeration/job order. Derive names/IDs from stable keys and versioned policies, never export-time random UUIDs/Date.now. Repeatability is for unchanged session state, not reload restoration.

Use exact profile sequence, fixed prefixes/attribute order, UTF-8/no-BOM/LF/two-space indent/final newline. Use pinned projection/rounding/negative-zero rules; direction is integer in selected degrees convention. Preserve capture fractions and offset. Unchanged state yields identical names/IDs/order/XML bytes. Future byte-identical ZIP additionally requires fixed entry order/timestamps/permissions/Unicode flags/compressor version; no ZIP work is done here.

## 20. Validation strategy and exact future acceptance criteria

Existing tests can verify accepted-versus-evidence, calendar/offset preservation, horizontal transforms, GMI occurrences and resource ownership. They cannot prove output conformance.

1. **Lock profile:** document recipient product/version/import command, namespace/XSD revision/status, required values, CRS/dimension, path syntax and image formats. Resolve section 24 before declaring serialization approved.
2. **Prove repeated semantics:** one asset/two POINT contexts/LINE relation remains complete in the plan. Either an approved feature/relationship mapping preserves it, or preview blocks with exact reason. No implicit merge/omission.
3. **Eligibility:** missing required File/position/full time/common properties blocks relevant output. Unaccepted evidence cannot fill values. Unknown heading is not zero; date/minute precision cannot gain invented components.
4. **Attachments:** deterministic naming tests cover duplicate/case/NFC/NFD, reserved/device names, controls/traversal, Unicode, length limits, hash-suffix versus natural-name collisions. Every link resolves to exactly one packaged original; one byte-identical copy per asset, no dangling/orphan references.
5. **Coordinates:** independent synthetic control points verify forward projection, axis order, Point CRS/dimension, rounding/envelope, unsupported zones and failure. Confirm XY exception or require real accepted camera Z in known datum. Map helpers' permissive survey fallbacks are forbidden.
6. **Schema validation:** well-formed XML, expanded names, exact sequence/cardinality, unique IDs, datatype lexical form and illegal-character tests. Pin the full selected application-XSD dependency graph (GML, XLink, ShapeChange) with hashes and offline catalogue/resolver. Use an actual reviewed XSD1.0 engine, e.g. pinned libxml2/xmllint. Fail unresolved imports. Do not silently patch official schemas or disable validation.
7. **Negative schema cases:** legacy missing direction/time; reordered properties; photographer-only modern block; absent inherited Asbuilt fields; wrong namespace; malformed dateTime; duplicate IDs. Add semantic checks beyond XSD for coordinate dimension/reference integrity and truthful metadata.
8. **App round-trip:** supported subset can be re-imported as a regression check. Current modern profiles are unsupported and repeated-file GML becomes ambiguous; do not weaken this policy or use app round-trip instead of XSD validation without explicit follow-up scope.
9. **Gemini acceptance:** synthetic complete delivery in exact intended VA/Terrain version. Verify feature/attachment counts, N/E/S/W bearings, camera coordinates, unknown omissions, offsets/fractions, Unicode/spaces, shared attachment and collision renames. Record version/import settings/results. Relationship import needs its own test if included.
10. **Isolation/resources:** original checksums unchanged, no survey/GMI mutation or WFS requests, snapshot staleness/reset safety and browser URL/memory cleanup. Run implementation-appropriate UI/regression checks then.

**No full instance XSD validation occurred in this audit.** XSDs/examples were parsed as XML and declarations inspected, which is not generated-output validation. No delivery was generated. S6 namespace mismatch and mutable OGC dependencies must be resolved before a meaningful “schema valid” claim.

## 21. Gemini compatibility evidence

| Claim | Classification | Evidence / limit |
| --- | --- | --- |
| App reads legacy Terrain structure | Verified existing synthetic browser/parser behavior | Not desktop import. |
| Terrain produced Attachments/backslashes/Unicode/local time | Reported historically | Spatial reports; no fresh corpus read or recipient round trip. |
| Terrain supports schema-driven GML and attachment copying/path updates | Vendor-documented general capability | S8 search-visible documentation; direct reopen failed. |
| App-produced legacy photo file imports into Gemini VA | Unknown | No exporter or recorded exact round trip. |
| Modern photo-only5.2 file imports alongside GMI | Unknown | Schema vocabulary is not receiver acceptance. |
| Shared file on multiple photo features retains distinct Gemini placements | Unknown | No documentation/test proving this case. |
| Separate photo file updates existing GMI object relations | Unknown | No approved cross-format GUID/type update mapping. |
| WFS acceptance proves photo delivery support | Unsupported inference | Different interface, feature types and direction of data flow. |

## 22. Legacy fallback and domain gaps

Fallback recommendation: **later**, if an identified recipient requires it. Legacy has a real schema, explicit no-photo-Z requirement and simpler photographer representation, making it a plausible constrained option. Still requires known direction/full time/camera semantics and actual recipient acceptance. Do not build two serializers to avoid selecting a contract. Prefer modern Asbuilt for that delivery purpose once its required real information is available; never mislabel as Eksisterende to evade requirements.

| Gap | Classification | Consequence |
| --- | --- | --- |
| Camera observation vs object-derived placements, especially conflicting repeats | Blocker for automatic full mapping | Must resolve semantics; do not collapse or mislabel camera point. |
| Asbuilt survey/date/dataset/project/quality/cause/conditions | Blocker for modern Asbuilt | Current photo data cannot truthfully fill required properties. |
| Agreed receiver/profile/CRS/path rules | Blocker | XSD availability is not an operational contract. |
| Unknown/date/minute capture precision | Per-feature blocker for required-time profiles | Real accepted precision needed; no invented midnight/seconds. |
| Accepted camera Z/datum | Conditional blocker | Only if agreed output requires XYZ. |
| Accepted focal length/camera type | Optional improvement; conditional photographer blocker | Modern block omission legal, but photographer cannot be losslessly included alone. |
| Explicit north-reference contract | Clarification, potentially blocker | UI implies geographic clockwise but domain lacks explicit reference property. |
| Export IDs/naming map | Exporter responsibility | Derive in plan; no original-file rename needed. |
| GMI→GML parent identity/type mapping | Blocker only for association serialization | Defer and disclose unsupported relationships. |
| Modern/repeated-file app re-import | Optional regression improvement | App cannot be sole output oracle. |
| Selection/preview/download controls | UI-only future work | Session already supplies accepted values/File handles. |

## 23. Minimal first implementation recommendation

First approve **one recipient/profile contract**, camera-placement mapping and sources for required information. Then implement deterministic plan/eligibility preview followed by one serializer/package path. Include only explicitly selected, accepted camera-observation features satisfying that profile, supported accepted metadata and one original attachment per asset. Preserve all source occurrences/associations in preview; block unresolved repeats instead of silent loss.

Modern Asbuilt needs truthful delivery context and required survey/quality values; direction may be omitted. Photographer omission must be explicit until complete image info is available. A separately approved legacy-only scope can use XY, photographer alone, and required known direction/full dateTime. These are conditional scopes, not permission to choose a convenient schema based on missing values.

Defer GMI rewriting, arbitrary association records, full utility conversion/updates, camera-location inference, invented/terrain-sampled height, source heading adoption, image transcoding, multiple dialects, persistence, unnecessary manifests/ZIP features, broad UI cleanup, WFS association, 3D, topology and Validator duplicate-reference rules.

## 24. Confidence matrix and confirmation questions

| Topic | Proposed contract | Evidence | Confidence | External confirmation needed? |
| --- | --- | --- | --- | --- |
| Feature | Skråfoto camera observation | S1–3 | High vocabulary; unresolved occurrence mapping | Yes |
| Namespace | Exact selected legacy/modern URI | S1–3 | High | Recipient version |
| Geometry | One actual camera Point | S1–3/S7 | High | Object-placement interpretation |
| CRS | Explicit ETRS89 UTM zone, strict projection | S4/S11, app | Medium | Zone/datum accuracy/XY |
| Z | Never fabricate; legacy XY possible | S1/S7 | High legacy; modern unresolved | Yes modern |
| Direction | Clockwise degrees unit1/ref1 if affirmed | S1–3/app | High codes; medium domain contract | Yes |
| Capture | Full dateTime, preserve offset/local form | S1–3/S10 | High datatype | Importer precision/zone behavior |
| Photographer | Explicit text, modern sibling constraints | S1–3 | High | Complete info or approved omission |
| File reference | fotolink string, proposed package-relative path | S1–3/HISTORY | High field, low path convention | Yes |
| Repeats | Preserve plan inventory, unresolved serialization | App/S2–3 | High that collapse is unsafe | Yes |
| Object association | Parent foto GUID→photo GUID | S2–3 | High schema, low cross-format mapping | Yes |
| Packaging | Proposed photos.gml + Attachments, later optional ZIP | S4/HISTORY/DESIGN | Design only | Yes |
| Gemini | No exact round-trip claim | S8/reports | Low for proposed output | Yes |
| Determinism | Versioned frozen-plan IDs/names/order | DESIGN | High feasibility | Product policy, no schema mandate |

Exact questions to resolve before exporter signoff:

1. Which Gemini product/version/import command and installed schema is the target? Is production-hosted5.2 agreed despite proposal wording in its PDF?
2. Is standalone photo GML alongside GMI supported: modern Asbuilt, legacy20190101 or another documented profile?
3. How should one file at several GMI object points be represented when points are not camera positions? Does Gemini retain distinct shared-file features, and with what semantics?
4. Are all inherited Asbuilt fields required for photo-only data, and what truthful quality/cause/conditions/date values apply to EXIF/manual positions? Any official photo-specific profile/exemption?
5. Is modern photo XY allowed with a 2D CRS? Which zone/axis/precision? If XYZ, which real camera-height source/datum is needed? Is any sentinel officially allowed? None is established here.
6. Confirm true-north clockwise direction and unknown handling. Confirm local/offset/fractional dateTime behavior and handling of date/minute-only information without fabricated components.
7. Can photographer be imported independently of modern required focal length/camera type through an official mapping, or must info remain omitted until complete?
8. Exact relative fotolink convention: basename/folder/slashes/URI decoding/spaces/Unicode/case/subdirectories/filename lengths and supported image containers?
9. Must parent GML objects carry foto GUIDs, or is a supported separate-photo update to existing GMI/VA objects available? Which IDs/types map across formats?
10. Is ZIP merely transport? Are delivery names, manifests or installed/offline schema catalogues required? What acceptance record proves success?

No vendor/maintainer messages were sent.

## 25. Audit checks and documentation boundary

Existing tests, unchanged:

```powershell
node --test --test-concurrency=1 tests/photoCaptureMetadata.test.mjs tests/photoDirection.test.mjs tests/photoReferenceMatching.test.mjs tests/photoSpatialProjection.test.mjs tests/gmiPhotoPlacements.test.mjs tests/terrainPhotoGml.test.mjs
```

**75 tests: 75 pass, 0 fail, 0 skip, 0 cancelled, 0 todo**, six files. Terrain reports seven internal synthetic browser checks within its one Node test. No private corpus, live Gemini service, full production-app run/build/regression needed for this documentation audit. Passes prove existing app behavior, not output compatibility.

ElementTree inspected public XSD/example structure, sequences/base types/cardinality. Product PDF text was extracted with pdftotext; relevant pages 11,105,141,170–171,188,193 rendered and key tables visually checked. Report's S9 origin404/direct-documentation limitations are disclosed. No repository dependency installation. Final diff/whitespace check passed, and code/test/HEAD remained unchanged. Only this report and the authorized audit continuation changed. No agents, implementation, package generation, commit or push.

[S1]: https://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101/LedningsnettEtablertEllerFlyttet.xsd
[S2]: https://skjema.geonorge.no/SOSI/produktspesifikasjon/Norskvann-Asbuilt/5.2/Asbuilt.xsd
[S3]: https://skjema.geonorge.no/SOSI/produktspesifikasjon/Norskvann-Eksisterende/5.2/Eksisterende.xsd
[S4]: https://dokument.geonorge.no/produktspesifikasjoner/norsk-vann-ledningsdata-asbuilt/5.2/produktspesifikasjon-norsk-vann-ledningsdata-asbuilt-v5-2.pdf
[S5]: https://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101/eksempel/EksempelData_LedningsnettEtablertEllerFlyttet_v20190101.gml
[S6]: https://skjema.test.geonorge.no/SOSI/produktspesifikasjon/Norskvann-Eksisterende/5.2/GML_eksempel_Eksisterende_Dataleveranse1.gml
[S7]: https://objektkatalog.geonorge.no/Pakke/Index/EAPK_9BED43A3_5BEC_44c9_9F73_BEDA2D7E8353
[S8]: https://docs.geminisuite.com/21.0.x/sv/dlg/contents/CO_4_12_324/
[S9]: https://norskvann.no/wp-content/uploads/2026/04/RapportC23_2026_Dataflyt_ved_etablering_av_ledningsanlegg.pdf
[S10]: https://www.w3.org/TR/xmlschema-2/#dateTime
[S11]: https://www.geonorge.no/aktuelt/om-geonorge/slik-bruker-du-geonorge/kartprojeksjoner-og-koordinatsystemer/
[S12]: https://schemas.opengis.net/gml/3.2.1/gmlBase.xsd
[S13]: https://schemas.opengis.net/gml/3.2.1/geometryBasic0d1d.xsd
[S14]: https://schemas.opengis.net/gml/3.2.1/feature.xsd

## 26. Decision: NOT READY

Real official photo schemas define the vocabulary, direction semantics and photographer field. They do not establish a safe complete mapping of the application's multiple object-derived placements, supply missing mandatory modern context, or prove receiver compatibility. These are semantic/interoperability blockers, not XML formatting details.

Resolve section24 with the recipient/schema authority, record one approved contract and eligibility/mapping decision, then implement the scoped plan/serializer under section20's acceptance criteria. Writing the complete exporter now would require guessing or silent information loss. Stop here; no exporter or domain changes were made.
