# G4 Rettinger UI refinements, Pass 1 (S1, S6, S3): completion report

Date: 2026-11-11, Europe/Oslo. Branch `feature/photo-workspace`, starting HEAD `846e70b` (clean working tree). Implements S1, S6 and S3 from the [G4 UI refinements plan](20261111-132049-gmi-g4-ui-refinements-plan.md), using the approved S3 design. S2, S4, S5 and G5 were not started. Nothing was staged, committed or pushed.

## 1. Outcome

| Slice | Status | Summary |
| --- | --- | --- |
| S1 · Mixed gate limited to changing objects | Done | Tema and the edited field's current value are compared only across objects that have a cell in the **checked** ChangeSet. |
| S6 · Contextual «Gjør om» | Done | After an undo, the notice and Endringer show a visible, keyboard-reachable «Gjør om» while that entry is next on the redo stack. |
| S3 · Shared severity icons and FEIL/SJEKK differentiation | Done, with one deliberate deviation (§3.3) | One mapping: FEIL `XCircleIcon`, SJEKK `WarningIcon`, Løst `CheckCircleIcon`, Phosphor Regular. Compact SJEKK icons and labels in the inspector use the yellow-700 alias. |

## 2. Changed files

Application:
- `src/lib/gmiBatchInspectorView.mjs`: `gmiInspectorMixedFields(preview, dataset, changeSet)` now reads the changing objects from `changeSet.cells` (scope and field match, de-duplicated by source index). With fewer than two changing objects it reports nothing. Values come from `cell.previous` and the effective Tema from the dry-run dataset.
- `src/components/gmi-edit/GmiBatchInspector.js`:
  - S1: passes the checked `changeSet` from `getGmiFieldBatchApproval`. The risk wording is now «Blandet blant objektene som endres: …».
  - S3: `SeverityCount`, `RiskFindings`, the inspected-object finding list and the «Ingen nye FEIL eller SJEKK» line use `GmiSeverityIcon`.
- `src/components/gmi-edit/GmiEditWorkspace.js` (S6): the notice carries an optional `redoId`, set by `undo`. «Gjør om» renders only while `redoId` is the top of `view.redo` and the session is editable. `redoInContext` calls the existing footer `redo()` and then moves focus to the notice (`tabIndex=-1`). Endringer receives `redoLabel` and `onRedo`.
- `src/components/gmi-edit/GmiChangeList.js` (S6): the redo text becomes the button «Gjør om: <label>» (plus «· N angret rettinger kan gjøres om» when N > 1). It falls back to the previous text when the session is not editable.
- `src/components/gmi-edit/GmiSeverityIcon.js` (new): `GMI_SEVERITY_ICONS`, `gmiFindingTone` and a decorative `GmiSeverityIcon` (`aria-hidden`, `data-severity-icon`).
- `src/components/gmi-edit/GmiObjectEditor.js` (S3):
  - `FindingIcon` uses the shared mapping. Its tooltip, accessible name, `data-severity` and `data-transition` are unchanged.
  - The legend «rødt = FEIL · oransje = SJEKK · … grønn hake = løst» became «Objektkontroll: ⓧ FEIL · ⚠ SJEKK · + = nytt · ✓ løst.», with the shared symbols and their names.
- `src/components/LayerDataTable.js` (S3): `ReviewFindings` uses `GmiSeverityIcon`. The `WarningIcon`/`WarningOctagonIcon` imports were removed.
- `src/app/globals.css`: `--gmi-validation-compact-warning-text`, an alias of the existing `--gmi-validation-rule-count-warning-text` (yellow-700). No new colour value.
- `src/components/gmi-edit/gmiEdit.css`:
  - Scoped compact SJEKK accent: icons for `.gmi-edit-finding`, `.gmi-severity-count`, `.gmi-batch-finding-list li` and `.gmi-edit-legend-item`, plus text for the pills and the inspected list.
  - Legend and list icon alignment.
  - Hypothetical table findings use `--gmi-text-muted` instead of `opacity: .8` (see §3.3).

Tests:
- `tests/gmiBatchInspector.test.mjs`: the existing mixed assertion now passes the ChangeSet. A new S1 test covers fill-missing empty+populated, a skipped object with another Tema, mixed-but-uniform-after-filtering, two changing Tema, set-mode unchanged, overwrite of different values, a single changing object and no ChangeSet. A new S3 source-contract test covers the shared mapping in all consumers, kept selectors, the alias token and no hypothetical opacity.
- `tests/gmiBatchInspectorUi.test.mjs`:
  - **Deliberate S1 updates.** The line Material fill (one empty, one populated) now stages without the risk dialog.
  - The Merknad set (both lines change) still names «Merknad» as mixed.
  - The point test previously relied on the false positive: point 1 was already «OD» from the first ChangeSet and unchanged. It now asserts no mixed warning for that case, and adds a Bredde case where both points change and «Tema, Bredde» is named.
  - S6: undo from the staged batch view → notice «Gjør om» → same ChangeSet id. Footer undo also offers the contextual actions; footer redo removes them.
- `tests/gmiRettingerSidebarUi.test.mjs`: new S6 subtest.
  - Footer undo shows the notice and Endringer buttons. Activating with keyboard Enter restores the same id, removes both buttons and leaves focus on the notice, not `body`.
  - Undo from ChangeSet details, then Endringer redo with a draft on another object: the redo is applied and the same draft guard dialog appears as for the footer redo. Cancel keeps the draft.
  - A new stage removes both buttons and leaves the footer redo unavailable.
- `tests/gmiR4UxPolishUi.test.mjs`: S3 computed-colour/contrast checks in light and dark emulation, modelled on `validationV2RuleCountsBrowser`. They cover hypothetical findings, severity pills, actual table findings and risk groups, plus severity screenshots at 1280×720 and 1366×768.

## 3. Implementation decisions

### 3.1 S1
- The changing set is taken from the ChangeSet returned by `getGmiFieldBatchApproval` at stage time, not from the earlier candidate (plan §4). Manual inclusions and replaced conflicts have cells and are included. Skipped, unchanged and deselected objects have none and are excluded.
- No other gate changed: new FEIL, manual rows, overwrite/conflict counts and the unvalidated field still open the risk dialog. The approval token check (`approval.plan` / `approval.selection`) is untouched.
- G7 note (from the plan): the G7 full profile should use the same "changing objects" scope.

### 3.2 S6
- The contextual action reuses the footer `redo()`. So M2 redo, the target selection and the draft guard (the guard wraps object selection after the redo, exactly as for the footer) are identical, and the footer control is unchanged.
- Visibility is derived, not stored: `notice.redoId === view.redo.at(-1).id`. Stage, discard and discard-all clear the M2 redo stack, and another undo or redo changes its top, so the action disappears without extra state.
- The button vanishes when activated, so focus moves to the notice. Without this, keyboard focus would fall to `body`.

### 3.3 S3 colour and the deliberate deviation
Contrast was computed from the Tailwind v4 OKLCH tokens and confirmed in the browser (ratios against the nearest opaque background):

| Foreground | white | surface-soft | cyan-soft (selected row) | orange-50 (pill) | at `.8` opacity |
| --- | --- | --- | --- | --- | --- |
| yellow-700 (alias) | 4.92 | 4.71 | **4.39** | 4.64 | 3.21–3.43 |
| orange-700 icon | 5.23 | 5.00 | 4.66 | 4.93 | 3.60–3.86 |
| orange-800 text | 7.35 | 7.03 | 6.56 | 6.93 | 4.55–4.87 |

- **Inspector uses yellow-700 as approved.** This covers object-editor finding icons (4.93 on white; 4.66/4.76 on the proposed/draft field-row tints), the legend, the severity pills (4.64 text and icon on orange-50) and the inspected-object finding list.
- **Data Table cells keep the shared orange (deviation).** Reviewed rows are selected and therefore cyan-soft, where yellow-700 measures 4.39:1, below the plan's 4.5:1 acceptance. Table SJEKK is told apart by shape (⚠ vs ⓧ) and the «SJEKK»/«FEIL» text label.
- **Panels keep orange as approved.** Risk-dialog groups and tooltips: SJEKK text 6.94 and icon 4.92 measured.
- **Hypothetical opacity removed.** The `.8` opacity on hypothetical findings put icons at 3.21–3.86, below 4.5:1. They now use `--gmi-text-muted` text (6.76 on cyan-soft) with the full-tone icon (red-700 5.73, orange-700 4.66). «Hvis inkludert:» and italics still mark them as hypothetical.
- The Validator's own presentation is unchanged. The legacy `GmiBatchDialog` still uses `WarningCircleIcon`, as planned (out of scope).

## 4. Verification

### Baseline (HEAD `846e70b`, clean detached worktree)
- Full serial Node suite: 2071 tests; 1950 passed, **7 failed**, 114 skipped. Failures:
  - CRLF-sensitive source-regex layout/stats contracts: «working header stays above…», «statistics UI exposes…», «Stats trigger visibility…», «normal sidebar width…», «workspace shell places…», «2D map resize…».
  - The optional external real-corpus check «actual browser XML parser, File/EXIF and session integration».
- `gmiTableReviewUi` against a fresh HEAD production build (port 3128): **fails at baseline** with `Unavailable: Forhåndsvis endringer`. The test types a value without choosing a Felt, and G4 made Felt start empty. It is not in the G4 gate list. Pre-existing and unrelated to Pass 1.

### After Pass 1
- Focused Node: `node --test tests/gmiBatchInspector.test.mjs tests/gmiEditChangeSets.test.mjs tests/gmiEditBatch.test.mjs tests/gmiEditValidation.test.mjs tests/gmiTableReviewPresentation.test.mjs`: 52 tests; 51 passed, 0 failed, 1 skipped (existing skip).
- Full serial Node suite (`node --test --test-concurrency=1 "tests/*.test.mjs"`, no `PHOTO_UI_URL`): 2073 tests; 1952 passed, **7 failed**, 114 skipped. The failing test names are identical to the baseline's: no new failures, none fixed. The 2 additional tests are the new S1 and S3 Node tests.
- ESLint on all touched JS/MJS files: 0 errors. One warning (`react-hooks/incompatible-library`, `LayerDataTable.js:648`, TanStack `useReactTable`) is identical at HEAD.
- `npm run build` (fresh, isolated worktree with byte-identical changed files): passed.
- Serial production-browser gate on a fresh build, port 3127. It ran the 12 files from the G4 gate plus `gmiTableReviewUi`: 95 tests; **94 passed, 1 failed, 0 skipped**.
  - The single failure is the baseline `gmiTableReviewUi` failure above, with the same error.
  - The G4 gate set passes completely, including `gmiEditValidationUi` unchanged and the updated `gmiBatchInspectorUi`, `gmiRettingerSidebarUi` and `gmiR4UxPolishUi`.
- S3 measured contrast, light and dark emulation (text/icon): hypothetical FEIL 6.76/5.73; FEIL pill 7.64/5.87; SJEKK pill 4.64/4.64 (yellow-700); table FEIL 7.45/5.73; risk FEIL 7.64/5.87; risk SJEKK 6.94/4.92.
- Ad-hoc, untracked synthetic browser check on the final build:
  - Object-editor finding icons are the same SVG shapes as the shared symbols. SJEKK icon 4.93:1 (yellow-700), FEIL 6.42:1. Legend reads «Objektkontroll: FEIL · SJEKK · + = nytt · løst.».
  - The S6 notice and Endringer redo have no page overflow at 1280×720 and 1366×768.
  - No runtime exceptions.
- `git diff --check`: clean.

## 5. Remaining risks and manual acceptance

- **Deviation to confirm (S3):** Data Table SJEKK cells keep orange rather than yellow-700, for contrast on selected rows (§3.3). If yellow is wanted there too, it needs either a darker accent (a new colour, outside the approved design) or a different selected-row surface.
- Discard clearing the contextual redo is covered by the M2 rule (discard clears the redo stack) and the derived condition, not by a dedicated browser step. Stage clearing it is browser-tested.
- If a redo triggers the draft-guard dialog, focus goes to the notice behind the modal and returns according to the dialog's own focus handling. This matches the footer redo, but was not separately inspected.
- Pre-existing, not changed: the hypothetical «Endring» cell (`.gmi-review-hypothetical`, `--gmi-text-subtle`) measures about 4.25:1 on cyan-soft rows. It is not a severity element; worth a follow-up.
- Manual acceptance still to do (plan §6):
  1. S1: Material fill on two lines (one empty) shows no mixed dialog. KUM + LOK both changing names Tema.
  2. S3: FEIL vs SJEKK distinguishable in greyscale. A synthetic greyscale screenshot was inspected (below); repeat on a real delivery.
  3. S6: undo → «Gjør om» brings back the same entry, from footer, details and staged batch view.
  4. A keyboard-only pass.
- Not done here: real-delivery/private-corpus checks (no corpus configured or opened). The browser checks use synthetic fixtures only.

Screenshots (local, synthetic):
- `%TEMP%/gmi-r4-ux-severity-1280x720.png` and `-1366x768.png`: pills ⓧ «1 ny FEIL» / ⚠ «1 ny SJEKK», table ⓧ «FEIL (ny)»; no page overflow.
- Session scratchpad `shots/adhoc-s3-object-editor-*` (including greyscale) and `shots/adhoc-s6-redo-*` at both sizes.
- The first S6 screenshot showed «Ledning 1Gjør om» without a gap, because `.gmi-edit-link:first-child` removes the margin. Fixed with an explicit space before the final build.

## 6. Git status and publication

- Modified: the 12 tracked files in §2. New: `src/components/gmi-edit/GmiSeverityIcon.js` and this report. Nothing staged, committed or pushed; no branch or ref changes.
- Builds and browser runs used isolated detached worktrees in the session scratchpad (Pass 1 copy on port 3127, HEAD baseline on port 3128). The repository `.next` and the other agents' servers on ports 3110–3113 were not touched. Only servers started by this task were stopped. Both scratch worktrees were removed afterwards (`git worktree list` shows only the main tree).
