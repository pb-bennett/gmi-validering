# Gemini VA WFS M7: real-service acceptance

Date: 2026-10-29. **Status: guarded MIME compatibility is implemented using the shared strict M2 parser and a dedicated Node XML DOM adapter. The earlier origin and sole `featureMembers` fixes are preserved. Prior diagnostic evidence established 1,201 real lines; normal-path line/point/map acceptance still requires manual reimport/login. M7 remains incomplete pending that user action. M8/topology/validation work has not started.**

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
