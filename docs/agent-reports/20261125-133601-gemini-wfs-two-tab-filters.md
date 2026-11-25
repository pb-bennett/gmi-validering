# Batch 2A-WFS-B: separate Ledninger and Punkter filters

**Status: implemented and verified on synthetic data only. The two-tab refinement is not accepted until tested against real Gemini WFS data.**
Branch `feature/photo-workspace`, HEAD `45fb742` at start and end. Follows `20261125-130500-gemini-wfs-filtering-implementation.md`.

## Files changed

| File | Change |
| --- | --- |
| `src/lib/gemini-wfs/geminiFilters.mjs` | Selections, counts, totals and status notice per side |
| `src/lib/gemini-wfs/geminiFilterPreferences.mjs` | Schema 2 and schema 1 migration |
| `src/lib/gemini-wfs/geminiReferencePresentation.mjs` | Commands take a side; session-only `filterTab` |
| `src/components/gemini-wfs/GeminiFilterGroups.js` | Two tabs; "Kun ledninger" labels removed (the tab states it) |
| `src/components/gemini-wfs/GeminiReferenceCard.js` | Passes the view; status notice can name one side |
| `tests/geminiFilters.test.mjs`, `tests/geminiFilterBrowser.test.mjs` | Adapted to per-side commands; new coverage |
| `tests/geminiReferencePresentation.test.mjs` | Snapshot key contract extended by `filterTab` |

Not changed: session, client, parser, proxy, attribute mapping, recognised status titles, `GeminiReferenceLayer.js`, `GeminiInspectionSide.js` (map rendering, hover, popup), and all non-Gemini code.

## Behaviour and state ownership

- Ledninger: Status, Anleggstype, Eierskap, Materiale, Dimensjon. Punkter: Status, Eierskap. Each tab shows its visible/loaded total and value counts for its own side only.
- `geminiPresentation` remains the only owner. Filters are `groups.lines.{status,type,owner,material,dimension}` and `groups.points.{status,owner}`; nothing is shared between sides.
- Selected tab and open groups are session-only UI state. Open groups belong to their tab. Switching tabs leaves the filters object and the computed view identical, so the map is not touched.
- A tab shows a funnel icon, and "filter er aktivt" in its accessible name, when its filters hide at least one loaded object. This includes the Drift default. A saved choice for values not in the current extent shows no icon until it hides something.
- The card summary (combined totals and hidden count) is unchanged, also when collapsed. Side toggles are unchanged and do not affect filter totals. "Nullstill filtre" resets both sides.
- Status recognition stays per service and sticky: recognising `Drift`, `Nedlagt` or `Fjernet` on either side applies the strict Drift default to both. This is the existing behaviour; the alternative (recognition per side) was not chosen because it would show non-operational points by default in an extent with no recognised point status.
- Added: if only one side has no Drift under its default rule, the notice names it ("Ingen innlastede punkter har status Drift."). If it applies to every loaded side, the existing text is used.
- Tabs use roving focus: Left/Right (wrapping), Home and End select and focus; Tab continues into the panel.

## Persistence and migration

- Storage key unchanged (`gmi-gemini-wfs-filters-v1`); the `schema` field is the version, now 2. Shape: `{ schema: 2, feeds: [{ url, groups: { lines: {...}, points: {...} }, statusRecognised }] }`. URL identity, bounds, exclusions and the Eierskap storage rule are unchanged and apply per side.
- Schema 1 is migrated on read: Status and Eierskap are copied to both sides; Anleggstype, Materiale and Dimensjon go to Ledninger; `statusRecognised` is kept. Reading never writes.
- The first save (a user edit, or automatic recognition) rewrites all services as schema 2 in one write. If that write fails, the schema 1 content stays and the choices apply in memory, with the existing notice.
- Using the same key avoids two copies, so a later reset cannot bring old choices back.
- Unknown schemas and malformed content: defaults, replaced only by a user edit (as before).
- **Rollback:** a build at `45fb742`, or a tab still running it, cannot read schema 2. It uses defaults and overwrites all saved choices if the user edits a filter there.

## Verification: level Expanded

| Check | Result |
| --- | --- |
| Non-browser `gemini*`, `layerHighlight*`, `featureHover*` (`node --test`) | 174 passed, 0 failed, 0 skipped (17 are filter tests, 3 new) |
| `geminiFilterBrowser`, `geminiReferenceBrowser`, `geminiPopupBrowser`, `geminiWorkflowBrowser` (`node --test --test-concurrency=1`) | 69 passed, 0 failed, 0 skipped (3 new subtests) |
| One-off comparison with the `45fb742` code: 3000 random schema 1 preferences, migrated, saved and re-read | Identical hidden objects and totals in all 3000 (script not tracked) |
| `npx --no-install eslint` on `src/lib/gemini-wfs`, `src/components/gemini-wfs` and the three test files | Passed |
| `npm run build` | Passed |
| `git diff --check` | Passed |
| Synthetic 2000/2000, 2000 objects changed | 114-131 ms per toggle of both sides (two runs) |

Covered: independent Status/Eierskap, per-tab counts and combined totals, tab switching without map, state or request change, reset, filter combinations, popup staying open or closing by side, migration, reload, reconnect, service switching, absent values, storage failure, keyboard and focus.

Existing assertions changed deliberately: commands, rows and counts are per side; the foreign-schema case now uses schema 3 because 2 is valid; "Kun ledninger" is replaced by exact group lists per tab.

Screenshots of both tabs at 1280x720 and 1366x768 were inspected (320px sidebar): no clipping or horizontal overflow; the sidebar scrolls. Regenerate with `GEMINI_FILTER_SCREENSHOT_DIR`. The harness page lacks the app's Roboto setup.

Deliberately omitted: full Node and browser suites, `geminiServiceBrowser`, `geminiGmlBrowser` and WFS proxy suites (no transport, parser or session change). No live request was made.

## Remaining risks

1. Real point Status and Eierskap values per side have not been confirmed; the first real test reported them combined. Points with codes or missing status are hidden by default once the service is recognised.
2. The rollback limitation above.
3. Tabs wrap when the sidebar is narrow; widths below 320px were not tested. Contrast was reviewed visually, not measured.
4. "Nullstill filtre" becomes disabled after use, as before; focus after that was not changed.

## Manual acceptance on the real service

1. Before the new build, choose some Status and Eierskap values. Load the new build and connect: the map must show the same objects, with the same choices in both tabs.
2. Use "Nullstill filtre". Confirm Drift is the only checked Status in both tabs, and that tab totals add up to the summary and to the loaded totals (238/190 in the same area).
3. Show only Drift ledninger, and Drift and Nedlagt punkter. Confirm the map and that Ledninger's choices are unchanged.
4. Change Eierskap in one tab (Kommunal, Privat (bygningseier), Mangler verdi); the other must not change.
5. Switch tabs with mouse and arrow keys; nothing changes on the map. Confirm the funnel icon for the tab not shown.
6. Check both side toggles, hover, popup and selection with filters active.
7. Refresh, fetch a second area, reload, disconnect and reconnect; both tabs keep their choices.

## Git

Nothing staged, committed, pushed or deployed. The five pre-existing modified test files and both untracked reports were left untouched. New untracked file: this report.
