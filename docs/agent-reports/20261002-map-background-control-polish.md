# Map background control polish

## Scope

Polish the existing background picker, remove its obsolete global Data checkbox,
verify browser-local Eiendomsgrenser persistence with an ON default, and place
the Lagmarkering trigger along the left map edge. No unrelated control redesign,
provider changes, panel redesign, commits, pushes, or branch changes.

Branch verified before editing: `feature/real-world-validator-map-polish`.
HEAD verified before editing: `12a3d96 Refine Validator V2 issue grouping`.
The requested single-context workflow was followed without agents. The available
tools do not provide an in-session model switch; this limitation was disclosed.

## Existing architecture

- `MapView` is the relative map wrapper. It dynamically loads `MapInner` without
  SSR, and renders the separate MapLegend and LayerHighlightPanel components.
- `MapInner` uses React Leaflet `LayersControl`, backed by Leaflet's real layers
  control, at `topright`. It retains the default collapsed layers icon and the
  existing expand/collapse, radio, checkbox, and map-event isolation mechanisms.
- Basemap selection belongs to Zustand `ui.mapBaseLayer`; Leaflet's
  `baselayerchange` event calls `setMapBaseLayer` through LayerControlPersistence.
- Boundary visibility belongs to `ui.mapOverlayVisibility.eiendomsgrenser`;
  `overlayadd` and `overlayremove` call `setMapOverlayVisibility` through the
  same event adapter. Its value controls the boundary overlay's `checked` prop.
- Both settings already persist in `gmi-validator-storage`, version 3. Store
  `partialize` retains settings and UI preferences, excluding uploaded data,
  layers, layer order, terrain datasets, and custom WMS credentials.
- The obsolete Data checkbox was a `LayersControl.Overlay` wrapping semantic
  GeoJSON and highlight casing. It had a global `mapOverlayVisibility.data`
  default, hydration fallback, overlay event handlers, and tooltip reset input.
  Repository search found no other consumer of that global Data preference.
- Sidebar visibility remains `layers[id].visible`. MapInner collects ordered
  layer data and excludes invisible layer sources before constructing GeoJSON.
  Highlight state, colours, filters and layer ordering have separate owners.
- `geminiWms` remains a separate overlay visibility preference used by
  LayerManager and AuthenticatedWmsLayer; it is unaffected.
- Default Leaflet zoom occupies the top-left stack at a 10px inset. The custom
  ruler sits at left 10px, top 80px, with a 34px button. The old Lagmarkering
  trigger was an absolute MapView sibling at `right-[14rem] top-14`.
- The background selector retains its right-edge 58px top margin beneath the
  map toolbar. MapLegend remains bottom-right; the toolbar remains above the
  map's main control area. The sidebar occupies a separate workspace region.

## Background picker styling

Retained LayersControl and styled its existing markup in `globals.css`.
The surface uses `--gmi-surface`, `--gmi-border`, `--gmi-text`, a restrained
shadow, and the existing 0.5rem radius convention. Expanded padding is compact;
label rows use comfortable vertical padding and a soft-surface hover treatment.
The font stack matches the application's existing Roboto/system typography
rather than inheriting Leaflet's default font stack. The overlay row uses muted
GMI text. Canonical tokens remain unchanged.

## Basemap behavior

The four retained options are Kartverket Topo, Kartverket Gråtone,
OpenStreetMap, and Ingen. Basemap persistence already existed and remains in
the same Zustand UI state. A store test verifies that selecting Ingen persists
and survives rehydration. A comparison against HEAD confirmed all four
BaseLayer blocks and the boundary WMSTileLayer block remain unchanged.
Tile URLs, WMS URL, attribution, zoom limits and map-source configuration were
not modified.

## Data overlay control removal

Removed the Data overlay wrapper from LayersControl and rendered both casing
GeoJSON and semantic GeoJSON directly as MapContainer children. Their keys,
styles, pointToLayer, onEachFeature, casing pane and non-interactive casing
behavior are retained. Uploaded data can no longer be disabled by an obsolete
global checkbox; sidebar layer visibility remains authoritative.

Removed the dead Data overlay handlers, tooltip-reset dependency, default and
hydration fallback. Modern layer state and visibility actions are unchanged.
Older persisted UI may still contain a `data` property because existing
persistence spreads UI preferences; it is inert, has no rendering consumer,
and has no user-facing control. No storage migration was necessary.

## Eiendomsgrenser default

The existing default remains `true`. A missing overlay object or missing legacy
boundary property is backfilled to true by existing store hydration. The map
continues using `eiendomsgrenser !== false`, so absence also resolves ON at the
rendering boundary. No OFF-default implementation was introduced.

## Eiendomsgrenser persistence

Reused the application's existing Zustand persist architecture without adding
another localStorage key, helper or persistence mechanism. No persistence
implementation change was needed: explicit true and false already survive
hydration, and the event adapter already writes changes to the persisted UI.
Tests exercise the actual store with memory-backed browser storage: fresh
initial state, missing legacy overlay object/property, saved true, saved false,
OFF and ON actions, rehydration, and exclusion of uploaded datasets.

Browser localStorage hydration is synchronous in the existing setup, and the
map is dynamically loaded on the client; no new hydration effect or transient
default-setting write was introduced. No database or server persistence.

## Lagmarkering placement

Changed only the trigger classes to `absolute left-[10px] top-[124px]`.
This aligns with the existing zoom/ruler edge and leaves 10px beneath the ruler
button's 114px bottom. The label, icon, focus recipe, expanded state, click
semantics, and map-interaction isolation are retained.

The panel remains at its existing right-side location with the same constrained
height, scrolling, ordering, colour, strength, width, and reset behavior.
A comparison against HEAD confirmed the trigger's positioning string is the
only change in LayerHighlightPanel. The background picker remains top-right.

## Accessibility

Kept Leaflet's actual labelled radio inputs and actual checkbox, without fake
decorative controls or replacing its keyboard/event handling. Inputs reuse the
existing sidebar native-input pattern with `--gmi-interactive` accent colour.
Added visible interactive-colour focus outlines for inputs and the collapsed
toggle. Hover styling preserves the existing layers icon background image.
Lagmarkering retains its text label, accessible name and focus styling.

## Responsive behavior

Source/layout checks cover the unchanged right-side 58px control inset,
left-side 10px alignment, ruler clearance, and unchanged constrained-height
panel rules. The trigger's position is independent of desktop viewport height
and remains close to the edge instead of offset inward from the right.
Leaflet retains its existing map-height-based expanded-list scrollbar logic.
The sidebar remains outside MapView, and bottom controls remain in their
existing regions. The picker stays compact with only five rows.

No interactive browser tooling was available in this session. Normal desktop
and 830–1000px desktop heights were audited through layout source/contracts;
actual browser collision, clipping, keyboard and WMS checks remain pending.

## Tests

- Added `tests/mapBackgroundControl.test.mjs`: four basemaps, one boundary
  overlay, no Data control, retained Leaflet accessible input/event mechanisms,
  direct semantic/casing rendering, sidebar visibility ownership, true/false
  hydration and persistence, and exclusion of uploaded data from storage.
- Updated `tests/layerHighlightPanel.test.mjs`: left-edge trigger/ruler contract,
  removal of the old trigger position, retained right-side background picker
  and unchanged panel behavior/constraints.
- Focused run: 10 tests passed.
- Relevant regression run: 76 tests passed across map background control,
  map-pane toolbar, highlight panel/halo, layer ordering, feature hover/popup,
  store/test-mode persistence, object-table inspection, data inspector stacking,
  stats basemaps and map timeline. Repeated after the final typography change:
  76 passed, zero failures.
- Full suite: 547 tests, 546 passed, one known unrelated failure in
  `appInfoUiContract.test.mjs:154`, “AppInfo reclaims desktop height only in
  constrained viewports”. Its first source-order assertion also evaluates
  false against the original HEAD CSS; unrelated code was not changed.
- The first broader invocation lacked startup ESM loader registration for the
  object-table test. The successful regression/full invocations registered the
  existing `tests/esmJsLoader.mjs` at startup using a temporary import module.
  Earlier runner quoting/path setup failures were invocation errors, not
  product test failures. Logs and the registration module are in Windows Temp.
- `git diff --check`: passed. Git's existing LF/CRLF advisory is not a whitespace
  failure and does not indicate a write to runtime data.
- Production build: not run (optional for this task).

## Manual acceptance

Pending browser verification; these checks were not claimed as executed:

- Fresh browser/no saved setting: boundaries ON, four backgrounds, no Data,
  and GMI picker presentation.
- Boundaries OFF: boundaries disappear; reload preserves OFF. Boundaries ON:
  boundaries appear; reload preserves ON. Use zoom 15 or above for the existing
  WMS visibility range.
- Upload/open GMI and SOSI: semantic data remains visible when enabled in the
  sidebar; per-layer visibility and ordering work; no global Data toggle.
- Lagmarkering: left-edge alignment below zoom/ruler, no intrusion into the
  map centre, no collision with sidebar/toolbar/bottom controls. Clicking opens
  the existing panel; colours, strength, width, reset and ordering still work.
- Background picker: collapsed icon, open/close, basemap switching, Ingen,
  labelled radio/checkbox keyboard use, visible focus, and no map pan/click
  while interacting. Map interaction resumes outside the control.
- Repeat at normal desktop and approximately 830–1000px viewport heights,
  including profile analysis and bottom-table layouts; confirm expanded picker
  scrolls when necessary and right-side controls remain separated.

## Files changed

- `src/app/globals.css`
- `src/components/MapInner.js`
- `src/components/LayerHighlightPanel.js`
- `src/lib/store.js`
- `tests/mapBackgroundControl.test.mjs`
- `tests/layerHighlightPanel.test.mjs`
- `docs/agent-reports/20261002-map-background-control-polish.md`

## Remaining issues

Manual browser acceptance remains pending. The known unrelated AppInfo
source-contract failure remains. No build result is available because the
optional production build was not run. Legacy persisted Data keys are inert.

## Final repository state

Branch and HEAD remain unchanged. No commit or push. The pre-existing modified
`data/usage/aggregates.json` was not read, edited, restored, staged, cleaned or
otherwise changed by this task. `REF_FILES/` was not accessed or modified.

Expected final `git status --short`:

```text
 M data/usage/aggregates.json
 M src/app/globals.css
 M src/components/LayerHighlightPanel.js
 M src/components/MapInner.js
 M src/lib/store.js
 M tests/layerHighlightPanel.test.mjs
?? docs/agent-reports/20261002-map-background-control-polish.md
?? tests/mapBackgroundControl.test.mjs
```
