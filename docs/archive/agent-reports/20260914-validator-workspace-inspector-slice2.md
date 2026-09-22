# Validator workspace inspector — Slice 2

Date: 2026-09-14
Branch: `feature/validator-v2-v32-ui-polish`
Scope: replace desktop field-detail modal presentation with a right non-modal inspector; retain the shared Slice 1 content and constrained-width dialog fallback.

## Previous page layout

`page.js` conditionally mounted either `Sidebar` or `FieldValidationSidebar`. The normal sidebar and map shared one horizontal row, while Validator had a separate fixed 430 px wrapper. The normal map/table region used a vertical flex layout with a 55/45 split when the table opened. Field detail was rendered as a fixed blocking modal from inside `ValidationV2Workspace`.

## Sidebar width mechanism and equal-width behavior

The normal `Sidebar` held its width in local React state, initialized to 320 px, and updated it from pointer movement between 200 and 800 px. The width was not persisted. Because page.js unmounted that component when Validator opened, its current resized width was lost; the Validator wrapper then forced 430 px.

The same width state now lives in `page.js` and is passed to the normal sidebar, Validator sidebar wrapper, and right inspector. The existing resize limits and pointer behavior are retained. Opening Validator preserves the current effective width. There is no independent inspector-width setting. With a docked inspector open, the left and right surfaces use the same pixel width.

Docking is allowed only when the remaining centre workspace is at least `sidebarWidth + 480px`: one equal-width inspector plus a 480 px map minimum. Otherwise the selected field uses the existing modal fallback. This condition follows the effective resized sidebar width rather than the planning report’s 430/460 px proposal.

## Workspace shell and bottom dock

`WorkspaceShell` defines a full-height left slot, an upper centre/right slot, and an optional bottom slot. The 2D map or 3D view shares the upper row with the right inspector. The existing `LayerDataTable` is rendered below them at 38% height while the upper row uses 62%; it spans the centre and right workspace. Closing either the inspector or the table affects only its own state.

The profile-analysis surface remains map-owned and keeps its existing overlay behavior. It was not moved into a generic bottom dock in this slice. The current store actions continue to enforce table/profile mutual exclusion.

## Validator state and inspector

`ValidationV2Workspace` remains the single local owner for validation controller/result, selected field, and active Resultat/Regel tab. Field detail is rendered through a React portal into the page’s inspector slot, so no rich selected-field object was added to global Zustand state. The left list stays mounted while the portal opens, closes, or switches fields.

The selected-field context includes the current layer, geometry, and dataset revision. It is hidden immediately when that identity no longer matches and cleared on the corresponding workspace change. Changing fields does not reset the active tab; layer, geometry, revision, and explicit validation reruns return it to Resultat. Closing the inspector clears only the selected field and restores focus to its opener; list expansion, search, filter, sorting, and table state are left alone.

`ValidationV2FieldInspector` is a named complementary region with an accessible close button and the shared controlled `ValidationV2FieldDetailContent`. It has no backdrop, dialog semantics, `aria-modal`, or focus trap. The existing `ValidationV2FieldInfoModal` remains the controlled dialog fallback and retains its proper modal behavior.

## Map, 3D, floating controls, and accessibility

The map remains mounted while inspector state changes. Its existing `ResizeObserver`/Leaflet `invalidateSize()` path handles width and height changes. The 3D view stays parent-sized through its existing full-size canvas and follows the same flexible upper pane. Source-contract checks cover both mechanisms; no browser visual check was possible, so actual grey-area/recentering behavior remains for manual verification.

The current floating Stats, Share, and Reset controls remain viewport-fixed. While the docked inspector is open, their right offsets move left by the inspector width to keep them outside the inspector. The broader toolbar/control migration remains for Slice 3. Inspector title changes are politely announced, tab keyboard behavior is retained from the shared content, and pointer opening does not move focus. Closing returns focus to the originating `Vis` button.

## Files changed for this slice

- `src/app/page.js` — lifts the existing sidebar width, computes the responsive docking condition, and composes the workspace shell.
- `src/components/WorkspaceShell.js` — provides left, upper workspace, and bottom-dock regions.
- `src/components/Sidebar.js` — accepts the page-owned width and reports existing resize updates.
- `src/components/FieldValidationSidebar.js` — passes the width/docking callback into Validator.
- `src/components/validation-v2/ValidationV2Workspace.js` — owns selected field/tab and portals the docked inspector or mounts the fallback dialog.
- `src/components/validation-v2/ValidationV2FieldInspector.js` — accessible non-modal right inspector using shared content.
- `src/components/validation-v2/ValidationV2FieldInfoModal.js` — accepts controlled tab state for fallback use.
- `tests/validationV2WorkspaceInspector.test.mjs` — width, layout, ownership, fallback, bottom dock, and map/3D contracts.
- `tests/validationV2FieldDetailExtraction.test.mjs`, `tests/validationV2GmiA7.test.mjs` — updated Slice 1 contracts for workspace-owned tab state.
- This report.

The worktree also contained unrelated pre-existing changes and untracked research/report files. They were preserved.

## Verification

- Focused inspector, extraction, workspace, and Validator workflow tests: **36 passed, 0 failed**.
- Full Validator suite, `node --loader ./tests/esmJsLoader.mjs --test tests/validationV2*.test.mjs`: **250 passed, 0 failed**.
- Adjacent Stats, Testmodus, profile-analysis, and inspector layout/source-contract tests: **22 passed, 0 failed**.
- `npm run build`: **passed**. Next.js emitted the existing stale Browserslist database notice.
- `git diff --check`: **passed**.
- Browser/manual verification: **not completed**. The in-app browser runtime could not initialize and returned `codex/sandbox-state-meta: missing field sandboxPolicy`. Please visually verify the desktop and constrained-width flows, table coexistence, map resizing, and 3D sizing in the app.

No validation rules, statuses, counts, diagnostic wording, field grouping, or authoritative tables were changed.

## Known follow-ups for Slice 3

- Move the still viewport-fixed TabSwitcher/Testmodus/developer controls into a map-owned toolbar. Stats/Share/Reset currently use a small temporary offset while the inspector is open.
- Decide whether to normalize profile analysis into the generic bottom-dock region; current map-owned overlay and store mutual exclusion remain intact.
- Browser-check Leaflet grey-area prevention/recentering and 3D canvas resizing at the actual docking threshold and with the bottom table open.
- The dock threshold currently protects a 480 px map and exactly reuses the normal sidebar width; revisit only with product/layout evidence, and do not introduce an independent inspector width preference without a new product decision.

No exact object scopes, table actions/facets, map inspection overlay, sticky-column changes, toolbar redesign, or validation behavior were implemented.
