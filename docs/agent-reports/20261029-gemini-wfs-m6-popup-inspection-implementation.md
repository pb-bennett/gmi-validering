# Gemini VA WFS M6: read-only feature inspection

Date: 2026-10-29. Scope: **M6 only**.

## Starting state and review

Verified before editing: repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, HEAD `56fa7ebec07edb5cda8363ec635ec0c0aede2884` (`Add Gemini WFS connection workflow`), clean worktree. The configured upstream is remote `origin`, merge ref `refs/heads/feature/photo-workspace`; its local remote-tracking ref is absent, so Git cannot resolve `@{upstream}`. No remote fetch, branch change, commit or worktree change was performed. The other existing worktree is `C:/GitHub/gmi-validering-release-v1.2.0` at `45afd0f`. No unrelated user changes existed. No sub-agents or delegation were used.

Read the planning and M1–M5 implementation reports. Inspected `MapInner`, survey popup DOM construction/tests and delegated survey actions, photo popup/marker/manual-placement components, direction-edit ownership, measurement/background-click handlers, popup CSS/container sizing, M2 field/geometry/identity contracts, M3 records/session lifecycle, M4 reference pane/presentation identity, M5 workflow and both real React/Leaflet synthetic harnesses. No applicable `AGENTS.md` was found in repository ancestors or the inspected source/test/docs paths.

## Files changed

| File | Purpose |
| --- | --- |
| `src/lib/gemini-wfs/geminiPopupContent.mjs` | Result-derived source lookup, curated field rows and safe semantic popup DOM. |
| `src/components/gemini-wfs/GeminiInspectionSide.js` | Dedicated GeoJSON side and read-only Leaflet click/popup lifecycle. |
| `src/components/gemini-wfs/geminiPopup.css` | Compact, map-bounded popup and readable two-column definition list. |
| `src/components/gemini-wfs/GeminiReferenceLayer.js` | Memoize lookup per result and mount dedicated inspection sides. |
| `src/components/MapInner.js` | One-line inspection gate for measurement, photo placement and photo direction editing. |
| `tests/geminiPopupContent.test.mjs` | Eight lookup/field/security tests. |
| `tests/geminiPopupBrowser.test.mjs` | Ten real React/Leaflet acceptance cases plus parent. |
| `tests/fixtures/gemini-wfs/popupProfile.mjs` | Synthetic curated attributes, Unicode, leading-zero IDs, geometry zero and hostile-looking text. |
| `tests/browser/geminiWorkflowApp.js` | Add an inspection fixture mode and test-only map-mode controls to the existing M5 app. |
| `tests/helpers/geminiUiHarness.mjs` | Serve production popup CSS in the existing local UI harness. |
| `tests/geminiReferencePresentation.test.mjs` | Update the pre-M6 interaction contract while retaining isolation/pane assertions. |
| `tests/geminiReferenceBrowser.test.mjs` | Assert deliberately interactive inspection paths with no bubbling, editing or drag handlers. |
| This report | Architecture, validation and limits. |

M1 proxy, M2 parser/display adapter, M3 client/session/store, M4 presentation state/styles, M5 production workflow, survey/photo popup helpers, WMS, dependencies and configuration are unchanged. No M1–M5 correctness correction was necessary. M4's former non-interactive assertions were updated only for the interaction explicitly authorized by M6.

## Source-record lookup and ownership

`createGeminiSourceLookup(result)` derives a private `Map` once through `useMemo(..., [result])`. It indexes `result.lines.source.records` and `result.points.source.records` by original M2 `record.key`; clicked display `properties.sourceKey` resolves to that same record object. The resolver also checks the display `typeName` against the record. No transformed source-record copies, scans on each click, attribute additions to GeoJSON, persistence or source mutations are introduced.

Missing/empty/unknown keys resolve safely to `null`. Any repeated key is explicitly made ambiguous (`null`), including three or more repetitions and collisions across sides; neither first nor last wins. A new result creates a new lookup and M4's existing keyed fragment replaces the geometry pair. Old closures and any owned popup are cleaned up. A retained previous-good result during loading/failure retains its lookup and popup.

## Popup content and fields

The dedicated `createGeminiPopupContent` returns a DOM `section` with an accessible label, `h2`, compact source paragraph **Gemini VA · eksisterende anlegg**, and `dl`/`dt`/`dd` attribute rows. Titles are **Eksisterende ledning** and **Eksisterende punkt**. No survey feature model or survey action classes are used. Leaflet supplies its existing popup pane, close button, auto-close and map-click close behavior.

The popup uses up to 24rem of content width (384px at the default root size), bounded by the map container and viewport height, with a single scroller. Values wrap without widening the map. Colours use existing semantic tokens. There are no new row actions or interactive controls beyond Leaflet's close button.

| Line label | Field preference |
| --- | --- |
| Type | `FCODE_TITLE`, then `FCODE` |
| Nettype | `NETTYPE_TITLE`, then `NETTYPE` |
| Dimensjon | `DIM` |
| Materiale | `MATERIAL_TITLE`, then `MATERIAL` |
| År | `YEAR` |
| Status | `STATUS_TITLE`, then `STATUS` |
| Eier | `OWNER_TITLE`, then `OWNER` |
| Ansvarlig | `RESPONSIBLE_TITLE`, then `RESPONSIBLE` |
| Lengde | `LENGTH` |
| Gemini-ID | `LSID` |

| Point label | Field preference |
| --- | --- |
| Type | `FCODE_TITLE`, then `FCODE` |
| Punkttype | `TYPE_TITLE`, then `TYPE` |
| Funksjon | `CUST_FUNC_TITLE`, then `CUST_FUNC` |
| Utførelse | `BUILDSTYLE_TITLE`, then `BUILDSTYLE` |
| Stasjon | `STATION` |
| Bredde / Lengde | `OBJWIDTH` / `OBJLENGTH` |
| Kote lokk | `COVER_Z` |
| Geometrikote | Literal Z from the source XYZ Point |
| År / Status / Eier / Ansvarlig | Same preferences as lines |
| Gemini-ID | `PSID` |

`FCODE` and point `TYPE` remain distinct concepts; when both are available they have separate labelled rows. A useful title suppresses the corresponding code row. IDs, codes, year, Unicode and numeric attribute lexemes remain exact source text, including leading zeros and supplied precision such as `160.00`. Geometry Z is conservatively converted from M2's numeric source ordinate to text without rounding or added precision; negative zero is preserved as `-0`.

`geminiFieldText` uses M2 `getGeminiField` and the field-state contract. Absent, nil, empty and visually whitespace-only fields are omitted. Source evidence is untouched. Both numeric zero and string `"0"` remain visible; there is no value-truthiness filter or numeric coercion of identifiers.

**COVER_Z and geometry Z are independent.** `COVER_Z` displays as Kote lokk even on an XY point. An XYZ point displays Geometrikote even when `COVER_Z` is missing, nil, empty or different. Literal geometry Z=0 is visible. No substitution, calculation, interpolation, agreement test or authority ranking occurs. The geometry value has a fixed explanatory title identifying it as a literal, unverified source value.

## Safe text and security

Every provider string enters the popup through DOM `textContent`. There is no HTML/XML injection, `dangerouslySetInnerHTML`, arbitrary link construction, image creation or provider-derived action. `<img src=x onerror=alert(1)>` appears literally as the Ansvarlig value, with no `img`/script element. Unicode titles and exact leading-zero IDs survive the real parser-to-popup path.

The allowlisted rows omit `FunctionResult1`–`FunctionResult5`, unknown fields, raw XML attributes, GML metadata and request/provenance internals. M2 continues preserving all that evidence. Browser acceptance compares serialized source/result evidence, exact survey-layer references, survey highlight, photo snapshot and request counts before and after popup inspection. Node tests also check lookup reference identity and no mutation.

## Map interaction, anchoring and lifecycle

The reference pane remains at z-index **380** with `pointerEvents: none`; casing/survey/photo/popup hierarchy is unchanged. Only the actual SVG reference paths opt into pointer events. Existing restrained M4 appearance remains. Normal inspection uses `bubblingMouseEvents: false`, preventing the map background handler from clearing survey highlights; no survey/photo selection action is called. Vectors have no edit or drag behavior. A genuine pointer drag beginning on reference geometry still pans the map without opening a popup.

`MapInner` passes `inspectionEnabled={!measureMode && !photoPlacement && !photoDirectionEdit}`. When a higher-priority mode is active, reference path pointer events are disabled and an existing Gemini popup closes. Measurement clicks reach the ordinary map measurement handler; photo placement retains its capture-phase click ownership. Direction editing suppresses inspection without modifying photo state. No other owning 2D map-click mode was found in the inspected architecture.

Each visible side owns an effect with click listeners and at most its own popup reference. Content is built only on a successful click lookup. Line popups use **the event's actual Leaflet `latlng`**, tested against a pointer click at 63% along a segment. Point popups use the CircleMarker centre. No first-vertex, centroid or bounds-centre anchor is used for lines.

Effect cleanup removes only its own popup and listeners on side hiding, new result/lookup, mode suppression or unmount. Hiding one side does not remount the other side. M3 clear/disconnect/reset/source removal remove the result and therefore both rendered sides and owned popups. Browser acceptance exercises each path, including full application reset and source-survey removal. A pending refresh keeps a popup on the same previous-good result; publication of the replacement closes it, even with the same source IDs and counts. No old attributes remain attached to replacement geometry.

**Inspection performs zero WFS requests.** The inspection/content/lookup modules have no request API calls. The browser injects a fetch implementation accepting only `/api/gemini-wfs` and audits every invocation. Initial M5 retrieval produces two calls; line/point inspection, close, hide/show, survey/photo inspection, measurement, photo modes and drag/pan leave that total at two. Explicit refresh alone advances it to four; replacement inspection/close/disconnect leave it at four. Each reconnect adds its explicit pair; clear/source removal/reset add no calls. No lazy attribute fetch, automatic refresh or new request contract exists.

## Tests and results

New content tests cover both correct source resolutions, absent/missing key safety, type checks, duplicate identity, replacement, unchanged evidence, title preference/fallback, M2 states, numeric/string zero, Unicode, leading-zero IDs, every curated line/point field, XY/XYZ and cover/geometry independence, literal geometry zero, and inert semantic DOM with no provider links/actions/internal dump.

The final Node regression selection was:

```powershell
node --test tests/geminiPopupContent.test.mjs tests/geminiWorkflowUi.test.mjs tests/geminiReferencePresentation.test.mjs tests/wfsProxyPolicy.test.mjs tests/wfsProxyHandler.test.mjs tests/geminiGmlParser.test.mjs tests/geminiExtent.test.mjs tests/geminiClient.test.mjs tests/geminiSession.test.mjs tests/geminiStoreLifecycle.test.mjs tests/wmsProxyPolicy.test.mjs tests/mapPaneToolbar.test.mjs tests/mapBackgroundControl.test.mjs tests/layerOrder.test.mjs tests/layerPresentation.test.mjs tests/layerHighlightPanel.test.mjs tests/layerHighlightHalo.test.mjs tests/photoMapFeatures.test.mjs tests/photoWorkspace.test.mjs tests/photoWorkspaceUx.test.mjs tests/photoResetIntegration.test.mjs tests/photoSession.test.mjs tests/featurePopupContent.test.mjs tests/richerUsageTelemetryParserIntegration.test.mjs tests/photoImportLayers.test.mjs tests/photoManualPlacement.test.mjs tests/photoDirection.test.mjs tests/photoDirectionUi.test.mjs tests/photoManualPlacementUi.test.mjs tests/objectTableInspection.test.mjs
```

**266 passed, 0 failed, 2 skipped** (268 reported). Includes eight new M6 content tests and 258 passing regressions: all M1 proxy tests, M2 Node tests, M3 extent/client/session/store lifecycle, M4/M5 presentation/workflow, existing feature-popup safety, survey inspection/highlight/map/pane/order, photo state/placement/direction/reset, import/CRS and WMS policy. The optional existing direction UI test needs `PHOTO_UI_URL`; the manual-placement UI test also needs `PHOTO_GML_FIXTURE`. Those prerequisites were unset, so they skipped. M6's own real-browser measurement/photo-mode/placement checks did execute. Existing unavailable-localStorage/module-type Node warnings were left unchanged.

Browser regression command:

```powershell
@'
delete process.env.PHOTO_GML_FIXTURE;
await import('./tests/geminiGmlBrowser.test.mjs');
await import('./tests/geminiServiceBrowser.test.mjs');
await import('./tests/geminiReferenceBrowser.test.mjs');
await import('./tests/geminiWorkflowBrowser.test.mjs');
await import('./tests/terrainPhotoGml.test.mjs');
'@ | node --input-type=module
```

**72 passed, 0 failed, 0 skipped**, including native DOMParser/proj4/service/session, M4 rendering/panes/visibility/zoom/large data, M5 actual form/error/refresh/disconnect/WMS isolation and photo XML/EXIF/session. The photo test additionally reports seven internal passing checks. M4 representative 267-line/162-point and 2000-per-side rendering checks passed; local observed times were 509ms and 691ms respectively, not service-performance guarantees.

## M6 browser acceptance and visual review

```powershell
$env:GEMINI_POPUP_SCREENSHOT_PATH = Join-Path $env:TEMP 'gmi-gemini-m6-popup.png'
@'
await import('./tests/geminiPopupBrowser.test.mjs');
'@ | node --input-type=module
```

**11 passed, 0 failed, 0 skipped**: ten M6 cases plus parent. All requested acceptance steps executed against the actual production React/Leaflet map and existing M5 modal/card, seeded with an eligible synthetic survey and photo. Pointer events come from Chrome CDP rather than invoking the popup handler directly.

Verified explicit fetch, line click and exact click anchor/all line fields/close, point click/all point fields/natural point anchor, Kote lokk=17.75 alongside Geometrikote=0, inert malicious-looking text, normal photo popup, normal survey popup with its existing inspect control, line and point hiding cleanup, replacement cleanup, disconnect/reference removal and zero additional inspection requests. Additional cases verify highlight/source/photo immutability, tool priority, actual photo-placement capture ownership, reference-started drag/pan, previous-good popup retention during refresh, clear/reset/source-removal cleanup and credential-free final state.

Reviewed the settled 1366×850 synthetic screenshot at `%TEMP%\gmi-gemini-m6-popup.png`: readable compact line popup, wrapped provider text, visible zero/leading-zero ID, normal close button and map/sidebar context. Capture waits for Leaflet popup opacity=1. The screenshot remains temporary and contains no municipal extract or credentials.

Sandboxed Chrome attempts timed out at shared-harness `Runtime.enable` before tests began; a minimal transport diagnostic (including the already-installed alternative WebSocket implementation) reproduced it. Running the unchanged harness outside the sandbox succeeded. No shared Chrome helper or test timeout/skip policy was changed. An initial M6 run then exposed a test click at the survey line midpoint under the photo camera marker; moving the test click to a clear segment made survey acceptance pass. No survey/photo production behavior was changed to accommodate the fixture. A first content-contract run also needed the pre-M6 blanket `Popup` name prohibition narrowed for the new dedicated helper import; the isolation assertions remain.

Across the final selections: **349 passing Node-reported tests, 0 failures, 2 optional skips**, including browser parent tests. Nineteen reported tests are new M6 coverage (eight content and eleven browser). The full repository suite and M7 acceptance were not run.

## Lint and build

```powershell
node node_modules/eslint/bin/eslint.js src/lib/gemini-wfs/geminiPopupContent.mjs src/components/gemini-wfs/GeminiInspectionSide.js src/components/gemini-wfs/GeminiReferenceLayer.js tests/geminiPopupContent.test.mjs tests/geminiPopupBrowser.test.mjs tests/fixtures/gemini-wfs/popupProfile.mjs tests/browser/geminiWorkflowApp.js tests/helpers/geminiUiHarness.mjs tests/geminiReferencePresentation.test.mjs tests/geminiReferenceBrowser.test.mjs
npm.cmd run build
```

Focused ESLint for every changed/new JS/MJS file except baseline-affected `MapInner`: **exit 0, no warnings/errors**. `MapInner` has **8 existing errors and 4 existing warnings**, with exact baseline/current rule, severity and normalized-message equivalence confirmed through the ESLint API. Baseline input came directly from `git show HEAD:src/components/MapInner.js` using Node `execFileSync` UTF-8; a preliminary PowerShell pipeline corrupted Unicode stdin and was discarded as invalid baseline evidence. No unrelated lint refactor or suppression was introduced. `git diff --check` passes.

`npm run build` initially encountered the host PowerShell `npm.ps1` execution policy; the equivalent `npm.cmd run build` was used. The sandboxed build then failed fetching the repository's existing Google Fonts. With network access outside the sandbox, **build passed, exit 0**: Next.js 16.1.6/Turbopack compiled, TypeScript checks completed, all eight static pages generated, existing API routes remained dynamic. No font/dependency/configuration change was made. The existing outdated Browserslist notice remains. Build ran after final production changes; later edits affected only tests and this report.

## Open semantics and deferred scope

No M6 implementation blocker remains. Attribute dimension/length units, vertical datum and precise geometry-Z semantics remain unverified. No units are invented, no height is called verified terrain, and no cover/geometry authority inference is made. Point FCODE and TYPE use distinct labels. Provider completeness, live interoperability and hosted rollout remain outside this pass.

Deferred after M6: topology/connection matching, survey-to-Gemini matching, snapping, validation, automatic connection inference, editing/dragging/deletion, feature persistence, survey-state integration, photo association, attribute tables, network filtering/category styling, new WFS requests, COUNT/paging, automatic refresh, elevation interpolation and M7/pre-production work.

**No live Gemini service calls or real credentials were used. All Gemini responses and attributes were synthetic; generated test credentials stayed private in the harness. No topology, validation or Gemini editing was implemented. Work stops at M6.**
