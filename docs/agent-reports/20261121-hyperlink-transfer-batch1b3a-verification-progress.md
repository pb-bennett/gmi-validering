# Batch 1B.3A verification and refinement — progress record

Working record (not the completion report). Branch `feature/photo-workspace`, start HEAD `dfde0bc` (ahead 3, local). Continues the uncommitted 1B.3A tree. Five status-only test files pre-existing (untouched).

## Log

- (start) Branch, HEAD and tree verified: 17 modified tracked files and 5 untracked task files from 1B.3A, as recorded. 1B.3A and 1B.2B reports read.
- Browser: previous logs re-read. Both failures were in test 7 of `photoExportWizardUi` before its body ran (full suite: `clickSourceControl('Koble og posisjoner bilder')` single-shot probe after 22.7 s of setup; isolated run 1: `openApp` navigate + 30 s wait, 85 s). Preceding test ran 3× slower in the full-suite run.
- Task-owned server port 3194 on the existing isolated build (`src/` identical to tree at that point). 8 isolated repetitions: 8 × 9/9 passed, no leftover test Chrome processes. 5 repetitions with a synthetic CPU-load generator: 5 × 9/9 (generator only reached ~45 % CPU; contention not achieved).
- Static review: layer `photoCount` is published atomically at layer creation; shell and tools trigger render in one commit. No product defect found. Helper `clickSourceControl` now names the failing precondition in its error (diagnostic only).
- Item 2: Kun GML med bilder now withholds a moved occurrence whose accepted record was unplaced unless the capture carries `includeTransferredUnplaced: true`; warning `hyperlink-transfer-unplaced-withheld`; read-only `deliveryTransferredUnplaced` + optional wizard checkbox (split-exclusion pattern). Other modes unchanged.
- Item 3: `deliveryCorrectionCounts` (field change sets/cells apart from transfer); wizard split confirmation and counts use it; summary «Inkluderes: …» row in split; content-step line «Flyttede bildelenker inkluderes».
- Item 4: defect found and fixed: `verifiedTransferView` matched FOTO views by `transferSetId`, which is a per-session counter (two GMI sessions both had `cs-1`), so Kun GMI of the second GMI failed closed. Now matched by scope entry identity. Message for `hyperlink-transfer-multiple` clarified.
- Export suite: 16/16 (12 existing, 1 contract update, 4 new).
- Contract updates in the 1B.3A transaction/integration all-modes-ready checks (photos-only with explicit inclusion). Focused (export, transaction, integration, deliveryPlan, deliveryWizard, gmiEditProduction, gmiEditHyperlinkTransfer, gmiEditChangeSets): 133 pass, 0 fail, 1 skip.
- ESLint on 8 affected files exit 0; `git diff --check` exit 0. Five status-only files: no content diff.
- Full serial Node: 2,391 pass, 0 fail, 156 skip (2,547; 151 s).
- Server 3194 stopped by PID 11348. Fresh isolated build `%TEMP%/gmi-1b3a-verify-build` (`src/` identical, no `.env.local`, node_modules junction, `npm run build -- --webpack`): exit 0. Task server port 3195 (PID 17004).
- Affected browser suites on 3195: deliveryWizardUi 17/17, photoExportReturnUi 22/22, photoHyperlinkReviewUi 3/3, photoExportWizardUi 3 × 9/9.
- Complete serial browser suite started on 3195.
- Complete serial browser suite (3195): 489 pass, 0 fail, 11 skip (500; 612 s).
- Server 3195 stopped by PID 17004; 3194/3195 free; 3110–3113 untouched.
- Completion report finalized: `20261121-233000-hyperlink-transfer-batch1b3a-verification.md`. Nothing staged or committed.
