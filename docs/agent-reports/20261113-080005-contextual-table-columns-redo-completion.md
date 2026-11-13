# Contextual table columns and redo visibility: completion

Repository: C:/GitHub/gmi-validering-test. Branch: feature/photo-workspace. Starting HEAD: 677f783. Implementation only; no staging, commit, push, deployment or Git ref changes. The three existing untracked planning reports were left untouched.

## Changes and decisions

- LayerDataTable now derives its temporary focus from the existing workspace handoff's canonical field and geometry. It reuses the same canonical registry metadata and bound-column resolver as Validator inspection, including accepted source aliases. The resolver was exported without changing its implementation.
- The existing applyColumnFocus path places that field after fixed selection/identity columns. The handoff context takes priority over transient batch/detail focus for its geometry, so staging and Original/Foreslaatt switching preserve the relevant field. The existing focus toggle/manual column ordering behavior remains available. Leaving the handoff/workspace returns to saved ordinary ordering; no saved order, attribute order or source data is rewritten. Ordinary tables without a Validator context retain their existing review-focus behavior.
- Both existing data-gmi-context-redo buttons receive scoped styling: pointer cursor, semibold text, a stronger underline, token-based hover background/color/shadow, and an explicit focus-visible outline. No padding, height or font-size increase; notification/sidebar dimensions remain compact. No callbacks or ChangeSet identity/availability/guard logic changed.

Changed application files:

- src/components/LayerDataTable.js
- src/components/gmi-edit/gmiEdit.css
- src/lib/validation-v2/tableInspection.js (export existing presentation helper only)

Changed tests:

- tests/gmiR4UxPolish.test.mjs: canonical/alias binding, Original/proposed values, immutable saved order and restoration.
- tests/gmiValidatorSelectionHandoffUi.test.mjs: field placement at both sizes, staging the point field, switching Original/Foreslaatt and restoration on workspace exit.
- tests/gmiRettingerSidebarUi.test.mjs: both redo controls' computed pointer/hover/focus styles at both sizes; keyboard activation of both locations while retaining identity and draft-guard assertions.

## Verification

Passed:

- Focused Node command: node --test tests/gmiR4UxPolish.test.mjs tests/objectTableInspection.test.mjs tests/gmiValidatorEditing.test.mjs tests/gmiEditWorkspace.test.mjs tests/layerTableRows.test.mjs tests/layerTableReveal.test.mjs tests/gmiRettingerSidebar.test.mjs: 87 tests, 86 passed, 1 failed baseline contract, no skips.
- Additional Node: node --test tests/gmiValidatorSelectionHandoff.test.mjs tests/gmiEditSelection.test.mjs tests/gmiEditValidation.test.mjs tests/gmiIndividualSelection.test.mjs: 25 passed, zero failed/skipped.
- Final production browser command, with PHOTO_UI_URL=http://localhost:3123 and GMI_EDIT_SCREENSHOT_DIR pointing to OS temp: node --test --test-concurrency=1 tests/gmiValidatorSelectionHandoffUi.test.mjs tests/gmiRettingerSidebarUi.test.mjs tests/gmiEditSelectionUi.test.mjs tests/layerDataTableKeyboardUi.test.mjs tests/layerDataTableGeometryUi.test.mjs tests/layerTableRevealUi.test.mjs tests/gmiIndividualSelectionUi.test.mjs: 41 passed, zero failed/skipped.
- Browser coverage includes 1280x720 and 1366x768, point/line handoffs, stale-source refusal, late row reveal, fixed identity columns, sorting/search/filtering, keyboard selection/navigation, ordinary table restoration, redo identity, both contextual keyboard activations and existing draft guards.
- ESLint on all five changed JS/MJS files: zero errors, one TanStack useReactTable incompatible-library warning. The identical warning was reproduced by linting the untouched starting commit in a temporary archive. CSS changes use existing tokens and were checked through the production build and computed browser styles.
- Fresh npm.cmd run build passed after the final application changes. Initial restricted build could not fetch Google Fonts; reran with network permission, retaining existing font/configuration/dependencies.
- git diff --check passed after final edits.

Baseline failure:

- gmiRettingerSidebar.test.mjs, R6B source-contract assertion expects the older select({ scope: request.scope, sourceIndex: request.sourceIndex }) call. The same failure was reproduced by running the unchanged test against an untouched git archive of 677f783 in OS temp. No test assertion was relaxed. Other Node and final browser checks passed.

Resolved implementation/verification failures:

- An initial duplicate handoff selector ran before layerId initialization and caused a client exception. Removed it and reused the existing workspaceHandoff selector; rebuilt and reran the complete browser set successfully.
- The first redo test expected a visible outline but the inherited utility used a box-shadow ring. Added an explicit token-based focus-visible outline, rebuilt and verified both controls successfully. No remaining new failures.

## Browser review and limits

Inspected captured screenshots of the focused point field at 1280x720, the staged ID value in Foreslaatt at 1366x768, and both contextual redo locations with keyboard focus at 1280x720. Automation also captures the corresponding other viewport. The field is visible directly after identity controls, the row remains revealed, and the compact sidebar/notification retains usable scrolling. Hover and focus are verified using real Chrome input and computed styles; both actions restore the same ChangeSet id.

Synthetic fixtures only. No private delivery files or real-file manual acceptance; no full-suite claim. Remaining optional manual acceptance: repeat the original delivery's Innvendig/utvendig correction, inspect title/tooltips with preferred assistive technology, and confirm the modest redo emphasis in the user's normal theme. No known new issues remain in this scope.

Logs: OS temp gmi-context-node.log, gmi-context-regressions.log, gmi-context-browser-verified.log, gmi-context-build.log, gmi-context-baseline-node.log and gmi-context-baseline-lint.log. Screenshots: OS temp gmi-context-screenshots. Only this task's production server (port 3123) was started/stopped. The baseline archive was used for Node/lint evidence only, with no repository branch changes.

No Validator rules, correction eligibility, ChangeSet engine/semantics, GMI source bytes, FOTO or export implementation changed. Final working tree consists of the six implementation/test files above, this report, and the three original untracked planning reports. Work stops here; FOTO exports remain the next priority.
