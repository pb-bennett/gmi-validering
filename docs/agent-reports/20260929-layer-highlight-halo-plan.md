# Layer highlight halo plan — 2026-09-29

## Objective

Make uploaded dataset identity an optional, adjustable casing around the existing 2D VA symbology. The semantic line or point symbol remains the front mark; the layer colour appears outside it. This is an audit and implementation plan only. The checked-out branch is `feature/layer-highlight-halo` at `a006ebe` (`Handle transient terrain service failures`).

## Current layer-colouring architecture

`src/lib/store.js` owns `layers`, `layerOrder`, the `layerTemplate.highlightAll: false` default, `addLayer`, `removeLayer`, `toggleLayerHighlightAll`, and the generic `updateLayer`. The toggle is per uploaded layer. `src/components/LayerManager.js` maps `layerOrder` to `LayerPanel` components. `src/components/LayerPanel.js` places a star-shaped `Marker alt i laget` / `Skru av laghighlight` button in the expanded layer's **Analyse** toolbar. There is no colour picker, opacity, spread, reset, or stored per-layer colour. `src/components/Sidebar.js` hosts `LayerManager`.

`src/components/MapInner.js` owns `LAYER_HIGHLIGHT_COLORS` (`#00E5FF`, `#FF6B6B`, `#51CF66`, `#FFD43B`, `#845EF7`, `#FF922B`, `#20C997`, `#339AF0`, `#F06595`, `#ADB5BD`). Its `layerHighlightStates` memo maps each layer ID to `highlightAll` and the palette colour at its current `layerOrder` index. A second `layerHighlightColors` memo is built but has no consumer. Thus the switch is per layer, while colour is globally derived from order. Deleting a layer removes it from `layers` and `layerOrder`, so later layers shift palette colours. There is no reorder action or drag handle in `LayerManager`; any future reorder would also shift colours. New uploads append and start with highlight off.

Zustand persistence in `src/lib/store.js` stores `settings`, `ui`, and `lastActive`, but excludes uploaded `layers`, `layerOrder`, and `data`. A toggle survives ordinary React rerenders while its layer remains in memory, but neither files nor their highlight state survive a page reload. Persisted `ui` may retain unrelated map display preferences; it cannot restore an uploaded layer. The colour currently assigned to a layer is recomputed, never saved or edited.

## Current rendering flow

`MapView` dynamically loads `MapInner`. `MapInner` subscribes to store `layers`, `layerOrder`, data, filters, analysis, and selection. `layerDataForGeoJson` extracts visible data and filter arrays. `geoJsonData` projects source coordinates to WGS84 and appends each visible layer in `layerOrder`, with **lines then points** for each source. It creates only `LineString` and `Point` features and puts `_layerId`, index, feature type, and layer filter values in their properties. There is no polygon rendering path in this conversion, so the current layer-colour feature does not affect polygons. Legacy single-data mode has no `_layerId` and no layer highlight.

One React Leaflet `GeoJSON` within the `Data` overlay uses `lineStyle`, `pointToLayer`, and `onEachFeature`. `onEachFeature` binds the semantic popup and click handling to the primary feature layer, including measurement handling. Filters can make a line invisible with `weight: 0`/`opacity: 0` or return an invisible, non-interactive point marker. Layer visibility excludes the whole source from the feature collection; the `Data` overlay can hide all features. `styleVersionKey` includes filter, selection, analysis, layer-toggle, and `mapUpdateNonce` values and is part of the `GeoJSON` React key, so such changes can remount all feature paths and markers. `geoJsonDataKey` tracks visible source identities/counts. Colour/opacity/spread additions must enter the style update mechanism without needlessly reprojecting or remounting on every slider tick.

The layer toggle is currently treated as an ordinary highlight. For lines it sets `isHighlighted`, adds four pixels to weight, and replaces the semantic colour with the layer palette colour unless another highlight wins. For points it enlarges the SVG marker and replaces its outline (and in some symbols interior strokes/fill) with the layer colour. In profile analysis with a selected pipe, `lineStyle` returns early and ignores layer highlighting entirely. `MapLegend` has no layer identity entries.

## Existing semantic line/point styling

`src/lib/map/lineStyle.mjs` is the shared **2D** line colour/dash helper. Its consumers are `MapInner` and `MapLegend`; `tests/lineStyle.test.mjs` checks both. `MapInner` supplies `getColorByFCode`, whose table and fallbacks live in that component. Current line semantics:

| Code | Top stroke | Dash |
|---|---|---|
| VL | `#0101FF` blue | solid |
| SP | `#02D902` green | solid |
| SPO | SP green | adaptive equal dash and gap |
| AF | `#ff0000` red | solid |
| AFO | AF red | adaptive equal dash and gap |
| OV | `#2a2a2a` dark | solid |
| DR / codes containing DR | brown (`#8B4513` for DR) | fixed `5, 5` |
| Unknown/missing | purple `#800080` for unknown string; grey `#808080` for absent code | solid unless code contains DR |

`getLineWeight` in `MapInner` reads `Dimensjon` and several aliases: absent = 3 px; dimensions ≤50/100/200/300/500 mm = 1/2/3/4/6 px; above 500 mm = 8 px. Normal highlight currently adds 4 px, yielding at most 12 px. Profile analysis selected pipe uses 8 px and opacity 1; non-selected lines of that analysis layer use 2 px and opacity 0.3; lines from other layers use base weight and opacity 0.9. The default non-highlight opacity is 0.9. `getOverflowDashArray` uses `clamp(finalWeight × 2.5, 5, 24)` for **both** dash and gap, so a normal 600 mm AFO is 8 px with `20, 20`; currently layer-highlighted it is 12 px with `24, 24` (capped). Keep this helper and pass the actual final top weight, including analysis/selection branches.

Other highlighted line states include code, type, feature ID(s), and field-value hover. They currently use a cyan top stroke, weight +4, opacity 1, and a `shadowBlur` option; layer-only highlight also enters that branch. The proposed change removes only layer identity from this shared highlight calculation. Existing selection emphasis can stay as a separate front treatment; preserve its current precedence and note that `shadowBlur` is not a documented Leaflet path style, so the visible guarantee is the cyan/thicker stroke. `MapLegend` renders the point symbol list and all shared 2D line entries, including AFO/SPO samples; its cyan `Markert objekt` entry describes object selection. Profile/incline chart graphics in `InclineAnalysisModal` use their own SVG graph styles, not this map line renderer. `AnalysisPointsLayer` adds separate orange/red profile markers and a yellow hovered segment in `markerPane`; these are analysis aids, not uploaded layer objects. The 3D viewer uses independent `src/lib/3d/colorMapping.js` and solid tubes; 2D halo work does not automatically change 3D.

Points are Leaflet markers with `L.divIcon` SVGs generated by `createSvgMarker` in `MapInner`. `getCategoryByFCode` chooses distinct circle, square, triangle, diamond, hexagon, small dot, rectangle, and other shapes; `getColorByFCode` supplies semantic colour. Examples: VL circle blue, SP square green, OV triangle dark, KUM hexagon red, DR diamond brown, LOK small filled magenta dot. Most symbols have white fill and coloured outlines; SAN, SLS/SLU, KRN, and other special symbols have internal details. Sizes vary from 8 px LOK through 20 px KUM; highlighted symbols gain 6 px. The SVG is in `markerPane`, which is above ordinary line paths in `overlayPane`.

## Problem with colour replacement

With `highlightAll` on, the layer colour replaces blue/green/red line meaning, increases line width, and changes point outlines. Two unrelated meanings share a single colour channel. A cyan layer can look like selected objects; red/orange/green palette entries collide with VA codes. Profile analysis may abruptly remove the layer colouring because its line branches return early. Removing the first layer changes every later layer's assigned colour. The UI calls this a highlight but gives no clue that it replaces normal VA colours.

## Recommended rendering architecture

Keep the existing interactive `GeoJSON` as the sole owner of semantic lines, point markers, popups, clicks, and measurement. Add one **line-only, non-interactive** GeoJSON underlay referencing the same projected feature objects (or a lightweight filtered feature collection of line references) when at least one visible layer has highlighting enabled. Put it in a dedicated Leaflet pane around z-index 390, below Leaflet's default `overlayPane` (400) and `markerPane` (600), but above tiles. The underlay pane and paths should reject pointer events (`interactive: false`, pane `pointer-events: none` where appropriate); do not bind `onEachFeature` or popups. Group it under the same `Data` overlay so that the overlay switch hides both. Avoid creating a second coordinate projection or parsing pass. If no highlighted visible lines, omit the underlay entirely. Keep data-feature keys stable where possible; update styles via `setStyle` or focused layer update instead of remounting both large GeoJSON trees for every slider movement.

Architecture comparison:

| Option | Fit here | Main issue |
|---|---|---|
| Individual duplicate `Polyline` per line | Uses Leaflet paths | Rebuilds many React elements, IDs and filtering by hand; poorly aligned with the existing GeoJSON pipeline. |
| Separate line-only `GeoJSON` | Best match to existing projected features and style callback | Adds one SVG path per highlighted line and must mirror visibility/fading. |
| Pane only | Establishes reliable vertical order for a path | A pane cannot draw casing by itself; use it with the separate GeoJSON. |
| CSS blur/glow or shadow | No extra geometry | Blurs edges, obscures semantics, cannot reliably preserve dashed gaps. |

An imperative `L.geoJSON` equivalent is possible if profiling shows React Leaflet remount costs dominate, but it introduces manual lifecycle code. Start with the separate GeoJSON plus pane. There is no existing general casing mechanism to reuse. Do not use CSS filters. Do not change canonical GMI brand tokens to create dataset colours.

## Line halo design

Compute the **final semantic style once** for each line, including visibility, selection, analysis weight/opacity, and `dashArray`, then derive the underlay from it. A small pure resolver would prevent normal and analysis branches from diverging. Its semantic return must match today's appearance when layer highlighting is off, except for the intended removal of layer-only colour substitution when the feature is on. The casing uses the configured layer colour, `fill: false`, `opacity` from the layer setting scaled by feature visibility/fade, and `weight = finalSemanticWeight + spread`. No independent dimension parsing in the halo path.

Proposed spread is **total extra stroke width**, so each exposed side is `spread / 2`. Default 4 px, control range 2–8 px in 1 px steps. A normal 3 px line gets a 7 px casing (2 px visible per side); an 8 px 600 mm line gets 12 px casing (also 2 px per side); a 12 px selected line gets 16 px casing. This avoids a multiplicative halo on large pipes. Hide the halo when the semantic line is hidden, filtered out, or its final weight is zero. Selection retains priority: order is layer casing, semantic stroke, then the existing selected/active top emphasis (currently expressed as a thicker/cyan semantic path; a future separate selection overlay could sit above both). Derive casing width from that selected top weight so selection does not bury the casing. No casing for legacy single-data mode unless it is represented as an uploaded layer.

Default casing opacity: **0.55**, with user-facing `Styrke` at **20–80%** in 5% steps. Only underlay opacity changes. For ordinary lines, a 0.9 semantic opacity remains 0.9. For faded analysis lines, use a proportional factor: e.g. `haloOpacity = configuredOpacity × (semanticOpacity / 0.9)`, clamped to 0–1; a default 0.55 casing becomes about 0.18 when the top is faded to 0.3. Selected analysis lines may use full configured casing strength. This avoids a fixed bright halo around deliberately faded lines. Use the same visibility predicate for both paths rather than depending on a transparent casing, to reduce useless DOM work where practical.

## Dashed-line handling

| Approach | Result |
|---|---|
| Copy the semantic `dashArray` and dash offset | Recommended: both top stroke and casing are absent in each gap, with the layer colour visible only beside painted dash segments. |
| Continuous casing | Makes AFO/SPO look nearly continuous at 8–12 px and can hide the intended overflow distinction. Reject. |
| Alternate masked/offset casing | Could preserve gaps but adds SVG masks, renderer coupling, and alignment risk for little gain. Defer unless the copied dash is inadequate. |

Apply the same dash treatment to drainage. Copy the **already computed** top dash lengths; never recalculate using casing width. Align dash origins and offsets on identical geometry, and use `lineCap: 'butt'` for dashed casing to keep wide rounded casing caps from closing the gap. Preserve top line cap/style and the existing adaptive AFO/SPO helper. Check 600 mm AFO at 8 px/`20, 20`, with casing 12 px and opacity 0.55, as well as selected/highlighted 12 px/`24, 24` and faded analysis 2 px/`5, 5`. At small 5 px gaps, reduce spread or apply a tested cap rule if gaps appear closed at target zoom; do not change semantic dash logic in this task.

## Point halo design

Extend the existing SVG **inside the same divIcon**, adding a translucent layer-colour outer ring/background outline behind the current shape while leaving semantic strokes, fills, and internal details intact. One marker retains one popup, click target, anchor, and z order; this avoids thousands of duplicate markers and avoids adding an interactive point underlay. Allocate a larger SVG view box/iconSize and recenter the existing symbol so the ring is not clipped and the marker stays at the same geographic coordinate. Use a consistent 2–3 px outer ring/gap based on the same `Bredde` setting but cap point spread to protect 8–12 px LOK/DIV/ANBORING/GRN markers. For circles, squares, triangles, diamonds, hexagons, and the rectangular GRØKONSTR, trace the outer symbol silhouette when feasible; a neutral circular backplate is an acceptable common fallback only if manual review shows it does not confuse shape meaning. LOK's filled dot needs an outside annulus, and selection's current larger/cyan marker must still be clearly distinct. Compute point opacity from the layer strength; do not change the inner semantic colour. If SVG structure becomes too complex, a non-interactive background marker in a lower pane is a fallback with higher DOM cost and anchor/order risks.

## Selection and analysis states

`MapInner` combines code, type, single/multiple feature IDs, and field hover into `hasOtherHighlight`; layer identity currently shares that branch. After splitting, `highlightAll` must not set `isHighlighted` or the top colour. Existing selection/hover may continue to make the top cyan and +4 px; its halo remains behind and follows the final width. For points, keep the selected symbol enlargement and cyan treatment in front of the dataset ring. The legend's `Markert objekt` remains a selection cue, not a layer key. Popup and click handling stay on the primary GeoJSON layer only. `FeatureHighlighter`, map centering, measure mode, and profile analysis should never find/select the underlay as an independent object.

Profile analysis needs explicit mirroring: selected pipe 8 px/opacity 1; other same-layer pipes 2 px/opacity 0.3; other layers base width/opacity 0.9. The casing must follow each branch and be faint for the 0.3 case. Hidden code/type/field filters, missing-field filtered IDs, outlier suppression, layer visibility, and Data overlay visibility must remove or hide both marks together. Point markers currently do not fade in this profile selection branch; do not introduce a point fade only for halo. Analysis graph/terrain hover overlays remain independent and above source paths.

## Layer controls

Move the star action concept from the **Analyse** row into a compact **Lagmarkering** disclosure within each expanded `LayerPanel`. Keep the layer header geometry and primary visibility checkbox unchanged. The expanded setting surface should show an accessible on/off switch, current colour swatch, and a brief explanation: `Farge viser hvilket lag objektet kommer fra`. When enabled, show `Markeringsfarge` colour input, `Styrke` percentage slider with numeric value, `Bredde` pixel slider with numeric value, and `Nullstill`. Disable or hide the adjustment controls when off; retain their configured values when toggled off. A per-layer reset restores default colour/55%/4 px and keeps the current on/off choice (or clearly label an all-settings reset if it also disables); document the behaviour in the control. The existing `Nullstill filtre` is separate and must not reset halo settings. No global layer toggle is currently present; one is not needed for the requested optional feature.

## Default palette

Existing palette begins with cyan but then red and green, which collide with AF/SP; yellow/orange also have poor separation from common VA colours. `src/app/globals.css` defines brand cyan `#53EAFD`, but brand tokens are a separate design system and should stay unchanged. Recommend a small **dataset-only** palette: cyan `#00BFD8`, fuchsia `#D946EF`, violet `#8B5CF6`, amber `#EAB308`, teal `#14B8A6`, slate `#64748B`, cycling only when necessary. Cyan/fuchsia come first for the new GMI vs existing SOSI case. Fuchsia can overlap the uncommon LOK/fjernvarme semantic magenta, so the ring shape and separate layer key matter; verify all candidates on Kartverket Topo and Gråtone at 20–80% strength and with blue/green/red foregrounds. Avoid obvious blue/green/red layer defaults. Allow the user to choose any valid hex colour. Assign a default once at upload from a deterministic sequence of currently used default slots (or a session palette index), store it on that layer, and never recalculate surviving colours after deletion. Repeated colours after more than six layers are an admitted limit; extend or add patterns only if real usage requires it.

## State model

Keep the existing `layer.highlightAll` boolean as the enabled flag to avoid a migration and a competing toggle. Add one sibling `layer.highlightColor` (hex), `layer.highlightOpacity` (number 0–1), and `layer.highlightSpread` (total extra px), or group just the three settings under `layer.highlightStyle` if repository conventions prefer it. Prefer a single `layer.highlightStyle` object with `color`, `opacity`, `spread`, while retaining `highlightAll`: it makes atomic updates and reset straightforward. Initialize at `addLayer`, validate/clamp updates in dedicated store actions, and provide a fallback for any in-memory layer lacking fields. `updateLayer` is generic but the control should use focused actions. Keep colour stable through visibility changes, rerenders, and removal of other layers. Removing a layer drops its settings with the layer. New uploads start off with assigned defaults. No browser-storage migration is needed because layers are not persisted; if durable per-layer settings are later requested, persist a separate file identity mapping with privacy and collision handling, outside this change.

## Multiple-layer ordering

Feature collection order is upload/`layerOrder` order: each visible layer's lines then points. There is no active selected-layer draw promotion or reorder UI. Underlay pane below the semantic overlay means **all** semantic lines draw above **all** casings; point divIcons in `markerPane` draw above both. Within each pane, later paths generally paint over earlier ones. Data overlay visibility controls both paths. Avoid `bringToFront` on the casing, which could escape the intended order. If desired for a later phase, draw the selected semantic feature in a dedicated top selection pane while leaving layer order deterministic.

For new GMI on existing SOSI at the same coordinates, two semantic paths can overlap and the later uploaded one may hide the earlier stroke. Two same-width casings can likewise hide one another, leaving only one layer colour at perfect coincidence. A common pane for casings makes this predictable but cannot reveal two identical centerlines simultaneously. Record the order in the layer key, allow visibility toggles and hover/popup inspection to disambiguate, and consider offset/striped comparison only after testing real overlap data. Do not promise that two exactly coincident lines will both be visible at once. WMS overlays have their own pane/z-index behaviour and should be checked manually; custom WMS is currently assigned z-index 450, above ordinary data paths, so it may cover a casing depending on transparency.

## Legend / layer identity presentation

Keep `MapLegend`'s point and line entries semantic: green still means spillvann, dashed still means overflow. Its existing selection indicator remains for active objects. Show layer colours as small ring/casing swatches next to names in `LayerManager`, and, if map reading requires it, a separately titled collapsible `Lagmarkering` key near or within the legend surface, populated only from visible layers with enabled highlighting. Do not inject every uploaded file into the VA type list. A key should distinguish line casing and point ring and follow visibility, user colour edits, and layer removal. In the first implementation phase, the per-layer sidebar swatch may suffice; validate that against the GMI/SOSI use case before adding a floating key.

## Performance

The current renderer is Leaflet's default SVG renderer (`MapContainer` has no `preferCanvas` or custom renderer). It already creates one SVG path per line and one DOM marker/divIcon per point. A line-only GeoJSON casing roughly doubles SVG line paths for highlighted visible sources; inline point SVG rings add markup but no marker count. Pan/zoom updates two line paths per highlighted pipe. The greater risk is `styleVersionKey` remounting all GeoJSON features on selection, hover, or every strength/width slider event, and `layerDataForGeoJson`/`geoJsonData` depending on the broad `layers` object so unrelated layer-state updates can reproject data. The implementation should keep projected feature objects stable for style-only changes, key the casing independently, and update path styles without full remount on each slider move (commit on release if necessary). Measure thousands of GMI/SOSI lines and points during pan/zoom, slider movement, visibility toggles, popup open, and analysis selection. Canvas can reduce SVG DOM count for line paths if needed, but it changes pane hit-testing and event behaviour; consider it only after measurement. SVG points remain DOM icons either way. Never process the source parser or coordinate projection twice solely to make halos.

## Implementation phases

1. **State and shared style contract.** Define layer colour/opacity/spread defaults and store actions while retaining `highlightAll`; assign stable colours on upload; split semantic line style from layer state; derive one final line style in all normal/analysis/filter branches. Preserve current off-state output and existing adaptive dashes. Add focused pure style/store tests.
2. **Line casing and point ring together.** Add the non-interactive line-only GeoJSON and pane under the Data overlay, copying computed dashes and fade. Extend the existing divIcon SVGs with an outer layer ring. Wire the existing per-layer toggle to these separate marks and remove its semantic colour/width replacement. Cover interaction, selection, filters, dashed 600 mm AFO/SPO, small point symbols, and GMI/SOSI manual comparison. Point support belongs in the same user-visible change so the feature works for the mixed infrastructure dataset.
3. **Controls and presentation.** Add the LayerPanel disclosure, colour/strength/spread/reset controls and swatch. Add a compact layer key if sidebar-only identity proves insufficient. Review coincident geometry and profile states. Profile large datasets and optimize style updates or renderer only if measured cost warrants it.

## Test plan

Existing focused coverage is `tests/lineStyle.test.mjs` for shared colours/dashes, legend samples, and MapInner wiring; `tests/mapPaneToolbar.test.mjs` and `tests/dataInspectorStacking.test.mjs` for legend/map chrome; `tests/featurePopupContent.test.mjs` for popup attachment/content; `tests/profileAnalysisActiveDataCrash.test.mjs` for profile data selection. There is no dedicated behavioural test for layer highlight, LayerPanel controls, point icon output, layer colour stability, or halo hit-testing. Existing line tests include source-text assertions that may need careful updates when extracting the style resolver.

Focused future regression coverage:

- **Off:** no underlay GeoJSON or point ring; exact current semantic VL/SP/AF/OV/DR/fallback colours, widths, opacity, dashes, markers, popup, and click behaviour. No layer identity in legacy single-data rendering.
- **Lines:** halo colour matches its layer; under semantic stroke; `finalWeight + spread` bounds; 600 mm AFO/SPO copy `20, 20` at 8 px and remain dashed; selection/analysis weights retain dash adaptation; drainage still dashed.
- **Points:** inner SVG symbol and semantic stroke unchanged for circle/square/triangle/hexagon/LOK/GRØKONSTR; outer ring fits view box, respects strength/spread, and shares one marker interaction.
- **Multiple layers:** deterministic assigned defaults, stable surviving colours after removal, visibility and Data overlay hide the associated casing, colour edits do not change semantic lines.
- **Controls/state:** per-layer on/off, colour validation, strength and spread bounds, per-layer reset, new-upload defaults, no accidental reset by `Nullstill filtre`.
- **Interactions:** casing has no popup/click/hover or measurement event; only one selected object; selection remains clear; filtered/hidden features have no casing; profile selected/faded/other-layer casing matches semantic state; map legend remains semantically separate.
- **Performance:** instrument feature conversion and component mount counts to ensure style adjustments do not reproject all data or trigger a render loop; compare pan/zoom and style edits with several thousand features. Use a browser integration check for pane order and pointer behaviour that unit tests cannot prove.

This planning task runs no tests or build.

## Manual acceptance scenarios

1. Upload existing SOSI export, then new GMI pump-station project; enable both layer markings. Confirm cyan/fuchsia defaults remain tied to those files if one layer is hidden or another is removed.
2. On Kartverket Topo and Gråtone, inspect VL blue, SP green, AF red, OV dark, drainage brown/dashed, and unknown purple under both ring colours; distinguish line meaning at ordinary and large dimensions.
3. Inspect AFO and SPO at small, medium, and 600 mm dimensions at several zooms. Confirm gaps are visibly empty of both top and casing, including selected/hovered and faded analysis states.
4. Inspect VL/SP/KUM/LOK/SAN/GRØKONSTR and small DIV/ANBORING points. Confirm source ring is visible without changing shape, inner strokes, details, geographic anchor, or popup target.
5. Turn layer marking off and compare to ordinary map symbology; adjust `Markeringsfarge`, `Styrke`, and `Bredde` and see immediate, understandable changes. Reset one layer and verify the other layer stays configured.
6. Toggle layer visibility and the Data overlay; apply code/type/field and missing-field filters; select a pipe in profile analysis. Verify corresponding casings hide/fade with their semantic features.
7. Inspect near-coincident new/existing pipes, then exact overlaps. Confirm deterministic top layer, usable hover/popup and layer key, and document any location where one source necessarily obscures the other.
8. Repeat with thousands of lines and points; pan, zoom, open popups, select analysis lines, and drag sliders while watching responsiveness and duplicate event count.

## Risks / open questions

- Exact coincident lines cannot show both complete source casings with this simple centered style. Visibility toggle and popup inspection are the immediate workaround; an offset comparison mode would be a distinct feature.
- AFO/SPO small minimum `5, 5` gaps and wide rounded caps need visual inspection. Use butt-ended dashed casing and adjust spread only if the test case requires it; preserve semantic dash calculations.
- A universal circular point ring may obscure shape identity for very small/special markers. Prefer symbol-aligned outer outlines and inspect the full category set.
- Current `onEachFeature` hidden checks are not fully identical to `lineStyle`/`pointToLayer` checks for per-layer filters; share one visibility decision when adding casing to avoid revealing filtered objects.
- Current palette includes cyan also used for selected objects, and LOK/fjernvarme are magenta. Distinct outer position, opacity, and a separate selection cue must carry meaning even where hues collide.
- Existing `styleVersionKey` causes full GeoJSON remounts for many UI changes; slider controls could make this noticeable. Profile before choosing a more invasive update strategy.
- Pane order relative to transparent WMS and analytic overlays needs browser verification. The map has no explicit per-upload render pane today.
- The requested behaviour is 2D. The independent 3D viewer will not display layer casings unless separately designed.

## Files likely to change

- `src/components/MapInner.js`: separate semantic resolution, casing pane/GeoJSON, point SVG ring, keys and visibility handling.
- `src/lib/map/lineStyle.mjs`: possibly a pure casing derivation helper while keeping semantic colour and adaptive dash functions unchanged.
- `src/lib/store.js`: per-layer style defaults, stable assignment, actions, reset.
- `src/components/LayerPanel.js`: compact Lagmarkering controls and swatch.
- `src/components/LayerManager.js`: optional layer-name swatch/key.
- `src/components/MapLegend.js`: optional separately titled layer identity key; semantic entries retained.
- `src/app/globals.css`: only if the casing pane or compact controls need scoped styles; no brand-token changes.
- `tests/lineStyle.test.mjs` plus focused map/store/component/browser tests for the scenarios above.

## Final repository state

This audit adds only this report. Source, tests, ignored `REF_FILES/`, and the pre-existing local `data/usage/aggregates.json` modification were not edited, restored, staged, or moved. No branch switch, reset, stash, clean, commit, push, tests, or build. Verification commands requested: `git diff --check` and `git status --short`; their results are reported in the final response.
