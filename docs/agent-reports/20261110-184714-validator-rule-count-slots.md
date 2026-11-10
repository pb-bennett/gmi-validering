# Aligned Validator rule-header count slots

2026-11-10 18:47:14 Europe/Oslo. Branch `feature/photo-workspace`; starting commit `cdf2689`. No commit or push.

## Layout and implementation

The header summary is an inline grid with five columns: FEIL value, separator, SJEKK value, separator, OK value. Numeric slots are right aligned and always occupy space, even when their value is zero. Zero slots contain no text or placeholder. Values retain tabular numerals, 11px medium typography and existing red/golden-yellow/green tokens.

All rows in the current rule list share a numeric slot width: at least `3ch`, growing together to fit the longest count in that list. Separator columns are always `1.5ch`. This keeps typical summaries compact while supporting counts beyond three digits. Grid sizing uses the same font weight as the numeric values so five-digit values also fit.

Dots appear only when both adjacent category slots contain positive values. Thus FEIL + OK with an empty SJEKK slot has no dots; the reserved blank space conveys the missing category without a separator next to an empty slot. All three categories produce two dots; SJEKK + OK produces one dot. No visible totals or parentheses return.

The existing neutral `Ingen resultater` fallback spans all five grid columns. Long field names retain truncation; the summary cannot shrink or wrap and the existing chevron gap remains.

The full accessible button description and native tooltip are unchanged, including the supplied total, named FEIL/SJEKK/OK categories, zeroes and any supplied skipped-object information. Count semantics, deduplication, severity precedence, validation lifecycle and Original/Foreslått selection are unchanged. Expanded content, Vis and correction handlers are untouched.

## Files changed

- `src/components/validation-v2/ValidationV2RuleList.js`: shared slot sizing and fixed grid rendering.
- `tests/browser/validationRuleCountsApp.js`: optional five-digit fixture to verify shared growth without making normal screenshot examples artificially wide.
- `tests/validationV2RuleCountsBrowser.test.mjs`: geometric alignment, blank-slot, separator and large-count assertions; existing accessibility, palette, interaction and update checks retained.
- `docs/agent-reports/assets/20261110-rule-count-slots/`: four screenshots at the requested viewports and appearance preferences.
- This report.

## Verification

- Focused count data and browser tests: **5/5 pass**, no skips.
- Browser harness runs the actual component with the production stylesheet at **1366×768** and **1280×720**, with light/dark system preferences. Checks the existing six example distributions, all-OK slot placement, blank zero slots, neutral fallback, legacy aggregate-only descriptions and long-name truncation.
- Browser geometry assertions compare each slot's left/right edges and width between rows to within 0.1px, including blank slots. All summary widths remain equal, chevron gaps are at least 8px, and summaries stay below 20px tall without header overflow.
- A five-digit fixture is added/removed during the browser test: all numeric slots grow together, remain aligned and fit their text. Result replacement still moves the first card to blank FEIL/SJEKK slots plus green `73` in OK, then restores mixed results. Expanded details, original warning detail colour and Vis callback still pass.
- Existing palette checks remain green: normal-text contrast is at least 4.5:1 on white and soft surfaces. Golden warning colour is unchanged.
- Relevant V2 suite: **296 tests, 293 pass, 3 baseline failures**, no skips. After the final test-host refinement, focused tests were rerun successfully.
- Targeted ESLint on the changed component, browser test and fixture: pass.
- `npm run build`: pass; existing Browserslist freshness warning remains.
- `git diff --check`: pass; only ordinary LF-to-CRLF notices.
- Visually inspected screenshots confirm fixed vertical category alignment, blank reserved slots, long-name truncation and separate chevron spacing.

### Confirmed baseline failures

Reproduced using `cdf2689` versions of `validationV2WorkspaceInspector.test.mjs` and all source files it reads in an isolated temporary directory. Same four passes and three failures:

1. Line 7: normal sidebar width is preserved and shared by the Validator and docked inspector.
2. Line 34: workspace shell places a full-height left list beside a shared upper row and full-width bottom dock.
3. Line 103: 2D map resize invalidation and parent-sized 3D canvas remain in place.

These remain existing page/sidebar/MapView JSX source-pattern mismatches. Those files and tests were not modified.

## Limitations and manual acceptance

Slot widths are shared within the currently rendered list. Filtering or switching to a result set with a different maximum digit count can resize all slots together; rows remain aligned within each view. Large datasets reserve more space, so field names truncate earlier. Browser testing covers five-digit counts and the requested laptop sizes, not arbitrarily narrow panels or extreme numeric lengths.

Automation uses the existing synthetic component host and result replacement, rather than a real imported GMI file and live Rettinger session. System dark preference currently retains the application's light Validator surfaces. No new theme behaviour was introduced.

Manual steps:

1. Run `npm run dev`, import a representative GMI file, open Validator and run Original validation.
2. Scan collapsed rows containing FEIL+OK, SJEKK+OK, all OK, all FEIL and all three categories. Confirm each category stays in its own vertical slot and zero slots remain blank.
3. Confirm only adjacent populated categories have middle dots. In particular, FEIL+OK leaves the middle slot blank without stray dots.
4. Hover counts and inspect the expansion button's accessible name: totals and all named categories, including zeroes, remain available.
5. Expand a rule, inspect diagnostics and use Vis. Confirm those controls and the fixed header layout remain intact.
6. Where a verified proposed dataset is available, select Foreslått and validate normally, then return to Original. Check updated values and slot alignment.
7. Repeat at 1366×768 and 1280×720 with both system appearance preferences. Check long-name truncation, single-line counts and clear chevron separation.
