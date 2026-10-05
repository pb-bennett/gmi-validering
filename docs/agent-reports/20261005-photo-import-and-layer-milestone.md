# Photo import/curation and FOTO layers

Date: 2026-10-05 (Europe/Oslo).

## Scope and baseline

Extended the accepted milestone-1 implementation into a temporary photo import/curation flow, followed by creation of independent session-only FOTO layers in the normal sidebar. Added independent batch selection/removal, explicit cancellation and creation, layer inspection/removal/visibility, and GMI/SOSI/KOF/FOTO badges. This remains non-spatial.

Worked directly on `feature/photo-workspace`, starting at `eb6c80f26f0cff45cc2323b8b270aede14501145` (`Add photo workspace milestone 1`). Read `docs/agent-reports/20261005-photo-milestone1-implementation.md` and inspected the current implementation before editing. No applicable AGENTS.md was found. No agents, commits or pushes were used.

The only pre-existing working-tree change was `data/usage/aggregates.json`. It was preserved byte-for-byte; its before/after SHA256 is `D7864A33649A6B77CCFD2705DA9D642610FAF3F5FB353ADAEF9FCF2D481B89C4`. Browser checks used Testmodus. No telemetry behavior was changed.

## Files changed

| File | Purpose |
| --- | --- |
| `src/lib/photos/photoSession.mjs` | Extend the existing private asset registry with draft membership, batch selection, ownership transfer and multiple FOTO layers. |
| `src/lib/layerPresentation.mjs` | Small heterogeneous sidebar presentation seam and authoritative source-format lookup. |
| `src/components/LayerTypeBadge.js` | Shared badge component. |
| `src/components/photos/PhotoLayerCard.js` | FOTO name/count, real visibility, read-only opener and confirmed removal. |
| `src/components/photos/PhotoCollectionPanel.js` | Separate batch-selection dots and inspected-card state. |
| `src/components/photos/PhotoCollectionDialog.js` | Import wording/actions/footer, cancellation and read-only layer inspection. |
| `src/components/LayerManager.js` | Present photo and survey cards together; include both in visibility counts/actions. |
| `src/components/LayerPanel.js` | Add the shared format badge to the existing survey header only. |
| `src/components/Sidebar.js` | Permit a photo-only layer list and pass the layer opener. |
| `src/components/ProductHeader.js` | Clarify the Bilder entry's import purpose in its tooltip. |
| `src/app/page.js` | Import/create/cancel/open integration, photo-only workspace, survey-error feedback and return from Validator. |
| `src/app/globals.css` | Additive selection-dot, footer and badge styles. |
| `tests/photoImportLayers.test.mjs` | Eleven new selection/ownership/layer/resource tests. |
| `tests/layerPresentation.test.mjs` | Two new format/presentation/order tests. |
| `tests/photoResetIntegration.test.mjs` | One new actual reset integration test covering layers plus a draft. |
| `tests/photoSession.test.mjs` | Update the expected empty snapshot to include draft selection/layers. |
| `tests/layerHighlightPanel.test.mjs` | Adapt the sidebar source contract to the heterogeneous presentation seam. |
| `tests/mapPaneToolbar.test.mjs` | Anchor the layout source slice at the existing main-layout comment. |
| `docs/agent-reports/assets/20261005-photo-import-and-layer/` | Six inspected screenshots and browser acceptance log. |
| This report | Implementation and verification record. |

No dependencies or lockfiles changed. The thumbnail decoder, Zustand store/reset implementation, GlobalFileDrop, parsers, map-feature architecture, validation rules, table search, hyperlink handling and popup implementation were left unchanged. The existing reset hook already called `photoSession.clear()`.

## Temporary import and asset ownership

The existing external photo session is now a private asset registry plus explicit ownership collections. Original Files remain private Map values, retained by reference, outside React snapshots and persisted/devtools Zustand state. `getFile(photoId)` still retrieves the exact original File. Public metadata access uses `getPhoto(photoId)` and `getLayerPhotos(layerId)`; neither exposes Files or image bytes.

An ordered `importIds` list owns the temporary draft. The active inspected ID and a separate batch-selection Set apply only to this draft. Selection does not affect inclusion. Append preserves existing inspection/selection; new photos start unselected. Removal preserves remaining order, clears batch selection, releases only removed assets, and selects the surviving photo at the previous inspection index, clamped to the last photo when needed.

`beginImport()` starts an empty draft. `cancelImport()` discards only that draft. The footer's Avbryt, header X and native Escape all use the same cancel path. Existing FOTO layers survive. The generic Bilder entry always starts a new import, never appends to an existing layer.

`createLayer()` rejects an empty collection. Otherwise it moves every remaining ordered draft ID into a new FOTO layer without copying Files or releasing thumbnail resources. It clears draft IDs, inspection, batch selection and import summary. This implementation deliberately gives each asset ID exactly one owner: the draft or one FOTO layer. Re-importing the same File creates distinct asset IDs. Sharing one asset ID across layers is not exposed by the current API; future sharing/duplication workflows would need an explicit ownership extension.

## FOTO layer and sidebar model

A FOTO layer has a stable internal ID, `type: 'FOTO'`, disambiguated default name (`Bilder`, `Bilder (2)`, ...), ordered `photoIds`, `photoCount`, real `visible` state and `createdAt`. There are no fake placement counts, parsed survey features or empty future metadata structures.

Photo layers remain in the external session registry. A small presentation helper combines them with survey layers in the ordinary sidebar; it does not insert photos into the parsed GMI/SOSI/KOF schema. Photo layers appear newest-first above surveys. Existing relative survey ordering and its authoritative `layerOrder` remain intact. Cross-type reordering is not implemented.

Each FOTO card shows its badge/name/count, visibility checkbox, a useful read-only `Åpne bilder` action, and removal with inline confirmation. Shared Vis alle/Skjul alle and visibility counts cover both layer kinds. Visibility currently has no map effect for FOTO. Read-only inspection reuses the existing large modal without batch controls, imports or fake editing actions.

Creating a layer closes the import modal and shows the normal layer list, including when creation began from Validator or before any survey was loaded. A photo-only workspace provides a truthful inspection/upload notice; it creates no map markers. Adding surveys subsequently activates the existing map/table/validation workspace. Survey-import errors remain visible when photo layers keep the workspace mounted.

## Badges

`getLayerType` uses known `file.format`, with parsed `data.format` as fallback, for GMI/SOSI/KOF. It never guesses from an arbitrary filename. FOTO uses the explicit photo-layer type. The shared badge has consistent shape, typography and dimensions; survey badges use restrained neutral tokens and FOTO uses the existing cyan tokens. Browser geometry on the final production build confirmed all four badges at the same horizontal position (`x=46`) and size (`44×18px`) in the normal sidebar.

## Resource lifecycle

| Operation/resource | Behavior |
| --- | --- |
| Remove selected / cancel draft | Delete draft membership and private records; revoke their thumbnail URLs; remove queued work and abort their active job. |
| Create FOTO layer | Transfer membership only. Originals, thumbnails and pending thumbnail work remain owned by the created layer. |
| Delete FOTO layer | Release only that layer's asset records/thumbnail URLs; other layers and the draft remain intact. |
| Full reset / page-owner teardown | Existing `clear()` integration now releases draft and all FOTO layers/assets. Repeated clear/delete/cancel is safe. |
| Late thumbnail results | Full-clear generation checks plus record-existence checks prevent removed/canceled/deleted assets from returning. Removing a draft does not abort a job now owned by a layer. |
| Temporary decode resources | Milestone-1 sequential decoder remains unchanged: temporary original URL, image and bounded canvas cleaned on success/error/abort. |
| Original inspector URL | Existing effect creates only the inspected original's URL and revokes it on change/unmount/close. Closing layer inspection retains registry-owned thumbnails/Files. |

No source files are modified or deleted. There is no base64, server upload, image-byte persistence or browser-storage photo persistence.

## Automated validation

Fourteen focused tests were added: eleven import/layer tests, two badge/presentation tests, and one reset integration test. They cover separate batch/inspection selection, toggling/select-all/clear, append, removal/order/next inspection, exact File retention, inclusion regardless of dots, transfer during decoding, cancellation, two independent layers, visibility, delete ownership, stale results for remove/cancel/delete, repeated cleanup, full reset and source-format/order preservation. Existing preview scheduling, classification, sizing and temporary-URL tests remain passing.

Focused command: **31 passed, 0 failed**.

```powershell
node --test tests/photoSession.test.mjs tests/photoImportLayers.test.mjs tests/photoPreviewLifecycle.test.mjs tests/photoResetIntegration.test.mjs tests/layerPresentation.test.mjs
```

Combined focused/regression command: **134 passed, 0 failed**. Covers upload/reset integration, survey layer ordering/highlights, map/workspace layout, Data Table search/inspection, hyperlink filenames, popup content and telemetry parser integration.

```powershell
node --experimental-loader ./tests/esmJsLoader.mjs --test tests/photoSession.test.mjs tests/photoImportLayers.test.mjs tests/photoPreviewLifecycle.test.mjs tests/photoResetIntegration.test.mjs tests/layerPresentation.test.mjs tests/dataInspectorStacking.test.mjs tests/dataInspectorConstrainedHeight.test.mjs tests/mapPaneToolbar.test.mjs tests/profileAnalysisLayout.test.mjs tests/profileAnalysisActiveDataCrash.test.mjs tests/tableSearch.test.mjs tests/hyperlinkFilenames.test.mjs tests/featurePopupContent.test.mjs tests/objectTableInspection.test.mjs tests/layerOrder.test.mjs tests/layerHighlightPanel.test.mjs tests/layerHighlightHalo.test.mjs tests/richerUsageTelemetryParserIntegration.test.mjs
```

Targeted ESLint for the changed/new files below: **passed**.

```powershell
node node_modules/eslint/bin/eslint.js src/app/page.js src/components/LayerManager.js src/components/Sidebar.js src/components/ProductHeader.js src/components/LayerTypeBadge.js src/components/photos/PhotoLayerCard.js src/components/photos/PhotoCollectionDialog.js src/components/photos/PhotoCollectionPanel.js src/lib/photos/photoSession.mjs src/lib/layerPresentation.mjs tests/photoImportLayers.test.mjs tests/layerPresentation.test.mjs tests/photoSession.test.mjs tests/photoResetIntegration.test.mjs tests/layerHighlightPanel.test.mjs tests/mapPaneToolbar.test.mjs
```

Also ran targeted ESLint including `src/components/LayerPanel.js`: **four existing conditional-hook errors**, at current lines 1175–1180. Reproduced all four against HEAD (one line earlier) using `git show HEAD:src/components/LayerPanel.js | node node_modules/eslint/bin/eslint.js --stdin --stdin-filename src/components/LayerPanel.js`. The badge retrofit does not change hooks; unrelated fixes were deliberately excluded.

Also ran `node --test tests/appInfoUiContract.test.mjs`: **11 passed, 1 existing failure**. The failed statistics-button assertion expects `.statistics-button--cue`, absent in HEAD. Reproduced 11/1 with the HEAD test and HEAD source reads in a temporary harness (`gmi-photo-baseline-check.mjs` and `gmi-photo-appInfo-baseline.test.mjs`). No AppInfo test/source changes were made.

`npm.cmd run build`: **passed**, including the final badge alignment change. Next 16.1.6 compiled and generated all routes. The only build notice was the existing outdated Browserslist data. `git diff --check`: **passed**. Node's loader/module-type/storage warnings were non-failing. No unrelated lint/tooling changes were made.

## Browser checks actually completed

Used installed headless Chrome through native Node/CDP against the production server (`node node_modules/next/dist/bin/next start -p 3100`), with Testmodus active. Assertions and captured screenshots were inspected; temporary harnesses stayed outside the repository. No Playwright dependency was added.

| Acceptance area | Observed result |
| --- | --- |
| Import clarity / large batch | Empty create disabled. Imported 110 synthetic 4000×3000 JPEG File records, each using a generated 7,569,687-byte JPEG Blob; all appeared immediately and thumbnails progressed. UI actions worked during processing. This was not a varied real-camera corpus. |
| Dots vs inspection | Dot clicks changed batch selection without changing inspection; card clicks inspected without changing dots. Select all selected 111 records after a disk PNG was added; clear selected none. |
| Removal and source safety | Removed 14 records, including a PNG loaded through the native disk picker. Remaining count/order and batch count were correct. The source PNG's SHA256 and size remained unchanged. |
| Add/drop | Five additional PNG drops appended to 97 remaining photos, producing 102 while preserving existing batch selection. Photo drop did not call the instrumented survey FileReader. |
| Create and ownership | With only one dot selected, create used all 102 remaining photos. Modal closed into the photo-only normal sidebar. Read-only layer inspection contained all 102 records; original PNG selection decoded correctly. All thumbnails completed approximately 22 seconds after opening inspection on the large-batch run. Close retained 102 thumbnail URLs and zero original URLs. |
| Cancel / multiple layers | Canceling a new draft left the first layer intact; reopening import was empty. A second FOTO layer contained two separate duplicate-name records, with a distinct name/count. Individual and shared visibility controls worked. |
| Survey coexistence / badges | Normal survey drops loaded synthetic GMI and KOF once per file. Native disk picker loaded `node_modules/sosijs/data/fastmerke.sos`. All four actual badges were visible; FOTO counts stayed unchanged. The initially tried dependency `punkttest.sos` failed in the existing parser (`MIN-NØ`); no parser changes were made. |
| Table / validation | GMI Data Table opened with the hyperlink filename/copy control present. Validator opened. Creating a third FOTO layer from Validator returned to the normal layer list and retained the existing table. Clipboard writes were not separately proven in this browser harness; existing copy/extraction regressions passed. |
| Object popup / map | Survey features rendered in Leaflet. An actual GMI object popup opened alongside a FOTO layer and retained its existing Photo.jpg hyperlink content/actions. Remote basemap tile availability was not validated. |
| Mixed/errors | PNG and WebP previews decoded; unsupported SVG, corrupt JPEG and empty PNG stayed as visible error records; a text file was rejected with summary. Good previews continued. Removing the error records and creating a three-photo layer worked. No SVG preview was rendered. |
| Delete / full reset | Deleting the 102-photo layer released its thumbnails while two other FOTO layers and surveys survived. Full reset removed all layers/assets and returned the instrumented owned-URL count to zero. |
| Repeated cancellation | Three native Escape cancel cycles covered pending/ready imports; the existing FOTO layer's three URLs survived each cancellation. Subsequent full reset returned the tracker to zero. |
| Layout | Inspected 1366×768, 1366×500 and 600×700. Footer stayed within the viewport; gallery and inspector remained usable with independent scrolling and stacked narrow panes. At 1366×500 their height was 269px; at 600×700 gallery/inspector were approximately 172/211px. |

The completed main browser run recorded zero uncaught runtime exceptions and zero `/api/track` calls. Final production badge verification also recorded no runtime exceptions. See [browser log](assets/20261005-photo-import-and-layer/browser-checks.json), [curation](assets/20261005-photo-import-and-layer/gmi-photo-import-curation-1366.png), [desktop](assets/20261005-photo-import-and-layer/gmi-photo-import-desktop-mixed.png), [short layout](assets/20261005-photo-import-and-layer/gmi-photo-import-short-mixed.png), [narrow layout](assets/20261005-photo-import-and-layer/gmi-photo-import-narrow-mixed.png), [final aligned badges](assets/20261005-photo-import-and-layer/gmi-photo-import-badges-aligned.png), and [popup coexistence](assets/20261005-photo-import-and-layer/gmi-photo-import-popup-coexistence.png).

URL instrumentation and exact ownership tests establish application-owned resource cleanup, not browser heap reclamation. A varied 100-photo camera corpus, full accessibility audit, all browsers and real clipboard writes were not tested. Synthetic browser-harness selector/escaping issues were corrected during verification; they were not application changes.

## Limitations, deferred work and next milestone

FOTO layers are session-only and disappear on reload. Inspection is read-only; adding photos to an existing layer, rename and cross-type layer reordering are not implemented. The exclusive asset-owner invariant is appropriate for this milestone and must be revisited before introducing shared photo membership. Photo visibility is real state but has no map effect yet. The synthetic batch validates responsiveness under repeated decoding, not memory/performance for 100 different camera originals.

EXIF/GPS, placement/movement, map markers/thumbnails, direction, DFOT, hyperlink matching, object/source-layer associations, placed/unplaced counts, workflow statuses, full-screen editing, GML/attachments/ZIP export, persistence and server upload remain deferred. No speculative metadata fields were added.

Recommended next milestone: a focused FOTO-layer editing/placement slice that uses stable photo IDs and exact original-file access, with spatial/workflow state modeled independently from technical preview state. First agree the placement interaction and layer editing entry; retain the current tested ownership boundary. A varied real-camera batch and accessibility review should accompany that UI work. The baseline AppInfo assertion and LayerPanel hook errors belong in separate maintenance work.
