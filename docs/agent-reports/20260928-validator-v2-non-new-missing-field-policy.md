# Validator V2: missing construction fields on objects without NYTT

Date: 2026-09-28. Branch: `feature/styling-overhaul-integrated`. Starting HEAD: `93d407f` (`Complete styling convergence`). The existing untracked read-only audit was preserved.

## Exact policy

An object is **new** only when Stedfestingsårsak resolves to the valid code `NYTT`. Every other case is **non-new** for this missing-value policy: `UENDR`, another valid non-`NYTT` cause, missing cause, or invalid/unresolved cause. The separate Stedfestingsårsak owner continues to report FEIL for a missing or invalid cause. The shared `isExplicitlyNew` predicate uses the evaluator's resolved cause validity and lexical value; it does not use `UENDR` as a proxy.

Only the selected **missing-value** outcomes change. Supplied invalid codes, malformed values, negative or out-of-range numbers, contradictions, and incompatible values retain their existing FEIL/SJEKK behavior. Structural source/binding uncertainty still takes precedence over a missing-field conclusion.

## Point and line behavior

| Geometry | Field | Applicability | Missing with NYTT | Missing without NYTT |
| --- | --- | --- | --- | --- |
| Point | Byggemetode | Existing applicable Tema cells | FEIL | SJEKK |
| Point | Kjegle | Existing applicable Tema cells | FEIL | SJEKK |
| Point | Tykkelse | Existing applicable Tema cells | FEIL | SJEKK |
| Point | Avst_BunnInnvUnderUtv | Existing applicable Tema cells | FEIL | SJEKK |
| Line | Tykkelse | Existing line requirement | FEIL | SJEKK |
| Line | SDR | Required pressure/material branch | FEIL | SJEKK |
| Line | Ringstivhet | Required gravity/material branch | FEIL | SJEKK |

Applicability is unchanged. The point fields remain PASS when absent outside applicable Tema cells. SDR/Ringstivhet retain SPECIAL SJEKK, optional PASS, and unresolved Tema/Material dependency suppression. Trykklasse retains its prior missing behavior.

### Fields kept strict when missing

| Geometry | FEIL conditions retained |
| --- | --- |
| Point | Type when required; Kumform when applicable; InnvendigUtvendig; Bredde when applicable |
| Line | Dimensjon; VertikalDimensjon with a valid non-circular Rørform; Material; Nett_type; Rørform; InnvendigUtvendig |

Anleggsår was left unchanged: missing with `NYTT` is FEIL; missing with any non-`NYTT`, missing, or invalid cause is SJEKK. Its existing wording and implementation remain intact.

## Diagnostics and downstream contract

Downgraded results use `NON_NEW_REQUIRED_VALUE_MISSING` with SJEKK state. The message says the field is normally required, the affected objects are not marked NYTT, and the missing information should be reviewed. Existing contextual Tema/Material details remain visible. Supplied invalid values still use their original invalid-value reasons and messages.

The policy edits only outcome state/reason for selected absent values. The applicability registry, raw presence detection, and coverage calculation were not edited, so factual coverage such as “11 av 16 aktuelle objekter har Tykkelse” remains a presence count. The diagnostic test checks two applicable point objects with one supplied Tykkelse and one missing Tykkelse. Existing result presentation/workflow tests passed, confirming that sorting and filtering continue to consume normal outcome state. No Stats, map, schema binding, or UI component code changed. `contracts.js` gained only a reason-code constant; no data schema changed.

## Verification

- `git diff --check`: passed.
- Focused policy/severity/diagnostic and directly related point/line regression tests: 86 passed, 0 failed.
- Result presentation and workflow tests: 21 passed, 0 failed.
- Total: 107 passed, 0 failed.
- `npm.cmd run build`: failed during Next.js font retrieval. Turbopack could not connect to `https://fonts.googleapis.com` to fetch Roboto from `src/app/layout.js`; no project compilation error was reported before that external-resource failure. This environment's restricted network prevents a complete build result.

## Files changed

- `src/lib/validation-v2/fieldPolicy.js`: shared explicit-NYTT predicate and missing-value split.
- `src/lib/validation-v2/contracts.js`: reason code for non-new missing required values.
- `src/lib/validation-v2/diagnostics.js`: contextual review mapping and wording.
- `tests/validationV2NonNewMissingPolicy.test.mjs`: new point/line, strict-field, cause, dependency, invalid-value, coverage, and wording cases.
- `tests/validationV2RealDataPolish.test.mjs`: updated reason-code assertion.
- `tests/validationV2GmiA8.test.mjs`, `tests/validationV2GmiV32Batch2.test.mjs`, `tests/validationV2GmiV32Batch2Completion.test.mjs`, `tests/validationV2GmiV32Batch3.test.mjs`, `tests/validationV2GmiV32Batch4.test.mjs`: existing missing-without-NYTT expectations updated to SJEKK.
- This report.

## Final repository state

No commit or push was made. The pre-existing untracked audit was preserved. Final `git status --short`:

```text
 M src/lib/validation-v2/contracts.js
 M src/lib/validation-v2/diagnostics.js
 M src/lib/validation-v2/fieldPolicy.js
 M tests/validationV2GmiA8.test.mjs
 M tests/validationV2GmiV32Batch2.test.mjs
 M tests/validationV2GmiV32Batch2Completion.test.mjs
 M tests/validationV2GmiV32Batch3.test.mjs
 M tests/validationV2GmiV32Batch4.test.mjs
 M tests/validationV2RealDataPolish.test.mjs
?? docs/agent-reports/20260928-validator-v2-existing-object-missing-fields-audit.md
?? docs/agent-reports/20260928-validator-v2-non-new-missing-field-policy.md
?? tests/validationV2NonNewMissingPolicy.test.mjs
```
