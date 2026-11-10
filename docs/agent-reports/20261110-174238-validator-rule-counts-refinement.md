# Validator header count refinement

2026-11-10 17:42:38 Europe/Oslo. Branch `feature/photo-workspace`, starting commit `57b6d28`. No commit or push.

## Palette inspection and choice

Inspected `src/app/globals.css`, severity consumers and Tailwind's installed `theme.css` before implementation.

The official shared Validator severity accents (`--gmi-validation-*-icon`, used by `.gmi-validation-accent`) are red-700 for FEIL, orange-700 for SJEKK and green-700 for OK. Their companion text tokens are red/orange/green-800, surfaces are -50, borders -200 and dots red-600/orange-500/green-600. These remain unchanged.

Existing alternatives:

- `FieldValidationSidebar.js`: yellow-700 warning filter text on yellow-50; yellow-500 dots/borders and yellow-600 warning text.
- `FieldDetailModal.js`: yellow-500 status dots and yellow-600 warning text.
- `AppInfoModal.js`: amber-800 SJEKK label on amber-50.
- `DevDiagnosticsPanel.js`: yellow-300/400 text on dark diagnostics surfaces.
- Warm Orange theme: primary #f59e0b, primary-dark #d97706, primary-light #fbbf24. These bright accents are less suitable for small text on white.
- Canonical Validator surfaces: `--gmi-surface` #FFFFFF and `--gmi-surface-soft` #F8FAFC. System dark preference currently retains these light surfaces.

Selected existing **yellow-700**, exposed as the narrowly scoped semantic token `--gmi-validation-rule-count-warning-text`. Only warning numbers inside `.gmi-validation-rule-counts` use it. Shared warning text, dots, diagnostics, tooltips and other workflows retain the original palette.

Browser-computed colours and contrast:

| Header category | Existing palette colour | OKLCH hue | White contrast | Soft surface contrast |
| --- | --- | --- | --- | --- |
| FEIL | red-700 | 27.518° | 6.42:1 | 6.14:1 |
| SJEKK | yellow-700 | 66.442° | 4.93:1 | 4.71:1 |
| OK | green-700 | 150.069° | 4.95:1 | 4.73:1 |

All exceed normal-text 4.5:1. Yellow's hue is approximately 39° from red, compared with approximately 11° for the previous orange-700 (38.402°). Visual inspection confirms a clearer golden warning tone. This hue comparison documents the improvement; it is not a claim that colour alone communicates severity to every viewer. Complete labels and tooltips remain available.

## Files changed

- `src/app/globals.css`: one scoped semantic token and one warning-count selector.
- `src/components/validation-v2/ValidationV2RuleList.js`: filters zero values from visual summary, preserves FEIL → SJEKK → OK order, inserts middle dots between remaining values, removes visible total and parentheses, adds neutral fallback and complete descriptions.
- `tests/browser/validationRuleCountsApp.js`: all six requested distributions, empty and aggregate-only cases, and a long-name example in the existing test host.
- `tests/validationV2RuleCountsBrowser.test.mjs`: updated visual assertions and regressions for examples, accessibility, palette, contrast, truncation, retained details and updates.
- `docs/agent-reports/assets/20261110-rule-counts-refinement/`: four screenshots, both requested viewport sizes and light/dark system preferences.
- This report.

## Implementation decisions

Only positive categories render. For example, 24 FEIL / 0 SJEKK / 145 OK becomes `24 · 145`; all OK becomes a single green number. Zero countable results render neutral `Ingen resultater`.

The tooltip and expansion button name retain the full supplied object total and all three named categories, including zeroes. The total is described as `objekter i kontrollgrunnlaget`, avoiding a claim that every object in a legacy aggregate total passed or received a severity result. When supplied, `notEvaluatedCount` is explicitly described as `Ikke evaluert`; it is never inferred from subtraction. Empty results additionally say `Ingen tellbare resultater`.

No count semantics changed: the component consumes the existing object-level presentation counts, combines CHECK and INDETERMINATE as before, and never derives OK. A legacy total of 10 with 1 FEIL / 0 SJEKK / 2 OK / 7 not evaluated visually shows `1 · 2` while retaining the full explanation. Deduplication, validation lifecycle and result selection remain unchanged.

Typography remains 11px with medium weight and tabular numerals. The summary does not wrap or shrink; long names truncate, and the Regular Phosphor chevron retains its gap. Expanded summaries, diagnostics, Vis and correction actions were not changed. A browser assertion specifically confirms expanded warning detail text still uses orange-700.

## Verification

- Focused data/browser tests: **5/5 pass**, no skips. Existing data tests continue covering object deduplication, severity precedence, skipped/unsupported outcomes, explicit passes and updated engine results.
- Existing browser harness tests the actual React component and production stylesheet at **1366×768 and 1280×720**, with light/dark media preferences. All six requested examples, zero hiding, no total/parentheses, order/separators, only-OK, full labels/tooltips, empty fallback, legacy total mismatch and long-name truncation pass.
- Browser tests also retain expand/collapse, detailed counts, Vis callback and Original/Foreslått-style result replacement while expanded/collapsed. Header token mappings, contrast on both surfaces, golden/red hue separation and unchanged expanded warning palette pass.
- Full relevant V2 suite: **296 tests, 293 pass, 3 pre-existing failures**, no skips.
- Targeted ESLint on the changed component and browser test/fixture: pass.
- Production `npm run build`: pass. Existing Browserslist freshness warning remains.
- `git diff --check`: pass.
- Screenshots visually inspected at 1280 light and 1366 dark. Counts remain compact with visible golden warnings and clear chevron separation.

### Baseline failures

Reproduced from **57b6d28** versions of the workspace inspector test and all its referenced files in a temporary directory. Same three failures, four passes:

1. `validationV2WorkspaceInspector.test.mjs:7`: normal sidebar width is preserved and shared by the Validator and docked inspector.
2. Line 34: workspace shell places a full-height left list beside a shared upper row and full-width bottom dock.
3. Line 103: 2D map resize invalidation and parent-sized 3D canvas remain in place.

These are existing JSX source-pattern expectations for page/sidebar/MapView layout. No related files were changed.

## Limitations and manual acceptance

Browser automation uses a test-only host for the actual rule component and actual stylesheet. It replaces presentation results to exercise Original/Foreslått-style updates; it does not drive a real Rettinger session or load the real acceptance file. The palette currently has light Validator surfaces under either system preference, so a separate dark-surface design is not claimed. Existing empty-result list filtering remains unchanged; the fallback is tested by explicitly supplying an empty legacy presentation.

Manual checks:

1. Run `npm run dev`, import the acceptance GMI file, open Validator and run Original validation.
2. Confirm Innvendig/utvendig displays `5 · 1 · 67`, with distinct red/gold/green numbers. Check the requested example distributions wherever available, including a single green all-OK number.
3. Hover counts and inspect the expansion button's accessible name: total and all named categories remain, including zeroes. For aggregate-only/skipped data, check that the description does not imply missing results are OK.
4. Expand a card: confirm header counts persist, expanded diagnostic information is unchanged, and Vis and existing correction actions still work.
5. Where a verified proposed dataset is available, select Foreslått and validate normally. Confirm current counts, then return to Original.
6. Repeat at 1366×768 and 1280×720 with both system appearance preferences. Check long-name truncation, single-line counts, clear chevron spacing and golden warning distinction.
