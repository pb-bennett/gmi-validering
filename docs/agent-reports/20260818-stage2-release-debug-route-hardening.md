# Stage 2 release debug-route hardening

**Implementation date:** 2026-08-18
**Branch:** `feature/richer-upload-telemetry-app`
**Scope:** unauthenticated `/api/track/debug` release hardening

## Previous risk

The unauthenticated debug route returned request-derived geo data and selected
location/IP-style headers. Its error path also returned arbitrary dependency
or runtime error text. This was inconsistent with the public privacy boundary
and was a production release blocker.

## Final behavior

`GET /api/track/debug` now returns an empty fixed 404 in every runtime,
including production and Preview. It does not inspect the request, return
headers, return IP/client-address information, return geo/location data, or
expose arbitrary errors, secrets, or configuration values. No client-supplied
flag or header can enable the old behavior.

## Tests

Focused tests verify the fixed empty 404 for both production and Preview
deployment environments and verify that request-derived location/header/IP
details and arbitrary error text are absent. The existing normal tracking
tests remain unchanged and pass.

Normal `/api/track` behavior, statistics, Testmodus, and the richer telemetry
boundary are unchanged. No SQL, Supabase, Vercel, or deployment configuration
was changed. Richer telemetry remains disabled.
