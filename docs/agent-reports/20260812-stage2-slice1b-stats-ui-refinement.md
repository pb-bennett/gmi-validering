# Stage 2 Slice 1B statistics UI refinement

**Implementation date:** 2026-08-12
**Branch:** `feature/richer-upload-telemetry-app`
**Scope:** denser legacy statistics presentation, multi-kommune inclusion filtering, daily/weekly/monthly uptake, and bounded kommune comparison

## UI changes

The statistics modal now uses a compact responsive layout with a narrow kommune sidebar and a wider analytical content area. The header, summary cards, section gaps, map/ranking area, and chart controls were reduced to use the available modal width more effectively. The visual order is registered activity, activity over time, kommune selection/comparison, and geographic/ranking overview, followed by the inactive `DetailedStatsSection`.

The old hour-of-day and weekday heatmap presentation remains absent from the UI. Counts continue to mean registered uploads, not visitors or users.

## Checkbox filter and API contract

Known municipalities are presented as a bounded, searchable checkbox list. All known municipalities are checked after the initial successful all-data response. `Velg alle` and `Fjern alle` provide compact bulk controls. Checked municipalities are included; unchecked municipalities are excluded. Stable four-digit kommune numbers are used internally and Norwegian display names are presentation-only.

The stats request now accepts the validated query contract:

- `kommuneIds=<comma-separated four-digit kommune numbers>`;
- `includeUnknown=0|1`; and
- `includeComparison=0|1` for requesting bounded derived comparison series.

An omitted `kommuneIds` preserves the unfiltered all-data request. Explicit IDs are bounded, must be unique, and must exist in the known option list. Empty `kommuneIds` is valid and represents no known municipalities. Invalid, duplicate, or unknown IDs are rejected. Filtering occurs server-side before all aggregate views are derived. The full bounded option list is retained independently in the client from filtered statistics.

Unresolved uploads have a separate subdued `Uten registrert kommune` checkbox, checked by default when that aggregate bucket exists. They contribute to totals and time series when checked, but never to municipality lines, ranking, or map markers. The UI keeps the concise Norwegian explanation without presenting unresolved activity as a fabricated municipality.

## Time series

The time controls are independent:

- resolution: `Dag`, `Uke`, or `Måned`;
- value mode: `Antall` or `Kumulativt`.

The default is daily antall. Daily series fill zero-valued days only between the first and last observed date in the current filtered result. Weekly series use Monday-based ISO-compatible week starts and fill missing weeks between observed bounds. Monthly series retain chronological calendar-month behavior across year boundaries. Each resolution has its own cumulative series, and every non-empty final cumulative value reconciles with the filtered registered-upload total.

## Per-kommune comparison

The chart display mode is `Totalt` by default. `Totalt` shows the filtered registered-upload series, including unresolved activity when selected. `Per kommune` shows one derived line per selected known municipality using the same resolution and value mode. The server returns these series only when `includeComparison=1`; raw aggregate rows are not exposed. Unresolved activity is never rendered as a municipality line.

Comparison is limited to eight selected municipalities. The UI does not silently choose a subset; it shows `Velg opptil 8 kommuner for å sammenligne utviklingen.` when more are selected. Tooltips and legends identify the period, municipality where applicable, and registered upload count.

## Date-range presets

Optional date-range presets were not implemented. The required resolution/value controls and checkbox filtering were kept compact and stable, while the existing complete historical period remains authoritative. Adding presets would require another shared period filter across headline totals, all derived series, ranking, and map timeline data and was not necessary for this refinement.

## Tests

Focused production-path tests cover:

- default/all-selected, single and multiple municipality inclusion, only-known and no-known selections;
- unresolved inclusion and exclusion;
- malformed, duplicate, unknown, and over-bound ID requests;
- preserved full option lists independent from filtered statistics;
- daily aggregation and zero gaps, ISO-week grouping and year boundaries, monthly ordering, empty data, and cumulative reconciliation at all resolutions;
- bounded per-kommune series, filtered-out municipality absence, unresolved-line absence, and comparison response wiring;
- checkbox and compact-control UI labels, time controls, comparison limit, unresolved wording, no heatmap/hour UI, and inactive detailed statistics; and
- existing Testmodus, tracking request shape, and richer telemetry regression tests.

## Known limitations

- The existing municipality-centroid map path remains unchanged; map backend optimization is out of scope.
- The map timeline remains based on observed municipality/date aggregate entries rather than adding zero-valued map entries.
- Date-range presets are intentionally omitted as described above.
- Richer telemetry remains disabled. No bounded telemetry is sent, no richer tables or RPCs are queried, and no SQL, Supabase, Vercel, or production configuration was changed.
