# Richer upload telemetry database implementation

**Implementation date:** 2026-08-07

**Stage:** 1, additive database contract only

**Status:** SQL and static contract tests are checked in. The SQL has not been run against either Supabase project.

## 1. Scope

This stage implements only the additive database contract for future richer upload telemetry:

- `public.upload_metric_daily`;
- `public.municipality_resolution_daily`; and
- `public.increment_upload_diagnostics(...)`.

It does not wire telemetry into the application, change the tracking request contract, change municipality resolution, change `/api/stats`, change the public statistics UI, or enable richer telemetry in any environment.

No Supabase connection, database execution, Vercel change, deployment, commit, push, merge, or PR was performed for this implementation.

## 2. Documents and code reviewed

The following were reviewed before implementation:

- `docs/agent-reports/20260731-richer-usage-statistics-design.md`;
- `docs/agent-reports/20260731-supabase-access-hardening-runbook.md`;
- `docs/agent-reports/20260807-supabase-hardening-validation.md`;
- `docs/agent-reports/20260807-supabase-production-hardening-execution.md`;
- `src/features/user-tracking/supabase.sql`;
- the other SQL and documentation files under `src/features/user-tracking/`;
- `src/lib/tracking/supabase.js`;
- `src/lib/tracking/aggregates.js`;
- `README.md`;
- `src/features/user-tracking/README.md`;
- `package.json`; and
- the existing tests under `tests/`.

`AGENTS.md` was checked at the repository root and through the repository tree; no such file is present.

The existing SQL uses manually reviewed setup scripts. The new script deliberately does not copy the legacy script's `CREATE OR REPLACE FUNCTION` behavior for the new RPC.

## 3. Reconciliation with completed hardening

The July design remains the architectural basis for two independent daily aggregate tables and one transactional write RPC. The later August validation and production execution records take precedence for access control:

- production automatic exposure of new tables is already OFF;
- `postgres` defaults were hardened against `PUBLIC`, `anon`, and `authenticated` inheritance;
- managed `supabase_admin` defaults remain outside normal hosted operator control and are not altered here; and
- every new object receives explicit object-specific ACL statements rather than relying on defaults.

The new SQL does not repeat dashboard exposure changes or default-privilege changes. It does not alter the ACL of any existing object.

## 4. SQL file created

Created:

`src/features/user-tracking/supabase_richer_usage_diagnostics.sql`

The script is additive and wrapped in one transaction. It uses plain `CREATE TABLE` and `CREATE FUNCTION` statements, not `IF NOT EXISTS` or `CREATE OR REPLACE`. It is therefore a one-time reviewed setup script: an existing object or signature collision fails visibly rather than silently accepting an incompatible object. The script contains no cleanup, drop, backfill, normalization, re-keying, or legacy-object mutation operation.

## 5. Table contracts

### 5.1 `public.upload_metric_daily`

The table contains exactly the independent daily counter dimensions and timestamps required by the design:

| Column | Contract |
|---|---|
| `date` | `date NOT NULL`, derived as the UTC date inside the RPC |
| `metric_name` | `text NOT NULL`, fixed metric category |
| `metric_value` | `text NOT NULL`, fixed value for the corresponding metric |
| `count` | `bigint NOT NULL DEFAULT 0 CHECK (count >= 0)` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` |

The primary key is `(date, metric_name, metric_value)`. The read index is `(metric_name, date, metric_value)`.

The database check constraint covers the complete fixed domains for file format, extension category, file-size bucket, object-count bucket, coordinate-count bucket, object mix, CRS status, EPSG category, coordinate status, XY quality, Z quality, parser-warning bucket, and parser-warning class. `app_version` is limited to the strict bounded token pattern `[A-Za-z0-9._-]{1,32}`. `telemetry_schema_version` is represented by the fixed value `1`.

Each upload contributes one independent counter row per metric. The table does not combine all metric dimensions into one upload-identifying row.

### 5.2 `public.municipality_resolution_daily`

The table contains:

| Column | Contract |
|---|---|
| `date` | `date NOT NULL`, derived as the UTC date inside the RPC |
| `file_format` | `text NOT NULL`, one of `gmi`, `sosi`, `kof` |
| `resolution_outcome` | `text NOT NULL`, fixed resolution outcome |
| `primary_result` | `text NOT NULL`, fixed primary lookup result |
| `fallback_result` | `text NOT NULL`, fixed fallback lookup result |
| `count` | `bigint NOT NULL DEFAULT 0 CHECK (count >= 0)` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` |

The primary key is `(date, file_format, resolution_outcome, primary_result, fallback_result)`. The read indexes are `(resolution_outcome, date)` and `(file_format, date)`.

Database checks enforce the fixed domains for all three diagnostic categories. The table stores no municipality number, municipality name, coordinate, URL, response body, status text, exception text, or arbitrary upstream value.

## 6. RPC contract

The new exact function is:

```text
public.increment_upload_diagnostics(
  p_file_format text,
  p_extension_category text,
  p_file_size_bucket text,
  p_object_count_bucket text,
  p_coordinate_count_bucket text,
  p_object_mix text,
  p_crs_status text,
  p_epsg_category text,
  p_coordinate_status text,
  p_xy_quality text,
  p_z_quality text,
  p_parser_warning_bucket text,
  p_parser_warning_class text,
  p_app_version text,
  p_telemetry_schema_version smallint,
  p_resolution_outcome text,
  p_primary_result text,
  p_fallback_result text
) RETURNS void
```

The function is PL/pgSQL and explicitly `SECURITY INVOKER`. It derives the date with `(now() AT TIME ZONE 'UTC')::date`, validates every argument before writing, rejects invalid app versions and schema versions, increments fifteen independent metric rows, and increments exactly one municipality-resolution row.

Both inserts use `INSERT ... ON CONFLICT ... DO UPDATE`, incrementing `count` by one and refreshing `updated_at`. They execute within the function's single caller transaction. The function does not call or reference `public.increment_aggregate`, and it emits only one fixed validation error without persisting arbitrary details.

No cross-field semantics beyond the reviewed fixed domains were invented in the database contract. Later application work must produce coherent category combinations and a trusted bounded app version.

## 7. ACL and security behavior

For each new table, the script explicitly:

- revokes all table privileges from `PUBLIC`;
- revokes all table privileges from `anon`;
- revokes all table privileges from `authenticated`;
- revokes all table privileges from `service_role` to clear broader inherited/current table rights; and
- grants only `SELECT`, `INSERT`, and `UPDATE` to `service_role`.

The minimum service-role table set supports SECURITY INVOKER `INSERT ... ON CONFLICT DO UPDATE` operation and later server-side reads. `postgres` owner powers are not reduced.

For the exact new RPC signature, the script explicitly revokes `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`, resets the existing `service_role` function privileges, and grants only `EXECUTE` to `service_role`. `postgres` retains owner control.

The script contains no `ALTER DEFAULT PRIVILEGES`, no `supabase_admin` operation, no role membership change, no ownership change, and no privilege-escalation workaround.

## 8. RLS decision

The two new tables are created with ordinary RLS enabled and without any policies. FORCE RLS is not enabled.

This is an additive defense-in-depth decision supported by the isolated validation record: the server-side service credential successfully read and invoked an invoker RPC against an RLS-enabled table in the disposable validation project. That compatibility evidence is not runtime proof for these new production objects; it is the reason this reviewed contract retains RLS rather than silently omitting it.

The distinction from the legacy table is intentional:

- `public.aggregates` remains unchanged with RLS disabled;
- the two new tables start with ordinary RLS enabled; and
- no public policies are created.

## 9. Explicit legacy-object boundary

`public.aggregates` is untouched by the new SQL. The script does not alter, normalize, delete from, truncate, backfill, re-key, recreate, or otherwise mutate it.

The script does not drop, replace, alter, or grant/revoke privileges on any existing `public.increment_aggregate` overload. The existing nine-parameter application RPC and the two obsolete overloads remain outside this stage.

## 10. Application telemetry is not enabled

No application file was changed. In particular, this stage does not:

- extend `FileUpload` telemetry;
- change `trackingRequestPolicy`;
- change municipality resolver behavior;
- invoke the new RPC from JavaScript;
- add feature flags or an activation-date constant;
- change `/api/stats`, `StatsModal`, health, keepalive, cron, WMS, or deployment behavior; or
- enable richer telemetry in Preview or production.

The new tables and RPC will remain unused until a separately reviewed application implementation and activation plan exists.

## 11. Static tests and validation

Created `tests/richerUsageTelemetryDatabaseContract.test.mjs`. It reads the checked-in SQL only and does not connect to a database. The nine tests verify:

- exactly the two intended table names are created;
- the exact 18-argument RPC signature, PL/pgSQL language, SECURITY INVOKER mode, and UTC date expression are represented;
- the legacy table and all existing `increment_aggregate` overloads are absent from the new script;
- fixed table domains, non-negative count checks, app-version validation, and schema version `1` are represented;
- required indexes and two transactional conflict upserts exist;
- RLS is enabled for the new tables without FORCE or policies;
- public-client and service-role table ACL resets occur before the minimum grants;
- public-client RPC privileges are revoked and service-role execution is granted; and
- managed defaults and obvious prohibited per-upload columns are absent.

The static checks are contract checks, not PostgreSQL runtime verification. They do not prove effective privileges, RLS behavior, SQL parsing, Data API behavior, or transaction behavior in a live database.

## 12. Limitations

- The SQL has not been run against the disposable or production Supabase project.
- The repository has no migration framework or generated database schema/types, so manual review and non-production execution remain required.
- The script is intentionally one-time and fail-obvious; it must not be rerun against an environment where these objects already exist without a separate reviewed decision.
- Application code does not yet generate or validate the richer categories, trusted app version, resolver result tags, or eventual activation date.
- No historical telemetry is backfilled or inferred from `public.aggregates`.
- Existing public schema/Data API architecture is not changed by this stage; later non-production verification must confirm that the new objects are not publicly authorized through the available routes.
- The managed `supabase_admin` default boundary remains a hosted-platform limitation. Explicit object ACLs in this script are the protection for these objects.

## 13. Recommended non-production Supabase validation

The next validation must use only the disposable Supabase project, not production, and must not record credentials or private data.

1. Confirm that neither new table nor the new function exists in the disposable project, and capture read-only metadata for the existing legacy table and all three existing `increment_aggregate` signatures.
2. Review and execute the new SQL file as one transaction. Do not run it against production or alter any managed default ACL.
3. Inspect both new tables through `information_schema` and PostgreSQL catalogs. Confirm the exact columns, nullability, defaults, primary keys, non-negative count checks, fixed value checks, and all three requested indexes.
4. Confirm `relrowsecurity = true`, `relforcerowsecurity = false`, and zero policies for both new tables.
5. Inspect raw and effective ACLs for `PUBLIC`, `anon`, `authenticated`, `service_role`, and `postgres`. Confirm no public-client table privileges, only `SELECT`/`INSERT`/`UPDATE` for `service_role`, and owner access for `postgres`.
6. Inspect the exact new function identity, owner, volatility, language, SECURITY INVOKER mode, settings, and ACL. Confirm only `service_role` and owner `postgres` can execute it.
7. Call the new RPC once with a fully valid synthetic category set. Confirm the current UTC date, fifteen independent metric rows, one resolution row, and count `1` in each expected key.
8. Call the same valid synthetic payload again. Confirm the same keys reach count `2`, no extra dimension-linking rows appear, and `updated_at` changes without replacing `created_at`.
9. Repeat validation with invalid or null values for every category family, an overlong or invalid-character app version, and a schema version other than `1`. Require the fixed validation error and verify that an invalid call creates no partial rows.
10. Attempt invalid direct inserts in the disposable project to confirm the table check constraints reject unknown metric/value pairs, invalid resolution/result values, and negative counts. Do not use direct inserts as the application design.
11. Use the disposable anonymous public-client path to confirm both table reads and the new RPC are denied. Use the server service credential to confirm the allowed table reads and RPC call still work under RLS.
12. Recheck the legacy table metadata, row counts, RLS state, policy inventory, all three legacy function definitions, and their ACLs before and after. Require no change.
13. Record only aggregate/configuration results, never keys, URLs, tokens, request headers, upload filenames, file contents, coordinates, or private identifiers.

These steps should be performed one checkpoint at a time with a peer review of any unexpected result. Runtime verification must not be inferred from the static tests.

## 14. Production rollout boundary

This database contract is not production authorization. A later production migration requires a separate reviewed session after disposable validation succeeds. That session must:

- run only the reviewed additive objects and explicit ACLs;
- keep the richer application write disabled;
- leave `public.aggregates` and every existing `increment_aggregate` overload unchanged;
- preserve the completed hardening state, including no managed-default changes;
- verify the new object metadata, ACLs, RLS, and server-only RPC path; and
- record a fresh production result without credentials or row-level upload data.

Application wiring, activation date, feature rollout, detailed statistics, and public UI changes belong to later stages and are not implied by creating these unused database objects.

## 15. Files changed

- `src/features/user-tracking/supabase_richer_usage_diagnostics.sql`
- `tests/richerUsageTelemetryDatabaseContract.test.mjs`
- `docs/agent-reports/20260807-richer-upload-telemetry-database-implementation.md`

No application source, existing SQL, configuration, environment, package, deployment, or public UI file was changed.
