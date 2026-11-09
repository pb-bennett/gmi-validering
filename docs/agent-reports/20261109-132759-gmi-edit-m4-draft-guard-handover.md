# GMI editing M4 follow-up: unsubmitted-draft guard — HANDOVER (work stopped mid-verification)

Date: 2026-11-09. Branch `feature/photo-workspace`, base commit `b17b3ef`. Nothing committed or pushed.
Stopped on request (usage limit) before verification finished. **This follow-up is not complete.**
The M4 completion report `docs/agent-reports/20261109-131625-gmi-edit-m4-rettinger-workspace.md` has **not** been updated with these findings yet (see next steps).

## 1. What was investigated

Scenario: in Rettinger, an object field is typed into but «Legg til retting» is never clicked. That leaves a local draft in `GmiObjectEditor` and no staged ChangeSet, so M3's `unsaved` predicate is false. Each path that could unmount the workspace was traced in the code.

| Path | Finding before the fix |
|---|---|
| 1. Global «Nullstill og åpne ny fil» (toolbar / sidebar `onReset`) | **Gap.** `handleReset` only consulted `gmiEditRemovalBlock` (staged edits). With a draft only, it reset everything silently. **Confirmed in the browser** on the pre-fix production build: no dialog appeared and the app was reset. |
| 2. «Fjern lag» on the edited layer | **No gap.** Layer cards (and «Fjern lag») are not rendered while Rettinger is open, because the workspace replaces the Sidebar. The only route there is «Tilbake til appen», which was already draft-guarded in M4. |
| 3a. Switching to another GMI layer or the Validator | **No gap.** These are only reachable from the hidden Sidebar, so Rettinger must be left first, through the guarded exit. |
| 3b. Switching to FOTO | **Gap.** Photo markers stay clickable on the Rettinger map. The popup's open button calls `openPhotoLayer`, which swaps the sidebar to FOTO and unmounts the editor without asking. Identified by code reading. |
| 4. (Extra) Window file drop of a survey file during Rettinger | **Gap.** `GlobalFileDrop` stays enabled, and `startParsing()` sets `parsing.status = 'parsing'`, which unmounts the whole main layout (`parsingStatus === 'done' \|\| hasPhotoLayers`) and the editor with it. Identified by code reading. |
| Tab close | Already protected in M4: the editor adds a `beforeunload` listener while a draft exists. |

## 2. Fix implemented (saved on disk, not yet fully verified)

The fix reuses the existing workspace guard (`guard()` in `GmiEditWorkspace`, the «Forkaste endringer i skjemaet?» dialog). No editing state was duplicated: the page only learns a boolean "draft exists", plus a reference to the guard function. M3 staged-edit semantics are unchanged; the staged check in `handleReset` still runs after the draft decision.

- `src/components/gmi-edit/GmiEditWorkspace.js`
  - New props `onGuardChange` and `onDraftChange`.
  - `onDirtyChange` also calls `onDraftChange(dirty)`.
  - An effect registers `guard` via `onGuardChange(guard)` and unregisters it with `null` on unmount.
- `src/app/page.js`
  - `gmiEditGuardRef`, `registerGmiEditGuard` (`useCallback`) and a `gmiEditDraft` state; `useCallback` was added to the React import.
  - `guardGmiEditDraft(action)` runs the action directly, or through the workspace guard when Rettinger is active.
  - `requestReset = () => guardGmiEditDraft(() => handleReset())`. All three user reset entry points (parse-error retry, Sidebar `onReset`, `MapPaneToolbar` `onReset`) now call `requestReset`. The reset-confirmation dialog still calls `handleReset({ discardGmiEdits: true })` directly, because the draft was already decided.
  - `openPhotoLayer` is wrapped in `guardGmiEditDraft`. This covers the map-marker popup and `completePhotoImport`.
  - `GlobalFileDrop enabled` gains `&& !(gmiEditActive && gmiEditDraft)`, so drops are refused while a draft exists. Drops with no draft behave as before.
- ESLint (`--max-warnings 0`) on `src/app/page.js` and `src/components/gmi-edit`: **clean**.
- `npm run build` with the fix: **succeeded**.

## 3. Tests

New file `tests/gmiEditDraftGuardUi.test.mjs` (browser; needs `PHOTO_UI_URL`). It sets up a FOTO layer with an EXIF-placed photo, a GMI layer and Rettinger with a draft, then runs six steps:

1. Reset with a draft: cancel leaves a full workspace snapshot unchanged (draft, selection, table, FOTO markers, layers).
2. FOTO from the map popup: cancel leaves everything unchanged; confirm opens FOTO, and returning resumes Rettinger with no draft and nothing staged.
3. File drop is refused while a draft exists.
4. Leaving Rettinger: «Fjern lag» is not reachable inside Rettinger; the exit guard works for both cancel and confirm; draft-only «Fjern lag» shows no staged-edit warning.
5. Draft plus staged corrections: two decisions, each cancellable.
6. Draft-only reset confirmed: one dialog, then the reset proceeds.

Results:
- **Pre-fix build:** step 1 failed as expected, because no draft dialog appeared and the app reset. The other steps cascaded. This confirms gap 1.
- **Post-fix build (incomplete run, stopped on request):**
  - steps 1–4 **pass**;
  - step 5 **failed**; the error text was not captured before the run was stopped, so the cause is **unverified**;
  - step 6 **did not run**.

Not re-run after the fix (**unverified**):
- `tests/gmiEditWorkspaceUi.test.mjs`;
- `tests/gmiEditWorkspace.test.mjs`. The fix does not touch the source strings its contract test checks, but this was not rerun;
- the FOTO browser regressions;
- the full suite.

## 4. Outstanding issues

1. Step 5 failure, cause unknown. Candidates, all unverified:
   - the `deepEqual(snapshot, before)` after the first draft-dialog cancel differs in some field;
   - the reset dialog (`data-gmi-confirm="reset"`) did not appear after «Forkast skjemaet». The guard's `run` invokes the `handleReset` closure from the render that opened the dialog; it should still call `gmiEditRemovalBlock`, but check this;
   - a timing issue: missing `waitFor` after `u.edit`/stage, or the `Se gjennom (1)` label.

   The product question is whether the staged-reset dialog appears after the draft is discarded. Verify this manually or by rerunning the test with full output.
2. Step 6 is unverified. It also exercises «Forkast alle» through the shared dialog (`data-gmi-confirm="workspace"`); the selector assumes that dialog id.
3. The M4 completion report still says nothing about this follow-up.

## 5. `git status --short` (checked at stop time)

```
 M src/app/page.js
 M src/components/DataDisplay.js
 M src/components/LayerDataTable.js
 M src/components/LayerPanel.js
 M src/lib/store.js
?? docs/agent-reports/20261109-131625-gmi-edit-m4-rettinger-workspace.md
?? docs/agent-reports/assets/20261109-gmi-edit-m4-rettinger/
?? src/components/gmi-edit/
?? src/lib/gmiEditView.mjs
?? tests/gmiEditDraftGuardUi.test.mjs
?? tests/gmiEditWorkspace.test.mjs
?? tests/gmiEditWorkspaceUi.test.mjs
```

All intended changes (M4 and this follow-up) are saved on disk. Apart from this handover, the follow-up touched only `src/app/page.js`, `src/components/gmi-edit/GmiEditWorkspace.js` and the new test file. No temporary files remain in the repo: the probe scripts were deleted and the mutation worktree was removed earlier. The test server on port 3123 and the test processes were stopped. The `.next` build on disk includes the fix.

## 6. Exact next steps

1. `npm run build`, then `npx next start -p 3123` (in the background).
2. `PHOTO_UI_URL=http://localhost:3123 node --test tests/gmiEditDraftGuardUi.test.mjs` and read the full step 5 error.
3. Fix whichever is wrong: the test (selector or timing) or the product (staged-reset dialog not shown after draft discard). Keep the order «draft dialog → staged dialog → cleanup», and do not move draft checks into the store or into M3.
4. Re-run with the same `PHOTO_UI_URL`:
   - `tests/gmiEditDraftGuardUi.test.mjs`;
   - `tests/gmiEditWorkspaceUi.test.mjs`;
   - `node --test tests/gmiEdit*.test.mjs`;
   - the FOTO browser regressions from the M4 report: `photoLoadedGmiUi`, `photoImportWizardUi`, `mapTeardownUi`, `photoWorkspacePass1dUi`, `gmiPhotoAssociationsUi`.
5. Run ESLint on the changed files, then `npm run build`.
6. Append a section «M4 follow-up: unsubmitted drafts» to `docs/agent-reports/20261109-131625-gmi-edit-m4-rettinger-workspace.md`, summarising §1–§3 here with the final results. Stop the server afterwards. Do not commit or push.
