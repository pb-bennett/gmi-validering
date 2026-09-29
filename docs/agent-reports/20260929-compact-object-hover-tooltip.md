# Compact object hover tooltip

## Scope

Added a small delayed identity tooltip to the existing semantic GeoJSON features. It supplements the existing click popup and inspection tools. The layer highlight casing remains non-interactive, and no geometry or markers were duplicated. Branch: `feature/compact-hover-tooltip`, based on `5398a9c`.

## Formatter

`getFeatureHoverLabel` and `getFeatureHoverParts` are pure helpers using canonical top-level feature properties. Both GMI and SOSI map features expose these properties. The helper accepts either a GeoJSON feature or a properties object. It returns `null` when no useful identity is present. `getFeatureHoverColor` reads the currently stored colour for the feature's owning layer.

## Line field priorities

`S_FCODE` and `Dimensjon` form the leading segment, followed by `Material` and `Anleggsår`: `VL 32 · PE · 2022`. Missing fields are omitted. No nested SOSI source group is guessed at tooltip time.

## Point field priorities

`S_FCODE` identifies the point. A distinct `Type` follows when useful; when no code exists, `Type` can identify a point by itself. Then come `Bredde`, `Material`, and `Anleggsår`. A `Type` equal to the code apart from case is suppressed. Generic SOSI annotation, operations, and symbol records are suppressed.

## Missing-value handling

Null, undefined, empty text, `NaN`, nonfinite numbers, `n/a`, and dash placeholders are omitted. Numeric zero is retained deliberately. An object without identity yields no tooltip. Text uses DOM `textContent`, so source strings cannot become HTML.

## Hover delay

One controller owns one 500 ms timer and one active feature reference. Mouseout cancels pending display or immediately hides a visible tooltip. Entering a different feature hides the previous tooltip and restarts the timer. A stale mouseout from the old feature cannot cancel the new hover. No timer is created per feature.

## Positioning/rendering architecture

One Leaflet tooltip instance is created under `MapContainer`. Line hover captures the geographic mouse position at entry; points use the marker's geographic anchor. The tooltip remains at that location until hidden. Leaflet positions it with a 10 px offset and handles its normal map-edge behavior. It uses an 11 px font, 14 px line height, 4 px by 6 px padding, subtle border and shadow, 4 px radius, and a 260 px maximum width with ellipsis. Leaflet's tooltip pane keeps it above geometry and below standard map controls.

## Layer identity cue

An uploaded feature gets a 6 px dot from its owning layer's current `highlightStyle.color`. The colour is read from the store when the tooltip appears, so edits in Lagmarkering apply to the next hover even if `highlightAll` is off. The feature's `_layerId` selects its own colour independently of layer order. Legacy features have no dot.

## Interaction isolation

Hover handlers are attached only to rendered, interactive semantic features, alongside their existing click and popup handlers. The tooltip uses Leaflet `interactive: false` and CSS `pointer-events: none`. Measure mode does not attach the hover handlers. Existing point and line visibility rules continue to govern whether the semantic layer receives pointer events. The casing remains `interactive={false}`.

## Sidebar layer colour indicator

Added an 8 px circular dot between each layer visibility checkbox and filename in the sidebar's `LayerPanel` row. It reads `getLayerHighlightStyle(layer, layerId).color`, preserving explicit user edits and the map's stable fallback for older layers. The dot has no button or focus behavior, includes a subtle border and colour title, and stays visible when `highlightAll` is off. Each row is keyed by its `layerId`, so reordering moves the colour cue with its dataset. Existing filename truncation, counts, visibility, zoom, delete, and disclosure controls remain in place.

## Map movement behaviour

Map `movestart`, `dragstart`, and `zoomstart` cancel pending or visible tooltips. GeoJSON remounts and data overlay visibility changes also clear a tooltip. A later hover uses the normal delay.

## Tests

The tooltip regression run passed 51 tests across formatter/hover behavior, popup content, layer order, highlight halo and panel, line styling, profile analysis, and SOSI canonical mappings. After adding the sidebar indicator, the focused layer panel/order/highlight run passed 17 tests. Coverage verifies stored and edited colours, highlight-off state, distinct layers, reorder association, fallback colour, and existing row controls. `git diff --check` passed. ESLint on touched code found no new findings; it still reports 8 pre-existing render-time ref errors and 4 existing warnings in `MapInner.js`. Production build was not run.

## Manual acceptance

No interactive browser session or loaded real GMI + SOSI comparison scene was available in this run, so visual and pointer acceptance remains unverified manually. The automated tests cover the formatter and state transitions; the real-scene checks should confirm size, pointer behavior, overlapping layer order, popup clicks, and pan/zoom clearance.

## Files changed

- `src/lib/map/featureHoverLabel.mjs`: canonical formatter and layer-colour lookup.
- `src/lib/map/featureHoverController.mjs`: single delayed hover controller.
- `src/components/MapInner.js`: semantic event wiring and Leaflet tooltip lifecycle.
- `src/components/LayerPanel.js`: sidebar layer colour indicator.
- `src/app/globals.css`: compact tooltip styling.
- `tests/featureHoverTooltip.test.mjs`: formatter, timer, colour, and wiring coverage.
- `tests/layerHighlightPanel.test.mjs`: sidebar colour and row control coverage.
- `docs/agent-reports/20260929-compact-object-hover-tooltip.md`: this report.

## Final repository state

No commit or push was made. `data/usage/aggregates.json` remains a pre-existing local modification and was not edited, restored, staged, or cleaned. `REF_FILES/` was not touched. The feature implementation and report remain uncommitted in the worktree.
