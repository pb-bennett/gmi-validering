# Batch 1B.3A completion — export composition, reimport and delivery verification

2026-11-21, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `dfde0bc` (unchanged, local, not pushed). Continues [Batch 1B.2B](20261121-180000-hyperlink-transfer-batch1b2b-completion.md), [1B.2A](20261121-150000-hyperlink-transfer-batch1b2a-completion.md) and [1B.1](20261121-123755-hyperlink-transfer-batch1b1-completion.md) under Batch 1B of the [roadmap](20261120-154700-final-functional-reconciliation-release-planning.md). Working record: [progress](20261121-hyperlink-transfer-batch1b3a-progress.md). No subagents, private-corpus inspection, staging, commits, pushes, deployments, branch or dependency changes.

## Outcome and boundary

- **Every delivery mode now composes an active «Flytt til punktobjekt» transfer** instead of refusing it: Kun GMI, Kun GML med bilder, Delt levering and Samlet levering. `hyperlink-transfer-export-unsupported` is gone from every mode.
- **One plan against the original.** Field corrections, the active transfer's decisions and M7 GML/Ikke removals are planned once against the immutable imported GMI. Each S_HYPERLINK cell gets one edit, and the field edits join the same M1 call. Nothing patches exported or proposed bytes again.
- **Independent verification on the exact bytes.** The transfer verifier now also takes the delivery removals as contract input. It runs on the exported bytes in every GMI mode, and so does a re-derived FOTO association check. It never reads the plan's lexemes.
- **Fail-closed preconditions.** A transfer is exported only while its FOTO view is `current`, and the re-plan must reproduce the committed transfer. Each other unsafe combination has its own refusal code (§4).
- **Still internal.** `PHOTO_LINK_REVIEW_WRITABLE` is `false`. There is no «Lagre endringer» and no transfer command, and no new history. The scans enforcing this are unchanged and pass.
- **Recipient acceptance is not claimed.** Composed GMI deliveries carry the warning `gemini-a5-transfer-unverified` and no longer the M7 «importtestet i Gemini VA» note. **Status: A5 acceptance pending** (§9).

## 1. Export ownership traced before editing (observed)

| Concern | Owner | Fact relevant to composition |
|---|---|---|
| UI entry | `DeliveryWizard` → `captureDeliverySnapshot` / `buildDeliveryPlan` (`delivery/deliveryPlan.mjs`) | The only caller of the GMI export. `GmiExportDialog` and `PhotoExportWizard` are adapters to it. |
| Kun GMI | `gmi-edit/exportGmi.mjs::buildGmiFieldExport` | Bytes = M2 proposed state (`registry.proposed`). |
| M2 proposed | `gmi-edit/proposed.mjs` | `compileGmiProposedEdits` = field + transfer edits, one M1 `editGmiFields`. The transfer verifier runs on every computation (cached by effective key). |
| Transfer | Last `gmi-hyperlink-transfer-set` entry (`session.mjs`) | Cumulative decisions, cells, edits, `photo` record. `compileGmiEffectiveEdits` fails closed while it is active. |
| M7 removal | `gmi-edit/hyperlinkRemoval.mjs` | Plan/apply/verify for GML/Ikke removals. Its verifier assumes removals only. |
| Transfer planner / verifier | `gmi-edit/hyperlinkTransfer.mjs` / `hyperlinkTransferVerify.mjs` | The removal half is M7 itself, so one M7 run can carry extra selections. |
| FOTO delivery | `photoDeliveryIntent.mjs::buildPhotoDeliverySnapshot` | `removalSelections` = GML (`transfers`) + Ikke (`exclusions`) occurrences. Moved photographs are locked at «Beholdes i GMI» on every occurrence, so they never enter a combined/split GML. |
| GML | `photos/export/photoExportPlan.mjs` + `photoExportXml.mjs` (Gemini legacy2019) | It works from a frozen FOTO snapshot (`capturePhotoExportSnapshot`) of accepted positions. |
| Attachments | `delivery/deliveryAttachments.mjs` | Retained = source references minus removed. GML-only assets get planned names around the reserved paths. ZIP: `deliveryPackage.mjs`. |
| Liveness | Snapshot `isLive`: same session value, intact source, FOTO snapshot, delivery `stateKey` | 1B.2A: any transfer → not live. |
| Wiring scans | `photoHyperlinkTransferTransaction`, `gmiEditHyperlinkTransfer` tests | Outside `lib/gmi-edit/`, no file may name the planner/verifier or import the transaction module. The scope module may import only the view. |

The delivery planner, the FOTO delivery owner and the M2 history remain the only owners. No second planner, delivery owner or history was introduced.

## 2. Files

**New (3):**

- `src/lib/gmi-edit/deliveryComposition.mjs`: `planGmiDeliveryComposition` / `applyGmiDeliveryComposition`, `GMI_TRANSFER_RECIPIENT_PENDING`. Gmi-edit imports only.
- `src/lib/delivery/deliveryRevision.mjs`: `deriveRevisionPhotoSource`, `verifyRevisionAssociations` (revised-GMI ledger check and occurrence mapping).
- `tests/photoHyperlinkTransferExport.test.mjs`: 12 tests.

**Modified, library (8):**

| File | Change |
|---|---|
| `gmi-edit/hyperlinkTransfer.mjs` (+72/−8) | Optional `request.removals` and `acceptedAssetIds` join the single M7 removal half. Removal-only cells keep M7's lexeme. `removal-overlaps-transfer`. `deliveryRemovedReferences`. Plan keys and counts are unchanged when `removals` is absent. |
| `gmi-edit/hyperlinkTransferVerify.mjs` (+32/−4) | `contract.removals`: checked against the original; expected = original − moved − removed + incoming; total = before − removed. |
| `gmi-edit/exportGmi.mjs` (+40/−8) | The attestation `hyperlinkTransfer: { transferSetId, planKey }` is required while a transfer is active (`hyperlink-transfer-unverified` without it). The verifier is re-run on the exact exported bytes. `summary.hyperlinkTransfer`. Readiness option. |
| `gmi-edit/index.mjs` (+10) | Barrel exports. |
| `delivery/deliveryPlan.mjs` (+165/−32) | Transfer discovery, the signature-based liveness check, the verified FOTO view, the per-mode composition, the photos-only overlay, revised-GMI checks and accounting. |
| `delivery/deliveryWizard.mjs` (+15/−1) | Norwegian fail-closed messages, the A5 warning text, the «Flyttede bildelenker» summary row and the report section. |
| `gmiEditView.mjs` (+4/−1) | Messages for the field-export codes. |
| `photos/photoHyperlinkTransfer.mjs` (+9/−2) | A `current` view also exposes `planning` (the live source by reference, the planner's FOTO facts as derived at commit, the assets) and `planKey`. It stays read-only. |

**Modified, tests (4):** These are deliberate contract updates (§10).

- `tests/photoHyperlinkTransferTransaction.test.mjs`
- `tests/photoHyperlinkTransferIntegration.test.mjs`
- `tests/gmiEditProduction.test.mjs`: inventory gains `deliveryComposition.mjs`, gmi-edit imports only.
- `tests/helpers/photoHyperlinkTransferFixtures.mjs`: optional `eol`, `encode` and `note`. The defaults are byte-identical to before.

The five status-only test paths still have no content diff.

## 3. Combined planner and verifier contracts

**`planGmiDeliveryComposition(session, { photoSource, photoState, removals, includeFieldChanges, acceptedAssetIds })`**

1. It requires an M2 session with an active transfer (`no-active-transfer` otherwise; sessions without a transfer keep the unchanged M7 path). It also requires an editable, intact document, and a FOTO source with the transfer's id and fingerprint (`transfer-source-mismatch`).
2. It calls `planGmiHyperlinkTransfer(original, { transfers: <committed decisions>, removals, photoState, … })`. There is one M7 run for moved groups and delivery removals together:
   - a cell that loses moved references, loses GML/Ikke references and receives moved references is composed once from the original lexeme;
   - recipients append after the retained (renumbered) wrappers, which is the 1B.1 order and ordinal policy;
   - a cell touched only by delivery removals takes the M7 lexeme unchanged.
3. **Re-plan identity.** The planned transfers (key, source, recipient, reference group) must equal the committed entry. Without delivery removals, the S_HYPERLINK edits must equal the committed edits byte for byte (`transfer-replan-mismatch`).
4. **Field edits.** These are the session's effective field edits (none for split). An edit on S_HYPERLINK, or one that shares a cell with a hyperlink edit, is refused (`field-edit-overlaps-hyperlink`). The reserved-column guard is unchanged.
5. **Overlap.** A removal of a transferred occurrence or reference is refused (`removal-overlaps-transfer`, plus M7's `reference-claimed-twice`). Every planner blocker passes through: grammar, encoding, collisions, identity, stale fingerprints, FOTO facts.

**`applyGmiDeliveryComposition(composition, { session, authorization: { transferKeys, removalKeys } })`**

- It requires the exact session value the composition was planned on, and an authorization equal to the planned transfer and removal keys.
- It makes one M1 `editGmiFields` call (M1 independent verification), then `verifyGmiHyperlinkTransfer`.
- The verifier's contract is the committed decisions, the caller's delivery removals and the authorized field edits. It checks:
  - structure, header, GUIDs and geometry;
  - every reference: source, recipient, metadata and order;
  - removed references are gone;
  - whole-wrapper cells with ordinals 1..n;
  - unrelated S_HYPERLINK cells and every other field;
  - byte containment outside the authorized cells.
- It returns bytes only if both pass.

**`verifyRevisionAssociations({ originalSource, revisedSource, transfers, removals })`**

- The revised bytes are re-read through `createGmiPhotoSource` + `reviewGmiPhotoSource`.
- Expected ledger: original confident edges, minus delivery-removed edges, minus moved edges, plus moved edges on their recipients. The reference counts must match and every reference must be confident to its asset.
- It also requires the same object keys and a distinct fingerprint.

## 4. Export modes and remaining blockers

| Mode | With an active transfer (Batch 1B.3A) |
|---|---|
| **Kun GMI** | FOTO view `current` → re-plan identity check (no removals) → `buildGmiFieldExport` with attestation. Bytes = proposed (fields + transfer), re-verified on the exact bytes, then the revision ledger check. A5 warning. Field corrections included; GML/Ikke choices not applied (unchanged Kun GMI contract). |
| **Samlet levering** | One composition: fields + transfer + M7 removals. GML for GML/«uten GMI-lenke» decisions only (moved photographs stay «Beholdes i GMI»). Attachments planned from the original source minus delivery removals (moved references keep their path). Then apply → verifier → revision ledger check → **attachments re-planned from the revised GMI must equal the packaged list**. Download recording unchanged (`markDownloaded` with the effective key, which includes the transfer). |
| **Delt levering** | Same as Samlet, with field corrections excluded. **Decision:** the transfer is included (it is a hyperlink change coupled with FOTO, not a field correction). The explicit exclusion is required only when a field ChangeSet exists. Download is not recorded (unchanged). |
| **Kun GML med bilder** | The moved occurrence is exported as Foreslått shows it: recipient, recipient's GMI position, provenance `user-approved-hyperlink-transfer` (overlay on the frozen export snapshot; accepted records untouched). An accepted-unplaced moved photograph therefore becomes a GML feature. |

Every refusal is fail-closed, with a Norwegian message:

| Situation | Code |
|---|---|
| The FOTO record is not `current` (conflict, invalid, unavailable), or there is no FOTO session or layer | `hyperlink-transfer-photo-unverified` |
| More than one transfer applies | `hyperlink-transfer-multiple` |
| A coordinated package where a transfer sits in another GMI bound to the photo layer | `hyperlink-transfer-other-gmi` |
| The transfer belongs to another photo layer or source than the coordinated package | `hyperlink-transfer-other-photo-layer` |
| A delivery removal overlaps a moved reference | `removal-overlaps-transfer` |
| The committed transfer can no longer be planned identically | `transfer-replan-mismatch` |
| The revised GMI does not re-read to the intended ledger | `revised-gmi-association-mismatch` |
| The revised GMI's references do not match the packaged attachments | `revised-gmi-attachment-mismatch` |
| Low-level field export without attestation | `hyperlink-transfer-unverified` |
| The verifier refuses the exported bytes | `hyperlink-transfer-verification-failed` |

Kun GMI of a GMI layer that has no transfer itself is not blocked by a transfer in another bound GMI.

**Known limitations (documented, not blocking this stage):**

- The removal-only cell rule is M7's. A transfer-involved cell must satisfy the stricter 1B.1 layout. The verifier also requires whole-wrapper cells for removal-only cells, so a removal-only cell with unusual leading text would be refused while a transfer is active.
- Photos-only places a moved, previously unplaced photograph (1B.2B §10.4 consequence).

## 5. FOTO positioning, attachments and accounting decisions

- **Moved photographs stay «Beholdes i GMI».** They get no GML decision, and combined/split GML never contains them.
  - Their original bytes are packaged unchanged. The test compares the ZIP entry with the asset file byte for byte, EXIF included.
  - The path is the reference path verbatim (wrapper text is copied unchanged), so the revised GMI's link resolves to the packaged file. The post-apply attachment re-plan proves it.
- **Shared photographs.** The moved occurrence moves and the sibling keeps its object.
  - One attachment per asset; nothing is deduplicated across references or multiplied.
  - Counts are kept apart: `hyperlinkTransfers` (occurrences), `hyperlinkTransferAssets` (unique photographs), `movedReferences` (references). Existing `retainedReferences` and `gmiPlacements` come from the revised GMI's own ledger.
- **Repeated references** in one group move together and arrive as two references (1B.1 policy).
- **Provenance.** Only photos-only uses the proposed position. Its GML occurrence records `positionProvenance.acceptance = 'user-approved-hyperlink-transfer'` and the transfer provenance; the GML XML itself has no provenance field (unchanged serializer).
- **Report and summary.**
  - New row «Flyttede bildelenker», e.g. «1 bilde · 1 bildereferanse flyttet til et annet punktobjekt i GMI»; in photos-only «… plassert på mottakerens GMI-posisjon i GML».
  - New TXT section «Flyttet til et annet punktobjekt:», separate from «Overført til GML» and «Ikke med».

## 6. Revised GMI reimport evidence (synthetic)

Test «revised GMI reimport…» takes the combined export of LOK 293 → SLU 108 and checks the following.

- **Parser.** The app parser (`GMIParser` + `decodeGmiBytes`) reads the expected S_HYPERLINK values, which it trims as usual.
- **New layer.** The revised file registers and opens as a new Rettinger layer:
  - it is editable and has a different fingerprint;
  - it carries no transfer of its own;
  - the original layer keeps its fingerprint and `verifySource` passes.
- **FOTO import.** A fresh FOTO layer sourced from the revised file through the real source workflow (`stageLayerSource` + save) shows:
  - SYNT_LOK_B's occurrence on SLU;
  - no occurrence on LOK;
  - a source fingerprint equal to the revised document's.
- **Occurrence mapping (decision).** FOTO keys depend on the source fingerprint, so revised occurrences are new keys. The stable part is (objectKey, assetId); the object keys are proven unchanged.
  - `gmiSummary.hyperlinkTransfer.occurrenceMapping` lists `originalOccurrenceKey` → `proposedOccurrenceKey` → `revisedOccurrenceKey`, with the revised reference ids.
  - The reimported occurrence key equals `revisedOccurrenceKey`.
  - Its local reference ids equal the mapping's and the transfer's predicted `outputReferenceIds` (no delivery removal on the recipient here).
- **Ledger.** `verifyRevisionAssociations` passes and finds 5 associations. LOK's re-read cell has contiguous wrappers `h:1`, `h:2`.
- **Coordinated packages.** Kun GMI of the revised layer, with the photo layer still bound to the transferred original, is a byte-identical no-op. A coordinated package of it is refused (`hyperlink-transfer-other-gmi`).

**Not established:** a real reimport of an authorized file, and import in Gemini VA.

## 7. Safety and lifecycle

- **Atomic history unchanged.** No new history or entry kind was added.
  - Undo makes earlier plans stale; the next export is the untransferred delivery, byte-identical to the original when there are no choices.
  - Redo makes plans stale again and reproduces the first plan's bytes exactly.
- **Liveness.**
  - The snapshot signature covers each relevant transfer's layer, set id and session `stateKey`, so commit, undo, redo and replacement all make a plan stale.
  - Field edits change the session value.
  - Delivery choices and FOTO changes change the FOTO snapshot or delivery `stateKey`.
  - Tested for every one of these and for photos-only.
- **No writes.**
  - Planning and packaging write nothing: the original bytes, FOTO accepted state (`fotoState`), history and publication count are asserted unchanged.
  - The only publication is the existing download record (unsaved flag).
  - Export failures (missing attachment, unverified FOTO) change nothing.
- **Download.** It neither commits nor discards the transfer; history is unchanged. The transfer stays in Foreslått and the FOTO lock stays: `setDeliveryIntent` on the moved photograph is still refused after download.

## 8. Verification

| Check | Result |
|---|---|
| New suite `tests/photoHyperlinkTransferExport.test.mjs` | **12 passed, 0 failed** |
| Focused: export, transaction, integration, deliveryPlan | **62 passed, 0 failed** (after the final refinement) |
| Neighbouring serial: `delivery*`, `gmiEdit*`, `gmiValidator*`, `hyperlinkFilenames`, `photo*`, `validatorDataTableSlice3*` | **1,253 passed, 0 failed, 120 skipped** (skips: browser-only suites without `PHOTO_UI_URL`) |
| Full serial Node `node --test --test-concurrency=1 --test-reporter=tap "tests/*.test.mjs"` | First run (before the final one-rule refinement): **2,387 passed, 0 failed, 156 skipped** (2,543; 168 s). **Final tree: 2,387 passed, 0 failed, 156 skipped** (2,543; 163 s). |
| Fresh isolated production build (`%TEMP%/gmi-1b3a-build`, `src/` identical by `diff -rq`, no `.env.local`, node_modules junction, `npm run build -- --webpack`) | Passed (exit 0) |
| Complete serial production browser suite (same build, task-owned port 3192): `"tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"` | **488 passed, 1 failed, 11 skipped** (500; 710.5 s). The failure: `photoExportWizardUi` «closing during ZIP generation: the finished ZIP reaches no download…», during fixture setup (`Unavailable source control: Koble og posisjoner bilder`). Classified below as intermittent, cause not established. |
| ESLint on 15 affected JS/MJS files | Exit 0 |
| `git diff --check` | Exit 0 (LF/CRLF notices only) |

**Browser failure, classified as intermittent (not proven pre-existing).** The failing test exercises Kun GML med bilder without any transfer. It failed during layer setup: the FOTO source button was unavailable after 22.7 s.

| Run | Task build (port 3192) | HEAD `src/` build (port 3193) |
|---|---|---|
| Complete suite | failed | — |
| Isolated run 1 | failed (later wait: `button[aria-label=Lukk]`, 85 s) | — |
| Isolated run 2 | 9/9 passed | — |
| Comparison runs 1–3 (alternated) | 3 × 9/9 passed | 3 × 9/9 passed |

- The failure points differ between failures.
- The test and its harness are unchanged since `4511c39`.
- This task changed no UI, scroll, focus or timing code.
- With no transfer, the photos-only path adds only a cheap synchronous registry lookup.

The failure did not reproduce on HEAD in 3 runs, so it is **not** claimed to be pre-existing. It stays an open observation: rerun `tests/photoExportWizardUi.test.mjs` on the next browser run, and investigate if it recurs.

**Gemini serializer.** `photoGeminiCompatibility` (legacy2019/asbuilt52 exact serialized bytes) passes unchanged. No expected hash, fixture or safety assertion was changed.

**Screenshots: not produced.** No transfer can be created in the running application (no UI path or hook, by contract). The only visible change, a summary row and report section, appears only with a transfer and is covered by unit assertions.

Logs (local, synthetic only) are in this session's scratchpad (`neighbours.log`, `node-full.log`, `browser-full.log`). The build log is `%TEMP%/gmi-1b3a-build/build.log`.

## 9. Gemini A5 acceptance — still required (status: **A5 acceptance pending**)

Not done here, because no genuine Gemini VA trial was available. Nothing in this report is recipient evidence. Required trial on an authorized file:

1. A newly appended S_HYPERLINK wrapper on a recipient with an empty cell, and on one with existing links and `sign:` metadata.
2. Wrappers renumbered after transfers combined with GML/Ikke removals (chain/cycle cell).
3. The photograph opens on the chosen object (SLU/KUM), not on the source.
4. Combined delivery: GMI + GML + Attachments import; attachment paths resolve; original photo checksums unchanged; geometry intact.
5. Photos-only GML with a moved occurrence at the recipient position.

## 10. Deliberate contract changes

1. `photoHyperlinkTransferTransaction.test.mjs` «exports fail closed while a transfer is active…» → «…compose an active transfer only through the verified delivery path…». Kept:
   - earlier snapshots stale;
   - the unattested low-level export refuses (code now `hyperlink-transfer-unverified`);
   - undo restores the identical export.

   Each mode is now `ready` with one transfer.
2. `photoHyperlinkTransferIntegration.test.mjs`, same change. The no-user-reachable-save scan is unchanged.
3. The `gmiEditProduction` inventory registers `deliveryComposition.mjs` with gmi-edit-only imports.
4. Fixture helper options; defaults unchanged.

The wiring scans (planner/verifier names outside gmi-edit, transaction imports, scope module view-only) are unchanged and pass. `deliveryPlan.mjs` reaches the composition only through `gmi-edit/deliveryComposition.mjs`, and the view only through the scope module.

## 11. Requirements for the eventual writable review

- `PHOTO_LINK_REVIEW_WRITABLE` may be enabled only together with:
  - the wizard-contract save (1B.2A §9);
  - presentation of `hyperlink-transfer-photo-unverified` and the other refusal codes where the user exports;
  - an A5-qualified notice.
- The wizard's split «utelat feltrettinger» checkbox counts every ChangeSet (`status.changeSetCount`, transfer included). The planner now needs the exclusion only for field ChangeSets. The writable stage should count field ChangeSets only, so the user is not asked to confirm «0 feltrettinger».
- Decide whether Kun GML med bilder should place an accepted-unplaced moved photograph (implemented: yes, as Foreslått shows) or require an explicit FOTO acceptance first.
- Lock release after export stays as implemented: locks persist until undo/discard. Folding a transfer into FOTO accepted state, or tying lock release to reimport of the revision, remains a product decision.

## 12. Real-data acceptance checklist

1. Authorized GMI + FOTO: commit LOK 293 → SLU 108 (once writable). Record photo counts, delivery choices and checksums.
2. Kun GMI: the SLU cell has the appended wrapper with `sign:`; LOK is renumbered; diff only in those cells and authorized fields.
3. Samlet levering with one GML and one Ikke choice on the same objects: one composed cell each; GML has only GML decisions; ZIP has the moved photo unchanged; the report shows «Flyttet til et annet punktobjekt».
4. Delt levering with a pending field correction: correction excluded, transfer included.
5. Kun GML med bilder: the moved photo at the SLU position.
6. Reimport the revised GMI in the app as a new layer and as a FOTO source: the photo is on SLU; the original layer is untouched.
7. Undo, re-export (original links), redo, re-export (identical bytes).
8. Gemini VA import trial (§9).

## 13. Outstanding risks and next steps

- **Risks:**
  - recipient acceptance of appended/renumbered wrappers (A5);
  - the photos-only placement decision;
  - the stricter verifier on unusual removal-only cells while a transfer is active (fails closed);
  - only one active transfer per delivery (`hyperlink-transfer-multiple`);
  - the unexplained intermittent `photoExportWizardUi` setup failure (§8).
- **Next:**
  - Batch 1B.3B / writable stage: the UI save, the wizard checkbox count, the presentation of refusals;
  - real-data trial;
  - Gemini A5.

## Git and process state

- Branch `feature/photo-workspace`, HEAD `dfde0bc` unchanged; the staged diff is empty. Nothing was staged, committed, pushed, deployed, reset, restored, stashed or cleaned.
- Task changes: 3 new files, 12 modified tracked files (8 library, 4 test), this report and the progress record. `git diff --numstat` is in §2.
- The five pre-existing status-only test paths still have no content diff.
- Task-owned production servers: port 3192 (task build) and port 3193 (HEAD comparison build) were started by this task and stopped by PID after the runs. Neither port has a listener, and the `cmd` wrappers have exited. Pre-existing servers on 3110–3113 were not touched.
- Isolated build copies `%TEMP%/gmi-1b3a-build` (final `src/`) and `%TEMP%/gmi-1b3a-head-build` (HEAD `src/`) remain as local aids. Both contain synthetic data only and no `.env.local`.
