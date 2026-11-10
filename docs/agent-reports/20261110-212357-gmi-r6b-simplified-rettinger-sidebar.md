# R6B — Simplified Rettinger sidebar

Date: 2026-11-10, Europe/Oslo. Branch: `feature/photo-workspace`. Starting and final HEAD: `e25e3ac`; working tree initially clean. No commit, push or deployment was performed.

Rettinger now has **Filter** (default) and **Endringer (n)**. The separate Objekter list is removed. Object browsing/search, geometry, row activation and selection use the existing Data Table; editing remains in the right inspector. Header/status, full validation, history, confirmation dialogs, footer, export and the legacy Masseendringer modal remain available.

## Files changed

| File | Change |
| --- | --- |
| `src/components/gmi-edit/GmiEditWorkspace.js` | Removes ObjectList, paging, search, separate scope and changed-only state, derived list membership and unused imports. Defaults to Filter and renders only Filter/Endringer. Keeps object requests, guarded selection, history navigation and inspector/modal wiring. |
| `src/components/gmi-edit/GmiObjectEditor.js` | Updates the empty-inspector instruction to point to a Data Table row. No editing logic change. |
| `src/components/LayerDataTable.js` | Small Rettinger-only source-GUID search addition to its existing optional identity matcher; ordinary table search, shared row derivation and selection rules remain unchanged. |
| `src/components/gmi-edit/gmiEdit.css` | Removes list-only controls, rows, search, geometry and changed-pill selectors. Retains shared check, empty-state, history-padding and inspector styles. |
| `tests/helpers/gmiTableNavigation.mjs` (new) | Test navigation through actual table geometry buttons and source-index row clicks. Does not call store requests or reset filtering behind the test's back. |
| `tests/gmiRettingerSidebar.test.mjs` (new) | Focused source contract for two tabs, removed list/state/styles and preserved guarded navigation/components. |
| `tests/gmiRettingerSidebarUi.test.mjs` (new) | Production workflow: default tabs, entry geometry, GUID lookup, single-object staging, Endringer/detail navigation, table modes, undo/redo, draft cancellation, table reopening and all three layout sizes. |
| `tests/gmiEditWorkspaceUi.test.mjs`, `tests/gmiEditDraftGuardUi.test.mjs`, `tests/gmiEditValidationUi.test.mjs` | Replaces retired list navigation with actual Data Table navigation; retains source identity, field values, confirmation, draft, history and export assertions. |
| `tests/gmiValidatorEditingUi.test.mjs` | Uses a table row to return to individual editing after the integrated Validator correction. Exact-target, origin-lock, staging, inspection and history assertions remain. |
| `tests/gmiLayerFilters.test.mjs`, `tests/gmiLayerFiltersUi.test.mjs` | Updates the R6A intermediate-list assertion to require its absence. Shared Tema/Felt, visibility-independent selection/preview and basis checks remain. |
| `tests/gmiR4UxPolishUi.test.mjs` | Removes the obsolete list-number assertion; table number/search/sort/virtualisation checks remain. |
| `tests/layerDataTableGeometryUi.test.mjs` | Uses the single Data Table geometry context and checks Filter is initially selected. Filter-driven empty geometry still cannot auto-switch. |
| This report and `assets/20261110-gmi-r6b/` | Completion record and three production screenshots. |

## Removed versus preserved functionality

| Retired list capability | Integrated path |
| --- | --- |
| Separate Punkter/Ledninger selector | Data Table geometry buttons, plus R6A's synchronised Felt tabs. |
| Object-number/context/attribute search | Existing Data Table search and exact object-number matching. |
| Top-level source GUID search | Small necessary replacement described below. |
| Bare objekter med rettinger | Existing **Kun endrede** view. |
| Per-object navigation button | Data Table row click or keyboard Enter; Endringer object links also remain. |
| List paging | Existing virtualised Data Table with keyboard Home/End and row navigation. |
| List that ignored table filters/search | Adjust/reset the shared filters, clear table search and use Original/Filtrert visning when browsing all objects. No competing unfiltered list remains. |

The inspection found one genuine search gap: the old list searched `object.guid`, while the table's generic attribute search does not include a GUID stored outside attributes. The existing Rettinger-only identity matcher now also matches source GUID text, case-insensitively. Full GUID and nonnumeric fragments work. Numeric-only queries retain the table's existing object-number behavior rather than suddenly matching every GUID containing those digits. No GUID is copied into attributes, parsed differently, edited or serialized. The ordinary application's attribute search is unchanged.

The Data Table owns entry geometry: an existing per-layer choice is retained; a fresh layer defaults to Ledninger when lines exist, otherwise Punkter. R5 corrections still explicitly pin Ledninger through the existing correction context. There is no replacement local geometry state.

Closing the Data Table does not strand navigation: the existing **Åpne datatabell** header tool becomes available and reopens it without losing the active inspector object. The new browser test exercises this path.

## Preserved safety and workflow

Row requests still pass through `select` and the established draft guard. Cancelling a different-object request preserves the current object and its typed value. Endringer object links/details retain their existing guarded navigation, and undo/redo still reveal the appropriate source object. Checkbox membership and row inspection remain separate operations.

R3 membership, Bare valgte and geometry restrictions, R4 preview/staging/manual override/risk semantics, and R5 exact targets and Validator-origin restrictions were not changed. R6A's shared Tema/Felt components, layer filter ownership, controlled geometry and cached Original/Foreslått dataset basis were not changed. Existing single-object staging no longer resets a list-only changed filter that no longer exists; its correction construction/staging is unchanged.

There are no changes to the store, shared row-derivation module, selection reducer, Validator correction preparation, Validator rule logic, GMI parser/source identity, M1/M2/M3 engines, serialization, source-byte preservation, FOTO, Gemini WFS or map-click selection. `GmiBatchDialog` and all existing confirmation/draft-discard dialogs remain.

## Verification

| Gate | Result |
| --- | --- |
| Relevant Node gate | **215 tests: 203 pass, 3 known baseline failures, 9 skips.** New R6B contract and updated R6A tests pass. |
| Serial production-browser regression gate | **81/81 pass**, including parent tests. |
| New R6B production-browser workflow | **6/6 pass**, including parent; no runtime exceptions and unchanged input file bytes. |
| Targeted ESLint, changed source/test files | **0 errors**, one existing TanStack `react-hooks/incompatible-library` warning. |
| `npm run build` | **Pass:** compilation, TypeScript and static generation. |
| `git diff --check` | **Pass**, ordinary LF/CRLF notices only. |

Node command:

```powershell
node --test tests/gmiRettingerSidebar.test.mjs tests/gmiLayerFilters.test.mjs tests/statusBrowsing.test.mjs tests/layerTableRows.test.mjs tests/tableSearch.test.mjs tests/objectTableInspection.test.mjs tests/gmiEdit*.test.mjs tests/gmiBatchInspector.test.mjs tests/gmiR4UxPolish.test.mjs tests/gmiValidatorEditing.test.mjs tests/validationV2Workspace*.test.mjs
```

Production build served with `next start` on port 3123, using `PHOTO_UI_URL=http://localhost:3123`:

```powershell
node --test --test-concurrency=1 tests/gmiEditWorkspaceUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/gmiEditValidationUi.test.mjs tests/gmiValidatorEditingUi.test.mjs tests/gmiLayerFiltersUi.test.mjs tests/gmiEditSelectionUi.test.mjs tests/gmiBatchInspectorUi.test.mjs tests/gmiR4UxPolishUi.test.mjs tests/gmiEditBatchUi.test.mjs tests/layerDataTableGeometryUi.test.mjs tests/layerDataTableKeyboardUi.test.mjs
node --test tests/gmiRettingerSidebarUi.test.mjs
```

The three Node failures are the unchanged, documented `validationV2WorkspaceInspector` source-contract baseline: sidebar width, workspace-shell composition and map/3D resize composition. No new regression remains in the executed gates. The full repository suite was not rerun for this slice.

The 87 passing production tests cover keyboard/virtualised row navigation, single-object edits, exact identity through geometry/filter/view changes, multi-selection, R4 batch/exclusions/manual risk/staging, R5 handoff and conversion restrictions, shared filters, Endringer details, undo/redo, source-safe export, legacy modal compatibility and existing draft guards.

Logs in `%TEMP%`: `r6b-node.log`, `r6b-build.log`, `r6b-eslint.log`, `r6b-browser-gate.log`, `r6b-sidebar-ui-final.log`.

## Layout and remaining issues

The new test checks **1280×720**, **1366×768** and **1920×1080**, asserting no page/sidebar horizontal overflow, usable scroll-body height, reachable footer and working Filter/Endringer navigation. All three final screenshots were opened and visually inspected. The right inspector retains its established internal scrolling at laptop heights; it was not redesigned.

- [1280×720](assets/20261110-gmi-r6b/r6b-filter-1280x720.png)
- [1366×768](assets/20261110-gmi-r6b/r6b-filter-1366x768.png)
- [1920×1080](assets/20261110-gmi-r6b/r6b-filter-1920x1080.png)

No unique necessary navigation capability remains missing after the GUID replacement. This is automated verification with synthetic data, not real-delivery/manual browser acceptance of R5/R6A/R6B. The known Node baseline failures remain. R7 modal retirement, R8 map-click selection and additional Validator-selection features remain deferred.

## Combined manual acceptance checklist

1. Import a real GMI at 1366×768. Enter Rettinger: **Filter** must be selected, **Endringer** must be available, and no Objekter list, independent object search or extra geometry selector may remain. Confirm status, full validation, undo/redo, legacy Masseendringer and export controls remain.
2. Use shared Tema/Felt filters and explicit table geometry. An empty filter result must keep the chosen geometry. Felt must follow the Data Table. Leave/re-enter and confirm filters and explicit geometry are retained.
3. Search by source object number, attributes and a full source GUID in the table. Activate a row with mouse and keyboard Enter. Confirm the right inspector shows the correct source object, fields and exact values. Switch to another geometry and inspect a point, then return to lines.
4. Type an unsubmitted edit, click another table row, then cancel the draft-discard dialog. Confirm the original object/value remain. Approve/discard only when ready. Close the table and reopen it through the header tool without losing inspector context.
5. Stage a reviewed single-object correction. Open **Endringer (n)**, use its object link and **Vis detaljer**, then **Vis i Foreslått**. Confirm Original remains unchanged, proposed values are correct, and undo/redo still work. Check the Filter basis and Felt value counts under Original/Foreslått/Kun endrede.
6. Select multiple table objects; change filters without changing membership. Use **Bare valgte**, **Rediger valgte**, calculate and review the batch preview, exclude an object and explicitly apply. Confirm the remaining exact changes appear in Endringer and the proposed dataset. Exercise risk confirmation when applicable.
7. Open Validator on **Original** for a supported missing-value finding. Its **Vis** action must remain inspection-only. Choose **Lag retting…** and confirm Rettinger has Filter/Endringer, exactly the prepared targets selected, Bare valgte enabled, the integrated inspector open, the recommended field, empty correction value and no automatic preview/staging.
8. While Validator origin is active, attempt row/select-all/range widening and confirm it is refused. Deselect a target, enter a suitable value, calculate, review and explicitly approve the remaining objects. Check Foreslått and undo/redo. Separately test deliberate **Gjør om til vanlig utvalg**: membership must stay unchanged until normal selection actions are used.
9. Smoke-test the ordinary footer **Masseendringer** modal and source-safe export. Confirm the original file is untouched. R7 retirement is not part of this slice.
10. Repeat the essential Filter → table selection/navigation → inspector edit → Endringer flow at **1280×720** and **1920×1080**, including scrolling to later Felt values, table reopening and one keyboard-only pass.
