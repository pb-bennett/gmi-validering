# Summary

Implemented Validator 2.0 v3.2 Batch 1 foundation and common field policies. Batch 2–4 policy families remain inactive.

# Architecture changes

The runner now exposes immutable compact per-object outcomes, schema-owned findings, and run reference-date identity. `CHECK` is an explicit evaluation state.

# Result/outcome model

User-facing results are Pass, Sjekk, and Feil. Structural uncertainty maps to owning Sjekk controls. Outcomes retain ObjectRef, rule/field ownership, state, reason, and optional suppression metadata.

# Tema/S_FCODE gate

Tema uses the existing resolver plus a validated gate. Missing and invalid identity are Feil; disagreement between individually valid sources is Sjekk; invalid supplied identity wins over disagreement. The resolver never selects a disagreement winner.

# Schema coexistence behavior

One Sjekk schema finding is emitted only for a geometry schema that contains both Tema and S_FCODE. It is layer/revision/schema-owned and never copied to objects. Point/line schemas remain isolated.

# Common rules implemented

Implemented policies for Innmålt_av, Saksnummer, Høydereferanse, Målemetode, MålemetodeHøyde, Nøyaktighet, NøyaktighetHøyde, Stedfestingsforhold, Eier, Vertikalnivå, MaksAvvikVertikalt, MaksAvvikHorisontalt, InnvendigUtvendig, Merknad, NOBB-VAVVS-nr, and retired Synbarhet.

# Fildata/UI changes

Fildata reads completed outcome records and keeps a Pass/Sjekk/Feil breakdown for each delivered-value bucket. It no longer re-evaluates a field and applies the first object’s acceptance to equal values.

# Fixture/oracle corrections F01–F03

Added exact Batch-1 manifest expectations and a headless oracle test. Repaired the point clean LOK row’s Byggemetode and Adkomst values. Committed synthetic GMI bytes are ISO-8859-1 with LF newlines; hashes use raw bytes and tests use the upload decoder.

# Tests activated

`validationV2GmiV32Batch1Oracle.test.mjs` asserts 15 exact fixture outcomes, geometry-local coexistence, and invalid-over-conflict Tema precedence.

# Existing tests updated

Synthetic integrity tests now decode fixture bytes through `decodeGmiBytes`, the same ISO-8859-1 path used by FileUpload.

# Deferred Batch 2–4 work

Point applicability/history, Type compatibility policy, line shape/dimension policy, and hydraulic classification remain deferred and inactive.

# Known limitations / unresolved decisions

The gravity Tema inventory and line Tykkelse decimal policy remain unresolved as recorded in the manual. Later-fixture oracle families are intentionally pending.

# Validation results

Focused synthetic/oracle tests and A3 Tema resolver tests pass (22 tests). The
legacy A5/A8.1 suites still assert the retired 45-rule baseline, old outcome
vocabulary, and old result shapes; their required migration is not complete.

# Completion pass

Migrated A5, A8.1 result workflow, A8.1 Field Info, and the old Batch-1
policy test to the active 19-rule Batch-1 registry. The migrated tests preserve
ObjectRef/layer/revision ownership, immutable outcomes, CHECK-aware count
equations, schema-owned coexistence findings, stale result rejection, lazy and
bounded Fildata, contextual Fildata outcome breakdowns, filtering/sorting, and
one-run/two-tabs behavior.

The full relevant command is:

`node --loader ./tests/esmJsLoader.mjs --test tests/validationV2*.test.mjs`

The focused migrated Batch-1/A3/fixture suite passes: 36 tests, 0 failures.
The complete command currently reports 191 tests: 118 passed and 73 failed.
Those failures are classified as deferred later-batch assertions: point
applicability, Type compatibility, Bredde/Lengde and other conditional point
fields, line shape/dimension, and hydraulics. The remaining A6/A7/A8 failures
are stale historic baseline assertions that still name old outcome vocabulary,
45/38/21 totals, or inactive later-batch controls; they do not indicate a
Batch-1 runtime defect.

# Files changed

Validation contracts, runner, policy evaluator, registry, Fildata/presentation plumbing, upload decoding, synthetic fixture metadata/bytes, fixture tests, Batch-1 oracle tests, and this report.
