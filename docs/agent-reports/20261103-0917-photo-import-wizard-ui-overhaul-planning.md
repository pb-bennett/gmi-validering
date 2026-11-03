# Photo import wizard UI overhaul — planning

Date: 2026-11-03, Europe/Oslo. Planning only: no production code, test or dependency changes. No commit or push. No sub-agents. This report is the only file added.

---

## 1. Preflight

| Check | Result |
|---|---|
| Repository root | `C:/GitHub/gmi-validering-test` |
| Branch | `feature/photo-workspace` |
| HEAD | `de208f9 Fix Gemini photo export GUID compatibility` (matches expected) |
| Worktree | clean at start |

---

## 2. Source material reviewed

**Primary UX brief:** `REF_FILES/20261103_UI-overhaul-import wizard.docx`. All text was read and all 10 embedded screenshots were inspected visually. Image order in the document is `image1` … `image10` (rId5–rId14):

| Image | What it shows |
|---|---|
| 1, 3 | Chrome's own dialog: *"Vil du laste opp 18 filer til dette nettstedet? … Last opp / Avbryt"*. Chrome shows this for `<input webkitdirectory>` (our **Velg leveransemappe**). |
| 2 | GMI-started import, empty. Six header actions (Legg til bilder, Velg leveransemappe, Legg til GML-kildedata, Velg alle, Fjern valg, Fjern valgte), a five-line block of text, GMI filename and **Mållag** before any photo is chosen. The footer says **Kontroller referanser**. |
| 4 | The same screen with 18 photos. The right-hand inspector shows editable **Opptakstid**/**Fotograf** forms with save/reset buttons, plus **Posisjon og kilder**. The placeholder `2026-05-12T14:33:02 (ev. +02:00)` reads like real data. Selection buttons sit at the top right, far from the grid. |
| 5, 6 | Reference review. Six count rows mix units (19 *references* against 18 *photos*). A second diagnostics table has eight more counts. A checkbox, the inspector editing forms still visible, and **Bekreft bilder og koblinger**. |
| 7 | A second modal, **Koble og posisjoner bilder**, opens automatically at step 3 *Posisjoner*. It has a per-row `<select>`, five toolbar buttons, "Ulike posisjoner fra kildene", and an object label shown only as "Plassering: Punkt 28". |
| 8 | Step 4 *Oppsummer*: "19 plasseringer valgt", Plasseres/Flyttes/Samme posisjon counts, a long list of filename · "GMI – objektposisjon · Plasseres" · "Punkt N", then **Bruk valgte posisjoner for 19 plasseringer**. |
| 9, 10 | General **Bilder** entry. No folder action. The same wall of text plus the GML button. **Opprett fotokartlag (40 bilder)**. Positioning is not offered at all. |

**Reports read:** `20261030-1543-photo-workflow-current-state-audit.md`, `20261030-1633-photo-loaded-gmi-reconciliation-implementation.md`, `20261101-0921-photo-ui-control-audit.md` (sections 3, 4 import/GMI/source/position rows, 15.4–15.6, 23), and import-relevant parts of `20261019-photo-unified-source-workflow-*`. Export/readiness and Gemini reports were skimmed only to confirm they do not touch import.

**Code inspected (photo files are in `src/components/photos/` and `src/lib/photos/`):**
`src/app/page.js` (photo orchestration, lines ~130–240, 406–412, 537), `PhotoCollectionDialog.js`, `PhotoCollectionPanel.js` (grid + `SelectedPhotoInspector`), `PhotoGmiReconciliation.js`, `PhotoGmiSummary.js`, `PhotoPositioningWizard.js`, `photoSession.mjs` (draft, loaded-GMI, source-workflow and commit methods, lines 336–990), `photoPositioning.mjs`, `gmiPhotoSource.mjs`, `loadedGmiSource.mjs`, `photoCaptureMetadata.mjs`, `photoDirection.mjs` (EXIF direction evidence), `src/lib/map/featureHoverLabel.mjs`, `LayerPanel.js:1300–1306`, `PhotoWorkspaceCollection.js`, `globals.css` photo-dialog rules, and the photo test suite (selector/label coupling).

---

## 3. Diagnosis of the current UX

### Root causes (architecture leaking into the UI)

1. **Two modals and two commits are presented as user steps.** The import dialog commits the FOTO layer, links and occurrences (*Commit A*). Then a separate `PhotoPositioningWizard`, with its own four-step header, commits positions (*Commit B*). The user sees two staircases, a "saved" banner and an exit labelled **Fullfør uten å endre posisjoner**.
2. **Entry context is a pair of boolean branches, not a step model.** `PhotoCollectionDialog` switches on `loadedGmi`/`targetLayerId` and shows every control at once. The result is six header actions plus a notice block on the first screen.
3. **The workspace inspector is reused in import.** `SelectedPhotoInspector` brings `PhotoMetadataEditor` (save/reset/evidence-adopt) and `PhotoSpatialInspector` (sources, direction) into the import step. The control audit already flagged one dead draft action (PHOTO-041).
4. **Internal ledger units are used as headline numbers.** References, occurrences, matched/ambiguous/unmatched/invalid categories and methods are shown with equal weight. The user cannot tell success from exception.
5. **Selection semantics are hidden.** The dots select *for removal only*, while all remaining photos are imported. The explanation is a sentence in the notice block, and the controls are at the far end of the header.

### Terminology finding: "Laste opp"

- The prompt the user objected to (images 1 and 3) is **browser-native**. Chrome shows it for directory inputs. **The app cannot reword or suppress it.** Any `<input webkitdirectory>` triggers it, and `showDirectoryPicker()` shows its own permission prompt.
- The **photo module's own copy never says "laste opp"**. It does use an upload icon (`UploadSimpleIcon`) on **Legg til bilder**, which signals uploading.
- App-owned "Last opp" exists elsewhere for GMI files:
  - `page.js:490` "Last opp og valider GMI-filer"
  - `LayerManager.js:73` "Ingen filer lastet opp ennå." and `:79` "Last opp fil"
  - `DataDisplay.js:29` "Last opp ny fil"
  - `MapPaneToolbar.js:98–134` "Nullstill og last opp ny" (×2, label + aria)
  - `AppInfoModal.js:251` "opplastede GMI-filer"
- Statistics/telemetry UI uses "opplasting(er)" (`StatsModal.js`, `StatsMap.js`, `TestModeControl.js`, `DetailedStatsSection.js`, `appReleases.mjs`).
- Verified: no photo module code calls `fetch` or telemetry. The claim "photos stay on this computer" is accurate.

---

## 4. Current flow map

### A. GMI-layer entry

| # | User sees / does | Code |
|---|---|---|
| 1 | GMI layer card → **Legg til bilder** | `LayerPanel.js:1306` → `page.openLoadedGmiPhotos` → `loadedGmiSources.begin(layerId)` |
| 2 | Modal opens; GMI read starts in the background | `photoSession.beginLoadedGmiImport({binding, read, isLive})` (calls `beginImport()`, which **clears the draft**, then async hash/ready). `<PhotoCollectionDialog loadedGmi>` |
| 3 | First screen: header actions, notice (GMI name, **Mållag**, EXIF/GML sentences) | `PhotoCollectionDialog.js:97–171` |
| 4 | **Velg leveransemappe** → *Chrome prompt* → files added | `webkitdirectory` input → `photoSession.importFiles` (keeps `webkitRelativePath`) |
| 5 | Optional GML, select/remove, target select | `importPositioningGml`, `toggleBatchSelection/selectAll/clearSelection/removeSelected`, `setLoadedGmiTarget` |
| 6 | **Kontroller referanser** (confirmation 1) | `reviewLoadedGmiImport({includeUnreferenced})` → grid swapped for `PhotoGmiReconciliation` |
| 7 | **Bekreft bilder og koblinger** (confirmation 2) | `page.createPhotoLayer(review)` → `applyLoadedGmiImport` = **Commit A** (layer + GMI source + ledger + point occurrences + GMI candidates; optional GML candidate-only) |
| 8 | Workspace opens; second modal opens at *Posisjoner* | `openPhotoLayer` + `setPhotoSourceWorkflow({initialPositions:true})` → `PhotoPositioningWizard` `toggle` handler → `beginSourceWorkflow` + `reviewSourceWorkflowPositions` |
| 9 | **Neste** (confirmation 3) → *Oppsummer* | local `step=4` |
| 10 | **Bruk valgte posisjoner for N plasseringer** (confirmation 4) | `applySourceWorkflowPositions` = **Commit B** |
| Result | FOTO layer, GMI-linked, positioned; user in workspace | |

### B. General **Bilder** entry

| # | User sees / does | Code |
|---|---|---|
| 1 | Landing **Bilder** (`page.js:537`) or header **Bilder** | `page.openPhotos` → `photoSession.beginImport()` |
| 2 | Same dialog. **No folder action** (folder input only rendered when `loadedGmi`) | `PhotoCollectionDialog` with `loadedGmi=false`, `targetLayerId=null` |
| 3 | Files/drop, optional GML, select/remove | as above |
| 4 | **Opprett fotokartlag (N bilder)** | `createLayer()` = Commit A (GML candidate-only). Dialog closes; **user stays in the app view**, not the workspace |
| 5 | To position: FOTO card **Bildemodul** → workspace → **Koble og posisjoner bilder** | `PhotoWorkspaceCollection.js:44` → `openPhotoSources()` |
| 6 | Wizard step 1 *Kilder*: EXIF inventory, choose GMI/GML radio, **Velg GMI-fil/GML-fil** | `stageLayerSource(layerId, file, kind)` |
| 7 | Step 2 *Koblinger*: **Behold kilde og koblinger** / **Behold GML-kilden** | `saveSourceWorkflowSource` → `applyGmiAssociations` / `applyLayerSource` |
| 8 | Steps 3–4: per-row choices, **Bruk valgte posisjoner …** | Commit B |

### C. Append (workspace **Legg til bilder**)

`page.addPhotosToLayer` → `beginImport(layerId)` → same dialog with `targetLayerId`. Filename collisions are skipped, with a per-thumbnail **Legg til likevel** toggle (`setAppendDuplicateOverride`) → **Legg til N bilder i laget** → `appendImport()`.

### Unnecessary divergence

- The folder picker exists only in GMI mode.
- Positioning is part of the GMI journey but absent from the general journey, which needs four more navigations.
- After commit, GMI mode enters the workspace but general mode does not.
- The general path picks a GMI *file* in the workspace wizard. The GMI-layer path uses the *loaded* source, and the two use different session APIs (`stageLayerSource`/`saveSourceWorkflowSource` against `reviewLoadedGmiImport`/`applyLoadedGmiImport`).
- GML is added in the import dialog in both modes, competing with photo selection.
- `page.js` has three overlapping flags: `showPhotos`, `loadedPhotoImport`, `photoImportTarget`.

---

## 5. Target user journey

**Same import process, different starting context.** At most three screens:

```
General Bilder:   1 Bilder → 2 Plassering → 3 Kontroll → [Opprett fotolag] → FOTO workspace
                                 └─ "Uten plassering" → [Opprett fotolag] directly from step 2
GMI layer:        1 Bilder → 2 Kontroll (GMI) → [Opprett fotolag] → FOTO workspace
Append (FOTO):    1 Bilder → 2 Plassering → 3 Kontroll → [Legg til i fotolaget] → workspace
```

**What is combined, and why:**

- "Choose photos" and "review photos" become **one screen**. The empty state is the acquisition screen; adding files fills the grid in place. This removes the redundant confirmation the user described (the brief's points 3/4). The only remaining prompt after **Velg mappe** is the browser's own, which we cannot remove.
- "Review exceptions" and "final summary" become **one screen** (*Kontroll*). The outcome summary is at the top, exceptions are below it, and **Opprett fotolag** is in the footer. A fully successful batch needs one glance and one click. A separate summary screen would only repeat the same three numbers.
- The current `PhotoPositioningWizard` **leaves the import journey**. It stays reachable in the workspace (**Koble og posisjoner bilder**) for advanced and post-import work. Its redesign is out of scope.

### Step 1 — **Bilder**

| Aspect | Plan |
|---|---|
| Purpose | Choose which photos to add; answer "are these the right photos?" |
| Sees (empty) | Two large equal actions **Velg bilder** · **Velg mappe**, the drop hint, and one trust line. GMI context only: one muted tip line. |
| Sees (populated) | Left: grid with a **selection toolbar directly above it**. Right: read-only preview (section 6.3). Toolbar right side: compact **Velg bilder** / **Velg mappe** to add more. Collapsed exception disclosures (rejected files, duplicate names) appear under the toolbar only when they apply. |
| Primary | **Neste** (disabled with reason until ≥1 photo is included; thumbnails still loading do not block) |
| Secondary | **Avbryt**; toolbar **Velg alle**, **Fjern valg**, **Fjern valgte (n)**; per-thumbnail **Legg til likevel** when a target is known and names collide |
| Hidden | GML button, EXIF counts, GMI filename/notice, **Mållag**, session/selection explanations, MIME, *Sist endret*, all metadata/position editing |
| Skippable | Never |
| Context | GMI: subtitle "Til {GMI-lagnavn}". Append: subtitle "Legg til i {fotolag}". Folder action is available **in every context**. |

### Step 2 — **Plassering** (general and append contexts only)

| Aspect | Plan |
|---|---|
| Purpose | Decide whether and where positions come from, only once photos are chosen |
| Sees | Four radio cards. The first three are always selectable; the fourth is disabled with a reason. |
| | • **Uten plassering**: "Plasser bildene senere i fotolaget." |
| | • **Fra GMI**: one sub-option per loaded GMI layer whose source input is available (`loadedGmiSources.available`) — "Bruk {filnavn}" — plus **Velg GMI-fil …** |
| | • **Fra GML-fil** (Terrain photo positions): **Velg GML-fil …** |
| | • **Fra bildenes GPS (EXIF)**: "{n} av {N} bilder har GPS". Disabled with "Ingen av bildene har GPS" when n = 0 after reading. |
| Primary | **Neste**. When *Uten plassering* is chosen it becomes **Opprett fotolag** (or **Legg til i fotolaget**), with a one-line summary beside it. |
| Secondary | **Tilbake**, **Avbryt** |
| Hidden | Source theory (lines vs. points, CRS, matching methods) |
| Skippable | Skipped in GMI-layer context (source fixed = that layer's loaded GMI) |
| Errors | GMI/GML read errors appear inline under the chosen card using the existing `readErrors` texts (moved from `PhotoPositioningWizard.js:21–26` to a shared module) |

### Step 3 — **Kontroll** (outcome, exceptions, create)

| Aspect | Plan |
|---|---|
| Purpose | Show what will happen; draw attention only to what needs it |
| Sees (top) | Large outcome line, e.g. **"17 av 18 bilder ble koblet automatisk"**, then **"1 bilde trenger kontroll"** if any. Three compact figures: *Bilder* · *Plassert* · *Uten posisjon*. |
| Sees (middle) | **Trenger kontroll** list (prominent cards: thumbnail, filename, plain reason, one action if one exists). Contextual decisions only when relevant: **Ta med bilder som ikke er nevnt i GMI-filen** (default on); **Bruk GPS fra bildet når {kilde} mangler posisjon** (only if those photos have EXIF; default off). |
| Sees (collapsed) | **Vis automatiske koblinger ({n})** → compact rows: thumbnail · filename → object context (section 8.6). **Tekniske detaljer** → existing `PhotoGmiSummary` (GMI) or `PhotoGmlSummary` (GML). |
| Target | GMI context only: **Legg bildene i** `[Nytt fotolag ▾ / existing FOTO layers]`. A change re-runs the review synchronously; collisions appear as a *Trenger kontroll* item. |
| Primary | **Opprett fotolag** (new) / **Legg til i fotolaget** (append) |
| Secondary | **Tilbake**, **Avbryt** |
| Hidden | References/occurrences as headline units, per-row source selects, coordinates, distances, move/same counts, match methods |
| Blocking | Disabled with status text while the GMI source or EXIF/GML reads needed by the chosen policy are pending |
| Result | Commit, close the modal, enter the FOTO workspace with a one-line status: "Fotolaget er opprettet. 17 av 18 bilder er plassert." |

**Rule carried over from the current domain:** the import wizard **only places unplaced occurrences and never moves an already placed one**. In append, existing placements are untouched. Moving and re-sourcing remain in the workspace wizard.

---

## 6. Proposed screen hierarchy

### 6.1 Modal shell (all steps)

```
┌ Header: [icon] Legg til bilder · {context subtitle}          [X]┐
│ Steps: ① Bilder ─ ② Plassering ─ ③ Kontroll   (derived list) │
├ Scrollable step body ────────────────────────────────────────────┤
│ ...                                                              │
├ Sticky footer ───────────────────────────────────────────────────┤
│ {one-line status}            [Avbryt] [Tilbake] [Neste/Opprett] │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Step 1 grid region

```
┌ 18 bilder · 2 valgt   [Velg alle] [Fjern valg] [🗑 Fjern valgte (2)] │ [+ Velg bilder] [📁 Velg mappe] ┐
├ grid … (selection toggle ✓ on each card; "Vises" outline on the previewed card) ─────────────────────┤
```

- The toolbar and grid are siblings in one `<section aria-labelledby>`. The toolbar is `position: sticky; top: 0` inside the scrolling gallery, so it stays attached while the grid scrolls.
- **Fjern valg** and **Fjern valgte** are disabled when nothing is selected.
- The selected count is in the toolbar, not the dialog header.

### 6.3 Read-only preview (step 1, right column)

Image (with **Vis stort**, reusing `PhotoImageViewer`; enable the existing `enableLargeView` behaviour), then a short definition list:

- **Filnavn**
- **Mappe** (only if `sourceRelativePath` has a directory part)
- **Størrelse**
- **Oppløsning** (`dimensions`)
- **Tatt**: the EXIF `captureTime` evidence value from `photo.metadataEvidence` (field `captureTime`, kind `exif`), formatted with `nb-NO`. Omit the row if absent.
- **Fotograf**: the EXIF `Artist` evidence value. Omit if absent.
- **GPS**: "Har posisjon" / "Ingen posisjon" / "Leses …" / "Kan ikke brukes" (from `spatial.exifRead.state` and viable EXIF candidate)
- **Retning**: "Har kompassretning" if `directionEvidence` has a `usable` item. Omit otherwise.

No inputs, no buttons except **Vis stort**.

---

## 7. Entry-context behaviour

| Context | Opened from | Step list | Source | Target | Final action |
|---|---|---|---|---|---|
| `new` | Landing/header **Bilder** | Bilder → Plassering → (Kontroll) | User choice | New FOTO layer | **Opprett fotolag** |
| `gmi-layer` | GMI card **Legg til bilder** | Bilder → Kontroll | That layer's loaded GMI (no choice) | Selectable in Kontroll (default new) | **Opprett fotolag** / **Legg til i fotolaget** |
| `append` | Workspace **Legg til bilder** | Bilder → Plassering → (Kontroll) | User choice | Fixed (workspace layer) | **Legg til i fotolaget** |

**Context removes decisions:**

- GMI context never asks for a GMI file or a source kind, and shows no GML/EXIF text before Kontroll.
- Append context never asks for a target.
- If the initiating GMI layer is removed while the wizard is open, the existing `reconcileLoadedGmiBindings` error state is shown as one alert in Kontroll ("GMI-laget er ikke lenger tilgjengelig. Avbryt og start på nytt fra GMI-laget.").

---

## 8. State and component architecture

### 8.1 Modal shell: keep and refactor, do not replace the mechanism

Keep the native `<dialog>` lifecycle from `PhotoCollectionDialog.js:45–71`: `showModal`, body overflow lock, window-level file-drop prevention, focus restore to opener, and `onCancel` → close. Keep the dialog sizing rules in `globals.css:5–56`. **Replace the component body.** Rename the file to `PhotoImportWizard.js` so the old multi-mode dialog does not survive alongside it. Keep the existing CSS class names `photo-collection-dialog`, `photo-collection-grid`, `photo-collection-card`, `photo-collection-thumbnail` and `photo-batch-toggle`, because many browser tests select them. Add new classes only for new regions.

### 8.2 Wizard navigation state (new, pure)

New `src/lib/photos/photoImportWizardState.mjs` (reducer + derivations, unit-tested without React):

```js
// context is fixed for one wizard instance
context = { kind: 'new' | 'append' | 'gmi-layer', targetLayerId: string|null, gmiLayerId: string|null }
state = {
  step: 'photos' | 'placement' | 'review',
  placement: { kind: null | 'none' | 'gmi' | 'gml' | 'exif',
               gmi: null | { origin: 'loaded', layerId } | { origin: 'file', filename },
               exifFallback: false },
  includeUnreferenced: true,
}
importSteps(context, placement)  // ['photos','review'] for gmi-layer; ['photos','placement'] + ('review' unless kind==='none')
canAdvance(step, snapshot, state) // returns { ok, reason } — reason is the user-facing disabled text
```

Domain/draft data stays in `photoSession`: `importIds`, batch selection, `positioning` (draft GML), `loadedImport` (draft GMI op), `draftTargetLayerId`, append policy. The wizard holds only navigation and choices. **No duplicate copy of photo lists in React state.**

### 8.3 Page orchestration (`src/app/page.js`)

Replace `showPhotos`, `loadedPhotoImport`, `photoImportTarget` and the two-branch `createPhotoLayer` with:

```js
const [photoImport, setPhotoImport] = useState(null); // null | context
openPhotoImport(context, event)   // shared by openPhotos / openLoadedGmiPhotos / addPhotosToLayer
closePhotoImport()                // photoSession.cancelImport(); setPhotoImport(null)
completePhotoImport(result)       // setPhotoImport(null); toggleFieldValidation(false) for new;
                                  // openPhotoLayer(result.layer.id); set workspace notice from result.outcome
```

Remove `setPhotoSourceWorkflow({ layerId, initialPositions: true })`. Keep the target-deleted subscription (`page.js:214–219`), keyed on `photoImport?.targetLayerId`. Keep the reset path (`page.js:387–390`) clearing `photoImport`. Update the `GlobalFileDrop enabled` condition to use `photoImport`.

### 8.4 Session changes (explicit, minimal, orchestration-level)

These are the **only required domain/state changes**. All existing commit and guard functions are reused unchanged.

1. **Draft-level GMI source attachable after photo selection.** Today `beginLoadedGmiImport` starts with `beginImport()`, which clears the draft, so a GMI source cannot be chosen after photos (step 2 needs exactly that). Add:
   - `setDraftGmiSource(input)`: `input = { binding, read, isLive }` (loaded layer) **or** `{ file }` (GMI file → `read = () => makeSource(file, 'gmi')`, `isLive = () => true`, no `loadedBinding`). Same `operation` object and `pending/ready/error` states as today; does **not** touch `importIds`.
   - `clearDraftGmiSource()`: `loadedImport = null`, `publish()`.
   - `beginLoadedGmiImport(args, target)` stays as `beginImport(target)` + `setDraftGmiSource(args)`, so `photoLoadedGmi*.test.mjs` keep passing.
   - **Why it is required:** the general path's GMI option must run through the same `reviewLoadedGmiImport`/`applyLoadedGmiImport` path as the GMI context. Otherwise the two journeys keep separate reconciliation implementations, which is the divergence this overhaul removes.
   - **Check:** `applyLoadedGmiImport` and `PhotoGmiSummary` must tolerate a source without `loadedBinding`. The code reads `source.loadedBinding` optionally, but confirm this with a test.
2. **`clearDraftPositioningGml()`**: resets `positioning` to `EMPTY_PHOTO_SNAPSHOT.positioning` and bumps `gmlRequest`, so switching away from GML drops it.
3. **`completeImport({ loadedReview = null, placement })`**: one user action, two existing checkpoints run back-to-back synchronously:
   - **Commit A:** `applyLoadedGmiImport(loadedReview)` if a draft GMI source is set; otherwise `appendImport()` when `draftTargetLayerId` is set; otherwise `createLayer()`.
   - **Commit B** (skipped for `kind === 'none'`): `beginSourceWorkflow(layer.id)` → `reviewSourceWorkflowPositions(ticket)` → `importPlacementRequests(plan, placement, eligibleIds)` → `applySourceWorkflowPositions(...)` (only if requests are non-empty) → `endSourceWorkflow(ticket)`.
   - Returns `{ ok, layer, outcome: { total, placed, unplaced } }` counted from the committed layer (not the preview).
   - If Commit B is refused (not expected, since it runs synchronously), return `ok: true` with `placed: 0` and `placementError: true`. The workspace notice then says positions were not applied. No partial writes are possible because Commit B is already all-or-nothing.
   - `eligibleIds`: in append, only occurrences that are unplaced. This always includes new ones and may include newly created GMI occurrences of existing assets after recheck.
4. **Optional (only if small): folder drag-and-drop.** Accept `importFiles([{ file, relativePath }])` in addition to plain `File`s, so a dropped directory (via `DataTransferItem.webkitGetAsEntry()`) keeps relative paths. It does not trigger Chrome's prompt. **Drop this item if it adds risk.** It is not an acceptance requirement.

### 8.5 Outcome/preview model (new, pure)

New `src/lib/photos/photoImportOutcome.mjs`:

- `previewImportPlacement({ photos, placement, gmiReview, gmlSource })` → per-**asset** rows:
  `{ assetId, filename, thumbnailUrl, status, sourceKind, occurrences, objects: [context], reason }`.
  `status` is one of `'placed' | 'linked-no-position' | 'ambiguous' | 'not-referenced' | 'excluded' | 'no-position' | 'questionable-gps' | 'pending'`.
  - **GMI:** use `gmiReview.associationLedger` (`resolutions`, `reverseIndexes.byPhotoId`) and `gmiPointPosition(source, object)` for each confident POINT edge. LINE-only → `linked-no-position`. `gmiReview.unreferencedIds` → `not-referenced`, or `excluded` when the toggle is off. Ambiguous candidates → `ambiguous`, listing the competing file names. Optional EXIF fallback for rows without a GMI position.
  - **GML:** `matchPhotoReferences(gmlSource.entries, assets)` plus candidate viability via `createPhotoCandidate` (the same preflight `applyLoadedGmiImport:484–486` uses).
  - **EXIF:** a viable `exif` candidate on the draft record. Mark `questionable-zero-gps` (`candidate.issues`) as `questionable-gps`, which is **not auto-placed**.
- `summarizeImportOutcome(rows, gmiReview)` →
  `{ total, autoLinked, placed, attention: rows[], missingReferences: [{referenceRaw}], repeatedPhotos }`.
  `missingReferences` comes from `resolutions` with `status === 'unmatched'` and `reason === 'no-owner-layer-photo'`. Invalid and unsafe references stay diagnostics-only.
- `importPlacementRequests(plan, placement, eligibleIds)`: for each `plan.rows` row with no `current` whose `photoId` is eligible, take the single option of `placement.kind`; else, if `exifFallback`, the single viable `exif` option; never take a `questionable-zero-gps` option. **The same policy drives the preview counts**, which guarantees the numbers match.
- **Parity test:** for GMI/GML/EXIF fixtures, `previewImportPlacement` placed count === `completeImport().outcome.placed`.

### 8.6 GMI object context (no invented values)

Available on every source object (`gmiPhotoSource.mjs:52–62`): `attributes`, `tema` (`S_FCODE`/`TEMA`), `type` (`attributes.Type`), `identifiers` (`AnleggsID`, `S_OBJID`, `PUNKT-NAVN`, `PUNKT-KODE`, only when present), `geometryScope`, `parserId`. The screenshot's "Punkt 28" is the fallback in `gmiObjectLabel` when none of the identifiers exist.

New `gmiObjectContext(object)` in `photoImportOutcome.mjs`:

- `typeParts` = `getFeatureHoverParts({ properties: object.attributes, geometry: { type: object.geometryScope === 'point' ? 'Point' : 'LineString' } })` from `src/lib/map/featureHoverLabel.mjs`. This is the map tooltip's existing logic: S_FCODE plus Type when different; for lines, dimension/material/year. Use only the first two parts.
- `anleggsId` = `object.identifiers.AnleggsID ?? null`.
- Presentation: `KUM · AnleggsID 1234`, or `VL 160 · ledning` for lines, or `gmiObjectLabel(object)` as the last resort.
- **Do not add a code→name dictionary.** The repo has none that can be verified for these codes, so the S_FCODE code is shown as-is.

### 8.7 Components

| File | Action |
|---|---|
| `PhotoCollectionDialog.js` | **Replace** with `PhotoImportWizard.js` (shell + step header + footer). Delete the old file. |
| `PhotoCollectionPanel.js` — default export (grid) | **Keep and change**: accept `toolbar` and `emptyState` render props/children. Removal toggle `aria-label` → "Velg {filnavn}"; title → "Velg bildet". Keep collision badge and override. |
| `PhotoCollectionPanel.js` — `SelectedPhotoInspector` | **Keep for the workspace only**, and remove the `proposedEntry` prop (import-only). |
| new `PhotoImportPreview` (same file or `PhotoImportPreview.js`) | **New**: read-only preview (section 6.3) |
| new `PhotoImportPlacementStep.js` | **New**: radio cards and file inputs for GMI/GML |
| new `PhotoImportReviewStep.js` | **New**: outcome, exceptions, toggles, target select, diagnostics disclosure |
| `PhotoGmiReconciliation.js` | **Delete** (replaced by the review step) |
| `PhotoGmiSummary.js`, `PhotoGmlSummary.js` | **Keep** as diagnostics under "Tekniske detaljer" and in the workspace wizard |
| `PhotoSpatialInspector.js` | **Simplify**: remove draft-only branches reachable only through `proposedEntry`/no `layerId` (includes the dead draft EXIF-direction adoption, PHOTO-041). Verify by grep that no remaining caller passes them. |
| `PhotoMetadataEditor.js` | **Unchanged**; no longer rendered in import |
| `PhotoPositioningWizard.js` | **Change minimally**: remove the `initialPositions` prop, the `opened` toggle handler and the initial `savedMessage` path. Move `readErrors` to the shared module. Everything else stays (workspace tool). |
| `photoCollectionPanel.css` | Remove `.photo-reconciliation-counts*`; add toolbar/preview/step rules |
| `globals.css` photo-dialog rules | Remove `.photo-collection-notice`. Adjust `.photo-collection-inspector:has(.photo-spatial-inspector)` rules; they become workspace-only (verify the workspace still uses them). |
| `page.js` | Simplify per section 8.3 |
| `LayerPanel.js`, `PhotoWorkspaceCollection.js`, `ProductHeader.js` | Entry buttons unchanged except passing context. Workspace gets a dismissible one-line import notice. |

---

## 9. Components and actions to remove or retire

| Retire | Where | Replacement |
|---|---|---|
| Header cluster: **Legg til bilder / Velg leveransemappe / Legg til GML-kildedata / Velg alle / Fjern valg / Fjern valgte** | `PhotoCollectionDialog.js:97–109` | Step 1 empty-state actions + grid toolbar; GML moves to step 2 |
| Notice block (GMI line, **Mållag**, session note, EXIF/GML sentences, "Siste import", thumbnail progress text) | `:134–171` | Subtitle, toolbar count, footer status; target select moves to Kontroll (GMI context) |
| **Kontroller referanser** / **Bekreft bilder og koblinger** / **Tilbake til bilder** | `:182–190` | **Neste** / **Opprett fotolag** / **Tilbake** |
| Separate ordinary **Opprett fotokartlag (N bilder)** / **Legg til N … i laget** footer branch | `:191` | One final action per context |
| Metadata/position editing in import (`PhotoMetadataEditor`, `PhotoSpatialInspector` via `SelectedPhotoInspector`) | `PhotoCollectionDialog.js:176` | `PhotoImportPreview` |
| Six-row count table + path sentence | `PhotoGmiReconciliation.js` | Outcome line + exceptions; detail in "Tekniske detaljer" |
| Automatic opening of `PhotoPositioningWizard` after GMI import (`initialPositions`) | `page.js:227`, wizard `:31,53–58` | Placement applied by `completeImport` |
| `loadedPhotoImport`, `photoImportTarget`, `showPhotos`, dual `createPhotoLayer` | `page.js:130–132,220–235` | `photoImport` context |
| Import-only `proposedEntry` chain and the draft GML "proposed" evidence display | dialog `:34–35`, inspector props | Removed. GML outcome shown in Kontroll. |
| Upload-arrow icon `UploadSimpleIcon` | dialog `:4,100` | `ImagesIcon`/`PlusIcon` for **Velg bilder**, `FolderOpenIcon` for **Velg mappe** |

**Tests encoding obsolete UI** (replace, do not weaken):

- `photoLoadedGmiUi.test.mjs`: flow parts using **Kontroller referanser**, **Bekreft bilder og koblinger**, `.photo-reconciliation-counts`, **Bruk valgte posisjoner**. Replace with the new GMI flow. Keep its domain-level expectations: relative-path matching, include/exclude, append and override.
- `photoDialogLayout.test.mjs`: rewrite for the new layout.
- 11 UI files click **"Opprett fotokartlag (N bilder)"**: `gmiPhotoAssociationsUi`, `gmiPhotoPlacementsUi`, `photoAppendDuplicatesUi`, `photoDialogLayout`, `photoDirectionUi`, `photoLoadedGmiUi`, `photoManualPlacementUi`, `photoMarkerProvenanceUi`, `photoPositioningUi`, `photoSpatialUi`, `photoWorkspaceUi`. Several then click **Bildemodul**, which becomes unnecessary because the wizard now enters the workspace.
- 3 files wait on `.photo-collection-notice [role=status]` text "Lager miniatyrbilder": `gmiPhotoAssociationsUi`, `gmiPhotoPlacementsUi`, `photoPositioningUi`. Replace with a stable `data-thumbnails-pending` attribute on the wizard.
- `photoSourceWorkflow.test.mjs:249–262` source-pattern test: keep. Still exactly one `<PhotoPositioningWizard`; re-check the `cancelPhotoEditing(); setPhotoSourceWorkflow` regex after the `page.js` edit.

---

## 10. Functionality explicitly preserved

- Asset/occurrence model, shared originals, repeated references → distinct point occurrences, LINE = link only (`planGmiAssociations`/`commitGmiPlan` untouched).
- Loaded-GMI exact identity, liveness, ticket/fingerprint checks; the GMI file is never requested again in GMI context.
- Matching rules (relative path → suffix → unique basename, case/NFC), ambiguity never auto-resolved, unsafe references not followed.
- Include/exclude unreferenced photos (now a contextual toggle).
- Append: filename-collision skip with per-photo **Legg til likevel**; recheck of the same GMI fingerprint without duplicating sources/occurrences; existing placements untouched.
- Optimistic guards on both commits (stale review → nothing written; user sees "Bildene eller GMI-kilden er endret. Kontroller på nytt." and is returned to Kontroll with a refreshed review).
- Placed occurrences are never moved by import; source arrival alone never accepts coordinates. The user's explicit **Opprett fotolag** with a chosen source is the acceptance.
- Original `File` retention / release on cancel, removal and reset; session-only scope.
- Full `PhotoPositioningWizard` (mixed sources, per-occurrence choice, keep-current, compare, add GML/GMI later, remove GMI source) remains in the workspace.
- All diagnostics remain reachable through **Tekniske detaljer** in Kontroll (`PhotoGmiSummary`/`PhotoGmlSummary`) and in the workspace.

---

## 11. Proposed Norwegian UI copy

| Location | Copy |
|---|---|
| Dialog title | **Legg til bilder** |
| Subtitle | GMI: *Til {lagnavn}* · Append: *Legg til i {fotolag}* · New: *Nytt fotolag* |
| Step labels | **Bilder** · **Plassering** · **Kontroll** |
| Empty state heading | **Velg bildene du vil legge til** |
| Empty state actions | **Velg bilder** · **Velg mappe** |
| Empty state hint | *eller dra bilder hit* |
| Trust line | *Bildene leses bare på denne datamaskinen og sendes ikke noe sted.* |
| GMI tip (GMI context only) | *Tips: Velg hele leveransemappen for sikrest kobling.* |
| Folder hint (beside **Velg mappe**, small) | *Nettleseren kan spørre om å «laste opp» filene. De blir likevel bare lest lokalt.* |
| Toolbar | *{N} bilder · {n} valgt* · **Velg alle** · **Fjern valg** · **Fjern valgte ({n})** |
| Card toggle aria | *Velg {filnavn}* |
| Preview facts | **Filnavn**, **Mappe**, **Størrelse**, **Oppløsning**, **Tatt**, **Fotograf**, **GPS**: *Har posisjon / Ingen posisjon / Leses …*, **Retning**: *Har kompassretning* |
| Disabled Neste reason | *Legg til minst ett bilde.* |
| Placement heading | **Hvor skal bildene plasseres?** |
| Placement options | **Uten plassering** — *Plasser bildene senere i fotolaget.* · **Fra GMI** — *Bruk {filnavn}* / **Velg GMI-fil …** · **Fra GML-fil** — **Velg GML-fil …** · **Fra bildenes GPS** — *{n} av {N} bilder har GPS* |
| Kontroll heading (GMI) | **{a} av {N} bilder ble koblet automatisk** |
| Kontroll heading (EXIF/GML) | **{a} av {N} bilder får posisjon fra {GPS / GML-filen}** |
| Attention line | **{k} bilde(r) trenger kontroll** |
| Figures | *Bilder* · *Plassert* · *Uten posisjon* |
| Exception reasons | *Flere bilder har samme navn – kobles ikke automatisk.* · *Koblet til en ledning – får ikke posisjon automatisk.* · *GMI-objektet mangler brukbar posisjon.* · *Ikke nevnt i GMI-filen.* · *Ikke funnet i GML-filen.* · *Ingen GPS i bildet.* · *GPS-posisjonen ser feil ut (0°, 0°).* · *Finnes allerede i fotolaget og hoppes over.* |
| Missing references | *GMI-filen viser til {m} bilder som ikke er valgt.* (disclosure lists names; hint *Gå tilbake for å legge dem til.*) |
| Repeats (neutral) | *{r} bilde(r) brukes av flere objekter og får én plassering per objekt.* |
| Toggles | **Ta med bilder som ikke er nevnt i GMI-filen** · **Bruk GPS fra bildet når {GMI/GML} mangler posisjon** |
| Disclosures | **Vis automatiske koblinger ({n})** · **Tekniske detaljer** |
| Target (GMI context) | **Legg bildene i** [*Nytt fotolag* / existing names] |
| Primary actions | **Neste** · **Opprett fotolag** · **Legg til i fotolaget** |
| Secondary | **Tilbake** · **Avbryt** |
| Footer status | *{N} bilder · {p} plassert · {u} uten posisjon* |
| Pending | *Leser GMI-filen …* · *Leser GPS fra bildene … {x} av {N}* |
| Stale | *Bildene eller kilden er endret. Kontrollen er oppdatert – se over før du fortsetter.* |
| Workspace notice | *Fotolaget er opprettet. {p} av {N} bilder er plassert.* (append: *{n} bilder er lagt til.*) |
| Session note (Kontroll, muted) | *Fotolaget finnes bare i denne økten.* |

**App-wide "laste opp" replacements (app-owned text only):**

| Location | Current | Proposed |
|---|---|---|
| `page.js:490` | Last opp og valider GMI-filer | **Åpne og valider GMI-filer** |
| `LayerManager.js:73` | Ingen filer lastet opp ennå. | **Ingen filer er åpnet ennå.** |
| `LayerManager.js:79` | Last opp fil | **Åpne fil** |
| `DataDisplay.js:29` | Last opp ny fil | **Åpne ny fil** (verify the component is still rendered) |
| `MapPaneToolbar.js:98,100,132,134` | Nullstill og last opp ny | **Nullstill og åpne ny fil** |
| `AppInfoModal.js:251` | opplastede GMI-filer | **åpnede GMI-filer** |

The statistics wording ("registrerte opplastinger", `StatsModal`/`StatsMap`/`TestModeControl`/`DetailedStatsSection`/release notes) counts usage events, not file transfer. Changing it touches `statsUiContract.test.mjs` assertions. **Listed for the user to decide; not included in the pass.**

---

## 12. Testing and rendered acceptance

### New domain/unit tests (Node, synthetic fixtures)

- `photoImportWizardState.test.mjs`: step derivation per context/placement; `canAdvance` reasons; GMI context skips placement; `none` omits Kontroll.
- `photoImportOutcome.test.mjs`: GMI (confident point → placed; line-only; ambiguous; unreferenced include/exclude; invalid CRS; repeated reference counts in **photos**); GML (matched/unmatched/invalid); EXIF (viable/none/zero-zero); EXIF fallback; `gmiObjectContext` with/without `AnleggsID`/`S_FCODE`/`Type`.
- `photoImportComplete.test.mjs` (session):
  - `completeImport` for none / EXIF / GML / loaded GMI / GMI file / append + GMI recheck / append + EXIF
  - placed occurrences untouched
  - **preview/commit parity**
  - stale review → `ok:false`, no writes
  - `setDraftGmiSource` keeps photos; switching source clears the old one
  - cancel releases Files
  - initiating GMI layer removed mid-wizard → error state, no commit
- Keep all existing domain suites unchanged and green: `photoLoadedGmi*.test.mjs`, `photoImportLayers`, `photoAppendDuplicates`, `photoSourceWorkflow`, `gmiPhoto*`, `photoPositioning`, `photoSession`.

### Browser tests (`PHOTO_UI_URL`, synthetic images and GMI only)

New helper `tests/helpers/photoImportWizard.mjs`:

- `addImportFiles(browser, files, { folder })`
- `waitForThumbnails(browser)` (via `[data-thumbnails-pending="0"]`)
- `createLayerWithoutPlacement(browser)`
- `createLayerWithPlacement(browser, kind)`

Migrate the 11 files to these helpers.

New `photoImportWizardUi.test.mjs` covering:

| Functional path | UX assertion |
|---|---|
| Add selected files; add folder (relative paths retained); remove selected | Step 1 text contains none of `GML`, `EXIF`, `GMI-fil`, `Mållag`, `referanse` (GMI context may show the layer name only) |
| GMI-layer flow → Kontroll → **Opprett fotolag** → workspace, positions accepted | **Velg bilder** and **Velg mappe** exist in all three contexts |
| General flow: none / EXIF / GMI (loaded + file) / GML | Toolbar is in the same `section` as `.photo-collection-grid`, directly before it in DOM order, and visually adjacent (bounding-box gap < 24 px) |
| Successful auto reconciliation (all linked) | No `input`, `textarea` or **Lagre**/**Nullstill** button inside the preview |
| Ambiguous/unresolved case | Primary footer button text ∈ {Neste, Opprett fotolag, Legg til i fotolaget} |
| Repeated reference (one photo, two point objects) → 2 placements | Success rows are inside a collapsed `<details>`; attention cards are outside it and focusable |
| Append vs. new (GMI target select; workspace append with collision override) | GMI context never renders the placement step |
| Cancel/Escape/close at each step releases draft; reopening starts empty; layer deleted while appending closes wizard | Disabled **Neste** exposes its reason text |

### Rendered acceptance (screenshots, inspected by eye)

At **1920×1080** and **1280×720**, using synthetic images (no customer photos), save to `%TEMP%\photo-import-wizard-acceptance`, not committed:

1. empty acquisition screen
2. populated review (≥24 photos, two selected)
3. GMI Kontroll, all linked
4. GMI Kontroll with exceptions (ambiguous + line-only + missing reference)
5. general Plassering step
6. final Kontroll footer with figures

**Pass criteria:** footer and primary action visible without scrolling; no horizontal scroll; grid shows ≥2 rows at 1280×720; outcome headline visible above the fold.

### Regression selections

Rerun the domain selection command from `20261030-1633-…` and the photo browser selection, the production build, focused ESLint (no new findings against HEAD) and `git diff --check`.

---

## 13. Accessibility and layout requirements

- `<dialog aria-labelledby>` title. The step indicator is an `<ol aria-label="Steg">` with `aria-current="step"`; skipped steps are not rendered.
- On step change, focus moves to the step heading (`tabIndex={-1}`). **Tilbake** restores the previous step's scroll position where cheap.
- Tab order: header close → step body (toolbar → grid → preview) → footer (**Avbryt**, **Tilbake**, primary). Escape = **Avbryt** (current behaviour).
- Selection toggle: `aria-pressed` plus a visible check mark and outline. The previewed card has a distinct outline and the text "Vises" (as now). Never rely on colour alone. Exception cards use an icon and text reason, not only amber.
- Disabled actions show a visible reason text (`aria-describedby`).
- Layout: `.photo-collection-frame` column flex. Header and footer `flex: none` (sticky). Body `min-height: 0; overflow: auto`. Step 1 keeps the two-column grid (≥1200 px wide: 42/58; narrower stacks per the existing `@media`). The grid toolbar is sticky inside the gallery scroller.
- At 1280×720 with the dialog at `100dvh − 2rem`, the step 3 headline and figures must fit above the exception list. The exception list scrolls inside the body.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| **Losing reconciliation capability while simplifying** (ambiguity, missing references, unsafe/invalid refs, repeats) | Every category maps to an exception card, a neutral note or **Tekniske detaljer** (section 8.5); the existing `PhotoGmiSummary` is kept whole. Tests per category. |
| **Draft-level GMI generalization** breaks loaded-import guards (liveness, target change, stale review) | `beginLoadedGmiImport` kept as a wrapper. Existing 21+3+8 loaded-GMI tests must pass unchanged. New tests for file-origin GMI without `loadedBinding`. |
| **Preview vs. committed placement mismatch** | One shared policy function (`importPlacementRequests`); outcome counts come from the committed layer; parity test. |
| Parallel old/new state paths | Single pass; old dialog file deleted; `page.js` flags removed; grep for `loadedGmi=`, `initialPositions`, `PhotoGmiReconciliation` must return nothing. |
| Append regressions (collision override, recheck, existing positions) | Collision UI kept on thumbnails when the target is known and summarized in Kontroll; append tests (`photoAppendDuplicates*`) retained; "never move placed" rule. |
| Hidden actions becoming unreachable (add GML later, choose a different source per photo, remove a GMI source) | All remain in the workspace **Koble og posisjoner bilder**; the browser test opens it after import. |
| Wrong availability assumptions (no loaded GMI on landing; GMI without CRS; EXIF still pending) | Options derived from live state; pending blocks the primary action with text; CRS-less GMI → `linked-no-position` exceptions. |
| Stale session / reset (survey removed, `resetAll`, target FOTO deleted mid-wizard) | Reuse the existing subscriptions; tests for each. |
| Escape discards a large selection without confirmation | Unchanged from today; noted for a future decision, not added scope. |
| Small viewports | Sticky footer, scroll body, 1280×720 screenshots are mandatory. |

---

## 15. Implementation-pass recommendation

**One cohesive implementation pass. This is safe and efficient.**

Justification from the code:

- The UI footprint being replaced is small: `PhotoCollectionDialog.js` is 197 lines, `PhotoGmiReconciliation.js` 36 lines, `page.js` import orchestration about 90 lines, plus a few lines in `PhotoPositioningWizard.js`.
- Both commits and all guards already exist and are reused. The domain additions are three thin session methods and two pure modules.
- Splitting would create exactly the harmful intermediate state: the old multi-mode dialog and the new wizard, or old and new `page.js` flags, coexisting. Alternatively, a state layer would ship with no UI to exercise it. Neither is a real dependency boundary.

**Required order inside the pass** (ordering, not separate passes):

1. Pure modules and session methods with their unit tests, all green.
2. The wizard UI and `page.js` switch-over, deleting the old dialog in the same change.
3. Test migration, browser tests and rendered acceptance.

If the implementer runs short, drop optional item 8.4-4 (folder drag-and-drop) and the stats wording, not test coverage.

---

## 16. Explicit deferrals

Not part of this work: FOTO workspace redesign; selected-photo inspector overhaul; map Edit mode; move/rotation handles; edit-session undo/redo and save/discard; map thumbnail mode; post-import metadata editor redesign; date/time picker; automatic EXIF metadata acceptance redesign; export/readiness UI; Gemini VA exporter; WFS; persistence; 3D; topology; general styling overhaul; `PhotoPositioningWizard` redesign; manual ambiguity resolution UI; statistics "opplasting" wording (user decision).

**Hand-off interfaces for later work:**

- `completeImport` returns `{ layer, outcome }`. The workspace can open filtered to *Uplassert* or highlight attention items in a later milestone.
- `previewImportPlacement` rows can feed a future workspace "trenger kontroll" filter.

---

## 17. Implementation checklist

**Preflight**
- [ ] Confirm HEAD `de208f9` (or the reviewed successor), clean tree, and that the baseline domain + photo browser selections pass.

**Domain**
- [ ] Add `photoImportWizardState.mjs` (context, reducer, `importSteps`, `canAdvance`) and tests.
- [ ] Add `photoImportOutcome.mjs` (`previewImportPlacement`, `summarizeImportOutcome`, `importPlacementRequests`, `gmiObjectContext` reusing `getFeatureHoverParts` and `gmiObjectLabel`) and tests.
- [ ] Move `readErrors` from `PhotoPositioningWizard.js` into a shared presentation module and import it from both places.
- [ ] In `photoSession.mjs`, add `setDraftGmiSource`/`clearDraftGmiSource`, and refactor `beginLoadedGmiImport` to use them without changing its behaviour.
- [ ] Add `clearDraftPositioningGml`.
- [ ] Add `completeImport({ loadedReview, placement })` reusing Commit A and Commit B.
- [ ] Unit tests: `completeImport` matrix, parity, stale/cancel/reset, file-origin GMI.
- [ ] (Optional) `importFiles` accepts `{ file, relativePath }` and the dialog handles directory drop.

**UI**
- [ ] Create `PhotoImportWizard.js` with the shell lifecycle copied from `PhotoCollectionDialog.js:45–71`, step header, sticky footer, `data-thumbnails-pending`.
- [ ] Step 1: change the `PhotoCollectionPanel` grid to accept toolbar/empty state; add `PhotoImportPreview` (read-only, **Vis stort**). Folder input in all contexts. Icons: Images/Plus and FolderOpen.
- [ ] Add `PhotoImportPlacementStep.js` (none/GMI loaded/GMI file/GML/EXIF; inline errors).
- [ ] Add `PhotoImportReviewStep.js` (outcome, exceptions, toggles, target select in GMI context, collapsed successes, **Tekniske detaljer**).
- [ ] `page.js`: single `photoImport` context and the open/close/complete handlers; enter the workspace with a notice; remove `initialPositions` usage.
- [ ] `PhotoWorkspaceCollection.js`: dismissible one-line import notice.
- [ ] `PhotoPositioningWizard.js`: remove `initialPositions`/`opened`/initial `savedMessage`.
- [ ] Delete `PhotoCollectionDialog.js` and `PhotoGmiReconciliation.js`; remove `.photo-reconciliation-counts*` and `.photo-collection-notice` CSS; remove the `proposedEntry` chain and draft-only `PhotoSpatialInspector` branches after grep confirms they are unused.
- [ ] App-wide "laste opp" copy replacements (section 11 table, app-owned only).

**Tests**
- [ ] Add `tests/helpers/photoImportWizard.mjs` and migrate the 11 UI files plus the three thumbnail-wait call sites.
- [ ] Rewrite the flow parts of `photoLoadedGmiUi.test.mjs` and `photoDialogLayout.test.mjs`; re-check the `photoSourceWorkflow.test.mjs` source-pattern assertions.
- [ ] Add `photoImportWizardUi.test.mjs` (section 12 matrix).

**Validation**
- [ ] Domain selection, photo browser selection, WFS browser selection (no request side effects), build, focused ESLint (no new findings), `git diff --check`.
- [ ] Rendered acceptance: six screenshots at 1920×1080 and 1280×720, inspected.
- [ ] Final grep: no `loadedGmi=`, `initialPositions`, `PhotoGmiReconciliation`, `Kontroller referanser`, `Bekreft bilder og koblinger`, or `UploadSimpleIcon` in `src/`.
- [ ] Write the implementation report in `docs/agent-reports/`.
