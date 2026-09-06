# Independent review: Validator 2.0 v3.2 point numeric/lexical validation

**Date:** 2026-09-04
**Reviewer workflow:** Sol Medium, direct review only; no delegation
**Checkpoint:** `feature/validator-v2-v32-baseline` at `6c10bca`
**Authoritative material:** source-first plan and Luna implementation report for this slice

## Verdict

**NOT APPROVED FOR COMMIT** because the focused test does not independently pin the two new stable reason-code strings. This is one low-severity test-contract finding. No functional production defect was found in the integer evaluator, rules, runner, binding, geometry isolation, applicability isolation, Field Info, or Fildata implementation.

## Findings

### Low — New stable reason-code values are not independently asserted

Location: `tests/validationV2GmiV32PointNumericLexical.test.mjs:19`, with new-code expectations at lines 196, 214, 221, and 318.

The focused test imports `RuleReasonCode` from the production API and compares evaluator/results against `RuleReasonCode.VALUE_NOT_INTEGER` and `RuleReasonCode.NUMERIC_PRECISION_UNAVAILABLE`. If either exported string and all production consumers were changed together by mistake, the test would remain green. It therefore verifies internal consistency, but not the independently specified stable API values `VALUE_NOT_INTEGER` and `NUMERIC_PRECISION_UNAVAILABLE`.

Consequence: an accidental typo or coordinated rename of either new machine-readable reason code could pass the focused test and alter downstream API behavior undetected.

Narrow remediation: make the focused test compare the new reason-code outputs to literal expected strings, or add independent assertions that the two exported enum members equal those literals. Existing reason-code preservation cases may continue to use their established constants if desired; the new public contract values must be pinned independently.

## Evaluator and grammar assessment

`evaluateIntegerFormat()` is a single, narrow evaluator shared by the production runner and Fildata. Its exact PROJECT grammar is `^[+-]?[0-9]+$`. The implementation does not describe that grammar as verbatim STANDARD syntax.

When a source lexeme exists, it is authoritative and is tested without trimming, numeric conversion, parsing, comma/dot conversion, sign normalization, or leading-zero normalization. The accepted and rejected lexical sets match the plan. Real GMI whitespace-only input retains the existing missing-value behavior and becomes `NOT_EVALUATED`.

The no-lexeme fallback is also correct:

- strings use the same exact grammar;
- finite safe JS integers pass, including runtime `1000.0` because its spelling is unrecoverable;
- finite fractions and non-finite numbers fail;
- unsafe finite JS integers become `INDETERMINATE`;
- unsupported runtime representations fail.

The runner dispatches `INTEGER_FORMAT` explicitly. No generic regex/schema framework was added, existing evaluator behavior was not changed, and registry invariants reject evaluator/category mismatches, `allowedValues`, `valueComparison`, relationship payloads, and relationship inputs on integer-format rules.

## `NUMERIC_PRECISION_UNAVAILABLE` assessment

1. A distinct stable reason code is justified. No existing reason describes a bound, present runtime number whose exact source integer cannot be established because lexical evidence is absent and the JS value is unsafe.
2. The code expresses uncertainty rather than a source-backed range violation and is returned with `INDETERMINATE`, not `FAIL`.
3. It is consistently declared in contracts, produced by evaluation, propagated into findings/results, mapped by Fildata through the shared evaluator to `Må vurderes`, and exercised by both fields. The finding above concerns independent pinning of the string, not production consistency.
4. The name is somewhat broad, but its current use is not semantically misleading and does not create a demonstrated API inconsistency. A rename is not justified on style alone.
5. Reusing `UNRESOLVED_SOURCE`, `SCHEMA_UNAVAILABLE`, or `BINDING_AMBIGUOUS` would be less accurate: source binding and schema can be resolved while only numeric precision evidence is insufficient.

## Binding assessment

The rules reuse `extractGmiObjectFieldValue()` and the existing canonical binding. They add no lookup, alias, trim, fuzzy, or semantic mapping.

- `Bredde` remains the direct point-width key; a unique Unicode case-only form follows the existing binding/conflict policy.
- `DIM`, `DIMENSJON`, `Dimensjon`, and `DIAMETER` do not bind point `width`.
- `Lengde` remains the direct point-length key; a unique case-only form follows the same existing policy.
- `LENGTH`, `Lengde_mm`, and `LENGD` do not bind `length`.

## Lengde geometry-isolation assessment

The length rule receives only canonical field evidence for the current point ObjectRef. It never receives coordinates, geometry, calculated feature length, another field, Bredde, or line evidence. Rule scope is point-only. Focused tests vary surrounding line geometry with absent Lengde and confirm that malformed supplied point Lengde remains failed. Polygon data has no evaluator path into the rule.

## Applicability-isolation assessment

Neither new rule nor the integer evaluator imports or consumes `pointFieldApplicability.js`, and Tema is not an evaluator input. Focused tests produce the same malformed-value outcome for applicable, not-applicable, unknown, missing, and conflicting/unresolved Tema cases. No unexpected-field rule or finding was introduced.

The independently observed policy remains metadata-only at revision `2026-09-04.3`, with 88 cells: 71 `APPLICABLE`, 9 `NOT_APPLICABLE`, and 8 `UNKNOWN`. It contributes zero active rules and zero result rows.

## Field Info assessment

Both entries use `appliesTo: ["point"]`, `documentationStatus: "PARTIAL"`, documented format `Heltall`, unit `mm`, no allowed-values list, and only the corresponding audit rule ID.

The Norwegian wording correctly distinguishes optional-if-present automation from global STANDARD requiredness. `required: false` / `requiredness: NOT_REQUIRED` is presented as a property of the active rule, while qualifications explicitly state that the rule does not make the field globally optional/required. Bredde documents supplied width/diameter, unresolved polygon-related requiredness, and rejection of `DIAMETER` as an alias. Lengde documents a supplied point property, separate requiredness/representation scope, and no geometry derivation.

## Fildata assessment

Fildata imports and invokes the production `evaluateIntegerFormat()`; there is no duplicate grammar. State mapping is correct: `PASS` → `Gyldig`, `FAIL` → `Ugyldig`, `INDETERMINATE` → `Må vurderes`, and `NOT_EVALUATED` → `-`. Existing field extraction retains exact lexemes and layer/object/revision ownership. No lexical source values were added to telemetry or global result summaries.

## Test-quality assessment

Apart from the reason-code independence finding, the focused test uses independent literal rule IDs, counts, accepted/rejected lexical cases, bindings, and field identities. It covers both fields for direct, preferred-direct, unique case-only, ambiguity, forbidden aliases/near matches, missing values, real-parser whitespace-only input, signs, zero, leading zeros, decimals, comma decimals, exponents, surrounding whitespace, malformed tokens, runtime values, unsafe integers, geometry scope, applicability independence, ownership, Field Info, and all four Fildata states.

The real parser path constructs `_FIELDNAMES` / `_FIELDVALUES`, asserts the preserved `sourceLexeme`, and proves that real GMI `1000.0` fails. The separate runtime-number path proves that JS number `1000.0` passes when lexical spelling is unavailable.

All changed regression-test edits are legitimate +2 universe updates. The A7 list adds exactly the two new point rule IDs in registry order and its targeted file passes 8/8. No unrelated assertion was weakened.

## Independently observed counts

- Active rules: **31**
- Integer-format rules: exactly `innmaling.point.width.integer` and `innmaling.point.length.integer`
- Point-applicable rules/result rows: **24**
- Line-applicable rules/result rows: **21**
- RuleResult rows per run: **31**
- Applicability active rules/result rows: **0 / 0**

## Zero unintended impact and documentation

The changed production-file set is exactly the expected seven files. There are no changes to the parser, `objectFieldValue`, canonical field registry, point applicability metadata, Tema resolver, Type/Tema compatibility semantics, existing point-code semantics, line/common rules, telemetry, deployment/configuration, or database code. Existing result ownership and reuse paths remain intact.

The source-first plan and implementation report agree with the implementation. The implementation report correctly states the starting HEAD, two-rule scope, shared evaluator, lexical and runtime fallback behavior, Field Info/Fildata integration, 31/24/21 counts, untouched applicability metadata, no geometry-derived Lengde, initial 312/313 stale-A7 checkpoint followed by 313/313, successful build/diff check, and no commit/push. Both reports decode as valid UTF-8 and contain no mojibake.

## Verification performed by this review

- `node --test tests/validationV2GmiV32PointNumericLexical.test.mjs`: **18/18 passed**.
- Targeted A7 + Field Info + applicability run: **26/26 passed**, including A7 **8/8**.
- Independent registry/result/applicability probe: **31 / 24 / 21**, 31 result rows, policy **88 / 71 / 9 / 8**, zero applicability result rows.
- Malformed integer-rule invariant probe: all tested malformed variants rejected.
- `git diff --check`: **passed**; only Git's expected future LF→CRLF warnings were emitted.
- Full suite and build were **not rerun**, per the review instruction not to repeat Luna's recorded successful 313/313 suite and successful build merely for ceremony.

## Commit readiness

Production behavior is ready, but the slice is **not approved for commit** until the low-severity independent reason-code assertion gap is corrected and the focused test rerun. No fix was implemented during this review.

## Closure review

**Date:** 2026-09-04
**Scope:** Closure of only the low-severity test-contract finding above; direct review with no delegation and no production changes

### Closure verdict

**CLOSED — no remaining findings.**
**APPROVED FOR COMMIT.**

The original finding is closed. The focused test now defines the stable expected values independently as the literal strings `VALUE_NOT_INTEGER` and `NUMERIC_PRECISION_UNAVAILABLE`. New reason-code outcomes are compared against those test-owned literals rather than values obtained from the production `RuleReasonCode` object. The remaining production-enum comparisons in the file cover pre-existing reason codes and do not weaken this independent contract pinning.

No new findings were identified.

### Preserved implementation state

Inspection and the focused test confirm no production behavior changed during remediation. The production state remains:

- exactly two integer-format rules: `innmaling.point.width.integer` and `innmaling.point.length.integer`;
- 31 active rules, 24 point-applicable rules/result rows, 21 line-applicable rules/result rows, and 31 `RuleResult` rows per run;
- applicability policy revision `2026-09-04.3`, with 88 cells: 71 `APPLICABLE`, 9 `NOT_APPLICABLE`, and 8 `UNKNOWN`, and zero applicability rules/result rows;
- exact integer grammar `^[+-]?[0-9]+$`;
- production reason codes exactly `VALUE_NOT_INTEGER` and `NUMERIC_PRECISION_UNAVAILABLE`.

The implementation report records the original Sol test-contract finding, independent literal pinning of both new reason-code strings, and that remediation made no production behavior change.

### Closure verification

- `node --test tests/validationV2GmiV32PointNumericLexical.test.mjs`: **18/18 passed**.
- `git diff --check`: **passed**; only the previously expected future LF→CRLF warnings were emitted.
- Full suite and build were **not rerun**, because inspection revealed no concrete functional reason and the requested checkpoint preserves the previously recorded **313/313** full suite and successful build.
- This closure review changed only this review report. No implementation changes were made during closure review.

### Commit readiness

The original test-contract finding is closed, there are no remaining findings, and the reviewed slice is approved for commit. No commit or push was performed.
