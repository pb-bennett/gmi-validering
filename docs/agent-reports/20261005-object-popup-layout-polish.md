# Object popup layout polish

## Scope

Refine the existing Leaflet object popup: increase useful desktop dimensions, bound those dimensions to the map, and associate compact filename-copy controls with original file references. No photo workspace, new actions, Data Table redesign, or source-data changes.

Pre-edit checks confirmed branch `feature/object-popup-layout-polish` and HEAD `8e4e2ff` (`Add photo filename copy actions`). The initial status contained only the pre-existing modification to `data/usage/aggregates.json`. That file was not edited, restored, staged, or otherwise modified. Reference material in `REF_FILES/` was not used. No branch switches, commits, pushes, stash, reset, restore, or clean operations were performed.

## Existing popup architecture

- `src/components/MapInner.js` owns object popup creation in its feature/layer binding callback. It passes a DOM node from `createFeaturePopupContent` to `layer.bindPopup`. Before this change it supplied no popup options.
- Leaflet 1.9.4 therefore supplied `maxWidth: 300`, `minWidth: 50`, and `maxHeight: null`. Its layout routine measures content, writes an inline width, measures the resulting popup, and uses those dimensions for positioning and auto-pan.
- `src/lib/map/featurePopupContent.mjs` owns safe DOM rendering, the type/code header, generic attributes, the internal attribute scroller, and the action footer.
- Generic attributes are rendered in source order as a muted strong label followed by literal value text and a line break. Existing exclusions remain `featureType`, `id`, `S_FCODE`, null, and empty-string values.
- Previously `S_HYPERLINK` was rendered as an ordinary raw attribute followed by extra basename-only rows with copy buttons.
- `src/lib/hyperlinkFilenames.mjs` owns wrapper validation, actual link recognition, basename extraction, URL handling, array traversal, cycle protection, source order, and exact-filename deduplication.
- `src/lib/filenameClipboard.mjs` owns the shared pending/copied/error/reset lifecycle, basename-only clipboard writes, event propagation isolation, and local feedback strings. It is unchanged.
- The popup constructs Phosphor Copy/Check SVG paths with DOM APIs, uses actual buttons with filename-specific names, and switches to Check after a successful copy. The existing 1,400ms reset and local feedback are retained.
- MapInner's existing delegated handlers own `Vis i 3D`, `Inspiser data`, and line-only `Vis profilanalyse`. Their feature ID/type/index/layer attributes and handler logic are unchanged.

## Existing sizing constraints

The main width constraint was Leaflet's default 300px content maximum; no application-specific `.leaflet-popup-*` sizing rule existed. Leaflet's default content margins added chrome outside that content width. The renderer additionally used Tailwind `max-h-72` (18rem / 288px) for the entire flex column. The attributes alone used `min-h-0 flex-1 overflow-auto`; actions already used two columns, with the line profile action spanning both.

The application already changes its map/profile split below 1,000px viewport height. The map occupies an explicitly sized area beside the sidebar, below the map toolbar, and above any docked UI. These boundaries make the map container a better sizing reference than the browser viewport.

## Desktop sizing change

MapInner now assigns the object popup class `gmi-object-popup`, `minWidth: 0`, and `maxWidth: 560`. Normal Leaflet placement, close handling, selection, and auto-pan remain in use. Auto-pan reserves 24px at both horizontal edges, 64px above, and 48px below.

The explicitly sized MapContainer receives `gmi-object-map` and `container-type: size`. Object popup content uses `width: min(35rem, calc(100cqw - 6rem))`, with 0.75rem vertical / 1.25rem horizontal content margins. At the normal 16px root size, the preferred content width is 560px, approximately 602px including wrapper and horizontal margins. Narrower maps shrink the content; including chrome, the width leaves approximately 54px total horizontal map space, enough for the 24px auto-pan margins on each side.

The scoped `!important` width is intentional: Leaflet writes an inline pixel width during every layout update. CSS must retain the map-relative bound while Leaflet measures the final rendered dimensions. No JavaScript viewport measurement was added. Other Leaflet popup types are unaffected.

## Constrained-height behavior

The renderer's 288px cap is removed. Normal object popup content is capped at `min(38rem, calc(100cqh - 10rem))`: up to 608px at the normal root size, bounded by actual map height minus a 160px allowance for popup chrome and edge space.

At viewport heights up to 1,000px and widths from 1,024px, the cap is `min(34rem, calc(100cqh - 10rem))`, allowing up to 544px while continuing to respect the map's actual height. This keeps the existing constrained desktop range safe without forcing the earlier tiny content area. When the profile panel or bottom dock reduces the map, container units reduce the popup budget too.

The header and footer explicitly resist shrinking. The attributes remain the single internal vertical scroller, with `min-h-0 flex-1 overflow-y-auto overflow-x-hidden`. No Leaflet `maxHeight` scroller is added. Long text wraps with `overflow-wrap: anywhere`; a stable scrollbar gutter keeps values from shifting when scrolling becomes necessary. The popup remains positioned by Leaflet rather than becoming fixed UI.

## Attribute layout

Ordinary fields retain the same labels, values, order, safe text rendering, and compact typography. The extra width provides more room for GUIDs, dates, and longer values. No canonical fields were removed, broadly reordered, translated, or turned into a form. Existing footer buttons use their existing two-column layout across the wider popup.

## Hyperlink/file-reference section

At the original `S_HYPERLINK` position, the renderer now creates a semantic section named `Filreferanser`, with a compact heading `Filreferanser (S_HYPERLINK)`. Existing GMI soft-surface, border, and muted-text tokens provide restrained separation from ordinary attributes.

Source text is rendered as wrapping literal text inside compact flex rows. No links, HTML interpolation, or `innerHTML` were introduced. Invalid or unsupported source strings remain visible without misleading copy actions.

## Copy-action association

The shared extraction module now exposes `extractHyperlinkSourceParts`, returning original source slices and an optional validated filename. The existing `extractHyperlinkFilenames` API derives its ordered distinct filenames from these same parts. Wrapper validation and basename rules remain centralized, with no parser copied into the popup.

The popup displays each source slice once. Only a slice corresponding to a valid, distinct link receives a compact Copy/Check button. It does not display a separate derived basename row. Buttons retain the existing clipboard helper, filename-specific aria-label/title, focus ring, icon dimensions, pending disabled state, success reset, local `Kopiert` / `Ikke kopiert` feedback, and status role. Reference text flexes and wraps while the button stays visible at the row's edge.

## Multiple references and metadata

Multiple links retain individual controls in source order. Exact duplicate basenames keep the shared extractor's existing one-action-per-distinct-filename behavior, while duplicate source references remain visible. Nested arrays and cycle protection retain their filename extraction behavior; array references are presented in traversal order.

For a string source, joining the displayed source slices reproduces the complete original string, including whitespace, wrappers, separators, URL query/hash text, and metadata. Named metadata members such as `sign:"NOSEVIE"` have their own source slices and do not receive filename actions. The real link-plus-sign variant remains copyable without treating sign as a filename.

## Existing popup actions

`Vis i 3D` and `Inspiser data` remain available for ordinary object popups. Lines retain `Vis profilanalyse`. Their classes, labels, routing attributes, and MapInner handlers are preserved. Measurement gating and existing layer/selection behavior are unchanged. Leaflet continues to provide its close control and normal map interaction.

## Accessibility

The reference section uses a named semantic section and a compact heading. Copy controls remain actual keyboard-operable buttons with filename-specific accessible names, titles, decorative SVGs, and the existing focus styling. Local status feedback remains available to assistive technology. Header and action footer remain outside the attribute scroller. All source text continues to use text nodes/textContent.

## Tests

Added popup contracts for larger desktop preference, map-container width bounds, map-relative height limits, the constrained-height override, preserved internal scrolling, and non-shrinking header/actions. Added renderer tests for section treatment, ordinary attributes, exact source preservation, no derived filename rows, individual action association, duplicate handling, metadata without actions, and long wrapping references. Added shared-helper tests for exact source reconstruction and metadata isolation while retaining filename output semantics.

Focused command:

`node --loader ./tests/esmJsLoader.mjs --test tests/featurePopupContent.test.mjs tests/hyperlinkFilenames.test.mjs tests/objectTableInspection.test.mjs tests/profileAnalysisLayout.test.mjs tests/profileAnalysisActiveDataCrash.test.mjs tests/featureHoverTooltip.test.mjs tests/mapPaneToolbar.test.mjs`

Result: **68 passed, 0 failed**, including shared clipboard lifecycle, basename writes, Copy/Check reset, rejection feedback, Data Table raw/search/copy/event-isolation source contracts, popup action metadata, profile behavior, and map interaction contracts. No separate filenameClipboard test file exists; those tests live in hyperlinkFilenames and featurePopupContent.

Broader regression: all top-level `tests/*.test.mjs` files expanded through PowerShell and run with the same ESM loader. Result: **585 passed, 1 failed, 586 total**. The sole failure is the already known `AppInfo reclaims desktop height only in constrained viewports`; AppInfo was not changed.

An initial run without the loader could not resolve an extensionless import in objectTableInspection. Running with the repository loader resolved it. PowerShell also blocked the npx.ps1 shim, so ESLint was invoked directly using `node node_modules/eslint/bin/eslint.js`.

ESLint: both changed helper/renderer modules pass. MapInner reports 8 errors and 4 warnings. A read-only baseline lint of the exact HEAD source through stdin confirms the same rule/message diagnostics already exist at HEAD; no new lint diagnostic was introduced. Existing findings were left outside this task's scope.

`git diff --check` passes for the task files (the explicitly protected runtime data path is excluded). Production build was not attempted; it is optional for this task. No font configuration was changed.

## Manual acceptance

Browser acceptance was **not executed** in this session; no browser automation tool was available. Source/DOM contracts do not replace visual acceptance. The following checklist remains for a browser session:

1. At normal desktop / 1920x1080, click an object with many attributes. Confirm a clearly wider popup, less wrapping, more visible content, and comfortable bounds inside the usable map.
2. Confirm that it remains an anchored Leaflet popup and auto-pans normally, including objects near each map edge and the sidebar.
3. Reduce desktop height into the 830–1000px range. Confirm bounded height, internal attribute scrolling, reachable close control, and usable footer actions.
4. Open the bottom dock and profile panel independently. Confirm that popup dimensions follow the remaining map area and do not introduce page overflow.
5. For one file, confirm the distinct Filreferanser section, one main reference row with one compact icon, no extra basename-only row, and basename-only clipboard output.
6. For `h:1(link:"Attachments\\20251119_154646.jpg" sign:"NOSEVIE")`, confirm the link's copy control, visible sign metadata, and no copy control on sign.
7. For multiple references, confirm each source link is identifiable, each distinct filename has its associated icon, source order remains intact, and each clipboard result is correct.
8. Try very long references and narrow map widths. Confirm wrapping, discoverable icons, and no horizontal popup scrollbar.
9. Confirm temporary Check / Kopiert, local failure feedback, keyboard activation, focus visibility, and close behavior.
10. Confirm Vis i 3D, Inspiser data, line profile actions, and selection behavior match the previous implementation. Spot-check the unchanged Data Table copy UI.

## Files changed

- `src/components/MapInner.js`: scoped object-popup options, auto-pan padding, map container class.
- `src/app/globals.css`: scoped responsive popup width, map-relative height budgets, attribute wrapping/gutter.
- `src/lib/map/featurePopupContent.mjs`: reference section, source-associated copy controls, explicit flex shrinking rules.
- `src/lib/hyperlinkFilenames.mjs`: shared source-slice presentation using existing parsing/validation and filename semantics.
- `tests/featurePopupContent.test.mjs`: sizing, section, association, metadata, and wrapping contracts.
- `tests/hyperlinkFilenames.test.mjs`: source-preservation/shared-semantics coverage.
- `docs/agent-reports/20261005-object-popup-layout-polish.md`: this report.

## Remaining issues

Known AppInfo regression failure and pre-existing MapInner ESLint findings remain. Visual browser acceptance remains pending. The responsive sizing uses CSS size-container units and therefore assumes a modern browser, consistent with the existing UI's modern CSS usage. Very small maps cannot provide a comfortable popup action area; normal laptop, constrained desktop, and dock/profile cases should be checked against the checklist above.

## Final repository state

Branch remains `feature/object-popup-layout-polish`; HEAD remains `8e4e2ff`. No changes were staged, committed, or pushed. Expected short status contains the six modified source/test files listed above, this new report, and the untouched pre-existing ` M data/usage/aggregates.json`. `REF_FILES/` and `feature/photo-workspace` were not touched.
