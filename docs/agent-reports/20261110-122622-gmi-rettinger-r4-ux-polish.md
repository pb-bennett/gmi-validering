# R4 UX polish: accurate batch review and a coherent selection → review → stage → inspect flow

2026-11-10, Europe/Oslo. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`. The starting HEAD was **`fb7cece`**, as expected, and the working tree was clean. Nothing was committed or pushed.

## 1. Initial UX assessment

I read the R3/R4 reports, the planning report and the code. Then I drove the production build through the reported workflow.

1. **The review was not accurate (correctness).** `GmiBatchInspector` published one table record for every row of the *original* preview. Every record included `proposed: review.preview.lexeme`, regardless of the current outcome. A user-excluded object therefore still showed `«» → «11»`. The status said «Utelatt av deg», but the value column implied a change. Skipped rows also showed their hypothetical value and their hypothetical findings, such as the *introduced* SJEKK for the SP/PVC line. Every other row in the table read «Ikke i gyldig forhåndsvisning».
2. **The primary transition looked secondary.** «Rediger valgte (N)» sat at the left of a 10px text bar. The bar's other actions were unbordered text buttons.
3. **The proposal disappeared.** After a preview, the configuration collapsed into one 11px summary line: `SDR → 11 · Endre oppsett`.
4. **The history lost the result.** After staging, the inspector reset to an empty form. The left card listed object links above a field table that had no object column, so two rows read `SDR tom 11`, `SDR tom 11`.
5. **Identity was invisible.** The Data Table had no object number. The left list and the history used parser numbers («Ledning 38»). The table checkbox labels and the full-validation list used *file position + 1*, which is a different scheme.
6. **Severity was flat.** The risk dialog listed FEIL, SJEKK and manual overrides as neutral paragraphs, with the generic «Gjelder ikke objektet».
7. **The edited field was not visible.** In fill mode, an all-empty SDR column is hidden by the table's "has data" rule. After staging, SDR was wherever the saved column order put it.

## 2. Major design choices and rationale

- **One outcome model, read from the ChangeSet that would actually be staged.** A new pure helper, `gmiBatchReviewRows`, derives each object's record from `plan.changeSet`: its `cells`, `unchanged`, `skipped` and `eligibility.manualOverrides`. It does not use the original preview's intent. The outcomes are `change`, `manual`, `unchanged`, `skipped`, `excluded`, `stale` and `added`. Only `change` and `manual` carry a value change or findings. A skipped object gets a *hypothetical* change and its findings only when advanced mode is on and `canManuallySelectGmiBatchRow` permits inclusion. That hypothetical is labelled «Hvis inkludert:» and is never counted. The M5B and M2 engines are unchanged; this is presentation over their results.
- **Invalid previews show no values.** I chose this over hiding the review columns. When the selection is expanded or the session changes, the columns stay, and every selected row reads «Ugyldig forhåndsvisning». A newly added row reads «Ikke forhåndsvist». The table therefore does not jump horizontally while checkboxes are toggled, and no stale value is displayed.
- **The inspector leads with the proposal, not the form.** A persistent «Foreslått retting» block shows:
  - the field and value at 16–17px;
  - the mode;
  - «**N** av M ledninger endres»;
  - the non-zero breakdown;
  - FEIL and SJEKK chips that are always visible.

  «Endre oppsett» toggles the form under the summary instead of replacing it. A slim, text-only step line (Velg objekter · Oppsett · Forhåndsvis · Lagt til) makes the sequence explicit without adding bulk.
- **The details live in the inspector; the left panel stays history and navigation.** This choice was the R6-friendly one. A new reusable `GmiChangeSetDetail` shows an Objekt | Original | Foreslått table read from the M2 ChangeSet. It also shows the manual overrides with their actual reasons and three actions: Vis i Foreslått, Angre (latest only) and Forkast. It appears immediately after staging as a success state, and again through «Vis detaljer» on any history card. Multi-object cards on the left became compact: summary, first six objects, «Vis detaljer for N ledninger». Single-object cards keep their field table. The existing M4 tests rely on that table, and it reads well for one object.
- **The selected-only view became a segmented control.** «Filtrert visning | Bare valgte» shows both states and the way back. I preferred this to a toggle whose label would have to change.
- **Column focus is temporary and display-only.** `applyColumnFocus` places the edited fields straight after the fixed identity columns. It is applied to the rendered order only. The saved per-layer order is still normalised from the user's own order, so nothing is rewritten. A «SDR først» chip shows the focus and turns it off. A manual column drag saves exactly what the user sees and switches the focus off for that context, so the application never undoes a user arrangement. The focused field is also kept visible when it is empty everywhere, which matters in fill mode.
- **The Nr. column is Rettinger-only.** It appears for every table opened while Rettinger is active on that layer, including Validator inspections inside Rettinger. The «Ledning 38» scheme exists only in Rettinger. The Validator and the base table use no object labels, so the base application is unchanged; a production test checks that. The number is `layer.data.lines[sourceIndex].id`, the same value `describeGmiObject` uses. When a file has no object number, the cell shows `(5)` in italics, meaning file position, with a tooltip.

### Deviations from the suggested design

- **Stepper.** I added a minimal step line, which was not requested. It is 1 line and about 14px high.
- **Risk dialog.** It has no extra «I understand» checkbox. The safeguards are unchanged: an explicit dialog, the cancel button focused by default, and approval bound to the exact selection and configuration. The approve button became a distinct dark-amber button with a seal-warning icon, and a 3px amber top rule marks the dialog. That makes risk approval visibly different without turning the dialog red.
- **«Rediger valgte (N)».** While the batch inspector is open, the button is replaced by a teal «Masseendring pågår · se panelet til høyre» indicator. Clicking the button in that state already did nothing.
- **Layer file name.** In Rettinger, the table toolbar no longer shows the file name, which is already in the Rettinger header. The long Foreslått banner shortens to «Foreslått kopi» below 1700px viewport width; the full text stays in the tooltip. This keeps the toolbar on one line at laptop widths.

## 3. Implemented improvements, by request section

| § | Result |
|---|---|
| 3 Review accuracy | Outcome model as described above. Unrelated rows render empty cells. Findings show only for changing objects, most severe first, using the shared `--validation-*` tokens. Counts add `excluded` and `newChecks`; both new-FEIL and new-SJEKK counts use changing cells only. |
| 4 Entry action | Right-aligned teal primary button, 28px high, with a pencil icon. While the batch inspector is open it is replaced by the mode indicator. |
| 5 Selection toolbar | A bold count with muted scope, separate from the actions. The actions are bordered 24px buttons with icons and teal hover and focus: segmented «Filtrert visning / Bare valgte», «Velg alle N synlige» (disabled when everything is already selected) and «Fjern utvalg». The bar is light teal and about 38px high. |
| 6 Proposal summary | «Foreslått retting» block; it is also the `data-gmi-batch-counts` live region. |
| 7 Wording | «Forhåndsvis endringer» and «Oppdater forhåndsvisning», with «Lager forhåndsvisning…» while busy. The stale-state messages say "oppdater forhåndsvisningen". «Legg til masseendring» stays disabled until a valid preview with changes exists, and the hint under it explains why. |
| 8 Post-staging and history | Success detail in the inspector, «Ny masseendring for utvalget», and «Utvalget er beholdt». History cards are compact, with «Vis detaljer» opening the inspector. The staged state is distinguished from download («I arbeidskopien · ikke lastet ned» or «Med i siste nedlasting»). Opening details passes through the existing draft guard. |
| 9 Severity | Inspector chips, table finding cells and the risk dialog use `data-validation-tone` error and warning. The dialog orders new FEIL, then new SJEKK, then the manual group (dashed amber, hand icon). Each finding lists its objects, and the manual group gives the actual reason, for example «SDR anbefales ikke for selvfallsledninger (Tema SP)». |
| 10 Manual buttons | Bordered teal «⊕ Inkluder manuelt» and «⊖ Fjern manuelt tillegg» buttons. Remove is neutral, with a red hover. Each has a risk tooltip and stops click propagation, and stays separate from the checkbox. The manual status badge is a dashed amber «Manuelt inkludert». |
| 11 Object number | Sticky «Nr.» column after the zoom tool, sortable by number. Search matches exact labels: `38`, `#38`, `nr 38`, `l38`, `ledning 38`, `p5` and `punkt 5`. Partial numbers never match, and attribute search is otherwise unchanged; a matched number is highlighted. Checkbox labels now read «Velg ledning 38», and the full-validation finding list uses the same labels. |
| 12 Edited fields | Focus during a preview, during staged or history details, and in Foreslått and Kun endrede, as described in section 2. |
| 13 Table size | Phosphor `ArrowsOutLineVertical` / `ArrowsInLineVertical` icon button (26×22) in the table toolbar. It has a tooltip and an aria-label, and is visible whenever Rettinger is active, even with no selection. The separate «Mindre tabell» row is gone. The 62/38 and 35/65 split is unchanged. |
| 14 Geometry replacement | «Erstatt 3 valgte ledninger med ett punkt?», «…fjernes de 3 valgte ledningene fra utvalget, og utvalget består av ett punkt.» It also says «Ingen objekter eller rettinger endres» and, when relevant, that the batch preview must be refreshed. The cancel and confirm paths are unchanged. |

## 4. Exact review-accuracy corrections

- **Before:** `rows[key] = { status: selected ? row.status : 'Utelatt av deg', current, proposed: review.preview.lexeme, findings: row.findings… }` for every original preview row.
- **After:** `gmiBatchReviewRows({ review, plan, selection, advanced, stale })`:
  - not in the current selection → `{ outcome: 'excluded' }`, with no change and no findings;
  - in `changeSet.cells` → `change` (or `manual` if in `manualOverrides`), with `change: { from: cell.previous, to: cell.next }` and the row's findings;
  - in `changeSet.unchanged` → `unchanged` (no change);
  - otherwise → `skipped`, with the final M2 skip reason or the M5B reason as a short, specific summary. A hypothetical appears only when the object may be manually included in advanced mode, and it is labelled;
  - stale or expanded preview → every selected row is `stale` or `added`, with no values;
  - `plan.ok === false` with nothing included → skipped reasons and manual candidates remain. Any other construction failure marks the included rows `stale`.
- **Counts:** `newErrors` and `newChecks` count only changing cells with introduced findings. An excluded candidate's FEIL no longer counts; a regression test covers this with the SN8 line.
- The risk dialog groups findings of changing cells only, with object labels. Existing (non-new) findings on the field are collapsed in a details element.

## 5. Files changed

| File | Change |
|---|---|
| `src/lib/gmiBatchInspectorView.mjs` | `gmiBatchReviewRows`, `gmiBatchSkipSummary`, `gmiBatchFindingList`, outcome labels; `excluded` and `newChecks` counts. Selection-to-target translation and planning are unchanged. |
| `src/lib/gmiEditView.mjs` | `gmiObjectNumber`, `gmiObjectMatchesQuery`, `gmiObjectCountLabel`, `summarizeGmiChangeSet`. |
| `src/lib/layerTableRows.mjs` | Optional `identityMatches` added to search; the ordinary path is unchanged. |
| `src/lib/objectTablePresentation.js` | `applyColumnFocus`. |
| `src/lib/store.js` | Two transient, non-persisted values: `gmiBatchInspectorLayerId` and `gmiEditColumnFocus`. |
| `src/components/LayerDataTable.js` | Nr. column, review cells, column focus, selection bar, icon size toggle, contextual replacement dialog, labels. |
| `src/components/gmi-edit/GmiBatchInspector.js` | Proposal summary, steps, wording, staged state, severity chips, risk dialog content. The staging, staleness and approval logic is unchanged. |
| `src/components/gmi-edit/GmiChangeSetDetail.js` (new) | Reusable ChangeSet detail. |
| `src/components/gmi-edit/GmiChangeList.js` | Compact multi-object cards with «Vis detaljer». |
| `src/components/gmi-edit/GmiEditWorkspace.js` | Detail mode in the inspector, «Vis i Foreslått», batch-mode flag, cleanup, undo without navigation for detail. |
| `src/components/gmi-edit/GmiConfirmDialog.js` | Optional `tone="risk"` and confirm icon. |
| `src/components/gmi-edit/GmiFullValidation.js` | Object labels from source numbers. |
| `src/components/gmi-edit/gmiEdit.css` | Styles for all of the above, using existing tokens. |
| `tests/gmiR4UxPolish.test.mjs` (new) | 9 node regression tests. |
| `tests/gmiR4UxPolishUi.test.mjs` (new) | Production browser suite: 8 scenarios. |
| `tests/gmiBatchInspectorUi.test.mjs`, `tests/gmiEditSelectionUi.test.mjs`, `tests/gmiBatchInspector.test.mjs`, `tests/objectTableInspection.test.mjs` | Assertions updated for the intentional wording and composition changes. The R3 replacement test gains wording assertions. |

`GmiBatchDialog`, the M1/M2 engine (`src/lib/gmi-edit/*`), `gmiEditBatchView.mjs`, the Validator rules, the parser, `MapInner` and the FOTO code were not modified.

## 6. Intentionally deferred

- R5 Validator handoff migration, R6 Filter/Endringer redesign, R7 modal retirement, R8 map-click selection, arbitrary-field batch editing, M9, and the Leaflet tile seam.
- No visual polish of the old Masseendringer modal. It still works and its suite passes.
- The base-application Nr. column (see section 2). Extending it would be a one-condition change if wanted after acceptance.
- Opening ChangeSet details from the object editor's «vis retting» link. It still switches to the Endringer tab, as before.
- An inline undo of the *non-latest* ChangeSet. «Forkast» covers this, with the existing dependents warning.

## 7. Test results

| Gate | Result |
|---|---|
| New node regression tests `gmiR4UxPolish.test.mjs` | **9/9 pass**. They cover: exclusion; shrinking; re-adding invalidates; skipped vs manual vs hypothetical; FEIL/SJEKK from changing cells only; actual skip reasons; source-safe staging with byte verification and a ChangeSet summary that matches the staged objects; object numbers and identity search through sorting and filtering; display-only column focus. |
| New production browser `gmiR4UxPolishUi.test.mjs` | **8/8 scenarios pass**, plus the parent test. There are no runtime exceptions and the input file bytes are unchanged. |
| Relevant node suites (`gmiEdit*`, `gmiBatchInspector`, `gmiR4UxPolish`, `gmiValidatorEditing`, `layerTableRows`, `tableSearch`, `objectTableInspection`, `hyperlinkFilenames`, `validationV2Workspace*`) | **218 tests: 205 pass, 3 baseline failures (`validationV2WorkspaceInspector`), 9 skips**. One extra failure appeared on the first run: a source-shape assertion on the unchanged search call in `hyperlinkFilenames`. I fixed it by keeping the exact ordinary search expression; it now passes. |
| FOTO/GMI-photo node gate (`photo*`, `gmiPhoto*`) | **889 tests: 796 pass, 0 fail, 93 skips**. That is the same 796 passes as R4; the skips are browser tests without `PHOTO_UI_URL`. |
| Production browser gate on port 3123, serial: R4 UX, R4, R3, R2 keyboard, R1 geometry, Rettinger workspace, M5B modal, M5C, M5A validation, draft guard, loaded-GMI FOTO, import wizard, map teardown, Pass 1D, GMI associations, FOTO workspace | **103 tests: 100 pass, 0 fail, 3 skips** (the existing optional/private skips). |
| Full serial suite without `PHOTO_UI_URL` | **2,008 tests: 1,893 pass, 7 baseline failures, 108 skips**. |
| Targeted ESLint (changed source and tests) | **0 errors**, plus the one existing TanStack `react-hooks/incompatible-library` warning. MapInner was not touched or linted. |
| Production build | **Pass**: compile, TypeScript and static generation. |
| `git diff --check` | **Pass**, with the ordinary LF/CRLF notices only. |

The seven full-suite failures are the documented baseline, identical to R3 and R4:
- `appInfoUiContract` (1);
- `statsUiContract` (2);
- optional external-corpus `terrainPhotoGml` (1);
- `validationV2WorkspaceInspector` (3).

I updated these existing tests deliberately, for intentional wording and composition changes only:
- R4 browser: «Forhåndsvis endringer»/«Oppdater forhåndsvisning», the summary text instead of `Valgt:`/`Kvalifisert:`, «Filtrert visning», the icon toggle, the staged success state, and «rettingene er endret». The draft-preservation checks now read the visible proposal while the form is collapsed. The test also gains assertions that an excluded row shows no value and that a stale preview has `data-state=stale`.
- R3 browser: segmented toggle labels, plus new wording assertions for the replacement dialog.
- `gmiBatchInspector`: the counts object gains `excluded` and `newChecks`.
- `objectTableInspection`: two regexes for the column composition and the non-draggable identity column.

No safety assertion was weakened.

Logs, in `%TEMP%`: `r4ux-new-ui.log`, `r4ux-r4ui.log`, `r4ux-browser-gate-final.log`, `r4ux-node.log`, `r4ux-photo-node.log`, `r4ux-full.log`, `r4ux-eslint.log`, `r4ux-build-final.log`. Chrome and production-server runs used the local-debugging access these gates already require.

## 8. Screenshots

All screenshots come from the production build (`next start`) with synthetic data; no real delivery was used. The workflow screenshots use a 48-line file shaped like the reported case. Ledning 1 is SP/PVC with SN8, Ledning 2 already has SDR 11.0, and Ledning 38 and 43 are VL/PE. The layout screenshots come from the browser suite, whose `:L` numbers are offset by 100 so that labels can never coincide with file positions.

- [Selection bar: counts and actions, primary entry](assets/20261110-gmi-r4-ux/r4ux-02-selection-bar-1366x768.png)
- [Preview: «Foreslått retting», object numbers, outcome badges, SDR in focus](assets/20261110-gmi-r4-ux/r4ux-04-preview-1366x768.png)
- [Ledning 38 removed after preview: «Utelatt av deg», «—»](assets/20261110-gmi-r4-ux/r4ux-05a-excluded-38-1366x768.png)
- [Advanced mode: «Inkluder manuelt» button and labelled hypothetical](assets/20261110-gmi-r4-ux/r4ux-06-advanced-1366x768.png)
- [Risk approval: FEIL → SJEKK → manual, distinct approval](assets/20261110-gmi-r4-ux/r4ux-08-risk-1366x768.png)
- [After staging: success detail, Objekt | Original | Foreslått, compact history](assets/20261110-gmi-r4-ux/r4ux-09-staged-1366x768.png)
- [Vis i Foreslått: SDR directly after Nr., focus chip](assets/20261110-gmi-r4-ux/r4ux-10-proposed-focus-1366x768.png)
- [Contextual geometry replacement](assets/20261110-gmi-r4-ux/r4ux-11-replace-1366x768.png)
- Layout with a live preview: expanded [1920×1080](assets/20261110-gmi-r4-ux/r4ux-layout-expanded-1920x1080.png), [1366×768](assets/20261110-gmi-r4-ux/r4ux-layout-expanded-1366x768.png), [1280×720](assets/20261110-gmi-r4-ux/r4ux-layout-expanded-1280x720.png); normal [1920×1080](assets/20261110-gmi-r4-ux/r4ux-layout-normal-1920x1080.png), [1366×768](assets/20261110-gmi-r4-ux/r4ux-layout-normal-1366x768.png), [1280×720](assets/20261110-gmi-r4-ux/r4ux-layout-normal-1280x720.png)

I opened and inspected every screenshot. The rendered checkboxes, the primary buttons, the segmented pressed state and the manual button are teal (`rgb(0, 117, 149)`); the browser suite also asserts these computed colours. The FEIL and SJEKK chips use red and amber Validator tokens. The risk-approval button is dark amber, not teal. The table toolbar stays on one line at all three widths, and the «Foreslått retting» block is visible without scrolling in the short, expanded-table inspector.

## 9. Manual browser acceptance checklist (Preview, real Wilhelmsenhallen GMI)

1. In Rettinger, confirm the «Nr.» column matches the left list labels. Search `38`, `l38` and `ledning 38`, then sort by Nr. and by another column. Confirm the base table (outside Rettinger) has no Nr. column.
2. Select Ledning 38 and 43 and confirm the selection bar reads as counts plus buttons, with «Rediger valgte (2)» clearly primary.
3. Preview SDR = 11 and confirm the «Foreslått retting» block shows «SDR: tom → 11», «Fyll manglende verdier», «2 av 2 ledninger endres» and the FEIL/SJEKK chips.
4. Switch to «Filtrert visning» and uncheck Ledning 38. Its row must read «Utelatt av deg» with «—» and no value. Unrelated rows must be blank, and the summary must read «1 av 1 …» with «Utelatt av deg: 1».
5. Re-check Ledning 38. The summary must read «Utvalget er utvidet…», every row must read «Ugyldig forhåndsvisning», and staging must be disabled. «Oppdater forhåndsvisning» must restore it.
6. Advanced mode on Ledning 1 (SP/PVC, SN8):
   - «Inkluder manuelt» looks like a button, and the row shows «Hvis inkludert: …» before inclusion.
   - After inclusion, the chips read 1 ny FEIL and 1 ny SJEKK.
   - The risk dialog shows red FEIL first, then amber SJEKK, then the dashed manual group with the hydraulic-class reason. Cancel is focused, and the approval button is visibly different.
7. Approve and check the green «Lagt til i arbeidskopien» detail: Objekt | Original | Foreslått, «I arbeidskopien · ikke lastet ned», and the compact left card. Use «Vis i Foreslått» and check that SDR is directly after Nr., that «SDR først» toggles it, and that dragging a column ends the focus.
8. Undo and redo from the header, then «Vis detaljer» from Endringer. Discard from the detail, including the dependents warning.
9. Check the geometry replacement wording with three lines selected, then click a point and cancel.
10. Use the table-size icon (tooltip on hover and keyboard focus) at 1920×1080, 1366×768 and 1280×720 with a live preview. The proposal must remain visible without scrolling.
11. Smoke-test the old Masseendringer modal, the M5C «Lag retting…» handoff, export, and FOTO navigation.

## 10. Risks and recommendations before R5

- **Accessibility.** The outcome badges and chips are text and colour, and the arrow in value cells has a screen-reader «til». Real NVDA/JAWS acceptance is still outstanding.
- **Stale previews.** The table shows «Ugyldig forhåndsvisning» for every selected row. With very large selections this is repetitive, but it is correct and neutral. A single row-level indicator could replace it later.
- **Single-object history cards** still contain the field table. R6 can decide whether all detail should move to the inspector.
- **R5** should reuse the new `GmiChangeSetDetail` and the outcome model when a Validator finding seeds an explicit selection. That keeps the hypothetical/actual distinction in one place.
- `gmiBatchReviewRows` is the single source of table truth for the review. Future batch fields should extend it, not add parallel status text.
