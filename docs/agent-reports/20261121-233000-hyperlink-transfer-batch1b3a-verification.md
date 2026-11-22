# Batch 1B.3A verification and refinement

2026-11-21, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `dfde0bc` (unchanged, three local commits ahead of origin). This continues the uncommitted [1B.3A tree](20261121-213000-hyperlink-transfer-batch1b3a-completion.md); see also [1B.2B](20261121-180000-hyperlink-transfer-batch1b2b-completion.md). Working record: [progress](20261121-hyperlink-transfer-batch1b3a-verification-progress.md). No subagents, private-corpus inspection, staging, commits, pushes, deployments, branch or dependency changes.

## Outcome

- **Browser failure (§1).** It did not reproduce in 13 targeted repetitions, and no product defect was found. It stays an open observation. The shared test helper now reports which precondition failed; this is diagnostic only.
- **Kun GML med bilder inclusion (§2).** Implemented. A moved photograph that was unplaced before the transfer enters GML only with an explicit, per-delivery inclusion. Without it, the photograph is left out and named in a warning. A moved photograph that was accepted at its source's GMI position is still placed on the recipient's position without an extra step.
- **Delt levering (§3).** The wizard now counts field corrections apart from the transfer. Rows and the report say «Feltrettinger utelates» and «Flyttede bildelenker inkluderes» separately.
- **`hyperlink-transfer-multiple` (§4).** It means two or more GMI files bound to one photo layer, each with an active transfer, in Kun GML med bilder. Any number of photographs in one GMI file is supported. This analysis also found and fixed a **real defect**: the planner matched the FOTO view by transfer-set id alone, so Kun GMI of the second GMI file wrongly failed closed.
- **Unchanged.** `PHOTO_LINK_REVIEW_WRITABLE = false`; one composition against the original; independent verification; M7 removals; one Rettinger history; A5 warning. The GMI, combined and split byte semantics are unchanged.

## 1. Intermittent browser failure

**Observed facts (from the 1B.3A logs, re-read).**

| Run | Test position | Failing step | Duration |
|---|---|---|---|
| Complete suite | `photoExportWizardUi` test 7 of 9 | `buildLayer` → `retainGmlInWorkspace` → `openPhotoSources` → `clickSourceControl('Koble og posisjoner bilder')` threw `Unavailable source control` | 22.7 s (normally ≈ 3.5 s in total) |
| Isolated run 1 | test 7 of 9 | `openApp`: `Page.navigate` plus a 30 s wait for `button[aria-label=Lukk]` | 85.0 s |

- Both failures were in test 7, and both happened before its body ran, at different setup steps.
- In the complete-suite run, the test before it took 11.1 s, against 3.0–4.2 s in every other run. In one comparison run, tests 4–7 took 2–3× as long. So the host was slow at those moments.
- Concurrent servers from other tasks were listening on 3110–3113. They were not touched.

**Analysis of the setup path (static).**

- `clickSourceControl` is a single-shot probe. It opens the «Verktøy» menu, waits at most 30 animation frames for the popup, and throws if the item is missing or `aria-disabled`.
- The item is disabled only when `layer.photoCount` is 0. `photoCount` is published atomically when the layer is created (`createLayerCore`).
- `WorkspaceShell` and the tools trigger render in the same commit (`page.js`).
- The menu renders synchronously on the trigger's click.

No product state was found in which the control is legitimately unavailable after the shell appears. The second failure (page load) is outside the test body altogether.

**Targeted repetitions on an isolated production build** (`src/` identical to the tree at that point, task-owned port 3194):

| Series | Result | Test Chrome processes left after each run |
|---|---|---|
| 8 isolated runs of `tests/photoExportWizardUi.test.mjs` | **8 × 9/9 passed** | 0 |
| 5 runs with a synthetic CPU-load generator | **5 × 9/9 passed** | 0 |

The load generator reached only about 45 % CPU (Windows throttles background processes), so real contention was **not** achieved. That series is not evidence of robustness under load. HEAD was not compared again: 1B.3A already ran HEAD 3 × 9/9, and without a reproduction a comparison could show nothing.

**Change (diagnostic only).** In `tests/helpers/photoSourceWorkflow.mjs`, `clickSourceControl` keeps its message prefix and behaviour. It now appends the reason: `no such control`, `tools menu did not open`, `not in tools menu`, or `disabled: <reason>`. No wait, sleep or assertion was changed.

**Status: open observation; no defect established.** The final browser runs are in §6.

## 2. Kun GML med bilder: inclusion policy

**Existing controls investigated first.**

- Kun GML med bilder deliberately ignores the FOTO delivery choices (M8 GMI/GML/Ikke). Those choices are also locked at «Beholdes i GMI» for moved photographs (1B.2B).
- The standalone export already leaves out unplaced rows («plasseringer uten godkjent posisjon er utelatt»).
- The wizard has one established delivery-time confirmation: the split «Utelat feltrettingene» checkbox. It is keyed to the session state and passed to `captureDeliverySnapshot` as an option.

The inclusion reuses that pattern. It is not stored in FOTO and adds no second inclusion owner.

**Implemented policy (`deliveryPlan.mjs`).**

- A moved occurrence whose accepted FOTO record has no position (`!row.current` in the frozen export snapshot) is overlaid with the recipient's GMI position only when the snapshot was captured with `includeTransferredUnplaced: true`.
- Without that option, the accepted (unplaced) record is exported unchanged, so the existing standalone rule leaves the photograph out. The plan then carries:
  - warning `hyperlink-transfer-unplaced-withheld` (Bør kontrolleres) with the occurrence;
  - accounting `withheld` on the transfer row, and the count `hyperlinkTransferWithheldAssets`;
  - the summary «1 bilde ikke tatt med (uplassert før flyttingen, ikke bekreftet)»;
  - the report line «… ikke tatt med i GML (uplassert før flyttingen, ikke bekreftet)».
- With the option, the plan is unchanged from 1B.3A: the recipient, the recipient's GMI position, and `user-approved-hyperlink-transfer` provenance.
- A moved photograph accepted at its source's GMI position needs no decision. The recipient position stays the valid Foreslått evidence (new test).
- The option is honoured only for `photos-only`. GMI, combined and split produce the same bytes with or without it, and moved photographs stay «Beholdes i GMI» there (tested).
- `deliveryTransferredUnplaced({ registry, photoSession, photoLayerId })` is a read-only helper for the wizard. It returns `{ key, occurrences, assets }`, or null when there is nothing to decide, when FOTO does not verify, or when more than one GMI holds a transfer. `key` is the transfer signature, so a commit, undo or replacement clears a confirmation.
- Redo restores the identical state and the same key, which is the same behaviour as the split exclusion. The registry carries no inclusion; a new capture without the option withholds again (tested).
- FOTO accepted state, the photograph's unplaced record and the history are unchanged by either choice (tested).

**Wizard (`DeliveryWizard.js`).** In Innhold, Kun GML med bilder shows an optional checkbox when the helper returns a decision: «Ta med N bilde(r) som var uplassert før bildelenken ble flyttet, på mottakerens GMI-posisjon. Uten bekreftelse utelates bildet/bildene fra GML.» Its accessible name is «Ta med flyttede bilder som var uplassert».

- It reuses `.delivery-exclusion`, which gives the teal `accent-color` and the existing surface.
- It resets on mode or photo-layer change.
- It does not gate «Kontroller leveransen».

**Not verified in a browser:** the checkbox cannot render today. No transfer can be created in the app (`PHOTO_LINK_REVIEW_WRITABLE = false`, and no development write entry point by contract). It is covered by the library tests and the production build only.

## 3. Delt levering: confirmation boundary and counts

**Defect corrected.** The wizard took `gmi.status.changeSetCount` and `changedCells`, and both include the transfer set and its S_HYPERLINK cells.

- With only a transfer, split asked the user to confirm that «2 feltrettinger utelates» (the two transfer cells), although the planner (1B.3A) needs no exclusion then.
- With a field correction plus a transfer, it reported «3 feltrettinger» and «2 rettinger».

**Fix.** The new `deliveryCorrectionCounts(view, status)` in `deliveryWizard.mjs` gives `{ fieldChangeSets, fieldCells, movedPhotos, movedReferences }`.

- Transfer sets are recognised by `isGmiHyperlinkTransferSet`, and transfer cells by `hyperlinkTransfer: true` from `listGmiEditCells`.
- The wizard uses it for:
  - `needsExclusion` (field change sets only, the same rule as the planner);
  - the checkbox text «Jeg bekrefter at N feltrettinger utelates»;
  - the «N endrede felt i M rettinger» line;
  - `review.fieldCount`, and so the report.
- The session summary and the Rettinger status are unchanged. Their shape is a contract (`gmiEditChangeSets.test.mjs`), and Rettinger still counts the history entry.

**Distinguishing text.**

- Innhold, when the GMI has moved links: «Flyttede bildelenker inkluderes: 1 bilde · 1 bildereferanse til et annet punktobjekt.» (split), or «… tas med: …» (combined and Kun GMI).
- Summary and report, split: «Rettinger: 1 feltretting utelates (uttrykkelig valgt)» and «Flyttede bildelenker: Inkluderes: 1 bilde · 1 bildereferanse flyttet til et annet punktobjekt i GMI».

**Preserved.**

- The planner rule (`field-exclusion-required` only with field ChangeSets) and the composition are unchanged.
- The split GMI keeps the moved links and leaves out the field correction; combined keeps it (tested).
- `gmiSummary.changeSets` for split lists only the transfer entry.

## 4. `hyperlink-transfer-multiple`

**Where it can arise.** `deliveryHyperlinkTransfers` returns one entry per GMI session (bound or selected) with an active transfer set. A set is cumulative: it holds every photograph decision of that session.

- For GMI modes, `own` is filtered to the delivery's session, so it can never exceed one.
- The code is therefore reachable **only in Kun GML med bilder**, with two or more GMI files bound to the photo layer that each hold an active transfer.

| Case | Result |
|---|---|
| One GMI file, several photographs in one set, including two separate commits (cumulative) | **Supported** in all four modes (tested: 2 decisions, `hyperlinkTransfers = 2`) |
| Two GMI files bound to one photo layer, each with an active transfer: Kun GML med bilder | **Blocked**: `hyperlink-transfer-multiple` |
| The same: Kun GMI of either GMI file | **Supported**: each carries exactly its own transfer (tested bytes) |
| The same: Samlet/Delt levering | **Blocked**: `hyperlink-transfer-other-gmi` (existing, more specific) |

There is no one-photograph limit. The Norwegian message now says so: «Flere GMI-filer koblet til fotolaget har flyttede bildelenker. Kun GML med bilder kan bare ta med flyttinger fra én GMI-fil. Angre flyttingene i de andre GMI-filene i Rettinger.»

**Defect found and fixed.** `verifiedTransferView` looked up the FOTO view with `views.find((item) => item.transferSetId === entry.transferSet.id)`. Transfer-set ids are per-session counters, so both sessions' first entry is `cs-1`.

- With two GMI files, Kun GMI of the second file therefore checked the first file's view. It failed closed with `hyperlink-transfer-photo-unverified`; this was observed in the new test before the fix.
- Fix: views pair one-to-one with `scope.entries`, so the view is now taken from the entry whose `transferSet` is the same object.
- The failure mode was safe (a refusal, never a wrong export), but the refusal was wrong.
- The FOTO scope's `transferSetIds` list has the same id ambiguity, but no consumer matches on it (`grep`). It is recorded here for the writable stage and was not changed.

## 5. Files (this task, on top of the 1B.3A tree)

| File | Change |
|---|---|
| `src/lib/delivery/deliveryPlan.mjs` | Withheld overlay (`proposedPhotoSnapshot` `withhold`), `unplacedTransferRows`, `deliveryTransferredUnplaced`, snapshot option `includeTransferredUnplaced`, warning, accounting (`withheld`, `hyperlinkTransferGmlAssets`, `hyperlinkTransferWithheldAssets`), view matching by entry identity, `multiple` comment |
| `src/lib/delivery/deliveryWizard.mjs` | `deliveryCorrectionCounts`; messages (`hyperlink-transfer-multiple` clarified, `hyperlink-transfer-unplaced-withheld`); split «Inkluderes:» and photos-only summary rows; report line |
| `src/lib/delivery/index.mjs` | Exports `deliveryTransferredUnplaced` |
| `src/components/delivery/DeliveryWizard.js` | Field-only counts and exclusion rule; «Flyttede bildelenker inkluderes/tas med» line; optional GML-only inclusion checkbox |
| `tests/photoHyperlinkTransferExport.test.mjs` | 1 contract update (photos-only with explicit inclusion); 4 new tests (§2 ×2, §3, §4) |
| `tests/photoHyperlinkTransferTransaction.test.mjs`, `tests/photoHyperlinkTransferIntegration.test.mjs` | The same contract update in 1B.3A's two uncommitted all-modes-ready checks: photos-only captured with `includeTransferredUnplaced` (LOK_SLU photographs are all unplaced) |
| `tests/helpers/photoSourceWorkflow.mjs` | Diagnostic failure reason (§1) |
| `docs/agent-reports/20261121-233000-hyperlink-transfer-batch1b3a-verification.md`, `…-verification-progress.md` | This report and the progress record |

The 1B.3A files listed in its report are otherwise unchanged by this task. No fixture, expected hash, manifest or safety assertion was changed. The five status-only test paths still have no content diff (`git diff --ignore-cr-at-eol` is empty).

## 6. Verification

**Passed:**

| Check | Result |
|---|---|
| `tests/photoHyperlinkTransferExport.test.mjs` | **16 passed, 0 failed** (12 existing, one of them updated; 4 new) |
| Focused: export, transaction, integration, `deliveryPlan`, `deliveryWizard`, `gmiEditProduction`, `gmiEditHyperlinkTransfer`, `gmiEditChangeSets` | **133 passed, 0 failed, 1 skipped** |
| Full serial Node, `node --test --test-concurrency=1 --test-reporter=tap "tests/*.test.mjs"` | **2,391 passed, 0 failed, 156 skipped** (2,547 tests; 151 s). The skips are browser-only suites without `PHOTO_UI_URL`, as in 1B.3A. |
| Fresh isolated production build: `%TEMP%/gmi-1b3a-verify-build`, `src/` identical to the final tree by `diff -rq`, no `.env.local`, node_modules junction, `npm run build -- --webpack` | Passed (exit 0) |
| Affected browser suites (same build, task-owned port 3195) | `deliveryWizardUi` 17/17, `photoExportReturnUi` 22/22, `photoHyperlinkReviewUi` 3/3, `photoExportWizardUi` 3 × 9/9 |
| Complete serial production browser suite (same build and port): `"tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"` | **489 passed, 0 failed, 11 skipped** (500 tests; 612 s). The 1B.3A failure did not recur. The skips need private-corpus, dev-server or optional variables. |
| ESLint on the 8 affected JS/MJS files | Exit 0 |
| `git diff --check` | Exit 0 (only LF/CRLF notices) |

**Failed:** none in the final runs.

**Skipped or not done:**

- Browser rendering of the new Innhold checkbox and «Flyttede bildelenker inkluderes» line. They are unreachable without a writable transfer (§2).
- Screenshots: not produced, for the same reason.
- Real-file and Gemini VA acceptance.
- A HEAD comparison for §1. 1B.3A already had 3 × 9/9 on HEAD, and there was no reproduction to compare.

**Totals for `photoExportWizardUi` across both tasks:** 2 failures in 1 complete-suite run and 2 isolated runs (1B.3A). After that: 0 failures in 1 + 3 + 8 + 5 + 3 isolated runs and 1 complete-suite run.

Logs (local, synthetic only) are in this session's scratchpad: `repeat-a/`, `repeat-loaded/`, `repeat-final/`, `affected-*.log`, `node-full.log` and `browser-full.log`. The build log is `%TEMP%/gmi-1b3a-verify-build/build.log`.

## 7. Remaining Gemini A5 acceptance (unchanged, status: **A5 acceptance pending**)

Required trial on an authorized file in Gemini VA; nothing here is recipient evidence:

1. Appended S_HYPERLINK wrapper on an empty recipient, and on one with existing links and `sign:` metadata.
2. Renumbered wrappers after transfers combined with GML/Ikke removals (chain/cycle cell).
3. The photograph opens on the chosen object, not the source.
4. Samlet levering: GMI + GML + Attachments import; paths resolve; original photo checksums unchanged; geometry intact.
5. Kun GML med bilder with a moved occurrence at the recipient position. This now applies both to a confirmed, previously unplaced photograph and to one accepted at its source's GMI position.

## 8. Recommendations for the writable workflow (not implemented)

1. **Browser-verify the two new Innhold elements** once a transfer can be committed in the app:
   - the GML-only inclusion checkbox (teal accent, accessible name, reset on mode/layer/transfer change, layout at 1280×720 and 1366×768);
   - the «Flyttede bildelenker inkluderes» line.
2. **Present the refusals and the warning where the user exports:** `hyperlink-transfer-photo-unverified`, `-multiple`, `-other-gmi`, `-other-photo-layer` and `-unplaced-withheld`.
3. **Decide whether the GML-only inclusion should instead be a FOTO acceptance** (fold the recipient position into accepted state). The delivery-time confirmation is deliberately non-persistent.
4. **Transfer-set identity across sessions.** Any future consumer must match views by scope entry (handle/session), never by `transferSetId` alone (§4).
5. **Photos-only plan liveness after undo → redo.** A Kun GML med bilder plan captured before an undo becomes live again after the redo, because the transfer signature (layer, set id, `stateKey`) is the same. GMI modes stay stale because the session value changes. The plan is correct for the restored state, so this is safe. 1B.3A §7 says «Redo makes plans stale again»; that holds only for the GMI modes. Decide whether to require a new review.
6. **Lock release after export** remains a product decision (1B.3A §11).
7. **If the intermittent setup failure recurs,** read the new helper reason before changing any wait.

## Git and process state

- **Repository.** Branch `feature/photo-workspace`; HEAD `dfde0bc` is unchanged and three commits ahead of origin. Nothing was staged, committed, pushed, deployed, reset, restored, stashed or cleaned.
- **Working tree.**
  - Modified tracked files, this task: `src/lib/delivery/index.mjs`, `src/components/delivery/DeliveryWizard.js` and `tests/helpers/photoSourceWorkflow.mjs`.
  - Modified tracked files, 1B.3A files this task changed further: `deliveryPlan.mjs`, `deliveryWizard.mjs`, and the transaction and integration tests.
  - Untracked: `tests/photoHyperlinkTransferExport.test.mjs` (from 1B.3A, extended here), this report and the progress record.
  - All other 1B.3A changes are as their report records them.
- **Status-only files.** The five pre-existing status-only test paths still have no content diff.
- **Processes.** I started task servers on ports 3194 (the 1B.3A build, for the repetitions) and 3195 (this task's final build). I stopped each by PID after checking its command line (11348 and 17004), and both ports are free. The pre-existing servers on 3110–3113 were not touched. No test Chrome processes remain.
- **Local aids.** The isolated copies `%TEMP%/gmi-1b3a-build` and `%TEMP%/gmi-1b3a-head-build` (from 1B.3A) and `%TEMP%/gmi-1b3a-verify-build` (this task) remain. They hold synthetic data only and no `.env.local`.
