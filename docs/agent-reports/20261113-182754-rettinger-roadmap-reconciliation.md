# Rettinger roadmap reconciliation (read-only audit)

Date: 2026-11-13, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `b9173ba` (as expected). The working tree was clean at the start. The branch is 4 commits ahead of `origin/feature/photo-workspace`. This task added only this report. No application, test, configuration or planning files were changed. Nothing was staged, committed, pushed or deployed. No tests, builds or servers were run.

## 1. Sources and method

- **Original plans are not in this checkout.** `20261111-085500-…-unified-workflow-planning.md` and `20261111-092840-…-general-batch-editing-architecture.md` are absent, and so is `20261111-093345-…`. Every completion report describes them as *untracked* local files. Milestone definitions below are therefore taken from how the committed reports quote them, mainly the [G4 UI refinements plan](20261111-132049-gmi-g4-ui-refinements-plan.md) and the [integrated workspace plan](20261110-063536-gmi-rettinger-integrated-workspace-planning.md) §9.
- **X1–X3 are not defined in any available document.** This report treats them as the structural column-insertion group. That group corresponds to M6 «Structural column add (experimental)» in [the combined delivery plan](20261108-gmi-editing-combined-delivery-planning.md) §M6.
- **Method.** For every classification below, I checked the code and test files that the reports name, using grep/inspection at HEAD. Automated pass/fail statements are quoted from the reports; this audit did not re-run them.

## 2. Status matrix

Legend: **C** complete · **P** partially complete · **S** superseded/absorbed · **N** not implemented · **MA** requires manual acceptance (no milestone below has real-file acceptance).

### G1–G8: general batch editing

| # | Scope (as quoted) | Status | Evidence at HEAD | Remaining gap |
|---|---|---|---|---|
| G1 | Field capabilities and value domains | C · MA | `validation-v2/fieldValueDomain.js`; `gmiEditFields.mjs` `describeGmiEditColumns` (including `operationKind` 'linked-tema'/'hydraulic'/'generic'); `tests/gmiEditFields.test.mjs`. [Report](20261111-095817-gmi-g1-field-capabilities-completion.md) | None in code |
| G2 | Batch planning engine (fill/set) | C · MA | `gmiFieldBatchPlan.mjs` `prepareGmiFieldBatch`/`buildGmiFieldBatch`; `changeSet.mjs` intent metadata; `tests/gmiFieldBatchPlan.test.mjs`. [Report](20261111-103924-gmi-g2-batch-planning-completion.md) | Large real-file performance not measured |
| G3 | Dataset dry run | C · MA | `gmi-edit/dryRun.mjs`, `validation-v2/findingDiff.js`, `dryRunGmiFieldBatch`/`getGmiFieldBatchApproval`; `tests/gmiEditDryRun.test.mjs`. [Report](20261111-111237-gmi-g3-dataset-dry-run-completion.md) | Private-corpus benchmark always skipped (`GMI_EDIT_CORPUS` unset) |
| G4 | Batch inspector, points and lines, plus refinements S1–S6 | C · MA | `GmiBatchInspector.js`, `useGmiBatchValidation.js`, `gmiBatchInspectorView.mjs` (`gmiInspectorMixedFields` reads the checked ChangeSet), `GmiSeverityIcon.js`, contextual redo `data-gmi-context-redo`. Reports: [G4](20261111-120451-gmi-g4-batch-inspector-completion.md), [Pass 1](20261111-161543-gmi-g4-ui-refinements-pass1-completion.md), [Pass 2](20261111-170534-gmi-g4-ui-refinements-pass2-completion.md), [Pass 3](20261111-184639-gmi-g4-ui-refinements-pass3-s5-completion.md), [undo focus](20261111-201500-gmi-g4-undo-focus-completion.md) | Architecture §10.5 keyboard-only pass not done. **Laptop-layout regression, see §3.1** |
| G5 | Field-type controls (D1–D3) | C · MA | `GmiFieldValueInput.js` (object/batch variants, combobox), `gmiEditObjectReviewErrors`; `tests/gmiFieldValueInputUi.test.mjs`, `gmiBatchFieldValueInputUi.test.mjs`. Reports: [D1/D2](20261112-085935-gmi-g5-d1-d2-completion.md), [D3](20261112-092604-gmi-g5-d3-completion.md) | None in code |
| G6 | Exact replace and clear | C · MA | `gmiFieldBatchPlan.mjs` replace/clear branches, exact-lexeme picker in `GmiBatchInspector.js`; `tests/gmiBatchReplaceClear*.test.mjs`. Commit `04da5b8`, [report](20261113-173508-gmi-g6-replace-clear-completion.md) | The replacement value must be non-whitespace (empty output only through «Tøm verdi»). This is by design |
| G7 | Selection profile and narrowing (per the G4 plan §8) | S | Absorbed by B1/B2: `gmiSelectionProfile.mjs`, `GmiSelectionProfile.js`, `gmiBatchRiskReasons` (changing-object scope, as the S1 note required). No standalone G7 report exists. The G6/G8 reports use "G7" for the intent metadata, which G2 already delivered | Naming inconsistency only |
| G8 | Linked Tema/S_FCODE | P · MA | Batch path is complete: `linkedSourceKeys` in `gmiEditFields.mjs`, paired planner, linked risk reason, FOTO notice; `tests/gmiLinkedTema*.test.mjs`. Commit `b9173ba`, [report](20261113-180645-gmi-g8-linked-tema-completion.md) | **The individual editor is not linked** (§3.2) |

### H1–H5: Validator integration

| # | Scope | Status | Evidence at HEAD | Remaining gap |
|---|---|---|---|---|
| H1 | Selection host | C | `gmiEditSelection.mjs` host identity; `store.js` 4-argument `changeGmiEditSelection`; `tests/gmiEditSelection.test.mjs`. [Report](20261112-100725-gmi-h1-u4-completion.md) | — |
| H2 | Checkbox selection in Validator inspections (contextual Data Table) | C · MA | `tableInspection.js`/`objectTableInspection.js` `selectionContext`; host-aware checkboxes in `LayerDataTable.js`; `tests/gmiValidatorSelectionUi.test.mjs`. [Report](20261112-104300-gmi-h2-validator-selection-completion.md). The contextual field column was added by `42a2294` ([report](20261113-080005-contextual-table-columns-redo-completion.md)) | — |
| H3 | Handoff to Rettinger | C · MA | «Åpne i Rettinger (N)» (`LayerDataTable.js:1120`), `validatorSelectionHandoff`; `tests/gmiValidatorSelectionHandoff*.test.mjs`. [Report](20261112-113814-gmi-h3-validator-selection-handoff-completion.md) | Real delivery (1 point InnvendigUtvendig, 12 lines SDR) not exercised |
| H4 | Return to Validator | C · MA | `openGmiValidatorFromRettinger`, `gmiValidatorReturnTarget`, `gmiValidatorDatasetsBy`; `tests/gmiValidatorReturnUi.test.mjs`. [Report](20261112-122918-gmi-h4-validator-return-completion.md) | Optional follow-ups the report records: «Kontroller i Validator» is missing from history details; the guard wording says «objektet» for batch drafts |
| H5 | Remove the legacy correction workflow | N (deferred) | Legacy paths still exist: Validator «Lag retting…» (`ValidationV2RuleList.js:110` → `prepareValidatorCorrection`, limited to `CORRECTABLE_RULES` SDR/Trykklasse/Ringstivhet) and footer «Masseendringer» → `GmiBatchDialog` (`GmiEditWorkspace.js:385,418`) | Must wait for real-file acceptance of H2–H4. The R5 path's browser suite is currently red (§3.1) |

### B3: «Rett én og én»

| # | Status | Evidence | Gap |
|---|---|---|---|
| B3 | C · MA, but it caused a regression | Itinerary helper in `gmiBatchInspectorView.mjs`; sticky navigation `data-gmi-individual-selection` in `GmiEditWorkspace.js`; `tests/gmiIndividualSelection*.test.mjs`. Commit `9c98031`, [report](20261112-203813-gmi-b3-individual-selection-completion.md). B1/B2 are also complete: [B1](20261112-124445-gmi-b1-selection-profile-completion.md), [B2](20261112-130647-gmi-b2-batch-gates-completion.md) | B3's gate omitted `gmiR4UxPolishUi` and `gmiValidatorEditingUi`; both fail from this commit on (§3.1). Individual edits of Tema are not linked (§3.2) |

### U1–U6 and T1–T3: usability

| # | Scope | Status | Evidence at HEAD |
|---|---|---|---|
| U1 | Aligned Lag/Datasett/Kontrolldato header | C · MA | `677f783`; [U report](20261113-070054-validator-rettinger-ui-refinements-completion.md); U1 subtest in `gmiValidatorEditingUi.test.mjs:53` |
| U2 | Shared severity icons | C (delivered as G4 S3) | `GmiSeverityIcon.js`, used by the object editor, batch inspector, profile and table |
| U3 | Legend collapse/restore on entering the workspace | C | `mapPanePresentation.mjs`; `validatorRettingerRefinements.test.mjs` |
| U4 | Mode buttons only when meaningful | C | `gmiTableViewControls` (`gmiEditView.mjs:23`) |
| U5 | Contextual redo | C (delivered as G4 S6, emphasised in `42a2294`) | `GmiChangeList.js`, notice redo in `GmiEditWorkspace.js` |
| U6 | Shared filter disclosure state | C | `src/lib/useLayerFilterDisclosure.js`, used by `LayerPanel`, `LayerFilterSections`, `GmiLayerFilters` |
| T1 | Row reveal and «Vis i Foreslått» | C · MA | `layerTableReveal.mjs`; `tests/layerTableReveal*.test.mjs`. [Report](20261112-111319-t1-row-reveal-completion.md). Manual Tema-filter check is recommended |
| T2 | Foreslått after staging | C (mostly via S5; T2 added the `result.staged` guard) | `gmiTableViewAfterStage`, `showGmiEditProposedAfterStage`. [Report](20261112-211827-gmi-t2-proposed-after-staging-completion.md) |
| T3 | Checkbox soft focus | C · MA | `gmiObjectFocusIntent`, `soft` flag in `store.js`; `tests/gmiCheckboxSoftFocus*.test.mjs`. [Report](20261112-222120-gmi-t3-checkbox-soft-focus-completion.md) |

The U report lists remaining manual checks: Kontrolldato screen-reader naming, keyboard-only filter disclosure, and recognising FEIL/SJEKK without colour.

### R7 and X1–X3: not proposed as next steps

| # | Status | Dependencies |
|---|---|---|
| R7: retire `GmiBatchDialog` | N | Real-file acceptance of the inspector path (G4–G8, B1–B3). Integrated plan §9 requires "R4, R5 accepted" plus a full gmiEdit/Validator/FOTO regression. The modal still has whole-layer hydraulic review with «Bare nye feil», search and paging; the inspector covers this through table selection. It also still uses `WarningCircleIcon` |
| H5 (see above) | N | H2–H4 acceptance; a green `gmiValidatorEditingUi`; a decision on whether «Lag retting…» is removed or re-pointed at H3 |
| X1–X3: structural column insertion | N | Not defined here. M6 requires an `add-column` ChangeSet in the M1 patch engine and Gemini acceptance before it can be enabled. Current code refuses explicitly: `field-absent` «Kolonnen finnes ikke i filen…» (`gmiEditView.mjs:101`) and `insert-column` → `unsupported-operation` (`tests/gmiFieldBatchPlan.test.mjs:167`) |

## 3. Observed gaps that affect acceptance

### 3.1 Red production browser suites since B3

This is observed in reports and corroborated by the diff. It was not re-run in this audit.

- **Last green run.** The B2 gate (HEAD `f62a287`, B2 work uncommitted) passed 148/148, including `gmiR4UxPolishUi` and `gmiValidatorEditingUi`.
- **Failing since `9c98031`.** The T2 and T3 reports reproduced on baseline `9c98031`/`633ad6c`:
  - `gmiR4UxPolishUi`: the «proposed correction is visible without scrolling» assertion `summaryTop < 140` fails (`tests/gmiR4UxPolishUi.test.mjs:321`).
  - `gmiValidatorEditingUi` (M5C/R5 «Lag retting…» workflow): the inspector/grid viewport bounds assertion fails (`:121`), and 4–5 dependent subtests fail with it.
- **Still failing at `677f783`.** The U report confirmed both and ran U1 with a `--test-skip-pattern`.
- **Not re-run since.** No later report runs either suite. That includes `42a2294`, the test-failure investigation `e1d3ff6`, G6 and G8. The investigation covered only Node and FOTO browser failures. The claim "relevant browser suites recently passed" therefore does **not** cover these two suites.
- **Probable cause.** B3 inserted the «Rett én og én» block with a long explanatory paragraph at the top of `GmiBatchInspector`, above the step list and proposal (`git show 9c98031 -- src/components/gmi-edit/GmiBatchInspector.js`). G6's operation picker and G8's linked notes have since added more content to the same panel. This is a probable cause; it has not been confirmed by a browser run.
- **Impact.** At 1280×720 and 1366×768, the batch proposal can be pushed below the fold. The legacy R5 path that H5 would replace has no passing automated regression.

### 3.2 Individual edits can split a Tema/S_FCODE pair

This is verified at source level and not exercised in a browser.

- **The individual editor ignores the pair.** `GmiObjectEditor.js` reads `describeGmiEditColumns` but never consults `operationKind`/`linkedSourceKeys`. Tema and S_FCODE therefore remain separately editable in the object form, and so in B3 «Rett én og én».
- **The resulting conflict does not reach the FEIL gate.** A disagreement yields `TEMA_CONFLICT` as CHECK/INDETERMINATE (`fieldPolicy.js:306`, `ruleEvaluation.js:372`), not FEIL. D2's new-FEIL review gate therefore does not stop it.
- **G8's scope.** The G8 report scoped the individual form out explicitly.

## 4. Recommendations

### Slice 1 (recommended): restore the laptop layout of the batch inspector and green the two red suites

- **Scope:**
  - Establish the baseline: fresh build, free port, then run `gmiR4UxPolishUi` and `gmiValidatorEditingUi` serially at HEAD and record which assertions fail.
  - Fix the cause in `GmiBatchInspector.js` and `gmiEdit.css` only. Keep «Rett én og én» as a compact secondary action and move or shorten its explanation so the proposal summary is near the top of the inspector again. Options: a one-line hint with a `title`/disclosure, or placement after the proposal box, which is how B1 placed the profile. Check that G6's operation controls and G8's linked notes stay within the viewport at both sizes.
  - Do not relax `summaryTop < 140` or the viewport-bounds assertion. If the M5C failure has a cause other than layout, report it separately and do not mask it.
- **Out of scope:** planner, gates, ChangeSets, R5/H5 behaviour, `GmiBatchDialog`.
- **Verification:**
  - Node: `gmiBatchInspector`, `gmiIndividualSelection`, `gmiRettingerSidebar`.
  - Serial production browser: `gmiR4UxPolishUi`, `gmiValidatorEditingUi`, `gmiIndividualSelectionUi`, `gmiBatchInspectorUi`, `gmiBatchReplaceClearUi`, `gmiLinkedTemaUi`, `gmiBatchRiskGateUi`, `gmiSelectionProfileUi`, `gmiS5FocusContinuityUi`.
  - Screenshots at 1280×720 and 1366×768; `git diff --check`.
- **Why first:** this is a probable user-facing laptop regression in the core batch surface, and the R5/H5 path currently has no passing automated coverage. It is small and independently testable, and it is needed before real-file acceptance.

### Slice 2 (optional): link Tema/S_FCODE in the individual editor

- **Scope:** when `describeGmiEditColumns` reports `operationKind: 'linked-tema'`, show the pair as one Tema control in `GmiObjectEditor`. Staging writes both physical cells in one ChangeSet through the existing `createGmiFieldChangeSet`/individual planning path. If the pair already disagrees, show both values, as the G8 batch details do, plus the FOTO notice. Files whose schema has only Tema or only S_FCODE are unchanged. Do not change the Validator rules, the G8 batch planner or the export path.
- **Tests:**
  - Node: a one-object linked write is byte-verified and the pair cannot be split.
  - Browser: linked Tema in the object form and in B3, then undo/redo and a verified download.
- **Alternative if smaller is preferred:** do not link the controls. Instead, a review warning in the object form requires explicit confirmation whenever an edit would create a Tema/S_FCODE disagreement.

### Stopping point for the next combined browser acceptance session

Stop after **Slice 1** is committed and its gate is green. That is the first point where every Rettinger production suite is believed green at once. Slice 2 is not needed unless the acceptance file has both Tema and S_FCODE columns. If it has, either do Slice 2 first or leave individual Tema edits out of that session.

Suggested session content, on an approved real-file copy, at both laptop sizes, with at least one keyboard-only pass:

1. **H2→H3 single point:** Validator field → checkbox one point missing InnvendigUtvendig → «Åpne i Rettinger» → ID → stage → «Kontroller i Validator (Foreslått)» shows the FEIL count reduced by one (H4).
2. **H3 batch on lines:** 12 lines missing SDR → B1 profile and B2 split/gates → narrow → stage → undo/redo → return to Validator.
3. **B3 «Rett én og én»:** step through a mixed selection.
4. **G6 replace/clear:** include values with whitespace/case variants and a required-field clear that triggers the new-FEIL confirmation.
5. **G8 on a file with both columns:** cover disagreement and the FOTO notice.
6. **Export:** use the M10 wizard and independently check the intended spans.
7. **Legacy paths:** smoke-test «Lag retting…» and «Masseendringer» for parity notes. These are inputs to the later H5/R7 decision, not removal.

## 5. Explicitly deferred

- **H5 and R7:** until the session above has been accepted.
- **X1–X3 / M6 column insertion:** needs engine work and Gemini acceptance.
- **Optional H4 follow-ups:** history-level «Kontroller i Validator»; batch-specific guard wording.
- **Optional B2 follow-up:** narrowing to SJEKK or «uten funn».
- **Manual and performance checks not done:** assistive-technology review, large real-selection performance, and the private-corpus benchmark (`GMI_EDIT_CORPUS`).

## 6. Facts, assumptions, verification

- **Observed facts:**
  - The file and function names, call sites and commit diffs cited above were inspected at HEAD.
  - Pass/fail counts are quoted from the cited reports.
- **Assumptions (unverified):**
  - X1–X3 = M6 column insertion.
  - H5 targets the «Lag retting…» and/or `GmiBatchDialog` paths.
  - B3 is the cause of the two suites failing.
  - The two suites still fail at `b9173ba`.
- **Checks run in this audit:** `git status`/`log`/`show`, grep and file reads. No tests or builds were run, because no application code was changed. `git diff --check` is not applicable: the only change is this untracked report.
- **Git:** HEAD `b9173ba`, 4 commits ahead of origin. One untracked file added (this report). No other changes or publication actions.
