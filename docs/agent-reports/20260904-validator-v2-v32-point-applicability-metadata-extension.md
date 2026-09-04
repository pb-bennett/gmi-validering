# Validator 2.0 v3.2 point-field applicability metadata extension

## Starting checkpoint and policy source

- Branch: `feature/validator-v2-v32-baseline`
- Starting HEAD: `2da5429 Add v3.2 point applicability metadata`
- Authoritative policy source: `docs/agent-reports/20260904-validator-v2-v32-point-applicability-domain-policy.md`, current section 6 table and batch decision history
- Policy revision: `2026-09-04.3`
- Effective date and decision date: `2026-09-04`

The existing stable policy ID (`validator-2-point-field-applicability`) and policy version (`3.2.0`) remain unchanged. Authority remains `PROJECT/DOMAIN POLICY`, explicitly distinct from STANDARD Innmålingsinstruks behavior.

## Exact explicit inventory

Canonical field IDs are `constructionMethod` (`Byggemetode`), `manholeShape` (`Kumform`), `cone` (`Kjegle`), and `width` (`Bredde`). The frozen policy contains exactly these 88 explicit Tema/field cells:

| Tema | constructionMethod | manholeShape | cone | width |
|---|---|---|---|---|
| `KUM` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `SAN` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `SLS` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `SLU` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `LOK` | `APPLICABLE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `APPLICABLE` |
| `KUMI` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `SANI` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `SLI` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `SLG` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `KOTREKUM` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `MKS` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `MKV` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `PMK` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `PMKAF` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `PMKOV` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `PMKSP` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `PMKVL` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `RED` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` |
| `STR` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `APPLICABLE` |
| `KRN` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` |
| `KMR` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` |
| `SUMP` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` |

Totals are **71 `APPLICABLE`**, **9 `NOT_APPLICABLE`**, and **8 `UNKNOWN`** cells, 88 total. The four `KMR` cells and four `SUMP` cells are explicit reviewed-but-unresolved canonical `UNKNOWN` cells, not inferred `NOT_APPLICABLE` cells. The two LOK cells are explicit positive domain-owner `NOT_APPLICABLE` decisions.

## Policy semantics and provenance

`APPLICABLE` states that the field belongs to the exact Tema semantic domain; it does not mean required. `NOT_APPLICABLE` is used only for the nine explicit positive PROJECT/DOMAIN POLICY decisions for STR, KRN, and LOK. It is never generated as the complement of `APPLICABLE`. `UNKNOWN` means that no positive applicability or non-applicability decision has been established.

Existing KUM, SAN, SLS, and SLU cells retain accurate legacy PRAKSIS and delivery-evidence provenance. The 13 newly approved all-applicable Tema (`KUMI`, `SANI`, `SLI`, `SLG`, `KOTREKUM`, `MKS`, `MKV`, `PMK`, `PMKAF`, `PMKOV`, `PMKSP`, `PMKVL`, and `RED`) record explicit domain-owner approval without fabricating legacy evidence. STR and KRN preserve historical PRAKSIS evidence as historical evidence only. The LOK width rationale remains field-specific to `Bredde`; no field's rationale attributes evidence to another field.

## Lookup and immutability contract

`getPointFieldApplicability` remains an exact Tema plus canonical-field lookup. It performs no case folding, whitespace trimming, alias resolution, prefix or substring matching, or inference from Type, geometry, field presence, prevalence, neighboring objects, historical population, or target values. Legacy `KUMi` is not an alias for current `KUMI`. Unsupported, unlisted, current-but-unapproved, and unsupported-field combinations return a newly allocated `UNKNOWN` default without changing policy state. Explicit LOK `NOT_APPLICABLE` combinations and explicit KMR/SUMP `UNKNOWN` combinations return their canonical explicit policy cells.

The exported policy, cells collection, canonical cells, and state enum remain frozen. Requiredness remains `SEPARATE_CONCERN`.

## Zero validation-behavior impact

This remains a metadata-only slice. No applicability consumer, requiredness rule, missing-field finding, rule evaluation, result row/count/summary, Field Info requiredness, Fildata acceptance, Tema resolution, Type/Tema compatibility, UI, telemetry, or deployment behavior was added or changed. The registry baseline remains **29 active rules / 22 point-applicable rules / 21 line-applicable rules**.

## Files changed

- `src/lib/validation-v2/registry/pointFieldApplicability.js`
- `tests/validationV2PointFieldApplicability.test.mjs`
- `docs/agent-reports/20260904-validator-v2-v32-point-applicability-domain-policy.md` (mechanical cleanup only, preserving the approved policy decisions)
- `docs/agent-reports/20260904-validator-v2-v32-point-applicability-metadata-extension.md`

The existing `src/lib/validation-v2/index.js` export was preserved unchanged. The previous implementation and Sol review reports were not altered.

## Remediation performed

- Removed the stale duplicate Byggemetode `Assessment` paragraph from the domain-policy report while preserving the current assessment and useful historical/PRAKSIS context.
- Marked the immediately surrounding Section 4 identity queue as historical pre-batch context superseded by current section 6 policy.
- Corrected the report's mojibaked `InnmÃ¥lingsinstruks` text to `Innmålingsinstruks`.
- Bumped the policy revision from `2026-09-04.1` to `2026-09-04.2`.
- Extended the independent focused-test oracle from 20 to the exact 88 literal cells and added checks for all explicit states, exact identity behavior, the seven NOT_APPLICABLE cells, immutability, and metadata-only registry/result behavior.

## Later domain-owner refinement

Policy revision `2026-09-04.3` records the later explicit domain-owner decision that LOK has no `Kumform` or `Kjegle`: both cells changed from the reviewed 88-cell extension's `UNKNOWN` state to positive `NOT_APPLICABLE` policy states. The 88-cell inventory remains unchanged; totals are now 71 `APPLICABLE`, 9 `NOT_APPLICABLE`, and 8 `UNKNOWN`. KMR and SUMP remain explicit `UNKNOWN` for all four fields, and applicability remains metadata-only with no validation or requiredness consumer.

## Verification

- Focused test: `node --test tests/validationV2PointFieldApplicability.test.mjs` — 10/10 passed.
- Full repository test suite: `node --test` — 296/296 passed.
- `npm run build` — passed.
- `git diff --check` — passed.

No commit, push, merge, deploy, production-configuration change, or production database change was performed.

## Sol review remediation

- Sol identified one LOW-severity documentation consistency finding: four stale implementation-status statements in the domain-policy report described the completed metadata extension as future or not executable.
- Corrected all four statements to distinguish the policy/domain decision, its completed 88-cell metadata implementation, and its continued metadata-only status with no validation or requiredness consumer.
- No production or test behavior changed; the original implementation verification remains valid.

## Later Sol review remediation

- Sol found one mojibaked provenance string and stale verification totals.
- Corrected the provenance text to `Innmålingsinstruks`; current verification totals are 10/10 focused and 296/296 full suite.
- No policy-state or validation-behavior change was made.
