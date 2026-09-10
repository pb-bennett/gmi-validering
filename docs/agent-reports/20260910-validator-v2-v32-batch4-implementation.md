# Summary

Batch 4 completes the final three v3.2 line owners: SDR, Ringstivhet and Trykklasse.

# Architecture

`hydraulicTemaClassification.js` is a small data-driven classifier. The runner resolves Tema first, stores the hydraulic class in the established policy context, then field policies apply Material only for SDR/Ringstivhet.

# Hydraulic classification

All 108 approved line Tema codes are classified exactly once: 17 Gravity, 12 Pressure and 79 Special. Unknown codes return no class.

# SDR

Plain decimal equivalents resolve against the approved domain. Pressure+SDR-family Material requires SDR; the remaining approved contexts follow the settled Pass/Sjekk policy.

# Ringstivhet

Gravity+polymer Material requires an approved SN value. GRP and GUP are included in this family.

# Trykklasse

PN is an exact code enum and depends only on hydraulic Tema.

# Dependency / suppression

Unresolved Tema suppresses hydraulic conclusions. Unresolved/invalid Material suppresses SDR/Ringstivhet applicability. Independently invalid supplied hydraulic values remain Feil.

# Tests added

`validationV2GmiV32Batch4.test.mjs` adds classifier, direct policy, dependency and decoded synthetic-GMI integration coverage.

# Focused and full results

Focused Batch 4: 6 passed, 0 failed. Full validationV2: 175 passed, 0 failed, 0 skipped.

# Files changed

Hydraulic classifier, rule registry, runner context, field policy, Field Info data, owner-inventory tests, Batch 4 tests, and the manual decision document.

# Verification

`git diff --check` passed. No real-corpus smoke was run. No private fixture data was added.

# Final status

No unresolved policy issue. No commit, push, merge, deploy, production, telemetry, or public-fixture-recognition action occurred.
