# User Tracking (design stub)

Goal
- Collect minimal aggregated data to show adoption by kommune/fylke over time.
- Avoid storing IPs or precise timestamps; favor daily aggregates.

Scope
- Track events: `upload`, `validation_success`, `validation_failure`.
- Store `date`, `areaType` (`kommune`/`fylke`), `areaId`, `areaName`, `eventType`, `count`.

Implementation sketch
1. Add a Next.js App Router endpoint: `POST /api/track`.
   - Read `request.geo` (country, region, city, lat/lon).
   - If `country !== 'NO'`, record `country` aggregate and stop.
   - If lat/lon available, map to `kommune` using server-side polygon lookup and increment `date+kommune+eventType`.
   - If only city/region available, fall back to `region` (fylke) aggregate.
2. Use a small transactional DB (Postgres/Supabase/Neon) with an `aggregates` table and upsert/increment logic.
3. Expose a read-only admin dashboard (protected) to show adoption by kommune over time.

Privacy & retention
- Retention: 365 days (configurable).
- No IPs or raw coordinates stored; lat/lon used transiently only for mapping and discarded.
- Add a short privacy notice and an admin API to delete all tracking data.

Next steps
- Decide DB choice (Postgres recommended) and whether to host in same project or separate service.
- Implement endpoint and polygon lookup library.
- Add unit tests and a small admin UI to view counts.
