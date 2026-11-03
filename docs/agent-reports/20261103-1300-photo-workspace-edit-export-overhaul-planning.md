# FOTO workspace, Edit mode and export-preparation overhaul — planning

Date: 2026-11-03, Europe/Oslo. Planning only. No production code, tests or other reports were changed. No commit, push or sub-agents.

Norwegian text in `«…»` or code formatting is proposed UI copy. Everything else is English.

---

## 1. Preflight

| Check | Result |
|---|---|
| Repository root | `C:/GitHub/gmi-validering-test` (`git rev-parse --show-toplevel`) |
| Branch | `feature/photo-workspace` |
| HEAD | `4c16e90ccc18540844b7f7bbcaa836bf8ea53951` — *Constrain photo import wizard width* |
| Worktree | Clean at start (`git status --porcelain` empty). This report is the only new file |
| Baseline | Current HEAD. Import wizard overhaul, acceptance fixes and width polish (`d59b636`, `21f419e`, `4c16e90`) are accepted and out of scope |
| Libraries | Next 16.1, React 19.2.1 (React compiler active), Leaflet 1.9.4, react-leaflet 5, `@phosphor-icons/react` 2.1.10 |

Every Phosphor icon named in this plan was checked against `node_modules/@phosphor-icons/react/dist/csr`. All exist.

### Revision 1 (2026-11-03): agreed reviewer decisions and refinements

This revision is planning-only. It records decisions and closes the open questions from the first version.

| # | Decision | Where applied |
|---|---|---|
| R1 | **Every icon-only interactive control** gets a concise Norwegian tooltip shown on pointer hover *and* on keyboard focus, in addition to its `aria-label`. Controls with visible text get no redundant tooltip. A tooltip is never the only source of meaning | §7, §8, §10, §12, §17, §18, §24, §27 (spec and inventory), §29, §30, §34 |
| R2 | The right inspector stays **read-only in place**. `Rediger opptaksdata…` remains the single contextual action, in the `Opptak` section, because it opens a separate focused dialog. It is **not** moved into the workspace `Verktøy` menu | §8, §9 |
| R3 | Direction labels use **Norwegian compass letters**: `N, NØ, Ø, SØ, S, SV, V, NV` | §14, §18, §29 |
| R4 | Update the outdated Gemini verification copy to reflect **successful real import testing**, without implying certification or guaranteed compatibility | §21 |
| R5 | The thumbnail minimum zoom stays **16**, as an initial value that acceptance testing can tune | §13 |
| R6 | Filters apply to **both the list and the workspace map**. The selected photo always remains visible on both | §10 |

---

## 2. Source material reviewed

Reports, read for evidence and intent:

- `20261101-0921-photo-ui-control-audit.md`: primary input. It counts 232 placements, 184 logical actions and 47 duplicate groups. Sections 7, 9, 10, 11, 13, 21 and 22 matter most here.
- `20261103-1033-photo-import-wizard-ui-overhaul-implementation.md` and the import planning, acceptance and width-polish reports. Read only to see where import hands off to the workspace: completion opens the workspace and sets `importNotice`.
- `20261030-1543-photo-workflow-current-state-audit.md`, `20261030-1633-photo-loaded-gmi-reconciliation-implementation.md`.
- `20261031-0920-photo-metadata-implementation.md`, `…-0937-photo-export-contract-audit.md`, `…-1152-photo-dual-export-implementation.md`, `…-1400-photo-export-readiness-implementation.md`, `…-1456-photo-bulk-manual-fill-implementation.md`.
- `20261101-1201-photo-marker-provenance-colors-implementation.md`, `20261102-0844-photo-marker-color-cursor-refinement.md`.
- `20261102-0928-gemini-va-photo-export-compatibility.md`, `20261102-1036-gemini-va-photo-guid-acceptance-fix.md`.
- Older branch-era reports: workspace, direction, manual placement, unified source workflow. Used for boundaries only.

Production source inspected at HEAD:

- `src/app/page.js` (workspace wiring, lines ~130–224, ~373–379, ~563–706)
- `src/components/WorkspaceShell.js`, `ProductHeader.js`, `MapView.js`, `MapInner.js` (~1131–1133, ~2190–2192, ~2310)
- `src/components/photos/`: `PhotoWorkspaceCollection`, `PhotoCollectionPanel` (`SelectedPhotoInspector`), `PhotoSpatialInspector`, `PhotoMetadataEditor`, `PhotoDirectionControls`, `usePhotoDirectionEdit`, `PhotoManualPlacementControls`, `PhotoManualPlacementLayer`, `usePhotoManualPlacement`, `PhotoMarkersLayer`, `PhotoMapController`, `PhotoMapPopup`, `PhotoPositionLegend`, `PhotoOccurrenceContext`, `PhotoGmiInspector`, `PhotoGmiSummary`, `PhotoGmlSummary`, `PhotoPositioningWizard`, `PhotoExportDialog`, `PhotoEvidenceActions`, `PhotoManualFillActions`, `PhotoLayerCard`, the workspace/direction/placement CSS
- `src/lib/photos/`: `photoSession.mjs` (all of it), `photoWorkspaceState.mjs`, `photoMarkerPresentation.mjs`, `photoMapFeatures.mjs`, `photoMapPanes.mjs`, `photoDirection.mjs`, `photoSpatial.mjs`, `photoPresentation.mjs`, `photoCaptureMetadata.mjs`, `photoEvidenceAdoption.mjs`, `photoManualFill.mjs`, `photoImportOutcome.mjs` (`gmiObjectContext`), `gmiPhotoSource.mjs` (object identifiers, associations), `imagePreview.mjs` (thumbnail size)
- `src/lib/photos/export/`: `exportContract.mjs`, `photoExportPlan.mjs`, `photoExportDiagnostics.mjs`, plus `photoExportXml.mjs` (only to confirm which profiles serialize direction and photographer)
- Patterns reused from elsewhere: `FieldDetailModal.js` and `MissingFieldsReport.js` (back arrow), `validation-v2/ValidationV2Workspace.js` (funnel/sort menu), `MapPaneToolbar.js` (overflow), `GeminiReferenceCard.js` (eye toggles)
- Tests: the full photo test list, plus label-dependency greps (section 29)

The Gemini WFS internals and the export serializers were not audited beyond integration points.

---

## 3. Current workspace architecture

### Ownership

- **Canonical photo state.** `photoSession` (`photoSession.mjs`) is a framework-free singleton store published through `useSyncExternalStore` (`usePhotoSession`).
  - **Assets** own the `File`, the thumbnail object URL, capture metadata, metadata evidence and direction evidence.
  - **Records** are *occurrences*: `spatial.current`, `direction.current` and `occurrence` (the referring GMI point).
  - **Layers** own `photoIds` (occurrence IDs), `assetIdsByPhotoId` and `spatialSources`.
  - Guards: `generation` (bumped by `clear()`), `editVersion` (one live edit ticket at a time), `manualVisibilityVersions` (ticket dies on a visibility change), identity checks on `spatial.current` / `direction.current`, and source-workflow tickets keyed by membership identity.
- **Workspace UI state.** `photoWorkspaceReducer` in `photoWorkspaceState.mjs` holds `{ layerId, photoIds, activePhotoId, selectedIds }`. It lives in `page.js` (`useReducer`) and is reconciled on every session publish (`page.js:203–207`). `activePhotoId` is an occurrence ID. `selectedIds` is the batch selection, used only for removal and the selection-scoped metadata batch.
- **Editing hooks.** `usePhotoManualPlacement` and `usePhotoDirectionEdit` are owned by `page.js` and made mutually exclusive there (`page.js:133–141`). Each wraps a one-photo session ticket (`beginManualPlacement` / `applyManualPlacement`, `beginDirectionEdit` / `applyDirectionEdit`). Each commits to canonical state on its own `Bruk …` click. Each installs its own document-level Escape handler. Both are cancelled on active-photo change, enter, exit and before any dialog (`cancelPhotoEditing`).
- **Dialogs.**
  - `photoImport` (import wizard context) and `photoSourceWorkflow` (positioning wizard) live in `page.js`.
  - `exportOpen` is *local* to `PhotoWorkspaceCollection`.
  - Removal confirmation is local to `PhotoWorkspaceCollection`.
  - `importNotice` is a page string rendered as a permanent banner in the collection pane.

### Layout

`WorkspaceShell` renders `ProductHeader` (persistent `Bilder` creation button and app info) above the left sidebar. In the workspace the sidebar is a fixed 280 px (`photoWorkspace.css:1`). The map fills the primary area; `MapPaneToolbar` is hidden in the workspace. The inspector is an `<aside class="photo-workspace-inspector">` with width `clamp(460px, 30vw, 520px)`.

Measured arithmetic:

| Viewport | Left pane | Inspector | Map |
|---|---|---|---|
| 1920 px | 280 | 520 | ~1120 |
| 1280 px | 280 | 460 | ~540 |

### Map rendering

- `MapInner` builds `photoFeatures` from every visible FOTO layer each render (`buildPhotoMapFeatures`). It renders `PhotoMarkersLayer` (pane `photo-markers`, z 620) and `PhotoManualPlacementLayer` (pane `photo-placement`, z 640).
- `PhotoMarkersLayer` calls `photoSession.getPhoto(photoId)` per feature. `publicPhoto` scans layers and recomputes associations on every call, so cost is roughly O(n²) per render for large layers.
- Camera icons are pre-built per source and selected state. A selected photo with a direction gets a fresh `L.divIcon` every render.
- **Direction arrows render only for the selected marker** (`cameraMarkerOptions`: `heading = selected ? … : null`).
- Outside the workspace, markers open `PhotoMapPopup`. Inside, a click selects the photo.
- Map chrome while in the workspace:
  - top-left: Leaflet zoom control, with the `Lagmarkering` trigger below it at `top: 124px`
  - top-right: `LayersControl`
  - bottom-left: zoom indicator and the Gemini WFS / WMS buttons
  - bottom-right: `PhotoPositionLegend` (`pointer-events: none`)
  - The **top-centre is free**.

### Source colours (verified in `photoMarkerPresentation.mjs`)

EXIF `#19785b`, GMI `#2463b5`, GML `#a03b82`, Manuell `#b06a08`, Ukjent `#64748b`. These match the brief. The accepted arrow currently uses `#075e9a`, which is visually close to GMI blue. The proposed (in-edit) arrow uses `#a34c00`, which is close to manual orange.

### Thumbnails

Built once per asset at max edge 320 px (JPEG, quality 0.8) by `createPhotoThumbnail`. The object URL is owned by the session and revoked in `release()` (`photoSession.mjs:322–336`). The inspector creates and revokes its own original-file URL per selection (`PhotoCollectionPanel.js:88–99`). The map can therefore reuse `preview.thumbnailUrl` without any full-resolution decode.

### Export (relevant facts)

`PhotoExportDialog` owns profile, CRS, AsBuilt context, preview and package. It mounts `PhotoEvidenceActions` (four evidence commands plus `PhotoManualFillActions` with three forms) before the preview. Plan-time blocking rules, from `photoExportPlan.mjs`:

| Requirement | `legacy2019` | `gemini-legacy2019` | `asbuilt52` |
|---|---|---|---|
| ≥1 placed occurrence | blocking (`no-placed-photos`) | blocking | blocking |
| Unplaced occurrences | excluded, warning `unplaced-excluded` | same | same |
| Accepted capture time with seconds, per placed asset | **blocking** (`capture-time-required` / `capture-time-precision`) | not blocking; counted in `compatibility-time` warning; timezone suffix and fractions stripped in XML | **blocking** |
| Accepted direction, per placed occurrence | **blocking** (`direction-required`) | **blocking** | not required; serialized if present (`photoExportXml.mjs:16–19,46`), validated if present (`invalid-direction`) |
| Photographer | optional; serialized; must be XML text (`invalid-xml-text` blocks) | omitted (warning) | omitted (warning `photographer-omitted`) |
| CRS | EPSG:25832 / 25833 choice | fixed EPSG:5972 (XYZ, Z=0 placeholder) | EPSG:25832 / 25833 choice |
| Context (7 fields) | — | — | **blocking** (`invalid-context`) |
| Plan-only errors | `missing-file`, `file-read-failed`, `projection-failed`, `attachment-naming`, `invalid-direction`, `stale-plan` | same | same |

Gemini has fixed behaviour: UUIDv4 GUIDs and `Attachments\` backslash paths. It has been accepted empirically and must not change.

---

## 4. Current control inventory relevant to this scope

Derived from current JSX and the audit's IDs. "Fate" is the destination in this plan.

### Left pane (`PhotoWorkspaceCollection.js`)

| # | Control (current) | Audit ID | Fate |
|---|---|---|---|
| L1 | Import notice + `Lukk` (permanent banner) | — | **Replace** with a transient toast (section 7) |
| L2 | `Tilbake til appen` text button | PHOTO-008 | **Restyle** to the established back-arrow icon button |
| L3 | Count line | — | **Keep**, more compact |
| L4 | `Vis på kartet` checkbox | PHOTO-009 | **Keep** as a compact eye toggle in the header |
| L5 | `Legg til bilder` | PHOTO-010 | **Move** to Verktøy |
| L6 | `Eksporter` | PHOTO-011 | **Move** to Verktøy |
| L7 | `Koble og posisjoner bilder` | PHOTO-012 | **Move** to Verktøy |
| L8 | `Kilder og koblinger` disclosure, per-source details | PHOTO-013/014 | **Move** to a read-only dialog from Verktøy |
| L9 | Per-source `Kontroller på nytt` | PHOTO-015 | **Delete from workspace**. Already present in wizard step 1 (`PhotoPositioningWizard`, source inventory) |
| L10 | `Vis` filter select (Alle / Plassert / Uplassert) | PHOTO-016 | **Replace** with the funnel filter panel |
| L11 | `n valgt`, `Velg alle viste`, `Fjern valg` | PHOTO-017/018 | **Scope down** to removal selection mode only |
| L12 | `Fjern fra lag`, `Fjern hele bildet med alle plasseringer` | PHOTO-019/020 | **Keep**, inside removal selection mode |
| L13 | `Opptaksmetadata for {n} unike bilder` (selection readiness, up to 7 commands) | PHOTO-021, META-019..025 | **Delete from workspace**. Selection-scoped completion moves to `Klargjør for eksport` (pass 2) |
| L14 | Per-row checkbox | PHOTO-022 | **Only in** removal selection mode |
| L15 | Per-row select button | PHOTO-023 | **Keep** as the primary row interaction |
| L16 | Per-row `PhotoOccurrenceContext compact` | — | **Replace** with the compact status lines (section 34) |
| L17 | Remove confirmation dialog | PHOTO-024/025 | **Keep** (extract to its own file) |

### Inspector (`SelectedPhotoInspector` → `PhotoMetadataEditor`, `PhotoSpatialInspector`, …)

| # | Control | Audit ID | Fate |
|---|---|---|---|
| I1 | `Vis stort` | PHOTO-026 | **Keep** |
| I2 | File facts | — | **Keep**, as the `Fil` section |
| I3 | `Lagre opptakstid` / `Nullstill opptakstid` / `Lagre fotograf` / `Nullstill fotograf` (always-open forms) | META-010/011/015/016 | **Delete from inspector**. Replaced by `PhotoCaptureMetadataDialog` with date/time controls (pass 1) |
| I4 | `…: kildeverdier` disclosures + `Bruk EXIF/GML som …` | META-012..014, 017, 018 | **Read-only evidence** stays in the inspector. Adoption moves to the metadata dialog |
| I5 | `Zoom til posisjon` | PHOTO-027 | **Keep** as a labelled locate icon (navigation, not editing) |
| I6 | `Kontroller kilder og posisjon` | PHOTO-028 | **Delete**. One entry: Verktøy → `Koble og posisjoner bilder`. The audit (§9) showed it only sorted rows while acting on the whole layer |
| I7 | Candidate list + `Zoom til EXIF/GML/GMI` | PHOTO-029..031 | **Collapse** into the `Andre mulige posisjoner` disclosure, with per-candidate locate icons |
| I8 | `Kildeinformasjon (…)` raw JSON | PHOTO-032..034 | **Keep**, nested under `Tekniske kildedata` |
| I9 | `Referert fra GMI` nested disclosures | PHOTO-035/036 | **Flatten** into the `Koblinger` section |
| I10 | `Plassering: {object}` disclosure | PHOTO-037 | **Replace** with the occurrence switcher and object context |
| I11 | `Plasser på kartet` / `Flytt på kartet`, map click, proposal marker, `Bruk plassering`, `Avbryt` | POSITION-001..005 | **Delete**. Replaced by Edit mode |
| I12 | `Juster retning`, slider, −1° / +1°, number, `Bruk retning`, `Avbryt` | POSITION-006..011 | **Delete**. Replaced by Edit mode rotation |
| I13 | `EXIF-retning: kildeverdier` + `Bruk EXIF-retning for denne forekomsten` | POSITION-012/013 | **Read-only evidence** stays. Adoption goes to export preparation (pass 2); whole-layer adoption stays in Eksporter until then |
| I14 | Trailing help paragraphs | — | **Delete** |

### Map

| # | Control | Fate |
|---|---|---|
| M1 | Camera marker select (workspace) / popup (outside) | **Keep** |
| M2 | Direction arrow, selected marker only | **Change**: always visible when a direction exists |
| M3 | Manual placement capture layer, orange proposal marker, connector | **Replace** with `PhotoEditLayer`. Its click-capture and drag-threshold logic is reused |
| M4 | `PhotoPositionLegend` (static) | **Replace** with the interactive `PhotoMapDisplayCard` (legend plus marker/thumbnail toggle) |
| M5 | Unplaced hint overlay (`page.js:622–626`) | **Keep**. Copy updated to point at the Verktøy item |

---

## 5. UX diagnosis

1. **Every capability is a peer.** The left pane shows eight non-row controls at baseline (audit §7, hotspot 5). They mix once-per-layer actions (add, source workflow, export), diagnostics (source ledgers, recheck) and frequent navigation (filter), all with the same compact recipe.
2. **The inspector is an editing form wearing an information panel's clothes.** The measured scroll height was 1496 px against 720–1080 px of client height. Save/reset forms sit *above* position and direction, so you must scroll past editing to learn where a photo is.
3. **Spatial editing is modal per photo, and each change commits on its own.** Move = start → click → drag → apply. Rotate = start → slider → apply. Every change commits immediately with no undo. Each mode dies on selection change, so photo-by-photo work costs many clicks.
4. **Direction is invisible unless a photo is selected.** That rules out spatial review of headings.
5. **Batch selection lives on every row.** It is always present, but used only for removal and an embedded readiness form that competes with the list (audit: 1625 px scroll height in a 644 px client).
6. **Readiness appears in two places with two scopes** (selection and whole layer), both before a profile-specific summary exists. Profile requirements appear as prose, not as tasks.
7. **Transient import feedback becomes permanent clutter** (`importNotice` banner).

The functionality is mostly right. What is wrong is the hierarchy and the transaction model.

---

## 6. Target workspace hierarchy

| Surface | Responsibility | Persistent content |
|---|---|---|
| **Left pane** | Find and select photos | Back, layer name, visibility, counts, `Verktøy`, filter, sort, list |
| **Map** | Spatial truth and spatial editing | Markers or thumbnails, always-on direction arrows, display card (legend + mode). In Edit mode: command bar, handles |
| **Right inspector** | Understand the selected occurrence | Large preview, grouped read-only facts, provenance, associations. Navigation only (view large, locate). One entry to the metadata dialog |
| **Verktøy menu** | Low-frequency workspace-level tools | Grouped items opening modes or dialogs |
| **Dialogs / modes** | Focused workflows | Edit mode (map), removal selection mode (list), `Koble og posisjoner bilder` (existing wizard), `Kilder og koblinger`, `Rediger opptaksdata`, `Klargjør for eksport`, `Eksporter` |

### Interaction levels

| Level | Contents |
|---|---|
| L1 persistent | Back, visibility, filter/sort, Verktøy, display mode |
| L2 contextual | Selection, inspector navigation, occurrence switching |
| L3 workflow | Edit mode, removal mode, dialogs |
| L4 advanced | Technical disclosures inside inspector, info and export dialogs |

---

## 7. Left pane design

Width: **272 px** (down from 280). The section 28 arithmetic justifies the change.

```
┌───────────────────────────────────────┐
│ ProductHeader (unchanged)              │
├───────────────────────────────────────┤
│ (←)  Bilder (2)                  (👁)  │  back · layer name (h1, truncate) · visibility
│      40 bilder · 36 plassert           │  count line (+ «· 42 plasseringer» if repeats)
│ [🔧 Verktøy ▾]            [⏷•] [⇅]    │  tools · filter (dot when active) · sort
│ Viser 4 av 40 · Uplassert   ✕          │  only when filter active
├───────────────────────────────────────┤
│ ▢ IMG_0001.jpg                          │
│   ● GMI · 123° SØ                       │  status line
│   Kum · AnleggsID 1234 · 1/2            │  object context (GMI occurrences only)
│ …                                       │
└───────────────────────────────────────┘
```

### Header

- **Back.** Round ghost icon button using Phosphor `ArrowLeftIcon` (size 20). This matches the existing pattern in `FieldDetailModal.js:31–48` and `MissingFieldsReport.js:96–112`: a round `p-1.5` ghost button, arrow with stem, `title="Tilbake"`. Phosphor's ArrowLeft is the same glyph as the inline heroicon path those files use. Do **not** refactor those two files in this scope. Built with `PhotoIconButton` (§27): `aria-label="Tilbake til appen"` and tooltip `Tilbake til appen` on hover and focus. No native `title`. Focus returns to the opener (existing `photoTriggerRef`). In Edit mode it goes through the pending-changes boundary (section 19).
- **Layer name.** `h1`, truncated, `title` = full name.
- **Visibility.** `EyeIcon` / `EyeSlashIcon` toggle (`PhotoIconButton`) with `aria-pressed`. The tooltip names the action available in the current state: `Skjul fotolag` while visible, `Vis fotolag` while hidden. The `aria-label` is more specific: `Skjul fotolaget {name} på kartet` / `Vis fotolaget {name} på kartet`. This mirrors `GeminiReferenceCard`. **Unavailable in Edit mode**, because Edit mode forces the layer visible. It uses `aria-disabled`, stays focusable, and its tooltip reads `Fotolaget vises mens du redigerer`.
- **Count line.** `{assets} bilder · {placed} plassert` plus `· {occ} plasseringer` when repeats exist. The unplaced count is implied; the filter panel shows it.

### Toolbar row

- `Verktøy` menu button (section 9).
- Filter and sort icon buttons, plus a reset button that appears only when filter or sort is non-default (section 10).

### List

Covered in sections 11 and 34.

### Removal selection mode

Entered from Verktøy → `Fjern bilder fra laget…`.

- Rows get checkboxes.
- A sticky bar above the list reads: `«Velg bilder som skal fjernes»` · `«Velg alle viste»` · `«Avbryt»`.
- A sticky bottom bar shows the destructive primary action, `«Fjern {n} plasseringer fra laget»`. When any selected asset has more than one occurrence, a secondary destructive action appears: `«Fjern hele bildet med alle plasseringer ({m} bilder)»`.
- Both route through the existing `RemovePhotosConfirmation` and `photoSession.removeLayerPhotos`.
- Esc or `Avbryt` leaves the mode and clears the selection.
- Map clicks still only change the active photo. Batch toggling from the map is deferred.

### Import feedback

`importNotice` becomes a **workspace toast**: `PhotoWorkspaceToast`, `role="status"`, bottom-centre of the map.

- Success auto-dismisses after about 6 s, pauses on hover or focus, and has an icon-only close X (`XIcon`, tooltip and `aria-label` `Lukk melding`).
- The `placementError` notice ("…posisjonene ble ikke brukt") does not auto-dismiss. It carries the action `«Koble og posisjoner bilder»`.

The same toast reports edit saves and metadata changes.

---

## 8. Right inspector design

The new component is `PhotoWorkspaceInspector.js`. It replaces `SelectedPhotoInspector`, which is currently exported from `PhotoCollectionPanel.js` and imported only by `page.js`. Width: `clamp(400px, 32vw, 560px)` (section 28). The preview keeps its current height rule.

**Read-only in place (R2).** Nothing is edited inside the inspector itself: no inline fields, no save, reset, move, rotate or adopt buttons. The inspector contains only these interactive elements:

- navigation: `Vis stort`, the locate icons, the occurrence switcher
- disclosures
- **one contextual action**, `Rediger opptaksdata…`, in the `Opptak` section

That action is allowed because it opens a separate focused dialog (`PhotoCaptureMetadataDialog`) scoped to the selected photo's asset. It stays in the inspector, next to the values it changes. It is **not** a workspace-level tool, so it must **not** be added to the left-side `Verktøy` menu.

### Section order and content

#### Header

- Filename (h2, `title` = relative path).
- **Occurrence switcher**, shown only when `repeatGroup.occurrenceCount > 1`: `«Brukt på {n} plasseringer»` followed by segmented buttons (`aria-pressed`). Labels come from `«{i} · {gmiObjectContext(object)}»`, or `«{i} · Uten objekt»`. Clicking a button sets `activePhotoId` to that sibling occurrence.

#### Preview

Large preview, `Vis stort` (`ArrowsOutIcon`). Existing behaviour. It is icon-only, so it uses `PhotoIconButton`: tooltip `Vis stort`, `aria-label="Vis {filename} stort"`.

#### Summary chips

A one-line row:

- source dot + `«Plassert · GMI»` or `«Uplassert»`
- `«Retning 123° SØ»` or `«Uten retning»`
- `«Opptakstid kjent»` or `«Uten opptakstid»`

In Edit mode, add the `«Endret – ikke lagret»` chip when the occurrence has staged changes.

#### `Plassering` — «gjelder denne plasseringen» (occurrence-level)

- `Status`: `Plassert` / `Uplassert`.
- `Kilde`: source swatch (same colour as the map) + label from `photoPositionSourceKind`.
- `Koordinater`: WGS84 lat/lon, 7 decimals, same format as today. A `«Flere formater»` disclosure adds EUREF89 UTM 32/33 via existing proj4 registrations. This is optional; drop it if reviewers object.
- `Grunnlag`: `«Valgt i Koble og posisjoner bilder»` (acceptance `explicit-candidate`), `«Manuelt plassert»` (`manual`), `«Fra import»`. Plus the accepted date/time when `acceptedAt` is present.
- `Kildefil`: candidate `sourceFilename`, when present.
- Locate icon button (`CrosshairIcon`, `PhotoIconButton`):
  - tooltip `Zoom til bildet`
  - `aria-label="Zoom til {filename} på kartet"`
  - when unplaced: `aria-disabled` (stays focusable) with tooltip `Zoom til bildet – bildet er ikke plassert`
- `Retning`: value plus `photoDirectionLabel`. `Kilde`: `«Manuell»` / `«EXIF bilderetning (sann nord)»` / `«Manuell (samme verdi for flere)»` (bulk). Accepted date/time.
- `«Andre mulige posisjoner ({n})»` disclosure, shown only when viable non-current candidates exist. Each row shows kind, source file, distance from current (`photoPositionDistance`), any zero-GPS warning, and a locate icon. The locate icon's tooltip is `Zoom til EXIF-posisjon` / `Zoom til GMI-posisjon` / `Zoom til GML-posisjon`; its `aria-label` adds `for {filename}`. A nested `«Tekniske kildedata»` holds the JSON.
- `«Retningsdata fra bildet»` disclosure, shown only when `directionEvidence` exists. Contains the raw `GPSImgDirection` / `Ref` and the usable / unsupported-reference / invalid interpretation.
- In Edit mode, staged values show in place, each with a secondary `«Lagret: …»` line.

#### `Opptak` — «gjelder bildet (alle plasseringer)» (asset-level)

- `Opptakstid`: formatted with `nb-NO`. Precision notes: `«uten sekunder»`, `«bare dato»`. `«tidssone ukjent»` when `!timezoneKnown`. `Kilde`: `EXIF DateTimeOriginal` / `GML` / `Manuell`.
- `Fotograf` + `Kilde`.
- `«Kildeverdier»` disclosure: every metadata evidence value, read-only. A conflict line appears when usable values differ: `«EXIF og GML oppgir ulike tider»`.
- The single contextual action: `«Rediger opptaksdata…»` (`PencilSimpleIcon` + visible text, so no tooltip). It opens `PhotoCaptureMetadataDialog` for this asset. It is an entry point to a focused dialog, not an in-place editor or save button (R2). In Edit mode it goes through the pending-changes boundary (§19).

#### `Koblinger`

- One row per `gmiPhotoAssociations` entry. These cover all associations of the *asset*.
- Each row shows: `gmiObjectContext(object)` as the title, then TEMA/S_FCODE, Type, the identifiers that exist (`AnleggsID`, `S_OBJID`, `PUNKT-NAVN`, `PUNKT-KODE` from `object.identifiers`), `«Punkt»`/`«Ledning»`, the source file, and GUID under `«Tekniske detaljer»`.
- The row matching `photo.occurrence.object.objectKey` gets the badge `«Denne plasseringen»`.
- Line links show `«Kobling uten posisjon (ledning)»`.
- Empty state: `«Ikke koblet til GMI-objekter.»`.

#### `Fil`

Filnavn, relativ sti, størrelse, dimensjoner, MIME (only if it differs from the extension, or always under details), `«Fil sist endret»` (renamed from `Sist endret` so it isn't confused with capture time), and `«Originalfilen endres ikke.»`.

### Removed from the inspector

All of I3, I4 (buttons), I6, I7 (text buttons), I11, I12, I13 (button), I14. No save, reset, move, direction or adoption buttons remain.

---

## 9. Tools-menu design

**Trigger.** `WrenchIcon` + `«Verktøy»` + `CaretDownIcon`. Attributes: `aria-haspopup="menu"`, `aria-expanded`. Text is always visible; this is not a hamburger. Because it has visible text, it gets **no tooltip**. The same goes for every menu item, which all carry visible text labels (R1).

**Menu.** An anchored popup with `role="menu"`, built in the `ValidationV2Workspace` sort-menu style (`gmi-elevated-surface`, `min-h-9` items). Groups are `role="group"` with `aria-label`, separated by `role="separator"`.

| Group | Label | Icon | Enabled when | Destination |
|---|---|---|---|---|
| **Bilder** | `Legg til bilder…` | `PlusIcon` | always | Import wizard, append context (existing `addPhotosToLayer`) |
| | `Rediger bilder` | `PencilSimpleIcon` | layer has ≥1 occurrence | **Mode**: Edit mode |
| **Posisjoner og kilder** | `Koble og posisjoner bilder…` | `MapPinAreaIcon` | layer has ≥1 occurrence | Existing `PhotoPositioningWizard` (step 1) |
| | `Kilder og koblinger` | `InfoIcon` | always | **Dialog**: `PhotoSourcesInfoDialog` (read-only) |
| **Eksport** | `Klargjør for eksport…` *(pass 2)* | `ListChecksIcon` | ≥1 occurrence | **Dialog**: `PhotoExportPreparationDialog` |
| | `Eksporter…` | `ExportIcon` | ≥1 occurrence | **Dialog**: `PhotoExportDialog` |
| *(separated, destructive)* | `Fjern bilder fra laget…` | `TrashIcon` | ≥1 occurrence | **Mode**: removal selection mode |

Rules:

- Disabled items stay visible with `aria-disabled="true"` and a one-line reason under the label, e.g. `«Laget er tomt»`.
- In Edit mode every item stays enabled. Choosing one runs the pending-changes boundary (section 19) before the tool opens.
- Kept out of the menu:
  - New FOTO layer (`Bilder` stays in `ProductHeader`).
  - Delete FOTO layer (stays on `PhotoLayerCard` outside the workspace).
  - Per-source recheck and remove (stay in wizard step 1).
  - Display mode (map-local, section 12).
  - Visibility (header).
  - `Rediger opptaksdata…`. It is photo-specific and stays as the single contextual action in the inspector's `Opptak` section (R2, §8). The menu holds workspace- and layer-level tools only.

Labels ending in `…` open dialogs; labels without it change mode.

---

## 10. Filter and sort design

Reuse the `ValidationV2Workspace.js:399–460` pattern exactly.

- `FunnelIcon` square button (`h-8 w-8`), `aria-expanded` and `aria-controls`. It toggles an **inline panel** directly below the toolbar row. The trigger shows the `gmi-selected-control` style and a 1.5 px dot when any filter is active.
  - Tooltip: `Filtrer bilder`.
  - `aria-label`: `Filtrer bilder`, or `Filtrer bilder – {n} filtre aktive` when active, so the dot is not the only cue.
- `ArrowsDownUpIcon` button opens a `role="menu"` of `menuitemradio` items.
  - Tooltip: `Sorter bilder`.
  - `aria-label`: `Sorter bilder: {current label}`.
- `ArrowCounterClockwiseIcon` reset button.
  - Tooltip and `aria-label`: `Nullstill filter og sortering`.
  - Shown only when the state is non-default.
- The V2 originals use native `title`, which does not appear on keyboard focus. The photo versions use `PhotoIconButton` instead (§27). Do not modify V2 itself in this scope.

### Filter model

All filters derive from real state.

```
filter = {
  placement: 'all' | 'placed' | 'unplaced' | 'exif' | 'gmi' | 'gml' | 'manual',   // one radio group
  missingDirection: false,    // placed occurrences with direction.current == null
  missingCaptureTime: false,  // asset captureMetadata.captureTime == null
  repeated: false,            // repeatGroup.occurrenceCount > 1 || referringObjectCount > 1
  changed: false,             // Edit mode only: occurrence has staged changes
}
```

Panel layout:

- `«Plassering»` radio group. Each option shows its count, and options with a 0 count are disabled: `Alle (40)`, `Plassert (36)`, `Uplassert (4)`, `EXIF (10)`, `GMI (20)`, `GML (2)`, `Manuell (4)`. Source options use the effective source kind (staged moves count as `Manuell`).
- `«Mangler»` checkboxes: `Retning`, `Opptakstid`.
- `«Annet»` checkboxes: `Flere plasseringer`, `Endret (ikke lagret)`. The latter appears only in Edit mode.

Groups combine with AND.

When the panel is closed and a filter is active, a summary line shows under the toolbar: `«Viser {k} av {n} · Uplassert · Mangler retning»`. It has an icon-only clear X (`XIcon`, tooltip and `aria-label` `Fjern filter`).

Deliberately **not** added:

- `Trenger kontroll` and `Mangler eksportdata`. Both depend on a chosen export profile; export preparation owns them (pass 2). A later ad-hoc "show these in the list" handoff can be added.
- `Ukjent` source. `photoPositionSourceKind` returns `unknown` only for unrecognized bases, which should not occur. Show it only if its count is above zero.

### Scope (agreed, R6)

The filter applies to **the list and to the workspace layer's map markers**. That reduces thumbnail density and lets the user look at "only GMI photos". The selected occurrence is the exception: it **always stays rendered** on the map, and if filtered out it is pinned at the top of the list as `«Valgt bilde (skjult av filteret)»` with a `«Vis alle»` link. A filter change never clears the selection.

### Sort modes

Each mode is a menu item, the same pattern as V2's `Navn A–Å` / `Å–A`. There is no separate direction toggle.

| Key | Label | Rule |
|---|---|---|
| `filename-asc` *(default)* | `Filnavn A–Å` | `localeCompare('nb', { numeric: true, sensitivity: 'base' })`, ties broken by `occurrenceIndex` so siblings stay adjacent |
| `filename-desc` | `Filnavn Å–A` | |
| `capture-asc` | `Opptakstid, eldst først` | Compare the local date-time part (ISO without offset), unknown last. Mixed offsets are deliberately not converted; this matches the "never invent timezone" policy |
| `capture-desc` | `Opptakstid, nyest først` | unknown last |
| `unplaced-first` | `Uplasserte først` | then filename |
| `source` | `Posisjonskilde` | EXIF, GMI, GML, Manuell, Ukjent, Uplassert; then filename |
| `object` | `GMI-objekt / AnleggsID` | Shown only if any occurrence has an object. Linked occurrences by `gmiObjectContext` label (numeric collation), then unlinked |

Filter and sort live in workspace UI state, are reset on workspace exit, and are not persisted.

---

## 11. Selection semantics and synchronization

| Concept | Current | Target |
|---|---|---|
| Selected occurrence | `workspace.activePhotoId` | Unchanged. The single source of truth for list highlight, map selection and inspector |
| Selected asset | implicit | Derived: `activeOccurrence.assetId`. Never stored |
| Batch selection | `workspace.selectedIds` on every row | Renamed `removalIds`. Exists only in `mode === 'remove'` |
| Map selection | same `activePhotoId` | Unchanged |
| Export-preparation selection | `selectedIds` reused | **Local** to the export-preparation dialog (pass 2). Never shares workspace state, which removes the audit's scope ambiguity |

Synchronization:

- **List → map.** Clicking a row sets `activePhotoId` and issues a `panIntoView` request. `PhotoMapController` calls `map.panInside(latlng, { padding: [60, 60] })` only if the marker is outside the view. It does **not** zoom; zoom stays on the explicit locate icon.
- **Map → list.** Clicking a marker sets `activePhotoId`. The list scrolls the row into view (`scrollIntoView({ block: 'nearest' })`), or shows it pinned if it is filtered out.
- **Inspector.** Follows `activePhotoId`. `key` stays `assetId`, so switching between siblings keeps the original-image URL. Today's `key={assetId}` already does this.
- **Keyboard on the list.** ArrowUp/ArrowDown move selection between visible rows, Home/End jump. Implement as a roving-tabindex list of buttons (`aria-pressed`).
- **Repeated assets.** One list row per occurrence (unchanged). The row's third line shows the object context plus `«1/2»`. The map shows one marker per placed occurrence. When an occurrence is selected, its **sibling occurrences** get a thin dashed neutral outline (`«samme bilde»`), with a matching legend entry in the display card. The inspector switcher selects siblings explicitly. Edits always target only the selected occurrence, and the Edit-mode hint says `«Dette bildet har {n} plasseringer. Du endrer bare denne.»`.
- **Reconcile.** Removed occurrences fall back to the next live occurrence, as the existing reducer logic does. Removal IDs and staged edits for missing IDs are dropped.

---

## 12. Map display modes

Two modes: **Markører** (default) and **Miniatyrer**.

**Control.** `PhotoMapDisplayCard` replaces `PhotoPositionLegend` at the same bottom-right position (`bottom-20 right-4`). It becomes interactive (`pointer-events: auto`).

- Title: `«Bilder på kartet»`.
- A `role="radiogroup"` segmented control: [`CameraIcon` `Markører`] [`ImageSquareIcon` `Miniatyrer`].
  - Normally both segments show visible text, so they get no tooltip.
  - If narrow map widths collapse the segments to icon-only, each segment must switch to the icon-only treatment: tooltips `Vis som markører` / `Vis som miniatyrbilder`, with matching `aria-label`s and state via `aria-checked`.
- A compact legend: four source swatches, a direction-arrow sample `«Retning»`, the selected-ring sample, and `«Endret»` (dashed) in Edit mode.
- When thumbnails are hidden by zoom: `«Miniatyrer vises fra zoom {N}»`.

**Scope.** Workspace layer only. Outside the workspace (main app), FOTO layers always render markers with direction arrows. Thumbnails in the main map are deferred.

**Preference.** Persisted in `localStorage` under the key `gmi-photo-map-display`, as values `'markers' | 'thumbnails'`, read and written in try/catch through `usePhotoMapDisplayPreference`. This is a non-sensitive presentation preference with clear precedent (`ThemeSwitcher` theme, `WmsLayerModal` URL). It contains no photo data, so the session-only privacy model is untouched.

### Marker mode

The current camera glyph and source fills stay unchanged. Changes:

- the direction arrow is always visible (section 14)
- the selection ring stays as is
- the sibling dashed ring is new
- the staged state is new (section 14)

---

## 13. Thumbnail mode

### Icon

A `thumbnailMarkerOptions` builder in `photoMarkerPresentation.mjs` (pure, testable):

```
className: 'photo-thumb-marker' + modifiers, iconSize: [44, 44], iconAnchor: [22, 22]
html: <div class="photo-thumb" data-position-source="{kind}" style="--photo-source:{color}">
        <img src="{thumbnailUrl}" alt="" decoding="async" draggable="false">   // or camera fallback
      </div>
      <svg class="photo-direction-indicator" …>  // overflow, pointer-events:none (section 14)
      {stackCount > 1 && <span class="photo-thumb-stack">{n}</span>}
```

- **Size.** 44 px box, 2 px border, `object-fit: cover`. That is inside the requested 40–50 px and roughly 1.5× the 30 px camera hit box.
- **Provenance.** A 2 px solid border in `--photo-source`, using the same palette. Unknown or unplaced-but-staged uses neutral `#64748b`.
- **Selected.** An outer ring via `box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--gmi-navy)` (`#0F172B`). It sits *outside* the border, so provenance stays visible.
- **Sibling.** An outer dashed neutral outline.
- **Staged.** A small corner dot in `--gmi-interactive` (`#007595`) plus a dashed arrow.
- **Fallback.** While a thumbnail is pending, failed or unsupported, show a neutral square with the camera glyph inside the source border. No original-file decode.
- **Anchor.** Centred on the accepted or staged position, the same as marker mode. The direction arrow therefore originates at the camera position. In Edit mode the selected photo also shows a 4 px centre dot so the exact point is visible.
- **Hit area.** The 44×44 box only. Arrow and badges are `pointer-events: none` overflow content.
- **Thumbnail decode.** Reuse `preview.thumbnailUrl` (320 px max edge, session-owned). Never call `URL.createObjectURL` on the map.

### Density rule (simplest robust v1, agreed R5)

Thumbnails render at zoom ≥ `PHOTO_THUMBNAIL_MIN_ZOOM = 16`. This is the agreed initial value, defined as a single named constant so acceptance testing can tune it without other changes. Below that zoom the mode falls back to markers and the display card says `«Miniatyrer vises fra zoom 16»`. This keeps 100+ photo layers readable without a clustering engine. The overlap behaviour below applies at every zoom.

### Overlap and identical coordinates

- **Z-order.** Selected (`zIndexOffset` 1000) above staged (500) above others (list order). On hover, imperatively call `marker.setZIndexOffset(800)` and restore it on mouseout. No React state.
- **Identical effective coordinates.** Exact lat/lon equality groups occurrences. Only the top member renders the stack badge `{n}`. Clicking the stack when a member is already active selects the next member, cycling. The list remains the authoritative way to pick a specific occurrence.
- **No clustering or offsetting in v1.** A clustering engine is explicitly deferred (section 32).

### Hover full-photo reveal

- Bound only when `matchMedia('(hover: hover) and (pointer: fine)')` matches. It is an enhancement, never required.
- Uses a Leaflet `Tooltip` bound to thumbnail markers: `direction: 'top'`, `offset: [0, -26]`, `className: 'photo-thumb-preview'`, `opacity: 1`, non-interactive. Content: the same `thumbnailUrl` with `object-fit: contain` in a box of max 220×220, plus the filename caption.
- Leaflet tooltips live in `tooltipPane` (z 650), above photo panes (620/640) and below popups (700). They are non-interactive, so they never block map gestures and never reflow the marker.
- Opening delay is about 250 ms, using an imperative `mouseover` timer and `openTooltip`. Close on `mouseout`.
- Suppressed during drag, rotation and placement capture. The existing placement CSS already hides the tooltip pane.
- Keyboard focus opens the same tooltip. Leaflet 1.9 binds focus for keyboard-enabled markers; verify, and if not, add `focus`/`blur` handlers.
- **Equivalent for touch and non-hover devices.** A tap selects the photo, and the inspector shows the full image (plus `Vis stort`). No extra interaction is needed.
- **Accessible name.** In thumbnail mode the native `title` would duplicate the preview, so drop it and set `aria-label` on the icon element in the marker's `add` handler. Marker mode keeps `title`/`alt` as today.

---

## 14. Direction visualization

**Rule: if `direction.current` (or a staged direction) exists, the arrow is drawn in every mode** (marker, thumbnail, Edit), for selected and unselected photos, inside and outside the workspace.

- **Builder change.** `cameraMarkerOptions` currently sets `heading = selected ? normalize(degrees) : null`. It becomes `heading = normalize(degrees)`. Thumbnails use the same arrow SVG with a larger start radius.
- **Geometry.**
  - Marker mode: the existing 64×64 SVG, shaft from radius 14 to 29.
  - Thumbnail mode: shaft from radius 26 (outside the 22 px half-box plus border) to radius 46, arrowhead at the tip.
  - Rotation happens inside the SVG around the anchor (existing technique). 0° = up = geographic north, clockwise. That matches `photoDirection.mjs` and the export assumption.
- **Colour.** Accepted arrows change from `#075e9a` to **navy `#0F172B` with a 5 px white halo**. That is distinct from all five source colours, from the interactive teal of edit handles, and from the white/navy selection ring (which is a circle, not a shaft).
- **Staged arrows** keep the same navy with a **dashed** shaft (`stroke-dasharray`). Status is carried by pattern, not hue, which avoids the current orange/manual-orange collision. The old orange proposal colour `#a34c00` is retired.
- **Unknown direction.** No arrow. Never an implicit north.
- **Z-order inside a marker** (bottom to top): halo → arrow → camera glyph or thumbnail → selection ring → stack badge. Edit handles live in a separate pane above (z 640).
- **Compass labels (agreed, R3).** `photoDirectionLabel` in `photoDirection.mjs` currently prints English cardinals (`N, NE, E, SE, S, SW, W, NW`). Change it to Norwegian: **`N, NØ, Ø, SØ, S, SV, V, NV`**. The rounding stays at 45° sectors, so `90` → `90° Ø` and `225` → `225° SV`.
  - Every user-facing direction text uses this function: inspector, list status line, rotation readout, knob `aria-valuetext`, export preparation.
  - The spoken `aria-valuetext` uses full words: `nord, nordøst, øst, sørøst, sør, sørvest, vest, nordvest`. Add them as a sibling export, `photoDirectionSpokenLabel`.
  - The existing explanatory copy `0° N · 90° E · 180° S · 270° W` lives in `PhotoDirectionControls.js`, which this plan deletes. Wherever the explanation reappears (Edit-mode hint, export preparation), write it as `0° N · 90° Ø · 180° S · 270° V`.
  - Only `tests/photoDirection.test.mjs` asserts these labels today; update it.

---

## 15. Edit mode user journey

1. Verktøy → `Rediger bilder`. If the layer is hidden, it is shown. The toast says `«Laget vises mens du redigerer»`. The visibility toggle is disabled.
2. The map gains a 2 px inset `--gmi-interactive` outline. The **edit command bar** appears top-centre (section 22). The left pane header shows a `«Redigerer»` pill. The list, filter and sort keep working, and the `Endret` filter becomes available.
3. The user selects a photo, from the list or the map. No confirmation is involved.
   - **Placed photo.** The marker or thumbnail becomes draggable, with cursor `grab` (`grabbing` while dragging). A **rotation knob** appears at the end of the direction arrow, or as a dashed ghost knob `«Legg til retning»` when no direction exists. The hint reads `«Dra bildet for å flytte. Dra håndtaket for å endre retning.»`
   - **Unplaced photo.** The map enters placement capture (crosshair). The hint reads `«Klikk i kartet for å plassere {filename}»`. One click stages the position, and the photo then behaves like a placed one.
4. Changes show immediately:
   - A moved photo shows at its new position with **manual provenance colour**, because that is what it will be after save.
   - A dashed connector runs from the saved position to the staged one (the existing connector style).
   - The staged dot appears. The arrow turns dashed if the direction changed.
   - The inspector shows the staged values with `«Lagret: …»`.
   - The command bar count updates.
5. The user selects other photos and continues. Nothing is confirmed per photo.
6. Undo and redo are available throughout (section 17).
7. **`Lagre endringer`** commits every staged change atomically, exits Edit mode and shows the toast `«Endringer lagret for {n} bilder»`. **`Forkast endringer`** asks once (`«Forkaste endringer på {n} bilder?»` → [`Forkast`] [`Fortsett redigering`]), then exits with canonical state untouched. With zero changes the bar shows only `«Avslutt redigering»`.

In Edit mode, other FOTO layers' markers are rendered non-interactive (no popups). That prevents an accidental layer switch through `Åpne i bildemodul`. Gemini WFS reference inspection is already disabled during placement and direction edits (`MapInner.js:2190`) and stays disabled in Edit mode.

---

## 16. Edit transaction and domain architecture

### Decision

Split the work in three:

- **Canonical state** is never written until save. The edit session's guard lives in `photoSession`; it is a ticket plus baseline *identities* and carries no values.
- **Staged values and undo/redo** live in a **pure reducer module**, held at page level next to `photoWorkspaceReducer`. This mirrors the existing `photoWorkspaceState.mjs` pattern.
- **In-gesture pointer state** is local and imperative inside the map edit layer.

Why staged values do not belong in `photoSession`:

- `capturePhotoExportSnapshot`, readiness, rechecks and the source wizard all read the session. Keeping staged values out makes it **structurally impossible** for export or readiness to see uncommitted coordinates.
- `Forkast` becomes trivially exact. There is nothing to roll back, because nothing was written: *"Cancel restores the entire layer to exactly the state it had when Edit mode began"* holds by construction.
- It keeps `photoSession`'s published snapshot free of high-frequency UI churn.

Why the reducer is not inside a React component: it must be pure, node-testable, and readable by the list (filter `Endret`), map, inspector and command bar from one place without duplicating canonical data. It stores **deltas keyed by occurrence ID**, not copies of photos.

### `photoSession` additions

```
beginPhotoEdits(layerId) → ticket | null
  // null if layer missing or empty.
  ticket = Object.freeze({
    id, layerId, generation,
    baseline: Object.freeze({ [photoId]: Object.freeze({ current: record.spatial.current,      // identity
                                                          direction: record.direction.current }) }) // identity
  })
  editSessions.set(layerId, ticket); editVersion++   // a new session for the same layer supersedes the old

photoEditsAreLive(ticket) → boolean
  // ticket.generation === generation && editSessions.get(ticket.layerId) === ticket && layers.has(ticket.layerId)

applyPhotoEdits(ticket, changes) → { ok: true, changedIds } | { ok: false, error, staleIds? }
  // changes: [{ photoId, position?: { crs:'EPSG:4326', longitude, latitude }, degrees?: integer }]
  // 1. !photoEditsAreLive → { ok:false, error:'session-ended' }
  // 2. Validate EVERY change before ANY write:
  //    - photoId in ticket.baseline and in layer.photoIds           else staleIds
  //    - records.get(id).spatial.current === baseline.current        else staleIds   (identity, like manual tickets)
  //    - records.get(id).direction.current === baseline.direction    else staleIds
  //    - position → isPhotoPosition; degrees → normalizePhotoDirection(d) !== null   else 'invalid-change'
  //    - any staleIds → { ok:false, error:'edit-conflict', staleIds }  (nothing written)
  // 3. acceptedAt = Date.now(); for each change:
  //    updateRecord(id, live => ({ ...(position && { spatial: acceptManualPhotoPosition(live.spatial, position, acceptedAt) }),
  //                               ...(degrees != null && { direction: acceptManualPhotoDirection(degrees, acceptedAt) }) }))
  // 4. editSessions.delete(layerId); publish() once.

endPhotoEdits(ticket) → void   // discard or exit; deletes the registration only if it matches; no writes, no publish needed
```

Further session changes:

- `clear()` and `deleteLayer(id)` delete the matching `editSessions` entries. `clear()` already bumps `generation`.
- Existing helpers are reused unchanged: `acceptManualPhotoPosition` (basis `manual`, keeps candidates and evidence) and `acceptManualPhotoDirection` (rounded integer, basis `manual`).
- **Remove** `beginManualPlacement`, `manualPlacementIsLive`, `cancelManualPlacement`, `applyManualPlacement`, `beginDirectionEdit`, `directionEditIsLive`, `cancelDirectionEdit`, `applyDirectionEdit`, `manualTickets`, `directionTickets` and `manualVisibilityVersions` once their tests are migrated. `editVersion` stays only if still needed for session supersession.
- **No domain lock** is placed on other mutations while a session exists. The UI boundary (section 19) prevents conflicting operations, and the commit-time identity check *detects* any conflict that slips through. Nothing is ever silently overwritten. A lock would add deadlock risk if the UI failed to end a session.
- **Visibility is deliberately not part of liveness.** The old tickets died on a visibility toggle because the editor relied on the visible layer. Edit mode forces the layer visible and disables the toggle. Liveness rests on generation, registration and per-occurrence identity, which is at least as strict for data integrity.
- Late EXIF or thumbnail completion does not break edits. `updateAsset` may replace `record.spatial` but preserves `spatial.current` identity (`photoSession.mjs:101–103`). Capture-metadata writes never touch `spatial` or `direction`.

### `src/lib/photos/photoEditSession.mjs` (new, pure)

```
createPhotoEditState(ticket) → { ticketId, layerId, baseline, staged: {}, past: [], future: [] }
  // baseline: { [photoId]: { position: current?.position ?? null, degrees: direction?.degrees ?? null } }  (values for comparison)

photoEditReducer(state, action)
  'stage'    { photoId, field: 'position'|'direction', value, coalesceKey? }
             → before = effective(field); if equal(before, value) no-op
             → staged[photoId][field] = value, or delete it when equal to baseline
             → push { photoId, field, before, after: value, coalesceKey, at } (merge with the top entry when
               coalesceKey matches and less than 1000 ms elapsed); clear future; cap past at 200
  'undo'     → pop past; set field back to entry.before (delete if equal to baseline); push to future
  'redo'     → pop future; reapply entry.after; push to past
  'reconcile' { livePhotoIds } → drop staged and history entries for missing IDs
  'drop'     { photoIds } → same, explicit (used after an edit-conflict)

selectors
  effectiveCurrent(photo, state)   → staged position ? { position, basis:{kind:'manual'}, acceptance:'staged' } : photo.spatial.current
  effectiveDirection(photo, state) → staged degrees ? { degrees, basis:{kind:'manual'}, acceptance:'staged' } : photo.direction.current
  effectivePhoto(photo, state)     → frozen shallow overlay used by map, list, inspector and filters
  changedPhotoIds(state)           → Object.keys(staged)
  photoEditChanges(state)          → [{ photoId, position?, degrees? }] for applyPhotoEdits
  canUndo(state) / canRedo(state)
```

The `acceptance: 'staged'` overlay lets the presentation code (`photoPositionSourceKind` → `manual`, dashed arrow, staged dot) work without a second photo model.

### Where state lives

| Data | Home |
|---|---|
| Original accepted position/direction | Canonical records. The ticket holds identities; the reducer holds comparison values |
| Staged position/direction | `photoEditReducer.staged` |
| Changed occurrence IDs | Derived (`changedPhotoIds`) |
| Undo/redo history | `photoEditReducer.past` / `future` |
| In-gesture preview (drag latlng, rotating heading) | Edit layer refs and local state. Only the final value is dispatched |

### Failure behaviour

| Event | Behaviour |
|---|---|
| Stale layer/session (`clear`, generation change) | `photoEditsAreLive` false. The page effect resets the edit reducer and exits the mode; toast `«Redigeringen ble avsluttet fordi fotolaget ble endret.»` |
| Photo removed while editing | Removal tool is gated by the boundary. Defensively, `reconcile` drops its staged entries; toast `«{n} endringer ble fjernet fordi bildet ikke lenger finnes.»` |
| Source removed | Source wizard is gated. Detaching a source never changes `current` or `direction`, so no conflict |
| Commit `edit-conflict` | Nothing written. Dialog: `«{k} bilder er endret et annet sted siden du begynte.»` → [`Lagre de øvrige {n−k}`] (dispatch `drop` for `staleIds`, then retry) / [`Fortsett redigering`] |
| Switch FOTO layer | Only possible after leaving the workspace; guarded anyway (section 19) |
| Close workspace / back to app | Boundary |
| Reset app | Not reachable inside the workspace (toolbar hidden, sidebar replaced). If invoked, `photoSession.clear()` kills the ticket and the page resets the reducer. Reset is an explicit global destructive action |
| Export while editing | Boundary. Export can never read staged values (by construction) |
| Layer deleted | Only from `PhotoLayerCard`, not visible in the workspace. Defensively, reconcile exits |

---

## 17. Undo/redo model

- One history entry per **completed gesture**: dragend, rotation pointerup, click-to-place, or a numeric direction entry committed on Enter/blur.
- Keyboard nudges coalesce: consecutive arrow presses on the same occurrence and field within 1 s merge into one entry (`coalesceKey = photoId:field:keyboard`).
- **Selection changes are not history.** Undo and redo select the affected occurrence, call `panIntoView` if it is off-screen, and announce via `aria-live` `«Angret flytting av {filename}»` / `«Gjorde om retning for {filename}»`.
- A new stage after an undo clears the redo stack.
- An entry whose result equals baseline removes the staged key, so changed counts stay truthful.
- History is capped at 200 entries and lives only for the session. **No undo after save**; saving is the explicit commit boundary. Earlier accepted values remain reconstructible only through evidence and candidates, as today.
- Command-bar buttons. These are **icon-only** (`PhotoIconButton`) to keep the bar narrow at 1280 px:
  - `ArrowUUpLeftIcon`: tooltip and `aria-label` `Angre`, `aria-keyshortcuts="Control+Z"`
  - `ArrowUUpRightIcon`: tooltip and `aria-label` `Gjør om`, `aria-keyshortcuts="Control+Shift+Z Control+Y"`
  - With an empty stack they use `aria-disabled` and stay focusable, so the tooltip still explains them: `Angre – ingen endringer å angre` / `Gjør om – ingenting å gjøre om`.
  - `Forkast endringer`, `Lagre endringer` and `Avslutt redigering` carry visible text and get no tooltip.
  - Do not use `ArrowCounterClockwiseIcon`, which already means "reset" in V2.

---

## 18. Move and rotation interaction

### Move

- **Affordance.** In Edit mode only the **selected** placed photo is draggable, via react-leaflet `Marker draggable`. Dragging the marker or thumbnail itself is the handle; there is no separate move handle (fewer targets, and Leaflet already resolves map pan versus marker drag). First click selects, then drag moves. Unselected photos cannot be dragged accidentally.
- **Cursor.** `grab` on the selected marker, `grabbing` while dragging (`.leaflet-drag-target`, as in the existing CSS), `pointer` on other photos, default on the map.
- **Pan conflict.** A pointerdown on the draggable marker starts a marker drag. Anywhere else pans the map. The existing 3 px threshold (`PhotoManualPlacementLayer.js:28–29`) is reused for click-to-place, so a pan never places.
- **Touch.** Leaflet marker drag supports touch. One-finger drag on the selected photo moves it; elsewhere pans; pinch zooms.
- **Live feedback.** Leaflet moves the icon (including its arrow) during the drag. The edit layer listens to `drag` to move the rotation knob and connector. `dragend` dispatches `stage('position')`. The inspector updates on gesture end only, so there are no per-pixel React renders. The command bar shows the live distance `«Flyttes ca. 3,2 m»` from local state.
- **Critical constraint.** Do not change the dragging marker's `icon`, `position` or `key` props during a gesture. React re-rendering a new icon calls `setIcon`, which replaces the DOM element and aborts Leaflet's drag. Freeze the dragged marker's props from `dragstart` until `dragend`.
- **Esc during drag.** Set a cancelled flag and restore with `setLatLng(preGesture)`. Ignore the `dragend` value. To end the drag early, Leaflet's `marker.dragging.disable()` / `enable()` finishes an active `Draggable`; verify on 1.9.4.
- **Snapping.** None. Snapping to GMI objects or the survey has no current product requirement and is deferred.
- **Non-drag alternatives:**
  1. The focused selected marker accepts arrow keys: 5 px, or 50 px with Shift. This is the existing `PhotoManualPlacementLayer` pattern.
  2. The command bar's contextual button `CrosshairIcon` `«Flytt til kartsenter»` (or `«Plasser i kartsenter»` when unplaced): pan the map to the target, press the button.
  3. Enter on the focused map container places an unplaced photo at the map centre (existing behaviour).

### Rotation

- **Affordance.** A separate `L.Marker` in the edit pane (z 640): a 16 px white knob with a 2 px `--gmi-interactive` stroke and a 40 px transparent hit area. It sits **56 px** from the anchor in screen space along the heading (`map.unproject(map.project(anchor).add([56·sin θ, −56·cos θ]))`), recomputed on `zoom`, `move` and marker `drag`.
- **Gesture.** Custom pointer handling, not Leaflet `draggable`:
  - pointerdown → `stopPropagation`, `map.dragging.disable()`, `setPointerCapture`
  - pointermove → `θ = normalizePhotoDirection(atan2(dx, −dy) · 180/π)`, using container points relative to the anchor; update the knob position and a live arrow in the edit-layer SVG from local state
  - pointerup → dispatch `stage('direction')`, re-enable dragging
  - Esc → restore the pre-gesture heading
- **North reference.** The map is north-up Web Mercator, so screen-up is geographic north along the meridian, matching the accepted convention (clockwise from geographic north, 0° = N).
- **Normalization.** Integer degrees 0–359, as today's interactive editor does. Bulk manual fill keeps exact fractional values (unchanged, `mode: 'bulk'`).
- **Live readout.** A small label beside the knob: `«123° SØ»` (`photoDirectionLabel`).
- **No existing direction.**
  - A **dashed ghost knob** sits at 56 px north of the anchor, labelled `«Legg til retning»`, with no arrow drawn. Unknown is never displayed as north.
  - Dragging the ghost creates the direction from the pointer angle.
  - Keyboard: Enter on the ghost does nothing by itself. Arrow keys require an explicit value, so the first arrow press after focusing the ghost announces `«Angi retning med piltastene eller i feltet Retning»`, and the numeric field (below) is the explicit creation path.
- **Keyboard on the knob.** `role="slider"`, `aria-valuemin=0`, `aria-valuemax=359`, `aria-valuenow`, `aria-valuetext="123 grader, sørøst"` (from `photoDirectionSpokenLabel`, R3), `aria-label="Retning for {filename}"`. Arrow keys ±1°, Shift+Arrow or PageUp/PageDown ±15°.
- **Tooltip on the knob.** The knob is an icon-only control, so it follows R1. Tooltip `Endre retning` (ghost knob: `Legg til retning`), shown on hover and on keyboard focus, using the same tooltip component in the edit pane. While a rotation gesture is active, the tooltip is hidden and the live readout (`123° SØ`) takes its place.
- **Numeric alternative.** The command bar's contextual row has `«Retning»` `[ 123 ]°` (number input, 0–359). It stages on Enter or blur, and an empty value is ignored. This is the robust non-drag path, including for creating a direction.
- **Domain rule preserved.** Direction is **occurrence-level**: staging keys on the occurrence ID, and siblings are unaffected. Capture metadata stays asset-level and is not touched by Edit mode.

---

## 19. Unsaved-change boundaries

**One policy.** Any action that leaves Edit mode, or opens a tool that reads or changes photo data, calls `requestWorkspaceAction(action)` in `page.js`.

- If the edit reducer has **0 changes**, Edit mode ends silently and the action proceeds.
- If it has **>0 changes**, `PhotoEditBoundaryDialog` opens (native `<dialog>`):

  > **Du har ulagrede endringer på {n} bilder**
  > [`Lagre endringer`] (primary) · [`Forkast endringer`] · [`Fortsett redigering`] (Esc / default focus)

  After Save or Discard the requested action continues automatically. If Save fails with a conflict, the conflict dialog from section 16 replaces this one and the action does not continue.

Per-photo confirmation never happens.

| Trigger | Boundary? |
|---|---|
| `Avslutt redigering` / Esc with no gesture | Yes (0 changes → exit) |
| Back (`Tilbake til appen`) | Yes |
| Any Verktøy item (`Legg til bilder`, `Koble og posisjoner bilder`, `Kilder og koblinger`, `Klargjør for eksport`, `Eksporter`, `Fjern bilder fra laget`) | Yes |
| `ProductHeader` → `Bilder` (new FOTO import) | Yes. `openPhotos` currently calls `cancelPhotoEditing`; replace that with the gate |
| `Rediger opptaksdata…` in the inspector | Yes (consistent: every data dialog is a boundary) |
| Switching FOTO layer (`openPhotoLayer` with a different id) | Yes. Not normally reachable, because other layers are non-interactive in Edit mode |
| `Vis stort` image viewer, app info/contact, Gemini WFS dialog, WMS dialog | No. Read-only or unrelated to photo data |
| Selecting another photo, filter, sort, display mode, map pan/zoom | No |
| Reset app / `photoSession.clear()` | Not reachable in the workspace. If it happens, edits are lost with the whole session (explicit global reset) |
| Browser reload/close | No `beforeunload` guard. The whole photo session is session-only and lost on reload today, and the app has no unload guard. Recorded as an explicit decision (section 32) |

---

## 20. Export-preparation user journey (pass 2)

`Klargjør for eksport…` → `PhotoExportPreparationDialog` (native `<dialog>`, `min(960px, 100vw − 32px)` × `min(760px, 100dvh − 32px)`, internal scroll, sticky footer).

1. **Profile.** If no profile has been chosen for this layer in the session, show three radio cards. The descriptions are derived from the requirement table (section 3):
   - `Gemini VA · Skråfoto 2019 (eksperimentell)`: `«Krever retning for plasserte bilder. Opptakstid anbefales. EPSG:5972.»`
   - `Legacy Skråfoto 2019`: `«Krever opptakstid med sekunder og retning. Fotograf tas med hvis oppgitt.»`
   - `Norsk Vann AsBuilt 5.2`: `«Krever opptakstid med sekunder og eksportkontekst. Retning tas med hvis oppgitt.»`

   The profile chip in the header (`«Legacy Skråfoto 2019 · Bytt»`) lets the user change it later.
2. **Summary**, exception-oriented:
   - Headline: `«36 av 40 plasserte bilder er klare»`. Use `plasseringer` instead of `bilder` when repeats exist, following the wizard's `selectionUnit` rule.
   - Below it: `«4 trenger opplysninger før eksport»` (required) · `«6 kan forbedres»` (recommended/optional) · `«3 uplasserte bilder blir ikke med»`.
   - A **task list** of non-empty groups only, ordered Påkrevd → Anbefalt → Valgfritt → Ikke med. Each group shows its count and a `«Løs»` / `«Se»` button.
   - Groups with nothing outstanding collapse into `«Ferdig ({n})»`.
3. **Task panel**, one group at a time, with a `«Tilbake til oversikt»` button. See section 22.
4. Readiness recomputes **live** from canonical state after every write (pure selector). The summary updates.
5. **Footer.** `«Gå til eksport»` (primary) is enabled only when the required count is 0. It closes the dialog and opens `Eksporter` with the shared configuration. When blockers remain, the footer reads `«Løs påkrevde mangler for å eksportere»` + `«Lukk»`. This is truthful: the current plan blocks the whole package on any error.

Technical detail (raw codes, counts by asset versus occurrence) sits under a `«Tekniske detaljer»` disclosure in the summary.

---

## 21. Export readiness and domain reuse (pass 2)

### `src/lib/photos/export/photoExportReadiness.mjs` (new, pure)

```
PHOTO_EXPORT_REQUIREMENTS = {
  legacy2019:          { direction: 'required', captureTime: 'required',    photographer: 'optional', context: false },
  'gemini-legacy2019': { direction: 'required', captureTime: 'recommended', photographer: 'omitted',  context: false },
  asbuilt52:           { direction: 'optional', captureTime: 'required',    photographer: 'omitted',  context: true  },
}

photoExportReadiness(photos /* getLayerPhotos */, { profile, context }) → {
  placedOccurrences, excludedOccurrences,                       // mirrors photoExportPlan
  readyOccurrences, blockingOccurrences,
  groups: [
    { id: 'placement', level: 'excluded', occurrenceIds },                        // unplaced
    { id: 'direction', level, missing: occurrenceIds,
      evidence: planEvidenceAdoption(placed, 'direction', 'exif').counts },
    { id: 'captureTime', level, missing: assetIds, insufficientPrecision: assetIds, conflicting: assetIds,
      evidence: { exif: planEvidenceAdoption(…,'captureTime','exif').counts, gml: …('gml').counts } },
    { id: 'photographer', level, missing: assetIds, invalidXml: assetIds, evidence: … },   // omitted when level 'omitted'
    { id: 'context', level: 'required', issues: validateExportContext(context) },          // asbuilt52 only
  ],
}
```

Rules:

- **Scope.** Blocking groups consider **placed occurrences and their assets only**, exactly like `buildPhotoExportPlan`. Unplaced occurrences form a separate "Ikke med" group. This fixes the audit's count mismatch (whole-layer counters including unplaced versus plan errors) without changing any rule.
- **Predicates reuse exported helpers.** `fullCaptureTime` (capture-time presence and precision), `isXmlText`, `validateExportContext` (from `exportContract.mjs`), `evidenceEligibility` / `planEvidenceAdoption` and `planManualPhotoFill`. Nothing is invented.
- **Do not refactor `photoExportPlan.mjs`.** Parity is enforced by test instead (section 29). That keeps the accepted Gemini plan, XML and ZIP path byte-for-byte untouched.
- **Shared configuration.** `{ profile, crs, context }` per FOTO layer in a page-level `Map(layerId → config)`, transient, cleared on `clear()` / layer deletion. Both `Klargjør for eksport` and `Eksporter` read and write it, so a profile or AsBuilt context entered once is reused.

### `Eksporter` (simplified `PhotoExportDialog`, pass 2)

- Profile is preselected from the shared config (still changeable). CRS appears when applicable. AsBuilt context is prefilled and editable (single source of truth).
- **Readiness line** from the same module:
  - `«Klar for eksport»`
  - `«Klar · {n} valgfrie opplysninger mangler»` (optional or recommended omissions are allowed)
  - `«{n} påkrevde mangler»` with `«Klargjør for eksport…»`, which switches dialogs
- `«Lag forhåndsvisning»` → existing plan (errors/warnings). Add human labels in `photoExportDiagnostics.mjs` for the warning codes that currently fall back to raw codes (`unplaced-excluded`, `associations-omitted`, `shared-attachments`, `experimental-mapping`, `direction-assumption`, `path-convention`, `experimental-2d`, `compatibility-*`, `invalid-xml-text`, `no-placed-photos`, `stale-plan`). These are label strings only.
- `«Last ned pakke»` → existing `buildPhotoExportPackage`. The same `isLive` and stale guards apply.
- **Behaviour:**
  - Ready layer → download enabled after preview.
  - Optional omissions only → warnings, download enabled.
  - Missing required → errors, download disabled (existing).
  - No profile → preview disabled (existing).
- **Remove `PhotoEvidenceActions`** from this dialog.
- **Unchanged:** `buildPhotoExportPlan`, `buildPhotoExportPackage`, `photoExportXml.mjs`, `photoExportPackage.mjs`, `attachmentNames.mjs`, the package filename, the GUID strategy and paths. Gate: `git diff --stat` on these four files must be empty after both passes.
- **Gemini verification copy (agreed, R4).** The dialog says `«Gemini-kompatibilitet er ikke verifisert for noen av profilene»`, and the success message says `«Importresultat er ikke verifisert»`. Both are outdated for `gemini-legacy2019`, because packages from the production app have been imported into Gemini VA/GeoFoto successfully. Replace them, as **copy-only changes**, in pass 2:
  - Gemini profile description: `«Testet med vellykket import i Gemini VA/GeoFoto. Profilen er eksperimentell og ikke sertifisert; kontroller resultatet etter import.»`
  - Legacy and AsBuilt: `«Ikke testet med import i Gemini.»`
  - Gemini download success: `«ZIP-pakken er klar. Pakk ut og importer photos.gml med Attachments-mappen ved siden av. Kontroller resultatet i Gemini.»`
  - The copy must not imply certification, guaranteed compatibility, or validation of other profiles. The `experimental-mapping` warning text and all serialization stay unchanged.

---

## 22. Metadata completion UX

### Task panels inside `Klargjør for eksport` (pass 2)

Every panel follows the same pattern: **evidence first → remaining exceptions list → apply to selected → per-photo detail**.

- **Exceptions list.** Thumbnail, filename, occurrence context and missing chips. Each row has a checkbox; all are checked by default. The selection is local to the dialog.
- **Opptakstid**
  1. `«EXIF-tid finnes for {k} av {n} bilder»` → `«Bruk EXIF-tid for {k} bilder»`. Uses `adoptSourceEvidence(layerId, 'captureTime', 'exif', placedIds)`: missing-only, explicit, conflict-aware (unchanged semantics). The GML equivalent appears only when `counts.eligible > 0`. Inapplicable sources are hidden, not shown disabled with `(0)`.
  2. **Conflicts** (`conflicting`) are listed individually. Each row's `«Velg verdi…»` opens `PhotoCaptureMetadataDialog` with the radio choice of evidence values. No bulk resolution of conflicts.
  3. **Missing.** `PhotoCaptureTimeField` (section 28 of the brief, below) → `«Bruk på {m} valgte bilder»`. Calls `fillMissingPhotoValues(layerId, 'captureTime', iso, selectedOccurrenceIds)`, which is missing-only.
  4. **Insufficient precision** (accepted value without seconds). Listed separately as `«Har tid uten sekunder»`. The field prefills from the accepted value, and applying calls `setCaptureMetadata(layerId, selectedIds, 'captureTime', iso)`. That is an explicit **replacement**, and the panel says `«Erstatter godtatt verdi»`.
  5. Gemini profile: the group is labelled `Anbefalt` and states `«Blokkerer ikke Gemini-eksport»`.
- **Retning** (required for Legacy and Gemini, optional for AsBuilt)
  1. `«Bruk EXIF-retning for {k} plasseringer»` → `adoptSourceEvidence(…, 'direction', 'exif', …)`. When `repeatedApplications > 0`, show the existing shared-observation caution once.
  2. **`«Angi retning på kartet»`** (primary for the remainder). Closes the dialog and enters Edit mode with filter `Mangler retning` and the first missing occurrence selected. On save, readiness updates and the toast offers `«Tilbake til Klargjør for eksport»`.
  3. A `«Samme retning for alle valgte»` disclosure (de-emphasized) → number input → `fillMissingPhotoValues(…, 'direction', …)`. Keeps the existing explicit-zero copy (`«0° betyr godtatt nord»`).
- **Fotograf** (optional for Legacy; hidden as `«Eksporteres ikke i denne profilen»` for Gemini and AsBuilt)
  1. EXIF Artist adoption when eligible.
  2. Text input with a `<datalist>` of accepted and EXIF photographer values already in the layer → `«Bruk på {m} valgte bilder»` (`fillMissingPhotoValues`, missing-only).
  3. Invalid XML values (Legacy, blocking) are listed individually → metadata dialog.
- **Eksportkontekst** (AsBuilt). The seven fields as a form, with the existing labels and code lists. Values are written to the shared config, not to photos.
- **Posisjon / Ikke med.** Lists unplaced occurrences with `«Plasser i Rediger bilder»` (→ Edit mode, filter `Uplassert`) and `«Koble og posisjoner bilder…»` (→ wizard).

No source is adopted automatically. Every adoption is an explicit, counted user action using the existing missing-only policies.

### `PhotoCaptureMetadataDialog` (pass 1, reused in pass 2)

Scoped to one asset, opened from the inspector or a conflict row.

- Shows the current accepted value with its provenance.
- **Opptakstid**: radio options for each usable evidence value (`«EXIF: 12.05.2026 14:33:02»`, `«GML: …»`) plus `«Annen verdi»`, which reveals `PhotoCaptureTimeField`.
- **Fotograf**: the same pattern with a text input.
- **`Lagre`** writes via `setCaptureMetadata` (`evidenceId` for evidence, input for manual). This is a canonical, explicit replacement and is not part of the Edit session.
- **`«Fjern godtatt opptakstid»`** is a secondary destructive link, `setCaptureMetadata(…, null)`, with a consequence line (`«Kan blokkere eksport for Legacy og AsBuilt»`).
- Footer copy: `«Gjelder alle {n} plasseringer av bildet»`.

### Manual value entry: `PhotoCaptureTimeField` (pass 1)

- **Date:** `<input type="date">`. **Time:** `<input type="time" step="1">` (seconds). Both are native, localized and accessible.
- **Timezone:** `<select>` with options
  - `«Ukjent tidssone»` (**default**, no offset)
  - `«UTC (Z)»`
  - `«+01:00 (norsk normaltid)»`
  - `«+02:00 (norsk sommertid)»`
  - `«Annen forskyvning…»`, which reveals a `±HH:MM` text field validated by `normalizeCaptureTime`

  Never default to anything but Unknown. Prefill the offset only from evidence (`OffsetTimeOriginal`) or the existing accepted value.
- Composes `YYYY-MM-DD[THH:MM:SS][offset]` and validates with `normalizeCaptureTime` (calendar validation without the host timezone, as today).
- A precision helper line: `«Uten klokkeslett lagres bare dato. Legacy og AsBuilt krever sekunder.»`. A time without seconds is not possible with `step=1`.
- This replaces the raw ISO text inputs in `PhotoMetadataEditor` (pass 1) and `PhotoManualFillActions` (deleted in pass 2).

---

## 23. State architecture

| State | Owner | Kind | Notes |
|---|---|---|---|
| Assets, records (occurrences), layers, sources, accepted position/direction/metadata, evidence | `photoSession` | canonical | Unchanged model |
| Edit session ticket + baseline identities | `photoSession.editSessions` | canonical guard | No staged values |
| Staged edits, undo/redo | `useReducer(photoEditReducer)` in `page.js` | transient domain staging | Pure module `photoEditSession.mjs` |
| In-gesture pointer, preview heading/latlng, pre-gesture value | `PhotoEditLayer` refs/local state | transient UI | Dispatches only at gesture end |
| `layerId`, `photoIds`, `activePhotoId`, `mode` (`browse`/`edit`/`remove`), `removalIds`, `filter`, `sort` | `photoWorkspaceReducer` (extended) in `page.js` | transient UI | At page level because list, map and inspector all read it |
| Map display mode | `usePhotoMapDisplayPreference` (`localStorage`) | persisted preference | try/catch, default `markers` |
| Open dialog: `info` / `metadata` / `export-prep` / `export` / `remove-confirm` | single `photoDialog` state in `page.js` | transient UI | Replaces `exportOpen` local to the collection. `photoImport` and `photoSourceWorkflow` stay as they are (they carry context) |
| Pending boundary action | `pendingWorkspaceAction` in `page.js` | transient UI | Consumed after Save or Discard |
| Export configuration | `Map(layerId → { profile, crs, context })` in `page.js` | transient session | Shared by prep and Eksporter (pass 2) |
| Readiness | `photoExportReadiness(photos, config)` | **derived selector** | Never stored |
| Effective photos | `effectivePhoto(photo, editState)` | **derived selector** | Map, list, inspector, filters |
| Visible list (filtered, sorted, pinned) | `photoWorkspaceView(photos, workspace, editState)` | **derived selector** | New `photoWorkspaceView.mjs` |
| Toast | `photoNotice` in `page.js` | transient UI | Replaces `importNotice` |
| Hover preview | Leaflet tooltip | imperative | No React state |

**Memoization caution.** The React compiler is active, and the import-wizard implementation hit stale caching (`…-1033-…implementation.md` §Session). Derived selectors that read `photoSession` must take the session snapshot (or `photoLayers`) identity as an explicit dependency. Do not call `photoSession.getLayerPhotos` inside memoized closures without that dependency.

---

## 24. Component and file architecture

### Stay unchanged

`PhotoImageViewer`, `PhotoLayerCard`, `PhotoMapPopup`, `PhotoPositioningWizard`, `PhotoGmiSummary`, `PhotoGmlSummary`, `PhotoOccurrenceContext` (still used by the popup and wizard), `PhotoCollectionPanel` default export (import gallery), the whole import wizard, `usePhotoSession`, `photoSpatial.mjs`, `photoDirection.mjs` (label decision aside), `photoEvidenceAdoption.mjs`, `photoManualFill.mjs`, `photoCaptureMetadata.mjs`, all export serializers.

### Change

| File | Change |
|---|---|
| `src/app/page.js` | Remove the manual/direction hooks and `cancelPhotoEditing`. Add the edit reducer, `requestWorkspaceAction` gate, `photoDialog`, `photoNotice`, export config (pass 2). Pass `effectivePhotos` and `editState` to the map and inspector. Make `openPhotos`, `addPhotosToLayer`, `openPhotoSources`, `exitPhotoWorkspace` and `openPhotoLayer` go through the gate |
| `PhotoWorkspaceCollection.js` | Rewrite: header, toolbar, filter panel, sort menu, list rows, removal mode. Drops source block, export dialog ownership, metadata batch |
| `photoWorkspaceState.mjs` | Extend: `mode`, `removalIds` (replacing `selectedIds`), `filter`, `sort`. `active` no longer implies cancel. New actions `mode`, `filter`, `sort`, `toggle-removal`, `select-removal` |
| `PhotoMarkersLayer.js` | Rewrite: consume a pre-built presentation list (no `getPhoto` per feature), marker/thumbnail modes, always-on arrows, sibling/staged states, stack badges, Edit-mode draggable selected marker, non-interactive other layers in Edit mode, hover tooltip in thumbnail mode |
| `photoMarkerPresentation.mjs` | Arrow always; navy arrow; dashed staged arrow; `thumbnailMarkerOptions`; sibling/staged modifiers; icon cache key helper |
| `photoMapFeatures.mjs` | `buildPhotoMapFeatures(layers, getLayerPhotos, { overrides, filter })`: effective positions for the edit layer, staged placements of previously unplaced photos, filter application with selected pinned |
| `PhotoMapController.js` | Add `panIntoView` requests (no zoom) |
| `MapInner.js` / `MapView.js` | Forward new props. Swap `PhotoPositionLegend` → `PhotoMapDisplayCard`. Mount `PhotoEditLayer` and `PhotoEditCommandBar` (command bar in `MapView`'s overlay layer, like the legend) |
| `photoSession.mjs` | Add the edit-session API. Remove manual/direction tickets and visibility versions |
| `photoWorkspace.css` | New header, toolbar, list and status styles. Widths (section 28). Thumbnail and stack CSS |
| `PhotoExportDialog.js` *(pass 2)* | Simplify (section 21) |
| `photoExportDiagnostics.mjs` *(pass 2)* | Labels only |

### Split or replace

| Old | New |
|---|---|
| `SelectedPhotoInspector` in `PhotoCollectionPanel.js` + `PhotoSpatialInspector.js` + `PhotoGmiInspector.js` + `PhotoMetadataEditor.js` (inspector part) | `PhotoWorkspaceInspector.js` (read-only sections; small internal section components are fine) |
| `PhotoMetadataEditor.js` forms | `PhotoCaptureMetadataDialog.js` + `PhotoCaptureTimeField.js` |
| `PhotoManualPlacementLayer.js` + `usePhotoManualPlacement.js` + `PhotoManualPlacementControls.js` | `PhotoEditLayer.js` (click-to-place capture moved from the old layer, rotation knob, connector, live arrow) |
| `PhotoDirectionControls.js` + `usePhotoDirectionEdit.js` | `PhotoEditLayer.js` rotation + `PhotoEditCommandBar.js` numeric field |
| `PhotoPositionLegend.js` | `PhotoMapDisplayCard.js` |
| `importNotice` banner | `PhotoWorkspaceToast.js` |
| `photoManualPlacement.css`, `photoDirection.css` | `photoEdit.css` |
| `PhotoEvidenceActions.js`, `PhotoManualFillActions.js` *(pass 2)* | Task panels inside `PhotoExportPreparationDialog.js` (reusing the same plan functions) |

### New modules (only where they create clear boundaries)

- Pass 1: `src/lib/photos/photoEditSession.mjs`, `src/lib/photos/photoWorkspaceView.mjs`, `PhotoWorkspaceToolsMenu.js`, `PhotoWorkspaceInspector.js`, `PhotoEditLayer.js`, `PhotoEditCommandBar.js`, `PhotoEditBoundaryDialog.js`, `PhotoSourcesInfoDialog.js`, `PhotoCaptureMetadataDialog.js`, `PhotoCaptureTimeField.js`, `PhotoMapDisplayCard.js`, `PhotoWorkspaceToast.js`, `usePhotoMapDisplayPreference.js`, `RemovePhotosConfirmation.js` (extracted), **`PhotoIconButton.js`** (icon-only button with a hover-and-focus tooltip, §27; used by every icon-only control in this plan).
- Pass 2: `src/lib/photos/export/photoExportReadiness.mjs`, `PhotoExportPreparationDialog.js`.

### `Kilder og koblinger` surface (`PhotoSourcesInfoDialog`)

A **modal dialog** (`min(760px, 100vw − 32px)`, internal scroll). The content is too long for a popover, and a drawer would cover the inspector or map that the user is checking against.

Read-only content:

- **Oversikt:** bilder / plasseringer; placed by source (EXIF, GMI, GML, Manuell); unplaced; EXIF GPS available / pending reads; directions known; capture times known.
- **Kilder:** one card per `spatialSources` entry with kind label (`«GMI – objektenes bildereferanser»` / `«GML – bildeposisjoner»`), filename, `importedAt`, loaded-GMI binding state, and an `«Detaljer»` disclosure reusing `PhotoGmiSummary` / `PhotoGmlSummary` (ledgers and source notes stay nested and collapsed).
- **Koblinger:** linked objects, repeated or shared photos, unresolved and ambiguous counts from the ledger summaries.
- **Footer:** `«Koble og posisjoner bilder…»` (opens the wizard through the gate) · `«Lukk»`.

There are no per-source recheck or remove buttons; the wizard's step 1 owns those.

A "needs recheck after append" indicator is **deferred**. Sources carry no append watermark today, so the indicator would have to be invented.

---

## 25. Obsolete controls and components to retire

Deleted outright, not hidden. Each item lists its replacement path.

- Inspector `Plasser på kartet` / `Flytt på kartet` / `Bruk plassering` / `Avbryt` → Edit mode.
- Inspector `Juster retning`, slider, ±1°, number, `Bruk retning`, `Avbryt` → Edit mode.
- Inspector `Bruk EXIF-retning for denne forekomsten` → whole-layer EXIF adoption (Eksporter in pass 1, Klargjør in pass 2).
- Inspector `Lagre`/`Nullstill opptakstid`, `Lagre`/`Nullstill fotograf`, `Bruk EXIF/GML som …` → `PhotoCaptureMetadataDialog`.
- Inspector `Kontroller kilder og posisjon` → Verktøy → `Koble og posisjoner bilder…`.
- Inspector `Zoom til EXIF/GML/GMI` text buttons → locate icons inside `Andre mulige posisjoner`.
- Left pane `Kilder og koblinger` block, per-source `Kontroller på nytt` → info dialog + wizard step 1.
- Left pane `Legg til bilder`, `Eksporter`, `Koble og posisjoner bilder` buttons → Verktøy.
- Left pane permanent `Velg alle viste` / `Fjern valg` / per-row checkboxes → removal mode only.
- Left pane `Opptaksmetadata for {n} unike bilder` (`PhotoMetadataBatch`) → Klargjør (pass 2).
- `importNotice` banner + `Lukk importmelding` → toast.
- `PhotoPositionLegend` static legend → display card.
- Session: `beginManualPlacement` … `applyDirectionEdit`, ticket WeakSets, `manualVisibilityVersions`.
- Files: `PhotoManualPlacementControls.js`, `PhotoManualPlacementLayer.js`, `usePhotoManualPlacement.js`, `PhotoDirectionControls.js`, `usePhotoDirectionEdit.js`, `PhotoSpatialInspector.js`, `PhotoGmiInspector.js`, `PhotoMetadataEditor.js`, `PhotoPositionLegend.js`, `photoManualPlacement.css`, `photoDirection.css`. The `SelectedPhotoInspector` export leaves `PhotoCollectionPanel.js`.
- Pass 2: `PhotoEvidenceActions.js`, `PhotoManualFillActions.js`, and the evidence block inside `PhotoExportDialog`.

### Grep gates

**After pass 1**, no live `src/` matches for:

- `Flytt på kartet`, `Plasser på kartet`, `Juster retning`, `Bruk retning`, `Bruk plassering`
- `Kontroller kilder og posisjon`, `Opptaksmetadata for`, `Lukk importmelding`, `Velg alle viste` (outside removal mode)
- `beginManualPlacement`, `beginDirectionEdit`, `usePhotoManualPlacement`, `usePhotoDirectionEdit`, `SelectedPhotoInspector`, `PhotoSpatialInspector`, `PhotoPositionLegend`

**After pass 2**: `PhotoEvidenceActions`, `PhotoManualFillActions`, `for alle mulige (`.

---

## 26. Performance considerations

- **O(n²) marker lookups.** Today `PhotoMarkersLayer` calls `photoSession.getPhoto` per feature, and `publicPhoto` scans layers and runs `gmiPhotoAssociations` each call. The fix: build a `Map(photoId → presentation)` **once per session snapshot** from the `getLayerPhotos` result that `page.js` already computes (`workspacePhotos`), plus one pass per other visible layer. Pass it to the marker layer.
- **Icon cache.** Memoize `L.divIcon` instances in a module-level `Map`. The key is `mode|source|selected|sibling|staged|degrees|thumbnailUrl|stackCount`, capped (for example 2000 entries, cleared on `clear()`). Today the selected-with-direction icon is rebuilt every render.
- **Per-marker memo.** Use a memoized per-marker component with primitive props, so a stage, undo or selection change re-renders only the affected markers.
- **Gesture isolation.** No React state updates per pointermove on the dragged marker. The rotation preview updates only the knob and live-arrow components through local state or rAF.
- **Thumbnails.** Reuse the session thumbnail URL (320 px JPEG). No full-resolution decode on the map. The hover preview uses the same URL, so it costs nothing extra. `<img decoding="async" draggable="false">`.
- **Object URL ownership.** The map never creates or revokes URLs. The session revokes on `release()`, and markers disappear in the same publish, so there is no stale-URL window. The inspector keeps its own original-file URL lifecycle (unchanged).
- **100+ photos.** The zoom threshold for thumbnails (section 13) bounds DOM image count at overview zooms. No list virtualization is needed: rows are about 56 px, and 150 rows is well within budget. Revisit only if acceptance on a 300+ layer shows jank.
- **Filtering on the map** reduces the marker count further.

---

## 27. Accessibility

### Icon-only control tooltips (required, R1)

**Definition.** An *icon-only interactive control* is a focusable control whose visible content inside the control is only an icon, with no visible text label. Every such control in the FOTO workspace, its map overlays, its toast and its new dialogs must meet all of the following:

1. **Accessible name.** A non-empty `aria-label` in Norwegian. It may be more specific than the tooltip, e.g. `Zoom til IMG_0042.jpg på kartet`.
2. **Visible tooltip.** A concise Norwegian tooltip, shown:
   - on **pointer hover**, after about 300 ms
   - **immediately on keyboard focus**, when focus is `:focus-visible`

   The tooltip hides on mouse leave (unless the pointer moves onto the tooltip), on blur, and on **Escape**. Escape dismisses only the tooltip and must not trigger other Escape behaviour in that same keypress (WCAG 1.4.13: dismissable, hoverable, persistent).
3. **No native `title` attribute** on these controls. It would duplicate the tooltip on hover and never appears on keyboard focus.
4. **Meaning never lives only in the tooltip.** The icon is a familiar Phosphor glyph, the `aria-label` carries the full name, and state is exposed through `aria-pressed` / `aria-expanded` / `aria-checked` and visible styling. The tooltip repeats, it does not add essential information.
5. **State-aware text.** Toggles name the action for the current state (`Skjul fotolag` vs `Vis fotolag`).
6. **Unavailable controls** use `aria-disabled="true"` instead of the `disabled` attribute. They stay focusable, so the tooltip can explain why (e.g. `Zoom til bildet – bildet er ikke plassert`). Their click handlers are no-ops.
7. **Announcement wiring.**
   - When the tooltip text equals the `aria-label`, render the tooltip with `aria-hidden="true"` (no role), so screen readers don't hear it twice.
   - When it differs (e.g. an unavailable reason), render it with `role="tooltip"` and connect it via `aria-describedby` while open.
8. **Placement and style.** Below the control by default. Flip above near the viewport bottom, and clamp horizontally inside the viewport. In map overlays, z-index sits above map controls (≥ 1300) and below dialogs. Styling matches the existing focus/hover tooltip in `ValidationV2FieldDetailContent.js` `ContextQualifier` (`bg-gmi-ink`, `rounded-lg`, `text-xs`, max width ~16rem). Use it as the visual and behavioural reference, but do not refactor it in this scope.
9. **Touch.** No hover tooltips on touch. A tap triggers the action, and the `aria-label` covers assistive technology.

**Implementation.** One shared component, `src/components/photos/PhotoIconButton.js`:

```
props: { icon, label, tooltip = label, onClick, pressed?, expanded?, controls?, unavailableReason?, keyshortcuts?, ...rest }
```

It renders `data-icon-tooltip="{tooltip}"` on the button, for tests. The rotation knob in the edit pane (a Leaflet marker, not a `<button>`) reuses the tooltip part through a small `usePhotoIconTooltip` hook or an exported `PhotoIconTooltip` element, with identical behaviour.

**Not applied to** controls with visible text next to or inside them:

- the `Verktøy` trigger and all `Verktøy` menu items
- `Lagre endringer`, `Forkast endringer`, `Avslutt redigering`, `Flytt til kartsenter`
- `Rediger opptaksdata…`
- the text segments of the display toggle
- filter radios and checkboxes
- dialog footer buttons
- removal-mode buttons

Map photo markers and thumbnails are **not** icon-only buttons in this sense. They keep their accessible names and the thumbnail preview (§13), whose own focus behaviour is already required.

**Inventory of icon-only controls** (implementation must cover every row; tests assert this table):

| Control | Icon | Tooltip | `aria-label` |
|---|---|---|---|
| Back (left pane header) | `ArrowLeftIcon` | `Tilbake til appen` | `Tilbake til appen` |
| Layer visibility (header) | `EyeIcon` / `EyeSlashIcon` | `Skjul fotolag` / `Vis fotolag`; in Edit mode `Fotolaget vises mens du redigerer` | `Skjul fotolaget {name} på kartet` / `Vis fotolaget {name} på kartet` |
| Filter | `FunnelIcon` | `Filtrer bilder` | `Filtrer bilder` (`– {n} filtre aktive`) |
| Sort | `ArrowsDownUpIcon` | `Sorter bilder` | `Sorter bilder: {current}` |
| Reset filter and sort | `ArrowCounterClockwiseIcon` | `Nullstill filter og sortering` | same |
| Clear active filter summary | `XIcon` | `Fjern filter` | same |
| Toast close | `XIcon` | `Lukk melding` | same |
| Inspector `Vis stort` | `ArrowsOutIcon` | `Vis stort` | `Vis {filename} stort` |
| Inspector locate (current) | `CrosshairIcon` | `Zoom til bildet` (unplaced: `Zoom til bildet – bildet er ikke plassert`) | `Zoom til {filename} på kartet` |
| Inspector locate (candidate) | `CrosshairIcon` | `Zoom til EXIF-posisjon` / `GMI-posisjon` / `GML-posisjon` | `… for {filename}` |
| Edit undo | `ArrowUUpLeftIcon` | `Angre` (empty: `Angre – ingen endringer å angre`) | `Angre` |
| Edit redo | `ArrowUUpRightIcon` | `Gjør om` (empty: `Gjør om – ingenting å gjøre om`) | `Gjør om` |
| Rotation knob | (map handle) | `Endre retning` | `Retning for {filename}` (slider) |
| Ghost rotation knob | (map handle) | `Legg til retning` | `Legg til retning for {filename}` |
| Display toggle, *only if collapsed to icon-only* | `CameraIcon` / `ImageSquareIcon` | `Vis som markører` / `Vis som miniatyrbilder` | same |
| Close X in new dialogs (info, metadata, export preparation, boundary), *if icon-only* | `XIcon` | `Lukk` | `Lukk {dialogtittel}` |

If implementation introduces any other icon-only control, it must be added to this table and use `PhotoIconButton`. The generic test in §29 enforces this.

### Other accessibility requirements

- **Tools menu.** `aria-haspopup="menu"`, `aria-expanded`. `role="menu"` with `menuitem`. Arrow keys, Home and End rove; Esc closes and returns focus to the trigger. Group labels and separators. Disabled items use `aria-disabled` with a visible reason.
- **Filter and sort.** Exactly the V2 semantics: `aria-expanded`/`aria-controls`, `menuitemradio` with `aria-checked`. The active-filter summary is plain text plus a labelled clear button.
- **Photo list.** Buttons with `aria-pressed` for the active row, roving ArrowUp/ArrowDown, and accessible names that include the status: `«IMG_0001.jpg, plassert, GMI, retning 123 grader»`. The pinned hidden-selection row is announced.
- **Map markers.** Keyboard-focusable (existing `keyboard`), with an accessible name including filename, occurrence and source. Thumbnail mode uses `aria-label` (section 13). Enter/Space selects.
- **Hover fallback.** Tap or click selects and the inspector shows the full image. The tooltip also opens on focus.
- **Edit mode.**
  - The command bar is a `role="toolbar"` with `aria-label="Redigering av bilder"`, and a polite live region announces the changed count and undo/redo.
  - The selected marker supports arrow-key moves.
  - The rotation knob is a `role="slider"`.
  - The numeric `Retning` field and `Flytt til kartsenter` provide non-drag alternatives.
  - `aria-keyshortcuts` on Angre and Gjør om.
- **Shortcuts.** `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl+Y`. Ignored when focus is in a text or number input (native field undo wins) and when any `dialog[open]` exists.
- **Escape order:**
  0. Dismiss a visible icon tooltip. That keypress is consumed.
  1. Cancel the active gesture.
  2. Close an open menu or popover.
  3. Exit Edit mode with zero changes, or open the boundary dialog (focus on `Fortsett redigering`).

  A single accidental Esc never discards anything.
- **Dialogs.** Native `<dialog>` with `showModal`, `aria-labelledby`, `onCancel` preventing a default close where data is at risk, and focus return to the opener (the existing pattern).
- **Colour.** Source is always paired with text (list, inspector, legend). Selection uses shape (ring), staged uses pattern (dashed, dot), so nothing relies on hue alone.

This is not a general accessibility audit.

---

## 28. Responsive layout

Workspace column widths:

- **Left pane:** **272 px** fixed (from 280). The new header and toolbar fit 272 px: back 32 + name + eye 32; Verktøy ~104 + two 32 px icons + gaps.
- **Inspector:** `clamp(400px, 32vw, 560px)` (from `clamp(460px, 30vw, 520px)`).

| Viewport | Left | Inspector | Map |
|---|---|---|---|
| 1920 × 1080 | 272 | 560 | ~1088 (bigger preview, still a large map) |
| 1280 × 720 | 272 | 410 | ~598 (was ~540) |

The read-only inspector is far shorter than today (no forms). Its preview height stays `clamp(300px, 46vh, 440px)` (≈ 331 px at 720 high). At 410 px wide the preview is about 386 px wide, which is still a substantial image.

**Edit command bar at 1280.** About 598 px of map is available. The row fits:

- `Redigerer · 3 endret` ≈ 150
- Angre / Gjør om icon buttons 2 × 32
- `Forkast endringer` ≈ 120
- `Lagre endringer` ≈ 120
- gaps

That totals about 480 px. Below a map width of 560 px, the labels shorten to `Forkast` / `Lagre` and the status to `3 endret`. The contextual second row wraps. Keep the existing `max-width: 1200px` and `max-height: 700px` media rules, adjusted to the new widths. Mobile (`max-width: 700px`) keeps its stacked layout; Edit mode works there via touch but is not an acceptance target.

The whole application shell is not redesigned.

---

## 29. Tests

Use pure node tests wherever possible and focused synthetic browser tests (`tests/helpers/chromeHarness.mjs`). No pixel-perfect assertions; assert DOM state, attributes and geometry ranges.

### Pass 1: new pure tests

- **`photoEditSession.test.mjs`:**
  - stage move and direction
  - multiple photos
  - effective overlay (`acceptance: 'staged'`, source → manual)
  - stage equal to baseline removes the key
  - undo and redo order
  - redo cleared after a new stage
  - keyboard coalescing within and beyond 1 s
  - history cap
  - `reconcile` and `drop`
  - `photoEditChanges` shape
- **`photoSession` edit API** (extend `photoSession.test.mjs` or a new `photoEditCommit.test.mjs`):
  - begin requires an existing non-empty layer
  - **no canonical write or publish before apply**: the snapshot identity is unchanged and the listener is not called
  - apply writes all changes with one publish
  - basis `manual` with a shared `acceptedAt`
  - candidates and evidence preserved
  - a repeated asset's sibling untouched
  - an unplaced occurrence becomes placed
  - a new direction is created
  - `edit-conflict` when `spatial.current` or `direction.current` changed after begin (nothing written)
  - a removed occurrence is reported as stale
  - an invalid position or degrees fails before any write
  - `clear()` and `deleteLayer()` end the session
  - a new begin supersedes the old ticket
  - a late EXIF completion during the session does not cause a conflict
- **`photoWorkspaceView.test.mjs`:** every filter including effective sources, AND combination, counts, the selected-pinned rule, each sort including unknown-last and numeric collation, sibling adjacency.
- **`photoWorkspace.test.mjs`:** extend for `mode`, `removalIds`, and reconcile dropping removal IDs.
- **`photoMarkerPresentation.test.mjs`:** update. Arrow present when unselected; absent when unknown; navy colour; dashed when staged; thumbnail border uses the source colour; selected ring present *and* source border unchanged; unknown neutral; stack badge.
- **`photoMapFeatures.test.mjs`:** overrides (staged move, staged placement of unplaced), filter with the selected occurrence pinned.

### Pass 1: browser tests

New `photoWorkspaceEditUi.test.mjs`, synthetic: generated PNGs with EXIF GPS and heading, synthetic GMI with a repeated asset.

- **Workspace:** back arrow and focus return; tools menu keyboard and grouping; filter and sort; list → map pan, map → list scroll; pinned hidden selection; inspector contains **no** `button` matching `/Lagre|Nullstill|Flytt|Plasser|Juster|Bruk /`; occurrence switcher; info dialog content; toast auto-dismiss and persistent error toast.
- **Edit mode:**
  - enter and exit
  - drag-move a marker, then check the staged position, manual colour and connector
  - rotate with the knob (pointer events) and with keyboard ±1/±15
  - create a direction via the numeric field
  - click-to-place an unplaced photo (and confirm a pan does not place)
  - several photos changed, with the count shown
  - undo/redo by button and shortcut
  - Esc cancels a drag
  - Esc with changes opens the boundary
  - discard leaves canonical state identical (deep-equal before and after)
  - save commits once
  - Back, Verktøy, the header `Bilder` button and `Rediger opptaksdata` all hit the boundary
  - repeated asset: moving one occurrence leaves the sibling alone
  - the visibility toggle is disabled
  - other layers are non-interactive
- **Map display:** marker mode; thumbnail mode (`img` present, `object-fit: cover`, border colour per source, 40–50 px box); arrows in both modes for unselected photos; selection ring with border intact; the hover tooltip appears on mouseover with `object-fit: contain`; touch emulation (`hover: none`) shows no tooltip and a tap selects; identical-coordinate stack badge and cycling; the zoom threshold fallback; the preference persists across reload.

### Pass 1: icon tooltips and compass labels (R1, R3)

- **`photoIconButton` component test** (browser harness, synthetic page):
  - hover shows the tooltip after the delay, with the exact text
  - keyboard focus (Tab) shows it immediately
  - blur and mouse leave hide it
  - Escape hides it and is consumed (no other Escape effect in the same keypress)
  - no `title` attribute
  - equal text → tooltip `aria-hidden="true"` and no `aria-describedby`
  - differing text → `role="tooltip"` + `aria-describedby` while open
  - `aria-disabled` control stays focusable, shows its reason tooltip, and ignores clicks
  - touch emulation shows no tooltip
- **Inventory test** in `photoWorkspaceEditUi.test.mjs` (or a separate `photoWorkspaceTooltipsUi.test.mjs`). A table-driven assertion over every row of the §27 inventory. Put the workspace into the state each row needs (selected placed, unplaced, filter active, Edit mode with and without history, toast visible, knob focused). For each control, assert:
  - (a) the `aria-label` matches
  - (b) the hover tooltip text matches
  - (c) the keyboard-focus tooltip text matches
  - (d) there is no `title`
  - Also assert the toggle text switches with state (`Skjul fotolag` ↔ `Vis fotolag`).
- **Generic regression guard.** Query every `button`, `[role=button]`, `[role=slider]` and `[role=radio]` inside the workspace regions: left pane, inspector, map command bar, display card, edit pane, toast, open photo dialogs. Any element whose visible text (`innerText.trim()`) is empty must carry `data-icon-tooltip` and a non-empty `aria-label`. This catches future icon-only controls added without tooltips.
- **Negative check.** The `Verktøy` trigger, every `Verktøy` menu item, `Lagre endringer`, `Forkast endringer`, `Avslutt redigering` and `Rediger opptaksdata…` have **no** `data-icon-tooltip` and render no tooltip on hover or focus.
- **Inspector clarification (R2).** The inspector contains exactly one non-navigation action button, `Rediger opptaksdata…`, inside the `Opptak` section. The `Verktøy` menu contains no item matching `/opptaksdata/i`.
- **`photoDirection.test.mjs`:** `photoDirectionLabel` for 0, 45, 90, 135, 180, 225, 270, 315 and 359 returns `N, NØ, Ø, SØ, S, SV, V, NV, N` with degrees. `photoDirectionSpokenLabel` returns the full Norwegian words. Grep gate: no `'NE'`, `'SE'`, `'SW'`, `'NW'`, `'E'`, `'W'` cardinal literals remain in `photoDirection.mjs`.

### Copy and filter decisions (R6 in pass 1, R4 in pass 2)

- **Export dialog copy test (pass 2):** the Gemini profile text contains `vellykket import` and `ikke sertifisert`. The exact old strings `Gemini-kompatibilitet er ikke verifisert for noen av profilene` and `Importresultat er ikke verifisert` no longer appear for the Gemini profile.
- **Filter on the map (R6)** is already covered by `photoWorkspaceView.test.mjs` and `photoMapFeatures.test.mjs` (selected occurrence pinned). The browser test asserts that a filtered-out selected photo remains rendered on the map and pinned in the list.

### Pass 1: migrate existing tests

Label greps at HEAD:

| Label | Test files |
|---|---|
| `Flytt på kartet` | gmiPhotoAssociationsUi, gmiPhotoPlacementsUi, photoDirectionUi, photoMarkerProvenanceUi |
| `Plasser på kartet` | photoPositioningUi |
| `Juster retning` / `Bruk retning` | gmiPhotoAssociationsUi, gmiPhotoPlacementsUi, photoDirectionUi, photoLoadedGmiUi, photoMarkerProvenanceUi |
| `Bruk plassering` | above plus photoManualPlacementUi, photoPositioningUi |
| `Koble og posisjoner bilder` | photoDirectionUi, photoManualPlacementUi, photoSourceWorkflow.test + helper |
| `Kontroller kilder og posisjon` | photoPositioningUi, photoSourceWorkflow.test, photoSpatialUi |
| `Velg alle viste` | photoLoadedGmiUi, photoWorkspaceUi |
| `Tilbake til appen` | 8 UI tests + helper. The accessible name is kept, so most should survive |
| `Zoom til posisjon` | photoDirectionUi, photoManualPlacementUi, photoSpatialUi, photoWorkspaceUi |
| `Lagre opptakstid` | photoLoadedGmiUi |
| `photo-direction-indicator` | gmiPhotoPlacementsUi, photoDirection.test, photoDirectionUi, photoMarkerProvenanceUi |

How to migrate:

- Add shared helpers in a new `tests/helpers/photoWorkspace.mjs`: `openTools(label)`, `enterEditMode()`, `dragSelectedMarker(dx, dy)`, `rotateSelected(deg)`, `saveEdits()`.
- Session-level tests of the removed ticket APIs (`photoManualPlacement.test.mjs`, the session parts of `photoDirection.test.mjs`) are rewritten against `applyPhotoEdits` with **equivalent safety assertions**: identity staleness, generation, membership. Do not weaken them.
- Private-corpus browser suites are migrated but cannot run without `PHOTO_GML_FIXTURE`. Report their skips.

### Pass 2

- **`photoExportReadiness.test.mjs`:** classification per profile; placed-only scope; unplaced excluded group; precision versus missing; conflict detection; photographer omitted versus optional; AsBuilt context.
- **Parity.** For fixtures × three profiles, the readiness-required set (code, asset/occurrence) equals `buildPhotoExportPlan(...).errors` filtered to `capture-time-required | capture-time-precision | direction-required | invalid-context | invalid-xml-text | no-placed-photos`.
- **Bulk actions:** EXIF/GML adoption counts; missing-only fill leaves accepted values; precision replacement replaces only the selected assets.
- **Browser:** profile choice; summary; each panel; `Angi retning på kartet` → Edit mode → save → return; `Gå til eksport` disabled with blockers; handoff preselects the profile and context in Eksporter; optional omissions allow download; missing required blocks.
- **Gemini regression:** `photoGeminiCompatibility.test.mjs`, `photoExportSerializers.test.mjs`, `photoExportPackage.test.mjs`, `photoExportPlan.test.mjs` pass **unchanged**, and the serializer/plan/package files have no diff.

### Both passes

Run the full photo and GMI domain suite and the migrated photo browser selection against dev and a production build. Run the WFS browser selection, `npm.cmd run build`, focused ESLint on changed files and `git diff --check`. Known baselines from the import-wizard report: the `MapPaneToolbar.js:63` lint error and two `statsUiContract` failures.

---

## 30. Rendered acceptance

Capture at **1920×1080** and **1280×720** with synthetic, non-customer images: generated portrait and landscape PNGs with EXIF, a synthetic GMI with repeated references, 40+ photos, plus one 120-photo density set. Store screenshots outside Git (`%TEMP%`).

| # | State | What to judge |
|---|---|---|
| 1 | Normal workspace, nothing open | Quiet left pane; the list starts within about 150 px of the pane top; no banners |
| 2 | Selected-photo inspector (GMI, repeated, EXIF evidence) | Large preview; position, direction and provenance above the fold at 1080; no edit buttons |
| 3 | Tools menu open | Grouping, icons, destructive separation, disabled reason |
| 4 | Filter panel open + active-filter summary; sort menu open | Compact; the list stays visible |
| 5 | Marker mode with mixed sources and directions | Arrows on all directed photos; distinct from source colours |
| 6 | Thumbnail mode (zoom ≥ 16) | Square crops, provenance borders, arrows, selection ring with border intact, sibling dashed ring |
| 7 | Thumbnail hover reveal (portrait photo) | Whole image contained; no reflow; map still usable |
| 8 | Direction arrows close-up (both modes, selected and unselected) | Legibility |
| 9 | Edit mode entered, placed photo selected | Command bar, knob, map outline, hint |
| 10 | Staged move | Manual colour, connector, staged dot, inspector `Lagret: …` |
| 11 | Staged rotation mid-gesture and after | Live readout, dashed arrow |
| 12 | Multiple changed photos + `Endret` filter | Count, list markers |
| 13 | Save/discard boundary dialog (from Back) | Wording, focus on `Fortsett redigering` |
| 14 | Export-preparation summary (Legacy, with blockers) | Exception-first; complete groups collapsed |
| 15 | Export-preparation exception editing (capture time panel with date/time/timezone) | Native pickers; Unknown timezone default; selection |
| 16 | 1280×720 Edit command bar | Fits or wraps cleanly; does not cover zoom or layer controls |
| 17 | 120-photo density, thumbnail mode at zoom 15 / 16 / 18 | Threshold behaviour at the agreed initial value 16 (R5), stack badges, responsiveness. Record whether 16 should be tuned |
| 18 | Icon tooltips: back arrow, eye, filter, sort and locate, each on mouse hover **and** on keyboard focus (Tab); undo/redo in the command bar; rotation knob focused | Tooltip text, readable contrast, not clipped by the pane edge or map, no duplicate native `title` popup; text buttons show no tooltip (R1) |
| 19 | Inspector with `Rediger opptaksdata…` and the `Verktøy` menu open side by side | The single contextual action sits in `Opptak`; the menu has no photo-specific item (R2) |
| 20 | Direction labels in inspector, list and rotation readout | Norwegian compass letters (R3) |
| 21 | Gemini profile copy in Eksporter and Klargjør (pass 2) | Says successful real import testing; no certification claim (R4) |

---

## 31. Risks

1. **Largest: map-handle correctness under React and Leaflet.** If a re-render replaces the icon of the dragged marker (`setIcon`), the drag aborts. Changing `draggable` or `position` mid-gesture fights Leaflet. Pointer capture must not conflict with map dragging, including on touch. All of this must stay smooth with 100+ thumbnail `divIcon`s.
   - Mitigation: build `PhotoEditLayer` and the marker rewrite **first** in pass 1, with the synthetic browser test. Freeze the dragged marker's props during a gesture. Stage only at gesture end. Use the icon cache and per-marker memo.
2. **Readiness drift from plan rules.** Mitigation: parity test, and no refactor of `photoExportPlan.mjs`.
3. **Interim capability narrowing between passes.** Selection-scoped bulk completion and single-occurrence EXIF direction adoption are unavailable until pass 2. Whole-layer missing-only EXIF adoption and manual fill remain in Eksporter, so no data capability disappears, only the narrower scoping. Document this in the pass-1 report.
4. **A missed boundary path** (an action that bypasses `requestWorkspaceAction`). Mitigation: one gate function; browser tests for every entry in section 19; other layers non-interactive in Edit mode.
5. **React compiler stale memoization** of derived selectors (seen in the import wizard). Mitigation: explicit snapshot-identity dependencies.
6. **Test migration volume.** About 12 browser files reference removed labels. Private-corpus suites cannot run locally.
7. **Filter applied to map markers (decided, R6).** Users may sometimes expect "list only". Mitigation: the selected photo is always shown, plus the visible summary `Viser k av n`.
8. **Thumbnail threshold (decided, R5).** It starts at 16, and acceptance may tune it through the single constant.
9. **Copy decisions.**
   - Norwegian compass letters (R3) and the updated Gemini copy (R4) are agreed.
   - The remaining risk is copy drift: wording that implies certification. Mitigation: the §29 copy test.
   - `Koble og posisjoner bilder` stays the menu label, for continuity.
10. **Tooltip behaviour on focus and inside the map.** The tooltip must not be clipped by `overflow` containers (left pane, inspector) or hidden under Leaflet panes, and its Escape handling must not collide with the Edit-mode Escape order. Mitigation:
    - render the tooltip in a fixed-position layer, or with explicit viewport clamping
    - set z-index rules (§27)
    - the inventory and generic guard tests (§29)
    - rendered acceptance row 18

---

## 32. Explicit deferrals

- Clustering engine and screen-space fan-out for overlapping thumbnails (v1 uses z-order, stack badge and zoom threshold).
- Snapping (to GMI objects or survey geometry) and rotation snapping beyond the keyboard ±15° step.
- Multi-select on the map; drag-from-list-to-map placement; moving several photos at once.
- Unplacing a photo or clearing a direction in Edit mode. No such domain operation exists today.
- Staging EXIF evidence adoption inside Edit mode.
- Thumbnail mode or hover previews outside the workspace, and hover preview in marker mode.
- A `Mangler eksportdata` list filter and a "show in list" handoff from export preparation.
- A source "needs recheck after append" indicator. No watermark exists.
- Candidate ghost markers on the map for alternative positions.
- A `beforeunload` guard for pending edits, and persistence of edit sessions.
- EUREF89 UTM display, if reviewers prefer WGS84 only.
- All out-of-scope areas: import wizard, Gemini WFS, Gemini XML/ZIP, 3D, topology, persistence and cloud storage, general styling, non-photo validator UI.

---

## 33. Recommended minimum implementation-pass count

**Two passes.**

### Pass 1: workspace shell, inspector, map modes and transactional Edit mode, as one cohesive pass

These must land together:

- The inspector's edit controls are the only current path to manual placement and direction. Removing them without Edit mode is a capability regression.
- Keeping them temporarily would mean rewiring them twice (into the new inspector, then out again) and running two editing models in parallel. The brief rules that out.
- Thumbnails, always-on arrows and Edit handles all require the **same `PhotoMarkersLayer` rewrite** (presentation list, icon cache, gesture-safe props). Splitting them would rewrite the marker layer twice.
- The edit transaction is a small foundation: a ticket API plus a pure reducer. It is built and unit-tested as the first step *inside* pass 1. It does not justify a separate pass, because without UI it delivers nothing testable for users.
- The metadata dialog with date/time controls belongs here because the inspector forms are removed here.

### Pass 2: export preparation and the Eksporter simplification

This is a separate pass because:

- It is an independent domain surface (the readiness module) with its own parity risk.
- It touches the dialog adjacent to the empirically accepted Gemini export, so it deserves its own focused regression and acceptance.
- It can only reuse Edit mode (`Angi retning på kartet`) once pass 1 exists.
- Pass 1 leaves export fully working (unchanged whole-layer readiness in Eksporter), so the interim state is coherent.

A third pass is not needed.

---

## 34. Concrete implementation checklist

### Pass 1

**Domain (tests first)**

1. Add `editSessions` and `beginPhotoEdits` / `photoEditsAreLive` / `applyPhotoEdits` / `endPhotoEdits` to `photoSession.mjs`. Clean them up in `clear()` and `deleteLayer()`. Write the commit tests (section 29).
2. Create `src/lib/photos/photoEditSession.mjs` (reducer + selectors) and its tests.
3. Extend `photoWorkspaceState.mjs` (`mode`, `removalIds`, `filter`, `sort`) and create `photoWorkspaceView.mjs` (filter, sort, pinned, counts) with tests.
4. Update `photoMarkerPresentation.mjs` (always-on navy arrow, dashed staged arrow, `thumbnailMarkerOptions`, sibling/staged/stack, cache-key helper) and `photoMapFeatures.mjs` (overrides, filter with selected pinned, R6). Define `PHOTO_THUMBNAIL_MIN_ZOOM = 16` (R5). Update their tests.
4a. Change `photoDirectionLabel` to `N, NØ, Ø, SØ, S, SV, V, NV` and add `photoDirectionSpokenLabel` (R3). Update `tests/photoDirection.test.mjs`.
4b. Create `PhotoIconButton.js` (+ the tooltip hook or element for the rotation knob) and its component test (R1, §27), **before** building the panes, so every icon-only control uses it from the start.

**Map**

5. Rewrite `PhotoMarkersLayer.js`: a presentation map from page photos, icon cache, memoized markers, both modes, hover tooltip in thumbnail mode (hover-capable only), stack cycling, Edit-mode draggable selected marker with frozen props during the gesture, non-interactive other layers in Edit mode.
6. Create `PhotoEditLayer.js`: click-to-place capture (moved from `PhotoManualPlacementLayer`, including the drag threshold), connector, rotation knob (custom pointer handling, slider semantics), live arrow, Esc gesture cancel.
7. Create `PhotoEditCommandBar.js` (session row + contextual row: hint, `Flytt til kartsenter`, `Retning` number) and `PhotoEditBoundaryDialog.js` (+ conflict variant).
8. Create `PhotoMapDisplayCard.js` + `usePhotoMapDisplayPreference.js`. Replace `PhotoPositionLegend` in `MapView.js`. Add `panIntoView` to `PhotoMapController.js`.

**Panes and dialogs**

9. Rewrite `PhotoWorkspaceCollection.js`: back arrow, eye toggle, counts, `PhotoWorkspaceToolsMenu`, V2-style filter panel and sort menu, list rows (status lines), removal mode with the extracted `RemovePhotosConfirmation.js`.
10. Create `PhotoWorkspaceInspector.js`: sections from §8, occurrence switcher, staged display, read-only in place, `Rediger opptaksdata…` as the single contextual action in `Opptak` (R2), and icon-only `Vis stort` / locate controls via `PhotoIconButton`. Remove `SelectedPhotoInspector` from `PhotoCollectionPanel.js`. Do **not** add a metadata item to the `Verktøy` menu.
11. Create `PhotoCaptureMetadataDialog.js` + `PhotoCaptureTimeField.js`.
12. Create `PhotoSourcesInfoDialog.js` and `PhotoWorkspaceToast.js`.

**Page wiring**

13. In `page.js`: remove the manual/direction hooks and `cancelPhotoEditing`. Add the edit reducer + ticket lifecycle effect (liveness → reset), `requestWorkspaceAction` gate, `photoDialog`, `photoNotice`. Route `openPhotos`, `addPhotosToLayer`, `openPhotoSources`, `exitPhotoWorkspace` and `openPhotoLayer` through the gate. Force visibility on edit entry. Add the global Edit-mode key handler (undo/redo/Esc order). Update the unplaced hint copy.

**CSS**

14. Update `photoWorkspace.css` (widths 272 / `clamp(400px, 32vw, 560px)`, header, toolbar, list, thumbnail, stack, map edit outline) and add `photoEdit.css`. Delete `photoManualPlacement.css` and `photoDirection.css`.

**Removal**

15. Delete the files in section 25. Remove the session ticket APIs. Run the pass-1 grep gates.

**Verification**

16. Migrate the browser tests (helpers + label changes), add `photoWorkspaceEditUi.test.mjs` with the tooltip inventory, generic guard and negative checks (§29), run all suites (section 29), rendered acceptance 1–13 and 16–20 at both viewports, and write the implementation report. The report must document the interim scoping limits from risk 3.

### Pass 2

1. Create `src/lib/photos/export/photoExportReadiness.mjs` + classification and **parity** tests.
2. Add the page-level shared export config `Map(layerId → { profile, crs, context })`, cleared on `clear()` and layer removal.
3. Create `PhotoExportPreparationDialog.js`: profile cards, summary, task panels (time / direction / photographer / context / unplaced), local selection, evidence-first actions using the existing session APIs, `PhotoCaptureTimeField` reuse, `Angi retning på kartet` → Edit-mode handoff with filter, and `Gå til eksport`.
4. Add `Klargjør for eksport…` to the Verktøy menu, behind the gate.
5. Simplify `PhotoExportDialog.js`: shared config, readiness line, link back to prep, remove `PhotoEvidenceActions`, and apply the agreed Gemini copy (R4, §21; copy only). Add diagnostic labels in `photoExportDiagnostics.mjs`. Any icon-only control in the new dialogs uses `PhotoIconButton`.
6. Delete `PhotoEvidenceActions.js` and `PhotoManualFillActions.js`. Run the pass-2 grep gates.
7. Gemini gate: no diff in `photoExportPlan.mjs`, `photoExportXml.mjs`, `photoExportPackage.mjs`, `attachmentNames.mjs`. The export, serializer and Gemini compatibility suites pass unchanged.
8. Browser tests for prep and the handoff, plus the copy test (§29). Rendered acceptance 14–15 and 21 at both viewports, and the implementation report.
