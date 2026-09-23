# S4 LayerManager and legacy sidebar styling

Date: 2026-09-23. Starting SHA: `bb61e71` on `feature/styling-overhaul-integrated`, tracking `origin/feature/styling-overhaul-integrated`. The repository root matched `C:/GitHub/gmi-validering-test` and the starting working tree was clean.

## S4 surfaces and files

- `src/components/LayerManager.js`: the normal multi-layer header, visibility summary, global show/hide actions, Gemini WMS row, empty state, and add-file footer.
- `src/components/LayerPanel.js`: individual layer rows; layer visibility, zoom, remove, expand, reset, data-table, and analysis actions; layer Tema/Felt disclosures, filters, and value tables; and the layer removal confirmation frame.
- `src/components/Sidebar.js`: legacy single-file Overview, Tema, and Felt section hierarchy, cards, tables, visibility/filter controls, normal-mode Kontakt footer, and the normal sidebar surface. Analysis outcomes and behavior remain deferred to S8.
- `tests/appInfoUiContract.test.mjs`: the existing normal-mode Kontakt-footer source assertion now checks the intentional S4 semantic surface recipe while preserving its ownership/access contract.
- `docs/agent-reports/20260923-styling-overhaul-s4-layer-manager.md`: this record.

## Design decisions

The normal sidebar now consistently uses Surface over the S3B Soft workspace shell, Border and Strong border for separators and native controls, Navy for primary hierarchy, Text/Muted/Subtle for content hierarchy, and Interactive for lightweight actions and focus. Layer and legacy section headers retain their existing compact padding and disclosure behavior, but now have clear Soft-surface hover and keyboard focus states. Selected highlight and active topplok controls use the S2 neutral `gmi-selected-control` recipe rather than bright cyan fill.

Layer cards remain dense: long layer names retain their existing truncation, visibility remains a native checkbox, hidden rows keep their existing opacity cue, and destructive/error/warning/success semantic colours remain unchanged. The add-file and empty-state actions use the existing Navy `gmi-primary-control`; ordinary actions use `gmi-compact-button` and `gmi-focus-ring`; searches use `gmi-compact-field`. No additional recipe or design-system dependency was introduced.

## Corrective review pass

Browser/diff review identified that the native checkboxes still rendered their browser-default checked blue. Every S4-owned checkbox in `LayerManager`, `LayerPanel`, and the legacy `Sidebar` now includes Tailwind's `accent-gmi-interactive`, which resolves through the existing canonical `--gmi-interactive` token (`#007595`). The inputs remain native controls with their original size, checked binding, disabled state, event handling, focus ring, visibility/filter meaning, and propagation behavior.

The suspected `justify-centergap-2` concatenation was not present. Both the normal-mode Kontakt source and its contract already contain the valid separate `justify-center gap-2` classes, so no markup or test change was needed for that concern.

## Preserved contracts and exclusions

No state, data structure, callback, ref, handler, event propagation, layer ordering, visibility, selection, filtering, expansion, file parsing, validation, Testmodus/telemetry, or map behavior changed. Normal-sidebar width remains 380px by default; the same `200 < width < 800` resize bounds, sidebar-owned resize handle, 76px header reach, flex/scroll allocation, footer reachability, feature-slot ownership, and normal/Validator unmounting are unchanged. Validator, table, map chrome, profile/analysis behavior, 3D, AppInfo/Contact, and Stats were not migrated. The accepted BrandWordmark, ProductHeader, and approved SVG were not touched.

The known Kartoversikt/3D-visning overlap with Leaflet zoom controls remains deferred to S7. Semantic outcome and domain colours remain deliberately untouched. Legacy Analysis controls and their result presentation stay deferred to S8 rather than being folded into this LayerManager/sidebar visual pass.

## Verification

- `git diff --check`: passed (only CRLF conversion warnings were emitted).
- `npm.cmd run build`: passed; Next.js production compilation and static generation completed. Browserslist reported stale local data; no dependency update was made.
- `node --test tests/appInfoUiContract.test.mjs tests/statsUiContract.test.mjs tests/testMode.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/validationV2GmiA6.test.mjs tests/validationV2GmiA7.test.mjs`: passed, 43/43.
- Corrective pass: `git diff --check` passed; `node --test tests/appInfoUiContract.test.mjs` and the same targeted suite passed; `npm.cmd run build` passed.
- No dedicated LayerManager test existed. The executed workspace/sidebar contracts preserve normal resize, shared shell ownership, Validator lifecycle, Stats, and Testmodus behavior. The existing Kontakt-footer source assertion was updated solely for the intentional S4 class change; it still verifies the same normal-mode entry point and page-owned modal contract.

## Browser review still required

No browser harness is configured in this repository, so visual acceptance remains pending. Check the normal loaded workspace with several layers; selected and unselected layer rows; visible and hidden layers; expanded/collapsed Tema and Felt sections; WMS row; long layer names; removal confirmation; legacy single-file Overview/Tema/Felt; normal Kontakt; sidebar resize near 200px, 380px, and 800px; and normal-to-Validator switching. Confirm the existing Leaflet overlap is no worse than baseline.

## Icon-convergence amendment — 2026-09-23

This narrowly scoped follow-up normalizes ordinary action icons in the three S4 sidebar components using the already-installed `@phosphor-icons/react`, consistently at `weight="regular"`:

| Previous icon | Phosphor replacement | Use |
|---|---|---|
| Hand-authored plus SVG | `PlusIcon` | Add file |
| Text `▼` disclosure glyphs | `CaretDownIcon` | WMS settings, layer Tema/Felt sections and rows, and legacy sidebar sections/value rows |
| Hand-authored zoom-to-layer corners SVG | `CornersOutIcon` | Zoom to layer |
| Hand-authored X/removal SVG | `TrashIcon` | Remove layer (destructive semantics) |
| Hand-authored reset arrow SVG | `ArrowCounterClockwiseIcon` | Reset layer filters |
| Hand-authored horizontal-lines SVG | `TableIcon` | Open data table |

All replacement icons retain their prior nominal dimensions (12, 14, or 16px as applicable), color inheritance, rotation classes, and existing button/layout classes. Existing button titles remain; the WMS disclosure, zoom, removal, filter-reset, and data-table icon-only buttons now also state matching `aria-label` values. Replacement glyphs are `aria-hidden="true"` because their controls carry the name.

The star/highlight, profile chart, elevation chart, checklist/field-validation, and topplok geometry SVGs remain intentionally unchanged: they communicate analysis/domain meaning and are not generic actions. Layer visibility remains native checkboxes. Text-only “Vis alle”/“Skjul alle” and confirmation controls need no icon. No handlers, state, event propagation, disabled state, focus classes, dimensions, spacing, wording, ordering, confirmation, or data behavior changed. Source diff review was limited to icon nodes, imports, and accessible labels; browser visual acceptance remains pending as above.

Verification for this amendment:

- `git diff --check` — passed (Git reported existing LF-to-CRLF working-copy normalization warnings).
- `node --test tests/appInfoUiContract.test.mjs tests/statsUiContract.test.mjs tests/testMode.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/validationV2GmiA6.test.mjs tests/validationV2GmiA7.test.mjs` — passed, 43/43.
- `npm.cmd run build` — passed. Next.js reported stale local Browserslist data; dependencies were not updated.

## Final status

No commit, push, deploy, branch switch, dependency update, or S5+ work was made. Final `git status --short`:

```text
 M src/components/LayerManager.js
 M src/components/LayerPanel.js
 M src/components/Sidebar.js
 M tests/appInfoUiContract.test.mjs
?? docs/agent-reports/20260923-styling-overhaul-s4-layer-manager.md
```
