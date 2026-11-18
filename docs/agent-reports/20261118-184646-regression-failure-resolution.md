# Regression failure resolution (batch footer, M10 editor lifecycle)

Date: 2026-11-18. Repository: `C:/GitHub/gmi-validering-test`. Branch: `feature/photo-workspace`. HEAD: `4bc35e9dea87a3b6d1d525ecb26947d46915f88e` (unchanged). Starting tree: the 12 modified tests and the untracked report/assets from `20261118-180709-automated-regression-test-maintenance.md`; preserved untouched.

Follow-up to `20261118-180709-automated-regression-test-maintenance.md`. Its test corrections were not revisited. No subagents, staging, commits, pushes or deployment.

## Outcome

| Task | Result |
| --- | --- |
| A: legacy Masseendringer footer | **Fixed.** Root cause confirmed; a one-selector CSS scoping change. Retained containment assertion passes at 1280×720 and 1366×768. |
| B: M10 editor disappearance (`deliveryWizardUi.test.mjs:437`) | **Unresolved; not reproduced** in 160 instrumented replays. No production change. The test now fails with a state snapshot instead of a bare `TypeError`; it does not wait, retry or relax anything. |
| C: final verification | Node 2,250/0/150. Focused suites 39/39. Full browser 480 passed / **1 failed** / 11 skipped: a separate, intermittent FOTO Slice 2 failure, reproduced in isolation (see Remaining issues). |

## Task A: confirmed root cause and fix

Diagnosis confirmed. `src/components/gmi-edit/gmiEdit.css` contained two rules for `.gmi-batch-content` with equal specificity:

- line 161 (legacy dialog): `min-height: 0; flex: 1; overflow: auto; display: flex; flex-direction: column; …` is a shrinkable scroll region inside the fixed-height, `overflow: hidden` `.gmi-batch-dialog`.
- line 416 (integrated inspector, later in the file): `display: grid; gap: 8px; flex: 1 0 auto; align-content: start`.

Because the later rule won, the dialog's content had `flex-shrink: 0` and `flex-basis: auto`. It grew to full content height, which pushed the `flex-shrink: 0` footer below the dialog's clipped bottom (previously measured footer top 939.8 px in a 768 px viewport).

**Production change (only one):** `gmiEdit.css:416`

```diff
-.gmi-batch-content { display: grid; gap: 8px; flex: 1 0 auto; align-content: start; }
+.gmi-batch-inspector > .gmi-batch-content { display: grid; gap: 8px; flex: 1 0 auto; align-content: start; }
```

Why the inspector is unaffected: in `GmiBatchInspector.js:325`, `.gmi-batch-content` is a direct child of `section.gmi-batch-inspector`. The scoped rule therefore still matches it, now with higher specificity (0,2,0), so it still overrides `display`, `gap`, `flex` and `align-content` from line 161 exactly as before. Line 161's other properties (`min-height`, `overflow`, `padding`) applied to the inspector before and still do. The computed inspector style is unchanged by construction. `GmiBatchDialog.js:110` is not inside `.gmi-batch-inspector`, so the legacy dialog's rule applies again. No behaviour, DOM, refs or scroll owners changed. No new tokens or variants were added.

Evidence (the same synthetic 129-object M5B fixture and unchanged containment assertion in `tests/gmiEditBatchUi.test.mjs`):

| Size | Before (HEAD, from the prior report's run) | After |
| --- | --- | --- |
| 1280×720 | [before](assets/20261118-184646-regression-failure-resolution/before-m5b-review-1280x720.png) | [after](assets/20261118-184646-regression-failure-resolution/after-m5b-review-1280x720.png) |
| 1366×768 | [before](assets/20261118-184646-regression-failure-resolution/before-m5b-review-1366x768.png) | [after](assets/20261118-184646-regression-failure-resolution/after-m5b-review-1366x768.png) |

All four were inspected. Before: the content is clipped at the pager row and there is no confirmation footer. After: the footer (Avbryt / Tilbake / Legg til masseendring) is visible at both sizes, and the review list scrolls inside the content region (a visible content scrollbar plus the existing bounded table scroll). `gmiEditBatchUi` (M5B, G4) and `gmiBatchInspectorUi` (R4, including the inspector's laptop layout) passed.

## Task B: editor-lifecycle investigation

**Failure evidence (from the prior final log).** `TypeError: Cannot read properties of null (reading 'querySelector') at <anonymous>:1:63`. Column 63 is the `.querySelector` immediately after `document.querySelector(".gmi-edit-inspector .gmi-edit-editor")`, so the **editor element itself** was absent. The overwrite checkbox was not merely missing. The preceding `setValue` (line 436) had resolved the same editor successfully, so the editor existed one CDP round trip earlier. The parent test lasted 1,099 ms.

**What could remove `.gmi-edit-inspector .gmi-edit-editor` (code analysis):**

- `GmiEditWorkspace` sets `selected` only through `select()`/`enterHandoff`. It never clears it while mounted. Losing the selection therefore requires remounting the workspace (`key={gmiEditLayerId}` in `page.js:968`). That in turn requires a change to `gmiEditWorkspace.layerId`, to `gmiEditActive` (`workspaceLayer`, `surveyLayers[id]`), or to the `parsingStatus === 'done' || hasPhotoLayers` mount gate (`page.js:954`).
- A remount of the portal target (`aside` with `key={gmiEditLayerId}` and callback ref `setGmiEditInspector`, `page.js:1129`) recreates the portal children. That would **silently drop the GmiObjectEditor draft**, but it would leave an editor present, which is a different symptom.
- The `GmiObjectEditor` key (`${selectedKey}:${view?.handle.sessionId || descriptor?.state}:${formRevision}`) remounts and drops the draft if the session handle appears after the first render. That is the same "editor present, draft lost" symptom.
- An empty inspector (`.gmi-edit-inspector-empty`) appears only if `selectedObject` is null, which needs `layer.data.points[0]` to disappear.
- The batch inspector and ChangeSet-detail branches both render `.gmi-edit-editor` and cannot produce this null.
- Ruled out by reading: persisted-store rehydration is synchronous localStorage; the 1-hour expiry runs only at rehydrate; the `testmodus` `history.replaceState` does not navigate; nothing in `src` reloads the page; `setGmiEditDraft(true)` only toggles `GlobalFileDrop`; `useGmiObjectValidation` is debounced by 180 ms and deterministic.

**Reproduction attempts.** A scratchpad-only replay (not tracked) ran the exact M10 setup: the same synthetic fixture, the same helpers and the same order. A `MutationObserver` recorded the identity of the workspace, inspector root and editor, the selected object, the Merknad value, the overwrite checkbox and the photo-workspace state:

| Condition | Replays | Editor/inspector/workspace remounts or removals after mount | Failures |
| --- | --- | --- | --- |
| Normal, 1 s settle | 21 | 0 | 0 |
| 6× CPU throttle | 10 | 0 | 0 |
| 3 parallel loops while the full Node suite ran (recreating the failed run's overlap) | 120 | 0 | 0 |
| Prior agent's replays (500 ms settle) | 10 | 0 | 0 |

The real suite also passed all 14 nested M10 cases twice: in the focused run and in the full final run.

**Classification:** unresolved intermittent. Two possible explanations remain open: a genuine lifecycle defect (workspace or inspector-root remount, which would lose the selection or the draft) and an environment or document-level event (for example a renderer reset or reload). The evidence cannot separate them, so no production change was made.

**Test change (diagnostic only):** `tests/deliveryWizardUi.test.mjs` (+9 lines after line 436). After the draft input, the test collects a state snapshot and asserts the same expectations the old line already depended on: editor present, object `point:0`, Merknad `M10 corrected` and the overwrite checkbox present. The snapshot covers the editor, object, Merknad value, overwrite control, workspace, status, inspector root, empty state, inspector text, navigation type, time since navigation and URL. If any expectation fails, the test fails at once with the snapshot. There are no waits, retries, timeouts or relaxed conditions. The next occurrence will show which owner lost the editor and whether the document was replaced.

**Related, separately observed (not fixed):** the prior agent's interrupted confirmation log contains an unreported intermittent in `layerDataTableKeyboardUi.test.mjs` ("R2 production", subtest 1, line 60). The keyboard-current row had no `aria-selected` (`null !== 'false'`) right after entering Rettinger, and subtest 2's null-editor `TypeError` cascaded from it. Both intermittents happen shortly after entering Rettinger, so a shared transient re-render is possible but unproven. That suite passed in this task's full run.

## Task C: final verification

Builds and servers were isolated. Another process's `next start` servers on ports 3110–3113 were serving the repository's own `.next`. To avoid disturbing them, the production build and server ran from a scratchpad copy of the working-tree sources (`src`, `public`, `data`, package/config files, a copied `node_modules`). `diff -r`/`cmp` confirmed that those sources were identical to the repository at test time. The repository `.next` was not rebuilt. Those servers were left running.

All runs below were sequential and never overlapped, except the one run labelled diagnostic.

| Check | Command | Result |
| --- | --- | --- |
| Production build | `next build` (isolated copy of final sources) | Passed |
| Focused (A) | `node --test --test-concurrency=1 --test-reporter=tap tests/gmiEditBatchUi.test.mjs tests/gmiBatchInspectorUi.test.mjs` | 22/22 passed |
| Focused (A+B) | `… tests/deliveryWizardUi.test.mjs tests/gmiEditBatchUi.test.mjs tests/gmiBatchInspectorUi.test.mjs` | 39 passed, 0 failed; all 14 nested M10 cases ran and passed |
| Full serial Node | `node --test --test-concurrency=1 "tests/*.test.mjs"` (run alone) | 2,400 tests: 2,250 passed, 0 failed, 150 skipped |
| Full production browser | `PHOTO_UI_URL=http://127.0.0.1:3197 node --test --test-concurrency=1 --test-reporter=tap "tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"` (screenshot env vars as in the prior report) | 492 tests: **480 passed, 1 failed, 11 skipped**, 680 s |
| Failed-suite reruns | `tests/photoMapInteractionSlice2Ui.test.mjs` ×3 alone | pass, **fail (same line)**, pass |
| ESLint | `npx --no-install eslint tests/deliveryWizardUi.test.mjs tests/gmiEditBatchUi.test.mjs` | Passed (the CSS file is not linted by ESLint) |
| `git diff --check` | | Passed (only pre-existing LF→CRLF notices for the prior agent's files) |
| Diagnostic only (overlapping) | Node suite run during the contention replays | 2,250/0/150; not counted as the final run |

The browser total grew from 478 to 492 because the 14 M10 children registered this time. Skips are unchanged at 11: nine private-corpus cases, the nested real-JPEG EXIF case and the next-dev StrictMode case. Node's 150 skips are the existing `PHOTO_UI_URL`/dev/private gates. No private-corpus or dev-environment requirements were changed.

## Remaining issues

1. **New intermittent, out of scope: `photoMapInteractionSlice2Ui.test.mjs:337`** ("FOTO Slice 2: delivery colours everywhere …"). After `select('Kum 3')` at a laptop size, the selected marker never becomes the topmost element at its own centre (`elementFromPoint`), and the wait times out after 30 s. It reproduced in 1 of 3 standalone runs, so it is not caused by load or ordering. It passed in the prior agent's final run. The CSS change cannot reach it: the selector now matches strictly fewer elements, and only inside Rettinger. It likely involves the recent map-fitting/pan work (`8731e45`); unverified. It was not investigated further or changed, because the task forbids touching FOTO workflows. A focused follow-up is recommended: record which element covers the marker when it fails.
2. M10 editor disappearance: unresolved, as above. If the new diagnostic assertion fires, use its snapshot to tell selection loss, inspector-root remount and document replacement apart before any fix. Do not add a wait for a remounted editor.
3. `layerDataTableKeyboardUi` R2 intermittent (`aria-selected` missing right after entering Rettinger): observed only in the prior interrupted log; unresolved.
4. Unchanged from before: opt-in private-corpus and next-dev suites were not executed, and synthetic automation is not real-file or manual acceptance. Manual acceptance of the Masseendringer footer is recommended at both laptop sizes in a real browser window.

## Modified / untracked inventory

This task:

- `src/components/gmi-edit/gmiEdit.css`: one selector scoped (Task A)
- `tests/deliveryWizardUi.test.mjs`: diagnostic state assertion before the overwrite click (Task B)
- `docs/agent-reports/20261118-184646-regression-failure-resolution.md` (this report)
- `docs/agent-reports/assets/20261118-184646-regression-failure-resolution/{before,after}-m5b-review-{1280x720,1366x768}.png` (the before images are copies of the prior report's synthetic captures)

Pre-existing from the prior task (untouched): modified `tests/{buttonConsistencyUi,gmiEditBatchUi,gmiPhotoPlacementsUi,photoAcceptanceRenderingUi,photoDeliveryExclusionUi,photoExportLayoutUi,photoExportWizardUi,photoMarkerProvenanceUi,photoSpatialUi,photoWorkspaceStacksUi,photoWorkspaceUi,validationV2GmiA7}.test.mjs`; untracked `docs/agent-reports/20261118-180709-automated-regression-test-maintenance.md` and its assets folder.

Scratchpad only (not in the repository): the isolated build workspace, the replay script, logs and screenshots.

## Processes and Git

The task-owned production server (port 3197), the log monitor and all test Chrome instances (`gmi-photo-chrome-*` profiles) were stopped and verified gone. The servers on ports 3110–3113 were not started by this task and were left running. Nothing was staged, committed, pushed or deployed. HEAD remains `4bc35e9`.
