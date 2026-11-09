# M5A polish — shared severity colours and readable tooltips

Date: 2026-11-09. Branch `feature/photo-workspace`; continued the existing repository at observed HEAD `8a233f3` without reverting or reimplementing M5A. No commit or push.

## Outcome and scope

Rettinger validation indicators now use the Validator's shared red/orange/green palette, with matching soft tooltip backgrounds, dark text and subtle borders. Icons are 18 px inside 24×24 px interactive targets. Existing findings, introduced `+` findings and resolved green checks remain distinct. Tooltips show a Norwegian explanation and transition, without internal rule identifiers. Resolved tooltips say `OK · Løst i forslaget` and identify the explanation as the original finding.

Datafangstdato explanations now identify future dates, invalid dates, dates before Anleggsår and dates older than five years separately. All date decisions still come from the existing Validator reason codes; no date comparison or classification changed.

The SDR/Ringstivhet rule, applicability, debounce, object-scoped evaluation, ChangeSet operations, original values, safety restrictions and export logic are unchanged. GMI export remains **Eksperimentell**.

## Files changed

| File | Change |
|---|---|
| `src/app/globals.css` | Shared semantic severity aliases and shared tone styles; optional severity styling on the existing tooltip. |
| `src/components/photos/PhotoIconButton.js` | Optional `tooltipTone` passed to the existing tooltip hook; ordinary callers retain their defaults. |
| `src/components/photos/photoIconTooltip.js` | Applies/removes a validated tone attribute when updating the existing tooltip. Positioning and interaction handlers are unchanged. |
| `src/components/gmi-edit/GmiObjectEditor.js` | Chooses the display tone and uses 18 px finding icons. |
| `src/components/gmi-edit/gmiEdit.css` | 24 px targets, shared icon colours, introduced-marker positioning. Removes the three local severity hex shades. |
| `src/lib/gmiEditValidation.mjs` | User-facing tooltip wording without rule IDs or redundant rule-description text; internal IDs remain available. |
| `src/lib/validation-v2/diagnostics.js` | Shared, reason-specific Datafangstdato explanations. |
| `src/components/validation-v2/ValidationV2RuleList.js` | Shared dot/count tones; aligns SJEKK's former amber with the established orange field-detail palette. |
| `src/components/validation-v2/ValidationV2FieldDetailContent.js` | Shared status-guidance and diagnostic-card tones; preserves the soft 60% background treatment. |
| `src/components/validation-v2/ValidationV2Workspace.js` | Uses the same orange tone for the schema-coexistence SJEKK notice. |
| `tests/gmiEditValidation.test.mjs` | Asserts hidden internal IDs and clear resolved wording while retaining the M5A behavioural checks. |
| `tests/gmiEditValidationUi.test.mjs` | Browser coverage for tones, contrast, sizing, overlap, keyboard interaction, default tooltip preservation and future-date wording. |
| `tests/helpers/gmiEditValidationFixture.mjs` | Optional capture-date input for browser coverage; default fixture remains unchanged. |
| `tests/gmiEditValidationPolish.test.mjs` (new) | Shared-token adoption and date explanation/classification tests. |
| M5A report and this report | Cross-reference and completion evidence. |

## Shared severity palette

Existing Validator field guidance and Fildata already used Tailwind red/orange/green. Some rule summaries and diagnostic cards instead used amber for SJEKK. No separate semantic severity tokens existed alongside the app's general `--gmi-*` palette.

Added `--gmi-validation-{error,warning,success}-{bg,text,border,icon,dot}` aliases. These refer to existing Tailwind colour definitions, with no new literal shades:

| Role | FEIL | SJEKK | OK/resolved |
|---|---|---|---|
| Soft background | red-50 | orange-50 | green-50 |
| Tooltip/body text | red-800 | orange-800 | green-800 |
| Subtle border | red-200 | orange-200 | green-200 |
| Icon/count accent | red-700 | orange-700 | green-700 |
| Validator status dot | red-600 | orange-500 | green-600 |

`data-validation-tone` selects shared role variables consumed by both workspaces and the existing tooltip. Neutral information reuses `--gmi-surface-soft`, `--gmi-text-muted` and `--gmi-border-strong`. Existing Fildata red/orange utilities use those same underlying palette definitions and remain unchanged. The limited amber-to-orange corrections align SJEKK without changing its classification. Red/green Validator colours and general layout remain intact.

Severity tooltips use explicit soft surfaces, so they remain readable independently of the surrounding appearance preference. Browser tests measured text/background contrast of at least **4.5:1** for all three variants under both light and dark `prefers-color-scheme` settings. This does not introduce a new application dark theme.

## Tooltip and icon behaviour

The existing `PhotoIconButton` / `attachPhotoIconTooltip` implementation is retained. Only an optional tone flows through its update options; the same DOM tooltip, positioning, hover delay/grace period, focus-visible handling, Escape dismissal, viewport handling and cleanup remain in use. Callers without a tone retain the existing default styling; this is also checked in the browser and through FOTO regressions.

Finding icons use 18 px SVGs with 24×24 px focusable targets. The field-heading flex alignment and wrapping remain in place. The `+` stays inside its target, leaving room for adjacent rules. Browser checks verify centred alignment, no overlapping targets and no horizontal overflow at the existing laptop sizes. Screenshots of red, orange and green tooltips were visually inspected from `%TEMP%`.

Internal `ruleId`, finding keys and `data-gmi-finding` attributes remain available for diagnostics/tests. Ordinary tooltip text and accessible labels contain no `innmaling.*` identifiers. The shared diagnostic explanation supplies the body instead of repeating a rule description followed by its explanation. A resolved tooltip describes the original problem as “Opprinnelig funn” so it does not claim the current corrected value is still wrong.

## Datafangstdato investigation and explanation

The existing `captureDate` policy uses `parseCalendarDate`, the run's reference date, and a usable Anleggsår. Its order remains unchanged: missing value, invalid calendar/format, future date, date before Anleggsår, then the five-year review threshold.

The shared diagnostic renderer now maps the existing reasons:

- `DATE_FUTURE`: “Datafangstdato er 19.11.2026, som ligger i fremtiden. Kontroller datoen.” for that supplied value.
- `DATE_FORMAT_INVALID`: explains that the value is not a valid date and lists the supported date formats.
- `DATE_BEFORE_INSTALLATION`: explains that the date precedes Anleggsår and asks the user to check both.
- `DATE_OLDER_THAN_FIVE_YEARS`: explains the age and asks whether the date is correct; remains SJEKK.
- Missing dates retain the existing required-value explanation.

The renderer consumes reason codes and bounded supplied-value evidence; it does not compare dates or assume every date problem is a future date. Tests use a reference date of 2026-11-09 for the acceptance example and also move that reference to 2026-11-20, when 19.11.2026 passes. The production code contains no hard-coded current/comparison date. Browser coverage supplies a dynamically future year so that the test does not expire after November 2026.

## Verification results

| Check | Result |
|---|---|
| Focused polish + existing M5A + shared diagnostic tests | **36/36 pass**. |
| `node --test tests/gmiEdit*.test.mjs tests/validationV2*.test.mjs` | **385 tests: 376 pass, 3 known baseline fail, 6 skip**. |
| Production browser: all `gmiEdit*.test.mjs`, plus `photoLoadedGmiUi`, `photoImportWizardUi`, `mapTeardownUi`, `photoWorkspacePass1dUi`, `gmiPhotoAssociationsUi`, `photoWorkspaceUi`, serial execution | **150 tests: 144 pass, 0 fail, 6 expected skips**. |
| Final polished M5A browser rerun against the final production build | **7/7 pass**, including default tooltip preservation, all severity variants, keyboard focus/Escape, date wording, staging and responsive layout. |
| `node --test --test-concurrency=1 tests/*.test.mjs` | **1916 tests: 1809 pass, 7 known baseline fail, 100 skip**. |
| Targeted ESLint `--max-warnings 0` on changed JS/MJS files except the existing warning below | **Clean**. |
| `ValidationV2FieldDetailContent.js` ESLint | **0 errors, 1 pre-existing warning**: unnecessary `fieldDataRetry` useMemo dependency. Independently confirmed by linting `git show HEAD:<file>` through stdin. Not changed by this pass. |
| Final `npm run build` | **Success**; final browser test used `next start -p 3123`. |
| `git diff --check` | **Clean**. |

The seven established full-suite failures remain `appInfoUiContract` (1), `statsUiContract` (2), optional external-corpus `terrainPhotoGml` (1), and `validationV2WorkspaceInspector` (3). No new failures remain. A temporary source-contract failure arose because a CSS class name contained the substring `guid`; naming the shared surface class `gmi-validation-panel` removed that false positive without weakening the test.

Validation-runner/policy/rule definitions, the 180 ms debounce hook, M1–M3 editing files, parsing and FOTO business logic have no diff. Logs/screenshots are under `%TEMP%`, outside the repository. The production server and temporary test/browser processes were stopped after verification. No commit or push.

## Remaining UX limits and manual acceptance

No additional UX blocker was found in the checked laptop layouts. The existing M5A limitation remains: cross-object NYTT-year comparisons are not evaluated in the local form. Large missing-column finding lists remain behind the existing disclosure. Full Gemini VA database-import acceptance remains a separate gate; export stays experimental.

Recommended manual checks:

1. Compare ordinary Validator and Rettinger FEIL/SJEKK/OK colours. In particular, check the orange SJEKK summary dot/count, diagnostic card and schema-coexistence notice.
2. Hover and keyboard-focus red, orange and green Rettinger indicators. Check soft surfaces, readable borders/text, no rule IDs and Escape dismissal without losing focus or changing selection.
3. Introduce an SDR/Ringstivhet conflict, then resolve an original finding. Verify the red `+`, green check and clear original/new/resolved wording. Try a field with more than one indicator.
4. Inspect a future Datafangstdato, an invalid date, a date before Anleggsår and an old date. Verify each explanation names the appropriate cause and only the old-date review uses SJEKK.
5. Check laptop widths and appearance preferences, status-pill spacing and ordinary FOTO tooltips. Stage/undo/redo a correction and confirm export is still marked **Eksperimentell**.

The polish pass is ready for manual browser acceptance.
