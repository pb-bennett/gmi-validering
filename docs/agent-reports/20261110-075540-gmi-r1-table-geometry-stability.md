# R1: Data Table geometry stability

Date: 2026-11-10, Europe/Oslo. Repository: `C:\GitHub\gmi-validering-test`.
Branch: `feature/photo-workspace`. Starting HEAD verified: `6bcb572`.
No commit or push. The untracked integrated-workspace planning report was present at the start and was left untouched.

## Root cause and change

The filter-driven effect introduced by `8c4134d` counted visible original points and lines, then wrote the other geometry into `ui.layerDataTable.activeTabByLayer` when the active geometry became empty. Relaxing the filter never restored the user's choice. This made the intermediate empty state in Felt → Material → Skjul alle unexpectedly persistent as a geometry change.

Removed that effect and its now-unused count calculation. Filtering no longer writes a geometry preference. The existing Tema, Type and Felt predicates, row indexing, proposed-view filtering, editing engine and FOTO behavior are unchanged.

An empty table now explains whether no rows match the search, Tema/Felt hides the selected geometry, or the current view has no objects of that geometry. The filter-empty message points to the existing Nullstill action. The ordinary geometry buttons remain available for an explicit switch; no extra cross-geometry count/action was added. The buttons now expose `aria-pressed`, and the table exposes its displayed geometry for browser assertions.

Rettinger entry opens the ordinary table on the workspace layer and sets its geometry from the existing object-list scope (lines when available, otherwise points). Explicit object-list scope changes also use the existing table synchronisation callback. Existing guarded object selection and Validator inspection pinning remain intact. A scope switch does not discard the selected object's form draft; selecting another object still requires the existing discard decision.

The base Felt section initialises from the layer's table preference and follows the displayed geometry when explicitly reopened, including a pinned inspection on the same layer. Its own geometry buttons remain independently usable. While touching LayerPanel, moved its missing-layer return below its existing hooks to resolve four pre-existing targeted ESLint hook-order errors; no filtering logic changed.

## Files modified

- `src/components/LayerDataTable.js`: remove automatic switching; empty state; pressed state and geometry attribute.
- `src/components/LayerPanel.js`: Felt initial/opening geometry; existing hook-order correction.
- `src/components/gmi-edit/GmiEditWorkspace.js`: synchronise table on workspace entry and explicit list-scope changes.
- `tests/layerDataTableGeometryUi.test.mjs`: new production-browser reproduction and persistence assertions.
- `tests/gmiEditValidationUi.test.mjs`: update old scope-switch expectation; assert draft preservation after cancelling object selection.
- `tests/gmiValidatorEditingUi.test.mjs`: begin inspection with ordinary Punkter preference; assert the requested Ledninger inspection and unchanged persisted preference.
- This report.

## Before and after

| Action | Before | After |
| --- | --- | --- |
| Ledninger → Felt/Material → Skjul alle | Switches to Punkter and persists it | Stays on Ledninger; explanatory empty state |
| Material → Vis alle | Remains on Punkter | Ledninger rows return |
| Tema/Ledninger → Skjul alle, then Vis alle | Switches to Punkter | Stays on Ledninger throughout |
| Fresh GMI → Rettinger | List Ledninger, table Punkter | Both Ledninger |
| Explicit Rettinger list-scope switch | Table keeps previous geometry | Table follows the explicit scope |
| Open Felt while table shows Ledninger | Starts on Punkter | Opens on Ledninger |
| Validator contextual inspection while ordinary tab is Punkter | Requested inspection pins its geometry | Still pins requested geometry; ordinary preference preserved |

## Verification

All browser tests used synthetic fixtures and the real production app served with `next start -p 3123`.

| Check | Result |
| --- | --- |
| `node --test tests/gmiEdit*.test.mjs tests/gmiValidatorEditing.test.mjs tests/objectTableInspection.test.mjs tests/tableSearch.test.mjs` | 165 tests: **157 pass, 0 fail, 8 expected skips** |
| Final serial production-browser gate listed below | 74 tests: **71 pass, 0 fail, 3 expected skips** |
| `node --test --test-concurrency=1` without `PHOTO_UI_URL` | 1,972 tests: **1,861 pass, 7 known baseline failures, 104 skips** |
| Targeted ESLint: all six changed JS/MJS files | **0 errors**, one existing TanStack `react-hooks/incompatible-library` warning |
| Production build | **Pass**, compilation, TypeScript and static-page generation completed |
| `git diff --check` | **Pass** |

Production-browser gate: `layerDataTableGeometryUi`, `gmiEditWorkspaceUi`, `gmiEditBatchUi`, `gmiValidatorEditingUi`, `gmiEditValidationUi`, `gmiEditDraftGuardUi`, `photoLoadedGmiUi`, `photoImportWizardUi`, `mapTeardownUi`, `photoWorkspacePass1dUi`, `gmiPhotoAssociationsUi`, and `photoWorkspaceUi`, run with `PHOTO_UI_URL=http://localhost:3123` and `--test-concurrency=1`.

The new R1 test covers fresh Rettinger entry, both explicit list scopes, Felt initially following Ledninger, Felt Material hide/show, Tema line hide/show, unchanged persisted geometry during filtering, table close/reopen and ordinary explicit geometry buttons. Existing exact-object node tests and the strengthened contextual Validator production test cover inspection geometry. The updated M5A browser test verifies scope synchronisation while retaining a draft and the existing selection guard.

The seven full-suite failures match the baseline documented in `20261109-193211-gmi-edit-m5c-validator-integration.md`: `appInfoUiContract` (1), `statsUiContract` (2), optional external-corpus `terrainPhotoGml` (1), and `validationV2WorkspaceInspector` (3). None is introduced by R1.

Environment notes: sandboxed Chrome initially timed out in `Runtime.enable`; browser suites passed when permitted to run outside the sandbox. A sandboxed rebuild could not fetch the existing Google fonts; the permitted production build succeeded. An early browser gate exposed the old M5A expectation that list-scope changes leave the table unchanged; this assertion was updated for the requested R1 behavior and the complete gate passed. A final build was repeated after correcting the Norwegian search-empty text. No dependencies were changed.

Logs: `%TEMP%/gmi-r1-node.log`, `gmi-r1-browser-gate.log`, `gmi-r1-full-serial-final.log`, `gmi-r1-eslint.log`; the final build output was also inspected directly.

## Remaining issues and scope

No unresolved R1 failure. Full-suite baseline failures and the existing TanStack lint warning remain. Optional private/real-corpus browser checks were skipped by their existing gates. Automated production-browser acceptance was performed; manual acceptance on a real user GMI remains available below.

Rettinger's object list continues to ignore Tema/Felt filters, as before. Synchronisation added here is on entry, explicit list-scope changes and existing object selection; table-tab clicks continue to control the table normally. No R2–R8 work, multi-selection, redesign, M5B/M5C implementation change, source-preserving engine change or FOTO behavior change was made.

## Manual browser acceptance

1. Load a real GMI containing both points and lines. Open Data Table and select Ledninger.
2. Open Felt. Confirm Ledninger is initially active. Open Material and choose Skjul alle. Confirm Ledninger stays selected, no rows are shown and the filter-empty explanation appears.
3. Choose Vis alle. Confirm the line rows return and Ledninger remains selected. Repeat with Tema → Ledninger → Skjul alle / Vis alle.
4. With all lines hidden, optionally choose Punkter explicitly, then Ledninger. Confirm both explicit buttons work, and Nullstill restores line rows without changing geometry.
5. Close/reopen the table. Confirm its selected geometry is retained.
6. Load another fresh mixed GMI and enter Rettinger directly. Confirm object list and Data Table both show Ledninger. Switch the object-list scope to Punkter, then Ledninger, and confirm the table follows each action.
7. Start an object draft, switch the list scope, then select another object. Cancel the discard prompt. Confirm the original draft survives and the explicit list/table geometry remains selected. Confirmed object selection should still show the requested geometry and object.
8. In Validator, open an exact/contextual object finding for the other geometry while the ordinary table preference differs. Confirm the requested objects and geometry are displayed even under filters, and returning to the ordinary table retains its ordinary preference.
9. Smoke-test FOTO import, opening an associated photo and returning to the GMI workspace. Confirm the established flow remains intact.
