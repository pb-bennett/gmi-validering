# Rettinger Batch 2 wizard completion

Completed 2026-11-15. Scope: S1 and Rettinger parts of S5 from [the wizard-navigation audit](20261115-121829-wizard-navigation-workflow-audit.md).

## Baseline and outcome

- Verified repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `94e1bf5` (`fix(foto): secure removal cancellation and simplify delivery controls`). Tracked working tree was clean. S0 + S3 were already committed. HEAD and branch remain unchanged.
- Added one sticky footer for setup, preview and staged states. Actions are grouped bottom-right in Cancel / Back / Forward order, with status or blocking text on the left where space permits. At compact widths status wraps above the action group. Every footer button is 30px tall.
- Preserved `.gmi-edit-inspector` as the only scrolling pane. A content wrapper and minimum-height flex layout keep the footer on the same bottom edge with short content; sticky positioning keeps it visible with long content. The footer occupies layout space so the last content is accessible at maximum scroll.
- Back uses the existing `invalidate()` operation: setup field/value/mode/match remain, while review, table review, risk, manual inclusions and replacement approval are cleared. Removed retained-preview state, the alternate route to an old preview and its explanation. Forward always calls the existing calculation path.
- Stale previews retain the existing warning and have one footer refresh action, with no staging control. Existing full-control and staging gates remain intact. Calculation, validation, approval, correction and staging algorithms were not changed.
- Footer Cancel uses the exact existing `onRequestClose` handler and draft guard. After staging it says Close. Header navigation and duplicated in-content actions were removed. The object-detail close action is now labelled by its effect.
- Moved the individual-editing entry to the existing Data Table selection bar, beside the batch action/indicator. It uses the existing `gmiBatchInspectorRequest` channel with an individual intent and invokes the existing itinerary entry and draft guard. No new toolbar row, selection owner or itinerary implementation was added. Validator table entry behavior remains unchanged.
- Forward/preview keeps the host teal primary. Final add restores the existing navy primary recipe within this footer and adds a Regular Phosphor Plus icon, as explicitly authorized in this task. This is scoped to Batch 2 and does not settle the global primary-colour policy. Hover/pressed colours derive from existing tokens. Risk-dialog warning styling and approval logic remain; only its cancel label changed to Cancel.
- No FOTO, export/import/positioning wizard, Validator implementation, export internals, validation policies or source-byte logic changed. The separate legacy batch dialog remains.

## Exact changed files

- `src/components/LayerDataTable.js`
- `src/components/gmi-edit/GmiBatchInspector.js`
- `src/components/gmi-edit/GmiEditWorkspace.js`
- `src/components/gmi-edit/gmiEdit.css`
- `tests/gmiBatchFieldValueInputUi.test.mjs`
- `tests/gmiBatchInspectorUi.test.mjs`
- `tests/gmiBatchReplaceClearUi.test.mjs`
- `tests/gmiBatchRiskGateUi.test.mjs`
- `tests/gmiCheckboxSoftFocusUi.test.mjs`
- `tests/gmiFieldValueSearchUi.test.mjs`
- `tests/gmiIndividualSelectionUi.test.mjs`
- `tests/gmiLayerFiltersUi.test.mjs`
- `tests/gmiLinkedTemaUi.test.mjs`
- `tests/gmiObjectLinkedTemaUi.test.mjs`
- `tests/gmiR4UxPolishUi.test.mjs`
- `tests/gmiS5FocusContinuityUi.test.mjs`
- `tests/gmiSelectionProfileUi.test.mjs`
- `tests/gmiValidatorEditingUi.test.mjs`
- `tests/gmiValidatorReturnUi.test.mjs`
- `docs/agent-reports/20261115-132711-rettinger-batch2-wizard-completion.md`
- `docs/agent-reports/assets/20261115-132711-rettinger-batch2/a1-setup-1280x720.png`
- `docs/agent-reports/assets/20261115-132711-rettinger-batch2/a1-setup-1366x768.png`
- `docs/agent-reports/assets/20261115-132711-rettinger-batch2/a1-preview-1280x720.png`
- `docs/agent-reports/assets/20261115-132711-rettinger-batch2/a1-preview-1366x768.png`
- `docs/agent-reports/assets/20261115-132711-rettinger-batch2/a1-staged-1280x720.png`
- `docs/agent-reports/assets/20261115-132711-rettinger-batch2/a1-staged-1366x768.png`
- `docs/agent-reports/assets/20261115-132711-rettinger-batch2/a1-conflict-1280x720.png`
- `docs/agent-reports/assets/20261115-132711-rettinger-batch2/a1-conflict-1366x768.png`
- `docs/agent-reports/assets/20261115-132711-rettinger-batch2/a1-stale-1280x720.png`
- `docs/agent-reports/assets/20261115-132711-rettinger-batch2/a1-stale-1366x768.png`

## Verification

### Passed

- `node --test --test-concurrency=1 "tests/gmi*.test.mjs"`: **350 passed, 0 failed, 39 skipped**, 389 total. This covers the correction/session, selection, batch, approval, validation and source-safety regression contracts.
- `npm run build`: passed, including a fresh final build after the footer hover/pressed styling. Production server started on a free port, 3210.
- Final serial production Chrome command (environment `PHOTO_UI_URL=http://localhost:3210` and `GMI_EDIT_SCREENSHOT_DIR=C:/Users/furr_/AppData/Local/Temp/gmi-batch2-screenshots`):

```powershell
node --test --test-concurrency=1 tests/gmiBatchInspectorUi.test.mjs tests/gmiBatchRiskGateUi.test.mjs tests/gmiS5FocusContinuityUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/gmiIndividualSelectionUi.test.mjs tests/gmiSelectionProfileUi.test.mjs tests/gmiTableReviewUi.test.mjs tests/gmiBatchReplaceClearUi.test.mjs tests/gmiBatchFieldValueInputUi.test.mjs tests/gmiCheckboxSoftFocusUi.test.mjs tests/gmiFieldValueSearchUi.test.mjs tests/gmiLayerFiltersUi.test.mjs tests/gmiLinkedTemaUi.test.mjs tests/gmiObjectLinkedTemaUi.test.mjs tests/gmiR4UxPolishUi.test.mjs tests/gmiValidatorEditingUi.test.mjs tests/gmiValidatorReturnUi.test.mjs
```

Result: **96 passed, 0 failed, 0 skipped**. Coverage includes:

- All footer stages, conflict and stale states at 1280x720 and 1366x768: same bottom edge, button order/heights, visibility, unchanged scroll owner and no obscured final content.
- Back preserves setup inputs including exact replacement match; unchanged setup recalculates; changed setup yields the changed proposal. Back removes the previous proposal and table review.
- Manual permission and per-row inclusion reset; replacement approval resets and blocks staging until renewed. Existing risk information, selection/session identity, stale checks and full-control gates remain enforced.
- Draft-aware Cancel, post-stage Close, risk approval/cancel, individual itinerary entry from the selection bar, selection preservation, undo/redo and exact approved exported spans.
- Keyboard focus at the proposal, footer order and Back-to-field focus; accessible action names, computed teal forward and navy commit colours, decorative commit icon. Existing table geometry/focus, selection narrowing and Validator handoff/return regression checks pass.
- `npx --no-install eslint` on all changed JS/MJS files: **0 errors, 1 warning**. The warning is `react-hooks/incompatible-library` for the unchanged TanStack `useReactTable` call at `LayerDataTable.js:715`. Verified independently against HEAD with `git show HEAD:src/components/LayerDataTable.js | npx --no-install eslint --stdin --stdin-filename src/components/LayerDataTable.js`, which emits the same warning. No lint rules were suppressed.
- `git diff --check`: passed. Report file inventory and screenshot links verified.

### Development failures, resolved

The first focused browser run exposed two errors in newly added tests: returning a DOM assignment through CDP attempted to serialize the React object graph, and replacement-input values were captured after the setup form had unmounted. Corrected the test mechanics. A subsequent broad run had one stale selector still looking for Refresh inside the old content block (94 passed, 2 failed including the parent); updated it to the stable footer hook. The final 96-test run passes. Safety assertions were preserved and extended.

### Skipped and remaining checks

The 39 skipped cases in the environment-free Node run are environment-gated browser/private-corpus cases. The 17 listed production browser files subsequently ran without skips. Private corpora and unrelated browser suites were not run. No claim of real-file/manual acceptance is made.

Build emits a Browserslist data-age warning; Node emits module-type warnings. Dependencies are unchanged.

Remaining manual acceptance: representative large-selection recalculation latency, a real-file conflict/stale round trip at laptop size, and assistive-technology reading of footer status and focus. Synthetic automated tests and screenshot review cover the implemented workflow; they do not substitute for these manual checks. No known failing checks remain.

## Screenshots

The following synthetic-fixture screenshots were visually inspected at both laptop sizes. They show the existing selection bar entry and the compact footer without introducing a new toolbar row. Original screen captures stay in the temporary task folder; the selected evidence is copied here.

| State | 1280x720 | 1366x768 |
|---|---|---|
| Setup | [Screenshot](assets/20261115-132711-rettinger-batch2/a1-setup-1280x720.png) | [Screenshot](assets/20261115-132711-rettinger-batch2/a1-setup-1366x768.png) |
| Preview | [Screenshot](assets/20261115-132711-rettinger-batch2/a1-preview-1280x720.png) | [Screenshot](assets/20261115-132711-rettinger-batch2/a1-preview-1366x768.png) |
| Staged | [Screenshot](assets/20261115-132711-rettinger-batch2/a1-staged-1280x720.png) | [Screenshot](assets/20261115-132711-rettinger-batch2/a1-staged-1366x768.png) |
| Conflict | [Screenshot](assets/20261115-132711-rettinger-batch2/a1-conflict-1280x720.png) | [Screenshot](assets/20261115-132711-rettinger-batch2/a1-conflict-1366x768.png) |
| Stale | [Screenshot](assets/20261115-132711-rettinger-batch2/a1-stale-1280x720.png) | [Screenshot](assets/20261115-132711-rettinger-batch2/a1-stale-1366x768.png) |

## Git, scope and artifacts

No staging, commit, push, ref changes or deployment. No subagents. Stopped only the task-owned production server after verification. The four pre-existing untracked planning/review reports and `assets/20261114-221747-ui-unification-review/` remain untouched.

Temporary command logs: `C:/Users/furr_/AppData/Local/Temp/gmi-batch2-node.log`, `gmi-batch2-browser-final.log`, `gmi-batch2-build-final.log`, `gmi-batch2-eslint-final.log`, `gmi-batch2-eslint-baseline.log`. All fixtures were synthetic. No contractor/reference data was modified or copied.
