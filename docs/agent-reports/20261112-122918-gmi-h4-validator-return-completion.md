# H4 — Return navigation from Rettinger to Validator: completion

Date: 2026-11-12, Europe/Oslo. Branch `feature/photo-workspace`; starting and final HEAD `3e39cb229ddad8cd6d201656a97f25a420906374`. The work is uncommitted.

## Scope and outcome

Implemented H4 from [the unified workflow plan](20261111-085500-gmi-validator-rettinger-unified-workflow-planning.md), section 4.8 and the H4 entry in section 9. Before editing, I read the [H3 completion report](20261112-113814-gmi-h3-validator-selection-handoff-completion.md), the H3 store and helper code, and the existing `openGmiValidator` / `GmiFullValidation` navigation.

1. **Validator-origin selection.** The Rettinger selection bar's informational provenance is now a link: **Tilbake til Validator · \<felt\>**, followed by "· N objekter valgt i Validator." The link opens the originating field/rule and geometry. It opens **Foreslått** when the layer has corrections and **Original** otherwise.
2. **After staging.** The staged ChangeSet details show **Kontroller i Validator (Foreslått)**. They show it only when the active ChangeSet changes at least one object handed off from the Validator. The single-object editor's "Rettingen er lagt til" message gets the same action under the same condition, which supports manual acceptance step 2 (one point). Ordinary corrections never get rule context: this covers a workspace without a Validator handoff and a ChangeSet outside the handed-off objects. An undone ChangeSet loses the action.
3. **Full validation.** With no dataset argument, **Åpne Validator** keeps an explicit user dataset choice. Without one, it opens Foreslått when corrections exist and Original otherwise.

H5, the B-group slices, ChangeSet/undo/export engines, validation rules, source-byte paths, dependencies and fixtures/manifests are unchanged.

## Implementation decisions

- **One navigation path.** Every route ends in the existing `openGmiValidator(layerId, dataset, ruleId, geometryScope)`. The new `openGmiValidatorFromRettinger(layerId, { changeSet })` store action runs through the mounted workspace's existing `gmiEditWorkspaceGuard`. «Åpne Validator» already used that guard through its `guard` prop. The action re-derives the target after the guard. If the workspace has closed or the ChangeSet is no longer active, it does nothing. Cancelling the guard publishes nothing, so the draft, workspace, handoff and selection stay intact.
- **Return context.** `validatorSelectionHandoff` adds `geometryScope` and the handed-off `keys` to the workspace handoff. Its validation is unchanged. The new pure helper `gmiValidatorReturnTarget` returns null when there is no provenance or geometry, so no rule context is invented. The rule focus is `provenance.ruleIds[0]`, falling back to `canonicalFieldId`.
- **Explicit vs automatic dataset.** The new runtime-only `gmiValidatorDatasetsBy[layerId]` is `'user' | 'auto'`. It follows the existing S5 `gmiEditTableViewBy` pattern and is cleared on layer removal and reset.
  - **Explicit (`user`):** the Validator «Datasett» menu, and the Original/Foreslått column buttons in the full comparison.
  - **Automatic (`auto`):** every other navigation default (`openGmiValidator`'s default), including the return link, «Kontroller i Validator» and the finding links.
  - The pure helper `gmiValidatorDefaultDataset` decides «Åpne Validator».
  - "Corrections exist" means `gmiEditStatus[layerId].changeSetCount > 0`, the same test U4 uses.
- **Validator focus fix.** The existing focus effect searched line presentations before point presentations. A point return for a field that has both point and line rules could therefore resolve the line presentation. The effect now searches the requested geometry first. This is a presentation-only change.
- **Dataset validity.** This is unchanged: the Validator still shows Foreslått only when the proposed dataset verifies (`proposed?.ok`) and otherwise falls back to Original. Session identity and handles are not touched. Navigation never stages, discards or revalidates corrections.

## Changed files

| File | Change |
| --- | --- |
| `src/lib/gmiValidatorEditing.mjs` | Handoff keeps `geometryScope`/`keys`; `GMI_VALIDATOR_DATASET_BY`, `gmiValidatorDefaultDataset`, `gmiValidatorReturnTarget`. |
| `src/lib/store.js` | `openGmiValidator` records `by`; `setGmiValidatorDataset` defaults to user; guarded `openGmiValidatorFromRettinger`; `gmiValidatorDatasetsBy` cleanup on removal/reset. |
| `src/components/LayerDataTable.js` | Provenance becomes the «Tilbake til Validator · felt» link (`data-gmi-validator-return`). |
| `src/components/gmi-edit/GmiEditWorkspace.js` | Computes rule context per active ChangeSet; passes the action to staged details and the object editor. |
| `src/components/gmi-edit/GmiChangeSetDetail.js` | «Kontroller i Validator (Foreslått)» action (`data-gmi-validator-check`). |
| `src/components/gmi-edit/GmiObjectEditor.js` | The same action after an individual stage, when context exists. |
| `src/components/gmi-edit/GmiFullValidation.js` | «Åpne Validator» default; explicit column buttons. |
| `src/components/validation-v2/ValidationV2Workspace.js` | Focus searches the requested geometry first. |
| `tests/gmiEditWorkspace.test.mjs` | 6 H4 Node tests (see below). |
| `tests/gmiValidatorReturnUi.test.mjs` | New H4 production browser suite. |
| `tests/gmiValidatorSelectionHandoffUi.test.mjs` | Deliberate update: the H3 provenance text assertion now expects the H4 link text. |
| `tests/gmiValidatorEditingUi.test.mjs` | Deliberate contract update, explained below. |

### Deliberate test contract update

The M5C/R5 browser test expected **Åpne Validator** to open Original after a batch had been staged with no dataset ever chosen. H4 deliberately changes this default to Foreslått, so the assertion now expects `proposed`. The rest of the test is unchanged and still checks that explicit choices are respected:
- it explicitly switches between Original and Foreslått;
- it verifies that Original is unchanged;
- it checks that a later «Åpne Validator» keeps the explicit Foreslått.

No safety assertion was removed.

## Checks

| Check | Result |
| --- | --- |
| `node --test tests/gmiEditWorkspace.test.mjs tests/gmiValidatorSelectionHandoff.test.mjs` | **37 passed, 0 failed, 0 skipped** (includes the 6 new H4 tests). |
| Full serial Node suite `node --test --test-concurrency=1 "tests/*.test.mjs"` | **2,123 total: 1,996 passed, 7 failed, 120 skipped.** All 7 failures are the existing baseline (see below). |
| `npm run build` (fresh, after all source edits) | **Passed.** |
| H4 browser suite (`gmiValidatorReturnUi`), production | **6 passed, 0 failed, 0 skipped.** |
| Serial production browser gate (20 suites, listed below) | First run: **141 total, 139 passed, 2 failed** — one failing M5C assertion plus its parent test. That is the contract change above. After the update, the `gmiValidatorEditingUi` rerun had **7 passed, 0 failed**. |
| ESLint, 12 changed JS/MJS files | **0 errors, 1 warning**: the existing TanStack `useReactTable` warning in `LayerDataTable.js`, also recorded by H3. |
| `git diff --check` | **Passed.** |

New Node coverage:
- **Return target:** no context without a handoff or geometry; Original vs Foreslått; ChangeSet overlap; rule fallback.
- **Dataset default:** the full matrix.
- **Store dataset intent:** automatic vs user, and cleanup on removal and reset.
- **Return through the guard, for points and lines:**
  - while the guard is pending or cancelled, the state object is identical;
  - after acceptance, the focus is `{ layerId, ruleId, geometryScope }` and the dataset is Original/auto;
  - the session and ChangeSets are unchanged and the source bytes are byte-identical.
- **After staging:**
  - an ordinary ChangeSet is refused with the state unchanged;
  - a handed-off ChangeSet opens Foreslått;
  - the return link opens Foreslått;
  - an undone ChangeSet is refused.
- **Source contract:** all routes reuse `openGmiValidator` through the guard.

What the H4 browser suite exercised, with a synthetic file at 1366×768 (the link was also checked at 1280×720):
- Validator SDR finding → tick lines 1 and 3 → «Åpne i Rettinger (2)» → «Tilbake til Validator · SDR» lands on Original, geometry Ledninger, «Original · SDR», with no ChangeSet.
- A second handoff with an unsubmitted batch draft (field SDR, value 11): the return link raises the draft guard; «Avbryt» keeps the field and value, the selection [1, 3], the workspace and zero ChangeSets.
- Preview and stage: the return link switches to Foreslått, and «Kontroller i Validator (Foreslått)» lands on «Foreslått · SDR» with the SDR FEIL count reduced by exactly 2 (5 → 3).
- From a Foreslått inspection the return link opens Foreslått. An ordinary Rettinger workspace has no return or check action.
- «Åpne Validator» opens Foreslått with corrections. After an explicit Original choice in the dataset menu, «Åpne Validator» keeps Original.
- The input file bytes are unchanged and no runtime exceptions occurred.

I inspected screenshots of the return link at 1280×720 and 1366×768, the guard dialog, the staged details with the action, and the Validator after the check. Controls were reachable and no page overflow was seen.

Browser gate suites, run serially against task-owned `http://127.0.0.1:3193`:
- H4 and H3/H2: `gmiValidatorReturnUi`, `gmiValidatorSelectionHandoffUi`, `gmiValidatorSelectionUi`
- T1 and G5: `layerTableRevealUi`, `gmiBatchFieldValueInputUi`, `gmiFieldValueInputUi`
- Rettinger standing gate: `gmiEditWorkspaceUi`, `gmiEditDraftGuardUi`, `gmiEditValidationUi`, `gmiValidatorEditingUi`, `gmiLayerFiltersUi`, `gmiEditSelectionUi`, `gmiBatchInspectorUi`, `gmiR4UxPolishUi`, `gmiEditBatchUi`, `layerDataTableGeometryUi`, `layerDataTableKeyboardUi`, `gmiRettingerSidebarUi`
- S5 and Validator counts: `gmiS5FocusContinuityUi`, `validationV2RuleCountsBrowser`

## Baseline failures versus regressions

The 7 full-suite failures are the ones H3 recorded, by test name:
- `appInfoUiContract`: 1
- `statsUiContract`: 2
- `terrainPhotoGml`: 1 (optional external corpus)
- `validationV2WorkspaceInspector`: 3 (sidebar width, workspace-shell placement, map/3D resize)

I edited `ValidationV2Workspace.js`, so I checked the three inspector failures: all three report mismatches against `src/app/page.js` source text, which this task did not change. The totals moved only by the 6 new Node tests (passed) and the new browser suite (skipped in the plain Node run because no app URL is configured). No regression failure remains.

## Not run, and remaining acceptance

- I did not run a separate `next dev` (Strict Mode) pass. H4 adds no effects or mount lifecycle, but this was not verified under development effect replay.
- Manual acceptance on the real delivery has not been done. That is section 10, steps 1–2 (one point → ID → add → «Kontroller i Validator (Foreslått)» shows FEIL reduced by one), plus a keyboard-only pass. Automation used synthetic data only; no contractor or private corpus was opened.
- One observation, left unchanged: the draft-guard dialog says "verdier for objektet" even when the draft is a batch draft. This is the existing default text that «Åpne Validator» already used. A route-specific wording could be considered later.
- «Kontroller i Validator» appears only in the staged variant of the details panel and in the object editor's success message. Opening a ChangeSet later from Endringer (history) does not show it, because no per-ChangeSet provenance is stored. That is a possible follow-up if wanted.

## Git and resources

- No staging, commit, push, branch or ref change, synchronization or deployment.
- The three original untracked planning reports are untouched.
- Only the files listed above and this report were added or modified.
- Task-owned resources were cleaned up:
  - the production server on port 3193 was stopped;
  - temporary edit scripts were removed;
  - the browser harness removed its fixture directory.
- Logs (`%TEMP%/gmi-h4-*.log`) and screenshots (`%TEMP%/gmi-h4-screenshots/`, `%TEMP%/gmi-h4-gate-screenshots/`) remain in the system temp directory.
- I did not touch the pre-existing `node --test` process (PID 22704, running app-info/stats/terrain tests) or the Codex process I found running.
