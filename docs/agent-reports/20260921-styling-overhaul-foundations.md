# Styling-overhaul foundations pass

Date: 2026-09-21. Scope: shared UI foundations only. No validation rules, result derivation, data flow, or interaction ownership was changed.

## Files changed

- `src/app/globals.css` — replaced the five legacy theme palettes with canonical semantic tokens, retained compatibility aliases for existing variable-driven UI, and added small shared shell/surface/control/focus/selected recipes.
- `src/app/page.js` — applied the shared shell, heading, muted-copy, and surface recipes to the app frame and initial upload card.
- `src/components/WorkspaceShell.js` — applied the shared page background to the post-upload workspace frame.
- `src/components/MapPaneToolbar.js` — adopted shared control/surface/focus recipes without changing refs, handlers, labels, or overflow behaviour.
- `src/components/TabSwitcher.js` — adopted shared overlay, selected-state, hover, and focus recipes without changing tab state or view-switching behaviour.

The pre-existing untracked audit `docs/agent-reports/20260915-styling-overhaul-audit.md` was preserved.

## Tokens introduced

`--gmi-ink`, `--gmi-navy`, `--gmi-text`, `--gmi-text-muted`, `--gmi-text-subtle`, `--gmi-text-on-dark`, `--gmi-border-strong`, `--gmi-border`, `--gmi-surface-soft`, `--gmi-surface`, `--gmi-brand-cyan`, `--gmi-cyan-soft`, and `--gmi-interactive` exactly represent the supplied canonical palette.

Existing `--color-*` variables now alias the canonical tokens, preserving current consumers while moving their shared colours away from the old blue/gray/green/purple/orange theme definitions. Bright cyan is retained as a brand token; interactive foregrounds and focus outlines use `--gmi-interactive` (`#007595`).

## Styles replaced

- Removed duplicated legacy multi-theme literals from global CSS.
- Replaced application and workspace `bg-gray-50` foundations with the canonical soft surface.
- Replaced onboarding hard-coded white/gray heading and supporting-text styles with canonical surface, ink, and muted text roles.
- Replaced the map toolbar's slate literal control treatment and cyan focus ring with shared recipes.
- Replaced the map/3D switcher's gray selected, hover, surface, and focus treatments with shared recipes.

## Deferred areas

All complex feature modules remain deliberately untouched, including Validator workspace/list/detail presentation, table virtualization, Leaflet popup/legend/measurement chrome, layer panels, dialogs, statistics, 3D HTML chrome, and domain/GIS symbology. Semantic success, warning, and error presentation is unchanged. No icon migration was performed.

## Verification

- `git diff --check` — passed.
- `node --loader ./tests/esmJsLoader.mjs --test tests/mapPaneToolbar.test.mjs tests/validationV2WorkspaceInspector.test.mjs` — passed, 16/16 tests.
- Targeted ESLint attempt (`npm exec eslint -- ...`) — could not run: the repository-local `eslint` package is unavailable, so the flat config cannot resolve it. The command attempted to use ESLint 10 externally and was not a valid project lint execution.
- `npm run build` — could not run: local `next` executable is unavailable (`'next' is not recognized`). No dependencies were installed or changed.

## Risks and follow-up

- Dependency installation is needed before a meaningful lint/build checkpoint; rerun the targeted lint and one full build after restoring the repository's local dependencies.
- The new shared recipes should be verified in a browser across toolbar overflow, focus-visible states, and the start screen. `color-mix()` is used only to retain a translucent overlay surface and should be checked in the supported browser matrix.
- Continue module-by-module rather than replacing gray/blue utilities globally. Validator presentation and GIS/chart/data colours need their own scoped passes to avoid changing semantics.
