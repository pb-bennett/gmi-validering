# G1 — Shared field capability and value domains: completion

Date: 2026-11-11, Europe/Oslo. Scope: G1 in §8 of [the architecture plan](20261111-092840-gmi-general-batch-editing-architecture.md), including its standing verification gate. No G2 or later implementation.

## Outcome and changed files

- `src/lib/validation-v2/fieldValueDomain.js`: frozen, cached domains from active Validator rules, authoritative table labels and field-information format/unit hints. Offered values exactly match each governing rule's allowed lexemes, in rule order. Comparison metadata retains EXACT/INTEGER_CODE_STRING and identifies SDR's numeric comparison without admitting alternative draft spellings. No duplicate code lists.
- `src/lib/gmiEditFields.mjs`: document-cached schema binding and source-column capability discovery for both geometries. Columns preserve parser names and positions, including duplicate and unnamed columns. Accepted direct/case/fallback bindings remain distinct from disabled aliases, recognized unresolved columns and unknown columns. Absent canonical fields are listed for their expected geometry only when binding state is FIELD_ABSENT. Unsupported source candidates get no authoritative input domain. Reserved prefixes, identifiers, document read-only state and facilityId have explicit refusal reasons. AnleggsID is marked individual-only in discovery; current individual editing remains available. Hydraulic and linked-Tema routing are metadata only; no new correction path exists.
- The same module provides the shared column predicate and draft check. Strict drafts uppercase suitable enumerations and require exact listed lexemes after normalization; unchanged delivered values can be preserved explicitly through `currentLexeme`. Existing encoding/delimiter/control-character checks still apply. Format hints do not validate or restrict date, numeric, year or text inputs.
- `src/lib/gmiEditView.mjs`: existing field policy delegates to the shared predicate. Individual form planning calls the shared draft checker with enumeration restrictions and case normalization disabled, preserving existing values, format acceptance, error messages and overwrite/replacement decisions.
- `tests/gmiEditFields.test.mjs`: nine regressions covering all enumerated rules, table labels, hints, strict drafts, original out-of-list values, every supported date spelling, encoding safeguards, source identity, geometry differences, linked Tema vs case-only columns, reserved/identifier/individual-only columns, duplicates, unresolved/disabled/unknown columns, absent fields, policy parity across every cell of the tracked synthetic GMI-edit corpus, immutable source bytes and caching on 20,000 synthetic objects.
- `tests/gmiRettingerSidebar.test.mjs`: adopted the plan's §10.1 recommendation to accept CRLF as well as LF in one source-contract assertion. No assertion semantics relaxed beyond line endings.

No changes to Validator rules, M1/M2 correction/staging/verification/export code, components, dependencies, fixtures, fixture hashes or manifests. Accepted date spellings `DD.MM.YYYY`, `YYYY-MM-DD` and `YYYYMMDD` remain unchanged. Source aliases never become accepted columns through this layer.

## Verification

Passed:

- `node --test tests/gmiEditFields.test.mjs`: **9 passed**, 0 failed/skipped.
- Focused editing gate (`gmiEditFields`, `gmiEditWorkspace`, `gmiEditChangeSets`, `gmiEditBatch`, `gmiEditValidation`, `gmiRettingerSidebar`): **59 passed**, 0 failed, 1 skipped in the earlier run before the final extra source-case regression. The final expanded gate below includes that additional passing regression.
- Final standing Node gate, using PowerShell-expanded file lists equivalent to the plan: `node --test tests/gmiRettingerSidebar.test.mjs tests/gmiLayerFilters.test.mjs tests/statusBrowsing.test.mjs tests/layerTableRows.test.mjs tests/tableSearch.test.mjs tests/objectTableInspection.test.mjs tests/gmiEdit*.test.mjs tests/gmiBatchInspector.test.mjs tests/gmiR4UxPolish.test.mjs tests/gmiValidatorEditing.test.mjs tests/validationV2Workspace*.test.mjs`: **224 tests, 212 passed, 3 failed, 9 skipped**. The required unchanged correction, batch and validation suites passed.
- `npx.cmd --no-install eslint src/lib/validation-v2/fieldValueDomain.js src/lib/gmiEditFields.mjs src/lib/gmiEditView.mjs tests/gmiEditFields.test.mjs tests/gmiRettingerSidebar.test.mjs`: passed. Used `.cmd` because PowerShell blocks the `npx.ps1` launcher.
- `npm.cmd run build`: passed on final application source with permitted network access for the configured Google Font. Existing Browserslist age warning remains; no dependencies changed.
- Fresh production server on verified free port 3137, `PHOTO_UI_URL=http://localhost:3137`, then `node --test --test-concurrency=1 tests/gmiEditWorkspaceUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/gmiEditValidationUi.test.mjs tests/gmiValidatorEditingUi.test.mjs tests/gmiLayerFiltersUi.test.mjs tests/gmiEditSelectionUi.test.mjs tests/gmiBatchInspectorUi.test.mjs tests/gmiR4UxPolishUi.test.mjs tests/gmiEditBatchUi.test.mjs tests/layerDataTableGeometryUi.test.mjs tests/layerDataTableKeyboardUi.test.mjs tests/gmiRettingerSidebarUi.test.mjs`: **87 passed**, 0 failed/skipped. Covers individual corrections, hydraulic batches, draft guards, source identity, undo/redo and byte-preserving exports. Ran Chrome with permitted access outside the sandbox. Inspected generated `m4-rettinger-1280x720.png` and `m4-rettinger-1366x768.png`; inspector, scrolling, table, history and footer controls remain usable.
- `git diff --check`: passed.

Failed checks and evidence:

- The standing Node gate has three existing `validationV2WorkspaceInspector.test.mjs` source-contract failures: normal sidebar width, workspace shell upper/bottom layout, and 2D/3D page wiring. Independently materialized that test and all of its source inputs directly from HEAD with `git show` into a temporary directory, then ran it there: **4 passed, the same 3 failed**. No G1 files are read by these failing tests. This establishes the baseline rather than relying on historical counts. Left unrelated assertions unchanged.
- Initial sandboxed build could not download Roboto from Google Fonts; network-enabled builds passed. Initial sandboxed browser run timed out on the first suite after about 60 seconds and was interrupted; the complete permitted retry passed all 87 tests. These attempts are separate from the successful final checks.

Skipped / not run:

- The nine skipped cases in the standing Node invocation include browser tests without `PHOTO_UI_URL`; the separately configured production browser gate subsequently had no skips.
- No full serial repository suite: G1's specified standing gate was run; the plan requires the full repository gate for G2/G8. No private/reference corpus or real-delivery manual acceptance was run. Synthetic tests and screenshots do not establish real-file acceptance. G1 specifies no manual acceptance step.

Logs are local temporary artifacts: `%TEMP%/gmi-g1-fields-final.log`, `gmi-g1-focused-final.log`, `gmi-g1-gate-final.log`, `gmi-g1-head-baseline.log`, `gmi-g1-browser-final.log`. Screenshots are in `%TEMP%/gmi-g1-screenshots/`.

## Performance, deviations and remaining work

On 10,000 synthetic points plus 10,000 synthetic lines, isolated first capability discovery measured **20.16 ms**, followed by **0.41 ms** for 1,000 cached point reads plus first line description. In the concurrent final Node/build gate the same measurements were 54.74 ms / 0.67 ms. Timing covers binding/discovery after source-document creation, not parsing. Scope results reuse the same document binding and object identity. These are synthetic observations, not a private-corpus performance claim.

One early new test incorrectly expected Bredde to be absent despite a delivered recognized-unresolved DIM candidate. Corrected the test to preserve the existing binding distinction: unresolved is not FIELD_ABSENT. No binding policy changed.

The optional fourth draft-check argument exposes the G1 compatibility switches and explicit unchanged-current-value exception; default calls are strict. Future editors must supply currentLexeme from their trusted effective cell when keeping an original value. G2+ planners, UI controls, applicability decisions, previews and linked writes remain unimplemented as requested.

## Git and process state

Started and finished on `feature/photo-workspace`, HEAD `1d2903675272c9121c40b013546e4608281ab445`. Initial tree contained exactly the three untracked planning reports named below; all were preserved without edits:

- `20261111-085500-gmi-validator-rettinger-unified-workflow-planning.md`
- `20261111-092840-gmi-general-batch-editing-architecture.md`
- `20261111-093345-agents-instructions-proposal-DRAFT.md`

Final task changes are the five implementation/test files above and this report. No stage, commit, push, synchronization or Git ref change. Both production server instances started for verification were stopped; port 3137 no longer listens. No other processes were stopped.
