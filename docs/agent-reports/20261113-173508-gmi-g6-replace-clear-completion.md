# G6 — Exact replacement and clearing: completion

Completed 2026-11-13 on `feature/photo-workspace`, starting/final HEAD `e1d3ff6`. Starting working tree was clean. Read root AGENTS.md (no nested instructions found), development/security/privacy guidance and relevant G1–G5 completion material. The existing G7 intent shape is documented in the G2 completion report and already implemented by ChangeSets; G6 reuses it without a schema change.

## Outcome and decisions

- **Erstatt verdi** is available in the general batch inspector for editable point and line columns. A native labelled select lists distinct exact effective lexemes from the selected source cells, with occurrence counts. Empty strings, whitespace-only values, leading/trailing spaces and case variants remain separate. Quotes, visible `·` space markers and length hints distinguish whitespace. The matching value is selected explicitly; there is no default or free-text approximation.
- Matching reads `getGmiEditCell` through the existing source-cell resolver, including earlier staged corrections. It uses string equality without trimming, case folding or numeric comparison. Only exact matches can enter the ChangeSet; even explicit/manual inclusion cannot force a nonmatch. A missing match is refused. Nonmatching objects and bytes remain unchanged.
- **Tøm verdi** proposes `''` through the same M2 explicit-target or hydraulic eligibility-token path. It hides the new-value control. Cells already missing under the existing `trim() === ''` missing-value policy receive `already-empty`, cannot be included, and remain byte-identical, including whitespace-only cells. The inspector reports them separately and shows the reason in the table; intent exclusion metadata counts them as inapplicable.
- Default applicability, explicit manual applicability approval, prior-correction replacement, populated overwrite, unknown/unvalidated-field and mixed-selection safeguards remain in their existing owners. Technical/source/identifier refusals cannot be overridden. Clearing a field that Validator requires runs the normal object preview and full dataset dry run; new FEIL enters the existing risk confirmation with object-specific reasons. No new confirmation or eligibility mechanism was added.
- Config edits invalidate preview and consent. The existing exact session/selection/plan checks reject stale risk approval. New G6 modes reset to the normal fill mode after staging; established fill/set mode behavior is preserved. The existing shared G5 value controls still supply the replacement value. As before, the UI requires a non-whitespace new value; empty output is available through Tøm verdi. The source-match value itself may be empty or whitespace-only.
- ChangeSets retain `intent.operation`, exact `intent.match`, proposed `intent.value`, source key, scope and exclusion counts. History/staged details identify Erstatt/Tøm using that metadata. All changes remain one undoable ChangeSet; no original file is modified.
- Hydraulic fields continue through `prepareGmiBatchReview`, genuine M2 eligibility and `buildGmiBatchSelection`. G6 only filters that path by exact match or nonempty value. It does not reinterpret hydraulic applicability, including special/unresolved contexts, or rewrite SDR numeric spellings.

No linked Tema/S_FCODE editing, column insertion, legacy-modal removal, rule changes, export-engine changes, dependencies or later milestones were implemented. Ordinary existing Tema behavior remains unchanged; linked Tema remains refused.

## Exact files changed

Application:

- `src/lib/gmiFieldBatchPlan.mjs` — exact selected-value counts, replace/clear preparation and classification, target filtering, existing intent metadata and operation labels.
- `src/lib/gmiEditBatchView.mjs` — optional label prefix for G6 hydraulic ChangeSets; eligibility/build behavior unchanged.
- `src/lib/gmiBatchInspectorView.mjs` — exact-mismatch and already-empty table explanations.
- `src/lib/gmiEditView.mjs` — intent-aware Erstatt/Tøm history titles.
- `src/components/gmi-edit/GmiBatchInspector.js` — operation controls, exact-value picker, clear setup, existing preview/risk integration and operation-aware confirmation text.
- `src/components/gmi-edit/gmiEdit.css` — scoped width/grid treatment for the exact-value picker.

Tests:

- `tests/gmiBatchReplaceClear.test.mjs` — new synthetic planner/safety regressions.
- `tests/gmiBatchReplaceClearUi.test.mjs` — new synthetic production workflow, keyboard, laptop layout and verified download coverage.
- `tests/gmiFieldBatchPlan.test.mjs` — replace the deliberate former unsupported-operation expectations with G6 input checks; retain unsupported-operation coverage using `insert-column`.
- `tests/gmiBatchFieldValueInputUi.test.mjs`
- `tests/gmiBatchInspectorUi.test.mjs`

The last two files only migrate their hydraulic/general batch download checks from the retired `.gmi-edit-export` dialog to M10's Innhold → Kontroll → Pakke flow. Their exact byte and eligibility assertions are retained.

Documentation: this report and four PNGs under `assets/20261113-g6/`, linked below. No tracked fixture, manifest, expected hash or unrelated planning report was changed.

## Verification

Passed:

- Focused engine/inspector gate: `node --test tests/gmiBatchReplaceClear.test.mjs tests/gmiFieldBatchPlan.test.mjs tests/gmiEditDryRun.test.mjs tests/gmiEditChangeSets.test.mjs tests/gmiEditBatch.test.mjs tests/gmiEditValidation.test.mjs tests/gmiBatchInspector.test.mjs tests/gmiEditWorkspace.test.mjs`: **121 total, 119 passed, 0 failed, 2 skipped**. Post-review focused rerun of G6, inspector and workspace: **52 passed, 0 failed/skipped**.
- Final full serial gate: `node --test --test-concurrency=1 "tests/*.test.mjs"`: **2,205 total, 2,077 passed, 0 failed, 128 skipped**. An earlier full run also passed with the same totals; the final run includes the application review corrections and export-test migrations.
- Final fresh `npm.cmd run build`: passed, normal Turbopack compile/type/page generation. Existing module-type and Browserslist-age warnings remain; no dependency/configuration workaround was added.
- ESLint on all ten changed/new JS/MJS files passed: the four edited library files, inspector component and five test files. No lint errors or warnings.
- New G6 production suite: **5 passed, 0 failed/skipped**, including native ArrowDown selection of the match, exact point/line replacement, required-field clearing, already-empty counts, selection changes during confirmation, undo/redo, actual GMI-only download and independent source-byte oracle.
- Final serial production-browser regression gate: **62 passed, 0 failed/skipped**:

```text
node --test --test-concurrency=1 tests/gmiBatchReplaceClearUi.test.mjs tests/gmiBatchFieldValueInputUi.test.mjs tests/gmiBatchInspectorUi.test.mjs tests/gmiBatchRiskGateUi.test.mjs tests/gmiEditBatchUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/gmiCheckboxSoftFocusUi.test.mjs tests/gmiS5FocusContinuityUi.test.mjs tests/deliveryWizardUi.test.mjs
```

Used the existing Chrome harness, `PHOTO_UI_URL=http://127.0.0.1:3254`, and this task's own fresh production server, serially. Includes existing hydraulic applicability/manual selection, SDR `11` / `11,0` / `11.0`, conflicts, draft guards, risk confirmation, focus continuity, M8–M10 source integrity and download protection. The server was stopped after verification.

- Visually inspected exact-replacement setup at 1280×720 and clear/new-FEIL confirmation at 1366×768; automated layout checks and screenshots cover both sizes for both states. Picker fits the inspector; native control focus is visible; the confirmation's reason list scrolls and its actions remain reachable. No horizontal overflow observed.
- `git diff --check`: passed, including after report completion.

Node coverage explicitly verifies exact whitespace/case distributions, source lexemes versus effective staged values, attempted nonmatch inclusion, empty/no-op exclusion, required-field dataset findings, conflict replacement, structural refusals, reserved identifiers, linked-Tema refusal, point/line behavior, genuine hydraulic tokens, special/unresolved hydraulic exclusions, stale selection/dry-run approval, undo/redo and unchanged bytes outside intended patches.

### Failed development checks and resolutions

- The first new required-field fixture omitted Bredde. Validator correctly did not introduce the assumed required InnvendigUtvendig FEIL. Added Bredde to make the synthetic field genuinely required; kept the new-FEIL assertions.
- Existing Node source assertions caught an unnecessary dirty-predicate change; the original predicate already covers the new operation modes and was retained. Former G2 unsupported clear/replace expectations were deliberately updated for the authorized G6 contract, with refusal coverage preserved.
- First broader browser gate: **62 total, 57 passed, 5 failed**, including parent failures. One application regression was mine: resetting all operation modes after staging broke the existing set-mode continuation scenario. Corrected the reset to apply only to the new G6 modes; the unchanged existing scenario passes in the final gate.
- Two browser scenarios reached their obsolete pre-M10 export selector. Inspection of the untouched starting commit (`git show e1d3ff6:src/components/gmi-edit/GmiExportDialog.js` and `…:src/components/delivery/DeliveryWizard.js`) confirms the adapter already used `.delivery-wizard`, with no `.gmi-edit-export`. No separate baseline browser run was performed or claimed. Migrated only those export interactions to the accepted M10 wizard, preserving their byte-for-byte download assertions. Final gate passes.
- No assertion was skipped or weakened to make these checks pass. No production export UI was restored or changed.

Local logs: `%TEMP%/g6-node-focused-final.log`, `g6-node-post-review.log`, `g6-full-node-final.log`, `g6-browser-new-final.log`, `g6-browser-regression.log` (failed intermediate gate) and `g6-browser-regression-final.log`.

### Skipped, limitations and manual acceptance

- The focused two skips are existing opt-in corpus/performance checks. The full suite's 128 skips include browser entry points without their environment and optional/private-corpus checks; configured production runs above had no skips. No skip gate was added.
- No private/reference corpus, real-file acceptance, assistive-technology session or Gemini import was performed. Synthetic verified exports do not establish those acceptances. Large real-selection performance was not measured; value enumeration is linear in selected source cells and uses existing source/session access.
- Manual follow-up: on an approved copy, select a field with leading/trailing-space variants, verify each match/count and unchanged nonmatches; clear a required field and inspect the new FEIL before confirming; cancel and repeat after changing selection; check undo/redo and download the verified GMI. Exercise the picker and confirmation keyboard-only with a screen reader and test long values/large distinct-value lists.
- No known G6 automated failure remains. Linked-field editing, column creation and H5 remain out of scope.

## Screenshots

- [Exact replacement setup, 1280×720](assets/20261113-g6/g6-replace-1280x720.png)
- [Exact replacement setup, 1366×768](assets/20261113-g6/g6-replace-1366x768.png)
- [Clear required field/new-FEIL confirmation, 1280×720](assets/20261113-g6/g6-clear-risk-1280x720.png)
- [Clear required field/new-FEIL confirmation, 1366×768](assets/20261113-g6/g6-clear-risk-1366x768.png)

## Git and publication

Changes remain unstaged and uncommitted. No stage, commit, push, deploy, branch/ref change, reset or synchronization occurred. HEAD remains `e1d3ff6`; unrelated reports were untouched. Only task-owned servers were stopped. Work stops after G6.
