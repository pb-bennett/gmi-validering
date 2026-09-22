# Validator 2.0 v3.2 Slice 7 — domain-list implementation review

**Date:** 2026-09-02  
**Branch:** `feature/validator-v2-v32-baseline`  
**Reviewed checkpoint:** `155193f` plus the current Slice 7 working-tree changes  
**Scope:** Material, point Tema, line Tema, their Field Info metadata, the two shared-engine changes, and focused regression coverage only

## Verdict

**FINDING — not yet approved for commit.**

The implementation behavior and authoritative data are correct in the reviewed diff. One test-contract finding remains: the new list tests do not independently pin the authoritative lists, and the point/line Tema Field Info per-value metadata is not covered by a parity/provenance assertion.

## Findings

### Medium — domain-list and Tema Field Info tests use an incomplete oracle

`tests/validationV2GmiA8.test.mjs` imports `MATERIAL_VALUES`, `POINT_TEMA_VALUES`, and `LINE_TEMA_VALUES` from production `rules.js`, then uses those same values as both registry expectations and the iterable for the all-values pass tests. There are no independent assertions for the authoritative 45/81/108 contents or even their three exact lengths. A missing, extra, or misspelled production entry could therefore remain green because the test oracle would change with the implementation.

`tests/validationV2GmiA81FieldInfo.test.mjs` does verify Material `valueInfo` parity and per-value provenance. For Tema, however, it checks only `composeFieldInformation(...).allowedValues`, which is copied from the executable rule. It does not assert the point and line `byGeometry.valueInfo` key sets or each value's Appendix A page provenance. A defect in either Tema Field Info overlay would therefore not be detected.

This is a test-coverage finding, not an observed runtime or metadata defect. The reviewed production constants exactly match the independently documented lists, and the Tema overlays currently contain the correct values and page references. Commit readiness should nevertheless wait for independent authoritative fixtures/count assertions and point/line Tema Field Info parity/provenance assertions.

## Shared-engine change assessment

The changes to `src/lib/validation-v2/ruleEvaluation.js` and `src/lib/validation-v2/validationRunner.js` were required for Slice 7 and are appropriately narrow.

- Tema rules receive the specialized conservative Tema identity evidence, not ordinary object-field evidence. Once point and line Tema changed from presence-only to required-plus-allowed-value rules, a Tema-aware allowed-value evaluator was necessary to preserve the established identity states while checking the resolved raw value.
- `evaluateTemaRequiredAllowedValue` preserves the prior schema-unavailable, ambiguous, missing, conflict, and unresolved-source outcomes and reason codes. It adds only exact `Object.is` membership checking for a resolved Tema value.
- The runner dispatches to the new evaluator only for `REQUIRED_ALLOWED_VALUE` rules whose canonical field is `tema`. All non-Tema required, allowed-value, and combined evaluators retain their existing paths.
- Tema resolution remains wholly owned by `temaIdentity.js`: direct `Tema` remains preferred, `S_FCODE` remains the sole fallback, and disagreement remains `TEMA_CONFLICT`/indeterminate. No resolver, binding registry, alias, normalization, or source-selection code changed.
- The changes do not alter finding projection, aggregation, result semantics, layer/revision ownership, geometry selection, field binding, or later-slice applicability behavior. No unnecessary or overly broad shared-engine change was found.

## What was verified

### Material

- The production list exactly matches the 45 values documented in the v3.2 rebaseline plan.
- `PVC-O` passes; legacy `PVC-0` fails.
- Exact `PE100-RC-PP0` passes.
- The existing required field and rule ID remain in place; absent, null, and empty values still fail with the established required reason codes.
- Material remains line-only and is not referenced by any hydraulic classifier or applicability logic. No hydraulic classifier was added.

### Point Tema

- The production list exactly matches all 81 documented current-v3.2 codes.
- Direct `Tema`, sole fallback `S_FCODE`, and conflict semantics remain unchanged.
- No aliases, trimming, case folding, punctuation rewriting, normalization, or additional fallback sources were added.
- Point-only rule evaluation remains isolated from lines and layers.

### Line Tema

- The production list exactly matches all 108 documented current-v3.2 codes.
- The five provisional codes pass normally: `LEBEKXX500`, `LEBEKXX510`, `LEBEKXX511`, `LEGRØXX500`, and `LEKAXX500`.
- Legacy `XF`, `XG`, `XGP`, `XGS`, `XK`, `12`, `12D`, `121`, `120`, and `12P` are absent and fail.
- No migration to `I2`-family tokens or any other inferred replacement exists.

### Product policy and scope isolation

- Membership checks are exact and operate on raw resolved/source values. Unlisted, legacy, explanatory, case-changed, and whitespace-changed values fail automated validation; no value is rewritten or substituted.
- No Type list or Tema↔Type compatibility rule was introduced.
- No hydraulic-field, classification, applicability, geometry, topology, or later-slice behavior was introduced.
- Registry counts remain exactly 24 active, 17 point-applicable, and 21 line-applicable.
- Result and count reconciliation, geometry isolation, layer binding, and result identity remain covered and passing.

## Test coverage assessment

The focused tests exercise every value present in each of the three production lists; Material exact/legacy cases; all five provisional line Tema codes; all specified old line Tema tokens; Tema case, whitespace, and unknown near misses; generic exact-comparison whitespace behavior; missing/null/empty required states; direct Tema, `S_FCODE`, and conflict paths; point/line and layer isolation; and result/count reconciliation.

The gap described in the finding remains: these tests do not independently establish that the production arrays are exactly the authoritative 45/81/108 lists, and point/line Tema Field Info `valueInfo` list parity and per-value provenance are not asserted.

## Targeted tests run by reviewer

Command:

`node --test tests/validationV2GmiA5.test.mjs tests/validationV2GmiA8.test.mjs tests/validationV2GmiA81FieldInfo.test.mjs tests/validationV2GmiA81ResultsWorkflow.test.mjs`

Result: **58/58 passed**; 0 failed, 0 skipped, 0 cancelled.

No full-suite or build rerun was performed because the review found no implementation failure requiring either checkpoint to be repeated.

## Existing Luna verification

- Focused A5/A8/A8.1: **58/58 passed**.
- Full repository suite: **263/263 passed**.
- `npm run build`: **passed**.
- `git diff --check`: **passed** (normal Git LF-to-CRLF warnings only).

The reviewer also ran `git diff --check`; it passed with the same line-ending warnings.

## Commit readiness

**Not ready for commit** because the independent authoritative-list and Tema Field Info parity/provenance test contract is incomplete. No implementation-code correction is requested. After tests independently pin all three lists/counts and both Tema Field Info overlays, the implementation is otherwise suitable for commit review.

No implementation code or tests were modified during this review. No commit or push was performed.

## Closure re-review — 2026-09-03

### Remediation performed

- Added `tests/fixtures/validationV2GmiV32DomainValues.mjs` as a static,
  independent test oracle for the documented v3.2 Appendix A domain lists.
  It contains exactly 45 unique Material values, 81 unique point-Tema values,
  and 108 unique line-Tema values. The fixture has no imports and does not
  derive values from `MATERIAL_VALUES`, `POINT_TEMA_VALUES`, or
  `LINE_TEMA_VALUES`.
- Updated the A8 contract test to assert both the exact production-list length
  and exact production-list contents against each independent fixture. The
  all-authoritative-values Tema evaluation loops also iterate the independent
  fixtures rather than the production arrays.
- Updated the A8.1 Field Info test to compare the complete point and line Tema
  `byGeometry.valueInfo` key sets against their independent authoritative
  fixtures. It verifies every point value has Appendix A provenance on pages
  `10–12` and every line value has Appendix A provenance on pages `16–19`.
  Exact whole-key-set equality means any additional legacy or otherwise
  unlisted value fails the test. Existing Material `valueInfo` parity and
  per-value provenance coverage remains in place and now uses the independent
  Material fixture.
- No production implementation file changed as part of the remediation.

### Closure verification

The remediation closes both parts of the original Medium finding. The
independent fixture contents and counts are pinned separately from production,
the executable domain lists are checked for exact lengths and exact contents,
and both geometry-specific Tema Field Info overlays are checked for exact key
parity and per-value Appendix A provenance.

Focused closure command:

`node --test tests/validationV2GmiA5.test.mjs tests/validationV2GmiA8.test.mjs tests/validationV2GmiA81FieldInfo.test.mjs`

Result: **52/52 passed**; 0 failed, 0 skipped, 0 cancelled. A separate fixture
count/uniqueness check confirmed **45 / 81 / 108**, all unique. Luna's
remediation verification reported `git diff --check` passed. The full suite and
build were not rerun because the closure review found no production defect and
the prior implementation checkpoint already passed 263/263 plus the build.

### Finding status and final verdict

**CLOSED.** The original Medium test-contract finding is fully remediated. No
production implementation or metadata defect was found during closure review.

**Final verdict: APPROVED for commit review.** The historical verdict and
commit-readiness statement above record the pre-remediation review state and
are superseded by this closure. Slice 7 is ready for commit review within the
reviewed scope. No commit or push was performed.
