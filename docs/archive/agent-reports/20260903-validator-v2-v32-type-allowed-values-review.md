# Validator 2.0 v3.2 Type allowed-value validation review

**Date:** 2026-09-03  
**Branch:** `feature/validator-v2-v32-baseline`  
**Base and HEAD reviewed:** `7cb6bc15b7e2760568939afa4254a38d5e898960`  
**Review scope:** Targeted review of the uncommitted Type allowed-value slice only.

## Verdict

**APPROVED FOR COMMIT**

No findings.

## Authoritative-list and oracle assessment

- Production `TYPE_VALUES` contains exactly 72 entries and 72 unique values.
- Its exact ordered contents match the source-backed Type transcription in the v3.2 rebaseline plan, Appendix A physical pp. 12–14.
- The current bend codes `DB11`, `DB15`, `DB22`, and `DB30` are present. Legacy/mistranscribed `D811`, `D815`, `D822`, and `D830` are absent.
- `EXPECTED_TYPE_VALUES` is a separate 72-entry literal in `tests/fixtures/validationV2GmiV32DomainValues.mjs`. It neither imports nor derives the production array.
- Tests establish exact length, uniqueness, and exact production/oracle contents through the 72-length and 72-unique production assertions plus deep equality with the independent fixture. Every fixture value is also exercised through the validator.
- The fixture and production list both exactly match the 72 unique values represented by the grouped source ledger in the rebaseline plan; no production-only or fixture-only value was found.

## Optional-if-present semantics assessment

- `innmaling.point.type.valid` is point-only and uses `ALLOWED_VALUE`, not a required evaluator.
- Field absent, `null`, and empty string produce neutral `NOT_EVALUATED` outcomes.
- Whitespace-only and other non-empty strings are supplied values, not blanks created by trimming; they fail exact membership. No trimming is performed.
- Supplied nonblank values are validated with exact identity comparison.
- Ambiguous binding remains `INDETERMINATE` with `BINDING_AMBIGUOUS`; it is not collapsed into absence.
- The implementation follows the agreed strict product policy: listed current codes pass, while unlisted, legacy, explanatory, case-changed, padded, and punctuation-substituted values fail with `VALUE_NOT_ALLOWED`. There is no D8-to-DB migration, normalization, substitution, or rewriting.

## Field Info assessment

- Field Info exposes Type only for point geometry and composes it as `required: false` / `NOT_REQUIRED`.
- The displayed description states that Type is used when available and that supplied values must match the current v3.2 list; the UI also presents it as not required.
- The allowed-value list is derived from the executable rule and contains the exact 72 values.
- Field-level provenance references Appendix A pp. 4 and 12–14; each value has Appendix A pp. 12–14 provenance.
- Tests assert exact valueInfo key parity and per-value source parity against the independent fixture.
- No legacy D8 value is exposed as allowed or in valueInfo.

## Scope isolation and registry counts

- No shared evaluator, binding, parser, geometry, classification, or result-reconciliation implementation changed.
- The new rule is point-only; line evaluation remains zero, and mixed point/line and layer isolation are preserved.
- Existing reconciliation checks pass with the added point rule.
- No Type↔Tema compatibility rule, Tema applicability mapping, hydraulic classification, conditional field logic, geometry behavior, or later-slice behavior was added.
- Reviewed registry counts are exactly 25 active rules, 18 point-applicable rules, and 21 line-applicable rules.

## Targeted tests

Command:

```text
node --test tests/validationV2GmiA8.test.mjs tests/validationV2GmiA81FieldInfo.test.mjs
```

Result: **33/33 passed**, 0 failed.

This focused run covers the exact 72-value list, DB/D8 transcription cases, strict near misses, optional states, point-only behavior, ambiguity, mixed-geometry isolation, count reconciliation, registry counts, and Field Info/valueInfo provenance.

## Existing Luna verification

Accepted as the implementation checkpoint evidence supplied in the implementation report:

- focused A8/A8.1: **33/33 passed**;
- full suite: **267/267 passed**;
- `npm run build`: **passed**;
- `git diff --check`: **passed**.

The full suite and build were not rerun during this targeted review because no concrete finding required them.

## Commit readiness

The reviewed Type allowed-value slice is ready to commit together with its implementation report and this review report. The diff remains isolated to the Type rule/list, Type Field Info, independent fixture, and directly affected test/count contracts. No commit or push was performed.
