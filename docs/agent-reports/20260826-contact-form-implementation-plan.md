# Contact/feedback form implementation plan

Date: 2026-08-26

Branch audited: `feature/app-info-version-changelog`

Scope: planning and audit only

## Executive recommendation

Implement a small client form in the existing `Kontakt` tab and submit it to a
same-origin Next.js App Router endpoint:

```text
ContactForm (browser)
  -> POST /api/contact (same origin, bounded JSON)
  -> framework-free request policy and handler
  -> fixed Resend HTTPS endpoint (server only)
  -> configured project-owner mailbox
```

Use **Resend** as the single recommended provider. Call its REST API with the
runtime's native server-side `fetch` rather than adding the Resend SDK. This is a
very small integration, avoids a new application dependency, keeps the provider
replaceable behind one adapter, and still uses Resend's documented HTTPS API.
Use a Resend API key restricted to sending and, if available in the dashboard,
to the verified sending domain.

The v1 user-visible fields should be:

- `Kategori` (required): `Feil`, `Forslag`, `Kommentar`, or `Annet`;
- `Melding` (required, multiline); and
- `E-post` (optional, only for a reply).

Do **not** include a name field. A name does not materially improve triage or
replying, users can sign their message if they choose, and omitting it avoids
collecting another piece of personal information.

The server may add the canonical app version already displayed in the Kontakt
hero. This should be stated next to the form. Do not send page/tab, user-agent,
browser summary, IP address, local storage, or any loaded-file/application
state to Resend. No database is needed.

## Repository findings and conventions

The plan is based on the current working tree, including its pre-existing
uncommitted changes. Those changes must be preserved.

- `src/components/AppInfoModal.js:460-482` contains the intentional Kontakt
  placeholder. The shared hero already displays `CURRENT_APP_VERSION`; the
  modal has a focus trap, keyboard tab navigation, a scrollable panel, and
  shared typography/spacing.
- `src/data/appReleases.mjs:95-97` is the canonical source for the current app
  version. The current working-tree version is `1.1.0`; the implementation must
  import the constant and must not hard-code it into the request or email.
- The repository uses the Next.js App Router and thin route handlers under
  `src/app/api/*/route.js`. It is currently on Next `^16.1.1` and React `19.2.1`.
- The strongest reusable server pattern is the tracking endpoint:
  `src/lib/tracking/trackingRequestPolicy.mjs` is framework-free,
  `trackingHandler.mjs` injects dependencies and bounds streamed bodies, and
  `src/app/api/track/route.js` only wires dependencies into `NextResponse`.
- That policy already rejects excess keys, enforces JSON, checks Origin and
  `Sec-Fetch-Site`, counts UTF-8 bytes, handles malformed UTF-8, and returns
  sanitised errors. The contact endpoint should reuse the pattern, not import
  tracking-specific code or create validation directly inside the route.
- `src/app/api/wms-proxy/route.js` provides the current timeout,
  `AbortController`, no-store response, and sanitised upstream-error pattern.
- Server secrets currently use unprefixed `process.env` names. The repository
  has no committed environment template and `.gitignore` ignores `.env*`.
  Real `.env` values were deliberately not inspected in this audit.
- `package.json` has no schema-validation, rate-limit, email, DOM-test, or
  browser-test dependency. Tests use `node:test` and `node:assert`; UI contracts
  are currently source-based in `tests/appInfoUiContract.test.mjs`.
- The README identifies Vercel as the intended host. In-memory state therefore
  cannot be treated as a deployment-wide or durable rate limit.
- There is no existing contact, email, CAPTCHA, honeypot, durable rate-limit, or
  generic form helper to reuse.
- New UI icons use `@phosphor-icons/react`. The contact form does not need an
  icon; plain button/status text is clearer and avoids decorative noise. If an
  icon is added later, verify the exact export from the installed package and
  extend the existing icon contract test.

## Provider recommendation

### Recommend Resend

Resend remains appropriate for a low-volume, transactional feedback form:

- it exposes a small HTTPS send-email API with `from`, `to`, `subject`, `text`,
  and `reply_to` support;
- its free transactional tier currently documents 3,000 emails/month and 100
  emails/day, which is sufficient for expected legitimate volume and also caps
  v1 free-tier abuse;
- it currently provides immediate production access after domain verification,
  rather than an SES-style production-access request; and
- API keys can be restricted to send-only and to a selected domain.

Use the REST endpoint directly because this integration needs one operation.
The adapter must use the fixed `https://api.resend.com/emails` URL, bearer auth,
a fixed application `User-Agent`, `Content-Type: application/json`, an 8-second
timeout, disabled redirects, and no automatic retry. Treat only a documented
2xx response as success and never return or log the provider response body or
provider message ID.

### Alternatives considered

| Alternative | Assessment |
| --- | --- |
| `mailto:` | No secret or backend, but depends on a configured local mail client, gives poor success semantics, exposes the recipient address, and cannot enforce the request/privacy policy. Not recommended. |
| Postmark | A sound transactional provider with server tokens, sender signatures, plain-text bodies, Reply-To, and a non-delivering test token. It does not materially simplify this one-operation integration compared with Resend. |
| Amazon SES | Capable and cost-effective at volume, but requires AWS identity/IAM/region management and new accounts begin in a restricted sandbox. This is unnecessary operational weight for a small public form. |
| Hosted form backend | Removes some code but moves validation, spam decisions, disclosure, and retention further outside the app. It is less aligned with the existing explicit same-origin server-policy pattern. |

Relevant official documentation reviewed on 2026-08-26:

- [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend API authentication](https://resend.com/docs/api-reference/introduction)
- [Resend API-key permissions](https://resend.com/docs/dashboard/api-keys/introduction)
- [Resend pricing and retention](https://resend.com/pricing)
- [Resend message-content storage](https://resend.com/docs/knowledge-base/how-do-i-ensure-sensitive-data-isnt-stored-on-resend)
- [Postmark email API](https://postmarkapp.com/developer/api/email-api)
- [Amazon SES sandbox/production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)

Provider features, quotas, pricing, and retention can change; recheck them at
the C3 configuration review.

## Privacy model

### Data intentionally sent to Resend

- category, as a server-mapped Norwegian label;
- the user's normalised plain-text message;
- optional user email, only as a validated `Reply-To` value; and
- `CURRENT_APP_VERSION`, added by the server from the canonical release catalog.

The browser should not be trusted to declare app version. Adding it server-side
also prevents an arbitrary client value from reaching the email.

### Data explicitly excluded

The contact component must not import the Zustand store, parser output,
telemetry builders, validation state, WMS state, or app-info local-storage
helpers. Its request builder must construct a fresh object from the controlled
form fields only. It must never attach:

- filename, source path, file bytes, GMI/SOSI/KOF content;
- parsed attributes, coordinates, bbox, object IDs, or validation results;
- inferred municipality, project, customer, organisation, or local-storage data;
- WMS URL, credentials, or request state;
- current tab/page (the endpoint already implies Kontakt); or
- browser/user-agent summary.

The user agent offers limited diagnostic value for general feedback and can be
requested later if a bug requires it. It must not be copied into the email.
Ordinary HTTP metadata such as IP address and user agent is necessarily visible
to the hosting platform when the POST is received; that is a hosting boundary,
not contact payload. A requester IP may be transformed into a short-lived,
process-local opaque rate-limit key, but must not be emailed, persisted, or
logged by application code.

Suggested short disclosure near the button:

> Bare det du skriver her, og appversjonen som vises over, sendes på e-post via
> Resend. E-post er valgfritt og brukes bare hvis du ønsker svar. Ingen fil- eller
> valideringsdata legges ved.

This is short enough for the form and does not attempt to be a full privacy
policy. The existing transparency section should also be amended during C2 to
identify Resend as the feedback email provider and the provider/mailbox
retention boundary.

## Server request contract

### Route and method

- Location: `src/app/api/contact/route.js`
- Method: `POST` only
- Runtime: explicitly `nodejs`
- Mode: dynamic/no-store
- Content type: exactly `application/json` (parameters such as charset allowed)
- CORS: do not enable cross-origin access and do not add a permissive OPTIONS
  response

### Request JSON

```json
{
  "category": "bug",
  "message": "Det ser ut som ...",
  "email": "bruker@example.no",
  "website": ""
}
```

Contract details:

| Field | Required | Server rule | Normalised result |
| --- | --- | --- | --- |
| `category` | Yes | Exact enum: `bug`, `suggestion`, `comment`, `other` | Map server-side to `Feil`, `Forslag`, `Kommentar`, `Annet` |
| `message` | Yes | String, 1-4,000 Unicode code points after trim/normalisation | NFC; CRLF/CR converted to LF; outer whitespace trimmed |
| `email` | No | Empty/omitted or one pragmatic ASCII mailbox, maximum 254 characters | Trim and lower-case domain; never accept a list or display-name syntax |
| `website` | No | Must be a string if present; legitimate value is empty | Honeypot; a non-empty value is silently accepted but never delivered |

Allow **only** those four keys. Reject unknown keys, nested objects, arrays,
numbers, duplicate/conflicting representations, and all other JSON shapes. Do
not ignore excess fields because doing so makes accidental file-state
transmission harder to detect.

Set `CONTACT_MAX_BODY_BYTES = 20 * 1024` and enforce it twice: first from a
valid `Content-Length`, then while reading the request stream. Cancel the reader
immediately on overflow. Twenty KiB accommodates a 4,000-code-point message at
worst-case UTF-8 width plus small JSON overhead without allowing arbitrary
bodies. Decode UTF-8 fatally and reject malformed data.

Header policy:

- require an `Origin` header that parses to and exactly equals the request URL
  origin;
- if `Sec-Fetch-Site` is present, require `same-origin`;
- do not treat these checks as authentication: scripted callers can forge them;
  they primarily stop third-party web pages from consuming the mail quota.

Character policy:

- preserve ordinary Norwegian/Unicode text and line breaks;
- reject NUL, C0/C1 controls other than tab/newline, DEL, unpaired surrogates,
  and bidi override/isolate controls (`U+202A-U+202E`, `U+2066-U+2069`);
- reject CR/LF and all control characters in email/configured mailbox values;
  and
- do not over-sanitise ordinary punctuation or rewrite the meaning of a report.

Client length attributes improve UX, but the server policy is authoritative.

### Processing order

1. Validate content type and same-origin headers.
2. Apply the lightweight request-rate check before reading the body.
3. Read and decode the body with the hard byte limit.
4. Parse JSON and apply exact-key/type/length/character validation.
5. If the honeypot is non-empty, return the ordinary success response without
   invoking the provider. Do not reveal that the trap was detected.
6. Resolve and validate server configuration. Missing/invalid configuration
   returns a stable unavailable response and never calls Resend.
7. Construct the bounded email from server-owned values and call the fixed
   provider endpoint with an 8-second abort timeout.
8. Return a small sanitised JSON result with no provider body, ID, secret, or
   submitted value.

Do not automatically retry a provider call: a timeout can occur after Resend
accepted the email, so a retry can duplicate feedback. The UI disables repeated
submission while pending; a user can deliberately retry after a visible error.

### Response contract

All responses should include `Cache-Control: no-store` and
`X-Content-Type-Options: nosniff`.

| Status | Public body | UI meaning |
| --- | --- | --- |
| `200` | `{ "ok": true }` | Sent, or honeypot discarded with indistinguishable response |
| `400` | `{ "ok": false, "code": "invalid_request" }` | Field/request validation error |
| `403` | `{ "ok": false, "code": "request_not_allowed" }` | Origin policy failure; show generic failure |
| `413` | `{ "ok": false, "code": "request_too_large" }` | Message/request too large |
| `415` | `{ "ok": false, "code": "unsupported_media_type" }` | Invalid client; show generic validation failure |
| `429` | `{ "ok": false, "code": "rate_limited" }` | Too many attempts; include bounded `Retry-After` header |
| `503` | `{ "ok": false, "code": "contact_unavailable" }` | Missing/invalid server configuration |
| `502` | `{ "ok": false, "code": "send_failed" }` | Provider rejection, timeout, or network failure |

Unexpected internal failures should use the same `send_failed` public shape,
not a raw `500` payload. The handler may distinguish fixed operational outcomes
internally, but client messages must not contain stack traces, environment
names, API details, provider responses, or submitted data.

## Environment and secret handling

Required production variables:

| Variable | Purpose | Exposure rule |
| --- | --- | --- |
| `RESEND_API_KEY` | Authorise the fixed Resend send request | Server-only secret; send-only and domain-scoped; never `NEXT_PUBLIC_*` |
| `CONTACT_TO_EMAIL` | Single project-owner recipient mailbox | Server-only configuration; never accepted from the request |
| `CONTACT_FROM_EMAIL` | Bare mailbox on the verified sending domain | Server-only configuration; adapter adds the fixed `GMI Validator` display name |

All three must remain unprefixed and imported only by server-route/lib code.
Do not expose a configuration object to `ContactForm`, serialize it through a
Server Component, return it from an API GET, or interpolate it into a client
error. Validate `CONTACT_TO_EMAIL` and `CONTACT_FROM_EMAIL` as single bare
mailboxes with no control characters, commas, display names, or multiple
recipients.

Configuration must be read lazily or through an injected getter so importing
the module/building the app does not throw. If any value is absent or invalid:

- the app and modal still render;
- `POST /api/contact` returns the stable 503 shape;
- no provider call is made; and
- local development shows the friendly unavailable state, not a crash.

No real value belongs in source, docs, tests, fixtures, browser bundles, preview
logs, or error messages. Do not add a client-visible `NEXT_PUBLIC_RESEND_API_KEY`
or any equivalent.

## Email and header construction

Construct only a plain-text transactional message:

```text
From: GMI Validator <CONTACT_FROM_EMAIL>
To: CONTACT_TO_EMAIL
Reply-To: validated user email (only when supplied)
Subject: GMI Validator: Feil

Kategori: Feil
Appversjon: 1.1.0

Melding:
<normalised user message>
```

The subject must come from a fixed mapping keyed by the validated category; do
not include message text, email, or arbitrary category text. The configured
application sender always remains `From`. The optional user email goes only in
Resend's structured `reply_to` property and is never used as `From`.

Send `text`, not `html`. Do not create custom user-controlled headers and do
not pass a generic headers object from the client. Plain text prevents submitted
HTML/script from becoming trusted email HTML. Control-character rejection and
server-owned header values prevent header injection.

The outbound host, path, method, sender, recipient, and subject template are all
server-controlled. This prevents the endpoint from becoming an open relay or
SSRF primitive.

## Spam and abuse strategy

### V1 controls

Use layered, low-friction controls:

1. an off-screen `website` honeypot excluded from keyboard and accessibility
   navigation; non-empty submissions receive fake success and are not sent;
2. strict same-origin/content-type checks;
3. 20 KiB body and strict field/character limits;
4. client pending lock and post-success confirmation to prevent accidental
   double submits;
5. a bounded, process-local token/window limiter before body parsing;
6. the provider account quota and operational monitoring; and
7. no attachments, arbitrary recipients, templates, URLs, or provider options.

For the process-local limiter, use an ephemeral per-process salt to transform
the Vercel-provided client IP into an opaque key. Suggested starting values are
five attempts per key per ten minutes and 100 total attempts per process per ten
minutes. Keep no more than 2,000 buckets, prune expired entries, never log keys,
and return `429` plus `Retry-After`. On Vercel, prefer
`x-vercel-forwarded-for`; do not trust an arbitrary client-supplied IP header in
an environment where the platform has not overwritten it.

This limiter is deliberately only a burst guard. Serverless instances do not
share memory, cold starts reset it, and distributed callers can evade it. It
must not be described as a durable deployment-wide limit.

Do not implement minimum completion-time telemetry. It is trivial to forge and
would add automatically submitted metadata for little protection. Do not add
CAPTCHA/Turnstile in v1: it adds user friction, a new provider/data boundary,
and more failure modes before there is evidence it is necessary.

Do not add a Supabase table/RPC or a new Redis/KV service merely for the first
release. The current Supabase aggregate store is not a general abuse-control
store, and persisting IP-derived identifiers would expand the privacy model.

Before production exposure, check the actual Vercel plan and configure a WAF
rate-limit rule for exactly `/api/contact` if available. Vercel documents
platform DDoS protection for all deployments but plan/price-specific WAF rate
limiting; this dashboard control is preferable to a new application database.
If meaningful spam or quota exhaustion occurs despite v1 controls, durable
platform/edge rate limiting is the first escalation, then Turnstile only if
traffic evidence shows it is required.

Official Vercel references:

- [Vercel request IP headers](https://vercel.com/docs/headers/request-headers)
- [Vercel rate-limit guidance](https://vercel.com/kb/guide/add-rate-limiting-vercel)
- [Vercel WAF usage and pricing](https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing)

## UI integration and UX

Keep `AppInfoHero title="Kontakt"` unchanged. Replace the placeholder card with
one compact introductory paragraph and a form directly beneath it. Do not add a
large card grid or a second modal. A reasonable layout is:

- category select and optional email in a two-column `sm:` grid, stacking on
  narrow screens;
- full-width message textarea below;
- privacy note in subdued existing typography;
- one primary submit button; and
- an inline status/success region.

Use controlled state only in the contact component; never persist draft or
success state to local storage. On a failed send, preserve user-entered fields.
On success, clear personal values and replace the form with a concise thank-you
state plus an ordinary `Send en ny tilbakemelding` button if repeat feedback is
desired. Switching away from Kontakt or closing the modal may naturally unmount
and clear the draft.

Suggested user-facing concepts:

- success: `Takk! Tilbakemeldingen er sendt.`
- invalid message: `Skriv en melding før du sender.`
- invalid email: `Skriv inn en gyldig e-postadresse, eller la feltet stå tomt.`
- temporary failure: `Noe gikk galt under sending. Prøv igjen senere.`
- unavailable: `Kontaktskjemaet er ikke tilgjengelig akkurat nå.`
- rate limit: `Det er sendt mange tilbakemeldinger på kort tid. Prøv igjen litt senere.`

These are examples for implementation review, not final copy approval. Do not
surface separate provider, timeout, configuration-variable, or stack details.

## Accessibility plan

- Use a real `<form>` and explicit `<label htmlFor>` for category, email, and
  message; never use placeholder text as the label.
- Mark category and message required in both visible copy and native semantics.
- Use `<select>` for category, `type="email"` with `autoComplete="email"` for
  email, and a labelled `<textarea>` for the message.
- Apply `maxLength` client hints matching server limits without relying on them.
- Keep every visible control keyboard reachable and preserve the modal's
  existing focus trap and visible `focus-visible` styling.
- Associate field errors with `aria-describedby`, set `aria-invalid` only when
  invalid, and focus the first invalid field after client/server validation.
- Put success and form-level failure text in a persistent `role="status"` or
  polite `aria-live` region; do not announce on every keystroke.
- During submission, disable submit (and preferably the form controls), retain
  readable button text such as `Sender …`, and expose `aria-busy="true"` on the
  form/status region.
- The honeypot must have `tabIndex={-1}`, `aria-hidden="true"`, and no visible or
  screen-reader label. It must not create a keyboard trap.
- Do not rely on colour alone for validation/success; include text.
- Retest Escape, backdrop close, tab-loop, tab switching, narrow-screen scroll,
  and focus restoration because adding form controls changes the focusable set.

## Security threat model

Risk is classified before the planned mitigation; residual risk is stated where
material.

| Risk | Class | Mitigation / residual risk |
| --- | --- | --- |
| Spam, flooding, quota/cost exhaustion | **HIGH** | Honeypot, same-origin gate, strict limits, process-local burst limiter, provider quotas, monitoring, optional Vercel WAF rule. Residual distributed/serverless evasion remains the highest v1 risk. |
| Provider API-key exposure | **HIGH** | Server-only unprefixed env, thin route boundary, send-only/domain-scoped key, no client import/serialization/error leakage, secret-source contract test. Rotate immediately if exposed. |
| Accidental transmission of loaded GMI/user state | **HIGH** | Contact component has no store/parser/local-storage imports; fresh allowlisted payload; server rejects unknown fields; app version added server-side. Review network payload with a loaded file during smoke testing. |
| Open relay, SSRF, arbitrary provider use | **HIGH** | Fixed HTTPS host/path, redirect disabled, fixed recipient/sender/subject mapping, no user URL or generic email/provider options. |
| Email header injection | **HIGH** | Fixed From/To/subject, validated single-mailbox Reply-To, reject CR/LF/control characters and mailbox lists. |
| Oversized bodies / resource exhaustion | **MEDIUM** | Declared and streaming 20 KiB limit before JSON parse, fatal UTF-8 decoder, field/code-point bounds, early rate check. |
| HTML/script/content injection | **MEDIUM** | Send only provider `text`; no HTML template, interpolation into HTML, `dangerouslySetInnerHTML`, or trusted user markup. |
| Malicious Unicode/control characters | **MEDIUM** | NFC/newline normalisation; reject disallowed controls, unpaired surrogates, and bidi override/isolate controls while preserving normal Norwegian text. |
| Arbitrary JSON forwarding | **MEDIUM** | Exact top-level key allowlist, exact scalar types, reconstruct the provider payload from normalised fields only. |
| Response/provider/error leakage | **MEDIUM** | Stable public codes, no submitted values/provider bodies/IDs/stack/env names, no raw exception string. |
| Duplicate delivery after timeout | **LOW** | No automatic provider retry, disabled pending button, explicit user-controlled retry. A timeout-after-acceptance remains possible and should be tolerated. |
| Cross-site request consumption | **LOW** | Required matching Origin and same-origin Fetch Metadata. This is containment, not caller authentication. |

## Logging, provider boundary, and retention

Application code must not log:

- request bodies or message content;
- user email or any future name field;
- IP address or rate-limit key;
- provider request/response bodies or provider message IDs;
- headers, environment values, stack traces, or arbitrary exceptions; or
- file/application state.

If operational signals are needed, emit only fixed outcome names/counts such as
`contact_sent`, `contact_validation_rejected`, `contact_honeypot_discarded`,
`contact_rate_limited`, `contact_provider_failed`, and
`contact_unconfigured`. Prefer aggregate platform/provider counters rather than
one success log per message. A provider failure log may include only a broad
fixed class (`timeout`, `network`, `non_2xx`), never the response body.

Data will exist at these boundaries:

| Boundary | Data / retention |
| --- | --- |
| Browser | Controlled form state in memory until success, tab switch, modal close, or page unload; no localStorage/database |
| App server | Raw request and normalised values transiently in request memory; no message persistence; opaque rate-limit key only until its short TTL/process death |
| Vercel | Ordinary request metadata and platform logs under project/platform settings; application code must not add contact content to logs |
| Resend | Recipient, sender, optional Reply-To, subject, app version, and message content. Current public pricing states 30-day data retention; Resend documents that disabling content storage is a paid, eligibility-limited option. Confirm account settings at rollout. |
| Recipient mailbox | Delivered message remains according to the mailbox owner's retention/deletion practices and backups |

The statement “no database” means the app creates no contact record/table. It
does not mean the message exists nowhere outside the app. Resend and the
recipient mailbox are intentional data processors/storage boundaries.

No application database table, Supabase RPC, CRM record, or support-ticket
entity is justified for v1. The requirement is delivery of one email.

## Anticipated implementation files

### Core files

| File | Action and responsibility |
| --- | --- |
| `src/app/api/contact/route.js` | New thin App Router POST route; declare Node runtime/dynamic mode, wire version, limiter, delivery adapter, and sanitised `NextResponse` headers |
| `src/lib/contact/contactRequestPolicy.mjs` | New framework-free constants, exact request/header/body/Unicode/email validation, normalisation, category labels, and public error mapping |
| `src/lib/contact/contactHandler.mjs` | New bounded stream reader and dependency-injected request pipeline; no direct provider/environment dependency |
| `src/lib/contact/contactRateLimit.mjs` | New bounded, expiring process-local burst limiter with opaque ephemeral IP keys and no logging |
| `src/lib/contact/sendContactEmail.mjs` | New server-only-by-import-graph environment/config validator, fixed Resend REST adapter, timeout, plain-text email construction, and sanitised result |
| `src/components/ContactForm.js` | New isolated client form/state/fetch component; builds payload only from controlled fields and has no app-store/file-state imports |
| `src/components/AppInfoModal.js` | Replace only the Kontakt placeholder content with intro/disclosure and `ContactForm`; preserve hero/shell/tab/focus conventions |
| `src/data/appReleases.mjs` | Update the unreleased/current release notes only if product review confirms this form belongs in that release; no version bump is implied by this plan |
| `README.md` | Document variable **names**, local unavailable behaviour, and provider/domain setup without values; do not create a committed env file under the current `.env*` ignore convention |

No `package.json` or `package-lock.json` change is anticipated because native
server `fetch`, Web APIs, and Node crypto are sufficient. Do not add a second
icon library, form library, schema package, email SDK, CAPTCHA SDK, or rate-limit
service in v1.

### Tests

| File | Action and coverage |
| --- | --- |
| `tests/contactRequestPolicy.test.mjs` | New direct policy tests for accepted enums, normalisation, optional email, malformed email, exact keys, types, lengths, UTF-8/body overflow, controls/bidi, origins, and honeypot shape |
| `tests/contactRateLimit.test.mjs` | New deterministic clock/key tests for per-key/global limits, Retry-After, expiry, pruning, bucket cap, and no raw IP retention |
| `tests/contactHandler.test.mjs` | New injected end-to-end handler tests for success, provider failure/timeout, missing config, fake honeypot success, rate limit, no dependency calls on rejected input, and stable sanitised responses |
| `tests/sendContactEmail.test.mjs` | New mocked-fetch tests for fixed URL/method/headers, send-only env use, fixed From/To/subject, optional Reply-To, text-only body, timeout/redirect policy, response discard, and no real delivery |
| `tests/appInfoUiContract.test.mjs` | Replace the placeholder assertion with form/privacy/accessibility/network-payload contracts and verify no SVG/other icon library/store/localStorage/file-state coupling |

The repository has no jsdom, React Testing Library, or Playwright dependency.
Stay with current conventions: source-contract assertions for rendered JSX,
pure/server module behaviour through `node:test`, and a manual browser smoke for
actual focus, native validity, loading, success, and error behaviour. Do not add
a test framework only for this small form.

## Detailed test plan

### UI and accessibility

- category select renders all four Norwegian labels and a required semantic;
- message has an explicit label, required/max-length semantics, and textarea;
- email is visibly optional, `type="email"`, and `autoComplete="email"`;
- name, upload, project, municipality, organisation, phone, and attachment
  fields are absent;
- submit enters one loading state, is disabled, and cannot issue a second fetch;
- success clears personal fields and announces the thank-you state;
- validation, 429, temporary failure, and unavailable responses map to distinct
  Norwegian states without raw API text;
- `aria-invalid`, `aria-describedby`, `aria-live`/status, keyboard focus, focus
  ring, tab loop, Escape, tab switching, and small-screen scroll work;
- failed send preserves the message/email; and
- the request builder cannot read/import file, validation, WMS, telemetry,
  Zustand, or local-storage state.

### Request/security policy

- accept each category and reject unknown/case-variant/free-text categories;
- require a non-whitespace message and test exact 1/4,000 boundaries;
- accept absent/empty/valid email and reject malformed, list, display-name,
  over-length, CRLF, and Unicode-control forms;
- reject unknown/excess keys, arrays, nested objects, primitives, and wrong
  field types;
- reject wrong/missing content type, malformed JSON/UTF-8, declared oversize,
  streamed oversize, and worst-case multibyte overflow before delivery;
- enforce matching Origin and Fetch Metadata before provider work;
- normalise line endings/NFC and reject NUL, controls, unpaired surrogates, and
  bidi overrides;
- filled honeypot returns the same public success as delivery but calls neither
  config nor provider;
- HTML/script-like message content reaches only the provider `text` property;
- fixed subject/header construction and validation make header injection
  impossible;
- fixed provider URL/recipient proves no SSRF/open-relay path; and
- client-side sources and built output contain no API key value or
  `NEXT_PUBLIC_RESEND*` pattern.

### Delivery and failure handling

- mock native `fetch`; automated tests must never call Resend or send email;
- success requires the expected provider status and yields only `{ ok: true }`;
- optional email adds validated `reply_to`; absent email omits it;
- provider non-2xx, thrown network error, abort/timeout, and unexpected body all
  become stable `send_failed` without provider content;
- missing/invalid each configuration variable returns `contact_unavailable`
  and performs zero network calls;
- no automatic retry occurs; and
- limiter/honeypot/validation failures invoke no delivery dependency.

### Verification commands for implementation

Use the project's current Windows-compatible commands during the later change:

1. focused `node --test` for the four new contact suites and
   `tests/appInfoUiContract.test.mjs`;
2. `node --test "tests/*.test.mjs"` for the full suite;
3. focused `npx eslint` over modified source/tests;
4. `npm.cmd run build`;
5. `git diff --check`; and
6. source/bundle searches for `NEXT_PUBLIC_RESEND`, provider secrets, unexpected
   contact payload fields, HTML email construction, and unrelated app-state
   imports.

The current `npm run lint` script calls removed `next lint` behaviour under the
installed Next version, so use focused `npx eslint` unless that unrelated script
is separately corrected. Do not correct it as part of this feature.

## Release and configuration plan

1. Implement C1 on the feature branch with mock delivery only; run focused and
   full policy/handler tests.
2. Implement C2; run UI contracts and local browser smoke against injected/mock
   success, validation, 429, 502, and 503 outcomes. Load a GMI/SOSI/KOF file
   before submitting and inspect the network JSON to prove no file/application
   state is attached.
3. Complete C3 provider adapter tests with mocked `fetch` before any real
   credentials are configured.
4. Outside source control, create/verify a dedicated sending subdomain where
   practical, create a send-only domain-scoped Resend key, set the three
   server-only variables separately for the intended Vercel environment, and
   confirm the recipient/sender values are single mailboxes.
5. Check the actual Vercel plan. Configure a path-specific WAF rate limit if
   available; otherwise explicitly accept and monitor the documented
   process-local residual risk for v1.
6. Deploy only to an authorised preview environment. Confirm the key and
   addresses are absent from client JS, page source, responses, and logs.
7. Perform one controlled real-email smoke: valid delivery, correct From/To,
   optional Reply-To, Norwegian text, plain-text rendering, app version, and no
   file/browser metadata. Do not put real sensitive data in the smoke message.
8. Review Resend dashboard retention/tracking settings and mailbox retention.
   Open/click tracking is unnecessary for feedback and should remain off.
9. Run a Sol security/privacy review focused on the HIGH findings, the built
   client boundary, rate-limit residual risk, headers, logs, and the controlled
   message actually received.
10. Obtain explicit user approval before any merge or production deployment.

No provider/domain/env/Vercel configuration change, real email, commit, push,
merge, or deploy belongs to this planning task.

## Recommended implementation slices

### C1 — Server/request-policy foundation

- add the exact request/header/body/Unicode policy;
- add bounded body reading, sanitised response mapping, and the injected
  handler;
- add the bounded process-local burst limiter;
- add policy/handler/limiter tests with a fake delivery dependency; and
- prove excess fields and all file/application data categories are rejected.

Exit criterion: no provider dependency/configuration is needed, and all server
policy/security tests pass.

### C2 — Kontakt UI and privacy disclosure

- replace the placeholder with the three-field form and hidden honeypot;
- integrate loading, success, validation, rate-limit, temporary, and unavailable
  states;
- add accessibility semantics and preserve modal keyboard/focus behaviour;
- add/update source-contract tests and the transparency copy; and
- perform a local browser payload/focus/narrow-screen smoke with mocked routes.

Exit criterion: the browser sends only category/message/optional email/empty
honeypot, users can understand the app-version/provider disclosure, and no
loaded app state is reachable from the component.

### C3 — Resend adapter, controlled smoke, and security review

- add the native-fetch Resend adapter and missing-config behaviour;
- document variable names and operator steps without values;
- test all provider calls with mocked fetch, then run the full verification
  suite/build;
- configure domain/key/env only through authorised external controls;
- conduct one controlled real-email preview smoke; and
- complete Sol review and obtain explicit merge/deploy approval.

Exit criterion: send-only/domain-scoped secret, verified sender, correct
plain-text headers/body, understood provider/mailbox retention, acceptable
rate-limit posture, clean built client, and explicit release approval.

## Explicit non-goals

- support tickets, case IDs, status workflows, SLAs, accounts, authentication;
- CRM, discussion/forum features, comments visible to other users;
- database/contact-message storage, searchable feedback archive, analytics on
  message content;
- attachments, screenshots, GMI/SOSI/KOF uploads, file metadata, validation
  exports, project/municipality/organisation/phone fields;
- automatic browser, page, local-storage, map, WMS, file, or validation context;
- arbitrary recipients, CC/BCC, templates, HTML email, inbound email, webhooks,
  open/click tracking, or marketing email;
- CAPTCHA/Turnstile or a new durable rate-limit datastore in v1;
- a new icon library, form framework, validation package, email SDK, or test
  framework; and
- production configuration, real delivery, Git history changes, merge, or
  deployment in this planning task.

## Risks and decisions requiring release confirmation

1. **Highest residual risk: distributed spam/flooding.** The proposed in-memory
   limiter is not durable on Vercel. Confirm WAF availability/price and the
   acceptable provider quota before public rollout; escalate based on measured
   abuse, not speculative infrastructure.
2. **Provider retention is real.** Resend currently advertises 30-day retention
   and message-content storage is disabled only through a paid,
   eligibility-limited option. The recipient mailbox can retain messages much
   longer. The disclosure and operational review must acknowledge both.
3. **Current branch is dirty.** Numerous pre-existing modified/untracked files
   were present before this report. Future implementation must isolate its diff
   and must not overwrite or clean those changes.
4. **Release catalog decision.** The current `1.1.0` entry is unreleased in the
   working tree (`releasedOn: null`). Product review should decide whether the
   contact form is included in that release note; the form itself must continue
   to import the canonical version.

## Audit constraints and outcome

This pass did not modify application code, tests, packages, lockfiles,
environment files, or deployment/provider configuration. It did not inspect
real secret values, install dependencies, send email, run a deployment, or
perform commit/push/merge/reset/revert/stash operations. The only intended file
created by this pass is this report.
