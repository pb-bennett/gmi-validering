# Batch 1B.4B completion — post-acceptance usability refinements

2026-11-22, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `aa943ba` (unchanged, local). Continues [1B.4A](20261122-111331-hyperlink-review-writable-batch1b4a-completion.md). Progress record: [20261122-hyperlink-usability-batch1b4b-progress.md](20261122-hyperlink-usability-batch1b4b-progress.md). No subagents, private-corpus inspection, Gemini VA import, staging, commits, pushes or deployments.

**Scope note.** A second instruction arrived mid-task: remove user-visible Gemini VA import-test, test-date and acceptance-status messages (§6). This supersedes the original brief's «retain the existing Gemini A5 compatibility notice». The A5 delivery warning has therefore been removed, along with the other test-status messages. Internal reports and code comments still record compatibility status.

## Outcome

| # | Item | Result |
|---|---|---|
| 1 | Rettinger history → Data Table | Fixed. «Vis detaljer» now selects the geometry of the entry it opens. |
| 2 | «Kun endrede» columns | Changed. The reduced columns were a documented M4 contract. Kun endrede now filters rows only and puts changed fields first. |
| 3 | Kontroll / TXT field-correction count | Fixed. A transfer-only Kun GMI delivery reads «Rettinger: Ingen feltrettinger». |
| 4 | FOTO Kontroll layout | The wide table is replaced by one review card per decision. |
| 5 | Marker-layout intermittent | Reproduced and explained as a test-harness state carry-over, not a product defect. **Fixed in the test** (§5.1): subtests 5–7 now start from an explicit map view. |
| 6 | Gemini / test-status messages | Removed from the UI, the TXT report and the shared message catalogue. Safety checks are unchanged. |

## 1. History → Data Table navigation

**Root cause.** `GmiEditWorkspace.showChangeSet` (behind «Vis detaljer …») only opened the inspector. It never touched the table's geometry. The rest of what the user saw came from existing state:

- «Kun endrede» was the user's existing table mode.
- «S_HYPERLINK først» came from the `gmiEditColumnFocus` that `GmiChangeSetDetail` publishes.

The table therefore stayed on Ledninger.

**Change.**

- New pure helper `gmiChangeSetTableScope(changeSet)` (`src/lib/gmiEditView.mjs`). It returns `'point'` or `'line'` when every changed cell of the entry has that geometry, including a transfer's S_HYPERLINK cells. It returns `null` for a mixed or empty entry.
- `showChangeSet` calls the existing `syncObjectTable` with that scope, inside the draft guard, and only on this explicit action.
- Mixed entries keep the current tab, as before.
- Closing the details, background history changes, undo and redo are unchanged.
- The table mode, column focus and the user's other table preferences are not modified.

| Before | After |
|---|---|
| Ledninger + Kun endrede → «Vis detaljer for 2 punkter» → «Ingen ledninger i denne visningen» | Same action → Punkter, Kun endrede kept, the 2 changed points shown, S_HYPERLINK leading |

## 2. «Kun endrede» column visibility

**Root cause: an intentional, documented contract.** [M4](20261109-131625-gmi-edit-m4-rettinger-workspace.md) §Data Table: «The columns are the identity columns (S_FCODE, Tema/Type) plus the changed fields». It was implemented as an early return in the `LayerDataTable` fields memo.

- **Conflict with the request.** The contract deliberately dropped unchanged columns; the request keeps them.
- **Other M4 points kept.** Kun endrede still shows only objects with effective changes, and its view never rewrites the saved column order or sorting.

**Change (minimal).**

- `deriveLayerTableRows` returns `schemaItems`.
  - In Kun endrede, these are the same Tema/Felt-filtered rows Foreslått shows.
  - Otherwise they are `items` (the same array).
- The fields memo discovers ordinary columns from `schemaItems`, so Kun endrede and Foreslått share one column schema.
- The changed fields of the shown objects are placed directly after S_FCODE:
  - in the user's own relative order;
  - after any explicit review focus such as «S_HYPERLINK først»;
  - through the existing display-only `applyColumnFocus`.
- A changed field that is empty everywhere stays visible.
- Unchanged:
  - rows (only changed objects);
  - changed-cell styling and the Original/Foreslått tooltip;
  - sizing, sticky columns and horizontal scrolling;
  - the M4 rule that Kun endrede never persists column order or sorting.
- **Limitation.** While Kun endrede is active, a manual drag cannot place an unchanged column before a changed one, because changed fields stay first. Drags among changed or among unchanged columns work and are saved as before.

**Performance.** Synthetic Node timing, 20,000 points × 48 fields, derive plus column discovery:

| View | Time |
|---|---|
| Foreslått | 14.4 ms |
| Kun endrede | 16.4 ms |
| Kun endrede with a Tema filter | 14.4 ms |

Rows stay virtualised, so rendering cost is the same as in Foreslått.

| Before | After |
|---|---|
| Kun endrede: Nr., S_FCODE, S_HYPERLINK, Type | Nr., S_FCODE, S_HYPERLINK, then the ordinary columns (AnleggsID … ) |

## 3. Export Kontroll and TXT report counts

**Root cause.** `deliverySummary` used `plan.gmiSummary.fieldEditCount ?? changedCells`.

- The composition and removal paths (Samlet, Delt) set `fieldEditCount`.
- Kun GMI's summary comes from `buildGmiFieldExport`, which has no `fieldEditCount`. It fell back to `changedCells`, which are the 2 S_HYPERLINK diff cells of one transfer.
- `deliveryCorrectionCounts`, used by the Innhold step, was already correct.

**Change.**

- New helper `deliveryFieldCorrectionCount(plan)`, used for both the Kontroll summary and the TXT report. It takes:
  - `fieldEditCount` where present;
  - otherwise the transfer's own `hyperlinkTransfer.fieldEditCount`;
  - otherwise the non-reserved (non-S_HYPERLINK) diff changes.
- Zero now reads «Ingen feltrettinger» in Kun GMI and Samlet.
- Delt with zero field corrections reads «Ingen feltrettinger», instead of «0 feltrettinger utelates (uttrykkelig valgt)», which claimed an exclusion choice that never existed.
- The «Flyttede bildelenker» row is unchanged.
- No export bytes, attachment accounting or verification code was touched.

| Case | Kun GMI / Samlet | Delt |
|---|---|---|
| Transfer only | Ingen feltrettinger · 1 bilde · 1 bildereferanse flyttet | Ingen feltrettinger · Inkluderes: 1 bilde … |
| Field + transfer | 1 feltretting tas med · 1 bilde … | 1 feltretting utelates (uttrykkelig valgt) · Inkluderes: … |
| Field only | 1 feltretting tas med (no moved-links row) | 1 feltretting utelates (uttrykkelig valgt) |
| Kun GML med bilder | Ingen GMI-eksport; rettingene beholdes i Rettinger (unchanged) | — |

## 4. FOTO hyperlink review — Kontroll layout

The 7-column table is replaced by an ordered list of review cards (`<ol>`, one `<li>` per decision). Each card:

- **Heading (`h5`).** The filename, the outcome (Handling), Avklart/Uavklart, and «Endre» at the top right with its existing accessible name.
- **Fact grid** with the same tracks in every card, so decisions line up for comparison:
  - **Kilde:** Tema · Punkt, identifiers, EPSG:4326 position.
  - **XY-avstand.**
  - **Mottaker:** Tema · Punkt, identifiers, position, existing recipient links, saved-transfer count.
  - **Bilde:** the current FOTO position source and «Foreslått: mottakerens GMI-posisjon», or the current delivery choice for GML/Ikke.
- **Below the grid:** blocker and warning messages at full width, and the «Rå lenkeuttrykk» disclosure.

Other details:

- Unresolved cards also have a red inset edge, alongside the «Uavklart» text.
- Already-saved transfers stay in their own «Allerede lagret i Rettinger» section, with a soft background and heading, separate from «Nye beslutninger».
- Unchanged: the save status, `aria-describedby`, readiness rules and the transaction boundary.
- Styling uses existing tokens only, scoped under `.photo-link-review`. No new colour or variant.
- Below 900 px the grid becomes two columns.

All evidence is preserved. The browser test asserts the labelled facts, the «Endre» name, and that no fact is clipped or narrower than 90 px.

## 5. Intermittent `photoMarkerProvenanceUi` failure — investigation (fixed in §5.1)

**Method.** A scratch probe copy of the test (in the session scratchpad, untracked) recorded every marker's and the map's bounding box at 0, 50, 150, 300, 500, 800, 1500 and 3000 ms after each resize, and the map pane transform after each subtest and selection. Task build, port 3198.

**Observations.**

1. **Not a resize/layout race.** Geometry is identical from 0 ms to 3000 ms after the resize in every run. Leaflet keeps the view centre on resize, as designed.
2. **The margin is tiny.** In the normal case the «Manuell» marker sits **23 px** inside the left map edge at 1280×720.
3. **Reproduced in 1/8 plain probe runs and 3/10 instrumented runs.** Each time, the view arrived at the viewport subtest already shifted by **(−30, −23) px**, which puts that marker 7 px outside.
4. **The shift comes from subtest 4** («delivery colours are the default …»), not from the failing subtest. Subtest 4 ends with this sequence:
   - resize to 1280×720;
   - resize to 1366×768 **with no wait**;
   - `select(repeated[1].id)`, which waits only for `aria-pressed` and starts an animated overlay-clearing selection pan;
   - resize to 1920×1080 **with no wait**.

   Whether the pan is applied before or after the map has processed the preceding resize decides the final centre.
5. **A fix in subtest 4 is not safe on its own.** Waiting for a stable map at those points (existing `waitForStableMap`) removed the shift in 12/12 runs. But it made subtest 5's hover assertion fail in 12/12 runs («the visual hover preview retains accepted provenance»: Manuell ≠ EXIF). Subtest 5 also depends on the view state that subtest 4 leaves behind.

**Assessment.**

- This is a **test-harness state carry-over race** across subtests.
- It is **not a product defect.** Selection pans and the centre-preserving resize are intended behaviour.
- It is not related to the hyperlink-transfer code, because none of these subtests creates a transfer.
- It is not established whether it also occurs at HEAD; no HEAD runs were made in this batch.

**Recommendation (implemented in §5.1).** Give subtests 5 and 6 a defined starting view instead of inheriting subtest 4's, then settle subtest 4. That needs a decision on how much to restructure this browser file. During this investigation no wait was lengthened, no assertion was weakened, no sleep was added, and the tracked test was left unchanged. §5.1 gives subtests 5–7 explicit start views and leaves subtest 4 as it is.

In the final complete browser run this file passed.

### 5.1 Test isolation fix (follow-up task)

A follow-up task implemented the recommendation above. Only `tests/photoMarkerProvenanceUi.test.mjs` changed; production code and the rest of 1B.4B are unchanged. Subtests are numbered in file order: 4 is «delivery colours are the default …», 5 «selection, hover …», 6 «both viewport layouts …», 7 «Pass 1D …».

**Two carry-over mechanisms.** Both were confirmed with an instrumented, untracked probe copy in the session scratchpad. The probe recorded the map pane transform, the Leaflet zoom and centre, marker boxes, the last trusted pointer position, `:hover` and the open hover preview at each subtest boundary.

1. **View.** The plain probe failed 2 of 12 runs. Both failures had the view shifted by (−30, −23) px at the start of subtest 5, which leaves the «Manuell» marker −7 px outside the map at 1280×720. The other 10 runs had pane (0, 0) and the marker 23 px inside. Forcing that shift at the end of subtest 4 (`panBy([30, 23])`) made the original test fail **3/3** with «all five markers are inside the rendered map».
2. **Pointer.** The real CDP pointer stays at (650, 700), where subtest 3 clicks to place hand.png, so it rests on the «Manuell» marker. If the view brings a marker under the pointer, Chrome sends that marker a real `mouseenter`, and its preview competes with the subtest's synthetic one. Moving the real pointer onto that marker before subtest 5 made the original test fail **3/3** with «the visual hover preview retains accepted provenance» (`'Manuell' !== 'EXIF'`). This is the same signature as observation 5 in §5.

**Change.** A test-local `startView(width, height)` helper:

- sets the viewport;
- moves the real pointer off the page (`Input.dispatchMouseEvent` to (−1, −1));
- lets any pan in flight finish, using the existing `waitForStableMap`;
- calls `invalidateSize` and then resets the view with Leaflet's documented `setView(…, { reset: true })` option. The target is the centre of all photo placements (the markers' `data-lat` / `data-lng`) at `START_ZOOM = 14`, the zoom the earlier subtests navigate to, so the scale stays as before. `reset` is needed because, at an unchanged zoom, `{ animate: false }` still pans from the previous pixel origin; the probe showed a residual pane offset of (70, −80).
- waits for a stable map again;
- fails closed if no photo map with placements is found.

The helper runs at the start of subtest 5 (1920×1080), on each iteration of subtest 6 (1920×1080 and 1280×720, so the 1280 check no longer inherits the 1920 iteration's selection pans), and at the start of subtest 7 (1920×1080). Each replaces the existing viewport call or comes just before the subtest's first step.

The map instance is reached from the test's existing init script. A setter on Leaflet's public `window.L` global, which the bundled Leaflet 1.9.4 assigns, registers a public `L.Map.addInitHook` that records maps in `window.__photoTestMaps`. This follows the tile-source interception already in that script.

**What did not change:**

- every assertion and expected value, including marker bounds, legend layout and provenance;
- subtest 4's own sequence;
- the existing 800 ms layout wait. No sleep was added and no wait was lengthened.

**Not a product defect.** A viewport change that arrives during an animated selection pan leaves a centre a few pixels different from one that arrives after it. Both are Leaflet's centre-preserving resize behaviour. The selected photo stays in view in both cases, so no production change was justified.

## 6. Gemini VA / test-status message cleanup

**Removed categories.**

| Category | Where | Removed |
|---|---|---|
| Dated import-test claim | Delivery wizard Kontroll hint (`data-export-gemini-import`), information list, TXT report | `gemini-va-tested-import` message («… importert i Gemini VA i et testet oppsett 16. november 2026 …»): no longer emitted by `hyperlinkRemoval.mjs`; hint and message entry removed |
| «Not acceptance-tested» notes | Delivery warnings and TXT | `gemini-g4-unverified` (preserve-ordinal removal) and `gemini-a5-transfer-unverified` (moved photo links): no longer emitted; `GMI_TRANSFER_RECIPIENT_PENDING` export removed |
| Acceptance disclaimer | Delivery Kontroll and TXT | «… eller Gemini-akseptanse» removed. «Dette er eksportkontroll, ikke en ny Validator-kjøring eller full XSD-sertifisering. Originalfilen endres ikke.» kept, because it is a real scope statement. |
| Format-card import-test status | FOTO export Format step, Package step, delivery «Tekniske detaljer» | `compatibility` («Importert i Gemini VA/GeoFoto i testet oppsett …», «Ikke testet med import i Gemini VA.») removed from `PHOTO_EXPORT_PROFILE_METADATA` and its three renderings, plus the CSS rule |
| Import-test level | FOTO export status (`data-export-level="import"`) | «Import i Gemini VA: Profilen er importert tidligere, men denne pakken er ikke testet / Ikke verifisert … Må testes manuelt.» removed |
| Dated claim in a schema warning | Capture-time schema warning | «Gemini VA har importert bilder uten opptakstid i et testet oppsett (november 2026).» removed; the schema fact stays |
| Development-maturity wording | FOTO export information | «Eksperimentell …» prefixes, «Gemini-aksept er ukjent», «Gemini-import må testes manuelt», «testeksporten», and the `path-convention` note («appens testkonvensjon») |

**Replacement wording** (facts only):

- «Én godtatt forekomst blir én Skråfoto-feature. Ingen ny kameraposisjon utledes.» (label «Én feature per forekomst»)
- «Retning angis med klokken i grader fra geografisk nord (enhet 1, referanse 1).»
- «AsBuilt-fotogeometrien er 2D, uten Z.»
- «… er ikke med i denne eksporten.»

**Kept,** because each is a genuine, actionable fact:

- the UTC capture-time note;
- «Bare dato eksporteres ikke til Gemini VA»;
- Z placeholder, time-zone, metadata-omission and unpacking instructions;
- format names («Gemini-kompatibel Skråfoto 2019», «Til import i Gemini VA og GeoFoto»);
- all blocking, attachment and verification diagnostics;
- the AppInfo (Om) prose.

**Unchanged:**

- `PHOTO_EXPORT_IMPORT_EVIDENCE` and `readiness.levels.importEvidence`. They are internal records that are no longer rendered.
- Format profiles, independent verification, ordinal policy, the composition planner and all safety checks.

**Files:** `deliveryWizard.mjs`, `DeliveryWizard.js`, `deliveryComposition.mjs`, `gmi-edit/index.mjs`, `hyperlinkRemoval.mjs`, `photoExportRules.mjs`, `photoExportPlan.mjs`, `photoExportDiagnostics.mjs`, `photoCompletion.mjs`, `PhotoExportDeliveryStep.js`, `PhotoExportPackageStep.js`, `photoExportWizard.css`.

## Exact file inventory

**Application (18 modified):**

- `src/components/LayerDataTable.js`
- `src/components/delivery/DeliveryWizard.js`
- `src/components/gmi-edit/GmiEditWorkspace.js`
- `src/components/photos/PhotoExportDeliveryStep.js`
- `src/components/photos/PhotoExportPackageStep.js`
- `src/components/photos/PhotoHyperlinkReviewDialog.js`
- `src/components/photos/photoExportWizard.css`
- `src/components/photos/photoHyperlinkReview.css`
- `src/lib/delivery/deliveryWizard.mjs`
- `src/lib/gmi-edit/deliveryComposition.mjs`
- `src/lib/gmi-edit/hyperlinkRemoval.mjs`
- `src/lib/gmi-edit/index.mjs`
- `src/lib/gmiEditView.mjs`
- `src/lib/layerTableRows.mjs`
- `src/lib/photos/export/photoExportDiagnostics.mjs`
- `src/lib/photos/export/photoExportPlan.mjs`
- `src/lib/photos/export/photoExportRules.mjs`
- `src/lib/photos/photoCompletion.mjs`

**Tests (22 modified):** the 21 below, plus `tests/photoMarkerProvenanceUi.test.mjs` from the §5.1 isolation fix (test-only: start-view helper, map capture in the init script, three call sites).

New coverage:

| File | Coverage |
|---|---|
| `layerTableRows.test.mjs` | `schemaItems` |
| `photoHyperlinkTransferIntegration.test.mjs` | history geometry for the real transfer entry and for ordinary, line, mixed and empty entries |
| `photoHyperlinkTransferExport.test.mjs` | count cases across modes |
| `photoHyperlinkReviewWritableUi.test.mjs` | Rettinger navigation, Kun endrede columns, review-card facts, delivery Kontroll count; the fixture gains one line with a unique GUID |

Deliberate contract updates:

| File | Update |
|---|---|
| `photoHyperlinkReviewUi.test.mjs` | Cards instead of table rows; same five facts in the same order |
| `objectTableInspection.test.mjs`, `tableSearch.test.mjs` | Source pattern now `schemaItems`, still pre-search rows |
| `deliveryExclusion`, `deliveryWizard`, `deliveryWizardUi`, `gmiEditHyperlinkRemoval`, `gmiEditWorkspaceUi`, `photoAcceptanceRenderingUi`, `photoCompletion`, `photoCompletionUi`, `photoEvidenceUi`, `photoExportFlowUi`, `photoExportWizard`, `photoExportWizardUi`, `photoHyperlinkReviewSave`, `photoLoadedGmiUi` | Assertions on removed wording or codes now assert their absence, or the remaining factual text. No safety assertion was relaxed: plans are still `ready`, blocked or byte-checked exactly as before. |

**Reports (new, untracked):**

- this report;
- the progress record;
- the screenshot folder `20261122-183732-hyperlink-usability-batch1b4b/`.

Unchanged:

- the five longstanding status-only test paths (still no content diff);
- fixtures, expected hashes, manifests;
- the transaction, export and verification architecture.

## Verification

| Check | Result |
|---|---|
| Focused Node suites (delivery, transfer, review, export, completion, row derivation, workspace) | 323 passed, 0 failed, 2 skipped (private corpus), then the remaining contract fix |
| Full serial Node `node --test --test-concurrency=1 --test-reporter=tap "tests/*.test.mjs"` | First run: 2,401 passed, **2 failed** (two static source patterns pinning the old `fieldItems` line), 157 skipped. After updating those patterns: **2,403 passed, 0 failed, 157 skipped** (2,560; 139 s). |
| Fresh isolated production build `%TEMP%/gmi-1b4b-build` (`src/` identical by `diff -rq`, no `.env.local`, node_modules junction, `npm run build -- --webpack`) | Exit 0. `src/` was unchanged after the build; only tests changed afterwards. |
| Focused browser: `photoHyperlinkReviewWritableUi` + `photoHyperlinkReviewUi` (task-owned port 3198) | **10 passed, 0 failed.** Earlier failures during development were my own: a duplicated synthetic GUID, which the review correctly blocked; an `evaluate` returning a DOM node; and an empty-column expectation. |
| Complete serial browser `"tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"` | **495 passed, 1 failed, 11 skipped** (507; 625 s). The failure was my own updated assertion in `photoExportFlowUi` (it hard-coded «1 bilde» where the fixture has 3). It was corrected to a sentence-level match, and the file was rerun: **12 passed, 0 failed, 1 skipped**. `photoMarkerProvenanceUi` passed in this run. |
| ESLint, all changed JS/MJS files | 0 errors, 1 warning (the existing TanStack `react-hooks/incompatible-library` notice in `LayerDataTable.js`) |
| `git diff --check` | Exit 0 |

**§5.1 isolation fix.** Same isolated production build; its `src/` was still identical to the working tree by `diff -rq`, and no source file was newer than its `BUILD_ID`. Task-owned server on port 3198.

| Check | Result |
|---|---|
| Plain probe of the original test (instrumented, untracked) | 10 passed, **2 failed** of 12. Both failures had pane (−30, −23) at the start of subtest 5 and the «Manuell» marker at −7 px at 1280×720. |
| Original test, forced (−30, −23) view after subtest 4 | **3/3 failed**: «all five markers are inside the rendered map» |
| Original test, real pointer moved onto the «Manuell» marker after subtest 4 | **3/3 failed**: «the visual hover preview retains accepted provenance» (`'Manuell' !== 'EXIF'`) |
| Fixed test, forced (−30, −23) view | **3/3 passed**. Zoom 14, identical centre, pane (0, 0) at 1280×720 |
| Fixed test, forced view plus pointer on «Manuell» | **3/3 passed**. No marker in `:hover` |
| Tracked `photoMarkerProvenanceUi.test.mjs`, 20 consecutive runs | **20/20 passed** (9 subtests each, 0 skipped) |
| Complete serial browser `node --test --test-concurrency=1 "tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"` | **496 passed, 0 failed, 11 skipped** (507; 596 s; exit 0) |
| ESLint `tests/photoMarkerProvenanceUi.test.mjs` | 0 errors, 0 warnings |
| `git diff --check` | Exit 0. The file keeps CRLF endings (385 CRLF / 385 LF). |

The Node suite and the build were not rerun because no application or Node-tested file changed.

**Skips (11).** Private corpus, dev server or optional variables (`PHOTO_GML_FIXTURE`, `GMI_PHOTO_CORPUS`, `PHOTO_DEV_UI_URL`). Synthetic automation is not real-file acceptance.

**Logs (local).**

- In `%TEMP%/gmi-1b4b-build`: `node-full.log`, `node-full-final.log`, `browser-full.log`, `ui-review.log`.
- In the session scratchpad: `prov-probe-*.log`, `prov2-*.log`, `prov3-*.log`.
- §5.1: `browser-full-isolation.log` and `server-3198-isolation.log` in `%TEMP%/gmi-1b4b-build`. The probe generator `make-probe.mjs`, probe copies and `iso-*.log` are in the follow-up session's scratchpad.

## Screenshots (synthetic, production build)

Folder [`20261122-183732-hyperlink-usability-batch1b4b/`](20261122-183732-hyperlink-usability-batch1b4b/).

| View | 1280×720 | 1366×768 |
|---|---|---|
| Data Table: Punkter + Kun endrede after «Vis detaljer for 2 punkter» | [capture](20261122-183732-hyperlink-usability-batch1b4b/table-changed-points-1280x720.png) | [capture](20261122-183732-hyperlink-usability-batch1b4b/table-changed-points-1366x768.png) |
| FOTO Kontroll, one resolved move | [capture](20261122-183732-hyperlink-usability-batch1b4b/save-kontroll-1280x720.png) | [capture](20261122-183732-hyperlink-usability-batch1b4b/save-kontroll-1366x768.png) |
| FOTO Kontroll, unresolved move + «Behold uendret» | [capture](20261122-183732-hyperlink-usability-batch1b4b/foto-kontroll-1280x720.png) | [capture](20261122-183732-hyperlink-usability-batch1b4b/foto-kontroll-1366x768.png) |
| Delivery Kontroll, transfer-only Kun GMI | [capture](20261122-183732-hyperlink-usability-batch1b4b/save-delivery-kontroll-1280x720.png) | [capture](20261122-183732-hyperlink-usability-batch1b4b/save-delivery-kontroll-1366x768.png) |

The folder also holds the regenerated 1A.2 and 1B.4A review captures from the same runs.

## Remaining issues and manual acceptance

- **§5 intermittent:** fixed in the test (§5.1). Subtest 4 still ends with a variable view, but later subtests no longer depend on it.
- **Test dependency:** `startView` depends on the bundled Leaflet assigning `window.L`, which Leaflet 1.9.4's UMD build does. If a future Leaflet or bundling change stops that, the helper fails closed with «No photo map with placed photos for the start view».
- **Real data.** Repeat with `SL8.TOPP_20260923_1438_01.jpg`:
  1. «Vis detaljer for 2 punkter» from Ledninger + Kun endrede → Punkter, with the ordinary columns kept.
  2. Delivery Kontroll and TXT read «Ingen feltrettinger» plus «Flyttede bildelenker: 1 bilde · 1 bildereferanse …».
  3. The Kontroll card is readable.
  4. No import-test wording appears anywhere in export or FOTO.
- **Kun endrede drag limitation** (§2).
- **Recipient acceptance.** Gemini VA A5 recipient acceptance is still not established. It is recorded in reports only and no longer shown in the UI, as instructed.

## Git and process state

- Branch `feature/photo-workspace`, HEAD `aa943ba` unchanged; staged diff empty.
- Nothing was staged, committed, pushed, deployed, reset, restored, stashed or cleaned.
- **Processes.** The task-owned server on port 3198 (cmd PID 63652, node PID 58908; command lines checked) was stopped, and the port has no listener. Pre-existing servers on 3110–3113 were not touched.
- **Isolated copy.** `%TEMP%/gmi-1b4b-build` remains as a local aid (synthetic only, no `.env.local`).
- **Probe scripts** are in the session scratchpad only. No temporary file was added to `tests/`.
- **§5.1 follow-up.**
  - Branch `feature/photo-workspace`, HEAD `aa943ba` unchanged; staged diff empty.
  - The only new tracked-file change is `tests/photoMarkerProvenanceUi.test.mjs`.
  - The five status-only `tests/gmi*Ui.test.mjs` paths still have no content diff.
  - The task-owned server on port 3198 (node PID 53212, cmd PID 31100; command lines checked) was stopped, and the port has no listener. Servers on 3110–3113 were not touched.
  - No subagents, staging, commits, pushes or deployments.
