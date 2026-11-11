# G4 Rettinger UI refinements: implementation plan (PLANNING DRAFT)

Date: 2026-11-11, Europe/Oslo. Read-only planning task. No application code, tests or fixtures were changed. Branch `feature/photo-workspace`, HEAD `1e2c210`. Three untracked planning reports from earlier tasks were left untouched.

Sources read: [G4 completion](20261111-120451-gmi-g4-batch-inspector-completion.md), [general batch architecture](20261111-092840-gmi-general-batch-editing-architecture.md) §7–§10, [unified workflow plan](20261111-085500-gmi-validator-rettinger-unified-workflow-planning.md) §5 and §9 (U/T slices), [R4 table review usability](20261110-133006-gmi-r4-table-review-usability.md), [rule-count refinement](20261110-174238-validator-rule-counts-refinement.md), and the current code cited below.

## 1. Summary and recommendation

All five refinements are still outstanding. The commit log has no U or T slice after `13a44a2`, and the code matches the behaviour described in the list. Three of them are already planned in the unified-workflow plan and are not yet implemented: **U2** (severity icons), **U5** (contextual redo) and **T2** (Foreslått after staging). The other two are new, but each has a concrete cause in the code:

- **Mixed gate:** the warning is computed over every selected object, not over the objects that will change. The accepted G4 browser test pins this false positive.
- **Merknad width:** R4 deliberately kept prose columns at heading width. For a seven-letter heading that comes out at about 73 px.

Six small slices are proposed (§3). **Recommended first slice: S1, the mixed-selection gate restricted to changing objects.** It fixes a real defect, needs no UX decision, touches one pure helper and one call site, and narrows a confirmation gate without touching eligibility, ChangeSets or export.

## 2. Current behaviour, by refinement

### 2.1 Batch preview emphasis (refinement 1): outstanding

- **Data Table «Funn etter endring».** `gmiFieldInspectorRows` (`gmiBatchInspectorView.mjs:40`) passes *all* post-change findings of a changed object through `gmiBatchFindingList` (`:170`). That includes existing, unchanged findings on the edited field (`gmiFieldBatchPlan.mjs:39`). `ReviewFindings` (`LayerDataTable.js:58–70`) shows the highest-ranked one. Ranking is new FEIL → existing FEIL → new SJEKK (`:171`), so an *existing* FEIL hides a *new* SJEKK behind «+1». «Ingen nye funn» appears only when the list is empty. If an object has only existing findings, the cell shows «FEIL …» without «(ny)», which reads as a problem caused by the change. The column's sort already uses introduced findings only (`gmiTableReviewPresentation.mjs:9`).
- **Inspector summary.** It shows new FEIL/SJEKK pills (`GmiBatchInspector.js:242`). Resolved counts appear only in the dry-run status sentence (`:256`). The full list sits in a collapsed «Se nye og løste funn» with a flat «Nytt/Løst · severity» prefix (`:263–268`).
- **Worsened is not represented.** `diffGmiValidationFindings` folds severity changes into both lists, so they show up as introduced plus resolved (`findingDiff.js:49–51`). As a result, SJEKK → FEIL on one object appears as «Ny FEIL» *and* «Løst SJEKK». `compareGmiValidationRuns` still reports `severityChanged` separately (`:33`), so the pairing is recoverable.
- **Inspected-object detail** (`GmiBatchInspector.js:286`) lists new and existing findings in one list. **The risk dialog** already collapses existing findings (`:306`). No change is needed there apart from adding worsened findings.

### 2.2 Mixed-selection warnings (refinement 2): outstanding, concrete defect

`gmiInspectorMixedFields` (`gmiBatchInspectorView.mjs:56–67`) compares effective Tema and the edited field's current value across **all selected preview rows**. That includes skipped, unchanged and populated objects. It is called at stage time (`GmiBatchInspector.js:160`), and any result opens the risk dialog.

Failure case: in fill-missing mode, a selection of one empty and one populated object always reports «Blandet utvalg: <felt>», even though only the empty object changes. `tests/gmiBatchInspectorUi.test.mjs:119–123` asserts exactly this («1 av 2 ledninger endres» followed by «Blandet utvalg: Material»). Skipped objects with another Tema trigger the same false warning.

### 2.3 Merknad column (refinement 3): outstanding

- `getOrdinaryColumnWidth` (`objectTablePresentation.js:9–21`) sizes prose by heading length: `min(180, max(50, len*7+24))`. For «Merknad» that is **73 px**, whatever the content. R4 kept this on purpose («Normal prose retains the previous heading-based width»). It is pinned by `tests/gmiTableReviewPresentation.test.mjs:57`, which asserts 180 px for a long heading.
- Validator inspections size the same field by content, up to 220 px (`getContextualOrdinaryColumnWidth`, `:44–47`). The same field is therefore readable in the Validator and cramped in Rettinger.
- Truncated text can be reached through `title` (mouse only) or grid Enter, which opens the object in the inspector (keyboard). The table moves the cursor by row only; there is no cell focus. While a Merknad value is being previewed, the review «Endring» column is capped at 200 px (`gmiTableReviewPresentation.mjs:34`).
- There is no manual column resizing, and adding it is out of scope.

### 2.4 Severity presentation (refinement 4): outstanding (U2 not implemented)

- The object editor uses `WarningCircleIcon` for both FEIL and SJEKK (`GmiObjectEditor.js:15–21`). This is UX-07.
- The batch inspector, risk dialog and table use `WarningOctagonIcon` for FEIL and `WarningIcon` for SJEKK (`GmiBatchInspector.js:27,36`; `LayerDataTable.js:64`). The legacy `GmiBatchDialog` uses `WarningCircleIcon`.
- Colour: Rettinger uses the shared tokens, red-700/800 for FEIL and orange-700/800 for SJEKK (`globals.css:8–17`). The rule-count refinement measured orange-700 at only about 11° hue from red. It introduced the scoped `--gmi-validation-rule-count-warning-text` (yellow-700, 4.93:1 on white) for the Validator header counts only. So the Validator now separates SJEKK more clearly than Rettinger does.
- Hypothetical (manual-candidate) findings get `opacity: .8` on top of tone text (`gmiEdit.css:243`). Their contrast has not been measured.

### 2.5 Editing workflow (refinement 5): outstanding

- **Column focus.** The batch inspector brings the edited field forward only once a preview exists (`GmiBatchInspector.js:107–113`), not when Felt is chosen. After staging, `GmiChangeSetDetail` takes over the focus (`GmiChangeSetDetail.js:27–30`), so the field stays forward. «Ny masseendring for utvalget» unmounts that detail and the field is reset to empty (`GmiBatchInspector.js:171,191`), so the focus is dropped. The user's «off» toggle is stored per focus key (`LayerDataTable.js:312`). Because the key changes from `batch:<felt>` to `change-set:<id>`, the focus comes back after staging even if the user switched it off.
- **Keyboard focus after staging.** The «Legg til masseendring» button unmounts when staging succeeds, and nothing receives focus. *Unverified in a browser:* focus probably falls to `body`.
- **Foreslått after staging** (UX-06/T2). Nothing switches the view. The batch `onStaged` changes only the tab and the active entry (`GmiEditWorkspace.js:325`). `GmiObjectEditor` is mounted without `onStaged` (`:327–329`). The R5 handoff writes `'original'` (`store.js:276`).
- **Redo** (UX-10/U5). The footer icon is the only control (`GmiEditWorkspace.js:313`). «N angret retting kan gjøres om» is plain text (`GmiChangeList.js:26,87`). The «Angret: …» notice has no action (`GmiEditWorkspace.js:209`).

## 3. Implementation slices (prioritised)

Each slice is independently testable and commit-sized. None of them changes M2 ChangeSets, G2 eligibility, the G3 dry-run semantics, source/verifier/export code, fixtures or the legacy `GmiBatchDialog`.

### S1 · Mixed gate limited to objects that change: S. No decision needed

- **Files:** `src/lib/gmiBatchInspectorView.mjs` (`gmiInspectorMixedFields` takes the set of changed object keys from the checked ChangeSet's cells); `src/components/gmi-edit/GmiBatchInspector.js:160` (pass `checked.changeSet`); risk-dialog wording «Blandet blant objektene som endres: …».
- **Rule:** compare Tema and the edited field's current value only across objects that have a cell in the ChangeSet about to be staged. This includes manual inclusions and replaced conflicts, and excludes skipped, unchanged and deselected objects. With fewer than two changing objects, nothing is mixed.
- **Acceptance:**
  - Fill-missing on one empty and one populated object raises no mixed warning. It stages directly unless another gate applies.
  - Two changing objects with different Tema still raise «Tema».
  - Set mode overwriting two different existing values still raises the edited field.
  - The other gates are unchanged: new FEIL, manual, overwrite/conflict, unvalidated field.
- **Tests:** Node `tests/gmiBatchInspector.test.mjs`, covering a mixed case that becomes uniform after filtering to changed keys, a still-mixed Tema case and a single changing object. Browser `tests/gmiBatchInspectorUi.test.mjs:119–124` needs a **deliberate update** (the Material fill no longer opens the dialog), plus a replacement case that still triggers the dialog. `:156–162` should keep passing; verify it.
- **Relation to G7:** G7's full profile should use the same "changing objects" scope. Record this in the G7 notes.

### S2 · Preview emphasises new, worsened and resolved findings: M. Needs decision D-A

- **Files:**
  - `src/lib/gmiBatchInspectorView.mjs`: pair introduced and resolved dataset findings that share rule and object identity into a `worsened` or `improved` record, presentation only, using the existing `objectRef`/`ruleId`. In `gmiFieldInspectorRows`, the table's `findings` become introduced/worsened only, and a new `existingCount` is kept for the tooltip.
  - `src/components/LayerDataTable.js` `ReviewFindings`: «Ingen nye funn» whenever nothing is introduced; existing findings only as a muted tooltip line «N eksisterende funn uendret».
  - `src/components/gmi-edit/GmiBatchInspector.js`: a summary row «Nye FEIL · Nye SJEKK · Forverret · Løst»; the full list grouped Nye → Forverret → Løst (still collapsible); the inspected-object detail splits off «Eksisterende» in a collapsed block.
  - The risk dialog lists worsened findings under FEIL.
- **Safety invariant:** gate counts stay exactly as they are. A worsened FEIL still counts as a new FEIL (`datasetCounts.introduced.fail`) and still requires the risk dialog. Only the labels and grouping change. `findingDiff.js` is not edited.
- **Acceptance:**
  - An object whose only findings are pre-existing shows «Ingen nye funn» in the table.
  - A new SJEKK is visible even when the object has an existing FEIL.
  - SJEKK → FEIL appears once as «Forverret» and is not also counted under «Løst».
  - Resolved counts are visible without expanding anything.
  - Sorting by «Funn etter endring» is unchanged.
- **Tests:**
  - Node: pairing (worsened, improved, reason change with the same state stays new plus resolved); table rows exclude existing findings; gate counts unchanged for a worsened case. Files: `gmiBatchInspector.test.mjs`, `gmiTableReviewPresentation.test.mjs`.
  - Browser: the existing «new FEIL» scenario in `gmiBatchInspectorUi`, plus one fixture case with a pre-existing finding on a changed object. `gmiTableReviewUi` sorting should keep passing.

### S3 · Severity icons and SJEKK contrast (U2, extended): S–M. Needs decision D-B

- **Files:**
  - New `src/components/gmi-edit/GmiSeverityIcon.js`: one mapping of FEIL / SJEKK / Løst to Phosphor Regular icons, coloured through `data-validation-tone`.
  - Consumers: `GmiObjectEditor.js` `FindingIcon` (keep `data-severity` and `data-transition`), `GmiBatchInspector.js` (`SeverityCount`, `RiskFindings`, inspected list), `LayerDataTable.js` `ReviewFindings`. Update the legend line in `GmiObjectEditor.js`.
  - If D-B is accepted: in `globals.css`, a scoped compact SJEKK accent that reuses the existing yellow-700 value (an alias of the rule-count token, not a new colour), applied to Rettinger's compact icons and pill text only. Panels and surfaces keep the shared orange palette.
- **Acceptance:**
  - FEIL and SJEKK can be told apart by shape and by text label, without relying on colour.
  - The same symbols appear in the object editor, batch inspector, risk dialog and table.
  - Text and icon contrast is at least 4.5:1 on white and on the tone surfaces in light mode. Check the hypothetical `.8` opacity case too.
  - Tooltips and accessible names are unchanged.
  - The Validator's own presentation is unchanged.
- **Tests:**
  - Node source contract: the consumers import `GmiSeverityIcon`; no severity use of `WarningCircleIcon` or `WarningOctagonIcon` remains in those four files.
  - Browser: `gmiEditValidationUi` must keep passing unchanged, since its `data-severity`/`data-transition` selectors stay. Add one computed-colour/contrast assertion, modelled on `validationV2RuleCountsBrowser.test.mjs`.
- **Ordering note:** S2 and S3 touch the same render points. If D-B is answered early, do S3 before S2 so S2's new indicators use the shared icon from the start. Otherwise do S2 first with the existing icons.

### S4 · Merknad / free-text width and truncated content: S. Needs decision D-C

- **Files:**
  - `src/lib/objectTablePresentation.js` `getOrdinaryColumnWidth`: for prose (`fieldFormat === 'Tekst'`, or long non-code values), use content width with the heading as the minimum, capped (proposed 240 px).
  - `src/lib/gmiTableReviewPresentation.mjs`: raise the «Endring» cap for text fields to the same value.
  - Keep `title` and grid-Enter access; no popover and no resizing.
- **Acceptance:**
  - Merknad with typical text (40–80 characters) gets about 240 px at 1280×720 and 1366×768. Short Merknad stays narrow.
  - Columns for codes, numbers, empty fields and S_FCODE are unchanged.
  - No horizontal page overflow (horizontal scrolling inside the table is fine).
  - The full value is available by mouse (tooltip) and by keyboard (Enter → inspector) in Rettinger and in the ordinary table.
- **Tests:** Node `gmiTableReviewPresentation.test.mjs`, with a **deliberate update** of the `:57` expectation and new cases for Merknad with short, long and 10,000-character values. Browser width checks in `layerDataTableGeometryUi` should keep passing, and geometry must stay stable through filtering. Screenshots at both laptop sizes.
- **Note:** this reopens one explicit R4 decision. The concrete problem is the 73 px Merknad.

### S5 · Column and keyboard focus continuity, and Foreslått after staging (T2): S–M. Needs decision D-D

- **Files:**
  - `GmiBatchInspector.js`: request column focus as soon as a field is chosen; after «Ny masseendring for utvalget», keep the previous field's focus until a new field is chosen; move keyboard focus to the staged success heading or the «Ny masseendring» button.
  - `LayerDataTable.js`: make the user's column-focus «off» choice survive the batch → change-set key handover for the same field set. Compare on fields, not key.
  - `store.js`: `setGmiEditTableView(layerId, view, { by })`, plus a non-persisted per-layer «chosen by» marker. Toolbar clicks pass `user`, while the R5 handoff and stage switching pass `auto`.
  - `GmiEditWorkspace.js`: batch `onStaged`, and a new `onStaged` on `GmiObjectEditor`, switch Original → Foreslått unless the user chose Original.
- **Acceptance (T2 as planned, plus focus):**
  - The first and later stages, single and batch, switch Original → Foreslått when the view was set automatically.
  - A user's click on Original is respected until they choose otherwise.
  - Geometry, tab, scroll, selection and inspector object are unchanged by the switch.
  - The chosen field is forward in the table before the preview.
  - Keyboard focus is never left on `body` after staging.
  - A column focus the user switched off stays off through staging.
- **Tests:**
  - Node: the view-intent rule (user, auto, handoff reset).
  - Browser in `gmiBatchInspectorUi` and `gmiRettingerSidebarUi`: stage from Original → Foreslått; click Original, stage again → stays Original; `document.activeElement` after staging; column order before preview.
  - `gmiR4UxPolishUi` column-focus assertions should keep passing; check them.
- **Dependency:** the earlier plan put T2 after U4 (mode buttons only when meaningful). T2 does not technically need U4. U4 remains a separate, unscheduled slice.

### S6 · Contextual redo (U5): S. No decision needed

- **Files:** `GmiEditWorkspace.js`: the notice carries an optional action, so «Angret: …» gets «Gjør om» while that entry is next on the redo stack. `GmiChangeList.js:26,87`: the text becomes the button «Gjør om: <label>». The footer icon is unchanged.
- **Acceptance:**
  - After an undo from the footer, the ChangeSet details or the staged batch view, «Gjør om» is visible and keyboard-reachable.
  - It restores the same ChangeSet id.
  - Both controls disappear when the redo stack changes (new stage, discard).
  - The draft guard behaves as it does for the footer redo.
- **Tests:** browser in `gmiRettingerSidebarUi`: undo → «Gjør om» → same id back; stage something new → button gone. Add an assertion to the existing G4 undo/redo scenario in `gmiBatchInspectorUi`.

### Suggested order

**S1 → S6 → S2 → S3 → S4 → S5.** S1 and S6 can go now, with no decisions. S2, S3, S4 and S5 wait on D-A to D-D. S6 is independent and could be merged into S5 if one workflow commit is preferred.

## 4. Regression risks

- **Selection scope:** S1 must read the changed set from the *checked* ChangeSet at stage time (`getGmiFieldBatchApproval`), not from the earlier candidate. Otherwise a selection change between preview and stage could hide a mix. The existing approval token (`approval.plan` / `approval.selection`) stays the binding check.
- **Correction previews:** S2 is presentation only. Gate counts must stay derived from `datasetCounts.introduced`. Add a Node assertion that a worsened case still forces the risk dialog. The `datasetFindingCache` WeakMap keying must include any new transition kind.
- **Editing state:**
  - S5's view switch must not trigger the draft guard, rewrite the stored view when the user chose it, or affect exact Validator inspections, where modes are unavailable.
  - The early column focus must not mark the inspector dirty: choosing a field alone does not count as dirty today (`dirty` at `GmiBatchInspector.js:54`).
  - Keeping focus after «Ny masseendring» must not keep a `change-set:` focus alive after that ChangeSet is undone.
- **Table geometry:** S4 changes widths in the ordinary (non-Rettinger) table too. Check sticky offsets, S_FCODE leading column, virtualised row widths and stable widths under filtering (R1).
- **Baseline:** this machine's CRLF checkout gives 4 Node-gate failures rather than the documented 3; the G4 report records 3 `validationV2WorkspaceInspector` failures. Re-establish the baseline at the starting HEAD before calling any failure pre-existing.

## 5. Standing verification per slice

- `node --test` on the slice's Node files plus `tests/gmiEditChangeSets.test.mjs tests/gmiEditBatch.test.mjs tests/gmiEditValidation.test.mjs`.
- ESLint on touched JS/MJS files.
- `npm run build`, then the serial production-browser set listed in the G4 completion report, on a fresh build and a free port.
- `git diff --check`.
- Screenshots at 1280×720 and 1366×768 for S2, S3, S4 and S5.

## 6. Manual browser acceptance (synthetic file, then real delivery)

1. **S1:** fill Material on two lines, one empty → no mixed dialog. KUM + LOK with both changing → dialog names Tema.
2. **S2:** a batch on objects with an existing FEIL elsewhere on the row → «Ingen nye funn». A change that worsens SJEKK → FEIL → one «Forverret» entry, and the dialog still appears.
3. **S3:** an object with one FEIL and one SJEKK field can be told apart without colour (greyscale screenshot).
4. **S4:** a long Merknad is readable at laptop width. Keyboard Enter on the row shows the full text.
5. **S5/S6:** stage → table on Foreslått; click Original, stage → stays Original; Tab after staging continues from the inspector; undo → «Gjør om» brings back the same entry.
6. A complete keyboard-only pass, as in architecture §10.5. This remains outstanding from G4.

## 7. Decisions needed from the user

| # | Question | Recommendation | Alternative |
| --- | --- | --- | --- |
| D-A | How to show severity changes in the preview | «Forverret» for SJEKK → FEIL (counted as new FEIL for approval); «Forbedret» for FEIL → SJEKK, grouped with «Løst»; same-state reason changes stay new plus resolved | Keep new plus resolved and only label the pair |
| D-B | SJEKK colour and FEIL symbol in Rettinger | FEIL `XCircleIcon`, SJEKK `WarningIcon`, Løst `CheckCircleIcon` (as U2). Compact SJEKK icons and pill text reuse the existing yellow-700 rule-count value; surfaces stay orange | Keep orange throughout (shape-only fix); or keep `WarningOctagonIcon` for FEIL, which the batch inspector already uses |
| D-C | Scope of the width change | All free-text (`Tekst`) columns, content-based, capped at 240 px, in every ordinary table | Merknad only; or Rettinger only |
| D-D | Focus and view behaviour | T2 for both object and batch staging, respecting an explicit Original; column focus from the moment Felt is chosen; keep the focus through «Ny masseendring» until a new field is chosen | Switch to Foreslått only after batch staging; focus only after preview (as today) |

Assumption to confirm: "preserve focus on the relevant column" means the Data Table column focus (edited field brought forward) plus keyboard focus after staging. It does not mean a new per-cell keyboard focus.

## 8. Explicitly out of scope

G5 field-type controls, G6 operations, G7 selection profile and narrowing, G8 linked Tema, U4 view-control visibility, T1 row reveal, T3 checkbox focus, H-slices, legacy `GmiBatchDialog` (still uses `WarningCircleIcon`), manual column resizing, Validator workspace styling.

## 9. Verification of this report and Git state

- Read-only inspection with Read/Grep and `git log`/`git status`. No tests or builds were run, because no application code was changed.
- One file added: this report. Nothing staged, committed or pushed. The existing untracked reports are preserved.
