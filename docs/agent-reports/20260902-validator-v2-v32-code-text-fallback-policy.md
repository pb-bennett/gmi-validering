# Validator 2.0 v3.2 Slice 4 — code-text fallback policy

**Decision-analysis date:** 2026-09-02  
**Scope:** p.25 code-text fallback policy only; no implementation, source/test changes, commit, push, build, or test run  
**Repository checkpoint:** `feature/validator-v2-v32-baseline` at `eeec07b`

## Source interpretation

Main instruction p.25 states that ledninger and installasjoner are specified using codes from Appendix A and that, when no suitable code exists, an explanatory text must be entered in the same field.

The source does not name the affected fields. The strongest narrow reading is that the statement concerns `Tema` for lines and point installations, together with optional `Type` where it provides more specific installation classification. These fields identify what the ledning or installation is.

A broader reading remains plausible because p.25 refers generally to codes in Appendix A. Under that reading, the fallback could cover every Appendix field whose format is `Kode`, including `Målemetode`, `MålemetodeHøyde`, `Vertikalnivå`, `Material`, and the code fields already validated by Validator 2.0.

The source therefore does not support treating any of the following future lists as unconditionally closed solely because Appendix A prints an allowed-value list:

- `Målemetode`
- `MålemetodeHøyde`
- `Vertikalnivå`
- `Material`
- point and line `Tema`
- `Type`

## Unresolved ambiguity

The documents provide no machine-readable marker or syntax that distinguishes explanatory fallback text from an invalid code. For an unlisted value, case, whitespace, length, punctuation, or apparent natural-language form would only be heuristic evidence. An uppercase word or short token could be either an intended description or a mistyped/obsolete code.

Consequently, the validator cannot reliably distinguish all three of these states from the delivered value alone:

1. an exact current code;
2. legitimate explanatory fallback text; and
3. a genuinely invalid value.

A future convention such as `TEKST: <description>` could make new fallback values distinguishable, but p.25 does not prescribe that convention and existing unmarked deliveries would still need a compatibility policy.

## Recommended Validator 2.0 policy

Until the scope and representation are explicitly decided, apply the conservative broad interpretation to future allowed-value validation:

- An exact current v3.2 code is `PASS`.
- Clearly and unambiguously marked explanatory fallback text is conforming and is therefore `PASS`. It may produce a non-blocking informational note, but must not be an error or reduce the aggregate status.
- An unmarked, non-empty, unlisted value is `INDETERMINATE`, not `FAIL`, because the validator cannot prove whether it is fallback text or an invalid code.
- A missing or blank value in a required field remains an ordinary required-field `FAIL`.
- A genuinely invalid-value `FAIL` requires unambiguous evidence under an agreed representation policy; mere absence from the current list is insufficient while p.25 fallback may apply.
- Known legacy values that are absent from v3.2 are compatibility-accepted and non-blocking, with migration information where an authoritative replacement is available. They must not be silently rewritten or hard-failed solely because the list changed.
- The five official line-Tema values labelled `foreløpig kode` are members of the current v3.2 list and therefore receive normal `PASS`. The source does not authorize a warning.

The current Validator 2.0 result model has only fixed `ERROR` rule severity and does not provide a proper informational or compatibility outcome. Mapping explanatory fallback to an error would contradict p.25. Mapping every unknown value to an undifferentiated ordinary pass would avoid false errors but provide weak validation. A result-model decision is therefore needed before these distinctions can be represented faithfully.

## Consequences for Slices 5–8

### Slice 5 — measurement allowed values

Do not implement strict 69/35-value closure yet. The field-specific numeric lexical policy does not resolve whether non-code explanatory text is permitted or how it should be represented. Code `97` is a current `Målemetode` value but is absent from the current `MålemetodeHøyde` list; a height value of `97` needs agreed legacy/compatibility treatment rather than being silently treated as current or hard-failed.

### Slice 6 — Vertikalnivå allowed values

Do not hard-error every value outside the seven-value v3.2 list. `I_VANNSØYL` is the authoritative current token. The legacy `!_VANNSØYLEN` value requires compatibility treatment rather than automatic rejection or normalization.

### Slice 7 — non-hydraulic domain lists

Material, point Tema, line Tema, and optional-if-present Type need fallback and compatibility outcomes before strict list rules are enabled. Current listed values pass, including provisional Tema codes. Known old Tema tokens and legacy Material `PVC-0` must not hard-fail solely because they are absent from v3.2, and no replacement may be inferred without authority.

### Slice 8 — Type and Tema compatibility

Evaluate Type↔Tema incompatibility only when both values resolve to current listed codes. If either value is explanatory fallback text, legacy-compatible, unknown, or otherwise unresolved, the compatibility check must be `INDETERMINATE` or not evaluated rather than reporting a definite mismatch.

## Required decisions

Before strict allowed-value work proceeds, the product/domain owner must decide:

1. whether p.25 applies only to object-classification fields (`Tema` and possibly `Type`) or to every Appendix `Kode` field;
2. whether future explanatory fallback text requires a reserved marker and how existing unmarked fallback values are treated;
3. which known legacy values are compatibility-accepted, whether migration suggestions are available, and how long compatibility lasts;
4. whether optional code fields are validated when present; and
5. whether unmarked unlisted values should remain indeterminate or receive another explicitly non-blocking product outcome.

The Validator 2.0 result model must then define:

- a non-error informational or compatibility representation;
- its effect on rule and aggregate status;
- stable reason codes for explanatory fallback, legacy-compatible values, and unresolved unlisted values; and
- presentation behavior that does not imply delivery rejection.

## Conclusion

Slice 5 is **not yet safe to implement as strict allowed-value validation**. The source establishes current lists and permits same-field explanatory fallback, but does not settle fallback scope, machine representation, legacy handling, or a suitable non-error result. An explicit product/domain-owner decision and a result-model decision are still required before strict closure can be enabled safely.
