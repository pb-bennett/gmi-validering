# Validator 2.0 v3.2 Slice 6 — Vertikalnivå allowed values

**Date:** 2026-09-02  
**Scope:** Slice 6 only; strict `Vertikalnivå` / `verticalLevel` allowed-value validation

## Implementation

The existing common required-presence rule for `Vertikalnivå` remains independently bound to both point and line ObjectRefs. Present values now use strict `REQUIRED_ALLOWED_VALUE` validation with exact lexical comparison. Missing, null, and blank values retain required-field behavior.

Only current authoritative v3.2 codes pass automated validation. Unlisted, explanatory-text, legacy, lowercase, whitespace-padded, or punctuation variants fail without normalization, substitution, or rewriting.

## Authoritative v3.2 values

- `UNDER_GRUNN`
- `PÅ_GRUNN_VANNOVERF`
- `OVER_GRUNN`
- `PÅ_BUNN`
- `I_VANNSØYL`
- `SLISSING`
- `UNDER_BUNN`

`I_VANNSØYL` is explicitly tested as a passing current token. The legacy malformed token `!_VANNSØYLEN` is explicitly rejected and is not mapped to the current token.

## Field Info and provenance

Field Info derives the executable seven-value list and per-value Appendix A provenance from the active rule. The field is marked complete for the strict v3.2 code-validation policy.

## Tests and verification

- A8 focused tests: **20/20 passed**.
- A8.1 Field Info focused tests: **8/8 passed**.
- Full repository test suite: **261/261 passed** (`node --test tests/*.test.mjs`).
- Build: **passed** (`npm run build`).
- `git diff --check`: **passed** (line-ending warnings only).

## Counts

- Active registry: **24 rules**.
- Point-applicable: **17 rules**.
- Line-applicable: **21 rules**.

No Material, Tema, Type, compatibility, hydraulic classification, or Slice 7+ behavior was implemented.
