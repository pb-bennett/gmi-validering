# Focused Validator contractor rule corrections

Timestamp: 2026-11-07 13:25:24 CET (+01:00).
Repository: `C:\GitHub\gmi-validering-test`.
Branch: `feature/photo-workspace`; starting HEAD: `c48b098`.
Starting worktree: clean.

## Scope and inspected paths

Only Validator date handling, GUT/Bredde applicability and missing severity, and LOK/GUT Vertikalnivå classification were corrected. Relevant explanatory text and regression tests were updated. No FOTO import, metadata completion/policy, map editing, export, styling, input data, or unrelated validation rule was changed. No commit or push was made.

Inspected the active `FIELD_POLICY` rule owners, generic `evaluateDateFormat`, raw source lexeme handling, point applicability matrix, current v3.2 enums, schemas and fixtures, existing real-data corrections, date/diagnostic tests, and missing-field severity conventions. The active production owners are:

- `innmaling.common.capture-date.required`, for points and lines.
- `innmaling.point.width.integer`, for points.
- `innmaling.common.vertical-level.required`, for points and lines.

The supplied acceptance symptoms do not exactly match this checkout's initial severities. The table below records observed repository behavior rather than assuming every reported case previously produced FEIL.

## Exact before/after behavior

| Rule/input | Before | After |
| --- | --- | --- |
| Datafangstdato `2026-05-28` | FEIL / `DATE_FORMAT_INVALID` | PASS when valid under the existing chronology checks |
| Valid `DD.MM.YYYY` or `YYYYMMDD` | Accepted; chronology decides PASS/SJEKK/FEIL | Unchanged |
| Impossible ISO date, e.g. `2026-02-29` | FEIL / `DATE_FORMAT_INVALID` | Unchanged |
| ISO date tomorrow | FEIL / `DATE_FORMAT_INVALID` | FEIL / `DATE_FUTURE` |
| ISO date before usable Anleggsår | FEIL / `DATE_FORMAT_INVALID` | FEIL / `DATE_BEFORE_INSTALLATION` |
| ISO date exactly five years old | FEIL / `DATE_FORMAT_INVALID` | PASS |
| ISO date older than five years | FEIL / `DATE_FORMAT_INVALID` | SJEKK / `DATE_OLDER_THAN_FIVE_YEARS` |
| Missing Datafangstdato | FEIL | Unchanged |
| GUT/Bredde `1600` or `20` | SJEKK / `APPLICABILITY_UNEXPECTED_VALUE` | PASS |
| GUT/Bredde absent or empty | PASS | SJEKK / `APPLICABILITY_REQUIRED_MISSING`, independent of NYTT/UENDR |
| GUT/Bredde `0` | SJEKK / `APPLICABILITY_UNEXPECTED_VALUE` | SJEKK / `NUMERIC_ZERO` |
| GUT/Bredde `1`–`19` | SJEKK / `APPLICABILITY_UNEXPECTED_VALUE` | SJEKK / `NUMERIC_OUTSIDE_PREFERRED_RANGE` |
| GUT/Bredde malformed, fractional, unsafe integer | FEIL / `VALUE_NOT_INTEGER` | Unchanged |
| GUT/Bredde negative integer | FEIL / `NUMERIC_OUTSIDE_ALLOWED_RANGE` | Unchanged |
| LOK or GUT / `OVER_GRUNN` | SJEKK / `UNUSUAL_VALID_VALUE` | PASS |
| LOK or GUT / `PÅ_GRUNN_VANNOVERF` | PASS | Unchanged |
| LOK or GUT / `UNDER_GRUNN` | PASS | SJEKK / `UNUSUAL_VALID_VALUE` |
| LOK or GUT / other supported vertical codes | SJEKK | Unchanged |
| Missing, malformed, unsupported vertical value | FEIL | Unchanged |

The supported vertical codes were taken from `VERTICAL_LEVEL_VALUES` and checked against current rule/schema and fixture evidence: `UNDER_GRUNN`, `PÅ_GRUNN_VANNOVERF`, `OVER_GRUNN`, `PÅ_BUNN`, `I_VANNSØYL`, `SLISSING`, `UNDER_BUNN`. No representation or alias was added. The LOK/GUT exception requires a valid resolved Tema, including resolution from S_FCODE. Missing, invalid or conflicting Tema retains the general vertical policy; other point Tema and lines retain their existing classifications.

## Implementation and changed files

- `src/lib/validation-v2/calendarDate.js` (new): one strict calendar parser for dotted, compact and ISO date spellings, with UTC component round-trip validation to reject rollover dates.
- `src/lib/validation-v2/fieldPolicy.js`: uses the calendar helper; adds the exact GUT/Bredde missing SJEKK exception; applies the exact LOK/GUT vertical policy after existing missing/structural and allowed-code checks.
- `src/lib/validation-v2/ruleEvaluation.js`: the generic date-format evaluator uses the same calendar helper, replacing its duplicate calendar implementation.
- `src/lib/validation-v2/registry/pointFieldApplicability.js`: adds only GUT × width as APPLICABLE, with the explicit missing SJEKK policy documented in its rationale. Policy revision is `2026-11-07.1`; inventory is 132 cells. The other five GUT applicability cells remain UNKNOWN.
- `src/lib/validation-v2/registry/fieldInformation.js`: updates executable-rule explanations for these three fields.
- `src/lib/validation-v2/registry/rules.js`: updates the Bredde explanation and retained date-format rule description. Rule IDs, severity constants and code lists stay the same.
- `src/lib/validation-v2/validationRunner.js`: records Tema as an explanation dependency for the now Tema-dependent vertical policy.
- `tests/validationV2ContractorRuleCorrections.test.mjs` (new): eight focused regression tests.
- `tests/validationV2PointFieldApplicability.test.mjs`: updates the independent cell inventory and revision expectations for the single new GUT cell.
- `tests/validationV2GmiV32Batch2.test.mjs`: updates its existing inventory/revision assertion.
- `docs/agent-reports/20261107-132524-validator-contractor-rule-corrections.md`: this report.

Original source lexemes are used for validation and retained unchanged. The tests assert that validation leaves dataset attributes and field schemas unchanged. Numeric plausibility rules, date chronology, unresolved-source handling, unrelated GUT checks, PASS/SJEKK/FEIL presentation and styling are preserved.

## Tests and results

The new tests were first run against the original implementation: **2 passed, 6 failed**, reproducing the missing ISO support and wrong target classifications.

Coverage added:

- ISO, dotted and compact dates; valid leap days including 2000; invalid leap days including 1900; invalid day/month boundaries and malformed spellings.
- Point and line date validation, today/tomorrow, exact five-year boundary and previous day, installation-year ordering, unusable installation year, empty/missing values and absent schema field.
- GUT/Bredde supplied, empty and absent values, NYTT/UENDR, 0/19/20 mm boundaries, negative/fractional/malformed/unsafe values, and controls for KUM, LOK, PSP and STR.
- Both LOK and GUT: all seven existing vertical codes, empty/absent fields, unsupported/case/whitespace variants; general-policy controls for other, missing, invalid and conflicting Tema; S_FCODE resolution.
- Existing Fildata labels remain `Pass`, `Sjekk`, `Feil`; validation does not mutate source values.

| Check | Result |
| --- | --- |
| Before changes: `node --test tests/validationV2*.test.mjs` | 279 tests: 276 passed, 3 failed |
| Focused regression group after changes (command below) | 64 passed, 0 failed |
| After changes: `node --test tests/validationV2*.test.mjs` | 287 tests: 284 passed, the same 3 failures |
| ESLint on all 10 changed/new JS and test files | Passed, no findings |
| `git diff --check` | Passed; only existing Git LF/CRLF conversion notices |

Focused regression command:

```powershell
node --test tests/validationV2ContractorRuleCorrections.test.mjs tests/validationV2PointFieldApplicability.test.mjs tests/validationV2GmiV32Batch1.test.mjs tests/validationV2GmiV32Batch2.test.mjs tests/validationV2Diagnostics.test.mjs tests/validationV2RealDataCorrections.test.mjs tests/validationV2NonNewMissingPolicy.test.mjs
```

Pre-existing failures, all in `tests/validationV2WorkspaceInspector.test.mjs` and reproduced before and after:

1. Line 7: `normal sidebar width is preserved and shared by the Validator and docked inspector`.
2. Line 34: `workspace shell places a full-height left list beside a shared upper row and full-width bottom dock`.
3. Line 103: `2D map resize invalidation and parent-sized 3D canvas remain in place`.

These are existing source/layout assertions against the workspace UI; their tests and UI files were left untouched. Full-suite exit status remains 1 because of these failures. There are no additional failures from this pass. The baseline, final and focused test logs are in the machine's temporary directory as `validator-before-20261107.log`, `validator-after-20261107.log`, and `validator-focused-after-20261107.log`.

## Limitations and manual browser checks

- No real contractor delivery was supplied as a task attachment, and no Gemini VA import or browser acceptance session was performed. Verification used deterministic Validator tests and the repository's existing synthetic/regression fixtures.
- The inspected date evaluators previously accepted only dotted and compact dates; neither accepted a datetime spelling. Both formats are preserved. No speculative datetime syntax was added, and the existing calendar-year interpretation was retained.
- The existing GUT/Bredde plausibility review for 0–19 mm is preserved. The correction changes Tema applicability and missing severity, not that independent numeric threshold.
- A production build was not run; verification was scoped to Validator tests and changed-file lint.

Recommended browser checks:

1. Open the contractor GMI in Validator and inspect Datafangstdato `2026-05-28`: confirm PASS when chronology permits and confirm the original spelling in Fildata. Check a dotted/compact value, an impossible date and a future date as controls.
2. Inspect GUT with Bredde `1600`, missing Bredde and malformed Bredde: confirm PASS, SJEKK and FEIL respectively in the rule list, field inspector and object rows. Repeat missing Bredde on a NYTT object.
3. For each of LOK and GUT, inspect `OVER_GRUNN`, `PÅ_GRUNN_VANNOVERF` and `UNDER_GRUNN`: confirm PASS, PASS and SJEKK. Confirm missing/unsupported values still give FEIL.
4. Confirm the explanatory rule text and existing status colors/icons remain consistent across the rule list, inspector and Fildata. Check KUM/UNDER_GRUNN still passes and LOK missing Bredde still fails.

## Terminal summary

Validator-only corrections complete on `feature/photo-workspace`.
Focused tests: 64/64 passed. Full Validator regression: 284/287 passed, with the same three pre-existing workspace-layout failures. Changed-file lint and diff whitespace checks passed.
Changed files: seven Validator source files, three test files, and this report (11 total), listed above. No commit or push.
