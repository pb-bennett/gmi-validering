# Contact Form C1 Server Foundation

Date: 2026-08-26  
Repository: `C:\GitHub\gmi-validering`  
Branch: `feature/app-info-version-changelog`

## Architecture Implemented

The provider-independent foundation is implemented as:

```text
POST /api/contact
  -> content/header policy
  -> process-local rate check
  -> bounded streamed body reader and fatal UTF-8 decode
  -> strict JSON request policy
  -> honeypot
  -> injected delivery dependency
  -> sanitised response
```

`src/app/api/contact/route.js` is a thin Node.js App Router route. Policy,
body handling, rate limiting, and delivery outcome mapping are framework-free
modules under `src/lib/contact/`.

## Request Policy

Only `category`, `message`, `email`, and `website` are accepted at the top
level. Unknown keys, duplicate keys, nested values, arrays, and wrong scalar
types are rejected. Categories are limited to `bug`, `suggestion`, `comment`,
and `other`, with server-side labels `Feil`, `Forslag`, `Kommentar`, and
`Annet`.

Messages are trimmed, CRLF/CR-normalised to LF, NFC-normalised, and limited to
1-4,000 Unicode code points. NUL, disallowed C0/C1 controls, DEL, unpaired
surrogates, and bidi override/isolate controls are rejected. Normal Norwegian
text, tabs, newlines, and punctuation remain valid.

Email is optional and accepts only one pragmatic ASCII mailbox, with trimming,
domain lower-casing, and a 254-character maximum. Display names, lists,
control characters, CR/LF, malformed mailboxes, and Unicode addresses are
rejected. The request cannot provide From, To, CC, BCC, Reply-To, or arbitrary
headers.

## Body and Header Policy

The endpoint requires `application/json`, allowing normal media-type parameters.
It requires a valid `Origin` matching the request URL origin exactly. If
`Sec-Fetch-Site` is present, it must be `same-origin`. This is request
containment, not authentication or permissive CORS.

The 20 KiB body limit is checked from a valid `Content-Length` and again while
reading the stream. Stream reading is cancelled immediately after overflow.
UTF-8 decoding is fatal, so malformed byte sequences are rejected before JSON
validation or delivery.

All public responses use `Cache-Control: no-store` and
`X-Content-Type-Options: nosniff`, and contain only the documented status/code
shape.

## Honeypot

`website` must be omitted or an empty string for a normal submission. A
non-empty string is silently treated as a honeypot hit: the handler returns the
same `{ "ok": true }` response as a successful send, does not invoke the
delivery dependency, does not inspect configuration, and does not log content.

## Rate Limiter

`contactRateLimit.mjs` provides a process-local, expiring burst limiter with a
five-attempt per requester limit and a 100-attempt global/process limit per ten
minutes. It keeps at most 2,000 requester buckets, prunes expired entries, and
returns a bounded retry interval for HTTP 429 handling.

The default requester key is derived with an ephemeral per-process salt and
SHA-256. Only the opaque derived key is held in the in-memory bucket map; raw
requester/IP values are not stored or logged. The route prefers the platform
`request.ip` value and then the Vercel `x-vercel-forwarded-for` value, without
using arbitrary `x-forwarded-for` input.

This is intentionally not a deployment-wide or durable rate limit. Serverless
instances do not share memory, cold starts reset state, and distributed callers
can evade it. A platform/WAF control remains a later production consideration.

## Injected Delivery Interface

The handler accepts a `deliver` dependency receiving only:

```text
{ category, categoryLabel, message, email }
```

The internal result is `{ outcome: 'sent' | 'unavailable' | 'failed' }`.
The C1 route injects a fixed unavailable fake delivery. It makes no provider
call and reads no configuration. No Resend import, fetch, API key, mailbox,
email construction, or real delivery exists in this slice.

## Public Response Contract

- `200`: `{ "ok": true }`
- `400`: `{ "ok": false, "code": "invalid_request" }`
- `403`: `{ "ok": false, "code": "request_not_allowed" }`
- `413`: `{ "ok": false, "code": "request_too_large" }`
- `415`: `{ "ok": false, "code": "unsupported_media_type" }`
- `429`: `{ "ok": false, "code": "rate_limited" }` plus `Retry-After`
- `503`: `{ "ok": false, "code": "contact_unavailable" }`
- `502`: `{ "ok": false, "code": "send_failed" }`

Submitted values, raw exceptions, stack traces, environment names, provider
details, rate-limit keys, IPs, and application/file state are never returned.

## Privacy Boundaries

The C1 endpoint has no contact persistence, database, telemetry, file/parser
access, WMS access, localStorage access, municipality lookup, or application
state import. Arbitrary request fields are not forwarded. Rejected requests
invoke no delivery dependency, and no real external network call is made.

## Tests and Checks

- `node --test tests/contactRequestPolicy.test.mjs tests/contactRateLimit.test.mjs tests/contactHandler.test.mjs`: 24 passed
- `node --test "tests/*.test.mjs"`: 159 passed
- Focused ESLint on all C1 source/test files: passed with 0 errors
- `npm run build`: passed
- `git diff --check`: passed

Tests use `node:test`, injected clocks/keys, fake delivery, and local streams.
They perform no email delivery or external network request.

## Residual Risks

The process-local limiter is only a burst guard and is not a deployment-wide
control on Vercel/serverless infrastructure. C1 has no provider delivery, so
normal valid submissions currently map through the route's injected unavailable
outcome. Provider configuration, plain-text email construction, provider
retention, UI payload construction, and browser UX belong to later C2/C3 work.

No Contact UI, Resend integration, real email configuration, environment change,
database change, dependency change, commit, push, merge, or deployment was
made.
