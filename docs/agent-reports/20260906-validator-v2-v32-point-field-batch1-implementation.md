# Validator 2.0 v3.2 — point-field Batch 1 implementation

Date: 2026-09-06. Requested workflow: GPT-6 Astra Medium, direct implementation with no delegation.

## Result

Batch 1 is complete and ready for one independent Sol Medium review. Exactly ten point-only rules were added: eight supplied integer-format rules and two optional exact-list rules. Existing optional code validation and point/line Tema now use owned original lexical evidence when available. Parser normalization was **not changed**.

Final checkpoint: **41 active rules / 34 point-applicable rules and result rows / 21 line-applicable rules and result rows / 41 RuleResults per run**. The lexical correction adds zero rules. The complete repository test suite passed **340/340** and the production build passed, each run once at the final implementation checkpoint.

## Starting checkpoint and scope

Verified before implementation:

```text
feature/validator-v2-v32-baseline
18834c0 Add v3.2 point integer format validation
6c10bca Refine v3.2 LOK applicability policy
f14ee4f Extend v3.2 point applicability policy
```

The only initial untracked file was the authorized [Astra roadmap](20260906-validator-v2-v32-point-field-roadmap-astra.md). It was read completely and preserved without modification. This implementation follows Batch 1 only; the latest user instruction selects Astra Medium instead of the roadmap's proposed Luna implementation workflow.

No commit, push, merge, deploy, production configuration or database change was performed. No sub-agents were used.

## Exact ten new rules

All ten have `geometryScopes: ['point']` and severity ERROR. Existing required-presence rules and their IDs/semantics are unchanged.

| Rule ID | Canonical field / direct source property | Contract; Appendix A v3.2 pages |
|---|---|---|
| `innmaling.point.horizontal-accuracy.integer` | `horizontalAccuracy` / Nøyaktighet | INTEGER_FORMAT, cm; 4, 6 |
| `innmaling.point.vertical-accuracy.integer` | `verticalAccuracy` / NøyaktighetHøyde | INTEGER_FORMAT, cm; 4, 6 |
| `innmaling.point.max-horizontal-deviation.integer` | `maxHorizontalDeviation` / MaksAvvikHorisontalt | INTEGER_FORMAT, cm; 4, 6 |
| `innmaling.point.max-vertical-deviation.integer` | `maxVerticalDeviation` / MaksAvvikVertikalt | INTEGER_FORMAT, cm; 4, 6 |
| `innmaling.point.wall-thickness.integer` | `wallThickness` / Tykkelse | INTEGER_FORMAT, mm, point only; 5, 9 |
| `innmaling.point.external-height.integer` | `externalHeight` / Utvendig_høyde | INTEGER_FORMAT, mm; 5, 9 |
| `innmaling.point.nobb-vavvs-number.integer` | `nobbVavvsNumber` / NOBB-VAVVS-nr | INTEGER_FORMAT, identifier with no unit, point scope only; 5, 10 |
| `innmaling.point.nobb-vavvs-frame-number.integer` | `nobbVavvsFrameNumber` / NOBB-VAVVS-nr-ramme | INTEGER_FORMAT, identifier with no unit; 5, 10 |
| `innmaling.point.owner.valid` | `owner` / Eier | ALLOWED_VALUE / EXACT; 4, 8–9 |
| `innmaling.point.access.valid` | `access` / Adkomst | ALLOWED_VALUE / EXACT; 5, 15 |

Eier's exact 13 values: `AN, F, I, K, K1, K2, L, P, P1, S, S1, S2, S3`.

Adkomst's exact five values: `DO, NG, NT, ST, UTENST`.

Integer rules reuse the existing Bredde/Lengde evaluator unchanged: `^[+-]?[0-9]+$`, lexical evidence first, no normalization, signs/zero/negative integers/leading zeros accepted. Without a lexeme, exact strings and safe runtime integers retain the established behavior; unsafe runtime integers remain INDETERMINATE / `NUMERIC_PRECISION_UNAVAILABLE`. Missing optional values are NOT_EVALUATED. Invalid supplied integer representations fail with `VALUE_NOT_INTEGER`.

No new evaluator kind, reason code, canonical field or binding alias was introduced. No positivity, range, plausibility, fixed NOBB digit count, unit conversion or new requiredness was added. Source list provenance remains STANDARD with the existing explicit product policy that unlisted explanatory values fail automated verification and require manual validation; this does not assert that the source forbids its explanatory-text fallback.

## Lexical-evidence defect and correction

The parser already stores each original `_FIELDVALUES` lexeme before trimming/converting the ordinary attribute value. The defective optional-list evaluator compared only that ordinary value. Tema's observations and agreement similarly used parsed values without retaining lexical spelling. Consequently real GMI values such as ` KUM `, ` KSTA ` and ` R ` could pass exact validation.

Changes:

- `ruleEvaluation.js`: optional ALLOWED_VALUE now uses the existing lexeme-first comparison primitive also used by REQUIRED_ALLOWED_VALUE. The missing/structural-state handling is unchanged.
- `temaIdentity.js`: accepted candidate observations retain `sourceLexeme` from the parser's existing lexical-evidence map. The immutable resolved identity carries the preferred observation's lexeme, defaulting to `UNAVAILABLE` when no lexical evidence exists. Agreement compares exact lexemes when present, with the existing strict typed-value fallback otherwise. Parsed `resolvedValue` remains available separately.
- Tema's required-list evaluator checks the owned lexeme before the parsed resolved value. The shared correction applies to both point and line Tema without new line rules.
- Relationship pair comparison uses the same authoritative lexical representation as its list prerequisites; it cannot validate one representation and compare a different parser-converted representation afterward.
- `fieldData.js`: resolved Tema records use the resolver's preferred source key and original lexeme together with its parsed value. This is necessary when the direct field is missing and S_FCODE supplies the value, as well as for padded direct values.

**Parser trimming, numeric conversion and lexical-evidence preservation were not modified.** No change was needed in `gmiParser.js`, the lexical map, general field extraction, canonical binding, contracts, runner dispatch or the result model.

### Tema and compatibility behavior

Direct Tema remains preferred when accepted values agree; S_FCODE remains the sole accepted fallback. Missing direct values can still use an available fallback. Different direct/fallback lexical values remain CONFLICT, including `KUM` versus ` KUM `, even when parser-trimmed values coincide. Equally padded direct/fallback values can resolve to one identity but fail exact code membership. Neither path normalizes or silently chooses a winner on disagreement.

Type, Kumform, Byggemetode, Kjegle, Eier and Adkomst now reject padded original code lexemes through the same optional evaluator. No-lexeme runtime strings retain strict exact comparison.

If Type or Tema fails code validation, Type↔Tema compatibility remains NOT_EVALUATED under the existing prerequisite policy, without a fabricated relationship failure. A valid Type plus conflicting Tema remains INDETERMINATE / `TEMA_CONFLICT`. Missing optional Type, valid pairs and definite valid-code incompatibility retain the existing behavior.

Lexemes were not added to telemetry, global summaries or the runner's sanitized finding-copy shape. They remain within the owned evidence and the existing local Fildata workflow.

## Field Info and Fildata

Added V2 Field Info entries for externalHeight, owner and access. Eier/Adkomst reuse the existing code-list information composition with current values and source citations. Their active automation is point-only.

Updated the seven existing integer-field entries. Common/point-line fields use point geometry overlays so line descriptions and presence-only behavior remain intact. The NOBB frame entry is point-only and receives its format documentation directly. Overlays distinguish the point format rule from existing required-presence rules and include the new audit rule IDs.

Qualifications explicitly preserve:

- supplied-format checking without deciding applicability or requiredness;
- the Utvendig_høyde A5 optional / A9 conditionally obligatory **SOURCE_CONFLICT**;
- unresolved accuracy limits and maximum-boundary-deviation semantics;
- no exact NOBB digit-count or catalogue-identity validation;
- the technical integer grammar, separate from the source datatype;
- manual validation for unlisted supplied code values.

Fildata continues to share the production evaluators. Tests cover Gyldig, Ugyldig, Må vurderes and missing `-` outcomes. Parser-whitespace-only values retain the existing null/missing presentation (`⟨null⟩`), not a new lexical failure. Present padded strings remain visible in their original form and are Ugyldig. Field Info's per-rule requiredness still comes from the selected rule, so a field's separate presence rule remains REQUIRED while its format rule is NOT_REQUIRED.

No result-tab rerun, field catalogue, modal redesign or alternate result model was added.

## Counts and applicability

| Measure | Before | After |
|---|---:|---:|
| Active rules / RuleResults per run | 31 | 41 |
| Point-applicable rules/result rows | 24 | 34 |
| Line-applicable rules/result rows | 21 | 21 |
| Common rules | 14 | 14 |
| Point-only rules | 10 | 20 |
| Line-only rules | 7 | 7 |
| Active applicability rules/result rows | 0 | 0 |

An independent read-only import/run confirmed all final counts, including 41 RuleResults on an empty dataset. A zero-object rule retains its result row and zero per-object outcomes.

Applicability is unchanged: revision **2026-09-04.3**, **88 cells / 71 APPLICABLE / 9 NOT_APPLICABLE / 8 UNKNOWN**. KMR and SUMP remain UNKNOWN under the existing policy. No evaluator, runner, Tema, rule registry or Fildata path imports/consumes this policy. Tests verify both the static separation and unchanged supplied-value outcomes across applicable, not-applicable, unknown, missing, invalid and conflicting Tema inputs. APPLICABLE still does not mean REQUIRED.

## Tests and verification

New files:

- `tests/fixtures/validationV2GmiV32Batch1.mjs`: test-owned literal rule IDs, fields, units, source pages and both complete allowed-value lists.
- `tests/validationV2GmiV32Batch1.test.mjs`: 27 tests exercising the whole batch with shared test-owned cases, including all eight integer fields and every new list value.

Coverage includes real-parser exact/padded values; original integer lexemes; runtime precision uncertainty; missing values; direct/unique-case/ambiguous binding; unavailable schemas and unresolved-state preservation; point/line and multi-context ownership; Tema direct/fallback lexical agreement/conflict and Fildata; Type/Tema prerequisite suppression; Field Info qualifications; applicability non-consumption; unchanged line Tykkelse; and completed-result reuse. The original Bredde/Lengde behavioral tests remain intact; only their total-count/title expectations changed.

Existing A7, A8, result-workflow, Type/Tema, point-code and applicability tests received explicit inventory/count updates. A8 now expects NOBB supplied-format rows to be NOT_EVALUATED when absent, while still rejecting any restoration of a NOBB required rule. Expected values, counts and new rule IDs come from test-owned literals rather than production lists.

Verification history:

1. Initial focused Batch 1 run identified two test-fixture assumptions, not production defects: Fildata deliberately labels parser-whitespace-only null values as `⟨null⟩`, and missing schema metadata can be inferred from actual attributes. Tests were corrected to preserve existing missing presentation and use a truly unavailable schema fixture.
2. Targeted ten-file validator run: **137/138 passed**. The one failure was the old expected set of active Field Info labels, missing five newly active field names. Its literal inventory was updated.
3. Focused Batch 1 plus result-workflow rerun: **34/34 passed**, including all 27 new tests.
4. Final complete agreed repository suite, run **once**: `node --test tests/*.test.mjs` — **340/340 passed**, zero failures, skipped or cancelled.
5. Production build, run **once**: `npm run build` — **passed**; Next.js compiled successfully, TypeScript stage and all eight static pages completed. Only the existing nine-month-old Browserslist-data warning was reported. Dependencies/configuration were not changed to suppress it.
6. `git diff --check` passed. Final status contains only Batch 1 source/tests, this report and the previously authorized untracked roadmap. No suite/build is repeated after documentation-only edits.

## Changed production files

Exactly six:

- `src/lib/validation-v2/registry/rules.js`: ten explicit rules and two exact lists.
- `src/lib/validation-v2/ruleEvaluation.js`: optional/Tema lexeme-first comparison and matching relationship representation.
- `src/lib/validation-v2/temaIdentity.js`: owned lexical observations, agreement and resolved lexical evidence.
- `src/lib/validation-v2/fieldData.js`: preferred Tema key/value/lexeme handoff.
- `src/lib/validation-v2/registry/fieldInformation.js`: two list-information mappings and required metadata coverage for newly active fields.
- `src/data/validation-v2/field-information.json`: new entries and point-specific format/source qualifications.

The parser, canonical field registry, applicability policy, contracts, validation runner, result presentation/model, telemetry, dependency manifests, configuration and database files are unchanged.

## Remaining blockers and non-goals

Batch 2 is not implemented: decimal Avst_BunnInnvUnderUtv, date/year formats and Merknad length remain future work under the roadmap's separate contracts.

This batch resolves neither Utvendig_høyde requiredness nor the Avst_BunnInnvUnderUtv scope ambiguity. Applicability consumers, conditional requiredness, shape/construction evidence, qualifying polygon/GML ownership and completeness, GUID/SID relationships, attachment provenance, topology/stikkledning procedures, hydraulic classification, measured height arithmetic and acceptance thresholds remain separate blocked/architecture work.

No positivity/range/plausibility/unit-conversion/fixed-digit checks, aliases, geometry-derived values or new line rules were introduced. Existing line Tema behavior intentionally changes only to correct exact lexical verification. The implementation is ready for independent review, not a claim that that review or release approval has already occurred. No commit or push was made.

## Remediation of Sol review findings

The independent Sol review identified three findings, all remediated without changing the Batch 1 inventory or parser:

1. Multiple accepted direct and unique Unicode case-only source-key candidates now agree using each candidate's original `sourceLexeme` when available, with typed `rawValue` as the `UNAVAILABLE` fallback. Lexically different candidates remain structurally ambiguous; parser-normalized equality no longer discards malformed lexical evidence. This preserves direct-canonical preference when accepted evidence is genuinely equivalent. Optional Type absence remains `NOT_EVALUATED`; a resolved Type that fails exact allowed-value validation makes the relationship `NOT_EVALUATED / RELATIONSHIP_PREREQUISITE_FAILED`; conflicting accepted Type evidence produces `INDETERMINATE / BINDING_AMBIGUOUS` because the Type prerequisite is structurally unresolved. Real-parser regressions cover integer, Eier, Kumform, Type, compatibility, equivalent duplicates, and Fildata.
2. Eier Field Info now declares the source field applicable to both point and line. Its qualification explicitly identifies `innmaling.point.owner.valid` as the point-only active Batch 1 rule. No line Eier validation rule was added; Adkomst remains point-only.
3. The Tema identity and observation contracts now declare their returned `sourceLexeme` properties. Lexical evidence remains owned, immutable, and available to Tema resolution, exact validation, compatibility prerequisites, and Fildata. The generic sanitized finding-copy path explicitly omits `sourceLexeme`, so raw lexical values are not included in generic findings, telemetry, or summaries.

The parser was not changed. The final counts remain 41 active rules, 34 point-applicable rules/result rows, 21 line-applicable rules/result rows, and 41 RuleResults per run. Applicability remains revision `2026-09-04.3` with 88 cells: 71 APPLICABLE, 9 NOT_APPLICABLE, 8 UNKNOWN, and zero active applicability consumers.
