# Validator field-detail extraction — Slice 1

Date: 2026-09-14  
Branch: `feature/validator-v2-v32-ui-polish`  
Scope: extract reusable Resultat/Regel content and field-detail derivation while retaining the current blocking modal.

## Previous modal responsibilities

`ValidationV2FieldInfoModal` previously owned the field-data summary, grouped diagnostics and coverage derivation; Resultat and Regel rendering; retry state; active-tab state; modal title/status, tabs and scrolling; dialog semantics; initial focus; focus trapping; Escape handling; backdrop close; and close behavior.

## Shared content and model architecture

`ValidationV2FieldDetailContent.js` now owns the single Resultat/Regel rendering implementation, including diagnostics, coverage, dependency notes, contextual qualifiers/tooltips, `Detaljer`, value distributions, and authoritative Regel value tables. It exports `useValidationV2FieldDetailModel`, which derives the field-data summary and combined rule diagnostics once for that shared content, and `ValidationV2FieldDetailContent`, which accepts `activeTab` and `onTabChange` for controlled use.

The content has no generic table or store dependency. Future object actions can be supplied by its owner through callbacks when that integration is implemented.

## Modal-only behavior retained

`ValidationV2FieldInfoModal.js` now supplies the existing modal frame and title, backdrop, close button, `role="dialog"`/`aria-modal`, initial close-button focus, focus trap, Escape handling, backdrop close, and close callback. It owns active-tab state for this slice and passes it to the shared content. Its state initializes to Resultat. The existing workspace key by geometry and canonical field ID still remounts the modal for a newly selected field, so that field also starts on Resultat.

Modal dimensions, backdrop styling, scrolling, tab labels and keyboard navigation, title/status text, and all field-detail presentation markup were retained. No workspace layout or validation behavior was changed. No intentional visible UX change is expected.

## Files changed for this slice

- `src/components/validation-v2/ValidationV2FieldInfoModal.js` — reduced to the modal wrapper and modal behavior.
- `src/components/validation-v2/ValidationV2FieldDetailContent.js` — shared field-detail model and rendering.
- `tests/validationV2FieldDetailExtraction.test.mjs` — extraction, controlled tabs, wrapper semantics/focus, and shared presentation contracts.
- `tests/validationV2GmiA7.test.mjs`, `tests/validationV2FieldDataPresentation.test.mjs`, `tests/validationV2GmiTypeTemaCompatibility.test.mjs`, `tests/validationV2RulePresentation.test.mjs` — updated source contracts to follow the new module boundary.
- This report.

The worktree contained unrelated pre-existing edits and untracked research/report files. They were preserved and are not included in the list above.

## Validation and presentation coverage

- Focused extraction, field-data presentation, A7, Type/Tema compatibility, Rule presentation, and Type owner workflow tests: **60 passed, 0 failed**.
- Full Validator suite, `node --loader ./tests/esmJsLoader.mjs --test tests/validationV2*.test.mjs`: **244 passed, 0 failed**.
- Directly adjacent UI/source-contract tests (`statsUiContract`, `testMode`, `statisticsCue`): **10 passed, 0 failed**.
- `npm run build`: **passed**. Next.js reported only the existing stale Browserslist database notice.
- `git diff --check`: **passed**.
- Browser/manual verification: **not performed**. The in-app browser connector failed during initialization with `codex/sandbox-state-meta: missing field sandboxPolicy`, so no visual or interaction result is claimed.

Existing behavioral/model coverage continues to verify that Type Resultat combines both Type owners with deduplicated counts, Type Regel uses its unified authoritative source table, contextual Adkomst qualifiers and accessible tooltips remain intact, and value-distribution wording/count semantics do not alter validation outcomes. The extraction introduced no changes to validation rules, result states, diagnostics, counts, or privacy boundaries.

## Slice 2 note

Mount `ValidationV2FieldDetailContent` in the future right-hand inspector and pass controlled tab state from the Validator workspace. This slice intentionally leaves the modal as the active-tab owner; workspace/inspector state and the amended equal-effective-width right-inspector layout remain untouched. Preserve the existing field/rule owner composition and pass future object-table actions through owner-supplied callbacks rather than importing table/store actions into the shared presentation.
