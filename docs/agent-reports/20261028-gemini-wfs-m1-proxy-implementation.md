# Gemini VA WFS M1: restricted proxy foundation

Date: 2026-10-28  
Scope: M1 only from [the integration plan](20261028-gemini-wfs-integration-planning.md)

## Baseline and architecture check

Before edits, branch was feature/photo-workspace and HEAD was 373d9a055615ecbc809409006eae20446f6bf55f (Improve GMI photo defaults and marker ordering). The worktree contained only the untracked planning report, docs/agent-reports/20261028-gemini-wfs-integration-planning.md; it was preserved unchanged. No branches were switched, updated or committed. No sub-agents/delegation were used.

Read the planning report and inspected src/app/api/wms-proxy/route.js, src/lib/wmsProxyPolicy.mjs, src/app/api/contact/route.js, src/lib/contact/contactHandler.mjs, src/lib/contact/contactRequestPolicy.mjs and their test patterns. The existing Node App Router and injectable-handler approach still fit M1 at this HEAD. Dedicated WFS policy/handler modules keep the narrower destination/operation contract independent of WMS/contact. Neither existing implementation was refactored.

## Files added

| File | Purpose |
| --- | --- |
| [src/app/api/gemini-wfs/route.js](../../src/app/api/gemini-wfs/route.js) | Dynamic Node route; POST invokes the handler; other supported HTTP methods explicitly return safe 405 responses. |
| [src/lib/gemini-wfs/wfsProxyPolicy.mjs](../../src/lib/gemini-wfs/wfsProxyPolicy.mjs) | Fixed registry, strict request/BBOX/credential validation, URL construction, MIME/status rules and sanitized errors/headers. |
| [src/lib/gemini-wfs/wfsProxyHandler.mjs](../../src/lib/gemini-wfs/wfsProxyHandler.mjs) | Injectable transport, bounded input/output, transient server-built Basic authentication, deadline/cancellation and raw response handling. |
| [tests/wfsProxyPolicy.test.mjs](../../tests/wfsProxyPolicy.test.mjs) | Policy/contract, hostile input, credential validation, MIME and non-disclosure tests. |
| [tests/wfsProxyHandler.test.mjs](../../tests/wfsProxyHandler.test.mjs) | Injected transport, route wiring, auth/header isolation, status mapping, body bounds, cancellation and cache/security tests. |
| This report | Completion evidence and remaining scope. |

No pre-existing tracked application, configuration, dependency, test or deployment files changed. No new dependency was added. Build output stays in the ignored .next directory. The pre-existing planning report remains untracked alongside the new work.

## Request contract

POST /api/gemini-wfs accepts exactly these five JSON fields:

| Field | Accepted value |
| --- | --- |
| connectionId | faerder-va-basis |
| featureType | lines or points |
| bbox | Four finite JSON numbers: [minX, minY, maxX, maxY] |
| username | Required bounded string; no colon/control/format characters, blank-only value or lone surrogate |
| password | Required bounded string; no control characters or lone surrogate; otherwise preserved exactly |

Unknown/missing fields, malformed JSON, duplicate top-level keys (including escaped duplicate names), query parameters and non-POST methods are rejected. BBOX strings/null/nonfinite values are rejected. Content-Type must be application/json, optionally with UTF-8 charset; unsupported request Content-Encoding is rejected. Input is decoded as strict UTF-8.

Origin must parse as a clean HTTP(S) origin matching new URL(request.url).origin. Supplied Sec-Fetch-Site must be same-origin. Missing Origin is rejected; missing Sec-Fetch-Site is permitted, following the contact route's pattern. Forwarded host/protocol headers are not used to authorize a caller. Local HTTP development origins work through the same exact-origin rule; upstream transport is always HTTPS.

The server chooses the fixed target:

https://faerder.geminisuite.com/portal/api/proxy/map/va-basis.wfs

It builds a new URL with exactly SERVICE=WFS, VERSION=2.0.0, REQUEST=GetFeature, TYPENAMES=gemini:VA_LINE or gemini:VA_MPNT, SRSNAME=EPSG:25832 and BBOX=minX,minY,maxX,maxY,EPSG:25832. URLSearchParams performs encoding. No caller-controlled target, operation, version, CRS, headers, FILTER/CQL, outputFormat, raw XML, COUNT or paging parameters are forwarded.

## Security and transport decisions

- Only the private fixed registry can choose a destination. A malicious connection identifier, body URL/host/path/port or query cannot redirect credentials elsewhere. Registries use Map lookups, including safe rejection of prototype-like identifiers.
- Basic Authorization is built in the request handler using Node Buffer with UTF-8. Password whitespace, colons and Unicode composition remain intact. Incoming browser Authorization, x-wms-auth, cookies and arbitrary headers are not forwarded. Only server-built Authorization and a fixed XML/GML Accept header are sent upstream.
- Credentials exist in request-local variables only. No cookies, environment credentials, shared service account, persistent server session, cache, filesystem or database storage were added. The handler factory closes over dependencies, not credentials.
- Upstream fetch is HTTPS GET with cache=no-store and redirect=manual. All 3xx responses are rejected without another request. Error bodies are not consumed or reflected.
- One deadline covers request body read, upstream headers and response body read. A client abort propagates to the upstream signal. Abortable waits ensure a stalled transport/body cannot hold the handler past cancellation; cleanup does not await a stalled cancel. Late responses from an injected/non-cooperating transport have their body disposed too.
- Successful responses are bounded raw bytes with an allowlisted XML/GML Content-Type. No XML/GML parsing, feature counting or transformation occurs. HTTP 200 XML exception reports and malformed XML are deliberately left to M2 semantic parsing; this milestone validates transport, not feature semantics. HTML MIME/login pages are rejected by the MIME allowlist.
- All success/error responses use Cache-Control: private, no-store; X-Content-Type-Options: nosniff; and the WMS-style Content-Security-Policy: default-src 'none'; sandbox. Errors use application/json; charset=utf-8. No upstream Set-Cookie, Location, WWW-Authenticate, caching metadata, provider headers or arbitrary bodies are forwarded. Retry-After is intentionally not forwarded in M1.
- No logging or telemetry was added. Error objects/results contain only fixed codes/messages, never provider exceptions, causes, credentials, URLs or request/response payloads. Validation returns only a credential-free constructed URL. Tests assert non-disclosure using runtime-generated credentials without printing them.
- Explicit GET/HEAD/OPTIONS/PUT/PATCH/DELETE denials prevent framework-generated OPTIONS/HEAD behavior from supplying a different cache/header contract. Allow is POST; no CORS permission headers are returned.

## Limits and response policy

| Limit | Implemented value |
| --- | --- |
| Request body | 16 KiB, checked both declared and actual streamed bytes |
| Username/password | 256 / 1024 UTF-16 code units; no normalization/trimming |
| BBOX easting | 100000–900000 metres |
| BBOX northing | 0–10000000 metres |
| BBOX ordering | Strict minX < maxX and minY < maxY |
| Width / height | At most 2000 m each |
| Area | At most 4000000 m² |
| Response body | 3 MiB, declared and actual bytes after fetch decompression |
| Total deadline | 15000 ms; factory override exists only for deterministic injected tests |
| Accepted response MIME | application/xml, text/xml, application/gml+xml |
| Declared response charset | Absent, utf-8/utf8 or us-ascii; quoted/case variations normalized |

Coordinate bounds are conservative UTM32 sanity checks, not a municipal boundary. Excessive requests are rejected, never cropped. The 3 MiB cap follows the plan's conservative buffered-response budget.

Malformed Content-Length, absent/empty response body, invalid body chunks and unsupported Content-Encoding are rejected. Missing Content-Length is permitted under the streamed-byte limit. Uncompressed bodies must match a declared length. For gzip/deflate/br, Node fetch exposes decoded bytes while preserving the compressed length header, so equality is not required; the actual decoded byte cap still applies, and encoding/length headers are not forwarded. Any broken stream is sanitized.

Errors return an object with ok=false, code and a fixed message:

| Code | Status |
| --- | --- |
| invalid_request | 400 |
| request_too_large | 413 |
| unsupported_media_type | 415 |
| origin_rejected | 403 |
| method_not_allowed | 405 |
| authentication_failed | 401 |
| permission_denied | 403 |
| provider_rate_limited | 429 |
| timeout | 504 |
| request_aborted | 499 |
| upstream_failure | 502 |
| upstream_redirect | 502 |
| unsupported_upstream_mime | 502 |
| invalid_upstream_response | 502 |
| response_too_large | 502 |

499 is a handler-level cancellation result; a disconnected client may not receive a response. No upstream authentication challenge is forwarded with 401.

## Validation performed

Node v24.19.0 was used locally. All Gemini fetch behavior in automated tests was injected/synthetic.

### New M1 tests

    node --test tests/wfsProxyPolicy.test.mjs tests/wfsProxyHandler.test.mjs

Final result: **41 tests passed, 0 failed, 0 skipped**.

Coverage includes both endpoint mappings and the exact query contract; required fields; unknown destination/WFS options; malformed/duplicate JSON; request charset/origin/method/query checks; unsafe credentials; numeric BBOX bounds; exact Basic forwarding and concurrent-user isolation; cookie/header non-forwarding; raw bytes; all allowed MIME types; redirects; upstream 401/403/429/5xx and invalid success statuses; sanitized errors/no logging; size/length handling; stalled fetch/upload/download; client abort; late body cleanup; and actual route exports.

During the first development run, 13 status-mapping cases used an invalid synthetic Unicode HTTP header and one cancellation case exposed missing late-body disposal. The fixture headers and cleanup were corrected; the final complete run is green. No generated credential values were printed.

### Existing regressions and broader selection

    node --test tests/wmsProxyPolicy.test.mjs tests/contactHandler.test.mjs tests/contactRequestPolicy.test.mjs tests/contactRateLimit.test.mjs tests/sendContactEmail.test.mjs tests/trackingRequestPolicy.test.mjs tests/trackDebugRouteHardening.test.mjs tests/layerPresentation.test.mjs tests/layerOrder.test.mjs tests/photoMapFeatures.test.mjs tests/photoResetIntegration.test.mjs tests/photoSpatialProjection.test.mjs tests/featurePopupContent.test.mjs tests/photoGmiDefaults.test.mjs

Result: **117 tests passed, 0 failed, 0 skipped**. This covers WMS policy, contact request/handler/rate/delivery boundaries, tracking API protection, photo/reset/CRS/defaults, layer ordering/presentation and safe popup behavior. Existing Node module-type and unavailable-localStorage harness warnings were emitted. The full repository/browser suite was not run; the selected server and cross-domain regressions cover the untouched areas most relevant to this isolated route.

### Lint and build

Focused ESLint checks on the three backend files and two test files passed with no warnings/errors, both via npx --no-install eslint and direct node node_modules/eslint/bin/eslint.js.

    npm run build

Result: **passed, exit 0**. Next.js 16.1.6/Turbopack compiled successfully, generated all eight static pages, and listed /api/gemini-wfs as a dynamic route alongside existing WMS/contact/tracking routes. The build emitted an existing outdated Browserslist-data notice. No dependencies/configuration were updated to address that unrelated notice.

Tracked-file comparison confirmed WMS/contact/photo implementations, package.json/package-lock.json and Next configuration remain unchanged. No build-time Gemini calls are needed or made by this route.

## Open questions and deferred work

- No blocker to reviewing M1. Actual service MIME/charset and Unicode Basic credential encoding remain unverified because this milestone deliberately avoids live Gemini access. The allowlist is narrow; expand it only with service evidence and tests.
- HTTP 200 OWS exceptions, malformed GML, feature geometry/attributes, XY/XYZ, numberReturned quirks and completeness are M2+ responsibilities. M1 intentionally passes approved raw XML bytes and has no COUNT/paging logic.
- The origin check follows existing request-origin patterns; deployed proxy-origin normalization, request-signal disconnect behavior, function duration/payload behavior and platform/APM body/header capture require later hosted acceptance. No deployment settings changed.
- Same-origin checks do not authenticate nonbrowser callers. Fixed target and resource limits prevent a general SSRF proxy but do not eliminate invocation cost or upstream login attempts. Review deployment-level throttling before public rollout; no new rate-limit infrastructure/account system was added.
- Browser client/session credentials, extent calculation, survey-derived BBOX generation, configuration/password-manager UI, automatic/manual fetch UI, reference layers/card, symbology and popup inspection are deferred. No empty future modules were created.

## Scope confirmation

**No real Gemini credentials were used. No live Gemini WFS calls were made. M2 or later functionality was not implemented.** All upstream tests use generated synthetic authentication and injected fetch; route-wiring tests replace global fetch with a synthetic implementation.

The existing planning report was preserved unchanged. Only the three M1 backend files, two focused test files and this completion report were added. No commit, branch change, dependency installation, deployment or shared-account configuration was performed.
