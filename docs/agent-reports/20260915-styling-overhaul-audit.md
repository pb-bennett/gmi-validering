# GMI Validator styling overhaul — audit and migration plan

Date: 2026-09-15. Scope: repository audit and planning only. Baseline: `641387f`.

Context update: separate canonical palette and custom G logo design work already exists. This report treats that work as the design input for eventual integration, not a request to design replacements. Exact palette values and logo geometry remain with that design work; none are invented or implemented here.

Additional shell direction: a unified, persistent product header at the top of the working application's left sidebar is the likely design choice. It would contain the custom G + `MI-Validator`, remain consistent across feature/workspace changes and sit above changing feature content. The start screen would use a larger, centred introductory treatment of the same identity. This is a proposed migration direction, not implemented baseline behaviour or a final size decision.

## 1. Preflight / repository verification

All mandatory commands were run before application inspection:

| Command | Recorded output |
| --- | --- |
| `git rev-parse --show-toplevel` | `C:/GitHub/gmi-validering-style` |
| `git branch --show-current` | `feature/styling-overhaul` |
| `git rev-parse HEAD` | `641387f11509e2d9492c17db37eca4b308bd8d3f` |
| `git rev-parse 641387f` | `641387f11509e2d9492c17db37eca4b308bd8d3f` |
| `git status --short --branch` | `## feature/styling-overhaul` — clean; no file entries |
| `git worktree list` | `C:/GitHub/gmi-validering 641387f [feature/validator-v2-v32-ui-polish]`; `C:/GitHub/gmi-validering-style 641387f [feature/styling-overhaul]` |

Preflight passed. The main repository's checked-out branch is recorded, not changed. Neither another worktree nor `test/validator-v2-v32-ui` was altered. No commits, pushes, merges, deployment or Vercel configuration changes were performed.

### Evidence and limits

This is a static source audit: composition/import tracing, rendered JSX and styling inspection across `src/app` and `src/components`, targeted presentation/layout helpers, existing tests and accepted reports. No browser rendering, uploaded dataset interaction, computed-style inspection or assistive-technology testing was performed. Findings about possible clipping, native control appearance and stacking need later runtime verification; they are not claimed as observed browser failures.

No dev server, build, dependency installation or formatting command was run: these can generate files beyond the one permitted report. Tests were inspected, not executed. Colour ratios below were calculated in memory from source hex values. Only this report was created.

Read the workspace layout plan, Slice 4 exact-scope report and Slice 5 presentation/corrective report. Their historical recommendations are not all current requirements: current source and the user's accepted baseline take precedence. In particular, old mentions of a 430px sidebar, smaller inspector, Slice 6 overlay, additional search/status filters and group map actions are superseded or deferred.

## 2. Executive summary

The application has a working layout architecture but no coherent visual system. It combines Tailwind 4 utilities, five legacy CSS-variable themes, locally repeated controls, inline colours and event-driven hover styling. Newer map toolbar and Validator work introduces slate/cyan details and Phosphor, while most surrounding UI remains gray/blue with independently chosen density and semantics.

The highest-value work is:

1. Map the existing canonical palette work into a small semantic token system for light slate/navy surfaces, turquoise/cyan actions, readable text and distinct semantic states.
2. Share interaction styling and a few behaviour-bearing primitives. Both React JSX and Leaflet HTML strings need access to shared classes.
3. Migrate complete visible regions in sequence, preserving their existing state owners and geometry.
4. Treat map symbols, analysis graphics and chart series as data encodings, separate from brand colour.

Roadmap review conclusion: practicality and usability first; styling second. Visual coherence remains a hard completion objective, delivered through one canonical semantic palette, interaction states, typography/density conventions, restrained borders/radii/elevation and Phosphor action icons. It must not depend on larger controls everywhere, decorative whitespace, a full-width header, logos in feature panels, identical feature layouts, cyan data encodings or structural React rewrites. Secure authoritative design inputs first; isolate the left-header ownership change from appearance changes; use classes before introducing new control components.

The largest regression risks are global font/density changes, table virtualization and sticky offsets, pane measurement, portal placement, stacking contexts and event propagation. A broad search-and-replace of blue, padding or rounded classes would cross behavioural and domain boundaries.

The established palette direction is a predominantly light technical/GIS interface with slate/navy neutrals and turquoise/cyan brand accents, avoiding saturated generic blue for UI branding. The custom G is already being designed separately. Implementation should integrate the approved asset, including its dark structural portions, cyan portion behind the dark geometry and recently increased line weight. The 30px logo / 28px type pairing is an existing experiment, not an accepted layout dimension.

## 3. Application visual-surface map

All paths below are repository-relative. Component filenames without a prefix in this section are under `src/components/`.

### What the user encounters

`src/app/layout.js` supplies Roboto, global CSS and analytics. `src/app/page.js` is the single user-facing page found; the other app routes are API endpoints. Before parsing finishes, it shows a centred title, upload card, conditional error/retry message and conditional Testmodus control. `GlobalFileDrop` overlays the viewport during file drag. Additional uploads reuse `FileUpload` inside a page-owned dialog.

After parsing, `WorkspaceShell` shows the full-height left sidebar and centre/right workspace. Normally `Sidebar` supplies the brand header and `LayerManager`/`LayerPanel`; a conditional legacy single-data branch still exists. Opening Validator replaces the sidebar with `FieldValidationSidebar` → error boundary → `ValidationV2Workspace`. Selecting a field renders the same detail content in a right inspector portal or a constrained-width modal.

That replacement currently also removes the product branding: the branded header is inside `Sidebar.js`, while V2 renders its own `Validator` heading and controls. The proposed persistent product header therefore belongs above the feature switch, in the shared left-sidebar shell. It should remain visible while layer or Validator content scrolls; the feature heading and controls should remain below it. The initial upload screen remains outside this working shell, using the same identity with a separately composed centred landing layout.

The centre pane owns map/3D switching, toolbar and conditional statistics trigger. The 2D map adds Leaflet controls, legend, measurement UI, popups, zoom readout, WMS opener and analysis prompts. Object inspection uses the bottom `LayerDataTable`; full data exploration still exists separately as `DataDisplayModal`. Profile analysis uses its existing lower absolute panel. Share, WMS and statistics are separate modal experiences.

| Visible region / entry | Principal source | Styling and inconsistencies | Migration destination |
| --- | --- | --- | --- |
| Initial title, upload, error/retry, add-layer dialog | `src/app/page.js`; `FileUpload.js`; `GlobalFileDrop.js` | Gray/white card, saturated blue label-button, dashed drag target, red alert; large `p-12` upload padding versus compact workspace. File input is hidden. Global drag backdrop has independent elevation | Shell/onboarding slice; shared button, alert and dialog styles |
| Workspace frame and branded sidebar | `WorkspaceShell.js`; `Sidebar.js`; sidebar switch in `src/app/page.js` | Hard-coded gray shell over variable-driven surfaces; sidebar has a large shadow and z-index 10000. Gradient location-pin badge and small brand type disappear when Validator replaces Sidebar | Shell slice; likely persistent shell-owned product header above the feature switch, compact G + MI-Validator and subtle divider; canonical palette and approved asset layering |
| Layer management and individual layer controls | `LayerManager.js`; `LayerPanel.js` | Scrollable accordion list; visibility, zoom, removal confirmation, add file, Tema/field filters, analysis buttons, reset filters, table opener, WMS opacity. Tiny icon actions, repeated blue action classes and gray text; variables only in parts | Layer slice; IconButton, field styles, disclosure styling and status roles |
| Conditional single-data sidebar | `Sidebar.js` | Overview cards, Tema/type lists, field search/distributions and analysis sections; repeats much of LayerPanel with different padding and headings | Same layer slice where reachable; preserve branch and handlers |
| Map loading, container and analysis prompts | `MapView.js`; `MapInner.js`; `src/app/page.js` | Blue spinner, Leaflet stylesheet, white/amber prompts, inline positioning, mixed variable and fixed controls | Map chrome slice; loading/alert/surface styles with domain renderers preserved |
| Map toolbar, overflow, map/3D switch | `MapPaneToolbar.js`; `TabSwitcher.js`; `MapPanePresentationProvider.js` | Local ToolbarButton already provides 36px minimum height, slate surfaces and cyan focus; tabs retain other styling. Overflow is pane-local and keyboard-dismissible | Shell slice; shared control variants while preserving measured modes |
| Map legend and measurement | `MapLegend.js`; `MapInner.js` | Variable legend frame, fixed gray inner text, domain SVG symbols, cyan selection swatch; measurement panel uses inline geometry and its own controls | Map chrome slice; overlay surface and control classes; keep legend state policy |
| Map object popup | `MapInner.js` around `bindPopup` | HTML strings with Tailwind classes and blue/gray/emerald action hierarchy; data attributes feed listeners | Map chrome slice; shared CSS classes usable outside React; no popup rewrite |
| Validator field list and controls | `validation-v2/ValidationV2Workspace.js`; `ValidationV2RuleList.js`; `ValidationV2ErrorBoundary.js` | Layer select, geometry tabs, filter/search panel, sort menu, refresh, field disclosures, compact counts and Vis action. Gray/slate mixture; blue/cyan focus and active-state mixture | Validator slice; control variants and semantic state adapters |
| Right inspector / fallback dialog | `ValidationV2FieldInspector.js`; `ValidationV2FieldInfoModal.js`; `fieldDetailLayout.js` | Shared content is already extracted. Frames use gray borders, white surface and blue focus; docked close icon is Phosphor, fallback uses hand SVG | Validator slice; shared frame styles, retain non-modal versus modal semantics |
| Resultat, Regel, Detaljer | `ValidationV2FieldDetailContent.js`; `src/lib/validation-v2/fieldDataPresentation.js` | Coverage summary, diagnostic cards, Vis N objekter, contextual tooltip, distribution/source tables, technical disclosure, NOBB links, loading/retry/empty content. Amber versus orange for Sjekk; nested borders and tiny text | Validator slice; status/text/table-surface tokens; keep derivation and exact callbacks |
| Bottom object table | `LayerDataTable.js`; `src/lib/objectTablePresentation.js` | TanStack table/virtualizer; 28px rows and 10px cells; variable surfaces with hard-coded status tints and hover. Geometry tabs or Utvalg/Alle; sticky action/Tema/field columns | Dedicated table slice; shared control styles with table-specific density and layout |
| Full data explorer | `DataDisplayModal.js` | Layer select, header/point/line tabs, object target view, coordinate/attribute tables and terrain actions. Larger native tables, independently styled blue tabs, absolute overlay | Data/analysis slice; dialog styling and shared native-table classes |
| Height check | `ZValidationModal.js` | Summary cards, scrollable missing-Z tables and existing individual map actions; gray surfaces and separate overlay dimensions | Data/analysis slice; status and table styles; preserve index/selection behaviour |
| Profile analysis and settings | `InclineAnalysisModal.js`; `StandardsInfoModal.js` | Lower pane with list, tabs, number input, status checks, terrain loading/retry, profile SVG, hover annotations, settings/radio choices. Yellow warnings, large fixed list and local status helpers | Data/analysis slice; shell/control/graphic-label styling; no calculation changes |
| 3D scene and HTML controls | `3D/Viewer3D.js`; `Controls3D.js`; `Legend3D.js`; `Tooltip3D.js`; `Scene3D.js`; `PointObjects.js`; `PipeNetwork.js` | Light gradient canvas backdrop; translucent rounded-xl overlays, different action colours, fixed tooltip with position clamp. Geometry/materials are data presentation | 3D slice; align HTML chrome, preserve scene/camera/data encodings |
| Statistics | `StatsModal.js`; `stats/StatsMap.js`; `src/app/page.js`; `src/app/globals.css` | Pink animated opener, large light modal; municipality dropdown/search/checks, chart segments, expandable chart/map, ranking bars, timeline range/play, tooltip, skeleton/error/empty states. Blue chart/map colours and very pale labels | Statistics slice; shared controls and chart chrome; separate series palette |
| WMS settings | `WmsLayerModal.js`; `LayerManager.js`; `AuthenticatedWmsLayer.js` | URL/user/password and advanced options, request feedback, connection actions and remove action; ordinary blue form styling. Tile component has no separate visible application panel | Utility-dialog slice; common field/dialog/status styling; no credential or request changes |
| Sharing | `ShareQrModal.js` | App/repository choice, QR, inline SVG images, copy feedback, link; unusually large viewport-relative modal, blue brand graphic | Utility-dialog slice; canonical interaction tokens and approved custom G asset replacing only the app mark where appropriate; retain the GitHub identity and QR behaviour |
| Test/developer UI | `TestModeControl.js`; `DevDiagnosticsPanel.js` | Conditional amber Testmodus capsule, gear and exit; anchored dark diagnostic panel with monospace data and semantic coloured readings | Shell slice for trigger, map chrome slice for panel. Keep diagnostic contrast intentional |

### Present in source but not a current screen

`ThemeSwitcher.js`, `DataDisplay.js` and `DetailedStatsSection.js` have no current application consumer found. `FieldValidationSidebar.js` contains `LegacyFieldValidationSidebar`, but its default export renders only V2. Thus its `MissingFieldsReport.js` and `FieldDetailModal.js` imports do not establish an active user route. These were inspected as legacy styling evidence, not proposed as screens to reactivate. `Sidebar.js.bak` is a backup, not an application styling target. `TerrainFetcher.js` is a background worker component; feedback belongs to its visible consumers.

## 4. Styling architecture findings

### Global styling and Tailwind

- `src/app/globals.css` is the only authored CSS file found. It imports Tailwind and Leaflet, defines five themes, base body/headings, map-measure cursor overrides, a Leaflet control offset and statistics animation. No CSS modules, SCSS, styled-components, component-local style blocks or separate Tailwind configuration were found in source.
- `postcss.config.mjs` uses `@tailwindcss/postcss`; `package.json` uses Tailwind 4. There is no authored `@theme` mapping connecting the custom `--color-primary` family to intended semantic Tailwind utilities. Defining ordinary variables is not a documented project-level utility API. Existing `text-primary` uses in Sidebar need generated-CSS verification, not an assumption that they work.
- Five 12-variable palettes (`blue`, `gray`, `green`, `purple`, `orange`) describe some surfaces, text and brand shades. They lack focus, disabled, selected, overlay and semantic status roles. `ThemeSwitcher` is unmounted; the normal source path uses the default palette. A theme-variable change affects only part of each screen because literal utilities bypass it.
- Body uses variable colours but page and shell explicitly paint `bg-gray-50`; many nested panels explicitly paint white. Global h1/h2/h3 defaults are frequently overridden with local utilities. Global changes have unusually wide effects, including inherited error headings and Leaflet content.

### Quantified patterns

Counts are lexical source occurrences, not rendered DOM counts or distinct controls. Scope: all 45 `.js` files under `src/components`, plus page, layout and globals CSS (48 files). Includes dormant components, comments and HTML strings where matched; excludes `.bak`, tests, dependency CSS and `src/lib`. Counts locate migration pressure, not accessibility coverage.

| Pattern | Count / finding |
| --- | --- |
| JSX `style={` | 141 occurrences; many are necessary computed dimensions |
| `<svg` | 71 occurrences, including custom/domain graphics and embedded markup |
| Files importing Phosphor | 5: MapPaneToolbar, TestModeControl, V2 Workspace, RuleList, FieldInspector |
| Explicit focus variants | 83 `focus:` and 9 `focus-visible:` occurrences; many controls rely on browser defaults |
| `text-[10px]` / `text-[11px]` | 88 / 65 occurrences |
| `text-[9px]` / `text-[8px]` | 6 / 2 occurrences |
| Radius utilities | `rounded` 197; `rounded-lg` 67; `rounded-full` 30; `rounded-md` 18; `rounded-xl` 11 |
| Common literal utilities | `text-gray-500` 239; `text-gray-400` 95; `bg-gray-50` 97; `text-blue-600` 45; `text-blue-700` 35 |
| Case-sensitive six-digit hex examples | `#3b82f6` 11; `#00FFFF` 6; `#ef4444` 6; `#f59e0b` 5. These mix theme, map and chart roles |
| Repeated layer action sequence | `p-1.5 rounded transition-colors hover:bg-blue-100 relative group` 5 occurrences |
| Identical WMS field sequence | `w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm` 4 occurrences |
| Repeated focus sequence | `focus:outline-none focus:ring-2 focus:ring-blue-500` 14 occurrences |

Seven files directly assign `currentTarget.style`: page, Sidebar, LayerManager, MapInner, MapLegend, ThemeSwitcher and Viewer3D. They duplicate hover styling in JavaScript, omit an equivalent explicit keyboard treatment in several cases and can override later CSS. Replace visual assignments with shared interaction classes during each owner's migration, retaining unrelated pointer behaviour.

### Reuse and coupling

There is no common UI primitive directory. Useful local precedents include `ToolbarButton`, `ZoomButton`, `SidebarSection`, `SummaryCount`, `StatusBadge`, `RuleSection`, `InformationRow` and statistics `Skeleton`. Some are feature-specific rather than suitable universal components.

The right foundations already exist: WorkspaceShell owns geometry, MapPanePresentationProvider owns measured modes, inspector/dialog reuse detail content, and LayerDataTable is shared across ordinary and Validator inspection. Keep these boundaries.

Styling also crosses into presentation helpers: `src/lib/validation-v2/fieldDataPresentation.js` returns Tailwind row/text strings; `resultPresentation.js` returns `visualToken` colour names. These are appropriate adaptation points for semantic classes, but must preserve result labels, severity aggregation and NOT_EVALUATED handling. Do not spread a palette refactor into rule evaluation or registry data.

Leaflet `bindPopup` creates HTML with class names and data attributes. A React-only Button system would leave this surface behind. Retain stable hook classes (`vis-i-3d-btn`, `inspect-data-btn`, `show-profile-btn`) and data attributes when adding shared appearance classes.

Inline widths, transforms, SVG coordinates, chart props, virtual row positions and user layer colours are not evidence of bad styling by themselves. Separate dynamic geometry/data from static appearance before replacing anything.

## 5. Colour and semantic-state findings

The canonical palette direction comes from existing separate design work: slate/navy neutrals, turquoise/cyan brand/accent, light surfaces and accessible contrast. No canonical value specification was found in this worktree search; current theme hex values below are baseline evidence, not the canonical palette. The implementation task is to bind approved design values to the required semantic roles, returning any uncovered role to that design work rather than inventing a final colour.

Generic blue interaction styling needing migration includes FileUpload's chooser/drag states; LayerManager add/show/hide actions; LayerPanel analysis, zoom and filter controls; Validator tabs, search focus, filter-active states and `Vis N objekter` diagnostic actions; table segments/reset/hover; WMS fields/actions; data/profile tabs; Share links/segments; and statistics controls. Newer cyan focus rings also need alignment to the canonical focus role. Replace by role, including ordinary Leaflet popup action classes, rather than replacing every blue literal. Statistics series, measurement geometry and FCODE colours require separate data-presentation decisions; a blue link or button is not the same role as a blue plotted line.

| Current colour role | Evidence | Recommended distinction |
| --- | --- | --- |
| Foundation | Theme slate (`#f8fafc`, `#1e293b`, `#64748b`) alongside gray-50/100/500/700 and newer slate utilities | One light neutral family with readable text roles |
| Brand / interaction | Default primary `#3b82f6`, darker `#2563eb`; cyan `#06b6d4` accent; newer cyan focus | Turquoise/cyan brand roles with deliberately darker action/text values |
| Selection | Blue geometry-tab underline, blue filter/row hover, variable-filled Utvalg/Alle | Separate hover, pressed/current and selected-surface roles |
| Error / destructive | Red diagnostic blocks, remove actions, parsing failure, missing Z dots | Error meaning and destructive action are distinct variants even if related colours |
| Warning / review | Amber V2 Sjekk; orange Sjekk in distribution helper; yellow legacy analysis warning | Shared warning palette; retain feature-specific labels and meaning |
| Success | Green Pass counts/table Resultat; neutral Pass distribution rows; green legacy OK | Common success foreground/subtle roles; choose prominence by context, not a green background everywhere |
| Information | Blue guidance panels and links; slate coverage/context | Info surface should not look selected; links stay recognisable independently of colour |
| Promotion | Pink statistics button, Ny badge and ripple | Resolve against brand hierarchy in statistics slice; keep visibility/cue lifecycle |
| GIS data and selection | FCODE palette, layer-specific highlight colour, cyan `#00FFFF` object highlight | Preserve domain categories and distinguish object highlight from brand accent |
| Charts and scene | Stats series palette, timeline new-activity amber, 3D materials, profile lines | Separate categorical/sequential data palette and chart chrome tokens |

Do not replace water-line blue or red network categories with turquoise because the application brand changes. Likewise, profile-warning status, V2 Sjekk and statistics new activity are different concepts even where they share a hue. Semantic presentation should preserve text labels and the current information hierarchy.

## 6. Typography, spacing, borders, radii and elevation

- Roboto is loaded in `layout.js` at 300/400/500/700. `font-semibold` requests 600 without a separately loaded 600 face; verify the resulting weight before choosing a final hierarchy. No font/dependency change is needed merely to establish roles.
- Body copy varies from 12px to 16px; dense UI frequently uses 10–11px and occasional 8–9px. Sidebar brand is `text-base`, start title `text-3xl`, inspector heading `text-sm`, many section headings uppercase 10–12px. Uppercase, bold, colour and borders often compete to indicate hierarchy.
- Monospace is useful for codes, coordinates and raw data. Counts use both `font-mono` and `tabular-nums`; standardise intent, not every value's typeface.
- Tailwind spacing mostly follows its normal scale with compact half steps: p-2, p-2.5, p-3 and px-1.5. Upload p-12, modal p-6 and legacy table px-6/py-4 contrast sharply with Validator px-2/py-1.5. Define a small set of density conventions for workspace versus reading/dialog content.
- Borders mix variables, gray-100/200/300, slate-100/200/300 and unqualified `border`. Bare border utilities need deliberate colour assignment in shared recipes; inherited/current colour should not decide a separator's prominence.
- Radius usage is dominated by generic rounded and rounded-lg without clear control/surface roles. Use a small control radius, panel/dialog radius and pill only for genuinely pill-like elements.
- Shadows range from small card shadows through sidebar shadow-xl, dialog shadow-2xl, translucent map overlays and a custom upward profile shadow. Use borders for adjoining docked panels; reserve stronger elevation for overlays. Any shadow reduction must retain visible pane separation.
- Do not globally increase line-height or control height without measuring dense rows and header overflow. Table font changes can invalidate content-width estimates even when its pixel constants stay unchanged.

## 7. Interactive-control inventory

| Control | Existing implementations | Recommendation |
| --- | --- | --- |
| Primary/secondary buttons | Upload blue label, variable LayerManager action, slate ToolbarButton, gray/blue/emerald popup actions, pink stats | Shared appearance recipes; retain existing button elements and local wrappers. Universal Button only if concrete consumers justify it; decide prominence by action role |
| Icon buttons | Layer p-1/p-1.5 actions; 20px table zoom; 32px Validator close/filter; 36px toolbar minimum | Shared recipe and optional IconButton enforcing name/icon/focus/disabled conventions where justified; preserve compact hit areas within protected geometry |
| Text/search/password/URL/number fields | Four repeated WMS fields; Sidebar field search; Validator search; stats search; profile numeric input | Shared native field classes and optional labelled-field wrapper; retain input types, IDs, values and parsing |
| Selects | Validator layer select, data explorer layer choice and local filter selectors | Same field border/focus/density; retain native select behaviour |
| Checkbox/radio | Layer visibility/Tema filters at 10–14px, analysis status checks, stats accent-blue controls, standards radios | Native controls with shared accent, label spacing and focus; checked state must remain visible. Text colour alone does not reliably style native checkmarks |
| Ranges | WMS opacity and statistics timeline | Shared track/thumb/focus appearance where practical; preserve min/max/step and pointer semantics |
| Toggle actions | Layer visibility/highlight, 3D modes, analysis views | Use clear pressed/current appearance; do not invent a new switch model for existing buttons |
| Tabs / segments | Map/3D, Validator geometry and detail, ordinary table geometry, exact Utvalg/Alle, stats modes, Share | Share visual variants, retain existing tab versus aria-pressed semantics and selection owners |
| Menus / popovers | Toolbar overflow, Validator sort/filter, statistics municipality selector, diagnostics | Shared surface/spacing/elevation first; retain existing Escape/outside-click/focus behaviour. A checkbox selector is not a command menu |
| Badge / status | V2 dots and counts, Resultat text, analysis StatusBadge, test capsule, warning dots, Ny | Semantic tone classes and a small presentational badge only where markup repeats; no shared business-status evaluator |
| Tooltips | Native title, V2 ContextQualifier, Leaflet Tooltip/popups, 3D Tooltip3D, Recharts TimeTooltip | Small accessible tooltip primitive for ordinary help triggers; specialised map/chart/object popovers remain feature-owned |
| Disclosure | SidebarSection, LayerPanel header, RuleList, native details/summary | Shared heading/chevron styles; preserve distinct disclosure state and event handling |
| Empty/loading/error | Upload error, map spinner, Validator text/retry/boundary, stats skeleton/no-data/error, terrain status | Shared text/surface conventions; local content and retry/loading state remain feature-specific |

No general-purpose React primitive is justified for every heading, separator, count or data cell. Shared classes and semantic variables are sufficient for most of those.

## 8. Layout/responsive/overflow findings

### Protected desktop geometry

The proposed product header changes vertical content allocation, not the accepted sidebar width or centre/right geometry. Use a non-shrinking header above a `min-h-0` flexible feature-content region within the existing left column. Keep the header outside the feature's scroll container, rather than fixing it to the viewport or placing a full-width header over the map. Existing `h-full` feature roots need review: retaining a full-column height below a new header could hide the list/footer. A small brand header still consumes real list space; verify it at 380px width, near sidebar resize bounds and in short windows. Preserve the current splitter behaviour, map measurement and 62/38 table proportions.

The sidebar's current resize handle belongs to `Sidebar.js`. Lifting the product header must not casually relocate the splitter or add resizing to Validator mode. If a shared header makes the existing handle's vertical extent shorter, resolve that explicitly while preserving normal-mode resizing. Do not add new collapsed/mobile navigation as part of this direction. At constrained widths, scale/space the approved identity deliberately without changing its geometry, crowding controls or clipping the product name. The larger centred start identity uses its own spacing/type variant; it is not the sidebar header enlarged wholesale.

- `page.js` starts sidebar width at 380px. Normal Sidebar resizes through mouse position while `200 < newWidth < 800`; Validator inherits that width. The resize handle exists in normal Sidebar, not a new Validator-specific splitter.
- `WorkspaceShell` leaves the sidebar full height. The upper centre/right area becomes 62% and the bottom table 38% when open. The table spans the map plus inspector width. Preserve `min-w-0`, `min-h-0`, flex ownership and overflow boundaries.
- The inspector is 38rem (`fieldDetailLayout.js`). `page.js` calculates docking with `viewportWidth - sidebarWidth >= 480 + 38 * 16`. At the default sidebar and 16px rem, this means a 1468px viewport threshold; at 1920px the docked map has about 932px width. Do not change root rem sizing casually: the JavaScript calculation assumes 16px while the CSS width uses rem.
- Fallback is the existing fixed modal, maximum 44rem, with its focus trap; there is no requirement to introduce a drawer. Docked content remains a non-modal complementary region.
- Profile analysis remains `absolute ... h-[45vh]`; page sets primary map/3D height to 55% while analysis is open. It is not currently the 38% table dock. Changing this ownership would be a layout/behaviour project, not styling.

### Actual map width, not browser width

`MapPanePresentationProvider` uses ResizeObserver and bounding-box width. `src/lib/workspace/mapPanePresentation.mjs` sets toolbar narrow below 580px, constrained below 860px and normal otherwise. Legend compact is independently below 1100px. Legend state survives delayed mounts; entering compact mode collapses it without tying every toolbar transition to a reset.

At 1920px with sidebar and inspector, the toolbar can be normal while the legend is compact. This is intentional. Preserve the separate thresholds, control priorities, overflow reset label and focus restoration. Leaflet's base-layer control has a global 58px top margin reserving the toolbar row; larger toolbar heights can cause collisions.

MapSizeInvalidator in `MapInner.js` observes resize and invalidates Leaflet. The 3D Canvas is parent-sized. Keep both. Statistics trigger appears only when the map owns the workspace bottom-right corner; an already open StatsModal remains independent of later pane changes.

### Scrolling and constrained regions

- Body and page lock viewport scrolling. Every long content region therefore needs a working inner scroll container. Sidebar list, inspector content, table, profile list, data explorer and statistics each own separate scroll regions.
- Table uses `contain: strict`, one overflow-auto viewport, absolute virtual rows and cumulative sticky offsets. Action gutter is 36px, row height 28px, Resultat width 86px. Context field widths derive from complete immutable scope (104px all-missing; populated up to 320px); Tema up to 160px; ordinary contextual attributes 64–220px. This is content-aware estimation, not permission to replace widths with arbitrary CSS.
- Sticky cells have opaque backgrounds; contextual status tint is inline. Row hover can therefore be visually weaker on pinned cells than on scrolling cells. Verify combined hover/status/selection, retaining opacity and avoiding see-through text.
- Detail source tables and distribution tables intentionally scroll internally. Long codes/names mix truncation, two-line clamping, break-all and break-words; useful full-value titles must survive migration.
- `LayerManager` requests `overflow-y-auto overflow-x-visible`; CSS overflow-axis interaction may still clip descendants. Nested popup placement needs runtime checks.
- No authored scrollbar system was found. `scrollbar-hide` in profile tabs has no local definition/plugin in the inspected configuration. Keep scroll affordances visible and avoid adding hidden-scrollbar conventions.
- Local responsive rules include sm modal padding/sizing, xl stats grid, stats `clamp(20rem,38vw,30rem)`, 94vh stats frame, 96vw share/statistics widths and statistics cue media queries at 420/280px. These are not a coherent mobile layout. Preserve sensible fallback and record limits rather than claim full mobile support.

### Overlay layering

Current values include table local 10/20/30; 3D chrome 50; Leaflet/map overlays around 1000/1100; toolbar 1200 and nested overflow 1300; data/Z/profile 2000; standards 2100; sidebar 10000; add-file 10001; WMS/remove confirmation/3D tooltip 10002; stats/share/Validator modal 10003; drag overlay 10005. These numbers live in different stacking contexts and cannot be compared as one flat ordering.

Use documented layer roles later, but retain portal/container ownership until tested. An opacity, transform, isolation or overflow change can matter more than the numeric z-index.

## 9. Iconography and branding findings

### Existing design references and worktree assets

A follow-up search checked asset/prototype filenames and palette/logo references in source, public assets and documentation. No canonical palette specification or custom G prototype/reference file was identified in this worktree. Inspected `public/file.svg`, `globe.svg`, `window.svg`, `next.svg` and `vercel.svg`: these are generic file/globe/window or framework marks, not the custom G. `src/app/favicon.ico` is an existing branding touchpoint but was not visually decoded in this static audit. `globals.css` contains the old five-theme values, and `src/lib/3d/colorMapping.js` is GIS data styling; neither is a canonical UI palette reference. The separate design work described by the user remains authoritative context even though its assets were not located here. No other worktree was searched or altered.

`@phosphor-icons/react` is already installed at 2.1.10. Current imports cover toolbar share/reset/overflow, developer gear, selected Validator actions and close icons. Most icons remain hand-authored SVG with varying stroke widths, filled paths and 12/14/16/18/20/24px boxes. Text triangles, arrows and other glyphs also appear in disclosure/sort UI. Native Leaflet controls remain their own system.

Use Phosphor for ordinary actions during each owning surface migration. Define a default weight, optical alignment and icon sizes paired with control density. Decorative icons should be hidden from assistive technology while controls have stable names. Do not convert geographic symbols, QR SVG, charts, profile drawings or Three geometry into action icons.

Brand touchpoints are the start-screen `GMI Validering`, sidebar `GMI Validator` and subtitle `Innmålingskontroll`, page metadata, favicon, and ShareQrModal's embedded app image. There is no shared Brand component. The sidebar pin and ShareQrModal's `APP_ICON_URI` are different existing illustrations, not copies of the custom G. The separate `GITHUB_ICON_URI` represents the repository service and should retain that identity.

### Proposed integration structure — not implemented

Recommended ownership: `page.js` remains the composition root; `WorkspaceShell` (or a small left-sidebar frame it owns) renders one `ProductHeader` above its existing feature-content slot. `ProductHeader` composes `BrandWordmark` with a compact working variant and a subtle divider. `Sidebar` then supplies normal feature content beneath it, and `FieldValidationSidebar` supplies Validator content beneath that same header. This avoids duplicating the brand in each feature and keeps it stable when the selected workspace changes. The `Validator` title, layer select, close action and filter/sort controls remain feature-owned below the product header. Do not move reset/share/test controls into the header without a concrete need.

For the initial file-load screen, page composes an introductory/landing variant of `BrandWordmark` with centred supporting copy and upload surface. It shares the logo source, wordmark identity and accessible name with the working header, while using larger typography, more whitespace and a distinct vertical composition. Exact working/start dimensions remain design decisions. Do not render both the persistent working header and the introductory identity in the initial state.

- Keep one approved logo asset, preferably the supplied vector when available, at a clear location such as `public/brand/gmi-mark.svg`. Preserve its viewBox, paths, increased line weight, masks/clips and stacking. Do not redraw it as CSS geometry or a Phosphor glyph. If a component representation is necessary, derive it from that same approved source rather than maintaining a second drawing.
- A small `BrandWordmark` component can compose the mark and `MI-Validator` if the G-replacement treatment is approved. Provide one accessible full name, `GMI-Validator`; avoid both an omitted G in accessible text and a duplicated spoken G. Hide decorative constituent shapes/text from the accessibility tree when an enclosing full label supplies the name. Do not introduce a navigation action merely to display the brand.
- Treat the black/dark structural portion and cyan/turquoise portion as two deliberate asset roles. Cyan must remain visually behind the dark geometry. Preserve the supplied draw order and any layer/height or clipping treatment that prevents thicker cyan strokes from covering dark strokes. This is internal asset composition, not application overlay z-index. Avoid blanket `currentColor` overrides or generic stroke-width rules that flatten the two-colour design.
- Use a stable aspect ratio, optical cap-height/baseline alignment and a small intentional gap. Evaluate the existing 30px mark / 28px text experiment at 380px sidebar width, resized sidebars, constrained screens and browser zoom. Compact sizing should scale the approved mark without altering its geometry; keep the name legible and avoid overlapping layer controls. No new collapsed-sidebar behaviour is implied.
- Verify the actual approved cyan against white and subdued surfaces and check dark/cyan intersections after scaling. Exact colours and geometric revisions are design decisions to bring back to the existing design work, not values to choose during implementation by approximation.
- Primary placements are the existing start/header brand and sidebar brand. Share's app QR image and favicon may use an approved small-size export after scan/legibility checks. Reuse the approved source where the QR needs an image URL/data URI. Preserve QR clearance and its existing embedded-image sizing contract unless separately reviewed. Do not add logos to toolbars, Validator results, table rows, map overlays or dialogs merely as decoration.

Only asset/component structure and acceptance criteria are proposed here; no logo was generated, redrawn, recoloured or altered.

## 10. Accessibility/state findings

### Calculated colour examples

Ratios use source six-digit sRGB values: linearise channels, calculate relative luminance `0.2126R + 0.7152G + 0.0722B`, then `(lighter + 0.05)/(darker + 0.05)`. Values assume opaque colours against white; they do not represent every rendered state or establish application WCAG compliance.

| Source colour against `#ffffff` | Calculated ratio | Styling implication |
| --- | --- | --- |
| Accent `#06b6d4` | 2.43:1 | Bright accent is a risky small-text/button-foreground choice on light surfaces |
| Primary `#3b82f6` | 3.68:1 | Existing variable-primary/white compact controls need contrast review |
| Primary-dark `#2563eb` | 5.17:1 | Shows why a distinct darker foreground/action shade is useful; not the proposed final palette |
| Secondary text `#64748b` | 4.76:1 | More robust than very pale metadata; verify actual surrounding surfaces |
| Map highlight `#00FFFF` | 1.25:1 | Cannot be the sole thin boundary on white map symbols; inspect halo/shape and basemap combinations |

Numerous gray-400 and small chart labels are likely readability risks, but no exact computed Tailwind colour ratios are claimed. Transparent surfaces need composited-background testing. The future cyan logo also needs real-background testing; wordmark recognition should not depend on an extremely light G.

### Interaction states

- Newer Validator and toolbar controls have explicit focus rings; they differ between blue, cyan and amber and between `focus`/`focus-visible`. There is no global coherent focus treatment. Native default focus may exist on other controls; absence of a class is not proof of no focus.
- Selected tabs generally add an underline or fill and weight. Preserve these redundant cues. V2 exposes aria-selected/tab semantics and exact Utvalg/Alle uses aria-pressed; do not reduce these to colour-only spans.
- Disabled styles vary: opacity-40/50, cursor-default/not-allowed, disabled background, or just the native disabled property on coloured layer icons. Disabled controls can still look active in the layer action strip. Explicit disabled variants should suppress misleading hover treatments.
- Many icon buttons depend on `title`; some have aria-label, others do not. Title-only help is unreliable for touch and easy to miss for keyboard users. Explicit accessible names and a visible focus state deserve priority.
- Table zoom is 20×20px; context help is 16×16px; some layer checks are 10–14px. These need hit-area and spacing review. Do not globally enlarge the table row to solve a single button.
- V2 ContextQualifier already responds to focus/blur, pointer and click, with tooltip semantics. Preserve that useful pattern. Native title truncation hints, Leaflet object popups, chart hover tips and the interactive 3D object panel require distinct handling.
- Existing red/amber/green status text and labels should remain. A coloured dot alone or hover-only result explanation should not become the sole status carrier.
- Statistics cue has a reduced-motion rule and runtime check. Other spinners, pulse placeholders, transforms and transitions lack a common reduced-motion convention. Keep loading understandable when animation is reduced.

Existing behavioural accessibility gaps (upload keyboard reachability, generic dialog focus management, div-based table navigation) are separately logged in section 15. They are not silently bundled into a styling refactor.

## 11. Recommended design-system foundation

Use CSS custom properties as the shared runtime source, populated from the existing canonical palette design when approved, with deliberate Tailwind 4 semantic utility exposure or authored class recipes. Keep the number of roles small. A token should describe a visual responsibility shared by consumers, not rename `validator-header-blue` or each old hex. Brand/action roles must remain distinct from success, warning, error and info; the custom G's approved two-colour treatment is not a licence to recolour semantic statuses or domain symbols.

| Token group | Roles actually needed |
| --- | --- |
| Background/surfaces | app background; primary surface; subdued/inset surface; overlay/elevated surface; backdrop; intentional inverse diagnostic surface |
| Text | primary; secondary; muted-but-readable; inverse; link; placeholder |
| Borders | subtle separator; normal boundary; interactive/strong boundary |
| Brand/action | accent; accent-hover; accent-active; on-accent foreground; accent-subtle; accent foreground on light |
| Interaction | neutral hover; pressed/current; selection background/foreground/border; focus ring and offset; disabled foreground/background/border |
| Semantics | success, warning/review, error, info: foreground, subtle surface and border; destructive action variant separate from passive error |
| Typography | brand/title, panel heading, body, compact control/body, metadata, code; explicit line heights and supported weights |
| Density | standard and compact control sizes, compact table row contract, icon box versus hit area, section/content padding |
| Shape/elevation | control radius, panel/dialog radius, pill; small overlay shadow, modal shadow, pinned-column separation |
| Layering/motion | pane chrome, popup, modal, drag-overlay roles; focus/transition durations and reduced-motion behaviour |

Maintain a separate small data-visualisation palette contract where JavaScript consumers require explicit values (chart series, Three materials, Leaflet symbols). CSS variables can style HTML/SVG chrome but are not a universal substitute for canvas/WebGL colour values. No dependency is needed to begin this work.

Avoid a global palette flip while old literal classes remain. After S0, introduce canonical semantic tokens without rebinding all legacy variables or changing global dimensions; apply the tokens region by region. This refines the earlier suggestion of baseline-compatible defaults: use one canonical target vocabulary, not duplicate old/new semantic palettes. Keep legacy variables for their existing consumers temporarily; a bridge is justified only when it actually reduces migration work and has an explicit removal list. Do not create per-feature temporary themes or resurrect the dormant theme chooser. Final convergence requires all active UI chrome to use the canonical roles; unchanged domain encodings and intentional inverse surfaces are not exceptions to that requirement. Any retirement of dormant five-theme code is a separate cleanup decision.

## 12. Recommended shared primitives

Adoption order is tokens → shared appearance classes/recipes → narrowly justified React primitives. The audit's duplication counts justify shared appearance, not automatic component extraction. Preserve existing DOM elements, refs, event handlers, dimensions and state ownership. A new component must demonstrate either repeated semantic enforcement or meaningful consumer simplification; otherwise use the recipe on the existing element. Do not add a UI library or a broad variant framework.

| Candidate | Form | Why shared / boundary |
| --- | --- | --- |
| Button | Shared classes first; no universal React wrapper required | Local ToolbarButton already preserves refs and focus; WMS submit/action controls and Leaflet HTML strings can share appearance without replacing elements. Introduce a wrapper later only with demonstrated consumer benefit |
| IconButton | Shared recipe; optional small single-button component | Repeated accessible names, icon boxes and disabled/focus treatment justify earlier consideration. Preserve current hit-area constraints and forwarded refs/events; no extra wrapper DOM, no blanket enlargement or table conversion in S2 |
| Field styles | Classes first; labelled wrapper only where useful | Inputs/selects need common density and states, not a new form state library |
| Checkbox/radio/range | Native elements plus classes | Existing state handling is simple; no custom replacement needed |
| Segmented controls / tabs | Shared styles; small controlled component where semantics match | Exact scope buttons, mode segments and true tabs must not share an assumed keyboard model |
| Status badge / tone classes | Presentational badge plus semantic recipes | Shares border/text/background, never converts Validator or analysis status logic |
| Panel / section header / toolbar | Mostly classes; retain current layout components | Avoid wrappers that change flex size, clipping, DOM depth or stacking |
| Dialog frame | Shared shell styling; behavioural primitive only after explicit accessibility scope | Many repeated frames; preserve focus trap in V2 and non-modal inspector. Do not accidentally make all panels modal |
| Tooltip | Shared visual tokens first; component only when existing equivalent consumers justify it | Preserve V2 ContextQualifier behaviour; do not add a universal tooltip controller or retrofit all title attributes in styling work. Leaflet, Recharts and 3D positioning stays feature-specific |
| Empty / loading / alert treatment | Classes and optional small presentational component | Consistent hierarchy while messages, retry handlers and progress meanings stay local |
| Brand / product header | Shared wordmark and approved asset; compact ProductHeader owned by the left shell | Persistent working identity across feature switches; larger centred start composition shares identity, not the whole header layout. Preserve dark/cyan layer order and accessible full name |

Keep virtual table, Validator summaries, source-value tables, map symbols, profile drawing, chart model and diagnostic panel feature-specific. Share presentation vocabulary without building a universal data-table or universal popup abstraction.

## 13. Controlled migration plan

### Governing constraints inherited by every slice

These are implementation constraints, not merely risks to observe. A deviation needs separate evidence, measurement and scope agreement; it must not be introduced incidentally to obtain visual uniformity.

- Preserve useful workspace area: no full-width application header, no added brand strips in feature panels, no decorative spacing or global control enlargement. The compact product header belongs only at the top of the left column; the larger centred identity belongs only on the start screen.
- Preserve root/rem sizing. Inspector CSS is 38rem while docking arithmetic assumes `38 * 16` plus a 480px map allowance. Keep that relationship valid and the 44rem fallback frame contract; do not solve fit issues by silently changing base font size.
- Sidebar starts at 380px; preserve normal-mode mouse resizing and its existing `200 < width < 800` bounds. Validator inherits the width; do not introduce a new Validator splitter.
- Preserve the shell's upper/table 62/38 relationship and full centre/right table span. Profile retains its separate 55% primary / 45vh lower-pane arrangement; it is not to be redocked as part of styling.
- Preserve 28px virtual rows, 36px action gutter, complete-scope content-width estimation, bounded contextual widths, cumulative sticky offsets, opaque pinned cells and table scroll containment. Density/font changes that violate these contracts require separately measured justification.
- Measure the actual map pane. Keep toolbar thresholds at 580/860px and the independent legend compact threshold at 1100px; do not merge thresholds. Preserve legend state policy, toolbar overflow priority/focus restoration and the existing 58px Leaflet selector clearance.
- Preserve Leaflet ResizeObserver/invalidateSize and parent-sized 3D Canvas. Do not add padding/wrappers that inadvertently change observed ownership.
- Preserve stacking/container/portal ownership, except the explicitly bounded left product-header ownership change in S3A. Reproduced positioning defects belong to a separate task; no blanket z-index renumbering or portal migration.
- Preserve Validator logic, counts, exact object scope, tab/field ownership, table session independence, row hover/click/zoom and Validator-owned cleanup. Feature switches may perform existing unmounts; appearance changes must not introduce new remounts or keep-alive behaviour.
- Preserve all section 15 functional backlog exclusions. Shared styling does not authorise upload activation, keyboard-navigation, modal focus, popup security, layer targeting, domain-colour or unrelated tooling fixes. No deferred Validator/table functionality is added.

### Design-input gate and dependency policy

S0 is a non-application design-input gate before S1 implementation. This report-only task does not authorise creating its proposed files. Later implementation needs an explicit scope permitting those assets and source changes. The default order below is sequential for one agent; hard dependencies are distinguished from convenient review order. Do not introduce provider/state infrastructure or compatibility layers merely because work has A/B checkpoints.

### Work categories

1. **Foundation/design-system:** map existing canonical palette work to semantic tokens, Tailwind exposure, density/state/icon rules and legacy bridge boundaries; identify missing design decisions without designing a replacement palette.
2. **Shared primitives:** appearance/control recipes first; small React components only when justified.
3. **App shell:** separate product identity/left-column ownership (S3A) from shell/onboarding appearance (S3B).
4. **Feature/screen migrations:** layer management; Validator; bottom table; map chrome; data/analysis; 3D; utility dialogs; statistics.
5. **Small final polish:** remaining inconsistencies, bridge retirement and cross-surface verification.

The slices below follow existing state/layout ownership. Each is a reviewable styling change with its own acceptance gate, not an instruction to implement now. Migration may be reviewed over several slices before release; do not deploy intermediate work without explicit approval. Temporary coexistence is local to unmigrated regions, not a web of compatibility selectors.

### S0 — Authoritative design inputs (no application styling)

- **Purpose/scope:** obtain the approved canonical palette specification/reference and current G vector/reference from the existing design work; place them in the styling worktree with recorded provenance/version and a clearly identified authoritative source. Do not reconstruct either from prose, current theme values or an older export.
- **Likely files:** proposed `docs/design/` reference/specification and approved asset source under `public/brand/` or an asset directory matching its supplied format. Paths are proposals, not files created in this audit. Keep one editable/vector authority; identify any approved derived export.
- **Dependencies:** user/design-owner supplies or identifies the references and confirms which versions are current; future permission for these filesystem changes.
- **Excluded:** application imports, CSS changes, logo redraw/recolour, palette invention, dependencies, deployment. No image-generation task is implied.
- **Risks:** stale G before line-weight correction, missing source geometry, screenshot-only palette treated as exact values, mistaken brand/data colour mapping.
- **Acceptance:** palette source includes usable approved values or unresolved roles explicitly sent back for design resolution; G source/reference preserves dark structure, cyan behind it and thicker-stroke overlap correction. Record that 30px/28px is exploratory. Reference paths/version and authority are clear; S1's required roles have approved mappings or explicitly approved retained semantic values. Exact G vector can arrive before S3A if only a current approved reference is supplied at S0; do not trace/redraw it to compensate.

### S1 — Foundations and baseline contract

- **Purpose/scope:** map S0's approved values to semantic roles, with type/density rules and representative state samples; capture baseline views. Add canonical tokens and explicit utility/class exposure without globally rebinding old consumers. Keep existing dimensions and font family.
- **Likely files:** `src/app/globals.css`, read/reference `src/app/layout.js`, proposed shared style definitions; no dependency/config churn required.
- **Dependencies:** S0 acceptance, agreed role mapping and later implementation authorisation. Audit/planning can proceed without inputs; S1 implementation should not guess their values.
- **Excluded:** font-family/root-size changes, palette-wide replacement, theme chooser activation, layout changes.
- **Risks:** global cascade, Leaflet inheritance, bare borders, reduced motion, unintended rem changes.
- **Acceptance:** generated semantic classes exist; old screens retain baseline geometry; token roles cover representative neutral, semantic, focus and disabled combinations; calculate chosen palette contrasts before approval.

### S2 — Shared appearance/control recipes

- **Purpose/scope:** establish a minimal set of button/icon-button, field, status and tab/segment appearance recipes, including hover/focus/active/disabled. Prove them on the existing local ToolbarButton and repeated WMS fields, preserving elements and control dimensions. An optional IconButton may enforce recurring names/icon sizing only if its initial consumers justify it; a universal Button is not a deliverable.
- **Likely files:** shared CSS/style definitions, `MapPaneToolbar.js`, `WmsLayerModal.js`; optional single-element IconButton file only if justified. Classes must also be usable on Leaflet HTML strings later.
- **Dependencies:** S1.
- **Excluded:** generic table/form abstraction, new state/provider/variant framework, universal Button extraction, modal/tooltip behavioural rewrite, broad call-site conversion, table zoom replacement and blanket hit-area increases.
- **Risks:** ref forwarding, default button type, event propagation, inherited classes overriding disabled/focus states.
- **Acceptance:** same DOM roles/elements, callbacks, names, refs, event propagation and disabled behaviour; toolbar overflow focus restoration works and WMS input types/submission are unchanged. Compact controls fit existing dimensions. If a component is introduced, document concrete consumer benefit and verify semantics; otherwise recipes alone complete S2.

### S3A — Product identity and left-shell structure

- **Purpose/scope:** shared BrandWordmark from the approved asset; one compact ProductHeader above the normal/Validator feature slot; remove old Sidebar-owned duplicate brand markup. Put existing feature headings/controls below it. Give the initial screen a larger, separate centred identity composition. Make only the outer sizing changes necessary to support the header.
- **Likely files:** `page.js`, `WorkspaceShell.js`, `Sidebar.js` header/outer sizing, `FieldValidationSidebar.js` / `ValidationV2Workspace.js` outer sizing only if necessary; proposed ProductHeader/BrandWordmark and approved asset. Check LayerManager's `h-full` within the new bounded content region.
- **Dependencies:** S0 approved usable asset and S1 tokens; S2 is the recommended preceding review, not a hard component dependency for a noninteractive wordmark.
- **Excluded:** full-width header, general upload/palette/toolbar restyling, new global controls, feature-state lift/keep-alive, changed splitter behaviour or new Validator resizing, fixed 30px/28px requirement.
- **Risks:** loss of vertical list space, full-height roots overflowing, duplicate header, resize hit-area shortening and changed stacking contexts from moving branding outside Sidebar's z-index owner.
- **Acceptance:** normal Sidebar → Validator → normal Sidebar shows one consistent persistent header; feature scrolling and short-height bottom controls remain usable, normal resize bounds/interaction remain correct, and map area is not reduced by a top bar. Compare approved G layering/contrast and full accessible name at compact/start sizes. Preserve Validator close/table cleanup and inspector behaviour.
- **Lifecycle qualification:** page already conditionally swaps Sidebar and FieldValidationSidebar, unmounting the old branch. Preserve that baseline. Do not interpret “no unexpected remount” as keeping both mounted or persisting previously local state across mode changes. Header remains mounted within the working shell; unrelated renders/branding changes must not add keys or remount the active feature. Leaving/re-entering Validator must retain the baseline reset/cleanup semantics.

### S3B — App shell and onboarding appearance

- **Purpose/scope:** apply canonical page/surface hierarchy to working shell and initial/upload/error/drag/add-file appearance; align map/3D tabs, map toolbar chrome and Testmodus trigger. Reuse S3A identity without changing its ownership.
- **Likely files:** `page.js`, `WorkspaceShell.js` surface classes, `FileUpload.js`, `GlobalFileDrop.js`, `MapPaneToolbar.js`, `TabSwitcher.js`, `TestModeControl.js` and their shared recipes.
- **Dependencies:** S1–S2 and accepted S3A ownership/geometry checkpoint.
- **Excluded:** new header structure, parser/tracking/reset changes, upload keyboard activation repair, toolbar priority/threshold redesign, diagnostics logic and generic modal focus repair.
- **Risks:** changed control footprint versus 58px Leaflet clearance, upload padding at short heights, Testmodus truncation and accidental pane reflow.
- **Acceptance:** start/done/error/drag/add-file/test states at 1920×1080 and constrained/short windows; all map-pane toolbar modes, focus return, tabs and independent legend behaviour unchanged. Header checkpoint stays green, no decorative whitespace consumes workspace, and upload behaviour is unchanged.

### S4 — Layer management and sidebar contents

- **Purpose/scope:** migrate complete layer cards, analysis icon strip, Tema/field controls, WMS row and removal confirmation; align conditional legacy single-data content with the same roles.
- **Likely files:** `LayerManager.js`, `LayerPanel.js`, remaining active `Sidebar.js` content.
- **Dependencies:** S2 and S3A/S3B shell checkpoint.
- **Excluded:** filter/visibility logic, analysis calculations, new multi-select/search, enabling dormant components.
- **Risks:** nested click/checkbox propagation, label truncation, scroll clipping, removal-dialog stacking, KOF disabled affordances.
- **Acceptance:** multiple layers, long names, expanded field groups, all-visible/all-hidden states, KOF-disabled actions and confirmation/cancel visually clear; same filters and map targets before/after.

### S5 — Validator phase with two acceptance checkpoints

S5A and S5B share S1/S2 status tones and one acceptance vocabulary. They are separate implementation/review checkpoints, not new providers or component extraction projects. Do not consider the Validator phase converged until both pass; distinguish temporary old detail appearance at S5A from a changed status meaning.

#### S5A — Validator sidebar/list/filter/sort/count presentation

- **Purpose/scope:** migrate left field-list chrome, layer/geometry controls, filter/search/sort/refresh, disclosures, counts and Vis action using agreed status tones.
- **Likely files:** `ValidationV2Workspace.js`, `ValidationV2RuleList.js`, `ValidationV2ErrorBoundary.js`; feature wrapper appearance only as needed.
- **Dependencies:** S2 and accepted S3A/S3B. S4 is useful adjacent visual context, not a code dependency.
- **Excluded:** detail extraction, controller/state changes, validation logic, new filters/search features, modal/table changes and deferred group actions.
- **Risks:** compact row fit, status visual-token mapping, menu focus, filter/sort interaction, accidentally changing Workspace-owned selected field/tab/controller.
- **Acceptance:** same Feil/Sjekk/Pass counts, labels and list ordering; filters/sort/search/refresh/disclosures and Vis open the same field; 380px compact row stays readable. Verify unsupported/loading/error/empty states and baseline focus/lifecycle before S5B.

#### S5B — Validator detail/results/rules/inspector

- **Purpose/scope:** migrate shared detail content and both frames: Resultat/Regel, diagnostics and Vis N objekter, coverage/distribution/source tables, context help, technical disclosure, docked header and fallback modal.
- **Likely files:** `ValidationV2FieldDetailContent.js`, `ValidationV2FieldInspector.js`, `ValidationV2FieldInfoModal.js`, `src/lib/validation-v2/fieldDataPresentation.js` presentation tones. Keep `resultPresentation.js` outcomes/visual-token contract intact unless a strictly presentational adapter is demonstrated necessary.
- **Dependencies:** S5A acceptance and same S1/S2 vocabulary; no new infrastructure.
- **Excluded:** rules/counts/wording, exact request construction, portal/state/focus ownership, generic modal fixes, table styling and group actions.
- **Risks:** status-versus-selection tint, tooltip/table clipping, nested scrolling, focus restoration, tab persistence and accidental portal remount.
- **Acceptance:** consistent status meaning across list/detail, same result wording/counts and exact diagnostic action; Resultat/Regel and field switches preserve expected state; docked/fallback sizes and focus behaviour hold. Exercise long tables and loading/retry/empty states; verify S5A again only on shared changes/regression concerns.

### S6 — Bottom LayerDataTable

- **Purpose/scope:** align table surface/header, exact segments, result colours, hover/focus and zoom icon while keeping accepted compact geometry.
- **Likely files:** `LayerDataTable.js`; `src/lib/objectTablePresentation.js` as a protected verification reference, change only if separately justified by measured typography.
- **Dependencies:** S2 and S5A/S5B acceptance for status/inspection vocabulary. Keep this separate: table owns virtual geometry, sorting/widths and map interactions used beyond Validator; it is not a V2 detail subcomponent.
- **Excluded:** status facets, search, multi-select, group actions, new resize mechanism, scope/identity/sort/persistence changes.
- **Risks:** virtual row height, sticky opacity/offsets, header wrapping, calculated width and scroll containment; magnifier click bubbling into row click.
- **Acceptance:** exact set counts and Utvalg/Alle stable; Tema/field pinned correctly after horizontal scroll; all-missing Mangler, long headers/values and FORAKLOSS remain readable; hover targets same map object; existing row click and per-row zoom preserved; Validator close clears only its owned table state.

### S7 — 2D map chrome and developer panel

- **Purpose/scope:** unify legend frame, measurement controls, object popup action recipes, zoom/WMS/data opener and analysis prompt surfaces; align diagnostics panel chrome with an intentional inverse surface.
- **Likely files:** `MapView.js`, `MapLegend.js`, selected presentation sections of `MapInner.js`, `page.js` map controls, `DevDiagnosticsPanel.js`, scoped Leaflet overrides in globals CSS.
- **Dependencies:** S2 and S3B; S6 supplies a useful completed map/table visual comparison but is not required to style map chrome. Retain baseline table interaction checks either way.
- **Excluded:** FCODE/data colours, map geometry/layers, selection behaviour, measuring logic, popup HTML security repair and group overlay.
- **Risks:** Leaflet specificity and pane stacking, popup hook classes/data attributes, control positions, disabled map-click propagation.
- **Acceptance:** measure start/reset/stop, popup actions, ordinary hover/highlight, legend transitions, WMS opener and diagnostics at all pane modes; controls remain readable over light and busy basemaps; map resize remains correct.

### S8A — Data inspection / height validation

- **Purpose/scope:** align data explorer and height-check frames, summary/status text, layer/geometry controls, native data tables, attributes/coordinate content and existing loading feedback.
- **Likely files:** `DataDisplayModal.js`, `ZValidationModal.js`; shared native-table appearance recipes only where repeated.
- **Dependencies:** S2 and S3B; S7 is useful for matching existing map action styling, not a new functional prerequisite.
- **Excluded:** possible height-check layer mismatch, generic dialog focus repair, target/index behaviour, terrain request logic, new table functionality and virtual LayerDataTable changes.
- **Risks:** nested native-table/pre overflow, large attribute values, percentage-height overlay and layer/target controls becoming unreachable.
- **Acceptance:** header/points/lines and individual explorer targets, missing-Z/no-findings, long values and terrain states; same baseline map actions. Check short-height/constrained windows and record any existing target mismatch separately; do not block styling on secretly repairing it.

### S8B — Profile / standards analysis

- **Purpose/scope:** align lower profile pane/list/status/chrome, SVG labels, terrain progress, standards settings and radio/number controls without altering analysis.
- **Likely files:** `InclineAnalysisModal.js`, `StandardsInfoModal.js`; local StatusBadge uses shared semantic appearance.
- **Dependencies:** S2 and S3B; reuse S8A table/control recipes where useful, but S8A is not a code dependency. Shared warning tone decisions precede both passes.
- **Excluded:** 45vh docking redesign, standards/calculation changes, terrain fetch changes, SVG geometry/coordinate algorithm changes, layer ownership and keyboard/focus-model fixes.
- **Risks:** custom SVG text/hover positioning, 320px list competing with plot space, nested settings overlay and warning/OK filters; different from S8A's native-table rendering risks.
- **Acceptance:** baseline error/warning/OK cases, terrain pending/error/completed, selected pipe hover and settings changes behave identically; SVG labels remain legible without plot-area loss. Verify short-height/constrained panes and profile/table mutual exclusion. Keep StandardsInfoModal with its actual parent owner rather than splitting it into utility-dialog work.

### S9 — 3D chrome

- **Purpose/scope:** migrate controls, legend, interactive object panel and background treatment to the same light surface system.
- **Likely files:** `3D/Viewer3D.js`, `Controls3D.js`, `Tooltip3D.js`, `Legend3D.js`; Scene3D reviewed for visual context only.
- **Dependencies:** S2 and S3B; S7 and S8B are useful preceding reviews for matching map/profile actions, not requirements to change scene architecture.
- **Excluded:** geometry, material/domain colour corrections, camera/refit/orbit semantics and new selection modes.
- **Risks:** canvas resize, overlay collision and tooltip bounds/transform after text-size changes.
- **Acceptance:** map↔3D transitions, selected point/pipe, object actions, legend expanded/closed and constrained pane; scene geometry and camera behaviour unchanged.

### S10 — Utility dialogs and share branding

- **Purpose/scope:** complete WMS frame/advanced/error/destructive states and Share QR layout/segments/copy feedback using canonical semantic tokens and common dialog/control styles. Reuse the approved custom G for the existing app-brand image where suitable, without changing the GitHub mark or adding decorative logo placements.
- **Likely files:** `WmsLayerModal.js`, `ShareQrModal.js`, approved shared brand asset.
- **Dependencies:** S2, S3A approved identity and S3B shell appearance. No dependency on analysis, 3D or table migration.
- **Excluded:** authentication/proxy/storage changes, link destinations and clipboard/QR generation behaviour; generic focus repair unless separately scoped.
- **Risks:** modal viewport height, nested options overflow, QR graphic clearance and branded QR image readability.
- **Acceptance:** WMS new/existing/advanced/pending/error states using safe mocks; Share both targets, copy state and actual QR scan; constrained-height dialog remains usable. Approved G retains two-colour contrast and internal layering at QR size; any small-size adaptation comes from the design asset work.

### S11 — Statistics

- **Purpose/scope:** migrate full stats modal and opener as one feature: municipality controls, chart/map chrome, ranking, loading/error/empty states and timeline. Resolve pink promotion versus brand hierarchy here.
- **Likely files:** `StatsModal.js`, `stats/StatsMap.js`, statistics trigger in `page.js`, cue CSS in `globals.css`.
- **Dependencies:** S2 and S3B; S7 map-surface recipes are useful to reuse. Can be reviewed independently of analysis/3D/table; do not make new chart/map abstractions a prerequisite.
- **Excluded:** telemetry, aggregate logic, defaults, municipal filtering semantics, new detailed statistics, arbitrary recolouring of all series to cyan.
- **Risks:** Recharts axis/tooltip readability, many-series legend overflow, expanded height calculations, map resize and timeline new-activity meaning.
- **Acceptance:** chart count/cumulative and total/per-kommune modes; unknown municipality toggle, no-data/loading/error, expanded map/chart, timeline play/range and manual viewport ownership; same counts and filters; opener ownership and reduced-motion cue retained.

### S12 — Small final polish and acceptance checkpoint

- **Purpose/scope:** remove exhausted compatibility styling, resolve remaining active-UI icon/state/radius inconsistencies and verify cross-feature coherence. Review dormant theme/code retirement separately instead of deleting it opportunistically.
- **Likely files:** global/shared styles and only enumerated residual active consumers; approved favicon/metadata branding where applicable.
- **Dependencies:** all migrated active surfaces; approved final brand choices if included.
- **Excluded:** functional backlog, dependency upgrade, production configuration, automatic cleanup of unrelated files.
- **Risks:** deleting a still-used variable or styling a third-party/data graphic with a broad selector.
- **Acceptance:** all active consumers accounted for, no unexplained compatibility aliases; full agreed suite/build once at this checkpoint, no unrelated changes; viewport/state comparison and contrast/focus review complete. No release without explicit approval.

## 14. Risks and regression hotspots

Section 13's inherited constraints are binding for the roadmap. The table below explains why they matter; it is not permission to adjust them as routine visual polish. Checkpoint failures should first be classified as new regressions, known baseline behaviour or separate functional backlog before deciding the next action.

| Hotspot | How a visual change can break behaviour | Guard |
| --- | --- | --- |
| Root typography / 38rem inspector | Root font alters CSS width while JS assumes 16px rem | Keep rem baseline; check docking boundary with actual pane sizes |
| Sidebar / shell flex | New wrapper, padding or min-size reduces map or clips list | Preserve flex/min-size ownership, resize bounds and 62/38 split |
| Persistent product header | Feature roots retain full height below header, duplicate branding or remount state on mode switch | One shell-owned header, flexible bounded content slot, narrow ownership change; verify feature lifecycle and scrolling |
| Toolbar / legend | Larger controls overflow measured modes; shared threshold erases legend policy | Test 579/580, 859/860 and 1099/1100px actual map widths |
| Map / 3D size | Border/padding/transition changes container dimensions | Preserve observers and parent sizing; check after each open/close/resize |
| Virtual table | Font/padding changes exceed 28px or estimated column width | Verify virtual alignment, complete-scope sizing and two-line headers |
| Sticky cells | Transparency or wrong left/z-index reveals underlying cells | Opaque surfaces, cumulative offsets, horizontal-scroll screenshots |
| Validator lifecycle | Primitive extraction moves keys/state/effects or calls close handler differently | Keep context/callback owners; targeted lifecycle/exact-scope tests |
| Row/map interactions | New icon wrapper catches or bubbles clicks differently | Same row hover, row click and isolated per-row zoom identity |
| Overlay layering | New transform/overflow creates containing or stacking context | Inspect dropdowns/modals inside real parent tree, not z-index alone |
| Map HTML / chart / WebGL | React-only tokens miss strings or unsupported variable consumers | Shared CSS recipes for HTML; explicit data palette adapters where needed |
| Source-contract tests | Tests assert literal utility strings, colours and DOM shape | Update appearance expectations deliberately; retain meaningful behaviour assertions |

## 15. Out-of-scope observations

These observations are **OUT OF SCOPE for the styling stream**. None was fixed. Suspected defects need a separate focused task and reproduction; this audit is not a security or functional certification.

- **Upload keyboard access:** FileUpload uses a non-focusable label and `className="hidden"` file input without a visible keyboard-focusable opener. Static markup indicates a keyboard path gap. Changing activation semantics is a separate accessibility fix; visual treatment should account for the future focusable control.
- **Table/legacy disclosure keyboard model:** LayerDataTable's virtual rows and sortable headers are divs with click handlers, and the layer accordion header is a clickable div. Explicit keyboard activation/table semantics are not present on these paths. Do not redesign table navigation during a palette pass.
- **Dialog accessibility:** V2 fallback explicitly supplies dialog semantics and a Tab trap. Several other dialog frames (including Stats outer frame, Share, data explorer and add-file) do not share that implementation; some close controls lack explicit names. Full focus containment, Escape, background inertness and restoration require a separately scoped behavioural accessibility pass.
- **Potential popup HTML injection:** MapInner interpolates feature property keys/values into HTML passed to `bindPopup` without escaping in that block. Input provenance/sanitisation was not audited end-to-end. Record for separate security review; do not combine repair with button restyling.
- **Possible height-check layer mismatch:** LayerPanel passes per-layer Z results into global result state; ZValidationModal reads `state.data` and builds map targets without the selected layer identity. This suggests a possible mismatch when inspecting a non-base layer. Needs a separate multi-layer reproduction; no bug fix proposed here.
- **3D domain colour consistency:** `src/lib/3d/colorMapping.js` feeds `transformGMIData.js`, while Legend3D has another palette (for example SP brown in mapping versus green in legend). MapInner has its own domain palette. Reconcile only through a separate domain-presentation review, not brand replacement.
- **Floating data-inspector opener:** page and Viewer3D use `left: calc(50% - 320px)`, which can place the control outside a narrow pane. Treat as a suspected existing layout issue requiring reproduction; do not silently relocate it in a styling slice.
- **Overlay accessibility/stacking uncertainty:** data/Z overlays around 2000 coexist with sidebar 10000; fixed dialogs can be nested under stacking contexts. Verify whether interactions are obscured before proposing a functional positioning fix.
- **Tooling/legacy debt:** package lint script is `next lint` while ESLint flat configuration is present; inspect the supported local lint invocation at implementation time. `scrollbar-hide`, `animate-in` and `slide-in-*` uses have no local custom definitions/plugin found, and `text-primary` has no explicit authored theme mapping. Verify generated CSS separately. Dormant components and `.bak` are cleanup debt, not removal authorisation.

Deferred by explicit scope: group overlay, Marker i kart, group Zoom til utvalg, new table status facets/search/multi-select and other table functionality. Existing whole-layer highlight and individual map actions elsewhere are baseline features, not permission to reintroduce Validator group actions.

## 16. Suggested verification strategy

### During later implementation

Capture a repeatable baseline before S1 changes and compare each migrated region using the same datasets, UI state and viewport. Use local synthetic GMI fixtures under `tests/fixtures/gmi-v32` plus authorised real-data checks on the existing stable test branch/workflow; do not alter that branch. Include representative SOSI and KOF layer states where relevant. Use Testmodus for local upload exercises so test activity is not counted. Do not use production as an automated test target or modify tracking to facilitate styling.

For each slice, run only the targeted existing checks it affects, followed by manual/browser rendering of the pertinent states. Pixel alignment, clipping, contrast and focus cannot be established by source-regex tests. Do not add tests that merely repeat new colour classes; meaningful behaviour tests are warranted when shared components alter refs, keys or event forwarding.

### Revised checkpoint gates

| Checkpoint | Evidence required before continuing dependent work |
| --- | --- |
| S0 → S1 | Authoritative palette/current G reference paths, version/provenance, approved semantic role mapping and recorded unresolved asset decisions; no guessed colours or recreated logo |
| S1 → S2 | Canonical token/class exposure verified, reference state colour pairs checked, global dimensions and old consumers stable; no blanket legacy alias remap |
| S2 → shell | Existing toolbar refs/focus restoration and WMS field semantics preserved; adoption demonstrates recipes suffice or explains the narrowly added component |
| S3A → S3B | Product header persists; normal/Validator branch swaps match baseline mount/unmount behaviour; no new active-feature resets on unrelated rerenders. Compare scroll reachability, normal resize interaction and Validator-owned table cleanup with baseline |
| S5A → S5B | List geometry, controls, counts/status meaning and field opener unchanged; agree the shared tone mapping before applying it to detail |
| S5B → S6 | List/detail semantic coherence, tab/field persistence, exact-object actions and inspector/modal focus/geometry pass |
| S6 | Virtual rows align after scroll; sticky columns remain opaque and correctly offset; same exact scope, hover identity, row click and isolated zoom. Do not substitute native-table checks for virtual-table checks |
| S8A / S8B | Separate native-data overflow/target presentation checks from profile SVG/hover/terrain/settings checks; do not require one shared refactor to pass both |
| S12 | All active UI chrome converged to canonical semantics, feature-specific information encodings preserved, no undocumented visual exceptions; full agreed tests/build at the checkpoint |

For S3A, the existing source-contract workspace tests are necessary but do not prove React mount behaviour. During authorised implementation, compare baseline versus revised feature transitions and add a focused lifecycle regression check only if the ownership change needs it. Never change tests to assert keep-alive when the baseline conditional already unmounts the feature. For each checkpoint record viewport, fixture/state, focused checks, observed differences and remaining baseline issues. Later phases need not repeat unrelated checks after every colour edit; shared changes or failures determine retesting.

| Area | Useful existing checks |
| --- | --- |
| Shell / toolbar / legend / inspector | `tests/mapPaneToolbar.test.mjs`, `tests/validationV2WorkspaceInspector.test.mjs` |
| Exact scope / sticky widths / lifecycle | `tests/objectTableInspection.test.mjs`, `tests/validationV2Diagnostics.test.mjs` |
| Validator presentation | `tests/validationV2FieldDetailExtraction.test.mjs`, `tests/validationV2FieldDataPresentation.test.mjs`, `tests/validationV2RulePresentation.test.mjs`, relevant A7/A81 workflow tests |
| Statistics | `tests/statsUiContract.test.mjs`, `tests/statsChartUi.test.mjs`, `tests/statsKommuneFilterState.test.mjs`, `tests/statsMapTimeline.test.mjs`, `tests/statisticsCue.test.mjs` |
| Test controls | `tests/testMode.test.mjs` |
| Profile/map hover | `tests/profileAnalysisActiveDataCrash.test.mjs` |

A focused command for later use is `node --loader ./tests/esmJsLoader.mjs --test tests/mapPaneToolbar.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/objectTableInspection.test.mjs`. At the agreed final checkpoint, run the full test-file set through the existing loader (expand file paths explicitly if the shell does not expand globs), including research tests as appropriate, and `npm run build` once. The historical full Validator command is `node --loader ./tests/esmJsLoader.mjs --test tests/validationV2*.test.mjs`. Run read-only ESLint on changed source using the locally supported CLI, without fix/cache output, and `git diff --check`. Build generates artifacts and therefore was intentionally not run for this report-only task.

### Manual state/viewport matrix

- Primary: 1920×1080; additional 1600×900, 1366×768 and 1280×720; a constrained 1024px-wide window and a 390px-wide fallback check to expose existing limits. Include a short-height window and browser zoom/text scaling; no claim of a new mobile redesign.
- Sidebar default 380px and near both resize bounds; inspector open/closed; bottom table open/closed; profile instead of table; map and 3D modes. At default sidebar, test immediately around the 1468px docking boundary, adjusting when sidebar width changes.
- Persistent header proposal: switch normal sidebar/Validator repeatedly and scroll each feature; verify identical branding, feature headings below the divider, reachable bottom controls and preserved resize/lifecycle behaviour. Compare the compact working identity with the larger centred start layout at default, constrained and short-height viewports.
- Actual map widths immediately around 580/860/1100px; inspect toolbar reset/share/Testmodus overflow, legend user toggle persistence and Leaflet selector clearance. Viewport width alone is not sufficient.
- Validator points/lines, no eligible layer, unsupported format, empty geometry, loading/error, Feil/Sjekk/Pass and unresolved context, long field/source tables, Resultat/Regel and tooltip focus.
- Exact diagnostic selection, Utvalg/Alle, equal sets (no segment), all-missing field, sparse field, long values, horizontal and vertical table scroll, sorting, field switch without replacing table, new diagnostic replacing table, inspector close and Validator close.
- Pointer hover, keyboard Tab/Shift+Tab, focus ring against each surface, disabled controls, selected/current state, nested dropdown Escape/outside-click and modal focus restoration. Record existing failures separately from regressions.
- Chart/map loading/error/empty, many municipalities, unknown municipality, expanded views and timeline controls; WMS advanced/error states; QR scan; profile terrain loading/error and 3D object popover near all edges.
- Measure actual chosen foreground/background pairs, including opacity compositing; inspect colour-independent status labels, icon hit targets, native check/radio/range rendering, reduced motion and high-contrast/forced-colour behaviour.
- Compare integrated palette values and G artwork against the supplied canonical references when available. Inspect the G at proposed 30px/28px wordmark scale, compact scale and QR/favicon scale: cyan stays behind the dark portions, thicker strokes do not obscure the structure, and the accessible name includes the replaced G. Do not treat the source baseline colour-ratio examples as approved palette values.

### Audit completion verification

This report-only audit uses no build/test pass claims. Final repository checks must show only `docs/agent-reports/20260915-styling-overhaul-audit.md` as new/modified and unchanged branch/HEAD. All implementation verification above is a recommendation for later authorised work.

## Plan review / revisions

Reviewed directly against current source at unchanged `641387f`, with only this report present as an untracked file. Rechecked WorkspaceShell/page feature composition, Sidebar resize/local state and LayerManager height ownership, local ToolbarButton ref/focus behaviour, V2 Workspace state/portal/cleanup ownership, table virtual-row/sticky-width helpers and click isolation, map thresholds/resize invalidation, and data/Z versus profile/standards rendering. No application implementation or tests/build were run during this review.

### Judgment on the proposed refinements

| Review point | Judgment and revision |
| --- | --- |
| 1 — S0 authoritative inputs | Agree: a distinct design-input gate prevents guessed implementation. It is asset/reference intake, not application styling. Current reference may precede a usable final vector, but S3A cannot redraw a missing asset. S1 needs approved token values/mappings, not only the prose direction |
| 2 — small shared UI layer | Agree and narrow the earlier plan: recipes first, optional IconButton, no mandatory universal Button. Existing local ToolbarButton already has a ref contract; Leaflet strings benefit from CSS reuse rather than React replacement |
| 3 — S3A/S3B | Agree: the persistent header changes ownership and vertical allocation, while toolbar/upload appearance need not. Separate gates make resize/scroll/lifecycle regressions attributable. Keep the header in the left column only |
| 4 — protected geometry | Agree: promoted to inherited constraints, with exact baseline numbers and preservation of existing stacking/portal/resize ownership |
| 5 — S5A/S5B | Agree as two checkpoints in one Validator phase: Workspace/RuleList and shared detail/frame files already form useful boundaries. Retain one tone vocabulary; reject new providers/extractions solely to support the split |
| 6 — isolated S6 | Agree: LayerDataTable is shared beyond V2 and owns virtualization, sticky calculations, scope presentation and map events. Native/detail tables cannot provide its acceptance evidence |
| 7 — S8A/S8B | Agree: DataDisplay/Z are native-table overlays; Incline owns custom SVG, lower-pane geometry, hover and StandardsInfoModal. Keep standards with profile; separate checks without extracting a shared analysis framework |
| 8 — count/dependencies | Adopt the proposed labels for useful boundaries, not a fixed slice count. S0 is a gate; A/B stages are bounded review passes. Relax unnecessary serial dependencies: S4 is not a hard prerequisite to S5, nor analysis/3D to utility/statistics migration. Default remains direct sequential work |
| 9 — practicality/coherence | Agree: canonical UI palette and common interaction/type/density/icon rules are hard convergence criteria. Reject workspace-consuming visual uniformity and brand recolouring of information-bearing GIS/chart content |
| 10 — separate backlog | Agree: section 15 remains separate and intact. No listed functional/accessibility/security/domain-colour/tooling repair is bundled into these slices |

Two interpretations are explicitly rejected: “no remount” cannot mean persisting both Sidebar and Validator across feature switches, because the existing conditional unmounts them; preserve existing lifecycle and prevent additional remounts instead. Likewise, shared styles do not justify a universal React control/overlay layer or a single giant chain of hard dependencies. Use local recipes and existing ownership, with specific behaviour tests only when a real structural change requires them.

### Recommended implementation order

`S0 → S1 → S2 → S3A → S3B → S4 → S5A → S5B → S6 → S7 → S8A → S8B → S9 → S10 → S11 → S12`.

This is a default review order, not sixteen architecture projects or mandatory separate releases. S0 is non-application intake; S5A/B are one coherent Validator phase with an internal stop/check. S8A/B share presentation vocabulary but have independent rendering acceptance. Utility dialogs (S10) may move after S3A/B and S2; statistics (S11) may follow S3B/S2, preferably reusing S7 conventions when ready. S8A/B and S9 do not require code changes in each other. Keep the default order unless an actual scheduling/input constraint makes reordering useful; no delegation is implied.

### Decisions / inputs before S1 implementation

1. Identify and supply the authoritative canonical palette specification and current G reference, with a clear current version/design owner. Their absence is a genuine prerequisite, not a request to redesign them.
2. Map approved values to the needed brand/action, neutral/text, focus/selected/disabled and success/warning/error/info roles. If the brand palette does not define all states, obtain explicit design decisions or approval to retain identified existing semantic values temporarily; do not silently invent a final palette or give each feature its own values.
3. Establish one supplied asset/reference authority and the location/provenance convention in S0. A usable approved vector/export is required before S3A integration; exact header height and the exploratory 30px/28px pairing can be measured at S3A and do not need to block S1. An approved small-size QR/favicon export is only a dependency of those integrations.

The governing header placement, protected geometry, classes-first approach and separate backlog are resolved roadmap directions, not new approval questions. This audit's one-file permission still applies; implementation and S0 intake need a later request permitting their files. No source edits are authorised or performed by revising this roadmap.

## 17. Prioritised file/component index

| Priority / stage | Principal files | Role |
| --- | --- | --- |
| P0 — S0 (future intake only) | Proposed `docs/design/` specification/reference; approved brand asset/reference with one source authority | Existing design-work provenance, approved palette mappings and current G; no app styling |
| P0 — S1 | `src/app/globals.css`, `src/app/layout.js`, `postcss.config.mjs` (reference) | Semantic foundations, font/cascade and utility exposure |
| P0 — S2 | Shared CSS/recipes; `src/components/MapPaneToolbar.js`, `WmsLayerModal.js`; optional justified IconButton | Appearance first; preserve existing controls/refs/DOM |
| P0 — S3A | `src/app/page.js`; `WorkspaceShell.js`, `Sidebar.js`, feature-wrapper sizing in `FieldValidationSidebar.js` / V2 Workspace if needed; LayerManager height review; proposed ProductHeader/BrandWordmark and approved asset | Persistent left-header ownership, compact identity and distinct centred start identity |
| P0 — S3B | `src/app/page.js`, `WorkspaceShell.js` surfaces; `FileUpload.js`, `GlobalFileDrop.js`, `MapPaneToolbar.js`, `TabSwitcher.js`, `TestModeControl.js` | Shell/onboarding appearance after ownership gate |
| P0 — protected references | `MapPanePresentationProvider.js`; `src/lib/workspace/mapPanePresentation.mjs`; `validation-v2/fieldDetailLayout.js` | Measured thresholds, ownership and inspector dimensions |
| P1 — S4 | `LayerManager.js`, `LayerPanel.js`, `Sidebar.js` | Layer and legacy active sidebar surfaces |
| P1 — S5A | `FieldValidationSidebar.js` active wrapper; `validation-v2/ValidationV2Workspace.js`, `ValidationV2RuleList.js`, `ValidationV2ErrorBoundary.js` | Validator list/controls/counts checkpoint |
| P1 — S5B | `validation-v2/ValidationV2FieldDetailContent.js`, `ValidationV2FieldInspector.js`, `ValidationV2FieldInfoModal.js`; `src/lib/validation-v2/fieldDataPresentation.js` tone adapter | Detail/inspector checkpoint; `resultPresentation.js` outcome contract protected |
| P1 — S6 | `LayerDataTable.js`; `src/lib/objectTablePresentation.js` (protected sizing reference) | Dense virtual table presentation |
| P1 — protected behaviour | `src/lib/store.js`, `objectTableInspection.js`, `validation-v2/tableInspection.js` | Lifecycle/identity reference, not styling targets |
| P1 — S7 | `MapView.js`, `MapInner.js`, `MapLegend.js`, `DevDiagnosticsPanel.js` | Map-owned chrome, popup classes, diagnostics |
| P2 — S8A | `DataDisplayModal.js`, `ZValidationModal.js` | Native data-table/height-check presentation |
| P2 — S8B | `InclineAnalysisModal.js`, `StandardsInfoModal.js` | Profile SVG/chrome/settings presentation |
| P2 — S9 | `3D/Viewer3D.js`, `Controls3D.js`, `Legend3D.js`, `Tooltip3D.js` | 3D HTML chrome; scene/material code remains protected |
| P2 — S10 | `WmsLayerModal.js`, `ShareQrModal.js` | Utility dialogs and QR branding |
| P2 — S11 | `StatsModal.js`, `stats/StatsMap.js`; stats CSS/trigger | Statistics feature and promotion hierarchy |
| P3 — S12 | Shared styles, enumerated residual consumers, approved favicon/brand metadata | Final consistency and verification |
| Separate backlog | `ThemeSwitcher.js`, `DataDisplay.js`, `DetailedStatsSection.js`, legacy field UI and `Sidebar.js.bak` | Dormant source; do not reactivate or remove in styling slices |

Unless explicitly prefixed, component paths in this index are under `src/components/`. No application/source files were modified by this audit.
