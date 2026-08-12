# Stage 2 richer upload telemetry architecture and security review

**Review date:** 2026-08-11

**Candidate plan:** `docs/agent-reports/20260811-richer-upload-telemetry-stage2-plan.md`

**Branch reviewed:** `feature/richer-upload-telemetry-app`

**Reviewed HEAD:** `5439c2c2f97200a9af9f03afb69251c9f1be88f0`

**Review type:** adversarial architecture/security review only

**Overall verdict:** GO WITH CHANGES

**Blockers:** 3

**High findings:** 7

## 1. Review verdict

Luna’s four-slice sequence is directionally sound. It preserves the additive Stage 1 boundary, correctly keeps `public.aggregates` authoritative, places the richer RPC after the legacy write, uses fixed categories, keeps richer writes disabled by default, and separates application implementation from production activation.

The plan should not be implemented unchanged. Three issues are blockers for the affected later slices or for release:

1. Extending the current all-or-nothing request validator with an optional telemetry object can cause malformed richer telemetry to reject the whole request before the legacy increment. That conflicts with the explicit failure-isolation requirement.
2. The proposed public detailed response does not yet define adequate anti-correlation rules for daily rows, sparse categories, app versions, or the multi-column municipality-resolution table.
3. The unauthenticated debug route returns exact location-related headers, raw geo data, and a partially redacted IP value. It conflicts directly with the stated privacy boundary and is a release blocker.

These blockers do not prevent the pure Slice 1 classifier work from beginning, provided the CRS semantics and classifier input boundary are corrected first. The verdict for starting Slice 1 is therefore **GO WITH CHANGES**, not no-go.

The visible Preview milestone can safely move earlier. A reusable Norwegian detailed-statistics shell, privacy/explanation text, clearly inactive state, corrected legacy labels, and `<html lang="no">` can be included in Slice 1 without querying either richer table, enabling any write, or fabricating data.

Stage 1 itself remains accepted as complete. The reviewed SQL and validation records confirm that the database owns UTC date derivation, fixed-domain validation, and atomic increments across both new tables. This review proposes no SQL change.

## 2. Findings ranked

### BLOCKER

#### B1. Optional telemetry validation can suppress the authoritative legacy increment

**Relevant code:**

- `src/lib/tracking/trackingRequestPolicy.mjs`: `validateTrackingRequest`, `parseTrackingRequest`
- `src/lib/tracking/trackingHandler.mjs`: `createTrackingPostHandler`

**Concrete failure mode:**

The current policy validates the complete request and throws before lookup or persistence for an unknown key, invalid type, oversized body, or malformed JSON. Luna proposes adding an optional strict `telemetry` object to that same validation path. If implementation simply extends `TRACKING_REQUEST_KEYS` and validates telemetry with the same throwing behavior, a classifier defect, stale client, contradictory category, or extra telemetry key will reject the whole request. `createTrackingPostHandler` will then call neither municipality lookup nor `incrementAggregate`.

That means a richer-telemetry validation failure can prevent legacy counting, even though the upload itself succeeded. It violates the central Stage 2 requirement.

**Smallest safe correction:**

Keep one `POST /api/track`, one bounded body, and one JSON parse, but split validation into two layers:

1. Fatal core validation for `eventType` and `datasetCoord`.
2. Non-fatal optional telemetry validation that returns either a fully normalized fixed object or a fixed rejection status such as `invalid_optional_telemetry`.

For a valid core request with invalid optional telemetry, continue resolver and legacy increment exactly once, skip the richer RPC, and return a sanitized success response. Unknown top-level keys other than the explicitly optional `telemetry` key remain fatal. Malformed JSON and a body that cannot safely be read within the cap remain fatal because no trustworthy core request can be recovered.

A separate endpoint is not required if this separation is implemented and tested. If the product requires legacy counting even when the combined body is oversized or syntactically invalid because of telemetry, then a second request is the only strong isolation boundary; that stronger requirement has not been stated and would add unnecessary complexity.

#### B2. Public detailed output lacks explicit anti-correlation and sparse-cell rules

**Relevant code planned for change:**

- `src/app/api/stats/route.js`: `GET` and future richer-table response construction
- `src/components/StatsModal.js`: `StatsModal` and future detailed distributions
- Stage 1 table `public.municipality_resolution_daily`, whose key intentionally combines date, file format, outcome, primary result, and fallback result

**Concrete failure mode:**

The database stores daily independent metric rows, but daily granularity can still make dimensions correlatable when volume is low. If one upload occurs on a date, every metric row for that date can be linked mathematically. App-version transitions provide another strong time marker. The municipality-resolution table is not fully independent: one row combines file format with overall, primary, and fallback outcomes by date.

Luna correctly says not to return raw rows, but the plan does not prohibit date-by-value detailed series, does not define low-count suppression, and does not explicitly forbid returning municipality-resolution combinations. A grouped API can still leak correlations if it groups by date or exposes sparse cells and a detailed total from which suppressed values are inferable.

**Smallest safe correction:**

Before Slice 3 implementation, define the public response contract as follows:

- Aggregate each upload metric over the complete configured detailed period initially; do not return detailed dates or daily series.
- Return only marginal distributions by one metric at a time.
- For municipality diagnostics, separately marginalize `resolution_outcome`, `primary_result`, and `fallback_result`; never return file-format/outcome/result combinations or source rows.
- Exclude `app_version` and `telemetry_schema_version` from the public API.
- Define a reviewed minimum-publication threshold. Until the detailed cohort and each displayed cell meet that threshold, show an inactive/insufficient-data state rather than exact sparse counts.
- Do not expose a detailed total or remainder that allows a suppressed cell to be calculated by subtraction.
- State that displayed distributions are independent and may have incomplete coverage because richer writes are best effort.

The exact threshold is a product/privacy decision that must be recorded before the first public detailed response. It does not require a database change.

#### B3. The debug route violates the hard privacy boundary

**Relevant code:**

- `src/app/api/track/debug/route.js`: `GET`, `safeHeader`

**Concrete failure mode:**

The route is unauthenticated and returns `request.geo` wholesale plus selected request headers. Its explicit list includes latitude, longitude, city, country, region, forwarded IP, and Cloudflare country data. The IPv4 handling still returns a network-prefix value rather than removing the IP field. The catch path also returns an arbitrary error string.

This directly conflicts with the prohibition on exact coordinates, IP addresses, raw headers, and arbitrary error strings. Luna identified the route correctly but treated it too softly.

**Smallest safe correction:**

Treat this as a release blocker, not a prerequisite for writing pure Slice 1 code. Before any Stage 2 branch is merged or deployed, remove the route or make production/Preview return 404 with no request-derived content. Removal is simpler and safer than adding another secret-bearing debug authentication surface. No Stage 2 code should depend on it.

Because the route already exists on the reviewed baseline, its remediation can be a separate narrow privacy patch, but Stage 2 release sign-off must verify the route is unavailable.

### HIGH

#### H1. Fixed allowlists constrain shape but do not provide telemetry integrity

**Relevant code:**

- `src/lib/tracking/trackingRequestPolicy.mjs`: `validateTrackingHeaders`, `validateTrackingRequest`
- `src/app/api/track/route.js`: `POST`
- future browser classifiers in `src/components/FileUpload.js`

**Concrete failure mode:**

The endpoint is anonymous. `Origin` and `Sec-Fetch-Site` checks constrain ordinary browser requests but do not authenticate a scripted client, which can forge those headers. The server can validate that a browser-derived value is an allowed category; it cannot prove that the client actually parsed a file of that format, size, object count, CRS, or warning profile.

A malicious client can repeatedly submit valid-looking category sets and poison all richer distributions. This is an integrity risk, not a privacy leak, and it already has an analogue in the legacy anonymous count path.

**Smallest safe correction:**

Document browser metrics as untrusted client-reported categories. Do not describe server allowlist validation as verification of their truth. Keep one richer RPC call per accepted request, add no retry loop, and monitor only fixed aggregate success/failure indicators. If abuse controls are later required, use a separately reviewed edge/rate-limit mechanism that does not persist IPs, user agents, request IDs, or upload identifiers. Do not add cookies, event UUIDs, or per-upload deduplication to solve this in Stage 2.

The public UI must describe upload events and recorded detail, not authenticated users or guaranteed complete/accurate census data.

#### H2. Resolver outcome precedence and cache semantics are not defined tightly enough

**Relevant code:**

- `src/lib/tracking/kommuneLookup.js`: `fetchJsonWithTimeout`, `lookupFromAddressApi`, `lookupFromKommuneInfo`, `lookupKommuneFromCoord`, `CACHE`

**Concrete failure mode:**

Luna lists possible overall outcomes but leaves “dominant” error precedence for implementation. Ambiguous combinations include:

- primary timeout, fallback no-match;
- primary no-match, fallback network error;
- primary HTTP failure, fallback invalid shape;
- primary invalid JSON, fallback timeout;
- primary failure of any type, fallback match;
- cache hit for a location originally resolved through primary or fallback; and
- an unexpected non-2xx class that is neither 4xx nor 5xx after fetch behavior is considered.

Without one deterministic table, different code paths can classify the same pair differently, and refactoring can silently change public diagnostics. The current positive cache stores only the location. A cache hit cannot reconstruct primary/fallback diagnostics reliably unless the cache stores the safe structured result.

**Smallest safe correction:**

Define and test the complete mapping before editing the resolver:

- Any validated match wins: primary match -> `resolved_primary`; fallback match -> `resolved_fallback`, regardless of the primary failure class.
- No usable input -> the corresponding `no_coordinate`/CRS/coordinate outcome with both results `not_attempted`.
- Both valid empty results -> `no_match`.
- For all non-match pairs, use one fixed documented precedence across `internal_error`, invalid response, HTTP failure, network failure, timeout, and no-match.
- Do not emit `outside_norway` in v1 unless a reliable reviewed server-side signal exists.
- Cache the complete safe `{location, diagnostics}` result, or define cache hits as reusing the original fixed diagnostic classification. Call the metric “resolution path,” not a count of actual upstream HTTP calls.

The resolver should distinguish a valid empty upstream response from a malformed shape using fixed schema checks, without retaining raw data.

#### H3. CRS provenance semantics need correction before classifier implementation

**Relevant code:**

- `src/components/FileUpload.js`: `handleFile`, current `parsedEpsg` check and `window.confirm` mutation
- `src/lib/tracking/datasetCoordinate.js`: `getEpsgFromHeader`, `getDatasetCoordinate`
- `src/lib/parsing/gmiParser.js`: header parsing and EPSG normalization
- `src/lib/parsing/sosiParser.js`: GeoJSON CRS extraction
- `src/lib/parsing/kofParser.js`: KOF `KOORDSYS`, projection-text, and coordinate heuristic mapping

**Concrete failure mode:**

Luna is right that provenance must be captured before `FileUpload` writes the user choice into `header.COSYS_EPSG`, but parts of the proposed classification are too broad:

- KOF `KOORDSYS 22/23` is an explicit format declaration mapped to EPSG and should normally be `declared`, not `inferred`.
- Explicit KOF projection text is also declaration evidence; only a coordinate-value heuristic is clearly `inferred`.
- `Number('')` and other coercions can blur missing and invalid inputs if strict token checks are not used.
- An explicit unsupported numeric CRS should be `crs_status=unsupported` and `epsg_category=other`, even though it was declared.
- After a missing or invalid source CRS is replaced by a user choice, the Stage 1 schema has only one `crs_status` value. The plan must decide whether the recorded result is `assumed` or the original failure. Recording both is impossible without changing SQL.
- Current `window.confirm` always yields either EPSG:25832 or EPSG:25833; “Cancel” means zone 33, not “leave missing.” Under current behavior, a source-missing upload that succeeds should therefore normally become `assumed`, not `missing`.

**Smallest safe correction:**

Define a small format-specific source classification at parser output:

- supported explicit EPSG/format declaration -> `declared`;
- supported coordinate heuristic -> `inferred`;
- user-selected operational CRS -> `assumed`;
- absent and not replaced -> `missing`;
- present but unparsable and not replaced -> `invalid`;
- parsed but unsupported -> `unsupported`.

Use a shared strict EPSG extractor for both the prompt decision and `getDatasetCoordinate`; do not let `FileUpload` and tracking interpret different header fields. For the existing UI behavior, a user choice should override missing/invalid source status to `assumed`; document that the v1 schema measures the operational provenance used for the upload, not both original defect and final selection.

#### H4. The stats route must stop presenting a silent local fallback as complete production data

**Relevant code:**

- `src/app/api/stats/route.js`: `getRecordsFromSupabase`, `getRecordsFromFile`, `GET`, `processRecords`

**Concrete failure mode:**

When Supabase is configured but the read fails, `GET` logs the raw message, reads a local JSON file, returns `ok: true`, and labels the source `file`. A small or stale local file can therefore appear as a complete historical dashboard. The Supabase query is also unpaginated and ordered only by date, so it can silently omit rows when the Data API page limit is reached. The outer catch returns `error.message` publicly.

Adding richer charts on top of an incomplete legacy denominator would make percentages and coverage claims misleading.

**Smallest safe correction:**

Before wiring real detailed data in Slice 3:

- deterministically paginate the legacy Supabase read using the full primary-key ordering;
- when Supabase is configured and its read fails, return a sanitized Norwegian 503/availability response rather than silently substituting local data;
- keep local-file reads only for explicitly unconfigured local development;
- validate counts as finite non-negative integers before aggregation; and
- return a fixed Norwegian public error, never `error.message`.

The municipality-centroid fan-out and map caching can wait; they are existing performance concerns and are not prerequisites for the first detailed UI.

#### H5. Feature flags do not by themselves isolate Preview from production

**Relevant code:**

- `src/lib/tracking/supabase.js`: module-level `SUPABASE_URL`, service credential, and `getClient`
- `src/app/api/track/route.js`: future richer dependency wiring
- future server configuration module proposed by Luna

**Concrete failure mode:**

If a Preview deployment inherits production Supabase credentials, setting the richer write flag in Preview will still write production. A default-off flag reduces likelihood but does not identify the database target. The same issue applies to detailed reads and synthetic Preview fixtures.

**Smallest safe correction:**

Keep the write and read flags default-off, but make the release checklist explicitly verify the environment/database pairing before either flag is enabled. Preview writes are allowed only with a separately configured disposable database. Record only a pass/fail environment assertion, not project identifiers or credentials. Fail closed when required configuration is missing or contradictory.

Do not add project secrets or identifiers to browser code. A server-side environment classification may be used as an additional guard, but it is not a substitute for Vercel environment scoping and target verification.

#### H6. Raw logging in touched telemetry paths conflicts with the stated privacy rule

**Relevant code:**

- `src/components/FileUpload.js`: `trackUploadSuccess`, parser catch in `handleFile`
- `src/lib/parsing/sosiParser.js`: parser catch
- `src/lib/tracking/supabase.js`: `incrementAggregateInSupabase`
- `src/lib/tracking/aggregates.js`: `incrementAggregateInFile`
- `src/app/api/stats/route.js`: Supabase fallback warning and outer catch

**Concrete failure mode:**

The browser currently logs EPSG, exact `sampleCount`, the returned location object, and arbitrary caught errors. SOSI logs the raw parser error. Server paths log raw Supabase, filesystem, and stats errors. Adding richer payload handling without tightening these touched paths risks logging exact upload facts, arbitrary parser/upstream strings, or infrastructure details.

**Smallest safe correction:**

In files touched by Stage 2, remove payload/location/sample-count logs and replace error-object logging with fixed operation codes and booleans. Do not log the request body, telemetry object, coordinates, municipality object, upstream URL/body/status text, exception message, or Supabase error object. Existing user-facing parser errors may remain in browser state/UI, but must not be copied into telemetry or production diagnostics logs.

Do not turn this into a repository-wide logging rewrite. Limit the change to the tracking, resolver, parser emission points being edited, and stats API errors exposed by the new feature.

#### H7. Proposed UI wording overstates detailed coverage

**Relevant code planned for change:**

- `src/components/StatsModal.js`: `StatsModal`, specifically the future detailed-period note and distribution labels

**Concrete failure mode:**

Luna proposes: “Alle registrerte opplastinger er med i totaltallene. Detaljert statistikk er tilgjengelig fra {dato}.” The first sentence is appropriate for the authoritative legacy total, but the second can imply complete detailed coverage after the date. Richer writes are deliberately best effort; a failed richer RPC leaves the legacy count intact and creates a coverage gap.

**Smallest safe correction:**

Use wording that separates the systems, for example:

`Totaltallene bygger på den etablerte tellingen. Detaljfordelingene viser opplastinger der detaljert registrering lyktes, fra {dato}.`

Retain the independent-distribution statement and avoid percentages against the legacy total unless the API can explicitly and honestly calculate successful richer-write coverage. Do not describe the detail as users, visitors, unique uploads, or complete history.

### MEDIUM

#### M1. The telemetry builder should not receive full file metadata

Luna proposes `buildUploadTelemetry(data, fileMeta, parseContext)`. `fileMeta` contains filename, exact size, modified time, MIME type, and format. Even if the builder intends to reduce those values, accepting the whole object makes accidental serialization or logging easier.

Use narrow classifier calls at the source and pass only reduced primitives to the final builder. `classifyExtension` may inspect the filename locally and return only the fixed category; `classifyFileSize` may inspect bytes locally and return only the bucket. The final payload builder should never receive the filename, exact size, modified time, MIME type, or arbitrary parsed attributes.

#### M2. Parser warning codes should use one emission helper, not loosely parallel arrays

Luna is correct that classifying raw warning strings later is unsafe. Producing a fixed code alongside the existing display warning is the right location, but two independently pushed arrays can drift.

Use one parser-local `recordWarning(code, message)` helper that both preserves the existing UI string and updates a minimal safe summary: total warning count plus a set/count of fixed classes. The telemetry classifier needs only that summary, not one code per warning. This is simpler and reduces the chance that a new raw warning lacks a corresponding code.

#### M3. App version should be write-only/operational initially and need not be an environment variable

The database contract requires `app_version`, but the public product value is weak and potentially correlating. Do not query or expose it through `/api/stats` initially. A fixed server-side build/package token matching the database regex is sufficient. `RICHER_TELEMETRY_APP_VERSION` is optional complexity unless release operations genuinely need to override it without a code build.

#### M4. The same tracking endpoint and 1,024-byte cap remain appropriate

Embedding the bounded telemetry object in `POST /api/track` is still the minimum-change design. It avoids a second anonymous endpoint, duplicate municipality lookup, and ordering/retry complexity. Keep the 1,024-byte cap if the longest valid fixed payload fits with margin. Test byte length using the longest allowed values.

Do not raise the cap for convenience. Treat body-read/JSON failures as core request failures, while treating only post-parse optional telemetry validation as non-fatal per B1.

#### M5. The JavaScript RPC adapter cannot express a SQL literal cast; rely on exact named arguments and runtime proof

The Stage 1 function’s schema-version parameter is `smallint`. In manual SQL, an uncast integer literal failed function lookup. Supabase JavaScript `.rpc()` sends named JSON arguments, not SQL text, so an application value cannot be written as `1::smallint`.

The production Stage 1 Data API invalid-contract test already demonstrated that a JSON numeric schema version reached this exact RPC. The adapter should therefore pass numeric integer `1` under the exact key `p_telemetry_schema_version`, send all 18 exact named parameters, and ensure no competing overload exists. Unit-test the argument object and repeat one non-production Data API integration test before activation. Do not send the schema version as an arbitrary string and do not construct SQL text in the application.

#### M6. No automatic retry or idempotency mechanism should be added

The current tracking request has no event ID and no idempotency key. If a response is lost after the legacy RPC succeeds, a retry can double count. Adding an upload UUID or per-upload row is prohibited. Keep the browser call once-only and best effort, and do not add automatic retries around either RPC. This limitation should be accepted explicitly.

#### M7. Tracking response data can be reduced

The current handler returns a location object that the browser only logs. The richer client does not need resolver diagnostics or `telemetryStored` to complete the upload. Prefer a minimal fixed response such as current legacy `stored` plus a general success flag, or retain the current shape only for compatibility while removing client logging. Do not return coordinates, resolver URLs, upstream details, or the submitted telemetry object.

#### M8. UTC activation-date semantics must be explicit

The Stage 1 RPC derives a UTC date. `DETAILED_STATS_START_DATE` should therefore be the reviewed UTC calendar date on which production writes are enabled. Activation near UTC midnight can otherwise produce confusing date boundaries. Record the date deliberately; do not infer it from Oslo local time or the first row.

#### M9. Existing Vercel Analytics is an unresolved privacy dependency, not a Stage 2 telemetry implementation detail

`src/app/layout.js` includes `@vercel/analytics/react`. Repository inspection alone does not establish what request metadata the deployed service processes or retains. Luna did not mention it.

If the hard prohibition on IP/user-agent telemetry applies application-wide rather than specifically to richer upload telemetry, the release owner must separately verify the analytics configuration/privacy behavior before making an application-wide privacy claim. Do not change Vercel or remove analytics in this Stage 2 implementation without a separate decision.

### LOW

#### L1. `html lang="no"` is a safe early accessibility fix

The app is Norwegian and `src/app/layout.js` currently declares English. This can move to Slice 1 with no telemetry dependency.

#### L2. Existing source badges are implementation details

`StatsModal` exposes `Supabase` versus `Lokal fil`. After the silent fallback behavior is corrected, the public UI does not need this implementation badge. Removing it is low risk and avoids suggesting source equivalence.

#### L3. Municipality map performance work can wait

The live centroid fan-out and cache behavior in `/api/stats` are real concerns, but they do not need to block the detailed shell or independent detailed distributions. Do not expand Stage 2 into a map-data rewrite.

#### L4. Public app-version charts should be omitted, not merely hidden by default

No current user question requires them. Leaving the operational metric unqueried is simpler than building a hidden UI path.

## 3. Privacy/trust-boundary assessment

The correct trust boundary is:

### Browser-derived and untrusted

The browser may derive and send only these fixed categories:

- file format;
- extension category;
- file-size bucket;
- object-count bucket;
- coordinate-count bucket;
- object mix;
- CRS status;
- EPSG category;
- coordinate status;
- XY quality;
- Z quality;
- parser-warning bucket; and
- parser-warning class.

The browser has the only access to file contents and exact counts, so the server cannot independently prove these categories are truthful. They must never control authorization or application behavior. Exact facts remain in browser memory and are reduced before the final payload builder.

The existing `datasetCoord` remains a separate transient legacy input. It may contain coordinates solely for the current municipality resolver. It must not be copied into richer telemetry, the new RPC, logs, the stats response, or storage. Stage 2 should omit `sampleCount` from new-client serialization and logging; the server may temporarily accept it for stale-client compatibility.

### Server-derived

The server must derive:

- bounded app/build token;
- telemetry schema version `1`;
- municipality location for the legacy writer;
- overall resolution outcome;
- primary result;
- fallback result; and
- feature/configuration enablement state.

The server should not accept browser values for any of these.

### Server independently validates

The server must validate:

- exact request and telemetry keys;
- every category against a fixed allowlist;
- primitive/container types and nullability;
- request byte size;
- supported/ranged transient `datasetCoord` when present;
- cross-field consistency among CRS, EPSG, coordinate status, XY quality, and coordinate presence;
- server app-version format;
- resolver safe output shape and municipality field bounds; and
- feature flags/start-date format before any richer call/read.

Invalid optional telemetry must be reduced to “skip richer write” after core validation; it must not suppress the legacy increment.

### Database remains responsible for

The Stage 1 database must remain responsible for:

- deriving the UTC date;
- revalidating all 18 RPC arguments;
- enforcing fixed table constraints and non-negative counts;
- atomically incrementing fifteen independent metric rows and one municipality-resolution row; and
- applying the production ACL/RLS boundary already validated in Stage 1.

Application validation is defense in depth and error handling; it must not replace database validation.

The database cannot verify the semantic truth of browser-derived buckets. It can only enforce their domain and atomic representation.

## 4. Classifier/parser assessment

Luna’s classifier direction is good, but the interface should be narrower.

Recommended classifier shape:

1. Parser/format code produces parsed data plus a minimal safe parse context.
2. Exact filename and size are reduced immediately by dedicated functions.
3. The final builder receives only already-bounded categories and a safe warning summary.
4. Tests assert that the final object has exactly thirteen browser fields and that prohibited keys/values cannot appear.

Do not pass `fileMeta`, the parsed header wholesale, arbitrary warning objects, or feature attributes into the final payload builder.

For parser warnings, use one `recordWarning(fixedClass, displayMessage)` emission helper. Preserve display strings for existing browser UI only. Return a safe summary such as:

```text
{
  total: number used only for immediate bucketing,
  classes: fixed class set used only for immediate reduction
}
```

The final telemetry contains only the bucket and one coarse class. The summary should not be persisted or logged. Zustand’s current `partialize` configuration persists only settings, UI, and activity time, so parsed data/warnings are not currently persisted to localStorage; that current boundary should be preserved.

All browser-derived categories remain manipulable. Strict enums protect the database contract and privacy, not statistical authenticity.

## 5. CRS assessment

The current code has a real consistency defect: the prompt checks only `COSYS_EPSG`, while `getDatasetCoordinate` also checks `COSYSVER_EPSG` and `SRID`. The plan is right to centralize extraction.

The robust minimal model is:

| Source condition | `crs_status` | `epsg_category` | Coordinate handling |
|---|---|---|---|
| Explicit supported EPSG or explicit format CRS code | `declared` | corresponding fixed EPSG | eligible for legacy resolver |
| Supported coordinate-value heuristic | `inferred` | corresponding fixed EPSG | eligible for legacy resolver |
| User selects supported CRS after source gap | `assumed` | selected fixed EPSG | eligible for legacy resolver |
| No CRS and no operational replacement | `missing` | `missing` | `datasetCoord=null`, `coordinate_status=crs_missing` |
| Present but unparsable and no replacement | `invalid` | `missing` | `datasetCoord=null`, `coordinate_status=crs_invalid` |
| Parsed numeric CRS outside supported set | `unsupported` | `other` | `datasetCoord=null`, `coordinate_status=crs_unsupported` |

For current FileUpload behavior, user selection replaces a source-missing/invalid operational status with `assumed`. The Stage 1 schema cannot also retain the original defect, so the plan must not claim it records both.

KOF `KOORDSYS 22/23` and explicit projection text are declarations in the source format; the coordinate heuristic alone is inference. SOSI GeoJSON CRS and GMI explicit EPSG fields are declarations when strictly parsed.

`coordinate_status=invalid_or_out_of_range` should be used when coordinate data exists but no valid/ranged transient resolver coordinate can be produced under a supported CRS. If at least one valid resolver coordinate is available, use `available`; partial invalid geometry belongs in `xy_quality` and warning class rather than changing the overall coordinate status.

The classifier should run before header mutation, but the operational EPSG extractor used by the prompt and dataset-coordinate function should be shared. Do not reparse arbitrary headers in multiple modules.

## 6. Municipality resolver assessment

The minimum safe refactor is a tagged internal result with only:

- a validated legacy location or null; and
- fixed `resolutionOutcome`, `primaryResult`, and `fallbackResult` values.

The resolver must never place coordinates, request URLs, raw response bodies, exact status strings, exception messages, or arbitrary response properties in diagnostics, return values sent to the client, or logs.

The fetch helper should return a tagged fixed result rather than data-or-null. Parsing and validation should occur inside the upstream-specific lookup function, then discard the raw response before returning. Exact numeric status may exist transiently only long enough to map to `http_4xx` or `http_5xx`; it must not be retained or logged.

Recommended deterministic outcome rules:

1. Input cannot be attempted -> fixed input outcome, both results `not_attempted`.
2. Primary validated match -> `resolved_primary`, primary `match`, fallback `not_attempted`.
3. Primary any non-match/failure plus fallback validated match -> `resolved_fallback`; preserve both fixed result classes.
4. Primary `no_match` plus fallback `no_match` -> `no_match`.
5. No match and one or more failures -> apply one documented fixed precedence. A reasonable order is `internal_error`, invalid upstream response, upstream HTTP failure, network failure, timeout, then no-match, but the product owner must approve this because the overall category is lossy.
6. `outside_norway` remains unused until a reliable signal is reviewed.

Primary and fallback marginal counts retain useful detail even though the overall outcome is lossy. The public API must not expose the combined row.

Cache the complete safe result so a cache hit does not invent new diagnostics. Interpret cached results as the same resolution path as their originating lookup, not as an actual new upstream request. If the intended metric is upstream service health rather than resolution behavior, the current Stage 1 enum lacks a cache-hit category and the metric must not be described as request health.

Validate municipality name/number/region types and lengths before sending them to the legacy aggregate. Invalid upstream shape yields null location plus fixed diagnostics, followed by the legacy unknown increment.

## 7. Tracking/RPC failure-isolation assessment

The safest practical order remains:

```text
bounded body + JSON parse
  -> fatal core request validation
  -> non-fatal optional telemetry validation
  -> structured municipality resolution
  -> legacy increment exactly once
  -> optional richer RPC exactly once when enabled and valid
  -> minimal sanitized response
```

This is preferable to a second endpoint because the same resolver result feeds both legacy location and richer diagnostics. A second endpoint would add duplicate lookup, retry, and ordering risks without materially improving privacy.

Edge cases:

- If body/JSON/core validation fails, neither write occurs. This is existing request-policy behavior and is not a richer-RPC failure.
- If optional telemetry validation fails after a valid core parse, legacy still runs and richer is skipped.
- If resolver returns a fixed failure, legacy runs with unknown location and richer may record the fixed diagnostic.
- If the process is terminated during the existing upstream lookup, the legacy increment can still be lost. Stage 2 should not redesign the legacy schema to solve this; keep resolver timeouts bounded and non-throwing.
- If legacy storage returns false, do not report the richer count as a replacement for the authoritative legacy count.
- If legacy succeeds and richer fails, return success, do not retry, and do not roll back or duplicate legacy.
- If response delivery fails after legacy success, do not automatically retry because there is no permitted idempotency identifier.

The Stage 1 RPC call should use the exact function name and all exact named arguments. `p_telemetry_schema_version` must be numeric integer `1`. The Supabase/PostgREST path, not PostgreSQL literal syntax, performs the typed call. Stage 1’s production Data API validation is evidence that numeric JSON reaches the `smallint` parameter. A disposable integration test remains required before activation.

## 8. Configuration/activation assessment

Three server configuration values are justified:

- `RICHER_TELEMETRY_WRITE_ENABLED`: necessary independent kill switch, default false.
- `DETAILED_STATS_READ_ENABLED`: useful separate release/read control, default false.
- `DETAILED_STATS_START_DATE`: necessary strict UTC date, required when detailed writes or reads are enabled for production.

`RICHER_TELEMETRY_APP_VERSION` is not required initially. Use a bounded server-side package/build constant unless release operations identify a concrete override need.

Separate read and write controls are useful because:

- the shell can be visible with both off;
- writes can be disabled during an incident while existing detailed aggregates remain readable; and
- reads can be held until sparse-data thresholds and UI wording are ready.

Flags are not environment isolation. Preview activation requires explicit verification that server Supabase configuration targets the disposable environment. Production activation requires the actual UTC start date and a separate release review. No defaults, branch name, first database row, or migration date may infer activation.

## 9. Stats API/privacy assessment

The following must be fixed before real richer data is exposed in the UI:

1. Full deterministic pagination of the legacy `aggregates` read.
2. No silent local fallback when a configured production Supabase read fails.
3. Stable Norwegian public errors with no raw `error.message`.
4. Independent, period-wide marginal aggregation of richer metrics.
5. No detailed dates, raw rows, resolution combinations, app version, or telemetry schema version in the public response.
6. Minimum-volume/sparse-cell publication rules.
7. Explicit availability state: disabled, insufficient data, available, or temporarily unavailable.

The municipality map fan-out, map cache redesign, and general caching headers can safely wait.

A safe initial detailed response contains fixed one-dimensional arrays only, for example one array for file format and a separate array for file-size bucket. It should not contain a generic list of database rows with `date`, `metric_name`, and `metric_value`. The server may select those columns internally, but it must discard dates and regroup before serialization.

For municipality diagnostics, expose only separate marginals. Never serialize `{fileFormat, resolutionOutcome, primaryResult, fallbackResult, count}` to the public client.

The public response must not imply complete coverage. The legacy total remains complete only to the extent of the existing authoritative tracking path; richer detail covers successful richer writes only.

## 10. UI/visible-milestone assessment

The visible milestone can safely move from Slice 3 to Slice 1.

Move exactly these durable changes into Slice 1:

- change `src/app/layout.js` to `<html lang="no">`;
- update existing summary labels to `Registrerte filopplastinger` and `Kommuner med registrert aktivitet` where appropriate;
- add the privacy note;
- add a reusable `DetailedStatsPanel`/section shell with a fixed `not_active` or absent-data state;
- show `Detaljert statistikk er ikke aktivert ennå.` while no detailed API contract is present;
- include the independent-distribution explanation without charts or numbers; and
- structure the component so Slice 3 later supplies fixed distribution props rather than replacing the shell.

Do not add a richer-table fetch, date placeholder, fake counts, example chart data, or production activation wording in Slice 1. The existing legacy `/api/stats` request can remain unchanged for this shell.

When data is eventually available, use Norwegian wording that distinguishes authoritative total counts from best-effort detail. Do not say users, unique visitors, historical details, or complete detailed coverage. Do not show low-volume detailed cells until the publication threshold is met.

## 11. Debug/logging/privacy-surface assessment

Luna’s debug-route finding is confirmed. The route is a Stage 2 release blocker, not a prerequisite to writing the pure classifier. The smallest safe action is removal or a production/Preview 404 response, handled as a narrow privacy patch.

Tracking logs should be reduced while touched:

- remove EPSG and exact sample-count logging;
- remove the response location log;
- do not log the telemetry payload;
- do not log raw Supabase/PostgREST errors;
- do not log resolver URLs, statuses, bodies, or exceptions; and
- do not return raw stats or parser error strings from server routes.

Raw parser warning strings may continue to support current browser UI in memory. They must not be persisted, sent, or logged by the Stage 2 path. The current Zustand `partialize` excludes parsed data and warnings; preserve that behavior.

The presence of Vercel Analytics should be acknowledged as a separate privacy dependency if the hard rule is application-wide. This review does not inspect or change Vercel.

## 12. Simplifications recommended

1. Keep the existing `/api/track` endpoint. Split core and optional validation instead of creating a second endpoint.
2. Use one warning emission helper and a safe summary, not parallel free-floating arrays or raw-string classification.
3. Use a server-side package/build constant for app version; omit a fourth environment variable initially.
4. Do not build public app-version or schema-version data paths.
5. Aggregate detailed public metrics over the complete detailed period initially; do not build detailed daily charts.
6. Do not redesign the existing municipality map or local storage in the telemetry feature.
7. Do not add retries, event IDs, idempotency storage, or per-upload fallbacks.
8. Do not expose `telemetryStored`, resolver diagnostics, or location unless a current caller requires them.
9. Move the durable disabled UI shell into Slice 1 rather than waiting for stats plumbing.

## 13. Changes required to Luna’s plan before implementation

The candidate plan should be treated as amended by these requirements:

1. Optional telemetry validation is non-fatal after valid core parsing; invalid optional telemetry skips richer only.
2. The final telemetry builder receives only reduced categories, not `fileMeta` or arbitrary parsed objects.
3. CRS semantics follow the explicit table in section 5, including KOF declaration versus heuristic inference and user-assumption precedence.
4. Parser warning classification uses one emission helper and safe summary.
5. Resolver outcome precedence and cache semantics are fully specified before Slice 2 code.
6. No public detailed dates, raw rows, municipality combinations, app version, or schema version.
7. A minimum-publication/sparse-cell rule is approved before Slice 3 returns data.
8. Production-configured stats failures do not fall back silently to local data.
9. Preview target isolation is verified independently of feature flags.
10. Touched tracking/parser/stats logging is sanitized.
11. The UI states that detail covers successful richer registrations and does not imply complete post-date coverage.
12. The debug route is removed/protected before Stage 2 release.
13. The visible disabled shell and `lang="no"` move into Slice 1.

## 14. Things Luna got right and should not be changed

- Preserve the four-slice overall shape.
- Keep Stage 2 additive and leave Stage 1 SQL unchanged.
- Keep `public.aggregates` and `increment_aggregate` authoritative.
- Keep richer writes disabled by default.
- Place richer RPC after the legacy increment.
- Use fixed browser categories and server-generated resolver/schema/app values.
- Keep date derivation and atomic two-table increments in the database.
- Keep no historical backfill and use the actual activation date.
- Keep Preview synthetic writes away from production.
- Keep all front-facing UI Norwegian.
- Keep parser errors out of successful-upload telemetry.
- Keep exact values and raw parser data in the browser only.
- Keep WMS and unrelated analysis systems out of scope.
- Keep tests for all category boundaries, parser formats, resolver failures, request size, failure isolation, zero-data states, and activation behavior.

## 15. Recommended final implementation sequence

### Slice 1 — bounded contract plus early visible shell

- Freeze the exact category/CRS semantics.
- Add narrow pure classifiers that emit only fixed values.
- Add parser warning emission helper and safe summary.
- Add synthetic GMI/SOSI/KOF classifier/parser tests.
- Add reusable Norwegian detailed-statistics inactive shell, privacy/explanation text, corrected labels, and `html lang="no"`.
- No API change, Supabase call, richer query, fake data, or flag activation.

### Slice 2 — core-safe tracking and optional richer write

- Split fatal core validation from non-fatal optional telemetry validation.
- Implement the complete resolver outcome/precedence/cache table.
- Validate safe legacy location shape.
- Call legacy once, then richer once when valid/enabled.
- Pass exact 18 named RPC parameters and numeric schema version `1`.
- Sanitize touched logs and minimize the response.
- Keep the write flag off.
- Land the debug-route privacy patch before any Stage 2 release.

### Slice 3 — authoritative stats fixes and privacy-safe detailed marginals

- Paginate legacy reads deterministically.
- Remove silent configured-production fallback and raw public errors.
- Add read flag/start-date validation.
- Query richer rows server-side, aggregate across the full detailed period, suppress low-volume cells, and return one-dimensional marginals only.
- Exclude dates, app version, schema version, and resolution combinations.
- Wire real/empty/insufficient/unavailable states into the Slice 1 shell with honest Norwegian coverage wording.

### Slice 4 — Preview and release readiness

- Verify Preview database isolation before any synthetic write.
- Run the full test matrix with flags off and against a disposable environment when separately authorized.
- Confirm no prohibited values in request payloads, responses, logs, or rows.
- Verify legacy count once and richer failure isolation.
- Record the actual UTC production activation date only in a separate release workflow.
- Do not enable production from the implementation branch by default.

## 16. GO / GO WITH CHANGES / NO-GO verdict for starting Slice 1

**GO WITH CHANGES.**

Slice 1 may begin because it is local, additive, testable, and does not need a server write or external system. Before code is written, incorporate the corrected CRS mapping, narrow builder inputs, and warning-summary helper. Include the durable Norwegian inactive UI shell and `lang="no"` so the first Preview-visible milestone arrives in Slice 1.

Do not begin Slice 2 until B1 and the complete resolver mapping are accepted. Do not expose real detailed data in Slice 3 until B2 is resolved. Do not merge/deploy Stage 2 while B3 remains present.
