# R5 — Validator corrections in integrated Rettinger

Date: 2026-11-10, Europe/Oslo. Branch: `feature/photo-workspace`. Starting HEAD: `1927111`; working tree initially clean. No commit, push or deployment was performed.

Implemented R5 only. `Lag retting…` retains `prepareValidatorCorrection` and its M2 eligibility calculation, and now opens the existing right-hand batch inspector with exactly the prepared objects selected. The legacy modal remains available through the ordinary `Masseendringer` footer action. Final manual acceptance with a real delivery is outstanding.

## Files changed

| File | Change |
| --- | --- |
| `src/lib/gmiValidatorEditing.mjs` | Identity-only acceptance helper `validatorCorrectionSelection`, plus a Norwegian stale-source explanation. No new eligibility mechanism. |
| `src/lib/gmiEditSelection.mjs` | Validator-origin selections are shrink-only through the shared reducer; explicit conversion removes provenance without changing membership. |
| `src/lib/store.js` | Validated, guarded handoff; atomic replacement of selection; transient mounted draft-guard callback and deferred-refusal message. |
| `src/components/validation-v2/ValidationV2Workspace.js` | Existing prepared correction goes to the workspace; reports a refused handoff. Does not close the inspection table before acceptance. |
| `src/components/gmi-edit/GmiEditWorkspace.js` | Opens the integrated inspector for corrections; synchronises geometry; resets inspector configuration for a new accepted handoff; registers the established draft guard. Ordinary footer modal remains. |
| `src/components/gmi-edit/GmiBatchInspector.js` | Recommended initial field, locked while Validator provenance is active. Empty value and existing fill-missing default. Initial recommendation alone is not a dirty draft. |
| `src/components/LayerDataTable.js` | Validator provenance/count, explanation and explicit conversion action; retains the bar for an empty restricted selection. Avoids an irrelevant cross-geometry replacement prompt while restricted. |
| `tests/gmiValidatorEditing.test.mjs` | Exact selection, field, layer, session, fingerprint and source-object refusal cases. |
| `tests/gmiEditSelection.test.mjs` | All shared widening paths, shrinking, empty restriction, forbidden re-addition and explicit conversion. |
| `tests/gmiEditWorkspace.test.mjs` | Atomic guarded handoff, cancellation preservation, acceptance, no automatic session mutation, deferred stale-session refusal and removed-source refusal. Existing navigation fixture supplies the complete handoff identity. |
| `tests/gmiValidatorEditingUi.test.mjs` | Migrates the M5C production workflow to the integrated surface; exact source indices, no modal/preview/automatic staging, exclusions, widening refusal, conversion, Original/Foreslått identity, staging/history, inspection and laptop layout. |
| This report and `assets/20261110-gmi-r5/` | Completion record and two synthetic production screenshots. |

## Handoff and selection architecture

The existing correction preparation remains the sole authority for eligible targets. Acceptance resolves the registry's live handle, then verifies the correction layer, exact immutable session, session ID, document object, document fingerprint, handle fingerprint and intact source bytes. Each prepared line/sourceIndex must exist in the immutable document and imported layer, with matching object ID and GUID. Empty, duplicate, mixed-geometry and impossible targets fail closed. Supported rule/field mapping must match.

The accepted selection uses the existing `gmiEditSelection` binding `{ layerId, sessionId, fingerprint }`, `scope: 'line'`, source-index keys and `showOnly: true`. Its `origin` stores `kind: 'validator'`, rule, recommended field, a copied original target snapshot and the same binding. No parallel membership collection or filter-based target calculation was introduced. The Data Table opens on Ledninger in Original; its existing selected-only derivation bypasses search/filter/view hiding. Original/Foreslått switching preserves the same source-index membership.

The common reducer refuses any operation whose result adds a key to the current Validator selection, including toggle, bulk add, sorted range and explicit geometry replacement. A removed original target cannot be re-added implicitly. Clear/removing the last object retains an empty restricted selection and provenance. `show-only` and read-only object inspection do not remove the restriction. Only `make-ordinary`, reached through `Gjør om til vanlig utvalg`, removes it; this keeps the selected keys and display preference intact. The bar shows `Fra Validator: N objekter` and explains that only removal is allowed.

Before context mutation, `openGmiEditWorkspace` validates the handoff and invokes the mounted workspace's existing draft guard when applicable. Cancelling never runs the continuation and preserves workspace, selection, view and table state. Approval rechecks the handoff before mutation, since source/session state may have changed while the dialog was open. A deferred refusal is shown in the previous workspace. Immediate refusals remain in Validator with an explanation. Registry reconciliation and existing selection binding cleanup continue to invalidate selections on source/session loss.

## Reused R4 behavior

The inspector starts with the recommended field, an empty value, fill-missing mode, no review and no newly staged ChangeSet. The user enters a value and uses the existing R4 **Forhåndsvis endringer** action (the current UI label for the requested calculation step). Nothing calculates on handoff.

`prepareGmiBatchReview`, `gmiSelectionTargets`, `planGmiInspectorBatch`, `buildGmiBatchSelection` and registry staging remain the existing preview/approval path. SDR, Trykklasse and Ringstivhet still use M2 eligibility with exact selected targets. Manual override authorization, populated-value restrictions, risk confirmation, conflict replacement, stale preview detection, source-safe export and undo/redo are unchanged. No generic explicit-target batch builder was introduced. Existing staged corrections are retained.

No validation rule, severity computation, accepted rule-card presentation, patch engine, ChangeSet engine, FOTO/delivery logic, Gemini WFS, map-click selection, general table styling or sidebar restructuring was changed. `GmiBatchDialog` itself was not modified or removed.

## Verification

| Gate | Result |
| --- | --- |
| Relevant Node suites: `node --test tests/gmiEdit*.test.mjs tests/gmiValidatorEditing.test.mjs tests/gmiBatchInspector.test.mjs tests/gmiR4UxPolish.test.mjs tests/validationV2Workspace*.test.mjs` | **173 tests: 161 pass, 3 baseline failures, 9 skips.** All new R5 cases pass. |
| Production browser, serial: `gmiBatchInspectorUi`, `gmiEditSelectionUi`, `gmiR4UxPolishUi`, `gmiEditWorkspaceUi`, `gmiEditBatchUi`, `gmiEditValidationUi`, `gmiEditDraftGuardUi` | **57/57 pass.** Ordinary batch editing, modal compatibility, manual risk, source-safe export, undo/redo and draft cancellation included. |
| Updated `gmiValidatorEditingUi` against the final production build | **7/7 pass**, including parent; no runtime exceptions; synthetic input bytes unchanged. |
| Full serial suite: `node --test --test-concurrency=1 tests/*.test.mjs` | **2,025 tests: 1,908 pass, 7 baseline failures, 110 skips.** |
| Targeted ESLint, all changed source/test files | **0 errors**, one existing TanStack `react-hooks/incompatible-library` warning. |
| `npm run build` | **Pass**, compilation, TypeScript and static generation. |
| `git diff --check` | **Pass**, ordinary LF/CRLF notices only. |

The seven full-suite failures match the R4 documented baseline: `appInfoUiContract` (1), `statsUiContract` (2), optional external-corpus `terrainPhotoGml` (1), and `validationV2WorkspaceInspector` (3). The last three are also the only failures in the relevant Node gate. No new regression remains in the executed gates.

During implementation, one existing store-navigation fixture failed because its old synthetic correction omitted the identity now required at acceptance; it now supplies that complete identity. The first edited browser run also caught an incorrectly encoded Norwegian test label; it was corrected before the final passing run. No safety assertions were removed.

Logs in `%TEMP%`: `r5-node.log`, `r5-store.log`, `r5-browser-gate.log`, `r5-validator-ui-final.log`, `r5-full-node.log`, `r5-eslint.log`, `r5-build.log`.

## Layout and remaining limitations

Production tests assert that the page has no horizontal overflow and that the inspector, selection bar and grid stay inside the viewport at **1366×768** and **1280×720**. Both screenshots were visually inspected. The bar wraps its controls, and the inspector's proposal and approval remain visible. The existing table retains its own column scrolling when the dataset is wider than its viewport; its geometry/styling was not redesigned.

- [1366×768 preview and restricted selection](assets/20261110-gmi-r5/r5-inspector-1366x768.png)
- [1280×720 preview and restricted selection](assets/20261110-gmi-r5/r5-inspector-1280x720.png)

Tests use synthetic files. This is automated implementation verification, not real-file manual acceptance or deployment acceptance. Real assistive-technology testing remains outstanding as in R4. R6, R7 and R8 remain deferred.

## Exact manual acceptance after deployment

1. At 1366×768, import a real GMI file containing a supported missing SDR, Trykklasse or Ringstivhet finding. Open Validator on **Original**, then open that finding.
2. First use its existing **Vis** action: confirm this opens inspection only. Return to the finding and select **Lag retting…**.
3. Confirm Rettinger opens on the correct layer and Ledninger, **Bare valgte** is pressed, exactly the finding's prepared targets are checked, and the right-side integrated inspector is open. No batch modal should appear. Check the `Fra Validator` count, fixed recommended field, blank **Ny verdi**, fill-missing mode, absence of a preview and absence of a new ChangeSet.
4. Switch to **Filtrert visning**. Try an unrelated row checkbox, Shift+click/Shift+Space range and both select-all controls. The selection must not grow. Uncheck one target; it must shrink. Attempt to re-check it; the restriction must remain. Check **Original/Foreslått** without losing identities. Use **Bare valgte** to return to the remaining targets.
5. Enter a suitable value and choose **Forhåndsvis endringer**. Review the exact row outcomes and proposal. Uncheck an object if needed, and confirm it contributes no staged value or new findings. Use **Legg til masseendring**, explicitly approving any risk dialog. Only the remaining approved objects should change.
6. Use **Vis i Foreslått**, inspect values and ChangeSet details, then undo and redo. Confirm Original is unchanged and no stale preview can be approved. If exporting, inspect the revised GMI through the established source-safe export flow.
7. Repeat a handoff, explicitly choose **Gjør om til vanlig utvalg**, verify membership does not change immediately, then confirm that ordinary checkbox/select-all operations can add objects. Verify the ordinary footer **Masseendringer** modal still works.
8. With an unsubmitted value, choose **Åpne Validator** or another existing context-changing action. Cancel the draft dialog and verify the value, selection and inspector remain intact; approve only when ready to discard the draft. Return through Validator and create a fresh handoff.
9. Repeat the core handoff/review/approval flow at **1280×720**, including one keyboard-only pass. Confirm the bar, inspector actions and Data Table remain usable. Replace/remove/reimport the source and verify old selection/session state is not reused.

Do not mark R5 manually accepted until these checks pass with the real delivery.
