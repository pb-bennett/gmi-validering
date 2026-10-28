# Gemini VA WFS M3: extent, paired fetch and session lifecycle

Date: 2026-10-28  
Scope: **M3 only** from [the integration plan](20261028-gemini-wfs-integration-planning.md)

## Baseline and prerequisite review

Before edits, branch was `feature/photo-workspace`, HEAD was `571e0885b465ccdba7632e90cf076c4673df235c` (`Add Gemini WFS GML parser`), and the worktree was clean. No branch switching, commits, delegation or sub-agents were used.

Read the planning, M1 implementation and M2 implementation reports. Inspected the M1 policy/handler contract, M2 parser/display adapter, `src/lib/store.js`, `src/lib/layerPresentation.mjs`, `src/lib/telemetry/crs.mjs`, `src/lib/map/coordinateProjection.js`, `src/lib/validation-v2/datasetRevision.js`, `src/components/FileUpload.js`, the normalized survey geometry/import paths, and the photo session/subscription/reset precedents and tests.

The architecture still fits HEAD: a separate external reference session can use existing operational CRS classification and dataset object revisions, observe source ownership through a one-way store binding, and explicitly clear credentials during `resetAll`. No change to the M1 request contract, route, server policy or M2 parser/display APIs is needed.

## Files changed

| File | Change |
| --- | --- |
| `src/lib/gemini-wfs/geminiExtent.mjs` | Pure complete-geometry extent, strict reprojection, fixed product buffer and compatible client-side safety checks. |
| `src/lib/gemini-wfs/geminiClient.mjs` | Paired same-origin POST transport, bounded byte reads, deliberate decoding and M2 adapters. |
| `src/lib/gemini-wfs/geminiErrors.mjs` | Fixed safe error messages/codes, sanitized descriptors and abort-aware promise waiting. |
| `src/lib/gemini-wfs/geminiSession.mjs` | Private credentials, external session, atomic publication, provenance, coalescing, cancellation and source-store binding. |
| `src/components/gemini-wfs/useGeminiSession.js` | `useSyncExternalStore` bridge with an empty server snapshot; no visible UI and no consumer added. |
| `src/lib/store.js` | Three added lines: session import, reset call, and subscription binding after store creation. No survey actions or persistence shape changed. |
| `tests/geminiExtent.test.mjs` | Extent/projection/invalid-coordinate/area cases and boundary parity with M1. |
| `tests/geminiClient.test.mjs` | Contract, encoding, bounds, timeout, cancellation, safe failures and adapter-stage tests. |
| `tests/geminiSession.test.mjs` | Atomic result/provenance, credential privacy, reuse/refresh, failures and lifecycle races. |
| `tests/geminiStoreLifecycle.test.mjs` | Actual Zustand remove/reset/revision integration with pending injected transports. |
| `tests/geminiServiceBrowser.test.mjs` | Local module-serving browser test entry using the unchanged Chrome harness. |
| `tests/browser/geminiServiceChecks.mjs` | Eight native-browser service/session integration checks using synthetic M2 fixtures. |
| This report | Scope, API and validation evidence. |

All application changes outside the three store lines are new modules. Existing M1/M2 modules, WMS/contact, shared browser harness, normalization/projection behavior, dependencies, configuration and deployment files are unchanged.

## Extent algorithm and CRS

`getGeminiExtent(layer, { bufferMetres = 100, project = proj4 } = {})` accepts one normalized GMI/SOSI/KOF layer. It uses that layer's `data.points` and `data.lines`, traversing **every coordinate of every point feature and every vertex of every line**. It ignores visibility/filter flags, camera/outlier heuristics, source extent strings, photos, photo envelopes and legacy `state.data`.

XY must already be finite JavaScript numbers. Null, empty strings, numeric strings, undefined, nonfinite values and malformed/empty feature geometry fail explicitly. Empty point/line collections produce `no_source_geometry`. A single point or flat line is valid. Z is never inspected, projected, filled or changed.

CRS eligibility comes from unchanged `getOperationalEpsg`: only operational EPSG:25832, EPSG:25833 and EPSG:4326. User-assumed CRS follows the existing upload behavior: `FileUpload` writes the explicit choice into the operational header. M3 does not infer an unknown CRS or add EPSG:3857/32632/5972 support. It does not change the global CRS contract.

EPSG:25832 XY remains unchanged. Other supported coordinates are individually projected into EPSG:25832 using `proj4` and existing definitions, before min/max accumulation. Failed/nonfinite transforms fail safely. The permissive map helper and its identity fallback are not used. Geographic source longitude/latitude must also lie within valid angular ranges.

The production session calls the helper with no buffer override: **100 metres on each side**, with minima floored and maxima ceiled to whole metres **after buffering**. The optional helper argument is for isolated tests/future work, is not exposed through the production fetch API, and is not persisted.

Buffered BBOX validation mirrors M1: ordered finite numbers; easting 100000–900000; northing 0–10000000; width/height at most 2000 m; area at most 4000000 m². Exact boundaries are accepted. Excess is rejected without cropping or tiling. `extent_too_large` carries safe numeric `{ width, height, area }` details. M1 remains authoritative; tests compare both validators at boundaries and one-metre excesses without importing server policy into production browser modules.

## Transport and response decoding

`createGeminiClient({ fetchProxy, parseGml, buildDisplay, timeoutMs })` creates the injectable service; `fetchGeminiPair` is its production instance. Each logical fetch starts exactly two concurrent `POST /api/gemini-wfs` calls, for `lines` and `points`, with the same BBOX. Each JSON body contains only:

- `connectionId: 'faerder-va-basis'`
- `featureType: 'lines'` or `'points'`
- `bbox`
- transient `username` and `password`

No direct Gemini URL, upstream WFS parameters, Authorization header, cookies, COUNT, paging or retries are constructed. Fetch uses `cache: 'no-store'`, `redirect: 'error'`, `credentials: 'omit'` and only the JSON Content-Type header. Browser-managed Origin/Sec-Fetch-Site remain available for M1's same-origin checks.

One AbortController and a **20-second overall client deadline** cover both request/response streams. This provides a small outer allowance around M1's unchanged 15-second upstream deadline. A rejected side aborts its sibling; abort-aware waits settle even if an injected transport ignores cancellation. Late response bodies are cancelled where practical. There are no automatic requests.

Each successful response must be HTTP 200 and non-redirected. Byte reads are bounded to M2/M1's **3 MiB per response** using declared Content-Length and actual streamed size. Missing or misleadingly small lengths cannot bypass the streamed bound. The browser does not require byte-for-byte equality with Content-Length because browser HTTP decoding can alter the exposed byte count; M1's transport checks remain in place.

Only M1's approved XML/GML MIME types and charset contract are accepted. Absent charset, `UTF-8` and `utf8` use fatal UTF-8 `TextDecoder`; `US-ASCII` additionally rejects every non-ASCII byte. This avoids the browser decoder's ASCII-to-Windows-1252 alias. Unsupported charsets, invalid UTF-8 and contradictory/unsupported XML encoding declarations fail as `unsupported_response_encoding`. No alternate encoding is guessed.

Decoded XML is passed to unchanged `parseGeminiGml`, then unchanged `buildGeminiMapFeatures`. Each response must contain only its requested type (or be empty). Counts come from parsed records, not provider `numberReturned` metadata. The service retains separate frozen `{ source, display }` sides and releases its raw XML/byte buffers after completion; no raw response is put in session state. Source XY/XYZ, all Z values and COVER_Z remain under the M2 lossless model.

## Session API, credentials and provenance

`createGeminiSession({ getLayer, requestPair, extent, now })` supports isolated tests; `geminiSession` is the workspace instance. The credential slot is a private closure containing only a copied username/password object. No credential getter is exposed. `setCredentials` validates M1-compatible bounds/control characters without trimming or normalizing the password. Credentials are not placed in Zustand/devtools/persist, browser storage, request keys, URLs, snapshots, errors or logs. Credentials appear only in the two transient POST bodies when a request runs.

Public operations:

| API | Behavior |
| --- | --- |
| `getSnapshot` / `subscribe` | Credential-free stable snapshots/subscriptions for future consumers. |
| `setCredentials({ username, password })` | Replace private credentials, rotate an opaque random account-generation token, abort work and clear previous-account results. |
| `selectSource(layerId)` | Select/validate survey ownership and revision; never fetch. |
| `fetch(layerId?)` | Fetch for explicit/current source or reuse a matching successful result. |
| `refresh(layerId?)` | Bypass successful-result reuse; start a fresh pair. Identical already-active requests still coalesce. |
| `cancel()` | Abort current work and retain a previous good result. |
| `clearResult()` | Abort and remove reference data; keep private connection credentials. |
| `disconnect()` / `reset()` | Abort and clear credentials, results, selection and connection/account state. |
| `reconcileSource()` | Reconcile source existence/revision only; never fetch. |
| `dispose()` | Reset and remove listeners; further fetching reports `session_disposed`. |

Async fetch operations return `{ ok: true, result, reused }` or `{ ok: false, error }`. Synchronous invalid credential/selection operations throw the same safe service error type. The local `connected` connection status means credentials were supplied, not that an authenticated network probe has succeeded. Authentication failure discards the private slot and marks `credentials-required`; a previous good result retains its original ownership/provenance. A replacement account always clears old results.

Snapshots contain connection/account generation, selected source descriptor, status, pending request, latest safe error, stale flag and at most **one successful complete pair**. Result sides retain full M2 source collections/records and separate display FeatureCollections. Result provenance records source layer ID, dataset revision, fixed connection ID, opaque account generation, rounded BBOX, buffer, source/target CRS, request key, numeric generation, counts and `fetchedAt` (epoch milliseconds).

Request identity is JSON of credential-free source layer ID, existing dataset object revision, connection ID, opaque account-generation token, BBOX and buffer. The token is random/opaque, never a credential hash. Identical in-flight calls return the same promise. A successful result can be reused only while that identity is still current and not stale. Explicit refresh bypasses completed-result reuse. An already-active identical refresh is coalesced rather than duplicated.

## Atomic publication and lifecycle

The session publishes a new pair only after **both** responses are downloaded, decoded, parsed and display-adapted. Empty collections are successful. A failure leaves the previous result object, source evidence, counts, provenance and fetch time intact, exposing latest status/error separately. No half-new/half-old data is published or relabelled.

Each operation captures an abort controller and monotonically invalidated generation. A newer different request/source, source revision change, reset, disconnect, clear, disposal or account replacement aborts previous work. Publication also rechecks the current source revision and active ticket/generation. Late transport completion cannot recreate cleared data. Old catches cannot overwrite a newer operation's status/error.

`bindGeminiSurveyStore(useStore)` observes survey ownership/revision through a one-way subscription; the session does not import the store. Removing its source clears the result and cancels work; removing another survey leaves it alone. A retained old result belonging to a different selection is also cleared if its own source is removed. Dataset replacement changes `getDatasetRevision`, cancels active work and marks retained evidence stale. A changed revision cannot reuse a previous successful pair, even with the same geometry count/BBOX.

`resetAll` explicitly resets Gemini before resetting the existing photo/survey domains. Ordinary source removal does not clear credentials, photos, WMS or unrelated surveys. View, visibility, workspace/photo changes cannot fetch. Gemini never enters `layers`, `layerOrder`, legacy `data`, `addLayer` or any survey analysis/validation pipeline. The React bridge unsubscribes a view without disposing shared workspace data; explicit workspace reset/disconnect/disposal controls that lifetime.

## Errors

`GeminiServiceError` and `safeGeminiError` expose only fixed Norwegian messages and allowlisted codes. Relevant codes include `no_survey_source`, `no_source_geometry`, `unsupported_crs`, `invalid_survey_coordinate`, `extent_projection_failed`, `extent_too_large`, `invalid_bbox`, `credentials_unavailable`, `invalid_credentials`, `proxy_request_failed`, M1 authentication/permission/rate-limit/timeout/transport/size/cancellation codes, `unsupported_response_encoding`, `gml_parser_error`, `display_projection_error`, `unexpected_feature_type` and `session_disposed`.

Safe M2 parser codes are retained as optional `parserCode`; optional area dimensions contain only finite numeric width/height/area. Provider JSON is bounded to 4 KiB for error-code extraction and its message/body is discarded. Arbitrary thrown messages, causes, raw XML and credentials are never copied into observable errors or logged.

## Validation evidence

### New Node tests

```powershell
node --test tests/geminiExtent.test.mjs tests/geminiClient.test.mjs tests/geminiSession.test.mjs tests/geminiStoreLifecycle.test.mjs
```

Final result: **35 passed, 0 failed, 0 skipped** (exit 0): 10 extent, 10 client, 12 session and 3 actual-store tests. Includes known 4326/25833 projections, intermediate vertices, invalid/null/string coordinates, source identity, fixed buffering, M1 bounds parity, two-call contract, encoding/body bounds, cancelled/stalled streams, previous-good-result retention, account/revision races and actual source removal/reset.

An initial development run passed 29/31 tests; two extent test expectations were incorrect (a provisional reference coordinate and a helper's default parameter masking the intended undefined CRS). Those fixtures were corrected using the existing photo/M2 known coordinate and an explicitly unset header. The final invocation above passes; no production behavior was weakened to accommodate them.

### Native browser tests and M2/photo GML regressions

Used the documented working M2 module-entry invocation, with no changes to the shared Chrome harness:

```powershell
@'
delete process.env.PHOTO_GML_FIXTURE;
await import('./tests/geminiServiceBrowser.test.mjs');
await import('./tests/geminiGmlBrowser.test.mjs');
await import('./tests/terrainPhotoGml.test.mjs');
'@ | node --input-type=module
```

Final result: **44 Node-reported tests passed, 0 failed, 0 skipped** (exit 0): eight new M3 browser cases plus their parent; 33 M2 cases plus their parent; one existing photo browser test. The latter also reports seven successful internal XML/EXIF/photo-session checks. This exercises actual Chromium `DOMParser`, `TextDecoder`, Response streams, AbortController and proj4. All service fetches are synthetic/injected; the HTTP server serves local test modules only. The optional real-photo corpus is disabled process-locally.

Browser M3 coverage includes real parser/display execution for both sides, source vertex/Z/COVER_Z/Unicode/XY preservation, empty responses, private snapshots, parser failure, display failure, one proxy-side failure with previous-good retention, and ignored late replies after reset. No CDP startup failure occurred with this invocation; the previously documented direct-file-entry issue was not retried or hidden.

### M1 and broader regressions

```powershell
node --test tests/wfsProxyPolicy.test.mjs tests/wfsProxyHandler.test.mjs tests/geminiGmlParser.test.mjs tests/wmsProxyPolicy.test.mjs tests/photoSpatialProjection.test.mjs tests/photoSession.test.mjs tests/photoResetIntegration.test.mjs tests/photoSpatial.test.mjs tests/photoMapFeatures.test.mjs tests/layerOrder.test.mjs tests/layerPresentation.test.mjs tests/featurePopupContent.test.mjs tests/richerUsageTelemetryParserIntegration.test.mjs tests/photoSourceWorkflow.test.mjs tests/photoImportLayers.test.mjs tests/validationV2SyntheticGmiFixtures.test.mjs tests/sosiCanonicalAttributes.test.mjs
```

**181 passed, 0 failed, 0 skipped** (exit 0). Includes all 41 M1 tests, six M2 Node tests, WMS policy, operational CRS/projection, normalized GMI/SOSI/KOF import, photo session/reset/source workflows, layer presentation/order and popup safety. Contact code was untouched. Existing Node module-type and unavailable-localStorage harness warnings were emitted; they are not test failures.

Across final successful invocations: **260 Node-reported tests passed** (including browser parents), comprising 44 new M3 tests and 216 regression tests. No failures or skips in those final invocations. The full repository suite was not run.

### Lint, build and scope

```powershell
node node_modules/eslint/bin/eslint.js src/lib/gemini-wfs/geminiErrors.mjs src/lib/gemini-wfs/geminiExtent.mjs src/lib/gemini-wfs/geminiClient.mjs src/lib/gemini-wfs/geminiSession.mjs src/components/gemini-wfs/useGeminiSession.js src/lib/store.js tests/geminiExtent.test.mjs tests/geminiClient.test.mjs tests/geminiSession.test.mjs tests/geminiStoreLifecycle.test.mjs tests/geminiServiceBrowser.test.mjs tests/browser/geminiServiceChecks.mjs
npm run build
```

Focused ESLint: **exit 0, no errors/warnings**. Build: **exit 0**, Next.js 16.1.6/Turbopack compiled, TypeScript checks completed and all eight static pages generated. Existing API routes, including Gemini/WMS, remain dynamic. Existing outdated Browserslist data notice was not addressed through unrelated dependency changes. Build was run after final production-code changes; subsequent additions were test coverage and this report. `git diff --check` passes; Git reports its existing LF-to-CRLF checkout warning for the edited store file.

## Open questions and deferred work

- No implementation blocker remains for M3. M4/M5 must consume these APIs explicitly; nothing visible or automatic was added in this milestone.
- Revision identity follows the existing dataset-object WeakMap contract. Future in-place dataset mutations must honor that existing contract by replacing the dataset object; M3 does not redesign global revision tracking. Current publication also checks BBOX identity on explicit requests.
- M2 still deliberately rejects unobserved Gemini XML variants. Actual service interoperability and provider-side completeness cannot be established from mocks; counts are parsed member counts, not completeness guarantees. No COUNT/paging assumptions or live probes were added.
- The planning report's possible session buffer override and COUNT/continuation investigation are superseded here by the explicit M3 instruction: fixed production 100 m, no COUNT/paging work.
- Future configuration/password-manager UI supplies credentials via `setCredentials`. No username preference or connection configuration is persisted by M3. The connection remains the single approved M1 identifier.
- Future map/card, visibility controls, popups, styling, configuration/password-manager flow and any automatic fetch policy remain M4+ work. No topology/elevation/connection matching or survey validation behavior was added.

**No real Gemini data or credentials were used. No live Gemini WFS calls were made. No UI, map rendering, reference card, sidebar integration, popup or configuration controls were implemented. M4 or later functionality was not implemented.**
