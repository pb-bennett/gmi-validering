# Layer highlight halo — core implementation

## Scope

Implemented the core 2D dataset marking described in `20260929-layer-highlight-halo-plan.md`. The existing per-layer `highlightAll` button still turns the feature on and off. Uploaded layer identity now appears outside semantic line and point marks. No colour picker, strength slider, width slider, reset action, disclosure redesign, floating layer key, 3D treatment, or change to the semantic legend is included.

## State model

`src/lib/store.js` retains `layer.highlightAll` as the only enabled flag. New layers receive `highlightStyle: { color, opacity: 0.55, spread: 4 }` when `addLayer` creates them; they still start with `highlightAll: false`. `getLayerHighlightStyle` in `src/lib/map/layerHighlight.mjs` validates colour, clamps numeric values, and supplies stable defaults for an in-memory layer lacking the new structure. The fallback colour is based on its ID, not its current order. The existing generic `updateLayer` can update the structure when future controls are added. Uploaded layers remain excluded from browser persistence, as before.

## Default layer palette

New assignments use cyan `#00BFD8`, fuchsia `#D946EF`, violet `#8B5CF6`, amber `#EAB308`, teal `#14B8A6`, and slate `#64748B`. The next upload takes the first unused palette colour; if all six are occupied, the palette cycles. The assigned colour is stored on the layer, so toggling visibility or removing an earlier layer does not recolour survivors. A newly uploaded layer can reuse a freed slot. No GMI brand token changed.

## Semantic-style separation

`MapInner` no longer includes layer `highlightAll` in its normal line/point `isHighlighted` calculation. The semantic line callback retains its code/type/feature/field highlighting, dimension-based width, selected and faded profile branches, and calls to the shared `getLineStyle`. The top stroke still uses VL blue, SP green, AF red, OV dark, drainage brown/fixed dash, and the existing fallback. AFO and SPO still inherit AF/SP colours and the adaptive overflow dashes from `lineStyle.mjs`. The layer toggle no longer thickens or recolours the top line, and it no longer enlarges or recolours the semantic point. Ordinary off-state rendering follows the same semantic branches as before.

## Line casing architecture

`MapInner` derives a line-only FeatureCollection by referencing already projected `geoJsonData.features`. It includes lines only when their `_layerId` identifies a layer with `highlightAll` enabled. No source parsing or coordinate projection is repeated for the casing, and no casing GeoJSON is rendered if the collection is empty. The casing `GeoJSON` and primary semantic `GeoJSON` both live inside the existing Leaflet `Data` overlay, so its visibility control applies to both.

A dedicated `layer-highlight-casing` pane uses z-index 390, below the default semantic `overlayPane` (400) and point `markerPane` (600), and above map tiles. The casing pane disables pointer events; its GeoJSON has `interactive={false}` and no `onEachFeature`, popup, click, or measurement handler. The semantic GeoJSON remains the only interactive object layer. The casing is a crisp Leaflet path, with no blur or shadow.

`getLineCasingStyle` receives the **final semantic style** returned by `lineStyle(feature)` and the layer settings. It sets `weight = finalSemanticWeight + spread`, so default 3/8/12 px semantic strokes produce 7/12/16 px casings. It changes only casing colour and opacity. Hidden lines with zero weight or opacity have no visible casing. This avoids a second dimension or selection-width calculation.

## Dashed-line handling

The casing copies `semanticStyle.dashArray` exactly. A normal 600 mm AFO/SPO line stays 8 px with `20, 20` semantic and casing dashes; with default spread the casing is 12 px. A normal selected/highlighted 12 px overflow line keeps the existing capped `24, 24` pattern and has a 16 px casing. Drainage copies its existing fixed `5, 5` dash. Dashed casings use butt caps to keep casing ends from closing narrow gaps. No semantic dash or weight helper was changed. Visual inspection at small zoom levels remains a manual acceptance check, especially for the minimum five-pixel gap.

## Point ring architecture

`createSvgMarker` still returns one `L.divIcon`, and `pointToLayer` still returns one Leaflet marker. When highlighting is enabled, the icon SVG gets an outer layer-colour silhouette **before** the existing semantic SVG path(s). Circle, square, triangle, diamond, hexagon, LOK dot, GRØKONSTR rectangle, and detailed square categories use corresponding outlines. Other polygon and path categories have corresponding or conservative non-circular fallback outlines. The ring uses `stroke-opacity` from `highlightStyle` and `fill="none"`; semantic stroke, white fill, filled LOK dot, and internal symbol details remain in front.

The icon canvas expands by equal padding on all sides, translates ring and semantic content together, and keeps `iconAnchor` at the new centre, so the geographic centre does not move. Padding includes extra room for the rectangular GRØKONSTR symbol. Point ring exposure per side is `clamp(spread / 2, 1, 2)` pixels: default 4 px total line spread yields a 2 px outer point ring, while large future spread values cannot overwhelm 8–12 px symbols. The selected symbol keeps its existing six-pixel enlargement and cyan semantic emphasis; the layer ring follows that larger shape. No second point marker or second popup is created.

## Selection and analysis behavior

Layer marking no longer causes the object-selection branch to activate. Existing code/type/feature/field highlights retain cyan/thicker top styling and sit above the layer casing. The casing calls the same `lineStyle(feature)` resolver used by the semantic layer, so profile analysis selected pipes take the 8 px/opacity 1 style, faded same-layer pipes take 2 px/opacity 0.3, and other layers use their normal base width/opacity 0.9. Casing opacity is configured opacity multiplied by `min(1, semanticOpacity / 0.9)`; a default 0.55 casing fades to about 0.183 when its semantic line is at opacity 0.3. Analysis point and hovered segment overlays are unchanged.

## Filtering and visibility

The casing gets the same final style callback that applies code, type, field, missing-field, outlier, profile, and feature-highlight decisions. The line collection is derived from already visible uploaded-layer features; an invisible layer contributes no line geometry. The `Data` overlay contains both line layers. The point ring is inserted only in the existing visible point marker branch; hidden/filtered/outlier points still return the invisible marker without a ring. Legacy single-data features have no `_layerId`, so they get no dataset marking. Existing popup and measurement handlers remain only on the semantic layer.

## Performance considerations

There is one additional SVG path per visible marked line, which is the expected core cost. Points add SVG elements inside existing markers and do not double marker count. Casing features reuse projected feature references and avoid a second conversion pass. Both Leaflet paths still share the existing `styleVersionKey` remount behaviour; the key includes style values so future state changes will be reflected. The broader `layers` subscription and GeoJSON remounts on UI state updates are existing performance risks. This phase deliberately avoids imperative Leaflet update machinery because no sliders are present yet. Large GMI/SOSI pan/zoom and future slider drag performance remain manual checks before control UI is added.

## Tests

Added `tests/layerHighlightHalo.test.mjs` for store defaults, cyan/fuchsia assignment, off-by-default toggles, colour stability after visibility/removal, missing-style fallback, independent casing colour/opacity/width, AFO/SPO 600 mm `20, 20` and selected `24, 24` dashes, drainage dashes, faded/hidden lines, representative point silhouettes, centred marker anchors, and non-interactive line-only wiring. Existing semantic line, legend, popup, profile, map chrome, object table, and SOSI canonical attribute tests were included in the broader regression selection.

Focused run: **11 passed, 0 failed**. A first broad run reached 45 passing tests but could not load `objectTableInspection.test.mjs` without its ESM loader. Re-running that file with the repository loader passed 15 tests. The final combined selection with `--experimental-loader ./tests/esmJsLoader.mjs` passed **60/60**. `node --check` passed for the new pure helper.

`npm.cmd run build` was attempted. It failed when `next/font` could not fetch Roboto from `fonts.googleapis.com`; this matches the repository's known external font-fetch issue. The production build therefore did not complete, and font configuration was left unchanged. No browser visual run was performed in this environment.

## Manual acceptance targets

Load the new GMI pump-station file and an existing SOSI export as separate layers; turn on the existing toggle for both. Expect cyan and fuchsia outside the features, while VL stays blue, SP green, AF red, OV dark, and AFO/SPO visibly dashed. Inspect 600 mm AFO at multiple zooms for genuinely empty gaps. Check KUM, small valves/equipment, LOK, and special rectangular/detailed points for a visible outer layer ring without changed inner meaning or shifted position. Open a popup and click a line once; casing should never respond. In profile analysis, selected pipes should remain prominent and other same-layer pipes should have faint casings. Turn highlighting off to recover ordinary semantic appearance. Hide/remove layers and confirm surviving colours stay assigned to the same file. Large datasets and exact coincident lines need browser inspection; one source can obscure another at identical coordinates.

## Deferred control UI

The existing `LayerPanel` star action remains in the Analyse toolbar. `Markeringsfarge`, `Styrke`, `Bredde`, `Nullstill`, the Lagmarkering disclosure, and a floating layer key are deferred. The new `highlightStyle` object is ready for those controls, but no user-facing editing action was added in this core phase.

## Files changed

- `src/lib/map/layerHighlight.mjs`: palette/defaults, fallback normalization, casing derivation, point-ring geometry.
- `src/lib/store.js`: per-layer style assignment at upload.
- `src/components/MapInner.js`: semantic separation, non-interactive casing pane/GeoJSON, point ring in the same divIcon.
- `tests/layerHighlightHalo.test.mjs`: focused state, style, rendering-contract and interaction tests.
- `docs/agent-reports/20260929-layer-highlight-halo-core.md`: these implementation notes.

## Final repository state

Branch `feature/layer-highlight-halo` remained checked out at `711f48a` (`Plan layer highlight halo`). The pre-existing local `data/usage/aggregates.json` change was left untouched. `REF_FILES/` was untouched. No reset, restore, stash, clean, branch switch, commit, or push was performed. `git diff --check` and final `git status --short` results are reported in the terminal response.
