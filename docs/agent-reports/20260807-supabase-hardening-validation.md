# Supabase access-hardening isolated validation record

**Validation date:** 2026-08-06/07

**Documentation date:** 2026-08-07

**Repository / documentation branch:** `C:\GitHub\gmi-validering` / `docs/supabase-hardening-validation-20260807`

**Related runbook:** `docs/agent-reports/20260731-supabase-access-hardening-runbook.md`

## 1. Purpose, scope, and safety boundary

This record documents an isolated validation of the proposed Supabase access hardening. Its purpose was to test database ACL behavior, Data API behavior, current server credentials, optional RLS compatibility, and the actual Next.js read/write paths before any production planning.

The work used a disposable hosted Supabase project containing synthetic objects and data only. It did not connect to or change production Supabase, execute production SQL, copy production data, or write credentials into the repository. Results from a disposable project are compatibility evidence, not authorization to repeat the actions in production.

The RLS portion was a separate experiment. Its success does not make RLS part of the first production hardening.

## 2. Repository contract checked before interpretation

The application behavior used to interpret the test was rechecked in:

- `src/lib/tracking/supabase.js`;
- `src/lib/tracking/aggregates.js`;
- `src/lib/tracking/trackingHandler.mjs`;
- `src/lib/tracking/trackingRequestPolicy.mjs`;
- `src/app/api/track/route.js`;
- `src/app/api/track/health/route.js`;
- `src/app/api/stats/route.js`;
- `README.md`; and
- `src/features/user-tracking/README.md`.

Observed repository contract:

- Supabase is constructed server-side with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- The writer calls the nine-parameter `increment_aggregate` overload.
- `/api/track/health` reads `aggregates` unless an authenticated write is explicitly requested.
- `/api/stats` reads Supabase but falls back to a local JSON file on error.
- `/api/track` can also return `stored: true` after a successful local fallback, so database verification is required.

## 3. Initial reproduction

The disposable project reproduced the relevant production shape:

- `public.aggregates` with synthetic aggregate rows;
- three overloads of `public.increment_aggregate`;
- hosted Supabase Data API access to the `public` schema;
- public-client table/function privileges representative of the original finding; and
- relevant default ACL entries for `postgres` and the platform-managed `supabase_admin` role.

The project initially had Data API enabled, exposed schemas `public` and `graphql_public`, Max rows `1000`, and **Automatically expose new tables** on.

This was a controlled reproduction of the authorization problem, not a claim that every disposable project receives identical defaults. Before hardening, read-only ACL checks confirmed effective public-client access to the synthetic table, effective public-client execution of the reproduced overloads, and relevant global/schema default entries owned by `postgres` and managed `supabase_admin`. Later sections record which corrections actually succeeded.

Only synthetic data was used. Two original baseline rows were fingerprinted so later write tests could distinguish an intended new aggregate from accidental modification.

## 4. Default-ACL findings

### 4.1 Managed `supabase_admin` defaults could not be changed

Attempting `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ...` failed with:

```text
permission denied to change default privileges
```

The hosted response indicated that the SQL operator must be a member of `supabase_admin`. No successful change was made to `supabase_admin` default privileges.

This is an observed hosted-platform limitation. No workaround, role escalation, membership change, or ownership change was tested or recommended. A normal hosted SQL operator can inspect these managed defaults, but this validation does not establish that it can modify them.

### 4.2 `postgres` default corrections succeeded

The following six actions succeeded in the isolated project:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
```

Verification showed that the relevant `PUBLIC`, `anon`, and `authenticated` entries were removed from both global and `public`-schema defaults owned by `postgres`.

## 5. Future-object probes

### 5.1 Table and identity sequence

After the `postgres` default correction, a new synthetic table with an identity column was created.

Observed effective table privileges were approximately:

- `postgres`: owner/all relevant privileges;
- `service_role`: some administrative/default privileges remained, including `MAINTAIN`, `REFERENCES`, `TRIGGER`, and `TRUNCATE`;
- `anon`: none; and
- `authenticated`: none.

Observed identity-sequence privileges were:

- `postgres`: `SELECT`, `UPDATE`, and `USAGE`;
- `service_role`: `UPDATE`;
- `anon`: none; and
- `authenticated`: none.

This proves the desired public-client denial for this probe. It does not prove the cause of every residual `service_role` privilege: the dashboard automatic-exposure setting was also changed during the experiment. The observed state and causal inference are therefore recorded separately.

### 5.2 Function

A new `public.future_acl_function_probe()` created by `postgres` had:

```text
proacl = {postgres=X/postgres}
```

Effective `EXECUTE` was:

- `anon`: false;
- `authenticated`: false;
- `service_role`: false; and
- `postgres`: true.

The practical conclusion is direct: future application RPCs created by `postgres` require an explicit, exact-signature `GRANT EXECUTE ... TO service_role` if the server must call them.

## 6. Existing table ACL discovery

The original runbook’s table sequence revoked public clients and then granted `SELECT`, `INSERT`, and `UPDATE` to `service_role`. That did not narrow privileges already held by `service_role`: `GRANT` adds privileges and does not remove older ones.

The isolated table reached the intended minimum only after:

```sql
REVOKE ALL PRIVILEGES ON TABLE public.aggregates FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.aggregates TO service_role;
```

After the reset, effective `service_role` privileges were:

| Privilege | Effective result |
|---|---:|
| `SELECT` | true |
| `INSERT` | true |
| `UPDATE` | true |
| `DELETE` | false |
| `TRUNCATE` | false |
| `REFERENCES` | false |
| `TRIGGER` | false |
| `MAINTAIN` | false |

The hosted PostgreSQL version exposes the `MAINTAIN` table privilege. Its omission from the old effective-privilege query was a verification gap. The table owner `postgres` retained its inherent owner privileges; the validation did not attempt to reduce those through ordinary grants or revocations.

## 7. Exact overload hardening

All ACL operations used exact signatures:

1. `public.increment_aggregate(date, text, text, text, text, text, text)`;
2. `public.increment_aggregate(date, smallint, text, text, text, text, text, text)`; and
3. `public.increment_aggregate(date, smallint, text, text, text, text, text, text, text)`.

Exact-signature revoke/grant actions succeeded. Final effective execution for all three was:

| Role | `EXECUTE` |
|---|---:|
| `anon` | false |
| `authenticated` | false |
| `service_role` | true |
| `postgres` | true |

No overload was dropped. The seven- and eight-parameter definitions remain candidates for later separately reviewed cleanup, not the first hardening.

## 8. Data API behavior

### 8.1 Dashboard setting and route terminology

**Automatically expose new tables** was changed from on to off in the disposable project. Observed behavior did not support treating that setting as a route-removal switch:

- existing and new objects could still have REST/PostgREST routes while `public` remained an exposed schema;
- PostgreSQL privileges determined whether the calling database role could use those routes;
- the dashboard later showed “0 of 2 tables exposed,” while server access through the REST path still worked; and
- anonymous access through the same path was denied after ACL hardening.

The dashboard toggle, exposed-schema list, route availability, and PostgreSQL authorization are related but not identical. The validation does not establish that the toggle alone caused every observed object ACL or exposure change.

### 8.2 Publishable-key denial

The actual test-project Publishable key was independently confirmed to execute as database role `anon`. The temporary synthetic `identity_probe()` used to establish that mapping was test-only and is not recommended for production.

After table hardening, a request to:

```text
/rest/v1/aggregates?select=*&limit=1
```

returned HTTP 401 with PostgREST code `42501` and `permission denied for table aggregates`. No row data was returned.

An anonymous call to the protected `increment_aggregate` RPC was also denied after function execution was revoked. No credential or token value is retained in this record.

### 8.3 Secret-key server behavior without RLS

The disposable project used a modern Secret key whose format starts with `sb_secret_`. Passing it through the repository’s existing `SUPABASE_SERVICE_ROLE_KEY` variable directly to `createClient(...)` worked. The credential format does not require renaming the application environment variable.

Before the RLS experiment:

- a Secret-key table read returned HTTP 200 with the expected synthetic rows;
- one call to the current nine-parameter RPC returned HTTP 204;
- SQL verification found exactly one expected synthetic RPC event; and
- the two original baseline rows retained fingerprint `0454fd7ae54eaa0701711b7fd5db7e83` exactly.

No actual key is included here.

## 9. RLS experiment

RLS was enabled separately with no policies:

```sql
ALTER TABLE public.aggregates ENABLE ROW LEVEL SECURITY;
```

Observed metadata was:

- `relrowsecurity = true`;
- `relforcerowsecurity = false`; and
- `policy_count = 0`.

The earlier ACL denial remained in place: `anon` and `authenticated` still had no `SELECT` privilege.

Observed Data API behavior under RLS:

- the Publishable key still mapped to `anon`;
- anonymous read returned HTTP 401 / `42501 permission denied` with no data;
- the Secret key could read all expected synthetic aggregate rows; and
- one Secret-key call to the current nine-parameter RPC returned HTTP 204, with SQL showing `matching_rows = 1` and `matching_events = 1` for the unique RLS probe.

This demonstrates compatibility in the disposable project. It does not prove that RLS is required, and it does not authorize adding RLS to the first production hardening.

## 10. Real Next.js application validation under RLS

The repository was run locally with test-only environment values pointing to the disposable project. No secret was written into the repository.

### 10.1 Health

`GET /api/track/health` returned HTTP 200 with:

```text
ok: true
configured: true
canQuery: true
wrote: false
```

It read a synthetic Supabase row. This proved that the actual `@supabase/supabase-js` client accepted the modern Secret key through `SUPABASE_SERVICE_ROLE_KEY` and could query the RLS-enabled table.

### 10.2 Statistics before the application write

`GET /api/stats` returned HTTP 200 with `source = supabase` and correctly reported:

- `totalUploads = 5`;
- `uniqueKommuner = 3`; and
- `activeDays = 3`.

The response contained the expected synthetic aggregates rather than local fallback data.

### 10.3 Real tracking write

The real same-origin `POST /api/track` path was called once with:

```text
eventType = upload_success
datasetCoord = null
```

The route returned HTTP 200, `ok = true`, and `stored = true`. Because file fallback can also yield `stored = true`, SQL was queried directly for proof.

SQL showed exactly one new Supabase aggregate:

| Field | Value |
|---|---|
| `date` | `2026-08-07` |
| `hour` | `6` |
| `area_type` | `unknown` |
| `area_id` | `unknown` |
| `area_name` | `Unknown` |
| `event_type` | `upload_success` |
| `count` | `1` |

This established that the actual application tracking path called Supabase successfully under RLS.

### 10.4 Statistics readback

A subsequent `/api/stats` response reported:

- `totalUploads = 6`;
- `activeDays = 4`; and
- the new Unknown upload in daily totals, hour `06:00`, `byKommune/Unknown`, heatmap, and timeline.

Together, the route response, direct SQL row verification, and Supabase-backed statistics readback completed the end-to-end application validation.

## 11. Baseline integrity and repository cleanliness

The fingerprint of the two original baseline synthetic rows remained exactly:

```text
0454fd7ae54eaa0701711b7fd5db7e83
```

This showed that the intentional RPC and application probes added only their expected synthetic events and did not modify the original baseline rows.

After stopping the local server and unsetting the test credentials, `git status --short --branch --untracked-files=all` returned only:

```text
## main...origin/main
```

This was before the documentation branch was created. No application file was modified during validation.

## 12. Discrepancies in the prior runbook and corrections made

| Prior issue | Validation evidence | Runbook correction |
|---|---|---|
| Directed the operator to alter `supabase_admin` defaults. | Hosted SQL rejected the operation because the operator was not a member of the managed role. | Removed every production instruction to alter those defaults; retained read-only inspection and documented the residual platform limitation. |
| Narrower `GRANT` was treated as sufficient for existing `service_role` table access. | Broader privileges remained until `REVOKE ALL ... FROM service_role` preceded the minimum grant. | Replaced the table action with an atomic public-client revoke, service-role reset, and minimum grant. |
| Effective table verification omitted `MAINTAIN`. | Hosted PostgreSQL exposed `MAINTAIN`, and it remained true before the service ACL reset. | Added `MAINTAIN` to every enumerated table privilege checkpoint and required it to be false for `service_role`. |
| Automatic exposure wording implied more direct control over API surface than observed. | Routes could remain while `public` was exposed; a dashboard “0 of 2” count did not mean the REST path was absent. | Separated schema exposure, route availability, dashboard behavior, and PostgreSQL authorization; required real allowed/denied API tests. |
| Future service behavior was not explicit. | A new function denied `service_role` execution after corrected `postgres` defaults. | Required explicit exact-signature service `EXECUTE` grants for future server RPCs. |
| RLS was waiting for isolated proof. | Secret-key and full Next.js paths worked under non-forced, policy-free RLS. | Recorded compatibility evidence but retained RLS as a separately reviewed later decision. |
| Credential terminology could be misread as requiring a rename. | An `sb_secret_...` value worked through `SUPABASE_SERVICE_ROLE_KEY`. | Documented that credential format and repository variable naming are independent. |
| Rollback included grants not necessarily changed by the procedure. | The revised procedure does not revoke schema usage or owner powers. | Limited rollback to the dashboard toggle actually changed and exact minimum table/function service grants. |

## 13. Residual risks and limitations

- `supabase_admin` default privileges may retain platform-managed grants that the normal hosted operator cannot change. Their exact production state must be inspected and recorded.
- The disposable project is strong compatibility evidence but cannot prove production ownership, grants, extensions, deployed version, traffic, or dashboard state; production preflight must rediscover them.
- The dashboard toggle was changed during the future-object experiment, so causality for residual `service_role` defaults is not isolated.
- Keeping `public` exposed means routes may remain discoverable even though PostgreSQL privileges deny public-client use. ACL verification remains the authorization control.
- The application’s local-file fallback can mask Supabase failure unless `source: "supabase"` and direct database evidence are required.
- The seven- and eight-parameter overloads remain present during the compatibility window.
- RLS was not forced and no policies were tested; other RLS designs would require separate validation.
- Data API schema-cache timing can produce transient ambiguity; a later production session needs a defined wait/recheck stop rule.

## 14. Deliberately out of scope for the first production hardening

The validation does not authorize:

- enabling or forcing RLS, or creating policies;
- altering `supabase_admin` default privileges or role membership;
- changing object ownership;
- removing `public` or an existing object from Data API exposure;
- dropping obsolete overloads;
- changing functions, tables, migrations, code, environment-variable names, credentials, Max rows, telemetry, or historical data;
- destructive anonymous production probes; or
- using the temporary `identity_probe()` in production.

## 15. Recommendation before production

The next step is human review of the revised runbook and complete documentation diff. After approval, the documentation branch may be committed/pushed and reviewed through a PR by a human-authorized workflow. Only after that should a separate production session be planned.

That production session should have an operator and peer verifier, capture a fresh read-only baseline, confirm the deployed nine-parameter server contract, and execute one runbook action/checkpoint at a time with verification between actions. The recommended first scope remains ACL/default-ACL hardening without RLS.
