# Validator Inspector and Map Toolbar Polish

Date: 2026-09-14
Branch: `feature/validator-v2-v32-ui-polish`

## Resultat / Regel content width

The docked inspector remains 44rem wide. Previously, Resultat applied its own horizontal padding while Regel used the full available width, and authoritative Regel tables could expand beyond the prose column. Both tabs now render inside one centered `max-w-2xl` content wrapper with shared horizontal padding. The Resultat panel's former duplicate padding moved to that shared wrapper, keeping its content width nearly unchanged. Regel headings, guidance, cards, and tables now align to the same readable column.

Authoritative value tables and the Type/Tema compatibility table use horizontal-only overflow when required. No height-constrained nested table scroller was added; the Type unified authoritative table remains in place. The modal and inspector still share the same 44rem width token.

## Map-owned toolbar and controls

Added `MapPaneToolbar` inside the map-pane wrapper in `page.js`. It owns the map/3D mode controls, Del/share, reset, and Testmodus/developer controls. The previous viewport-fixed Share and reset buttons and globally fixed TabSwitcher were removed. Reset still calls the existing `handleReset` action unchanged.

Toolbar layout is selected from the measured map-pane width with `ResizeObserver`, not browser viewport width:

- Normal: full map/3D labels, active Testmodus/developer controls, Del, and full reset label.
- Constrained: map/3D controls stay visible; Testmodus/developer controls move into overflow first; Del becomes compact; the reset label remains visible.
- Narrow: compact Kart/3D labels and More remain directly visible; Del, reset, and active Testmodus/developer controls are in overflow. Reset retains the full “Nullstill og last opp ny” label.

The toolbar never wraps. Its overflow controls are conditionally rendered in one location at a time, are keyboard reachable, close on Escape or outside pointer activation, and return focus to More on Escape. If a pane resize removes the More trigger while its menu is open, focus moves to the still-visible reset control. Compact mode controls retain full accessible names. Testmodus query activation remains mounted at page level so it is not delayed until a dataset has loaded.

## Statistikk and map-corner collisions

`getActiveBottomSurface` identifies the current table, profile analysis, or a future supplied bottom surface; `canShowMapBottomActionSlot` hides the Statistikk trigger whenever that slot is occupied. The StatsModal remains independently controlled by `showStats`, so hiding its trigger does not close an already-open dialog. When the map regains the bottom slot, the trigger returns.

Statistikk is now positioned inside the map pane. The map's existing Leaflet top-right layer control retains its 58px toolbar-row offset; the map legend remains positioned inside MapView. The 3D controls panel was moved below the toolbar row, and its lower-right navigation note moved up to avoid the map-owned Statistikk trigger. Existing map-local WMS and zoom controls were not changed.

## Files changed for this polish

- `src/app/page.js`
- `src/app/globals.css`
- `src/components/MapPaneToolbar.js` (new)
- `src/components/TabSwitcher.js`
- `src/components/TestModeControl.js`
- `src/components/3D/Controls3D.js`
- `src/components/FieldValidationSidebar.js`
- `src/components/validation-v2/ValidationV2Workspace.js`
- `src/components/validation-v2/ValidationV2FieldDetailContent.js`
- `src/lib/workspace/mapPanePresentation.mjs` (new)
- `tests/mapPaneToolbar.test.mjs` (new)
- `tests/statsUiContract.test.mjs`
- `tests/testMode.test.mjs`
- `tests/validationV2GmiA7.test.mjs`
- `tests/validationV2RulePresentation.test.mjs`

## Verification

- Focused toolbar, detail-content, Testmodus, statistics, and workspace tests: 38/38 passed.
- Full Validator V2 suite: 250/250 passed.
- Adjacent statistics UI, Testmodus, statistics cue, and profile analysis checks: 16/16 passed.
- Additional affected Resultat and Regel presentation checks: 23/23 passed.
- `npm run build`: passed. Build reported the repository's existing stale Browserslist data notice.
- `git diff --check`: passed; Git emitted line-ending normalization notices only.
- Browser/manual verification: not completed. Port 3000 was already occupied, and starting another dev instance failed because `.next/dev/lock` was held by the existing instance. The in-app browser connection also failed before opening a page. The existing process was left untouched. Toolbar fit at each pane width, visual Resultat/Regel parity, and actual control/legend spacing still need visual review.

## Remaining scope and semantics

No object-table integration, object scopes, table filters/columns, map overlay, or selection behavior was added. Before object-table integration, any new bottom surface should feed the generic active-bottom-surface derivation so the Statistikk trigger remains hidden while that surface owns the bottom-right workspace. Validation rules, status/count semantics, diagnostic wording, authoritative table values, and Resultat/Regel meanings are unchanged.
