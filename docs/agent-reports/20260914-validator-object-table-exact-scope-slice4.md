# Validator V2 exact object-table scope — Slice 4

## Scope delivered

`LayerDataTable` remains the sole data-table component. Its existing whole-layer path still reads the selected geometry collection, applies layer visibility filters, retains saved sort/column order and the Punkter/Ledninger tabs. Exact inspection adds a scope layer ahead of that row pipeline.

The generic store entry point is `openObjectTable(request)`. It accepts an `exact-object-set` scope with `layerId`, `datasetRevision`, `geometryScope`, and ObjectRefs, plus small display context (`title`, `reason`, status, source). `openLayerDataTable(layerId)` stays the whole-layer compatibility opener.

## Runtime and privacy boundary

The active `objectTableInspection` is top-level runtime state and is deliberately absent from Zustand persistence. It keeps only the opaque session id, owner tuple, normalized deduplicated source indices, and concise display context; ObjectRefs, callbacks, maps, and source objects are not serialized. Persisted table state retains preferences but forces `isOpen: false` and `layerId: null`, so a reload cannot broaden a prior exact inspection into a whole-layer table. The session is cleared by table close, ordinary whole-layer open, layer removal, and stale resolution. No scope data is placed in URLs, telemetry, logging, or reports.

## Identity, validation, and rows

Before opening, every ref is checked atomically against one current layer, revision, and geometry with the established ObjectRef ownership guard. Invalid, forged, mixed, and out-of-range refs reject the entire request. Duplicate refs deduplicate by ObjectRef key. An empty ref array is a valid, explicit zero-row inspection.

The table resolves scoped rows directly from `layer.data.points` or `layer.data.lines` by those trusted source indices. A revision mismatch, unavailable layer/collection, or missing indexed object returns no rows and closes the table. TanStack row IDs include layer, geometry, and source index, so sorting retains the original map target identity. Exact mode does not use the normal layer/map visibility filters.

## Presentation and Validator path

Exact mode fixes the one geometry, hides Punkter/Ledninger tabs, suppresses geometry auto-switching, and shows an `Objektutvalg` context in the existing table header.

The diagnostic aggregation now retains complete exact refs as runtime action data. The shared `ValidationV2FieldDetailContent` renders `Vis N objekter` only for a complete set; it receives an owner callback. `ValidationV2Workspace` supplies that callback and opens the generic table request. The visible diagnostic wording is unchanged. The inspector, selected Validator field, left field list, map, and validation model remain independent of the bottom inspection session. Selecting another field does not replace the table; only another explicit action does.

## Files changed

- `src/lib/objectTableInspection.js`
- `src/lib/store.js`
- `src/components/LayerDataTable.js`
- `src/lib/validation-v2/diagnostics.js`
- `src/components/validation-v2/ValidationV2Workspace.js`
- `src/components/validation-v2/ValidationV2FieldDetailContent.js`
- `src/components/validation-v2/ValidationV2FieldInspector.js`
- `src/components/validation-v2/ValidationV2FieldInfoModal.js`
- `tests/objectTableInspection.test.mjs`
- `tests/validationV2Diagnostics.test.mjs`

## Verification

- Focused generic scope tests: pass (4 tests): valid/deduplicated/empty scopes, forged/mixed/out-of-range rejection, stale revision fail-closed behavior, and persistence exclusion.
- Validator diagnostics, workspace, and compatibility tests: pass.
- Full `node --loader ./tests/esmJsLoader.mjs --test tests/validationV2*.test.mjs`: pass (250 tests).
- `npm run build`: pass.
- `git diff --check`: pass.
- Browser/manual verification: attempted against the existing local server, but the in-app browser connection was rejected because required sandbox metadata was unavailable; no manual dataset interaction was performed.

## Remaining table presentation work

The next slices can add the Validator-specific table presentation requested separately: Tema/field and Resultat columns, status filters and cell color, search, map overlay/highlighting, map/table selection, marker/zoom-to-scope actions, and value/pair/field-level scopes. None are included here.

Validation rule semantics, statuses, counts, and visible diagnostic wording are unchanged; this slice only retains existing exact findings for a runtime table action.
