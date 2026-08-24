# Profile Analysis `activeData` Crash Audit

Date: 2026-08-24
Branch: `hotfix/profile-analysis-active-data-crash`
Production base: `d6db722e2bbe6f47582a6e32453177940b32e33c`

## Executive conclusion

The production crash is a deterministic JavaScript scope error in `AnalysisPointsLayer` in `src/components/MapInner.js`.

`activeData` is declared inside the first `useMemo`, so it exists only in that callback. A separate `useMemo` for `hoveredTerrainLatLng` passes `activeData` to `projectCoordinateToWgs84`. Once a terrain hover is present and interpolation reaches a non-zero line segment, JavaScript evaluates that identifier and throws `ReferenceError: activeData is not defined`.

The bad reference was introduced by commit `5835aa6fd7b3b02c758f572dbb0587287d711078` (`Fix SOSI map projection regression`, 2026-08-19). It was merged to production without a subsequent change by `d6db722`. The earlier statistics/telemetry work contributed the SOSI projection regression that `5835aa6` was fixing, but it did not introduce this Profile Analysis scope error.

The smallest correct fix is to derive the selected dataset as a reactive Zustand value at `AnalysisPointsLayer` component scope, use that same dataset for the selected line and both projection paths, and include it in the relevant memo dependencies. `sourceProj` should be removed from this component's memo result/dependencies because it became an unused remnant when direct `proj4` calls were replaced by the dataset-aware helper.

## 1. Runtime path and why the crash is delayed

Current `AnalysisPointsLayer` behavior:

1. It reads `analysis.isOpen`, `analysis.selectedPipeIndex`, `analysis.layerId`, and base `state.data`.
2. Its first memo reads `state.layers` imperatively with `useStore.getState()`, selects a dataset, selects the line, projects every vertex, and returns `points`, `lineCoords`, and `sourceProj`.
3. It separately subscribes to `analysis.hoveredTerrainPoint`.
4. Its second memo maps the profile hover distance back onto the selected line, interpolates raw dataset `x/y`, and projects the interpolated point to WGS84 for a Leaflet marker.

The invalid identifier is reached only after all of these conditions are true:

- Profile Analysis has a selected line with at least two coordinates.
- `hoveredTerrainPoint` is non-null.
- Iteration finds a non-degenerate segment containing `target.lineDist` (or the legacy `target.dist` fallback).

Until then, the second memo returns early. This explains all observed behavior: the file and modal load normally, profiles can be selected, and the crash occurs only when terrain data is available and mouse movement over the profile calls `setHoveredTerrainPoint(...)`. Different files take different amounts of time because terrain availability, selected profile geometry, zero-length segments, and user hover timing determine when execution reaches the bad reference. Browser choice is immaterial.

The state transition originates in `PipeProfileVisualization` in `src/components/InclineAnalysisModal.js`: its `mousemove` handler finds the nearest terrain point, calculates `lineDist` (reversing it for a backwards-digitized profile), and changes `hoveredTerrainPoint` from `null` to an object. That store update re-renders `AnalysisPointsLayer` and enters the failing memo.

## 2. Projection API contract and required context

`src/lib/map/coordinateProjection.js` exposes:

- `getMapSourceProjection(data)`: accepts the complete parsed dataset. It first asks `getOperationalEpsg(data)` for parser-owned CRS provenance (`format`, `crsContext`, and headers), then falls back to supported header declarations/heuristics.
- `projectCoordinateToWgs84(data, x, y)`: also accepts the complete parsed dataset, internally calls `getMapSourceProjection(data)`, returns `[x, y]` for EPSG:4326, otherwise calls `proj4(sourceProjection, 'EPSG:4326', [x, y])`, and preserves the existing raw-coordinate fallback on projection failure.

Therefore `hoveredTerrainLatLng` requires the selected line's dataset, not only a projection string. The dataset must be the same dataset from which `lineCoords` came:

- When `analysis.layerId` is non-null, it is `state.layers[analysis.layerId]?.data`.
- When `analysis.layerId` is null, it is legacy/base `state.data`.
- A truthy but missing/stale layer ID should not silently fall back to `state.data`; doing so could project and index a line from the wrong file. The current semantics correctly produce no analysis points in that case.

Coordinate ordering is consistent in this path. GMI, KOF, and SOSI normalized line coordinates are canonical `{x: easting/longitude, y: northing/latitude}`. Interpolation occurs in that raw coordinate space. `projectCoordinateToWgs84` accepts `(x, y)` and returns `[longitude, latitude]`; `AnalysisPointsLayer` then returns `[latitude, longitude]` to Leaflet.

Relevant CRS cases:

- GMI uses parser/header CRS information and `crsContext` where available.
- KOF `KOORDSYS`/projection information is normalized to an operational EPSG, including inferred 25832/25833 cases.
- SOSI now retains `SRID`/`crsContext` and, after `5835aa6`, restores numeric `header.COSYS_EPSG` for operational consumers.
- EPSG:25832, 25833, 32632, 32633, and 4326 have map definitions/fallback support; EPSG:4326 is the identity path.

Passing `sourceProj` to the old direct `proj4` code was correct before the refactor. Passing only `sourceProj` to the new helper is not possible because that is not its API. Adding another projection-string API merely for this call would be unnecessary surface area and would weaken the single dataset-aware CRS decision path.

## 3. Git provenance

### Exact introducing change

`git blame` attributes the invalid call at current lines 2868-2872, including `activeData`, to:

`5835aa6fd7b3b02c758f572dbb0587287d711078 Fix SOSI map projection regression`

The parent version used the already-returned `sourceProj` in the hover memo:

- EPSG:4326: return raw `y/x` as Leaflet `lat/lng`.
- Other projections: call `proj4(sourceProj, 'EPSG:4326', [x, y])`.

Commit `5835aa6` centralized those branches as `projectCoordinateToWgs84(activeData, x, y)`. It correctly used `activeData` within the first memo for vertex projection, but repeated the same expression in the separate hover memo where `activeData` was out of scope. It left `sourceProj` in the first memo's return value and in the second memo's dependency array even though the second memo no longer reads it. Focused ESLint confirms that `sourceProj` is now an unnecessary dependency; the current lint configuration does not report the undefined identifier as an error.

### Relationship to statistics/SOSI work

- `50f41e4` (`Add bounded upload telemetry groundwork`) changed parser/CRS metadata and stopped populating the operational SOSI `COSYS_EPSG`, creating the separate SOSI map-position regression. It did not change `src/components/MapInner.js` and did not introduce the `activeData` reference.
- Later statistics UI commits (`7f0fab0`, `e0d464a`, and merge `cea447c`) likewise did not introduce this reference.
- `5835aa6` fixed SOSI position by adding `coordinateProjection.js`, restoring SOSI operational CRS metadata, and converting map projection call sites. That conversion introduced this crash.
- Production merge `d6db722` has parents `cea447c` and `5835aa6`. There is no change to the affected code between `5835aa6` and `d6db722`.

Thus the scope crash is specifically a regression in the projection hotfix, while the motivation for that hotfix traces to earlier telemetry/parser work.

## 4. Recommended minimal root-cause fix

Keep the change confined to `AnalysisPointsLayer`:

1. Select `activeData` reactively at component scope from the same Zustand snapshot logic: use `state.analysis.layerId` to choose `state.layers[layerId]?.data`, otherwise `state.data`.
2. Stop reading the layers object imperatively inside the first memo.
3. Use component-scoped `activeData` for the validity check, selected line, vertex projection, and interpolated hover projection.
4. Make the first memo depend on `analysisIsOpen`, `analysisSelectedPipeIndex`, and `activeData`.
5. Make `hoveredTerrainLatLng` depend on `hoveredTerrainPoint`, `lineCoords`, and `activeData`.
6. Remove `sourceProj` from the first memo's return values, empty returns, and second memo dependencies. It no longer has a consumer in `AnalysisPointsLayer`.

This is slightly more complete than merely copying or re-deriving `activeData` inside the hover memo. A second imperative `useStore.getState()` read would stop the immediate exception but would leave memo invalidation dependent on unrelated render timing. Hoisting `activeData` with the existing non-reactive layers read would have the same stale-layer risk. Returning `activeData` from the first memo would pair it correctly with `lineCoords`, but the first memo still would not react to replacement/removal of the selected layer's `data` under the same ID.

A narrow Zustand selector gives the component exactly the state it needs and causes recalculation when the selected dataset object changes, without subscribing it to high-frequency per-layer terrain updates. It also preserves legacy `state.data` behavior.

No changes are needed in `coordinateProjection.js`; its dataset-aware contract is appropriate and is covered by the existing SOSI/KOF projection integration test.

## 5. Hook and state-transition audit

### Layer switching

Changing `analysis.layerId` must select a new `activeData` object. The proposed selector and `activeData` memo dependencies ensure both vertices and terrain-hover interpolation use the new layer's CRS. This matters when switching between layers in different UTM zones or between projected and EPSG:4326 data.

### Selected pipe changes

Changing `analysis.selectedPipeIndex` recalculates `lineCoords` and projected vertices. Since `lineCoords` is a hover-memo dependency, the hover position is recalculated against the new line.

The store currently does not clear `hoveredTerrainPoint` when selecting another pipe/layer or closing the analysis modal. This can briefly carry the previous profile's distance into the new line or reapply an old hover on reopen. It is not the cause of the exception, and changing that behavior is not required for this hotfix. Clearing hover state during selection/close is reasonable follow-up hygiene, but should be evaluated separately rather than bundled into the root-cause patch unless a regression test demonstrates a user-visible stale marker that must be fixed now.

### Profile hover changes

Every non-identical `hoveredTerrainPoint` object triggers recalculation. `lineDist` correctly represents distance along original line digitization; the fallback to `dist` preserves older callers. Mouse leave changes the state back to null and removes the marker.

### Dataset changes under the same layer ID

The current `getState().layers` approach is not a proper memo dependency. Reactively selecting only the active layer's `data` fixes that stale-state exposure without making `AnalysisPointsLayer` rerender for terrain queue/progress changes in the same layer.

### Missing or removed layer

If a selected layer disappears, `activeData` becomes undefined, the first memo returns empty points/coordinates, and the hover memo returns early. It must not use base `state.data` as an implicit replacement because pipe indexes and CRS context are layer-specific.

## 6. Required regression coverage

The existing `richerUsageTelemetryParserIntegration.test.mjs` verifies SOSI parsing, coordinate order, CRS selection, and projection output, but it cannot catch this bug because it never renders `AnalysisPointsLayer` or changes hover state.

Add an interaction-level regression test that exercises the failing transition:

1. Load a dataset with a valid two-or-more-point pipe and known terrain points.
2. Open Profile Analysis and select the pipe while `hoveredTerrainPoint` is null; assert normal map/profile rendering.
3. Move the pointer over the terrain profile (preferred end-to-end path), or invoke the store action used by that handler with a valid `lineDist`.
4. Assert no `pageerror`/render exception and assert that the blue terrain-hover marker appears at the expected projected Leaflet location.
5. Move the pointer out and assert the marker disappears.

Required variants/state transitions:

- Legacy/base `state.data` (`analysisLayerId === null`) using a representative GMI projected dataset.
- Multi-layer SOSI using the selected layer's CRS, not base data.
- Switch between two layers with different CRS contexts while a hover value exists, then hover the newly selected profile and verify the marker follows the new dataset.
- Change selected pipe and verify interpolation uses the new line coordinates.
- EPSG:4326 identity data and at least one UTM case (25832 or 25833); keep the current SOSI 25832 parser/projection assertions.
- A missing/removed selected layer should render no analysis markers and should not fall back to base data or throw.

The most valuable test is a browser interaction test because it covers the actual `mousemove -> setHoveredTerrainPoint -> AnalysisPointsLayer render` chain and can fail on the exact `ReferenceError`. If the repository first adds a component test harness, mock only Leaflet rendering and drive Zustand through the same null-to-hover-object transition; an initial-render snapshot or a pure projection unit test alone is insufficient.

A small pure interpolation/projection unit test can supplement the interaction test, especially for segment boundaries and backwards-digitized `lineDist`, but it must not replace the state-transition test.

## 7. Error-boundary containment (separate follow-up)

There is currently no React error boundary in `src`, so an exception while rendering `AnalysisPointsLayer` can take down the containing map/application tree.

A local boundary can be useful defense in depth because this exception occurs during render and is catchable by a React error boundary. The narrowest useful placement is around the Profile Analysis map overlay (`AnalysisPointsLayer`, and optionally its closely related analysis zoom overlay), with a fallback that removes only analysis markers and leaves the base map and rest of the application usable. It should record the error and offer a way to reset/remount when the selected pipe/layer changes.

Wrapping only `InclineAnalysisModal` would not contain this failure because the throwing component is its sibling inside `MapInner`. Wrapping all of `MapInner` would contain the application crash but unnecessarily discard the whole map. An error boundary also does not replace the root fix and should be implemented/tested in a separate change so this hotfix stays reviewable.

## 8. Scope and likely implementation files

Root-cause hotfix:

- `src/components/MapInner.js`
- One new interaction/component test file, plus narrowly required test fixture/config files if the chosen browser/component harness does not already exist

Optional, separate containment change:

- A small local error-boundary component (new file or local component)
- `src/components/MapInner.js` for placement
- A focused boundary behavior test

Not expected to change for the root fix:

- `src/lib/map/coordinateProjection.js`
- parsers, statistics, telemetry, terrain fetching, 3D code, store actions, production configuration, or deployment files

## 9. Audit verification

- Inspected current production code at `d6db722` and the affected Profile Analysis/store/terrain-hover paths.
- Inspected `coordinateProjection.js` and shared CRS selection in `telemetry/crs.mjs`.
- Used `git log`, `git blame`, commit diffs, parent-source comparison, and merge-parent verification.
- Ran focused ESLint on `src/components/MapInner.js`: no errors; it reported the now-unnecessary `sourceProj` hook dependency plus two unrelated existing warnings. No autofix was used.
- No application source, test, parser, configuration, production, Git history, or remote state was modified during this audit. This report is the only intended working-tree change.
