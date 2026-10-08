# Real GMI photo corpus audit and revised implementation plan

Date: 2026-10-08. Repository: `C:\GitHub\gmi-validering-test`; branch `feature/photo-workspace`; committed baseline `b130780 Add photo direction editing`.

## 1. Scope and relationship to the first audit

This report builds on [the Ekenesstokken audit](20261008-gmi-photo-source-audit.md), which remains unchanged. Its corpus is **only** `C:\temp\gmi examples`; Ekenesstokken counts are not added to these totals. This is an audit/planning pass: no production implementation, grammar broadening, positioning changes, map navigation, fixture changes, commits, pushes, or delegated agents. The unrelated `data/usage/aggregates.json` is outside the task and protected by a before/after SHA-256 check.

The corpus strongly supports **hyperlink-centric associations independent of Type**. There are **12 GMI files, 1,386 objects, 197 non-empty S_HYPERLINK values, and 303 link occurrences**. Of those occurrences, 302 target images and one targets only a directory. All 302 image references resolve in reasonable sibling attachment namespaces; the current extractor handles all their visible filename evidence. One directory-only value correctly yields no filename. There is no demonstrated real grammar compatibility failure requiring relaxation.

The larger corpus materially expands the first audit: **65 objects have multiple image references**, up to seven; hyperlinks occur across **13 TEMA values and ten supplied Type values**, as well as empty Type. **95 GUIDs repeat across files**, and two repeat with changed geometry. Folder copies create **103 duplicate-image basename/content groups**. These findings make member-level evidence, source-revision identity, and owner-layer matching essential.

The next milestone should implement **associations only**. Any GMI-derived positioning and map navigation are deferred, including for photo-specific-looking Type values. Type is preserved metadata, never an association eligibility switch.

## 2. Corpus inventory

Recursive inventory: **585 files**, **896,902,159 bytes**, six top-level project/delivery directories and **35 descendant directories**. SHA-256 was computed for every file. There are **543 likely images**, all actually JPEG-signature files; 12 GMI, three GML, 21 PDF, and six `Thumbs.db` files account for the rest.

| Extension, preserving spelling | Files |
| --- | ---: |
| `.jpg` | 500 |
| `.jpeg` | 30 |
| `.JPEG` | 13 |
| `.gmi` | 12 |
| `.gml` | 3 |
| `.pdf` | 21 |
| `.db` | 6 |

No PNG, TIFF, WEBP, standalone TXT/CSV, or other text/export extensions occur. The GMLs are relevant separate photo deliveries; PDFs cover as-built drawings, checklists, and FDV/product documentation. `Thumbs.db` is not an image asset. No PDF is targeted by a GMI hyperlink in this corpus.

The following folder table is an inventory of files directly in each folder, not recursive counts; slash paths are relative to the corpus root. Intermediate parent directories with no direct files are implicit in these paths. Three leaf directories are completely empty, all under `Gipø buss/Anleggsrapport`: `01 - PROSJEKTINFORMASJON`, `05 - KUMKORT`, and `08 - RAPPORTER`.

| Folder | Direct files | Images |
| --- | --- | --- |
| `20260903` | 1 | 0 |
| `20260903/Attachments` | 93 | 92 |
| `20260928/GMI-leveranse` | 1 | 0 |
| `20260928/GMI-leveranse/Attachments` | 4 | 4 |
| `20260928/GML-leveranse` | 1 | 0 |
| `20260928/GML-leveranse/Attachments` | 40 | 40 |
| `Asbuilt VA ledninger 20260825/Asbuilt VA ledninger 20260825` | 1 | 0 |
| `Asbuilt VA ledninger 20260825/Asbuilt VA ledninger 20260825/Attachments` | 64 | 63 |
| `Gipø buss/Anleggsrapport/02 - ASBUILT TEGNINGER` | 10 | 0 |
| `Gipø buss/Anleggsrapport/03 - INNMÅLINGER` | 3 | 0 |
| `Gipø buss/Anleggsrapport/03 - INNMÅLINGER/Attachments` | 32 | 31 |
| `Gipø buss/Anleggsrapport/06 - KUMBILDER` | 9 | 9 |
| `Gipø buss/Anleggsrapport/07 - ANLEGGSBILDER` | 81 | 80 |
| `Gipø buss/Anleggsrapport/07 - ANLEGGSBILDER/20260316_GML_Eksport` | 1 | 0 |
| `Gipø buss/Anleggsrapport/07 - ANLEGGSBILDER/20260316_GML_Eksport/Attachments` | 78 | 77 |
| `Gipø buss/Anleggsrapport/07 - ANLEGGSBILDER/20260316_GML_Eksport/til import/Attachments` | 68 | 68 |
| `Gipø buss/Anleggsrapport/07 - ANLEGGSBILDER/20260316_GML_Eksport/til import` | 1 | 0 |
| `Gipø buss/Anleggsrapport/10 - SJEKKLISTER OG KONTROLLSKJEMA` | 2 | 0 |
| `Gipø buss/Anleggsrapport/9 - FDV PRODUKTDATABLADER` | 9 | 0 |
| `Gipø/20260213/Attachments` | 16 | 15 |
| `Gipø/20260213` | 1 | 0 |
| `Gipø/20260218/Attachments` | 18 | 18 |
| `Gipø/20260218` | 1 | 0 |
| `Gipø/20260227/Attachments` | 16 | 16 |
| `Gipø/20260227` | 1 | 0 |
| `Skogveien-Skoleveien/Attachments` | 30 | 30 |
| `Skogveien-Skoleveien` | 3 | 0 |

Reasonable GMI namespaces are the **eight distinct sibling `Attachments` directories** listed in section 11. Some directories are shared by several GMIs in the same delivery. A source with no hyperlinks does not acquire associations just because another GMI shares its folder.

Separate photo exports:

| GML relative path | Features / references | GMI basename overlap | Interpretation |
| --- | ---: | ---: | --- |
| `20260928/GML-leveranse/20260928_TorkoppPS_anleggsbilder.gml` | 40 / 40 | 0 | Separate from the four GMI delivery images |
| `Gipø buss/Anleggsrapport/07 - ANLEGGSBILDER/20260316_GML_Eksport/20260316_Gipo-buss_anleggsbilder.gml` | 77 / 77 | 21 | Copies/exports of some images also present with the GMI |
| `Gipø buss/Anleggsrapport/07 - ANLEGGSBILDER/20260316_GML_Eksport/til import/Gipo-buss_til-import.gml` | 68 / 68 | 21 | A separate import subset, not an automatic GMI namespace |

The namespace-aware GML inspection counted photo reference text only; it did not interpret positions. All three have unique reference paths within their own file. Similar project names or spatial proximity were not used to match images.

Image copies: **103 normalized duplicate-basename groups containing 310 physical files**. These are also **103 SHA-256 duplicate groups containing 310 files**, with 207 extra physical copies. There are **336 distinct JPEG content hashes** and 378 distinct file hashes overall. All duplicates are images; no GMI is byte-identical to another. Every duplicate image-name group has identical content, and no same-hash group has different filename spelling. Observed same-filename/different-content groups = **0**; same-content/different-name groups = **0**. These negative results do not justify merging imported assets by filename or hash.

## 3. Per-GMI summary

The G01–G12 labels below are audit labels only, not product source identity. They follow the inventory's relative-path order. Every GMI was decoded with production `decodeGmiBytes` and parsed by production `GMIParser`.

| ID | Relative GMI path | Bytes | SHA-256 |
| --- | --- | --- | --- |
| G01 | `20260903/1200 Asbuild VA Leveranse Lerkeveien.gmi` | 81807 | `69bf7389c18dcb49dbffe43a49d56bc2cf5ca0f40ad3dc1977fb22dd5d42dadf` |
| G02 | `20260928/GMI-leveranse/20260928_TørkoppPS_Som-bygget-VA.gmi` | 29220 | `88ea75aadc4eb84b11f86720fd510398953ea4eed795d0e938410c78e45b2704` |
| G03 | `Asbuilt VA ledninger 20260825/Asbuilt VA ledninger 20260825/Asbuilt VA ledninger 20260825.gmi` | 45635 | `518e224dca95a425028e98f2071db30e21ad710f7df189251a5dc41d6ddc46d5` |
| G04 | `Gipø buss/Anleggsrapport/03 - INNMÅLINGER/As-built VA - Gipø Buss.gmi` | 18920 | `5601973b2e150825bc505f721525a0bc0ba496d0ccb1ec86747031ad7f3e7ca7` |
| G05 | `Gipø buss/Anleggsrapport/03 - INNMÅLINGER/As-built VA - Stikkledning - Gipø-buss.gmi` | 18861 | `e1cbb11d215e2848da2f0379e0340a6d7ccd3845734c2b9a57e9158d514addc3` |
| G06 | `Gipø buss/Anleggsrapport/03 - INNMÅLINGER/Isolerte strekninger.gmi` | 1305 | `1b183d0fc697ac5a583f0fd8876efdc35d3d05a0c748234bb55fb216a49cdb13` |
| G07 | `Gipø/20260213/Gipø_sombygget.gmi` | 13808 | `8249052fd87a1015d6f7d59641a1be76b1f89d31862d215932c000a855afc195` |
| G08 | `Gipø/20260218/Gipø_sombygget.gmi` | 15473 | `0c69b8a87f8eb8638a12402e8e05b44ea39b142ca7d9285c3c5dda1e942bdcac` |
| G09 | `Gipø/20260227/Gipø_sombygget_rev2.gmi` | 15116 | `3de7bd26a5ed6f6bfca4c5e6bb00bc81ccac4722f8d93749ff0261fe6d5cae3e` |
| G10 | `Skogveien-Skoleveien/GMI-eksport-alle-pkt_Skogveien-Skoleveien.gmi` | 64344 | `7441ddfbe786d7c14ceb251346f1a75c03a5efc6a92ab0cc09422d1302952d5b` |
| G11 | `Skogveien-Skoleveien/Som_bygget_VA_Skogvn-Skolevn.gmi` | 76841 | `4f98ac801c616273c7c68df9935be27fd07a8048850a04b086c7ddbe1aed5cc3` |
| G12 | `Skogveien-Skoleveien/skogveien-skoleveien_va-FORAKONSTR-GRØKONSTR.gmi` | 2483 | `126712fc8496d570f60045cdf529b90f2cdb1248b784688ed3208e46eeec88f0` |

In every row: decoding succeeds, parser warnings = **0**, parser errors = **0**, missing GUIDs = **0**, malformed GUIDs = **0**, and duplicate GUID groups within the file = **0**. All files start with `[GMIFILE_ASCII]` without BOM. Eleven contain non-ASCII bytes and fail a diagnostic strict UTF-8 decode; G06 is ASCII-only. Canonical ISO-8859-1 decoding produces zero replacement characters. There is no evidence here to introduce encoding autodetection or change the upload decoder.

Only G01, G02, G10, G11, and G12 declare PRODUCER: respectively `Arnadal Anlegg AS`, `Haraldstad`, `Haraldstad`, `Haraldstad`, and `Paul Bennett AS`. All files declare GMI version 2 / file type TER. Similar syntax does not identify a particular exporter application; undeclared exporter identity remains unknown.

| GMI | Objects | Points | Lines | GUIDs | H objects | Link members | Valid members | Unique names |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G01 | 261 | 201 | 60 | 261 | 46 | 95 | 94 | 92 |
| G02 | 84 | 69 | 15 | 84 | 4 | 4 | 4 | 4 |
| G03 | 167 | 131 | 36 | 167 | 63 | 63 | 63 | 63 |
| G04 | 44 | 35 | 9 | 44 | 15 | 31 | 31 | 31 |
| G05 | 45 | 35 | 10 | 45 | 15 | 31 | 31 | 31 |
| G06 | 3 | 0 | 3 | 3 | 0 | 0 | 0 | 0 |
| G07 | 40 | 25 | 15 | 40 | 10 | 15 | 15 | 15 |
| G08 | 45 | 27 | 18 | 45 | 12 | 18 | 18 | 18 |
| G09 | 44 | 26 | 18 | 44 | 11 | 16 | 16 | 16 |
| G10 | 401 | 401 | 0 | 401 | 0 | 0 | 0 | 0 |
| G11 | 245 | 185 | 60 | 245 | 21 | 30 | 30 | 30 |
| G12 | 7 | 7 | 0 | 7 | 0 | 0 | 0 | 0 |

Definitions: H objects = objects with non-empty S_HYPERLINK; members = `link` occurrences, including the directory-only target; names = unique valid normalized filenames within that GMI. `S_FCODE` is the delivered TEMA field and `Type` the delivered Type field; lines generally have no Type field. Both point and line collections were inspected without Type filtering.

All-object per-file distributions:

| GMI | All-object S_FCODE distribution | All-object Type distribution |
| --- | --- | --- |
| G01 | AF: 2; ANB: 8; DIV: 98; FORAKONSTR: 1; GRN: 24; GRØKONSTR: 6; KRN: 8; KUM: 12; LOK: 27; OV: 28; SAN: 3; SLS: 2; SLU: 5; SP: 14; TOP: 7; VL: 16 | (empty): 99; (field absent): 60; DB15: 23; DB22: 10; DB30: 43; DB45: 11; DOVG: 9; GRØSTENG06: 1; GRØSTENG10: 5 |
| G02 | DIV: 57; DR: 3; DRO: 2; GRN: 1; KRN: 1; KUM: 3; LOK: 4; PSP: 1; SP: 9; SPP: 1; VL: 2 | (empty): 10; (field absent): 15; DAN: 2; DB11: 12; DB22: 14; DB30: 16; DB45: 4; DB90: 1; DOVG: 1; DST: 9 |
| G03 | ANB: 4; DIV: 106; GRN: 1; GRØKONSTR: 3; INR: 2; KRN: 4; KUM: 4; LOK: 3; OV: 17; SLU: 1; SP: 1; TOP: 3; VL: 18 | (empty): 77; (field absent): 36; DB11: 1; DB15: 4; DB30: 5; DB45: 4; DB90: 1; DFOT: 27; DOVG: 9; GRØSTENG06: 3 |
| G04 | DIV: 19; GRN: 3; KRN: 4; KUM: 4; LOK: 4; SP: 2; SPP: 6; TOP: 1; VL: 1 | (empty): 25; (field absent): 9; DB30: 3; DB45: 2; DOVG: 4; DST: 1 |
| G05 | (missing): 1; DIV: 19; GRN: 3; KRN: 4; KUM: 4; LOK: 4; SP: 2; SPP: 6; TOP: 1; VL: 1 | (empty): 25; (field absent): 10; DB30: 3; DB45: 2; DOVG: 4; DST: 1 |
| G06 | (missing): 3 | (field absent): 3 |
| G07 | DIV: 2; GRN: 9; KUM: 7; LOK: 7; OV: 8; SP: 7 | (empty): 23; (field absent): 15; DOVG: 2 |
| G08 | DIV: 3; GRN: 10; KUM: 7; LOK: 7; OV: 8; SP: 7; SPP: 1; VL: 2 | (empty): 24; (field absent): 18; DFOT: 1; DOVG: 2 |
| G09 | DIV: 2; GRN: 10; KUM: 7; LOK: 7; OV: 8; SP: 7; SPP: 1; VL: 2 | (empty): 24; (field absent): 18; DOVG: 2 |
| G10 | (missing): 401 | (empty): 401 |
| G11 | ANB: 8; DIV: 108; GRN: 28; KUM: 10; LOK: 18; OV: 30; SAN: 1; SLS: 5; SLU: 7; SP: 20; VL: 10 | (empty): 76; (field absent): 60; DB11: 16; DB15: 11; DB22: 18; DB30: 17; DB45: 14; DOVG: 9; DST: 17; FORAKLOSS: 4; GRØSTENG06: 3 |
| G12 | FORAKONSTR: 4; GRØKONSTR: 3 | FORAKLOSS: 4; GRØSTENG06: 3 |

G10 has 401 objects whose S_FCODE is genuinely empty in raw fields, despite source S_OBJID names such as `250225_OV_315/250_OVERGANG_001`. G06 has three empty S_FCODE values, and G05 one empty S_FCODE line, for **405 empty TEMA values overall**. These are source omissions, not an audit alias/mapping failure. Do not invent TEMA from object names.

## 4. Aggregate object and GUID statistics

| Measure | Count |
| --- | ---: |
| Objects, counted per source file | 1,386 |
| Points | 1,142 |
| Lines | 244 |
| Source GUID occurrences | 1,386 |
| Distinct GUID strings, exact/NFC-case keys | 1,251 |
| Missing / malformed GUIDs | 0 / 0 |
| Within-file duplicate GUID groups | 0 |
| Cross-file repeated GUID groups | 95 |
| Occurrences in those repeated groups | 230 |
| Extra occurrences beyond one per distinct GUID | 135 |

All GUIDs have UUID `8-4-4-4-12` spelling. GUID is a separate source `GUID ...` property retained as parser `object.guid`, not a field in attributes. There is no basis for globally deduplicating the 1,386 objects to 1,251 product objects.

All-object distributions:

| Field | Value distribution |
| --- | --- |
| S_FCODE | AF: 2; ANB: 20; DIV: 414; DR: 3; DRO: 2; FORAKONSTR: 5; GRN: 89; GRØKONSTR: 12; INR: 2; KRN: 21; KUM: 58; LOK: 81; OV: 99; PSP: 1; SAN: 4; SLS: 7; SLU: 13; SP: 69; SPP: 15; TOP: 12; VL: 52; (empty): 405 |
| Type | (empty): 784; (field absent): 244; DAN: 2; DB11: 29; DB15: 38; DB22: 42; DB30: 87; DB45: 37; DB90: 2; DFOT: 28; DOVG: 42; DST: 28; FORAKLOSS: 8; GRØSTENG06: 10; GRØSTENG10: 5 |

Raw reconciliation covered every object, every `_FIELDVALUES` lexeme, GUID, and coordinate array. Raw record counts match parser collection counts, every field row has the expected field-definition arity, and all 303 raw `link:"` tokens map to the audited hyperlink slots. There are **zero reconciliation discrepancies**, no observed semicolons inside member text, and no hidden/multiline hyperlink continuation lost before extraction. Field whitespace is preserved through the private `GMI_SOURCE_LEXEMES` symbol even though public attributes are trimmed. No production parser semantics were changed.

## 5. Aggregate hyperlink statistics

| Measure | Count |
| --- | ---: |
| Non-empty S_HYPERLINK field values | 197 |
| Distinct exact raw values | 176 |
| Link wrappers / link members | 303 / 303 |
| Sign members | 222 |
| Other member keys | 0 |
| Image-filename target occurrences | 302 |
| Directory-only target occurrences | 1 |
| Unique exact filename spellings across corpus | 238 |
| Unique NFC/lowercase filename keys across corpus | 238 |
| Sum of source-scoped distinct filename counts | 300 |
| Objects with more than one image filename | 65 |
| Maximum image filenames on one object | 7 |
| Exact raw-value extra occurrences across files | 21 |
| Identical raw values repeated inside one file | 0 |

The 21 repeated raw-value occurrences are cross-file evidence, not a reason to discard object/source relationships. Within-file sharing of a filename can occur in different complete wrapper values.

All 197 values have one trailing ASCII U+0020 space in the raw lexeme, no leading space, and same-line grammar. The public parser attributes trim that trailing space. Members are double-quoted; each wrapper contains exactly one link and optionally one sign, with link first. Multiple references are represented as **separate consecutive `h:1(...) h:2(...) ...` wrappers**, not several link members inside one wrapper.

Path and target observations:

| Form | Occurrences |
| --- | ---: |
| `Attachments\<filename>` | 271 valid image references |
| `Attachments\` | 1 directory-only invalid target |
| `Pictures\Kum\<filename>` | 8 valid image references |
| Bare filename in quoted `link` | 23 valid image references |
| `.jpg` target extension | 260 |
| `.jpeg` target extension | 30 |
| `.JPEG` target extension | 12 |

There are eight references with filename spaces and 16 with non-ASCII filenames, representing nine unique non-ASCII names. Sign metadata also includes Norwegian letters. There is no distinct-name NFC/case collision. No forward-slash reference, URL, drive/UNC/absolute path, percent encoding, comma separator, semicolon separator, newline, single-quote string, escaped-quote member value, or additional metadata member is observed. In the directory-only target the backslash immediately before its closing quote is a Windows separator; it is not evidence for an escape grammar.

## 6. Real hyperlink grammar families

For reproducibility, a **family** here means an exact public field shape after replacing quoted member contents by `VALUE`, preserving wrapper numbers, member ordering, inter-wrapper whitespace, and sign presence. This produces **12 real families**. The underlying wrapper productions are only two: `h:n(link:"...")` and `h:n(link:"..." sign:"...")`, arranged in sequences of one to seven. The observed `n` values run sequentially from 1 on each value; they are wrapper indices, not evidence of different GMI versions.

| Family | Field shape | Values | Source files |
| --- | --- | --- | --- |
| F1 | `h:1(link:"VALUE" sign:"VALUE")` | 66 | G01, G02, G03, G04, G05, G07, G08, G09, G11 |
| F2 | `h:1(link:"VALUE") h:2(link:"VALUE" sign:"VALUE") h:3(link:"VALUE" sign:"VALUE") h:4(link:"VALUE" sign:"VALUE") h:5(link:"VALUE" sign:"VALUE") h:6(link:"VALUE" sign:"VALUE")` | 2 | G01 |
| F3 | `h:1(link:"VALUE" sign:"VALUE") h:2(link:"VALUE" sign:"VALUE")` | 43 | G01, G04, G05, G07, G08, G09, G11 |
| F4 | `h:1(link:"VALUE" sign:"VALUE") h:2(link:"VALUE" sign:"VALUE") h:3(link:"VALUE" sign:"VALUE") h:4(link:"VALUE" sign:"VALUE")` | 5 | G01 |
| F5 | `h:1(link:"VALUE") h:2(link:"VALUE" sign:"VALUE") h:3(link:"VALUE" sign:"VALUE")` | 1 | G01 |
| F6 | `h:1(link:"VALUE") h:2(link:"VALUE" sign:"VALUE")` | 4 | G01 |
| F7 | `h:1(link:"VALUE")` | 66 | G01, G03 |
| F8 | `h:1(link:"VALUE" sign:"VALUE") h:2(link:"VALUE" sign:"VALUE") h:3(link:"VALUE" sign:"VALUE")` | 2 | G01 |
| F9 | `h:1(link:"VALUE") h:2(link:"VALUE")` | 2 | G01 |
| F10 | `h:1(link:"VALUE") h:2(link:"VALUE") h:3(link:"VALUE" sign:"VALUE")` | 2 | G01 |
| F11 | `h:1(link:"VALUE" sign:"VALUE") h:2(link:"VALUE" sign:"VALUE") h:3(link:"VALUE" sign:"VALUE") h:4(link:"VALUE" sign:"VALUE") h:5(link:"VALUE" sign:"VALUE") h:6(link:"VALUE" sign:"VALUE")` | 2 | G04, G05 |
| F12 | `h:1(link:"VALUE" sign:"VALUE") h:2(link:"VALUE" sign:"VALUE") h:3(link:"VALUE" sign:"VALUE") h:4(link:"VALUE" sign:"VALUE") h:5(link:"VALUE" sign:"VALUE") h:6(link:"VALUE" sign:"VALUE") h:7(link:"VALUE" sign:"VALUE")` | 2 | G04, G05 |

Every representative below is an **exact raw source value**, expressed as a JSON string so the trailing space and single source backslashes are unambiguous. The listed GUID and parser identity resolve back to the specific source object. Examples are actual observed fields, not synthetic combinations.

F1: G01, point parser ID 1, index 0, record line 684, GUID `f6acd637-4860-4c34-8402-dfc43eb3911b`; output 1 filename(s).

```json
"h:1(link:\"Attachments\\2026-02-20-14-34-42_30abbe330410e94e249febb4949eb7_KG1._.jpg\" sign:\"GustafHerenius\") "
```

F2: G01, point parser ID 4, index 3, record line 699, GUID `5388b176-ee1f-40fd-a468-924930a90117`; output 6 filename(s).

```json
"h:1(link:\"Attachments\\425MM.1_20260218_1330_01.jpg\") h:2(link:\"Attachments\\2026-02-20-14-34-37_069476da7f24600fd1bb79b8309628_KG1._.jpg\" sign:\"GustafHerenius\") h:3(link:\"Attachments\\2026-02-20-14-34-35_fa5f4e173494affa27a1fe9fe41e41_KG1._.jpg\" sign:\"GustafHerenius\") h:4(link:\"Attachments\\2026-02-20-14-34-34_44d9e13ccc02488c6ccc9b44317b24_KG1._.jpg\" sign:\"GustafHerenius\") h:5(link:\"Attachments\\20260826dp10_073154_LOK.jpg\" sign:\"DanielPedersen\") h:6(link:\"Attachments\\20260826dp10_073154_LOK_1.jpg\" sign:\"DanielPedersen\") "
```

F3: G01, point parser ID 21, index 20, record line 785, GUID `a7545b76-0d72-4f9f-b7de-c45fdcf0e72f`; output 2 filename(s).

```json
"h:1(link:\"Attachments\\bfba5458120ee34bdbef05b9b38b48.jpg\" sign:\"GustafHerenius\") h:2(link:\"Attachments\\8a263df76a73ee86a7246ef7d6426f.jpg\" sign:\"GustafHerenius\") "
```

F4: G01, point parser ID 22, index 21, record line 790, GUID `cf6a001b-89ce-43a8-9450-bfbb97ada492`; output 4 filename(s).

```json
"h:1(link:\"Attachments\\2026-02-20-14-34-36_f1ea8a41a3e3fb77de80703e30920e_KG1._.jpg\" sign:\"GustafHerenius\") h:2(link:\"Attachments\\20260826dp11_073417_LOK.jpg\" sign:\"DanielPedersen\") h:3(link:\"Attachments\\20260826dp11_073417_LOK_1.jpg\" sign:\"DanielPedersen\") h:4(link:\"Attachments\\IMG_20260901_072121.jpg\" sign:\"DanielPedersen\") "
```

F5: G01, point parser ID 32, index 31, record line 840, GUID `80c53034-5edf-4756-aab0-1f00b08f0524`; output 3 filename(s).

```json
"h:1(link:\"Attachments\\ANBMUFFE. LERKEVN 16_20260305_1356_01.jpg\") h:2(link:\"Attachments\\fbbe9d9b72c8dbff3f08db068f859a.jpg\" sign:\"GustafHerenius\") h:3(link:\"Attachments\\74aac1d5cbcca57a42b9320c915914.jpg\" sign:\"GustafHerenius\") "
```

F6: G01, point parser ID 34, index 33, record line 850, GUID `f7213e96-a0b4-4355-ab47-c353a54e8f33`; output 2 filename(s).

```json
"h:1(link:\"Attachments\\LERKEVN 16_20260309_1413_01.jpg\") h:2(link:\"Attachments\\4e92648a7cc3c14480f266cfdd404b.jpg\" sign:\"GustafHerenius\") "
```

F7: G01, point parser ID 44, index 43, record line 901, GUID `230c62fb-efe7-426b-822d-df6777e348ea`; output 1 filename(s).

```json
"h:1(link:\"Attachments\\GRUSPROPP.LERKEVN15_20260317_1240_01.jpg\") "
```

F8: G01, point parser ID 137, index 136, record line 1368, GUID `3f9748c5-6ada-4f29-a8ad-557f5b8efec1`; output 3 filename(s).

```json
"h:1(link:\"Attachments\\20260826dp42_084806_LOK_1.jpg\" sign:\"DanielPedersen\") h:2(link:\"Attachments\\20260826dp42_084806_LOK.jpg\" sign:\"DanielPedersen\") h:3(link:\"Attachments\\IMG_20260901_072851.jpg\" sign:\"DanielPedersen\") "
```

F9: G01, point parser ID 164, index 163, record line 1504, GUID `e6bb0810-6970-4589-8a9e-e81c53dce024`; output 2 filename(s).

```json
"h:1(link:\"Attachments\\20260826dp14_074511_SLU.jpg\") h:2(link:\"Attachments\\20260826dp14_074511_SLU_1.jpg\") "
```

F10: G01, point parser ID 169, index 168, record line 1529, GUID `f91f2517-29a2-4bc4-8a0d-2a2ef9d2a452`; output 3 filename(s).

```json
"h:1(link:\"Attachments\\20260826dp21_080007_KUM.jpg\") h:2(link:\"Attachments\\20260826dp21_080007_KUM_1.jpg\") h:3(link:\"Attachments\\IMG_20260901_072341.jpg\" sign:\"DanielPedersen\") "
```

F11: G04, point parser ID 186, index 13, record line 278, GUID `29fbb3c0-beb5-414a-8d92-cdbe51e0c12e`; output 6 filename(s).

```json
"h:1(link:\"Attachments\\2025-11-21-12-56-57_7729aa7e88b23961725358074f09cc.jpg\" sign:\"Edvard\") h:2(link:\"Attachments\\2025-11-24-14-18-19_691298b99f44bfece0aaf728cc8289.jpg\" sign:\"Edvard\") h:3(link:\"Attachments\\2025-11-24-14-18-22_3a20c4240df504c5fbde1fbcb2f586.jpg\" sign:\"Edvard\") h:4(link:\"Attachments\\2025-11-24-14-18-24_6bc0128e47d1aa92125a33e8e4f542.jpg\" sign:\"Edvard\") h:5(link:\"Attachments\\SPK1(1).jpg\" sign:\"Edvard\") h:6(link:\"Attachments\\SPK1.JPEG\" sign:\"Edvard\") "
```

F12: G04, point parser ID 257, index 18, record line 303, GUID `ef536e8a-9b62-468f-bdf5-c033950a2ec2`; output 7 filename(s).

```json
"h:1(link:\"Attachments\\2025-11-21-12-57-02_344657d32243b419fedbc3bd386759.jpg\" sign:\"Edvard\") h:2(link:\"Attachments\\2025-11-21-12-57-06_5a33100c50c7af6f6b508fae003872.jpg\" sign:\"Edvard\") h:3(link:\"Attachments\\2025-11-21-12-57-08_0be69e2872ff2b426be6e8a2fee9d5.jpg\" sign:\"Edvard\") h:4(link:\"Attachments\\2025-11-21-12-57-12_be3a83aea4cbb2c4820e553c64c5d0.jpg\" sign:\"Edvard\") h:5(link:\"Attachments\\2025-11-21-12-57-16_260fb4ce90d7f81039795f96ee1f60.jpg\" sign:\"Edvard\") h:6(link:\"Attachments\\64320(1).jpg\" sign:\"Edvard\") h:7(link:\"Attachments\\64320.JPEG\" sign:\"Edvard\") "
```

Path examples supplement the field-shape families: G05 stores a quoted bare filename such as `2025-12-04-14-52-46_49c84a82b578be35ee8f401eb25079.jpg`, and also `Pictures\Kum\SPK1.JPEG`; G04 stores those images under `Attachments\`. All three forms work with the current shared extractor. There is no requirement that a link begin with `Attachments`.

## 7. Production extractor compatibility

The audit ran [`extractHyperlinkFilenames` and `extractHyperlinkSourceParts`](../../src/lib/hyperlinkFilenames.mjs) on every non-empty public attribute and raw source lexeme. Outputs are identical on trimmed and raw input, and concatenating source-part text reconstructs the raw lexeme exactly.

| Field-value outcome | Values |
| --- | ---: |
| Complete extraction of all visible valid filename targets | 196 |
| No filename output | 1 |
| Partial extraction of valid filename targets | 0 |
| Incorrect basename / lost valid target | 0 |
| Malformed wrapper grammar | 0 |

The sole zero-output value:

```json
"h:1(link:\"Attachments\\\") "
```

Source: G01, `20260903/1200 Asbuild VA Leveranse Lerkeveien.gmi`; raw record starts at **line 1489**; point parser ID **161**, zero-based point index **160**, GUID **`85382fb1-14ac-4834-8939-6595a59dc5f0`**, TEMA **LOK**, Type empty. Public attribute is exactly `h:1(link:"Attachments\")`; production extractor output is **`[]`**. Visible interpretation: a link to the Attachments directory, **no filename supplied**. Expected filename output is also **`[]`**. It should remain an unresolved invalid target with `missing-filename`/`directory-target` diagnostic, never become a file named `Attachments` or a match to an arbitrary image in that folder.

Thus the literal success/no-output counts are **196 / 1**, while valid-image-reference compatibility is **302 / 302 occurrences**, with **zero real grammar bugs demonstrated**. Counting the empty directory target as a grammar failure would encourage an unsafe extractor change. All failure/no-output cases are listed above; there are no additional cases to quote.

The [historical correction report](20261005-photo-filename-copy-correction.md) recorded newline-separated sign metadata (`sign:"NOSEVIE"`) previously preventing whole-wrapper extraction. That named quoted metadata grammar is already supported on this baseline and covered by existing tests. This corpus's six G03 metadata references use **`sign:"NOSEVVIE"`**, a different literal spelling; sign content must remain uninterpreted metadata, with no hard-coded account/sign suffix. No newline-separated value occurs in this corpus.

Current presentation-level exact-filename deduplication removes **zero occurrences here**, because links on a single object have distinct filenames. It would still be unsuitable as a canonical association ledger if two members named the same basename through different paths, or if the same member repeated. `extractHyperlinkSourceParts` returns presentation slices and action filenames, not structured full paths, wrapper/member occurrence identity, or parse diagnostics. Source order, metadata, and raw spans must survive even when the copy UI deduplicates actions.

Minimum shared API addition: expose validated wrapper/member occurrences with raw value, link path, derived basename, wrapper ordinal/number, member ordinal, character offsets, and target/grammar diagnostics; derive both existing presentation APIs from that shared representation. Do not create a second production GMI-specific regex parser. Keep malformed-wrapper rejection and the directory-only rejection; no production grammar broadening is justified by this corpus.

## 8. Hyperlink-bearing TEMA / Type / geometry distributions

| Field | Value distribution |
| --- | --- |
| S_FCODE | ANB: 5; DIV: 67; FORAKONSTR: 1; GRN: 22; GRØKONSTR: 4; INR: 1; KRN: 5; KUM: 50; LOK: 21; SAN: 4; SLS: 2; SLU: 5; TOP: 10 |
| Type | (empty): 147; DB11: 1; DB15: 1; DB22: 3; DB30: 3; DB45: 3; DFOT: 28; DOVG: 5; DST: 2; GRØSTENG06: 1; GRØSTENG10: 3 |
| Geometry | point: 197 |

The tables include the one LOK directory-only value among 197 non-empty fields. **196 objects have valid image targets**, spanning the same 13 TEMA groups because other LOK objects have valid targets. All 197 are point records with one source XYZ coordinate; zero of 244 line objects has a hyperlink. This is a corpus observation, **not a future restriction to points**: association creation should inspect and support both geometry collections.

Per-file distributions for non-empty fields:

| GMI | S_FCODE on non-empty fields | Type on non-empty fields | Points / lines |
| --- | --- | --- | --- |
| G01 | ANB: 2; DIV: 4; FORAKONSTR: 1; GRN: 5; GRØKONSTR: 4; KUM: 12; LOK: 1; SAN: 3; SLS: 2; SLU: 5; TOP: 7 | (empty): 38; DB22: 3; DB30: 1; GRØSTENG06: 1; GRØSTENG10: 3 | 46 / 0 |
| G02 | KRN: 1; KUM: 3 | (empty): 4 | 4 / 0 |
| G03 | ANB: 3; DIV: 50; INR: 1; KRN: 2; KUM: 2; LOK: 2; TOP: 3 | (empty): 28; DB11: 1; DB15: 1; DB30: 2; DB45: 1; DFOT: 27; DOVG: 3 | 63 / 0 |
| G04 | DIV: 6; GRN: 3; KRN: 1; KUM: 1; LOK: 4 | (empty): 12; DB45: 1; DOVG: 1; DST: 1 | 15 / 0 |
| G05 | DIV: 6; GRN: 3; KRN: 1; KUM: 1; LOK: 4 | (empty): 12; DB45: 1; DOVG: 1; DST: 1 | 15 / 0 |
| G06 | — | — | 0 / 0 |
| G07 | GRN: 3; KUM: 7 | (empty): 10 | 10 / 0 |
| G08 | DIV: 1; GRN: 4; KUM: 7 | (empty): 11; DFOT: 1 | 12 / 0 |
| G09 | GRN: 4; KUM: 7 | (empty): 11 | 11 / 0 |
| G10 | — | — | 0 / 0 |
| G11 | KUM: 10; LOK: 10; SAN: 1 | (empty): 21 | 21 / 0 |
| G12 | — | — | 0 / 0 |

Of the 197 objects, **147 have empty Type** and 50 have a supplied Type, across ten values. DFOT is simply one of those values: 27 instances in G03 and one in G08, carrying 29 image-reference occurrences overall. In G03 it accompanies TEMA DIV on 26 objects and TOP on one; in G08 it accompanies DIV and two links. Its hyperlink syntax is ordinary shared syntax used by other objects. No separate DFOT association adapter or source is needed.

**Validated rule:** any object with a validated S_HYPERLINK image target may produce an association, independent of Type, TEMA, or geometry. Missing Type/TEMA must not erase valid source evidence. Identity and filename-resolution conflicts are handled independently. No surveyed coordinate was compared with EXIF or used to infer a camera position.

## 9. Object → reference graph

Graph counts use distinct valid filenames per object; raw member occurrences remain separately retained. The directory-only value contributes zero valid image edges.

| Distinct valid image filenames on an object | Objects |
| --- | ---: |
| 0 | 1,190 |
| 1 | 131 |
| 2 | 49 |
| 3 | 5 |
| 4 | 5 |
| 6 | 4 |
| 7 | 2 |

No five-image object is observed. Of the 1,190 zero-edge objects, 1,189 have no non-empty S_HYPERLINK and one has only the directory target. Total multi-image objects = **65**. There are 302 valid object/reference occurrences, with no repeated link on the same object in this corpus.

| GMI | Zero filenames | One filename | Multiple filenames | Max filenames | Names with one object | Names with multiple objects | Max objects/name |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G01 | 216 | 19 | 26 | 6 | 90 | 2 | 2 |
| G02 | 80 | 4 | 0 | 1 | 4 | 0 | 1 |
| G03 | 104 | 63 | 0 | 1 | 63 | 0 | 1 |
| G04 | 29 | 8 | 7 | 7 | 31 | 0 | 1 |
| G05 | 30 | 8 | 7 | 7 | 31 | 0 | 1 |
| G06 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| G07 | 30 | 5 | 5 | 2 | 15 | 0 | 1 |
| G08 | 33 | 6 | 6 | 2 | 18 | 0 | 1 |
| G09 | 33 | 6 | 5 | 2 | 16 | 0 | 1 |
| G10 | 401 | 0 | 0 | 0 | 0 | 0 | 0 |
| G11 | 224 | 12 | 9 | 2 | 30 | 0 | 1 |
| G12 | 7 | 0 | 0 | 0 | 0 | 0 | 0 |

Concrete seven-image example: G04 `:P 257`, point index **18**, GUID **`ef536e8a-9b62-468f-bdf5-c033950a2ec2`**, TEMA LOK, Type empty. It references these seven images:

```text
Attachments\2025-11-21-12-57-02_344657d32243b419fedbc3bd386759.jpg
Attachments\2025-11-21-12-57-06_5a33100c50c7af6f6b508fae003872.jpg
Attachments\2025-11-21-12-57-08_0be69e2872ff2b426be6e8a2fee9d5.jpg
Attachments\2025-11-21-12-57-12_be3a83aea4cbb2c4820e553c64c5d0.jpg
Attachments\2025-11-21-12-57-16_260fb4ce90d7f81039795f96ee1f60.jpg
Attachments\64320(1).jpg
Attachments\64320.JPEG
```

G05 has the same source GUID and the same seven basenames, but the first five references are bare filenames and the last two start `Pictures\Kum\`. That is another source-scoped seven-image object, not an eighth image or a replacement for G04's evidence. The source collection index is retained separately from the sparse parser ID.

## 10. Reference → object reverse graph

There are **300 source-scoped distinct filename buckets**. Of these, **298 are referenced by one object and two by two objects**. Maximum objects per filename **within one source = 2**. Both within-file many-object cases are in G01:

| Filename | Source objects | Source GUIDs |
| --- | --- | --- |
| `2026-02-20-14-34-36_f1ea8a41a3e3fb77de80703e30920e_KG1._.jpg` | G01 :P 20 (index 19); G01 :P 22 (index 21) | `b82604fa-abdb-40e2-acec-017788834274`; `cf6a001b-89ce-43a8-9450-bfbb97ada492` |
| `101d5fa875f346637177fa67f0bac8.jpg` | G01 :P 110 (index 109); G01 :P 121 (index 120) | `52fe0ed8-d4d6-4a00-b1e7-9e026e827ca9`; `e70f78d8-c484-4e72-ae28-74d72fae248d` |

These are genuine distinct-GUID source-object associations. Each occurrence resolves to the same single local physical image; retaining both is correct. A matcher that marks repeated source references `duplicate-gml-reference` would incorrectly suppress these valid associations.

Across the entire corpus, lexical filename aggregation gives 238 names: **189 referenced by one source/object occurrence, 34 by two, and 15 by three**. **47 basenames occur in more than one GMI**. The other two multi-object buckets are the G01 cases above. Cross-file maximum = three source/object occurrences, not proof of three independent physical photographs or three unrelated real-world objects. Source scope is preserved for all 302 edges.

There are **31 basenames with differing reference paths**, all between G04/G05. For example GUID `1fde86b8-91f3-46a8-a05d-706e56742877`, point parser ID 13/index 2:

```text
G04: Attachments\2025-12-04-14-52-46_49c84a82b578be35ee8f401eb25079.jpg
G05:             2025-12-04-14-52-46_49c84a82b578be35ee8f401eb25079.jpg
```

Both resolve to the same image in their shared immediate Attachments folder, but remain distinct source evidence. There is **no same-basename/different-path case inside a single GMI**. Another cross-file example is `IMG_3957.jpeg`, referenced in each of G07/G08/G09 under that file's own `Attachments\` prefix; the physical files live in separate dated folders and have identical SHA-256, while source revisions remain distinct.

## 11. Photo-folder matching results

Automatic audit resolution was deliberately limited to each GMI's immediate sibling `Attachments` subtree. This produces eight reasonable local namespaces; three GMIs share the Gipø buss namespace and three share Skogveien-Skoleveien. These are **plausible attachment scopes**, not exclusive photo ownership claims.

| Local image namespace, relative to corpus root | GMI sources |
| --- | --- |
| `20260903/Attachments` | G01 |
| `20260928/GMI-leveranse/Attachments` | G02 |
| `Asbuilt VA ledninger 20260825/Asbuilt VA ledninger 20260825/Attachments` | G03 |
| `Gipø buss/Anleggsrapport/03 - INNMÅLINGER/Attachments` | G04, G05, G06 |
| `Gipø/20260213/Attachments` | G07 |
| `Gipø/20260218/Attachments` | G08 |
| `Gipø/20260227/Attachments` | G09 |
| `Skogveien-Skoleveien/Attachments` | G10, G11, G12 |

| GMI | Local Attachments images | Exact path | Unique basename | Case/NFC | Ambiguous | Unmatched valid | Invalid targets | Unreferenced images for this GMI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G01 | 92 | 94 | 0 | 0 | 0 | 0 | 1 | 0 |
| G02 | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| G03 | 63 | 63 | 0 | 0 | 0 | 0 | 0 | 0 |
| G04 | 31 | 31 | 0 | 0 | 0 | 0 | 0 | 0 |
| G05 | 31 | 0 | 31 | 0 | 0 | 0 | 0 | 0 |
| G06 | 31 | 0 | 0 | 0 | 0 | 0 | 0 | 31 |
| G07 | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 |
| G08 | 18 | 18 | 0 | 0 | 0 | 0 | 0 | 0 |
| G09 | 16 | 16 | 0 | 0 | 0 | 0 | 0 | 0 |
| G10 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 30 |
| G11 | 30 | 30 | 0 | 0 | 0 | 0 | 0 | 0 |
| G12 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 30 |

Total valid occurrence resolution: **302 matched, zero ambiguous, zero unmatched**. Separate invalid-target count: **one**. If a three-state user summary folds invalid targets under unresolved, the totals are **302 matched / 0 ambiguous / 1 unmatched-invalid**, clearly explaining that the remaining reference supplies no filename, rather than suggesting a missing JPEG.

Matching methods: **271 exact relative-path matches**, **31 unique exact basename matches**, **zero case/NFC fallback matches**, **zero suffix matches needed**. The 31 basename resolutions are in G05: 23 bare references and eight `Pictures\Kum\` references whose original directories are not present in the dump. Those eight references are exact-path-unresolved but **confident basename matches within the established local Attachments inventory**, not exact path matches. Original reference text and matching method remain distinct evidence.

The matched occurrences resolve to **269 distinct physical paths** and **238 distinct image hashes**. All 269 images present in the eight established attachment namespaces are referenced by at least one associated GMI. Every local namespace has zero duplicate exact basenames, zero duplicate NFC/case basenames, and zero same-content/different-name groups. Per-source unreferenced counts still differ where a source has no links: G06 leaves all 31 sibling images unreferenced; G10/G12 each leave all 30 sibling images unreferenced. Those images are referenced by G04/G05 or G11 respectively; do not count them as global orphan images repeatedly.

The other **274 physical images** are outside the selected GMI attachment namespaces:

| Separate image folder | Images | Names also seen in project GMI references |
| --- | ---: | ---: |
| `20260928/GML-leveranse/Attachments` | 40 | 0 |
| `Gipø buss/Anleggsrapport/06 - KUMBILDER` | 9 | 8 |
| `Gipø buss/Anleggsrapport/07 - ANLEGGSBILDER` | 80 | 23 |
| `Gipø buss/Anleggsrapport/07 - ANLEGGSBILDER/20260316_GML_Eksport/Attachments` | 77 | 21 |
| `Gipø buss/Anleggsrapport/07 - ANLEGGSBILDER/20260316_GML_Eksport/til import/Attachments` | 68 | 21 |

Those name overlaps are contextual comparisons within the evident project delivery. These folders were **not** merged into the automatic matcher. Several hold exact-hash copies of GMI-linked files; matching the entire Gipø buss report tree indiscriminately would make unique basename references ambiguous. Existing sibling references already resolve, so there is no reason to broaden the namespace. The first row is a distinct GML photo collection and all three GML reference inventories are documented in section 2. Files outside a selected namespace are not necessarily unassociated product assets or project orphans.

## 12. Ambiguity and collision cases

No ambiguous match occurs under the explicit local scopes. This does not mean the dump is a safe single filename namespace. There are **103 repeated image-name groups across folders**, including 15 names shared by all three Gipø dated deliveries. All such copies currently have matching contents; filenames and hashes still do not establish which imported asset a user intends to associate.

Concrete four-copy case:

```text
2025-11-19-10-29-53_f62b2a214bbb18b919f14b049484e1_Skjøte_hull_semsveien.jpg
```

It appears in Gipø buss report `03 - INNMÅLINGER/Attachments`, direct `07 - ANLEGGSBILDER`, the GML export's Attachments, and the `til import/Attachments` subset. All four hashes are identical. If a FOTO layer contains several of those copies without path evidence that disambiguates them, a basename match must be **ambiguous**, even when every byte is equal. Do not silently choose one or combine photo IDs.

Different-content same-name and different-name same-content cases were not observed. They remain necessary negative tests. No `.jpg`/`.jpeg` shared-stem equivalence is justified; different files such as `64320(1).jpg` and `64320.JPEG` are explicitly separate reference members and content assets. Changing extension or removing `(1)` would lose documented images.

## 13. Image-file and lightweight metadata observations

All **543** likely images have JPEG signatures. Windows System.Drawing reads dimensions and decodes a minimal probe for all 543, with **zero thrown errors**. Its detected format GUID is JPEG on every file. Width range: **404–4,160 pixels**; height range: **538–4,608 pixels**. Frequent sizes include 1728×2304 (199 files), 1080×1920 (59), 404×538 (52), 4160×3120 (46), and 4032×3024 (30). Extension spelling agrees with actual image format.

Six G01 files nevertheless emit native decoder warnings `Corrupt JPEG data: bad Huffman code` while completing the Windows decode:

```text
20260903/Attachments/20260826dp09_072856_LOK_1.jpg
20260903/Attachments/20260826dp10_073154_LOK.jpg
20260903/Attachments/20260826dp24_080944_Bir.jpg
20260903/Attachments/20260826dp29_082040_LOK.jpg
20260903/Attachments/20260826dp36_083740_SAN_1.jpg
20260903/Attachments/20260901dp07_075002_topp-kran.jpg
```

All six are matched GMI images. A second full-content decode probe used the already-installed Sharp on each of the **336 unique JPEG hashes**, with `failOn:'warning'`; it produced **zero errors or warnings**. Therefore these are decoder-dependent quality diagnostics, not demonstrated universally unreadable images. Preserve associations independently of preview success; allow the existing image preview/error state to report actual browser readability. Do not rewrite or reject files automatically because one native decoder warned. Neither probe establishes that every pixel has perfect visual integrity.

The production EXIF GPS helper (`readExifGps`, same installed exifr/options) was used on all files; lightweight timestamp/orientation tags were read using installed exifr. No object/photo coordinate comparison was performed.

| Metadata | All 543 physical images | 269 matched physical images |
| --- | ---: | ---: |
| Viable EXIF GPS | 521 | 250 |
| No EXIF GPS | 22 | 19 |
| Invalid/error GPS | 0 | 0 |
| EXIF DateTimeOriginal present | 177 | 143 |
| Any queried EXIF timestamp present | 177 | 143 |
| Orientation tag present | 114 | 108 |

Orientation values across all images: 0 on 72, 1 on 12, 6 on 30; tag absent on 429. In matched images: 0 on 72, 1 on six, 6 on 30; absent on 161. Zero is outside normal EXIF orientation values and must not become a rotation instruction or a camera heading. The current direction domain is manual-only; there is no existing EXIF direction-import helper to exercise, and this audit did not infer headings. Timestamp presence does not establish a reliable timeline/timezone; no timestamp behavior is proposed here.

Visual samples were inspected from original files without rewriting them: `03 - INNMÅLINGER/Attachments/SPK1.JPEG` shows a manhole interior; `Gipø/20260213/Attachments/5.jpg` shows field pipe work; G03 `Attachments/0.10_20260127_1427_01.jpg` shows an excavated trench. These are field photographs, including samples with no GPS. No rendered kumkort is positively identified in the visual sample; the explicitly named `05 - KUMKORT` directory is empty. The `Pictures\Kum` prefix describes subject organization and does not by itself mean a rendered card. The standalone 21 PDFs do show a documentation delivery, but no PDF hyperlink occurs.

FOTO already accepts supported JPEGs by format, without requiring EXIF or a camera-photo semantic classifier. A later supported JPEG document/card should therefore remain eligible as an image association unless product scope explicitly changes. Prefer “bildereferanse” or “referert bilde” over a promise that every link denotes a photographed camera location.

## 14. Cross-file GUID and source identity findings

The 95 repeated GUID groups split as follows:

| Source combination | Distinct repeated GUIDs |
| --- | ---: |
| G04 + G05, Gipø buss exports | 44 |
| G07 + G08 + G09, dated Gipø deliveries | 40 |
| G08 + G09 only | 4 |
| G11 + G12, Skogveien main/specialized subset | 7 |

These are related project exports/revisions/subsets, not cross-project random UUID duplication. Of the 95 groups, **93 have identical geometry evidence** and **29 have identical parsed object evidence including attributes and geometry**. The other 64 geometry-identical groups differ in attributes, path references, or field definitions. Two groups have changed geometry, both between G04/G05. These classifications use actual parsed evidence; they do not assign revision ordering or merge records.

Concrete changed-position GUID: `91123185-e7ed-407f-bb05-37805ebfe3e8`, KRN point parser ID 263/index 22:

```text
G04 XYZ: 581828.127845 6565722.741809 0.241
G05 XYZ: 581827.683112 6565721.622778 0.241
```

The other changed-geometry GUID is `e2d53f95-948b-430d-91bf-fa22267c8d95`, SPP line parser ID 17/index 5, with different source line coordinates. Neither has a hyperlink in these exports; they are still decisive evidence that GUID alone does not identify an immutable geometry revision. No camera-position inference is made.

Concrete changed metadata and lookup identity: GUID `50b13588-daf4-424f-8523-2baf44a37ed0` has the same geometry but is G11 point parser ID **172**, index **155**, TEMA **DIV**, Type **FORAKLOSS**; in G12 it is parser ID **156**, index **0**, TEMA **FORAKONSTR**, Type **FORAKLOSS**. Parser ID and index cannot be treated as GUID-stable identifiers across exports.

Parser IDs are unique within a geometry collection in each file, but overlap between point/line collections and across files. G04/G05 use sparse IDs (point IDs begin 8, 9, 13, 36, …); index is **not** always parser ID minus one. Retain all dimensions: source fingerprint/revision, GUID, geometry scope, parser ID, and exact source collection index. Missing/duplicate GUID fallback remains necessary for future files even though none is observed within this corpus.

## 15. Revised matching policy

Retain the first audit's conservative filename mechanics, with stronger separation of **source references**, **asset matching**, and **image readability**:

1. Parse every S_HYPERLINK across both geometry collections; validate structure and target separately. An ordinary empty Type is acceptable. A directory-only target is unresolved/invalid, with no guessed filename.
2. Retain full raw field/member/path spelling and wrapper/member identity. Build a derived slash-normalized, NFC/lowercase comparison key. Strip structural wrapper quotes through shared parsing, not by scraping arbitrary quoted text.
3. Resolve only inside the selected owner FOTO layer, using its explicitly imported relative paths when available. This audit's filesystem sibling namespaces are evidence for product folder selection, not permission to search arbitrary local directories at runtime.
4. Prefer collision-checked full relative path, then safe relative-path suffix, then unique basename. Record the exact method. Case/NFC fallbacks are allowed only when the corresponding bucket is unique; even an exact-spelled asset must not hide a normalization collision.
5. Allow a unique owner-layer basename match when an original relative prefix was flattened or moved: the eight `Pictures\Kum` cases demonstrate this need. A shared project parent is not sufficient to merge separate attachment directories. If selection/layout does not establish the intended scope, leave it unresolved until the user selects a namespace.
6. Several source objects naming the same unique imported image are confident many-to-many edges, not imported-file ambiguity. Conversely, several imported assets with one matching basename remain ambiguous unless trusted relative-path evidence disambiguates them. Do not use first-wins assignment, nearest geometry, TEMA, Type, object name, or EXIF to break filename ties.
7. Preserve extension spelling; only case normalization is automatic. Do not replace `.jpeg` by `.jpg`, remove `(1)`, fuzzy-match stems, or substring-match object labels. No percent encoding/escaped-quote/URL grammar addition is justified; keep existing explicit URI safety without decoding literal local-path percent characters.
8. Same name/different content is ambiguous asset evidence. Same content/different name retains separate assets/reference names. Identical contents can identify copies for diagnostics, but do not authorize merging asset IDs or selecting an intended endpoint. Image content is not association identity.

Classify outcomes as **confident**, **ambiguous**, or **unmatched**, with an unmatched/invalid subtype for rejected structure or targets. Preview errors do not change source-link validity or create positions. Readability is a separate asset state.

## 16. Revised GMI source architecture

The corpus supports **one generic `kind:'gmi'` source per import**, not separate Type adapters. The layer-level source should retain:

```js
{
  id, kind: 'gmi', filename, fingerprint, importedAt,
  header, objectInventorySummary,
  objectsByKey,
  references,
  associationLedger,
  issues
}
```

Use a full-byte SHA-256 source fingerprint where available, with the existing conservative secure-context fallback pattern. The filename is provenance/display metadata, not source identity. This corpus has 12 distinct GMI hashes; related exports sharing GUIDs are not duplicate source imports. Within one owner FOTO layer, an exact source fingerprint reimport should offer/reuse explicit recheck instead of duplicating the same source evidence. Renaming identical bytes must not create a different revision; distinct byte fingerprints remain distinct sources even if all referring GUIDs coincide.

`objectsByKey` stores each parsed source object once, including real GUID, source geometry scope/index/parser ID, TEMA, Type, useful identifiers, and retained source evidence. Explicitly copy needed source lexemes before immutable/JSON boundaries: the existing private Symbol disappears from normal serialization. Do not copy entire source objects per photo, and do not discard objects lacking hyperlinks before computing inventory/identity diagnostics.

Associations should be added under the existing layer-level source lifecycle without pretending to be spatial candidates. Retaining a GMI source in `spatialSources` is compatible with the prior architecture if the common storage supports non-positional sources; selectors/summary must not interpret every stored source as a position source. Avoid changing GML's positional ledgers or candidate rules as a side effect.

Refactor only the source attachment seam required to retain association evidence independently: current `photoSession.attachSource()` creates a position candidate for every matched entry, and cannot be reused unchanged. The existing injected `sourceAdapters` seam is suitable, but generic source review must select the right matching policy. GMI-only `references`/`associationLedger` do not have to masquerade as candidate `entries`; keep position APIs untouched for this milestone.

Recheck runs against current owner-layer membership, updates only match resolution and association edges, and retains every raw reference/unresolved row. Stable occurrence IDs make recheck idempotent. Appending images can expose an explicit recheck of attached sources; new assets do not silently acquire accepted positions or migrate ownership. Removing an asset prunes live endpoints while retaining source evidence; reset/deletion cleans source associations and invalidates late work. Source application is atomic and cancellable. No source import owns a photo or changes its current position/direction.

## 17. Revised association and occurrence model

Recommended identities:

```js
// Source-scoped object identity: GUID only if unique within this source.
objectKey = uniqueGuidKey || geometryScopeAndSourceIndexFallback;

// One immutable record per original link member.
reference = {
  id, objectKey, field: 'S_HYPERLINK',
  wrapperOrdinal, wrapperNumber, memberOrdinal,
  rawStart, rawEnd, hyperlinkRaw, referenceRaw,
  referencedFilename, normalizedKey, targetIssues
};

// One grouped source/object/photo edge, retaining member evidence.
edge = {
  id, sourceId, objectKey, photoId,
  referenceIds, matchMethod
};

// Derived photo-facing handle; metadata resolves from source lookup.
photoReference = { kind: 'gmi-object', sourceId, objectKey, associationId };
```

Scope an occurrence ID by exact source revision + objectKey + field + wrapper/member ordinal; retain character offsets as evidence, not unstable global identifiers or asserted byte offsets. Invalid targets still receive occurrence identity and issues so counts reconcile. The copy UI can continue its own filename-action deduplication without discarding canonical members.

Edge identity is owner-layer/source-scoped objectKey + photo asset ID. Repeated members on one object/photo can group under referenceIds; distinct objects and distinct source revisions never collapse simply because filenames or GUIDs match. Keep unresolved and ambiguous occurrence rows beside matched edges, with candidate photo IDs and explicit reason/method.

Reverse indexes derive from the ledger: `photoId -> association IDs`, `objectKey -> association IDs`, and `referenceId -> resolution`. Inspector object count means distinct **source/object keys**, not filenames or link occurrences. If several revisions repeat one GUID, show their source filenames/revisions rather than globally merging them. Accepting/moving a photo position or changing direction leaves associations untouched.

## 18. Revised UI implications

Prefer association-specific source import wording such as **“Knytt GMI-referanser”** or **“Legg til GMI-kilde”**. Do not route an association-only result through a promise to position photos or label it “posisjoner funnet”. The existing FOTO inspector can show:

```text
Referert fra GMI
N objekter

AnleggsID or source S_OBJID/PUNKT-NAVN when supplied
TEMA: ...
TYPE: ...             (omit or show missing explicitly when absent)
GUID: ...
Kilde: <GMI filename>
```

Useful identifiers vary: AnleggsID occurs in several sources; G02 also delivers PUNKT-KODE/PUNKT-NAVN; sparse/all-point exports use S_OBJID. Use an explicit priority with original fields preserved, not a fabricated global object name. Never use these labels as identity. Show TEMA/TYPE only as metadata; the empty-Type majority must not look like failed association records.

Source-import summary should distinguish **Objekter analysert**, **Objekter med bildereferanser**, **Referanser funnet**, **Matchet til bilder**, **Ikke matchet**, **Tvetydige**, and **Ugyldige mål**. For this batch: 1,386 objects, 197 non-empty-field objects but 196 with valid image targets, 303 link occurrences, 302 matched valid occurrences, and one invalid directory-only target. Give physical/asset count separately where useful (269 matched filesystem paths in the audit), so occurrence totals are not misread as distinct-photo counts.

Review should display original reference path plus the derived matching method, especially flattened `Pictures\Kum` and bare filename cases. Final apply explicitly attaches source/association evidence, including unmatched diagnostics, even with zero positions. Cancel applies nothing. Map highlight/zoom/details are future optional actions and do not belong in this milestone.

## 19. Map-linking implications

The [first audit's map findings](20261008-gmi-photo-source-audit.md#18-existing-map-object-lookup-feasibility) remain correct: parsed loaded layers retain top-level GUID, but `MapInner` GeoJSON spreads attributes and uses zero-based collection index as `properties.id`, with `_layerId` and `featureType`. Top-level parser GUID/ID is not automatically copied to features; interaction IDs are `punkter-<layerId>-<index>` / `ledninger-<layerId>-<index>`.

The broader corpus strengthens, rather than removes, source-revision binding. GUID coverage is excellent within each source, and there are no within-file duplicates, but 95 cross-file repeats, changed geometry, changed TEMA, and sparse/renumbered parser IDs make a global GUID lookup unsafe. Retain geometry and exact source index alongside GUID. Validation-v2 ObjectRef is already revision/index scoped; do not change its validation contracts for photo linking.

Smallest later addition: explicit retained-GMI-source → matching loaded GMI-layer revision binding, plus a per-layer/revision GUID bucket index returning geometry scope/parser ID/source index. Require uniqueness in that bound revision, then derive the existing interaction ID and use existing highlight/zoom/inspect behavior. Missing/ambiguous GUIDs, unloaded/deleted/hidden layers, and a different source revision must be explicit unavailable states. Source import should not automatically create another map layer. Navigation is deferred.

## 20. Risks, unresolved cases, and validation

| Real finding | Smallest safe response |
| --- | --- |
| One `Attachments\` directory target | Retain member + invalid-target diagnostic; no filename or automatic directory search |
| 65 multi-image objects, up to seven wrappers | Preserve every occurrence; source/object/photo edges support many-to-many |
| Two G01 names each referred by two distinct GUIDs | Allow both source-object associations to one uniquely resolved asset; do not use GML contested-reference rejection |
| 95 GUIDs repeated across sources; two changed geometries | Source fingerprint/revision + object identity; no global GUID merge |
| Sparse IDs and renumbered subset records | Store GUID, parser ID, geometry, and exact source index separately |
| 103 duplicate basename/content groups across folders | Explicit owner/namespace scope and path evidence; unresolved ambiguity when several imported assets remain possible |
| Eight `Pictures\Kum` paths and 23 bare filename paths | Preserve originals; unique owner-scope basename fallback with an honest method |
| Six decoder-dependent JPEG warnings | Preserve image associations; report preview/readability separately; never rewrite fixtures |
| Empty Type on 147 hyperlink-bearing objects | Type is metadata, not eligibility; no restrictive Type gate |
| 405 empty TEMA fields on other objects | Retain source metadata omissions; don't infer codes from labels |
| Raw lexemes live under a private Symbol | Copy required provenance explicitly before snapshot/serialization |

Not observed: within-source duplicate/missing/malformed GUIDs, same filename/different content, same content/different filename, local basename normalization collision, URLs/absolute/network paths, non-image hyperlink targets other than the directory-only placeholder, semicolon-delimited member text, escaped-quote grammar, multiline parser loss, parser truncation, or mixed UTF-8 GMI encodings. These remain guard/test cases, not demonstrated failures needing immediate grammar expansion.

This corpus contains real DFOT values, but **position semantics were not evaluated**, per scope. Neither their point geometry nor EXIF availability is an implementation rule. A future positioning milestone needs separate evidence and review. Line-bearing hyperlink behavior has no real sample here; implementation should still inspect all lines and cover valid line associations synthetically. Broad Type coverage is proven, not exhaustive across every GMI exporter.

Temporary artifacts are outside production source and git:

```text
%TEMP%\gmi-photo-corpus-audit-20261008\
  inventory.json, protected-hashes.json, preliminary.json
  audit.mjs, audit.json
  images.ps1, image-decode.json, image-native-warnings.json
  image-decode-tagged-stderr.txt, strict-image-check.mjs, strict-image-check.json
  metadata.mjs, metadata.json, gml-reference-inventory.json
```

The audit imports the actual GMI decoder/parser, symbol raw lexemes, shared extraction APIs, filename-key helper, and production EXIF reader. Audit-only raw-block reconciliation and named-member scanning measure evidence without implementing production support. GML uses namespace-aware .NET XML parsing with external resolver disabled. JPEG signatures, System.Drawing, and already-installed Sharp/exifr provide file sanity/metadata; no dependency was installed and no fixture was copied into the repository. The existing browser GML/preview paths were inspected but no browser execution or UI acceptance is claimed.

Validation: relevant existing parser, hyperlink, photo-matching/session/spatial/positioning/direction tests passed **72/72**, zero failures:

```text
node --test tests/hyperlinkFilenames.test.mjs tests/validationV2GmiV32PointNumericLexical.test.mjs tests/photoReferenceMatching.test.mjs tests/photoSession.test.mjs tests/photoSpatial.test.mjs tests/photoPositioning.test.mjs tests/photoDirection.test.mjs
```

All 585 fixture paths and SHA-256 values were checked again after analysis, together with the first report and usage-data hashes; all remained identical. The second report is the only new task-created repository artifact. No large inventories, audit helpers, corpus files, or photos were added to git. To repeat the session-local parser/graph audit:

```powershell
node "$env:TEMP\gmi-photo-corpus-audit-20261008\audit.mjs"
```

The temporary inventory pins paths/bytes/hashes; regenerate it if deliberately auditing a changed corpus. Exact representative grammar inputs, every zero-output case, per-file fingerprints, and concrete graph/identity examples are retained in this report independently of temporary JSON.

## 21. Final implementation plan

The first audit's generic source and GUID-scoped ledger design is confirmed. The changes in emphasis are: **all hyperlink-bearing object types**, **member-level multi-wrapper evidence**, **source-revision isolation proven by changed GUID geometry**, **explicit attachment scope despite hash-identical copies**, and **association-only attachment/UI**. Remove DFOT candidate work and any positioning wizard expansion from the next milestone.

**A. Shared member-level extraction.** Extend the existing shared extraction implementation to return wrapper/member records, source spans, full raw paths, filenames, and diagnostics. Preserve existing copy actions and text reconstruction. Pin these 12 real field shapes, three path forms, sign variations, and the directory-only negative case. No speculative production grammar relaxation.

**B. Generic GMI source adapter.** Decode/parse once with production paths, audit all point/line objects, retain source fingerprint, object lookup, useful identifiers, raw lexemes, references, and issues. Type and TEMA are display/provenance metadata. Emit no GMI spatial candidates.

**C. Source-level many-to-many ledger and GMI matching policy.** Reuse filename-key/asset collision mechanics with explicit GMI repeated-reference semantics. Retain object/reference/source identities and both reverse indexes. Keep GML positional duplicate-reference behavior unchanged. Preserve invalid, ambiguous, and unmatched records.

**D. Owner-FOTO-layer review/recheck.** Resolve only against explicitly selected owner assets/path evidence; expose exact/path versus basename methods. Make recheck idempotent and preserve source occurrence identity. Handle append, removal, duplicate sources, multiple source revisions, and stale asynchronous work without photo-ID/ownership merging.

**E. Explicit association-only attachment.** Stage a source review, present reference/object/image counts and issues, and atomically apply source evidence plus selected/confirmed associations. Permit sources with zero matched assets or no position entries as explicit evidence attachment. Cancel leaves the session unchanged. Current position/direction/preview ownership remains independent.

**F. Selected-photo GMI reference inspector.** Show `Referert fra GMI`, distinct source/object count, useful source identifiers, TEMA, supplied TYPE, GUID, and source filename. Resolve full evidence through source lookup. Report path/matching method in details and preview failure independently.

**G. Domain/browser regression and acceptance.** Exercise several pinned real grammar forms, all major identity/relationship/scoping cases, source-only confirmation, and retained provenance. Use small extracted strings/metadata fixtures instead of committing entire private deliveries. Validate unchanged GML/EXIF/manual/direction and copy behavior.

**H. Defer map navigation and every GMI-derived position.** Build source-bound map lookup only in a later proven relationship milestone. Any camera-position candidate design receives a separate audit and explicit product decision. DFOT remains an object Type inside the same GMI source.

## 22. Tests required

1. **Extraction evidence:** all 12 verified field shapes, one through seven wrappers, optional/mixed sign presence, bare/Attachments/Pictures-Kum paths, `.jpg`/`.jpeg`/`.JPEG`, spaces/non-ASCII, raw trailing space, source reconstruction, unchanged metadata-only/malformed behavior, and exact directory-only rejection. Preserve historical newline/sign regression although this corpus has no newline values.
2. **Occurrence identity:** wrapper/member order and character spans, repeated identical links and same-basename/different-path members using clearly labeled synthetic cases, and presentation deduplication independent of canonical ledger evidence.
3. **Many-to-many:** real G01 two-GUID/single-image cases, real seven-image LOK case, several source revisions with the same GUID/filename, and grouping repeated member evidence without merging objects or assets.
4. **Matching:** sibling/owner scope, exact path first, safe suffix, flattened `Pictures\Kum` unique basename fallback, case/NFC collision checking, several attachment folders, equal-hash copies remaining ambiguous when path does not resolve ownership, same-name/different-content and renamed-same-content synthetic guards. Never perform fuzzy stem/extension substitution.
5. **Identity/source lifecycle:** all-object inventory, empty Type/TEMA, sparse/renumbered parser IDs, source fingerprints, exact duplicate import/recheck, distinct revised sources sharing GUIDs, synthetic missing/duplicate GUID fallback, deletion/reset/pruning, append membership, and late/cancelled read guards.
6. **Independent state:** explicit association-only apply with no position requests, atomic cancel/apply, unchanged current position and candidate basis, direction changes preserving edges, image preview failure preserving references, and unchanged GML matching semantics.
7. **Inspector/browser acceptance:** association-specific source summary labels, distinct object counts, useful identifier fallback, real GUID/Type/source details, Unicode paths, invalid directory target message, and no accidental positioning or map-layer creation. Test actual table/popup copy controls continue to use the shared extractor.

Recommended next milestone: **hyperlink-centric GMI association support only, stages A–G above**, with map navigation and positioning explicitly deferred.
