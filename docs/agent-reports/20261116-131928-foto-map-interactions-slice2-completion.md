# FOTO map interactions and UI polish, Slice 2: completion report

Completed 2026-11-16, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `c7c2241` (Slice 1 commit). HEAD was checked at the start and at the end. The tracked tree was clean at the start apart from three untracked 2026-11-11 reports, which were left untouched. No subagents were used. Nothing was staged, committed, pushed or deployed.

## Scope and outcome

All five corrections from the 2026-11-16 real-delivery acceptance are implemented in the existing architecture. Slice 1's automatic delivery decisions, explicit-choice handling, reactive filters and transactional positioning are unchanged, and their tests still pass. Wizards, Gemini export formats, GMI hyperlinks, photo positions, Rettinger and Validator rules are not touched.

1. **One delivery palette.** The approved colours are now shared tokens in `globals.css`:
   - `--gmi-delivery-gmi` `#60A5FA`, `--gmi-delivery-gml` `#4ADE80`, `--gmi-delivery-excluded` `#CBD5E1`
   - ink `--gmi-delivery-ink` `#0F172A`, with `--gmi-delivery-{gmi,gml,excluded}-ink` aliases

   `PHOTO_DELIVERY_COLOURS` mirrors them, and the parity test enforces this. They apply to:
   - FOTO markers and main-map markers
   - list pills, inspector toggle options and the new preview pill
   - the FOTO legend and the main-map legend
   - the delivery-wizard package tree, which follows automatically through the tokens

   The old separate marker green (`--gmi-delivery-gml-marker`) and the unused `-soft` tokens are removed. Pill and option edges are derived with `color-mix(fill 55%, ink)` through the scoped `--photo-delivery-edge`, so light pills stay outlined on white. Hover keeps the dark ink, because light fills are never used as text. Markers keep the white casing and the dark `#172b3a` outline, and the lens takes the dark ink in delivery mode. The general teal and the Validator severity colours are unchanged. The "Krever gjennomgang" (`#b06a08`) and "Ulike leveringsvalg" (`#64748b`, dashed) states keep their existing colours.
2. **Colour mode and provenance.**
   - **Main map:** markers are always coloured by delivery choice. Each FOTO layer's saved entries are read once per session publish, not per marker. The main legend shows GMI / GML / Ikke / Ulike.
   - **Inside FOTO:** "Plasseringskilde" remains. It now shows the *original* source. A manual adjustment of a sourced position stores `origin` on the accepted `spatial.current`; `basis` stays `{kind:'manual'}`. A moved GMI point stays GMI, and only a photo placed by hand from scratch is "Manuell". Staged moves carry the same origin.
   - **Edit target:** the marker now receives the active colour mode and delivery status, including the Slice 1 GML proposal. Previously it ignored the mode and showed the provenance blue, then Manuell orange after a move. Selection and editing are shown only by the larger icon, the ring, the staged dot and the edit outline.
   - **List, inspector and filter:** all three use the same provenance. The row reads "GMI · justert" and the inspector chip and "Kilde" read the same. The "Plasseringskilde" filter and its counts follow provenance, so list, map colour and filter agree.
3. **Persistent click preview (FOTO only, browse mode).**
   - A marker click (or Enter/Space) still selects the occurrence, including stack cycling. It now also opens a small persistent popup with the image, the filename, "plassering i av n" for shared photos, a Close button (`XIcon`, "Lukk bildeforhåndsvisning") and the existing `PhotoDeliveryCycleButton`.
   - The pill calls the page's existing per-occurrence `toggleWorkspaceDelivery`, which is proposal-aware, so one click changes exactly that occurrence: GMI → GML → Ikke → GMI. An ordinary marker click never changes delivery, and siblings are never written.
   - The popup closes with X (focus returns to the marker), with Escape, on entering Edit mode, when the selection is cleared, or when the selected occurrence leaves the map (filter or delivery change). Clicking another marker moves it. A map click does not close it.
   - It uses its own popup class, so the unchanged hover thumbnail, with its 250 ms delay and its rule that a main-map viewer popup suppresses hover, still behaves as before in both workspaces. Outside FOTO the main-map viewer popup is unchanged.
4. **Filters.**
   - "Plassering" is renamed "Plasseringskilde" and "Samlet levering" is renamed "Leveringsvalg". These match the "Farge etter" options and separate position source from delivery destination.
   - The nine delivery options are consolidated to the pill vocabulary: Alle, GMI (`keep-link`), GML (`gml` = overføres + uten lenke), Ikke (`not-delivered` = ikke med + ikke valgt), Delvis med (shared photos with mixed choices) and Gjennomgå (shown only while something needs review). The finer status keys stay valid filter values programmatically.
   - The filter summary prefixes "Kilde: …" and "Levering: …", so "GMI" never reads ambiguously.
   - "Mangler" and "Annet" (shared photo, work list and Endret) are unchanged. No prose was added.
   - Counts, list, map visibility and Slice 1's no-pin rule for delivery mismatches stay consistent.
5. **Layer card.** The "Bildemodul" text button is replaced by a `PhotoIconButton` with Phosphor `ImageIcon` (Regular, 14 px, the 22 px `layer-card-icon-button`). Its accessible name is "Åpne FOTO" and its tooltip is "Åpne bildemodul". The entry behaviour and the count/status line are unchanged.

## Implementation decisions

- **Provenance storage.** `origin` is presentation and filter metadata only. It never feeds a position, export, delivery decision or snapshot key. It is omitted for hand placements from scratch, so no field is invented. The hover thumbnail's dot and the marker's text label keep the current basis.
- **Preview is browse-only.** In Edit mode the selected marker is the drag handle, so a popup there would compete with dragging. Edit mode closes the preview and does not reopen it.
- **Overlapping markers.** Stack cycling is unchanged. The preview always shows the currently selected member, and its pill changes only that member.
- **Contract changes (deliberate, approved design).** Old palette values, "Manuell after a move", "main map uses provenance dots" and the old filter labels were asserted in existing tests. These assertions were updated to the new contract with equivalent coverage:
  - `photoMarkerProvenanceUi` gained a no-GPS `hand.png` placed by map click, so all four sources (EXIF/GMI/GML/Manuell) are still exercised.
  - The marker source-contract guard now checks that the marker click handler only selects, and that delivery is reachable only through the preview's cycle pill.
- **AGENTS.md.** The FOTO delivery colour bullet is updated to the approved palette. It previously documented the retired values and the removed marker token.

## Exact changed files

Application:
- `src/app/globals.css`: delivery tokens.
- `src/app/page.js`: passes `onToggleDelivery` to the map workspace.
- `src/components/MapInner.js`: passes the colour mode and delivery to `PhotoEditLayer`.
- `src/components/MapLegend.js`: delivery legend on the main map.
- `src/components/photos/PhotoMarkersLayer.js`: main-map delivery colours, provenance colours, click → select + preview, `WorkspacePreviewPopup`.
- `src/components/photos/PhotoWorkspaceMapPreview.js` (new): preview content.
- `src/components/photos/PhotoEditLayer.js`: the edit target follows the colour mode and delivery.
- `src/components/photos/PhotoMapPopup.js`: exports `useDisplayPreview`.
- `src/components/photos/PhotoMapDisplayCard.js`: shared `photoDeliveryLegendItems`.
- `src/components/photos/PhotoWorkspaceCollection.js`: legends, optional review option, provenance row label.
- `src/components/photos/PhotoWorkspaceInspector.js`: provenance source chip and "Kilde".
- `src/components/photos/PhotoLayerCard.js`: icon entry.
- `src/components/photos/photoWorkspace.css`: pill, option and edge rules; preview popup styles.
- `src/lib/photos/photoSpatial.mjs`: `photoPositionOriginKind`; `origin` on manual adjustment.
- `src/lib/photos/photoEditSession.mjs`: staged `origin`.
- `src/lib/photos/photoMarkerPresentation.mjs`: palette, `PHOTO_DELIVERY_INK`, `photoPositionProvenanceKind`, `photoPositionAdjusted`, dark lens.
- `src/lib/photos/photoWorkspaceView.mjs`: provenance placement kind, `gml` filter, prefixed summaries.
- `src/lib/photos/photoWorkspaceState.mjs`: `gml` filter key.
- `src/lib/photos/photoDeliveryIntent.mjs`: consolidated `PHOTO_DELIVERY_FILTERS`.
- `AGENTS.md`: palette bullet.

Tests:
- New: `tests/photoMapInteractionSlice2.test.mjs` (7 Node tests) and `tests/photoMapInteractionSlice2Ui.test.mjs` (production browser).
- Updated Node tests: `photoDeliveryPlanning`, `photoDeliveryIntent`, `photoDeliveryDefaults`, `photoWorkspaceView`.
- Updated browser tests: `photoMarkerProvenanceUi`, `photoDeliveryDefaultsUi`, `photoDeliveryIntentUi`, `photoDeliveryExclusionUi`, `deliveryWizardUi`, `photoWorkspaceEditUi`, `photoWorkspacePass1dUi`, `photoWorkspaceStacksUi`, `photoDirectionUi`, `gmiPhotoAssociationsUi`, `gmiPhotoPlacementsUi`, `photoExportFlowUi`, `photoExportReturnUi`, `photoManualPlacementUi`, `photoSpatialUi`, `photoWorkspaceUi` and `helpers/photoSourceWorkflow.mjs`. These changes are limited to the label "Bildemodul" → "Åpne FOTO", the new colour values, provenance "X · justert" instead of "Manuell" after a move, and the new filter labels. No assertion was weakened without equivalent coverage.

Report: this file.

## Verification

Passed:
- New Node tests (`photoMapInteractionSlice2.test.mjs`): 7/7. They cover:
  - provenance through repeated moves, staged overlays and hand placement;
  - marker fills in both colour modes across plain/selected/editing/staged/sibling states and both display modes;
  - the main-map and edit-layer wiring;
  - the preview content contract;
  - destination filters, counts and pinning;
  - the layer-card entry.
- Photo and delivery Node suites (`tests/photo*.test.mjs`, `tests/delivery*.test.mjs`): 809 pass, 0 fail, 92 skipped (browser tests without a server).
- Full serial Node run: **2277 tests, 2137 pass, 1 fail, 139 skipped.** The failure is the known pre-existing `validationV2GmiA7` "Validator exposes only the automatic V2 workflow" (an outdated `aria-label="Lukk Validator"` contract from `d839ea7`; this task touches no Validator file).
- `npm run build`: exit 0, twice. The second build, after the inspector change, was used for all browser runs.
- Production browser on port 3217, serial:
  - `photoMapInteractionSlice2Ui` passes. It covers:
    - computed pill fill, ink and edge, with contrast ≥ 4.5;
    - marker and legend fills;
    - click → select and preview without a delivery change;
    - GMI → GML → Ikke → GMI from the preview with the shared sibling untouched;
    - another marker updating the preview, Escape, and X with focus restore;
    - a delivery change under the "GMI" filter removing the row, the marker and the preview at once, with GML/GMI counts updated;
    - the edit lifecycle in both modes (provenance blue kept while staged, delivery mode showing the GML proposal, discard, save → "GMI · justert", and the "Kilde: GMI" filter still including it);
    - the preview inside the map with no horizontal overflow at 1280×720 and 1366×768;
    - main-map delivery fills and legend, the icon entry, and the unchanged main-map viewer popup.
  - All 32 photo, delivery and wizard browser suites: the first full run surfaced the expected contract assertions (old colours, "Manuell", the "Bildemodul" selector, the main-map provenance dots). After the updates, the 13 affected suites were rerun: **104 tests, 98 pass, 2 fail, 4 skipped.** The 2 failures are the pre-existing `photoWorkspaceStacksUi` "counts" subtest and its parent. The other 19 suites passed in the first run.
- ESLint on all changed or new JS/MJS files except `MapInner.js`: exit 0. `MapInner.js` reports the same 8 errors and 4 warnings at HEAD (`react-hooks/refs` on lines this task does not touch); there are no new problems.
- `git diff --check`: exit 0. The new untracked files were checked separately for trailing whitespace.
- Screenshots inspected (preview at both sizes, edit-mode delivery colour, main map with legend and icon entry): `C:\Users\GEMINI~1\AppData\Local\Temp\claude\48e85b8705b14ab6\0b238f8f-a4b9-485e-99d0-03b078fbfe8c\scratchpad\shots\`.

Pre-existing or transient (not regressions):
- `photoWorkspaceStacksUi` expects `^7 bilder · 8 plasseringer$` but now gets an extra "GMI 8 / GML 0" line, which was added in `94e1bf5`. It was recorded in Slice 1 and this task does not touch it.
- `photoImportWizardUi`: one computed-colour sample of the "Opprett fotolag" button read `rgb(15, 25, 45)` instead of navy during the full run. It passed on the rerun. The file and its CSS are untouched; this is most likely sampled during a colour transition. Recorded, not investigated further.

## Remaining limitations and manual acceptance

- `origin` lives in session memory like the rest of the photo state; there is no persistence change. Photos moved before this change (in a live session) have no origin and still read "Manuell".
- The preview is FOTO browse-mode only. In Edit mode the selection is the drag handle.
- When a delivery change makes the selected occurrence leave the filtered map, the preview closes (consistent with Slice 1). It does not reopen by itself.
- The delivery-wizard package tree uses the new fills with dark ink. Its borders equal the fill, as before; the derived edge was not extended there.
- No real-file run was performed. Manual acceptance with the real 5 GMI + 9 GML delivery:
  1. Main map: GMI markers light blue, GML light green, Ikke light grey; the legend agrees; the layer card shows only the image icon ("Åpne bildemodul" on hover).
  2. In FOTO, click a GMI marker: the preview opens, and the list and inspector select it. Click the pill three times (GML, Ikke, GMI): only that placement changes. Escape closes the preview; hovering other markers still shows the small thumbnail.
  3. Switch to "Plasseringskilde", enter "Juster plassering og retning", drag a GMI photo and save: the marker stays GMI-blue and the row reads "GMI · justert". In "Leveringsvalg" it is GML.
  4. Filter "Leveringsvalg: GMI", then change the selected photo to GML from the preview: the photo leaves the list and map at once, and the counts update.

## Git and process status

- Branch `feature/photo-workspace`, HEAD `c7c2241` (unchanged).
- 40 tracked files modified, plus 3 new files (`PhotoWorkspaceMapPreview.js`, two tests) and this report.
- Nothing was staged, committed, pushed or deployed.
- The production server started for this task on port 3217 was stopped. No other servers were started.
- Logs are in the session scratchpad: `build.log`, `build2.log`, `slice2ui.log`, `prov.log`, `browser-all.log`, `browser-rerun.log`, `node-all.log`, `node-photo.log`.
