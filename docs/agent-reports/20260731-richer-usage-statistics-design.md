# Richer usage statistics and diagnostics — review and additive design

Date: 2026-07-31

Review branch: `design/richer-usage-statistics`

Production code baseline: `main` at `cba824ce6cc5b37daf45d8bb14a573983bb2af44`

Task type: review and design only

## Scope and method

The original review was based on the checked-out repository. The branch has no code difference from `main`. The complete repository inventory, application/API sources, tracking and parsing libraries, public statistics components, tests, SQL, setup documentation, historical tracking notes, and relevant Git history were inspected. Binary reference PDFs and the favicon do not define the tracking or database contracts and were not interpreted as application source.

This revision also incorporates the confirmed live Supabase schema, access-control, Data API, function, and aggregate-baseline findings supplied on 2026-07-31. Those findings are treated as live-confirmed facts, but this review did not itself run SQL or change Supabase. No live Vercel configuration was inspected. No migration, external write, settings change, commit, push, or deployment was performed. Repository-confirmed facts, live-confirmed facts, resolved assumptions, and remaining unknowns are separated below.

## Executive conclusions

- There is one application caller of `POST /api/track`: `useFileLoader` in `src/components/FileUpload.js`. It runs after a file has parsed successfully and after state/layer updates. The call is fire-and-forget and does not block the upload flow.
- The current public tracking contract is deliberately narrow: one event, two top-level keys, three supported EPSG values, bounded numeric coordinates, same-origin browser checks, strict UTF-8 JSON, and a 1,024-byte body limit. The richer contract must extend those exact allowlists rather than replace this containment.
- Successful uploads with a valid supported coordinate increment `public.aggregates` through `public.increment_aggregate`. Uploads without a coordinate also increment it as `unknown`. Some unsupported or out-of-range coordinates are currently rejected before any increment, so “all successful uploads” is not fully guaranteed today.
- The municipality resolver collapses primary no-match, fallback no-match, timeout, network failure, non-2xx responses, invalid JSON, invalid response shape, and outside-Norway cases to the same `null`. These causes cannot be reconstructed from existing aggregates.
- `GET /api/stats` reads all matching rows in one unpaginated Supabase query. The live Data API maximum is confirmed as 1,000 rows. The current 299 matching `upload_success` rows fit below that limit, but the route can silently truncate later as the table grows.
- The checked-in SQL and runtime agree on the current nine-parameter `increment_aggregate` signature, including `p_kommune_number`. `SQL-CHEAT-SHEET.md` contains an older copied signature that omits this parameter.
- The safest additive design is **two new aggregate tables** (three tables total including the unchanged legacy table): a narrow daily metric/value counter and a daily municipality-resolution counter. Neither stores one row per upload and neither stores exact coordinates, filenames, contents, arbitrary text, or request identity.
- Detailed telemetry must have an explicit production start date. Historical totals and municipality history remain sourced from the existing `aggregates` table; new breakdowns begin at the deployment date and must say so in the UI.
- The live configuration technically permits public-anon Data API access to the legacy table and all three RPC overloads. No evidence establishes that this access has been abused, but the authorization gap is confirmed and should be hardened before richer telemetry is implemented.
- Security hardening should be a small, independently reviewed production change. The compatible first step is to remove anonymous/authenticated database privileges and broad function execution while preserving the service-role Data API path used by the current server application.

## 1. Current tracking flow

### End-to-end flow

```text
FileUpload/useFileLoader
  -> detect format and parse entirely in the browser
  -> reject parser errors or an empty object result
  -> prompt for EPSG:25832/25833 when header.COSYS_EPSG is not finite
  -> addLayer + setData + setParsingDone
  -> getDatasetCoordinate(parsedData)
  -> fire-and-forget POST /api/track
  -> tracking request policy and bounded body reader
  -> municipality resolver (address lookup, then kommuneinfo fallback)
  -> incrementAggregate
       -> Supabase RPC increment_aggregate when configured
       -> local JSON fallback when Supabase is absent or its RPC returns false
```

### Browser caller

Source: `src/components/FileUpload.js`, principally `useFileLoader`, `detectFormat`, `handleFile`, and `trackUploadSuccess`.

- The input accepts `.gmi`, `.sos`, `.sosi`, `.kof`, and `.txt` in the browser. Detection maps an extension or content signature to `GMI`, `SOSI`, or `KOF`; unknown input defaults to GMI and must then pass the GMI signature checks to succeed.
- GMI and KOF are read as ISO-8859-1 text. SOSI is preferentially read as an `ArrayBuffer` so `sosijs` can detect its charset.
- Tracking happens only after parser errors have been rejected, at least one point or line object exists, the file has been added to the layer store, legacy state has been updated, and parsing has been marked done.
- The current body is:

  ```json
  {
    "eventType": "upload_success",
    "datasetCoord": {
      "x": 0,
      "y": 0,
      "epsg": 25832,
      "sampleCount": 1
    }
  }
  ```

  `datasetCoord` is `null` when `getDatasetCoordinate` cannot derive one. The numeric example above is structural only, not a valid production sample.
- The request uses `Content-Type: application/json` and `keepalive: true`. It is not awaited. A network or API failure is logged in the browser console and does not alter parsing or UI completion.
- Browser diagnostics log whether a coordinate exists plus EPSG and sample count, but not exact `x` or `y`. The response log includes the resolved municipality object returned by the API.

### `POST /api/track`, policy, and handler

Sources:

- `src/app/api/track/route.js`
- `src/lib/tracking/trackingHandler.mjs`
- `src/lib/tracking/trackingRequestPolicy.mjs`
- `tests/trackingRequestPolicy.test.mjs`

The route itself only wires `lookupKommuneFromCoord` and `incrementAggregate` into the dependency-injected handler and converts its result to `NextResponse.json`.

Current containment is:

- Maximum request body: exactly 1,024 UTF-8 bytes.
- Media type: exactly `application/json`, with parameters allowed.
- Top-level allowlist: required `eventType`; optional `datasetCoord`; no other key.
- Event allowlist: only `upload_success`.
- Coordinate allowlist: required `x`, `y`, and `epsg`; optional `sampleCount`; no other key.
- `x` and `y`: finite JSON numbers, with no string coercion.
- EPSG allowlist: integer `25832`, `25833`, or `4326`.
- EPSG:4326 range: longitude `[-180, 180]`, latitude `[-90, 90]`.
- EPSG:25832/25833 broad range: easting `[100000, 900000]`, northing `[0, 10000000]`.
- `sampleCount`: optional integer `[1, 200]`.
- A declared oversized `Content-Length` is rejected before body consumption. Streamed bodies are counted by byte and cancelled immediately after overflow. Invalid UTF-8 is rejected.
- `Sec-Fetch-Site: cross-site` is rejected. If an `Origin` header exists, it must be a valid origin equal to the request URL origin. Missing browser headers remain allowed for non-browser compatibility; this is containment, not authentication.
- The former permissive CORS `OPTIONS` behavior is absent.
- Stable errors are 400 `Invalid tracking request`, 403 `Tracking request is not allowed`, 413 `Tracking request body is too large`, 415 `Tracking request must use application/json`, and 500 `Tracking temporarily unavailable`.
- Rejected requests call neither lookup nor persistence. A valid coordinate causes one resolver invocation at route level; a coordinate-free request skips it. Both then call the legacy increment once.

The handler does not use `getRoughLocationFromRequest` from `src/lib/tracking/location.js`. Older documentation stating that Vercel geo headers are used as a fallback is stale. The current production flow is dataset-coordinate-only.

### Dataset coordinate extraction

Source: `src/lib/tracking/datasetCoordinate.js`.

- EPSG is read from `header.COSYS_EPSG`, then `header.COSYSVER_EPSG`, then an `EPSG` token in `header.SRID`.
- Only the first coordinate of every point and every line is collected.
- Invalid/non-finite first coordinates are skipped.
- At most 200 object coordinates are sampled at a regular index interval.
- The arithmetic centroid of the sample is sent as the lookup coordinate with `sampleCount`.
- `sampleCount` is validated by the server but discarded before lookup and is not stored.
- The approach is not a geometry centroid and can be biased by object ordering, long lines, datasets spanning municipalities, or spatial outliers.

### Municipality resolver

Source: `src/lib/tracking/kommuneLookup.js`.

1. It rejects non-finite coordinates or EPSG values outside `25832`, `25833`, and `4326` by returning `null`.
2. It keys an in-memory module cache by EPSG and `x`/`y` rounded to two decimals. Only successful results are cached, with no TTL or size bound. Cache lifetime is one warm server instance.
3. Primary lookup calls Geonorge address point search with a 200-metre radius and `treffPerSide=1`.
4. If the first address has a municipality name, it returns a `kommune` location with name, number, slug-based `areaId`, and source `geonorge-adresse`.
5. Otherwise it calls Geonorge kommuneinfo point lookup.
6. A valid kommuneinfo shape returns the same location structure, plus county number where available, and source `dataset-kartverket`.
7. Otherwise it returns `null`.

Each upstream call has its own 2.5-second abort timer, so a primary failure followed by a fallback failure can take roughly five seconds. The fetch helper returns `null` for non-2xx status, timeout, network error, JSON parse error, and any thrown exception. Response-shape mismatches are also converted to no match by `buildResult`. No failure detail survives.

The resolver’s `source` is not written to Supabase and is omitted from the public handler response. Therefore the database cannot show whether a match came from the address API or kommuneinfo.

### Supabase write

Sources: `src/lib/tracking/aggregates.js` and `src/lib/tracking/supabase.js`.

- Date and hour are generated server-side in UTC.
- A missing location becomes `area_type='unknown'`, `area_id='unknown'`, `area_name='Unknown'`, with null municipality/country/region.
- When both Supabase environment variables are present, the server calls `increment_aggregate` using the service-role client. Client auth session persistence is disabled.
- The conflict identity is date, UTC hour, area type, area ID, and event type. Municipality number is metadata, not part of the identity.
- The checked-in function increments only `count` and `updated_at` on conflict. It does **not** refresh `area_name`, `kommune_number`, `country`, or `region`. A row first created without municipality metadata cannot be enriched by a later conflict.
- `area_id` is a slug of municipality name rather than the official municipality number. Renames, spelling/encoding corrections, and historical rows without `kommune_number` can split what is conceptually one municipality.
- Supabase errors are logged server-side and converted to `false`. They are not returned verbatim by the tracking API.

### Existing fallback storage

Source: `src/lib/tracking/aggregates.js`; checked-in sample: `data/usage/aggregates.json`.

- Default path: `data/usage/aggregates.json`, overridable by `TRACKING_STORAGE_PATH`.
- Format: `{ "version": 1, "records": { ... } }` with a compound string record key.
- The current compound key includes date, hour, area type, area ID, and event type. A historical checked-in record predates the hour key and is normalized as hour zero by the stats API.
- The file update is an unprotected read-modify-write. Concurrent requests can lose increments.
- If Supabase is not configured, the file is used. If the Supabase RPC returns false, the file is also used. If both fail, the handler commonly still returns HTTP 200 with `stored: false` because file errors are caught.
- This fallback is useful locally but is not a reliable durable counter on ephemeral or read-only serverless filesystems. The stats endpoint does not merge it with Supabase; it selects one source.

### Ancillary tracking endpoints

- `GET /api/track/health` checks configuration and can read `aggregates`. With `write=true` and a keepalive secret it writes a `health-test` / `health_check` legacy row. The public stats query excludes that event type.
- `GET /api/track/debug` is unauthenticated and returns `request.geo` plus selected Vercel/Cloudflare geo headers. It includes exact Vercel latitude/longitude headers when supplied. It does not persist them, but its public response surface is inconsistent with the desired “do not expose exact coordinates/raw headers” posture and should be separately removed or protected during implementation. It is not part of normal upload tracking.
- `src/lib/tracking/location.js` can derive location from Vercel geo headers, but has no current caller in the upload path.

## 2. Current statistics flow

### Data sources and `GET /api/stats`

Source: `src/app/api/stats/route.js`.

Supabase path:

- Reads table `aggregates`.
- Selects `date, hour, area_type, area_id, area_name, kommune_number, country, region, event_type, count`.
- Filters `event_type = 'upload_success'`.
- Orders only by `date ASC`.
- Has no `.range()`, `.limit()`, cursor, loop, or database-side aggregation.

File path:

- Reads the same path used by the fallback writer.
- Converts `records` to an array and filters camel-case `eventType === 'upload_success'`.
- Returns an empty array for all read/parse failures.

Source selection:

- If Supabase is configured and the read succeeds, only Supabase is used.
- If Supabase is configured but the read throws, only the local file is used.
- If Supabase is absent, only the local file is used.
- Supabase and local counts are never merged or reconciled. A transient Supabase read error can therefore make the public dashboard show the small local sample rather than historical production totals.

### Current in-memory aggregation

`processRecords` normalizes snake-case Supabase rows or camel-case file rows, then computes:

- `summary.totalUploads`: sum of `count`.
- `summary.uniqueKommuner`: number of distinct non-null `kommuneNumber` values. This is municipalities, not users.
- `summary.activeDays`, `firstDate`, and `lastDate`.
- `daily`: date totals.
- `hourly`: 24 UTC-hour totals across all dates.
- `byKommune`: grouped by municipality number, then area ID, then `unknown`.
- `heatmap`: day-of-week × UTC hour totals.
- `timeline`: date × municipality number/area ID totals.

Important edge cases:

- Historical rows without `kommune_number` and newer rows for the same municipality with a number use different grouping keys and can appear separately.
- The current writer uses `areaName='Unknown'`, while the “Topp kommuner” UI excludes only exact lower-case `unknown`. Current unknown rows can therefore appear as a top “municipality.”
- `count: r.count || 1` silently converts a numeric zero to one. Counts should never be zero under the intended database contract, but this is not validated in the route.
- The route returns raw `error.message` on its outer 500 path. The modal displays that value, so an English or infrastructure-specific message can become public UI.

### Municipality coordinate lookup for the map

- For every distinct non-null municipality number returned by the current query, the API calls `https://ws.geonorge.no/kommuneinfo/v1/kommuner/{nummer}` and reads `punktIOmrade.coordinates`.
- Calls are started together with `Promise.allSettled`, without a concurrency limit.
- Each call has a 3-second abort timeout.
- Valid results are cached only in a positive, in-memory module `Map`, for the lifetime of one warm instance. Failures are not cached.
- On cold starts, every municipality may be looked up again. A large municipality set can create a burst of external calls and delay the whole stats response until all have settled.
- Returned coordinate values are not explicitly type/range validated before being attached to the response.

### Pagination, row limits, and caching

- **Pagination:** none. The Supabase client query requests the full logical result, while the confirmed live Data API maximum is 1,000 rows. The current 299 `upload_success` aggregate rows fit below that ceiling, so the confirmed 551-event baseline is not presently at risk from this limit. If matching rows later exceed 1,000, totals and timelines can become silently incomplete unless the read is paginated or moved to database-side aggregation.
- **Ordering:** only date is deterministic; ties are not ordered by hour or key. This is not currently visible in commutative sums, but is insufficient for safe range pagination.
- **API caching:** no explicit `Cache-Control`, `revalidate`, or route cache declaration exists.
- **Client caching:** none. `StatsModal` fetches `/api/stats` each time it opens and aborts the fetch on close.
- **Lookup caching:** only the two warm-instance maps described above: exact-coordinate-to-municipality in the tracking resolver and municipality-number-to-map-point in the stats route. There is no durable cache or negative cache.
- **Supabase client:** cached as a module singleton, but query results are not cached.

### Existing public statistics UI

Sources:

- Always-visible “Statistikk” button in `src/app/page.js`.
- Public modal in `src/components/StatsModal.js`.
- Lazy-loaded Leaflet map in `src/components/stats/StatsMap.js`.

The UI currently provides:

- “Bruksstatistikk” and “Anonym oversikt over filopplastinger”.
- Metric cards for “Totalt opplastet”, “Unike kommuner”, “Aktive dager”, and “Mest aktive time”.
- “Opplastinger over tid”, with missing dates filled as zero in the browser.
- “Geografisk oversikt” with cumulative playback over dates.
- “Topp kommuner”.
- “Aktivitet per time (UTC)”.
- “Aktivitetskart — ukedag × time”.
- Empty, loading, and error states.
- A public source badge (“Supabase” or “Lokal fil”).

Most visible copy is Norwegian. Product names and UTC are acceptable proper/technical terms. The raw API/client error display can be English. The page root currently declares `<html lang="en">`, despite the Norwegian UI. The map slider has a `value` but no `onChange`, so playback can move it but direct user scrubbing is not implemented.

No existing view reports file format, size/object/coordinate buckets, CRS provenance, parser warnings, municipality-resolution causes, resolver source, or the start date of detailed telemetry.

## 3. Repository database contract

### Contract confirmed from repository code and SQL

#### `public.aggregates`

The checked-in intended schema is:

| Column | Repository SQL type | Null/default in repository SQL | Runtime use |
|---|---|---|---|
| `date` | `date` | `NOT NULL` | UTC date bucket |
| `hour` | `smallint` | `NOT NULL` | UTC hour bucket |
| `area_type` | `text` | `NOT NULL` | Normally `kommune` or `unknown`; health endpoint uses `health-test` |
| `area_id` | `text` | `NOT NULL` | Slug of municipality name or `unknown` |
| `area_name` | `text` | nullable | Display name |
| `kommune_number` | `text` | nullable | Official municipality number when resolver provides it |
| `country` | `text` | nullable | `NO` for a municipality match |
| `region` | `text` | nullable | County number only when kommuneinfo supplies it; address primary returns null |
| `event_type` | `text` | `NOT NULL` | `upload_success`; health endpoint can write `health_check` |
| `count` | `bigint` | `NOT NULL DEFAULT 0` | Aggregate count |
| `created_at` | `timestamptz` | `DEFAULT now()` | First insert time |
| `updated_at` | `timestamptz` | `DEFAULT now()` | Last increment time |

Repository primary key and conflict target:

```text
(date, hour, area_type, area_id, event_type)
```

No additional indexes, foreign keys, check constraints, RLS policies, grants, retention jobs, or triggers are defined in the checked-in SQL.

#### `public.increment_aggregate`

Runtime RPC name: `increment_aggregate` (resolved by Supabase in `public`).

Checked-in full function name: `public.increment_aggregate`.

Exact checked-in/runtime parameters:

```text
p_date              date
p_hour              smallint
p_area_type         text
p_area_id           text
p_area_name         text
p_kommune_number    text
p_country           text
p_region            text
p_event_type        text
```

Return type: `void`. Language: `plpgsql`.

The insert starts at one. On conflict it increments `public.aggregates.count` and updates `updated_at`; it does not update the descriptive columns.

#### Other SQL functions referenced by repository setup SQL

`src/features/user-tracking/supabase_normalize_area_names.sql` defines:

- `public.url_decode(input text) RETURNS text`, PL/pgSQL, immutable.
- `public.slugify_text(in_text text) RETURNS text`, SQL, immutable.
- Extension `unaccent` if absent.

That script then updates existing `aggregates.area_name` and selected `area_id` values. It is a historical data mutation script and should not be rerun casually during this additive project.

### SQL and setup files

- `src/features/user-tracking/supabase.sql`: current intended table plus nine-parameter increment function.
- `src/features/user-tracking/supabase_hourly_migration.sql`: adds `hour` and `kommune_number`, drops/recreates `aggregates_pkey`, and replaces the increment function.
- `src/features/user-tracking/supabase_normalize_area_names.sql`: URL-decode/slug helpers and historical normalization updates.
- `src/features/user-tracking/SQL-CHEAT-SHEET.md`: operational examples, but its copied “create table + function” block omits `kommune_number` and `p_kommune_number`; that block is stale relative to runtime and `supabase.sql`.
- `src/features/user-tracking/README.md` and `KOMMUNE-LOOKUP.md`: design/setup notes with stale claims about request geo fallback and supported CRS details.
- `README.md`: environment variable and privacy summary.
- No other `.sql`, migration framework, schema snapshot, or generated database types are present.

`CREATE TABLE IF NOT EXISTS` in the base SQL does not reconcile an already-existing table’s columns or constraints. The repository SQL therefore states intent but is not proof of the live shape.

### Original live-inspection questions, now resolved

The original review identified the following questions for read-only inspection. They are retained as review provenance; section A records the confirmed answers and supersedes their former unknown status:

- Whether `public.aggregates` exists and matches every listed type, nullability, default, column order, and primary key.
- Whether the hourly and municipality-number migrations were applied exactly once and completed successfully.
- Whether another overload of `increment_aggregate` exists, and the exact live argument order/types, function body, owner, volatility, `SECURITY DEFINER/INVOKER` mode, and `search_path` behavior.
- Whether `url_decode`, `slugify_text`, or `unaccent` exist in production.
- Actual indexes, constraints, triggers, RLS state/policies, table privileges, and function execute grants.
- Whether service-role access is the only effective write path.
- Actual row count, aggregate count sum, first/last dates, number of rows without `kommune_number`, and whether more than the PostgREST response cap match `upload_success`.
- Whether any retention or scheduled cleanup exists outside the repository.
- The configured PostgREST maximum result rows.
- Whether production writes have ever fallen back to a local filesystem rather than Supabase; Supabase alone cannot fully answer the latter.

## A. Live Supabase verification

### Repository-confirmed facts

- The current server writer uses the Supabase Data API with the service-role key and calls the nine-parameter `public.increment_aggregate` overload.
- The server-side statistics route also reads `public.aggregates` through the service-role Supabase client. The browser calls the application’s `/api/stats` route; repository code does not directly query Supabase from the public statistics UI.
- The checked-in schema and runtime agree on the nine-parameter overload, including `p_kommune_number`. `SQL-CHEAT-SHEET.md` retains an older eight-parameter copy and is stale.
- The legacy writer’s conflict identity is `(date, hour, area_type, area_id, event_type)`. It increments `count` and refreshes `updated_at`, but does not refresh descriptive municipality metadata on conflict.
- No migration framework, generated database types, or application references to richer diagnostic tables exist in the repository.

### Live-confirmed table contract

`public.aggregates` exists with this live shape:

| Column | Live type | Live null/default | Meaning in the current application |
|---|---|---|---|
| `date` | `date` | `NOT NULL` | UTC date bucket |
| `hour` | `smallint` | `NOT NULL` | UTC hour bucket |
| `area_type` | `text` | `NOT NULL` | Normally `kommune` or `unknown`; health rows use another fixed value |
| `area_id` | `text` | `NOT NULL` | Municipality-name slug or `unknown` |
| `area_name` | `text` | nullable | Display name |
| `kommune_number` | `text` | nullable | Official municipality number when resolved |
| `country` | `text` | nullable | `NO` on all known municipality rows |
| `region` | `text` | nullable | Incompletely populated county number |
| `event_type` | `text` | `NOT NULL` | Currently `upload_success` or `health_check` |
| `count` | `bigint` | `NOT NULL DEFAULT 0` | Aggregate count |
| `created_at` | `timestamptz` | nullable, `DEFAULT now()` | Initial row creation time |
| `updated_at` | `timestamptz` | nullable, `DEFAULT now()` | Last increment time |

The primary key is exactly `(date, hour, area_type, area_id, event_type)`. Its primary-key index is the only index. There are no other constraints, triggers, dependent views, or dependent materialized views.

### Live-confirmed function contract

Three `public.increment_aggregate` overloads exist:

1. The current nine-parameter overload takes `date`, `smallint`, and seven `text` values in the repository/runtime order: date, hour, area type, area ID, area name, municipality number, country, region, and event type. It matches the application and current repository SQL.
2. An older eight-parameter overload has the same contract except that it omits municipality number. It otherwise writes the current table.
3. The oldest seven-parameter overload omits both hour and municipality number and uses an obsolete conflict target. It appears incompatible with the current table and would likely fail if called.

All three return `void`, use PL/pgSQL, are volatile `SECURITY INVOKER` functions owned by `postgres`, and have no custom function settings. They are the only live functions that reference `public.aggregates`. Function-call statistics cannot show whether either obsolete overload is still used because `track_functions` is `none`.

### Live-confirmed security and Data API state

- RLS and forced RLS are disabled on `public.aggregates`; there are no policies.
- `anon` and `authenticated` have `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` on the table, plus `USAGE` on `public`.
- All three function overloads are executable by `PUBLIC`, `anon`, `authenticated`, `service_role`, and `postgres`. The `PUBLIC` grant matters independently: removing only the role-specific grants would still leave execution available through `PUBLIC`.
- The Supabase Data API is enabled and exposes `public` and `graphql_public`. `public.aggregates` and `public.increment_aggregate` are exposed API objects.
- Automatic exposure of new tables is enabled.
- Default privileges for objects created by both `postgres` and `supabase_admin` in `public` broadly grant table, function, and sequence privileges to `anon` and `authenticated`.
- The Data API maximum row setting is 1,000.

### Live-confirmed historical production baseline

For `event_type='upload_success'`, the authoritative legacy baseline at the time of inspection is:

| Measure | Confirmed value |
|---|---:|
| Aggregate rows | 299 |
| Upload events | 551 |
| First date | 2026-02-11 |
| Last date | 2026-07-31 |
| Rows without `kommune_number` | 48 |
| Events without `kommune_number` | 67 |
| Known municipality events | 484 |
| Unknown municipality events | 67 |

Every unresolved event uses `area_type='unknown'`, `area_id='unknown'`, `area_name='Unknown'`, and a null municipality number. Unknown results occurred on 36 separate days. The monthly distribution is:

| Month in 2026 | Unknown | All uploads | Unknown share |
|---|---:|---:|---:|
| February | 6 | 223 | 2.7% |
| March | 24 | 110 | 21.8% |
| April | 14 | 63 | 22.2% |
| May | 5 | 43 | 11.6% |
| June | 13 | 72 | 18.1% |
| July | 5 | 40 | 12.5% |

Several UTC hours contain both known and unknown municipality results. That makes a complete Geonorge outage an unlikely explanation for most unknowns, while remaining consistent with intermittent lookup failures, no-match cases, missing coordinates, or other causes currently collapsed to `null`.

Known municipality totals are:

| Municipality | Events |
|---|---:|
| 3911 Færder | 312 |
| 3903 Holmestrand | 52 |
| 3907 Sandefjord | 52 |
| 3905 Tønsberg | 35 |
| 4601 Bergen | 14 |
| 3301 Drammen | 5 |
| 1866 Hadsel | 4 |
| 3909 Larvik | 4 |
| 4003 Skien | 4 |
| 3201 Bærum | 1 |
| 3901 Horten | 1 |

Name variants are capitalization-only for Færder, Holmestrand, Sandefjord, and Tønsberg. Every municipality number maps to one `area_id`; all municipality numbers have four digits; and every known row uses `area_type='kommune'` and `country='NO'`. Region data is not a reliable historical dimension: 465 known events have no region and only 19 have region `39`.

The table also contains 124 `health_check` events. No invalid hours, non-positive counts, blank area types, blank area IDs, or blank event types were found. No other tracking/statistics tables exist. `url_decode` and `slugify_text` do not exist, and `unaccent`, `pg_cron`, and `pg_net` are not installed.

### Previous assumptions now resolved

- The live table shape and primary key match the repository’s current intended contract.
- There are three function overloads, not one; only the nine-parameter overload is the current application contract.
- The live table has no supporting indexes beyond its primary key and no hidden trigger/view dependencies.
- RLS is not protecting the table, and service-role access is not the only effective write path. Direct anon/authenticated table access and RPC execution appear technically permitted by the confirmed configuration.
- The live result cap is 1,000. The present 299 upload rows fit under it, but unpaginated reads remain a growth risk.
- Historical totals, coverage, unknown rates, naming variants, region completeness, helper functions, extensions, and absence of other tracking tables are now known.

### Remaining unknowns

- The confirmed configuration establishes technical permission, not whether anonymous access has actually been used or abused. No such claim can be made from these findings.
- Function-call statistics cannot determine whether stale callers use either obsolete overload.
- Supabase cannot show whether any failed production writes fell back to the application’s local filesystem.
- No database trigger, dependent view, `pg_cron`, or other tracking table indicates retention activity, but an external scheduler or administrative process outside the inspected database remains unknown.
- Live Vercel environment values and deployment history were not inspected; production smoke tests must confirm the running application is using the expected service-role server path without revealing the key.
- The exact production activation date for richer diagnostics is not yet known and must be chosen only when the new write is enabled.
- Whether the project’s current Data API controls can hide an individual existing object while still allowing the service-role PostgREST client to reach it must be proven in a non-production environment. The conservative assumption is that removing an object from the API schema also removes the server’s current route to it.

## B. Confirmed security finding

The current configuration appears to permit a client holding the public anon key to reach `public.aggregates` through the Data API and exercise the table privileges granted to `anon`. In practical terms, the exposed table endpoint appears to permit reading, inserting, changing, and deleting legacy aggregate data, subject to the API’s request mechanics and the table’s primary key/non-null rules. The database role also holds `TRUNCATE`, `REFERENCES`, and `TRIGGER`, although the confirmed Data API exposure alone does not prove that every SQL privilege has a corresponding HTTP operation. The 1,000-row response maximum limits the size of one read response; it is not an authorization control and does not protect writes.

The exposed RPC creates a second modification path. Because every overload grants execution to `PUBLIC` as well as directly to `anon` and `authenticated`, anonymous callers appear technically able to invoke them. The current overload can add counts using caller-chosen aggregate dimensions; the oldest overload is probably broken but is still an exposed callable surface. RLS is disabled, so it provides no independent denial layer. `SECURITY INVOKER` prevents the functions from automatically escalating to the owner, but it does not help when the caller already has table write privileges.

Automatic exposure of new tables and broad default privileges for both common object creators make the issue repeatable: a future table, function, or sequence created in `public` can inherit public-client access unless its privileges and exposure are explicitly corrected. This is particularly important for the proposed diagnostic aggregates.

This is a confirmed authorization/configuration finding, not evidence of exploitation. The correct statement is that access appears technically permitted by the live configuration. Determining whether abuse occurred would require appropriate audit evidence that is not present here.

## C. Safe hardening plan

Security hardening should be its own small, reviewed change before the richer telemetry migration. The intended sequence is deliberately compatible with the current server application:

1. **Record a private pre-change baseline.** Reconfirm the 299 legacy rows, 551 upload events, 124 health-check events, date range, object ACLs, function signatures/ACLs, RLS state, API exposure, and the current application deployment. Record only aggregate/configuration evidence; do not export credentials or row-level upload data. Define rollback owners and a short verification window.
2. **Stop unsafe inheritance before creating anything.** Disable automatic exposure of new tables. Correct default privileges separately for objects created by `postgres` and by `supabase_admin` in `public`: new tables and sequences must not grant anon/authenticated access, and new functions must not grant execution to `PUBLIC`, `anon`, or `authenticated`. Preserve the privileges needed by `service_role` and ownership/administration by `postgres`. This step affects future objects and should not interrupt the current application; verify the legacy upload and dashboard anyway.
3. **Remove direct table access from public client roles.** Revoke every current table privilege on `public.aggregates` from `anon` and `authenticated`, including read, write, truncate, reference, and trigger privileges. Confirm that `PUBLIC` has no table privileges. Retain the exact table privileges needed by `service_role`; retain owner access for `postgres`. Keep `USAGE` on `public` if other application objects require it—schema usage alone does not grant table access.
4. **Remove public RPC execution.** For each of the seven-, eight-, and nine-parameter overloads, revoke execution from `PUBLIC`, `anon`, and `authenticated`. The `PUBLIC` revocation must be explicit; revoking only the named client roles is insufficient. Retain execution for `service_role` and `postgres`. Because the functions are `SECURITY INVOKER`, also retain the service role’s required underlying table privileges.
5. **Verify the current server path immediately.** Perform a normal production upload with a safe synthetic fixture through the application, verify that the nine-parameter RPC increments the legacy total once, and verify that `/api/stats` still returns all historical data. Separately verify that anon table reads/writes and calls to each overload are denied. Do not use destructive probes such as a truncate attempt against production; use non-destructive authorization checks or a disposable non-production object for destructive privilege classes.
6. **Add RLS as defense in depth after the service-role smoke test.** Revocation plus correct grants—and, where compatible, removal from the Data API—is sufficient to deny direct anon/authenticated access when maintained correctly, so RLS is not the only control. Enabling RLS with no anon/authenticated policies is nevertheless recommended on a table in an exposed schema because it protects against a later accidental grant. Forced RLS is not required. The service role is expected to bypass RLS, but that behavior must be verified in non-production and then by the production smoke test. If enabling RLS unexpectedly affects the server, disable RLS as the immediate rollback while keeping the privilege revocations in place and diagnose the actual runtime role.
7. **Treat Data API object removal as a separate architecture decision.** Removing `public.aggregates` from exposed tables would remove the route currently used by `/api/stats`; removing `increment_aggregate` from exposed functions would remove the RPC route used by the server writer if the setting applies to all PostgREST roles. Either could break production even though the server uses `service_role`. Test granular exposure behavior outside production. Remove either legacy object from the Data API only after proving the corresponding service-role operation remains available or moving server access to a deliberately designed private-schema/direct-connection or restricted facade path. Until then, API-visible but privilege-denied is the compatible intermediate state.
8. **Retire obsolete overloads cautiously.** Revoke their public execution in the initial hardening. The seven-parameter overload is incompatible and should be removed by its exact signature after the current nine-parameter application path and rollback target are verified. Retain the eight-parameter overload only for a defined short compatibility/rollback window; then remove it by exact signature once deployment history and repository search show no required caller. Never replace or drop the current nine-parameter overload during this hardening.
9. **Account for Data API schema caching.** After every privilege, RLS, function, or exposure change, allow for or deliberately request the supported Supabase/PostgREST schema reload, then repeat both allowed and denied checks. A stale API schema must not be mistaken for either successful hardening or an outage.

Each step should be a separately observable checkpoint. If a server regression occurs, restore only the minimum service-role privilege or exposure needed for the current application, never the anon/authenticated grants. If public-client denial fails, stop and correct that step before proceeding. Historical rows must not be updated, deleted, normalized, or re-keyed during hardening.

## 4. Metadata available during or immediately after parsing

The safe recommendation is to derive categories in the browser and send only fixed enum values. Exact values and raw parser text should stay in browser memory.

| Item | Current source/function | Current availability | Safe reduction |
|---|---|---|---|
| Detected file format | `FileUpload.detectFormat`; `parsedData.format` from all three parser outputs | `GMI`, `SOSI`, or `KOF` on success | Send allowlist `gmi`, `sosi`, `kof` |
| Extension | `file.name` parsing in `detectFormat`/`handleFile` | Raw extension is available, including arbitrary text | Never send name/raw extension. Send only `gmi`, `sos`, `sosi`, `kof`, `txt`, `other`, `none` |
| MIME type | `file.type` in `FileUpload` metadata | Browser-supplied and often empty/arbitrary | Do not send or store; detected format is more useful |
| Exact file size | `file.size` | Exact bytes available before parsing | Send only a coarse bucket |
| Object/feature count | `parsedData.points.length + parsedData.lines.length`; `validateGmiData.stats`; Z analysis summary | Exact counts available on success | Send count bucket and `points_only`/`lines_only`/`points_and_lines` |
| Coordinate count | Sum of all `feature.coordinates.length`; also `analyzeZValues.summary.totalPointCoords/totalLineCoords` | Exact total available synchronously after parse | Send coarse bucket only |
| Lookup sample count | `getDatasetCoordinate.sampleCount` | Number of sampled first-per-object coordinates, max 200 | Existing field can remain but should not be stored; it is not total coordinate count |
| CRS/EPSG | GMI headers; SOSI GeoJSON CRS; KOF header/heuristics; `getEpsgFromHeader` | Numeric value can be declared, derived, or user-inserted | Send fixed `epsg_25832`, `epsg_25833`, `epsg_4326`, `other`, `missing` |
| CRS provenance | GMI/SOSI/KOF parser path and FileUpload’s missing-CRS prompt | Not preserved as an explicit field. KOF inference sometimes emits a warning; the prompt overwrites header state | Instrument explicit `declared`, `inferred`, `assumed`, `missing`, `invalid`, `unsupported` before header mutation |
| Coordinate extraction outcome | `getDatasetCoordinate` | Currently only coordinate object or `null`; null causes are collapsed | Return a tagged internal result and send one fixed outcome |
| XY geometry quality | Parser coordinates and `normalizeFeature` | GMI warns on malformed coordinate lines; normalization drops invalid XY. Empty coordinate arrays remain possible | Send all/some/none valid-XY category, never coordinates/extents |
| Z quality | `analyzeZValues`; `normalizeFeature` uses zero for missing normalized Z while GMI uses null | Exact missing/zero coordinate and object counts available | Send a coarse all/some/all-missing/not-applicable category |
| Spatial outliers | `detectOutliers` in `addLayer`/`setData`; deliberately disabled for KOF | Count and statistics available synchronously for GMI/SOSI | At most send `none`, `present`, `not_evaluated`; never centroid, distance, or object IDs. Not essential for the first telemetry version |
| Incline/geometry analysis | `analyzeIncline` in `addLayer`/`setData` | Per-line `ok`, `warning`, `error` with missing Z, backfall, low incline, etc. | Could reduce to fixed aggregate quality flags, but omit from v1 to avoid too many dimensions and domain interpretation |
| Field validation | `validateFields` in UI components; unused `validateGmiData` library | Not guaranteed to have executed before the current tracking call; results include arbitrary field values/messages | Do not include in v1. If later added, send only fixed pass/warning/error counts in buckets |
| Parser warnings | `warnings` in GMI/SOSI/KOF outputs | Raw strings; GMI may contain raw coordinate-line text and KOF warnings may contain internal line IDs | Never send raw strings. Add internal warning codes and send count bucket plus one coarse class |
| Parser errors | `errors` arrays and thrown exceptions in parsers/FileUpload | Any non-empty parser error array prevents `upload_success`; raw errors can contain arbitrary messages/stacks | Do not send on success and never persist raw text. A separate future failure-event design would need its own fixed error-code allowlist |
| File metadata/project identifiers | `file.name`, `lastModified`, feature IDs/GUIDs, GMI headers/attributes | Available in browser state/parser objects | Explicitly prohibited from telemetry |
| Application version | `package.json` has `0.1.0` | No current upload or stats field; no current build/release identifier is surfaced | Generate a bounded release identifier server-side; do not accept it from the browser |

Notable parser details:

- GMI parses arbitrary headers, GUIDs, extents, attributes, and raw warning strings. None should cross the tracking boundary.
- SOSI reads arbitrary GeoJSON properties. None should cross the tracking boundary.
- KOF stores a raw source line in each parsed point’s attributes. This is especially important never to serialize into tracking.
- `normalizeFeature` drops invalid XY and substitutes Z=0 when normalized source Z is absent/invalid. Telemetry calculations must account for that convention.
- FileUpload currently tests only `header.COSYS_EPSG` before prompting, while `getDatasetCoordinate` also understands `COSYSVER_EPSG` and `SRID`. CRS provenance logic should be centralized rather than inferred twice.

## 5. Municipality-resolution failure modes

| Failure mode | Distinguishable now? | Current behavior | Change needed |
|---|---|---|---|
| No coordinate | Only in browser/handler control flow, not persisted | `datasetCoord: null`; lookup skipped; legacy `unknown` increment | Browser sends fixed `coordinateStatus=no_valid_xy`; handler maps it to fixed resolution outcome |
| Missing CRS | No, after prompt/provenance loss | FileUpload prompts and inserts 25832/25833; without usable EPSG `getDatasetCoordinate` returns null | Preserve pre-prompt provenance and send `crsStatus=assumed` after selection or `missing` if unresolved |
| Invalid CRS | No | Non-numeric/missing becomes prompt path; exact cause not retained | Central CRS classifier before mutation; fixed `invalid` category |
| Unsupported CRS | Partly at request validation, not counted | A finite unsupported EPSG can be sent and then rejected with generic 400 before legacy write | Browser must send `datasetCoord:null`, `coordinateStatus=crs_unsupported`; legacy upload still increments unknown |
| Invalid/out-of-range coordinate | Partly at request validation, not counted | Generic 400 before lookup and before legacy write | Classify locally; omit coordinate; send fixed diagnostic category. Server retains numeric validation for any supplied coordinate |
| Outside Norway | No | Usually becomes two null lookup results and legacy unknown | Add a reliable server-side classification, either explicit upstream semantics or a local Norway-boundary test. Do not guess from a broad bounding box |
| Primary lookup no match | Only transiently inside resolver | Address result missing; fallback attempted | Tagged fetch/parse result `no_match`; persist only fixed category |
| Fallback lookup no match | Only transiently inside resolver | Returns null | Tagged result and overall `no_match` |
| Timeout | No | Abort is caught and converted to null; fallback may run | Distinguish `AbortError` as `timeout` without retaining message |
| Network failure | No | Caught and converted to null | Fixed `network_error` result |
| Upstream non-2xx | No | Converted to null | Fixed `http_4xx`/`http_5xx`, never exact body or URL |
| Invalid JSON | No | JSON exception converted to null | Fixed `invalid_json` |
| Invalid upstream shape | No | Missing fields become no match | Validate expected object shape and distinguish `invalid_shape` from a valid empty result |
| Internal error | Only as generic API 500, not persisted | Handler returns stable 500; legacy write may not occur | Catch at defined stages, use fixed `internal_error`, and decide whether legacy unknown can still safely increment |

The resolver should return an internal structure such as `{ location, diagnostics }`, where diagnostics contains only fixed enums. It must never include the requested coordinate, URL, response body, status text, exception message, or raw response. Primary and fallback result categories should be retained separately so cases such as “primary timeout, fallback match” remain understandable while the overall result is `resolved_fallback`.

## D. Revised additive database design

### Design principles

- Do not alter, truncate, backfill, re-key, or stop writing `public.aggregates`.
- Keep calling `public.increment_aggregate` for every accepted successful upload.
- Add no per-upload table, event UUID, exact timestamp, exact numeric file metadata, or cross-dimensional “fact row.”
- Use UTC daily buckets for new detailed metrics. The existing legacy table remains hourly.
- Use fixed enums and independent counters. Avoid combining file size, object count, CRS, municipality, and build into one row because a rare combination could effectively identify one upload.
- Keep municipality activity in the existing aggregate. The new resolution table diagnoses lookup behavior but does not duplicate municipality number/name.
- Generate date, release version, resolver results, and counts server-side. Treat browser-supplied categories as untrusted descriptive telemetry and validate every one.

The earlier recommendation remains appropriate: add exactly `public.upload_metric_daily`, `public.municipality_resolution_daily`, and one write RPC named `public.increment_upload_diagnostics`. This is still two new tables and three total tables including the authoritative, unchanged `public.aggregates`. The live findings strengthen the need for an additive design; they do not justify a legacy-table rewrite or a per-upload fact table.

The new structures begin at one explicit production activation date. That date is the instant the richer write is enabled in production, not the migration date, Preview date, first row date, or 2026-07-31 by assumption. It must be stored as a reviewed application configuration value, returned by the statistics API, and shown in Norwegian in every detailed public view. No richer categories may be backfilled or inferred from the 551 historical events.

### Recommended table 1: `public.upload_metric_daily`

Purpose: independent daily distributions for successful-upload technical metrics. One upload increments one row per metric, but rows never link those dimensions to each other.

| Column | Suggested type | Rules |
|---|---|---|
| `date` | `date` | `NOT NULL`; UTC date generated inside RPC |
| `metric_name` | `text` | `NOT NULL`; fixed allowlist below |
| `metric_value` | `text` | `NOT NULL`; fixed value allowlist for its metric, except bounded server release token |
| `count` | `bigint` | `NOT NULL DEFAULT 0 CHECK (count >= 0)` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

Primary key / conflict target:

```text
(date, metric_name, metric_value)
```

Add a read index ordered by metric name, date, and metric value. Its exact DDL belongs in the later reviewed migration, not in this planning report.

Allowed metric/value pairs:

| `metric_name` | Fixed `metric_value` values |
|---|---|
| `file_format` | `gmi`, `sosi`, `kof` |
| `extension_category` | `gmi`, `sos`, `sosi`, `kof`, `txt`, `other`, `none` |
| `file_size_bucket` | `lt_100_kib`, `100_kib_to_lt_1_mib`, `1_mib_to_lt_10_mib`, `10_mib_to_lt_50_mib`, `gte_50_mib` |
| `object_count_bucket` | `1`, `2_to_10`, `11_to_100`, `101_to_1000`, `1001_to_10000`, `gte_10001` |
| `coordinate_count_bucket` | `0`, `1_to_10`, `11_to_100`, `101_to_1000`, `1001_to_10000`, `10001_to_100000`, `gte_100001` |
| `object_mix` | `points_only`, `lines_only`, `points_and_lines` |
| `crs_status` | `declared`, `inferred`, `assumed`, `missing`, `invalid`, `unsupported` |
| `epsg_category` | `epsg_25832`, `epsg_25833`, `epsg_4326`, `other`, `missing` |
| `coordinate_status` | `available`, `no_valid_xy`, `invalid_or_out_of_range`, `crs_missing`, `crs_invalid`, `crs_unsupported` |
| `xy_quality` | `all_objects_have_valid_xy`, `some_objects_missing_valid_xy`, `no_objects_have_valid_xy` |
| `z_quality` | `all_coordinates_have_nonzero_z`, `some_coordinates_missing_or_zero_z`, `all_coordinates_missing_or_zero_z`, `not_applicable` |
| `parser_warning_bucket` | `0`, `1`, `2_to_5`, `gte_6` |
| `parser_warning_class` | `none`, `coordinate`, `geometry`, `field_shape`, `crs`, `multiple`, `other` |
| `app_version` | server-generated token matching a strict pattern such as `^[A-Za-z0-9._-]{1,32}$` |
| `telemetry_schema_version` | server-generated decimal `1` initially |

Implement a database check constraint that validates both `metric_name` and the corresponding values, not just maximum string length. The RPC should be the only service path that inserts these rows.

### Recommended table 2: `public.municipality_resolution_daily`

Purpose: daily diagnosis of municipality resolution, with only a small bounded combination of categories. No coordinate or municipality identity is present.

| Column | Suggested type | Fixed values/rules |
|---|---|---|
| `date` | `date` | `NOT NULL`; UTC date generated inside RPC |
| `file_format` | `text` | `gmi`, `sosi`, `kof` |
| `resolution_outcome` | `text` | allowlist below |
| `primary_result` | `text` | allowlist below |
| `fallback_result` | `text` | allowlist below |
| `count` | `bigint` | `NOT NULL DEFAULT 0 CHECK (count >= 0)` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

Primary key / conflict target:

```text
(date, file_format, resolution_outcome, primary_result, fallback_result)
```

Add one read index ordered by resolution outcome and date, and another ordered by file format and date. Their exact DDL belongs in the later reviewed migration.

Fixed `resolution_outcome` values:

```text
resolved_primary
resolved_fallback
no_coordinate
crs_missing
crs_invalid
crs_unsupported
coordinate_invalid
outside_norway
no_match
timeout
network_failure
upstream_http_failure
invalid_upstream_response
internal_error
```

Fixed primary/fallback result values:

```text
not_attempted
match
no_match
timeout
network_error
http_4xx
http_5xx
invalid_json
invalid_shape
internal_error
```

`outside_norway` should be emitted only when supported by a reliable server-side test. Otherwise use `no_match`; do not create false precision.

### Proposed count-upsert RPC

Add one transactional function for both new tables:

```text
public.increment_upload_diagnostics(
  p_file_format             text,
  p_extension_category      text,
  p_file_size_bucket        text,
  p_object_count_bucket     text,
  p_coordinate_count_bucket text,
  p_object_mix              text,
  p_crs_status              text,
  p_epsg_category           text,
  p_coordinate_status       text,
  p_xy_quality              text,
  p_z_quality               text,
  p_parser_warning_bucket   text,
  p_parser_warning_class    text,
  p_app_version             text,
  p_telemetry_schema_version smallint,
  p_resolution_outcome      text,
  p_primary_result          text,
  p_fallback_result         text
) RETURNS void
```

The function should:

1. Derive `v_date := (now() AT TIME ZONE 'UTC')::date` in the database.
2. Validate every argument again against fixed database allowlists.
3. Upsert the independent metric/value rows into `upload_metric_daily` on their primary key, incrementing `count` by one and refreshing `updated_at` on conflict.
4. Insert one bounded-category row into `municipality_resolution_daily` with the same increment pattern.
5. Execute both new-table changes in the function’s single transaction.

Do not put `public.increment_aggregate` inside this new function. The legacy function must remain callable with its current signature so an application rollback continues to work.

### Security requirements for the later migration

The migration must not rely on current Supabase defaults:

- Disable automatic exposure of new tables before creating either aggregate table.
- Correct default privileges for both `postgres` and `supabase_admin` before creation, but also explicitly set every new object’s privileges in the same reviewed migration. Defaults are not a substitute for object-specific ACLs.
- Create both tables with RLS enabled from the start and no anon/authenticated policies. Forced RLS is unnecessary for this design.
- Grant no table or sequence privileges to `PUBLIC`, `anon`, or `authenticated`. Grant only the minimum read/write rights required by the service-role server path and retain administrative ownership/access for `postgres`.
- Ensure neither table becomes a direct public Data API table endpoint. If the platform cannot combine the `public.*` names with per-object exclusion, stop and revise the schema/API boundary before migration rather than accepting automatic exposure.
- Revoke execute on `increment_upload_diagnostics` from `PUBLIC`, `anon`, and `authenticated`, and explicitly retain it only for `service_role` and `postgres`.
- Keep the new function `SECURITY INVOKER` unless a separately reviewed least-privilege design proves a definer function is necessary. With invoker security, the service role must retain the underlying table rights the function needs.
- Validate the effective API schema and ACLs after the Data API schema reload. Confirm denials using the public anon role and success using the server role without printing either credential.

Because the server needs to call the new RPC, the function may remain reachable as a Data API RPC route, but database execution must be restricted to `service_role` and `postgres`. “Reachable route” must never be confused with “publicly authorized.” The new tables themselves should have no public-client table route or privileges.

### Historical data and detailed-statistics start

- Continue deriving all-time total uploads, first/last dates, daily/hourly history, and municipality history from `public.aggregates`.
- Do not synthesize file format or diagnostics for historical rows. That information does not exist and cannot be inferred safely.
- Define a code constant such as `DETAILED_STATS_START_DATE` equal to the actual production activation date, and return it from `/api/stats` even before the first detailed row exists.
- Present new charts only for dates on or after that date, with explicit Norwegian text that older uploads remain included in totals but lack detail.
- The first date in a new table is not a sufficient deployment marker because the first upload might occur later.

### Rollback

- Application rollback: old code continues writing `aggregates` because its table and RPC were not changed.
- Feature flag: keep the new diagnostic write behind a server-side flag for Preview and staged production activation, while legacy writes remain unconditional.
- New-write failure: never roll back or suppress a successful legacy increment.
- Database rollback: disable the new function’s use or revoke its service grant first. Do not immediately drop the new tables; retain already collected aggregate data until a separate approved retention decision.
- Do not roll back by dropping/recreating `aggregates`, changing its primary key, or rerunning historical normalization SQL.

## 7. Proposed tracking contract

### Exact additional browser fields

Keep existing top-level fields and add one optional, strict object during a compatibility rollout:

```json
{
  "eventType": "upload_success",
  "datasetCoord": null,
  "telemetry": {
    "schemaVersion": 1,
    "fileFormat": "gmi",
    "extensionCategory": "gmi",
    "fileSizeBucket": "100_kib_to_lt_1_mib",
    "objectCountBucket": "101_to_1000",
    "coordinateCountBucket": "1001_to_10000",
    "objectMix": "points_and_lines",
    "crsStatus": "declared",
    "epsgCategory": "epsg_25832",
    "coordinateStatus": "no_valid_xy",
    "xyQuality": "some_objects_missing_valid_xy",
    "zQuality": "some_coordinates_missing_or_zero_z",
    "parserWarningBucket": "1",
    "parserWarningClass": "geometry"
  }
}
```

The enum values are exactly those listed for `upload_metric_daily`. The new object must reject missing required keys, extra keys, arrays, nulls, numeric strings, and unknown categories. `schemaVersion` must be integer `1`. After all deployed clients use it, making `telemetry` required can be considered; initially optional preserves compatibility with an application rollback or cached client.

Logical consistency validation should include:

- `datasetCoord` present only with `coordinateStatus=available`.
- `coordinateStatus=available` requires a supported EPSG category matching `datasetCoord.epsg`.
- `crs_missing`, `crs_invalid`, and `crs_unsupported` coordinate statuses require matching CRS status and `datasetCoord:null`.
- A null coordinate with declared/supported CRS must use `no_valid_xy` or `invalid_or_out_of_range`.
- `fileFormat` must be one of the three successful parser outputs.
- `objectCountBucket` cannot imply zero because current success requires at least one parsed object.
- `objectMix` must be one of the three non-empty combinations.
- Parser error strings, warning strings, field values, filenames, and raw extensions are invalid at the contract level, not merely ignored.

### Fields generated or verified server-side

Generate server-side:

- UTC date/hour for legacy writing and UTC date for new daily writing.
- `eventType` used for persistence after validating it is exactly `upload_success`.
- Municipality location and official number from resolver output.
- `resolution_outcome`, `primary_result`, and `fallback_result` from tagged resolver stages.
- Application release token from a trusted build/server value. A bounded package version or release identifier is appropriate; do not accept Vercel project IDs, deployment URLs, or a browser-provided version.
- Telemetry schema version passed to the database after validating the browser version and server implementation agree.
- Count increment of exactly one.

Verify server-side:

- All current header, origin, media-type, stream, body-size, EPSG, numeric, and coordinate-range rules.
- The complete telemetry key/value allowlists and logical cross-field rules.
- Supplied coordinate EPSG matches `epsgCategory`.
- Resolver output against a strict shape: municipality number format, bounded name length for the legacy table, and fixed source/result enums. Never allow upstream arbitrary keys into the database call.

File size/count buckets are inherently client-reported because file contents must stay in the browser. The server can validate the enum but cannot prove the underlying count without violating the privacy architecture. They must never drive authorization or security decisions.

### Maximum request size

A representative payload using all proposed fields and long category values is approximately 600 UTF-8 bytes, leaving roughly 400 bytes below the current 1,024-byte limit. Keep `TRACKING_MAX_BODY_BYTES = 1024`; do not raise it for this design.

Add a deterministic test that serializes the longest permitted coordinate and longest permitted value for every field and asserts the result remains at or below 1,024 bytes. Preserve early `Content-Length` rejection and streamed byte counting.

### Stable error and write behavior

- Preserve the current 400/403/413/415 messages exactly for policy failures unless a deliberate API version is introduced.
- Continue returning a sanitized 500 for unexpected failures; never return resolver/Supabase messages.
- Prefer a 200 success shape such as `{ ok: true, stored: <legacy>, telemetryStored: <new>, location: ..., resolutionOutcome: <fixed enum> }`.
- The browser must continue treating tracking as best effort.
- Perform the legacy increment first. Attempt the optional new RPC after it, or independently with explicit result handling.
- If the optional RPC fails, return `ok: true` with `telemetryStored: false` as long as request handling itself remains valid. Do not undo the legacy count and do not retry by sending/storing file data.
- If the legacy Supabase write fails, preserve the existing legacy fallback behavior until it is separately redesigned. Do not add per-upload fallback records for the new telemetry.
- Log only fixed internal codes and operation names. Do not log bodies, coordinates, filenames, raw upstream responses, arbitrary parser text, IPs, user agents, or raw exceptions in production telemetry logs.

### Tests required to preserve containment

Extend `trackingRequestPolicy.test.mjs` to cover:

- Every new allowlisted key/value and every rejected unknown/extra value.
- Missing telemetry keys and wrong primitive/container types.
- Cross-field consistency between coordinate, CRS, and EPSG category.
- Unsupported/out-of-range coordinates being represented as null plus a fixed diagnostic, while the legacy increment still occurs.
- Longest valid request remains within 1,024 bytes.
- Oversized/malformed bodies still stop before lookup and either write.
- Resolver result mapping for match, no-match, timeout, network, HTTP, invalid JSON/shape, and internal error without raw detail.
- Legacy increment called exactly once for every accepted successful upload, irrespective of optional new-write success.
- Optional new-write failure returns stable best-effort success and does not affect the browser workflow.
- No test should need or contain real upload data, production coordinates, or credentials.

Existing WMS route, policy, tests, target validation, response containment, and caching must not be edited as part of this feature.

## 8. Proposed public dashboard

### Data/API behavior

- Always derive historical totals and historical municipality activity from the unchanged `aggregates` source.
- Fix legacy reads before adding charts: use deterministic full pagination on `(date, hour, area_type, area_id, event_type)` or a read-only database aggregation RPC/view so the PostgREST row cap cannot truncate totals.
- Query each new aggregate independently and do not join metric dimensions into inferred upload records.
- Return a stable sanitized Norwegian stats error such as `Statistikken er midlertidig utilgjengelig` rather than raw exception text.
- Add explicit cache headers suitable for public aggregates, for example `Cache-Control: public, s-maxage=300, stale-while-revalidate=900`, after verifying deployment behavior.
- Avoid a live Geonorge fan-out on every cold stats request. Prefer a versioned static municipality centroid/reference dataset or a separately cached lookup with bounded concurrency, validation, negative caching, and a longer-lived cache. This does not require or justify any WMS change.
- Do not expose `app_version` breakdown publicly unless there is a concrete public need. It is mainly operational context.

### Norwegian visible wording

Recommended top-level copy:

- Title: **Bruksstatistikk**
- Subtitle: **Aggregert statistikk over registrerte filopplastinger**
- Privacy note: **Ingen filer, filnavn, nøyaktige koordinater eller personopplysninger lagres i statistikken.**
- Historical/detail note: **Alle registrerte opplastinger er med i totaltallene. Detaljert statistikk er tilgjengelig fra {dato}.**

Recommended overall cards:

- **Registrerte filopplastinger**
- **Kommuner med registrert aktivitet**
- **Dager med registrerte opplastinger**
- **Mest aktive klokkeslett (UTC)**

Avoid “brukere”, “unike brukere”, “besøkende”, or similar. The measurement unit is upload events. “Kommuner med registrert aktivitet” is clearer than implying unique people; “unike kommuner” is not incorrect, but the former wording is more explicit.

Recommended sections:

1. **Opplastinger over tid** — all historical legacy counts.
2. **Kommuneaktivitet over tid** — existing municipality timeline, with unknown excluded from municipality ranking and shown separately.
3. **Opplastinger per kommune** — counts of upload events, not users.
4. **Filformater** — **GMI**, **SOSI**, **KOF**; detailed period only.
5. **Filstørrelser** — labels such as **Under 100 KiB**, **100 KiB–1 MiB**, **1–10 MiB**, **10–50 MiB**, **50 MiB eller mer**.
6. **Datamengde** — object and coordinate buckets, with explanatory text that these are coarse ranges.
7. **Koordinatsystem** — **Oppgitt i filen**, **Utledet**, **Valgt av bruker**, **Manglet**, **Ugyldig**, **Ikke støttet**.
8. **Kommune ikke fastslått** — total unknown count and share for the detailed period.
9. **Årsaker til ukjent kommune** — fixed diagnostic labels below.

Norwegian diagnostic labels:

| Internal category | Public label |
|---|---|
| `no_coordinate` | Ingen brukbar koordinat |
| `crs_missing` | Koordinatsystem manglet |
| `crs_invalid` | Ugyldig koordinatsystem |
| `crs_unsupported` | Koordinatsystem støttes ikke |
| `coordinate_invalid` | Ugyldig eller utenfor gyldig koordinatområde |
| `outside_norway` | Koordinaten ligger utenfor Norge |
| `no_match` | Ingen kommune funnet i oppslagene |
| `timeout` | Oppslaget brukte for lang tid |
| `network_failure` | Nettverksfeil mot oppslagstjenesten |
| `upstream_http_failure` | Oppslagstjenesten svarte med feil |
| `invalid_upstream_response` | Ugyldig svar fra oppslagstjenesten |
| `internal_error` | Intern feil under kommuneoppslag |

Resolved categories can be summarized as:

- `resolved_primary`: **Kommune funnet i hovedoppslaget**
- `resolved_fallback`: **Kommune funnet i reserveoppslaget**

For dates before detailed telemetry, show **Årsak ikke registrert før {dato}** rather than treating historical unknowns as a failure category.

The existing `source` badge is implementation detail and can be removed from the public UI. If retained for diagnostics, label it **Datakilde**, as today, but never allow fallback selection to make a tiny local sample look like the production historical total without a visible availability warning.

## E. Revised rollout order

Security hardening should be its own small change before telemetry work. It has a narrower review surface, reduces the current anonymous-modification risk immediately, and provides safe defaults before any new database object exists.

1. **Supabase security hardening**
   - Review and execute only the sequence in section C: capture the aggregate/configuration baseline, disable automatic exposure of new tables, correct default privileges for both object creators, revoke legacy table access from anon/authenticated, revoke all three RPC overloads from `PUBLIC`/anon/authenticated, and then enable non-forced RLS as a separately verified defense-in-depth step.
   - Retain the current nine-parameter RPC and exact service-role/postgres access. Do not remove existing Data API objects until compatibility with the server’s Data API client is proven.
   - Treat this as a small production security change with an explicit rollback window; do not combine it with telemetry schema or application code.

2. **Verify that the live application still records uploads**
   - After the permission changes and Data API schema reload, perform one normal production upload with a safe synthetic fixture through the application.
   - Verify that the legacy upload total increases exactly once from the immediately preceding baseline, the new row/update has the expected current date/hour category, `/api/stats` still includes all history, and the public dashboard renders.
   - Verify separately that anon direct table reads/writes and anon calls to every overload are denied, while the service-role server path succeeds. Stop here if any result differs.

3. **Create the new aggregate tables and RPC**
   - Draft a separate reviewed additive migration for only `upload_metric_daily`, `municipality_resolution_daily`, their constraints/indexes/RLS/ACLs, and `increment_upload_diagnostics`.
   - Apply and validate it in a non-production Supabase project first. Confirm that defaults and automatic exposure do not leak either new table and that only service-role/postgres can execute the RPC.
   - Apply the reviewed additive migration to production with the new application write still disabled. Do not alter or backfill `public.aggregates`, and do not activate the detailed-start date yet.

4. **Application implementation**
   - Centralize fixed format/CRS/coordinate classifications, add structured warning codes without raw parser text, extend the strict 1,024-byte request contract, and refactor municipality resolution to fixed tagged results.
   - Preserve the unconditional legacy increment first; call the new RPC as an independent best-effort write behind a server-side feature flag.
   - Add full pagination or safe database-side aggregation for legacy statistics, sanitized Norwegian errors, tests for every allowlist and failure mapping, and a fixed configuration value for the eventual activation date.
   - Keep new dashboard panels hidden until production activation. Leave WMS files unchanged.

5. **Preview testing**
   - Deploy to Vercel Preview with richer writes disabled against production, or enabled only against the non-production database.
   - Use synthetic GMI/SOSI/KOF fixtures to exercise every bucket and resolution outcome. Verify request size, strict validation, best-effort failure behavior, legacy single increment, new atomic increments, pagination beyond 1,000 rows, cache behavior, and absence of prohibited data in requests, storage, responses, and logs.
   - Verify all user-facing text is Norwegian, including errors, empty states, privacy wording, and the detailed-period explanation.

6. **Production activation**
   - Deploy code capable of legacy-only operation first and verify it with the richer feature flag off.
   - Set the detailed-statistics activation date to the actual production enablement date, then enable the new write. Do not infer the date from the first new row.
   - Verify legacy and new increments independently. Monitor only fixed aggregate outcomes and storage-success indicators. If the new write fails, disable it or roll back the application while legacy recording continues.

7. **Public dashboard improvements**
   - Once production data is verified, enable the Norwegian detailed panels for dates on or after the activation date.
   - Continue showing every historical upload and municipality result from `public.aggregates`, including all pre-activation history. Clearly state that detailed categories begin on the activation date and do not label historical unknowns with causes that were never recorded.
   - Verify the public API never exposes server credentials, raw database errors, prohibited telemetry, or implementation-only release details.

## F. Verification checklist

Use a timestamped immediate pre-change baseline so legitimate uploads during the verification window are distinguishable from drift. The confirmed historical reference remains 551 upload events until a later upload occurs.

- [ ] Before any later upload, `upload_success` still totals exactly 551 events across 299 aggregate rows, spanning 2026-02-11 through 2026-07-31.
- [ ] The 67 historical unknown events, 484 known events, municipality totals, 124 health-check events, and all existing rows remain unchanged by security and additive-schema work.
- [ ] One normal production upload through the application increments legacy `upload_success` exactly once from the immediate pre-upload total.
- [ ] The service-role server write through the current nine-parameter overload still succeeds after table grants, function grants, RLS, and the Data API schema reload are applied.
- [ ] `/api/stats` and the public dashboard still read and display all historical data from `public.aggregates`; they do not switch silently to the small local fallback.
- [ ] Direct anon and authenticated `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and other table operations on `public.aggregates` are denied. Production verification of destructive privilege classes uses metadata/non-destructive checks rather than a destructive request.
- [ ] Direct anon and authenticated calls to all three `increment_aggregate` overloads are denied, including denial inherited through `PUBLIC`.
- [ ] The seven- and eight-parameter overloads remain denied during their compatibility window and are later removed only by exact signature after the rollback window closes.
- [ ] Automatic exposure of new tables is disabled and corrected defaults apply to objects created by both `postgres` and `supabase_admin`.
- [ ] `public.upload_metric_daily` and `public.municipality_resolution_daily` are not exposed or authorized as public-client table endpoints and have no anon/authenticated privileges or policies.
- [ ] `public.increment_upload_diagnostics` is executable only by `service_role` and `postgres`; `PUBLIC`, `anon`, and `authenticated` cannot execute it.
- [ ] The new RPC increments only fixed allowlisted aggregate categories, uses a database-derived UTC date, and rejects unknown or inconsistent categories without storing partial data.
- [ ] A failed new diagnostic write does not undo, duplicate, or suppress the legacy increment.
- [ ] No migration updates, deletes, normalizes, re-keys, truncates, or backfills `public.aggregates`; a post-change aggregate comparison confirms historical data is unchanged.
- [ ] The detailed-statistics activation date equals the actual production enablement date and all pre-activation uploads remain visible only through the historical legacy views.
- [ ] Every user-facing label, explanation, empty state, and error remains Norwegian. Internal identifiers may remain English.
- [ ] No files, filenames, exact coordinates, bounding boxes, exact file sizes, exact object/coordinate counts, arbitrary parser text, raw errors/warnings, headers, project IDs, identities, IP addresses, user agents, or per-upload records appear in requests, database rows, API responses, or logs.

## G. Risk and rollback analysis

| Risk | Prevention and detection | Safe rollback |
|---|---|---|
| Production outage during hardening | Preserve the nine-parameter function and service-role rights; change one control at a time; smoke-test legacy upload and dashboard after each checkpoint; do not remove the legacy API objects while the server depends on them. | Restore only the missing service-role privilege or required service API exposure. Do not restore anon/authenticated access. If RLS is the cause, temporarily disable RLS while keeping explicit revocations. |
| Accidental historical data loss | Hardening changes only access controls/settings. The additive migration creates new objects and never modifies `aggregates`. Compare the 551-event baseline and category totals before and after. | Stop immediately. Do not recreate or normalize the legacy table. Recover through the project’s approved backup/point-in-time process only after a separate incident review. |
| Anonymous modification before hardening | Treat current ACL/API state as an active authorization gap; keep the hardening change small and first in sequence. Verify both table and RPC denials, including `PUBLIC`. | There is no rollback benefit to reopening anonymous access. If application access fails, repair the service path only. Investigate unexplained baseline drift without claiming abuse absent evidence. |
| Stale browser or server clients | Browser clients call the application API, not the RPC, and initial telemetry is optional. Keep the current nine-parameter overload. Hold the eight-parameter overload denied-but-present for a short declared rollback window. | Roll back application code to legacy-only behavior. Extend the eight-parameter compatibility window only if a known server rollback target needs it; never regrant it to public clients. |
| Application rollback | Legacy write remains unconditional and independent; no legacy signature/table change is part of telemetry. New UI and write are feature-flagged. | Disable the richer write/dashboard flag or redeploy the legacy-capable version. Continue using `aggregates`; retain already collected daily aggregates. |
| Database rollback | Use additive objects and checkpointed security operations. Avoid combining security and telemetry in one change. | For telemetry, revoke/stop use of the new RPC and retain the new aggregate rows pending an approved retention decision. For hardening, fix service-only access rather than reverting to broad defaults. Never drop/recreate `aggregates` as rollback. |
| New telemetry failure or partial data | Legacy increment occurs first and independently. The new RPC updates both new tables transactionally, reports only a fixed success flag, and is monitored from the activation date. | Disable the new write flag. Mark the affected detailed period as unavailable/incomplete in Norwegian; do not infer or backfill missing detail. Legacy totals continue. |
| Data API caching/schema reload | Plan a supported PostgREST schema reload after ACL/function/exposure changes and repeat allowed/denied tests until results are consistent. | Pause rollout and wait/reload according to supported Supabase operations. Do not issue broader grants merely to work around stale schema metadata. |
| Obsolete overload ambiguity | Revoke all public execution first. Identify functions by full argument signature. The incompatible seven-parameter function is removed after the current path is verified; the eight-parameter function is removed after the rollback window. | If a known server rollback target truly requires the eight-parameter function, restore service-role execution for only that exact signature temporarily. Do not restore `PUBLIC`, anon, or authenticated execution, and do not retain the broken seven-parameter overload. |

The largest immediate risk is anonymous modification under the current confirmed authorization state. The largest rollout risk is accidentally removing or denying the Data API path that the server itself uses. The staged sequence addresses both without touching historical rows.

## H. Final recommendation

Approve security hardening as a separate, first change. Do not begin the richer telemetry migration until the current server-only path has been hardened and a real application upload plus the historical dashboard have passed the post-change verification checklist.

The exact next safe action after this report is reviewed is to prepare a small, peer-reviewed Supabase hardening runbook/change for non-production validation first. It must implement the section C sequence, beginning with a fresh private baseline and correction of automatic exposure/default privileges, then revoke anon/authenticated table rights and `PUBLIC`/anon/authenticated execution on all three overloads while preserving `service_role` and `postgres`. It must include checkpoint verification, Data API schema reload handling, and service-only rollback. No telemetry tables or application changes belong in that change.

The recommended table count has not changed: add two aggregate tables—`public.upload_metric_daily` and `public.municipality_resolution_daily`—for three total including the authoritative `public.aggregates`. Their migration comes only after hardening and must explicitly override unsafe defaults and exposure.

### Review handoff

- **Files changed by this planning task:** only `docs/agent-reports/20260731-richer-usage-statistics-design.md`.
- **Application code or external systems changed:** none. No SQL was run, no Supabase/Vercel setting changed, and no migration, commit, push, or deployment was performed.
- **Recommended table count changed:** no; two new aggregate tables, three total including `public.aggregates`.
- **Should security hardening precede telemetry implementation:** yes, as its own small reviewed and verified change.
- **Exact next safe action:** prepare and peer-review the narrowly scoped Supabase hardening runbook/change described above, validate it in non-production, and do not create telemetry objects until its production service-path verification succeeds.
