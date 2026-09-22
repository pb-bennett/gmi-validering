# Validator 2.0 v3.2 Slice 5 — measurement allowed values and lexical policy

**Date:** 2026-09-02  
**Branch:** `feature/validator-v2-v32-baseline`  
**Scope:** Slice 5 only; measurement-method allowed values and lexical policy

## Implementation

The existing common `measurementMethod` / `Målemetode` and `heightMeasurementMethod` / `MålemetodeHøyde` rules remain independently bound to both point and line ObjectRefs. Their required-field behavior is preserved while present values now use strict `REQUIRED_ALLOWED_VALUE` validation.

- `Målemetode`: authoritative 69-code v3.2 list, including `97`.
- `MålemetodeHøyde`: independent authoritative 35-code v3.2 list, excluding `97`.
- Supplied unlisted, legacy, or explanatory-text values fail automated code validation.
- No compatibility acceptance, normalization, substitution, or rewriting is performed.
- Optionality is not introduced; both fields retain v3.2 required presence.

## Lexical policy

Measurement code values use `INTEGER_CODE_STRING`. When parser lexical evidence is available, the original lexeme is compared exactly with the string code list. Therefore `01`, leading/trailing whitespace, `+10`, `10.0`, negative, decimal, and padded variants do not pass by numeric resemblance. Numeric values without source lexeme evidence are accepted only when they represent an exact safe integer code; parsed source lexemes remain authoritative.

## Counts

- Active registry: **24 rules**.
- Point-applicable: **17 rules**.
- Line-applicable: **21 rules**.
- Common: 14; point-only: 3; line-only: 7.

## Tests and verification

- Focused A7/A8/A8.1 tests: **40/40 passed**.
- Full repository tests (`node --test tests/*.test.mjs`): **257/257 passed**.
- `npm run build`: **passed**.
- `git diff --check`: **passed**.

### Slice 5 Sol finding remediation

- Added real parsed-GMI regression coverage for valid measurement codes, `01`, leading whitespace, trailing whitespace, `+10`, and `10.0`; coverage includes both measurement fields, preserves the `Målemetode=97` pass case, and now explicitly covers parsed-GMI `MålemetodeHøyde=97` rejection.
- Added direct no-lexeme fallback coverage proving that exact valid strings and safe integer representations pass, while malformed strings, non-integers, unsafe integers, and `-0` fail.
- The new tests did not expose an implementation defect. No implementation code was changed; the remediation changed tests only.
- Focused remediation test (`node --test tests/validationV2GmiA8.test.mjs`): **19/19 passed**.
- The full suite was not rerun because this remediation changed tests only and the focused coverage was sufficient.
- `git diff --check` after remediation: **passed**.

No later Slice 6–13 behavior was implemented. No commit or push was performed.
