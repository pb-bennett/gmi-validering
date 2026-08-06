# Supabase access-hardening runbook (review only)

**Status:** Planning and peer-review material only. Nothing in this document has been executed.

**Repository / branch:** `C:\GitHub\gmi-validering` / `security/supabase-access-hardening`

**Primary design source:** `docs/agent-reports/20260731-richer-usage-statistics-design.md`

**Confirmed inspection baseline:** `public.aggregates` is the authoritative store for all historical production statistics. At inspection time it held 299 `upload_success` aggregate rows representing 551 uploads, plus 124 `health_check` events. The database configuration appears to permit anonymous access, but the available evidence does not establish that access was abused.

All SQL below is proposed for review. Do not run it from this repository review. Do not copy credentials, JWTs, project URLs, environment values, or row-level production data into this report, a terminal transcript, a ticket, or version control.

## 1. Objective and boundaries

The objective is limited to database authorization hardening for the existing Supabase statistics objects. The compatible end state removes direct access from public client roles and prevents future objects from inheriting the same access, while leaving the current server-side Data API path operational.

The hardening must preserve:

- every existing historical row and value in `public.aggregates`;
- the current nine-parameter server RPC and its exact argument contract;
- normal `upload_success` tracking through the production application;
- the public Norwegian statistics dashboard and its complete historical totals;
- application rollback compatibility, including a temporarily retained service-role path to obsolete overloads until stale deployments have been ruled out.

This runbook does not implement richer telemetry. It creates no table, function, policy, migration, diagnostic metric, or application behavior. It must not update, normalize, delete, re-key, replace, backfill, or otherwise rewrite historical rows. It also does not change the Data API maximum row setting of 1,000; that separate growth risk is documented in the design report.

The initial production scope is deliberately narrow:

1. disable automatic exposure of newly created tables;
2. correct unsafe default privileges for objects created by `postgres` and `supabase_admin`;
3. remove current table privileges from `PUBLIC`, `anon`, and `authenticated` while explicitly preserving the minimum server privileges;
4. remove execution of every exact `increment_aggregate` overload from `PUBLIC`, `anon`, and `authenticated` while preserving server and owner execution;
5. verify the application and denial paths before considering RLS.

RLS, removal of legacy objects from the Data API, and deletion of obsolete overloads are not part of the first production hardening.

## 2. Repository contract verification

### Verified facts

The following facts were verified from the checked-out repository. Line numbers describe the current branch and should be rechecked if the branch changes.

| Contract | Repository evidence | Verified behavior |
|---|---|---|
| Supabase client and key | `src/lib/tracking/supabase.js:1-16` | The only Supabase client is constructed server-side with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Session persistence is disabled. No anon key is referenced by repository source. |
| Tracking entry point | `src/components/FileUpload.js:19-50`, `src/components/FileUpload.js:219-225`, `src/app/api/track/route.js:1-13` | After successful parsing, browser code sends `upload_success` and an optional dataset coordinate to the application endpoint `POST /api/track`. It does not call Supabase. |
| Tracking handler | `src/lib/tracking/trackingHandler.mjs:81-120` | The server validates the request, optionally resolves a municipality, and calls its injected aggregate increment function once. |
| Storage selection | `src/lib/tracking/aggregates.js:1-17`, `src/lib/tracking/aggregates.js:124-139` | If Supabase is configured, the writer tries Supabase first. If it is not configured or the RPC helper returns `false`, it writes the same aggregate to a local JSON file. |
| Exact RPC call | `src/lib/tracking/supabase.js:18-55` | The server calls RPC name `increment_aggregate` with nine named parameters in this order: `p_date`, `p_hour`, `p_area_type`, `p_area_id`, `p_area_name`, `p_kommune_number`, `p_country`, `p_region`, `p_event_type`. |
| Current SQL contract | `src/features/user-tracking/supabase.sql:17-66` | The checked-in current definition has the same nine parameters and uses `(date, hour, area_type, area_id, event_type)` as its conflict identity. |
| Statistics server read | `src/app/api/stats/route.js:41-53` | `/api/stats` uses the same service-role client to select the legacy columns from `aggregates`, filters `event_type = 'upload_success'`, and orders by date. The query is currently unpaginated. |
| Statistics fallback | `src/app/api/stats/route.js:55-70`, `src/app/api/stats/route.js:211-234` | If Supabase is absent or its read throws, `/api/stats` reads the local JSON file and identifies its response source as `file`; it does not merge file and Supabase records. |
| Browser statistics path | `src/components/StatsModal.js:190-230` | The client component fetches `/api/stats` when the modal opens. It has no Supabase import or direct database call. |
| Repository-wide browser check | Repository search for `@supabase/supabase-js`, `createClient`, `NEXT_PUBLIC_SUPABASE`, and anon-key names | The only Supabase import/client construction is `src/lib/tracking/supabase.js`. No browser source directly queries Supabase. This establishes the repository contract, not the contents of an unknown stale deployment. |
| Health endpoint read | `src/app/api/track/health/route.js:49-78` | `GET /api/track/health` requires Supabase configuration and performs a service-role `SELECT date ... LIMIT 1` on `aggregates`. It therefore requires `USAGE` on `public` and `SELECT` on the table. |
| Health endpoint write | `src/app/api/track/health/route.js:80-116` | Only `write=true` with the keepalive secret invokes the same nine-parameter service-role RPC, recording/incrementing a `health-test` / `health_check` aggregate. A read-only smoke test must omit `write=true`. |
| Local sample | `data/usage/aggregates.json` | A checked-in local fallback sample exists. Its small counts are not the production historical baseline. |

The exact minimum current server privileges follow from those verified code paths:

- schema `USAGE` on `public` for `service_role`;
- table `SELECT`, `INSERT`, and `UPDATE` on `public.aggregates` for `service_role`;
- function `EXECUTE` on the nine-parameter overload for the current server;
- owner/administrative access for `postgres`.

`INSERT` and `UPDATE` are required because the `SECURITY INVOKER` function performs `INSERT ... ON CONFLICT DO UPDATE`; `SELECT` is required both by `/api/stats` and health and by the function's read of the existing `count` in its update expression. The current path does not require service-role `DELETE`, `TRUNCATE`, `REFERENCES`, or `TRIGGER`.

The obsolete seven- and eight-parameter functions are not called by current source. This runbook nevertheless preserves their execution for `service_role` and `postgres` during the compatibility window, because live function-call statistics cannot prove that no stale deployed server calls them.

### Assumptions and items to reconfirm

- The inspected deployment contract is assumed to match the production deployment. Before changes, identify the deployed commit without exposing environment values and stop if it does not use the nine-parameter service-role client.
- The service-role JWT is expected to map to database role `service_role`, and that role is expected to bypass ordinary RLS. This expectation is not sufficient for the first RLS change; it must be proven in isolation and through the actual Data API path.
- The design report confirms that all three live functions are owned by `postgres`. It does not record the table owner's name in the report text; checkpoint A must reconfirm it rather than assume it.
- Default ACLs can be global or schema-specific and are additive. Checkpoint A must identify both forms. A global function default granting `PUBLIC` execution cannot be neutralized by a schema-specific revocation alone.
- No non-production Supabase project is assumed to exist.
- No evidence proves actual misuse, the absence of stale callers, or whether any prior production failure wrote only to ephemeral local fallback storage.

## 3. Hardening scope

The minimum compatible production change contains the following operations.

1. **Turn off automatic exposure of newly created tables.** This prevents a future table from becoming an API surface merely because it was created. It does not repair ACLs, so default privileges must also be corrected.
2. **Correct defaults for `postgres`.** Future tables and sequences created by `postgres` must not automatically grant `anon` or `authenticated` access. Future functions must not grant execution to `PUBLIC`, `anon`, or `authenticated`. Both global and `public`-schema default ACL entries must be handled because they are additive.
3. **Correct defaults for `supabase_admin`.** The same correction is required separately because PostgreSQL default privileges belong to the object-creating role; changing `postgres` defaults does not change `supabase_admin` defaults.
4. **Revoke all current table privileges from `anon` and `authenticated`.** This removes direct read, insert, change, delete, truncate, reference, and trigger capability. `REVOKE ALL PRIVILEGES` is safely repeatable and avoids missing an uncommon table privilege.
5. **Revoke table privileges from `PUBLIC`.** The pre-check must reveal whether such a grant exists. Revoking from `PUBLIC` is required even if the ACL currently shows none, because privileges inherited through `PUBLIC` would otherwise survive named-role revocations.
6. **Grant only the current table path to `service_role`.** Explicitly preserve `SELECT`, `INSERT`, and `UPDATE`; do not grant `DELETE`, `TRUNCATE`, `REFERENCES`, or `TRIGGER`. `postgres` remains owner/administrator and receives the same explicit operational grant for clarity, without changing owner powers.
7. **Revoke execution on each exact overload.** PostgreSQL functions are overloaded objects. Every revocation and grant must include the complete identity signature so a later command cannot affect the wrong overload. Revoke from `PUBLIC` as well as `anon` and `authenticated`.
8. **Retain execution for `service_role` and `postgres`.** The current nine-parameter function is required in production. The obsolete overload definitions remain temporarily and are service-only so an older server rollback remains possible during the review window.
9. **Consider RLS later as defense in depth.** Privilege revocation is the first authorization control. RLS with no public policies can protect against a later accidental grant, but it is a separate checkpoint only after the service-role Data API behavior has been proven.
10. **Keep both legacy objects in the Data API temporarily.** `/api/stats` reaches `public.aggregates` through PostgREST and the writer reaches `public.increment_aggregate` through RPC. Do not remove either API route until an isolated test proves service-role access survives the exact exposure change or the server is moved to a different reviewed access path.

No overload is dropped in this runbook. No schema/table/function definition is replaced. No row-changing or data-migration statement is proposed.

## 4. Exact object inventory

### Functions

The live design inspection confirmed these distinct identity signatures and argument orders. Parameter names are included for review; PostgreSQL grant/revoke statements use the types in parentheses as the object identity.

**Seven-parameter obsolete overload**

```text
public.increment_aggregate(
  p_date       date,
  p_area_type  text,
  p_area_id    text,
  p_area_name  text,
  p_country    text,
  p_region     text,
  p_event_type text
)

Identity: public.increment_aggregate(date, text, text, text, text, text, text)
```

It omits `hour` and `kommune_number`, uses an obsolete conflict target, and is likely incompatible with the current table. It must not be called as a test.

**Eight-parameter obsolete overload**

```text
public.increment_aggregate(
  p_date       date,
  p_hour       smallint,
  p_area_type  text,
  p_area_id    text,
  p_area_name  text,
  p_country    text,
  p_region     text,
  p_event_type text
)

Identity: public.increment_aggregate(date, smallint, text, text, text, text, text, text)
```

It omits `kommune_number`. The copied definition in `src/features/user-tracking/SQL-CHEAT-SHEET.md` is evidence of the old order, but it is stale and must not be used as the current application contract.

**Nine-parameter current overload**

```text
public.increment_aggregate(
  p_date              date,
  p_hour              smallint,
  p_area_type         text,
  p_area_id           text,
  p_area_name         text,
  p_kommune_number    text,
  p_country           text,
  p_region            text,
  p_event_type        text
)

Identity: public.increment_aggregate(date, smallint, text, text, text, text, text, text, text)
```

All three return `void`, are PL/pgSQL, volatile, `SECURITY INVOKER`, owned by `postgres`, and have no custom function settings. The current application requires the nine-parameter identity exactly.

### Other database objects and principals

| Kind | Exact inventory | Treatment |
|---|---|---|
| Schema | `public` | Keep exposed temporarily; keep only required schema `USAGE`. |
| Table | `public.aggregates` | Preserve in place and preserve every historical row. Do not rename, replace, or remove from the Data API in the first change. |
| Roles losing access | pseudo-role `PUBLIC`, roles `anon`, `authenticated` | Revoke current table access and exact function execution. Do not restore as normal rollback. |
| Runtime role | `service_role` | Retain schema `USAGE`, table `SELECT`/`INSERT`/`UPDATE`, and exact function execution. |
| Owner/admin role | `postgres` | Confirm table ownership; function ownership is confirmed. Retain owner powers and explicit required operational access. |
| Object creators with unsafe defaults | `postgres`, `supabase_admin` | Correct each creator's global and `public`-schema default ACLs separately. |
| Data API schemas | `public`, `graphql_public` | Current live setting; this runbook changes neither exposed-schema list nor the 1,000-row maximum. |

`authenticator`, dashboard users, and unrelated database roles are outside the object ACL changes. The pre-check may display them for completeness; do not alter them without a separate reviewed justification.

## 5. Proposed SQL, review only

These are small peer-review checkpoints, not a migration and not one large transaction. Execute none of them while preparing or reviewing this report. A future authorized operator must record query results privately, compare them to the expected inventory, and stop on any mismatch.

### A. Checkpoint 1 — read-only pre-change verification

This checkpoint identifies the live objects, effective ACLs (including `PUBLIC`), RLS state, default ACL location, required roles, and a non-sensitive aggregate baseline. It changes nothing.

```sql
-- A1. Required principals and RLS-bypass metadata.
SELECT rolname, rolcanlogin, rolbypassrls
FROM pg_roles
WHERE rolname IN (
  'anon', 'authenticated', 'service_role', 'postgres', 'supabase_admin'
)
ORDER BY rolname;

-- A2. Exact table identity, owner, RLS state, and raw ACL.
SELECT
  c.oid::regclass AS table_name,
  pg_get_userbyid(c.relowner) AS owner_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  c.relacl
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'aggregates'
  AND c.relkind IN ('r', 'p');

-- A3. Expanded current table ACL, including grants to PUBLIC (grantee OID 0).
SELECT
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
       ELSE pg_get_userbyid(acl.grantee)
  END AS grantee,
  acl.privilege_type,
  acl.is_grantable,
  pg_get_userbyid(acl.grantor) AS grantor
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(c.relacl, acldefault('r', c.relowner))
) AS acl
WHERE n.nspname = 'public'
  AND c.relname = 'aggregates'
ORDER BY grantee, acl.privilege_type;

-- A4. Exact function inventory, owner, mode, settings, and raw ACL.
SELECT
  p.oid::regprocedure AS function_identity,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_userbyid(p.proowner) AS owner_name,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.proconfig AS function_settings,
  p.proacl
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'increment_aggregate'
ORDER BY p.oid::regprocedure::text;

-- A5. Expanded function ACLs. acldefault('f', ...) includes default PUBLIC EXECUTE.
SELECT
  p.oid::regprocedure AS function_identity,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
       ELSE pg_get_userbyid(acl.grantee)
  END AS grantee,
  acl.privilege_type,
  acl.is_grantable,
  pg_get_userbyid(acl.grantor) AS grantor
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(p.proacl, acldefault('f', p.proowner))
) AS acl
WHERE n.nspname = 'public'
  AND p.proname = 'increment_aggregate'
ORDER BY p.oid::regprocedure::text, grantee, acl.privilege_type;

-- A6. Global and schema-specific default ACL entries for both creators.
SELECT
  creator.rolname AS object_creator,
  CASE d.defaclobjtype
    WHEN 'r' THEN 'table'
    WHEN 'S' THEN 'sequence'
    WHEN 'f' THEN 'function'
    WHEN 'T' THEN 'type'
    WHEN 'n' THEN 'schema'
    ELSE d.defaclobjtype::text
  END AS object_kind,
  COALESCE(n.nspname, '(all schemas)') AS scope,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
       ELSE pg_get_userbyid(acl.grantee)
  END AS grantee,
  acl.privilege_type,
  acl.is_grantable
FROM pg_default_acl AS d
JOIN pg_roles AS creator ON creator.oid = d.defaclrole
LEFT JOIN pg_namespace AS n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
WHERE creator.rolname IN ('postgres', 'supabase_admin')
  AND (d.defaclnamespace = 0 OR n.nspname = 'public')
ORDER BY object_creator, object_kind, scope, grantee, acl.privilege_type;

-- A7. Confirm that no RLS policy exists before the first hardening.
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'aggregates'
ORDER BY policyname;

-- A8. Non-sensitive all-data and upload baseline.
SELECT
  count(*) AS all_rows,
  COALESCE(sum(count), 0) AS all_events,
  count(*) FILTER (WHERE event_type = 'upload_success') AS upload_rows,
  COALESCE(sum(count) FILTER (WHERE event_type = 'upload_success'), 0)
    AS upload_events,
  count(*) FILTER (WHERE event_type = 'health_check') AS health_rows,
  COALESCE(sum(count) FILTER (WHERE event_type = 'health_check'), 0)
    AS health_events,
  min(date) AS first_date,
  max(date) AS last_date
FROM public.aggregates;

-- A9. Frozen-history fingerprint. Record the UTC cutoff and digest privately.
-- Rows from the current UTC date are excluded because normal uploads may increment them.
SELECT
  (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS excluded_current_utc_date,
  count(*) AS historical_rows,
  COALESCE(sum(count), 0) AS historical_events,
  md5(COALESCE(
    string_agg(
      to_jsonb(a)::text,
      E'\n' ORDER BY date, hour, area_type, area_id, event_type
    ),
    ''
  )) AS historical_fingerprint
FROM public.aggregates AS a
WHERE date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
```

Expected before the change: exactly three identities listed in section 4; all are `SECURITY INVOKER` and owned by `postgres`; RLS and forced RLS are false; no policies exist; broad table grants exist for `anon`/`authenticated`; function execution is effective through `PUBLIC` and direct grants; the upload baseline matches or legitimately exceeds the inspection-time 299 rows / 551 events. Stop if the count decreases, the signatures differ, an unexpected policy/dependency exists, a required role is missing, or the deployed application contract is not the nine-parameter path.

### B. Checkpoints 2 and 3 — default-privilege corrections

PostgreSQL combines global and schema-specific default ACLs. The global lines are necessary where a broad grant is global; notably, the built-in default function execution for `PUBLIC` is global and cannot be canceled by only an `IN SCHEMA public` revocation. These commands affect future objects only. They do not change existing `aggregates` or any existing function.

Run and verify the `postgres` block as one checkpoint, then the `supabase_admin` block as a separate checkpoint. A permission error is a stop condition; do not substitute another creator role.

```sql
-- B1. Future objects created by postgres: remove unsafe global defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Remove any additive public-schema defaults for the same principals.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
```

```sql
-- B2. Future objects created by supabase_admin: remove unsafe global defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Remove any additive public-schema defaults for the same principals.
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
```

These statements intentionally do not invent broad future grants for `service_role`. Existing service-role default ACL entries not named by these revocations remain unchanged; every new application object should still receive explicit, object-specific grants in its reviewed creation script. Ownership and inherent owner powers are unaffected.

Re-run A6 after each creator block. The named public principals must have no remaining relevant default grant at either scope. If one remains, stop and inspect its exact creator and scope; do not proceed to current-object ACLs.

### C. Checkpoint 4 — current table privilege revocations

This removes every direct and `PUBLIC` table privilege. It is safely repeatable and does not alter rows.

```sql
REVOKE ALL PRIVILEGES ON TABLE public.aggregates
  FROM PUBLIC, anon, authenticated;
```

Immediately re-run A3. Also run the effective checks in G2 before proceeding. A public client role retaining any table privilege is a stop condition.

### D. Checkpoints 5–7 — exact per-signature function revocations

Run each statement as its own checkpoint, verify that exact identity, and only then continue. None drops or replaces a function.

```sql
-- D1. Seven-parameter obsolete overload.
REVOKE EXECUTE ON FUNCTION public.increment_aggregate(
  date, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
```

```sql
-- D2. Eight-parameter obsolete overload.
REVOKE EXECUTE ON FUNCTION public.increment_aggregate(
  date, smallint, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
```

```sql
-- D3. Nine-parameter current overload.
REVOKE EXECUTE ON FUNCTION public.increment_aggregate(
  date, smallint, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
```

If PostgreSQL reports that an identity does not exist, stop. Do not use a name-only command, wildcard, function replacement, or a different signature to work around the mismatch.

### E. Checkpoints 4–7 companion grants — exact server/owner access

Apply the table grant immediately with checkpoint C, and apply each function grant immediately with its matching D checkpoint. This minimizes the interval in which the service role could lack access. The grants are safely repeatable.

```sql
-- E1. Required schema and table path only.
GRANT USAGE ON SCHEMA public TO service_role, postgres;
GRANT SELECT, INSERT, UPDATE ON TABLE public.aggregates
  TO service_role, postgres;
```

```sql
-- E2a. Retain seven-parameter service/owner execution.
GRANT EXECUTE ON FUNCTION public.increment_aggregate(
  date, text, text, text, text, text, text
) TO service_role, postgres;
```

```sql
-- E2b. Retain eight-parameter service/owner execution.
GRANT EXECUTE ON FUNCTION public.increment_aggregate(
  date, smallint, text, text, text, text, text, text
) TO service_role, postgres;
```

```sql
-- E2c. Retain current nine-parameter service/owner execution.
GRANT EXECUTE ON FUNCTION public.increment_aggregate(
  date, smallint, text, text, text, text, text, text, text
) TO service_role, postgres;
```

The explicit `postgres` grants document intended operational access; ownership continues to confer owner capabilities. No service-role delete-like privilege is granted.

### F. Later optional checkpoint — RLS defense in depth

This checkpoint is excluded from the first production hardening. It may be approved later only after an isolated Data API test confirms the actual service-role read and nine-parameter RPC paths with RLS enabled and no public policies.

```sql
ALTER TABLE public.aggregates ENABLE ROW LEVEL SECURITY;
```

Do not enable forced RLS. Do not create an anon or authenticated policy. Verify immediately that the server sees `source: "supabase"`, health can read, and one deliberately accounted-for application upload increments exactly once. If any server path fails, use the checkpoint-local rollback while retaining ACL revocations:

```sql
ALTER TABLE public.aggregates DISABLE ROW LEVEL SECURITY;
```

### G. Read-only post-change verification

Re-run A2–A9, then run these effective-privilege checks. They change nothing.

```sql
-- G1. Confirm exact functions still exist after ACL-only changes.
SELECT
  to_regprocedure(
    'public.increment_aggregate(date,text,text,text,text,text,text)'
  ) AS seven_parameter,
  to_regprocedure(
    'public.increment_aggregate(date,smallint,text,text,text,text,text,text)'
  ) AS eight_parameter,
  to_regprocedure(
    'public.increment_aggregate(date,smallint,text,text,text,text,text,text,text)'
  ) AS nine_parameter;

-- G2. Effective table privileges. These include access inherited through PUBLIC.
SELECT
  role_name,
  has_schema_privilege(role_name, 'public', 'USAGE') AS schema_usage,
  has_table_privilege(role_name, 'public.aggregates', 'SELECT') AS can_select,
  has_table_privilege(role_name, 'public.aggregates', 'INSERT') AS can_insert,
  has_table_privilege(role_name, 'public.aggregates', 'UPDATE') AS can_update,
  has_table_privilege(role_name, 'public.aggregates', 'DELETE') AS can_delete,
  has_table_privilege(role_name, 'public.aggregates', 'TRUNCATE') AS can_truncate,
  has_table_privilege(role_name, 'public.aggregates', 'REFERENCES') AS can_reference,
  has_table_privilege(role_name, 'public.aggregates', 'TRIGGER') AS can_trigger
FROM (VALUES
  ('anon'), ('authenticated'), ('service_role'), ('postgres')
) AS roles(role_name)
ORDER BY role_name;

-- G3. Effective execution on each identity, including access inherited through PUBLIC.
WITH functions(label, function_oid) AS (
  VALUES
    ('seven', to_regprocedure(
      'public.increment_aggregate(date,text,text,text,text,text,text)'
    )),
    ('eight', to_regprocedure(
      'public.increment_aggregate(date,smallint,text,text,text,text,text,text)'
    )),
    ('nine', to_regprocedure(
      'public.increment_aggregate(date,smallint,text,text,text,text,text,text,text)'
    ))
)
SELECT
  r.role_name,
  f.label,
  f.function_oid::regprocedure AS function_identity,
  has_function_privilege(r.role_name, f.function_oid, 'EXECUTE') AS can_execute
FROM (VALUES
  ('anon'), ('authenticated'), ('service_role'), ('postgres')
) AS r(role_name)
CROSS JOIN functions AS f
ORDER BY r.role_name, f.label;
```

Required result:

- `anon` and `authenticated`: every table capability false; every function execution false. `schema_usage` may remain true because it does not grant object access.
- `service_role`: `schema_usage`, table `SELECT`/`INSERT`/`UPDATE`, and all three function execution checks true; delete-like table capabilities false.
- `postgres`: required checks true through ownership and/or explicit grant.
- all three `to_regprocedure` results non-null;
- A3/A5 show no relevant `PUBLIC`, `anon`, or `authenticated` ACL;
- A9 has the same cutoff, row count, event total, and fingerprint as the recorded baseline.

An unexpected true or false is a stop condition. Do not infer success from an HTTP response alone.

### H. Rollback SQL — required service access only

This is the only normal rollback grant set. It restores or reconfirms only the minimum current service-role path without restoring broad public-client access. It does not undo safer default ACLs. `postgres` needs no rollback grant because its owner/administrative powers remain intact.

```sql
GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.aggregates
  TO service_role;

GRANT EXECUTE ON FUNCTION public.increment_aggregate(
  date, text, text, text, text, text, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.increment_aggregate(
  date, smallint, text, text, text, text, text, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.increment_aggregate(
  date, smallint, text, text, text, text, text, text, text
) TO service_role;
```

If RLS alone caused the failure, use only the `DISABLE ROW LEVEL SECURITY` statement in F and keep every public-client revocation. There is intentionally no normal rollback that grants access to `PUBLIC`, `anon`, or `authenticated`. Restoring those grants would recreate the finding and is strongly discouraged even in an emergency; repair the service-only path instead.

## 6. Dashboard settings

In the production Supabase project's Data API settings, turn **automatic exposure of new tables** off. Record the before/after boolean and reviewer approval without recording project secrets. Dashboard navigation labels can change; use the current project setting whose meaning is exactly “automatically expose newly created tables,” not an unrelated API documentation or schema setting.

Keep these currently exposed legacy objects reachable through the Data API temporarily:

- `public.aggregates`, because `/api/stats` and the health endpoint call `.from('aggregates')` with the service-role Supabase client;
- all `public.increment_aggregate` overload definitions, especially the nine-parameter overload, because the writer calls `.rpc('increment_aggregate', ...)` through that same Data API and an older service deployment may need an obsolete overload during rollback.

“Exposed” does not mean “publicly authorized.” The compatible intermediate state is API-visible with database privileges denying `PUBLIC`, `anon`, and `authenticated` while permitting only the server role. Do not blindly remove `public.aggregates`, `increment_aggregate`, or the `public` schema from Data API exposure. Test any narrower exposure configuration in isolation first.

Privilege, function, RLS, and exposure changes may take time to appear through the Data API's schema cache. Use only the schema refresh/reload mechanism currently supported and documented by the Supabase dashboard for that project, if one is available; otherwise allow a defined short propagation window and repeat both allowed and denied checks. This report deliberately does not invent a SQL notification or unsupported cache command. A stale response is neither proof of successful denial nor proof that the server path is permanently broken.

Disabling automatic exposure does not remove existing API objects and should not interrupt the application. If the dashboard indicates otherwise, stop before saving and obtain a second review.

## 7. Non-production validation plan

Do not assume an isolated project already exists. Before production, create or obtain an approved disposable Supabase project or an equivalent isolated Postgres + matching PostgREST environment. It must contain no production credentials or row data.

1. Reproduce only the relevant shape of `public.aggregates`, the three exact function signatures in section 4, their `SECURITY INVOKER` behavior, representative unsafe current grants, both object-creator default ACL cases, Data API exposure, and automatic-new-table exposure behavior. Use synthetic aggregate values only.
2. Configure a test server instance with test-only service-role credentials delivered through the environment. Never place the key in a command argument likely to be logged, a test fixture, a screenshot, a report, application output, or version control.
3. Establish synthetic row/event totals and a frozen-history fingerprint. Confirm the test `/api/stats` response says `source: "supabase"`.
4. Apply the proposed default-ACL blocks independently. Create harmless test-only objects as each creator only if the environment safely supports role switching, then inspect ACLs to prove `PUBLIC`, `anon`, and `authenticated` did not inherit table, sequence, or function privileges. Remove the disposable project through its approved lifecycle later; this runbook contains no object-drop step.
5. Apply table revocation plus E1. With a test anon client, confirm table reads and write attempts receive authorization denial. Destructive privilege classes such as truncate are tested only here, never against production data.
6. Apply D1/E2 for the seven-parameter identity and confirm anon execution is denied while service-role execution remains allowed. Because this overload may be incompatible, use metadata to confirm service access rather than invoking it unless the isolated reproduction intentionally makes it safe.
7. Repeat for the eight-parameter identity.
8. Apply D3/E2 for the current identity. Confirm an anon RPC request is denied and changes no synthetic count.
9. Through the service-role client, select `aggregates` and confirm all synthetic rows are returned.
10. Through the service-role client, invoke the nine-parameter RPC once with a unique synthetic current bucket. Confirm exactly one count increment and no change to other rows.
11. Run the test application paths: `GET /api/track/health` without `write=true`, one normal upload, `GET /api/stats`, and the Norwegian statistics UI. Require `source: "supabase"` and the expected exact increment.
12. Enable RLS with no public policies as a separate experiment. Repeat service-role read, service-role nine-parameter RPC, anon denial, health, stats, and UI checks. Then disable RLS if the result is not unambiguously compatible. This experiment does not authorize production RLS.
13. Test any proposed Data API object-removal control separately. If hiding an object also hides it from the service-role PostgREST client, retain current exposure in production.
14. Review logs and `git status` to confirm no credential, environment value, generated SQL file, data export, or unrelated change was created.

Production approval requires a written record of the isolated expected/actual outcomes, with secrets redacted and only synthetic data shown.

## 8. Production execution sequence

Use one operator and one peer verifier in a short, announced window. Do not combine checkpoints into one transaction or proceed automatically after a mismatch. Each checkpoint has one logical action.

### Checkpoint 0 — identify the runtime deployment

- **Action:** Record the production deployment commit/version and confirm it contains the repository paths and nine-parameter contract in section 2.
- **Expected result:** The deployed server uses `SUPABASE_SERVICE_ROLE_KEY`, `.from('aggregates')`, and the nine named RPC arguments.
- **Verification:** Compare deployment metadata to the reviewed commit without reading or printing environment values.
- **Stop condition:** Unknown/stale deployment, eight/seven-parameter current caller, browser Supabase client, or unverifiable runtime.
- **Rollback:** None; no state changed. Resolve deployment provenance before proceeding.

### Checkpoint 1 — capture the aggregate and ACL baseline

- **Action:** Run only section A and privately record results, UTC cutoff, and expected smoke increment.
- **Expected result:** At least the inspection baseline of 299 upload rows / 551 uploads, all three exact functions, known broad grants, RLS off, and no policies.
- **Verification:** Two reviewers compare identities, ACLs, counts, date range, and fingerprint to this runbook/design report.
- **Stop condition:** Any lower count, changed schema/signature, missing overload, unexpected policy/dependency, or unexplained data discrepancy.
- **Rollback:** None; queries are read-only.

### Checkpoint 2 — disable automatic new-table exposure

- **Action:** Turn the dashboard setting for automatic exposure of newly created tables off.
- **Expected result:** Existing `aggregates` and RPC routes remain exposed; only future automatic exposure is disabled.
- **Verification:** Reopen the setting and confirm off; perform a read-only `/api/stats` request and require `ok: true`, `source: "supabase"`, and the baseline history.
- **Stop condition:** Existing object exposure changes, stats falls back to `file`, or setting semantics are unclear.
- **Rollback:** Do not re-enable an unsafe default merely to continue. If the dashboard unexpectedly changed existing exposure, restore only that existing legacy exposure with the supported dashboard control and stop for review.

### Checkpoint 3 — correct `postgres` defaults

- **Action:** Apply B1 only.
- **Expected result:** Future `postgres` objects no longer grant access to public client principals by default; existing objects are unchanged.
- **Verification:** Re-run A6 for `postgres`, then read `/api/stats` and confirm `source: "supabase"`.
- **Stop condition:** Remaining relevant default grant, permission error, existing ACL change, or application regression.
- **Rollback:** Do not restore public defaults. Since current objects are unaffected, stop and explicitly grant only a required service privilege on any future object affected by an erroneous assumption.

### Checkpoint 4 — correct `supabase_admin` defaults

- **Action:** Apply B2 only.
- **Expected result:** Future `supabase_admin` objects no longer grant access to public client principals by default; existing objects are unchanged.
- **Verification:** Re-run A6 for `supabase_admin`, then perform the same service stats read.
- **Stop condition:** Same as checkpoint 3.
- **Rollback:** Same principle as checkpoint 3; never restore broad public defaults as routine rollback.

### Checkpoint 5 — harden the current table

- **Action:** Apply C and E1 together as the single table-authorization change.
- **Expected result:** `anon` and `authenticated` have no effective table privilege, including through `PUBLIC`; `service_role` retains only `SELECT`, `INSERT`, and `UPDATE` for the server path.
- **Verification:** Run A3 and G2, then call health without `write=true` and require `ok: true`, `canQuery: true`.
- **Stop condition:** Any public-client capability remains; any required service capability is false; health cannot query.
- **Rollback:** Apply H's schema/table grants only. Do not grant a public-client role. Reverify health before any further checkpoint.

### Checkpoint 6 — harden the seven-parameter overload

- **Action:** Apply D1 and its matching E2 grant.
- **Expected result:** That exact obsolete identity is service/owner executable only and still exists.
- **Verification:** Run A5 and G3 for `seven`; confirm `/api/stats` is still Supabase-backed.
- **Stop condition:** Missing/mistargeted identity, public execution remains, or server regression.
- **Rollback:** Reapply only H's seven-parameter service/owner grant.

### Checkpoint 7 — harden the eight-parameter overload

- **Action:** Apply D2 and its matching E2 grant.
- **Expected result:** That exact obsolete identity is service/owner executable only and still exists.
- **Verification:** Run A5 and G3 for `eight`; repeat the Supabase-backed stats read.
- **Stop condition:** Same as checkpoint 6.
- **Rollback:** Reapply only H's eight-parameter service/owner grant.

### Checkpoint 8 — harden the nine-parameter overload

- **Action:** Apply D3 and its matching E2 grant.
- **Expected result:** The current identity is denied to public clients and executable by `service_role`/`postgres`.
- **Verification:** Run A5 and G3 for `nine`; do not invoke it manually in production.
- **Stop condition:** Public execution remains or service execution is false.
- **Rollback:** Immediately reapply only H's nine-parameter service/owner grant and stop before an upload smoke test if verification remains wrong.

### Checkpoint 9 — verify the read-only server paths

- **Action:** Request `/api/track/health` once without `write=true`.
- **Expected result:** Health reports `ok: true`, `configured: true`, and `canQuery: true` without creating a health event.
- **Verification:** Confirm the response reports query capability and no write was requested.
- **Stop condition:** Error, missing configuration, failed query, or any unexpected write indication.
- **Rollback:** Reapply H's schema/table grants, allow the supported schema-cache propagation window, retry once, then stop if still failing.

### Checkpoint 10 — verify the statistics API path

- **Action:** Request `/api/stats` once.
- **Expected result:** It reports `ok: true`, `source: "supabase"`, and retains the historical baseline.
- **Verification:** Compare response summary fields to checkpoint 1; never accept `source: "file"` as success.
- **Stop condition:** Error, fallback source, lower total, or missing history.
- **Rollback:** Reapply H, allow the supported schema-cache propagation window, retry once, then stop if still failing.

### Checkpoint 11 — perform one accounted normal upload

- **Action:** Upload one approved small synthetic but valid file through the ordinary production UI exactly once.
- **Expected result:** Parsing succeeds and the legacy `upload_success` total increases by exactly one through the nine-parameter service RPC.
- **Verification:** Record the immediate pre/post upload total with the read-only A8 aggregate query; require a delta of exactly `+1`. Confirm `/api/stats` says `source: "supabase"`. Account for unrelated concurrent uploads by scheduling a quiet window or correlating the expected aggregate bucket without retaining uploaded content.
- **Stop condition:** Delta zero, greater than one without a documented concurrent upload, `stored` behavior inconsistent with the database, or file fallback suspected.
- **Rollback:** Do not decrement or delete the test count. Preserve it as a legitimate test upload, stop, and repair only service access with H.

### Checkpoint 12 — verify effective public-client denial

- **Action:** Run G2/G3 once after all ACL changes.
- **Expected result:** Every anon/auth table and function capability is false, including access inherited through `PUBLIC`; required service capabilities are true.
- **Verification:** Compare every boolean to section G's required-result list. Database effective-privilege results are authoritative.
- **Stop condition:** Any public-client effective privilege is true or any required service privilege is false.
- **Rollback:** None toward broader access. Stop and find the surviving direct, inherited, or `PUBLIC` grant.

### Checkpoint 13 — verify read-only anon Data API denial

- **Action:** Only after checkpoint 12 passes, make one controlled anon table read request through the Data API.
- **Expected result:** Authorization is denied and no rows are returned.
- **Verification:** Record only status/error category with credentials and response details redacted. Actual anon writes and RPC invocation were already exercised in isolation and are not sent to production.
- **Stop condition:** Any row is returned or the request does not demonstrably use the anon role.
- **Rollback:** None toward broader access. Stop and inspect cache, JWT role mapping, and surviving grants.

### Checkpoint 14 — verify the public statistics dashboard

- **Action:** Open the public **Statistikk** UI once after the upload smoke test.
- **Expected result:** Norwegian labels and charts load; `Totalt opplastet` reflects the one accounted upload; all prior dates and municipalities remain visible.
- **Verification:** Compare the displayed total/history to checkpoint 10's Supabase-backed response.
- **Stop condition:** Missing history, fallback-like sample totals, UI error, or unexpected count.
- **Rollback:** Repair service grants with H if access caused the display problem; do not alter data.

### Checkpoint 15 — perform the final historical-data integrity check

- **Action:** Run the post-change A8/A9 queries once.
- **Expected result:** The accounted total change is correct, and the frozen-history cutoff/count/total/fingerprint exactly match checkpoint 1.
- **Verification:** Have the peer compare the recorded values and confirm through G1 that all three function identities remain.
- **Stop condition:** Fingerprint difference, lower/missing totals, unexpected count delta, or any object-definition change.
- **Rollback:** Do not rewrite data. Treat an unexplained fingerprint change as an integrity incident and use the approved backup/point-in-time process only after separate incident review.

### Later checkpoint 16 — optional RLS

- **Action:** In a new reviewed window, apply F only after isolated validation and fresh baselines.
- **Expected result:** Public denial remains and service-role read/RPC paths behave identically.
- **Verification:** Repeat checkpoints 9–15 with exactly one newly accounted upload.
- **Stop condition:** Any service regression, unexpected role behavior, fallback, or data discrepancy.
- **Rollback:** Disable RLS with F's rollback statement; keep all ACL/default hardening.

## 9. Application smoke tests

Use these tests at the production checkpoints; none is a destructive probe.

1. **Normal upload:** choose one approved, non-sensitive, minimal valid fixture. Upload once through the ordinary production UI. Do not replay the request and do not use health `write=true` as a substitute.
2. **Exactly-once legacy increment:** immediately before and after the upload, use A8 to compare `upload_events`. Expected delta is exactly `+1`, adjusted only for separately documented concurrent real uploads. Never “clean up” the count.
3. **Stats API:** request `/api/stats`; require HTTP success, `ok: true`, `source: "supabase"`, previous first date/history, and the expected new total. A successful response with `source: "file"` is a failure because fallback can hide lost service-role reads.
4. **Public Norwegian UI:** open **Statistikk** and confirm “Anonym oversikt over filopplastinger,” “Totalt opplastet,” daily/hourly history, municipality display, and charts load with the same total as the API.
5. **Health:** request `GET /api/track/health` with no `write=true` and no secret. Require `configured: true`, `canQuery: true`, and `ok: true`. Do not trigger a `health_check` write solely for smoke testing. Existing authorized keepalive scheduling can continue and should be observed, not manually duplicated.
6. **No anonymous table access:** require G2 false for all table privileges for `anon` and `authenticated`, then perform at most a read-only anon Data API request and require authorization denial/no rows. Do not attempt production insert, change, delete, or truncate probes.
7. **No anonymous RPC access:** require G3 false for all three identities for both public client roles. Actual denied RPC requests are performed in the disposable environment. A production RPC request is intentionally omitted because a misconfiguration could increment a real count.

The browser's upload tracking is best effort and does not block parsing. A successful upload UI alone therefore does not prove the database write worked. The database aggregate delta and `source: "supabase"` are mandatory evidence.

## 10. Risks and stop conditions

| Risk | Detection / mitigation | Mandatory stop condition |
|---|---|---|
| Service-role access accidentally revoked | Pair every current-object revocation with E; run G2/G3 and health before an upload. | Any required service privilege false, health read failure, RPC delta zero, or stats fallback. Apply H only and stop. |
| Data API schema-cache delay | Use the supported refresh path or wait a defined short window; repeat allowed and denied checks. | Conflicting SQL/API results after one controlled refresh window. Do not continue on ambiguous cache state. |
| RLS affects server path | Exclude RLS from first hardening; prove it in isolation; never force RLS. | Any RLS-enabled service read/write regression. Disable RLS, retain ACL hardening, and stop. |
| Stale application deployment | Record deployed version and named RPC payload before database changes; retain obsolete overloads service-only. | Deployment cannot be tied to the reviewed service-role contract or uses a public client role. |
| Obsolete RPC callers | Function-call tracking is unavailable, so absence of repository calls is not proof of absence. Retain definitions and service execution for a compatibility window. | Evidence of a legitimate public-client caller: stop and redesign that caller server-side; do not restore public execution. |
| Fallback file hides a failed Supabase write/read | Require DB delta and `/api/stats source: "supabase"`; local fallback is not durable on serverless filesystems and is not merged. | Any `source: "file"`, Supabase error log, DB delta zero, or `stored` response unsupported by DB evidence. |
| Accidental count increments | One ordinary upload only; baseline immediately; never invoke production RPC directly or use health write. | More/fewer increments than accounted for. Preserve data, stop, and investigate; never decrement. |
| Historical-data integrity | ACL/default/RLS statements do not alter data; compare frozen-history fingerprint and aggregates. | Lower totals, changed frozen-history fingerprint, missing rows/dates, or unexpected object definition. Treat as incident; do not recreate/normalize. |
| Incomplete revocation through `PUBLIC` | Revoke `PUBLIC` explicitly and use ACL expansion plus effective role checks. | Any anon/auth capability remains true even when direct grants appear absent. Find inherited grant before proceeding. |
| Default ACL correction incomplete | Inspect both global and schema-specific entries for both creators. | Any relevant grant remains for `PUBLIC`, `anon`, or `authenticated`, or the operator lacks permission for the named creator. |
| Dashboard setting changes existing exposure | Verify stats immediately after the toggle and leave current schema/object routes alone. | Existing server object becomes unavailable or setting semantics differ from review. Restore only legacy exposure and stop. |
| Unauthorized information exposure during work | Record only aggregate counts, ACL metadata, and redacted deployment identifiers. | A key, JWT, URL with secret/query credential, environment value, or row-level upload data appears in output. Stop, contain, and rotate through the approved incident process. |

Execution must also stop immediately if any proposed command would target an identity different from section 4, if an operator proposes a name-only function command, if a change would alter object definitions or data, or if peer verification is unavailable. Do not “complete the bundle” after a failed checkpoint.

## 11. Final recommendation

The first production hardening should **not include RLS**. First correct the dashboard new-table setting, both creators' default ACLs, the current table ACL, and all three exact function ACLs. Verify the real service-role PostgREST path and public denial at each checkpoint. RLS is valuable defense in depth, but only in a later reviewed window after isolated proof.

`public.aggregates` and `public.increment_aggregate` should **remain in the Data API temporarily**. The existing server relies on those Data API routes even though it authenticates as `service_role`. Privilege-denied public roles provide the compatible intermediate control; removing API exposure without proof risks breaking reads, health, and writes.

The obsolete seven- and eight-parameter overloads should **not be dropped now**. Revoke their public execution immediately, retain service-role/owner execution for the rollback window, audit deployment history and callers, and remove each later by exact signature under a separate peer-reviewed change.

After this report receives peer approval, the exact next safe action is to provision or designate an isolated non-production Supabase/PostgREST environment and execute the section 7 validation plan with synthetic data and test-only credentials. Production remains untouched until those results are reviewed.

The recommended first production scope, after that validation, is only: turn off automatic new-table exposure; correct `postgres` and `supabase_admin` defaults; revoke table privileges from `PUBLIC`/`anon`/`authenticated`; grant the minimum table path to `service_role`; revoke exact overload execution from public client principals; retain exact overload execution for `service_role`/`postgres`; then run the checkpointed smoke and integrity checks. No RLS, API-object removal, overload deletion, telemetry, source change, migration, or historical-data operation belongs in that first window.
