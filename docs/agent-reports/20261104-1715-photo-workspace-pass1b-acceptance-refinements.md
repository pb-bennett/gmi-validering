# FOTO workspace Pass 1B — acceptance refinements

Date: 2026-11-04, Europe/Oslo. Branch `feature/photo-workspace`, HEAD `8d61232` (*Overhaul photo workspace and transactional edit mode*). The working tree was clean at start. **Nothing was committed, pushed or deployed.**

Specification: the Pass 1B brief (sections 1–14), read together with `20261103-1300-…-planning.md`, `20261103-1845-…-implementation.md` and `20261103-1916-…-verification-stabilization.md`. Where the brief differs from earlier UI decisions, the brief wins.

Summary: all 11 requested refinements are implemented. Every photo/GMI browser suite passes against a production build, including the private 148-photo corpus suites. Gemini WFS regressions are 64/64. The domain selection matches the documented baseline exactly. The transactional Edit mode, export/compatibility code and evidence model are unchanged in substance. Section 4 (wizard integration) is a **shared-presentation** integration, not a merged state machine. The reasons are in §3.4.

---

## 1. Implemented features

| § | Feature | Result |
|---|---|---|
| 1.1 | Left pane width | `clamp(292px, 23vw, 316px)`: **316 px** at 1920, 314 at 1366, 294 at 1280. Falls back to the Pass 1 width of 272 px below 1100 px, so small screens keep a usable map. Inspector `clamp(380px, 30vw, 560px)`. No horizontal overflow at 1920/1366/1280 (tested). |
| 1.2 | Header and counts | The back arrow is a bordered icon button with the `Tilbake til appen` tooltip and name. Counts read `81 bilder · 103 plasseringer`; the placements count only appears when an asset is used more than once. Unplaced photos appear separately (amber `· 3 uplassert`) only when there are any. The Edit pill reads `Justerer`. |
| 1.3 | Verktøy trigger | The trigger is now a wrench + chevron icon button with `aria-label` and tooltip `Verktøy`. Menu structure and items are unchanged. `Fullfør opplysninger…` remains an enabled-looking placeholder with no workflow. |
| 2 | Rename | `Rediger bilder` is now **`Juster plassering og retning`**: the Verktøy item (icon `ArrowsOutCardinal`), the command-bar toolbar name and the unplaced-map hint. The bar's visible status is the short `Justerer`. `Rediger opptaksdata…` is untouched. |
| 3 | Stacked photos in Edit mode | See §3.1. The selected occurrence carries the full stack badge. A plain click cycles through the stack. A forgiving grab ring widens the target. A new non-drag `Flytt med klikk` mode is added. Selection pans the photo clear of overlays. |
| 4 | Source positioning wizard | Uses the import wizard's frame, step list and source cards. Loaded GMI layers can now be used as sources (`Bruk {lag}`). See §3.4. |
| 5 | Inspector | The photo comes first: the preview takes the image's aspect ratio, capped at `clamp(260px, 64vh, 720px)` (landscape 52vh), with `object-fit: contain`. Chips stay visible. Plassering shows coordinates, the locate action and staged `Lagret` lines. Status, source, basis, direction and evidence moved into collapsed disclosures. `Koblinger` and `Fil` are collapsed sections whose summaries carry a count and context. No field was removed. |
| 6 | Full-screen viewer | Adds layer-wide previous/next over unique assets in the list's sort order (not limited by the filter), with no wrapping at the ends. Shows `N av M bilder`. Zoom/pan resets per photo. A separate `Bilder på samme sted` gallery uses exact-coordinate stacks, one entry per asset. The toolbar uses icon buttons with Norwegian tooltips and a readable zoom %. Instructions are now screen-reader-only. |
| 7 | New-photo import | The header `Bilder` button is removed. The LayerManager footer has `Legg til fil` and `Legg til bilder` side by side; the latter starts a **new** FOTO layer import. Verktøy → `Legg til bilder…` still appends to the current layer. |
| 8 | GMI card | The `Legg til bilder` row is replaced by a compact `CameraPlus` icon button in the header action area. Tooltip and name: `Koble bilder til GMI-laget`. It still starts the loaded-GMI association import. When the source is unavailable it is `aria-disabled` and the tooltip gives the reason. |
| 9 | WFS card | Adds a `WFS` badge on the shared `LayerTypeBadge` system. The card is collapsed by default: badge, name, `N ledn. · N punkt · N områder`, zoom and chevron. Rows, `Oppdater`, `Hent for kartutsnitt`, `Tilgang`, `Koble fra` and the connection name are in the expanded part. Notices, the empty-coverage hint and `Oppgi tilgang` (when credentials are needed) stay visible while collapsed. Collapsing is presentation-only. |
| 10 | GMI default colours | New palette order: orange `#F59E0B`, cyan, fuchsia, slate, teal, violet. Violet, the closest to the WFS indigo `#4338CA`, now comes last. Only new layers read this order. Layer styles are not persisted, and manual colours / reset slots are untouched. |
| 11 | Main-map thumbnails | The main map uses the same `PhotoMarkersLayer`, icon cache and 44 px thumbnails, with the zoom-16 fallback, hover preview, stack badges and direction arrows. The toggle sits in the existing `Tegnforklaring` legend (shared `PhotoMapDisplayModes` component) and uses the same persisted preference as the workspace. Stack popups page through members (`2 av 6 på samme sted`). Inspection only. |

### 3.1 Stacked photos (§3) — investigation and changes

Findings from inspecting panes, hit-testing and events:

- Pane order was already correct. Gemini reference is 380, casing 390, overlay 400, survey markers 600, photo markers 620 and the Edit placement pane 640. The selected occurrence is drawn in the 640 pane, so GMI geometry and other photos cannot take its drag.
- **Real defect 1:** in Edit mode the selected marker covered its stack siblings and had no click behaviour. Stack cycling on the map stopped working, and the `markers` pane showed a misleading `N−1` badge under it.
- **Real defect 2, found during verification:** on small maps (1024×620) the command bar became a 208 × 297 px column over the map centre. The selected photo was often underneath it, so drags hit the bar. A second cause: a new pan computed while a previous pan was still animating landed in the wrong place. Leaflet's `map.stop()` re-centres on the mid-animation centre, so it cannot be used to settle the map.

Changes:

- **Shared stack logic.** `src/lib/photos/photoStacks.mjs` provides exact-coordinate grouping, same-location assets and the asset sequence and navigation. It is used by the workspace map, the main map, Edit cycling and the viewer gallery.
- **Badge.** The Edit marker gets `stackCount` (all members) and `data-stack-count`. Stacks that contain the hidden edited occurrence show no second badge in the markers pane.
- **Plain click on the edit marker** selects the next member. A click within 250 ms after a drag is ignored, because after staging, `setIcon` replaces Leaflet's drag handler and the trailing click is otherwise not recognised as part of the drag.
- **Forgiving hit target.** A transparent `::before` ring (9 px around camera markers, 7 px around thumbnails) widens the grab target without changing the visuals. It stays inside the rotation knob's radius.
- **`Flytt med klikk`** (non-drag, explicit, `aria-pressed`): the next map click stages the position, and photo markers let the click through, so a crowded spot can be targeted exactly. Escape leaves the mode first without staging anything. It is bound to one occurrence and reset when entering Edit mode. `Flytt til kartsenter` / `Plasser i kartsenter` are unchanged.
- **Pan clear of overlays.** `PhotoMapController` pans with padding for the command bar (top band) and the display card (right column), but only when the photo is in that overlay's band. Padding is dropped if it would leave less than 80 px. If a pan animation is running, it waits for `moveend` (private Leaflet 1.9 `_panAnim._inProgress`, like the existing `MapLifecycleGuard`). Entering Edit mode issues one pan request for the selected photo.
- **Narrow maps** (701–1150 px viewport): the command bar spans the map width below the left map controls, instead of forming a tall column.
- **Gesture safety is unchanged.** Icon and position are still frozen from `dragstart` to `dragend`. Staging, undo/redo, discard and the Save boundary are untouched (all Edit suites pass).

### 3.4 Wizard integration (§4) — design decision

Both wizards are now **one presentation**: the same `photo-collection-dialog` frame, header with close X, `PhotoWizardSteps` step list with back-navigation, focusable step heading, `.photo-import-step-body`, and `photo-import-footer` (status left; Avbryt, Tilbake and the primary action right). Sources are shown as the same `PhotoSourceOption` cards with the same wording (`Fra GMI`, `Fra GML-fil`, `Fra EXIF-data i bildene`, `Bruk {lag}`, `Velg …-fil …`). The import placement step now renders through `PhotoSourceOption`, with identical DOM and behaviour.

The positioning workflow keeps its own ticket and lifecycle. Its steps are renamed to match the import wording: `Kilder · Koblinger · Plassering · Kontroll`. It works only on photos already in the layer, and no photos are selected again. It keeps: review-only staging, an explicit `Behold kilde og koblinger` checkpoint, `Kontroller på nytt` (recheck), safe `Fjern kilde` with confirmation, duplicate detection that turns into a recheck, repeated-occurrence rows, candidate-only evidence, positions applied only after explicit selection plus confirmation, preserved manual positions, and cancellation without changes.

The one capability gap closed: the import wizard could use GMI layers already loaded in the app, but the positioning wizard could not. `photoSession.stageLayerSource(layerId, input, kind)` now also accepts `{ binding, read, isLive }`. It checks liveness before and after the read and builds the source with the same `loadedGmiSource()` helper as `setDraftGmiSource`.

**Why the state machines were not merged.** Import operates on draft photos and creates or appends a layer in one commit. Positioning operates on committed occurrences, with separate source and position checkpoints and its own ticket. A single reducer would touch the most sensitive code (import commit, loaded-GMI plans, workflow tickets) for no user-visible gain. Shared presentation components give the requested "one consistent experience", and both wizards' existing browser suites pass unchanged in behaviour. The fully merged wizard remains a possible later refactor.

Small fix: the positioning dialog's `onCancel` now ignores the bubbling `cancel` event from a dismissed native file picker (the import wizard already did this). Before, dismissing the picker could close the wizard.

### Viewer resource ownership (§6)

The viewer must navigate across assets while the inspector remounts per asset, so it now owns **exactly one** object URL for the photo it shows. The URL is created imperatively on the `<img>` and revoked on photo change or close. Nothing is eagerly decoded. The same-location gallery uses session thumbnails only. Before, the viewer reused the inspector's URL. Tests now assert the new contract instead: one extra File URL while open, revoked on close, and sibling switching still creates none. Focus returns to the current inspector's `Vis stort` after close. Arrow keys are ignored in text fields, with modifier keys, and inside the gallery, where they move between thumbnails.

## 2. Files changed

**New:** `src/lib/photos/photoStacks.mjs`, `src/components/photos/PhotoWorkspaceViewer.js`, `PhotoWizardSteps.js`, `PhotoSourceOption.js`. Tests: `tests/photoStacks.test.mjs`, `tests/photoWorkspaceStacksUi.test.mjs` (10 browser subtests), `tests/helpers/photoImageFixtures.mjs` (synthetic sized PNGs).

**Changed (src):**
- `app/page.js`: viewer state, stack ids, click-move state, Edit-entry pan, loaded GMI inputs for both wizards, `photoDisplay` for the main map, removed the header `Bilder` prop.
- `app/globals.css`: WFS badge, layer-card icon button, footer action row, tooltip CSS moved here so it also works outside the workspace.
- `LayerManager.js`, `Sidebar.js`, `ProductHeader.js`, `WorkspaceShell.js`, `LayerPanel.js`, `LayerTypeBadge.js`, `MapView.js`, `MapInner.js` (props only), `MapLegend.js`, `gemini-wfs/GeminiReferenceCard.js`.
- Photos: `PhotoWorkspaceCollection.js`, `PhotoWorkspaceToolsMenu.js`, `PhotoWorkspaceInspector.js`, `PhotoImageViewer.js`, `PhotoMarkersLayer.js`, `PhotoMapPopup.js`, `PhotoMapDisplayCard.js`, `PhotoMapController.js`, `PhotoEditLayer.js`, `PhotoEditCommandBar.js`, `PhotoPositioningWizard.js`, `PhotoImportWizard.js`, `PhotoImportPlacementStep.js`, and the CSS files `photoWorkspace.css`, `photoEdit.css`, `photoImageViewer.css`, `photoPositioningWizard.css`.
- Lib: `map/layerHighlight.mjs`, `photos/photoSession.mjs` (`stageLayerSource` input + shared `loadedGmiSource`), `photos/photoWorkspaceView.mjs` (`assetSequence`), `photos/photoImportPresentation.mjs` (one read-error message).

**Not touched:** export plan/XML/package/diagnostics, `attachmentNames`, `PhotoExportDialog`, `PhotoEvidenceActions`, `PhotoManualFillActions`, Gemini WFS libs, `package.json`/lockfile (verified with `git diff --stat`).

## 3. Deviations and rationale

1. **Wizard integration is shared presentation, not a merged state machine** (§3.4).
2. **Below 1100 px the left pane stays 272 px**, and the Edit command bar moves below the map controls on 701–1150 px maps. The brief targets 1280/1366, where 292–316 px applies. At 1024 the wider pane made the map too narrow for Edit mode (§3.1).
3. **WFS `Oppgi tilgang` and status notices stay visible while collapsed.** They are the essential action and state when a connection fails. The expanded part therefore has no duplicate access button.
4. **The GMI icon button's accessible name is exactly `Koble bilder til GMI-laget`, as specified.** With several GMI layers, the names are identical. The button sits inside its layer card. Adding the layer name to the name is a recommended follow-up.
5. **The initial (empty-app) screen keeps its `Bilder` button.** It is not the shared header, and its tests rely on it. The browser helper `clickSourceControl` maps `Bilder` to the new footer button outside the workspace (documented in the helper).
6. **The viewer owns its own original URL** (§3.1 Viewer). This is a deliberate change from Pass 1's "the inspector owns src".
7. **The previous source-contract test forbade `LayerTypeBadge` in the WFS card.** It now asserts the explicit `type="WFS"` and still forbids survey-type inference (`getLayerType`).

## 4. Tests, build and lint (actual results)

All browser runs used a **production build** (`npm.cmd run build`, `next start -p 3110`) and headless Chrome via the existing CDP harness. Corpus: `PHOTO_GML_FIXTURE=C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml` (148 JPEGs).

| Run | Result |
|---|---|
| All photo/GMI browser suites (`tests/*Ui.test.mjs` except `statsChartUi`), with corpus | **66 tests: 65 pass, 0 fail, 1 skip**, 250.6 s. The skip is the private G01/G04 association corpus, which is not on this machine |
| New `photoWorkspaceStacksUi` (part of the above) | 10/10. Covers counts and widths at 1920/1366/1280; portrait and landscape inspector at 1080/720; six stacked occurrences selectable, on top, badge 6, no hidden badge; 20 px ring drag moves only that photo; plain-click cycling; `Flytt med klikk` through another marker and Escape; thumbnails mode ring and drag; viewer 7 unique assets with the repeated asset once; zoom reset; no wrap; gallery of 6 with arrow keys contained; focus return; main-map shared thumbnail preference, stack popup paging, open in workspace, zoom-15 fallback, no draggable markers; footer import opens a new-layer import, cancel creates nothing, buttons fit at 1366/1280 |
| `gmiPhotoPlacementsUi` (the step that was flaky during this pass) | 10/10 consecutive passes after the overlay-aware pan fix |
| Gemini WFS: `geminiReferenceBrowser`, `geminiWorkflowBrowser`, `geminiPopupBrowser`, `geminiReferencePresentation` | **64/64**. Includes the new collapsed-by-default check: badge class, counts summary, no rows until expanded, and expand/collapse leaving line/point visibility and request counts unchanged |
| Domain/source selection (all `tests/*.test.mjs` except `Ui`/`Browser`/`terrainPhotoGml`), env unset | **1,228 tests: 1,220 pass, 3 fail, 5 skip**. The 3 failures are the documented `validationV2WorkspaceInspector` baseline. 1,224 before this pass plus 4 new tests |
| Documented baseline contracts (`appInfoUiContract`, `statsUiContract`, `validationV2WorkspaceInspector`, `terrainPhotoGml`) | **23 tests: 16 pass, 7 fail**, identical to the HEAD baseline in the previous report. One `appInfoUiContract` assertion pinned the old header props and was updated to the new contract |
| Opt-in `photoDialogLayout` with `PHOTO_UI_URL` | pass. It had been broken since Pass 1 (it clicked a removed plain `Legg til bilder` button); migrated to Verktøy |
| `npm.cmd run build` | pass. Two builds started right after stopping the test server failed once with a transient Turbopack `next/font/google queries have exactly one entry` error; the immediate retry compiled cleanly each time. It is not reproducible on a cold build |
| ESLint on every changed/new `src` file | **12 errors, 4 warnings**, all pre-existing: `LayerPanel.js` 4 (hooks after early return, the same count linting HEAD's file) and `MapInner.js` 8 errors / 4 warnings (baseline per the previous report). All other files: 0. `npm run lint` remains unsupported by Next 16 (`next lint`) |
| `git diff --check` | clean |

New/extended assertions also cover: the loaded-GMI source lifecycle (review-only staging, keep, positions as proposals only, duplicate → recheck, stale binding before and after the read); exact-coordinate stacks; same-location dedup; the layer-wide asset sequence independent of the filter; the palette's hue distance from WFS; collapsed inspector disclosures with information retained (`textContent`); the Verktøy icon tooltip; the back-button border; and the header without `Bilder`.

**Test migrations** (intentional UI changes, not weakened safety): dt-fact helpers read `textContent`, because details are collapsed but present. Updated: new labels and counts; the GMI card button's name and `aria-disabled`; Gemini suites open the collapsed card through one helper (`clickGeminiControl`); viewer URL assertions; and widths. The shared `dragSelectedMarker` now waits until the selected marker stops moving, because selection pans can start a frame later. No runtime-exception assertion was removed or filtered.

## 5. Browser checks performed

All automated checks used real CDP mouse/keyboard input with screenshots outside Git (session scratchpad):

- 1920×1080, 1366×768, 1280×720: pane widths, no horizontal scroll, title row not wrapped, footer buttons fit, inspector previews (portrait 600×900 / landscape 900×600, 1200×800).
- 1024×620 (existing suites): command bar placement and pan-clear behaviour.
- Visual review of the 1920 and 1280 inspector, the viewer with gallery, Edit thumbnails and the main-map thumbnails with legend toggle. Layout was as intended. The legend caret glyph is pre-existing styling.
- Real 148-photo corpus: workspace, spatial, append duplicates, manual placement, direction and positioning suites. All passed.

## 6. Known limitations

1. The fully merged single wizard state machine is not done (§3.4).
2. The GMI icon button name does not include the layer name (deviation 4).
3. The overlay-aware pan relies on Leaflet 1.9's private `_panAnim._inProgress`. Revisit when upgrading Leaflet, like `MapLifecycleGuard`.
4. The same-location gallery uses the **effective** (staged) position in Edit mode, the same as the map's stack badges.
5. Main-map stacks: the popup pages through members; there is no map-level cycling (inspection only, by design).
6. The `Flytt med klikk` mode places at the click point; there is no snapping. Touch was not separately tested for this mode.
7. The inspector disclosure state persists per page session in module memory (not storage).
8. Live authenticated Gemini WFS was not exercised; synthetic responses only, as before.

## 7. Unresolved items

- None blocking. The private G01/G04 association corpus case remains skipped on this machine.

## 8. Recommendations for the Vercel acceptance round

1. On a real laptop at 1366×768 and 1280×720, check: left pane density, the larger inspector photo for portrait corpus images, and Edit mode on a crowded GMI object (six or more photos). Try the list selection, click cycling, the grab ring and `Flytt med klikk`.
2. Open `Koble og posisjoner bilder…` on a layer with a loaded GMI file: use `Bruk {lag}`, keep the source, then propose and apply positions. Confirm that cancelling at each step leaves positions untouched.
3. In the viewer, check that arrows move through unique photos in the current sort order and that `Bilder på samme sted` shows the expected photos for a shared GMI point.
4. On the main map, switch `Tegnforklaring → Bilder → Miniatyrer` and check thumbnails at zoom ≥ 16 alongside GMI and WFS layers, including popups.
5. Check the collapsed WFS card and the first GMI layer's orange marking next to the WFS indigo.
6. Decide whether the GMI icon button should name its layer (deviation 4).

## 9. Confirmation

No export wizard, `Fullfør opplysninger…` workflow, schema/profile simplification, timestamped export naming, EXIF position comparison or reverse geocoding was implemented. The Gemini VA-compatible export, photo identifiers, attachment naming, evidence model, transactional Edit mode, undo/redo, Save/Discard boundaries and the Leaflet lifecycle guard are preserved. Nothing was committed, pushed or deployed.
