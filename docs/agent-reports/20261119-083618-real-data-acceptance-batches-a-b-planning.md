# Real-data acceptance findings (19 November 2026): Batches A–C and roadmap D/E

**PLANNING — implemented in `20261119-100500-gmi-validator-2-0-batches-a-b-c-d-f-implementation.md` (see that report for deviations).**

**Revision 3 (same day): final approved decisions.** The user approved the remaining open decisions and added A8 and Batch F:
- DA2a: Fjern lag keeps the destructive red hover.
- DA6a: Gemini VA only, unless earlier GeoFoto acceptance is documented. It is (2 November reports `20261102-0928`/`20261102-1036`: an unmodified app package reached GeoFoto), so the profile copy stands; the new omitted-capture-time evidence names Gemini VA only.
- DA7: Eiendomsgrenser is off on every app load; the choice is kept within the session.
- DC1: no technical completion of estimated dates. DC2: the thresholds below are approved. DC3: greater precision wins only when the known components agree; explicit acceptance, conflict and protected-value rules are kept.
- DD1: loaded layers alone count as meaningful session work. DD2: removing a FOTO layer with photographs is confirmed.
- A8 (new): a FOTO photo visibility toggle with the existing eye control that hides markers, miniatures, direction arrows and previews and restores the previous display state, with no fit or pan.
- Batch F (new): a draggable Google Street View control on the shared map, opening `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=LAT,LON` in a new tab, with a click/keyboard alternative and no API, embed or coverage service.

Date: 2026-11-19, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`. HEAD was `0472c72` with a clean tree when this plan was first written.

This plan was produced by read-only investigation:
- no application code, tests, fixtures or AGENTS.md were changed;
- no subagents were used;
- nothing was staged, committed, pushed or deployed.

**Revision 2** (same day) records the approved decisions (DA2, DA6, DB1–DB5) and the Batch B amendment. It also corrects the S10 terminology and adds A7, Batch C (M5) and roadmap items D and E, with dependencies and acceptance criteria. Revision 2 code reads were limited to A7, M5 and D.

Reports consulted:
- the 18 November planning report (`20261118-085516`);
- S2 verified rebinding (`20261118-093133`), S3 connection-only completion (`20261118-095318`) and M4 (`20261118-173012`);
- the S5/S9/S10 refinements (`20261118-170741`).

Code is cited as `file:line` at `0472c72`. No private file was examined. Each item separates **Observed** from **Proposal**.

## Manual acceptance recorded (from the task, not re-verified)

| Item | Result |
|---|---|
| S9 filename editor colours | Accepted |
| S10 analysis icons | **Weights, sizes and spacing passed. Colours need correction (A2).** |
| M1 filename recognition | Passed, controlled five-photo test |
| M2/M3 GML reconciliation | Passed |
| M4 provenance and export advisories | Passed |
| Gemini VA | 5 photos imported into the real database: 4 without `fotograferingstidspunkt`, 1 complete. No GML patching needed. |
| FOTO marker selection after resize | Passed |
| Integrated Masseendring inspector layout | Passed |
| Legacy Masseendringer footer | Automated checks pass; manual acceptance deferred |

## Approved decisions

| ID | Decision |
|---|---|
| DA2 | `--gmi-text-muted` across both layer-card action rows. Reset/Table use the shared `PhotoIconButton`. |
| DA6 | Evidence is for Gemini VA only. GeoFoto was not tested. |
| DB1 | Session-owned workflow draft. |
| DB2 | Final button «Lagre endringer»; the counts are in Kontroll. |
| DB3 | Remembered export settings are exempt preferences. |
| DB4 | «Fullfør opplysninger» stays an immediate-edit task hub, with clear save semantics (B6). |
| DB5 | The B5 reading is correct. The AGENTS.md transaction rule and its tests are authorised during implementation. |

---

## Batch A — Smaller corrections

### A1. Extent-fit zoom cap 19 → 20

**Observed.**
- The cap is `photoLayerMapFit` → `{ bounds, maxZoom: 19 }` (`src/lib/photos/photoMapFeatures.mjs:40`).
- Extents under 10 m return `{ zoom: 18 }`.
- `fitPhotoLayer` (`PhotoMapController.js:51-68`) applies the overlay padding and `zoomSnap 0.25`.
- The map allows zoom 25, and tiles overzoom from native 18 (`MapInner.js:2215,2242`).

**Proposal.**
- Change `maxZoom` to 20 and nothing else. Keep the `< 10 m → zoom 18` branch, the padding and the `invalidateSize` + rAF sequence.
- Update `tests/photoMapFeatures.test.mjs:38-39` as an approved contract change. Add a case just above 10 m to pin the branch boundary.

**Note.** An extent of 10–20 m fits at about z20, while one under 10 m stays at z18. This is the existing behaviour the task asks to keep.

**Acceptance.**
- Unit test passes.
- Manual: a multi-photo extent of a few tens of metres fits at ≤ z20, and a single photo still opens at z18. Check at 1280×720 and 1366×768.

### A2. One grey for both layer-card action rows (DA2)

**Observed** (`LayerPanel.js`, `globals.css:60-64`).
- **Header row:** `--gmi-text-subtle`. Rettinger and Koble bilder are `.layer-card-icon-button`. Zoom and Fjern are raw `<button>`s (`:500,:515`).
- **Analyse row:** the five analysis buttons are `--gmi-text-muted`, scoped to `.layer-analysis-actions` (S10).
- **Reset/Table:** raw teal `<button>`s with a native `title` (`:594-609`).

**Proposal.**
1. Make `.photo-icon-button.layer-card-icon-button` itself `--gmi-text-muted`, and remove the now-redundant `.layer-analysis-actions` rule (`globals.css:61`).
2. Move Zoom, Fjern, Reset and Table to `PhotoIconButton` with `className="layer-card-icon-button"`.
   - Keep the sizes: 14 px in the header, 16 px in Analyse.
   - Keep the labels: «Zoom til lag», «Fjern lag», «Nullstill filtre», «Åpne datatabell».
   - This removes the native `title`s.
3. Keep the hover (navy), focus, pressed and unavailable states, weights and gaps unchanged.
4. Record for the styling audit, not this batch: Fjern hover uses raw `red-100/red-600` (`:515`), and the confirmation uses raw `bg-red-600` (`:578`).
   - **Open DA2a:** does Fjern keep a red hover through `.gmi-edit-destructive` once it moves to `PhotoIconButton`, or neutral navy like the others? The recommendation is to keep the red hover, scoped through the destructive treatment.

**Acceptance.**
- The computed colour of every normal-state icon in both rows equals `--gmi-text-muted`.
- No native `title`. The tooltip appears after the hover delay and immediately on keyboard focus.
- Footprints are unchanged: 22×22, 14/16 px.
- Manual check at both laptop sizes.

### A3. Empty descriptive filename

**Observed.**
- With an empty `descriptive`, the cyan editable area collapses to `min-width: 1ch` (`deliveryWizard.css:20-23`; `PhotoExportDeliveryStep.js:28-70`).
- There is no placeholder.
- A timestamp-only basename is valid. `filename-empty` blocks only when there is neither a timestamp nor a description (`photoExportNaming.mjs:74-86`).

**Proposal.**
1. Set the input placeholder to «beskrivende navn», mirrored in the hidden sizer span so the field takes the placeholder's width. The placeholder does not count towards the length.
2. When the timestamp is on and the sanitized descriptive part is empty, show an advisory line: «Filnavnet har ingen beskrivende del. Vi anbefaler et navn som beskriver leveransen.»
   - Link it with `aria-describedby`, without `aria-invalid`.
   - Use compact warning text, and show it only here.
3. A blocking `filename-empty` keeps its error, and the advisory is hidden then.
4. Applies to all three hosts: photo export, combined and GMI-only.

**Acceptance.**
- An empty name shows a visible, focusable area with the placeholder.
- The advisory is shown and is non-blocking, and export proceeds with a timestamp-only name.
- Placeholder contrast is ≥ 4.5:1.
- Naming unit tests are unchanged.

### A4. Kilder step: existing sources are enough

**Observed.**
- `useState('gml')` (`PhotoPositioningWizard.js:138`) pre-checks «Fra GML-fil» under «Legg til en kilde» (`:285-293`).
- `Neste` already proceeds without a new source.

**Proposal.**
- Change the initial state to `useState(null)`. With no kind chosen, no file input is rendered.
- Change the heading to «Legg til en kilde (valgfritt)».
- Add one line, «Du kan gå videre med kildene som allerede finnes.», shown only when sources exist or EXIF has viable positions.

**Dependency.** B-3 rewrites this step. Implement A4 minimally and carry it into B-3.

**Acceptance.**
- No external-source radio is checked initially.
- `Neste` with existing sources reaches Plassering.
- Choosing a radio reveals its actions, as today.

### A5. «Vis forslag» for compatible GML capture-time proposals

**Observed.**
- Compatible rows (`fill`, `fillPartial`, `completions`) are counted but cannot be listed (`PhotoGmlCaptureTimeChoices.js:19-63`).
- The filename suggestions use `<details><summary>Vis forslag (n)</summary>` (`PhotoImportCaptureTimeChoices.js:20-27`).

**Proposal.**
- Under the checkboxes, add `<details data-gml-capture-proposals><summary>Vis forslag (n)</summary>`.
- Each row shows thumbnail, filename, «Gjeldende», «GML» and a tag: «Fullstendig», «Ufullstendig» or «Kun dato».
- Use neutral styling, outside the SJEKK panel. Presentation only.
- Both hosts: positioning Koblinger and import Kontroll.

**Acceptance.**
- The count equals `options.complete + options.partial`.
- Each row's tag matches the checkbox that covers it.
- Nothing changes before the host's final commit.
- M3 tests are unchanged.

### A6. Gemini VA evidence: omitted capture time (DA6)

**Observed.**
- `PHOTO_EXPORT_IMPORT_EVIDENCE['gemini-legacy2019'].missingCaptureTime = 'unconfirmed'`, with `referenceOnly: ['missingCaptureTime']` (`photoExportRules.mjs:30-35`).
- This causes a deviation (`photoExportReadiness.mjs:171`), which in turn gives «Ikke verifisert for denne pakken» (`photoCompletion.mjs:191-192`).
- The schema warning ends with «Det er ikke verifisert at Gemini VA godtar en slik pakke.» (`:201-205`).
- The Gemini serializer omits `fotograferingstidspunkt` whenever the time is not full (`photoExportXml.mjs:59`).

**Proposal.**
1. Set `missingCaptureTime: 'imported'` and `referenceOnly: []`. Keep `missingDirection` and `renamedGml` at `'untested'`. Record the evidence in a comment: 2026-11-19, preview `0472c72`, 5 photos, 4 omitted, real Gemini VA database, tested setup.
2. An `'imported'` state is not a deviation, so the import level falls back to «Profilen er importert tidligere, men denne pakken er ikke testet.»
3. Keep the schema sentence, and replace the final sentence with: «Gemini VA har importert bilder uten opptakstid i et testet oppsett (november 2026).»
4. Never mention GeoFoto as tested in new copy. `photoExportRules.mjs:9` currently reads «Importert i Gemini VA/GeoFoto i testet oppsett». **Open DA6a:** that copy comes from the earlier, separate profile import. Is GeoFoto in it still correct, or should it say Gemini VA only?
5. Keep:
   - the Skråfoto 2019 schema gap;
   - «Fortsett uten opptakstid»;
   - Legacy and AsBuilt `required`, with their «Ikke testet» text;
   - the XSD-certification note.
6. Tests (approved contract change): `tests/photoExportReadiness.test.mjs:53,144` and the wording assertions.
7. Documentation: the Batch A completion report records the evidence. No compatibility table exists under `docs/`.

**Acceptance.**
- With missing time on Gemini, there is no import deviation and no «ikke verifisert … godtar» text.
- The schema gap remains.
- Missing direction still produces an «untested» deviation.

### A7. Eiendomsgrenser off by default in a new session

**Observed.**
- The overlay default is `eiendomsgrenser: true` in the initial store state (`store.js:159-161`, `:1205`), in `MapInner.js:1265` and in the persist migration's fill-in (`store.js:3378-3395`).
- `ui.mapOverlayVisibility` is persisted to localStorage (`partialize`, `store.js:3286`), so a reload restores the last choice.
- Reset keeps the user's overlay choices (`store.js:490-533`).
- The control is `checked={mapOverlayVisibility.eiendomsgrenser !== false}` (`MapInner.js:2280`). It treats *undefined* as on.

**Proposal.**
1. Change the default to `false` in all three default sites. Make the checkbox read `=== true`, so a missing value means off.
2. Selection across workspaces is already preserved, because one store value is shared by every workspace map. Keep it that way, and do not add per-workspace state.
3. Leave manual toggling (`onOverlayChange`, `:2591-2601`), the Gemini WMS default and the basemap default (`'Kartverket Topo'`) unchanged.
4. **Open DA7: what counts as a "new session"?**
   - **Option 1, recommended.** Exclude `eiendomsgrenser` from persistence, so every app load starts unchecked. The choice survives workspace changes and «Nullstill» within the tab, but not a reload.
   - **Option 2.** Keep persistence and change only the default. Users who never touched the overlay keep their stored `true`, unless a storage-version migration resets it once.

**Acceptance.**
- A fresh profile (empty storage) → unchecked, with no WMS request for the layer.
- Toggle on, then switch Validator → Rettinger → FOTO → normal map: it stays on.
- Toggle off persists the same way.
- Basemap unchanged.
- The behaviour after reload matches the DA7 decision.

---

## Batch B — Wizard transaction boundaries

### B0. Principle (permanent, user-approved)

> A wizard is one transaction. Intermediate confirmations approve choices within the wizard draft but must not mutate accepted application data. All proposed changes remain provisional until final confirmation; Cancel/close before it discards them. Final Kontroll summarises the proposed changes; successful completion explicitly confirms what was saved.

### B1. Audit of current workflows

| Workflow | Intermediate writes to accepted data | Verdict |
|---|---|---|
| **FOTO «Koble og posisjoner bilder»** | (1) «Behold GML-kilden» / «Oppdater treff» → `commitLayerSource`. This attaches the source, mutates assets through `attachSource` (`photoSession.mjs:187-202`), writes GML capture times and adopts directions (`:526-545`). (2) «Behold kilde og koblinger» / «Oppdater koblinger» → `applyGmiAssociations`: source, ledger, new occurrences, rebinding (`:1207-1236`). (3) «Fjern GMI-kilde» → `removeGmiSource`, immediate (`:1238-1246`). Only «Bruk valgte posisjoner» is final. | **Violates the principle.** Migrate it. |
| FOTO «Legg til bilder» | Session draft state (`loadedImport`, `positioning`, `importIds`). One commit through `completeImport` / `applyLoadedGmiImport`. Close → `cancelImport` (`page.js:468`). | Compliant as read. Prove it with a contract test. |
| Rettinger Masseendringer | `gmiEditSessions.stage` runs only at final approval (`GmiBatchDialog.js:78-91,187`). | Compliant. |
| Photo / combined / GMI-only export | Page-local remembered settings (`page.js:178,424`). Downloads only. | Compliant (DB3: exempt preferences). |
| «Fullfør opplysninger» | Immediate commit per action. | Task hub, not a wizard (DB4); see B6. |
| Single-photo metadata dialog | Single step with its own Lagre. | Not a wizard. |

### B2. Session-owned workflow draft (DB1)

**Draft.**
- Stored as `sourceWorkflowDrafts: WeakMap<ticket, { base, ops, view }>`.
- `base` is a snapshot of identities: layer, `photoIds`, `spatialSources`, member records and assets, and the generation.
- `ops` are declarative and ordered:
  - `attach-gml { review, captureDecision, capturePlanSignature }`
  - `recheck-gml { … }`
  - `gmi-associations { review, associationLedger }` (new, recheck or rebinding)
  - `remove-gmi { sourceId }`
- `view` is derived, `{ layer, recordsById, assetsById }`, computed purely from live state plus `ops`.

**Pure planners.** These are the main refactor.
1. Split `attachSource` into `planSourceAttachment(source, photoIds, readAsset)` → `{ source+ledger, assetUpdates }`.
2. Make capture-row selection and attach-time direction and metadata adoption plans rather than side effects.
3. `planGmiAssociations` (`:428`) and `planPhotoSourcePositions` are already pure. Feed them the draft view.

**API changes.**

| Current | Proposed |
|---|---|
| Wizard calls `saveSourceWorkflowSource` | `stageSourceWorkflowSource` (validates exactly as today, appends an op, recomputes the view, **no data write**) |
| Wizard calls `removeGmiSource` | `stageSourceWorkflowRemoval`, plus `unstageSourceWorkflowOp` for «Angre» |
| `reviewSourceWorkflowPositions` | Reads the draft view |
| `applySourceWorkflowPositions` | `commitSourceWorkflow(ticket, { plan, requests, reviewSignature })` → receipt |

The non-wizard `removeGmiSource` path (layer card and inspector) is unchanged.

### B2a. Atomic publication (amendment)

Publication must never leave partially applied data, not only when prevalidation fails but also when a step fails during application.

1. **Plan everything before writing.** `commitSourceWorkflow` first builds the complete next state as frozen objects in local maps: `nextLayers`, `nextRecords`, `nextAssets`, plus delivery updates. It uses only pure planners and the existing guards:
   - ticket, membership and generation;
   - the re-derived view signature against the reviewed Kontroll signature;
   - duplicate fingerprints;
   - `verifiedGmiBinding` / `isLive`;
   - the capture-plan guard;
   - the position-request checks.
   Any exception or guard failure here returns `{ ok: false }` without touching session state.
2. **Swap phase.** Record the previous value, or absence, of every key about to change. Then assign the precomputed objects with `Map.set`/`delete` only: no planner calls, no allocation-dependent logic, no listeners.
3. **Rollback.** Wrap the swap in `try/catch`. On any throw, restore every recorded key to its previous identity and do **not** call `publish()`. Then return `{ ok: false, error: 'commit-failed' }` with the Norwegian message «Endringene kunne ikke lagres. Ingenting er endret.» The wizard stays on Kontroll.
4. Bump `sourceRequests` and `publish()` **once**, only after the swap succeeds.
5. **Test seam.** Add a test-only `createPhotoSession({ commitFault })` hook that throws after the *n*-th write. For every *n*, tests assert that layers, records and assets are identity-equal to the pre-commit state, with no publish and no listener call.
6. Use the same plan → swap → rollback shape for any other multi-collection commit touched by this work, starting with `completeImport`'s GML path when B-1 changes it.

### B3. Wizard UX

1. **Kilder.**
   - The inventory shows committed sources plus staged changes, tagged «Ny», «Kontrolleres på nytt», «Kobles til lag …» or «Fjernes», each with «Angre».
   - «Fjern GMI-kilde» stages the removal: «… fjernes når du lagrer endringene».
   - Includes A4.
2. **Koblinger.**
   - The primary label becomes «Ta med kilden» (GML) or «Ta med kilde og koblinger» (GMI), with no save icon.
   - Stage text: «Kilden tas med i endringene. Ingenting lagres før du velger Lagre endringer.»
   - The `savedMessage` notice is removed.
   - Includes A5.
3. **Plassering** is optional when `ops.length > 0`. `Neste` is enabled with zero selections, which covers metadata-only and connection-only. The S3 «Fullfør» shortcut is removed.
4. **Kontroll** summarises the whole transaction with counts per section, omitting empty sections:
   - **Kilder:** added, rechecked, rebound, removed, with filenames;
   - **Koblinger:** new and updated occurrences and objects;
   - **Opptakstid:** n photos and the option;
   - **Retning:** automatic adoptions;
   - **Posisjoner:** the existing tiles and «Bør kontrolleres».
5. **Final action (DB2).** One primary «Lagre endringer» with `CheckIcon`.
   - It sets `aria-busy` and the busy label «Lagrer …» with no layout change.
   - It is disabled when there are no ops and no selections.
6. **Completion screen (amendment).** After a successful commit, the wizard stays open on a fifth, non-navigable state.
   - Heading «Endringer lagret», which takes focus.
   - A receipt built from the commit receipt, i.e. the actual changes, not the plan:
     - sources added, rechecked, rebound and removed (with filenames);
     - occurrences added;
     - capture times written (photos);
     - directions adopted;
     - positions placed, moved and same;
     - photos set to GML delivery.
   - Only non-zero lines are shown.
   - The footer has a single `Lukk` button, which takes the primary style because it is the only action. There is no Tilbake.
   - The step list shows all steps done. The header close is «Lukk kildekontroll». Escape closes without a confirmation.
   - **No toast** for this wizard, so the result is stated once. `onApplied(receipt)` still drives the B2 initial-placement map fit, at close.
7. **Cancel/close guard.** Before the commit, confirm whenever `ops.length > 0` or positions were edited:
   - «Forkaste endringene? Kilder, koblinger, opptakstider og posisjonsvalg i denne kontrollen lagres ikke. Fotolaget beholdes som før.»
   - Buttons «Forkast endringer» and «Fortsett».
8. Before the commit, the header close is «Avbryt kildekontroll».

### B4. Migration slices

| Slice | Content | Gate |
|---|---|---|
| **B-1** | Pure planners. Existing commit paths become plan → swap. No behaviour change. | Equivalence tests show deep and identity-equal results versus current commits on synthetic fixtures. Photo session suites pass. |
| **B-2** | Draft API, derived view, `commitSourceWorkflow` with signature, guards, atomic swap/rollback (B2a) and receipt. | Cancel after each step leaves state identity-equal. Commit equals the current two-phase result. Fault-injection sweep passes. A stale commit writes nothing. |
| **B-3** | Wizard UI (B3 1–8), including the completion screen, with A4/A5 carried in. | UI tests. Browser harness at 1280×720 and 1366×768. |
| **B-4** | Remove intermediate-commit paths and S3 «Fullfør». Update S2/S3/M3 tests as an approved contract change with equivalent atomic coverage. Add the AGENTS.md rule and `tests/wizardTransactionContract.test.mjs` (DB5). | Full serial Node suite, `npm run build`, browser regression. |

**Regression coverage.**
- S2 rebinding safety: `source-bound-elsewhere`, a stale binding at commit, evidence mismatch.
- M3 guards between Koblinger and commit.
- The same GML staged twice.
- GMI staged then removed → no-op.
- A removed source's positions are not offered.
- Repeated references and occurrence counts.
- Delivery defaults: GML/EXIF only, user choices kept.
- Metadata-only commit (capture times only, `current` unchanged).
- Connection-only commit.
- Rollback at every write index.

### B5. Permanent rule (DB5, authorised for implementation)

1. **AGENTS.md** (B-4). Add one bullet under "Source and data safety":
   > "A wizard is one transaction: intermediate steps stage choices in a draft; only the final confirmation writes accepted data, atomically (validated, then applied with rollback, published once), and the wizard then shows what was saved; cancel/close discards the draft. Task hubs and single-step dialogs with their own save are not wizards and must state their save semantics."
2. Add `tests/wizardTransactionContract.test.mjs`. For positioning, import and Masseendringer: drive each step, cancel, and assert the accepted-data snapshot is unchanged. Also assert one publish at commit. New wizards are added here.
3. The B-4 report records the classification of each surface as wizard, hub or dialog.

### B6. «Fullfør opplysninger» save semantics (DB4)

**Observed.**
- Each action commits immediately (`PhotoCompletionDetailsPanels.js`, `PhotoCompletionTimePanel.js`).
- The estimated-date action has an undo.
- Status messages already state each result.

**Proposal.**
1. Add one line under the hub heading: «Endringer lagres i fotolaget med en gang.» This is a required save-semantics statement.
2. The export wizard's «Fullfør opplysninger…» handoff keeps its label. On returning to export, readiness reflects the saved values, as today.
3. Hub actions keep their explicit buttons, and there are no hidden writes on navigation.

**Acceptance.** The text is present once. No action writes without a button press. M5 actions follow the same rule.

---

## Batch C — M5: batch capture-date completion

M5 is optional. The 19 November Gemini VA import succeeded with omitted timestamps, so completion never blocks Gemini export. Legacy and AsBuilt `required` rules are unchanged.

### C0. Observed baseline

- The «Opptakstid» task in «Fullfør opplysninger» (`PhotoCompletionTimePanel.js`) has three tools:
  - «Anslått opptaksdato», one date for all missing photos, immediate, with undo;
  - «Samme tidspunkt for valgte bilder»;
  - adoption from source evidence (`adoptSourceEvidence`).
- The current estimate is the **midpoint of the earliest and latest** reliable known date (`photoEstimatedDates.mjs:22-45`). It is not a median, has no sufficiency or spread threshold, and its targets are **all** photos with no accepted time (`planManualPhotoFill`), including photos with usable but unaccepted source dates.
- Reliable known dates already exclude estimates and auto-accepted values whose sources conflict. Assets are deduplicated by `assetId`.
- An estimate is stored as `T12:00:00` with `provenance.estimated = true` and shown as «Anslått» (`photoPresentation.mjs:32`).
- There is no technical completion for date-only or minute values. The Gemini serializer omits any non-full time (`photoExportXml.mjs:59`).
- `planFilenameCaptureSuggestions` (M1) is used only for import drafts (`photoSession.mjs:475`). `planGmlCaptureTimeReconciliation` (M2/M3) works for layer assets.

### C1. Flow (inside the hub; each step has an explicit button and an undo)

The Opptakstid task becomes an ordered list. Each step shows its count and a list behind «Vis forslag (n)», and steps with nothing to offer are hidden.

1. **Use source dates.**
   - Usable EXIF and GML values not yet accepted, in the existing priority order.
   - Conflicting sources are never batch-adopted. They stay row choices, as in M3/M4.
   - The planner is the existing evidence eligibility (`evidenceEligibility`) and the M2 planner.
2. **Use filename dates.**
   - `planFilenameCaptureSuggestions` applied to layer assets that have no usable EXIF or GML date.
   - Separate counts: «dato og klokkeslett» and «kun dato».
   - Same M1 rules and provenance `filename`.
3. **Technical completion** (optional; one checkbox per class, both unchecked by default).
   - «Fyll ut kl. 12:00:00 for N bilder med kun dato.»
   - «Fyll ut 00 sekunder for N bilder med klokkeslett uten sekunder.»
4. **Estimated date** for photos with no usable date evidence (C3).

Date-only and minute-precision values are always presented separately: separate counts, rows and options.

### C2. Technical completion model

- **Applies to:** accepted values of precision `date` or `minute` only. Seconds are never altered, and neither is a known component: the date, hour and minute are kept exactly, and the offset is kept or left absent.
- **Stored value:** the completed full value. Provenance keeps the **original** provenance (EXIF, GML, filename, manual) and adds `technical: { kind: 'noon' | 'seconds', from: <original value> }`.
- **Presentation:** «07.10.2026 12:00:00 · Klokkeslett teknisk utfylt» or «… 09:46:00 · Sekunder teknisk utfylt». It is never shown as measured.
- **Export.** Readiness gets one advisory: «N bilder har teknisk utfylt tid. Den er ikke målt.» GML export carries the full value. Whether a provenance remark is emitted follows the M4 rule that GML does not carry source notes.
- **Undo** restores `from` exactly, if the value is unchanged since.
- **Reliability.** A technically completed date still counts as a reliable known date for C3, because its date component is measured. Its time is excluded from any time-based statistic.
- **Open DC1:** should technical completion also apply to estimated dates? They already store 12:00:00, so the proposal is no, with nothing to complete.

### C3. Median date estimation

**Basis** (unique assets, never occurrences):
- photos with an **accepted**, non-estimated capture date of any precision;
- excluding auto-accepted values with conflicting sources (existing rule);
- including accepted filename-derived dates (they are accepted decisions);
- excluding photos with usable but **unaccepted** source dates, which steps 1–2 handle.

**Targets:** photos with no accepted capture time, not cleared by the user, and with **no usable date evidence** in any source (EXIF, GML or filename). Photos with usable but unaccepted source dates are excluded from the targets as well as from the basis.

**Median:** the sorted basis dates; with an even count, the lower middle date. This is consistent with the existing midpoint rounding towards the earlier day.

**Proposed thresholds** (open **DC2**):

| Condition | Outcome |
|---|---|
| Basis < 3 photos, or < 25 % of the layer's unique photos | No proposal. «For få kjente datoer til å foreslå en dato.» The date field stays, empty. |
| Spread (latest − earliest basis date) ≤ 7 days | Proposal prefilled. |
| Spread 8–31 days | Proposal shown with SJEKK «Datoene i laget spenner over N dager.» The date field is **not** prefilled; the user must press «Bruk foreslått dato» or enter a date. |
| Spread > 31 days | No proposal. «Datoene i laget spenner over mer enn en måned.» Manual date only. |

**Explanation.** The text gives the median, the basis count, the range and the affected count:
> «Forslag: 07.10.2026 — median av 18 kjente opptaksdatoer i fotolaget (06.10.–09.10.2026). Gjelder 4 bilder uten datobevis. Lagres som anslått dato med kl. 12:00:00 som teknisk standard.»

**User control.**
- The date is editable.
- «La stå tomt» means doing nothing; the step is optional.
- Apply writes `estimated: true` with the existing marking, with undo as today.
- Accepted dates are never overwritten (`planManualPhotoFill` eligibility, plus `captureTimeCleared` respected). **Verify in C-1:** that the estimated fill skips cleared values today.

### C4. Slices, dependencies and acceptance

| Slice | Content | Depends on |
|---|---|---|
| C-1 | Pure planners: layer filename suggestions, technical completion plan, `photoEstimatedDateModel` → median, thresholds, the target/basis exclusions. | A6 (readiness wording) |
| C-2 | Session writes (`completeCaptureTimes` with technical provenance; estimate targets narrowed) with atomic apply and undo. | B-1 (plan → swap shape) |
| C-3 | Hub UI (C1 flow), presentation labels, readiness advisory. | B6 save-semantics line |

**Acceptance.**
1. Counts are unique photos in every line.
2. Date-only and minute values are listed separately.
3. Technical completion changes only missing components, keeps the original provenance, and is labelled and undoable.
4. The median, basis count, range and affected count are shown, with no proposal when the thresholds fail.
5. Photos with unaccepted usable source dates are in neither the basis nor the targets.
6. Accepted and cleared values are never written.
7. Estimated, technical and measured values are distinguishable in the list, inspector, readiness and the delivery report.
8. Gemini export still succeeds with values left blank.

**Tests.** Unit tests for each planner, including an even/odd median, each threshold boundary, repeated occurrences and the exclusions. Add a UI test and a browser check at both sizes.

**Manual acceptance.** On a real layer, check the mix of EXIF, GML, filename and empty values, then a Gemini VA re-import of a technically completed package. This re-import is advisable, because a full value is written where it was previously omitted.

---

## Roadmap D — Session-loss protection

### D0. Observed guards

- `beforeunload` exists only for Rettinger:
  - the staged change sets registry guard (`gmiEditSessions.mjs:41-61`);
  - unsubmitted values in the object editor, batch dialog and batch inspector (`GmiObjectEditor.js:117`, `GmiBatchDialog.js:54`, `GmiBatchInspector.js:174`).
- «Nullstill og åpne ny fil» (`MapPaneToolbar.js:114,148` → `page.js:718-733`) asks for confirmation **only** when staged Rettinger exist. FOTO layers, photos, positions, metadata, sources and loaded layers are discarded without warning.
- The legacy `DataDisplay.js` «Last opp ny fil» calls `resetAll()` directly, with a `window.alert` fallback (`:12-17`).
- Persistence keeps only settings, `ui` and `lastActive` (`store.js:3286`). Loaded data and the whole photo session are lost on reload.

### D1. Proposal

1. Add one aggregator, `sessionLossState()` → `{ meaningful: boolean, items: [...] }`, owned by the page and fed by existing owners. Items are:
   - loaded survey layers (count);
   - FOTO layers and photos;
   - an import draft with photos;
   - an open wizard draft (B2 `ops`) or edited choices;
   - staged and unsubmitted Rettinger (existing);
   - unsaved photo edits (the edit ticket).
   Validator results and UI preferences are not meaningful, because they can be re-derived.
2. Attach `beforeunload` while `meaningful` is true. Reuse the `gmiEditSessions` attach/detach pattern so there is one listener, attached only when needed and never when the session is empty. The browser shows its own text, which cannot be customised.
3. **Reset confirmation.** Use one `GmiConfirmDialog` that lists what is lost, for example «2 kartlag · 1 fotolag med 34 bilder · ikke nedlastede rettinger i 1 lag».
   - Buttons «Nullstill» (destructive) and «Avbryt».
   - Staged Rettinger keep their stronger existing discard path inside the same dialog.
   - An empty session resets without a dialog.
4. The legacy `DataDisplay.js` reset either routes through the same request, or is removed under E if unreachable.

**Open decisions.**
- **DD1.** Do loaded GMI layers alone, without photos or edits, count as meaningful? The recommendation is yes: reloading loses the files, the layer order and the validation context.
- **DD2.** Should layer removal of a FOTO layer with photos get the same confirmation? It currently removes without asking (`PhotoLayerCard.js:32`).

**Acceptance.**
- An empty session gives no prompt on reload or reset.
- Each meaningful item alone triggers both the reload prompt and the reset dialog.
- Cancel leaves everything identical.
- The Rettinger discard semantics are unchanged.
- Listener attach/detach is covered by unit tests. The browser check uses Playwright's `dialog` event for `beforeunload`.

**Dependency.** After B, so wizard drafts are a defined source.

## Roadmap E — Legacy removal audit

Run E after functional completion and acceptance of A–D and **before** the final app-wide styling audit.

**Method.**
1. Inventory controls, links, dialogs, workflows, modules and tests.
2. Prove reachability: import graph, render paths and store actions.
3. Name the replacement, and verify it with existing tests or new parity tests.
4. Remove the item together with its tests and CSS.
5. Report every removal with its replacement evidence. Nothing is removed on suspicion alone.

**Initial candidates** (observed, unverified for reachability):
- `DataDisplay.js`: «Last opp ny fil», raw `gray-*`, `window.alert`;
- `PhotoLayerCard.js`: raw red «Fjern», no confirmation;
- the legacy Masseendringer dialog (`GmiBatchDialog.js`) versus the integrated `GmiBatchInspector`, once its deferred manual footer acceptance is settled;
- the raw Reset/Table buttons, if A2 has not already replaced them;
- the intermediate-commit wizard paths that B-4 removes.

**Acceptance.**
- Each removal has a named replacement and passing tests.
- Build and the full serial suite pass.
- No user-reachable dead link or control remains.
- The styling audit starts from the reduced surface.

## Release sequence

1. A and B, then C.
2. D, then E.
3. The final app-wide styling audit.
4. **Release 2.0.**
5. Usage statistics.
6. User documentation, which follows statistics.

Statistics are not to be implemented before Release 2.0.

## Dependencies

| Item | Depends on |
|---|---|
| A4, A5 | Minimal now; carried into B-3 |
| A6 | Before C-1 (readiness wording) |
| B-2 | B-1 |
| B-3 | B-2 |
| B-4 | B-3 |
| C-2 | B-1 (atomic apply shape) |
| C-3 | B6 |
| D | B-2 (draft state source) |
| E | A–D accepted; before the styling audit |

## Open decisions

| ID | Question | Recommendation |
|---|---|---|
| DA2a | Fjern lag hover colour after the PhotoIconButton move | Keep the red hover through the destructive treatment |
| DA6a | Does the existing profile copy «Gemini VA/GeoFoto» stand? | Confirm the earlier GeoFoto test, or reduce it to Gemini VA |
| DA7 | Does "new session" mean every app load? | Yes: do not persist the Eiendomsgrenser choice across reloads |
| DC1 | Technical completion of estimated dates | Not needed; they already store 12:00:00 |
| DC2 | Median sufficiency and spread thresholds | ≥ 3 photos and ≥ 25 %; ≤ 7 days prefill; 8–31 days explicit; > 31 days none |
| DC3 | GML/EXIF priority when both are usable and agree in date but differ in precision | Most precise wins, as in M3 R3 |
| DD1 | Loaded layers alone count as meaningful | Yes |
| DD2 | Confirmation on FOTO layer removal | Yes, same dialog pattern |

## Risks

- B-1 changes the side-effect shape of `attachSource`, which the import GML path shares. Equivalence tests are mandatory.
- The derived draft view re-plans on every publish. Measure the cost on large layers, and memoise by `(live identities, ops)`.
- Technically completed values are new in Gemini output. The successful import covered omission, not technical values.
- Gemini evidence covers one database, one setup and 5 photos. Missing direction and renamed GML remain untested, and GeoFoto is untested (DA6).

## Remaining manual acceptance

- Legacy Masseendringer footer (deferred).
- A1 fit at both sizes.
- A2 colours.
- A3 field visibility.
- A7 defaults across workspaces and reload.
- B: on a real layer, cancel at each step leaves nothing changed; metadata-only and connection-only completion; the completion receipt matches the layer.
- C: a real mixed layer, then a Gemini re-import.
- D: reload and reset prompts.

## Commands run

All were read-only: `git rev-parse` and `git status`, plus `grep`, `sed` and `cat` over `src/` and `tests/`. No tests or builds were run, because this was planning only. A `git diff --check` was run after writing.

## Git status

This report is the only change, and it is untracked. Nothing was staged, committed, pushed or deployed.
