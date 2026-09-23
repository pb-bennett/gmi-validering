# Styling-overhaul S2 shared recipes

Date: 2026-09-23. Scope: small classes-first proof on the existing map toolbar and WMS dialog only.

## Starting state

- Starting SHA: `fa51ce47931fda784130ad1024795ee46f5e0faf`
- Repository root: `C:/GitHub/gmi-validering-test`
- Branch: `feature/styling-overhaul-integrated`, tracking `origin/feature/styling-overhaul-integrated`
- Working tree: clean before changes

## Proof surfaces selected

- `src/components/MapPaneToolbar.js` — its local `ToolbarButton` already owns a forwarded-ref contract and is reused for normal and overflow controls. It is the smallest existing toolbar group that can prove an authored compact-control recipe without changing its DOM or ownership.
- `src/components/WmsLayerModal.js` — it has repeated native input boundaries, a compact neutral action, a primary submit action, an advanced text action, and a selected available-layer row. These prove the remaining recipe responsibilities in one contained surface.

The current source matches the roadmap's classes-first toolbar/WMS proof. The 20260915 audit's later prioritised-file index placed WMS under S10, whereas its S2 description names WMS submit/action controls as a consumer of shared classes. The current roadmap and authorised S2 scope explicitly select the bounded WMS proof, so this implementation follows them without undertaking the broader S10 dialog work.

## Files changed

- `src/app/globals.css` — added six compact semantic appearance recipes.
- `src/components/MapPaneToolbar.js` — migrated the existing local toolbar button and overflow surface to the recipes.
- `src/components/WmsLayerModal.js` — migrated neutral/native-control/primary/selection appearances to the recipes.
- `docs/agent-reports/20260923-styling-overhaul-s2-shared-recipes.md` — this implementation record.

## Recipes and token use

| Recipe | Responsibility | Canonical tokens |
| --- | --- | --- |
| `.gmi-elevated-surface` | Restrained bordered, elevated control or panel surface | Border, Surface |
| `.gmi-compact-button` | Compact neutral control radius, foreground and soft hover | Text, Soft surface |
| `.gmi-focus-ring` | Light-surface keyboard focus | Interactive, Surface |
| `.gmi-compact-field` | Native compact input boundary and focus | Strong border, Surface, Text, Interactive |
| `.gmi-selected-control` | Neutral selected available-layer row | Border, Navy, Strong border |
| `.gmi-primary-control` | Compact dark primary submit control | Navy, Surface |

`gmi-primary-control` uses an opacity-only hover/disabled treatment. It does not introduce an unapproved dark hover shade.

## Existing consumers migrated

- Map toolbar share, reset, and overflow controls now use the elevated-surface, compact-button, and focus-ring recipes. The overflow group uses the elevated-surface recipe.
- WMS dialog frame, fetch-layers button, and cancel button use the appropriate neutral recipes. The close and advanced controls receive the semantic focus treatment.
- WMS URL, username, password, and advanced-layers inputs use the compact-field recipe.
- WMS available-layer selection uses the neutral selected-control recipe; its unselected hover uses Soft surface.
- WMS heading/icon, labels, supporting help text, and advanced action use Navy, Interactive, Text, Subtle, and Border roles as appropriate. Its submit button uses the Navy/Surface primary recipe.

## Preserved geometry and behaviour

No DOM structure, refs, state, event handlers, overflow ownership, portal/stacking ownership, native input/select behaviour, aria labels, tooltips, keyboard handling, or responsive toolbar thresholds changed. The map toolbar retains `min-h-9`, its padding/gaps, measured map-pane modes, overflow placement, and focus-restoration logic. The WMS form retains its field types, names, autocomplete values, layout padding/gaps, submit/remove/fetch behavior, backdrop click handling, and maximum dialog width. Control padding, minimum heights, and bounding footprints were not changed. The migrated compact controls use the approved 8px radius in place of their previous 6px `rounded-md` styling; this does not affect layout or hit targets.

AppInfo, Contact, logo, product-header work, Validator, Stats, tables, map data/GIS styling, chart colours, and semantic warning/error/destructive WMS colours remain unmigrated. No S1 token value changed.

## Verification

- `git diff --check` — passed.
- `npm.cmd run build` — passed; production compilation and static-page generation completed.
- `node --test tests/mapPaneToolbar.test.mjs` — passed, 9/9.
- `node --test tests/wmsProxyPolicy.test.mjs` — passed, 24/24. This is the only existing WMS-targeted test; it confirms the WMS proxy/security contract remains intact.
- `node --test tests/statsUiContract.test.mjs` — passed, 1/1.
- `node --test tests/validationV2WorkspaceInspector.test.mjs` — passed, 7/7.

Browser checks still required: inspect toolbar normal/constrained/narrow modes around the existing 860px and 580px measured map-pane thresholds, including overflow Escape/outside-click/focus restoration. Inspect the WMS dialog's initial, advanced, fetching, selected-list, validation-error, removal, and disabled-submit states with keyboard focus at normal and constrained viewport sizes. No browser run was performed.

## Final status

No commit, push, deploy, branch switch, Vercel change, dependency upgrade, AppInfo change, logo change, or S3A work was made. Final `git status --short`:

```text
 M src/app/globals.css
 M src/components/MapPaneToolbar.js
 M src/components/WmsLayerModal.js
?? docs/agent-reports/20260923-styling-overhaul-s2-shared-recipes.md
```
