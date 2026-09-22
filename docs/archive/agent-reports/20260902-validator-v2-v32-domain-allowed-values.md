# Validator 2.0 v3.2 Slice 7 — domain-list allowed values

**Date:** 2026-09-02  
**Branch:** `feature/validator-v2-v32-baseline`  
**Base HEAD:** `155193f`  
**Scope:** line Material, point Tema, and line Tema strict current-v3.2 lists only

## Material

The existing `innmaling.line.material.required` rule now uses strict
`REQUIRED_ALLOWED_VALUE` evaluation with the authoritative **45-value** v3.2
Material list from Appendix A pp. 19–21. Required presence remains unchanged.
`PVC-O` and the exact `PE100-RC-PP0` pass; legacy `PVC-0` fails. Material is
not used for hydraulic classification or applicability.

## Point Tema

The existing `innmaling.point.tema.required` rule now validates the exact
authoritative **81-code** point-Tema list from Appendix A pp. 10–12. The
existing conservative Tema resolver remains authoritative: direct `Tema` is
preferred, `S_FCODE` is the sole accepted fallback, and direct/fallback
disagreement remains indeterminate. No aliases or normalization were added.

## Line Tema

The existing `innmaling.line.tema.required` rule now validates the exact
authoritative **108-code** line-Tema list from Appendix A pp. 16–19. All five
current provisional codes pass normally: `LEBEKXX500`, `LEBEKXX510`,
`LEBEKXX511`, `LEGRØXX500`, and `LEKAXX500`.

Values absent from v3.2 fail automated validation, including `XF`, `XG`,
`XGP`, `XGS`, `XK`, `12`, `12D`, `121`, `120`, and `12P`. No replacement,
normalization, trimming, case folding, or punctuation rewriting is performed.

## Tests, counts, and verification

- Independent test oracles now pin the documented v3.2 Appendix A lists by
  exact contents and length: **Material 45 / point Tema 81 / line Tema 108**;
  the tests do not import production domain arrays for these assertions.
- Point and line Tema Field Info now assert exact `byGeometry.valueInfo` key
  parity and per-value Appendix A provenance (`10–12` and `16–19`); unlisted
  or legacy values are rejected by the exact key-set assertions. Existing
  Material `valueInfo` parity/provenance coverage is preserved.
- Registry counts remain **24 active / 17 point-applicable / 21 line-applicable**.
- Focused Validator A5/A8/A8.1 tests: **58/58 passed**.
- Full repository suite: **263/263 passed** (`node --test tests/*.test.mjs`).
- `npm run build`: **passed**.
- `git diff --check`: **passed** (only normal LF-to-CRLF warnings from Git).
- Tests cover complete lists, exact/near-miss behavior, required missing/null/
  blank states, direct and fallback Tema resolution, conflicts, geometry and
  layer isolation, Field Info provenance/list parity, and result/count
  reconciliation.

No unresolved issue. No commit or push was performed.
