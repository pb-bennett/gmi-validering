# Leaflet Popup XSS Fix

Date: 2026-08-25  
Repository: `C:\GitHub\gmi-validering`  
Branch: `feature/app-info-version-changelog`

## Root Cause

Parsed GMI, SOSI and KOF attributes are retained as arbitrary property keys and
values. `MapInner` copied those attributes into GeoJSON properties for both
lines and points, then concatenated the property names, values and button data
attributes into an HTML string. Leaflet interprets string popup content as HTML
when it binds the popup, allowing crafted file content to create markup, make
resource requests, or execute same-origin event-handler code when a feature
popup is opened.

Affected source locations are the line and point attribute spreads in
`src/components/MapInner.js:1922` and `:1946`, plus the shared
`onEachFeature` popup path at `:2570-2571`. There are no separate point and
line popup builders: both geometry types use this same path.

## Remediation

`src/lib/map/featurePopupContent.mjs` now constructs the existing popup
structure with DOM elements. Trusted application structure and classes are
created directly. File-derived property keys and values are assigned with
`textContent`; button metadata is assigned with `setAttribute`. Leaflet now
receives the resulting `HTMLElement` rather than an interpolated HTML string.

The existing information, ordering, classes, point/line actions, line-only
profile button, and map click behavior are unchanged. Parser normalization,
validation, telemetry, map styling, and external data flows were not changed.

## Regression Tests

`tests/featurePopupContent.test.mjs` covers:

- `<img src=x onerror="...">`, `<script>...</script>`, and an external `<a>`
  as hostile values;
- a hostile attribute name and hostile button metadata values;
- literal text visibility and absence of `img`, `script`, and `a` nodes;
- ordinary point and line popup content, classes, ordering, and action count;
- source-level confirmation that `MapInner` binds the DOM builder and the
  builder contains no HTML interpretation sink.

No test performs a network request.

## Equivalent Sink Review

The nearby source search found only the fixed `MapInner` `bindPopup` call and a
`dangerouslySetInnerHTML` use in `MapLegend`. The latter renders trusted,
application-generated legend SVG from fixed category/color data and does not
consume parsed GMI/SOSI/KOF properties, so it is outside this vulnerability
class and was left unchanged.

## Residual Risk

This fix removes the identified file-to-Leaflet-HTML interpretation boundary.
The application does not add a CSP in this change, so defense-in-depth browser
policy remains a separate concern. Future popup paths must continue to pass DOM
nodes or trusted static content and must not reintroduce string interpolation of
parsed properties.

## Checks

- `node --test tests/featurePopupContent.test.mjs`: 3 passed
- `node --test tests/featurePopupContent.test.mjs tests/profileAnalysisActiveDataCrash.test.mjs`: 9 passed
- `node --test "tests/*.test.mjs"`: 135 passed
- `npx eslint src/components/MapInner.js src/lib/map/featurePopupContent.mjs tests/featurePopupContent.test.mjs`: 0 errors; 2 pre-existing `MapInner.js` warnings
- `npm run build`: passed
- `git diff --check`: passed

No commit, push, merge, or deploy was performed.
