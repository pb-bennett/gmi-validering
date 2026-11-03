# FOTO workspace and transactional Edit mode — Pass 1 implementation

Date: 2026-11-03, Europe/Oslo. Branch `feature/photo-workspace`, baseline HEAD `4707f22` (*Plan photo workspace and edit mode overhaul*). Working tree was clean at start. **Nothing was committed or pushed.**

Specification: `20261103-1300-photo-workspace-edit-export-overhaul-planning.md` (Pass 1), with the user's refinement that `Fullfør opplysninger…` replaces `Klargjør for eksport…` in `Verktøy` as a visual placeholder.

---

## 1. Scope completed

- **Left pane** (272 px): back arrow, layer name, eye visibility toggle, compact counts (`4 bilder · 2 plassert · 5 plasseringer`), `Redigerer` pill in Edit mode, `Verktøy`, funnel filter panel, sort menu, conditional reset, active-filter summary with clear. Permanent Add/Export/Position buttons, the sources block, per-row checkboxes, the metadata batch and the import banner are gone.
- **`Verktøy` menu** (WAI-ARIA menu, groups + separators, Phosphor Regular icons, roving keys, Escape returns focus): `Legg til bilder…`, `Rediger bilder`, `Koble og posisjoner bilder…`, `Kilder og koblinger`, `Fullfør opplysninger…` (placeholder), `Eksporter…`, separated destructive `Fjern bilder fra laget…`. Disabled items keep `aria-disabled` and show `Laget er tomt`.
- **Filters and sort** shared by list and workspace map; selected occurrence is pinned in the list (`Valgt bilde (skjult av filteret)` + `Vis alle`) and stays rendered on the map. Placement radio group with counts (Alle/Plassert/Uplassert/EXIF/GMI/GML/Manuell, `Ukjent` only when non-zero), `Mangler` (Retning, Opptakstid), `Annet` (Flere plasseringer, Endret — Edit mode only). Seven sort modes, default filename A–Å with numeric `nb` collation; capture-time sorts compare the local date-time without timezone conversion, unknown last.
- **Removal selection mode** (from `Verktøy`): checkboxes only in this mode, sticky top bar (`Velg alle viste`, `Avbryt`), bottom destructive actions, existing confirmation (extracted to `RemovePhotosConfirmation.js`), Escape leaves the mode.
- **Read-only inspector** (`clamp(400px, 32vw, 560px)`): large preview + `Vis stort`, occurrence switcher, summary chips, `Plassering` (status, source swatch, WGS84, `Grunnlag`, staged `Lagret: …` lines, direction + source, `Andre mulige posisjoner` with locate icons, `Tekniske kildedata`, `Retningsdata fra bildet`), `Opptak` (formatted capture time with precision/timezone notes, photographer, `Kildeverdier`, conflict note, the single contextual action `Rediger opptaksdata…`), `Koblinger` (`Denne plasseringen` badge, line links, GUID under technical details), `Fil`.
- **`Rediger opptaksdata…` dialog**: evidence radio choices, `Annen verdi` with native date / `time step=1` / timezone select (default `Ukjent tidssone`, offsets only from evidence/accepted value or explicit choice), photographer text, `Fjern godtatt …` with consequence line, `Gjelder alle {n} plasseringer av bildet`. Untouched fields are never written (Save cannot silently convert evidence provenance to manual). Writes via the existing `setCaptureMetadata`; never part of the Edit transaction. Goes through the unsaved-changes boundary in Edit mode.
- **`Kilder og koblinger`** read-only dialog (overview counts, one card per source with nested summaries, link totals, footer `Koble og posisjoner bilder…`).
- **Workspace toast** replaces the import banner (success auto-dismisses after 6 s, pauses on hover/focus; errors persist; `placementError` carries `Koble og posisjoner bilder…`); also used for saves, metadata changes and session-end notices.
- **Map display card** (replaces `PhotoPositionLegend`): `Markører` (default) / `Miniatyrer` radiogroup with visible text, source legend, direction sample, selected/sibling samples, `Endret` in Edit mode, `Miniatyrer vises fra zoom 16` note. Preference persisted in `localStorage` key `gmi-photo-map-display` with try/catch.
- **Thumbnail mode**: 44 px `object-fit: cover` crop, 2 px provenance border, independent navy selection ring outside the border, dashed sibling outline, staged corner dot, camera fallback (no full-resolution decode, only the session thumbnail URL), `PHOTO_THUMBNAIL_MIN_ZOOM = 16` with marker fallback below it, hover preview (Leaflet tooltip, 250 ms, `object-fit: contain`, hover-capable pointers only, also on keyboard focus), hover raises z-order imperatively, identical coordinates show one stack badge with click cycling, `aria-label` instead of a duplicate `title`.
- **Direction arrows** always drawn when a direction exists (accepted or staged), in both modes, selected or not, inside and outside the workspace; navy `#0F172B` with white halo, staged = dashed shaft; unknown draws nothing. Norwegian compass labels `N, NØ, Ø, SØ, S, SV, V, NV` + spoken words.
- **Transactional `Rediger bilder`**: ticket in `photoSession` (identities only), staged values + undo/redo in a pure reducer, command bar, draggable selected marker/thumbnail, rotation knob, click-to-place for unplaced photos, numeric and keyboard alternatives, connectors, save/discard/boundary/conflict dialogs, Escape order, forced layer visibility, non-interactive other FOTO layers, Gemini inspection disabled.
- **Performance**: presentation built once per session snapshot; no per-marker `photoSession.getPhoto`; cached `L.divIcon`s; memoized per-marker components with primitive props; stable event handlers via an actions ref; no React state per pointer move.

## 2. Files

### New

| File | Purpose |
|---|---|
| `src/lib/photos/photoEditSession.mjs` | Pure edit reducer (`stage`/`undo`/`redo`/`reconcile`/`drop`), selectors (`effectivePhoto`, `photoEditChanges`, …) |
| `src/lib/photos/photoWorkspaceView.mjs` | Filter/sort/pinned/counts for list **and** map |
| `src/lib/photos/photoCaptureTimeInput.mjs` | Native date/time/timezone fields ↔ canonical capture time |
| `src/components/photos/PhotoIconButton.js` + `photoIconTooltip.js` | Shared icon-only button and one imperative tooltip implementation (also used by the Leaflet knob) |
| `PhotoWorkspaceToolsMenu.js`, `PhotoWorkspaceInspector.js`, `PhotoCaptureMetadataDialog.js`, `PhotoCaptureTimeField.js`, `PhotoSourcesInfoDialog.js`, `PhotoWorkspaceToast.js`, `RemovePhotosConfirmation.js` | Panes and dialogs |
| `PhotoMapDisplayCard.js`, `usePhotoMapDisplayPreference.js`, `photoMarkerIcons.js` | Display modes, preference, icon cache |
| `PhotoEditLayer.js`, `PhotoEditCommandBar.js`, `PhotoEditBoundaryDialog.js`, `photoEdit.css` | Edit mode |
| Tests: `photoEditSession`, `photoEditCommit`, `photoWorkspaceView`, `photoInspectorPresentation`, `photoWorkspaceEditUi`; helpers `photoWorkspace.mjs`, `photoWorkspaceFixtures.mjs` | |

### Changed

`src/app/page.js`, `src/components/MapInner.js`, `src/components/MapView.js`, `PhotoMarkersLayer.js` (rewrite), `PhotoMapController.js`, `PhotoWorkspaceCollection.js` (rewrite), `PhotoCollectionPanel.js` (removed `SelectedPhotoInspector` export only), `photoWorkspace.css`, `photoSession.mjs`, `photoWorkspaceState.mjs`, `photoMarkerPresentation.mjs`, `photoMapFeatures.mjs`, `photoDirection.mjs`, `photoPresentation.mjs`, plus migrated tests (listed in §6).

### Deleted (plan §25)

`PhotoManualPlacementControls.js`, `PhotoManualPlacementLayer.js`, `usePhotoManualPlacement.js`, `PhotoDirectionControls.js`, `usePhotoDirectionEdit.js`, `PhotoSpatialInspector.js`, `PhotoGmiInspector.js`, `PhotoMetadataEditor.js`, `PhotoPositionLegend.js`, `photoManualPlacement.css`, `photoDirection.css`. (Deletions are unstaged working-tree changes; the index was not modified.)

### Not touched (Gemini/export gate)

`photoExportPlan.mjs`, `photoExportXml.mjs`, `photoExportPackage.mjs`, `attachmentNames.mjs`, `exportContract.mjs`, `photoExportDiagnostics.mjs`, `PhotoExportDialog.js`, `PhotoEvidenceActions.js`, `PhotoManualFillActions.js`, the import wizard, `PhotoPositioningWizard.js`: **no diff**.

## 3. Architecture and implementation decisions

1. **Session API** (`photoSession.mjs`): `beginPhotoEdits(layerId)` → frozen ticket `{ id, layerId, generation, baseline: { [occurrenceId]: { current, direction } } }` (identities only; local `photo-edit-N` ids so test id sequences are unaffected); `photoEditsAreLive`; `endPhotoEdits`; `applyPhotoEdits(ticket, changes)` validates *every* change (membership, `spatial.current`/`direction.current` identity, position/degree validity, duplicates) before any write, returns `edit-conflict` + `staleIds` with nothing written, otherwise writes with one shared `acceptedAt` via the existing `acceptManualPhotoPosition` / `acceptManualPhotoDirection` (candidates and evidence preserved), ends the registration and publishes once. `clear()`/`deleteLayer()` end sessions; a new begin supersedes. Removed: `beginManualPlacement`…`applyDirectionEdit`, ticket WeakSets, `editVersion`, `manualVisibilityVersions`. Visibility is deliberately not part of liveness (Edit mode forces visibility and disables the toggle).
2. **Staging outside canonical state**: `photoEditReducer` lives in `page.js` (`useReducer`). Export/readiness can never see staged values by construction (tested with `capturePhotoExportSnapshot`). Discard = end the ticket.
3. **Undo/redo**: one entry per completed gesture; keyboard nudges coalesce per occurrence+field within 1 s (a nudge back to the start removes the entry); a stage equal to baseline removes the staged key; new stage clears redo; cap 200; selection is not history; undo/redo select the affected occurrence, pan it into view and announce (`Angret flytting av …`). No undo after save. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y, ignored in text/number fields and when a dialog is open.
4. **Single boundary** `requestWorkspaceAction(run)` in `page.js` gates Back, every `Verktøy` item, header `Bilder`, `Rediger opptaksdata…`, layer switching and Escape. 0 changes → leave silently; otherwise `Du har ulagrede endringer på {n} bilder` [`Fortsett redigering`] (default focus, Escape) / `Forkast endringer` / `Lagre endringer`; the pending action continues after save/discard. `Forkast endringer` in the bar asks `Forkaste endringer på {n} bilder?`. Conflict dialog offers `Lagre de øvrige {n−k}` (drop stale, retry same ticket) or continue. External session end → toast `Redigeringen ble avsluttet fordi fotolaget ble endret.`; occurrences removed while editing → staged entries dropped with a toast.
5. **Escape order**: (0) a visible icon tooltip consumes Escape at the element; (1) an active drag/rotation consumes it via a capture-phase document listener and restores the pre-gesture value; (2) menus `preventDefault`; (3) the page handler (ignores `defaultPrevented`) opens the boundary or exits with 0 changes. A single Escape never discards.
6. **Leaflet/React gesture safety** (the plan's main risk):
   - In Edit mode the selected occurrence is rendered by `PhotoEditLayer` (edit pane, z 640) *instead of* by `PhotoMarkersLayer`, with the same cached icon — still "the actual marker", no extra handle, no duplicate.
   - Its `icon` and `position` props are frozen in state from `dragstart` to `dragend` (two renders per gesture, none per pixel); icon identity comes from the cache and the position array is memoized, so React never calls `setIcon`/`setLatLng` mid-drag (Leaflet's `setIcon` → `_initInteraction` would end the drag).
   - `drag` updates the knob position, connector and a live `Flyttes ca. … m` readout imperatively; `dragend` stages once.
   - Escape cancel: Leaflet 1.9's `MarkerDrag.removeHooks` detaches `dragend` *before* finishing the drag, so cancel = `dragging.disable()` → `setLatLng(start)` → `dragging.enable()`; a sync effect re-asserts React's position after any no-op gesture.
   - Rotation knob: imperative `L.marker` anchored at the photo position (offset 56 px in screen space, so no reprojection on zoom), custom pointer handling with pointer capture, `map.dragging.disable()` during the gesture, 3 px threshold (a click on the ghost never creates north), `atan2` from the anchor's container point (0° = up = north, clockwise), live dashed arrow + `123° SØ` readout, stage on pointerup. `role="slider"`, `aria-valuetext` spoken Norwegian, ±1 / Shift ±15 / PageUp/PageDown ±15, shared tooltip `Endre retning` / `Legg til retning`. Ghost knob: first arrow key only announces `Angi retning med piltastene eller i feltet Retning`.
   - Click-to-place capture (unplaced selection) reuses the old capture logic incl. the pan threshold; photo markers stay clickable so another photo can still be selected.
7. **Command bar** is a page overlay (not inside the Leaflet container) so React events work normally; it reaches the map centre through a ref registered by `PhotoEditLayer`. Placed in the free band between the left map controls and the layers control; a container query shortens `Forkast endringer`/`Lagre endringer` visually while the accessible names stay complete.
8. **Performance**: `MapInner` builds `buildPhotoMapItems` once per `photoLayers` identity (new array on every publish) and workspace view; the workspace layer uses the already-derived effective photos (no re-read) and the filter's `visibleIds`. `PhotoMarkersLayer` derives a primitive presentation model (no session access), uses a module-level `L.divIcon` cache (2000 entries), memoized `PhotoMarker` components, and one shared Leaflet tooltip for previews. `PhotoMapController`'s initial fit uses items instead of per-feature `getPhoto`. `page.js` memoizes workspace photos on `photoLayers` (React-compiler-safe explicit dependency).
9. **Icon tooltips**: one framework-free implementation (`attachPhotoIconTooltip`) used by `PhotoIconButton` and the knob: 300 ms hover (mouse only), immediate on `:focus-visible`, hoverable, Escape dismissal consumed, `aria-hidden` when text equals the name, `role="tooltip"` + `aria-describedby` when it differs, appended to the open `<dialog>` when inside one, fixed positioning with viewport clamping, z 1400. No native `title` on icon-only controls; `data-icon-tooltip` for tests.
10. **Direction labels**: `photoDirectionLabel` now uses Norwegian letters and keeps exact non-integer accepted values (`359,875° N`) instead of rounding them for display; `photoDirectionSpokenLabel` (`123 grader, sørøst`), `photoDirectionCompassWord`.

## 4. Deviations from the planning report (and why)

| Plan | Implemented | Reason |
|---|---|---|
| `Klargjør for eksport…` in Verktøy (pass 2) | `Fullfør opplysninger…` placeholder (`ListChecksIcon`, normal enabled styling); `openCompletePhotoDetails()` in `page.js` is an isolated no-op | User refinement |
| Command bar inside `MapView`'s overlay with live distance from edit-layer state | Page-level overlay; live distance shown as a map-side readout during the drag, `Flyttet ca. …` in the bar after staging | Avoids cross-tree per-pixel state; React events would otherwise be swallowed inside Leaflet's container |
| Rotation knob as a separate marker recomputed via `unproject` | Knob anchored at the photo position with a pixel offset | Same geometry, no reprojection on zoom/move |
| `Grunnlag: Valgt i Koble og posisjoner bilder` for `explicit-candidate` | `Valgt fra kildeposisjon` | Import placement also records `explicit-candidate`; the plan's wording would be false for import-placed photos |
| `Flere formater` (EUREF89 UTM) disclosure | Not implemented | Marked optional in the plan |
| Removal button copy `Fjern {n} plasseringer fra laget` | Uses `bilder` when the layer has no repeated assets, `plasseringer` otherwise | Same unit rule as the wizard; avoids "plasseringer" for ordinary photos |
| Separate `photoIconButton` component test page | Tooltip behaviour asserted inside `photoWorkspaceEditUi` (hover delay, focus, Escape consumed, aria-hidden vs `role=tooltip` + `aria-describedby`, unavailable focusable no-op, no `title`, generic guard, negative checks) | No synthetic component harness exists for React components; the real app covers the same assertions |
| `photoWorkspace-editing` class on the primary container | Dropped | Unused (outline is `.leaflet-container.photo-edit-mode`) and it broke the existing `mapPaneToolbar` source contract |

## 5. Interim capability notes (plan risk 3)

- Selection-scoped metadata completion (`Opptaksmetadata for {n} unike bilder`) and per-occurrence `Bruk EXIF-retning for denne forekomsten` are removed from the workspace. Whole-layer, missing-only EXIF/GML adoption and manual fill remain available in `Eksporter…` (unchanged `PhotoEvidenceActions`), so no data capability is lost — only the narrower scoping, until pass 2.
- Per-photo evidence adoption for capture time / photographer is available in `Rediger opptaksdata…`.
- The inspector shortcut `Kontroller kilder og posisjon` (which focused the active photo in the wizard) is removed per plan; the single entry is `Verktøy → Koble og posisjoner bilder…`.

## 6. Tests

### New focused tests

- `photoEditSession.test.mjs` (10): stage move/direction, multiple photos, staged overlay = manual provenance, evidence identity kept, repeated occurrences independent, baseline-equal removes key, undo/redo order, redo cleared by a new edit, keyboard coalescing within/beyond 1 s, history cap, reconcile/drop, apply shape.
- `photoEditCommit.test.mjs` (6): begin requires a non-empty layer; staging never writes or publishes (snapshot identity unchanged, export snapshot unchanged); discard leaves canonical state identical; save applies all changes with one publish, one `acceptedAt`, manual basis, candidates/evidence preserved, unplaced → placed, new explicit north; conflict on any occurrence writes nothing, `drop` + retry commits the rest; removed occurrences are stale; `clear`/`deleteLayer` end the session; new begin supersedes; late EXIF does not conflict; repeated GMI occurrences committed independently.
- `photoWorkspaceView.test.mjs` (6): every filter, AND combination, counts, effective (staged) sources, `Endret` filter, selected occurrence pinned and kept in the map include set, all sorts incl. unknown-last capture and numeric collation, sibling adjacency, `buildPhotoMapItems` with staged positions.
- `photoInspectorPresentation.test.mjs` (5): capture-time formatting without host conversion, date/time/timezone composition (Unknown default, step=1 seconds, invalid offsets), provenance labels, locate with a staged position, read-only inspector / dialog-only metadata writes / Verktøy labels incl. `Fullfør opplysninger…` and no photo-specific item.
- Updated: `photoDirection.test.mjs` (Norwegian letters + spoken words, exact decimals, session safety rewritten against the edit API), `photoManualPlacement.test.mjs` (rewritten with equivalent safety assertions), `photoMarkerPresentation.test.mjs` (always-on navy arrows, butt-capped dashed staged shaft, thumbnails, stack, cache key, zoom threshold 16), `photoWorkspace.test.mjs` (mode/removal/filter/sort), `photoSourceWorkflow.test.mjs` (source contract for the new UI).
- Other domain tests that used the removed ticket APIs only as setup were migrated mechanically to `applyPhotoEdits(beginPhotoEdits(…), [{…}])` (same `{ ok }` result).

### Results

| Run | Result |
|---|---|
| Baseline before changes, photo/GMI domain selection (`tests/photo*`, `tests/gmiPhoto*`, excluding `Ui`/`Layout`) | 399 tests, 395 pass, 0 fail, 4 skip |
| Same selection, final | **429 tests, 425 pass, 0 fail, 4 skip** (skips are the pre-existing optional/private-corpus ones) |
| `mapPaneToolbar.test.mjs`, `layerPresentation.test.mjs`, `photoDialogLayout.test.mjs` | pass (one `mapPaneToolbar` source-contract failure I caused was fixed by removing an unused class) |
| `statsUiContract.test.mjs` | **2 fail — pre-existing baseline** (documented in earlier reports; the asserted `page.js` line is byte-identical at HEAD and none of the other files it reads changed) |
| Synthetic browser suites against dev server: `photoWorkspaceEditUi` (new, 21 subtests), `photoImportWizardUi`, `photoImportAcceptanceFixesUi`, `photoLoadedGmiUi` (10), `photoMarkerProvenanceUi` (7), `gmiPhotoAssociationsUi`, `gmiPhotoPlacementsUi`, `photoDirectionUi` (synthetic) | **all pass** (associations' private-corpus subtest skipped) |
| Real-corpus suites (`PHOTO_GML_FIXTURE` = local Ekenesstokken, 148 photos) against dev | `photoDirectionUi` ✔, `photoManualPlacementUi` ✔, `photoPositioningUi` real-148 test ✔ |
| Real-corpus suites still open | `photoWorkspaceUi`: runs to the end; only its final "no runtime exceptions" check failed on one Leaflet `_leaflet_pos` error from `_onZoomTransitionEnd`, ~170 ms after the last FOTO layer is deleted and a new map mounts before `Page.reload` (dev server). Suspected dev StrictMode double-mount / map removal during a zoom transition, not Edit-mode logic — **not yet confirmed**. Fixes applied after the last dev run (not re-run): width expectations updated to 272 / clamp(400, 32vw, 560) in `photoWorkspaceUi`; `photoSpatialUi` re-enters the workspace after the helper exits it; `photoPositioningUi` synthetic test restored its `manual` snapshot. `photoAppendDuplicatesUi` timed out waiting for 148 thumbnails on the second 148-file append (dev server, heavy load) — not reproduced/diagnosed. A confirmation run of these four against the fresh production build was **started but stopped unfinished** because the usage window ran out. |
| `npm.cmd run build` | **pass** (final build after all source changes except the toast-ref/hover-z-index/class tweaks, which were linted; a rebuild before the stopped prod run also passed) |
| ESLint on every changed/new `src` file | **0 findings**; `MapInner.js` unchanged from its HEAD baseline (12 pre-existing problems, 8 `react-hooks/refs` errors) |
| `git diff --check` | clean |
| Pass-1 grep gates (§25) | all zero in `src/` (`Velg alle viste` only inside removal mode; `#075e9a` only as an existing focus outline) |
| Gemini/export files | no diff |


## 7. Manual / rendered acceptance

Performed in headless Chrome (CDP, real mouse/keyboard/touch input) with screenshots stored outside Git in the session scratchpad:

- Opening a FOTO layer, quiet left pane (list starts < 150 px from pane top), toast instead of banner; 1920×1080 and 1280×720 layouts (left 272, inspector 410 at 1280 / ~538 at 1680 / 560 at 1920; no horizontal scroll; command bar and toast clear of zoom, measure, `Lagmarkering`, layers control and display card — two overlaps found at 1280 and fixed).
- Tools menu grouping/keyboard; filter/sort; pinned hidden selection with the map still showing it; inspector sections, large preview, occurrence switcher; metadata dialog (evidence, manual date/time/+02:00, remove, Escape cancel).
- Icon tooltips on hover (delayed) and keyboard focus (immediate), Escape dismissal consumed, `role=tooltip`/`aria-describedby` for unavailable reasons, no tooltips on text controls, generic icon-only guard.
- Edit mode: drag a placed photo (manual provenance, connector, displacement), knob rotation (live readout, dashed staged arrow) and keyboard ±1/±15, numeric direction creation, click-to-place (pan never places, Enter places at centre), `Plasser i kartsenter`, repeated occurrences independent, several photos before save, undo/redo by buttons and shortcuts, redo invalidation, Escape cancels drag/rotation first, boundary from Escape/Back/Verktøy/header `Bilder`/`Rediger opptaksdata…`, discard (canonical fingerprint identical), save (one toast, accepted solid arrows visible while unselected), no undo after save, reload loses staged edits.
- Map display: markers ↔ miniatures, provenance borders, selection ring outside the border, arrows in both modes, hover preview (`contain`), touch emulation (no preview, tap selects), zoom 15 fallback with note, stack badge and click cycling, preference persisted across reload.
- Real 148-photo corpus: Edit-mode drag changes exactly one marker; evidence preserved; source wizard sees the manual move; layouts 1024×620 and 390×700.
- Found and fixed during acceptance: staged arrows rendered solid (round caps filled the dash gaps → butt caps), legend arrow offset, command-bar/toast overlaps at 1280, exact EXIF directions displayed rounded.
- **Not done**: the scripted 148-photo thumbnail density/performance measurement (`density.mjs` in the scratchpad) was prepared but not run; other-FOTO-layers-non-interactive in Edit mode is implemented but not browser-tested (needs two layers); conflict dialog and session-ended toast are covered by domain tests only.


## 8. Known limitations and follow-ups

1. **Finish real-corpus verification**: run `photoWorkspaceUi`, `photoSpatialUi`, `photoPositioningUi`, `photoAppendDuplicatesUi` with `PHOTO_GML_FIXTURE` against a production build (`npm.cmd run build`, `next start`), and determine whether the `_leaflet_pos` exception also occurs at HEAD / in production. If it is real, guard map removal during zoom transitions; do not weaken the exception assertion.
2. Run the WFS browser selection (`geminiReferenceBrowser`, `geminiWorkflowBrowser`, `geminiPopupBrowser`) and the full repository test suite — not run in this pass.
3. Run the prepared density/performance check (thumbnails at zoom 15/16/18 on 148 photos, drag/rotate long tasks) and tune `PHOTO_THUMBNAIL_MIN_ZOOM` if needed.
4. Browser-test other-layer non-interactivity in Edit mode, the conflict dialog and the persistent placement-error toast.
5. Hover tooltips are attached to `document.body` (or the open dialog); they are hidden on scroll/resize rather than repositioned.
6. No clustering/fan-out, snapping, multi-move, unplace/clear-direction, or `beforeunload` guard (explicit plan deferrals).
7. Pass 2 (export preparation, `Fullfør opplysninger…` workflow, Eksporter simplification, Gemini copy) remains to be done; selection-scoped metadata completion returns there.


## 9. Explicit confirmation

- The **export overhaul** (export wizard, filename/timestamp changes, schema/profile simplification, readiness redesign, Gemini copy update) was **not** implemented. Export serializers, plan, package and dialog have no diff.
- The **`Fullfør opplysninger…` workflow was not implemented**; the menu entry is a deliberate visual placeholder wired to an isolated no-op.
- EXIF-vs-current-position comparison, reverse geocoding and automated EXIF correction were not implemented.
- Nothing was committed or pushed.
