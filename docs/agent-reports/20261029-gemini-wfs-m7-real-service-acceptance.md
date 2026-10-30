# Gemini WFS M7: real-service acceptance

Latest continuation: **Hosted review of `fbaf556` confirms shared semantic VA colours, shared point symbols and the existing Lagmarkering integration look good.** Two remaining corrections are implemented: Gemini now uses the same map-wide delayed hover tooltip as survey objects, and Gemini marking defaults OFF while preserving semantic geometry. Separate session/data ownership and WFS behavior remain unchanged. **These two final changes await redeployment and hosted verification; final acceptance is not claimed.** Earlier review statuses below are historical. See the final hover/default-marking correction section.

Initial checkpoint, 2026-10-29 (historical; superseded by closeout below): guarded MIME compatibility implemented using the shared strict M2 parser and dedicated Node XML DOM adapter. Earlier origin and `featureMembers` fixes preserved. Prior diagnostic evidence established 1,201 real lines; acceptance was pending manual reimport/login at that time. No M8/topology/validation work started.

## Starting state

- Repository: `C:\GitHub\gmi-validering-test`.
- Branch: `feature/photo-workspace`.
- Starting HEAD: `92f40160bfcbaf1c61e240d5db57fbb83277bba3` (`Add Gemini WFS feature inspection`).
- Worktree: clean at initial preparation. On this diagnostic continuation, the pending untracked M7 report was present and preserved/updated; there were no unrelated user changes.
- Remote: `origin`, `https://github.com/pb-bennett/gmi-validering.git`.
- Upstream configuration: remote `origin`, merge ref `refs/heads/feature/photo-workspace`. The remote-tracking ref is absent locally; `@{upstream}` cannot resolve. No fetch or remote synchronization was performed.
- Existing worktrees: this checkout and `C:/GitHub/gmi-validering-release-v1.2.0` at `45afd0f`.
- Environment: Windows/PowerShell, Node 24.19.0, installed Google Chrome, Next.js 16.1.6. No branch switches, commits, deployment changes or delegation. The later MIME continuation adds one dedicated XML DOM dependency, documented below.

Reviewed the Gemini integration plan and M1–M6 reports and current proxy policy/handler/route, parser/display adapter, extent/client/session ownership, presentation layer, connection form and popup inspection. Also inspected actual file-import/Home/store persistence/test-mode wiring and the existing Chrome harness. No applicable `AGENTS.md` was found in the inspected ancestors or source/test/docs paths.

## Acceptance data

The following table records the original real-service diagnostic attempt before the guarded MIME implementation. Pending normal-path observations are tracked under End-to-end real acceptance below.

The user explicitly designated the existing local source:

`C:\Temp\gmi-photo-test\Ekenesstokken\VA_SOMBYGGET_07112025_BRUK DENNE.gmi`

It was selected through the actual application's survey file input. It was not copied into the repository or added as a fixture. The related photo corpus was not imported for this preparation.

| Evidence | Observation |
| --- | --- |
| Survey format/name | GMI / `VA_SOMBYGGET_07112025_BRUK DENNE.gmi` |
| Source CRS | EPSG:25832 |
| Survey parsed lines / points | 256 / 470; these are survey counts, **not Gemini counts** |
| Survey parser errors | 0 |
| Fixed buffer | 100 m per side |
| Buffered request dimensions | 523 × 617 m, derived with production `getGeminiExtent` |
| Real Gemini line count | 1,201, from strict M2 parsing in isolated diagnostic memory; not published into the app |
| Real Gemini point count | Unverified; pair failed before publication |
| Real upstream status / MIME / charset | Observed HTTP 200 / `text/html` / no declared charset |
| Real response metadata | Content-Length 922,044 bytes; Content-Encoding absent on the observed response |
| Approximate failed-attempt time | About 0.3–0.4 s to the failing proxy response, including local overhead; not a successful fetch/render timing |
| Real GML parser / display result | Normal pipeline stops at MIME. Original diagnostic M2 rejected the wrapper; corrected M2 accepts the same retained line response. No atomic/display result published |

The production GMI parser/decoder and extent helper were additionally run read-only against the same file to obtain only the aggregates above. No coordinate lists or parsed customer attributes were printed. The source SHA-256 was checked before and after preparation and is unchanged:

`69F90ECEBCD1D27F84ACC3511DD79B409FEC4951139855DC2BDC99888754FFE2`

## Actual local workflow preparation

Before repository edits, the selected regression tests and production build passed. Started the normal development workflow:

```powershell
npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
```

The app returned HTTP 200 and loaded as **GMI Validator**. A separate visible Chrome window uses a temporary browser profile and the existing `?testmodus=1` control to suppress ordinary survey-upload telemetry. It remains open at `http://127.0.0.1:3000/?testmodus=1`, with the local development server running. The user entered credentials manually through the application form; the diagnostic continuation reused the existing private in-memory slot without reading its values.

The actual file import completed, the actual Leaflet map loaded, and the normal **Gemini VA** entry opened the existing modal. The source selector contains the intended real GMI and selects it automatically. No synthetic survey state or mocked WFS fetch was injected into this actual-app window.

The temporary browser preparation helper lives outside the repository. It uses Chrome's file-input selection API and ordinary button clicks. It never reads username/password values, request payloads or Authorization headers and does not enable network tracing, console capture or screenshots. Initial preparation selected the file too early during hydration; explicitly waiting for the welcome dialog and clearing/reselecting the file input completed the normal import. This was a preparation timing issue, not evidence of a product defect.

## Workflow acceptance matrix

| Step | Actual local app / real-service status |
| --- | --- |
| Real survey import | Passed with the user-designated GMI |
| App/map startup | Passed; actual Leaflet container loaded |
| Gemini entry and source selection | Passed; intended survey selected |
| Credential form structure | Passed; details below |
| Manual credential entry / submission | Performed by the user in the real form; no values inspected |
| Real proxy Origin behavior | Initial legitimate request rejected; diagnosed and fixed; credential-free probe now passes origin validation |
| Real upstream request | Reached service after the fix; observed HTTP 200 with unsupported `text/html` MIME |
| Real map alignment / density / opacity | Pending real result |
| Real reference visibility / zoom | Pending real result; deterministic synthetic regressions passed |
| Multiple real line popups | Pending real result; synthetic M6 passed |
| Multiple real point popups / elevations | Pending real result; synthetic M6 passed |
| Real refresh and atomic replacement | Pending real result; synthetic M3–M6 passed |
| Controlled authentication failure / reconnect | Not attempted against the service; synthetic M5 passed |
| Real disconnect and reconnect | Pending real result; synthetic M5/M6 passed |
| Real source removal/reset | Pending temporary real-result workspace; synthetic lifecycle passed |

The rejected MIME and cancelled sibling do not establish empty Gemini collections, invalid credentials, permission denial or successful provider authentication. No line/point count is inferred from response size or misleading collection metadata.

## Initial failure and diagnosis

The user observed two expected `/api/gemini-wfs` POSTs from `http://127.0.0.1:3000`, both HTTP 403, with browser resource-failure messages and the generic UI text `Henting fra Gemini VA mislyktes. Prøv igjen.` The modal still indicated session access was supplied. No credentials are included in this report.

Inspection of M1 establishes exactly two mapped 403 errors: local `origin_rejected` and upstream `permission_denied`. Upstream 401 maps separately to `authentication_failed`; redirects and unsupported MIME map to 502. `validateWfsRequestHeaders` runs before reading/validating the JSON body and before `fetchUpstream`.

The current M3 snapshot was inspected only for fixed safe fields. It contained `error.code: origin_rejected`, `status: error`, `connectionStatus: connected`. This establishes that the backend code reached the client and was not converted into a permission/authentication error. M5 had no explicit origin-error wording, so it used its generic fallback. Retaining the credential slot is expected here: M3 clears it on `authentication_failed`, not on a local origin rejection.

A credential-free browser POST with body `{}` reproduced HTTP 403 and sanitized JSON code `origin_rejected`. Temporary diagnostics, gated to that empty local probe, recorded only:

| Metadata | Actual value |
| --- | --- |
| Browser Origin | `http://127.0.0.1:3000` |
| `new URL(request.url).origin` in Next dev | `http://localhost:3000` |
| Host | `127.0.0.1:3000` |
| Sec-Fetch-Site | `same-origin` |
| X-Forwarded-Host / X-Forwarded-Proto | `127.0.0.1:3000` / `http` (observed, not trusted for authorization) |

Server request evidence also showed the two initial POSTs returning 403. **The original failing stage was M1 same-origin validation; those requests did not contact Gemini. There is no upstream status for the original 403 pair.** Next dev reconstructs the route URL with `localhost`, while preserving the browser authority in Host. The exact-origin comparison therefore rejected a genuine loopback same-origin request.

After the narrow fix, the same empty-JSON browser probe returns HTTP 400 `invalid_request`, proving it passes header/origin validation and reaches body policy without any upstream call.

## Post-fix real-service observation

Retried through normal form submission using the retained private credential slot; no credential getter, new credential storage or payload inspection was used. M3 now reports `unsupported_upstream_mime`, rather than `origin_rejected`. One further diagnostic pair was used to establish safe response metadata. Temporary server diagnostics recorded only upstream status, Content-Type, Content-Encoding and Content-Length, before MIME validation:

- HTTP status: **200**.
- Content-Type: **`text/html`**, with no declared charset.
- Content-Encoding: absent.
- Content-Length: **922044** bytes.

M1 correctly rejects this header as `unsupported_upstream_mime` and returns sanitized HTTP 502 JSON. M3 cancels the sibling request; no complete result is published. A Next access-log 200 on a cancelled sibling is not treated as evidence of an upstream success. Only the explicit upstream metadata above is reported as provider evidence.

The temporary browser observer retained only status/MIME/timing, never request bodies or auth headers. The observed failing proxy responses took approximately 428 ms and 293 ms on the two attempts. No success/render performance claim follows from those figures.

At that diagnostic stage, no body had been inspected; the HTTP 200/header/size alone could not distinguish HTML from mislabelled XML. The user subsequently authorized the single ephemeral structural classification below. The XML/GML allowlist remains unchanged; `text/html` is still rejected.

The fixed contract was audited: HTTPS GET to the approved endpoint, WFS 2.0.0/GetFeature, fixed line/point TYPENAMES, EPSG:25832 and survey BBOX, server-built UTF-8 Basic, fixed XML/GML Accept, manual redirect handling, no cookies or caller-selected endpoint. Existing generated-secret tests verify exact Basic bytes without printing them. There is no observed provider 401/403 to diagnose after the local fix, and HTTP 200 alone is not proof of account authorization.

## One-shot ephemeral structural classification

The user then explicitly authorized examining the bytes in memory before MIME rejection, without printing/saving any body, attribute, coordinate, HTML page text, credentials or Authorization. Exactly **one** diagnostic line POST used normal form submission and the existing private credential slot. Its paired point request was suppressed locally before any HTTP request, so it generated no second upstream diagnostic call.

Temporary development-only instrumentation read the response under the existing 3 MiB bound and deadline, then sent its bytes over loopback to a one-use in-memory classifier. That classifier decoded UTF-8 strictly and used Chromium's native inert XML DOMParser. External resources were blocked by CSP; HTML was never executed or inserted into a document, and DTD/entity declarations were rejected before XML parsing. The unchanged production `parseGeminiGml` module was used only for an in-memory compatibility check. Only structural metadata was returned; the proxy still returned `unsupported_upstream_mime` rather than admitting the bytes into a successful application result.

The classifier first passed seven synthetic checks: WFS collection, HTML doctype/login form, HTML application shell, OWS exception, unknown XML, non-XML/malformed XML and unsafe DTD/entity input. No real body was written as a fixture or diagnostic artifact.

| Safe structural evidence | Observed result |
| --- | --- |
| Upstream HTTP status | 200 |
| Declared MIME / charset | `text/html` / none declared |
| First non-whitespace structural form | XML element |
| Starts with XML declaration | false |
| XML parsing | Well-formed XML; no native parsererror |
| Root kind | WFS FeatureCollection |
| Root localName | `FeatureCollection` |
| Root namespace URI | `http://www.opengis.net/wfs/2.0` |
| HTML document / root OWS ExceptionReport | Neither |
| Existing strict M2 compatibility check | Rejected with fixed code `unsupported-profile` |

**Conclusion:** this response is WFS XML mislabelled as HTML, not an actual HTML login/application/error document. The exact WFS root namespace matches M2's contract. However, a valid WFS root is insufficient to establish full Gemini GML compatibility: the unchanged M2 parser rejected a profile condition. This run did not expose feature attributes, coordinates, arbitrary XML metadata or provider exception text, and it did not identify which inner profile condition failed. It must not be reported as fully validated Gemini GML or a successful real fetch. There is no basis for changing M2 speculatively.

No provider inquiry is needed merely to establish that the observed body is XML rather than HTML; that is now directly established. Asking the provider to correct the MIME header remains the preferred option without weakening the application contract. Correcting only that header would still leave the observed M2 profile incompatibility to diagnose.

If an application accommodation is chosen later, the narrow option is restricted to this fixed upstream and the exact observed `text/html` case, under existing size/time/encoding bounds, with safe XML parsing, DTD/entity rejection, exact WFS namespace **and strict expected Gemini member/geometry/profile validation before acceptance**. A root-name or prefix sniff alone is insufficient. Otherwise an HTML login/error document or unrelated XML could be admitted as service data. The current M2 profile rejection means that a guard enforcing today's full contract would still reject this particular response. Therefore no unconditional MIME allowlist addition, content relabelling or parser relaxation is justified at this decision point.

Cleanup completed: the temporary handler block was removed, `wfsProxyHandler.mjs` again has no final diff, the one-shot classifier closed its loopback server and headless browser and removed its connection descriptor, and the temporary browser fetch wrapper was restored. Temporary classification source was also removed from Temp. Only this report changed in the repository during this classification continuation. The earlier evidence-based origin/UI fixes remain untouched. No provider body, HAR, screenshot, response extract or new credential persistence was created.

Post-cleanup M1 policy/handler and M2 Node regressions: **49 passed, 0 failed, 0 skipped**. `git diff --check` passed. These overlap the earlier 352-case validation and are not added to that total. No new production code remained, so a further build/lint run was not needed for this documentation-only final change.

## Real profile mismatch diagnosis

The following continuation was explicitly authorized to identify the first exact M2 structural failure, support only an observed legitimate variant, and validate the same bytes without persisting them. All previous origin/MIME/classification evidence above is preserved as chronological evidence.

### Actual unsupported-profile conditions

Before changing production parsing, every existing `unsupported-profile` call site was identified. Temporary labels were applied only to an in-memory diagnostic copy of M2, preserving check order and public error code/message:

| Existing condition | Temporary diagnostic label(s) |
| --- | --- |
| Non-whitespace text/CDATA in an element passed to `elementChildren` | `unexpected-structural-text` |
| More than one direct GML boundedBy | `multiple-boundedBy` |
| boundedBy is not exactly one GML Envelope | `boundedBy-not-single-Envelope` |
| Envelope is not exactly leaf lowerCorner then upperCorner | `Envelope-corner-shape` |
| Feature namespace differs from confirmed Gemini namespace, or type is not VA_LINE/VA_MPNT | `unexpected-feature-namespace`, `unexpected-feature-local-name` |
| Root is not WFS 2 FeatureCollection, or present version differs from 2.0.0 | `unexpected-root-name-or-namespace`, `unsupported-root-version` |
| Direct root element is neither WFS member nor GML boundedBy | **`unexpected-root-child`** |
| WFS member does not contain exactly one feature, or uses xlink:href | `member-element-count`, `member-link` |

The diagnostic copy self-tested all eleven labelled outcomes plus the valid existing profile: **12 synthetic checks passed**. Geometry-wrapper/cardinality failures are separate `unsupported-geometry` checks; scalar foreign/nested/duplicate fields are `invalid-attributes`. Those were not incorrectly relabelled as profile failures.

### Exact real failure and safe evidence

Exactly one real **VA_LINE** diagnostic request reused the app's private credentials through normal form submission. Its paired point request was suppressed before HTTP. The first failure was:

`rootChildren.some(node => !(is(node, WFS, 'member') || is(node, GML, 'boundedBy')))`

Safe metadata from that response:

| Structural observation | Result |
| --- | --- |
| Root | `{http://www.opengis.net/wfs/2.0}FeatureCollection` |
| Root version attribute | Absent |
| Direct root element count | 1 |
| Sole direct root element | `{http://www.opengis.net/gml/3.2}featureMembers` |
| Direct wfs:member count / root gml:boundedBy | 0 / absent |
| Array non-namespace attributes / non-whitespace structural text | None / none |
| Direct feature elements in array | 1,201, all `{http://www.powel.com/gemini}VA_LINE` |
| Inspected feature geometry wrapper | `{http://www.powel.com/gemini}GEOMETRY` |
| Inspected geometry / coordinate encoding | GML 3.2 LineString / posList |
| Inspected geometry protocol declarations | EPSG:25832, srsDimension=3 |

Only names/namespaces, protocol metadata and counts were emitted. No feature IDs, field values, coordinate tuples or XML fragment was printed or saved. Inspection of the retained response showed field **names** matching the confirmed line XSD list: LSID, LENGTH, DIM, YEAR, OWNER/STATUS/FCODE/FCODEGROUP/MATERIAL/NETTYPE/RESPONSIBLE and their observed title fields, plus GEOMETRY. No values were extracted into the report.

The M2 fixtures/report had explicitly assumed individual `wfs:member` wrappers. The real service instead supplies a GML array of the same confirmed features. The public [OGC GML 3.2.1 schema](https://schemas.opengis.net/gml/3.2.1/deprecatedTypes.xsd) also defines `featureMembers` as `FeatureArrayPropertyType` (deprecated). That establishes the wrapper's GML meaning, not blanket permission to accept every WFS/GML structure or a claim of full WFS XSD conformance. The implementation justification is the exact observed Gemini response, confirmed feature namespace/types/fields/geometry and the successful unchanged inner validation after adapting that wrapper.

### Narrow production correction and synthetic coverage

`src/lib/gemini-wfs/parseGeminiGml.mjs` now also accepts **one sole GML 3.2 featureMembers array**, containing direct features and no non-namespace attributes. It rejects mixed/repeated wrappers, accompanying unobserved root siblings, wrapper links/nil/other attributes and structural text. Every child passes the existing feature namespace/type, GML identity/duplicate, scalar-state, geometry/CRS/dimension, XML safety and resource checks. The existing `wfs:member` path remains supported. Counts use actual contained feature elements in either representation; WFS count metadata is still not trusted. No normalized survey conversion or source/display identity change was introduced.

Synthetic-only additions:

- `tests/fixtures/gemini-wfs/syntheticProfile.mjs`: `featureArrayCollection`, using invented members/values.
- `tests/fixtures/gemini-wfs/README.md`: observed structural provenance and strict support boundary.
- `tests/browser/geminiGmlChecks.mjs`: six new native-browser cases proving existing-profile source/display equivalence and immutability; empty/prefix variants; mixed/repeated/nested/foreign wrapper rejection; link/nil/attribute/text rejection; unchanged feature/ID/geometry/scalar/OWS safety; exact 2000-feature cap and explicit excess failure.

No real-response fixture was created. No existing negative assertion was weakened.

### Same-response post-fix verification

The original line bytes remained only in isolated browser memory. Loading the corrected production M2 module against **that same unmodified response** succeeded; there was no second line request. Only these aggregates were returned:

| Aggregate | Result |
| --- | --- |
| Parsed members / records / lines | 1,201 / 1,201 / 1,201 |
| Points in line response | 0 |
| Geometry | 1,201 LineStrings, all posList |
| XY / XYZ features | 0 / 1,201 |
| Source coordinate tuples | 4,755 |
| Literal Z zero / nonzero tuples | 2,460 / 2,295 |
| Validated feature namespace / CRS | `http://www.powel.com/gemini` / EPSG:25832 |

These are parsed response counts, not a completeness guarantee. Z aggregates carry no inferred terrain, invert, datum or elevation-quality meaning. Attributes and GML IDs were validated by M2 but never printed.

**Point verification remains pending.** The development reload caused by the shared parser update cleared the visible test workspace/private credential slot. The point helper stopped before form submission; no VA_MPNT HTTP/upstream request was sent. A probe against the absent retained point slot was discarded as a diagnostic harness error, not reported as a provider response or point-parser failure. Attempts to restore the local browser workspace encountered preparation/CDP timeouts; no additional service calls or credential workaround were made. A new manual login is required for the single point diagnostic later. Synthetic Point handling through the same array wrapper passed.

Cleanup: the isolated service reached its 15-minute memory-lifetime bound, closed its server/browser and removed the connection descriptor, releasing the retained XML. Temporary handler instrumentation and profile-diagnostic source files were removed; the real-browser fetch wrapper was restored. `wfsProxyHandler.mjs` has no final diff and no temporary diagnostic endpoint/logging remains in production. The existing real survey is unchanged and remains outside the repository.

### Profile-fix validation

- M2 native-browser selection: **40 passed** (39 cases including the six new cases, plus parent), no failures/skips.
- Selected M1–M6/CRS/photo/WMS/popup/lifecycle Node regressions: **269 passed**, no failures/skips.
- Full selected M2–M6/photo synthetic browser regressions: **89 passed**, no failures/skips. Includes M3 client/session, M4 map presentation, M5 form/errors/refresh/disconnect and M6 popup/tool/lifecycle safety.
- Final selections total **358 passed, 0 failed, 0 skipped**, counting browser parent tests. The overlapping 144-test targeted and 40-test M2 runs are not added again.
- Focused ESLint passed for all ten changed code files, including parser, new browser checks/fixture builder and prior M7 code/test changes. No MapInner change or lint-baseline work.
- Production build passed; a final build was also run after removing temporary handler instrumentation. Existing Google Fonts network access used the permitted environment. No dependency/font/configuration change.
- `git diff --check` passed. No full repository suite or normal real-result map acceptance was claimed.

## Prior MIME accommodation decision (superseded by the implementation below)

This section records the earlier diagnostic stopping point. The user subsequently authorized implementing shared strict server validation and will not contact the provider. Its recommendations and unimplemented status are historical.

**Strict real VA_LINE compatibility is now established after the narrow wrapper correction. Actual VA_MPNT compatibility remains unverified until manual reconnect.** MIME handling remains separate and unchanged: HTTP 200 `text/html` is rejected by M1, so the parsed diagnostic records have not been published through M3/M4 into the map.

| Option | Security/implementation implications | Recommendation |
| --- | --- | --- |
| Provider corrects Content-Type to the actual XML/GML MIME | Preserves current M1 transport/security contract; no application MIME exception or new server XML parser. The strict browser M2 validator remains authoritative for service data. | Safest and smallest overall change; provider inquiry remains useful. |
| App accommodates exactly observed text/html from the fixed upstream, with full strict server validation first | Must retain HTTP 200, 3 MiB/deadline, strict encoding, DTD/entity rejection, exact WFS root/Gemini namespace/types and all geometry/profile/limit checks. HTML/login pages and OWS errors must fail before relabelling/acceptance. | A possible fallback if the provider cannot fix its header; requires a deliberate design, not implementation in this diagnostic continuation. |
| Unconditional text/html allowance or root/prefix sniff only | Can admit HTML/login pages, unrelated XML, foreign members, malformed geometry or provider exceptions. WFS root alone was already shown insufficient. | Rejected. |

M2 is browser-only and depends on native DOMParser/DOM traversal. M1 currently has no production XML parser dependency. A strict server accommodation must not casually duplicate M2 into a second validator or ship the diagnostic headless browser. The existing `parseXml` seam offers a route to sharing validation logic, but a safe Node XML/DOM adapter would need explicit dependency/security/API-compatibility work and equivalent regression coverage. General XML well-formedness or a string-based root check would not meet the required boundary.

No MIME accommodation was implemented. The observed line compatibility justifies considering a narrowly guarded accommodation, not accepting it blindly. Prefer provider header correction; if an app fallback is selected, agree the shared strict-validation architecture first and complete point verification. M7 cannot yet proceed to normal real map/popup/refresh/disconnect acceptance.

## Guarded MIME compatibility implementation

The user authorized this continuation for **M7 only**. Approved XML/GML MIME handling remains unchanged: no server XML validation, decoding, model transformation or new timing header on that path. The existing malformed-byte pass-through test demonstrates that fallback validation is not invoked unnecessarily; browser M2 retains its existing responsibility there.

For the compatibility path, M1 reads the original bounded bytes, decodes with the **same existing browser decoding implementation**, and calls the production `parseGeminiGml(xml, { parseXml: parseNodeXml })`. It discards the temporary validation model and sends the original bytes. Browser M3/M2 then parses and adapts them normally, with atomic pair publication unchanged. There is no second profile validator, XML serialization, provider-body logging or server feature transformation.

Exact fallback conditions:

- Registered connection ID `faerder-va-basis` and the fixed HTTPS `https://faerder.geminisuite.com/portal/api/proxy/map/va-basis.wfs` upstream, selected solely by existing request policy. Client endpoint overrides remain invalid.
- HTTP **200** only; existing redirect/status denials run first. A redirected or differently resolved transport response also cannot use fallback.
- Media type is plain **`text/html`**, using ordinary MIME case/outer-whitespace normalization, with **no charset or other parameters**. Even `text/html; charset=utf-8` remains rejected because it was not observed. The fallback does not expand the general XML MIME allowlist.
- Existing request/response size, transport encoding, Content-Length, abort and 15-second deadline rules remain active, including the **3 MiB** decompressed body bound. Decoding is fatal UTF-8, and the shared XML-declaration encoding checks remain unchanged.
- Complete strict M2 parsing must succeed: WFS root, the two supported wrapper structures, confirmed Gemini namespace/types, source IDs, geometry/CRS/dimensions, scalar fields, duplicate IDs and all resource limits. DTD/ENTITY are rejected before DOM parsing; other processing instructions stay forbidden.

Only after success does M1 return `application/gml+xml; charset=utf-8` with original bytes, `private, no-store`, `nosniff` and the existing sandbox CSP. No provider cookies, Authorization, authentication challenge, arbitrary timing/header values or body on failure are forwarded. All validation/decoding failures become fixed `invalid_upstream_response` JSON; provider/parser details do not escape. Unconditional HTML acceptance would admit login pages, unrelated XML and profile failures and remains forbidden.

### Node XML dependency and adapter rationale

No suitable DOM implementation was present in direct/transitive installed dependencies or the lockfile. Added **`@xmldom/xmldom` 0.9.12**, pinned exactly with integrity in the lockfile, as the only new dependency (no transitive production packages). Installation used `--ignore-scripts`. This small dedicated DOM implementation provides namespace-aware XML APIs without a browser, HTML execution, schema loader or external resource loader. The adapter always selects `application/xml`; all warnings/errors/fatal errors throw immediately through a custom `onError`, suppressing the library's default console diagnostics and preventing recovery into acceptance. The [upstream changelog](https://github.com/xmldom/xmldom/blob/master/CHANGELOG.md) describes recent parser security corrections and the need to escalate recoverable errors; this adapter escalates warnings too. Installed package source was inspected for the API/error behavior used here.

`src/lib/gemini-wfs/nodeXmlParser.mjs` is the small server adapter. xmldom validates a leading XML declaration but retains it as a PI node; native DOMParser omits it. The adapter removes **only that validated leading `xml` declaration node** to reproduce the native DOM contract. Malformed, repeated or misplaced declarations still fail; actual processing instructions remain visible to M2 and fail its existing unsafe-XML check. Shared synthetic tests exercise both runtimes with the same declarations and unsafe-instruction cases.

M2's only cross-runtime abstraction changes replace browser convenience properties (`children`, `parentElement`) with equivalent DOM Level 2 `childNodes`/`parentNode` element traversal. No profile rules or safety limits were weakened. The existing decoder moved verbatim into `geminiXmlEncoding.mjs`, with its existing client export preserved, so server reuse does not import browser display/projection code.

### Deadline and aggregate timing

Synchronous bounded DOM validation cannot service a JavaScript timeout callback while it runs. M1 explicitly checks monotonic elapsed time after validation, yields to pending cancellation, checks the abort signal and elapsed deadline again, and refuses late publication. It does not claim a worker-level preemption mechanism.

Successful fallback responses expose only application-generated aggregate `Server-Timing: gemini-validation;dur=...` milliseconds, replacing any supplied provider timing. No feature values or counts are added to headers/logs. Pair duration can be observed normally without capturing request bodies or raw WFS. Browser parse/display timing is not newly instrumented.

Synthetic measurement (invented data only, not a service benchmark): a 1,200-line payload of **827,260 bytes** and a 1,200-point payload of **359,260 bytes** completed local proxy/validation in approximately **169 ms** for the concurrent pair in the regression run; individual validation durations were approximately **97 ms / 67 ms**. This includes no real network or browser rendering. Actual real pair/validation timings remain pending.

### Compatibility test coverage

- New `tests/wfsMimeCompatibility.test.mjs`: **32 synthetic tests**, valid VA_LINE and VA_MPNT for both wrappers; original bytes and application-controlled MIME/security headers; all requested invalid HTML/login/app-shell/XML/OWS/namespace/type/geometry/mixed-wrapper/CRS/DTD/ENTITY/limit/duplicate-ID/field-profile cases; wrong connection/upstream/status/redirect/MIME parameters; invalid encoding; declared/streamed size bounds; timeout, abort and synchronous validation deadline; sanitized errors and no credential/parser logging.
- New `tests/geminiNodeXmlParser.test.mjs` reuses the browser source/display contract check factory with the **production Node adapter**: 40 common checks plus parent, and one adapter-specific malformed XML/no-resource/no-diagnostics test (**42 tests** total). Includes parser byte, feature, coordinate, depth, node and field limits and independent point elevations.
- Native browser tests run the same 40 common checks through actual Chromium DOMParser. The existing M1 approved-MIME raw-byte tests, M3 decoding/session/pair contract, M4 presentation, M5 workflow, M6 popup and relevant WMS/photo/map regressions remain included.

### Final validation for the guarded MIME continuation

- Selected Node regressions: **343 passed, 0 failed, 0 skipped**, including M1 proxy/policy, new compatibility tests, full shared M2 Node contract, M3 client/session, M4 presentation, M5 workflow, M6 popup, lifecycle/CRS/map/photo and relevant WMS regressions.
- Synthetic browser selection: **90 passed, 0 failed, 0 skipped**, including parent tests. Runs the same M2 contract in native Chromium and actual M3-M6 React/Leaflet flows, plus seven internal XML/EXIF/photo checks. All real-corpus/screenshot environment variables were explicitly removed. The sandboxed Chrome harness timed out before checks could execute; that run was interrupted and the identical suite passed in the permitted environment, as in earlier M7 work. No provider request or authenticated capture was used.
- Final nonoverlapping selection total: **433 passed, 0 failed, 0 skipped**. Earlier targeted runs and historical results below are not added again.
- Focused ESLint: **0 errors, 0 warnings** across all 16 changed/new JavaScript/MJS files (including prior M7 files).
- **`npm.cmd run build` passed, exit 0**: production compilation, TypeScript, eight static pages and dynamic API routes. No font/configuration/deployment changes. Existing Browserslist age and Node module-type/localStorage harness warnings are unrelated to this change.
- `git diff --check` passed. No full repository suite was claimed, no commit/push/deploy was performed, and no M8/topology/validation work was started.

The selected commands were:

```powershell
node --test tests/geminiPopupContent.test.mjs tests/geminiWorkflowUi.test.mjs tests/geminiReferencePresentation.test.mjs tests/wfsProxyPolicy.test.mjs tests/wfsProxyHandler.test.mjs tests/wfsMimeCompatibility.test.mjs tests/geminiNodeXmlParser.test.mjs tests/geminiGmlParser.test.mjs tests/geminiExtent.test.mjs tests/geminiClient.test.mjs tests/geminiSession.test.mjs tests/geminiStoreLifecycle.test.mjs tests/wmsProxyPolicy.test.mjs tests/mapPaneToolbar.test.mjs tests/mapBackgroundControl.test.mjs tests/layerOrder.test.mjs tests/layerPresentation.test.mjs tests/layerHighlightPanel.test.mjs tests/layerHighlightHalo.test.mjs tests/photoMapFeatures.test.mjs tests/photoWorkspace.test.mjs tests/photoWorkspaceUx.test.mjs tests/photoResetIntegration.test.mjs tests/photoSession.test.mjs tests/featurePopupContent.test.mjs tests/richerUsageTelemetryParserIntegration.test.mjs tests/photoImportLayers.test.mjs tests/photoManualPlacement.test.mjs tests/photoDirection.test.mjs tests/objectTableInspection.test.mjs

node node_modules/eslint/bin/eslint.js src/lib/gemini-wfs/wfsProxyPolicy.mjs src/lib/gemini-wfs/wfsProxyHandler.mjs src/lib/gemini-wfs/parseGeminiGml.mjs src/lib/gemini-wfs/nodeXmlParser.mjs src/lib/gemini-wfs/geminiClient.mjs src/lib/gemini-wfs/geminiXmlEncoding.mjs src/lib/gemini-wfs/geminiWorkflowUi.mjs tests/wfsProxyPolicy.test.mjs tests/wfsProxyHandler.test.mjs tests/wfsMimeCompatibility.test.mjs tests/geminiNodeXmlParser.test.mjs tests/geminiWorkflowUi.test.mjs tests/browser/geminiWorkflowApp.js tests/browser/geminiGmlChecks.mjs tests/fixtures/gemini-wfs/syntheticProfile.mjs tests/geminiWorkflowBrowser.test.mjs

npm.cmd run build
```

The browser command is the same explicit six-module import selection recorded under historical Validation below, with all four optional data/capture environment variables deleted before imports.

## Real point profile

**Not yet verified in the normal application.** No new real request was sent in this MIME implementation continuation. Parsed point count, Point count, XY/XYZ counts, COVER_Z presence, geometry-Z presence, both-present count and zero-Z count are pending. Actual point wrapper, namespace, `Point`/`pos`, CRS and dimensions must be observed after manual login; synthetic point success is not real-service acceptance.

## End-to-end real acceptance

| Check | Current evidence / remaining action |
| --- | --- |
| Real lines | Prior isolated diagnostic: 1,201 lines, 4,755 tuples, all XYZ LineStrings. Normal M1 fallback + browser M2 + source/display/map publication pending. Counts are observations, not a hard-coded service contract. |
| Real points | Pending manual restore/login and ordinary pair request. |
| MIME | Previously observed upstream HTTP 200, plain `text/html`, absent charset. Successful fallback now returns controlled GML/XML MIME; this is proven synthetically, pending real normal-path observation. |
| Real pair / validation time | Pending; the earlier 0.3?0.4 s failed attempt is not successful fetch/display timing. |
| Map alignment / lines / points / responsiveness | Pending. Confirm reference under survey and source counts in the card. |
| Visibility / zoom | Pending on real results. |
| Line / point popups | Pending on several real objects, including missing rows, separate Kote lokk/Geometrikote and zero geometry Z if available. No units or vertical datum inferred. |
| Refresh | Pending: hide one side, exactly one new pair, no credential re-entry, retain old pair while loading, atomic replacement, retained visibility and closed old popup. |
| Disconnect / reconnect | Pending: clear result/vectors/popup/private credentials; preserve survey/photo/WMS and permit reconnect. |

Manual gate, as requested by the user: **Reimport the same GMI, open Gemini VA, enter your credentials in the app, and click Hent eksisterende anlegg.** Stop here for that action after implementation checks. Credentials are entered only in the application. No M8/topology/matching/validation work is authorized.

## Security

This continuation persists only production code, synthetic tests, dependency metadata and aggregate documentation. No real WFS response, municipal fixture, survey copy, credentials or Authorization values were logged or persisted; no HAR/screenshot/trace of an authenticated flow was exported. Parser diagnostics are suppressed and sanitized, and no raw body is logged.

Static review and synthetic tests preserve the existing credential boundaries: fixed relative browser POST, credentials never in URLs/browser Authorization/storage/Zustand snapshots, private in-memory session ownership, request-local server Basic auth, safe errors, no forwarded provider cookies/challenges and cleanup on disconnect. No persistence or credential-handling behavior changed. **The successful real-workflow leakage audit is still pending** alongside map/refresh/disconnect acceptance; these code/test findings must not be presented as completed real acceptance.

## Password-manager-compatible form

Verified through DOM metadata only, without reading input values:

| Property | Actual local observation |
| --- | --- |
| Form ID / method | `gemini-va-connection-form` / `post` |
| Form action origin | Same as local app origin |
| Username | ID `gemini-va-username`, name `username`, type `text`, autocomplete `username` |
| Password | ID `gemini-va-password`, name `password`, type `password`, autocomplete `current-password` |
| Availability | Both fields enabled after real survey selection |
| Masking contract | Native password input; no visible-password control added |

The form is mounted normally in Chrome and was submitted by the user and then retried with existing session access. This confirms structural compatibility, not Chrome's private recognition/save/autofill decisions. Natural Chrome save/autofill behavior has not been established. No saved-password UI automation or application credential persistence was added. Local loopback HTTP observations must not be presented as deployed HTTPS password-manager acceptance.

## Real-service observations still required

The WFS/Gemini namespaces, EPSG:25832 and real LineString/posList XYZ profile are now directly verified by strict M2 parsing of the retained line response. Actual Point structure/field presence and real-result map behavior still need acceptance after manual reconnect and a separate MIME resolution.

Once the upstream response MIME/content contract is established and resolved, collect only aggregates: successful/empty sides, parsed member counts, approximate request duration and parser/display success. Confirm the real namespace, gml:id, line `posList` and dimension declarations, point `pos` and XY/XYZ distribution, and scalar field-presence counts without exporting the response or object coordinate lists.

Check multiple real line/point popups, available curated fields and missing rows. Record only aggregate presence of COVER_Z, source geometry Z, zero Z and disagreement. Do not assign units, vertical datum, terrain/invert meaning or an authority ranking to elevations.

Verify map alignment with the real survey, pane order, usable basemap, density and responsiveness. Then verify one ordinary refresh adds exactly a line/point pair, reuses private credentials/account generation, retains the old pair and visibility while loading, replaces atomically and closes the old popup. Verify disconnect preserves unrelated domains and permits reconnect. Exercise source removal or reset only in the temporary acceptance workspace. At most one controlled bad-password attempt is appropriate; no real-service rate-limit or oversized-response testing.

## Fixes and scope

Two narrowly related fixes were justified by the actual local failure:

| File | Change / regression evidence |
| --- | --- |
| `src/lib/gemini-wfs/wfsProxyPolicy.mjs` | Permit only the observed development HTTP alias: route hostname `localhost`, Origin hostname `127.0.0.1`, identical port, Host exactly matching Origin authority, and explicit `Sec-Fetch-Site: same-origin`. Production continues requiring exact request-URL origin. |
| `src/lib/gemini-wfs/geminiWorkflowUi.mjs` | Give `origin_rejected` a fixed app-security message instead of implying an ordinary provider fetch failure; permission and authentication wording remain distinct. |
| `tests/wfsProxyPolicy.test.mjs` | Reproduce exact dev metadata; reject mismatched Host/port/protocol, malicious/suffix origins, paths/userinfo, missing/cross-site signals and forwarding-header spoofing; reject the exception in production while retaining ordinary exact-origin success. |
| `tests/wfsProxyHandler.test.mjs` | Verify empty probe becomes 400 with zero upstream calls, generated valid request reaches injected upstream once, and hostile/production alias requests remain 403 with no extra upstream calls. |
| `tests/geminiWorkflowUi.test.mjs` | Verify distinct fixed origin-security wording and no supplied detail reflection. |
| `tests/browser/geminiWorkflowApp.js`, `tests/geminiWorkflowBrowser.test.mjs` | Add a synthetic origin-denial response to the actual modal's safe-error acceptance loop. |
| This report | Initial failure, exact diagnosis, fix, real MIME blocker and validation. |

No CORS permission was added, origin validation was not disabled, arbitrary forwarded headers are not trusted, and upstream destination/auth/resource restrictions are unchanged. The exception is not available to a caller via JSON or headers alone; it is gated by the server's development environment and the exact loopback conditions above. Existing hostile-origin tests remain intact.

All temporary origin/upstream metadata/profile diagnostics were removed. `wfsProxyHandler.mjs` has no final content change. The subsequent M2 parser correction, synthetic fixture/helper, six browser cases and fixture README are documented above. No M3 data/session, M4 map, M6 popup, WMS, dependency, font, configuration or deployment setting changed. No topology, matching, automatic connection detection, snapping, editing, network validation, attribute table, persistence, configurable buffer, endpoint profile, COUNT/paging, background refresh or cartographic classification was implemented.

## Security review and evidence limits

Static review and synthetic regressions confirm:

- Credentials are read through the real native form and passed to M3's private closure, outside Zustand/devtools/persistence; M3 snapshots have no credential fields.
- The browser client makes fixed relative `POST /api/gemini-wfs` requests with credentials transiently in JSON, never in URLs or browser Authorization headers. Only the server constructs Basic Authorization for the fixed HTTPS upstream.
- The proxy rejects redirects, preserves no credential session, uses private/no-store responses and returns fixed sanitized errors instead of raw provider bodies or Authorization reflection.
- No Gemini console logging or localStorage/sessionStorage write exists in the inspected modules. The general store persists settings/UI rather than Gemini data; the existing development crash breadcrumbs store bounded runtime/error information, so safe Gemini errors remain important.
- Popup provider values enter DOM `textContent`, with no links, markup execution or provider-derived actions.
- Disconnect/reset drop private credentials and results, and generation/abort checks reject late publication.

These are code/test findings and limited real-request metadata observations, **not a completed successful real-authenticated-path leakage audit**. No credential values were read, logged, printed, encoded for output, put in shell history/source/fixtures/environment files, or captured in screenshots/traces/reports. Authorization values were never inspected or printed. The user's existing app-held credentials were reused without exposing them. No raw provider response, municipal GML extract or real survey copy was persisted or committed by this work. No persistent credential storage was added. No deliberately invalid real credential attempts or rate-limit probes were made.

## Historical validation before MIME compatibility

These earlier counts/builds are retained as history. The final guarded MIME continuation results above supersede them.

Selected Node regressions:

```powershell
node --test tests/geminiPopupContent.test.mjs tests/geminiWorkflowUi.test.mjs tests/geminiReferencePresentation.test.mjs tests/wfsProxyPolicy.test.mjs tests/wfsProxyHandler.test.mjs tests/geminiGmlParser.test.mjs tests/geminiExtent.test.mjs tests/geminiClient.test.mjs tests/geminiSession.test.mjs tests/geminiStoreLifecycle.test.mjs tests/wmsProxyPolicy.test.mjs tests/mapPaneToolbar.test.mjs tests/mapBackgroundControl.test.mjs tests/layerOrder.test.mjs tests/layerPresentation.test.mjs tests/layerHighlightPanel.test.mjs tests/layerHighlightHalo.test.mjs tests/photoMapFeatures.test.mjs tests/photoWorkspace.test.mjs tests/photoWorkspaceUx.test.mjs tests/photoResetIntegration.test.mjs tests/photoSession.test.mjs tests/featurePopupContent.test.mjs tests/richerUsageTelemetryParserIntegration.test.mjs tests/photoImportLayers.test.mjs tests/photoManualPlacement.test.mjs tests/photoDirection.test.mjs tests/objectTableInspection.test.mjs
```

Post-fix result: **269 passed, 0 failed, 0 skipped**, including three new regression tests. Covers M1–M6 and survey import/CRS, popup/map/pane/highlight, photo ownership/placement/direction/reset and WMS. Existing Node module-type/unavailable-localStorage harness warnings remain. The earlier unchanged preparation selection passed 266; those overlapping cases are not added to the final count.

Synthetic browser regressions:

```powershell
@'
delete process.env.PHOTO_GML_FIXTURE;
delete process.env.GEMINI_SCREENSHOT_PATH;
delete process.env.GEMINI_WORKFLOW_SCREENSHOT_PATH;
delete process.env.GEMINI_POPUP_SCREENSHOT_PATH;
await import('./tests/geminiGmlBrowser.test.mjs');
await import('./tests/geminiServiceBrowser.test.mjs');
await import('./tests/geminiReferenceBrowser.test.mjs');
await import('./tests/geminiWorkflowBrowser.test.mjs');
await import('./tests/geminiPopupBrowser.test.mjs');
await import('./tests/terrainPhotoGml.test.mjs');
'@ | node --input-type=module
```

**83 passed, 0 failed, 0 skipped**, with the unchanged shared Chrome harness outside the sandbox as established in M6. Includes actual browser XML/EXIF/projection/session, M4 map/card/large-data, M5 form/error/reconnect/refresh/disconnect/WMS isolation and M6 pointer popups/tool priority/pan/lifecycle/no-extra-requests. The photo test additionally reports seven internal checks. Synthetic error paths cover rare failures without contacting Gemini.

After the origin/UI fixes the total was **352 passed, 0 failed, 0 skipped**. After the profile fix and its six new browser cases, the final total is **358 passed, 0 failed, 0 skipped** (269 Node + 89 browser, including parents). The full repository suite was not run.

Focused ESLint passed with **0 errors and 0 warnings** for all seven changed JavaScript/MJS files:

```powershell
node node_modules/eslint/bin/eslint.js src/lib/gemini-wfs/wfsProxyPolicy.mjs src/lib/gemini-wfs/geminiWorkflowUi.mjs tests/wfsProxyPolicy.test.mjs tests/wfsProxyHandler.test.mjs tests/geminiWorkflowUi.test.mjs tests/browser/geminiWorkflowApp.js tests/geminiWorkflowBrowser.test.mjs
```

The preparation's wider 34-file Gemini lint scan also passed. `MapInner` was not touched, so no baseline comparison was required.

`npm.cmd run build`: **passed, exit 0**, using the permitted environment with network access for existing Google Fonts. Next.js 16.1.6 compiled, TypeScript checks completed, all eight static pages generated, and existing API routes stayed dynamic. Existing outdated Browserslist notice remains. Font/deployment configuration was not altered. `git diff --check` passes.

## Remaining hosted-deployment checks

No hosted target was changed or authenticated during this preparation. Before deployed acceptance:

1. Repeat the normal form-to-proxy path on the actual HTTPS origin; verify browser Origin and reverse-proxy request URL agree without changing trust rules speculatively.
2. Verify successful line/point responses have private/no-store/nosniff behavior; no cookie, challenge, Authorization or provider error body is reflected.
3. Check actual deployment duration and payload limits against the current 15-second upstream/20-second client deadlines and 3 MiB-per-side bound, including proxy overhead/compression. Do not assume dashboard settings from local results.
4. Confirm deployment/APM/access-log configuration does not capture request bodies, auth headers or municipal response content. Avoid exporting authenticated browser traces.
5. Observe natural Chrome save/autofill behavior on the deployed origin and verify mask/field cleanup, refresh, reconnect and disconnect there.
6. Review existing deployment-level invocation/rate controls without probing the service's rate limits or adding infrastructure without evidence.

## Earlier diagnostic decision point (superseded)

The paragraphs below describe the previous stopping point; the authorized guarded implementation above now supersedes the MIME choice. Manual reimport/login remains the next required step.

The real line profile mismatch is explained and narrowly corrected, and the same response passes strict M2 with 1,201 lines. No point request was sent after development reload cleared credentials; one-point verification needs a restored manual login. Choose provider MIME correction or explicitly agree a shared strict server-validation design before normal acceptance. No further service calls or MIME changes were made after this boundary.

Real point count, normal-path display/map/popup/refresh/disconnect acceptance and end-to-end M7 success remain **unverified**. No unconditional `text/html` acceptance has been added.

## QGIS-success / app-401 diagnosis

Initial diagnostic continuation date: 2026-10-30. This subsection records the earlier handoff and is superseded by **Vercel Deployment Protection correction** below. The subsequent main-PC evidence establishes that the reported browser 401 was Vercel interception before M1, not upstream Gemini `authentication_failed`. Do not classify it as a bad-password failure.

### Evidence and location of the 401

- User evidence: a newly created QGIS WFS connection succeeds with the same username/password used by GMI Validator; the browser reports `POST /api/gemini-wfs` with HTTP 401 and the UI reports authentication failure.
- The user clarified that this agent is on the backup development PC. Its installed QGIS is 3.44.10, but its sole discovered default profile has no saved WFS connection. No running QGIS or local app/debug listener was found in the inspected processes/ports. This does not contradict the main-PC success. No saved password, authentication database contents, browser credential values, or real Authorization values were inspected.
- The user supplied the successful connection's base endpoint: `https://faerder.geminisuite.com/portal/api/proxy/map/va-basis.wfs`. This is identical to M1's fixed endpoint. A base host/path mismatch is ruled out by the supplied URL; a canonical destination or operation URL advertised later by capabilities is still unverified.
- Code audit: the route exports M1's POST handler directly. Local header/body rejection returns 400/403/405/413/415, not 401. After successful local validation, the handler invokes fetch against the fixed HTTPS URL. `validateWfsUpstreamStatus(401)` alone creates `authentication_failed`/401, before MIME handling or parsing. Redirects instead produce `upstream_redirect`/502.
- Synthetic route regression now verifies an accepted POST reaches injected upstream and that upstream 401 becomes safe `authentication_failed`/401. Existing regressions verify rejected local requests never invoke upstream and that upstream error bodies/headers are neither read nor forwarded.
- **Corrected interpretation:** route-level tests describe what happens only after M1 executes. They do not establish where the main-PC browser 401 originated. Subsequent evidence identifies Vercel Deployment Protection as its source, before the route. The client's bare-401 fallback explains the misleading authentication UI. There was no Gemini upstream 401 in that intercepted exchange.

### Safe app request semantics

| Item | Current behavior |
| --- | --- |
| Browser request | Fixed relative `POST /api/gemini-wfs`; JSON body; now explicit `credentials: same-origin` (previously `omit`); `cache: no-store`; `redirect: error`. Gemini credentials occur transiently in JSON, never query parameters. App/deployment session cookies travel only to the same-origin API. |
| Upstream method/path | `GET /portal/api/proxy/map/va-basis.wfs` on the fixed `https://faerder.geminisuite.com` origin. |
| Query keys, in construction order | `SERVICE=WFS`, `VERSION=2.0.0`, `REQUEST=GetFeature`, `TYPENAMES=gemini:VA_LINE` or `gemini:VA_MPNT`, `SRSNAME=EPSG:25832`, `BBOX=minX,minY,maxX,maxY,EPSG:25832`. Uppercase keys; plural `TYPENAMES`. |
| Query encoding | `URLSearchParams` percent-encodes colons and commas. The BBOX is easting/northing order with a fifth CRS component. Actual failed-request coordinates were not inspected. There is no evidence that order or encoding causes the 401. |
| Accept | `application/gml+xml, application/xml, text/xml`. |
| Authentication | One server-created preemptive Basic header; no challenge retry, capabilities/describe preflight, or shared authentication session. |
| User-Agent | No application override. A synthetic local HTTP observation using this backup PC's Node v24.19.0 / Undici 7.29.0 showed the transport supplies `node`; the main PC's runtime/wire value is unverified. |
| Cookies | No outgoing Cookie header, no cookie jar, no browser cookie forwarding, and no storage/use of upstream Set-Cookie. |
| Redirects | `manual`; every upstream 3xx is rejected. |
| Body / Content-Type | No upstream body; no Content-Type set. |
| Host | Not copied from the browser or set by application code. Fetch derives the upstream authority from the fixed URL. |
| Other benign headers | No application Referer, Origin, Accept-Encoding, or Connection override. The synthetic local HTTP probe showed no Referer/Origin, `Connection: keep-alive`, `Accept-Encoding: gzip, deflate`, and transport-added `Cache-Control: no-cache` / `Pragma: no-cache`. This is a local HTTP observation, not a capture of the authenticated HTTPS request; do not assume identical TLS compression defaults. |

### Basic construction and QGIS behavior

The implementation constructs `username + ":" + password`, encodes it as UTF-8 with Node Buffer, then Base64-encodes those bytes. JSON is parsed first. The form reads native FormData strings, the private session copies them unchanged, and the browser serializes them with JSON.stringify. There is no credential trimming, Unicode normalization, URL/form encoding, or surviving JSON escaping. Whitespace is preserved. Control characters/newlines, invalid surrogate sequences, and colons in usernames are rejected before fetch; they are not silently transformed. Username validation uses trim only to reject an entirely whitespace username, not to modify its value. One Authorization header is constructed; incoming browser authentication headers are not forwarded.

A new invented-credential test compares decoded generated bytes with an independently written numeric UTF-8 byte vector. It covers leading/trailing spaces, non-ASCII text, a decomposed accent, a colon in the password, backslash, quote, plus, percent, and an escaped JSON username. It also checks one Authorization field. No real credential is used. Existing native-form browser tests verify synthetic autofill/form values reach the client intact. Actual autofill contents on the main PC remain unobserved and are not blamed for the failure.

The [QGIS 3.44 authorization implementation](https://api.qgis.org/api/3.44/qgsauthorizationsettings_8cpp_source.html) has separate branches: a nonempty Authentication Configuration delegates to the auth manager; direct username/password constructs preemptive Basic from UTF-8 username/colon/password bytes. Thus QGIS can use the same Basic construction, and a mandatory challenge flow must not be assumed. This is source-level evidence for the documented 3.44 implementation, not proof of the main PC's selected method/version or actual successful network sequence.

### Challenge, redirect, session, and header findings

One unauthenticated GET using the app's query contract and Accept value reached the fixed real endpoint. Only safe metadata was emitted:

| Observation | Result |
| --- | --- |
| HTTP status | 401 |
| WWW-Authenticate present / recognized scheme | Yes / Basic; realm and complete header were not output. |
| Set-Cookie present | No |
| Redirect destination | None; no 3xx occurred. |

The initial sandbox transport could not connect; the single transmitted probe ran outside that network isolation. No Authorization was sent, no response body was retained, and there were zero real authenticated app attempts. This confirms Basic is advertised for an unauthenticated app-shaped request. It does **not** establish a required challenge/retry, a successful auth scheme, cookie behavior after authentication, or redirects in the successful QGIS flow. No header differential comparison was possible without that reference. No QGIS headers were copied speculatively.

### Earlier handoff (superseded by Vercel diagnosis below)

At this earlier stopping point, the cause was unknown and no upstream protocol workaround was justified. The subsequent Vercel diagnosis below resolves the apparent authentication failure without changing Gemini protocol behavior. Fixed destination restrictions and redirect rejection remain unchanged.

The only production change in this run is authentication error wording: the relevant UI and service error now say `Gemini WFS-tjenesten avviste autentiseringen. Årsaken er ikke avklart.` The server's safe English error also names Gemini WFS. This removes the unsupported instruction to check the password. Other existing Gemini VA labels are recorded for M7 cleanup and were not broadly changed.

Collect the following **non-secret information from the successful connection on the main work PC** before attempting a protocol fix:

1. QGIS version and selected WFS version (including whether automatic negotiation is selected).
2. Direct Basic tab versus a saved Authentication Configuration; if configured, only the authentication method, such as Basic, OAuth2, or NTLM. Do not provide usernames, passwords, config exports, tokens, or Authorization.
3. Safe operation sequence and request metadata: GetCapabilities, DescribeFeatureType, GetFeature (or other preflight); method; origin/path; allowlisted WFS parameter names/values and ordering; `TYPENAME` versus `TYPENAMES`; SRSNAME and BBOX syntax; any operation URL advertised by capabilities.
4. Response statuses in sequence; challenge scheme only; cookie presence booleans; redirect destination origin/path only. Establish whether authentication is preemptive, challenge-based, or managed by a saved/system authentication flow. Do not export a HAR, complete headers, cookie values, or auth data.
5. For one failed app attempt, safe local response code and upstream status only, to establish route acceptance/fetch/401/mapping directly. Reuse existing private credentials if available; do not capture or request their values.

The earlier handoff asked for main-PC metadata before retrying. That metadata has now arrived and establishes the Vercel boundary failure. The current next step is to redeploy the browser credential-mode correction and retest **Hent eksisterende anlegg** through the authenticated protected-preview browser session. Setting up WFS on the backup PC is unnecessary for this fix.

### Regression coverage and validation

- `node --test tests/wfsProxyHandler.test.mjs tests/wfsProxyPolicy.test.mjs tests/geminiClient.test.mjs tests/geminiWorkflowUi.test.mjs tests/geminiSession.test.mjs`: **73 passed, 0 failed, 0 skipped**. Includes the new independent byte vector, route-level upstream-401 mapping, request destination/origin restrictions, safe errors, redirect rejection, and private session lifecycle.
- Synthetic `tests/geminiWorkflowBrowser.test.mjs` with `GEMINI_WORKFLOW_SCREENSHOT_PATH` removed: **16 passed, 0 failed, 0 skipped**, including parent. Uses local fixtures and invented credentials. An initial run found a remaining old-message assertion and a dependent timeout; both were resolved by updating that assertion, and the complete rerun passed.
- Focused ESLint for the six changed JavaScript/MJS files: passed with no output/errors. `git diff --check`: passed.
- No parser, MIME compatibility, map, popup, photo, topology, validation/matching, dependency, or deployment behavior was changed. A production build and full repository suite were not rerun for the wording/test changes.

## Vercel Deployment Protection correction

Current continuation, 2026-10-30. **Root cause established from user-supplied main-PC evidence: Vercel Authentication rejected the API request before Next.js/M1 executed because the browser fetch explicitly omitted its same-origin deployment session cookie.** This section supersedes the earlier unresolved-authentication handoff. It does not invalidate earlier authenticated Gemini responses obtained directly or on the backup PC.

### Decisive evidence supplied from the main work PC

| Request | Result |
| --- | --- |
| Fresh QGIS connection using the same Gemini account | Works |
| Challenge-based Basic GetCapabilities | HTTP 200 |
| Preemptive Basic GetCapabilities | HTTP 200 |
| Direct preemptive GetFeature, `gemini:VA_MPNT` | HTTP 200 |
| Direct preemptive GetFeature, `gemini:VA_LINE` | HTTP 200 |
| Exact app-shaped VA_LINE request, BBOX `[579939, 6565821, 580300, 6566150]` | HTTP 200 |
| Exact app-shaped VA_MPNT request, same BBOX | HTTP 200 |
| PowerShell POST to protected preview `/api/gemini-wfs` | HTTP 401, `application/json`, message `Protected by Vercel Authentication` |

The tested preview was `https://gmi-validator-fo9f74wkt-paul-bennetts-projects.vercel.app`. These are user-reported main-PC results; this continuation did not repeat real authenticated service calls or inspect credentials. The exact Gemini endpoint remains `https://faerder.geminisuite.com/portal/api/proxy/map/va-basis.wfs`.

Gemini authentication, preemptive Basic, endpoint, WFS version/query contract, both feature types, and the exact app BBOX are confirmed working by those direct comparisons. A Gemini challenge/session/redirect workaround is unnecessary. The exact successful QGIS network sequence is not needed to fix this independently established deployment boundary failure.

The page could load with a valid browser Vercel session, while the API fetch's `credentials: 'omit'` withheld that session cookie. Vercel intercepted the POST. Gemini credentials in the JSON body could not authenticate the request at that boundary, and M1 never contacted Gemini for that exchange. The client maps a bare 401 to `authentication_failed`, which explains why the UI appeared to blame Gemini. **The main-PC browser 401 must not be recorded as a confirmed upstream Gemini authentication failure.** Existing M1 tests of actual upstream-401 mapping remain valid for genuine provider failures.

### Minimal fix and security review

`src/lib/gemini-wfs/geminiClient.mjs` now explicitly uses `credentials: 'same-origin'` for the fixed relative `POST /api/gemini-wfs`. This allows the browser to send its same-origin app/deployment session cookie to the app's protection boundary. `cache: 'no-store'`, `redirect: 'error'`, the JSON contract, and private Gemini credential lifecycle are unchanged.

The outgoing server request is independently constructed and unchanged: fixed HTTPS Gemini endpoint, GET, request-local UTF-8 Basic from JSON credentials, fixed Accept, manual redirects, no browser Cookie/Authorization forwarding, no session/cookie jar, and no persistence. Its explicit header set contains only `Authorization` and `Accept`; changing the browser's credential mode does not copy incoming request headers into that set. No Vercel cookie is sent to Gemini. The request-local Basic construction was already correct and was not modified.

M1's origin and CSRF policy remains intact, including strict production same-origin validation and the existing narrow development loopback exception. Hostile/missing/cross-site origins remain rejected before any upstream fetch. No CORS permissions, redirect allowances, proxy destinations, or shared request utilities changed. WMS behavior is unchanged; its policy regressions were run as an additional check.

The previously touched authentication error strings use **Gemini WFS** / **Gemini WFS-tjenesten** and do not instruct the user to correct a presumed bad password. This continuation changes no UI labels. Remaining untouched legacy labels are a later M7 cleanup item; no broad terminology rewrite was performed.

### Regression coverage and results

- Browser-client unit contract now requires explicit `credentials: 'same-origin'` for both fixed API POSTs, while retaining JSON-only Gemini credentials and no client-created Cookie/Authorization header.
- M1 line/point regressions supply invented `_vercel_jwt` and app-session cookies plus incoming Authorization. They verify only the server-created Basic and fixed Accept reach the fixed Gemini endpoint, with no incoming Cookie/Authorization forwarded. The independent synthetic UTF-8 byte test remains passing.
- Added a native Chromium regression to the M3 harness with a local HttpOnly session cookie and simulated deployment gate. An explicit `omit` control receives 401 before M1. The actual corrected client then sends its two same-origin requests through the gate and real M1 handler to an injected synthetic Gemini transport; parsing/display succeeds with one line and one point. Exactly one gate rejection and two upstream calls are asserted. The outgoing header set excludes the incoming cookie. This tests real browser cookie behavior without Vercel access, real credentials, or real Gemini requests.
- M5 workflow browser audit now verifies the same-origin credential mode through the normal native form, alongside existing credential/privacy, refresh, disconnect, error, and WMS-form isolation checks.
- Existing hostile-origin and forwarding-header-spoofing tests remain unchanged and pass.

Commands and final results:

```powershell
node --test tests/geminiClient.test.mjs tests/wfsProxyHandler.test.mjs tests/wfsProxyPolicy.test.mjs tests/geminiSession.test.mjs tests/geminiStoreLifecycle.test.mjs tests/geminiWorkflowUi.test.mjs tests/wmsProxyPolicy.test.mjs
```

**100 passed, 0 failed, 0 skipped.** Existing module-type and unavailable-localStorage harness warnings remain.

```powershell
@'
delete process.env.GEMINI_WORKFLOW_SCREENSHOT_PATH;
await import('./tests/geminiServiceBrowser.test.mjs');
await import('./tests/geminiWorkflowBrowser.test.mjs');
'@ | node --input-type=module
```

**26 passed, 0 failed, 0 skipped**, including parent tests. Synthetic only; screenshots disabled. Combined selected Node/browser result: **126 passed**.

```powershell
node node_modules/eslint/bin/eslint.js src/lib/gemini-wfs/geminiClient.mjs src/lib/gemini-wfs/geminiErrors.mjs src/lib/gemini-wfs/geminiWorkflowUi.mjs src/lib/gemini-wfs/wfsProxyPolicy.mjs tests/geminiClient.test.mjs tests/wfsProxyHandler.test.mjs tests/geminiWorkflowUi.test.mjs tests/geminiWorkflowBrowser.test.mjs tests/browser/geminiWorkflowApp.js tests/geminiServiceBrowser.test.mjs tests/browser/geminiServiceChecks.mjs
npm.cmd run build
git diff --check
```

Focused ESLint and diff checks passed. Production build passed (Next.js 16.1.6, TypeScript checks, eight generated pages; WFS/WMS API routes remain dynamic). Existing outdated Browserslist notice remains. No dependency/font/configuration changes were needed. The full repository suite was not run.

### Next acceptance step

**Redeploy the protected preview with this change, open the resulting preview in the normal Vercel-authenticated browser session, and retry Hent eksisterende anlegg.** Use the existing application form; do not send credentials to this agent or export a HAR/auth headers. Confirm both API requests reach M1 and return successful line/point results, then record safe aggregate counts and map behavior. This correction is locally validated, but hosted protected-preview acceptance and full M7 acceptance remain pending. No deployment was made by this run, and no topology/matching/validation work was started.

## Hosted acceptance and presentation closeout

Date: **2026-10-30**. Starting checkpoint: **`8266e5a` — Fix Gemini WFS access on protected previews**, branch `feature/photo-workspace`, initially clean worktree. The user supplied the following completed hosted acceptance on the main work PC. These are manual user observations, not new real-service requests performed by this agent:

| Hosted check | Verified evidence |
| --- | --- |
| Protected Vercel preview | Normal browser workflow succeeds after explicit same-origin credential correction. The earlier 401 was Vercel interception before M1, not a Gemini rejection. |
| Browser credential storage/autofill | Browser password-manager storage and autofill work. Application credential persistence remains prohibited and absent. |
| Real result | **461 lines and 329 points**. |
| Line rendering | Real lines render with correct apparent geographic alignment. |
| Point rendering | Real points render with correct apparent geographic alignment. |
| Line inspection | Real curated line popup works, including sensible type/nettype/dimension/material/year/status/owner/responsible/length/ID fields. |
| Point inspection | Real curated point popup works; source geometry elevation and attributes such as COVER_Z remain distinct. |
| Disconnect/reconnect | Works; reconnect returns the same **461 / 329** counts. |
| Domain separation | Gemini reference data remains separate from normal GMI/SOSI survey data. Browser/Vercel credentials are not forwarded to Gemini. |

Hosted refresh, independent visibility, zoom, and the new halo/selection appearance were **not reported as manually checked**. Their functional behavior is covered by automated browser/session tests. The new styling was reviewed on a local synthetic screenshot without a basemap; its appearance against both hosted Kartverket basemap variants is a follow-up visual check, not an asserted manual acceptance result.

### Presentation decisions

Inspected `MapInner.js` and `map/layerHighlight.mjs` before changing Gemini. Survey line rendering separates primary strokes from casings; white-filled point symbols receive matching source halos; cyan and increased size identify selection. Survey halo colours are assigned per imported layer from a palette, not intrinsically fixed by GMI/SOSI format. That palette and all survey rendering remain unchanged.

Reserved **indigo `#4338CA`**, opacity **0.55**, spread **4**, as `GEMINI_WFS_HALO` in the existing shared halo module, outside the survey automatic palette. This avoids the validation red/amber/green family and distinguishes Gemini from ordinary survey defaults. Users can still manually choose custom survey colours; uniqueness against every custom colour is not claimed. The source card repeats the same indigo swatch. Dark navy primary geometry and opaque white-filled points provide contrast independently of the halo; translucent casing and pane 380 keep the reference below survey casing/vectors/markers.

Gemini uses the existing `getLineCasingStyle` and `getPointHaloSpread` helpers, with paired Leaflet GeoJSON/SVG layers. Lines are 3 px with 7 px source casing at rest; white-filled circle points have 6 px radius with a larger halo. No speculative FCODE classification or validation semantics were introduced. Hover increases weight/size. Selection uses the survey cyan treatment with greater width/radius while retaining the indigo source halo. Halo paths also provide a wider click target. All paths honor existing tool suppression, and selection follows the owned popup rather than survey-store highlight state.

Independent line/point toggles, zoom, refresh and disconnect retain their existing design. Hiding a side removes its primary and halo together, closes its popup, preserves the other side's nodes, and does not change source records, imported surveys, or request counts. Switching inspection, popup close, result replacement, tool changes and disconnect clear owned selection appropriately. Curated popup fields and geometry Z/COVER_Z handling are unchanged.

All user-visible integration occurrences of Gemini VA in the dedicated WFS components, error mappings and popup provenance now say **Gemini WFS**. Related test expectations were updated. Stable `gemini-va-*` internal DOM IDs were retained to avoid unnecessary autofill/form-identity changes. Genuine references to the separate Gemini VA program in application information, SOSI history and validation documentation were preserved.

### Architecture and safety

No survey `addLayer()` insertion, store mutation, matching, topology, validation, snapping, photo work or new data domain was introduced. Rendering receives the existing immutable display/source pair and uses effect-local hover/selection only. The shared survey halo module only gains an exported constant; existing functions/palette are unchanged. `MapInner.js`, survey store, parser/projection, client/session, WFS proxy/policy and request construction have no diff from checkpoint `8266e5a`.

Therefore fixed endpoint/types, WFS 2.0.0, strict BBOX/100 m buffer/EPSG:25832, GML 3.2 featureMembers, guarded text/html compatibility, limits/no redirects, atomic publication/stale-request handling, same-origin browser fetch, server-only request-local Basic, no cookie/Authorization forwarding, session-only Gemini credentials, and origin/CSRF protections are preserved and regression-tested.

### Final validation

- **259 Node tests passed, 0 failed, 0 skipped**, across 21 files: all nine non-browser `gemini*.test.mjs` suites plus WFS proxy/policy/MIME, line styles, hover tooltip, layer halo/panel/order/presentation, map pane/background controls and WMS policy. A subsequent 27-test rerun of the three edited presentation/UI/popup unit suites passed; those overlapping results are not added to 259.
- **91 browser tests passed, 0 failed, 0 skipped**, including parents, across `geminiReferenceBrowser`, `geminiPopupBrowser`, `geminiWorkflowBrowser`, `geminiServiceBrowser`, and `geminiGmlBrowser`. Includes native Vercel-cookie-gate regression, form/autofill/privacy, both actual-pointer popups, local selection and restore, tool suppression, unchanged survey/photo interactions, visibility isolation, zoom, refresh/atomic replacement, disconnect and 2000-line/2000-point synthetic rendering.
- Final synthetic render timings: 267 lines / 162 points in **550 ms**, cap-sized 2000 / 2000 in **1148 ms** on this PC. These are local single-run observations, not hosted performance guarantees.
- Initial browser runs exposed an outdated expected navy colour and a test fixture point covered by its popup. Corrected the token expectation, exercised cross-side selection through its Leaflet event while retaining separate actual-pointer tests, and waited for outgoing popup fade completion. Final complete browser run passes.
- Focused ESLint on all changed JS/MJS files passed. No unrelated MapInner lint debt was changed.
- `npm.cmd run build` passed: Next.js 16.1.6 compiled, TypeScript checks and eight static pages completed; API routes remain dynamic. Existing Browserslist-age notice and Node test module-type/localStorage harness warnings remain.
- `git diff --check` passed; branch/status reviewed. Combined distinct selected coverage: **350 passed**. Full repository suite not run. Synthetic screenshot reviewed locally; no real credentials, saved authentication values, real municipal payload, or authenticated browser trace was inspected/exported.

**Closeout:** requested M7 presentation implementation and local validation are complete; real hosted fetch/map/popup/reconnect acceptance is recorded. New presentation can be checked after deployment, especially against both Kartverket basemaps and for hosted refresh/visibility/zoom. No commits, pushes or deployment were made. Stop here; photo support is the user's next intended task and was not started.

## Correction after hosted review of 7002c71

**The preceding presentation closeout is superseded.** Hosted checkpoint `7002c71 Polish Gemini WFS map presentation` failed visual acceptance: Gemini pipe foregrounds appeared effectively uniform/dark, normal semantic VA colouring was lost, and marking was fixed rather than participating in existing Lagmarkering. The previously verified hosted WFS fetch, 461-line/329-point counts, alignment, curated popups, browser autofill and reconnect evidence remains valid. **No hosted acceptance of the corrected presentation is claimed.**

### Shared presentation implementation

The correct boundary is now `independent Gemini records/session -> presentation input/source settings -> shared survey presentation`, without survey insertion:

1. Moved the original colour/category functions, dimension-width function and SVG point renderer from `MapInner.js` to `src/lib/map/semanticPresentation.mjs`. Both MapInner and Gemini call `getSemanticLineStyle` and `getSemanticPointSymbol`. Existing survey semantic colours, width scaling, dashed variants, symbol silhouettes, point halos, white fills and cyan selection therefore have one implementation. Existing legend exports remain compatible. No second Gemini colour/symbol table exists.
2. Added `geminiPresentationAdapter.mjs`, returning only `{ S_FCODE, DIM }` from source attributes. Canonical existing codes and reliably recognized Norwegian titles map to existing presentation inputs. Supported title families include Vannledning, Spillvannsledning, Overvannsledning, Drensledning and Avløp felles; point titles include Kum/Avløpskum/Vannkum/Spillvannskum/Overvannskum, Kumlokk, Sluk and Sandfang. Numeric provider lookup IDs are not treated as survey codes. Unknown/ambiguous titles and missing/nil attributes use the existing unknown/default treatment; NETTYPE does not infer a physical point shape. Source values are not rewritten.
3. Deleted the Gemini navy/circle/hover/selection style functions. Gemini's inspection layer is now glue for shared Leaflet line styles and SVG marker output, preserving source lookup, curated popup ownership, selection and tool suppression. Line casings use `getLineCasingStyle`; point halos come from the same point SVG renderer as survey markers. Selected marker stacking uses the shared ordering helper within the independent reference pane.
4. Generalized the existing `LayerHighlightControls` to accept source/settings and action callbacks. Survey controls retain their original store callbacks and ordering controls. Gemini appears in the **same Lagmarkering panel and control component** using only its own presentation-state callbacks. No Gemini marking panel or fake survey layer was added. External-source reordering is absent because its reference pane remains below survey geometry.
5. Added a session-scoped presentation source identity/settings object in `geminiReferencePresentation.mjs`. Indigo remains its initial/default marking colour, not a fixed style. Enable/disable, colour, strength, width and reset use the existing controls, style normalization, casing and point-halo helpers. Colour/strength/width affect only marking. Ordinary same-owner refresh preserves settings; disconnect/owner changes reset them. The source-card swatch reflects the selected marking colour. Visibility remains independently controlled for lines and points.

The shared slider draft now reconciles reset/source value changes during render rather than synchronously setting state in an effect; release/keyboard/blur commit behavior is retained. This removes the existing panel lint error encountered while making the controls reusable. MapInner's unrelated lint baseline is preserved.

### Preservation and tests

Survey store, Gemini fetch/client/session, parser/projection, WFS protocol/security and credential behavior have **no diff** from `7002c71`. Gemini never goes through survey `addLayer()`, validation or analysis. Presentation state contains no data records or credentials and is not persisted. No photo, matching, topology, snapping, comparison or automatic correspondence work was introduced.

- **267 Node tests passed, 0 failed/skipped**, across 22 files. Includes all ten non-browser Gemini suites, the new semantic-reuse suite, existing line/hover/halo/panel/order/presentation/map controls and WFS/WMS security/MIME tests.
- **92 Chromium browser tests passed, 0 failed/skipped**, including parents, across the five Gemini reference/popup/workflow/service/parser suites. Existing line/point visibility, zoom, refresh, replacement, disconnect, tool suppression, protected-cookie behavior and actual-pointer popups remain passing.
- New browser control coverage operates the existing Gemini Lagmarkering row: colour, strength and width change casing; semantic selected colour remains unchanged; disabling removes point halos and makes line casing invisible; reset retains disabled state; enabling restores marking. The popup survives these changes, no requests are added, and Gemini dataset and imported survey identities remain unchanged. Hover and selection restore their shared base styles after moving away/closing.
- Parameterized equivalence tests verify water/wastewater/stormwater/drainage lines and supported point inputs against equivalent survey inputs, unknown fallback, dimension scaling and marking independence. Existing source-location assertions now follow the extracted point renderer instead of requiring inline code in MapInner.
- A direct one-off comparison against the actual `7002c71` renderer verified identical **198 point-symbol combinations**, **10 line-width cases**, and colour/category outputs. This avoids maintaining copied SVG fixture tables. The selected distinct test total is **359 passed**.
- Focused ESLint passed on all changed/new JS/MJS except the separately audited MapInner baseline. Before/after: **8 existing react-hooks/refs errors, 3 dependency warnings, 1 unused-suppression warning**, with no new diagnostics after ignoring moved line numbers. No unrelated MapInner lint repair.
- `git diff --check` passed; branch remains `feature/photo-workspace`. No commit/push/deployment.

Node validation selected all `tests/gemini*.test.mjs` excluding `*Browser*`, plus `wfsProxyHandler`, `wfsProxyPolicy`, `wfsMimeCompatibility`, `lineStyle`, `featureHoverTooltip`, `layerHighlightHalo`, `layerHighlightPanel`, `layerOrder`, `layerPresentation`, `mapPaneToolbar`, `mapBackgroundControl`, and `wmsProxyPolicy`. Browser validation imported `geminiReferenceBrowser`, `geminiPopupBrowser`, `geminiWorkflowBrowser`, `geminiServiceBrowser` and `geminiGmlBrowser` with all optional screenshot environment variables removed. All service responses and credentials in these tests are synthetic. The full repository suite was not run.

### Production build and remaining acceptance

`npm.cmd run build` was run twice outside network isolation. Both attempts failed downloading the existing Roboto CSS from Google Fonts (`next/font` / `fonts.googleapis.com` connection failure). A direct Node fetch of the same public CSS timed out, and a Windows HTTP probe also failed. No proxy settings were present. **The production build is not passed for this correction**; this is an observed external font-download failure; no application compile error was reported. Font configuration/dependencies were not changed or mocked to bypass it. The browser bundles/tests and focused lint succeeded; production build must be rerun when that public font endpoint is reachable.

Remaining: rerun the production build, redeploy, and visually review semantic water/wastewater/stormwater colours, equivalent point symbols and all Gemini controls in the existing Lagmarkering panel against the hosted basemaps. Earlier hosted data acceptance remains established, but **corrected presentation acceptance is pending**. Work stops here without committing/pushing or starting the next milestone.

## Hosted review of fbaf556: hover and default-marking correction

Starting checkpoint: **`fbaf556 Integrate Gemini WFS with shared map presentation`**, branch `feature/photo-workspace`, initially clean. The user now confirms the hosted shared presentation looks good: Gemini lines have normal semantic VA colours, points use shared symbols, Gemini appears in the existing Lagmarkering panel with colour/strength/width controls, and optional source marking distinguishes the source without replacing foreground colours. This supersedes the earlier pending review of the shared-renderer correction. Previous real-service counts and acceptance evidence remain unchanged.

Two final hosted issues were reported: missing lightweight mouse-over identification and marking enabled by default. Both are corrected locally; **final hosted acceptance is still pending redeployment and verification of these two changes**.

### Shared hover integration

- Passed the existing map-wide `hoverControllerRef` through the Gemini reference layer to both inspection sublayers. Gemini does not construct another tooltip, timer/controller, CSS style or formatter. The existing `FeatureHoverTooltip`, `createFeatureHoverController`, 500 ms delay and `gmi-compact-hover-*` markup remain the common mechanism across survey and reference objects. At most one tooltip is active; quick transitions replace/cancel pending hover using the existing controller.
- Extended the existing presentation adapter with canonical tooltip fields: Dimensjon, Type, Bredde, Material, Anleggsår, Eier and Status, based on the corresponding M2 text fields/title fallbacks. Formatting is exclusively `getFeatureHoverLabel`, including missing-value handling, precision and zero values. This does not change semantic classification, source records or curated click-popup fields, and does not expose geometry Z as a cover elevation.
- The existing tooltip colour resolver accepts an optional presentation source. Gemini provides its current settings through a getter; it does not impersonate a survey `_layerId` or insert a source into the survey store. As with ordinary layers, the source dot can use the configured source colour even while marking is off.
- Line anchors use the hover location; points use their centre. Leaving a feature, hiding/removing/replacing a sublayer, tool suppression and effect teardown cancel that source's pending/visible hover. Existing map-movement cancellation remains shared. Clicking Gemini cancels hover before opening the unchanged curated popup. Cleanup captures the controller used by that effect, avoiding teardown against a changed ref.

### Optional marking default

`DEFAULT_GEMINI_MARKING.highlightAll` is now **false**. Semantic line strokes and point symbols remain visible with no point halo and zero-opacity line casing. Indigo remains the default configurable marking colour. Enabling marking uses the same existing Lagmarkering controls and shared renderers; colour, strength, width and reset behave as before. Same-owner refresh preserves either current on/off choice and settings. Disconnect, reconnect and source/session-owner changes return to marking off. Ordinary GMI/SOSI defaults and settings are unchanged.

### Validation

- **269 Node tests passed, 0 failed/skipped**, across 22 selected files: all ten non-browser Gemini suites plus shared tooltip/line/halo/panel/order/presentation/map-control and WFS/WMS policy/MIME tests. New checks prove adapter-to-shared-hover equivalence for both geometry kinds, generic external-source colour resolution, off-by-default, retained on/off refresh settings and reset to off after clear/reconnect/new owner.
- **94 browser tests passed, 0 failed/skipped**, including parent tests, across all five Gemini browser suites. New real-pointer tests verify delayed line and point hover labels, one tooltip, inert content, unchanged request count/dataset/survey selection, click popup after hover, tooltip cancellation during measurement and ordinary survey hover. Existing privacy, session, visibility, zoom, refresh, reconnect, curated popup and tool-priority checks pass. Browser checks confirm semantic geometry remains visible without marking, and manual enablement restores working colour/strength/width controls.
- After the cleanup-ref lint adjustment, the focused hover/popup suite was rerun on the final code: **15 passed**, overlapping the 94 above. Distinct selected total: **363 passed**. Full repository suite not run.
- Focused ESLint passed with **0 errors/warnings** for all changed JS/MJS outside MapInner. MapInner's before/after baseline remains **8 existing ref errors and 4 warnings**, with no new diagnostics; unrelated lint debt was not changed.
- **Production build passed**, including a final rerun after the cleanup adjustment: Next.js 16.1.6 compiled, TypeScript checks completed, all eight static pages generated, API routes stayed dynamic. Google Fonts was reachable during this continuation; previous build failures remain historical. No font configuration was modified. Existing Browserslist-age notice remains.
- `git diff --check` passed. Survey store, semantic renderer, Gemini client/session, parser/projection, WFS policy/proxy and fetch/auth/security behavior are unchanged. No app credential persistence, real-service diagnostic requests, screenshots or authenticated traces were added.

Node selection and browser commands follow the preceding correction: all non-browser `gemini*.test.mjs` plus the twelve shared/security suites listed there; browser imports `geminiReferenceBrowser`, `geminiPopupBrowser`, `geminiWorkflowBrowser`, `geminiServiceBrowser` and `geminiGmlBrowser`, with optional screenshot variables removed. Build: `npm.cmd run build`. Focused lint used all changed JS/MJS files excluding the separately baseline-compared MapInner.

**Remaining:** redeploy and verify real Gemini line/point hover tooltips and default-off marking, including manual enablement. The hosted semantic-renderer/Lagmarkering review is established; final hosted acceptance of these two corrections is not claimed. No commit, push, deployment, photo work, matching, topology or comparison work was performed.
