# Innmålingsinstruks rule-source mapping

**Research date:** 2026-08-20
**Branch reviewed:** `research/validator-v2-rule-source-mapping`
**Primary sources:** bundled Innmålingsinstruks v3.1 PDFs
**Scope:** research and documentation only; no runtime, test, dependency, or rule-data changes

## 1. Executive summary

Both bundled PDFs were reviewed page by page: all 29 pages of the main instruction and all 30 pages of Appendix A. The main document governs measurement practice, geometry, accuracy, documentation, file delivery, and relationships between objects. Appendix A governs the import-field vocabulary, field formats, code tables, and the star-marked field semantics. Appendix A's cover says version 3.1 July 2023, but its revision table stops at 3.0 and every footer says version 3.0. That internal version conflict must be resolved before a V2 rule-set revision is declared authoritative.

The 46 effective fields in `fields.json` all have a recognizable Appendix A field. Mapping confidence is **22 CONFIRMED, 23 PARTIAL, 1 UNCLEAR, 0 NOT FOUND**. “Found” does not mean the application implements the source correctly. Partial mappings include incorrect required states, unsupported object-code applicability, incomplete or mistranscribed code sets, and conditional prose that the application simplifies.

All 23 current allowed-value sets were compared. Fifteen are exact transcriptions, three are application subsets of source lists, four contain apparent code transcription errors, and one (`SDR`) changes source code strings such as `6.0` into JSON numbers. The main instruction p. 25 also says an explanatory description is used in the same field when a suitable code is unavailable. It is unclear whether that exception applies only to Tema/object codes or more broadly; therefore a strict closed-list Tema rule needs a domain decision.

The four proposed V2 starter rules remain recommended for a GMI-only first slice:

- `innmaling.common.height-reference.required`
- `innmaling.common.height-reference.allowed-value`
- `innmaling.point.tema.required`
- `innmaling.line.tema.required`

They now have direct source evidence in Appendix A pp. 5–7 and pp. 11–13/19–21, plus the main instruction pp. 10, 13, and 18. The two Tema presence rules are safe; migrating the full Tema code lists is not, because of source fallback wording and current transcription errors.

The machine-readable map contains **83 concise source-rule records**: 46 field requirement records, 23 value-set records, and 14 cross-field/geometry/dataset records. This report identifies **32 source-requirement gaps or incorrectly represented capabilities** and prioritizes **10 domain-owner decisions**.

### Evidence vocabulary

- **SOURCE CONFIRMED** — explicitly located in a cited document page/section/table.
- **CURRENT APP BEHAVIOUR** — observed in repository data or executable code.
- **INFERENCE** — a reasoned interpretation that is not explicit source text.
- **DOMAIN DECISION REQUIRED** — source conflict, ambiguity, or business policy that must not be guessed.

## 2. Source-document map

### 2.1 Main instruction

| Item | Map |
| --- | --- |
| Title | *Vann og avløp – Innmålingsinstruks* |
| Version/date | Version 3.1, July 2023 (cover and footers) |
| Length | 29 pages |
| Purpose | Measurement execution, accepted accuracy/equipment, object geometry, documentation, and import/delivery workflow |
| Revision | p. 5: revision 3.10, July 2023, adjustments based on Volue workflows and data-flow tests |
| Major sections | Introduction/background pp. 4–5; terms pp. 6–8; measurement scope p. 9; coordinate/accuracy requirements pp. 10–12; point objects pp. 13–17; lines pp. 18–20; carriers/boreholes/spunt/tunnels pp. 21–23; inaccessible point p. 24; documentation/codes/numbering pp. 25–26; accepted delivery/import flow pp. 27–29 |
| Appendices referenced | Appendix A; LAGS Appendix C for accuracy; LAGS Appendix D for land-survey report |
| External references | Ledningsregistreringsforskriften; Kartverket LAGS standard and product specifications; municipal VA norm; Norsk Vann SOSI-GML AsBuilt specification; Kartverket hydrographic standard |

Key source-confirmed requirements include:

- all measured objects are coordinate-fixed in north/east/height and carry measurement-quality properties (p. 10);
- normal delivery uses EUREF89/UTM by zone, orthometric NN2000 heights, and file-declared EPSG/height reference (p. 10);
- standard deviation must be 3 cm or better horizontally and 5 cm or better vertically unless otherwise agreed (p. 10);
- point and line measurement/geometry practices on pp. 13–24;
- report, images, object IDs, and file naming on pp. 12 and 25–27;
- accepted formats and two-step GMI/GML or GML/GML workflows on pp. 27–29.

### 2.2 Appendix A

| Item | Map |
| --- | --- |
| Title | *Innmålingsinstruks Vedlegg A – Spesifikasjon innmålingsfil* |
| Cover version/date | Version 3.1, July 2023 |
| Conflicting internal version | Revision table ends at 3.0; footers say version 3.0 |
| Length | 30 pages |
| Purpose | Required/optional field inventory, exact import names, formats, code/value tables, and brief field descriptions |
| Major sections | Introduction/revision/contents pp. 1–4; required fields and star legend pp. 5–6; common fields pp. 6–10; point fields/value tables pp. 11–18; line fields/value tables pp. 19–25; complete measurement-method lists pp. 26–30 |
| Tables | Common field format tables; code/label/description tables; point Tema/Type/Kumform; line Tema/Nett_type/Material/Rørform/SDR/Ringstivhet/Trykklasse; full measurement-method tables |

Appendix A p. 5 defines the star legend:

| Mark | Source meaning |
| --- | --- |
| no star | Listed under fields that shall be filled; treated by the document as obligatory |
| `*` | Optional, but desired |
| `**` | Only for suppliers using Gemini Terreng |
| `***` | Omitted where a polygon is used as the boundary |
| `****` | Supplied where available |
| `*****` | Optional |

It also says field/property names must not be changed because import depends on them. This supports exact source names, not the application's parser aliases.

### 2.3 Referenced standards checked

The main document incorporates policy from the Kartverket LAGS standard but deliberately simplifies some of it. The official [LAGS standard register](https://register.geonorge.no/standarder/sosi/standarder-geografisk-informasjon/stedfesting-av-ledninger-og-andre-anlegg-i-grunnen-sj%C3%B8-og-vassdrag) identifies version 1.0, approved 2019-01-01. The [official standard PDF](https://standarder.geonorge.no/sosi/standarder-geografisk-informasjon/test/1.0/stedfesting-av-ledninger-og-andre-anlegg-i-grunnen-sjo-og-vassdrag-versjon-10-standarder-geografisk-informasjon.pdf) varies maximum deviation and point spacing by area type. The main instruction p. 10 explicitly says it ignores LAGS's area-type accuracy variation, and pp. 4/19 set its own general 20 cm/30 cm and 8 m policies. The current [Ledningsregistreringsforskriften](https://lovdata.no/nav/forskrift/2020-12-18-2986) requires documentation in accordance with a Kartverket or equivalent standard but does not define `Z=0` as missing.

## 3. Methodology and limitations

1. Read the architecture audit first and used it only to locate current policy; it was not treated as domain authority.
2. Extracted each PDF page separately. The PDFs have incomplete selectable-text layers, so page images were rendered locally and OCR output was checked against the rendered page for high-risk tables and footnotes.
3. Compared `fields.json`, both dormant rule JSON files, active field and Z validators, parsers, and validation UI wording.
4. Compared value tokens, not merely labels. Apparent OCR/transcription confusions were visually verified where consequential.
5. Checked the official LAGS register/standard and current regulation only for questions the bundled documents explicitly delegate to them.

Limitations:

- “Exact” means the current tokens match the visible bundled Appendix A table; it does not certify that Volue/Gemini's current code set has not changed since 2023.
- The PDFs do not specify case/whitespace normalization, empty-value encoding, or all source-format mappings.
- Many geometry requirements depend on physical reality, attachments, or project context unavailable in a single parsed layer. They may be source requirements without being safely machine-checkable.
- Appendix A's version conflict and the main-document free-text code fallback remain unresolved.
- No legacy behaviour was changed or endorsed as source truth.

## 4. Current 46-field source mapping

Legend: `P` = point, `L` = line, `Y/N` = acceptable values present/absent, description is current metadata presence. Dispositions use the requested wording.

| # | Current fieldKey / label | Scope; current state | Values; format; desc. | Source and paraphrase | Confidence | Discrepancy | V2 disposition |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `Høydereferanse` / Høydereferanse | P+L; always | Y; Kode; yes | App. A pp. 5, 7; main pp. 10, 13, 18: every measured object/point has a height reference | CONFIRMED | None for presence; aliases are not source rules | safe to migrate |
| 2 | `Målemetode` | P+L; always | Y; Kode; yes | App. A pp. 5, 7, 26–29: mandatory; p. 7 is only “most used,” pp. 26–29 are complete | PARTIAL | App allows only four codes and rejects other listed codes | migrate after clarification |
| 3 | `Nøyaktighet` | P+L; always | N; Heltall; yes | App. A pp. 5, 8; main p. 10: integer cm and horizontal standard deviation ≤3 cm unless agreed | PARTIAL | App checks presence only, not integer/range | migrate after clarification |
| 4 | `MålemetodeHøyde` | P+L; always | Y; Kode; yes | App. A pp. 5, 8, 29–30: mandatory; four common and larger full list | PARTIAL | App allows only four common codes | migrate after clarification |
| 5 | `InnvendigUtvendig_punkt` / InnvendigUtvendig | P; always | Y; Kode; no | App. A pp. 5, 15; main p. 10: identify dimension as inner/outer | CONFIRMED | None for value tokens | safe to migrate |
| 6 | `Tykkelse_punkt` / Tykkelse | P; always | N; Heltall; yes | App. A pp. 5, 15: wall thickness in mm for exterior-volume derivation | CONFIRMED | Format is not executed | safe to migrate |
| 7 | `Byggemetode` | P; always | Y; Kode; no | App. A pp. 5, 16: unstarred point field and 15 codes | PARTIAL | Code applies only to `KUM/LOK/SAN/SLS/SLU`; source gives no such list | migrate after clarification |
| 8 | `Adkomst` | P; always | Y; Kode; no | App. A pp. 5, 17: `*`, optional but desired | PARTIAL | App says always required | do not migrate yet |
| 9 | `Kjegle` | P; conditional | Y; Kode; no | App. A pp. 5, 17: unstarred point field and five codes | PARTIAL | App narrows to `KUM/SAN/SLS/SLU` without source evidence | migrate after clarification |
| 10 | `NOBB-VAVVS-nr-ramme` | P; always | N; Heltall; yes | App. A pp. 5, 18: unstarred, integer, usually seven digits | CONFIRMED | “Usually seven digits” is not a strict length rule | safe to migrate |
| 11 | `Dimensjon` | L; always | N; Heltall; yes | App. A pp. 6, 23: nominal dimension in mm | CONFIRMED | Integer format not executed | safe to migrate |
| 12 | `Anleggsår` | P+L; always | N; YYYY; yes | App. A pp. 5–6: mandatory installation year, `YYYY` | CONFIRMED | Format not executed | safe to migrate |
| 13 | `Merknad` | P+L; optionalAlt | N; Tekst; yes | App. A pp. 5, 9: `*****` optional; max 255 characters | CONFIRMED | `optionalAlt` is an app label; max length not checked | safe to migrate |
| 14 | `Tema_punkt` / Tema | P; always | Y; Kode; no | App. A pp. 5, 11–13: mandatory point Tema and code table | PARTIAL | App omits seven `I2*` codes; source calls field `Tema`, not `Tema_punkt` | migrate after clarification |
| 15 | `Type` | P; conditional | Y; Kode; no | App. A pp. 5, 13–14: `****`, where available, and code table | PARTIAL | App invents three-code applicability; four `DB*` values are stored as `D8*` | do not migrate yet |
| 16 | `Kumform` | P; conditional | Y; Kode; no | App. A pp. 5, 14: unstarred point field, seven codes | PARTIAL | App narrows applicability without source evidence | migrate after clarification |
| 17 | `AnleggsID` | P; conditional | N; Tekst; yes | App. A pp. 5, 17: `****`, where available; main p. 25 says all point objects carry AnleggsID or SID | UNCLEAR | Two source statements differ; app implements no actual condition and checks every point | do not migrate yet |
| 18 | `NOBB-VAVVS-nr_punkt` / NOBB-VAVVS-nr | P; always | N; Heltall; yes | App. A pp. 5, 17: unstarred integer, usually seven digits | CONFIRMED | Format/typical length not checked | safe to migrate |
| 19 | `Ringstivhet` | L; always | Y; Kode; yes | App. A pp. 6, 24: obligatory for self-fall lines of plastic | PARTIAL | App's applicability is every inferred gravity line, not plastic gravity lines | migrate after clarification |
| 20 | `Datafangstdato` | P+L; always | N; DD.MM.YYYY; yes | App. A pp. 5–6: mandatory measurement date in displayed format | CONFIRMED | Format/calendar validity not checked | safe to migrate |
| 21 | `Innmålt_av` | P+L; always | N; Navn; yes | App. A pp. 5–6: contractor plus surveyor initials/name | CONFIRMED | `Navn` has no machine syntax beyond text | safe to migrate |
| 22 | `Stedfestingsforhold` | P+L; always | Y; Kode; yes | App. A pp. 5, 8–9: mandatory and ten codes | CONFIRMED | Exact set; open-trench policy is not enforced | safe to migrate |
| 23 | `Eier` | P+L; optionalAlt | Y; Kode; no | App. A pp. 5, 9–10: `*****` optional and 12 codes | CONFIRMED | `optionalAlt` is app terminology only | safe to migrate |
| 24 | `Vertikalnivå` | P+L; optionalAlt | Y; Kode; no | App. A pp. 5, 10: unstarred and seven codes | PARTIAL | Source presents it as mandatory; app makes it optional and stores `!_VANNSØYLEN` instead of `I_VANNSØYLEN` | do not migrate yet |
| 25 | `Bredde (diameter)` | P; polygonExcluded | N; Heltall; yes | App. A pp. 5, 14: omitted where polygon is boundary; mm | PARTIAL | App also restricts to five object codes; source condition is geometric, not that list | migrate after clarification |
| 26 | `Utvendig_høyde` | P; always | N; Heltall; yes | App. A pp. 5, 16: marked optional on list, while prose describes need for selected non-circular/prefabricated installations | PARTIAL | Source itself is tensioned; app requires it for all points | do not migrate yet |
| 27 | `S_HYPERLINK_punkt` / S_HYPERLINK | P; geminiOnly | N; Tekst; yes | App. A pp. 5, 17: only Gemini Terreng; generated attachment path | CONFIRMED | Source format says `Generert`, not `Tekst`; active code ignores state | migrate after clarification |
| 28 | `Tema_led` / Tema | L; always | Y; Kode; no | App. A pp. 6, 19–21: mandatory line Tema and code table | PARTIAL | Five `I2*` codes are stored as numeric-looking `12*`; source calls field `Tema` | do not migrate yet |
| 29 | `Nett_type` | L; always | Y; Kode; no | App. A pp. 6, 21–22: mandatory and five codes | CONFIRMED | It does not encode pressure/gravity despite classifier assumptions | safe to migrate |
| 30 | `VertikalDimensjon` | L; always | N; Heltall; yes | App. A pp. 6, 23: alternative to dimension for non-circular pipes | PARTIAL | App requires it for every line | migrate after clarification |
| 31 | `SDR` | L; always | Y; Desimal; yes | App. A pp. 6, 24: obligatory code for pressure lines | PARTIAL | Source is `Kode` strings with one decimal; app uses numbers/Desimal and heuristic pressure inference | migrate after clarification |
| 32 | `S_HYPERLINK` | L; geminiOnly | N; Tekst; yes | App. A pp. 6, 25: only Gemini Terreng; generated attachment path | CONFIRMED | Source format is `Generert`; active code ignores state | migrate after clarification |
| 33 | `Saksnummer` | P+L; always | N; Tekst; yes | App. A pp. 5–6: mandatory municipal project case number | CONFIRMED | No further syntax stated | safe to migrate |
| 34 | `NøyaktighetHøyde` | P+L; always | N; Heltall; yes | App. A pp. 5, 8; main p. 10: integer cm and vertical standard deviation ≤5 cm | PARTIAL | App checks presence only | migrate after clarification |
| 35 | `Stedfestingsårsak` | P+L; always | Y; Kode; no | App. A pp. 5, 9: mandatory and six codes | CONFIRMED | Exact set | safe to migrate |
| 36 | `Synbarhet` | P+L; always | Y; Kode; no | App. A pp. 5, 9: mandatory and codes `0`–`3` | CONFIRMED | Exact set; codes should stay strings | safe to migrate |
| 37 | `MaksAvvikHorisontalt` | P+L; always | N; Heltall; yes | App. A pp. 5, 10; main p. 4: integer cm; instruction adopts 20 cm ground-plan limit | PARTIAL | App checks presence only; LAGS itself varies by area type | migrate after clarification |
| 38 | `MaksAvvikVertikalt` | P+L; always | N; Heltall; yes | App. A pp. 5, 10; main p. 4: integer cm; instruction adopts 30 cm height limit | PARTIAL | App checks presence only; LAGS itself varies by area type | migrate after clarification |
| 39 | `Lengde` | P; always | N; Heltall; yes | App. A pp. 5, 15: point `Bredde (/ Lengde)` under the `***` polygon exception | PARTIAL | App makes separate length universally required and drops polygon condition | do not migrate yet |
| 40 | `Avst_BunnInnvUnderUtv` | P; always | N; Desimaltall; yes | App. A pp. 5, 16; main p. 14: decimal metres, obligatory for circular prefabricated installations | PARTIAL | App requires every point; source condition is narrower | migrate after clarification |
| 41 | `Material` | L; always | Y; Kode; no | App. A pp. 6, 22–23: mandatory and 39 codes | PARTIAL | App stores `PVC-0` (zero) where source has `PVC-O` (letter O) | do not migrate yet |
| 42 | `InnvendigUtvendig_led` / InnvendigUtvendig | L; always | Y; Kode; no | App. A pp. 6, 23; main p. 10: identify dimension as inner/outer | CONFIRMED | Exact set | safe to migrate |
| 43 | `Tykkelse_led` / Tykkelse | L; optional | N; Tall; yes | App. A pp. 6, 23: `*`, optional; value in mm with one decimal | CONFIRMED | One-decimal format is not enforced | safe to migrate |
| 44 | `Rørform` | L; always | Y; Kode; no | App. A pp. 6, 23–24: mandatory and seven codes | CONFIRMED | Exact set | safe to migrate |
| 45 | `Trykklasse` | L; optional | Y; Kode; no | App. A pp. 6, 25: `*`, optional for pressure lines; 15 codes | PARTIAL | Optional source semantics match, but pressure classification is a legacy heuristic and present values on gravity are warned as forbidden | migrate after clarification |
| 46 | `NOBB-VAVVS-nr_led` / NOBB-VAVVS-nr | L; always | N; Heltall; yes | App. A pp. 6, 25: unstarred integer, usually seven digits | CONFIRMED | Format/typical length not checked | safe to migrate |

## 5. Allowed-value comparison

The active validator trims the actual value and uses exact case-sensitive string comparison first, despite a comment claiming case insensitivity. It then applies permissive `parseFloat` comparison. Thus `11` equals source-like `11.0`, but malformed strings with numeric prefixes can also be accepted. The PDFs say nothing about case folding, trimming, or numeric normalization.

| Current field | Current count | Source reference | Classification | Material difference |
| --- | ---: | --- | --- | --- |
| Høydereferanse | 7 | App. A p. 7 | exact match | Exact tokens |
| Målemetode | 4 | App. A p. 7 and pp. 26–29 | application subset | Four “most used” values copied; full source list is larger |
| MålemetodeHøyde | 4 | App. A p. 8 and pp. 29–30 | application subset | Four common values copied; full source list is larger |
| InnvendigUtvendig_punkt | 2 | App. A p. 15 | exact match | `ID`, `OD` |
| Byggemetode | 15 | App. A p. 16 | exact match | Exact tokens |
| Adkomst | 5 | App. A p. 17 | exact match | Exact tokens |
| Kjegle | 5 | App. A p. 17 | exact match | Exact tokens |
| Tema_punkt | 72 | App. A pp. 11–13 | application subset | Source additionally lists `I2B`, `I2C`, `I2K`, `I2O`, `I2P`, `I2R`, `I2T` |
| Type | 22 | App. A pp. 13–14 | additional app values + missing source values | App `D811/D815/D822/D830`; source `DB11/DB15/DB22/DB30` |
| Kumform | 7 | App. A p. 14 | exact match | Exact tokens |
| Ringstivhet | 7 | App. A p. 24 | exact match | Exact tokens |
| Stedfestingsforhold | 10 | App. A pp. 8–9 | exact match | Exact tokens |
| Eier | 12 | App. A pp. 9–10 | exact match | Exact tokens |
| Vertikalnivå | 7 | App. A p. 10 | additional app value + missing source value | App `!_VANNSØYLEN`; source `I_VANNSØYLEN` |
| Tema_led | 73 | App. A pp. 19–21 | additional app values + missing source values | App `12`, `12D`, `121`, `120`, `12P`; source `I2`, `I2D`, `I2I`, `I2O`, `I2P` |
| Nett_type | 5 | App. A pp. 21–22 | exact match | `F/H/O/S/S6`; none means pressure/gravity |
| SDR | 12 | App. A p. 24 | formatting/normalisation difference | Source code strings retain `.0`; app JSON numbers lose lexical form |
| Stedfestingsårsak | 6 | App. A p. 9 | exact match | Exact tokens |
| Synbarhet | 4 | App. A p. 9 | exact match | Source codes are `0`–`3`; keep as strings |
| Material | 39 | App. A pp. 22–23 | additional app value + missing source value | App `PVC-0`; source `PVC-O` |
| InnvendigUtvendig_led | 2 | App. A p. 23 | exact match | `ID`, `OD` |
| Rørform | 7 | App. A pp. 23–24 | exact match | Exact tokens |
| Trykklasse | 15 | App. A p. 25 | exact match | Exact `PN*` strings |

**DOMAIN DECISION REQUIRED:** main instruction p. 25 permits an explanatory text in the same field when no suitable code exists. Before a V2 Tema allowed-value rule is enabled, decide whether Tema lists are closed, open-with-free-text, or require a separate “other description” convention. No leading-zero rule is stated. Case and whitespace significance are also unstated. Numeric normalization is clearly unsafe as a universal policy because codes include alphanumeric tokens and meaningful `.0` lexical forms.

## 6. Required-state semantics

| App state | Fields | Source support | Current execution versus source |
| --- | --- | --- | --- |
| `always` | 34 | Intended to model unstarred Appendix A fields, but includes `Adkomst*`, and universally applies several source-conditionals | Missing/invalid affects status. It does not enforce format. Several field-specific branches override universality. |
| `conditional` | Kjegle, Type, Kumform, AnleggsID | No single source concept. Type/AnleggsID map to `****` (“where available”); Kjegle/Kumform are unstarred | Missing values warn for hardcoded applicability. `AnleggsID` has no condition and therefore applies to every point. |
| `optional` | Tykkelse_led, Trykklasse | Directly corresponds to `*` for these two fields, but `Adkomst*` is not assigned this state | Missing and invalid values are counted/failing IDs but do not change status; a bad supplied optional value can appear `OK`. |
| `optionalAlt` | Merknad, Eier, Vertikalnivå | Appears intended for `*****`; valid for Merknad/Eier, not Vertikalnivå | State is not executed. Missing/invalid values can produce failing IDs under an `OK` card. |
| `geminiOnly` | S_HYPERLINK point/line | Explicit `**`: only Gemini Terreng suppliers | State is not executed; no source-format/Gemini predicate exists. |
| `polygonExcluded` | Bredde | Explicit `***`: omit where polygon is boundary | State is not executed by status logic. Hardcoded object-code applicability substitutes for the source geometry condition. `Lengde` shares the source expression but lacks this state. |

**SOURCE CONFIRMED:** the star legend is explicit on Appendix A p. 5.

**CURRENT APP BEHAVIOUR:** only `always` and `conditional` affect missing/invalid status. All fields still accumulate missing/invalid failure IDs.
**DOMAIN DECISION REQUIRED:** define supplied-invalid semantics for optional fields, resolve the `Utvendig_høyde` list/prose tension, and decide how “where available” can be represented without falsely demanding data.

## 7. Conditional-rule comparison

| Legacy check | Current code | Source comparison | Classification |
| --- | --- | --- | --- |
| Ringstivhet | Required/applicable when legacy classifier returns gravity | App. A pp. 6, 24 says obligatory for **self-fall lines of plastic** | PARTIAL — plastic condition is omitted; classifier is heuristic |
| SDR | Required/applicable when classifier returns pressure | App. A pp. 6, 24 says obligatory for pressure lines | PARTIAL — condition is source-backed, classification is not |
| Trykklasse | Applicable only to pressure; a value on gravity is “unexpected” | App. A pp. 6, 25 says optional for pressure lines | PARTIAL — no source statement forbids it elsewhere; classifier is heuristic |
| Bredde | Only `KUM/LOK/SAN/SLS/SLU` | Source condition is omission when polygon defines boundary; main pp. 14–15 discusses geometry | CONTRADICTS SOURCE — object-code list substitutes a different condition |
| Byggemetode | Only `KUM/LOK/SAN/SLS/SLU` | Unstarred point property on App. A p. 5; no code list given | SOURCE NOT FOUND for the legacy subset |
| Kumform | Only `KUM/SAN/SLS/SLU` | Unstarred point property on App. A p. 5; no code list given | SOURCE NOT FOUND for the legacy subset |
| Kjegle | Only `KUM/SAN/SLS/SLU` | Unstarred point property on App. A p. 5; no code list given | SOURCE NOT FOUND for the legacy subset |
| Type | Only `FORAKONSTR/DIV/GRØKONSTR` | App. A p. 5 says where available; no code list given | LEGACY HEURISTIC; additionally `FORAKONSTR` does not match source/current Tema `FORAKONST` |
| AnleggsID | `conditional` metadata but no branch; applies to all points | App. A says where available; main p. 25 says AnleggsID or SID for all points | REQUIRES DOMAIN DECISION |
| Pressure/gravity | Pressure when Tema contains `VL`/`VANN`, Nett_type text contains `TRYKK`, Tema contains `TR`, material looks steel, or SDR/Trykklasse is present; otherwise gravity | PDFs define conditional fields but no classifier. `Nett_type` codes describe network role, not hydraulic regime | LEGACY HEURISTIC |
| Non-applicable supplied value | Always counted as unexpected and warns | No general forbidden-value rule located | SOURCE NOT FOUND |

Classifier consequences include likely misclassification: source pressure codes such as `AFP`, `OVP`, and `SPP` do not necessarily meet the current checks; `LETRA` contains `TR` and may be classified as pressure; steel material alone forces pressure; unknown always becomes gravity. V2 must represent `unknown` and skip/flag classification-dependent checks until a domain-approved classifier exists.

## 8. Object/Tema mapping

### 8.1 Source rule

Appendix A uses one canonical property name, `Tema`, in separate **Gjelder for punktobjekt** and **Gjelder for ledning** sections (pp. 11–13 and 19–21). The geometry distinction is document structure, not a source suffix. Main instruction pp. 13–23 distinguishes point objects, line objects, and polygon boundaries. `S_FCODE`, `Tema_punkt`, and `Tema_led` do not occur as canonical source property names in either PDF.

### 8.2 Parser adaptation

- GMI parser preserves `_FIELDNAMES` literally and coerces integer/decimal-looking values to JavaScript numbers.
- Active validation resolves `Tema_punkt`/`Tema_led` through `S_FCODE`, `Tema`, `TEMA`, or `FCODE`, then case-insensitive key fallback.
- SOSI parser invents `S_FCODE` from `objekttypenavn`/related names. Some mappings do not produce source codes (`ANBORING`, `TELE`), some point mappings produce line Tema (`VL`, `SP`), and polygons are treated as lines for visualization.
- KOF parser assigns `S_FCODE` from KOF point code/name/section or fallback strings. Those values are survey/file codes, not proven Appendix A Tema values.

### 8.3 Application heuristic

Field applicability and hydraulic classification consume the adapted `S_FCODE` as though it were authoritative Tema. This goes beyond the source. A parser-supplied guess must be provenance-bearing evidence, not silently equivalent to a source field.

### 8.4 Format support conclusion

- **GMI:** can legitimately carry the Appendix A field names and is the safest initial V2 scope, subject to parser number coercion.
- **SOSI/GML:** the main instruction accepts GML under named product specifications (pp. 27–29), not arbitrary SOSI aliases. A standards-compliant SOSI/GML adapter may map semantics, but the current hardcoded inference is not that mapping.
- **KOF:** these PDFs do not list KOF as an accepted delivery format and KOF normally lacks the 46-property payload. It can support geometry checks and perhaps explicit subsets, but inferred KOF `S_FCODE` cannot establish Tema compliance.

## 9. Format/data-type mapping

No current `fieldFormat` value is executed.

| Current fieldFormat | Fields/count | Source definition | Candidate machine semantics | Concerns / accuracy of metadata |
| --- | --- | --- | --- | --- |
| Kode | 22 | Code tables throughout App. A | Preserve lexical token; validate supplied value against reviewed set when set is closed | Case/trim unspecified; Tema fallback text; numeric codes must not be globally numeric-normalized |
| Heltall | 13 | App. A pp. 8, 10, 14–18, 23, 25 | Base-10 integer syntax; requiredness separate | Sign/range mostly unstated; NOBB “usually 7 digits” is not strict |
| Tekst | 5 | Saksnummer p. 6, Merknad p. 9, AnleggsID p. 17 | String; Merknad max 255 | `S_HYPERLINK` source format is `Generert`, so current Tekst is a simplification |
| YYYY | 1 | Anleggsår p. 6 | Exactly four decimal digits | Plausible year range not stated; parser may coerce to number |
| DD.MM.YYYY | 1 | Datafangstdato p. 6 | Displayed pattern; optionally real calendar date after policy decision | Time zone irrelevant; leading zeroes visually implied but not explicitly discussed |
| Navn | 1 | Innmålt_av p. 6 | Non-empty text | No safe name grammar/length; content includes contractor and initials |
| Tall | 1 | Line Tykkelse p. 23 | Decimal number with one fractional digit | Decimal comma/dot not stated; parser only recognizes dot decimals |
| Desimal | 1 | SDR | Source says `Kode`, not decimal, and displays strings such as `6.0` | Current metadata is inaccurate; preserve source lexical codes |
| Desimaltall | 1 | Avst_BunnInnvUnderUtv p. 16 | Decimal metres | Separator, scale, sign, and range not stated |

Candidate V2 format-rule matrix:

| Rule family | Readiness | Null handling | Locale policy |
| --- | --- | --- | --- |
| Year `YYYY` | READY | Required rule handles empty; format skips empty | ASCII digits, exactly four |
| Date `DD.MM.YYYY` | NEEDS DOMAIN DECISION | Separate presence | Decide pattern-only versus calendar-valid; preserve dots/leading zeros |
| Integer | READY for syntax | Separate presence | Optional leading sign should be rejected unless approved; no thousands separator |
| Decimal / one decimal | NEEDS DOMAIN DECISION | Separate presence | Decide dot/comma and whether lexical one-decimal form is required |
| Code | READY only for reviewed closed sets | Missing skips allowed-value rule | No case/trim/numeric normalization without explicit policy |
| Text max length | READY for Merknad=255 | Empty allowed if optional | Count Unicode characters, not bytes |
| Name/generated path | DEFER | Separate presence/format | No source syntax for names; generated-path contract is Gemini-specific |

## 10. Z and geometry analysis

**SOURCE CONFIRMED:** main instruction p. 10 requires measured objects to be coordinate-fixed with north, east, and height. Point and line sections require height reference for each measurement point (pp. 13 and 18), and the line geometry requirements assume 3D points. The LAGS standard likewise describes x/y/z positions and measured height.

**CURRENT APP BEHAVIOUR:** `zValidation.js` separately checks every point coordinate and line vertex; `null`, `undefined`, non-finite, and numeric zero are invalid.

**INFERENCE:** absent/non-finite Z cannot satisfy a required height coordinate. Checking all line vertices is consistent with the document's measurement-point language. It remains a separate legacy analysis rather than a field rule.

**SOURCE NOT FOUND:** neither bundled PDF, the regulation, nor a text search of the referenced official LAGS standard defines exactly zero as a missing-value sentinel. NN2000 heights can conceptually be zero or negative. Therefore `Z=0` invalid is broader than sourced policy and must not migrate automatically.

The source geometry requirements are richer than current Z validation: non-round point polygons, height-reference-specific geometry, maximum point spacing, straight segment representation, line continuity, lid/point pairs, and volume dimensions. Z presence alone does not establish compliance.

## 11. Source requirements missing or incorrectly represented in the app

This register counts 32 requirement families. “Missing” includes a source requirement for which current behaviour validates only presence, uses an incomplete/incorrect list, or runs in a separate unsupported way.

| Gap | Source requirement | Source | Future capability | Complexity | Recommendation |
| --- | --- | --- | --- | --- | --- |
| GAP-01 | Anleggsår `YYYY` syntax | App. A p. 6 | format/type | low | EARLY V2 |
| GAP-02 | Datafangstdato `DD.MM.YYYY` | App. A p. 6 | format/type | low/medium | EARLY V2 after date-policy decision |
| GAP-03 | Integer syntax for accuracy/max-deviation fields | App. A pp. 8, 10 | format/type | low | EARLY V2 |
| GAP-04 | Integer syntax for point dimensions and point NOBB fields | App. A pp. 14–18 | format/type | low | EARLY V2 |
| GAP-05 | Integer syntax for line dimensions and line NOBB | App. A pp. 23, 25 | format/type | low | EARLY V2 |
| GAP-06 | Decimal metres for Avst_BunnInnvUnderUtv | App. A p. 16 | format/type | medium | NEEDS DOMAIN REVIEW |
| GAP-07 | One decimal for line Tykkelse | App. A p. 23 | format/type | medium | NEEDS DOMAIN REVIEW |
| GAP-08 | Merknad maximum 255 characters | App. A p. 9 | range | low | EARLY V2 |
| GAP-09 | Horizontal standard deviation ≤3 cm unless agreed | Main p. 10 | range/conditional | medium | NEEDS DOMAIN REVIEW for exception |
| GAP-10 | Vertical standard deviation ≤5 cm unless agreed | Main p. 10 | range/conditional | medium | NEEDS DOMAIN REVIEW for exception |
| GAP-11 | Full Målemetode code list | App. A pp. 26–29 | allowed-value | low | LATER V2; current four are not complete |
| GAP-12 | Full MålemetodeHøyde code list | App. A pp. 29–30 | allowed-value | low | LATER V2 |
| GAP-13 | Seven missing point `I2*` Tema values | App. A p. 11 | allowed-value | low | EARLY V2 data correction after review |
| GAP-14 | Correct `DB11/15/22/30` Type codes | App. A pp. 13–14 | allowed-value | low | EARLY V2 after source/version approval |
| GAP-15 | Correct line `I2*` Tema codes | App. A p. 19 | allowed-value | low | EARLY V2 after review |
| GAP-16 | Correct `PVC-O` and `I_VANNSØYLEN` tokens | App. A pp. 10, 23 | allowed-value | low | EARLY V2 after review |
| GAP-17 | Pressure-line height reference is TOPP_UTVENDIG | Main p. 18 | conditional/cross-field | medium/high | LATER V2 after classifier decision |
| GAP-18 | Ringstivhet applies to plastic self-fall lines | App. A pp. 6, 24 | conditional | high | NEEDS DOMAIN REVIEW |
| GAP-19 | VertikalDimensjon for non-circular pipes | App. A p. 23 | conditional | medium | LATER V2 |
| GAP-20 | Avst_BunnInnvUnderUtv for circular prefabricated installations | App. A p. 16 | conditional | high | NEEDS DOMAIN REVIEW |
| GAP-21 | Bredde/Length omitted where polygon supplies boundary | App. A p. 5; main p. 15 | conditional/geometry | high | NEEDS DOMAIN REVIEW |
| GAP-22 | Utvendig_høyde conditional/list-prose semantics | App. A pp. 5, 16 | conditional | high | NEEDS DOMAIN REVIEW |
| GAP-23 | File declares horizontal coordinate system/EPSG | Main p. 10 | dataset-level | low/medium | LATER V2 |
| GAP-24 | Orthometric NN2000 height reference declared | Main p. 10 | dataset-level | medium | LATER V2 |
| GAP-25 | Maximum 8 m between measured line points | Main p. 19 | geometry | low | LATER V2 |
| GAP-26 | Straight segments; curve approximation within 20 cm | Main p. 19 | geometry | high; physical truth required | PROBABLY NOT SOFTWARE VALIDATION without design/as-built reference |
| GAP-27 | Continuous line from one construction to the next | Main pp. 18, 20 | cross-field/geometry | high | LATER V2 |
| GAP-28 | Installation with lid represented as separate installation and lid points | Main p. 13 | dataset-level/cross-object | high | LATER V2 |
| GAP-29 | Other lidless two-height objects have companion `TOP` object | Main p. 17 | dataset-level/cross-object | high | LATER V2 |
| GAP-30 | Non-round point object has 3D outer-boundary polygon | Main p. 15 | geometry/cross-object | high | LATER V2 |
| GAP-31 | Land-survey report is present and contains control setup | Main p. 12 | dataset/attachment | high; not in parsed layer | PROBABLY NOT SOFTWARE VALIDATION in current input contract |
| GAP-32 | Required image coverage and image metadata | Main p. 26 | dataset/attachment | high; not in parsed layer | PROBABLY NOT SOFTWARE VALIDATION in current input contract |

## 12. App behaviour not found in the two source PDFs

| Behaviour | Provenance classification |
| --- | --- |
| `Tema_punkt`/`Tema_led` logical keys and `S_FCODE/Tema/TEMA/FCODE` aliases | implementation convenience / parser adaptation |
| SOSI object-name-to-GMI code mappings | local parser adaptation; not source-backed |
| KOF code/name/section-to-`S_FCODE` inference | legacy heuristic; KOF compliance scope not found |
| Pressure/gravity classifier and default-to-gravity | legacy heuristic |
| Object-code subsets for Bredde, Byggemetode, Kumform, Kjegle, Type | unknown provenance / legacy heuristic |
| Treating a field present on a non-applicable object as forbidden/unexpected | unknown provenance |
| Trim and numeric allowed-value normalization | implementation convenience |
| Commented “case-insensitive” allowed values while executing case-sensitive comparison | implementation defect/unknown policy |
| Error only when every applicable object is missing; warning when some are missing | local UI/status rule, not source severity |
| Optional invalid values may remain `OK` | implementation consequence, not source policy |
| `Z=0` is invalid everywhere | unknown provenance |
| `optionalAlt` name | likely local representation of five-star optionality |
| `Tema` sorted first and shared P/L aggregation | UI convenience |
| Generic aliases `DIMENSJON`/`DIM` for point Bredde | legacy convenience with semantic collision risk |

`geminiOnly` is source-backed in meaning (`**`), but its state name and current non-execution are application-specific. `polygonExcluded` is likewise a source-backed concept (`***`) represented by an app label but not executed according to source geometry.

## 13. Conflict and migration-risk register

| Risk | Conflict | Evidence | Migration severity |
| --- | --- | --- | --- |
| C-01 | Appendix cover says 3.1; revision/footer say 3.0 | App. A pp. 1–30 | HIGH |
| C-02 | Tema may permit free text when no code fits, while app treats list as closed | Main p. 25 versus active allowed-value check | HIGH |
| C-03 | Type `DB*` values stored as `D8*` | App. A pp. 13–14 vs JSON | HIGH |
| C-04 | Line Tema `I2*` stored as `12*`; point list omits seven `I2*` codes | App. A pp. 11, 19 vs JSON | HIGH |
| C-05 | `PVC-O` stored `PVC-0`; `I_VANNSØYLEN` stored `!_VANNSØYLEN` | App. A pp. 10, 23 vs JSON | MEDIUM |
| C-06 | Type condition includes nonexistent `FORAKONSTR`, while source/current code is `FORAKONST` | fieldValidation line 189; App. A p. 11 | HIGH |
| C-07 | Adkomst source optional but app always; Kjegle/Kumform source unstarred but app conditional | App. A p. 5 vs fields/code | HIGH |
| C-08 | Utvendig_høyde list says optional but prose describes conditional necessity | App. A pp. 5, 16 | HIGH |
| C-09 | AnleggsID source says where available; main says AnleggsID or SID for all points | App. A pp. 5, 17; main p. 25 | HIGH |
| C-10 | Pressure/gravity source conditions rely on an unsupported classifier | fieldValidation lines 62–115, 162–173; App. A pp. 6, 24–25 | HIGH |
| C-11 | Ringstivhet loses the source “plastic” condition | App. A p. 6 vs code | HIGH |
| C-12 | Bredde polygon condition replaced by object-code list | App. A p. 5; main p. 15 vs code | HIGH |
| C-13 | Målemetode lists shown as “most used” are enforced as complete | App. A pp. 7–8, 26–30 vs JSON | HIGH |
| C-14 | Active and dormant JSON disagree for Type/Kumform/Kjegle requiredness and SDR type | three JSON files | MEDIUM |
| C-15 | UI says it checks fields “against the instruction,” but formats, ranges, attachments, geometry, and many source rules are absent | UI plus execution | MEDIUM |
| C-16 | UI collapses conditional and optional states into one badge and derives status from prevalence | FieldDetailModal and fieldValidation | MEDIUM |
| C-17 | Source says exact field names must not change; aliases/inference obscure the field actually checked | App. A p. 5 vs fieldValidation/parsers | MEDIUM |
| C-18 | LAGS varies max deviations by area; instruction intentionally uses simplified policy | main pp. 4, 10; LAGS Table 3 | MEDIUM |
| C-19 | Z presence is source-backed, zero-as-missing is not | main pp. 10, 13, 18 vs zValidation | HIGH |
| C-20 | `SDR` source lexical codes become JSON numbers; parser also coerces numeric-looking codes | App. A p. 24 vs parser/JSON | MEDIUM |

## 14. Candidate canonical V2 rule inventory

The machine-readable file contains one record for every item below at finer field granularity. The tables group rules only where one evaluator and one expectation are identical. A grouped row still produces distinct stable IDs per canonical field in implementation.

### 14.1 Required-field rules

| Proposed rule IDs / fields | Scope and expectation | Source | Confidence | Help | Readiness |
| --- | --- | --- | --- | --- | --- |
| `innmaling.common.{anleggsaar,datafangstdato,innmaalt-av,saksnummer}.required` | P+L; non-empty | App. A pp. 5–6 | high | Supply project/measurement metadata | READY |
| `innmaling.common.height-reference.required` | P+L; non-empty | App. A pp. 5, 7; main p. 10 | high | State what the Z coordinate references | READY |
| `innmaling.common.{maalemetode,noyaktighet,maalemetode-hoyde,noyaktighet-hoyde}.required` | P+L; non-empty | App. A pp. 5, 7–8 | high | Supply measurement method and accuracy | READY |
| `innmaling.common.{stedfestingsforhold,stedfestingsaarsak,synbarhet}.required` | P+L; non-empty | App. A pp. 5, 8–9 | high | Supply measurement circumstances | READY |
| `innmaling.common.vertikalnivaa.required` | P+L; non-empty | App. A pp. 5, 10 | medium | Supply vertical level | NEEDS SOURCE VERIFICATION |
| `innmaling.common.{maks-avvik-horisontalt,maks-avvik-vertikalt}.required` | P+L; non-empty | App. A pp. 5, 10 | high | Supply maximum deviations | READY |
| `innmaling.point.tema.required` | P only; non-empty | App. A pp. 5, 11–13 | high | Supply point Tema | READY |
| `innmaling.point.{kumform,innvendig-utvendig,tykkelse,byggemetode,kjegle}.required` | P; source lists unstarred | App. A pp. 5, 14–17 | medium | Supply point construction/volume property | NEEDS DOMAIN DECISION |
| `innmaling.point.{nobb,nobb-ramme}.required` | P; non-empty | App. A pp. 5, 17–18 | high | Supply NOBB/VAVVS number | READY |
| `innmaling.line.tema.required` | L only; non-empty | App. A pp. 6, 19–21 | high | Supply line Tema | READY |
| `innmaling.line.{nett-type,material,dimensjon,innvendig-utvendig,rorform,nobb}.required` | L; non-empty | App. A pp. 6, 21–25 | high | Supply line identity/dimension property | READY |

No required rule is proposed for Merknad, Eier, Adkomst, line Tykkelse, or Trykklasse. Their supplied values may still have allowed-value/format rules.

### 14.2 Allowed-value rules

| Proposed rule family | Scope / expectation | Source | Confidence | Help | Readiness |
| --- | --- | --- | --- | --- | --- |
| `innmaling.common.height-reference.allowed-value` | Seven exact lexical codes | App. A p. 7 | high | Choose the applicable reference | READY |
| `innmaling.common.{stedfestingsforhold,stedfestingsaarsak,synbarhet,eier}.allowed-value` | Reviewed Appendix tokens | App. A pp. 8–10 | high | Use an Appendix A code | READY |
| `innmaling.point.{innvendig-utvendig,byggemetode,adkomst,kjegle,kumform}.allowed-value` | Reviewed Appendix tokens when supplied | App. A pp. 14–17 | high | Use an Appendix A code | READY |
| `innmaling.line.{nett-type,innvendig-utvendig,rorform,ringstivhet,trykklasse}.allowed-value` | Reviewed Appendix tokens when applicable/supplied | App. A pp. 21–25 | high | Use an Appendix A code | READY |
| `innmaling.common.{maalemetode,maalemetode-hoyde}.allowed-value` | Full list, not only “most used” | App. A pp. 26–30 | medium | Choose any documented code | NEEDS SOURCE VERIFICATION |
| `innmaling.point.tema.allowed-value` | Corrected source point list, with fallback policy | App. A pp. 11–13; main p. 25 | medium | Use Tema or approved free-text fallback | NEEDS DOMAIN DECISION |
| `innmaling.line.tema.allowed-value` | Corrected source line list, with fallback policy | App. A pp. 19–21; main p. 25 | medium | Use Tema or approved free-text fallback | NEEDS DOMAIN DECISION |
| `innmaling.point.type.allowed-value` | Correct `DB*` tokens | App. A pp. 13–14 | high | Correct apparent legacy transcription | NEEDS SOURCE VERIFICATION |
| `innmaling.common.vertikalnivaa.allowed-value` | Correct `I_VANNSØYLEN` token | App. A p. 10 | high | Correct apparent legacy transcription | NEEDS SOURCE VERIFICATION |
| `innmaling.line.material.allowed-value` | Correct `PVC-O` token | App. A pp. 22–23 | high | Correct apparent legacy transcription | NEEDS SOURCE VERIFICATION |
| `innmaling.line.sdr.allowed-value` | Twelve lexical decimal codes | App. A p. 24 | high | Preserve `.0` code spelling | NEEDS DOMAIN DECISION |

Allowed-value rules skip empty values so required and allowed-value failures remain separate.

### 14.3 Format, range, and conditional rules

| Proposed stable ID | Category | Scope / expectation | Source | Confidence | Readiness |
| --- | --- | --- | --- | --- | --- |
| `innmaling.common.anleggsaar.format-yyyy` | format | exactly `YYYY` | App. A p. 6 | high | READY |
| `innmaling.common.datafangstdato.format-dd-mm-yyyy` | format | reviewed date policy | App. A p. 6 | high | NEEDS DOMAIN DECISION |
| `innmaling.format.integer` (field-specific instances) | format | integer fields are integers | App. A pp. 8, 10, 14–18, 23, 25 | high | READY |
| `innmaling.point.avst-bunn.decimal` | format | decimal metres | App. A p. 16 | high | NEEDS DOMAIN DECISION |
| `innmaling.line.tykkelse.one-decimal` | format | one decimal in mm | App. A p. 23 | high | NEEDS DOMAIN DECISION |
| `innmaling.common.merknad.max-length-255` | range | ≤255 characters when supplied | App. A p. 9 | high | READY |
| `innmaling.common.noyaktighet.max-3cm` | range | ≤3 cm unless exception agreed | Main p. 10 | high | NEEDS DOMAIN DECISION |
| `innmaling.common.noyaktighet-hoyde.max-5cm` | range | ≤5 cm unless exception agreed | Main p. 10 | high | NEEDS DOMAIN DECISION |
| `innmaling.point.anleggsid-or-sid.required` | cross-field | one stable point ID | Main p. 25 / App. A p. 5 | conflicting | NEEDS DOMAIN DECISION |
| `innmaling.point.bredde.unless-polygon` | conditional | Bredde absent/not required when polygon is boundary | App. A p. 5 | high | NEEDS DOMAIN DECISION |
| `innmaling.point.avst-bunn.required-circular-prefab` | conditional | required for circular prefabricated installation | App. A p. 16 | high | NEEDS DOMAIN DECISION |
| `innmaling.point.utvendig-hoyde.applicability` | conditional | resolve list/prose conflict | App. A pp. 5, 16 | low | DEFER |
| `innmaling.point.hyperlink.required-gemini-terreng` | conditional | required only in Gemini Terreng delivery | App. A pp. 5, 17 | high | NEEDS DOMAIN DECISION |
| `innmaling.line.hyperlink.required-gemini-terreng` | conditional | required only in Gemini Terreng delivery | App. A pp. 6, 25 | high | NEEDS DOMAIN DECISION |
| `innmaling.line.sdr.required-pressure` | conditional | SDR required for classified pressure line | App. A pp. 6, 24 | high condition / low classifier | NEEDS DOMAIN DECISION |
| `innmaling.line.ringstivhet.required-plastic-gravity` | conditional | required for plastic self-fall line | App. A pp. 6, 24 | high condition / low classifier | NEEDS DOMAIN DECISION |
| `innmaling.line.vertikal-dimensjon.required-noncircular` | conditional | vertical dimension for non-circular pipe | App. A p. 23 | high | NEEDS DOMAIN DECISION |
| `innmaling.line.pressure.height-reference-top-exterior` | cross-field | pressure line height reference = TOPP_UTVENDIG | Main p. 18 | high condition / low classifier | NEEDS DOMAIN DECISION |

### 14.4 Geometry and dataset rules

| Proposed stable ID | Category | Expectation | Source | Confidence | Readiness |
| --- | --- | --- | --- | --- | --- |
| `innmaling.dataset.horizontal-crs.declared` | dataset | EPSG/horizontal system declared | Main p. 10 | high | NEEDS SOURCE VERIFICATION |
| `innmaling.dataset.vertical-reference.nn2000` | dataset | orthometric NN2000 declared | Main p. 10 | high | NEEDS SOURCE VERIFICATION |
| `innmaling.geometry.z.present` | geometry | finite height at measured point/vertex | Main pp. 10, 13, 18 | high | READY, explicitly excluding zero policy |
| `innmaling.line.vertex-spacing.max-8m` | geometry | adjacent measured points no more than 8 m | Main p. 19 | high | READY |
| `innmaling.line.continuous-construction-to-construction` | geometry/cross-object | one continuous line between constructions | Main pp. 18, 20 | high | NEEDS DOMAIN DECISION |
| `innmaling.point.nonround.outer-polygon-3d` | geometry/cross-object | non-round object has height-bearing exterior polygon | Main p. 15 | high | NEEDS DOMAIN DECISION |
| `innmaling.point.installation-lid.separate-pair` | cross-object | installation and lid are separate related points | Main p. 13 | high | NEEDS DOMAIN DECISION |
| `innmaling.point.lidless-top.separate-pair` | cross-object | qualifying lidless object has companion TOP point | Main p. 17 | high | NEEDS DOMAIN DECISION |
| `innmaling.dataset.measurement-report.present` | dataset/attachment | survey report and control setup present | Main p. 12 | high | DEFER under one-layer parsed input |
| `innmaling.dataset.images.metadata-and-coverage` | dataset/attachment | required photographs and metadata | Main p. 26 | high | DEFER under one-layer parsed input |

Provisional severity is intentionally omitted. The source says “shall,” “obligatory,” and accuracy limits, but it does not define application blocking/error/warning levels.

## 15. Recommended migration waves

### WAVE A — strong evidence, simple evaluators

- Keep all four starter rules, GMI-only initially.
- Add unambiguous common presence rules and point/line Tema presence.
- Add exact closed value sets that do not depend on object classification: Høydereferanse, Stedfestingsforhold, Stedfestingsårsak, Synbarhet, InnvendigUtvendig, Nett_type, Rørform.
- Add `Anleggsår` `YYYY`, integer syntax, and Merknad max length after parser lexical-value handling is defined.

### WAVE B — clear source, broader evaluator capability

- Full measurement-method lists.
- Remaining exact static value sets after source-version review.
- Numeric ranges for accuracy with an explicit exception mechanism.
- Header CRS/NN2000 checks.
- Finite Z presence without treating zero as missing.
- Maximum 8 m line-vertex spacing.

### WAVE C — domain-approved classification/conditions

- SDR, plastic self-fall Ringstivhet, optional Trykklasse, and pressure height reference.
- Circular/prefabricated and non-circular geometry property applicability.
- Bredde/Lengde versus polygon.
- AnleggsID-or-SID, Gemini-only hyperlink, and supplied value on non-applicable objects.
- Tema/Type code-list closure and free-text fallback.

### WAVE D — new source-backed capabilities absent from legacy

- Non-round exterior polygon, continuous construction-to-construction lines, installation/lid pairs, TOP companion objects.
- Attachment/report/image checks only if V2's input contract is deliberately expanded beyond one parsed layer.

### DEFER

- `Z=0` invalid.
- Legacy pressure/gravity default-to-gravity.
- Current hardcoded object-code applicability lists.
- KOF/SOSI inferred Tema as compliance evidence.
- Legacy prevalence-based severity/status.
- Strict Tema closure until main p. 25 is interpreted.
- Physical curve-deviation and photographic coverage checks without appropriate reference/attachment inputs.

## 16. Domain-owner questionnaire

| # | Decision | Why it matters / affected rules | Safe default while waiting |
| ---: | --- | --- | --- |
| 1 | Is the bundled Appendix A truly v3.1 despite 3.0 revision/footer, and is it the governing value set? | Every field/value source revision | Mark rule source revision provisional; do not claim full compliance |
| 2 | Does main p. 25 allow free-text fallback only for Tema, for all code fields, or not in accepted deliveries? | Tema/Type and all allowed-value rules | Enforce only unequivocally closed sets; defer Tema allowed-value |
| 3 | What is the canonical pressure/self-fall classifier and what happens when classification is unknown? | SDR, Ringstivhet, Trykklasse, pressure height reference | `unknown` => skip with explicit reason; never default gravity |
| 4 | Which point-property applicability rules are correct for Kumform, Kjegle, Byggemetode, Bredde, Lengde, Utvendig_høyde, and Avst_BunnInnvUnderUtv? | Seven high-risk point rules | Migrate only presence/value rules whose applicability is independent |
| 5 | How should “where available” and AnleggsID-or-SID be operationalized? | Type and AnleggsID | Do not issue missing-value failures; validate supplied values only |
| 6 | Are source codes case/whitespace sensitive, and may numeric-looking codes be normalized? | All allowed-value rules, especially SDR/Målemetode/Synbarhet | Exact trimmed lexical strings; no numeric fallback; expose normalization as pending |
| 7 | Which source formats are compliance-supported, and what constitutes an authoritative SOSI/GML Tema mapping? | All rules plus aliases; KOF scope | GMI only; KOF geometry-only; skip inferred Tema rules |
| 8 | Is a supplied value on a non-applicable object forbidden, warning, informational, or ignored? | Legacy “unexpected” behaviour | Ignore for compliance but expose as diagnostic only |
| 9 | Is Z=0 ever a missing sentinel, and is the rule CRS/vertical-datum dependent? | Geometry Z rule | Accept any finite Z, including zero; report absent/non-finite only |
| 10 | Which failures block acceptance, and are municipal exceptions (accuracy, underwater work, agreed formats) represented in run context? | Severity, range rules, incomplete/exception handling | No blocking severity; label rule outcome and explicit skipped/exception state |

## 17. Machine-readable source map

`docs/validation-v2/innmalingsinstruks-rule-source-map.json` is documentation data only and has no runtime import. Its stable top-level schema is:

```text
schemaVersion
generatedAt
purpose
documents[]
summary
sourceRules[]
  id
  sourceDocument
  page
  section
  table
  legacyFieldKeys[]
  category
  scope[]
  sourceConfidence
  v2Readiness
  notes
```

The file uses concise paraphrases only. IDs describe source concepts, not executable registry IDs, and can later be linked to one or more canonical V2 rules. `v2Readiness` is deliberately conservative. After the interrupted session, the missing JSON artifact was reconstructed from this report and the cited evidence, then parsed and completeness-checked locally on 2026-08-21.

## 18. Bottom line

The PDFs provide a much stronger field and geometry basis than the legacy application exposes, but they do not validate the legacy classifier, status system, aliases, KOF/SOSI inference, or zero policy. Early V2 should start with direct, format-scoped source rules and retain explicit `unknown/skipped` states. Conditional hydraulics, point geometry applicability, Tema closure, and severities require the ten decisions above before implementation.
