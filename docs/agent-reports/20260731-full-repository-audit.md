# Full repository audit — 2026-07-31

## Scope and method

This is a review-only audit of commit `14d9ff6` on branch `audit/full-repository-review-20260731`, which matched `main` and `origin/main` at review start. The comparison with tag `production-baseline-2026-07-23` contains only the already-completed WMS containment work (the WMS route, its policy module, tests, and its report). That server-side WMS audit was not repeated. One client-side WMS resource-lifecycle interaction is noted as AUD-016 because it falls within the requested frontend cleanup scope.

The review traced server routes, persistence, parser and validation paths, Zustand state transitions, terrain work, 2D/3D rendering call sites, outbound services, configuration, dependency resolution, tests, build output, and relevant git history. Findings are based on repository code, targeted synthetic probes, existing tests, the production build, lint output, the lockfile, and current advisory metadata. No deployed environment, credentials, private WMS URL, live Supabase data, or production logs were accessed.

## Executive summary

No P0 issue was found. The audit identifies **20 findings: 1 P1, 14 P2, and 5 P3**.

The immediate production concern is `/api/track`: it is an unauthenticated public write endpoint that accepts an arbitrary event type, can perform up to two upstream municipality lookups per unique coordinate, and then writes through a service-role Supabase client or an unsafe file fallback. This enables inexpensive counter pollution, database-cardinality growth, upstream request amplification, and function-cost abuse.

The most important correctness risks are client-side:

- non-finite coordinates are accepted by the GMI parser and one-metre terrain sampling has no point cap;
- missing SOSI/KOF Z values are normalized to `0`, while incline analysis treats zero as a present height;
- terrain requests have no timeout, cancellation, or dataset generation identifier, so an older request can write into newer legacy state;
- removing a layer does not retarget legacy state when other layers remain;
- a reachable Rules-of-Hooks violation can crash the profile visualization when switching between valid-height and missing-height results.

Tracking/statistics have additional privacy and reliability gaps. The public statistics response exposes municipality-by-day activity despite the tracking design calling for a protected admin view. Its Supabase query has no pagination, so the hosted default 1,000-row cap causes silent truncation; the same cold request can concurrently fetch coordinates for every returned municipality. Retention is documented but not enforced, and a usage aggregate file containing two aggregate records is committed to git.

The production build passes and the 24 WMS policy tests pass. Quality gates are otherwise absent: there is no root GitHub Actions workflow, `npm run lint` invokes the removed `next lint` command, and direct ESLint reports 41 errors and 11 warnings. `npm audit --omit=dev` reports five affected production package entries. The direct Next.js version is in advisory ranges, but the build contains no Server Actions or middleware and the repository does not use the other cited high-risk features; those advisories are therefore recorded as requiring deliberate upgrade evaluation, not as five confirmed exploitable defects.

## Repository architecture and data flow

```text
User-selected GMI/SOSI/KOF file
  -> FileReader in browser
  -> format detection and parser
  -> normalized point/line objects
  -> Zustand layer state + duplicated legacy data state
  -> field/Z/incline/outlier analyses
  -> Leaflet map, data tables, and React Three Fiber viewer
  -> one-metre terrain samples -> Geonorge Høydedata (direct browser requests)

Successful parse
  -> sampled dataset centroid
  -> POST /api/track
  -> Geonorge address lookup, then kommune lookup fallback
  -> atomic Supabase RPC when configured
     OR JSON read-modify-write fallback when not configured / on RPC failure

Public statistics modal
  -> GET /api/stats
  -> unpaginated Supabase select or JSON file read
  -> per-municipality Geonorge coordinate lookup
  -> daily/hourly/municipality/timeline response

Map rendering
  -> Kartverket WMTS/WMS, OpenStreetMap, and CARTO tiles
  -> contained custom Gemini WMS proxy path (previously audited)
```

The application uses Next.js 16 App Router. The main page is a large client component; parsing and most analysis execute in the browser. Four non-WMS dynamic routes are built: `/api/stats`, `/api/track`, `/api/track/debug`, and `/api/track/health`. The Supabase service-role key is referenced only by server-side modules. Zustand persistence is restricted to settings, UI state, and `lastActive`, not parsed data or WMS credentials.

## Trust-boundary inventory

| Boundary | Data crossing it | Controls observed | Main gaps |
|---|---|---|---|
| User file -> browser parser | Entire file bytes/text, names, attributes, geometry | Extension/sniffing, empty-file check, parser signatures | No size/complexity limit, main-thread parsing, weak geometry/encoding acceptance |
| Parsed data -> browser state/renderers | File metadata, all normalized attributes and geometry | React escaping; data excluded from Zustand persistence | Legacy/layer duplication, stale async writes, parser-derived invalid state |
| Browser -> `/api/track` | Event type and precise sampled centroid | JSON body, finite-number checks, EPSG allowlist downstream | No authentication, origin policy, rate limit, event allowlist, coordinate range, or idempotency |
| Browser -> Geonorge terrain | Exact sampled coordinates and EPSG in query URL | HTTPS, batching of 50, client concurrency limit of 3, cache | No timeout/cancel/total-point cap; transparency is incomplete |
| Browser -> map providers | IP and requested tile viewport | HTTPS | Multiple third parties; viewport may reflect dataset location |
| API routes -> Geonorge | User-supplied coordinate or stored municipality number | URL encoding, HTTPS, 2.5/3-second timeouts | Public trigger and cold fan-out; response shape only lightly checked |
| API routes -> Supabase | Service-role RPC/read | Secret is server-only; RPC increment is atomic | Public callers exercise service role; no repository-visible retention or route rate limit |
| API routes -> local filesystem | Aggregated usage JSON | Errors caught | Non-atomic write, corruption handling, Vercel non-durability, silent loss |
| Browser -> localStorage | UI/settings/heartbeat; WMS URL preference | Parsed data and credentials excluded | Privacy notice and migration tests are absent |
| Source tree -> public git history | Code, docs, committed aggregate data | `.env*` and `.vercel` ignored | `data/usage/aggregates.json` is tracked |

## External-service inventory

| Service | Caller | Data sent / purpose | Timeout/cancellation | Notes |
|---|---|---|---|---|
| Supabase REST/RPC | Next.js server | Aggregate fields and service-role authentication | Supabase client defaults; no route-level timeout | Atomic RPC is a strong mitigation; stats read is unpaginated |
| Geonorge address API | `/api/track` server | Exact dataset centroid, EPSG, 200 m radius | 2.5 seconds | First municipality lookup |
| Geonorge kommuneinfo point API | `/api/track` server | Exact dataset centroid and EPSG | 2.5 seconds | Fallback lookup |
| Geonorge kommuneinfo municipality API | `/api/stats` server | Municipality number | 3 seconds | One cold request per returned unique municipality |
| Geonorge Høydedata | Browser | One-metre sampled coordinates and EPSG in URL | None | Batches of 50, three concurrent requests |
| Kartverket WMTS | Browser | Tile coordinates/viewport | Browser/Leaflet defaults | Base maps |
| OpenStreetMap tile service | Browser | Tile coordinates/viewport | Browser/Leaflet defaults | Optional base map |
| CARTO basemap | Browser stats view | Tile coordinates/municipality viewport | Browser/Leaflet defaults | Statistics map |
| Kartverket matrikkel WMS | Browser | Map viewport/WMS parameters | Browser/Leaflet defaults | Optional overlay |
| Gemini WMS via same-origin proxy | Browser and WMS route | WMS requests; optional credentials | Contained by prior task | Server containment not re-audited; AUD-016 is client resource cleanup only |
| Vercel Analytics | Browser | Platform analytics events | Library-managed | Included on every page; repository does not define an in-app privacy notice |

`next/font/google` is used at build time; it does not imply a runtime browser call to Google Fonts in the built application.

## Prioritised findings

### AUD-001 — Public tracking endpoint permits counter and outbound-request amplification

- **Severity / confidence / classification:** P1 / high / confirmed defect.
- **Affected:** `src/app/api/track/route.js:20-34`; `src/lib/tracking/kommuneLookup.js:82-101`; `src/lib/tracking/aggregates.js:127-138`.
- **Description:** `POST /api/track` has no authentication, origin verification, rate limit, or idempotency. It converts any supplied `eventType` to a string, optionally performs two sequential Geonorge lookups for a unique valid coordinate, and writes with the server-side Supabase service role or file fallback.
- **Evidence:** The route defaults but does not restrict `body.eventType` (line 23), invokes lookup for every valid coordinate (lines 26-29), and increments unconditionally (lines 31-34). The lookup cache is unbounded and only helps repeated identical rounded coordinates.
- **Failure/abuse scenario:** A remote script cycles valid EPSG 4326 coordinates and unique event-type strings. Each request consumes Vercel execution, triggers one or two Geonorge requests, and creates a distinct per-hour database key. Legitimate adoption counters can also be inflated with ordinary repeated requests.
- **Current mitigating factors:** EPSG is limited to 25832, 25833, or 4326; upstream calls have 2.5-second aborts; Supabase increments are atomic; the data is aggregate rather than raw-file storage.
- **Recommended remediation:** Apply schema/body limits, a fixed event allowlist, realistic coordinate ranges, same-origin/CSRF controls appropriate to the public client, per-IP and global rate limits at Vercel/edge, and server-side abuse monitoring. Consider a short-lived signed token or a server-issued idempotency key if public anonymous tracking must remain. Do not rely on CORS: the permissive preflight does not authenticate the side effect.
- **Regression tests:** Reject unknown event types, unsupported fields, out-of-range coordinates, oversize JSON, cross-origin requests, repeated idempotency keys, and requests over configured rate limits; verify valid uploads still increment once.
- **Could remediation alter visible behavior?** Yes. Automated callers, cross-origin use, duplicate counts, and some malformed client requests would stop working.

### AUD-002 — Public statistics disclose municipality-by-day adoption data

- **Severity / confidence / classification:** P2 / high / confirmed defect.
- **Affected:** `src/app/api/stats/route.js:174-205,211-273`; `src/features/user-tracking/README.md:22-29`; `src/app/page.js:220-224`.
- **Description:** The unauthenticated stats route returns counts by municipality and a date-by-municipality timeline. The UI exposes it to every visitor, while the feature design says the dashboard should be protected.
- **Evidence:** `timeline` groups on `${date}|${kommune}` and is returned verbatim. The design calls for a “read-only admin dashboard (protected)” and a privacy notice, but the page always renders a public statistics button.
- **Failure/abuse scenario:** A third party polls the route and observes that a municipality began or resumed uploading on a particular date; single-count buckets can reveal low-volume project activity even without names, IPs, or exact coordinates.
- **Current mitigating factors:** Data is aggregated; no filenames, users, IPs, or raw coordinates are returned; municipality is less precise than the original geometry.
- **Recommended remediation:** Make an explicit product/privacy decision. If this is administrative data, protect both route and UI. If public, apply minimum-count suppression, coarser time buckets, delayed publication, and a documented privacy review.
- **Regression tests:** Unauthenticated access is rejected if protected; authorized access works; suppression hides buckets below the threshold; the response never includes raw coordinates or internal fields.
- **Could remediation alter visible behavior?** Yes—the public statistics feature or its granularity would change.

### AUD-003 — Statistics silently truncate and cold requests fan out without bounds

- **Severity / confidence / classification:** P2 / high / confirmed defect.
- **Affected:** `src/app/api/stats/route.js:42-53,211-273`.
- **Description:** The Supabase select has neither pagination nor a database-side aggregation. Hosted Supabase projects return at most 1,000 rows by default, so the ascending query silently omits newer rows after that limit. The handler then concurrently fetches coordinates for every returned unique municipality and defines no response cache policy.
- **Evidence:** The query calls `.select(...).order('date', ascending)` once. Official Supabase documentation states that projects return a maximum of 1,000 rows by default and recommends `range()` pagination: <https://supabase.com/docs/reference/javascript/select>. Lines 245-250 call `Promise.allSettled` over all unique municipality numbers.
- **Failure/abuse scenario:** Once 1,001 upload aggregate rows exist, the dashboard can stop showing recent activity while still returning `ok: true`. On a cold instance, a public request can open hundreds of simultaneous Geonorge calls; repeated cold instances multiply that load.
- **Current mitigating factors:** The in-memory coordinate cache helps warm instances; each coordinate call aborts at three seconds; only `upload_success` rows are selected.
- **Recommended remediation:** Move aggregation into SQL/RPC, include an explicit completeness/count contract, paginate if raw rows remain necessary, cap coordinate concurrency, persist/cache municipality centroids, and set an intentional short shared cache with stale-on-error behavior.
- **Regression tests:** Seed 1,001+ rows and prove the newest row is included; validate totals against a database aggregate; simulate 300 municipalities and assert the concurrency ceiling; verify cache headers and stale fallback.
- **Could remediation alter visible behavior?** Yes, by correcting totals and changing latency/freshness.

### AUD-004 — Health endpoint exposes diagnostics and accepts secrets in URLs

- **Severity / confidence / classification:** P2 / high / confirmed defect.
- **Affected:** `src/app/api/track/health/route.js:8-24,27-77,101-121`; `README.md:97`.
- **Description:** Read-mode health checks require no authorization and disclose whether Supabase and keepalive are configured, whether the aggregate table can be queried, a sample date, and raw Supabase/runtime error messages. Write authentication accepts `?secret=`, and the README advertises that fallback.
- **Failure/abuse scenario:** A monitor configured with a URL secret places it in Vercel/CDN/proxy logs and monitoring history. An unauthenticated scanner fingerprints backend configuration and table errors, making outage and schema details public.
- **Current mitigating factors:** Writes fail closed when the expected secret is unset; the sample is only a date; the response does not echo the secret or service-role key.
- **Recommended remediation:** Remove query-string secret support, authorize the whole diagnostic endpoint, use a constant-time comparison or platform-managed cron authentication, and return a minimal status externally while sending detailed errors only to protected logs/monitoring.
- **Regression tests:** Query secrets are rejected; header authentication succeeds; unauthenticated responses reveal no configuration booleans or backend messages; writes never occur on read checks.
- **Could remediation alter visible behavior?** Yes, for existing keepalive URLs and unauthenticated diagnostics.

### AUD-005 — Tracking debug endpoint is deployed without a production guard

- **Severity / confidence / classification:** P3 / high / defence-in-depth improvement.
- **Affected:** `src/app/api/track/debug/route.js:3-45`.
- **Description:** The production build includes `/api/track/debug`. It returns Vercel/Cloudflare geo headers, latitude/longitude, city/region, `request.geo`, and a partially redacted forwarded IP without authentication or an environment guard.
- **Failure/abuse scenario:** The endpoint becomes a stable fingerprinting/debug surface and can reflect spoofed proxy-header values outside the expected Vercel path. Errors are returned verbatim.
- **Current mitigating factors:** The data generally describes the requester, IPv4 is reduced to `/16`, and no application secret is returned.
- **Recommended remediation:** Exclude it from production or require the same protected operational access as health diagnostics; return generic errors.
- **Regression tests:** Production mode returns 404/403; authorized non-production mode redacts IPv4 and IPv6; arbitrary headers cannot cause secret/header reflection.
- **Could remediation alter visible behavior?** Only for users or monitors calling this debug route.

### AUD-006 — JSON fallback is non-atomic, non-durable on Vercel, and fails silently

- **Severity / confidence / classification:** P2 / high / confirmed defect.
- **Affected:** `src/lib/tracking/aggregates.js:23-42,72-124,127-138`; `src/app/api/track/route.js:31-47`; `src/app/api/stats/route.js:56-69`.
- **Description:** File persistence performs an unlocked read-modify-write directly to the target file. Concurrent requests lose increments, process interruption can leave truncated JSON, corrupt JSON has no recovery, and a Supabase failure automatically falls through to this path. The tracking route still returns `ok: true` when `stored` is false; stats turns every file error, including corruption, into an empty dataset.
- **Evidence:** There is no temp-file/rename, lock, compare-and-swap, or journal. Official Vercel guidance distinguishes local persistent filesystem access from Functions and states that local write behavior is not available equivalently in deployment: <https://vercel.com/kb/guide/why-does-my-serverless-function-work-locally-but-not-when-deployed>.
- **Failure/abuse scenario:** Two local requests read count 10 and both write 11. In preview without Supabase, writes to the bundle path fail and uploads appear successful but are not counted. A partial write makes public stats silently show zero.
- **Current mitigating factors:** Correctly configured Supabase uses an atomic `ON CONFLICT ... count + 1` RPC; storage errors are logged; tracking is best effort for the user workflow.
- **Recommended remediation:** Remove the file fallback from Vercel/production paths. For explicit local development, isolate it behind a mode flag and use an atomic temp-write/rename plus serialization and backup/recovery. Return an honest accepted/stored status and monitor storage failures.
- **Regression tests:** Concurrent increments preserve every count; simulated write interruption preserves the last valid file; corrupt JSON surfaces a diagnostic rather than zero stats; preview without Supabase never claims successful storage.
- **Could remediation alter visible behavior?** Yes, API status/source fields and local development persistence may change.

### AUD-007 — Retention is unenforced and live usage aggregates are version-controlled

- **Severity / confidence / classification:** P2 / high / confirmed defect.
- **Affected:** `src/features/user-tracking/supabase.sql:1-15`; `src/features/user-tracking/README.md:25-29`; `data/usage/aggregates.json:1-31`; `.gitignore:33-48`.
- **Description:** The documented 365-day retention goal has no SQL policy, scheduled job, or application deletion path. The repository tracks `data/usage/aggregates.json`; it currently contains two `upload_success` aggregate records with dates and area metadata. `.gitignore` does not exclude runtime usage data.
- **Failure/abuse scenario:** Municipality/date activity persists indefinitely in Supabase and becomes part of public git history when local fallback data is committed. Deleting the current file later would not remove prior commits.
- **Current mitigating factors:** Records are aggregate and contain no raw coordinate, filename, IP, or account; the current file is small.
- **Recommended remediation:** Define and automate retention, document ownership/deletion verification, ignore runtime usage paths, replace the tracked file with a schema-only fixture if needed, and assess whether history remediation is proportionate. Do not delete production data without an approved retention decision and backup plan.
- **Regression tests:** Retention job deletes only records older than the boundary; dry-run and backup paths work; CI fails if runtime aggregate records are added; a schema fixture contains synthetic values only.
- **Could remediation alter visible behavior?** Yes, historical statistics will eventually cover a bounded period.

### AUD-008 — Files have no size limit and parsing runs synchronously on the main thread

- **Severity / confidence / classification:** P2 / high / confirmed defect.
- **Affected:** `src/components/FileUpload.js:103-169,288-293`; `src/lib/parsing/gmiParser.js:12-28`; `src/lib/parsing/kofParser.js:14-16`.
- **Description:** `file.size` is recorded but never checked. `FileReader` loads the complete file, parsers split/build full in-memory structures, and validation begins synchronously in the `onload` callback on the UI thread.
- **Failure/abuse scenario:** A user drops a very large or highly repetitive file and the tab becomes unresponsive or is killed before the existing quota error handling can execute. Multiple layers multiply memory use.
- **Current mitigating factors:** Work stays in the browser; empty files are rejected; parsed data is not persisted to localStorage.
- **Recommended remediation:** Set documented byte/object/coordinate limits, reject early from metadata, move parsing and heavy validation to a Web Worker with cancellation/progress, and use streaming/bounded parsers where feasible.
- **Regression tests:** Boundary sizes just below/above the cap; cancellation; a large valid fixture keeps the main thread responsive; declared size, object count, and coordinate count limits all produce clear Norwegian errors.
- **Could remediation alter visible behavior?** Yes—oversized files will be rejected or processed asynchronously.

### AUD-009 — Non-finite or extreme coordinates can cause unbounded sample expansion

- **Severity / confidence / classification:** P2 / high / confirmed defect.
- **Affected:** `src/lib/parsing/gmiParser.js:155-189`; `src/lib/analysis/lineSampling.js:174-243`; `src/components/TerrainFetcher.js:130-156`.
- **Description:** GMI coordinate validation uses `!isNaN`, which accepts `Infinity`. Terrain generation creates `ceil(segmentLength / 1m)` samples with no maximum. A 1,000 m synthetic segment produced 1,001 points; a `1e309` GMI coordinate parsed as non-finite with zero warnings.
- **Failure/abuse scenario:** A malformed SP/OV/AF line with an infinite or extremely distant endpoint enters the terrain queue. `steps` becomes enormous or infinite and the synchronous loop freezes the tab before a request can be cancelled.
- **Current mitigating factors:** Terrain fetch batches at 50 and limits network concurrency to three, but those controls occur after the sample array is constructed.
- **Recommended remediation:** Require finite coordinates at every parser boundary, validate EPSG-specific bounds and plausible segment/total lengths, cap samples per line/file, and fail closed before analysis.
- **Regression tests:** `NaN`, `Infinity`, `1e309`, out-of-zone UTM, zero-length, extremely long segments, and a sample-cap boundary; assert bounded runtime and no network call on rejection.
- **Could remediation alter visible behavior?** Yes—implausible geometry will be rejected instead of displayed/analyzed.

### AUD-010 — Missing Z values become zero and are treated as present by incline analysis

- **Severity / confidence / classification:** P2 / high / confirmed defect.
- **Affected:** `src/lib/parsing/normalizeFeature.js:27-37`; `src/lib/analysis/incline.js:119-132`; `src/lib/analysis/zValidation.js:9-14`.
- **Description:** SOSI/KOF normalization maps a missing third ordinate to `0`. Z validation correctly treats zero as missing, but incline analysis only checks type and `NaN`, so it analyzes zero as a real height.
- **Evidence:** A targeted probe normalized two 2D coordinates to `[0, 0]`; Z validation reported two missing coordinates while incline analysis returned a warning result rather than the critical “missing Z” result.
- **Failure/abuse scenario:** A 2D SOSI/KOF gravity pipe receives an incline/terrain profile based on sea-level pipe elevations, potentially showing nonsensical slope or overcover alongside a separate missing-Z warning.
- **Current mitigating factors:** Z validation still flags zero and opens a prompt; KOF outlier analysis is disabled.
- **Recommended remediation:** Preserve missing Z as `null` throughout normalization, use one shared `isValidZ` rule across analyses, and block height-dependent analysis until every required ordinate is valid.
- **Regression tests:** 2D and explicit zero Z in every format; mixed missing/present vertices; ensure Z and incline modules agree and no terrain queue entry is created for invalid heights.
- **Could remediation alter visible behavior?** Yes, invalid profiles will disappear and be replaced by a clear missing-height state.

### AUD-011 — Weak parse acceptance and fixed Latin-1 decoding allow misleading partial results

- **Severity / confidence / classification:** P2 / high / confirmed defect.
- **Affected:** `src/components/FileUpload.js:65-100,148-183,288-293`; `src/lib/parsing/normalizeFeature.js:43-69`; `src/lib/parsing/kofParser.js:240-262`.
- **Description:** Upload success checks only `points.length` and `lines.length`, not whether those features have valid geometry. KOF/SOSI normalization can return empty coordinate arrays while the parser still pushes the feature. GMI/KOF input is always decoded as ISO-8859-1; there is no BOM/UTF-8 detection, replacement-character check, or lone-CR handling.
- **Failure/abuse scenario:** A malformed KOF line creates a point with no coordinates, passes the object-count check, increments upload tracking, and shows an apparently completed validation with blank/partial maps. A UTF-8 GMI/KOF file has Norwegian names and field keys mojibaked, producing false missing/invalid-field results.
- **Current mitigating factors:** Empty files, invalid GMI signatures, SOSI parser exceptions, and completely object-free results are rejected; SOSI receives raw bytes so `sosijs` can inspect its charset declaration.
- **Recommended remediation:** Define per-format acceptance invariants (recognized header, supported CRS, valid finite geometry, minimum fields, warning/error policy), detect BOM/declared charset with a controlled fallback, support CR/LF variants, and show warnings before counting the upload as successful.
- **Regression tests:** UTF-8/Latin-1/BOM fixtures, LF/CRLF/lone-CR, invalid coordinates, empty geometries, truncated sections, unknown extensions/content disagreement, and partially valid files.
- **Could remediation alter visible behavior?** Yes—some previously “successful” files will warn or fail, and UTF-8 values will display correctly.

### AUD-012 — Terrain requests lack timeout, cancellation, and dataset-generation binding

- **Severity / confidence / classification:** P2 / high / confirmed defect.
- **Affected:** `src/lib/analysis/terrain.js:145-228`; `src/components/TerrainFetcher.js:115-167,246-368,402-407`; `src/lib/store.js:622-635`.
- **Description:** Browser terrain fetches use no `AbortSignal` or timeout. Three hung requests occupy every global queue slot indefinitely. Component cleanup only changes a boolean and does not abort queued/in-flight requests. Base requests capture an old line, then call `setTerrainData(lineIndex)`; that action analyzes against whichever legacy dataset is current at completion.
- **Failure/abuse scenario:** File A is still fetching when file B is added. A result for line index 0 writes into B’s base terrain entry and is compared with B’s profile until B’s own result overwrites it. If the service stalls, all later terrain work remains queued forever.
- **Current mitigating factors:** Layer-specific completion includes a layer ID and ignores removed layers; successful requests are cached; network concurrency is limited; the UI records error status for rejected requests.
- **Recommended remediation:** Give each dataset/layer an immutable generation ID, include it in queued/completion actions, discard stale results, cancel on reset/removal/replacement, add per-request and whole-profile deadlines, bound/reject the queue, and expose retry state.
- **Regression tests:** Deferred File A response after File B load; layer removal during fetch; reset during fetch; three never-resolving requests; timeout/retry/cancel paths; stale completion must not mutate current state.
- **Could remediation alter visible behavior?** Yes—stale work will be cancelled and explicit timeout/retry messages will appear.

### AUD-013 — Removing a layer can leave legacy state showing the removed dataset

- **Severity / confidence / classification:** P2 / high / confirmed defect.
- **Affected:** `src/lib/store.js:1927-1984`; `src/components/FileUpload.js:211-217`.
- **Description:** Every upload adds a layer and also replaces legacy `file`, `data`, analysis, and terrain state. `removeLayer` clears legacy state only when no layers remain; if other layers remain, it does not detect that legacy state belongs to the removed layer or retarget it.
- **Failure/abuse scenario:** Upload A, then B; remove B while A remains. Layer-aware map portions show A, while numerous legacy consumers (`Sidebar`, validation modals, 3D tooltip, terrain base path) can still show B’s removed data and results.
- **Current mitigating factors:** Layer-aware components use `layers` and `layerOrder`; complete reset clears both models.
- **Recommended remediation:** Establish one source of truth. Prefer deriving active legacy selectors from an explicit active layer, or remove the legacy copies. On removal, atomically select a remaining layer and reset all dependent UI/analysis identifiers.
- **Regression tests:** Remove newest, oldest, active, hidden, and only layer; assert every selector/modal/table/2D/3D view references the same remaining layer.
- **Could remediation alter visible behavior?** Yes, by correcting which layer is active after removal.

### AUD-014 — Precise derived coordinates leave the browser without in-app transparency

- **Severity / confidence / classification:** P2 / high / confirmed defect.
- **Affected:** `src/components/FileUpload.js:19-49,219-227`; `src/lib/analysis/terrain.js:175-182`; `README.md:101-108`.
- **Description:** After every successful parse, a precise centroid is sent to `/api/track`, which forwards it to Geonorge municipality services. Terrain analysis sends dense exact coordinates directly from the browser to Geonorge in URL query strings. The centroid’s X/Y values are also logged to the production browser console. The README says “No file data leaves the browser” and “No personal data is collected,” but the application has no in-app notice/choice describing these derived-location flows, Vercel Analytics, or tile providers.
- **Failure/abuse scenario:** A sensitive infrastructure dataset reveals its surveyed location to external service logs and browser diagnostic history even though the user reasonably reads the privacy statement as local-only processing.
- **Current mitigating factors:** Raw file contents and filenames are not sent; tracking stores only municipality aggregates; traffic is HTTPS; the terrain feature inherently needs elevation coordinates.
- **Recommended remediation:** Replace absolute claims with a precise data-flow notice in the app, state purposes/providers/retention, add an opt-out or explicit action before nonessential tracking, remove precise production console logs, and minimize/query-proxy coordinate traffic only after a documented privacy decision.
- **Regression tests:** Network-observation test enumerates requests after upload and after opening terrain; tracking opt-out prevents centroid calls; production bundle emits no precise coordinate logs; privacy UI names every provider.
- **Could remediation alter visible behavior?** Yes, through notices/controls and potentially disabled-by-default tracking.

### AUD-015 — Conditional hooks can crash the profile view when result validity changes

- **Severity / confidence / classification:** P2 / high / confirmed defect.
- **Affected:** `src/components/InclineAnalysisModal.js:750-835`.
- **Description:** `PipeProfileVisualization` returns early for missing start/end Z before two later `useMemo` calls. The component is not keyed by selected line, so changing between a missing-height result and a valid result changes hook count in the same component instance, violating React’s Rules of Hooks.
- **Evidence:** Direct ESLint reports conditional-hook errors at lines 800 and 819. The parent renders the same `PipeProfileVisualization` with a changing `selectedResult`.
- **Failure/abuse scenario:** A user selects a missing-Z pipe and then a valid pipe (or the reverse); React can throw “Rendered more/fewer hooks than expected,” breaking the analysis modal or page.
- **Current mitigating factors:** If the component happens to remount due to surrounding UI state, the crash is avoided; the production build does not run ESLint.
- **Recommended remediation:** Move all hooks above conditional returns or split missing/valid render branches into separately mounted child components. Resolve all Rules-of-Hooks errors before enabling lint as a required gate.
- **Regression tests:** Render the modal and switch valid -> missing -> valid without remounting; assert no console error and correct profile/empty state.
- **Could remediation alter visible behavior?** No intended change; it prevents a crash.

### AUD-016 — Authenticated WMS tile blob URLs are never revoked

- **Severity / confidence / classification:** P3 / high / confirmed defect.
- **Affected:** `src/components/AuthenticatedWmsLayer.js:48-101`.
- **Description:** Each authenticated tile response is converted to a blob URL and assigned to an image, but no load/unload/removal path calls `URL.revokeObjectURL`, and the fetch is not aborted when Leaflet discards a tile.
- **Failure/abuse scenario:** Extended panning/zooming creates many unreclaimed blobs and completed fetches for tiles no longer used, growing tab memory until navigation/reload.
- **Current mitigating factors:** It affects only authenticated custom WMS usage; document teardown eventually releases resources; server-side WMS size containment is already implemented.
- **Recommended remediation:** Track each tile’s blob URL, revoke after safe image load/removal, implement Leaflet tile abort/removal hooks, and ensure credentials remain in memory only.
- **Regression tests:** Mock repeated tile creation/removal and assert every blob URL is revoked and obsolete fetches abort.
- **Could remediation alter visible behavior?** No intended change; tile cancellation may reduce unnecessary loading.

### AUD-017 — Audit reports affected production packages, but most vulnerable paths are not evidenced

- **Severity / confidence / classification:** P3 / high / dependency advisory, reachability unconfirmed.
- **Affected:** `package-lock.json:5937-5948,6796-6805,7611-7615,7870-7879`; `package.json:11-31`.
- **Description:** `npm audit --omit=dev` reports five high-severity package entries: direct `next@16.1.6` plus nested PostCSS, Sharp, Underscore, and `ws`. Next 16.1.6 is in reviewed App Router/Server Component denial-of-service advisory ranges (for example <https://github.com/advisories/GHSA-q4gf-8mx6-v5v3> and <https://github.com/advisories/GHSA-8h8q-6873-q5fj>).
- **Reachability assessment:** The app uses App Router, but the production server-reference manifest contains zero Server Actions and the middleware manifest contains zero middleware/functions. The repository also has no `next/image`, rewrites, CSP nonce, Cache Components, custom WebSocket server, Supabase realtime subscription, or attacker-supplied CSS/source-map pipeline. `sosijs` uses Underscore, but the audited GeoJSON path does not evidence calls to the advisory’s recursively vulnerable `flatten`/`isEqual` operations on nested user objects. Therefore package presence is confirmed, but exploitability of the reported operations is not.
- **Failure/abuse scenario:** A future feature enables an affected Next pathway or exposes one already handled internally by the framework; the known affected version then provides a remote denial-of-service surface. Similar feature changes could activate the transitive advisories.
- **Current mitigating factors:** Vercel may provide platform protections not visible here; absent feature paths materially reduce several advisories; no critical advisory was reported.
- **Recommended remediation:** Plan a controlled Next upgrade to a currently supported patched release after reviewing release notes and all applicable advisories; the highest minimum patched version among the July results was 16.2.11, but select a current stable version at implementation time rather than blindly changing the range. Re-run audit and the full compatibility suite. Trace or replace old `sosijs` deliberately rather than bulk-upgrading unrelated packages.
- **Regression tests:** Production build, route/API tests, upload fixtures, map/3D/manual compatibility, and an advisory reachability checklist after the selected upgrade.
- **Could remediation alter visible behavior?** Potentially; framework/compiler/runtime behavior requires manual compatibility testing.

### AUD-018 — Repository defines no application security-header policy

- **Severity / confidence / classification:** P3 / high / defence-in-depth improvement.
- **Affected:** `next.config.mjs:1-5`.
- **Description:** The Next configuration enables only the React Compiler. There is no repository-owned CSP/frame-ancestors, Referrer-Policy, Permissions-Policy, or explicit cross-origin policy. Platform defaults could not be verified from the repository.
- **Failure/abuse scenario:** A future injection or compromised third-party script has fewer browser-enforced limits, the app may be framed for UI redress, and referrer behavior is left to browser/platform defaults.
- **Current mitigating factors:** React escapes normal user-controlled values; the only `dangerouslySetInnerHTML` call receives SVG generated from constant legend definitions; external URLs are fixed except the previously contained WMS feature; HTTPS/HSTS may be provided by Vercel.
- **Recommended remediation:** Inventory required script/connect/image/font/connect origins, deploy a report-only CSP first, then enforce CSP with `frame-ancestors`; add explicit Referrer-Policy, Permissions-Policy, and MIME-sniffing headers while preserving WMS/map/analytics compatibility.
- **Regression tests:** Header assertions for page and API responses; CSP report review; manual maps, analytics, terrain, WMS, QR, and 3D smoke tests.
- **Could remediation alter visible behavior?** Possibly—an incorrect CSP can block maps, analytics, fonts, or WMS.

### AUD-019 — No CI exists and both available lint paths fail

- **Severity / confidence / classification:** P2 / high / missing test coverage plus confirmed tooling defect.
- **Affected:** `package.json:5-10`; `eslint.config.mjs:1-16`; `tests/wmsProxyPolicy.test.mjs:1-440`.
- **Description:** There is no root `.github/workflows` configuration and no `test` script. The only tests cover the completed WMS policy. `npm run lint` runs `next lint`, which Next.js 16 interprets as a project directory and fails. `npx eslint .` runs but reports 41 errors and 11 warnings, including Rules-of-Hooks defects; `next build` does not enforce these errors.
- **Failure/abuse scenario:** Parser, tracking, state-race, and calculation regressions reach `main` because a successful Vercel build is the only apparent automated signal.
- **Current mitigating factors:** The production build succeeds; WMS policy has 24 focused tests; ESLint configuration exists and can be invoked directly.
- **Recommended remediation:** Replace the obsolete lint script with direct ESLint after triaging existing findings, add a real test script, and require CI. A minimal proposed workflow is:

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: node --test tests/*.test.mjs
      - run: npx eslint .
      - run: npm run build
```

- **Regression tests:** The workflow itself should be tested on a failing lint commit, failing unit test, and failing build; branch protection should require the job.
- **Could remediation alter visible behavior?** No directly, but fixing surfaced defects can.

### AUD-020 — Norwegian UI is declared English and major modals lack dialog semantics

- **Severity / confidence / classification:** P3 / high / confirmed defect.
- **Affected:** `src/app/layout.js:12-25`; `src/components/StatsModal.js:260-320`.
- **Description:** The root document declares `lang="en"` although the UI is Norwegian. The statistics modal is a generic pair of `div`s without `role="dialog"`, `aria-modal`, labelled-by linkage, initial focus, focus trapping, or focus restoration. Similar custom modal patterns should be audited consistently.
- **Failure scenario:** Screen readers apply English pronunciation to Norwegian validation messages, and keyboard users can tab behind a modal or lose their place. That increases the chance of missing warnings or acting on the wrong layer/result.
- **Current mitigating factors:** The close button has an accessible label and Escape closes the statistics modal; many controls use native buttons.
- **Recommended remediation:** Set `lang="nb"`/`nb-NO`, create a shared accessible dialog primitive, label each modal, trap/restore focus, and test keyboard order and live error/loading announcements.
- **Regression tests:** Automated axe checks and keyboard tests for upload error, statistics, validation, and analysis modals; assert root language.
- **Could remediation alter visible behavior?** Minor focus behavior will change; visual output should not.

## Review-area conclusions

### 1. Remaining server/API routes

The routes have no shared authentication/authorization layer. That is acceptable for the public application page but not automatically appropriate for write, admin-statistics, health, or debug operations. AUD-001 through AUD-006 cover the material route findings. Secrets remain server-side in `src/lib/tracking/supabase.js`; no client import or `NEXT_PUBLIC_` exposure was found. Error handling is mixed: `/api/track` uses a generic 500 message, while stats/health/debug return raw backend/runtime messages. Cache behavior is not intentional for stats or health. The WMS route was excluded as requested.

### 2. Tracking and persistence

Supabase’s `increment_aggregate` SQL is atomic under concurrency, which is a meaningful strength. The JSON fallback is not atomic and is not a production persistence mechanism on Vercel. Repeated uploads and arbitrary direct calls count repeatedly; there is no user/session/idempotency distinction, so “uploads” should not be interpreted as unique users or projects. The schema grows by date/hour/area/event and has no enforced retention. Development can write the tracked JSON file; preview/production behavior depends on environment configuration and can silently lose events.

### 3. Client-side file processing

All three formats are processed locally, and raw bytes are not posted to application APIs. SOSI receives raw bytes for charset detection, while GMI/KOF are forced to Latin-1. There are no file/feature/coordinate/attribute-length/geometry-complexity limits or Web Workers. GMI allows non-finite numeric values; normalized parsers can retain features with empty geometry. Missing Z semantics are inconsistent between normalization and analyses. No evidence of file contents being rendered as raw HTML was found; React escapes normal attributes.

### 4. Frontend and state management

Parsed data is not persisted, and event listeners inspected generally have matching cleanup. The main reliability problem is parallel state models: every upload populates `layers` and legacy `data/file/analysis/terrain`. This creates stale-removal and stale-async completion risks. React Three Fiber ordinarily disposes declarative geometries on unmount, so the absence of manual Three.js `.dispose()` calls was not treated as a defect. The authenticated WMS blob path is an exception because browser blob URLs require explicit revocation. ESLint found additional memoization/compiler warnings that should be triaged but were not inflated into separate findings without demonstrated incorrect output.

### 5. External services and network behavior

Server-side Geonorge lookup calls have explicit 2.5/3-second aborts. Browser terrain calls do not. Terrain batches and concurrency controls are useful but do not cap total work, response time, or stale completions. External response validation mostly assumes JSON shape and array order; unexpected fields are tolerated, while malformed JSON rejects the entire batch. Map/tile requests inherently disclose IP and viewport to providers. Exact terrain coordinates and tracking centroids deserve explicit in-app transparency.

### 6. General application security

No confirmed XSS, open redirect, path traversal, prototype-pollution exploit, insecure randomness used for security, or SSRF outside the completed WMS scope was found. Layer IDs use `Math.random`, but they are UI identifiers rather than security tokens. User values are normally rendered through React text nodes. `MapLegend` uses `dangerouslySetInnerHTML`, but its SVG category/color inputs come from constant `LEGEND_ITEMS`, not raw file attributes. Primary residual security issues are public operational/write endpoints, dependency posture, sensitive precision in console logs, and missing browser policy headers.

### 7. Reliability and maintainability

`src/lib/store.js` is 3,084 lines and duplicates base/layer terrain and overcover logic; `MapInner.js` is similarly large and tightly coupled. A stale `src/components/Sidebar.js.bak` remains tracked. The SQL cheat sheet has drifted from the authoritative schema (for example historical function signatures), increasing operational error risk. These are maintainability signals rather than independently prioritized production defects. Error swallowing in file stats and best-effort tracking is included in AUD-006.

The README’s Node.js “>=18” prerequisite is inconsistent with installed Next 16.1.6, whose local package metadata requires Node >=20.9.0, and `package.json` has no `engines` field. Correcting documentation and pinning CI to Node 22 are quick wins.

### 8. Tests and continuous integration

Only the completed WMS policy has tests. Important untested behavior includes:

- parser fixtures for each charset/line-ending/format and malformed input;
- finite-coordinate, geometry-size, Z-preservation, and partial-parse contracts;
- incline, terrain sampling, and overcover numeric invariants;
- Zustand add/remove/reset/active-layer transitions;
- stale/cancelled terrain promises and queue deadlines;
- tracking input/rate/idempotency behavior;
- Supabase pagination/aggregation and JSON corruption/concurrency;
- health/debug authorization and error redaction;
- privacy network expectations;
- accessible dialogs, keyboard flows, and valid/missing profile switching;
- end-to-end multi-layer upload/remove/re-upload behavior.

A practical structure is:

```text
tests/
  unit/parsing/           # table-driven fixtures and bounded fuzz/property cases
  unit/analysis/          # numeric invariants and sample caps
  unit/store/             # pure action/selector transitions
  integration/api/       # Request/Response tests with mocked Supabase/Geonorge
  integration/terrain/   # fake timers, deferred fetches, cancellation
  component/             # React Testing Library + axe
  e2e/                   # Playwright critical upload/layer/profile paths
  fixtures/              # synthetic, non-sensitive GMI/SOSI/KOF samples
```

Use direct ESLint, not the removed Next.js lint command. Establish a known baseline for existing lint errors, then require zero new errors while fixing the baseline promptly; do not permanently suppress Rules-of-Hooks findings.

### 9. Dependencies and configuration

The lockfile resolves the declared semver ranges deterministically for `npm ci`; installed and locked versions matched. `npm audit --omit=dev` reported five affected production package entries and zero critical entries. Only Next is direct. Reachability analysis is documented in AUD-017; no blind package upgrade is recommended.

`next.config.mjs` has no production header or route safeguards. No `vercel.json`, root workflow, environment example, middleware/proxy file, or tracked `.env` file exists. `.gitignore` correctly excludes `.env*`, `.vercel`, build output, PEM files, and node modules, but not runtime usage data. Actual Vercel environment scoping, firewall/rate limits, log drains, deployment protection, regions, function duration, and security headers could not be verified from the repository.

## Recommended remediation phases

### Phase 0 — production containment and correctness

1. Contain `/api/track`: fixed schema/event allowlist, coordinate bounds, rate limiting, origin/idempotency strategy, monitoring.
2. Remove URL keepalive secrets; protect health details; disable/guard debug in production.
3. Reject non-finite/extreme geometry and cap terrain sampling before allocation.
4. Preserve missing Z as `null` and block height analysis consistently.
5. Add terrain generation IDs, abort/deadline handling, and stale-result rejection.
6. Fix conditional hooks and make direct ESLint runnable; add minimal CI.

### Phase 1 — data correctness, privacy, and supported runtime

1. Decide whether stats are public or administrative; protect or suppress small/coarse buckets.
2. Replace unpaginated stats reads with database aggregation and bounded coordinate lookup/cache.
3. Remove the production file fallback; make local persistence explicit and atomic if retained.
4. Enforce retention and stop versioning runtime aggregate data.
5. Add file/feature limits, worker-based parsing, encoding detection, and strict geometry acceptance.
6. Unify layer and legacy state; make active-layer transitions atomic.
7. Publish accurate in-app network/privacy disclosure and remove precise production console logs.
8. Select and manually validate a patched Next release; re-run advisory reachability checks.

### Phase 2 — defence in depth and maintainability

1. Add/report/enforce CSP and explicit security headers with compatibility testing.
2. Revoke/abort WMS tile resources.
3. Introduce a shared accessible dialog primitive and correct document language.
4. Decompose the store/map components and deduplicate base/layer analysis logic.
5. Remove stale backup code and reconcile operational SQL documentation.

## Quick wins

- Reject every tracking event except the intended fixed set.
- Stop accepting `?secret=` and remove it from documentation.
- Return generic public errors from stats/health/debug.
- Add a hard early `file.size` limit and finite coordinate checks.
- Add a maximum terrain points-per-line and points-per-file limit.
- Set `<html lang="nb">`.
- Replace `next lint` with direct ESLint once the current baseline is addressed.
- Ignore runtime usage data and use a synthetic fixture.
- Correct README Node requirements to >=20.9 or the deliberately selected CI/runtime version.
- Add explicit cache policy and bounded concurrency to `/api/stats`.

## Changes requiring manual compatibility testing

- Any Next/React/React Compiler upgrade.
- Parser charset detection and stricter acceptance against representative vendor GMI/SOSI/KOF files.
- File/geometry/sample caps against the largest legitimate customer datasets.
- Worker migration, especially error text, progress, cancellation, and repeated upload.
- Layer-state unification across sidebar, data tables, map, 3D, filters, and every modal.
- Terrain cancellation/generation logic under slow Geonorge responses.
- Stats authentication/suppression/aggregation and existing dashboard interpretation.
- Retention changes against reporting expectations and backup requirements.
- CSP/security headers across Kartverket, OSM, CARTO, Vercel Analytics, terrain, and custom WMS.
- Accessible modal focus behavior with keyboard and screen readers.

## Questions and unresolved uncertainties

1. Are `/api/stats`, `/api/track/health`, and `/api/track/debug` intentionally public in production, or is Vercel Deployment Protection expected to cover them?
2. What Vercel firewall/rate-limit, bot protection, function region/duration, log drain, and response-header policies are configured outside the repository?
3. Are Supabase variables configured independently for Development, Preview, and Production? Is production known to have run the current hourly/kommune migration?
4. What is the production aggregate row count, API maximum-row setting, RLS/grant policy, backup plan, and actual retention process?
5. Is the committed aggregate JSON synthetic or historical operational data? Is the GitHub repository public as the application link suggests?
6. What are the largest legitimate files, longest legitimate segments, allowed CRS set, and supported GMI/KOF encodings from real users?
7. Is upload count intended to mean parse events, unique files, projects, sessions, or users? The current metric cannot distinguish them.
8. Is external transmission of exact terrain coordinates and a tracking centroid covered by an existing privacy notice or data-processing assessment outside the repository?
9. Does Vercel currently mitigate any of the reported Next.js advisories at the platform edge? This cannot be assumed from source.
10. Which modal and analysis flows are considered safety-critical for engineering decisions, and what compatibility fixtures represent them?

## Commands run and results

| Command | Result |
|---|---|
| `git status --short --branch --untracked-files=all` (initial) | Passed; clean branch at `14d9ff6` |
| `git log`, `git diff production-baseline-2026-07-23..HEAD`, targeted file histories | Passed; only completed WMS containment differs from the tagged baseline |
| Repository `rg` inventories for files, APIs, fetches, env use, rendering sinks, auth, headers, tests | Passed; one PowerShell quoting attempt failed and was rerun safely |
| `npm ls --depth=0` and targeted `npm ls ... --all` | Passed; installed top-level versions matched lockfile |
| `npm audit --omit=dev --json` | Initial sandbox network call failed; approved read-only retry completed with exit 1 and 5 high package entries, 0 critical |
| Current GitHub advisory review | Completed using GitHub Advisory Database primary pages |
| `node --test tests/wmsProxyPolicy.test.mjs` | Passed: 24/24 |
| `npm run lint` | Failed: Next 16 no longer provides `next lint`; interpreted `lint` as a directory |
| `npx eslint .` | Failed: 52 findings (41 errors, 11 warnings) |
| Targeted ESLint on hook-violation files | Failed as expected; confirmed conditional hooks |
| `npm run build` | Passed; Next 16.1.6/Turbopack built 1 static page and 5 dynamic API routes |
| Built manifest inspection | Passed; 0 Server Actions and 0 middleware/functions |
| Synthetic Z normalization/incline probe | Confirmed missing Z normalized to zero; Z validator and incline disagreed |
| Synthetic non-finite GMI probe | Confirmed `1e309` parsed as non-finite with no warning |
| Synthetic terrain sampling probe | Confirmed a 1,000 m segment generated 1,001 points |
| `npm view next@16.1.6 engines --json` | Timed out in sandbox; local installed metadata confirmed Node `>=20.9.0` |
| `git diff --check` and final status/scope checks | Recorded in the final verification section below |

The `.next` directory changed as an ignored build artifact only. No temporary analysis file was created in the repository or outside it.

## Explicit source-change confirmation

No application source code, configuration, dependency manifest, lockfile, test, git index, commit, remote branch, or deployment was changed. The only intended working-tree additions are this Markdown report and its companion CSV under `docs/agent-reports/`. They remain unstaged.

## Final verification

After both reports were written:

- `git diff --check` passed with no output.
- `git status --short --branch --untracked-files=all` showed the audit branch plus exactly two untracked files: this Markdown report and its companion CSV.
- `git diff --name-only` showed no tracked-file changes.
- `git ls-files --others --exclude-standard` listed exactly the two requested report paths.
- `git diff --cached --name-only` showed nothing staged.

No part of the repository review was intentionally omitted. The live Vercel/Supabase controls and representative real-world vendor files listed under “Questions and unresolved uncertainties” were unavailable from repository evidence and therefore remain explicitly unresolved rather than guessed.
