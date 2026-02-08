# Supabase / aggregates SQL Cheat Sheet 🧾

Quick reference SQL commands for managing and debugging the `public.aggregates` table and `increment_aggregate` function in the `gmi-validator` Supabase project.

> Run these in Supabase Console → SQL Editor (or via psql/supabase CLI if you prefer).

---

## 1) Check table / columns

Show whether the table exists and list columns:

```sql
-- Does table exist?
SELECT to_regclass('public.aggregates');

-- List columns exactly
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'aggregates'
ORDER BY ordinal_position;
```

---

## 2) Create table + function (idempotent)

This is the creation SQL (also available in `src/features/user-tracking/supabase.sql`):

```sql
CREATE TABLE IF NOT EXISTS public.aggregates (
  date date NOT NULL,
  hour smallint NOT NULL,
  area_type text NOT NULL,
  area_id text NOT NULL,
  area_name text,
  country text,
  region text,
  event_type text NOT NULL,
  count bigint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (date, hour, area_type, area_id, event_type)
);

CREATE OR REPLACE FUNCTION public.increment_aggregate(
  p_date date,
  p_hour smallint,
  p_area_type text,
  p_area_id text,
  p_area_name text,
  p_country text,
  p_region text,
  p_event_type text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.aggregates (
    date, hour, area_type, area_id, area_name, country, region, event_type, count, created_at, updated_at
  ) VALUES (
    p_date, p_hour, p_area_type, p_area_id, p_area_name, p_country, p_region, p_event_type, 1, now(), now()
  )
  ON CONFLICT (date, hour, area_type, area_id, event_type)
  DO UPDATE SET count = public.aggregates.count + 1, updated_at = now();
END;
$$;
```

> If you already created the table without `hour`, run the migration in `src/features/user-tracking/supabase_hourly_migration.sql`.

---

## 3) Migration (add `hour` column + PK change)

If your table lacked `hour`, run the migration script (in `src/features/user-tracking/supabase_hourly_migration.sql`). Example commands (idempotent-ish):

```sql
-- add column if missing
ALTER TABLE public.aggregates
  ADD COLUMN IF NOT EXISTS hour smallint NOT NULL DEFAULT 0;

-- drop and re-create PK to include hour (careful on production)
ALTER TABLE public.aggregates DROP CONSTRAINT IF EXISTS aggregates_pkey;
ALTER TABLE public.aggregates
  ADD CONSTRAINT aggregates_pkey PRIMARY KEY (date, hour, area_type, area_id, event_type);

-- replace function to accept p_hour and use it
-- (see supabase_hourly_migration.sql for full function)
```

Notes: if your table is large, run this in a maintenance window; adding a column with a non-null default may lock the table briefly. Consider adding column nullable then backfill and set not null.

---

## 4) Quick verification queries

Recent aggregates:

```sql
SELECT date, hour, area_type, area_id, area_name, event_type, count, updated_at
FROM public.aggregates
ORDER BY updated_at DESC
LIMIT 50;
```

Count by kommune per day:

```sql
SELECT date, area_id, area_name, SUM(count) AS total
FROM public.aggregates
WHERE area_type = 'kommune'
GROUP BY date, area_id, area_name
ORDER BY date DESC, total DESC
LIMIT 100;
```

Hourly distribution for a kommune:

```sql
SELECT date, hour, SUM(count) AS total
FROM public.aggregates
WHERE area_type = 'kommune' AND area_id = 'sandefjord'
GROUP BY date, hour
ORDER BY date DESC, hour;
```

---

## 5) Health / test rows

Show health-test rows:

```sql
SELECT * FROM public.aggregates WHERE area_type = 'health-test' ORDER BY updated_at DESC LIMIT 50;
```

Delete health-test rows (if you want to clean up):

```sql
DELETE FROM public.aggregates WHERE area_type = 'health-test';
```

---

## 6) Call the increment RPC manually (useful for testing)

In SQL editor (server-side):

```sql
SELECT public.increment_aggregate(
  CURRENT_DATE,
  EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC')::smallint,
  'kommune',
  'test-kommune',
  'Test Kommune',
  'NO',
  '07',
  'upload_success'
);
```

Or from server-side code via Supabase client (see `src/lib/tracking/supabase.js`).

---

## 7) Backup / quick export

Export recent rows (CSV):

```sql
COPY (
  SELECT * FROM public.aggregates WHERE date >= CURRENT_DATE - INTERVAL '30 days'
) TO STDOUT WITH CSV HEADER;
```

Or use Supabase UI Export feature.

---

## 8) Cleanup older data (retention)

Example: remove data older than 365 days:

```sql
DELETE FROM public.aggregates WHERE date < (CURRENT_DATE - INTERVAL '365 days');
```

Consider archiving before deletion if needed.

---

## 9) Troubleshooting tips

- If `SELECT to_regclass('public.aggregates')` returns `null`, you ran the SQL in the wrong project or the table hasn't been created.
- If `increment_aggregate` RPC returns errors, check function exists:
  ```sql
  SELECT proname FROM pg_proc WHERE proname = 'increment_aggregate';
  ```
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` values in project settings and environment variables if the server-side RPC calls fail.

---

If you'd like, I can also add a small `scripts/` folder with a one-off Node script that runs the migration or performs a backup. Want that? ✨
