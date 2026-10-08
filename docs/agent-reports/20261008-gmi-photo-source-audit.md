# Real GMI photo-source audit and implementation plan

Date: 2026-10-08. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`. Baseline: `b130780 Add photo direction editing`.

This is an audit and design milestone. No production parser, validation, positioning, hyperlink-copy UI, or other production behavior was changed. No commit, push, fixture modification, fixture copy into the repository, or agent delegation was performed. The pre-existing modification to `data/usage/aggregates.json` was left alone.

## 1. Findings and evidence limits

The exact supplied GMI contains **726 objects: 470 points and 256 lines**. **53 objects reference 52 distinct JPEG filenames**. All 53 are ordinary `S_FCODE=KUM` objects with empty `Type`. All objects have distinct, valid source GUIDs. One JPEG is referenced by two different source objects.

**There are no DFOT objects in this file.** `DFOT` does not occur anywhere in its decoded source text. The current shared extractor succeeds on **every one of the 53 non-empty S_HYPERLINK values**. This fixture does not reproduce the reported copy-action incompatibility. That user-observed problem remains an investigation requirement; it has not been classified as intended behavior or dismissed.

The repository's earlier correction report records a browser failure on newline-separated `sign` metadata and a subsequent shared-extractor correction. The recorded formerly failing value succeeds on this baseline. This explains a documented historical gap; any remaining failure still needs its exact input captured.

The requested older/root `Attachments` directory is **absent** in this environment. Its actual file inventory, missing-file counts, duplicate-name counts, and orphan-file counts cannot be measured. The newer folder is available and contains 148 JPEGs; none overlaps the 52 GMI reference names, even after case/NFC normalization.

Consequently, this fixture validates ordinary GMI associations and source identity, but **does not validate a DFOT position adapter or reveal a failing hyperlink grammar**. Implementing those capabilities needs additional real evidence before claiming coverage. No DFOT coordinate accuracy, authority, or camera-location semantics are inferred from the absence of DFOT objects.

The architectural recommendation is **one GMI source**, retaining source-level object evidence and a many-to-many association ledger, with position candidates produced only by a separately verified eligibility rule. Ordinary KUM hyperlinks contribute associations only.

## 2. Fixture inventory

All paths below were read without modification:

| Fixture | State / inventory |
| --- | --- |
| `C:\Temp\gmi-photo-test\Ekenesstokken\VA_SOMBYGGET_07112025_BRUK DENNE.gmi` | Present; 234,053 bytes |
| `C:\Temp\gmi-photo-test\Ekenesstokken\Attachments` | Directory absent |
| `C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\Attachments` | Present; 148 files; 190,303,135 bytes; all `.jpg` |
| `C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml` | Present; 177,686 bytes; 148 Skråfoto entries |

GMI SHA-256: `69f90ecebcd1d27f84acc3511dd79b409fec4951139855dc2bdc99888754ffe2`.

The whole fixture tree contains 150 files: the GMI, the newer GML, and 148 newer JPEGs. SHA-256 was computed for every present fixture file before analysis and checked afterwards, together with the recursive file list. All remained identical. No other attachment set was silently substituted.

Header evidence:

```text
_VERSION 2
_FILETYPE TER
COSYS EUR89 32
COSYS_EPSG 25832
COSYSVER NN2000
COSYSVER_EPSG 5941
```

Sections are `[GMIFILE_ASCII]`, `[L_]`, `[P_]`, `[+L_]`, `[+P_]`, and `[END]`, each occurring once. Every raw `:L` and `:P` record was reconciled with an existing-parser object. There are no unaccounted object sections in this fixture.

## 3. Existing parser and domain architecture

### GMI decoding and object representation

[`gmiDecoding.js`](../../src/lib/parsing/gmiDecoding.js) uses `TextDecoder('iso-8859-1')`, exactly as the upload path in [`FileUpload.js`](../../src/components/FileUpload.js) does. The audit called that decoder and [`GMIParser`](../../src/lib/parsing/gmiParser.js), rather than constructing a replacement GMI parser. `GMIParser.fromBuffer` defaults to Node `latin1`; the browser decoder is the canonical audit path.

The parser retains two collections, `points` and `linesParsed`; `toObject()` exposes `points` and `lines`. An object has:

```js
{ id, type: 'point' | 'line', extent, attributes, guid, coordinates: [{ x, y, z }] }
```

`id` is the numeric source `:P` / `:L` identifier. `type` here is geometry scope, distinct from the domain attribute `attributes.Type`. GUID is parsed from a separate `GUID ...` line into top-level `guid`; it is not an attribute or a photo ID. `/XYZ` coordinates remain source-coordinate objects without automatic geographic conversion.

`_FIELDVALUES` is split on semicolons and bound to the corresponding geometry-local `_FIELDNAMES`. Delivered attribute values are trimmed, empty values become `null`, and numeric/boolean lexemes are coerced. The private, non-enumerable [`GMI_SOURCE_LEXEMES`](../../src/lib/parsing/gmiLexicalEvidence.js) symbol preserves original field lexemes. It is lost by ordinary JSON serialization and by the photo-domain `immutable()` function, which enumerates string keys. A future adapter must explicitly copy required raw evidence before passing it through either boundary.

In this fixture each non-empty hyperlink source lexeme has one trailing ASCII space. The public attribute loses that space; the audit retained it. All source fields, GUIDs, and all coordinates were compared to raw record blocks, not just sample records. There were zero parser warnings or errors and no audit-relevant truncation. Both field definitions end in `;`, producing an empty-name attribute slot; it is unrelated to identity and must not become a photo-reference field.

The parser's semicolon field splitting is an architectural limitation for future evidence containing semicolons inside hyperlink member text: the later extractor cannot recover text already split across fields. No such value exists here; do not change parser semantics based on a hypothetical fixture.

### Field terminology

There is no literal `TEMA` or `TYPE` field in this file. The delivered field names are **`S_FCODE`** and **`Type`**. The existing validation-v2 schema binding / [`temaIdentity.js`](../../src/lib/validation-v2/temaIdentity.js) supports canonical Tema resolution from bound Tema/S_FCODE evidence. The data table and map currently use `attributes.S_FCODE` and `attributes.Type`. Report TEMA distributions below mean the delivered S_FCODE values; TYPE distributions mean the delivered Type values. The line definition contains `Nett_type`, but no `Type`; do not substitute network type for object TYPE.

### Existing shared hyperlink extraction

[`hyperlinkFilenames.mjs`](../../src/lib/hyperlinkFilenames.mjs) owns both `extractHyperlinkSourceParts(value)` and `extractHyperlinkFilenames(value)`. The data table imports the latter; [`featurePopupContent.mjs`](../../src/lib/map/featurePopupContent.mjs) imports the former. Both share wrapper validation, basename extraction, source order, and exact-filename deduplication. GMI parsing itself does not extract filenames.

The wrapper branch validates the entire value using `h:<digits>(<named quoted members>)`, allowing metadata members, whitespace/newlines, and optional comma/semicolon member or wrapper separators. Only `link` members become filename references; `sign` is metadata. Invalid structural content anywhere makes that wrapper value produce no copy action. Basenames retain spelling; HTTP(S) URLs use URL pathname decoding, while local slash/backslash paths remain literal. Unsupported schemes and filename-invalid characters are rejected. Arrays are flattened safely; exact filename duplicates are removed. These are code properties, not claims that all these forms occur in this file.

`extractHyperlinkSourceParts` exposes presentation slices and filenames, but does not return a complete reference ledger with the full link path, member occurrence identity, and parse diagnostics. Extend the existing shared implementation for that evidence rather than writing a second GMI-specific wrapper parser.

### Existing photo source architecture and restrictions

[`photoSession.mjs`](../../src/lib/photos/photoSession.mjs) already accepts injected `sourceAdapters[kind]`, constructs source identity/fingerprint, stages source review, and retains layer-level `spatialSources`. Default production support is GML. Sources hold entries and matching ledgers; attached candidates preserve `sourceId`, `sourceFilename`, and `sourceEntryId`. Current position is separate from retained candidates in [`photoSpatial.mjs`](../../src/lib/photos/photoSpatial.mjs).

However, `attachSource()` currently turns **every matched entry** into a position candidate. That is unsuitable for ordinary GMI associations. `makeSource()` fingerprints JSON evidence; raw symbol lexemes would disappear without explicit adaptation. `reviewPhotoSource`, `prunePhotoSource`, and [`photoPositioning.mjs`](../../src/lib/photos/photoPositioning.mjs) assume position-entry ledgers. The wizard and `applyPhotoPositioning()` explicitly support only `gml` and `exif`. The GML preflight uses a `Map` keyed by photo ID for proposed candidates; reusing it unchanged would overwrite multiple candidates for one photo.

[`photoReferenceMatching.mjs`](../../src/lib/photos/photoReferenceMatching.mjs) already provides NFC, separator normalization, path/suffix/basename matching, case fallback, and duplicate imported-asset detection. Its final graph pass marks repeated source paths or multiple source entries targeting one photo as `ambiguous`, reason `duplicate-gml-reference`. That GML policy would reject the verified, legitimate two-object association below, and even repeated unmatched references. Reuse the filename-resolution mechanics with an explicit GMI relationship policy; preserve existing GML behavior.

[`photoPresentation.mjs`](../../src/lib/photos/photoPresentation.mjs) has future label stubs for `gmi`, `gmi-dfot`, and `gmi-object`. They do not constitute GMI support. Future source and candidate kind should be `gmi`, with DFOT recorded as object TYPE metadata.

## 4. Entire-GMI counts and distributions

| Geometry | Objects | Coordinates | Vertices per object |
| --- | ---: | ---: | --- |
| Point | 470 | 470 | Exactly one on every object |
| Line | 256 | 1,498 | 2–24 |
| Total | 726 | 1,968 | No empty geometry |

All coordinates are finite XYZ triples. Point bounds: easting 581853.466812–582175.253, northing 6565983.008509–6566399.221, height -1.085–18.271756. Line bounds have the same horizontal range, height -1.218732–17.815347. Horizontal coordinates are in declared EPSG:25832 metres; heights are declared NN2000 / EPSG:5941. No camera bearing can be inferred from these coordinates.

| TEMA (`S_FCODE`) | Points | Lines | Total | Hyperlink-bearing objects |
| --- | ---: | ---: | ---: | ---: |
| ANB | 27 | 0 | 27 | 0 |
| DIV | 174 | 0 | 174 | 0 |
| DR | 0 | 20 | 20 | 0 |
| GRN | 83 | 0 | 83 | 0 |
| KRN | 18 | 0 | 18 | 0 |
| KUM | 64 | 0 | 64 | 53 |
| LOK | 85 | 0 | 85 | 0 |
| OV | 0 | 105 | 105 | 0 |
| SAN | 16 | 0 | 16 | 0 |
| SLU | 3 | 0 | 3 | 0 |
| SP | 0 | 68 | 68 | 0 |
| SPP | 0 | 4 | 4 | 0 |
| VL | 0 | 59 | 59 | 0 |
| **Total** | **470** | **256** | **726** | **53** |

| TYPE (`Type`) | Objects | TEMA | Photo references |
| --- | ---: | --- | ---: |
| Empty field | 461 | All point TEMA groups; DIV contributes 165 | 53 |
| Field absent from definition | 256 | All line TEMA groups | 0 |
| DOVG | 6 | DIV | 0 |
| FORAKLOSS | 3 | DIV | 0 |
| DFOT | 0 | — | 0 |

## 5. GUID and source-object identity audit

| Check | Result |
| --- | ---: |
| Objects with source GUID | 726 / 726 |
| Unique GUIDs, exact and case-normalized | 726 |
| Missing GUIDs | 0 |
| Duplicate GUIDs | 0 |
| Invalid UUID-shaped GUIDs | 0 |
| Hyperlink-bearing objects with GUID | 53 / 53 |
| Referencing objects lacking GUID | 0 |

Every GUID uses lowercase hexadecimal `8-4-4-4-12` UUID spelling, with version nibble `4`. It is delivered as `GUID <uuid>` outside `_FIELDVALUES`. All `S_OBJID` attributes on the 53 referencing objects are null, so `S_OBJID` cannot supply association identity here.

Point parser IDs are 1–470; line parser IDs are 1–256. Each geometry's IDs are distinct and sequential in this file, but IDs 1–256 occur in **both** collections: a bare parser ID is not globally unique. The audit uses `point:<id>` / `line:<id>` only as readable source locators. Primary durable identity should be **source fingerprint + GUID**, with geometry scope, parser ID, and collection index retained for exact source resolution and diagnostic fallback. Do not derive identity from AnleggsID or filename.

Every referencing object's actual GUID, parser ID, source line, collection index, metadata, coordinates, and filename are included in Appendix A. This is the full referring-object ledger, not a sampled GUID audit.

If future files have missing or duplicate GUIDs, retain source-scoped geometry/index identity and explicit `missing-guid` / `duplicate-guid` identity diagnostics. Never merge source objects solely because their GUID strings collide. Do not claim that fallback indexes remain stable across a different source revision.

## 6. Every S_HYPERLINK value and real syntax variants

Both field definitions declare S_HYPERLINK; these are the two literal occurrences of that field name in the source text. There are 726 delivered field slots: **673 empty and 53 non-empty**. The non-empty slots contain **53 wrappers, 53 `link` members, and 53 `sign` members**, yielding 52 distinct raw values and 52 distinct filenames. The raw file also has exactly 53 `link:"` occurrences, all reconciled to these slots.

There is exactly **one wrapper grammar** after replacing quoted member values with placeholders:

```text
h:1(link:"VALUE" sign:"VALUE") 
```

The blank immediately after `)` is one delivered U+0020 trailing space. All 53 values have that space, no leading space, same-line `link` followed by `sign`, `h:1`, and `sign:"pnstisol"`. Public parsed attributes have the identical grammar without the trailing space.

Two path-prefix variants occur inside `link`:

| Real path form | Link occurrences | Unique filenames | Example |
| --- | ---: | ---: | --- |
| `Attachments\<filename>` | 48 | 47 | `Attachments\KK_VK_F.JPG` |
| `05-Kum kort\KK_PORFYR\<filename>` | 5 | 5 | `05-Kum kort\KK_PORFYR\KK - KG1B.jpg` |

**The five second-prefix references are not under an Attachments prefix.** The basename resolver must not require `Attachments`. Folder and filename spaces are literal and significant. The directory name `Kum kort` and `KK_` naming are consistent with manhole documentation; without the missing older files, JPEG suffixes do not prove that each reference is a camera photograph rather than a rendered card/document.

The unique filename set is unchanged by NFC plus lowercase normalization: **52 raw names, 52 normalized keys**. No case/NFC collision occurs between distinct names. Among unique names, 45 have `.JPG` and seven have `.jpg`; among occurrences, 46 have `.JPG` and seven `.jpg`. The lower-case Attachments names are `KK_VK4.jpg` and `KK_VK1.jpg`; the other five lower-case names use the second prefix. Extension casing varies between files, but no same-stem alternative extension or case variant of the same file is present.

There are no forward-slash paths, URLs, drive paths, escaped quotes, escaped backslashes, percent encodings, alternate member orders, multiline wrappers, multi-link wrappers, extra wrapper counts, or malformed non-empty values in this file. A single Windows backslash in raw text is a path separator; the doubled backslash displayed by JSON is serialization escaping, not an extra source character.

Appendix B lists **all 52 exact paths, filenames, and normalized filename keys**. Appendix A identifies every occurrence and source object. Since grammar, sign, and trailing-space form are invariant, those appendices specify every exact raw value through the expression `h:1(link:"<listed path>" sign:"pnstisol")` followed by one ASCII space.

## 7. Current extractor successes, failures, and the compatibility gap

Calling the actual production `extractHyperlinkFilenames` on each of the 53 public attributes returned exactly its link basename. Calling it on the 53 untrimmed source lexemes also succeeds. No source reference is lost, and sign metadata is not interpreted as a filename.

Exact working source values, shown between code-fence delimiters; each line ends with a delivered ASCII space after `)`:

```text
h:1(link:"Attachments\KK_VK_F.JPG" sign:"pnstisol") 
h:1(link:"Attachments\KK_VK4.jpg" sign:"pnstisol") 
h:1(link:"05-Kum kort\KK_PORFYR\KK - KG1B.jpg" sign:"pnstisol") 
```

Outputs respectively: `KK_VK_F.JPG`, `KK_VK4.jpg`, `KK - KG1B.jpg`. These cover both actual path prefixes and both extension spellings. The duplicate reference `Attachments\KK_VK14.JPG` also succeeds on both source objects.

| Compatibility result | Objects |
| --- | ---: |
| Non-empty values yielding expected filename | 53 |
| Non-empty values rejected or incorrectly extracted | 0 |
| Empty values yielding no filename | 673 |

**Exact raw failing value from this fixture on this baseline: none exists.** There is no current real-fixture working/failing pair to quote. Source inspection identifies possible boundaries—whole-wrapper rejection, unquoted metadata, escaped quotes, whitespace around `h:`, unsupported schemes, and source field splitting—but none can be named as a remaining cause without the actual rejected value. Existing tests deliberately reject `h:1(link:"Photo.jpg" sign:broken)`; that is a synthetic negative case, not a real Ekenesstokken failure.

There is, however, concrete historical evidence in [`20261005-photo-filename-copy-correction.md`](20261005-photo-filename-copy-correction.md). It records this exact browser-supplied formerly failing value:

```text
h:1(link:"Attachments\20251119_154646.jpg"
sign:"NOSEVIE")
```

That report attributes the old failure to a whole-wrapper grammar accepting only `link` members; the presence of `sign` prevented any extraction. The correction accepts named quoted metadata while extracting only `link`. On the current baseline, the historical value returns `20251119_154646.jpg`; the same-line sign-bearing Ekenesstokken values also pass. The historical value is **not present in this GMI**, and its `NOSEVIE` sign must not be substituted for this file's actual `pnstisol`. If the user's observation refers to a still-failing case beyond that documented correction, it remains unverified and needs its exact value.

Before modifying acceptance grammar further, capture any remaining failing delivered lexeme and its parser attribute, source file fingerprint, GUID, and UI input. Check whether the failure precedes extraction, comes from whole-value grammar rejection, or is presentation-related. Pin the value in regression coverage and show the desired extraction and preserved original text. **Do not implement speculative grammar relaxation under the claim that this audit proved it.** This file verifies the single same-line wrapper form above plus arbitrary quoted Windows relative paths including the two observed prefixes. The repository's historical browser evidence additionally justifies newline-separated quoted sign metadata, already covered by the current implementation and regression suite.

## 8. Object → photo graph

Counts use unique filenames per object, while raw member occurrences are retained separately:

| Referenced JPEG filenames per object | Objects |
| --- | ---: |
| 0 | 673 |
| 1 | 53 |
| More than 1 | 0 |

Maximum references per object: **1**. No concrete one-object/multiple-photo example exists here. The existing extractor supports multiple link members in its tested grammar, but that code capability is not a real-fixture observation. The future model must support it as a product requirement and retain member-level evidence, without pretending this file demonstrates it.

## 9. Photo → object reverse graph

| Referring source objects per unique JPEG filename | Filenames |
| --- | ---: |
| Exactly 1 | 51 |
| More than 1 | 1 |

Maximum referring objects per filename: **2**. The duplicate is `KK_VK14.JPG`:

| Source object | GUID | TEMA / TYPE | AnleggsID | XYZ in source CRS |
| --- | --- | --- | --- | --- |
| `:P 9`, index 8, line 2838 | `471dda56-8c5c-4d65-a56d-0713f648c9ab` | KUM / empty | VK14 | 581912.353841, 6566386.072688, 2.65 |
| `:P 56`, index 55, line 3078 | `bc2fbad7-cffe-4580-8557-484e90ced824` | KUM / empty | VK14 | 581919.390877, 6566220.550186, 13.12 |

Both contain exactly `h:1(link:"Attachments\KK_VK14.JPG" sign:"pnstisol") ` in their source field. Horizontal object-to-object separation is **165.672021 m**, calculated as Euclidean XY distance in EPSG:25832. This is **not** a comparison against photo position. The shared AnleggsID does not establish that the objects are interchangeable, and the audit cannot determine whether the repeated reference is intentional or a documentation error. Preserve both GUID associations; do not guess which object owns the JPEG.

The graph's 53 distinct object/filename edges is reconciled in both directions: 51 single-object names plus one two-object name = 53 edges.

## 10. DFOT audit

| DFOT check | Result |
| --- | --- |
| TYPE=DFOT objects | 0 |
| DFOT objects with hyperlinks | 0 |
| DFOT objects with coordinates | 0 |
| DFOT point / non-point geometry | 0 / 0 |
| Multiple photos per DFOT | No instances |
| Same photo referenced by multiple DFOT objects | No instances |
| DFOT ↔ EXIF coordinate pairs | 0 |
| DFOT ↔ GML coordinate pairs | 0 |
| DFOT ↔ current photo position pairs | 0 |

There are no per-DFOT TEMA/GUID/geometry/hyperlink rows or repeated-field observations to report. The entire raw text was checked, so this is not caused by inspecting only one parser collection or testing the wrong field casing. DFOT remains **an object TYPE within GMI**, never a separate file format or source import.

The proposed DFOT point-candidate rule is a **conditional design**, not a proven interpretation of this fixture. Before release, inspect another real GMI with DFOT and matched attachments; verify Type binding, point cardinality, source CRS, repeated links, GUID behavior, and camera-position plausibility against EXIF/GML. Geometry and hyperlinks alone do not make a source authoritative.

## 11. Ordinary VA object photo references

Every non-empty reference belongs to a point with TEMA KUM and empty TYPE: **53 objects, 53 members, 52 unique JPEG names**. There are no line references or references on other TEMA/TYPE combinations. Eleven of the file's 64 KUM objects have empty hyperlinks.

All 53 have `Stedfestingsforhold=ÅPEN_KUM`, non-empty AnleggsID, manhole construction/dimension attributes, and point XYZ geometry. For example `:P 1` has AnleggsID `VK2(F)`, round Kumform `R`, Bredde `1600`, and `Høydereferanse=BUNN_INNVENDIG`. Its position is the surveyed structure evidence; nothing says it is a camera location. The source does not deliver a photo-specific positioning field on these objects. Naming of the five `Kum kort` references further cautions against assigning photographic-location semantics from file suffix alone.

**Recommendation: all these ordinary object hyperlinks are association evidence only.** Do not use KUM geometry, a line midpoint, a nearby object, repeated AnleggsID, or a matching documentation filename as a camera-position candidate. The repeated VK14 reference across 165.67 m directly shows why selecting one ordinary object position would invent unsupported evidence. No non-DFOT position eligibility is justified by this file.

## 12. Separate attachment-folder matching

### Requested root GMI folder

`C:\Temp\gmi-photo-test\Ekenesstokken\Attachments` does not exist. Observed exact matches = **0**, observed case/NFC matches = **0**. All **52 unique references / 53 object-reference occurrences are unresolved against that absent inventory**.

Confirmed individual missing-file count, actual file count, orphan count, duplicate basenames, duplicate normalized names, and actual extension/case variants are **unavailable**, not assumed zero. An absent directory is different from a successfully enumerated empty directory. The 47 unique names with `Attachments\` could be tested against this folder if supplied. The five `05-Kum kort\KK_PORFYR\` names resolve to a different relative directory in the source path; that directory is also absent under Ekenesstokken. Basename matching against an explicitly selected imported photo layer can later resolve a moved asset, but must retain this original path and report the method.

No old reference was guessed onto a newer asset using AnleggsID, embedded labels, nearby coordinates, or substring similarity.

### Newer Terrain folder

| Check against GMI reference namespace | Result |
| --- | ---: |
| Present newer files | 148 |
| Exact basename overlap with GMI | 0 |
| NFC + case-folded basename overlap with GMI | 0 |
| GMI reference names not found here | 52 |
| Newer files not referenced by GMI | 148 |
| Duplicate exact basenames, recursive inventory | 0 |
| Duplicate normalized basenames | 0 |
| Extension spelling | 148 `.jpg` |

Those 148 are **unreferenced relative to this GMI**, not orphan photos in their own Terrain dataset: all 148 have matching GML references. The newer attachment namespace and the absent root namespace must remain separate. Overlap is zero even though both describe the Ekenesstokken project area and some newer filenames include familiar object labels.

## 13. GMI / EXIF / GML position comparisons

There are **zero matching GMI-reference ↔ newer-photo pairs** and **zero matching GMI-reference ↔ GML pairs**, using exact then NFC/case-normalized full basenames. The absent root set prevents old-photo EXIF inspection. There are no DFOT objects. Thus no GMI photo-position delta can be computed without inventing a relationship.

As a control on the available newer data, all **148 JPEGs** yielded viable EXIF GPS through the existing [`readExifGps` / `normalizeExifGps`](../../src/lib/photos/exifGps.mjs) path using installed exifr and the same GPS options. All 148 GML names uniquely matched these files. The GML declares EPSG:5972 on its single collection envelope; none of the 148 Point elements declares its own CRS. This is the existing Terrain envelope-fallback case. All positions are three-component easting/northing/height values, projected using the existing strict `projectPhotoCoordinate('EPSG:5972', coordinates)` path. All 148 project successfully.

GML was read namespace-aware using .NET `XmlDocument.Load` (declared UTF-8, external resolver disabled) for this audit; no replacement GMI parser or production XML implementation was added. The existing browser GML parser was inspected to confirm the same profile and CRS fallback. This audit did not exercise its DOMParser execution in a browser.

Horizontal EXIF ↔ GML comparison uses the existing `photoPositionDistance()` approximation:

| Available comparison | Pairs | Minimum | Maximum | Mean |
| --- | ---: | ---: | ---: | ---: |
| Newer Terrain GML ↔ newer EXIF | 148 | 0.000039003 m | 0.000040041 m | 0.000039512 m |
| GMI ↔ matched photo EXIF | 0 | Unavailable | Unavailable | Unavailable |
| GMI ↔ matched GML | 0 | Unavailable | Unavailable | Unavailable |
| DFOT ↔ other position source | 0 | Unavailable | Unavailable | Unavailable |

For example, `Trase B_2025-08-06-16-31-18_9d243233b5ce3ef94dc5e3953ce8cf_Kg10.jpg` has GML XYZ `581932.579311 6566001.891835 0.000000`. The submillimetre differences show numerical agreement of exported positions, not independently established survey/GPS accuracy. They do not make either source authoritative. Heights were not transformed or compared.

No live photo-session current-position snapshot was used. Accepted GML/EXIF/manual positions are session state, not present as an authoritative fixture artifact; their changes must not be reverse-engineered from source files. The many-to-many VK14 object separation reported above is strictly an object-to-object observation.

## 14. Deterministic filename-matching policy

Use the shared hyperlink extraction layer to produce **one reference occurrence per validated link member**, preserving wrapper/member slices, full raw path, raw filename spelling, and diagnostics. Keep metadata such as sign separate. Filename-copy deduplication can remain a presentation policy; association evidence must not lose repeated member occurrences.

Reuse photo-reference normalization and asset-bucket construction, then apply this GMI-specific policy:

1. Normalize path separators on a derived key, retaining the raw reference. Extract the final basename from a valid quoted link. Treat quoting as wrapper structure; do not blindly strip quotes from arbitrary malformed source text.
2. Apply Unicode NFC and consistent lowercase to comparison keys, with original spelling retained. Check the full normalized collision bucket even if one asset has an exact spelling. Do not claim an exact match is unique when another imported asset differs only in case or normalization.
3. Prefer unique owner-layer relative-path match, then safe relative-path suffix match, then unique basename match. Record exact versus case/NFC fallback and path versus basename resolution. Distinct full relative paths may resolve otherwise duplicated basenames if the evidence actually disambiguates them.
4. Accept both verified directory prefixes. `Attachments` is not mandatory; `05-Kum kort\KK_PORFYR` is delivered evidence. Never implicitly merge attachment folders or search across all FOTO layers.
5. Preserve extensions except ordinary case folding: `.JPG`/`.jpg` are justified. Do not equate `.jpeg` with `.jpg`, remove suffixes, or infer the same asset from a shared stem. Literal spaces and punctuation survive.
6. No percent encoding or quote escapes occur here. Keep the existing explicit URI treatment where already supported; do not percent-decode plain Windows paths. Introduce any new escape/URI grammar only from captured evidence, rejecting invalid encoding and encoded separators/traversal. No remote fetch or filesystem path traversal is needed.
7. Resolve **each GMI reference to imported assets independently**. Multiple GMI objects confidently referencing the same single asset are allowed association edges. They are not duplicate-file ambiguity. Multiple imported assets in the same matching bucket remain ambiguous; never select the first file.

Outcomes:

| Outcome | Definition | Consequence |
| --- | --- | --- |
| Confident | Valid reference resolves to exactly one eligible imported asset through a collision-checked path/basename method | Association may attach; candidate eligibility is evaluated separately |
| Ambiguous | Multiple imported assets remain possible, or identity/field conflict prevents safe source resolution | Preserve alternatives and diagnostics; no guessed edge or position |
| Unmatched | Valid reference has no imported asset, or no safe parsed reference exists | Preserve original source evidence and reason |

The absent root folder is an audit availability diagnostic, not proof that every referenced file is missing in the actual project. With only the newer assets imported, all 53 GMI occurrence matches would be unmatched, while the source graph still retains two edges to `KK_VK14.JPG`.

## 15. Recommended source retention in photoSession

Retain **one generic source record with `kind: 'gmi'`** in the owner FOTO layer's `spatialSources`, using the existing staged-source lifecycle and private file ownership rules. Do not import separate DFOT and association sources.

Conceptual source shape, to adapt to the existing immutable source records:

```js
{
  id, kind: 'gmi', filename, fingerprint, importedAt,
  header, crsContext,
  objectsByKey,           // source-scoped identity, metadata, raw geometry once
  references,            // every link occurrence: objectKey + raw reference evidence
  associationLedger,     // reference occurrence -> matched/ambiguous/unmatched photo IDs
  entries,               // position evidence entries only for eligible objects
  ledger,                // position review projection, separate from associations
  issues
}
```

`objectsByKey` should include all parsed source objects' identity and metadata, with geometry/evidence retained once per object. Explicitly retain hyperlink source lexemes and CRS declarations; serializing the parser's Symbol evidence is insufficient. Object keys use source-local GUID when unique, with disambiguated geometry/index fallback when needed. The source fingerprint scopes these keys and source revisions; imported photos continue to use their existing asset IDs.

Source-level reference evidence contains `objectKey`, member/occurrence ID, `hyperlinkRaw`, `referenceRaw`, `referencedFilename`, and derived normalized key. Association matches link those occurrences to owner-layer photo IDs, retaining unmatched/ambiguous references for later recheck. Keep all referencing-object evidence even where there is no viable position. Store geometry once rather than copying entire GMI objects into every photo or candidate.

Compute a GMI byte fingerprint once when possible, or retain an explicit deterministic source-revision fingerprint with raw evidence. Preserve the existing secure-context fallback behavior. A matching filename alone must never establish equivalence between a source and a loaded map layer. Avoid fingerprinting data after evidence-dropping normalization and then describing it as exact-byte identity.

Source attachment must support **association-only sources**, including this real file. Attaching associations is explicit; changing current position is a separate selected operation in the same final transaction. Cancellation must leave no partial source, associations, or candidates. Rechecking is idempotent; photo removal prunes live ledger endpoints, source removal/reset releases corresponding metadata, and position changes preserve associations. Appending new photos uses an explicit owner-scoped recheck without silently accepting candidates.

## 16. Position-candidate rules and provenance

The verified result for this file is **zero eligible GMI position entries**. Point cardinality and valid CRS do not make ordinary KUM geometry eligible.

Proposed rule, pending real DFOT validation: a GMI object contributes a candidate only when its resolved domain TYPE is DFOT, it has **point geometry with exactly one finite XY coordinate** (optional finite source Z), the horizontal CRS is explicitly and unambiguously supported, the strict projection succeeds, a validated link resolves confidently to one imported asset, and source object identity is resolvable. Empty/malformed geometry, line geometry, conflicting TYPE/TEMA binding, unsupported/unknown CRS, ambiguous assets, or unresolved duplicate object identity block a usable candidate and retain diagnostics. Do not fall back to EPSG:4326 on projection failure.

Use established binding/evidence conventions for delivered `Type` / `TYPE` aliases; do not hard-code an uppercase field that is absent here or infer DFOT from a filename/TEMA guess. If a field alias conflict occurs, report it instead of picking whichever value was enumerated first.

A candidate uses the existing `createPhotoCandidate` model:

```js
{
  id, kind: 'gmi', status, position,
  sourceId, sourceFilename, sourceEntryId,
  objectKey, objectGuid, parserObjectId, geometryScope, sourceIndex,
  tema, type: 'DFOT',
  raw: { coordinates, geometryType, hyperlinkRaw, referenceRaw, referencedFilename },
  crsResolution, transform, issues
}
```

Store the provenance projection needed by the existing candidate inspector; retain full object evidence at source level and reference it by objectKey. `crsResolution` preserves COSYS_EPSG/COSYS and vertical declaration, axis order, resolution method, and original header context. `transform` identifies the approximate horizontal map projection and explicitly leaves vertical data untransformed. `sourceEntryId` must identify the object/reference evidence, not merely a filename.

One DFOT may contribute evidence to multiple photos; several DFOT objects may contribute distinct candidates to one photo. Do not collapse those candidates or overwrite them in a photo-ID Map. Filename matching may be confident while candidate selection still requires a user's choice. Preserve all candidates and GUID provenance even if coordinates agree. Ordinary associations do not become invalid position candidates simply to fit an existing positional ledger.

GMI has no source priority over EXIF, GML, or manual placement. Compare using the current positioning review rules, leave accepted position unchanged until explicit apply, and retain alternatives after acceptance. Candidate provenance is evidence, not ownership or a claim of authoritative camera location.

## 17. Compact association model

The canonical association ledger belongs to the retained source. Provide a derived reverse index/view for the photo inspector rather than copying entire GMI objects into every photo record:

```js
// Source-level object evidence
objectsByKey[objectKey] = {
  guid, parserId, geometryScope, sourceIndex, tema, type,
  rawGeometry, sourceLine, identityIssues
};

// Source-level association evidence
associationLedger.edges = [{
  id, objectKey, photoId, referenceIds, matchMethod
}];

// Derived compact photo-facing reference
{ kind: 'gmi-object', sourceId, associationId, objectKey }
```

Source references hold raw hyperlink/path/filename text. Resolve GUID/TEMA/TYPE on demand through `sourceId + objectKey`. Stable edge identity is source-scoped objectKey + photoId; multiple member occurrences can be grouped under `referenceIds` while preserving each occurrence's evidence. Keep unresolved reference rows alongside matched edges. A derived `photoId -> association IDs` index and `objectKey -> association IDs` index support both navigation directions.

For the real VK14 case, the same eventual photo asset would have **two distinct object associations**, each resolving to its real GUID. “Referenced by 2 GMI objects” counts distinct source objects, not link occurrences or duplicate candidate entries. Association changes must not touch `spatial.current`, accepted candidate basis, direction, preview, or asset ownership.

This supports many-to-many links, source provenance, independent position editing, append/recheck, and later photo/object interaction. When multiple source revisions are retained, scope object identity by source rather than merging equal GUIDs across sources. A deleted map layer need not delete retained photo-source evidence; navigation simply becomes unavailable.

## 18. Existing map-object lookup feasibility

[`MapInner.js`](../../src/components/MapInner.js) builds GeoJSON from each loaded layer's `data.points` and `data.lines`. Feature properties spread `object.attributes`, then set `id` to the **zero-based collection index**, `featureType` to `Point` / `Line`, and `_layerId`. Point geometry uses the first coordinate; line geometry uses all coordinates. **Top-level parser `guid` and parser `id` are not copied to current GeoJSON properties.** There is no top-level GeoJSON `feature.id` assigned in that construction.

Interaction IDs are constructed by `getFeatureIds` and matching handlers:

```text
punkter-<layerId>-<point collection index>
ledninger-<layerId>-<line collection index>
```

The legacy no-layer forms omit layerId. [`LayerDataTable.js`](../../src/components/LayerDataTable.js) constructs the same interaction IDs. Store `viewObjectInMap(featureId, coordinates, zoom, metadata)` accepts layerId and point/line index metadata. `getVisibleLayersData()` retains `_layerId` and `_originalIndex` alongside copied objects. The loaded layer still contains the parser object and GUID at `layers[layerId].data.points[index].guid` / `.lines[index].guid`.

Concrete mapping: source `:P 9`, GUID `471dda56-8c5c-4d65-a56d-0713f648c9ab`, is point index 8 in this exact source; its current map interaction ID would be `punkter-<loadedLayerId>-8`. Parser ID `9`, feature-property ID `8`, and GUID are three different identifiers. `:L 9` is a different source object.

Validation-v2 [`objectRef.js`](../../src/lib/validation-v2/objectRef.js) already defines revision-scoped ObjectRefs with layerId, datasetRevision, geometryScope, and sourceIndex, and guards ownership. These locate an exact dataset revision; they are not GUID-based stable identity across imports. Preserve that distinction and avoid changing validation contracts for photo linking.

Enough information exists in loaded-layer data to build a small lookup. There is no ready global GUID → map-feature index that the photo source can safely call. The smallest future addition is a revision-scoped index mapping source GUID buckets to `{ geometryScope, parserId, sourceIndex }`, plus an explicit binding from a retained GMI source fingerprint/revision to a loaded GMI layer. Require unique GUID resolution within that bound source. Optionally expose `_sourceGuid` and `_parserObjectId` in generated feature properties for easier inspection; this is unnecessary for the initial association ledger.

A photo-source import should not automatically create a second GMI map layer. Navigation is available only when a matching loaded source revision can be resolved. Handle unloaded/hidden/deleted layers and duplicate GUIDs explicitly. Do not substitute a coincidental matching filename or guess an array index in another import. Broad cross-module navigation is deferred.

## 19. Minimal future UI implications

Add `GMI-fil` under `Posisjoner bilder → Kilde`; choose a GMI, analyse its entire object inventory, review viable photo-position candidates against current/GML/EXIF/manual, show summary, and explicitly apply. Review totals must distinguish association matches, association ambiguity/unmatched references, and eligible position candidates. For this exact GMI, explain “0 eligible position candidates; references on ordinary KUM objects” rather than offering KUM positions or claiming the source is empty.

The flow needs a final **attach associations/source evidence** action even with zero position requests. A source can have useful matched associations and no position candidates. This requires relaxing the current `requests.length > 0` restriction only for an explicitly designed source-attachment transaction, without making ordinary zero-selection positioning silently mutate session state.

In the selected-photo inspector, derive:

```text
Referenced by GMI
2 objects

GUID 471dda56-8c5c-4d65-a56d-0713f648c9ab
TEMA: KUM
TYPE: not supplied

GUID bc2fbad7-cffe-4580-8557-484e90ced824
TEMA: KUM
TYPE: not supplied
```

Show source filename and distinguish original path from derived match method in source detail. Do not label a source-object association as the accepted photo position. If a verified DFOT supplies a candidate, show source `GMI`, with TYPE=DFOT and GUID in normal candidate details. Later actions can highlight, zoom, or inspect a resolved map object; they should be unavailable when that source revision is not loaded. This audit adds no UI.

## 20. Validation and audit artifacts

Temporary analysis artifacts are outside production source and outside git:

```text
%TEMP%\gmi-photo-source-audit-20261008\audit.mjs
%TEMP%\gmi-photo-source-audit-20261008\audit.json
%TEMP%\gmi-photo-source-audit-20261008\gml-inventory.json
```

The Node audit imports the real parser, decoder, symbol lexemes, extractor, strict projection, EXIF reader, and positional comparison. Raw-record scanning is a reconciliation check only. It verifies every field lexeme, GUID, and coordinate against source blocks and asserts object count, hyperlink-bearing count, no DFOT, no warnings/errors, and unchanged hashes for every fixture file. The temporary JSON includes the full source-object ledger, reverse graph, exact raw links, both folder inventories, 148 EXIF readings, GML positions, and individual EXIF/GML deltas. Large evidence datasets and original fixtures were not added to git.

Rerun the complete session-local audit after regenerating the namespace-aware GML inventory if the fixture changes:

```powershell
node "$env:TEMP\gmi-photo-source-audit-20261008\audit.mjs"
```

For a portable core recount that does not depend on temporary files, run the following from the repository root with Node's module mode (for example save it as a temporary `.mjs` with imports resolved against the repository). This deliberately uses the production extractor; it is not a repair parser:

```js
import fs from 'node:fs';
import { GMIParser } from './src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from './src/lib/parsing/gmiDecoding.js';
import { extractHyperlinkFilenames } from './src/lib/hyperlinkFilenames.mjs';
const raw = decodeGmiBytes(fs.readFileSync(
  'C:/Temp/gmi-photo-test/Ekenesstokken/VA_SOMBYGGET_07112025_BRUK DENNE.gmi'));
const p = new GMIParser(raw);
const objects = [...p.points, ...p.linesParsed];
const bearing = objects.filter(o => o.attributes.S_HYPERLINK);
const reverse = new Map();
for (const o of bearing) {
  for (const filename of extractHyperlinkFilenames(o.attributes.S_HYPERLINK)) {
    const guids = reverse.get(filename) || [];
    guids.push(o.guid); reverse.set(filename, guids);
  }
}
console.log({ objects: objects.length, bearing: bearing.length,
  filenames: reverse.size, dfot: objects.filter(o => o.attributes.Type === 'DFOT').length,
  failures: bearing.filter(o => !extractHyperlinkFilenames(o.attributes.S_HYPERLINK).length).length,
  repeated: [...reverse].filter(([, guids]) => guids.length > 1),
  warnings: p.warnings, errors: p.errors });
```

Existing parser/domain regression checks were run with:

```text
node --test tests/hyperlinkFilenames.test.mjs tests/photoReferenceMatching.test.mjs tests/photoSpatialProjection.test.mjs tests/photoSpatial.test.mjs tests/photoPositioning.test.mjs
```

Result: **49 passed, 0 failed**. These verify current shared extraction, filename ambiguity policy, projection, retained candidate/current separation, source review and explicit apply behavior. They do not prove support for missing real DFOT or failing hyperlink forms. Node's existing module-type warning is informational; no package configuration was changed. No new repository test/helper was added; the report is the only task-created repository artifact.

## 21. Edge cases and unresolved evidence

- Older root attachments are unavailable. All 52 unique old references remain unresolved; confirmed missing-file/orphan/duplicate statistics need the actual directory. Five delivered references use a different folder prefix.
- No DFOT exists. TYPE geometry interpretation, repeated links, positional accuracy, and camera-location plausibility require a real DFOT-bearing source.
- The historical newline/sign copy failure is documented and corrected in the current shared implementation; its recorded value now passes. Any remaining user-observed failure is not reproduced by this file's 53 values. Obtain its raw lexeme before changing grammar. Similar visible prefixes are insufficient to infer structural equality.
- JPEG extension is not proof of photographic content. `Kum kort` references may represent documentation imagery; files are unavailable for inspection.
- Same filename on two objects is real association evidence, even where source data may contain a mistake. Two KUM objects with the same AnleggsID are 165.67 m apart. Do not deduplicate by AnleggsID or choose a location.
- GML's unique-position matching policy currently conflates duplicate source references with filename ambiguity. GMI must allow repeated object references while continuing to reject ambiguous imported assets.
- Future multiple DFOT candidates for one asset must remain individually selectable; existing single-proposal review and photo-ID preflight storage need adaptation.
- GUID, parser ID, map collection index, source fingerprint, and validation ObjectRef are different identity dimensions. Map lookup must bind an exact source revision.
- NFC/case normalization has no collision in this fixture; keep conservative collision handling because duplicate-safe photo append can deliberately retain same-name assets.
- Raw lexemes are private symbol metadata. Explicitly preserve them in the source adapter, including the trailing space; neither JSON nor immutable snapshots preserve that symbol automatically.

## 22. Tests required for the implementation milestone

1. Real-value extraction regression: both verified prefixes, `.JPG`/`.jpg`, literal spaces, sign metadata, trailing source space, source-slice reconstruction, and no metadata-as-file extraction. Add the actual failing raw form once captured; preserve current malformed-wrapper rejection unless evidence requires a narrowly defined change.
2. Full-file audit/matching: all point and line objects, source raw fields and GUIDs, empty hyperlinks, distinct geometry IDs, alias/binding conflict diagnostics, multiple link occurrences, repeated members, and complete unresolved ledger retention. Synthetic multiple-photo/DFOT cases must be labeled synthetic.
3. Many-to-many GMI association resolution: the exact two-GUID `KK_VK14.JPG` graph resolves to two associations for one unique imported file. One object may resolve to multiple photo assets through distinct members. A collision between imported assets remains ambiguous even with an exact-spelled candidate. GML duplicate-reference behavior remains unchanged.
4. DFOT eligibility: real DFOT evidence and independently compared positions before release; synthetic tests for one valid point, empty/multi-coordinate/nonfinite geometry, line geometry, unsupported/missing/conflicting CRS, invalid projection, ambiguous names, and missing/duplicate GUID handling. Every ordinary KUM in this fixture produces zero position candidates.
5. Provenance and lifecycle: source raw paths/geometry/CRS and GUID persist, manual/current/direction changes preserve associations, explicit source apply is atomic, cancellation/late parser results cannot resurrect state, duplicate source imports are prevented, recheck is idempotent, and photo/layer removal prunes endpoints. Append does not auto-accept new positions.
6. Candidate review: one photo with several DFOT candidates must require a selected candidate, preserve all evidence, and prevent photo-ID overwrite. Retain current-object, source-version, and membership guards. Source-only association attachment works with zero position requests, and is explicitly confirmed.
7. Wizard/inspector integration: `GMI-fil`, association-only result, separate matching/candidate totals, GUID/TEMA/TYPE details, explicit acceptance, and unchanged GML/EXIF/manual/direction behavior. Count distinct objects independently of reference occurrence counts.
8. Later map linking: exact loaded-source revision, point/line ID collisions, duplicate/missing GUID buckets, hidden/unloaded/deleted layers, and correct current interaction ID. Do not add broad navigation tests before that stage is implemented.

## Appendix A. Every hyperlink-bearing source object

The generated ledger below enumerates all 53 occurrences. Geometry is Point, TEMA is KUM, TYPE is empty, and reference count is one on every row. Index is zero-based in the parser point collection; source line is one-based. Coordinates are raw EPSG:25832 XY and NN2000 Z. Exact raw link values are recorded in Appendix C.

| Parser object | Index | Source line | GUID | AnleggsID | Raw XYZ | Filename |
| --- | ---: | ---: | --- | --- | --- | --- |
| `:P 1` | 0 | 2796 | `205a48a1-339a-42ed-a66e-b7ace6d13ad2` | VK2(F) | 581856.063096, 6565991.532687, 15.4 | `KK_VK_F.JPG` |
| `:P 3` | 2 | 2807 | `29dffffd-395f-436a-9160-147f79ddb94b` | VK2 | 582042.647822, 6566250.412749, 2.73 | `KK_VK2.JPG` |
| `:P 4` | 3 | 2812 | `ecb8e0a9-fc2e-4ca7-aa0a-0807393626fe` | OVK20 | 582016.462339, 6566299.615437, 2.78106 | `KK_OVK20.JPG` |
| `:P 5` | 4 | 2817 | `b26c2d2b-d533-41fc-b124-6f02ccd574ce` | SPK20 | 582015.472, 6566299.8701, 3.219639 | `KK_SPK20.JPG` |
| `:P 6` | 5 | 2822 | `d3ac47ea-614f-45be-8883-3c43257b828e` | SP2 | 582041.840513, 6566248.267601, 2.56 | `KK_SPK2.JPG` |
| `:P 9` | 8 | 2838 | `471dda56-8c5c-4d65-a56d-0713f648c9ab` | VK14 | 581912.353841, 6566386.072688, 2.65 | `KK_VK14.JPG` |
| `:P 22` | 21 | 2905 | `d797de8f-e20e-4ebd-8515-9d544b9f1b8f` | OV2 | 582043.191699, 6566247.401206, 2.19 | `KK_OVK2.JPG` |
| `:P 25` | 24 | 2920 | `04ed0b92-949b-44f4-b60f-9c6ace31dfe0` | SPK17 | 581924.217974, 6566361.813449, 3.732518 | `KK_SPK17.JPG` |
| `:P 26` | 25 | 2925 | `ad00a968-f76a-41f7-b507-da5dd891814f` | OVK17 | 581924.999985, 6566361.45375, 3.722075 | `KK_OVK17.JPG` |
| `:P 33` | 32 | 2961 | `55bf947b-97b6-432a-975c-ac1d6d1b8dd3` | OVK3 | 582015.754033, 6566208.483628, 4 | `KK_OVK3.JPG` |
| `:P 34` | 33 | 2966 | `16580710-9b41-4857-8d29-dfc32f4cd95a` | OVK7 | 581998.167586, 6566132.964043, 9.78 | `KK_OVK7.JPG` |
| `:P 35` | 34 | 2972 | `d1c08eb8-5b7a-459f-b82b-af9f2dc27068` | SPK7 | 581997.414584, 6566133.096416, 9.99 | `KK_SPK7.JPG` |
| `:P 36` | 35 | 2978 | `254d393f-1bd2-4eb5-9338-531be66df832` | VK3 | 582013.204725, 6566213.015174, 5.05 | `KK_VK3.JPG` |
| `:P 37` | 36 | 2983 | `15b48520-2818-44af-bd76-172e80feb6a5` | VK12 | 581975.05322, 6566003.345008, 15.763124 | `KK_VK12.JPG` |
| `:P 38` | 37 | 2988 | `1b72076f-08ed-44e2-ae73-c609070eb46d` | OV12 | 581976.45523, 6566006.507563, 15.23 | `KK_OVK12.JPG` |
| `:P 39` | 38 | 2993 | `5cdc19fb-3deb-471d-83e0-b353b375ad8a` | SP12 | 581977.105268, 6566005.728446, 15.26 | `KK_SP12.JPG` |
| `:P 40` | 39 | 2998 | `0722c614-36b6-4e5c-a4cf-fb731d590a5d` | VK8 | 581956.849424, 6566108.404484, 12.31 | `KK_VK8.JPG` |
| `:P 41` | 40 | 3003 | `32e01efb-bf2c-4134-99b1-ae2299619633` | SPK8 | 581958.881398, 6566111.821764, 11.544057 | `KK_SPK8.JPG` |
| `:P 42` | 41 | 3008 | `0258e608-1736-43c4-8bab-2f0f1ef58e38` | OVK8 | 581958.492142, 6566110.936659, 11.963338 | `KK_OVK8.JPG` |
| `:P 43` | 42 | 3013 | `ee8120b1-0907-48bc-a446-64eddd30e1b1` | SPK9 | 581934.19694, 6566084.477759, 14.227 | `KK_SPK9.JPG` |
| `:P 44` | 43 | 3018 | `8f165a9a-2573-475d-8022-d0a57223acc4` | OVK9 | 581934.444345, 6566083.053127, 14.2 | `KK_OVK9.JPG` |
| `:P 45` | 44 | 3023 | `b43c4308-b79f-49d9-a5be-3d4152d090e0` | VK4 | 582043.494411, 6566157.751381, 5.71 | `KK_VK4.jpg` |
| `:P 46` | 45 | 3028 | `2adf793c-f189-48cc-aa5e-7344bc5d562a` | SPK4 | 582041.023167, 6566159.346763, 5.699963 | `KK_SPK4.JPG` |
| `:P 47` | 46 | 3033 | `afed730e-3726-46da-b35d-574951c36e8f` | OVK4 | 582041.95697, 6566159.290571, 5.164216 | `KK_OVK4.JPG` |
| `:P 48` | 47 | 3038 | `becafb3c-b3c8-4de0-bf85-7610d9093ef9` | VK19 | 581986.753933, 6566260.017038, 5.45 | `KK_VK19.JPG` |
| `:P 49` | 48 | 3043 | `6e7c6a1b-9e1f-491f-b3cd-a4e6fe68db81` | SPK19 | 581984.427463, 6566261.969329, 5.45 | `KK_SPK19.JPG` |
| `:P 50` | 49 | 3048 | `b7fe885b-8bd6-45c3-9a9d-13f7209f21ca` | OVK19 | 581985.375717, 6566261.44757, 5.397677 | `KK_OVK19.JPG` |
| `:P 52` | 51 | 3058 | `3f07aff8-59de-41f3-9497-ee5d9a0f2910` | SPP12 | 581977.192912, 6566003.854466, 16.007029 | `KK_SPPK12.JPG` |
| `:P 54` | 53 | 3068 | `43210ff7-95d0-4a8e-8646-868911e3a433` | OVK14 | 581920.432041, 6566219.289319, 13.079911 | `KK_OVK14.JPG` |
| `:P 55` | 54 | 3073 | `856d6f62-6230-4925-9cde-7b281e221500` | SPK14 | 581921.409332, 6566218.864938, 12.72259 | `KK_SPK14.JPG` |
| `:P 56` | 55 | 3078 | `bc2fbad7-cffe-4580-8557-484e90ced824` | VK14 | 581919.390877, 6566220.550186, 13.12 | `KK_VK14.JPG` |
| `:P 57` | 56 | 3083 | `01eb9634-d070-40ac-9d92-9888f65c2224` | SPK13 | 581942.32857, 6566155.731613, 12.069012 | `KK_SPK13.JPG` |
| `:P 58` | 57 | 3089 | `dc39607a-7766-46cd-b275-953b3adc3691` | OVK13 | 581941.576308, 6566156.35037, 12.445165 | `KK_OVK13.JPG` |
| `:P 93` | 92 | 3269 | `8cc8e3f9-f0c1-401c-a141-d7c4ddddaafc` | SPK3 | 582014.354394, 6566208.965753, 4.18773 | `KK_SPK3.JPG` |
| `:P 130` | 129 | 3454 | `35d9499f-cc84-41d9-b37c-5c238831325a` | VK1 | 582078.367469, 6566072.507103, 6.91 | `KK_VK1.jpg` |
| `:P 132` | 131 | 3464 | `85651d13-c2ed-47f7-ad99-9d6d967c120c` | OVK6 | 582082.651771, 6566048.937169, 7.07 | `KK_OVK6.JPG` |
| `:P 133` | 132 | 3469 | `aa6f41be-84ab-4830-9c07-0be494051c97` | SPK6 | 582081.986567, 6566049.878803, 7.113374 | `KK_SPK6.JPG` |
| `:P 134` | 133 | 3474 | `ac0f3598-3438-453f-afae-e66090bffce8` | SPK18 | 581947.4264, 6566328.5795, 4.44 | `KK_SPK18.JPG` |
| `:P 135` | 134 | 3480 | `97ac73a6-e30b-4655-838d-c4fd5f700526` | OVK18 | 581948.6092, 6566327.8265, 4.447 | `KK_OVK18.JPG` |
| `:P 136` | 135 | 3486 | `bb6a8983-ea3d-4097-a433-3298fc0439f2` | OVK10 | 581931.019519, 6565997.049168, 15.565888 | `KK_OVK10.JPG` |
| `:P 137` | 136 | 3491 | `3917bcff-1ec4-4309-b317-e67f0bc5e932` | SPK10 | 581930.702262, 6565998.317032, 15.601051 | `KK_SPK10.JPG` |
| `:P 138` | 137 | 3496 | `6406833e-64f2-4306-9696-47fc72eeaa67` | OV21 | 581979.452077, 6566176.163407, 9.711238 | `KK_OVK21.JPG` |
| `:P 139` | 138 | 3501 | `c1d433d7-a105-4586-84ba-52a4b24a1e64` | SP21 | 581978.807745, 6566176.276174, 9.709607 | `KK_SPK21.JPG` |
| `:P 149` | 148 | 3551 | `3d0e15db-da1e-440d-b022-ae2249f2bf5c` | SPK5 | 582065.722279, 6566110.162189, 6.412503 | `KK_SPK5.JPG` |
| `:P 150` | 149 | 3557 | `2d67f094-d480-4a91-9afa-80793fe6637e` | OVK5 | 582066.10812, 6566111.344704, 6.379046 | `KK_OVK5.JPG` |
| `:P 191` | 190 | 3762 | `b221cd5f-0a01-4199-ad7a-58f7cc2cfdad` | SPK11 | 581981.30605, 6566035.496092, 14.748849 | `KK_SPK11.JPG` |
| `:P 192` | 191 | 3767 | `6ad15515-d91f-4be0-ad0b-051b7619fdd0` | OVK11 | 581980.531612, 6566036.782837, 14.677954 | `KK_OVK11.JPG` |
| `:P 397` | 396 | 4803 | `b37dd26d-7919-4587-9a18-66313a1a25d1` | VK10 | 581931.69074, 6565995.013437, 15.918 | `KK_VK10.JPG` |
| `:P 447` | 446 | 5062 | `00c5a4e2-ceae-4478-952a-deab9d61776a` | KG1B | 582149.825381, 6566259.198307, -1.085 | `KK - KG1B.jpg` |
| `:P 448` | 447 | 5067 | `49ae0d2f-eb62-433a-b89c-8e31126eaec0` | KG1C | 582152.792051, 6566259.946507, -0.642901 | `KK - KG1C.jpg` |
| `:P 449` | 448 | 5072 | `cfe8ad17-ac88-46d1-9f77-38483ab90b1f` | KG1F | 582155.116634, 6566256.991117, -1.021204 | `KK - KG1F.jpg` |
| `:P 450` | 449 | 5077 | `4b85b380-42c2-430f-9dae-06556fabb2cf` | KG1D | 582153.135627, 6566257.358194, -0.922 | `KK - KG1D.jpg` |
| `:P 469` | 468 | 5173 | `76d4801c-db1a-455e-bfe1-20a6da3bb071` | KG1A | 582141.051, 6566259.213, -0.12 | `KK - KG1A.jpg` |

## Appendix B. Complete referenced paths and normalized filename set

Every filename is a referenced JPEG-shaped name, not proof that the unavailable asset is a photograph. Matching keys apply NFC then lowercase; raw path spelling remains source evidence. The table is sorted by exact filename.

| Raw full reference path | Extracted filename | Normalized filename key | Referring objects |
| --- | --- | --- | ---: |
| `05-Kum kort\KK_PORFYR\KK - KG1A.jpg` | `KK - KG1A.jpg` | `kk - kg1a.jpg` | 1 |
| `05-Kum kort\KK_PORFYR\KK - KG1B.jpg` | `KK - KG1B.jpg` | `kk - kg1b.jpg` | 1 |
| `05-Kum kort\KK_PORFYR\KK - KG1C.jpg` | `KK - KG1C.jpg` | `kk - kg1c.jpg` | 1 |
| `05-Kum kort\KK_PORFYR\KK - KG1D.jpg` | `KK - KG1D.jpg` | `kk - kg1d.jpg` | 1 |
| `05-Kum kort\KK_PORFYR\KK - KG1F.jpg` | `KK - KG1F.jpg` | `kk - kg1f.jpg` | 1 |
| `Attachments\KK_OVK10.JPG` | `KK_OVK10.JPG` | `kk_ovk10.jpg` | 1 |
| `Attachments\KK_OVK11.JPG` | `KK_OVK11.JPG` | `kk_ovk11.jpg` | 1 |
| `Attachments\KK_OVK12.JPG` | `KK_OVK12.JPG` | `kk_ovk12.jpg` | 1 |
| `Attachments\KK_OVK13.JPG` | `KK_OVK13.JPG` | `kk_ovk13.jpg` | 1 |
| `Attachments\KK_OVK14.JPG` | `KK_OVK14.JPG` | `kk_ovk14.jpg` | 1 |
| `Attachments\KK_OVK17.JPG` | `KK_OVK17.JPG` | `kk_ovk17.jpg` | 1 |
| `Attachments\KK_OVK18.JPG` | `KK_OVK18.JPG` | `kk_ovk18.jpg` | 1 |
| `Attachments\KK_OVK19.JPG` | `KK_OVK19.JPG` | `kk_ovk19.jpg` | 1 |
| `Attachments\KK_OVK2.JPG` | `KK_OVK2.JPG` | `kk_ovk2.jpg` | 1 |
| `Attachments\KK_OVK20.JPG` | `KK_OVK20.JPG` | `kk_ovk20.jpg` | 1 |
| `Attachments\KK_OVK21.JPG` | `KK_OVK21.JPG` | `kk_ovk21.jpg` | 1 |
| `Attachments\KK_OVK3.JPG` | `KK_OVK3.JPG` | `kk_ovk3.jpg` | 1 |
| `Attachments\KK_OVK4.JPG` | `KK_OVK4.JPG` | `kk_ovk4.jpg` | 1 |
| `Attachments\KK_OVK5.JPG` | `KK_OVK5.JPG` | `kk_ovk5.jpg` | 1 |
| `Attachments\KK_OVK6.JPG` | `KK_OVK6.JPG` | `kk_ovk6.jpg` | 1 |
| `Attachments\KK_OVK7.JPG` | `KK_OVK7.JPG` | `kk_ovk7.jpg` | 1 |
| `Attachments\KK_OVK8.JPG` | `KK_OVK8.JPG` | `kk_ovk8.jpg` | 1 |
| `Attachments\KK_OVK9.JPG` | `KK_OVK9.JPG` | `kk_ovk9.jpg` | 1 |
| `Attachments\KK_SP12.JPG` | `KK_SP12.JPG` | `kk_sp12.jpg` | 1 |
| `Attachments\KK_SPK10.JPG` | `KK_SPK10.JPG` | `kk_spk10.jpg` | 1 |
| `Attachments\KK_SPK11.JPG` | `KK_SPK11.JPG` | `kk_spk11.jpg` | 1 |
| `Attachments\KK_SPK13.JPG` | `KK_SPK13.JPG` | `kk_spk13.jpg` | 1 |
| `Attachments\KK_SPK14.JPG` | `KK_SPK14.JPG` | `kk_spk14.jpg` | 1 |
| `Attachments\KK_SPK17.JPG` | `KK_SPK17.JPG` | `kk_spk17.jpg` | 1 |
| `Attachments\KK_SPK18.JPG` | `KK_SPK18.JPG` | `kk_spk18.jpg` | 1 |
| `Attachments\KK_SPK19.JPG` | `KK_SPK19.JPG` | `kk_spk19.jpg` | 1 |
| `Attachments\KK_SPK2.JPG` | `KK_SPK2.JPG` | `kk_spk2.jpg` | 1 |
| `Attachments\KK_SPK20.JPG` | `KK_SPK20.JPG` | `kk_spk20.jpg` | 1 |
| `Attachments\KK_SPK21.JPG` | `KK_SPK21.JPG` | `kk_spk21.jpg` | 1 |
| `Attachments\KK_SPK3.JPG` | `KK_SPK3.JPG` | `kk_spk3.jpg` | 1 |
| `Attachments\KK_SPK4.JPG` | `KK_SPK4.JPG` | `kk_spk4.jpg` | 1 |
| `Attachments\KK_SPK5.JPG` | `KK_SPK5.JPG` | `kk_spk5.jpg` | 1 |
| `Attachments\KK_SPK6.JPG` | `KK_SPK6.JPG` | `kk_spk6.jpg` | 1 |
| `Attachments\KK_SPK7.JPG` | `KK_SPK7.JPG` | `kk_spk7.jpg` | 1 |
| `Attachments\KK_SPK8.JPG` | `KK_SPK8.JPG` | `kk_spk8.jpg` | 1 |
| `Attachments\KK_SPK9.JPG` | `KK_SPK9.JPG` | `kk_spk9.jpg` | 1 |
| `Attachments\KK_SPPK12.JPG` | `KK_SPPK12.JPG` | `kk_sppk12.jpg` | 1 |
| `Attachments\KK_VK1.jpg` | `KK_VK1.jpg` | `kk_vk1.jpg` | 1 |
| `Attachments\KK_VK10.JPG` | `KK_VK10.JPG` | `kk_vk10.jpg` | 1 |
| `Attachments\KK_VK12.JPG` | `KK_VK12.JPG` | `kk_vk12.jpg` | 1 |
| `Attachments\KK_VK14.JPG` | `KK_VK14.JPG` | `kk_vk14.jpg` | 2 |
| `Attachments\KK_VK19.JPG` | `KK_VK19.JPG` | `kk_vk19.jpg` | 1 |
| `Attachments\KK_VK2.JPG` | `KK_VK2.JPG` | `kk_vk2.jpg` | 1 |
| `Attachments\KK_VK3.JPG` | `KK_VK3.JPG` | `kk_vk3.jpg` | 1 |
| `Attachments\KK_VK4.jpg` | `KK_VK4.jpg` | `kk_vk4.jpg` | 1 |
| `Attachments\KK_VK8.JPG` | `KK_VK8.JPG` | `kk_vk8.jpg` | 1 |
| `Attachments\KK_VK_F.JPG` | `KK_VK_F.JPG` | `kk_vk_f.jpg` | 1 |

## Appendix C. All distinct exact raw hyperlink values

The following values use JSON string notation so the delivered trailing space is visible before the closing outer quote and Windows backslashes are unambiguous. JSON `\\` represents one source backslash, and `\"` represents a structural source quote. This is a complete set of 52 values; the `KK_VK14.JPG` value occurs on two objects.

```json
[
  "h:1(link:\"Attachments\\KK_VK_F.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_VK2.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK20.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK20.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK2.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_VK14.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK2.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK17.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK17.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK3.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK7.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK7.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_VK3.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_VK12.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK12.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SP12.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_VK8.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK8.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK8.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK9.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK9.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_VK4.jpg\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK4.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK4.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_VK19.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK19.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK19.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPPK12.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK14.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK14.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK13.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK13.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK3.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_VK1.jpg\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK6.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK6.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK18.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK18.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK10.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK10.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK21.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK21.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK5.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK5.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_SPK11.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_OVK11.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"Attachments\\KK_VK10.JPG\" sign:\"pnstisol\") ",
  "h:1(link:\"05-Kum kort\\KK_PORFYR\\KK - KG1B.jpg\" sign:\"pnstisol\") ",
  "h:1(link:\"05-Kum kort\\KK_PORFYR\\KK - KG1C.jpg\" sign:\"pnstisol\") ",
  "h:1(link:\"05-Kum kort\\KK_PORFYR\\KK - KG1F.jpg\" sign:\"pnstisol\") ",
  "h:1(link:\"05-Kum kort\\KK_PORFYR\\KK - KG1D.jpg\" sign:\"pnstisol\") ",
  "h:1(link:\"05-Kum kort\\KK_PORFYR\\KK - KG1A.jpg\" sign:\"pnstisol\") "
]
```

## 23. Staged implementation plan

**A. Close the real-evidence gaps and extend shared reference evidence.** Verify whether the reported S_HYPERLINK gap is the documented, already-corrected newline/sign case or a remaining failure; capture any remaining failing lexeme. Obtain a real DFOT-bearing GMI with corresponding assets and the missing older attachment inventory. First pin all verified working values and retain historical newline/sign coverage. Extend the existing shared extractor to expose full reference occurrences, raw paths, member identity, and diagnostics while preserving copy presentation. Apply an additional targeted grammar correction only after a failing real variant is understood. No production GMI parsing or validation semantics change is implied by this stage.

**B. Add a generic GMI photo-reference audit/matching helper.** Consume GMIParser output and explicitly copied source lexemes. Audit all objects, produce source-scoped identity/object lookup, references, distributions, and a complete graph. Reuse filename normalization/asset collision checks with a GMI many-to-many policy, leaving GML's stricter position-reference policy intact. Ekenesstokken acceptance expectations are 726 objects, 53 referencing objects, 52 names, and two source objects for `KK_VK14.JPG`.

**C. Add the generic GMI source adapter and association ledger together.** Retain one `kind: 'gmi'` record in layer `spatialSources`, source identity, raw evidence, and owner-scoped matched/unresolved associations. Refactor source attachment/review/pruning so associations are independent of position entries. Explicit source-only application must work; no artificial positional candidates for ordinary objects. Existing FOTO asset ownership and source cancellation guards continue to apply.

**D. Generate DFOT-only position evidence after real validation.** Confirm camera-position interpretation and coordinate comparisons from the new real fixture, then implement strict TYPE/point/CRS/name/identity eligibility. Position entries and candidates reference retained source objects. Support one-to-many and many-to-one candidate evidence without first-wins assignment, overwrite, or automatic priority. This supplied GMI remains an association-only source with zero candidates.

**E. Add `GMI-fil` to the positioning wizard.** Analyse the whole source, show eligible candidates and separate association diagnostics, compare with current/GML/EXIF/manual, choose specific candidate per photo where necessary, summarize, then explicitly apply source associations and selected positions atomically. Offer source-only attachment for meaningful association-only results. Preserve alternatives and provenance.

**F. Expose associations in the selected-photo inspector.** Derive distinct referring objects from the source ledger; show source filename, GUID, TEMA, and actual TYPE/missing state. Show GMI candidate provenance in the existing spatial inspector. Position changes do not remove or reclassify associations.

**G. Add source-bound map/object navigation after the ledger is proven.** Build the small GUID/source-revision lookup, bind the photo GMI source to a matching loaded map layer, and call existing highlight/zoom/inspect mechanisms. No automatic duplicate map-layer import or broad navigation refactor is required.

Stages B/C and association-only work are supported by this fixture. DFOT position release and claims of resolving the reported hyperlink-copy gap remain dependent on their missing real evidence. Implementation is deliberately deferred; this report records the reviewable plan.
