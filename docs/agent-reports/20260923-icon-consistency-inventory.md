# GMI Validator icon consistency inventory

Date: 2026-09-23. Read-only source inventory at `feature/styling-overhaul-integrated`, HEAD `7bdd89607f090f7aa5b0434dc022a14030eb5717`. This is a planning inventory, not a visual or runtime accessibility certification. No application code, tests, dependencies, or the pre-existing `20260923-s5a-reconnaissance.md` report were changed.

## Libraries and intended vocabulary

`package.json` declares `@phosphor-icons/react` `^2.1.10`, imported directly from `@phosphor-icons/react`. It is the only general-purpose action icon package found. `qrcode.react` (`QRCodeSVG`) generates QR codes; it is not an action-icon family. Recharts, Leaflet, and Three.js have chart/map/scene roles and their marks are excluded below.

Phosphor regular is already established across the AppInfo, shell identity, contact, and map-toolbar controls. There is no second installed general-purpose icon library, but many controls use hand-authored inline SVGs (often compact Heroicons-like path geometry) and a few use text arrows/crosses or emoji. Those constitute the main convergence work. Phosphor icons are normally `aria-hidden="true"` beside named controls. Exceptions worth normalizing include several bold-weight Phosphor icons in otherwise regular contexts.

## Action icon inventory

| Component/file | Current icon | Source/library | Purpose | Classification | Recommended roadmap point |
|---|---|---|---|---|---|
| `src/components/ProductHeader.js`, `src/app/page.js` | `InfoIcon` regular; `EnvelopeSimpleIcon` regular | Phosphor | About and contact | Intended regular vocabulary; decorative glyph hidden and controls labelled | Keep; S12 verify consistency |
| `src/components/AppInfoModal.js` | `InfoIcon`, `XIcon`, `GithubLogoIcon`, `ArrowSquareOutIcon`, `CaretDownIcon`, `ChartBarIcon`, regular | Phosphor | Modal identity/close, source link, history disclosure; chart mark in mockup | Action icons regular; chart illustration excluded | Keep; S10 may converge with modal work, chart remains excluded |
| `src/components/MapPaneToolbar.js` | `ShareNetworkIcon`, `ArrowClockwiseIcon` regular; `DotsThreeIcon` bold | Phosphor | Share, reset/upload, overflow | Same family, but bold overflow weight departs from regular neighbours | S12; opportunistically when toolbar is next owned |
| `src/components/TestModeControl.js` | `GearSixIcon` bold | Phosphor | Test-mode state/control | Family correct, weight differs from intended regular action set | S12 |
| `src/components/validation-v2/ValidationV2Workspace.js` | inline funnel, sort arrows, reset glyph; `XIcon` bold | Hand-authored SVG + Phosphor bold | Filter/sort/reset/close | Clear non-regular source and variant inconsistency | S5 owner if convenient; otherwise S12 |
| `src/components/validation-v2/ValidationV2FieldInspector.js` | `XIcon` bold | Phosphor | Close inspector | Family correct, bold while other close controls are regular | S5 owner if convenient; otherwise S12 |
| `src/components/validation-v2/ValidationV2FieldInfoModal.js` | inline crossed paths | Hand-authored SVG | Close field info | Ordinary close action rendered in duplicate custom geometry | S5 owner if convenient; otherwise S12 |
| `src/components/validation-v2/ValidationV2RuleList.js` | inline chevron; `ArrowSquareOutIcon` bold | Hand-authored SVG + Phosphor bold | Expand/collapse and show details | Non-regular chevron; bold external-link icon differs from regular AppInfo link | S5 owner if convenient; otherwise S12 |
| `src/components/LayerManager.js`, `LayerPanel.js`, `Sidebar.js` | `▼` text glyphs; inline eye, zoom, trash, reset, table, filter/analysis and disclosure SVGs | Text glyphs + hand-authored SVG | Layer visibility, zoom, remove, disclose, reset, open data/analysis | Ordinary action concepts outside Phosphor; visual style varies between related layer and legacy-sidebar actions | S12 final convergence; opportunistic within future S4-owned refinements |
| `src/components/LayerDataTable.js` | inline zoom and filter-reset SVG; `✕` text | Hand-authored SVG + text glyph | Zoom, reset filters, clear selection | Ordinary action icons; clear-selection cross uses text glyph | S12 |
| `src/components/MapView.js`, `MapInner.js` | controls indicated by titles; inline symbols and `✕ Lukk` | Hand-authored SVG + text glyph | Map overlays, measurement reset/close and map actions | Ordinary UI controls mixed with map-specific symbols; classify individual controls at S7, keep map marks out | S7 for owned chrome, otherwise S12 |
| `src/components/TabSwitcher.js` | inline map and 3D-view pictograms | Hand-authored SVG | Kartoversikt / 3D-visning switch | UI actions, but map/3D pictograms carry view meaning; review in owning S7/S9 slice before generic convergence | S7/S9 |
| `src/components/FieldValidationSidebar.js` | inline close and collapse arrows; `EnvelopeSimpleIcon` regular | Hand-authored SVG + Phosphor | Close/collapse Validator; contact | Close/collapse controls are not Phosphor; contact is already regular | S5 owner if convenient; otherwise S12 |
| `src/components/StatsModal.js` | inline upload/municipality glyphs, inline close; `▲`/`▼` | Hand-authored SVG + text glyph | Metric decoration, close, municipality disclosure | Close/disclosure are action inconsistencies; metric glyphs are data decoration | S11 for owned controls, metrics excluded |
| `src/components/GlobalFileDrop.js`, `FileUpload.js`, `page.js` | inline upload/drag, chevron, and close illustrations | Hand-authored SVG | Upload, drag/drop affordance, close add-file dialog | Upload/close are ordinary UI icon candidates; large drop illustration is decorative and can be considered with S3B | S3B opportunistically; remaining dialog actions S12 |
| `src/components/FieldDetailModal.js`, `MissingFieldsReport.js`, `ZValidationModal.js`, `WmsLayerModal.js`, `StandardsInfoModal.js`, `DevDiagnosticsPanel.js` | inline back, close, expand/status, settings and diagnostic SVGs | Hand-authored SVG | Modal navigation/actions, WMS and diagnostics controls | Ordinary UI candidates; review labels and path purpose per owning feature | Owning feature slice where active; S12 inventory cleanup |
| `src/components/InclineAnalysisModal.js` | inline refresh/settings/close/reset and status shapes; `⛰️`/`⚠` | Hand-authored SVG + emoji/text | Analysis actions and terrain status | Refresh/settings/close/reset are action candidates; terrain/status marks are semantic domain visuals | S8 actions opportunistically; preserve terrain/status meaning |
| `src/components/3D/Tooltip3D.js`, `Controls3D.js` | inline close/scene markers; `🖱️`, `⚙️` | Hand-authored SVG + emoji | 3D controls and object/domain identification | Close is ordinary action; mouse instructions and pump-station symbol communicate interaction/domain | S9 for close; leave mouse/domain symbols intact |
| `src/components/stats/StatsMap.js` | inline play/pause controls | Hand-authored SVG | Timeline playback | Ordinary actions, decorative glyphs hidden and controls have dynamic labels | S11 or S12 |

## Clear ordinary action-icon inconsistencies

Count: **10 surface-level findings** below, counting a component/surface once even when it contains several related controls. This is a practical planning count, not a count of individual SVG path instances. It excludes product identity, map/chart/3D marks and domain status symbols.

1. **Layer/sidebar control family** (`LayerManager`, `LayerPanel`, `Sidebar`, `LayerDataTable`): many hand-drawn visibility, zoom, removal, reset, table, filter and analysis actions, plus `▼` and `✕` glyphs. These include repeated concepts that should use one stable icon choice and alignment across multi-layer and legacy single-layer surfaces.
2. **Validator controls** (`ValidationV2Workspace`, `ValidationV2FieldInspector`, `ValidationV2FieldInfoModal`, `ValidationV2RuleList`): custom filter/sort/reset/expand/close icons mixed with bold-weight Phosphor close/external-link icons.
3. **Map chrome actions** (`MapView`, `MapInner`): ordinary close/reset-style actions are mixed with inline custom icons and text cross; separate map/measurement symbols before classifying.
4. **Modal/control families** (`FieldDetailModal`, `MissingFieldsReport`, `ZValidationModal`, `WmsLayerModal`, `StandardsInfoModal`, `DevDiagnosticsPanel`): repeated hand-authored close/back/settings/expand/reset concepts across dialogs and diagnostics.
5. **Upload flow** (`FileUpload`, `GlobalFileDrop`, `page.js`): hand-authored upload/drag and add-file close visuals; the large drop affordance is decorative rather than a button icon.
6. **Stats controls** (`StatsModal`, `stats/StatsMap.js`): close and disclosure text/inline glyphs alongside custom play/pause icons. Metric pictograms are data decoration, not actions.
7. **Analysis controls** (`InclineAnalysisModal`): hand-authored refresh/settings/close/reset actions; terrain and warning symbols are not action-icon candidates.
8. **3D close control** (`3D/Tooltip3D.js`): inline close action is a generic candidate; scene markers and mouse instruction emoji are not.
9. **Phosphor weights**: bold `GearSixIcon`, `DotsThreeIcon`, Validator `XIcon`s and rule-list `ArrowSquareOutIcon` break regular-weight consistency. The intended regular variants are already used by neighbouring controls.
10. **Text symbols used for controls**: `▼` disclosure marks in layer/sidebar components, `▲`/`▼` in StatsModal, and `✕` in LayerDataTable/MapInner are typographic substitutes rather than stable named icons. Emoji in control-adjacent 3D/analysis content need case-by-case semantic review and are not all counted as clear action inconsistencies.

The count treats each grouped surface as one finding for roadmap readability; items overlap where bold weights are within a broader component finding. Duplicate concepts especially visible in source include close (`XIcon`, inline SVG and `✕`), disclosure (`CaretDownIcon`, inline chevron and `▼`), refresh/reset (`ArrowClockwiseIcon` and multiple custom reset arrows), and external link (regular AppInfo versus bold Validator link).

## Explicit exclusions: retain outside generic action convergence

| Category | Examples | Treatment |
|---|---|---|
| Product identity | Approved `/brand/gmi-validator-logo.svg`; `BrandWordmark` | Preserve approved asset, geometry, and accessible wordmark treatment. |
| GIS/map symbols | Leaflet markers, `MapInner` generated feature marker geometries, `MapLegend`/`getLegendSvg`, measurement/map-view symbols, map and 3D view pictograms where shape conveys the destination | These encode spatial features or map semantics. Keep separate from generic action icons; assess map control buttons individually in S7. |
| Charts/data visualisation | Recharts marks; `StatsModal` upload/municipality metric glyphs; AppInfo statistics mockup `ChartBarIcon`; timeline data marks | Data/illustration marks are not action-icon inconsistencies. Control buttons inside these surfaces can still converge separately. |
| QR | `ShareQrModal` `QRCodeSVG` and app/GitHub image overlays | Generated encoding and branding overlays must remain readable/scannable; not action icons. |
| 3D scene geometry/material markers | `Scene3D`, `PointObjects`, `PipeNetwork`, `Legend3D`, `Tooltip3D` object markers and material/geometry cues | Preserve domain-specific encoding. Review only generic close/action controls in S9. |
| Domain-specific visual symbols | Terrain `⛰️`, warning `⚠`, pump-station `⚙️`, status marks and mouse-operation emoji/text | Do not replace where doing so could change recognized meaning. Any future action conversion should be individually scoped. |

## Accessibility source observations

- Strong existing pattern: Phosphor action glyphs in ProductHeader, AppInfo, contact and MapPaneToolbar are generally `aria-hidden="true"`; icon-only buttons in these surfaces have `aria-label` or visible text. Validator filter/sort/reset/close and several Stats controls also carry explicit accessible names.
- Hand-authored SVGs commonly carry `aria-hidden="true"` where checked (examples: table zoom, Validator inline controls, Stats close/metric marks). Text glyphs such as LayerManager `▼` and LayerDataTable `✕` are not consistently marked hidden in the source; assess alongside their host button's name.
- Potential label audit targets: LayerManager/LayerPanel/Sidebar icon-only action buttons often use `title` as the apparent name; verify a programmatic name (`aria-label`, visible text, or equivalent) instead of assuming tooltip/title alone is sufficient. `MapInner`'s `✕ Lukk` includes visible text; other map/modal close buttons often use `title` only. `ThemeSwitcher` uses English `title="Change color theme"`; review locale and accessible name in its owner slice.
- Source inspection cannot establish the computed accessible name, keyboard behavior, contrast, focus visibility, or runtime screen-reader output. No runtime accessibility certification is claimed.

## Suggested convergence plan

| Timing | Findings |
|---|---|
| Opportunistic in owning slice | S5: Validator inline controls and bold variants; S7: ordinary map chrome while keeping GIS marks separate; S8: analysis action buttons only; S9: generic 3D close only; S10: AppInfo already largely regular, preserve it; S11: Stats close/playback/disclosure controls only. S3B may address upload/close controls when its surfaces are reopened. |
| Defer to S12 final convergence | Broad repeat-concept sweep across `LayerManager`/`LayerPanel`/`Sidebar`, remaining modal families, all hand-authored ordinary action SVGs, textual disclosure/cross substitutes, and stable naming/alignment across feature surfaces. Check Phosphor regular weight and decorative `aria-hidden` consistently as part of that sweep. |
| Remain untouched by generic pass | Approved product logo/BrandWordmark; GIS feature and legend symbols; chart/data marks; QR codes; 3D geometry/material markers; terrain, warning, pump/domain and other meaning-bearing domain visuals. |

## Requested summary

1. **Icon libraries present:** `@phosphor-icons/react` (general-purpose actions); `qrcode.react` (QR encoding). No other general-purpose action-icon package found. There are extensive hand-authored inline SVGs and text/emoji symbols.
2. **Clear ordinary action-icon inconsistencies:** 10 grouped surface-level findings (see counting note above).
3. **Most important:** layer/legacy sidebar action family has the largest repeated custom-SVG and text-glyph spread; Validator has mixed custom SVG and bold Phosphor; close/disclosure/reset/external-link concepts differ across surfaces.
4. **Remain untouched:** approved product identity, GIS/map and chart marks, QR encoding, 3D geometry/material markers, and meaning-bearing domain symbols.
5. **Final `git status --short`:**
   ```text
   ?? docs/agent-reports/20260923-icon-consistency-inventory.md
   ?? docs/agent-reports/20260923-s5a-reconnaissance.md
   ```
