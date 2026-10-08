# FOTO direction editing — 2026-10-08

## Task summary and acceptance status

Implemented operational photo direction editing and corrected marker centering for the manual-placement connector. The existing photo workspace, import ownership, spatial candidates, positioning wizard, original-image inspection and manual-placement transactions remain in place.

Repository: `C:\GitHub\gmi-validering-test`; branch: `feature/photo-workspace`; HEAD: `5e20290 Add manual photo placement`. No commit, push or sub-agents. `data/usage/aggregates.json` was already modified when work started and was left outside this task. Package manifests and lockfile are unchanged.

**Implementation and real Ekenesstokken corpus acceptance are complete.** After the fixture became available at `C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml`, with 148 JPEGs in the sibling `Attachments` folder, all eight production browser suites passed with no skips. The outstanding A–I checklist is completed below. Original GML/JPEG hashes are unchanged and match the previously recorded corpus hashes. No implementation defect was found; this follow-up changes only this report in the repository.

No GMI/DFOT parsing, export, date/photographer editing, object association, persistence or broad redesign was implemented.

## Unknown versus north

Every imported photo starts with `direction.current === null`, independently of its spatial state and raw metadata. Unknown is not zero. Entering the direction editor proposes `acceptedDegrees ?? 0`; it does not update the canonical record. Cancel leaves unknown null. Applying zero creates explicit known north.

The inspector displays **Retning / Ikke angitt** or **Retning / 42°**. The accepted value stays visible separately while editing. Unknown photos have no accepted map arrow; editing an unknown photo may show a temporary north proposal.

The Terrain parser continues preserving `raw.direction.valueText`, `unitText` and `referenceText`, corresponding to `retningsverdi`, `retningsenhet` and `retningsreferanse`. No source heading is promoted automatically, and manual heading edits do not rewrite source evidence or manufacture a spatial candidate. The real-corpus browser integration passed its assertions that all 148 legacy raw zeros remain evidence while all 148 operational directions initially remain null.

## Direction data model and domain API

The private session registry owns direction alongside spatial data. Public records expose immutable metadata:

```js
direction: { current: null }
// After explicit manual acceptance:
direction: {
  current: {
    degrees: 42,
    basis: { kind: 'manual' },
    acceptance: 'manual',
    acceptedAt: 1791400000000 // Illustrative timestamp; actual value is Date.now().
  }
}
```

`photoDirection.mjs` defines unknown initialization, normalization, immutable manual acceptance and compact cardinal labels. Only finite numeric degrees are accepted by the domain. Values wrap modulo 360 and round to the nearest integer: 360 → 0, −1 → 359, 359.8 → 0. Null, strings, NaN and infinities are rejected. The UI degree field requires an integer within 0–359; invalid/empty input disables Apply.

`photoSession.beginDirectionEdit(layerId, photoId)` issues an immutable ticket held in this session's WeakSet. Final apply checks ticket identity, session generation, live visible layer ownership, photo membership, visibility version and the identity of the previously accepted direction. A shared edit version invalidates older tickets when either direction or placement begins. Fabricated, foreign-session, consumed or stale tickets cannot write.

`applyDirectionEdit(ticket, degrees)` updates only the live record's direction, consumes the ticket and publishes once. Begin and cancel publish no canonical writes. Position identity is deliberately not a direction guard: positions and headings are independent. Late metadata and thumbnail updates retain the accepted direction and do not invalidate a direction ticket.

Future serializers can distinguish null current, explicit zero and explicit other degrees directly. No unknown-to-zero export policy is encoded.

## Transactional editor and adjustments

`usePhotoDirectionEdit` owns a page-local `{ ticket, degrees }` proposal and a ref for synchronous cancellation/application. Proposal changes never write to the session, Zustand or storage.

**Juster retning** reveals a compact editor:

- Native draggable slider, 0–359, step 1, with a 32 px interaction height and a visible proposed degree/cardinal label.
- Numeric integer degree field and −1° / +1° buttons. The buttons wrap between 359 and zero.
- Native slider arrow keys change one degree; Home/End reach the endpoints. No mandatory cardinal snapping or custom Shift behavior.
- Concise clockwise convention: 0° N, 90° E, 180° S, 270° W. Nearby labels also show NE, SE, SW and NW.
- **Bruk retning** applies explicitly; **Avbryt** and Escape discard the proposal and restore focus to the edit action. Native open dialogs retain their own Escape handling.

Unplaced photos can accept a direction independently; the editor explains that placing the photo enables its map indicator. Hidden layers must be shown before editing. The direction action subscribes to the photo session's layer visibility, fixing a browser-discovered disabled action that otherwise stayed cached after hide/show.

## Map direction indicator

Only the active selected photo has a heading indicator. Its camera glyph remains unchanged; a small outward arrow uses blue for accepted direction and orange for a temporary proposal. Unknown outside editing has no arrow. Selecting another photo removes the prior indicator.

The arrow is a 64 px SVG centered on the same Leaflet geographic anchor as the photo icon. An internal SVG group rotates around `(32, 32)`; north points up, and clockwise rotations produce east/right, south/down and west/left. Leaflet retains sole ownership of the outer marker translation/zoom transform. Pan and zoom do not change heading or rotation origin.

Browser assertions transform the actual arrow tip and origin into screen coordinates, checking cardinal and intermediate headings, proposal/accepted presentation, cancellation and alignment after real pan/zoom.

## Interaction safety, placement and wizard

Page-level entry handlers cancel both editing transactions on active-photo selection, workspace entry/exit, new/append import, removal confirmation and positioning-wizard/source-review opening. Starting placement cancels direction first; starting direction cancels placement first. The domain also invalidates their competing tickets. Nothing silently applies.

Session subscriptions discard direction proposals on removal, layer deletion, hiding and reset. Visibility versioning prevents old tickets becoming live after hide/show. Hard reload creates neither restored proposals nor persisted direction data. The real application reset integration verifies removal of accepted direction and rejection of a previously live ticket.

Manual movement changes only spatial current and retains direction. Direction changes retain the exact spatial object, evidence, preview, dimensions and original file. Explicit GML/EXIF candidate acceptance and both wizard paths retain the accepted direction. Wizard selection, matching, distance and acceptance semantics were not changed.

## Connector-anchor correction

The geographic connector endpoints and existing Leaflet anchors were already appropriate: camera icons are 30×30 with `[15,15]` anchors; the proposal is 32×32 with `[16,16]` anchor. Existing camera SVGs are 16 or 22 px, and the proposal SVG is 26 px, with symmetric graphic bounds about their viewBox centers. No coordinates, icon shapes or sizes were changed.

Centering previously depended on marker grid/flex display. Leaflet also supplies `.leaflet-marker-icon { display: block; }`, and its CSS is imported both globally and by the map; a later display rule can put the smaller SVG at the marker box's corner while the geographic anchor stays in its center. SVG children now use explicit absolute 50% positioning and child-only translation. This is independent of outer display and does not override Leaflet's marker transform.

The connector has a stable class assigned at Polyline construction, since Leaflet's className is not updated by setStyle. Browser checks compare actual SVG graphic bounds against normal/selected/proposal icon centers, also forcing `display:block` to reproduce the conflicting-rule case. They compare the rendered line's endpoints to current/proposal anchors across four proposal directions, drag and keyboard adjustment. Glyph-center tolerance is <0.01 px; line endpoint tolerance is 1.5 px for Leaflet projection rounding. These checks pass. Production/development screenshots were visually inspected.

## Files changed

| Area | Files |
| --- | --- |
| Direction model/session | `src/lib/photos/photoDirection.mjs` (new), `src/lib/photos/photoSession.mjs` |
| Marker geometry/presentation | `src/lib/photos/photoMarkerPresentation.mjs` (new), `src/components/photos/PhotoMarkersLayer.js`, `PhotoManualPlacementLayer.js`, `photoManualPlacement.css`, `src/app/globals.css` |
| Direction editor | `src/components/photos/usePhotoDirectionEdit.js`, `PhotoDirectionControls.js`, `photoDirection.css` (new) |
| Integration | `src/app/page.js`, `src/components/MapInner.js`, `src/components/photos/PhotoCollectionPanel.js`, `PhotoSpatialInspector.js` |
| Tests | `tests/photoDirection.test.mjs`, `tests/photoDirectionUi.test.mjs` (new), `tests/photoResetIntegration.test.mjs`, `tests/browser/photoSpatialChecks.mjs` |
| Report | `docs/agent-reports/20261008-photo-direction-implementation.md` |

14 application files, four test files and this report. Existing manual-placement controls/hook, wizard, parser and workspace collection implementations are unchanged.

## Validation

- **122 focused/domain regression tests passed; no failures or skips.** Includes 14 direction tests, all 12 manual-placement tests, actual application reset, session, spatial, projection, matching, workspace, preview, import/append and EXIF regressions.
- **Real-corpus production Chrome suites: eight passed, zero failures, zero skips.** Reran direction, manual placement, workspace/lightbox, positioning wizard, spatial UI/survey coexistence, append duplicates, importer layout, and actual browser XML/File/EXIF/session suites against the existing production build. Total duration: approximately 145 seconds. The parser/session suite passed eight internal checks, including its 148-photo section and the all-148 raw-zero/operational-null assertion. This replaces the initial run's five corpus-dependent skips; the earlier synthetic checks also passed.
- **Additional real-corpus canonical audit passed in Chrome.** Initially 148/148 operational directions were null and 148/148 raw GML values were `"0"`. Begin/cancel wrote nothing. Explicit north acceptance created one known 0° and left 147 unknown; a second explicit acceptance created 42° and left 146 unknown. Both candidate sources and both all-photo wizard paths retained known directions and all remaining nulls. Manual movement retained known north. Every spatial candidate's serialized evidence and every original File identity stayed unchanged. JSON representation retained explicit `current.degrees: 0` versus `current: null`. This audit ran from a temporary script and added no repository test or implementation changes.
- **Development Chrome direction suite also passed**, including actual placement drag/keyboard, pan/zoom, sources/wizard, lifecycle cancellation and desktop/short/narrow controls.
- **Final production build passed**, using locked Next 16.1.6 and unchanged dependency files. Existing Browserslist-age warning remains. The initial environment lacked the already-declared exifr package, and restricted Google Fonts access failed; dependencies were restored using the existing lockfile, and the build used authorized network access for the existing font download. No dependency was added to package files.
- **Targeted ESLint passed** for all changed page/photo/domain/test files. `MapInner.js` retains its committed baseline of eight errors/four warnings; rule/severity/message comparison found no additional findings. Unrelated baseline lint remains untouched.
- **`git diff --check` passed**. No commit or push.

Initial implementation logs/artifacts remain outside git: `%TEMP%\photo-direction-unit.log`, `photo-direction-build.log`, `photo-direction-browser.log`, and screenshot folders `gmi-photo-direction-production` / `gmi-photo-direction-synthetic`. The real-corpus follow-up adds `photo-direction-real-browser.log`, `photo-direction-real-canonical-audit.log` / `.json`, `photo-direction-real-hashes-before.json`, `photo-direction-real-hashes-after.json`, `photo-direction-real-workspace-before.json`, and screenshots in `gmi-photo-direction-real-production`. The follow-up used the existing Next 16.1.6 production build at localhost:3100; the temporary server was stopped after validation. Build, lint and domain-test results above are from implementation validation; they did not require another run because application and test files stayed byte-identical in this follow-up. `git diff --check` was rerun after the report update.

Reproduce domain validation:

```powershell
$tests = rg --files tests -g 'photo*.test.mjs' -g 'exifGps.test.mjs' |
  Where-Object { $_ -notmatch 'Ui.test|DialogLayout.test' }
node --test --experimental-loader ./tests/esmJsLoader.mjs $tests
```

Reproduce browser validation with a running production build:

```powershell
$env:PHOTO_UI_URL='http://localhost:3100'
$env:PHOTO_GML_FIXTURE='C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml'
$env:PHOTO_SCREENSHOT_DIR=Join-Path $env:TEMP 'gmi-photo-direction-real-production'
node --test --test-concurrency=1 tests/photoDirectionUi.test.mjs tests/photoManualPlacementUi.test.mjs tests/photoWorkspaceUi.test.mjs tests/photoPositioningUi.test.mjs tests/photoSpatialUi.test.mjs tests/photoAppendDuplicatesUi.test.mjs tests/photoDialogLayout.test.mjs tests/terrainPhotoGml.test.mjs
```

## Real-corpus browser acceptance checklist

**A–I completed with the real 148-photo Ekenesstokken corpus.** The production direction suite used the actual JPEGs and GML; the additional canonical audit checked all records directly through the domain API in Chrome.

| Check | Accepted result |
| --- | --- |
| A — Unknown direction | GML-positioned photo showed **Ikke angitt** and no accepted arrow. Editor started a temporary 0° proposal. Actual slider dragging through N/E/S/W updated the arrow live; screen-coordinate geometry verified up/right/down/left about the photo anchor. Cancel restored unknown with no arrow. Position and source evidence stayed unchanged. |
| B — Apply ~45° | Dragged slider to ~45°, refined to 45°, applied explicitly. Inspector showed **45°** and the accepted indicator pointed NE. |
| C — Known edit/cancel | Dragged the known 45° proposal through 120°, 220° and 350°. Cancel restored the exact accepted 45° and indicator. |
| D — Known edit/apply | Applied 42° and subsequently 90°. Inspector/map changed only on explicit acceptance. Native arrow/Home/End keyboard adjustment, ±1° wrap and Escape cancellation also passed. |
| E — Manual movement | Click/reclick, proposal drag and keyboard adjustment retained the accepted 90° and current position until confirmation. Applying manual movement changed position while retaining 90° and its accepted indicator. A separate canonical check retained the exact explicit-north direction object through movement. |
| F — GML/EXIF switching | Restored the GML position and switched to EXIF without changing accepted 90° or raw evidence. The EXIF wizard retained direction. The canonical audit also applied both GML and EXIF candidate positions and both all-148 wizard paths: explicit 0° stayed known north and all other 147 directions stayed null. |
| G — Explicit known north | A second real photo began unknown; entering and applying its 0° proposal displayed **0°** with an accepted north indicator. Canonical/JSON checks distinguished known 0° from unknown null, with exactly one known photo and 147 unknown before accepting a second heading. |
| H — Legacy zeros | Real parser/session assertions verified all 148 raw GML direction values equal `"0"` and all 148 operational directions initially equal null, after GML positioning and actual metadata/preview completion. The canonical audit retained all 148 raw-zero candidates and all source evidence through explicit direction/position operations; only explicitly directed photos became known. |
| I — Connector anchors | Dense map retained 148 photo markers at 136 distinct locations. Across four current-to-proposal directions, reclicks, dragging and keyboard adjustments, connector endpoints met the current/proposal icon anchors within the 1.5 px projection-rounding tolerance. Actual normal/selected/proposal SVG graphic centers agreed with their anchors within 0.01 px, including forced `display:block`. Screenshots at 1680×900 and 1024×620 were visually inspected and showed consistent centered connections. |

Direction editing passed at 1680×900 and 1024×620. At 390×700, slider/fine controls and Apply/Cancel remained reachable with the existing scrolling layout. Dense-map screenshots of cardinal proposals, accepted direction with placement connector and short-layout editing were inspected. Heading and anchor geometry remained correct after real map pan and zoom. The regression suites additionally covered popup/lightbox behavior, duplicate-safe append, placement keyboard/drag/click semantics, wizard semantics, visibility, owner removal/deletion, application reset and hard reload.

### Original-source and repository integrity

SHA-256 was computed before and after all browser runs for the GML and each of the 148 JPEGs. All 149 individual file hashes and the JPEG filename/hash manifest remained identical. Both aggregate values also match the earlier accepted reports:

- GML: `667bbeb9c9b0094bc9ff3f9848564557c4b8b6f298717985145a2f244ca2ee5d`.
- Sorted 148-JPEG `(filename, SHA256)` manifest: `6576b4fe8cadd579d891224493d7c823568b3cda372250de8a75b3964842eb1d` (compact ASCII JSON).

The 19 existing changed/untracked repository files outside this report were also hashed before/after and were byte-identical, including the unrelated pre-existing usage aggregate. No application, test or dependency file changed during this follow-up. Branch and HEAD remain `feature/photo-workspace` / `5e20290`. No commit, push or sub-agents.

## Known limitations and next milestone

Only the selected positioned photo has an arrow. Unplaced direction remains editable but has no geographic map location. There is no clear-direction action, direction history/undo, metadata-direction acceptance policy, export or persistence in this milestone. Narrow layouts use the existing scrolling workspace. Basemap network tile loading can leave temporary gray areas in screenshots; heading/anchor assertions do not depend on tiles.

Real-corpus acceptance is complete with no remaining validation blocker found. The recommended next milestone is **a focused GMI/DFOT audit before adding GMI as a positioning source**.
