# FOTO delivery exclusion - Slice 2 completion

Implemented 2026-11-14 in `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `c828733` (matched request). Initial tracked tree was clean; only the three protected planning reports were untracked. No subagents were used.

## Outcome and implementation decisions

Whole-photo and selected-occurrence exclusion/restoration now use one pure planner, `planPhotoExclusion`, and one session action, `setPhotoDeliveryExclusion`. The canonical M8 `deliveryDecisions` map remains the only persisted delivery state. There is no whole-photo flag and no photo-record mutation.

- Photo scope expands selected occurrence IDs through `assetId` across the entire layer, independent of filters and the active placement. Occurrence scope targets exactly the selected IDs.
- The helper returns planned writes, affected placements, additional/unseen changes, distinct-asset/placement counts and specific blocked reasons. Existing derived entry eligibility and source identity remain authoritative.
- All intended linked and unlinked changes are validated before writing anything. Any review state, non-confident linked association, stale selection or unsupported link blocks the entire command. The session writes directly to the same decision map and publishes at most once; it does not compose two independently publishing actions.
- Whole-photo exclusion refuses retained GMI references without FOTO occurrences, including line links and removed placements. Selected-occurrence exclusion can still produce a partial asset whose file remains required elsewhere.
- Restoration clears linked exclusion decisions to GMI and includes omitted unlinked occurrences in GML. Already included linked transfers are preserved during restoration.
- Confirmations carry the reviewed delivery state key. A changed decision/source/occurrence state causes `stale-plan`; it cannot silently apply an expanded or different command.
- Layer delivery views expose their existing snapshot state key and links without occurrences so UI and session planning share the same evidence.

## UI, filters and accessibility

The new Verkt?y action opens a separate `exclude` mode with native row checkboxes, select-all, cancel, Escape and a compact action bar. `excludeIds` lives in the existing workspace reducer, clears on mode/owner changes and is pruned on membership reconciliation. Filters do not silently change selection. Select-all uses matching rows, excluding a pinned active photo that is outside the filter.

The primary action excludes complete physical photographs. Repeated selections also offer selected-placement exclusion and restoration. The inspector's multi-placement action uses the same component, helper and session command. No exclusion logic is duplicated in the inspector.

A confirmation is required only when writes affect unselected or filtered-out placements. It identifies filenames and GMI objects, explains that photographs remain in FOTO, and distinguishes exclusion from removal from the layer. Unsafe commands instead show specific refusal details and make no changes. Success is announced through polite `role="status"` regions. Counts distinguish selected photographs, selected placements, omitted placements and partly included photographs.

The new aggregate `not-delivered` filter (label `Ikke med`) covers linked exclusion and unlinked not-selected states for the exclude/filter/select/restore workflow. Existing explicit exclusion and not-selected filters remain available. The `partial` filter shows placements of assets still delivered elsewhere; its count is a placement count, while the action bar separately counts partial physical photographs.

The confirmation initially focuses Cancel, traps Tab within its controls, supports Escape and restores focus. When a successful bulk command disables its opener by clearing selection, focus returns to a row checkbox. Existing icon-tooltip Escape precedence is retained. Native row and filter controls use project teal, with visible focus. The new controls reuse shared FOTO recipes and Phosphor Regular icons. Selection-mode filter/action panels have bounded scrolling so the list stays usable at laptop sizes.

Direct-click GMI/GML planning stays checkbox-free and retains normal row, pill and marker interactions. Removal-mode selection and explicit cancellation remain intact.

## Export and source safety

Slice 1's `exclusions-not-supported-yet` gate is unchanged. `removalSelections` remains transfers-only. Bulk exclusions block combined/split packages; GMI-only and photos-only retain their current semantics. No M7 patcher, GML generator, attachment writer, ZIP implementation or inventory/report export code was modified. Tests verify original synthetic GMI and photograph bytes remain unchanged.

## Exact changed files

- `src/app/page.js`
- `src/components/photos/PhotoWorkspaceCollection.js`
- `src/components/photos/PhotoWorkspaceInspector.js`
- `src/components/photos/PhotoWorkspaceToolsMenu.js`
- `src/components/photos/photoTheme.css`
- `src/components/photos/photoWorkspace.css`
- `src/lib/photos/photoDeliveryChoice.mjs`
- `src/lib/photos/photoDeliveryIntent.mjs`
- `src/lib/photos/photoSession.mjs`
- `src/lib/photos/photoWorkspaceState.mjs`
- `src/lib/photos/photoWorkspaceView.mjs`
- `tests/helpers/photoSourceWorkflow.mjs`
- `tests/photoDeliveryIntent.test.mjs`
- `tests/photoInspectorPresentation.test.mjs`
- `tests/photoWorkspaceEditUi.test.mjs`
- `src/components/photos/PhotoExclusionActions.js`
- `tests/photoDeliveryExclusion.test.mjs`
- `tests/photoDeliveryExclusionUi.test.mjs`
- `docs/agent-reports/20261114-205117-foto-delivery-exclusion-slice2.md` (this report)

15 tracked files modified; three new application/test files; this completion report is also new. Existing assertions were retained, with expected menu/filter schemas extended for the requested additions.

## Verification

Passed:

- Focused Node command: `node --test tests/photoDeliveryExclusion.test.mjs tests/photoInspectorPresentation.test.mjs tests/photoDeliveryIntent.test.mjs tests/photoDeliveryPlanning.test.mjs tests/photoWorkspace.test.mjs tests/photoWorkspaceView.test.mjs`: **57 passed, 0 failed, 0 skipped**. Log: `%TEMP%/foto-slice2-focused-final.log`.
- Serial FOTO/delivery Node regression: root-level `photo*`, `delivery*`, `gmiPhoto*`, `gmiHyperlink*` files discovered with `rg --files tests -g '*.test.mjs'`, then `node --test --test-concurrency=1`: **855 passed, 0 failed, 97 skipped**, 952 total. Log: `%TEMP%/foto-slice2-regression-final.log`.
- New coverage includes whole-photo shared occurrences, mixed linked/unlinked writes, synthetic mixed occurrences of the same asset, exact occurrence scope, restoration, every stale reason, zero-write/zero-publish refusals, retained-line/missing-placement refusal, stale confirmation keys, immutable records/bytes, filters and reducer lifecycle. A 50-photo/51-placement test verifies exclusion and restoration each publish exactly once. Combined/split packages remain blocked with exclusions.
- ESLint on every changed/new JS/MJS file: **passed**, no diagnostics. Log: `%TEMP%/foto-slice2-eslint-final.log`.
- Fresh isolated production webpack build: `npm run build --prefix %TEMP%/gmi-foto-exclusion-slice2-build -- --webpack`: **passed**. Final application sources were byte-compared with the isolated build copy. Log: `%TEMP%/foto-slice2-build-final.log`.
- Six production-browser suites run serially with `PHOTO_UI_URL=http://127.0.0.1:3249`: `photoDeliveryExclusionUi`, `photoDeliveryIntentUi`, `deliveryWizardUi`, `photoMarkerProvenanceUi`, `photoWorkspaceStacksUi`, `photoWorkspaceEditUi`: **58 passed, 0 failed, 0 skipped**. Log: `%TEMP%/foto-slice2-browser-final.log`.
- After final singular/plural copy corrections, rebuilt production and reran the two new exclusion browser tests: **2 passed, 0 failed, 0 skipped**. Log: `%TEMP%/foto-slice2-browser-copy-final.log`.
- Browser checks cover inspector and bulk commands, hidden/unselected confirmation, safe single-placement actions without confirmation, native checkbox keyboard use, focus containment/restoration, Escape, polite announcements, filtered select-all including a pinned non-matching row, exclude/filter/restore, unsafe line-link feedback, existing planning toggles, and explicit removal cancellation.
- Visually inspected selection and confirmation screenshots at **1280x720** and **1366x768**. Browser assertions check no horizontal overflow, modal containment and at least 80px of list height even with filters open. Evidence: `%TEMP%/foto-slice2-screenshots/slice2-selection-1280x720.png`, `slice2-selection-1366x768.png`, `slice2-confirmation-1280x720.png`, `slice2-confirmation-1366x768.png`.
- `git diff --check`: passed. Git emits line-ending conversion notices, not whitespace failures.

Failed attempts and corrections:

- Initial serial Node run failed the exact tools-menu expectation; the expected list now includes the requested action. Final regression passes.
- Early new browser checks found initial modal focus and Tab-boundary issues; explicit Cancel focus, wrapping and restoration were added. Harness corrections fixed a quoted selector and assertions against rows legitimately removed by the active filter. Existing tooltip-first Escape behavior was respected. Final browser checks pass.
- Screenshot review found crowding with filters open; bounded scrolling was added and verified at both laptop sizes.

Skipped and unverified:

- The 97 Node-selection skips include browser tests without their enabling environment and optional/private-corpus gates. The six relevant synthetic browser suites were separately enabled. No skip is counted as manual or real-file acceptance.
- No contractor corpus or Gemini recipient acceptance was performed. Real-file safety and recipient acceptance remain manual gates.
- Builds warned about old Browserslist data; Node emitted module-type warnings. Dependencies were not changed.

## Remaining issues and manual acceptance

- Combined/split export with linked exclusions is intentionally blocked until Slice 3. Line-link exclusion remains unsupported until a separately authorized slice. Standalone mode policy D3 is unchanged.
- Observed outside this slice: pressing Escape in the existing remove-from-layer confirmation left that dialog open. Explicit Cancel works and is exercised. The removal dialog and its removal-mode Escape branch were not repaired here; no baseline browser comparison was run, so this report does not claim a separately verified baseline failure. The new exclusion confirmation has its own passing Escape tests.
- The 50-photo workflow has synthetic Node coverage; large real-folder UI acceptance has not been performed.

Manual checklist:

1. Select photographs with repeated placements, including a filtered-out sibling. Confirm the listed objects and placement counts before excluding.
2. Use selected-placement exclusion, verify partial delivery, then restore the full photograph and individual occurrences.
3. Filter `Ikke med`, select all matching rows and restore. Confirm linked placements return to GMI and unlinked ones to GML; pinned non-matching rows must stay unchecked.
4. Try line-linked, missing-placement and stale-source photographs. Verify clear refusal and no partial changes.
5. Check keyboard-only selection, confirmation cancellation, focus restoration and scrolling at both laptop sizes.
6. Confirm combined/split export blocks with exclusions and resumes after restoration. Verify original files remain unchanged. Use explicit Cancel for the separate removal confirmation pending its keyboard follow-up.

## Git, isolation and publication

Branch/HEAD remain `feature/photo-workspace` / `c828733`. No staging, commits, pushes, deployments or Git ref changes. Existing repository Next servers and repository `.next` were left untouched. The isolated build used a dependency junction and webpack, following the documented Slice 1 Turbopack/junction limitation. Only the task's port-3249 server was started and stopped. Temporary build, logs and screenshots remain under `%TEMP%`.

Final tree contains the 15 tracked modifications, the three new application/test files above and this untracked report. These three original untracked reports remain untouched:

- `20261113-182754-rettinger-roadmap-reconciliation.md`
- `20261114-090612-foto-delivery-exclusion-plan.md`
- `20261114-160730-rettinger-export-ux-consolidation-plan.md`

Stopped after Slice 2. No Slice 3/4 export changes, legacy retirement or app-wide styling audit was implemented.
