# Contact form screenshot-attachment amendment

Date: 2026-08-26

Repository: `C:\GitHub\gmi-validering`

Branch: `feature/app-info-version-changelog`

Scope: planning, security, and architecture review only

## Recommendation

Support optional screenshots, but implement them as **Option B: a separate C4
after text-only C3 is complete, smoke-tested, and security-reviewed**.

Screenshots have clear diagnostic value for bug reports, so permanent deferral
is not necessary. They should not be folded into C3 because C1 and C2 are
already implemented around a deliberately small 20 KiB JSON contract and C3
still has to establish the first real provider boundary. Attachments introduce
a different transport, untrusted binary parsing, native image-processing code,
larger memory and abuse exposure, metadata/privacy handling, and a larger test
matrix. Isolating those changes in C4 makes failures and review findings easier
to attribute and lets the text-only email path prove itself first.

Recommended C4 scope:

- screenshots only when category is `Feil` (`bug`);
- optional and explicitly selected by the user;
- PNG, JPEG, and WebP input only;
- maximum **2 screenshots**;
- maximum **2 MiB per input or processed screenshot**;
- maximum **3 MiB combined input or processed screenshot bytes**;
- maximum **8,192 pixels on either axis and 12,000,000 pixels total per image**;
- single-frame/static images only;
- bounded `multipart/form-data` to the existing same-origin `/api/contact`
  route only when screenshots are present;
- existing 20 KiB JSON path retained unchanged for text-only submissions;
- full server-side decode and re-encode with an explicitly declared `sharp`
  dependency before delivery; and
- no application-side persistent storage.

This is still a screenshot aid, not general-purpose upload. It must never accept
GMI, SOSI, KOF, PDF, Office documents, archives, executables, SVG, GIF, AVIF,
HEIC/HEIF, TIFF, or arbitrary binary data.

## Decision summary: why C4, not C3 or deferral

| Option | Assessment |
| --- | --- |
| A — expand C3 now | Not recommended. It combines the first real Resend integration with a transport migration, native decoder, metadata policy, and attachment abuse surface. C1/C2's proven text-only boundary would be harder to review and diagnose. |
| **B — text-only C3, then C4** | **Recommended.** It delivers the basic product goal first, gives the provider adapter and retention disclosure a small controlled smoke, then adds screenshot value as an independently testable security slice. Rework is limited because C1's field validation, rate limiting, response mapping, and delivery abstraction remain reusable. |
| C — defer entirely | Too conservative. Explicit screenshots are useful for visual/UI/map bugs, and the risk can be bounded without storage, CAPTCHA, or a second upload service if files are small and re-encoded. |

C3 should remain text-only. It should not add unused attachment fields, parse
multipart, import `sharp`, or send attachment-shaped provider options. It should
keep the email-construction/delivery adapter narrow and dependency-injected so
C4 can extend its input without changing the route's provider-secret boundary.

## Current C1/C2 baseline

The working tree was audited as implemented, not from the original plan alone:

- `src/app/api/contact/route.js` is a thin Node.js App Router route and still
  injects the C1 unavailable delivery stub.
- `src/lib/contact/contactRequestPolicy.mjs` accepts only `category`, `message`,
  `email`, and `website`, rejects unknown/duplicate keys, requires
  `application/json`, and caps the request at 20 KiB.
- `src/lib/contact/contactHandler.mjs` checks origin/rate before bounded stream
  reading, handles the honeypot before delivery, and passes only normalized text
  fields to the injected delivery dependency.
- `src/lib/contact/contactRateLimit.mjs` provides a process-local five-per-user
  and 100-per-process ten-minute burst guard with opaque requester keys.
- `src/components/ContactForm.js` builds a fresh four-field JSON object and
  imports no store, parser, validation result, WMS state, telemetry, local
  storage, or loaded-file data.
- Current UI contracts explicitly assert that file/attachment/screenshot input
  is absent.
- C1/C2 reports record 159 passing Node tests and a successful production build;
  those results were not rerun in this planning-only pass.
- `sharp@0.34.5` is currently installed only as a transitive dependency of the
  installed Next.js version. It is not declared by this application.

The screenshot work must extend these boundaries rather than replace them.

## Recommended transport architecture

```text
Text-only submission
  ContactForm
    -> JSON, <= 20 KiB
    -> POST /api/contact
    -> existing C1 JSON validation
    -> text-only C3 Resend adapter

Bug report with screenshots
  ContactForm (explicit File selection)
    -> multipart/form-data, <= 3.25 MiB body
    -> same-origin POST /api/contact
    -> existing origin + base rate checks
    -> bounded byte read before multipart parsing
    -> exact scalar/file-part allowlist
    -> stricter attachment rate check
    -> signature + MIME + extension checks
    -> sharp decode, dimension check, re-encode, metadata strip
    -> validated attachment objects
    -> C3 Resend adapter extended in C4
    -> recipient mailbox
```

The provider key remains server-only. The browser must never call Resend
directly, receive an API key, choose the provider URL, choose the recipient or
sender, or provide arbitrary provider/MIME/header options.

### Why multipart/form-data

Use browser-native `FormData` when one or more screenshots are selected. Do not
manually set the request `Content-Type`; the browser must generate the multipart
boundary. Send repeated parts named `screenshot` and the existing scalar field
names.

Multipart is the simplest secure fit because it transfers file bytes without
browser-side Base64 expansion. Next.js Route Handlers use standard Web Request
APIs and officially support `request.formData()`.

Do not use JSON plus Base64 from the browser. Base64 adds roughly one third to
the payload, creates extra browser/server string copies, makes the Vercel body
ceiling easier to hit, and weakens the clean distinction between scalar JSON
and validated file parts.

Do not use a separate upload followed by an email request. That requires a
temporary object identifier, lifecycle/cleanup logic, authorization against
orphan/replayed uploads, and usually persistent object storage. The proposed
files fit safely below the function request limit, so the complexity is not
justified.

Do not use direct browser-to-provider upload. Resend's send endpoint is
privileged and would expose or proxy-use the provider credential, recipient,
sender, and send quota. A pre-signed object upload would add storage and still
require the same-origin server to validate and send the email.

## Multipart contract and size limits

### Content types accepted by `/api/contact`

1. `application/json`: current C1 path, current 20 KiB maximum, no attachment
   field accepted.
2. `multipart/form-data; boundary=...`: C4 path, hard maximum **3.25 MiB** for
   the complete encoded request body.

Reject all other media types. Require a syntactically valid, bounded multipart
boundary. Preserve the current exact Origin and `Sec-Fetch-Site` checks.

### Multipart field contract

| Part name | Count | Type/rule |
| --- | --- | --- |
| `category` | exactly 1 | String; must normalize through the existing category policy and must be `bug` when screenshots exist |
| `message` | exactly 1 | String; current 1-4,000-code-point policy |
| `email` | 0 or 1 | String; current optional single-mailbox policy |
| `website` | 0 or 1 | String; current honeypot policy |
| `screenshot` | 1 or 2 | Web `File`; each subject to all C4 image controls |

Reject unknown part names, duplicate scalar parts, more than two screenshot
parts, text values pretending to be files, files under scalar names, nested
field conventions, and multipart submissions with no screenshot. Text-only
clients already have the JSON path.

The 3.25 MiB request limit leaves meaningful margin below Vercel's current 4.5
MB function payload ceiling after multipart boundaries, scalar fields, and
headers. Within it:

- each original file must be at most 2 MiB;
- original file bytes combined must be at most 3 MiB;
- each re-encoded output must also be at most 2 MiB; and
- re-encoded output bytes combined must also be at most 3 MiB.

Reject a request if either the input or processed-output limit is exceeded. A
valid but poorly compressing image can therefore be rejected after processing;
the UI should explain that it must be reduced or sent without the screenshot.

### Bounded parsing

Do not call `request.formData()` directly on an unbounded/chunked request after
checking only `Content-Length`. Generalize C1's streamed body reader to return a
bounded `Uint8Array` with a caller-supplied maximum:

1. reject a declared body above the applicable maximum before reading;
2. stream and cancel immediately if actual bytes exceed it, including when
   `Content-Length` is absent or false;
3. create a new standard `Request` (or equivalent Web API object) over those
   bounded bytes with the original multipart content type; and
4. call `.formData()` on that bounded object.

This approach uses the platform parser without adding a multipart package while
retaining C1's actual streamed-byte enforcement. It temporarily holds the
bounded request in memory more than once, which is acceptable at 3.25 MiB and
must be included in memory tests/review.

## Resend constraints and adapter design

Official Resend documentation reviewed on 2026-08-26 establishes that:

- the send-email REST API supports an `attachments` array;
- local attachment data is supplied as Base64 `content` plus `filename`;
- remote `path` attachments also exist, but are not appropriate here because
  there is no object store and accepting/providing URLs would add SSRF and
  persistence concerns;
- an email may be at most **40 MB including attachments after Base64 encoding**;
- attachment emails are not supported by Resend's batch endpoint;
- Resend permits general file types except a documented blocked-extension list,
  but that permissive provider rule must not expand this app's image-only
  allowlist;
- sent attachments can be viewed/downloaded through the Resend dashboard/API;
- the free plan currently counts the resulting message as an ordinary sent
  email toward 100/day and 3,000/month, and the default team API rate is five
  requests/second; and
- no separate attachment-byte charge is documented. This should be rechecked
  before C4 rollout rather than treated as a permanent pricing guarantee.

At the proposed 3 MiB processed total, Base64 attachment content is at most
about 4 MiB before the small surrounding JSON/message overhead, far below
Resend's provider limit. The **application limits are intentionally much
stricter than the 40 MB provider limit** because Vercel, memory, abuse, mailbox,
and privacy constraints govern this feature.

Resend's public send attachment contract documents `content`, `filename`, and
optional remote `path`; it does not document a caller-controlled attachment
content-type field. Generate a filename extension that exactly matches the
validated/re-encoded format so Resend/mail clients can construct a consistent
MIME representation. Do not pass `path`, `content_id`, inline disposition, or
custom headers.

Recommended internal provider-adapter input after image processing:

```text
{
  category,
  categoryLabel,
  message,
  email,
  attachments: [
    {
      bytes: Uint8Array,
      format: "png" | "jpeg" | "webp",
      contentType: "image/png" | "image/jpeg" | "image/webp",
      filename: "skjermbilde-1.png"
    }
  ]
}
```

The adapter must accept attachment objects only from the validated server image
processor. It converts `bytes` to Base64 and sends only `{ content, filename }`
to Resend. It must reconstruct the provider payload rather than spread internal
objects or client data. The plain-text message body, fixed From/To/subject,
optional validated Reply-To, fixed provider URL, 8-second outbound timeout, no
automatic retry, and sanitized response behavior from C3 remain unchanged.

Official provider sources:

- [Resend attachments guide](https://resend.com/docs/dashboard/emails/attachments)
- [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend unsupported attachment extensions](https://resend.com/docs/knowledge-base/what-attachment-types-are-not-supported)
- [Resend account quotas and rate limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits)
- [Resend sent-attachment retrieval](https://resend.com/docs/api-reference/emails/retrieve-email-attachment)
- [Resend pricing/retention](https://resend.com/pricing)

## Vercel and Next.js constraints

Current official Vercel documentation states:

- a Vercel Function request or response payload is limited to 4.5 MB;
- oversized inbound payloads fail at the platform with 413 before or outside
  normal application behavior;
- current default function memory is 2 GB, with plan-dependent maxima; and
- CPU and provisioned memory time affect function cost.

Current Next.js Route Handler documentation confirms that App Router routes use
Web Request/Response APIs and may read `request.formData()`. No Pages Router
body-parser or third-party multipart parser is required.

No separate, smaller outbound `fetch` body limit was found in the reviewed
Vercel Function documentation. That is not a reason to approach Resend's 40 MB
ceiling: Base64, JSON construction, decoder buffers, and network transmission
all consume memory/time. The proposed approximately 4 MiB provider JSON is the
conservative design target and must be verified in preview.

Image processing should be sequential, never `Promise.all` across attachments,
to cap peak native memory. Export a bounded route `maxDuration` appropriate to
the verified project plan (proposed 20 seconds) and apply an image-processing
timeout (proposed 3 seconds per image) plus the existing 8-second provider
timeout. Recheck the actual Vercel plan/Fluid Compute status during C4; do not
rely on a long platform maximum as permission for expensive inputs.

Official platform/framework sources:

- [Vercel Function limits](https://vercel.com/docs/functions/limitations)
- [Vercel 4.5 MB upload guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)
- [Next.js Route Handler `formData()`](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Vercel function memory/CPU](https://vercel.com/docs/functions/configuring-functions/memory)

## Image allowlist and validation pipeline

### Accepted formats

Accept only:

| Input | Accepted extensions | Declared browser MIME | Decoded format | Output |
| --- | --- | --- | --- | --- |
| PNG | `.png` | `image/png` | `png` | re-encoded PNG |
| JPEG | `.jpg`, `.jpeg` | `image/jpeg` | `jpeg` | re-encoded JPEG |
| WebP | `.webp` | `image/webp` | `webp` | re-encoded WebP |

Require extension, browser-declared MIME, magic signature, and decoder-reported
format to agree (mapping `.jpg` and `.jpeg` to the same JPEG format). `accept`
on the browser file input is only a chooser hint; the server is authoritative.
Reject missing/ambiguous MIME and format mismatches rather than guessing.

Do not accept SVG even though it is an image media type: it is active/textual
content and expands the parser/reference threat surface. Do not accept animated
formats. For WebP, inspect metadata and require exactly one page/frame.

### Validation and processing order

For each screenshot, sequentially:

1. enforce file count, per-file bytes, combined input bytes, File-part type,
   declared MIME, and original filename syntax/length;
2. reject original filenames over 128 code points or containing path separators,
   drive/colon syntax, NUL/control/bidi characters, dot-segment/path patterns,
   or a non-allowlisted extension;
3. check the byte signature before invoking the decoder:
   PNG 8-byte signature, JPEG SOI/marker prefix, or RIFF/WEBP signature;
4. require signature, MIME, and extension agreement;
5. construct Sharp with untrusted-input safety enabled, for example
   `failOn: 'warning'`, `limitInputPixels: 12_000_000`,
   `unlimited: false`, `pages: 1`, and `autoOrient: true`;
6. read metadata and require decoded format in the allowlist, width/height from
   1 through 8,192, width x height no more than 12,000,000, and exactly one
   page/frame;
7. fully decode and re-encode to the same validated format without any metadata
   preservation methods;
8. enforce the per-file and combined processed-output byte limits; and
9. assign a server-generated filename based only on order and output format,
   such as `skjermbilde-1.png` and `skjermbilde-2.jpg`.

Do not forward the original bytes. Full re-encoding verifies that the image is
decodable, rejects malformed/truncated data at a strict warning level, strips
trailing/polyglot payloads from the delivered artifact, and normalizes the MIME
container. Magic bytes alone cannot prove a file is safe or well-formed.

Header metadata can lie, so dimension checks plus Sharp's `limitInputPixels`
are defense in depth, not a complete proof against every decoder flaw. Keep
Sharp/libvips current, pin/review lockfile changes, run malformed fixture tests,
and include the native dependency in Sol review.

### Filename policy

The original filename is shown only in the browser's local selected-file list.
It is transiently visible to the multipart parser but must not be logged,
emailed, persisted, included in the text body, or passed to Resend. Server-owned
generic filenames eliminate path traversal, control/header injection, duplicate
name collisions, and accidental disclosure through descriptive filenames.

Duplicate original names are allowed as separate explicitly selected files if
their contents otherwise validate; generated provider filenames remain unique.

## Re-encoding and metadata decision

Server-side decode and re-encode is **required for C4**, not optional hardening.

The alternative—signature/MIME checking and forwarding original bytes—would
leave EXIF/GPS/XMP/IPTC/ICC/comments and possible trailing/polyglot content in
the email. Screenshots often lack camera metadata, but the file chooser cannot
guarantee that the user selected a screenshot rather than an ordinary phone
photo. Without re-encoding, a selected photo's GPS location, capture time,
device/camera details, thumbnails, or authoring metadata could reach Resend and
the recipient mailbox even when those values are not visibly present in the
image.

Sharp officially documents that output strips metadata by default unless a
metadata-preservation method is called. C4 must not call `keepMetadata`,
`withMetadata`, `keepExif`, `keepXmp`, or related preservation APIs. Use
`autoOrient` so pixels are rotated correctly before the orientation tag is
removed. The result strips metadata but cannot remove sensitive information
that is visible in the pixels.

Declare `sharp` as a direct application dependency in C4 and update both
`package.json` and `package-lock.json` through the normal authorized dependency
workflow. Do not import Next.js's undeclared transitive copy: it can disappear
or change incompatibly, its version is not owned by this feature, and package
managers do not guarantee transitive imports as an application contract. At C4
implementation time, choose and lock a current version compatible with the
project's Node/Vercel runtime and review its security/release notes.

Official Sharp sources:

- [Sharp constructor safety limits](https://sharp.pixelplumbing.com/api-constructor/)
- [Sharp metadata/dimension inspection](https://sharp.pixelplumbing.com/api-input/)
- [Sharp output and default metadata stripping](https://sharp.pixelplumbing.com/api-output/)
- [Sharp installation/platform requirements](https://sharp.pixelplumbing.com/install/)

## Privacy and retention amendment

### Data path

| Boundary | Screenshot behavior |
| --- | --- |
| Browser | User explicitly selects File objects; names/sizes and File references remain in component memory until removed, successful submission, category change, modal unmount, or page unload. No automatic capture, preview URL, localStorage, or app-state collection. |
| Next.js/Vercel function | Multipart bytes, parsed Files, decoded pixels, and re-encoded buffers exist transiently in function/native memory. Nothing is written to filesystem, database, logs, or object storage. |
| Resend | Receives Base64 processed image bytes and generic filenames with the email. Resend's sent-email dashboard/API supports attachment download and current plans advertise 30-day data retention. |
| Recipient mailbox | Receives and retains the processed screenshots under the mailbox owner's policies, backups, forwarding, and deletion practices. |

Do not add S3, Supabase Storage, Vercel Blob, filesystem storage, a database, or
an attachment table. The entire request-to-email flow is transient in the app.
The provider and mailbox are explicit storage/retention boundaries; “no app
storage” must never be described as “the screenshots are not stored anywhere.”

Screenshots are not anonymous. Re-encoding strips hidden metadata, including
EXIF/GPS, but cannot identify or redact names, addresses, project details,
coordinates, map labels, filenames visible inside a screenshot, validation
results, notifications, or other information rendered in its pixels. The user
is responsible for reviewing the visible image before selecting it.

### Minimal copy amendment

The existing approved `Nysgjerrig eller bekymret?` paragraph should receive a
small targeted amendment, not a rewrite. Replace the absolute statement that no
file is attached with the distinction between automatic state and explicit
screenshots. Conceptually:

> Ingen innmålingsfil, koordinater, valideringsresultater eller annen fil- og
> applikasjonstilstand legges ved automatisk. Hvis du selv velger skjermbilder,
> behandles de for å fjerne metadata og sendes via e-postleverandøren til
> mottakerens postkasse. Skjermbilder kan likevel inneholde informasjon som er
> synlig i selve bildet.

Near the file input, use an even shorter disclosure:

> Skjermbilder er valgfrie og sendes bare når du velger dem selv. Metadata
> fjernes før sending, men kontroller at bildet ikke viser opplysninger du ikke
> ønsker å dele. Bildet sendes via Resend til mottakerens e-post.

The final wording should be reviewed alongside C3's provider/retention copy.
Do not claim anonymity or promise deletion from Resend/the mailbox.

## Abuse controls

Attachments require stricter controls than text-only submissions:

1. retain the current base limiter for every request;
2. classify `multipart/form-data` as attachment-capable from its content type
   and apply an additional process-local attachment limiter before reading the
   body: proposed **2 attempts per requester and 20 total per process per ten
   minutes**;
3. retain the 3.25 MiB whole-body, 2 MiB per-file, 3 MiB combined, two-file,
   12-megapixel, 8,192-axis, one-frame, and processing-time limits;
4. count a multipart attempt even if parsing/image validation later fails so an
   attacker cannot decode malformed images without consuming a bucket;
5. inspect the honeypot before any Sharp decode/re-encode or provider call; a
   honeypot request still consumes the network/body and rate budget but returns
   indistinguishable success;
6. process images sequentially and stop at the first failure;
7. retain Resend quota/rate monitoring and the planned path-specific Vercel WAF
   review; and
8. use fixed recipients/options and no remote attachment URL.

The base and attachment limiters should both use the existing ephemeral opaque
requester-key design. Do not persist IPs or byte totals. Process-local limits
still reset on cold start and are not deployment-wide; distributed abuse remains
a material residual risk. If the Vercel plan supports it, configure a WAF limit
for `/api/contact` before C4 production rollout. Do not add a database,
Supabase/Redis/KV, object storage, or CAPTCHA for this small slice unless actual
abuse demonstrates that platform controls are insufficient.

No durable cumulative-byte accounting is recommended. It would require durable
identity/storage and expand privacy scope. The strict per-request byte/pixel
limits plus the lower attachment attempt budget are proportionate for C4.

## Contact UI extension

Show the screenshot control only when `Kategori` is `Feil`. If a user selects
screenshots and changes category, clear the selection and announce that change.
The server independently enforces the bug-only rule.

Minimal UI beneath the message field:

```text
Skjermbilder (valgfritt)
[Velg bilder]
PNG, JPEG eller WebP. Maks 2 bilder, 2 MiB per bilde og 3 MiB totalt.

skjermbilde.png — 842 KiB   [Fjern]
kartfeil.webp — 1.1 MiB     [Fjern]
```

Requirements:

- real `<input type="file" multiple>` with
  `accept="image/png,image/jpeg,image/webp"`;
- no `capture` attribute, screenshot API, clipboard read, drag/drop gallery,
  thumbnail/object-URL preview, editor, cropper, or media manager;
- controlled selected-File array separate from the scalar form object;
- client-side count/size/type/extension checks for immediate feedback, with the
  server remaining authoritative;
- show original filename and human-readable size locally only;
- an ordinary text `Fjern` button for each file, with an accessible label such
  as `Fjern skjermbilde <name>`; no icon is required;
- allow reselecting a removed/same file by resetting the file input value;
- disable file input/remove buttons during submission;
- clear File references after success/new-feedback/category change/unmount;
- attach scalar values and repeated `screenshot` parts to new `FormData` only
  when screenshots are selected; retain current fresh-object JSON builder for
  text-only sends; and
- update `request_too_large`/validation messages so they distinguish message
  length from screenshot size/count/format without exposing parser internals.

Accessibility:

- explicit visible label and concise allowed-format/limit help associated with
  the file input;
- keyboard-operable native picker and remove controls;
- `aria-invalid` and `aria-describedby` for attachment validation;
- polite status announcement when files are added, removed, rejected, or
  cleared; and
- preserved modal focus trap, focus visibility, success/error states, and
  narrow-screen scrolling.

If an icon is later considered, use only a verified
`@phosphor-icons/react` export and extend the existing icon contract. A text-only
control is preferred.

## Migration from C1 without architectural replacement

### Shared unchanged behavior

Both JSON and multipart paths must share:

- Origin and `Sec-Fetch-Site` containment;
- category/message/email/website validation and normalization;
- honeypot semantics;
- opaque requester identity and base rate limiting;
- category labels;
- response headers/status/code mapping;
- fixed delivery outcomes (`sent`, `unavailable`, `failed`);
- no logging of submitted data; and
- provider-independent dependency injection.

### Required module evolution

`contactRequestPolicy.mjs`:

- keep `CONTACT_MAX_BODY_BYTES = 20 KiB` for JSON;
- factor scalar validation into a transport-neutral
  `validateContactFields(...)` function used by both JSON and multipart;
- preserve exact JSON key/duplicate-key behavior;
- recognize only JSON or valid multipart media types and return the applicable
  body limit; and
- add stable attachment validation codes only if the UI genuinely needs to
  distinguish format/count/size. Do not leak decoder details.

`contactHandler.mjs`:

- generalize the bounded reader to bytes plus a maximum;
- keep the fatal UTF-8 JSON decoder/parser path;
- add bounded standard FormData parsing and exact multipart part extraction;
- apply base and attachment rate checks before body reading;
- evaluate the honeypot before calling the image processor;
- inject an `processAttachments` dependency and call it only for legitimate
  multipart bug reports; and
- extend delivery input with only validated processed attachments.

`contactRateLimit.mjs`:

- retain existing text constants/behavior/tests;
- add a distinct attachment-capable bucket/limits or a typed `check` operation;
- keep maps bounded, expirations deterministic, and requester keys opaque; and
- ensure one multipart request consumes both base and attachment budgets.

`route.js`:

- keep Node.js/dynamic/no-store behavior;
- after C3, replace the existing real text delivery injection with the same
  adapter plus the C4 image processor;
- optionally export the reviewed bounded `maxDuration`; and
- never import image code into a client module.

`sendContactEmail.mjs` (created by C3):

- retain all C3 config/header/body/timeout/error controls;
- in C4, accept only processor-produced attachment objects;
- Base64-encode processed bytes and construct a minimal Resend attachment array;
- enforce provider-payload attachment count/byte limits again at this final
  boundary; and
- never accept remote paths, content IDs, disposition, arbitrary content type,
  custom provider fields, original filenames, or recipient/sender changes.

The text-only JSON behavior and current C1 tests remain first-class regression
coverage. Multipart is an additive branch, not a replacement.

## Security threat model

Classification is inherent/pre-mitigation risk. Residual risk assumes the full
recommended C4 design.

| Threat | Class | Mitigation and residual risk |
| --- | --- | --- |
| Arbitrary file upload/open relay | **HIGH** | Exact multipart names/counts; PNG/JPEG/WebP agreement; bug-only; full decode/re-encode; fixed Resend fields. Residual low if no raw/provider spread path exists. |
| Malicious/polyglot image | **HIGH** | Signature + MIME + extension + decoder agreement; strict full decode; deliver only newly encoded bytes. Decoder bugs remain possible; trailing/polyglot payload should not survive output. |
| Malformed image parser exploit | **HIGH** | Current explicit Sharp/libvips dependency, `failOn: warning`, small inputs, one frame, sequential work, timeouts, dependency review. Native decoder compromise remains a low-likelihood/high-impact residual. |
| Oversized upload | **HIGH** | 3.25 MiB bounded streamed request, early declared-size rejection, 2 MiB/file, 3 MiB combined, Vercel 4.5 MB platform ceiling. Residual platform bandwidth before rejection remains. |
| Decompression/pixel bomb | **HIGH** | 12 MP and 8,192-axis limits, Sharp `limitInputPixels`, `unlimited: false`, one frame, output-size/time limits. Residual decoder/header edge cases remain. |
| Spam/quota exhaustion | **HIGH** | Base plus stricter attachment limiter, honeypot, WAF review, provider quotas, two-file/byte caps. Distributed serverless evasion remains material. |
| Memory/CPU exhaustion | **HIGH** | Small body, pixel limits, sequential processing, process/global attempt cap, timeouts. Multiple function instances can still incur cost. |
| Provider abuse | **HIGH** | Server-only send key, fixed endpoint/recipient/sender/options, no browser Resend call/path URL, final adapter assertions. Secret compromise remains a separate C3 risk. |
| Accidental sensitive screenshot | **HIGH** | Explicit selection, no capture/preview automation, clear warning, metadata strip, generic names. **Visible sensitive pixels cannot be automatically removed; this is the highest privacy residual.** |
| Metadata/EXIF/GPS leakage | **HIGH** | Full re-encode with default metadata removal, no keep/with metadata APIs, metadata fixtures. Residual visible location/text in pixels remains. |
| Filename/path/header injection | **MEDIUM** | Reject suspicious original names, never forward them, generate bounded ASCII provider names, no custom headers. Residual low. |
| Attachment persistence | **MEDIUM** | No app/object storage; explicit Resend 30-day/current provider and mailbox disclosure. Provider/mailbox retention is intentional residual, not eliminated. |
| Response/error leakage | **MEDIUM** | Stable existing codes, no filenames/content/parser/provider errors/stacks. Residual low. |
| Image content rendered in app | **LOW** | Do not preview/render selected bytes or use object URLs; only local filename/size list. Email client handling is outside the app boundary. |

The highest technical risk is exposing a public native image-decoder path to
crafted inputs and resource abuse. The highest privacy residual is a user
explicitly selecting an image whose visible pixels contain sensitive
information; metadata stripping cannot solve that.

## Test plan

Automated tests must use injected/mocked delivery and fetch. They must never
call Resend, send email, write object storage, or use real sensitive screenshots.

### Transport and shared policy

- current text-only JSON requests remain accepted at 20 KiB and reject an
  `attachments`/`screenshot` JSON key;
- multipart content type with a valid boundary is accepted; malformed/missing
  boundary and all other types are rejected;
- multipart actual stream and declared size are bounded at 3.25 MiB;
- unknown parts, duplicate scalar parts, zero screenshot parts, non-File
  screenshot parts, and files in scalar fields are rejected;
- scalar fields use the exact current category/message/email/honeypot
  normalization and error mapping;
- screenshots on a non-`bug` category are rejected;
- attachment omitted follows the unchanged JSON path and delivery interface;
  and
- filled honeypot with attachment returns indistinguishable success without
  Sharp or delivery calls.

### Image validation/processing

- valid minimal PNG, JPEG, and static WebP fixtures succeed;
- disallowed MIME (including SVG/PDF/octet-stream) fails;
- allowed extension with wrong MIME, correct MIME with wrong extension, and
  signature/decoder mismatches fail;
- bad magic bytes and truncated/malformed images fail;
- polyglot/trailing bytes do not appear in the re-encoded output;
- more than two screenshots fails;
- exact per-file and combined input/output boundaries pass/fail correctly;
- excessive width, height, pixel count, and multi-frame WebP fail before
  delivery;
- decompression-bomb-style header fixture fails through pixel limits;
- EXIF GPS/device/orientation, XMP, IPTC, ICC, PNG comments, and trailing data
  are absent from processed output, while orientation is visually normalized;
- path separators, drive syntax, control/bidi characters, overlong filenames,
  and disallowed extensions fail;
- duplicate original names produce distinct generic output names;
- output filenames/content types/extensions exactly match re-encoded format;
- processor handles images sequentially and respects timeout/error sanitization;
  and
- raw original bytes are never passed to delivery.

Use tiny deterministic, non-sensitive fixtures under a dedicated test fixture
directory, including metadata-bearing and corrupt samples. Record how fixtures
were generated; never use user screenshots or project/file data.

### Rate/abuse behavior

- multipart consumes both base and attachment buckets;
- proposed two/requester and 20/global attachment thresholds, expiry,
  Retry-After, pruning, and opaque keys are deterministic;
- rejected/malformed/honeypot multipart attempts consume the intended budgets;
- attachment rate rejection happens before request-body reading and Sharp work;
- total byte limits prevent processing/provider calls; and
- no IP, opaque key, filename, MIME, size, message, or image data is logged.

### Provider adapter

- C3 text-only adapter remains unchanged when `attachments` is absent;
- only processed server objects can reach attachment mapping;
- adapter sends Base64 `content` and generic `filename` only;
- no `path`, `content_id`, disposition, arbitrary content type/header, original
  filename, or client provider field is sent;
- provider attachment count/processed-byte limits are rechecked;
- From/To/subject/Reply-To/plain text remain server controlled;
- Resend non-2xx, timeout, and network failure stay sanitized and are not
  retried; and
- tests mock native fetch and assert zero real network calls.

### UI/accessibility contracts and smoke

- control renders only for Feil and uses a labelled real multiple file input;
- accept list and visible count/size guidance are exact;
- selected local names/sizes render without image previews;
- each remove button is keyboard reachable and specifically labelled;
- client count/size/type/extension errors are announced and focusable;
- changing category clears/announces files;
- loading disables picker/removal/submit and success clears File references;
- text-only still sends JSON; screenshots send browser-generated multipart with
  only the allowlisted scalar/file parts;
- no store/parser/WMS/telemetry/localStorage/screenshot-capture imports exist;
  and
- manual preview smoke inspects the outgoing request and received processed
  image for metadata, filenames, MIME, dimensions, size, and retention boundary.

## Anticipated files changed in C4

| File | Expected C4 change |
| --- | --- |
| `package.json` | Declare Sharp as a direct runtime dependency after version/runtime review |
| `package-lock.json` | Lock the direct dependency and reviewed platform binaries |
| `src/app/api/contact/route.js` | Inject image processor, keep real C3 delivery adapter, and set reviewed bounded duration |
| `src/lib/contact/contactRequestPolicy.mjs` | Factor shared scalar validation and add transport/media/body-limit policy while preserving JSON behavior |
| `src/lib/contact/contactHandler.mjs` | Generalize bounded bytes, add bounded FormData branch, exact part parsing, honeypot-before-processing, and processed attachment delivery input |
| `src/lib/contact/contactRateLimit.mjs` | Add stricter attachment-capable attempt buckets without changing text limits |
| `src/lib/contact/contactImagePolicy.mjs` | New pure constants, signature/MIME/extension/filename/dimension/output-contract helpers |
| `src/lib/contact/processContactImages.mjs` | New server-only Sharp decode/re-encode/metadata-strip pipeline with sequential limits/timeouts |
| `src/lib/contact/sendContactEmail.mjs` | Extend the C3 adapter with final attachment assertions and Base64 `{ content, filename }` mapping |
| `src/components/ContactForm.js` | Add bug-only explicit file picker, local list/remove/errors/disclosure, JSON-or-FormData submission, and cleanup |
| `src/components/AppInfoModal.js` | Minimal targeted privacy-copy amendment for explicit screenshots/provider/mailbox; no broad rewrite |
| `tests/contactRequestPolicy.test.mjs` | Preserve JSON regressions and add content-type/shared-field cases |
| `tests/contactHandler.test.mjs` | Add multipart stream/part/honeypot/processor/delivery/failure behavior |
| `tests/contactRateLimit.test.mjs` | Add attachment-tier limits and early-rejection tests |
| `tests/contactImagePolicy.test.mjs` | New format/signature/filename/dimension/output policy tests |
| `tests/processContactImages.test.mjs` | New real-decoder fixture tests for valid/malformed/polyglot/bomb/metadata/re-encoding behavior |
| `tests/sendContactEmail.test.mjs` | Extend C3 mocked provider tests with attachment construction and negative cases |
| `tests/appInfoUiContract.test.mjs` | Replace no-file assertion with exact narrow screenshot/accessibility/payload/privacy contracts |
| `tests/fixtures/contact-images/*` | New tiny synthetic valid, metadata-bearing, malformed, and mismatch fixtures only |

`README.md` may receive a short user/operator limitation note if C3 already
uses it for contact configuration, but screenshots require no new environment
variable or provider configuration. No storage/configuration file is expected.

## Exact implementation sequence

### C3 — complete text-only delivery first

1. Implement the server-only Resend adapter exactly as planned for text fields.
2. Add missing-config, provider timeout/failure, fixed headers, Reply-To,
   retention, and mocked-fetch tests.
3. Keep `/api/contact` JSON-only and keep the C2 UI file-free.
4. Run focused/full tests, ESLint, build, diff/secret/bundle checks.
5. Configure provider/domain/env only through separately authorized external
   controls and perform one controlled text-only preview email.
6. Complete Sol C3 security/privacy review and obtain explicit approval before
   merge/deploy.

### C4.1 — attachment policy and decoder foundation

1. Confirm the deployed Vercel plan/body/memory/duration constraints and recheck
   Resend/Sharp official limits.
2. Add a reviewed compatible Sharp version as a direct dependency through an
   authorized dependency change.
3. Add synthetic fixtures plus pure image policy and processing modules/tests.
4. Prove format agreement, size/pixel/frame limits, full decode, re-encoding,
   metadata removal, generic filenames, sequential work, and sanitized failure.

### C4.2 — additive multipart server path

1. Factor C1 scalar validation without changing its JSON behavior.
2. Generalize bounded byte reading and add the exact bounded multipart branch.
3. Add attachment-tier rate limiting before body processing.
4. Apply honeypot before Sharp/provider work.
5. Expand handler delivery input only with processed objects and extend the C3
   adapter at its final boundary.
6. Run all JSON regression, multipart, image, rate, and provider mock tests.

### C4.3 — minimal UI/privacy extension and controlled validation

1. Add the bug-only native picker, local filename/size list, remove controls,
   client hints, cleanup, and JSON-or-multipart submission.
2. Apply the minimal form note and `Nysgjerrig eller bekymret?` amendment.
3. Extend accessibility/source contracts and run full tests, focused ESLint,
   production build, diff check, and bundle/secret/import searches.
4. Preview-smoke text-only and PNG/JPEG/WebP paths with synthetic images; inspect
   request size, processed metadata, provider attachment names, email rendering,
   logs, memory/duration, and error states.
5. Perform one controlled real attachment email only with explicit authorization
   after automated validation; then complete Sol review focused on native parsing,
   visible sensitive pixels, rate limits, retention, and provider boundary.
6. Obtain explicit user approval before any C4 merge/deploy.

## C4 acceptance gates

C4 is ready only if all of the following are true:

- C3 text-only delivery is already stable and retains full regression coverage;
- JSON remains 20 KiB and rejects attachment fields;
- multipart is bounded to 3.25 MiB before parsing and Vercel preview confirms it;
- only bug reports can include at most two PNG/JPEG/WebP screenshots;
- signature, MIME, extension, decoded format, frame, dimension, and byte limits
  agree and are server-enforced;
- only re-encoded metadata-free bytes with generic filenames reach Resend;
- visible sensitive-pixel and provider/mailbox retention disclosures are clear;
- process-local attachment limits and available Vercel WAF controls are reviewed;
- no raw files, filenames, screenshots, messages, emails, IPs, or provider bodies
  are logged or persisted by app code;
- no direct browser/provider call, remote path, object storage, database, CAPTCHA,
  or automatic capture exists;
- automated tests make no provider calls;
- Sharp is direct, current, locked, and compatible with Vercel; and
- Sol and the user explicitly approve release.

## Explicit non-goals

- general-purpose file upload or file manager;
- GMI/SOSI/KOF/PDF/Office/archive/executable/arbitrary attachments;
- automatic browser screenshot API, map capture, clipboard ingestion, camera
  capture, validation export, or loaded-file/app-state attachment;
- image preview gallery, drag/drop, cropper, annotation, editing, compression
  controls, or media library;
- attachment persistence, object storage, database records, attachment IDs, or
  later retrieval through the app;
- content moderation, OCR, automatic redaction, malware scanning service, or a
  promise that visible screenshot content is safe/anonymous;
- remote Resend attachment paths, inline/CID images, HTML message bodies, custom
  MIME/disposition/provider headers, arbitrary recipients, or batch sends;
- CAPTCHA or a new durable rate-limit datastore in C4 without evidence; and
- any code, dependency, env, provider, email, Git, or deployment change in this
  planning task.

## Audit outcome

This review read the required implementation/C1/C2 reports, the implemented
contact source/tests, package metadata, and current official documentation. It
did not inspect real environment values, modify application code or tests,
install or declare dependencies, change configuration, send email, call Resend,
or perform commit/push/merge/deploy/reset/revert/stash operations.

The only intended file created by this pass is this amendment report.
