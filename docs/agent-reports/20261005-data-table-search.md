# Data Table search

## Scope

Verified before edits: branch `feature/data-table-search`, HEAD `b98fb16` (Add SOSI status support). Single agent. No branch changes, commits, pushes, or operations on `REF_FILES/` or pre-existing modified `data/usage/aggregates.json`.

## Existing Data Table architecture

Pre-implementation audit: `src/components/LayerDataTable.js` owns the entire table including the horizontal toolbar immediately above column headers, Punkter/Ledninger controls, filter status, close action, cells, sorting, and row actions. `src/app/page.js` supplies it as the bottom dock to `WorkspaceShell`; closing the dock unmounts it. Zustand `ui.layerDataTable` selects the layer and per-layer tab/sort/column order. Rows come from `layer.data.points` or `.lines`; ordinary rows receive their original source `__index` before filtering. Layer hidden codes, types, and field values are applied inside the table, rather than an upstream globally filtered row array. Exact/contextual inspection resolves explicit original object indices through `resolveExactObjectInspectionRows` and intentionally bypasses sidebar visibility filters. Preserve this existing inspection contract.

Columns derive from logical `attributes`: keys are discovered from the first 100 scoped rows, with remaining rows checked for populated known fields. Contextual inspection uses its complete inspection scope for columns. `objectTablePresentation.js` constructs accessor functions reading `row.attributes[id]`. `DataCell` displays `String(value)` (with missing placeholders), hence objects display `[object Object]`. TanStack supplies sorting and stable IDs composed of layer, tab, and source index. TanStack Virtual virtualizes rows (28px, overscan 10); columns scroll horizontally. Click/hover highlight original feature IDs; zoom passes original coordinates and indices to `viewObjectInMap`. Existing toolbar counts represent the pre-search scoped and sidebar-filtered dataset.

## Row/search scope

Ordinary pipeline: selected layer → active point/line collection → original source indices → existing sidebar/layer filters → local attribute search → existing TanStack sort → virtual rows. Exact/contextual inspections retain their existing explicit row-set semantics; search narrows whichever resolved inspection view is active. Search receives `items`, never the unfiltered collection. No geometry or table metadata is searched. Search filters existing row references without copying them, preserving attributes, coordinates and original `__index` for map actions.

## Search semantics

`normalizeTableSearchQuery` trims and lowercases a single query. Search lowercases scalar text and uses literal `includes`; there is no regex, fuzzy matching, tokenization, or key-name search. Whitespace-only queries return the existing scoped array unchanged. Unknown attribute keys and fields beyond both the viewport and the column-discovery sample are searchable. Values are never modified.

## Nested-value traversal

`src/lib/tableSearch.js` supplies pure normalization, traversal, row filtering, scalar detection and highlight segmentation. Traversal uses an explicit stack (avoiding deep recursion stack overflow) and a WeakSet for cycles/shared references. It traverses arrays and plain/null-prototype objects using own enumerable data descriptors; getters, prototype values, symbols, non-enumerable source metadata, functions, class instances and non-finite numbers are skipped. Strings, finite numbers and booleans use their scalar string representation. Valid Dates support both displayed Date text and ISO dates; invalid Dates are ignored. Object/array display strings are never used as the search source.

## Photo-reference workflow

Audit: tracked GMI fixtures (`tests/fixtures/gmi-v32/valid/batch2-oracle.gmi`, `point-clean-modern.gmi`, `point-applicability-tema.gmi`) declare `S_HYPERLINK`. The batch2 fixture contains a synthetic scalar URL. `gmiParser._parseFieldValues` splits semicolon field values and produces strings/numbers/booleans/null; its source lexeme metadata is non-enumerable. Validation's `attachmentLink` maps to `S_HYPERLINK`. No verified nested photo filename schema was found in tracked parser/fixture coverage. Nested regression data will be explicitly synthetic, rather than claiming `Bilder.Filnavn` is the actual delivery schema. No reference material was accessed.

Regression coverage uses scalar `S_HYPERLINK: 'photos/IMG_4827.JPG'` and explicitly synthetic `Bilder: [{ Filnavn: 'IMG_4827.JPG' }]`. Full, partial, numeric-fragment and case-insensitive filenames match; unrelated filenames do not. Objects still displayed as `[object Object]` can contain matching nested leaves. SOSI canonical mapping also preserves original source groups in attributes (`sosiCanonicalAttributes.js` spreads source properties), so those nested logical fields are covered by the generic traversal.

## UI placement

Replaced the existing flexible empty toolbar space above column headers with a compact right-aligned search group. Phosphor regular `MagnifyingGlassIcon` and `XIcon` match existing actions. Input is 28px high, flexible with a 16rem maximum, surface/border tokens and existing focus ring. Toolbar can wrap when constrained; no extra fixed toolbar row, sidebar control or map control was added.

## Result count and clear behavior

Non-empty normalized queries display `N treff`, including `0 treff`, `1 treff` and `3 treff` (Norwegian uses the same noun here). Existing dataset/filter counts retain their original meaning. The clear action appears whenever raw input is non-empty, including spaces, sets local query to empty and returns focus to the input. Clearing restores the current filtered/inspection scope without changing tabs or filters. Search and scope changes reset vertical scroll to the top so a reduced virtual row set can be seen; horizontal scroll remains available.

## Match highlighting

Visible actual scalar text is segmented safely into React text fragments and `<mark>` elements with existing cyan-soft styling. Every non-overlapping literal case-insensitive occurrence is highlighted; numeric cells are included. No HTML injection or source conversion is used. Unicode folded offsets map back to original characters (including case folds that expand), and context-sensitive lowercasing is retained. Missing placeholders and objects/arrays are not highlighted, preventing fabricated photo text or misleading `[object Object]` matches. Date ISO matches may select a row without highlighting when ISO text is not the cell's displayed Date format.

## Interaction with existing filters

Sidebar hidden-code/type/field filters continue to apply first in ordinary mode. Search cannot resurrect excluded rows. Regression covers `[A,B,C]` filtered scope and a query matching `[B,D]` producing only `[B]`, with clearing restoring the identical scoped array. Exact inspection intentionally continues its existing bypass of visibility filters. No store implementation changed; query handling calls only local state. Map geometry, global/layer visibility, sidebar filters and persistence are untouched. Existing click/hover highlight and zoom actions continue using source indices; they remain explicit means of locating results.

## Point/line behavior

One component-local query applies to the current scope and continues when switching Punkter/Ledninger, layers or inspection views while mounted. Each evaluation uses only that scope's `items`. Closing the bottom dock unmounts the component and resets the query. No per-tab query storage, URL state, browser persistence or server state is added. Existing point/line counts and filter-driven auto-switch logic remain independent of search; zero search hits do not trigger a tab switch.

## Performance

The existing table is vertically virtualized; no fixed maximum dataset size is imposed by its row model. Search uses a memoized per-query/current-scope scan with early exit when a leaf matches. It does not scan other layers/tabs, depend on rendered columns, or build an index/worker. Column discovery and sizing stay based on pre-search rows, avoiding column disappearance and sorting invalidation on keystrokes. Highlight traversal applies only to rendered scalar cells, not full nested rows. Large production-dataset latency was not benchmarked.

## Accessibility

Input accessible name `Søk i data`, placeholder `Søk i data…`, normal text-input keyboard behavior and existing `gmi-focus-ring`. Clear button has `Tøm søk`, restores input focus, and uses a decorative aria-hidden icon. Result count is visible text with `role="status"`. Escape shortcut was not added.

## Tests

- Added `tests/tableSearch.test.mjs`: 10 focused helper/UI-contract/TanStack tests cover normalization, literal substring and special characters, scalar types/Dates, nested combinations and unknown fields, ignored values and metadata, cycle safety, mutation protection, actual scalar/synthetic nested photo references, filter composition/clear/reference identity, point/line scope, off-screen fields, stable IDs and sorting, and highlight segmentation including Unicode.
- Updated existing `objectTableInspection.test.mjs` cell-signature source contract to include the local highlighting prop; other inspection expectations remain intact.
- Focused command: `node --loader ./tests/esmJsLoader.mjs --test tests/tableSearch.test.mjs tests/objectTableInspection.test.mjs tests/dataInspectorStacking.test.mjs tests/dataInspectorConstrainedHeight.test.mjs tests/statusBrowsing.test.mjs tests/sosiCanonicalAttributes.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/validationV2RealDataPolish.test.mjs tests/validationV2SyntheticGmiFixtures.test.mjs`: **67/67 passed**.
- Broader command: all `tests/**/*.test.mjs` files discovered by `rg --files tests -g '*.test.mjs'`, using the existing ESM loader: **566/567 passed**. Only `AppInfo reclaims desktop height only in constrained viewports` failed (known unrelated source contract). No AppInfo code changed.
- Initial focused execution without the repository loader failed on the existing extensionless `datasetRevision` import; rerunning with `tests/esmJsLoader.mjs` resolves this. Initial signature assertion failure was updated for the intentionally added DataCell prop.
- Detailed test output is kept in temporary logs rather than terminal source/test dumps.
- ESLint on both changed source files: **0 errors**, one `react-hooks/incompatible-library` warning at the existing TanStack `useReactTable` API. No suppression was added.
- Final table/search rerun after the responsive minimum-width adjustment: **25/25 passed** (`tableSearch.test.mjs` and `objectTableInspection.test.mjs`).
- Production build (`npm.cmd run build`): **blocked by external Google Fonts fetch**: `next/font` failed to fetch Roboto. Font configuration was not altered. `npm.cmd` was used because this PowerShell environment blocks the npm.ps1 shim.

## Manual acceptance

Browser checks were **not executed**: no browser tool or Playwright installation is available in this session. UI checks above are source contracts, not browser interaction tests. Remaining manual checklist:

1. Open Data Table; verify compact toolbar placement and narrow viewport wrapping.
2. Type a visible field fragment; verify immediate rows, highlight and count.
3. Clear; verify existing filtered scope and focus return.
4. Search an off-screen attribute and a nested photo filename.
5. Inspect/zoom/click a result; verify original object location and identity.
6. Combine sidebar filters and search; verify excluded objects stay excluded.
7. Switch Punkter/Ledninger; verify only current geometry scope and existing counts.
8. Confirm typing alone leaves map geometry visible; check exact/contextual inspection views too.

## Files changed

- `src/components/LayerDataTable.js`: local state, memoized search subset, toolbar UI and safe scalar highlight rendering.
- `src/lib/tableSearch.js`: pure search/traversal/highlight helpers.
- `tests/tableSearch.test.mjs`: focused regression coverage.
- `tests/objectTableInspection.test.mjs`: updated cell signature contract.
- `docs/agent-reports/20261005-data-table-search.md`: audit and implementation/verification record.

## Remaining issues

Known unrelated AppInfo test failure remains. Browser acceptance and production-scale performance are unverified. Existing nested field rendering and first-100-row column discovery were deliberately preserved; search still covers attributes omitted by that discovery.

## Final repository state

Branch remains `feature/data-table-search`, HEAD `b98fb16`; no commit or push. Pre-existing runtime modification `data/usage/aggregates.json` was not opened or modified. `git diff --check` passed. Build has the external font-fetch limitation described above.

Observed final short status:

```text
 M data/usage/aggregates.json
 M src/components/LayerDataTable.js
 M tests/objectTableInspection.test.mjs
?? docs/agent-reports/20261005-data-table-search.md
?? src/lib/tableSearch.js
?? tests/tableSearch.test.mjs
```
