# Gemini VA WFS integration planning

Date: 2026-10-28  
Status: planning only; no WFS implementation  
Target: feature/photo-workspace at 373d9a055615ecbc809409006eae20446f6bf55f, Improve GMI photo defaults and marker ordering  
Release reference: release/v1.2.0 at addf255d3f0966d9b98983a14a4d1617fb3c1582, Prepare GMI Validator 1.2.0 release

## 1. Executive summary

Implement a small, read-only reference integration on the photo-workspace branch: selected uploaded survey extent plus a metric buffer, two bounded WFS GetFeature requests through a same-origin Next.js route, and separate reference vectors on the existing Leaflet map.

Recommend an explicit **Hent eksisterende anlegg** action for one selected survey layer, a **100 m default buffer**, and one session-only **Eksisterende anlegg · Gemini VA** card with **Ledninger** and **Punkter** visibility controls. Initially retain one current Gemini result pair per workspace, recording the source survey and request area. Do not pass Gemini features through the survey store's addLayer action: it automatically prepares outlier, incline, elevation and terrain-related analyses.

Use **POST /api/gemini-wfs**, implemented at src/app/api/gemini-wfs/route.js. The browser sends a small JSON body containing transient credentials, an approved connection identifier, line/point selector and EPSG:25832 BBOX. The server constructs the fixed upstream URL and Basic Authorization header. Return bounded raw GML and parse it in a dedicated browser adapter using native DOMParser. Preserve source geometry/attributes separately from display-only WGS84 GeoJSON. No new XML dependency is justified by the current project.

Reuse WMS security and form patterns, not its generic target-URL interface, raster renderer or client-side Basic encoding. Keep new WFS credentials outside the devtools-wrapped Zustand store. Persist only a validated non-secret connection preference. Credentials, feature payloads, BBOX, request provenance and reference visibility remain in memory.

### Direct recommendations

| Question | Answer |
| --- | --- |
| What WMS code can be reused? | Form/autocomplete/modal conventions; bounded transport, timeout, redirect rejection, no-store/safe headers and sanitized-error patterns; external-card placement. Do not reuse WMS raster or operation/target validation unchanged. |
| Where does configuration live? | Separate GeminiWfsConnectionModal owned by Home in src/app/page.js, accessible from the existing map connection-control area and new reference card. |
| Where does the proxy live? | src/app/api/gemini-wfs/route.js, POST-only Node App Router route. |
| Credential flow? | Standard form -> private client memory -> same-origin HTTPS JSON POST -> request-local server variables -> server-built Basic header upstream. Never query strings, persisted stores or logs. |
| GML parsing location? | Browser DOMParser, following the photo branch's namespace-aware parsing precedent without reusing its photo-specific profile. |
| BBOX source? | All points and every line vertex of the selected survey, strictly transformed from operational CRS into EPSG:25832 before taking min/max. |
| Default buffer? | 100 m per side, a product starting point for nearby junction context; a small advanced numeric field can allow 10–500 m initially. |
| Layer model? | Dedicated GEMINI_WFS_REFERENCE domain: one parent/result with two vector sublayers, outside survey layers/layerOrder and photoSession. |
| Persisted/session-only? | Persist approved endpoint preference only. Password manager owns durable credentials. Features and all request/map reference state stay session-only. |
| Main security risks? | Credential leakage, SSRF/redirects, authenticated cache leakage, XML/popup injection and excessive/abusive queries. Fixed target, strict bounds, safe text and no logs/caches address these. |
| Main implementation risks? | Permissive CRS fallback, accidental survey analyses, profile variations, incomplete results, stale async publication, photo/tool click conflicts and Vercel payload limits. |
| Milestone order? | Seven: proxy -> parser -> extent/fetch session -> map/card -> connection/workflow UI -> popup inspection -> integrated acceptance/docs. |
| Photo branch implications? | Separate session/domain and pane patterns help; multiple interaction modes, lifecycle paths and responsive workspace ownership require regression coverage. |
| Material corrections to assumptions? | General GML survey import does not exist here; GML supplies photo positioning. WMS already has a hardened backend. The survey normalizer conflates absent and zero Z; WMS's 10 MiB cap is too high to copy for buffered Vercel responses. |

### Investigation boundaries

The worktree was clean at the start. HEAD and the locally recorded origin/feature/photo-workspace ref both resolve to 373d9a0. This verifies local refs, not fresh remote synchronization. No checkout, remote fetch, branch update, implementation, installation or deployment was performed. No AGENTS.md was found in the inspected repository/ancestor paths. No sub-agents were used.

The requested GPT-5.6 Sol High model cannot be selected through this session's available controls. Use of that model cannot be claimed; this limitation was disclosed before investigation.

Gemini facts below are accepted from the user's completed manual tests. No authenticated Gemini request was made and no credentials were handled. Framework/platform documentation was consulted only for relevant platform constraints, with primary-source links below. Existing paths/functions are repository evidence; proposed new paths/names are design recommendations.

## 2. Current architecture findings

### Framework, routing and backend

- [package.json](../../package.json) declares Next.js ^16.1.1, React 19.2.1, Leaflet ^1.9.4, React-Leaflet ^5.0.0, proj4 ^2.20.2 and Zustand ^5.0.9. There is no declared general XML/GML parser dependency. Existing XML parsing uses native browser DOMParser; a transitive package should not become an accidental application API.
- [src/app/page.js](../../src/app/page.js), Home, is a client component coordinating upload, map, dialogs, survey inspection/analysis and photo workspace. [layout.js](../../src/app/layout.js) supplies global CSS, Norwegian document language and Vercel Analytics.
- App Router routes already include api/wms-proxy, api/contact, api/track, api/stats and tracking health/debug. No separate service or database is needed for WFS.
- [next.config.mjs](../../next.config.mjs) enables reactCompiler and does not configure static export. No tracked vercel.json was found. Deployed plan, region, Fluid Compute, dashboard log capture and network policy cannot be established from repository files.
- [contactRequestPolicy.mjs](../../src/lib/contact/contactRequestPolicy.mjs), validateContactHeaders, checks JSON content type, exact request-origin agreement and supplied Sec-Fetch-Site. [contactHandler.mjs](../../src/lib/contact/contactHandler.mjs), readBoundedContactRequestBody/createContactPostHandler, demonstrates bounded streamed input and an injectable handler useful for proxy tests.

### Survey import and coordinates

[FileUpload.js](../../src/components/FileUpload.js), useFileLoader/handleFile, detects GMI/SOSI/KOF, calls GMIParser.toObject, SOSIParser.parse or KOFParser.parse, resolves crsContext, adds a layer and also sets legacy file/data state. Its input accepts .gmi, .sos, .sosi, .kof and .txt. [GlobalFileDrop.js](../../src/components/GlobalFileDrop.js) uses the same loader.

Survey data holds points/lines with coordinates as x/y/z objects and separate attributes:

- [gmiParser.js](../../src/lib/parsing/gmiParser.js), GMIParser._parseCoordinates, preserves vertices and uses null for missing Z. Per-object extent is retained as a source string where supplied; it is not a unified numeric workspace BBOX.
- [sosiParser.js](../../src/lib/parsing/sosiParser.js), SOSIParser, consumes sosijs GeoJSON, canonicalizes attributes and calls normalizeFeature. Polygon outer rings also become lines. Query the normalized geometry actually held by the app.
- [kofParser.js](../../src/lib/parsing/kofParser.js), KOFParser.parse, builds normalized points/lines and crsContext. KOF is a valid source for a reference request.
- [normalizeFeature.js](../../src/lib/parsing/normalizeFeature.js), normalizeFeature/toCoordObj, coerces numeric values and defaults missing Z to zero. It cannot provide lossless Gemini XY/XYZ adaptation.

**Scope correction:** there is no general GML survey importer in useFileLoader. GML in this branch supplies photo positions through parseTerrainPhotoGml. A GMI/GML attached as a photo source is not automatically a survey map layer. General GML survey import is separate scope.

### Store, sidebar and layers

[store.js](../../src/lib/store.js) wraps Zustand with devtools and persist. It holds survey layers/layerOrder, legacy data/file, analyses, terrain, outliers and UI. addLayer immediately prepares analyses. removeLayer clears related UI/inspection and, when removing the last survey, legacy data. resetAll also invokes photoSession.clear. showAllLayers/hideAllLayers/getVisibleLayerIds operate on survey layers.

Persistence uses gmi-validator-storage, version 3. partialize persists settings, most ui and lastActive, excluding survey payloads and customWmsConfig. Putting new WFS credentials/results inside ui/settings would therefore risk persistence. The existing one-hour rehydration handling is not an adequate credential lifecycle.

[LayerManager.js](../../src/components/LayerManager.js) uses getWorkspaceLayerEntries to show PhotoLayerCard or LayerPanel and appends WMS separately. [layerPresentation.mjs](../../src/lib/layerPresentation.mjs), getLayerType, recognizes GMI/SOSI/KOF or explicit FOTO; getWorkspaceLayerEntries prepends photos while preserving survey order. [LayerTypeBadge.js](../../src/components/LayerTypeBadge.js) uses that helper. [LayerPanel.js](../../src/components/LayerPanel.js) is survey-specific, including analyses, table, filters and highlight controls.

[Sidebar.js](../../src/components/Sidebar.js), Sidebar, uses LayerManager in multi-layer mode and retains a legacy single-file path. Home replaces the ordinary sidebar in photo/validation modes. Keep connection access at map level as well as in the new card, without changing workspace ownership.

### Map, extent and CRS

[MapView.js](../../src/components/MapView.js) dynamically loads MapInner with ssr:false. [MapInner.js](../../src/components/MapInner.js), MapInner, builds memoized survey GeoJSON and handles filtering, camera fitting, styles, markers, highlights and popups. projectedLayerFeaturesRef caches projections using dataset/filter identity.

BoundsController and LayerFitBoundsController derive geographic Leaflet bounds from rendered features for camera movement. They may exclude outliers or target a layer. These are view concerns: WFS extent should not depend on visibility, filters, camera framing or returned Gemini lines. Keep Gemini out of these controllers.

[coordinateProjection.js](../../src/lib/map/coordinateProjection.js), getMapSourceProjection, checks getOperationalEpsg then header fallbacks. projectCoordinateToWgs84 returns original XY if transformation fails. Do not reuse that permissive failure behavior for a network request. projectPhotoCoordinate is a useful strict-result precedent and explicitly does no vertical transformation.

[telemetry/crs.mjs](../../src/lib/telemetry/crs.mjs), classifyCrs/getOperationalEpsg, recognizes operational 25832, 25833 and 4326 in declared/inferred/assumed states. FileUpload asks the user to choose zone 32/33 for missing/invalid CRS. Reuse the operational result, including an explicit user assumption, and fail on unsupported CRS. Although coordinateProjection defines 32632/32633, getOperationalEpsg does not accept them; do not expand CRS support implicitly.

[tracking/datasetCoordinate.js](../../src/lib/tracking/datasetCoordinate.js), getDatasetCoordinate, samples first coordinates to produce a telemetry centroid. It is unsuitable for all-vertex extent. No reusable pure survey-extent-plus-buffer helper was found.

### Inspection and styling

MapInner.onEachFeature binds [featurePopupContent.mjs](../../src/lib/map/featurePopupContent.mjs), createFeaturePopupContent, which constructs DOM nodes with textContent. MapInner delegates .inspect-data-btn, .vis-i-3d-btn and .show-profile-btn into survey state using layer IDs and source indices.

[objectTableInspection.js](../../src/lib/objectTableInspection.js), createExactObjectInspection/createContextualObjectInspection, enforces survey object/revision ownership. [datasetRevision.js](../../src/lib/validation-v2/datasetRevision.js), getDatasetRevision, provides opaque in-memory dataset identity. Reuse identity if useful, but do not manufacture survey references to inspect Gemini records.

MapInner.getColorByFCode/getLineWeight and [lineStyle.mjs](../../src/lib/map/lineStyle.mjs), getLineStyle/getOverflowDashArray, implement survey network symbology. Dashes already encode drainage/overflow cases. [layerOrder.mjs](../../src/lib/map/layerOrder.mjs), getLayerPaintOrder/getLayerMarkerZIndexOffset, controls survey ordering. Reference data should not consume survey palette assignments or alter marker ranks.

## 3. Existing WMS implementation findings

git diff between release/v1.2.0 and HEAD shows **no differences** in WmsLayerModal.js, AuthenticatedWmsLayer.js, api/wms-proxy/route.js, wmsProxyPolicy.mjs or tests/wmsProxyPolicy.test.mjs. Inspection of the current files therefore also covers the release implementation without switching branches.

### Form and persistence

[WmsLayerModal.js](../../src/components/WmsLayerModal.js), WmsLayerModal.handleSubmit, saves only URL under gmi-validator-wms-url and calls setCustomWmsConfig with runtime credentials/config. Modal-local password clears on close; credentials remain in in-memory customWmsConfig for tiles. clearCustomWmsCredentials exists, but resetAll does not explicitly clear that WMS slice. WFS should define its lifecycle explicitly.

The modal uses a real form/onSubmit, labels and stable IDs, name=username/password, type=password, autoComplete=username/current-password, and autoComplete=url. These are reusable password-manager conventions. fetchCapabilitiesLayers uses same-origin proxy fetch and browser DOMParser. WMS layer discovery/manual selection is unnecessary for the two confirmed WFS types.

These inputs support browser heuristics, but source inspection does not prove that every password manager saves AJAX submissions. Gemini/QGIS-origin credentials do not automatically become available to a form on the Validator origin. Verify save/autofill on the actual deployed hostname; stable WFS-specific IDs/autocomplete sections can distinguish WMS/WFS. See [MDN password form guidance](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passwords).

### Raster and transport

[AuthenticatedWmsLayer.js](../../src/components/AuthenticatedWmsLayer.js) defines ProxiedAuthWMSTileLayer, createAuthenticatedWmsLayer and updateAuthenticatedWmsLayer. It requests tiles using GET /api/wms-proxy?url=..., sends browser-built Basic in x-wms-auth and displays blobs. This is raster-specific. Do not copy btoa encoding or URL/error logging patterns for WFS.

Home opens WmsLayerModal from the map-bottom-left control. LayerManager exposes Gemini WMS visibility via ui.mapOverlayVisibility.geminiWms and opacity via customWmsConfig. MapInner renders AuthenticatedWmsLayer separately with tile zIndex=450 and WmsLayerRefresher. WFS is an additional vector reference, not a replacement or basemap.

[api/wms-proxy/route.js](../../src/app/api/wms-proxy/route.js) uses runtime=nodejs, dynamic=force-dynamic, GET/OPTIONS, a 15 s abort timer, no-store upstream fetch, manual redirects, bounded reads, strict response types and sanitized errors. It does not log credentials or requests.

[wmsProxyPolicy.mjs](../../src/lib/wmsProxyPolicy.mjs) provides validateWmsTarget, validateWmsAuthHeader, readBoundedBody, getSafeResponseHeaders and getSanitizedError. Its policy permits HTTPS Gemini tenant subdomains under /portal/api/proxy/map/, public DNS results, GetCapabilities/GetMap and no duplicate security-relevant parameters. This is broader than the required WFS target. Its BBOX validation checks four finite numbers, not ordering, area or a fixed CRS. Its 10 MiB body limit is unsuitable to copy.

**Reuse decision:** follow tested transport/form patterns and the contact route's bounded-input/injectable-handler approach. Write a dedicated WFS policy. A small transport-only helper extraction may be reasonable later with WMS regression tests, but an initial broad proxy refactor adds risk. Do not import misleading WMS exceptions/default limits into WFS or extend WMS operation validation to allow WFS wholesale.

## 4. Current photo-workspace implications

[photoSession.mjs](../../src/lib/photos/photoSession.mjs), createPhotoSession/photoSession, holds records/assets outside Zustand. [usePhotoSession.js](../../src/components/photos/usePhotoSession.js) uses useSyncExternalStore. This is a good precedent for a much smaller Gemini session service, without copying the photo source-review machinery.

The photo domain deliberately stays outside survey selectors/feature pipelines. BBOX must exclude photos, EXIF/manual positions, photo-source GML envelopes and GMI attached only for photo associations. In a photo-only workspace, explain that survey data is needed instead of fetching around photos.

[photoMapFeatures.mjs](../../src/lib/photos/photoMapFeatures.mjs), buildPhotoMapFeatures, provides stable namespaced map IDs; [PhotoMarkersLayer.js](../../src/components/photos/PhotoMarkersLayer.js) renders separately. [photoMapPanes.mjs](../../src/lib/photos/photoMapPanes.mjs) reserves photo markers at 620 and placement at 640. Ordinary vectors use 400, survey markers 600, tooltips 650 and popups 700; survey highlight casing uses 390. Gemini reference vectors should occupy a separate pane below survey casing/vectors and photo interaction layers.

MapClickHandler, MeasureTool, PhotoManualPlacementLayer, direction editing and photo popups already share clicks. Reference vectors must not open popups/capture clicks while measuring or positioning/editing photos. Do not use survey delegated action classes. Follow the existing feature-click marker convention where needed so a reference click has intentional highlight-clearing behavior.

Keep Gemini controls outside photo source/positioning wizards. Returning between workspaces must reuse the current result without requests. Full reset clears WFS data/credentials and aborts work. Removing its survey source clears that reference result without altering photos. Generation checks must prevent late publication after reset/removal/unmount, following photo session lifecycle precedents.

## 5. Gemini WFS constraints and confirmed behavior

Accepted facts from the user's manual investigation:

- Endpoint: https://faerder.geminisuite.com/portal/api/proxy/map/va-basis.wfs.
- User-specific HTTP Basic Authentication works in QGIS.
- Direct browser fetch from https://gmi-validator.vercel.app fails CORS preflight because the endpoint does not allow that origin. Use the proxy; no-cors cannot deliver readable feature data.
- WFS 2.0.0; gemini:VA_LINE and gemini:VA_MPNT; working EPSG:25832.
- VA_LINE declares generic gml:GeometryPropertyType; all 100 sampled features were LineString, generally XYZ. Preserve intermediate vertices.
- VA_MPNT samples were Point, mostly XYZ but some XY. IDs follow VA_LINE.<LSID> and VA_MPNT.<PSID>.
- BBOX [579300,6559200,579900,6559800] (~600 × 600 m) returned 267 lines (~335 KB) and 162 points (~194 KB), ~529 KB total. Measured point request/download/write time was ~427 ms. This supports interactive local fetching, not a universal latency/size guarantee.
- Intersecting lines are returned whole, including parts outside BBOX. Preserve them; do not enlarge subsequent requests from their bounds. Returned points were inside BBOX.
- numberMatched may be unknown and numberReturned may incorrectly be 0 with populated members. Count actual members.
- Legacy geometry Z=0 generally means unknown elevation. Lines may have useful endpoints with zero intermediate Z. Do not interpolate, flatten, remove vertices or treat this as a transport fault. Nonzero Z remains unverified source data.
- COVER_Z appears to mean cover/lid elevation, independently populated from geometry Z. Keep these concepts separate; vertical datum/precise geometry-Z meaning is not established here.

Retain the confirmed schema: line LSID/LENGTH/DIM/YEAR, OWNER/STATUS/FCODE/FCODEGROUP/MATERIAL/NETTYPE/RESPONSIBLE and their title pairs; point PSID/OBJWIDTH/OBJLENGTH/STATION/COVER_Z/YEAR, OWNER/STATUS/FCODE/CUST_FUNC/BUILDSTYLE/TYPE/RESPONSIBLE and their title pairs; both GEOMETRY and FunctionResult1–5. Geometry belongs in the source geometry record; scalar fields remain attributes. Do not infer network mappings from title substrings.

Not established by the supplied facts: actual Gemini namespace URI, all coordinate serializations/CRS inheritance rules, response MIME/encoding, COUNT effectiveness/server cap, paging links and non-ASCII credential encoding. Resolve these with sanitized structural fixtures or a controlled implementation-time smoke test. They do not invalidate the accepted facts above.

## 6. Recommended frontend/backend architecture

### Proposed modules

| Proposed path | Responsibility |
| --- | --- |
| src/app/api/gemini-wfs/route.js | Thin POST adapter, Node runtime, no persistence/logged credentials. |
| src/lib/gemini-wfs/wfsProxyPolicy.mjs | Server-only fixed registry, validation, URL construction, resource/header/error policy. |
| src/lib/gemini-wfs/wfsProxyHandler.mjs | Injectable fetch handler: origin/input checks, transient auth, timeout and bounded response. |
| src/lib/gemini-wfs/parseGeminiGml.mjs | Native browser DOMParser adapter with injectable parseXml for tests; no credential awareness. |
| src/lib/gemini-wfs/geminiExtent.mjs | Pure strict survey reprojection and metric extent/buffer. |
| src/lib/gemini-wfs/geminiClient.mjs | Two same-origin POSTs, deliberate XML decoding, parser invocation and safe errors/cancel. |
| src/lib/gemini-wfs/geminiSession.mjs | One current result pair, private credential slot, request generations, subscriptions/cleanup. |
| src/components/gemini-wfs/useGeminiSession.js | useSyncExternalStore bridge with empty server snapshot. |
| src/components/gemini-wfs/GeminiReferenceLayer.js | Independent Leaflet vectors and read-only interactions. |
| src/components/gemini-wfs/GeminiReferenceCard.js | Visibility, counts, provenance/status, fetch/refresh/remove/configure. |
| src/components/gemini-wfs/GeminiWfsConnectionModal.js | Standard credential form and URL-only preference. |
| src/lib/gemini-wfs/geminiPopupContent.mjs | Curated safe attribute presentation using existing popup styling. |

These are boundaries, not a requirement to create empty abstractions. No general GIS connection framework is necessary.

### Request contract and target restrictions

Use POST rather than browser GET. Accept only connectionId=faerder-va-basis, featureType=lines or points, bbox as four JSON numbers, username and password. Source dataset/revision stays browser-only. Keep endpoint, operation, version, CRS and any COUNT server-controlled. Reject unknown fields, wrong types, malformed/oversized JSON and all query parameters. Use one canonical contract; if duplicate JSON-key rejection is omitted, always build one fresh upstream URL from parsed allowed values, never forward raw input.

Require application/json and matching Origin; reject incompatible supplied Sec-Fetch-Site, following validateContactHeaders. Compare against the canonical request origin without blindly trusting arbitrary forwarded hosts. Same-origin comparison supports localhost/authorized previews without a wildcard origin permission. Do not return CORS allow-origin headers or add a cross-origin OPTIONS path. Unsupported methods return sanitized 405 and safe headers.

Map the connection identifier to **exactly** HTTPS faerder.geminisuite.com and /portal/api/proxy/map/va-basis.wfs. The browser cannot supply a target URL, port, path, header, XML request, filter or operation. Construct fresh upstream parameters:

- SERVICE=WFS; VERSION=2.0.0; REQUEST=GetFeature.
- TYPENAMES=gemini:VA_LINE or gemini:VA_MPNT from the server mapping.
- SRSNAME=EPSG:25832.
- BBOX=minX,minY,maxX,maxY,EPSG:25832 in easting/northing order.
- Optional fixed COUNT only after verifying count/completeness behavior below.

Initial runtime operations need only GetFeature. No GetCapabilities/DescribeFeatureType UI discovery, GetPropertyValue, hits, FILTER/CQL, RESOURCEID, arbitrary outputFormat/startIndex or Transaction. Use the confirmed default GML response; do not assume GeoJSON output exists. Do not call validateWmsTarget on WFS: it has intentionally different rules.

### Initial resource safeguards

These are proposed product limits, not measured service limits:

| Guardrail | Recommendation |
| --- | --- |
| Incoming body | 16 KiB maximum; check declared length and actual streamed bytes. |
| Credentials | Required bounded strings, initially 256 username/1024 password characters plus total byte cap. Reject colon in username, CR/LF/control characters and invalid Unicode. Preserve password exactly, without trimming/normalizing. |
| BBOX | Four finite numbers, strict minX < maxX and minY < maxY, fixed CRS; reject strings/nonfinite/reversed/degenerate/extreme bounds. |
| Coordinate sanity | Conservative UTM32 envelope, e.g. easting 100000–900000 and northing 0–10000000; not a municipal boundary. |
| Query area | Maximum 2000 m per side, hence at most 4 km². Reject instead of silently cropping or combining distant files. |
| Response | 3 MiB per type, declared and streamed decoded-byte checks; cancel excess reads. |
| Duration | 15 s total upstream deadline including body read; also cancel on client abort. |
| Concurrency | One active result-pair request, at most two upstream calls concurrently. |
| Browser parser | Initially at most 2000 features/type and 100000 coordinate tuples/type, with explicit too-large errors. |

The sample supports local BBOX requests, not unlimited query size. Large/dispersed datasets should receive dimensions and an actionable area-too-large message. Defer automatic tiling/subareas. Preserve whole intersecting lines even when they extend beyond BBOX; byte/vertex limits still apply.

Do not silently declare capped data complete. Prefer fixed COUNT=2001 and a 2000-feature display cap **only after verifying the service honors COUNT**. Reject sentinel-sized results, nonempty continuation/next links and any byte/parser cap as incomplete/too large. Never follow returned URLs. Count real members even when numberReturned=0. numberMatched=unknown is normal. The UI reports returned objects, not certified exhaustive network coverage. If the service silently caps below COUNT without a signal, client metadata cannot prove completeness: establish/document that cap and avoid a completeness claim. Unbounded pagination is not initial scope.

### Upstream transport and response

Build Basic server-side from validated username and exact password using Node Buffer. UTF-8 is a proposed encoding; confirm service behavior before claiming non-ASCII account support. Do not copy browser btoa limitations. Password may contain colon; username may not.

Use upstream GET with cache=no-store, redirect=manual and AbortController. Forward only server-built Authorization and an XML Accept header. Do not forward cookies, incoming Authorization, arbitrary user headers or bodies. Reject every redirect, including same-domain redirects, without forwarding credentials further.

Require upstream 200 and approved XML/GML MIME: initially application/xml, text/xml and application/gml+xml; include application/vnd.ogc.gml only with evidence. Reject HTML login pages, SVG/scripts, missing/unsupported MIME or charset. Preserve verified encoding and decode deliberately in the browser; Response.text should not be assumed to honor every XML encoding. No schema/DTD resolver is involved.

Successful responses carry bounded raw bytes; errors carry sanitized JSON codes. Suggested mapping: invalid input 400, body too large 413, wrong content type 415, cross-origin 403, upstream credential rejection 401/reconnect, permission rejection 403, upstream rate limit 429 with bounded safe Retry-After, timeout 504, transport/redirect/invalid response 502. Distinguish policy 403 from provider 403 with a fixed code. Never forward upstream error bodies, Location, Set-Cookie or WWW-Authenticate challenges. An OWS exception in HTTP 200 is recognized by the browser parser and becomes a safe service error, not empty success.

Every success/error gets Cache-Control: private, no-store and X-Content-Type-Options: nosniff. Follow WMS's default-src 'none'; sandbox CSP for raw XML. Supply validated success Content-Type or JSON error Content-Type. Do not forward cache validators/cache headers. No shared cache, revalidation, disk, Supabase or module-level server credential state. Explicit no-store complements POST even though current Next.js does not cache POST handlers by default; see [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers).

The 3 MiB cap stays below Vercel's documented 4.5 MB buffered function payload limit. Do not copy WMS's 10 MiB bound or introduce streaming to evade sensible local-query limits. Check deployed function duration so the 15 s application deadline leaves response overhead; the repository does not establish the deployed plan/Fluid configuration. See [Vercel function limits](https://vercel.com/docs/functions/limitations).

## 7. Credential/security model

1. Use a real form, stable WFS-specific IDs, labels, named username/password fields, type=password and autocomplete=username/current-password. Reading FormData on submit can tolerate autofill without relying exclusively on controlled onChange events. Keep a visible success transition. Do not disable autocomplete. Verify headed-browser saving/autofill manually.
2. Persist only approved connection ID/base URL preference, e.g. gmi-validator-gemini-wfs-url. Prefill/show the confirmed URL read-only initially. A localStorage URL must map to an approved connection and never authorize a new proxy destination. Keep the WMS key separate.
3. Retain credentials in a private client module closure or provider ref; expose only credential-free status snapshots. Do not put credentials in Zustand actions/state, React keys, serialized request/cache keys, diagnostics or error messages. Excluding persist alone does not address devtools exposure.
4. Two same-origin HTTPS POSTs carry credentials transiently. Each server invocation builds its own Authorization in request-local variables. No shared municipal account, credential-bearing cookie, Vercel credential variable or persistent server session. JavaScript cannot promise secure memory erasure; clear references without claiming it.
5. Cancel/close clears form-local password. A successful connection retains credentials only in the private session so refresh works. Disconnect, full reset, endpoint/account replacement, auth failure and unmount clear credentials and abort work. Endpoint/account replacement also removes the previous result before the new identity is used. After auth failure within the same account, any older reference result must remain clearly labeled as older data, never as a successful current fetch.
6. Never log credentials, Authorization, request bodies, upstream bodies, BBOX coordinates or features. If operational diagnostics are needed, use fixed status/error codes and aggregate duration/byte counts. Catch errors before unhandled rejection handlers: Home persists developer error/rejection messages in localStorage.
7. Verify deployment instrumentation does not capture POST bodies/custom auth headers or responses. Application code can prevent its own logging, but cannot prove dashboard/APM retention policy. Do not add WFS payloads to Vercel Analytics or /api/track.
8. Render attributes as text only. No innerHTML/dangerouslySetInnerHTML, XML insertion into the page, schemaLocation fetches, automatic links or FunctionResult evaluation. Reuse safe popup primitives where justified.

A fixed target and redirect rejection prevent generic proxy use and credential exfiltration via a caller-selected destination. WMS public-address checks may provide defense in depth, but preflight DNS lookup is not DNS pinning. One trusted fixed host does not justify a new generalized egress framework. Any later configurable host requires a separate SSRF review.

The application has no login gate around the proposed route. Origin checks constrain browser use, but nonbrowser callers can forge them. A fixed authenticated target still allows invocation cost and attempted upstream logins. Body/BBOX/time limits, explicit fetching and no automatic retries are baseline protections. Check deployment-level rate controls before public rollout; add a modest endpoint throttle if absent. Do not treat the contact per-process limiter as a durable cross-instance boundary or introduce Redis/accounts by default.

## 8. BBOX/reference-layer workflow

### Source and algorithm

Fetch around **one selected uploaded survey layer**. With multiple surveys, show a source selector. Default to the newest successful upload (layerOrder prepends files), show its filename and allow another selection. Legacy state.data alone is insufficient because it represents the latest upload and may differ from the inspected layer.

A pure extent helper should:

1. Resolve operational CRS with getOperationalEpsg. Accept declared/inferred/explicitly assumed supported CRS; stop with actionable Norwegian text on unknown/unsupported CRS.
2. Traverse every point coordinate and every normalized line vertex. Ignore Z for XY bounds. Do not sample, use raw extent strings or only endpoints.
3. Require finite numeric XY. Never coerce null/empty/string values into zero. If unusable geometry could materially change coverage, fail instead of silently dropping it. No valid geometry means no request.
4. Leave EPSG:25832 XY unchanged. Transform each 25833/4326 XY directly to 25832 using existing proj4 definitions; require finite/plausible results. Do not use projectCoordinateToWgs84's identity fallback, buffer degrees, or transform only corners of another-CRS extent. No vertical transformation.
5. Compute min/max incrementally; add bufferMetres on all sides. A single point/flat line becomes a valid area after nonzero buffer. Round minima outward down and maxima outward up to metres for coverage/stable request keys.
6. Apply UI equivalents of the authoritative server coordinate/area limits. Outliers may legitimately make the area too large; do not silently reuse camera outlier exclusions. Offer correction/source selection, with explicit subarea support deferred.

Viewport pan/zoom, survey visibility/tema filtering, photo selection and returned Gemini geometry do not affect the request. This prevents request loops and surprise downloads.

### Interaction and lifecycle

- Hent eksisterende anlegg starts an explicit flow. Without credentials/config, open connection UI and explain URL-only storage. Configuration may be saved without a survey as configured-but-untested; do not label access verified. No separate capabilities probe is needed.
- **100 m per side** is a modest starting buffer for nearby junction context. The measured 600 m square supports local fetching, not an optimal buffer. Keep a named tested default and a compact advanced 10–500 m session-only field. The server query-area guard remains authoritative.
- Fetch line/point data concurrently, at most two requests. Validate/parse both before atomically publishing a matching pair. Empty collections are valid. If either fails, avoid half-new/half-old overlays: retain any previous good pair with its original source/time and a retry error.
- Show pending/loading state and cancel; disable duplicate fetch. Do not auto-retry auth, size or XML errors. User can retry transient faults explicitly.
- Record sourceLayerId, dataset revision, connection/account generation, BBOX, buffer, counts and fetchedAt. Account generation is an opaque client token, not a credential hash. getDatasetRevision can provide source identity without changing survey validation contracts.
- Coalesce identical concurrent requests using source identity/revision, connection/account generation, BBOX, CRS and buffer. Never include credentials in serialized keys. Keep one successful result; visibility/workspace changes do not fetch. Oppdater explicitly bypasses result reuse.
- New survey/source revision or changed buffer marks the previous result outdated, showing its old provenance. Do not relabel or auto-refresh it. New upload suggests the new source for an explicit fetch. Removing the source clears its reference result and cancels work. Full reset/disconnect/remove invalidates the generation so late responses cannot recreate data.
- Keep the camera at survey framing on success. Whole returned lines remain visible outside BBOX. Optional fit-to-reference can wait; do not automatically fit to their full reach.

## 9. GML parsing/data model recommendation

### Choose A: raw GML through proxy; parse in browser

The branch already uses browser DOMParser without an XML package, proj4 is on the map path and representative payloads are modest. A narrow adapter adds little bundle weight. Serverless execution remains bounded I/O rather than XML tree construction plus JSON serialization. Browser memory still holds bytes/text/DOM/source records temporarily; release raw text/DOM after adaptation and enforce feature/vertex limits.

[terrainPhotoGml.mjs](../../src/lib/photos/terrainPhotoGml.mjs), parseTerrainPhotoGml, demonstrates namespace-aware traversal, DOCTYPE/ENTITY rejection, parsererror checks, CRS normalization and raw/derived separation. Its profile is gml:FeatureCollection containing photo features, not WFS 2. Do not reuse that function for Gemini or turn it into an all-profile parser. Share only small proven helpers when useful.

Backend transformation would require an intentional server XML parser dependency: native DOMParser is not a dependable Node server API. It adds server CPU/memory and another public feature contract without current product need. Revisit if measured browser performance, server-side semantic enforcement or multiple consumers warrants it. A worker is an optional measured refinement.

### Narrow parser contract

- Require WFS 2 FeatureCollection and namespace-aware members, normally wfs:member. Handle OWS ExceptionReport separately. Match namespaceURI/localName, not literal prefixes; establish the Gemini namespace URI from sanitized structural evidence.
- Reject malformed XML, DOCTYPE/ENTITY declarations, wrong roots, contradictory CRS/dimensions, duplicate IDs and unexpected member nesting. Empty collection is valid. Prefer rejecting a pair containing unsupported features in the initial version rather than silently dropping them.
- Support confirmed Point/LineString in GEOMETRY. Point pos can be XY/XYZ. Support the actual line posList/repeated-pos serialization after fixture verification. Do not infer XYZ solely because a line's ordinate count is divisible by three: it can also be divisible by two. Honor unambiguous srsDimension inheritance and reject ambiguity.
- Normalize verified EPSG URI/URN forms to 25832. Preserve declarations/provenance. A fixed-request CRS can be fallback only under a deliberate documented inheritance rule; never override contradictory declarations. Map conversion alone changes easting/northing to longitude/latitude.
- Validate finite numeric lexical values. Preserve full line order/vertices, including outside BBOX. No simplification or reducing Z to one feature-wide value.
- Count actual members/records; numberReturned=0 must not suppress results and numberMatched=unknown is acceptable. Reject continuation/cap conditions without fetching a supplied URL.
- Preserve field spelling, string IDs/codes including leading zeros, and distinguish absent, xsi:nil=true and empty values. Numeric presentation helpers return null for missing/invalid values and retain original text; never use Number(null) or Number('') to manufacture zero.

### Internal/source and display representation

Use immutable source records with a stable key (connectionId/typeName/gml:id), source type, gmlId, LSID/PSID as string, sourceCrs, geometry type/coordinates, and scalar attributes with nil/presence information. Preserve fields not initially displayed, including FunctionResult1–5, as inert data. Unsupported nested fields require bounded inert handling or an explicit diagnostic.

Source geometry stays in EPSG:25832 with original coordinate arity: [x,y] or [x,y,z]. Z=0 stays literally zero in source evidence, with derived usability marked unknown-legacy-zero; absent Z stays absent. Nonzero Z is present-unverified. Preserve partial line heights and never interpolate. COVER_Z remains a separate source attribute/numeric presentation; do not use it to fill geometry vertices.

Build separate display-only WGS84 GeoJSON with XY longitude/latitude coordinates and credential-free lookup keys. Source projected geometry is an internal structure, not mislabeled RFC 7946 GeoJSON. Popups resolve keys back to source records. Never run Gemini through normalizeFeature or rename its codes to survey S_FCODE/Type to force renderer compatibility.

## 10. UI/layer integration recommendation

### Parent model and controls

Use one GEMINI_WFS_REFERENCE parent and two sublayers. The shared source/BBOX/account generation makes one refresh/remove operation coherent. Two independent survey cards duplicate provenance and invite analysis misuse. This domain is neither survey format, FOTO nor raster WMS.

Add GeminiReferenceCard beside the existing external WMS card in LayerManager. Preserve getWorkspaceLayerEntries' survey/photo semantics; a separate reference section is enough, or add an explicit reference presentation kind only if useful. Do not add records to store.layers/layerOrder or photoSession. LayerTypeBadge can gain an explicit WFS/reference label if needed, without guessing a survey format.

Card: Eksisterende anlegg · Gemini VA; read-only/reference label; source filename, buffer, fetched time; parent visibility; Ledninger/Punkter counts and toggles; loading/empty/error/stale states; Hent/Oppdater, Fjern and connection action. Parent visibility retains child choices. Fjern removes only the result; Koble fra clears credentials/results/work; a separate forget action removes the saved endpoint. Visibility is session-only.

Existing Vis alle/Skjul alle counts photo/survey entries and excludes the separate WMS card. Preserve that scope initially for the separate reference section, making scope clear if necessary; do not silently change WMS or mixed counters. Gemini parent/child controls are authoritative.

Home owns GeminiWfsConnectionModal beside WmsLayerModal. Add WFS access to the current map connection-control group and card, rather than a new floating corner or global settings page. WMS remains independently configured/accessible, even if a user happens to use the same account. Extract a shared modal/form primitive only when clearly useful; no combined provider framework.

### Styling and ordering

Use independent line/point GeoJSON under a reference pane, proposed zIndex 380: above base tiles, below casing 390/survey vectors 400, survey markers 600 and photos 620/640. Start reference points as small circle markers in that pane instead of survey pin icons. Keep source IDs stable and separate from survey index IDs.

Choose a restrained theme-compatible reference color and lower visual weight than uploaded survey geometry, using existing semantic tokens. Verify against the four actual backgrounds: Kartverket Topo, Kartverket Gråtone, OpenStreetMap and Ingen. Do not prescribe a hardcoded network palette or automatically map Gemini codes. Dashes are optional because they already mean drainage/overflow for surveys. Source labeling, reference legend swatch, pane order and simple point outline establish distinction. Local hover/popup emphasis must not mutate global survey highlights.

WMS zIndex=450 belongs inside tilePane, so it is not directly comparable to custom vector pane indices. Verify WMS/reference/survey casing/photo stacking visually. Render reference vectors outside LayersControl, as existing survey/photo vectors do; do not add WFS to the background radio picker.

### Compact object inspection

Reuse the Leaflet popup shell, gmi-object-popup sizing/scroll behavior and safe text construction. Use a small Gemini-specific content adapter: createFeaturePopupContent unchanged adds survey 3D/inspection/profile actions that cannot resolve these records.

| Object | Initial useful fields |
| --- | --- |
| Line | LSID; FCODE title/code; DIM; material title/code; year; status title/code; FCODEGROUP title/code; NETTYPE title/code; owner/responsible title/code; optional source LENGTH after units verified. |
| Point | PSID; TYPE, FCODE and CUST_FUNC title/code as distinct fields; year/status; COVER_Z labeled Kote lokk; OBJWIDTH/OBJLENGTH with units verified; owner/responsible title/code. |

Prefer titles with code fallback while keeping codes available. Preserve meaningful zeros; do not apply geometry's zero-is-unknown rule to every attribute. If geometry Z is shown, explicitly identify source/quality and never label it lid elevation. No survey elevation comparison. An optional collapsed raw-attribute section is enough for expansion; no full new inspector, table, 3D or profile action is needed.

### Persistence matrix

| Data | Location/lifetime |
| --- | --- |
| Approved connection/base URL | Dedicated URL-only localStorage preference, validated on load. |
| Durable credentials | Browser password manager only, on the Validator form origin. |
| Connected username/password | Private client memory and request-local server variables; explicit cleanup lifecycle. |
| Source geometry/attributes/display features | Current browser session only; clear on result/source removal/reset. |
| Selected source, BBOX, buffer, generations, time/errors | Credential-free session snapshots. |
| Parent/child visibility/local selection | Session map/reference state, outside survey analysis selection. |
| WMS | Existing independent state; no migration/replacement. |
| Server/shared feature cache | None; reuse only the current successful in-memory browser result until refresh/change. |

## 11. Testing strategy

Regular automated tests must use synthetic fixtures and injected fetch, never real Gemini credentials or live network access. Do not commit municipal features. Tests can generate ephemeral authentication material at runtime and assert forwarding bytes without printing values; no real credential-bearing fixtures/logs.

### Existing evidence and verification performed

Relevant existing coverage: tests/wmsProxyPolicy.test.mjs, featurePopupContent.test.mjs, objectTableInspection.test.mjs, layerPresentation.test.mjs, layerOrder.test.mjs, lineStyle.test.mjs, mapBackgroundControl.test.mjs and mapPaneToolbar.test.mjs. Photo coverage includes photoSession, photoResetIntegration, photoImportLayers, photoMapFeatures, photoSpatialProjection, terrainPhotoGml, photoSourceWorkflow, photoManualPlacement, photoWorkspace and photoGmiDefaults suites. Several UI suites inspect source contracts; these do not replace browser interaction tests.

This planning pass ran the following existing tests unchanged:

    node --test tests/wmsProxyPolicy.test.mjs tests/layerPresentation.test.mjs tests/layerOrder.test.mjs tests/photoMapFeatures.test.mjs tests/photoResetIntegration.test.mjs tests/photoSpatialProjection.test.mjs tests/featurePopupContent.test.mjs tests/photoGmiDefaults.test.mjs

Result: **61 passed, 0 failed, 0 skipped**. Node emitted module-type and unavailable-localStorage warnings in the Node store harness. No build, full-suite or browser integration run was performed during planning. These results establish selected baseline behavior, not correctness of an unimplemented WFS feature.

### Proposed tests

| Area / suggested suite | Concrete cases and assertions |
| --- | --- |
| wfsProxyPolicy.test.mjs | Only fixed connection/type; callers cannot choose other host/path. Reject URL/header/operation/filter extras, queries, missing/invalid fields, oversized input and credentials. Construct exact HTTPS GetFeature parameters. Reject nonfinite/string, reversed, degenerate, excessive-side/area and implausible UTM BBOXs. |
| wfsProxyHandler.test.mjs | Inject fetch/abort; verify one upstream call, exact Basic bytes, no cookies/incoming auth/header forwarding and no redirect following. Assert logs/error objects/responses contain no generated secrets, auth headers or bodies. Test Origin/Sec-Fetch-Site, 405/415, upstream auth/permission/rate/server faults, timeout during headers/body, cancel, missing/misleading length and oversized streams. |
| Transport/cache security | Every success/error has private no-store/nosniff; valid MIME/charset retained; invalid types/login HTML rejected. No raw provider exception, Location, Set-Cookie, WWW-Authenticate, ETag or public cache headers. No credential session/cookie/server storage. |
| parseGeminiGml.test.mjs and browser parser harness | Empty/populated WFS collections, alternate namespace prefixes, actual member profile, malformed XML/DOCTYPE/ENTITY, OWS exception in HTTP 200, wrong roots, unsupported geometry, duplicate IDs, bad CRS and inherited/conflicting dimensions. Use actual DOMParser in Chromium, not only hand-built DOM mocks. |
| Geometry/source fixtures | XY/XYZ points, absent versus zero/nonzero Z, partial-Z lines, all intermediate vertices, lines extending outside BBOX, invalid/ambiguous posList lengths. COVER_Z independently absent/nil/empty/zero/nonzero. Preserve string IDs/codes, Unicode titles and source arity; no interpolation or COVER_Z substitution. |
| Metadata quirks/caps | numberReturned=0 with real members reports actual counts; numberMatched=unknown accepted; genuine empty accepted. Sentinel, continuation, byte/feature/vertex limit produces explicit incomplete/too-large result. Never request a response-supplied URL. |
| geminiExtent.test.mjs | Every intermediate line vertex affects min/max; points/lines/single point/flat line; exact 100 m outward buffer and overrides. 25832 identity, known 25833/4326 transforms with tolerances; unknown CRS, invalid XY, outliers and oversize area. No photo/source-GML/telemetry centroid inputs. |
| geminiSession.test.mjs | Exactly two type requests; empty/nonempty combinations; atomic pair publication; one failure preserves labeled older pair; duplicate coalescing; explicit refresh; unchanged counts with changed geometry; stale generations ignored; source/buffer/account changes; remove/reset/disconnect/source removal cancel and prevent late recreation. No addLayer/analysis calls. |
| Map/card integration | Independent child controls and retained child choices under parent hide/show; counts/source/time/stale/error/empty states; remove closes popup and releases geometry; stable IDs; refresh replaces same-count geometry. No survey fitBounds/order/analysis/terrain/profile/3D mutation. |
| Config/persistence | Actual named form/password autocomplete, successful/failed submit, autofill read, clear on cancel; preference-only reload; no secrets/payload/BBOX in local/sessionStorage, IndexedDB or persisted store. Storage failure still permits connection. Arbitrary saved URL cannot affect destination; no automatic fetch. |
| Browser end-to-end | Mock /api/gemini-wfs with synthetic GML, upload survey, configure/fetch/toggle/click/refresh/remove/reload. No direct request to Gemini; no credentials in URLs/storage/console; cancel/race handling; responsive map/sidebar controls. |
| WMS/photo regression | Independent WMS/WFS credentials/visibility; both render. Photo-only and full workspace, GMI defaults/associations, EXIF/GML/manual positioning, marker ordering, direction/placement, measurement, survey filters/highlights, full reset and last-source removal. |

The repository already provides dependency-free Chrome/CDP tests via tests/helpers/chromeHarness.mjs and actual XML parsing via tests/terrainPhotoGml.test.mjs/tests/browser/photoSpatialChecks.mjs. Extend this pattern with synthetic fixtures; do not casually introduce Playwright, jsdom or an XML dependency. Current browser tests can skip without Chrome; require the WFS browser checks in a release environment with Chrome installed. Password-manager save/autofill needs a separate headed-browser check with nonproduction credentials and no recorded credential artifact.

Before implementation release run the documented node --test "tests/*.test.mjs" and npm run build, followed by a bounded hosted smoke test. Capture only sanitized counts/status/duration. Verify actual Vercel limits and body/header capture policy. Local unit tests cannot establish production-origin password-manager/authentication behavior.

## 12. Implementation milestones

Tests accompany every milestone; the final slice integrates them rather than deferring testing. New paths are proposals. This planning pass creates only this report.

### M1 — Fixed contract and restricted proxy

**Scope:** approved endpoint/type registry; POST/origin/body/BBOX validation; transient server-built Basic; no redirects/logging/persistence; bounded response/time, cancellation and sanitized errors. No UI or shared credentials.

**Likely files:** src/app/api/gemini-wfs/route.js; src/lib/gemini-wfs/wfsProxyPolicy.mjs and wfsProxyHandler.mjs; tests/wfsProxyPolicy.test.mjs and wfsProxyHandler.test.mjs. Use WMS/contact as references, avoiding a broad WMS refactor.

**Tests:** all policy/transport/security cases above with injected fetch; secret non-disclosure; bounded input/output and cancellation; existing WMS regression tests.

**Acceptance:** only the exact GetFeature target can be called; invalid requests cause no upstream call; raw XML is private/bounded; auth errors are actionable/safe; no server credential state. Record unresolved MIME/encoding details for hosted acceptance.

**Dependencies:** none. No real service dependency in CI.

### M2 — Lossless narrow GML adapter

**Scope:** confirmed WFS collection and Point/LineString profile, actual-member counts, nullable scalar fields, CRS/dimension validation, source geometry and display adapter. Native DOMParser.

**Likely files:** parseGeminiGml.mjs, optional small geminiMapFeatures.mjs, synthetic fixtures under tests/fixtures/gemini-wfs/, parser unit/browser modules.

**Tests:** XY/XYZ, zero/absent/partial Z, COVER_Z independence, full lines, metadata quirks, namespace changes, malformed/hostile XML, caps and unknown geometry.

**Acceptance:** stable source keys and correctly positioned map features with intact source heights/attributes; unsupported inputs fail safely; no new dependency or normalizeFeature reuse.

**Dependencies:** M1 data/transport agreement. Verify profile using sanitized structural evidence, not committed municipal features.

### M3 — Extent, fetch service and session lifecycle

**Scope:** strict all-vertex metric BBOX, 100 m default/session override, two-call service, atomic publication, private credentials, subscriptions, generation/deduplication/abort/reset. Verify COUNT/continuation/server-cap behavior; no automatic paging.

**Likely files:** geminiExtent.mjs, geminiClient.mjs, geminiSession.mjs, useGeminiSession.js and associated tests. Small lifecycle integration with resetAll/removeLayer in src/lib/store.js, without inserting WFS records into survey state.

**Tests:** known reprojection, bounds/area limits; races, cancel, dedup, one-type failure, same-count geometry changes, reset/remove/account replacement; no secret snapshot/persistence/action; photo reset regression.

**Acceptance:** selected source produces correct bounds and exactly two bounded requests; only a current matching pair publishes; late work cannot recreate removed data. Map movement/photo operations cause no request. Reset clears auth and results.

**Dependencies:** M1–M2.

### M4 — Independent reference map and card

**Scope:** separate reference vectors/pane, parent/child visibility, counts/provenance/status, refresh/remove. Tests can seed the session before UI credentials exist. Remain outside survey/analysis feature pipelines.

**Likely files:** GeminiReferenceLayer.js, GeminiReferenceCard.js; MapInner.js and LayerManager.js; optional narrow badge/legend presentation additions and map/browser tests.

**Tests:** visibility, stable IDs, replacement/ordering; no survey camera/analysis effects; WMS/photo/casing stacking; tool-mode click suppression.

**Acceptance:** representative synthetic 267-line/162-point data renders responsively and clearly as reference data, preserving survey/photo ordering and removal cleanup. No fake analysis controls.

**Dependencies:** M3.

### M5 — Connection form and explicit workflow

**Scope:** password-manager-compatible form, URL-only preference, map/card entry points, selected source, advanced session buffer, unconfigured/empty/loading/stale/error states, disconnect/forget and visible submit outcome. WMS independent.

**Likely files:** GeminiWfsConnectionModal.js, src/app/page.js, reference card/session/client, UI/persistence tests. Shared form/modal primitives only when justified and regression-protected.

**Tests:** named/autocomplete inputs and autofill submission; storage-disabled path; invalid saved URL; no-survey/photo-only/multiple-survey states; no implicit request. Headed password-manager acceptance on the actual target origin.

**Acceptance:** upload/configure/explicit-fetch/refresh/hide/remove/reconnect works with the user's own account. Reload retains only endpoint preference. No coordinates/credentials enter URLs/tracking.

**Dependencies:** M4. Do not ship the public fetching workflow before authentication handling is complete.

### M6 — Compact object inspection

**Scope:** curated read-only line/point popups in existing shell; IDs and title/code fallbacks; separate cover/geometry elevation concepts. No global inspector, table, profile or 3D integration.

**Likely files:** geminiPopupContent.mjs, GeminiReferenceLayer.js, narrowly extracted safe popup primitives only if useful, popup content/interaction tests.

**Tests:** useful fields, null/empty/zero, malicious attributes as text, provenance, one popup/object, tool-mode suppression and no delegated survey actions.

**Acceptance:** clicking existing objects exposes useful attributes/identity without changing survey validation/selection or photo editing; bounded readable popup in constrained map layouts.

**Dependencies:** M4–M5. Map/config work can be reviewed first, but useful popup inspection should be included in the initial user-facing rollout if feasible.

### M7 — Integrated acceptance and documentation

**Scope:** mocked browser flow, full suite/build, production-origin password-manager/proxy checks, representative bounded service smoke and deployment log/cache/time review. Document scope, legacy elevation and completeness limitations.

**Likely files:** tests/geminiWfsIntegration.test.mjs, tests/browser/geminiWfsChecks.mjs, synthetic fixtures; future authorized docs/development.md/docs/privacy.md updates and implementation report. Deployment changes only if needed/authorized; never shared credentials.

**Tests:** full Node suite; browser checks with Chrome; build; WMS/photo regressions; targeted hosted smoke with user-entered credentials. Real service never becomes a regular suite dependency.

**Acceptance:** end-to-end reference workflow with no unintended persistence/logging, silent detected truncation, source confusion, photo/measurement regression or platform payload error. Record any unverifiable completeness condition honestly. No comparison or writes.

**Dependencies:** M1–M6.

Optional later refinements: measured worker offload, verified network-category styles, explicit query subareas, bounded paging if justified, additional explicitly registered endpoints. None is required initially.

## 13. Risks / open questions

| Risk/question | Evidence and disposition |
| --- | --- |
| Model selection | Requested model cannot be selected here; do not claim GPT-5.6 Sol High was used. |
| General GML survey expectation | Current import accepts GMI/SOSI/KOF. Photo GML is separate. Do not promise arbitrary survey GML without a separate importer task. |
| Credentials/devtools | Existing WMS credentials live in devtools-wrapped Zustand. New private session slot avoids repeating that exposure; developer error breadcrumbs require sanitized errors. |
| Password manager | Form semantics support heuristics, not guaranteed saving. Verify actual headed-browser workflow on the chosen Validator hostname; external Gemini/QGIS credentials do not transfer automatically. |
| Completeness | numberReturned is unreliable and numberMatched may be unknown. Establish COUNT/cap/continuation behavior, enforce bounds and avoid exhaustive-coverage claims. |
| XML variants | Generic geometry declaration permits more than the sampled profiles. Handle confirmed profiles strictly, preserving a narrow extension point. Verify namespaces/serialization/MIME/encoding. |
| CRS fallback | Current map projection has permissive fallback. BBOX must be strict; a user-assumed CRS remains an assumption. |
| Large/dispersed survey | Outliers can exceed local-query bounds. Reject with actionable dimensions/source guidance; no silent cropping, vertex removal or automatic tiling. |
| Vercel | WMS's 10 MiB bound is unsuitable to inherit. Use 3 MiB/type and check actual function duration/instrumentation. Dashboard settings were not inspected. |
| Async/account races | Generation plus abort and atomic publication prevent late/wrong-account results after reset/source/account changes. |
| Interactions/order | MapInner combines survey tools and popups; photos add modes/panes. Isolate WFS rendering/state and exercise both workflows together. |
| Sensitive VA attributes | No persistent payload, telemetry/raw diagnostics or shared cache. Continue XSS-safe rendering. no-store does not protect against an already-compromised browser. |
| Proxy abuse | Origin checks do not authenticate nonbrowser callers. Fixed destination and resource limits constrain scope; validate endpoint rate controls before public rollout. |
| Field/Z semantics | Preserve raw values; confirm attribute units and vertical meanings before precise labels/comparison. COVER_Z never replaces geometry Z. |
| Privacy docs | WFS adds transient credentials and derived extent through the backend, plus authenticated responses. Future docs must say so while retaining browser-only raw survey processing. |

**Blockers:** none to starting M1 with fixtures/injected fetch; no credentials/live service needed for regular development. First hosted rollout should await targeted verification of response profile, bounded-result behavior, password-manager compatibility and deployed logging/payload/timeout settings. These are acceptance checks, not reasons to redesign the architecture or repeat established CORS experiments.

## 14. Explicit non-goals

First scope excludes automatic new/existing validation, topology matching, deciding the exact old pipe connection, database editing, WFS-T/Transaction, writes to Gemini, municipality-wide downloads/caching, shared server credentials, advanced elevation validation, photo association via WFS, replacement of WMS, general GML survey import and a generic multi-provider GIS framework.

Stable IDs, intact geometry and source attributes leave future options open without requiring those workflows now.

## 15. Recommended next implementation prompt/scope

> Implement M1 only from docs/agent-reports/20261028-gemini-wfs-integration-planning.md on feature/photo-workspace, first rechecking HEAD/local instructions. Add a POST-only Node App Router route at src/app/api/gemini-wfs/route.js with injectable policy/handler. Allow only the registered Færder va-basis.wfs endpoint, WFS 2.0 GetFeature for VA_LINE/VA_MPNT, fixed EPSG:25832 and a strict bounded BBOX. Construct Basic Auth server-side from transient body credentials. Bound input/output/duration, cancel safely, reject redirects, return private no-store headers and sanitized errors, and never log/persist credentials. Return approved raw XML/GML without server parsing. Add synthetic/injected tests for restrictions, auth forwarding, failures, cancellation and limits. Preserve WMS, photo workflows and survey contracts. Do not add UI/map/parser yet, dependencies, shared accounts, live-service CI requirements or deployment changes. Use no sub-agents. Produce an implementation report with test evidence and unresolved profile/COUNT/encoding questions. Do not claim a requested model was used unless the session actually runs it.

Review M1, then implement M2 and M3 against the agreed contracts. Ship the user-facing workflow after map/configuration, useful inspection and integrated acceptance converge.

### Terminal summary

- Report: docs/agent-reports/20261028-gemini-wfs-integration-planning.md.
- Major recommendation: fixed same-origin POST proxy, native browser GML adapter, selected-survey extent + 100 m buffer and session-only line/point reference group.
- Seven milestones: proxy; parser; extent/fetch session; map/card; connection/workflow UI; popups; integrated tests/docs/hosted acceptance.
- Blockers: none to foundation; model limitation and hosted acceptance items are recorded above.
- Verification: 61 selected baseline tests passed; no credentials or WFS implementation used.
- Repository scope: this report only. No application code, configuration, dependency, test or deployment file changed. No branch switch/update.
