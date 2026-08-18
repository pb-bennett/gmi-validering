# Stage 2 Slice 1B statistics chart refinement

**Implementation date:** 2026-08-12
**Branch:** `feature/richer-upload-telemetry-app`
**Scope:** cumulative comparison correctness, shared chart domains, all-selected kommune comparison, unresolved comparison activity, and expanded chart presentation

## Cumulative bug and correction

The drop was caused by deriving each per-kommune series over only that kommune's observed periods. The chart assembler then inserted a zero for missing periods, including periods after the kommune's final event, into the cumulative value.

The correction is at the statistics derivation boundary. Daily, Monday-based weekly, and monthly comparison series now receive the filtered total series as a shared period domain. Each comparison series contains every period between the filtered global first and last period, with zero counts where that series has no event. Its cumulative series is then built from those counts, so values start at zero before the first event and carry forward unchanged after the final event. The chart assembler also uses the total domain and carries the previous cumulative value for defensive gaps.

This preserves monotonic cumulative values and ensures total cumulative final values equal the filtered headline total while each comparison-line final value equals that line's filtered total.

## All-kommune comparison

The arbitrary eight-kommune comparison limit was removed. All selected, validated known kommune numbers can be returned and rendered. The existing strict server-side bounded ID contract remains the safety boundary (`MAX_KOMMUNE_IDS`), so selected IDs are still four-digit, unique, known, and bounded without silently dropping selections. The legend can wrap/scroll, and the color palette provides stable distinct styling for the current multi-line dataset.

## Unresolved comparison activity

When `Uten registrert kommune` is selected, the server returns a derived comparison series under an internal unresolved-series key. The UI labels it `Uten registrert kommune`. It supports daily/weekly/monthly and antall/cumulative modes, including carry-forward behavior, but is never added to `uniqueKommuner`, municipality ranking, or map markers. Unchecking it removes it from totals and comparison lines.

## Legacy Unknown normalization

Real aggregate history can contain `area_type=unknown`, `area_id=unknown`, `area_name=Unknown`, missing kommune numbers, or malformed/non-four-digit kommune numbers. The root cause of the stray `Unknown` checkbox was copying those values through normalization before building the known kommune option list. Normalization now accepts a municipality only when its stable number is exactly four digits and the row is not explicitly marked with an unknown token. All other upload rows are normalized to `kommuneNumber: null` and flow into the single unresolved bucket. Option derivation defensively applies the same valid-known rule, so `unknown` can never be sent as `kommuneIds` or rejected later as a supposed municipality.

Regression fixtures verify valid options only, unresolved totals with the checkbox on/off, unresolved comparison output and carry-forward, unique-kommune/ranking/map exclusion, and safe rejection of unknown IDs.

## Expanded chart mode

`Utvid diagram` toggles a simple component-state expanded view. The expanded view hides the kommune sidebar, summary/secondary sections, map/ranking, and inactive detailed section while retaining the chart, all chart controls, legend, current selections, and the normal modal close button. `Lukk utvidet visning` restores the ordinary compact layout without navigation or state reset. The normal layout retains the checkbox filter and uses the main chart area efficiently.

## Shared domain and readability

Total and comparison chart rows use one filtered period domain for the selected Dag/Uke/Måned resolution. Antall uses zero for missing periods; Kumulativt uses zero before a series starts and carries the previous value afterward. Daily X-axis labels use a minimum tick gap while tooltips retain the exact period. Weekly and monthly controls remain available for long real-data histories. Hour-of-day and weekday heatmap UI remains absent.

## Tests

Focused tests cover:

- known kommune cumulative carry-forward after a final event for daily and aggregated resolutions;
- shared period keys, zero antall gaps, pre-event cumulative zero, post-event cumulative carry-forward, and total reconciliation;
- unresolved comparison selection, counts, cumulative carry-forward, omission when not selected, and exclusion from municipality count/ranking inputs;
- more than eight selected known municipalities with deterministic complete comparison-series output;
- validated multi-ID filtering, unresolved inclusion, backend safety, and existing option preservation;
- expanded chart controls, absence of the eight-series blocking message, checkbox UX, and inactive detailed statistics; and
- existing Testmodus, tracking payload, pagination, sanitized-error, and richer telemetry regression coverage.

## Known limitations

- The municipality map uses the existing centroid/reference path and remains hidden only while the chart is expanded.
- The map timeline uses observed municipality/date entries; zero-valued map periods are not fabricated.
- Date-range presets remain intentionally omitted from this Slice 1B refinement.
- Richer telemetry remains disabled. No bounded telemetry is sent, no richer tables or RPCs are queried, and no SQL, Supabase, Vercel, or production configuration was changed.
