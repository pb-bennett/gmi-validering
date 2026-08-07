# Richer upload telemetry database validation

**Validation date:** 2026-08-07

**Stage:** 1, additive database contract

**Environment:** Disposable Supabase project only

**Implementation record:** `docs/agent-reports/20260807-richer-upload-telemetry-database-implementation.md`

**Result:** PASSED

## 1. Purpose and safety boundary

This record documents the manual runtime validation of the reviewed additive SQL contract for richer upload telemetry. The validation was performed against the disposable Supabase project only.

No production Supabase change was made. No application telemetry was enabled. No Vercel change, deployment, commit, push, merge, or PR was performed.

This record contains no project URL or reference, credential value, secret, token, cookie, request identifier, private identifier, upload filename, file content, coordinate, or row-level production data.

## 2. Preflight

Before the migration, the disposable project did not contain:

- `public.upload_metric_daily`;
- `public.municipality_resolution_daily`; or
- `public.increment_upload_diagnostics`.

### Disposable legacy baseline

Before migration, the disposable `public.aggregates` baseline was:

- owner: `postgres`;
- RLS: enabled (`true`);
- FORCE RLS: disabled (`false`);
- raw ACL: `{postgres=arwdDxtm/postgres,service_role=arw/postgres}`;
- row count: `5`; and
- event count: `8`.

### Existing legacy RPC baseline

All three existing `increment_aggregate` overloads were owned by `postgres`, were `SECURITY INVOKER`, and had the raw ACL `{postgres=X/postgres,service_role=X/postgres}`:

1. `increment_aggregate(date,smallint,text,text,text,text,text,text,text)`
2. `increment_aggregate(date,smallint,text,text,text,text,text,text)`
3. `increment_aggregate(date,text,text,text,text,text,text)`

## 3. Migration execution

The full `src/features/user-tracking/supabase_richer_usage_diagnostics.sql` script was executed as one transaction in the disposable project.

The SQL Editor result was successful and returned no rows.

## 4. New table metadata

### `public.municipality_resolution_daily`

- owner: `postgres`;
- RLS: enabled (`true`);
- FORCE RLS: disabled (`false`);
- policy count: `0`; and
- raw ACL: `{postgres=arwdDxtm/postgres,service_role=arw/postgres}`.

### `public.upload_metric_daily`

- owner: `postgres`;
- RLS: enabled (`true`);
- FORCE RLS: disabled (`false`);
- policy count: `0`; and
- raw ACL: `{postgres=arwdDxtm/postgres,service_role=arw/postgres}`.

Both new tables therefore have ordinary RLS enabled without public policies, while owner and service-role ACLs match the reviewed contract.

## 5. New RPC metadata

The exact new function identity was:

```text
increment_upload_diagnostics(text,text,text,text,text,text,text,text,text,text,text,text,text,text,smallint,text,text,text)
```

Observed metadata:

- owner: `postgres`;
- language: `plpgsql`;
- security: `SECURITY INVOKER`;
- volatility: `VOLATILE`;
- custom settings: none; and
- raw ACL: `{postgres=X/postgres,service_role=X/postgres}`.

## 6. Effective privilege verification

The effective checks returned:

| Role | New-table privileges | New RPC `EXECUTE` |
|---|---|---:|
| `anon` | No `SELECT`, `INSERT`, `UPDATE`, or `DELETE` on either table | false |
| `authenticated` | No `SELECT`, `INSERT`, `UPDATE`, or `DELETE` on either table | false |
| `service_role` | `SELECT`, `INSERT`, and `UPDATE` true on both tables; `DELETE` false | true |
| `postgres` | All tested table privileges true | true |

This confirmed the explicit object ACLs and the intended SECURITY INVOKER service path.

## 7. Synthetic RPC tests

### 7.1 First valid call

A valid GMI category set was executed under `SET LOCAL ROLE service_role`.

Observed result:

- successful `void` return;
- exactly `15` rows in `upload_metric_daily`;
- `upload_metric_daily` total count: `15`;
- exactly `1` row in `municipality_resolution_daily`; and
- `municipality_resolution_daily` total count: `1`.

The fifteen metric rows represent independent counters, not a combined per-upload fact row.

### 7.2 Repeated valid call

The same payload was executed again successfully.

Observed result:

- `upload_metric_daily` remained at `15` rows and total count became `30`; and
- `municipality_resolution_daily` remained at `1` row and total count became `2`.

This confirmed the `ON CONFLICT` increment behavior and shared counters for the same daily category keys.

### 7.3 Invalid call and atomicity

The telemetry schema version was deliberately set to `2`.

The call was rejected with:

- SQLSTATE `22023`; and
- fixed error `invalid upload diagnostics contract`.

Totals remained unchanged at `15` metric rows / `30` metric increments and `1` resolution row / `2` resolution increments. No partial writes occurred.

## 8. Anonymous Data API denial

### Table read

An anonymous public-client read of `upload_metric_daily` returned:

- HTTP `401`;
- PostgREST/PostgreSQL code `42501`;
- `permission denied for table`; and
- no rows.

### RPC call

An anonymous public-client call to `increment_upload_diagnostics` returned:

- HTTP `401`;
- code `42501`;
- `permission denied for function`; and
- no RPC execution.

These tests confirmed that the new objects are not anonymously authorized through the Data API.

## 9. Server Data API verification

### RPC write

A valid different synthetic SOSI category set was submitted using the server Secret credential through the API-key credential channel. The request returned HTTP `204 No Content`, and the RPC executed successfully.

After that call:

- `upload_metric_daily`: `25` rows, total count `45`; and
- `municipality_resolution_daily`: `2` rows, total count `3`.

The result demonstrates independent shared counters while adding rows for new category keys.

### Table read

A server-side Data API read returned HTTP `200` with `25` aggregate rows.

Representative counts included:

| Metric/value | Count |
|---|---:|
| `app_version` / `test-1` | 3 |
| `coordinate_status` / `available` | 3 |
| `crs_status` / `declared` | 3 |
| `telemetry_schema_version` / `1` | 3 |
| `file_format` / `gmi` | 2 |
| `file_format` / `sosi` | 1 |
| `epsg_category` / `epsg_25832` | 2 |
| `epsg_category` / `epsg_25833` | 1 |

This confirmed that server-side Data API reads work under RLS.

## 10. Direct table constraint tests

### Metric-value contract

`service_role` attempted to insert an `upload_metric_daily` row with the file format value `definitely_not_a_real_format`.

The insert was rejected with:

- SQLSTATE `23514`; and
- constraint `upload_metric_daily_metric_value_contract`.

Totals remained unchanged at `25` rows / `45` increments and `2` rows / `3` resolution increments.

### Resolution-value contract

`service_role` attempted to insert a `municipality_resolution_daily` row with resolution outcome `made_up_outcome`.

The insert was rejected with:

- SQLSTATE `23514`; and
- constraint `municipality_resolution_daily_value_contract`.

These tests confirmed that fixed database constraints protect the domains even at the table boundary.

## 11. Timestamp and upsert verification

For the `file_format=gmi` row:

- row count: `2`;
- `created_at` remained the original value;
- `updated_at` was later than `created_at`; and
- `was_updated`: `true`.

This confirmed that conflict updates increment the counter and refresh `updated_at` without replacing the original creation timestamp.

## 12. Legacy preservation

After validation, `public.aggregates` remained exactly:

- `5` rows;
- `8` events;
- owner `postgres`;
- the same RLS state;
- the same FORCE RLS state; and
- the same ACL.

All three existing `increment_aggregate` overloads remained unchanged in signature, owner, `SECURITY INVOKER` status, and ACL.

No legacy table or function was altered by the additive migration or validation tests.

## 13. Catalog verification

PostgreSQL catalog inspection confirmed:

- both primary keys;
- both non-negative count constraints;
- both fixed-value contract constraints;
- `upload_metric_daily_metric_date_value_idx`;
- `municipality_resolution_daily_outcome_date_idx`;
- `municipality_resolution_daily_format_date_idx`; and
- the normal primary-key indexes.

## 14. Operational credential-channel lesson

Modern Supabase `sb_secret_*` credentials are API-key credentials, not JWT bearer tokens. The disposable validation initially treated the Secret credential as a bearer token and received HTTP `401`. Repeating the request using only the `apikey` credential channel returned HTTP `204`.

No actual key or raw request header is included in this record.

## 15. Conclusion and next-stage boundary

Stage 1 disposable database validation **PASSED**.

The additive SQL contract is suitable to advance to the next reviewed stage. The validation demonstrated:

- correct creation and metadata for both new RLS-protected tables;
- fixed database domains and non-negative counters;
- service-only effective table/RPC access;
- successful transactional counter increments and conflict updates;
- rejection of invalid input before partial writes;
- anonymous Data API denial;
- successful server-side RPC and table reads; and
- no change to the legacy table or existing RPC overloads.

This result does not authorize production migration. It does not enable application telemetry. No production Supabase change was made.
