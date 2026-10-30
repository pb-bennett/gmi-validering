# Photo/FOTO workflow current-state audit

Audit date: 2026-10-30, Europe/Oslo. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`.

## Revision boundary and method

**Actual checked-out HEAD is `56fa7ebec07edb5cda8363ec635ec0c0aede2884` (`Add Gemini WFS connection workflow`), not the supplied `cc91c88` (`Add workspace-wide Gemini WFS coverage`).** The worktree was clean at the start. No checkout, reset, commit, push, production edit, test edit, dependency change or agent delegation was performed. This report is the only intended repository change.

The supplied commit exists locally. A supplemental read-only `git show`/`git diff HEAD cc91c88` inspection establishes that the photo production domain/components and `photo*`/`gmiPhoto*` tests have no differences between those revisions. Shared page, map, layer and WFS code does differ substantially. Accordingly, photo-domain findings also describe the supplied revision's unchanged photo files, but **all execution results below belong to the actual checkout**. They must not be presented as regression verification of workspace-wide WFS at `cc91c88`.

Evidence: production wiring, domain implementations, test assertions/harnesses, selected historical reports and focused execution. No external customer corpus was opened, copied, decoded or inventoried. No real coordinate lists, credentials or customer image content are reproduced here. No external standards research was performed: this is an audit of repository capabilities, not confirmation of delivery-format compatibility.

## Outcome

The workflow is substantially beyond the three early milestones. It has session-only curated FOTO layers, immutable GML/EXIF/GMI evidence, explicit source/position confirmation, manual placement and movement, manual direction editing, a three-pane workspace, a full-size zoom/pan viewer, GMI many-to-many associations and distinct point-placement occurrences sharing one original image.

The remaining gaps are not initial placement or initial GMI matching. They include the loaded-survey GMI-to-photo-folder entry, a complete bidirectional reconciliation UI, editable capture date/photographer metadata, persistence, and all delivery/export machinery. No blocking photo defect was demonstrated by the executed tests. The most consequential audit limitation is the checkout mismatch; several full-page photo browser tests also require an application URL and/or private corpus and were not executed.

## Architecture and inspected production files

Paths below are relative to the repository. Photo domain files are under `src/lib/photos/`; photo components under `src/components/photos/`.

| Responsibility | Important production files and actual ownership |
| --- | --- |
| App entry and lifecycle | `src/app/page.js`, `ProductHeader.js`, `WorkspaceShell.js`, `GlobalFileDrop.js`. Bilder is available before survey import and in the header. Page owns import/workspace/source-dialog context, active/batch selection reducer and edit hooks. The ordinary file-drop surface is disabled during photo import/workspace. Page teardown clears photos. |
| Import and curation | `PhotoCollectionDialog.js`, `PhotoCollectionPanel.js`, `photoCollectionPanel.css`, photo styles in `src/app/globals.css`; domain `imagePreview.mjs`, `photoSession.mjs`, `photoPositionSources.mjs`. Multi-file picker and local drop, thumbnail progress/error/rejections, inspection, removal selection, optional positioning GML and append collision overrides. |
| Canonical registry | `photoSession.mjs`: private `assets`, `records` and `layers` maps, job queues, source reviews, authenticated edit/workflow tickets and immutable public snapshots. `usePhotoSession.js` uses `useSyncExternalStore` and a stable empty SSR snapshot. |
| Layer presentation | `PhotoLayerCard.js`, `src/components/LayerManager.js`, `LayerTypeBadge.js`, `src/lib/layerPresentation.mjs`. Dedicated FOTO layers are combined with ordinary survey layers only for workspace presentation. They are not inserted into Zustand's survey `layers` or `layerOrder`. |
| Position evidence and projection | `photoSpatial.mjs`, `terrainPhotoGml.mjs`, `exifGps.mjs`, `photoReferenceMatching.mjs`, `gmiPhotoSource.mjs`, plus `src/lib/map/coordinateProjection.js` and existing GMI parser/decoding/lexical-evidence modules. |
| Source/position workflow | `PhotoPositioningWizard.js`, `photoPositioningWizard.css`, `PhotoGmlSummary.js`, `PhotoGmiSummary.js`; domain `photoPositioning.mjs`, `photoPositionSources.mjs`, `photoSourceReviewPresentation.mjs`, session methods. One four-stage dialog: Kilder, Koblinger, Posisjoner, Oppsummer. |
| Workspace and inspector | `PhotoWorkspaceCollection.js`, `photoWorkspace.css`, `PhotoCollectionPanel.js`'s `SelectedPhotoInspector`, `PhotoSpatialInspector.js`, `PhotoGmiInspector.js`, `PhotoOccurrenceContext.js`, `photoGmi.css`; `photoWorkspaceState.mjs`. Flat collection on left, shared map in center, selected-original/evidence inspector on right. |
| Map | `src/components/MapView.js`, `MapInner.js`, `PhotoMarkersLayer.js`, `PhotoMapController.js`, `PhotoMapPopup.js`; `photoMapFeatures.mjs`, `photoMapPanes.mjs`, `photoMarkerPresentation.mjs`, `photoPresentation.mjs`. Only visible accepted positions become markers. |
| Manual position | `usePhotoManualPlacement.js`, `PhotoManualPlacementControls.js`, `PhotoManualPlacementLayer.js`, `photoManualPlacement.css`, session tickets and `acceptManualPhotoPosition`. Proposals are page-local until explicit apply. |
| Direction | `photoDirection.mjs`, `usePhotoDirectionEdit.js`, `PhotoDirectionControls.js`, `photoDirection.css`, marker presentation and session tickets. Direction belongs to an occurrence and is independent of its position. |
| Original/full-size image | `SelectedPhotoInspector`, `PhotoImageViewer.js`, `photoImageViewer.css`, `photoImageView.mjs`. Inspector creates/revokes its original Blob URL; viewer reuses it. Map popup reuses the thumbnail. |
| Survey hyperlink presentation | `src/lib/hyperlinkFilenames.mjs`, `src/components/LayerDataTable.js`, `FilenameCopyButton.js`, `src/lib/map/featurePopupContent.mjs` and clipboard helper. Extraction/copy is separate from the FOTO association ledger. |
| Reset/shared store | `src/lib/store.js` calls `photoSession.clear()` and `geminiSession.reset()` in `resetAll`. Ordinary survey import/remove/error/view operations do not own photo resources. |

### State scope

Photo state is **session-only in a dedicated photo domain**, not persisted and not stored as ordinary survey geometry. Browser `File` objects and thumbnails are asset resources. A draft or one FOTO layer owns an asset; occurrences refer to it. Repeated point references do not duplicate the original File or thumbnail.

State is split by responsibility, not by competing coordinate authorities: canonical assets/occurrences/layers/evidence/current placement/direction/association ledgers in `photoSession`; presentation selection, filters, dialogs, staged manual/direction proposals and viewer pan/zoom in React; ordinary survey state/settings and WFS state in their separate stores/modules. Reload loses the entire photo session. There is no photo localStorage, IndexedDB, server persistence or restore path.

## Milestone-by-milestone classification

Classification vocabulary: **wired** = implemented in the real app; **limited** = implemented with stated limits; **test-only** = implementation exists but has no current product caller; **documented only** or **absent** otherwise.

| Historical item | Classification | Current evidence/limits |
| --- | --- | --- |
| M1 multi-photo import modal | Wired | Native modal with multi-file selection/drop and repeated additions. |
| M1 thumbnails | Limited | JPEG/PNG/WebP previews, bounded 320 px thumbnails. Other recognized image formats remain explicit unsupported/error records; this is not universal image decoding. |
| M1 progress | Wired | Per-preview pending/error state, completed-count message and rejection summary; EXIF status separately observable. |
| M1 selection/removal | Wired | Inspected photo and removal-dot selection are independent; select all/clear/remove. Remaining curated photos, not the dots, determine creation. |
| M1 FOTO creation | Wired | Transfers ownership without copying originals; optional GML becomes evidence only. |
| M1 multiple FOTO layers | Wired | Independent names/IDs/members/visibility/delete; newest-first presentation. |
| M1 session originals | Wired | Private assets survive modal close/transfer while owned, release on final removal/reset, disappear on reload. |
| M1 layer badges | Wired | Explicit FOTO type detection and badge/card. |
| M2 GML candidate | Wired | Narrow legacy Terrain Skråfoto parser, strict supported CRS, filename/path matching and retained invalid/unmatched diagnostics. |
| M2 GMI candidate | Wired | Matched source POINT references produce occurrence-specific candidate evidence. LINE references remain associations. |
| M2 EXIF candidate | Limited | JPEG/PNG GPS only; not general EXIF date, heading or photographer extraction. |
| M2 accept GML | Wired | Central reviewed selection and explicit final apply. Import no longer initializes current automatically. |
| M2 accept EXIF | Wired | Same explicit workflow; can replace GML/GMI/manual current deliberately. |
| M2 manual placement later | Wired, beyond early milestone | Click/keyboard proposal, drag/nudge, apply/cancel and movement of placed photos. |
| M2 camera markers | Wired | Stable occurrence IDs; current positions only, selected styling and optional selected direction arrow. |
| M2 placement/visibility controls | Wired | Placed/unplaced counts, layer visibility, source comparison/locate, manual controls and central acceptance. No unplace/reset-current control. |
| M3 left photo/folder panel | Limited | Flat per-layer thumbnail/occurrence collection; not a folder tree or disk-folder browser. |
| M3 center map | Wired | Existing Leaflet map retained, including survey coexistence. |
| M3 right inspector | Wired | Original image, file facts, position, direction, manual controls, GMI context and raw evidence. |
| M3 placed/unplaced/EXIF filters | Limited | All/placed/unplaced filter exists. EXIF count/status exists, but no EXIF-only filter. |
| M3 preview/metadata/actions | Limited | Rich preview and placement/direction actions; metadata mostly read-only, no date/photographer editor. |
| M3 add/remove | Wired | Append to existing layer, duplicate skip/individual override, confirmed occurrence or whole-asset removal. |
| M3 late GML review | Wired | Stage/save/recheck retained GML in the central source workflow. |
| M3 batch acceptance | Wired | Mixed-source reviewed batch, guarded atomic final apply; bulk source proposals only when evidence exists. |
| M3 reopen/add more | Wired | FOTO card enters workspace; workspace opens target-layer importer; import cancellation preserves owner. |

The old single-source planning/apply helpers still exist (`planPhotoPositioning`, `summarizePhotoPositioning`, `photoPositioningRequests`, session `applyPhotoPositioning`, `photoBatchCandidateRequests`, `acceptCandidates`). Searches find their callers in tests/harnesses rather than current product components. Treat these as **test-only/legacy internal APIs**, not additional active UI workflows. `applyLayerSource` remains an internal delegate of the current workflow. `PhotoGmiDialog.js` is no longer present. Source-pattern tests explicitly enforce the unified dialog and absence of direct inspector source-accept buttons.

## Precise asset, occurrence, placement and evidence model

| Required information | Current representation | Separation/limit |
| --- | --- | --- |
| Original file | Private `assets[assetId].file`; `getFile(occurrenceId)`/`getAssetFile(assetId)` | File never crosses the metadata snapshot boundary. |
| Original filename/path | `originalFilename`, `sourceRelativePath`, MIME, size, lastModified, importedAt, source | Relative path only if the File already supplies `webkitRelativePath`. Current picker has no folder-selection attribute. No absolute source-path registry. |
| GML candidate coordinate | `spatial.candidates[]`, `kind: 'gml'`, normalized position, raw entry, source/entry IDs, filename, CRS/transform diagnostics | Asset evidence shared across occurrences. Multiple retained GML sources are possible. |
| GMI candidate coordinate | `kind: 'gmi'` candidate with exact point/reference/source provenance | Occurrence-local; supported declared CRS and one source point required. Invalid point evidence is diagnostic, not accepted geometry. |
| EXIF coordinate | `kind: 'exif'` candidate and `spatial.exifRead` status | Shared GPS evidence, including raw spatial tags and CRS assumption/declaration. |
| Accepted/current coordinate | `spatial.current = { position, basis, acceptance, acceptedAt }` | One current per occurrence; normalized EPSG:4326 longitude/latitude. |
| Manual coordinate | Same current slot, `basis: { kind: 'manual' }`, `acceptance: 'manual'` | Separate from all source candidates, but no parallel manual-coordinate history/last-manual slot. Replacing current replaces it. |
| Current provenance | Candidate basis stores candidateId; retained candidate resolves source/provenance. Manual basis records manual acceptance/time. | No complete edit/undo history. |
| Bearing/direction | `direction.current = null` or `{ degrees, basis: { kind: 'manual' }, acceptance, acceptedAt }` | Occurrence-local, separately accepted from position. |
| Source heading | GML `candidate.raw.direction` text value/unit/reference | Raw evidence only; EXIF heading is not read. |
| Capture date/time | GML `raw.photographedAtText`; `photoCaptureTime()` returns the one distinct nonempty GML text, otherwise null | Not a canonical editable date. Popup can display it. File lastModified/importedAt/acceptedAt are not capture dates. |
| Photographer | No canonical field or editor | GMI attributes remain opaque source evidence, not photo metadata. |
| Associated GMI objects | Source `objectsByKey`, `references`, `associationLedger` with object/photo/reference reverse indexes; inspector projection | Many-to-many, source/revision scoped. Not a binding to a loaded survey layer or WFS feature. |
| Duplicate/repeated group | Derived `repeatGroup`, stable `assetId`, occurrence provenance/key; `gmiRepeatedPhotoReferences()` | Represents shared asset/object edges and occurrence counts; no persisted universal duplicate-reference group entity or content-hash deduplication. |

### Acceptance and precedence

1. Import, GML attachment and EXIF completion do not set current. GMI source confirmation saves links and occurrence/candidate evidence but does not accept positions. Source checkpoint and final position checkpoint are distinct; closing after the first retains the saved evidence.
2. The unified review uses usable retained evidence. Already placed photos default to **keep current**, including manual/GML/EXIF/GMI placements. No source arrival overwrites them.
3. An unplaced occurrence with exactly one valid occurrence-specific GMI option defaults to that **proposal**, even with GML/EXIF alternatives. This is not acceptance or an accuracy claim. Multiple GMI options require a decision. Otherwise exactly one usable total option defaults to a proposal; multiple options do not select a winner.
4. With both GML and EXIF, both remain available and inspectable. Without GMI and with two usable options, the user chooses one or uses a bulk proposal. Mixed choices can be accepted in one final transaction. Same-position source switching is possible and deliberately changes provenance. Approximate horizontal place/move/same comparison uses a 0.01 m threshold.
5. With neither source, the photo stays unplaced unless usable GMI evidence exists or the user manually places it. No marker is created merely because a File exists.
6. Final source-position apply preflights a session-issued workflow/plan, live owner/membership/source set, reviewed current identity, exact live candidate identity and geographic validity before writing anything. A stale/invalid batch writes nothing. Late metadata does not silently expand frozen review choices; explicit refresh is available and preserves valid deliberate choices.

Users can accept a candidate, later replace it with another, manually place, manually move an already placed occurrence, and separately zoom to current/GML/EXIF/GMI viable positions. Inspector source acceptance now opens the central workflow rather than applying directly. Manual proposals are not current until applied; cancel/Escape leave current intact. Layer hiding, removal, reset and competing edit transactions invalidate tickets. **There is no reset-to-unplaced, restore-prior-manual or general undo operation, and no clear-to-unknown direction action.**

Manual placement uses capture-phase map handlers to avoid survey/measure click ownership conflicts. Map click or Enter at map center proposes; the orange marker supports drag and arrow-key adjustment, with a larger Shift step. Pan/box-zoom gestures are rejected as placement clicks. Position and direction proposals invalidate each other, but accepted position and direction are independent and survive subsequent source changes.

### Geometry and source constraints

Terrain GML accepts a narrow namespace/profile, not arbitrary Norsk Vann GML. It preserves raw IDs, photo link, date, direction and geometry/CRS evidence. Supported source CRS includes EPSG:5972/25832/25833; only horizontal position is transformed and raw height is retained as evidence. XML size, DOCTYPE/entity, geometry, dimensional and CRS conflicts are checked.

GMI photo source parsing uses the production decoder/parser and lexical evidence, a 10 MiB guard and exact-byte SHA-256 fingerprint (exact-byte fallback without secure-context Web Crypto). GUID identity is used only when unique within the source; missing/duplicate GUIDs use source collection/index identity with diagnostics. Type/DFOT/TEMA does not gate hyperlink association or point placement. LINE references do not infer a midpoint, vertex, centroid or camera direction.

EXIF uses lazy `exifr` with a GPS-only allowlist, actual JPEG/PNG header checks, DMS/ref and datum validation, explicit absent/invalid/error distinctions and a warning for zero/zero. Altitude/quality tags can remain raw evidence; they do not add an accepted vertical coordinate. EXIF rotation/orientation, timestamp and heading tags are not read by this helper.

## GMI/hyperlink integration and association

| Capability | Actual state |
| --- | --- |
| Extract filenames from GMI | Wired shared `extractHyperlinkFilenames`/source parts and occurrence parser. Handles wrapper grammar and preserves lexical occurrence evidence; copy presentation deduplicates names while source occurrences retain all members. |
| Copy filenames | Wired in ordinary Data Table S_HYPERLINK cells and map object popup, with local clipboard feedback/errors. Raw source attributes are retained. |
| Match imported photos to S_HYPERLINK | Wired in FOTO source workflow through `parseGmiPhotoSource` and `reviewGmiPhotoSource`. This is actual reconciliation, not merely filename extraction. |
| Matching rules | Owner-layer relative path, collision-checked suffix and unique basename resolution; case/NFC fallback. Duplicate imported candidates stay ambiguous. Unsafe/remote/traversal references are not fetched or guessed. GML's repeated-reference matching deliberately rejects contested edges; GMI's ledger intentionally permits many object edges to one asset. |
| Place from GMI referenced points | Wired via source-scoped point occurrences/candidates and explicit position confirmation. Lines provide association only. |
| Missing GMI files | Limited: unmatched-reference count and reference rows say no match in this FOTO layer. This is evidence about imported assets, not proof that a file is absent from disk. No disk namespace scan. |
| Unreferenced folder photos | Limited: ledger reverse indexes allow computing imported assets with no associations, but no dedicated GMI unreferenced-photo list/filter/action or folder scan is wired. GML separately has an `unmatchedPhotoIds` ledger; do not confuse it with GMI folder reconciliation. |
| Same reference/photo on multiple objects | Wired source ledger and repeated-reference presentation. Repeated members within one object retain lexical refs but share one object/asset edge. |
| Preserve multiple intended positions | Wired: distinct referring POINT objects/revisions produce distinct occurrences sharing one asset. Even coincident positions retain identities. Removal of one does not delete the shared original or recreate the dismissed occurrence on recheck. |
| Group repeated references | Wired derived asset/occurrence/object context in collection, inspector, wizard and popup; not a dedicated duplicate-resolution workspace. |
| Table/popup reference display | Wired shared filename-copy presentation. It does not navigate to a matched imported image from an ordinary survey object's popup/table. |
| Create FOTO from loaded GMI references | Absent product entry. Current journey imports photos into a FOTO layer, then separately picks a GMI source. No loaded-GMI Add photos/folder workflow or reuse of the survey's original byte identity. |
| VA object associations | Wired many-to-many imported-GMI object evidence and inspector. No arbitrary association editor, manual object picker, loaded-layer object binding, map-object navigation/highlight, WFS association or relationship export. |

Association source removal removes the retained source/links, but preserves established occurrence/current data and historical candidate provenance. A detached GMI candidate is excluded from new central source-position options; reattaching exact source bytes can restore the option without multiplying occurrences. The inspector can still show historical evidence. This is not a source-removal undo or a global association cleanup operation.

The deferred **Validator duplicate-reference warning is not implemented**. `gmiPhotoSource.mjs` has an explicit TODO and a reusable source-scoped repeat projection. Photo-workspace repeat notices are already implemented; they are not that Validator rule. Existing validation policies about attachment presence or prohibited links are separate.

## Direction and metadata

Direction is operational, not merely planned. New occurrences start unknown (`direction.current === null`), and stored unknown is never implicitly converted to north. The editor's initial proposal uses accepted degrees or zero; only explicit Apply makes zero known north. Domain normalization accepts finite numbers, wraps modulo 360 and rounds to integer degrees. UI has a 0–359 native slider, numeric integer field, ±1 degree actions, cardinal label, apply and cancel. Invalid/empty input disables apply.

Only the selected workspace marker shows a heading arrow: blue accepted, orange proposed. Unselected/unknown markers do not show a north arrow. Rotation is applied to an internal SVG group, preserving Leaflet's geographic anchor/outer transform. GML direction remains raw text; there is no normalized GML heading acceptance path, no EXIF heading reading and no inferred GMI direction.

Direction data is serializable domain state with provenance, but **not export-ready delivery data**: `buildPhotoMapFeatures` includes only kind/layer/photo IDs and geographic point geometry, without direction/date/photographer. There is no delivery CRS/unit/reference mapping or serializer consuming direction.

Per-photo editable information currently means placement and direction. Filename, size, MIME, dimensions and file modification time are read-only facts. There is no rename, capture-date/custom-date, photographer, path or source-metadata editor. GML date text is preserved, not normalized into a validated date/time/timezone model. EXIF date/artist is not extracted. No date/photographer defaults, validation, normalization or batch setters exist.

Batch actions are removal selection/select-all/clear, confirmed occurrence/whole-asset removal, source proposal buttons and reviewed mixed-position acceptance. Bulk source proposals operate on visible reviewed rows and only appear for usable source kinds; manual placement/direction remain per occurrence. Workspace selection is distinct from wizard source-position choices. Append target collisions are skipped by default using filename/case/NFC comparison with an individual explicit override; neither this nor repeated-reference grouping hashes photo content. All accepted edits remain session-only.

## Workspace/preview UX: current behavior and gaps

| Earlier feedback | Current implementation and remaining gap |
| --- | --- |
| Cluttered left panel | Advanced source inventory is now collapsed under Kilder og koblinger, with nested per-source details and `max-height: 30vh` scrolling. Header/source/batch areas remain above a scrolling flat list. This mitigates clutter; many expanded sources and repeated occurrence rows can still consume substantial vertical space. No folder grouping, search, EXIF filter or list virtualization. |
| Wider inspector | Implemented: desktop width `clamp(460px, 30vw, 520px)`, versus a 280 px left pane. Width becomes 300 px at 701–1200 px viewport widths. At 1920 px wide the nominal center is 1120 px and inspector 520 px, before minor borders. This is a CSS calculation, not a fresh 1920×1080 visual acceptance measurement. |
| Larger/max-size preview | Implemented in workspace via Vis stort. Image-only native dialog fills viewport minus 32 px (16 px on narrow screens). Import inspector does not enable the large-view control. |
| Zoomable full-size view | Implemented: fit, 100%, buttons, cursor-anchored wheel zoom, bounded pan/drag, resize observation, close/Escape/focus restoration. Uses original, not enlarged thumbnail; zoom cap 8×. |
| Marker improvement | Dedicated camera SVGs, selected size/color, proper center anchor, selected heading arrow and explicit panes are implemented. Subjective visual quality still needs user review. Coincident occurrences overlap; no spiderfy/cluster/overlap chooser. Collection selection is the reliable fallback. |
| Zoom to EXIF/GML | Implemented per viable candidate in inspector, independent of current selection basis. Locate can use evidence from a hidden layer without changing visibility/current. |
| Selected-photo/map synchronization | Collection/marker selection drives active inspector and selected icon. A marker in the active workspace selects its occurrence. Collection selection does not automatically pan or scroll into view; explicit locate is available. Batch checkboxes do not change active inspection. |
| Marker click | Outside active layer workspace, compact thumbnail popup opens; its action enters workspace at that exact photo. Inside the active workspace a click selects without popup. Placement mode suppresses normal photo activation. Keyboard activation is supported. |
| Normal/short/narrow layouts | CSS has a 1200 px width breakpoint, 700 px height adjustments and stacked layout at 700 px width or below, with mobile map/image heights. Existing photo browser tests assert desktop/short/narrow layouts. Most full-page photo tests skipped in this audit, so fresh 1080p/photo-layout visual approval is not claimed. Real map/sidebar/WFS coexistence did execute. |

Other clear limitations: no current-position reset or direction-clear action; no association ambiguity chooser; no direct loaded GMI-to-photos entry; unsupported formats remain inspectable error records rather than decodable originals; no session recovery. These are documented capability gaps, not fixes made during this audit.

## Export status

**No photo exporter exists in current production code or tests.** There is no serializer, photo-export UI, downloadable GML generation, attachment-folder/ZIP packaging, manifest/collision policy, export schema, XSD validation fixture or Gemini import round-trip test. `terrainPhotoGml.mjs` is an input parser, and its browser-generated GML strings are input fixtures, not an exporter or validated output schema.

The intended Norsk Vann/GMI-compatible georeferenced-photo delivery, coordinates plus direction/date/photographer, `.gml` plus photo attachments, Gemini VA import and any Terrain fallback are documented targets only. Current coordinates and manual direction are useful foundations, but date/photographer have no accepted metadata model, vertical coordinates have no accepted output model, direction reference/unit mapping is unresolved, and attachment naming/repeated-occurrence serialization has no implementation. Existing source object associations are not exported relationships. No claim of Gemini VA or Terrain output compatibility can be made from accepting a legacy Terrain input profile.

## Real-corpus modes and privacy boundary

No `PHOTO_UI_URL`, `PHOTO_GML_FIXTURE`, `GMI_PHOTO_CORPUS` or `GMI_PHOTO_EKENES` was configured for the controlled runs. No guessed private path was probed. Chrome was detected through the existing harness's installed-browser paths; the synthetic XML/EXIF browser test ran.

| Variable/harness | Current assumptions and coverage |
| --- | --- |
| `CHROME_PATH` / `tests/helpers/chromeHarness.mjs` | Optional executable override, otherwise standard installed Chrome/Chromium paths. Headless CDP, isolated temporary profile, no personal profile. |
| `PHOTO_UI_URL` | Existing running app URL for full-page React/Leaflet photo acceptance, commonly opened with `?testmodus=1`. Those tests do not start Next themselves. No app server was started in this audit. |
| `PHOTO_GML_FIXTURE` | Legacy photo GML file; sibling `Attachments` directory with JPEGs. `terrainPhotoGml.test.mjs` enables external mode only if the configured path exists; its index filters `.jpg`, whereas several UI cases accept `.jpg`/`.jpeg`. Real assertions are intentionally pinned to 148 matches/EXIF candidates and 136 distinct geographic positions. |
| `GMI_PHOTO_CORPUS` | External recursive GMI/attachment corpus for production adapter/ledger integrity checks and optional private G01/G04 browser tests. Owner scope is the GMI delivery directory, not the entire dump as one basename namespace. |
| `GMI_PHOTO_EKENES` | Separate optional Ekenesstokken root for point-occurrence reconciliation. It is not interchangeable with a GML fixture path. |
| `PHOTO_SCREENSHOT_DIR` | Optional screenshot output; not set here. Enabling against private photos can capture their content. |
| `GMI_PLACEMENT_HASH_DIR` | Optional external corpus hash/findings artifacts; not set here. These can contain paths/source findings. |
| Synthetic data | `photoGpsFixtures.mjs` supplies generated JPEG/PNG EXIF/no-GPS/malformed bytes; `gmiPhotoFixtures.mjs` supplies synthetic minimal parser inputs and intentionally pinned reference literals. Domain tests often inject mock thumbnail/GPS/GML adapters. The browser XML test supplies real DOMParser and installed exifr; WFS UI harnesses use synthetic responses and a manually placed synthetic photo. |

Previous real-corpus integration is still present and structurally usable given Chrome, a matching running app and the expected external corpus shape. It is **not revalidated here**. Ekenesstokken's historical 148 GML matches/148 EXIF candidates/136 positions describe that GML/photo delivery, not matching GMI references: later reports and optional corpus tests distinguish the older GMI's unmatched reference set from the newer 148-photo folder. Do not infer all 148 match that GMI.

The optional GMI corpus tests hash originals for integrity, and browser tests may decode private images. They were left skipped; synthetic coverage does not substitute for a renewed real-corpus acceptance claim.

## Interaction with Gemini WFS

### Executed checkout (`56fa7eb`)

- FOTO remains a separate domain. `getLayerType` returns explicit FOTO before considering format metadata; `getGeminiSurveySources`, `getGeminiExtent` and session survey lookup accept only GMI/SOSI/KOF survey sources. Photo candidates/markers are not WFS extent inputs.
- Current WFS is selected-survey-source retrieval, not workspace-wide coverage. Store binding subscribes to survey-store changes and reconciles source ownership/revision; it does not subscribe to photoSession or fetch on photo changes. WFS presentation owns reference visibility/explicit zoom separately.
- WFS reference pane is 380 and noninteractive, below survey highlight casing 390, vectors 400, point marker pane 600 and FOTO markers 620; manual photo proposal/connector is 640, tooltips 650, popups 700. At this HEAD WFS has no feature popup/hover ownership. Live browser assertions proved camera hit-testing and normal popup still work above references.
- Photo markers render only accepted, visible current positions. `PhotoMapController` performs one initial photo-only fit when appropriate, avoids first all-manual fit and defers to survey presence or explicit locate. Candidate/current locate sets an explicit geographic view at zoom 18. WFS explicit fit uses only its reference bounds; neither writes photo positions. View changes do not fetch.
- Map components use React-Leaflet `useMap`; there is **no WFS current-map getter module at this checkout**. No photo feature commandeers a global map getter.
- Ordinary survey removal preserves photos; full reset clears both domains and rejects late work. WFS disconnect/reference toggles/refresh preserve photos. Actual store and real React/Leaflet tests passed these seams.

### Supplemental source inspection of supplied `cc91c88` (not executed)

`src/lib/gemini-wfs/geminiExtent.mjs:isGeminiSurveyLayer` expressly requires survey-domain types, getLayerType GMI/SOSI/KOF and source geometry. An explicit FOTO type fails even if data mimics a survey. Workspace session iterates survey-store layers through that predicate. **The supplied workspace-wide revision still excludes FOTO as an automatic survey coverage source.** A user-requested map-area query is a separate viewport operation, not a scan of FOTO coordinates.

`geminiMapViewport.mjs` at that revision stores a bounds getter, bound in `GeminiReferenceLayer` through `useEffect(() => bindGeminiMapViewport(() => map.getBounds()), [map])`. Cleanup clears only the same getter, avoiding stale cleanup deleting a replacement. It reads live Leaflet bounds on demand; photo modules do not bind it. Store subscription at that revision observes `state.layers !== previous.layers` before reconciliation. Photo edits remain in the separate photo session.

Later WFS popup/semantic rendering and shared map changes are present only in that commit's source, not in the executed checkout. Therefore no execution-based claim is made about their popup/hover/zoom or workspace-wide lifecycle behavior. Re-run the shared/browser selection on the intended checkout before treating this report as acceptance of those changes. No branch switch was needed or performed to establish the source-level exclusion.

## Tests: inventory and what they prove

Paths in the following tables are under `tests/`. All are current files, not inferred from old reports. Unit suites frequently use injected adapters and synthetic geometry; a unit pass is not proof of full browser rendering.

### Node/domain and source contracts

| File | What its assertions establish |
| --- | --- |
| `photoSession.test.mjs` | Immediate ordered registration, duplicate identities, append/selection, sequential thumbnail scheduling, classification errors, URL release, cancellation and no late resurrection. |
| `photoPreviewLifecycle.test.mjs` | Preview classification, bounded size, alpha handling, canvas/Blob resource ownership and cleanup across decode/encode/error/cancel, using instrumented browser primitives. |
| `photoImportLayers.test.mjs` | Inspection versus removal selection, curation order, creation membership/ownership transfer, multiple layers, counts/visibility and in-flight resource deletion. |
| `photoAppendDuplicates.test.mjs` | 148/142 synthetic arithmetic, six eligible appends, default filename skips, individual override, case/NFC, distinct same-name assets, cancellation and metadata races. No real corpus is required. |
| `photoSpatial.test.mjs` | Immutable candidates/current, explicit acceptance, EXIF-only unplaced state, ownership, asynchronous field preservation, staged GML transaction and rematching. |
| `photoSpatialProjection.test.mjs` | Strict horizontal projection, raw height/geometry preservation and unsupported/nonfinite/failed/invalid-geography rejection. |
| `exifGps.test.mjs` | Installed exifr parses generated actual JPEG/PNG GPS including endian variants; absent versus malformed/unsupported data, hemisphere/datum/quality tags and questionable zero. |
| `photoReferenceMatching.test.mjs` | Safe path/basename/case/NFC matching, ambiguity rather than greedy assignments, literal filename behavior and no traversal/remote/fuzzy guessing. |
| `photoMapFeatures.test.mjs` | Visible current-only features, stable separate colocated identities, coordinate order and owner-scoped candidate/current locate without mutation. |
| `photoWorkspace.test.mjs` | Active/batch reducer independence, append/late source lifecycle, conflicts and reversible acceptance, duplicate/recheck sources, confirmed removals/empty layers and canceled late work. Also exercises lower-level legacy APIs. |
| `photoWorkspaceUx.test.mjs` | Image fit/pan/anchor zoom math and new-evidence review counts. No rendered layout or subjective UX proof. |
| `photoPositioning.test.mjs` | Retained older single-source plan/apply APIs, eligible selection, summaries, place/move/same, preflight atomicity, duplicate source reuse and stale guards. These are not the current wizard's product call path. |
| `photoSourceWorkflow.test.mjs` | Current two-checkpoint workflow, mixed-source atomic apply, evidence-only import, keep-current, async/frozen choices, cancellation/stale/forged review rejection and source contracts enforcing one dialog/no direct inspector apply. |
| `photoGmiDefaults.test.mjs` | Occurrence-specific valid GMI proposal preference, 30 rows, invalid/removed/missing provenance exclusions, ambiguity and explicit-choice preservation; available source action projection. |
| `photoManualPlacement.test.mjs` | Manual current without fake candidate, apply-once/count updates, movement/cancel/source switching, stale/foreign/hidden/removed tickets and late-reader independence. |
| `photoDirection.test.mjs` | Unknown versus north, wrapping/rounding/finite guards, manual provenance, apply/cancel, independent accepted state, edit competition/staleness and icon anchors/arrow omission. |
| `gmiPhotoAssociations.test.mjs` | Production hyperlink grammar and parser, source-scoped many-to-many ledger, owner matching/ambiguity, source fingerprints/revisions, recheck/pruning/stability and no overwrite of position/direction/resources. Pinned literals are not proof that private files were opened. |
| `gmiPhotoPlacements.test.mjs` | Repeated POINT occurrences, exact provenance, LINE-only association, invalid geometry/CRS, per-occurrence manual/direction state, source/recheck/dismissed-removal lifecycle and shared-resource cleanup. |
| `photoResetIntegration.test.mjs` | Real Zustand reset/survey actions with actual photo singleton: domains remain independent, full reset clears links/current/direction/resources and invalidates pending work. |
| `hyperlinkFilenames.test.mjs` | Shared extraction/copy-name semantics and malformed wrappers, independent of actual photo attachment resolution. |

### Browser/React/Leaflet and optional corpus files

| File | Execution gate and actual proof |
| --- | --- |
| `terrainPhotoGml.test.mjs` + `browser/photoSpatialChecks.mjs` | Needs Chrome, starts its own local static server. Actual DOMParser, strict Terrain input/CRS/error cases, real browser File/exifr and session integration. Optional `PHOTO_GML_FIXTURE` adds pinned 148/136 corpus assertions. **Ran synthetic mode: one Node test passed, seven internal checks.** |
| `photoDialogLayout.test.mjs` | Chrome + PHOTO_UI_URL. Rendered importer empty/populated/new/append modes, desktop/short/narrow geometry and reachable panes. Skipped. |
| `photoPositioningUi.test.mjs` | Synthetic full-app two-checkpoint/mixed-source/recheck/cancel/layout case needs Chrome + app URL; separate 148-photo case also needs GML corpus. Both skipped. |
| `photoDirectionUi.test.mjs` | Chrome + app URL; generated images/GML fallback without corpus. Slider/input, cardinal SVG geometry, connector anchors, explicit edits, source independence/lifecycle and layouts. Skipped. |
| `gmiPhotoAssociationsUi.test.mjs` | Synthetic full-app association/cancel/recheck/revision/append/many-to-many/layout case needs app URL; private G01/G04 case also GMI_PHOTO_CORPUS. Both skipped. |
| `gmiPhotoPlacementsUi.test.mjs` | Synthetic full-app repeated occurrences, both checkpoints, shared image URL, exact object context, independent manual/direction, removal, survey pane ordering. Needs app URL; skipped. |
| `photoManualPlacementUi.test.mjs` | App URL + GML corpus + Chrome. Click/drag/keyboard placement/movement, safety, sources/direction and layouts. Skipped; no synthetic fallback at this file's gate. |
| `photoWorkspaceUi.test.mjs` | App URL + GML corpus + Chrome. Popup entry, active/batch selection, append/removal, late sources, lightbox fit/zoom/pan/wheel/URL reuse, layouts and reset/reload. Skipped. |
| `photoSpatialUi.test.mjs` | App URL + GML corpus + Chrome. 148 markers, evidence switching/locate, visibility, GMI/SOSI/KOF coexistence, reset/reload. Skipped. |
| `photoAppendDuplicatesUi.test.mjs` | App URL + GML corpus + Chrome. Real 148→142→148 append correction, all-existing guard/override and card geometry. Skipped. |
| `gmiPhotoCorpus.test.mjs` | Optional GMI_PHOTO_CORPUS. Actual adapter/ledger, pinned reference totals/revisions and unchanged file hashes. Skipped. |
| `gmiPhotoPlacementCorpus.test.mjs` | Two optional tests for GMI_PHOTO_CORPUS and GMI_PHOTO_EKENES. Inventory/hash integrity, source point occurrence reconciliation, proposal/source-action counts; uses lightweight asset identities rather than image decode. Both skipped. |

There are no photo export tests. `photoDialogLayout.mjs` and `photoSourceWorkflow.mjs` are test helpers, not product features. Chrome harness uses temporary profiles and CDP. Synthetic fixture modules are generated/instrumented inputs; many tests bearing “real pinned” in their titles test known literal grammar with synthetic envelopes, not private image content.

### Shared layer/map/store selection

- `layerPresentation.test.mjs`: explicit types including FOTO and presentation-only composition, without polluting survey selectors/order.
- `layerOrder.test.mjs`: authoritative survey ordering and marker offsets.
- `layerHighlightHalo.test.mjs`, `layerHighlightPanel.test.mjs`: survey highlight/panel contracts and noninterference; not image workflow tests.
- `mapPaneToolbar.test.mjs`, `mapBackgroundControl.test.mjs`: shared map-control modes/visibility contracts.
- `featureHoverTooltip.test.mjs`, `featurePopupContent.test.mjs`: survey hover timing/ownership, safe popup DOM and hyperlink filename controls.
- `geminiExtent.test.mjs`: supported survey geometry extent/projection/safety and explicit FOTO rejection at this checkout.
- `geminiSession.test.mjs`, `geminiStoreLifecycle.test.mjs`: actual session/store ownership, revision/reset/abort guards, photo changes/removal independence and no unsolicited requests.
- `geminiReferencePresentation.test.mjs`: reference visibility/bounds/zoom intent independent of source data.
- `geminiWorkflowUi.test.mjs`: source chooser excludes FOTO/WMS/reference/unknown types, including FOTO with GMI-shaped data; app modal/callback contracts.
- `geminiReferenceBrowser.test.mjs`: actual bundled MapInner/LayerManager/React/Leaflet with synthetic data; pane ordering, photo click/popup, toggles/zoom/no fetch, retained/replaced reference lifecycle and shared reset.
- `geminiWorkflowBrowser.test.mjs`: actual form/card/map workflow in a synthetic local bundle; explicit fetch/refresh/disconnect, source choices excluding photos, photo/view changes causing no requests and preservation of photo/WMS/survey state. No live provider or customer credentials.

### Exact execution results

Controlled authoritative selections (Node totals count nested subtests where present):

| Invocation | Files | Tests | Passed | Failed | Skipped | Cancelled / todo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Photo/domain plus directly shared layer/map/store/presentation selection | 44 | 337 | 323 | 0 | 14 | 0 / 0 |
| `node --test --test-concurrency=1 tests/geminiReferenceBrowser.test.mjs tests/geminiWorkflowBrowser.test.mjs` | 2 | 28 | 28 | 0 | 0 | 0 / 0 |
| `node --test tests/geminiWorkflowUi.test.mjs` | 1 | 6 | 6 | 0 | 0 | 0 / 0 |
| **Total across these disjoint selections** | **47** | **371** | **357** | **0** | **14** | **0 / 0** |

First invocation was run as this PowerShell selection, with no corpus/app environment configured:

```powershell
$auditTests = @(Get-ChildItem tests -File | Where-Object {
  $_.Name -match '^(photo|gmiPhoto|terrainPhotoGml|exifGps|hyperlinkFilenames|layerPresentation|layerOrder|layerHighlight|mapPaneToolbar|mapBackgroundControl|featurePopupContent|featureHoverTooltip|geminiExtent|geminiSession|geminiStoreLifecycle|geminiReferencePresentation).*\.test\.mjs$'
} | ForEach-Object { $_.FullName })
node --test --test-concurrency=1 @auditTests
```

Logs outside git: `%TEMP%\gmi-photo-audit-regression.log`, `%TEMP%\gmi-photo-audit-wfs-browser.log`, `%TEMP%\gmi-photo-audit-wfs-source.log`. All three controlled invocations exited zero. Temporary browser/bundle servers were managed by their existing harness cleanup. No full build, unrelated suite, live WFS query or private corpus run was needed for the checked-out audit.

Coverage gaps: full-page photo browser acceptance was not rerun; real corpus numbers are historical assertions, not current measurements. Most domain tests inject adapters, so use the executed browser XML/exifr test for actual parsing confidence. Fresh 1920×1080 workspace stress/visual review, large repeated/overlapping-marker accessibility, folder namespace reconciliation, loaded GMI reuse/binding, metadata editing/persistence and export round-trip are not established. Features absent from product naturally have no complete end-to-end tests. Tests for older single-source APIs should not be mistaken for current wizard coverage. The later `cc91c88` shared architecture was source-inspected but not executed.

## Reports and stale documentation

Historical reports remain untouched. Their claims describe their own implementation boundaries; they are not a current feature inventory.

| Relevant report(s), under `docs/agent-reports/` | Current assessment |
| --- | --- |
| `20261005-photo-filename-copy.md`, `20261005-photo-filename-copy-correction.md` | Shared table/popup extraction/copy remains relevant. These do not describe FOTO reconciliation. Later occurrence grammar expands source evidence beyond deduplicated copy names. |
| `20261005-photo-milestone1-planning.md`, `20261005-photo-milestone1-implementation.md` | Useful ownership/preview origin; one loose collection/nonspatial scope is superseded by layers, placement and workspace. |
| `20261005-photo-import-and-layer-milestone.md` | Curation, separate selection, multiple FOTO layers and badges remain; later append policy and candidate-only import refine it. |
| `20261006-photo-spatial-milestone-planning.md`, `20261006-photo-spatial-milestone-implementation.md` | Candidate/current separation and parser constraints remain. “GML initializes current at creation” and direct inspector acceptance are stale: current import is evidence-only and central confirmation is required. Manual/direction/export deferrals cannot all be carried forward as present facts. |
| `20261006-photo-workspace-implementation.md` | This is a long accreted report with later corrections: larger inspector, image viewer, positioning wizard and append policy already appear there. Early inline acceptance/filter descriptions and its final recommendation to implement manual placement are superseded. Current central wizard is four-stage/mixed-source, and current filter has no EXIF-only option. |
| `20261006-photo-manual-placement-implementation.md` | Transactional manual placement/movement remains implemented; it resolves the earlier “manual later” recommendation. |
| `20261008-photo-direction-implementation.md` | Unknown/north distinction, manual direction controls and selected arrow remain accurate. No metadata/export was implemented by that milestone; later GMI associations now exist. Its historical real-corpus acceptance is not a new result here. |
| `20261008-gmi-photo-source-audit.md`, `20261008-gmi-photo-corpus-audit.md` | Important historical grammar/namespace/corpus observations, not present implementation status or evidence that the 148 newer photos match the older GMI. Any association-only/no-GMI-position recommendations were superseded. No real corpus was reread for this audit. |
| `20261008-gmi-photo-associations-implementation.md` | Ledger/source identity/matching remains relevant. “No GMI geometry as position” and separate GMI dialog are stale; point occurrences and unified wizard now exist. |
| `20261019-photo-unified-source-workflow-planning.md` | Slice 1 is implemented, not future work. Its association-only GMI placement prohibitions are superseded by the later point-placement correction. Slice 2 loaded-layer/folder integration remains unimplemented. |
| `20261019-photo-unified-source-workflow-slice1-implementation.md` | Two checkpoints, mixed choices, unified entry and evidence-only import remain accurate. Its earlier GMI association-only boundary is refined by the correction. |
| `20261019-gmi-photo-placement-correction.md` | Asset/occurrence separation, POINT versus LINE rules, repeated placement preservation and shared resources remain accurate. Later default proposal behavior refines initial review UX. |
| `20261020-gmi-photo-defaults-and-marker-ordering.md` | Most current photo behavioral report: GMI proposal defaults, keep-current, refresh/explicit-choice preservation, immediate GMI position review and panes 620/640 match code. Its explicit “Slice 2 was NOT implemented” remains accurate. Prior pass counts/baseline failures are historical, not this audit's totals. |
| `20261028-gemini-wfs-m3-session-fetch-implementation.md`, `...m4-map-reference-implementation.md`, `...m5-connection-workflow-implementation.md` | Describe the checked-out selected-source WFS generation. The supplied revision's later workspace coverage report is available through git, not in this checkout's filesystem. |

No active missing-export stub was found. The main stale/dead surface is retained test-only single-source APIs plus historical recommendations that are already implemented. Source removal retaining historical candidate provenance is intentional and tested; it should not be reported as evidence deletion. No bug was fixed or historical report rewritten.

## Concise current-state matrix

| Area | Current state | Evidence/files | Gaps |
| --- | --- | --- | --- |
| Import | Wired multi-file/drop, progress/errors, optional GML | PhotoCollectionDialog, imagePreview, photoSession | No real folder picker/loaded GMI entry; preview formats limited |
| Curation | Wired inspect versus remove selection, default append skips/override | PhotoCollectionPanel, photoAppendPolicy | Filename collisions are not content identity |
| FOTO layers | Wired multiple independent session layers, badges/visibility/delete | PhotoLayerCard, LayerManager, layerPresentation | No persistence |
| GML/GMI candidates | Wired immutable source evidence; GMI POINT per occurrence | terrainPhotoGml, gmiPhotoSource, photoSpatial | Narrow GML profile; no line position inference |
| EXIF placement | Wired GPS evidence and explicit acceptance | exifGps, PhotoPositioningWizard | JPEG/PNG spatial metadata only |
| Manual placement | Wired proposal/apply/cancel/move/keyboard | PhotoManualPlacementLayer/Controls, session | No unplace/undo/history |
| Workspace | Wired collection/map/inspector | page, WorkspaceShell, PhotoWorkspaceCollection | Flat list, no EXIF filter/search/folder grouping |
| Inspector | Wired wider original/evidence/direction/object context | SelectedPhotoInspector, PhotoSpatialInspector | No general metadata editor; long evidence can crowd |
| Map markers | Wired accepted/current, explicit panes, active sync, popup | PhotoMarkersLayer, photoMapFeatures | Exact overlaps; no clustering/chooser |
| Metadata | Read-only file facts, raw GML date/GPS evidence | photoSession, photoPresentation | No canonical capture/custom date or photographer |
| Batch actions | Wired remove/whole asset, mixed-source proposals/apply | workspace collection, positioning wizard | No date/photographer/direction batch edit |
| Direction | Wired manual bearing/provenance and selected arrow | photoDirection, PhotoDirectionControls | No EXIF/GML heading acceptance, clear or export |
| GMI reconciliation | Wired FOTO-owned reference matching/review | gmiPhotoSource, PhotoGmiSummary | No loaded-layer/folder import, full missing/orphan UI |
| Duplicate references | Wired many-object edges and separate point occurrences | occurrence/repeatGroup model, PhotoOccurrenceContext | Validator warning deferred; no manual ambiguity resolution |
| Preview UX | Wired original inspector and near-fullscreen zoom/pan viewer | PhotoImageViewer, photoImageView | Large viewer workspace-only; overlapping map markers remain |
| Export | Absent; target documented only | Input parser/fixtures are not output | Serializer/schema/package/import round-trip all absent |
| Object association | Wired source-scoped imported GMI many-to-many | associationLedger, PhotoGmiInspector | No arbitrary picker, loaded survey/WFS binding or relationship export |
| Tests | 357 passed, 0 failed, 14 skipped in selected runs | 47 files, logs above | Full-page/private corpus and later WFS revision not reaccepted |

## Recommended next milestone: loaded-GMI photo-folder import and reconciliation

**Goal:** starting from an already loaded GMI survey layer, let the user add its photo delivery folder, review what matches and what is missing/unreferenced, and create or append to a FOTO collection using the existing association/occurrence/explicit-placement machinery.

Why next: most difficult matching and repeated-placement domain behavior is already implemented and tested. The current user must create FOTO first and select the GMI again; ordinary table/popup filenames do not complete that journey. Closing this concrete workflow gap provides immediate value without treating existing matching/manual/direction capabilities as unfinished foundations. Export would currently require several separate model/schema/packaging decisions, while general visual polish would not resolve the duplicate source-import journey.

Scope:

- Add a discoverable photo action on a loaded GMI survey layer and a folder/multi-photo curation path retaining relative paths.
- Establish exact loaded-source revision/byte provenance and an explicit binding to that initiating survey instance. Reuse a shared photo-source evidence adapter; do not infer identity from filename, GUID alone, projected map geometry or current display filters.
- Review owner-scoped confident/ambiguous/unmatched references and imported unreferenced assets with honest labels: missing from the chosen delivery scope, not missing from disk globally. Make inclusion of unreferenced images explicit.
- Create/append FOTO assets plus associations/occurrences as one reviewed ownership transaction, then continue to the existing explicit position checkpoint. Preserve repeated POINT occurrences, LINE-only links, current/manual/direction values and default duplicate-skip policy.
- Preserve cancellation/staleness guarantees if the initiating layer is deleted/replaced, source bytes/revision change, folder selection is canceled or the target FOTO membership changes.

Likely files: `src/components/FileUpload.js` and its current byte-read boundary, `src/lib/store.js` layer lifecycle seam, `LayerPanel.js`/`LayerManager.js`, `src/app/page.js`, `PhotoCollectionDialog.js`, `PhotoWorkspaceCollection.js`, `PhotoPositioningWizard.js`, `photoSession.mjs`, `gmiPhotoSource.mjs`, `photoReferenceMatching.mjs`, with a new narrowly scoped session source-input/binding helper if required. Existing GMI parsing/decoding should be reused. A new test should prove the loaded-source flow rather than expanding legacy single-source test APIs.

Suggested acceptance criteria:

1. From a loaded GMI layer, choose a synthetic folder and reach a review of confident, missing, ambiguous, repeated and unreferenced items without choosing that GMI file again. Preserve its exact source revision and original lexical reference evidence.
2. Paths with duplicate basenames resolve only when relative path evidence disambiguates; case/NFC behavior matches existing policies; unsafe paths do not trigger fetches. Invalid references remain diagnostics.
3. One photo referenced by two POINT objects creates one asset and two separately selectable occurrence candidates; LINE links add no guessed position. Neither source/curation confirmation nor EXIF arrival creates current positions.
4. Cancel before save leaves no assets/source bindings/FOTO layer. Cancel after saved source checkpoint retains exactly what was confirmed. Final reviewed placement explicitly chooses source positions and preserves existing current/direction by default.
5. Append honors default filename skips, per-photo override and stable existing associations. Missing/unreferenced counts update after actual selection and explicit recheck without silently binding ambiguous copies.
6. Deleting/replacing the initiating survey or target FOTO layer during async work cannot resurrect state or bind a later unrelated import. Shared original/thumbnail URLs are released exactly once after final occurrence removal.
7. Synthetic real React/Leaflet acceptance at 1920×1080 and a short desktop size proves readable review/inspector controls, marker selection and survey/WFS coexistence. Run on the explicitly agreed target HEAD. Optional private corpus acceptance remains opt-in and external.

Explicitly deferred: delivery/export and schema selection, attachment ZIP packaging, Gemini VA/Terrain round-trip, date/photographer/general metadata editing, EXIF/GML heading adoption, persistence, object picker/navigation and WFS-object associations, clustering, broad redesign, validation/topology work and the Validator duplicate-reference warning. None is implemented by this audit or proposed as an additional concurrent milestone.

## Audit closeout

Only this new report was created. Production code, tests and historical reports were not edited. No commit/push, sub-agent, customer corpus access or WFS behavior change occurred. Focused current-checkout results: **371 tests, 357 passed, 0 failed, 14 skipped, 0 cancelled/todo**. Fresh regression acceptance of the supplied workspace-wide WFS revision remains a separate execution step because it was not checked out.
