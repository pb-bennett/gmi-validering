# S5B Validator detail, inspector, and fallback styling

Date: 2026-09-23. Starting SHA: `bec1e9d` (`Refresh Validator list styling`) on `feature/styling-overhaul-integrated`. Repository root: `C:/GitHub/gmi-validering-test`. The starting working tree was clean.

## Files changed

- `src/components/validation-v2/ValidationV2FieldDetailContent.js`
- `src/components/validation-v2/ValidationV2FieldInspector.js`
- `src/components/validation-v2/ValidationV2FieldInfoModal.js`
- `tests/validationV2FieldDetailExtraction.test.mjs`, presentation-only assertions for the migrated fallback backdrop and Details disclosure
- `tests/validationV2GmiA7.test.mjs`, one presentation-only assertion for the migrated Details container
- `docs/agent-reports/20260923-styling-overhaul-s5b-validator-detail.md`, this report

`fieldDetailLayout.js` required no change. Its 38rem docked width and 44rem fallback maximum width remain authoritative.

## Shared detail content

The active shared Resultat and Regel presentation now uses the accepted GMI Surface, Soft, Border, Strong Border, Navy, Text, Muted, Subtle, Ink, inverse text, and Interactive roles. The pass includes:

- Resultat/Regel tab strip, neutral selected tabs, hover treatment, and Interactive inset keyboard focus.
- Result heading, neutral coverage summary, diagnostic cards, dependency notes, loading/empty/error states, and retry action.
- Exact-object actions, contextual qualifier control and tooltip, Details disclosure, interpreted-value and long-description disclosures, and NOBB links.
- Field metadata rows, explanatory copy hierarchy, applicability values, technical details, source metadata, compatibility mappings, and authoritative value tables.
- Compact table headers, dividers, sticky headers, row text hierarchy, source notes, horizontal overflow, and existing maximum-height scrolling.

The active modern detail functions were migrated. The unreferenced `LegacyRulePanel` and `LegacyResultPanel` implementations were not restyled. The shared `InformationRow` helper changed because it is part of the active modern presentation.

No field value, rule, result, diagnostic, grouping, table row, field ordering, tab meaning, available action, or copy changed.

## Docked inspector

The docked frame now uses Surface, Border, Navy/Subtle header hierarchy, and a compact neutral close control with Interactive focus. Its `aside` semantics, complementary role, live title, header allocation, full-height flex/scroll ownership, shadow, close handler, portal host, and exact 38rem width are unchanged.

No inspector icon or Phosphor weight changed. Icon convergence remains a separate review.

## Fallback detail modal

The fallback retains its existing dialog semantics, focus trap, initial close-button focus, Escape handling, backdrop click behavior, portal ownership, `z-[10003]`, constrained height, and exact 44rem maximum width. Its appearance now uses an Ink translucent backdrop with restrained blur, an elevated Surface frame with Border and 16px dialog corners, the shared compact header hierarchy, and the same neutral close/focus treatment as the docked frame.

The fallback remains a dense technical dialog. Its 12px outer padding, compact 32px close control, 11–14px hierarchy, shared detail spacing, and 720px height constraint remain; no AppInfo hero, reading column, large section rhythm, or 44px reading controls were introduced. The existing inline close SVG was preserved.

## Tokens, recipes, status, and focus

S1 semantic utilities were reused for Surface, Soft, Border, Strong Border, Navy, Text, Muted, Subtle, Ink, inverse text, and Interactive. S2 `gmi-elevated-surface`, `gmi-compact-button`, and `gmi-selected-control` recipes were reused where their responsibilities fit. Existing focus ring width, inset/outset behavior, and zero-offset controls were preserved while their incidental blue/cyan colours were normalized to GMI Interactive.

Feil remains red, Sjekk remains the existing amber/orange semantic treatment, and Pass remains green. Semantic row classes returned by the presentation adapter were not changed. Neutral coverage, selection, and dependency states remain visually distinct from validation outcomes.

The current optional-Type guidance remains unchanged: the field is not required; the relevant Type should be checked; otherwise the field may remain empty. No validation wording, action label, tab label, field name, or explanatory copy was edited.

## Preserved architecture and exclusions

The presentational adapter boundary is unchanged: shared content owns detail presentation, the inspector owns the docked frame, the modal owns fallback dialog behavior, and Workspace owns selection and docking. No logic was merged or moved.

`ValidationV2Workspace.js` was not edited. Selected-field state, active tab state, `inspectorHost`, portal ownership, docking decision, callbacks, props, opener focus restoration, lifecycle, and reset behavior remain unchanged. `fieldDetailLayout.js` was not edited. Docking still requires the existing 480px map allowance and preserves the 1468px default boundary calculation.

The S5A list/header/geometry/search/filter/sort/count/rule-row files were untouched. Legacy `src/components/FieldDetailModal.js` is used only by the separate legacy Validator branch and was untouched. S6 `LayerDataTable`, table geometry, virtualization, sticky columns, selection, action gutter, and zoom behavior were untouched. Map, profile, 3D, toolbar, observers, and shell geometry were untouched.

The Stats predicate remains exactly `!(layerDataTableOpen || dockedInspectorOpen)`. Docked inspector visibility still suppresses the trigger; fallback modal visibility does not. An already-open Stats modal remains independent.

No icon node, import, family, weight, inline SVG, or text glyph was changed.

## Verification

- `git diff --check`: passed. Git emitted existing LF-to-CRLF working-copy warnings only.
- Initial targeted run: 95/98 passed; the three failures were exact class-string expectations for the intentionally migrated fallback backdrop and Details disclosure.
- The two affected tests were updated only at those presentation assertions. Focus, width, docking, lifecycle, state, adapter, action, wording, and Stats assertions were not weakened.
- Final targeted command:

  `node --loader ./tests/esmJsLoader.mjs --test tests/validationV2WorkspaceInspector.test.mjs tests/validationV2FieldDetailExtraction.test.mjs tests/validationV2GmiA81FieldInfo.test.mjs tests/validationV2FieldDataPresentation.test.mjs tests/validationV2Diagnostics.test.mjs tests/validationV2GmiA81ResultsWorkflow.test.mjs tests/validationV2GmiA7.test.mjs tests/objectTableInspection.test.mjs tests/statsUiContract.test.mjs tests/appInfoUiContract.test.mjs`

  Result: passed, 98/98. Node emitted the existing experimental-loader warning.

- `npm.cmd run build`: passed. Next.js production compilation, type checking, page-data collection, and static generation completed. Browserslist reported stale local data; dependencies were not updated.

## Browser review and deferred checks

Browser review was not performed because this repository/session exposes no browser or Playwright harness. Visual acceptance remains pending for docked and fallback frames, long field names and copy, both tabs, every semantic state, optional-Type guidance, value tables and horizontal scrolling, exact-object actions, repeated field switches, close/focus restoration, bottom-table coexistence, and the docked-only Stats suppression distinction. Om and Kontakt access also remain to be confirmed visually.

No S6+, dependency, icon-convergence, commit, push, deploy, branch-switch, reset, stash, or clean operation was performed.

## Final status

```text
 M src/components/validation-v2/ValidationV2FieldDetailContent.js
 M src/components/validation-v2/ValidationV2FieldInfoModal.js
 M src/components/validation-v2/ValidationV2FieldInspector.js
 M tests/validationV2FieldDetailExtraction.test.mjs
 M tests/validationV2GmiA7.test.mjs
?? docs/agent-reports/20260923-styling-overhaul-s5b-validator-detail.md
```
