# Independent review: Validator 2.0 v3.2 LOK applicability refinement

**Review date:** 2026-09-04

**Reviewer workflow:** Sol Medium, direct review only; no delegation

**Checkpoint:** `feature/validator-v2-v32-baseline` at `f14ee4f Extend v3.2 point applicability policy`

**Reviewed delta:** uncommitted policy revision `2026-09-04.3` only

## Verdict

**CHANGES REQUESTED — two low-severity documentation consistency findings.**

The policy-state delta, literal test oracle, lookup behavior, immutability, provenance semantics, and zero-validation-behavior contract are correct. The remaining findings concern one mojibaked production-metadata rationale and stale verification totals in the implementation report.

## Findings

### Low — newly added LOK rationale contains mojibaked text

**Location:** `src/lib/validation-v2/registry/pointFieldApplicability.js:83`

The new shared rationale for the LOK `manholeShape` and `cone` cells says `InnmÃ¥lingsinstruks` instead of `Innmålingsinstruks`. The policy state and authority remain unambiguous, so this does not affect lookup or validation behavior, but the exported provenance text is malformed and reintroduces the encoding defect that the implementation report says was corrected.

**Narrowest remediation:** Correct only the malformed word in the new rationale.

### Low — implementation report retains pre-refinement verification totals

**Locations:**

- `docs/agent-reports/20260904-validator-v2-v32-point-applicability-metadata-extension.md:83` records the focused test as 9/9.
- `docs/agent-reports/20260904-validator-v2-v32-point-applicability-metadata-extension.md:84` records the full suite as 295/295.

The same report now documents policy revision `2026-09-04.3`, but its verification section still describes the prior revision. Luna recorded 10/10 focused tests and 296/296 full-suite tests for the current refinement. The build and `git diff --check` remain recorded as passing.

**Narrowest remediation:** Update the two stale counts to the current recorded results while preserving the earlier remediation/history sections.

No other findings were identified.

## Independently observed inventory and states

- 88 explicit cells
- 88 unique `Tema`/canonical-field keys
- 71 `APPLICABLE`
- 9 `NOT_APPLICABLE`
- 8 `UNKNOWN`

The nine `NOT_APPLICABLE` cells are exactly:

- `LOK:manholeShape`
- `LOK:cone`
- `STR:constructionMethod`
- `STR:manholeShape`
- `STR:cone`
- `KRN:constructionMethod`
- `KRN:manholeShape`
- `KRN:cone`
- `KRN:width`

No applicability cell other than `LOK:manholeShape` and `LOK:cone` changed state from the `f14ee4f` checkpoint.

The current LOK row is:

- `constructionMethod`: `APPLICABLE`
- `manholeShape`: `NOT_APPLICABLE`
- `cone`: `NOT_APPLICABLE`
- `width`: `APPLICABLE`

`KMR` and `SUMP` each remain explicit canonical `UNKNOWN` for all four fields.

## Semantics and provenance assessment

Policy identity and provenance are correct: policy ID `validator-2-point-field-applicability`, version `3.2.0`, revision `2026-09-04.3`, effective and decision date `2026-09-04`, and authority `PROJECT/DOMAIN POLICY`.

The two LOK refinements are represented as explicit positive domain-owner `NOT_APPLICABLE` decisions. They are not inferred from absence, legacy subsets, or the complement of `APPLICABLE`. Historical LOK `UNKNOWN` wording is retained only as explicitly superseded history. `APPLICABLE` remains distinct from `REQUIRED`; KMR/SUMP remain the only explicitly reviewed unresolved Tema in this set; and omitted, unsupported, or unapproved combinations default to `UNKNOWN`.

Lookup remains exact. Case, whitespace, aliases, prefixes, substrings, and source labels are not normalized or inferred. In particular, legacy `KUMi` remains unrecognized rather than aliasing current `KUMI`. The policy object, cells array, canonical cells, and state enum remain frozen; fallback UNKNOWN objects remain isolated from canonical policy state.

The independent literal test oracle contains all 88 expected cells, locks the 71/9/8 totals, and enumerates the exact nine `NOT_APPLICABLE` keys independently of production policy generation.

## Zero-behavior-impact assessment

The production delta is confined to the existing metadata module, and the only reference outside that module remains the existing public export. No applicability consumer was added to validation, requiredness, missing-field logic, result rows or counts, Field Info, Fildata, Tema resolution, Type/Tema compatibility, UI, or telemetry.

Independent runtime counts remain:

- 29 active rules
- 22 point-applicable rules
- 21 line-applicable rules
- 0 applicability validation rules
- 0 applicability result rows in the focused validation probe

The domain-policy report describes section 12 as a completed 88-cell metadata slice. Future work is limited to consuming the metadata or separately authorized requiredness/representation concerns rather than extending this completed slice.

## Verification

- Focused test rerun: `node --test tests/validationV2PointFieldApplicability.test.mjs` — **10/10 passed**.
- `git diff --check` — **passed** (exit 0; LF-to-CRLF working-copy warnings only).
- Independent runtime probe — inventory, unique keys, state totals, exact nine negative cells, LOK/KMR/SUMP states, UNKNOWN fallback, `KUMi` exactness, immutability, and registry counts passed.
- Full repository suite — **not rerun**; Luna already recorded 296/296 for this revision, and the narrow review found no functional reason to repeat it.
- Build — **not rerun**; Luna already recorded a passing build, and the narrow review found no functional reason to repeat it.

## Review-created file

- `docs/agent-reports/20260904-validator-v2-v32-point-applicability-lok-refinement-review.md`

The previous Sol review report was not altered. No implementation fix, commit, push, merge, deployment, production-configuration change, or database change was performed.

## Commit readiness

**Not ready for commit.** Resolve the two low-severity consistency findings, then perform a narrow closure review.

## Closure review

**Finding status:** CLOSED — no remaining findings.

**What was verified:**

- The LOK provenance rationale now contains correctly encoded `Innmålingsinstruks`, and no mojibaked equivalent remains in the changed production metadata.
- The implementation report's current verification section records 10/10 focused tests, 296/296 full-suite tests, a passing build, and a passing `git diff --check`.
- The implementation report preserves the earlier history and remediation context and records the later Sol remediation separately without rewriting or deleting the original findings.
- No policy state changed during remediation: the inventory remains 88 explicit cells comprising 71 `APPLICABLE`, 9 `NOT_APPLICABLE`, and 8 `UNKNOWN` states.
- LOK remains `APPLICABLE` for `constructionMethod` and `width`, and `NOT_APPLICABLE` for `manholeShape` and `cone`.
- KMR and SUMP remain `UNKNOWN` for all four fields.
- Applicability remains metadata-only, with no validation or requiredness consumer, no applicability validation rule, and no applicability result row.

**New findings:** None introduced.

**Closure verification:**

- `node --test tests/validationV2PointFieldApplicability.test.mjs` — 10/10 passed.
- `git diff --check` — passed (exit 0; LF-to-CRLF working-copy warnings only).
- Full suite and build were not rerun because Luna's current 296/296 and passing-build results are recorded and inspection revealed no concrete reason to repeat them.

**Final commit readiness:** APPROVED FOR COMMIT.
