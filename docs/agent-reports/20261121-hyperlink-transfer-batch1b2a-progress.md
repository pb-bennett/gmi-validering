# Batch 1B.2A progress record — internal hyperlink-transfer transaction (working draft)

Branch `feature/photo-workspace`, starting HEAD `bb28bda`. Five status-only test paths pre-existing; not touched.

## Status

- [x] Repo/branch/HEAD verified; reports 1B.1, 1A.2, roadmap read.
- [x] Investigate ownership: Rettinger M2 session/history, ChangeSet, proposed revision, FOTO session/occurrences/delivery, Validator datasets.
- [x] Design and implement transaction.
- [x] Tests.
- [x] Verification: full serial Node 2,363/0/156; build passed; full browser 489/0/11 (port 3190, stopped); eslint 0; diff --check 0.
- [x] Completion report: 20261121-150000-hyperlink-transfer-batch1b2a-completion.md.

## Notes

### Findings (investigation done)

- Only history owner: M2 session (`session.mjs`: ordered `changeSets` + `redo`, LIFO undo/redo); registry `editSessions.mjs` publishes once per transition. `S_HYPERLINK*` reserved for ordinary edits at build/stage/compile.
- FOTO (`photoSession.mjs`) has no undo/redo; occurrences keyed `[originalSourceFingerprint, objectKey, assetId]`; FOTO GMI source must equal imported bytes (binding verification, delivery snapshot fingerprint match). Rewriting FOTO records/source would break those invariants and need a second history -> not allowed.
- Decision: transfer = new entry kind `gmi-hyperlink-transfer-set` in the M2 history (cumulative: last active set holds the complete verified plan vs. original). FOTO side stored in the entry as verified data and re-derived from the proposed GMI; FOTO accepted maps untouched (delivery owner untouched).
- `compileGmiEffectiveEdits` fails closed while a transfer is active (M7 removal, 1B.1 planner session basis, unknown consumers). New `compileGmiProposedEdits` feeds proposed state (composed field + transfer, independently verified).
- Exports (field export, delivery plan all modes) fail closed with `hyperlink-transfer-export-unsupported` while a transfer is active.

### Implementation log
- session.mjs: transfer set kind, create/stage, cumulative effective transfer, compile fail-closed, compileGmiProposedEdits, revision, cell/summary views. Done.
- proposed.mjs: composes + independently verifies transfer each computation. Done.
- editSessions.mjs: commitHyperlinkTransfer (one publish, rollback), revision(), commitFault seam. Done.
- exportGmi.mjs / deliveryPlan.mjs (+ Norwegian message in deliveryWizard.mjs): fail closed. Done.
- New gmi-edit/hyperlinkTransferCommit.mjs; new photos/photoHyperlinkTransfer.mjs (commit, basis, adapter, view). Smoke OK.
- Next: tests/photoHyperlinkTransferTransaction.test.mjs; update gmiEditProduction import inventory.
- Tests: tests/photoHyperlinkTransferTransaction.test.mjs 14/14 pass. Contract updates: gmiEditProduction inventory (+hyperlinkTransferCommit.mjs), 1B.1 wiring scan excludes the FOTO transaction module (its own non-wiring contract is in the new suite). Norwegian messages added for the export block (gmiEditView, deliveryWizard).
- Fixed: listGmiEditCells order regression (kept field order; stable merge by object).
- Neighbour suites 384 pass / 0 fail / 5 skip; eslint exit 0.
- Observation: a later cumulative commit re-plans from the original, so wrappers previously appended to a recipient may be reordered (source-object order). Decision item.
- Running: full serial Node; then isolated build at %TEMP%/gmi-1b2a-build, browser on port 3190.
