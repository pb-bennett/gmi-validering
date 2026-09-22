# Validator 2.0 privacy-safe GMI header evidence

- Date: 2026-08-21
- Branch: `research/validator-v2-gmi-header-evidence`
- Corpus label: `local-reference-corpus`
- Scope: structural research evidence only

## 1. Executive summary

The privacy-safe collector scanned 182 locally available GMI files. All 182 yielded structural point and/or line field definitions; none failed. The corpus contains 320 distinct literal header spellings grouped into 72 neutral schema shapes. Every file explicitly reports GMI export version `2` in safe structural metadata.

All **41 canonical semantic fields** from the field-resolution census have their direct Innmålingsinstruks-backed property spelling observed somewhere in this corpus. That strengthens the prior structural model: GMI can expose these source properties directly, and the parser preserves them literally.

The most consequential evidence is:

- exact `S_FCODE` occurred in 131 point-header files and all 142 line-header files; lower-case `s_fcode` occurred in one additional point schema;
- exact `Tema` occurred in 37 point-header files and one line-header file;
- exact `PTEMA`, `LTEMA`, and `FCODE` were not observed, but the distinct dotted headers `.P_TEMA` and `.L_TEMA` were each observed once in point and line context respectively;
- every file with a point header schema had either Tema or an S_FCODE spelling; every file with a line header schema had S_FCODE;
- exact `Nøyaktighet`, `MålemetodeHøyde`, and `NøyaktighetHøyde` occurred together in the same context patterns; none of H_MÅLEMETODE, H_MALEMETODE, H_NOYAKTIGHET, or the ASCII long-name variants occurred;
- exact `Bredde` occurred only in point schemas; `Dimensjon`/`DIMENSJON` occurred primarily in line schemas; DIM occurred only in line schemas; DIAMETER was absent;
- exact SDR, Ringstivhet, Trykklasse, Nett_type, and Material occurred in the expected line context, while PN, SN, NETTTYPE, MATERIALE, and MATR were absent;
- the unsuffixed `InnvendigUtvendig`, `Tykkelse`, `NOBB-VAVVS-nr`, and `S_HYPERLINK` all occurred in both point and line schemas;
- none of the nine configured `_punkt`/`_led` field keys occurred literally.

Occurrence is not authority. The prevalence of S_FCODE is strong practical GMI-format evidence, but does not by itself prove formal equivalence to Innmålingsinstruks Tema. The observed `.P_TEMA` and `.L_TEMA` headers are noncanonical, legacy-format-like Tema-family candidates with unresolved semantics; their structural similarity to remembered point/line Tema names is not sufficient mapping evidence. Likewise, observed HREF or DIM does not approve a semantic alias.

Compared with the previous census, five BROKEN_LIKELY suffix mappings are now strengthened by real-corpus structural evidence to the same lookup failure mechanism as the two BROKEN_CONFIRMED mappings. No production files are changed.

## 2. Privacy and safety methodology

The collector retains only:

- aggregate file counts;
- literal `_FIELDNAMES` spellings;
- point/line definition context;
- aggregate header counts;
- neutral schema IDs and aggregate schema frequency;
- strictly numeric GMI version metadata.

It never retains or emits:

- source paths, directory names, or filenames;
- per-file records;
- `_FIELDVALUES` or any attribute value;
- object IDs;
- coordinates, extents, or bounding boxes;
- feature facts, comments, or raw rows;
- customer, municipality, project, or delivery identity.

The utility recursively discovers candidate `.gmi` files internally, but paths exist only transiently as filesystem handles. Exceptions are caught and reduced to aggregate failure counts. The CLI prints only scanned/parsed/failed/schema totals.

Header decoding is byte-preserving: lines are streamed as Latin-1, and an individual header is converted to UTF-8 only when the original bytes round-trip without replacement. The final corpus has zero replacement-character or mojibake-marker header spellings.

## 3. Corpus limitations

- Corpus size: 182 files, reported only in aggregate.
- Parsed: 182; failed: 0.
- Structural export version: `2` in all 182 files.
- Point header definitions occurred in 163 files; line header definitions occurred in 142 files. Files may contain both.
- The corpus yielded 72 distinct combined point/line schema groups.
- It is a local convenience sample, not a statistically controlled survey of every Gemini version, supplier, municipality, or export profile.
- `NOT_OBSERVED_IN_SAMPLE` means only absence from these 182 files. It does not mean a header is impossible.
- No operational file was copied, sanitized, or added to Git.

## 4. Collector design

The research utility is `scripts/research/collect_gmi_header_evidence.js`.

It:

1. requires an explicit root directory and output path;
2. recursively discovers `.gmi` candidates without emitting their identities;
3. streams text instead of loading feature payloads;
4. recognizes `[P_]` and `[L_]` definition contexts;
5. extracts only `_FIELDNAMES` tokens;
6. ignores `_FIELDVALUES`, object records, and coordinate blocks;
7. aggregates literal and case-insensitive comparison evidence separately;
8. combines per-file point/line header sets into anonymous deterministic schema shapes;
9. sorts headers and schema keys deterministically before assigning `schema-001` etc.;
10. merges the evidence with the prior 41-field census and all 41 configured alias candidates;
11. emits only generic errors and aggregate failure counts.

The JSON output is research data and must not be imported by runtime code.

## 5. Privacy self-test

The synthetic self-test is `tests/research/collect_gmi_header_evidence.test.js`.

It creates one valid and one malformed synthetic GMI file in a temporary directory. The valid fixture includes known header names and fake values, including the required unique secret sentinel, fake object ID, and fake coordinates.

The test passed and proved:

- intended header names are retained;
- output is deterministic;
- only aggregate malformed-file count is retained;
- the secret sentinel is absent;
- fake object ID and coordinates are absent;
- fake filename and temporary path are absent;
- no filename/path/value/coordinate/object/per-file fields exist in the evidence contract.

The generated Markdown and JSON were also searched after collection; the sentinel is absent.

## 6. Aggregate structural corpus summary

| Metric | Result |
|---|---:|
| Files scanned | 182 |
| Files parsed | 182 |
| Files failed | 0 |
| Distinct literal header spellings | 320 |
| Distinct neutral schema groups | 72 |
| Files with point header definitions | 163 |
| Files with line header definitions | 142 |
| Export version 2 | 182 |
| Canonical fields represented | 41/41 |
| Canonical direct properties observed exactly | 41/41 |
| Alias candidate entries evaluated | 41/41 |
| Alias candidate entries observed case-insensitively | 24 |
| Alias candidate entries observed with exact candidate spelling | 18 |
| Configured suffix keys checked | 9/9 |
| Configured suffix keys observed | 0 |

Counts are corpus-level structural evidence. An observation count is a file-context occurrence: one header present in both point and line definitions contributes two context observations.

## 7. Full 41-canonical-field evidence matrix

All rows are OBSERVED and all exact direct source mappings are supported somewhere in this sample. Point/line indicates where any direct spelling or configured alias candidate occurred; rule scope remains separate.

| Canonical ID | Source/direct property | Literal observed spellings relevant to mapping | Point | Line | Direct mapping supported | Observed legacy alias candidates | Semantic conclusion |
|---|---|---|:---:|:---:|:---:|---|---|
| `access` | `Adkomst` | Adkomst | yes | no | yes | — | direct property supported |
| `attachmentLink` | `S_HYPERLINK` | S_HYPERLINK | yes | yes | yes | — | unsuffixed shared property supported |
| `captureDate` | `Datafangstdato` | DATAFANGSTDATO, Datafangstdato | yes | yes | yes | — | unique case-insensitive direct mapping |
| `caseNumber` | `Saksnummer` | Saksnummer | yes | yes | yes | — | direct property supported |
| `cone` | `Kjegle` | Kjegle | yes | no | yes | — | direct property supported |
| `constructionMethod` | `Byggemetode` | Byggemetode | yes | no | yes | — | direct property supported |
| `dimension` | `Dimensjon` | DIMENSJON, Dimensjon | yes | yes | yes | — | direct/case variant observed; point occurrence needs rule scope |
| `externalHeight` | `Utvendig_høyde` | Utvendig_høyde | yes | no | yes | — | direct property supported |
| `facilityId` | `AnleggsID` | AnleggsID | yes | no | yes | — | direct property supported |
| `heightMeasurementMethod` | `MålemetodeHøyde` | MålemetodeHøyde | yes | yes | yes | — | direct property supported; H_* alias unnecessary in sample |
| `heightReference` | `Høydereferanse` | HREF, Høydereferanse | yes | yes | yes | HREF | HREF occurs, but authority still needs format confirmation |
| `horizontalAccuracy` | `Nøyaktighet` | Nøyaktighet | yes | yes | yes | — | direct property supported; H_* aliases absent |
| `innerBottomToOuterUndersideDistance` | `Avst_BunnInnvUnderUtv` | Avst_BunnInnvUnderUtv | yes | no | yes | — | direct property supported |
| `insideOutside` | `InnvendigUtvendig` | InnvendigUtvendig | yes | yes | yes | — | unsuffixed shared property supported |
| `installationYear` | `Anleggsår` | Anleggsår | yes | yes | yes | — | direct property supported |
| `length` | `Lengde` | Lengde | yes | no | yes | — | direct point property supported |
| `manholeShape` | `Kumform` | Kumform | yes | no | yes | — | direct property supported; no Rørform crosswalk implied |
| `material` | `Material` | MATERIAL, Material | yes | yes | yes | — | direct/case variant; point occurrence does not imply line-rule applicability |
| `maxHorizontalDeviation` | `MaksAvvikHorisontalt` | MaksAvvikHorisontalt, maksAvvikHorisontalt | yes | yes | yes | — | direct/case variant supported |
| `maxVerticalDeviation` | `MaksAvvikVertikalt` | MaksAvvikVertikalt, maksAvvikVertikalt | yes | yes | yes | — | direct/case variant supported |
| `measurementMethod` | `Målemetode` | Målemetode | yes | yes | yes | — | direct property supported; METODE absent |
| `networkType` | `Nett_type` | Nett_type | no | yes | yes | NETT_TYPE by case comparison | exact source spelling observed; NETTTYPE absent |
| `nobbVavvsFrameNumber` | `NOBB-VAVVS-nr-ramme` | NOBB-VAVVS-nr-ramme | yes | no | yes | — | direct property supported |
| `nobbVavvsNumber` | `NOBB-VAVVS-nr` | NOBB-VAVVS-nr | yes | yes | yes | — | unsuffixed shared property supported |
| `note` | `Merknad` | Merknad | yes | yes | yes | — | direct property supported |
| `owner` | `Eier` | EIER, Eier | yes | yes | yes | — | direct/case variant supported |
| `pipeShape` | `Rørform` | Rørform | yes | yes | yes | — | direct property supported; rule scope remains line |
| `positioningCause` | `Stedfestingsårsak` | Stedfestingsårsak | yes | yes | yes | — | direct property supported |
| `positioningCondition` | `Stedfestingsforhold` | Stedfestingsforhold | yes | yes | yes | — | direct property supported |
| `pressureClass` | `Trykklasse` | Trykklasse | no | yes | yes | TRYKKLASSE by case comparison | exact source spelling observed; PN absent |
| `ringStiffness` | `Ringstivhet` | Ringstivhet | no | yes | yes | RINGSTIVHET by case comparison | exact source spelling observed; SN absent |
| `sdr` | `SDR` | SDR | no | yes | yes | SDR | direct property supported |
| `surveyedBy` | `Innmålt_av` | Innmålt_av | yes | yes | yes | — | direct property supported |
| `tema` | `Tema` | S_FCODE, Tema, s_fcode | yes | yes | yes | S_FCODE, TEMA by comparison | direct Tema supported; S_FCODE authority remains unresolved |
| `type` | `Type` | TYPE, Type | yes | no | yes | — | direct/case variant supported |
| `verticalAccuracy` | `NøyaktighetHøyde` | NøyaktighetHøyde | yes | yes | yes | — | direct property supported; H_NOYAKTIGHET absent |
| `verticalDimension` | `VertikalDimensjon` | VertikalDimensjon | no | yes | yes | — | direct line property supported |
| `verticalLevel` | `Vertikalnivå` | Vertikalnivå | yes | yes | yes | — | direct property supported |
| `visibility` | `Synbarhet` | Synbarhet | yes | yes | yes | — | direct property supported |
| `wallThickness` | `Tykkelse` | Tykkelse | yes | yes | yes | — | unsuffixed shared property supported |
| `width` | `Bredde` | Bredde, DIM, DIMENSJON, Dimensjon | yes | yes | yes | BREDDE, DIM, DIMENSJON | direct Bredde supported; dimension aliases remain unsafe |

## 8. Tema deep dive

### 8.1 Literal observations

| Candidate | Sample status | Exact observed | Literal spellings | Point files | Line files | Context observations |
|---|---|:---:|---|---:|---:|---:|
| `Tema` | OBSERVED | yes | Tema | 37 | 1 | 38 |
| `TEMA` | OBSERVED_CASE_VARIANT | no | case-insensitive match is literal Tema | 37 | 1 | 38 |
| `PTEMA` | NOT_OBSERVED_IN_SAMPLE | no | — | 0 | 0 | 0 |
| `LTEMA` | NOT_OBSERVED_IN_SAMPLE | no | — | 0 | 0 | 0 |
| `.P_TEMA` | OBSERVED | yes | .P_TEMA | 1 | 0 | 1 |
| `.L_TEMA` | OBSERVED | yes | .L_TEMA | 0 | 1 | 1 |
| `S_FCODE` | OBSERVED | yes | S_FCODE, s_fcode | 132 | 142 | 274 |
| `FCODE` | NOT_OBSERVED_IN_SAMPLE | no | — | 0 | 0 | 0 |

Exact S_FCODE accounts for 131 point files and all 142 line files. Lower-case s_fcode adds one point file. Exact Tema occurs mostly in point schemas.

The exact compact strings `PTEMA` and `LTEMA` remain unobserved. That must not be read as absence of every structurally similar point/line naming family: `.P_TEMA` occurs once in point context and `.L_TEMA` occurs once in line context. No values were inspected, and neither dotted header is established as semantically equivalent to canonical Tema.

### 8.2 Structural identity coverage

| Context | Files with that header context | Files with at least one Tema candidate |
|---|---:|---:|
| Point | 163 | 163 |
| Line | 142 | 142 |

Every line schema included S_FCODE. Every point schema included S_FCODE/s_fcode, Tema, or both. This is strong evidence that practical GMI object identity is structurally present under these two naming families in this sample.

### 8.3 Candidate coexistence

Six neutral schema groups contain more than one literal Tema-family header:

| Schema | Files | Point candidates | Line candidates |
|---|---:|---|---|
| schema-001 | 1 | .P_TEMA, S_FCODE | .L_TEMA, S_FCODE |
| schema-003 | 1 | S_FCODE, Tema | S_FCODE, Tema |
| schema-010 | 1 | S_FCODE, Tema | S_FCODE |
| schema-038 | 1 | S_FCODE, s_fcode | S_FCODE |
| schema-040 | 1 | S_FCODE, Tema | S_FCODE |
| schema-042 | 2 | S_FCODE, Tema | S_FCODE |

No values were inspected, so coexistence does not reveal whether the fields agree.

### 8.4 Authority conclusion

- **Observed format fact:** S_FCODE is the dominant line identity header and a major point identity header in this corpus.
- **Observed format fact:** direct Tema is also a practical GMI point header and occurs once in a line schema.
- **Not observed:** the exact strings PTEMA, LTEMA, and FCODE.
- **Observed but noncanonical:** `.P_TEMA` in one point schema and `.L_TEMA` in one line schema. Both are legacy-format-like Tema-family candidates with semantic authority UNRESOLVED.
- **Still unresolved:** whether S_FCODE is a formally approved semantic representation of source Tema, what to do when S_FCODE and Tema are both supplied, and whether either dotted candidate has any valid Tema crosswalk.

V2 can safely recognize S_FCODE as a provenance-bearing GMI identity candidate. It must not silently label the mapping STANDARD/authoritative until the semantic crosswalk is approved. `.P_TEMA` and `.L_TEMA` may likewise be retained as observed structural candidates, but must remain unmapped until their semantics are proven.

## 9. H_* deep dive

| Candidate | Exact observed | Point files | Line files |
|---|:---:|---:|---:|
| `Nøyaktighet` | yes | 134 | 114 |
| `NOYAKTIGHET` | no | 0 | 0 |
| `MålemetodeHøyde` | yes | 134 | 114 |
| `MALEMETODEHOYDE` | no | 0 | 0 |
| `NøyaktighetHøyde` | yes | 134 | 114 |
| `NOYAKTIGHETHOYDE` | no | 0 | 0 |
| `H_MÅLEMETODE` | no | 0 | 0 |
| `H_MALEMETODE` | no | 0 | 0 |
| `H_NOYAKTIGHET` | no | 0 | 0 |

Schema-level patterns:

- 98 files in 42 groups contain all three canonical names in both point and line definitions;
- 36 files in six groups contain the canonical trio in point definitions only;
- 16 files in seven groups contain the canonical trio in line definitions only;
- no schema contains any H_* candidate.

This strongly reinforces the prior conclusion that routing H_MÅLEMETODE or H_NOYAKTIGHET to horizontal Nøyaktighet is unsupported and semantically implausible. It also removes the sample-based need for those aliases: the explicit canonical height properties occur directly.

Absence is not universal proof. If another export version uses H_* fields, its schema must be documented before mapping.

## 10. Width and dimension deep dive

| Literal header | Point files | Line files | Structural conclusion |
|---|---:|---:|---|
| `Bredde` | 106 | 0 | strong point-width evidence |
| `DIMENSJON` | 3 | 1 | case variant/alternate header; semantics not inferred |
| `Dimensjon` | 1 | 119 | dominant line dimension header |
| `DIM` | 0 | 4 | line-only in this sample; meaning not inferred |
| `DIAMETER` | 0 | 0 | not observed |

The dominant pattern is unambiguous: 101 files in 43 schema groups contain point Bredde and line Dimensjon. The remaining observed patterns include point-only Bredde, line-only Dimensjon, and a small number with DIM or uppercase DIMENSJON.

This strengthens the collision warning. The active Bredde alias list can consume DIM/DIMENSJON even though those names are observed primarily in line context and the source has a separate line Dimensjon property. Occurrence does not prove that the rare point DIMENSJON means Bredde.

Safe V2 defaults are `Bredde → width` for a point rule and `Dimensjon → dimension` for a line rule. DIM, DIMENSJON, and DIAMETER require explicit geometry-scoped semantic evidence.

## 11. Pressure/gravity-related header evidence

This section reports header presence only. No values were read and no object was classified.

| Candidate | Exact observed | Literal spellings | Point files | Line files |
|---|:---:|---|---:|---:|
| `SDR` | yes | SDR | 0 | 114 |
| `Ringstivhet` | yes | Ringstivhet | 0 | 114 |
| `RINGSTIVHET` | no | case-insensitive Ringstivhet | 0 | 114 |
| `SN` | no | — | 0 | 0 |
| `Trykklasse` | yes | Trykklasse | 0 | 114 |
| `TRYKKLASSE` | no | case-insensitive Trykklasse | 0 | 114 |
| `TRYKKKLASSE` | no | — | 0 | 0 |
| `PN` | no | — | 0 | 0 |
| `Nett_type` | yes | Nett_type | 0 | 113 |
| `NETT_TYPE` | no | case-insensitive Nett_type | 0 | 113 |
| `NETTTYPE` | no | — | 0 | 0 |
| `Material` | yes | Material, MATERIAL | 1 | 120 |
| `MATERIALE` | no | — | 0 | 0 |
| `MATR` | no | — | 0 | 0 |

The corpus supports the direct source property names. It does not support PN, SN, NETTTYPE, MATERIALE, or MATR as practical headers in this sample. Their absence does not establish impossibility.

Per current domain decisions, none of these fields may be used to determine the hydraulic class that controls their own validation.

## 12. Suffix-key evidence

### 12.1 Configured logical keys

| Configured key | Exact observed | Case-insensitive observed |
|---|:---:|:---:|
| `InnvendigUtvendig_punkt` | no | no |
| `InnvendigUtvendig_led` | no | no |
| `Tykkelse_punkt` | no | no |
| `Tykkelse_led` | no | no |
| `Tema_punkt` | no | no |
| `Tema_led` | no | no |
| `NOBB-VAVVS-nr_punkt` | no | no |
| `NOBB-VAVVS-nr_led` | no | no |
| `S_HYPERLINK_punkt` | no | no |

### 12.2 Unsuffixed source fields

| Unsuffixed property | Point files | Line files | Context observations |
|---|---:|---:|---:|
| `InnvendigUtvendig` | 83 | 94 | 177 |
| `Tykkelse` | 86 | 113 | 199 |
| `NOBB-VAVVS-nr` | 84 | 95 | 179 |
| `S_HYPERLINK` | 103 | 111 | 214 |

The corpus therefore confirms the schema side of all seven non-Tema suffix failures: the export carries unsuffixed properties, while the active resolver requests the suffixed logical key and has no alias.

Two unrelated literal headers contain geometry words (`EGS_PUNKT` in a point schema and `EGS_LEDNING` in a line schema). This proves only that underscore geometry fragments can occur in other domain fields; neither matches a configured suffix key.

Tema is the exception: the two suffixed logical keys are absent, but their active aliases reach observed S_FCODE/Tema headers.

## 13. Legacy alias occurrence matrix

“CI observed” means a case-insensitive literal match. It is occurrence evidence, not approval. Counts are file-context observations.

| Logical key | Alias candidate | Exact | CI observed | Literal spellings | Context | Count |
|---|---|:---:|:---:|---|---|---:|
| `Bredde (diameter)` | `BREDDE` | no | yes | Bredde | point | 106 |
| `Bredde (diameter)` | `Bredde` | yes | yes | Bredde | point | 106 |
| `Bredde (diameter)` | `DIAMETER` | no | no | — | — | 0 |
| `Bredde (diameter)` | `DIM` | yes | yes | DIM | line | 4 |
| `Bredde (diameter)` | `DIMENSJON` | yes | yes | DIMENSJON, Dimensjon | point+line | 124 |
| `Dato` | `DATO` | yes | yes | DATO, Dato | point+line | 3 |
| `Dato` | `DATOREG` | no | no | — | — | 0 |
| `Dato` | `Dato` | yes | yes | DATO, Dato | point+line | 3 |
| `Dato` | `REGDATO` | no | no | — | — | 0 |
| `Høydereferanse` | `HOYDEREFERANSE` | no | no | — | — | 0 |
| `Høydereferanse` | `HREF` | yes | yes | HREF | point+line | 5 |
| `Høydereferanse` | `Høydereferanse` | yes | yes | Høydereferanse | point+line | 184 |
| `Material` | `MATERIALE` | no | no | — | — | 0 |
| `Material` | `MATR` | no | no | — | — | 0 |
| `Material` | `Material` | yes | yes | MATERIAL, Material | point+line | 121 |
| `Målemetode` | `MALEMETODE` | no | no | — | — | 0 |
| `Målemetode` | `METODE` | no | no | — | — | 0 |
| `Målemetode` | `Målemetode` | yes | yes | Målemetode | point+line | 248 |
| `Nett_type` | `NETTTYPE` | no | no | — | — | 0 |
| `Nett_type` | `NETT_TYPE` | no | yes | Nett_type | line | 113 |
| `Nett_type` | `Nett_type` | yes | yes | Nett_type | line | 113 |
| `Nøyaktighet` | `H_MÅLEMETODE` | no | no | — | — | 0 |
| `Nøyaktighet` | `H_NOYAKTIGHET` | no | no | — | — | 0 |
| `Nøyaktighet` | `NOYAKTIGHET` | no | no | — | — | 0 |
| `Nøyaktighet` | `Nøyaktighet` | yes | yes | Nøyaktighet | point+line | 248 |
| `Ringstivhet` | `RINGSTIVHET` | no | yes | Ringstivhet | line | 114 |
| `Ringstivhet` | `Ringstivhet` | yes | yes | Ringstivhet | line | 114 |
| `Ringstivhet` | `SN` | no | no | — | — | 0 |
| `SDR` | `SDR` | yes | yes | SDR | line | 114 |
| `Tema_led` | `FCODE` | no | no | — | — | 0 |
| `Tema_led` | `S_FCODE` | yes | yes | S_FCODE, s_fcode | point+line | 274 |
| `Tema_led` | `TEMA` | no | yes | Tema | point+line | 38 |
| `Tema_led` | `Tema` | yes | yes | Tema | point+line | 38 |
| `Tema_punkt` | `FCODE` | no | no | — | — | 0 |
| `Tema_punkt` | `S_FCODE` | yes | yes | S_FCODE, s_fcode | point+line | 274 |
| `Tema_punkt` | `TEMA` | no | yes | Tema | point+line | 38 |
| `Tema_punkt` | `Tema` | yes | yes | Tema | point+line | 38 |
| `Trykklasse` | `PN` | no | no | — | — | 0 |
| `Trykklasse` | `TRYKKKLASSE` | no | no | — | — | 0 |
| `Trykklasse` | `TRYKKLASSE` | no | yes | Trykklasse | line | 114 |
| `Trykklasse` | `Trykklasse` | yes | yes | Trykklasse | line | 114 |

Twenty-four of 41 configured candidate entries have a case-insensitive observation; 18 have the exact candidate spelling. The duplicated counts for Tema point/line are expected because the same candidate list is configured for two logical keys.

## 14. Distinct neutral schema groups

The machine-readable evidence contains the complete literal point and line header arrays for all 72 groups. The compact table below lists group frequency, total point/line header counts, and the literal Tema/H/dimension candidates relevant to this research. No filename or per-file membership is retained.

| Schema | Files | P/L header count | Relevant point headers | Relevant line headers |
|---|---:|---:|---|---|
| schema-001 | 1 | 69/35 | .P_TEMA, S_FCODE | .L_TEMA, S_FCODE |
| schema-002 | 1 | 44/42 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | DIMENSJON, Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-003 | 1 | 85/35 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE, Tema | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE, Tema |
| schema-004 | 1 | 65/58 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-005 | 1 | 20/19 | S_FCODE | S_FCODE |
| schema-006 | 1 | 20/17 | S_FCODE | S_FCODE |
| schema-007 | 1 | 21/24 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-008 | 1 | 39/0 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | — |
| schema-009 | 3 | 37/33 | Bredde, DIMENSJON, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | DIM, Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-010 | 1 | 40/35 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE, Tema | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-011 | 3 | 37/30 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-012 | 1 | 37/34 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-013 | 1 | 37/0 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | — |
| schema-014 | 1 | 35/32 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-015 | 1 | 39/36 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-016 | 1 | 38/35 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-017 | 7 | 36/33 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-018 | 1 | 36/0 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | — |
| schema-019 | 1 | 37/34 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-020 | 1 | 36/35 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-021 | 7 | 36/33 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-022 | 21 | 34/31 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-023 | 1 | 34/0 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | — |
| schema-024 | 1 | 34/33 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-025 | 10 | 33/30 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-026 | 1 | 31/31 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-027 | 1 | 46/30 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-028 | 1 | 40/32 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-029 | 4 | 34/35 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-030 | 1 | 34/32 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-031 | 1 | 34/30 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-032 | 1 | 32/29 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-033 | 1 | 32/31 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-034 | 1 | 32/32 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-035 | 4 | 32/30 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-036 | 1 | 33/27 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-037 | 2 | 28/25 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-038 | 1 | 30/21 | Bredde, Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE, s_fcode | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-039 | 1 | 23/25 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-040 | 1 | 24/24 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE, Tema | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-041 | 2 | 48/27 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-042 | 2 | 36/24 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE, Tema | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-043 | 1 | 35/24 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-044 | 1 | 23/25 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-045 | 1 | 21/24 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-046 | 1 | 27/27 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-047 | 1 | 23/22 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-048 | 3 | 20/22 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-049 | 1 | 20/21 | Bredde, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-050 | 1 | 39/0 | Bredde, S_FCODE | — |
| schema-051 | 3 | 9/7 | Bredde, S_FCODE | Dimensjon, S_FCODE |
| schema-052 | 1 | 29/27 | S_FCODE | S_FCODE |
| schema-053 | 2 | 23/9 | S_FCODE | Dimensjon, S_FCODE |
| schema-054 | 2 | 23/7 | S_FCODE | S_FCODE |
| schema-055 | 3 | 8/0 | S_FCODE | — |
| schema-056 | 28 | 16/0 | MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, Tema | — |
| schema-057 | 4 | 14/0 | MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, Tema | — |
| schema-058 | 4 | 15/4 | S_FCODE | S_FCODE |
| schema-059 | 1 | 3/3 | S_FCODE | S_FCODE |
| schema-060 | 7 | 18/5 | S_FCODE | S_FCODE |
| schema-061 | 1 | 2/2 | S_FCODE | S_FCODE |
| schema-062 | 1 | 2/2 | S_FCODE | S_FCODE |
| schema-063 | 1 | 0/33 | — | DIM, Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-064 | 1 | 0/35 | — | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-065 | 3 | 0/33 | — | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-066 | 2 | 0/33 | — | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-067 | 6 | 0/31 | — | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-068 | 2 | 0/30 | — | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-069 | 1 | 0/32 | — | Dimensjon, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, S_FCODE |
| schema-070 | 1 | 0/8 | — | S_FCODE |
| schema-071 | 1 | 0/24 | — | S_FCODE |
| schema-072 | 1 | 0/2 | — | S_FCODE |

## 15. What this evidence confirms

### Strengthened census conclusions

- All 41 canonical direct source property names occur in this GMI sample.
- Canonical field identity can remain geometry-neutral for the five point/line duplicate concepts.
- Unsuffixed InnvendigUtvendig, Tykkelse, NOBB-VAVVS-nr, and S_HYPERLINK are real point/line header properties.
- None of the nine legacy geometry-suffixed field keys is a literal header in the sample.
- The prior five BROKEN_LIKELY suffix records now have direct corpus support for the same failure mechanism as the two live-confirmed records.
- S_FCODE is a dominant practical GMI identity header, especially for lines.
- Direct Tema is also a real GMI header, primarily for points.
- Direct Nøyaktighet/MålemetodeHøyde/NøyaktighetHøyde are real and coexist; the H_* routing remains unsupported.
- Direct Bredde and direct Dimensjon have strong geometry-separated occurrence patterns; broad DIM aliases are unsafe.
- HREF is no longer merely hypothetical: it occurs in both geometry contexts, though semantic authority remains unresolved.

### Weakened or contradicted prior uncertainty

- “No real GMI header proof” is no longer true for the 41 direct source properties within this corpus.
- The exact practical-memory spellings PTEMA/LTEMA are weakened for this sample because neither occurs in 182 files. The one-off dotted `.P_TEMA`/`.L_TEMA` pair means a structurally similar point/line naming family does exist in the sample, but its meaning and authority remain unproven.
- No source-semantic conclusion from the earlier audit is contradicted. This pass establishes format occurrence, not obligation or meaning.

## 16. What remains unresolved semantically

- formal S_FCODE→Tema authority and precedence when S_FCODE and Tema coexist;
- whether other Gemini versions use the exact PTEMA, LTEMA, or FCODE spellings;
- whether `.P_TEMA` and `.L_TEMA` carry canonical Tema identity, another application-specific concept, or only legacy-format compatibility data;
- whether HREF is an approved height-reference alias or only a local/export variant;
- whether rare point DIMENSJON can ever mean Bredde;
- meanings of DIM and uppercase DIMENSJON in their observed schemas;
- whether DATO/Dato should map to any canonical date field; the current Dato alias group remains inert;
- whether observed noncanonical fields outside the 41 concepts belong in future adapters;
- any SOSI or KOF authority; this evidence is GMI-only;
- value equivalence, conflict, and precedence because values were intentionally never inspected.

## 17. Recommended V2 adapter decisions now safe to make

1. Define the 41 canonical fields independently of geometry.
2. Add direct GMI mappings for the exact Innmålingsinstruks source properties observed in this corpus.
3. Permit a unique case-insensitive spelling of a direct property as lexical normalization, while reporting ambiguity if multiple spellings coexist with conflicting presence.
4. Map unsuffixed InnvendigUtvendig, Tykkelse, NOBB-VAVVS-nr, and S_HYPERLINK to their shared canonical fields; keep point/line in rule applicability.
5. Do not create mappings for the nine configured `_punkt`/`_led` logical keys.
6. Map Bredde directly to `width` for point rules and Dimensjon directly to `dimension` for line rules.
7. Map the exact canonical Nøyaktighet/MålemetodeHøyde/NøyaktighetHøyde fields separately.
8. Recognize S_FCODE as an observed GMI identity candidate with explicit unresolved semantic authority; recognize direct Tema as source-authoritative when delivered; retain `.P_TEMA` and `.L_TEMA` only as observed, unmapped candidates pending proof.
9. Preserve the literal source key and mapping kind in every resolution result.
10. Keep one selected layer as the entire resolution boundary.

## 18. Decisions that must wait

- promoting S_FCODE to validation-authoritative Tema;
- accepting PTEMA, LTEMA, or FCODE;
- mapping `.P_TEMA` or `.L_TEMA` to canonical Tema;
- accepting H_MÅLEMETODE/H_NOYAKTIGHET or routing them to any canonical field;
- accepting DIM/DIMENSJON/DIAMETER as point Bredde;
- promoting HREF, PN, SN, NETTTYPE, MATERIALE, MATR, METODE, or other aliases solely from occurrence or absence;
- choosing precedence when multiple candidate headers coexist;
- deriving object identity from field values;
- enabling SOSI/KOF validation based on this GMI evidence.

## 19. Regression tests to add later

Collector tests to retain/extend:

- deterministic output regardless of directory enumeration order;
- mixed Latin-1 and UTF-8 header decoding without replacement characters;
- repeated point/line definition sections union safely;
- malformed/read failures increment only aggregate counters;
- no path or filename appears in thrown/CLI errors;
- no `_FIELDVALUES`, coordinate, ID, or extent content enters output;
- neutral schema IDs remain deterministic for identical inputs;
- exact and case-insensitive observations remain distinct.

Future V2 adapter tests:

- direct source-property resolution for all 41 canonical fields;
- all seven unsuffixed suffix-bug families;
- Tema and S_FCODE as separate provenance-bearing candidates;
- PTEMA/LTEMA/FCODE rejected as unresolved until approved;
- `.P_TEMA` remains unresolved and is never silently mapped;
- `.L_TEMA` remains unresolved and is never silently mapped;
- H_* aliases rejected rather than routed to Nøyaktighet;
- Bredde and Dimensjon remain separate across point/line layers;
- DIM/DIMENSJON ambiguity produces no guessed compliance;
- one selected layer cannot borrow a header from another layer;
- missing/unknown Tema gates downstream object-specific rules.

## 20. Recommended next action

Hold a short format/domain review focused on only three decisions:

1. approve or reject S_FCODE as a validation-authoritative GMI representation of Tema, including coexistence precedence, and separately determine whether `.P_TEMA`/`.L_TEMA` have any legitimate mapping;
2. confirm that the direct Høyde/Nøyaktighet names are canonical and H_* aliases should remain disabled;
3. confirm that point width maps only from Bredde unless a separately evidenced profile says otherwise.

After those decisions, create a non-executable GMI adapter specification and synthetic adapter tests. Do not patch the frozen legacy validator as part of that work.
