# WMS Proxy Containment

Date: 2026-07-31
Branch: `security/wms-proxy-containment`
Production baseline: `b5c459aeefa9b889b6ad4f369623fd8f95fdeafa`

## Goal

Contain the public WMS proxy without changing unrelated application behaviour or deploying to production.

## Changes

- Restricted targets to HTTPS Gemini tenant subdomains beneath `.geminisuite.com`.
- Restricted targets to the Gemini map proxy path.
- Allowed only validated WMS `GetCapabilities` and `GetMap` requests.
- Rejected ambiguous or malformed security-relevant query parameters.
- Rejected unsafe DNS results, private addresses, redirects and non-default ports.
- Restricted authentication to Basic authentication over HTTPS.
- Added a 15-second timeout and 10 MiB response limit.
- Restricted upstream response status and content types.
- Disabled public caching and added defensive response headers.
- Sanitised client-facing errors.
- Added deterministic Node policy tests.

## Automated validation

- `node --test tests/wmsProxyPolicy.test.mjs`: PASS, 24 tests
- Targeted ESLint: PASS
- `npm run build`: PASS
- `git diff --check`: PASS

## Manual compatibility test

A local smoke test was performed using the real Færder Gemini WMS configuration.

- The WMS layer loaded successfully.
- Repeated `GetMap` tile requests returned HTTP 200.
- Tiles continued loading during map interaction.
- No credentials were placed in source code, reports or Git history.

## Remaining limitations

- The target URL and map extent parameters remain visible in development and potentially platform request logs.
- The endpoint has no distributed rate limiting.
- DNS validation occurs before the runtime establishes the connection, leaving a small residual DNS-resolution race.
- Only the confirmed Gemini Suite tenant and path pattern is supported.
- No production deployment was performed.
