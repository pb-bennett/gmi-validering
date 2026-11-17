# FOTO M3: explicit GML capture-time approval

**IMPLEMENTED — M3 only, uncommitted**

Date: 2026-11-17, Europe/Oslo. Branch `feature/photo-workspace`, HEAD `c12b37d`, clean working tree at start.

Plan: `20261117-135049-foto-capture-date-filename-gml-reconciliation-planning.md` §6, §7.2, §7.3, §9 and §12.3. Builds on the M1 report (`20261117-173852-…-m1-implementation.md`) and the M2 report (`20261117-174943-…-m2-implementation.md`).

No subagents. Nothing staged, committed, pushed or deployed.

## 1. Outcome

GML capture time is no longer adopted automatically. In both existing wizards the user now chooses it explicitly, and both options start unchecked.

**Where the choice appears:**
- the positioning wizard's **Koblinger** step, saved with «Behold GML-kilden» / «Oppdater treff»;
- the import wizard's **Kontroll** step with «Fra GML-fil».

**Unchanged:**
- EXIF capture-time adoption;
- GML/EXIF direction policy;
- positioning and the later Kontroll confirmation.

No new wizard steps. Not touched: M4 presentation/export warnings, M5, export XML, filename parsing, GML geometry placement, map styling, delivery decisions and LOK/TOP → KUM.

## 2. Files

| File | Change |
|---|---|
| `src/lib/photos/photoAutoMetadata.mjs` | `planAutoCaptureTime` adopts only complete EXIF. It writes only over an empty value or an automatic EXIF value; every other accepted value, including any older automatic GML value, is a decision |
| `src/lib/photos/photoGmlCaptureReconciliation.mjs` | Added selection helpers only: `EMPTY_GML_CAPTURE_DECISION`, `gmlCaptureDecisionWrites`, `selectedGmlCaptureRows` and `gmlCapturePlanSignature`. The M2 planner is unchanged and is the only reconciliation logic |
| `src/lib/photos/photoSession.mjs` | Plan registry and identity guard; `draftGmlCapturePlan`, `applyGmlCaptureTimeRows` and `commitLayerSource`; `planLayerSourceCaptureTimes(layerId)`; the decision argument on `saveSourceWorkflowSource`, `applyLayerSource`, `completeImport`, `createLayer`, `appendImport` and `applyLoadedGmiImport`; `previewImport` returns `gmlCaptureTimes` |
| `src/lib/photos/photoImportWizardState.mjs` | `gmlCaptureTime` state keyed by draft-GML `sourceId`, plus `importGmlCaptureDecision` |
| `src/components/photos/PhotoGmlCaptureTimeChoices.js` (new) | Shared choices component |
| `src/components/photos/PhotoPositioningWizard.js` | Choices in Koblinger, the decision sent with the save, and `SourceStages` copy |
| `src/components/photos/PhotoImportWizard.js` | Choices on Kontroll for «Fra GML-fil»; the decision passed to `completeImport` |
| `src/components/photos/photoCollectionPanel.css` | Scoped `.photo-gml-capture*` rules (tokens only) |
| `tests/photoGmlCaptureApproval.test.mjs` (new) | 12 session tests |
| `tests/photoGmlCaptureApprovalUi.test.mjs` (new) | 2 browser tests |
| `tests/helpers/photoEvidenceFixtures.mjs`, `tests/helpers/photoCompletionFixtures.mjs` | `attachGml(…, captureTime)` and `completionLayer({ captureTime })` send an explicit decision with its plan |
| `tests/photoAutoMetadata`, `photoCaptureAgreement`, `photoCaptureSuggestions`, `photoCompletion`, `photoEvidenceAdoption`, `photoEvidenceExportChain`, `photoWorkspace`, `photoImportWizardState`, `photoCompletionUi`, `photoPositioningUi` (`.test.mjs`) | Contract tests rewritten deliberately (§6) |
| this report | |

## 3. Automatic behaviour removed

- **Before:** `autoAcceptMetadata()` ran on every publication. It accepted complete GML before EXIF and replaced automatic EXIF. Attaching a GML source, in either wizard, therefore adopted GML times at the next publish.
- **Now:** GML evidence is still attached and kept, but no publication path can adopt it.
  - This is enforced in the policy itself, so the guarantee does not depend on the wizards.
  - Declined values stay evidence: «Opptakstid i kilde», the completion hub and the per-photo dialog still offer them.
  - A recheck offers them again.
- **Explicit GML values are protected.** They are written without `acceptance`, with provenance `{ …evidenceProvenance, via: 'positioning-wizard' | 'import-wizard' }`, so the automatic pass skips them.

## 4. Wizard integration

### Shared component

`PhotoGmlCaptureTimeChoices` renders one M2 plan. Only options with candidates are shown:

- `Bruk opptakstid fra GML (n)`: complete fills and completions.
- `Bruk ufullstendig opptakstid fra GML (n)` if any partial value has minutes, otherwise `Bruk kun dato fra GML (n)`.
- If the plan has `conflicts` or `reviewRows`, a compact SJEKK panel follows (`gmi-validation-panel`, `data-validation-tone="warning"`, Phosphor `WarningIcon`). It contains:
  - a one-sentence title;
  - the group radio «Ved avvik»: **Behold gjeldende** (default) / Bruk GML;
  - «Vis avvik (n)» with one row per photo: thumbnail, filename, «Gjeldende: time · source», «GML: time» and the reason («Annen opptakstid», «Kan fullføres» or «Kan erstatte anslått dato»).

Controls:
- Checkboxes and radios carry `accent-gmi-interactive`; computed `rgb(0, 117, 149)` is verified in the browser.
- Ambiguous rows and agreeing no-ops are neither listed nor counted.
- No helper paragraphs were added.

### Positioning wizard (Koblinger)

- **Planning.** The plan comes from `photoSession.planLayerSourceCaptureTimes(layer.id)`, which is pure. It is re-planned when the review re-freezes, so it always reflects live assets.
- **Choices.** Staged in component state, keyed by `sourceId` plus new/recheck:
  - kept through Kilder ↔ Koblinger navigation;
  - reset for another source, for a recheck, and after saving.
- **Save.** «Behold GML-kilden» sends `{ captureTime: { complete, partial, conflicts, plan } }`. `commitLayerSource` then:
  1. revalidates;
  2. attaches the source and evidence;
  3. writes the selected rows;
  4. publishes **once**.
- **Declining every option still saves the source**, with no time adopted.
- **Directions** are still adopted through the existing policy at that publication.
- **Copy.** The pre-save line «Ingen posisjoner eller retninger endres.» was wrong, because directions can change. It now reads «Lagrer filen og treffene. Ingen posisjoner endres.» After saving, the line adds «Opptakstid er brukt for n bilde(r).» when times were written.

### Import wizard (Kontroll, «Fra GML-fil»)

- **Plan.** `previewImport` returns `gmlCaptureTimes`, planned against the incoming assets as the EXIF pass will leave them. That pass has not run on draft assets yet, so EXIF is compared with GML exactly as it will be kept (`exif-auto`).
- **Choices.** Stored in the reducer under the draft GML's `sourceId`. They survive back navigation and reset for another GML.
- **Independence from M1.** The M1 filename block stays separate and unchanged.
- **Commit.** `completeImport({ …, gmlCaptureTime })`:
  1. re-plans against live assets;
  2. compares plan signatures;
  3. refuses an asset that would receive both a filename and a GML write (`review-changed`);
  4. passes `gmlCaptureRows` into `createLayer`, `appendImport` or `applyLoadedGmiImport`. The rows are written after `attachSource` and before that method's single `publish`.

  A test confirms the first publication already carries the chosen values.
- **Kept behaviour:**
  - photos with no chosen alternative still get EXIF automatically at that publish;
  - photos already in an append target are never touched;
  - cancel leaves nothing.

## 5. Conflict and approval semantics

| Decision | Writes |
|---|---|
| Both options off, «Behold gjeldende» (default) | Nothing |
| `Bruk opptakstid fra GML` | M2 `fill` + `completions` with `option: 'complete'`: empty values, and automatic-EXIF or filename values that agree and that GML makes more precise |
| Partial option | The same rows with `option: 'partial'`; precision is kept (`date` has no `T`, `minute` has no seconds) |
| `Bruk GML` | M2 `conflicts` + `reviewRows`: manual, estimated, chosen-EXIF, earlier-GML and filename values that differ, and protected values that can be completed |
| Never | Removed values (`captureTimeCleared`), ambiguous or duplicate references, `pending` (EXIF still being read), `unchanged` |

- A date-only filename value followed by a complete GML time on the same date is a **completion**, not a conflict. This follows M2.
- Estimates are compared as dates; noon is not treated as an observation.
- No time component or offset is ever invented. The value written is the GML value exactly as recorded.

**Transactional safeguards:**
- **Positioning.** The plan registry records the layer, the source object, the recheck flag, the member list and per-asset `captureMetadata`/`metadataEvidence`/`exifRead` identities. Each of these is refused with `review-changed`, and nothing is attached:
  - any identity mismatch;
  - a re-plan whose signature differs;
  - a decision without its plan;
  - a forged or copied plan;
  - a plan from a discarded review.
- **Import.** The existing preview guard (which already includes capture identity) is used, plus a plan-signature comparison.
- **Pending EXIF.**
  - Import refuses with `pending-exif` when a GML choice is on.
  - In positioning, `pending` rows are never written, and the EXIF value is adopted when the read finishes.
- **Idempotence.** A repeated save or recheck finds `already-accepted` and writes nothing; identities are unchanged.

## 6. Contract tests changed deliberately

Each change moves the capture-time expectation onto the explicit decision. Safety coverage is kept or added: no silent replacement, manual/removed values survive, repeated runs are no-ops, no offset borrowing.

**`photoAutoMetadata`**
- Priority is now EXIF only; GML is never automatic.
- Neither automatic/explicit GML nor filename values are replaced.
- Initial import keeps EXIF time; GML directions are unchanged.
- Late GML: EXIF stays and an empty value stays empty. A recheck with the option fills only the empty value, the conflict keeps EXIF, and a repeated save is a no-op.

**`photoCaptureAgreement`**
- Same-second: EXIF stays even with every choice on.
- Genuine differences: EXIF by default; the GML value is kept exactly on «Bruk GML».
- Offsets are tested in both directions.

**`photoCompletion`**
- Agreeing sources keep EXIF.
- On conflicts, «Behold» is the default and «Bruk GML» is explicit.
- Pending EXIF holds GML back (`isHeldBack`), then EXIF is adopted.

**Other session suites**
- `photoEvidenceAdoption`, `photoEvidenceExportChain`: the explicit «Bruk GML» route.
- `photoWorkspace`: no GML time after saving, while explicit evidence adoption still works.
- `photoCaptureSuggestions`: GML is adopted only on its own choice; the filename and GML candidate sets are disjoint.
- `photoImportWizardState`: +1 test for the GML choice state.

**Browser suites**
- `photoCompletionUi`: an agreeing row shows EXIF accepted with GML as evidence; the per-photo correction now chooses GML; the pending count is `0`.
- `photoPositioningUi`: ticks «Bruk opptakstid fra GML (2)» (verified unchecked first), then asserts «Opptakstid er brukt for 2 bilder.».

**New `photoGmlCaptureApproval.test.mjs` (positioning path)**
- Defaults write nothing, EXIF stays, and directions still follow GML.
- Options are independent and precision is exact.
- A filename date is completed after approval; a different date is a conflict.
- Manual, estimated, earlier-GML and removed values are protected under both decisions; a removal is never undone.
- Ambiguous references write nothing.
- Pending EXIF.
- Stale, foreign or forged plans are refused.
- Idempotence, plus unchanged bytes, `File` and filename.

**Same file (import path)**
- All five decisions apply on the first publication.
- Filename and GML choices apply together.
- Pending EXIF is refused; a changed draft is `review-changed`; cancel leaves nothing.
- Append leaves existing photos untouched, and ambiguous references are ignored.

**New `photoGmlCaptureApprovalUi.test.mjs`**
- Both wizards:
  - only applicable options appear, unchecked;
  - computed teal accent;
  - SJEKK tone, icon, title and row text;
  - navigation keeps choices;
  - inspector values after commit;
  - no runtime exceptions;
  - layout at 1280×720 and 1366×768 (no overflow, footer in view, one footer height), with screenshots.
- Positioning only:
  - keyboard arrow navigation in the radio group;
  - recheck resets to the defaults and «Bruk GML» replaces only the conflict.

## 7. Commands and results

| Check | Result |
|---|---|
| Baseline full serial suite at `c12b37d`, in a temporary detached worktree (removed afterwards) | 2354 tests: 2210 pass, **1 fail**, 143 skipped. The failure is `validationV2GmiA7` «Validator exposes only the automatic V2 workflow» (`/aria-label="Lukk Validator"/`) |
| `node --test --test-concurrency=1 tests/photo*.test.mjs tests/delivery*.test.mjs` (after the rewrites, before the new file) | 974 tests: 878 pass, 0 fail, 96 skipped |
| `node --test tests/photoGmlCaptureApproval.test.mjs` | 12/12 pass |
| Full serial `node --test --test-concurrency=1 "tests/*.test.mjs"` (final, without the browser URL) | 2369 tests: **2223 pass, 1 fail, 145 skipped**. The one failure is the same baseline Validator A7 failure |
| `npx --no-install eslint` on every modified and new JS/MJS file | Clean |
| `npm run build` | Pass |
| `git diff --check` and `--no-index --check` for new files | Clean (only the usual autocrlf notice) |
| Browser, fresh production build `next start -p 3197`, `PHOTO_UI_URL` set, serial: `deliveryWizardUi`, `gmiPhoto*Ui`, `photo*Ui`, `rettingerPhotoVisibilityUi`, `wizardNavigationUi` (first run) | 183 tests: 159 pass, 13 fail, 11 skipped. 3 failures were M3 contract tests, fixed in §6; 10 are not related to M3 (§8) |
| Browser rerun: `photoGmlCaptureApprovalUi`, `photoPositioningUi`, `photoCompletionUi` | All pass (the last run of the two new tests plus `photoCompletionUi`: 15 tests, 14 pass, 1 skipped private corpus) |

- **Screenshots** (`gml-capture-{koblinger,import-kontroll}-{1280x720,1366x768}.png`) were inspected:
  - the panels sit inside the step scroller;
  - the SJEKK border and icon use the warning palette;
  - the footer is intact.
- **Server cleanup.** The server I started (port 3197) was stopped and the port confirmed free.
- **Baseline worktree cleanup.** The `node_modules` junction was unlinked before `git worktree remove`.

## 8. Browser failures not caused by M3 (not modified)

Ten failures in three suites assert DOM that this change does not touch.

| Suite | Failures | Evidence |
|---|---|---|
| `gmiPhotoPlacementsUi` | 1 | Fails at line 122, where a marker is looked up by `marker.title`. Commit `2e3a05d` (before this task) replaced native marker titles with `element.removeAttribute('title')` in `PhotoMarkersLayer.js` |
| `photoMarkerProvenanceUi` | 7 | Its first failures are the same `marker.title` lookups (lines 103 and 216); the later failures in the same file follow from them |
| `photoWorkspaceStacksUi` | 2 | Fails on the collection header, which now reads «7 bilder · 8 plasseringer / GMI 8 / GML 0» (delivery counts), not on capture time. Its GML has no capture times |

- All three failed the same way in an isolated rerun.
- **Not confirmed by a baseline browser run.** A production build of the baseline worktree failed: Turbopack rejects a `node_modules` junction («Symlink node_modules is invalid»), and copying `node_modules` was impractical. These are therefore pre-existing **by code evidence**, not by a baseline browser run. Record them for the suites' owners.

## 9. Deviations and interpretations

1. **D2 default.** The plan recommended «Bruk opptakstid fra GML» checked. The task specified unchecked; implemented as unchecked.
2. **Positioning pending EXIF does not block saving.** Pending rows are excluded from the plan's options and never written; the source can still be saved. Import refuses with `pending-exif`, as M1 does.
3. **Positioning saves always send the plan,** even when everything is declined, so a stale review is refused with `review-changed` rather than saved silently.
4. **`SourceStages` text.** Only the incorrect «… eller retninger …» claim was removed, and the applied-count sentence was added. The completion hub note «Kildene oppgir ulike tider. Den prioriterte kilden er brukt.» still appears where EXIF is kept automatically against a differing GML. Its wording now overstates what happened («den prioriterte kilden» is GML). It belongs to M4 presentation and was left unchanged; a test comment records this.
5. **Older automatic GML values** (impossible to create after M3, since FOTO state is session-only) are treated as decisions and never replaced by EXIF.
6. **SJEKK title wording** is my own copy, because the plan sketch covered conflicts only:
   - «n bilder har en annen opptakstid i GML-filen.»
   - «… en mindre fullstendig opptakstid enn GML-filen.»
   - «… en annen eller mindre fullstendig …»

## 10. Remaining risks and manual acceptance

- **Real contractor sets** (mixed EXIF, filename and GML, with conflicts) have not been run through either wizard. Plan §12.4 Gemini VA acceptance remains open.
- **Users who relied on automatic GML times** must now tick an option. Exports will report missing times until they do. M4 should state this clearly in readiness/export.
- **Group-level decision only.** Per-photo overrides (D9) are out of scope; the per-photo metadata dialog is still available.
- **Manual checks:**
  1. Real GML with conflicts: verify the default keeps EXIF.
  2. «Bruk GML» replaces only the listed rows.
  3. A recheck offers declined values.
  4. Cancel at each step leaves nothing.

## 11. Git

- Branch `feature/photo-workspace`, HEAD `c12b37d`, unchanged.
- Nothing staged, committed, pushed or deployed.
- Modified: the 19 tracked files in §2. Untracked: the 3 new files plus this report.
