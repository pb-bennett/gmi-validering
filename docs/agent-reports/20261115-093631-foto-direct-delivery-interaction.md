# FOTO direct delivery interaction — completion

Completed 2026-11-15, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `091f92d` verified at start and completion. The tracked tree was initially clean. No subagents were used.

## Outcome

In the existing “Fordel bilder til GMI/GML” planning mode, one click now advances a confident linked occurrence through **GMI → GML → Ikke → GMI**. The list destination button, isolated map marker and overlap-popup destination button all use the same fresh-session dispatcher. Row clicks continue to select/locate only. Normal browsing/map navigation remains available outside planning mode.

The inspector retains direct choice of any of its three valid linked destinations. Unlinked occurrences keep their existing not-selected/GML cycle and never acquire a GMI association. A shared photograph's sibling placements remain untouched. Restoring a confident excluded linked occurrence returns it to GMI.

Unsafe associations and review states cannot be advanced by a direct click. Disabled controls remain focusable and explain the reason; marker/button activation can report that reason through the existing notice path. Review resolution remains an explicit inspector choice. The canonical deliveryDecisions map and session validation are unchanged.

The redundant “Velg bilder som ikke skal med…” tool, exclusion checkbox mode, selection state, bar, bulk UI branches and related mode transitions were removed. “Fjern bilder fra laget…” and its confirmation/selection workflow remain. The atomic exclusion planner/session helpers and confirmed inspector whole-photo action remain available.

## Appearance, terminology and counts

Linked GMI, GML and Ikke badges have identical dimensions, padding, alignment, typography and full radius within their presentation context. Direct-cycle buttons are 44×26 CSS pixels, with 10px/500 text. The three inspector choices also have equal fixed widths. Existing tokens supply solid GMI `#1e40af`, GML `#166534`, exclusion `#64748b`, and white text; map GML markers retain their established bright green. Full Norwegian descriptions remain in accessible names and tooltips. The existing teal keyboard ring and disabled treatment remain distinguishable.

An explicitly excluded placement has a solid grey pill. An unlinked photo never selected for GML has a dashed, unfilled pill and the full status “Ikke valgt”. Planning counts and overlap summaries separate “Ikke” from “Ikke valgt”. Existing filters continue separating exclude, not-selected and partial asset states. Inspector explanations about files retained through another placement remain intact; the new cycle tooltip states that only this placement changes and the photograph stays in FOTO.

## Exact changed files

Application:

- `src/app/page.js` — remove obsolete exclusion-mode routing and Escape/handoff branches.
- `src/components/photos/PhotoDeliveryCycleButton.js` (new) — shared accessible list/popup cycle button.
- `src/components/photos/PhotoDeliveryMapPopup.js` — replace its destination radio group with the shared per-occurrence cycle button.
- `src/components/photos/PhotoDeliveryToggle.js` — preserve inspector three-choice control; remove popup-only exclusion restriction and add full accessible destination labels.
- `src/components/photos/PhotoExclusionActions.js` — retain confirmed inspector whole-photo command; remove unreachable bulk-selection UI branches.
- `src/components/photos/PhotoWorkspaceCollection.js` — shared cycle button, three-state help, separate counts, removal of exclusion selection UI.
- `src/components/photos/PhotoWorkspaceToolsMenu.js` — remove redundant exclusion-selection entry and unused icon.
- `src/components/photos/photoWorkspace.css` — uniform solid badges, dashed unselected state, equal inspector widths; remove obsolete selection-mode styles.
- `src/lib/photos/photoDeliveryChoice.mjs` — three-state target, refusal for unsafe/review states, separate not-selected counts/summaries.
- `src/lib/photos/photoMarkerPresentation.mjs` — compact exclusion label “Ikke”.
- `src/lib/photos/photoWorkspaceState.mjs` — remove exclusion mode, excludeIds and obsolete selection actions.

Tests:

- `tests/deliveryWizardUi.test.mjs` — overlap and isolated-marker three-state cycle, keyboard activation, retained delivery/report/download assertions.
- `tests/photoDeliveryExclusion.test.mjs` — obsolete-mode refusal and unchanged removal mode; retain atomic planner/session/export coverage.
- `tests/photoDeliveryExclusionUi.test.mjs` — replace removed workflow acceptance with direct-cycle, equal computed badge geometry/colors, keyboard ring/Enter/Space, inspector sync, sibling isolation, distinct default non-selection, and layer-removal regression checks; retain whole-photo/line-link refusal coverage.
- `tests/photoDeliveryIntentUi.test.mjs` — compact labels, cycle keyboard behavior, separate counts and accessible descriptions.
- `tests/photoDeliveryPlanning.test.mjs` — canonical three-state decisions/counts, review refusal, valid unlinked behavior and shared presentation contracts.
- `tests/photoInspectorPresentation.test.mjs` — exact tools-menu contract without the retired item.
- `tests/photoMarkerProvenanceUi.test.mjs` — marker three-state sequence, compact labels, unchanged provenance/navigation behavior.
- `tests/photoWorkspaceEditUi.test.mjs` — exact tools-menu contract while preserving all editing and removal assertions.

Report: `docs/agent-reports/20261115-093631-foto-direct-delivery-interaction.md`.

## Export and source safety

Diff inspection confirms **no changes** to `src/lib/gmi-edit/`, `src/lib/delivery/`, `src/components/delivery/`, `src/lib/photos/export/` or `photoSession.mjs`. Hyperlink rewriting, attachments, GML generation, ZIP creation, verification, standalone policy and reporting implementation remain unchanged. The cycle uses the existing single-occurrence session actions; whole-photo compatibility uses the existing atomic helper.

Existing export tests continue checking fully/partially excluded files, retained line references, transfer/exclusion composition, byte preservation, deterministic packages, plan staleness, unsafe-reference refusal, report/inventory agreement and independent verification. Production browser tests still download and inspect packages/reports and compare original attachment/GMI bytes. No export safety assertion was removed or relaxed.

The user reported successful real-file acceptance of the core exclusion export before this task. This task used synthetic fixtures and does not claim a new real-file or Gemini acceptance run.

## Verification

Passed:

- Focused Node command: `node --test tests/photoDeliveryPlanning.test.mjs tests/photoDeliveryIntent.test.mjs tests/photoDeliveryExclusion.test.mjs tests/photoInspectorPresentation.test.mjs tests/photoWorkspace.test.mjs tests/deliveryExclusion.test.mjs tests/deliveryPlan.test.mjs tests/deliveryWizard.test.mjs` — **92 passed, 0 failed, 0 skipped**.
- Serial Node selection: root test filenames beginning with `delivery`, `photo`, `gmiPhoto`, or `gmiEditHyperlinkRemoval`, excluding `Ui.test.mjs`/`DevUi.test.mjs`, with `--test-concurrency=1` — **887 total: 876 passed, 0 failed, 11 skipped**.
- ESLint: `npx --no-install eslint` on all changed JS/MJS files plus the new cycle component — exit 0, no diagnostics.
- Fresh production build: `npm run build --prefix %TEMP%/gmi-foto-direct-cycle-build -- --webpack` — exit 0. Isolated copy/node_modules junction; repository `.next` and existing servers were not used for the build.
- Serial production browser: `PHOTO_UI_URL=http://localhost:3125 node --test --test-concurrency=1 tests/photoDeliveryExclusionUi.test.mjs tests/photoDeliveryIntentUi.test.mjs tests/deliveryWizardUi.test.mjs tests/photoMarkerProvenanceUi.test.mjs tests/photoWorkspaceStacksUi.test.mjs tests/photoWorkspaceEditUi.test.mjs` — **59 passed, 0 failed, 0 skipped**.
- Both **1280×720** and **1366×768** were checked. Tests compare computed width, height, radius, font size/weight, padding and alignment for the same occurrence in all three linked states; backgrounds and white text are asserted exactly. Keyboard focus uses the computed shared teal ring. Row navigation, inspector sync, overlapping/isolated markers, original layer removal and existing export packages/reports pass.
- `git diff --check` — exit 0. No staged diff.

Skipped: 11 opt-in private/reference-corpus checks and a browser-gated Node layout check. The explicit production-browser run had no skips. Private data and recipient acceptance were not inferred from synthetic tests.

Initial checks caught contracts for the deliberately retired workflow. New browser tests also needed correct native Enter CDP text, inspection of the shared focus ring rather than an outline, and whitespace normalization for rendered counts. These were corrected and the full final browser run passed. A leftover removed-mode reference was eliminated before the final build. No final check failed. Existing module-type and outdated Browserslist warnings remain; no dependencies were changed.

Logs: `%TEMP%/foto-cycle-{focused-final,node-final,lint-final,build-final,browser-final}.log`.

Visual artifacts: `%TEMP%/foto-direct-cycle-screenshots/`, including `direct-cycle-{gmi,gml,excluded}-{1280x720,1366x768}.png` and overlap/Kontroll/package screenshots. Inspection confirmed compact readable badges, visible keyboard rings and usable list/map/inspector layout at both laptop sizes. All pre-existing repository UI-review screenshots remain untouched.

## Remaining acceptance and manual checklist

No implementation blocker remains. Existing export limitations and recipient-verification warnings retain their prior behavior; no new rewriting capability or line-link exclusion was introduced.

- Enter delivery planning; click one list pill through GMI/GML/Ikke/GMI and confirm its shared-photo sibling stays unchanged.
- Repeat on an isolated marker and in an overlapping-marker popup with mouse, Enter and Space.
- Confirm row clicks only locate/select, inspector choices synchronize, and stale choices explain refusal until reviewed explicitly.
- Compare solid grey exclusions with dashed not-selected photos and their separate counts/filters.
- Confirm the old exclusion-selection menu is absent and layer removal still uses its own checkboxes/confirmation.
- Download a reviewed delivery and its separate report using the existing export acceptance process as needed.

## Final Git and process status

Branch/HEAD remain `feature/photo-workspace` / `091f92d`. There are 18 modified tracked files (10 application files and eight tests), plus the new cycle component and this report, both untracked. Nothing was staged, committed, pushed, deployed or synchronized.

The task-owned production server on port 3125 was stopped. Existing ports 3110, 3112 and 3113 remain served by the same processes observed at task start. The temporary build and synthetic screenshot/log artifacts remain outside the repository.

Pre-existing untracked reports/assets remain untouched:

- `docs/agent-reports/20261113-182754-rettinger-roadmap-reconciliation.md`
- `docs/agent-reports/20261114-090612-foto-delivery-exclusion-plan.md`
- `docs/agent-reports/20261114-160730-rettinger-export-ux-consolidation-plan.md`
- `docs/agent-reports/20261114-221747-ui-unification-review.md`
- `docs/agent-reports/assets/20261114-221747-ui-unification-review/`

Work stops after this interaction update.
