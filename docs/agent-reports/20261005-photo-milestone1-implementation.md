# Photo milestone 1: session collection and Bilder inspection

Date: 2026-10-05 (Europe/Oslo).

## Scope and baseline

Implemented the first non-spatial photo vertical slice: Bilder entry points, multi-file import/drop, one complete append-only collection until clear, bounded thumbnails, selection, original inspection, session retention, photo clear and full reset. The primary plan was `20261005-photo-milestone1-planning.md`, with the implementation request's refinements.

Worked directly on `feature/photo-workspace`, starting at `b29a810acd0237bd50a942846c12d724e8b22682` (`Polish object popup layout`). Inspected the current integration files before editing. No applicable AGENTS.md was found. No agents, commits or pushes were used.

The recent popup layout, hyperlink rendering/extraction/copy, Data Table search and map work were preserved. The only pre-existing working-tree change was `data/usage/aggregates.json`; it was not edited. Its SHA256 before and after browser checks was `D7864A33649A6B77CCFD2705DA9D642610FAF3F5FB353ADAEF9FCF2D481B89C4`.

## Files changed

| File | Purpose |
| --- | --- |
| `src/lib/photos/photoSession.mjs` | Private originals registry, immutable public snapshots, selection, ordered imports, sequential scheduling and clear/cancellation. |
| `src/lib/photos/imagePreview.mjs` | Candidate classification, thumbnail sizing/decoding/encoding/cleanup and Bokmål error messages. |
| `src/components/photos/usePhotoSession.js` | React `useSyncExternalStore` adapter with a stable empty SSR snapshot. |
| `src/components/photos/PhotoCollectionPanel.js` | Complete gallery and selected-original inspector. |
| `src/components/photos/PhotoCollectionDialog.js` | Large native modal dialog, import controls, local drop, progress and rejection summary. |
| `src/app/page.js` | Page-owned dialog/teardown, pre-survey/error entry, header wiring and global-drop isolation. |
| `src/components/ProductHeader.js` | Persistent Bilder button alongside the existing brand/info controls. |
| `src/components/WorkspaceShell.js` | Pass the Bilder opener to the header. |
| `src/components/GlobalFileDrop.js` | Two-line cleanup of drag counter/overlay state when listeners are removed. |
| `src/lib/store.js` | Narrow `photoSession.clear()` call inside `resetAll`. |
| `src/app/globals.css` | Additive photo-only layout styles. Existing styles retained. |
| `tests/photoSession.test.mjs` | Seven session/queue/resource tests. |
| `tests/photoPreviewLifecycle.test.mjs` | Eight classification/sizing/preview-resource tests. |
| `tests/photoResetIntegration.test.mjs` | Two actual store integration tests, including pending-work reset. |
| `tests/appInfoUiContract.test.mjs` | Update only the existing ProductHeader-props assertion for the new opener prop. |
| `docs/agent-reports/assets/20261005-photo-milestone1/*.png` | Four screenshots inspected during acceptance. |
| This report | Persistent implementation and verification record. |

No dependencies, lockfiles, parser code, validation rules, map/layer architecture, table search, hyperlink behavior or telemetry code were changed.

## Architecture and UI

`photoSession` is a small session-owned module with a testable factory. Original File objects remain private, retained by reference in a Map keyed by UUIDs (with a monotonic fallback). `getFile(id)` retrieves the exact original. Public snapshots contain file facts, dimensions and `preview` state, but no File or image bytes. Stable cached snapshots change only on publication. Nothing is added to Zustand persistence or devtools state.

Imports register the entire candidate batch immediately in order. Later imports append; identical filenames and repeated File objects receive distinct IDs. A valid existing selection survives append. Unsupported image candidates and empty/corrupt images remain records. Non-images are rejected with an import count and expandable filename summary. MIME and case-insensitive extensions determine candidates; known unsupported formats take precedence, including SVG. Unknown image MIME types remain unsupported records. No SVG rendering or conversion path was added.

The supported preview formats are JPEG, PNG and WebP. Each gallery card uses a thumbnail Blob URL. Original dimensions come from browser decoding. The default thumbnail longest edge is 320px, with no upscaling; JPEG quality defaults to 0.8. Both defaults are exported and configurable. PNG and WebP derivatives use PNG encoding to preserve alpha.

Bilder is accessible on the initial/error screen and the persistent product header, including while field validation is open. The native dialog uses approximately 94% of viewport width/height with margins, a desktop gallery/inspector split, and stacked panes below 700px. Gallery and facts can scroll independently. Header actions include import, photo-only clear and close. The inspector fits the selected original with preserved aspect ratio and displays filename, size, MIME, decoded dimensions and last-modified time. No pan/zoom/map controls were added.

Native `showModal()` supplies focus containment and inert background behavior. Escape closes; cleanup returns focus to a connected opener. This is an intermediate shell, not a final photo/map workspace. The Bokmål session notice explains loss on reload or full reset.

## Resource ownership and lifecycle

| Resource | Owner and release |
| --- | --- |
| Original Files | Private session registry; released on photo clear, full reset or page-owner teardown. |
| Temporary original decode URL | One thumbnail job; revoked in `finally` on success, failure or cancellation. |
| Temporary image/canvas | One thumbnail job; source removed, canvas backing dimensions reset to zero, local references released. Canvas is always thumbnail-sized. |
| Thumbnail Blob URL | Session registry; retained across dialog close/reopen, revoked on clear/reset/teardown or replacement. |
| Selected original URL | Inspector effect; one displayed-original URL, revoked on selection change, clear or inspector close/unmount. |
| Queued work | Session registry; clear drops the queue, increments its generation and aborts the active job. |

There is one scheduler, including across appended batches and clear/reimport. It yields between jobs rather than decoding a batch with Promise.all. Abort races allow prompt decode/encoding cleanup; generation checks also reject late results from work that ignores cancellation. Thumbnail URLs are allocated only after a result passes the generation check, so stale successful work cannot recreate a record or allocate a retained thumbnail URL.

Closing Bilder leaves the registry intact. Survey add/remove/data-clear/error operations and map/view changes do not own it. Full reset calls the registry directly, covering reset callers beyond Home. Home unmount uses the same reusable clear operation; no navigation/pagehide/BFCache machinery was added.

While Bilder is open, the global survey drop component is disabled. Dialog drops consume all files and stop propagation. Capture listeners prevent default file navigation, including drops outside child controls. The local photo picker does not use the survey FileReader/parser pipeline. The normal survey listener resumes when the dialog closes.

## Automated tests and commands

The 17 new tests cover immediate complete registration/order/unique IDs/duplicate names; exact original retrieval; append/selection preservation; supported/unsupported/rejected classification; uppercase and unreliable/empty MIME; empty/corrupt failures and continued work; proportional bounded sizing; one-job concurrency; success/failure/cancellation cleanup; alpha-preserving encoding; idempotent clear; ignored late success/failure; reimport; ordinary store operations; full and pending-work reset.

Executed:

```text
git status --short
git branch --show-current
git log -5 --oneline
git show --stat HEAD
node --test tests/photoSession.test.mjs tests/photoPreviewLifecycle.test.mjs tests/photoResetIntegration.test.mjs

node --experimental-loader ./tests/esmJsLoader.mjs --test tests/photoSession.test.mjs tests/photoPreviewLifecycle.test.mjs tests/photoResetIntegration.test.mjs tests/dataInspectorStacking.test.mjs tests/dataInspectorConstrainedHeight.test.mjs tests/mapPaneToolbar.test.mjs tests/profileAnalysisLayout.test.mjs tests/profileAnalysisActiveDataCrash.test.mjs tests/tableSearch.test.mjs tests/hyperlinkFilenames.test.mjs tests/featurePopupContent.test.mjs tests/objectTableInspection.test.mjs tests/layerOrder.test.mjs tests/richerUsageTelemetryParserIntegration.test.mjs

node --test tests/appInfoUiContract.test.mjs
node node_modules/eslint/bin/eslint.js src/lib/photos/*.mjs src/components/photos/*.js src/components/GlobalFileDrop.js src/components/ProductHeader.js src/components/WorkspaceShell.js src/app/page.js src/lib/store.js
npm.cmd run build
git diff --check
node node_modules/next/dist/bin/next start -p 3100
```

Final combined focused/regression run: **106 passed, zero failed** (17 photo tests and 89 existing regression tests). These cover table/hyperlink/popup behavior, workspace/inspector/profile layout, layer ordering, parser upload completion and telemetry coexistence. Actual global drop behavior was exercised in the browser checks below; there was no existing dedicated GlobalFileDrop behavior suite.

Targeted ESLint: **passed without output**. Production build: **passed**, including compilation, page generation and final optimization. `git diff --check`: **passed**. Git printed the existing Windows LF-to-CRLF notices. Build printed the existing old Browserslist-data notice. Node printed loader/module-type and unavailable-browser-storage notices; the relevant tests passed.

The separate AppInfo UI suite has **11 passed, one pre-existing failure**: `AppInfo reclaims desktop height only in constrained viewports` expects the removed `.statistics-button--cue` CSS marker. Reproduced the same 11/1 result against HEAD versions of the test and every source it reads, using a temporary baseline harness. Left that unrelated stale assertion unchanged. The header integration assertion was updated and now passes.

Initial command corrections: PowerShell blocked `npm.ps1`/`npx.ps1`; used `npm.cmd` and the installed ESLint JS entry instead. One existing table test needed the repository ESM loader for extensionless imports; the loader-backed final run passes. A temporary Playwright install outside the repository failed with network EACCES, so browser verification used installed Chrome and Node's native WebSocket/CDP, without adding a dependency. Initial Chrome sandbox child-process failures were avoided with a headless temporary-profile `--no-sandbox` run inside the existing execution sandbox. Temporary acceptance scripts/screenshots were written under the OS temp directory. No approval escalation was used.

## Browser acceptance actually completed

Used the production build in installed headless Chrome, an isolated temporary profile, and Testmodus. Inputs were synthesized as browser File objects and dispatched through the real picker/change or drag/drop handlers. Screenshots were opened and visually inspected. This is browser-driven acceptance with synthetic files, not a human OS file-picker/drop session or a real camera corpus.

| Check | Actual result |
| --- | --- |
| A: no survey loaded | JPEG/PNG/WebP imported; three cards, decoded thumbnails and large originals. Selected different records, closed/reopened; collection and selection survived. Gallery URLs were derivatives. |
| B: batch | **Synthetic substitute only:** 75 distinct File records containing a 4000×3000 JPEG, 7,569,687 bytes each; all cards registered immediately. Last card was selected/scrolled to while work ran. Thumbnails finished in approximately 16.2s in this environment. A second import appended to 76 without losing selection. Real varied phone/camera batch remains a follow-up. |
| C: duplicates | Two files named `same.jpg` remained separate cards; selected-photo identity remained independent of filename. Automated tests also retrieve each distinct original. |
| D: errors | HEIC/TIFF/SVG candidates remained visible unsupported records; corrupt JPEG and empty JPEG remained error cards. `notes.txt` was named in the rejection summary. A good JPEG in the same drop continued successfully. |
| E: isolation | Multiple files dropped on the inspector imported once into Bilder. Instrumented survey FileReader calls remained zero during photo-only flows. After close, a window-level GMI drop caused exactly one survey read and opened the workspace. |
| F: coexistence | Loaded GMI after photos and reopened the retained original from the header. Also imported a photo after GMI while Data Table was open; table stayed open, raw S_HYPERLINK and its filename-copy control remained present. Opened field validation (15 errors/8 checks for the deliberately incomplete synthetic point); the Leaflet map/point and table stayed mounted, and Bilder retained the photo. A failed empty survey import kept the photo accessible on the error screen. External basemap tiles were unavailable in this restricted-network environment. |
| G: clear/reset | Three repeated import/close/reopen/clear cycles returned instrumented owned URL counts to zero. One original inspection URL existed at a time and disappeared on close. Clear during active work on a 50-file batch released owned URLs; a fresh import succeeded and old records did not return. Full toolbar reset cleared photos and survey workspace; error-screen full reset also cleared photos. Reload reopened an empty collection. |
| H: layout | Visually inspected 1366×768 desktop, 1366×500 short desktop and 600×700 stacked layout. At 1366×500 gallery height was 358px and original area 211px; at 600×700 gallery height was 254px and original area 164px. Dialog stayed within viewport; thumbnails/selected image/facts remained reachable. |
| Keyboard spot-check | Tab remained inside the native modal, Escape closed, and close returned focus to Bilder. No comprehensive accessibility audit. |

Successful coexistence/reset/reload browser run reported no uncaught Runtime exceptions. The larger initial harness stalled because it tried to serialize a DOM element through CDP; the corrected Boolean-based check and separate coexistence run passed. This was a harness problem, not evidence of an application import failure.

Screenshots:

- [Desktop photo-only, 1366×768](assets/20261005-photo-milestone1/desktop-1366x768.png)
- [Short desktop, 1366×500](assets/20261005-photo-milestone1/desktop-1366x500.png)
- [Narrow stacked layout, 600×700](assets/20261005-photo-milestone1/narrow-600x700.png)
- [Existing Validator, map point and Data Table coexistence](assets/20261005-photo-milestone1/validator-coexistence.png)

## Limitations, deferred work and follow-up

- No varied 50–100 real phone/camera-photo corpus was available in the repository. The synthetic batch verifies actual browser decoding/scheduling and complete reachability, but does not verify camera orientation, all metadata variations or representative device performance. Run that remaining acceptance case before broad field use.
- No browser heap/GC or native decoder-memory guarantee was proven. Bounded canvas/thumbnail derivatives do not eliminate full original decode costs. Instrumented URL cleanup proves owned-URL release in the tested cycles only.
- No comprehensive accessibility, cross-browser, real OS drag/drop, rotated-phone JPEG, transparent-PNG visual audit or actual 3D-rendering acceptance was completed. Store-level view independence was exercised; photo retention has no map/3D mount dependency.
- Existing Data Table search and clipboard logic passed regressions. Browser coexistence verified their UI presence/raw value and copy control, without asserting real clipboard permission behavior.
- Photos intentionally disappear on reload; there is no byte/metadata persistence, upload, base64, FileReader data-URL path, IndexedDB/localStorage/sessionStorage photo data, or export.
- EXIF/GPS/DFOT, hyperlink matching, photo map markers, positioning/movement/zoom/direction, GML, Attachments/ZIP/export, associations, workflow statuses, filtering and final workspace routing/architecture remain deferred. Preview state carries technical rendering meaning only.
- Future code can read originals with `getFile(id)` and extend independent ID-keyed metadata without changing file identity or overloading preview state. Tune the exported thumbnail defaults only from representative-device evidence.
- The unrelated stale AppInfo layout test should be repaired in a separate maintenance change using a reliable CSS-section boundary.

Terminal summary: Bilder milestone 1 implemented; 106 focused/regression tests pass; production build, targeted ESLint and diff check pass; one separately reproduced baseline AppInfo test failure remains; synthetic browser/layout/lifecycle/coexistence acceptance completed, real camera batch deferred; recent UI and pre-existing usage data preserved; no commit or push.
