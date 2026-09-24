# S12 — Final convergence

## Starting state

- Date: 2026-09-24.
- Repository: `C:/GitHub/gmi-validering-test`.
- Branch: `feature/styling-overhaul-integrated`.
- Starting SHA: `17d0e0dd515c88607e316b86f311e57d6203b176` (`Refresh Stats styling and basemap access`).
- Recovery began with an intentionally dirty working tree containing 18 S12 modified files and no untracked files. No existing changes were discarded.

## Interrupted Astra audit context

Astra had reviewed the styling roadmap, S1–S11 reports, icon inventory, relevant source, and styling commits before editing. Its initial audit classified 25 grouped candidates: 14 clear residuals, six intentional exceptions, one subjective item left unchanged, and four deferred items. A later diff review identified one additional ordinary map-legend disclosure icon. Thus 15 UI residual groups are addressed in the final diff. A stale test assertion found during verification was corrected separately; it is not counted as a UI residual. Astra was interrupted before final verification and this report. This continuation reviewed the existing diff and made no further source or test edits.

The accepted system remains the GMI semantic palette and shared `BrandWordmark`. The docked Validator inspector is **28rem**, with its current docking threshold. Stats trigger suppression remains exactly `!(layerDataTableOpen || dockedInspectorOpen || analysisOpen)`; fallback detail does not suppress the trigger or close an open Stats modal. Stats retains authenticated CARTO Positron raster tiles and visible OpenStreetMap/CARTO attribution.

## Files changed

Source:

- `src/app/globals.css`
- `src/app/page.js`
- `src/components/3D/Controls3D.js`
- `src/components/DevDiagnosticsPanel.js`
- `src/components/InclineAnalysisModal.js`
- `src/components/LayerPanel.js`
- `src/components/MapLegend.js`
- `src/components/MapPaneToolbar.js`
- `src/components/MapView.js`
- `src/components/Sidebar.js`
- `src/components/TestModeControl.js`
- `src/components/WmsLayerModal.js`
- `src/components/validation-v2/ValidationV2FieldInfoModal.js`
- `src/components/validation-v2/ValidationV2FieldInspector.js`
- `src/components/validation-v2/ValidationV2RuleList.js`
- `src/components/validation-v2/ValidationV2Workspace.js`

Tests: `tests/validationV2GmiA7.test.mjs`, `tests/validationV2RulePresentation.test.mjs`.

Documentation: this report.

## Residual fixes

| Area | Residual | Final treatment | Behavior impact |
| --- | --- | --- | --- |
| Global body and page map chrome | Page background/text, loading, zoom, WMS opener, inspect action, and add-layer close retained theme/gray/blue values or custom action icons. | GMI semantic roles and compact/focus recipes; regular GearSix/Plus/X icons; explicit names for icon-only WMS and close actions. | None; handlers, positions, and modal ownership remain. |
| Map prompts | Outlier and height prompts used legacy variable-primary and gray action treatments. | Existing GMI primary/compact controls and focus recipe, with amber warning content retained. | None; prompt decisions and actions remain. |
| Normal sidebar and layer detail | Five analysis actions and neutral summaries still used theme blue/gray; layer Topplok section and field borders had gray/theme remnants. | Shared GMI primary/focus treatment and neutral text/surface/border roles; small Topplok controls gain keyboard-visible focus. | None; analysis, tabs, targets, filtering, and scroll ownership remain. |
| Validator controls and detail frames | Custom filter/sort/reset/disclosure/close drawings and bold Phosphor variants. | Accepted regular Phosphor action mappings at existing nominal sizes. | None; labels, state, docking, and modal focus handling remain. |
| Map toolbar, legend, Testmodus, WMS | Bold action glyphs or custom disclosure arrows. | Regular Phosphor overflow, gear, legend caret, and WMS caret; WMS advanced control exposes `aria-expanded`. | None; dimensions, rotation states, and callbacks remain. |
| 3D HTML chrome | Custom control caret and emoji navigation pictograms. | Regular Phosphor caret, mouse, and crosshair icons beside the existing instruction text. | None; scene, camera, grid, legend state, and header behavior remain. |
| Profile plot | Neutral SVG labels used old gray values. | GMI Text/Subtle SVG fills; red hover/status meaning remains. | None; chart paths, scales, hover, and calculations remain. |
| Developer diagnostics | A commented, disabled legacy toggle and SVG remained in source. | Removed the proven commented block; active panel stays intact. | None. |

## Intentional exceptions retained

GIS/FCODE colours, layer highlights, legend marks, 3D materials and object/domain markers, profile and Stats data series, map timeline event colours, and red/amber/green outcome colours retain their information meaning. The approved SVG logo, QR imagery, and AppInfo chart illustration were not redrawn or flattened into cyan. Contact's local rose error and cyan success treatments remain as accepted. The inactive announced badge and dormant historical theme/component code were left alone; uncertain code was not deleted.

## Icons

Ordinary action and disclosure icons touched by S12 use `@phosphor-icons/react` with regular weight. WMS advanced disclosure and the page's icon-only WMS/add-layer controls have explicit state or accessible names. Map, chart, QR, product, and 3D domain graphics remain feature-specific. The two changed tests check the accepted regular Validator disclosure and the already established S5B GMI source-table classes, while retaining behavioral and overflow assertions. The source-table styling assertion also failed at the starting HEAD because it still expected the superseded slate classes.

## Colours / controls

Legacy theme blue was removed from the changed active body, sidebar analysis actions, map prompts, and page map controls. Neutral gray chrome in the touched surfaces now uses the established GMI text/surface/border roles. Focus uses the existing Interactive role and compact controls reuse the shared recipes. No status, domain, map-symbol, or categorical chart palette was converted wholesale to cyan. Existing compact versus full control geometry is preserved.

## Responsive / accessibility

The diff adds keyboard-visible focus to the touched compact Topplok controls, a state announcement to the WMS advanced disclosure, and accessible labels to the page-owned icon-only WMS and add-layer close buttons. No responsive breakpoint, width, table row height, inspector width, portal, scroll owner, or modal focus mechanism changed. Source and build checks do not establish rendered accessibility or constrained-width acceptance.

## Tests

Focused S12 regression command:

```text
node --loader ./tests/esmJsLoader.mjs --test tests/appInfoUiContract.test.mjs tests/mapPaneToolbar.test.mjs tests/testMode.test.mjs tests/featurePopupContent.test.mjs tests/profileAnalysisActiveDataCrash.test.mjs tests/wmsProxyPolicy.test.mjs tests/validationV2GmiA7.test.mjs tests/validationV2RulePresentation.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/validationV2FieldDetailExtraction.test.mjs tests/objectTableInspection.test.mjs tests/statsUiContract.test.mjs tests/statsCartoBasemap.test.mjs
```

Result: **109/109 passed**. This covers page/AppInfo ownership, sidebar/workspace, map toolbar/legend/3D placement, diagnostics/Testmodus, profile coexistence, WMS proxy policy, Validator list/detail and both updated tests, object-table contracts, Stats suppression, and CARTO access. No direct rendered 3D-controls test exists. Astra's earlier full-suite run had 453/455 passing before the two presentation assertions were updated; this continuation did not repeat that suite after the focused set passed.

## Build

`npm.cmd run build` passed on its first attempt after the final source edits, including production compilation, TypeScript, and static generation. No Roboto fetch retry was needed. Next.js printed the existing stale Browserslist-data advisory; dependencies were unchanged.

## User manual visual acceptance

The earlier in-app browser attempt failed before navigation with `codex/sandbox-state-meta: missing field sandboxPolicy`. The user subsequently completed manual visual review and accepted the rendered S12 surfaces. No S12 visual regression was found.

The review covered the upload/onboarding screen, Testmodus controls, loaded workspace, sidebar and LayerPanel, map chrome and legend, WMS opener/dialog, Validator list, docked detail and fallback detail modal, Validator with LayerDataTable, profile analysis, 3D view, 3D controls/navigation guidance, and narrow/constrained fallback behavior.

Ordinary action and disclosure icons appear coherent with the accepted Phosphor policy. GMI chrome and tokens appear consistent across the reviewed surfaces, while GIS/domain/data/status colours remain appropriately distinct. Large desktop at approximately HD resolution is the intended minimum supported layout. Narrow screenshots showed acceptable graceful degradation; no additional responsive or mobile redesign is required for S12.

S12 is visually accepted and ready to commit.

## Deferred

- Separate 3D refinement: possible duplicate legend path, deeper control-header semantics, and camera/navigation UX.
- CARTO raster-to-vector migration.
- Subjective normalization of accepted compact density, elevation, radii, and type hierarchy.
- Dormant legacy components/theme declarations and responsive cases that need a reproduced defect before changing geometry or removing uncertain code.

## Final state

`git diff --check` passed; Git emitted only local LF-to-CRLF working-copy notices. The reviewed diff preserved the protected 28rem inspector, docking threshold, table virtualization, Stats predicate, CARTO map, and all feature/data behavior. No commit or push was made. S12 is visually accepted and ready to commit.

Final `git status --short`:

```text
 M src/app/globals.css
 M src/app/page.js
 M src/components/3D/Controls3D.js
 M src/components/DevDiagnosticsPanel.js
 M src/components/InclineAnalysisModal.js
 M src/components/LayerPanel.js
 M src/components/MapLegend.js
 M src/components/MapPaneToolbar.js
 M src/components/MapView.js
 M src/components/Sidebar.js
 M src/components/TestModeControl.js
 M src/components/WmsLayerModal.js
 M src/components/validation-v2/ValidationV2FieldInfoModal.js
 M src/components/validation-v2/ValidationV2FieldInspector.js
 M src/components/validation-v2/ValidationV2RuleList.js
 M src/components/validation-v2/ValidationV2Workspace.js
 M tests/validationV2GmiA7.test.mjs
 M tests/validationV2RulePresentation.test.mjs
?? docs/agent-reports/20260924-styling-overhaul-s12-final-convergence.md
```
