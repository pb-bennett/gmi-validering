# G4 Rettinger UI refinements, Pass 3 (S5): completion report

Date: 2026-11-11, Europe/Oslo. Branch `feature/photo-workspace`, starting HEAD `faa9e1d` (Pass 2 committed, clean working tree). Implements S5 from the [G4 UI refinements plan](20261111-132049-gmi-g4-ui-refinements-plan.md), decision D-D as recommended there. Builds on [Pass 1](20261111-161543-gmi-g4-ui-refinements-pass1-completion.md) and [Pass 2](20261111-170534-gmi-g4-ui-refinements-pass2-completion.md). No G5 or other slices were started. Nothing was staged, committed or pushed.

## 1. Outcome

| Requirement | Status | How |
| --- | --- | --- |
| 1. The edited field leads the Data Table as soon as Felt is chosen | Done | The batch inspector requests `batch:<felt>` column focus from the Felt choice, before any preview. |
| 2. Focus is kept through staging and «Ny masseendring» until another field is chosen | Done | The inspector remembers the last chosen field (`focusChoice`). While the staged ChangeSet is shown, its details own the focus (same field). When they close («Ny masseendring», undo, discard), the inspector's batch focus returns. |
| 3. An explicit «off» is respected and not reactivated by the ChangeSet | Done | The Data Table stores «off» per *layer + field set*, not per request key. A focus on other fields clears it; a short gap without focus (handover) does not. |
| 4. After successful staging, Original → Foreslått unless the user chose Original | Done | Object editor, batch inspector and legacy «Masseendringer» staging call `showGmiEditProposedAfterStage`. |
| 5. The user's explicit view choice survives later stages | Done | A per-layer, non-persisted `gmiEditTableViewBy` marker (`user` / `auto`). Toolbar and «Vis i Foreslått» count as `user`. The R5 handoff and the stage switch count as `auto`. |
| 6. Keyboard focus is on a meaningful, visible element after staging | Done | Batch: the success line «Lagt til i arbeidskopien…» at the top of the staged details. Object: the result message «Rettingen er lagt til…». «Ny masseendring for utvalget»: the Felt select. |

## 2. Changed files

Application:
- `src/lib/gmiEditView.mjs`: `GMI_EDIT_TABLE_VIEW_BY` and the pure rule `gmiTableViewAfterStage(view, chosenBy)`. Original (also the unset default) becomes Foreslått unless it was chosen by the user. Foreslått and Kun endrede are never replaced.
- `src/lib/store.js`:
  - `gmiEditTableViewBy: {}`, not persisted (`partialize` is unchanged and keeps only settings, ui and lastActive).
  - `setGmiEditTableView(layerId, view, { by = 'user' })`: the signature is backwards compatible, and existing callers are explicit choices.
  - `showGmiEditProposedAfterStage(layerId)`: does nothing while an exact or contextual Validator inspection is active.
  - The R5 handoff writes Original as `auto`.
  - Layer removal and `resetAll` drop the marker.
- `src/components/gmi-edit/GmiEditWorkspace.js`: `showStagedResult()` is called from the batch inspector's `onStaged`, a new `onStaged` on `GmiObjectEditor`, and the legacy `GmiBatchDialog` `onStaged`. The dialog component itself is unchanged.
- `src/components/gmi-edit/GmiBatchInspector.js`:
  - `focusChoice` (presentation only; `dirty` is unchanged).
  - Column focus from the Felt choice; the effect yields to the staged details and re-asserts when they close.
  - `newBatch` moves keyboard focus to the Felt select.
- `src/components/gmi-edit/GmiChangeSetDetail.js`: in the `staged` variant only, the success line is focusable (`tabIndex=-1`, `gmi-focus-ring`, `data-gmi-staged-success`) and focused on mount. The history variant is unchanged.
- `src/components/gmi-edit/GmiObjectEditor.js`: after a stage attempt, keyboard focus moves to the result message (`tabIndex=-1`, `data-gmi-object-message`). It does so on success, on «no values changed» and on error, because «Legg til retting» unmounts in all three cases.
- `src/components/LayerDataTable.js`: the column-focus «off» choice is compared on a `layerId + fields` signature. The toggle, manual column drag and the visible order use the same rule as before.

Tests:
- `tests/gmiEditWorkspace.test.mjs`, three new tests:
  - The pure view-intent rule (unset, auto, user; Foreslått and Kun endrede kept).
  - The store: first stage switches, explicit Original is kept through repeated stages, Kun endrede is kept, an automatic Original switches again, the other layer is untouched, exact and contextual inspections leave the view and marker untouched, and layer removal and reset drop the marker.
  - A source-wiring contract.
  - The R5 handoff test also asserts that the handoff resets the marker to `auto`.
- `tests/gmiS5FocusContinuityUi.test.mjs` (new production-browser test, synthetic fixture), three subtests:
  1. **Object staging.** Original → Foreslått after the first stage. Focus is on the visible result message, not `body`. Geometry, inspector object and grid scroll are unchanged, and no draft dialog appears. After an explicit Original click, a stage on another object stays Original and focus again goes to the message.
  2. **Batch staging.**
     - No column focus before a field is chosen. Choosing Merknad puts it first (before Material) without a preview.
     - Closing with only a field chosen needs no draft confirmation and drops the focus.
     - Stage (with risk approval): Foreslått, the focus is kept on the ChangeSet, and keyboard focus is on the visible success line. Checked at 1280×720 and 1366×768, with screenshots and no page overflow.
     - Tab continues inside the inspector.
     - «Ny masseendring»: focus is on the Felt select, and the column focus is kept.
  3. **Explicit off.**
     - Turning «Merknad først» off survives preview, staging (the ChangeSet handover) and «Ny masseendring».
     - Choosing Material applies the focus again.
     - An explicit Original is kept after a batch stage, with focus on the success line.
     - Undo returns to the batch focus (no stale ChangeSet focus). Closing the inspector leaves no focus.
     - No page overflow at either laptop size.
- `tests/gmiEditWorkspaceUi.test.mjs`: **deliberate update**, one subtest. It asserted that the table still showed Original (0 changed cells) right after the first object stage. That is exactly the T2 behaviour change. It now asserts the automatic Foreslått, clicks Original explicitly, and keeps the original «Original shows the imported data only» check. The rest of the test is unchanged and passes. Its six follow-on failures in the first gate run were cascades from this one assertion.

## 3. Implementation decisions

- **Unchanged.** Correction eligibility, ChangeSets, the dry run, validation counts, approval gates, export and source code are untouched. `git diff` touches no file under `src/lib/gmi-edit/`, `gmiFieldBatchPlan.mjs`, `findingDiff.js` or export/verification code. Selection, geometry, scrolling and the inspected object are not touched by the switch (browser-checked). The switch is a plain store update and never goes through the draft guard.
- **Exact Validator inspections.** While an `exact-object-set` or `contextual-object-set` inspection is active, the stage switch does nothing: no view change and no marker change. Those tables have no view modes and stay on their original-revision rows. This is conservative: after leaving such an inspection, the view is whatever it was before.
- **Legacy «Masseendringer» dialog.** Its staging also switches the view, for consistency with «single and batch». The change is one line in the workspace; the dialog component is unchanged (plan §8).
- **Column focus ownership.** A staged ChangeSet's details keep the `change-set:<id>` focus, so ChangeSet history behaviour is unchanged. The inspector's `batch:` focus yields while they are shown and returns when they close. This cannot leave a stale `change-set:` focus after undo or discard, because the details unmount and clear their own key (browser-checked after undo).
- **Choosing «Velg felt…»** (empty) ends the column focus. Choosing a field never marks the inspector dirty (`dirty` expression unchanged and pinned by a source test).
- **The «off» signature** includes the layer. It is component-local state in the Data Table (not persisted), as before.

## 4. Verification

Baseline (HEAD `faa9e1d`, clean detached worktree): full serial Node suite **2079 tests: 1958 passed, 7 failed, 114 skipped**. The 7 failures are the known ones: 6 CRLF-sensitive source-regex layout/stats contracts and 1 optional external real-corpus check. Browser baseline: the Pass 2 report's 95/95 for this exact tree.

| Check | Result |
| --- | --- |
| Focused Node: `tests/gmiEditWorkspace.test.mjs` | 15 passed, 0 failed |
| Full serial Node suite (`node --test --test-concurrency=1 "tests/*.test.mjs"`, no `PHOTO_UI_URL`) | **2083 tests: 1961 passed, 7 failed, 115 skipped.** The failing test names are identical to the baseline (compared by `diff`). +3 passes are the new S5 Node tests; +1 skip is the new browser file without `PHOTO_UI_URL`. |
| ESLint, all touched JS/MJS and test files | 0 errors. One warning, unchanged from HEAD (`react-hooks/incompatible-library`, TanStack `useReactTable` in `LayerDataTable.js`). |
| `npm run build` (isolated worktree, source byte-identical to the final working tree) | Passed |
| Serial production-browser gate, fresh build, free port 3150: the 12 G4 gate files, `gmiTableReviewUi` and the new `gmiS5FocusContinuityUi` | **99 passed, 0 failed, 0 skipped** (final run after the deliberate update). The first run was 92/7/0, all in `gmiEditWorkspaceUi`, as explained in §2. |
| `git diff --check` | Clean |

Screenshots (local, synthetic, inspected): `%TEMP%/gmi-s5-staged-1280x720.png` and `%TEMP%/gmi-s5-staged-1366x768.png`. They show the staged batch with «Foreslått» active, «Merknad først» on and Merknad as the first data column, and the success line at the top of the inspector with no page overflow. Other gate screenshots are in `%TEMP%/gmi-s5-screenshots/`.

## 5. Remaining risks and manual acceptance

- **Observed, not changed (S6 area).** Undo with «Angre» in the staged batch view still leaves keyboard focus on `body`, because the button unmounts and the notice is not focused. The new browser test records this as a diagnostic. It is pre-existing and belongs to S6's undo/redo focus handling. A one-line follow-up could focus the notice or the Felt select.
- **Programmatic focus.** The focused success line or message shows the focus ring only after keyboard interaction (`:focus-visible`). After a mouse click it is focused without a ring. This is the intended browser behaviour.
- **The object message** sits below the field table, so focusing it can scroll a long inspector to the bottom. It stays visible (browser-checked), and Shift+Tab returns to the fields.
- **The view marker is per layer and in memory.** A page reload starts as `auto`, so the next stage switches to Foreslått again.
- **Manual acceptance still to do** (plan §6, item 5 and the keyboard pass):
  1. Stage an object correction from Original: the table shows Foreslått. Click Original, then stage again: it stays Original.
  2. A batch: choose Felt and check that the column moves first before the preview. Turn «… først» off, then stage: it stays off. Use «Ny masseendring»: the focus is kept until another Felt is chosen.
  3. With the keyboard only: stage a batch and an object correction. Focus is announced and visible, and Tab continues in the inspector.
  4. After a Validator handoff, the first stage switches to Foreslått.
  5. Repeat on a real delivery. No private or reference corpus was configured or opened; all checks used synthetic fixtures.

## 6. Git status and publication

- Modified: the 7 application files and 2 test files in §2. New: `tests/gmiS5FocusContinuityUi.test.mjs` and this report. Nothing staged, committed or pushed; no branch or ref changes.
- Baseline, build and browser runs used one detached scratch worktree with a copied `node_modules` (a junction is rejected by Turbopack) and port 3150. The repository `.next` and other agents' servers (ports 3110–3113) were not touched. My server was stopped and the worktree removed; `git worktree list` shows only the main tree.
