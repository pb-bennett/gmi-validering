# Validator 2.0 v3.2 Slice 6 — Vertikalnivå allowed values review

**Date:** 2026-09-02  
**Branch:** `feature/validator-v2-v32-baseline`  
**Expected and reviewed checkpoint:** `036ae35`  
**Scope:** Targeted Slice 6 review only

## Verdict

**APPROVED FOR COMMIT**

No findings.

## What was verified

- The executable `Vertikalnivå` list contains exactly the seven authoritative v3.2 values, in the documented order: `UNDER_GRUNN`, `PÅ_GRUNN_VANNOVERF`, `OVER_GRUNN`, `PÅ_BUNN`, `I_VANNSØYL`, `SLISSING`, and `UNDER_BUNN`.
- The existing common required rule remains one rule bound to both point and line scopes. Missing fields still produce `REQUIRED_FIELD_ABSENT`; null and blank values still produce `REQUIRED_VALUE_MISSING`.
- Present values use `REQUIRED_ALLOWED_VALUE` with `ValueComparisonPolicy.EXACT`. Listed values pass and unlisted, legacy, explanatory, case-variant, whitespace-padded, and representative near-miss values fail with `VALUE_NOT_ALLOWED`.
- No trimming, case folding, normalization, substitution, rewriting, transliteration, or legacy-token mapping was introduced.
- Exact `I_VANNSØYL` passes for point and line objects.
- Legacy `!_VANNSØYLEN` fails and is not normalized to `I_VANNSØYL`.
- Existing canonical direct binding and ObjectRef behavior remains unchanged. Point, line, mixed-geometry, and separate-layer values remain isolated.
- Field Info derives its seven-value list from the executable `VERTICAL_LEVEL_VALUES` constant, reports complete documentation, and gives Appendix A pages `4, 9` as field and per-value provenance tied to `innmaling.common.vertical-level.required`.
- The working-tree implementation diff is confined to the vertical-level rule/list, corresponding Field Info metadata/derivation, and focused tests. No Material, Tema, Type, compatibility, hydraulic-classification, geometry-procedure, or Slice 7+ behavior was added.
- Registry counts remain 24 active rules, 17 point-applicable rules, and 21 line-applicable rules.

## Targeted tests run during review

Command:

```text
node --test tests/validationV2GmiA8.test.mjs tests/validationV2GmiA81FieldInfo.test.mjs
```

Result: **28/28 passed** — A8 **20/20** and A8.1 Field Info **8/8**. No failures, skips, or cancellations.

The full repository suite and build were not rerun because the targeted review found no concrete issue requiring them.

## Existing Luna verification

- A8 focused: **20/20 passed**
- A8.1 Field Info: **8/8 passed**
- Full repository suite: **261/261 passed**
- `npm run build`: **passed**
- `git diff --check`: **passed**

## Commit readiness

Slice 6 is **APPROVED FOR COMMIT**.
