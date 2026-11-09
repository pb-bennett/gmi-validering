# M5B refinement — two-step review, exclusion evidence and manual override

2026-11-09. Branch `feature/photo-workspace`, starting HEAD **2523605**, verified before edits. The starting working tree was clean. Existing M5B acceptance, source-preserving export and history were retained. No commit or push.

## Outcome and files

Ordinary batch corrections now use **1. Velg verdi → 2. Se gjennom og bekreft**. The reviewed selection stages directly with **Legg til masseendring**. Only manual applicability overrides, actual populated-value overwrites or replacement of previous corrections require a focused risk confirmation. There is no third object-table screen.

| Changed file | Purpose |
|---|---|
| `src/components/gmi-edit/GmiBatchDialog.js` | Two-step workflow, exact selection counts, grouped exclusions and inspection, advanced selection and focused confirmation. |
| `src/components/gmi-edit/GmiChangeList.js` | Identifies manual overrides in the existing history, including original exclusion evidence and unchanged manual requests. |
| `src/components/gmi-edit/gmiEdit.css` | Teal actions, bounded groups/search, bounded risk findings/history and stable scrolling layout. |
| `src/lib/gmiEditBatchView.mjs` | Preview diagnostics for excluded objects, evidence-based Norwegian explanations, manual selection gates and M2 orchestration. |
| `src/lib/gmi-edit/eligibility.mjs` | Preserves applicability status and immutable Validator evidence on eligible/skipped entries. Default eligibility decisions remain unchanged. |
| `src/lib/gmi-edit/session.mjs` | Explicit, authenticated manual override extension to `createGmiBatchCorrection`; retains audit metadata. |
| `src/lib/validation-v2/validationRunner.js` | Extracts the existing hydraulic applicability decision to retain its cause; exposes diagnostic facts through the existing applicability API. |
| `tests/gmiEditBatch.test.mjs` | Four additional tests, extending the focused suite to thirteen tests. |
| `tests/gmiEditBatchUi.test.mjs` | Updated two-step flow plus grouped exclusions, manual override, cancellation, reset, source structures and missing-column browser scenarios. |
| This report and `assets/20261109-gmi-edit-m5b-refinement/` | Results and synthetic screenshots. |

M1, the ChangeSet model/compiler, undo/redo/discard algorithms, session registry, import storage, Data Table and FOTO implementation are unchanged. No M5C finding actions, full-dataset comparison, column creation, hyperlink removal or delivery changes were added.

## Workflow and exclusion explanations

The second step keeps the original/current/new value table, individual exclusions, all/none, search, paging and new-FEIL filter. Counts come from a memoized M2 construction of the selected subset, including actual applied cells, unchanged values, overwritten populated values and any M2 skips. Selecting/searching never reruns object diagnostics. Approval rebuilds against the live session before staging.

Going back keeps the configured field/value/mode, clears the dependent preview, selection and permissions, and requires calculation again. Recalculation after a session transition starts with **no selected objects**, including no remembered manual authorizations. It cannot silently widen an old selection.

**Hvorfor hoppes objekter over?** now groups the actual M2 reasons and counts rather than printing one flat list. Groups represent the original automatic classification; manually selected counts are explicitly marked within them. The live skipped total excludes deliberate manual selections. A group of inapplicable objects does not claim they all share the same underlying cause.

Every expanded group has search, 50-object pages and a bounded scroll region. Individual rows show identity, effective Tema/material, exact target values where safely readable, applicability status, a Norwegian explanation and shared diagnostics. Unreadable source structure is labelled as such rather than shown as an empty safe cell.

Hydraulic explanations use evidence from the **existing shared applicability decision**:

- Hydraulic class outside the recommended use of the field.
- Material family outside the recommended use of the field.
- Special hydraulic class requiring manual assessment.
- Unresolved dependencies, with the existing Validator explanation and an explicit unresolved fallback.

Tema, validated Material and hydraulic classification are included as factual context where available. No UI code classifies materials or hydraulic Tema values. The extraction in `validationRunner.js` preserves the original branch order and applicability states; it adds explanation evidence without changing rule severity or policy.

Each excluded row also offers **Inspiser attributter og øvrige funn**. This is read-only inspection of the same object/current lexical values used by the preview. It stays inside the modal, so neither object navigation nor the unsaved-draft guard discards the batch configuration. Shared `PhotoIconButton` severity tooltips remain available.

## Exact advanced semantics and M2 extension

**Avansert: Tillat manuelt utvalg utenfor Validatorens anbefaling** is off by default and independent of fill/overwrite. Enabling it selects nothing extra. It exposes explicit checkboxes on the excluded objects. The deliberate **Velg alle teknisk redigerbare i valgt verdimodus** action selects automatic candidates plus permitted manual candidates across pages; it does not bypass the selected value mode. Disabling advanced mode removes manual additions and resets replacement approval.

Only original M2 exclusions with reason **`not-applicable`** or **`unresolved`**, a safely resolved source cell and permitted original/current value state can be manually included. Populated cells still require overwrite mode. Irregular/non-editable objects, missing columns and unresolved physical column binding remain blocked. Manually included objects are also visible in the main reviewed table with a manual marker and their original exclusion reason, so new FEIL remain accessible even when an exclusion group is collapsed.

The M2 extension is opt-in:

```js
createGmiBatchCorrection(session, {
  eligibility,                          // genuine M2 token for this exact session
  manualTargets: [{ scope: 'line', sourceIndex: 2 }],
  allowApplicabilityOverride: true,
  lexeme: '11.0',
  mode: 'fill-missing',                  // independent overwrite permission
  conflictPolicy: 'skip',                // independent replacement permission
});
```

Without manual targets, the existing API behaviour remains unchanged. For manual targets, M2 requires the explicit flag and a genuine eligibility object registered in its private WeakMap. It resolves only entries actually skipped by that result, rejects duplicates, malformed indices, foreign/stale tokens, ineligible technical reasons and fill-mode requests for populated original **or current proposed** values. Manual tokens additionally require the exact immutable session object, including after undo/redo back to an identical `stateKey`.

The existing builder performs the final identity, encoding, lexeme, overwrite and conflict checks. No eligibility token is forged, and no M1 editing call bypasses M2. A batch containing only manual candidates is supported.

The frozen ChangeSet retains:

- `eligibility.normallyEligible`: the normally eligible requested identities.
- `eligibility.manualOverrides`: requested manual identities, original exclusion reason/status, original/current lexemes and Validator evidence.
- Existing cells/overwrite/conflict records: actual writes, populated-value overwrites and replaced earlier ChangeSets.

Manual requests that are no-ops remain auditable and are explicitly marked as changing no value in history. The history label includes **Manuelt overstyrt**. There is still exactly one staged ChangeSet and one existing history implementation. Internal construction for accurate counts can consume unused ChangeSet sequence numbers, as in M5B.

## Risk confirmation and safety

Ordinary missing-value corrections stage from step 2, including when advisory findings exist. Manual overrides show **Bekreft manuelt overstyrt masseendring**. Actual populated overwrites or prior-correction replacement show a focused overwrite confirmation. These dialogs summarize the supplied field/value, actual changed count, manual counts by original reason, populated overwrites, prior replacements and relevant shared FEIL/SJEKK explanations. They do not repeat the object table. **Tilbake til utvalget** preserves selections and configuration.

Existing SDR/Ringstivhet exclusivity remains the same shared red FEIL; unusual supplied values and unresolved dependencies retain their existing orange SJEKK. Newly introduced findings are compared with the current effective values, not merely with the original file. Warnings remain advisory. Cross-object NYTT-year evaluation is still explicitly deferred.

All preview building and approval remain bound to the live registry session. Stage/undo/redo/discard invalidate pending preview/risk approval. Final staging independently checks session identity. Source replacement/removal is still guarded by the registry and ChangeSet provenance. Async preview cancellation/liveness checks and the existing unsaved form/navigation/unload protection are retained.

Absolute boundaries remain: no source-column insertion; no ambiguous/irregular byte-span editing; no unsafe lexemes/encoding; no structural, geometry, coordinate, GUID or header editing; no S_HYPERLINK/alias editing. Approved cells compile against the immutable original through the existing verified M2/M1 output pipeline. Neither imported `layer.data` nor original bytes are written.

## Tests, performance and screenshots

| Verification | Result |
|---|---|
| Focused M5B node suite | **13/13 pass**. |
| Production-browser M5B | **7/7 pass**, including the parent and six scenarios. |
| GMI-edit + Validator node suites | **399 tests: 389 pass, 3 known baseline failures, 7 expected skips**. |
| Final production GMI-edit + FOTO regression, serial | **170 tests: 164 pass, 0 fail, 6 expected skips**. Includes all `gmiEdit*`, `photoLoadedGmiUi`, `photoImportWizardUi`, `mapTeardownUi`, `photoWorkspacePass1dUi`, `gmiPhotoAssociationsUi`, `photoWorkspaceUi`. |
| Complete serial suite | **1,930 tests: 1,822 pass, 7 known baseline failures, 101 skips**. |
| Targeted ESLint on every changed JS/MJS source/test | **Clean, zero warnings**. |
| Final production build | **Success**. |
| `git diff --check` | **Clean**. |

The seven full-suite failures remain the established baseline: `appInfoUiContract` (1), `statsUiContract` (2), `terrainPhotoGml` optional external real-corpus integration (1) and `validationV2WorkspaceInspector` (3). The three GMI/Validator subset failures are that last baseline group. No new failure remains. Final production regressions ran against `next start` on port 3123 after the layout fix and final API safety checks. Logs are `%TEMP%/m5b-refine-*.log`.

Focused tests exercise default/API compatibility; precise hydraulic/material explanations and unresolved fallback; explicit manual inclusion; no automatic expansion; authentic/exact-session tokens; independent overwrite and replacement approval, including an earlier populated proposal whose original was empty; forbidden/absent/irregular fields; invalid lexemes; one reversible ChangeSet; metadata; independent exact-byte verification and unchanged original source bytes.

Production tests exercise direct two-step staging, exclusions/counts, 50-row paging/search, group evidence and read-only inspection, advisory FEIL/SJEKK, advanced all/none and disabling, focused confirmation cancellation, stale refresh, history, Data Table modes, technically blocked objects, populated targets and absent SDR. Existing individual Rettinger and FOTO suites remain in the regression run.

The synthetic 1,000-object preview measured approximately **3.8–3.9 seconds** locally with **51 yields**. Preview now computes bounded object-scoped diagnostics for examined excluded objects as well as normal candidates. Large files with many exclusions can therefore take longer than the earlier eligible-only preview. Loading/cancellation remain available, with chunks of 20; checkbox/search/paging does not recompute these diagnostics. Selection summaries use cached M2 applicability plus ChangeSet safety checks. The first applicability calculation still runs synchronously after the loading state paints; no full-dataset Validator comparison or mutation testing runs.

The modal/footer were measured at **1366×768** and **1280×720**. Visual review found a flex-shrink overlap when expanded groups became tall; all content sections now retain their natural height inside the scrolling body. A browser assertion verifies that expanded groups do not overlap earlier sections. Main and risk confirmation actions stay visible. Teal uses the existing `--gmi-interactive` (`#007595`), severity uses shared tokens and icons are Phosphor Regular.

Synthetic-only screenshots:

- [Two-step review at 1366×768](assets/20261109-gmi-edit-m5b-refinement/m5b-review-1366x768.png)
- [Two-step review at 1280×720](assets/20261109-gmi-edit-m5b-refinement/m5b-review-1280x720.png)
- [Grouped exclusion and attribute inspection](assets/20261109-gmi-edit-m5b-refinement/m5b-refined-exclusions.png)
- [Deliberate manual selection](assets/20261109-gmi-edit-m5b-refinement/m5b-refined-manual-selection.png)
- [Focused manual override confirmation](assets/20261109-gmi-edit-m5b-refinement/m5b-refined-override-confirm.png)
- [Focused overwrite/replacement confirmation](assets/20261109-gmi-edit-m5b-refinement/m5b-overwrite-conflicts.png)
- [Manual override recorded in history](assets/20261109-gmi-edit-m5b-refinement/m5b-refined-manual-history.png)

## Remaining limits and browser acceptance

Changes remain in-memory, export remains **Eksperimentell**, and Gemini VA import acceptance remains an external manual check. No full-dataset Validator comparison or cross-object NYTT check was added. A missing or ambiguous physical column is a technical restriction, not an overridable applicability opinion. Group inspection stays in the modal rather than switching the external editor. The existing Endringer cell/object list is unchanged apart from the bounded manual-override audit disclosure.

Recommended acceptance:

1. Repeat the accepted SDR fill on the real 45-pipe file. Verify the original automatic counts and individual explanations without assuming every inapplicable pipe shares a cause. Exclude one eligible pipe and stage directly from step 2; undo/redo the single ChangeSet.
2. Expand different exclusion groups, search by object/Tema/material/reason and inspect attributes/warnings. Verify the batch configuration remains intact and the footer stays accessible at both laptop sizes.
3. Enable advanced mode and verify it adds no selections. Explicitly include an inapplicable pipe and an unresolved pipe. Read their original reasons and the resulting Validator findings; cancel risk confirmation and check both remain selected.
4. Deliberately select all technically editable objects in fill mode, then repeat in overwrite mode. Check that populated values require the latter, irregular objects stay blocked, and missing SDR still cannot be created.
5. Approve a manual batch only after reading the actual risk findings. Verify the manual marker and original exclusion evidence in Endringer; undo, redo, discard and inspect Original/Foreslått/Kun endrede.
6. Stage a previous target correction, then explicitly choose overwrite and replacement. Verify the focused confirmation gives the actual overwrite/replacement counts. Change the value by going back and verify old selections/permissions are not carried forward.
7. Invalidate an open preview through a history/source transition. Verify recalculation clears manual authorization and selection and requires a fresh review. Export a deliberate batch and independently compare the intended target values and preserved source file.

The refinement preserves source-safe editing while making ordinary approval shorter and manual applicability decisions explicit and auditable. Final synthetic screenshots were visually inspected, and the temporary production server was stopped after verification. Nothing was committed or pushed.
