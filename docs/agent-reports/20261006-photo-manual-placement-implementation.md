# Manual FOTO placement and movement — 2026-10-06

## Task summary and baseline

Implemented explicit manual placement/movement for the active photo in the existing FOTO workspace. Map clicks, proposal dragging and keyboard adjustment change a temporary proposal only. **Bruk plassering** accepts it; **Avbryt** or Escape leaves the accepted/current position unchanged. GML/EXIF evidence remains intact.

Repository: `C:\GitHub\gmi-validering-test`; branch: `feature/photo-workspace`; baseline and final HEAD: `7fb6f59 Add photo spatial workspace`. The initial working tree was clean. The accepted spatial planning and workspace implementation reports were read. Existing reports, dependencies, importer layouts and unrelated functionality were preserved. No commit, push, delegated agents or new dependency.

## UX model

- Unplaced active photo: **Plasser på kartet**.
- Placed active photo: **Flytt på kartet**.
- Starting either action creates no proposed point and writes no current position. It retains the user's map view.
- A compact inspector section explains clicking the map or pressing Enter on the focused map. Subsequent clicks refine the proposal.
- A proposal shows WGS84 coordinates and, for an existing position, approximate horizontal movement using **Flyttes ca. N m**. This uses the existing photo distance helper and does not imply survey accuracy.
- **Bruk plassering** is disabled until a valid proposal exists. **Avbryt** is always available.
- Hidden layers must be shown before placement. Hiding a layer during placement cancels the transaction without changing its data.
- Active inspection and batch selection stay independent. Placement never applies to a batch.

Accepted three-pane proportions remain unchanged: approximately **280 / 896 / 504 px** at 1680×900; **280 / 444 / 300 px** at 1024×620. At 390×700, existing 375 px stacked panes remain available by scrolling. Short/narrow confirmation controls were scrolled into view and checked for accessibility within the viewport.

## Transaction and domain semantics

Page-local `usePhotoManualPlacement` owns `{ ticket, position: null | proposedPosition }`. The proposal is never inserted into canonical photo records, map feature snapshots, Zustand or persisted storage.

`photoSession` issues an immutable ticket through `beginManualPlacement(layerId, photoId)`. Its guards include:

- ticket identity issued by this session, held in a WeakSet;
- session generation;
- live layer membership and visibility;
- a visibility version that prevents a hidden-then-shown layer from reviving an old ticket;
- identity of the accepted current-position object captured at the start.

`applyManualPlacement(ticket, position)` rejects stale, fabricated, foreign-session or invalid requests. On success it updates only the live record's spatial current, consumes the ticket and publishes once. Latest preview/EXIF/source fields survive. `cancelManualPlacement` invalidates a ticket without publishing a spatial write. UI cancellation, owner destruction and generation changes prevent stale proposals from applying later.

Tickets own no Files or object URLs. Their WeakSet membership does not retain abandoned transactions indefinitely.

## Data and provenance

The canonical external photoSession model remains authoritative. Accepted manual current is deeply immutable:

```js
spatial: {
  candidates: [/* existing immutable GML/EXIF evidence, unchanged */],
  current: {
    position: { crs: 'EPSG:4326', longitude: 10.4397207, latitude: 59.2271128 },
    basis: { kind: 'manual' },
    acceptance: 'manual',
    acceptedAt: 1791300000000
  },
  exifRead: /* existing metadata-read state */
}
```

`acceptManualPhotoPosition` validates finite geographic values/bounds through the existing strict photo position check. It keeps only canonical horizontal longitude/latitude; no altitude, vertical transform, fake source candidate or survey fallback is added. Leaflet world-wrap longitude is normalized before proposing a point.

Repeated manual moves replace current without growing candidate evidence or introducing edit history. Existing source labels already recognize **Manuell**. Explicit GML/EXIF use replaces manual current reversibly; the original source evidence remains inspectable. The unchanged wizard distance/classification logic compares its proposed source against manual current normally.

## Map interaction

A dedicated `PhotoManualPlacementLayer` renders the temporary proposal. The accepted selected camera marker remains as reference. The proposal uses a lightweight orange crosshair, 26 px visual glyph inside a 32 px interaction area, a raised pane and a thin dashed connector from the accepted position when present.

- Map click/reclick places or moves the proposal.
- Only the proposal marker is draggable. Releasing a drag updates the proposal; it never accepts current.
- Enter on the focused map proposes its center. Focused proposal arrow keys adjust by five screen pixels, or fifty with Shift. Marker title/alt explain the adjustment.
- Capture-phase click handling prevents ordinary feature popups, survey highlight clearing and measuring clicks from handling placement clicks. Map zoom/pan and Leaflet controls stay available.
- Pointer displacement and Leaflet drag/box-zoom guards prevent a pan gesture from becoming a proposal. Browser coverage exercises a map drag before the first placement click.
- Normal markers retain their accepted style and remain non-draggable. Their popup/selection handlers are disabled only during placement; normal behavior resumes immediately afterward.
- Development checks exposed an existing duplicate photo-popup opener whose ordering could open then immediately toggle-close the popup after editing. Normal clicks now use Leaflet's bound popup handler once; explicit Enter/Space handling remains accessible. This changes no popup content or survey popup implementation.
- Starting placement closes a pre-existing popup. Popup thumbnails still reuse generated resources outside placement.
- The first manually accepted photo in an otherwise unplaced session does not trigger automatic fitting. GML/EXIF and survey fitting retain their previous behavior; explicit candidate/current zoom still works.

## Safety and cancellation

Placement cancels on active-photo change, workspace entry/exit, layer hiding, photo/layer deletion, reset, and opening new/append import, removal confirmation or the positioning wizard/source recheck. Selecting a different source position invalidates a pending manual ticket through current identity. No action silently accepts a proposal.

Escape cancels placement and restores focus to its entry button. An open native modal/lightbox retains its own Escape semantics. Apply/cancel focus restoration and handler cleanup use the existing workspace, without reopening a collection modal.

The original preview URL lifecycle is unchanged. Map proposal operations create no original-image URLs. Source Files remain private/read-only. Reload restores no placement, photo layer or spatial state.

## Files changed

| Area | Files |
| --- | --- |
| Domain | `src/lib/photos/photoSpatial.mjs`, `src/lib/photos/photoSession.mjs` |
| Page/map integration | `src/app/page.js`, `src/components/MapInner.js` |
| New transaction UI | `src/components/photos/usePhotoManualPlacement.js`, `PhotoManualPlacementControls.js`, `PhotoManualPlacementLayer.js`, `photoManualPlacement.css` |
| Inspector/dialog entry integration | `PhotoCollectionPanel.js`, `PhotoSpatialInspector.js`, `PhotoWorkspaceCollection.js` in `src/components/photos/` |
| Marker/view behavior | `src/components/photos/PhotoMarkersLayer.js`, `PhotoMapController.js` |
| New tests | `tests/photoManualPlacement.test.mjs`, `tests/photoManualPlacementUi.test.mjs` |
| Report | This file |

13 application files, two test files and this report. No package changes, global styling changes, survey policy changes, Data Table changes, survey popup implementation changes, hyperlink-copy changes or GMI-source implementation.

## Tests, build and lint

- **199 focused/regression unit tests passed**, including 12 new manual-placement tests. Coverage includes no-op begin/cancel, single publication, placed/unplaced counts/features, immutable manual normalization, source reversibility, exact-current cancellation, other member preservation, wizard manual comparisons, invalid/stale/foreign/fabricated tickets, hide/show invalidation and both EXIF/thumbnail completion orders around manual acceptance.
- **Seven production Chrome suites passed, none skipped:** manual placement, append duplicates, import layouts, workspace/lightbox, positioning wizard, spatial UI/survey coexistence and Terrain parser/actual EXIF integration. The final manual suite was rerun successfully after strengthening short/narrow control reachability and survey-click suppression.
- **The final manual suite also passed on development localhost:3000**, including actual pan displacement without proposing a point, proposal dragging, Enter/arrow/Escape controls, and normal popup click/Enter/Space after editing. Gesture tests allow layout/resize completion and animation frames; URL checks isolate the selected original preview from temporary thumbnail decoder URLs. Temporary diagnostics were removed before this passing run.
- **Production build passed** on final source (Next 16.1.6). Existing Browserslist-data notice remains unrelated.
- **Targeted ESLint passed** for changed page/photo/domain/test files. `MapInner.js` retains the baseline's **eight errors/four warnings**; comparison of rule/severity/core message signatures against committed baseline found no additional findings. Source-context line numbers naturally moved. This is not a repo-wide clean-lint claim; unrelated baseline issues were preserved.
- **`git diff --check` passed**. New files were also checked for trailing whitespace.

Browser execution used the repository's installed Chrome/CDP harness and isolated temporary profiles, closed in `finally`. The in-app browser bootstrap still fails with its previously documented sandbox-policy metadata error. No new browser dependency was installed.

Reproduce with the built application running:

```powershell
$env:PHOTO_UI_URL='http://localhost:3100'
$env:PHOTO_GML_FIXTURE='C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml'
$env:PHOTO_SCREENSHOT_DIR=Join-Path $env:TEMP 'gmi-photo-manual-placement-production'
node --test --test-concurrency=1 tests/photoManualPlacementUi.test.mjs tests/photoAppendDuplicatesUi.test.mjs tests/photoDialogLayout.test.mjs tests/photoWorkspaceUi.test.mjs tests/photoPositioningUi.test.mjs tests/photoSpatialUi.test.mjs tests/terrainPhotoGml.test.mjs
```

## Real-corpus browser acceptance

Read-only Ekenesstokken fixture, the 148 JPEGs and matching Terrain GML:

1. Photos-only layer: 148 EXIF candidates remain unplaced. Click/reclick/cancel and drag/cancel leave zero accepted markers. Enter/arrow-key/Escape flow also leaves zero.
2. Explicit manual confirmation creates exactly one accepted marker and updates placed/unplaced counts; inspector shows **Manuell**. No extra original URL is created and no initial-fit jump occurs.
3. Real GML layer: **148 marker records / 136 distinct locations**. During proposal, all accepted marker transforms and current coordinates remain unchanged. Confirmation changes exactly one marker and retains 148 records.
4. GML and EXIF raw provenance remains identical after manual apply. Opening EXIF wizard identifies exactly one moved photo against manual current; cancelling preserves that current. Explicit GML then EXIF acceptance and another manual move remain reversible.
5. Active selection, append modal, positioning modal, visibility, exit, confirmed member removal and hard reload safely discard proposals. Removing the active edited member leaves 147 markers and a valid remaining layer. Domain tests separately cover direct layer deletion/reset during a live ticket.
6. Normal marker click after exit opens the compact popup only and allocates no original URL; its action enters the workspace correctly.
7. With the repository's synthetic GMI survey present, a DOM click through a survey feature during placement produces no survey popup. The unrelated external GMI fixture was not inspected or parsed as a photo source.
8. 1680×900, 1024×620 and 390×700 passed. Screenshots of accepted/proposed reference markers, connector, instructions and reachable confirmation controls were visually inspected. Narrow layout remains a scrolling stack rather than a new mobile editor.

Artifacts are outside git in `%TEMP%\gmi-photo-manual-placement-production`; unit/browser logs are `%TEMP%\gmi-photo-manual-unit.log`, `gmi-photo-manual-browser.log`, `gmi-photo-manual-final-browser.log` and `gmi-photo-manual-dev-final.log`.

## Source integrity and preservation

Original hashes still match the accepted workspace report:

- GML SHA-256: `667bbeb9c9b0094bc9ff3f9848564557c4b8b6f298717985145a2f244ca2ee5d`.
- Sorted 148-JPEG `(filename, SHA256)` manifest SHA-256: `6576b4fe8cadd579d891224493d7c823568b3cda372250de8a75b3964842eb1d` (ASCII JSON, compact separators).

No source file was rewritten/re-encoded. Existing planning/spatial/workspace reports remain unchanged in git, as do dependency files. Temporary production server stopped and development localhost:3000 restored for review. HEAD/branch unchanged; no commit/push.

## Known limitations and next milestone

No undo/full audit history; only latest accepted manual current and existing immutable source evidence. Drag coordinates are reflected in the inspector on release. Approximate horizontal distance is for comparison, not positional accuracy. Exact-overlap photos remain distinct without a chooser, clustering, jitter or spiderfying. Short/narrow users scroll between map and inspector. Subjective final product acceptance remains with the user; no functional blocker found in these checks.

Export, direction/date/photographer editing, object associations, persistence and GMI/DFOT-derived photo positions remain deferred. Recommended next milestone: **a focused GMI/DFOT audit before implementing the GMI positioning-source adapter**.
