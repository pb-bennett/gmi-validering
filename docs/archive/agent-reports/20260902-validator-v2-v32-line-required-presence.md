# Validator 2.0 v3.2 Slice 2 implementation

**Date:** 2026-09-02  
**Starting checkpoint:** branch `feature/validator-v2-v32-baseline`, HEAD `fdaf10e`; working tree clean before implementation.

## Scope

Implemented only Slice 2: independent line-only required-presence rules for Material and Tykkelse. Present values are accepted without list, numeric, trimming, coercion, normalization, or hydraulic-class inference.

## Changes

- Added `innmaling.line.material.required` (`material`, line, `REQUIRED`, source Vedlegg A p. 5, 19).
- Added `innmaling.line.wall-thickness.required` (`wallThickness`, line, `REQUIRED`, source Vedlegg A p. 5, 16).
- Updated Field Info to require the executable `material` entry, expose its v3.2 source without an allowed-value list, and identify point/line Tykkelse descriptions and rule provenance separately.
- Review fix: restored Nøyaktighet XY's v3.2 `Heltall` format and added the geometry overlay for line Tykkelse's `Tall` format; point Tykkelse remains `Heltall`.
- Updated focused A7/A8/A8.1 regression fixtures and count contracts.
- Corrected the new Material Field Info entry to store proper UTF-8 Norwegian text and added focused assertions against mojibake recurrence.
- Added a mixed point/line Tykkelse regression proving neither geometry can satisfy the other's required-presence rule.

## Resulting counts

- 21 active rules
- 14 point-applicable rules
- 18 line-applicable rules

## Verification

- Focused A7/A8/A8.1 tests: **37 passed, 0 failed**.
- Complete repository Node test suite (`node --test tests/*.test.mjs`): **255 passed, 0 failed**.
- `npm run build`: **passed**.
- `git diff --check`: **passed**.
- `npm run lint`: unavailable with the existing Next.js 16 `next lint` tooling issue (`Invalid project directory ...\\lint`); tooling was not changed.

## Deferred

Material's 45-value list, numeric/decimal Tykkelse validation, Slice 3 fields, p. 25 fallback policy, conditional/hydraulic rules, Tema/alias/binding changes, Testmodus, production configuration, deployment, merge/rebase, commit, and push remain deferred.
