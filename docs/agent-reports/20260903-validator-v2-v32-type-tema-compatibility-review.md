# Validator 2.0 v3.2 Slice 8 — Type ↔ Tema compatibility review

**Date:** 2026-09-04  
**Branch:** `feature/validator-v2-v32-baseline`  
**Reviewed base:** `44757c0`  
**Verdict:** **APPROVED FOR COMMIT**

## Findings ordered by severity

No findings.

## State-contract assessment

The implementation matches the committed precedence contract:

1. absent, `undefined`, `null`, or exactly `""` Type produces `NOT_EVALUATED / OPTIONAL_TYPE_NOT_SUPPLIED`;
2. any definite Type or Tema prerequisite failure produces `NOT_EVALUATED / RELATIONSHIP_PREREQUISITE_FAILED`, records all known blocking prerequisite rule IDs, and suppresses a compatibility finding even when the other input is indeterminate;
3. structural uncertainty without a definite prerequisite failure produces `INDETERMINATE`, reusing `BINDING_AMBIGUOUS`, `UNRESOLVED_SOURCE`, `SCHEMA_UNAVAILABLE`, or `TEMA_CONFLICT` for one clear cause and using `RELATIONSHIP_INPUT_INDETERMINATE` for distinct simultaneous causes;
4. only two resolved values whose owning current-list rules pass reach exact ordered-pair comparison.

`TYPE_TEMA_INCOMPATIBLE` is the sole definite compatibility failure. Invalid or missing Type/Tema values remain owned by their individual list rules and do not generate duplicate compatibility mismatches. Whitespace-only Type remains supplied and therefore fails the Type list prerequisite rather than being treated as absent.

## Shared-engine architecture assessment

Approved. `FIELD_RELATIONSHIP` and `FIELD_COMPATIBILITY` are separate generic contract concepts, with only `ALLOWED_PAIRS` implemented. The rule declares ordered `inputFieldIds` and ordered prerequisite rule IDs explicitly. Registry validation rejects unknown or duplicate inputs, unknown/duplicate/misordered/incompatible prerequisites, non-list prerequisite owners, malformed pair shapes, duplicate pairs, pair members outside the owning current lists, single-field comparison metadata, and enabled ordinary Fildata.

Relationship prerequisites are evaluated per ObjectRef from their field evidence using the existing single-field semantics. Evaluation does not consume aggregate `RuleResult` data and does not depend on registry execution order. The runner cache remains keyed by canonical field plus the layer/revision/geometry/object-qualified ObjectRef key.

Tema has no second resolution path: the runner routes it through `resolveGmiTemaIdentity()`. Existing direct `Tema` preference, sole `S_FCODE` fallback, agreement resolution, and `TEMA_CONFLICT` disagreement behavior are preserved. Type uses the existing binding and object-value extractor. No unnecessary shared-engine expansion or future hydraulic/classification architecture was introduced.

## Mapping/oracle assessment

Production contains exactly 72 unique Type identities and 86 unique ordered Type/Tema pairs. The mapping agrees with Appendix A pp. 12–14 and includes all required multi-Tema relationships:

- `BSPY` → `BAS`, `BFD`
- `PSNK`, `PTOR` → `PAF`, `POV`, `PSP`, `PST`, `PMK`
- `RBIO`, `RMEK`, `RMKJ` → `RSP`, `RVA`
- `SSTA` → `SLG`, `SLS`, `SLU`

The fixture `tests/fixtures/validationV2GmiV32TypeTemaPairs.mjs` is an independent literal transcription: it imports no production mapping and performs no production-derived inversion or generation. Tests establish 72 unique Types, 86 unique non-duplicate pairs, current Tema closure, and deterministic exact parity with production. All 86 fixture pairs are exercised through the runner. Representative current-code mismatches confirm that both list rules pass while only compatibility fails.

## Result/presentation assessment

Mismatch grouping uses the exact ordered `(Type, Tema)` value, keeping distinct incompatible pairs separate. Relationship findings contain sanitized evidence under named `type` and `tema` keys and relevant expected relationship data only; unrelated raw object properties are not retained.

The result row label is `Type passer til Tema`. Field Info remains the canonical `type` concept, with no synthetic compatibility field. It contains the exact compatibility mapping, all multi-Tema relationships, Appendix A pp. 12–14 provenance, and both audit rule IDs. Both Type-related result rows open coherent Type information; the relationship row exposes its relationship section and does not present an ordinary one-field allowed-value list. Ordinary Fildata is disabled in the modal and rejected by the field-data helper for this rule, so no misleading Type-only validity distribution is shown.

## Isolation/count assessment

The active inventory is exactly 26 rules: 19 point-applicable and 21 line-applicable. The compatibility rule is point-only. Line-only datasets evaluate zero compatibility objects and the line presentation universe remains at 21 rows. Mixed point/line data, separate layers with identical local indices, dataset revisions, and ObjectRef ownership remain isolated by the existing evidence path.

Empty point collections remain neutral. Missing optional Type contributes to `notEvaluatedCount`, and all-Type-missing datasets retain `NO_APPLICABLE_EVALUATIONS`. The rule reconciles `evaluatedObjectCount = pass + fail + notEvaluated + indeterminate`.

No reviewed change introduces hydraulic classification/applicability, SDR, Ringstivhet, Trykklasse, polygon/point representation, topology, stikkledning behavior, Slice 9+ behavior, Testmodus changes, or production/deployment configuration changes.

## Targeted tests run

Command:

```text
node --test tests/validationV2GmiTypeTemaCompatibility.test.mjs tests/validationV2GmiA7.test.mjs tests/validationV2GmiA8.test.mjs tests/validationV2GmiA81ResultsWorkflow.test.mjs
```

Result: **PASS — 53/53**, 0 failed, 0 skipped, 0 cancelled.

Also rerun: `git diff --check` — **PASS**.

## Existing implementation verification

The implementation report records the checkpoint already completed by the implementation session:

- focused tests: **82/82 passed**;
- full suite: **279/279 passed**;
- `npm run build`: **passed**;
- `git diff --check`: **passed**.

Per the review request, the full suite and build were not rerun because the targeted inspection and tests found no concrete issue warranting them.

## Commit readiness

**APPROVED FOR COMMIT.** The Slice 8 working-tree changes conform to the committed plan and are ready to commit. This review did not modify production code or tests and did not commit, push, merge, deploy, or alter production configuration.
