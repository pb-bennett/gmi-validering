# Validator rule header counts — 2026-11-10 17:25:29 Europe/Oslo

Branch: `feature/photo-workspace`. Starting HEAD: `ebf850d`. No commit or push.

## Changes

- `src/components/validation-v2/ValidationV2RuleList.js`: every visible rule header now shows neutral total followed by coloured FEIL · SJEKK · OK counts, including zeroes. The same header remains visible when expanded. Existing detailed summary, Vis handler, correction action and expansion behavior are preserved.
- `src/lib/validation-v2/resultPresentation.js`: aggregate-only fallback reads explicit `passCount` instead of subtracting findings from evaluated objects. This prevents skipped/unsupported objects from being presented as OK. No validation engine, rule or severity calculation changed.
- `tests/validationV2RuleCounts.test.mjs`: four focused data regressions.
- `tests/validationV2RuleCountsBrowser.test.mjs`: actual React component and production stylesheet browser regression using the repository's existing Next/SWC/Chrome harness pattern.
- `tests/browser/validationRuleCountsApp.js`: synthetic test-only component host; no production route or dependency added.
- `docs/agent-reports/assets/20261110-rule-counts/`: four collapsed-card screenshots at both requested sizes and system colour preferences.

## Count semantics

The header consumes the same `presentation.counts` as the existing expanded summary. Production presentations group rule owners by canonical field and deduplicate outcomes by object reference key within the selected geometry. The existing precedence is FAIL > CHECK/INDETERMINATE > PASS. Unresolved dependency/suppression outcomes retain their existing SJEKK presentation; other NOT_EVALUATED and unsupported outcomes are omitted. Findings arrays are never counted. Explicit PASS outcomes supply OK counts.

The legacy aggregate-only fallback has no object identities, so its existing maximum-per-owner aggregation remains in place; explicit pass counts now supply OK. Its neutral total can include unevaluated objects, so the three severity counts need not sum to that total. Current validation engine results contain object outcomes and use the deduplicated path.

No validation is triggered by the header. It renders current props without cached count state. Original/Foreslått result selection and validation lifecycle remain owned by the existing workspace.

## Styling and accessibility

Format: `73 (5 · 1 · 67)`. Total, parentheses and middle dots are neutral. Numeric categories use existing `data-validation-tone` error/warning/success tokens and `gmi-validation-accent`, with medium weight, 11px typography and tabular numerals. The summary cannot shrink or wrap; the existing field name truncates as needed. The Regular Phosphor chevron has additional separation.

The expansion button's accessible name includes the total and explicitly named FEIL, SJEKK and OK counts. A native tooltip provides the same explanation to pointer users. The visual summary is aria-hidden to avoid duplicate announcements.

## Verification

- `node --test tests/validationV2RuleCounts.test.mjs`: 4/4 pass. Includes mixed outcomes, only OK, zeroes, duplicate findings/owners, severity precedence, skipped/unsupported states, aggregate fallback, real engine 73 (5 · 1 · 67), and updated 73 (0 · 0 · 73). Real engine counts match the detailed owner's geometry breakdown.
- `node --test tests/validationV2RuleCountsBrowser.test.mjs`: 1/1 pass. Actual rule component with actual stylesheet at 1366×768 and 1280×720, both light/dark media preferences. Checks labelled counts, token mapping, distinct colours, neutral total, contrast >= 4.5, no wrapping/overflow, tabular numerals and chevron gap. Expands/collapses, verifies the retained detailed distribution, invokes Vis, updates results while expanded and collapsed, and restores original results.
- Final `node --test tests/validationV2*.test.mjs`: 296 tests, 293 pass, 3 baseline failures listed below, no skips. Includes the new browser regression.
- `node --test tests/gmiValidatorEditing.test.mjs tests/validationV2RuleCounts.test.mjs`: 16/16 pass, including existing original/proposed validation comparison regressions.
- Targeted `npx eslint` on the two changed production files and three new test files: pass.
- `npm run build`: pass. Existing Browserslist freshness warning only.
- `git diff --check`: pass; Git reports normal LF-to-CRLF conversion notices.
- Visually inspected captured 1280 light and 1366 dark screenshots: compact, readable header with clear chevron separation. The shared application palette retains light surfaces under dark system preference; no separate dark palette was introduced.

### Confirmed baseline failures

All three are source-pattern expectations in `tests/validationV2WorkspaceInspector.test.mjs`, reproduced from HEAD versions of that test and all its referenced files in a temporary baseline directory (4 pass, 3 fail):

1. Line 7: normal sidebar width is preserved and shared by the Validator and docked inspector.
2. Line 34: workspace shell places a full-height left list beside a shared upper row and full-width bottom dock.
3. Line 103: 2D map resize invalidation and parent-sized 3D canvas remain in place.

These expect older page/sidebar/MapView JSX patterns. No related production files or baseline tests were modified.

## Manual browser acceptance

1. Run `npm run dev`, open the application at 1366×768, and import the real acceptance GMI file.
2. Open Validator, select Original, run validation, and select point geometry. Clear result filters if necessary.
3. Confirm collapsed Innvendig/utvendig shows `73 (5 · 1 · 67)` in red/orange/green order; hover the counts and inspect the expansion button's accessible name.
4. Expand the card. Confirm the same header remains, the detailed counts agree, and Vis opens the existing inspector with diagnostics and object actions.
5. Where a verified proposed dataset exists, select Foreslått and run validation as usual. Confirm the header follows its current results; switch back to Original and check the original distribution.
6. Repeat at 1280×720 and both system appearance preferences. Scan long field names, only-OK rules and zero-count categories; confirm the counts stay on one line and the chevron stays distinct.

Browser automation used synthetic result updates and a real component host. Full application acceptance with the real 73-point file and an actual Rettinger session remains a manual step; no real acceptance file was provided in this task.
