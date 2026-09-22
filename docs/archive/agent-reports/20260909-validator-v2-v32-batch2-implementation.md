# Summary

Validator 2.0 v3.2 Batch 2 is complete. The final validationV2 checkpoint has 158 passed, 0 failed, and 5 explicit Batch 3 skips.

# Runtime policy completed

Batch 1/2 common, point contextual, history/date, and completed-outcome policies are active. No Batch 3 or Batch 4 runtime policy was added.

# Genuine defects fixed

Merknad now evaluates supplied raw whitespace against the 255 Unicode-code-point limit. Field Info reports Lengde, Utvendig_høyde, and NOBB-VAVVS-nr-ramme as not globally required.

# Point applicability

The independent policy oracle has 128 cells: 104 APPLICABLE, 12 NOT_APPLICABLE, and 12 UNKNOWN.

# Type/Tema

The independent 72-Type and 86-Type/Tema-pair oracle remains active. Contextual Type and compatibility suppression follows resolved Tema identity.

# Conditional point fields

Kumform, Byggemetode, Kjegle, Bredde, Tykkelse, and Avst use explicit Tema applicability and completed Pass/Sjekk/Feil outcomes.

# History/date policy

Common Anleggsår, Datafangstdato, and Stedfestingsårsak owners have fixed-reference regression coverage.

# F07 coverage

All 19 identified F07 regression gaps are covered in the Batch 2 completion matrix.

# F08 coverage

All 32 identified F08 regression gaps are covered in the Batch 2 completion matrix.

# Synthetic oracle

Batch 1 and Batch 2 synthetic oracle suites pass.

# Field Info / Fildata

Metadata and Fildata assert completed contextual outcomes, including same delivered values with different contextual statuses.

# Historic test migrations

PointCodeLists, PointNumericLexical, TypeTemaCompatibility, Batch2 historic tests, A5-A7, and A8 use current owner IDs, CHECK-aware reconciliation, and Pass/Sjekk/Feil vocabulary.

# A8 migration

A8 now asserts the exact active 36-owner Batch 1/2 inventory, measurement partitions, Tema gate, contextual Tykkelse, retired Synbarhet, optional NOBB, Type behavior, geometry filtering, unknown-field isolation, and reconciliation. Active A8: 7 passed, 0 failed.

# Batch 3 deferred tests

The five pending tests are: line Material required/list policy; Material production-domain portion; Nett_type/Rørform real-GMI lexical portion; Nett_type eight-value behavior; and Dimensjon alias/binding portion.

# Full validationV2 suite

`node --loader ./tests/esmJsLoader.mjs --test tests/validationV2*.test.mjs`: 158 passed, 0 failed, 5 skipped.

# Files changed

Runtime field-policy and Field Info metadata, applicability policy/tests, focused Batch 2 regressions, historic migration suites, and this report were updated.

# Known limitations

Batch 3 fields Material, Nett_type, Dimensjon, line Tykkelse, Rørform, and VertikalDimensjon remain deferred. Batch 4 hydraulic policy remains out of scope.

# Batch 2 completion assessment

Complete: all active Validator 2 Batch 1/2 tests pass, only explicit Batch 3 pending tests remain, and `git diff --check` passes.
