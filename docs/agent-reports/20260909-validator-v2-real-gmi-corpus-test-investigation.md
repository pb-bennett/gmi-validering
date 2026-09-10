# Validator 2.0 v3.2 real GMI corpus test investigation

Date: 2026-09-09. Scope: research only. The v3.2 manual decisions remain the authority; corpus frequency was used only to find representative and adverse inputs.

## Executive summary

The combined FK and HK local reference corpus contains 179 GMI files (FK 54; HK 125). All 179 satisfy the inspector's structural parse threshold: `[GMIFILE_ASCII]` plus at least one recognized point or line field-definition section, and all 179 complete the repository `GMIParser` without a thrown exception or parser error. There are no `BROKEN_PARSE` candidates in this corpus.

Filesystem modification years range from 2019 to 2026: 84 files are dated 2025 and three are dated 2026. Recent files are usually fuller and more coherent, but this is not universal; several 2025 files are intentionally retained as poor robustness examples. Older files often have sparse schemas and historical omissions, which makes them useful compatibility input rather than authority for v3.2 rules.

The proposed local-only set has 17 files: four representative modern deliveries, five edge cases, five legacy-poor deliveries, and three very-bad deliveries. This is deliberately compact: the selected cases cover all naturally observed high-value patterns without retaining multiple near-identical sparse files. No real source file is copied into the repository.

## Corpus quality overview

The deterministic structural/value-profile classifier produced:

| Classification | Files |
|---|---:|
| GOOD_MODERN | 57 |
| USEFUL_EDGE_CASE | 41 |
| LEGACY_POOR | 49 |
| VERY_BAD | 32 |
| BROKEN_PARSE | 0 |

The classifier is a selection aid, not a validator result. `VERY_BAD` means extremely sparse structure, no usable objects, or several independently suspicious bounded conditions; it does not claim an operational delivery is unusable for every purpose.

## Selected real test set

| IDs | Category | Geometry | Primary use |
|---|---|---|---|
| real-modern-01 to real-modern-04 | GOOD_MODERN | mixed | Representative current parser/validator smoke tests; common point applicability and ordinary plastic/non-plastic hydraulic combinations. |
| real-edge-01 | USEFUL_EDGE_CASE | mixed | Special/uncertain hydraulic classification, invalid/unlisted material evidence, and missing identity cases. |
| real-edge-02 | USEFUL_EDGE_CASE | mixed | The rare real coexistence evidence: both agreeing and disagreeing Tema/S_FCODE objects; also low dimension and several supplied optional point fields. |
| real-edge-03 to real-edge-05 | USEFUL_EDGE_CASE | mixed | Older-`NYTT`, missing years, pressure fields supplied/absent, uncommon material, and line relationship variation. |
| real-legacy-01 | LEGACY_POOR | mixed | Old date, invalid/unlisted material, non-plastic Ringstivhet, and identity anomalies. |
| real-legacy-02 | LEGACY_POOR | point | Zero XY and height accuracy values with a Tema-only schema. |
| real-legacy-03 to real-legacy-05 | LEGACY_POOR | mixed | 2019-era profile, method 97, sparse current-field population, and missing installation year. |
| real-verybad-01 | VERY_BAD | mixed | Dense cross-family omissions and mixed material/hydraulic conditions. |
| real-verybad-02 | VERY_BAD | mixed | Identity absent from delivered objects. |
| real-verybad-03 | VERY_BAD | mixed | Minimal S_FCODE-only legacy profile. |

All selected paths, local reasons, corpus group, and scenario tags are in the gitignored manifest. FK/HK is used there only as a coarse local corpus group.

## Manual-v3.2 scenario coverage

Counts below are files with at least one observed bounded condition, not object counts. Header evidence covers every canonical field somewhere in the combined corpus; field presence alone is not proof that a rule outcome can be asserted.

| Field/rule family | Natural coverage | Pass 2 assessment |
|---|---|---|
| Anleggsår, Datafangstdato, Stedfestingsårsak | `NYTT` missing year 16, old `NYTT` year 3, non-`NYTT` missing year 8, old date 4; date-before-installation was not observed. | REAL_RARE; synthetic exact years, malformed/future dates, date-before-year, and dataset-level shared-year cases required. |
| Innmålt_av, Saksnummer, Merknad | Headers common; supplied text exists but text content/placeholder/length is deliberately not retained. | REAL_MESSY; synthetic blank, whitespace, placeholder, and 255/256 Unicode boundaries required. |
| Høydereferanse, Stedfestingsforhold, Eier, Vertikalnivå | Headers represented; no privacy-safe value classification was retained except the manual code domain. | REAL_MESSY; synthetic approved, UKJENT/AN/uncommon, missing, and invalid values required. |
| Målemetode, Nøyaktighet, height equivalents | Method 96 in 127 files, method 97 in 4, XY zero in 3, height zero in 3. `real-legacy-02/03` are useful. | REAL_GOOD for examples; synthetic thresholds, malformed/negative, and all approved uncommon methods required. |
| MaksAvvikVertikalt / MaksAvvikHorisontalt | Headers represented; no value-range profile retained. | SYNTHETIC_REQUIRED_ANYWAY. |
| Synbarhet | Header represented; retired-field behavior has no meaningful real outcome need. | SYNTHETIC_REQUIRED_ANYWAY. |
| Tema / S_FCODE identity | S_FCODE-only 136, Tema-only 32, both agree 1, both disagree 3, neither 36. `real-edge-02` covers the rare coexistence cases. | REAL_GOOD for source modes; synthetic schema coexistence, invalid codes, per-object conflict, and dependency suppression required. |
| Type | Header represented but compatibility values were not retained. | SYNTHETIC_REQUIRED_ANYWAY. |
| Kumform, Bredde, Tykkelse, Avst_BunnInnvUnderUtv, Byggemetode, Kjegle, Adkomst | Supplied in 80, 81, 63, 26, 77, 70, and 42 files respectively. Selected modern/edge cases have mixed point data. | REAL_GOOD for supplied-field smoke coverage; synthetic APPLICABLE/NOT_APPLICABLE/UNKNOWN missingness, LOK, STR, KRN, and malformed/boundary values required. |
| Lengde, Utvendig_høyde, AnleggsID | Supplied in 6, 7, and 48 files. `real-modern-03` and `real-edge-02` are useful. | REAL_RARE; synthetic absence, zero, negative, malformed, and informational-Sjekk cases required. |
| InnvendigUtvendig | Header represented in 173 files. | REAL_MESSY; synthetic ID/OD/missing/invalid required. |
| S_HYPERLINK | Supplied in 44 files. No path/text was retained, and LOK/TOP attachment association was not inferred. | REAL_RARE; synthetic LOK/TOP supplied and normal expected/missing cases required. |
| NOBB-VAVVS-nr and -ramme | Supplied in 24 and 10 files. | REAL_RARE; synthetic integer, malformed, and geometry coverage required. |
| Nett_type | Header represented in 110 files; value categories not retained. | SYNTHETIC_REQUIRED_ANYWAY. |
| Material and Dimensjon | Common PE/PE100/PVC, several uncommon valid materials, invalid/unlisted material evidence in 5 files, and low dimension in 4. | REAL_GOOD for parser/robustness; synthetic complete code list, invalid values, zero/decimal/negative dimensions required. |
| Rørform / VertikalDimensjon | Circular S in 104 files. Non-S vertical/missing patterns were not naturally observed by this scan. | REAL_RARE; synthetic all forms, A/X, non-S requiredness, small vertical values, and circular supplied vertical required. |
| SDR | Plastic pressure supplied 70, plastic pressure missing 34, non-pressure supplied 23. | REAL_GOOD; synthetic invalid SDR, explicit suction, non-plastic pressure, and deterministic classifier boundaries required. |
| Ringstivhet | Plastic gravity supplied 61, missing 55; pressure supplied 13; non-plastic supplied 2. GUP occurs in one selected modern case. | REAL_GOOD for broad relations; synthetic explicit gravity bucket, GRP/GUP, invalid SN, and suction/uncertain behavior required. |
| Trykklasse | Pressure supplied 60, pressure missing 58, non-pressure supplied 5. | REAL_GOOD; synthetic complete PN list, suction uncertainty, invalid value, and non-pressure absence required. |

The remaining canonical field coverage is structural and deliberately represented in the matrix above: all 41 direct canonical source names occur in at least one point or line schema. The prior header-evidence report remains the authoritative detailed lexical census.

## Hydraulic findings

The corpus has useful Tema-plus-Material combinations: 95 files have a plastic pressure profile, 94 a plastic gravity profile, 13 a non-plastic pressure profile, and 12 a non-plastic gravity profile under the conservative scanner classifier. Eight files are plastic special/uncertain and one is non-plastic special/uncertain. These classifications use only Tema plus Material; the scanner does not infer category from SDR, Ringstivhet, or Trykklasse population.

Pressure SDR is naturally both present and absent, gravity Ringstivhet is naturally both present and absent, and pressure Trykklasse is naturally both present and absent. This makes the selected modern and edge deliveries appropriate for bounded headless relationship smoke tests. The manual's explicit gravity Tema inventory remains unresolved, so these are research profiles rather than proposed implementation authority.

## Very bad / legacy findings

Real adverse inputs are mostly sparse or historical rather than unparseable. They include absent identity on objects, very small schemas, missing current fields, old dates, identity coexistence/conflict, invalid/unlisted material, mixed material/hydraulic combinations, and weak completeness that would generate many dependent findings. `real-verybad-01` tests a broad mixed profile; `real-verybad-02` tests identity absence; `real-verybad-03` tests minimal legacy S_FCODE structure.

## Headless test recommendations

For each local ID, load the manifest path directly into the GMI parser, then pass the parsed data to the V2 runner for one explicit layer. Assert only stable high-level facts: parsing and validation complete without an exception; expected point/line/mixed geometry exists; its named scenario is observed; relevant rule families produce a bounded, non-catastrophic result; and an identity conflict does not trigger a duplicate downstream cascade. Do not snapshot full object findings or use operational identifiers.

The current V2 runner implements only a limited baseline rule set, so these are future regression recommendations rather than assertions to add now. Synthetic Pass 2 fixtures should own exact result/count expectations.

## Synthetic coverage gaps for Pass 2

Create deterministic fixtures for all exact numeric/date boundaries; malformed values; future values; field missingness by applicability state; every approved/unapproved code-list partition; Tema/S_FCODE schema coexistence and disagreement; dependency suppression; `LOK`/`TOP` hyperlink behavior; Type compatibility; non-S vertical dimension; explicit pressure/suction/gravity/special classifications; GRP/GUP; and text/Unicode boundaries. Also fabricate parser failure cases because this corpus contains none.

## Unresolved questions

The manual itself leaves the explicit confidently-gravity Tema list for Ringstivhet to domain confirmation. It also records the line-Tykkelse integer-versus-source decimal discrepancy. The corpus cannot determine the semantic authority of legacy identity variants, attachment paths, text placeholders, or a policy for the operationally observed unusual structures; none should be inferred from this investigation.

## Research-tool verification and privacy

`tests/research/inspect_real_gmi_corpus.test.js` passed using fabricated temporary GMI input. It verifies deterministic aggregate output and that the aggregate contains no source filename/path, object ID, coordinates, or arbitrary text. The existing `tests/research/collect_gmi_header_evidence.test.js` also passed. A corpus-wide actual `GMIParser` run completed 179/179 files with zero throws and zero parser errors. The new inspector reads originals only; it does not copy or modify them. The tracked report contains no operational source identity, object ID, coordinate, raw row, free text, or attachment path.
