# Contact Form C3 Text Delivery

Date: 2026-08-26

Branch: `feature/app-info-version-changelog`

## Scope

C3 implements the server-side text-only delivery boundary for the GMI Validator
Kontakt form.

This slice does not add screenshot attachments, multipart requests, image
processing, persistent contact storage, or production provider configuration.

## Architecture

The implemented flow is:

ContactForm
→ POST /api/contact
→ existing C1 request policy and rate limiting
→ contact handler
→ server-side sendContactEmail adapter
→ fixed Resend HTTPS endpoint

`src/app/api/contact/route.js` remains thin and injects the server-side delivery
adapter into the provider-independent contact handler.

The browser continues to submit only the existing JSON contact payload.

## Resend adapter

The provider adapter is implemented in:

`src/lib/contact/sendContactEmail.mjs`

It uses the runtime's native server-side `fetch` and the fixed endpoint:

`https://api.resend.com/emails`

No Resend SDK or new application dependency was added.

The adapter requires the following server-only configuration names:

- `RESEND_API_KEY`
- `CONTACT_TO_EMAIL`
- `CONTACT_FROM_EMAIL`

No real values were added to source control.

Configuration is validated lazily. Missing or invalid configuration results in
the existing `contact_unavailable` response and performs no provider request.

## Email construction

Contact messages are constructed as plain text.

The sender, recipient, subject and provider endpoint are server-controlled.

The optional user email is used only as Reply-To when supplied and validated. It
does not replace the configured From address.

The subject is derived from the validated category using fixed application
mappings.

The email body contains:

- category
- canonical application version
- normalized message

The application version comes from the canonical release catalogue and is not
trusted from browser input.

No HTML email path was added.

## Provider behaviour

The provider request uses:

- Bearer authorization from the server-only API key
- JSON content type
- a fixed application User-Agent
- an approximately eight-second abort timeout
- no automatic retry
- no redirect following

Only a successful provider 2xx response maps to the internal `sent` outcome.

Provider non-2xx responses, network failures and timeout/abort failures map to
the sanitized `failed` outcome.

Provider response bodies and provider message IDs are not required or exposed.

## Privacy boundary

C3 may deliver only the validated contact information supplied through the
Kontakt form plus the server-owned application version.

It does not automatically attach or transmit:

- uploaded filenames
- GMI/SOSI/KOF file content
- parsed object data
- coordinates or bounding boxes
- validation results
- inferred municipality
- WMS state
- browser or user-agent information
- localStorage
- application state
- screenshots or other attachments

No contact database, CRM record, object storage or other application-side
persistence was added.

The AppInfo transparency text now identifies Resend as the email-delivery
boundary and notes that the recipient mailbox may retain delivered messages.

Provider/account retention settings must still be confirmed during production
configuration.

## Security boundaries

The existing C1 protections remain in place:

- exact JSON field allowlist
- bounded 20 KiB request body
- same-origin checks
- strict Unicode and optional-email validation
- honeypot handling
- process-local burst limiting
- sanitized public responses
- no submitted-data logging

Rejected validation, honeypot and rate-limited requests do not invoke provider
delivery.

The browser does not receive provider credentials and does not call Resend
directly.

## Verification

Focused contact/provider tests passed.

Full Node test suite after the final UI-contract wording correction:

- tests: 168
- pass: 168
- fail: 0

Focused ESLint completed without errors.

Production build completed successfully and includes `/api/contact`.

`git diff --check` completed successfully apart from existing Windows LF/CRLF
informational warnings.

Source checks confirmed that:

- the Resend provider URL is referenced only by intended server/provider code and tests
- `RESEND_API_KEY` is not referenced by the client ContactForm
- there is no `NEXT_PUBLIC_RESEND*` configuration
- automated tests use mocked provider calls and send no real email

## Current local behaviour

No real Resend credentials or mailbox configuration were added during C3a.

Without valid server configuration, a normal local contact submission therefore
returns the existing friendly contact-unavailable state.

This is intentional.

## C3b remaining operator work

Before real delivery is enabled:

1. Create/select the recipient mailbox.
2. Select and verify the sending domain with Resend.
3. Create an appropriately restricted Resend API key.
4. Configure the three server-only environment variables outside source control.
5. Confirm provider retention/settings.
6. Perform one controlled text-only email smoke in an authorized preview
   environment.
7. Review From, To, Reply-To, subject, Norwegian text, app version and received
   payload.
8. Perform the planned focused security/privacy review before production
   deployment.

## Screenshot attachments

Screenshot support is explicitly deferred to C4.

The approved screenshot amendment recommends completing and proving the
text-only C3 path first before introducing multipart parsing, Sharp image
processing, metadata removal or Resend attachments.

## Outcome

C3a text-only provider integration is implemented and verified locally.

No real email was sent.

No provider/domain/environment configuration was performed.

No screenshot or attachment support was added.

No database or dependency change was required for C3.

No commit, push, merge or production deployment was performed as part of C3a.
