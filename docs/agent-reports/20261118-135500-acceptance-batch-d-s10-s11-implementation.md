# GMI Validator acceptance corrections, Batch D (S10 and S11)

18 November 2026, Europe/Oslo. Completion of an interrupted implementation on `feature/photo-workspace` at `5a83c0d`. Scope follows the [acceptance plan](20261118-085516-real-data-acceptance-corrections-planning.md) (C6, C7, C2). The working tree already held the Codex implementation; it was preserved and verified, not rewritten.

## Provenance of results

- **Codex handoff observations (not independently verified by me):** the Phosphor conversion and Profilanalyse dot removal were reported complete; the S11 alignment was reported as passing in Chrome; a tooltip rendering behind the sidebar was reported and corrected; a build was reported as passing; the A7 failure was reported as reproduced.
- **Independently verified in this session:** everything in the "Verification" table. The production build was reused after confirming `.next/BUILD_ID` (13:01:36) was newer than every modified source file (latest 13:00:58). Only a test file changed afterwards, so no rebuild was needed.

## S10 — Layer card analysis icons and Profilanalyse dot (C6, C7)

- `src/components/LayerPanel.js`: the five hand-drawn SVG buttons in `LayerAnalysisButtons` are now `PhotoIconButton` with `layer-card-icon-button`, 14 px Phosphor Regular, 22 px targets, subtle colour, `aria-label` and tooltip, no native `title`. Mapping as approved: Marker alt `HighlighterIcon`, Profilanalyse `ChartLineIcon`, Høydekontroll `MountainsIcon`, Feltvalidering `ClipboardTextIcon`, Topplok `CircleHalfIcon`.
- Toggles (Marker alt, Topplok) keep `gmi-selected-control` and expose `aria-pressed`. KOF-disabled actions use `unavailable` (focusable, `aria-disabled`, tooltip «Ikke tilgjengelig for KOF»).
- The Profilanalyse warning dot and its `errorCount`/`warningCount` are removed. The Høydekontroll missing-Z dot moved to `.gmi-validation-dot` with `data-validation-tone="error"`; the tooltip states «N objekter mangler Z», so colour is not the only cue.
- `src/app/globals.css`: selected-state recipe for `.layer-card-icon-button` (so pressed toggles are visibly filled), and a `.layer-analysis-tooltip` stacking rule (`z-index: 10000`).
- `src/components/photos/photoIconTooltip.js`: adds `layer-analysis-tooltip` to tooltips whose anchor is inside `.layer-analysis-actions`, so the tooltip is not covered by the sidebar. Other tooltips are unaffected.

## S11 — Suggestion list columns (C2)

- `src/components/photos/photoCollectionPanel.css`: `.photo-import-capture-list` is a two-column grid (`minmax(0, 1fr) max-content`); each `li` uses `subgrid`, so list semantics are kept. Filenames wrap with `overflow-wrap: anywhere`; times use tabular numerals. Max height 12rem and local scrolling are unchanged. Rules are scoped under `.photo-import-wizard`. Below 600 px the time column becomes `minmax(0, 60%)`.

## Tests changed

- New `tests/layerAnalysisUi.test.mjs` (browser): size/colour parity with the header action at both laptop sizes, hover and keyboard tooltips, Escape, Profilanalyse results retained without a dot, missing-Z dot token and tooltip text, toggle state, tooltip visibility across its width, KOF restrictions. **Edit in this session:** wait two animation frames after the viewport resize before focusing, because the resize handler legitimately dismisses an open tooltip and the first run produced a 1366×768 screenshot without the tooltip.
- `tests/layerHighlightPanel.test.mjs`: source assertions for the five icons, no `<svg>`/`title`/counts, one status dot.
- `tests/photoImportWizardUi.test.mjs`: column x-alignment across rows, long filename wrapping, no overflow, 390 px width, scroll ownership.
- Selector updates from `button[title=Feltvalidering]` to `button[aria-label=Feltvalidering]` in `gmiIndividualSelectionUi`, `gmiValidatorEditingUi`, `gmiValidatorReturnUi`, `gmiValidatorSelectionHandoffUi`, `gmiValidatorSelectionUi`, `rettingerPhotoVisibilityUi` and `validatorDataTableSlice3Ui`. This follows the intended removal of native `title`; no safety assertion was relaxed.

## Verification (this session)

| Gate | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Focused Node (`layerHighlightPanel`, `featureHoverTooltip`, `gmiRettingerSidebar`, `photoImportWizardState`, `photoImportComplete`) | 47 | 0 | 0 |
| Production Chrome: `layerAnalysisUi` + `photoImportWizardUi` (first run) | 3 | 0 | 0 |
| Production Chrome regression: `gmiIndividualSelectionUi`, `gmiValidatorEditingUi`, `gmiValidatorReturnUi`, `gmiValidatorSelectionHandoffUi`, `gmiValidatorSelectionUi`, `rettingerPhotoVisibilityUi`, `validatorDataTableSlice3Ui`, `gmiEditValidationUi`, `photoPositioningUi`, `deliveryWizardUi`, `gmiRettingerSidebarUi` | 85 | 0 | 1 |
| `layerAnalysisUi` rerun after the test edit | 1 | 0 | 0 |
| eslint on all modified/new JS and test files (before and after the test edit) | clean | — | — |
| `git diff --check` | clean | — | — |

- Browser runs used `next start` on port 3187 against the existing build, serially, with Chrome. The server was stopped afterwards.
- Both 1280×720 and 1366×768 were exercised by `layerAnalysisUi` and `photoImportWizardUi` and screenshots inspected.
- The one skipped browser test is the opt-in real-photo case, as in earlier batches.
- **Not run:** a fresh `npm run build` (existing build verified as matching the source) and the full serial Node suite.

## Baseline failure

- `tests/validationV2GmiA7.test.mjs` — «Validator exposes only the automatic V2 workflow» (9 pass, 1 fail). Reproduced here; it matches the known literal `aria-label="Lukk Validator"` source assertion (see Batch C report). Untouched.

## Limitations and deviations

- Synthetic fixtures only; no real-file acceptance.
- The Høydekontroll tooltip overlaps the neighbouring «mangler LOK» line while open; transient and accepted.
- The prior Codex handoff test run was not repeated in full; coverage was re-established with the suites above.

## Screenshot evidence

Directory: `docs/agent-reports/assets/20261118-batch-d/`

| State | 1280×720 | 1366×768 |
| --- | --- | --- |
| Layer card analysis row, keyboard-focused Høydekontroll with tooltip and missing-Z dot, toggles pressed | [Screenshot](assets/20261118-batch-d/batch-d-layer-analysis-1280x720.png) | [Screenshot](assets/20261118-batch-d/batch-d-layer-analysis-1366x768.png) |
| Filename suggestion list with aligned columns and a long wrapped filename | [Screenshot](assets/20261118-batch-d/capture-placement-final-1280x720.png) | [Screenshot](assets/20261118-batch-d/capture-placement-final-1366x768.png) |

## Remaining manual acceptance

- Real-data check of the analysis icons' recognisability with the actual layer cards, and approval of the D9 icon mapping.
- Tooltip placement on a real, narrower sidebar and on touch devices.
- Suggestion list with real filenames at the 390 px layout.

## Git status

No staging, commit, push or deploy. Subagents not used.
