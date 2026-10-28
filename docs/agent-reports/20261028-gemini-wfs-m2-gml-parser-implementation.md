# Gemini VA WFS M2: narrow GML source/display adapter

Date: 2026-10-28  
Scope: M2 only from [the integration plan](20261028-gemini-wfs-integration-planning.md)

## Starting state and compatibility

Starting branch: feature/photo-workspace. Starting HEAD: 025bada5590fb991bbda5c7f7d8fe3e4576d0bb9 (Add restricted Gemini WFS proxy foundation). The worktree was clean. No unrelated user changes needed preservation. No branch switch, commit or delegation occurred.

Read the integration plan and [M1 completion report](20261028-gemini-wfs-m1-proxy-implementation.md). Inspected terrainPhotoGml.mjs, photoSpatial.mjs, coordinateProjection.js, normalizeFeature.js, survey parser coordinate handling, existing browser/CDP tests and M1 policy. M2 consumes an XML string decoded from M1's raw response and requires no M1 request-contract or backend change.

The user confirmed the exact feature namespace from the service XSD during this pass: **http://www.powel.com/gemini**. It is encoded explicitly, not inferred from a prefix or remote schema. No XSD or service request was made.

## Files added

| File | Role |
| --- | --- |
| [src/lib/gemini-wfs/parseGeminiGml.mjs](../../src/lib/gemini-wfs/parseGeminiGml.mjs) | Browser DOMParser source adapter, fixed namespace/profile, safe errors, limits and field accessors. |
| [src/lib/gemini-wfs/geminiMapFeatures.mjs](../../src/lib/gemini-wfs/geminiMapFeatures.mjs) | Separate strict WGS84 XY display projection. No Leaflet/UI integration. |
| [tests/geminiGmlParser.test.mjs](../../tests/geminiGmlParser.test.mjs) | Six Node-side contract, safety and error tests. |
| [tests/geminiGmlBrowser.test.mjs](../../tests/geminiGmlBrowser.test.mjs) | Actual Chrome/CDP browser test entry using the existing harness. |
| [tests/browser/geminiGmlChecks.mjs](../../tests/browser/geminiGmlChecks.mjs) | 33 browser cases against native DOMParser and real proj4. |
| [tests/fixtures/gemini-wfs/syntheticProfile.mjs](../../tests/fixtures/gemini-wfs/syntheticProfile.mjs) | Synthetic WFS envelopes, points, lines and fields; no municipal extract. |
| [tests/fixtures/gemini-wfs/README.md](../../tests/fixtures/gemini-wfs/README.md) | Fixture provenance and profile boundaries. |
| This report | Contract, decisions and validation evidence. |

No pre-existing tracked file has a final content change. Temporary CDP diagnostics in tests/helpers/chromeHarness.mjs were removed and original contents/line endings restored. M1, photo/survey parsers, normalization, map helpers, UI, dependencies and deployment configuration remain unchanged.

## Parser contract

parseGeminiGml(xml, { parseXml } = {}) accepts a string, defaults to native browser DOMParser and returns an immutable source result. parseXml is an injection seam for tests, not a server parser implementation. Without native DOMParser or an injected implementation, it throws xml-parser-unavailable.

The result contains:

- connectionId: fixed faerder-va-basis, consistent with M1.
- featureNamespace and sourceCrs: the confirmed namespace and EPSG:25832.
- records: immutable feature records in member order.
- counts: actual members, records, lines, points and source coordinate tuples.
- envelope: optional source collection-envelope evidence.
- xmlAttributes: non-xmlns collection attributes, retaining metadata text without trusting it for counts.

numberReturned=0 and numberMatched=unknown have no effect on actual member/record counts. A genuinely empty WFS collection returns empty records and zero counts. No paging, completeness, query or WFS COUNT behavior is implemented. GML posList count, if supplied, is only checked for consistency with that geometry's tuple count.

## Namespace, XML and profile decisions

- WFS namespace is http://www.opengis.net/wfs/2.0; GML namespace is http://www.opengis.net/gml/3.2; feature namespace is http://www.powel.com/gemini. Element matching uses namespaceURI/localName. All prefixes may change, including the use of a default namespace for features.
- Require WFS FeatureCollection, optional version exactly 2.0.0, direct wfs:member children with exactly one confirmed VA_LINE/VA_MPNT feature, and optional gml:boundedBy. Nested collections, links instead of features, multiple features per member, non-whitespace structural text and other root/member children fail explicitly.
- OWS ExceptionReport in the unversioned, 1.1 or 2.0 OWS namespace is a service-exception, including when placed inside a member. Provider text is not reflected in errors.
- Malformed XML/native parsererror is invalid-xml. DOCTYPE and ENTITY are rejected before DOMParser. Processing instructions are rejected after parsing. Native DOMParser is used as XML only; there is no innerHTML, evaluation, document insertion, schema validation or external URL resolution.
- schemaLocation and scalar URLs remain inert source text. No fetch, image loading, external schema resolution or credentials appear in the production modules.
- Optional root/feature gml:boundedBy supports a single Envelope with lowerCorner/upperCorner. Envelope coordinate text, dimension and XML attributes are retained. Envelope CRS can supply a missing declaration; its sibling dimension is not incorrectly inherited by geometry.

This is a value/evidence-preserving adapter for the confirmed profile, not a byte-for-byte XML round trip. XML comments, prefix choices and namespace declaration syntax are not a serialization contract. Native XML line-ending/entity normalization occurs; scalar text, raw coordinate text, declared metadata, numeric coordinate values and arity remain available.

## Source geometry and identity

VA_LINE requires exactly one GEOMETRY/LineString/posList. VA_MPNT requires exactly one GEOMETRY/Point/pos. Polygon, multipart/curve geometries, legacy coordinate encodings and repeated-pos lines are deliberately unsupported. Unsupported geometry fails the response rather than disappearing from it.

Every source feature has:

| Property | Meaning |
| --- | --- |
| key | Collision-safe JSON tuple of connection ID, namespace URI, feature local name and gml:id. |
| gmlId | Exact required nonempty GML ID, independent of record index. |
| typeName | Canonical gemini:VA_LINE or gemini:VA_MPNT label; independent of the XML prefix spelling. |
| featureNamespace / sourceCrs | Explicit semantic namespace and normalized EPSG:25832. |
| idField / objectId | LSID or PSID and its raw text when present/non-nil; the full field state remains in attributes. |
| attributes | Scalar field records keyed by the original local field name. |
| geometry | Source type, XY/XYZ tuples, dimension, original coordinate text, encoding, CRS/dimension declarations and XML attributes. |
| xmlAttributes / envelope | Feature-level attributes and optional source envelope evidence. |

Duplicate GML IDs fail globally within a collection, including across line/point records. Missing/blank IDs fail. Leading-zero object IDs/codes are never converted into numbers for identity. Geometry is explicitly an internal EPSG:25832 structure, not mislabeled geographic GeoJSON.

Coordinate order and every intermediate line vertex are preserved. XY stays XY; XYZ stays XYZ. Literal zero, negative zero, nonzero and partially populated legacy line Z survive unchanged. There is no elevation-quality interpretation, interpolation, clipping, simplification or Z padding. COVER_Z stays an independent scalar field and never replaces geometry Z, or vice versa.

## Scalar/null/nil/empty handling

Each present scalar field holds state, rawText and xmlAttributes:

- absent: no stored field; getGeminiField returns an immutable absent descriptor with rawText=null.
- nil: xsi:nil=true or 1; raw text/attribute spelling retained. Contradictory non-whitespace content fails.
- empty: present element with exactly empty text. Whitespace-only text is retained as text rather than silently collapsed.
- text: exact parsed string, including numeric-looking values, leading zeros, Unicode, whitespace, literal zero and FunctionResult fields.

xsi:nil=false/0 and xsi:type metadata are retained as XML attributes. Unknown same-namespace scalar fields are preserved inertly. Duplicate fields, nested scalar structures or foreign-namespace fields are rejected rather than flattened/dropped. Object.fromEntries plus own-property lookup safely retains names such as __proto__ without prototype lookup/pollution.

getGeminiNumericValue is an optional derived accessor: finite decimal/exponent text becomes a number; absent/nil/empty/whitespace/invalid numeric values return null. Raw field values stay intact. No Number(null)/Number(empty text) coercion occurs, and zero is not globally treated as missing.

## CRS and dimension handling

Accepted equivalent CRS spellings include EPSG:25832, urn:ogc:def:crs:EPSG::25832 and HTTP(S) www.opengis.net/def/crs/EPSG/0/25832. Raw declarations remain evidence. Missing geometry-local CRS can inherit from explicit ancestors or collection/feature envelopes. All relevant declarations must agree; unsupported/invalid CRS and conflicting declarations are explicit errors. No request-default or identity fallback is invented when all declarations are missing.

srsDimension may be explicit or inherited along the ancestor chain. Only 2/3 is supported and all declarations must agree. A single Point/pos can resolve undeclared dimension from its unambiguous 2/3 ordinate arity. A LineString/posList requires explicit/inherited dimension; divisibility alone never guesses XY or XYZ, even if only one division looks plausible. Ordinate counts, minimum line length and optional posList count must agree. Numeric lexemes reject NaN, Infinity, hex, comma-separated values and invalid tokens.

## Display adapter

buildGeminiMapFeatures(parsed, { project = proj4 } = {}) returns an immutable WGS84 GeoJSON FeatureCollection with Point [lon,lat] or ordered LineString [lon,lat] tuples. It reuses existing proj4 definitions by importing coordinateProjection.js for registration, while calling proj4 directly and strictly. It never uses that module's permissive map fallback or photo-only projection function.

Projection receives copied XY arrays. Invalid/nonfinite/out-of-range results or projector exceptions become invalid-display-projection, without exposing exception detail. Source tuples and their Z values are not mutated, even by an injected mutating projector. Display properties contain only kind, sourceKey and typeName; attributes/elevations remain in the source records for later lookup. No Leaflet instance, map layer or UI integration is created.

The known existing projection reference 581932.579311 / 6566001.891835 maps to longitude 10.43555 / latitude 59.2251222222 within 1e-7 degrees in tests. Both XY and XYZ source points yield the same display XY while retaining their source arity.

## Resource limits and errors

| Limit | Implemented value |
| --- | --- |
| XML UTF-8 byte size | 3 MiB, before parsing |
| Feature members | 2000 |
| Source geometry tuples, collection-wide | 100000 |
| DOM nodes plus attributes | 300000 |
| Tree depth | 16 |
| Fields per feature, including geometry/bounds | 128 |

Limits fail explicitly as parser-limit, without returning truncated records. Byte size is checked before native parsing; tree complexity is checked iteratively after DOM construction, avoiding JS recursion. The byte cap also bounds the initial DOM allocation; the post-parse node/depth limits do not claim to prevent all native DOM parsing cost. Feature/coordinate limits are client safety bounds, not claims about service completeness.

GeminiGmlError exposes fixed name/code/message values. Categories include invalid-xml, unsafe-xml, unsupported-profile, service-exception, unsupported-geometry, invalid-coordinates, ambiguous-dimension, invalid-dimension, missing/unsupported/conflicting-crs, invalid/duplicate-feature-id, invalid-attributes, parser-limit and invalid-display-projection. No raw XML, provider exception text or thrown projector detail is included in error messages. No logs/telemetry are added.

## Tests and results

Local runtime: Node v24.19.0; actual browser: Chrome 155.0.8059.85. All Gemini fixtures are synthetic. The confirmed namespace is schema metadata supplied by the user, not a downloaded extract.

### New Node tests

    node --test tests/geminiGmlParser.test.mjs

**6 passed, 0 failed, 0 skipped.** Covers fixed namespace/limits, pre-DOM safety/byte checks, sanitized parser errors/no logs, missing DOMParser, CRS spelling normalization and safe error construction.

### Actual browser tests and photo GML regression

Direct file-entry runs using node --test (and node file.mjs) repeatedly timed out at the shared CDP helper's Runtime.enable step before parser cases started. An isolation=none attempt behaved the same. The root cause of this entry-point-dependent CDP transport behavior was not established. No parser failure was inferred from it and no timeout/skip weakening or shared-harness change was retained.

Using a module-import entry point succeeds with the same tests, original harness, Chrome binary and native DOMParser. The exact successful PowerShell invocation was:

    @'
    delete process.env.PHOTO_GML_FIXTURE;
    await import('./tests/geminiGmlBrowser.test.mjs');
    await import('./tests/terrainPhotoGml.test.mjs');
    '@ | node --input-type=module

The environment deletion is process-local and ensures the existing photo test uses synthetic data rather than any optional local corpus. **35 Node-reported tests passed, 0 failed, 0 skipped**: 33 new browser cases, their parent test, and the existing photo browser test. The photo test also reported **seven internal browser checks passed** for native XML/CRS/error handling, actual EXIF parsing and photo session integration. This command is the validated browser invocation for this environment; normal file-entry CDP startup remains an open test-runner issue.

The 33 new browser cases cover empty/populated collections, alternate/default prefixes, metadata quirks, XML/service errors, unsafe declarations, member structures, full XY/XYZ lines/points, partial and zero Z, all COVER_Z presence states, unknown inert scalars, Unicode/leading zeros, nil contradictions, duplicate IDs, CRS inheritance/conflicts, dimension ambiguity, known projection, immutability, inert HTML/URLs, exactly 2000/100000 boundaries and explicit excess/depth/node/field failures. No hand-built DOM replacement is used for these checks.

### M1 and broader regressions

    node --test tests/wfsProxyPolicy.test.mjs tests/wfsProxyHandler.test.mjs tests/wmsProxyPolicy.test.mjs tests/photoSpatialProjection.test.mjs tests/photoSpatial.test.mjs tests/photoMapFeatures.test.mjs tests/featurePopupContent.test.mjs tests/sosiCanonicalAttributes.test.mjs tests/validationV2SyntheticGmiFixtures.test.mjs tests/photoGmiDefaults.test.mjs tests/photoResetIntegration.test.mjs

**129 passed, 0 failed, 0 skipped.** Includes all 41 M1 tests, WMS policy, projection/photo state, map/popup safety, SOSI attributes and synthetic GMI validation.

    node --test tests/richerUsageTelemetryParserIntegration.test.mjs tests/gmiPhotoPlacements.test.mjs

**54 passed, 0 failed, 0 skipped.** Includes real GMI/SOSI/KOF parser code paths using synthetic inputs, CRS/map consistency, photo source placement and lifecycle regressions. Existing Node module-type and unavailable-localStorage harness warnings were emitted in applicable suites.

Across the final successful invocations: **224 Node-reported tests passed** (including browser parent tests), with no failures/skips in those invocations. Earlier direct file-entry browser attempts failed at CDP startup as documented above; this is not a claim that every invocation passed. The full repository suite was not run.

### Lint/build/scope checks

Focused ESLint passed with no errors/warnings for the two production modules, two Node test files, browser cases and fixture builder:

    node node_modules/eslint/bin/eslint.js src/lib/gemini-wfs/parseGeminiGml.mjs src/lib/gemini-wfs/geminiMapFeatures.mjs tests/geminiGmlParser.test.mjs tests/geminiGmlBrowser.test.mjs tests/browser/geminiGmlChecks.mjs tests/fixtures/gemini-wfs/syntheticProfile.mjs

npm run build passed (exit 0): Next.js 16.1.6/Turbopack compiled and generated all eight static pages; existing routes including /api/gemini-wfs remained dynamic. Existing outdated Browserslist/npm-version notices were not addressed through unrelated dependency changes. M2 modules are not wired into application UI/backend yet; the browser test imports and executes them directly.

Final tracked diff is empty: all implementation additions are new files. Shared browser harness, projection/normalization, M1 route/contract, package files and configuration are unchanged.

## Open questions and deferred scope

- The feature namespace is now confirmed; it is no longer an open assumption. Remaining structural questions concern unobserved live variants, such as extra GML metadata fields or alternative geometry serialization. Unsupported content fails explicitly; expand only with evidence and fixtures.
- posList lines without dimension fail conservatively; repeated-pos lines, other GML versions and multipart geometries are not added speculatively.
- Source strings are preserved without interpreting material/network codes, elevation quality, cover/geometry relationships or attribute units.
- Normal Node file-entry browser-test CDP startup remains unresolved locally. The module-entry command above passed both new and existing native-browser checks; no production change is needed to work around the testing transport issue.
- No live service/profile extraction, WFS completeness/paging or M1 MIME/auth verification occurred. No backend change is required by this adapter.
- M3+ fetching/client/session, credentials, survey extent/BBOX generation, UI/configuration/password manager, reference layers/card, styling, popups and automatic fetching remain unimplemented. No empty future modules were created.

**No real Gemini feature data, extracts or credentials were used. No live Gemini WFS calls were made. No XML dependency was added. M3 or later functionality was not implemented.**
