# M5B — controlled batch corrections in Rettinger

Date: 2026-11-09. Branch `feature/photo-workspace`, starting HEAD `df79948`. Continued current HEAD after M5A and its polish. The initial working tree was clean. No commit or push.

## Result and files

Rettinger now has a discoverable **Masseendringer** footer action. Its contained three-stage modal lets users supply a field/value, review and exclude objects, then approve one reversible ChangeSet. Supported fields are SDR, Trykklasse and Ringstivhet; no value is suggested automatically. Fill-missing is the default. The original import stays unchanged.

| File | Purpose |
|---|---|
| `src/components/gmi-edit/GmiBatchDialog.js` | Configure → object selection → final confirmation, warnings, bounded/searchable tables, cancellation and stale-preview UI. |
| `src/lib/gmiEditBatchView.mjs` | Orchestrates the existing M2 eligibility/batch APIs and M5A object diagnostics; chunked preview and explicit selected subset. |
| `src/components/gmi-edit/GmiEditWorkspace.js` | Entry action, combined object/batch draft guard, existing history/list integration. |
| `src/components/gmi-edit/gmiEdit.css` | Contained laptop modal, persistent footer, scrollable/paged table and shared severity colours. |
| `tests/helpers/gmiEditBatchFixture.mjs` | Fabricated hydraulic/material/structure cases. |
| `tests/gmiEditBatch.test.mjs` | Nine focused tests, including independent preservation oracle and 1,000-object preview. |
| `tests/gmiEditBatchUi.test.mjs` | Production-browser workflow with four subtests and synthetic 129-object input. |
| This report and `assets/20261109-gmi-edit-m5b/*.png` | Implementation and visual evidence. |

M1–M3, the shared rule engine, imported-layer storage, export implementation and FOTO business logic are unchanged. No M5C actions/comparison UI, structural insertion, hyperlink removal or combined delivery was implemented.

## Workflow and selection semantics

1. **Configure.** Select one of the three supported fields and type the exact new lexeme. M1 `validateGmiFieldLexeme` checks delimiters, controls and encoding. Empty/whitespace-only new values cannot start a batch; this workflow supplies values rather than clearing them. Overwrite is a separate radio choice with a prominent warning.
2. **Review.** `evaluateGmiBatchEligibility` evaluates the current proposed dataset. The modal displays examined/eligible/selected/excluded totals, actual M2 skipped reasons, and previously corrected target-field counts. Rows show identity, current Tema/material, exact original/current/new values, previous ChangeSet identities and warnings. Search matches identity, context and GUID. Only eligible objects can be selected; skipped/unresolved objects cannot be included. Initially, earlier touched target fields and already-identical proposed values are unselected. Select-all explicitly selects the eligible set, across pages and independently of search; select-none clears it. Exclusion never widens the selection elsewhere.
3. **Confirm.** A fresh M2 eligibility token for the explicit selected targets feeds `createGmiBatchCorrection`. The final summary uses the actual resulting cells and populated-overwrite count, lists unchanged selected objects and any additional M2 skips, and retains excluded and skipped-by-reason totals. Confirmation stages exactly one ChangeSet through `gmiEditSessions.stage` / `stageGmiChangeSet`. The history label uses the actual changed-object count, e.g. `Fyll SDR 11.0 · 122 ledninger`, with an ISO creation timestamp displayed in Norwegian local form. The established Endringer list, undo, redo and discard handle the batch.

M2 retains a selected-scope eligibility summary in the ChangeSet. The all-examined preview and individual exclusions are transient UI state, not a separate history ledger. The helper first builds an un-staged M2 result to obtain its exact applied count, then builds the labelled final set. Only the latter is staged; internal ChangeSet sequence numbers can consequently have gaps.

Missing columns and ambiguous bindings fail closed with a Norwegian explanation. Irregular source objects retain M2's `object-not-editable` reason. Applicability remains M2/Validator policy, including unresolved Material/Tema/hydraulic context. Earlier proposed Material/Tema changes affect eligibility. Earlier SDR fills become populated and cannot be overwritten by the default mode. M2 additionally protects originally populated cells even if an earlier correction cleared them; final review exposes any resulting skip.

## Overwrite, conflicts and Validator feedback

Overwrite mode does not override applicability. Each populated target is marked, and its actual overwrite count appears before staging. Earlier touched target fields are not selected automatically. Selecting a different value for such a field requires a separate **Erstatt tidligere rettinger** approval; review cannot continue without it. The actual write/conflict decision remains M2's `skip`/`replace` policy. Already-identical values remain M2 no-ops.

Preview reuses `gmiEditObjectDiagnostics`, the same M5A object validator, with all current effective lexical values plus the proposed target lexeme. It compares findings before/after the batch draft to mark findings newly introduced by this batch, independently of changes introduced by earlier staged corrections. No SDR/Ringstivhet relationship or severity is reimplemented in the UI.

New findings and target-field findings are visible inline. In particular, filling SDR on an eligible VL/PE pipe already containing Ringstivhet produces the shared red **FEIL** explanation. An existing relationship error remains visible but is not incorrectly marked as new again. A **Vis bare objekter med nye FEIL** filter provides direct access across the entire eligible/approved set. Other existing object findings, including orange **SJEKK**, remain inspectable in each row's compact disclosure. Colours use the M5A shared `--validation-*` aliases; icons are Phosphor Regular. Findings are advisory, as in M5A. Cross-object NYTT-year comparisons remain explicitly deferred; no full dataset validation comparison runs here.

## Session, source and draft safety

The preview captures the immutable session object. Any stage/undo/redo/discard produces another session object, invalidating the preview even if undo+redo returns to an identical active `stateKey`. Async generation checks and registry liveness prevent a cancelled or superseded preview from publishing. Selection construction and final staging independently check the current registry session. A stale modal disables approval, explains the change and offers recalculation, which returns to object selection and requires another confirmation.

Registry handle/source checks remain M3's responsibility. Source replacement or removal cannot stage an old ChangeSet. No new source/session manager was added.

Object and batch draft booleans are combined in the existing workspace guard. Entering the batch workflow from a dirty object form first uses that guard. Global navigation/reset protects the batch form too. Escape, close and Avbryt require a discard decision when a batch draft exists; cancelling preserves the value and selection. Browser unload is guarded. Async completion after closing is ignored.

All approved cells compile through M2 against the immutable original and use M1 verification/export. No code writes imported `layer.data`, geometry, coordinates, identity, header or unrelated fields. The allow-list never includes S_HYPERLINK; existing M2 alias protection remains in force. Absent columns cannot be created. Independent M0 verification in the new test confirms exact output cell changes and source-byte preservation; established production-browser export tests also continue checking downloaded bytes and unchanged source files.

## Performance and layout

The helper requests M2's cached proposed dataset/applicability. Object-scoped diagnostics are calculated once per preview in chunks of 20 with event-loop yields and cancellation checks. A visible loading state is painted before eligibility calculation. No full Validator run is triggered by checkbox, search, paging, confirmation navigation or exclusion. Final confirmation rechecks the selected scope through M2's cached applicability; it does not repeat object diagnostics.

The synthetic 1,000-object preview measured approximately **3.8 seconds**, yielding **51 times**. This is a local observation, not a device-independent performance promise. The first M2 eligibility calculation is still synchronous after the loading state paints; very large files can briefly occupy the main thread. No mutation testing was needed or run.

Both eligible and skipped lists have search and 50-row pages. Eligible rows use a bounded 280 px scrolling table; confirmation/cancel controls stay in a separate fixed modal footer. Browser measurements and visual inspection at **1366×768** and **1280×720** found no horizontal dialog/page overflow and confirmed the footer stays inside the viewport.

## Screenshots

All screenshots contain fabricated data only.

- [Fill configuration](assets/20261109-gmi-edit-m5b/m5b-configure-fill.png)
- [Explicit overwrite warning](assets/20261109-gmi-edit-m5b/m5b-configure-overwrite.png)
- [Review with exclusion and shared FEIL at 1366×768](assets/20261109-gmi-edit-m5b/m5b-review-1366x768.png)
- [Review at 1280×720](assets/20261109-gmi-edit-m5b/m5b-review-1280x720.png)
- [Final confirmation](assets/20261109-gmi-edit-m5b/m5b-confirm.png)
- [Explicit conflict replacement confirmation](assets/20261109-gmi-edit-m5b/m5b-overwrite-conflicts.png)
- [One batch in Endringer](assets/20261109-gmi-edit-m5b/m5b-changes.png)

## Verification

| Check | Result |
|---|---|
| Focused M5B node suite | **9/9 pass**. |
| Production-browser M5B main workflow | **5/5 pass** (parent + four subtests). |
| All GMI-edit + Validator node tests | **395 tests: 385 pass, 3 known baseline failures, 7 skips**. |
| Production-browser GMI-edit + FOTO regressions, serial | **164 tests: 158 pass, 0 fail, 6 expected skips**. Includes all `gmiEdit*`, `photoLoadedGmiUi`, `photoImportWizardUi`, `mapTeardownUi`, `photoWorkspacePass1dUi`, `gmiPhotoAssociationsUi`, `photoWorkspaceUi`. |
| Full suite, serial | **1,926 tests: 1,818 pass, 7 known baseline failures, 101 skips**. |
| Targeted ESLint, all changed JS/MJS source/tests | **Clean, zero warnings**. |
| Production build | **Success**. |
| `git diff --check` | **Clean**. |

The seven full-suite failures are unchanged: `appInfoUiContract` (1), `statsUiContract` (2), `terrainPhotoGml` optional external real-corpus integration (1), and `validationV2WorkspaceInspector` (3). The three GMI/Validator-subset failures are that last baseline group. No new regression remains. Browser regression tests used `next start` at port 3123; optional corpus cases remained opt-in. Logs are in `%TEMP%/m5b-*.log`.

After the final populated-value wording clarification, a fresh production build and combined M5B node/browser rerun passed **14/14**. Final screenshots were regenerated and visually inspected; the temporary production server was stopped. Nothing was committed or pushed.

An early browser pass found a null confirmation reference while refreshing a stale confirmation preview. Recalculation now returns to selection before clearing that reference; the production test exercises this path successfully. An initial test-only colour assertion assumed RGB serialization; it now verifies rendered red channels because the shared palette can serialize as Lab. These are resolved, not added baseline failures.

The focused tests cover default fill; all three allow-listed fields; Material/Tema applicability; missing/populated/inapplicable/unresolved/irregular cases; exclusion and all/none; overwrite and conflict replacement; stale/foreign sessions and async cancellation; exactly one staged ChangeSet; undo/redo/discard; shared FEIL and inspectable SJEKK; absent/reserved fields and unsafe lexemes; exact output/source preservation; empty and 1,000-object sets. Production tests cover configuration, warning colours, draft cancellation/navigation/unload guards, 50-row paging/search, responsive footer, new-FEIL filtering, final approval, existing Data Table modes, conflict approval and stale-preview refresh. Existing M3/M4 suites cover registry source replacement and real downloaded output verification.

## Limitations and manual acceptance

State remains in-memory and export remains **Eksperimentell**. Full-dataset Validator comparison, cross-object NYTT checks and Gemini VA import acceptance remain outside this milestone. No values are inferred or assigned automatically. Existing unrelated object findings are collapsed for density; every newly introduced FEIL is shown inline and directly filterable.

Recommended manual acceptance:

1. Open a real GMI in Rettinger. Open Masseendringer and supply SDR, Trykklasse and Ringstivhet values in separate attempts. Verify the default missing-only mode and reason counts against known objects.
2. Search, exclude individual eligible objects, select none/all and page through a long list. Verify skipped and unresolved objects never become selectable. Inspect the exact original/current/new lexemes.
3. On a pressure pipe with existing Ringstivhet, preview SDR. Read the red shared relationship error and use the new-FEIL filter. Inspect orange SJEKK under Andre objektfunn. Confirm only after understanding advisory findings.
4. Stage a Material or Tema correction first and verify batch applicability changes. Stage a fill and verify a subsequent fill skips it. Choose overwrite and explicitly approve replacement of selected earlier corrections.
5. Confirm the actual changed count and one timestamped entry in Endringer. Undo, redo and discard. Inspect Original/Foreslått/Kun endrede views and download the revised GMI; compare intended values in Gemini VA where available.
6. Cancel a batch draft, cancel its discard warning and verify the form remains. Try global reset/navigation with a draft. Verify a history/source transition invalidates a pending review and requires recalculation and fresh approval.
7. Repeat on missing-column and irregular-source files and at laptop dimensions. Verify no new columns, hyperlink edits or changes to the imported file occur.

M5B adds controlled batch selection and approval on the existing source-preserving editing infrastructure, with one reversible staged ChangeSet per approved batch.
