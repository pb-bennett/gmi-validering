# Buttons and workspace headers: focused consistency pass

Completed 2026-11-15. Baseline: branch `feature/photo-workspace`, HEAD `a185dbb` (`refactor(wizards): unify export and positioning navigation`), clean tracked tree. The four existing untracked planning/review reports and UI-review asset directory were left untouched.

## Implementation decisions

- Replaced the Rettinger and FOTO workspace exit arrows with top-right Regular Phosphor X controls, labelled `Lukk Rettinger` and `Lukk FOTO`. Kept the exact `exit` and `onExit` handlers. Removed the old arrow's reserved indentation from title/status rows. Workspace widths, scrolling, selections and state owners are unchanged.
- Reused `PhotoIconButton` and its tooltip hook for all three workspace exits: Validator's existing 32px hit area, 18px Regular icon, 8px radius, neutral resting colour, restrained surface hover, pressed shading and teal focus ring. Validator's working header structure remains intact; only its button adopts the existing tooltip component instead of native title text. Added stable `data-workspace-close` hooks.
- Refined existing `.gmi-compact-button` and `.gmi-primary-control` recipes with pointer/disabled treatment and distinct pressed feedback. Neutral interaction rules use low specificity outside the component cascade layer so a resting background utility cannot suppress hover; module, semantic and selected styles retain ownership. Shared hover excludes disabled/ARIA-disabled, selected, destructive and primary controls. No palette or global selected-colour decision was introduced.
- Scoped FOTO secondary interaction rules now exclude destructive controls, preventing ordinary teal hover from overriding semantic danger. Delivery GMI/GML/Ikke badges, validation severities and golden-yellow compact warnings retain their existing tokens and semantics.
- Map toolbar buttons reuse the existing tooltip hook, including icon-only sharing/overflow appearances, without changing placement or handlers. Map/3D buttons gain explicit pressed state and Regular Phosphor icons at their existing 14px size. Existing map overlap is deliberately unchanged.
- Photo import now matches the established modal footer family: 40px buttons, teal forward and navy final commitment with a leading Regular Check icon. Reused the same navy/ink colour mixes as delivery/positioning final actions. No stage, import, cancellation or commitment logic changed. Recent delivery/positioning and compact Rettinger footer geometry and behaviour remain unchanged.
- No permanent instructional text needed removal within these control edits. Meaningful warnings, confirmation details and contextual status remain. No export internals, correction algorithms, source/session data, Data Table geometry or legacy workflow were changed.

## Exact changed files

- `src/app/globals.css`
- `src/components/MapPaneToolbar.js`
- `src/components/TabSwitcher.js`
- `src/components/gmi-edit/GmiEditWorkspace.js`
- `src/components/gmi-edit/gmiEdit.css`
- `src/components/photos/PhotoImportWizard.js`
- `src/components/photos/PhotoWorkspaceCollection.js`
- `src/components/photos/photoCollectionPanel.css`
- `src/components/photos/photoTheme.css`
- `src/components/photos/photoWorkspace.css`
- `src/components/validation-v2/ValidationV2Workspace.js`
- `tests/deliveryWizardUi.test.mjs`
- `tests/gmiEditDraftGuardUi.test.mjs`
- `tests/gmiEditSelectionUi.test.mjs`
- `tests/gmiEditValidationUi.test.mjs`
- `tests/gmiEditWorkspaceUi.test.mjs`
- `tests/gmiLayerFiltersUi.test.mjs`
- `tests/gmiPhotoPlacementsUi.test.mjs`
- `tests/gmiRettingerSidebarUi.test.mjs`
- `tests/gmiValidatorSelectionHandoffUi.test.mjs`
- `tests/helpers/photoSourceWorkflow.mjs`
- `tests/layerDataTableGeometryUi.test.mjs`
- `tests/mapTeardownUi.test.mjs`
- `tests/photoCompletionUi.test.mjs`
- `tests/photoDirectionLayerUi.test.mjs`
- `tests/photoExportFlowUi.test.mjs`
- `tests/photoExportReturnUi.test.mjs`
- `tests/photoImportWizardUi.test.mjs`
- `tests/photoLoadedGmiUi.test.mjs`
- `tests/photoManualPlacementUi.test.mjs`
- `tests/photoMarkerProvenanceUi.test.mjs`
- `tests/photoSpatialUi.test.mjs`
- `tests/photoWorkspaceEditUi.test.mjs`
- `tests/photoWorkspacePass1dUi.test.mjs`
- `tests/photoWorkspaceStacksUi.test.mjs`
- `tests/photoWorkspaceUi.test.mjs`
- `tests/rettingerPhotoVisibilityUi.test.mjs`
- `tests/buttonConsistencyUi.test.mjs`
- `docs/agent-reports/20261115-144136-button-workspace-consistency-completion.md`
- `docs/agent-reports/assets/20261115-144136-button-consistency/before-FOTO-1280x720.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/before-FOTO-1366x768.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/before-Rettinger-1280x720.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/before-Rettinger-1366x768.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/before-Validator-1280x720.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/before-Validator-1366x768.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/after-FOTO-1280x720.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/after-FOTO-1366x768.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/after-Rettinger-1280x720.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/after-Rettinger-1366x768.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/after-Validator-1280x720.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/after-Validator-1366x768.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/final-review-footer-1280x720.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/final-review-footer-1366x768.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/navigation-export-review-1280x720.png`
- `docs/agent-reports/assets/20261115-144136-button-consistency/navigation-export-review-1366x768.png`

Most existing test-file edits only update the intentional workspace accessible-name/selector change. The FOTO control regression now expects the X treatment. Import rendering coverage adds the second laptop size, final icon/navy colour and equal footer heights. Safety assertions are retained.

## Verification

Passed:

- Node: `node --test --test-concurrency=1 "tests/photo*.test.mjs" "tests/gmi*.test.mjs" tests/deliveryWizard.test.mjs tests/mapPaneToolbar.test.mjs`: **1,127 passed, 0 failed, 130 skipped**, 1,257 total. Includes correction/session, source identity, byte-preserving export, positioning/import and delivery safety contracts. Skips are environment-gated browser/private-corpus cases; they are not claimed as real-file acceptance.
- Fresh `npm run build`: passed. Final production build log: `gmi-buttons-build-final.log`.
- Production Chrome, serial, `PHOTO_UI_URL=http://localhost:3210`, screenshot variables `PHOTO_SCREENSHOT_DIR`, `GMI_EDIT_SCREENSHOT_DIR`, `DELIVERY_SCREENSHOT_DIR` set to the temporary `gmi-button-consistency` directory: **123 passed, 0 failed, 0 skipped**. Exact command:

```powershell
node --test --test-concurrency=1 tests/buttonConsistencyUi.test.mjs tests/photoWorkspaceEditUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/gmiEditWorkspaceUi.test.mjs tests/gmiValidatorReturnUi.test.mjs tests/gmiValidatorSelectionHandoffUi.test.mjs tests/photoRemovalConfirmationUi.test.mjs tests/photoDeliveryExclusionUi.test.mjs tests/wizardNavigationUi.test.mjs tests/deliveryWizardUi.test.mjs tests/photoImportWizardUi.test.mjs tests/gmiBatchInspectorUi.test.mjs tests/gmiBatchRiskGateUi.test.mjs tests/gmiIndividualSelectionUi.test.mjs tests/rettingerPhotoVisibilityUi.test.mjs tests/photoMarkerProvenanceUi.test.mjs tests/layerDataTableGeometryUi.test.mjs tests/mapTeardownUi.test.mjs
```

- Actual computed-style coverage: all three X controls have identical geometry, radius, colour and surface; labels/tooltips have no native title; hover and pressed differ, keyboard focus is teal, Enter closes Validator, unavailable Undo keeps its tooltip/accessibility and no enabled hover, selected map choice remains persistent. Import final action has navy colour, leading icon and 40px footer heights. Existing positioning/export and compact batch suites check footer order, geometry and teal/navy colours at both laptop sizes.
- Regression coverage retains FOTO three-state cycling, independent shared occurrences, marker selection versus status changes, inspector sync, removal Escape/cancel/focus restoration/explicit removal, transactional photo edits, Rettinger fresh previews/risk approval/individual editing, draft guards, selection, undo/redo, Validator handoff/return, stale-plan refusal, report and verified package downloads, import and positioning commitments, map lifecycle and protected table geometry.
- `npx --no-install eslint` on changed JS/MJS files excluding the baseline-failing toolbar, plus the new browser suite: **0 errors, 0 warnings**. Log: `gmi-buttons-eslint-focused-final.log`.
- `git diff --check`: passed. Report inventory, relative screenshot links and unchanged HEAD verified.

Baseline failure (not silently waived):

- ESLint including `src/components/MapPaneToolbar.js` reports **one `react-hooks/set-state-in-effect` error** at the existing `setOverflowOpen(false)` in its pane-mode effect. Reproduced on untouched HEAD via `git show HEAD:src/components/MapPaneToolbar.js | npx --no-install eslint --stdin --stdin-filename src/components/MapPaneToolbar.js`. Baseline and working-copy logs: `gmi-buttons-eslint-baseline.log`, `gmi-buttons-eslint.log`. The failing lifecycle code is unchanged; no suppression or unrelated effect refactor was introduced.

Resolved development-check failures:

- Baseline capture helper initially used an unavailable collapsed layer-analysis entry; switched to the existing Rettinger-to-Validator entry. New tooltip assertions initially expected a tooltip role even when its text duplicated the accessible name; the existing helper intentionally hides that duplicate from assistive technology. The assertion now checks the visible tooltip and retains the accessible-name checks.
- An immediate import colour assertion caught the 120ms transition before settling; it now waits 200ms before measuring. The keyboard helper now sends Enter's carriage-return text as the established CDP tests do. Final assertions still require the intended computed colour and actual keyboard closure.
- Full initial workflow run: 81 passed, 1 failed (the timing assertion above). Final expanded run: 123 passed. No safety assertion was weakened.

Warnings/limits: existing Browserslist data-age and Node module-type warnings remain. Dependencies were not changed. Private-corpus and manual screen-reader acceptance were not run.


## Evidence and remaining checks

Synthetic fixtures only; no contractor/private data used. Production captures before/after show each workspace at both laptop sizes. Visually reviewed the new headers, import commitment and positioning footer; automated geometry checks cover the remaining wizard stages.

| Workspace | Before 1280 | After 1280 | Before 1366 | After 1366 |
|---|---|---|---|---|
| FOTO | [before 1280x720](assets/20261115-144136-button-consistency/before-FOTO-1280x720.png) | [after 1280x720](assets/20261115-144136-button-consistency/after-FOTO-1280x720.png) | [before 1366x768](assets/20261115-144136-button-consistency/before-FOTO-1366x768.png) | [after 1366x768](assets/20261115-144136-button-consistency/after-FOTO-1366x768.png) |
| Rettinger | [before 1280x720](assets/20261115-144136-button-consistency/before-Rettinger-1280x720.png) | [after 1280x720](assets/20261115-144136-button-consistency/after-Rettinger-1280x720.png) | [before 1366x768](assets/20261115-144136-button-consistency/before-Rettinger-1366x768.png) | [after 1366x768](assets/20261115-144136-button-consistency/after-Rettinger-1366x768.png) |
| Validator | [before 1280x720](assets/20261115-144136-button-consistency/before-Validator-1280x720.png) | [after 1280x720](assets/20261115-144136-button-consistency/after-Validator-1280x720.png) | [before 1366x768](assets/20261115-144136-button-consistency/before-Validator-1366x768.png) | [after 1366x768](assets/20261115-144136-button-consistency/after-Validator-1366x768.png) |

Modal footer evidence: [final-review-footer 1280x720](assets/20261115-144136-button-consistency/final-review-footer-1280x720.png), [final-review-footer 1366x768](assets/20261115-144136-button-consistency/final-review-footer-1366x768.png), [navigation-export-review 1280x720](assets/20261115-144136-button-consistency/navigation-export-review-1280x720.png), [navigation-export-review 1366x768](assets/20261115-144136-button-consistency/navigation-export-review-1366x768.png).

Remaining visual inconsistencies: known map toolbar/test-mode overlaps, older layer-analysis icons/native-title controls and legacy modal/header differences remain outside this focused pass. No new framework or layout redesign was attempted. Existing workspace density and module-specific selected treatments are preserved. Basemap tiles may still be loading in some captures; assertions and evidence concern the controls.

Minimal manual acceptance: close FOTO with a pending photo edit and choose Continue, then save/discard and close; close Rettinger with a draft and cancel the guard; Tab through the three workspace X controls and one import/export final action. Automated synthetic coverage does not replace real-file acceptance or screen-reader testing.

No staging, commit, push, deployment, ref changes or subagents. Temporary logs/screenshots are under `C:/Users/furr_/AppData/Local/Temp/`, prefix `gmi-buttons-` and directory `gmi-button-consistency`. Final server lifecycle recorded below.

Stopped only the task-owned production server after the final browser run. HEAD remains `a185dbb`; all task changes are unstaged.
