# UI styling policy recovery and consolidation

Date: 2026-11-14. Documentation and policy task. No application code, CSS, tests, dependencies, fixtures or existing reports were changed.

## Scope and outcome

- Investigated Git history and current source for UI design standards.
- Added a "UI design and styling standards" section to the root `AGENTS.md` and one cross-reference sentence in "Scope and conventions".
- **Main finding:** no tracked version of `AGENTS.md` ever contained detailed styling rules. Nothing was lost from that file. The design rules were made and accepted in the styling-overhaul reports (S1–S12, September 2026) and in later FOTO and Rettinger acceptance reports. They were never promoted into `AGENTS.md`, which is why later agents applied them unevenly.

## Starting state

| Check | Result |
| --- | --- |
| Repository | `C:/GitHub/gmi-validering-test` |
| Branch | `feature/photo-workspace` |
| HEAD | `a50eb62` |
| Working tree | Two unrelated untracked reports (`20261113-182754-rettinger-roadmap-reconciliation.md`, `20261114-090612-foto-delivery-exclusion-plan.md`); left untouched |

## Historical AGENTS.md versions found

Searched with `git log --all --full-history -m -- AGENTS.md`, per-ref blob comparison over all local and remote branches, the reflog, the stash, and unreachable objects (`git fsck --unreachable --no-reflogs`).

| Commit | Date | Content | Styling rules |
| --- | --- | --- | --- |
| `eeec07b` Add Codex execution controls | 2026-09-02 | Execution policy (no sub-agents), model workflow, usage discipline, Git/production | None |
| `65516b9` Integrate production app with Validator 2.0 (merge) | 2026-09-22 | **Deleted** `AGENTS.md` | n/a |
| `1d29036` docs: add repository agent instructions | 2026-11-11 | Current structure: scope, source safety, verification, completion | One line: "Use existing design tokens, Phosphor icons and Norwegian user-facing terminology ... laptop sizes" |
| `442a395` docs: specify English for agent communication | 2026-11-11 | Added the language rule | Unchanged |

- No nested `AGENTS.md`, `CLAUDE.md`, Cursor or Copilot instruction file exists in any ref. `origin/feature/validator-v2-v32-baseline` still carries the `eeec07b` blob; every other ref has either the current blob or none.
- No unreachable commit, dropped stash or reflog entry holds a different `AGENTS.md`. The one stash changes only the logo SVG.
- The whole styling overhaul (2026-09-23 to 2026-09-28) ran while the repository had **no** `AGENTS.md`. An untracked, never-committed file cannot be ruled out, but Git holds no trace of one.
- The `eeec07b` execution rules (no automatic delegation, model workflow) were not carried into the November file. They are not styling rules and were not restored here; restoring them is a separate decision.

## Other historical styling guidance found

| Source | Status |
| --- | --- |
| `COPILOT_INSTRUCTIONS.md` (2025-12, archived, deleted in `6685f1a` 2026-08-30) | **Superseded.** Orange primary `#CC4A09`, Roboto + Roboto Serif dual-font system. Replaced by the GMI palette and the single Roboto face. Its `focus-visible` and contrast requirements still hold. |
| `20260915-styling-overhaul-audit.md` | Historical audit; scope and exclusions still useful, lexical counts and wordmark proposals superseded. |
| `20260921-styling-overhaul-foundations.md` | **Deliberately discarded implementation** (stated in the 20260923 roadmap). Not to be resumed. |
| `20260923-current-ui-design-reference-and-roadmap.md` | Authoritative vocabulary: canonical palette, AppInfo as visual reference, density separation, status-colour separation. |
| `20260923-styling-overhaul-s1` … `20260924-…-s12` | Implemented and accepted. S12 records the user's manual visual acceptance. |
| `20260923-icon-consistency-inventory.md` | Phosphor Regular policy and exclusions; converged in S12. |
| `20261108-185612-foto-browser-acceptance-corrections.md` | FOTO teal control theme (`photoTheme.css`). |
| `20261110-090858` (R3), `20261110-102713` (R4), `20261110-122622` (R4 polish) | Teal checkboxes and teal Rettinger primary actions, asserted as computed `rgb(0, 117, 149)`. |
| `20261110-174238-validator-rule-counts-refinement.md` | Golden warning for compact counts; hue separation from red. |
| `20261110-082623` (R2), `20261110-090858` (R3) | Data Table row-state semantics. |
| `20261113-154032-foto-sidebar-destination-correction.md` | Delivery pill colours. |

## Classification of the documented policies

A = explicitly approved decision. B = historical rule still applicable. C = existing implementation convention. D = inconsistency for the later audit (listed separately below).

| Policy in `AGENTS.md` | Class | Evidence |
| --- | --- | --- |
| `--gmi-*` palette is the source of truth; exposed as Tailwind utilities | A | S1 report; `globals.css:155–196` |
| Project teal `#007595` = `--gmi-interactive`; brand cyan separate | A | S1; task brief; R3/R4 computed-colour assertions |
| Shared validation palette; status never recoloured to cyan | A | S5A/S5B/S12; `globals.css:7–35` |
| Warning visibly distinct from red; compact SJEKK uses yellow-700 token | A | Task brief; rule-counts refinement (hue 66° vs red 28°, 4.93:1 on white) |
| GMI pill `#1e40af`, GML pill `#166534`, white text; GML marker `#22c55e` | A | Task brief; 20261113-154032; `globals.css:199–205`; parity test |
| Information colours excluded from chrome normalisation | A | S12 "Intentional exceptions retained" |
| "GMI Validator" name, `BrandWordmark` composition, approved SVG unchanged | A | S3A; 20260923 roadmap (logo SHA recorded there) |
| Roboto only; no root font-size change; density separation | B | 20260923 roadmap; `layout.js` |
| Radius vocabulary 8/12/16px | B | 20260923 roadmap. S12 deferred normalising existing compact radii |
| Button hierarchy; hover, focus, disabled on every button | A (principle) / C (class names) | Task brief; S2 recipes; `photoTheme.css` |
| Busy state: `aria-busy`, disabled, text or `CircleNotchIcon` | C | `ContactForm.js`, `GeminiConnectionModal.js` |
| Icon-only controls via `PhotoIconButton`; no native `title` | C, accepted in FOTO/Rettinger | `PhotoIconButton.js`; 20261109-131625 ("camera-button pattern") |
| Close control: Phosphor `XIcon`, specific accessible name | B/C | S12; current sources |
| Checkboxes/radios/ranges in teal; never native blue | A | Task brief; R3 §checkbox ("approved `var(--gmi-interactive)`") |
| Fields use `.gmi-compact-field` | A | S2 |
| Phosphor Regular only; listed exceptions | A | Icon inventory; S12 |
| Icon sizes 12–14 / 16 / 20–22px | C | Usage counts in `src` (size 14: 50, 16: 39, 12: 27, 20: 14, 22: 7) |
| Data Table geometry (28px rows, 32px selection column, opaque sticky cells) | A | S6; R1; R3 |
| Row states: `aria-selected` (membership), `aria-current` (active object), outline (keyboard cursor) | A | R2 and R3 reports |
| State fill on every cell including sticky cells; selected vs active distinguishable | A (requirement) | Task brief. Exact colours are open |
| Accessibility rules | A/B | Existing `AGENTS.md`; task brief; R2/R3; 2025 Copilot notes |
| Implementation conventions (scoping, no broad selectors, tests as contracts) | A | Task brief; existing `AGENTS.md` "Keep changes focused" |

Numeric values labelled C (icon sizes, 4–6px icon gap) describe what the code does most often. They are written as conventions to reuse, not as newly approved measurements.

## Existing rules retained

All previous `AGENTS.md` content is preserved verbatim: Scope and conventions, Source and data safety, Verification, Completion and Git, and the Language rule. The new section does not contradict them: it relies on the existing 1280×720 and 1366×768 verification sizes, the "keep changes focused" rule, and the report requirement.

## Superseded or conflicting guidance

| Older guidance | Superseded by |
| --- | --- |
| Orange primary `#CC4A09`, Roboto Serif headings (2025 Copilot notes) | GMI palette and single Roboto face (S1, 20260923 roadmap) |
| Five switchable `--color-*` themes | Dormant. `ThemeSwitcher.js` has no importer; S12 left the declarations in place. New chrome must not use them |
| 20260923 roadmap: "do not assume the icon replaces a letter" | S3A implemented and the user accepted the logo as the G followed by "MI Validator" |
| 20260921 foundations pass | Discarded by decision; S1–S12 replaced it |
| S2: primary control is navy everywhere | Partly superseded: FOTO (2026-11-08) and Rettinger (2026-11-10) use teal primaries, accepted in browser review. The global recipe is still navy. **Conflict, see open decision 1** |
| S12: "large desktop at approximately HD is the intended minimum" | Current `AGENTS.md` verification sizes 1280×720 and 1366×768 take precedence |
| Bold Phosphor weights, hand-drawn action SVGs, text glyphs | Phosphor Regular (S12). No non-regular `weight=` remains in `src` |

## AGENTS.md sections added or revised

- **Revised:** "Scope and conventions", third bullet: one sentence appended pointing to the new section. No words removed.
- **Added:** `## UI design and styling standards`, between "Source and data safety" and "Verification", with subsections: Tokens and colour; Branding and typography; Buttons; Form controls; Icons; Data Table; Accessibility; Implementation.
- Three items are marked **Open** inside the section with an interim rule, so they are not presented as settled.

## Outstanding design decisions (recommendations, not approved)

1. **Primary action colour.** Global `.gmi-primary-control` is navy; FOTO, Rettinger and the delivery wizard re-colour it to teal with scoped rules (`photoTheme.css:13`, `gmiEdit.css:107,193`). *Recommendation:* make teal the single app-wide primary, with hover and pressed shades from the existing `color-mix` recipe, and delete the scoped overrides. AppInfo/Om may keep navy as a reading-surface exception if wanted.
2. **Global teal for native controls.** Teal is applied per element or per module. *Recommendation:* one base rule setting `accent-color: var(--gmi-interactive)` for checkbox, radio and range inputs, plus a computed-colour test. It only sets `accent-color`, so the risk to other modules is low, but it is a global base change and needs authorization.
3. **Selected row versus active row.** Both use `--gmi-cyan-soft`; the active row adds only a 3px inset bar on the zoom cell. *Recommendation:* keep cyan-soft for checked membership and give the active object a stronger, non-fill cue painted on every cell (full-row teal top and bottom rule, plus the existing leading bar), so a row can show both states at once.
4. **Shared warning hue.** The official tokens are orange-700/800, close to red; compact counts use yellow-700; several modules hard-code amber (`#e5c07b`, `#fff8e6`, `#7a4f00`, `#b7791f`). Yellow-700 measures 4.39:1 on cyan-soft (G4 pass 1), which is why table SJEKK cells kept orange. *Recommendation:* decide one warning text/border/surface set that passes 4.5:1 on white, soft and selected-row surfaces, then retire the literals. This interacts with decision 3.
5. **Shared button recipes.** Destructive, bordered-secondary and link styles exist only as Rettinger classes (`.gmi-edit-destructive`, `.gmi-bar-button`, `.gmi-edit-link`). *Recommendation:* promote them to `globals.css` recipes under `gmi-` names and add an explicit `:disabled` rule to `.gmi-compact-button`.
6. **Close control.** Sizes range from 12 to 24px; some are `PhotoIconButton`, some bare buttons, one is a text "Lukk". *Recommendation:* one shared close button: `PhotoIconButton` with `XIcon`, 20px in dialogs, 14px in docked panels.
7. **Shared component location.** `PhotoIconButton` and its tooltip live under `photos/` but are used by Rettinger, the Data Table and layer cards. *Recommendation:* move to a neutral shared folder and rename during the audit.
8. **Teal tint.** Rettinger hard-codes `#e6f6f9`; FOTO mixes a tint from tokens. *Recommendation:* one `--gmi-interactive-tint` token.
9. **Error red outside the validation palette** (`#9b2c23`, `#b42318`, `#7f1d1d`, `#fdf3f2`). *Recommendation:* map to `--gmi-validation-error-*`.
10. **Reset icon.** `ArrowCounterClockwiseIcon` (19 uses) and `ArrowClockwiseIcon` (8) both appear. Decide one meaning for each.
11. **Font weight 600.** `font-semibold` is requested widely but Roboto 600 is not loaded, so browsers substitute. Decide whether to load 600 or standardise on 500/700.
12. **Legacy cleanup.** Five `--color-*` theme blocks and `ThemeSwitcher.js` are unused; remove or keep as a deliberate decision.

## Inconsistencies recorded for the styling audit (class D)

Found by source inspection only. None was verified in a browser in this task.

- **Likely native-blue controls** (no `accent-color` rule reaches them): `gmi-edit/GmiObjectEditor.js` confirmation checkboxes (lines 278–345), `gmi-edit/GmiBatchDialog.js` radios and checkboxes (124–219), `photos/PhotoWorkspaceCollection.js` filter checkboxes and radios (49, 196–215).
- **Buttons with a focus ring but no hover rule found:** `.delivery-tree-controls button` (`deliveryWizard.css:24`), the Rettinger tab buttons (`GmiEditWorkspace.js:370–371`), the selection-view toggle (`LayerDataTable.js:1105–1107`). Dialog header close buttons get hover only where the header is `.photo-collection-header`.
- **Data Table:** the sticky selection cell is always `bg-gmi-surface` (`LayerDataTable.js:1285`) and sticky zoom/pinned cells take the cyan fill only for the active object, not for selected rows (`:1306`). `hover:bg-gmi-surface-soft` on the row replaces the selected fill while hovering. Contextual result cells use literals `#fef2f2`, `#fffbeb`, `#f0fdf4`.
- **Hard-coded hex literals in module CSS:** `gmiEdit.css` 86, `photoWorkspace.css` 81, `photoImageViewer.css` 33, others fewer. `globals.css` has 89, most in the dormant theme blocks.
- **Legacy `blue-*`/`gray-*` utilities or `--color-primary`** remain in `AppInfoModal.js`, `DataDisplay.js`, `FieldDetailModal.js`, `FieldValidationSidebar.js`, `InclineAnalysisModal.js`, `MissingFieldsReport.js`, `ValidationV2FieldDetailContent.js`.
- **Focus colour outlier:** `.photo-camera-marker:focus-visible` uses `#075e9a` instead of the teal token.
- **Radii:** compact controls use 4, 5, 6 and 8px.

## Commands and results

- Read-only Git: `git log --all [--full-history -m] -- AGENTS.md`, `git show <commit>:AGENTS.md`, `git for-each-ref`, `git rev-parse <ref>:AGENTS.md`, `git stash show`, `git fsck --unreachable --no-reflogs`, `git log -g`. No refs changed.
- Source inspection with `grep`/`sed` over `src/` and `docs/agent-reports/`.
- `git diff --check`: passed (see final state).
- Not run, by instruction: build, unit tests, browser tests, lint.

## Deviations and limits

- The teal, pill and warning rules were stated as approved in the task brief; this report treats the brief as the newest explicit decision where reports were silent.
- All "inconsistency" findings are static. Computed colours, hover behaviour and contrast need browser confirmation in the audit.
- The private `.git/lost-found` area was not written; unreachable objects were only listed and read.

## Files changed

- `AGENTS.md` (modified)
- `docs/agent-reports/20261114-130507-ui-styling-policy-consolidation.md` (new, this report)

Nothing was staged, committed, pushed or deployed. The two pre-existing untracked reports were not touched.
