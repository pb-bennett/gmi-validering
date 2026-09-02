# Validator 2.0 v3.2 Slice 4 — code-text fallback policy

**Decision-analysis date:** 2026-09-02  
**Scope:** p.25 code-text fallback policy only; no implementation, source/test changes, commit, push, build, or test run  
**Repository checkpoint:** `feature/validator-v2-v32-baseline` at `eeec07b`
**Audit trail:** Initial Slice 4 analysis checkpoint: `eeec07b`; explicit product/domain-owner decision made after commit `7854f04`

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

## Explicit Validator 2.0 product/domain-owner policy

The distinction is explicit: p.25 permits same-field explanatory text when no suitable code exists, but the delivered source remains ambiguous about the scope and machine representation of that fallback. The product/domain owner nevertheless chooses the following automated validation policy:

- Only values in the authoritative current v3.2 code list pass automated code validation.
- Any non-empty value outside the current list, including explanatory p.25 text and legacy values absent from v3.2, fails automated code validation and is flagged for manual validation.
- This does not mean explanatory text necessarily violates the Innmålingsinstruks; it means Validator 2.0 cannot automatically verify it.
- Required missing or blank values continue to fail required-field validation.
- Optional coded fields may be absent, but if supplied their value must be in the current v3.2 list to pass.
- Current provisional codes included in the v3.2 list pass normally.
- Validator 2.0 must never silently normalize, rewrite, or substitute legacy or unlisted values.

This is a deliberate product policy for automated validation, not a claim that every unlisted explanatory value is substantively non-conforming under p.25.

## Consequences for Slices 5–8

### Slice 5 — measurement allowed values

Implement strict allowed-value closure under the explicit product policy. Code `97` passes `Målemetode` if it is in the current list, but fails `MålemetodeHøyde` if absent from that list and is flagged for manual validation. No legacy or explanatory value is normalized or substituted.

### Slice 6 — Vertikalnivå allowed values

`I_VANNSØYL` passes as the authoritative current token. The legacy `!_VANNSØYLEN` value fails automated code validation and is flagged for manual validation; it is not normalized.

### Slice 7 — non-hydraulic domain lists

Material, point Tema, line Tema, and optional-if-present Type use strict current-list validation. Current listed values pass, including provisional Tema codes. Known old Tema tokens and legacy Material `PVC-0` fail automated code validation and are flagged for manual validation; no replacement may be inferred.

### Slice 8 — Type and Tema compatibility

Evaluate Type↔Tema incompatibility only when both values pass current-list validation. If either supplied value fails code validation, retain that failure and manual-validation flag; do not normalize, substitute, or report a compatibility result that assumes an unlisted value is valid.

## Required decisions

The product/domain owner has decided the policy above. Implementation must define the failure/manual-validation representation and stable reason codes for unlisted values, while preserving the distinction between source meaning and automated verifiability.


## Conclusion

Slice 5 is now **unblocked for strict allowed-value implementation under this product policy**. p.25 itself permits explanatory fallback text, the source remains ambiguous about its scope and representation, and the domain owner has explicitly chosen to fail all supplied values outside the authoritative current v3.2 list and flag them for manual validation. Required blanks still fail, optional coded fields are valid only when absent or supplied with a current code, and no value is silently normalized or substituted.
