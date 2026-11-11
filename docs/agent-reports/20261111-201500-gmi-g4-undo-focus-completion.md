# G4 Rettinger: keyboard focus after «Angre» in the staged batch view — completion report

Date: 2026-11-11, Europe/Oslo. Branch `feature/photo-workspace`, starting HEAD `f8ebabb` (clean). This closes the residual issue in §5 of the [Pass 3 (S5) report](20261111-184639-gmi-g4-ui-refinements-pass3-s5-completion.md). No G5 work was started. Nothing was staged, committed or pushed.

## 1. Outcome

| Requirement | Status |
| --- | --- |
| Successful «Angre» from the staged batch view moves keyboard focus to the visible undo notice («Angret: …»), not `body` | Done |
| Tab continues naturally: the next stop is the notice's contextual «Gjør om» | Done (browser-checked) |
| Contextual «Gjør om» is kept and works by keyboard. Focus stays on the result notice («Gjort om: …») | Done (browser-checked) |
| Undo/redo logic, ChangeSets, selection, validation and export unchanged | Unchanged |

## 2. Changed files

- `src/components/gmi-edit/GmiEditWorkspace.js`:
  - `undo()` now returns the result of `runTransition` (true or false). The transition, the notice and the `reveal` handling are the same as before. The footer button ignores the return value.
  - The `staged` variant's `onUndo` sets the existing `focusNotice` flag only after a successful undo. The existing `[notice]` effect then focuses `noticeRef`. This is the same mechanism the contextual «Gjør om» uses.
  - The history variant and the footer «Angre siste retting» are unchanged. A failed undo does not move focus, because the button stays mounted.
- `tests/gmiS5FocusContinuityUi.test.mjs`: the `t.diagnostic` is now a regression assertion. After «Angre», the test checks that:
  - focus is on the visible `.gmi-edit-notice` (not `body`), its text starts with «Angret:», and the edit counts changed;
  - one Tab reaches `[data-gmi-context-redo=notice]`;
  - Enter on it restores the counts, the focus is on the «Gjort om:» notice, the contextual redo is gone, and the staged view is not reopened.

  Two small helpers were added (`press`, `counts`), and `activeElement` now also reports `notice`.

## 3. Verification

The baseline is the S5 report: full serial Node suite **2083 tests, 1961 passed, 7 failed, 115 skipped**, and a browser gate of 99/99.

| Check | Result |
| --- | --- |
| Full serial Node suite (`node --test --test-concurrency=1 "tests/*.test.mjs"`, no `PHOTO_UI_URL`) | **2083 tests: 1961 passed, 7 failed, 115 skipped.** Same counts and the same 7 failing names as the baseline: 6 CRLF-sensitive source-regex layout/stats contracts and 1 optional external real-corpus check. No new failures. |
| ESLint (`GmiEditWorkspace.js`, `gmiS5FocusContinuityUi.test.mjs`) | 0 errors, 0 warnings |
| `npm run build` (isolated detached worktree, changed files hash-identical) | Passed |
| Serial production-browser gate, fresh build, port 3150: the 12 G4 gate files, `gmiTableReviewUi` and `gmiS5FocusContinuityUi` | **99 passed, 0 failed, 0 skipped** |
| Negative control: the new S5 test against a fresh build of HEAD `GmiEditWorkspace.js` | Fails as expected at `document.activeElement?.matches('.gmi-edit-notice')`. The other S5 subtests pass. |
| `git diff --check` | Clean |

`gmiBatchInspectorUi` (S6 contextual «Gjør om», mouse path) passes unchanged.

## 4. Remaining risks and manual acceptance

- **Manual keyboard check.** Not done by hand. Stage a batch, press «Angre» with the keyboard, and confirm the screen reader reads the «Angret» notice (`role=status`, focused). Then Tab → «Gjør om», Enter.
- **Visible focus ring.** The notice has no `gmi-focus-ring` class. Its focus indication follows the existing notice styling, which is unchanged and is also used after contextual «Gjør om». This was not changed, to avoid UI changes outside the scope.
- **Out of scope by design.** Undo from the history-variant details and from the footer button was not changed. The footer button stays mounted. The history details close on undo, which may leave focus on `body`. That is a possible follow-up, not part of this task.
- No private or reference corpus was used. All checks used synthetic fixtures.

## 5. Git status and publication

- Modified: `src/components/gmi-edit/GmiEditWorkspace.js` and `tests/gmiS5FocusContinuityUi.test.mjs`. New: this report. Nothing staged, committed or pushed. No branch or ref changes.
- The build and browser runs used one detached scratch worktree, with a copied `node_modules` and port 3150. Other agents' servers (ports 3110–3113) and the repository `.next` were not touched. My server was stopped and the worktree removed. `git worktree list` shows only the main tree.
