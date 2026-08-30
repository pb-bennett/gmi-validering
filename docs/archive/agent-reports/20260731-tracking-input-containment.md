# AUD-001 tracking input containment

Date: 2026-07-31
Branch: `security/tracking-input-containment`
Scope: AUD-001 only — public tracking counter and outbound-request amplification.

## Caller trace

There is one application caller of `POST /api/track`: `src/components/FileUpload.js`.
After a successful parse and state update, `useFileLoader` calls `trackUploadSuccess` without awaiting it. The call is therefore best-effort and cannot interrupt file validation or completion callbacks.

The current application-generated body contains `eventType: "upload_success"` and a `datasetCoord` object with `x`, `y`, `epsg`, and `sampleCount`, or `datasetCoord: null` when no usable coordinate/EPSG exists. The caller always sends JSON, `Content-Type: application/json`, and `keepalive: true`.

## Request contract

### Before this patch

The route attempted `request.json()` and converted parse failures into `{}`. It defaulted a missing or falsy event type to `upload_success`, then converted any supplied event type with `String()`. It ignored unknown fields and used `Number()` coercion for coordinate members. It did not check content type, body size, coordinate ranges, `Origin`, or `Sec-Fetch-Site`. A valid-looking coordinate caused one resolver invocation before an unconditional aggregate increment; the resolver itself can use its existing sequential fallback lookup behavior.

The route also returned permissive `OPTIONS` CORS headers with `Access-Control-Allow-Origin: *`.

### After this patch

The pure policy in `src/lib/tracking/trackingRequestPolicy.mjs` requires:

- `Content-Type` whose media type is exactly `application/json` (parameters such as a charset are allowed).
- A UTF-8 request body no larger than 1,024 bytes. A declared `Content-Length` above the limit is rejected before reading the body, and the encoded body is checked again.
- A JSON object, not `null`, an array, a primitive, or malformed JSON.
- Exactly these top-level fields: required `eventType`, and optional `datasetCoord`.
- `eventType` exactly equal to `upload_success`; no other event type is accepted and no string coercion occurs.
- `datasetCoord` either omitted, `null`, or an object containing only `x`, `y`, `epsg`, and optional `sampleCount`. If present as an object, `x`, `y`, and `epsg` are required. `sampleCount`, when present, must be an integer from 1 through 200.
- `x` and `y` as JSON numbers that are finite; numeric strings, `NaN`, and infinities are rejected.
- EPSG as an integer in the existing supported set: 25832, 25833, or 4326.
- For EPSG:4326, longitude `x` in `[-180, 180]` and latitude `y` in `[-90, 90]`.
- For EPSG:25832 and EPSG:25833, conservative UTM-style bounds of `x` in `[100000, 900000]` and `y` in `[0, 10000000]`.

The handler validates all of this, plus browser request metadata, before calling either injected dependency. Body consumption is application-level incrementally bounded through `request.body`: chunks are counted by byte length, the reader is cancelled immediately when the cumulative limit is crossed, and only an accepted bounded byte sequence is decoded as UTF-8. This does not bypass any larger buffering that Vercel may perform before the route executes. Declared oversized numeric lengths, including impossible unsafe integer values, are rejected before reading.

Valid coordinate-bearing requests call the municipality resolver at most once and the aggregate increment once. `sampleCount` remains validated as part of the client contract but is not passed to the resolver; the resolver receives only `{ x, y, epsg }`. Valid coordinate-free requests skip the resolver and increment once, preserving existing behavior.

An explicitly cross-site `Sec-Fetch-Site` value returns 403. If `Origin` is present, it must be a valid origin matching the request URL origin; paths, credentials, malformed origins, and mismatches return 403. Missing browser metadata is allowed because these checks are browser-oriented containment, not authentication for non-browser callers.

The permissive CORS `OPTIONS` implementation was removed. No `Access-Control-Allow-Origin` response behavior is provided for cross-origin use.

Stable public errors are:

| Condition | Status | Response error |
|---|---:|---|
| Invalid JSON or schema/value | 400 | `Invalid tracking request` |
| Explicit cross-site or mismatched Origin | 403 | `Tracking request is not allowed` |
| Body over 1,024 bytes | 413 | `Tracking request body is too large` |
| Missing/wrong media type | 415 | `Tracking request must use application/json` |
| Lookup/persistence failure | 500 | `Tracking temporarily unavailable` |

Responses do not echo raw exceptions, request bodies, coordinates, Supabase details, or upstream details. The precise `x` and `y` fields were also removed from the existing client tracking diagnostic log.

## Files changed

- `src/app/api/track/route.js` — route integration and removal of permissive CORS handling.
- `src/lib/tracking/trackingRequestPolicy.mjs` — pure schema, body-size, coordinate, EPSG, and browser-header policy.
- `src/lib/tracking/trackingHandler.mjs` — dependency-injected request handler used by the route and tests.
- `src/components/FileUpload.js` — stop logging precise tracking coordinates; preserve fire-and-forget behavior.
- `tests/trackingRequestPolicy.test.mjs` — deterministic policy and handler tests.
- `docs/agent-reports/20260731-tracking-input-containment.md` — this report.

No WMS route or WMS policy, stats route, tracking health route, tracking debug route, Supabase schema, production data, dependency manifest, or lockfile was changed.

## Tests and validation

- `node --test tests/trackingRequestPolicy.test.mjs` — passed, 18/18.
- `node --test tests/wmsProxyPolicy.test.mjs` — passed, 24/24.
- Targeted ESLint for every changed source and test file — 0 errors. One existing warning remains at `src/components/FileUpload.js:293` for the pre-existing `useCallback` dependency (`detectFormat`).
- `npm run build` — passed; Next.js compiled and generated the application routes.
- `git diff --check` for tracked changes — passed.
- Explicit trailing-whitespace check across all six intended files — passed, including the untracked files.

The tests cover the current payload, optional coordinate behavior, fixed event allowlist, missing and extra fields, malformed and oversized JSON, missing content type, missing/empty bodies, non-finite values, numeric strings, sample-count boundaries, EPSG and coordinate boundaries, UTF-8 byte counting and malformed UTF-8, streamed overflow/cancellation and later-chunk non-consumption, declared-length rejection including impossible numeric lengths, small-declared/oversized-actual bodies, cross-site metadata, Origin mismatch, dependency call counts, pre-dependency rejection, resolver argument shape, and sanitized errors.

## Intentionally rejected behavior

This patch intentionally rejects arbitrary event names, missing event types, unknown top-level or coordinate fields, numeric coordinate strings, unsupported EPSG values, invalid/out-of-range coordinates, arrays/primitives/null bodies, malformed JSON, oversized bodies, wrong content types, explicit cross-site fetch metadata, and mismatched or malformed Origins. Cross-origin tracking is not a supported legitimate caller contract.

## Legitimate behavior preserved

The single application caller still records `upload_success` after a successful parse, with or without a dataset coordinate. Tracking remains asynchronous and best-effort in the client. A valid coordinate-bearing request performs no more than one resolver invocation and one aggregate increment; a coordinate-free request performs one aggregate increment and no resolver invocation. Metrics, retention, and Supabase persistence were not redesigned.

## Residual risks and required operational controls

- **Distributed rate limiting remains uncontained.** There is intentionally no in-memory limiter because it would not provide production protection across Vercel instances. A Vercel-level distributed control is still required: apply a production rate limit/bot rule to `POST /api/track`, keyed at least by source IP with a global/function budget, and monitor 4xx/5xx/upstream volume. Without that control, an attacker can still submit many individually valid same-origin-shaped requests, pollute counters, consume function executions, and trigger the existing resolver path. The input policy bounds each request but does not bound request frequency.
- **Replay/idempotency remains.** Replaying a valid `upload_success` request increments the aggregate again. No durable idempotency key or signed token was introduced because that would change the tracking design and persistence contract.
- **Direct non-browser callers are not authenticated.** A caller that omits `Origin` and `Sec-Fetch-Site` can still reach the public endpoint if its body satisfies the contract. Fetch metadata is a browser-oriented cross-site containment measure, not authentication.
- The existing municipality resolver may still perform its existing fallback outbound request after a first lookup misses. This patch ensures invalid input never reaches it and ensures one route-level resolver operation per valid request; it does not redesign resolver caching or fallback behavior.
- The existing aggregate storage behavior, including its environment-dependent Supabase/file fallback characteristics, is unchanged and outside AUD-001.

## Manual smoke tests

### Local

1. Run `npm run dev` and open the local application in a browser.
2. Upload a representative supported file. In browser network tools, confirm one same-origin `POST /api/track` follows successful parsing, returns 200, and file validation/UI completion is unaffected.
3. Confirm a file without a usable dataset coordinate still completes and the tracking request returns 200.
4. From a local terminal, send a no-coordinate valid request with `Content-Type: application/json`; expect 200. Send the same body as `text/plain`; expect 415. Send an unknown event type; expect 400.
5. Send a valid body with `Sec-Fetch-Site: cross-site`; expect 403. Send a valid body with an Origin from a different local origin; expect 403. Do not include real coordinates or credentials in terminal history.

### Vercel Preview

1. Open the Preview deployment through its normal browser URL and repeat the representative upload and no-coordinate checks.
2. Confirm the browser request is same-origin, returns the sanitized success shape, and does not interrupt file validation.
3. Using a controlled request that contains `Sec-Fetch-Site: cross-site`, confirm the Preview endpoint returns 403; using a mismatched Origin should do the same.
4. Verify the deployment’s Vercel rate-limit/bot-control rule is enabled for `POST /api/track`, and inspect aggregate request/error/upstream-volume metrics without exposing request bodies, credentials, or precise coordinates.

No credentials, private URLs, authentication headers, production request bodies, or production coordinates were accessed or printed during this work.

## Change-control confirmation

Only the intended tracking source files, tracking tests, client logging line, and this report were changed. Everything remains unstaged. Nothing was committed, pushed, merged, or deployed.
