# Batch 1B.2A completion — internal hyperlink-transfer transaction foundation

2026-11-21, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `bb28bda` (unchanged, local, not pushed). Continues [Batch 1B.1](20261121-123755-hyperlink-transfer-batch1b1-completion.md) and the [1A.2 pairing contract](20261121-095806-lok-top-pairing-review-batch1a2-completion.md) under Batch 1B of the [roadmap](20261120-154700-final-functional-reconciliation-release-planning.md). Working record: [progress](20261121-hyperlink-transfer-batch1b2a-progress.md). No subagents, private-corpus inspection, staging, commits, pushes, deployments, branch or dependency changes.

## Outcome and boundary

A «Flytt til punktobjekt» transfer is now an **internal, atomic, undoable transaction** recorded as **one entry in the existing Rettinger (M2) history**:

- **Atomic.** Everything is planned, composed and verified against immutable values. Only the final step writes live state, and that step is a single session-value swap in the registry, published once. A failure while publishing restores the previous session.
- **Undoable.** Undo, redo and discard of that one entry restore or reapply the GMI hyperlinks and the FOTO transfer state together.
- **Not user-reachable.** No component, store or page imports the transaction (a contract test scans `src/`). `PHOTO_LINK_REVIEW_WRITABLE` stays `false`. There is no «Lagre endringer», save button, executable transfer or wizard action.
- **Exports fail closed** in every delivery mode while a transfer is active (`hyperlink-transfer-export-unsupported`), and plans captured earlier become stale. Export composition is Batch 1B.3.
- **The original stays immutable.** The imported GMI bytes and the FOTO accepted state (records, assets and EXIF evidence, GMI source, delivery decisions) are never modified by a transfer.

## 1. Transaction ownership: findings

| Owner | Evidence | Consequence |
|---|---|---|
| Rettinger history | `gmi-edit/session.mjs`: an immutable session value with ordered `changeSets` and a `redo` stack; LIFO undo/redo; `stateKey` = ordered entry ids. `editSessions.mjs` holds one value per layer and publishes once per transition (`onChange` → store). | **The only history owner.** The transfer must be an entry in this history. A second stack is not allowed. |
| Reserved column | `changeSet.mjs` / `session.mjs`: `S_HYPERLINK*` is refused for ordinary edits at build, stage and compile. | Unchanged. The transfer entry owns only its hyperlink cells and ordinary ChangeSets never touch them, so the two never overlap. |
| Proposed revision | `proposed.mjs`: one M1 plan → splice → verify against the **original**, cached per `effectiveKey`. Validator, Data Table and dry-run read it through `registry.proposed`. A new status object per publication drives refresh (`gmiProposedViewForStatus`). | The transfer joins the proposed copy here. The existing publication is the refresh signal. |
| FOTO occurrences | `photoSession.mjs::planGmiAssociations`: an occurrence is keyed `[source fingerprint, objectKey, assetId]`; the FOTO GMI source must stay byte-equal to the imported file (`verifiedGmiBinding`; the delivery snapshot requires `fingerprint === document.fingerprint`); a recheck re-derives occurrences from the stored source ledger. FOTO has **no undo/redo** (only per-workflow drafts and a capture-time undo token). | **Precise limitation.** Rewriting FOTO records or replacing the FOTO GMI source with proposed bytes would break binding verification, delivery source matching and recheck (the next recheck would recreate the source occurrence). Coupled undo would need a second history. The FOTO accepted model therefore **cannot safely store** a proposed-only ownership change. |
| FOTO delivery | `photoDeliveryIntent.mjs` + `photoSession.mjs` `deliveryDecisions`; snapshot `stateKey`. | Untouched. It is read as eligibility evidence only. |
| Validator data | Original = `layer.data`; Foreslått = `registry.proposed(handle).dataset` (its own `datasetRevision`). | Recomputes on the proposed dataset after a transfer. Nothing is marked resolved. |

**Decision implemented.** The transfer is a new entry kind, `gmi-hyperlink-transfer-set`, inside the M2 history:

- **Cumulative.** The entry holds a complete verified plan, made against the original document, of every active transfer decision. The effective transfer state is therefore exactly the last active transfer entry.
- **FOTO record inside the entry.** The FOTO ownership, recipient position and provenance are stored in the same entry (`photo`). A view derived from the proposed GMI exposes them.
- **No partial state.** Because FOTO state and GMI state live in one entry, no half-applied state can exist.

## 2. File inventory

New:

- `src/lib/gmi-edit/hyperlinkTransferCommit.mjs`: pure preparation (cumulative plan → independent check → unstaged entry → candidate session → composed, verified proposed state).
- `src/lib/photos/photoHyperlinkTransfer.mjs`: the transaction (`commitPhotoHyperlinkTransfer`), basis capture, review adapter, and the FOTO view of the proposed state.
- `tests/photoHyperlinkTransferTransaction.test.mjs`: 14 tests on the real owners.
- This report and the progress record.

Modified:

- `src/lib/gmi-edit/session.mjs`:
  - transfer entry kind, create/stage;
  - cumulative effective transfer;
  - `compileGmiEffectiveEdits` fails closed;
  - `compileGmiProposedEdits`, `gmiSessionEffectiveKey`, `gmiSessionRevision`, `activeGmiHyperlinkTransferSet`;
  - redo provenance; discard guard;
  - cell, list and summary views.
- `src/lib/gmi-edit/proposed.mjs`: composes field and transfer edits and runs the independent transfer verifier on every computation.
- `src/lib/gmi-edit/editSessions.mjs`:
  - `commitHyperlinkTransfer` (stale guard, one publication, rollback);
  - `revision(handle)`;
  - `commitFault` test seam;
  - the effective key now includes the transfer.
- `src/lib/gmi-edit/exportGmi.mjs`: field export and readiness fail closed.
- `src/lib/gmi-edit/index.mjs`: barrel exports.
- `src/lib/delivery/deliveryPlan.mjs`: every mode fails closed and earlier snapshots become stale.
- `src/lib/delivery/deliveryWizard.mjs`, `src/lib/gmiEditView.mjs`: one Norwegian fail-closed message each (unreachable until 1B.2B).
- `tests/gmiEditProduction.test.mjs`: the import inventory adds `hyperlinkTransferCommit.mjs` with gmi-edit-only imports.
- `tests/gmiEditHyperlinkTransfer.test.mjs`: the 1B.1 wiring scan exempts exactly the FOTO transaction module, which reaches the planner only through gmi-edit. The new suite enforces that nothing in the application calls the transaction.

Untouched: the five pre-existing status-only test paths (no content diff).

## 3. Interface contracts

All of these are internal, and none is imported by application code.

**`commitPhotoHyperlinkTransfer({ registry, handle, photoSession, photoLayerId, transfers, expected, label?, now?, fault? })`**

- `transfers`: new explicit decisions in the 1B.1 planner shape. `photoHyperlinkTransferDecision(reviewDecision, source)` maps a resolved review decision; it returns `null` without an explicit recipient.
- `expected` is required and comes from `photoHyperlinkTransferBasis(owners)`: `{ documentFingerprint, photoSourceId, photoSourceFingerprint, sessionStateKey, photoBasisKey }`. Any difference returns `stale-basis` with the differing keys.
  - `photoBasisKey` covers the FOTO delivery snapshot `stateKey`, the layer members, the sources and their liveness, the source ledger edges, and each record's occurrence and accepted position.
- Stages: `context` → `basis` → `plan` → `photo` → `compose` → `verify` → `recheck` → `commit`.
- Returns `{ ok: true, transferSetId, newTransferKeys, transfers (FOTO record), revision }`, or `{ ok: false, stage, code, blockers? | rejections? | detail? }`.
- Any thrown error returns `transaction-failed` at its stage.

**`photoHyperlinkTransferView(owners)`**: a read-only FOTO view of the proposed state. `status` is one of:

- `none`;
- `current`: verified, and FOTO still matches the record;
- `conflict`: FOTO changed after the commit, and consumers must fail closed;
- `invalid`: the proposed state or its FOTO evidence does not verify;
- `unavailable`.

Fields: `occurrences[]` (recipient `objectKey`/`occurrenceKey`, `proposedPosition`, `provenance`, `originalPosition`, `originalGmiPosition`, delivery), `proposedSource` (FOTO evidence re-derived from the proposed bytes, with its ledger), `conflicts`, `revision`.

**gmi-edit:**

- `planGmiHyperlinkTransferCommit(session, { photoSource, transfers, photoState, expectedBasis })`.
- `buildGmiHyperlinkTransferCommit(session, prepared, { photo, label, createdAt, cache? })`.
- `compileGmiProposedEdits(session)`.
- `gmiSessionRevision(session)` → `{ stateKey, effectiveKey, hyperlinkTransfer: { transferSetId, planKey, transfers } | null }`.
- `registry.commitHyperlinkTransfer(handle, { session, transferSet })`.
- `registry.revision(handle)`.
- `createGmiHyperlinkTransferSet` and `stageGmiHyperlinkTransferSet` are deliberately not in the barrel.

**Entry shape (`kind: 'gmi-hyperlink-transfer-set'`)**: frozen, ChangeSet-compatible fields (`id`, `label`, `origin: 'photo-hyperlink-transfer'`, `basis.stateKey`, `cells: []`, `counts`).

- `basis` adds `documentFingerprint`, `photoSourceId`, `photoSourceFingerprint` and `previousTransferSetId`.
- `hyperlinkCells`: original and proposed lexeme, removed and added references.
- `edits`: one per S_HYPERLINK cell; `expected` is the original lexeme.
- `planKey`, `decisions` (the verifier contract), `transfers`, and the `photo` record.

## 4. GMI and FOTO state before and after a transfer

The primary case: LOK Punkt 293 → SLU Punkt 108. The synthetic file has a LOK with three wrappers, two of them carrying `sign:`, an SLU with one link, and a KUM.

| | Before | After commit | After undo | After redo |
|---|---|---|---|---|
| History | `[]` | `[cs-1 (transfer)]` | `[]`, redo `[cs-1]` | `[cs-1]` |
| Original bytes | the imported file | identical | identical | identical |
| Proposed LOK S_HYPERLINK | A, B, C (original) | `h:1(A sign) h:2(C)` | original | as after commit |
| Proposed SLU S_HYPERLINK | `h:1(SLU_1 sign)` | `h:1(SLU_1 sign) h:2(B sign:"Feltmåler A")` | original | as after commit |
| FOTO accepted state (records, positions, EXIF/capture metadata, files, sources, delivery `stateKey`) | X | X (byte-identical serialization) | X | X |
| FOTO view | `none` | `current`: B owned by SLU; position = SLU GMI geometry; provenance `hyperlink-transfer` / `user-approved-hyperlink-transfer` with `approvedAt`; original position kept; delivery `keep-link`, unchanged | `none` | `current`, same record |
| Re-derived FOTO evidence of the proposed bytes | B on LOK | B on SLU only, with the predicted output reference ids | B on LOK | B on SLU |
| Exports | allowed | blocked in all modes | allowed (byte-identical no-op) | blocked |

## 5. Coupled undo/redo: implementation and evidence

- **Undo/redo is unchanged code.** The transfer entry is an ordinary history entry, so `undoGmiEdit` and `redoGmiEdit` move it like any ChangeSet. Redo keeps its `stateKey` provenance check, now through a shared provenance lookup.
- **One owner for both states.** The FOTO transfer state is recorded inside the same entry, and the GMI state is derived from the active entry. Both therefore change in the same transition, and no intermediate state is ever published.
- **Cumulative entries.** A later transfer commit includes every earlier active decision unchanged; otherwise it is refused with `transfer-history-mismatch`. Undoing the later entry returns exactly to the earlier one.
  - Discarding an earlier transfer entry while a later one exists is refused (`transfer-set-has-later-transfers`).
  - Discarding the last transfer entry keeps later ordinary corrections.
- **Ordinary corrections:**
  - Earlier corrections survive undo of the transfer.
  - Later corrections compose with it (`fieldEditCount` 2 plus 2 hyperlink cells), are undone in LIFO order, and survive a discard of the transfer entry.
- **Evidence:** tests «several transfers…» (two commits, four transfers, a chain and two recipients; undo/redo both; identical `effectiveKey` after redo), «ordinary Rettinger corrections…», and «LOK Punkt 293…».

## 6. Stale, rollback and failure-injection tests

- **Stale basis.** A GMI correction made after the basis was captured gives `stale-basis` with `['sessionStateKey']`. An unrelated FOTO delivery choice gives `['photoBasisKey']`. A missing basis gives `expected-basis-required`. A forged or copied handle gives `invalid-handle`. A FOTO source no longer live-bound gives `photo-source-not-live-bound`. None of these creates a history entry or a publication.
- **Change during the transaction.** A correction staged between verification and commit (injected at `recheck`) is caught (`recheck` / `stale-basis`). Only that ordinary correction remains.
- **Thrown failures.** A throw at each of `context`, `plan`, `photo`, `compose`, `verify`, `recheck` and `commit` leaves the identical session value, no publication and identical FOTO state.
- **Publication failure.** A throw while publishing (registry `commitFault`) returns `commit-failed`. The previous session is restored and republished, the proposed state is identical, and a clean retry succeeds.
- **Forged entry.** An entry with the right structure whose recipient gets a different photograph than its decisions say is accepted structurally, but the proposed state refuses it on every computation (`verify-transfer`). The FOTO view reports `invalid`. Structural forgeries (an edit outside S_HYPERLINK, a wrong predecessor) are refused at build time.
- **FOTO change after commit.** A delivery change on the transferred photo after the commit makes the view report `conflict` (`photo-delivery-changed`). Undo returns to `none`.

## 7. Verification

| Check | Result |
|---|---|
| Focused `node --test tests/photoHyperlinkTransferTransaction.test.mjs` | **14 passed, 0 failed, 0 skipped** |
| Neighbouring suites, serial: delivery\*, gmiEdit\*, gmiValidator\*, hyperlinkFilenames, photoDelivery\*, photoHyperlink\*, validatorDataTableSlice3 (27 files) | **384 passed, 0 failed, 5 skipped** (after the fixes below) |
| Full serial Node `node --test --test-concurrency=1 --test-reporter=tap "tests/*.test.mjs"` | **2,363 passed, 0 failed, 156 skipped** (2,519; 168.7 s) |
| Fresh isolated production build (`%TEMP%/gmi-1b2a-build`, `src/` identical by `diff -rq`, `npm run build -- --webpack`) | Passed (exit 0) |
| Complete serial production browser suite (same build, task-owned port 3190): `"tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"` | **489 passed, 0 failed, 11 skipped** (500; 661.8 s) |
| ESLint, 13 affected JS/MJS files | Exit 0, no diagnostics |
| `git diff --check`; trailing-whitespace scan of the new files | Exit 0 (LF/CRLF notices only) |

**Why the complete browser suite was run.** The touched paths are shared runtime editing and export code: session effective state, changed-cell listing, the proposed state, and delivery liveness. No UI changed.

**Failures found and fixed during development (first neighbouring run):**

1. `gmiEditWorkspace` «messages: every export failure … has Norwegian text» failed. The new export failure code had no message. A Norwegian fail-closed message was added in `gmiEditView.mjs`, and the delivery wizard got one too.
2. `gmiEditWorkspace` «Data Table proposed view …» failed. A regression: `listGmiEditCells` re-sorted field cells without their column position. Field order is now kept exactly, and transfer cells join by object only when a transfer is active.
3. Two deliberate contract updates: the gmi-edit import inventory and the 1B.1 wiring scan (see §2).

One neighbouring "failure" was a malformed test-file argument of my own (`tests/` passed as a file), not a test result; the next run was correct.

**Skips.** The private-corpus, opt-in and next-dev suites stayed skipped (opt-in variables unset). Synthetic automation is not real-file or recipient acceptance.

Logs (local, synthetic only): `%TEMP%/b2a/node-full.log`, `%TEMP%/b2a/browser-full.log`, `%TEMP%/b2a/neighbours.log`, `%TEMP%/gmi-1b2a-build/build.log`.

## 8. Unresolved ownership and export conflicts

1. **FOTO accepted state is not rewritten.**
   - The transferred ownership and position exist in the history entry and in `photoHyperlinkTransferView`, not in the FOTO records. Existing FOTO surfaces (map, inspector, delivery pills, the photos-only GML) still show the original association until 1B.2B consumes the view.
   - The FOTO actions that can still change a transferred photo (delivery pills, Edit mode, source recheck or removal, photo removal) are not guarded by the transfer. The view detects the change (`conflict`) and every export is blocked, but the guard itself is missing.
2. **Exports are blocked, not composed.** While a transfer is active, every delivery mode and the field-only export refuse with `hyperlink-transfer-export-unsupported`. Batch 1B.3 must:
   - compose transfers, field edits and M7 delivery removals once against the original, in one combined planner;
   - emit the GML for the recipient position;
   - lift the block.
3. **Cumulative re-planning order.** A later commit re-plans every active decision from the original. Incoming wrappers follow the 1B.1 source-object order, so a wrapper appended by an earlier commit can change position or ordinal on that recipient: D1 moved from `h:1` to `h:2` when an earlier-numbered source's photo joined the same recipient. This is deterministic and verified, but it is a user-visible ordering decision (see §9).
4. **Accepted-position rule is stricter than the review.** The transaction blocks any accepted position that is not this occurrence's GMI candidate within 0.01 m of the source position; manual placements block even at the same point. The 1A.2 review checks distance only. Shared photos whose other occurrence is placed at its own object also block, as in the review.
5. **The transferred occurrence key keeps the imported-source fingerprint** (`[sourceFingerprint, recipientKey, assetId]`), consistent with FOTO keying. A future FOTO re-derivation from revised bytes (for example a revision reimport) would carry a different fingerprint.

## 9. Requirements for Batch 1B.2B (writable UI)

- **Commit path.** Map resolved «Flytt» decisions with `photoHyperlinkTransferDecision`. Capture `photoHyperlinkTransferBasis` when Kontroll opens. «Lagre endringer» calls `commitPhotoHyperlinkTransfer` with that basis, shows the saved receipt from the result, and discards the draft on cancel or close (wizard contract). Present `stale-basis`, blocker and `transaction-failed` explanations in Norwegian.
- **Rettinger change list and undo.** Render the transfer entry: label, objects, and `hyperlinkCells`. The `cells: []` shape means current UI rows would show no field values. The undo tooltip already uses the entry label.
- **FOTO surfaces.** Consume `photoHyperlinkTransferView` in map, inspector and stack while `current`, using its revision signal (`registry.revision`, published status). Treat `conflict` and `invalid` as fail-closed states with an explanation. Decide whether the FOTO actions in §8.1 must be blocked while a transfer is active, or should invalidate it explicitly.
- **«Kontroller i Validator».** Open the Foreslått dataset: it already includes the transfer and has its own `datasetRevision`. Findings are recomputed, never marked resolved.
- **Decisions needed:**
  - append order across separate commits (§8.3);
  - alignment of the accepted-position rule (§8.4);
  - GML/Ikke outcomes stay separate immediate delivery writes (not in this transaction), as instructed.
- **Activation.** `PHOTO_LINK_REVIEW_WRITABLE` may be enabled only together with the above.

## 10. Requirements for Batch 1B.3 (export / Gemini acceptance)

- **Combined planner.** One planner over the original: field edits, the active transfer entry's decisions, and M7 delivery removals.
  - Today M7 with a session fails closed (`session-not-compilable` ← `hyperlink-transfer-active`). The combined planner must use `compileGmiProposedEdits` and compose the removal on the transfer basis without a second patch.
- **Packages.** Recipient positions in the GML (photos-only, split and combined); attachment accounting for moved references; the revision filename. Then lift `hyperlink-transfer-export-unsupported` in `exportGmi.mjs` and `deliveryPlan.mjs`.
- **Revision reimport.** The FOTO evidence of the revised file must equal `photoHyperlinkTransferView(...).proposedSource` associations.
- **Recipient gate A5 / G4-style trial.** Appended wrappers and renumbered chain cells open on the chosen object in Gemini. Original photo checksums are unchanged. Geometry is intact.

## 11. Remaining manual acceptance

- Nothing in this stage is user-visible, so there is no manual UI acceptance yet. Real-file acceptance of the transaction needs the 1B.2B UI.
- Synthetic tests do not replace real-data trials (Punkt 293 → SLU on the authorized file) or recipient gate A5.

## Git and process state

- Branch `feature/photo-workspace`, HEAD `bb28bda` unchanged; the staged diff is empty. Nothing was staged, committed, pushed, deployed, reset, restored, stashed or cleaned.
- Task changes:
  - 3 new untracked source/test files;
  - 10 modified tracked files (`git diff --numstat`: session +234/−12, editSessions +37/−3, proposed +23/−4, deliveryPlan +24/−1, index +12, exportGmi +5, deliveryWizard +1, gmiEditView +1, gmiEditHyperlinkTransfer test +6/−2, gmiEditProduction test +4/−1);
  - this report and the progress record.
- The five pre-existing status-only test paths still have no content diff.
- The task-owned production server on port 3190 was started and stopped; the port has no listener. Pre-existing servers on 3110–3113 were not touched. The isolated build copy `%TEMP%/gmi-1b2a-build` (no `.env.local`, synthetic data only) remains as a local aid.
