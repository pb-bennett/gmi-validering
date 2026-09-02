# Validator 2.0 v3.2 baseline implementation

**Date:** 2026-08-31  
**Branch:** `feature/validator-v2-v32-baseline`

## Scope

Implemented only the approved minimum correction baseline from planning report sections 16–17. No NEW or DEFERRED v3.2 validation rules were introduced. No production configuration, deployment, merge, rebase, commit, or push was performed. `REF_FILES/` was not modified.

## Files changed

- `src/lib/validation-v2/registry/rules.js`
- `src/lib/validation-v2/registry/fieldInformation.js`
- `src/data/validation-v2/field-information.json`
- `tests/validationV2GmiA7.test.mjs`
- `tests/validationV2GmiA8.test.mjs`
- `tests/validationV2GmiA81FieldInfo.test.mjs`
- `tests/validationV2GmiA81ResultsWorkflow.test.mjs`

## Rule and Field Info changes

- Active registry changed from 23 to 19 rules.
- Point-applicable changed from 17 to 14; line-applicable changed from 18 to 16.
- Removed active validation for Synbarhet, point NOBB-VAVVS-nr, point NOBB-VAVVS-nr-ramme, and line NOBB-VAVVS-nr. Canonical fields remain available informationally.
- Updated line Nett_type to the exact v3.2 set `F`, `H`, `O`, `O1`, `O2`, `S`, `S6`, `S7`. Exact comparison behavior remains unchanged.
- Refreshed surviving executable provenance to v3.2 physical source pages.
- Migrated Field Info source/version/page metadata to v3.2, added O1/O2/S7 information, marked Synbarhet retired, marked NOBB fields optional, removed retired-rule audit links, updated geometry-specific thickness documentation, and reduced the active Field Info contract to the 17 unique surviving executable fields.
- Field Info remains informational; executable rules remain validation authority.

## Tests and checks

- Complete repository test set: **253 passed, 0 failed**.
- Focused A8/A8.1 tests: passed.
- Added/updated coverage for 19/14/16 counts, retired/optional fields, all eight exact Nett_type values, case/whitespace/punctuation failures, and Field Info v3.2 metadata.
- `git diff --check`: passed.
- `npm run build`: passed.
- `npm run lint`: unavailable in this checkout; `next lint` reported `Invalid project directory ...\\lint` with the installed Next.js version.

## Real-GMI testing

No operational real-GMI fixture was rerun. Tests used existing synthetic/parser fixtures without exposing or adding raw operational data.

## Unresolved issues

No implementation blocker remains for this approved slice. The planning report’s p.25 fallback and later NEW/DEFERRED rule questions remain intentionally out of scope.

## Scope confirmation

No NEW or DEFERRED v3.2 validation rules were introduced. Implementation files outside the approved baseline scope: none.

## Sol Medium independent review/debug

**Review date:** 2026-09-02  
**Review basis:** complete working-tree diff against baseline commit `59c71b3` and the v3.2 rebaseline plan  
**Verdict:** **APPROVED FOR COMMIT**

### Findings

1. Field Info's top-level v3.2 metadata had been refreshed, but every pre-existing `valueInfo` page reference still pointed to the v3.1 layout. This affected Høydereferanse, Stedfestingsforhold, Stedfestingsårsak, the retained historical Synbarhet information, InnvendigUtvendig, the five pre-existing Nett_type values, and Rørform. The new O1/O2/S7 entries alone had v3.2 pages.
2. The reviewed A8 inventory retained page data in its tuples but no longer compared `rule.source`, so stale executable provenance could pass. Several tuple page values were themselves still v3.1 values.
3. Surviving executable provenance omitted relevant main-instruction pages for Nøyaktighet XY/Z, MaksAvvik horisontalt/vertikalt, and Stedfestingsårsak. The corresponding Field Info entries also omitted those main-document sources.
4. The four removed rules remained instantiated in `VALIDATION_RULES` and were filtered out after array construction. `VISIBILITY_VALUES` and a registry-validation exception dedicated to the retired Synbarhet rule consequently remained dead baseline code.
5. No changes to binding, aliases, coercion, selected-layer behavior, ObjectRef/result identity, privacy/telemetry, Testmodus, main/production configuration, or `REF_FILES/` were found in the complete diff.

### Review fixes

- Physically removed the four retired/optional rule definitions, the post-array filter, the unused `VISIBILITY_VALUES` constant, and the retired Synbarhet-specific registry exception.
- Completed executable provenance for all 19 rules and restored an exact `source: rule.source` contract in the reviewed A8 inventory.
- Migrated all Field Info value sources to the verified v3.2 documents/pages and added the applicable main-instruction sources to top-level Field Info metadata.
- Added an exact Field Info provenance contract covering all 20 documented entries and every value in all seven `valueInfo` maps, preventing any stale per-value page from passing unnoticed.
- Retained exactly 19 active rules, with 14 point-applicable and 16 line-applicable. The active Nett_type list remains exactly `F,H,O,O1,O2,S,S6,S7`; Synbarhet and all NOBB fields remain non-executable/informational.

Files changed specifically during Sol Medium review/debug:

- `src/lib/validation-v2/registry/rules.js`
- `src/data/validation-v2/field-information.json`
- `tests/validationV2GmiA8.test.mjs`
- `tests/validationV2GmiA81FieldInfo.test.mjs`
- `docs/agent-reports/20260831-validator-v2-v32-baseline-implementation.md`

### Verification

- Focused modified A7/A8/A8.1 tests: **35 passed, 0 failed**.
- Complete repository Node test suite: **254 passed, 0 failed**.
- `git diff --check`: **passed**.
- `npm run build`: **passed** (compiled, type-checked, generated all static pages).
- `npm run lint`: **not available with the current Next.js 16 setup**. The existing script invokes `next lint`, which reports `Invalid project directory ...\\lint`; project tooling was intentionally not changed.
- Operational real-GMI data was not used. Existing synthetic GMI parser fixtures exercised exact lexical behavior without adding or exposing operational data.

### Remaining issues

No blocker remains for the approved minimum baseline. The planning report's later NEW/DEFERRED rules and unresolved domain questions remain intentionally out of scope and were not implemented.
