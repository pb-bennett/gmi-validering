# First spatial FOTO-layer milestone — implementation

Date: 2026-10-06, Europe/Oslo.

## 1. Task summary

Implemented the session-only spatial FOTO milestone from [the preserved implementation plan](20261006-photo-spatial-milestone-planning.md). Photo import supports an optional legacy Terrain positioning GML. GML and EXIF GPS become independent immutable candidates; a confident viable GML match initializes current position at creation. EXIF remains candidate-only until explicitly accepted. Positioned photos appear as camera markers with visibility, geographic locate actions, and provenance inspection in the existing viewer.

The asynchronous thumbnail overwrite hazard was fixed before spatial writers were added. Original Files remain private session resources with exactly one owner, either the import draft or a FOTO layer. Candidate acceptance changes current position without changing source evidence. No persisted photo store, export, direction editor, or manual placement interaction was introduced.

Implementation and acceptance are complete for this boundary. No agents were spawned. Nothing was committed or pushed.

## 2. Baseline and branch

- Workspace: `C:\GitHub\gmi-validering-test`.
- Branch: `feature/photo-workspace`.
- HEAD before and after: `dd4a39b Add photo import and FOTO layers`.
- The sole initial working-tree change was the untracked planning report. It remains untracked and byte-for-byte unchanged; its hash is recorded below.
- The preceding accepted [photo import/layer report](20261005-photo-import-and-layer-milestone.md) and relevant implementation were inspected.
- No unrelated application files or external fixture files were changed.

## 3. Files changed

Application/dependency files:

| File | Change |
| --- | --- |
| `package.json`, `package-lock.json` | Pin `exifr` 7.1.3 |
| `src/lib/photos/photoSession.mjs` | Latest-record patches; bounded GPS jobs; spatial ownership, draft GML transactions/matching, layer creation/acceptance/counts/cleanup |
| `src/lib/photos/photoSpatial.mjs` (new) | Deep immutability, candidate/current helpers, geographic validation, derived counts |
| `src/lib/photos/terrainPhotoGml.mjs` (new) | Narrow namespace-aware browser parser and source/CRS diagnostics |
| `src/lib/photos/photoReferenceMatching.mjs` (new) | Conservative owner-scoped reference association graph |
| `src/lib/photos/exifGps.mjs` (new) | Lazy GPS-only JPEG/PNG extraction and source validation |
| `src/lib/photos/photoMapFeatures.mjs` (new) | Minimal current-position map features and typed geographic locate resolution |
| `src/lib/map/coordinateProjection.js` | Add strict photo projection alongside the existing survey API |
| `src/components/photos/PhotoCollectionDialog.js` | Optional GML picker/drop handling, transactional source summary, spatial counts, focused inspection |
| `src/components/photos/PhotoCollectionPanel.js` | Include the spatial inspector alongside original-file inspection |
| `src/components/photos/PhotoLayerCard.js` | Compact placed/unplaced counts and truthful visibility tooltip |
| `src/components/photos/PhotoGmlSummary.js` (new) | Match, ambiguity, geometry/CRS, and import-failure diagnostics |
| `src/components/photos/PhotoSpatialInspector.js` (new) | Current/candidate/provenance inspection and explicit locate/accept actions |
| `src/components/photos/PhotoMarkersLayer.js` (new) | Dedicated camera marker pane, stable photo identity, click/Enter/Space activation |
| `src/components/photos/PhotoMapController.js` (new) | Isolated photo-only initial fitting and geographic locate requests |
| `src/components/MapInner.js` | FOTO-aware mounting, dedicated marker/controller insertion |
| `src/app/page.js` | Ephemeral selected-photo/locate state, viewer/map transition, reset cleanup, nonblocking unplaced notice |
| `src/app/globals.css` | Six additive photo inspector/details/camera style rules |

Test files:

- New: `tests/photoSpatial.test.mjs`, `tests/photoReferenceMatching.test.mjs`, `tests/photoSpatialProjection.test.mjs`, `tests/exifGps.test.mjs`, `tests/photoMapFeatures.test.mjs`, `tests/terrainPhotoGml.test.mjs`, `tests/photoSpatialUi.test.mjs`.
- New helpers: `tests/helpers/chromeHarness.mjs`, `tests/helpers/photoGpsFixtures.mjs`, `tests/browser/photoSpatialChecks.mjs`.
- Updated: `tests/mapPaneToolbar.test.mjs`, to permit and check the added MapView props while preserving its toolbar assertions.
- This completion report is new. The existing planning report was preserved.

In total: 19 application/dependency files and 11 test/helper files, plus this report. No changes were needed in Zustand/store, photo React subscription hooks, LayerManager, LayerPanel, Sidebar, layer presentation, MapView, survey parsers, validation, Data Table, popup, or hyperlink-copy implementations.

## 4. Dependency changes

Added exactly `exifr: "7.1.3"`, with its resolved tarball/integrity in the lockfile. No transitive package additions or browser-automation dependencies. Installed with scripts disabled. GPS extraction imports `exifr/dist/full.esm.mjs` lazily; the full bundle is needed for the selected JPEG and PNG readers.

The final production parser chunk is `ce4103836f6e5c0e.js`: 74,870 bytes, 26,092 bytes when gzip-compressed for measurement. These are chunk measurements, not an assertion about HTTP compression in a deployment. The source ESM file is 75,505 bytes. GML uses browser DOMParser, and coordinates reuse existing proj4 definitions.

## 5. Final spatial data model

The external photoSession registry remains the sole authority. Public snapshots omit the original File. Spatial candidates, nested raw evidence, current records, extraction status, source rows, and match ledgers are frozen. Derived layer counts and map geometry are consumers of the canonical photo state.

Representative public photo, abbreviated:

```js
{
  id: "photo-asset-1",
  originalFilename: "Grøft æ.jpg",
  sourceRelativePath: null, // actual webkitRelativePath only, if supplied
  preview: { state: "ready", thumbnailUrl: "blob:…", errorCode: null },
  spatial: {
    candidates: [
      {
        id: "photo-gml-source-1:entry-1",
        kind: "gml",
        sourceId: "photo-gml-source-1",
        sourceEntryId: "entry-1",
        sourceFilename: "posisjoner.gml",
        status: "viable",
        position: { crs: "EPSG:4326", longitude: 10.4355500001, latitude: 59.2251222226 },
        raw: {
          featureId: "id…", pointId: "id…", localId: "…", idNamespace: "",
          name: "Grøft æ.jpg", fotolink: "Attachments\\Grøft æ.jpg",
          posText: "581932.579311 6566001.891835 0",
          coordinates: [581932.579311, 6566001.891835, 0], dimension: 3,
          declaredSrsName: "http://www.opengis.net/def/crs/epsg/0/5972",
          pointSrsName: null, declarations: [],
          envelopeDeclarations: ["http://www.opengis.net/def/crs/epsg/0/5972"],
          photographedAtText: "2025-08-06T16:30:55",
          direction: { valueText: "0", unitText: "1", referenceText: "1" }
        },
        crsResolution: { sourceCrs: "EPSG:5972", method: "terrain-envelope-fallback", declarationLocation: "collection-envelope", axisOrder: "easting-northing-height", verticalCrs: "EPSG:5941" },
        transform: { method: "proj4-horizontal-map-approximation", horizontalProjection: "EPSG:25832", vertical: "not-transformed" },
        errorCode: null, issues: []
      },
      {
        id: "photo-asset-1:exif", kind: "exif", sourceAssetId: "photo-asset-1",
        status: "viable",
        position: { crs: "EPSG:4326", longitude: 10.43555, latitude: 59.2251222222 },
        raw: { GPSLatitude: [59, 13, 30.44], GPSLatitudeRef: "N", GPSLongitude: [10, 26, 7.98], GPSLongitudeRef: "E" },
        crsResolution: { sourceCrs: "EPSG:4326", explicitDatum: null, method: "exif-gps-map-assumption" },
        issues: []
      }
    ],
    current: {
      position: { crs: "EPSG:4326", longitude: 10.4355500001, latitude: 59.2251222226 },
      basis: { kind: "candidate", candidateId: "photo-gml-source-1:entry-1" },
      acceptance: "initial-confident-gml-match",
      acceptedAt: 1791244800000 // illustrative milliseconds
    },
    exifRead: { state: "viable", errorCode: null }
  }
}
```

A photo without accepted evidence has `current: null`, including a viable EXIF-only photo. Invalid GPS candidates retain available raw tags and an error code with no normalized position. Missing/unsupported/unreadable GPS is distinguished through `exifRead`.

`acceptCandidates(layerId, [{ photoId, candidateId }, …])` validates membership and candidate viability, replaces only current, and publishes once. Single-photo buttons use this batch-capable API. Candidate arrays retain identity across acceptance. The separate current `position`/`basis`/acceptance contract can support later manual placement and additional candidate kinds without moving asset ownership. Operational direction is absent/unknown; raw source zero is never assigned as heading.

FOTO layers retain ordered photo IDs, immutable `spatialSources` with final source rows/ledger, visibility, and derived `placedCount`, `unplacedCount`, and `exifCandidateCount`. Originals and parsed DOM documents are absent from public layer/map representations.

## 6. GML parser and matching behavior

Recognizes GML 3.2 FeatureCollection with one 2019 Terrain Skråfoto per featureMember. Namespace prefixes do not matter. No network schema validation, path following, or external reference fetch occurs. DOCTYPE/entities, malformed XML, mixed/unknown profiles, files over 10 MiB, and excessive feature counts are rejected.

Preserves feature/point IDs, lokalId/navnerom, gml:name, raw fotolink, position text/ordinates, dimension declarations, applicable/envelope CRS declarations, photograph timestamp text, and raw 0/1/1 direction fields. Multiple/missing Point/pos geometries, inconsistent dimensions, nonfinite coordinates, and compound EPSG:5972 geometry without three ordinates are unusable.

Explicit applicable geometry CRS takes precedence over outer defaults; conflicting pos/Point declarations are unusable. Only this verified profile may use a single collection envelope as an explicit compatibility fallback. Missing, conflicting, or unsupported CRS produces structural diagnostics and no viable map position. Supported projected GML systems are 5972, 25832, and 25833; geographic GML is deliberately excluded to avoid axis-order guessing.

Strict photo projection uses EPSG:25832 for the horizontal component of EPSG:5972. Raw x/y/z and original CRS remain source evidence. The normalized map candidate is EPSG:4326 longitude/latitude. Height is retained without a vertical transformation. Existing survey projection failure behavior is unchanged; photo failures never return projected input as degrees.

Matching derives separate NFC keys, normalizes Windows/forward slash separators and dot segments, and preserves source strings. Real relative paths and segment-boundary suffixes may disambiguate basenames. Case fallback is deterministic and requires a unique association; exact spelling cannot conceal case/Unicode collisions at the same path. Basename collisions without real path evidence are ambiguous. The complete bipartite graph is checked for duplicate GML references and competing photo edges before any association is accepted. No greedy, fuzzy, time, UUID, order, or external-filesystem matching.

Remote/traversal references are unresolved. Percent decoding is attempted only for an explicit file URI, with encoded separators rejected; literal percent/space/Norwegian/#/? filename characters remain literal. Unresolved rows retain diagnostics; no photo assets are invented. Unmatched imported photos remain included and unplaced.

## 7. EXIF behavior

A separate serial metadata queue reads original Files independently of preview success. It does not read the 181.5 MiB corpus concurrently. JPEG/PNG container headers determine supported extraction; other containers report `unsupported-format`, distinct from `no-gps`.

The lazy full exifr reader enables only the GPS pointer/tags required here. It preserves latitude/ref, longitude/ref, datum, altitude/ref, DOP, and horizontal positioning error where present. No date, photographer, camera, XMP, MakerNote, or direction analysis was added.

States are `pending`, `viable`, `no-gps`, `invalid`, `error`, and `unsupported-format`. Finite rational DMS, hemisphere refs, geographic bounds, partial/malformed tags, and explicit datum are checked. Unknown explicit datum makes the candidate unusable. Numerically valid 0°/0° remains a candidate with a visible caution and requires explicit acceptance. Read/header/parser failures remain observable errors.

EXIF completion patches only extraction status/candidates on the latest live record. It never initializes or changes current, including after GML failure or absence. Raw decoded tags are retained, while the exact original private File remains the underlying source.

## 8. Map integration

The pure adapter emits one GeoJSON Point per visible photo with valid current, with only `kind: photo`, `layerId`, `photoId`, and geographic geometry. Candidate-only/unplaced photos emit nothing. Each marker has a stable layer/photo key, including coincident photos.

Dedicated camera markers use their own pane at z-index 590. They do not enter survey GeoJSON, FCODE symbols, validation, survey indexes/highlighting/outliers, popups, or survey layer-order logic. Click or Enter/Space opens the FOTO viewer focused on that asset; tooltip/title labels identify the photo. Normal-map thumbnails, clustering, jitter, and coordinate deduplication are absent.

FOTO presence keeps the map mounted when there is no survey, even when hidden or entirely unplaced. Visibility controls markers only. Initial photo-only fitting happens once when visible current positions first exist, with bounded max zoom 18 for a single location. Thumbnail/EXIF completion does not repeatedly fit. Survey auto-fit stays in its existing controllers. Photo fitting/locating runs after the zoom listener subscribes so the displayed zoom is truthful.

Leaflet displays EPSG:3857 basemap tiles, receives latitude/longitude, and consumes EPSG:4326 photo positions. Page-owned `kind: photo` locate requests resolve live owner/candidate identities and directly use geographic coordinates; active survey CRS is irrelevant. Locate closes layer inspection without canceling the layer and clears the request safely.

## 9. Import UX

The existing Bilder curation dialog now has a separate **Legg til posisjoner (GML)** action. Drop handling separates GML from images; a GML File never becomes a photo. One positioning source is staged per draft. GML-first and photos-first both work. Photos appended/removed during curation rematch the staged source.

The compact summary reports matches, missing photos, ambiguity, and usable positions. Details expose unresolved references and invalid geometry/CRS, plus the legacy envelope compatibility note. A failed replacement retains the prior source and blocks creation until the user explicitly continues with that source or without GML. Pending parsing blocks creation. Multiple dropped GML files produce an explicit selection message rather than choosing one.

At creation, the final ledger is recomputed from all remaining draft photos and transferred with the source. Confident viable GML candidates initialize current only if absent. EXIF/thumbnail work may still be pending and continues under the transferred owner. Removal selection never determines inclusion. Generic Bilder always creates a fresh draft; existing-layer import/reconciliation is not offered.

## 10. Viewer and provenance actions

The existing layer viewer shows placed/unplaced counts and a scrollable **Posisjon og kilder** section. Current/source coordinates, EXIF status, GML/EXIF candidates, source filename, raw metadata/IDs/time/direction, CRS resolution, and horizontal transformation method are inspectable. Hemisphere labels handle S/W correctly.

Actions are **Zoom til posisjon**, **Zoom til GML**, **Zoom til EXIF**, **Bruk GML-posisjon**, and **Bruk EXIF-posisjon**, enabled only for applicable viable data. Zoom changes map view without accepting a candidate. Use changes only current, updates markers/counts immediately, and preserves both sources. Original-file inspection remains read-only. No Plasser/Flytt/date/direction controls were added.

Layer cards remain compact: `148 bilder · 148 plassert · 0 uplassert`. Detailed evidence/diagnostics remain in import/viewer inspection.

## 11. Cleanup and lifecycle

Every async record patch reads the latest live record and checks generation/liveness. Thumbnail writers own preview/dimensions, metadata writers own extraction/candidates, and acceptance owns current. Dead/reset results cannot recreate records. Race tests cover both completion orders, thumbnail success/failure, and explicit acceptance while thumbnail work is pending.

Removing/canceling drafts drops owned records, queued work, positioning state, and thumbnail URLs. GML request IDs and draft tokens invalidate superseded/late parses. Layer transfer preserves pending jobs. Deleting a layer removes its source ledger/assets, cancels queued/liveness tokens, and removes markers. Reset clears all photo owners and page locate/inspection state; viewer effects revoke inspected-original URLs. Original Files have no write/re-encode path.

An already active EXIF byte read has no AbortSignal API here; its owner token is canceled and its eventual result is discarded. The registry releases its ownership immediately. New work remains serial. This prevents resurrection without claiming that an in-flight parser read can be force-aborted.

Reopening reads live session state. Hard reload starts a new session and restores no FOTO Files, sources, candidates, accepted coordinates, layers, or locate requests from localStorage/Zustand.

## 12. Tests run and results

Final focused/new and relevant existing suite: **150 passed, zero failed, zero skipped**. Includes 29 new unit/state cases, existing photo import/preview/reset tests, layer presentation/order, parser/CRS coexistence, map toolbar/highlighting/background, popup/hyperlink behavior, and table inspection/search regressions.

```powershell
node --experimental-loader ./tests/esmJsLoader.mjs --test tests/photoSpatial.test.mjs tests/photoReferenceMatching.test.mjs tests/photoSpatialProjection.test.mjs tests/exifGps.test.mjs tests/photoMapFeatures.test.mjs tests/photoSession.test.mjs tests/photoImportLayers.test.mjs tests/photoPreviewLifecycle.test.mjs tests/photoResetIntegration.test.mjs tests/layerPresentation.test.mjs tests/layerOrder.test.mjs tests/richerUsageTelemetryParserIntegration.test.mjs tests/mapPaneToolbar.test.mjs tests/layerHighlightPanel.test.mjs tests/layerHighlightHalo.test.mjs tests/mapBackgroundControl.test.mjs tests/featurePopupContent.test.mjs tests/hyperlinkFilenames.test.mjs tests/objectTableInspection.test.mjs tests/tableSearch.test.mjs
```

New coverage includes nested evidence/current immutability, owner-scoped batch acceptance, async completion races, bounded metadata, owner transfer/delete/cancel/reset, GML-first curation/rematching, transactional failed replacement/late parsing, safe paths/case/NFC/duplicates/bipartite ambiguity, strict projection, current-only/visible/coincident map features, and geographic locate resolution. Actual installed exifr parses small generated JPEG TIFF little/big-endian and PNG metadata fixtures; no-GPS/unsupported/partial/ref/datum/rational/read failures and suspicious zero are distinct.

Two additional Node browser tests passed with no skips in the configured acceptance runs:

1. `tests/terrainPhotoGml.test.mjs`: **8 internal browser checks passed**, including actual DOMParser namespace/CRS precedence/envelope fallback, unsupported/missing/conflicting geometry/CRS, size/mixed-member/empty-field handling, DOCTYPE/malformed XML rejection, actual lazy File/EXIF parsing, conflicting synthetic GML/EXIF session behavior, and the full external real corpus with thumbnails/resource cleanup.
2. `tests/photoSpatialUi.test.mjs`: **8 production UI scenario groups passed**, including native disk picker imports, 148 actual Leaflet marker elements, initial fitting, visibility, marker keyboard activation/focused inspection, raw provenance, both Use actions/reopening, all three locate actions at zoom 18 without changing basis, EXIF-only import, GMI/SOSI/KOF coexistence, application reset, and hard reload. Short 1024×620 and narrow 390×700 modal bounds/action accessibility were also asserted.

Browser checks use installed Chrome/Chromium through native Node CDP with temporary isolated profiles and no automation dependency. The requested in-app browser bootstrap was attempted but failed before execution (`sandbox-state-meta: missing field sandboxPolicy`); the installed-browser fallback was disclosed. Node version was v24.19.0. UI acceptance used Testmodus, dismissing the existing first-visit information dialog. Private fixtures were not copied into git.

Reproduction:

```powershell
$env:PHOTO_GML_FIXTURE='C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml'
node --test tests/terrainPhotoGml.test.mjs

# Run against the production build/server in a separate terminal:
node node_modules/next/dist/bin/next start -p 3100
$env:PHOTO_UI_URL='http://localhost:3100'
$env:PHOTO_SCREENSHOT_DIR=Join-Path $env:TEMP 'gmi-photo-spatial-acceptance'
node --test tests/photoSpatialUi.test.mjs
```

The XML/browser test skips when no Chrome is installed; its real-corpus portion is opt-in through the fixture variable. The production UI test also requires PHOTO_UI_URL and the fixture. Ordinary tests do not require the private corpus. Screenshots of the map, provenance inspector, and coexistence were saved in the temporary acceptance directory and visually inspected. The test server and Chrome profiles were stopped/cleaned after acceptance.

## 13. Build, lint, and diff check

- **Production build passed** after final application changes: `npm.cmd run build`, Next.js 16.1.6, compilation 11.0 seconds and all eight pages generated. Only the pre-existing stale Browserslist-data notice appeared.
- **Targeted ESLint passed** with exit 0 for all photo modules/components, projection helper, page integration, new tests/helpers/browser modules, and modified toolbar test. No findings.
- **MapInner lint remains at baseline:** eight `react-hooks/refs` errors and four warnings. Baseline bytes were read directly from `git show HEAD:src/components/MapInner.js` and linted through stdin with the same filename; counts/rules matched the working file, with only insertion-related line shifts. Errors remain in the existing projection-cache useMemo/ref paths, not added photo code. No disabling comments were introduced.
- **`git diff --check` passed.** Git emitted its normal Windows LF/CRLF notices; no whitespace errors.
- The previously documented AppInfo stale assertion and LayerPanel conditional-hook findings were not changed. A clean repository-wide lint/full-test result is not claimed; validation was scoped to this milestone and its relevant regressions.

Targeted lint command:

```powershell
node node_modules/eslint/bin/eslint.js src/lib/photos/*.mjs src/lib/map/coordinateProjection.js src/components/photos/*.js src/app/page.js tests/photoSpatial.test.mjs tests/photoReferenceMatching.test.mjs tests/photoSpatialProjection.test.mjs tests/exifGps.test.mjs tests/photoMapFeatures.test.mjs tests/terrainPhotoGml.test.mjs tests/photoSpatialUi.test.mjs tests/helpers/*.mjs tests/browser/*.mjs tests/mapPaneToolbar.test.mjs
```

## 14. Real 148-photo/GML acceptance

Read-only originals:

```text
C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml
C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\Attachments\
```

| Acceptance item | Final observed result |
| --- | --- |
| Photos / source rows | 148 actual JPEG Files / 148 Skråfoto rows |
| Matching | 148 confident matches; zero unmatched references, extra photos, or ambiguous matches |
| GML geometry | 148 viable candidates, preserved raw EPSG:5972 x/y/z and recorded envelope fallback |
| Current after creation/EXIF completion | 148 GML-based current positions; zero unplaced |
| EXIF | 148 viable candidates; extraction never changes GML current basis |
| Source agreement | Every GML/EXIF horizontal pair agrees within 1e-8 degrees; evidence stays separate and no authority is inferred |
| Preview/source integrity | All 148 real thumbnails become ready; exact private original File identities retained |
| Map records | 148 markers / 136 distinct geographic coordinates; no deduplication or jitter |
| Visibility / reopen | All markers hide/show; layer counts and spatial state survive reopening |
| Inspection/actions | Source IDs/CRS/raw GPS visible; GML→EXIF→GML acceptance preserves both candidates; all locate actions preserve basis |
| EXIF-only import | 148 candidates and 148 unplaced, zero permanent markers; accepting one creates one placed / 147 unplaced and one marker |
| Cleanup | Layer deletion releases all registry Files and 148 thumbnail URLs in the browser domain check; pending preview work remains dead in UI/race tests |
| Reset/reload | No FOTO layer/marker survives reset or hard reload |
| Coexistence | GMI fixture, dependency fastmerke.sos, and synthetic declared-CRS KOF coexist; photo locate centers its marker independently of active survey |

Full File loading, metadata/thumbnail completion, assertions, and resource release in the browser domain harness took approximately **8.9–9.3 seconds** across acceptance runs. The final production UI acceptance took **6.7 seconds** and deliberately does not wait for every thumbnail before creating/inspecting layers. These are local test measurements, not generalized performance guarantees or a memory benchmark.

Leaflet rounds projected pixel offsets: 136 geographic positions occupied 135 different pixel offsets at the initial zoom 16. This is normal screen rounding, not source/marker deduplication. All 148 DOM marker records and exact geographic positions remain present. Coincident/nearby icons overlap; covered photos remain available in the viewer.

## 15. Source integrity and hash checks

Before/after SHA256 values agree:

| Source | SHA256 |
| --- | --- |
| Original Terrain GML | `667bbeb9c9b0094bc9ff3f9848564557c4b8b6f298717985145a2f244ca2ee5d` |
| Ordered manifest of all 148 JPEG content hashes | `6576b4fe8cadd579d891224493d7c823568b3cda372250de8a75b3964842eb1d` |
| Preserved planning report | `0c7bae763a1dbb671cf7e47d73d6d5962766b31645489791b620f5a124236a47` |

Manifest recipe: sorted Attachments files, `(filename, SHA256(file contents))` pairs, Python `json.dumps(..., ensure_ascii=True, separators=(',', ':'))`, UTF-8, then SHA256. The corpus contains 190,303,135 JPEG bytes. Neither originals nor GML were rewritten, normalized, re-encoded, or modified. No wider external GMI/older Attachments inspection was needed.

## 16. Known limitations

- The GML reader intentionally supports the verified legacy photo profile and projected systems, not a generic GML engine or schema validator. Reconciliation after layer creation is absent.
- GPS support is JPEG/PNG; broader preview support does not imply GPS support. Missing, malformed, unknown-datum, unsupported, and suspicious-zero evidence remains explicit.
- ETRS89→WGS84 is the existing horizontal map approximation. Height, geoid, datum epoch, and direction are not operationally transformed/interpreted.
- Overlapping markers have no chooser/spiderfying. The collection still exposes every photo. Camera symbols contain no thumbnails.
- All state is session-only. Active metadata reads discard canceled results rather than forcibly aborting the parser.
- Acceptance was automated and visually checked in installed Chrome, not Firefox/Safari. External basemap tile delivery was intermittent/unavailable during screenshots and was not a validation target; photo rendering/fitting/locating assertions do not depend on tile fetches.
- Existing MapInner lint findings remain. No blocking new functional issue remains from the executed acceptance scenarios.

## 17. Deferred work

Full-screen photo workspace and resizable/collapsible panes; manual Plasser/Flytt, drag/cancel/commit and undo; post-creation GML reconciliation/multiple source management; GMI/DFOT/GMI-derived candidates; direction/date/photographer editing; GML export; VA-object association/shared membership; persistence/upload/collaboration; thumbnail map symbols; clustering/spiderfying/colocated chooser; general parser/CRS/vertical support expansion. No placeholder controls for these were added.

## 18. Recommended next milestone

Introduce the dedicated full-screen collection/map/inspector workspace with deliberate manual place/move interactions using this same session authority and nullable current-position model. Preserve immutable candidate evidence and owner-scoped acceptance. The existing batch-capable acceptance API also supports a later explicit “Bruk EXIF-posisjon for N bilder” operation without rewriting the photos-only data architecture. Add late-source reconciliation as a separate, explicit ownership/state transaction when its UX is defined.

## 19. Corrective acceptance: desktop dialog geometry

2026-10-06: reproduced the reported regression against the existing development server at `http://localhost:3000/?testmodus=1`, using an actual 1680×900 Chrome viewport. The empty importer measured **979.7×447 at (0,0)**; computed margin was `0px`, max-width was the browser default `calc(100% - 38px)`, and the collection body had no grid columns. Both panes were stacked. This matched the manual observation.

**Root cause:** the running development server served stale generated CSS that omitted all `.photo-collection-*` shell/pane rules. Its stylesheet contained neither the dialog selector nor the layer badge rules. This was missing CSS, rather than an overriding 50%-width rule or a change to photo state. The source file still contained `width: 94vw`, `height: 94dvh`, `max-width: none`, `margin: auto`, and the accepted 42%/58% desktop grid; these declarations match HEAD `dd4a39b`. A fresh development PostCSS compilation included them. Touching the stylesheet timestamp did not recover the live output; restarting only the verified workspace Next development-server processes did. The subsequently served stylesheet contained the missing selectors, and the rendered geometry recovered without changing application/CSS source. The specific earlier event that left the development output stale was not established; no cache-internals or unrelated styling changes were made.

**Correction:** refreshed the workspace development server at port 3000, preserving the accepted shell and all spatial/curation behavior. It remains running for manual checking; reload an existing browser tab to receive the regenerated stylesheet. `globals.css` bytes are unchanged by this correction (only its timestamp was touched during diagnosis). No importer redesign, width override, dependency, or application behavior change was necessary.

Files changed in this corrective pass:

- New `tests/helpers/photoDialogLayout.mjs`: actual rendered/computed geometry assertions for viewport-relative width/height, centering, grid display, nonzero panes, desktop 42%/58% split, and narrow stacked arrangement.
- New `tests/photoDialogLayout.test.mjs`: independent of the private corpus; checks empty import, three decoded PNG photo Files in import, and reopening their FOTO layer, at all three viewports. A browser-only negative control confirms that a 50vw dialog at the left edge fails the assertion.
- Strengthened `tests/photoSpatialUi.test.mjs`: uses a 1680×900 desktop viewport and the same assertions for empty import, the populated real 148-photo/GML import, layer inspection, and existing short/narrow checks. Existing milestone scenarios remain intact.
- This section was appended to the implementation report. The preceding report text and planning report were preserved; no other milestone source changes were made.

| Viewport / mode | Before correction | After correction |
| --- | --- | --- |
| 1680×900, empty importer | 979.7×447 at (0,0), stacked panes | 1579.2×846 at (50.4,27), side-by-side panes |
| 1680×900, populated importer | Not separately measured before restart | 1579.2×846 at (50.4,27), gallery 662.4px / inspector 914.8px |
| 1680×900, existing-layer inspection | Not separately measured before restart | 1579.2×846 at (50.4,27), same desktop pane widths |
| 1024×620, all three modes | Not separately measured before restart | 962.5×582.8 at (30.7,18.6), side-by-side panes |
| 390×700, all three modes | Not separately measured before restart | 374×684 at (8,8), stacked panes |

Validation: **new layout browser test passed** with nine mode/viewport combinations and the negative control; **strengthened real-corpus browser UI test passed** with its eight existing scenario groups, now against localhost:3000 development output; **39 relevant photo/preview/reset/toolbar tests passed**; **targeted ESLint passed** for the three changed test/helper files; **git diff --check passed**. The live real-corpus run still produced 148 markers/current positions and passed visibility, provenance, candidate acceptance, locate, GMI/SOSI/KOF coexistence, reset, and reload checks. Screenshots of empty/populated/layer desktop dialogs were captured under `%TEMP%\gmi-photo-dialog-correction` and visually inspected. Browser automation again used installed Chrome because the in-app browser connection failed before execution with the previously recorded sandbox-policy error. Test browsers were closed; no agents, commits, or pushes.

Reproduce the layout check without the private corpus:

```powershell
$env:PHOTO_UI_URL='http://localhost:3000'
$env:PHOTO_SCREENSHOT_DIR=Join-Path $env:TEMP 'gmi-photo-dialog-correction'
node --test tests/photoDialogLayout.test.mjs
```
