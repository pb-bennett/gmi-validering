# Rettinger batch inspector: laptop layout regression correction

Date: 2026-11-13, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`.

**Git state:**
- **Start:** HEAD `b9173ba` (as expected), 4 commits ahead of origin. The only untracked file was the [roadmap audit](20261113-182754-rettinger-roadmap-reconciliation.md); it is left untouched.
- **Changes:** two application files, this report, and one screenshot folder.
- **Publication:** nothing was staged, committed, pushed or deployed.

## 1. Outcome

- **Both suites confirmed failing at HEAD.** The two production-browser suites that the audit flagged fail at HEAD. Measurement shows the cause is B3's «Rett én og én» block at the top of the batch inspector. That block is an 82 px tall full-width button plus a five-line paragraph.
- **The fix:**
  - «Rett én og én» becomes a compact secondary button in the inspector header, next to «Avslutt».
  - The field-policy explanation moves into the configuration form, under «Felt», where it applies.
- **Results:**
  - Both suites now pass.
  - The full requested browser gate passes: **53/53**.
- **Unchanged:**
  - Editing behaviour.
  - Planners, gates, G6/G8 logic, selection/handoff identity and the legacy workflows.
  - All test assertions.

## 2. Reproduction at HEAD `b9173ba`

**Setup:**
- Fresh `npm run build`, served on task-owned port 3281 (`next start`).
- `PHOTO_UI_URL=http://127.0.0.1:3281`.
- Existing Chrome harness, serial `node --test --test-concurrency=1`.

### 2.1 First grouped run (`gmiR4UxPolishUi` then `gmiValidatorEditingUi`)

17 tests: 8 passed, 9 failed.

| Suite / subtest | Failure |
|---|---|
| `gmiR4UxPolishUi` › «icon table-size toggle and laptop layouts with a live preview» | `tests/gmiR4UxPolishUi.test.mjs:321`: `summaryTop < 140` («the proposed correction is visible without scrolling») |
| `gmiValidatorEditingUi` › «defaults to Original…» | In this run only: a 30 s timeout at `:74` waiting for `batchStep === '1'` after «Lag retting…». The 5 later subtests failed as a consequence |

### 2.2 Two standalone reruns of `gmiValidatorEditingUi`

Both reruns gave identical results:
- 2 passed, 6 failed.
- «defaults to Original…» passed both times.
- «exact scope preserved…» failed at `:121`: `bounds.every(b => b.width > 0 && b.right <= width && b.bottom <= height)`.
- The later subtests failed as a consequence.

This matches the failure that the T2/T3/U reports recorded from `9c98031` on.

### 2.3 Isolating the step-1 timeout

A diagnostic replica in the scratchpad repeated the steps one at a time: one or two layers, with and without the U1 viewport changes. In every variant, «Lag retting…» opened the inspector at step 1. The step-1 timeout is therefore **intermittent**: 1 of 3 runs before the fix, 0 of 4 runs after it. Its cause is **not proven** (see §6).

### 2.4 Measured layout

I made instrumented copies of both tests in the scratchpad. The only additions were logging and screenshots placed before the unchanged assertions; the repository tests were not modified.

**R4 inspector at 1920×1080**, step 2, offsets from the top of the aside:

| Element | Top (px) | Height (px) |
|---|---|---|
| Header | 10 | 35 |
| **`.gmi-individual-alternative`** | **61** | **82** |
| Steps | 158 | 16 |
| Proposal `[data-gmi-batch-counts]` | **182** | — |

The proposal's 182 px breaks the 140 px limit. The test stops at this first size, so 1366 and 1280 were not reached.

**M5C/R5 at the exact-scope step**, 2 lines selected, step 2. The selector `[data-gmi-batch-inspector]` is the content element inside the scrolling `.gmi-edit-inspector`:

| Viewport | Scroller height | Inspector content height | Content bottom | Result |
|---|---|---|---|---|
| 1366×768 | 476 | 732 | 731.8 ≤ 768 | Pass |
| 1280×720 | 446 | 732 | **731.8 > 720** | **Fail** |

The selection bar and grid were within bounds at both sizes.

## 3. Proven root cause

- **Which commit.** B3 (`9c98031`) inserted `.gmi-individual-alternative` between the inspector header and the step list. It took 82 px plus a 16 px margin, about 98 px in total. B2's gate (148/148) had both suites green just before it. B3's own gate did not include either suite.
- **Proof.** Removing that block from the header area is the only layout change. It moves the proposal from 182 px to **76.7 px** at every size, and reduces the M5C content from 732 px to **610 px**.
- **Assertions unchanged.** No assertion threshold was changed.
- **The R5 bounds failure has the same cause.** It is not a separate workflow defect.

## 4. Changes

### `src/components/gmi-edit/GmiBatchInspector.js`

- **«Rett én og én» moves into the header.** It sits in a new `gmi-batch-head-actions` group before «Avslutt».
  - Same label, `onEditIndividually` handler and `disabled={!scopeProblem.ok || busy}` rule.
  - New `title`, plus `aria-describedby` pointing to a visually hidden description: «Rett objektene i utvalget ett om gangen, med ulike verdier eller andre felt. Utvalget beholdes.»
  - `data-gmi-individual-entry` hook.
- **The field-policy paragraph moves into the configuration form.** It now sits under «Felt» and the existing «tom i N av M» hint, spanning both columns. `data-gmi-field-policy` hook. The text is kept and prefixed with «Ulike verdier eller andre felt per objekt: bruk «Rett én og én».»
  - It is visible during setup and with «Endre oppsett».
  - It is hidden in the collapsed step-2 summary.
- **Supporting code:** `useId` import, the `INDIVIDUAL_HINT` constant, and the `individualHintId` hook.

### `src/components/gmi-edit/gmiEdit.css`

- The now-unused `.gmi-individual-alternative` rule is replaced by `.gmi-batch-head-actions` (flex, wrap, 6 px gap, aligned end).
- Added `.gmi-inspector-config .gmi-batch-field-policy { grid-column: 1 / -1; margin: 0 }`.

### Intermediate correction

A first version put the policy paragraph in the config grid's second column, which stretched the «Felt» select to about 60 px. The 1366×768 step-1 screenshot showed it. I moved the paragraph after the «tom i …» hint and made it span the full width, then rebuilt and re-verified.

### Not changed

- Planners, ChangeSets, Validator rules and risk gates.
- G6 replace/clear and G8 linked Tema logic.
- Selection, handoff and B3 navigation and guards.
- `GmiBatchDialog`, «Lag retting…», FOTO and export.
- All tests.

## 5. Verification (final code, fresh build)

### Passed

- **ESLint:** `npx --no-install eslint src/components/gmi-edit/GmiBatchInspector.js`, 0 errors and 0 warnings. CSS has no lint target; it is covered by the build and computed browser layout.
- **Node:** `node --test tests/gmiBatchInspector.test.mjs tests/gmiIndividualSelection.test.mjs tests/gmiRettingerSidebar.test.mjs`: **14/14 passed**, 0 skipped.
- **Build:** `npm run build` passed («Compiled successfully»). The build was rerun after the final CSS/JSX edit.
- **Two-suite rerun after the main fix:** `gmiR4UxPolishUi` + `gmiValidatorEditingUi` passed **17/17**. Before the fix: 8/17 (grouped run) and 2/8 (each standalone run).
- **Full requested production-browser gate on the final build,** serial, port 3281: **53 tests, 53 passed, 0 failed, 0 skipped**. Suites:
  - `gmiR4UxPolishUi`, `gmiValidatorEditingUi`
  - `gmiIndividualSelectionUi`, `gmiBatchInspectorUi`, `gmiBatchReplaceClearUi`
  - `gmiLinkedTemaUi`, `gmiBatchRiskGateUi`, `gmiSelectionProfileUi`
  - `gmiS5FocusContinuityUi`

  Together these exercise 1280×720 and 1366×768, risk/confirmation dialog bounds (B2, G6, G8), verified exports, and draft guards. An identical earlier run (before the policy-placement correction) also passed 53/53.
- **Instrumented re-measurement on the final build** (17/17 passed):
  - R4 `summaryTop` is **76.7 px** at 1920×1080, 1366×768 and 1280×720.
  - M5C inspector content bottom is **609.8 px** at both laptop sizes; the grid bottom is 697.5 at 1280×720 and 745.5 at 1366×768.
- **Focused evidence script** (scratchpad, synthetic file, Validator «Lag retting…» → inspector) at both laptop sizes:
  - **Header:** one row, 35 px, no overflow, no page horizontal overflow.
  - **Keyboard order:** focus «Rett én og én» → Tab → «Avslutt» → Shift+Tab → «Rett én og én». The focus ring is visible in the screenshot.
  - **Labels:** `title` and the `aria-describedby` text both resolve.
  - **Step 1:** the policy text is visible and the configuration starts at 187 px.
  - **Step 2:** the proposal is at 77 px.
  - **Keyboard entry:** Enter on «Rett én og én» with a dirty preview opens the existing guard («Forkaste endringer i skjemaet?»). «Forkast skjemaet» then opens «Objekt 1 av 3 i utvalget».
  - **Exceptions:** 0 runtime exceptions.
- **Screenshots inspected:**
  - Step 1 and step 2 at both sizes.
  - R5 review at both sizes.
  - G6 replace setup at 1366×768, G8 linked values at 1280×720. The G6 operation picker and actions are reachable by scrolling the inspector; G8 linked/FOTO information is unchanged.
- **`git diff --check`:** passed (the only output is Git's normal LF→CRLF notice).

### Screenshots

Folder: `assets/20261113-191035-rettinger-layout/`. All synthetic fixtures.

| View | 1280×720 | 1366×768 |
|---|---|---|
| Before: R5 review at HEAD | [before-r5](assets/20261113-191035-rettinger-layout/before-r5-1280x720.png) | [before-r5](assets/20261113-191035-rettinger-layout/before-r5-1366x768.png) |
| After: R5 review | [after-r5](assets/20261113-191035-rettinger-layout/after-r5-1280x720.png) | [after-r5](assets/20261113-191035-rettinger-layout/after-r5-1366x768.png) |
| After: setup (step 1, keyboard focus on «Rett én og én») | [step1](assets/20261113-191035-rettinger-layout/after-step1-1280x720.png) | [step1](assets/20261113-191035-rettinger-layout/after-step1-1366x768.png) |
| After: preview (step 2) | [step2](assets/20261113-191035-rettinger-layout/after-step2-1280x720.png) | [step2](assets/20261113-191035-rettinger-layout/after-step2-1366x768.png) |

There is no R4 «before» screenshot at laptop sizes, because that test stops at its first failing size (1920×1080). The R5 «before» images show the same B3 block.

### Not run

- The full serial Node suite (`tests/*.test.mjs`).
- A development Strict Mode pass.

The change is presentation-only in one component and one stylesheet.

## 6. Outstanding items and manual checks

- **Intermittent «Lag retting…» timeout (not fixed, cause unproven).**
  - **Observed:** 1 failure in 3 pre-fix runs; it did not recur in 4 post-fix runs.
  - **Hypothesis (unverified):** `startCorrection` in `ValidationV2Workspace.js` returns silently when the Validator `result` changes between the click and `gmiEditSessions.open()`. The U1 subtest edits and restores Kontrolldato just before the click, which could trigger such a re-validation.
  - **Why left alone:** this is in the legacy correction workflow, which is out of scope here. If it recurs, investigate it as its own task.
- **«Legg til masseendring» is below the fold in step 2** at both laptop sizes (top at about 522 px inside a 446/476 px inspector). It is reachable by scrolling, which was also true before B3. The R4 contract covers proposal visibility only. No change was made.
- **Draft-guard wording.** The guard text still says «verdier for objektet» for a batch draft. This was already recorded in the H4 report; unchanged.
- **Manual checks:**
  - A real-file pass at both laptop sizes, with one keyboard-only run.
  - A screen reader announcing «Rett én og én» with its description.
  - Readability of the policy text in the setup form.
  - Your normal theme and zoom.

## 7. Resources

- **Built `.next` in place.** The build replaced the repository's `.next`, following earlier task reports' precedent. Pre-existing `next start` listeners on 3110, 3112 and 3113, which run from this repository, plus a 3111 listener from another scratch folder, were left running and not stopped. Those three repository servers now serve the rebuilt `.next`.
- **My server is stopped.** Only the task-owned server on port 3281 was started; it has been stopped, and 3281 is free.
- **Logs** (`%TEMP%`):
  - Builds: `rl-build-before.log`, `rl-build-after.log`, `rl-build-final.log`
  - Before runs: `rl-before.log`, `rl-before-m5c-rerun1.log`, `rl-before-m5c-rerun2.log`
  - After runs: `rl-after-two.log`, `rl-gate.log`, `rl-gate-final.log`
  - Node: `rl-node.log`, `rl-node-final.log`
- **Scratchpad (diagnostics):** instrumented copies, diagnostic and evidence scripts, and the raw screenshots, in the session scratchpad.
