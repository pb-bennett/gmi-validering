# Batch 1B.4A completion — writable photo hyperlink review

2026-11-22, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `5eb8cf6` (unchanged, local). Continues [1B.3A](20261121-213000-hyperlink-transfer-batch1b3a-completion.md) and its [verification](20261121-233000-hyperlink-transfer-batch1b3a-verification.md), [1B.2B](20261121-180000-hyperlink-transfer-batch1b2b-completion.md), [1B.2A](20261121-150000-hyperlink-transfer-batch1b2a-completion.md) and the [1A.2 pairing contract](20261121-095806-lok-top-pairing-review-batch1a2-completion.md). No subagents, private-corpus inspection, Gemini VA import, staging, commits, pushes, deployments, branch or dependency changes.

The task brief was truncated in section 11 («No silent …»). The visible restrictions were followed; no further restriction was assumed.

## Outcome

The FOTO review now runs end to end: **Velg mottaker → Kontroll → Lagre endringer → Kontroller i Validator**.

- **One write route.** «Lagre endringer» calls the existing 1B.2A transaction (`commitPhotoHyperlinkTransfer`) through a new module, `photoHyperlinkReviewSave.mjs`. All selected moves become **one** Rettinger entry, or none are saved. There is no second transaction manager, history or FOTO state owner.
- **What is saved.** Only resolved «Flytt til punktobjekt» decisions are saved. «Behold uendret» is a no-op. «Lever som GML» and «Ikke med i leveransen» remain FOTO delivery choices. While one is selected, saving is refused with a Norwegian explanation; nothing is silently omitted, and no delivery choice is written.
- **After saving.** A receipt shows counts, source → recipient, «Foreslått, originalfilen er uendret» and the undo route. «Kontroller i Validator» opens the Validator on the GMI layer's actual Foreslått dataset, focused on the point S_HYPERLINK rule, through the existing `openGmiValidator` navigation. Findings are recomputed; nothing is marked corrected.
- **Defect found and fixed.** A latent 1B.2B defect only became reachable now (§4): FOTO did not refresh after a Rettinger commit, undo or redo.
- **Recipient acceptance is not claimed.** `gemini-a5-transfer-unverified` stays on revised GMI deliveries. **Status: A5 acceptance pending.**

## 1. Audit findings (observed before editing)

| Concern | Owner / finding | Used as |
|---|---|---|
| Pairing decisions | `photoHyperlinkReview.mjs`: the reducer, decisions, progress and `PHOTO_LINK_REVIEW_WRITABLE` gate | Kept; extended with saved-transfer awareness and save blockers |
| Atomic commit | `commitPhotoHyperlinkTransfer`: expected-basis guard, cumulative planning with the active entry, recheck, one registry publication with rollback | The only write call |
| Basis | `photoHyperlinkTransferBasis` (document, FOTO source, session `stateKey`, FOTO basis key) | Captured when Kontroll opens, re-checked by the transaction at save |
| History / undo / redo | `gmi-edit/editSessions.mjs`. The entry kind `gmi-hyperlink-transfer-set` was already rendered by `GmiChangeList` as «Flytting av bildelenke» | Unchanged |
| FOTO proposed state / locks | `photoHyperlinkTransferScope.mjs` views, overlay, guard | Reused for the reopened review and for map fitting |
| Validator | `openGmiValidator(layerId, dataset, ruleId, scope, { by })`. The workspace runs on selection and honours `gmiValidatorFocus` by `canonicalFieldId` | Navigation to Foreslått + `attachmentLink` |
| FOTO workspace vs Validator | `validatorActive = !workspaceLayer && …` | «Kontroller i Validator» first leaves FOTO through its own `requestWorkspaceAction` boundary |

## 2. Files

**New (3):**

- `src/lib/photos/photoHyperlinkReviewSave.mjs`
  - `photoLinkReviewSavePlan`
  - `capturePhotoLinkReviewBasis`
  - `savePhotoLinkReview` (the receipt)
  - `photoLinkReviewSavedState`
  - `photoLinkReviewSaveMessage`
  - `PHOTO_LINK_SAVE_BLOCKER_TEXT`
- `tests/photoHyperlinkReviewSave.test.mjs`: 9 tests on the real owners.
- `tests/photoHyperlinkReviewWritableUi.test.mjs`: the production browser workflow (5 subtests).

**Modified, application (8):**

| File | Change |
|---|---|
| `src/lib/photos/photoHyperlinkReview.mjs` (+35/−10) | `PHOTO_LINK_REVIEW_WRITABLE = true`. `savedTransfers` input sets `group.saved` and `target.savedIncoming`. The reducer refuses selecting a saved group. New issues: `already-transferred`, `target-saved-same-photo` (blocking) and `target-saved-transfers` (warning). Progress gains `moves`, `keeps`, `deliveryOutcomes` and `saveBlocker`. |
| `src/components/photos/PhotoHyperlinkReviewDialog.js` (+148/−23) | Kontroll step (below). Basis capture on entering Kontroll, opening the Rettinger session if needed. Guarded save. A receipt state that outlives the remount. Saved-group note. Map toggle. Rettinger-driven refresh. `onInspectInValidator`. Boundary text. |
| `src/components/photos/PhotoHyperlinkReviewMap.js` (+38/−15) | Simplified evidence map (§3) |
| `src/components/photos/photoHyperlinkReview.css` (+19) | Scoped rules for the saved list, coordinates, save status, receipt, map controls and legend. Existing tokens only; no new colour. |
| `src/app/page.js` (+13/−3) | `leavePhotoWorkspace(then)` (shared with `exitPhotoWorkspace`). `inspectPhotoTransferInValidator` passes through `guardGmiEditDraft` and opens `openGmiValidator(layerId, 'proposed', 'attachmentLink', 'point', { by: USER })`. |
| `src/components/photos/usePhotoHyperlinkTransfers.js` (+3) | `'use no memo'` (§4) |
| `src/lib/photos/photoHyperlinkTransferScope.mjs` (+10) | `photoHyperlinkTransferPresentedPhotos` (accepted records plus the verified overlay, read-only) |
| `src/components/photos/PhotoMapController.js` (+4/−1) | «Fit to layer» uses the presented photos (1B.2B §3 limitation) |

**Modified, tests (5):** deliberate contract updates (§6).

**Unchanged:**

- The transaction, planner, verifier, delivery planner and composition.
- Every fixture and expected hash.
- The five pre-existing status-only test paths, which still have no content diff.

## 3. Behaviour

### Pairing

- The four outcomes are unchanged, and nothing is selected automatically.
- A group already moved by the active transfer shows «Lagret i Rettinger: flyttet til SLU · Punkt 108 i Foreslått. Originalen viser fortsatt koblingen til dette objektet. Angre i Rettinger for å endre.» Its checkbox is disabled, and the reducer refuses it as well.
- A recipient that already received a saved transfer carries the warning «Mottakeren har allerede N lagret flytting(er) …».
- Moving the same photograph to that recipient again is blocked.

### Evidence map

- By default the map draws only:
  - the source (navy ring);
  - the selected recipient (filled teal dot with a light edge);
  - the photograph's accepted position, with its provenance in the legend and tooltip (for example «GMI», «EXIF», «Manuell»);
  - a dashed move line.
- A line above the map states «Kilde → mottaker: XY 0,16 m».
- **«Vis andre punktobjekter på siden (n)»** (teal checkbox) adds the other point objects of the current candidate page, and the fit then includes them.
- The full candidate search and list, paging and eligibility rules are unchanged.
- The map has no base map, so the fit may zoom to level 24. The synthetic 0,16 m pair renders ≥ 12 px apart (asserted); about 30 px is observed in the screenshots.

### Kontroll

**Already saved.** «Allerede lagret i Rettinger (n)» lists the active transfers as file: source → recipient. If FOTO no longer matches the saved transfer, it says so.

**New decisions.** «Nye beslutninger (n)» has one row per decision:

| Column | Content |
|---|---|
| Bilde | Filename and raw references; for a move, «Nå: GMI/EXIF/uplassert · Foreslått: mottakerens GMI-posisjon» |
| Kilde | Tema · Punkt, identifiers (AnleggsID), GMI position (EPSG:4326, monospace) |
| Handling | The chosen outcome (and the current delivery status for GML/Ikke) |
| Mottaker | Tema · Punkt, identifiers, GMI position, «N eksisterende bildereferanse(r) beholdes» or «Ingen eksisterende bildereferanser», and the saved-transfer count |
| XY-avstand | The distance used in the review |
| Status | Avklart/Uavklart, with blockers and warnings |

«Endre» returns to that pairing and keeps the other decisions.

**Save status.** One status line, named by `aria-describedby` on the button:

| State | Text |
|---|---|
| ready | «Klar til å lagre N flytting(er) som én retting i Rettinger.» |
| blocked | The blocker text |
| preparing | Shown while the basis is captured |
| saving | «Lagrer endringer …» |
| error | The error, as `role=alert` |

**«Lagre endringer»** is the step's only primary action (FOTO teal). It is disabled unless:

- every selected decision is resolved;
- there is at least one move;
- no GML/Ikke decision is selected;
- the active transfer, if any, is `current`;
- the basis was captured.

### Save

1. The transaction re-validates everything against the live owners.
2. It re-plans cumulatively with any earlier active transfer.
3. It verifies, and re-checks the basis.
4. It publishes once.

On failure, nothing is written, and the Norwegian message ends with «Ingen endringer er lagret, og valgene dine er beholdt.» The step-specific action follows:

- **stale basis:** names Rettinger, FOTO or GMI, and asks the user to return to pairing and reopen Kontroll, which recaptures the basis;
- **publish failure:** «Prøv igjen»;
- **planner blockers:** lists their codes.

**Repeated clicks:**

- A ref guard ignores clicks while a save is running or after it has succeeded.
- A second save with the same Kontroll basis is refused by the transaction (`stale-basis`).
- In the browser test, three synchronous clicks produced one entry.

### Receipt

- It reads, for example: «1 bilde flyttet · 1 bildereferanse flyttet», «SYNT_TOPP_1.png: LOK · Punkt 293 (AnleggsID …) → SLU · Punkt 108 (AnleggsID …)».
- It states the Foreslått/original boundary and points to «Angre siste retting».
- It counts earlier saved transfers that were kept.
- The heading receives focus.
- Actions: «Avslutt gjennomgang», «Gjennomgå flere bildelenker» (a fresh review on the new state) and the primary «Kontroller i Validator».

### FOTO and Rettinger after saving

These are the 1B.2B surfaces, now reachable. The list reads «Foreslått: SLU · …». The inspector's «Flyttet bildelenke» shows the Foreslått and original owner and position, and Godkjent. The moved photograph is locked; unrelated photographs stay editable. Rettinger shows one «Flytting av bildelenke» entry with file and Punkt → Punkt. Undo and redo drive FOTO.

## 4. Defect found and fixed: FOTO did not follow Rettinger publications

**Observed.** In the browser, the first save worked: the transfer was active, the view `current`, the lock and delivery `transferLocked` correct, and Validator Foreslått changed. The FOTO list and inspector, however, still showed the original owner. I checked this with runtime inspection of the registry and FOTO session in a temporary debug run, which was deleted afterwards.

**Cause.** The cause was established in the production chunk. The React Compiler compiled `usePhotoHyperlinkTransfers` so that it subscribes to `gmiEditStatus` but memoises only on `photoLayers`. The `void statuses` refresh signal was dropped. A Rettinger commit, undo or redo therefore did not refresh FOTO until an unrelated FOTO publication.

- This was latent since 1B.2B: no transfer could be created in the app then, so no browser test could see it.
- `page.js` was checked in the same chunk: the compiler left that component uncompiled, and its delivery memo keeps the `workspaceTransfer` dependency.
- The review dialog already opts out.

**Fix.** `'use no memo'` in the hook, the established convention (see `useGmiEditLayer`).

**Coverage.**

- A static contract test requires the opt-out in both files that rely on a Rettinger refresh signal.
- The browser test now asserts the FOTO proposed state after a save, and the original after undo.

## 5. Delivery integration

- **Library tests (`photoHyperlinkReviewSave.test.mjs`).** After a save made through the review module:
  - all four modes are `ready`;
  - Kun GMI, Delt and Samlet carry `gemini-a5-transfer-unverified`;
  - Kun GML med bilder without the explicit inclusion withholds the previously unplaced moved photograph with `hyperlink-transfer-unplaced-withheld`;
  - planning changes no history entry, and the FOTO lock persists.

  The 1B.3A suites (byte composition, verification, attachment checks, reimport, split field-correction policy) are unchanged and pass.
- **Browser.**
  - The delivery wizard opens from Rettinger with «Flyttede bildelenker tas med: 1 bilde · 1 bildereferanse til et annet punktobjekt» and «0 endrede felt i 0 rettinger» (the field-only count from 1B.3A verification). Screenshots at both sizes.
  - Closing the wizard keeps the transfer.
  - Not browser-exercised: downloading packages per mode, and rendering of the Kun GML med bilder inclusion checkbox. The synthetic browser photographs are placed at their GMI position by «Koble bilder til GMI-laget», so no inclusion decision arises; the checkbox is covered by the 1B.3A verification library tests.

## 6. Deliberate contract changes

| Test | Before | Now | Safety coverage retained |
|---|---|---|---|
| `photoHyperlinkTransferTransaction` «no user-facing write entry point …» | Nothing in `src/` may reach the transaction; the dialog has no «Lagre endringer» | Exactly one route. Only `photoHyperlinkReviewSave.mjs` may import the transaction, and only `{ commitPhotoHyperlinkTransfer, photoHyperlinkTransferBasis, photoHyperlinkTransferDecision }`. It must not name the registry commit, set builders or `setDeliveryIntent`. Its only importer is the dialog, which never names the transaction; the dialog has exactly one «Lagre endringer». | Every other file is scanned with the unchanged pattern. The scope module stays view-only. |
| `photoHyperlinkTransferIntegration` exports test | `WRITABLE === false`; the dialog names neither «Lagre endringer» nor the commit | `WRITABLE === true`; the dialog names neither the transaction nor the registry commit | The other FOTO/Rettinger surfaces are still scanned |
| `photoHyperlinkTransferExport` | `WRITABLE === false` | `true` | The export assertions are unchanged |
| `photoHyperlinkReview` (2 tests) | `saveReady` always false | Save-ready follows resolution: a resolved chain of moves is ready; an unresolved one gives `saveBlocker: 'unresolved'` | Every resolution and blocker assertion is unchanged |
| `photoHyperlinkReviewUi` (1A.2 browser) | No «Lagre» in Kontroll; the map waits for ≥ 5 SVG paths (all page candidates were drawn) | «Lagre endringer» exists, is disabled while a decision is unresolved, and states the blocker. The map waits for source, recipient, move and photograph markers and no other candidates by default. | No «Utfør» or «Legg til retting». Close, Escape and workspace exit still discard the choices and leave FOTO and Rettinger unchanged. |

No fixture, expected hash, manifest or safety assertion elsewhere was changed.

## 7. Verification

| Check | Result |
|---|---|
| New unit suite `tests/photoHyperlinkReviewSave.test.mjs` | **9 passed, 0 failed** |
| Focused: review, transaction, integration, export, 1B.1 transfer | **95 passed, 0 failed** (after the contract updates) |
| Full serial Node `node --test --test-concurrency=1 --test-reporter=tap "tests/*.test.mjs"` | First run (before the last test additions): 2,399 passed, 0 failed, 156 skipped. **Final tree: 2,400 passed, 0 failed, 157 skipped** (2,557; 137 s). The extra skip is the new browser file without `PHOTO_UI_URL`. |
| Fresh isolated production build `%TEMP%/gmi-1b4a-build` (`src/` identical by `diff -rq`, no `.env.local`, node_modules junction, `npm run build -- --webpack`) | Passed (exit 0). Rebuilt twice after the §4 fix and the map-fit change; the final browser runs used the final `src/`. |
| Focused production browser: `photoHyperlinkReviewWritableUi` + `photoHyperlinkReviewUi` (task-owned port 3196) | **9 passed, 0 failed, 0 skipped** |
| Complete serial production browser `"tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"` (final build, port 3196) | **493 passed, 2 failed, 11 skipped** (506; 605 s). Both failures are one intermittent subtest of `photoMarkerProvenanceUi` and its parent; see §7a. |
| ESLint, affected JS/MJS files (8 application, 7 test) | Exit 0 |
| `git diff --check`; trailing-whitespace scan of the new files | Exit 0 (LF/CRLF notices only) |

**Failures during development**, all fixed before the final runs:

1. Two of my own unit expectations were wrong: Tema resolves from S_FCODE, and the parser trims cell values.
2. A react-leaflet detail: `pathOptions.className` is not passed to the Leaflet constructor (v5 spreads only top-level props), so the marker classes became top-level props.
3. The §4 defect.

### 7a. The complete browser run

**Failed: `photoMarkerProvenanceUi` › «both viewport layouts keep the shared-palette display card clear of map controls».** The assertion was «all five markers are inside the rendered map». The subtest resizes the viewport, waits a fixed 800 ms and checks marker bounds. It issues no fit request and involves no transfer.

**Reruns.** All reruns used the same final build (port 3196) and a HEAD `src/` build (`%TEMP%/gmi-1b4a-head-build`, port 3197), alternating between the two:

| Build | Runs | Failures |
|---|---|---|
| Task build | 1 complete suite + 3 isolated + 8 alternated | **2** (the suite and isolated run 3, same assertion) |
| HEAD | 8 alternated | **0** |

**Assessment: open intermittent observation, not established as pre-existing.** Not reproduced on HEAD, but no causal path was found.

- Without an active transfer, the changed fit helper returns the same `getLayerPhotos` array, and fitting runs only on a fit request.
- `'use no memo'` changes only when the transfer map recomputes, which it now does on Rettinger publications; this test makes none.
- The failure rate (2/12) is low and timing-shaped (a fixed wait after a resize).

Rerun this file on the next browser run, and investigate the marker bounds at 1280×720 if it recurs.

**Every other browser file passed,** including both review suites and the 1B.3A-related `deliveryWizardUi`, `photoExportReturnUi` and `photoExportWizardUi`. The 11 skips need private-corpus, dev-server or optional variables.

**Processes.**
- Task-owned servers on 3196 (task build) and 3197 (HEAD comparison) were started by this task and stopped by PID after checking their command lines; neither port has a listener.
- Pre-existing servers on 3110–3113 were not touched.
- The isolated copies `%TEMP%/gmi-1b4a-build` and `%TEMP%/gmi-1b4a-head-build` remain as local aids (synthetic only, no `.env.local`).

**Logs** (local, synthetic only) are in this session's scratchpad: `node-full.log`, `node-full-final.log`, `browser-full.log`, `ui-review.log`, `provenance-*.log` and `prov-*.log`.

## 8. Screenshots (synthetic, production build)

Synthetic 1×1 images; these prove layout and state, not real-photograph acceptance. Folder: [`20261122-111331-hyperlink-review-writable-batch1b4a/`](20261122-111331-hyperlink-review-writable-batch1b4a/).

| View | 1280×720 | 1366×768 |
|---|---|---|
| Pairing, default evidence map (0,16 m) | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-pairing-map-1280x720.png) | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-pairing-map-1366x768.png) |
| Map with other point objects | — | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-pairing-map-others-1366x768.png) |
| Kontroll, ready to save | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-kontroll-1280x720.png) | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-kontroll-1366x768.png) |
| Receipt | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-receipt-1280x720.png) | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-receipt-1366x768.png) |
| Validator on Foreslått, S_HYPERLINK | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-validator-proposed-1280x720.png) | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-validator-proposed-1366x768.png) |
| FOTO inspector, Flyttet bildelenke | — | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-foto-inspector-1366x768.png) |
| Reopened review with the saved transfer | — | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-reopened-1366x768.png) |
| Rettinger «Flytting av bildelenke» | — | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-rettinger-history-1366x768.png) |
| Delivery wizard, Innhold | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-delivery-content-1280x720.png) | [capture](20261122-111331-hyperlink-review-writable-batch1b4a/save-delivery-content-1366x768.png) |

## 9. Manual acceptance checklist: LOK Punkt 293 → SLU Punkt 108 (AnleggsID SL8)

Photograph `SL8.TOPP_20260923_1438_01.jpg`, about 0,16 m apart. Use the authorized file and environment only.

1. **Before.** Load the GMI as a map layer, then «Koble bilder til GMI-laget» with the photographs. Record:
   - photo count;
   - the accepted position and delivery choice of the photograph;
   - the Rettinger history (empty);
   - the Validator S_HYPERLINK result on Original for Punkt 293 and 108;
   - optionally the original GMI checksum.
2. **Pairing.** FOTO «Verktøy → Gjennomgå bildelenker på LOK/TOP…», GMI-kilde «… · koblet GMI-lag». Open LOK · Punkt 293 and select the photograph.
   - Nothing may be preselected.
   - SLU · Punkt 108 should be the nearest candidate, at 0,16 m.
   - Choose it. The map should show the source ring, the recipient dot (visibly apart), the photograph with its provenance, and «Kilde → mottaker: XY 0,16 m».
   - Toggle «Vis andre punktobjekter» on and off.
   - Check that the search still finds distant objects.
3. **Kontroll.** Check the row:
   - the filename;
   - LOK · Punkt 293 and SLU · Punkt 108 with AnleggsID SL8;
   - both positions;
   - 0,16 m;
   - the recipient's existing links;
   - Avklart, with no «Må avklares».
   - Use «Endre» once and return.
   - Try adding a «Lever som GML» decision on another photograph: saving must be refused with the explanation. Change it back.
4. **Save.** Press «Lagre endringer» once (optionally double-click).
   - The receipt must show «1 bilde flyttet · 1 bildereferanse flyttet», SL8 and the Foreslått/original notice.
   - Rettinger «Endringer» must show exactly one «Flytting av bildelenke».
5. **Validator.** Press «Kontroller i Validator».
   - Datasett = Foreslått, and the S_HYPERLINK field opens.
   - Compare with Original for Punkt 293 and 108. Record whether the original finding is resolved, replaced or accompanied.
   - Nothing may be labelled corrected; unrelated findings stay.
6. **FOTO.**
   - The list row shows «Foreslått: SLU …», with one marker at the SLU position on both maps.
   - The inspector «Flyttet bildelenke» shows Original and Foreslått.
   - Delivery pills, Edit, «Kontroller på nytt», «Fjern kilde», removal and layer delete are locked for this photograph, and available for an unrelated one.
   - «Zoom til lag» includes the moved photograph.
7. **Reopen the review.** The 293 group shows «Lagret i Rettinger: flyttet til SLU · Punkt 108», cannot be selected, and Kontroll lists it under «Allerede lagret».
8. **Undo / redo / discard in Rettinger.**
   - Undo: FOTO and Validator return to the original.
   - Redo: the same single entry.
   - Discard: all lifted.
   - Then redo or save again for step 9.
9. **Export.**
   - Kun GMI: «Flyttede bildelenker tas med»; the revised SLU cell has the appended wrapper, the LOK cell is renumbered, and only those cells differ.
   - Samlet levering and Delt levering: the transfer is included; the split excludes field corrections only.
   - Kun GML med bilder: the photograph at the SLU position. If it was unplaced before, the explicit inclusion is needed.
   - After a download: the history is unchanged and the lock remains.
   - The A5 warning is visible.
10. **Report.**
    - Was the recipient correct, and were any blockers too strict or too lax?
    - The Validator outcome.
    - Any wording problems.
    - Gemini VA A5: separate authorized trial, not part of this checklist.

## 10. Remaining risks and limitations

- **Real-data and Gemini acceptance.** Real-data acceptance (§9) and Gemini VA A5 are open. Synthetic automation is not real-file acceptance.
- **FOTO changes while the review is open.** A FOTO change from outside while the modal review is open still remounts the review and discards the choices. This is the 1A.2 contract; such a change is only possible programmatically, because the dialog is modal. A stale save caused by a Rettinger change keeps the choices.
- **GML/Ikke are not saved by the review.** They must be set in FOTO, and the review explains this. Combining them into the same atomic entry remains a product decision (1B.2A §9).
- **Only one active transfer per GMI layer.** Transfers are cumulative, so earlier ones are kept. Changing a saved transfer requires undo in Rettinger; there is no in-review edit of saved transfers.
- **Not browser-exercised.** The complete four-mode download in the browser, and the Kun GML med bilder inclusion checkbox (see §5).
- **The evidence map's zoom range.** The map fits to level 24 because it has no base map. If an accepted photograph position is far from the source (for example EXIF), the fit zooms out and the source and recipient may overlap. The distance line and the legend then carry the evidence.

## Git and process state

- Branch `feature/photo-workspace`, HEAD `5eb8cf6` unchanged; staged diff empty. Nothing was staged, committed, pushed, deployed, reset, restored, stashed or cleaned.
- Task changes: 3 new files, 13 modified tracked files (8 application, 5 test), this report and its screenshot folder.
- The five pre-existing status-only test paths still have no content diff.
- A temporary debug test file (`tests/zzDebugWritable.test.mjs`) was created and deleted for the §4 diagnosis; it no longer exists.
- Processes: see §7a. No task server is running.
