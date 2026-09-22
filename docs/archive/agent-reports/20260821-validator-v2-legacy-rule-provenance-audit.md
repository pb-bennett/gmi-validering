# Validator 2.0 legacy-rule provenance audit

- Date: 2026-08-21
- Branch: `research/validator-v2-legacy-rule-provenance`
- Scope: research and documentation only

## 1. Executive summary

This audit inventories 33 legacy behaviours that are not directly established, or are only partly established, by the two bundled Innmålingsinstruks PDFs. Absence from those PDFs is not treated as evidence that a behaviour is useless. The inventory instead separates practical delivery knowledge, format adaptation, technical diagnostics, UI policy, likely defects, and unresolved provenance.

The strongest recovered provenance is:

- **SOURCE-AUDIT FACT:** the prior source map already accounts for all 46 effective legacy field concepts, 23 allowed-value sets, and 14 cross-field/geometry/dataset concepts. This report does not reopen that source analysis.
- **GIT EVIDENCE:** the original rules and `_punkt`/`_led` keys were imported on 2025-12-25 as a database export. Repository history before that export is unavailable.
- **GIT EVIDENCE:** a dedicated analysis of 51 Færder Kommune GMI files preceded the active field validator. The Type subset has a particularly direct trail from measured prevalence to code. The Bredde, Byggemetode, Kumform, and Kjegle subsets were added beside the same analysis, but the precise inclusion boundaries were not documented.
- **GIT EVIDENCE:** SOSI and KOF mappings were introduced to normalize heterogeneous formats for visualization and reuse. They were not documented as authoritative mappings to Innmålingsinstruks Tema codes.
- **GIT EVIDENCE:** missing/non-finite Z was normalized to `0` before the Z validator began rejecting `0`. The product request required height data, but did not say that a real elevation of zero is invalid. The zero rule is most plausibly a technical sentinel that leaked into policy.
- **GIT EVIDENCE:** universal numeric equivalence was added specifically to repair SDR comparison (`11` versus `11.0`). Applying `parseFloat` to every value set is a generalization beyond that intent.
- **GIT EVIDENCE:** the unexpected-value path was explicitly provisional: the introducing change asks whether such objects should count as failing and says to include them “for now.”

Primary classification counts are 12 PRAKSIS, 5 FORMAT_ADAPTER, 3 TEKNISK, 3 UI_POLICY, 9 IMPLEMENTATION_DEFECT, and 1 UNKNOWN. No behaviour is assigned primary KOMMUNE status because the repository does not prove municipal authorization, although several Færder-derived candidates may belong in a municipality profile.

The most important V2 conclusion is to preserve intent, evidence, and provenance independently. Practical rules should not be disguised as STANDARD rules; format adapters must not manufacture compliance evidence; and UI aggregation should not define semantic severity. Twenty-five behaviours require a domain or product-policy decision before faithful migration. Those decisions are consolidated into 12 questions in section 16.

## 2. Methodology and limitations

### Required context reviewed

- `docs/agent-reports/20260820-validation-module-audit-and-plan.md`
- `docs/agent-reports/20260820-innmalingsinstruks-rule-source-mapping.md`
- `docs/validation-v2/innmalingsinstruks-rule-source-map.json`
- both bundled Innmålingsinstruks PDFs, through the completed source audit and targeted verification where needed

The completed source audit is the authority in this report for whether a legacy behaviour is PDF-backed, partially backed, unclear, or not found.

### Code and configuration inspected

- active field validation: `src/lib/validation/fieldValidation.js`
- Z validation and normalization: `src/lib/analysis/zValidation.js`, `src/lib/parsing/normalizeFeature.js`
- field and legacy registries: `src/data/fields.json`, `src/data/rules/points.json`, `src/data/rules/lines.json`
- dormant validator: `src/lib/validation/validator.js`
- GMI, SOSI, and KOF parsers
- incline, top-lid, and terrain/overcover analyses
- validation detail, sidebar, layer, terrain, and incline UI components where they determine status or capability
- `scripts/analyze_gmi_relationships.js`, `scripts/analyze_types.js`, and their generated documentation/data

### Git-history techniques

Relevant lines were traced with `git blame`; introducing commits and parents were inspected with `git show`; file evolution was reviewed with `git log --follow` and historical file content. Repository-wide history and archived product notes were searched for field names, hydraulic terms, Z/height, aliases, SOSI, KOF, validation status, and affected-object navigation.

Key commits are:

| Commit | Date | Provenance significance |
|---|---:|---|
| `d70ec1b` | 2025-12-25 | Imported legacy GMI parser, database-exported field rules, split point/line registries, and initial validator. |
| `28e8246` | 2025-12-26 | Added dedicated Type analysis over 51 Færder GMI files. |
| `6ac4aad` | 2025-12-30 | Added incline analysis. |
| `7cbee015` | 2025-12-30 | Added the active field validator, aliases, hydraulic classifier, unexpected values, and aggregate status logic. |
| `2d2a2685` | 2025-12-31 | Added point applicability subsets, changed several required states, added failing IDs, and introduced numeric SDR normalization. |
| `7842115` / `8729ed7` | 2026-01-01 / 2026-01-03 | Introduced and then made diameter-aware the top-lid proximity check. |
| `5a1744f3` | 2026-01-04 | Added multi-format normalization, SOSI/KOF compatibility mappings, and missing-height normalization. |
| `5cc6b18` / `34bc889` | 2026-01-18 / 2026-01-19 | Introduced 2.0 m overcover, then changed the configurable default to 1.6 m. |
| `56468799` | 2026-01-25 | Added current Z validation and further KOF robustness. |

### Evidence labels used

- **SOURCE-AUDIT FACT:** conclusion already established by the PDF source mapping.
- **GIT EVIDENCE:** commit, blame, historical file, or archived request.
- **CODE EVIDENCE:** current executable behaviour or current comment.
- **INFERENCE:** likely intent derived from the evidence, not a recovered statement of intent.
- **DOMAIN DECISION REQUIRED:** migration cannot safely select policy from repository evidence alone.

### Limitations

- The database and operational discussions that predate `d70ec1b` are not in Git. `fields.json` carries Mongo-style timestamps from 2025-08-20, but not authorship or rationale.
- The analyzed delivery corpus is described as 51 Færder Kommune files and 4,659 features. Those deliveries are not treated as a formal rule source, and this report does not reproduce operational file contents.
- Commit proximity and data prevalence can show likely influence, not municipal approval.
- External standards alluded to by UI or archived notes were not identified precisely enough to become authoritative citations here.
- The two live `_led` failures are observations supplied for this audit, not a full 46-field runtime-resolution census.

## 3. Complete non-source behaviour inventory

Documentation IDs below are stable research identifiers, not executable V2 rule IDs.

| ID | Legacy behaviour | Current location | PDF source status | Git origin | Primary class | Confidence | V2 recommendation |
|---|---|---|---|---|---|---|---|
| LEGACY-PRACTICE-001 | Pressure/gravity classifier heuristics | `fieldValidation.js:62` | Partial distinction; classifier not sourced | `7cbee015` | PRAKSIS | MEDIUM | Preserve need; redesign with evidence and unknown state |
| LEGACY-DEFECT-001 | Unrecognized line defaults to gravity | `fieldValidation.js:112` | Not found | `7cbee015` | IMPLEMENTATION_DEFECT | MEDIUM | Do not carry fallback |
| LEGACY-PRACTICE-002 | Ringstivhet for all classified gravity lines | `fieldValidation.js:162` | Broader than source | `7cbee015` | PRAKSIS | MEDIUM | Separate hydraulic and material conditions |
| LEGACY-PRACTICE-003 | SDR required for classified pressure lines | `fieldValidation.js:166` | Requirement partial; classifier unsourced | `7cbee015`, `2d2a2685` | PRAKSIS | MEDIUM | Preserve after explicit classification |
| LEGACY-PRACTICE-004 | Trykklasse only on classified pressure lines | `fieldValidation.js:170` | Optional pressure applicability partial | `7cbee015` | PRAKSIS | MEDIUM | Preserve applicability; decide non-applicable values separately |
| LEGACY-PRACTICE-005 | Bredde subset | `fieldValidation.js:175` | Exact subset not found | `2d2a2685` | PRAKSIS | MEDIUM | Profile candidate; verify list |
| LEGACY-PRACTICE-006 | Byggemetode subset | `fieldValidation.js:178` | Exact subset not found | `2d2a2685` | PRAKSIS | MEDIUM | Profile candidate; verify list |
| LEGACY-PRACTICE-007 | Kumform subset | `fieldValidation.js:181` | Exact subset not found | `2d2a2685` | PRAKSIS | MEDIUM | Needs domain decision |
| LEGACY-PRACTICE-008 | Kjegle subset | `fieldValidation.js:184` | Exact subset not found | `2d2a2685` | PRAKSIS | MEDIUM | Needs domain decision |
| LEGACY-PRACTICE-009 | Type subset | `fieldValidation.js:187` | Exact subset not found | `28e8246`, `2d2a2685` | PRAKSIS | HIGH | Preserve intent as profile/practice rule |
| LEGACY-UNKNOWN-001 | Supplied non-applicable value becomes unexpected warning | `fieldValidation.js:220` | General prohibition not found | `7cbee015`, `2d2a2685` | UNKNOWN | LOW | Optional diagnostic pending decision |
| LEGACY-FORMAT-001 | Exact/alias/case-insensitive field resolution | `fieldValidation.js:3,35` | Not a source rule | `7cbee015` | FORMAT_ADAPTER | HIGH | Explicit format-scoped alias table |
| LEGACY-DEFECT-002 | `_punkt`/`_led` logical key used as source lookup | `fields.json`, resolver | Contradicts source identity | `d70ec1b` | IMPLEMENTATION_DEFECT | HIGH | Separate canonical field and applicability |
| LEGACY-DEFECT-003 | Risky or inert aliases | `fieldValidation.js:3` | Not found | `7cbee015` | IMPLEMENTATION_DEFECT | MEDIUM | Verify each; reject collisions |
| LEGACY-FORMAT-002 | SOSI object-name to GMI-like S_FCODE | `sosiParser.js:133` | No authoritative crosswalk found | `5a1744f3` | FORMAT_ADAPTER | HIGH | Adapter metadata, not compliance evidence |
| LEGACY-FORMAT-003 | SOSI fallback codes and polygon-as-line model | `sosiParser.js` | Not a source rule | `5a1744f3` | FORMAT_ADAPTER | HIGH | Preserve display fallback separately |
| LEGACY-FORMAT-004 | KOF code/name/section to S_FCODE | `kofParser.js` | No authoritative crosswalk found | `5a1744f3`, `56468799` | FORMAT_ADAPTER | HIGH | Format metadata only |
| LEGACY-UI-001 | Field validation disabled for KOF | sidebar/layer UI | Not a source rule | Jan. multi-format work | UI_POLICY | HIGH | Express as format capabilities |
| LEGACY-FORMAT-005 | Numeric-looking GMI text coerced to numbers | `gmiParser.js:122` | Not a source rule | `d70ec1b` | FORMAT_ADAPTER | HIGH | Type-directed parsing; retain lexical value |
| LEGACY-TECH-001 | Trim before allowed-value comparison | `fieldValidation.js:117` | General normalization not found | `2d2a2685` | TEKNISK | HIGH | Explicit field/format normalization |
| LEGACY-DEFECT-004 | Universal `parseFloat` equivalence | `fieldValidation.js:117` | Not found | `2d2a2685` | IMPLEMENTATION_DEFECT | HIGH | Restrict to typed numeric fields |
| LEGACY-DEFECT-005 | Comparator comment/UI disagree with engine | validator/detail modal | Not a source rule | Drift after `2d2a2685` | IMPLEMENTATION_DEFECT | HIGH | Render evaluator issues; no duplicate logic |
| LEGACY-UI-002 | Prevalence determines error/warning | `fieldValidation.js:235` | Not a source rule | `7cbee015` | UI_POLICY | HIGH | Separate severity and completeness |
| LEGACY-DEFECT-006 | Required-state gaps and optional invalid green status | validator/detail modal | Not found | `d70ec1b`, `7cbee015` | IMPLEMENTATION_DEFECT | HIGH | Define independent rule semantics |
| LEGACY-TECH-002 | Synthetic array indices as failing IDs | validator/detail modal | Not a source rule | `2d2a2685` | TEKNISK | HIGH | Stable layer-scoped identity |
| LEGACY-UI-003 | Common point/line aggregation | validator/detail modal | Not a source rule | `d70ec1b`, `7cbee015` | UI_POLICY | MEDIUM | Reporting concern only |
| LEGACY-TECH-003 | Z=0 treated as invalid/missing | `zValidation.js`, normalizer | Zero-specific rule not found | `5a1744f3`, `56468799` | TEKNISK | HIGH | Preserve missing Z; distinguish real zero |
| LEGACY-PRACTICE-010 | Incline classifier and thresholds | `incline.js` | Not found in PDFs | `6ac4aad`, archived request | PRAKSIS | HIGH | Optional/profile rule with source citation |
| LEGACY-PRACTICE-011 | Topplokk pairing and tolerance | `topplok.js` | Concept partial; list/tolerance not found | `7842115`, `8729ed7` | PRAKSIS | HIGH | Preserve intent; redesign pairing |
| LEGACY-PRACTICE-012 | 1.6 m minimum overcover | `terrain.js` | Not found | `5cc6b18`, `34bc889` | PRAKSIS | MEDIUM | Configurable profile rule only |
| LEGACY-DEFECT-007 | Dormant and active rule registries drift | rule JSON, both validators | Not a source rule | `d70ec1b`, `7cbee015` | IMPLEMENTATION_DEFECT | HIGH | One canonical inventory |
| LEGACY-DEFECT-008 | AnleggsID conditional without predicate | `fields.json`, active validator | Source condition partial; execution missing | `d70ec1b` | IMPLEMENTATION_DEFECT | HIGH | Defer until condition resolved |
| LEGACY-DEFECT-009 | Whitespace-only free text counts as present | `fieldValidation.js:199` | Not a source rule | `7cbee015` | IMPLEMENTATION_DEFECT | HIGH | Type-aware empty semantics |

Every table ID has exactly one companion record in `legacy-rule-provenance-map.json`.

## 4. Provenance baseline: where the legacy rules entered Git

### 4.1 Database export and split schemas

**GIT EVIDENCE:** `d70ec1b` describes `fields.json` as the complete validation rules exported from a previous database. Archived implementation instructions say point and line schemas were separated to avoid name collisions. The imported field records already used keys such as `Tema_punkt`, `Tema_led`, `InnvendigUtvendig_punkt`, `InnvendigUtvendig_led`, `NOBB-VAVVS-nr_punkt`, and `NOBB-VAVVS-nr_led`.

**INFERENCE:** suffixes were database/logical-identity devices. They were not meant to assert that the source delivery contains an attribute literally named with `_led` or `_punkt`.

**SOURCE-AUDIT FACT:** the PDF source names do not contain those suffixes.

**RISK:** the active resolver begins with the logical `fieldKey`. Unless an alias exists, it looks for a non-existent suffixed source field. The 2026-08-21 observations for populated `NOBB-VAVVS-nr` and `InnvendigUtvendig` line fields are exactly consistent with that failure mode.

This is recorded as `LEGACY-DEFECT-002`. It is not the promised full 46-field resolution census.

### 4.2 Real-delivery analysis before active validation

**GIT EVIDENCE:** `GMI_ANALYSIS.md` states that 51 Færder Kommune GMI files containing 4,659 features were analyzed. `scripts/analyze_gmi_relationships.js` specifically measures relationships among S_FCODE and Bredde, Kjegle, Adkomst, Byggemetode, Kumform, and Type. `28e8246` added an additional Type-focused analysis.

The analysis is strong evidence of likely product intent: rules were being tuned to actual contractor deliveries. It is not evidence that every observed pattern is a universal STANDARD requirement or formally adopted Færder policy.

## 5. Pressure/gravity classification

### 5.1 Current decision tree

`LEGACY-PRACTICE-001` covers the overall classifier; `LEGACY-DEFECT-001` isolates its unsafe final fallback.

| Order | Current test | Result | Provenance assessment |
|---:|---|---|---|
| 1 | Tema/S_FCODE contains `VL` or `VANN` | pressure | Plausible water-network PRAKSIS; no authoritative code-list citation found |
| 2 | `Nett_type` contains `TRYKK` | pressure | Plausible direct text signal; exact vocabulary/provenance unknown |
| 3 | Tema contains `TR`, except `TRASÉ` | pressure | Comment cites examples such as SPTR/AFTR; broad substring is technically unsafe |
| 4 | Material contains `STÅL`, `MST`, or `SJK` | pressure | Practical material inference; pressure is not logically guaranteed by material alone |
| 5 | SDR or Trykklasse has a value | pressure | Useful evidence but circular when those same fields are validated by the result |
| 6 | No test matches | gravity | No source or Git rationale; unknown is collapsed to gravity |

**CODE EVIDENCE:** a comment says generic PE material inference was removed because PE is used for both pressure and gravity. This is evidence that the classifier was intentionally refined from practical knowledge, not simply copied from a standard.

**SOURCE-AUDIT FACT:** the PDFs distinguish self-fall and pressure applicability, but do not supply this decision tree, do not authorize default-to-gravity, and do not establish the pressure/gravity object-code lists used here.

**INFERENCE:** the classifier was added so conditional checks could operate on inconsistent legacy files without a canonical hydraulic-class property.

**Risks:** substring collisions; conflict between signals; circular inference; material overreach; loss of unknown; and inferred values being mistaken for delivered facts.

**V2 recommendation:** classification should return `{class, confidence, evidence[]}` and support `unknown` and `conflict`. Source-delivered evidence must be distinguishable from adapter inference. Municipality/practice profiles may add code mappings, but must not silently modify STANDARD rules.

### 5.2 Ringstivhet, SDR, and Trykklasse

- `LEGACY-PRACTICE-002`: **SOURCE-AUDIT FACT:** Ringstivhet is required for self-fall plastic pipe. Legacy code applies it to every line classified gravity, omitting the plastic condition. This looks like a simplifying proxy, but history provides no approval for the broader scope.
- `LEGACY-PRACTICE-003`: **SOURCE-AUDIT FACT:** SDR has pressure-pipe applicability. The current rule is directionally aligned, but depends on the unsourced classifier. `2d2a2685` proves that SDR comparison was actively repaired, supporting intentional practical value.
- `LEGACY-PRACTICE-004`: **SOURCE-AUDIT FACT:** Trykklasse is optional for pressure pipe. Legacy code applies comparison only to classified pressure objects and treats supplied values elsewhere as unexpected. The first part is plausible; the prohibition is not sourced.

**DOMAIN DECISION REQUIRED:** identify the authoritative hydraulic-class signals, whether material can be used as evidence, and how unknown/conflicting classifications affect each rule.

## 6. Hardcoded point object-code subsets

### 6.1 Evidence from Færder files

The following figures are aggregate percentages already stored in repository analysis documentation; no delivery filenames or object data are reproduced.

| S_FCODE | Count | Bredde | Kjegle | Byggemetode | Kumform |
|---|---:|---:|---:|---:|---:|
| KUM | 389 | 63.8% | 57.8% | 57.8% | 59.1% |
| LOK | 292 | 100% | 8.6% | 27.7% | 16.4% |
| SAN | 30 | 100% | 73.3% | 100% | 100% |
| SLS | 16 | 93.8% | 93.8% | 93.8% | 75% |
| SLU | 33 | 69.7% | 63.6% | 100% | 69.7% |
| STR | 22 | 100% | — | — | 100% |

The current Bredde and Byggemetode lists are KUM/LOK/SAN/SLS/SLU. Kumform and Kjegle omit LOK. The data shows why those fields attracted attention, but it does not yield the current boundaries mechanically: STR had Bredde and Kumform on all analyzed objects yet is excluded; other codes also had occasional values.

### 6.2 Bredde (`LEGACY-PRACTICE-005`)

**GIT EVIDENCE:** added in `2d2a2685` immediately after the relationship analysis.

**LIKELY INTENT:** warn about incomplete width/diameter-related point data only on common relevant structures.

**UNCERTAINTY:** source semantics of Bredde must not be conflated with line dimension aliases; exact list and municipal authority are unrecorded.

**RECOMMENDATION:** municipality-profile or PRAKSIS rule after owner confirmation.

### 6.3 Byggemetode (`LEGACY-PRACTICE-006`)

**GIT EVIDENCE:** same introducing commit and corpus.

**LIKELY INTENT:** target completion review to the object types commonly carrying construction method in practical exports.

**UNCERTAINTY:** other codes, including KRN, carried the value in the corpus; no reason for exclusion is stored.

**RECOMMENDATION:** profile-configurable advisory rule until applicability is confirmed.

### 6.4 Kumform (`LEGACY-PRACTICE-007`)

**GIT EVIDENCE:** `2d2a2685` changed the field from `always` to `conditional` and added KUM/SAN/SLS/SLU.

**LIKELY INTENT:** stop false positives on point objects for which a chamber shape was not considered meaningful.

**UNCERTAINTY:** LOK and STR occurrences show that presence and required applicability are different questions.

**RECOMMENDATION:** do not universalize; ask whether the subset represents Gemini practice or Færder policy.

### 6.5 Kjegle (`LEGACY-PRACTICE-008`)

**GIT EVIDENCE:** same state change and object subset in `2d2a2685`.

**LIKELY INTENT:** restrict cone information to structure types where it is useful.

**UNCERTAINTY:** no comment or commit message establishes required-versus-advisory semantics.

**RECOMMENDATION:** practice/profile candidate after domain review.

### 6.6 Type (`LEGACY-PRACTICE-009`)

This has the strongest provenance of the point subsets.

**GIT EVIDENCE:** `28e8246` created `type_analysis.json` from 51 Færder files. It classified FORAKONSTR and GRØKONSTR as `requireType` and DIV as `shouldHaveType`. Counts showed Type on 100% of 29 FORAKONSTR objects, 100% of 48 GRØKONSTR objects, and 34.8% of 1,624 DIV objects. `2d2a2685` then placed all three in one executable applicability list.

**INFERENCE:** the rule intentionally encodes real-delivery practice. However, legacy execution erased the analysis distinction between required and should-have. The spelling `FORAKONSTR` also differs from the PDF-source `FORAKONST`; it is demonstrably a legacy-delivery token, not safe evidence of canonical terminology.

**RECOMMENDATION:** preserve as a strong PRAKSIS or Færder-profile candidate, with separate severity/expectation for DIV and an explicit alias/crosswalk for legacy object tokens.

## 7. Supplied values outside applicability

`LEGACY-UNKNOWN-001` counts any supplied value on an object for which a condition returns false as `unexpected`, raises a warning, and adds the feature to failing IDs.

**SOURCE-AUDIT FACT:** no general rule was found saying non-applicable implies forbidden.

**GIT EVIDENCE:** `2d2a2685` contains an unusually clear uncertainty marker: unexpected values are “also considered failing in a sense,” asks whether only missing/invalid should be included, and concludes “include them for now” so users can see them.

**INFERENCE:** this was a review aid, not a settled business rule.

**RECOMMENDATION:** V2 should distinguish:

1. not required but allowed;
2. not normally expected, diagnostic only;
3. explicitly forbidden by a named source/profile.

Only the third is a validation failure. The legacy behaviour may survive as an optional PRAKSIS diagnostic after field-by-field review.

## 8. Field identity and aliases

### 8.1 Resolver design (`LEGACY-FORMAT-001`)

The active resolver tries the requested key, configured aliases, and then a generic case-insensitive property-name match. Aliases include:

- logical Tema keys to `S_FCODE`, `Tema`, `TEMA`, and `FCODE`;
- common names/abbreviations such as `HREF`, `METODE`, `PN`, `SN`, `NETTTYPE`, and material variants;
- broader semantic candidates such as `DIMENSJON`/`DIM` for Bredde.

**GIT EVIDENCE:** all were introduced by `7cbee015` under the general explanation that source data may use different names. There is no per-alias citation.

**RECOMMENDATION:** explicit aliases remain valuable, but each needs format, direction, canonical target, provenance, and ambiguity constraints. A generic case-insensitive fallback can be a low-level convenience only when the match is unique.

### 8.2 Suffix identity failure (`LEGACY-DEFECT-002`)

The imported logical suffixes solved registry collisions but were later used as delivered-property names. Only Tema received suffix-aware aliases. This explains why `NOBB-VAVVS-nr_led` and `InnvendigUtvendig_led` can report zero populated objects when the unsuffixed delivered fields are visible.

**RECOMMENDATION:** V2 rule records need separate properties for canonical source field, layer/geometry applicability, and legacy configuration key. The exhaustive mapping remains a separate task.

### 8.3 Risky aliases (`LEGACY-DEFECT-003`)

- `Nøyaktighet` can resolve through `H_MÅLEMETODE`, whose name suggests measurement method rather than accuracy.
- Bredde can resolve from `DIMENSJON` or `DIM`, risking point-width/line-dimension semantic collision.
- a `Dato` alias group is inert because no active field uses `Dato` as its field key.
- historical analysis code considered `Rørform` as a possible Kumform alias, but the active validator did not adopt it; this shows experimentation, not authority.

These aliases should be verified individually. Their likely goal is compatibility, but intent is too weak to preserve them as semantic truth.

## 9. SOSI and KOF adaptation

### 9.1 SOSI mapping (`LEGACY-FORMAT-002`)

**GIT EVIDENCE:** `5a1744f3` explicitly says SOSI object names are mapped to “GMI-compatible S_FCODE.” The code comment says the value is for styling/filters and prefers a mapping to the app's GMI Tema codes. Archived requirements describe GMI as the primary validation format and SOSI/KOF as normalized for reuse and visualization.

Examples include SPILLVANN→SP, OVERVANN→OV, combined sewer→AF, VANN→VL, and PUMPELEDNING→SPP. Point mappings include KUM→KUM, SLUK→SLU, and several broader fallbacks. Some map to line-like or non-source values.

**INFERENCE:** this is a compatibility crosswalk, not proof that the SOSI object is canonically the inferred GMI Tema.

**RECOMMENDATION:** keep native SOSI object identity, adapter-derived classification, and validation eligibility separate. Every mapping should record its authority and direction.

### 9.2 SOSI fallback and polygons (`LEGACY-FORMAT-003`)

Unknown SOSI objects fall back to the object name or DIV. Polygons are represented as lines with a comment that this keeps visualization simple.

This is useful for display continuity but unsafe for rule applicability. V2 should retain native geometry and `unmapped` identity rather than turn a visualization fallback into validation truth.

### 9.3 KOF mapping (`LEGACY-FORMAT-004`)

The initial KOF parser copied an operation/code token into S_FCODE. Later work expanded this to code, name, section, or synthetic `KOF`/`KOF_LINE` fallbacks because KOF dialects vary.

**GIT EVIDENCE:** archived notes emphasize parsing labels and sections for robustness and visualization. They do not define a KOF→GMI Tema standard.

**RECOMMENDATION:** expose these values as KOF metadata or adapter labels, never as delivered GMI compliance values without a verified project crosswalk.

### 9.4 KOF capability guard (`LEGACY-UI-001`)

The UI prevents ordinary field validation for KOF. Given the documented attribute limitations, the intent is valuable: do not report fields a format cannot carry. V2 should represent validator capability by format and rule, not rely on UI code to suppress an otherwise callable validator. Geometry checks may still be valid for KOF.

## 10. Allowed-value normalization and parser typing

### 10.1 Parser coercion (`LEGACY-FORMAT-005`)

The GMI parser converts integer- and decimal-looking attribute text to JavaScript numbers. This is convenient for measurements but can destroy leading zeroes and lexical code forms.

**GIT EVIDENCE:** the behaviour arrived with the legacy parser in `d70ec1b`; no field-type decision table accompanied it.

**RECOMMENDATION:** parse according to canonical field type, keep the raw lexical value, and report normalization in issue evidence.

### 10.2 Trim (`LEGACY-TECH-001`)

`2d2a2685` trims both actual and allowed values. This probably accommodates export formatting, but the PDFs do not authorize universal whitespace normalization. Retain it only where a format/field contract says surrounding whitespace is insignificant.

### 10.3 Numeric equivalence (`LEGACY-DEFECT-004`)

**GIT EVIDENCE:** numeric comparison was introduced in a commit named “fix SDR validation,” with the specific example `11` versus `11.0`. In the same period, SDR acceptable values were represented numerically despite source lexical forms.

The current helper applies `parseFloat` to every value set and accepts values within `0.0001`. `parseFloat` is prefix-tolerant, so text with trailing junk can be misread as a valid number. It also erases leading-zero distinctions.

**INFERENCE:** the SDR repair was intentional; the universal implementation is an over-generalization.

### 10.4 Comparator and UI drift (`LEGACY-DEFECT-005`)

The engine comment says comparison is case-insensitive, but executable comparison never lowercases. The detail modal independently checks exact `String` equality and therefore does not mirror trimming or numeric equivalence.

V2 should emit canonical issue results once. UI must render those results rather than independently deciding validity.

## 11. Status, severity, presence, and result identity

### 11.1 Prevalence status (`LEGACY-UI-002`)

For `always` fields, all applicable objects missing yields error, while only some missing or any invalid/unexpected values yield warning. This appears designed to prioritize completely absent columns in a summary.

**SOURCE-AUDIT FACT:** the PDFs do not define this severity aggregation.

**RECOMMENDATION:** preserve completeness metrics, but do not let prevalence redefine rule severity. Report object-level issues, field-level counts, and run outcome as separate dimensions.

### 11.2 Required-state gaps (`LEGACY-DEFECT-006`)

Only `always` and `conditional` receive meaningful status branches. `optional`, `optionalAlt`, `geminiOnly`, and `polygonExcluded` are largely metadata. Conditional invalid values and optional invalid values can leave the aggregate status OK even though failing values were counted. The detail UI also collapses non-always states into broad “conditional/optional” wording.

**INFERENCE:** the active validator implemented only a subset of the imported state model. That incompleteness is not a policy to migrate.

### 11.3 Failing feature IDs (`LEGACY-TECH-002`)

**GIT EVIDENCE:** failing IDs were added to support viewing/highlighting affected objects, a need explicitly present in archived product notes. The intent is sound. Falling back to array indices is not stable across reparse, filtering, or multiple layers.

V2 should use layer-scoped internal identities and retain delivered IDs separately.

### 11.4 Common-field aggregation (`LEGACY-UI-003`)

The original schemas were split to avoid point/line collisions; the later view aggregates common logical fields and offers point/line tabs. Since one V2 run validates exactly one selected layer, canonical field identity should no longer be shaped by cross-layer UI grouping.

### 11.5 Whitespace-only presence (`LEGACY-DEFECT-009`)

Presence means non-null, non-undefined, and not exactly `''`. Required free-text fields can therefore pass with spaces alone. Empty semantics should be field-type aware and must preserve legitimate numeric zero and boolean false.

## 12. Z and geometry

### 12.1 Z=0 (`LEGACY-TECH-003`)

**SOURCE-AUDIT FACT:** the PDFs support finite height/Z presence for relevant delivered geometry. They do not state that Z=0 is inherently invalid.

**GIT EVIDENCE:** `5a1744f3` normalized absent or non-finite Z to `0`. `56468799` later added the current validator, which rejects null, undefined, non-finite, and zero. Archived requirements say all relevant objects/line points should have height values, but do not call zero invalid.

**INFERENCE:** zero was used as a sentinel for missing data, and the sentinel subsequently became indistinguishable from a real elevation.

**RECOMMENDATION:** preserve validation of missing/non-finite Z, retain absence as absence, and make a zero-specific rule opt-in only if a domain owner confirms it for the applicable coordinate/height system.

### 12.2 Incline (`LEGACY-PRACTICE-010`)

The incline analysis classifies SP/OV/AF as gravity unless pressure/pump signals are present, excludes water lines, and supports fixed 10‰ and variable 10/4/2‰ thresholds.

**GIT EVIDENCE:** archived 2026-01-17 notes explicitly request the fixed 10‰ default and gravity scope, with the variable model as an alternative. This is strong evidence of deliberate practical intent.

**LIMITATION:** no precise external standard edition or municipality rule is cited in the repository. Preserve as optional/profile policy, not STANDARD, until sourced.

### 12.3 Topplokk pairing (`LEGACY-PRACTICE-011`)

The analysis expects KUM, SLU, SLS, and SAN to have a nearby LOK, and also detects orphan lids. It began with a 1 m XY tolerance and evolved to a dimension-aware tolerance bounded between 0.3 and 5 m.

This represents plausible and valuable delivery QA. The object list, spatial pairing assumption, and tolerance are not directly established by the PDFs. Preserve intent but require an explainable pairing rule and domain-confirmed parameters.

### 12.4 Overcover (`LEGACY-PRACTICE-012`)

Archived product notes requested a 2.0 m minimum. The implementation later changed the configurable default to 1.6 m; the surviving commit message documents the change but not the domain reason.

This is likely municipality/project practice. V2 should support it through profiles and record the applicable policy source. The global default cannot be recovered confidently.

## 13. Other implementation artefacts

### 13.1 Duplicate registries (`LEGACY-DEFECT-007`)

The initial `points.json`/`lines.json` validator and later `fields.json` validator coexist. Active metadata changed without synchronized updates to the dormant registry. These files are useful historical evidence, but must not be treated as two current policy authorities.

### 13.2 AnleggsID (`LEGACY-DEFECT-008`)

The field is marked conditional, but the active condition switch has no AnleggsID predicate. The completed source audit found partial conditional source semantics, not support for applying it generically to all points. V2 should leave it deferred until the actual condition is resolved.

## 14. Likely valuable rules to preserve

The following shortlist contains all 12 primary PRAKSIS records. “Preserve” means preserve the identified intent, not necessarily the current evaluator.

| Behaviour | Candidate V2 role | Why it appears valuable | Required safeguard |
|---|---|---|---|
| Pressure/gravity classification | Configurable rule template / prerequisite service | Conditional source and practice rules need hydraulic class | Explainable evidence, conflict and unknown states |
| Ringstivhet practical scope | Needs owner decision | Attempts to operationalize a real conditional requirement | Restore material condition; separate broader profile override |
| SDR pressure applicability | Default STANDARD rule after classification | Directionally source-backed and actively maintained | No circular self-classification |
| Trykklasse pressure applicability | STANDARD optional applicability plus optional diagnostic | Directionally source-backed | Do not equate non-applicable with forbidden |
| Bredde subset | Municipality-profile rule | Derived near real Færder delivery analysis | Confirm semantics and code list |
| Byggemetode subset | Municipality-profile rule | Derived near real Færder delivery analysis | Confirm required/advisory meaning |
| Kumform subset | Municipality-profile rule | Reduces irrelevant completeness warnings | Confirm exact structures |
| Kjegle subset | Municipality-profile rule | Plausible structure-specific practice | Confirm exact structures |
| Type subset | Default PRAKSIS or Færder profile | Direct analysis-to-code provenance | Preserve required vs should-have distinction |
| Incline thresholds | Optional/profile rule | Explicit practical product request | Cite policy and configure thresholds |
| Topplokk pairing | Optional technical/practice diagnostic | Detects incomplete/improbable deliveries | Confirm object list, pairing, tolerance |
| Minimum overcover | Municipality/project profile | Explicit operational screening need | Resolve 2.0 vs 1.6 and record policy source |

The five FORMAT_ADAPTER and three TEKNISK behaviours also contain valuable technical intent: explicit aliases, SOSI/KOF compatibility, typed parsing, safe whitespace normalization, issue-to-feature navigation, and missing-Z checks. They should be implemented as adapters or diagnostics rather than presented as unsourced domain requirements.

## 15. Likely artefacts or defects not to copy

“Do not copy” here does not mean remove the legacy behaviour now.

- Default-to-gravity. V2 needs `unknown` and conflicting evidence.
- Suffix-based logical keys as source attribute names. Canonical identity and applicability must be separate.
- Unverified semantic aliases and ambiguous dimension aliases.
- Universal `parseFloat` allowed-value equivalence.
- Duplicated evaluator logic in the detail UI.
- Status logic where optional/conditional invalid values can remain green.
- Duplicate active/dormant registries as competing authority.
- AnleggsID conditional metadata without an executable condition.
- Whitespace-only required text counting as present.
- Missing Z collapsed to zero. Preserve the missing-Z rule, not the lossy sentinel.
- Array indices as durable feature identity. Preserve navigation intent with stable internal IDs.
- SOSI/KOF display fallbacks used as if they were delivered canonical Tema values.

## 16. Needs Paul/domain-owner review

These 12 questions cover the 25 behaviour records marked `requiresDomainDecision` in the JSON without turning the working session into a field-by-field census.

1. **Which signals authoritatively classify a line as pressure, gravity, unknown, or conflicting?** Does Tema, `Nett_type`, material, SDR, or Trykklasse have priority? This affects `LEGACY-PRACTICE-001` through `004`. Safe default: classify only explicit recognized evidence and return unknown otherwise.
2. **Was Ringstivhet intentionally broadened from self-fall plastic pipe to every gravity-classified line?** This decides whether `LEGACY-PRACTICE-002` is a profile override or merely a simplified implementation. Safe default: retain the narrower source-backed material condition.
3. **Are Bredde and Byggemetode intentionally expected for KUM/LOK/SAN/SLS/SLU in Færder/Gemini practice?** Why are codes with observed values, such as STR or KRN, excluded? This affects `005` and `006`. Safe default: advisory profile rules disabled until confirmed.
4. **Are Kumform and Kjegle intentionally limited to KUM/SAN/SLS/SLU?** Is a value on LOK or another code wrong, merely unusual, or allowed? This affects `007`, `008`, and the unexpected-value diagnostic. Safe default: no prohibition; report only source-backed requirements.
5. **Should Type be required for FORAKONSTR and GRØKONSTR but only recommended for DIV?** Is legacy `FORAKONSTR` an accepted Gemini alias of source `FORAKONST`? This affects `009`. Safe default: preserve the two expectation levels and keep the alias explicit.
6. **Does a supplied value outside expected applicability mean forbidden, suspicious, or simply optional?** This affects `LEGACY-UNKNOWN-001` and Trykklasse/object-subset rules. Safe default: optional informational diagnostic, not failure.
7. **Which field aliases are formally supported by GMI/SOSI/KOF or municipality exports?** In particular, is `H_MÅLEMETODE` truly an accuracy alias, and can `DIM`/`DIMENSJON` mean Bredde on points without colliding with line dimension? This affects `LEGACY-FORMAT-001` and `LEGACY-DEFECT-003`. Safe default: exact canonical names plus verified unambiguous aliases only.
8. **May inferred SOSI or KOF mappings establish validation applicability, or are they display/grouping aids only?** This affects `LEGACY-FORMAT-002` through `004` and KOF capability policy. Safe default: never treat inferred S_FCODE as delivered compliance evidence.
9. **What normalization is permitted for allowed-value codes?** Are surrounding spaces insignificant, are codes case-sensitive, and for which fields is `11` equivalent to `11.0`? This affects `LEGACY-TECH-001` and `LEGACY-DEFECT-004`. Safe default: no normalization beyond explicitly typed/source-backed rules.
10. **How should severity relate to prevalence and optional invalid values?** Should one missing required object have the same semantic severity as all objects missing, with counts shown separately? This affects `LEGACY-UI-002` and `LEGACY-DEFECT-006`. Safe default: stable per-rule severity plus independent completeness counts.
11. **Can a legitimate delivered Z be exactly zero in supported coordinate/height systems?** This affects `LEGACY-TECH-003`. Safe default: zero is a number; reject only absent/non-finite Z until policy is confirmed.
12. **What are the approved practical parameters for incline, top-lid pairing, and overcover?** Identify policy source, municipality/project scope, object lists, thresholds, and whether overcover is 2.0 or 1.6 m. This affects `LEGACY-PRACTICE-010` through `012`. Safe default: optional diagnostics with no universal pass/fail claim.

## 17. V2 provenance model recommendation

Each V2 rule should declare one immutable origin and may reference supporting evidence:

| Origin | Meaning | Override expectation |
|---|---|---|
| STANDARD | Directly supported by a named instruction/standard version | Profiles may tighten, relax, or disable only through a visible override; base rule remains visible |
| KOMMUNE | Formally adopted municipality rule or interpretation | Scoped to municipality profile; requires authority/reference and effective version |
| PRAKSIS | Experience-based operational review rule | Optional/default according to product decision; rationale and owner visible |
| TEKNISK | Structural/data-quality diagnostic independent of domain obligation | Configurable diagnostic severity; never represented as source compliance |

FORMAT_ADAPTER and UI_POLICY should be separate metadata dimensions, not rule origins:

- adapter mappings say how an input representation yields canonical evidence, including confidence and whether it is validation-authoritative;
- UI policy says how issues are grouped, filtered, or displayed, without changing rule outcome;
- implementation defects are migration findings, not V2 origins.

A minimal provenance record should include `origin`, `authority`, `reference`, `effectiveVersion`, `rationale`, `defaultEnabled`, and `supersedes` where applicable. Evaluation results should record the base rule, active profile override, adapter evidence used, and per-delivery review disposition separately.

Browser-local municipality/user profiles and JSON import/export should layer declarative overrides over stable base rules:

1. STANDARD remains immutable and visible.
2. KOMMUNE may change enablement, severity, applicability, thresholds, or accepted adapter aliases with an explicit diff.
3. PRAKSIS/TEKNISK additions retain their own identities rather than rewriting STANDARD.
4. User profiles may choose among available policies but should not erase provenance.
5. A per-delivery accepted exception or review decision belongs to the run/report and must not mutate the permanent profile.

## 18. Carry-over matrix

| Behaviour / IDs | Preserve unchanged | Preserve intent but redesign | Optional/profile rule | Do not carry | Needs decision |
|---|:---:|:---:|:---:|:---:|:---:|
| Hydraulic classifier (`PRACTICE-001`) |  | ✓ | ✓ |  | ✓ |
| Unknown→gravity (`DEFECT-001`) |  |  |  | ✓ |  |
| Ringstivhet scope (`PRACTICE-002`) |  | ✓ | ✓ |  | ✓ |
| SDR applicability (`PRACTICE-003`) |  | ✓ |  |  | ✓ |
| Trykklasse applicability (`PRACTICE-004`) |  | ✓ | ✓ |  | ✓ |
| Bredde/Byggemetode subsets (`PRACTICE-005/006`) |  | ✓ | ✓ |  | ✓ |
| Kumform/Kjegle subsets (`PRACTICE-007/008`) |  | ✓ | ✓ |  | ✓ |
| Type subset (`PRACTICE-009`) |  | ✓ | ✓ |  | ✓ |
| Unexpected non-applicable values (`UNKNOWN-001`) |  | ✓ | ✓ |  | ✓ |
| Resolver/verified aliases (`FORMAT-001`) |  | ✓ |  |  | ✓ |
| Suffix lookup (`DEFECT-002`) |  |  |  | ✓ |  |
| Risky aliases (`DEFECT-003`) |  |  | ✓ | ✓ | ✓ |
| SOSI mappings (`FORMAT-002/003`) |  | ✓ |  |  | ✓ |
| KOF mapping/capability (`FORMAT-004`, `UI-001`) |  | ✓ |  |  | ✓ |
| GMI numeric coercion (`FORMAT-005`) |  | ✓ |  |  |  |
| Trim (`TECH-001`) |  | ✓ | ✓ |  | ✓ |
| Universal parseFloat (`DEFECT-004`) |  |  |  | ✓ | ✓ |
| Comparator/UI drift (`DEFECT-005`) |  |  |  | ✓ |  |
| Prevalence status (`UI-002`) |  | ✓ |  |  | ✓ |
| State execution gaps (`DEFECT-006`) |  |  |  | ✓ | ✓ |
| Feature navigation IDs (`TECH-002`) |  | ✓ |  |  |  |
| Cross-geometry aggregation (`UI-003`) |  | ✓ |  |  |  |
| Z=0 (`TECH-003`) |  | ✓ | ✓ |  | ✓ |
| Incline (`PRACTICE-010`) |  | ✓ | ✓ |  | ✓ |
| Topplokk (`PRACTICE-011`) |  | ✓ | ✓ |  | ✓ |
| Overcover (`PRACTICE-012`) |  | ✓ | ✓ |  | ✓ |
| Duplicate registries (`DEFECT-007`) |  |  |  | ✓ |  |
| AnleggsID predicate gap (`DEFECT-008`) |  |  |  | ✓ | ✓ |
| Whitespace-only presence (`DEFECT-009`) |  |  |  | ✓ |  |

“Do not carry” refers to the current implementation behaviour. In several rows, the underlying user need is retained in the redesign column.

## 19. Suggested next actions

1. Hold one domain-owner session using the 12 questions above and record authority separately from preference.
2. Perform the planned 46-field runtime-resolution census, starting with all suffixed logical keys and ambiguous dimension aliases.
3. Produce an explicit adapter crosswalk for GMI, SOSI, and KOF with validation-authoritative flags.
4. Convert confirmed practice candidates into non-executable rule specifications with profile scope before writing evaluators.
5. Cite or retire the unexplained defaults for incline, top-lid tolerance, and overcover before V2 migration.

## 20. Machine-readable companion

`docs/validation-v2/legacy-rule-provenance-map.json` is documentation data only and must not be imported by runtime code. It uses schema version `1.0.0`, contains the same 33 IDs as section 3, and records locations, source status, Git evidence, primary/secondary classification, confidence, likely intent, V2 disposition, decision requirement, and concise notes.

The JSON deliberately contains no delivery filenames, uploaded data, coordinates, or executable V2 registry IDs.
