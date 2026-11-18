# Real-data acceptance corrections (18 November 2026): investigation and slice plan

**PLANNING — NOT IMPLEMENTED**

Date: 2026-11-18, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `c6a6abf` (verified at start), clean working tree at start. Read-only investigation: no application code, tests, fixtures or AGENTS.md were changed. No subagents. Nothing staged, committed, pushed or deployed.

Reports consulted: M1 (`20261117-173852`), M3 (`20261117-205436`, header only), acceptance UI corrections (`20261117-100442`), A5 Rettinger FOTO visibility (`20261114-184935`), FOTO correctness slice 1 (`20261116-124320`). Code read is cited below as `file:line` at HEAD `c6a6abf`.

Observed facts and recommendations are kept separate: each item has **Cause (observed)** and **Proposal (recommended)**. No private file was examined. The A1 filenames come from the task text, and the user asked for them to be used as regression fixtures.

---

## 1. Summary of confirmed causes

| Item | Confirmed cause | Primary location |
|---|---|---|
| A1 | The counter guard downgrades **every** compact `HHmm` reading on a date once any three values on that date are consecutive integers. Real minutes 1629–1631 trigger it, so OV1.1 (09:46) loses its time when batched. There is no knowledge of the trailing `_NN` suffix. | `src/lib/photos/photoFilenameCaptureTime.mjs:120-131`, `:144-152` |
| A2 | Combined export finds its GMI source only via `loadedBinding` (layer + input id). When a GMI file was attached first, staging the loaded layer later hits the fingerprint duplicate check and the wizard **rechecks the existing, unbound source**. Saving keeps it unbound, so export still fails. | `deliveryPlan.mjs:109-110,143`; `photoSession.mjs:1122-1125,1157-1174`; `PhotoPositioningWizard.js:186-195` |
| A3 | Preselection already exists, but it only sees bound sources. It is skipped whenever a stored `deliverySurveyId` exists, even a stale one, and it is not recomputed when the photo layer changes. | `DeliveryWizard.js:35-39,119`; `PhotoExportWizard.js:8` |
| B1 | The automatic GML delivery default is applied only to GML candidates. | `photoSession.mjs:809-810` (and `:1221`) |
| B2 | The FOTO map fits at most once per map mount, only when no survey data is loaded, and never after later layer creation or initial positioning. | `PhotoMapController.js:11-20` |
| B3 | A dataset switch changes the revision, and the revision effect calls `controller.selectLayer`. That resets the geometry tab to the default, and `NEW_RESULT` clears search and status filters. | `ValidationV2Workspace.js:357-363`; `validationViewController.js:24-29`; `resultPresentation.js:307-317` |
| B4 | The suppression visit key is Rettinger-only. | `page.js:199-212`; `rettingerPhotoVisibility.mjs` |
| B5 | Step 3's only primary action is `Neste`, disabled at zero selections. After a connection-only save there is no forward completion. | `PhotoPositioningWizard.js:384` |
| B6 | The fixed copy says revised GMI and link removal/renumbering are "ikke akseptansetestet". | `DeliveryWizard.js:78`; `deliveryWizard.mjs:72`; `hyperlinkRemoval.mjs:497`; `GmiEditWorkspace.js:396` |
| C1 | FOTO passes a hard 316 px and a CSS `clamp(292px, 23vw, 316px) !important`. | `page.js:945`; `photoWorkspace.css:2` |
| C2 | The list items are `flex-wrap` rows, so the time column starts wherever each filename ends. | `photoCollectionPanel.css:36-38` |
| C3 | The step 3 lead sentence always says "GML-posisjoner er valgt". | `PhotoPositioningWizard.js:321` |
| C4 | The input has `flex: 1`, which pushes the suffix to the far right. Affixes are plain muted text. There is no counter, and only one advisory level (> 80). | `deliveryWizard.css:12-23`; `PhotoExportDeliveryStep.js:28-53` |
| C5 | `Last ned rapport` sits inside the scrollable Pakke body (inventory section). | `DeliveryWizard.js:93-103,288-301` |
| C6 | The Analyse row uses hand-drawn 24-viewBox SVGs at 16 px with `strokeWidth=2`, teal colour, 28 px targets and a native `title`. The layer actions above use Phosphor Regular at 14 px in 22 px `PhotoIconButton`s with subtle colour. | `LayerPanel.js:111-265` vs `:557-568`; `globals.css:60-61` |
| C7 | Profilanalyse shows a dot whenever any result is `warning`/`error`, using raw `bg-red-500`/`bg-yellow-500`. | `LayerPanel.js:170-175` |

---

## 2. Findings and proposals per item

### A1 — Filename timestamp sequence-counter false positives

**Cause (observed).**
- `parseFilenameCaptureTime` reads `0710261.1_20261007_1500_01` as date `20261007` (ymd-compact), followed by compact minute `1500`. The `(?!\d)` guard stops at `_`, so the `_01` is ignored. The leading `0710261` is 7 digits and correctly produces no date token.
- `sequenceCounterDates` (`:120-131`) groups **all** compact-minute readings by date and looks for any run of three consecutive integers. On 2026-10-07 the example values are 941, 942, 946, 1500, 1501, 1629, 1630, 1631, 1632. The run 1629-1630-1631 marks the whole date.
- `planFilenameCaptureSuggestions` (`:144-152`) then downgrades every compact reading of that date, including OV1.1 09:46 and VL1.5 09:41.
- Imported alone, OV1.1 has no group, which explains the observed difference. On 2026-10-06 the example values 1305, 1310, 1311 form only a run of 2. That date is downgraded only if the full delivery contains another neighbouring minute.
- The 9 photos with no suggestion cannot be explained without the corpus. Plausible fail-closed causes are: no date token, an invalid clock (M1 deviation 2), PXL/WhatsApp exclusion, or conflicting tokens. These are not assumed to be defects.

**Proposal (recommended).**
1. **Recognise the sequence suffix.**
   - In `followingTime`, after a compact `HHmm` match, accept exactly one `_` or `-` followed by exactly two digits, then the end of the stem or a non-digit.
   - Record this as `sequenceSuffix`. It is not part of the time.
   - Add pattern `ymd-hm-compact-seq` (examples `20261014_1433_01` and `0710261.1_20261014_1433_01`, precision `minute`) to `FILENAME_CAPTURE_PATTERNS`. `patternId` returns it.
   - The token remains `YYYYMMDD_HHmm`, without the suffix.
2. **Replace the whole-date downgrade with a narrow counter rule.**
   - Among compact-minute readings of one date, a **counter run** is at least 3 distinct values forming a consecutive integer run whose smallest value is ≤ `0010`, i.e. 0000/0001/0002…
   - Downgrade only the run members, plus other readings on that date whose **template** equals a run member's template. The template is the basename with the 4-digit clock masked, e.g. `IMG_20261014_####`.
   - Every other reading keeps its time.
   - The existing test vector (0001/0002/0003 + 1433 with the same template → all downgraded; 0001/0002 on another date → kept; seconds never downgraded) **still holds unchanged**.
   - The rule applies with or without a suffix, so `X_20261014_0001_01…0003_01` is still treated as a counter.
3. Provenance is unchanged in shape. `downgraded: 'sequence-counter'` is kept for downgraded rows.

**Contract change to document.** `tests/photoFilenameCaptureTime.test.mjs` currently implies a whole-date downgrade. The new tests must assert that consecutive *real* minutes keep their time. The safety coverage stays equivalent: true counters still downgrade.

**Regression fixtures.** Use the 12 names from the task as synthetic `originalFilename` values; only the names are needed, not the images. Assert:
- each name alone gives the expected minute;
- the batched plan gives identical values (`OV1.1_20261007_0946_01.jpg` → `2026-10-07T09:46` in both);
- all 12 land in `complete`, none in `dateOnly`;
- the pattern is `ymd-hm-compact-seq` with token `20261007_0946`.

Negative tests:
- `IMG_20261014_0001/0002/0003.jpg` → date-only;
- `IMG_20261014_0001_01…0003_01.jpg` → date-only;
- `A_20261014_0001.jpg`, `B_20261014_1433.jpg` with an `A_` run → `B_` keeps 14:33;
- `20261014_1433_011.jpg` (3-digit suffix) → existing behaviour (no suffix recognised; time kept, plain `ymd-hm-compact`);
- `20261014_1433_01_02.jpg` → strict: no suffix pattern, `ymd-hm-compact` only.

### A2 — FOTO-first combined export fails

**Cause (observed), step by step.**
1. **FOTO-first.** «Fra GMI → Velg GMI-fil» → `stageLayerSource(layerId, File, 'gmi')` → `makeSource` → a source with `fingerprint = sha256:<exact bytes>` and **no** `loadedBinding` (`photoSession.mjs:139-155`). It is saved through `applyGmiAssociations`, which creates the occurrences.
2. **Later loaded layer.** The same bytes are loaded as a vector layer. `loadedGmiSources.register` gives `binding = { layerId, inputId, datasetRevision, filename }` (`loadedGmiSource.mjs:17-21`). The fingerprints are identical: `gmiSourceFingerprint` and `computeGmiSourceFingerprint` both produce `sha256:` of the exact bytes (`gmiPhotoSource.mjs:12-20`, `sourceDocument.mjs:54-60`).
3. **Rechoosing in the wizard.** «Fra GMI → Bruk <lag>» → `stageLayerSource(layerId, { binding, read, isLive })` → `loadedGmiSource(parsed, binding)`. That source has a binding, but the duplicate check (`:1122-1125`) finds the attached file source by fingerprint and throws `duplicate-source`. The wizard then calls `recheckLayerSource(layerId, attachedSourceId)` (`PhotoPositioningWizard.js:194`), which reviews the **existing unbound source**. The new binding is discarded.
4. **«Oppdater koblinger».** `saveSourceWorkflowSource` → `applyGmiAssociations` commits `{ ...review.source, associationLedger }`, still without `loadedBinding` (`:1164`). Occurrences are unchanged because `record.occurrence.sourceId === sourceId` (`:419`). This is why the wizard shows that all references match.
5. **Export.** `captureDeliverySnapshot` looks for a source where `fingerprint === gmi.document.fingerprint && loadedBinding.layerId === handle.layerId && loadedBinding.inputId === handle.inputId && live !== false` (`deliveryPlan.mjs:109-110`). It finds none and throws `loaded-gmi-binding-required` (`:143`).
6. **Control case (GMI-first).** The source is created by `loadedGmiSource(..., binding)`, so it matches. In the import-wizard append path, `reviewLoadedGmiImport` already rebinds an existing same-fingerprint source (`:678-679`). The positioning-wizard path is the only one that cannot.

The editing handle's `inputId` is the `loadedGmiSources` binding's `inputId` (`editSessions.mjs:188,196,279`). Attaching the same binding object therefore satisfies the export match exactly, with no change to export validation.

**Proposal (recommended): explicit, verified rebinding in the source workflow.** Export checks are not touched.
1. In `stageLayerSource`, for a **loaded** input whose fingerprint equals an attached **GMI** source:
   - **No binding, or binding `live: false`.** Return a ready review `{ source: attached, recheck: true, rebinding: { ...input.binding, live: true }, rebindIsLive: input.isLive }`. First verify structural equivalence of the freshly read evidence with the attached source: the same `objectsByKey` keys and the same reference list (objectKey, field, raw value, ordinal) after stripping the source-id prefix. On mismatch, fail closed with a new code `source-evidence-mismatch` and a Norwegian explanation in `readErrors`.
   - **Live binding to the same `layerId` and `inputId`.** Keep the current plain recheck.
   - **Live binding to another layer or input.** Fail closed with `source-bound-elsewhere` («Kilden er allerede koblet til et annet lastet GMI-lag …»). Never switch silently. See decision D2.
2. In `applyGmiAssociations`, when `review.rebinding` is set:
   - check `rebindIsLive(review.rebinding)` at commit, and refuse with `loaded-source-unavailable` if it is false;
   - commit `{ ...review.source, associationLedger, loadedBinding: review.rebinding }` in the same single publish;
   - keep the source id, references, occurrences, positions, directions, capture metadata and delivery decisions unchanged. The occurrence key is `[fingerprint, objectKey, assetId]`, so delivery decisions keyed by occurrence stay valid.
3. **Wizard.** `stage()` needs no `duplicate-source` fallback for this case, because the session returns the ready review directly. Step 2 states the binding change once: «Kilden kobles til GMI-laget «navn».», a necessary state explanation. The button stays «Oppdater koblinger». `PhotoGmiSummary` already says «Koblet til lastet GMI-lag.»
4. **Same rule in the import append path.** `reviewLoadedGmiImport` (`:678-679`) must refuse `source-bound-elsewhere` too, instead of overwriting a live binding to another layer.
5. **Layer removal and reimport.** The existing `reconcileLoadedGmiBindings` marks the binding `live: false`. The user rebinds through step 1, because a dead binding counts as rebindable. Nothing rebinds automatically.
6. **Export safety is retained in full.** `planGmiHyperlinkRemoval` still re-derives evidence from the document bytes and compares fingerprints (`hyperlinkRemoval.mjs:290-296`). The existing test «combined requires a live survey binding, not merely a directly imported FOTO GMI» (`tests/deliveryPlan.test.mjs:156`) stays as is.

**Negative tests (required).**
- **Different contents, same filename.** A FOTO source from `synthetic.gmi` and a loaded `synthetic.gmi` with one changed byte: they get different fingerprints and are treated as a new, separate source. Export is blocked and nothing is rebound.
- **Ambiguous binding.** Two loaded layers with identical bytes. Binding to A, then «Bruk B» → `source-bound-elsewhere`, and A's binding is unchanged.
- **Repeated references.** One asset referenced from two objects, or 77 references to 76 assets. After rebinding, the occurrence count, ids, keys and placements are identical.
- **Removal and reimport.** Rebind, remove the layer (binding becomes `live: false`, export blocked), reimport (new `inputId`), rebind → export ready. The old `inputId` never matches.
- **Stale identity at commit.** Stage a rebind review, remove the layer before «Oppdater koblinger» → refusal, and the source stays unbound.
- **Evidence mismatch** (crafted test source with an altered reference list but equal fingerprint, unit level) → `source-evidence-mismatch`.
- **Preservation.** Positions, directions, `captureMetadata`, delivery decisions (including transfer and exclude), staged Rettinger change sets and `associationLedger` references are deep-equal before and after rebinding.

### A3 — Export layer selection

**Cause (observed).**
- `initialSurvey(photoId)` preselects only when there is exactly one *bound, live* GMI source.
- `useState(() => initialSurveyLayerId || initialSurvey(...))` lets a stored `config.deliverySurveyId` win, even if that layer no longer exists or is not the bound one.
- The value is never recomputed when the Fotolag select changes.

**Proposal.**
1. When combined or split export is opened from FOTO, preselect the unique live bound layer if it exists. Otherwise use the stored `deliverySurveyId` only if it is still a loaded GMI layer. Otherwise use `''`.
2. Recompute on a Fotolag change unless the user changed the GMI-kartlag select in this wizard instance.
3. Never preselect by filename or by an unbound fingerprint match.
4. A stored id for a removed layer resolves to `''`, never to an option that is not present.

**Dependency.** A3's real-data benefit depends on A2. Steps 2–4 are independently testable.

### B1 — EXIF delivery default

**Cause.** `applySourceWorkflowPositions` passes only `kind === 'gml'` requests to `gmlDeliveryDefaults` (`photoSession.mjs:809-810`). The import wizard's «Fra EXIF» uses this path through `completeImport`.

**Proposal.** Include `exif` candidates in that filter. `photoGmlPositionSetsDelivery` already restricts the default to unlinked, untouched, `not-selected`, includable entries, so the following stay exactly as they are:
- GMI-linked placements (GMI);
- explicit user choices (`userChosen`);
- unplaced photos (Ikke).

Whether `applyPhotoPositioning` (`:1221`, `kind === 'exif'`) and later EXIF positioning in the positioning wizard should get the same default is decision D4. The recommendation is yes, through the same filter, for one consistent rule.

### B2 — FOTO map extent

**Cause.** `PhotoMapController` uses a per-mount `initialFitDone` ref. It does nothing when `hasSurveyData` is true, which is always the case in FOTO-after-GMI, and never fits again for a new layer or after positioning.

**Proposal.**
1. Make the fit an explicit page-owned request, `photoFitRequest = { layerId, token }`, created only:
   - in `completePhotoImport` when `outcome.placed > 0`; and
   - when the positioning wizard reports a successful apply on a layer that had **no placed occurrence before** («confirmed initial positioning»). This needs an `onApplied(result)` callback from `PhotoPositioningWizard.apply`.
2. `PhotoMapController` handles the request by identity:
   - call `invalidateSize`, then on the next frame fit the bounds of that layer's placed items;
   - use padding from the floating overlays, reusing the `panClearOfOverlays` measurements: display card on the right, command bar on top, 60 px minimum;
   - use `maxZoom: 19` for clusters, and `setView(…, 18)` for a single point or a cluster whose bounds are under about 10 m.
3. Selection, `panRequest`, manual edits and delivery changes never create a request.
4. Remove the old mount-time fit, or keep it only for the no-survey case. See decision D5.

### B3 — Validator dataset switching

**Cause.** As in the table: the revision effect (`ValidationV2Workspace.js:357-363`) resets geometry through `controller.selectLayer`, and the `NEW_RESULT` reducer case clears search and status. The `workspaceIdentity` effect also clears `selectedValidatorField` because the revision is part of the identity.

**Proposal.**
1. Add `controller.selectDataset(layer, preferredGeometry)`. It keeps `geometryTab` if the new dataset has objects of that scope, and otherwise falls back to `getDefaultValidationV2Geometry`.
2. Remember the last `(layerId, revision)`. When only the revision changed for the same layer (a dataset switch or a new proposed revision), call `selectDataset`, run validation, and dispatch a new `DATASET_CHANGED` action that preserves search, status filter, sort and `expandedRuleKey` when that rule still exists.
3. **Active rule.** After the run, re-resolve `selectedValidatorField` by `canonicalFieldId` + `ruleId` + scope against the new result, with the new `datasetRevision`. Clear it only if it is absent.
4. The object table still closes, because object references belong to the old revision. Layer changes keep the full reset.

### B4 — Hide FOTO markers in Validator

**Proposal.**
1. Generalise the visit key: `gmiEditActive ? 'rettinger:<id>' : validatorActive ? 'validator' : null`, where `validatorActive = !workspaceLayer && !gmiEditActive && fieldValidationOpen`.
2. Make the helper functions in `rettingerPhotoVisibility.mjs` key-generic, renaming them only if cheap.
3. `photoToggle` availability uses `rettingerActive || validatorActive`.
4. A direct transition between Validator and Rettinger in either direction changes the key, so the markers are hidden again. Leaving to the normal map restores the user's own visibility, because `photoSession` is never written.
5. The existing A5 tests remain. Add the Validator lifecycle cases.

### B5 — Connection-only wizard completion

**Proposal.** In step 3, when `sourceSaved && selected.length === 0`, replace the disabled `Neste` with a primary **Fullfør** (`CheckIcon`) that calls `onClose()` directly. There are no position choices to discard. The secondary `Lukk` is hidden in that state so there are not two equivalent closing buttons (D10). The saved notice («Kilder og koblinger er lagret. Posisjoner er ikke endret.») already states the distinction. Selecting any row restores `Neste`.

### B6 — Gemini VA acceptance evidence

**Observed copy.**
- `DeliveryWizard.js:78`: «**Eksperimentell.** Revidert GMI er ikke akseptansetestet i Gemini VA.» This shows whenever GMI is included and G4 is absent.
- `deliveryWizard.mjs:72` (`gemini-g4-unverified`): «Fjerning og omnummerering av bildelenker i revidert GMI er ikke akseptansetestet i Gemini VA …». This is emitted for any removal, whatever the ordinal policy (`hyperlinkRemoval.mjs:497`).
- The `GmiEditWorkspace.js:396` «Eksperimentell» tag on «Last ned revidert GMI».
- `exportContract.mjs:6` label «Gemini VA · Skråfoto 2019 (eksperimentell)», while `photoExportRules.mjs:9` already says «Importert i Gemini VA/GeoFoto i testet oppsett».

**Proposal** (wording is decision D7).
- Replace the experimental paragraph with a neutral fact such as: «Revidert GMI med feltrettinger og fordeling av bilder mellom GMI og GML er importert i Gemini VA i et testet oppsett (november 2026). Kontroller resultatet etter import.»
- Emit `gemini-g4-unverified` only for the **`preserve`** ordinal policy, which is not acceptance-tested. For the default `renumber`, emit the same informational fact instead.
- Remove the Rettinger «Eksperimentell» tag.
- Keep the «ikke … XSD-sertifisering» notes and the AsBuilt and Standard «Ikke testet» texts.
- Update `deliveryWizardUi.test.mjs:623`, `deliveryExclusion.test.mjs:32` and `gmiEditHyperlinkRemoval.test.mjs:135` as an approved copy change.
- Whether the Skråfoto profile label loses «(eksperimentell)» is part of D7. Its warnings `experimental-mapping` and `direction-assumption` describe mapping assumptions and should stay.

### C1 — FOTO sidebar width

**Proposal.**
1. In `page.js:945`, pass `sidebarWidth` unconditionally.
2. Delete the `photoWorkspace.css:2` override and the media-query override at `:294` (`272px !important`). Keep the stacked narrow-viewport rules at `:307-311` (`width: 100%`), which are a separate responsive layout, not a width choice. Check what the other workspaces do at the `:294` breakpoint and match them.
3. The right inspector clamp is unchanged.
4. This is a contract change in `photoWorkspaceEditUi.test.mjs:75`, `photoWorkspaceStacksUi.test.mjs:103`, `photoWorkspaceUi.test.mjs:132-133` and `validationV2WorkspaceInspector.test.mjs:20`. Replace those assertions with an equality across Lagbehandling, Validator, Rettinger and FOTO, as in `validatorDataTableSlice3Ui`.
5. **Risk.** At 1280×720 the map becomes 1280 − 380 − ≥380 ≈ 520 px. Verify that the FOTO list, display card and edit command bar still fit (D11).

### C2 — Filename timestamp suggestion list

**Proposal.** Make `.photo-import-capture-list` a two-column grid: `grid-template-columns: minmax(0, 1fr) max-content`. Each `li` spans both columns with `grid-template-columns: subgrid`, which keeps list semantics. Filenames wrap with `overflow-wrap: anywhere`, the time column uses tabular numerals, and the precision notes stay in the time cell. Max height and scrolling are unchanged. Scoped CSS only.

### C3 — Positioning wizard wording

**Proposal.** Replace the line at `:321` with «Entydige posisjoner er forhåndsvalgt. Manuelle posisjoner beholdes.» `defaultChoice` can come from GMI, GML or EXIF (`photoPositioning.mjs:115-135`), so the neutral form is always true. The user's «… fra valgt kilde …» variant is accurate only right after a source save. It can be used when `newGmiSourceId` or a new GML source drove the plan (D-minor). Drop «Endre bare det som ikke stemmer.» if the reviewer considers it redundant.

### C4 — Export filename editor

**Proposal** (inside `ExportFilenameEditor` and scoped `.delivery-wizard` CSS; naming and validation logic unchanged).
- **Continuous name.** Size the input to its content with the inline-grid mirror technique: a hidden `<span>` with the same value in the same grid cell, and the input at `width: 100%` of that cell. `field-sizing: content` is not relied on alone. This removes the gap before `_revNN` and the extension. The wrapper keeps the single border and focus ring; the input keeps `outline: none` and gets no inner border.
- **Text treatment.** The description uses `--gmi-text`. Prefix and suffix use `--gmi-text-muted` on `color-mix(in srgb, var(--gmi-surface-soft) 70%, var(--gmi-surface))`, with no added border or gap.
- **Counter.** Always visible, right-aligned on the `Filnavn` label row: «N tegn». N is `exportFilenamePreview().length`, the full basename plus extension. The placeholder timestamp has the same 13 characters as a real one. The counter updates on every keystroke.
  - ≤ 60: neutral muted.
  - 61–80: `--gmi-validation-compact-warning-text` plus a Phosphor `WarningIcon` 12 px.
  - > 80: `--gmi-validation-error-text` plus `WarningIcon`.
  - Both advisory levels are non-blocking: no `aria-invalid` and no `canBuild` change.
- **New constant.** `EXPORT_FILENAME_NOTICE_LENGTH = 60`, next to `EXPORT_FILENAME_ADVISORY_LENGTH = 80`.
- **Blocking issues.** Empty, reserved and > 255 bytes keep the existing red error message and `aria-invalid`. To keep advisory red distinct from blocking red, the advisory has no message line beyond the counter; the existing «Filnavnet er over 80 tegn.» line is folded into the counter's accessible description. See D8.

### C5 — Export report download

**Proposal.**
1. Move the button out of `PackageDetails` into the footer as its first child on the Pakke step, styled `photoSourceButton`, with `margin-right: auto` so it sits on the left.
2. `Avbryt`, `Tilbake` and `Last ned ZIP` stay grouped on the right.
3. Keep the disabled rule (`busy || status === 'stale'`).
4. Drop the in-body sentence «Leveranserapporten lastes ned separat. Den legges ikke i ZIP-filen.» only if that fact moves into the button's tooltip. Otherwise keep it, because it is a necessary non-redundant fact.
5. Measure at both laptop sizes with the attachment tree expanded and thumbnails on.

### C6 — Layer card icon consistency

**Proposal.**
1. Replace the five hand-drawn SVG buttons with `PhotoIconButton` + `layer-card-icon-button`: Phosphor Regular at 14 px in 22 px targets, `--gmi-text-subtle`, accessible names and tooltips, no native `title`.
2. Keep `gmi-selected-control` for the highlight and topplok toggles, with `aria-pressed`.
3. Disabled KOF actions use `unavailable` + tooltip («Ikke tilgjengelig for KOF»).
4. Proposed icons (D9): Marker alt `HighlighterIcon`, Profilanalyse `ChartLineIcon`, Høydekontroll `MountainsIcon` (already used by the incline modal for height), Feltvalidering `ClipboardTextIcon` (`ListChecksIcon` already means «Fullfør opplysninger»/table selection), Topplok `CircleHalfIcon`.
5. Høydekontroll's existing missing-Z dot moves from `bg-red-500` to `.gmi-validation-dot` with `data-validation-tone="error"`, in the same surface. Its colour must not be the only cue, so the tooltip states «N objekter mangler Z».

### C7 — Profilanalyse warning dot

**Proposal.** Delete `LayerPanel.js:170-175` and the now-unused `errorCount`/`warningCount` if nothing else reads them. `layer.analysis.results`, the modal and the analysis rules are untouched.

---

## 3. D — Proposed wizard footer standard (for later inclusion in AGENTS.md; not added now)

> **Wizard footers.**
> - The footer is fixed. Step content scrolls in its own body, and the footer never scrolls away.
> - Workflow actions are grouped on the right in the order `Avbryt`/`Lukk` → `Tilbake` → one primary (`Neste`, `Fullfør`, `Last ned …`).
> - A necessary supplementary action that does not advance the workflow (for example `Last ned rapport`) sits on the left, styled as a secondary `.gmi-compact-button`, never primary.
> - When no supplementary action exists, the left slot may hold one live status line (`role="status"`).
> - A step with nothing left to decide ends with `Fullfør` rather than a disabled `Neste`.
> - No duplicate closing actions, and no explanatory text in the footer beyond the status line.
> - All footer buttons have one height (40 px), and the row is verified at 1280×720 and 1366×768.

**Shared-component opportunity (not in these slices).** Four footers restate the same markup and recipes: `PhotoImportWizard.js:131`, `PhotoPositioningWizard.js:378`, `DeliveryWizard.js:288` and the completion hub. A later `WizardFooter({ start, children })` in `src/components/photos/` would own `.photo-import-footer`, the left slot and the button height. Recommend that it is done in the styling audit, not here.

---

## 4. Dependencies

- **A1** is independent (pure lib). C2 touches the panel that renders A1 output, but has no logic dependency.
- **A2 → A3.** A3's preselection only becomes useful once the binding exists. Its stale-id handling is independent.
- **A2 → B5/C3.** All touch `PhotoPositioningWizard.js` (step 2 copy, step 3 footer and copy). Do them after A2 to avoid conflicts.
- **A2 → B1.** Both touch `photoSession.mjs`, but in different functions. Sequence them rather than parallelise.
- **B5 → B2.** B2's «initial positioning» trigger needs the wizard's `onApplied` callback, which sits next to B5's footer change.
- **B2, B4 and C1** all edit `src/app/page.js`. Serialise them.
- **A3 → C5 → B6.** All edit `DeliveryWizard.js`. C4 also edits `PhotoExportDeliveryStep.js`/`deliveryWizard.css`, so pair it with C5.
- **C6 + C7** share `LayerPanel.js`. Do them together.
- **D** is documentation only, after user approval. C5 and B5 implement it locally.

---

## 5. Implementation slices

Each slice is independently testable and keeps the existing gates. Browser tests use a fresh `npm run build`, `next start` on a free port, `PHOTO_UI_URL`, are run serially, and stop only the server the slice started. Every slice also runs `npx --no-install eslint` on touched files and `git diff --check`.

| # | Slice | Items | Main files | Focused Node tests | Browser acceptance |
|---|---|---|---|---|---|
| **S1** | Filename sequence suffix and counter guard | A1 | `photoFilenameCaptureTime.mjs` | `photoFilenameCaptureTime`, `photoCaptureSuggestions`, `photoImportWizardState` | `photoImportWizardUi` (existing case unchanged) |
| **S2** | Verified GMI source rebinding + export preselection | A2, A3 | `photoSession.mjs`, `PhotoPositioningWizard.js` (stage/step 2 copy), `photoImportPresentation.mjs` (`readErrors`), `DeliveryWizard.js` (`initialSurvey`, recompute) | New `tests/photoGmiSourceRebinding.test.mjs`, plus `deliveryPlan`, `deliveryExclusion`, `deliveryWizard`, `gmiPhotoAssociations`, `gmiPhotoPlacements`, `gmiEditHyperlinkRemoval`, `photoDeliveryIntent`, `photoDeliveryDefaults` | New FOTO-first case in `deliveryWizardUi`: synthetic file-attached source → load same GMI → «Bruk lag» → «Oppdater koblinger» → combined export preselects the layer and is ready. Plus the unchanged GMI-first case. `npm run build` required (shared source-safety logic). |
| **S3** | Connection-only completion + wording | B5, C3 | `PhotoPositioningWizard.js` | Source-wiring assertion for the `Fullfør` state | Positioning-wizard browser case: GMI recheck with zero changes shows `Fullfør`, closes, positions unchanged; 1280×720/1366×768 footer |
| **S4** | EXIF → GML default | B1 | `photoSession.mjs` | `photoDeliveryDefaults` (+EXIF cases: placed→GML, unplaced→Ikke, GMI-linked→GMI, explicit Ikke kept), `photoImportWizardState`, `photoDeliveryIntent` | `photoDeliveryDefaultsUi` + an EXIF import case |
| **S5** | FOTO map fit requests | B2 | `page.js`, `PhotoMapController.js`, `PhotoPositioningWizard.js` (`onApplied`) | Pure helper for the bounds/zoom decision; source contract that selection/pan never fits | Import with survey loaded → map fits the FOTO extent; single photo zoom 18; selection, edit and delivery cycling don't move the map |
| **S6** | Validator dataset switch preservation | B3 | `ValidationV2Workspace.js`, `validationViewController.js`, `resultPresentation.js` | `validationV2*` controller/reducer tests + new `DATASET_CHANGED` cases | `validatorDataTableSlice3Ui` + Ledninger → Foreslått stays Ledninger with filter/sort/rule |
| **S7** | Validator FOTO suppression | B4 | `rettingerPhotoVisibility.mjs`, `page.js` | `rettingerPhotoVisibility` (+Validator, Validator↔Rettinger) | `rettingerPhotoVisibilityUi` (+Validator cases) |
| **S8** | FOTO sidebar width | C1 | `page.js`, `photoWorkspace.css`, 4 tests (contract change) | `validationV2WorkspaceInspector` | Width equality in four workspaces at both laptop sizes; FOTO list/inspector/map fit |
| **S9** | Filename editor presentation + report in footer | C4, C5 | `PhotoExportDeliveryStep.js`, `deliveryWizard.css`, `photoExportNaming.mjs` (constant), `DeliveryWizard.js` | `photoExportNaming` thresholds 60/61/80/81 | `deliveryWizardUi`: continuous name, counter colours (computed), focus ring, report button visible with tree expanded and thumbnails on |
| **S10** | Layer card icons + Profilanalyse dot | C6, C7 | `LayerPanel.js` | Source assertion: no inline `<svg>` in `LayerAnalysisButtons`, no Profilanalyse dot | Card screenshot at both sizes; tooltips and keyboard focus |
| **S11** | Suggestion list columns | C2 | `photoCollectionPanel.css` (+ markup if subgrid needs it) | — | `photoImportWizardUi`: column x-alignment across rows; no overflow |
| **S12** | Gemini VA acceptance copy | B6 | `DeliveryWizard.js`, `deliveryWizard.mjs`, `hyperlinkRemoval.mjs`, `GmiEditWorkspace.js`, (`exportContract.mjs` per D7) | `deliveryExclusion`, `gmiEditHyperlinkRemoval`, `deliveryWizard` | `deliveryWizardUi:623` updated |

**Priority order:** S1 → S2 → S3 → S4 → S12 → S9 → S5 → S6 → S7 → S8 → S10 → S11. S6, S10 and S11 can move earlier because they touch no shared files.

**Baseline caveat (not re-established in this read-only pass).** Earlier reports record pre-existing failures: `validationV2GmiA7` «Lukk Validator» and the `photoWorkspaceStacksUi` counts. Local memory says this CRLF checkout shows 4 Node-gate failures. Each slice must re-establish its baseline at `c6a6abf` before classifying any failure as pre-existing.

---

## 6. Decisions requiring user approval

| ID | Decision | Recommendation |
|---|---|---|
| D1 | A1 counter rule: run of ≥ 3 consecutive values whose smallest is ≤ `0010`, downgrade scoped to the run and its templates; new pattern id `ymd-hm-compact-seq`; the 12 real names as fixtures | Approve as stated |
| D2 | A2: a source already **live**-bound to another loaded layer with identical bytes | Refuse (`source-bound-elsewhere`); no silent switch |
| D3 | A2: offer an inline «Koble til» action in the export wizard as well? | No. Keep binding in «Koble og posisjoner bilder». Optionally extend the blocked message: «… velg Fra GMI og Bruk <lag> i Koble og posisjoner bilder.» |
| D4 | B1: also default EXIF positioning to GML in the positioning wizard and `applyPhotoPositioning`, not only import | Yes, one rule |
| D5 | B2: fit to FOTO even when survey layers are loaded; maxZoom 19, single point 18; drop the old mount fit | Yes |
| D6 | B4: Validator suppression per visit, not per Validator layer | Per visit |
| D7 | B6 wording; keep G4 only for `preserve`; drop the Rettinger tag; Skråfoto label «(eksperimentell)» | Approve the wording in §2 B6; keep the Skråfoto mapping warnings; remove «(eksperimentell)» from the label only if you consider the profile accepted |
| D8 | C4: red advisory > 80 coexists with red blocking errors | Counter + icon only for advisories; blocking keeps its message and `aria-invalid` |
| D9 | C6 icon mapping and subtle (not teal) colour | Approve the mapping in §2 C6 |
| D10 | B5: hide `Lukk` while `Fullfør` is shown | Yes |
| D11 | C1: ≈ 520 px map at 1280×720 with the FOTO inspector open | Accept, subject to S8 measurement |

No **Open** item in AGENTS.md is settled by these proposals. Primary colours follow the host module.

---

## 7. Implementation brief — S1 (Sol Medium)

**Task.** Implement slice S1 (A1) only. Branch `feature/photo-workspace`; verify HEAD `c6a6abf` (or the commit that follows this report) and a clean tree. Read root `AGENTS.md`, this report §2 A1 and M1 report §3.1/§4. No subagents. Do not stage, commit or push unless told to.

**Change `src/lib/photos/photoFilenameCaptureTime.mjs` only.**
1. `followingTime`: after a **compact `HHmm`** match, test the rest for `^[_-](\d{2})(?![\d])`. If it matches, return `sequenceSuffix: '<NN>'`. The time's `end` stays at the `HHmm` end, so `token` excludes the suffix. Do not apply this to second or separated forms.
2. `patternId`: return `ymd-hm-compact-seq` for a ymd compact minute with `sequenceSuffix`. Add `{ id: 'ymd-hm-compact-seq', examples: ['20261014_1433_01', '0710261.1_20261014_1433_01'], precision: 'minute' }` to `FILENAME_CAPTURE_PATTERNS`, after `ymd-hm-compact`. Dmy compact keeps `dmy-hm`.
3. `parseFilenameCaptureTime` returns, in addition, `template`: the basename with the 4 clock digits replaced by `####`, only when `compactMinute` is set.
4. Replace `sequenceCounterDates` with `sequenceCounterIds(parsed)`:
   - group compact-minute items by date;
   - find maximal consecutive integer runs of distinct values;
   - a run counts only if its length is ≥ 3 and its smallest value is ≤ 10;
   - flag the run members plus every item on that date whose `template` equals a member's template;
   - return a `Set` of asset ids.
5. The planner downgrades only flagged items, as today: date value, `pattern` `ymd-compact`/`dmy-dotted`, token without `_HHmm`, `downgraded: 'sequence-counter'`. For a `-seq` item the downgraded token is the 8-digit date. Remove the whole-date downgrade.
6. The suggestion's public shape is unchanged. The internal `template` and `sequenceSuffix` must not leak into the plan objects; the planner test asserts exact keys.

**Tests in `tests/photoFilenameCaptureTime.test.mjs`.**
- The pattern-table test covers the new examples automatically.
- Keep the existing counter test unchanged; it must still pass.
- Add the real-data test: the 12 names from the task, each alone and batched, giving identical minute values, all in `complete`, pattern `ymd-hm-compact-seq`, `OV1.1_20261007_0946_01.jpg` → `2026-10-07T09:46`.
- Add the five negative cases from §2 A1.
- Add one `tests/photoCaptureSuggestions.test.mjs` case: a batched session import of the 12 names commits 12 minute-precision `Filnavn` values when «complete» is chosen.

**Verify.**
- `node --test tests/photoFilenameCaptureTime.test.mjs tests/photoCaptureSuggestions.test.mjs tests/photoImportWizardState.test.mjs`
- `npx --no-install eslint` on the changed files
- `git diff --check`
- Optionally, `photoImportWizardUi` against a fresh build on a free port (its 3/1 synthetic counts must be unchanged)

**Report.** Write `docs/agent-reports/<timestamp>-foto-filename-counter-guard-s1-implementation.md` covering: the contract change (whole-date downgrade removed), passed/failed/skipped checks, and the remaining real-corpus acceptance (re-import the 76-photo delivery: expect 48 + the former false date-only rows as date and time).

**Do not touch.** Write paths, approval UI, M2/M3 GML reconciliation, export, or any other slice.

---

## 8. Remaining risks and unverified assumptions

- **A1.** The 9 photos without a suggestion and the exact composition of the 18 date-only rows are unverified without the corpus. The counter threshold (≤ 0010) is a heuristic, and counters starting at e.g. 0101 would be read as times. This is acceptable because approval stays opt-in and unchecked by default.
- **A2.** Assumes the loaded-layer evidence and the file evidence are structurally equal for identical bytes. The proposed equivalence check fails closed if not, and the export's own byte re-derivation remains the final gate. The import-path refusal for `source-bound-elsewhere` is a small behaviour change for a case not yet seen in practice.
- **B2.** Fit timing after the workspace layout change depends on `invalidateSize` ordering. This needs browser verification at both laptop sizes.
- **B3.** If the proposed dataset changes revision while the user edits in Rettinger with Foreslått selected, the same preservation applies. This is intended.
- **M3** real-data acceptance and **M4** remain outstanding. §F deferred scope is excluded from every slice.

## 9. Side findings (not in scope; for the styling audit)

- `DeliveryWizard.js` «Utelat feltrettingene» checkbox has no `accent-gmi-interactive`; check whether `.delivery-exclusion` CSS covers it.
- The `LayerPanel.js` topplok summary uses raw `text-red-600`/`text-green-600`.
- The `PhotoImportReviewStep` `⚠` glyph is still present (M1 report §7).

## 10. Git

Branch `feature/photo-workspace`, HEAD `c6a6abf`, unchanged. The only change is this new untracked report. Nothing was staged, committed, pushed or deployed.
