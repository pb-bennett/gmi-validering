# S5A Validator list, filter, sort, and count styling

Date: 2026-09-23. Starting SHA: `7bdd89607f090f7aa5b0434dc022a14030eb5717` on `feature/styling-overhaul-integrated`. Repository root: `C:/GitHub/gmi-validering-test`.

## Starting state and ownership

The working tree was intentionally dirty before S5A. The following pre-existing S4 icon-convergence amendment files were left untouched by S5A:

- `docs/agent-reports/20260923-styling-overhaul-s4-layer-manager.md`
- `src/components/LayerManager.js`
- `src/components/LayerPanel.js`
- `src/components/Sidebar.js`

The following pre-existing untracked planning and review files were also left untouched:

- `docs/agent-reports/20260923-icon-consistency-inventory.md`
- `docs/agent-reports/20260923-s5a-reconnaissance.md`
- `docs/icon-review.html`

The starting status contained exactly those seven expected entries and no unexpected modifications.

S5A changed only:

- `src/components/validation-v2/ValidationV2Workspace.js`
- `src/components/validation-v2/ValidationV2RuleList.js`
- `src/components/validation-v2/ValidationV2ErrorBoundary.js`
- `src/components/FieldValidationSidebar.js`, limited to the current Validator footer branch
- `docs/agent-reports/20260923-styling-overhaul-s5a-validator-list.md`, this report

## Surfaces migrated

- Validator workspace and compact header surface, title hierarchy, close-control appearance, layer label, and native layer selector.
- No-layer, unsupported-format, and loading presentation.
- Geometry tabs and their selected, hover, and keyboard-focus states while retaining existing labels, counts, roles, and dimensions.
- Object/status summary text; the existing amber schema-coexistence warning framing was retained unchanged.
- Filter, sort, and reset toolbar buttons; active-filter marker; elevated filter and sort panels; search field; two-column status filter controls; selected sort and filter states.
- Rule-list container, dividers, rows, expanded-row surface, aggregate status presentation, compact Feil/Sjekk/Pass metrics, row hover/focus/expanded states, and the existing Vis action appearance.
- Unknown-field disclosure, validation run-error panel, Validator error-boundary fallback, and Validator-only Kontakt footer.

No explicit empty/no-match message was added. An empty filtered result retains the existing empty list-container presentation.

## Design decisions

The list workspace now uses canonical Surface and Soft surfaces, Border and Strong Border boundaries, Navy for primary hierarchy, Text/Muted/Subtle for supporting hierarchy, Interactive cyan for actions and keyboard focus, and restrained neutral selected states. This aligns the dense Validator with the accepted shell and LayerManager without importing AppInfo reading density.

The implementation deliberately reuses the S2 recipes `gmi-elevated-surface`, `gmi-compact-button`, `gmi-focus-ring`, `gmi-compact-field`, and `gmi-selected-control`. It also uses S1 semantic utilities for GMI Surface, Soft, Border, Strong Border, Navy, Text, Muted, Subtle, and Interactive roles. No new token, recipe, dependency, or colour was introduced.

Semantic validation colours remain separate from brand and interaction colour. Feil remains red, Sjekk remains amber, Pass remains green, the schema warning remains amber, and run/error-boundary states remain red. Interactive cyan is limited to action, active-indicator, and focus roles. Neutral selection does not replace or duplicate validation outcome colour.

## Compact density and protected geometry

Existing compact dimensions were retained: 8px workspace and header/control padding, 32px icon controls, 11–12px labels, 10–11px metric counts, 40px minimum rule rows, the two-column status-filter grid, and the no-wrap expanded metrics/Vis row. Long rule labels retain `min-w-0` and truncation. The longest filter and sort labels retain their existing grid/menu allocation; no sidebar or application width changed.

The root `min-h-0`, `flex-1`, and `overflow-hidden` contract, list `overflow-y-auto` ownership, footer `mt-auto` reachability, menu positioning and `z-20`, and fixed compact control footprints remain. ProductHeader height, the 380px default sidebar, normal sidebar resize ownership/bounds, 38rem inspector, 44rem fallback detail, map allowance, toolbar thresholds, portals, and stacking architecture were not changed.

## Behaviour preserved

No state, reducer, data composition, handler, callback, lifecycle, native control type, label, ARIA relationship, wording, rule, count, filter, sort, reset, expansion, or focus-restoration logic changed. Feil → Sjekk → Pass vocabulary/order, Sjekk aggregation, searched-universe filter counts, attention/status and Norwegian sort modes, registry ties, one-row expansion, and reset behavior are unchanged. Validator mount/unmount and rerun/cleanup ownership, object-table callbacks, Testmodus, telemetry, map behavior, Stats suppression, AppInfo ownership, and Kontakt access are unchanged.

No icon node, icon import, icon family, Phosphor weight, inline SVG, or text glyph was changed. Icon convergence remains deferred to the separate user review.

## Explicit S5B exclusions

The following files were not edited:

- `src/components/validation-v2/ValidationV2FieldDetailContent.js`
- `src/components/validation-v2/ValidationV2FieldInspector.js`
- `src/components/validation-v2/ValidationV2FieldInfoModal.js`
- `src/components/validation-v2/fieldDetailLayout.js`
- `src/components/FieldDetailModal.js`
- `src/lib/validation-v2/resultPresentation.js`

Within `ValidationV2Workspace.js`, selected detail state, `selectedValidatorField`, opener/focus restoration, `inspectorHost`, portal rendering, detail props/callbacks, docking decision, docked inspector, and fallback modal branches were not modified.

## Verification

- `git diff --check`: passed. Git emitted existing LF-to-CRLF working-copy warnings only.
- Initial direct targeted run, `node --test ...`: 43 assertions passed, while `tests/objectTableInspection.test.mjs` failed before assertions because Node 24 could not resolve an extensionless internal import. No source or test was changed in response.
- Intended-loader targeted run, `node --loader ./tests/esmJsLoader.mjs --test tests/validationV2GmiA81ResultsWorkflow.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/validationV2RulePresentation.test.mjs tests/validationV2GmiA81FieldInfo.test.mjs tests/objectTableInspection.test.mjs tests/mapPaneToolbar.test.mjs tests/statsUiContract.test.mjs`: passed, 55/55. Node emitted the existing experimental-loader warning.
- `npm.cmd run build`: passed. Next.js production compilation, type checking, page-data collection, and static generation completed. Browserslist reported stale local data; dependencies were not updated.
- No tests were modified.

## Browser review and deferred checks

Browser review was not performed because this repository/session exposes no browser or Playwright harness. Visual acceptance is still required for the 380px workspace, all search/filter/sort modes, longest labels, reset states, menu clipping and stacking, keyboard focus and expansion, long scrolling, footer reachability, special states, and horizontal overflow. The existing S5B docked and fallback Vis paths also still require a visual unchanged-state check, as do Stats suppression and Om/Kontakt access. Source contracts and the build passed, but they do not establish rendered visual acceptance.

No S5B, S6+, icon convergence, dependency, commit, push, deploy, branch-switch, reset, stash, clean, or production-main work was performed.

## Final status

Pre-existing S4/icon-review state, not owned by S5A:

```text
 M docs/agent-reports/20260923-styling-overhaul-s4-layer-manager.md
 M src/components/LayerManager.js
 M src/components/LayerPanel.js
 M src/components/Sidebar.js
?? docs/agent-reports/20260923-icon-consistency-inventory.md
?? docs/agent-reports/20260923-s5a-reconnaissance.md
?? docs/icon-review.html
```

New S5A state:

```text
 M src/components/FieldValidationSidebar.js
 M src/components/validation-v2/ValidationV2ErrorBoundary.js
 M src/components/validation-v2/ValidationV2RuleList.js
 M src/components/validation-v2/ValidationV2Workspace.js
?? docs/agent-reports/20260923-styling-overhaul-s5a-validator-list.md
```
