# Validator 2.0 v3.2 — Merknad/Fildata consistency closure review

Date: 2026-09-07

## Verdict

No findings in the independently reviewed Astra A1 scope.

CLOSED — no remaining A1 blocker.
APPROVED FOR COMMIT.
READY FOR SUPERVISED REAL-FILE TESTING.

## Scope and checkpoint

This was a narrow Sol Medium closure review of Astra A1 only. The Astra readiness report, the Luna implementation report, and the actual working-tree diff were inspected. No B-class finding or other Validator 2.0 work was reviewed.

- Branch: `feature/validator-v2-v32-baseline`
- Committed HEAD: `f21e9d3 Complete v3.2 point field validation batch 2`
- Production diff: `src/lib/validation-v2/objectFieldValue.js` only
- Test diff: `tests/validationV2GmiV32Batch2.test.mjs` only
- The two supplied reports were untracked inputs; this review report is the only file added by the review.

No source or test fix was made. No full suite or build was rerun. No commit or push was performed.

## Independent verification

The changed extraction was traced through the actual `GMIParser`, schema binding, ObjectRefs, `extractGmiObjectFieldValue`, the production validation runner/evaluator, and `getValidationV2FieldDataSummary`.

1. One parsed file containing `Merknad` values of 255 and 256 spaces produced engine counts `1 PASS / 1 FAIL`. Fildata produced two exact-lexeme buckets, one `Gyldig` and one `Ugyldig`, each with count 1 and `withValueCount=2`.
2. Reversing the two objects produced an identical complete signature: engine totals, Fildata totals, bucket values, acceptance labels, and counts.
3. Adding a genuinely empty `Merknad` produced `1 PASS / 1 FAIL / 1 NOT_EVALUATED`. Fildata retained the empty value as a separate `-` bucket with `withValueCount=2`, `missingCount=1`, and `unresolvedCount=0`.
4. `Merknad=ok` with `MERKNAD=256 spaces` produced `INDETERMINATE / BINDING_AMBIGUOUS`; Fildata showed one unresolved `Må vurderes` bucket.
5. Reversing both accepted key order and competing value order preserved the same ambiguity and Fildata classification.
6. Equal duplicate evidence remained valid: two equal 255-space lexemes produced PASS and `Gyldig`.
7. Existing whitespace duplicate boundaries remained correct: 255/255 passed, while both 255/256 orders produced `INDETERMINATE / BINDING_AMBIGUOUS`.

## Scope and consistency analysis

The implementation adds one extraction exception guarded by `canonicalField.canonicalFieldId === 'note'`. A non-empty preserved note lexeme can therefore participate as supplied authoritative text even when the parser's typed value is null. Candidate agreement still compares exact owned source lexemes, without trimming or normalization.

An actual-parser extraction probe supplied whitespace for `Merknad`, `Bredde`, `Eier`, `Nøyaktighet`, `Avst_BunnInnvUnderUtv`, `Anleggsår`, `Datafangstdato`, `Tema`, and `Type`. Only canonical `note` became `VALUE_PRESENT`; every listed non-note field remained `VALUE_MISSING`. Together with the focused regressions, this confirms unchanged whitespace semantics for Bredde, Eier, integer, decimal, year/date, code lists, Tema, and Type/Tema.

Neither `src/lib/parsing/gmiParser.js` nor `src/lib/validation-v2/valueSemantics.js` is changed. The parser still preserves exact source lexemes while coercing trimmed empty text to null, and global `isMissingValue` remains exactly `undefined || null || ''`. Global `VALUE_MISSING` semantics are unchanged.

Fildata re-extracts the same owned object evidence and invokes the same scalar evaluator as the engine. Present/missing buckets use exact source lexemes when available; typed fallback keys preserve type and value; unresolved conflicts have a structural unresolved key and evaluate indeterminate. For the note change, 255 spaces, 256 spaces, and empty text therefore have different keys, while equal authoritative evidence shares one evaluator outcome. Within one dataset the schema binding is fixed, so a bucket cannot combine authoritative evidence with different evaluator outcomes. Bucket acceptance is consequently independent of first-record order for the reviewed A1 paths.

## Inventory and applicability

Independent runtime checks confirmed:

- 45 active rules
- 38 point rules
- 21 line rules
- 45 `RuleResults` for an empty engine input
- Applicability revision `2026-09-04.3`
- 88 policy cells: 71 `APPLICABLE`, 9 `NOT_APPLICABLE`, 8 `UNKNOWN`
- 0 active applicability consumers/results; repository use inspection found only the policy module and its public index re-export, and the runtime emitted no applicability RuleResult.

## Checks run

Focused test selection:

`node --test --test-reporter=dot --test-name-pattern="Batch 2|note length|real-parser note|all ten rules preserve|real-parser padded|accepted direct|lexically conflicting|independently enforces|real GMI exact enum|point and line Tema" tests/validationV2GmiV32Batch2.test.mjs tests/validationV2GmiV32Batch1.test.mjs tests/validationV2GmiV32PointNumericLexical.test.mjs tests/validationV2GmiA8.test.mjs`

Result: 13 selected tests passed.

An additional in-memory assertion probe used the actual parser and production validation/Fildata paths for all seven requested A1 behavior groups, scoped non-note whitespace extraction, inventory, applicability counts, and absence of applicability RuleResults. Result: passed.

`git diff --check` passed; only the existing LF-to-CRLF working-copy warnings were emitted. Final `git status --short` was recorded after creating this report.
