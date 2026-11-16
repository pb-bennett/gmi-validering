# FOTO correctness corrections, Slice 1: completion report

Completed 2026-11-16, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `d839ea7`. HEAD was checked at the start and at the end. At the start the tracked tree was clean apart from three untracked 2026-11-11 reports, which were left untouched. No subagents were used. Nothing was staged, committed or pushed.

## Scope and outcome

This task fixes three defects found in real-delivery acceptance. Wizard layout and navigation, export formats, Gemini schemas, marker click and colour styling, the filter panel design, Rettinger and Validator are unchanged.

1. **GML positioning assigns GML.** When the user confirms "Bruk valgte posisjoner" in the source workflow, an occurrence without a GMI link that adopts a GML position becomes a GML inclusion (`{kind:'unlinked', include:true}`). This applies only when the occurrence is still in its untouched default "Ikke valgt" state. The position writes and the delivery writes are validated together, written together and published once. The planner already proposed no GML position for GMI placements, and they stay GMI. The import wizard's GML placement uses the same session path (`completeImport` → `applySourceWorkflowPositions`), so it now behaves the same way.
2. **A move away from the originating GMI point proposes GML.** In "Juster plassering og retning":
   - A staged move of an untouched GMI occurrence shows as a proposed GML on the list pill, the map marker colour, the counts and summary, and the inspector. The inspector explains the proposal: "Foreslått GML fordi plasseringen er flyttet fra GMI-punktet …".
   - Save commits the position and the transfer decision in one `applyPhotoEdits` call.
   - Rotation alone, a return to within tolerance of the GMI point, undo and discard all leave GMI.
   - The occurrence (the GMI object relationship) is kept as provenance. S_HYPERLINK is not touched; the existing export-time transfer applies.
   - The existing "Mangler for GML: opptakstid" warning appears automatically for the proposed or committed GML.
3. **Delivery filters react at once.** A selected occurrence that no longer matches the *delivery* filter is not pinned under "Valgt bilde (skjult av filteret)" and is not kept on the map. It stays selected in the inspector. Counts were already recomputed on every publish. The cause was the deliberate pinning rule, not stale data. Placement, metadata and work filters still pin the selection as before.

## Implementation decisions

- **Explicit-choice marker (`deliveryChoiceIds`).** "Ikke valgt" (unlinked) and "GMI" (linked) are both stored as *no decision*. That makes a deliberate choice of those states indistinguishable from the default. The session now records, in a separate set, the occurrences whose state the user set explicitly through `setDeliveryIntent`, `setCombinedDeliveryInclusion` or `setPhotoDeliveryExclusion`. The derived entry exposes this as `userChosen`.
  - The set is cleared on release and reset.
  - It is not part of `buildPhotoDeliverySnapshot`, so export plans and staleness keys are unaffected.
  - Automatic defaults apply only when there is no stored decision and `userChosen` is false. They therefore never override GML, Ikke, an inclusion or an explicit GMI/Ikke choice.
- **Contract change.** The first explicit choice of a state that is already current (for example clicking GMI on a default GMI occurrence) now publishes once, so that an unsaved proposal disappears immediately. It still writes no decision, and a repeated choice remains silent. `tests/photoDeliveryIntent.test.mjs` was updated to assert exactly this, including that the export `stateKey` is unchanged.
- **Movement threshold.** The shared `PHOTO_POSITION_TOLERANCE_METRES` (0.01 m) and `photoPositionDistance` from `photoPositioning.mjs` are reused, measured against the occurrence's own GMI candidate (`provenance.key === occurrence.key`). No new tolerance was added.
- **One rule, two consumers.** The pure helpers `photoMoveProposesTransfer`, `photoGmlPositionSetsDelivery` and `photoOriginGmiPosition` are used by both the session (authoritative at commit) and the page overlay (presentation while editing). `photoDeliveryWithProposals` overlays proposals for presentation only and recomputes the summary.
- **Filtering while editing.** Filtering uses the saved delivery, so an occurrence being edited does not vanish from the list or map before Save.
- **Cycling a proposed pill.** Clicking a proposed GML pill continues from GML: the next step is an explicit Ikke. Choosing GMI in the inspector records an explicit GMI choice and drops the proposal.
- **Shared photographs.** Each placement is evaluated independently, so sibling occurrences are never changed.

## Exact changed files

Application:
- `src/lib/photos/photoSession.mjs`: explicit-choice set, its marking in the three delivery writers, the GML default in `applySourceWorkflowPositions` and `applyPhotoPositioning`, and the move transfer in `applyPhotoEdits` (all atomic with their positions).
- `src/lib/photos/photoDeliveryIntent.mjs`: `userChosen` on entries; optional `choiceIds` in `photoLayerDelivery`.
- `src/lib/photos/photoDeliveryChoice.mjs`: the default and proposal helpers and the presentation overlay.
- `src/lib/photos/photoWorkspaceView.mjs`: no pinning or map retention for a delivery-filter mismatch.
- `src/app/page.js`: the `shownDelivery` overlay passed to the list, map and inspector; proposed-pill cycling; a save toast note ("… overføres til GML").
- `src/components/photos/PhotoDeliveryControls.js`: the proposal note in the inspector.

Tests:
- `tests/photoDeliveryDefaults.test.mjs` (new): six Node regressions, including the exported Skråfoto GML round trip.
- `tests/photoDeliveryDefaultsUi.test.mjs` (new): production-browser regression for all three corrections.
- `tests/photoDeliveryIntent.test.mjs`: the contract change above.
- `tests/helpers/deliveryFixtures.mjs`: the fixture "accepts" GMI-linked placements by manual moves to arbitrary synthetic coordinates, which under the new rule correctly become GML. It now records an explicit "keep in GMI" choice first. Coordinates, bytes and every export assertion are unchanged.
- `tests/photoMarkerProvenanceUi.test.mjs`: a saved move of `shared.png` placement 2 now becomes GML while its sibling stays GMI. The test asserts this, then restores GMI explicitly so the following delivery assertions are unchanged.

Report: this file.

## Verification

Passed:
- `node --test tests/photoDeliveryDefaults.test.mjs`: 6/6.
  - Round trip: 14 photos, of which 5 get GMI positions and 9 are unplaced. The application's own exported Skråfoto GML (synthetic, via `exportFixture` + `serializePhotoExport` and the production GML parser) matches all 9. After apply: 9 GML (`include`), 5 GMI with identical placements and occurrences. Snapshot counts are 9 included, 5 retained, 0 transfer, no readiness issues. Repeating the apply is refused with no state change.
  - A deliberate Ikke is preserved (8 of 9 become GML). Cancelling after the source is kept, and a refused batch, change neither positions nor delivery.
  - A move proposes and commits GML. Rotation only and a return to the GMI point do not. The shared-photo sibling is untouched, the occurrence key is kept, and the snapshot shows the transfer and the asset as transferred and retained.
  - GML, Ikke and explicit GMI are never overridden. A stale or superseded edit commits nothing.
  - Unsaved proposals follow staging, undo and the return to the GMI point. Filters use saved choices, and the overlay does not change the `stateKey`.
  - Delivery filter: the occurrence leaves the rows, is not pinned, is not in `visibleIds`, and counts update; placement filters still pin.
- Photo and delivery Node suites (`tests/photo*.test.mjs`, `deliveryWizard`, `deliveryPlan`, `deliveryExclusion`): all pass after the fixture and contract updates above.
- Full serial Node run, `node --test --test-concurrency=1 "tests/*.test.mjs"`: **2269 tests, 2130 pass, 1 fail, 138 skipped.** The one failure is pre-existing (see below).
- `npm run build` (fresh production build in the repository; no other server or build was running): exit 0, twice. The second build included the summary-overlay change.
- Production browser, port 3215, serial: `tests/photoDeliveryDefaultsUi.test.mjs` passes. It covers:
  - the GMI import plus Skråfoto GML round trip in the UI: 5 GMI and 9 GML pills, and the summary "Samlet levering: 9 tas med uten GMI-lenke";
  - the filter "Beholdes i GMI": rows go from 5 to 4 when the selected photo cycles to GML; there is no pinned heading; the counts read (4) and (1); the marker leaves the map; the inspector keeps the selection; choosing GMI again returns the photo;
  - edit mode: rotation keeps GMI, a drag proposes GML with the inspector note and an updated summary, undo and discard restore GMI, and Save commits GML with a toast while a rotated-only photo stays GMI;
  - no horizontal overflow at 1280×720 and 1366×768.
- All 30 photo, delivery, wizard and gmiPhoto browser suites run serially against the same build: **176 tests, 164 pass, 2 fail, 10 skipped.** The 10 skips are private-corpus or opt-in tests. The 2 failures are one pre-existing subtest and its parent.
- `npx --no-install eslint` on all 11 changed or new JS/MJS files: exit 0. `git diff --check`: exit 0.
- Screenshots were inspected: GML round-trip list, the filter after the change, the proposed move at both laptop sizes, and the saved move. Path: `C:\Users\GEMINI~1\AppData\Local\Temp\claude\48e85b8705b14ab6\3d51b0bb-b9e8-406c-bc31-5845504e1733\scratchpad\shots\`.

Failed during development and resolved:
- 15 export and delivery Node tests failed because of the fixture behaviour described above (manual moves of GMI placements). They were fixed in the fixture without changing any assertion.
- The publish-count assertion in `photoDeliveryIntent` was updated for the deliberate contract change.
- One subtest in `photoMarkerProvenanceUi` failed because it expected GMI after a saved move. It was updated as described above.
- In the new tests, early failures came from a missing Node GML parser (the existing `parseRealGml` helper is now used) and from re-staging a GML source that had already been kept. These were test-side corrections.

Pre-existing failures (not regressions). Evidence comes from code inspection, not from a run against a HEAD build:
- `tests/validationV2GmiA7.test.mjs` "Validator exposes only the automatic V2 workflow" expects `aria-label="Lukk Validator"` in `src/components/validation-v2/ValidationV2Workspace.js`. That file is not modified by this task. The contract appears to be outdated by HEAD `d839ea7` (unified close controls).
- `tests/photoWorkspaceStacksUi.test.mjs` "counts: unique assets and placements …" expects `^7 bilder · 8 plasseringer$` but receives an extra "GMI 8 / GML 0". Those per-destination counts come from `photo-delivery-counts`, which exists unchanged at HEAD (added in `94e1bf5`, whose browser run did not include this suite). This diff does not touch that component.

## Remaining limitations and manual checks

- The explicit-choice marker lives in session memory, like the decisions, and does not persist across reloads.
- A GMI-linked occurrence that adopts a GML candidate in the source workflow (instead of its GMI position) is not changed automatically. Item 1 covers only unlinked occurrences; such a GMI placement is reached through item 2 only when moved in edit mode. Record this if it should change in Slice 2.
- An unlinked occurrence already placed by EXIF that later adopts a GML position also becomes GML, if it is still in its untouched default state. This follows "positions actually adopted from the GML source should default to GML".
- No real-file or Gemini acceptance run was performed; all automation uses synthetic fixtures. Recommended manual checks with the real 5 GMI + 9 GML delivery:
  - Re-import the exported Skråfoto GML and confirm 9 "GML" pills.
  - Move one GMI photo: the proposal appears, undo and discard work, and Save gives GML.
  - Filter "Beholdes i GMI" and change a selected photo: it leaves the list.
  - Download a combined delivery and confirm the photo counts and S_HYPERLINK removal for the moved photo.

## Git and process status

- Branch `feature/photo-workspace`, HEAD `d839ea7` (unchanged).
- Modified: the six application files and three test files listed above.
- New: two test files and this report.
- Nothing was staged, committed, pushed or deployed.
- The production server started for this task on port 3215 was stopped. No other servers were running at the start.
- Logs are in the session scratchpad: `build.log`, `build2.log`, `browser.log`, `browser-all.log`, `node-all.log`.
