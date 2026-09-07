# Validator 2.0 v3.2 — Merknad/Fildata consistency implementation

Date: 2026-09-07

## Scope

This narrow batch closes Astra audit finding A1 from the 2026-09-06 real-file test-readiness report. It changes supplied text evidence handling for the existing point `Merknad` `TEXT_MAX_LENGTH` rule and its Fildata inspection path. No validation rule, applicability behavior, parser behavior, Fildata architecture, production configuration, commit, or database was changed.

## Astra reproductions

The actual `GMIParser` reproduced both A1 manifestations:

- Two point objects with `Merknad` containing 255 spaces and 256 spaces produced one PASS and one FAIL in the evaluator, but Fildata previously treated both parser-null values as one `missing:null` bucket. The bucket label depended on object order.
- One point object with accepted case-only keys `Merknad` and `MERKNAD`, containing ordinary text and a non-empty whitespace lexeme, previously allowed the parser-null whitespace candidate to disappear from the text rule's present candidates.

The same-file 255/256 case is Matrix item 17 in the Astra report.

## Root cause

The parser preserves the original source lexeme in `GMI_SOURCE_LEXEMES`, but converts whitespace-only text to `rawValue: null`. Generic object extraction therefore classified that candidate as `VALUE_MISSING`. Fildata then keyed the record by the typed null representation, and the first record's evaluator result classified the shared bucket. For mixed accepted keys, ordinary extraction filtered the whitespace candidate before duplicate evidence comparison.

## Implementation decision

`objectFieldValue.js` now treats an accepted `note` candidate as supplied when its preserved source lexeme is a non-empty string, regardless of the parser-coerced runtime value. The exact lexeme is then included in the existing duplicate comparison. This makes 255 and 256 spaces distinct evidence, makes ordinary text plus whitespace text `BINDING_AMBIGUOUS`, and leaves equal lexical duplicates subject to the existing 255 Unicode-code-point check.

The change is explicitly scoped to canonical field `note`. Numeric and code-list fields continue to use the existing `isMissingValue` semantics, so parser-null whitespace remains their established missing behavior. No parser or global coercion policy changed.

Fildata already uses the shared extracted evidence and exact lexeme bucket keys. Once `note` extraction preserves supplied whitespace as present evidence, Fildata separately represents the source lexemes and applies the same evaluator outcome as the production rule.

## Test matrix and results

Focused tests use the actual parser for the important regressions:

| Case | Engine | Fildata |
|---|---|---|
| Same file: 255 spaces + 256 spaces | 1 PASS / 1 FAIL | Two buckets: `Gyldig` / `Ugyldig`, one each |
| Reverse object order | Same totals and labels | Same two buckets and counts |
| Add genuinely empty Merknad | 1 PASS / 1 FAIL / 1 NOT_EVALUATED | Empty remains a separate `-` bucket |
| `Merknad=ok`, `MERKNAD=256 spaces` | `INDETERMINATE / BINDING_AMBIGUOUS` | One `Må vurderes` unresolved bucket |
| Reverse mixed key/value order | Same ambiguity | Same unresolved outcome |
| Equal 255-space duplicate | PASS | `Gyldig` |
| Conflicting 255/256-space duplicate | `INDETERMINATE / BINDING_AMBIGUOUS` | `Må vurderes` |
| Astral and combining Unicode boundaries | Existing expected results | Existing expected results |
| Numeric/code whitespace regressions | Existing expected results | Existing expected results |

The focused command passed:

`node --test --test-reporter=dot tests/validationV2GmiV32Batch2.test.mjs tests/validationV2GmiV32Batch1.test.mjs tests/validationV2GmiV32PointNumericLexical.test.mjs tests/validationV2GmiV32PointCodeLists.test.mjs tests/validationV2GmiA8.test.mjs`

## Inventory and applicability

The existing inventory remains 45 active rules, 38 point rules, 21 line rules, and 45 `RuleResults`. Applicability remains metadata-only at revision `2026-09-04.3`: 88 cells, 71 `APPLICABLE`, 9 `NOT_APPLICABLE`, 8 `UNKNOWN`, and zero active applicability consumers/results.

## Unresolved issues

No A-class blocker remains for this Merknad/Fildata consistency batch. The Astra report's separately documented B-class input/profile and inspection limitations remain outside this narrow implementation scope.
