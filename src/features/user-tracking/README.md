# User Tracking (design stub)

Goal

- Collect minimal aggregated data to show adoption by kommune/fylke over time.
- Avoid storing IPs or precise timestamps; favor daily/hourly aggregates.
- Store only the dataset location (from file coordinates).

Scope

- Track events: `upload`, `validation_success`, `validation_failure`.
- Store `date`, `hour` (UTC), area fields, `eventType`, `count`.

Implementation sketch

1. Add a Next.js App Router endpoint: `POST /api/track`.
   - Read `request.geo` (country, region, city, lat/lon).

- If dataset coordinates are provided, call Kartverket kommuneinfo once and
  store that as the dataset kommune.

2. Use a small transactional DB (Postgres/Supabase/Neon) with an `aggregates` table and upsert/increment logic.
3. Expose a read-only admin dashboard (protected) to show adoption by kommune over time.

Privacy & retention

- Retention: 365 days (configurable).
- No IPs or raw coordinates stored; lat/lon used transiently only for mapping and discarded.
- Add a short privacy notice and an admin API to delete all tracking data.

Local storage

- The current implementation writes aggregates to a JSON file. Configure
  `TRACKING_STORAGE_PATH` if you want to store it somewhere else.

Supabase setup

- Run the SQL in `src/features/user-tracking/supabase.sql` to create the
  `aggregates` table and `increment_aggregate` function.
- If you already created the table, apply the migration in
  `src/features/user-tracking/supabase_hourly_migration.sql`.
- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` and Vercel.

Next steps

- Decide DB choice (Postgres recommended) and whether to host in same project or separate service.
- Implement endpoint and polygon lookup library.
- Add unit tests and a small admin UI to view counts.
