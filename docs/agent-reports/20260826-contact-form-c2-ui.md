# Contact Form C2 UI

Date: 2026-08-26  
Repository: `C:\GitHub\gmi-validering`  
Branch: `feature/app-info-version-changelog`

## UI Implemented

The Kontakt placeholder was replaced with an isolated `ContactForm` component
under the existing Kontakt hero. The component uses the existing AppInfo
editorial styling and modal scroll region without changing the modal shell,
tabs, hero geometry, or other tab content.

## Fields

- `Kategori`: required select with exactly Feil, Forslag, Kommentar, and Annet.
- `E-post`: optional `type="email"` field with `autoComplete="email"`.
- `Melding`: required labelled textarea with `maxLength={4000}` and a usable
  seven-row starting height.
- `website`: controlled off-screen honeypot with `tabIndex={-1}`,
  `aria-hidden="true"`, and `autoComplete="off"`.

No name, phone, project, municipality, organisation, attachment, screenshot,
file-upload, browser-context, or loaded-file fields were added.

## Payload Boundary

The browser constructs a fresh object containing only:

```json
{
  "category": "bug",
  "message": "...",
  "email": "",
  "website": ""
}
```

It sends this object with `POST /api/contact` as JSON. `ContactForm` imports no
store, parser, validation, coordinate, WMS, telemetry, localStorage, or
AppInfo-persistence state, and does not send the app version from the browser.

## Honeypot and States

The controlled honeypot is always included in the payload but occupies no
layout space and is excluded from meaningful keyboard/accessibility navigation.
The C1 server handles non-empty values as indistinguishable success without
delivery.

The component supports idle, submitting, success, validation error, rate
limited, temporary failure, and contact-unavailable states. Submission disables
the controls and button, exposes `aria-busy`, and prevents duplicate submits.
Validation focuses the first invalid field where practical. Failed requests
preserve category, message, and email. Success clears the form and shows a
concise thank-you state with an ordinary new-feedback button.

Endpoint error codes map to short Norwegian messages without exposing raw JSON,
HTTP internals, provider details, environment values, or exceptions.

## Accessibility

The form uses explicit labels, native required semantics, an email input,
descriptive help/error IDs, conditional `aria-invalid`, visible focus styles,
and persistent polite status regions. It does not rely on placeholders or
colour alone. The existing AppInfoModal focus trap, Escape handling, backdrop
close, tab switching, focus restoration, and scroll architecture were left
unchanged.

## Privacy Disclosure

The approved `Nysgjerrig eller bekymret?` text received the smallest required
addition: it explains that only form-entered text is sent, optional email is
included only when supplied, the server may add the app version, and no file,
coordinate, validation, or other application state is attached. No retention
promise was added; provider/mailbox retention remains a C3 concern.

The form note states that only the entered content and displayed app version
will be emailed when the contact form is activated, that email is optional, and
that no file or validation data is attached. Since C1 still injects an
unavailable delivery outcome, the live route currently presents the unavailable
state for normal submissions. No false successful-delivery behavior was added.

## Responsive Behavior

The category/email row uses a two-column layout from the existing `sm` width
and stacks on narrow screens. The message remains full width, controls wrap
with the status area, and the existing modal body owns vertical scrolling.

## Tests and Checks

- C1 contact suites plus AppInfo UI contract: 33 passed
- Full Node suite: 159 passed
- Focused ESLint over C1/C2 source and tests: passed with 0 errors
- `npm run build`: passed
- `git diff --check`: passed
- Manual browser smoke: not run in this environment; static contracts, handler
  behavior, and production build were verified instead.

## C3 Remaining

No Resend/provider adapter, real email configuration, environment variables,
provider retention implementation, WAF configuration, database, dependency,
real email, commit, push, merge, or deployment was added. C3 must add and test
the server-only provider adapter before any real delivery is enabled.
