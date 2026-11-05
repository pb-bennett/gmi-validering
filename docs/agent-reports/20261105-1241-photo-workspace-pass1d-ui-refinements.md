# FOTO workspace Pass 1D — final UI refinements

Date: 2026-11-05, Europe/Oslo. Branch: `feature/photo-workspace`. Starting HEAD: `d868571` (`Polish photo workspace controls and map popups`). The Pass 1B and 1C reports were read before editing. The only initial working-tree entry, `docs/agent-reports/20261104-1823-photo-export-overhaul-planning.md`, was untracked and has been preserved. Nothing was committed, pushed or deployed.

The brief refers to five changes but specifies six sections. All six are implemented.

## Summary

| § | Change | Result |
| --- | --- | --- |
| 1 | Provenance dots | 8 px circular dot on the bottom-left corner replaces the 17 px square badge |
| 2 | Hover preview | Dark, photo-first frame with a compact caption |
| 3 | Image quality | Real softness confirmed; the cause is different from the suspected one. Fixed with on-demand 800 px previews |
| 4 | Clicked popup | Dark photo stage, light metadata, discreet close button |
| 5 | `Lagre endringer` hover | Cause found and fixed; hover stays dark |
| 6 | File drag feedback | Shared, non-blocking overlay for the app and the import wizard |

## 1. Provenance dots

The square badge and its Phosphor glyph are gone from thumbnails. `.photo-thumb` clips its content, so the dot is a sibling inside the marker root. That lets it sit on the border instead of being cut off. It is 8 px overall (a 6 px colour core with a 1 px white outline), uses the existing provenance colour, and keeps `role="img"` and its source description.

Stack counts, direction arrows, selection rings and Edit handles are unchanged, and the shared renderer applies it in both the workspace and the main map. The workspace legend now shows matching dots in thumbnail mode. Camera-marker glyphs are unchanged, and the popup's placement line keeps its glyph.

The main-map legend has no source key, so the hover caption now carries the source: a dot and a short label such as `GMI`.

## 2. Hover preview

The white space came from the caption, not the image. A long filename forced the figure to 220 px while a portrait image stayed about 165 px wide and left-aligned.

The preview is now a fixed 220 px dark frame using `--gmi-ink`, with `object-fit: contain`. Portrait photos get dark sides; landscape photos fill the width. The tooltip arrow matches the frame. The caption is one line: dot, ellipsised filename and source label.

The frame height comes from the known photo dimensions before the image loads, so Leaflet positions the tooltip once. The 250 ms delay and the existing popup suppression are unchanged.

## 3. Image quality investigation

**The suspicion was partly right.** Enlarged views did reuse thumbnail-resolution images and were visibly soft, but they were not enlarging a 44 px image.

### Traced sources (before this pass)

| View | Source | Display size |
| --- | --- | --- |
| 44 px map thumbnail | `photo.preview.thumbnailUrl` | 40 px inner box, `object-fit: cover` |
| Hover preview | Same URL | Up to 220 CSS px |
| Clicked popup | Same URL | Up to about 340 CSS px wide, 300 px tall |
| Stack navigation | Each member's same URL | As popup |

There is one derived image per asset: a JPEG with a 320 px long edge at quality 0.8, about 20 KB. No separate 44 px file exists.

### Why it looked soft

Every view shares that 320 px image, and the effect depends on the display's pixel ratio. Enlargement factors below are calculated from those sizes:

| Device pixel ratio | Hover (portrait) | Popup (portrait, 240×320 source) | Popup (landscape, 320×240 source) |
| --- | --- | --- | --- |
| 1 | None | None | 1.06× |
| 1.25 | None | 1.17× | 1.33× |
| 1.5 | 1.03× | 1.41× | 1.59× |
| 2 | 1.38× | 1.88× | 2.13× |

Windows laptops commonly run at 125–150 %, so this is the likely real-world case. A side-by-side at DPR 1.5 with a corpus photo showed a clear loss of detail compared with an 800 px source.

### Ruled out

Poor canvas resampling was tested and is **not** the cause, so thumbnail generation was left alone. Output for `imageSmoothingQuality` low and high was identical (mean difference 0), with 32.03 dB PSNR for all three settings against an exact box-average reference across 25 sampled photos. Edge sharpness matched a step-halved downscale (20.62 vs 20.49). This was measured in headless Chrome with `--disable-gpu`; a GPU-backed canvas was not measured.

### Corpus facts

All 148 JPEGs are portrait (no landscape files). None has an EXIF orientation tag. Long edges are 1920–2600 px.

### Fix

- `src/lib/photos/photoDisplayPreviews.mjs` adds an on-demand cache. It reuses `createPhotoThumbnail` with an 800 px edge at quality 0.85.
- It decodes one image at a time, newest first. Requests for the same photo share one job, and work nobody is waiting for is cancelled.
- The cache holds 24 entries, about 3.5 MB at the measured 146 KB average, and revokes the least recently used URL.
- `photoSession.requestDisplayPreview()` owns the URLs and releases them with the asset. Originals no larger than the thumbnail reuse it without decoding.
- Hover and popup show the thumbnail immediately, then swap to the preview only if it still belongs to the same photo. Nothing is processed at import or per layer.

Measured cost per preview in headless Chrome: about 23 ms decode plus 13 ms resize and encode, sampled over 25 photos. The 800 px edge covers the popup up to a device pixel ratio of about 2.3.

**Contract change:** earlier tests required that map inspection never create an original File URL. Each preview now creates one short-lived decoding URL, revoked as soon as decoding ends. No long-lived original URL is held.

## 4. Clicked popup

The photo stage now uses `--gmi-ink`, so portrait photos sit against dark side areas. Metadata and actions keep the light theme. The close control is a translucent dark circle with a white icon and a white focus ring. The filename, placement source, same-location navigation, `Åpne i bildemodul`, `Bildedetaljer` and repeated-placement context are unchanged, and no interaction logic changed.

## 5. `Lagre endringer` hover

**Cause:** the button combined `gmi-compact-button` and `gmi-primary-control`. The compact hover rule (`:hover:not(:disabled)`) is more specific than the primary background, so it set a near-white background beneath the primary control's white text.

**Fix:** Save no longer uses the compact class. Scoped rules in `photoEdit.css` give it a slightly lighter navy on hover and a darker shade when pressed, at full opacity. The focus ring is unchanged. The shared recipes are untouched, and this was the only button in `src` that combined the two classes. Save and Discard behaviour is unchanged.

## 6. File drag feedback

### What was found

The brief states that there was no indication. A real overlay already existed on the normal app, so the actual gaps were narrower:

- In the **FOTO workspace** the handler is disabled, so nothing appears. This is probably what was seen in use.
- The overlay was heavy (blurred, opaque card) and intercepted drops.
- After a CDP-cancelled drag it stayed on screen.
- Dropping an image on the loaded app replaced the map with the `Feil ved lasting av fil` page.

### Implementation

`GlobalFileDrop` remains the only window-level handler, with no competing listeners. New shared pieces:

- `src/lib/fileDragState.mjs`: file-drag detection and a tracker for nested events.
- `src/components/useFileDragTracker.js`: one tracker per drop region.
- `src/components/FileDropOverlay.js`: presentation only, using `pointer-events: none`.

The overlay is a dashed teal outline with a 12 % tint and no blur, so the interface stays recognisable. Wording:

| Region | Message |
| --- | --- |
| Normal app | `Slipp filer her for å importere` + `Støtter .gmi, .sos/.sosi og .kof, én fil om gangen` |
| Import wizard, photo step | `Slipp bilder her`, inside the dialog |
| Wizard, later steps | No overlay; the drop stays ignored |
| FOTO workspace | No overlay, because there is no drop target |

The hint mentions one file because the existing handler only reads the first. Import routing and the new-layer/append choice are unchanged.

Nested events use a depth counter. A dragover heartbeat with a 1.5 s timeout clears the state if a `dragleave` never arrives.

### Behaviour changes to review

These go slightly beyond visual feedback. They were needed to meet "sensible unsupported types" and "do not block the drop":

1. **Files that cannot be survey data are refused during the drag.** The first file's image, video, audio or PDF MIME type gives a grey message and a no-drop cursor. Later files cannot override that decision. Survey formats report no MIME type and remain provisionally accepted. At drop time, both application drop paths check the first filename before invoking the loader: `.gmi`, `.sos`, `.sosi`, `.kof` and the existing `.txt` sniffing path remain eligible; other extensions are ignored without changing file/parsing state. See the final stabilization notes below.
2. **File drags are blocked where there is no target** (workspace, parsing). This prevents the browser's default file-open action from losing the in-memory session. Headless CDP did not reproduce that navigation, so this is a defensive guard rather than a reproduced defect.
3. **Drops now reach the page.** A drop on the `FileUpload` zone reaches that zone, and `GlobalFileDrop` skips drops it already handled (`defaultPrevented`), so each drop imports once. As a result, a drop on the zone in `Legg til nytt lag` now closes that dialog through its own `onComplete`.
4. **`FileUpload` drag state** now ignores non-file and refused drags, and no longer flickers across its own children.

## Files changed

New application files:

- `src/lib/fileDragState.mjs`
- `src/lib/photos/photoDisplayPreviews.mjs`
- `src/components/FileDropOverlay.js`
- `src/components/useFileDragTracker.js`

Changed application files:

- `src/app/globals.css`
- `src/components/FileUpload.js`
- `src/components/GlobalFileDrop.js`
- `src/components/photos/PhotoEditCommandBar.js`
- `src/components/photos/PhotoImportWizard.js`
- `src/components/photos/PhotoMapDisplayCard.js`
- `src/components/photos/PhotoMapPopup.js`
- `src/components/photos/PhotoMarkersLayer.js`
- `src/components/photos/photoEdit.css`
- `src/components/photos/photoWorkspace.css`
- `src/lib/photos/photoMarkerPresentation.mjs`
- `src/lib/photos/photoSession.mjs`

New tests:

- `tests/fileDragState.test.mjs`
- `tests/photoDisplayPreviews.test.mjs`
- `tests/photoWorkspacePass1dUi.test.mjs`

Migrated tests:

| File | Reason |
| --- | --- |
| `photoMarkerPresentation`, `photoMarkerProvenanceUi`, `photoWorkspaceStacksUi` | Badge to dot; source now read from `data-position-source`, with added size, corner, colour and no-glyph checks |
| `photoWorkspaceEditUi` | Filename selector; the caption now also holds the source |
| `photoWorkspaceUi` | Popup now makes exactly one decoding URL (was zero); zero live originals is still asserted, and the list must keep its thumbnail |
| `photoManualPlacementUi` | Two popup checks now wait for the decoding URL to be revoked; a leak still fails them |
| `dataInspectorStacking` | The z-index 10005 contract now reads `globals.css`; the layer value is unchanged |

## Final stabilization: mixed-file drops

The final pass started from the existing uncommitted Pass 1D tree on `feature/photo-workspace`, HEAD `d868571`, after checking Git status. The export planning report remained untracked and byte-identical (SHA-256 `34F7D8B2032F31BEB80B80ECD8D0E19F86415DEE74F9F02C31CC339ED3DC9604`).

**Cause:** `surveyFileDragAccepted` used `every` to refuse a selection only when all file items had a known non-survey MIME type. An image followed by a survey file therefore appeared accepted, although routing still passed only `files[0]` to the loader. Separately, `FileUpload.onDrop` skipped refusal validation altogether. Either path could start parsing the image and replace the normal application with the import-error view.

**Targeted fix:** drag feedback now checks the first file item, ignoring string items and all later files. A shared `surveyFileDropAccepted` validates the first filename when names become readable on drop. Both `GlobalFileDrop` and `FileUpload` call that guard before `handleFile`, so refused files never reach `setFile`, `startParsing` or error handling. Drops still call `preventDefault`, clear drag feedback, and preserve the existing `defaultPrevented` handoff between the local zone and the window handler. No selection is searched for a later eligible file, and only the first supported file is imported once. Parsers, format detection, layer creation, the photo wizard and workspace gating are unchanged.

Only these files were edited during stabilization (including files already untracked from Pass 1D):

- `src/lib/fileDragState.mjs`
- `src/components/GlobalFileDrop.js`
- `src/components/FileUpload.js`
- `tests/fileDragState.test.mjs`
- `tests/photoWorkspacePass1dUi.test.mjs`
- This existing completion report.

**Regression coverage:** unit assertions cover image/PDF-first versus survey/text-first mixed selections, uppercase survey extensions, the existing `.txt` route, empty transfers and unsupported filenames even with an empty MIME type. Browser coverage adds image-first rejection on the landing upload zone, mixed refusals on a loaded map and in `Legg til nytt lag`, a non-survey ZIP first, supported-first mixed imports through both handlers, and a later second survey file that must not be imported. Refused drops preserve the mounted document/map, URL, persisted state, marker identities and thumbnail URLs; reopening the workspace verifies every photo's layer membership and reads an original File successfully. Runtime-exception and image URL ownership assertions remain in place, as do the existing transaction assertions in the full selection.

Real Chrome/CDP drags test feedback and normal supported drops. Chrome can suppress the native `drop` event after `dropEffect='none'`, so the regression also dispatches a cancelable DOM drop carrying real Files to exercise the refusal handler directly and assert `defaultPrevented`. The add-layer snapshot is taken after opening the dialog, because opening it legitimately updates `lastActive`; every subsequent refused drop must preserve that snapshot exactly.

## Verification

Final stabilization browser tests used headless Chrome over CDP against `next start -p 3110` on the final production build. Feedback and normal drops use real CDP drag events; the extra delivered-drop checks are described above. The real Ekenesstokken GML and its 148 JPEGs were available at `C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder`. Initial Pass 1D screenshots were reviewed by eye and stored outside Git; stabilization reruns did not regenerate screenshots.

| Check | Result |
| --- | --- |
| Production build | Pass (`npm run build`). No application/style file changed after this build |
| ESLint on all 13 changed/new JS/MJS application files and 10 changed/new tests | 0 errors, 1 warning. The warning is the existing `detectFormat` dependency in `FileUpload.js`, in code not changed here |
| `git diff --check` | Clean apart from the normal LF→CRLF notices |
| Focused drag selection (`fileDragState`, `photoWorkspacePass1dUi`), with corpus | 19 tests: 19 pass, 0 fail, 0 skip |
| Domain selection (`tests/*.test.mjs` except `*Ui.test`, `*Browser.test`, `terrainPhotoGml`) | 1,260 tests: 1,249 pass, 6 fail, 5 skip |
| Fresh isolated `d868571` export: the three affected baseline contract files | 22 tests: 16 pass, the same 6 fail, 0 skip |
| Complete photo/GMI browser selection (all `*Ui.test.mjs` except `statsChartUi`), with corpus | **83 tests: 82 pass, 0 fail, 1 skip**, 330.7 s |
| Gemini WFS reference/workflow/popup browser + reference/semantic presentation + popup content regressions (expanded selection) | 81 tests: 81 pass, 0 fail, 0 skip |
| Additional Gemini selection: all `gemini*Browser` suites + `geminiWorkflowUi` | 107 tests: 107 pass, 0 fail, 0 skip |

**Domain failures:** the six are identical by name on the fresh clean HEAD export and with this work, so they are pre-existing. They are three `validationV2WorkspaceInspector`, two `statsUiContract` and one `appInfoUiContract` contract. This selection keeps the `*UiContract` files, which is why it reports more than Pass 1C's three. The initial Pass 1D run also compared the entire domain selection on HEAD: 1,244 tests, 1,233 pass, the same 6 fail and 5 skip. No new domain failures were found.

**Previous browser failure resolved and verified:** the earlier full run reported 79 pass, 1 fail and 1 skip; the failure was `photoManualPlacementUi` reading the URL count while a display-preview decoding URL existed. Its migration waited for that temporary URL to be revoked, and the earlier targeted rerun passed, but a post-reload assertion was restored afterward. The stabilization full run above exercised the exact final version, including that restored assertion, and the complete manual-placement suite passed (34.6 s). No tests were weakened or removed; runtime-exception, resource ownership and transaction assertions remain. The only browser skip is the already-documented private G01/G04 corpus, unavailable on this machine.

**Final-version assurance:** all final application changes were included in the successful production build. The final focused drag run and full browser selection both exercised the final regression tests, including the real-JPEG EXIF subtest. SHA-256 checks of all 26 changed/new application, style and test files confirmed no changes during or after the full selection; only this report was updated afterward. The earlier no-corpus synthetic Pass 1D run (11 pass, 1 EXIF skip) was not repeated during stabilization.

Reproduction setup: `PHOTO_UI_URL=http://localhost:3110`, `PHOTO_GML_FIXTURE=C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml`; Node tests used `--test-concurrency=1` for the browser selections. The complete selection was built with `Get-ChildItem tests -File -Filter '*Ui.test.mjs' | Where-Object { $_.Name -ne 'statsChartUi.test.mjs' }`. Gemini regression files were `geminiReferenceBrowser`, `geminiWorkflowBrowser`, `geminiPopupBrowser`, `geminiReferencePresentation`, `geminiSemanticPresentation` and `geminiPopupContent`; the additional selection included every `gemini*Browser.test.mjs` plus `geminiWorkflowUi.test.mjs`.

Final logs are outside Git under `%TEMP%`: `photo-pass1d-stabilization-drag.log`, `photo-pass1d-stabilization-browser.log`, `photo-pass1d-stabilization-domain.log`, `photo-pass1d-stabilization-baseline.log`, `photo-pass1d-stabilization-gemini-regression.log`, `photo-pass1d-stabilization-gemini.log` and `photo-pass1d-stabilization-eslint.log`. The exact browser file list and tested-file hashes are recorded alongside them.

**Readiness:** Pass 1D is ready for Git review and test-branch deployment, with the six unrelated baseline contract failures and the remaining human/device checks below explicitly recorded. Nothing was committed, pushed or deployed.

**Regressions caught by comparing with HEAD:** `dataInspectorStacking` pinned the old overlay class. Also, a resumed drag kept a stale accepted/refused message, which is fixed by updating it on dragover.

New browser coverage, at 1920×1080, 1366×768 and 1280×720 where relevant:

- Dot size, shape, corner position and stack separation. All four provenance kinds are covered by the migrated provenance and stack suites.
- Hover colours, arrow, frame geometry and aspect ratio for portrait and landscape.
- Display previews reaching 800 px, decoded once per photo across viewport changes, with no eager processing.
- Slowed decoding with rapid hover and rapid stack paging, using a pixel comparison against each photo's own thumbnail to catch stale images.
- A real JPEG with an injected EXIF Orientation 6 tag, matching its thumbnail.
- Popup colours, containment, portrait side areas and opening the shown member in the module.
- Save button rest, hover, pressed and focus states with contrast of at least 4.5:1.
- Drag enter, nested moves with a mutation observer for flicker, cancel, drop, refused files, one import per drop, the wizard, the workspace, internal text drags and map panning.

## Remaining limitations

- **Real Explorer drags and the Windows no-drop cursor** were not exercised; only CDP drags were. Please confirm in the checklist.
- **Landscape coverage** uses corpus JPEGs rotated by Chrome, because the corpus has no landscape photos.
- **High-DPI rendering** was not run as a browser test. The table in §3 is calculated, and the side-by-side was a canvas simulation of DPR 1.5.
- **GPU-backed canvas** thumbnail resampling was not measured.
- **Dot over arrow:** a direction arrow pointing near south-west passes under the dot, though the arrowhead stays visible.
- **Top edge of the map:** the hover preview still always opens upwards, so it can be clipped for markers near the top. This is unchanged.
- **Protected drag metadata:** before drop, browsers can conceal names and expose an empty or generic MIME type. Such a first file remains provisionally accepted in the overlay; the filename guard safely refuses unsupported extensions when dropped. Known image/video/audio/PDF-first mixed selections show refusal during the drag.
- **Live authenticated Gemini WFS** and touch input were not exercised beyond the existing suites.

## Exclusions confirmed

No changes were made to photo import or positioning semantics, spatial Edit transactions or geometry, EXIF/GML evidence acceptance, capture-time conflict handling, export plans, serializers or packages, Gemini WFS or authentication, the full-screen viewer, `Fullfør opplysninger…` or the export wizard.

## Browser acceptance checklist

- [ ] Check dots on light, dark and busy photos, including selected, stacked and Edit-mode thumbnails, in the workspace and main map.
- [ ] Hover portrait and landscape thumbnails: dark frame, no white, compact caption, gone on mouse-out.
- [ ] On your normal display scaling, compare hover and popup sharpness with the previous version.
- [ ] Sweep quickly across thumbnails and page quickly through a stack: the shown image should always match its filename.
- [ ] Click a portrait photo: dark side areas, light metadata, discreet close button, and it fits at 1366×768 and 1280×720.
- [ ] In Edit mode, stage a change and hover, press and tab to `Lagre endringer`; then Save and Discard.
- [ ] Drag a `.gmi` from Explorer over the app: overlay appears, does not flicker, and clears on leaving the window and on Esc.
- [ ] Drop it on the map, on the landing page zone and in `Legg til nytt lag`: exactly one layer each time.
- [ ] Drag a JPEG over the main app: grey message and no-drop cursor; the map stays.
- [ ] Drag over the FOTO workspace: no overlay, no import, session intact.
- [ ] Open `Legg til bilder` and drop photos: `Slipp bilder her` appears and the photos are added to the intended layer.
- [ ] Click normal GMI and Gemini WFS objects alongside thumbnails: normal popups and selection.

Automated results above are separate from these human acceptance boxes.
