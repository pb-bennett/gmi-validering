# Stage 2 Slice 1B focused closure review

**Review date:** 2026-08-12
**Branch:** `feature/richer-upload-telemetry-app`
**Scope:** closure verification for H1, H2, M1, M2, M3, M4, L1, and L2 only
**Verdict:** **GO WITH CHANGES**

## Closure summary

- H1 — persisted Testmodus fail-closed hydration: **Closed**.
- H2 — developer-only Testmodus activation: **Closed**.
- M1 — unresolved-kommune explanation and semantics: **Closed**.
- M2 — duplicate filter parameter rejection: **Closed**.
- M3 — safe-integer count validation: **Closed**.
- M4 — route and hydration test coverage: **Closed**.
- L1 — total deterministic ranking order: **Closed**.
- L2 — incomplete filter state: **Not closed**.

Explicit outcomes:

- All previous HIGH findings closed: **Yes**.
- All previous MEDIUM/LOW findings closed: **No**.
- Stats filtering/pagination trustworthy: **Yes**.
- Testmodus safe: **Yes**.
- Safe to commit Slice 1B: **No**.

## H1 — closed

The persisted store now exposes non-persisted `hydrated`, initialized false and set true from the persistence hydration callback. `FileUpload` passes both hydration and Testmodus state into the shared successful-upload seam. `isTrackingAllowed` permits tracking only when `hydrated === true && testMode === false`; unknown hydration and active Testmodus both skip telemetry derivation and `/api/track`, while `onComplete` still runs exactly once.

Parsing, validation, layer/state installation, and `setParsingDone` remain before this post-success gate. Store initialization does not directly access `localStorage`; the SSR test imports the production store without `window` or storage and succeeds. Tests directly exercise unknown hydration, persisted-mode semantics, active mode, inactive hydrated mode, one completion, and zero/one tracking calls. A persisted `testMode=true` cannot satisfy the tracking predicate before or after hydration.

## H2 — closed

Ordinary inactive visitors render no Testmodus control because `TestModeControl` returns `null` unless hydration is complete and Testmodus is active. Client-side activation uses exactly one `testmodus` parameter with exact value `1`. Near matches (`01`, `true`) and duplicate parameters fail.

After hydration, the client effect persists `testMode=true`, removes `testmodus`, and calls `history.replaceState` with the current path, remaining query parameters, and hash, without navigation. The activation value is not passed into FileUpload, the tracking body, or telemetry. Enabled tracking still uses only `{ eventType: 'upload_success', datasetCoord }`.

The active amber banner remains prominent and provides the explicit `Slå av testmodus` action, which persists `false` through the existing settings updater.

## M1 — closed

The UI displays the required wording when unresolved uploads exist:

`Opplastinger uten registrert kommune inngår i totaltallene, men kan ikke vises i kommuneoversikten eller på kartet.`

Production semantics match it. All mode retains unresolved rows. Exclude mode retains unresolved rows because they do not match the excluded municipality. Only mode excludes them. They contribute to totals and uptake timelines where applicable, but `byKommune` now omits unresolved rows and therefore ranking/map municipality inputs cannot present them as a municipality. The summary exposes only their aggregate count for the explanatory state.

## M2 — closed

`parseKommuneFilter` requires each allowed parameter to appear no more than once. Repeated `kommuneMode` or `kommuneId` fails with `invalid_query`; helper and route-response tests cover duplicate rejection.

## M3 — closed

Legacy counts now require `Number.isSafeInteger(value) && value >= 0`. Tests reject a value above `Number.MAX_SAFE_INTEGER` in addition to negative, non-finite, and string values.

## M4 — closed

Tests now exercise production seams rather than copied aggregation logic:

- an exact-full Supabase page sequence continues to a subsequent empty page;
- a partial final page terminates immediately;
- the response seam rejects unknown municipality IDs and duplicate filters;
- configured-source failure returns a fixed sanitized 503 body;
- successful response containment excludes `records` and raw `event_type` rows;
- unresolved all/only/exclude semantics are asserted;
- SSR-safe store initialization and fail-closed hydration tracking are asserted; and
- the tracking seam verifies completion and request suppression/allowance.

No heavy browser harness is needed for these extracted production seams.

## L1 — closed

Municipality ranking now sorts by:

1. count descending;
2. Norwegian display name;
3. municipality number or area ID; and
4. area ID as the final fallback.

An equal-count/equal-name fixture verifies deterministic municipality-number ordering.

## L2 — not closed

The incomplete only/exclude state no longer leaves old all-mode figures visible and does not issue an API request while no municipality is selected. It also displays the clear Norwegian `Velg kommune` state.

However, the effect closes the stale-data issue by calling `setStats(null)`, while the municipality selector obtains its options only from `stats?.kommuneOptions`. On the next render, `kommuneOptions` becomes empty. The user is shown `Velg kommune`, but the selector contains no municipalities to choose, so only/exclude cannot progress from this state without first returning to all mode.

Smallest correction: retain the last all-mode municipality options in separate component state (or preserve only that bounded option list) when clearing displayed statistics. Continue to suppress results and the API request until a municipality is selected. Add a focused component/state-seam test that changes all → only/exclude, confirms old figures are hidden, confirms options remain selectable, and confirms no request occurs before selection.

## Regression check

- Monthly uptake remains the default timeline mode.
- The cumulative toggle selects the cumulative field, while monthly selects count.
- Filtered cumulative final values reconcile with filtered totals in production-helper tests.
- Ranking and map continue to receive `byKommune` and `timeline` derived from the same filtered rows.
- Bounded richer telemetry is not sent.
- Enabled `/api/track` retains its existing body shape.
- No richer table query or richer RPC wiring was added.
- No SQL, Supabase configuration, or Vercel configuration changed.

## Validation

- `node --test tests/*.test.mjs` — **PASS**, 82/82 tests.
- `npm.cmd run build` — **PASS**, optimized Next.js production build completed.
- `git diff --check` — recorded after this report was written.
- `git status --short --branch` — recorded after this report was written.

## Verdict

**GO WITH CHANGES.**

Both prior HIGH findings and all MEDIUM findings are closed. Testmodus is fail-closed, deliberate, persistent, and safe. Statistics filtering and pagination are trustworthy. Slice 1B is not yet safe to commit because L2's correction makes the municipality option list disappear in the required selection state. Preserve that option list without restoring stale statistics, add the narrow transition test, and rerun the existing validation matrix.
