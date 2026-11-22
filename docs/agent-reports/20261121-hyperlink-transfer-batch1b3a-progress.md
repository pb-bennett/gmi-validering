# Batch 1B.3A progress record — export composition, reimport and delivery verification

Working record (not the completion report). Branch `feature/photo-workspace`, start HEAD `dfde0bc`. Five status-only test files pre-existing (untouched).

## Architecture traced (before editing)

- All export UI goes through `DeliveryWizard` → `captureDeliverySnapshot` / `buildDeliveryPlan` (`src/lib/delivery/deliveryPlan.mjs`). No other caller of `buildGmiFieldExport`.
- gmi-only: `buildGmiFieldExport` → `registry.proposed` (M2 proposed = field + transfer edits, one M1 call, independent transfer verifier on every computation).
- combined/split: `planGmiHyperlinkRemoval` (M7) with session → `planDeliveryAttachments` (original source minus removed refs) → photo GML plan for delivery `transfers`+`included` → serialize/validate GML → `applyGmiHyperlinkRemoval` (M1 + M7 verifier).
- photos-only: `buildPhotoExportPlan` on accepted FOTO positions; no GMI.
- Transfer: one cumulative `gmi-hyperlink-transfer-set` entry; `compileGmiEffectiveEdits` fails closed while active; `compileGmiProposedEdits` returns field + hyperlink edits.
- Moved photographs are locked at «Beholdes i GMI» (keep-link) on every occurrence → never in the GML of combined/split.
- Wiring scans: outside `lib/gmi-edit/`, no file may name `planGmiHyperlinkTransfer`, `verifyGmiHyperlinkTransfer`, `hyperlinkTransfer(Verify).mjs`, or import `photoHyperlinkTransfer.mjs` (except scope module, which may import only the view).

## Plan

1. Extend 1B.1 planner with optional delivery `removals` (joined into the single M7 removal half; removal-only cells take M7's lexeme unchanged).
2. Extend independent verifier with `removals` contract.
3. New gmi-edit module `deliveryComposition.mjs`: plan + apply (field edits of session + active transfer decisions + delivery removals, one M1 call, independent verify).
4. deliveryPlan: replace blanket refusal with FOTO-view-verified composition per mode; precise fail-closed codes.
5. Reimport tests through real parser/FOTO evidence.

## Log

- (start) Reports and code read; plan above.
- Implemented: planner `removals` (hyperlinkTransfer.mjs), verifier `removals` contract, `gmi-edit/deliveryComposition.mjs` (plan/apply), exportGmi attestation + export-time re-verification, FOTO view `planning` facts, `delivery/deliveryRevision.mjs` (revised-GMI association check + occurrence mapping), deliveryPlan per-mode composition, Norwegian messages, summary/report rows, inventory contract entry.
- Exploratory run: all four modes `ready` for LOK 293 → SLU 108; expected cells; photos-only places the moved (accepted-unplaced) photo at the SLU GMI position.
- Existing focused suites: 110 pass, 2 fail = the two deliberate refusal contracts (to update), 1 skip.
- Next: new suite `tests/photoHyperlinkTransferExport.test.mjs`; update the two contracts; neighbours; full regression; build; browser.
- New suite `tests/photoHyperlinkTransferExport.test.mjs`: 12/12 pass. Deliberate contract updates in the 1B.2A transaction and 1B.2B integration suites (refusal → verified composition; unattested low-level export still refuses).
- Neighbours (delivery*, gmiEdit*, gmiValidator*, hyperlinkFilenames, photo*, validatorDataTableSlice3), serial: 1,253 pass, 0 fail, 120 skip (browser-only suites skip without PHOTO_UI_URL).
- Refinement: standalone GMI export of another GMI layer ignores a transfer on a different GMI bound to the photo layer; coordinated packages refuse it (`hyperlink-transfer-other-gmi`). Focused 62/62.
- ESLint on 15 affected files exit 0; `git diff --check` exit 0.
- Isolated build copy `%TEMP%/gmi-1b3a-build` prepared (no `.env.local`, node_modules junction).
- Full serial Node (pre-refinement tree): 2,387 pass, 0 fail, 156 skip.
- Isolated build passed (src identical). Task server port 3192 (pid 30844 listener). Complete serial browser suite running.
- Completion report drafted: `20261121-213000-hyperlink-transfer-batch1b3a-completion.md` (placeholders for final Node/browser/process lines).
- Browser complete suite (port 3192): 488 pass, 1 fail (`photoExportWizardUi` «closing during ZIP generation», setup step), 11 skip. Isolated: 1 fail, then pass. HEAD comparison build (port 3193) vs task build, alternated ×3: all 9/9 on both. Recorded as intermittent, not proven pre-existing.
- Servers on 3192/3193 stopped by PID; ports free; 3110–3113 untouched.
- Final full serial Node on the final tree: 2,387 pass, 0 fail, 156 skip. Build `src/` identical to final tree.
- Completion report finalized. Nothing staged or committed.
