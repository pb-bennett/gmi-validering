# Workspace Statistics and Testmodus Correction

Date: 2026-09-14
Branch: `feature/validator-v2-v32-ui-polish`

## Corrections

The Statistikk trigger previously considered only bottom-docked surfaces. A docked right-side Validator inspector therefore left the trigger visible even though the inspector owned the browser workspace's bottom-right corner. Visibility now derives from generic workspace ownership: the map owns that corner only when there is no active right-side surface and no active bottom surface. The existing StatsModal state remains independent, so opening a surface hides only its trigger and does not close an already-open modal.

Testmodus controls disappeared from the upload screen because their only host was MapPaneToolbar, which does not exist before a dataset is loaded. The start screen now hosts the same `TestModeControl` used by MapPaneToolbar. The upload and map branches are mutually exclusive, so only one host is mounted at a time. The component retains its existing hydration and active-Testmodus gate; page-level query activation (`?testmodus=1`) still runs independently of dataset and map mounting.

## Files changed

- `src/lib/workspace/mapPanePresentation.mjs`
- `src/app/page.js`
- `src/components/FieldValidationSidebar.js`
- `src/components/validation-v2/ValidationV2Workspace.js`
- `tests/mapPaneToolbar.test.mjs`
- `tests/statsUiContract.test.mjs`
- `tests/testMode.test.mjs`
- `docs/agent-reports/20260914-workspace-stats-testmode-correction.md`

The Validator workspace reports whether its docked inspector is actually present. The page combines that surface state with the existing generic bottom-surface state; no Validator-only visibility rule or accumulated per-feature hide flags were added. Toolbar breakpoints, map-pane ownership, sidebar and inspector dimensions, upload behavior, and validation semantics were not changed.

## Verification

- Focused toolbar, statistics, Testmodus, and workspace tests: **24 passed, 0 failed**.
- Full Validator V2 suite (`node --loader ./tests/esmJsLoader.mjs --test tests/validationV2*.test.mjs`): **250 passed, 0 failed**.
- Affected adjacent checks: **24 passed, 0 failed**.
- `npm run build`: **passed** (existing stale Browserslist data notice).
- `git diff --check`: **passed**.
- Browser verification: **not completed**. The in-app browser bridge failed to initialize with a session sandbox-state error, so the start-screen and workspace transitions were verified by tests and code inspection, not a live visual run.

No validation semantics were changed. No commit, push, merge, or deployment was performed.
