# Validator 2.0 v3.2 Type allowed values

**Date:** 2026-09-03  
**Scope:** point-only v3.2 `Type` strict allowed-value validation.

## Scope and semantics

Added one active point-only rule, `innmaling.point.type.valid`. Type is
optional-if-present because v3.2 describes it as “Der tilgjengelig” / supplied
where available:

- absent, null, and blank values are neutral (`NOT_EVALUATED`);
- supplied nonblank values are checked by exact membership;
- no trimming, case folding, punctuation normalization, substitution, or
  rewriting is performed;
- binding ambiguity remains indeterminate through the existing evaluator
  semantics.

No Type/Tema compatibility, applicability mapping, hydraulic classification,
numeric validation, geometry procedure, or Slice 8+ behavior was added.

## Authoritative list and transcription handling

The executable list contains exactly **72 unique Type codes**, transcribed from
Appendix A pp. 12–14 in the v3.2 rebaseline. The four current bend codes are
`DB11`, `DB15`, `DB22`, and `DB30`. Legacy/mistranscribed `D811`, `D815`,
`D822`, and `D830` are not mapped or accepted.

The independent test fixture
`tests/fixtures/validationV2GmiV32DomainValues.mjs` contains its own exact
72-value `EXPECTED_TYPE_VALUES` list. Tests assert fixture uniqueness, exact
production-list parity, every authoritative value passing, the DB/D8 cases,
near misses, optional states, point-only scope, mixed geometry/layer isolation,
ambiguous binding behavior, and result/count reconciliation.

## Field Info

Type Field Info now documents point-only applicability, optional-if-present
semantics, the exact 72-value executable list, Appendix A pp. 12–14 provenance,
and per-value provenance. A8.1 asserts exact key parity and source parity for
all values.

## Registry counts

The resulting registry has **25 active rules**, **18 point-applicable rules**,
and **21 line-applicable rules**. The new rule is `ALLOWED_VALUE`, so it does
not make Type universally required.

No shared-engine code changed; existing generic `ALLOWED_VALUE` behavior already
provided the required optional-if-present semantics and preserves indeterminate
binding states.

## Verification

- Focused Validator 2.0 A8/A8.1 tests: **33/33 passed**
- Full repository test suite (`node --test`): **267/267 passed**
- `npm run build`: **passed**
- `git diff --check`: **passed**

No commit or push was performed.
