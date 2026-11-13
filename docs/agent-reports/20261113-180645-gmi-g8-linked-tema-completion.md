# G8 completion: coordinated Tema/S_FCODE batch editing

Completed 2026-11-13, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, starting and finishing HEAD `04da5b8`. Starting working tree was clean. No staging, commits, branch changes, pushes or deployment.

## Scope and outcome

The general batch inspector offers one logical Tema choice when G1's schema evidence identifies the accepted Tema/S_FCODE pair. Both point and line geometries use their existing authoritative Validator domain. Selecting either physical key through the planner API coordinates the same pair; the UI offers it once.

The inspector retains the existing value controls, per-object findings, dataset dry run, confirmation dialog and editing registry. A details section shows both physical columns' immutable original and effective staged values per object, including disagreement. The table describes both current values when they disagree. Counts refer to objects rather than doubling the count for physical cells. All linked proposals require explicit confirmation, including proposals without any other risk reason.

Preparation followed root AGENTS.md, development/privacy/source-safety instructions, the available G1–G6 completion reports (including G5 D1/D2 and D3), and current implementation. No standalone G7 completion report was found; existing intent metadata is implemented and documented through G2/G6 and remains the source of truth. No new editing architecture or later milestone was introduced.

## Linked operation and safety decisions

- **Set:** the selected geometry-valid code applies to both columns. Disagreement is visible and may be deliberately resolved. An already-correct cell remains a no-op; its partner still changes, in the same logical object operation.
- **Replace:** both effective lexemes must equal the selected exact lexeme. Whitespace remains significant. Disagreeing pairs are omitted from the offered exact-match distribution, counted separately, and explicitly refused as replacement targets.
- **Clear:** consistent, nonempty pairs may be cleared together. Already-empty values remain inapplicable. Disagreeing pairs are refused; users can use Set to reconcile them. Intentional empty output goes through the Validator rather than being accepted as an authoritative Tema code.
- **Fill missing:** both original and effective cells must satisfy the existing missing-value rules. Disagreement, including different whitespace lexemes or disagreement in the originals, is refused rather than silently choosing a column.
- **Unavailable/unsafe partner:** both source cells and caller identity guards are resolved before a row is eligible. Duplicate/ambiguous column bindings and incomplete pairs fail closed. Manual applicability inclusion cannot bypass a technical refusal or ambiguous linked operation.
- **History/conflicts:** any earlier correction on either physical cell is a conflict for the whole object. Without replacement approval, both cells are skipped. With approval, the existing conflict policy applies to the coordinated request. No per-cell conflict skip may produce a partial linked operation.

The planner constructs explicit requests through `createGmiFieldChangeSet` and checks that every approved pair is accounted for as changed or unchanged, with no skipped cell. There is no single-column fallback. Original-only Tema or S_FCODE schemas retain their generic path. Identifier, reserved, unknown-field and ordinary G6 contracts remain unchanged; hydraulics still use genuine M2 eligibility tokens.

This milestone implements the requested general batch inspector path. It does not redesign the individual object form or remove legacy correction UI. Existing low-level APIs can still represent earlier individual corrections, which the linked planner reviews as conflicts.

## Preview, consent and FOTO

Per-object diagnostics receive both draft values together, followed by the existing verified full-dataset dry run. Tests demonstrate resolution of genuine `TEMA_CONFLICT`, changed Kumform requirements, Type/Tema incompatibility and hydraulic findings. No Validator rule or applicability policy changed.

Linked consent is an additional reason in the existing risk helper. Existing overwrite, manual inclusion, mixed profile, unknown/unvalidated field and new-FEIL gates remain intact. The exact ChangeSet, dry-run result, session, selection and proposal remain bound to approval. Browser tests reject stale selection consent and invalidate the preview after proposal changes. Undo/redo restore the coordinated correction together.

Verified FOTO ownership: `gmiPhotoSource.mjs` captures delivered parser attributes and lexical evidence; `loadedGmiSource.mjs` retains that original source evidence and File. Staging Rettinger corrections publishes a separate proposed dataset, without replacing FOTO's captured source. The regression stages a real registry correction, verifies proposed Tema changed, then checks FOTO still returns the identical original source, original Tema, reference records and original bytes.

The linked editor displays:

> FOTO bruker Tema fra originalfilen. Endringen påvirker ikke automatisk bildegrupperingen.

FOTO placement, decisions, serialization and M8–M10 engines were not changed.

## Exact changed files

Application:

1. `src/lib/gmiFieldBatchPlan.mjs` — paired preparation, diagnostics, exact-operation eligibility, atomic ChangeSet building and object counts.
2. `src/lib/gmiBatchInspectorView.mjs` — one logical option, mismatch explanation, paired table presentation, mixed-selection coverage and linked risk reason.
3. `src/components/gmi-edit/GmiBatchInspector.js` — linked values, warning, strict domain validation, pair-aware counts/conflicts and explicit consent.
4. `src/components/gmi-edit/GmiFieldValueInput.js` — optional strict-list presentation for linked batch Tema; ordinary and individual controls keep their existing default.

Tests:

5. `tests/gmiLinkedTema.test.mjs` — ten focused Node tests.
6. `tests/gmiLinkedTemaUi.test.mjs` — production Chrome workflow with four subtests, laptop screenshots and actual verified download.
7. `tests/gmiBatchReplaceClear.test.mjs` — replace the obsolete linked-refusal expectation with coordinated writes and byte verification; retain ordinary safety assertions.
8. `tests/gmiFieldBatchPlan.test.mjs` — remove only the superseded unsupported-Tema expectation; reserved/identifier/duplicate/unnamed refusals remain, with linked coverage in the new suite.
9. `tests/gmiFieldValueInputUi.test.mjs` — update the export helper to the accepted unified wizard; preserve all control, keyboard, safety and exact-byte assertions.

Documentation: this report and exactly six PNGs in `docs/agent-reports/assets/20261113-g8/`: `g8-editor-1280x720.png`, `g8-editor-1366x768.png`, `g8-linked-1280x720.png`, `g8-linked-1366x768.png`, `g8-confirm-1280x720.png`, `g8-confirm-1366x768.png`. No unrelated reports, dependencies, private fixtures or expected hashes changed.

## Verification

Passed:

- Focused Node: `node --test tests/gmiLinkedTema.test.mjs tests/gmiEditFields.test.mjs tests/gmiFieldBatchPlan.test.mjs tests/gmiBatchReplaceClear.test.mjs tests/gmiBatchRiskGate.test.mjs tests/gmiBatchInspector.test.mjs tests/gmiEditDryRun.test.mjs` — **75 passed, 1 skipped, 0 failed**.
- Full serial Node: `node --test --test-concurrency=1 "tests/*.test.mjs"` — **2,216 tests: 2,087 passed, 129 skipped, 0 failed**.
- Fresh production Chrome group, `PHOTO_UI_URL=http://localhost:3258`, serial `node --test --test-concurrency=1`: `gmiLinkedTemaUi`, `gmiBatchReplaceClearUi`, `gmiBatchRiskGateUi`, `gmiBatchInspectorUi`, `gmiBatchFieldValueInputUi`, `gmiFieldValueInputUi`, `gmiEditValidationUi`, `deliveryWizardUi` (all `.test.mjs` under `tests/`) — **61 passed, 0 failed, 0 skipped**.
- ESLint: `npx.cmd --no-install eslint` over all nine changed JS/MJS files — passed.
- `npm.cmd run build` — passed; existing outdated Browserslist database notice only.
- `git diff --check` — passed; Git reports the repository's expected LF-to-CRLF checkout notices.

Source safety tests independently index approved value spans and compare every intervening/trailing byte, reparse the output, and verify untargeted values, geometry, opaque sections and original bytes. Browser tests verify actual downloaded GMI, not just proposed in-memory attributes. Production M10 tests also cover existing source-integrity/download guards.

Resolved intermediate failures:

- The first full Node run had one source-wiring assertion failure after linked consent was temporarily added inline. Integrating it into the shared risk helper preserved the existing assertion unchanged. The final full run passed.
- The expanded browser run initially had three G5 subtest failures plus their parent. The first waited for removed `.gmi-edit-export`; the still-open unified modal disrupted later keyboard tests. At starting HEAD, `GmiExportDialog.js` already delegates to `DeliveryWizard`, while the G5 helper still expected the removed dialog. Updating only the helper to review → package → download resolved all three failures. Its isolated rerun passed **8/8**, then the final grouped run passed **61/61**. No production export behavior or meaningful assertion was weakened.

Skipped/unperformed:

- Focused skip: opt-in largest-private-corpus dry-run performance (`GMI_EDIT_CORPUS` unset).
- Full-suite skips retain existing opt-in/private/environment prerequisites; the new production UI test also skips without `PHOTO_UI_URL`. Required selected UI tests were separately enabled and passed as listed above.
- No private/contractor datasets were opened. Synthetic Chrome checks and screenshot inspection are not real-file acceptance.

The task-owned production server on port 3258 was stopped. Other existing servers were left alone.

## Screenshots and remaining acceptance

The editor, paired values/FOTO warning, and confirmation were captured at both required sizes. Screenshots were visually inspected for readable content and accessible scrolling; automated checks cover page overflow and confirmation bounds.

| View | 1280×720 | 1366×768 |
|---|---|---|
| Linked Tema editor | [Screenshot](assets/20261113-g8/g8-editor-1280x720.png) | [Screenshot](assets/20261113-g8/g8-editor-1366x768.png) |
| Physical values, disagreement and FOTO warning | [Screenshot](assets/20261113-g8/g8-linked-1280x720.png) | [Screenshot](assets/20261113-g8/g8-linked-1366x768.png) |
| Validator consequences and explicit confirmation | [Screenshot](assets/20261113-g8/g8-confirm-1280x720.png) | [Screenshot](assets/20261113-g8/g8-confirm-1366x768.png) |

No unresolved automated failure remains in the executed checks. Before real-file acceptance, locally exercise representative point/line files with both physical columns, disagreement and earlier staged corrections; review dependent findings and confirm the pair; undo/redo; export and independently inspect the intended spans. Also open FOTO from the same delivered file and verify the contextual warning and unchanged original grouping. Confirm that conservative replace/clear/fill refusal is understandable on whitespace-disagreeing pairs. These are remaining manual acceptance steps, not completed claims.

Column insertion, H5 removal, Validator-rule changes, individual-editor redesign and FOTO workflow changes remain outside this task. Work stops after G8.
