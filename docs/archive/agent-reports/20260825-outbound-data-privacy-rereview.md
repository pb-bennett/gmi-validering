# Focused outbound-data/privacy rereview

Date: 2026-08-25

Repository: `C:\GitHub\gmi-validering`

Branch: `feature/app-info-version-changelog`

Scope: independent follow-up review of the Leaflet popup HIGH finding and the live privacy wording in `AppInfoModal`. This report follows `20260825-outbound-data-privacy-audit.md` and checks, but does not rely on, `20260825-leaflet-popup-xss-fix.md`.

## 1. Scoped conclusion

| Decision | Verdict |
|---|---|
| Popup HIGH finding | **CLOSED** |
| Regression coverage | **SUFFICIENT** |
| Final privacy copy | **APPROVED** |
| Required wording change | **None** |
| Security/privacy release blockers in this scope | **NO** |
| Overall | **APPROVE FOR v1.1.0 PRIVACY/SECURITY SCOPE** |

The original data-to-HTML interpretation chain has been removed. Both point and line attributes still enter the shared GeoJSON property collection, but the popup path now creates DOM nodes and places all file-derived text through `textContent` or `createTextNode`. Button metadata is assigned to fixed `data-*` attribute names through `setAttribute`. Leaflet receives an `HTMLElement`, not a file-interpolated HTML string.

The current “Nysgjerrig eller bekymret?” text is materially accurate, concise enough for the modal, and substantially more complete than the wording reviewed in the original audit. It explains local file processing, automatic line-coordinate sampling, point and municipality lookups, viewed-area disclosure to map services, aggregate municipality statistics, the fields excluded from the statistics database, Vercel Web Analytics, and public source code.

This approval covers only the reviewed privacy/security scope. It is not approval of the whole branch or a general release certification.

## 2. Popup HIGH finding: independent source trace

### 2.1 File-controlled inputs still reach the popup data model

`MapInner` continues to spread parsed attributes into GeoJSON properties for both geometry types:

- lines: `src/components/MapInner.js:1913-1934`, especially `...line.attributes` at line 1922;
- points: `src/components/MapInner.js:1938-1958`, especially `...point.attributes` at line 1946.

This is expected and is not itself unsafe. The security question is how those properties cross into the DOM.

### 2.2 Both points and lines use one corrected binding path

The line and point features are placed in the same `geoJsonData` feature collection. The single React-Leaflet `GeoJSON` instance receives the shared `onEachFeature` callback (`src/components/MapInner.js:2645-2655`). That callback derives `props` from `feature.properties` and binds:

```js
layer.bindPopup(
  createFeaturePopupContent(props, featureId, color, fcode),
);
```

(`src/components/MapInner.js:2558-2572`)

There is no geometry-specific alternate popup builder. Consequently both points and lines take the corrected path. The line-only “Vis profilanalyse” action is added inside the shared builder when `props.featureType === 'Line'` (`src/lib/map/featurePopupContent.mjs:70-79`).

### 2.3 Property keys and values are not interpreted as HTML

`createFeaturePopupContent` starts with `document.createElement('div')` and returns that element (`src/lib/map/featurePopupContent.mjs:20-21,82-83`). It does not build a markup string.

For every displayed property:

- the property key is assigned to a newly created `<strong>` element using `label.textContent = key`;
- the separator and property value are added using `document.createTextNode`, with the value converted using `String(value)`;
- only an application-created `<br>` element is inserted.

(`src/lib/map/featurePopupContent.mjs:40-58`)

The header helper likewise creates a `<span>` and assigns its value through `textContent` (`src/lib/map/featurePopupContent.mjs:1-7`). This covers `featureType` and `fcode`, including cases where those values originated in parsed attributes.

Therefore:

- no file-controlled property key reaches `innerHTML`;
- no file-controlled property value reaches `innerHTML`;
- hostile strings such as `<img>`, `<script>` or `<a>` remain text nodes;
- no unsafe string is passed to `bindPopup` from this path.

### 2.4 Button metadata cannot escape into executable markup

The action builder creates a real `<button>`. Attribute **names** are fixed in source: `data-feature-id`, `data-feature-type`, `data-index`, and `data-layer-id`. Values are converted to strings and assigned with `setAttribute`; the button label uses `textContent` (`src/lib/map/featurePopupContent.mjs:9-18`).

File-derived metadata can therefore influence an attribute value, but cannot terminate markup, add another attribute, create an event handler, or create a new node. The click handlers read the resulting dataset values, parse the index, and use the type/layer reference for existing local UI actions (`src/components/MapInner.js:1745-1825`). They do not evaluate metadata as code or URL markup.

### 2.5 Ordinary behavior is preserved

The builder retains the prior visible structure and CSS classes:

- header with type and optional code/color;
- scrollable key/value list in property enumeration order;
- “Vis i 3D” and “Inspiser data” for points and lines;
- the additional “Vis profilanalyse” action for lines.

String conversion behavior for displayed values is materially equivalent to the former template interpolation. The focused regression tests confirm the expected point and line structures and action counts.

### 2.6 Equivalent-sink search

A focused search of `src/` found:

- the corrected `bindPopup(createFeaturePopupContent(...))` call in `MapInner`;
- one `dangerouslySetInnerHTML` use in `MapLegend` (`src/components/MapLegend.js:211-225`);
- no `innerHTML` or `insertAdjacentHTML` use in the fixed popup builder;
- no other `bindPopup` call in application source.

The `MapLegend` sink is not an equivalent file-derived vulnerability. File `S_FCODE` values only decide which entries from the fixed `LEGEND_ITEMS` allowlist are visible (`src/components/MapLegend.js:25-143`). The HTML input is generated from each selected fixed entry’s application-owned category and color (`src/components/MapLegend.js:211-225`; `src/components/MapInner.js:511-583`). Parsed `S_FCODE` text is not interpolated into the SVG string. Trusted application-generated Leaflet marker SVGs are likewise outside the reported data path.

### 2.7 Popup verdict

**CLOSED.** The confirmed source path no longer provides an HTML interpretation boundary for parsed property names, values, feature IDs, layer IDs, types or codes. No equivalent file-derived HTML sink was found nearby.

## 3. Regression-test assessment

The current `tests/featurePopupContent.test.mjs` provides meaningful coverage:

| Required case | Evidence | Assessment |
|---|---|---|
| Hostile `<img>` | Used as a hostile value and metadata value; asserted visible as text and zero `img` nodes (`:92-121`) | Covered |
| Hostile `<script>` | Used as the value of a hostile attribute name; asserted visible as text and zero `script` nodes (`:93,102-114`) | Covered |
| Hostile `<a>` | Used as an ordinary property value; asserted visible as text and zero `a` nodes (`:94,103-115`) | Covered |
| Hostile attribute name | The `<img ...>` string is used as an object key and asserted as literal popup text (`:98-102,109`) | Covered |
| Hostile attribute values | Image, script and link markup are supplied through different property/metadata positions (`:92-121`) | Covered |
| Ordinary point popup | Type, attribute text, two actions and structure are asserted (`:123-144`) | Covered |
| Ordinary line popup | Type-specific three-action behavior and profile label are asserted (`:130-144`) | Covered |
| No executable HTML nodes | Explicit zero-node assertions for `img`, `script` and `a` (`:112-114`) | Covered |
| Source integration with `MapInner` | Test reads both source files, confirms `bindPopup(createFeaturePopupContent(...))`, confirms text/attribute APIs, and rejects HTML sinks in the builder (`:83-90,146-156`) | Covered |

Independent execution results:

- `node --test tests/featurePopupContent.test.mjs`: **3 passed, 0 failed**;
- `node --test tests/featurePopupContent.test.mjs tests/appInfoUiContract.test.mjs`: **12 passed, 0 failed**.

The tests use a deliberately small fake DOM rather than a real browser plus Leaflet. That means they are not end-to-end browser tests, and the source-integration assertion is necessarily narrower than runtime instrumentation. This does not make the coverage insufficient: the tested DOM APIs have standard escaping semantics, the source trace confirms the actual shared Leaflet binding, and the former interpolation sink is absent. A browser-level test could be added later as defense against future integration drift, but it is not required to close this finding.

**Regression coverage verdict: SUFFICIENT.**

## 4. Final public privacy wording

The live wording reviewed is `src/components/AppInfoModal.js:189-215`, not wording copied from either prior report.

| Current substantive statement | Assessment against source and original audit |
|---|---|
| “Det meste skjer lokalt i nettleseren på din egen PC.” | **Defensible.** File reading, parsing, validation and visualization remain primarily client-side. The following paragraphs now disclose the material coordinate, lookup, map and analytics exceptions. |
| “Selve GMI-, SOSI- eller KOF-filen lastes ikke opp til serveren.” | **Defensible.** No normal application request uploads the raw selected file. The popup exfiltration path that previously prevented an unconditional boundary assurance is now closed. “Serveren” is reasonably understood as the application backend in this context. |
| File contents are read, checked and visualized locally. | **Defensible.** This accurately summarizes the primary browser-side lifecycle without claiming that every derived coordinate remains local. |
| Line coordinate points are sent automatically to Kartverket for terrain profiles and cover calculations. | **Defensible and appropriately specific.** It corrects the original modal’s most important omission by saying both “langs ledningene” and “automatisk” (`AppInfoModal.js:199`; original audit sections 1, 5 and 11). |
| Kartverket also handles some point and municipality lookups. | **Defensible.** This covers point elevation inspection and the address/Kommuneinfo municipality-resolution path without burdening the modal with endpoint details. |
| Map services receive information about the viewed area. | **Defensible.** This accurately communicates tile coordinates and WMS bounding-box/viewport disclosure while distinguishing it from file upload. It is suitably provider-neutral for optional map services. |
| “Selve innmålingsfilen sendes ikke med disse forespørslene.” | **Defensible.** The terrain, lookup and map request builders transmit coordinates, centroids, tile indices or bounding boxes—not the raw file body. |
| A point is calculated after successful loading to resolve the municipality. | **Defensible.** The point is a dataset-derived centroid sent to `/api/track` and onward to Kartverket for resolution; the sentence does not claim the point stays local. |
| “Statistikken lagres som aggregerte tellinger per kommune, dato og time, ikke som enkeltleveranser.” | **Defensible.** The aggregate key contains date, hour, area type/ID and the constant upload event type; successful municipality resolution uses the municipality area. Each successful upload increments a counter rather than inserting a delivery record (`src/lib/tracking/aggregates.js:49-69,72-119`; `src/features/user-tracking/supabase.sql:1-60`). The database also carries descriptive area fields and timestamps, but omitting those implementation dimensions is not misleading in a small modal. |
| “Filnavn, rå filinnhold, objektdata og koordinater lagres ikke i statistikkdatabasen.” | **Defensible.** None of those fields is included in the active aggregate payload or Supabase RPC. The municipality centroid is received and used by the application server and held in the already-audited process-memory lookup cache, but is not written to the statistics database. The wording correctly limits this assurance to that database. |
| Vercel Web Analytics is used for anonymous page-view and ordinary site-usage statistics. | **Defensible.** `<Analytics />` remains globally mounted (`src/app/layout.js:1-23`). The description is consistent with the provider behavior verified in the original audit and does not promise absence of ordinary HTTP/page/browser metadata. |
| “Appen sender ikke filinnhold eller filrelaterte data til denne tjenesten.” | **Defensible in ordinary-user interpretation.** Application source emits no custom Vercel event or property and does not put filename, object data, coordinate, validation result or raw content in page URLs. Vercel’s automatic page/browser/referrer metadata is disclosed as ordinary site-usage information in the preceding sentence; it is not file-related data. |
| Source code is public and can be inspected. | **Verified.** The modal links to the repository with `noopener noreferrer` (`src/components/AppInfoModal.js:17,70-81,208-215`), and an anonymous unauthenticated HTTPS request to that GitHub URL returned HTTP 200 during this rereview. |

The modal is not a full privacy policy and does not need to enumerate batching, CRS, provider log retention, normal HTTP metadata or every optional map hostname to remain honest. Its plain-language distinctions are materially correct.

**Privacy-copy verdict: APPROVED.**

**Exact required wording correction: none.**

Optional stylistic precision, not required for approval: “serveren” could be changed in a future copy-edit to “GMI Validators server” if the author wants to make the distinction from Kartverket and map servers even more explicit. The current paragraph sequence already makes that distinction adequately.

## 5. Residual risks relevant to v1.1.0

### RELEASE BLOCKER

None found in the reviewed privacy/security scope.

### SHOULD FIX SOON

1. **Remove the health-write secret query option.** The keepalive route accepts the secret through a URL query parameter as well as safer headers (`src/app/api/track/health/route.js:8-24,27-47`). URL secrets can be retained in access logs and operational tooling. Keep the Bearer or dedicated-header mechanisms and stop accepting `?secret=`. This remains a lower-severity hardening issue; authentication is present and no bypass was found.
2. **Avoid logging the full WMS proxy URL on tile failures.** The unconditional failure log includes the encoded WMS target URL (`src/components/AuthenticatedWmsLayer.js:53-93`). It does not log the Basic credential header, but it can expose tenant/path, layer and viewport/bounding-box information to the browser console or collected client logs. Log status and a sanitized identifier instead.
3. **Narrow persisted UI state.** Zustand excludes the raw dataset, terrain and credentials, but persists the complete `ui` slice (`src/lib/store.js:2850-2859`). As established in the original audit, limited file-derived coordinates, field-filter values and local object references can survive reload on a shared browser. Persist only the UI preferences that need to survive.

These items should be scheduled, but none reopens the popup finding or contradicts the modal’s statements about the statistics database and normal raw-file upload.

### LATER HARDENING

1. **Add a restrictive application Content Security Policy.** `next.config.mjs` defines no app-wide response headers. A CSP is useful defense in depth against future markup/script sinks, although it is no longer needed to make the reviewed popup safe.
2. **Add a real-browser popup integration test.** The existing source trace and fake-DOM regression are sufficient for closure; a browser test would better detect a future change that converts the DOM node back into interpreted HTML.
3. **Document provider retention and ordinary HTTP metadata outside the modal.** Map providers necessarily receive viewport/tile/bbox data and request metadata. The modal now discloses the viewed-area fact. Detailed provider retention, IP/User-Agent/referrer handling and optional OSM/CARTO/Gemini boundaries remain suitable for expanded privacy documentation.
4. **Consider an explicit `Referrer-Policy`.** The repository still does not configure one application-wide. This is general request-metadata hardening, not a demonstrated file-data leak.

## 6. Release verdict

A. **POPUP HIGH FINDING: CLOSED**

B. **PRIVACY COPY: APPROVED**

C. **SECURITY/PRIVACY RELEASE BLOCKERS REMAIN: NO**

D. **OVERALL: APPROVE FOR v1.1.0 PRIVACY/SECURITY SCOPE**

The lower-severity items above do not prevent a reasonable v1.1.0 release in this narrowly reviewed scope. This conclusion assumes the reviewed working-tree popup implementation and AppInfo wording are the versions shipped.

## 7. Checks and non-goals

- Inspected the actual current `MapInner`, popup builder, popup tests and `AppInfoModal` source independently.
- Compared the current implementation with the original finding’s data path and searched `src/` for equivalent file-derived HTML sinks.
- Confirmed that the GitHub source link was anonymously reachable (HTTP 200); no authenticated GitHub session or repository mutation was used.
- Ran only focused Node test commands; no build output or generated files were produced.
- Did not repeat the complete outbound-destination audit because no new network-flow evidence required it. Relevant non-popup source changes in the working tree are AppInfo/release presentation and the package version bump; the audited network integrations remain as described in the original report.
- Did not inspect or disclose production credentials, provider dashboards, server logs or runtime retention settings.
- Did not modify application code, tests, dependencies, AppInfo copy, either prior report, or any file other than this rereview report.
- Did not commit, push, merge, deploy, reset, revert, stash or clean the working tree.
