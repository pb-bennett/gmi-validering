# Profile Analysis `activeData` Crash Hotfix

Date: 2026-08-24
Branch: `hotfix/profile-analysis-active-data-crash`
Base: `d6db722`

## Source fix

`AnalysisPointsLayer` now selects `activeData` reactively at component scope with
Zustand. A null `analysis.layerId` selects `state.data`; any non-null layer ID
selects only `state.layers[layerId]?.data`, so a missing or stale layer cannot
fall back to the base dataset.

The selected dataset is used for analysis validity, selected-line lookup,
vertex projection, and terrain-hover interpolation projection. The first memo
depends on analysis open state, selected pipe index, and `activeData`. The hover
memo depends on `hoveredTerrainPoint`, `lineCoords`, and `activeData`.

The obsolete imperative `useStore.getState().layers` read and `sourceProj`
return/dependency usage were removed. `projectCoordinateToWgs84` and its
dataset-aware CRS behavior were unchanged. No error-boundary work was included.

## Test coverage

Added `tests/profileAnalysisActiveDataCrash.test.mjs`, using the existing Node
test infrastructure and a small pure helper in
`src/lib/analysis/profileAnalysisHover.js`. The repository has no component or
browser test harness, so this covers the state-shaped null-to-hover transition
and the exact interpolation/projection path without introducing a new browser
framework.

Coverage includes:

- Base `state.data` with a null layer ID and the initial null hover.
- Selected layered data with SOSI/UTM EPSG:25832 projection.
- Missing/stale layer without throwing or falling back to base data.
- Replacement of the selected layer dataset and reactive projection update.
- Selected pipe change and interpolation against the new line.
- A focused source-level guard that inspects only the `AnalysisPointsLayer`
  block and selector wiring, protecting component-scoped `activeData`, the
  shared hover argument/dependency, and removal of obsolete `sourceProj` and
  imperative layer reads.

## Checks

- `node --test tests/profileAnalysisActiveDataCrash.test.mjs`: **6 passed**
- `node --test tests/richerUsageTelemetryParserIntegration.test.mjs`: **8 passed**
- `node --test "tests/*.test.mjs"`: **114 passed**
- `npm run build`: **passed**
- `git diff --check`: **passed**; Git emitted only its LF-to-CRLF normalization warning
- `npx eslint src/components/MapInner.js src/lib/analysis/profileAnalysisHover.js tests/profileAnalysisActiveDataCrash.test.mjs`: **0 errors**, two existing `MapInner.js` warnings
- `npm run lint`: **could not run** because the existing `next lint` script is invalid with the installed Next.js version and treats `lint` as a project directory
- `npx eslint .`: **failed on existing baseline findings**: 43 errors and 11 warnings in unrelated files; no errors in the touched files

The build also reported the existing outdated `caniuse-lite` notice. No commit,
push, merge, or deployment was performed.

## Files changed

- `src/components/MapInner.js`
- `src/lib/analysis/profileAnalysisHover.js`
- `tests/profileAnalysisActiveDataCrash.test.mjs`
- `docs/agent-reports/20260824-profile-analysis-active-data-crash-hotfix.md`
