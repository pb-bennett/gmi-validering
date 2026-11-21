# Batch 1B.2B completion — FOTO integration and transfer safety

2026-11-21, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `8b0bf6d` (unchanged, local, not pushed). Continues [Batch 1B.2A](20261121-150000-hyperlink-transfer-batch1b2a-completion.md), [1B.1](20261121-123755-hyperlink-transfer-batch1b1-completion.md) and the [1A.2 pairing contract](20261121-095806-lok-top-pairing-review-batch1a2-completion.md) under Batch 1B of the [roadmap](20261120-154700-final-functional-reconciliation-release-planning.md). Working record: [progress](20261121-hyperlink-transfer-batch1b2b-progress.md). No subagents, private-corpus inspection, staging, commits, pushes, deployments, branch or dependency changes.

## Outcome and boundary

Existing FOTO and Rettinger consumers now understand an active «Flytt til punktobjekt» transfer, and FOTO refuses the actions that would invalidate one:

- **FOTO shows the proposed state.** While a verified transfer is active, the FOTO list, workspace map, main map and inspector show the moved occurrence on the recipient (Tema and identifier) at the recipient's GMI position, marked as Foreslått. The original owner and position stay visible in the inspector. Accepted FOTO records are not changed.
- **Conflicting FOTO actions are refused at the owner.** `photoSession` refuses writes that would change a protected photograph's delivery, placement, direction or occurrences, or the transfer's GMI source. Programmatic callers are refused like the UI. Unrelated photographs and actions stay available. Undo or discard in Rettinger lifts the lock.
- **The review now applies the transaction's rules.** «Avklart» is no longer reported for pairings the transaction would refuse because of an accepted alternative or manual position, or a missing FOTO occurrence.
- **Rettinger history shows a transfer as a photograph hyperlink transfer.** The entry shows the moved file, source → recipient, reference count, and its S_HYPERLINK cells (original against proposed). It is not shown as an empty field correction.
- **Validator readiness is covered by tests.** Foreslått contains the transferred hyperlink. Validator runs on that dataset. Undo and redo restore the previous and transferred results.
- **Still not user-reachable.** `PHOTO_LINK_REVIEW_WRITABLE` is `false`. There is no «Lagre endringer», no transfer command and no receipt. Every export path still refuses (`hyperlink-transfer-export-unsupported`). The transaction is reachable only from tests; the contract scan enforces this.

## 1. Ownership model (unchanged)

| Owner | Role in 1B.2B |
|---|---|
| Rettinger M2 history (`gmi-edit/session.mjs`, `editSessions.mjs`) | The only history owner. New read-only `registry.activeHyperlinkTransfers()` lists `{ layerId, handle, session, transferSet }` for opened, live sessions. It has no side effects: a session whose source is no longer live is skipped, not invalidated. FOTO guards and render-time code call it. |
| Transfer entry | Unchanged. It holds the proposed GMI and FOTO ownership, position and provenance together. |
| `photoHyperlinkTransferView` | Unchanged. It is the only source of proposed FOTO associations. |
| FOTO accepted state (`photoSession`) | Never written by a transfer. Records, assets, EXIF evidence, delivery decisions and the GMI source stay byte-identical (asserted in every new test). |

Nothing is synchronised manually, and there is no second history or delivery owner.

## 2. Files

**New (6):**

- `src/lib/photos/photoHyperlinkTransferEligibility.mjs`: the single accepted-position rule (`photoTransferPositionConflict`), with Norwegian texts. Shared by the review and the transaction.
- `src/lib/photos/photoHyperlinkTransferLock.mjs`: the error code `hyperlink-transfer-active` and the three lock explanations. It has no dependencies, so `photoSession` and the delivery helpers can use it without importing Rettinger.
- `src/lib/photos/photoHyperlinkTransferScope.mjs`:
  - `photoHyperlinkTransferScope`: which FOTO layer, GMI source and photographs are protected.
  - `bindPhotoHyperlinkTransferGuard`.
  - `photoHyperlinkTransferViews`: the verified views, cached per FOTO publication and session value.
  - `photoHyperlinkTransferPresentation`, `applyPhotoHyperlinkTransfer`: the presentation overlay.
  - `photoHyperlinkTransferLinkLayer`: the proposed ledger, used for «Koblinger» only.
  - `photoTransferObjectLabel`.

  It imports only `photoHyperlinkTransferView` from the transaction module.
- `src/components/photos/usePhotoHyperlinkTransfers.js`: per-layer views and presentation, recomputed on every FOTO and Rettinger publication.
- `tests/helpers/photoHyperlinkTransferFixtures.mjs`: the 1B.2A real-owner fixture, extracted unchanged so both suites share it.
- `tests/photoHyperlinkTransferIntegration.test.mjs`: 12 tests.

**Modified, library (12):**

- `src/lib/photos/photoSession.mjs`: the owner-level guard (§4), `setHyperlinkTransferGuard`, `getHyperlinkTransferLock`, `transferLocked` entries in `getLayerDelivery`, and no position options for locked photos.
- `src/lib/photos/photoHyperlinkReview.mjs`: the shared position rule, and the `photo-occurrence-missing` issue.
- `src/lib/photos/photoHyperlinkTransfer.mjs`: the same shared rule replaces the local distance check.
- `src/lib/photos/photoDeliveryChoice.mjs`: locked entries offer no change and give the lock text as the reason.
- `src/lib/photos/photoSpatial.mjs`, `photoMarkerPresentation.mjs`, `photoPresentation.mjs`: the overlay's `hyperlink-transfer` basis reads as GMI provenance, labelled «Foreslått: mottakerens GMI-posisjon (flyttet bildelenke)».
- `src/lib/photos/photoImportPresentation.mjs`: the source-lock read error.
- `src/lib/gmi-edit/editSessions.mjs`: `activeHyperlinkTransfers()`.
- `src/lib/gmiEditView.mjs`:
  - `isGmiHyperlinkTransferEntry`, `gmiChangeSetCells`, `gmiHyperlinkTransferSummary`;
  - cell views, summary and dependents read the transfer's S_HYPERLINK cells;
  - three Norwegian messages.
- `src/lib/store.js`: binds the guard to `gmiEditSessions` at start-up.

**Modified, UI (11):**

- `src/app/page.js`:
  - workspace overlay;
  - delivery entries refresh after a Rettinger undo or redo;
  - Edit mode shows no handle for a locked photograph, and the lock text appears in the command bar;
  - staging a change to a locked photograph is refused with a notice;
  - a refused save keeps the edit session;
  - the inspector receives `linkLayer`.
- `src/components/MapInner.js`: the main-map overlay for layers outside the workspace.
- `src/components/photos/PhotoWorkspaceInspector.js`:
  - new «Flyttet bildelenke» section: Foreslått eier/posisjon, Original eier/posisjon, Godkjent, lock text;
  - «· foreslått» source chip;
  - proposed «Koblinger»;
  - «Zoom til bildet» goes to the shown position;
  - no exclusion actions while locked.
- `src/components/photos/PhotoWorkspaceCollection.js`:
  - a «Foreslått: …» context and an accessible-name suffix;
  - the removal checkbox is disabled for locked photographs, with one lock note.
- `src/components/photos/PhotoDeliveryControls.js`: the lock is explained once, in the inspector section.
- `src/components/photos/PhotoEditCommandBar.js`: `lockedText` prop.
- `src/components/photos/PhotoLayerCard.js`: delete is unavailable, with the layer-lock tooltip.
- `src/components/photos/PhotoPositioningWizard.js`:
  - «Kontroller på nytt» and «Fjern kilde» are disabled for the transfer source, with a note;
  - locked position rows show the lock text;
  - a refused stage or save shows the session message.
- `src/components/gmi-edit/GmiChangeList.js`: `GmiHyperlinkTransferRows`, and the origin «Flytting av bildelenke».
- `src/components/gmi-edit/GmiChangeSetDetail.js`: transfer rows above the S_HYPERLINK cell table.
- `src/components/gmi-edit/GmiEditWorkspace.js`: undo/redo targets and «Vis i Foreslått» use the transfer cells.
- `src/components/gmi-edit/gmiEdit.css`: four scoped `.gmi-edit-transfer*` rules, using existing tokens and no new colour.

**Modified, tests (3):**

- `tests/photoHyperlinkReview.test.mjs`
- `tests/photoHyperlinkTransferTransaction.test.mjs`
- `tests/photoHyperlinkReviewUi.test.mjs`

All three are deliberate contract updates (§9).

`git diff --numstat`:

| File | + / − |
|---|---|
| photoSession | +135/−7 |
| gmiEditView | +47/−3 |
| page | +35/−8 |
| PhotoWorkspaceInspector | +29/−5 |
| GmiChangeList | +26/−7 |
| editSessions | +18/−1 |
| PhotoPositioningWizard | +11/−5 |
| MapInner | +9/−3 |
| PhotoWorkspaceCollection | +9/−2 |
| GmiEditWorkspace | +7/−5 |
| PhotoLayerCard | +7/−2 |
| photoHyperlinkReview | +7/−3 |
| photoDeliveryChoice | +6 |
| gmiEdit.css | +5 |
| GmiChangeSetDetail | +5/−2 |
| photoHyperlinkTransfer | +4/−11 |
| photoImportPresentation | +4 |
| PhotoEditCommandBar | +3/−2 |
| store | +3 |
| photoSpatial | +2 |
| PhotoDeliveryControls | +2/−1 |
| photoMarkerPresentation | +1/−1 |
| photoPresentation | +1 |
| tests: review | +12/−6 |
| tests: transaction | +12/−94 (the fixture moved to the helper) |
| tests: review UI | +2/−1 |

The five pre-existing status-only test paths still have no content diff.

## 3. FOTO consumers audited

| Consumer | Reads | 1B.2B treatment |
|---|---|---|
| Workspace list (`PhotoWorkspaceCollection`) | `workspacePhotos` (page) | Overlay. The moved occurrence's context reads «Foreslått: SLU · …», with an accessible-name suffix. |
| Workspace map markers (`MapInner` → `PhotoMarkersLayer`) | `photoWorkspace.photos` | Overlay. There is one marker per occurrence, at the recipient's GMI position, with «Plasseringskilde» GMI. |
| Main map, layers outside the workspace (`MapInner`) | `photoSession.getLayerPhotos` | Same overlay through the item getter. |
| Inspector, occurrence switcher, «Koblinger» | `workspacePhotos`, `gmiPhotoAssociations(layer)` | Overlay, plus the proposed link layer for «Koblinger» and the new Original/Foreslått section. |
| Viewer, Sources info, Completion hub, Export wizard (photos) | `workspacePhotos` / `effectiveWorkspacePhotos` | They receive the overlay through the same list. Export stays blocked. |
| Delivery pills, inspector toggle, list cycle button, exclusion actions | `getLayerDelivery` entries | `transferLocked`: unavailable, with the lock reason. The session refuses. |
| Edit mode (`PhotoEditLayer`, `PhotoEditCommandBar`) | the active photo | No handle and no centre/direction controls for a locked photo, with the lock text. Staging and saving are refused. |
| Positioning wizard | `getLayerPhotos` (accepted), `reviewSourceWorkflowPositions` | The transfer source cannot be rechecked or removed. Locked photographs get no position options. Stage and save are refused at the session. |
| Layer card delete, photo removal | `deleteLayer`, `removeLayerPhotos` | Unavailable in the UI, and refused at the session. |
| `PhotoMapController` locate / fit | accepted record | The inspector's locate passes the shown position. **Limitation:** «fit to layer» uses accepted positions, so a previously unplaced, now proposed photograph is not part of the fit. |
| Read-only pairing review (`PhotoHyperlinkReviewDialog`) | accepted photos/delivery, original source | Deliberately original: the transaction plans cumulatively from the original. **Limitation:** an active transfer's decisions are not shown in the review (needed in the writable workflow). |
| Delivery wizard (`DeliveryWizard`) | accepted photos | Unchanged. Every mode refuses while a transfer is active. |

## 4. Original and Foreslått

- **Original:**
  - the accepted record (`photoSession.getPhoto`), with the owner LOK and the accepted position or none;
  - the accepted ledger (`gmiPhotoAssociations(layer)`);
  - in the overlay, `hyperlinkTransfer.original = { occurrence, current }` and `originalGmiPosition`.
- **Foreslått (overlay, presentation only):**
  - `occurrence` = recipient `objectKey`/key/object (from the proposed GMI's re-derived source) and the output reference ids;
  - `spatial.current` = `{ position: recipient GMI position, basis: { kind: 'hyperlink-transfer', transferKey }, acceptance: 'user-approved-hyperlink-transfer', origin: 'gmi', provenance }`;
  - `hyperlinkTransfer.status = 'proposed'`.

  The overlay object is new for the moved occurrence only. Every other photo is the session object itself (asserted), so nothing is duplicated.
- **Shared photographs:** the moved occurrence moves. The photograph's other occurrence keeps its object, shows `status: 'sibling'`, and is locked.
- **Fail closed:**
  - `conflict` (FOTO changed after the commit), `invalid` and `unavailable` views are never shown as proposed: the original association is shown, with a Norwegian explanation naming Rettinger;
  - the lock remains;
  - undo in Rettinger is the way back.
- **Refresh:** the views are recomputed on every FOTO publication (`photoLayers`) and every Rettinger publication (`gmiEditStatus`). They are cached by the FOTO snapshot plus the exact session values, so the page and the map share one derivation.

## 5. Guarded actions and layers

Every protected write is refused in `photoSession`, the owner, whatever calls it. The error is `{ ok: false, error: 'hyperlink-transfer-active', message }`. Boolean and list APIs keep their shape: they return `false` or `[]`.

**What is protected.** "Protected" means every occurrence of a moved photograph (asset), plus the transfer's FOTO GMI source.

**Where the protection comes from.** The guard reads the scope from the registry at call time. If the guard throws, the layer fails closed.

| Action | Session layer | UI layer |
|---|---|---|
| GMI/GML/Ikke delivery (`setDeliveryIntent`, `setPhotoDeliveryExclusion`, `setCombinedDeliveryInclusion`) | Refused for changed protected occurrences | Toggles and pills unavailable, reason given. The toggle notice shows the session message. |
| Placement or direction (`applyPhotoEdits`, `acceptCandidates`, `applyPhotoPositioning`, wizard `commitSourceWorkflow` requests) | Refused (edits keep the session; `acceptCandidates` skips the photo) | No Edit handle; staging refused with a notice; wizard rows have no options |
| Recheck or rebind of the source (`recheckLayerSource`, `stageLayerSource` loaded or file recheck, `stageSourceWorkflowSource`, `applyGmiAssociations`, loaded-GMI import into the layer) | Refused | Wizard buttons disabled with a note. Read error text for a review error. |
| Remove the source (`stageSourceWorkflowRemoval`, `removeGmiSource`) | Refused | «Fjern kilde» disabled |
| A new source adding or changing occurrences of a protected photograph | Draft invariant: the stage trial and every `commitDraftMaps` compare protected sources, occurrences, accepted positions and delivery decisions by identity | Stage error |
| Remove photographs or assets (`removeLayerPhotos`, `removeLayerAssets`) | All or nothing: `[]` | Checkbox disabled, with a lock note |
| Delete the FOTO layer (`deleteLayer`) | Returns `false` | Delete icon unavailable, with a tooltip |
| Replace or remove the GMI survey layer | Existing Rettinger unsaved-changes guard (`gmi-edits-pending`): a transfer counts as changed cells. An explicit discard discards the transfer with the session. | Existing confirmation |

**Still available:** capture metadata and photographer, visibility, unrelated photographs (delivery, edits, positions, removal), adding unrelated sources, export dialogs (which refuse), and every Rettinger action including further corrections, undo, redo and discard.

## 6. Placement-rule alignment

`photoTransferPositionConflict` is used by both the review and the transaction. It checks every FOTO occurrence of the photograph:

- An **unplaced occurrence** never blocks.
- An accepted position passes only if it is **the source object's own GMI candidate**: candidate kind `gmi`, provenance `objectKey` and source fingerprint equal to the source, and within 0.01 m of the source's GMI position.
- On the moved occurrence itself, **anything else** blocks with `accepted-position`. This covers manual (even at the same point), EXIF, GML, and another object's GMI.
- **Another occurrence** that is placed blocks with `accepted-position-other` (shared photographs).

The previous review used distance only, and the previous transaction allowed any candidate within 0.01 m, such as an EXIF fix. Both now apply the stricter rule, so a near-zero distance is not permission.

The review also blocks `photo-occurrence-missing`: there is no FOTO occurrence on the source object, which the transaction already refused.

The messages tell the user to keep the link unchanged. No override workflow is added.

## 7. Rettinger history and Validator evidence

**History.**

- `gmiChangeSetCells(entry)` exposes the transfer's `hyperlinkCells` in the ordinary cell shape, so the existing change list, detail table, «Vis i Foreslått», undo/redo targets and dependents work.
- `gmiHyperlinkTransferSummary` gives one row per moved group, for example `SYNT_LOK_B.png: Punkt 293 → Punkt 108`, plus «1 bildereferanse flyttet · 2 punkter» and «bygger på N tidligere flyttinger» for cumulative entries.
- Ordinary corrections and the history order are unchanged.
- An earlier transfer superseded by a later cumulative one shows «Erstattet senere».

**Validator.** The test «Validator evaluates the actual Foreslått dataset» shows:

- the commit publishes once (the revision signal), and `registry.revision().hyperlinkTransfer` names it;
- Foreslått point 1 S_HYPERLINK contains the transferred file, and point 0 no longer does;
- the original layer data and bytes are unchanged;
- `revised` *is* `validateGmiDataset(proposed.dataset)` (the ordinary run; nothing is marked corrected);
- undo restores the previous Foreslått findings;
- redo restores the transferred findings at the same dataset revision.

The «Kontroller i Validator» button for transfers is not added: the staged-variant hook is never offered for transfer entries.

## 8. Verification

| Check | Result |
|---|---|
| Focused: integration 12, transaction 14, 1B.1 21, review 32 | **79 passed, 0 failed** |
| Neighbouring serial: `delivery*`, `gmiEdit*`, `gmiValidator*`, `hyperlinkFilenames`, `photo*`, `validatorDataTableSlice3` | First run: 1,239 passed, **2 failed**, 119 skipped. After the fix below: **1,241 passed, 0 failed, 119 skipped** |
| Full serial Node `node --test --test-concurrency=1 --test-reporter=tap "tests/*.test.mjs"` | **2,375 passed, 0 failed, 156 skipped** (2,531; 140.6 s) |
| Fresh isolated production build (`%TEMP%/gmi-1b2b-build`, `src/` identical by `diff -rq`, no `.env.local`, `npm run build -- --webpack`) | Passed (exit 0). Rebuilt after a final one-line `page.js` change, so the browser run used identical `src/`. |
| Complete serial production browser suite (same build, task-owned port 3191): `"tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"` | **487 passed, 2 failed, 11 skipped** (500; 608.4 s). Both failures are one subtest of `photoHyperlinkReviewUi` and its parent: a text assertion on the old review wording (below). |
| Focused production browser rerun after that assertion update: `tests/photoHyperlinkReviewUi.test.mjs` (same build and port) | **3 passed, 0 failed, 0 skipped**. The complete suite was not rerun: the change was a test-only string, and every other file was green in the complete run. |
| ESLint, all affected JS/MJS files | Exit 0, except `src/components/MapInner.js`: 8 errors and 4 warnings, the same count as at `HEAD` (checked with `git show HEAD:… \| eslint --stdin`). They are pre-existing `react-hooks/refs` errors and dependency warnings far from the edit. |
| `git diff --check` | Exit 0 (LF/CRLF notices only) |

**Failure found and fixed.** In the first neighbouring run, `photoGeminiCompatibility` «legacy2019/asbuilt52 retains … exact serialized bytes» failed: the GML checksums changed.

- **Cause:** my first `applyGmiAssociations` guard ran a trial association on copies before the real one. The trial drew extra occurrence ids from `createId`, so the real occurrences got different ids.
- **Fix:** the trial now runs only while a transfer protects the layer. Trial and write share one memoised occurrence-id function, so id consumption is identical to before.
- No expected hash was changed.

**Browser failure, classified.** `photoHyperlinkReviewUi` «FOTO choices remain temporary…» checked the old review text «annen akseptert plassering». The block still fires; its message is now the transaction's rule text («…akseptert plassering som ikke er dette punktobjektets GMI-posisjon…»). The assertion was updated to the new wording (§9.3).

**Skips.** The private-corpus, opt-in and next-dev suites stayed skipped (opt-in variables unset).

**Screenshots: not produced.** A transfer cannot be created in the running application: there is no UI path and no test hook. Adding a hook would make the transaction reachable and break the «no user-facing write entry point» contract. The FOTO proposed-state and history presentation are therefore verified by unit tests on the real owners and the presentation functions, not by captures. The browser suite verifies that FOTO and Rettinger without a transfer are unchanged. Captures belong to the writable workflow.

Logs (local, synthetic only), in this session's scratchpad: `neighbours.log`, `node-full.log`, `browser-full.log`; build log in `%TEMP%/gmi-1b2b-build/build.log`.

## 9. Deliberate contract changes

1. **`photoHyperlinkReview.test.mjs`** (3 tests: «independent pairings», «recipients that already contain hyperlinks», «a recipient that is itself a changing source»). Their «Avklart» moves used photographs with no FOTO occurrence on the source object, which the transaction refuses. The fixtures now give each photograph its unplaced occurrence on its source object (`occurrencesOn`). All assertions are unchanged.
2. **`photoHyperlinkTransferTransaction.test.mjs` wiring scan.** It now admits `photoHyperlinkTransferScope.mjs`, but asserts that its only import from the transaction module is `{ photoHyperlinkTransferView }` and that it names no write function. Every other `src/` file is scanned exactly as before. The fixture block moved to the shared helper without change.
3. **`photoHyperlinkReviewUi.test.mjs` wording.** The accepted-position check now looks for the new rule text instead of «annen akseptert plassering». The case still blocks and still shows the delivery conflict; only the message changed (§6).

## 10. Outstanding integration limitations

1. There are no captures of the proposed state (§8): no transfer can exist in the app yet.
2. `PhotoMapController` «fit to layer» and the delivery wizard use accepted positions (§3).
3. The read-only pairing review does not show decisions already committed in an active transfer.
4. **Proposed view of unplaced photographs.** A photograph that was unplaced appears placed (proposed) in the list, map and completion counts while the transfer is active. This follows from "recipient's GMI position".
5. A FOTO-side `conflict` can only arise from a write that bypassed the guard (or one made before it was bound). FOTO itself cannot resolve it; the only remedy is undo or discard in Rettinger.
6. **Edit mode lock scope.** It locks both position and direction of a protected photograph, although direction does not invalidate the transfer (§12).
7. **System lifecycle.** `associateLoadedGmiSource` and `reconcileLoadedGmiBindings` (system-driven rebinding or loss) are not user actions and are not blocked. Loss of liveness makes the view `unavailable` and keeps the lock.

## 11. Required Batch 1B.3 export-composition contracts

- **One combined planner** against the original: field edits, the active transfer entry's decisions, and M7 delivery removals, composed once (no second patch). Then lift `hyperlink-transfer-export-unsupported` in `exportGmi.mjs` and `deliveryPlan.mjs`.
- **GML** (photos-only, split, combined): moved occurrences at `proposedPosition`, with `user-approved-hyperlink-transfer` provenance. Sibling occurrences stay on their own objects. Attachment accounting for moved references.
- **Revision reimport.** The FOTO evidence of the revised file must equal `photoHyperlinkTransferView(...).proposedSource` associations. Occurrence keys carry the imported-source fingerprint (1B.2A §8.5), so re-derivation from revised bytes needs a key mapping decision.
- **Lock release.** After a verified export and download, decide whether the FOTO lock persists until the revision is reimported, or whether the transfer is folded into FOTO accepted state.
- **Recipient gate A5 / G4 Gemini trial** for appended wrappers and renumbered chain cells.

## 12. Real-data browser acceptance checklist (for when the writable workflow exists)

1. Load the authorized GMI and the FOTO layer. Commit LOK Punkt 293 → SLU Punkt 108. Record photo counts, accepted positions and delivery choices before.
2. In FOTO, check that:
   - the list row reads «Foreslått: SLU …»;
   - one marker sits on the SLU position (workspace and main map);
   - the inspector «Flyttet bildelenke» shows Foreslått/Original eier and posisjon and Godkjent;
   - «Koblinger» names SLU.
3. Try GMI/GML/Ikke, Edit mode (drag, centre, direction), «Kontroller på nytt», «Fjern kilde», removal and layer delete on that photograph. Each must be unavailable with the lock explanation. Repeat on an unrelated photograph: all available.
4. In Rettinger «Endringer», check that the entry reads «Flytting av bildelenke», the file Punkt 293 → Punkt 108 and «1 bildereferanse flyttet», and that «Vis detaljer» shows both S_HYPERLINK cells. Undo, redo and discard; FOTO must follow each step.
5. Open Validator on Foreslått. Check the S_HYPERLINK findings for both objects; nothing may be shown as corrected.
6. Try every export mode: each refuses with the Norwegian message.
7. Shared photograph and two transfers: the sibling stays, the second transfer is cumulative, and undo restores the first.
8. Check that all FOTO accepted state recorded in step 1 is unchanged after undo.

## 13. Decisions worth revisiting after user testing

1. **Proposed by default in FOTO.** FOTO shows Foreslått without an Original/Foreslått toggle; the original is in the inspector. A toggle matching Rettinger could be added.
2. **Lock granularity.** The lock covers the whole photograph (every occurrence) and both position and direction. It could be narrowed to the moved occurrence and to position only.
3. **Shared photographs.** Strict rule: another placed occurrence blocks a move (`accepted-position-other`).
4. **Strict GMI-only rule.** An EXIF or GML position at the same point now blocks. A future «replace accepted position» override would be explicit.
5. **Navigation.** The lock text names Rettinger; there is no direct «Åpne i Rettinger» link from FOTO.
6. **Recipient labels.** They use FOTO's `gmiObjectContext` (S_FCODE, Type, AnleggsID) plus «Punkt N». The review uses the V2 Tema resolution; the two could be unified.

## Git and process state

- Branch `feature/photo-workspace`, HEAD `8b0bf6d` unchanged; the staged diff is empty. Nothing was staged, committed, pushed, deployed, reset, restored, stashed or cleaned.
- Task changes: 6 new untracked files, 26 modified tracked files (§2: 23 application, 3 tests), this report and the progress record.
- The five pre-existing status-only test paths still have no content diff.
- The task-owned production server on port 3191 was started and stopped by this task (stopped by PID after the runs; the port has no listener). Pre-existing servers on 3110–3113 were not touched. The isolated build copy `%TEMP%/gmi-1b2b-build` (synthetic data only, no `.env.local`) remains as a local aid.
