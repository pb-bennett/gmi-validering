# Stage 2 Slice 1B statistics layout and map refinement

**Implementation date:** 2026-08-18
**Branch:** `feature/richer-upload-telemetry-app`
**Scope:** compact statistics layout, kommune selector access, and map interaction

## Compact layout

The permanent kommune sidebar was removed. The existing checkbox selection
flow is now available from a compact `Kommuner` popover showing the selected
and total known kommune count. The popover retains search, checkbox selection,
`Velg alle`, `Fjern alle`, and the separate `Uten registrert kommune` control.
Selections persist when the popover closes. Pointer-outside and Escape
handling close the popover without changing the selection.

The two large KPI cards were replaced by compact header metrics for registered
uploads and active municipalities. The analytics period disclosure remains in
the header. The icons are small inline accessible decorative SVGs, so no icon
dependency was added and emoji are no longer used for the KPI presentation.

The time chart remains the primary full-width analytical element with its
existing Dag/Uke/Måned, Antall/Kumulativt, Totalt/Per kommune, and expanded
behaviour unchanged. The inactive `DetailedStatsSection` remains available in
the repository but is no longer rendered by `StatsModal`.

## Map timeline

The map now initializes to the latest available coordinate-backed timeline
date rather than the previous cumulative `-1` state. If filtering changes the
available dates, the selected date is preserved when possible and otherwise
falls back to the latest available date.

The slider root cause was a native range input without an `onChange` handler.
It now updates the selected timeline index immediately, stops playback on
manual movement, and retains native keyboard and pointer behaviour.

Playback uses observed timeline dates and calculates a bounded interval toward
a 12-second full-period traversal. It restarts from the first date when
started at the latest date, continues from an intermediate date, stops at the
latest date, and cleans up its interval on pause, data changes, or unmount.

The normal map uses a responsive landscape-oriented height and a wider map to
ranking proportion. `Utvid kart` expands the map into the modal content area,
hides the chart and ranking, and provides `Lukk utvidet visning`. The current
map date and kommune filter remain in component state across expansion and
collapse.

Leaflet receives `invalidateSize({ animate: false })` after expansion state
changes through the `MapResizeSync` component. The invalidate operation is
also exposed through a small pure seam for focused tests.

## Viewport ownership

The previous map behaviour re-ran `fitBounds` whenever timeline marker data
changed, which reset a manually explored viewport. The map now has an explicit
AUTO versus USER-CONTROLLED viewport mode. Initial loading and relevant marker
changes in AUTO mode may fit the current markers. Manual Leaflet `dragstart`
and `zoomstart` events switch to USER-CONTROLLED mode, suppressing automatic
fits during timeline changes, playback, filtering, and expansion resizing.

Programmatic fits use a short explicit guard ref and non-animated Leaflet
operations, so their move/zoom events do not claim user ownership. The
compact `Vis alle punkter` button re-enables AUTO mode and triggers a fit of
the current markers without changing the selected timeline date, filters, or
playback state. It is disabled safely when no markers are available.

The existing latest-date default, slider, playback timing, and
`invalidateSize` expansion seam remain unchanged. Manual viewport ownership is
not reset by expand/collapse.

## Unresolved ranking

The filtered unresolved bucket is now included in a separate `ranking` output
and may appear as a bar labelled `Uten registrert kommune` when its filtered
count is positive and the unresolved toggle is enabled. The compact ranking
heading is `Fordeling`, which covers both known municipalities and the
unresolved display bucket.

The existing `byKommune` output remains municipality-only. Unresolved activity
therefore still does not increase the municipality count and cannot receive a
map marker. It continues to participate in filtered totals, time series, and
comparison lines as before.

## Tests

Added focused map timeline tests for latest-date initialization, playback
index advancement, bounded playback timing, and Leaflet resize invalidation.
The UI contract tests now cover the absent permanent sidebar and inactive
detailed section, compact selector/count and KPI presentation, emoji absence,
native slider wiring, map expansion, playback seam, and resize seam.
Ranking tests cover selected, excluded, and zero-count unresolved activity,
post-start cutoff, deterministic ordering, municipality-count preservation,
map-source exclusion, and the Norwegian display label.
Viewport tests cover initial AUTO eligibility, programmatic-fit guarding,
manual pan/zoom ownership, timeline/playback/filter fit suppression, reset
eligibility, empty markers, and resize ownership preservation.

The full suite passes with 96 tests, including analytics cutoff, kommune
filtering, cumulative comparison, unresolved activity, Testmodus, pagination,
tracking payload, and richer telemetry boundary regressions.

## Known limitations

- Map dates remain based on municipality timeline entries with available
  reference coordinates; unresolved activity never receives a marker.
- Map centroids and Leaflet tile/backend behaviour remain unchanged.
- The compact UI contract is covered by source-level tests because no browser
  test framework is present in the project.

Richer telemetry remains disabled. No `boundedTelemetry` is sent, the
`/api/track` request shape is unchanged, no richer telemetry tables or RPCs
are queried, and no `increment_upload_diagnostics` call was added. No SQL,
Supabase, Vercel, or deployment configuration was changed.
