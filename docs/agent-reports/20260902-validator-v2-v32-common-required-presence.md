# Validator 2.0 v3.2 — Slice 3 common required presence

**Date:** 2026-09-02  
**Branch:** `feature/validator-v2-v32-baseline`  
**Scope:** Slice 3 only

Implemented three independent common required-presence rules:

- `measurementMethod` / `Målemetode`
- `heightMeasurementMethod` / `MålemetodeHøyde`
- `verticalLevel` / `Vertikalnivå`

Each rule uses `REQUIRED` with no allowed values and `ValueComparisonPolicy.NONE`. Missing bindings, null and empty values retain the existing required-field state semantics; arbitrary present values pass. Point and line scopes are both evaluated through the existing binding/ObjectRef architecture.

The corresponding Field Info entries document v3.2 provenance and explicitly state that code values are not enforced in this slice. No 69/35/7 lists, numeric lexical policy, p.25 fallback, classification, conditional, geometry or later-slice behavior was enabled.

Registry result: **24 active rules / 17 point-applicable / 21 line-applicable** (14 common, 3 point-only, 7 line-only).

Focused A7/A8/A8.1 regressions cover independent absent/missing/present behavior, arbitrary non-list values, registry metadata, Field Info authority, presentation counts and geometry isolation.

## Verification

- Focused A7/A8/A8.1 tests: **38/38 passed**.
- Full repository tests: **257/257 passed**.
- `npm run build`: passed.
- `git diff --check`: passed.

The final diff review found no allowed-value constants or comparison behavior for these fields, no numeric lexical policy, no p.25 fallback, no binding expansion and no later-slice validator behavior. No commit or push was performed.
