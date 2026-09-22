# Validator workspace layout plan

Date: 2026-09-14
Branch inspected: `feature/validator-v2-v32-ui-polish`
Scope: planning and architecture only; no production implementation

This report builds on the accepted conclusions in `docs/agent-reports/20260913-validator-object-table-integration-plan.md`. It does not reopen the decision to reuse `LayerDataTable`, the exact immutable `ObjectRef` scope model, the contextual/ephemeral status model, or the one-layer/one-geometry/one-revision constraint.

## Executive recommendation

Use one page-level workspace grid with these areas on desktop:

```text
"validator-list  map       inspector"
"validator-list  bottom    bottom"
```

- The existing Validator field list remains a 430 px left surface and spans the full workspace height.
- The map or 3D view occupies the centre of the upper row.
- A non-modal field inspector occupies the right of the upper row only when a field is selected.
- The existing `LayerDataTable` occupies a generic bottom dock spanning the complete centre/right workspace. It does not sit under only the map and does not cover the inspector.
- When no inspector is open, the map spans the available centre/right width. When no bottom surface is open, the upper workspace spans the available height.
- The map, 3D view, left list, and inspector stay mounted while an object inspection is replaced. A selected field and an active object-table inspection are independent state domains.

At the current 430 px left width, use a 460 px default inspector, a 380 px minimum, a 560 px maximum, and protect a 480 px minimum useful map width. Below the combined docked requirement, change the inspector to a pane-contained right drawer; at genuinely small workspace widths, use the same shared field-detail content in a compact dialog/single-pane fallback.

## 1. Current page/workspace architecture

`src/app/page.js` is currently the layout root. Its outer element is a horizontal `h-screen w-screen` flex container (`page.js:240-242`). After parsing completes it mounts exactly one left sidebar:

- normal `Sidebar` when `ui.fieldValidationOpen` is false (`page.js:491-497`);
- `FieldValidationSidebar` in a fixed `w-[min(430px,100vw)]` wrapper when Validator is open (`page.js:499-504`).

The remaining region is one relative, vertical flex container (`page.js:506-509`). The 2D map and 3D viewer are alternative primary views. `primaryViewHeight` is `100%` normally and `55%` whenever either the table or profile analysis is open (`page.js:61-78`). `LayerDataTable` is then an in-flow 45% sibling beneath the primary view (`page.js:631-640`).

Profile analysis is different. `InclineAnalysisModal` is always mounted inside the same centre workspace, returns `null` when closed, and when open renders an `absolute bottom-0 ... h-[45vh]` surface (`src/components/InclineAnalysisModal.js:180-185`). The page still reduces the primary view to 55%, so the profile effectively occupies the lower area but through absolute positioning rather than the same docking mechanism as the table. Store actions make profile analysis and `LayerDataTable` mutually exclusive (`src/lib/store.js:508-540`, `1512-1531`).

The Validator field detail is not part of this layout. `ValidationV2Workspace` mounts `ValidationV2FieldInfoModal` from inside the left sidebar tree (`src/components/validation-v2/ValidationV2Workspace.js:450-463`), but the modal itself is `fixed inset-0`, z-index 10003, with a backdrop and `aria-modal="true"` (`ValidationV2FieldInfoModal.js:522-529`). It therefore blocks the left list, map, and bottom dock even though its React owner is the left workspace.

Several controls bypass the centre workspace entirely:

- `Statistikk` is fixed to the browser bottom-right (`page.js:244-308`).
- `Del` and `Nullstill og last opp ny` are fixed to browser top-right using hard-coded offsets and widths (`page.js:316-429`).
- `TabSwitcher`, which contains `Kartoversikt`, `3D-visning`, and `TestModeControl`, is fixed at browser top-centre (`src/components/TabSwitcher.js:6-67`).
- `DevDiagnosticsPanel` is correctly positioned relative to `TestModeControl`, but inherits the wrong browser-level toolbar owner (`src/components/DevDiagnosticsPanel.js:283-287`).

Other controls are already map-local:

- zoom readout and WMS button are absolute children of the primary map wrapper (`page.js:513-582`);
- `MapLegend` is an absolute child of `MapView` at map bottom-right (`src/components/MapView.js:47-51`, `MapLegend.js:153-160`);
- Leaflet layer/base controls are owned by `MapContainer` at top-right (`src/components/MapInner.js:2647-2730`);
- the measure button and measure panel are children of `MapContainer` (`MapInner.js:1178-1195`, `1264-1322`);
- 3D controls and its legend are absolute children of `Viewer3D` (`src/components/3D/Viewer3D.js:146-171`).

The layout already has an important resize safeguard: `MapSizeInvalidator` observes the Leaflet container with `ResizeObserver` and calls `map.invalidateSize()` (`MapInner.js:1325-1347`). React Three Fiber's `Canvas` is sized to its parent (`Viewer3D.js:147-152`), but pane-transition and splitter tests are still required.

## 2. Exact relevant files, components, and current state owners

| File/component | Current responsibility and state | Planned role |
| --- | --- | --- |
| `src/app/page.js` | Root flex layout; reads table/profile/Validator/3D state; owns stats/share/WMS modal state and map zoom label; mounts all major surfaces | Retain as composition root, but move geometry into a small `WorkspaceShell` and map controls into the map pane. Do not add field/session details here |
| `src/components/FieldValidationSidebar.js` | Current public Validator sidebar wrapper; now renders only V2 through an error boundary | Retain as left-surface boundary; render the extracted Validator field-list consumer rather than owning the whole detail surface |
| `src/components/validation-v2/ValidationV2Workspace.js` | Owns selected layer, dataset revision, validation controller/result, geometry, field-list search/filter/sort/expansion, `fieldInfoContext`, and opener focus ref | Split coordinator state from rendering. Its state becomes a Validator-scoped provider/controller shared by left list and right inspector |
| `src/components/validation-v2/ValidationV2RuleList.js` | Field rows, Feil/Sjekk/Pass summaries, disclosure state input, and explicit `Vis` action | Retain. Wire field activation to `selectedValidatorField`; preserve disclosure/count behavior |
| `src/components/validation-v2/ValidationV2FieldInfoModal.js` | Computes field-data summary and diagnostics; renders Resultat, Detaljer, Regel, authoritative tables; owns active tab, retry, dialog focus trap, Escape, backdrop, and frame | Extract shared model/content. Keep only a responsive modal/dialog frame and modal-specific focus behavior here |
| `src/components/LayerDataTable.js` | Whole-geometry row resolution, layer-filter mirroring, TanStack sorting/order, virtual rows, sticky `S_FCODE`, geometry tabs, row hover/click/zoom | Retain and generalize per the previous plan; add exact-mode presentation without creating a second table |
| `src/lib/store.js` | Persisted `ui.layerDataTable` preferences/open state, table/profile mutual exclusion, highlight state, map visibility/filter state | Keep durable whole-layer preferences; add a separate runtime-only inspection session/view slice omitted from persistence; expose a derived bottom-surface selector |
| `src/components/InclineAnalysisModal.js` | Absolute 45vh profile bottom surface | Keep content, but mount it through the same `BottomDock` layout region when that migration is safe |
| `src/components/MapView.js` | Relative 2D surface; mounts `MapInner`, legend, and validation prompts | Retain as map-owned content |
| `src/components/MapInner.js` | Leaflet map, normal GeoJSON, visibility styles, hover/selection styles, fit/centre behavior, map controls, resize invalidation | Retain normal layer architecture; add an independent non-interactive inspection overlay component inside `MapContainer` |
| `src/components/MapLegend.js` | Collapsible map-local bottom-right legend | Retain; give the map pane explicit reserved corner regions |
| `src/components/TabSwitcher.js` | Browser-fixed map/3D switcher plus test-mode controls | Refactor into the primary group of a pane-owned `MapToolbar` |
| `src/components/TestModeControl.js` | Test-state label, developer-tools trigger, test-mode exit, local open state | Retain behavior; allow toolbar to render compact/overflow variants; developer menu state should remain local to toolbar/control |
| `src/components/DevDiagnosticsPanel.js` | Anchored diagnostics popover | Retain but anchor to the pane-owned overflow or trigger and constrain to the map pane |
| `src/components/3D/Viewer3D.js`, `Controls3D.js`, `Legend3D.js` | Parent-sized 3D canvas and map-like local controls | Retain; consume the same map-pane bounds/reserved-region rules where applicable |
| `src/app/globals.css` | Leaflet control offset and statistics cue/responsive animation | Replace viewport assumptions with pane/container rules; keep the visual language and reduced-motion behavior |
| `tests/validationV2GmiA7.test.mjs`, `validationV2FieldDataPresentation.test.mjs`, `statsUiContract.test.mjs`, `testMode.test.mjs`, `statisticsCue.test.mjs` | Source-contract assertions tied to current modal and toolbar placement | Update alongside extraction; add behavioral coverage instead of relying only on source-shape checks |

## 3. Current left sidebar behavior

The active V2 sidebar is 430 px wide at the page level. `FieldValidationSidebar` itself is a full-height flex wrapper and error boundary (`FieldValidationSidebar.js:369-375`). `ValidationV2Workspace` owns:

- layer choice and automatic validation reruns keyed by selected layer/revision;
- point/line geometry tabs;
- field search, status filtering, and sort order;
- one expanded field key through `presentationState.expandedRuleKey`;
- the selected/open detail context through local `fieldInfoContext`;
- focus restoration to the `Vis` opener.

The primary field-row button currently toggles expansion. An explicit `Vis` button in the expanded content calls `openFieldInfo` (`ValidationV2RuleList.js:39-89`). Opening detail sets `fieldInfoContext` with the composed field, owner rule set, and geometry (`ValidationV2Workspace.js:189-201`). The list remains mounted behind the blocking modal, so no state reconstruction is needed; it is only inaccessible while the modal is active.

Recommendation:

- Preserve layer, geometry, list search/filter/sort, count summaries, and disclosure state exactly as list concerns.
- Rename/reshape `fieldInfoContext` to `selectedValidatorField` (or a similarly explicit domain type) and keep it owned by the Validator workspace provider, not `page.js` or the generic object table.
- Field activation should set the selected field without replacing the list. The existing `Vis` action can remain the explicit first-slice opener. To satisfy one-click switching, activating another field row while the inspector is already open should also update selection; disclosure and selection should remain separate keys so closing the inspector does not collapse the list.
- Selecting a new layer or geometry, rerunning against a new revision, or closing Validator clears selected field because the field context is no longer valid. Merely changing list search/filter/sort does not clear it.
- A selected field may remain selected if it is temporarily filtered out of the list, but the inspector should identify it and provide a route back/reset rather than silently closing.

## 4. Current Resultat/Regel modal architecture

`ValidationV2FieldInfoModal` currently combines four concerns:

1. Field-detail derivation: `getValidationV2FieldDataSummary`, `buildFieldDiagnosticsForRules`, retry state, and memoization (`ValidationV2FieldInfoModal.js:435-468`).
2. Resultat content: coverage, diagnostics, contextual findings, dependency notes, and `Detaljer` value distribution (`lines 192-418`).
3. Regel content: modern rule explanation, guidance, applicability, compatibility, authoritative value tables, sources, and technical details (`lines 151-189`).
4. Modal chrome/behavior: fixed backdrop, dialog semantics, close button, active tab, initial close-button focus, Escape handling, and a Tab focus trap (`lines 420-591`).

The active tab is local state initialized to Resultat (`line 436`). The modal is keyed by geometry plus field ID in the workspace (`ValidationV2Workspace.js:450-453`), so changing fields remounts it and resets the tab. Tests explicitly assert this modal shape and reset behavior (`tests/validationV2GmiA7.test.mjs:363-379`).

This coupling is the main obstacle to a docked inspector. The rendering itself is reusable; the fixed frame and focus trap are not.

## 5. Proposed right inspector architecture

Introduce a non-modal `ValidatorFieldInspector` as the right workspace surface. It receives the selected field context from the Validator provider and renders:

- a compact header with `Felt: <display name>`, status summary, geometry/layer context, and close/collapse control;
- controlled Resultat/Regel tabs;
- the shared field-detail content;
- future `Vis N objekter` actions supplied as callbacks/adapters, not store calls embedded in presentational diagnostic components;
- a quiet cross-context message when the open object table belongs to a different field.

The inspector must be a normal complementary/region landmark, for example `<aside aria-labelledby=...>`, not a dialog. It must not set `aria-modal`, trap focus, cover the map on desktop, or intercept interaction outside its own bounds.

`inspectorOpen` should normally be derived from `selectedValidatorField !== null`. A separate persisted boolean is unnecessary. Closing clears the selected field while preserving list expansion/filter/sort. If product later adds a collapsed rail that retains selection, the state can become `mode: 'open' | 'collapsed' | 'closed'`; do not introduce that complexity in the MVP.

## 6. Shared Resultat/Regel content extraction

Extract one shared field-detail implementation, conceptually:

- `useValidationV2FieldDetailModel(context)` or a pure model builder plus a small retry hook: computes summary, diagnostics, coverage, and rule presentation;
- `ValidationV2FieldDetailContent`: controlled `activeTab`, `onTabChange`, model, and object-action callbacks; renders tabs and tab panels;
- `ValidatorFieldInspector`: docked frame, heading, close/collapse, scrolling, and non-modal focus policy;
- `ValidationV2FieldInfoDialog` (renamed current modal, optional fallback): backdrop/dialog frame, Escape, initial focus, and focus trap, rendering the same content.

Move `DiagnosticResultPanel`, `DiagnosticBlock`, `CoverageSummary`, `ModernRulePanel`, authoritative value tables, `Detaljer`, and their small helpers into the shared content/module. Keep `getFocusableElements`, dialog refs, backdrop click, modal Escape handling, and focus trap only in the fallback dialog wrapper.

The active tab should be controlled by the Validator workspace provider. Recommended behavior:

- first field opening in a workspace/revision starts on Resultat;
- switching fields preserves the user's tab, which supports comparing several rules without repeated tab changes;
- closing and reopening during the same valid layer/geometry/revision may preserve the tab;
- changing layer, geometry, or dataset revision resets to Resultat;
- if a tab is unavailable for a field, fall back visibly to the available tab.

This replaces the current key-based remount reset with an explicit, testable rule and prevents inspector/dialog divergence.

## 7. Inspector sizing and responsive model

Current facts: the Validator left wrapper is 430 px, the normal sidebar starts at 320 px and can be pointer-resized between roughly 200 and 800 px, and current detail modal content can grow to 44 rem. The new inspector does not need the modal's 704 px maximum; its tables already scroll internally and are usable in a narrower reading column.

Recommended desktop constraints:

| Dimension | Recommendation | Reason |
| --- | --- | --- |
| Validator left | keep 430 px current width | Accepted product direction; avoid sidebar redesign |
| Inspector default | 460 px | Within requested 430-500 range and adequate for Resultat/Regel tables |
| Inspector minimum | 380 px | Below this, diagnostics and authoritative tables become cramped |
| Inspector maximum | 560 px | Prevent detail content from consuming the map on wide screens |
| Minimum useful map | 480 px | Enough for Leaflet controls, legend, and the very-narrow toolbar state |
| Splitter hit target later | 8-12 px visual/interactive area | Supports pointer use without a visually heavy divider |

The effective inspector width should be clamped to `min(userWidth, 560px, availableCentreRightWidth - 480px)`. If that result would be below 380 px, change layout mode instead of shrinking either pane into unusability.

MVP: fixed 460 px with CSS clamping and no persistence. Later: a vertical splitter between map and inspector, with the width stored only as a benign local UI preference. Never store selected fields or object scopes with that preference. Closing should remove the inspector column and let the map immediately reclaim it; reopening uses the current-session width.

## 8. Bottom dock/table layout

Choose option B: the table spans **MAP + RIGHT INSPECTOR width**.

This matches the desired information model and is the cleanest grid arrangement. The left list remains full height, while the entire investigation area shares one lower object surface. The inspector remains visible above the table rather than being covered or closed. It also gives the table more horizontal room for `Tema`, current field, `Resultat`, and remaining attributes.

Use a generic `BottomDock` region selected by one derived `activeBottomSurface`, initially `object-table`, `profile`, or `null`. Existing store actions already enforce table/profile mutual exclusion; centralize that invariant rather than adding page booleans. Move profile analysis from absolute positioning into this region when practical, preserving its content and initial dimensions.

Recommended object-table vertical sizing:

- default upper workspace 62%, table 38%; this moves modestly from the current 55/45 split toward the requested map emphasis;
- minimum upper/map+inspector height: 300 px;
- minimum table height: 220 px;
- maximum table share: 50% in normal desktop mode;
- close removes the bottom row without changing inspector selection;
- a later horizontal splitter controls bottom-dock height with keyboard and pointer input;
- no height persistence in MVP; a later local layout preference is safe, but runtime object context must never be persisted.

For short-height windows, clamp rather than forcing both minima and overflowing. Below approximately 560 px workspace height, prefer a collapsible/full-height table mode over unusable simultaneous panes. Exact thresholds should be verified with the real header/footer heights.

## 9. Selected field versus active object inspection

These are deliberately independent:

```text
Validator selection
  selectedValidatorField: Type
  activeFieldTab: Resultat

Generic object inspection
  session: Type / diagnostic / 165 point refs / Feil
  visible refs: initially same 165 refs
  overlay enabled: true
```

Changing `selectedValidatorField` updates only the right inspector. It must not close, rewrite, filter, or relabel the active object-inspection session. Opening `Vis N objekter` creates/replaces the generic inspection session atomically; that action updates the bottom table context and map overlay together.

Make differing contexts explicit in both surfaces:

- inspector heading: `Felt: Adkomst`;
- table heading: `Objektutvalg: Type · 165 objekter · Feil`;
- optional quiet inspector note when they differ: `Objekttabellen viser fortsatt Type · 165 objekter`.

Do not derive one heading from the other and do not auto-switch the table when a field is selected.

## 10. Validator table column design

Normal whole-layer mode remains unchanged and continues using the user's saved per-layer/per-geometry order.

Exact Validator mode computes an ephemeral effective order from the inspection request:

1. resolved Tema source column (`S_FCODE` or the schema-bound Tema column);
2. current investigated field's resolved source column, unless it is Tema;
3. virtual contextual `Resultat` column;
4. all remaining discovered/schema columns in their normal deterministic order, excluding duplicates.

Examples:

```text
Tema | Adkomst | Resultat | Kjegle | Byggemetode | ...
Tema | Type    | Resultat | Byggemetode | Material | ...
Tema | Resultat | Type | Byggemetode | ...   (Tema inspection)
```

The current 36 px zoom column should become a non-data row-action gutter outside the reorderable data-column sequence. This preserves the explicit zoom action while making Tema literally and semantically the first data column. Row click/hover behavior remains as accepted.

Use the validation/schema binding to resolve the actual source key. Never infer it from the display label. Force Tema and current-field columns into the model even if sparse or absent from the first 100 rows; the current first-100 discovery behavior cannot be authoritative for scoped preferred columns.

Contextual status is a virtual accessor backed by `rowMetadata.byObjectKey`, not an attribute written to the layer. `Resultat` displays text/icon (`Feil`, `Sjekk`, `Pass`) so color is supplementary. The current-field cell may receive a restrained matching border/tint or status icon, but the adjacent textual Resultat column remains the authoritative status communication.

Scoped order, scoped sort, and pinned columns are session-local. They must not call `setLayerDataTableColumnOrder` or overwrite `columnOrderByLayer`; closing the session reveals the user's unchanged whole-layer preferences.

## 11. Sticky Tema/current-field design

The current table uses a boolean `meta.isFixed` and assumes one fixed field at left offset 36 px (`LayerDataTable.js:509-516`, `687-731`, `791-821`). A second sticky data column requires a cumulative model.

Replace the internal boolean concept with ordered pin metadata, for example `meta.pinned = 'left'` plus a computed `stickyLeftByColumnId`:

- row-action gutter: offset 0, width 36;
- Tema: offset 36;
- current field: offset `36 + temaWidth`;
- if current field is Tema, only the Tema entry exists;
- Resultat and remaining fields scroll normally.

Use opaque sticky-cell backgrounds, clear right-edge separators, and z-index layers for header/pinned body/ordinary body. Disable dragging the two required pinned data columns in scoped mode; remaining attributes may be reordered within the session later. Test horizontal scroll, long values, hover backgrounds, status tint, and the Tema special case to prevent overlap.

## 12. Exact-mode geometry handling

Whole-layer mode keeps `Punkter`/`Ledninger`, remembered per layer as today.

Exact inspection mode has one validated `geometryScope`, so it must:

- hide the geometry switch buttons entirely;
- derive its source collection from the immutable session, not `activeTabByLayer`;
- suppress the current auto-switch-to-nonempty-geometry effect;
- show quiet immutable context such as `165 punkter` or `64 ledninger`;
- reject mixed geometry before opening rather than partially displaying it.

No scoped action may call `setLayerDataTableTab`. Reopening a normal whole-layer table restores its remembered tabs unchanged.

## 13. Table context/header UX

Extend the existing compact header rather than adding a second table panel.

Recommended hierarchy:

- first line, left: `Objektutvalg: Type` (strong), `165 objekter` (neutral), `Feil` badge;
- second line, left: concise reason such as `Mangler Type · Tema DIV`, truncated with accessible full text;
- right-side actions: `Marker i kart` toggle, `Zoom til utvalg`, `Nullstill filter` when applicable, and close;
- field-level sessions may add a compact second control row for `Alle`, `Feil`, `Sjekk`, `Pass`, with stable facet counts and a separate `X av N objekter` result count.

Diagnostic sessions do not need a redundant active Feil filter when every exact ref belongs to that diagnostic; the badge explains why the table opened. Keep internal rule IDs, source indices, and `ObjectRef` keys out of visible text, URLs, logs, and accessible descriptions.

## 14. Map inspection-overlay architecture

Add a separate `ObjectInspectionOverlay` presentation layer inside the existing `MapContainer`. Do not feed a large scope into `ui.highlightedFeatureIds`, do not alter `lineStyle`/`pointToLayer`, and do not remount the normal data `GeoJSON` for inspection changes.

Recommended mechanism:

- resolve only the active visible inspection refs against the current layer/revision;
- build a small inspection-only FeatureCollection or Leaflet layer from those source geometries;
- render it in a dedicated pane above normal line geometry and below normal point markers, with `pointer-events: none`/`interactive: false`;
- use a restrained cyan/turquoise outline or halo with transparent fill;
- memoize by inspection session ID, current visible-ref version, layer dataset/revision, and projection;
- use a Canvas renderer or equivalent batched Leaflet layer for large sets after profiling;
- remove it completely when the session closes, becomes stale, or marking is toggled off.

This layer can represent an object even when a normal map visibility filter hides its base feature, without changing that visibility setting. The overlay is an inspection annotation, not the normal feature. Non-scoped objects continue to render normally and are neither hidden nor selected.

Existing single-row hover and selection remain stronger channels. Initially retain current hover/click/zoom behavior, but keep the scope overlay separate because `highlightedFeatureIds` participates in `styleVersionKey` and normal `GeoJSON` remounting (`MapInner.js:2015-2076`, `2702-2712`). A later performance slice may also decouple hover from normal GeoJSON remounting.

## 15. `Marker i kart` behavior

`Marker i kart` is an `aria-pressed` table-context toggle owned by the runtime inspection view. It defaults ON for Validator exact inspections and is absent or off by default for normal whole-layer tables.

- ON renders the current overlay set.
- OFF removes only the temporary overlay.
- It never changes layer visibility, table scope, table filters, row selection, or the existing map highlight state.
- Its label/count should make clear this is a temporary inspection marking, not selection of every object.
- Replacing the inspection session resets the new session to its default ON state; merely selecting another Validator field does not.

## 16. `Zoom til utvalg` behavior

Use the **currently visible/filtered table rows**, not the immutable scope, for `Zoom til utvalg`. This is least surprising after a user chooses Feil or searches: the map fits what the table currently shows. With no table filters, visible set equals scope, so diagnostic sessions behave exactly as expected.

The command should:

- validate the current session/revision;
- compute bounds from visible refs only;
- fit the 2D map with padding and a sensible max zoom;
- perform the equivalent bounded camera framing in 3D when that view is active, or clearly switch to/open the 2D map only if that is the established action contract;
- do nothing but announce/disable when zero rows are visible;
- not hide features, select all rows, or persist anything.

Consider the clearer visible label `Zoom til viste objekter` if user testing finds `utvalg` ambiguous; the underlying semantic should remain the filtered set.

## 17. Scope versus filtered-overlay semantics

Use one consistent rule:

| Concept | Mutability | Meaning/effect |
| --- | --- | --- |
| Inspection scope | immutable for session | Exact maximum set supplied by trusted `ObjectRef`s |
| Visible table set | mutable subset | Scope after session-local status/search filters |
| Inspection overlay set | derived | Visible table set when marking is enabled; empty when disabled |
| Normal map visibility | independent | Existing layer/Tema/Type/Felt/outlier visibility state |
| Hover/selected object | independent | Stronger transient/persistent single-object emphasis |

This means a diagnostic session initially marks all 165 exact objects. A field-level session initially marks all evaluated objects; selecting Feil narrows rows and overlay to Feil. Clearing filters restores the complete immutable scope. None of these operations changes normal map visibility.

Use `scope`, `viste objekter`, and `markert i kart` consistently. Avoid calling the overlay set a selection, because the app's single selected row/object remains different.

## 18. Floating-control ownership model

Create a real `MapPane` containing the current primary 2D/3D surface and every control whose action targets that surface. Set it to `position: relative`, `min-width: 0`, `min-height: 0`, and `container-type: inline-size`.

Ownership rules:

- `MapToolbar`: map/3D mode, share, reset/upload, test mode, developer tools.
- map bottom-left slot: zoom readout, WMS, measurement context where applicable.
- map top/right Leaflet slot: layer/base control.
- map bottom-right slot: legend and, when allowed, Statistikk.
- map centre overlays: outlier/Z prompts and measurement panel.
- 3D controls and legend remain within the same pane boundary.

No map control should use `position: fixed` or viewport-derived offsets. Modals such as share, WMS configuration, and statistics may remain application-level dialogs once opened; only their triggers belong to the map pane.

Expose reserved-region CSS variables/classes from `MapPane`, such as toolbar height, corner gutters, and legend width. Map-local descendants consume those values instead of knowing whether an inspector or bottom dock exists.

## 19. Statistikk visibility rule

Model this as availability of the map's bottom-action slot, not feature-specific booleans:

```text
mapBottomActionSlotAvailable = activeBottomSurface === null
```

When `object-table`, profile, or a future bottom surface is active, hide the floating Statistikk trigger. When the bottom surface closes, it returns in the map pane. Opening only the right inspector moves the map boundary left but does not consume the map's own bottom-action slot, so Statistikk can remain within map bounds.

If the statistics dialog is already open when a bottom surface opens, do not forcibly close the dialog; the rule controls its floating trigger, not active dialog lifecycle. Preserve the existing cue and reduced-motion behavior, but run the cue only while the trigger is actually rendered.

## 20. Del / Nullstill behavior

Move both triggers from browser-fixed positions into the right action group of `MapToolbar`. Their right edge then follows the map-pane boundary automatically when the inspector opens.

- `Del` may compact to icon plus accessible label and may enter overflow at narrow widths.
- `Nullstill og last opp ny` stays text-labelled at normal/constrained widths.
- In the very-narrow state, move reset into the overflow menu with the full consequential label; do not replace it with an ambiguous reset/trash icon.
- Keep reset visually separated within overflow and preserve the existing `handleReset` behavior. This layout task must not change reset semantics.
- The toolbar is one row with `white-space: nowrap`, no wrapping, bounded gaps, and clipped/overflow-managed groups.

## 21. Responsive top-map-toolbar architecture

Refactor `TabSwitcher` into a pane-owned `MapToolbar`; retain its mode actions and `TestModeControl` behavior. Use CSS container queries on `MapPane` because the constraining width is map width, not browser width. JavaScript `ResizeObserver` should not be the primary responsive switch when CSS can hide/compact labelled variants.

Use one accessible overflow menu component with local open state. CSS chooses which direct controls are present; the menu model must ensure each action exists exactly once in each state. If container queries cannot safely drive menu contents without duplicate focusable controls, a small measured `toolbarMode` from one pane-level `ResizeObserver` is acceptable, but it should expose `normal | constrained | narrow`, not raw width throughout the app.

Initial thresholds based on current control widths:

- normal: map pane at least approximately 820 px;
- constrained: approximately 560-819 px;
- very narrow: below approximately 560 px.

These are starting values, not magic product constants. Verify them with test mode active, the Leaflet top-right control reserved region, Norwegian labels at 200% zoom, and the 380/460/560 px inspector variants. Keep thresholds in one toolbar stylesheet/module.

## 22. Toolbar priority and overflow rules

Normal (about 820 px and wider):

- direct: `Kartoversikt`, `3D-visning`;
- direct right group: `Del`, `Nullstill og last opp ny`;
- test-mode indicator/developer actions may be direct if they fit;
- overflow is omitted if empty.

Constrained (about 560-819 px):

- direct: compact `Kart`, `3D` mode buttons with icons and accessible full names;
- keep `Del` and labelled reset direct while they fit;
- move Testmodus/developer tools to overflow first;
- never wrap.

Very narrow (below about 560 px):

- direct: `Kart`, `3D`, one labelled accessible overflow trigger;
- overflow: `Del`, `Nullstill og last opp ny`, Testmodus status/exit, and `Utviklerverktøy` when test mode is active;
- reset retains its full text and separation inside the menu.

Use `@phosphor-icons/react` for new/normalized icons. Every icon-only variant has an accessible name and tooltip where useful.

## 23. Legend/map-control collision handling

The legend is already correctly owned by `MapView`, but its fixed `bottom-20 right-4` placement assumes one set of neighbouring controls. The Leaflet layer control is top-right and globally receives `margin-top: 58px` to clear the current reset button (`globals.css:134-137`). Replace that browser-era assumption with map-pane reservations:

- reserve a top strip for `MapToolbar`;
- offset Leaflet top-right controls below that strip, not below a specific reset button;
- reserve the bottom-right legend stack; place Statistikk below/above it with explicit gap, or hide/compact the legend if the local height cannot support both;
- keep zoom/WMS in a bottom-left stack, not hard-coded independent offsets;
- centre prompts within the actual map pane and cap their width to that pane;
- when the bottom dock opens, all these controls remain inside the shortened upper map; none is rendered over table rows;
- constrain 3D legend/help panels to the same pane and shortened height.

Do not redesign legend content. Only normalize its containing block, stack, maximum height, and reserved offsets.

## 24. Responsive fallback

Base fallback on the `WorkspaceShell`/centre-right container width, not only `window.innerWidth`.

Recommended modes:

1. **Docked desktop:** enough room for 480 px map + at least 380 px inspector. Use the three-column grid.
2. **Constrained desktop/tablet:** keep the 430 px left Validator list, keep the map mounted, and render the inspector as a right drawer overlay contained within the centre-right workspace. The drawer should be closable and resizable only within safe bounds. It is non-modal while sufficient map interaction remains available.
3. **Very narrow/mobile:** the 430 px left surface itself cannot remain alongside useful map space. Allow the left list and shared field detail to become mutually accessible drawers/single-pane surfaces. A true dialog fallback for field detail is acceptable here and can reuse the existing modal wrapper. Preserve selection/list state when switching surfaces.

The first transition occurs when centre-right width is below roughly 860 px (480 + 380 plus divider). The very-narrow transition should be based on actual workspace usability, initially around 760-820 px total viewport/workspace width, then verified at browser zoom. Do not make the left sidebar auto-collapse in normal desktop mode.

## 25. Accessibility

- Give left list, map/3D, inspector, and bottom dock named landmarks/headings.
- Field rows and the existing `Vis` action remain real buttons. Expose selected state separately from `aria-expanded` where the row both selects and discloses.
- On first keyboard opening, move focus to the inspector heading or selected Resultat tab; on pointer opening, avoid surprising focus theft. When switching fields from the list, keep focus in the list and announce the inspector heading update through a restrained live region.
- Provide explicit keyboard routes between list, inspector, map, and table, such as skip links at workspace start; do not rely on a custom undocumented shortcut.
- Inspector close returns focus to the most recent valid field opener when focus was inside the inspector. It does not close the table.
- The inspector has no focus trap and no `aria-modal`.
- Resultat/Regel use the existing tab semantics, roving tab index, arrow keys, Home, and End from the shared content.
- Future splitters use `role="separator"`, orientation, `aria-valuemin/max/now`, arrow-key increments, Home/End, and a visible focus state. Provide collapse/restore buttons independent of dragging.
- Table context actions are keyboard reachable; toggle buttons expose `aria-pressed`; visible/scope count changes use a polite status region.
- Table row selection and sort headers need keyboard semantics; current clickable `div` rows/headers are insufficient for the new workflow.
- Overflow uses a labelled button, correct expanded/control relationships, menu or disclosure semantics, Escape/outside-click close, logical focus return, and no hidden duplicate focus targets.
- Compact/icon-only controls have accessible full labels. Reset remains unambiguous.
- Feil/Sjekk/Pass are always communicated with text/icon and not color alone. Current-field tint and cyan map overlay are supplementary.
- No critical object action appears only on hover.

## 26. State ownership

Avoid moving Validator domain state into `page.js`. Use three focused state domains plus derived layout state:

| State | Owner | Persistence |
| --- | --- | --- |
| selected Validator field | Validator workspace provider/controller, revision-qualified | No |
| inspector open/closed | Derived from selected field in MVP | No |
| active Resultat/Regel tab | Validator workspace provider/controller | No; preserve only during current valid workspace session |
| inspector width | `WorkspaceShell` local layout state | No in MVP; optional benign UI preference later |
| bottom table open/closed | Existing generic table action/state; exact mode derived from runtime session | Whole-layer UI may retain current behavior; exact session no |
| table height | `BottomDock`/`WorkspaceShell` local layout state | No in MVP; optional benign preference later |
| active exact object-inspection session | New top-level runtime-only generic store slice, session-ID/revision guarded | Never |
| table-local filters and currently visible object keys | Runtime inspection view state, updated by `LayerDataTable`/pure reducer | Never |
| map inspection overlay set | Derived from active session visible keys when enabled | Never |
| overlay enabled/disabled | Runtime inspection view state, default true per new Validator session | Never |
| map hover/single selection | Existing generic map highlight state initially | Existing behavior; do not merge with scope overlay |
| active bottom surface | Derived selector from table/profile/future dock state | No separate boolean |
| map toolbar responsive mode | CSS container queries; optional single local measured enum fallback | No |
| toolbar overflow menu | `MapToolbar` local state | No |
| developer diagnostics popover | `TestModeControl`/toolbar local state | No |
| stats/share/WMS dialogs | Page or focused dialog owner as today | No new persistence |

The Validator provider should span both left and right surfaces. A practical composition is `ValidatorWorkspaceProvider` around `WorkspaceShell`, with `ValidatorFieldList` and `ValidatorFieldInspector` as consumers. This is cleaner than a portal from the left sidebar and prevents global Zustand from becoming the transport for transient domain objects.

The persisted store currently serializes all of `ui` (`store.js:2849-2859`). Therefore exact refs, metadata maps, visible key sets, callbacks, and selected field detail must live outside persisted `ui`, or persistence must change to an explicit safe whitelist before the generic session is added.

## 27. Interaction walkthroughs

### Flow A — field inspection only

1. User activates Type in the left list.
2. Validator provider sets `selectedValidatorField = Type`; no table action occurs.
3. The shell opens the right inspector at its clamped width and the map remains mounted/full-height between left and right surfaces.
4. Shared content renders Type Resultat. The bottom surface remains absent.

### Flow B — exact diagnostic

1. Type Resultat is visible in the inspector.
2. User activates `Vis 165 objekter` on a diagnostic.
3. The Validator adapter sends the exact 165 revision/layer/point refs and context to `openObjectTable`.
4. Store validation atomically replaces/creates the runtime inspection session, opens `BottomDock`, initializes visible keys to the scope, and enables overlay.
5. Table resolves exactly 165 rows. It shows `Objektutvalg: Type · 165 objekter · Feil` and no geometry tabs.
6. Its data order is Tema sticky first, Type sticky second, Resultat next, then remaining attributes. The zoom action is a separate row-action gutter.
7. The independent cyan inspection overlay marks those exact objects. Normal map features stay visible; no mass selection occurs.
8. Right Type inspector remains above the table, and left field list remains full height.

### Flow C — user switches selected field

1. The Type 165-object inspection remains active.
2. User activates Adkomst in the left list.
3. `selectedValidatorField` becomes Adkomst; active object-inspection session is untouched.
4. Inspector immediately renders `Felt: Adkomst`, preserving the active Resultat/Regel tab.
5. Table remains `Objektutvalg: Type · 165 objekter · Feil`; inspector may show a quiet note that the table still shows Type.
6. Map overlay and table rows remain Type context.

### Flow D — new object scope

1. User activates `Vis 64 objekter` in Adkomst.
2. `openObjectTable` validates the new exact scope and replaces the Type session in one store transaction.
3. Header, rows, metadata, visible keys, and map overlay all change to Adkomst/64 together. No intermediate whole-layer or mixed session is rendered.
4. Inspector remains Adkomst.

### Flow E — field-level status filtering

1. A later field-level Type session starts with immutable complete field scope and `Alle` active.
2. User chooses Feil.
3. Session-local filter derives the visible Feil refs; scope identity/count remains unchanged.
4. Table rows and inspection overlay change to those visible Feil refs.
5. Normal map visibility and loaded-layer filters are untouched.
6. `Nullstill filter` restores all scope rows and overlay without reopening the session.

### Flow F — narrow map

1. Right inspector is open and map-pane width crosses a container threshold.
2. `MapToolbar` changes from normal to constrained or narrow based on its own container.
3. Test/developer controls enter overflow first; mode controls remain direct; reset remains fully labelled either directly or in overflow.
4. Toolbar remains one row and inside the map boundary. Leaflet controls and legend use reserved regions.
5. If there is insufficient width for both docked panes, inspector changes to the configured contained-drawer fallback without unmounting map or left list.

## 28. Implementation slices

### Slice 1 — characterization and shared field-detail extraction

- Add focused model/content tests before moving code.
- Extract controlled shared Resultat/Regel content and field-detail model.
- Keep the current modal wrapper and existing desktop behavior temporarily.
- Update brittle source-contract tests to target shared behavior.

Independent proof: current modal looks/behaves the same and Resultat/Regel content has one implementation.

### Slice 2 — workspace shell, bottom surface, and desktop inspector

- Add minimal `WorkspaceShell`, `MapPane`, and `BottomDock` regions.
- Preserve 430 px left list and map/3D mounting.
- Normalize table/profile placement through derived bottom-surface ownership without changing content.
- Introduce Validator provider split and mount `ValidatorFieldInspector` in the right area.
- Keep shared dialog only as responsive fallback.
- Verify Leaflet/3D resizing and table+inspector simultaneity.

Independent proof: field detail no longer blocks desktop; map/list/inspector/table can coexist.

### Slice 3 — pane-owned controls and responsive toolbar

- Move mode, share, reset, test/developer, and statistics triggers into `MapPane`.
- Implement container-query toolbar states and one overflow.
- Replace Leaflet/legend hard-coded collision offsets with reserved regions.
- Derive Statistikk availability from bottom-surface ownership.

Independent proof: no control crosses pane bounds through normal, inspector, table, profile, and narrow-map states.

### Slice 4 — generic exact-scope table foundation

- Implement the previous plan's runtime-only exact inspection session, validation, persistence exclusion, and stable row identity.
- Generalize `LayerDataTable` row resolution while preserving whole-layer mode.
- Hide geometry tabs and add basic context header in exact mode.
- Retain current hover/click/zoom interactions.

Independent proof: one diagnostic opens exactly its refs and never broadens or persists them.

### Slice 5 — Validator table presentation

- Add exact refs to one diagnostic path, then broader adapters as planned previously.
- Add ephemeral preferred order, Tema/current-field sticky offsets, virtual Resultat metadata, status text, and mismatch context.
- Keep whole-layer saved order/sort untouched.

Independent proof: Type/Adkomst/Tema scoped columns are correct; normal table is unchanged.

### Slice 6 — map inspection overlay and controls

- Add separate non-interactive overlay/pane.
- Add `Marker i kart` and filtered-set `Zoom til utvalg`.
- Keep row hover/selection stronger and normal visibility untouched.
- Profile 10, 165, 470, 5,000, and large scopes.

Independent proof: exact objects are spatially identifiable without mass highlight/remount or visibility mutation.

### Slice 7 — field-level filters and overlay synchronization

- Consolidate the field-object status selector.
- Add complete field sessions and `Alle/Feil/Sjekk/Pass` facets/search.
- Publish visible keys to the overlay and implement reset-within-scope.
- Add distribution and relationship-pair actions afterward.

Independent proof: filters narrow table/overlay only and scope remains immutable.

## 29. Recommended implementation order

Use the slice order above. The key change from the tentative sequence is to extract shared field-detail content before changing layout, and to establish the shell/bottom-surface model before relocating controls. This avoids duplicating Resultat/Regel, reduces the chance of table/profile regressions, and gives every floating control a stable owning container.

Do not combine exact-scope table logic, two sticky columns, overlay rendering, and responsive controls in one PR. The first end-to-end exact diagnostic can land after the desktop shell and toolbar are stable.

## 30. Test strategy

The repository primarily uses `node:test` and includes several static source-shape assertions. Continue pure-model tests there, but add a real component/browser harness for layout, focus, container resizing, Leaflet, and overflow behavior; source regexes cannot establish these outcomes.

### Layout

- Inspector closed: map spans centre/right and remains mounted.
- Inspector open: left list and map remain mounted; inspector is non-modal.
- Inspector plus table: all four surfaces are visible; table spans centre/right.
- Table closes without clearing selected field or closing inspector.
- Inspector closes without clearing table session.
- Profile and table remain mutually exclusive and use the same bottom region.
- Leaflet receives/handles size change; 3D canvas matches parent after every pane transition.

### Field context

- First field opens Resultat; tab behavior follows the explicit reset/preserve rules.
- Switching Type to Adkomst updates inspector immediately and leaves Type session unchanged.
- Layer/geometry/revision change clears stale selected field.
- Opening a new exact scope replaces session/header/visible refs/overlay atomically.
- Focus behavior differs appropriately for keyboard versus pointer activation; no focus trap exists in docked mode.

### Table

- Whole-layer Punkter/Ledninger tabs and saved preferences remain unchanged.
- Exact mode has no geometry switch/auto-switch and reports one geometry quietly.
- Tema source resolution works for `S_FCODE` and schema-bound Tema.
- Tema is first/sticky; current field is second/sticky; Resultat follows.
- Tema inspection deduplicates the current-field column and uses one sticky data column.
- Scoped order/sort never writes whole-layer preferences.
- Status text/icon is present independent of color.
- Horizontal scrolling produces correct cumulative sticky offsets and z-index/background behavior.
- Empty, stale, mixed, forged, or out-of-range exact scopes fail closed as specified previously.

### Map

- Overlay contains exactly visible refs for current session/revision.
- Overlay defaults on for Validator session and toggles without changing scope/filter/visibility.
- Feil/search filtering changes overlay but not normal layer styles or visibility settings.
- Non-scoped objects remain normal.
- Hidden base objects may still receive independent inspection annotation without clearing map filters.
- Hover and single selection are visibly stronger and target the correct layer-qualified object.
- Zoom fits visible rows; zero rows disables/announces; no mass selection or visibility change occurs.
- Profile overlay and inspection overlay pane/z-index interactions are tested.

### Floating controls/responsive behavior

- Every trigger rectangle stays within `MapPane` bounds with inspector closed/open and table/profile closed/open.
- Statistikk is absent whenever a bottom surface is active and returns when none is active.
- Del/reset remain direct in normal/constrained states and are available in narrow overflow.
- Reset always has its full consequential label when in overflow.
- Test/developer controls collapse before normal user actions.
- Toolbar state follows map container width even when browser width is unchanged.
- No toolbar wrapping at 100%, 200%, and representative Norwegian text widths.
- Legend, Leaflet layers, WMS/zoom, measure UI, prompts, and toolbar do not overlap.

### Responsive/accessibility

- Docked, contained drawer, and very-narrow fallback preserve field/list state.
- Landmarks and skip links support keyboard movement among list, inspector, map, and table.
- Resultat/Regel arrow/Home/End behavior survives extraction.
- Inspector close, table close, toolbar overflow, and splitter controls have accessible names and focus return.
- Overflow closes on Escape/outside action and has no hidden duplicate tab stops.
- Splitter future tests cover ARIA values and keyboard resize/collapse.
- Status and current context remain understandable without color or hover.

### Privacy/persistence/performance

- Exact session, visible refs, metadata, overlay set, callbacks, and selected field are absent from persisted serialization, URLs, telemetry, console output, and export.
- Exercise overlay/table scopes of 10, 165, 470, 5,000, and tens of thousands; profile construction and updates rather than setting arbitrary timing thresholds first.
- Normal GeoJSON key does not change solely because overlay membership changes.

## 31. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| `page.js` becomes a boolean/state soup | Keep page as composition root; put geometry in `WorkspaceShell`, Validator state in its provider, runtime inspection in a non-persisted slice, and use derived `activeBottomSurface`/slot availability |
| Existing table/profile docking breaks | Characterize mutual exclusion first; normalize both into one bottom region in a separate slice; preserve current profile/table content and close actions |
| Resultat/Regel rendering is duplicated | Extract one controlled shared content/model before mounting the inspector; modal remains only a frame/fallback |
| Inspector reduces map below useful width | Clamp 380-560 px, protect 480 px map, and switch to drawer instead of over-shrinking |
| Controls remain viewport-positioned | Require all map trigger DOM to descend from `MapPane`; add bounding-rectangle tests and remove fixed offsets |
| Hidden/overflowed controls become inaccessible | One accessible overflow model, no CSS-hidden focusables, full labels, Escape/focus return, and test-mode variants |
| Table and inspector fight for dimensions | Two-dimensional grid owns both axes; one vertical and one horizontal constraint model; minima plus fallback instead of nested percentage hacks |
| Leaflet renders stale/grey areas after pane changes | Retain container `ResizeObserver` invalidation, verify transition timing, avoid long CSS height transitions, and test every open/close/resize path |
| 3D view does not resize or frame correctly | Verify R3F parent observation; explicitly notify/invalidate camera renderer if tests show lag; share pane measurements rather than window dimensions |
| Existing modal tests assume modal semantics/file shape | Update in Slice 1 to test shared model/content and separate dialog versus inspector semantics; reduce source-regex coupling |
| z-index conflicts among Leaflet, inspector, toolbar, bottom dock, and dialogs | Define a small layer scale by surface; keep map overlays inside map stacking context; dialogs alone sit above workspace |
| Sticky columns overlap | Compute cumulative offsets from actual widths; special-case Tema=current field; opaque backgrounds and horizontal-scroll tests |
| Current `S_FCODE` sticky assumption conflicts with second sticky column | Replace boolean `isFixed` with ordered pin metadata and one offset function shared by header/body |
| Large overlay scopes are slow | Separate layer, direct index resolution, memoization, non-interactive Canvas/batched rendering, bounded update keys, and profiling before status synchronization |
| Current hover highlight remounts normal GeoJSON | Never use `highlightedFeatureIds` for scope overlay; retain single hover initially and later decouple it if profiling warrants |
| Responsive behavior follows browser rather than map width | CSS container queries on `MapPane`; optional one local ResizeObserver enum only as fallback |
| Statistikk logic becomes feature-specific booleans | Derive one `activeBottomSurface` and `mapBottomActionSlotAvailable`; future docks register through the same model |
| Inspector/table context appears synchronized when it is not | Prefix headings (`Felt`, `Objektutvalg`) and show a quiet mismatch note; never derive table context from current selection |
| Scoped column preferences corrupt whole-layer preferences | Compute effective scoped order/sort locally and prohibit persistence/store preference actions in exact mode |
| Runtime/private refs leak through current persisted `ui` | Keep session outside persisted `ui` or whitelist persistence before adding it; add serialization and privacy tests |
| Overlay conflicts with normal hidden features | Treat it as non-interactive annotation in its own pane; never clear filters or claim normal feature visibility changed |

## 32. Non-goals

- No implementation in this planning task.
- No validation rule, policy, status, count, wording, or export change.
- No redesign of Validator field cards/list.
- No second object table and no Validator-specific table fork.
- No new map and no Leaflet/3D rewrite.
- No multi-layer or mixed-geometry object scope.
- No object multi-select or automatic mass selection.
- No editing.
- No GMI export change.
- No persisted `ObjectRef`s, private IDs in URLs, or session metadata in telemetry/public diagnostics.
- No use of normal layer visibility filters as inspection scope.
- No production configuration, deployment, merge, push, or commit.

## 33. Product decisions still required

No decision blocks the first five slices if the recommendations in this report are accepted. Two genuine product choices remain for later phases:

1. **Field-level population and `Ikke vurdert`.** Alternatives: include only objects with contextual Feil/Sjekk/Pass, or include every geometry object and add an explicit `Ikke vurdert` state. Recommendation: include only evaluated refs so counts remain auditable; never silently label non-applicable objects Pass. This carries forward from the accepted table plan and is needed before Slice 7.
2. **Very-narrow detail presentation.** Alternatives: keep a pane-contained non-modal drawer as long as possible, or switch earlier to the existing modal/dialog fallback. Recommendation: contained drawer for constrained desktop/tablet; shared modal/single-pane fallback only when the 430 px left list and a useful map cannot coexist. Confirm through responsive product review after Slice 2 rather than hard-coding a browser-width breakpoint now.

The following do not require product approval for MVP: option B table span, 460/380/560 inspector sizing, 62/38 table split, no pane-size persistence, preserving Resultat/Regel tab while switching fields, overlay default ON, overlay following visible rows, and zoom using visible rows. They are reversible implementation defaults and should be tuned through focused usability/layout testing.
