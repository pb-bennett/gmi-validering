# Batch 1B.2B progress record (working notes)

2026-11-21, Europe/Oslo. Branch `feature/photo-workspace`, HEAD `8b0bf6d` at start. Working tree at start: only the five known status-only test paths modified.

## Plan

1. Shared position-eligibility rule used by both the read-only review and the transaction (§4).
2. Transfer scope module: which FOTO layer/sources/assets an active Rettinger transfer protects; guard binding into `photoSession` (owner layer) (§3).
3. `photoSession` guards: delivery, edits, positioning, candidate acceptance, source workflow (stage + commit invariant), recheck/rebind/removal, photo/asset removal, layer deletion, loaded-GMI import into the layer.
4. Presentation overlay of the verified proposed FOTO view (owner, position, provenance; original kept) for workspace list/map/inspector and main map (§2).
5. Rettinger history rendering of `gmi-hyperlink-transfer-set` entries (§5).
6. Validator / revision tests on Foreslått (§6); export refusal retained (§7).
7. Tests, build, browser, report.

## Log

- Read AGENTS.md and the four reports; audited photoSession write API, FOTO components, delivery choice helpers, Rettinger change list/detail, session transfer entry shape, export fail-closed paths.
- Implemented: shared position rule (`photoHyperlinkTransferEligibility.mjs`), review + transaction aligned; `registry.activeHyperlinkTransfers()`; scope/presentation module (`photoHyperlinkTransferScope.mjs`) and dependency-free lock texts (`photoHyperlinkTransferLock.mjs`); photoSession owner guard (in-place pre-checks + draft invariant in `commitDraftMaps`); `getLayerDelivery` marks `transferLocked`; delivery helpers honour it; store binds the guard; FOTO hook + page/MapInner overlay; inspector «Flyttet bildelenke»; list «Foreslått:» context and removal lock; layer-card delete lock; wizard source lock/positions; Rettinger history transfer rows.
- Deliberate test contract updates: review fixtures give movable photographs their source occurrence (3 tests); 1B.2A wiring scan admits the scope module's view-only import. Transaction fixture extracted to `tests/helpers/photoHyperlinkTransferFixtures.mjs`.
- Focused: review 32/32, transaction 14/14, 1B.1 21/21, new integration 12/12.
- Neighbouring run 1: 2 failures (photoGeminiCompatibility exact bytes) caused by the association trial drawing extra ids; fixed (trial only while locked, shared memoised occurrence ids). Run 2: 1,241 passed, 0 failed, 119 skipped.
- Full serial Node: 2,375 passed, 0 failed, 156 skipped.
- Isolated build `%TEMP%/gmi-1b2b-build` passed; rebuilt after the final page.js tweak (src identical). Task server on port 3191; complete serial browser suite started.
- Completion report drafted: `20261121-180000-hyperlink-transfer-batch1b2b-completion.md`.
- Complete serial browser (port 3191): 487 passed, 2 failed (one photoHyperlinkReviewUi subtest + parent: old wording «annen akseptert plassering»), 11 skipped. Assertion updated to the new rule text; focused rerun 3/3. Server stopped by PID; port free.
- Final: lint exit 0 on affected files (MapInner errors equal to HEAD baseline), `git diff --check` exit 0. Report finalized. Nothing staged or committed.
