# Validator 2.0 v3.2 — point-field source review, architecture and roadmap

Date: 2026-09-06. Requested workflow: GPT-6 Astra, direct review, no delegation. This report records the requested workflow label, not an independently verified model variant. Checkpoint: `feature/validator-v2-v32-baseline`, `18834c0` (`Add v3.2 point integer format validation`), initially clean. Only this report is changed.

## 1. Executive conclusion

Complete the remaining safe point-value work in **two substantial implementation batches**, not another sequence of individual field plans:

1. **Existing evaluator completion:** eight supplied integer fields, two optional exact code lists, and correction of the existing code-validation lexical-evidence gap. Ten new rules; no new evaluator kind.
2. **Remaining scalar formats:** supplied decimal distance, installation-year format, capture-date format and the documented note-length limit. Four new rules using small explicit format evaluators.

The recommended scope is point-only for new rules, including common source fields. That keeps this point milestone bounded and leaves line-value completion for its own consolidated pass. The shared evaluator correction also corrects existing line Tema lexical validation; its rule count does not change. Do not claim that line behavior is entirely unchanged.

Expected final counts: **45 active / 38 point-applicable / 21 line-applicable**. Applicability remains metadata-only at **88 cells, 71 APPLICABLE, 9 NOT_APPLICABLE, 8 UNKNOWN**, revision `2026-09-04.3`.

The broad review found **33 point-applicable canonical field concepts**, including the retired Synbarhet field. Fourteen warrant new supplied-value rules. Five existing coded fields need an evidence-path correction, not additional rules. Eleven need no further active rule in this point-value phase. The remaining three are retired metadata, identifier/provenance work and attachment/delivery work. Several otherwise-ready fields also have separately blocked semantic requirements; the inventory records those facets rather than letting one blocker obscure the whole field.

Concrete defect: optional code validation compares parser-converted values rather than preserved lexemes, and Tema identity/validation also loses lexical spelling. A read-only synthetic real-GMI probe with padded Tema, Type, Kumform, Byggemetode and Kjegle values passes all five rules and Type↔Tema compatibility. This contradicts the established exact, non-normalizing automated policy. Fix this within Batch 1 before declaring code-list completion.

The architecture is broadly proportionate. The excessive cost is primarily the workflow granularity, not ObjectRefs, canonical binding or the result model. Reuse those boundaries, retain explicit rules and batch repeated contracts. No refactor for elegance is recommended.

## 2. Current implementation baseline and evidence

### Checkpoint and observed counts

The requested initial commands showed no short-status output, the exact expected branch, and these five commits:

```text
18834c0 Add v3.2 point integer format validation
6c10bca Refine v3.2 LOK applicability policy
f14ee4f Extend v3.2 point applicability policy
2da5429 Add v3.2 point applicability metadata
68989e4 Record v3.2 point applicability policy
```

Read-only imports of the registry confirmed 31 active rules: 14 common, 10 point-only, 7 line-only. Therefore point views contain 24 rule rows and line views 21. These are rule-row counts, not numbers of findings or objects. The runner produces 31 RuleResults, including rules with zero applicable objects. The field registry contains 41 canonical concepts, of which 33 include point scope.

Current common rules cover eight required-presence fields (year, date, surveyor, case number, two accuracies and two maximum deviations) and six required code lists. Point-only rules cover Tema, optional Type, three optional construction/shape lists, Type↔Tema compatibility, required InnvendigUtvendig, two optional integer dimensions and required Tykkelse. Line-only rules account for the other seven.

### Authority and reproducibility

The local v3.2 primary PDFs are **not Git-tracked**. `git ls-files REF_FILES` returns nothing; the tracked rebaseline report explicitly says these references must remain uncommitted. The tracked PDFs under `src/data/` are v3.1 and were not used as v3.2 authority. This is a source-packaging limitation, not a reason to substitute old source material.

| Source key | Local primary reference | SHA-256, rechecked in this pass |
|---|---|---|
| A | `REF_FILES/innmalingsinstruks/2026-v3.2/Innmålingsinstruks 2026 vedlegg-a.pdf`, 27 pages, v3.2 / 01.08.2026 | `669F4C1AC0D4943BD70F1D4C78C9DDE4C5346823060EFBCCD9ABA93D307086D5` |
| M | `REF_FILES/innmalingsinstruks/2026-v3.2/Innmålingsinstruks 2026.pdf`, 29 pages, August 2026 | `36273756BBFBBB14D2C449CCF32CF5AEB9579C10A099783A790AF662B3DED81F` |

References such as A9 mean the printed/physical PDF page, not extraction line numbers. Primary inspection covered A4–10 and A14–16, the full main-instruction text with targeted rereads of M10, M13–17 and M25–29, and the previously reviewed tracked list/source records. Existing long lists were sanity-reviewed against established reports and literal fixtures rather than independently retranscribed in full. This is not a repeat of previous detailed list reviews. PDF text extraction can misalign description columns; new list membership below uses the code column and established source records, not guessed description alignment.

Tracked evidence used:

- [v3.2 rebaseline and full source inventory](20260831-validator-v2-v32-rebaseline-plan.md), especially sections 3, 6 and 8.
- [Settled strict-code/manual-validation policy](20260902-validator-v2-v32-code-text-fallback-policy.md).
- [Point representation plan](20260904-validator-v2-v32-point-representation-plan.md).
- [Integer lexical plan](20260904-validator-v2-v32-point-numeric-lexical-plan.md) and [closed independent review](20260904-validator-v2-v32-point-numeric-lexical-review.md).
- [Applicability domain policy](20260904-validator-v2-v32-point-applicability-domain-policy.md) and its committed implementation.
- `docs/validation-v2/innmalingsinstruks-rule-source-map.json`, canonical registry, rule registry, Field Info data, relevant evaluator/runner/parser/result code and focused test sources.

No field frequency, customer delivery, legacy list or observed historical presence was used as policy authority. No web/current-standard update was substituted for the pinned v3.2 review.

## 3. Full point-field inventory

### Reading the inventory

Each row names an existing canonical ID and source property. P = point, L = line. Scope describes the **source**, not the proposed new rule scope. Unit `—` means none specified/applicable. A numeric datatype is not a positive-domain, plausible-range or fixed-digit-count requirement.

Classification: A supplied format; B finite list; C other self-contained check/correction; D blocked requiredness/applicability; E blocked representation/delivery; F blocked source ambiguity; G blocked relationship/provenance; H metadata only; I adequately implemented for this phase. The primary classification selects the next useful action. Facet classifications preserve independently blocked work on an otherwise-ready field.

For all A/B/C supplied-value checks below, applicability is **not an input**, absent/missing values are NOT_EVALUATED, structural uncertainty is INDETERMINATE, and no polygon or topology evidence is needed unless a row explicitly says otherwise. Existing required rules continue to report missing values. Thus a new optional format rule on an already-required field does not make the field optional overall.

Confidence is confidence in this classification and source contract. High does not mean blocked semantics have been resolved. “No bound” below means no unconditional executable bound established by this source review.

### 3.1 Fourteen remaining new-rule candidates

| Canonical ID / source name | Source scope; datatype; unit; values/format | Numeric constraints and source | Applicability and requiredness dependencies | Polygon/GML; topology/relationship; conflicts | Current status → classification; confidence; exact reason |
|---|---|---|---|---|---|
| `horizontalAccuracy` / Nøyaktighet | P+L; Heltall; cm; integer lexeme | A4, A6; M10 says standard deviation ≤3 cm unless otherwise agreed. No unconditional bound proposed. | Common requiredness already active; threshold needs agreement/override evidence. | None for format; actual measurement quality needs observation provenance. No format conflict. | Presence only, format/unit documented → **A, High**. Integer format is ready; threshold is D/F and true measurement verification G. |
| `verticalAccuracy` / NøyaktighetHøyde | P+L; Heltall; cm; integer lexeme | A4, A6; M10 says ≤5 cm unless otherwise agreed. No unconditional bound proposed. | Same as XY, with an independent Z threshold. | None for format; measurement verification G. No format conflict. | Presence only, documented → **A, High**. Do not reuse XY's numeric threshold. |
| `maxHorizontalDeviation` / MaksAvvikHorisontalt | P+L; Heltall; cm | A4, A6; M5 cites 20 cm at every place on outer delineation; M10 requires reporting. Not an established unconditional scalar range rule. | Presence active; executable maximum-boundary policy unresolved. | Format none; proving the boundary deviation requires qualifying geometry and measurement provenance. | Presence only, documented → **A, High**; scalar cap F, geometric verification E/G. A reported integer is independently checkable. |
| `maxVerticalDeviation` / MaksAvvikVertikalt | P+L; Heltall; cm | A4, A6; M5 cites 30 cm at every place on outer delineation; M10 reporting. Same qualification as horizontal. | Presence active; boundary/range policy unresolved. | Format none; boundary/observation proof E/G. | Presence only, documented → **A, High**. No automatic 30 cm cap in this batch. |
| `wallThickness` / Tykkelse | P+L; **P Heltall/mm**, L Tall/mm with one decimal | A5, A9; no point min/max/sign bound. A9 describes outer width = Bredde + 2×Tykkelse. | Point presence active. Do not add applicability or redefine requiredness. | No geometry for supplied format; verifying derived outer width needs the correct inner/outer basis and an independent owned target. | Point presence only, format documented → **A, High**. Point integer rule must not run on line Tykkelse. Equation is H until an actual comparison contract exists. |
| `externalHeight` / Utvendig_høyde | P; Heltall; mm; height from top cover to outer bottom | A5, A9; no min/max, positivity, precision or cross-field tolerance. | **F/D:** A5 optional vs A9 obligatory for non-circular prefabricated installations. Shape/construction evidence also needed for conditional requirement. | Format none; derived checking needs lid/bottom ownership and survey roles (G), possibly polygon evidence (E). Requiredness conflict remains. | Canonical binding only; no V2 Field Info entry or rule → **A, High** for supplied integer; never interpret this as resolving F/D. |
| `innerBottomToOuterUndersideDistance` / Avst_BunnInnvUnderUtv | P; Desimaltall; m; supplied distance | A5, A9, M14; no precision, range or sign constraint. A5 gives inner-bottom height minus outer-underside height. | **F/D:** A5 Ja, A9 obligatory for circular prefabricated installations; whether A9 narrows A5 is unresolved. | Supplied number needs none. Derived distance needs typed observations, ownership, sign/equation and tolerance (G/E). Decimal separator/exponent conventions not specified. | Canonical binding only; no V2 Field Info entry/rule → **A, Medium**. Decimal datatype is explicit; use the bounded technical/evidence policy in section 4, not an invented geometric calculation. |
| `nobbVavvsNumber` / NOBB-VAVVS-nr | P+L; Heltall; —; supplied identifier in integer format | A5, A10; usually 8 digits for points, A16 usually 7 for lines. Neither is an exact length restriction. No min/max/checksum. | Explicitly optional; no applicability consumer needed. Point descriptions distinguish base section and lid products. | No geometry for format; verifying product identity/selection would need catalogue/version and owning component (G). “Usually” counts are not contradictory mandatory lengths. | Old required rule removed; optional integer format documented → **A, High**. Add integer format, never restore requiredness or insist on eight digits. |
| `nobbVavvsFrameNumber` / NOBB-VAVVS-nr-ramme | P; Heltall; — | A5, A10; usually 8 digits, no exact length/checksum/domain bound. | Explicitly optional. | None for format; catalogue/frame relationship G. No source format conflict. | Old required rule removed; optional format documented → **A, High**. Same integer contract as other supplied integers. |
| `installationYear` / Anleggsår | P+L; YYYY; calendar year, no measurement unit; four ASCII digits in proposed technical contract | A4, A6; no historical minimum, current-year maximum, future-year prohibition or date-order relation. | Required presence already implemented. | No geometry/topology; source does not specify era/year-zero policy. | Presence only, documented → **A, High** for four-digit format. Do not interpret it as a general integer rule or compare with today's year. |
| `captureDate` / Datafangstdato | P+L; DD.MM.YYYY; date, no measurement unit | A4, A6; exact component widths/separators. No explicit calendar/range/time-zone/chronology policy. | Presence active; no additional applicability. | None for lexical format; chronology against construction or historical delivery needs additional contract. | Presence only, documented → **A, High** for supplied lexical format. Calendar validity is explicitly outside the proposed narrow rule; see section 4. |
| `owner` / Eier | P+L; Kode; —; `AN,F,I,K,K1,K2,L,P,P1,S,S1,S2,S3` | A4, A8–9; 13 exact values; no numeric domain. `I` is a letter. | Explicitly optional. | None. M25 fallback ambiguity is already covered by the accepted strict automated policy, not erased from the source. | Canonical binding only; no V2 Field Info entry/rule → **B, High**. Complete remaining common code list for points; include `L`. |
| `access` / Adkomst | P; Kode; —; `DO,NG,NT,ST,UTENST` | A5, A15; five exact values; no numeric domain. `DO` ends in letter O. | Optional, desired. No requiredness inference from “ønskes utfylt”. | None; settled M25 automated policy applies. | Canonical binding only; no V2 Field Info entry/rule → **B, High**. All supplied exact current codes can be checked now. |
| `note` / Merknad | P+L; Tekst; —; maximum 255 characters | A4, A6; explicit inclusive 255-character limit; no minimum or text-content vocabulary. | Explicitly optional; no applicability dependency. | None; source does not define Unicode counting/normalization conventions. | Canonical binding only; no V2 Field Info entry/rule → **C, Medium**. A supplied-text length check is self-contained; counting policy must be labeled technical, not attributed verbatim to A6. |

### 3.2 All nineteen other point concepts, including incompletely implemented ones

For code rows, unit and numeric-domain constraints are none; the exact list is the domain. Long already-reviewed vocabularies are referenced by their source pages and committed literal oracles, not duplicated here.

| Canonical ID / source name | Source scope; datatype; format/list and source | Applicability / requiredness | Polygon/GML / relationship dependencies and source conflicts | Current status → primary classification; confidence; reason |
|---|---|---|---|---|
| `tema` / Tema | P+L; Kode; P 81 exact codes A4, A10–12, L separate 108-code list | Required list active. Direct Tema preferred, S_FCODE sole accepted fallback; disagreement must remain CONFLICT. | No geometry for list; no hydraulic inference. Settled M25 policy qualifies automated closure. | List present, **lexical gap** → **C, High**, correct evidence path with zero new rules. See section 11. |
| `type` / Type | P; Kode; 72 exact codes and source Type→Tema pairs A4, A12–14 | Where available; optional list active; compatibility only after both lists pass. | Two fields on the same ObjectRef suffice; no inter-object topology. M25 policy retained. | List and pair rules active, **lexical gap** → **C, High**, repair shared optional list evaluator and prerequisite flow; no extra rule. |
| `manholeShape` / Kumform | P; Kode; `AN,F,FK,FR,N,R,X`, A4, A14 | A4 Ja but exact object/Tema required scope deferred (D). Current optional rule intentionally does not consume applicability. | Shape-dependent representation separate E; no dependency for code. M25 policy retained. | Optional list active, **lexical gap** → **C, High**. Correct same shared evaluator. |
| `constructionMethod` / Byggemetode | P; Kode; `B,BU,E,E0,E1,G,K,M,MU,P,S,SU,UK,V,W`, A5, A15 | Ja in overview; scoped requiredness D. Nine explicit prefabricated descriptions do not establish the negative complement. | Construction classification is separate metadata/evidence; no geometry for list. M25 policy retained. | Optional list active, **lexical gap** → **C, High**. Code validation does not prove prefab applicability. |
| `cone` / Kjegle | P; Kode; `E,R,S,T,U`, A5, A15 | Ja in overview; requiredness D; current optional treatment deliberate. | No supplied-list dependency; M25 policy retained. | Optional list active, **lexical gap** → **C, High**. No additional rule after correction. |
| `width` / Bredde (A9 display: Bredde (diameter)) | P; Heltall; mm; technical integer grammar; A4, A9 | **D/E:** combined Bredde (/ Lengde) row excludes polygon delineation; exact semantic scope still separate. | Owned qualifying polygon and completeness needed for absence exception. No numeric bounds; examples 1000/1600/2000 are not a list. | Supplied integer active → **I, High** for this phase. Binding must continue to reject DIM/DIMENSJON/Dimensjon/DIAMETER. |
| `length` / Lengde | P; Heltall; mm; A4, A9, M15 | **D/E:** combined overview row; exact shape/length requirement unresolved. | Polygon representation separate; supplied value never geometry-derived. No numeric bounds. | Supplied integer active → **I, High** for this phase. No further supplied-value rule. |
| `insideOutside` / InnvendigUtvendig | P+L; Kode; `ID,OD`; A4–5, A14, A21, M10 | Required exact lists already active per geometry. | No dependency for list. Derived outer width needs actual dimensional basis, so do not generalize A9 equation across OD values. | **I, High**. Value validation adequate; representation arithmetic deferred. |
| `heightReference` / Høydereferanse | P+L; Kode; `BUNN_INNVENDIG,PÅ_BAKKEN,SENTER,TOPP_INNVENDIG,TOPP_UTVENDIG,UKJENT,UNDERKANT_UTVENDIG`; A4, A6 | Required exact list active. Appropriate reference for a measurement role is separate. | M13–17 lid/bottom/TOP and point↔line reference requirements need role/relationship evidence G; polygon reference E. Pressure context lacks mapping. | **I, High** for list. Code membership is not proof a coordinate was surveyed at that reference. |
| `measurementMethod` / Målemetode | P+L; Kode; 69-code vocabulary A6–7, A23–25, exact integer-code-string policy | Required list active. | No dependency for supplied code; equipment/procedure verification needs observation evidence. M25 automated-policy qualification. | **I, High**; existing lexeme-aware list evaluator is adequate. Code 97 is in this list. |
| `heightMeasurementMethod` / MålemetodeHøyde | P+L; Kode; 35-code vocabulary A7, A25–27 | Required list active. | Same separation from measurement procedure; no geometry for supplied code. | **I, High**; do not borrow the XY list or add its 97. |
| `positioningCondition` / Stedfestingsforhold | P+L; Kode; ten values A7–8, current exact registry | Required list active. | Verifying actual trench/observation condition needs provenance; M10 procedural language does not authorize rejecting all codes except ÅPEN_GRØ. | **I, High**; no further list rule. |
| `positioningCause` / Stedfestingsårsak | P+L; Kode; `FJERN,FLYTT_DELV,FLYTT_HELT,NYTT,PÅVI,UENDR`; A8 | Required list active. | Whether an object really moved/is new needs project/history evidence G. No numeric constraints. | **I, High** for supplied values. |
| `verticalLevel` / Vertikalnivå | P+L; Kode; seven values A9, current exact registry | Required list active. | Spatial/terrain/water verification G/E; field presence is not hydraulic classification. | **I, High**; `I_VANNSØYL` remains exact; no coordinate-derived classification. |
| `surveyedBy` / Innmålt_av | P+L; Navn/text; —; contractor/person information A4, A6 | Required presence active. | No executable name/initial grammar, identity authority or required external directory. | **I, High** for this phase; descriptive expectations H. Do not invent a name regex or log personal content. |
| `caseNumber` / Saksnummer | P+L; Tekst; —; municipal/project identifier A4, A6, M25 | Required presence active. | No exact length/regex. Cross-file project identity/filename consistency would require delivery provenance G. | **I, High**; examples are not a mandatory grammar. Free-text typing alone adds little useful validation under a coercing GMI parser. |
| `visibility` / Synbarhet | Historical P+L; retired Kode; —; old `0–3` list A8, explicitly retired/non-VA A4 | No active requirement. | Retirement governs retained historical table; do not revive it as an optional list. | Retired documentation retained, no rule → **H, High**. Correct current outcome. |
| `facilityId` / AnleggsID | P; Tekst; —; A5, A9, M25; no exact identifier syntax or numeric domain | A5 “Der tilgjengelig”; M25 AnleggsID or SID, project numbering agreed where absent. Presence rule needs alternative-identity and agreement policy (D/F). | SID is an alternative concept, not an approved alias. Identity persistence and lid suffixes require project/role relations (G). No UUID grammar. | Binding only, no V2 Field Info/rule → **G, High** for meaningful active validation; H for source description. No defensible standalone regex to add. |
| `attachmentLink` / S_HYPERLINK | P+L; Generert; —; generated attachment path/list A5, A9, A16 | Conditional on Gemini Terreng origin, which target-field presence cannot establish (D). | **E:** source-application provenance, attachment bundle/manifest and ownership/completeness needed; path grammar/list delimiter unspecified (F), link-to-object relationship G. | Binding only, no V2 Field Info/rule → **E, High**; H description. Do not assume URL syntax, require a filesystem path format, or fetch/open links. |

### 3.3 Additional main-instruction concepts and scope reconciliation

These are not missing Appendix A canonical fields. Naming them avoids silently treating the 33-field registry as the entire measurement/delivery standard.

| Source concept / canonical ID | Format, unit, source and supplied-value contract | Dependencies / classification / confidence |
|---|---|---|
| GUID / **no canonical field ID**; parser feature `guid` | M28 requires corresponding GMI/GML VA points to share GUID; string representation/profile grammar not established by these PDFs. No source-backed UUID version, hyphen/braces/case rule or numeric domain. | **G/E, High**. Exact cross-file correspondence needs declared delivery, source profile and preserved identifiers. Duplicates need role-aware cardinality; lid/pit IDs can legitimately relate. Do not use parser-local IDs as GUID or create a universal UUID rule. |
| SID / **no canonical field ID** | A9, M25 alternative object identity; examples look numeric but no exhaustive lexical contract. | **G/F, High**. Establish a distinct accepted binding and alternative-ID policy; never enable it as an AnleggsID alias by inference. |
| NØH / coordinates / **no canonical field ID** | M10 requires north/east/height; heights orthometric NN2000, CRS information in file. Geometry evidence exists but field-specific survey-role and CRS contracts are not an Appendix scalar format. | **E/G, High** for normative checks. A future geometry-integrity batch can consider finite/missing coordinates as input validity, but this review establishes no new source rule that parser-coerced coordinates alone can prove. No elevation range or inferred Z role. |
| EPSG/vertical datum headers / **no canonical field ID** | M10 specifies CRS information and regional/default projection guidance; no new direct point field or unconditional one-EPSG rule. | **E/F, High**; use delivery/header provenance and an explicit coordinate-profile contract in a separate geometry phase. Do not infer valid region from proximity. |
| Main lid/TOP/centre-bottom/outer-underside observations / **no separate canonical IDs** | M13–17; distinct observations with designated height references. Raw Z is not a role. | **G/E, High**. Requires owned observations and typed relationships, not arbitrary Z subtraction. |
| Multiple lid numbering / **no separate canonical ID** | M15 main lid shares object ID; additional lids use underscore sequence in the described situation. | **G/D, High**. Main/additional lid roles and their owner must be established before checking suffixes. Do not constrain every AnleggsID to an example prefix/suffix. |
| File naming, revision/export date, photos, measurement report; imported Max 3D avvik/ytreDim / **no new Appendix point IDs** | M12, M25–29; delivery/procedural information, not an unimplemented point date/height column. | **H/E/G, High**. Manifest/profile/attachment or measurement evidence needed. Do not bind these prose names to existing scalar fields or create phantom fields. |

The other eight canonical concepts are line-only: `dimension`, `verticalDimension`, `material`, `networkType`, `pipeShape`, `pressureClass`, `ringStiffness`, `sdr`. They are **outside this point inventory**, not missing point validators. In particular, M13's descriptive “byggemateriale” does not establish that line `Material` must bind points. Point construction is represented by Byggemetode in A15. Hydraulic list/domain and pressure/gravity work remain separate; no hydraulic inference from Tema names, Material, Ringstivhet, Trykklasse, SDR, Nett_type or target presence.

## 4. READY fields and executable-policy boundaries

### Existing contracts: immediately implementable together

Eight integer fields can reuse `INTEGER_FORMAT`: horizontalAccuracy, verticalAccuracy, maxHorizontalDeviation, maxVerticalDeviation, wallThickness (P), externalHeight, nobbVavvsNumber (P), nobbVavvsFrameNumber. A6/A9/A10 explicitly say Heltall. Reuse the established exact base-10 signed-digit contract, including leading zeros, zero and negative integers. Do not add plausibility, positivity, unit conversion, database existence, fixed identifier length or scientific-notation coercion.

Lexeme first; otherwise exact string; otherwise safe finite JS integer. Unsafe runtime integers without lexical evidence remain INDETERMINATE with `NUMERIC_PRECISION_UNAVAILABLE`, never a source range failure. Parser-produced whitespace-only missing values remain NOT_EVALUATED for optional checks. Bredde and Lengde retain their existing semantics.

Eier and Adkomst reuse `ALLOWED_VALUE`, **after its lexeme correction**. Exact literal sets are in section 3.1. Nonempty unlisted/explanatory values fail automated verification and need manual validation under the accepted product policy. This is not a claim that M25 bans explanatory text.

### Remaining formats: one bounded implementation pass, no geometry work

These technical conventions are recommendations for Batch 2. They are intentionally distinguished from the source datatype/limit. Acceptance of this roadmap for implementation settles these bounded product conventions; no field-by-field source-planning cycle is necessary. If different conventions are wanted, decide them together before Batch 2.

| Field | Recommended implementation contract | What it must not claim |
|---|---|---|
| Avst_BunnInnvUnderUtv | A9 Desimaltall: recognize exact plain signed decimal strings with digits and optional single dot **or comma** fractional part, including integer spellings: `[+-]?[0-9]+(?:[.,][0-9]+)?`, requiring the entire string. Do not trim or convert separators. Both separators are a conservative technical acceptance policy because A9 selects neither. Clearly nonnumeric values fail. For alternative numeric-looking notation not settled by A9 (e.g. exponent, `.5`, `1.`, grouping or padded numeric text), return INDETERMINATE with a stable decimal-notation reason, not an asserted STANDARD syntax violation. Runtime finite numbers without a lexeme can establish a numeric value, but cannot prove its original spelling; format outcome is INDETERMINATE. Nonfinite/unsupported types fail. | No fixed decimals, rounding, positive-only domain, measurement accuracy, computed distance, requiredness, or default separator attributed to the source. Ambiguous notation is not a pass and cannot be silently normalized. |
| Anleggsår | Exactly four ASCII digits, entire string. Lexeme first; fallback string same. Safe integer runtime values whose unpadded ordinary decimal representation has four digits may pass as the established technical fallback; do not pad `1` into `0001`. Other numeric cases lacking original width can be INDETERMINATE rather than invented lexical failures. | This is **YYYY format**, not historical plausibility or chronology. No current-date dependency. `0000` as a supplied four-digit string is not rejected by a source-invented year minimum. |
| Datafangstdato | Exactly two ASCII digits, dot, two digits, dot, four digits; lexeme/string only, entire string. Non-text runtime date representations lack source-format evidence and are INDETERMINATE; no Date.parse, locale parsing, timestamp conversion or JS Date rollover. | This narrow rule checks **DD.MM.YYYY format**, not calendar validity. Thus `31.02.2026` and `00.00.0000` match its format. State this explicitly in Field Info. Calendar validation, including year-zero/calendar convention, is a separate bounded product decision, not hidden in a format rule. |
| Merknad | At most 255 Unicode code points in original supplied text, including whitespace; no trim/normalization. Code-point counting is the explicit technical meaning chosen for “tegn”, not a source-specified JS string.length limit. Lexeme first, otherwise string; missing NOT_EVALUATED. Runtime non-string values without lexical text are INDETERMINATE because GMI coercion can erase text/length. | No byte limit, UTF-16 code-unit limit, grapheme normalization, content/name validation, or telemetry of note text. This does not verify a remote system's storage encoding. |

The conservative decimal indeterminate branch is preferable to labeling an unspecified notation as a source violation. It requires a small explicit recognition policy and independent examples, not a generic number parser. Freeze that policy in Batch 2's implementation report and tests.

Date calendar validity could be added to the same date rule in Batch 2 if the domain/product owner explicitly chooses a calendar contract beforehand; **the counts here assume lexical format only**. Do not silently strengthen the agreed brief. This is the main deliberate semantic limit of the date recommendation.

## 5. BLOCKED work and exact unblock evidence

| Blocked facet | Class | Exact unblock; no inferred substitute |
|---|---|---|
| Kumform/Byggemetode/Kjegle requiredness; remaining point field scope | D | Versioned policy connecting field requirements to authoritative point classes/Tema and handling unknown classes. The current positive applicability cells are not requirements. |
| Utvendig_høyde requiredness | F/D | Publisher correction or explicit domain-owner precedence/Boolean policy for A5 vs A9, then usable shape/construction evidence and treatment of UNKNOWN. Supplied integer format proceeds independently. |
| Avst_BunnInnvUnderUtv requiredness | F/D | Decide whether A9 narrows A5 or emphasizes a subset; define exact condition and unknown behavior. No negative complement inference. |
| Bredde/Lengde absence and representation exception | E/D | Parse qualifying companion GML; exact owned boundary relation; profile/role evidence; delivery completeness; source-backed condition for when dimensions may be replaced. A GMI-only upload cannot prove polygon absent. |
| Full shape and prefabrication classification | D/F | Explicit treatment of unmapped shape/construction codes. Existing plan only positively maps R to circular, F/FK/FR to non-circular, and B/BU/E/E0/E1/G/K/P/V to prefab. AN/N/X and remaining construction codes stay UNKNOWN. |
| XY/Z accuracy rejection limits | D/F | An explicit agreement/override input and rule policy consistent with M10; absence of override evidence is not proof none was agreed. |
| Max-deviation scalar caps and actual outer-boundary accuracy | F/E/G | Executable policy linking M5/A6 reporting values to an acceptance test, and independently authoritative boundary/measurement evidence for actual deviation. Do not turn the cited 20/30 cm into an unconditional scalar domain by inference. |
| Height-reference appropriateness and derived distance/height | G/E | Typed observations, object/lid/TOP/polygon ownership, measured-vs-derived provenance, units, equation/sign and tolerance. No arbitrary Z arithmetic. |
| AnleggsID/SID alternatives, stable identity and lid numbering | G/D/F | Explicit SID binding and identity precedence/alternative rule; project numbering context; roles/cardinality; historical delivery identity for persistence. AnleggsID remains direct text binding. |
| GUID/GML correspondence | G/E/F | Versioned GML profile, exact identifier preservation, scoped relation and cardinality, duplicate/conflict states, and complete declared delivery. UUID grammar requires separate profile authority. |
| S_HYPERLINK and attachments/photos | E/D/F | Source-application provenance, path/list contract, bundle manifest, owned references, completeness. No path dereference/network lookup in scalar validation. |
| Point↔line/stikkledning procedures | G | Real endpoint/component topology, observation role and provenance. M16 requires the stikkledning's own top pipe, not the main pipe top; nearest line cannot establish that. |
| Hydraulic context-dependent rules | D/G | Explicit pressure/gravity classification evidence and any required topology. No inference from code names, material or hydraulic target fields. |

No new active rule should be created merely to emit a failure for these unknowns. Future consumers must keep UNKNOWN/CONFLICT distinct from explicit NOT_APPLICABLE. Exactly how a consumer reports indeterminate evidence must be designed with that consumer, not retrofitted into current scalar evaluators.

## 6. Documentation and metadata only

Retain Synbarhet as retired; never create a “supplied historical code” rule. Describe AnleggsID's alternative SID meaning, generated attachments, observation roles, representation conditions and unresolved height requiredness without presenting them as active validation.

Source-backed descriptions of surveyor/case text and the usual NOBB digit counts are useful Field Info, but do not justify regexes, exact digit counts or identifier lookup. Byggemetode's prefab descriptions and Kumform's partial shape map are metadata/evidence candidates; they need no classifier result rows.

Current V2 Field Info is incomplete for several canonical-only fields. Batch 1 should add entries for newly active externalHeight, owner and access; Batch 2 for distance and note. Existing optional NOBB entries and required-only format entries need their automation qualifications updated. Do not confuse presence in legacy `src/data/fields.json` with active V2 documentation or validation.

The current Field Info composer expects a rule, and UI access is organized around result rows. Storing metadata for an inactive concept does not automatically expose it in that workflow. A future field catalogue can expose inactive metadata if desired; do not manufacture dummy rules to get clickable rows, and do not expand the UI in these batches.

## 7. Proposed implementation batches

### Batch 1 — Complete existing integer/list contracts and lexical evidence

Include all eight remaining integer fields and both remaining lists from section 4. Also repair lexical handling for existing Type, Kumform, Byggemetode, Kjegle and Tema, including Type↔Tema prerequisites, Fildata and the existing shared line Tema path. This is coherent work on supplied scalar evidence, not a new representation architecture.

Add these ten explicit **point-only** rules (recommended stable IDs):

| Rule ID suffix after `innmaling.point.` | Canonical field | Evaluator/category |
|---|---|---|
| `horizontal-accuracy.integer` | horizontalAccuracy | INTEGER_FORMAT / VALUE_FORMAT |
| `vertical-accuracy.integer` | verticalAccuracy | INTEGER_FORMAT / VALUE_FORMAT |
| `max-horizontal-deviation.integer` | maxHorizontalDeviation | INTEGER_FORMAT / VALUE_FORMAT |
| `max-vertical-deviation.integer` | maxVerticalDeviation | INTEGER_FORMAT / VALUE_FORMAT |
| `wall-thickness.integer` | wallThickness | INTEGER_FORMAT / VALUE_FORMAT |
| `external-height.integer` | externalHeight | INTEGER_FORMAT / VALUE_FORMAT |
| `nobb-vavvs-number.integer` | nobbVavvsNumber | INTEGER_FORMAT / VALUE_FORMAT |
| `nobb-vavvs-frame-number.integer` | nobbVavvsFrameNumber | INTEGER_FORMAT / VALUE_FORMAT |
| `owner.valid` | owner | ALLOWED_VALUE / ALLOWED_VALUE |
| `access.valid` | access | ALLOWED_VALUE / ALLOWED_VALUE |

Keep existing rule IDs/presence semantics. Separate presence and format rows answer different questions: missing value fails presence and is NOT_EVALUATED for format; supplied malformed value passes presence and fails format. This avoids changing common/line presence semantics and avoids a new combined required-integer evaluator. Do not consolidate old rules merely to reduce the displayed count.

Shared evaluator work is small: reuse INTEGER_FORMAT unchanged; make optional ALLOWED_VALUE use the same lexeme-first comparison primitive already used by REQUIRED_ALLOWED_VALUE. Extend the owned Tema evidence to retain relevant exact lexemes and consistently use them for agreement and code validation. Preserve canonical selection/fallback/ambiguity rules. An exact direct value and a differently spelled fallback must not be silently reconciled by parser trimming. When lexical evidence is absent retain the existing typed-value fallback; do not manufacture spelling.

Likely files: `registry/rules.js`, `ruleEvaluation.js`, `temaIdentity.js`, `validationRunner.js` (Tema evidence handoff if needed), `fieldData.js`, `registry/fieldInformation.js`, `src/data/validation-v2/field-information.json`; `index.js` only if deliberate public exports are added. No new canonical fields, parser changes, applicability changes or result-model redesign should be necessary. Add one focused batch test file and extend the existing Type/Tema and code-list parser cases; update exact-universe assertions in existing tests in one sweep. Source-map entries may be added if that map is being maintained as the executable audit ledger; do not rewrite its historical deferred decisions as if they were old implementations.

Test strategy: independent field→rule and source-value literals; reuse a test-owned integer case matrix across all eight fields; real GMI parser probes for padding, leading zeros and parser-coerced decimals; absent/missing/structural uncertainty; unsafe numbers without lexemes; both list vocabularies in full; invalid/missing/conflicting Tema independence; direct/case-only/ambiguous binding; both geometry views, same completed result reuse, ObjectRef/layer/revision ownership, Field Info and Fildata. Add exact padded Type/Tema/list regressions on real parser output and direct/fallback conflict cases. Keep unrelated attributes and customer values out of snapshots/telemetry. Existing Bredde forbidden aliases and direct Lengde behavior remain regression guards.

One **Luna Medium** implementation pass is appropriate. One **Sol Medium** review is sufficient, with particular attention to lexical agreement and result/Fildata consistency. No separate architecture approval pass is needed for this concrete evidence correction. Review any actual defect remediation with targeted checks only.

### Batch 2 — Complete remaining decimal/date/text format contracts

Add four point-only rules: `innmaling.point.bottom-distance.decimal` (`innerBottomToOuterUndersideDistance`), `innmaling.point.installation-year.format`, `innmaling.point.capture-date.format`, `innmaling.point.note.max-length`. Follow section 4's contracts; do not silently turn date format into calendar/domain validation.

Use explicit small evaluator kinds for decimal format, year format, date format and text maximum length, all under VALUE_FORMAT unless an existing category's actual semantics warrant otherwise. Share only the evidence/missing-state mechanics and runner/Fildata evaluator functions. Do not create a general schema/regex language, arbitrary registry callbacks or dependency engine for four contracts. Reason codes distinguish decimal-format failure, unresolved decimal notation, invalid year/date format, missing lexical-format evidence and exceeded text length; pin the chosen strings independently in tests. Do not relabel a notation uncertainty as VALUE_NOT_ALLOWED or source range failure.

Likely files: `contracts.js`, `registry/rules.js` and its invariants, `ruleEvaluation.js`, `validationRunner.js`, `fieldData.js`, `index.js`, Field Info registry/data, one focused scalar-format test file and exact-universe regression assertions. No parser, binding, topology or production configuration changes.

Tests: independent literal contracts; whole-string matching; year width and unpadded numeric fallback; exact date separators/width, leap-day and invalid-calendar examples proving the declared **format-only** boundary; no clock/locale dependency; decimal dot/comma/sign/zero/leading-zero and unresolved alternative notations; huge lexical numbers without numeric conversion; typed runtime evidence uncertainty; note boundaries 254/255/256 code points including astral characters and combining sequences; original whitespace and parser-coerced all-digit notes; the existing missing/ambiguous/geometry/ownership/result/Fildata matrix. Test the count oracles literally, not by constructing expectations from production rule arrays.

One **Luna Medium** pass and one **Sol Medium** review are appropriate after the Batch 2 technical conventions are accepted as part of its implementation request. Source conflicts in requiredness do not block it. No need for four additional field-specific plans. If a different date or text convention is desired, resolve it as one bounded policy decision, not as a representation project.

## 8. Expected registry and result-count changes

| Checkpoint | New active rules | Active RuleResults/run | Point rule rows | Line rule rows |
|---|---:|---:|---:|---:|
| Current | — | 31 | 24 | 21 |
| Batch 1 lexical corrections alone | 0 | 31 | 24 | 21 |
| Batch 1 complete | +10 | 41 | 34 | 21 |
| Batch 2 complete | +4 | 45 | 38 | 21 |
| Metadata/evidence foundation alone afterward | 0 | 45 | 38 | 21 |

All new rules are point-only. For P point objects, Batch 1 adds 10P per-object outcomes and Batch 2 adds 4P, not necessarily that many findings. The runner retains a RuleResult for each active rule even when P=0; geometry views select rules by scope. Applicability cells never contribute active rows.

This deliberately leaves common supplied formats/lists on lines for later line completion. A future common P+L scope promotion must be explicit and recalculate line counts; do not accidentally dispatch point Tykkelse's integer contract to decimal line Tykkelse. Counts do not claim that 38 point rows represent 38 distinct fields or complete all semantic obligations.

## 9. Phase-completion criterion

Say **“Point supplied-value validation phase is sufficiently complete”** when:

1. Both batches are implemented and independently reviewed against the pinned source/technical contracts: 14 new rules, 45/38/21 counts.
2. Real parser lexemes drive existing and new exact code validation, Tema agreement, relationship prerequisites and Fildata consistently; the reproduced padded-code acceptance is closed.
3. Every one of the 33 point concepts is either value-covered within the stated scope, explicitly retired/metadata-only, or has a named blocked semantic requirement and exact unblock evidence.
4. Field Info distinguishes lexical/numeric/list verification from applicability, requiredness, representation and measured correctness. Decimal notation uncertainties and the format-only date limit are visible.
5. Targeted implementation checks and the agreed full checkpoint tests/build pass, with no ownership/isolation/privacy regression and no runtime applicability consumer.

This is a bounded completion criterion. It does not mean that dates are proven calendar-valid, measurements physically correct, fields applicable, required representations complete or the delivery compliant with all v3.2 procedures. Do not keep adding speculative UUID, name, positive-dimension, plausible-year or generic geometry rules to postpone the phase boundary.

## 10. Next architecture phase and order

Start with **conditional point requirements and their evidence contracts**, then implement only consumers whose prerequisites are real. Reuse the existing point-representation plan; this report changes its sequencing so safe supplied values finish first.

1. **Domain decisions and requirement model.** Resolve the two height requirement statements, exact field/object scope, length conditions, and acceptance of project applicability as a product-policy input. Define applicability separately from requiredness, including UNKNOWN and explicit NOT_APPLICABLE. Preserve KMR/SUMP UNKNOWN for the four current reviewed fields. Do not implement an unused generic consumer first.
2. **First bounded conditional consumer plus needed shape/construction evidence.** Use existing exact lists and only positively sourced partial classifications. Bundle a minimal requiredness consumer with a genuinely unblocked requirement. Non-polygon requirements can progress here; fields lacking decisions remain deferred. Policy provenance must not be presented as STANDARD.
3. **Delivery/GML/ownership foundation.** Before polygon-dependent consumers, define source-file identity, companion delivery/revision, exact GUID/reference relations, expected cardinality/conflict and completeness. Pin the actual GML profile: M27–29 describes distinct Norwegian Water/LAGS paths; “supports GML” is insufficient. Preserve geometry/profile roles and uncertainty. Parser-local IDs, equal coordinates and closed lines establish no ownership.
4. **Representation-aware requiredness.** Only with qualifying owned polygons and completeness, implement dimension substitution and resolved height conditions. Missing companion data remains unknown unless the delivery contract establishes completeness. Shape alone cannot prove a required polygon was delivered.
5. **Typed observation/relationship and topology validation.** Extend the evidence foundation for lid/pit/TOP roles, own-pipe stikkledning endpoints, point↔line references, measured/derived heights, and authorized equations/tolerances. Keep proximity/containment/nearest-object heuristics prohibited. Hydraulic classification requires its own explicit authority before pressure/gravity consumers.

An applicability consumer does not require GML for every rule; a polygon-conditioned requirement always does. This dependency-based order avoids both premature GML work for simple conditions and premature absence failures for incomplete deliveries.

## 11. Architecture proportionality and current-rule sanity review

### Concrete concern: exact-code policy is not implemented end to end

Evidence locations at reviewed HEAD:

- `src/lib/parsing/gmiParser.js:126` onward preserves source lexemes and then trims/converts attribute values.
- `src/lib/validation-v2/ruleEvaluation.js:76` (`evaluateAllowedValue`) compares `value.sourceValue`, ignoring `sourceLexeme`; required-list evaluation already has a lexeme-first helper.
- `src/lib/validation-v2/temaIdentity.js:128` (`observeCandidate`) records parsed values without lexical evidence; later agreement and resolution compare those values.
- `src/lib/validation-v2/ruleEvaluation.js` Tema list and relationship prerequisite paths consequently consume the already-trimmed identity/Type values.
- `tests/validationV2GmiV32PointCodeLists.test.mjs` tests padded synthetic attribute strings, which remain padded; those cases do not exercise the parser's trimming boundary.

Read-only reproduction (no test file added): a synthetic GMI point with `_FIELDNAMES Tema;Type;Kumform;Byggemetode;Kjegle` and `_FIELDVALUES  KUM ; KSTA ; R ; B ; U ` parses without errors. Attributes become `KUM`, `KSTA`, `R`, `B`, `U`. The five code rules each return passCount=1/failCount=0, and Type↔Tema also passes. The expected exact-policy outcome is code failure, with compatibility not evaluated after failed prerequisites. The same optional evaluator serves Fildata. This is one shared evidence defect, not five missing validation rules.

Correcting Tema must preserve direct-preferred/fallback/conflict behavior and give Fildata the same owned lexical decision. Do not special-case a field lookup in a new evaluator, normalize the source or change parser values globally. Keep structural uncertainty and absence separate from malformed supplied code.

### Other sanity conclusions

No further concrete duplicate concept, hidden requiredness or accidental applicability consumption was established in this high-level inspection. Applicability references in runtime-library searches were its own registry and public export, not active evaluator consumption. INTEGER_FORMAT is shared with Fildata and keeps missing values optional; point Tykkelse's required-only rule is distinct from integer format yet to be added. Type list validation and Type↔Tema compatibility are distinct checks; prerequisite failures suppress an unjustified secondary compatibility finding. Registry evaluator/category pairings are explicit and validated.

The broad “all point objects” presence wording for existing required fields is established baseline scope, while three construction lists intentionally postpone requiredness. This asymmetry is documented policy debt, not evidence that applicability metadata is secretly used. Revisit it in the conditional-requirement phase with actual domain decisions, not an incidental scalar refactor.

Source labels for code failures must retain the already-approved qualification: a STANDARD list plus a product strict-automation policy does not prove that every unlisted explanatory value violates M25. Batch descriptions/Field Info must say manual validation is needed. No new source-claim defect beyond the demonstrated lexical mismatch is asserted here.

### Answers to proportionality questions

| Question | Assessment and recommendation |
|---|---|
| Are small rules over-engineered? | The recent one/few-field planning cadence is too expensive once the evaluator/source distinction is settled. Explicit per-field metadata and independent outcomes remain useful. Batch repeated rule declarations, fixtures, documentation and count updates. |
| Which abstractions earn their complexity? | Canonical binding prevents dangerous aliases; ObjectRefs and revision ownership prevent wrong-object findings; lexical evidence prevents parser coercion from redefining validity; explicit selected-layer input prevents mixed datasets; a shared completed result prevents tab-dependent reruns; the registry/result model gives stable ownership and count semantics; shared evaluators keep Fildata aligned. Preserve all. |
| What stays explicit? | Field IDs, geometry scopes, code sets, source pages/provenance, evaluator/category pairs, optional vs required behavior, Tema conflict resolution and any future positive applicability/classification mapping. Never generate negative policy complements. |
| Is plan→Luna→Sol still proportionate? | Yes per substantial contract batch, no per individual Heltall/list field. This report is the plan for both batches. One implementation report and one independent review per batch suffice; targeted closure for concrete findings. |
| What should be batched later? | Remaining line scalar formats/lists after their source distinctions are resolved; table/list revisions from one source release; metadata refreshes; exact-binding cases; tests/count updates associated with the same behavior. |
| What needs separate source-first planning? | Conflicting requirements, first runtime applicability consumer, GML profiles/delivery completeness, ownership/cardinality, topology/provenance and hydraulic classification. These introduce new authority/evidence rather than another constant. |
| Safe simplifications now? | Reuse the existing exact comparison primitive to close the demonstrated gap; share evaluator functions across runner/Fildata; use test-owned case tables; perform one batch count update; stop redundant whole-repo audits. No schema DSL, policy engine, cache redesign, global deepFreeze cleanup or result-model rewrite. |
| Test independence? | Production metadata may feed runtime Field Info. Expected code sets, field/rule mappings, new reason strings, grammar cases and totals in tests must be test-owned literals. Deriving them from production arrays would erase independent verification. |

Source maps, canonical binding metadata, active rules and Field Info serve different consumers. Some facts repeat, but replacing them all with one generated source of truth would risk circular tests and mixing source/automation status. No such consolidation is justified by this review.

## 12. Recommended model/workflow per batch

| Work | Implementation/review recommendation | Checkpoint discipline |
|---|---|---|
| Batch 1, ten existing-evaluator rules + exact-code correction | One Luna Medium pass, one Sol Medium review | Targeted parser/evaluator/ownership/UI-workflow tests during work; full agreed repository suite/build once at implementation checkpoint, not repeatedly after declaration edits. Review uses targeted evidence. |
| Batch 2, four scalar contracts | One Luna Medium pass, one Sol Medium review | Freeze section 4 conventions together; targeted format/Fildata tests; one full agreed checkpoint. No extra source report per field. |
| First conditional requirement consumer | Sol Medium source/architecture plan; Luna Medium implementation; Sol Medium review | Requires explicit domain decisions and unknown-state semantics. |
| GML delivery/ownership/provenance foundation | Separate source/profile plan and bounded implementation/review | Complexity depends on the real profile, so do not promise one Medium pass before that contract exists. User selects any higher model if needed. |
| Security/privacy/release review | Sol High only when explicitly selected | Separate from scalar implementation; no production action without explicit approval. |

This review does not switch models, delegate or authorize future writes. The user selects the model and initiates each implementation/review request.

## 13. Explicit non-goals

No production code or tests are implemented by this report. No commit, push, merge, deploy, database work, production configuration change, full test suite or build is performed in this review.

Future supplied-value batches exclude runtime applicability, new requiredness, polygon parsing/ownership/completeness, shape/construction consumers, topology, hydraulic inference, geometry-derived length, arbitrary height arithmetic, attachment dereferencing, catalogue lookup, aliases, telemetry, customer-data inspection, UI redesign and production release operations. Existing source conflicts remain recorded.

## 14. Exact next Luna Medium implementation brief

> Work directly in `C:\GitHub\gmi-validering` using the user-selected Luna Medium; no delegation. Implement **Batch 1 of `docs/agent-reports/20260906-validator-v2-v32-point-field-roadmap-astra.md`** as one pass.
>
> Verify branch/HEAD/status against the implementation request. This report was reviewed at `feature/validator-v2-v32-baseline`, `18834c0`; preserve the report and any explicitly authorized documentation changes. Stop on unexpected changes. Do not commit/push/merge/deploy or modify production configuration/database.
>
> Add exactly the ten point-only rules listed in section 7: eight integer fields plus Eier and Adkomst. Use existing canonical bindings, INTEGER_FORMAT and ALLOWED_VALUE. Keep existing required-presence rules. Integer behavior must match Bredde/Lengde, including signed/zero/leading-zero acceptance and unsafe-number uncertainty. No ranges, fixed NOBB lengths, requiredness, applicability or derived values.
>
> Fix the concrete lexeme gap in the same batch. Optional exact lists must compare preserved source lexemes first. Carry exact owned lexical evidence through Tema agreement/validation and its Fildata representation, preserving direct Tema preference, S_FCODE fallback, structural ambiguity and disagreement→CONFLICT. No parser normalization changes. If either Type/Tema code fails, compatibility is NOT_EVALUATED. Shared line Tema receives the same correctness fix; no new line rules.
>
> Source lists: Eier = `AN,F,I,K,K1,K2,L,P,P1,S,S1,S2,S3` (A8–9), Adkomst = `DO,NG,NT,ST,UTENST` (A15). Missing optional values are NOT_EVALUATED; other nonempty values outside current lists fail automated verification with the existing manual-validation qualification. Source formats: four common cm integers A6; point wall/external height mm integers A9; two point NOBB integers A10.
>
> Update source-cited Field Info and Fildata consistently, add missing active-field entries, preserve source-requiredness qualifications and record technical grammar separately. Keep result tabs on the same completed result; no UI redesign. Do not implement Batch 2 or any blocked architecture.
>
> Use independent literal oracles and a test-owned shared case matrix. Include real-parser padded Tema/Type/Kumform/Byggemetode/Kjegle regressions, direct/fallback lexical disagreement, exact and no-lexeme controls, relationship prerequisite suppression, original numeric lexemes, missing/ambiguous evidence, geometry/layer/revision/ObjectRef isolation, no applicability consumption, Field Info and Fildata. Keep tests independent of production lists and literal reason-code contracts pinned.
>
> Expected result: **41 active rules / 34 point rows / 21 line rows**, with 88/71/9/8 applicability cells unchanged at revision 2026-09-04.3 and no active consumer. The lexical correction adds zero rules.
>
> Run targeted tests while implementing, then the repository's agreed complete suite/build once at the requested implementation checkpoint. Run `git diff --check` and `git status --short`. Report changed behavior/files, test evidence, exact counts and limitations in one implementation report. Leave code ready for one Sol Medium review; no commit or push.

## 15. Open decisions requiring domain-owner input

No new domain decision is needed for Batch 1's integer/list checks or the documented lexical defect. M25 strict automated closure was already explicitly decided.

Before Batch 2, accept or revise **together** the conservative decimal-notation outcomes, year fallback, format-only date boundary and Unicode code-point length policy in section 4. If calendar-valid dates are desired now, explicitly choose calendar/year-zero behavior and include it in that batch's bounded contract; do not pretend A6 spells out that implementation policy.

Before conditional requirements, obtain the Utvendig_høyde precedence decision; the Avst_BunnInnvUnderUtv scope decision; exact point/shape/construction requirement policies (including Lengde); unknown handling; KMR/SUMP and other unresolved cells only where an explicit decision is available; and a decision on using project applicability for active product-policy rules. APPLICABLE must still never imply REQUIRED automatically.

Before geometry/relationship validation, select the GML profile and delivery completeness contract, identifier ownership/cardinality and duplicate handling, source-application/attachment evidence, AnleggsID/SID numbering policy, accuracy override contract, maximum-deviation acceptance semantics, hydraulic evidence and observation/topology roles/equations/tolerances.

### Review verification

Performed: exact Git checkpoint commands; targeted source/code/test-source inspection; PDF hash verification; read-only registry/applicability count imports; one synthetic real-GMI lexical reproduction. No tests were authored or changed and no suite/build was run. `git diff --check` passed; a separate `git diff --no-index --check -- NUL <report>` also passed to cover the new untracked report (only the expected LF→CRLF warning). `git status --short` showed only this requested report as untracked. Local reference PDFs remain untracked and unmodified.

NEXT:
Complete all eight remaining supplied integer fields and both exact code lists, with the existing code/Tema lexical-evidence correction, in one Luna Medium batch (+10 rules).

THEN:
Complete decimal distance, year/date lexical formats and Merknad length in one scalar-format batch (+4 rules), using the explicitly bounded technical policies above.

STOP POINT-VALUE PHASE WHEN:
Both batches and the lexical regression are independently reviewed, 45/38/21 counts and existing isolation contracts are verified, and all residual semantic work is explicitly blocked or metadata-only.

AFTER THAT:
Resolve conditional-requirement policy and implement its minimal evidence/consumer path; add authoritative GML delivery and polygon ownership before representation-dependent requirements, then typed observation/topology validation.
