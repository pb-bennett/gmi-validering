# S9 3D chrome

Date: 2026-09-24. Starting SHA: `c9a469e` (`Refresh profile and standards styling`). Repository root: `C:/GitHub/gmi-validering-test`. Branch: `feature/styling-overhaul-integrated`. Starting working tree: clean.

## Active owners and files changed

`src/app/page.js` dynamically mounts `Viewer3D`. `Viewer3D` owns the parent-sized Canvas, `Scene3D` mount, the scene-side Inspect data action, and overlays. `Controls3D` owns the camera reset and grid actions, legend toggle, and navigation instructions. `Legend3D` owns the visible pipe/point key; it is mounted by `Viewer3D` and conditionally by `Controls3D`. `Tooltip3D` owns the selected-object information and map, data inspection, and profile actions. `TabSwitcher` owns map/3D mode actions and already has accepted GMI styling. `Scene3D` owns camera, scene, materials, and picking. The latter two owners were inspected and not edited.

Changed files:

- `src/components/3D/Controls3D.js`
- `src/components/3D/Legend3D.js`
- `src/components/3D/Tooltip3D.js`
- `src/components/3D/Viewer3D.js`
- This report

## Presentation

The 3D controls and navigation instructions now use GMI Surface, Border, Navy, Text, Muted, and Soft roles with compact control, selected-state, elevated-surface, and focus recipes. Camera reset, grid toggle, legend toggle, labels, instructions, handlers, positions, and dimensions remain. The existing mouse/navigation pictograms communicate operations and were not replaced.

The legend frame, headings, divider, and label text now use the neutral GMI hierarchy. Pipe and point swatches retain their exact source colors, shapes, sizes, ordering, and labels. Its `bottom-4 left-4` anchor, `max-h-80` native vertical scrolling, and show/hide behavior remain.

The selected-object tooltip frame, header, metadata rows, close button, and action buttons now use GMI chrome. The reviewed close mapping is a regular `XIcon` from `@phosphor-icons/react`, with the same 14px glyph footprint and existing `Lukk` title. Existing object/domain pictograms and all object labels, attributes, values, indices, and identifiers remain. Tooltip positioning and clamp calculation, `max-h-[70vh]`, attribute scroll owner, action callbacks, and close behavior are unchanged. The floating 3D Inspect data button in `Viewer3D` now uses GMI color variables and compact focus styling; its placement and handlers remain.

No material, pipe, point, warning, selected-object geometry, or legend-symbol domain color was changed. `Scene3D`, `PipeNetwork`, `PointObjects`, and Canvas code were not edited. Canvas ownership, parent sizing, camera position and orbit behavior, scene composition, lights, geometry, picking, refs, and resize lifecycle are unchanged. Object selection and map/data/profile actions retain their existing state handoffs. `page.js` and `TabSwitcher` were not edited, preserving map/3D switching, mount lifecycle, profile coexistence, toolbar thresholds, and accepted Stats suppression. S6/S7/S8 and S10+ surfaces were excluded.

## Verification and limits

- `git diff --check`: passed; Git emitted local LF-to-CRLF working-copy notices.
- `node --loader ./tests/esmJsLoader.mjs --test tests/mapPaneToolbar.test.mjs tests/profileAnalysisActiveDataCrash.test.mjs tests/testMode.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/statsUiContract.test.mjs`: 30/30 passed. Existing Node loader/module warnings appeared. Repository search found no direct existing `Tooltip3D` object-action or camera-event test; the relevant mode, Canvas ownership, map toolbar, workspace, and active-profile regressions were included.
- `npm.cmd run build`: passed, including production compilation, type checking, and static generation. The existing Browserslist age warning appeared; dependencies were not changed.

Browser review: pending. The in-app browser runtime failed before opening a tab with `js: codex/sandbox-state-meta: missing field sandboxPolicy`. A local dev start also found an existing dev-server lock. Scene rendering, object selection, tooltip clamping, camera/grid actions, legend visibility, narrow viewport, mode round trip, and Validator/profile coexistence have no rendered acceptance claim.

Deferred concerns: `Viewer3D` already mounts a legend while `Controls3D` can mount another on toggle; that existing visibility/overlap behavior was left intact. The controls disclosure header remains a clickable `div` with its existing keyboard behavior. Both require separate behavior review if changes are desired. No scene, selection, or architecture work was undertaken.

No commit, push, deploy, dependency update, branch switch, reset, stash, clean, or S10+ work was performed.

Final `git status --short`:

```text
 M src/components/3D/Controls3D.js
 M src/components/3D/Legend3D.js
 M src/components/3D/Tooltip3D.js
 M src/components/3D/Viewer3D.js
?? docs/agent-reports/20260924-styling-overhaul-s9-3d-chrome.md
```
