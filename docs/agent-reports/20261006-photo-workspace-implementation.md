# FOTO workspace implementation — 2026-10-06

## 1. Task summary

Existing FOTO layers now open a dedicated application workspace instead of the photo dialog. The collection occupies the left sidebar, the existing map is the largest desktop pane, and the selected photo/provenance occupies the right sidebar. New-layer import and incoming-photo curation remain in the accepted modal.

Implemented compact normal-map photo popups, smaller camera markers, workspace marker selection, explicit additions to existing layers, confirmed member removal, late GML review/recheck, and batch GML/EXIF acceptance. No manual placement, survey-policy changes, commits, pushes, or delegated agents.

## 2. Baseline and preserved changes

Repository: `C:\GitHub\gmi-validering-test`; branch: `feature/photo-workspace`; HEAD: `dd4a39b Add photo import and FOTO layers`.

The spatial milestone was already implemented and uncommitted. Both accepted reports were read first:

- `20261006-photo-spatial-milestone-planning.md`
- `20261006-photo-spatial-milestone-implementation.md`, including its importer-layout corrective section.

A SHA-256 manifest of the pre-task uncommitted files was recorded outside git in `%TEMP%\gmi-photo-workspace-baseline.json`. Both reports and dependency files remain byte-for-byte unchanged. Existing projection, GML parsing, EXIF extraction, preview generation, layer cards, and unrelated milestone files were preserved except for the specific integration files listed below. Survey validation, Data Table, survey popups, hyperlink copying, and survey parsing were not changed.

No dependency was added or upgraded. The already accepted exact `exifr@7.1.3` dependency remains intact.

## 3. Final workspace UX model

- **Entry:** the FOTO layer card's “Åpne bilder” opens the module. A normal-map popup's “Åpne i bildemodul” enters focused on that exact photo.
- **Left:** all layer members, existing thumbnail resources, active-photo navigation, independent checkboxes for batch selection, placed/unplaced filtering, visibility, additions, positioning sources, batch acceptance, and confirmed removal.
- **Center:** the existing Leaflet map and all visible FOTO markers. The active photo has a distinct marker. Clicking a marker belonging to the active workspace selects that photo directly.
- **Right:** one large original preview, basic file facts, accepted/current position, GML/EXIF candidates, provenance, source filenames/IDs, the candidate currently in use, and existing zoom/use actions.
- **Exit:** “Tilbake til appen” restores normal application UI. The layer, candidates, accepted positions, thumbnails, and normal markers remain.

The top-level “Bilder” action always starts a new-layer draft, including when invoked inside the workspace. It never appends implicitly. “Legg til bilder” in the workspace explicitly targets its layer.

## 4. Workspace state and ownership model

Canonical photo data remains exclusively in the external `photoSession` registry. Original Files remain private to that registry; they are not inserted into React snapshots or Zustand.

Page-local reducer state is session-only UI state:

```js
{
  layerId: 'photo-layer-…',
  activePhotoId: 'photo-…',
  selectedIds: ['photo-…', 'photo-…'], // batch selection only
  photoIds: ['photo-…', 'photo-…']     // last membership order for fallback
}
```

Entering selects the requested photo, or the first member, and clears batch selection. Changing the active photo does not alter checkboxes. Reconciliation removes dead selection IDs and chooses the next surviving photo after a removed active member, then the nearest previous member, then the first member. An empty layer clears the inspector. Exiting clears workspace-only selection. Layer deletion/reset exits safely.

Each asset still has exactly one owner: draft **or** one FOTO layer. A target draft stores `draftTargetLayerId`; confirmed append transfers its IDs without copying Files or restarting live metadata/thumbnail tasks. Current accepted position remains separate from immutable candidate evidence:

```js
photo.spatial = {
  candidates: [
    { id: 'source-id:entry-id', kind: 'gml', sourceId: 'source-id',
      sourceFilename: 'positions.gml', sourceEntryId: 'entry-id',
      status: 'viable', position: { crs: 'EPSG:4326', longitude: 10.43, latitude: 59.22 },
      raw: { /* original source fields, CRS, coordinates, date and direction */ } },
    { id: 'photo-id:exif', kind: 'exif', /* independent raw GPS evidence */ }
  ],
  current: {
    position: { crs: 'EPSG:4326', longitude: 10.43, latitude: 59.22 },
    basis: { kind: 'candidate', candidateId: 'source-id:entry-id' },
    acceptance: 'explicit-candidate', acceptedAt: 123456789
  },
  exifRead: { state: 'viable', errorCode: null }
};
```

Layer-owned `spatialSources` retain parsed immutable evidence plus an association ledger. Layer-scoped `sourceReviews` contain a staged source, matching diagnostics, conflicts and unplaced matches; they own no photo Files. Source evidence persists during the session when the workspace closes; incomplete review can be resumed or cancelled when reopened.

## 5. Files changed in this task

These are changes relative to the already implemented spatial milestone, not a list of every file currently different from HEAD.

| Area | Files |
| --- | --- |
| Application integration | `src/app/page.js`, `src/components/WorkspaceShell.js` |
| Workspace and source/removal UI | **New:** `src/components/photos/PhotoWorkspaceCollection.js`, `src/components/photos/photoWorkspace.css` |
| Incoming-photo dialog | `src/components/photos/PhotoCollectionDialog.js` |
| Photo provenance | `src/components/photos/PhotoSpatialInspector.js` |
| Photo markers/popups | `src/components/photos/PhotoMarkersLayer.js`, **new** `src/components/photos/PhotoMapPopup.js`, photo-marker rules in `src/app/globals.css` |
| Map integration/cleanup | `src/components/MapInner.js` |
| Registry/source ownership | `src/lib/photos/photoSession.mjs`, `src/lib/photos/photoReferenceMatching.mjs` |
| Pure helpers | **New:** `src/lib/photos/photoPositionSources.mjs`, `photoPresentation.mjs`, `photoWorkspaceState.mjs` |
| Tests | **New:** `tests/photoWorkspace.test.mjs`, `tests/photoWorkspaceUi.test.mjs`; updated `tests/browser/photoSpatialChecks.mjs`, `tests/photoSpatialUi.test.mjs`, `tests/photoDialogLayout.test.mjs`, `tests/mapPaneToolbar.test.mjs` |
| Completion report | This file |

There are 21 application/test files affected, plus this report. The existing `SelectedPhotoInspector`, its safe original-URL lifecycle, and thumbnail renderer are reused.

## 6. Map popup behavior

Normal-map marker click/keyboard activation opens a photo-specific Leaflet popup, not the importer or former viewer modal. It shows the existing thumbnail URL, filename, current source/status, dimensions when known, and a capture timestamp only when GML candidates agree on one source text value. The timestamp is explicitly labelled GML; no timezone inference or file-modification-to-capture-time substitution is made.

The popup never calls `getFile` or creates an original-image URL. Its action enters the workspace focused on the clicked asset. It uses Leaflet's explicit `popupPane` so camera markers cannot paint over popup content. Photo hover identification uses the marker's native title/alt instead of long Leaflet filename tooltips in dense areas. Survey popup models and renderers remain untouched.

## 7. Marker visual changes

Ordinary camera markers are 20×20 px, with a 13 px camera glyph, thin outline, pale background and lighter shadow. The selected workspace marker is 26×26 px, filled blue with a white glyph/border and stronger outline/shadow; a raised marker z-index makes it distinct within the dedicated photo pane.

Marker identity remains layer/photo based. Only valid `spatial.current` positions produce markers. Visibility continues to hide/show the layer's markers without changing data. Exact overlaps are preserved: no deduplication, jitter, clustering, thumbnails-as-markers or spiderfying.

## 8. Add-photos-to-layer flow

`beginImport(layerId)` creates a separate target draft. The familiar import modal contains **only incoming photos**; existing layer members are not curated there. It supports append-to-draft, removal of unwanted incoming photos, and one optional GML source for those additions. Confirmation reads “Legg til N bilde/bilder i laget”.

`appendImport()` validates the live target and positioning state, finalizes matches against the remaining incoming assets only, initializes viable confident creation-time GML positions for those new assets, and transfers ownership to the existing layer. Existing member state/evidence/current positions remain untouched. Pending preview/EXIF jobs follow the records across transfer.

Case/NFC-normalized filename collisions are diagnosed against the target layer plus incoming draft. Duplicate assets retain separate IDs and Files; they are never silently merged. Curation-time positioning remains intentionally scoped to incoming photos. Cancel releases only draft assets and staged positioning. Deleting/resetting the target invalidates and closes its import.

## 9. Remove and batch-remove flow

Checkbox selection and active inspection remain independent. “Fjern fra lag” opens a native confirmation dialog for single or multiple members. Singular/plural wording states that membership/session assets are removed and original files on disk are unchanged. Cancel changes nothing.

The domain API `removeLayerPhotos(layerId, ids, { confirmed: true })` requires explicit confirmation. It releases only owned requested assets, queued/active work, thumbnails, original references and spatial records; prunes source-ledger associations with those IDs; updates counts and markers; and preserves the FOTO layer even when no members remain. Raw source rows remain immutable historical evidence without dead asset associations. Whole-layer deletion remains the normal layer-card action.

## 10. Late GML source flow

“Legg til posisjonskilde” stages a GML source against **only current layer members**. Review shows matched, unmatched and ambiguous references, invalid geometry/CRS, layer members without confident matches, viable unplaced matches and photos whose source position differs from current. Conflict names/distances and unmatched member names are inspectable.

Policy: **late GML is candidate-only for every photo, including unplaced photos**. Confirming “Legg til kandidater” does not replace or initialize current position. Single/batch acceptance is a separate action.

Source parsing/replacement is transactional. Failure retains the prior staged valid source; “Behold forrige gjennomgang” can restore it. Owner/generation/request guards discard late results after cancel/delete/reset. Matching uses current membership again at confirmation, so staged review cannot attach to removed photos.

Sources have IDs, filename/import time, raw parsed evidence, ledgers and a SHA-256 fingerprint of parsed evidence/kind. Without secure-context Web Crypto, exact serialized evidence provides duplicate comparison instead, preserving existing HTTP/LAN imports without a collision-prone fallback. A repeated identical parsed source, even renamed, is diagnosed rather than duplicated. A changed source becomes another immutable source/candidate set. “Sjekk treff på nytt” uses an already stored source against current members, adds newly confident candidates and never doubles already attached source/entry candidates or overwrites current. Recheck preserves source ordering. Numbered source choices and source IDs distinguish sources even with equal filenames.

Conflict comparison is horizontal only, with a 0.01 m tolerance; it does not imply coordinate accuracy or perform vertical comparison/transformation. Previously attached source evidence is retained if a later recheck reports ambiguity; the rechecked association ledger exposes the ambiguity and creates no guessed candidate.

## 11. Batch candidate acceptance

The workspace exposes “Bruk GML-posisjon for valgte” and “Bruk EXIF-posisjon for valgte”. Buttons enable only when every selected member has exactly one viable candidate from the selected source. With multiple GML sources, a numbered source selector chooses the source explicitly. Selection may be filtered; “Velg alle viste” selects that visible collection subset.

Pure `photoBatchCandidateRequests` resolves owner-local candidate pairs. Existing `acceptCandidates(layerId, requests)` changes only `spatial.current`, preserves all source candidates and Files, and publishes once. Changing current immediately updates markers/counts and labels the candidate in use. EXIF/GML switching remains reversible. No user must accept 148 positions one by one.

## 12. Lifecycle and resources

- Original preview uses the existing URL lifecycle; changing active photo, exiting, removal or deletion revokes the old URL.
- Workspace original preview is suspended while an incoming-photo modal is open, avoiding a second unnecessary inspected-original URL.
- Popup/collection reuse owned thumbnails and allocate no original preview resources.
- Latest-record updates remain the basis for asynchronous metadata/thumbnail writes. Acceptance/append/source writers preserve other live fields.
- Removed/deleted/reset records cannot be revived by late EXIF, thumbnail or GML completion.
- Source reviews and request tokens are cleared with owners; pending locate requests are validated/cleared when their assets disappear.
- The real browser flow exposed a pre-existing map resize timeout that could fire after Leaflet destruction during rapid layout/deletion transitions. `MapSizeInvalidator` now coalesces the timeout and clears it on cleanup, preserving its existing resize behavior.
- Hard reload restores no FOTO layer, Files, sources, selection, accepted positions or preview resources. No new persisted authority was introduced.

## 13. Tests and validation

Validation results:

- **162 focused/regression Node tests passed**, including 12 new workspace/session/source tests. No failures or skips in that selection.
- **Four actual Chrome browser test suites passed:** `photoWorkspaceUi.test.mjs`, the updated `photoSpatialUi.test.mjs`, `photoDialogLayout.test.mjs`, and `terrainPhotoGml.test.mjs` with the real corpus enabled. None skipped. The production application was tested on port 3100; the parser/session suite also uses its isolated native-browser module harness.
- **`npm run build` passed** (Next 16.1.6), including TypeScript/static generation. The existing Browserslist-data notice remains unrelated.
- **Targeted ESLint passed** for page, shell, photo components, changed photo-domain helpers and tests.
- **MapInner baseline comparison:** exactly the same eight errors and four warnings as `dd4a39b`, comparing rule/severity/message signatures with numeric source locations normalized. No new lint diagnostics; existing hook/ref findings were not suppressed or cleaned up. This is not a claim of repository-wide clean lint; the previously documented LayerPanel/AppInfo baseline issues remain outside this task.
- **`git diff --check` passed**; new untracked task files were also scanned for trailing whitespace.
- **Integrity/preservation checks passed:** accepted reports and package files byte-for-byte unchanged; original GML and all JPEG hashes unchanged. HEAD/branch unchanged; no commit/push.
- The temporary production server was stopped. The development server was restored on **localhost:3000**, and the same 12-combination import-layout regression test passed there too, ready for manual review.

Reproduce browser acceptance with a running built application (fixture paths stay outside git):

```powershell
$env:PHOTO_UI_URL='http://localhost:3100'
$env:PHOTO_GML_FIXTURE='C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml'
$env:PHOTO_SCREENSHOT_DIR=Join-Path $env:TEMP 'gmi-photo-workspace-production'
node --test --test-concurrency=1 tests/photoWorkspaceUi.test.mjs tests/photoSpatialUi.test.mjs tests/photoDialogLayout.test.mjs tests/terrainPhotoGml.test.mjs
```

Focused domain tests cover workspace active/batch independence and fallback; append/cancel/current preservation; incoming-only source scope and duplicate-name diagnostics; late-only evidence and conflict review; reversible batch acceptance; repeated/changed sources and recheck; failed replacement; ambiguity/unsupported geometry; confirmed removal and source/URL cleanup; future adapter seam; and pending source results after cancel/reset/member removal/owner deletion. Existing metadata/thumbnail completion-order tests remain intact.

Regression selection also includes photo/session/preview/reset/spatial/map adapters, projection and actual EXIF fixtures, layer presentation/order, map controls/highlights/background, GMI/SOSI/KOF parser integration, survey popup/hyperlink behavior, and Data Table inspection/search. A toolbar source assertion was updated for the conditional workspace class; map behavior is also exercised in actual browsers.

## 14. Browser acceptance

Native installed Chrome/CDP was used with isolated temporary profiles, closed after tests. The in-app browser remained unavailable from the prior accepted pass due to its sandbox-policy bootstrap error; no additional browser dependency was installed.

Actual UI suites exercise layer-card and popup entry, all 148 collection members, loaded large preview/provenance, separate active and batch selection, direct workspace marker selection, selected marker size/state, zoom/use actions, reopen, target append cancel/confirm, incoming GML, confirmed single/multi removal and fallback, empty-layer retention, repeated/conflicting/late sources, batch switching, visibility, original URL instrumentation, reload, survey coexistence and reset.

Measured workspace geometry:

| Viewport | Left | Map | Right | Behavior |
| --- | ---: | ---: | ---: | --- |
| 1680×900 | 280 px | 1010 px | 390 px | Three panes; map largest |
| 1024×620 | 280 px | 444 px | 300 px | Three panes; pane scrolling; header controls stay separate |
| 390×700 | 375 px | 375 px | 375 px | Vertical stack; 15 px scrollbar; source actions reachable |

Import geometry remains accepted in both new-layer and append modes: desktop 1579.2×846 at (50.4,27); short 962.5×582.8 at (30.7,18.6); narrow 374×684 at (8,8). The layout test checks empty and populated drafts in both modes at all three viewports, and still rejects a synthetic half-width/left-edge regression.

Screenshots are outside git under `%TEMP%\gmi-photo-workspace-production`. Loaded desktop preview, dense marker styling, compact popup, short workspace, narrow workspace and import geometry were visually inspected. Browser checks wait for original/thumbnail image loading and popup animation before capture.

## 15. Real 148-photo fixture results and integrity

Read-only fixture: `C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml`, with its sibling `Attachments` directory. The unrelated wider GMI/older attachment fixture was not inspected.

Creation-time acceptance remains 148 photos, 148 confident exact matches, 148 viable GML candidates/current positions, 148 viable EXIF candidates, 0 unplaced and 136 distinct horizontal coordinates. Browser/domain tests verify all 148 marker identities, numerical candidate agreement without inferring EXIF authority, explicit 148-member EXIF/GML switching, preserved evidence identity and duplicate-source/recheck behavior.

Photos-only creation yields zero current positions despite EXIF candidates. Importing the real GML late yields 148 matched candidates and **zero automatic placements**. Explicit batch acceptance yields 148 current markers. Visibility, deletion/reset and pending-resource cleanup pass.

Original source integrity was checked against the accepted milestone hashes:

- GML SHA-256: `667bbeb9c9b0094bc9ff3f9848564557c4b8b6f298717985145a2f244ca2ee5d`
- Sorted `(filename, JPEG SHA-256)` manifest SHA-256: `6576b4fe8cadd579d891224493d7c823568b3cda372250de8a75b3964842eb1d`
- 148 JPEGs; 190,303,135 bytes. Hashes unchanged. No source rewriting/re-encoding or normalization on disk.

Manifest serialization matches the accepted audit: sorted filenames, JSON `ensure_ascii=True`, separators `(',', ':')`, UTF-8.

## 16. Known limitations

Exact-overlap markers remain separate records but overlap visually; pointer access to all overlapping members is limited. The collection and keyboard navigation remain available. There is no overlap chooser.

The collection is a session-only virtual folder with lazy thumbnails, not a paged/virtualized list. The tested 148-photo corpus is supported. Narrow screens stack the panes and scroll; this is graceful degradation rather than a fully optimized mobile editor. Pane resizing/collapse is not implemented.

Late-source conflict distance is an approximate horizontal comparison. Raw timestamps/direction/heights remain source evidence, not editable operational metadata. Individual candidate dismissal is not added; users can cancel staged source review or choose another current candidate. Recheck preserves historical candidate evidence and never guesses through new ambiguity.

The domain batch API remains validated per requested pair; the UI requires all selected photos to have a viable unique candidate before enabling its batch action.

## 17. Deferred GMI/DFOT and other work

No GMI/DFOT source parser or wider fixture audit was performed. `sourceAdapters[kind]` and owner-scoped `stageLayerSource`/`applyLayerSource`/recheck provide the prepared seam. Adapters return entries with a generic `reference` plus raw evidence, status and normalized position; matching also retains compatibility with GML `raw.fotolink`. A synthetic `gmi-dfot` adapter test demonstrates the seam without actual parsing. Candidate labels already accommodate `gmi`, `gmi-dfot`, `gmi-object` and future manual bases.

Deferred: manual place/move, operational direction, date/photographer editing, export, VA-object association, persistence, clustering/spiderfying/jitter, overlap chooser, source removal/candidate dismissal policy, pane resize/collapse and a focused GMI/hyperlink/DFOT audit.

## 18. Recommended next milestone

Implement manual placement/movement in this map-centric workspace: one explicit working-position transaction with cancel/apply and provenance, preserving candidate evidence. Keep direction semantically unknown until a separate direction milestone. Conduct the requested focused GMI/DFOT source audit separately before implementing that source adapter.

## Manual acceptance UX corrections — 2026-10-06

### Observations and scope

Manual acceptance found an unclear late-source journey, permanently visible source/batch controls, a 390 px desktop inspector, insufficient original-image detail inspection, and button-like camera markers. This corrective pass changes their presentation and image inspection only. The preceding report remains intact; the dimensions and marker sizes below supersede its earlier measurements.

No dependency change, spatial/source architecture redesign, manual placement/movement, GMI/DFOT parsing, metadata editing, export or overlap handling. Original ownership, matching/projection, immutable candidates, separate current position, import/append curation, confirmed removal and session-only behavior remain intact. No agents, commits or pushes.

### Left panel and positioning-source flow

The collection dominates the default panel. Counts, exit, visibility and additions remain at the top. “Posisjonskilder” is collapsed initially and shows its attached-source count. Filtering, selection count and “Velg alle viste” remain compact; removal and GML/EXIF batch controls appear only with a batch selection. Active inspection remains independent of checkboxes.

The source journey is explicit:

1. Expand “Posisjonskilder” and choose “Legg til posisjonskilde”.
2. Show “Analyserer” while parsing.
3. Show “Analysert · klar til å legge til”, the filename, matches, references without matches, ambiguity, new candidates and conflicts. Invalid source geometry/CRS is flagged; detailed references, member omissions and conflict distances remain expandable.
4. Confirm “Legg til kandidater”. No current position changes, including for unplaced photos.
5. Show attachment confirmation and collapse review. The section retains an explicit attached count; each source is labelled “tilknyttet”.
6. Select photos and explicitly use GML/EXIF positions through the existing single/batch actions.

“Sjekk treff på nytt” is available directly for each attached source after expanding the section; opening raw details or choosing the file again is unnecessary. Recheck identifies its attached source, reports newly attachable evidence (zero for an unchanged complete source), and confirms updated matches separately from accepting positions. Duplicate-file review links to the actual attached source ID, including renamed files, and offers recheck without a disabled import/apply button.

The new-candidate count reflects matched evidence that would actually be attached, including invalid diagnostic candidates. Invalid evidence never becomes a viable/current position. Counts are derived presentation data, not another spatial authority.

### Desktop and responsive geometry

| Viewport | Left collection | Map | Right inspector |
| --- | ---: | ---: | ---: |
| 1680×900 | 280 px | 896 px | 504 px |
| 1024×620 | 280 px | 444 px | 300 px |
| 390×700 | 375 px | 375 px | 375 px, stacked |

Desktop inspector width uses `clamp(460px, 30vw, 520px)`; the compact three-pane breakpoint keeps the map usable at 1024. At 1680 the right panel gains 114 px, and its preview height grows from 300 to 414 px. The map remains the largest pane. Default desktop collection height exceeds half the viewport. Narrow screens retain the accepted scrolling stack and reachable source controls.

The new-layer/target-layer importer remains unchanged: empty/populated desktop, short and narrow layouts pass the existing 12-combination browser guard.

### Original-image viewer

“Vis stort” opens an image-only native modal above the workspace. It reuses the inspector's existing original File URL; it does not allocate another original URL or open the collection/import dialog.

Images retain their aspect ratio. Controls provide fit-to-screen, zoom in/out, 100% and a percentage indicator. Wheel/trackpad zoom anchors around the pointer; pointer drag pans when the scaled image exceeds the viewport. Pan is bounded and zoom is limited to 800%. Escape and the visible close button restore the same active photo and focus. Switching photos after closing revokes the previous preview URL through the existing inspector lifecycle.

Browser instrumentation verifies one live original URL throughout viewer opening/closing, no increase in original URLs created by the viewer, and cleanup on selection changes, exit, removal, deletion and reload. Portrait, landscape, short and narrow viewing all pass. No source re-encoding or modifications.

### Camera markers and popup

Normal camera SVGs are 16×16 px with a thin blue silhouette and white edge for map contrast, without a surrounding button/disc. The transparent interaction area is 30×30 px. The selected camera is 22×22 px, filled blue with a white lens/edge, and retains a +1000 marker z-index offset. Keyboard activation and a visible keyboard-focus ring remain available.

All 148 marker identities and 136 geographic positions remain intact. Dense-area selection and zoom levels 16–20 were captured and visually inspected, including a selected marker among nearby photos. No clustering, jitter or deduplication.

Normal-map activation still opens the compact anchored thumbnail popup and “Åpne i bildemodul”. Popup images reuse thumbnails and create no original File URLs. Survey popup behavior is unchanged.

### Files changed in this corrective pass

14 application/test files, plus this appended section:

- Workspace: `PhotoWorkspaceCollection.js`, `photoWorkspace.css`, `PhotoCollectionPanel.js`, `src/app/page.js`.
- Viewer: new `PhotoImageViewer.js`, `photoImageViewer.css`, `src/lib/photos/photoImageView.mjs`.
- Source presentation: new `src/lib/photos/photoSourceReviewPresentation.mjs`; `photoSession.mjs` adds only the attached-source diagnostic ID for duplicate review.
- Markers: `PhotoMarkersLayer.js` and photo-specific rules in `src/app/globals.css`.
- Tests: `photoWorkspace.test.mjs`, `photoWorkspaceUi.test.mjs`, new `photoWorkspaceUx.test.mjs`.

### Validation and real fixture

- 165 focused/regression unit tests passed. The 15 changed workspace/image/source tests were rechecked after final helper edits.
- Four actual Chrome suites passed: workspace UI, spatial UI/survey coexistence, import layouts and browser Terrain/EXIF/session integration. The expanded workspace suite passed again against the final build, including direct attached-source recheck, dense marker selection and image URL/zoom/pan/close checks.
- Targeted ESLint passed for page, photo components, changed helpers/session and tests.
- Production build passed; `git diff --check` and new-file whitespace checks passed. Existing unrelated lint findings remain outside this pass; no repository-wide clean-lint claim.
- Real corpus: 148 photos, confident GML candidates/current positions and viable EXIF candidates; 136 positions, 148 marker records. Late real GML on a photos-only layer remains candidate-only until explicit batch acceptance. Reversible acceptance, append/cancel, confirmed removal, visibility, popup entry, reset and hard reload pass.
- Original GML/JPEG hashes match section 15. The accepted planning/spatial reports, dependency files and unrelated local changes are byte-for-byte unchanged. The pre-correction workspace report is preserved as an exact byte prefix.
- Native Chrome/CDP with temporary profiles was used because the in-app browser bootstrap still fails with its sandbox-policy error. Profiles were closed. Screenshots are outside git in `%TEMP%\gmi-photo-ux-production`, including desktop/short/narrow workspace, source review, image fit/zoom, dense selection, zoom 16–20 and popup captures.

Remaining concerns: exact overlaps still limit pointer access to underlying markers; the collection remains the reliable access path. Touch/mobile editing is not separately optimized, though narrow layout and pointer-based image interaction are supported. Final subjective visual approval remains the user's manual acceptance. No functional blocker found. The recommended next milestone remains manual placement/movement, with the GMI/DFOT audit kept separate.


## Positioning wizard and final manual UX corrections — 2026-10-06

### Scope and preserved baseline

The preceding spatial/workspace implementation and manual-acceptance correction remain intact. This section supersedes the previous inline source attachment/batch-use journey. Branch remains `feature/photo-workspace`, HEAD `dd4a39b`. No agents, commits, pushes, dependency changes, manual map placement/movement, GMI/DFOT parsing, metadata editing or export.

The existing candidate/current/source model remains canonical in `photoSession`; original Files remain private with exactly one session owner. No new persisted state or coordinate authority was introduced. The import/append modal, immutable evidence, geographic projection/matching, confirmed removal, visibility and session cleanup remain unchanged.

### Layer entry and large-image trigger

The FOTO card now shows a gallery icon and **“Bildemodul”**. Its title is “Åpne bildemodul” and its accessible name identifies the layer. Visibility and deletion remain separate actions.

The right preview now has a conventional corner maximise icon, with title and accessible label **“Vis stort”**. The accepted image-only viewer is unchanged: fit, zoom, 100%, wheel zoom, drag/pan, Escape and close all retain the same original URL and active photo. No extra original URL is allocated by the trigger, viewer, wizard or compact map popup.

### Why the old positioning journey was replaced

The prior inline UI required understanding staged sources, review, attaching evidence and a separate batch selection/use action. Its technical correctness did not make the ordinary positioning task clear. **“Posisjoner bilder”** now launches one task-focused wizard. The photo collection remains dominant; advanced source history is collapsed under **“Posisjonsdata · N kilde/kilder”**. The left batch selection continues to support confirmed removal independently from active inspection and wizard selection.

### Final wizard UX

1. **Kilde:** choose GML-fil or EXIF GPS. GML uses the existing Terrain parser and owner-scoped matching; choose a new file or a source already in the layer. Pending analysis and parse failure are explicit. EXIF uses already-extracted GPS without a file picker, reports usable/pending/unavailable counts and cautions that GPS can be wrong. No disabled GMI placeholder is shown.
2. **Kontroller:** all viable photos are selected by default. Each row shows the existing thumbnail, filename, current/proposed source and **Plasseres**, **Flyttes X m**, **Samme posisjon**, **Kan ikke plasseres**, **Tvetydig** or **Ingen treff**. Individual checkboxes and select/clear-all operate only on viable rows. Unavailable/ambiguous rows cannot be applied. Expandable comparison shows current/proposed coordinates and other known viable candidates, including approximate differences. GML diagnostics remain expandable.
3. **Oppsummer:** place/move/same counts reflect the actual selection. Deselected usable photos and unavailable photos are explicitly outside it. GML matching totals are labelled separately from selected-action totals. The summary states that only selected current positions update, originals do not change and evidence is retained. “Samme posisjon” can change the accepted source basis without meaningful movement. Final action says **“Bruk GML-posisjon for N bilder”** or **“Bruk EXIF-posisjon for N bilder”**, with singular wording for one photo.

The review uses the existing approximate horizontal comparison and shared **0.01 m** conflict tolerance. Distances are not an accuracy claim; differences below 0.1 m but above the tolerance are described as “under 0,1 m” rather than a misleading “Flyttes 0,0 m”. Existing inspector locate/current/candidate controls remain available. The wizard provides comparison directly and does not require raw provenance inspection.

### State and confirmation transaction

`photoPositioning.mjs` creates a frozen review projection from canonical session photos. Wizard state is local: source choice, step, review plan and selected IDs. It is independent of active-photo and workspace batch selection. Reviewed current-record identity is retained for a stale-confirmation check; coordinates are not copied into another authority.

`applyPhotoPositioning()` preflights owner/membership, selected candidate IDs, source review and current-position identity before writing. GML evidence creation is preflighted too. Invalid/stale confirmation aborts without partial changes and asks for review again. Successful confirmation attaches/rechecks GML evidence and updates only selected viable current records in **one session publication**. Counts/markers therefore change together.

All confidently matched GML evidence is preserved with the attached source, including evidence for deselected photos and invalid diagnostic candidates. Deselected **current positions** remain untouched. Existing candidates and source entries are never deleted or rewritten. The existing lower-level attachment and batch acceptance APIs remain available internally; users no longer need that multi-operation workflow.

Loading/analyzing GML makes no placements. Final reviewed confirmation is the explicit authorization to apply it, including to previously unplaced photos. Identical/renamed attached GML is recognized through existing evidence identity, rechecked/reused and does not duplicate sources or candidates. Source-history “Sjekk treff på nytt” opens the same wizard. EXIF never initializes current silently; only reviewed explicit confirmation accepts it.

Cancel, close or Escape discard temporary review and invalidate pending reads while preserving already-attached sources and every current position. Member changes close the wizard; layer deletion/reset unmount it. Domain confirmation guards also reject stale/dead owners. Temporary parsing Files are not retained as owned photo resources; the wizard creates no object URLs. Pending EXIF completion does not silently expand a review selection: return to Kilde and analyse again to include newly ready candidates.

### Files changed in this pass

15 application/test files plus this appended report section; dependencies are unchanged.

- Existing application files: `src/components/photos/PhotoLayerCard.js`, `PhotoCollectionPanel.js`, `PhotoWorkspaceCollection.js`, `photoWorkspace.css`; `src/lib/photos/photoSession.mjs`, `photoPositionSources.mjs`; `src/app/page.js` (unplaced guidance only).
- New application files: `src/components/photos/PhotoPositioningWizard.js`, `photoPositioningWizard.css`; `src/lib/photos/photoPositioning.mjs`.
- New tests: `tests/photoPositioning.test.mjs`, `tests/photoPositioningUi.test.mjs`.
- Updated browser regressions: `tests/photoWorkspaceUi.test.mjs`, `tests/photoSpatialUi.test.mjs`, `tests/photoDialogLayout.test.mjs`.

The existing image viewer, marker/popup components, survey parsing/validation, Data Table and hyperlink behavior were not changed in this pass.

### Validation and browser acceptance

- **180 focused/regression unit tests passed**, including 15 positioning tests. Coverage includes default selection, place/move/same, actual-selection summaries, conflicts, evidence preservation, atomic publication, duplicate/rechecked sources, cancellation, parse failure and stale owner/current/source/request guards.
- **Five actual Chrome suites passed against the production build:** positioning wizard; workspace/image/popup/append/remove; spatial UI/survey coexistence; empty/populated new/target import geometry; actual Terrain DOMParser/EXIF/session integration. No suites skipped. The wizard and existing workspace suites also passed against development.
- Targeted ESLint passed for changed page/photo/domain/test files. Production build passed. `git diff --check` and new-file whitespace checks passed. No repository-wide clean-lint claim; unrelated baseline findings were not fixed.
- Read-only real corpus: photos-only + EXIF wizard default-selects 148, reports 148 placements and creates 148 current markers only after confirmation. Cancel at each step leaves zero markers. Photos-only + real GML gives 148 matches/default selections/placements and zero unmatched/ambiguous references.
- Existing real GML-positioned layer + EXIF reports **148 same positions and zero moves**. Explicit EXIF/GML basis switching is reversible and preserves evidence. Reusing the attached GML leaves one source. Existing tests retain **148 photo/marker identities and 136 distinct geographic positions**, with no deduplication.
- Synthetic browser checks cover visibly conflicting moves, deselection and summary changes, unavailable/no-GPS rows, malformed XML, unmatched/ambiguous references, unsupported CRS, selected-only application and membership-change abort. Unit checks additionally cover layer deletion, reset, source/current changes and late parse cancellation. Application reset and hard reload pass existing browser regressions.
- Normal-map compact popup and thumbnail reuse, selected marker state, visibility, active/batch independence, append cancel/confirm, confirmed single/batch removal, one live inspected-original URL, landscape/portrait lightbox fitting/zoom/100%/pan/wheel/close and cleanup remain passing.

| Viewport | Workspace collection / map / inspector | Wizard dimensions |
| --- | --- | --- |
| 1680×900 | 280 / 896 / **504 px** | 1080×790 px |
| 1024×620 | 280 / 444 / 300 px | 976×572 px |
| 390×700 | 375 px panes, stacked | 374×684 px |

Wizard rows, footer reachability and horizontal overflow were checked at all three sizes. Empty/populated new-layer and target-layer import layouts pass the existing desktop/short/narrow guard. Production screenshots were visually inspected for the wizard source/review/summary and short/narrow review, workspace/maximise control, compact popup and dense selected markers. Captures/logs remain outside git under `%TEMP%\gmi-photo-wizard-production` and `%TEMP%\gmi-photo-wizard-production-results.txt`.

Native Chrome/CDP with temporary profiles was used because the in-app browser bootstrap remains unavailable with its sandbox-policy metadata error. Test profiles were closed; production acceptance server was stopped and development localhost:3000 restored.

### Integrity and remaining limitations

GML SHA-256 remains `667bbeb9c9b0094bc9ff3f9848564557c4b8b6f298717985145a2f244ca2ee5d`; the sorted JPEG manifest remains `6576b4fe8cadd579d891224493d7c823568b3cda372250de8a75b3964842eb1d` (148 JPEGs, 190,303,135 bytes). Original files were not modified. Planning/spatial reports, dependency files and all unrelated pre-existing changes are byte-for-byte preserved. The prior workspace report is an exact byte prefix of this report.

No functional blocker found. Exact-overlap marker access and narrow-screen stacking remain accepted limitations. Source removal/candidate dismissal, optimized mobile editing, manual placement/movement, GMI/DFOT, metadata/direction editing, export and clustering remain deferred. Final subjective UX approval remains manual acceptance. The next milestone remains manual map placement/movement after accepting this workspace; the focused GMI audit remains separate.
## Append duplicate handling correction — 2026-10-06

Manual reproduction: create 148 members, remove six, then choose the full 148-photo folder in “Legg til bilder”. The previous combined filename warning did not affect transfer: all remaining incoming records could append. Actual target/incoming arithmetic is **142 filename collisions and six new photos**, regardless of the originally observed warning count.

### Policy and UI

Append mode now distinguishes **incoming-batch filename duplicates** (`duplicateNames`, incoming records only) from **incoming-versus-target collisions** (`appendStatus.targetCollisions`). Both use the existing basename/case/NFC comparison; original names/paths/Files are unchanged. Counts refer to incoming records, so multiple existing members with one name do not inflate the skip count. Filenames are collision evidence, not content identity; no photo-content hashing or merging was added.

Target collisions are **skipped by default**, independently of inspection and removal-dot selection. The summary shows incoming/new/actually-added/skipped totals. Cards say **“Finnes allerede · Hoppes over”** and provide a deliberate per-photo **“Legg til likevel”** toggle; disabling it restores the skip. Ordinary “Velg alle” selects eligible records only and never enables overrides. There is no bulk duplicate override. The primary CTA uses the actual appendable count: **“Legg til 6 bilder i laget”**, or disabled **“Legg til 0 bilder i laget”** with an all-existing explanation. New-layer creation keeps its accepted inclusion behavior.

Incoming-batch duplicates remain separate File records with a distinct warning. Their existing inclusion behavior is retained rather than broadening this correction into content deduplication; ambiguous GML filename mappings remain unusable. Each target-colliding incoming record requires its own explicit override, including when several incoming files share that name.

### Ownership, positions and asynchronous work

The skip policy is enforced in `photoSession.appendImport()`, not just presentation. Only eligible IDs transfer; skipped originals/thumbnails/queued tasks are released. Target records, current positions, candidate evidence and existing source associations remain untouched.

Skipped draft records remain inspectable but have empty candidates/current and an explicit `skipped-duplicate` GPS-read state. GPS extraction starts only when they become eligible. Optional draft GML is matched/attached only to appendable incoming IDs, never target members or skipped records. Revoking an override cancels pending metadata and discards that draft's derived GPS evidence; late results cannot restore it. Re-enabling schedules a live read. Target membership changes are reconciled before publication. Cancel/reset/deletion clear overrides with normal draft cleanup. No persistence/dependency/spatial-model rewrite.

### Files and validation

Eight code/test files changed, plus this appended section: `photoSession.mjs`, `photoPositionSources.mjs`, `exifGps.mjs` (skipped-read message only), `PhotoCollectionDialog.js`, `PhotoCollectionPanel.js`, `tests/photoWorkspace.test.mjs`, new `tests/photoAppendDuplicates.test.mjs` and `tests/photoAppendDuplicatesUi.test.mjs`.

- **187 focused/regression unit tests passed**, including seven new append tests: 148/142 arithmetic, default skips/select-all, zero-new domain guard, distinct same-name File override, cancel, case/NFC and incoming ambiguity, skipped spatial/resource cleanup, pending-read override races and target membership changes.
- **Six production Chrome suites passed**: new real-corpus append; import layouts; workspace/image/popup/append/remove; positioning wizard; spatial/survey coexistence; actual Terrain/EXIF integration. The focused append check also passed in development and was rechecked with a fully loaded skipped-photo preview for visual acceptance.
- Targeted ESLint, production build and `git diff --check` passed; new test-file whitespace checked. Existing unrelated lint findings were not addressed.
- Browser reproduction: **148 → remove six → 142 → choose 148 → six new / 142 skipped → confirm → exactly 148 members and markers**, with optional incoming-only GML restoring the six positions. Remaining member IDs/thumbnail resources are unchanged; domain tests also verify identical target spatial/source/File references.
- Repeat full folder: **148 skipped, zero appendable, confirmation disabled**, including desktop 1680×900, short 1024×620 and narrow 390×700. A separately flagged incoming same-name PNG with different content is explicitly overridden: exactly **one** record appends, giving **149 members / 148 positioned markers**; it remains unplaced and has no GPS. That deliberate override is a separate acceptance case, not the safe default result.
- Existing creation, candidate/current evidence, GML/EXIF wizard, 148-marker/136-coordinate representation, visibility, lightbox URL lifecycle, removal/reset/reload and survey coexistence regressions pass.

Original GML/JPEG hashes remain equal to section 15; all unrelated changes/dependencies/planning/spatial reports are preserved, and preceding workspace report bytes are an exact prefix. Screenshots/logs are outside git under `%TEMP%\gmi-photo-append-production`; the existing Chrome/CDP harness was used because the in-app browser connection still reports its sandbox-policy metadata error. Temporary test profiles were closed. No commit or push. Development localhost:3000 restored after production checks.

Remaining limitations: collisions are filename-based and may be legitimate different photos; per-photo override is intentional. Narrow importer remains a scrolling stacked layout with less preview space when diagnostics are present. No functional blocker found; final subjective acceptance remains manual.
### Uniform-card presentation — 2026-10-06

Visual correction only: the extra collision metadata row and below-card text button have been replaced by thumbnail overlays. A compact amber **“Finnes allerede”** badge marks the default skip. The separate 30×30 px corner plus button has title **“Legg til likevel”**, a filename-specific accessible label and native keyboard operation. An active override shows a green check and **“Legges til”**; its title/label offers **“Ikke legg til”**. The removal-selection dot remains separate. Neither overlay adds height or changes thumbnail/grid sizing.

Actual Chrome measurements with the real 148-photo reimport show identical **168.5 px** outer card heights for new, skipped and overridden records: widths 146.84 px at 1680×900, 176.20 px at 1024×620 and 160.50 px at 390×700. Thumbnails remain **112 px** high. Browser assertions compare every card's outer/button dimensions, verify overlay bounds inside the thumbnail, and exercise Enter/Space override and reversal. Desktop/narrow screenshots were inspected; the narrow importer retains its accepted scrolling stack.

The focused real-corpus append browser test and existing dialog-layout browser test pass, as do seven append domain regressions, targeted ESLint and `git diff --check`. The real flow still restores 142 + 6 to exactly 148 members; a full repeat still skips 148 with confirmation disabled. Domain/GPS/GML/selection/count behavior is byte-for-byte unchanged.

Changed files: `PhotoCollectionPanel.js`, new `photoCollectionPanel.css`, and `tests/photoAppendDuplicatesUi.test.mjs`, plus this note. Global styling, dependencies, other milestone files and preceding report bytes are preserved. Screenshots/logs remain outside git under `%TEMP%\gmi-photo-uniform-cards`. The existing Chrome harness was used after the same in-app browser connection failure. Development localhost:3000 remains available. No commit or push.