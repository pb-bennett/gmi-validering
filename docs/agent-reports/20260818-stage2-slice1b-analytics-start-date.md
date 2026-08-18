# Stage 2 Slice 1B analytics start date

**Implementation date:** 2026-08-18
**Branch:** `feature/richer-upload-telemetry-app`
**Scope:** public legacy statistics cutoff and period disclosure

## Decision

Historical rows before the analytics period are retained unchanged in
`public.aggregates`. The public statistics domain starts at
`ANALYTICS_START_DATE = '2026-02-19'`.

Rows dated 2026-02-18 and earlier are excluded. Rows dated 2026-02-19 and
later are included.

## Processing order

The statistics boundary now processes data in this order:

1. Read legacy aggregate rows.
2. Validate and normalize rows.
3. Apply the shared analytics-start cutoff.
4. Derive bounded kommune options from the remaining rows.
5. Apply selected kommune and unresolved filters.
6. Derive totals, dates, time series, cumulative values, comparison series,
   ranking, and map/timeline data.

The cutoff helper is also applied defensively by the pure derived-statistics
helpers so excluded rows cannot leak into those outputs.

## API and UI

Successful statistics responses include the additive fixed metadata field
`analyticsStartDate: '2026-02-19'`.

The statistics modal displays the compact, non-warning label:

`Statistikk fra 19. februar 2026`

The displayed date is formatted from the shared statistics constant, with the
API metadata used when a response is available.

## Tests

Focused coverage verifies:

- the 2026-02-18, 2026-02-19, and 2026-02-20 boundary;
- headline totals, cumulative reconciliation, and monotonic time series;
- daily, ISO-week, and monthly aggregation after the cutoff;
- removal of pre-start-only kommune options, ranking/map timeline entries, and
  comparison series;
- retention of a kommune with post-start activity;
- unresolved totals and comparison activity;
- post-start checkbox filtering and existing multi-kommune validation;
- API metadata and Norwegian UI disclosure text; and
- existing cumulative, unknown normalization, comparison, expanded chart,
  Testmodus, tracking, pagination, sanitized-error, and richer-telemetry
  regression coverage.

No database data was deleted or modified. No SQL, migration, Supabase
external access, Vercel configuration, or deployment was changed.

Richer telemetry remains disabled. No richer telemetry tables or RPCs are
queried, `increment_upload_diagnostics` is not called, and `boundedTelemetry`
is not sent.
