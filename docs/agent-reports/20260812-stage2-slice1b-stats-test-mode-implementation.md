# Stage 2 Slice 1B implementation report

**Implementation date:** 2026-08-12
**Branch:** `feature/richer-upload-telemetry-app`
**Scope:** legacy statistics uptake presentation, kommune filtering, legacy read correctness, and browser-local Testmodus

## Files changed

Added:

- `src/components/TestModeControl.js`
- `src/lib/stats/legacyStats.mjs`
- `src/lib/stats/kommuneFilterState.mjs`
- `src/lib/stats/statsRoute.mjs`
- `src/lib/testModeActivation.mjs`
- `tests/legacyStats.test.mjs`
- `tests/statsKommuneFilterState.test.mjs`
- `tests/testMode.test.mjs`
- `tests/statsUiContract.test.mjs`
- `docs/agent-reports/20260812-stage2-slice1b-stats-test-mode-implementation.md`

Modified:

- `src/app/api/stats/route.js`
- `src/components/StatsModal.js`
- `src/components/FileUpload.js`
- `src/app/page.js`
- `src/lib/store.js`
- `src/lib/telemetry/uploadTelemetry.mjs`
- `tests/richerUsageTelemetryParserIntegration.test.mjs`

No SQL, Supabase configuration, Vercel configuration, richer telemetry table, `/api/track` request shape, or `/api/stats` response purpose was changed.

Richer telemetry remains disabled.

## Statistics API and filter architecture

`src/lib/stats/legacyStats.mjs` is a pure legacy-statistics boundary. It:

- normalizes only validated legacy aggregate rows;
- rejects malformed, negative, non-finite, non-integer, or invalid-date rows;
- validates `kommuneMode=all|only|exclude` and bounded `kommuneId` values;
- filters normalized aggregate rows server-side before final aggregation;
- returns only aggregate statistics and a bounded municipality option list, never raw rows; and
- preserves the no-query-parameter all-data behavior.

`only` includes rows whose existing `kommune_number` matches the selected identifier. `exclude` removes those rows. An unknown municipality identifier is rejected safely by the route rather than guessed or mapped by display name. The selected filter is applied before totals, monthly/cumulative series, ranking, timeline, and map data are built.

The modal preserves only the last valid bounded `kommuneOptions` list independently from displayed statistics. Switching to `only` or `exclude` without a selection clears old results, keeps the selector usable, shows `Velg kommune`, and makes no request until a municipality is selected.

## Uptake and time series

The statistics modal now prioritizes:

1. registered upload totals and municipalities with registered activity;
2. `Utvikling over tid`, defaulting to monthly registered uploads; and
3. `Kommuner`, with the existing map and ranked horizontal municipality visualization.

The API derives calendar-month rows in chronological order, inserts explicit zero-valued calendar gaps between observed first and last months, and derives a cumulative series after filtering. The final cumulative value reconciles with the filtered registered-upload total. The prior hourly and weekday/heatmap views were removed from the primary modal UI while their legacy API calculations remain available for compatibility.

## Legacy read corrections

Supabase aggregate reads now use deterministic full-key ordering and bounded `.range()` pages until the final page. A configured Supabase read failure propagates to a sanitized Norwegian 503 response and never falls back to local data presented as complete production statistics. Local JSON remains available only when Supabase is explicitly unconfigured. Public errors use `Statistikken er midlertidig utilgjengelig.` and do not expose dependency error strings.

## Testmodus

`settings.testMode` is a boolean defaulting to `false` and is included in the existing Zustand `settings` persistence slice. The persisted store exposes a minimal non-persisted `hydrated` boolean. It starts false and is marked true only after the Zustand settings persistence callback completes; SSR and unavailable storage do not access `localStorage` directly. Successful-upload tracking is fail-closed and is permitted only when `hydrated === true && testMode === false`. Parsing, validation, layer/state updates, and `onComplete` continue when tracking is skipped.

`TestModeControl` is visible only after hydration and only while active. Developer activation is client-side through the exact single query form `?testmodus=1`; it persists `settings.testMode=true` and removes the parameter with `history.replaceState` without navigation. Ordinary inactive visitors see no activation control. The active banner remains prominent and has an immediate `Slå av testmodus` action that persists false.

When active, `completeSuccessfulUpload` skips telemetry derivation and `/api/track` entirely, while still invoking `onComplete`. When hydration is unknown, it also skips tracking without showing an error. When inactive after hydration, the existing legacy request remains exactly `{ eventType: 'upload_success', datasetCoord }`. No query parameter, test flag, test category, identifier, or test event is sent to the server. This gate is placed around the shared successful-upload seam so a later richer tracking extension can use the same protection.

## Privacy boundaries

Only existing aggregated municipality information is used for filtering and public statistics. No filenames, file contents, exact coordinates, bounding boxes, IPs, user agents, headers, request IDs, tracking IDs, raw database rows, or per-upload facts were added. Exact dataset coordinates are not returned by the statistics route. Bounded richer telemetry remains browser-local, discarded, and absent from the legacy request.

## Tests

The new focused tests cover:

- all-data, only, excluded, unknown, malformed, and missing municipality filters;
- filtered totals, rankings, timelines, map input, cross-year monthly ordering, zero month gaps, cumulative reconciliation, and empty data;
- deterministic multi-page Supabase reads without page duplication or truncation, including exact-full and partial-final pages;
- configured Supabase failure isolation from local fallback;
- malformed and unsafe-integer count rejection;
- duplicate kommune filter rejection, unknown kommune route rejection, sanitized configured-source failure, response-key containment, deterministic ranking ties, and unresolved-location behavior for all/only/exclude;
- Testmodus default/off/on persistence, exact developer activation, SSR/storage-safe initialization, hydration fail-closed tracking, successful completion, and legacy request shape;
- incomplete all-to-only/exclude selection state with preserved municipality options and request suppression; and
- Norwegian statistics, filter, Testmodus, and inactive detailed-statistics UI contract text.

The existing Stage 1 database, tracking-policy, WMS, and Slice 1 telemetry tests remain in the full Node suite.

## Known limitations

- Municipality centroid lookup remains the existing per-municipality map path; backend map optimization is out of scope.
- Uploads without a registered kommune remain in all/exclude totals and timelines, with the UI wording: `Opplastinger uten registrert kommune inngår i totaltallene, men kan ikke vises i kommuneoversikten eller på kartet.` They are not fabricated as a municipality.
- Local-file statistics remain a development-only fallback when Supabase is not configured.
- Browser-derived richer telemetry remains untrusted and is not sent or stored.
- No richer RPC wiring, richer-table reads, activation date, feature flag, sparse-cell policy, or richer statistics was implemented.
- Historical records are not modified and historical test uploads are not inferred or removed.
