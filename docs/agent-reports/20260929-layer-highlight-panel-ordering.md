# Layer highlight panel compact mode and ordering

## Scope

Added layer movement controls to the existing floating `Lagmarkering` panel and compacted that panel on laptop-height desktop viewports. The same `layerOrder` now controls panel and sidebar lists, semantic line order, line casing order, and ordinary point marker priority. Halo colours, 55% default strength, 4 px default spread, semantic VA styling, dashes, selection colours, and slider commit behaviour remain unchanged. No drag-and-drop, line offsets, new selection system, or numeric z-index UI was added.

## Existing layerOrder semantics

Before this change, `addLayer` appended uploaded IDs to `layerOrder`. `LayerManager` and `LayerHighlightPanel` displayed that array top-to-bottom, so the oldest file appeared first. `MapInner` also iterated it in that order when appending each layer's projected lines and points to one GeoJSON collection. Leaflet paints later SVG line paths above earlier paths, so the latest upload was visually in front even though it appeared at the bottom of the lists. Casings filtered the same collection and inherited its line order. Point markers were created in the same sequence, but Leaflet's normal marker z-index also depends on screen Y, so near-coincident points did not have an explicit dataset priority.

Other consumers are `MapLegend` (aggregates visible semantic categories), `getVisibleLayersData` (merges data in array order), `getVisibleLayerIds`, layer visibility/analysis loops, and a diagnostic queue count in `src/app/page.js`. They use layer IDs and source data rather than an independent z-order. Profile selection and highlighted layer state are stored by layer ID. Uploaded layer data and order are runtime-only and are not browser-persisted.

## User-facing ordering convention

The first item in `layerOrder` is now the foreground dataset and appears at the top of both `LayerManager` and `Lagmarkering`. `Flytt opp` swaps a layer with the item immediately above it; `Flytt ned` swaps with the item below. New uploads are prepended to the array, preserving the existing behaviour that the newest upload appears above older infrastructure on the map while making the lists agree with it. The panel states `Øverste lag tegnes fremst i kartet.` Visibility is independent of order; hidden layers keep their place and settings.

`src/lib/map/layerOrder.mjs` contains small pure helpers for array movement, reversed paint order, and point marker offsets. It returns the original array for invalid or boundary moves and a new swapped array for a valid move. The UI has no second map-order state.

## Store reorder actions

`src/lib/store.js` adds `moveLayerUp(layerId)` and `moveLayerDown(layerId)`. Each action changes only `layerOrder`. It does not clone or edit `layers`, raw data, filters, visibility, `highlightStyle`, assigned default colour, analysis layer ID, or highlighted layer ID. Unknown IDs and top/bottom boundary moves are no-ops. `mapUpdateNonce` is not incremented: the changed order is already observed by `MapInner`, and its GeoJSON key changes when the visible feature paint order changes. The existing palette assignment still uses each layer's reserved `defaultHighlightColor`, so movement cannot recolour files.

## Semantic line order

`MapInner` converts the front-to-back `layerOrder` to a bottom-to-top `paintOrder` before assembling its projected GeoJSON. The primary semantic GeoJSON therefore appends lower datasets first and higher datasets last; Leaflet paints the foreground line above an overlapping lower line. The path style callback, feature IDs, popups, filters, pipe dimension widths, and `getLineStyle` remain untouched. AFO/SPO adaptive dashes and drainage dashes are unchanged. Exact same-coordinate lines still cannot both be fully visible at once, but moving a layer now predictably changes which one is seen.

Reordering changes feature order and remounts the existing GeoJSON once. `fitBoundsKey` now sorts source IDs before constructing its identity string, so a reorder does not refit or move the user's current map view. The map keeps a per-layer cache of already projected feature objects, keyed by the source data and filter-array references. Reordering reassembles references in a new order without reparsing or reprojecting source coordinates. Removed layer entries are pruned from this cache; visibility toggles can reuse a hidden layer's projected features. A changed source data/filter reference still rebuilds that layer's features.

## Casing order

The casing GeoJSON filters the already ordered projected collection to highlighted `LineString` references. Its order is therefore the same bottom-to-top dataset order as the semantic lines. Its separate z-index 390 pane remains below the semantic overlay pane and above basemap tiles; movement cannot bring a casing over a semantic path. The casing is still non-interactive and has no duplicate popup/click behaviour.

## Point marker order

Leaflet marker z-index uses the marker's screen Y plus `zIndexOffset`. `MapInner` now assigns offsets from the current **visible** front-to-back layer order, reserving 10,000 z-index units per dataset. This makes the higher dataset's ordinary marker reliably win near overlaps while keeping all markers inside Leaflet's marker pane. If a hidden layer moves without changing visible ordering, visible marker ranks stay unchanged. The same `L.marker` and SVG divIcon remain in use; the icon anchor, semantic shape, halo ring, and popup attachment are unchanged.

## Selection interaction

Existing code/type/feature/field point highlighting already enlarges the semantic symbol and can make it cyan. These highlighted markers receive an additional offset above all ordinary dataset markers, even if their source dataset is lower. No new selected state was introduced. The layer order controls ordinary points; existing active emphasis remains visible. Line selection and profile analysis continue to use their current styles and independently ordered overlays.

## Compact panel breakpoint

The repository already uses `(max-height: 1000px) and (min-width: 1024px)` for laptop-height desktop treatment in `src/app/globals.css`, including Data Inspector, and `max-height: 1000px` for profile analysis. The panel adopts the same desktop breakpoint. Taller 1440p-height displays keep the existing 21 rem width, card padding, and spacing. Narrow/mobile layouts are not redesigned.

## Compact panel layout

At the constrained breakpoint the panel narrows to 19 rem and caps height at the smaller of its map-relative available height and 26 rem. The header, list padding/gaps, cards, control spacing, and range spacing become tighter; font sizes and numeric labels remain as before. Every layer still shows its colour swatch, truncated name, up/down controls, reset, enable checkbox, colour input, strength value/slider, and width value/slider. Each card places the regular-weight Phosphor up/down icons and reset icon in the header. Boundary arrows are disabled. The list continues to scroll internally, the panel remains above map features but below application dialogs, and the semantic legend stays separate. The desktop right-side offset from the prior panel work remains in place; at narrow widths the panel stays right-aligned and can be scrolled.

## Performance

One click creates one new order array and one map feature-order update. It does not parse files, change layer objects, change colours, or run a reorder loop. The projected-feature cache avoids repeated coordinate conversion on reorder and on style-only updates when data/filter references are unchanged. The point rank map is built once per visible layer-order change, so marker creation uses constant-time rank lookup per point. Existing sliders still use local draft values and commit on pointer release, key release, or blur. Large-dataset browser performance should be checked with real GMI/SOSI files, especially when several thousand markers remount after a move.

## Tests

Added `tests/layerOrder.test.mjs` for front-to-back list and back-to-front paint order, middle-layer up/down swaps, boundary and unknown-ID no-ops, new-upload priority, unchanged layer/data/style/filter/visibility/analysis references, stable assigned colour, point z-index reversal after reorder, selected marker priority, and targeted MapInner contracts for ordered primary/casing paths, cache use, and stable fit-bounds identity. Updated `tests/layerHighlightPanel.test.mjs` for list order, arrow mapping and disabled boundaries, compact media rule, and retained panel interaction behaviour. Updated `tests/layerHighlightHalo.test.mjs` for the same marker with its new z-index offset.

Focused tests: **21/21 passed**. Wider map/sidebar/profile/popup/test-mode selection including AppInfo: **60 passed, 1 failed**. The sole failure is the previously observed `AppInfo reclaims desktop height only in constrained viewports` source assertion; `src/app/page.js` and `tests/appInfoUiContract.test.mjs` are unchanged. Thus the directly relevant selection passed. The changed JSX/store modules parsed with the installed Babel parser.

`npm.cmd run build` was attempted and stopped because `next/font` could not fetch Roboto from Google Fonts. This was the reported build failure; font configuration was not modified. Browser acceptance was not run in this task.

## Manual acceptance

Load existing SOSI and new GMI as separate layers. The new GMI should appear first in both the panel and sidebar and over SOSI at overlaps. Move GMI down; SOSI should appear first in both lists and above GMI for semantic lines, casings within their underlay pane, and near-coincident point symbols. Move GMI up again and confirm the reverse. Check that fuchsia/amber remain attached to their respective files, strength/width and filters remain attached to the same IDs, and a popup selects one actual feature. Toggle visibility and confirm a hidden layer keeps its order and style. Inspect exact coincident pipes with the understood limitation that the foreground geometry obscures some of the one below.

At about 830–900 px browser height, open the panel with at least two layers. Check reduced card spacing and width, internal scroll, readable labels and values, usable arrows/sliders, map pan/zoom outside the panel, and access to `Tegnforklaring`. At a tall 1440p-height desktop viewport, check that the comfortable normal panel remains. Pan/zoom the map, then reorder layers; the viewport should not jump to fit bounds. Repeat with a large SOSI export to judge the one-time marker remount cost.

## Known limitations

- Exactly coincident centerlines still have one foreground semantic stroke; ordering, visibility, and popups help inspect the lower layer but cannot display both full strokes simultaneously.
- Marker offsets are spaced for ordinary desktop map heights; an unusually tall or unusual Leaflet viewport may warrant a different step after browser review.
- The cache relies on immutable layer data/filter references, consistent with current store updates. In-place mutation of source data would require explicit cache invalidation.
- Production build completion remains unverified because the external Roboto fetch failed. Compact spacing and popup behaviour still need real browser review.

## Files changed

- `src/lib/map/layerOrder.mjs`: pure movement, paint-order, and marker-rank helpers.
- `src/lib/store.js`: prepend uploads and move-up/move-down actions.
- `src/components/MapInner.js`: ordered/cached projected features, stable fit-bounds key, and marker rank.
- `src/components/LayerHighlightPanel.js`: ordering buttons and compact layout hooks.
- `src/app/globals.css`: scoped constrained-height panel styles.
- `tests/layerOrder.test.mjs`, `tests/layerHighlightPanel.test.mjs`, `tests/layerHighlightHalo.test.mjs`: focused coverage.
- `docs/agent-reports/20260929-layer-highlight-panel-ordering.md`: these notes.

## Final repository state

Work remains on `feature/layer-highlight-halo` at `711f48a`. All previously uncommitted core, tuning, and controls-panel work remains present. `data/usage/aggregates.json` and ignored `REF_FILES/` were not touched. No reset, restore, stash, clean, branch switch, commit, or push was performed. `git diff --check` passed (exit code 0; Git emitted only line-ending warnings). `git status --short` shows the existing runtime-data modification, modified app/style/store files, and untracked halo/panel/order implementation, tests, and reports; nothing was staged.
