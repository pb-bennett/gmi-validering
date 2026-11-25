# GMI Validator 2.0 — Batch 2B: accessibility and interaction cleanup (completion)

2026-11-25, Europe/Oslo. `feature/photo-workspace`, HEAD `fd2c015` (unchanged). Source: [pre-release audit](20261125-081855-v2-prerelease-functionality-legacy-audit.md) F-08, F-09, F-12, and [Batch 2A](20261125-091633-v2-batch2a-completion.md) risk 1 (Høydekontroll). No subagents.

## Outcome

The confirmed defects are corrected. All were reproduced in a browser on a build of the starting HEAD before any edit. Automated checks pass. **Manual acceptance is outstanding.** Survey parsing, source-preserving export, the store and Gemini WFS transport were not changed.

## Findings

| ID | Reproduced on HEAD | Root cause | Now |
|---|---|---|---|
| Høydekontroll (2A risk 1) | Left half under the sidebar (z 2000 against 10000). A dimmed, centred panel also covered the object «Vis i kart» had centred. No role, Escape or focus handling | Full-page overlay in the page's stacking context | Docked at the right inside the map pane, on less than half its width, no backdrop. Not modal |
| F-08 upload | Tab never reached the file picker | Hidden input inside a non-focusable label | A real «Velg fil» button with focus ring and format description. Initial import error is an alert |
| F-08 layer card | Card could not be opened by keyboard | Clickable `div` | Name area is a button with `aria-expanded`/`aria-controls`; the pointer target is unchanged |
| F-09 | Legg til fil, Fjern lag, Datautforsker, WMS and Del app: no dialog role, Escape did nothing, Tab went into the workspace. Krav til selvfall has the same cause (source). Statistikk had Escape but no containment | `div` overlays | Native modal `<dialog>` (the pattern already used by FOTO, Rettinger and Gemini). Fjern lag uses the existing `GmiConfirmDialog` |
| F-09 layout | Krav til selvfall ran from −58 to 778 px at 720 px height; Del app cut off «Kopier lenke» | No height limit | Bounded height, own scroll. WMS and Legg til fil are bounded too |
| F-12 | «Inspiser data» covered «Åpne Gemini WFS» at both sizes | Fixed offset from the pane centre | It is in the same row as its neighbours |
| Data-table tooltip | The tooltip existed but was drawn at z 1400 under the sidebar. Same for «Nullstill filtre» and «Fjern lag» | Only buttons inside `.layer-analysis-actions` got the raised layer | Every layer-card icon does. «Åpne datatabell» on hover and focus; click behaviour unchanged |

**Found in the same controls and fixed:** the layer's visibility checkbox (mouse or Space) also toggled the card. The load prompt «Fant objekter uten høyde» would have been half hidden by the docked panel, so it waits while the control is open.

All seven Analyse controls were checked: they have accessible names, and their tooltips show above the sidebar.

## Decisions

- **Høydekontroll is not modal.** The task is to look at the map; a modal would block it. It was already partly non-modal, because the sidebar stayed in front. It stays open after «Vis i kart», and the list keeps focus. It is hidden in FOTO and returns with the main map.
- **One hook, `useModalDialog`** (about 50 lines), supplies initial focus, Escape and focus restoration for the native dialog. It is not a framework: existing FOTO, Rettinger, export and Gemini dialogs are untouched.
- **A dismissed file chooser** sends a bubbling `cancel`; the hook ignores it so «Legg til fil» stays open.
- **The hook handles Escape itself.** Chrome can close stacked dialogs together when they were opened without user activation, which closed «Legg til fil» along with the CRS question.
- **Window drop feedback** joins the open modal, which would otherwise cover it. The host is read in the drag events: with `reactCompiler`, a DOM query during render is cached.

## Keyboard, focus and layout

- **Modals:** accessible name; focus moves in («Velg fil» in Legg til fil, «Avbryt» in Fjern lag, the URL field in WMS); Tab does not reach the workspace (it can reach the browser's own controls, as with any native modal); the background is inert; Escape closes; focus returns to the opener.
- **Opener gone:** focus goes to «Legg til fil»/«Åpne fil» after removing a layer or after «Prøv igjen», and to the map after Datautforsker or the load prompt.
- **Statistikk:** the first Escape closes the municipality selector only.
- **Høydekontroll:** focus moves in on opening. Escape closes it only while focus is inside.
- **Failed import:** layers and map kept, retry in the dialog, cancel with Escape, then «Prøv igjen» or «Lukk feilmelding» in the workspace.

## Changed files

- **Application (14 modified):** `src/app/page.js`, `src/app/globals.css`; `src/components/` `DataDisplayModal`, `FileUpload`, `GlobalFileDrop`, `LayerManager`, `LayerPanel`, `MapView`, `ShareQrModal`, `StandardsInfoModal`, `StatsModal`, `WmsLayerModal`, `ZValidationModal`, `photos/photoIconTooltip`
- **Application (1 new):** `src/components/useModalDialog.js`
- **Tests:** new `tests/shellAccessibilityUi.test.mjs` (8). Selector-only changes in `gmiEditDraftGuardUi` (heading is now in the dialog) and `geminiWorkflowBrowser` (close name)
- **Reports:** this report and 23 [screenshots](20261125-152437-v2-batch2b/)

**Contract changes:** WMS and Del app close controls are named «Lukk Gemini WMS» and «Lukk Del app» (were «Lukk»). No assertion, fixture or hash was relaxed. A source guard against native `title` tooltips matched the Fjern lag dialog's heading prop; the heading is passed through a constant and the guard is unchanged.

## Verification

Level: **Expanded, escalated to the full browser suite**, because the expanded run found two regressions in this batch's own code (Escape stack, drop overlay). Both were fixed first. The full Node suite was not run: no parsing, store, validation or export code changed.

| Check | Result |
|---|---|
| New suite on a HEAD build | 8 failed of 8. Four of these stop at the missing dialog element; the behaviour itself was shown by a separate probe |
| New suite on the final build | 8 passed |
| Fresh isolated build, `npm run build -- --webpack` | Exit 0; `src/` identical to the working tree after all runs |
| Expanded browser run, 27 files (before the two fixes) | 145 passed, 3 failed (2 causes), 2 skipped |
| Full serial production browser suite (`*Ui`, `photoDialogLayout*`, `*Browser`) on the final build | **531 passed, 2 failed, 11 skipped** (544; 711 s). Both failures are one case and its parent, in `geminiWorkflowBrowser`, looking up the renamed close button |
| `geminiWorkflowBrowser` and `geminiWorkflowUi` after the selector update | 27 passed. The full suite was not repeated for this test-only change |
| Node contract tests that read the changed files, 32 files | First run 330 passed, 1 failed (the `title` guard). Final: **331 passed, 0 failed** |
| ESLint, changed files | 10 errors and 2 warnings, the same count per file as HEAD. None in new files |
| `git diff --check` | Exit 0 |

**Skipped, not passed:** 11 cases needing private corpus, a dev server or optional variables. **Omitted:** the rest of the Node suite, real files, hosted services and screen readers.

## Remaining risks

1. With Profilanalyse open at 1280×720 the map pane is short, so Høydekontroll shows little more than its summary and must be scrolled.
2. While open, Høydekontroll covers the map's layer control and part of the legend.
3. A forced rendering failure in Høydekontroll is not tested in its new placement.
4. `Viewer3D.js:186` uses the same fixed offset for «Inspiser data». It was not reproduced as a collision and there is no 3D browser suite; unchanged.
5. In Testmodus only, the test banner covers part of the map/3D switch at 1280. Not in the audit; unchanged.
6. After the last layer is removed the workspace stays with «Åpne fil». Existing behaviour.
7. Remaining native `title` tooltips and icon styling belong to the styling pass (U-04, U-05).

## Manual acceptance

- Keyboard-only pass: upload, Legg til fil, failed file and retry, a file without CRS, remove a layer. Include dismissing the real file chooser and dropping a file on the dialog.
- Høydekontroll with two real files at both laptop sizes, with and without the data table and Profilanalyse.
- «Åpne datatabell» tooltip with a real mouse.
- One screen-reader check of Legg til fil, Fjern lag and Høydekontroll.

## Git and processes

Nothing was staged, committed, pushed, reset, restored, stashed or cleaned. The five status-only test files still have no content diff; the untracked audit and WFS investigation reports were not touched. `AGENTS.md` is unchanged. Task-owned servers on ports 3210 and 3211 were checked by command line and stopped; 3001 and 3110–3113 were not touched. A temporary build copy briefly contained `.env.local`; that copy was deleted before the build and was not used. Builds remain in `%TEMP%/gmi-2b-base` and `%TEMP%/gmi-2b-build` (`node_modules` there is a junction to the repository).
