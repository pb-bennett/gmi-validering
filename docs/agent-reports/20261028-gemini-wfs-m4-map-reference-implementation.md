# Gemini VA WFS M4: map reference and sidebar presentation

Date: 2026-10-28  
Scope: **M4 only** from [the integration plan](20261028-gemini-wfs-integration-planning.md).

## Baseline and architecture review

Verified before edits: branch `feature/photo-workspace`; HEAD `9b659c8907234590be8653d806db438117c56323` (`Add Gemini WFS extent fetch and session lifecycle`); clean worktree. No unrelated changes required preservation. No branch switch, commit, delegation or sub-agent was used.

Read the planning and M1/M2/M3 completion reports. Inspected `LayerManager`, `Sidebar`, `LayerPanel`, `MapInner`, `PhotoLayerCard`, `PhotoMarkersLayer`, `PhotoManualPlacementLayer`, `PhotoMapController`, WMS presentation, existing layer/map tests, Phosphor icon conventions, `globals.css` tokens/focus controls, M2 display structures and M3 session/hook contracts.

The current architecture supports two small presentation children without changing survey ownership. `LayerManager` already appends external WMS presentation separately from uploaded layer cards. `MapInner` provides a Leaflet map context for a dedicated reference child. Gemini continues to live exclusively in the M3 external session; M1–M3, the Zustand store and survey/photo layer/order contracts are unchanged.

## Files changed

| File | Purpose |
| --- | --- |
| `src/lib/gemini-wfs/geminiReferencePresentation.mjs` | Session-only visibility/zoom intent, result identity/version reconciliation, actual display bounds, fixed compact notices, pane/style constants. |
| `src/components/gemini-wfs/useGeminiPresentation.js` | `useSyncExternalStore` bridge with empty SSR snapshot. |
| `src/components/gemini-wfs/GeminiReferenceLayer.js` | Two non-interactive GeoJSON batches and explicit zoom handling in a dedicated pane. |
| `src/components/gemini-wfs/GeminiReferenceCard.js` | Result-driven parent card, counts, source context, independent visibility and zoom controls. |
| `src/components/LayerManager.js` | Import and mount the card after uploaded/photo entries, before WMS; three added lines. |
| `src/components/MapInner.js` | Import and mount the dedicated reference renderer; two added lines. |
| `tests/geminiReferencePresentation.test.mjs` | Eleven pure state/bounds/style/architecture tests. |
| `tests/geminiReferenceBrowser.test.mjs` | Native Chrome acceptance of the real React/Leaflet map/sidebar; local test bundling/server only. |
| `tests/browser/geminiReferenceApp.js` | Synthetic test entry mounting production `MapInner`/`LayerManager`, seeding real M3 session through its public API and mocking proxy responses. |
| `tests/helpers/geminiPresentationLoader.cjs` | Test-only JSX/CSS-import loader using the existing Next SWC compiler. |
| This report | Implementation contract and validation evidence. |

No dependency, configuration, deployment, credential form, API route, M1/M2 adapter, M3 service/session or shared Chrome harness changed. Only five lines were added across existing application files.

## Component and state ownership

Both presentation components consume `useGeminiSession`; no result is copied into `layers`, `layerOrder`, legacy `data`, photo layers or analysis state. `GeminiReferenceCard` reads only the source survey's current `file.name` from Zustand for contextual text.

`createGeminiPresentation(session)` provides a tiny external view store; its production instance subscribes once to `geminiSession`. Observable state contains only `linesVisible`, `pointsVisible`, monotonically changing `resultVersion` and optional versioned `zoomRequest`. No feature data, credentials, request keys or persistence are added. The module retains a private reference to the current M3 result only for identity comparison and ownership reconciliation, rather than duplicating its contents.

Visibility defaults to both visible. Owner identity consists of connection, opaque account generation, source layer and dataset revision. An ordinary successful refresh of the same owner preserves choices. A new owner/revision, result removal, reset or disconnect restores both defaults for the next result. Loading/error/stale snapshots retaining the same result do not change visibility/version or remove vectors. Component unmounts do not erase shared session preferences; full lifecycle clearing remains M3's responsibility.

Presentation APIs are `getSnapshot`, `subscribe`, `setVisible(side, boolean)`, `requestZoom`, `acknowledgeZoom` and factory disposal. They cannot fetch, refresh, change credentials, mutate survey/photo/WMS visibility or write browser storage. No feature subscription/component is created per object.

## Pane, geometry and styling

`GeminiReferenceLayer` creates `gemini-reference` at **z-index 380**, with pane `pointerEvents: none`. Existing ordering is preserved: tile panes below reference; survey highlight casing 390; ordinary survey vectors 400; survey markers 600; photo markers 620; photo placement 640; tooltips/popups above those. Existing WMS raster rendering and its pane/z-index configuration are unchanged.

Each visible side is one React-Leaflet `GeoJSON` batch using the M2 `result.lines.display` / `result.points.display` FeatureCollection directly. No GML parsing, reprojection, coordinate normalization, network classification or source-record reinterpretation occurs in M4.

Centralized styles use existing `--gmi-text-subtle`:

- Lines: 2 px stroke, opacity 0.65, no fill; no semantic network colours or network dashes.
- Points: Leaflet CircleMarker radius 3 px, 1 px outline, opacity 0.7, fill opacity 0.35; no camera, category, label or drag styling.

Both batches and point paths are explicitly non-interactive. There are no Gemini popup/tooltip bindings, delegated survey actions, selection handlers, edit handlers or drag behavior. Reference geometry does not capture pointer events or block normal map pan/zoom and existing map-mode/background behavior. Photo/survey interactions remain in their own panes and domains. M6 inspection is deferred.

M2 source IDs remain on display features for later lookup. A shared `Fragment` keyed by presentation `resultVersion` replaces the two batches in one React commit when M3 publishes a new pair; it does not derive identity from counts or array indices. Existing batches do not remount for status changes. Hiding lines does not recreate the unchanged point batch (verified by DOM identity); toggles never reconstruct or mutate source records.

## Reference card and status

The single parent card is titled **Eksisterende anlegg · Gemini VA**. It appears only with a successful M3 result, including a retained previous-good result. It has compact `Ledninger` and `Punkter` rows with counts from M3's parsed-record counts. Empty successful pairs remain valid cards with zero counts.

The compact `Referanse · <survey name>` context uses safe React text and truncation; it does not repurpose GMI/SOSI/KOF/FOTO badges. Neutral borders/surfaces, Navy/Text/Muted/Subtle classes, existing focus-ring treatment and Phosphor Regular Eye/EyeSlash/CornersOut icons follow existing sidebar conventions. No new global CSS or brand palette is introduced. The card sits inside the existing scrollable layer list and remains compact at a 280 px sidebar width.

Visibility buttons have stable accessible names, `aria-pressed`, action tooltips and keyboard focus. Zoom has an accessible name, the existing corners icon convention and native disabled state for no coordinates. No credentials, connect, fetch, refresh or configuration action is exposed.

Fixed concise status text indicates loading with previous data, failed latest retrieval with previous data, or outdated source evidence. It does not display raw provider text, request keys, generations, internal codes or BBOX arrays. A retry failure never hides the old card or relabels its data/provenance. Reset, disconnect, clear or source removal removes the card when M3 clears its result. A fetch timestamp was deliberately omitted to keep this presentation compact; it remains in M3 provenance.

## Zoom and atomic updates

`getGeminiReferenceBounds(result)` traverses all WGS84 display Point coordinates and every LineString vertex across both sides, including full returned line segments outside the request BBOX. It returns Leaflet geographic bounds without projection or mutation. Visibility does not narrow the result bounds or change when zooming.

Zoom is an explicit versioned presentation intent, handled within the existing map context with `fitBounds`, 50 px padding and maximum zoom 20. Leaflet ignores fits during an active zoom animation, so this intent waits for `zoomend` if the map's zoom-animation class is present. The listener is removed on replacement/clear/unmount. The explicit fit stops any ongoing pan through public `map.stop()` before fitting; no global camera settings change. Lines-only, points-only, a single point and one empty side work. A completely empty pair disables the action and is a safe no-op. A replacement/clear invalidates an obsolete pending intent. Zoom and viewport changes never request WFS data.

Both sides always come from the same M3 `result` object. A newer success replaces the pair; loading/error/stale changes retain it; clear/reset removes it. No half-new/half-old publication or independent side fetching is introduced.

## Tests and results

### Node tests and regressions

```powershell
node --test tests/geminiReferencePresentation.test.mjs tests/wfsProxyPolicy.test.mjs tests/wfsProxyHandler.test.mjs tests/geminiGmlParser.test.mjs tests/geminiExtent.test.mjs tests/geminiClient.test.mjs tests/geminiSession.test.mjs tests/geminiStoreLifecycle.test.mjs tests/layerPresentation.test.mjs tests/layerOrder.test.mjs tests/layerHighlightPanel.test.mjs tests/layerHighlightHalo.test.mjs tests/mapPaneToolbar.test.mjs tests/mapBackgroundControl.test.mjs tests/photoMapFeatures.test.mjs tests/photoWorkspace.test.mjs tests/photoWorkspaceUx.test.mjs tests/photoResetIntegration.test.mjs tests/photoSpatialProjection.test.mjs tests/photoSession.test.mjs tests/featurePopupContent.test.mjs tests/wmsProxyPolicy.test.mjs tests/richerUsageTelemetryParserIntegration.test.mjs tests/photoImportLayers.test.mjs
```

**213 passed, 0 failed, 0 skipped** (exit 0): 11 new presentation tests and 202 regressions. Includes all M1 policy/handler, M2 Node, M3 extent/client/session/store lifecycle tests, layer/card/order/casing/map controls, photo map/workspace/reset/session, operational survey CRS/GMI/SOSI/KOF rendering/import and popup/WMS protection. Existing Node module-type/unavailable-localStorage harness warnings were not changed.

### M2/M3/photo native-browser regressions

```powershell
@'
delete process.env.PHOTO_GML_FIXTURE;
await import('./tests/geminiGmlBrowser.test.mjs');
await import('./tests/geminiServiceBrowser.test.mjs');
await import('./tests/terrainPhotoGml.test.mjs');
'@ | node --input-type=module
```

**44 Node-reported tests passed, 0 failed, 0 skipped** (exit 0). Includes native DOMParser/proj4/decoder/session checks and the photo browser parent with its seven internal XML/EXIF/session checks. The optional real-photo corpus was disabled process-locally.

### New actual React/Leaflet acceptance and visual review

```powershell
$env:GEMINI_SCREENSHOT_PATH = Join-Path $env:TEMP 'gmi-gemini-m4-reference.png'
@'
await import('./tests/geminiReferenceBrowser.test.mjs');
'@ | node --input-type=module
```

Final result: **12 passed, 0 failed, 0 skipped** (exit 0): eleven browser acceptance cases plus their parent. These mount the real production `MapInner`, `LayerManager`, Gemini children, M3 session, M2 parser/display adapters and photo markers. Existing Next webpack/SWC and Tailwind tooling compile the local harness; temporary bundles are checked to be under the task Temp directory before cleanup. No test route, global test API or test-only seeding method was added to the production application. The shared Chrome harness is unchanged; the documented working module-import invocation is reused.

All proxy responses are injected synthetic WFS collections; no network passthrough is permitted by the injected fetch. The page uses the empty base map and blocks external resources. The WMS card uses a reserved `.invalid` URL with no credentials, so no WMS service is contacted.

Acceptance covers:

- No dormant card, then title/source/counts and both real GeoJSON batches after seeding.
- Actual pane z-indices 380/390/400/600/620; real SVG token colour; non-interactive reference paths with no popups/tooltips/dragging; unchanged survey geometry above reference.
- Independent controls, both hidden, keyboard activation and the existing focus-visible ring; unchanged point-node identity when only lines toggle.
- Preserved survey/photo/WMS state and unchanged WFS call count while toggling or panning.
- Actual display-geometry bounds, zoom of lines-only/single-point-only/empty pairs, and visibility preservation.
- An explicit zoom-to-reference intent issued while a real Leaflet zoom animation is running still fits the complete result after that animation ends.
- A genuine CDP pointer click reaching the photo marker above the reference and opening its normal photo popup.
- Whole-pair replacement, stable source feature IDs, loading/error/stale retained-result presentation, clear/source removal/reset cleanup and default visibility restoration.
- Representative **267 lines + 162 points** and parser feature-cap **2000 lines + 2000 points**. Final local timings, including parsing, rendering and settled zoom, were approximately **562 ms** and **1068 ms** respectively (with a build running concurrently). These synthetic geometry timings are local observations, not live-service or worst-case 100000-vertex guarantees.

Reviewed the 1366×768 representative screenshot at `%TEMP%\gmi-gemini-m4-reference.png`: the compact card fits the sidebar; restrained grey lines/points are visible below the blue survey line; the photo camera marker remains above both. SVG strokes are also asserted to intersect the visible map, rather than merely exist in the DOM. The screenshot is a temporary synthetic artifact, not a committed municipal extract.

During harness development, runs failed on Next webpack/SWC initialization, the local classic-script charset declaration, focus-ring/popup-animation assertions and CDP attempts to serialize Leaflet map objects or await deliberately pending operations. Those harness issues were corrected. A visual check also caught rapidly queued zoom intents meeting an active Leaflet animation. M4 now retains that intent until `zoomend`, and a dedicated browser case verifies it. Screenshots wait for real zoom/pan animations to settle. No production animation disabling, shared-harness weakening or unrelated application refactor was used. Final tests above pass.

The main validation selections total **269 passing cases** (including browser parent tests), consisting of 23 new M4 tests and 246 regression tests. No failures or skips in those final selections. After the zoom-animation correction, an overlapping targeted selection was rerun:

```powershell
node --test tests/geminiReferencePresentation.test.mjs tests/layerOrder.test.mjs tests/layerPresentation.test.mjs tests/mapBackgroundControl.test.mjs tests/photoMapFeatures.test.mjs tests/photoResetIntegration.test.mjs
```

**28 passed, 0 failed, 0 skipped**; these are repeats and are not added to the 269 distinct-case total. The full repository suite was not run.

### ESLint and build

```powershell
node node_modules/eslint/bin/eslint.js src/lib/gemini-wfs/geminiReferencePresentation.mjs src/components/gemini-wfs/GeminiReferenceLayer.js src/components/gemini-wfs/GeminiReferenceCard.js src/components/gemini-wfs/useGeminiPresentation.js src/components/LayerManager.js tests/geminiReferencePresentation.test.mjs tests/geminiReferenceBrowser.test.mjs tests/browser/geminiReferenceApp.js tests/helpers/geminiPresentationLoader.cjs
npm run build
```

Focused lint for all new files and `LayerManager`: **exit 0, no errors/warnings**. A broader invocation including edited `MapInner.js` exits 1 with **8 `react-hooks/refs` errors and 4 existing warnings**. Running the exact HEAD version through ESLint stdin independently confirmed the same 8 errors/4 warnings; only line numbers shift after the two M4 additions. They concern pre-existing render-time projection-cache refs, hook dependencies and an unused no-console directive. No rule was disabled and no unrelated cache refactor was made.

`npm run build`: **exit 0**, Next.js 16.1.6/Turbopack compiled successfully, TypeScript checks completed, all eight static pages generated and existing API routes remained dynamic. Existing outdated Browserslist notice was left alone. Build ran after the final production-code changes; subsequent edits affected tests/report only. `git diff --check` passes, apart from Git's informational LF-to-CRLF checkout warnings for the two existing edited files.

## Open questions and deferred scope

- No M4 implementation blocker remains. `MapInner` retains its verified pre-existing lint findings; they are separate cleanup work.
- Palette/contrast has been checked with synthetic data on the empty map. Broader cartographic acceptance against real backgrounds/dense municipal data can refine this restrained reference style later without changing source evidence.
- The card is intentionally result-driven. Until M5 supplies a real credential/connection/workflow UI, normal users cannot obtain the first Gemini result through visible controls. No credential/fetch prompts or refresh action were added as substitutes.
- Timestamp expansion, connection workflow, password-manager form, configuration, network refresh and disconnect controls are deferred to M5+. Attribute popups/selection are deferred to M6. No classification, topology, validation, elevation interpretation, editing, paging, persistence or advanced matching was added.

**No real Gemini credentials or live Gemini service calls were used. No credential entry, password-manager fields, connection/configuration/fetch/refresh UI or automatic fetching was implemented. M5 or later functionality was not implemented.**
