# S7 map chrome and developer panel

Date: 2026-09-23. Starting SHA: `50ca7e7` (`Refresh LayerDataTable styling`). Repository root: `C:/GitHub/gmi-validering-test`. Branch: `feature/styling-overhaul-integrated`. Starting working tree: clean.

## Files changed

- `src/components/MapLegend.js`
- `src/components/MapInner.js`
- `src/lib/map/featurePopupContent.mjs`
- `src/components/DevDiagnosticsPanel.js`
- `tests/featurePopupContent.test.mjs` and `tests/testMode.test.mjs` (styling assertions only)
- This report

## S7 presentation

The active Tegnforklaring uses a compact GMI Surface frame, Soft disclosure header, Border dividers, Navy heading, and Text/Muted legend labels. The existing maximum width, `bottom-20 right-4` placement, `max-h-80` scrolling, symbol geometry, labels, order, category visibility, and domain colors remain. The disclosure button now exposes its expanded state.

The measurement trigger keeps its 34px Leaflet-side footprint and position with GMI Surface, Strong Border, and focus treatment. Its custom ruler drawing became a regular Phosphor `RulerIcon`. The result panel retains its position, dimensions, scroll limit, values, units, and handlers; its frame, text, dividers, and controls use the compact GMI palette. Its close glyph became regular Phosphor `XIcon`. The measurement map line, points, labels, calculations, and formatting were not changed.

The active popup helper retains `document.createElement`, text nodes, and `textContent` for feature data. S7 added compact hierarchy, wrapping, muted field labels, separators, and GMI action styling. The category/code color remains the passed `color` value. The `.vis-i-3d-btn`, `.inspect-data-btn`, and `.show-profile-btn` hooks and all `data-feature-*`, `data-index`, and `data-layer-id` attributes are unchanged. No `innerHTML` rendering or Leaflet popup CSS selector was introduced. No popup action or selection/zoom handler changed.

The developer diagnostics panel retains its technical dark treatment, now using GMI Ink/Navy chrome, Text-on-dark labels, and a Strong Border frame. Existing status colors, diagnostic values, telemetry, scrolling, developer-only gating, show/hide behavior, and reset/log actions remain. The genuine Reset stats action gained regular Phosphor `ArrowCounterClockwiseIcon`; no close icon was assigned to it.

No new scoped Leaflet CSS selectors were introduced. GIS legend symbols, water/wastewater/stormwater colors, markers, analysis colors, and status colors were preserved. The 580px/860px toolbar thresholds, independent 1100px legend threshold, 58px Leaflet clearance, observers, map actions, Leaflet lifecycle, pane ownership, stacking, and map geometry were not edited. The accepted 28rem docked inspector, its spacing, LayerDataTable, and Stats predicate `!(layerDataTableOpen || dockedInspectorOpen)` were untouched. S8A and later surfaces were excluded.

## Verification

- `git diff --check`: passed; Git reported only local LF-to-CRLF working-copy warnings.
- `node --loader ./tests/esmJsLoader.mjs --test tests/mapPaneToolbar.test.mjs tests/statsUiContract.test.mjs tests/featurePopupContent.test.mjs tests/testMode.test.mjs tests/profileAnalysisActiveDataCrash.test.mjs tests/validationV2WorkspaceInspector.test.mjs`: 32/32 passed. An initial run had one styling assertion expecting the old diagnostics background class; the assertion was updated and the same suite passed. Popup safety and behavior assertions were retained.
- `npm.cmd run build`: passed, including compilation, type checking, and static generation. The existing Browserslist age warning appeared; dependencies were not changed.

Browser review: pending. The available in-app browser runtime failed twice before any tab could open: `js: codex/sandbox-state-meta: missing field sandboxPolicy`. Legend, measurement, popup, diagnostics, and map interaction states therefore have no rendered acceptance claim.

Concern/deferred item: visually check overlap, focus, long popup values, legend scrolling at 1100px, and diagnostics status content when browser access works. No S8+ work was started.

Final `git status --short`:

```text
 M src/components/DevDiagnosticsPanel.js
 M src/components/MapInner.js
 M src/components/MapLegend.js
 M src/lib/map/featurePopupContent.mjs
 M tests/featurePopupContent.test.mjs
 M tests/testMode.test.mjs
?? docs/agent-reports/20260923-styling-overhaul-s7-map-chrome.md
```
