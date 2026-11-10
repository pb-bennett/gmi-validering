# Final Validator rule-header count refinement

2026-11-10 19:13:49 Europe/Oslo. Branch `feature/photo-workspace`; starting commit `4e9ecf9`. No commit or push.

## Files changed

- `src/components/validation-v2/ValidationV2RuleList.js`: three-column grid with no separators; compact area becomes invisible when expanded.
- `tests/validationV2RuleCountsBrowser.test.mjs`: separator-free assertions, expansion visibility and geometry checks at every viewport/preference combination, keyboard collapse, correction callback and retained update/Vis coverage.
- `tests/browser/validationRuleCountsApp.js`: enables the existing correction control for the primary synthetic fixture and records its callback.
- `docs/agent-reports/assets/20261110-rule-counts-final/`: eight screenshots covering collapsed/expanded states, both requested sizes and both system appearance preferences.
- This report.

## Layout and accessibility

The compact area now has exactly three numeric grid columns in FEIL / SJEKK / OK order, separated by equal `1.5ch` gaps. Separator elements and middle dots have been removed. The existing shared maximum digit-width calculation is unchanged: slots reserve at least `3ch` and grow together for larger counts. Values remain right aligned with tabular numerals; zero slots contain no visible text. Existing severity colours, including golden-yellow SJEKK, remain unchanged.

When expanded, Tailwind's `invisible` utility applies `visibility: hidden` to the compact area. Its grid remains in layout, preserving the count area, rule-name width, header height and chevron position. The neutral empty-result fallback spans three columns and follows the same visibility behavior. Long names continue to truncate.

The expansion button's complete accessible label and the compact area's tooltip text are unchanged. They retain totals and all named categories, including zeroes and supplied unevaluated counts. Compact markup remains aria-hidden to avoid duplicate announcements. Expanded counts are not painted, while the button's label still communicates the full distribution. The hidden compact area itself is not a pointer tooltip target while expanded; the complete description remains available through the button's accessible name.

Validation logic, object counts, deduplication, precedence, Original/Foreslått lifecycle, expanded breakdowns, diagnostics and action handlers are untouched.

## Verification

- `node --test tests/validationV2RuleCounts.test.mjs tests/validationV2RuleCountsBrowser.test.mjs`: **5/5 pass**, no skips.
- Browser harness uses the actual component and production stylesheet at **1366×768** and **1280×720**, with light/dark system preferences. It checks three grid columns, no separators, equal positive gaps, aligned slot edges, blank reserved zero slots, all-OK position, existing simplified distributions, large five-digit counts, long-name truncation and no overflow.
- At each of the four viewport/preference combinations, the test measures header, name, compact area and chevron rectangles before expansion, while expanded and after collapse. All rectangles remain identical. Expanded compact values have computed hidden visibility and do not appear in the header's visible text; full detailed breakdown remains present. Labels and tooltip strings remain identical across states.
- Native Enter keyboard collapse passes using the existing harness convention of including carriage-return text in the CDP key event. An initial test omitted that payload and timed out; correcting the test event required no production keyboard changes.
- Vis and correction callbacks both pass. Expanded warning detail colour remains unchanged. Original/Foreslått-style result replacement updates detailed counts while compact counts remain hidden; collapsing reveals current counts, and switching back restores the mixed distribution.
- Existing colour/contrast regressions pass, including >=4.5:1 normal-text contrast on white and soft Validator surfaces.
- Relevant V2 suite: **296 tests, 293 pass, 3 confirmed baseline failures**, no skips.
- Targeted ESLint for the changed component and two test files: pass.
- `npm run build`: pass. Existing Browserslist freshness warning remains.
- `git diff --check`: pass; ordinary LF-to-CRLF notices only.
- Visually inspected collapsed 1280 light and expanded 1366 light screenshots: aligned values without dots, hidden expanded compact summary, unchanged expanded breakdown and clear chevron spacing.

### Baseline failures

Reproduced from `4e9ecf9` versions of `validationV2WorkspaceInspector.test.mjs` and all source files it reads in a temporary directory. Same four passes and three failures:

1. Line 7: normal sidebar width is preserved and shared by the Validator and docked inspector.
2. Line 34: workspace shell places a full-height left list beside a shared upper row and full-width bottom dock.
3. Line 103: 2D map resize invalidation and parent-sized 3D canvas remain in place.

These remain existing page/sidebar/MapView JSX source-pattern mismatches. No related files or baseline tests changed.

## Limitations

Automation uses the existing synthetic component host and result replacement rather than importing a real file or driving a live Rettinger session. Correction testing verifies the preserved callback, not a full correction workflow. Existing system dark preference retains light Validator surfaces. Shared slot widths can still resize together when filtering or selecting a dataset with a different maximum digit count; expanding/collapsing alone does not change them.

## Manual browser acceptance

1. Run `npm run dev`, import representative GMI data, open Validator and validate Original.
2. Scan collapsed cards: verify aligned FEIL / SJEKK / OK positions, blank zero slots, no separators, golden SJEKK and a green number only in the OK slot for all-OK rows.
3. Hover the compact area and inspect the expansion button's accessible name. Confirm the complete total and all three named categories remain, including zeroes.
4. Expand/collapse with pointer and keyboard. Confirm compact counts disappear only while expanded, the header/name/chevron stay in place, and detailed counts remain visible. Test long names as well.
5. Use Vis and an eligible existing correction control; confirm the usual inspector and correction behavior.
6. Where verified proposed data exists, select Foreslått and validate normally, then return to Original. Confirm current results in expanded details and collapsed slots.
7. Repeat at 1366×768 and 1280×720, with both system appearance preferences.
