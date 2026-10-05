# Photo milestone 1: focused repository inspection and implementation plan

Date: 2026-10-05 (Europe/Oslo). Repository: `C:\GitHub\gmi-validering-test`.

Task scope: planning/review only. Inspect the existing upload, session, layout, image/attachment seams, and relevant test conventions. Recommend collection import, browser-only retention, complete collection browsing, thumbnails, and larger inspection. No application code changes, agents, commits, or pushes. Future photo positioning and interchange features are architectural hooks only.

## 1. Executive summary

Implement a **Bilder entry opening a large collection dialog with an internal selected-photo inspection pane**. Make it available both before survey-file import and in the persistent product header after import. Import multiple files through a dedicated picker/drop area; append to one session-wide collection. Every imported image record remains represented, including records whose previews fail.

Keep original `File` objects in a small, browser-only photo-session registry outside the existing persisted/devtools Zustand store. React receives lightweight record snapshots. Generate real thumbnails with a single-job decode queue; show an original-file object URL only for the selected photo. Connect the registry to the existing `resetAll` action and page-owner cleanup.

This is the smallest useful slice: open Bilder, import a batch, browse every record, select and inspect, close and reopen without losing files, then reset/reload and release them. It needs no survey file, map changes, metadata parser, new route, or full Photo Workspace design.

## 2. Current architecture relevant to photo support

### Files inspected

The following were read in full or through the relevant sections/search matches; this was not a general application audit. Line anchors refer to the inspected working tree.

| File | Relevant findings |
| --- | --- |
| `src/components/FileUpload.js:20` | `useFileLoader`, single-file picker/drop UI, FileReader, parser selection, successful import, error handling. |
| `src/components/GlobalFileDrop.js:11` | Window-level file-drop listener and overlay; always takes the first file. |
| `src/lib/store.js:48` | Global Zustand ownership, raw-file policy, metadata/data/layer slices, reset actions, persistence and hydration. |
| `src/app/page.js:59` | `Home`, transient UI state, heartbeat, initial/main layout gating, reset handler, sibling modals. |
| `src/components/WorkspaceShell.js:3` | Product header/sidebar, primary workspace, optional bottom table dock. |
| `src/components/ProductHeader.js:5` | Persistent header independent of the active validator sidebar. |
| `src/components/Sidebar.js:708` | Sidebar owns local presentation/resize state; renders LayerManager in the active multi-layer flow. |
| `src/components/LayerManager.js:18` | Survey layer list, visibility, add-file controls; inappropriate owner for the complete photo collection. |
| `src/components/MapPaneToolbar.js:35` | Map/3D tab switcher and reset/share controls; constrained-width overflow behavior. |
| `src/components/TabSwitcher.js:5` | Existing persisted `ui.activeViewTab` is specifically map/3D navigation. |
| `src/components/MapView.js:7` | Client-only dynamic MapInner, legend, highlights and analysis prompts. |
| `src/components/MapInner.js:975` | Leaflet click/measurement handlers, map/layer selectors, centering and projection assumptions; inspected relevant controller sections. |
| `src/lib/map/coordinateProjection.js:35` | Dataset-derived CRS and coordinate projection helpers. |
| `src/components/DataDisplayModal.js:54` | Survey-data inspector tied to layers, points, lines, attributes and terrain requests. |
| `src/components/AppInfoModal.js:395` | Dialog keyboard/focus, scroll-lock and focus-return patterns. |
| `src/components/ShareQrModal.js` | Additional modal conventions, reviewed through relevant matches. |
| `src/components/validation-v2/ValidationV2FieldInspector.js:7` | Existing inspector appearance is reusable as a visual pattern, but its content/API are validator-specific. |
| `src/components/LayerDataTable.js:83` | Hyperlink filename cells; existing `@tanstack/react-virtual` use at approximately line 606. |
| `src/lib/hyperlinkFilenames.mjs:27` | Extracts filename text from references; does not locate, load or retain attachments. |
| `src/lib/filenameClipboard.mjs:2` | Clipboard feedback lifecycle, not photo storage. |
| `src/lib/map/featurePopupContent.mjs:80` | Displays hyperlink filenames and copy controls using safe DOM text. |
| `src/lib/parsing/gmiParser.js:101` | Parsed dataset shape and generic attribute retention, including opaque hyperlink strings. |
| `src/components/AuthenticatedWmsLayer.js:51` | Blob-to-object-URL example, specific to WMS tiles. |
| `src/app/layout.js`, `src/app/globals.css` | Next layout/analytics, existing design tokens and control recipes, inspector constraints. |
| `package.json`, `next.config.mjs`, `eslint.config.mjs` | Next/React/Zustand dependencies, React Compiler enabled, no image/EXIF processing dependency declared. |
| `tests/esmJsLoader.mjs`, `tests/appInfoState.test.mjs`, `tests/dataInspectorStacking.test.mjs`, `tests/mapPaneToolbar.test.mjs`, `tests/statusBrowsing.test.mjs`, `tests/hyperlinkFilenames.test.mjs` | Node test conventions, injectable utilities, source-level UI contracts and module loader. |
| `docs/development.md` | Existing test/build commands and local-processing conventions. |

Repository/file searches found no applicable `AGENTS.md`. A pre-existing modification to `data/usage/aggregates.json` was present before this pass and was left alone.

### Upload and source-file ownership

`FileUpload` and `GlobalFileDrop` both use `useFileLoader`. The picker accepts `.gmi,.sos,.sosi,.kof,.txt`, without `multiple`; both drop handlers select `files[0]`. The hook writes `file` metadata, sets parsing to `parsing`, and reads the file. SOSI uses ArrayBuffer; other inputs use text with ISO-8859-1. Format detection selects GMI/SOSI/KOF, with a default GMI fallback. Images must not enter this parser path.

After parsing and CRS resolution, the loader calls `addLayer({ file: fileMeta, data: parsedDataForApp })`, updates legacy `file`/`data`, and sets parsing to `done`. `addLayer` also derives analysis/outlier/terrain state. Successful survey import invokes an existing telemetry completion path; photo import should have no connection to it.

The original `File` is temporarily referenced by the loader/FileReader closure. Neither `state.file` nor `layers[id].file` retains it: both contain name, size, lastModified, type and detected survey format. Parsed objects live in `data` and `layers[id].data`.

The shared `useStore` owns application/session data. `Home` owns modal booleans, sidebar width and other layout state; child components also own local presentation state. The store's documented policy explicitly keeps raw binary outside it. Actual persistence at `store.js:3040` includes **settings, most UI state and lastActive**, excluding parsed datasets/layers. This is broader than the introductory comment's shorthand about persisting settings only. Photo records, files, URLs and selection should never be inserted into persisted `ui`.

### Lifecycle behavior affecting photos

| Existing operation | Current behavior | Proposed photo behavior |
| --- | --- | --- |
| Add another survey file | Adds a layer; overwrites legacy file/data; temporarily switches parsing away from `done`. | Preserve photos and selection. |
| Failed survey import | Sets parsing to `error`; initial upload/error screen replaces the main workspace. | Preserve photos; keep Bilder accessible there. |
| `clearFile` / `clearData` | Clears legacy metadata/data and some analyses. A quota-error path calls `clearData`. | Preserve photos; these are not full-session resets. |
| Remove a survey layer | Clears layer state; removing the last layer clears legacy file/data and analyses, but does not reset parsing status. | Preserve independent photo collection and header access. |
| `resetAll` at approximately line 2963 | Clears survey files/layers/results/UI; preserves settings and chosen map background/overlays. | Also clear photo registry, selection, work queue and URLs. |
| `Home.handleReset` at line 262 | Closes data inspector then calls `resetAll`. | Also close Bilder; registry clearing belongs in `resetAll`, covering all callers. |
| Reload / document disposal | Runtime datasets disappear; preferences rehydrate. | All photo files and metadata disappear; show empty collection. |
| Hydration age check | After an old lastActive value exceeds one hour, clears legacy file/data/parsing/validation. | Photos are already absent after reload; do not add a new live inactivity timer. |

`Home` updates lastActive every minute and on focus/visibility/click. The one-hour check runs during rehydration; it is not an active-tab expiry timer.

### Workspace and reusable pieces

The main `WorkspaceShell` renders only when parsing is `done`. It holds a header and sidebar on the left, map/3D plus optional field inspector in the primary area, and a 38% bottom table dock when open. Profile analysis changes map height. Field validation replaces the usual sidebar. Dialogs sit beside the workspace at page level.

The product header is the clean Bilder entry seam: it remains independent of sidebar mode. The map toolbar already has width/overflow constraints, and map/3D tab state has established semantics; neither needs a new photo tab now.

Reuse existing design tokens, control classes, Phosphor icons and AppInfo dialog interaction patterns. There is no generic reusable attachment repository, image gallery, thumbnail utility or image inspector. Existing file-input/drop markup is a pattern to follow, not a loader to reuse. Table virtualization is available if later collections grow, but a few hundred thumbnail cards do not justify grid virtualization in the first slice.

The WMS code creates tile object URLs, but the searched source contains no `revokeObjectURL` lifecycle utility. Do not copy that ownership pattern or broaden this task into WMS fixes. Hyperlink helpers only extract/display/copy reference filenames; they are future matching inputs, not photo identity or storage.

## 3. Recommended milestone-1 architecture

### Minimal internal record

Use a documented JavaScript/JSDoc shape, consistent with this JavaScript repository:

```js
// Session-owned record; file is held privately, outside React/Zustand snapshots.
{
  id: 'opaque-unique-id',
  originalFilename: file.name,
  file,                         // Original File, retained by reference, never encoded.
  mimeType: file.type || null,   // Browser-reported value; may be empty/unreliable.
  size: file.size,
  lastModified: file.lastModified,
  importedAt: Date.now(),
  source: 'local-file',
  dimensions: null,             // Later { width, height }, from browser decoding.
  preview: {
    state: 'pending',           // pending | ready | error
    thumbnailUrl: null,         // Owned derived Blob URL, not original-file URL.
    errorCode: null             // e.g. unsupported-format, empty-file, decode-failed.
  }
}
```

Use unique IDs, never filename keys. Duplicate filenames and repeated imports remain separate records in import order; no hashing, silent overwriting or deduplication. `lastModified` helps users distinguish same-name files. Keep inferred format hints separate from the original MIME value if needed for validation.

The public snapshot omits `file`; callers can obtain it through `getFile(id)`. Snapshot metadata contains no image bytes, canvas, ImageBitmap or image DOM element. `preview.state` describes technical rendering only. It is not placement/review status.

Do **not** add empty EXIF/DFOT/GML objects, a metadata plugin framework, or a single catch-all photo status. The stable ID, separate original asset, independent preview state, and replaceable record updates are enough extension seams. Later metadata can be optional named fields or ID-keyed sidecars without changing import/preview ownership.

### State owner and file retention

Add a small `photoSession.mjs` module with a testable `createPhotoSession` factory and one runtime session instance. Its private record map retains originals and thumbnail resources. Expose only the needed operations: `importFiles`, `select`, `getFile`, `getSnapshot`, `subscribe`, and `clear`. Keep a stable cached snapshot between changes; React can consume it through a small `useSyncExternalStore` adapter. A shared empty server snapshot prevents hydration mismatch.

The photo owner is session-wide and survives dialog/sidebar/map mounts. It is separate from survey layers and the persisted/devtools store. Add only a narrow synchronous call to its clear function inside existing `resetAll`; the photo module must not import the validator store back. Empty initialization must not touch `window`, File APIs or DOM on the server. File imports and URL/decoding operations occur only in client interactions/effects.

This is an asset/session seam, not a new application state framework. Do not add persistence, project serialization, workers, routes or server endpoints. Retain each original `File` directly without copying to another Blob or reading its complete bytes into a retained buffer. Do not use `readAsDataURL`, canvas `toDataURL`, localStorage, sessionStorage or IndexedDB for photos. Document session-only loss after reload/close in Bokmål.

### Thumbnail and larger-display strategy

1. Register the complete candidate batch and publish pending cards immediately, in order. Appending a second batch preserves existing IDs/selection.
2. For supported raster candidates, process **one thumbnail at a time**. Decode an off-DOM image from a temporary original-file object URL using `image.decode()`; catch failures and record per-file errors. Yield between jobs so importing a large batch does not monopolize rendering.
3. Read decoded dimensions, scale proportionally to a maximum **320-pixel longest edge**, without enlarging small images, and draw to a thumbnail-sized canvas. Never allocate an original-resolution canvas.
4. Encode the thumbnail with `canvas.toBlob`: JPEG around quality 0.8 for ordinary opaque photos; PNG where preserving transparency is useful. Store its small Blob URL. Handle a null result or encoding error. Canvas `toBlob` produces a Blob rather than a base64 string. [MDN toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob).
5. In `finally`, revoke the temporary decode URL, clear image references and release/reset the canvas backing store. Do not retain decoded originals. Decoding success/failure can be awaited through `decode()`. [MDN image.decode](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode).
6. Render gallery thumbnails with ordinary `<img>` elements, fixed card dimensions, `object-fit: contain`, lazy loading and asynchronous decoding. Preserve visible placeholders and filenames for pending/error records; a missing preview never removes a photo from the collection.
7. The selected-photo pane creates one original-file URL in an effect, displays the original with aspect-preserving fit to the available large area, and handles load/decode errors locally. Revoke it when selection changes, the dialog closes, or the original disappears. Do not make full-size URLs for every card. No full-size canvas or permanent medium-resolution derivative is needed.

Object URLs reference File/Blob objects and require explicit revocation when their owner is finished. They do not reduce image decode memory by themselves. [MDN createObjectURL](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static). Canvas scaling uses the decoded image's natural dimensions. [MDN drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage).

Use browser-rendered orientation for previews and verify rotated phone JPEGs manually. This is ordinary image rendering, not application EXIF extraction. Describe dimensions as decoded display dimensions, not guaranteed raw camera-sensor dimensions. Do not introduce an EXIF library.

### Ownership and cleanup

| Resource | Owner | Release point |
| --- | --- | --- |
| Original File reference | Session registry | Collection clear/full reset/page-owner disposal. |
| Temporary thumbnail decode URL/image/canvas | Single thumbnail job | `finally`, on success, failure or stale completion. |
| Thumbnail Blob URL | Session registry | Clear/reset/disposal; keep across ordinary dialog close/reopen. |
| Original inspection URL | Selected-photo pane effect | Change selection, close/unmount pane, clear/reset. |
| Pending work | Session registry | Clear increments a generation token and drops queued jobs. |
| Subscribers/page listeners | React adapter/page owner | Unmount/effect cleanup. |

Do not create URLs during render. Do not revoke a URL in `onLoad` while its consumer still displays it. Use one owner per URL and idempotent cleanup.

Clearing must invalidate asynchronous results before dropping records. A decode/toBlob callback that finishes after clear must release any resources it created and never restore a record. Browser decoding is not necessarily cancellable; a generation check provides logical cancellation, and the running job must still finish its cleanup. Remove consumed job/File references from the queue.

Attach session lifecycle cleanup once at `Home`, outside the parsing-dependent workspace, rather than in every subscription or in the dialog. Unmount clears resources. Handle document departure through a pagehide listener, skipping clear when the event indicates a retained back/forward-cache document; do not clear on blur/visibility change. Ordinary document disposal also releases browser-owned resources. Keep effect setup/cleanup safe under development Strict Mode; do not permanently disable a reusable session object during an effect probe.

## 4. UI integration recommendation

**Choose a dedicated Bilder module entry, with a collection dialog for milestone 1.** Do not embed hundreds of photos in the validator sidebar or add a new map/3D tab.

- Add a compact `Bilder` button, optionally with count, in `ProductHeader`, wired through `WorkspaceShell` to `Home`. Fit it within the current resizable header without shrinking/removing existing identity and info access.
- Add the same entry beside existing actions on the initial/error upload screen. Photo-only import must work before GMI/SOSI/KOF import; photo state must not drive or alter parsing status.
- `Home` owns the dialog-open boolean and opener ref. Entering Bilder opens the collection, restores selection if valid, and changes no validator/map state. Closing returns to the same screen.
- Empty state explains session-only storage and offers `Importer bilder`. The multiple picker and dialog drop area append to the collection; selecting another batch adds records. Clear the input value after copying File references so the same files can be selected again.
- Show all cards in a scrollable responsive grid with thumbnail/placeholder, filename, selected indication, and accessible selection buttons. Header shows total count and thumbnail progress; errors have clear labels and a per-import summary. No filters or placement badges yet.
- Place a large inspection pane beside the grid on wide screens; stack it with the collection on narrow screens. Show fitted original image plus filename, size, type, and dimensions when available. No second nested photo modal, pan/zoom engine, or map action buttons are needed.
- Include `Tøm bilder` to release this collection independently, plus the dialog close control. Full application reset also clears it. Reuse AppInfo's focus/keyboard/return-focus patterns; ensure background controls cannot receive interaction while the dialog is open.

Mount the dialog as a page-level sibling, outside `parsingStatus === 'done'`, above existing workspace chrome. The highest inspected data-inspector overlay is z-index 10060; choose a consistent higher dialog layer and test focus/stacking. Use existing styles and a focused accessible wrapper, without extracting/refactoring all modals.

Disable `GlobalFileDrop` through its existing `enabled` prop whenever Bilder is open. Handle file dragover/drop across the dialog so the browser does not navigate to dropped images; import through the photo handler once. Its local drop handlers must prevent default and stop propagation. The current global window listener does not honor a local photo import and would otherwise feed the first image into the survey parser. Opening Bilder must also dismiss any visible global-drop overlay; if an existing drag exposes stale state, make the small disabled-state cleanup in GlobalFileDrop.

The future full-screen Photo Workspace can reuse `PhotoCollectionPanel` and the same runtime photo session, with the Bilder opener later navigating to a module shell. Its map split, placement tools and navigation design should wait. Milestone 1 uses neither a new URL route nor an `activeViewTab: 'photos'` value.

## 5. Exact implementation plan

Implement in this order; paths are proposed, not created by this review.

1. **Record/session seam:** add `src/lib/photos/photoSession.mjs`. Document the shape, original identity, supported/candidate policy, stable snapshots, ID selection, append/clear behavior and generation cancellation. Provide injected ID/time/thumbnail functions for lifecycle tests; do not serialize binary or register devtools.
2. **Image processing:** add `src/lib/photos/imagePreview.mjs`. Implement format classification, bounded proportional dimensions, sequential browser decode/toBlob processing with complete temporary-resource cleanup. Inject browser operations where this makes lifecycle behavior testable; keep actual canvas/decoding in this file.
3. **React adapter:** add `src/components/photos/usePhotoSession.js`. Expose lightweight subscription and a separate page-owner lifecycle helper. Subscription cleanup alone must not destroy a session shared by other consumers.
4. **Collection and inspection:** add `src/components/photos/PhotoCollectionPanel.js`. Keep picker/drop, complete grid and selected-photo pane together for this small slice. The pane effect owns the single original URL. Add no map imports or survey-attribute dependency.
5. **Dialog wrapper:** add `src/components/photos/PhotoCollectionDialog.js`. Provide accessible dialog behavior, large responsive bounds, close/clear controls and opener focus return. Reuse established visual/interaction patterns without altering survey inspectors.
6. **Application entry:** modify `src/app/page.js` to attach session lifecycle once, hold dialog state, render the dialog outside survey-layout gating, add the initial-screen entry, and disable GlobalFileDrop while open. Modify `src/components/WorkspaceShell.js` and `src/components/ProductHeader.js` only to pass/render the Bilder action and count. Reset closes the dialog.
7. **Full reset seam:** modify `src/lib/store.js` only to call the photo-session clear function in `resetAll`. Do not attach photo cleanup to `setData`, `clearData`, layer removal or parsing changes. If needed, make only disabled-drag cleanup changes in `src/components/GlobalFileDrop.js`.
8. **Focused verification:** add `tests/photoSession.test.mjs` and `tests/photoPreviewLifecycle.test.mjs`, then run relevant existing reset/layout/upload contracts and manual browser checks below. Add narrowly scoped CSS to `src/app/globals.css` only if existing utility classes cannot express the responsive dialog; no global restyling or dependency changes.

Expected application surface: five new small photo files; four UI integration files and one reset-owner file changed; possibly a tiny GlobalFileDrop cleanup. Keep `FileUpload.js`, all parsers, map components, layer schema, telemetry and validation rules unchanged.

## 6. Risks / edge cases

### Memory and performance

Compressed file size does not predict decoded memory. A 12-megapixel RGBA image is roughly 48 MB of pixels before other allocations; a 24-megapixel image is roughly 96 MB. Thumbnail generation can transiently decode a full original even with a 320-pixel canvas. One thumbnail job plus one selected original may coexist; do not use unbounded Promise.all over image decoding.

The grid must consume small thumbnail Blobs, not CSS-shrunken originals. Base64 adds roughly one third to binary size before string/runtime overhead; it is unsuitable for retained originals. Lazy thumbnail loading and unmounting the inspection image on close reduce rendering pressure, but do not guarantee immediate browser-cache/GC reclamation. At 300 square 320-pixel thumbnails, decoded pixels alone could still approach 123 MB if all are resident.

Show aggregate retained file size and incremental progress. Avoid invented claims that a fixed count is always safe; a few hundred small photos differ from a few hundred 50-MB photos. Begin with sequential jobs and real-batch measurements. If representative hardware cannot manage the target batches, revisit limits or virtualization with evidence before declaring acceptance. Workers and additional preview caches are deferred.

### Input and decoding policy

Promise preview support for **JPEG, PNG and WebP** in the first implementation. Use browser MIME plus case-insensitive extension fallback when MIME is empty; neither is proof that the content decodes. Copy selected File references immediately and handle cancellation/empty selections without changes.

Known other image candidates, including HEIC/HEIF, TIFF and SVG, can be retained as records with `unsupported-format` and a visible explanation; never attempt to render SVG or silently omit retained files. Corrupt or zero-byte supported candidates remain records with an error. Non-image files are skipped with a named rejection summary; they are not counted as imported photos. Explicitly distinguish imported records from rejected input. Do not add converters, TIFF/HEIC libraries, remote conversion or content-sniffing infrastructure.

Very large images can fail decoding or canvas encoding. Preserve the original and an error card, allow other jobs to continue, and catch large-display failures too. A small thumbnail canvas bounds derivative memory, not the browser's original-image decoder. Preview bytes may differ from the original; exporting originals later must use the retained File, never a thumbnail.

### Identity and lifecycle

Duplicate names must not overwrite each other. Special characters, Norwegian letters, spaces, uppercase extensions and long names must remain readable; render names as text, never HTML. Do not derive asset identity from S_HYPERLINK or a filesystem path. A file picker exposes selected files, not arbitrary local paths.

Reload closes the session and loses photos by design. Closing Bilder, switching map/3D, adding/removing survey layers and failed survey imports preserve them. Reset during decode is the principal leak/race case: queued and late job results must not resurrect records. Repeated import/clear/open/close cycles must not accumulate owned URLs or original File references.

### Framework/browser constraints

The project uses the Next App Router, React 19 and React Compiler. Browser APIs belong in client effects/handlers; avoid render-time resource allocation and effect dependencies that recreate all URLs on every render. Keep `useSyncExternalStore` snapshots stable and provide an empty server snapshot. Original Files stay outside Next server props and persisted/devtools snapshots.

Use ordinary local `<img>` rendering for Blob URLs; do not send them through a server image optimizer. A narrow ESLint exception may be appropriate for Next's image-element guidance, with a comment explaining local Blob rendering. No Next image configuration change is required.

No browser component/automation framework is declared. Existing Node tests cannot prove real decoding, orientation, focus or heap behavior. `src/app/layout.js` uses `next/font/google`, so production builds may need network access for fonts. The existing lint script is `next lint`; check the installed CLI before relying on that script, or use the existing ESLint configuration directly for touched files. Do not repair unrelated tooling in this milestone.

## 7. Tests and manual acceptance checks

### Focused automated tests for the implementation

Use the existing `node:test` style and small injected fakes, without introducing a browser-test stack solely for this slice.

- Record identity and retention: a batch produces all records in order; exact original File objects remain accessible; duplicate names/reimports get different IDs; selecting/appending preserves the intended record; clearing removes access and selection.
- Input handling: MIME-empty uppercase extensions, supported formats, unsupported image records, non-image rejections, zero-byte/corrupt failures and partial success. A failed thumbnail must not suppress a card or stop the queue.
- Thumbnail math and scheduling: aspect ratio, no upscaling, longest edge bounded at 320; active decode concurrency stays at one; all jobs eventually run in order.
- Resource ownership: every temporary URL is revoked on success/failure; retained thumbnail URLs are revoked on clear; queue-held File references are dropped; clear during pending decode/toBlob suppresses stale results and revokes their resources; repeated clear is safe.
- Reset integration: exercise `resetAll` against the runtime owner and verify photos clear. Verify `clearData` and survey layer changes preserve them. Use the existing source-module loader where necessary; prefer behavior over asserting implementation strings.

Unit fakes validate ownership/control flow, not browser image support. Keep selected-pane URL lifecycle and dialog/drop behavior in the browser acceptance pass if no existing React harness can exercise them. Do not claim regex/source tests prove those behaviors.

Suggested commands after implementation:

```text
node --test tests/photoSession.test.mjs tests/photoPreviewLifecycle.test.mjs
node --test tests/dataInspectorStacking.test.mjs tests/mapPaneToolbar.test.mjs tests/hyperlinkFilenames.test.mjs
npm run build
```

Run any focused reset/drop tests added with the integration. Targeted ESLint can use the installed ESLint binary/config. Expand testing only if failures or changed contracts warrant it. This planning pass ran no application tests or build because it changed documentation only.

### Manual acceptance matrix

1. **Photo-only session:** open Bilder before importing a survey file; import 10 JPEG/PNG/WebP files with portrait/landscape, Norwegian filenames and transparent PNG. Check all records, thumbnails, larger image fit, file facts and import progress. Close/reopen; the files and selection remain.
2. **Ordinary field batch:** import 50-100 phone/camera JPEGs around 3-10 MB, commonly 12-24 MP. Interact while thumbnails build, scroll to the final card, inspect several photos rapidly, close/reopen. Verify phone orientation and useful detail. Adding another batch appends rather than replaces.
3. **Target large collection:** try 200-300 realistic photos, including a few very large originals, on a representative browser/device. Record batch bytes, time to first thumbnail/completion, responsiveness and browser memory. There is no arbitrary first-100 truncation; every imported record is reachable. Expect progressive rendering rather than immediate completion.
4. **Error batch:** include HEIC/TIFF/SVG, an empty JPEG, a damaged JPEG, MIME-empty files, uppercase `.JPG`, identical filenames with different contents and a non-image document. Unsupported/corrupt records remain visible with explanations; rejected non-images are listed separately; good photos still work.
5. **Drop isolation:** while Bilder is open, drop a multi-photo batch on its upload area and elsewhere inside the dialog. One photo import occurs; survey parsing, layers and telemetry remain untouched; no browser file navigation/global overlay appears. Confirm ordinary survey drop still works after closing.
6. **Validator coexistence:** import GMI/SOSI/KOF before and after photos; add another layer; exercise existing table, field inspector, profile analysis and map/3D. Trigger a failed survey import and remove the final layer. Bilder remains accessible and originals survive until full reset.
7. **Reset/race:** start a batch, clear immediately during processing, and import a different batch. Old records never return. Repeat full `Nullstill og last opp ny` and photo-only clear, including while inspection is open. Owned URL counts return to baseline after cleanup; GC may lag. Repeat cycles to detect accumulation.
8. **Session and privacy:** reload and reopen Bilder: empty collection. Close/return through browser history as supported and check documented behavior. In DevTools Network, photo import/preview sends no photo payload, filenames or photo-triggered tracking request; existing map/analytics traffic may still occur. Storage contains no photo bytes/records/URLs.
9. **Accessibility/layout:** keyboard reaches import/cards/clear/close; selection is announced; Escape closes; focus stays in the modal and returns to the opener. Test 1366x768, short-height and narrow windows with other existing inspectors open. The original image respects aspect ratio and the collection remains scrollable.

## 8. Deferred future hooks

| Future concern | Architectural hook only |
| --- | --- |
| EXIF coordinates | A later reader uses `getFile(id)` and adds provenance-bearing coordinate metadata. No declared EXIF dependency currently exists. |
| DFOT (`TEMA=Div`, `TYPE=DFOT`) | Later adapter reads parsed survey layers and creates candidate photo-position metadata by stable photo ID. Do not treat DFOT as a photo record schema now. |
| Current/manual placement | Separate accepted placement from coordinate candidates. A future Leaflet photo overlay/controller reads ID-keyed placement and writes photo state independently of survey layers. |
| Direction | Optional independent value/provenance, absent until available; do not invent a heading or derive it from selection. |
| GML import/export | Later import/export adapters consume originals plus accepted metadata. No GML parsing, ZIP/Attachments packaging or schema work now. |
| Filtering/status | Add independent placement, source-coordinate availability and review dimensions; derive filters over the complete collection. Preview errors remain a separate technical state. |
| VA-object associations | Later optional relationships keyed by photo ID and survey object identity; no filename matching or associations now. |

Future map work would touch Leaflet `MapInner`, its click/measurement interaction modes, coordinate projection, view switching and center requests. Current `viewObjectInMap` couples centering to survey feature highlighting, and `MapCenterHandler` uses the current legacy dataset CRS plus an existing coordinate-order contract. A future photo camera/placement command needs explicit coordinate reference/order and its own identity; it should not pretend a photo is a GMI point or inherit the latest layer's CRS. No map/layer state changes are needed in milestone 1.

## 9. Recommendation: implementation prompt boundaries

The next coding prompt should authorize exactly this vertical slice:

> Implement session-only photo collection import and inspection in the existing GMI Validator. Add Bilder access on the initial/error screen and persistent product header. Open a large accessible collection dialog with a complete thumbnail grid and selected-original inspection pane. Support multiple picker and dialog-local drop imports, appending in order with unique IDs and duplicate-name preservation. Retain original File references outside persisted/devtools React/Zustand snapshots. Generate bounded thumbnails sequentially, show pending/error records, and retain unsupported image candidates with explicit preview errors. Keep JPEG/PNG/WebP as the promised preview formats. Implement correct Object URL ownership, stale-job cancellation, photo-only clear, full reset and page lifecycle cleanup. Preserve photos through dialog close, survey imports/errors, layer removal and map/3D changes. Prevent photo drops from reaching the existing survey loader while the dialog is open. Add focused lifecycle/state tests and run the realistic-batch acceptance checks in this report. Use existing Bokmål UI/design conventions and no new dependencies unless a demonstrated requirement makes one necessary.

Explicit exclusions for that prompt: EXIF extraction/positioning; S_HYPERLINK matching or resolving local paths/remote links; DFOT processing; photo map markers, placement/editing, coordinate zoom actions or direction; GML import/export; Attachments/ZIP export; VA-object relationships; placement/review filtering or statuses; a complete Photo Workspace/navigation redesign; server uploads or persistence; unrelated validator/map/telemetry/tooling refactors. Do not commit or push unless separately authorized.

Completion means the import-to-thumbnail-to-large-inspection flow works with complete collection visibility, retained originals and deterministic resource ownership, while existing validator behavior passes its focused checks. The future workspace entry is established by Bilder and the reusable collection/session seam, not by implementing the later workspace.

Terminal summary: focused review completed; recommendation is Bilder dialog + independent session asset registry + sequential thumbnail generation; application code unchanged; report saved; no commit or push.
