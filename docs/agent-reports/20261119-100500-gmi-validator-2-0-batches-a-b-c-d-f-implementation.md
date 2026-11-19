# GMI Validator 2.0: Batches A, B, C, D and F (implementation)

Date: 2026-11-19, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, base HEAD `0472c72` (clean tree apart from the untracked planning report).

Specification: `20261119-083618-real-data-acceptance-batches-a-b-planning.md` (Revision 3 now records the final approved decisions), plus the assignment's final requirements (A8 and Batch F are new).

- No subagents were used.
- Nothing was staged, committed, pushed or deployed.
- Task-owned servers were stopped (see "Processes").

## Status and test results (read first)

**Complete.** All five stages are implemented, and the final gates pass on the combined tree.

| Check | Result |
|---|---|
| Full serial Node suite (`node --test --test-concurrency=1 "tests/*.test.mjs"`) | 2,437 tests: **2,283 passed, 0 failed**, 154 skipped. The skips are the browser suites without `PHOTO_UI_URL` and the existing private-corpus/dev gates. |
| Fresh production build (`npm run build`) | Exit 0 |
| Complete production browser regression (`PHOTO_UI_URL=… node --test --test-concurrency=1 --test-reporter=tap "tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"`) | 497 tests: **486 passed, 0 failed**, 11 skipped, 696 s. The skips are the same 11 as the previous baseline: nine private-corpus cases, the nested real-JPEG EXIF case and the next-dev StrictMode case. |
| ESLint on every changed JS/MJS file | Clean, except `src/components/MapInner.js`: 8 errors and 4 warnings, identical to HEAD (checked by linting the HEAD file). |
| `git diff --check` | Clean |

Against the stated baseline (2,250 Node passes, 481 browser passes, 0 failures), the counts grew with the new suites and remain at zero failures.

**Changes from a second session (observed, not authored here).** After this report was first written (10:14), files in the working tree were changed between 13:12 and 13:29 by another session that is no longer running. It left no report. The changes continue this assignment and were kept unchanged. They are included in the results above and are described here from code inspection:
- **Import (closes the import-atomicity risk below).** `completeImport` now builds layer creation, GMI/GML attachment, capture times and placement in `inDraft` and commits with `commitDraftMaps`, so a failed placement leaves nothing. New errors: `placement-changed`, which the review checks against the reviewed placement signature, and `pending-exif`. `PhotoImportWizard` shows a Norwegian message per error, each stating that nothing was saved.
- **Street View.** Pick-mode clicks are captured at document level, so FOTO placement capture cannot take them first. `PhotoEditLayer` treats `.gmi-street-view` as an overlay control.
- **Estimate.** `estimatedDateReviewSignature` adds a stale-review guard for the estimate. The completion signature compares the full value and provenance.
- **Tests.** `photoWorkspaceStacksUi` zooms the main map out when a stack placement has been panned out of view by popup paging, then asserts the real hit target. This fixes the line-417 failure noted in the previous version of this report: the marker was off-screen. A `reloadAcceptedSession` helper was added for confirmed reloads. Further edits were made to `gmiEditWorkspace`, `photoDirectionUi`, `photoImportComplete`, `photoManualPlacementUi`, `photoSourceWorkflowDraft`, `photoSpatialUi`, `photoWorkspaceEditUi`, `photoWorkspaceUi`, `photoEstimatedDates`, `streetView` and `streetViewUi`.

**Fixes made during browser verification in this session:**
- Street View pick mode consumes clicks on markers.
- Escape is captured in Street View modes.
- The Street View panel sits above «Lagmarkering».
- The hub shows the «teknisk utfylt» note on accepted rows.
- Opptakstid steps are numbered consecutively, and a zero-width date range is shown as one date.

**Screenshots inspected** (1280×720 and 1366×768 where the test captures both): A8 shown/hidden, the B3 saved receipt, the D reset and FOTO-removal dialogs, the F pick panel and the C steps. They are in the task scratch folders (`%TEMP%/shots-a|b|c|final`) and are not committed.

**Processes.** The task-owned `next start -p 3141` server was stopped. Test Chrome instances are launched and closed by the harness. No other process was touched.

## Stage A: Batch A

| Item | Outcome |
|---|---|
| A1 | `photoLayerMapFit` general cap is `maxZoom: 20`; the `< 10 m → zoom 18` branch, padding and fit sequence are unchanged. |
| A2 | One grey for both layer-card action rows: `.photo-icon-button.layer-card-icon-button` is `--gmi-text-muted`, and the redundant `.layer-analysis-actions` rule is removed. Zoom, Fjern lag, Nullstill filtre and Åpne datatabell use `PhotoIconButton` (aria-label and tooltip, no native `title`; sizes 14/16 px, footprint 22×22). The FOTO layer card's remove control moves the same way. |
| A2 / DA2a | «Fjern lag» (and «Fjern fotokartlag») keep a destructive hover through a scoped modifier using `--gmi-validation-error-bg/-text`. At rest they match their neighbours. The raw `red-*` hover is gone. |
| A3 | The empty descriptive filename shows the placeholder «beskrivende navn». A hidden sizer mirrors it so the field keeps its width, and the placeholder is `--gmi-text-muted` (about 6.8:1 on `--gmi-cyan-soft`). With a timestamp and no description, a non-blocking advisory appears (compact warning text, `aria-describedby`, no `aria-invalid`). A blocking `filename-empty` keeps its error and hides the advisory. One editor serves all three hosts. |
| A4 | Kilder: no external source is pre-chosen (`useState(null)`, so no file input until a kind is chosen). The heading is «Legg til en kilde (valgfritt)», with «Du kan gå videre med kildene som allerede finnes.» when sources or EXIF positions exist. Carried into B-3. |
| A5 | «Vis forslag (n)» under the GML capture-time options (both hosts). Each row has a thumbnail, filename, Gjeldende, GML and a tag (Fullstendig / Ufullstendig / Kun dato). Neutral styling outside the SJEKK panel; presentation only. |
| A6 | `PHOTO_EXPORT_IMPORT_EVIDENCE['gemini-legacy2019'].missingCaptureTime = 'imported'` and `referenceOnly: []`, with the evidence in a code comment. An `'imported'` state is no longer a deviation, so the import level reads «Profilen er importert tidligere, men denne pakken er ikke testet.» The schema warning ends with «Gemini VA har importert bilder uten opptakstid i et testet oppsett (november 2026).» The schema gap, missing direction (`untested` → still a deviation), renamed GML and the Legacy/AsBuilt rules are unchanged. |
| A6 / DA6a | Earlier GeoFoto acceptance **is** documented (`20261102-0928`, `20261102-1036`: an unmodified app package reached GeoFoto), so the profile copy «Importert i Gemini VA/GeoFoto i testet oppsett» stands. The new omitted-time evidence names Gemini VA only. |
| A7 / DA7 | Eiendomsgrenser defaults to off in every default site. The checkbox reads `=== true`. `partialize` no longer persists it, and rehydration forces it off, including a value stored by an older version. One shared store value keeps the choice across workspaces within the session. The Gemini WMS and basemap defaults are unchanged. |
| A8 | The existing FOTO header eye control (`EyeIcon`/`EyeSlashIcon`, `.photo-workspace-visibility`) is the toggle. It already hid markers, miniatures and arrows, and left selection, inspector, list, extent and display mode alone. The gap was the floating preview: it closed when its marker disappeared and never came back. Now the preview survives a hide (`workspace.hidden`) and returns on show. Leaflet auto-pan is disabled for a restored preview, so toggling never pans. |

**Deviation (A8).** No second visibility control was added. The existing eye control in the FOTO header already is «the same eye/crossed-eye control used elsewhere». A parallel control would duplicate the layer visibility state. Its tooltip copy («Skjul fotolag»/«Vis fotolag») is unchanged.

**Gate A** passed: unit tests; a production build; browser runs of A1 (fit), A3 (delivery wizard), A8 (new `photoVisibilityToggleUi`), layer analysis and the A-affected suites (42 passed, 0 failed, 3 private-corpus skips). Screenshots were inspected.

## Stage B: Batch B (one-transaction positioning wizard)

### Architecture

- **One implementation for draft and commit.** The accepted maps in `photoSession` (`layers`, `records`, `assets`, `deliveryDecisions`) are swappable bindings. `inDraft(fn, seed)` runs the **existing** commit cores against copy-on-write `DraftMap`s, which record every touched key. `readDraft` reads a draft state through the ordinary readers.
- **Cores (B-1).** These are shared by the draft and the remaining direct APIs, with no publication and no review bookkeeping inside:
  - `attachGmlSourceCore`: all checks before the first write, then the capture-plan signature re-check;
  - `gmiAssociationsCore`: new, recheck or verified rebinding;
  - `removeGmiSourceCore`;
  - `acceptSourcePositionsCore`.

  `commitLayerSource`, `applyGmiAssociations` and `removeGmiSource` are now thin wrappers over them.
- **Stable identities.** Candidates (GML per source entry; GMI occurrence plus candidate per association ledger) are cached, so a replayed draft offers the very objects it reviewed. The existing identity-based staleness checks therefore keep their meaning. Each GMI op has its own stable occurrence ids.
- **Draft (B-2).** Each workflow ticket owns a draft of ordered, declarative ops: `gml`, `gmi` (new, recheck or rebinding) and `remove-gmi`.
  - `stageSourceWorkflowSource` validates by replaying the whole draft with the new op on copies. It refuses duplicates as `source-staged` and never writes accepted data.
  - `stageSourceWorkflowRemoval`: a staged new source is simply taken out (a staged GMI that is then removed is a no-op).
  - `unstageSourceWorkflowOp` is «Angre».
  - `draftView(ticket)` is memoised by the ops version and by the live identities of the layer, its occurrences, assets and delivery state.
  - Positions (`reviewSourceWorkflowPositions`) and the GML capture plan (`planLayerSourceCaptureTimes`) are derived from the draft view, so staged sources and new occurrences are offered and staged removals are not.
- **Atomic commit (B2a).** `commitSourceWorkflow(ticket, { plan, requests, version })` works in four phases:
  1. It plans the complete next state, positions included, on copies seeded from the view.
  2. It derives the write set: every touched key, with the value it held when the view was made.
  3. It refuses with `review-changed` if any key changed since, and writes nothing.
  4. It swaps the precomputed values with `Map.set/delete` only. On any throw it restores every key, does not publish and returns `commit-failed` with «Endringene kunne ikke lagres. Ingenting er endret.»

  It publishes **once**, and the receipt is built from the commit (added/rechecked/rebound/removed sources, occurrences, capture times, directions, positions, GML delivery). A test-only `createPhotoSession({ commitFault })` seam throws after the n-th write.
- **Import (B1 audit).** `applySourceWorkflowPositions` (the import wizard's placement step) is the same atomic commit with no ops. `completeImport` (layer creation followed by placement) is wrapped in `withOnePublication`, so listeners see one publication.
- **Removed intermediate path (B-4).** `saveSourceWorkflowSource` is gone, along with the S3 «Fullfør» shortcut and the two-stage card.

### Wizard UI (B-3)

| Step | Behaviour |
|---|---|
| Kilder | Saved sources carry staged tags («Kontrolleres på nytt», «Kobles til lag «…»», «Fjernes») with «Angre». Staged new sources are listed with «Ny». «Fjern GMI-kilde» stages the removal («… fjernes når du lagrer endringene»). Includes A4. |
| Koblinger | The primary is «Ta med kilden» / «Ta med kilde og koblinger» (ordinary primary, no save icon). The stage text reads «Kilden tas med i endringene. Ingenting lagres før du velger Lagre endringer.» Includes A5. |
| Plassering | `Neste` is enabled with zero selections once a change is staged (metadata-only and connection-only). |
| Kontroll | Sections Kilder, Koblinger, Opptakstid, Retning and Posisjoner; empty ones are omitted, and «Ingen posisjoner endres.» appears when nothing is selected. One primary, «Lagre endringer» (CheckIcon; `aria-busy` and «Lagrer …» with CircleNotch; disabled with nothing to save). |
| Endringer lagret | A non-navigable completion state. The heading takes focus, every step shows done (`PhotoWizardSteps done`), and the receipt lists non-zero lines only. The footer has a single primary «Lukk»; the header reads «Lukk kildekontroll»; Escape closes. No toast. `onApplied(result)` drives the initial-placement fit at close. |
| Cancel/close | With staged ops or edited positions, a confirm appears: «Forkaste endringene?», «Kilder, koblinger, opptakstider og posisjonsvalg i denne kontrollen lagres ikke. Fotolaget beholdes som før.», buttons «Forkast endringer» / «Fortsett». Before the commit, the header is «Avbryt kildekontroll». |

**B6.** «Fullfør opplysninger» states «Endringer lagres i fotolaget med en gang.» once under its heading.

**B5.** The AGENTS.md rule was added under «Source and data safety». `tests/wizardTransactionContract.test.mjs` classifies the surfaces:

| Class | Surfaces |
|---|---|
| Wizards | Positioning, Legg til bilder, Masseendringer, export/delivery (downloads only) |
| Task hub | Fullfør opplysninger |
| Single-step dialogs | Photo metadata, Rettinger object editor |

### Gates

| Gate | Result |
|---|---|
| B-1 | All 945 non-UI photo tests pass through the shared cores. |
| B-2 | `tests/photoSourceWorkflowDraft.test.mjs` passes 9/9: cancel after each step is identity-equal; the single commit equals the former two-phase result with one publication; a fault-injection sweep over every write index; a stale commit, a draft version change, the M3 capture guard and a pending review all refuse; same GML staged twice; GMI staged then removed; a removed source's positions are not offered; metadata-only and connection-only commits; S2 stale binding at save. |
| B-3 | Positioning, navigation, GML capture and association browser suites pass at 1280×720 and 1366×768 (results below). |
| B-4 | Contract tests pass (S2/S3/M3 updated with equivalent atomic coverage), followed by the final full regression below. |

### Test migration (approved contract change)

- The Node suites that saved a source at an intermediate step now use `tests/helpers/photoSourceDraft.mjs` (`saveStagedSource` = stage + `commitSourceWorkflow`), so that save is its own connection-only or metadata-only transaction. The helper also checks that the receipt agrees with the stage.
- The browser helpers gain `includePhotoSource` and `saveSourceWizardChanges`. `savePhotoSource` = include + save with every current position kept, leaving the wizard on its receipt. `closePhotoSources` discards through «Forkast endringer».

## Stage C: Batch C (M5 capture-date completion)

- **C-1 planners**: `src/lib/photos/photoCaptureCompletion.mjs` (pure).
  - `planSourceCaptureAdoption`: usable, unaccepted EXIF/GML values. Conflicts are never batch-adopted. The most precise agreeing value wins (DC3), with GML first at equal precision.
  - `planLayerFilenameCaptureSuggestions`: M1 rules for layer photos without usable EXIF/GML times.
  - `technicalCaptureCompletion` / `planTechnicalCaptureCompletion`: noon for a date, `:00` for a minute. Known components and offset are kept, and provenance is kept and gains `technical: { kind, from }`. Estimated dates are excluded (DC1).
  - `planCaptureCompletion`, `selectedCaptureCompletionRows` and `captureCompletionSignature`.
- **Median estimate**: `photoEstimatedDateModel` (the midpoint is replaced). The basis is unique assets with an accepted, non-estimated date of any precision, without conflicting automatic values. The targets have no accepted value, no removal, no EXIF read pending and no date evidence in EXIF, GML or the filename. Neither includes photos with usable but unaccepted source dates. DC2 thresholds: at least 3 dates and at least 25 % of unique photos; a spread up to 7 days is prefilled; 8–31 days only when chosen («Bruk foreslått dato», SJEKK); more than 31 days gives no proposal. With an even count, the lower middle date.
- **C-2 session**: `completeCaptureTimes(layerId, { step, groups, expected })`. It re-plans from the live layer, checks the reviewed signature, prepares every value first, writes in one pass and publishes once. Accepted and removed values are never written, and it returns an undo token. `fillMissingPhotoValues({ estimated })` targets only the estimate targets.

  **Defect fixed (C-1 verification).** The estimated fill used to overwrite explicitly cleared values.
- **C-3 UI**: the Opptakstid task shows ordered, numbered steps (hidden when empty):
  1. Opptakstid fra kildene;
  2. Dato fra filnavn;
  3. Teknisk utfylling (valgfritt);
  4. Anslått opptaksdato (valgfritt).

  Complete, minute and date-only values have separate checkboxes, all unchecked. Each step has «Vis forslag (n)», one button and «Angre». The dialog keeps one undo per step.
- **Presentation**: «07.10.2026 12:00:00 · Klokkeslett teknisk utfylt» / «… · Sekunder teknisk utfylt»; the source label reads «<original> · teknisk utfylt». Readiness advises «N bilder har teknisk utfylt tid. Den er ikke målt.» (`capture-time-technical`), and the export plan warning carries it to the delivery report.

**Gate C** passed: C-1/C-2 tests in `photoCaptureCompletion.test.mjs` (9/9) and `photoEstimatedDates.test.mjs` (14/14, an approved contract change from midpoint to median), plus the hub browser journey (results below).

## Stage D: session-loss protection

- `src/lib/sessionLoss.mjs`:
  - `sessionLossState`: survey layers, FOTO layers and photos, import-draft photos, staged wizard ops, unsaved Edit-mode photo changes, and Rettinger layers not downloaded. DD1: loaded layers alone count.
  - `createSessionLossGuard`: one `beforeunload` listener, attached only while meaningful.
- `page.js` feeds the state from the existing owners. Reset («Nullstill og åpne ny fil») behaves as follows:
  - it resets at once for an empty session;
  - otherwise it shows one `GmiConfirmDialog` («Nullstille økten?», «Dette forsvinner fra økten: …», «Avbryt»/«Nullstill»);
  - staged Rettinger keep their stronger path in the same dialog («Forkast rettinger og nullstill»).
- The Rettinger listeners and draft guards are unchanged.
- DD2: removing a FOTO layer with photographs uses `GmiConfirmDialog` («Fjerne fotolaget?», «Fjern»/«Avbryt»); an empty layer is removed at once.
- The legacy `DataDisplay.js` is not imported anywhere (unreachable), so it is left for Batch E.

**Gate D** passed: `sessionLoss.test.mjs` (4/4) and `sessionLossUi.test.mjs`. The latter checks the native `beforeunload` dialog through CDP: none for an empty session, one with a loaded file, cancel keeps the session, reset lists and cancels, FOTO removal confirms and cancels, and after a reset there is no warning.

**Contract changes (DD1).** UI assertions that expected «no unload prompt» while files were loaded now expect the session guard. Where possible they assert the Rettinger state through the visible download state instead. Tests that reset with data loaded confirm through `tests/helpers/sessionReset.mjs`.

## Stage F: Google Street View

- `src/lib/map/streetView.mjs`:
  - `streetViewUrl` builds `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=LAT,LON` with 7 decimals and wrapped longitude, and refuses invalid positions.
  - `openStreetView` opens `window.open(url, '_blank')` and then sets `opener = null`. It returns false when the tab is blocked.
- `src/components/StreetViewControl.js` sits in the shared `MapInner` beside the measure tool, so it is present in every map-based workspace. It uses `PersonSimpleWalkIcon` on `PhotoIconButton` with the `gmi-map-toolbar-icon-button` styling.
  - **Drag**: pointer capture on the button; a ghost follows the pointer; a drop on the map opens at `containerPointToLatLng`. A drop outside is cancelled with «Slipp symbolet på kartet for å åpne Street View der.» Escape cancels.
  - **Click/keyboard alternative**: press to enter pick mode (`aria-pressed`, crosshair). The next plain map click opens there and is consumed in the capture phase, so no selection, popup, measure point or photo placement happens. «Bruk kartets midtpunkt» works without a pointer (keyboard focus moves to it). Escape, captured first, cancels.
  - **Blocked tab**: «Nettleseren blokkerte den nye fanen.» with an explicit link «Åpne Street View» (`rel="noopener noreferrer"`).
- No embedded map, no API key and no coverage service. Nothing is transmitted before the explicit action.

**Gate F** passed: `streetView.test.mjs` (4/4) and `streetViewUi.test.mjs` at both laptop sizes, with `window.open` replaced by a recorder (Google is never contacted). The browser test covers click pick on a feature (no popup, no pan), keyboard midpoint, Escape, drag, invalid drop, blocked tab, and FOTO workspace pick on a photo marker (no selection or preview).

## Remaining risks and open items

- **Batch E candidates (not removed).** These are now unreachable from the UI:
  - the direct session APIs `applyLayerSource`, `applyGmiAssociations`, `removeGmiSource` and `applyPhotoPositioning` (used only by tests as setup);
  - `DataDisplay.js`.
- **Import placement atomicity.** Resolved by the second session (see above): import is now a single draft commit.
- **Technically completed times are new in Gemini output.** The 19 November import covered omission only, so a re-import of a package with technically completed times is advised.
- **Strict staleness.** The draft is re-derived when the layer's live data changes (for example a late EXIF read). A plan reviewed against a draft with staged GML must then be refreshed («Oppdater kontrollen»). This fails closed by design.
- **Copy-on-write cost.** Draft views copy the accepted maps per re-derivation, which is O(photos). It was not measured on very large layers.

## Manual acceptance checklist

- [ ] A1: a multi-photo extent of a few tens of metres fits at ≤ z20; a single photo still opens at z18 (1280×720, 1366×768).
- [ ] A2: every layer-card icon in both rows is the same muted grey; Fjern lag hovers red; tooltips appear on hover delay and keyboard focus.
- [ ] A3: an empty descriptive filename shows «beskrivende navn» and the advisory; export works with a timestamp-only name.
- [ ] A4/A5: no pre-checked source in Kilder; «Vis forslag» lists the compatible GML times with correct tags.
- [ ] A6: Gemini with missing times shows the new wording; missing direction still shows «Ikke verifisert».
- [ ] A7: a fresh load has Eiendomsgrenser off; toggling holds across Validator → Rettinger → FOTO; a reload turns it off.
- [ ] A8: hiding photos keeps the selection, inspector, list, extent and preview; showing restores them without moving the map.
- [ ] B: on a real layer, cancel at each step changes nothing; metadata-only and connection-only saves work; the receipt matches the layer; Escape and «Fortsett» behave as expected.
- [ ] C: on a real mixed layer (EXIF, GML, filename, empty), check each step, its undo, the estimate thresholds and the labels; then a **Gemini VA re-import of a package with technically completed times**.
- [ ] D: reload and tab close warn only with loaded data; reset lists the session and cancels cleanly; FOTO layer removal confirms.
- [ ] F: drag and click Street View in the main map, Validator, Rettinger and FOTO; check that the opened tab shows the expected place; check the blocked-popup link in a browser that blocks pop-ups.
- [ ] Deferred from earlier: legacy Masseendringer footer.

## Files

Modified: AGENTS.md; src/app/{globals.css,page.js}; src/components/{LayerPanel.js,MapInner.js}; src/components/delivery/deliveryWizard.css; src/components/photos/{photoCollectionPanel.css,photoCompletion.css,PhotoCompletionDialog.js,PhotoCompletionTimePanel.js,PhotoExportDeliveryStep.js,PhotoGmlCaptureTimeChoices.js,PhotoLayerCard.js,PhotoMarkersLayer.js,photoPositioningWizard.css,PhotoPositioningWizard.js,PhotoWizardSteps.js}; src/lib/store.js; src/lib/photos/{photoCompletion,photoEstimatedDates,photoMapFeatures,photoPresentation,photoSession}.mjs; src/lib/photos/export/{photoExportDiagnostics,photoExportPlan,photoExportReadiness,photoExportRules}.mjs; docs/agent-reports/20261119-083618-real-data-acceptance-batches-a-b-planning.md (Revision 3).

New: src/components/StreetViewControl.js; src/lib/map/streetView.mjs; src/lib/photos/photoCaptureCompletion.mjs; src/lib/sessionLoss.mjs; tests/{photoCaptureCompletion,photoSourceWorkflowDraft,photoVisibilityToggleUi,sessionLoss,sessionLossUi,streetView,streetViewUi,wizardTransactionContract}.test.mjs; tests/helpers/{photoSourceDraft,sessionReset}.mjs.

Tests updated (approved contract changes A1, A2, A6, A7, B-4, DC2, DD1): deliveryPlan, deliveryWizardUi, gmiEditBatchUi, gmiEditDraftGuardUi, gmiEditWorkspaceUi, gmiPhotoAssociationsUi, gmiPhotoPlacementCorpus, gmiPhotoPlacements, gmiPhotoPlacementsUi, layerHighlightPanel, mapBackgroundControl, photoAcceptanceRenderingUi, photoCompletion, photoCompletionUi, photoDeliveryDefaults, photoDeliveryIntent, photoDeliveryPlanning, photoEstimatedDates, photoExportFlowUi, photoExportReadiness, photoExportReturnUi, photoExportWizard, photoExportWizardUi, photoGmiSourceRebinding, photoGmlCaptureApproval, photoGmlCaptureApprovalUi, photoMapFeatures, photoMapFitUi, photoMarkerProvenanceUi, photoPositioningUi, photoSourceWorkflow, photoSpatialUi, wizardNavigationUi; tests/helpers/{deliveryFixtures,photoSourceWorkflow}.mjs.

## Git status

Nothing was staged, committed, pushed or deployed. The working tree holds the changes listed above, plus the planning report, which was untracked at the start.
