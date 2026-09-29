# Geonorge terrain timeout handling

## Problem

Background profile terrain requests could reject through the queue when Geonorge returned an HTTP error. Because callers await queued batches with `Promise.all`, a single failed batch rejected the larger terrain analysis and surfaced as an application runtime error.

## Root cause

`executeRequest` previously threw for every non-OK response. `processQueue` passed that rejection to the request promise, and the fetching APIs propagated it. HTTP failures also incremented `errors` before throwing and again in the catch block. Requests observed after an apparently idle page are explained by the existing large uncached-point batches draining through a three-request concurrency limit with a 100 ms delay between queue pump operations. This is ongoing queued analysis, not evidence of a leak.

## Existing queue/request architecture

Uncached points are batched in groups of at most 50 and placed in a shared FIFO queue; selected-profile requests are inserted at its front. Up to three batches run concurrently. Results are cached by the existing EPSG and rounded coordinate key, and the standard and progressive profile callers map absent terrain to `null`. There was no retry policy, request `AbortController`, or stale-work identity/cancellation mechanism in this service.

## Failure classification

HTTP 429, 502, 503, and 504 are transient. A fetch `TypeError` without an HTTP response is treated as an ordinary network failure. Other HTTP failures are controlled final failures and are not retried. Abort errors are treated as intentional cancellation. Unexpected exceptions, including response parsing/programming errors, still propagate.

## Retry policy

Each request gets one initial attempt and at most two retries. Backoff is 150 ms then 350 ms. A positive numeric `Retry-After` is respected for 429/503, capped at one second so the queue cannot sit for a long interval. The retry delays are short and bounded.

## Exhausted-failure behavior

An unsuccessful batch resolves to per-point records with null terrain fields and `error: true`; no elevation is fabricated and the queue proceeds to later requests. Nonretryable HTTP failures use the same controlled result. Abort returns null terrain records marked `aborted: true` and does not count as a service error. Unexpected errors remain rejected.

## Abort/stale request behavior

The service accepts no abort signal and has no layer/request identity tracking, so there is no existing stale-analysis cancellation behavior to preserve or extend. An `AbortError` from fetch is not retried, rejected to background callers, or included in external-service errors. A broader mechanism to stop queued stale work remains outside this focused change.

## Statistics

`requestCount` counts actual fetch attempts, including retries. `errors` counts one final failed batch, rather than each retry; aborts do not increment it. Existing point, cache, terrain-type, queue, and timing statistics remain in place. Failed batches remain observable through the error count and returned per-point error markers without console spam.

## Tests

`node --test tests/terrainRequestFailureHandling.test.mjs tests/profileAnalysisActiveDataCrash.test.mjs` passed (12 tests). Coverage includes normal success, a 504 followed by success, three-attempt exhaustion across 429/502/503/504, queue continuity, nonretryable 400, network retry exhaustion, error statistics, and abort handling. Retry timers are made immediate by the focused test helper; tests do not wait for backoff.

`git diff --check` passed. A production build was not run.

## Manual acceptance target

With terrain analysis active, transient service errors retry no more than twice and then leave terrain missing while subsequent batches continue. These expected service failures do not reject the background terrain analysis or create an application runtime error overlay.

## Files changed

- `src/lib/analysis/terrain.js`
- `tests/terrainRequestFailureHandling.test.mjs`
- `docs/agent-reports/20260929-geonorge-terrain-timeout-handling.md`

## Final repository state

The requested branch and HEAD remained unchanged; no commit or push was performed. `data/usage/aggregates.json` was pre-existing local runtime data and was not edited or restored by this task. `REF_FILES/` was not accessed. The pre-existing aggregates change remains in the worktree.
