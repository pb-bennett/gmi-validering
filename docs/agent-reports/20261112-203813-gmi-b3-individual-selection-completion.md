# B3 — Individual editing of a selection: completion

Date: 2026-11-12, Europe/Oslo. Branch `feature/photo-workspace`; starting HEAD `38f13d03a686326ab5a4eba548da2a2d98ec6312`. Starting working tree was clean.

## Outcome and scope

Implemented «Rett én og én» in the batch inspector. It opens the ordinary individual editor on the first selected object in source order. A sticky navigation bar supplies «Forrige», «Neste», «Objekt X av N i utvalget» and «Tilbake til utvalget». Initial keyboard focus moves to the selection position. First/last boundaries disable the appropriate buttons.

The existing `select()` path still owns object navigation, table synchronisation and active map highlighting. The existing workspace draft guard protects entry from an unfinished batch, movement between objects and return to the batch inspector. Cancellation leaves the object, draft and selection untouched; explicit discard resets only the unfinished form. No field or value is chosen automatically and nothing is staged automatically.

`GmiObjectEditor` is reused unchanged, including its ordinary correction creation, review, overwrite/new-error approval, staging and Validator-return actions. Each object creates its own ChangeSet. No correction engine, Validator rule, source-byte path, export path or eligibility policy changed. H5 was not implemented.

The committed B1, B2, H3 and H4 completion reports provided context. Implementation was checked against current selection, batch inspector, individual editor, draft guard and handoff code.

## Implementation decisions

- The itinerary validates through `gmiSelectionTargets()` and sorts a copy of the targets numerically by source index. It never sorts or writes the selection itself.
- Individual mode retains the selection's source binding, excluding editing revision. Staging/undo/redo therefore preserve source identity; a different session binding cannot reuse the itinerary.
- Each movement rechecks current membership after any draft confirmation. Invalid, empty or stale selections disable navigation. If the current object is removed from membership, the editor stays on that object and explains how to return; no replacement object is silently selected.
- Selection keys, checkbox membership, host, origin, H3/H4 handoff provenance and selection map halos are not mutated by B3. The current object uses the existing active highlight.
- Points and non-hydraulic fields have the individual alternative. The batch inspector explains that SDR/Trykklasse/Ringstivhet batch editing applies only to lines and that individual-only fields belong in the object form. It also explains that missing/locked fields remain unavailable. Existing supported general-field batch editing remains available under G4/G5 policies; B3 does not remove those capabilities or expand unsupported ones.
- Returning opens the batch inspector for the current selection. Any unfinished form must first pass the existing guard. Batch configuration is rebuilt empty, without automatic values or approvals; staged corrections remain in the working copy. B1/B2 profiling and gates use their existing paths.
- The navigation bar remains visible while the individual editor scrolls. It uses existing controls and design tokens.

## Changed files

- `src/components/gmi-edit/GmiEditWorkspace.js`: individual mode, guarded entry/return and navigation through `select()`; editor reused in place.
- `src/components/gmi-edit/GmiBatchInspector.js`: alternative action and availability explanation.
- `src/components/gmi-edit/gmiEdit.css`: compact sticky navigation and alternative-action spacing.
- `src/lib/gmiBatchInspectorView.mjs`: pure validated source-order itinerary helper.
- `tests/gmiIndividualSelection.test.mjs`: identity/order/boundary/refusal and independent ChangeSet coverage.
- `tests/gmiIndividualSelectionUi.test.mjs`: synthetic production-browser workflow.
- This report. Task files retain CRLF line endings.

## Verification — passed

1. `node --test tests/gmiIndividualSelection.test.mjs tests/gmiBatchInspector.test.mjs tests/gmiBatchRiskGate.test.mjs tests/gmiSelectionProfile.test.mjs tests/gmiValidatorSelectionHandoff.test.mjs tests/gmiValidatorEditing.test.mjs tests/gmiEditWorkspace.test.mjs tests/gmiEditSelection.test.mjs tests/gmiFieldBatchPlan.test.mjs tests/gmiEditValidation.test.mjs`: **114 passed, 0 failed, 0 skipped**. The B3 test was rerun after adding line-order and replacement-session cases: **1 passed**.
2. `node --test tests/gmiEditBatch.test.mjs tests/gmiEditChangeSets.test.mjs tests/gmiEditDryRun.test.mjs tests/gmiEditSessions.test.mjs tests/gmiEditFields.test.mjs tests/gmiEditValidationPolish.test.mjs tests/gmiEditProduction.test.mjs`: **87 passed, 0 failed, 2 skipped**.
3. ESLint: `npx --no-install eslint` on all five changed/new JS/MJS files: **passed, no warnings or errors**.
4. `npm run build`: **passed**, fresh production build after the final source change.
5. Final serial production browser run: **74 passed, 0 failed, 0 skipped**, using `PHOTO_UI_URL=http://localhost:3198` and `GMI_EDIT_SCREENSHOT_DIR=%TEMP%/gmi-b3-screenshots`. Command: `node --test --test-concurrency=1` with `gmiIndividualSelectionUi`, `gmiSelectionProfileUi`, `gmiBatchRiskGateUi`, `gmiValidatorSelectionHandoffUi`, `gmiValidatorReturnUi`, `gmiEditWorkspaceUi`, `gmiEditDraftGuardUi`, `gmiEditValidationUi`, `gmiFieldValueInputUi`, `gmiBatchInspectorUi` (all under `tests/`, suffix `.test.mjs`). An earlier nine-suite run also passed **73/73**.
6. `git diff --check`: **passed**. New test/report files were also checked for trailing whitespace.

New browser coverage: five points selected out of order in Validator, exact H3 handoff, source-order stepping, first/last boundaries, two separate reviewed/staged corrections and unchanged other objects, dirty batch cancellation on entry, dirty individual Next/Previous/return cancellation, explicit draft discard, retained membership and five map halos, current table row following navigation, returning to the batch context, removed-current-object refusal, and H4 return to the originating point field on Foreslått. Original synthetic input bytes remain unchanged and no browser runtime exceptions occur.

Screenshots at **1280×720** and **1366×768** were inspected after the final build. Navigation is pointer reachable, the editor scrolls, selected rows and map halos remain visible, and the page has no horizontal overflow.

## Failures and corrections

- **Baseline, separately reproduced:** `node --test tests/validationV2WorkspaceInspector.test.mjs` gives **4 passed, 3 failed**: normal sidebar width; shared workspace-shell placement; map/3D resize source contracts. They assert `src/app/page.js`, which is unchanged from starting HEAD. These are the same failures named in the committed B1/B2 reports; the direct reproduction is the evidence, rather than relying on those reports alone.
- **Implementation iteration, resolved:** the first B3 browser run found navigation scrolled out of view after staging focused the result. Fixed with the sticky bar. The final complete browser gate passes. Visual inspection also prompted existing bordered-button styling for Previous/Next.

## Skipped, not run and remaining acceptance

- Two optional private-corpus checks skipped because `GMI_EDIT_CORPUS` is unset (M2 corpus correction and largest-file dry-run performance). No private or contractor corpus was opened.
- Full `tests/*.test.mjs` and development Strict Mode were not run. Verification targeted editing/source safety and the requested B1/B2, H3/H4 and individual-editor workflows.
- Browser acceptance used synthetic files. Real-delivery manual acceptance remains unperformed. Session replacement/stale bindings are covered by Node refusal cases; current-object membership removal is also exercised in the browser.
- No known B3 failures remain in the executed checks. Existing field/source restrictions still apply to individual editing.

## Git and resources

No staging, commit, push, branch switch or ref changes. HEAD remains the requested starting commit. The only changed/untracked files are the seven task files listed above.

Task-owned production server on free port 3198 was stopped between builds and at completion. Existing listeners on 3110–3113 were left alone. Logs: `%TEMP%/gmi-b3-build.log`, `gmi-b3-node.log`, `gmi-b3-safety.log`, `gmi-b3-browser-final.log`, `gmi-b3-ui.log`, and server logs. Screenshots: `%TEMP%/gmi-b3-screenshots/` (B3) and `%TEMP%/gmi-b3-gate-screenshots/` (earlier regression run).
