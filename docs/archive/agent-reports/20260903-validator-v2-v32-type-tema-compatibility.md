# Validator 2.0 v3.2 Slice 8 — Type ↔ Tema compatibility

**Date:** 2026-09-03

**Branch:** `feature/validator-v2-v32-baseline`

**Starting HEAD:** `44757c0`

## Implementation architecture

Added exactly one active point-only rule, `innmaling.point.type-tema.compatible`, with primary canonical field `type`, evaluator kind `FIELD_RELATIONSHIP`, category `FIELD_COMPATIBILITY`, relationship kind `ALLOWED_PAIRS`, and `ERROR` severity. The existing Type and point-Tema list rules remain separate prerequisite owners, and Type remains optional.

The shared contract now supports ordered relationship inputs and allowed-pair metadata. Registry validation requires two known ordered inputs, unique compatible prerequisite rule IDs, current-list closure for every pair member, no duplicate pairs, no single-field `allowedValues`/comparison policy, and disabled ordinary Fildata.

The runner obtains each input through the existing field-plus-ObjectRef evidence cache. It reuses the ordinary Type binding/extraction path and `resolveGmiTemaIdentity()` for Tema. Direct Tema remains preferred, `S_FCODE` remains the only accepted fallback, agreement resolves normally, and disagreement remains `TEMA_CONFLICT`. No aggregate `RuleResult` or registry execution order is used for prerequisite state.

## Mapping and state contract

The immutable production relationship contains **72 unique Type codes** and **86 unique ordered Type/Tema pairs**, transcribed exactly from Innmålingsinstruks Vedlegg A pp. 12–14. No aliasing, normalization, trimming, case folding, punctuation rewriting, migration, substitution, prefix inference, or family inference was added. The existing 72-Type and 81-point-Tema lists were not changed.

Evaluation precedence is:

1. absent, `undefined`, `null`, or `""` Type → `NOT_EVALUATED / OPTIONAL_TYPE_NOT_SUPPLIED`;
2. any definite prerequisite failure → `NOT_EVALUATED / RELATIONSHIP_PREREQUISITE_FAILED`, with all known blocking rule IDs;
3. structural uncertainty without a definite prerequisite failure → `INDETERMINATE`, reusing a single clear structural reason or `RELATIONSHIP_INPUT_INDETERMINATE` with per-input reasons;
4. two current, valid, resolved inputs → exact pair `PASS`, otherwise `FAIL / TYPE_TEMA_INCOMPATIBLE`.

Whitespace-only Type is supplied, fails the Type list rule, and leaves compatibility not evaluated. `TYPE_TEMA_INCOMPATIBLE` is the only definite compatibility failure.

## Findings, presentation, and Field Info

Mismatch findings retain sanitized evidence under ordered `type` and `tema` keys and expose only relevant expected relationship data. Finding grouping keys use the exact ordered `(Type, Tema)` pair, so different mismatches are not collapsed. Existing dataset revision, ObjectRef, layer, geometry, immutability, privacy, and telemetry boundaries remain unchanged.

The compatibility row is labelled **Type passer til Tema** while Field Info still opens the canonical **Type** concept. Type Field Info includes every Type-to-Tema relationship, all multi-Tema relationships, Appendix A pp. 12–14 provenance, and both the Type-list and compatibility rule IDs. No synthetic canonical field was added. Ordinary single-field Fildata is disabled in the modal and rejected by the field-data helper for this relationship row.

## Registry counts

- Active rules: **26**
- Point-applicable rules: **19**
- Line-applicable rules: **21**

## Independent test oracle and coverage

`tests/fixtures/validationV2GmiV32TypeTemaPairs.mjs` is a separate literal 86-pair Appendix A transcription. It imports no production mapping and does not derive, invert, or iterate production data to create expectations. Tests independently assert 72 unique Types, 86 unique pairs, no duplicates, current point-Tema closure, and deterministic exact parity with production. Existing independent Type and Tema fixtures remain separate.

Coverage exercises all 86 valid pairs, every specified multi-Tema Type, definite mismatches and reverse-looking mismatches, the complete precedence matrix, direct/fallback/agreement/conflict Tema resolution, structural input states, exact grouping, point/line/mixed geometry, two-layer and revision ownership, empty/all-Type-missing datasets, count reconciliation, Field Info parity/provenance, no synthetic Field Info entry, and disabled Fildata.

## Verification

- Focused relationship + affected A5/A7/A8/A8.1 tests: **PASS — 82/82**
- Full repository suite (`node --test tests/*.test.mjs`): **PASS — 279/279**, 0 failed, 0 skipped, 0 cancelled
- Production build (`npm run build`): **PASS**
- `git diff --check`: **PASS**

The build emitted only the pre-existing informational warning that local Browserslist data is stale.

## Unresolved issues

None.
