# Independent Review: Profile Analysis `activeData` Crash Hotfix

Date: 2026-08-24
Branch: `hotfix/profile-analysis-active-data-crash`
Base: `d6db722e2bbe6f47582a6e32453177940b32e33c`

## Verdict

**APPROVE FOR COMMIT**

The implemented source fix eliminates the production `ReferenceError` on the actual `hoveredTerrainLatLng` render path and preserves the intended dataset/CRS behavior. I found no blocker or major correctness issue. The sole previous MINOR test-quality finding is now closed by a focused source-level wiring assertion.

## Findings by severity

### BLOCKER

None.

### MAJOR

None.

### MINOR - CLOSED: component wiring regression guard

The new sixth test reads `MapInner.js`, isolates only the `AnalysisPointsLayer` function body between stable neighboring function declarations, and makes targeted structural assertions rather than snapshotting the whole file. Together with the existing selector behavior tests, it verifies that:

- component-scoped `activeData` is obtained reactively through `useStore(selectAnalysisActiveData)` before the first memo;
- the selector chooses `state.data` only for a null layer ID and otherwise chooses `state.layers[layerId]?.data`;
- a stale/missing non-null layer does not fall back to base data (also behaviorally asserted by the existing test);
- analysis validity, selected-line lookup, and vertex projection use `activeData`;
- the hover path passes `hoveredTerrainPoint`, `lineCoords`, and `activeData` to `getHoveredTerrainLatLng`;
- the hover memo depends on `hoveredTerrainPoint`, `lineCoords`, and `activeData`;
- `AnalysisPointsLayer` contains neither obsolete `sourceProj` wiring nor the old imperative `useStore.getState().layers` read.

This guard would fail against production `d6db722` for the relevant reasons, even if the new helper module were made available to the old tree: the old component has no `useStore(selectAnalysisActiveData)` declaration, reads layers imperatively, declares `activeData` only inside the first memo, calls the hover projection with that out-of-scope identifier, retains `sourceProj`, and uses `sourceProj` rather than `activeData` in the hover dependency list.

The source assertion is intentionally narrower than a whole-file snapshot. It may require an update if the function is deliberately renamed or moved, which is acceptable for a source-contract regression guard. No new production-code change accompanied this correction.

### NOTE

The LF-to-CRLF message from Git is a working-copy normalization warning only. `git diff --check` passes.

## Source implementation review

### 1. Original crash path is fixed

`AnalysisPointsLayer` now declares:

`const activeData = useStore(selectAnalysisActiveData);`

at component scope. The hover memo no longer refers to an identifier local to the preceding memo. It calls:

`getHoveredTerrainLatLng(hoveredTerrainPoint, lineCoords, activeData)`

and therefore the execution path that previously evaluated an out-of-scope `activeData` now receives a defined component-scope binding. A valid terrain hover can reach interpolation/projection without a `ReferenceError`.

### 2. Exact active-dataset semantics are correct

`selectAnalysisActiveData` implements:

- `analysis.layerId === null` -> `state.data`;
- `analysis.layerId !== null` -> `state.layers[layerId]?.data`.

A missing/stale non-null layer ID returns `undefined`. There is no `|| state.data` or nullish fallback that could accidentally select the base file. `AnalysisPointsLayer` then returns empty points/coordinates, and its hover calculation returns null.

This matches the required semantics. It also prevents a selected pipe index from being applied to an unrelated base dataset.

### 3. React/Zustand reactivity and memo dependencies are correct

The selector returns the selected dataset object itself. Zustand will notify this component when that selected value changes by identity:

- Replacing `state.layers[layerId].data` under the same ID yields a new selected value and rerenders.
- Changing `analysis.layerId` selects the new layer dataset (or undefined for a stale ID).
- Base `state.data` replacement is observed while `layerId` is null.
- Updates to terrain/status fields that retain the same layer `data` object do not cause unnecessary rerenders through this selector.

The first memo depends on:

- `analysisIsOpen`;
- `analysisSelectedPipeIndex`;
- `activeData`.

Thus open/close, pipe changes, dataset replacement, and layer selection changes recalculate validity, selected line, vertices, and `lineCoords`.

The hover memo depends on:

- `hoveredTerrainPoint`;
- `lineCoords`;
- `activeData`.

Thus hover changes, pipe/line changes, and selected dataset/CRS changes recalculate the map hover marker. There is no stale dataset closure in this path.

### 4. Helper extraction and behavioral fidelity

Extracting `getHoveredTerrainLatLng` is reasonable: it isolates a small deterministic calculation with a clear domain purpose and removes a long memo callback. It is used only once in production, so the main justification is focused testability; it has not grown into a broader abstraction.

Comparison with the pre-hotfix inline implementation confirms behavioral preservation:

- Returns null for a missing hover or fewer than two line coordinates.
- Prefers `target.lineDist` whenever it is not `undefined`; otherwise uses `target.dist`.
- Accumulates Euclidean segment length in raw `x/y` space.
- Skips segments shorter than `0.0001` without adding to accumulated distance.
- Uses the same `targetDist <= distSoFar + segLen` boundary condition.
- Uses the same linear interpolation formula.
- Returns null if the target distance is not reached.
- Projects the interpolated raw coordinate with the selected `activeData`.

No clamp, endpoint, negative-distance, missing-distance, or degenerate-segment behavior changed.

### 5. Coordinate order is correct

Both vertex and terrain-hover paths now make the ordering explicit:

1. Read normalized raw `{x, y}`.
2. Call `projectCoordinateToWgs84(activeData, x, y)`.
3. Receive `[lng, lat]`.
4. Pass/return `[lat, lng]` to Leaflet.

This preserves canonical SOSI/GMI coordinate handling and improves readability over temporary `l`/`t` variables without changing behavior.

### 6. GMI/base and layered SOSI/UTM behavior remains correct

The base path selects `state.data` only for a null layer ID. The layered path selects the layer's parsed dataset, so `projectCoordinateToWgs84` sees that dataset's `format`, `crsContext`, and headers.

`coordinateProjection.js` is unchanged. Existing projection selection therefore remains intact for GMI and SOSI, including SOSI EPSG:25832 operational metadata introduced by the earlier projection repair. The focused tests independently confirm EPSG:4326 identity behavior and layered SOSI/25832 projection into the expected Norwegian longitude/latitude range. The existing parser/projection integration suite also passes all eight tests.

### 7. Removing `sourceProj` is safe

Within `AnalysisPointsLayer`, `sourceProj` was obsolete after `5835aa6` replaced direct `proj4` use with `projectCoordinateToWgs84(data, x, y)`. It was returned only to appear in the hover memo dependency list and was not read by the callback.

The hotfix removes it from:

- early memo returns;
- successful memo return;
- destructuring;
- hover dependencies.

There are no remaining `sourceProj` references in `AnalysisPointsLayer`, and focused ESLint no longer reports the former unnecessary-dependency warning. Other `sourceProj` identifiers and the remaining imperative layer read occur in separate map paths and were present before this focused change; they are outside this crash fix.

## Scope review

The working tree contains only the expected focused implementation and documentation:

- modified `src/components/MapInner.js`;
- new `src/lib/analysis/profileAnalysisHover.js`;
- new `tests/profileAnalysisActiveDataCrash.test.mjs`;
- the requested audit and implementation reports.

No changes were made to `coordinateProjection.js`, parsers, store actions, terrain fetching, Profile Analysis modal behavior, error boundaries, production configuration, or dependencies. No unrelated implementation change was found.

## Checks independently rerun

- `node --test tests/profileAnalysisActiveDataCrash.test.mjs`: **6 passed, 0 failed**.
- `node --test tests/richerUsageTelemetryParserIntegration.test.mjs`: **8 passed, 0 failed**.
- `node --test "tests/*.test.mjs"`: **114 passed, 0 failed**.
- `npm.cmd run build`: **passed**; production bundle compiled, type checking and static generation completed. The existing outdated `caniuse-lite` notice remains.
- Focused ESLint on `MapInner.js`, the helper, and the new test: **0 errors, 2 warnings**. Both warnings are pre-existing and outside `AnalysisPointsLayer`.
- `git diff --check`: **passed**, with only the LF-to-CRLF normalization warning.

No source code, tests, commits, remotes, deployments, or production state were modified during this review. This review report is the only intended new change from this pass.
