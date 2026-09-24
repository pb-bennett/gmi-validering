# S11 — Stats

Date: 2026-09-24. Repository root: `C:/GitHub/gmi-validering-test`. Branch: `feature/styling-overhaul-integrated`. Starting HEAD: `ebf9a3d` (`Refresh dialogs and AppInfo styling`). Starting working tree: clean. Root, branch, HEAD, and status were checked before editing.

## Ownership and files

Active presentation owners are `src/app/page.js` (trigger and visibility), `src/app/globals.css` (trigger badge/cue and scoped focus), `src/components/StatsModal.js` (modal, filters, summary, charts, ranking), `src/components/stats/StatsMap.js` (map and timeline controls), and `src/components/AppInfoModal.js` (Nytt Stats depiction). The page mounts `StatsModal` independently of the trigger. The map is dynamically imported by the modal. The AppInfo depiction is illustrative, not live Stats data.

Changed files: those five source files and this report. No S12 owner or other S10 surface was edited.

## Data access checkpoint

**Status: WORKING for populated remote Stats data after local configuration was restored.** The original S11 check found an unconfigured local fallback and a read-only `GET /api/stats` returned HTTP 200, `source: file`, and zero visible uploads. In this follow-up, the existing ignored `.env.local` contains `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. A read-only local endpoint check now returns `source: supabase` with populated Stats data. No database or data-access code change was needed.

Data path: `StatsModal` requests `/api/stats` with optional municipality, unresolved, and comparison query parameters. `src/app/api/stats/route.js` calls `buildStatsResponse` in `src/lib/stats/statsRoute.mjs`. The route uses the server-only `src/lib/tracking/supabase.js` client when both Supabase variables exist; `getRecordsFromSupabase` in `src/lib/stats/legacyStats.mjs` reads the `aggregates` table in ordered pages, selecting date, hour, area, municipality, country, region, event type, and count for `upload_success`. The schema is defined in `src/features/user-tracking/supabase.sql` and related migration files. Without Supabase configuration, the route reads `data/usage/aggregates.json`, or `TRACKING_STORAGE_PATH` when set. The stats response filters records before `2026-02-19`, then applies the existing filters and calculations. A Supabase read failure yields the existing sanitized 503 response and does not silently fall back to local data.

Environment inspection (names and presence only):

| Name | Current process | Role |
| --- | --- | --- |
| `SUPABASE_URL` | Present in ignored `.env.local` | Server Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Present in ignored `.env.local` | Server secret |
| `TRACKING_STORAGE_PATH` | Missing; optional | Local fallback path |
| `NEXT_PUBLIC_CARTO_BASEMAP_KEY` | Present in ignored `.env.local` | Browser-visible CARTO basemap key |

`.env.example` exists; `.env.local` is now present and ignored by Git, while `.env` and `.env.development` are absent. `docs/development.md` documents the two required Supabase variables and the optional local fallback path. The default local aggregates file contains two `upload_success` rows, both before the analytics start date, so that fallback remains empty. The restored ignored configuration supplies populated remote Stats without changing the route, schema, calculations, or production semantics. Server variables remain server-only. No values were copied, printed, invented, or committed. No database records were mutated.

## CARTO basemap follow-up

CARTO now requires a basemap API key for external raster tiles; requests without one show the “API KEY REQUIRED” watermark. `StatsMap` was the only active CARTO consumer. Its existing Positron/light raster URL family was `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`; it had no explicit `maxZoom` or `subdomains` options, and both Leaflet attribution control and tile attribution were disabled. The style, URL family, tile architecture, default Leaflet options, markers, and timeline were retained.

The map now reads the intentionally browser-visible `NEXT_PUBLIC_CARTO_BASEMAP_KEY` and appends an encoded `?key=` parameter. The actual issued key remains untracked and is not present in source or `.env.example`. When the variable is absent or blank, the map makes no CARTO tile requests, retains its data markers, and displays a small configuration message. It never requests `?key=undefined` or unauthenticated watermarked tiles. A visible Leaflet attribution control is placed at the top left so the timeline tray cannot cover it; the tile attribution contains © OpenStreetMap contributors and © CARTO. The provider's [key guidance](https://carto.com/basemaps/apikey/) documents the query parameter and attribution requirement. Raster-to-vector migration is deferred beyond S11.

The issued CARTO basemap key is now configured locally under `NEXT_PUBLIC_CARTO_BASEMAP_KEY` in ignored `.env.local`. Manual review confirmed that authenticated Positron/light raster tiles load, the previous watermark is gone, and both required attributions are visible. No key value is tracked, printed, or documented.

## Visual treatment

The trigger's former pink/magenta fill, border, hover, shadow, badge, and cue glow now use Interactive dark cyan, Brand Cyan detail/ripples, and a Cyan Soft badge with Navy text. Its first-three-load attention timing and `prefers-reduced-motion` handling remain unchanged. Exact visibility predicate remains `!(layerDataTableOpen || dockedInspectorOpen || analysisOpen)`. It stays available on upload and normal workspace when these surfaces are closed. The fallback Validator detail modal is not added to the predicate. Hiding the trigger does not close `StatsModal`.

The Stats frame uses Ink backdrop, Surface/Soft panels, Border separators, Navy headings, semantic text shades, Interactive focus, and neutral selected controls. The compact header/summary, municipality selector, filter search and checkboxes, chart controls, loading, no-data, and failure surfaces were normalized. The existing red API error remains semantic. The modal close and municipality disclosure now use regular Phosphor icons.

The original map styling changes were limited to empty overlay, reset button, timeline tray, slider, labels, and regular Phosphor play/pause controls. The subsequent basemap fix adds key gating and attribution as described above. Marker positions, radius, new-event amber and ordinary blue marker encoding, tooltip values, bounds, playback logic, and resize sync remain intact. Chart grid, axes, tooltip frame, total-series colour, and selected control chrome use GMI roles. Distinct multi-municipality series colours remain because they distinguish categories. Ranking framing, labels, and single ranking bars use GMI chrome; counts, sort, and bar width calculations are unchanged. The Nytt Stats trigger depiction now matches the cyan-family promotion; its copy, composition, and illustrative chart-series distinction remain intact.

No datasets, date periods, aggregations, filters, rankings, tooltip values, map geometry, marker calculations, modal dimensions, scroll ownership, stacking, close lifecycle, or chart measurement behavior were changed.

## Verification and deferred review

- `git diff --check`: passed.
- `node --test` for `statsUiContract`, `statsChartUi`, `statsMapTimeline`, `statsKommuneFilterState`, `legacyStats`, `statisticsCue`, `mapPaneToolbar`, and `appInfoUiContract`: 55/55 passed.
- `npm.cmd run build`: passed initially. After the final trigger class edit, the next attempt failed solely while fetching Roboto from Google Fonts; the required immediate retry passed compile and page generation. The existing stale Browserslist advisory appeared.
- Read-only local endpoint call: HTTP 200 with valid empty file-backed Stats response.
- Initial agent browser review was unavailable because the in-app browser setup failed before navigation. The user subsequently completed the populated visual review recorded below.

Basemap follow-up verification: `git diff --check` passed; the new CARTO contract test plus the eight S11 suites passed 57/57. The first follow-up build attempt failed only while fetching Roboto from Google Fonts; the immediate retry passed compilation and page generation. The local `/api/stats` endpoint reports Supabase-backed populated data. Subsequent user manual review accepted authenticated tile rendering, attribution, and watermark removal.

## Manual acceptance and narrow chart correction

User manual review accepted populated Supabase-backed Stats; authenticated Positron/light basemap and visible OpenStreetMap/CARTO attribution; removal of the CARTO watermark; the upload-screen trigger's Interactive cyan, Brand Cyan accent, and Cyan Soft “Ny” badge; and the matching AppInfo Nytt Stats depiction. The wide populated modal's summary, chart, map, ranking, timeline, and controls were accepted. At a narrow viewport, the modal structure, map, ranking below the map, and timeline were accepted. No fixtures were inserted to simulate populated data.

The only visual issue found was a wrapped municipality legend colliding with the chart's x-axis/date labels. The legend wrapper already capped its height at 64px and scrolled, but Recharts had no explicit matching legend height to reserve space in the narrow plot. `ResponsiveContainer` now reports the chart's measured width. Below 900px, `Legend` reserves 64px, matching its existing maximum scroll height; at wider widths, its height remains automatic. The legend entries remain available, the plot retains 192px or more of the normal 256px chart frame before the existing axes/margins, and the date labels remain visible above the reserved legend region. No chart data, scales, labels, colours, series, sort, controls, calculations, or modal geometry changed. Post-fix manual review visually verified that the wrapped municipality legend occupies its own reserved space without colliding with the x-axis/date labels, the date labels remain readable, and the plot area remains useful. Controls remain correctly laid out; the map and timeline remain correct; and the ranking continues to flow beneath the map. The full narrow Stats layout is visually accepted.

Final diff review also corrected one malformed ranking-bar colour utility from the earlier S11 styling edit to the intended Interactive cyan. Ranking counts and bar-width calculations are unchanged.

Narrow chart follow-up verification: 33/33 relevant Stats chart, UI, map, filtering, data, and CARTO tests passed; `git diff --check` passed. The first build attempt failed fetching Roboto from Google Fonts; the immediate retry passed. After the width-threshold adjustment and final ranking utility correction, the same 33/33 tests and diff check passed again. Each subsequent build passed on its first attempt, including the final source state. The user visually verified and accepted the adjusted legend spacing and full narrow Stats layout.

No commit, push, deployment, dependency update, schema migration, or secret change occurred. Final `git status --short`:

```text
 M .env.example
 M docs/development.md
 M src/app/globals.css
 M src/app/page.js
 M src/components/AppInfoModal.js
 M src/components/StatsModal.js
 M src/components/stats/StatsMap.js
?? docs/agent-reports/20260924-styling-overhaul-s11-stats.md
?? src/lib/stats/cartoBasemap.mjs
?? tests/statsCartoBasemap.test.mjs
```
