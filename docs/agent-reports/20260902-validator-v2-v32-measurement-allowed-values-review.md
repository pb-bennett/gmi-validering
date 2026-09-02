# Sol review report: Validator 2.0 v3.2 Slice 5

Date: 2026-09-02  
Review status: APPROVED FOR COMMIT (final re-review)

## Finding

### Medium — Measurement lexical tests do not exercise the parser lexical-evidence path or the no-lexeme fallback directly

The near-miss test constructs synthetic attributes via `oneObjectDataset`, so `sourceLexeme` is `UNAVAILABLE`. It proves exact string rejection, but does not prove that parser-trimmed/coerced values such as `" 10 "`, `"01"`, and `"10.0"` are rejected because the original lexeme overrides numeric `sourceValue`.

The real-GMI test does not include measurement cases, and its measurement defaults are deliberately invalid.

References:

- `tests/validationV2GmiA8.test.mjs:302`
- `tests/validationV2GmiA8.test.mjs:201`
- `tests/validationV2GmiA8.test.mjs:414`
- `src/lib/validation-v2/ruleEvaluation.js:10`
- `src/lib/parsing/gmiParser.js:123`

This is a test-coverage finding, not a currently identified implementation defect.

## Required remediation

1. Add real parsed measurement lexical-evidence tests for:
   - valid codes
   - `01`
   - leading/trailing whitespace
   - `+10`
   - `10.0`
2. Add direct no-lexeme fallback coverage proving:
   - exact valid strings pass
   - safe integer codes pass
   - malformed strings fail
   - non-integers fail
   - unsafe integers fail
   - `-0` fails

## Parts confirmed correct by Sol

- Exact authoritative 69/35 lists.
- `97` is valid only for Målemetode.
- Required missing/null/blank behavior is preserved.
- Unlisted explanatory and legacy values are rejected.
- Source lexemes take precedence without trim/normalization/rewriting.
- The no-lexeme implementation itself accepts only exact strings or safe non-negative-zero integer representations.
- Field Info derives both executable lists/provenance correctly.
- No Slice 6+ leakage.
- Counts remain 24 active / 17 point / 21 line.

## Review execution notes

- No targeted tests were run by the reviewer.
- The reviewer modified no files.

## Final Sol re-review outcome

- Final verdict: **APPROVED FOR COMMIT**.
- Original Medium finding: **CLOSED**.
- The final missing coverage was real parsed-GMI `MålemetodeHøyde=97` rejection; that parser-path case is now explicitly tested.
- All other lexical/no-lexeme remediation cases were already covered.
- No implementation code was changed during remediation.
- Focused test: **19/19 passed**.
- `git diff --check` passed, with line-ending warnings only.
- The full suite and build were not rerun after the test-only remediation.
- The reviewer modified no files.
