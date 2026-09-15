# Validator V2 object-table integration plan

Date: 2026-09-13
Branch inspected: `feature/validator-v2-v32-ui-polish`
Scope: planning and architecture only; no production implementation

## 1. Existing table architecture

The application has one current object table, `LayerDataTable`. It is a docked panel below the map or 3D view, not a modal. Opening it reduces the primary view to 55% height and gives the table 45% (`src/app/page.js:61-78`, `src/app/page.js:631-640`). The table is mounted only while `ui.layerDataTable.isOpen` is true.

The table is opened from the relevant layer panel through `openLayerDataTable(layerId)` (`src/components/LayerPanel.js:1159-1161`, `src/components/LayerPanel.js:1396-1399`). The action records one layer ID and closes profile analysis (`src/lib/store.js:1512-1531`). Profile analysis performs the reciprocal operation and closes the table when analysis opens (`src/lib/store.js:508-540`).

`LayerDataTable` reads the selected layer directly from the Zustand `layers` dictionary using `ui.layerDataTable.layerId` (`src/components/LayerDataTable.js:99-129`). It does not consume a supplied row model, query, or subset. Its active geometry is represented by the Norwegian UI tab values `punkter` and `ledninger`; the tab is remembered per layer (`src/components/LayerDataTable.js:161-172`).

The current row pipeline is:

1. Read the complete `layer.data.points` or `layer.data.lines` array.
2. Shallow-copy every source object and add `__index`, which is its zero-based source-array index (`src/components/LayerDataTable.js:277-283`).
3. Remove objects hidden by the layer's Tema, Type, or Felt filters (`src/components/LayerDataTable.js:174-223`, `src/components/LayerDataTable.js:285-293`).
4. Discover displayed attributes, construct TanStack columns, sort through TanStack Table, and virtualize the resulting rows (`src/components/LayerDataTable.js:299-343`, `src/components/LayerDataTable.js:490-545`).

The implementation therefore assumes the whole selected geometry collection before filtering. It has no object-scope input today.

## 2. Exact relevant files, components, and state owners

| File/module | Current responsibility | Relevance to the integration |
| --- | --- | --- |
| `src/components/LayerDataTable.js` | Complete docked table UI, row construction, attribute columns, sorting, virtualization, row hover/click, and zoom action | Reuse and generalize this component; do not create a Validator table |
| `src/lib/store.js:102-110`, `1512-1630` | Zustand table open state, layer/geometry preferences, sort/order preferences, and map highlight actions | Add the generic open contract and an ephemeral inspection session here or in a focused slice imported here |
| `src/app/page.js:61-78`, `631-640` | Owns docked map/table layout | Continue using this mounting and sizing mechanism |
| `src/components/LayerPanel.js:1396-1399` | Existing whole-layer table opener | Keep as a compatibility caller of the generic API |
| `src/components/MapInner.js:1898-1965` | Converts layer source arrays to map features, assigning source index as feature `id` | Confirms table/Validator source-index compatibility |
| `src/components/MapInner.js:2151-2168` | Builds base and layer-qualified map feature IDs | Centralize or reuse this conversion for table interactions |
| `src/components/MapInner.js:2171-2488` | Applies visibility filters and highlight styles to lines and points | Keep table filtering separate from map visibility in scoped inspection |
| `src/lib/validation-v2/objectRef.js` | Constructs and validates revision-, layer-, geometry-, and index-qualified `ObjectRef`s | Validator adapter's authoritative input identity |
| `src/lib/validation-v2/datasetRevision.js` | Assigns one opaque revision for an in-memory dataset object | Staleness guard for a table scope |
| `src/lib/validation-v2/validationRunner.js:471-484`, `505-578` | Retains exact refs on outcomes/findings/rule results | Source of exact diagnostic and field scopes |
| `src/lib/validation-v2/resultPresentation.js:166-223` | Groups multiple rule owners into one field and deduplicates status by `ObjectRef.key` | Basis for field-level contextual status metadata |
| `src/lib/validation-v2/diagnostics.js:170-247`, `278-357` | Groups findings into field diagnostics and multi-owner Resultat models | Must retain exact refs through grouping rather than only sample labels |
| `src/lib/validation-v2/fieldData.js:267-343` | Builds value-distribution buckets and contextual outcome groups | Must retain exact refs per presented distribution group |
| `src/lib/validation-v2/fieldDataPresentation.js:49-93` | Splits a delivered value into status/context presentation rows | Carry the exact group refs into each actionable row |
| `src/components/validation-v2/ValidationV2Workspace.js` | Owns selected layer/geometry, result, sidebar search/filter/sort, expanded field, and modal context | Validator caller and return-state owner |
| `src/components/validation-v2/ValidationV2RuleList.js` | Renders field rows, counts, expansion, and current `Vis` details action | Candidate field-level object action location |
| `src/components/validation-v2/ValidationV2FieldInfoModal.js` | Renders Resultat diagnostics and Detaljer value rows; owns Resultat/Regel tab locally | Add diagnostic/distribution actions and support modal suspension/restoration |

## 3. Current table/map interaction

Table and map use source-array indices, converted into strings such as `punkter-${layerId}-${index}` and `ledninger-${layerId}-${index}`.

- Hovering a table row sets `ui.highlightedFeatureIds` to a one-item `Set`, and leaving clears it (`src/components/LayerDataTable.js:468-478`). The map recognizes both base and layer-qualified IDs (`src/components/MapInner.js:2231-2239`, `2414-2422`).
- Clicking a row sets `ui.highlightedFeatureId` (`src/components/LayerDataTable.js:460-466`). `FeatureHighlighter` then finds the matching GeoJSON feature and fits the map to it unless an explicit center target already owns that action (`src/components/MapInner.js:1410-1451`). In practice, row click is selection/highlight plus automatic fit.
- Each row has a separate zoom button. It takes the first point coordinate or the middle line vertex and calls `viewObjectInMap` at zoom 20 (`src/components/LayerDataTable.js:428-457`, `490-507`). That action also establishes the 2D highlight, map center target, and selected 3D object (`src/lib/store.js:1348-1400`).
- The table has no row-selection model, selected-row styling, multi-select, double-click action, or map-click-to-row synchronization.
- Clicking an object on the map marks the Leaflet event so an empty-map click does not clear selection, then opens the existing popup. It does not publish a reusable selected `ObjectRef` for the table (`src/components/MapInner.js:2491-2555`).
- Clicking empty map space clears only the single highlighted feature (`src/components/MapInner.js:965-986`).

The existing one-way table-to-map behavior should be preserved for the first slice. True two-way synchronization needs a generic selected-object identity event/state; it is not already present.

## 4. Current filtering and search behavior

The table does not implement TanStack global filtering, column filtering, or search. It only mirrors existing per-layer visibility state:

- `layer.hiddenCodes`
- `layer.hiddenTypes`
- `layer.feltHiddenValues`

The same state hides map features by returning invisible/non-interactive line styles or markers (`src/components/MapInner.js:2193-2273`, `2376-2456`). `resetLayerFilters(layerId)` mutates the layer filters and consequently changes both table rows and map visibility (`src/lib/store.js:2266-2304`). The current table's `Nullstill` action calls this application-level mutation (`src/components/LayerDataTable.js:622-665`).

Sorting is client-side TanStack sorting. Clicking an attribute header toggles sorting; sorting is saved by layer and geometry (`src/components/LayerDataTable.js:375-390`, `521-533`). Column order is changed through drag and drop and saved by layer and geometry (`src/components/LayerDataTable.js:345-426`). There is no keyboard column-reorder alternative.

There is no column visibility chooser. Every non-empty attribute discovered from the first 100 visible rows is shown; later rows are checked only for data in already discovered fields, so an attribute first appearing after row 100 is omitted (`src/components/LayerDataTable.js:299-343`). `S_FCODE` is moved to the front and made sticky. All other columns remain visible, subject only to horizontal scrolling.

For scoped inspection, inspection filters must be table-local and composed after the immutable scope. They must not call `resetLayerFilters` or alter map visibility. Existing whole-layer opening can retain its current layer-filter behavior initially, but the header must distinguish those application filters from inspection filters.

## 5. Existing object identity model

The table has no formal row identity type. Its effective identity is:

`layerId + geometry collection + source-array index`

`__index` is preserved from the unsorted source array, so sorting and filtering do not change the map target. TanStack's default row ID is not suitable as the durable identity because it is based on the table row position; a scoped implementation should provide `getRowId` using the normalized object identity.

Map features use the same source index. `MapInner` assigns `properties.id = idx` while enumerating each layer's `lines` and `points` arrays and carries `_layerId` (`src/components/MapInner.js:1912-1959`). This is why the current table-to-map IDs resolve correctly even after table sorting.

This identity is stable only while the layer's current dataset object and array ordering remain unchanged. It is not stable across reparsing, layer replacement, or reordered arrays.

## 6. Validator object identity compatibility

Validator's `ObjectRef` is a stronger version of the table's implicit identity. It contains:

- `key`
- `layerId`
- `datasetRevision`
- `geometryScope` and equal `geometryType`
- `sourceIndex`
- `localIdentity: { kind: 'index', value: sourceIndex }`

`createObjectRef` freezes this structure, and `assertObjectRefOwnership` verifies the complete shape and exact layer/revision/geometry owner (`src/lib/validation-v2/objectRef.js:96-138`, `171-237`). The revision belongs to the lifetime of the in-memory dataset object through a `WeakMap` (`src/lib/validation-v2/datasetRevision.js:13-27`).

Compatibility is exact for the current runtime: `ObjectRef.sourceIndex` addresses the same source array used by the table and map. Validator can therefore provide stable identities for the current loaded revision without copying rows or reconstructing expressions.

Exact identity is retained by the engine:

- Every outcome has its `objectRef`.
- Every finding has its `objectRef`.
- Every rule result exposes `affectedObjectRefs`, derived from its findings (`src/lib/validation-v2/validationRunner.js:458-484`).

Two presentation gaps must be fixed by the eventual adapter:

1. `diagnostics.js` currently converts refs to human labels, retains at most ten sample labels, and discards the complete exact set from the finalized diagnostic (`src/lib/validation-v2/diagnostics.js:204-247`). The diagnostic grouping step already sees each exact finding ref, so it should retain an internal exact ref list or identity list alongside the privacy-safe samples.
2. `fieldData.js` enumerates an exact `ObjectRef` for every object but stores only counts in delivered-value buckets and contextual outcome groups (`src/lib/validation-v2/fieldData.js:267-320`). Each outcome group should retain its exact refs. The presentation row produced from that group should carry those refs for its action.

Relationship pairs have the same gap. `diagnostics.js` counts each Type/Tema pair but does not retain pair-specific refs (`src/lib/validation-v2/diagnostics.js:213-218`, `236-246`). Add exact refs to each pair accumulator; do not rebuild `Type = X AND Tema = Y` when clicked.

Schema-only diagnostics without per-object refs must not offer an object action. A missing exact set should fail closed, never fall back to the complete layer.

## 7. Recommended generic object-scope API

Keep the current Zustand/open-action pattern. Add a generic action and preserve the old action as a wrapper:

```js
openObjectTable({
  scope: {
    kind: 'object-set',            // or 'whole-geometry'
    layerId,
    datasetRevision,
    geometryScope: 'point',
    objectRefs,
  },
  context: {
    title: 'Type',
    description: 'Mangler Type · Tema DIV',
    badges: [{ label: 'Feil', tone: 'red' }],
  },
  rowMetadata: {
    columns: [{ id: 'status', label: 'Resultat' }],
    byObjectKey,
  },
  facets: [{
    id: 'status',
    label: 'Resultat',
    options: [
      { value: 'FAIL', label: 'Feil' },
      { value: 'CHECK', label: 'Sjekk' },
      { value: 'PASS', label: 'Pass' },
    ],
  }],
  initialFilters: { status: 'ALL' },
  preferredColumns: ['Type', 'Tema'],
  source: { id: 'validation-v2', label: 'Validator' },
  lifecycle: { onClose, returnFocusTo },
});
```

This is a shape recommendation, not an instruction to persist the request verbatim. The store action should normalize it atomically into an ephemeral `objectTableInspection` session:

- Validate that all refs have one layer ID, one current dataset revision, and one geometry.
- Reject stale, mixed, forged, or out-of-range refs.
- Deduplicate by `ObjectRef.key`.
- Retain source indices/keys and contextual metadata; resolve live rows from `layers[layerId].data`.
- Accept an empty set as an explicit zero-row scope. Never interpret it as "whole layer."
- Give each session an opaque runtime ID so replacing one inspection cannot invoke an older return callback.

`openLayerDataTable(layerId)` should call `openObjectTable` with `scope.kind = 'whole-geometry'` and the remembered geometry tab, preserving the current layer-panel behavior. Generic naming makes the same entry point usable by photo QA, edited-object review, WFS sets, import warnings, user selections, and comparisons.

The neutral app-level identity should be the tuple `{ layerId, datasetRevision, geometryScope, sourceIndex }`. Validator's existing `ObjectRef` is structurally compatible. A later implementation may move or wrap the pure revision/identity helpers under a neutral app module, but the MVP does not need to rewrite Validator identity. Do not use copied row objects, predicates, or query text as scope identity.

### State and persistence boundary

The store currently persists all of `ui` to `gmi-validator-storage` while omitting layer data (`src/lib/store.js:2849-2859`). Therefore exact refs, identity sets, metadata maps, private values, and lifecycle callbacks must not be placed in persisted `ui`.

Recommended split:

- Keep durable table preferences such as sort, column order, and active whole-layer tab in `ui.layerDataTable`.
- Keep the active `objectTableInspection` at a top-level runtime state key omitted by `partialize`, or explicitly whitelist only safe table preferences during persistence.
- Do not persist `isOpen/layerId` for a scoped session. On reload there is no loaded layer or valid revision to resolve it.
- Clear the ephemeral session on close, layer removal, dataset replacement, reset, or stale-revision detection.

## 8. Scope versus filter model

The table pipeline should become:

`current layer/revision -> immutable scope -> table-local filters/search -> sorting -> virtual rows`

Scope answers which objects may appear in this inspection. Filters only narrow that set.

- A Type field scope contains every deduplicated point ref with a contextual Type field status.
- A diagnostic scope contains exactly the refs accumulated into that diagnostic.
- A relationship-pair scope contains exactly the refs accumulated into that pair.
- A value-distribution row scope contains exactly the refs accumulated into that delivered-value/status/context group.

Changing `Alle`, `Feil`, `Sjekk`, `Pass`, searching, or sorting must never replace or broaden the scope. `Nullstill filter` clears table-local search and facets to show the complete current scope. It should preserve sorting and column order because those are view preferences rather than row filters.

An optional `Vis hele laget` action would replace the current scope with an explicit whole-geometry scope. It must have its own label and confirmation-free action; it is not part of filter reset and is not required for the MVP.

Application map visibility and layer-sidebar filters are a separate state domain. In scoped mode, do not silently use them to remove table rows. The header may indicate that an object is hidden by a map filter when map interaction cannot show it. Clearing or changing map filters must remain an explicit user action.

## 9. Validator field-level UX

Recommend an explicit `Vis objekter` button in the Resultat surface for the selected field, near the Resultat heading/summary. A secondary field-level action can also be exposed in the expanded sidebar row later, beside the existing `Vis` details action.

The action should open the full contextual field population for the selected geometry with `Alle` selected. This is preferable to opening only Feil + Sjekk because:

- the label does not imply a hidden attention filter;
- users can compare passing and failing records;
- counts remain auditable against the field summary;
- the same table session supports `Alle`, `Feil`, `Sjekk`, and `Pass` without reopening.

Field population and status must be produced by one shared selector across all field owners. For Type, it must combine `innmaling.point.type.valid` and `innmaling.point.type-tema.compatible`, deduplicate by `ObjectRef.key`, and choose the strongest contextual status in the order Feil, Sjekk, Pass. Dependency-review outcomes that the sidebar presents as Sjekk must use the same rule here.

The current code has two similar but not identical status aggregations: `resultPresentation.js:180-205` includes dependency-review Sjekk, while `diagnostics.js:335-355` only includes direct PASS/CHECK/FAIL/INDETERMINATE. Extract one pure field-object-status selector and make both callers consume it before adding table controls.

Objects with no displayable field status should not be silently added as Pass. If product wants non-applicable objects in field scope, that requires a visible `Ikke vurdert` state and is an open product decision.

## 10. Diagnostic-card UX

Use an explicit button inside each diagnostic card, after the explanatory content:

`Vis 165 objekter`

The button should carry an accessible name such as `Vis 165 objekter i tabell: Tema DIV mangler Type`. Do not make the whole card clickable. The card contains explanatory text, may later contain links, and should remain easy to select/read without accidental navigation.

The diagnostic scope is the exact ref set retained by the diagnostic grouping operation. The context header should show the field, diagnostic status, concise reason, and scope count. A Feil badge in this scope describes why it was opened; it need not be implemented as an active status filter because every object already belongs to that exact diagnostic.

For Type/Tema compatibility, the card-level action opens all incompatible objects in that diagnostic. If more than one pair is shown, each structured pair row should also have its own explicit `Vis N objekter` action using the pair's retained refs. The current string-only `detailLines` presentation should be supplemented with structured pair data for actions rather than parsed back into values.

## 11. Value-distribution-row UX

Use a dedicated action in the value-distribution row, preferably beside or immediately after the object count. The visible label should be `Vis 64 objekter` or a compact `Vis objekter` with the full count in its accessible name.

Do not make the entire row clickable. Rows contain value text, explanatory disclosures, links such as NOBB links, and contextual help buttons (`src/components/validation-v2/ValidationV2FieldInfoModal.js:365-393`). A dedicated button avoids nested interaction conflicts and supports keyboard users.

The scope must correspond to the exact presented row, including its delivered value, status, and contextual qualifier. Because one delivered value can be split into multiple status/context rows by `buildValidationV2FieldDataPresentation`, refs belong on `outcomeGroups`, not only the broader delivered-value bucket.

## 12. Status filter UX

For field-level sessions, render a compact button group in the existing table header:

- `Alle N`
- `Feil N`
- `Sjekk N`
- `Pass N`

Use text and `aria-pressed`, not color alone. Counts are fixed facet counts over the immutable scope so they do not change when the user selects another status. Search may further reduce the visible row count, which should be reported separately as `X av N objekter`.

Implement status as contextual ephemeral row metadata and a generic table facet. It can also be shown as a virtual `Resultat` column. It must not be written to `item.attributes`, the layer, exported GMI, or a generic permanent `validationStatus` field. The same object may have Feil for Type and Pass for Målemetode.

The existing table has no reusable filter architecture beyond application layer filters. Add one generic table-local facet/search layer in `LayerDataTable`; do not add filtering logic inside Validator UI and do not reuse map visibility filters for contextual status.

`Nullstill filter` means:

- clear table search;
- set every table-local facet, including status, to `Alle`;
- keep the exact scope;
- keep layer/map visibility unchanged;
- keep sort and column order.

## 13. Context/header UX

Extend the existing compact `Datatabell · layer name · count` header rather than adding another panel. A scoped header needs only:

- context title, for example `Type`;
- scope summary, for example `165 objekter`;
- optional status badge and concise reason, for example `Feil · Mangler Type · Tema DIV`;
- table-local filter controls;
- `Tilbake til Validator` when a return target exists;
- the existing close action.

Long descriptions should truncate with a title/accessible description. Do not expose internal rule IDs, ObjectRef keys, or source indices in this header. `source` controls the return label and visual context but should not create caller-specific table components.

## 14. Navigation and return behavior

Use the current docked table mechanics. Keep the Validator sidebar mounted and selected. Opening from Resultat should temporarily dismiss the blocking field modal, because the modal is a fixed `aria-modal` overlay at z-index 10003 (`src/components/validation-v2/ValidationV2FieldInfoModal.js:522-529`) and would otherwise make the docked table unusable.

Do not discard the field modal context. The recommended caller flow is:

1. Retain `fieldInfoContext` in `ValidationV2Workspace`.
2. Suspend the modal visually while the table session is open.
3. Keep the modal component/state mounted with `isOpen={false}`, or lift its active Resultat/Regel tab into workspace state. The current active tab is local to the modal (`src/components/validation-v2/ValidationV2FieldInfoModal.js:420-468`) and would reset if the component were unmounted.
4. Open the existing docked table while keeping `fieldValidationOpen` true. The sidebar therefore retains selected layer, geometry, expanded field, search/filter/sort state, run result, and scroll context because `ValidationV2Workspace` remains mounted (`src/app/page.js:491-504`).
5. On `Tilbake til Validator` or table close, restore the modal and focus the exact originating action. If opened from the sidebar field action, restore focus there without opening a modal.

The generic inspection session may hold a runtime-only close callback/focus target, or publish a close reason that the caller observes. It must not persist either. Avoid a global enum that hard-codes Validator fields into the table.

## 15. Map interaction behavior

For the first implementation, preserve established behavior:

- Row hover transiently highlights that one map object.
- Row click selects/highlights and retains the current automatic fit behavior.
- The existing zoom button explicitly centers at the current fixed zoom behavior.
- Closing the table clears transient multi-highlight state as it does now.

Do not automatically highlight every scoped object. Do not dim or hide non-scoped objects. Do not make table status/search filtering change map visibility. These three concepts remain separate:

| Concept | Effect |
| --- | --- |
| Object scope | Bounds which rows this inspection can show |
| Table filter/search | Narrows visible rows inside the scope |
| Map highlight/selection | Emphasizes selected or hovered objects |
| Map visibility | Remains owned by layer/map controls |

For complete two-way synchronization, introduce a neutral selected-object identity based on layer, revision, geometry, and source index. A map feature click can publish that identity. If it belongs to the open table scope and passes current table filters, the table selects and scrolls it into view; if it is outside scope, it must not broaden the scope. Keep the existing popup behavior.

The current app has no table multi-select. Keep single selection for the MVP. Multiple selection can later use a bounded `Set` of normalized object keys and the existing multiple-highlight channel, with explicit keyboard modifiers and a clear-selection action. Do not make status filtering automatically select or highlight all visible rows.

`Zoom to visible objects` is a reasonable optional table action. It should calculate bounds from currently visible table rows without changing map visibility or selection. It is not needed to prove exact-scope integration.

If an object is hidden by an existing map filter, row selection should not silently clear that filter. The table should indicate that the object is hidden on the map and offer an explicit route to the relevant map/layer filter. This behavior needs a product decision before polish.

## 16. Accessibility model

- Every `Vis objekter` control is a real `button`, reachable by keyboard and visible without hover.
- Accessible names include count and context where useful: `Vis 64 objekter i tabell: Adkomst mangler, Tema KUM, Sjekk`.
- Status controls use visible text plus `aria-pressed`; color remains supplementary.
- When the table opens, focus moves to its context heading or first table control. The heading should be programmatically focusable for this transition.
- On close/back, focus returns to the exact diagnostic, distribution, or field-level opener.
- Suspending the modal must deactivate its focus trap and remove `aria-modal` while hidden. Restoring it should restore the prior Resultat/Regel tab and a sensible focus target.
- Scoped table rows need a keyboard-operable selection control or row semantics. The current clickable `div` rows are pointer-only; do not rely on them for the new object action.
- Sorting headers should be real buttons with `aria-sort`. Current clickable/draggable `div` headers are not a sufficient keyboard model.
- The close button needs an accessible name; the current table close control has only its glyph (`src/components/LayerDataTable.js:670-678`).
- Announce visible/scope count changes through a restrained status region.

## 17. Performance considerations

The current table already uses TanStack Virtual with a fixed 28 px row estimate and overscan 10 (`src/components/LayerDataTable.js:20`, `537-545`). DOM row count is therefore suitable for thousands or tens of thousands of rows.

Recommended representation and costs:

- Store exact identity once as a deduplicated key/index set plus an ordered source-index list.
- Resolve row objects from the current layer arrays. Do not copy full objects into inspection state.
- Build contextual metadata lazily when opening the table and key it by stable object key.
- For a small exact scope, map its source indices directly to rows rather than scanning the complete layer.
- For a whole geometry, retain the current linear enumeration.
- Apply `Set` membership for facet filtering and selection.
- Memoize normalized rows by session ID, current dataset object/revision, filters, and search.

Expected behavior by scale:

| Scope size | Assessment |
| --- | --- |
| 10 | Trivial; direct index resolution |
| 165 | Trivial; diagnostic target size |
| 470 | Trivial; normal field population |
| 5,000 | Virtual rendering is appropriate; client sort/search remain reasonable |
| Tens of thousands | Rendering remains virtual, but attribute discovery, sorting, metadata construction, and map restyling need profiling |

Two current constraints deserve attention:

1. The table shallow-copies every raw item to add `__index`. A row wrapper containing `{ objectKey, sourceIndex, item, metadata }`, or a non-mutating row-model accessor, avoids copying object-shaped records.
2. `GeoJSON` is keyed by a `styleVersionKey` that includes highlighted IDs (`src/components/MapInner.js:2015-2077`, `2706-2712`). Hovering rows can therefore remount/restyle a large GeoJSON layer. Do not highlight an entire scope by default; profile existing row hover on large layers before expanding selection behavior.

Also retain awareness that attribute columns are discovered only from the first 100 rows. A scoped set can produce a different column inventory than the whole layer. `preferredColumns` should be prioritized if present even when sparse, and eventual column discovery should use schema/field analysis or a complete key inventory rather than relying solely on the first 100 scoped rows.

## 18. Multi-layer and geometry constraints

The first implementation should accept exactly one loaded layer, one current dataset revision, and one geometry per table scope.

This matches Validator's selected geometry model and the table's point/line source arrays. In scoped mode, hide or lock the other geometry tab; switching from an exact point diagnostic to all lines would silently destroy scope semantics. In whole-layer mode, keep both current tabs.

Multiple loaded layers may remain visible on the map. A scoped table operates on its specified layer only, and all map IDs must remain layer-qualified. Opening a new table scope replaces the current inspection session; it does not merge layers.

A future multi-layer table would need grouped layer context, composite identity, per-layer revision checks, and column reconciliation. It should be a separate design. Do not make the first API accept mixed refs and then partially display them.

## 19. App-level changes required

Planning boundary A, generic table reuse:

1. Add the ephemeral generic inspection-session state and `openObjectTable(request)`/close lifecycle in the Zustand architecture.
2. Retain `openLayerDataTable(layerId)` as a whole-layer compatibility wrapper.
3. Normalize and validate one-layer/one-revision/one-geometry exact scopes atomically.
4. Refactor `LayerDataTable` row construction to resolve either a whole-geometry scope or an exact object set.
5. Give TanStack rows stable object-key IDs.
6. Add generic contextual metadata columns/facets and table-local search/filter state.
7. Add a compact generic context/return header in the existing visual language.
8. Separate scoped table filtering from map/layer visibility filters.
9. Preserve current sorting, column ordering, virtualization, hover, row click, and zoom behavior.
10. Add focus entry/restoration hooks and keyboard-accessible controls.
11. Ensure inspection state is omitted from persistence, URLs, telemetry, logs, and public diagnostics.
12. Close/fail the session if the layer disappears or its dataset revision changes.

## 20. Validator-specific changes required

Planning boundaries B and C:

### B. Validator adapter

1. Extract one pure field-object-status selector shared by sidebar counts, Resultat counts, and the table adapter.
2. Deduplicate multi-owner outcomes by `ObjectRef.key` and apply Feil > Sjekk > Pass consistently.
3. Retain exact refs in diagnostic groups, dependency groups where meaningful, relationship pairs, and field-data outcome groups.
4. Build the generic table request lazily for field, diagnostic, relationship-pair, and distribution-row actions.
5. Supply contextual status as ephemeral metadata; never mutate layer attributes.
6. Validate every request against `result.layerId`, `result.datasetRevision`, selected geometry, and current layer dataset revision.

### C. Validator UI controls

1. Add field-level `Vis objekter` in Resultat, opening the complete field population with `Alle`.
2. Add explicit `Vis N objekter` buttons to diagnostics with exact refs.
3. Add explicit actions to relationship pair rows where pair breakdown is shown.
4. Add explicit actions to value-distribution rows using their exact status/context group refs.
5. Suspend and restore the field modal around the docked table without losing the active tab or focus origin.

## 21. Minimum viable implementation slice

The smallest useful vertical slice is narrower than adding field status filters first:

1. Add the generic ephemeral object-scope contract and exact row resolver to the existing table.
2. Preserve whole-layer opening through the old wrapper.
3. Add context header, stale/empty-scope handling, and return lifecycle.
4. Retain exact refs for one diagnostic group.
5. Add one diagnostic-card `Vis N objekter` action.
6. Open exactly that diagnostic set in the existing docked table.
7. Preserve current row hover, row click, and zoom behavior.
8. Suspend/restore the Resultat modal and restore focus.
9. Prove privacy and exact-scope tests.

This slice validates the hardest architectural seams: exact identity, no broadening, docked navigation, current map behavior, and non-persistence. It does not require contextual status filtering because a diagnostic's scope is already exact.

## 22. Recommended implementation sequence

1. **Identity and store boundary.** Define the neutral scope/session contract, revision validation, stable row key, lifecycle, and persistence exclusion.
2. **Existing table generalization.** Resolve exact source indices in `LayerDataTable`, lock geometry in scoped mode, render context, and preserve whole-layer compatibility.
3. **Diagnostic vertical slice.** Retain full exact diagnostic refs, add one explicit action, and implement modal suspension/return.
4. **Scope behavior and accessibility hardening.** Cover empty/stale sets, keyboard entry/exit, focus restoration, stable counts, and no hidden fallback.
5. **Shared field-status selector.** Reconcile the existing multi-owner aggregations and expose contextual metadata.
6. **Field-level table session.** Add `Alle/Feil/Sjekk/Pass`, status column/facet, search, preferred columns, and reset-within-scope.
7. **Value distribution.** Retain exact refs per outcome group and add row actions.
8. **Relationship-pair actions.** Retain and open exact pair subsets when multiple pairs are presented.
9. **Two-way map/table selection.** Add neutral map selection publication and table scroll/selection without scope changes.
10. **Optional scale and UX follow-ups.** Zoom-to-visible, multi-select, whole-layer escape action, column chooser, and large-map highlight optimization.

This sequence follows the current architecture better than implementing field status filters in the first slice. Exact diagnostic scope proves the reusable table seam without first reconciling every field-owner status edge case.

## 23. Test plan

The eventual implementation should add pure model/store tests first, then focused component/browser coverage for interaction and focus. The repository currently has extensive Node model tests but no existing `LayerDataTable` tests, so UI tests may require a small React DOM test setup or the project's chosen browser harness.

### Scope and identity

- An exact 165-ref diagnostic opens 165 rows and never the full geometry collection.
- Empty `objectRefs` opens an explicit zero-row scope and never falls back to whole layer.
- Duplicate refs are deduplicated by key.
- Mixed layer, revision, or geometry refs are rejected atomically.
- Out-of-range and forged refs fail closed.
- Replacing/reloading layer data invalidates and closes the stale scope.
- Sorted and filtered rows still target their original source index.
- Multiple loaded layers with equal local indices resolve only the requested layer.
- Point and line index zero remain distinct.

### Validator adapter

- The Type field combines all owners and counts each object once.
- An object that passes Type validity but fails Type/Tema compatibility is Feil once.
- Feil outranks Sjekk, which outranks Pass.
- Dependency-review Sjekk semantics match sidebar and table.
- Diagnostic grouping retains the exact refs represented by its count.
- Each Type/Tema relationship pair retains only its own refs.
- Each value/status/context distribution row retains only its own refs.
- No affected set is reconstructed from display text or attribute predicates.
- Existing validation states, counts, reasons, policy behavior, and immutable results remain unchanged.

### Filters and table behavior

- Field `Alle`, `Feil`, `Sjekk`, and `Pass` counts sum to field scope size.
- Changing status filters never changes scope identity.
- Search and status compose within scope.
- `Nullstill filter` restores every row in the scope while preserving scope, sorting, and column order.
- Explicit whole-layer opening remains whole-layer behavior.
- Existing layer/map filters are not mutated by scoped table controls.
- Preferred columns are prioritized without losing normal columns.
- No result status is written into layer attributes.

### Map behavior

- Row hover highlights the correctly layer-qualified point/line and clears on leave.
- Row click highlights/fits the correct object after sorting and filtering.
- Zoom action resolves point and line coordinates from the correct source object.
- Table filtering does not hide, dim, select, or highlight map features automatically.
- Non-scoped map features remain normally visible.
- Later two-way coverage: map click selects/scrolls a visible in-scope row and never broadens scope for an out-of-scope click.

### Navigation and accessibility

- Opening from a diagnostic suspends the modal, leaves Validator/sidebar state mounted, and focuses the table context.
- Closing/back restores selected layer, geometry, expanded field, sidebar search/filter/sort, modal field, and Resultat/Regel tab.
- Focus returns to the originating button.
- All object actions and status filters work by keyboard and have count/context accessible names.
- Status is understandable without color.
- Escape/close behavior does not leave both modal and table focus traps active.

### Scale and privacy

- Exercise representative 10, 165, 470, 5,000, and tens-of-thousands scopes; assert row model correctness and profile rather than set arbitrary timing thresholds initially.
- Verify virtual row count stays bounded.
- Verify inspection state is absent from persisted storage serialization.
- Verify object IDs are absent from URLs, telemetry calls, console output, public diagnostic text, exported files, and gallery/privacy projections.

## 24. Risks and mitigations

| Risk | Evidence/impact | Mitigation |
| --- | --- | --- |
| Table is tightly coupled to the full active geometry | `rawItems` always reads complete points/lines arrays | Insert a normalized scope resolver before current filtering/sorting; keep whole-layer as an explicit scope kind |
| Source index is unstable across reload/reparse | Table/map have no revision guard | Require dataset revision for exact sets and fail closed on mismatch |
| Object ID string construction is scattered | Table and map independently build prefixes | Add one neutral identity-to-map-ID helper and use it in both paths |
| Presentation groups discard exact refs | Diagnostics keep sample labels; value groups keep counts | Retain runtime exact refs during the aggregation that already has them |
| Multi-owner status can diverge | Two current aggregation functions differ on dependency review | Extract one shared pure field-status selector with focused tests |
| Table filters mutate application/map state | Current reset clears layer filters | Add separate session-local filters; never call layer reset for inspection reset |
| Scoped objects may be hidden by existing map filters | Map hides before applying highlight | Keep visibility explicit; indicate hidden state and offer an explicit filter action after product decision |
| Validator modal blocks docked table | Fixed modal overlay and focus trap | Suspend modal while preserving component/context/tab; restore on return |
| Circular state dependency between table and Validator | Validator local state owns result/modal; store owns table | Keep generic runtime lifecycle callback/close event; keep Validator result out of global table state |
| Runtime refs leak through persistence | Entire `ui` is persisted | Store inspection outside persisted `ui` or whitelist safe fields; add serialization test |
| Stale callback restores an old context | A new scope can replace an old one | Use opaque session IDs and invoke lifecycle only for the active session |
| Multiple geometry tab silently broadens scope | Current table always offers both tabs | Lock/hide geometry switching in exact-set mode |
| Multiple layers share local indices | Base IDs are ambiguous | Always use layer-qualified normalized identity in scoped mode |
| Map highlighting is costly on large data | highlight state participates in GeoJSON key | Avoid whole-scope highlight; profile hover and later decouple style updates from GeoJSON remount |
| Column discovery depends on first 100 rows | Sparse preferred fields may disappear | Force preferred/context columns when bound; later use schema key inventory |
| Copied row arrays add memory churn | Every raw item is shallow-copied for `__index` | Resolve lightweight row wrappers or direct indices; keep source objects in layer state |
| Table has incomplete keyboard semantics | Clickable row/header `div`s and glyph-only close | Include accessibility corrections in the generic surface before exposing new actions |
| Opening table closes profile analysis | Existing store action enforces mutual exclusion | Preserve current overlay policy and ensure close lifecycle has a defined reason |

## 25. Explicit non-goals

- No second or Validator-specific table.
- No validation rule, policy, severity, wording, or count changes except consolidating duplicate presentation-status derivation.
- No mutation of GMI layer attributes with validation status.
- No query-language reconstruction of exact affected sets.
- No multi-layer or mixed-geometry inspection in the first implementation.
- No persistence, URL encoding, telemetry, export, or public diagnostics containing customer object refs.
- No automatic map hiding/dimming based on scope or table filters.
- No automatic selection/highlighting of an entire status or scope.
- No table multi-select, `Zoom to visible`, column chooser, or cross-layer merged schema in the MVP.
- No rewrite of the map, parser, Validator engine, or existing layer-panel table entry point.

## 26. Open questions requiring user/product decision

The architecture has safe defaults, but these points should be confirmed before the related polish is implemented:

1. **Existing map filters while inspecting a scope.** Recommended default: scoped table rows ignore map/layer visibility filters, while the map keeps them unchanged and reports when a selected object is hidden. Alternative: treat existing layer filters as visible table filters, clearly report `X of scope`, and let reset explicitly clear them; this also changes map visibility.
2. **Return destination from Resultat.** Recommended default: table close/back restores the same field modal and Resultat/Regel tab. Alternative: return only to the expanded Validator sidebar field.
3. **Field population semantics for non-applicable objects.** Recommended default: include only refs with contextual Feil/Sjekk/Pass so status counts equal scope count. If all geometry objects must appear, add an explicit `Ikke vurdert` status rather than labeling them Pass.
4. **Relationship breakdown actions.** Recommended default: card action opens all incompatible refs and each visible Type/Tema pair gets its own exact action when multiple pairs exist.
5. **Whole-layer escape.** Recommended default: defer `Vis hele laget` from MVP. If included, make it an explicit scope replacement, never part of reset.
6. **Row click zoom.** Recommended MVP default: preserve current automatic fit on row click. A later usability pass can separate selection from zoom if users find map movement disruptive.

None of these questions blocks the diagnostic-card MVP if the recommended defaults are accepted.
