# Validator 2.0 full field-resolution census

- Date: 2026-08-21
- Branch: `research/validator-v2-field-resolution-census`
- Scope: research and documentation only

## 1. Executive summary

This census accounts for all 46 effective records in `src/data/fields.json` and traces each through source identity, GMI parser exposure, SOSI/KOF behavior, active legacy aliases, current resolution, and a proposed canonical V2 identity.

The 46 legacy records reduce to **41 canonical semantic fields**. Five source concepts were duplicated into point/line database identities:

| Canonical field | Point legacy key | Line legacy key |
|---|---|---|
| `insideOutside` | `InnvendigUtvendig_punkt` | `InnvendigUtvendig_led` |
| `wallThickness` | `Tykkelse_punkt` | `Tykkelse_led` |
| `tema` | `Tema_punkt` | `Tema_led` |
| `nobbVavvsNumber` | `NOBB-VAVVS-nr_punkt` | `NOBB-VAVVS-nr_led` |
| `attachmentLink` | `S_HYPERLINK_punkt` | `S_HYPERLINK` |

Those are not five lost requirements. They are ten scoped legacy records that target five semantic fields. Geometry belongs to rule applicability, not field identity.

Key results:

- Nine effective keys have a `_punkt` or `_led` suffix.
- `InnvendigUtvendig_led` and `NOBB-VAVVS-nr_led` are **BROKEN_CONFIRMED** from the 2026-08-21 live observations: the parser-visible unsuffixed attributes were populated while the legacy resolver requested suffixed keys and reported none.
- Five more suffixed keys are **BROKEN_LIKELY** by the same structural proof: `InnvendigUtvendig_punkt`, both `Tykkelse_*`, `NOBB-VAVVS-nr_punkt`, and `S_HYPERLINK_punkt` have no unsuffixed alias.
- `Tema_punkt` and `Tema_led` are the only suffixed keys rescued by aliases. They can resolve literal `S_FCODE`, `Tema`, `TEMA`, or `FCODE` keys.
- The repository proves that literal `S_FCODE` occurred in a previously analyzed 51-file GMI corpus: the Type analyzer searched exact `S_FCODE` and produced aggregate results. It does **not** prove that S_FCODE is formally equivalent to Innmålingsinstruks `Tema`.
- No repository evidence proves PTEMA as a GMI field. LTEMA appears only in a SOSI analysis script's list of candidate native keys; it is neither an active alias nor an implemented authoritative mapping. PTEMA and GMI LTEMA therefore remain **UNVERIFIED**.
- The active resolver contains 12 alias groups with 41 configured alias candidates. Eleven groups can be requested by the 46 effective records; `Dato` is inert. Two groups are semantically ambiguous: `Nøyaktighet` and `Bredde (diameter)`.
- GMI is the only format for which direct Innmålingsinstruks-property mapping can currently be considered validation-authoritative, and only when the delivered header itself is the canonical property. SOSI native-property equivalence is unresolved; SOSI-derived and KOF-derived S_FCODE are non-authoritative.

The record-level status totals are 35 EXACT, 2 ALIAS_WORKS, 2 AMBIGUOUS, 5 BROKEN_LIKELY, and 2 BROKEN_CONFIRMED. “EXACT” means the canonical source property, legacy field key, and parser-preserved attribute key align structurally; for most fields there is still no committed safe real-file header fixture.

## 2. Methodology and evidence limits

### 2.1 Required research baseline

The following committed artifacts were treated as required context:

- `docs/agent-reports/20260820-validation-module-audit-and-plan.md`
- `docs/agent-reports/20260820-innmalingsinstruks-rule-source-mapping.md`
- `docs/validation-v2/innmalingsinstruks-rule-source-map.json`
- `docs/agent-reports/20260821-validator-v2-legacy-rule-provenance-audit.md`
- `docs/validation-v2/legacy-rule-provenance-map.json`

The source audit supplies the canonical PDF property names and scope. This census does not reinterpret those source findings.

### 2.2 Runtime paths inspected

- `src/data/fields.json`: all 46 active field records
- `src/data/rules/points.json` and `lines.json`: dormant point/line copies
- `src/lib/validation/fieldValidation.js`: active exact/alias/case fallback
- `src/lib/validation/validator.js`: dormant exact-only lookup
- `src/lib/parsing/gmiParser.js`: literal `_FIELDNAMES` exposure and value coercion
- `src/lib/parsing/sosiParser.js`: native-property preservation plus inferred S_FCODE
- `src/lib/parsing/kofParser.js`: KOF metadata plus synthetic S_FCODE
- `src/lib/parsing/normalizeFeature.js`: geometry normalization; attributes pass through unchanged
- validation UI only to confirm that `fields.json` keys are passed into the active resolver
- analysis scripts, archived aggregate results, tests, product notes, Git blame, and introducing commits

### 2.3 Resolver behavior

The active resolver attempts, in order:

1. exact `feature.attributes[fieldKey]`;
2. each configured alias by exact case-sensitive key;
3. a case-insensitive search for the original `fieldKey` only.

The third step does **not** make every alias case-insensitive. For example, lower-case `s_fcode` does not match the `Tema_punkt` alias `S_FCODE`, and the generic fallback searches for `tema_punkt`, not `s_fcode`.

The dormant validator uses only `feature.attributes[rule.fieldKey]`; it would fail every alias-only mapping. It is retained as provenance evidence, not treated as the active UI path.

### 2.4 Evidence grades

- **HIGH:** executable structure plus source identity, live observation, exact aggregate-analyzer evidence, or direct Git provenance.
- **MEDIUM:** source identity and deterministic parser/resolver behavior align, but no committed safe real-file header proves the delivered spelling.
- **LOW:** speculation only. No field record is assigned LOW as a final mapping; unsupported candidates are explicitly omitted or marked unresolved.

### 2.5 Real-data boundary

The workspace contains untracked operational reference material, but it is not a committed safe fixture. Its contents were deliberately not inspected for this task. No filenames, coordinates, or delivery attributes are reproduced.

The committed aggregate analysis and scripts are safe evidence of prior findings. They establish that exact `S_FCODE` was present in the analyzed GMI corpus and that case-insensitive Type/Nett_type header families were processed. Because the scripts did not retain every matched header spelling, they do not prove the literal name for the remaining properties.

The only committed parser test GMI fixture declares a generic `CODE` field and does not prove any of the 46 domain names.

## 3. Full 46-field resolution matrix

Legend:

- `GMI direct` means `_FIELDNAMES` contains the stated source property and the parser exposes that exact key.
- `SOSI U` means native same-name mapping is unresolved; no authoritative 46-field crosswalk exists.
- `KOF N/A` means the format has no verified mapping for the property.
- Alias candidates shown are the active resolver's configured candidates, not endorsements.
- Scope is rule applicability only.

| # | Canonical concept / V2 ID | Display / legacy fieldKey | Scope | Source property | GMI delivered/property evidence and parser output | SOSI / KOF | Legacy aliases and resolution path | Status | Risk / confidence | Recommended adapter mapping |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | `heightReference` | Høydereferanse / `Høydereferanse` | P+L | `Høydereferanse` | GMI direct → same key; real header not safely committed | SOSI U / KOF N/A | exact; HOYDEREFERANSE, HREF; case fallback | EXACT | HREF unverified / MEDIUM | `Høydereferanse → heightReference`; other aliases separately sourced |
| 2 | `measurementMethod` | Målemetode / `Målemetode` | P+L | `Målemetode` | GMI direct → same | SOSI U / KOF N/A | exact; MALEMETODE, METODE; case fallback | EXACT | METODE generic / MEDIUM | direct canonical property only by default |
| 3 | `horizontalAccuracy` | Nøyaktighet / `Nøyaktighet` | P+L | `Nøyaktighet` | Direct key is safe; H_* candidates remain literal parser keys | SOSI U / KOF N/A | exact; NOYAKTIGHET, H_MÅLEMETODE, H_NOYAKTIGHET | AMBIGUOUS | H_* may be height fields / HIGH | direct Nøyaktighet; reject H_* until proven |
| 4 | `heightMeasurementMethod` | MålemetodeHøyde / `MålemetodeHøyde` | P+L | `MålemetodeHøyde` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback only | EXACT | possible H_MÅLEMETODE variant is unverified and misrouted / MEDIUM | direct; verify any abbreviated header |
| 5 | `insideOutside` | InnvendigUtvendig / `InnvendigUtvendig_punkt` | P | `InnvendigUtvendig` | Unsuffixed direct key → same | SOSI U / KOF N/A | no alias; searches suffixed key | BROKEN_LIKELY | suffix leak / HIGH | `InnvendigUtvendig → insideOutside`; point scope in rule |
| 6 | `wallThickness` | Tykkelse / `Tykkelse_punkt` | P | `Tykkelse` | Unsuffixed direct key → same | SOSI U / KOF N/A | no alias; searches suffixed key | BROKEN_LIKELY | suffix leak / HIGH | `Tykkelse → wallThickness`; point scope in rule |
| 7 | `constructionMethod` | Byggemetode / `Byggemetode` | P | `Byggemetode` | GMI direct → same; aggregate matched a spelling family | SOSI U / KOF N/A | exact/case fallback | EXACT | exact real header not retained / MEDIUM | direct canonical property |
| 8 | `access` | Adkomst / `Adkomst` | P | `Adkomst` | GMI direct → same; aggregate matched a spelling family | SOSI U / KOF N/A | exact/case fallback | EXACT | exact real header not retained / MEDIUM | direct canonical property |
| 9 | `cone` | Kjegle / `Kjegle` | P | `Kjegle` | GMI direct → same; aggregate matched Kjegle/KJEGLE | SOSI U / KOF N/A | exact/case fallback | EXACT | exact variant not retained / MEDIUM | direct canonical property |
| 10 | `nobbVavvsFrameNumber` | NOBB-VAVVS-nr-ramme / same | P | `NOBB-VAVVS-nr-ramme` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | punctuation-sensitive / MEDIUM | direct canonical property |
| 11 | `dimension` | Dimensjon / `Dimensjon` | L | `Dimensjon` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | DIM/DIMENSJON are point-width aliases elsewhere / MEDIUM | `Dimensjon → dimension`; line scope in rule |
| 12 | `installationYear` | Anleggsår / `Anleggsår` | P+L | `Anleggsår` | GMI direct → same; value may be coerced to number | SOSI U / KOF N/A | exact/case fallback | EXACT | representation, not key / MEDIUM | direct plus typed value adapter |
| 13 | `note` | Merknad / `Merknad` | P+L | `Merknad` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | none identified / MEDIUM | direct canonical property |
| 14 | `tema` | Tema / `Tema_punkt` | P | `Tema` | Direct Tema authoritative if delivered; exact S_FCODE proven in aggregate corpus but semantic authority unresolved | derived S_FCODE false / synthetic S_FCODE false | S_FCODE, Tema, TEMA, FCODE | ALIAS_WORKS | PTEMA absent; alias case-sensitive / HIGH | direct Tema; explicit reviewed GMI crosswalk; point scope in rule |
| 15 | `type` | Type / `Type` | P | `Type` | GMI direct; case-insensitive Type family proven in aggregate analyzer | SOSI TYPE equivalence unresolved / KOF N/A | exact/case fallback | EXACT | SOSI TYPE is also inference input / HIGH | direct GMI property only |
| 16 | `manholeShape` | Kumform / `Kumform` | P | `Kumform` | GMI direct; aggregate matched a candidate family | SOSI U / KOF N/A | exact/case fallback | EXACT | historical Rørform experiment is unsupported / MEDIUM | direct; do not crosswalk Rørform |
| 17 | `facilityId` | AnleggsID / `AnleggsID` | P | `AnleggsID` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | SID is not a proven alias / MEDIUM | direct; applicability handled by rule |
| 18 | `nobbVavvsNumber` | NOBB-VAVVS-nr / `NOBB-VAVVS-nr_punkt` | P | `NOBB-VAVVS-nr` | Unsuffixed direct key → same | SOSI U / KOF N/A | no alias; searches suffixed key | BROKEN_LIKELY | suffix leak / HIGH | unsuffixed property; point scope in rule |
| 19 | `ringStiffness` | Ringstivhet / `Ringstivhet` | L | `Ringstivhet` | GMI direct → same | SOSI U / KOF N/A | exact; RINGSTIVHET, SN; case fallback | EXACT | SN unverified / MEDIUM | direct; hydraulic/material applicability separate |
| 20 | `captureDate` | Datafangstdato / `Datafangstdato` | P+L | `Datafangstdato` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback; `Dato` group is inert | EXACT | DATOREG/REGDATO do not resolve it / MEDIUM | direct canonical property |
| 21 | `surveyedBy` | Innmålt_av / `Innmålt_av` | P+L | `Innmålt_av` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | underscore is semantic source spelling / MEDIUM | direct canonical property |
| 22 | `positioningCondition` | Stedfestingsforhold / same | P+L | `Stedfestingsforhold` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | none identified / MEDIUM | direct canonical property |
| 23 | `owner` | Eier / `Eier` | P+L | `Eier` | GMI direct → same | native SOSI EIER unresolved / KOF N/A | exact/case fallback | EXACT | candidate SOSI key is not a crosswalk / MEDIUM | direct GMI; SOSI deferred |
| 24 | `verticalLevel` | Vertikalnivå / `Vertikalnivå` | P+L | `Vertikalnivå` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | value-set defect separate / MEDIUM | direct canonical property |
| 25 | `width` | Bredde (diameter) / same | P | `Bredde` | GMI Bredde → same is source-backed; DIM/other headers unresolved | SOSI U / KOF N/A | Bredde, BREDDE, DIAMETER, DIMENSJON, DIM | AMBIGUOUS | collides with line Dimensjon / HIGH | only `Bredde → width` by default |
| 26 | `externalHeight` | Utvendig høyde / `Utvendig_høyde` | P | `Utvendig_høyde` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | display removes underscore only / MEDIUM | direct canonical property |
| 27 | `attachmentLink` | S_HYPERLINK / `S_HYPERLINK_punkt` | P | `S_HYPERLINK` | Unsuffixed direct Gemini property → same | not applicable / not applicable | no alias; searches suffixed key | BROKEN_LIKELY | suffix plus supplier condition / HIGH | unsuffixed mapping; point and Gemini applicability separate |
| 28 | `tema` | Tema / `Tema_led` | L | `Tema` | Direct Tema authoritative if delivered; exact S_FCODE proven in aggregate corpus but semantic authority unresolved | derived S_FCODE false / synthetic S_FCODE false | S_FCODE, Tema, TEMA, FCODE | ALIAS_WORKS | LTEMA absent from GMI evidence; alias case-sensitive / HIGH | direct Tema; explicit reviewed crosswalk; line scope in rule |
| 29 | `networkType` | Nett type / `Nett_type` | L | `Nett_type` | Case-insensitive header family proven by dedicated aggregate analyzer | SOSI U / KOF N/A | Nett_type, NETT_TYPE, NETTTYPE | EXACT | no-underscore form unverified / HIGH | direct canonical property; variants explicit |
| 30 | `verticalDimension` | VertikalDimensjon / same | L | `VertikalDimensjon` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | applicability separate / MEDIUM | direct canonical property |
| 31 | `sdr` | SDR / `SDR` | L | `SDR` | GMI direct → same; value may be coerced | SOSI U / KOF N/A | redundant SDR alias | EXACT | representation and hydraulic gating / MEDIUM | direct; do not use value to classify line |
| 32 | `attachmentLink` | S_HYPERLINK / same | L | `S_HYPERLINK` | GMI direct Gemini property → same | not applicable / not applicable | exact/case fallback | EXACT | supplier applicability separate / MEDIUM | direct mapping; line/Gemini scope in rule |
| 33 | `caseNumber` | Saksnummer / `Saksnummer` | P+L | `Saksnummer` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | none identified / MEDIUM | direct canonical property |
| 34 | `verticalAccuracy` | NøyaktighetHøyde / same | P+L | `NøyaktighetHøyde` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback only | EXACT | possible H_NOYAKTIGHET variant is unverified and misrouted / MEDIUM | direct; verify abbreviated header |
| 35 | `positioningCause` | Stedfestingsårsak / same | P+L | `Stedfestingsårsak` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | none identified / MEDIUM | direct canonical property |
| 36 | `visibility` | Synbarhet / `Synbarhet` | P+L | `Synbarhet` | GMI direct → same; code may become number | SOSI U / KOF N/A | exact/case fallback | EXACT | lexical code representation / MEDIUM | direct key plus typed lexical adapter |
| 37 | `maxHorizontalDeviation` | MaksAvvikHorisontalt / same | P+L | `MaksAvvikHorisontalt` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | none identified / MEDIUM | direct canonical property |
| 38 | `maxVerticalDeviation` | MaksAvvikVertikalt / same | P+L | `MaksAvvikVertikalt` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | none identified / MEDIUM | direct canonical property |
| 39 | `length` | Lengde / `Lengde` | P | `Lengde` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | must not mean line geometry length / MEDIUM | direct; point applicability in rule |
| 40 | `innerBottomToOuterUndersideDistance` | Avst_BunnInnvUnderUtv / same | P | `Avst_BunnInnvUnderUtv` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | abbreviated semantic field / MEDIUM | direct canonical property |
| 41 | `material` | Material / `Material` | L | `Material` | GMI direct → same | SOSI U / KOF N/A | Material, MATERIALE, MATR | EXACT | variants unverified / MEDIUM | direct; aliases explicitly sourced; no hydraulic classification by material |
| 42 | `insideOutside` | InnvendigUtvendig / `InnvendigUtvendig_led` | L | `InnvendigUtvendig` | Unsuffixed field visibly populated; GMI parser preserves same key | SOSI U / KOF N/A | no alias; searches suffixed key | BROKEN_CONFIRMED | observed zero/all result / HIGH | unsuffixed mapping; line scope in rule |
| 43 | `wallThickness` | Tykkelse / `Tykkelse_led` | L | `Tykkelse` | Unsuffixed direct key → same | SOSI U / KOF N/A | no alias; searches suffixed key | BROKEN_LIKELY | suffix leak / HIGH | unsuffixed mapping; line scope in rule |
| 44 | `pipeShape` | Rørform / `Rørform` | L | `Rørform` | GMI direct → same | SOSI U / KOF N/A | exact/case fallback | EXACT | historical Kumform alias experiment must not leak / MEDIUM | direct canonical property |
| 45 | `pressureClass` | Trykklasse / `Trykklasse` | L | `Trykklasse` | GMI direct → same | SOSI U / KOF N/A | Trykklasse, TRYKKLASSE, PN, TRYKKKLASSE | EXACT | PN/spelling variants unverified / MEDIUM | direct; verified aliases only; do not classify from value |
| 46 | `nobbVavvsNumber` | NOBB-VAVVS-nr / `NOBB-VAVVS-nr_led` | L | `NOBB-VAVVS-nr` | Unsuffixed field visibly populated; GMI parser preserves same key | SOSI U / KOF N/A | no alias; searches suffixed key | BROKEN_CONFIRMED | observed zero/all result / HIGH | unsuffixed mapping; line scope in rule |

### Count reconciliation

- Matrix rows: 46
- Unique active `fields.json` keys represented: 46
- Unique recommended canonical IDs: 41
- Duplicate canonical IDs: exactly the five point/line source concepts listed in section 1
- Prior source-map field records represented: 46 of 46

The JSON companion preserves all 46 census rows and their original ordinal while allowing the five canonical IDs to repeat. A later registry should define each canonical field once, then let multiple scoped rules reference it.

## 4. Confirmed broken mappings

### 4.1 `InnvendigUtvendig_led`

**SOURCE EVIDENCE:** Appendix A uses unsuffixed `InnvendigUtvendig` for the line property.

**PARSER EVIDENCE:** GMI copies the literal header into `attributes` without suffixing.

**LIVE EVIDENCE:** the line table displayed populated `InnvendigUtvendig` values, including source code values, while validation for logical `InnvendigUtvendig_led` reported zero/all.

**CODE EVIDENCE:** no alias exists. Exact lookup and generic case fallback both retain `_led`.

**CONCLUSION:** BROKEN_CONFIRMED. V2 maps `InnvendigUtvendig → insideOutside`; the rule declares line scope.

### 4.2 `NOBB-VAVVS-nr_led`

The same four-part proof applies. The source and visible parser/table key are unsuffixed `NOBB-VAVVS-nr`, while active validation requests `NOBB-VAVVS-nr_led` and has no alias.

**CONCLUSION:** BROKEN_CONFIRMED. V2 maps `NOBB-VAVVS-nr → nobbVavvsNumber`; line scope belongs to the rule.

No other mapping is labelled confirmed broken without an equivalent observed or committed-fixture result.

## 5. Likely broken and unverified mappings

### 5.1 Structurally likely broken

Five fields have the same source/lookup mismatch as the two confirmed examples, but no safe runtime observation was supplied:

| Legacy key | Source property | Why likely broken |
|---|---|---|
| `InnvendigUtvendig_punkt` | `InnvendigUtvendig` | suffix, no alias |
| `Tykkelse_punkt` | `Tykkelse` | suffix, no alias |
| `NOBB-VAVVS-nr_punkt` | `NOBB-VAVVS-nr` | suffix, no alias |
| `S_HYPERLINK_punkt` | `S_HYPERLINK` | suffix, no alias |
| `Tykkelse_led` | `Tykkelse` | suffix, no alias |

These are BROKEN_LIKELY with HIGH structural confidence. A header-only synthetic test is enough to reproduce each without customer data.

### 5.2 Important unverified alternatives

These do not change the five-record count because the direct canonical path remains structurally exact:

- `H_MÅLEMETODE` and `H_NOYAKTIGHET` may be height-specific GMI names. Current aliases route them to horizontal `Nøyaktighet`, while `MålemetodeHøyde` and `NøyaktighetHøyde` have no such aliases. Repository evidence cannot settle the semantics.
- HREF, METODE, PN, SN, NETTTYPE, MATERIALE, and MATR are plausible format variants without a committed safe header fixture or formal crosswalk.
- `DATOREG` and `REGDATO` cannot resolve `Datafangstdato` because they belong to the inert `Dato` group.
- SOSI native properties with names resembling canonical fields are preserved by the parser, but their semantic equivalence and validation authority are unverified.
- PTEMA and GMI LTEMA remain unverified; details are in section 7.

## 6. `_punkt` / `_led` logical-key census

| Legacy key | Unsuffixed source property | Alias exists | Active outcome | Collision risk | V2 treatment |
|---|---|:---:|---|---|---|
| `InnvendigUtvendig_punkt` | `InnvendigUtvendig` | No | BROKEN_LIKELY | Shared point/line concept | canonical `insideOutside`; point rule |
| `Tykkelse_punkt` | `Tykkelse` | No | BROKEN_LIKELY | Shared point/line concept, formats differ | canonical `wallThickness`; point rule |
| `Tema_punkt` | `Tema` | Yes | ALIAS_WORKS for exact listed candidates | Point/line value sets differ | canonical `tema`; point rule/value rule |
| `NOBB-VAVVS-nr_punkt` | `NOBB-VAVVS-nr` | No | BROKEN_LIKELY | Shared point/line concept | canonical `nobbVavvsNumber`; point rule |
| `S_HYPERLINK_punkt` | `S_HYPERLINK` | No | BROKEN_LIKELY | Shared property plus Gemini condition | canonical `attachmentLink`; point/supplier applicability |
| `Tema_led` | `Tema` | Yes | ALIAS_WORKS for exact listed candidates | Point/line value sets differ | canonical `tema`; line rule/value rule |
| `InnvendigUtvendig_led` | `InnvendigUtvendig` | No | BROKEN_CONFIRMED | Shared point/line concept | canonical `insideOutside`; line rule |
| `Tykkelse_led` | `Tykkelse` | No | BROKEN_LIKELY | Shared point/line concept, formats differ | canonical `wallThickness`; line rule |
| `NOBB-VAVVS-nr_led` | `NOBB-VAVVS-nr` | No | BROKEN_CONFIRMED | Shared point/line concept | canonical `nobbVavvsNumber`; line rule |

All nine effective suffix keys are accounted for. No other effective key ends in `_punkt` or `_led`.

## 7. Tema deep dive

### 7.1 Occurrence classification

| Name | Repository role | Delivered vs generated | Validation authority |
|---|---|---|---|
| `Tema` | Innmålingsinstruks source property; active alias | Direct if present in a GMI/SOSI property map | GMI direct: true; SOSI native: unresolved |
| `TEMA` | Active alias | No committed safe GMI header proof | Unresolved; lexical case variant only if format contract confirms |
| `PTEMA` | Practical-memory candidate only | No repository occurrence as delivered field, alias, or parser mapping | UNVERIFIED |
| `LTEMA` | Candidate key in `analyze_sosi_types.cjs` | Potential native SOSI property only; no active mapping; no GMI proof | UNVERIFIED for SOSI semantics; UNVERIFIED for GMI existence |
| `S_FCODE` in GMI | Exact header consumed by committed analysis scripts and app | Literal GMI property in the analyzed corpus | Unresolved equivalence to source Tema; strong practical adapter candidate |
| `S_FCODE` in SOSI | Parser overwrites/adds it from object-name heuristics | Derived | False for source compliance |
| `S_FCODE` in KOF | Parser fills it from KOF code/name/section/fallback | Derived/synthetic | False for source compliance |
| `FCODE` | Active Tema alias | No committed safe delivered-field proof | Unresolved |
| `Tema_punkt` / `Tema_led` | Database/config logical identities | Not source fields; parser does not generate them | False as delivered-field claims |
| `objekttypenavn`, `OBJEKTTYPENAVN`, `OBJTYPE`, `TYPE` | SOSI inference inputs | Native SOSI properties if emitted by sosijs | Native values may be authoritative for SOSI identity, but the GMI-like crosswalk is not |

### 7.2 What the repository proves about GMI Tema

`scripts/analyze_types.js` requires an exact `S_FCODE` index and produced aggregate statistics for the 51-file Færder corpus. That proves literal S_FCODE use in those operational GMI exports without exposing any file details here. `scripts/analyze_gmi_relationships.js` also accepts S_FCODE/Tema/TEMA/FCODE, but does not retain which candidate matched.

There is no committed safe GMI specimen containing Tema, PTEMA, LTEMA, or FCODE. Therefore:

- `S_FCODE → tema` is a well-evidenced practical GMI adapter candidate, but its authority requires domain/format confirmation.
- `Tema → tema` is the direct source-backed mapping if delivered.
- PTEMA/LTEMA must not be guessed into the adapter.

A safe confirmation exercise needs only sanitized `_FIELDNAMES` header inventories by geometry and producer/export version. It does not need coordinates, feature values, filenames, or customer identifiers.

### 7.3 Parser-generated identity

The SOSI parser spreads native properties, then writes inferred S_FCODE. If native SOSI data already contains S_FCODE, the derived value overwrites it. This is useful for styling but destroys provenance at that key.

The KOF parser builds S_FCODE from current section, code, point name, or fallback labels. It is explicitly a grouping/visualization compatibility value.

V2 must retain `sourceKey`, `mappingKind`, and `validationAuthoritative` so derived identity cannot masquerade as a delivered requirement.

### 7.4 Domain decisions relevant to resolution

These confirmed decisions constrain how the canonical Tema mapping will be consumed:

1. usable object identity is the first object-level gate;
2. a missing identity produces one primary missing-Tema issue;
3. downstream object-specific rules are skipped with an explicit classification-unavailable reason;
4. hydraulic classification runs before hydraulic fields;
5. SDR, Ringstivhet, and Trykklasse cannot be classifier inputs;
6. SP/OV classify gravity and VL/SPP classify pressure;
7. unsupported Tema yields UNKNOWN, never default gravity;
8. class-dependent rules are skipped when classification is UNKNOWN.

These are recorded as context only; this census does not design the hydraulic evaluator.

## 8. Alias safety audit

There are 12 configured groups and 41 array candidates. The source audit's “eleven logical fields” count excludes the inert Dato group.

| Logical key | Candidates | Classification | Safety | Finding |
|---|---|---|---|---|
| `Tema_punkt` | S_FCODE, Tema, TEMA, FCODE | semantic crosswalk | UNRESOLVED | S_FCODE occurs in real aggregate corpus; equivalence not formal; PTEMA absent |
| `Tema_led` | S_FCODE, Tema, TEMA, FCODE | semantic crosswalk | UNRESOLVED | same; LTEMA not tried |
| `Høydereferanse` | Høydereferanse, HOYDEREFERANSE, HREF | lexical + format-specific | CAUTION | direct and transliteration plausible; HREF unverified |
| `Målemetode` | Målemetode, MALEMETODE, METODE | lexical + format-specific | CAUTION | METODE is generic and unverified |
| `Nøyaktighet` | Nøyaktighet, NOYAKTIGHET, H_MÅLEMETODE, H_NOYAKTIGHET | semantic crosswalk | AMBIGUOUS | H_* likely belongs to height concepts or at least needs proof |
| `Dato` | Dato, DATO, DATOREG, REGDATO | unsupported/inert | INERT | no effective rule requests `Dato`; does not help Datafangstdato |
| `Trykklasse` | Trykklasse, TRYKKLASSE, PN, TRYKKKLASSE | lexical + format-specific | CAUTION | PN and spelling variant unverified |
| `Ringstivhet` | Ringstivhet, RINGSTIVHET, SN | lexical + format-specific | CAUTION | SN plausible but unverified |
| `SDR` | SDR | redundant lexical | SAFE | exact lookup already does this |
| `Nett_type` | Nett_type, NETT_TYPE, NETTTYPE | lexical | CAUTION | case fallback covers NETT_TYPE; no-underscore form unverified |
| `Material` | Material, MATERIALE, MATR | lexical + format-specific | CAUTION | variants unverified |
| `Bredde (diameter)` | Bredde, BREDDE, DIAMETER, DIMENSJON, DIM | semantic crosswalk | AMBIGUOUS | DIMENSJON/DIM can mean line Dimensjon; diameter is not always width |

Only two groups are counted as ambiguous because they can redirect one semantic property to another. “Caution” aliases may be legitimate format names, but need fixture/crosswalk evidence before V2 treats them as authoritative.

## 9. Format adapter matrix

| Format | Delivered/native evidence | Parser output | 46-field capability | Tema behavior | Validation authority |
|---|---|---|---|---|---|
| GMI | `_FIELDNAMES` and `_FIELDVALUES`; source properties can be direct headers; aggregate proves exact S_FCODE in prior corpus | Attribute keys copied literally; empty→null; numeric/boolean-looking values coerced | Potentially full, but most concrete header spellings lack committed safe fixtures | direct Tema if delivered; S_FCODE/TEMA/FCODE only via legacy resolver | **True** for a direct canonical delivered property; **unresolved** for semantic aliases |
| SOSI | sosijs GeoJSON native properties, including object-type properties | Native props preserved; inferred S_FCODE added/overwritten; polygon represented as line | No verified 46-field crosswalk | object name heuristically becomes GMI-like S_FCODE | Native same-name mappings **unresolved**; inferred S_FCODE **false** |
| KOF | Operation codes, point name/code, sections, coordinates, limited metadata | KOF_* properties plus synthetic S_FCODE | Cannot support general 46-field validation | code/name/section/fallback becomes S_FCODE | **False** for inferred Tema and absent fields; geometry diagnostics may be separate |

### Proposed adapter rule

Every mapping record should carry:

```text
format
inputProperty
canonicalFieldId
mappingKind: direct | lexicalAlias | semanticCrosswalk | derived
validationAuthoritative: true | false | unresolved
geometryContext only if the format genuinely uses different names by geometry
evidenceReference
```

An empty format mapping means “unsupported/unresolved,” not “look for the GMI key anyway.”

## 10. Collision and ambiguity register

| ID | Collision/ambiguity | Effect | Migration risk | Treatment |
|---|---|---|---|---|
| FR-C01 | `_punkt`/`_led` in lookup identity | seven unsuffixed properties missed | HIGH | canonicalize field; scope rules separately |
| FR-C02 | Bredde aliases DIMENSJON/DIM vs line Dimensjon | point rule can consume line-semantic header | HIGH | accept Bredde only until scoped crosswalk proven |
| FR-C03 | Nøyaktighet aliases H_MÅLEMETODE/H_NOYAKTIGHET | wrong value may satisfy horizontal accuracy; height fields remain missing | HIGH | reject ambiguous aliases pending header semantics |
| FR-C04 | S_FCODE/Tema/TEMA/FCODE collapsed | delivered vs alias vs inferred provenance is lost | HIGH | mapping result must retain source key/kind/authority |
| FR-C05 | SOSI parser overwrites/adds S_FCODE | native and derived identity cannot be distinguished | HIGH | V2 adapter consumes provenance-bearing native properties, not blind S_FCODE |
| FR-C06 | KOF S_FCODE is code/name/section/fallback | synthetic grouping can trigger domain rules | HIGH | non-authoritative; disable Tema-dependent validation |
| FR-C07 | Point and line Tema allowed-value sets differ | one field identity could be mistaken for one universal value rule | MEDIUM | one canonical field, separate scoped rules/value sets |
| FR-C08 | Generic case fallback returns first matching key | duplicate case variants can resolve by insertion order | MEDIUM | detect ambiguity rather than choose first |
| FR-C09 | GMI numeric coercion | lexical codes/leading zeroes can change despite correct key | MEDIUM | retain raw value and type-directed normalized value |
| FR-C10 | SOSI `TYPE` is object-name inference input and resembles canonical point Type | semantic collision across formats | MEDIUM | no cross-format mapping without a standard-specific crosswalk |
| FR-C11 | Rørform historically considered for Kumform in analysis only | experimental alias could be mistaken for policy | MEDIUM | keep distinct canonical fields |
| FR-C12 | `Dato` alias group inert | apparent compatibility does not resolve Datafangstdato | LOW | remove from future census or map explicitly only after evidence |
| FR-C13 | legacy UI/state can reference all layers while field results use shared data | equal keys/indices can bleed across layers | HIGH | one run stores one selected layerRef; no merged resolution |

## 11. Recommended V2 canonical field model

The model should have four independent layers:

```text
CanonicalField
  id: insideOutside
  semanticName: InnvendigUtvendig
  valueKind: code

FormatFieldMapping
  format: GMI
  inputProperty: InnvendigUtvendig
  canonicalFieldId: insideOutside
  mappingKind: direct
  validationAuthoritative: true

Rule
  id: ...line.inside-outside.required
  fieldId: insideOutside
  applicability.geometry: line

Evaluator
  check: required value
```

Specifically:

- do not create canonical IDs containing `_punkt`, `_led`, GMI, SOSI, or KOF;
- allow point and line rules to reference one field while retaining different required states and allowed-value rules;
- resolve one selected layer only and store the resolved source key in issue evidence;
- return `missing`, `resolved`, `ambiguous`, `unsupportedFormat`, or `nonAuthoritative` rather than silently guessing;
- preserve raw and normalized values separately where GMI coercion currently loses lexical form;
- allow mappings to be profile-scoped, but never let a per-delivery review decision rewrite a permanent adapter/profile;
- run the Tema identity gate before any object-specific rule and expose explicit skipped reasons.

Recommended canonical IDs are documented, not executable. They intentionally do not copy broken identifiers.

## 12. Regression-test inventory

These are proposed synthetic tests only. No tests are changed in this task.

| Test ID | Synthetic case | Expected proof |
|---|---|---|
| FR-T01 | GMI point with exact `Høydereferanse` | direct mapping resolves and records source key |
| FR-T02 | GMI line with a safe case variant of a canonical key | unique case fallback resolves; duplicate case variants return ambiguous |
| FR-T03 | GMI line with `NOBB-VAVVS-nr`, no suffixed key | V2 resolves `nobbVavvsNumber`; legacy reproduction confirms missing result |
| FR-T04 | GMI line with `InnvendigUtvendig=OD`, no suffixed key | V2 resolves `insideOutside`; legacy reproduction confirms missing result |
| FR-T05 | Parameterized unsuffixed point headers for IU, Tykkelse, NOBB, S_HYPERLINK and line Tykkelse | every BROKEN_LIKELY suffix family resolves canonically without suffix aliases |
| FR-T06 | Same `InnvendigUtvendig` key in one point layer and one line layer | each selected-layer run resolves independently; scope does not change field ID |
| FR-T07 | Only line layer selected while a visible point layer has the needed value | no cross-layer value bleed; line object remains missing if its own field is absent |
| FR-T08 | Point S_FCODE and line S_FCODE in separate runs | one canonical Tema mapping, separate point/line rules and allowed sets |
| FR-T09 | PTEMA-only and LTEMA-only GMI headers before a crosswalk is approved | mapping returns unsupported/unresolved, never guessed |
| FR-T10 | Point with Bredde and line with Dimensjon | correct distinct canonical fields; no DIM alias crossover |
| FR-T11 | Point containing only DIM or DIMENSJON | adapter reports ambiguous/unapproved alias rather than width compliance |
| FR-T12 | H_MÅLEMETODE and H_NOYAKTIGHET headers | adapter rejects ambiguous routing until each is assigned to a proven height/horizontal concept |
| FR-T13 | Exact Nøyaktighet, MålemetodeHøyde, and NøyaktighetHøyde together | all three remain distinct and resolve to their own canonical fields |
| FR-T14 | SOSI native object name that parser maps to S_FCODE | derived Tema evidence is marked non-authoritative and Tema-dependent rules skip |
| FR-T15 | SOSI with an existing S_FCODE property | test exposes current overwrite behavior; V2 adapter retains native and derived provenance separately |
| FR-T16 | KOF point/line producing S_FCODE fallback | no Tema compliance or hydraulic classification is inferred |
| FR-T17 | Object missing Tema | one missing-Tema issue; all downstream object-specific rules skipped with reason |
| FR-T18 | Object with unsupported Tema | identity present, hydraulic class UNKNOWN, class-dependent checks skipped |
| FR-T19 | SP/OV/VL/SPP Tema cases with SDR/Ringstivhet/Trykklasse values varied | class comes only from confirmed Tema mapping, never the fields under validation |
| FR-T20 | GMI numeric-looking code with leading zero or decimal lexical form | raw value retained; typed normalization is field-specific |

## 13. Unresolved questions requiring confirmation

1. Which literal GMI `_FIELDNAMES` are emitted by each supported Gemini export version? A sanitized header-only inventory is sufficient.
2. Do any supported GMI exports use PTEMA for points or LTEMA for lines? No repository evidence currently proves this.
3. Is S_FCODE an approved Gemini/GMI representation of Innmålingsinstruks Tema, and is the mapping direct for both points and lines?
4. What do H_MÅLEMETODE and H_NOYAKTIGHET mean in the actual export schema? Do they map to height method/accuracy rather than horizontal Nøyaktighet?
5. Are HREF, METODE, PN, SN, NETTTYPE, MATERIALE, and MATR supported export headers or local workarounds?
6. Can point Bredde ever legitimately be delivered as DIM, DIMENSJON, or DIAMETER, and how is collision with line Dimensjon prevented?
7. Is there an authoritative SOSI product specification/crosswalk for any of the 46 concepts? Native property resemblance is insufficient.
8. Should KOF expose only geometry/technical diagnostics, or are any explicit KOF codes approved for a narrow canonical-field subset?
9. If multiple keys map to one canonical field in the same object, what precedence/conflict policy should apply? Safe default: report ambiguity unless values agree and the mapping authority is explicit.

## 14. Recommended next action

Create a privacy-safe, header-only format evidence pack before adapter implementation:

1. synthetic GMI fixtures for every confirmed/likely broken suffix family and each alias family;
2. sanitized distinct `_FIELDNAMES` lists by geometry and export version, with no filenames or values;
3. a reviewed Tema crosswalk that explicitly decides S_FCODE/PTEMA/LTEMA authority;
4. a reviewed H_* and DIM/DIMENSJON mapping decision;
5. separate SOSI and KOF capability declarations.

Then write a non-executable canonical-field/adapter specification and regression tests before building the V2 resolver. Do not patch the legacy resolver as part of that work.

## 15. Machine-readable companion and completeness proof

`docs/validation-v2/field-resolution-census.json` is documentation data only. It contains:

- 46 census entries and 46 unique legacy field keys;
- 41 unique recommended canonical IDs;
- all nine effective suffix keys;
- all 12 `FIELD_ALIASES` groups and 41 configured array candidates;
- explicit GMI/SOSI/KOF authority for every field;
- the same status and confidence classifications as the matrix;
- Tema evidence and the current domain decisions needed by future field consumers.

It must not be imported by runtime code.
