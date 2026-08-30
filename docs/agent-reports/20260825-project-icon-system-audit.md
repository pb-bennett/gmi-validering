# GMI Validator project icon-system audit

Date: 2026-08-25
Branch observed: `feature/app-info-version-changelog`
Scope: planning and audit only; no application, test, package, dependency, Git, or deployment changes

## Executive recommendation

**RECOMMENDED STANDARD: `@phosphor-icons/react`**

GMI Validator does not currently have a meaningful icon-library standard. The dominant implementation is handwritten or copied inline SVG, supplemented by Unicode glyphs, emoji, CSS-drawn spinners/indicators, Leaflet-supplied controls, QR-code center graphics, and VA/cartographic symbols. `lucide-react` is present in the uncommitted manifest at version `1.34.0`, but there are **zero imports and zero rendered Lucide components in `src`**. It is therefore not the de facto standard.

Phosphor is the better project standard because it covers the application's ordinary UI, map/navigation, analysis, data, table, status, and compact-control needs and also exports a recognizable GitHub brand component—`GithubLogoIcon`—from the same library. That allows the product's strong “one approved icon library” preference to work without immediately creating a second brand package or a homemade SVG exception. The current upstream index and generated component were checked directly: [`GithubLogo`](https://raw.githubusercontent.com/phosphor-icons/react/master/src/csr/GithubLogo.tsx) exports `GithubLogoIcon`, and the [package index](https://raw.githubusercontent.com/phosphor-icons/react/master/src/index.ts) exports the module.

Lucide remains an excellent fit for the existing 24×24, 2px-stroke visual language and has better decorative accessibility defaults in its current React implementation. It is rejected here because Lucide explicitly does not include brand logos and does not plan to add them. Its own [brand-logo statement](https://github.com/lucide-icons/lucide/blob/main/BRAND_LOGOS_STATEMENT.md) recommends a separate brand source, which would defeat the requested single-library outcome unless the GitHub link remained text-only.

The safe migration is incremental. First adopt and document the standard, replace the newly introduced unused Lucide dependency rather than carrying two packages, and clean up AppInfoModal. Then migrate shared top-level actions and repeated semantics, followed by tables/statistics/validator modules. Do not migrate VA symbols, Leaflet marker generation, chart geometry, 3D data marks, or domain legends as generic interface icons.

## Audit context and concurrency

This audit ran while Luna/the user were actively tuning `AppInfoModal` on the same working tree. The initial status already contained modified `package.json`, `package-lock.json`, `src/app/globals.css`, and `src/app/page.js`, plus untracked AppInfo-related source, data, tests, and reports. The audit treated all of those as user-owned concurrent work and read the current state as it changed.

The only file created by this audit is this report.

The counts below are source counts, not a promise about how many icons are simultaneously visible. Conditional branches, reusable local icon functions, and generated map symbols make an exact runtime count dependent on application state.

## Scope and method

Inspected at minimum:

- `package.json` and `package-lock.json`
- `next.config.mjs`
- all files under `src/app`, `src/components`, `src/lib`, and `src/data`
- UI-relevant image assets under `src` and `public`
- installed `lucide-react` package metadata and actual CommonJS exports
- Leaflet CSS and map-control usage
- official Lucide and Phosphor source/documentation for brand policy, exports, React/Next behavior, accessibility props, and tree-shaking guidance

Patterns searched included icon-library imports, literal `<svg>`, generated SVG strings, imported/referenced image assets, data URIs, Unicode/emoji glyphs, CSS pseudo-elements and shape drawing, Leaflet icon factories and controls, QR SVGs, and chart/map rendering.

## Current icon systems found

| Source or pattern | Repository evidence | Approximate usage | Assessment |
|---|---|---:|---|
| Handwritten/copied inline SVG | 71 literal `<svg>` sites across 27 active files in `src/app` and `src/components` | About 65 interface/branding/loading sites; 6 non-interface sites | Dominant current implementation |
| `lucide-react` | `package.json` and lockfile only; installed `1.34.0` | 0 imports, 0 rendered components | Dependency present, not a standard |
| Phosphor | Not installed | 0 | Recommended future standard |
| Other icon packages | No `react-icons`, Heroicons package, Font Awesome, Material Icons, `phosphor-react`, or `@phosphor-icons/react` dependency/import found | 0 | None materially relevant today |
| Unicode/text glyphs and emoji | Active uses of `×`, `✕`, `+`, `−`, `▲`, `▼`, `↑`, `↓`, `✓`, `⚠`, `⛰️`, and `⚙️` | About 27 source tokens in 9 active files | Legacy UI pattern; migrate incrementally |
| CSS-drawn indicators | Border spinners in `MapView` and `StatsModal`; two circular `!` status marks in incline-analysis legend | At least 4 icon-like sites | Migrate when owning modules are touched |
| QR-generated SVG | `QRCodeSVG` from `qrcode.react` in `ShareQrModal` | 2 QR graphics | Generated content, not UI icon library |
| Handwritten QR center graphics | App mark and GitHub mark encoded as SVG data URIs in `ShareQrModal` | 2 branding graphics | Branding edge case, not ordinary UI |
| Leaflet-supplied controls/assets | Default zoom buttons, layers-control PNG, default marker PNGs | 1 map control family plus markers | Third-party boundary; do not casually replace |
| Generated VA/map SVG | `L.divIcon`/SVG factories in `MapInner` | 4 wrapper sites generating many domain symbols | Explicitly excluded from UI-icon migration |
| Chart/data marks | Main incline-profile SVG, Recharts, Leaflet circles/polylines, Three.js geometry | Multiple visualizations | Data visualization, not UI icons |
| Static public assets | `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`; `src/app/favicon.ico` | Five SVGs are unreferenced; favicon is browser/app branding | Not current application UI icons |

### Literal SVG count boundary

The 71 literal `<svg>` sites divide approximately as follows:

- **65 interface, loading, status, or branding sites.** This includes inline close, share, reset, chart-summary, upload, map-navigation, table, validation, modal, play/pause, spinner, and QR-center graphics.
- **4 domain-symbol wrapper sites** in `MapInner` that generate VA/cartographic point shapes through `L.divIcon` or legend markup.
- **1 data-visualization SVG root** for the incline/profile chart.
- **1 blank basemap tile SVG data URI**, which is a rendering surface rather than an icon.

The four domain SVG wrappers represent many meaningful categories—water, wastewater, stormwater, drainage, manhole, gas, electrical, telecom, heating, KRN, SAN, LOK, and others. Counting their generated shapes as “homemade UI icons” would be incorrect.

### Unicode/emoji count boundary

Runtime source contains approximately:

- 8 downward disclosure triangles and 1 upward triangle
- 4 checkmarks used in success messages
- 4 warning glyphs
- 2 mountain emoji and 1 gear emoji
- 2 close glyphs `✕` plus one AppInfoModal `×`
- one ascending and one descending sort arrow
- AppInfoModal `+`/`−` disclosure alternatives

`src/components/Sidebar.js.bak` contains another triangle but is a backup artifact and is excluded from active runtime counts. It should not determine the standard.

## Practical component inventory

Counts in this table are approximate implementation sites and are deliberately grouped rather than being raw grep output. “Accessibility” describes the current state. “Candidate” means candidate for the approved UI library, not a mandate to change it immediately.

| Library/component source | File/component | Purpose and count | Type | Role | Current accessibility treatment | Candidate | Priority |
|---|---|---|---|---|---|---|---|
| Inline SVG | `src/app/page.js` | About/app info, statistics, share, reset/upload-new, parse error, WMS settings/add, add-layer close; 7 | 24×24 stroke paths | Mixed interactive/decorative | App-info trigger is well labelled and hidden; most other SVGs are not hidden; add-layer close has no accessible name | Yes | High for unnamed close; Phase 2 otherwise |
| Local inline SVG + glyph | `AppInfoModal.js` | Two info components; expand `+`/`−`; close `×` | 24×24 stroke plus text glyphs | Mixed | Info SVGs and glyphs use `aria-hidden`; close button has `aria-label`; strong current modal semantics | Yes | Phase 1 |
| Inline SVG + glyph | `LayerPanel.js` | Analysis, Z validation, field validation, topplok, zoom, remove, filter reset, data table, disclosure; 9 SVG + 4 triangles | Mostly 24×24 stroke | Mostly icon-only interactive | Relies heavily on `title`; SVGs generally not hidden; status dots are color-only | Yes | High/Medium; Phase 2 |
| Inline SVG + glyph | `LayerManager.js`, `MapLegend.js` | Add file and disclosure controls; 2 SVG + 1 triangle | Stroke plus glyph | Interactive and decorative | Visible text/title helps; graphics are not consistently hidden | Yes | Phase 2 |
| Inline SVG + glyph | `Sidebar.js` | App map-pin mark, success checks, section disclosure; 1 SVG + 6 glyphs | Stroke logo-like mark and glyphs | Branding/decorative plus interactive | Glyphs are exposed as text; disclosures have visible section labels | UI disclosures/checks: yes; app mark: branding review | Medium |
| Inline SVG + glyph + Leaflet | `MapInner.js` | Ruler control and measurement close; 1 UI SVG + 1 close glyph | Stroke and text glyph | Interactive | `title`/visible “Lukk” text; ruler SVG not hidden | Yes, but isolate from map internals | Phase 2 with regression tests |
| Inline SVG | `TabSwitcher.js`, `ThemeSwitcher.js` | Map/3D tabs, selected theme check, theme menu; 4 | Mixed 24×24 stroke and 20×20 fill | Icons with text/decorative | Visible text provides the name; SVGs are not hidden | Yes | Phase 2 |
| Inline SVG + emoji | `3D/Controls3D.js`, `3D/Tooltip3D.js` | Disclosure, close, show in map, inspect, profile, pump label; 5 SVG + 1 emoji | Stroke plus emoji | Interactive and semantic label | Tooltip close is title-only; controls header is a clickable `div` with no button/keyboard semantics | Yes | High for header semantics; Phase 2/3 |
| Inline SVG + glyph | `LayerDataTable.js`, `DataDisplayModal.js` | Zoom, filter reset, close, sort direction; 3 SVG + close/sort glyphs | Stroke plus text glyphs | Interactive | Zoom SVG is correctly hidden but title-only; both close controls lack accessible names; sort state is visual glyph text | Yes | High; Phase 3 |
| Inline SVG | `FieldValidationSidebar.js`, `FieldDetailModal.js`, `MissingFieldsReport.js`, `ZValidationModal.js`, `StandardsInfoModal.js` | Close/back, report, line/point headings; 8 | 24×24 stroke | Mixed | Several title-only controls; StandardsInfoModal close is unnamed; decorative section icons are not hidden | Yes | High for unnamed close; Phase 3 |
| Inline SVG + glyph/CSS | `InclineAnalysisModal.js` | Loading spinners, info/settings, close, warning/status glyphs; 6 icon SVG, about 6 status glyphs, 2 CSS warning disks | Mixed fill/stroke/glyph/CSS | Interactive, status, decorative | Visible labels often help; warning/terrain status sometimes depends on emoji/color/title; chart SVG is separate and excluded | UI/status only; not chart geometry | High/Medium; Phase 3 |
| Inline SVG | `DevDiagnosticsPanel.js` | Gear/diagnostic control; 1 | 24×24 stroke | Icon with text | Visible “DEV” text and title; SVG not hidden | Yes, low product priority | Low |
| Inline SVG + CSS/glyph | `StatsModal.js`, `stats/StatsMap.js`, `DetailedStatsSection.js` | Upload/municipality metrics, close, selector, play/pause, chart-summary, loading; 6 SVG + selector glyph + CSS spinner | Mixed stroke/fill/CSS | Mixed | Metric SVGs and detailed-stat SVG are hidden; close/play buttons are labelled; play SVGs not hidden | Yes | Phase 3 |
| Inline SVG | `FileUpload.js`, `GlobalFileDrop.js` | File/cloud upload illustration; 2 identical copies | Large 48/56px stroke | Decorative | Adjacent text explains action; SVGs not hidden | Yes; deduplicate | Medium, Phase 2 |
| Inline SVG/data URI + QR package | `ShareQrModal.js` | App/GitHub QR center marks and close; 3 | Branding data URIs plus stroke close | Branding/decorative + interactive | Close is title-only; QR panels have text labels; embedded graphics have no separate semantics | UI close yes; QR marks require brand review | Medium, Phase 3 |
| Inline SVG | `WmsLayerModal.js` | Map heading, close, security, disclosure, spinner; 5 | Mixed stroke/fill | Mixed | Close is title-only; visible text covers most decorative icons | Yes | Phase 3 |
| CSS | `MapView.js` | Loading spinner; 1 | Border-drawn circle | Decorative/status | Adjacent loading text | Yes | Low/Medium |
| Third party | Leaflet/React-Leaflet | Zoom `+`/`−`, layer toggle PNG, map markers | Package-internal DOM/CSS/images | Interactive and domain map | Leaflet owns semantics/layout; app overrides positioning and marker URLs | Do not migrate casually | Risk-managed exception |
| Domain/map SVG | `MapInner.js`, `MapLegend.js`, `3D/Legend3D.js` | VA point types, line patterns, legend marks | Generated SVG/CSS/Three/Leaflet | Data symbology | Meaning supplied by legend/context | **No** | Explicit non-candidate |
| Chart marks | `InclineAnalysisModal.js`, Recharts in statistics, `stats/StatsMap.js` | Profiles, axes, series, points, timeline markers | SVG/canvas/map layers | Data visualization | Chart-specific semantics need separate review | **No generic conversion** | Explicit non-candidate |

## Current de facto standard

Explicit answers:

- **Is Lucide already widely used?** No. It has zero imports in application source. Its installation is new and uncommitted.
- **Is another library more widely used?** No. No other general-purpose icon library is installed or imported.
- **Are most icons custom/inline today?** Yes. About 65 UI/branding/loading SVG sites are handwritten/copied inline; glyphs and CSS add roughly 30 more icon-like sites/tokens.
- **Is there currently a meaningful standard?** No. The visual center of gravity is “Heroicons-like 24×24 stroke SVG copied into components,” not an actual governed library.

The source shows several repeated path shapes—11 copies of the same X path, two upload-cloud paths, repeated map-fold paths, repeated chart/settings paths, and repeated reset paths—confirming copy-and-paste consistency rather than component-library consistency.

## Homemade and inconsistent icon findings

### High priority

1. **Invalid or assumed icon exports can crash rendering.** The installed `lucide-react@1.34.0` was probed locally. `Github`, `GitHub`, and `GithubIcon` are all absent; ordinary exports such as `Info`, `ExternalLink`, and `X` are present in the CommonJS object. An ESM named-import probe containing `Github` fails at module instantiation. This matches the reported crash class. Future icon names must be verified against the exact locked package before merge.

2. **The current local Lucide installation has an artifact anomaly.** Its `package.json` points to `dist/esm/lucide-react.mjs`, `dist/lucide-react.d.ts`, and `dynamic.mjs`, but those files are absent locally; only the approximately 979 KB CommonJS bundle, two ESM source maps, and `dynamic.js` are present. No current source imports Lucide, so this is not presently breaking the UI, but any future adoption must start with a clean, reproducible package verification rather than relying on this installation.

3. **Four icon-only controls are genuinely unnamed in current source:**

   - add-layer modal close in `src/app/page.js`
   - data-display modal close in `DataDisplayModal.js`
   - standards modal close in `StandardsInfoModal.js`
   - data-table close glyph in `LayerDataTable.js`

   These have neither visible text nor `aria-label`; unlike title-only controls, they do not have even a fallback text name.

4. **The 3D controls disclosure is a clickable `div`, not a button.** `3D/Controls3D.js` uses a chevron in a `div` with `onClick`, with no keyboard handler, role, `tabIndex`, or expanded state. This is an interaction/accessibility problem, not merely an icon-style difference.

5. **Some status meaning is conveyed primarily by glyph/color.** LayerPanel error/warning dots and incline terrain/warning emoji can be absent from the accessible name or depend on `title`. Status must be expressed in text or an accessible label in addition to color/icon.

### Medium priority

1. **Close is represented three ways:** 11 copies of the same X SVG path, two `✕` glyphs, and one `×` glyph. Sizes range from roughly 14px to 24px, with differing padding and hit areas.

2. **Disclosure is represented by copied SVG chevrons, `▼`, `▲`, rotation, and plus/minus.** This creates inconsistent weight and motion and makes `aria-expanded` treatment uneven.

3. **The same semantics use different drawings.** Reset uses at least two circular-arrow paths plus a two-arrow reset path; map/open-in-map uses multiple copied map shapes; statistics/analysis uses multiple unrelated chart glyphs; settings alternates gear and info-circle semantics.

4. **Stroke/fill styles are mixed.** Most icons use 24×24, 2px stroke. Theme checks and play/pause use solid fill; AppInfo uses 1.7/1.8/2.2 stroke widths; the sidebar mark uses 2.5; spinners use 4px rings. Some variation is purposeful, but there is no rule governing it.

5. **SVG accessibility is inconsistent.** Only 7 of 71 SVG opening tags include `aria-hidden`; only one includes `focusable="false"`; none supplies an SVG `role` or child `<title>`. Most should be decorative because the surrounding text/button carries the name, but that is not declared.

6. **Many icon-only controls rely only on `title`.** Browser support can use `title` as a fallback accessible name, but it is a poor project contract and a weak tooltip mechanism for keyboard/touch users. Use explicit `aria-label` and, when useful, a real tooltip.

7. **Dense hit areas are inconsistent.** The table zoom button is 20×20; layer actions use padding-based sizes near the minimum; modal close buttons range from bare 24px icons to AppInfoModal's 44px target. A desktop GIS tool can stay compact, but targets should be intentional and consistent.

8. **Upload and loading artwork is duplicated.** `FileUpload` and `GlobalFileDrop` repeat the same cloud-upload path. Incline analysis repeats the same spinner SVG several times, while other modules draw spinners in CSS.

9. **GitHub branding is duplicated/inconsistent.** AppInfoModal is text-only, while ShareQrModal contains a handwritten GitHub SVG data URI. This is exactly the edge case a brand policy must resolve.

### Low priority

1. `DevDiagnosticsPanel` uses its own gear and English title; it is a developer-only surface and can wait.
2. The sidebar map-pin app mark may be treated as product branding rather than a general UI icon; decide that identity separately.
3. The unused default Next/Vercel SVGs in `public` do not affect runtime icon consistency. Remove only through normal asset cleanup, not as part of icon migration.
4. Color swatches, progress bars, plot legends, chart dots, and app-info bullets are indicators/marks rather than icon-library violations unless they are used as standalone controls.

## Candidate comparison against actual GMI Validator needs

| Requirement | Lucide | Phosphor Icons | Repository implication |
|---|---|---|---|
| Common UI breadth | Excellent: close, info, help, warning, check/error, upload/download, reset, share, search, filter, sort, table, settings | Excellent; corresponding families plus multiple variants | Either covers ordinary UI |
| Map/navigation | Strong: map, map pin, layers, locate/crosshair, ruler, globe, route | Strong: `MapTrifold`, `MapPin`, map-pin variants, GPS/crosshair family, `Ruler`, globe, roads | Either covers current map controls |
| Analysis/data/statistics | Strong chart, presentation, trend, database, inspection icons | Strong `ChartBar`, chart line/pie/scatter, graph, presentation, database, list/table icons | Either covers current analysis shell; neither replaces charts |
| Tables/filter/search/sort | Strong | Strong: `Table`, `Funnel`, `MagnifyingGlass`, `SortAscending`/`SortDescending` are present upstream | Either covers current table UI |
| Upload/download/reset/share | Strong | Strong: file/tray arrows, `ArrowsCounterClockwise`, `ShareNetwork`, copy/link families | Either covers current actions |
| Status/info/help | Strong | Strong: check, X, info, question, `Warning`, warning-circle/diamond/octagon, spinner family | Either covers status semantics |
| External link | `ExternalLink` exists in installed package | `ArrowSquareOut` is exported upstream | Either works |
| GitHub brand | **Not supported by policy; actual installed exports are absent** | **`GithubLogoIcon` verified in upstream React source** | Decisive for one-library preference |
| Visual model | Consistent 24×24 outline, normally 2px stroke | 256 grid with thin/light/regular/bold/fill/duotone weights | Lucide matches current copied strokes more closely; Phosphor needs a weight rule |
| Compact desktop GIS feel | Excellent | Excellent if constrained to regular/bold and small sizes; duotone/fill overuse would feel noisy | Phosphor policy must be strict |
| React 19 / Next | Installed package declares React 19 peer support; current upstream component is client-aware; simple props | Current package supports React components and an `/ssr` entry; main components use context | Current consumers are client components/client graph; future server files must use SSR entry |
| Accessibility ergonomics | Current upstream auto-adds `aria-hidden` when no accessible props/children are supplied | Accepts `alt` and arbitrary SVG props but does not auto-hide in current `IconBase` | Phosphor requires explicit `aria-hidden` discipline or a wrapper/test |
| Tree shaking | `sideEffects: false`; named imports are designed to tree-shake | Official docs state tree shaking; docs warn the main barrel exposes 9,000+ modules and can slow compilation | Use named/direct imports; avoid namespace/dynamic import; measure bundle |
| Bundle nuance | One stroke representation per icon is straightforward | Each icon supports six weights; an open upstream issue reports unused weights may remain in bundles | Standardize weights and measure real Next production output |
| Maintenance | Very active; installed `1.34.0` was published on the audit date | Stable `2.1.10`; repository remains active but releases are less frequent | Pin/lock and verify either package; avoid assuming newest means safe |
| Migration effort | Lowest drawing-style change, already in manifest but unused | Requires dependency switch and visual mapping, but no existing Lucide call sites to unwind | Phosphor switch is still low-risk if done before adoption |

Verified Phosphor upstream module coverage includes `GithubLogo`, `Info`, `X`, `ArrowSquareOut`, `MapTrifold`, `MapPin`, `Ruler`, `ChartBar`, `ShareNetwork`, `Table`, `Funnel`, `MagnifyingGlass`, `SortAscending`, `SpinnerGap`, and warning/check families in the [current source index](https://raw.githubusercontent.com/phosphor-icons/react/master/src/index.ts). Generated React files export the modern `*Icon` component name and retain older unsuffixed aliases as deprecated; future code should use names such as `GithubLogoIcon`, not guess capitalization.

The Phosphor React README documents tree shaking, direct per-icon import paths, Next optimization considerations, six weights, arbitrary SVG props, and the `/ssr` entry in the [official repository](https://github.com/phosphor-icons/react). Its latest published release page is [`v2.1.10`](https://github.com/phosphor-icons/react/releases/tag/v2.1.10).

## Recommended single library

**RECOMMENDED STANDARD: `@phosphor-icons/react`**

Concrete repository-specific reasons:

1. There is no incumbent library to displace: Lucide has zero source usage.
2. Phosphor satisfies the immediate GitHub-brand requirement from the same approved package.
3. Its map, ruler, GPS, layers/stack, chart, graph, table, filter, sort, upload, reset, share, status, external-link, and spinner coverage maps well to this desktop GIS/validation application.
4. Regular and bold weights can reproduce a compact technical-tool feel while fill can be reserved for selected/status states.
5. Current icon consumers are overwhelmingly client components, so the normal React entry is workable; an SSR entry exists for future server components.
6. Migrating now avoids paying for or governing two libraries.

Why Lucide is not recommended:

- It cannot supply GitHub branding by design.
- Keeping Lucide would require either a second brand package, a custom official asset exception, or text-only GitHub links. Text-only is safe, but it does not best satisfy the user's stated one-library preference plus desired brand recognition.
- The newly installed local `1.34.0` package needs reproducibility verification before any use because expected ESM/type artifacts are missing locally.

Why no other package is recommended:

- `react-icons`, Heroicons, Font Awesome, Material Icons, and legacy `phosphor-react` are not installed or used.
- Adding `react-icons` only for brands would create a mixed-library standard and a larger, less controlled catalog.
- The old `phosphor-react` package should not be introduced; upstream recommends `@phosphor-icons/react` and says the legacy package will not receive new upstream icons.

## Brand-icon decision

Choose option **A: a single library that includes the required brand icon**, with a constrained policy:

- GitHub links may use Phosphor `GithubLogoIcon` from the approved library.
- Use the recognizable regular or fill treatment without modifying its geometry.
- The visible text must still say “GitHub” or “Se kildekoden på GitHub”; the logo is not the only label.
- Brand icons are allowed only when the approved library supplies the brand and the brand is directly relevant to the action.
- If a future brand is absent from Phosphor, default to a text-only brand link. Do not automatically add a second icon package, copy a logo from the web, or invent an exception. A standards review must decide whether the project standard itself should change.
- External-product logos, the GMI Validator product mark, favicon, and QR center artwork are branding assets, not general interface icons. They need brand/asset governance, but they do not authorize homemade SVG controls.

### Share QR edge case

`qrcode.react` accepts an image URL/data URI for its center image; a React icon component cannot simply be passed as that string. Therefore the current handwritten GitHub data URI should not be treated as proof that arbitrary brand SVG is allowed.

In a future reviewed migration, choose one of these in order:

1. render QR codes without center logos and use `GithubLogoIcon` in the surrounding tab/label; or
2. render a Phosphor component as a separately positioned, tested overlay only if scanning reliability remains acceptable.

Do not copy another GitHub SVG. The QR itself remains generated data, not an interface icon.

## Proposed project icon policy

### Approved source

- `@phosphor-icons/react` is the only approved general interface-icon library.
- No new inline SVG UI icons, Unicode/emoji controls, CSS-drawn UI icons, arbitrary text-glyph icons, or other icon libraries.
- Exceptions are categories, not ad hoc assets: VA/cartographic symbology, chart/data marks, product/external branding, third-party-owned controls, QR output, and browser-native decoration.
- Every proposed exception must be identified in review as one of those categories.

### Sizes

- **Compact:** 14px in very dense table metadata or paired with 10–12px text.
- **Standard:** 16px for most buttons, menus, sidebar actions, filters, and text links.
- **Normal:** 20px for modal controls and visually prominent toolbar actions.
- **Prominent:** 24px, or 32px only for empty states, headers, upload prompts, and feature callouts.
- Do not set arbitrary width and height independently. Use the library `size` prop or one agreed square class.

### Weight and rendering

- `weight="regular"` is the default.
- Use `weight="bold"` for 14–16px icons when the regular form is optically too light, and use it consistently within that control group.
- Use `weight="fill"` only for selected/toggled states, compact media controls where fill is conventional, or a reviewed brand/status case.
- Do not use duotone as a default in the compact GIS shell.
- Use `currentColor`; do not hard-code per-path colors.

### Buttons and spacing

- Dense icon-only table controls: at least 28×28px where spacing prevents overlap.
- Normal toolbar/sidebar icon-only controls: 32×32px.
- Modal close and prominent isolated controls: 36×36px; 40–44px is acceptable where the existing layout already provides it or touch use is likely.
- Preserve a clearly visible keyboard focus ring.
- Icons paired with text are normally 14–16px with a 6–8px gap. The text, not the icon, names the action.
- Avoid oversized mobile-style 48–56px buttons in the desktop shell; large upload illustrations are not button targets.

### Accessibility

- Decorative icon: `aria-hidden="true"`; do not add an SVG title.
- Icon with visible adjacent text: icon is decorative and hidden; the text supplies the name.
- Icon-only button: the button has an explicit, action-oriented `aria-label`; the icon is hidden.
- A tooltip may supplement an icon-only button but never replaces the accessible name. It must work on keyboard focus as well as hover.
- Disclosure buttons use a real `<button>`, `aria-expanded`, and when applicable `aria-controls`.
- Status must never be color/icon-only. Include visible text or an accessible status label/count.
- Do not place `aria-label` on both the button and a meaningful icon in a way that creates duplicate names.

### State, color, and semantics

- Default icons inherit text color.
- Disabled controls apply disabled state to the button; icon color/opacity follows the control. Do not signal disabled state only through pale color.
- Blue/cyan is for actions/selection, green for success, amber for warning, and red for destructive/error, but always pair status color with text or an accessible label.
- The same action uses the same icon everywhere: X for close, caret for disclosure, arrows-counter-clockwise for reset, magnifying-glass-plus or frame-corners for zoom-to, share-network for share, table for data table.
- Do not use an “info” icon for settings; use the gear/sliders family when the action changes settings and info only when it explains content.

### External links and brands

- External links may use `ArrowSquareOutIcon` at 14–16px after the visible label.
- GitHub source links may additionally use `GithubLogoIcon` before the label.
- Brand and external-link icons are decorative when visible text already names the destination.
- Links opening a new tab should have `target="_blank"`, `rel="noopener noreferrer"`, and accessible wording or visually hidden text indicating the new tab where appropriate.

### When not to use an icon

- Do not add icons merely to decorate every heading, table cell, or text action.
- Use text for unfamiliar or specialised actions when no icon is unambiguous.
- Do not replace VA object codes, cartographic marks, line styles, chart points, or validation data marks with generic UI pictograms.
- Do not use a brand icon when the visible brand name alone is clearer or when the approved library does not contain the brand.

## UI-icon versus domain/data-symbol boundary

### Interface icons: migrate over time

- close/back/disclosure
- share/reset/upload/download/copy
- map view, 3D view, zoom-to, ruler/measure
- layers/settings/table/filter/search/sort
- info/help/security/external link
- play/pause/loading
- success/warning/error when used as UI status affordances
- analysis and validator **entry-point** icons

### Domain/map/data symbols: do not migrate as generic UI icons

- `MapInner` point-symbol factories and `INFRA_CATEGORIES`
- `FCODE_COLORS`, line weights, drainage hatching, and VA point geometries
- Leaflet `CircleMarker`, `Polyline`, GeoJSON styling, feature markers, and popup-highlight geometry
- `MapLegend` and `3D/Legend3D` swatches that explain data encodings
- incline-profile line, axes, terrain vertices, warning points, measurement points, and hover markers
- Recharts series, bars, dots, legends, and tooltips
- statistics-map markers and temporal data marks
- Three.js pipes, point objects, grid, axes, hover marker, and scene geometry

An analysis button can use a Phosphor chart icon; the chart it opens must remain chart geometry. A layer “zoom to” control can use a Phosphor icon; the VA markers it frames must retain their domain shapes.

## Migration strategy

### Phase 0 — establish and guard the standard

- Approve this recommendation and document the policy in a durable contributor document such as `docs/ICON_SYSTEM.md`.
- Verify a pinned/locked `@phosphor-icons/react` version in a clean install before use.
- Because Lucide has zero source consumers, replace the uncommitted Lucide dependency rather than carrying both packages. Do not leave a transition period with two libraries unless a tested rollback requires it.
- Decide the import convention: direct per-icon CSR paths are the safest compile-time option; named root imports are acceptable only after production bundle/build timing is measured. Avoid `import * as Icons` and name-driven dynamic imports.
- Consider Next package-import optimization only after confirming the correct Next 16 configuration; `next.config.mjs` currently has no icon-package optimization.
- Add a lightweight policy check in a future test/lint task that rejects new general UI `<svg>` and forbidden icon packages while allowing explicit domain/chart files or annotated exceptions.

### Phase 1 — current AppInfo work

- Replace AppInfoModal header/info, close, GitHub, external-link, and history disclosure glyphs with verified Phosphor components.
- Keep the source link visibly labelled and keep its security/accessibility attributes.
- Update the always-visible app-info trigger in `page.js` at the same time so “info” has one representation.
- Do not touch unrelated UI while concurrent modal tuning is still in progress; take a fresh diff before implementation.

### Phase 2 — common shell and repeated actions

- Migrate the 11 repeated X SVGs and glyph close controls first, fixing accessible names and target sizes together.
- Migrate top-level share, reset, statistics, upload, add-layer, WMS, theme, map/3D tab, and sidebar disclosure controls.
- Migrate duplicate cloud-upload paths in `FileUpload` and `GlobalFileDrop`.
- Migrate LayerPanel/LayerManager repeated actions in small reviewed slices: close/remove, zoom-to, reset filters, data table, disclosure, then analysis entry points.
- Add visual regression/manual checks at common desktop resolutions and with keyboard focus.

### Phase 3 — specialised modules

- Tables/data: `LayerDataTable`, `DataDisplayModal`; fix sort semantics and the very small zoom/close targets.
- Statistics: `StatsModal`, `DetailedStatsSection`, `stats/StatsMap`; preserve conventional filled play/pause states and measure bundle output.
- Validator: `FieldValidationSidebar`, `FieldDetailModal`, `MissingFieldsReport`, `ZValidationModal`.
- Analysis: only controls/status affordances in `InclineAnalysisModal`, `StandardsInfoModal`, `DevDiagnosticsPanel`; leave the profile SVG untouched.
- 3D: control/tooltip icons only; leave scene and data marks untouched.
- Share QR: remove or rework handwritten QR center logos under the brand policy and scan-test every resulting QR.

### Phase 4 — remaining legacy cleanup

- Remaining low-priority decorative/status icons, developer UI, CSS spinners, and glyph success messages.
- Review unused starter assets and `Sidebar.js.bak` separately; do not mix filesystem cleanup with semantic icon migration.
- Remove the final obsolete icon dependency only after source and lockfile scans prove there are no consumers.
- Run full build, browser smoke tests, accessibility checks, and bundle comparison before declaring migration complete.

## Risky migration areas

| Area | Why risky | Required safeguard |
|---|---|---|
| `MapInner` VA symbol factories | SVG strings are injected into `L.divIcon`; geometry, anchors, size, popup position, and colors carry domain meaning | Exclude from generic migration; map regression tests only if separately changed |
| Leaflet default controls | Leaflet owns DOM/CSS; layer-toggle icon is a package image and zoom uses internal glyphs | Treat as third-party control; override only as a dedicated map-control project |
| Remote Leaflet marker PNGs | URLs are currently pinned to CDN Leaflet 1.7.1 assets while package is 1.9.4 | Note availability/CSP/version risk, but do not conflate with UI library migration |
| `MapLegend`/`3D/Legend3D` | Marks mirror map and 3D encodings | Preserve correspondence with data symbols |
| Incline profile SVG | Paths, axes, vertices, warning points, transforms, pan/zoom, and hover state are data visualization | Migrate only surrounding controls/status icons |
| Recharts/statistics | Library-generated marks and legends are not application pictograms | Leave charts to Recharts; migrate buttons around them |
| QR center images | `QRCodeSVG` expects a URL/data URI; overlay changes can reduce scan reliability | Prefer no center image or scan-test a library-component overlay |
| Dense LayerPanel/table controls | Tight CSS positioning and 14–20px current targets | Migrate in semantic groups with keyboard/visual checks |
| Client/server boundaries | Phosphor main components use React Context; server components require its SSR entry | Use normal imports only in client graphs; use documented `/ssr` import in server components |

## Immediate AppInfoModal recommendation

Do this after the audit, as a small reviewed change while the feature branch is still uncommitted:

- **Header information icon:** Phosphor `InfoIcon`, `size={32}`, `weight="regular"`, `aria-hidden="true"`. Use the same family at 16px in the page trigger and 20px in the contact card instead of separate handwritten info drawings.
- **GitHub source-code action:** visible text “Se kildekoden på GitHub” plus `GithubLogoIcon` at 16–18px, regular or fill after visual review. Keep the link text; do not make the logo the only label.
- **External-link indicator:** `ArrowSquareOutIcon` at 14–16px after the text, `aria-hidden="true"`. Keep `target="_blank"` and `rel="noopener noreferrer"`; add screen-reader wording for a new tab if the project's link convention requires it.
- **Close:** `XIcon` at 20px, normally `weight="bold"`, inside the current labelled button. Keep `aria-label="Lukk"`, hide the icon, retain the strong focus ring, and preserve a 36–44px hit area rather than using the text glyph `×`.
- **History disclosure:** use `PlusIcon`/`MinusIcon` or a rotating `CaretDownIcon`, but select one disclosure convention project-wide and retain `aria-expanded`/`aria-controls`.

Do **not** reintroduce a guessed Lucide `Github` component. The installed package does not export it.

## Runtime and dependency risk audit

### Current state

- `lucide-react@1.34.0` is the only explicit general icon-library dependency.
- It is newly added relative to `HEAD` and currently unused by source.
- The manifest range is `^1.34.0`; lockfile resolves exact `1.34.0` and declares React support through 19.
- Actual local CommonJS exports contain common UI icons but no GitHub export under `Github`, `GitHub`, or `GithubIcon`.
- The local package's expected ESM, dynamic ESM, and declaration artifacts are missing. Do not assume the package is safe until a future clean-install/build verification explains this.
- No current source has another invalid icon-library import because there are no icon-library imports at all.
- No dynamic icon imports or namespace icon imports exist today.

### Future Phosphor risks and controls

- Use `@phosphor-icons/react`, not legacy `phosphor-react`.
- Pin/lock a verified production version; do not guess export names. Modern components have the `Icon` suffix (`GithubLogoIcon`).
- Phosphor's root export is broad. Its documentation warns some bundlers may eagerly process 9,000+ exported modules. Use measured named imports with correct Next optimization or direct icon paths.
- Phosphor icons contain multiple weights. An [open upstream issue](https://github.com/phosphor-icons/react/issues/148) reports unused weights may not tree-shake fully. Measure the actual Next client bundle rather than relying only on package claims.
- The standard `IconBase` currently renders an SVG and optional `<title>` for `alt` but does not auto-apply `aria-hidden`; explicitly hide decorative icons.
- Phosphor documents `/ssr` for React Server Components. Most current consumers begin with `'use client'` or are imported into a client graph, but future server components must use the SSR entry.
- Do not keep Lucide beside Phosphor after the migration begins. Two packages would create both policy ambiguity and avoidable dependency/bundle overhead.

### Installed third-party boundaries

- `qrcode.react` legitimately renders SVG QR data; it is not an icon library.
- Leaflet legitimately supplies map controls and imagery; do not fork them merely to satisfy the interface-icon rule.
- Recharts and Three.js render charts/scenes, not general UI icons.

## Expected files and dependencies in a future migration

No files below were changed by this audit.

### Dependency/config/documentation

- `package.json`: replace unused `lucide-react` with one verified `@phosphor-icons/react` dependency.
- `package-lock.json`: regenerate through the normal package-manager workflow.
- `next.config.mjs`: only if measured build performance justifies `optimizePackageImports` and the option is verified for the installed Next version.
- `docs/ICON_SYSTEM.md` or equivalent contributor documentation: approved source, semantics, size/weight, accessibility, exceptions, and import rules.
- A future test such as `tests/iconPolicy.test.mjs`: block new icon-library mixing and unreviewed UI SVG/glyph patterns while allowing named domain/chart exceptions.
- Optionally a small `src/components/ui/IconButton.js` or equivalent button primitive to enforce target size, focus, tooltip, and accessible-name rules. This would wrap library icons; it must not define new SVG geometry.

### Likely application files, grouped

- Shell/navigation: `src/app/page.js`, `Sidebar.js`, `TabSwitcher.js`, `ThemeSwitcher.js`, `AppInfoModal.js`.
- Layers/map controls: `LayerPanel.js`, `LayerManager.js`, `MapLegend.js`, UI-only sections of `MapInner.js`.
- Upload/share: `FileUpload.js`, `GlobalFileDrop.js`, `ShareQrModal.js`, `WmsLayerModal.js`.
- Tables/data: `LayerDataTable.js`, `DataDisplayModal.js`.
- Validation: `FieldValidationSidebar.js`, `FieldDetailModal.js`, `MissingFieldsReport.js`, `ZValidationModal.js`, `StandardsInfoModal.js`.
- Analysis/3D: UI-only sections of `InclineAnalysisModal.js`, `DevDiagnosticsPanel.js`, `3D/Controls3D.js`, `3D/Tooltip3D.js`.
- Statistics: `StatsModal.js`, `DetailedStatsSection.js`, `stats/StatsMap.js`, plus `MapView.js` loading state.

### Files/sections not expected in a generic icon migration

- VA symbol-generation and feature-style sections of `MapInner.js`
- `src/data/type_analysis.json`, validation rules, PDFs, and other domain data
- chart path/axis/mark sections of `InclineAnalysisModal.js`
- Recharts data-series code
- Three.js scene/pipe/point geometry
- `MapLegend` and `3D/Legend3D` data swatches except their surrounding collapse UI
- Leaflet package CSS/assets unless a separate control-replacement project is approved

## Validation gates for future implementation

For each migration slice:

1. Verify every imported component exists in the exact locked package using a local export/type probe.
2. Build from a clean dependency install and verify package artifacts.
3. Run existing tests plus a browser smoke test; open each changed modal/control.
4. Keyboard-test icon-only controls, disclosures, modal focus/escape behavior, and tooltips.
5. Inspect accessible names; ensure decorative SVGs are hidden and status is not color-only.
6. Compare key visual states at desktop sizes: normal, hover, focus, active, disabled, error/warning, dark/theme variants where applicable.
7. For map/QR changes, verify marker anchoring, Leaflet controls, QR scanning, and high-DPI behavior.
8. Compare production client bundle/build timing before and after; reject wildcard/dynamic import regressions.
9. Search for forbidden sources and confirm only documented domain/third-party exceptions remain.

## Explicit non-goals

- No application code, tests, packages, dependencies, lockfiles, config, or existing docs were changed.
- No icon was replaced and no visual style was reformatted.
- No commit, push, merge, deploy, reset, revert, or stash operation was performed.
- This audit does not redesign VA/cartographic symbology.
- This audit does not replace Leaflet controls or markers.
- This audit does not replace Recharts, SVG chart geometry, Three.js geometry, QR generation, product branding, or browser decoration.
- This audit does not claim every legacy icon must migrate immediately.
- This audit does not approve arbitrary custom icons through Phosphor's custom-icon API; that would recreate the homemade-icon problem.

## Decision summary

- **Current systems:** inline SVG is dominant; glyph/emoji/CSS and third-party/map systems are secondary; Lucide is dependency-only.
- **Approximate counts:** 71 literal SVG sites; about 65 UI/branding/loading sites, 6 non-interface SVG sites; about 27 active glyph/emoji tokens; at least 4 CSS-drawn icon-like indicators.
- **Current de facto standard:** none; copied 24×24 stroke SVG is the visual convention.
- **Recommended library:** `@phosphor-icons/react`.
- **Brand decision:** use verified `GithubLogoIcon` from the same approved library; default future missing brands to text-only pending standards review.
- **Highest priority:** prevent invalid exports, resolve the anomalous unused Lucide install, label four unnamed icon-only controls, fix the non-semantic 3D disclosure, and stop color/glyph-only status meaning.
- **Migration shape:** policy/AppInfo first, common shell and repeated actions second, specialised modules third, remaining legacy cleanup last; never sweep map/data symbols into the UI migration.
