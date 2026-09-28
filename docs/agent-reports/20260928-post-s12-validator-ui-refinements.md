# Post-S12 Validator and UI refinements — 2026-09-28

## Starting point

- Starting SHA: `93d407f` (`Complete styling convergence`)
- Branch: `feature/styling-overhaul-integrated`
- Purpose: targeted release-preparation refinements after completed S12 convergence.
- Commits covered: `13dc935`, `0b71ad6`, `8e7001b`, `f28f5fb`, and `edf7cae`.

## Validator missing-field policy

The policy keeps explicitly `NYTT` objects strict for selected construction fields. If an object is not explicitly `NYTT`, a missing selected field is reported as SJEKK for review:

- Points: `Byggemetode`, `Kjegle`, `Tykkelse`, `Avst_BunnInnvUnderUtv`.
- Lines: `Tykkelse`, `SDR`, `Ringstivhet`.

Applicability and conditional branches remain in force. Supplied invalid values retain their existing behavior, including FEIL where previously FEIL. Other strict missing fields remain strict. `Anleggsår` behavior is unchanged: missing with `NYTT` is FEIL; missing otherwise is SJEKK. Coverage counts remain presence-based and unchanged. The detailed policy and audit are documented in [the non-new missing-field policy report](20260928-validator-v2-non-new-missing-field-policy.md) and [the existing-object missing-fields audit](20260928-validator-v2-existing-object-missing-fields-audit.md).

## Diagnostic object table

The redundant synthetic `Resultat` column was removed. The inspected field itself keeps the FEIL/SJEKK status fill. Initial diagnostic column order is technical columns, inspected field, `Stedfestingsårsak`, `Merknad`, then remaining ordinary columns. `Stedfestingsårsak` and `Merknad` remain draggable and non-sticky.

A blank `_FIELDNAMES` parser entry had reached TanStack as a column without a valid accessor, causing an accessorFn runtime crash. Empty field names are now excluded during column construction. After the fix, the actual Validator runtime path was manually verified.

## Map view selector

`Kartoversikt` / `3D-visning` moved to the top-centre of the map pane. The right action group remains explicitly top-right, leaving the top-left clear for Leaflet zoom and ruler controls. Selector behavior is unchanged.

## Stats trigger

The existing 1px border now uses GMI Brand Cyan. Its dark Interactive-cyan fill remains. No lifecycle, visibility, or animation behavior changed.

## Profileanalyse short-display support

The target is a normal 1920×1080 laptop and constrained CSS viewports. The large/tall desktop layout remains at 55% map / 45vh profile. Constrained-height layouts use 42% map / 58% profile at heights up to 1000px, and 37% map / 63% profile at heights up to 750px.

The chart now shrinks with its container instead of imposing the previous 300px minimum height. Tooltip placement flips upward when needed and clamps to chart bounds. In constrained-height layouts, tightened profile chrome and padding recover about 40px. When Profileanalyse opens, Tegnforklaring auto-collapses once. The user can reopen it; subsequent renders do not force it closed, and closing Profileanalyse preserves the resulting legend state. Manual laptop review accepted the final layout.

## Verification

- The missing-field policy report records 86 focused policy/severity/diagnostic/regression tests passing and 21 presentation/workflow tests passing (107 total, 0 failed).
- The missing-field policy report records `git diff --check` passing for that change.
- Its build attempt did not complete: Next.js/Turbopack could not fetch Roboto from Google Fonts because the environment could not connect. No project compilation error was reported before this external-resource failure. This is a failed build attempt, not a successful build.
- Diagnostic object table (`0b71ad6`): 26 targeted tests passed; `git diff --check` passed. The final build attempt was blocked by the Google Fonts / Roboto fetch. The actual Validator diagnostic-table runtime path was manually verified after the blank `_FIELDNAMES` fix.
- Map view selector (`8e7001b`): 11 relevant toolbar/shell tests passed; `git diff --check` passed. The build was blocked by the Google Fonts / Roboto fetch. Final positioning was manually reviewed and accepted.
- Stats trigger (`f28f5fb`): 2 Stats UI tests passed; `git diff --check` passed. The build was blocked by the Google Fonts / Roboto fetch. The final cyan-border treatment was manually reviewed and accepted.
- Profileanalyse short displays (`edf7cae`): the final constrained-layout pass had 20 relevant tests pass; `git diff --check` passed; `npm.cmd run build` succeeded. The final 1080p-laptop layout was manually reviewed and accepted.
- This documentation-only change is checked below with `git diff --check`; no tests or build are run for it.

## Files / ownership

- Missing-field policy (`13dc935`): `src/lib/validation-v2/{contracts.js,diagnostics.js,fieldPolicy.js}`; regression updates and new coverage in `tests/validationV2*.test.mjs`, including `tests/validationV2NonNewMissingPolicy.test.mjs`. The two detailed Validator reports contain the audit and policy detail.
- Diagnostic table (`0b71ad6`): `src/components/LayerDataTable.js`, `src/lib/objectTablePresentation.js`, and `tests/objectTableInspection.test.mjs`.
- Map view selector (`8e7001b`): `src/components/MapPaneToolbar.js` and `tests/mapPaneToolbar.test.mjs`.
- Stats trigger (`f28f5fb`): `src/app/page.js` and `tests/statsUiContract.test.mjs`.
- Profileanalyse short displays (`edf7cae`): `src/app/globals.css`, `src/app/page.js`, `src/components/InclineAnalysisModal.js`, `src/components/MapPanePresentationProvider.js`, `src/lib/analysis/profileTooltipPosition.mjs`, `src/lib/workspace/mapPanePresentation.mjs`, and layout/toolbar regression tests.

## Release significance

These are targeted stabilization and usability changes intended to prepare the new Validator/UI branch for a near-term production release. They do not establish production readiness or deployment.

## Final state

- HEAD: `edf7cae` (`Improve profile analysis on short displays`)
- Branch `feature/styling-overhaul-integrated` is pushed (the branch tracks `origin/feature/styling-overhaul-integrated`).
- No source or test files were edited for this documentation task.
- `data/usage/aggregates.json` is local runtime data and is excluded from this report and task changes.
