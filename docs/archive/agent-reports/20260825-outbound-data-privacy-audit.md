# Outbound-data, privacy and network-flow audit

Date: 2026-08-25  
Repository: `C:\GitHub\gmi-validering`  
Branch: `feature/app-info-version-changelog`  
Scope: source-level audit of the current working-tree wording in `AppInfoModal` and all relevant runtime data flows. Concurrent visual-only edits were treated as user-owned and ignored.

## 1. Executive conclusion

**Overall verdict: the current modal wording is materially true, but incomplete and in two places too reassuring without enough qualification. It should be revised.**

The central assurance is supported for the application’s intended request paths: selecting or dropping a GMI, SOSI or KOF file does not upload the raw file to an application API. Browser `FileReader` reads it, browser-side parsers create objects, and validation, tables, 2D/3D conversion and most analysis happen client-side. No intended request builder includes the filename, raw file bytes, the whole parsed dataset, arbitrary object attributes, object IDs, GUIDs or validation errors.

There is, however, one **HIGH** security/privacy boundary finding. Arbitrary parsed attribute names and values are concatenated into an HTML string for Leaflet popups and passed to `bindPopup` without escaping. Leaflet assigns string popup content to `innerHTML`. A crafted input file can therefore cause attacker-chosen resource requests or same-origin script execution when a user opens a feature popup. That execution could transmit localStorage, displayed/file-derived values or other data reachable in the page to an attacker. This is not a normal application telemetry flow and does not prove that ordinary files are uploaded, but it means an unconditional promise that uploaded data can never leave the browser is not defensible until the sink is fixed. (`src/components/MapInner.js:1918-1957,2557-2629`; `src/lib/parsing/gmiParser.js:122-146`; `src/lib/parsing/sosiParser.js:128-145`; installed Leaflet `dist/leaflet-src.esm.js:10021-10033`)

The important qualifications are:

- After a successful parse, **every analyzed line is automatically queued for terrain lookup**. The client samples each line at approximately one-metre spacing and sends uncached XY samples directly to Kartverket/Geonorge Høydedata in batches of at most 50. This is broader and more automatic than a reader may infer from “for enkelte funksjoner” and “utvalgte koordinater.” It is still a subset/derivation rather than a file upload. (`src/lib/store.js:277-305`, `src/lib/store.js:1882-1912`, `src/components/TerrainFetcher.js:114-219`, `src/lib/analysis/lineSampling.js:174-243`, `src/lib/analysis/terrain.js:14-18,171-182,252-300`)
- Opening the data inspector’s point view also sends one selected point, or up to the first 100 points, to the same elevation API. (`src/components/DataDisplayModal.js:96-162`)
- A single dataset centroid is sent to the app’s own `/api/track` endpoint after each successful non-test upload. The server forwards that coordinate first to Kartverket’s address point search and, if needed, to Kommuneinfo point lookup to resolve a municipality. The coordinate is not written to the aggregate database, but it is retained as part of an in-memory server cache key for the life of that server process. (`src/components/FileUpload.js:29-41,224-240`, `src/lib/tracking/datasetCoordinate.js:3-62`, `src/lib/tracking/kommuneLookup.js:3-10,45-101`)
- The usage database stores more than the municipality: UTC date and hour, area type, municipality slug/name/number, country, region, event type and an aggregate count, plus database-created/updated timestamps. It stores aggregate counters, not one record containing the uploaded file. (`src/lib/tracking/aggregates.js:44-69`, `src/lib/tracking/supabase.js:21-48`, `src/features/user-tracking/supabase.sql:1-60`)
- Vercel Web Analytics is globally enabled and automatically records page views separately from the app’s municipality statistics. The application emits no custom Vercel events or custom properties. (`src/app/layout.js:1-23`, `package.json:19`)
- The normal map sends viewport-derived tile coordinates or WMS bounding boxes to Kartverket/Geonorge by default. Optional base maps send tile coordinates to OpenStreetMap; the public statistics map uses CARTO; a conditional Leaflet marker asset can come from cdnjs. A user-configured authenticated Gemini WMS sends a WMS URL, layer selection, viewport bbox and Basic credentials through the app proxy to the selected, policy-allowed Gemini tenant. These flows are map requests, not GMI/SOSI/KOF uploads. (`src/components/MapInner.js:2647-2747`, `src/components/stats/StatsMap.js:246-264`, `src/components/AuthenticatedWmsLayer.js:35-99`, `src/app/api/wms-proxy/route.js:29-64`)

No CRITICAL finding was identified. One HIGH crafted-file DOM-injection/exfiltration boundary was found. No client-exposed Supabase service key, ordinary raw-file upload, arbitrary forwarding proxy, sensitive custom analytics property or obvious cross-user stored file-data exposure was found.

## 2. Public-claim verdict table

| Claim | Verdict | Evidence and qualification |
|---|---|---|
| A. “Det aller meste av behandlingen skjer lokalt i nettleseren på din egen PC.” | **VERIFIED WITH QUALIFICATION** | File reading, parsing, store population, validation/analysis and visualization are client-side (`FileUpload.js:93-240`; parsers under `src/lib/parsing/`; `store.js:199-323`; `MapInner.js:1900-1965`). The statement remains fair in ordinary language. Users should nevertheless be told that terrain, municipality, map/WMS and page-analytics requests leave the browser/app boundary. The unescaped popup sink also means a crafted file can trigger arbitrary outbound behavior on interaction. |
| B. “Dataene i innmålingsfilen blir i hovedsak lest, analysert og visualisert der.” | **VERIFIED WITH QUALIFICATION** | The raw input is passed from `FileReader` directly to client parsers and parsed objects are placed in client state (`FileUpload.js:100-221`). Parsed geometry/attributes are rendered locally (`MapInner.js:1900-1965`). Coordinates derived from that data leave selectively but substantially: all line profiles are sampled automatically, point inspection can send up to 100 point coordinates, and a centroid is sent for municipality resolution. A crafted attribute can also cross the network boundary through the unescaped popup HTML sink. |
| C. “For enkelte funksjoner sendes utvalgte koordinater til Kartverkets API-er.” | **VERIFIED WITH QUALIFICATION** | Confirmed: terrain XY batches go directly from the browser to Høydedata; one centroid goes browser → app server → Kartverket address/Kommuneinfo; map WMTS/WMS requests encode viewport/tile location. “Utvalgte” is technically defensible because neither raw rows nor complete objects are sent, but it undercommunicates that terrain sampling runs automatically for every analyzed line at ~1 m spacing. |
| D. “Dette brukes hovedsakelig til å hente høydedata som inngår i profilvisningen og beregningene rundt ledningene.” | **VERIFIED WITH QUALIFICATION** | Elevation is the dominant explicit coordinate API flow: potentially many samples per line, batched by 50, with returned height/terrain/source used in profiles and cover calculations (`terrain.js:171-220,245-340`; `TerrainFetcher.js:142-219`; `InclineAnalysisModal.js:684-817`). Extra uses exist: point-inspector elevation, one-coordinate municipality resolution, and map tile/WMS viewport requests. “Hovedsakelig” remains fair by volume and purpose, but the extra uses merit a short disclosure. |
| E. “I tillegg registreres kommunen som filen er knyttet til i statistikkdatabasen.” | **INCOMPLETE** | The municipality is indeed derived from the dataset centroid and recorded when resolution succeeds. However, the stored aggregate key/data also contains UTC date/hour, area type, municipality name/slug/number, country, region, event type and count, with created/updated timestamps. Unresolved uploads are still counted under `unknown`. A centroid must first reach the app server and Kartverket. Vercel page analytics is a separate statistics flow not disclosed here. |
| F. “Dette brukes til statistikk over bruken av verktøyet, ikke til å lagre selve innmålingsfilen.” | **VERIFIED WITH QUALIFICATION** | The application database receives aggregate usage dimensions and a counter; it does not receive or store the raw file, filename, complete dataset, attributes, object IDs or coordinates (`trackingHandler.mjs:96-106`; `aggregates.js:49-69`; `supabase.js:26-48`). Qualification: the server temporarily receives the centroid and keeps it in a process-memory lookup cache key; browser-local UI persistence can retain limited file-derived values; Vercel and map/API providers have their own metadata/retention boundaries. The crafted-popup issue is a separate exfiltration risk, not a statistics-database write. |

## 3. Complete outbound destination inventory

“Explicit data” below means a field deliberately built by this application. “HTTP metadata” means information normally visible to a recipient because it terminates an HTTP request; it is not treated as an application payload field.

| Path and source | Side, trigger and protocol | Destination | Explicit application data | File-sensitive fields | HTTP metadata and persistence boundary |
|---|---|---|---|---|---|
| Initial application/static requests; `src/app/layout.js` | Browser; page load; HTTPS | The deployment/application host (apparently intended for Vercel, but deployment is not proven by source) | Page path/query and normal asset requests; locally hosted Next font/CSS/JS | No raw file/filename/objects; happens before file selection | Host sees end-user IP, user-agent, referrer and request headers. Platform request-log retention is not defined in this repo. |
| Vercel Web Analytics; `<Analytics />` in `src/app/layout.js:3,23`; SDK `@vercel/analytics` 1.6.1 | Browser; automatic initial and client-side page views in production; HTTPS to same-origin Vercel insights script/intake | Vercel Web Analytics (`/_vercel/insights/...` for installed v1 SDK) | App supplies no custom event or property. SDK/page service handles URL/path/route and page-view metadata | No file fields, filenames, coordinates or object data are attached by app code | Vercel receives the request and can inspect IP/user-agent/referrer. Official docs say stored data points may include timestamp, URL/route, filtered query params, referrer, derived geography, OS/browser/device and script version; no cookies; a request-derived visitor hash expires after 24 h. Retention of the aggregate page-view data depends on provider/account settings and was not verified. |
| Upload statistic intake; `FileUpload.js:29-41,224-240`; `uploadTelemetry.mjs:75-109` | Browser; automatically after a successful parse, unless store hydration is incomplete or test mode is active; same-origin HTTPS `POST /api/track`, JSON, `keepalive` | Application server | `eventType: upload_success`; `datasetCoord` = centroid `x`, `y`, `epsg`, `sampleCount` or null | **Coordinates: yes, one derived centroid.** Filename/raw bytes/attributes/object IDs/GUIDs/customer/project identifiers/bbox/errors: no | App server inherently sees end-user IP, user-agent, origin/referrer and headers. Source does not log request body. Provider request logging is unknown. Coordinate survives in the downstream lookup cache key for process lifetime, not in aggregate storage. |
| Municipality primary lookup; `kommuneLookup.js:3-5,45-66,82-93` | Server; following `/api/track` when centroid exists; HTTPS GET | Kartverket/Geonorge Address API, `https://ws.geonorge.no/adresser/v1/punktsok` | Centroid as `lat=y`, `lon=x`, `radius=200`, `koordsys=epsg`, `treffPerSide=1` | Coordinate yes; no municipality sent (returned), no file/object fields | Kartverket sees app-server egress IP and server HTTP client metadata, not the end-user’s direct IP/UA. Provider logs/retention unknown/outside app control. Result is cached in app process memory. |
| Municipality fallback lookup; `kommuneLookup.js:4,68-101` | Server; only when address lookup yields no match; HTTPS GET | Kartverket/Geonorge Kommuneinfo, `https://ws.geonorge.no/kommuneinfo/v1/punkt` | Centroid as `ost=x`, `nord=y`, `koordsys=epsg` | Coordinate yes; returns municipality/fylke identifiers; no file/object fields | Same server-side metadata boundary as address lookup. Provider persistence unknown. Result/cache key in process memory. |
| Aggregate write/read; `supabase.js:1-55`, `legacyStats.mjs:479-502` | Server; write after municipality resolution; read when statistics/health routes execute; HTTPS via Supabase SDK | Deployment-configured Supabase project | Write RPC fields: UTC date/hour, area type/id/name, municipality number, country, region, event type. Database increments count and timestamps. Reads selected aggregate columns. | Municipality yes. Coordinates, sample count, filename, size/type, layer/object/feature counts, IDs, raw content, attributes, validation/errors, browser metadata, app version, referrer/path, user/account/session IDs: no | Supabase sees app-server egress metadata and service-role authentication, not the end-user IP as an explicit field. Aggregate rows persist with no retention/deletion rule in source. Provider backups/logging not verified. Service key is server-only (`SUPABASE_SERVICE_ROLE_KEY`), not `NEXT_PUBLIC_*`. |
| Local aggregate fallback; `aggregates.js:8-16,72-138` | Server filesystem, no outbound network; used only when Supabase is absent/fails | `data/usage/aggregates.json` or configured server path | Same aggregate fields/count/timestamps | Same as Supabase row; no coordinate/file payload | Persistent for as long as the server filesystem/file is retained; no deletion schedule. On ephemeral hosting it may not be durable. Included here because it is the alternative persistence path, not a destination on the network. |
| Terrain/elevation; `terrain.js:14-18,171-220,245-317`; `TerrainFetcher.js`; `DataDisplayModal.js:96-162` | Browser; automatic background processing of all analyzed lines after parse, plus selected-line refetch and point-inspector views; HTTPS GET | Kartverket/Geonorge Høydedata, `https://ws.geonorge.no/hoydedata/v1/punkt` | `koordsys=epsg`; `punkter=[[x,y],...]`, maximum 50 points/request. Line points are generated at ≤1 m spacing; point tab sends up to first 100 points; selected point sends one. | Coordinates yes, often many. No Z from file in request, filename, attributes, object IDs, raw data, bbox, municipality or customer/project field | Direct service sees end-user IP, UA and browser-selected referrer (normally origin-only cross-origin unless headers/config differ). Returned `x,y,z,terreng,datakilde` are cached in browser memory, max 40,000 entries; remote persistence unknown. |
| Main map base tiles; `MapInner.js:2647-2688`, default in `store.js:118` | Browser; map mounts after parse and on pan/zoom/base-layer selection; HTTPS image tile GET | Kartverket cache WMTS (default topo or optional grey) or optional OpenStreetMap tile hosts | URL tile indices `{z}/{x}/{y}` (Kartverket template orders `{z}/{y}/{x}`), which reveal viewport/zoom | Viewport location yes via tile IDs; no GMI payload/attributes/IDs/filename | Tile host sees end-user IP, UA, referrer. Browser/provider caching and provider logs are outside app control. |
| Property boundaries; `MapInner.js:2715-2728`, default visibility in `store.js:119-123` | Browser; overlay enabled by default, requests begin at zoom ≥15; HTTPS WMS GetMap | Kartverket/Geonorge `https://wms.geonorge.no/skwms1/wms.matrikkel` | WMS service/version, layers `eiendomsgrense,eiendoms_id`, image format/size, CRS and viewport bbox generated by Leaflet | Bbox/viewport yes; no file dataset, features or attributes | Direct service sees end-user HTTP metadata; provider logs/retention unknown. |
| Public statistics request; `StatsModal.js:245-300` | Browser; when user opens/changes the statistics modal; same-origin HTTPS GET `/api/stats` | Application server | Optional selected municipality-number list and three display/filter flags | Municipality filters only; no current file data | App host sees HTTP metadata. Response exposes aggregate usage statistics and municipality map points to any user of the route; it contains no individual file record. |
| Statistics aggregate read and municipality map enrichment; `api/stats/route.js:14-65`; `statsRoute.mjs:60-85` | Server; on `/api/stats`; Supabase HTTPS read plus one Kartverket GET per uncached municipality number | Supabase; `https://ws.geonorge.no/kommuneinfo/v1/kommuner/{kommuneNumber}` | Supabase aggregate query; municipality number in Kartverket URL | Municipality number yes; Kartverket returns representative `punktIOmrade` coordinates. No source-file coordinate | Remote services see server egress metadata. Municipality representative points are cached in process memory; other provider retention unknown. |
| Statistics basemap; `StatsMap.js:246-264` | Browser; statistics modal renders map, pan/zoom; HTTPS tile GET | CARTO CDN, `{s}.basemaps.cartocdn.com` | `{z}/{x}/{y}{r}` tile index | Viewport/zoom yes; no uploaded data | CARTO sees end-user HTTP metadata; persistence unknown/outside app control. |
| Authenticated WMS capabilities/map requests; `WmsLayerModal.js:77-209`; `AuthenticatedWmsLayer.js:25-133`; `api/wms-proxy/route.js:29-64`; `wmsProxyPolicy.mjs:147-191,243-323` | Browser → same-origin proxy → server HTTPS GET to upstream; only after user supplies URL, username/password and submits/configures layer | Policy permits HTTPS subdomains of `geminisuite.com` under `/portal/api/proxy/map/`, WMS GetCapabilities/GetMap only | To app server: full target URL including tenant/path/query and map bbox/layers/CRS/image dimensions; `x-wms-auth: Basic …`. To Gemini: same WMS URL and forwarded `Authorization` credentials. | Bbox yes. Username/password yes. User-selected layer/tenant may encode customer/project identifiers. No raw GMI file, filename, object attributes or IDs are appended by app | App host receives end-user HTTP metadata plus credentials/target URL. Gemini sees app-server egress metadata and credentials, not direct end-user IP. Proxy uses `cache: no-store`, bounded response, manual redirects. App code does not persist credentials; host/upstream logging and retention are unknown. |
| Conditional Leaflet marker assets; `MapInner.js:37-46,2450-2455` | Browser; only if a point is represented by the invisible fallback default marker (for hidden/filtered/outlier points); HTTPS image GET | cdnjs/Cloudflare, `cdnjs.cloudflare.com` | Static marker PNG URL only | No coordinates in asset URL and no file fields | CDN sees end-user IP, UA and possible referrer. Provider/cache retention unknown. Visible normal points use generated local SVG icons. |
| **Crafted-file popup HTML injection**; `MapInner.js:1918-1957,2557-2629`; parser sources listed below | Browser; when a user opens a feature popup containing hostile attribute markup; any protocol/resource allowed by the browser and deployment policy | Attacker-chosen destination | Attribute keys/values are interpolated into popup HTML; Leaflet writes the string with `innerHTML`. Static hostile markup can request attacker resources; event-handler execution can issue arbitrary requests in the app origin | **Conditional yes:** attacker-controlled attributes/URLs and potentially localStorage or other page-reachable file-derived data. Exact raw byte access is not directly exposed as a global, but same-origin code execution defeats the intended boundary | Attacker receives end-user IP/UA/referrer plus any scripted payload. No app CSP was found to block this sink. Remote persistence is attacker-controlled. Requires a crafted file and opening its feature popup; no cross-user server persistence was found. |
| External navigation links; `AppInfoModal.js:67-78`, `StandardsInfoModal.js:157-176`, `ShareQrModal.js:50-180`, map attribution strings in `MapInner.js:2662-2727` | Browser; only on click or QR scan; HTTPS navigation | GitHub, VA-Norm, Norsk Vann, Kartverket, OpenStreetMap; QR can encode current app URL or GitHub URL | Destination URL. QR SVG is generated locally and clipboard use is local. | No file content. Current app URL can include ordinary query/hash state, but source adds no filename/dataset token | Explicit modal/standards/share links use `noreferrer`; target sees visitor IP/UA but not referrer. Leaflet attribution links do not explicitly suppress referrer, so normal browser referrer policy applies. |
| Google font build step; `layout.js:1,5-10` | Build-time Next.js behavior, not an end-user browser flow | Google font source as resolved by `next/font/google` during build | Roboto family/weights/subset requested by build tooling | No end-user or file data | Next serves the produced font locally at runtime. Build-network logging is outside this user privacy flow. |
| Health/debug routes; `api/track/health/route.js`, `api/track/debug/route.js` | External operator/probe → app server; optional Supabase read; authenticated `write=true` can create/increment a health-test aggregate. Debug route is fixed 404 | Application host and Supabase | Health read selects one date; write uses constant `health-test`/`TEST` fields. Secret may be supplied by Bearer/header or query. | No file/user data | Inbound caller metadata visible to host. Query-secret use could expose the operator secret in infrastructure logs/history; no browser caller was found. Debug route transmits nothing onward. |

No explicit `XMLHttpRequest`, `sendBeacon`, WebSocket, EventSource, WebRTC transport, service worker, IndexedDB, contact form integration, remote iframe, remote image component, Sentry/PostHog/Google Analytics/Speed Insights, or other telemetry SDK was found in `src/`, `public/`, `next.config.mjs` or runtime dependencies. The popup injection finding can nevertheless create browser-native image/navigation/fetch traffic at runtime from hostile markup/script.

## 4. Raw file/data lifecycle

### Actual path

1. `FileUpload` and `GlobalFileDrop` take the first browser `File` from an `<input>`/drop (`FileUpload.js:337-352`; `GlobalFileDrop.js:3-12`).
2. Only metadata (`name`, `size`, `lastModified`, MIME type) is initially placed in client state. `FileReader` reads SOSI as `ArrayBuffer` and GMI/KOF as ISO-8859-1 text (`FileUpload.js:93-136,296-301`).
3. The same browser callback instantiates `SOSIParser`, `KOFParser` or `GMIParser`. No server/API call participates in parsing (`FileUpload.js:138-159`). SOSI uses `sosijs` locally; GMI/KOF parse locally (`sosiParser.js:85-106`; `gmiParser.js:16-34,210-250`; `kofParser.js:8-21`).
4. Parsed `header`, `points`, `lines`, coordinates, IDs/GUIDs and arbitrary attributes are held in Zustand `data` and `layers`; file metadata is held in `file`/per-layer `file` (`FileUpload.js:205-221`; `store.js:184-203,1863-1923`). KOF deliberately retains each raw data line as the local `attributes.raw` value (`kofParser.js:177-187,250-271`).
5. Outlier, incline and Z validation run in client code while data is set; terrain queues are created from analyzed lines (`store.js:203-319`). Map GeoJSON, popups, tables and 3D structures are constructed client-side (`MapInner.js:1900-1965`; `DataDisplayModal.js`; `src/lib/3d/transformGMIData.js`).
6. In the intended flow, only the outbound derivatives described above leave: terrain XY samples, one dataset centroid for municipality lookup, map viewport/tile requests, and any user-configured WMS data. No application API route accepts a file upload or multipart body. Separately, arbitrary attributes are copied into GeoJSON properties and then unescaped Leaflet popup HTML; a crafted file can create additional attacker-chosen outbound traffic when a popup is opened.

### Answers

- **Do raw uploaded bytes leave the browser? Not through any intended application request.** The crafted-popup HIGH finding can execute same-origin code and potentially exfiltrate page-reachable file-derived data, so “never leave under any circumstances” cannot be verified.
- **Do parsed rows/attributes leave? Not in intended API/map/telemetry requests.** KOF raw rows remain browser memory and arbitrary GMI/SOSI/KOF attributes are normally local. Hostile attribute markup can itself trigger a remote request or code execution through the popup sink.
- **Do filenames leave? No application request includes them.** Filename is used for UI/layer name/format classification only. A proposed reduced telemetry object classifies extension and size but is discarded with `void boundedTelemetry`; only the legacy centroid request is sent (`uploadTelemetry.mjs:29-69,99-109`).
- **Do whole datasets leave? No.**
- **Do ObjectRefs/object IDs/GUIDs leave? No traced network request includes them.** Feature IDs are locally generated/index-based UI references.
- **Do coordinates leave only selectively? Yes, but “selectively” covers a broad automatic derivative.** All analyzed lines are sampled for terrain; point inspection can send up to 100 points; a single sampled centroid is sent for municipality resolution; maps disclose viewport/tile location.
- **Does any server/API route receive raw uploaded content? No.** `/api/track` enforces a 1,024-byte JSON body and only permits `eventType` and a bounded coordinate object (`trackingRequestPolicy.mjs:6-16,41-92,147-195`).

## 5. Kartverket flows

### 5.1 Høydedata point API

- Endpoint: `https://ws.geonorge.no/hoydedata/v1/punkt`.
- Feature: automatic line terrain profiles, selected-line refresh/progressive profile, overdekning calculations, and point inspector elevation.
- Payload: GET query `koordsys=<EPSG>&punkter=<JSON [[x,y],...]>`.
- CRS: numeric operational CRS taken from parsed/assumed data; callers fall back to EPSG:25832 when the header field is missing (`TerrainFetcher.js:130-154,188-217,280-288,326-346`; `DataDisplayModal.js:115-141`). Supported tracking CRS and terrain API behavior are separate; source can pass whatever numeric header reaches terrain callers.
- Geometry/count: point arrays. Line geometry is interpolated at maximum one-metre intervals with endpoints/original vertices, then uncached points are batched 50/request, maximum three active requests, with 100 ms queue delay (`lineSampling.js:174-243`; `terrain.js:15-18,284-300`). Point inspector sends one selected point or up to the first 100 points, again batched by the terrain helper.
- Return: `x`, `y`, height `z`, terrain classification and data source; cached in memory and used for plots/cover calculations (`terrain.js:191-220`; `InclineAnalysisModal.js:684-817`).
- Trigger: **automatic for all analyzed lines after a successful file parse**, because `setData`/`addLayer` build queues and `TerrainFetcher` processes them in the background. Point queries are user-triggered by opening the inspector on a point/points tab. Selected-line priority/refetch is user-driven, but not the only line flow.

### 5.2 Municipality from dataset centroid

- Client derives one centroid from the first valid coordinate of every point/line feature, uniformly samples at most 200 of those coordinates, and averages them. It sends `x`, `y`, `epsg`, `sampleCount` to `/api/track` (`datasetCoordinate.js:3-62`; `uploadTelemetry.mjs:75-78`).
- Server primary endpoint: Address `punktsok`, with `lat=y`, `lon=x`, radius 200 m, source EPSG and one hit (`kommuneLookup.js:45-65`).
- Server fallback: Kommuneinfo `punkt`, with `ost=x`, `nord=y`, source EPSG (`kommuneLookup.js:68-79`).
- Return: municipality name/number, and possibly county number. The app creates country `NO`, region, municipality slug/name/number (`kommuneLookup.js:32-42`).
- Trigger: automatic after successful parse when normal tracking is allowed. Test mode suppresses the tracking/municipality flow (`uploadTelemetry.mjs:80-97`).

### 5.3 Map and statistics endpoints

- Kartverket WMTS topo/grey receives tile indices for the active map viewport (`MapInner.js:2657-2677`).
- Matrikkel WMS receives viewport bbox, CRS, zoom-dependent image size and selected fixed layers; it is enabled by default but has `minZoom=15` (`MapInner.js:2715-2729`).
- Statistics endpoint `kommuneinfo/v1/kommuner/{number}` receives municipality numbers from aggregate records and returns representative municipality coordinates for the public statistics map (`api/stats/route.js:14-36`). It does not receive source-file coordinates.

### Accuracy of the public sentence

> “For enkelte funksjoner sendes utvalgte koordinater til Kartverkets API-er. Dette brukes hovedsakelig til å hente høydedata som inngår i profilvisningen og beregningene rundt ledningene.”

**Accurate with qualification.** “Hovedsakelig” is fair: terrain sampling will normally dominate the number of coordinate values and supports the described profile/cover use. The sentence should nevertheless say that line terrain requests happen automatically for analyzed lines, and should briefly acknowledge municipality lookup and map viewport requests. Without that, “utvalgte” can reasonably sound like a few explicitly selected points, which is not the observed behavior.

## 6. Statistics/Supabase flows

### Write path and fields

`FileUpload` sends only `{ eventType: 'upload_success', datasetCoord }` to the same-origin route. The route validates an exact field allow-list, resolves municipality, then calls `incrementAggregate` (`FileUpload.js:29-38`; `trackingRequestPolicy.mjs:10-16,147-173`; `trackingHandler.mjs:81-106`).

If Supabase is configured, the server invokes RPC `increment_aggregate` with:

- `p_date`: UTC calendar date;
- `p_hour`: UTC hour (0–23);
- `p_area_type`: normally `kommune`, otherwise `unknown`;
- `p_area_id`: slugified municipality name or `unknown`;
- `p_area_name`: municipality name or `Unknown`;
- `p_kommune_number`: four-digit municipality number or null;
- `p_country`: `NO` or null;
- `p_region`: county number or null;
- `p_event_type`: `upload_success`.

The `aggregates` table uses `(date, hour, area_type, area_id, event_type)` as the primary key and increments `count`; `created_at` and `updated_at` are database timestamps (`supabase.sql:1-60`). This is an aggregated counter model, not a per-upload row with an ID.

The source contains a later SQL design for `upload_metric_daily`, `municipality_resolution_daily` and `increment_upload_diagnostics`, plus browser classifiers for file/quality buckets. **Those richer fields are not on the active request/write path.** `completeSuccessfulUpload` derives the bounded object and then discards it (`void boundedTelemetry`); no JS caller invokes the richer RPC (`uploadTelemetry.mjs:85-109`; only the SQL artifact mentions `increment_upload_diagnostics`). They must not be described as currently transmitted merely because schema/migration files exist.

### Explicit field checklist

| Candidate | Sent/stored by active app statistics? |
|---|---|
| Municipality name/slug/number | **Yes**, when resolved; otherwise unknown/null aggregate |
| Timestamp | **Yes, coarsened:** UTC date/hour; database also creates/updates timestamps |
| Generated per-upload ID | No |
| Session/persistent browser ID | No |
| File type/extension | No (classified locally in dormant richer telemetry, then discarded) |
| Filename/source path | No |
| Exact file size | No |
| Size bucket | No on active request |
| Layer/object/feature/coordinate counts | No on active request |
| Coordinates/bbox | No in aggregate DB; one centroid reaches the app route and Kartverket before aggregation |
| Project/customer identifier | No explicit field |
| Validation result/error detail | No |
| Browser/user-agent/referrer/path | No explicit statistics field; app host sees ordinary request metadata |
| App version | No on active request |
| User/account data | No |

### Persistence and access

- No retention/deletion period is defined in code or SQL. Treat aggregate rows as indefinite until an operator policy is verified.
- Source SQL creates aggregate data with no per-upload identity. Production schema/RLS/grants and backups cannot be proven from repository files alone.
- If Supabase is missing or a write fails, the server writes the same aggregate model to `data/usage/aggregates.json` (`aggregates.js:127-138`).
- `/api/stats` reads all `upload_success` aggregates (paginated), aggregates them further and returns public totals, time series, municipality rankings and representative map points (`legacyStats.mjs:479-502`; `statsRoute.mjs:30-100`).

**Is “municipality only” accurate?** The modal does not literally say “only,” but a user can reasonably read it as the complete statistics disclosure. That implication is incomplete. The persistent usage record includes municipality/location labels, UTC date/hour, event type and count. It still contains no file content or exact coordinates.

## 7. Analytics/telemetry

### Vercel Web Analytics

`<Analytics />` is rendered globally in the root layout. No source call to Vercel `track()`, `pageview()`, `beforeSend`, custom endpoint or custom property exists. The installed v1 package injects the same-origin insights script; in production this enables automatic page views.

According to Vercel’s official [Privacy and Compliance documentation](https://vercel.com/docs/analytics/privacy-policy), stored data points may contain event timestamp, URL, dynamic route, referrer, filtered query parameters, derived geolocation, OS/browser/device and analytics script version. Vercel says page-view/custom-event data is anonymous, not tied to an IP, uses no third-party cookies, and discards its request-derived visitor session/hash after 24 hours. Its [Web Analytics overview](https://vercel.com/docs/analytics) says browser/device classification is derived by inspecting the incoming User-Agent header. This means IP and UA are technically visible at request intake even though Vercel says IP is not associated with the stored analytics data point.

Application source does **not** add filenames, project/customer identifiers, coordinates, raw file content, object attributes or validation details to Vercel events. A sensitive value could only enter page analytics if it appeared in the page URL/query/referrer. Current app navigation does not encode file data into the URL; test mode can add an ordinary query parameter.

### Other telemetry-like code

- The app’s own upload counter is separate from Vercel and covered in section 6.
- Terrain `stats` and development runtime diagnostics are local diagnostic counters, not network telemetry (`terrain.js:24-35,84-115`; `page.js:179-250`).
- Development-only crash breadcrumbs persist local error messages/source script URLs and resource counts to localStorage; they are disabled when `NODE_ENV === 'production'` (`page.js:179-250`).
- No other telemetry SDK or explicit custom event emitter was found.

**Disclosure assessment:** a short Vercel Web Analytics disclosure is warranted. The current municipality paragraph remains true about the app’s own statistics database, but it is not a complete account of usage analytics.

## 8. Map/tile/WMS flows

Using the map can disclose location without uploading the GMI dataset:

- Slippy-map `{z}/{x}/{y}` tile indices reveal the geographic viewport and zoom to the active tile provider.
- WMS GetMap includes a four-value `BBOX`, CRS/SRS, image dimensions, layer names, format, WMS version and operation. The default property overlay sends this directly to Kartverket/Geonorge at zoom 15+.
- The map automatically fits to parsed data (`MapInner.js:900-903,2757-2762`), so initial tile/WMS requests can closely describe the dataset’s geographic extent even though no feature geometry/attribute is uploaded to those map services.
- OpenStreetMap is optional; CARTO is loaded when the usage-statistics map is shown.
- Authenticated Gemini WMS is user-configured. Credentials and target WMS URL go to the app proxy, then credentials/layer/bbox go to the allowed Gemini service. The proxy allow-list blocks arbitrary hosts and restricts operations to WMS GetCapabilities/GetMap (`wmsProxyPolicy.mjs:147-191,243-323,342-415`).

This does not invalidate “det aller meste … lokalt,” but concise public copy should mention that map services receive the map area being viewed. It is a material and intuitive boundary for users working with infrastructure locations.

## 9. Storage/persistence

| Storage | Data | Lifetime/clearing |
|---|---|---|
| Browser memory: parser objects/FileReader result | Raw file text/bytes while parsing; parser internals | No persistence API; eligible for collection after callback/parser references are released. |
| Zustand browser memory: `data`, `layers`, `file`, analysis, terrain | Parsed headers, all points/lines, attributes, IDs/GUIDs, KOF raw rows, filename metadata, validations, terrain results | Current page lifetime; cleared by reset or reload because these slices are excluded from persistence. |
| Terrain module cache | Up to 40,000 request/result coordinate entries keyed by EPSG/X/Y | Current browser JS context; LRU-like eviction; reload clears (`terrain.js:18-22,44-82`). |
| `localStorage` `gmi-validator-storage` | Persisted `settings`, **entire `ui` slice**, `lastActive` (`store.js:2845-2859`) | Until site data is cleared/overwritten. Does not include `data`, `layers`, `file`, terrain or WMS credentials. |
| File-derived values possible inside persisted `ui` | Map/measure coordinates, highlighted/generated feature/layer references, inspector target `{type,index,layerId}`, selected 3D reference, missing-height indices/type/code, and arbitrary field name/value filters (`store.js:90-145,1090-1233,1336-1363,1512-1630`) | Can survive reload even though the dataset itself does not. `Set` values do not serialize usefully through default JSON, but ordinary arrays/objects/strings do. This is local-only and should not be described as raw-file persistence. |
| `localStorage` `gmi-validator-wms-url` | User-entered WMS URL only | Until removed/site data cleared; username/password excluded (`WmsLayerModal.js:17,39-49,137-169`). |
| `localStorage` `theme` | Theme ID | Until cleared (`ThemeSwitcher.js:37-48`). |
| `localStorage` `gmi-validering:app-info:v1` | Schema number, `introSeen`, last seen announcement version | Until cleared/updated; contains no file data (`appInfoState.mjs:1-18,50-68`). |
| Development localStorage keys | Runtime resource counts and local JS error/rejection messages/source URL | Development builds only, rolling max 120 items (`page.js:29-47,179-250`). |
| `sessionStorage` `statisticsCueCount` | UI cue count up to 3 | Browser tab/session (`statisticsCue.mjs:1-29`). |
| Server municipality lookup cache | Exact centroid rounded to 0.01 plus EPSG in cache key; resolved municipality object | In-memory process lifetime; no TTL/limit (`kommuneLookup.js:6,9-10,86-98`). |
| Server stats municipality cache | Municipality number → representative lat/lng | In-memory process lifetime (`api/stats/route.js:11-36`). |
| Supabase `aggregates` or server JSON fallback | Aggregate location/time/event/count and timestamps | No retention/deletion in source; operational/provider policy unknown. |
| Third-party/server logs and browser HTTP caches | Potential HTTP request metadata, URLs/query coordinates/bbox, assets/responses | Not controlled or defined by this repository. |

No application IndexedDB use or explicit application cookie creation/read was found. Browser password-manager storage, browser history/cache and hosting/provider logs are separate platform behavior, not application persistence implemented here.

## 10. Privacy-sensitive field matrix

| Sensitive item | Same-origin app server | Kartverket/Geonorge | Supabase aggregate | Map/CDN/WMS providers | Vercel Web Analytics | Browser-local persistence |
|---|---|---|---|---|---|---|
| Filename/source path | No upload request field | No | No | No | No app-added field | Filename held in memory only; unused `settings.lastFileName` remains null in traced callers |
| Raw GMI/SOSI/KOF bytes/rows | No | No | No | No | No | Raw parse input memory only; KOF raw data rows retained in parsed memory attributes |
| Whole parsed dataset | No | No | No | No | No | Memory only; excluded from persisted slice |
| Arbitrary attributes/project/customer names | No intended API field; crafted-popup code runs in app origin | No intended Kartverket field | No | Not in normal map requests; **conditional attacker destination** through popup injection; also possible in user-entered Gemini tenant/path/layer/credentials | No app-added property | Arbitrary field filter values can persist in `ui.feltHiddenValues` |
| Object IDs/ObjectRefs/GUIDs | No | No | No | No | No | Memory; generated UI IDs/indices may persist locally |
| Exact feature coordinates | One derived centroid reaches `/api/track`; WMS bbox reaches proxy | Terrain samples; centroid for municipality; viewport/bbox/tile location | No | Viewport tile indices/bbox; Gemini bbox | No app-added coordinate | Parsed coordinates in memory; map/measure target coordinates can persist in UI |
| Dataset bbox/extent | Not sent by tracking; custom-WMS bbox reaches proxy | Matrikkel WMS and tile viewport can approximate dataset extent after auto-fit | No | Yes, viewport bbox/tile IDs | No | Map UI state may retain target/measure coordinates, not whole computed bbox |
| Municipality | Returned by tracking and public stats routes | Returned by point lookup; municipality number sent for stats-map lookup | Yes | Not as an explicit file field | Derived page geolocation is visitor location, not file municipality | Not a dedicated file value except UI/response state in memory |
| File size/type/counts | No active request | No | No | No | No | File metadata/counts in memory; dormant local classifier creates buckets then discards them |
| Validation/error details | No request body | No | No | WMS error console may include encoded target URL/bbox/layers locally | No custom error event | Validation in memory; dev-only error breadcrumbs may persist local JS error text |
| User-entered values | WMS URL, Basic credentials, layers reach proxy | No, except normal map choice | No | Gemini receives credentials/WMS choices | URL/query/referrer if user puts values there | WMS URL persists; credentials memory only (browser password manager separate) |
| IP/user-agent/referrer | **Inherently visible**, not explicit tracking fields | End-user metadata for direct browser calls; server metadata for server calls | Server egress metadata, not explicit fields | End-user for direct tiles; server egress for Gemini proxy | Intake uses request metadata; stored analytics is provider-described as anonymous | Not stored by app |
| App version/path/referrer | Path/referrer are normal HTTP metadata; no app-version tracking field | Possible origin referrer per browser policy | No | Possible referrer per browser policy | Page URL/route/referrer/script version; app release version not explicitly attached | App-info last announcement version only |

## 11. Findings by severity

### CRITICAL

None.

### HIGH

1. **Crafted file → unescaped Leaflet popup HTML → arbitrary resource request / DOM XSS.** GMI string field values are accepted without HTML escaping (`gmiParser.js:122-146`), SOSI properties are spread verbatim (`sosiParser.js:128-145`), and KOF retains string/raw attributes (`kofParser.js:177-187,228-271`). `MapInner` spreads those attributes into GeoJSON properties, concatenates every property key/value into an HTML string, and calls `layer.bindPopup(content)` (`MapInner.js:1918-1957,2557-2629`). Leaflet handles string content with `node.innerHTML = content` (installed `leaflet-src.esm.js:10021-10033`). No app-level CSP was found. A malicious file can therefore make the browser contact an attacker directly and can execute event-handler JavaScript when the user opens the affected popup, enabling exfiltration of localStorage and other page-reachable information. Severity is HIGH rather than CRITICAL because it requires a crafted file plus popup interaction and no server-side cross-user persistence was found. Recommended action outside this audit: construct popup content with DOM/text nodes or comprehensively escape/sanitize every untrusted key/value; add regression tests and a restrictive CSP as defense in depth.

### MEDIUM

1. **The modal understates the automatic scope of coordinate transmission.** Terrain samples for every analyzed line are generated and sent in the background after parse, normally at ~1 m spacing. “For enkelte funksjoner” and “utvalgte koordinater” are not false, but do not tell users that this is automatic or potentially high-volume. Recommended action: say that coordinates along lines are sent automatically for terrain profiles/cover calculations.
2. **The statistics disclosure is incomplete.** It omits the centroid sent to the app server/Kartverket for municipality resolution, UTC date/hour and other aggregate location/event fields, and the separate Vercel Web Analytics page-view flow. Recommended action: describe the aggregate dimensions concisely and mention anonymous page analytics.

### LOW

1. **Map-provider location disclosure is absent.** Default Kartverket tiles and Matrikkel WMS receive viewport/tile/bbox data, and auto-fit makes it data-location-relevant. Optional OSM/CARTO/Gemini destinations add boundaries. Recommended action: one short sentence that map services receive the shown map area.
2. **The persisted Zustand `ui` slice can contain limited file-derived local state.** The source comment says large datasets are excluded, which is true, but persisting all UI allows coordinates, field values and local object references to survive reload. This is not outbound and not a raw dataset, but is relevant on shared PCs. Recommended later action: narrow or sanitize `partialize`; outside this audit’s no-code scope.
3. **Authenticated WMS error logging can expose target URL details in the local developer console.** The unconditional catch logs the encoded proxy URL, which can contain tenant path, layer and bbox (`AuthenticatedWmsLayer.js:87-89`). Credentials are in a header and are not included in that URL. Recommended later action: sanitize production client logging; no severe remote leak was demonstrated.
4. **Health-route query secrets are supported.** Operators can pass the keepalive secret in `?secret=`, which may be retained by browser/infrastructure logs (`api/track/health/route.js:8-24`). Header/Bearer usage is safer. This route is not called by end-user source and carries no file data.

### INFORMATIONAL

1. **Positive containment:** no raw file, filename, arbitrary attribute, object ID/GUID, validation error or exact file metadata is transmitted by the active upload statistics path.
2. **Positive secret boundary:** Supabase service-role credentials are server-only environment variables; no production credential value or client-public Supabase key was found in source.
3. **Positive proxy boundary:** WMS forwarding is constrained to HTTPS Gemini tenant hosts, a fixed path family, public DNS results and GetCapabilities/GetMap with bounded responses—not an unrestricted arbitrary endpoint forwarder.
4. **Dormant richer telemetry should not be confused with active collection:** its local classifiers and SQL schema exist, but the derived object is discarded and no active RPC caller exists.

## 12. Recommended modal wording

Minimal version, intended for the Om modal:

> Det meste skjer lokalt i nettleseren din: appens vanlige dataflyt sender ikke selve GMI-, SOSI- eller KOF-filen til serveren som en filopplasting, og innholdet leses, kontrolleres og vises på PC-en din.
>
> For å lage terrengprofiler og beregne overdekning sendes koordinatpunkter langs ledningene automatisk til Kartverket. Enkelte punkt- og kommuneoppslag bruker også Kartverket, og karttjenestene mottar kartområdet du viser – men ikke selve innmålingsfilen.
>
> Ved en vellykket innlasting sender appen ett beregnet midtpunkt til vår server for å finne kommunen. Statistikkdatabasen lagrer bare aggregerte tellinger per kommune, dato og time, ikke filnavn, rå filinnhold, objektdata eller koordinater. I tillegg bruker vi Vercel Web Analytics til anonyme sidevisninger og vanlig side-/nettleserstatistikk. Kobler du til en Gemini WMS, går kartutsnitt og innloggingsopplysninger via appens mellomtjener til den valgte Gemini-tjenesten.

This is concise, distinguishes raw-file upload from coordinate/map requests, and avoids an absolute “data can never leave” promise. The HIGH popup sink should still be fixed before relying on this wording as a strong security assurance; public copy is not a substitute for remediation.

## 13. Recommended expanded README/privacy wording

> ### Hva skjer med filen din?
>
> Når du åpner en GMI-, SOSI- eller KOF-fil, leses og tolkes selve filen lokalt i nettleseren. Appens vanlige opplastings- og statistikkflyt sender ikke rå filbytes, filnavn, hele datasettet, objektattributter eller objekt-ID-er til serveren vår. Validering, tabeller, 2D-/3D-visning og det meste av analysen skjer også lokalt.
>
> Noen funksjoner trenger eksterne kartdata. Etter innlasting lager appen terrengpunkter langs analyserte ledninger, normalt med omtrent én meters mellomrom, og sender XY-koordinatene til Kartverkets Høydedata-API i grupper på inntil 50. Dette skjer i bakgrunnen for å bygge terrengprofiler og beregne blant annet overdekning. Når du åpner punktvisningen i datainspektøren, kan ett valgt punkt eller opptil de første 100 punktene også brukes til høydeoppslag. Kartverket mottar koordinater og koordinatsystem, men ikke filnavn, objektattributter eller rå filinnhold.
>
> For bruksstatistikk beregner nettleseren ett midtpunkt fra et utvalg av objektenes første koordinater. Midtpunktet og koordinatsystemet sendes til serveren vår, som spør Kartverkets adresse- eller Kommuneinfo-tjeneste om hvilken kommune punktet ligger i. Midtpunktet lagres ikke i statistikkdatabasen. Databasen øker i stedet en aggregert teller med UTC-dato og -time, kommune-/områdenavn og nummer, land/fylke og hendelsestypen «vellykket innlasting». Den lagrer ikke filnavn, filstørrelse, filtype, koordinater, objektdata, valideringsresultater, bruker-ID eller en rad som kan kobles tilbake til én bestemt fil. Opplastinger der kommunen ikke kan finnes, telles som «ukjent». Det er ikke definert noen slettetid for aggregatene i kildekoden.
>
> Kartet henter bakgrunnskart fra Kartverket som standard, og eiendomsgrenser fra Kartverkets/Geonorges WMS når kartet er zoomet langt nok inn. Slike kartforespørsler inneholder flisnummer eller avgrensningsboks (bbox), koordinatsystem, zoom og lagvalg. Det forteller karttjenesten hvilket område som vises, men laster ikke opp GMI-/SOSI-/KOF-objektene. Du kan velge OpenStreetMap som bakgrunn; statistikkartet bruker CARTO. Hvis du selv kobler til en autentisert Gemini WMS, sendes valgt WMS-URL, lag, kartutsnitt og Basic-innlogging via vår avgrensede mellomtjener til den valgte Gemini-tjenesten. WMS-URL-en lagres lokalt for gjenbruk, mens brukernavn og passord bare beholdes i minnet av appen i den åpne nettleserøkten.
>
> Vi bruker også Vercel Web Analytics for automatiske sidevisninger. Appen sender ingen egne Vercel-hendelser eller filrelaterte egenskaper. Ifølge Vercel kan en sidevisning inneholde tidspunkt, sideadresse/rute, filtrerte spørringsparametere, henviser, omtrentlig geografi, operativsystem, nettleser og enhetstype. Vercel beskriver dette som anonym, aggregert analyse uten tredjeparts informasjonskapsler; en forespørselsbasert besøksidentifikator forkastes etter 24 timer. Vanlige HTTP-opplysninger som IP-adresse og User-Agent er likevel synlige for tjenesten når forespørselen mottas.
>
> I nettleseren beholdes det innleste datasettet i minnet og forsvinner ved ny innlasting eller tilbakestilling. Appens `localStorage` lagrer innstillinger og brukergrensesnittstatus, ikke hele filen. Enkelte lokale, filavledede visningsvalg – for eksempel mål-/kartkoordinater, feltfilterverdier og lokale objekt-/lagreferanser – kan likevel bli liggende til nettleserdataene slettes. Appens Om-status, tema og lagret WMS-URL bruker også lokal lagring. Vi bruker ikke IndexedDB og oppretter ingen egne informasjonskapsler i den undersøkte koden.
>
> Som ved all nettrafikk kan appens driftsplattform og eksterne tjenester se vanlig HTTP-metadata som IP-adresse, User-Agent og eventuelt henviser. Hva Kartverket, OpenStreetMap, CARTO, cdnjs, Gemini, Supabase og driftsplattformen beholder i egne logger, styres av deres avtaler og retningslinjer og kan ikke fastslås fra denne kildekoden alene.

## 14. Unknowns / items requiring runtime or provider verification

- Whether the production deployment is Vercel and whether Web Analytics is enabled in the Vercel project dashboard. The source integration is active, but provider-side enablement was not inspected.
- The exact production Supabase URL/project, deployed schema, RLS/grants, backups, log settings and retention. A local ignored `.env` contains the expected variable **names**, but no values were read or recorded in this report.
- Aggregate retention/deletion policy. No source rule exists.
- Vercel hosting/function request-log fields and retention, separate from Web Analytics. Official Web Analytics documentation does not establish the hosting-log policy.
- Third-party request logging, use and retention for Kartverket/Geonorge, OpenStreetMap, CARTO, cdnjs/Cloudflare and each Gemini tenant.
- The exact browser-generated `Referer` header for each deployment, because no repository-wide `Referrer-Policy` is configured and browser/deployment headers can differ. Modern defaults normally reduce cross-origin referrers to the origin.
- Whether production response headers, reverse proxies, CSP, service-worker behavior or platform integrations add network paths not represented in this repository.
- Browser cache/history/password-manager retention, which is controlled by the user agent rather than this code.
- Runtime request counts for a representative file. Source proves one-metre sampling, 50-point batches, caching and automatic queues, but actual volume depends on geometry length, duplication/cache hits and interaction timing.
- The practical exploitability and browser/CSP behavior of the unescaped popup sink in the production deployment was not runtime-tested. The source-level data-to-`innerHTML` path is confirmed and is sufficient for the HIGH finding.

## 15. Explicit non-goals

- No application, test, dependency, package, AppInfo copy, configuration or deployment change was made.
- No commit, push, merge, deploy, reset, revert, stash or working-tree cleanup was performed.
- No production secrets or environment values were inspected or reproduced.
- No live file was uploaded and no provider endpoint was exercised; this was a source-level flow audit.
- This is not a penetration test, legal opinion, GDPR compliance assessment, data-processing agreement review or verification of third-party contractual behavior.
- Concurrent visual-only changes to the Om modal were ignored as instructed; line references describe the source observed during this audit and may shift with those edits.
