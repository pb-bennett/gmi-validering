# Batch 1A verification, regression resolution and M5C race correction

2026-11-20, Europe/Oslo. Continues the [Batch 1A checkpoint](20261120-164243-lok-top-kum-batch1a-completion.md), which remains the record of the implementation, its domain decisions, screenshots and the six Batch 1B decisions. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `4511c39590609119f80cf758e926a1763fdab78c` (unchanged). No subagents, private-corpus inspection, staging, commits, pushes, deployments, branch or dependency changes.

This report covers two continuations:
- **Part 1:** Batch 1A verification. Resolved the checkpoint's three browser failure roots and diagnosed the M5C failure.
- **Part 2:** the M5C race correction. The user authorized it after Part 1 with a narrow scope, noting that «Lag retting…» will be retired in the legacy cleanup.

## Outcome

- The three checkpoint failure roots (G8, marker provenance, workspace stacks) were test timing defects; they are resolved without any application change.
- M5C was a **pre-existing application race**, reproduced on HEAD without Batch 1A. It is corrected narrowly in `startCorrection`, with a fail-closed explanation for genuine staleness and a deterministic regression.
- Three further pre-existing test-only settling gaps surfaced during the final complete runs (A7, EXIF placement helper, A5 colour transition) and were fixed by waiting for the actual application signal. One intermittent failure (GML capture) could not be reproduced or root-caused; it is recorded below.
- **Final gates (fresh production build of the final source): Node 2,321/0/156; complete browser 489/0/11.**

## Part 1 — Batch 1A verification findings

1. **G8 linked Tema** (`gmiObjectLinkedTemaUi.test.mjs`). Passes against the final shared poller.
   - Helper review: `waitFor` catches only a `TypeError` raised when the test's own predicate reads `querySelector`/`querySelectorAll` from a null/undefined parent.
   - Every other error is re-thrown through `exceptionDetails`. The deadline is unchanged, and the last stack is attached to the timeout.
   - Page-side application exceptions do not pass through this path, so they are not suppressed.
2. **Marker provenance, Pass 1D** (`photoMarkerProvenanceUi.test.mjs`).
   - Reproduced by instrumentation: after «Lukk FOTO» the main map runs an animated Leaflet pan of about 250 ms.
   - Mid-pan, marker rects sit at fractional positions. `right − left` then loses one float32 ulp (44 − 2⁻¹⁴ = 43.99993896484375), affecting one of the five markers.
   - CSS size stays 44, and rects are exactly 44 at rest. The pan is existing behaviour (`PhotoMapController.js`, commit `0472c72`).
   - The following subtest's failure was a cascade.
3. **Workspace stacks, line 434** (`photoWorkspaceStacksUi.test.mjs`).
   - Captured state shows the click path is correct.
   - Observed directly: a popup autoPan started before «Åpne i bildemodul» (pane at `81px` of `267px`) finishes on the main map after FOTO closes (`130 → 267px`).
   - The test measured `hitAt` and then pressed while the pane was still moving, so the press missed.
4. **Ruled out:** the Batch 1A `page.js` navigation effect (redundant Zustand notification only; there are no whole-store subscribers, and v5 selectors re-render only when their slice changes).

Fix for 2 and 3: a new `waitForStableMap` helper in `tests/helpers/photoWorkspace.mjs`, a sibling of `waitForStableEditTarget`. The exact geometry, hit-target and popup assertions are unchanged.

**Safety review (Batch 1A):**
- Dialog state is component-local. Choices go through the pure reducer, and there is no save, execute or transfer control.
- Reads only: `photoSession.getLayerPhotos/getLayerDelivery`, ticketed `loadedGmiSources.begin/read`, the existing `gmiEditSessions.proposed` accessor and `useGmiEditLayer` without `autoOpen`.
- The only store write in the Validator handoff is the ephemeral, unpersisted `gmiPhotoReviewRequest`. Both sides check the same dataset revision, and the dialog re-validates live binding, session and date.
- No path found that modifies accepted photos, source bytes, hyperlink ownership, delivery intentions, Rettinger history or export state.

## Part 2 — M5C race correction

### Root cause (corrected)

Part 1 attributed the layer replacement to `gmiEditSessions.open()`. A store-subscription diagnostic around the await (scratch build, 6× CPU throttle) showed otherwise:
- The replacement came from **an asynchronous per-layer `terrain` update** (the terrain-profile fetch queue and results). The diff showed `changed: ["terrain"]`, and `open()` itself writes only `gmiEditStatus`.
- `startCorrection` compared the whole layer **object**, so a terrain update during the open was treated as a source change.
- It then **returned silently**: no Rettinger, no message.
- When the machine isn't loaded, terrain finishes before the click, which is why the race appeared only intermittently.

Terrain, visibility and highlight updates all spread `...layer` and keep `data`. Validation reruns only on layer, data revision and date.

### Correction (`src/lib/gmiValidatorEditing.mjs`, `src/components/validation-v2/ValidationV2Workspace.js`)

- New pure `validatorCorrectionBasisCurrent(started, live)`, placed next to the existing handoff checks. The basis is current only when:
  - the selected layer's **`data`** identity is unchanged, both in the component ref and in the store;
  - the layer still exists;
  - the **result** identity is unchanged;
  - the **reference date** is unchanged, both in the ref and in the store.
- Map-only layer replacements therefore pass.
- A genuinely stale basis now **fails closed with an explanation** in the existing `role="alert"`: «Validator-grunnlaget endret seg mens Rettinger ble åpnet. Kontroller resultatet og velg «Lag retting…» på nytt.» (`VALIDATOR_CORRECTION_BASIS_CHANGED`).
- All downstream safeguards are unchanged: `opened.ok`; `prepareValidatorCorrection` (session/run layer, `datasetRevision` per finding); store `openGmiEditWorkspace` → `validatorCorrectionSelection` (session, handle, document, fingerprint, `gmiSourceIntact`, per-object id/GUID against `layer.data`); the draft guard and re-`prepare()` at commit.
- No redesign or extension of the legacy workflow.

### Modern Validator → Rettinger handoff

Not exposed to this mechanism:
- `openGmiValidatorSelection` → `openGmiEditWorkspace({ kind: 'validator-selection' })` runs `prepare()` synchronously, with no await window. It also re-runs `prepare()` at commit.
- Its checks (`validatorSelectionHandoff`, `validatorInspectionLayer`) compare content identities (layer id, selection/inspection objects, session/handle/document, fingerprint, intact source, per-object id/GUID) and never the layer wrapper object.
- It fails closed through `gmiEditHandoffError` with `VALIDATOR_CORRECTION_STALE`. No change was needed.

### Regression coverage

- **Unit (deterministic), `tests/gmiValidatorEditing.test.mjs`:**
  - terrain-only and visibility-only layer replacements keep the basis current;
  - stale cases: replaced data in the store, replaced data in both ref and store, removed layer, another layer, new or absent result, date change in the ref or in the store, missing source data, and no result.
- **Browser (real component, real await window), `tests/gmiValidatorEditingUi.test.mjs`:**
  - in the same task as the «Lag retting…» click, Kontrolldato is changed, so the change always lands inside the `await open()`;
  - the explanation must appear, no batch inspector may open, and the Validator must stay open.
  - It runs inside the existing subtest after its no-session preconditions, because the open itself creates a session.
  - The original flow then proceeds normally.
- **Fails on the unfixed build:**
  - against the old guard (scratch build, no throttling), the browser case failed deterministically (no alert);
  - the old guard has no data/wrapper distinction, so the terrain case is exactly what the unit predicate now separates.
- **The map-only race in the browser:** the layer panel, and with it the visibility and highlight controls, is not rendered while the Validator is open. I found no deterministic browser trigger without a readiness delay, which was not permitted, so it is covered by the unit predicate and by the throttled reproduction below.
- **Throttled verification:** the exact Part 1 reproduction (original M5C flow, CPU throttle applied before the click, which previously failed every time on both the Batch 1A and the HEAD builds) now passes at **6× (8/0/0) and 20× (8/0/0)** on the fixed build.

### Other failures found during the final complete runs

| Run | Failure | Root cause | Action |
|---|---|---|---|
| 1 (488/1/11) | `gmiA7ColumnFocusUi.test.mjs:28` «Unavailable: Punkter» after 1.1 s | Pre-existing test readiness gap: the only Rettinger test that clicks the table tab without waiting for the async workspace chrome. Every sibling waits. Never opens the Validator. | Wait for the actual `[data-table-geometry]` before the click, the established sibling pattern |
| 2 (486/2/11) | `photoHyperlinkReviewUi` «Unavailable placement exif» | `createLayerWithPlacement` → `chooseImportPlacement('exif')` waited for thumbnails but not for EXIF reading. The app correctly disables `exif` while `data-exif-pending` > 0 (`PhotoImportPlacementStep.js:17`); capture showed «0 plassert · 1 uten posisjon». Affects 9 callers. | Wait for the dialog's own `data-exif-pending === '0'` before choosing `exif` (as `createLayerWithoutPlacement` already does) |
| 2 | `photoGmlCaptureApprovalUi` «Unavailable source control: Koble og posisjoner bilder» | **Not established.** The header showed «4 bilder», so the item would have been enabled; the map was still loading. Not reproduced at 1× (twice), 6× or 20×. The test never opens the Validator. | None (no speculative change). Passed in 4 of the 5 complete runs in this task (Part 1, and Part 2 runs 1, 3 and 4). Recorded as an unexplained intermittent |
| 3 (480/9/11) | `rettingerPhotoVisibilityUi` subtest 3 colour `rgb(2,115,147)` vs `rgb(0,117,149)` (+7 cascades) | Pre-existing settling gap: the test waited for `backgroundColor` only. Background, colour and border share the 150 ms transition but reach exact final values on different frames. Styling unchanged. | Await the element's own CSS transitions (`getAnimations().finished`). The exact colour/size assertion is unchanged |
| 4 | — | — | **489/0/11 (500)** |

Each complete rerun followed an identified cause. Focused checks after each fix: A7+M5C 9/0/0; review 3/0/0; A5 11/0/0 twice.

## Final results (final source and test inventory)

| Check | Result |
|---|---|
| Fresh isolated production build `%TEMP%/gmi-batch1a-20261120-m5c/` (`npm run build -- --webpack`), `src/` byte-identical before and after | Passed |
| Unit `tests/gmiValidatorEditing.test.mjs` | 14/0/0 |
| Updated M5C suite, unthrottled | 8/0/0 |
| Original M5C reproduction at 6× / 20× CPU throttle | 8/0/0 and 8/0/0 (previously failed every time) |
| Full serial Node, final inventory | **2,321 passed, 0 failed, 156 skipped** (2,477) |
| Complete serial production browser, final inventory | **489 passed, 0 failed, 11 skipped** (500 cases, run 4) |
| ESLint, 27 affected JS/MJS files | Exit 0 |
| `git diff --check` | Exit 0 (LF/CRLF notices only) |

Part 1 results for reference: Node 2,320/0/156 and browser 482/7/11 (M5C only), on the earlier snapshot build.

Commands (Bash; servers were task-owned; private/dev opt-ins unset):

```sh
node --test tests/gmiValidatorEditing.test.mjs
PHOTO_UI_URL=http://localhost:3163 node --test tests/gmiValidatorEditingUi.test.mjs
DIAG_RATE=6|20 PHOTO_UI_URL=http://localhost:3163 node --test <scratch copy of original M5C flow, throttled before «Lag retting…»>
node --test --test-concurrency=1 --test-reporter=tap "tests/*.test.mjs"
PHOTO_UI_URL=http://localhost:3163 node --test --test-concurrency=1 --test-reporter=tap "tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"
npx --no-install eslint <27 files in the inventory below>
git diff --check
```

Scratch logs: `%TEMP%/gmi-batch1a-m5c-{node2,browser,browser2,browser3,browser4,focused}.log`, `%TEMP%/gmi-m5c-{unfixed,fixed}.log`, plus the Part 1 logs. Diagnostic builds: `%TEMP%/gmi-batch1a-head-diag/` (HEAD plus one warn) and `%TEMP%/gmi-m5c-diag/` (layer-change subscription). These are local continuation aids only and contain synthetic data only.

## Screenshot evidence

Part 2 changed only the Validator's stale-basis message path; no styling or layout was touched. The Batch 1A captures in the checkpoint remain current. I re-inspected [explicit choices 1280×720](20261120-164243-lok-top-kum-batch1a/foto-selected-1280x720.png) and [map evidence 1366×768](20261120-164243-lok-top-kum-batch1a/foto-map-evidence-1366x768.png). The production suites re-asserted the laptop layout at both sizes in the green run.

## Consolidated file inventory

Application (10):
- Batch 1A: `src/lib/photos/photoHyperlinkReview.mjs`, `src/components/photos/PhotoHyperlinkReviewDialog.js`, `src/components/photos/PhotoHyperlinkReviewMap.js`, `src/components/photos/photoHyperlinkReview.css`, `src/components/photos/PhotoWorkspaceToolsMenu.js`, `src/components/validation-v2/ValidationV2RuleList.js`, `src/app/page.js`, `src/lib/store.js`.
- `src/components/validation-v2/ValidationV2Workspace.js`: Batch 1A handoff plus the **M5C correction**.
- `src/lib/gmiValidatorEditing.mjs`: **M5C** predicate and message.

Tests/helpers (18):
- Batch 1A: `tests/photoHyperlinkReview.test.mjs`, `tests/photoHyperlinkReviewUi.test.mjs`, `tests/chromeHarness.test.mjs`, `tests/helpers/chromeHarness.mjs`, `tests/photoInspectorPresentation.test.mjs`, `tests/photoWorkspaceEditUi.test.mjs`, `tests/gmiBatchFieldValueInputUi.test.mjs`, `tests/gmiEditSelectionUi.test.mjs`, `tests/gmiR4UxPolishUi.test.mjs`, `tests/gmiLayerFiltersUi.test.mjs`.
- Part 1: `tests/helpers/photoWorkspace.mjs`, `tests/photoMarkerProvenanceUi.test.mjs`, `tests/photoWorkspaceStacksUi.test.mjs`.
- Part 2: `tests/gmiValidatorEditing.test.mjs`, `tests/gmiValidatorEditingUi.test.mjs`, `tests/gmiA7ColumnFocusUi.test.mjs`, `tests/helpers/photoImportWizard.mjs`, `tests/rettingerPhotoVisibilityUi.test.mjs`.

Documentation: the checkpoint report, its eight PNGs, and this report. Affected JS/MJS for lint: 27.

Status-only paths without content differences (not task changes; not reset): `tests/gmiBatchInspectorUi.test.mjs`, `tests/gmiCheckboxSoftFocusUi.test.mjs`, `tests/gmiFieldValueInputUi.test.mjs`, `tests/gmiFieldValueSearchUi.test.mjs`, `tests/gmiTableReviewUi.test.mjs`. The untracked roadmap `20261120-154700-final-functional-reconciliation-release-planning.md` is preserved, with SHA-256 prefix `7e101955b0fa6106` unchanged.

## Remaining limitations

- `photoGmlCaptureApprovalUi`: one unexplained intermittent failure (complete run 2) with no established root cause. It passed in the other complete runs and in four focused runs, including at 6× and 20× throttle. If it recurs, capture the tools trigger, popup and item state at the moment of failure; the shared `clickSourceControl` currently reports the same «Unavailable» message for all three causes.
- The browser regression for the map-only race is indirect: no deterministic UI trigger is reachable while the Validator is open. It is covered by the unit predicate and by throttled reproduction.
- «Lag retting…» is scheduled for retirement in the legacy cleanup. This correction is deliberately minimal and does not extend it.
- The complete browser gate was green on one complete run (run 4) after fixes found in runs 1–3; that is not evidence of long-run stability. Synthetic fixtures only. Real-file, real-photograph and recipient acceptance remain manual.
- Batch 1A is review-only. No ownership-transfer, patch, history, export or recipient behaviour exists or was added.

## Manual acceptance checklist

Use the [checkpoint's real-data workflow](20261120-164243-lok-top-kum-batch1a-completion.md#concise-real-data-acceptance-workflow), steps 1–7. In short:
1. Record photo counts, accepted positions/provenance, GMI/GML/Ikke choices, correction history, Validator state and export readiness before review.
2. FOTO Verktøy → «Gjennomgå bildelenker på LOK/TOP…»: check source, basis, exact cells, reference counts, shared/missing/ambiguous files.
3. Compare all KUM candidates, identifiers, XY/Z and existing target links on representative LOK and TOP cases. Nearest is not proof.
4. Make explicit choices, including duplicate/shared and already-on-KUM cases, alternative positions and conflicting delivery intentions.
5. Close by footer, X and Escape, and leave and re-enter FOTO. Confirm everything from step 1 is unchanged and the proposals are gone.
6. From point S_HYPERLINK findings, use «Gjennomgå i FOTO» on both revisions: restricted population, full-source toggle, missing-assets view, point-only applicability, stale-source explanation.
7. M5C: right after loading a GMI (ideally on a slow machine), use «Lag retting…» on an SDR/trykklasse/ringstivhet finding. Rettinger must open. Changing Kontrolldato or the layer while it opens must show «Validator-grunnlaget endret seg …» and not open Rettinger.

## Batch 1B decisions (unchanged, for user review after manual acceptance)

The six decisions in the checkpoint remain open: relationship/candidate matching; hyperlink grammar and recovery; duplicate/reference grouping; existing target hyperlink reuse; accepted positions and delivery intentions; Z evidence and recipient interpretation. No Batch 1B work was done.

## Final Git and process state

- Branch `feature/photo-workspace`, HEAD `4511c39` unchanged, staged diff empty. Nothing staged, committed, pushed, deployed, reset, restored, stashed or cleaned.
- Task-owned servers on ports 3160, 3161, 3162 and 3163 were started and stopped by this task; none is listening. Pre-existing servers on 3110–3113 were left untouched.
- Scratch build directories under `%TEMP%` remain as local continuation aids, with synthetic data only.
