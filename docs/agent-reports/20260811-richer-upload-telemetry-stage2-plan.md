# Stage 2 richer upload telemetry application audit and implementation plan

**Audit date:** 2026-08-11  
**Branch audited:** `feature/richer-upload-telemetry-app`  
**Audited HEAD:** `5439c2c2f97200a9af9f03afb69251c9f1be88f0`  
**Scope:** repository audit and implementation plan only  
**Recommended implementation slices:** 4

## 1. Executive summary

The application already has a clear additive integration point: a successful browser parse finishes in `useFileLoader` in `src/components/FileUpload.js`, then sends a best-effort `POST /api/track`. The server route currently resolves a municipality and increments the authoritative legacy `public.aggregates` counter. The Stage 2 change should extend this request and handler without replacing that path.

The safest implementation is four small slices:

1. Add pure, fixed-domain telemetry classifiers and parser-produced diagnostic codes. Keep all exact values and raw parser text in browser memory only.
2. Add structured municipality diagnostics and server-side request/RPC integration. Execute the legacy increment independently and keep the richer RPC optional, failure-isolated, and disabled by default.
3. Add safe detailed aggregate reads and Norwegian statistics panels behind read/write flags. Preview can show the new empty state or use a disposable non-production database; it must not write test telemetry to production.
4. Run Preview and activation readiness verification, then perform production enablement as a separately reviewed release decision. This slice is not authorization to activate production now.

The earliest meaningful visible Preview change is Slice 3 with richer reads disabled by default: the existing historical dashboard remains intact, while a Norwegian detailed-statistics section explains that detailed statistics are not activated or have no data yet. With a disposable Preview database and synthetic fixtures, the same section can render real bounded distributions. This produces a useful UI change without fabricating historical detail or touching production.

Stage 1 is treated as complete and passed. The production rollout report was read without switching branches; it confirms that the two new tables and the exact RPC exist, are empty, and are service-role-only, while the richer application write remains disabled. No Supabase, Vercel, production, application, SQL, commit, push, merge, or deployment action is part of this audit.

## 2. Current application architecture relevant to Stage 2

The app is client-first:

- File bytes are read in the browser by `FileReader`.
- GMI, SOSI, and KOF parsing happens in `src/lib/parsing/`.
- Parsed data is normalized into `points` and `lines` with coordinate arrays and attributes.
- Validation and analyses run in the browser and are stored in the Zustand store in `src/lib/store.js`.
- The server API surface relevant here is `POST /api/track` and `GET /api/stats`.
- Supabase access is server-side through the service-role client in `src/lib/tracking/supabase.js`.
- The public statistics interface is the always-available button in `src/app/page.js`, which opens `src/components/StatsModal.js`; the map is lazy-loaded from `src/components/stats/StatsMap.js`.

There is no migration framework, generated database client, telemetry service, parser test harness, resolver test harness, or stats API test harness. The existing package scripts also do not define a test command; the repository currently has three Node test files under `tests/`.

The Stage 1 database contract is additive and fixed-domain:

- `public.upload_metric_daily` stores independent daily `(metric_name, metric_value, count)` counters.
- `public.municipality_resolution_daily` stores independent daily resolution-diagnostic counters.
- `public.increment_upload_diagnostics(...)` transactionally increments fifteen metric rows and one resolution row.
- No table is a per-upload fact row, and no row links all dimensions together.
- The database derives the UTC date and validates the allowlists again.

The unchanged `public.aggregates`, existing `increment_aggregate(...)` calls, and existing public historical totals remain authoritative.

## 3. Exact current upload, tracking, and statistics flow

### 3.1 File upload and format detection

The main entry point is `useFileLoader` in `src/components/FileUpload.js`. `src/components/GlobalFileDrop.js` and the regular file input both call its `handleFile` function.

Current sequence:

1. The browser stores file metadata including name, size, modified time, MIME type, and detected format in the Zustand store. These values are used by the application UI but must not enter richer telemetry.
2. GMI, KOF, and ordinary text are read as ISO-8859-1 text. SOSI and `.sos`/`.sosi` input preferentially use an `ArrayBuffer` so `sosijs` can detect the source character set.
3. `detectFormat(fileName, content)` first uses the extension: `gmi` -> `GMI`, `sos`/`sosi` -> `SOSI`, and `kof` -> `KOF`. Otherwise it sniffs the first 2,000 decoded characters for the GMI signature or SOSI header markers. Unknown input defaults to GMI and must pass GMI validation to succeed.
4. The chosen parser returns a shared object containing `format`, `header`, `points`, `lines`, `warnings`, and `errors`.
5. Any parser errors fail the upload. An upload with no point and no line objects also fails.
6. If `header.COSYS_EPSG` is not finite, the browser prompts the user to choose EPSG:25832 or EPSG:25833 and writes that choice back into the parsed header.
7. The parsed data is added as a layer, written to the legacy store fields, and marked as parsed successfully.
8. `getDatasetCoordinate(parsedData)` derives the existing transient dataset coordinate used by legacy municipality tracking.
9. `trackUploadSuccess(datasetCoord)` sends `POST /api/track` without awaiting it. Failures are logged and do not block parsing or display.

The current upload flow therefore has an important privacy boundary: exact parsed data stays in the browser, while the existing legacy tracking path receives a transient sampled coordinate for municipality resolution. Stage 2 must not add exact coordinates, file contents, filenames, attributes, IDs, raw warnings, or exact counts to the richer telemetry payload, storage, logs, API response, or stats UI. The existing coordinate path should not be duplicated or included in the new RPC payload.

### 3.2 GMI parsing

`src/lib/parsing/gmiParser.js` implements `GMIParser`.

- `_validateContent` requires the `[GMIFILE_ASCII]` signature and at least one `[L_]` or `[P_]` definition section.
- Header lines are parsed into an arbitrary header object. `COSYS_EPSG` and `COSYSVER_EPSG` are normalized to numbers when possible.
- `[+L_]` sections create line features; `[+P_]` sections create point features.
- `/XYZ` rows become `{x, y, z}` objects. Invalid coordinate lines produce raw warning strings containing the source line number and content.
- `_FIELDVALUES` is mapped to arbitrary field names and values. A field-value/field-name length mismatch produces a raw warning.
- GMI warnings are currently untyped strings. Parse exceptions add an error object containing a message and stack and also add a raw warning. `FileUpload` rejects any non-empty errors array before tracking.
- GMI features preserve arbitrary attributes, extents, GUIDs, and source-derived values in browser state. None may cross the tracking boundary.

Safe Stage 2 output should add fixed internal warning codes alongside the existing user-facing warning strings, or provide a pure classifier over a parser-owned code list. It must never classify by transmitting or persisting the warning text.

### 3.3 SOSI parsing

`src/lib/parsing/sosiParser.js` implements `SOSIParser` using `sosijs`.

- It passes source bytes where available, then dumps to GeoJSON.
- CRS is read from `geojson.crs.properties.name`; an `EPSG:<number>` token becomes `header.COSYS_EPSG`, and the original SRID text is retained in browser state.
- GeoJSON `Point` features become points, `LineString` features become lines, and polygon outer rings are represented as lines.
- `normalizeFeature` converts coordinate arrays to the shared `{x, y, z}` representation.
- SOSI properties are arbitrary and are copied into attributes. They are not safe telemetry input.
- Current SOSI parsing errors are raw error strings and are rejected by `FileUpload`; the warnings array is normally empty.

The classifier can derive format, object mix, bounded object/coordinate counts, CRS categories, XY quality, and Z quality from the normalized result. It must not inspect or transmit arbitrary properties.

### 3.4 KOF parsing

`src/lib/parsing/kofParser.js` implements `KOFParser` as a tolerant text parser.

- Header lines beginning with `00` are parsed into an arbitrary header object.
- `KOORDSYS 22` maps to EPSG:25832 and `KOORDSYS 23` maps to EPSG:25833.
- Projection text containing `UTM 32` or `UTM 33` is also used to infer an EPSG.
- If no CRS is found and the first coordinate matches the heuristic, EPSG:25832 is inferred and a raw Norwegian warning is emitted.
- `09 91`/`09 99`, `08`, and `12` records create line context and attributes. `05` records create point features and may add vertices to an active line.
- KOF warning strings include line IDs and coordinate counts. KOF point attributes also retain a raw source line in `raw`.
- `normalizeFeature` drops invalid XY coordinates and converts absent/invalid Z to `0` for normalized inputs.

Stage 2 must add an explicit CRS provenance result before any FileUpload prompt mutation. KOF heuristic inference is `inferred`; a user choice is `assumed`; a supported explicit source declaration is `declared`. The raw source line and warning strings remain UI/browser concerns only.

### 3.5 CRS extraction and mutation gap

There are currently two partially overlapping CRS implementations:

- `FileUpload.js` checks only `header.COSYS_EPSG` before prompting.
- `src/lib/tracking/datasetCoordinate.js` checks `COSYS_EPSG`, then `COSYSVER_EPSG`, then an EPSG token in `SRID`.
- GMI normalizes `COSYS_EPSG` and `COSYSVER_EPSG`.
- SOSI extracts EPSG from GeoJSON CRS.
- KOF maps headers/projection text and sometimes infers EPSG from coordinate ranges.

This can lose provenance: a missing CRS becomes a user-selected EPSG in the header, and the later tracker cannot distinguish an original declaration from an assumption. Slice A should introduce one pure CRS classifier that runs before the prompt and returns an internal immutable record such as `status`, `epsgCategory`, `epsg`, and `coordinateEligibility`. Only the fixed `status` and `epsgCategory` leave the browser. The numeric EPSG may remain in memory for the existing legacy resolver, but is never included in the richer RPC payload or public statistics.

### 3.6 Geometry, object, coordinate, and Z information

Current deterministic sources are:

- Object count: `parsedData.points.length + parsedData.lines.length`.
- Object mix: the presence of non-empty points and/or lines arrays.
- Coordinate count: the sum of every normalized feature `coordinates.length` across points and lines.
- XY quality: normalized coordinates require finite X and Y, but features can still have an empty coordinate array after invalid coordinates are dropped.
- Z quality: `src/lib/analysis/zValidation.js` examines all point and line vertices and treats null, undefined, non-finite, and numeric zero as missing/invalid Z.
- GMI validation: `src/lib/validation/validator.js` reports exact object/error counts for UI validation, but it is not currently called by the upload-tracking path and its arbitrary field messages are not telemetry.

Do not send exact counts. Compute and immediately reduce to the Stage 1 buckets. The classifier must define how zero-coordinate successful objects are handled, because an upload can have objects but no usable coordinate. `not_applicable` is appropriate for Z only when there are no coordinates; the existing SQL has no `not_applicable` value for XY quality.

### 3.7 Parser warnings

The parser warning arrays are raw and inconsistent:

- GMI emits coordinate and field-shape warnings, plus generic parse warnings.
- KOF emits geometry warnings for short lines and CRS warnings for heuristic inference.
- SOSI generally has no warnings but can produce errors.

Add fixed warning codes at parser production points, for example `coordinate`, `geometry`, `field_shape`, and `crs`. Keep existing raw warning strings only for existing browser UI behavior. The classifier sends only:

- a count bucket: `0`, `1`, `2_to_5`, or `gte_6`; and
- one class: `none`, `coordinate`, `geometry`, `field_shape`, `crs`, `multiple`, or `other`.

If multiple fixed classes occur, send `multiple`; do not choose a class based on arbitrary text. Parser errors are not success telemetry and must never be sent as a warning class.

### 3.8 Municipality resolution

`src/lib/tracking/kommuneLookup.js` currently performs:

1. Input finite-value and supported-EPSG checks.
2. A warm-instance cache keyed by EPSG and coordinates rounded to two decimals.
3. Primary Geonorge address lookup with a 2.5-second timeout.
4. Fallback Geonorge kommuneinfo lookup with another 2.5-second timeout.
5. A location result or `null`.

`fetchJsonWithTimeout` currently collapses timeout, network error, non-2xx response, invalid JSON, and thrown errors to `null`. `buildResult` also turns missing fields into `null`. The caller therefore cannot distinguish no match from infrastructure failure.

The route in `src/app/api/track/route.js` injects this resolver into `createTrackingPostHandler` from `src/lib/tracking/trackingHandler.mjs`. The handler currently awaits lookup and then calls `incrementAggregate`. If lookup throws, the legacy increment is skipped and the route returns a generic 500. Slice B should make resolver failure a fixed diagnostic result and preserve the legacy increment with an unknown location wherever the request is otherwise valid.

### 3.9 `/api/track`, request policy, and Supabase calls

`src/lib/tracking/trackingRequestPolicy.mjs` and `trackingHandler.mjs` enforce:

- 1,024 UTF-8 byte maximum;
- exact JSON media type;
- strict top-level key allowlist;
- only `upload_success` event type;
- optional dataset coordinate with finite numeric values;
- supported EPSG values 25832, 25833, and 4326;
- bounded coordinate ranges and optional sample count 1..200;
- same-origin checks when browser headers are supplied; and
- stable sanitized policy errors.

`src/lib/tracking/supabase.js` creates one server-side Supabase client from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. `src/lib/tracking/aggregates.js` constructs the UTC date/hour legacy payload, calls the nine-parameter `increment_aggregate` RPC when configured, and falls back to a local JSON file if Supabase is unavailable or the RPC returns false.

The existing caller is already fire-and-forget, so the browser does not wait for the tracking response. The Stage 2 server handler should preserve that behavior and return stable status data only; it must not return resolver URLs, response bodies, status text, exceptions, coordinates, or telemetry payloads.

The current `POST /api/track` request has an optional `datasetCoord` containing the legacy transient coordinate. The new richer `telemetry` object should contain only fixed categories. It must not contain `sampleCount` or any other exact upload fact; cached/older clients can remain compatible with the existing optional field until a separately reviewed tightening removes it. New Stage 2 clients should omit it from the outgoing payload because the server discards it before lookup.

### 3.10 `/api/stats` and public UI

`src/app/api/stats/route.js` currently:

- reads `aggregates` through the service-role client when configured;
- requests all `upload_success` rows in one query with no pagination;
- falls back to `data/usage/aggregates.json` if Supabase is absent or the read fails;
- normalizes snake_case Supabase rows or camelCase file rows;
- derives summary, daily, hourly, municipality, heatmap, and timeline aggregates;
- performs a Geonorge municipality-centroid fan-out for the map; and
- returns raw `error.message` on its outer 500 path.

The unpaginated Supabase query is an existing correctness risk as the legacy table grows. It should be fixed in Slice C before or alongside richer reads, using deterministic ordering and bounded page ranges. A silent fallback to a small local file must not make production totals look complete.

`src/components/StatsModal.js` fetches `/api/stats` every time it opens and already has loading, error, and empty states. Existing sections are Norwegian and cover total uploads, municipality activity, daily activity, UTC hourly activity, a heatmap, and a map. The map component uses municipality reference coordinates returned by the server; it is not a source for detailed telemetry.

`src/app/layout.js` currently declares `<html lang="en">` although the user-facing interface is primarily Norwegian. This is a small accessibility/UI correction suitable for the visible UI slice, together with any new Norwegian wording.

## 4. Gap analysis against the Stage 1 RPC contract

The following table identifies the current source, safe derivation, and implementation gap for every RPC input.

| RPC input | Safe current source | Current gap and planned boundary |
|---|---|---|
| `file_format` | `parsedData.format` from the selected parser | Lowercase and validate only `gmi`, `sosi`, `kof`. Never use an arbitrary extension or MIME value. Server revalidates. |
| `extension_category` | The extension branch in `detectFormat` | Reduce only to `gmi`, `sos`, `sosi`, `kof`, `txt`, `other`, or `none`. Do not send the extension string or filename. Server revalidates. |
| `file_size_bucket` | `file.size` in browser memory | Add a pure byte-bucket classifier: `lt_100_kib`, `100_kib_to_lt_1_mib`, `1_mib_to_lt_10_mib`, `10_mib_to_lt_50_mib`, `gte_50_mib`. Never send exact size. |
| `object_count_bucket` | Point plus line array lengths | Add `1`, `2_to_10`, `11_to_100`, `101_to_1000`, `1001_to_10000`, `gte_10001`. Never send exact object count. |
| `coordinate_count_bucket` | Sum of normalized coordinate-array lengths | Add `0`, `1_to_10`, `11_to_100`, `101_to_1000`, `1001_to_10000`, `10001_to_100000`, `gte_100001`. Never send exact coordinate count. |
| `object_mix` | Presence of point and line objects | Add `points_only`, `lines_only`, or `points_and_lines`. A successful upload must already contain at least one object. |
| `crs_status` | Central classifier over parser header plus pre-prompt state | Preserve `declared`, `inferred`, `assumed`, `missing`, `invalid`, or `unsupported` before FileUpload mutates missing CRS. |
| `epsg_category` | Central CRS classifier | Map only to `epsg_25832`, `epsg_25833`, `epsg_4326`, `other`, or `missing`. Unsupported numeric EPSG is `other`; invalid/missing source is `missing` unless a fixed rule says it is `other`. Never send the number. |
| `coordinate_status` | Normalized XY quality plus CRS eligibility and existing dataset-coordinate derivation | Produce only `available`, `no_valid_xy`, `invalid_or_out_of_range`, `crs_missing`, `crs_invalid`, or `crs_unsupported`. Preserve the existing transient legacy coordinate path only when safe and already available. |
| `xy_quality` | Every feature’s normalized finite-X/Y coordinate presence | Produce `all_objects_have_valid_xy`, `some_objects_missing_valid_xy`, or `no_objects_have_valid_xy`. Never send coordinate values, extents, centroid, or bounding box. |
| `z_quality` | `analyzeZValues` over all normalized coordinates | Produce `all_coordinates_have_nonzero_z`, `some_coordinates_missing_or_zero_z`, `all_coordinates_missing_or_zero_z`, or `not_applicable`. Do not send exact Z counts. |
| `parser_warning_bucket` | Fixed parser warning-code list | Produce `0`, `1`, `2_to_5`, or `gte_6`. Never inspect or send raw warning text at the boundary. |
| `parser_warning_class` | Fixed warning-code categories | Produce `none`, `coordinate`, `geometry`, `field_shape`, `crs`, `multiple`, or `other`. Never send warning strings, line IDs, source lines, or parser exceptions. |
| `app_version` | Server-only release configuration or bounded package version | Generate on the server, validate against `[A-Za-z0-9._-]{1,32}`, and never accept it from the browser. Do not expose it in the public stats response unless a later concrete need is approved. |
| `telemetry_schema_version` | Server constant | Generate exactly `1::smallint` server-side. It must not be browser-controlled. |
| `resolution_outcome` | Structured server-side resolver result | Generate only from fixed resolver outcomes. Never accept from the browser. |
| `primary_result` | Structured server-side primary lookup result | Generate only from `not_attempted`, `match`, `no_match`, `timeout`, `network_error`, `http_4xx`, `http_5xx`, `invalid_json`, `invalid_shape`, or `internal_error`. |
| `fallback_result` | Structured server-side fallback lookup result | Same fixed result set; use `not_attempted` when primary match or an earlier condition means fallback was not called. |

The Stage 1 SQL allowlists are the final authority. The browser policy, server request validator, classifier tests, and database RPC all need to agree, but the database must remain the last validation boundary.

## 5. Privacy and security analysis

### 5.1 Required data boundary

The richer payload must contain only fixed allowlisted category values. It must not contain:

- filenames, extensions beyond the fixed extension category, MIME types, or file contents;
- exact file size, object count, coordinate count, coordinates, bounding boxes, or geometry values;
- parser attributes, GUIDs, feature IDs, raw source lines, arbitrary field values, or raw parser warnings;
- IP address, user agent, raw request headers, request IDs, event IDs, or upload-linking identifiers;
- upstream URLs, response bodies, exact status strings, exception messages, or raw error text; or
- a combined per-upload object that correlates file format, size, object count, CRS, municipality, and release version.

Independent counters are important: the application may increment one metric row for each category, but it must never create a record that can answer which size, CRS, object count, and municipality belonged to the same upload.

### 5.2 Existing sensitive surfaces to preserve or contain

The existing legacy tracking path transiently sends a sampled coordinate so the server can perform the current municipality lookup. Stage 2 must not add a second coordinate path, include that coordinate in the richer payload, store it in either new table, log it, or return it from the tracking response. Removing or redesigning this existing legacy coordinate dependency is a separate privacy architecture decision and must not be improvised as part of telemetry wiring.

`src/components/FileUpload.js` currently logs tracking status, EPSG, sample count, and the returned location object. New code must not log telemetry payloads, exact values, resolver diagnostics, or raw errors. The log statements should be reduced to fixed operation/status codes or removed before activation. New server logs should contain only fixed operation names and booleans such as legacy-write success and richer-write success.

`src/app/api/track/debug/route.js` currently returns `request.geo` and selected Vercel/Cloudflare headers, including latitude/longitude header values when present. It is not part of normal upload tracking, but it conflicts with the stated privacy posture. Before a public Preview/release sign-off, it should be removed or protected for local development only in a separate narrowly reviewed privacy patch. No Stage 2 telemetry code should depend on it.

`src/app/api/track/health/route.js` can perform a synthetic legacy write when separately authorized. It must not be changed to write richer telemetry, and its public error responses should not be reused as a model for exposing raw infrastructure details.

`src/app/api/stats/route.js` currently returns raw outer error messages. Slice C should replace that public response with a stable Norwegian error and keep raw details out of the response and new telemetry logs.

### 5.3 Server trust model

Browser categories are descriptive, not authorization data. The server must:

- require an exact telemetry object shape with no unknown keys;
- reject arrays, nulls, numeric strings, unknown categories, and missing required values;
- enforce a request byte limit after adding the bounded telemetry object;
- enforce cross-field rules such as CRS/coordinate consistency;
- generate schema version, release token, and resolver categories itself;
- call the exact Stage 1 RPC signature with explicit `smallint` handling; and
- catch richer RPC failures without changing the successful upload result.

The new RPC uses `SECURITY INVOKER`; the server service role must retain the Stage 1 table and execute privileges. No application change should grant public client access or alter Supabase ACLs.

## 6. Proposed telemetry classification architecture

### 6.1 New pure modules

Add a small browser-safe contract module, likely under `src/lib/telemetry/`, with:

- frozen metric names and value arrays matching the SQL;
- `classifyFileFormat(format)`;
- `classifyExtension(fileName)` returning only the fixed extension category and never returning the filename;
- `classifyFileSize(bytes)`;
- `classifyObjectCount(count)`;
- `classifyCoordinateCount(count)`;
- `classifyObjectMix(points, lines)`;
- `classifyCrs({ header, sourceFormat, userChoice })`;
- `classifyEpsgCategory(epsg)`;
- `classifyCoordinateStatus({ crs, xyQuality, datasetCoordinate })`;
- `classifyXyQuality(data)`;
- `classifyZQuality(data)`;
- `classifyParserWarnings(fixedWarningCodes)`; and
- `buildUploadTelemetry(data, fileMeta, parseContext)` returning only the 13 browser-derived fields.

All functions must be deterministic, side-effect-free, and return `null`/a fixed invalid result rather than leaking an arbitrary value. The module must be importable in Node tests without Next.js, Supabase, browser globals, or environment variables.

### 6.2 Fixed parser diagnostic codes

Do not replace existing user-facing warning strings in this slice. Add a parallel fixed code collection to parser output or an equivalent parser-owned diagnostic result:

- GMI invalid coordinate -> `coordinate`;
- GMI field-value mismatch -> `field_shape`;
- KOF short line -> `geometry`;
- KOF CRS heuristic -> `crs`;
- any safe known parser warning not covered above -> `other`.

The classifier consumes codes only. It never receives raw warning text. Existing parser errors remain upload failures and are not converted to success telemetry.

### 6.3 CRS and coordinate rules

Use one explicit pre-prompt parse context:

1. Read direct supported declarations from the format-specific header.
2. Record `missing`, `invalid`, or `unsupported` before any user choice.
3. Record KOF and other deterministic derivation as `inferred`.
4. If the user selects UTM 32/33 for missing CRS, retain `assumed` separately from the selected operational EPSG.
5. Use the selected/derived EPSG only for the existing legacy resolver path.
6. Send only CRS status, EPSG category, coordinate status, and XY quality to the richer endpoint.

Cross-field validation should reject contradictory combinations. Examples:

- `crs_missing`, `crs_invalid`, or `crs_unsupported` requires no richer coordinate lookup value and the corresponding coordinate status.
- A finite supported CRS with no valid XY must be `no_valid_xy` or `invalid_or_out_of_range`, not `available`.
- `available` requires a supported operational EPSG and a valid finite coordinate result for the existing legacy path.
- Unsupported numeric EPSG maps to `epsg_category=other`, `crs_status=unsupported`, and `coordinate_status=crs_unsupported`.

The server rechecks these rules. It must not trust a browser-supplied resolution result or app version.

### 6.4 App version and schema version

Use a server-only bounded value such as `RICHER_TELEMETRY_APP_VERSION`, validated at request time. A reviewed fallback to the repository package version is acceptable if it is always bounded and server-generated. Do not use `NEXT_PUBLIC_` for this value and do not allow browser input to override it.

Use `telemetry_schema_version=1` as a server constant. The Supabase call should pass an explicit `1` value with the client/library binding that resolves to the `smallint` RPC parameter; tests must cover the exact argument type/shape to avoid the production validation failure where an uncast integer literal selected no function signature.

## 7. Municipality resolver refactor plan

Refactor `src/lib/tracking/kommuneLookup.js` with minimum behavior change:

### 7.1 Internal result shape

Return a bounded internal result such as:

```text
{
  location: existing safe legacy location or null,
  diagnostics: {
    resolutionOutcome: fixed enum,
    primaryResult: fixed enum,
    fallbackResult: fixed enum
  }
}
```

Do not include coordinates, URLs, response bodies, status text, exception messages, municipality response objects, or arbitrary upstream keys in the returned diagnostic structure. The existing location object may retain only the fields needed by the legacy aggregate (`country`, `region`, `areaType`, `areaId`, `areaName`, `kommuneNumber`).

### 7.2 Preserve primary/fallback behavior

Keep the address lookup first and kommuneinfo second. For each call, classify only:

- `match` for a validated expected municipality result;
- `no_match` for a valid response with no result;
- `timeout` for an abort timeout;
- `network_error` for fetch/network failure;
- `http_4xx` or `http_5xx` for bounded response classes;
- `invalid_json` for JSON parsing failure;
- `invalid_shape` for a successful response that does not match the expected shape; or
- `internal_error` for a controlled unexpected internal failure.

Use `not_attempted` for fallback when primary succeeds or when the input is in a condition where lookup cannot safely begin. Keep the current cache key and positive-cache behavior initially; do not add exact-coordinate persistence or logging. Cache diagnostics only in memory if needed for the current request; do not use them as durable telemetry outside the new aggregate RPC.

### 7.3 Overall outcome mapping

Use the fixed Stage 1 outcomes:

- `resolved_primary` when primary matches;
- `resolved_fallback` when primary does not match and fallback matches;
- `no_coordinate` when no usable XY exists;
- `crs_missing`, `crs_invalid`, or `crs_unsupported` for those client-derived conditions;
- `coordinate_invalid` for finite-value/range failure before lookup;
- `outside_norway` only if a reviewed reliable server-side test supports it; otherwise use `no_match`;
- `no_match` when both lookups validly find nothing;
- `timeout` only when the fixed policy says timeout is the dominant overall result;
- `network_failure` when no-match is attributable to network failures under the fixed mapping;
- `upstream_http_failure` for bounded HTTP failure outcomes;
- `invalid_upstream_response` for invalid JSON/shape; and
- `internal_error` for controlled internal failures.

The precise precedence must be specified and unit-tested. Do not invent false accuracy by converting every unknown result into an outage or outside-Norway result.

### 7.4 Legacy write preservation

The handler should treat resolver diagnostics and legacy location as separate values:

1. Validate the request.
2. Resolve municipality with a non-throwing structured result.
3. Call the existing legacy increment once for every accepted successful upload, using the safe location or the existing unknown fallback.
4. Attempt the richer RPC only if the server feature flag is enabled and the bounded telemetry object is valid.
5. Catch and sanitize richer RPC failures. Return `ok: true` when the legacy operation remains successful, with a non-sensitive `telemetryStored` boolean.

If the legacy increment itself fails, retain the existing fallback behavior and stable response semantics. Do not place the legacy increment inside the new RPC and do not make the legacy count dependent on richer success.

## 8. Tracking/API/RPC integration plan

### 8.1 Request shape

Extend the existing request additively:

```json
{
  "eventType": "upload_success",
  "datasetCoord": null,
  "telemetry": {
    "fileFormat": "gmi",
    "extensionCategory": "gmi",
    "fileSizeBucket": "100_kib_to_lt_1_mib",
    "objectCountBucket": "11_to_100",
    "coordinateCountBucket": "101_to_1000",
    "objectMix": "points_and_lines",
    "crsStatus": "declared",
    "epsgCategory": "epsg_25832",
    "coordinateStatus": "available",
    "xyQuality": "all_objects_have_valid_xy",
    "zQuality": "some_coordinates_missing_or_zero_z",
    "parserWarningBucket": "0",
    "parserWarningClass": "none"
  }
}
```

The values above are structural examples of fixed categories, not production data. The browser must not add `appVersion`, `telemetrySchemaVersion`, `resolutionOutcome`, `primaryResult`, or `fallbackResult`; the server supplies those.

Initially keep `telemetry` optional so an application rollback, old cached client, or legacy-only deployment remains valid. If absent, the handler performs the current legacy path only. Once all supported clients are confirmed compatible, requiredness can be considered separately.

The maximum request size remains bounded. The largest valid request should be measured in tests and kept below the existing 1,024-byte limit with margin. Do not raise the limit merely to accommodate accidental raw values.

### 8.2 Server dependency injection

Extend the dependency-injected handler rather than embedding all behavior in `src/app/api/track/route.js`:

- Keep `lookup` and `increment` compatible with current tests.
- Add an optional `incrementDiagnostics` dependency and a feature-gated call after the legacy increment.
- Keep RPC failure handling inside the handler/service boundary and return only fixed booleans/codes.
- Put the Supabase function call in `src/lib/tracking/supabase.js` with the exact 18-argument mapping and explicit schema-version handling.
- Keep `src/lib/tracking/aggregates.js` focused on the legacy writer. Do not change its table, function name, conflict target, or authoritative status.

Potential new server modules are `src/lib/tracking/richerDiagnostics.js` for request-to-RPC mapping and `src/lib/telemetry/contract.js` for shared allowlists. Avoid duplicating the SQL allowlists in several unrelated files; expose one shared source for application validation and assert it matches the Stage 1 contract in tests.

### 8.3 Failure isolation

The following must all leave a valid successful upload and the legacy aggregate unaffected:

- missing richer feature flag;
- missing richer telemetry object from an old client;
- invalid richer categories rejected before the richer call;
- richer RPC unavailable;
- richer RPC timeout or server error;
- invalid contract error from the RPC; and
- structured resolver diagnostic write failure.

The legacy increment must occur once independently. The new RPC is itself transactional for its two new tables, so a failure cannot leave one new table partially incremented. No local-file fallback should be added for richer telemetry.

## 9. Activation-date and feature-flag plan

Use server-only environment/configuration values:

- `RICHER_TELEMETRY_WRITE_ENABLED`: default `false`.
- `DETAILED_STATS_READ_ENABLED`: default `false` unless a reviewed non-production database is configured.
- `DETAILED_STATS_START_DATE`: strict `YYYY-MM-DD`, required when the relevant detailed feature is enabled, and equal to the actual production richer-write activation date—not the Stage 1 migration date, Preview date, or first observed row.
- `RICHER_TELEMETRY_APP_VERSION`: bounded server release token, or a reviewed server-side package-version fallback.

Do not expose these values through `NEXT_PUBLIC_` variables. Fail closed if the flag is enabled without a valid start date or bounded app version. Keep production write disabled throughout implementation and Preview unless Preview points to a disposable database and uses synthetic fixtures.

`GET /api/stats` should always return the historical legacy data. It may return a small public status object such as:

```text
{
  detailed: {
    enabled: false,
    startDate: null or reviewed configured date,
    hasData: false,
    distributions: {}
  }
}
```

When detailed reads are enabled, every query must filter `date >= DETAILED_STATS_START_DATE`. Do not infer the start date from the first database row. Do not synthesize pre-start categories from legacy rows. Do not backfill.

The production activation sequence should be a separate release checklist:

1. Deploy code with the richer write disabled and historical stats unchanged.
2. Verify Preview and a production legacy-only smoke path.
3. Review the actual activation date and set the server-only configuration.
4. Enable richer writes only after the application path and rollback are approved.
5. Verify new counters and failure isolation using aggregate/configuration observations only.
6. Enable detailed public panels only when the configured date and read path are approved.

No production write should be activated by the implementation branch or by a default configuration.

## 10. Stats API plan

### 10.1 Preserve the legacy source

Keep all historical totals, daily/hourly history, municipality activity, and map data sourced from `public.aggregates`. Do not join new metric dimensions to legacy rows and do not claim the new data represents users.

Before adding richer charts, fix the legacy read to avoid silent truncation:

- query deterministic keys ordered by `date`, `hour`, `area_type`, `area_id`, and `event_type`;
- fetch bounded pages with `.range()` until the final page; or use a separately reviewed read-only aggregate endpoint if one later exists;
- retain local-file behavior only for local development and make any fallback/partial availability explicit; and
- replace the outer raw `error.message` response with a stable Norwegian error such as `Statistikken er midlertidig utilgjengelig`.

This is an additive correctness fix, not a legacy data-model replacement.

### 10.2 Read the new tables independently

When `DETAILED_STATS_READ_ENABLED` is true, query each new table separately through the server Supabase client:

- `upload_metric_daily`: select only `date`, `metric_name`, `metric_value`, and `count`; filter by the activation date; order and paginate deterministically.
- `municipality_resolution_daily`: select only `date`, `file_format`, `resolution_outcome`, `primary_result`, `fallback_result`, and `count`; filter and paginate deterministically.

Aggregate in memory into fixed response groups:

- file format;
- extension category;
- file-size bucket;
- object-count bucket;
- coordinate-count bucket;
- object mix;
- CRS status and EPSG category;
- coordinate and XY quality;
- Z quality;
- parser warning bucket/class; and
- municipality-resolution outcome, primary result, and fallback result.

Do not return raw table rows if the response could be mistaken for linked upload records. A grouped response with fixed labels is clearer and reduces accidental exposure of implementation details. Do not return app-version distribution publicly in the first UI; retain it as an operational aggregate only if a later need is approved.

The response should state that these are independent aggregate distributions and that totals are upload events, not unique users. If richer writes are optional or have failed, do not describe the distributions as a complete census of all legacy uploads.

### 10.3 Availability and empty state

The API should distinguish:

- feature disabled;
- feature enabled but no data at or after the start date; and
- data available.

All three states must avoid fabricated zeros that look like measured category values. A zero count inside an observed distribution can be rendered as zero; an entirely empty detailed dataset should be represented as “ingen detaljert statistikk er registrert ennå.”

The activation date should be returned whenever it is configured, even if no detailed rows exist. For historical dates before it, the API/UI must say that detailed causes were not recorded, rather than labeling historical unknown municipality events with modern diagnostic causes.

## 11. Norwegian UI plan

Keep all front-facing application text Norwegian. Internal identifiers and database metric values remain English.

Add a clearly separated detailed section in `StatsModal.js` with compact cards or horizontal bars. The first useful set should be:

- **Filformat**: GMI, SOSI, KOF.
- **Filstørrelser**: Under 100 KiB, 100 KiB–1 MiB, 1–10 MiB, 10–50 MiB, 50 MiB eller mer.
- **Antall objekter**: bounded ranges.
- **Koordinatmengde**: bounded coordinate ranges.
- **Objekttyper**: bare punkter, bare linjer, punkter og linjer.
- **Koordinatsystem**: oppgitt, utledet, valgt av bruker, manglet, ugyldig, ikke støttet; plus fixed EPSG categories where useful.
- **Koordinat- og geometrikvalitet**: finite-XY buckets.
- **Høyde/Z-kvalitet**: all/some/none non-zero Z, or not applicable.
- **Parseradvarsler**: none/count bucket and fixed class.
- **Kommuneoppslag**: resolved primary, resolved fallback, no coordinate, no match, timeout, network failure, bounded upstream failure, invalid response, and internal error.

Recommended wording:

- Title: `Bruksstatistikk`.
- Subtitle: `Aggregert statistikk over registrerte filopplastinger`.
- Privacy note: `Ingen filer, filnavn, nøyaktige koordinater eller personopplysninger lagres i statistikken.`
- Detail note: `Alle registrerte opplastinger er med i totaltallene. Detaljert statistikk er tilgjengelig fra {dato}.`
- Empty detailed state: `Ingen detaljert statistikk er registrert ennå.`
- Pre-activation limitation: `Årsak til manglende detalj er ikke registrert før {dato}.`
- Distribution disclaimer: `Detaljene vises som uavhengige, aggregerte fordelinger. De kan ikke kobles til enkeltopplastinger eller unike brukere.`

Avoid `brukere`, `unike brukere`, `besøkende`, or claims that a distribution represents unique uploads unless the exact denominator and optional-write coverage are clearly explained. The existing “Datakilde” badge is implementation detail and should not silently imply that a local fallback is production-complete.

The root document language in `src/app/layout.js` should be changed to `lang="no"` as part of the UI slice. This is a small accessibility correction consistent with the existing Norwegian interface.

## 12. Test plan

No current test should be weakened. Add focused pure tests first, then integration-level handler/stats tests using stubs and synthetic fixtures only.

### 12.1 Classifier and contract tests

Add tests for:

- every allowed file format and extension category;
- unknown, uppercase, missing, and multi-dot extensions without returning raw input;
- every file-size bucket and exact boundary;
- every object-count bucket and zero/negative/non-integer rejection;
- every coordinate-count bucket and zero boundary;
- points-only, lines-only, and mixed object mix;
- every CRS status: declared, inferred, assumed, missing, invalid, unsupported;
- every EPSG category, including unsupported numeric CRS mapping to `other`;
- every coordinate-status category;
- all/some/no valid XY object outcomes;
- all Z outcomes, including normalized zero and no-coordinate not-applicable;
- every warning bucket and warning class, including multiple classes;
- rejection of arbitrary warning strings, attributes, filenames, MIME values, raw counts, and coordinate objects;
- exact object keys, primitive types, null/array rejection, and no extra keys;
- cross-field CRS/coordinate consistency;
- maximum valid request under the 1,024-byte body limit; and
- oversized payload rejection before lookup or persistence.

### 12.2 Parser tests and synthetic fixtures

Create minimal in-memory fixtures, not repository or production files, for:

- GMI point-only and line-only files;
- GMI mixed objects with declared supported CRS;
- GMI missing, invalid, and unsupported CRS headers;
- GMI malformed coordinate and field-shape warnings;
- SOSI point, line, polygon-outer-ring, CRS-present, and CRS-missing cases;
- SOSI invalid JSON/shape behavior through the parser stub boundary;
- KOF explicit `KOORDSYS 22`/`23`, projection-derived CRS, heuristic inferred CRS, short lines, and missing CRS;
- zero, partial, and complete XY validity;
- missing, zero, partial, and complete Z values after normalization;
- each warning-code class without asserting raw warning text crosses the tracking boundary; and
- parser-error uploads that never call tracking.

Assertions should inspect only bounded metadata and parser behavior. Never add real filenames, coordinates, arbitrary attributes, GUIDs, raw source lines, or raw error strings to telemetry fixtures.

### 12.3 Municipality resolver tests

Stub `fetch` and assert fixed diagnostics for:

- primary match;
- primary no-match followed by fallback match;
- both no-match;
- primary/fallback timeout;
- network failure;
- HTTP 4xx and 5xx;
- invalid JSON;
- valid JSON with invalid shape;
- controlled internal error;
- no coordinate, missing CRS, invalid CRS, and unsupported CRS before lookup; and
- cache behavior without persisting or returning exact coordinate input.

Assert that resolver results contain only the safe legacy location shape plus fixed diagnostics and never contain URL, body, exception, status text, or coordinate values.

### 12.4 Tracking handler and RPC-isolation tests

Extend `tests/trackingRequestPolicy.test.mjs` or add a focused tracking integration test for:

- current legacy payload compatibility;
- optional telemetry absent;
- each valid telemetry category;
- every unknown/missing/extra telemetry field;
- server-generated schema version and app version;
- server-generated resolution categories;
- legacy increment exactly once with resolver success and resolver failure;
- richer RPC success after legacy success;
- richer RPC failure after legacy success;
- invalid contract rejection without partial richer writes;
- no telemetry call when the write flag is false;
- stable Norwegian-safe error responses with no raw dependency details; and
- old clients remaining legacy-compatible.

The test must prove that a richer failure never rejects or prevents a successful legacy upload. It must also prove that a legacy failure is not misreported as richer success.

### 12.5 Stats API and UI tests

Add stubs for:

- legacy pagination over more than one page;
- deterministic key ordering and no duplicate page rows;
- legacy fallback behavior and explicit availability state;
- new metric-table and resolution-table pagination;
- activation-date filtering;
- no pre-activation detail synthesis;
- disabled, enabled-empty, and enabled-with-data states;
- independent distributions without cross-dimensional joins;
- stable sanitized stats errors; and
- no app version, raw database errors, credentials, coordinates, filenames, or private values in the response.

For UI tests or a browser smoke test, verify:

- all new headings, labels, privacy text, empty states, and limitation text are Norwegian;
- historical totals remain visible when detailed data is empty or disabled;
- the detailed section does not appear to represent unique users;
- pre-activation history is not shown as detailed data;
- a non-production synthetic response renders format, size, object, CRS, quality, warning, and municipality-resolution distributions; and
- production-like empty response renders the correct no-data state.

### 12.6 Existing regression checks

Keep passing:

- `tests/trackingRequestPolicy.test.mjs`;
- `tests/richerUsageTelemetryDatabaseContract.test.mjs`; and
- `tests/wmsProxyPolicy.test.mjs`.

Do not modify WMS files or weaken the WMS policy/response-containment tests as part of Stage 2.

## 13. Proposed implementation slices

### Slice 1 — bounded categories and parser metadata

Goal: create useful, testable browser metadata without any server or database write.

Planned work:

- Add fixed allowlist constants and pure classifiers.
- Add the pre-prompt CRS provenance context.
- Add fixed parser warning codes while preserving current UI warning behavior.
- Derive coarse size/object/coordinate buckets, object mix, XY/Z quality, format, extension category, CRS status, and EPSG category.
- Build an optional telemetry object in memory only.
- Add unit tests with synthetic GMI/SOSI/KOF fixtures.

Likely files:

- `src/components/FileUpload.js`;
- `src/lib/parsing/gmiParser.js`;
- `src/lib/parsing/sosiParser.js`;
- `src/lib/parsing/kofParser.js`;
- `src/lib/parsing/normalizeFeature.js` only if a non-breaking diagnostic hook is needed;
- `src/lib/analysis/zValidation.js` only if a pure summary helper is reused;
- new `src/lib/telemetry/contract.js` or `src/lib/telemetry/classifiers.js`; and
- new parser/classifier tests under `tests/`.

Do not call Supabase, alter `/api/track`, or change public stats in this slice.

Recommended agent: Codex/GPT-5-level coding agent for the cross-format classification and fixture work, followed by a small focused review agent or human review for allowlist/privacy diff inspection.

### Slice 2 — structured resolver and optional failure-isolated write

Goal: wire the bounded object to the exact Stage 1 RPC while preserving legacy behavior.

Planned work:

- Refactor `kommuneLookup.js` into safe location plus fixed diagnostics.
- Extend the strict tracking policy with an optional telemetry object and cross-field validation.
- Remove new-client transmission of `sampleCount`; keep older request compatibility only if required by the reviewed rollout.
- Add server-only app-version and schema-version generation.
- Add an optional `increment_upload_diagnostics` Supabase call with exact argument mapping.
- Make the richer write feature-gated and best-effort after the legacy increment.
- Sanitize new logs and the public tracking response.
- Keep the new feature disabled by default.
- Separately protect/remove `src/app/api/track/debug/route.js` before privacy sign-off; do not use it for telemetry.

Likely files:

- `src/lib/tracking/kommuneLookup.js`;
- `src/lib/tracking/trackingRequestPolicy.mjs`;
- `src/lib/tracking/trackingHandler.mjs`;
- `src/app/api/track/route.js`;
- `src/lib/tracking/supabase.js`;
- optionally new `src/lib/tracking/richerDiagnostics.js`;
- `src/components/FileUpload.js`; and
- `tests/trackingRequestPolicy.test.mjs` plus new resolver/handler tests.

Do not alter `src/features/user-tracking/supabase_richer_usage_diagnostics.sql`, `public.aggregates`, legacy RPC signatures, or Supabase/Vercel settings.

Recommended agent: Codex/GPT-5-level server/security implementation agent, with a separate security-focused review of request shape, failure isolation, exact RPC signature, and prohibited-data assertions.

### Slice 3 — safe stats reads and visible Norwegian UI

Goal: show useful, honest UI changes in Preview without production telemetry.

Planned work:

- Add strict server configuration parsing for detailed read flag and start date.
- Fix deterministic pagination for legacy stats reads.
- Add gated, activation-date-filtered independent reads of both new tables.
- Return grouped, sanitized detailed distributions and availability state.
- Add the Norwegian detailed section to `StatsModal.js` using fixed label maps.
- Correct `html lang` to `no`.
- Keep detailed reads disabled by default when no non-production database is configured.
- Add UI empty/disabled states and independent-distribution disclaimer.

Likely files:

- `src/app/api/stats/route.js`;
- `src/components/StatsModal.js`;
- `src/app/layout.js`;
- optionally new `src/lib/stats/detailedStats.js` and `src/components/stats/DetailedStatsPanel.js`;
- new stats route/unit tests; and
- new UI/browser smoke coverage if the repository test approach supports it.

Do not make the Preview route read production detailed tables by default. A Preview database with synthetic data must be explicitly configured and isolated.

Recommended agent: Codex/GPT-5-level full-stack agent for the API/UI contract, followed by a frontend review focused on Norwegian copy, empty states, accessibility, and the no-correlation privacy wording.

### Slice 4 — Preview verification and activation readiness

Goal: prove the rollout can be enabled safely; do not activate production as part of implementation.

Planned work:

- Run the full existing and new test suite.
- Use a disposable Supabase project only if external runtime validation is separately authorized; do not connect to production.
- Exercise synthetic GMI/SOSI/KOF fixtures through Preview.
- Verify legacy-only behavior with richer write flag off.
- Verify richer RPC failure isolation with a stub or non-production failure.
- Verify detailed stats disabled/empty/data states and activation-date filtering.
- Verify requests, responses, logs, and database rows contain only permitted bounded categories.
- Record a release checklist that sets the production activation date only in a later reviewed workflow.

Likely files: test files and documentation only, unless a test exposes a defect in a prior slice. No production configuration, Vercel setting, Supabase object, or application activation occurs here.

Recommended agent: a test/review agent for exhaustive matrix execution, with human release-owner approval for any future Preview or production environment configuration.

## 14. Exact files likely to change by concern

The plan intentionally keeps the likely change surface small:

| Concern | Likely files |
|---|---|
| Browser telemetry construction | `src/components/FileUpload.js`, new `src/lib/telemetry/classifiers.js`, new contract tests |
| Parser diagnostic codes | `src/lib/parsing/gmiParser.js`, `src/lib/parsing/sosiParser.js`, `src/lib/parsing/kofParser.js` |
| Shared normalized metrics | `src/lib/parsing/normalizeFeature.js` only if required; otherwise no change |
| CRS/Z/quality reduction | new telemetry classifier; possibly `src/lib/analysis/zValidation.js` as a pure helper |
| Request policy | `src/lib/tracking/trackingRequestPolicy.mjs`, `src/lib/tracking/trackingHandler.mjs`, tracking tests |
| Resolver diagnostics | `src/lib/tracking/kommuneLookup.js`, new resolver tests |
| Supabase RPC adapter | `src/lib/tracking/supabase.js`, new adapter tests |
| Route wiring | `src/app/api/track/route.js` only if dependency wiring is needed |
| Activation/configuration | new server-only config module, likely under `src/lib/config/` or `src/lib/tracking/` |
| Legacy stats pagination and richer reads | `src/app/api/stats/route.js`, optional `src/lib/stats/detailedStats.js` |
| Norwegian detailed UI | `src/components/StatsModal.js`, optional `src/components/stats/DetailedStatsPanel.js`, `src/app/layout.js` |
| Privacy surface | `src/app/api/track/debug/route.js` in a separate narrowly reviewed protection/removal change |
| Tests | existing tracking/contract tests plus new classifier, parser, resolver, stats, and UI/smoke tests |

Files that should not change for this feature unless a separate review approves it include the Stage 1 SQL, legacy SQL, WMS policy/routes, terrain/network analysis, and the database schema itself.

## 15. Risks and rollback boundaries

| Risk | Prevention | Rollback |
|---|---|---|
| Richer write blocks upload | Call legacy first; catch richer errors; feature flag defaults false | Disable richer write flag or roll back to legacy-only application code |
| Legacy aggregate changes | Keep existing writer and RPC untouched; test exactly one legacy call | Revert only application integration; do not touch legacy data or SQL |
| Browser sends prohibited data | Pure classifier returns fixed enum object; strict key/size tests; no raw parser object serialization | Disable telemetry construction/write; retain legacy path |
| CRS provenance is lost | Classify before the FileUpload missing-CRS prompt mutates the header | Roll back classifier integration without changing parser display behavior |
| Resolver failure causes 500 | Convert upstream failures to fixed diagnostics and safe null location | Restore legacy-only diagnostics path while preserving unknown location increment |
| RPC overload/type mismatch | Exact full signature and explicit schema-version typing in adapter tests | Disable richer write; legacy RPC remains available |
| Partial richer data | New RPC is transactional for both new tables; no local fallback | Disable richer write and label detailed period unavailable; never backfill or infer |
| Stats silently truncate | Deterministic pagination tests above one page | Disable detailed panels while retaining legacy route fix or revert only the read helper |
| Production data appears in Preview | Separate flags and database configuration; detailed reads fail closed | Disable detailed reads and clear non-production test data only through its approved workflow |
| Historical detail is fabricated | Filter by explicit start date and never map legacy rows to new categories | Remove detailed panels; keep historical aggregates |
| UI implies users or correlated uploads | Norwegian disclaimer and independent group rendering | Remove offending labels/panels without changing counters |
| Existing privacy endpoint remains exposed | Treat `/api/track/debug` as a release-blocking privacy item | Protect/remove endpoint separately; do not broaden telemetry to compensate |

The primary application rollback boundary is the richer-write flag. The legacy aggregate write must remain unconditional for accepted successful uploads. The primary data boundary is the two new tables and the new RPC; do not drop, mutate, backfill, or replace `public.aggregates` as a rollback.

## 16. Earliest safe visible Preview milestone

The earliest safe visible milestone is after Slice 3’s API/UI work, with:

- `RICHER_TELEMETRY_WRITE_ENABLED=false`;
- `DETAILED_STATS_READ_ENABLED=false` unless Preview points to a disposable database;
- no production detailed read or write;
- historical dashboard data still sourced from the legacy path;
- a visible Norwegian detailed-statistics section showing “not activated” or “no detailed data yet”;
- the explicit activation-date explanation when a non-production date is configured; and
- a synthetic non-production mode capable of rendering the fixed distributions without cross-dimensional joins.

This is meaningful because it gives reviewers the real public information architecture, privacy language, empty-state behavior, and API contract before any production telemetry is activated. It does not fabricate numbers or imply that Stage 1 object creation activated collection.

## 17. Recommended model/agent for each implementation slice

| Slice | Recommended agent | Review emphasis |
|---|---|---|
| 1 | Codex/GPT-5-level coding agent with parser and data-contract experience | Allowlist completeness, parser compatibility, boundary tests, no raw data crossing the classifier |
| 2 | Codex/GPT-5-level server/security coding agent | Exact RPC mapping, resolver failure taxonomy, legacy-write preservation, request-size and privacy containment |
| 3 | Codex/GPT-5-level full-stack/API-plus-React agent | Pagination, activation-date semantics, independent aggregate rendering, Norwegian copy and accessibility |
| 4 | Focused test/review agent plus human release owner | Preview isolation, regression matrix, rollback checklist, and any environment change approval |

Use one implementation agent per slice with a fresh review context rather than one broad rewrite. Human review is required before any flag or environment value could enable production writes.

## 18. Clear recommended next action

Approve Slice 1 only: create the pure allowlist/classifier contract and parser diagnostic metadata with synthetic tests. Do not wire Supabase, change `/api/track`, enable a flag, or alter the public dashboard in that first implementation change.

After Slice 1 is reviewed and green, implement Slice 2 behind a default-off flag. Then implement Slice 3 so reviewers can see the Norwegian detailed-statistics experience in Preview without production data. Treat Slice 4 and the actual production activation date as a separate release workflow.

The immediate implementation success criterion is not new production rows. It is a small, test-backed, privacy-safe metadata contract that can be passed through the existing best-effort tracking path without changing legacy aggregate behavior.
