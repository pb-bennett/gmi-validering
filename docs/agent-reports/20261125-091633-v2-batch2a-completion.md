# GMI Validator 2.0 — Batch 2A: shell and analysis correctness (completion)

2026-11-25, Europe/Oslo. `feature/photo-workspace`, HEAD `469acfd` (unchanged). Source: [pre-release audit](20261125-081855-v2-prerelease-functionality-legacy-audit.md), F-01 to F-07 and F-18. [Progress record](20261125-084843-v2-batch2a-progress.md). No subagents.

## Outcome

All eight defects are corrected, with failing-first browser evidence. Automated checks pass. Manual acceptance on real files (audit M-6) is outstanding. Export, hyperlink transfer, source preservation, Gemini and the legacy state and workflows were not changed or removed.

## Defects

| ID | Root cause | Before | After |
|---|---|---|---|
| F-01 | `PipeProfileVisualization` returned for a missing Z before two `useMemo` calls | React error #300; whole application lost | All hooks run before any data-dependent return, with no remounting key. A no-Z line shows «Kan ikke vise profil: ledningen mangler Z-koordinater på ett eller flere punkter.» and «-» for fall, length and ΔZ (previously 0,00). The container is always measured, so a profile opened first on a no-Z line still draws later. Zoom and hover reset per line and layer |
| F-01 (pattern) | `Tooltip3D` returned before `useLayoutEffect` (latent) | Latent | Return moved below the hooks. `rules-of-hooks` errors in `src/`: 0 |
| F-02 | `ZValidationModal` read `state.data` and sent bare ids; `MapCenterHandler` projected with `state.data` | Centred on another layer's object, or far away with mixed CRS | The control is bound to `zValidation.layerId`; objects, results, highlight and CRS come from that layer |
| F-03 | `StandardsInfoModal` re-analysed `state.data` into the global list | Alfa's list replaced by Bravo's | `setInclineRequirementMode` recalculates every layer from its own data. The panel reads results from the owning layer |
| F-04 | Outlier ids without a layer, one global flag, undo only in unreachable code | Same-index objects hidden in all layers; no undo | The existing `layer.outliers.hideOutliers` is used with layer-qualified ids. The layer card shows «1 avviker skjult i kartet» with «Vis avvikere» / «Ignorer avvikere». A collapsed card states it too |
| F-05 | The page showed the upload screen whenever parsing was not `done` and no FOTO layer existed | Map and layers gone; retry started a reset | Loaded layers keep the workspace mounted while a file is read and when it fails. The error is stated in the add dialog (retry in place) and as a dismissible notice with «Prøv igjen». Initial failure is unchanged |
| F-06 | A rule-less `gmiValidatorFocus` was never cleared and outranked the card | Wrong layer opened | The card passes its layer (`openLayerValidator`). Layer-only focus is consumed on arrival, and closing Validator clears focus. Label renamed to «Validator» |
| F-07 | Bare `punkter-<index>` id | Same point number highlighted in every layer | Layer-qualified id and layer |
| F-18 | `window.confirm`, where cancel meant UTM 33 | No way to abort | `CrsChoiceDialog`: UTM 32 or UTM 33, nothing preselected, «Importer» disabled until chosen. «Avbryt» and Escape import nothing and restore the previous state |

**Related leaks found and fixed in the same paths:**

- `viewObjectInMap` rebound an open profile to another layer without its results.
- A stored line index followed into the next analysed layer.
- The load prompts showed whichever layer was opened last.
- `removeLayer` left analysis, prompts, highlight, map target and data inspector pointing at the removed layer.
- Map fit excluded outliers by bare index.
- `resetAll` kept the height control.

## Layer identity

No new identity system. The existing layer id and the existing `punkter-/ledninger-<layerId>-<index>` format are used throughout. The map now matches that exact id; the bare-id fallback is gone for loaded layers. It was the shared cause of F-02, F-04 and F-07, and its only remaining emitters are unreachable legacy code.

`state.data`, `state.file`, terrain, global outliers and global analysis remain, with a legacy fallback where no layer owns the tool (Batch 3B).

Evidence: synthetic layers with the same indices 500 m apart, one in another CRS, and one with an outlier at index 0. The browser tests read the Leaflet map's centre, hidden markers and changed symbols.

## Error boundary

- **Scope:** `AnalysisErrorBoundary` surrounds Profilanalyse, Høydekontroll, the Topplok result list and the two analysis overlays in the map. It does not surround the page.
- **Recovery:** Profilanalyse, Høydekontroll and Topplok show an alert with «Prøv igjen» (recalculates from the owning layer) and a close action. Another layer, line or a closed analysis starts clean. Nothing is reset automatically.
- **Overlays:** a map overlay that cannot be drawn is left out without a message; the error goes to the console.
- **Tested:** a forced failure in Profilanalyse with a FOTO layer loaded, including retry while broken, retry after repair, and closing. The same component contains Høydekontroll, Topplok and the overlays, but those were not forced to fail. The forced-failure test had no staged corrections; Rettinger state lives in the store, outside the boundary.

## Changed files

- **Application (15 modified):** `src/app/page.js`; `src/components/` `FileUpload`, `GlobalFileDrop`, `InclineAnalysisModal`, `LayerPanel`, `MapInner`, `MapView`, `StandardsInfoModal`, `ZValidationModal`, `3D/Tooltip3D`, `gmi-edit/GmiConfirmDialog` (optional `confirmDisabled`), `validation-v2/ValidationV2Workspace`; `src/lib/store.js`; `src/lib/analysis/outliers.js`, `profileAnalysisHover.js`
- **Application (2 new):** `src/components/AnalysisErrorBoundary.js`, `src/components/CrsChoiceDialog.js`
- **Tests (2 new):** `tests/shellAnalysisCorrectnessUi.test.mjs`, `tests/analysisLayerOwnership.test.mjs`
- **Tests (10 modified):** nine for the renamed label only; `statsUiContract` for the workspace-condition text
- **Reports:** this report, the progress record and [screenshots](20261125-091633-v2-batch2a/) at 1280×720 and 1366×768

## Verification

| Check | Result |
|---|---|
| New browser suite on a HEAD-identical build | 11 failed of 11 (F-06 confirmed separately with the old label) |
| Fresh isolated build `%TEMP%/gmi-2a-build`, `npm run build -- --webpack` | Exit 0. `src/` identical to the working tree by `diff -rq` after all runs |
| Full serial Node | First run 2,413 passed, **1 failed** (`statsUiContract` source anchor). After the update: **2,414 passed, 0 failed, 168 skipped** (2,582) |
| Full serial production browser (`*Ui`, `photoDialogLayout`, `*Browser`; port 3207) | **507 passed, 0 failed, 11 skipped** (518; 676 s) |
| New browser file after one added drop case | 11 passed, 0 failed, run twice |
| ESLint, 29 changed JS/MJS files | 5 errors and 5 warnings. The same files had 26 and 8 before. No new findings. Pre-existing: 4 unescaped quotes in `StandardsInfoModal`, 1 `set-state-in-effect` in `InclineAnalysisModal`; the warnings are 4 in `MapInner` and 1 in `FileUpload`, the same counts as before |
| ESLint, all of `src/` | 26 errors, 11 warnings (was 47 and 14) |
| `git diff --check` | Exit 0 |

Skips are private corpus, dev server or optional variables; in the Node run they also include the browser suites, which need a server. They are not passes.

## Contract changes

- Layer-card label «Feltvalidering» → «Validator» (requested).
- `setData` takes an optional `{ layerId }`, `mapCenterTarget` may carry `layerId`, and closing Validator clears `gmiValidatorFocus`.
- The workspace stays mounted while an added file is read. Rettinger form drafts still refuse a window drop.
- Høydekontroll, Profilanalyse and the load prompts show the owning file's name.
- No safety assertion, fixture or hash was changed.

## Remaining risks and observations

1. **Høydekontroll is partly covered by the sidebar** (z-index 2000 against 10000) at both laptop sizes, including the left columns and the new file name. The styles are unchanged from HEAD. It belongs with F-09 in Batch 2B and should be prioritised there.
2. A data table opened in Rettinger stays open, labelled with its file, when Validator then shows another layer. Unchanged behaviour.
3. Changing «Overdekning» recalculates only the legacy terrain state, so a layer's overdekning badges can be stale until terrain is fetched again. Not in the audit; not changed.
4. With an ignored outlier, «Vis i kart» centres on a hidden object. The 3D view and the data table still show it.
5. Datautforsker can fall back to `state.data` after its selected layer is removed (Batch 3B).
6. The storage-quota failure path was changed (it no longer clears an existing workspace) but has no automated test.
7. No 3D browser suite exists; the `Tooltip3D` change is covered by lint and a source-order test only.

**Manual acceptance:** M-6 with two real files for Profil, Høyde, Topplok and Avvik; one real file without CRS; one failed add with real corrections.

## Git and processes

Nothing was staged, committed, pushed, reset, restored, stashed or cleaned. The five status-only test files still have no content diff. Task-owned servers on ports 3206 and 3207 were checked by command line and stopped; servers on 3001 and 3110–3113 were not touched.
