# Validator 2.0 v3.2 point-field applicability metadata review

**Review date:** 2026-09-04  
**Repository checkpoint:** `feature/validator-v2-v32-baseline` at `68989e4`  
**Scope:** Focused independent review of the point-field applicability metadata slice only

## Verdict

**CHANGES REQUESTED — not approved for commit.**

The implementation is metadata-only and the approved mapping, exact lookup behavior, immutability, index export, and zero-behavior-impact properties are correct. Commit readiness is blocked by inaccurate per-cell provenance for `LOK` × `width`. The focused test also has an oracle gap described below.

## Findings ordered by severity

### Medium — `LOK` × `width` has field-inaccurate rationale metadata

`src/lib/validation-v2/registry/pointFieldApplicability.js` creates the `LOK` `constructionMethod` and `width` cells in one loop with this shared rationale:

> Explicit domain-owner approval; the legacy Byggemetode inclusion is preserved separately as PRAKSIS evidence.

That rationale is coherent for `constructionMethod`, but not for `width` (`Bredde`). The `LOK` × `width` cell therefore attributes its PRAKSIS evidence to a different field. Audit/provenance metadata is the substance of this slice, and the approved domain-policy report separately records legacy `Bredde` evidence. Give the width cell a width-specific rationale, or use accurate field-neutral language that applies to both cells.

### Low — the test oracle does not fully lock the literal contract or exact cell inventory

`tests/validationV2PointFieldApplicability.test.mjs` derives `APPLICABLE` and `UNKNOWN` expectations from the production `PointFieldApplicabilityState` export. A production change to those state literals can therefore change both actual and expected values together. The test also checks the approved positive lookups and selected UNKNOWN cases, but does not compare the canonical `cells` collection to an independent literal list or assert unique keys. An accidental extra approved cell or duplicate/contradictory key outside the sampled Tema values could pass.

Use literal expected state strings and an independent exact expected cell list/key-state map, including a uniqueness assertion. This is a test-strength issue; runtime inspection found no current extra, duplicate, or contradictory cells.

## Approved-mapping assessment

The current artifact contains exactly 20 explicit cells:

- 18 `APPLICABLE`: all four canonical fields for `KUM`, `SAN`, `SLS`, and `SLU`, plus `constructionMethod` and `width` for `LOK`.
- 2 `UNKNOWN`: `manholeShape` and `cone` for `LOK`.
- 0 `NOT_APPLICABLE`.

The canonical IDs correctly represent `Byggemetode`, `Kumform`, `Kjegle`, and `Bredde` as `constructionMethod`, `manholeShape`, `cone`, and `width`. Runtime inventory inspection found no accidental approved cells, duplicate keys, or contradictory cells.

## UNKNOWN/default-semantics assessment

The accessor performs exact lookup only. It does not trim or normalize case, resolve aliases, inspect legacy Tema names, use prefix/sub-string matching, or infer from Type, geometry, field presence, prevalence, or related objects. `kum`, `KUMI`, unrelated current Tema values, unsupported Tema values, and unsupported fields return an explicit `UNKNOWN` cell. Unlisted combinations are never converted to `NOT_APPLICABLE`.

`APPLICABLE` is explicitly separated from requiredness through `requiredness: 'SEPARATE_CONCERN'`, and there is no requiredness consumer.

## Authority/provenance assessment

Policy-level metadata is explicit and coherent:

- policy ID: `validator-2-point-field-applicability`
- policy version: `3.2.0`
- revision: `2026-09-04.1`
- effective date and decision date: `2026-09-04`
- authority: `PROJECT/DOMAIN POLICY`
- standard provenance: `NOT_STANDARD_INNMALINGSINSTRUKS_BEHAVIOR`
- legacy provenance: `PRAKSIS`

This clearly avoids presenting the applicability mapping as STANDARD Innmålingsinstruks behavior and does not require a customer/municipality identifier. The inaccurate `LOK` × `width` rationale described in the Medium finding must be corrected for per-cell audit coherence.

## Immutability/API assessment

The exported policy object, its `cells` array, and every canonical cell are recursively frozen. The state enum is frozen. The private lookup map is not exported, and successful lookups return frozen canonical cells, so callers cannot trivially mutate canonical policy data. UNKNOWN defaults are newly allocated non-canonical result objects; mutating one does not affect policy state. The custom `deepFreeze` helper remains small and policy-local.

## Index-export assessment

The Validator 2.0 index adds only the policy object, state enum, and direct accessor. The policy module depends one-way on the existing canonical registry; the registry does not depend on this module, so no circular dependency is introduced. Import-time work is limited to creating/freezing metadata and a private map. No unrelated internals are exposed.

## Zero-behavior-impact assessment

Repository search found no production consumer of the new policy or accessor. The slice does not modify the active rule registry, runner/evaluator, missing-field behavior, result rows or summaries, Field Info, Fildata acceptance, Tema resolution, Type↔Tema logic, UI, or deployment/production configuration.

Observed counts remain exactly **29 active / 22 point / 21 line**, and the focused runner assertion still produces 29 rule results with no applicability rule/result row.

## Test-oracle assessment

The seven focused tests exercise all approved positive lookups, both explicit LOK UNKNOWN cells, unrelated and unsupported Tema behavior, no inferred NOT_APPLICABLE state, case/whitespace/source-label exactness, authority/provenance metadata, registry counts, and absence of an active applicability rule/result row.

The expected Tema and field identities are independently written, but state literals and the complete policy inventory are not independently locked. See the Low finding.

## Targeted tests run

- `node --test tests/validationV2PointFieldApplicability.test.mjs` — **7/7 passed**.
- Runtime policy inventory/immutability probe — **20 cells; 18 APPLICABLE; 2 UNKNOWN; 0 NOT_APPLICABLE; no duplicate keys; policy, array, and all cells frozen**.
- `git diff --check` — **passed** (only the existing LF-to-CRLF working-copy warning for `src/lib/validation-v2/index.js`).

The full suite and build were not rerun because inspection did not identify a behavior issue warranting repetition.

## Implementation checkpoint

The implementation report records:

- focused tests: 7/7 passed
- full suite: 293/293 passed
- `npm run build`: passed
- `git diff --check`: passed
- registry counts: 29 / 22 / 21

This review independently reconfirmed the focused test, diff check, registry/result counts, exact policy inventory, lookup behavior, and immutability. It did not rerun the full suite or build, as requested.

## Commit readiness

**Not ready for commit.** Correct the `LOK` × `width` rationale and strengthen the focused test oracle to use literal states and verify the exact unique cell inventory. No production behavior changes are needed.

## Closure review

**Closure date:** 2026-09-04  
**Repository checkpoint:** `feature/validator-v2-v32-baseline` at `68989e4`

### Finding 1 — CLOSED

The `LOK` × `width` cell remains `APPLICABLE`. Its corrected rationale specifically identifies `width / Bredde`, records legacy LOK inclusion for Bredde as `PRAKSIS` evidence, identifies explicit approval as `PROJECT/DOMAIN POLICY`, and states that the decision is not STANDARD Innmålingsinstruks behavior. Inspection of the remediation confirmed that the separate `LOK` × `constructionMethod` rationale and all other policy cells remain unchanged.

### Finding 2 — CLOSED

The focused test now owns a literal expected inventory of all 20 Tema/field/state triples. Expected cells and state strings are not derived from the production state enum, policy cells, Tema lists, or field lists. The oracle independently verifies:

- 20 explicit cells and 20 unique Tema/field pairs.
- 18 `APPLICABLE`, 2 `UNKNOWN`, and 0 `NOT_APPLICABLE` cells.
- Every expected Tema/field/state triple occurs exactly once.
- No unexpected extra cell or duplicate Tema/field pair is allowed.
- The exact approved mapping for `KUM`, `SAN`, `SLS`, `SLU`, and `LOK`.

### Additional closure verification

Inspection confirmed unchanged exact lookup behavior, no alias/case/trim inference, unchanged UNKNOWN defaults and immutability, unchanged index export, and no validation, requiredness, result-row, Field Info, Fildata, or UI behavior added. Registry counts remain **29 active / 22 point / 21 line**.

The implementation report records the post-remediation checkpoint as focused **8/8 passed**, full suite **293/293 passed**, `npm run build` **passed**, and `git diff --check` **passed**. Per the closure instructions, the full suite and build were not rerun because inspection found no concrete issue.

### Targeted closure test

- `node --test tests/validationV2PointFieldApplicability.test.mjs` — **8/8 passed**.

## Final verdict

**CLOSED — no remaining findings. APPROVED FOR COMMIT.**

## Final commit readiness

**Ready for commit.** The two requested review findings are resolved, the approved policy contract and metadata-only behavior are preserved, and the directly relevant closure test passes.
