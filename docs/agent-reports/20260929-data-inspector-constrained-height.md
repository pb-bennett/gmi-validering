# Data inspector constrained-height refinement

## Problem

At a roughly 1920×1080 desktop viewport, the all-data inspector spent much of its available height on expanded JSON in every table row. Focused objects placed geometry and terrain cards ahead of attributes, then displayed the complete JSON in a separate tall scroll pane. This made canonical SOSI fields harder to reach and introduced competing vertical scroll regions.

## Root cause

The modal uses an `h-[82%]` flex frame with a scrolling body. Its point and line list rows render full `JSON.stringify` output inline, so source groups such as `EGS_LEDNING` can dominate the table. Focused line/point attributes sit after diagnostic cards and use `max-h-72 overflow-auto`, creating a second scroll area inside the main modal scroller. The frame had no constrained-height desktop treatment.

## Layout ownership

`src/components/DataDisplayModal.js` owns the overlay, frame, header/title/close button, tabs, body, object cards, `Vis` disclosures, raw JSON, and nested coordinate/terrain tables. `src/app/globals.css` now owns only the viewport-height-specific presentation overrides. `src/app/page.js` mounts the inspector; store actions retain open/close and selection state. No parser, map, or Validator owner was changed.

## Changes

For desktop widths of at least 1024px and viewport heights of at most 1000px, the frame is bounded to `100dvh - 3rem` with a matching overlay margin. Header, tabs, body, cards, and section gaps use slightly less vertical space; text sizes are unchanged. The body has `min-h-0` and remains the main scroller with a stable scrollbar gutter.

In a focused object, CSS order presents identity, then an attribute card, then geometry/terrain diagnostics. The attribute card begins with a compact grid of present canonical scalar fields, including `S_FCODE`, `Material`, `Dimensjon`, `InnvendigUtvendig`, `Rørform`, `Nett_type`, and `Anleggsår`. The complete original attribute JSON remains accessible from the card. The grid is display-only and does not alter data.

In all-data point and line tables, short-desktop rows show a native `Vis rådata` disclosure in place of expanded JSON. Opening it reveals the complete per-row JSON in the main modal scroll flow. Existing object selection and coordinate/terrain `Vis` controls remain.

## Scroll ownership

The modal body is the primary vertical scroller. Expanded JSON in all-data rows uses that same scroller, avoiding a raw-data scrollbar on every row. Focused object raw JSON is collapsed by default on short desktops and receives a nested scrollbar only when opened and long, capped at 10rem. Coordinate and terrain tables retain bounded inner scrolling when explicitly expanded, capped at 9.5rem on short desktops. The title and close control stay outside the body scroller.

## Tall-desktop preservation

The existing `h-[82%]` frame, card order, section spacing, and expanded per-row JSON remain in effect outside the short-desktop media query. Canonical highlight grids and compact disclosures are hidden there. The base `min-h-0` addition only allows correct flex shrinking; it does not change the accepted visual layout.

## Tests

- New inspector layout contract tests, profile layout tests, and SOSI adapter tests: 17 passed, 0 failed.
- Existing object/table inspection tests with the repository ESM loader: 15 passed, 0 failed.
- An attempted broader run included `appInfoUiContract.test.mjs`; it failed in its existing expectation that `.statistics-button--cue` follows the AppInfo compact CSS. That selector is absent even in `HEAD:src/app/globals.css`, so this is unrelated to the inspector change. The inspector-related suites above pass independently.
- `git diff --check` passed, with Git line-ending notices for tracked files.
- `npm.cmd run build` was attempted and stopped at `next/font` because Roboto could not be fetched from Google Fonts. The font architecture was not changed.

## Corrective compactness pass

Manual testing of the first pass on a 1080p laptop found that the focused attribute card still contained a permanently visible raw JSON pane. That pane, together with a 15rem coordinate/terrain table cap and generous gaps, made the canonical grid appear surrounded by whitespace and left too few diagnostic headers visible. The grid itself had no fixed height; the adjacent raw pane and surrounding spacing caused the waste.

At the existing `max-height: 1000px` desktop breakpoint, the canonical grid now uses four columns, content-sized rows, top alignment, smaller row gaps, and no minimum or fixed height. Focused cards use 0.5rem vertical padding, 0.375rem section gaps, and shorter header-to-content margins. The identity card remains content-sized and retains line incline/length and point coordinate information. Font sizes are unchanged.

Focused line and point raw JSON now use a native **Vis rådata** disclosure, closed by default. Opening it exposes the same complete `JSON.stringify` output, including `EGS_LEDNING`, `EGS_PUNKT`, `kvalitet`, and unknown source properties, in a pane capped at 10rem. The all-data row disclosure remains unchanged. On tall desktops, the original always-visible focused JSON and expanded all-data JSON remain available as before.

Expanded coordinate and terrain tables now cap at 9.5rem on short desktops, with 0.25rem cell padding so roughly four to six rows are visible before their inner scrollbar is needed. The modal body remains the primary scroller; only deliberately opened large raw/coordinate/terrain content scrolls inside it. No object selection, callbacks, disclosure state, Escape handling, parser, map, or Validator behavior changed.

Corrective verification: the updated inspector and SOSI suites passed 13/13; the object-table suite passed 15/15 with the repository ESM loader. `git diff --check` passed. The requested build again stopped because `next/font` could not fetch Roboto from Google Fonts; no font changes were made. Manual visual acceptance on the real Tørkopp export remains to be checked in the browser.

## Modal stacking correction

The sidebar carries `z-[10000]`, while the inspector overlay previously used `z-2000`; that direct layer ordering allowed the sidebar to paint over the overlay. `DataDisplayModal` is mounted as a sibling of `WorkspaceShell` under the page's app root. The root has `overflow-hidden` but no positioned z-index, transform, opacity, filter, or isolation that traps the inspector in a lower stacking context. A portal was therefore unnecessary. The overlay is now `fixed inset-0` at `z-[10060]`, above the sidebar, Stats (`10003`), GlobalFileDrop (`10005`), AppInfo (`10050`), map legend, controls, and toolbar. The sidebar and other components were not changed.

Stacking regression coverage checks the viewport-fixed app-level overlay and its layer against the sidebar and existing modal/chrome layers. It also checks that close, selection, and content contracts remain present. The stacking, constrained-height, object/table, SOSI, and Validator workspace inspector tests passed. `git diff --check` passed. The production build remains blocked at the existing Google Fonts Roboto fetch described above.

## Manual acceptance target

At approximately 1920×1080, upload the ignored real Tørkopp SOSI export without modifying it, then open **Inspiser data** on a line with `EGS_LEDNING`. Check that identity, canonical attributes, and several diagnostic headers are visible without excessive scrolling. The canonical card should occupy only its content height. Open **Vis rådata** and confirm the complete `EGS_LEDNING`, `kvalitet`, and other source properties remain accessible in a compact pane. Expand coordinates and confirm a handful of rows and an inner scrollbar, with subsequent sections still easy to reach. Confirm the frame fits inside the viewport, its title and close remain visible, and there are no giant blank or trapped regions. Repeat on a tall desktop viewport to confirm its previous presentation. This manual browser check was not performed in this implementation run.

## Files changed

- `src/components/DataDisplayModal.js` — presentation hooks, compact highlights, and row raw-data disclosures.
- `src/app/globals.css` — constrained-height desktop overrides.
- `tests/dataInspectorConstrainedHeight.test.mjs` — focused layout and behavior-preservation contracts.
- `docs/agent-reports/20260929-data-inspector-constrained-height.md` — this report.

## Final repository state

Branch: `feature/sosi-canonical-mapping`. The pre-existing modification to `data/usage/aggregates.json` and uncommitted SOSI Phase 1 and overflow-line-symbology files were left untouched. No files were staged or committed; no reset, restore, stash, clean, branch switch, or push was performed. `REF_FILES/` was not altered.
