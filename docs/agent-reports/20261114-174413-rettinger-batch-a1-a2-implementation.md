# Rettinger batch editor UX: slices A1 + A2 — completion report

- **Task:** implement slices A1 (one active stage) and A2 (concise findings, details on demand) from `20261114-160730-rettinger-export-ux-consolidation-plan.md`.
- **Repository / branch / base:** `C:/GitHub/gmi-validering-test`, `feature/photo-workspace`, HEAD `8bb6f07` (unchanged; nothing committed).
- **Outcome:** implemented. Node 141/141 passed. ESLint clean. `npm run build` passed. The final production-browser gate passed **62/62** (the 53-test set plus `gmiEditDraftGuardUi` and the new A1 subtest). Twelve more affected suites passed 78/79; the one failure is pre-existing and identical at HEAD (§6).
- **Not done:** manual real-file acceptance (§8). A3–A7, FOTO exclusion and legacy removal were not touched.

## 1. Files changed

| File | Change |
|---|---|
| `src/components/gmi-edit/GmiBatchInspector.js` | A1 stage model, back navigation, narrowed draft guard, proposal focus; A2 inspected detail, preview «Detaljer», risk-dialog structure and wording |
| `src/components/gmi-edit/GmiSelectionProfile.js` | Profile collapsed to one summary line; «Hvorfor SJEKK?» disclosure |
| `src/components/gmi-edit/gmiEdit.css` | Styles for the above (existing tokens only); dead `.gmi-batch-object-detail dl` rule removed |
| `src/lib/gmiSelectionProfile.mjs` | **Outside the expected file list:** new pure helper `gmiProfileSummaryText` (adds 14 lines). It lives in the lib so it can be Node-tested; nothing existing changed |
| `src/components/gmi-edit/GmiConfirmDialog.js` | **Outside the expected file list:** focuses Cancel explicitly after `showModal()` (adds 3 lines; see §4.3) |
| 11 test files | Deliberate contract updates and new assertions (§5) |
| `docs/agent-reports/assets/20261114-174413-rettinger-a1-a2/` | 16 screenshots (synthetic fixtures) |

`LayerDataTable.js`, the editing/validation/export engines, `gmiBatchRiskReasons`, planners and the delivery wizard are unchanged.

## 2. Stage-state implementation (A1)

- **Stage derivation.** `batchStage = stagedChangeSet ? 'staged' : review && !editingSetup ? 'preview' : 'setup'`. `editingSetup` replaces the old `configOpen` disclosure. The root carries `data-batch-stage` (new stable hook) and `data-batch-step` 1/2/3 (kept).
- **Only one stage renders at a time.**
  - **Oppsett:** the collapsed profile line, the configuration form and the linked Tema/S_FCODE guidance. The primary action is «Forhåndsvis endringer». There is no proposal, options, dry-run status or staging button; previously a disabled «Legg til masseendring» was shown here.
  - **Forhåndsvis:** the proposal (count, breakdown, severity chips), the current-finding split, the profile line, the options (manual override, replace previous corrections) and the full-control status, then «Legg til masseendring» as the only primary action and a collapsed «Detaljer» below it. «Tilbake til oppsett» is a secondary compact button with a Phosphor `ArrowLeftIcon` (regular). It is never the primary style.
  - **Lagt til:** unchanged (`renderChangeSet` + «Ny masseendring for utvalget»; the selection is kept).
- **Back navigation.**
  - «Tilbake til oppsett» sets `editingSetup` only. The review, field, value, mode and match all stay, and focus moves to the «Felt» select.
  - While the review is kept, Oppsett shows «Tilbake til forhåndsvisningen» (secondary). It returns to the same review with no recomputation: the browser test asserts that the preview is valid, full control shows OK and the inspector is not busy immediately after the click.
  - Any setup input still calls the existing `invalidate()`. That drops the review (and now also resets `editingSetup`), so the return button disappears.
- **Stale previews.** A stale review stays in Forhåndsvis, with its existing alert and «Oppdater forhåndsvisning» as the only primary. **No staging button renders while stale.** `stage()` still rejects stale plans exactly as before. Returning from Oppsett never revives a stale preview (tested).
- **Progress indicator.** `aria-current="step"` and `data-done` now follow the visible stage, not `review`. A stale preview shows «Forhåndsvis (ugyldig)»: a text cue plus `data-step-stale`, in the compact warning colour.
- **Focus.** On entering Forhåndsvis, focus moves to the proposal kicker (`tabIndex=-1`, `.gmi-focus-ring`). This happens only if focus is in the inspector or on `body`, so focus in the Data Table is never taken. Tab from there reaches «Tilbake til oppsett», and Enter returns to the field select (keyboard-tested). «Ny masseendring» focus continuity (S5) is unchanged.
- **Draft guard.** `dirty = Boolean(lexeme || match !== null || review)`.
  - A field or mode choice alone no longer arms the workspace guard or `beforeunload` (tested: «Avslutt» closes without «Forkaste endringer i skjemaet?»).
  - Each operation was checked against the expression:
    - **Fill/Set:** the typed value arms the guard.
    - **Replace:** the chosen existing value (`match`) arms it, and so does the new value.
    - **Clear:** has no value input, so nothing is typed; any preview arms the guard.
    - **Linked Tema:** same rule as the other operations.
  - A kept review (in Oppsett or Forhåndsvis) keeps the guard armed. The typed-value case is tested.

## 3. Simplifications (A2)

- **Inspected object.**
  - The full attribute `<dl>` is removed; the Data Table owns it.
  - What remains: the object label, «Forhåndsvisning: field → «value» · outcome», Original / Foreslått nå, new and resolved findings, and «Eksisterende funn» in its existing `<details>`.
  - «Tilbake til masseendringen» gets a leading `ArrowLeftIcon`.
  - Without a preview, it shows a one-line pointer to the Data Table.
- **Selection profile.**
  - Collapsed by default to one line, for example «Utvalget: 5 ledninger · ulike verdier i Tema, Material, Dimensjon og Stedfestingsårsak», or «· ingen ulike verdier».
  - The disclosure holds every row, the distributions and «Behold bare disse», all unchanged. The narrowing notice stays visible outside the disclosure.
  - Narrowing focus now lands on the summary, which keeps the id `gmi-selection-profile-heading`.
- **Current-finding split.** The count line stays. The explanation sits in «Hvorfor SJEKK?», which is shown only when there is at least one SJEKK.
- **Linked Tema/S_FCODE.**
  - Oppsett: the full guidance (`data-gmi-linked-tema`), unchanged text.
  - Forhåndsvis: one line in the proposal, «Tema og S_FCODE endres sammen. FOTO bruker fortsatt Tema fra originalfilen.» (`data-gmi-linked-proposal`). The disclosure «Tema og S_FCODE: original og foreslått nå» is kept.
- **Preview footer.** «Slik leser du tabellen» and «Se nye og løste funn i hele datasettet» are grouped under one «Detaljer» disclosure, placed after the primary action. The full-control status, its run/cancel controls, failure alert and cross-object count stay visible.
- **Risk dialog.**
  1. Operation-specific lead line, for example «Tøm verdi: InnvendigUtvendig · 5 punkter endres». Clear shows no arrow or value.
  2. Operation-specific confirmation:
     - clear: «Bekreft at verdien skal tømmes for disse objektene.»;
     - replace: «…erstattes…»;
     - set/fill: the existing «Bekreft at samme verdi skal brukes på disse objektene.» (singular wording for one object).
  3. One short bullet per triggering reason: overwrite (populated count and replaced previous corrections, each shown only when greater than 0), mixed («Blandet blant objektene som endres: …»), linked Tema, and unvalidated field.
  4. New and worsened FEIL stay expanded with objects.
  5. The manual-inclusion list stays expanded (approval material).
  6. New SJEKK and improved findings are collapsible groups whose summary shows the count. Mixed-value distributions and «Eksisterende funn på feltet» are in `<details>`.

## 4. Preserved safety and approval behaviour

### 4.1 Unchanged logic

These are unchanged, because the diff touches no lines in them:
- `calculate`, `stage()`, generation tokens and `isLive`;
- stale/expanded detection;
- the B2 approval-selection identity checks;
- `getGmiFieldBatchApproval`;
- `gmiBatchRiskReasons` and its inputs, including the **B2 mixed trigger**;
- `diff.newCounts` gating;
- conflict/replace handling and `stageBlocked`;
- `gmiBatchTableReview` publication;
- the S5 column focus;
- narrowing (`gmiSelectionNarrowing`, shrink-only);
- the workspace guard wiring and «Rett én og én».

The only new state passed through: `reasons` (already computed) is stored on the risk record for presentation.

### 4.2 Gates re-verified in the browser

Mixed-value approval, new-FEIL approval, overwrite, previous-correction replacement, manual override, unvalidated field, stale approval refused after a selection change, undo/redo invalidation, verified GMI downloads (G4, G6, G8), and the input file left byte-identical.

### 4.3 `GmiConfirmDialog` fix (shared component, minimal)

- **Problem.** Collapsible `<summary>` elements in the dialog body made `showModal()` focus the first summary instead of «Tilbake til utvalget». React's `autoFocus` runs before `showModal()`.
- **Detection.** The R4 assertion «cancel is the default focus» caught it.
- **Fix.** The dialog now focuses its Cancel button explicitly after `showModal()`. This restores the documented contract («Cancel is the default (focused, Escape)»).
- **Scope.** The same latent issue applied to any confirmation that already contained «Eksisterende funn». Escape, focus containment and focus restoration are unchanged.
- **Regression check.** The other dialog users (workspace guard, `gmiEditBatchUi`, `layerDataTableKeyboardUi`, `gmiEditWorkspaceUi`) passed.

## 5. Tests

### 5.1 New coverage

- `gmiBatchInspectorUi`, new subtest «A1: exclusive … stages». It covers:
  - Oppsett renders no counts, dry-run, options or staging button;
  - a mode or field choice alone does not ask to discard; a typed value does, and Cancel keeps the value;
  - Forhåndsvis renders no form or field policy, focuses the proposal, has the profile and «Detaljer» collapsed and full control visible;
  - the back control's text, icon and secondary style;
  - the inspected object has no `dl` and no unrelated fields;
  - «Tilbake til oppsett» keeps field, value and mode and focuses the field;
  - «Tilbake til forhåndsvisningen» keeps the same valid preview without recompute;
  - keyboard Tab + Enter back to Oppsett;
  - an edit invalidates (no return button);
  - Lagt til keeps the selection, then «Ny masseendring» focuses the field;
  - the conflict gate is unchanged;
  - a stale preview shows «Forhåndsvis (ugyldig)» with no staging button, and returning does not revive it;
  - screenshots and no-overflow checks per stage at 1280×720 and 1366×768.
- `gmiBatchInspectorUi` G4 fill: «Legg til masseendring» is inside the inspector viewport at both laptop sizes (and would be at scroll position 0). The proposal top is under 140 px.
- `gmiBatchReplaceClearUi`: clear wording (exact), no «samme verdi», the operation line, and new FEIL listed without expanding.
- `gmiBatchRiskGateUi`: the mixed reason stays visible, distributions are collapsed by default, and «Hvorfor SJEKK?» appears only with a SJEKK.
- `gmiSelectionProfileUi`: collapsed by default with the exact summary line.
- `gmiR4UxPolishUi`: the SJEKK risk group is collapsed with its count visible; the FEIL group stays expanded.
- `gmiSelectionProfile.test.mjs`: Node test for `gmiProfileSummaryText` (bound/mixed/absent/ambiguous/null).

### 5.2 Deliberate updates (equivalent safety retained)

- **«Endre oppsett» → «Tilbake til oppsett»**: `gmiBatchInspectorUi` ×3, `gmiBatchFieldValueInputUi`, `gmiLinkedTemaUi`. The `calculate` helper now goes back to Oppsett, then «Forhåndsvis endringer».
- **Staging-button helpers treat "absent" as blocked**: `gmiBatchInspectorUi`, `gmiR4UxPolishUi`, `gmiBatchRiskGateUi`, `gmiSelectionProfileUi`.
  - Oppsett and stale previews no longer render the button. Assertions that expected it to be **enabled** are unchanged.
  - `gmiValidatorEditingUi` now asserts the button is absent in Oppsett, which is stricter than "disabled".
- **Collapsed content is opened before it is read**: the risk distributions, «Detaljer»/dataset findings, the profile rows and the SJEKK risk group. Each place first asserts the collapsed default.
- **`gmiLinkedTemaUi`**: the FOTO note is asserted in Oppsett; in Forhåndsvis, the guidance is absent and the one-line note is present.
- **`gmiBatchRiskGateUi`**: the «Hvorfor SJEKK?» assertion moved from the all-FEIL case (no disclosure there now) to the 3 FEIL / 1 SJEKK case.
- **Node source contracts** (`gmiBatchInspector.test.mjs`, `gmiEditWorkspace.test.mjs`): the `dirty` regex now matches the A1 expression and rejects the old `mode !== 'fill-missing'`.

No geometry, contrast or safety threshold was relaxed.

## 6. Commands and results

### 6.1 Static checks and build

- **ESLint:** `npx --no-install eslint` on all 4 changed JS/MJS sources and 11 test files. Clean.
- **Node:** `node --test` on `gmiBatchInspector`, `gmiIndividualSelection`, `gmiRettingerSidebar`, `gmiSelectionProfile`, `gmiBatchRiskGate`, `gmiBatchReplaceClear`, `gmiLinkedTema`, `gmiR4UxPolish`, `deliveryWizard`, `gmiEditWorkspace`, `gmiFieldBatchPlan`, `gmiEditBatch`, `gmiObjectLinkedTema` and `gmiTableReviewPresentation`. **141 passed, 0 failed, 0 skipped.**
- **Build:** `npm run build` passed («Compiled successfully»).
  - **Isolated copy.** It ran in a copy of the working tree in the session scratchpad. Three `next start` servers (3110, 3112, 3113) were serving this repository's `.next`, and a Codex process was active, so the shared `.next` was not overwritten.
  - **Copied `node_modules`.** Turbopack rejects a junctioned `node_modules` («Symlink node_modules is invalid»), so `node_modules` was copied.
  - **Source parity.** The final served build's `src` matched the repository (`diff -rq --strip-trailing-cr`).
- **`git diff --check`:** clean (only Git's LF→CRLF notices).

### 6.2 Production-browser gate

Serial (`--test-concurrency=1`), `PHOTO_UI_URL=http://127.0.0.1:3291`, task-owned `next start`.

- **Final gate: 62 tests, 62 passed, 0 failed, 0 skipped.** Suites: `gmiR4UxPolishUi`, `gmiValidatorEditingUi`, `gmiIndividualSelectionUi`, `gmiBatchInspectorUi`, `gmiBatchReplaceClearUi`, `gmiLinkedTemaUi`, `gmiBatchRiskGateUi`, `gmiSelectionProfileUi`, `gmiS5FocusContinuityUi`, `gmiEditDraftGuardUi`.
- **Additional affected suites: 79 tests, 78 passed, 1 failed.** Suites: `gmiBatchFieldValueInputUi`, `gmiValidatorReturnUi`, `gmiValidatorSelectionHandoffUi`, `gmiTableReviewUi`, `gmiLayerFiltersUi`, `gmiCheckboxSoftFocusUi`, `gmiObjectLinkedTemaUi`, `gmiEditBatchUi`, `gmiEditWorkspaceUi`, `layerDataTableKeyboardUi`, `gmiRettingerSidebarUi`, `gmiEditSelectionUi`.
  - **The failure is pre-existing:** `gmiTableReviewUi` «R4 follow-up» fails at `:75` with `'clip' !== 'ellipsis'` (Data Table cell truncation).
  - **Evidence:** I built HEAD `8bb6f07` from `git archive` in a second scratch folder, served it on 3292, and got the identical failure in 2/2 runs. It also failed 2/2 on the A1/A2 build. This task does not touch that code.

### 6.3 Intermittent failures seen during iteration (not in the final runs)

- **`gmiValidatorEditingUi` (M5C) step-1 timeout:** «Lag retting…» did not open the inspector within 30 s; the later subtests then cascade.
  - **Frequency with A1/A2:** 3 of 13 grouped R4→M5C runs (2 of them were the first gate run after a server start). It passed in the other 10, including 7 consecutive instrumented runs, and 1/1 standalone.
  - **At HEAD:** 0 of 4 grouped runs.
  - **History:** `20261113-191035` recorded the same intermittent symptom before this task, with the cause unproven.
  - **Status:** I found no code path by which A1/A2 affects mounting: `dirty` is false at mount in both versions, and the stage at mount is always `setup`. The failure could not be captured with diagnostics. **Causality is neither proven nor excluded.** Recorded as a risk.
- **`gmiS5FocusContinuityUi`:** the object-editor subtest failed once (the editor element was null between a `waitFor` and a click). That path is outside A1/A2. It passed 3/3 standalone and in 5 other gate runs.

### 6.4 Screenshots

Folder: [`assets/20261114-174413-rettinger-a1-a2/`](assets/20261114-174413-rettinger-a1-a2/). All synthetic fixtures; both sizes inspected.

| View | 1280×720 | 1366×768 |
|---|---|---|
| Oppsett | [a1-setup](assets/20261114-174413-rettinger-a1-a2/a1-setup-1280x720.png) | [a1-setup](assets/20261114-174413-rettinger-a1-a2/a1-setup-1366x768.png) |
| Forhåndsvis | [a1-preview](assets/20261114-174413-rettinger-a1-a2/a1-preview-1280x720.png) | [a1-preview](assets/20261114-174413-rettinger-a1-a2/a1-preview-1366x768.png) |
| Lagt til | [a1-staged](assets/20261114-174413-rettinger-a1-a2/a1-staged-1280x720.png) | [a1-staged](assets/20261114-174413-rettinger-a1-a2/a1-staged-1366x768.png) |
| Stale preview (+ inspected object) | [a1-stale](assets/20261114-174413-rettinger-a1-a2/a1-stale-1280x720.png) | [a1-stale](assets/20261114-174413-rettinger-a1-a2/a1-stale-1366x768.png) |
| «Tøm verdi» risk dialog | [g6-clear-risk](assets/20261114-174413-rettinger-a1-a2/g6-clear-risk-1280x720.png) | [g6-clear-risk](assets/20261114-174413-rettinger-a1-a2/g6-clear-risk-1366x768.png) |
| B2 mixed dialog (distributions opened by the test) | [gmi-b2-mixed](assets/20261114-174413-rettinger-a1-a2/gmi-b2-mixed-1280x720.png) | [gmi-b2-mixed](assets/20261114-174413-rettinger-a1-a2/gmi-b2-mixed-1366x768.png) |
| Profile (collapsed) | [gmi-b1-profile](assets/20261114-174413-rettinger-a1-a2/gmi-b1-profile-1280x720.png) | [gmi-b1-profile](assets/20261114-174413-rettinger-a1-a2/gmi-b1-profile-1366x768.png) |
| Linked Tema preview | [g8-linked](assets/20261114-174413-rettinger-a1-a2/g8-linked-1280x720.png) | [g8-linked](assets/20261114-174413-rettinger-a1-a2/g8-linked-1366x768.png) |

## 7. Remaining issues and limitations

- **Busy previews can still need inspector scrolling at 1280×720 (observed).**
  - In the R4 scenario «Sett verdi» on 4 lines, the inspector viewport is 446 px. With the conflict checkbox, a wrapped «Behold bare FEIL» and a two-line profile summary, «Legg til masseendring» sits about 19 px below the fold.
  - It fits at 1366×768, and for a single-field fill at both sizes, which is the plan's target and is now tested.
  - I did not compact the UI further (no new sizes or variants).
- **The proposal kicker shows a focus ring** after a mouse-driven preview in some cases (Chrome's `:focus-visible` heuristic after programmatic focus). This is intentional for keyboard and screen-reader continuity; flag it if it looks noisy in manual acceptance.
- **Open decisions are not settled:** D1 (scope of the B2 mixed trigger; unchanged), primary colour (Rettinger keeps its teal override), the close-control shape, and the selected/active row fills.
- **Line endings.** The working tree mixes CRLF (older checkouts) and LF (recently written files) under `core.autocrlf=true`. My edited files are LF, except `src/lib/gmiSelectionProfile.mjs`, which was CRLF and was kept CRLF. Git normalises both, so there is no content diff.
- **Recommendation (not done).** Investigate the M5C step-1 intermittent (§6.3) with a harness-level trace of the «Lag retting…» handoff.

## 8. Manual acceptance checklist (not yet performed)

1. Real file at 1280×720 and 1366×768: run fill, set, replace and clear batches, and confirm each goes Oppsett → Forhåndsvis → Lagt til with only one stage visible.
2. «Tilbake til oppsett» → «Tilbake til forhåndsvisningen» without edits keeps the same preview. Any edit removes the return button.
3. Choosing only a field or mode and then «Avslutt» gives no discard prompt. A typed value or a chosen «Eksisterende verdi» does.
4. Expanding the selection after a preview shows «Forhåndsvis (ugyldig)» and no staging button.
5. SP → VL S_FCODE batch (acceptance selection): the dialog fits without scrolling at 1280×720; the mixed distributions open from «Fordeling av blandede verdier»; the linked reason is shown.
6. «Tøm verdi» dialog wording; Escape cancels; focus returns to «Legg til masseendring».
7. Conflict replacement, undo of the staged batch (returns to Oppsett), and redo.
8. One keyboard-only pass: field → value → mode → «Forhåndsvis endringer» → Tab to «Tilbake til oppsett» → back → stage via the risk dialog.
9. Individual linked Tema/S_FCODE (still open from the roadmap; not affected by this task).

## 9. Git status and publication

- **Branch / HEAD:** `feature/photo-workspace` @ `8bb6f07`. Nothing staged, committed, pushed or deployed.
- **Modified (16):** the 5 source files and 11 test files listed in §1.
- **Untracked:**
  - this report and its screenshot folder (new);
  - the three pre-existing planning reports, unchanged: `20261113-182754-…`, `20261114-090612-…`, `20261114-160730-…`.
- **Servers.** Only my own servers on 3291 and 3292 were started, and both are stopped. The pre-existing listeners on 3110–3113 were left running.
- **Scratchpad.** It still holds the two isolated build copies (`a1a2-build`, `head-baseline`, each with a copied `node_modules`), the raw screenshots and the instrumented test copy. The harness blocked removing them; they sit outside the repository.
