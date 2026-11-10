# R4 — integrated batch editing in the right-hand inspector

2026-11-10, Europe/Oslo. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, starting and final HEAD **8610ad1**. The starting working tree was clean. The separate QGIS repository was not used. Nothing was committed or pushed.

## 1. Summary and architecture

The Rettinger Data Table now offers a teal **Rediger valgte (N)** primary action. It deliberately enters batch mode in the existing right inspector through the combined unsaved-draft guard. Checkbox selection continues without that guard. The proposed value starts empty.

The inspector configures SDR, Trykklasse or Ringstivhet, calculates the explicit selection, reports the distinct counts, and stages one existing M2 ChangeSet. The main virtualized Data Table displays object identity/status, exact current → proposed lexemes, relevant findings and permitted per-object manual inclusion. Row activation opens reversible read-only details inside the inspector; the batch form and preview survive inspection. Those details use the verified current proposed dataset and expose full preview explanations/findings, including text truncated in table cells.

`GmiBatchInspector` owns its draft, engine preview, manual-inclusion keys, permissions and risk approval locally. `gmiBatchInspectorView.mjs` supplies only selection translation, validity and subset planning. The existing store carries a one-shot entry request, a layout boolean and small transient table-presentation records. Engine documents, source bytes and eligibility tokens are not copied into the store. These additions are excluded from persistence by the existing partialization and cleared on workspace unmount.

## 2. Changed files

| File | Change |
| --- | --- |
| `src/components/gmi-edit/GmiBatchInspector.js` | Inspector configuration, review, async cancellation, manual override, guarded staging/risk approval and read-only details. |
| `src/lib/gmiBatchInspectorView.mjs` | Exact source-target conversion, preview validity, current-subset planning and result-derived counts/status. |
| `src/components/gmi-edit/GmiEditWorkspace.js` | Guarded entry, inspector portal, preserved batch draft during inspection, mutual exclusion with the fallback modal, history/notice integration and cleanup. |
| `src/components/LayerDataTable.js` | Primary entry action, compact review columns, manual-inclusion action, shared Lexeme rendering and reversible table sizing. |
| `src/components/WorkspaceShell.js` | Optional 35/65 dock split; default remains 62/38. |
| `src/app/page.js` | Supplies the expanded split only in Rettinger. |
| `src/lib/store.js` | Three transient presentation/request/layout values. |
| `src/components/gmi-edit/gmiEdit.css` | Compact inspector form, focus/accent tokens, scoped primary action styling and usable selection-bar secondary controls. |
| `tests/gmiBatchInspector.test.mjs` | Four computed tests for exact scope, binding, counts, overrides, hard limits, stale history and source/output preservation. |
| `tests/gmiBatchInspectorUi.test.mjs` | Production-browser parent plus six workflow/layout scenarios. |
| `tests/objectTableInspection.test.mjs` | Adjusts one source-shape assertion for the base-column variable and verifies the unchanged non-batch return. |
| This report and `assets/20261110-gmi-r4/` | Completion evidence and six synthetic layout screenshots. |

No editing-engine module, `GmiBatchDialog`, M5C implementation, Validator rule, parser, map selection implementation or FOTO business logic was modified.

## 3. Reuse of M5B and protected engine behavior

Calculation calls the unchanged `prepareGmiBatchReview(view, { canonicalFieldId, mode, lexeme, targets }, { isLive })`. It supplies the selected source objects explicitly; eligibility never defaults to all lines. Shared Validator applicability, skipped reasons, current-value diagnostics, new-finding detection and physical source-cell resolution remain M5B/M2 responsibilities.

Planning and final approval call the unchanged `buildGmiBatchSelection(session, preview, selectedCellKeys, replace, createdAt, allowOverride)`. The helper authenticates/re-evaluates eligibility for the current subset and uses the existing source-preserving batch builder. R4 never calls a generic ChangeSet builder for the hydraulic fields. Staging is the established `gmiEditSessions.stage(handle, changeSet)` route.

Missing/ambiguous columns, irregular objects, source identity/integrity, prohibited fields and S_HYPERLINK aliases, exact lexeme/encoding checks, original-value protection, overwrite/replacement policy and verified M1 output remain enforced by the existing engine. Undo, redo, discard, history and export retain their existing implementation and output semantics.

## 4. Exact selection-to-target translation

`gmiSelectionTargets` checks the R3 binding against the active view's layer ID, registry handle session ID and original document fingerprint. It also checks handle/document fingerprint equality, session/document object identity and `gmiSourceIntact`.

Each strictly parsed `line:<sourceIndex>` key resolves against `getGmiDocumentDataset(view.document).lines[sourceIndex]`, the immutable source parser dataset. Targets include scope/index and the source object's ID/GUID. Empty, duplicate, malformed, mixed or missing indices fail closed. Points receive an explicit line-only explanation; they are never silently dropped or passed into the line-only preview orchestrator.

M5B resolves the selected field through its existing schema binding and produces its own exact cell keys, e.g. `["line", 7, "SDR"]`. R4 filters these verified rows by R3 object identity and passes only the resulting cell-key set into M5B final construction. Filtered rows, map focus, keyboard cursor, parsed values and object labels are never used to infer targets.

## 5. Preview lifecycle and staleness

- A review captures the exact immutable session, source binding and calculated selection-key snapshot.
- Removing membership filters the existing verified preview and rebuilds the ChangeSet/counts through M5B. It does not rerun object diagnostics or introduce other objects. With selected-only display disabled, removed preview rows say **Utelatt av deg**, distinct from **Hoppes over**.
- Adding any membership after calculation invalidates approval and shows **Utvalget er utvidet – beregn på nytt**. This includes re-adding an object removed from the snapshot. Expansion is latched until recalculation; removing the addition does not revive approval. A synchronous store subscription and staging-time check protect this independently of rendering.
- Field/value/mode changes clear the dependent preview, manual authorizations, replacement permission and risk approval. Unsafe lexemes or blank proposed values cannot calculate.
- Stage, undo, redo and discard change immutable session identity and invalidate the review even after returning to identical effective bytes/stateKey. Source/session replacement also fails the binding/live-registry checks.
- Calculation uses an async generation counter, exact selection-reference checks and registry liveness, including a final post-calculation check. Selection changes while calculating require a new calculation.
- Final approval re-reads the live registry and live selection and rebuilds the exact current subset. Risk approval additionally binds to the reviewed selection/configuration/manual state. Stale approval cannot stage.
- A successful stage clears the batch draft/preview, shows explicit confirmation and selects the new entry in Endringer. The R3 selection remains available for review.

## 6. Manual override and count semantics

Advanced mode starts off. Enabling **Tillat manuelt utvalg utenfor Validatorens anbefaling** includes no extra objects. It exposes **Inkluder manuelt** only on selected rows accepted by the unchanged `canManuallySelectGmiBatchRow`. The membership checkbox and manual authorization remain separate controls/sets. Disabling advanced mode removes manual additions and resets replacement permission.

Manual, populated-overwrite or prior-correction replacement staging requires the existing compact `GmiConfirmDialog`. It identifies field/value, changed count, manual objects and original reasons, overwrite/replacement totals and relevant FEIL/SJEKK. Cancel returns to the intact draft. The final approved operation remains one ChangeSet, including existing manual audit metadata/history labelling.

Counts have different sources: selected/eligible come from the exact selection and filtered M5B preview classification; manual count comes from `changeSet.eligibility.manualOverrides`; changed/unchanged/overwrite counts come from the actual ChangeSet; skipped status combines original preview exclusions with final M2 skips; new-FEIL count uses actual changing cells plus M5B's introduced diagnostic flags. Eligible does not imply changed. Advisory findings for a skipped row do not increase the actual-changing new-FEIL count.

Hard technical exclusions and populated values in fill mode remain impossible to manually include. There is no bulk manual-inclusion shortcut in the new inspector.

## 7. Inspector and table layout

The existing shell retains its normal 62% map/inspector and 38% table split. **Større tabell** switches Rettinger to 35%/65%; **Mindre tabell** reverses it without resetting the draft. The reverse action remains available after clearing the last selected object. The ordinary application and FOTO keep their default layout.

The inspector configuration collapses after calculation into an accessible native disclosure. This makes counts, the advanced switch and staging usable in the short expanded-table inspector; the form remains available through **Endre oppsett**, and stale reviews have a visible recalculation action. Read-only details and longer content scroll within the existing inspector.

Three compact columns follow the existing fixed identity/Tema column: **Status**, **Nå → Ny**, **Nye funn / Validator**. Status also identifies the source object, so files without a dedicated object-number attribute remain understandable. Sorting of ordinary columns, source identities, 28px rows, virtualisation, checkbox selection and keyboard tools remain intact. Long text is truncated with a full title; row inspection exposes complete findings/explanations. Exact values reuse the existing `Lexeme` renderer, including visible whitespace, and the title includes JSON-formatted original/current/new lexemes.

Both normal and expanded layouts were checked at 1920×1080, 1366×768 and 1280×720. The automated expanded-grid height assertion guarantees room for approximately ten rows; the 1280×720 screenshot shows approximately twelve complete data rows. The page has no horizontal overflow, the inspector stays at least 380px wide/240px high, and map controls remain accessible in the inspected screenshots.

## 8. Styling and accessibility

New primary actions explicitly use `var(--gmi-interactive)`, approved **#007595**. The production browser asserts the entry button's computed background is `rgb(0, 117, 149)`. Inspector checkbox/radio accents and focus indicators use that token; existing R3 tests continue verifying teal, centred native selection checkboxes. New FEIL text uses the shared validation severity token.

Controls use native inputs/selects/details/buttons, compact labels, live count/status announcements and distinct read-only count styling. Existing Phosphor controls remain in place; no new icon library or floating panel was added. The targeted R3 toolbar polish is limited to borders/padding on its adjacent secondary actions. The geometry-replacement explanation and general styling cleanup remain deferred.

## 9. Verification results

| Gate | Result |
| --- | --- |
| New R4 computed/API tests | **4/4 pass**, including independent output-cell/byte preservation oracle. |
| New R4 production browser | **7/7 pass**, parent plus six scenarios. |
| Relevant GMI edit, selection, table and Validator node suites | **484 tests: 477 pass, 3 existing baseline failures, 4 skips**. |
| FOTO/GMI-photo node gate | **805 tests: 796 pass, 0 fail, 9 skips**. |
| Production R4 + R1/R2/R3 + Rettinger/M5B/M5C + FOTO browser gate | **94 tests: 91 pass, 0 fail, 3 skips**. |
| Full serial suite without PHOTO_UI_URL | **1,998 tests: 1,884 pass, 7 existing baseline failures, 107 skips**. |
| Final exact-lexeme/table node rerun | **19/19 pass**. |
| Final production exact-lexeme, R4, keyboard, M5B and M5C rerun | **27/27 pass**, no runtime exceptions. |
| Targeted ESLint, changed JS/MJS source and tests | **0 errors**, one existing TanStack `react-hooks/incompatible-library` warning. |
| Final production build | **Pass**, compilation, TypeScript and static generation. |
| `git diff --check` | **Pass**, ordinary CRLF conversion notice only. |

The seven full-suite baseline failures match R3: `appInfoUiContract` (1), `statsUiContract` (2), optional real-corpus `terrainPhotoGml` (1), and `validationV2WorkspaceInspector` (3). The relevant node subset contains only the last three baseline failures. No unrelated MapInner lint refactor was performed.

Browser gate: `gmiBatchInspectorUi`, `gmiEditSelectionUi`, `layerDataTableKeyboardUi`, `layerDataTableGeometryUi`, `gmiEditWorkspaceUi`, `gmiEditBatchUi`, `gmiValidatorEditingUi`, `gmiEditValidationUi`, `gmiEditDraftGuardUi`, `photoLoadedGmiUi`, `photoImportWizardUi`, `mapTeardownUi`, `photoWorkspacePass1dUi`, `gmiPhotoAssociationsUi`, `photoWorkspaceUi`, serial against `next start` on port 3123. Existing suites were run unchanged. The new suite checks for Runtime exceptions and verifies unchanged synthetic input bytes.

After the final table cell reused the established Lexeme renderer, a focused production rerun covers R4, keyboard navigation, unchanged M5B and M5C. Logs: `%TEMP%/gmi-r4-final-lexeme-browser.log`, `gmi-r4-browser-final.log`, `gmi-r4-node-final.log`, `gmi-r4-photo-node.log`, `gmi-r4-full-final.log`, `gmi-r4-lexeme-node.log`, `gmi-r4-eslint-final.log`, `gmi-r4-build-final.log`.

Environment/development findings were resolved separately: sandboxed Chromium could not complete Runtime.enable, so browser/full-suite checks ran with the required local-debugging access; one sandboxed build could not fetch the existing Roboto font and was rebuilt with network access. A browser test initially tried to click a button inside the newly collapsed disclosure; it now follows the visible recalculation action. One column source-shape assertion was updated for the intentional UI composition. These are not additional baseline failures.

Synthetic evidence:

- [Expanded 1280×720](assets/20261110-gmi-r4/gmi-r4-1280x720.png)
- [Expanded 1366×768](assets/20261110-gmi-r4/gmi-r4-1366x768.png)
- [Expanded 1920×1080](assets/20261110-gmi-r4/gmi-r4-1920x1080.png)
- [Normal 1280×720](assets/20261110-gmi-r4/gmi-r4-normal-1280x720.png)
- [Normal 1366×768](assets/20261110-gmi-r4/gmi-r4-normal-1366x768.png)
- [Normal 1920×1080](assets/20261110-gmi-r4/gmi-r4-normal-1920x1080.png)

## 10. Remaining limitations and parity differences

Manual user acceptance in Preview, real-delivery/Gemini VA import acceptance and assistive-technology acceptance remain outstanding. Automated synthetic acceptance is not claimed as those approvals. Sessions and unstaged drafts remain in memory; export retains its experimental status. M5B's synchronous initial eligibility and cross-object NYTT-year limitations remain.

The inspector uses the explicit R3 membership as its object scope and includes all automatically eligible members in planning, including possible unchanged/conflicting targets. The modal's initial eligible-row preselection excludes previously touched/identical cells. R4 instead exposes actual unchanged/conflict counts and requires the same explicit replacement/overwrite permissions; neither path widens the user's scope or changes engine policy.

The modal retains its separate paging, grouped exclusion tables, all/none controls, technical bulk manual selection and dedicated new-FEIL filter. The inspector uses the main table, per-object manual inclusion and reversible read-only detail instead. Attribute search/sorting remain the existing table behavior; preview text does not add a new search/filter engine. Wide attributes may require horizontal table scrolling. Long explanations/findings are fully available through row inspection.

The original Masseendringer entry and `GmiBatchDialog` remain functional. The guarded transition closes the inspector before opening the modal; modal requests cannot open a concurrent inspector preview. M5C **Lag retting…** continues to seed the original modal. No R5 origin-lock migration, R6 filters, R7 modal removal, R8 map-click selection or arbitrary-field editing was added.

## 11. Manual browser acceptance checklist

The following remain the human acceptance checklist, despite corresponding automated synthetic coverage:

1. Enter Rettinger, select two eligible VL/PE pipes and activate **Rediger valgte (2)**.
2. Verify inspector batch mode, exact object count and an empty new value.
3. Set SDR = 11 and calculate; confirm only those objects were evaluated.
4. Compare selected, eligible, skipped, manual, changed, unchanged and new-FEIL counts with the actual rows.
5. Inspect status, exact lexemes and full findings in the main table/row details.
6. Deselect a reviewed object; confirm the scope/counts shrink without recalculating diagnostics and the object is not staged.
7. Add an object, including a previously removed object; confirm staging stays blocked until recalculation.
8. Enable advanced mode; verify nothing is included automatically and explicitly include one permitted inapplicable object.
9. Read/cancel/reopen the compact risk confirmation, approve deliberately, and verify one reversible ChangeSet.
10. Check Endringer, Original/Foreslått, undo and redo. Confirm selection persists and old previews become stale.
11. Start an individual draft, select checkboxes, attempt batch entry, then test both cancel and confirm. Test cancelling navigation away from a batch draft too.
12. Select points and confirm the line-only explanation and disabled approval. Replace geometry while reviewing and verify no point is silently treated as a line.
13. Expand/restore the table at all three viewport sizes, including after clearing selection. Check inspector usability, focus, map controls and page overflow.
14. Re-run the existing modal workflow, overwrite/conflict approval, manual override and source-safe export for comparison.
15. Recheck M5C Validator handoff and FOTO import/navigation smoke tests. Replace/remove a source and verify no preview can stage against the old session.

## 12. Recommendations before R5

Review the synthetic screenshots and manually accept the inspector path on Preview with a representative source. Compare exact output against the retained modal for fill, overwrite, conflict and manual-override cases. Keep the fallback and existing M5C handoff until that review is accepted.

R5 should translate Validator's exact scope into an explicit source-bound selection and retain its origin restriction; it must not turn a finding into a live table filter. Reuse this inspector's binding, session checks and current-subset construction. Keep filter extraction, modal retirement, map-click selection and general polish in their separate milestones.

No commit or push was performed. The temporary production server is stopped after verification.
