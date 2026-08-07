# Supabase access-hardening runbook (review only)

**Status:** Revised after isolated validation on 2026-08-06/07. This is planning and peer-review material only. The validation did not authorize production work, and no production SQL has been executed from this runbook.

**Repository / documentation branch:** `C:\GitHub\gmi-validering` / `docs/supabase-hardening-validation-20260807`

**Related records:** `docs/agent-reports/20260731-richer-usage-statistics-design.md` and `docs/agent-reports/20260807-supabase-hardening-validation.md`

> **Production safety gate:** Do not execute any production SQL merely because the isolated validation passed. The required flow is human review of this revision, Git diff review, an approved documentation-only commit and PR, and then a separately planned production hardening session. In that later session, execute one reviewed action/checkpoint at a time and verify it before continuing.

Do not copy credentials, JWTs, project URLs, environment values, or row-level production data into this runbook, SQL transcripts, tickets, or version control.

## 1. Objective and first-production boundary

The objective is to remove direct access to the existing statistics objects from `PUBLIC`, `anon`, and `authenticated`, preserve the minimum server-side Data API path, and correct defaults that the normal hosted SQL operator can control.

The first production hardening is deliberately limited to:

1. turn **Automatically expose new tables** off, while keeping `public` in the Data API exposed-schema list;
2. correct global and `public`-schema default ACLs for objects created by `postgres`;
3. reset the existing `service_role` table ACL before granting only `SELECT`, `INSERT`, and `UPDATE` on `public.aggregates`;
4. revoke table access from `PUBLIC`, `anon`, and `authenticated`;
5. revoke execution from `PUBLIC`, `anon`, and `authenticated` on all three exact `public.increment_aggregate` overloads, while explicitly retaining `service_role` execution; and
6. verify database privileges, anonymous Data API denial, server reads, one accounted application write, statistics readback, and historical-data integrity.

The first production hardening does **not**:

- enable RLS or create RLS policies;
- alter default privileges owned by `supabase_admin`;
- remove `public` from the Data API exposed schemas or assume a dashboard table count removes a REST/RPC route;
- drop either obsolete RPC overload;
- change table/function definitions, rows, migrations, application code, credentials, maximum API rows, or deployment settings other than the named dashboard toggle.

The production table and all historical values must remain in place. The previously inspected production baseline was 299 `upload_success` aggregate rows representing 551 uploads, plus 124 `health_check` events. Treat those as historical lower bounds to reconcile, not as current expected totals.

## 2. Current application contract

The following behavior was rechecked on the documentation branch:

| Contract | Repository evidence | Consequence for hardening |
|---|---|---|
| Server-only Supabase client | `src/lib/tracking/supabase.js` reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, calls `createClient(...)`, and disables session persistence. | No browser code needs a Supabase key or direct database privilege. The existing environment-variable name remains valid even when its value is a modern `sb_secret_...` credential. Never record the value. |
| Tracking request policy | `src/lib/tracking/trackingRequestPolicy.mjs` permits only `upload_success`, constrains request shape/body size, and checks same-origin-related headers. | The production smoke write should use the real same-origin application path, not a direct production RPC call. |
| Tracking handler | `src/lib/tracking/trackingHandler.mjs` validates, optionally resolves a municipality, and calls the injected increment function once. | A successful route response alone is not database proof. |
| Storage behavior | `src/lib/tracking/aggregates.js` tries Supabase first and falls back to a local JSON file if Supabase is absent or the RPC helper returns `false`. | Require a direct database delta after the write; `stored: true` can describe file fallback. |
| Current RPC | `src/lib/tracking/supabase.js` calls `increment_aggregate` with nine named arguments: `p_date`, `p_hour`, `p_area_type`, `p_area_id`, `p_area_name`, `p_kommune_number`, `p_country`, `p_region`, `p_event_type`. | The current server requires exact nine-parameter function execution. |
| Statistics | `src/app/api/stats/route.js` reads `aggregates` with the same server client, filters `upload_success`, and falls back to the local file on a Supabase error. | A valid post-change response must say `source: "supabase"`; HTTP 200 by itself is insufficient. |
| Health | `src/app/api/track/health/route.js` performs a table read; only `write=true` plus the keepalive secret invokes the nine-parameter RPC. | Use the default read-only health request during ACL checkpoints. |
| Environment documentation | `README.md` and `src/features/user-tracking/README.md` document `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. | Do not rename the repository variable as part of database hardening. |

The minimum runtime privileges are:

- `USAGE` on schema `public` for `service_role`;
- `SELECT`, `INSERT`, and `UPDATE` on table `public.aggregates` for `service_role`; and
- `EXECUTE` on the current nine-parameter RPC for `service_role`.

The functions are `SECURITY INVOKER`, so the RPC role needs the underlying table privileges. The current application does not require table `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, or `MAINTAIN`. The obsolete seven- and eight-parameter overloads are not used by current source, but retain service-only execution temporarily for stale-deployment rollback compatibility.

## 3. Hosted Supabase default-ACL boundary

PostgreSQL default privileges belong to an object-creating role. Global and schema-specific defaults are additive, so both scopes must be inspected and, for `postgres`, corrected.

In the hosted isolated project, `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ...` failed with `permission denied to change default privileges`; the normal SQL operator was not a member of the managed `supabase_admin` role. Therefore:

- this runbook contains **no** instruction to alter `supabase_admin` defaults;
- it does not propose role membership, ownership changes, privilege escalation, or another workaround;
- production preflight still reads `supabase_admin` default ACLs so residual platform-managed behavior is visible; and
- any unsafe `supabase_admin`-owned defaults that remain are an explicit hosted-platform limitation and residual risk, not a failed reason to improvise during the production window.

The six `postgres` default-ACL corrections in section 6 were successfully validated. They remove public-client defaults for future `postgres`-created tables, sequences, and functions at both global and `public`-schema scope.

## 4. Exact RPC inventory

Every function ACL statement must use one of these complete identity signatures. A name-only statement is prohibited.

```text
public.increment_aggregate(date, text, text, text, text, text, text)
```

This obsolete overload has seven parameters and omits `hour` and `kommune_number`.

```text
public.increment_aggregate(date, smallint, text, text, text, text, text, text)
```

This obsolete overload has eight parameters and omits `kommune_number`.

```text
public.increment_aggregate(date, smallint, text, text, text, text, text, text, text)
```

This current overload has nine parameters in the application order documented in section 2. The inspected functions are owned by `postgres`; ownership gives the owner inherent control, so the procedure does not try to narrow or re-grant ordinary owner powers.

No overload is dropped, replaced, or invoked directly in production by this procedure.

## 5. Read-only production preflight

Run this section only in a separately approved production session. Record results privately and stop on a mismatched object, owner, signature, RLS state, policy, role, baseline, or deployed application contract.

```sql
-- P1. Required principals.
SELECT rolname, rolcanlogin, rolbypassrls
FROM pg_roles
WHERE rolname IN (
  'anon', 'authenticated', 'service_role', 'postgres', 'supabase_admin'
)
ORDER BY rolname;

-- P2. Table identity, owner, RLS state, and raw ACL.
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

-- P3. Expanded table ACL. This includes MAINTAIN when present.
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

-- P4. Effective table privileges, explicitly including MAINTAIN.
SELECT
  role_name,
  has_schema_privilege(role_name, 'public', 'USAGE') AS schema_usage,
  has_table_privilege(role_name, 'public.aggregates', 'SELECT') AS can_select,
  has_table_privilege(role_name, 'public.aggregates', 'INSERT') AS can_insert,
  has_table_privilege(role_name, 'public.aggregates', 'UPDATE') AS can_update,
  has_table_privilege(role_name, 'public.aggregates', 'DELETE') AS can_delete,
  has_table_privilege(role_name, 'public.aggregates', 'TRUNCATE') AS can_truncate,
  has_table_privilege(role_name, 'public.aggregates', 'REFERENCES') AS can_reference,
  has_table_privilege(role_name, 'public.aggregates', 'TRIGGER') AS can_trigger,
  has_table_privilege(role_name, 'public.aggregates', 'MAINTAIN') AS can_maintain
FROM (VALUES
  ('anon'), ('authenticated'), ('service_role'), ('postgres')
) AS roles(role_name)
ORDER BY role_name;

-- P5. Exact function inventory, owner, mode, settings, and raw ACL.
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

-- P6. Effective execution on all exact identities.
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

-- P7. Global and public-schema default ACLs. Inspection includes the managed
-- supabase_admin defaults, but the procedure changes only postgres defaults.
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

-- P8. Confirm RLS policy inventory.
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'aggregates'
ORDER BY policyname;

-- P9. Non-sensitive aggregate baseline.
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

-- P10. Frozen-history fingerprint. Record cutoff and result privately.
-- The current UTC date is excluded because legitimate uploads may change it.
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

Preflight requirements include: exactly the three identities in section 4; `postgres` ownership as previously inspected; `service_role` schema usage; no unexpected RLS/policy state; totals at least reconcilable with the historical inspection; and a deployed server using the nine-parameter environment-based path. Stop rather than adapting SQL to a mismatch.

## 6. First-production actions

These are proposed actions for a future separately approved production session. Each numbered item is a stop/go checkpoint. Do not paste the whole section into an SQL editor.

### Action 1 — Data API dashboard setting

Turn **Automatically expose new tables** off. Do not change the exposed-schema list (`public`, `graphql_public`) or Max rows in this action.

Three concepts must remain distinct:

- schema exposure determines which schemas PostgREST considers;
- PostgreSQL object privileges determine whether the caller may use an available table or function route; and
- the dashboard automatic-exposure setting affects dashboard/platform handling of new objects but is not proof that a PostgREST route does or does not exist.

The isolated dashboard later displayed “0 of 2 tables exposed,” while the real REST path remained usable by the server credential and denied to the anonymous role through PostgreSQL privileges. Therefore never use that count as route evidence, and do not claim the toggle alone removes routes. After changing it, require `/api/stats` to return `source: "supabase"`; otherwise restore only this toggle to its recorded prior value and stop.

### Actions 2.1–2.6 — correct `postgres` defaults

Execute each statement individually in the listed order. After each statement, rerun P7 and verify only the intended `postgres` default entry changed. These statements affect future objects only.

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
```

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
```

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
```

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
```

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
```

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
```

Expected result: P7 has no relevant `postgres`-created table, sequence, or function default for `PUBLIC`, `anon`, or `authenticated` at either scope. Residual `supabase_admin` defaults are reported, not modified. There is no routine rollback to broad unsafe defaults; on an unexpected result, stop before current-object changes.

### Action 3 — atomically reset the current table ACL

This is one reviewed table-authorization checkpoint. Execute the complete transaction as written so the service role never observes the intermediate all-revoked state. If any statement fails, do not force completion; confirm the transaction rolled back and stop.

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

The second `REVOKE` is essential: a narrower `GRANT` does not remove broader privileges already held by `service_role`. Do not grant table privileges to `postgres`; when preflight confirms it is the owner, its owner powers remain.

Immediately rerun P3 and P4. Required effective result:

- `anon` and `authenticated`: all listed table privileges false;
- `service_role`: `SELECT`, `INSERT`, and `UPDATE` true; `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, and `MAINTAIN` false; and
- `postgres`: owner privileges remain effective.

Then call `GET /api/track/health` without `write=true`; require `ok: true`, `configured: true`, `canQuery: true`, and `wrote: false`.

### Actions 4.1–4.3 — harden each exact function

Run one transaction, verify P5/P6 for that exact identity, and confirm `/api/stats` remains `source: "supabase"` before moving to the next transaction.

```sql
BEGIN;
REVOKE EXECUTE ON FUNCTION public.increment_aggregate(
  date, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_aggregate(
  date, text, text, text, text, text, text
) TO service_role;
COMMIT;
```

```sql
BEGIN;
REVOKE EXECUTE ON FUNCTION public.increment_aggregate(
  date, smallint, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_aggregate(
  date, smallint, text, text, text, text, text, text
) TO service_role;
COMMIT;
```

```sql
BEGIN;
REVOKE EXECUTE ON FUNCTION public.increment_aggregate(
  date, smallint, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_aggregate(
  date, smallint, text, text, text, text, text, text, text
) TO service_role;
COMMIT;
```

For every identity, `anon` and `authenticated` execution must be false, while `service_role` and owner `postgres` execution must be true. If an identity is missing or differs, stop; do not substitute a name-only operation. Do not call obsolete overloads and do not drop them.

## 7. Post-change verification

Perform each checkpoint once and stop on any mismatch.

1. Rerun P2–P10. Require unchanged object definitions, RLS state, policy inventory, frozen-history cutoff/count/event total/fingerprint, and the effective privilege results in section 6. P4 must explicitly show `service_role.can_maintain = false`.
2. Request `GET /api/track/health` without `write=true`. Require HTTP 200, `ok: true`, `configured: true`, `canQuery: true`, and `wrote: false`.
3. Request `/api/stats`. Require HTTP 200, `ok: true`, `source: "supabase"`, the expected total, and complete prior history. `source: "file"` is a failure even with HTTP 200.
4. Using the production project’s Supabase Publishable key without recording it, make one unauthenticated/public-client read-only request to `/rest/v1/aggregates?select=*&limit=1`. Supply only the Publishable key in the request form documented for public-client access; do not include an end-user `Authorization` header or JWT that could select a different database role. Immediately before the production session, verify against the then-current official Supabase documentation and dashboard semantics that this exact request form represents the anonymous role. Do not create `identity_probe()` or any other production probe object to establish the role. If the role semantics cannot be established confidently, stop rather than improvise. Require permission denied with no row data. Do not send a production anonymous write or RPC probe.
5. Through the ordinary same-origin application UI, upload one approved, non-sensitive minimal fixture exactly once in a quiet window. Do not call the production RPC directly and do not use health `write=true` as a substitute.
6. Compare P9 immediately before and after the application action. Require an `upload_events` delta of exactly `+1`, accounting separately for any concurrent real upload. `POST /api/track` returning `stored: true` is not sufficient because the implementation can fall back to a file.
7. Request `/api/stats` again. Require `source: "supabase"`, the new exact total, and the expected daily/hourly/municipality/heatmap/timeline representation in the public statistics UI.
8. Rerun P10 with the original cutoff semantics. Require the frozen historical rows, event total, and fingerprint to match the pre-change record exactly.

Do not delete or decrement the accounted smoke-test aggregate. If an unexplained data difference appears, stop and treat it as an integrity incident; ACL rollback must not rewrite data.

## 8. Rollback and repair boundaries

Rollback must be checkpoint-local and must not restore the unsafe public-client grants or the old broad `service_role` table ACL.

- If Action 1 alone caused a verified server-path regression, restore only **Automatically expose new tables** to its recorded prior value and stop. Do not change exposed schemas as an improvised repair.
- The `postgres` default corrections do not affect existing objects. Do not restore broad defaults as routine rollback; stop and review the exact unexpected default entry.
- If current table access is wrong, restore/reconfirm only the intended runtime table set:

```sql
GRANT SELECT, INSERT, UPDATE ON TABLE public.aggregates
  TO service_role;
```

- If an exact RPC’s service execution is wrong, restore/reconfirm only that exact identity. For the current application path:

```sql
GRANT EXECUTE ON FUNCTION public.increment_aggregate(
  date, smallint, text, text, text, text, text, text, text
) TO service_role;
```

Use the corresponding exact seven- or eight-parameter signature only if verification of that compatibility overload failed. The procedure never revokes schema `USAGE`, so rollback does not include a schema grant. It never reduces `postgres` owner powers, so rollback does not include an owner grant.

There is intentionally no normal rollback that grants table access or function execution to `PUBLIC`, `anon`, or `authenticated`. Repair the server-only path and stop for review.

## 9. Future-object behavior and application grants

The isolated probe after correcting `postgres` defaults observed:

| Future object created by `postgres` | Observed public-client access | Other observed access |
|---|---|---|
| Synthetic table with identity column | No table privilege for `PUBLIC`, `anon`, or `authenticated`. | `postgres` retained owner privileges. `service_role` still showed some administrative/default privileges, including `MAINTAIN`, `REFERENCES`, `TRIGGER`, and `TRUNCATE`. |
| Identity sequence | No sequence privilege for `PUBLIC`, `anon`, or `authenticated`. | `postgres` had `SELECT`/`UPDATE`/`USAGE`; `service_role` had `UPDATE`. |
| `public.future_acl_function_probe()` | `anon` and `authenticated` could not execute. Raw ACL was `{postgres=X/postgres}`. | `service_role` could not execute; `postgres` could. |

These are observations, not a complete causal attribution. The dashboard automatic-exposure setting was also changed during the experiment, so do not claim every residual `service_role` privilege came from a particular default or toggle.

For every future application object, inspect the actual ACL after creation. If a future server RPC is created by `postgres`, its reviewed creation change must include an explicit exact-signature `GRANT EXECUTE ... TO service_role`; corrected defaults intentionally do not provide that grant. If a future table should have a minimal server ACL, its creation change should explicitly reset any existing `service_role` privileges before granting its documented minimum, following the lesson from `public.aggregates`.

Do not create production probe objects merely to repeat the isolated test.

## 10. RLS: validated option, separate decision

The isolated project successfully ran with:

```sql
ALTER TABLE public.aggregates ENABLE ROW LEVEL SECURITY;
```

No policies were created, forced RLS remained off, anonymous access stayed denied, the modern server Secret key could read and invoke the RPC, and the real Next.js health/stats/track paths worked end to end. This is useful compatibility evidence, but it does not expand the first production scope.

RLS may be proposed later as defense in depth in a new reviewed window with a fresh baseline and rollback plan. If that separate change is approved, do not enable forced RLS and do not add public policies. Its checkpoint-local rollback would be:

```sql
ALTER TABLE public.aggregates DISABLE ROW LEVEL SECURITY;
```

That later rollback would retain all ACL/default hardening. No RLS statement in this section belongs to Actions 1–4 above.

## 11. Risks and mandatory stop conditions

| Risk | Required control | Stop condition |
|---|---|---|
| Broad service privileges survive a narrower grant | Action 3 explicitly revokes all `service_role` table privileges before granting the minimum. | Any service `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, or `MAINTAIN` remains true. |
| Public access survives through `PUBLIC` or inheritance | Revoke `PUBLIC` explicitly and use effective privilege checks. | Any `anon`/`authenticated` table capability or overload execution is true. |
| Hosted managed defaults remain | Inspect `supabase_admin` defaults but do not try to alter them. | An operator proposes role escalation, ownership changes, or unreviewed workaround SQL. |
| Dashboard wording/count is misread as route state | Verify both server access and anonymous denial through the real Data API. | Route behavior is ambiguous or `/api/stats` falls back. |
| Local fallback masks loss of Supabase access | Require `source: "supabase"` and direct SQL write evidence. | `source: "file"`, a zero/unexplained delta, or Supabase errors. |
| Historical data changes | Compare P9/P10 before and after; ACL/default statements do not modify rows. | Lower totals, missing history, or changed frozen fingerprint. Do not rewrite data. |
| Wrong function overload is targeted | Use only the three exact identities in section 4 and verify after each. | Missing/different identity or proposed name-only SQL. |
| RLS expands first scope | Keep section 10 out of Actions 1–4. | RLS or a policy is included without separate review. |
| Secrets enter records | Use environment/dashboard secret handling and redact transcripts. | Any Secret key, publishable key, JWT, token, or credential is written to repository output. |

## 12. Recommendation and approval flow

The isolated validation supports proceeding to human review of this documentation, not directly to production. The recommended sequence is:

1. review this runbook and the validation record;
2. review the complete Git diff;
3. only after approval, commit and push the documentation branch;
4. obtain PR review;
5. plan a separate production hardening session with an operator and peer verifier; and
6. in that session, run each action/checkpoint with verification before continuing.

The first production window should keep the Data API integration, keep `public` exposed, keep all three overload definitions, correct only controllable `postgres` defaults, reset the existing table ACL to the minimum server set, and harden exact function ACLs. RLS, managed `supabase_admin` defaults, Data API architecture changes, overload deletion, application changes, migrations, and historical-data operations remain separately reviewed work.
