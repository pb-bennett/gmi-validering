# Supabase production hardening execution record

**Execution date:** 2026-08-07

**Scope:** First production Supabase access-hardening session

**Procedural record:** `docs/agent-reports/20260731-supabase-access-hardening-runbook.md`

**Prior validation record:** `docs/agent-reports/20260807-supabase-hardening-validation.md`

## 1. Purpose and scope

This report records the first production Supabase access-hardening session that was executed manually and completed successfully on 2026-08-07.

The earlier validation record covered a disposable hardening project. It validated the proposed ACL behavior, application compatibility, and the separate RLS experiment; it did not authorize or perform production changes. The runbook remained the procedural record for the production session. This document records what was actually executed and observed in production.

The completed production scope was:

- disable **Automatically expose new tables**;
- correct controllable `postgres` default ACLs at global and `public`-schema scope;
- reduce the existing `public.aggregates` table ACL to the required server privileges;
- revoke public-client execution on all three exact `increment_aggregate` overloads while retaining `service_role` execution; and
- verify database privileges, application reads, anonymous Data API denial, one accounted application write, statistics readback, and frozen historical-data integrity.

## 2. Safety boundary

The production project was opened manually and confirmed to be the real production project, not the disposable hardening test project.

No automatic security-advisor fixes were used. No credentials, tokens, URLs, project identifiers, request identifiers, cookies, filenames, file contents, coordinates, or private identifiers are recorded here.

The production session did not enable RLS, add policies, drop or replace functions, change application code, change SQL files or migrations, change configuration or environment files, change package files or tests, change deployment settings, or perform an anonymous production write or RPC probe.

## 3. Pre-change production state

### 3.1 Roles

The preflight role checks returned:

| Role | `rolcanlogin` | `rolbypassrls` |
|---|---:|---:|
| `anon` | false | false |
| `authenticated` | false | false |
| `postgres` | true | true |
| `service_role` | false | true |
| `supabase_admin` | true | true |

### 3.2 Existing table

Before hardening, `public.aggregates` was owned by `postgres`, with RLS disabled and forced RLS disabled.

Raw ACL:

```text
postgres=arwdDxtm/postgres
anon=arwdDxtm/postgres
authenticated=arwdDxtm/postgres
service_role=arwdDxtm/postgres
```

The effective checks showed that `anon`, `authenticated`, and `service_role` each had `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, and `MAINTAIN`. `postgres` had owner privileges.

There were no RLS policies on `public.aggregates`.

### 3.3 RPC inventory

The inventory contained exactly these three overloads:

```text
public.increment_aggregate(date, text, text, text, text, text, text)
public.increment_aggregate(date, smallint, text, text, text, text, text, text)
public.increment_aggregate(date, smallint, text, text, text, text, text, text, text)
```

All three were owned by `postgres`, `SECURITY INVOKER`, volatile, and had no custom function settings. Before hardening, `PUBLIC`, `anon`, `authenticated`, `service_role`, and `postgres` could execute them.

### 3.4 Data API setting

Before the dashboard change, production showed:

- 2 of 2 schemas exposed;
- 1 of 1 tables exposed;
- 1 of 1 functions exposed;
- **Automatically expose new tables:** ON; and
- **Max rows:** 1000.

### 3.5 Aggregate baselines

The pre-hardening P9 baseline was:

| Metric | Value |
|---|---:|
| `all_rows` | 432 |
| `all_events` | 687 |
| `upload_rows` | 304 |
| `upload_events` | 556 |
| `health_rows` | 128 |
| `health_events` | 131 |
| `first_date` | 2026-02-11 |
| `last_date` | 2026-08-07 |

The frozen-history P10 baseline was:

| Metric | Value |
|---|---:|
| `excluded_current_utc_date` | 2026-08-07 |
| `historical_rows` | 430 |
| `historical_events` | 685 |
| `historical_fingerprint` | `e8a9f3795f8015a964ab8b03497b52b4` |

## 4. Actions executed

### 4.1 Data API dashboard setting

Only **Automatically expose new tables** was changed, from ON to OFF.

No exposed schema, table, function, search path, Max rows, or other Data API setting was changed. Immediately afterward, the live production statistics UI still reported `Datakilde: Supabase`, showing that the existing server Data API path remained functional.

### 4.2 `postgres` default ACL corrections

The following six actions were executed successfully, one at a time, with verification between steps:

1. Revoke all table privileges from `PUBLIC`, `anon`, and `authenticated` in the global `postgres` defaults.
2. Revoke all sequence privileges from `PUBLIC`, `anon`, and `authenticated` in the global `postgres` defaults.
3. Revoke function `EXECUTE` from `PUBLIC`, `anon`, and `authenticated` in the global `postgres` defaults.
4. Revoke all table privileges from `PUBLIC`, `anon`, and `authenticated` in the `postgres` defaults for schema `public`.
5. Revoke all sequence privileges from `PUBLIC`, `anon`, and `authenticated` in the `postgres` defaults for schema `public`.
6. Revoke function `EXECUTE` from `PUBLIC`, `anon`, and `authenticated` in the `postgres` defaults for schema `public`.

### 4.3 Existing table ACL

The following transaction was executed successfully:

```sql
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE public.aggregates
  FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.aggregates
  FROM service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.aggregates
  TO service_role;

COMMIT;
```

### 4.4 RPC ACLs

The three exact overloads were hardened individually. For each identity, `EXECUTE` was revoked from `PUBLIC`, `anon`, and `authenticated`, and retained or granted for `service_role`. Each overload was verified before proceeding to the next. `postgres` retained owner execution.

No overload was dropped or replaced.

## 5. Default ACL results

Final verification showed no `PUBLIC`, `anon`, or `authenticated` defaults remaining for `postgres`-created tables, sequences, or functions at the inspected global and `public`-schema scopes.

Observed residual `postgres`-owned defaults included:

- future `public` tables: `postgres` owner/default privileges, with `service_role` retaining `MAINTAIN`, `REFERENCES`, `TRIGGER`, and `TRUNCATE`;
- future `public` sequences: `postgres` `SELECT`/`UPDATE`/`USAGE`, with `service_role` `UPDATE`; and
- future `postgres`-created functions: `postgres` `EXECUTE`, with no inherited `service_role` `EXECUTE`.

These are observed residual privileges. Their complete cause is not asserted. In particular, the residual `service_role` defaults are not attributed to one specific mechanism.

Broad `supabase_admin`-owned defaults remained visible and unchanged. The hosted-platform restriction in the runbook was followed: those defaults were inspected only, and no attempt was made to alter them.

## 6. Existing table ACL results

The effective result after hardening was:

| Role | Schema `USAGE` | `SELECT` | `INSERT` | `UPDATE` | `DELETE` | `TRUNCATE` | `REFERENCES` | `TRIGGER` | `MAINTAIN` |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `anon` | true | false | false | false | false | false | false | false | false |
| `authenticated` | true | false | false | false | false | false | false | false | false |
| `service_role` | true | true | true | true | false | false | false | false | false |
| `postgres` | true | true | true | true | true | true | true | true | true |

The final raw ACL was:

```text
postgres=arwdDxtm/postgres
service_role=arw/postgres
```

The expanded ACL contained only owner privileges for `postgres` and `INSERT`, `SELECT`, and `UPDATE` for `service_role`. No `anon` or `authenticated` table ACL remained.

## 7. RPC ACL results

All three exact overloads remained present with unchanged metadata:

- owner `postgres`;
- `SECURITY INVOKER`;
- volatile; and
- no custom function settings.

The final effective execution state for every overload was:

| Role | `EXECUTE` |
|---|---:|
| `anon` | false |
| `authenticated` | false |
| `service_role` | true |
| `postgres` | true |

The final raw function ACL for each overload was:

```text
postgres=X/postgres
service_role=X/postgres
```

## 8. Application verification

The application uses the server-side Supabase path for reads and the current nine-parameter RPC for tracking writes. The repository implementation can fall back to local storage, so response success was interpreted together with the reported source and direct aggregate counts.

Immediately after table ACL hardening, read-only `GET /api/track/health` returned:

```text
ok true
configured true
keepaliveConfigured true
canQuery true
sample date 2026-02-11
wrote false
```

After all RPC ACL changes, the seven-, eight-, and nine-parameter checkpoints each retained:

```text
/api/stats: source = supabase
totalUploads = 556
```

The formal post-hardening read checks returned:

```text
GET /api/track/health
ok true
configured true
keepaliveConfigured true
canQuery true
sample date 2026-02-11
wrote false
```

```text
GET /api/stats
ok true
source supabase
totalUploads 556
uniqueKommuner 11
activeDays 103
firstDate 2026-02-11
lastDate 2026-08-07
```

Immediately before the intentional application upload, P9 was unchanged from the pre-hardening baseline, and P10 remained exactly:

```text
excluded_current_utc_date = 2026-08-07
historical_rows = 430
historical_events = 685
historical_fingerprint = e8a9f3795f8015a964ab8b03497b52b4
```

## 9. Anonymous Data API denial verification

Immediately before this test, current Supabase documentation semantics were checked. A Publishable-key request without an authenticated user JWT or session represents anonymous public-client access.

Using the production Publishable key in a read-only Data API request without an end-user Authorization/JWT, the request to the `aggregates` resource returned:

- HTTP 401 Unauthorized;
- PostgREST code `42501`;
- `permission denied for table aggregates`; and
- no row data.

No anonymous production write or RPC probe was attempted.

## 10. Smoke upload verification

One approved, non-sensitive GMI file was uploaded once through the normal production application UI. No RPC was called directly.

The immediate post-upload P9 result was:

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| `all_rows` | 432 | 433 | +1 |
| `all_events` | 687 | 688 | +1 |
| `upload_rows` | 304 | 305 | +1 |
| `upload_events` | 556 | 557 | +1 |
| `health_rows` | 128 | 128 | 0 |
| `health_events` | 131 | 131 | 0 |
| `first_date` | 2026-02-11 | 2026-02-11 | unchanged |
| `last_date` | 2026-08-07 | 2026-08-07 | unchanged |

The `upload_events`, `all_events`, and `upload_rows` deltas were each exactly `+1`; health events were unchanged. This proves the real production application wrote through the hardened current RPC.

## 11. Statistics readback

After the smoke upload, `GET /api/stats` returned:

```text
ok true
source supabase
totalUploads 557
uniqueKommuner 11
activeDays 103
firstDate 2026-02-11
lastDate 2026-08-07
```

The `source: supabase` result and total increase from 556 to 557 prove that the application read back the newly written Supabase aggregate rather than local fallback data.

## 12. Historical integrity verification

After the intentional production upload, P10 remained exactly:

```text
excluded_current_utc_date = 2026-08-07
historical_rows = 430
historical_events = 685
historical_fingerprint = e8a9f3795f8015a964ab8b03497b52b4
```

The smoke upload occurred on the excluded current UTC date. The unchanged historical row count, event total, and fingerprint confirm that pre-existing historical rows were not modified.

## 13. Final production state

The first production Supabase hardening completed successfully. The final confirmed state is:

- **Automatically expose new tables** is OFF;
- the existing public schema/Data API integration is retained;
- `anon` and `authenticated` cannot access `public.aggregates` through the checked table privileges;
- `anon` and `authenticated` cannot execute any `increment_aggregate` overload;
- `service_role` has only `SELECT`, `INSERT`, and `UPDATE` on `public.aggregates` among the checked table privileges;
- `service_role` retains `EXECUTE` on all three overloads;
- `postgres` owner access and execution are retained;
- `postgres` defaults no longer grant the removed table, sequence, and function defaults to `PUBLIC`, `anon`, or `authenticated`;
- `supabase_admin` defaults are unchanged;
- RLS is disabled and no policies exist;
- no overloads were dropped or replaced;
- application health reads work;
- application statistics read from Supabase;
- a real production upload write works; and
- anonymous Data API reads are denied with no row data returned.

## 14. Deliberately unchanged and out of scope

The following were deliberately not changed:

- RLS and forced RLS remained disabled; no policies were created;
- managed `supabase_admin` defaults remained unchanged;
- the existing exposed schema, table/function exposure, search path, and Max rows remained unchanged;
- all three RPC definitions remained present;
- the seven- and eight-parameter overloads were not removed;
- table and function definitions, rows other than the one approved smoke upload, migrations, application code, credentials, configuration, environment values, packages, tests, and deployment settings were not changed;
- no automatic security-advisor fixes were applied; and
- no historical telemetry backfill was performed or implied.

## 15. Residual risks and follow-up

These items remain outside the completed hardening scope:

- RLS remains a separately reviewed defense-in-depth option.
- `supabase_admin` managed defaults remain outside normal hosted operator control.
- Existing public schema/Data API routes remain; PostgreSQL authorization is the current access control.
- The obsolete seven- and eight-parameter RPC overloads remain and can be considered for later cleanup.
- Distributed rate limiting for `POST /api/track` remains a separate issue.
- Richer usage diagnostics/statistics implementation remains a later project phase.
- The current `/api/stats` Data API row cap/pagination risk remains a later issue.
- No historical telemetry backfill should be inferred from this hardening.

## 16. Recommendation for the next project phase

Treat this execution record as the evidence for the completed first production hardening and keep the runbook as the procedural reference. Any next change should have its own review and verification boundary. Prioritize separate analysis of RLS, managed-default exposure, overload cleanup, distributed tracking rate limiting, richer diagnostics/statistics, and `/api/stats` pagination before expanding production access-hardening scope.
