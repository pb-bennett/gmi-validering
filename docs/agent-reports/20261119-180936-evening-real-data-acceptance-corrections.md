# GMI Validator 2.0: evening real-data acceptance corrections (completion)

19 November 2026, 18:09 to about 21:45, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `d9ccb3b`. The tree was clean at the start.

This report covers Stages 1–3 of the evening corrections, following the user's six real-data acceptance workflows (76 photographs, 77 placements). Context: [consolidated verification](20261119-135547-gmi-validator-2-0-consolidated-verification.md) and [implementation report](20261119-100500-gmi-validator-2-0-batches-a-b-c-d-f-implementation.md).

- No subagents were used.
- Nothing was staged, committed, pushed or deployed.

## Acceptance findings recorded (user, Preview, 19 November)

| ID | Observation | Outcome here |
|---|---|---|
| A8.1 | The FOTO header eye works, but it duplicates the Validator map toolbar «Vis bilder» control | One shared control and state in every map; the eye is removed |
| B1.2 | Profile analysis in the main map left its line styling active in FOTO | Main-map analysis presentation is suspended in FOTO, Validator and Rettinger, and restored on return |
| B1.1 | «Foreslå EXIF for viste»: 68 selected, 27 moved, 41 same, 9 unchanged; all 77 placements stayed GMI after saving | Accepted positions now recalculate automatic delivery decisions |
| B1.3 | A positioning-only run showed 3 steps, but «Endringer lagret» showed 4 | The receipt keeps the steps of the saved workflow |
| C1.1–C1.5 | Capture-date usability (see Stage 3) | Implemented |

These baseline results were accepted by the user and preserved by this work: import, fit cap 20, icon colours, Eiendomsgrenser default, FOTO hide/show, Street View drag-and-drop, optional Kilder, wizard cancellation, the explicit receipt, technical completion of 66 filename timestamps and its undo, estimated dates for 9 photographs, the export filename placeholder, the Gemini ZIP (76 photographs, 77 features), and the reload/reset/removal confirmations.

Street View once showed a black panorama, and a refresh fixed it. This is recorded as an observation only; Street View was not changed.

## Stage 1: shared map controls and workspace isolation

### A8.1: universal photo visibility

The visibility model is `src/lib/workspace/rettingerPhotoVisibility.mjs`, extended rather than duplicated. Its state is `{ hidden, visitKey, shown }`:

| Field | Meaning |
|---|---|
| `hidden` | The user's global choice, used in the main map and FOTO. It survives workspace transitions. |
| `visitKey` / `shown` | The existing automatic temporary hiding in Validator and Rettinger. Each visit starts hidden. Choosing «Vis bilder» there applies to that visit only, and leaving restores the global choice. |

- **One control, one owner.** `page.js` owns one state value. The Validator «Vis bilder» toolbar button (`ImagesIcon` on `PhotoIconButton`) was extracted into `PhotoVisibilityToggle` in `MapPaneToolbar.js`. The main map, Validator and Rettinger show it through `MapPaneToolbar`. FOTO, which has no pane toolbar, shows it at the same position through `MapPhotoToggleBar`. The control has `aria-pressed` (pressed means shown), the label «Vis bilder» and the tooltip «Skjul bilder»/«Vis bilder».
- **FOTO header.** The eye is removed. The title-row grid now has two columns, so the close control is back at the right edge (a regression caught by `buttonConsistencyUi`).
- **Per-layer preferences are never written.** Global hiding is a render-time suppression in `MapInner`. Showing photos again restores exactly the layers whose own flag is on.
- **FOTO shows the layer it opened.** `buildPhotoMapItems` gained `include.visible`, so FOTO shows its layer even if the Layer Manager has hidden it, subject only to the shared control. Entering Edit mode no longer forces `setLayerVisibility(true)`. Editing always shows the photos, and the control is unavailable then, with the tooltip «Bildene vises mens du redigerer».
- **Preserved.** Selection, inspector, list scroll position, display mode and map extent are kept, and the floating preview survives through the existing A8 `workspace.hidden` path.
- **Availability.** The control is offered only when a visible layer, or the FOTO layer, has placed photos. The global choice is reset when no photo layer is left (`forgetPhotoVisibilityWithoutPhotos`).

### B1.2: analysis workspace isolation

The Analyse tools were reviewed:

| Tool | Map effect | Decision |
|---|---|---|
| Profilanalyse | Modal, 55 % split map, selected-pipe and faded-line styling, profile points and hover layers, selected-pipe highlight, pipe selection from object navigation | Suspended |
| Høydekontroll / avvik prompts | Floating load-time prompts over the map | Suspended |
| Feltvalidering | Is the Validator workspace itself | Not applicable |
| Topplok | No map overlay | Not applicable |
| Laghighlight (Lagmarkering) | Information colour / multi-layer identification, a map setting | Kept: «do not reset unrelated map settings» |

Implementation:

- `page.js` defines `mainMapAnalysisSuspended = FOTO || Rettinger || Validator` and `analysisOpen = analysisStateOpen && !suspended`. The same suspension applies to the modal, the split height, the presentation provider and the stats button condition.
- `MapInner` receives `analysisSuspended`. It treats analysis as closed for line styling, does not mount `AnalysisPointsLayer`, and ignores the selected-pipe highlight id while suspended. `MapClickHandler` does not clear that highlight.
- `MapView` hides the outlier and Z prompts while suspended.
- `store.viewObjectInMap` no longer changes the analysis pipe while Validator or Rettinger is open.
- **Store state is never cleared.** On return, the analysis, its selected pipe and its styling come back. `AnalysisZoomHandler` stays mounted, so returning does not re-fit the map.

## Stage 2: wizard and delivery corrections

### B1.1: delivery decisions after repositioning

**Existing rules found.**
- `photoMoveProposesTransfer`: a manual move of an untouched GMI default further than `PHOTO_POSITION_TOLERANCE_METRES` (0.01 m, the shared positioning tolerance) from the originating GMI point becomes GML.
- `photoPositionDefaultsToGml`: an unlinked «Ikke valgt» occurrence that adopts a GML or EXIF position becomes a GML inclusion.
- Neither covered GMI-linked occurrences repositioned in the wizard, which is the defect.
- No new tolerance was introduced.

**One rule for every positioning workflow.** It is `photoPositionDeliveryEffect(photo, entry, position, { includeUnlinked })` in `photoDeliveryChoice.mjs`. Each occurrence is judged against its own originating GMI position, so repeated photographs are decided per placement. Only distance counts: a new coordinate source at a compatible position changes nothing. The outcomes are:

| Outcome | When |
|---|---|
| `transfer` | An untouched GMI default moves more than 0.01 m away. Written as `{ kind: 'gmi', intent: 'transfer', automatic: true }`. |
| `restore` | An automatic transfer (not user-chosen) returns within 0.01 m. The decision is removed, back to the GMI default. |
| `include` | The existing unlinked GML/EXIF default. |
| `kept-explicit` | The user chose GMI explicitly. The choice is kept and reported for review. |
| `kept-unavailable` | The occurrence is moved away, but its link cannot be transferred now. Kept and reported for review. |

Explicit GML/Ikke choices and stored decisions never change. The `automatic` flag is exposed on delivery entries and is not part of the export snapshot or its `stateKey`.

**Where it applies.** Wizard positions (`acceptSourcePositionsCore`, also used by import placement), Edit-mode saves (`applyPhotoEdits`, which now also restores automatic transfers) and the legacy direct `applyPhotoPositioning`. All go through `positionDeliveryEffects` and `applyPositionDeliveryEffects`, inside the existing draft and atomic commit, so cancellation and fault rollback cover delivery too.

**Kontroll and receipt.** Kontroll gains a «Levering» section from the new read-only `previewSourceWorkflowDelivery`. It runs the same planning core on draft copies, and a test checks that it writes nothing. «Endringer lagret» lists the same lines from the commit receipt (`gmlDelivery`, `gmiDelivery`, `deliveryKeptExplicit`, `deliveryKeptUnavailable`).

Edit mode shows unsaved restore proposals as GMI, as it already did for transfers, and the save toast names them.

### B1.3: completion step indicator

On save, the wizard stores the keys of the steps shown at that moment (`stepKeys`). «Endringer lagret» renders those steps, so a skipped Koblinger step no longer reappears. The shared browser helper `saveSourceWizardChanges` now checks that the step count matches before and after every save, and every positioning-only run goes through it.

Cancellation, atomic publication and the explicit completion screen are unchanged.

## Stage 3: capture-date usability and export presentation

- **C1.1: what is known, and what technical completion adds.**
  - «Filnavn» is replaced by «Tolket fra filnavn» in `photoSourceLabel`, so all source and provenance labels use the new wording, including the summary count. The step is now «Dato tolket fra filnavn».
  - The «Teknisk utfylling» step explains itself from its eligible rows (`technicalCompletionExplanation`). It gives the number with only a date and the number without seconds, and the origin of each from its own provenance (filename, EXIF, GML or manual), so it never assumes a filename.
  - It then states what completion adds for the chosen target. Gemini: «Datoen er nok for leveransen … uten utfylling får disse bildene ikke opptakstid i GML-filen». Strict targets: required before export.
- **C1.2: results beside undo.**
  - Each of the four batch tools keeps a result line (`role=status`) beside its «Angre», built from the actual write counts (`captureStepResultText`). `completeCaptureTimes` now also returns `kinds` (source of each written value).
  - The lines name interpreted (filename), measured (EXIF, by the camera), GML, estimated and technically completed values, and what was kept.
  - The footer no longer repeats the result; undo messages still go there.
  - Button icon and label are aligned with `inline-flex` and a 6 px gap.
  - Undo state is now `{ token, text }`, and each undo remains independent.
- **C1.3: median without a maximum duration.**
  - `ESTIMATE_MAX_DAYS` is removed. With enough evidence (3 unique photos and 25 %, unchanged), a spread of up to 7 days is prefilled, and any longer spread, including years, offers the lower-middle median, which must be chosen.
  - The SJEKK panel is replaced by a neutral sentence: «De kjente datoene spenner over N dager. Medianen er foreslått, men du må velge den selv.»
  - Basis count, earliest and latest dates, median and affected count are shown as before. Stale-review signatures, protected values and editability are unchanged.
- **C1.4: a known date is sufficient.**
  - For targets whose capture time is not `required` (Gemini VA), an accepted date-only, minute, complete or estimated value counts as done (`precisionState: 'partial'` keeps the real precision).
  - «Gjenstår» counts only photographs without a usable accepted date, and the summary label is «Mangler dato».
  - The «Tid uten sekunder» problem list is gone from the normal workflow. Technical completion is a folded, compact section, opened on demand or when it holds a result.
  - For Skråfoto 2019 (standard) and AsBuilt 5.2 (`required`), incomplete accepted times remain work left, with a target-specific hint, because their export contracts block.
  - The formal schema assessment (`levels.schema.gaps` with `missing` and `insufficientPrecision`), the strict contracts and the Gemini serializer are unchanged. No time components are invented.
- **C1.5: information, not warnings.**
  - `capture-time-filename`, `capture-time-estimated` and `capture-time-technical` moved from `readiness.recommendations` to `readiness.notes`, so they can no longer produce «Kan eksporteres, men noe bør kontrolleres» on their own.
  - The delivery report's `informational` set includes them (Informasjon, not counted as merknader).
  - In Fullfør opplysninger, the Opptakstid notes render under «Informasjon», and Retning is unchanged.
  - The messages still state that the completed parts are not measured and that the markings are not in the GML. Genuine warnings, schema deviations and compatibility notes are unchanged.
  - The photo export review shows these notes in its existing informational disclosure («Slik blir leveransen»). It was not renamed (see Deviations).

## Defect found and fixed during verification

The first focused browser run had 35 failures. **Cause:** the React Compiler had memoised `undo.token`, read inside the undo handler, as a render-time dependency. Any Opptakstid step without an undo crashed the client («Cannot read properties of null (reading 'token')»), and this happens in every layer with placed photos. The Node tests do not render components, so they could not see it.

**Fix:** `undo?.token` / `dateUndo?.token`. It was reproduced with a temporary probe, which was deleted, and confirmed after a rebuild.

## Verification

| Check | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Focused Node: Stage 1 (visibility, isolation, map features) | 15 | 0 | 0 |
| Focused Node: Stage 2 (delivery, source workflow, edit, import, rebinding) | 185 | 0 | 7 |
| Focused Node: Stage 3 (capture completion, estimates, completion, readiness, delivery report) | 100 | 0 | 0 |
| Full serial Node, first run (before the contract updates below) | 2288 | 6 | 155 |
| Focused production browser, first run (React Compiler defect) | 35 | 35 | 3 |
| Focused production browser after the fix (10 suites, then reruns of two) | 67 → all | 3 → 0 | 3 |
| Complete production browser, first run | 476 | 10 | 11 |
| `buttonConsistencyUi` + `rettingerPhotoVisibilityUi` after the grid fix | 12 | 0 | 0 |
| **Complete production browser, final** (497 cases, 616 s) | 486 | 0 | 11 |
| **Full serial Node, final** (2,449 cases, 136 s) | 2294 | 0 | 155 |

**Failures and how they were resolved:**
- **First full Node run.** Six failures, all deliberate contract changes:
  - the «Tolket fra filnavn» label (2 suites);
  - filename advisories now in notes (M4);
  - receipt `stepKeys` (fit wiring contract);
  - the B1.2 `analysisOpen` derivation (stats UI contract).

  These were updated with equivalent assertions.
- **First complete browser run.** Ten failures:
  - `buttonConsistencyUi`: the FOTO close control was no longer at the right edge, a real regression from removing the eye. Fixed in CSS.
  - `rettingerPhotoVisibilityUi`: the first assertion read a pressed colour mid-transition (`rgb(2,115,147)` against `rgb(0,117,149)`), and the following subtests failed as a consequence. Not reproduced in the focused run or the recheck. Recorded as a timing flake; the assertion was left as it is.

**Commands, builds and other checks:**
- **Commands.**
  - Full Node: `node --test --test-concurrency=1 --test-reporter=tap "tests/*.test.mjs"`.
  - Browser: `PHOTO_UI_URL=http://localhost:3141 node --test --test-concurrency=1 --test-reporter=tap "tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"`, against a task-owned `next start -p 3141`.
  - Private-corpus and next-dev opt-ins were unset; the skips are the same gated cases as before.
- **Builds.** Fresh `npm run build` exited 0 three times: initial, after the compiler fix, and after the grid fix. The final browser run used the third build.
- **ESLint.** On every changed JS/MJS file, the only diagnostics are the pre-existing ones: `MapInner.js` (8 errors, 4 warnings) and `MapPaneToolbar.js` (1 `set-state-in-effect` error, also present when linting the HEAD file). There are line shifts only.
- **Other checks.** `git diff --check` is clean. Touched files were normalised to the working copy's CRLF after scripted edits had briefly produced mixed endings.

**Screenshots** (task scratch: `%TEMP%/gmi-evening-20261119/shots`, not committed) were inspected:
- `a8-visibility-{shown,hidden,restored,main-hidden}-{1280x720,1366x768}`: shared control beside zoom, no header eye, main map keeps the global choice;
- `12-technical-result`: results beside Angre;
- `b3-saved-receipt-{1280x720,1366x768}`: GML delivery line;
- `b1-2-validator-without-profile`;
- `m4-*` at both laptop sizes;
- `batch-d-layer-analysis-*`.

## New and changed tests (approved contract changes are marked)

- **New.** `tests/analysisWorkspaceIsolation.test.mjs`: B1.2 wiring, no pipe selection from Validator or Rettinger, and the FOTO `include.visible`.
- **New cases.**
  - `photoDeliveryDefaults`: restore, explicit kept, repeated occurrences, preview equals receipt, cancel, and only distance counts.
  - `photoCaptureCompletion`: C1.4 sufficiency and strict targets; C1.5 status «ready»; C1.1 and C1.2 text from real counts; delivery report Informasjon.
  - `layerAnalysisUi`: profile styling suspended in Validator and restored.
  - `photoVisibilityToggleUi`: global choice across FOTO and the main map, and the Layer Manager flag untouched.
  - `photoPositioningUi`: Kontroll «Levering».
  - B1.3 step parity in the save helper.
- **Approved contract changes.**
  - A8.1: `rettingerPhotoVisibility` (both suites); FOTO eye selectors in `photoWorkspaceUi`, `photoWorkspaceEditUi`, `photoManualPlacementUi`, `photoMarkerProvenanceUi`.
  - B1.1: the GMI-linked EXIF photo now becomes GML in `photoDeliveryDefaults` and `photoPositioningUi`; receipt shape in `photoSourceWorkflowDraft`.
  - C1.3: the spread test in `photoCaptureCompletion`.
  - C1.4: `photoCompletion` groups and «brukbar dato».
  - C1.5: `photoEstimatedDates`, `photoMetadataPresentationM4`.
  - Labels: `photoCaptureSuggestions`, `photoImportWizardUi`, `photoAcceptanceRenderingUi`, `photoCompletionUi`.

## Deviations and decisions to confirm

- **Validator and Rettinger visit choices are temporary.** «Vis bilder» there does not change the global choice, which keeps the existing per-visit contract. The control reflects what is shown in the current map.
- **Lagmarkering is not suspended in workspaces.** It is an information colour and a user map setting, not transient analysis presentation.
- **The photo export review's informational disclosure keeps its label «Slik blir leveransen».** The delivery wizard and report use «Informasjon». Renaming it is a terminology decision left to the user.
- **Advance label.** «Fortsett uten opptakstid» still appears when the formal schema gap is only missing time components. That is accurate for the Gemini GML, which omits incomplete times, but may read harshly; this is a candidate for review.
- **Import placement uses the same B1.1 rule.** A GMI-linked occurrence placed from EXIF away from its object at import is delivered as GML. The import receipt does not list delivery lines.

## Remaining risks and manual acceptance

- [ ] **Real Gemini VA import of `20261119-1759-Test_opptakstid.zip`** (technically completed timestamps). This is not verified here.
- [ ] Re-run the real 76/77 workflow with «Foreslå EXIF for viste». Expect Kontroll «Levering» to show about 27 placements set to GML and the receipt to match, with the 41 same-position placements staying GMI. Then move one back to its GMI object (wizard GMI choice or Edit mode) and check that it returns to GMI. Check that an explicit GMI choice is kept and reported.
- [ ] A positioning-only run shows 3 steps before and after saving.
- [ ] Profilanalyse open, then FOTO, Validator and Rettinger in turn: no profile modal, faded lines or profile points. On return the analysis and its pipe are restored and the map extent is not re-fitted. Only the Validator path is browser-tested; FOTO and Rettinger use the same flag.
- [ ] «Vis bilder» in the main map, FOTO, Validator and Rettinger at 1280×720 and 1366×768. Check the global choice across transitions, the automatic hiding in Validator and Rettinger, and the Edit mode override.
- [ ] Opptakstid on the real layer: «Tolket fra filnavn» labels, the technical explanation and origin counts, results beside each «Angre», the median offered over a long project span, «Gjenstår» counting only missing dates, and the advisories under Informasjon in export and in the TXT report.
- [ ] Observation: the main-map screenshot right after hiding showed a faint fading outline of a closing preview popup. Check visually that no ghost remains.

## File inventory

**Application files modified**

| Area | Files |
|---|---|
| App and map | `src/app/page.js`; `src/components/MapInner.js`, `MapPaneToolbar.js`, `MapView.js` |
| Photo components | `src/components/photos/PhotoCompletionDialog.js`, `PhotoCompletionRows.js`, `PhotoCompletionTimePanel.js`, `PhotoPositioningWizard.js`, `PhotoWorkspaceCollection.js`, `photoCompletion.css`, `photoWorkspace.css` |
| Delivery | `src/lib/delivery/deliveryWizard.mjs` |
| Photo export | `src/lib/photos/export/photoExportDiagnostics.mjs`, `photoExportPlan.mjs`, `photoExportReadiness.mjs` |
| Photo library | `src/lib/photos/photoCompletion.mjs`, `photoDeliveryChoice.mjs`, `photoDeliveryIntent.mjs`, `photoEstimatedDates.mjs`, `photoMapFeatures.mjs`, `photoPresentation.mjs`, `photoSession.mjs` |
| Store and workspace | `src/lib/store.js`; `src/lib/workspace/rettingerPhotoVisibility.mjs` |

**Tests modified:** `tests/helpers/photoSourceWorkflow.mjs`, `layerAnalysisUi`, `photoAcceptanceRenderingUi`, `photoCaptureCompletion`, `photoCaptureSuggestions`, `photoCompletion`, `photoCompletionUi`, `photoDeliveryDefaults`, `photoEstimatedDates`, `photoImportWizardUi`, `photoManualPlacementUi`, `photoMapFeatures`, `photoMarkerProvenanceUi`, `photoMetadataPresentationM4`, `photoPositioningUi`, `photoSourceWorkflowDraft`, `photoVisibilityToggleUi`, `photoWorkspaceEditUi`, `photoWorkspaceUi`, `rettingerPhotoVisibility`, `rettingerPhotoVisibilityUi`, `statsUiContract` (all `.test.mjs`).

**New:** `tests/analysisWorkspaceIsolation.test.mjs` and this report.

## Git status and processes

- **Git.** HEAD and branch are unchanged, and nothing was staged, committed, pushed or deployed. The pre-existing stash (`stash@{0}`, another branch) was not touched.
- **Processes.** Only task-owned `next start -p 3141` servers and test Chrome instances were started and stopped.
- **Logs.** In `%TEMP%/gmi-evening-20261119/`: `node-full*.log`, `browser-*.log`, `build*.log`.
