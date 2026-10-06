# First spatial FOTO-layer milestone: repository audit and implementation plan

Date: 2026-10-06, Europe/Oslo. Planning only; no application implementation, dependency installation, commit, push, or agents.

## 1. Executive summary

Recommend **B: spatial data and normal-map markers using the existing FOTO viewer**, followed immediately by a dedicated full-screen placement workspace. The first increment should support the existing photo curation flow with an optional matching Terrain GML, retain EXIF GPS as a separate candidate, initialize current positions from confident GML matches, render camera markers, and offer inspection, zoom, and explicit candidate acceptance. Defer manual map placement/movement controls and the new workspace layout to the following increment.

Keep photo assets, their spatial metadata, and FOTO layers in the existing external `photoSession`. Keep Files private and preserve the draft-or-one-layer owner invariant. Do not insert FOTO into Zustand's survey `layers`, `points`, or validation data. Source candidates are immutable evidence; the current position is a separate, replaceable record. This permits later DFOT, GMI-derived, and manual sources without implementing them now.

Recommend **one dependency: `exifr`**, loaded on demand for GPS extraction. Existing `proj4` handles horizontal transformation, and browser `DOMParser` handles the narrow GML profile; neither needs a new dependency. Use the full ESM exifr bundle for JPEG and PNG metadata support, with explicit format support limits described below.

The real fixture is especially useful:

- Exactly **148 Skråfoto features and 148 JPEG originals**, with **148 exact one-to-one filename matches**, zero missing references, zero unreferenced photos, and zero ambiguous basename matches.
- EPSG:5972 appears **only on the collection envelope**. Points have no `srsName`. A recorded Terrain compatibility fallback is required; treating that sibling declaration as ordinary XML ancestor inheritance would be incorrect.
- There are **136 distinct horizontal positions**: 126 single-photo positions, nine positions containing two photos, and one containing four. Do not deduplicate photos or pretend all markers will be visually distinct.
- Read-only EXIF inspection found **148 viable GPS positions**, agreeing with transformed GML coordinates to numerical precision. This does not make EXIF authoritative or prove independent corroboration. Add synthetic conflicting/missing/malformed GPS fixtures.

Repository baseline: branch `feature/photo-workspace`, HEAD `dd4a39b Add photo import and FOTO layers`, as expected. Initial working tree was clean. Read the accepted [photo import/layer report](20261005-photo-import-and-layer-milestone.md) first and then the implementation. No applicable `AGENTS.md` was found in the repository or its ancestor directories. The wider GMI file and older attachment collection were not inspected.

## 2. Current architecture findings

### Canonical asset, owner, and subscriptions

`src/lib/photos/photoSession.mjs` is the canonical session owner. Its private `records` Map holds `{ id, file, originalFilename, mimeType, size, lastModified, importedAt, source, dimensions, preview }`. `file` is the exact original File reference. `getPhoto()` and `getLayerPhotos()` omit it. Public photo objects are shallow-frozen; nested structures currently added by the module are also frozen individually. Spatial structures will need the same explicit nested immutability.

Draft membership is an ordered `importIds` array; inspection uses `selectedId`; removal selection uses an independent Set. `createLayer()` transfers every remaining asset into an immutable FOTO layer with `id`, `type`, `name`, ordered `photoIds`, `photoCount`, `visible`, and `createdAt`. Reimporting a File creates another asset ID, even for the same File reference or filename. This matters for ambiguity detection.

`usePhotoSession.js` uses `useSyncExternalStore` with an SSR-safe empty snapshot. Draft photos and layer metadata are published; layer inspection queries `getLayerPhotos()` on session notifications. Spatial data should be added to these records and exposed through the same boundary. React and map representations remain consumers, not additional authorities.

### Important asynchronous merge issue

The thumbnail scheduler captures a `record` before awaiting decoding and later writes `{ ...record, dimensions, preview }`, on both success and error. That is safe for today's fields, but **would overwrite spatial changes made while decoding**. Adding another metadata task without fixing this would create a race between thumbnail completion, EXIF completion, and GML acceptance at layer creation.

Introduce a small internal record-update helper that checks generation/liveness, reads the **latest** record, and updates only the task's owned fields. Thumbnail completion changes preview/dimensions; EXIF completion changes extraction status/candidates; explicit acceptance changes current position. Test all completion orders. Do not gate GPS extraction or GML placement on successful preview decoding.

### Viewer, sidebar, and page integration

`PhotoCollectionDialog.js` distinguishes a mutable draft from a read-only existing layer. It manages a native modal, focus restoration, body scrolling, and isolated photo drops. Layer inspection selection is local component state. `PhotoCollectionPanel.js` exports the original-image inspector and creates/revokes one inspected-original URL in an effect. The viewer is a large collection/inspector modal; it has no map or placement interactions.

`PhotoLayerCard.js` stores actual visibility in photoSession, opens inspection, and confirms deletion. Its current tooltip explicitly says there are no markers. `LayerManager.js` combines photo and survey presentations through `layerPresentation.mjs`; shared visibility controls already call both domains. `Sidebar.js` already supports photo-only layer lists. `LayerPanel.js` remains a survey card and should not become the FOTO integration point.

`page.js` owns the session, creates/cancels imports, opens layers, and calls `photoSession.clear()` on owner teardown. A photo-only page mounts the normal workspace, but `MapInner` returns null unless survey `data`, survey `layerOrder`, or `multiLayerModeEnabled` is present. The page also covers the map pane with a photo-only notice. **Both conditions must change** for useful independent FOTO markers. Photo layers must keep the map mounted even when hidden or entirely unplaced.

### Map, zoom, and projection boundaries

`MapView.js` dynamically mounts `MapInner` without SSR and passes props through. `MapInner.js` constructs survey GeoJSON from parsed `points`/`lines`, attaches survey IDs/indexes and `_layerId`, applies survey filters/outliers, constructs survey symbols/popups, and caches projected features. Its `BoundsController`, `LayerFitBoundsController`, `FeatureHighlighter`, `ZoomToFeatureHandler`, and `MapCenterHandler` are materially relevant seams, but are survey-oriented.

Current conventions differ: survey projection helpers accept `[x, y]`, GeoJSON uses `[longitude, latitude]`, Leaflet uses `[latitude, longitude]`, and `MapCenterHandler` treats requests as GMI `[northing, easting]` using `state.data` to find the CRS. `viewObjectInMap()` also changes survey highlighting/3D state. **Do not send photo coordinates through either survey zoom path.** Use an explicitly geographic photo request handled inside the same Leaflet map.

The map has no custom CRS prop and uses Web Mercator basemap tiles. Leaflet's default display CRS is EPSG:3857; positions supplied to it remain geographic latitude/longitude. [Leaflet reference](https://leafletjs.com/reference.html#map-crs)

`src/lib/map/coordinateProjection.js` registers ETRS89 UTM 32/33, WGS84 UTM 32/33, and EPSG:4326 using the existing `proj4`. Survey CRS selection comes through `telemetry/crs.mjs` and header fallbacks. The survey projection function returns input coordinates on transformation failure. That fallback is unsuitable for photos: a UTM value must never silently become longitude/latitude. Reuse the registered definitions/proj4 through a **new strict explicit-CRS helper in the same module**, preserving the existing survey API and behavior. Do not broaden survey CRS/telemetry policy for this milestone.

### Cleanup and persistence

Removing draft photos, canceling import, deleting a FOTO layer, and clearing the session already revoke owned thumbnails, drop queued jobs, and invalidate late results. Layer creation transfers membership without invalidating live thumbnail work. `store.resetAll()` already calls `photoSession.clear()`; survey data/layer operations do not own photo resources.

Zustand uses `persist` and `devtools`. Although survey datasets are excluded, the persistence `partialize` includes most of `ui`. Consequently photo selection, requests, source IDs, and coordinates must not be casually added to that slice. Keep new photo inspection/zoom request state in the page/components and photo domain. No persistence is recommended.

## 3. Real GML fixture findings

Inspected directly, without rewriting or normalizing:

```text
C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml
C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\Attachments\
```

XML inspection used Python standard-library ElementTree; filename comparisons used the actual sibling directory. GPS inspection used already-installed Pillow 11.3.0, reading only GPS metadata, without decoding/re-encoding originals or analyzing date sources. These audit tools are not proposed application dependencies.

| Item | Observed result |
| --- | --- |
| File | 177,686 bytes; XML declaration UTF-8, standalone `no` |
| Root / GML | `gml:FeatureCollection`; namespace `http://www.opengis.net/gml/3.2` |
| Product namespace/version | `http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101` |
| Schema location | Same namespace followed by its `LedningsnettEtablertEllerFlyttet.xsd` URL; this is the older 2019 profile |
| Features | 148 `gml:featureMember/app:Skråfoto`; 148 Point geometries |
| CRS | Single `srsName="http://www.opengis.net/def/crs/epsg/0/5972"` on `gml:boundedBy/gml:Envelope`; envelope dimension 3 |
| Geometry | `app:fotograferingspunkt/gml:Point/gml:pos`; Point and pos declare dimension 3; three whitespace-separated numbers, `[easting, northing, height]` in this fixture |
| Per-point CRS | No Point or pos has `srsName`; no root `srsName` |
| Coordinate range | E 581855.466184–582141.956370; N 6565981.229443–6566396.191621; all third ordinates 0 |
| Envelope precision | Envelope corners have more decimal places than feature coordinates; do not require exact floating-point equality with rounded points |
| References | All 148 use `Attachments\<filename>.jpg`; raw Windows backslash and literal spaces/Norwegian characters |
| `gml:name` | Present on all features; filename-like label, not the authoritative matching field |
| Feature IDs | Unique `gml:id="id<UUID>"`; `app:identifikasjon/app:Identifikasjon/app:lokalId` contains the same UUID without `id`; no duplicates |
| Other IDs | Root FeatureCollection ID; each Point has its own `gml:id` |
| Identification namespace | `app:navnerom` present but empty on all 148; do not treat local UUIDs as global photo identities |
| Timestamp | `app:fotograferingstidspunkt` on all 148, from `2024-12-10T13:47:08` to `2025-10-09T11:22:32`; no UTC suffix or offset |
| Direction | All contain `retningsvektor/Retning`: `retningsverdi=0`, `retningsenhet=1`, `retningsreferanse=1`; preserve raw values without initializing operational direction |
| Fields actually present | Exactly six feature children: name, fotograferingspunkt, fotolink, retningsvektor, identifikasjon, fotograferingstidspunkt; no photo-information/photographer payload or additional feature children |
| Attachment resolution | 148 existing files, all `.jpg`; every reference resolves by exact filename; no extra sibling photo |
| Duplicate names | None in references or files; no NFC/case-folded basename collision or case-only match |
| Unicode/path details | 39 filenames contain non-ASCII characters, including `ø` and `æ`; all directory filenames are NFC; 147 contain spaces; none contain `%`; all links have the same one-level `Attachments` prefix |
| Original size | Combined JPEG size 190,303,135 bytes, approximately 181.5 MiB |
| Distinct horizontal positions | 136; nine pairs and one group of four share positions, with 126 singleton positions |

Example first feature:

```text
fotolink: Attachments\Trase B_2025-08-06-16-31-18_9d243233b5ce3ef94dc5e3953ce8cf_Kg10.jpg
lokalId: 4c37bff5-80d1-4e75-b898-310ce0e9decd
pos:     581932.579311 6566001.891835 0.000000
time:    2025-08-06T16:30:55
```

The existing projection definition, applied to the horizontal pair as EPSG:25832, returns approximately `[10.435550000107055, 59.225122222573425]`. Its original EXIF GPS is N `[59, 13, 30.44]`, E `[10, 26, 7.98]`, or `[10.43555, 59.225122222222225]`. Across all 148 matched photos, computed horizontal separation is about 0.000039–0.000040 metres using this projection and a spherical distance calculation. This is numerical agreement under the current map approximation, not an accuracy claim or evidence of the historical source of the GML coordinates.

All 148 have viable latitude/longitude/ref tags; no GPS read failures, incomplete pairs, or no-GPS photos were found. GPS tag 0 (version) occurs in 87; tag 11 (DOP) occurs in 61. There were no other GPS tag codes in this corpus. This fixture therefore does not exercise missing/invalid GPS, altitude, explicit GPS datum, or conflicting positions.

Read-only integrity baselines:

```text
GML SHA256:
667bbeb9c9b0094bc9ff3f9848564557c4b8b6f298717985145a2f244ca2ee5d

JPEG content-manifest SHA256:
6576b4fe8cadd579d891224493d7c823568b3cda372250de8a75b3964842eb1d
```

The manifest hashes UTF-8 bytes of Python `json.dumps(sorted_name_hash_pairs, ensure_ascii=True, separators=(',', ':'))`, where each pair contains the exact filename and its file-content SHA256. It identifies this local acceptance corpus without copying originals into the repository. File timestamps are not used as evidence that content is unchanged.

Surprising interoperability details worth preserving are envelope-only CRS, zero heights without any quality assertion, empty ID namespace, timezone-free timestamps, literal non-URI Windows paths, and coincident photo points. Terminal `Get-Content` initially displayed mojibake; explicit XML UTF-8 parsing confirmed the actual namespace and filename characters. No fixture repair is needed.

## 4. Proposed data model with concrete example objects

### Authorities and invariants

Keep the original asset model and add one `spatial` value per asset. Keep source-import documents/rows privately in photoSession, owned by the draft and transferred to the created layer. Public views expose compact immutable source metadata and matching diagnostics; no File, DOM tree, whole original bytes, or browser resource appears in them.

Recommended model:

- `spatial.candidates`: immutable array of immutable source candidates. Each has its own ID, source kind, source reference, raw metadata, transformation result/status, and normalized position if viable. Multiple candidates from the same source kind are allowed.
- `spatial.current`: nullable immutable working-position record. It records the accepted coordinates, source candidate ID when applicable, acceptance method, and acceptance time. Replacing it never edits candidate evidence.
- `spatial.exifRead`: separate technical extraction state. Preview state, candidate viability, and placement are different concepts.
- Parsed GML rows and their raw metadata exist even when no photo matches. They belong to the source import/owner, not to synthetic photo assets. Association decisions are stored separately from immutable rows.
- Counts and map features are derived. `placedCount + unplacedCount === photoCount` always, regardless of preview errors, visibility, batch selection, or the number of candidates.

Illustrative public photo after GML acceptance and EXIF extraction; IDs/times are examples, source coordinates and GPS tags are from the first real feature:

```js
{
  id: 'photo-session-01',
  originalFilename: 'Trase B_2025-08-06-16-31-18_9d243233b5ce3ef94dc5e3953ce8cf_Kg10.jpg',
  source: 'local-file',
  // Existing size, mimeType, importedAt, dimensions, preview, etc. retained.
  // Original File remains private; getFile(id) returns the exact File.
  sourceRelativePath: null, // File.webkitRelativePath if supplied; never fabricated.
  spatial: {
    exifRead: { state: 'viable', errorCode: null },
    candidates: [
      {
        id: 'candidate-gml-01', kind: 'gml', sourceId: 'source-gml-01',
        sourceEntryId: 'entry-01',
        raw: {
          featureId: 'id4c37bff5-80d1-4e75-b898-310ce0e9decd',
          pointId: 'id6a75345a-c99a-4481-9c3e-2bc9ab1b1aa1',
          localId: '4c37bff5-80d1-4e75-b898-310ce0e9decd', idNamespace: '',
          fotolink: 'Attachments\\Trase B_2025-08-06-16-31-18_9d243233b5ce3ef94dc5e3953ce8cf_Kg10.jpg',
          posText: '581932.579311 6566001.891835 0.000000',
          coordinates: [581932.579311, 6566001.891835, 0],
          declaredSrsName: 'http://www.opengis.net/def/crs/epsg/0/5972',
          pointSrsName: null, dimension: 3,
          photographedAtText: '2025-08-06T16:30:55',
          direction: { valueText: '0', unitText: '1', referenceText: '1' }
        },
        crsResolution: {
          sourceCrs: 'EPSG:5972', declarationLocation: 'collection-envelope',
          method: 'terrain-envelope-fallback', axisOrder: 'easting-northing-height',
          horizontalProjection: 'EPSG:25832', verticalCrs: 'EPSG:5941'
        },
        status: 'viable',
        position: { crs: 'EPSG:4326', longitude: 10.435550000107055, latitude: 59.225122222573425 },
        transform: { method: 'proj4-horizontal-map-approximation', vertical: 'not-transformed' }
      },
      {
        id: 'candidate-exif-01', kind: 'exif', sourceAssetId: 'photo-session-01',
        raw: {
          GPSLatitudeRef: 'N', GPSLatitude: [59, 13, 30.44],
          GPSLongitudeRef: 'E', GPSLongitude: [10, 26, 7.98]
        },
        crsResolution: { sourceCrs: 'EPSG:4326', method: 'exif-gps-map-assumption', explicitDatum: null },
        status: 'viable',
        position: { crs: 'EPSG:4326', longitude: 10.43555, latitude: 59.225122222222225 }
      }
    ],
    current: {
      position: { crs: 'EPSG:4326', longitude: 10.435550000107055, latitude: 59.225122222573425 },
      basis: { kind: 'candidate', candidateId: 'candidate-gml-01' },
      acceptance: 'initial-confident-gml-match', acceptedAt: 1791244800000
    }
  }
}
```

The GML raw values can be held once in immutable source rows and referenced by candidates; the example expands them for readability. `raw` EXIF values mean original decoded tag values, not a lossless copy of TIFF rational encodings. Exifr divides rational pairs during parsing; the retained original File preserves exact bytes and is the source for future rereading. Do not promise numerator/denominator fidelity from its standard output. [exifr TIFF parser source](https://raw.githubusercontent.com/MikeKovarik/exifr/master/src/segment-parsers/tiff-exif.mjs)

An unplaced photo is explicit:

```js
{
  spatial: {
    exifRead: { state: 'no-gps', errorCode: null },
    candidates: [], current: null
  }
}
```

A viable EXIF-only photo also has `current: null` until accepted. A malformed/unsupported source retains a candidate/row with raw evidence, `status: 'invalid'` or `'unsupported-crs'`, `position: null`, and a structured issue code. Do not turn failed transformation into a viable position.

Illustrative source-import diagnostics, separate from photo membership:

```js
{
  id: 'source-gml-01', kind: 'gml', filename: 'positions.gml',
  namespace: 'http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101',
  importedAt: 1791244800000,
  entries: [/* immutable raw rows; each has its own internal entry ID */],
  matches: [
    { entryId: 'entry-01', status: 'matched', photoId: 'photo-session-01', method: 'exact-basename' },
    { entryId: 'entry-02', status: 'ambiguous', photoIds: ['photo-session-02', 'photo-session-03'], reason: 'duplicate-photo-basename' },
    { entryId: 'entry-03', status: 'unmatched', photoIds: [], reason: 'no-photo' }
  ],
  unmatchedPhotoIds: ['photo-session-04'],
  issues: [/* invalid XML/geometry/CRS, duplicate references, compatibility notes */]
}
```

Layer snapshots add derived `placedCount`, `unplacedCount`, `exifCandidateCount` (photos with at least one viable EXIF candidate), and `spatialSourceIds`. Keep total `photoCount`, membership, and visibility unchanged. A per-layer position revision may support map memoization; it is not a second coordinate authority.

Manual replacement in the **following milestone** uses the same current-position writer:

```js
current: {
  position: { crs: 'EPSG:4326', longitude: 10.436, latitude: 59.226 },
  basis: { kind: 'manual' }, acceptance: 'manual-placement', acceptedAt: 1791244900000
}
```

Do not create a direction working value now. Later add a separate direction evidence/current model with current default `null`; never derive known north from these raw zero values. No object-association field or survey-object owner is required.

## 5. Proposed GML matching/import flow

### Milestone choice

Support **photos plus optional matching GML within one draft import flow**, before layer creation. Keep the existing image picker; add a separate `Legg til posisjoner (GML)` picker and accept one GML alongside photos in a dialog drop. Route `.gml` separately before `photoSession.importFiles()` so it is not reported as a rejected image. Keep generic survey upload/drop and generic Bilder semantics unchanged.

One positioning GML per draft is sufficient initially. Replacement is explicit and transactional: parse a new file before replacing the staged source; a failed replacement leaves the last valid staged source intact with an error message. GML can be supplied before or after photos. Recompute provisional matches when photo membership changes, including after curation and appending. Nothing is guessed from filename dates, UUID fragments, or `gml:name`.

Show a compact summary, e.g. `GML: 148 treff · 0 uten bilde · 0 tvetydige`, a truthful initial-position note, and an expandable diagnostics list. The importer remains a collection/curation dialog, with no editing map or manual reconciliation wizard.

Provisional GML matching lives in a draft-owned source ledger. **Finalize candidate association and initial current positions atomically in `createLayer()`**, using all remaining draft photos. Before creation, the selected photo can display its proposed GML match, but it has no committed GML placement or map marker. EXIF extraction can continue independently. Creation waits only for an actively selected GML to finish parsing; it need not wait for thumbnails/EXIF. A parse failure offers an explicit path to create without positioning rather than silently accepting incomplete GML.

Unmatched or ambiguous rows do not block creating the layer after their diagnostics are visible. They remain layer-owned source diagnostics, never extra photos. If curation removes a photo, its GML row becomes unmatched and the photo stays excluded. The curation summary should make that consequence visible.

### Browser parser and CRS handling

Use a focused `src/lib/photos/terrainPhotoGml.mjs`, with `DOMParser` resolved at call time or injected. Parse `File.text()` as XML and inspect `parsererror`; reject a DOCTYPE/external-entity construct before parsing. Do not fetch the schema or follow fotolinks. Use namespace URI plus local name, not hardcoded prefixes or regex to parse XML. Explicitly recognize the inspected 2019 namespace and GML 3.2; other product versions get an unsupported-profile message until separately verified.

Extract each feature's link, label, IDs, raw point text/numbers, dimensions, local/ancestor declarations, identification, timestamp text, and raw direction fields. Validate exactly one intended point and a finite supported coordinate tuple. Preserve a diagnostic row for missing link, malformed geometry, conflicting dimensions, or unsupported CRS rather than dropping it from counts. This is interoperability ingestion, not full XSD validation or a generic SOSI/GML survey parser.

Resolution order: applicable explicit geometry/pos declarations and legitimate containing declarations first; then, for this recognized Terrain profile only, the single collection envelope declaration when no applicable declaration exists. Record `terrain-envelope-fallback` and a collection compatibility note. Multiple/conflicting envelope declarations cannot be guessed. A point's explicit CRS wins over the envelope. Missing/unsupported CRS means no normalized position and no automatic current placement.

Recognize exact EPSG forms such as `EPSG:5972`, OGC HTTP(S) CRS URLs, and `urn:ogc:def:crs:EPSG::5972`; use a strict parser with an explicit allowlist. For this profile support EPSG:5972 first, plus explicit E/N EPSG:25832/25833 if tested. Do not infer a zone from coordinate magnitudes. Geographic GML axis conventions require separate verified handling; do not assume every EPSG:4326 GML tuple uses GeoJSON ordering.

EPSG:5972 combines EUREF89 UTM zone 32 and NN2000 height. Preserve the original CRS string and all three ordinates; for normal-map use transform only E/N with the existing EPSG:25832 horizontal definition to EPSG:4326. Do not label raw data EPSG:25832, transform the zero height to ellipsoid altitude, or register a misleading full 3D alias. [Kartverket, section 4.6](https://kartverket.no/globalassets/forskning-og-utvikling/rapporter/forvaltning-av-data-i-en-to-rammelosning.pdf)

The strict photo projection helper returns a success/error result and checks finite longitude/latitude bounds. Keep the method labeled as the existing horizontal map approximation, not survey-grade datum/epoch transformation. Store both the raw/source geometry and the derived geographic candidate once at ingestion. Leaflet handles the display projection to EPSG:3857. Proj4's documented default ordering is projected x/y and geographic longitude/latitude. [Proj4js documentation](https://proj4js.org/#axis-order)

Set explicit input-size/feature-count guards with understandable errors (for example a 10 MiB positioning-XML limit, comfortably above this 174 KiB fixture); these are local parser limits, not changes to validation policy. Do not store a live DOM or retain the GML File after raw rows/source metadata have been captured.

### Filename normalization and matching

Keep original `fotolink`, File.name, and optional File.webkitRelativePath unchanged. Derive comparison keys separately:

1. Remove surrounding XML formatting whitespace from link text, normalize both separators to `/`, collapse harmless repeated separators and `.` segments, and normalize Unicode to NFC. Preserve internal spaces and characters; do not remove accents, punctuation, suffixes, or extensions.
2. Treat the link as a reference, never a path to open. An actual File picker supplies no absolute filesystem path. Store a real relative path when present; do not manufacture `Attachments/` paths from File.name.
3. Try exact normalized relative-path matches when an imported relative path is available. Permit an explicit leading collection-folder difference only through a unique segment suffix match, recorded as such; never arbitrary string suffix matching.
4. Otherwise use exact normalized basename, requiring exactly one eligible imported photo and a unique GML association. Case-insensitive fallback uses deterministic `toLowerCase()` keys, only when unique and with its method recorded. NFC normalization and case fallback can expose collisions; they must not silently pick one. No locale-sensitive comparison or fuzzy matching.
5. Check normalized basename/path collision buckets before accepting a basename fallback. If `Photo.jpg` and `photo.jpg` both exist, basename matching stays ambiguous even if one exact spelling looks preferable. A genuinely distinguishing exact relative path may resolve them; import order, size, modification date, and content identity may not.
6. Literal paths are tried first. URI percent-decoding is a guarded fallback for URI-style references only, once, and only to a unique eligible key. Do not blindly decode literal `%`, strip literal `#`/`?`, or decode encoded separators into new path segments. Malformed URI encodings become diagnostics. The real fixture needs none of this fallback.

Absolute Windows/UNC references may provide a basename comparison with the match method recorded, but are never fetched or treated as an imported absolute path. Traversal references (`..`) and unsupported remote URLs should be surfaced rather than resolved automatically in this first increment. No searching outside the chosen collection, other FOTO layers, or a user's disk.

Use a bipartite mapping check, not a greedy file loop. Two assets with the same basename remain two photos. Two GML rows targeting the same photo are a duplicate-reference/conflicting-source diagnostic; do not select the first or auto-accept either. If one row maps to several photos, it remains ambiguous and unassociated. Keep eligible asset IDs and row IDs in diagnostics. No manual ambiguity-resolution UI is required now.

A photo with no matched GML remains in the layer. It may have EXIF evidence, but is unplaced unless the user later accepts a candidate. A confidently matched but invalid/unsupported geometry has a link association and raw source evidence, yet no current position. Count matching and viable placement separately.

### After-creation positioning imports

Do **not** add late GML import UI in this first increment. It would need layer-scoped source import, rematching, conflict/overwrite policy, and interaction with accepted EXIF/manual positions. This is a useful next capability, but not necessary to prove the real corpus flow.

The future action must explicitly target `layerId`, add a layer-owned source/ledger, and match only that layer's existing photo IDs. It transfers no asset, appends no photos, and never uses the global draft as a backdoor. New confident matches may initialize only currently unplaced photos; existing current positions remain until explicit user acceptance. New sources are additive provenance; source removal/replacement must handle current candidate references deliberately. This is why source import rows, associations, and asset membership are separate now.

## 6. Proposed EXIF GPS flow

No EXIF reader exists in the current dependencies or source. Native File/Blob APIs let the app read bytes, and image decoding supplies preview dimensions, but the current browser preview path does not expose GPS metadata. A dependency-free JPEG TIFF/IFD reader is possible, but robust endian handling, rational values, offsets, malformed metadata, and PNG containers would become new parser maintenance work.

Recommend `exifr`, lazy-loaded through `src/lib/photos/exifGps.mjs`. Its documented API accepts File/Blob, supports chunked reading and selectable GPS tags; its full ESM bundle supports JPEG and PNG whereas the lite bundle does not cover PNG. Configure GPS-only reading and observable errors. Do not use the `gps()` convenience result alone, because the app also needs source tags. [exifr documentation](https://github.com/MikeKovarik/exifr#api)

Required extraction formats for this milestone: JPEG and PNG. Preserve existing WebP previews, but classify WebP GPS extraction as `unsupported-format`, not `no-gps`; the documented exifr container list does not include WebP. Likewise do not promise new HEIC/TIFF preview support or all-camera metadata coverage. Expanding extraction formats is a separate tested extension. Verify the selected exifr release and bundled size during implementation and lock the installed version; no dependency was added during this audit.

Read the original File, independently of thumbnail state. Retain decoded latitude/longitude DMS values and refs, plus spatial tags when present: GPS datum, altitude/ref, DOP, and horizontal positioning error. Skip photo dates, photographer, GPS date/time, image direction, XMP, MakerNote, thumbnail extraction, and camera-information analysis. Disable silent parser errors and value revival/translation where it would obscure source values. Validate the pinned library options with actual malformed metadata tests.

Normalize arrays/typed values into immutable plain metadata. DMS refs and components must be valid; hemisphere sign must be explicit; normalized values must be finite and within geographic bounds. Preserve explicit non-WGS84 GPS datum text and classify it unsupported until handled, rather than falsely assigning WGS84. When datum is absent, record the map-use WGS84 assumption. A coordinate can be numerically viable while being wrong in the real world. Do not assign geographic trust from coordinate range, EXIF presence, or closeness to GML. Flag a zero/zero pair as questionable and require explicit acceptance if retained as a candidate.

Extraction states: `pending`, `viable`, `no-gps`, `invalid`, `error`, `unsupported-format`. Absent tags differ from malformed metadata, unsupported containers, and unreadable files. Store structured error codes; an error never removes the photo or changes preview state. Current positions are never set by EXIF completion.

Use a bounded asynchronous metadata queue (one reader initially, yielding between jobs), with generation/liveness guards and a cancel token. Do not read all 181.5 MiB into parallel ArrayBuffers. The library may not offer an AbortSignal; cancellation must at least stop queued work, ignore late results, and release temporary references when an active read settles. Do not claim immediate cancellation of an underlying non-cancelable read. Layer transfer must allow existing jobs to finish into their new owner; begin/cancel of another draft must not discard layer jobs.

No worker is required at the planning boundary. Measure real browser responsiveness; add a worker only if measured parsing blocks interaction. Metadata extraction must not require server uploads, network requests, object URLs, or any source modification.

## 7. Proposed map integration

Add a pure `src/lib/photos/photoMapFeatures.mjs` adapter. Each visible layer contributes one feature per photo with a valid `spatial.current`; candidate-only and unplaced photos contribute none:

```js
{
  type: 'Feature', id: 'photo:photo-layer-01:photo-session-01',
  properties: { kind: 'photo', layerId: 'photo-layer-01', photoId: 'photo-session-01' },
  geometry: { type: 'Point', coordinates: [10.435550000107055, 59.225122222573425] }
}
```

Features contain IDs and geometry, not Files, thumbnails, raw metadata, survey indexes, FCODE, or invented survey attributes. Consume them in a dedicated `PhotoMarkersLayer.js` inside `MapInner`'s existing MapContainer. Prefer individually keyed React Leaflet Markers using a shared local camera SVG/divIcon; changing a current position updates that marker's `position`. Do not feed FOTO through survey `pointToLayer`, onEachFeature, filters, popup creation, casing, outliers, or validation highlighting.

Use a named photo-marker pane with fixed order, e.g. z-index 590, above WMS/line overlays and below the existing survey marker pane. This preserves existing survey selection/halo stacking; cross-type reorder is deferred. Tooltip/popup panes stay above it. Use a clear camera symbol, safe React tooltip/title text, keyboard-operable markers, and no thumbnail images on the normal map. Clicking a marker opens the existing viewer at that photo via a page callback; keep survey popup behavior unchanged. A lightweight photo-only focus style may indicate the photo targeted by a locate request without writing survey highlight IDs.

Visibility removes FOTO markers from the rendered set and from photo bounds. Hidden/unplaced layers still own all assets and metadata. Shared `Vis alle/Skjul alle` already updates photo visibility; it must work without new survey-store wiring. Publish/update derived counts on EXIF completion and acceptance; a thumbnail update must never reset current position or force a full photo-marker remount. Memoize geometry by membership/current-position revision and visibility if necessary; do not create a second persistent feature store.

Mount the map when any FOTO layer exists, including a no-position/hidden layer. Replace the page's blocking photo-only notice with a small nonblocking, truthful unplaced notice. Do not require a survey file before showing a GML-positioned FOTO layer.

Add `PhotoMapController.js` for geographic locate/focus requests and **photo-only initial fitting**. Fit all visible current FOTO positions once when the first viable positioned collection becomes available in a workspace without survey data. A single coordinate gets a bounded zoom. Candidate-only data never drives automatic fitting. Do not refit on each EXIF/thumbnail update or visibility toggle, and do not expand bounds to dubious candidates.

When survey data exists, keep existing automatic survey fitting unchanged; users locate photos explicitly. Avoid competing controllers: a photo locate request is one-shot, explicit, and resolved after the viewer closes; check owner/asset liveness before acting. Do not combine photo data into survey outlier calculations merely to reuse BoundsController. Reset/delete must clear pending photo requests; switching tabs for a locate action should select the normal map through the existing tab setter, without changing survey selection.

Coincident points stay exactly coincident and independently keyed. Expect 148 marker records for the corpus, at 136 distinct positions. The gallery gives access to every photo, including covered markers; no coordinate jitter or deduplication. Clustering/spiderfying or a co-located-photo chooser can follow with the editing workspace.

## 8. Proposed UX flow

1. **Bilder** starts a fresh draft as today. Add photos, inspect, and remove unwanted photos. All remaining photos are included; dots remain removal selection only.
2. Optionally add/drop the matching GML. Show source filename, match/placement summary, compatibility note, and expandable unmatched/ambiguous/error details. State that confident GML positions will become initial positions and EXIF will remain suggestions.
3. Create FOTO layer. Transfer photos and source ledger together; initialize only eligible GML current positions. Close importer into the normal sidebar/map. Without GML, EXIF GPS is still useful evidence, but creates no marker until explicitly accepted.
4. Layer card: `148 bilder · 148 plassert · 0 uplassert`. GPS candidate count can live in the viewer summary/tooltip to keep the card compact. Position counts are independent of the visibility checkbox.
5. **Åpne bilder** reuses the current viewer, now with a small spatial-inspection section showing current source/position, candidate locations, raw source fields, and extraction/matching status. Keep original-image display and photo membership protected. The existing `Kun visning` wording must distinguish protected originals/collection from the limited position-acceptance actions.
6. A marker opens that viewer at the matching photo. A zoom button closes layer inspection and locates on the normal map; it must not cancel an import or mutate placement. Restoring keyboard focus should target a surviving opener or sensible page fallback.

| Action | First spatial milestone | Reason/semantics |
| --- | --- | --- |
| `Zoom til posisjon` | Include | Locate current position; disabled when current is null |
| `Zoom til EXIF` | Include when viable | Explicit candidate preview; does not accept or render a permanent EXIF marker |
| `Zoom til GML` | Include when viable | Useful after accepting EXIF; source/current remain separate |
| `Bruk EXIF-posisjon` | Include, explicit button | Replaces only current position; label source risk clearly and display what will change |
| `Bruk GML-posisjon` | Include | Explicit return to a viable GML candidate; no inference from direction or preview |
| `Plasser` | Next increment | Requires a deliberate map interaction/cancel/commit workflow |
| `Flytt` | Next increment | Requires existing-position preview, commit/cancel, and conflict with map tools |

Candidate acceptance is synchronous and target-photo scoped; no batch editing. Multiple viable candidates are displayed with distinct source/entry identity, not reduced to one EXIF/GML coordinate. Only explicitly associated candidates can be accepted; ambiguous GML rows cannot be accepted through a hidden first-match shortcut.

A hidden layer may be inspected and its source/current position may be zoomed to. This does not silently reveal it or create candidate markers; show its hidden status and let the existing checkbox control visibility. Closing inspection preserves all session state. Generic Bilder never appends to an inspected layer.

The next full-screen workspace should have a collection/list, the map as the largest pane, and an inspector, using these same IDs, session mutators, source candidates, and map adapter. Introduce resizable/collapsible panes there after concrete placement interactions are designed. No temporary mini-map needs to be embedded in today's importer.

## 9. Exact files likely to change

Paths below describe future implementation, not changes made during this audit.

| File | Planned responsibility |
| --- | --- |
| `src/lib/photos/photoSession.mjs` | Spatial records and current writer; source/diagnostic ownership; bounded metadata scheduling; latest-record task merges; atomic GML finalize/transfer; counts and cleanup |
| `src/lib/photos/terrainPhotoGml.mjs` (new) | Narrow namespace-aware browser parser and source rows/CRS-resolution metadata |
| `src/lib/photos/photoReferenceMatching.mjs` (new) | Pure normalized-key/bipartite matching and structured diagnostics |
| `src/lib/photos/exifGps.mjs` (new) | Lazy library adapter, raw spatial tags, candidate validation and extraction states |
| `src/lib/photos/photoSpatial.mjs` (new) | Small immutable candidate/current validation and acceptance helpers; keep one clear writer |
| `src/lib/photos/photoMapFeatures.mjs` (new) | Pure current-position-to-map adapter and optional derived summaries |
| `src/lib/map/coordinateProjection.js` | Add strict explicit source-CRS horizontal API using existing proj4 definitions; retain survey behavior |
| `src/components/photos/PhotoCollectionDialog.js` | Optional GML picker/drop routing, staged-source summary/errors, creation readiness, selected-photo/open/locate wiring |
| `src/components/photos/PhotoCollectionPanel.js` | Pass spatial-inspection props alongside the existing selected inspector; retain image URL lifecycle |
| `src/components/photos/PhotoSpatialInspector.js` (new) | Current/candidate/provenance inspection and explicit accept/locate controls |
| `src/components/photos/PhotoLayerCard.js` | Compact truthful placed/unplaced counts and visibility wording |
| `src/components/photos/PhotoMarkersLayer.js` (new) | Dedicated keyed camera markers, photo pane, visibility, safe tooltips and click callback |
| `src/components/photos/PhotoMapController.js` (new) | Typed geographic photo locate requests and isolated photo-only initial fitting |
| `src/components/MapInner.js` | FOTO-aware mount condition and insertion of photo marker/controller children; minimal existing-map changes |
| `src/app/page.js` | Photo opener/selected ID/locate state; nonblocking photo-only notice; reset request cleanup; MapView props |
| `src/app/globals.css` | Only additive photo spatial inspector/status/marker styles if utility classes cannot cover them |
| `package.json`, `package-lock.json` | One recommended EXIF dependency, with reproducible resolution |

`usePhotoSession.js` needs a change only if the snapshot/API gains a dedicated selector; its current subscription can suffice. `MapView.js` already forwards props, so no required logic change. `LayerManager.js`, `Sidebar.js`, and `layerPresentation.mjs` already have the right presentation/visibility seam; change only callback signatures if necessary. `LayerPanel.js`, `store.js`, survey parsers, map popup utilities, layer ordering/highlight policy, survey validation, Data Table, and hyperlink-copy code should remain untouched. Tests may cover them without changing their behavior.

## 10. Tests/validation plan

### Audit checks actually completed

- Verified branch, expected HEAD, clean initial status, applicable instructions, accepted report, and relevant implementation paths.
- Parsed the actual XML, enumerated all 148 sibling files, checked exact/NFC/case-normalized filename uniqueness, IDs, CRS declarations, fields, geometry, and coincidence groups.
- Read original GPS tags with Pillow; computed all source-content hashes and compared matched GPS/GML horizontal coordinates using the installed proj4 definition. No EXIF date-source analysis was performed.
- Executed the following existing baseline suite: **45 tests passed, zero failed**. Node loader/module-type and unavailable browser-storage notices were non-failing.

```powershell
node --experimental-loader ./tests/esmJsLoader.mjs --test tests/photoSession.test.mjs tests/photoImportLayers.test.mjs tests/photoPreviewLifecycle.test.mjs tests/photoResetIntegration.test.mjs tests/layerPresentation.test.mjs tests/layerOrder.test.mjs tests/richerUsageTelemetryParserIntegration.test.mjs
```

No new functionality exists yet, so this audit did not perform spatial browser acceptance, a build, or an application implementation test. Earlier browser results in the accepted report are baseline evidence only.

### Unit coverage to add

Proposed new tests: `tests/photoSpatial.test.mjs`, `tests/photoReferenceMatching.test.mjs`, `tests/terrainPhotoGml.test.mjs`, `tests/exifGps.test.mjs`, `tests/photoMapFeatures.test.mjs`, and `tests/photoSpatialProjection.test.mjs`.

- Source candidates/current: EXIF-only stays unplaced; confident GML initializes; explicit EXIF/GML acceptance replaces only current; nested frozen source values remain identical; invalid positions rejected. Include a future-shaped manual-current replacement at the helper boundary without building manual UI.
- Matching: separators, path suffix boundaries, optional real relative paths, uppercase extensions, case collisions, NFC/NFD, spaces/accents, literal/URI percent handling, query/fragment characters, traversal, absolute paths, same File imported twice, duplicate GML references, multiple assets per key, removed/appended photos, unmatched counts. No order-dependent winners.
- GML: namespace prefix changes, exact 2019 profile, empty IDs/fields, point/envelope CRS precedence, fallback provenance, unsupported/missing CRS, inconsistent dimensions, nonfinite/malformed geometry, wrong feature type, malformed XML, DOCTYPE guard, multiple points/envelopes, input limits, timezone-free timestamp kept as text, zero direction only retained raw.
- Projection: known E/N sample lands near 10.43555 E / 59.22512 N; source EPSG:5972 and third ordinate preserved; axis swaps cannot pass; failures return structured errors; existing survey transforms unchanged.
- EXIF: small synthetic JPEGs with little/big endian metadata, N/S/E/W, rational DMS, missing ref, absent GPS, corrupt offsets, zero denominator/nonfinite values, zero coordinates, unknown datum, PNG GPS/no GPS, unsupported WebP, and preview failure with valid metadata. Test the installed parser, not only an adapter mock.
- Map adapter: visible/current only, stable composite IDs, correct geographic order, no bytes/thumbnails/FCODE, no fake markers, current position updates, candidate-only changes ignored, independent coincident photos, hidden-layer counts unchanged.

Node has no browser DOMParser here. Split pure row validation/matching from document extraction and allow XML parser injection; use tiny synthetic rows for pure unit tests. Verify the **actual DOMParser XML path** in browser integration. Do not add an XML dependency just to make browser parsing look tested in Node, and do not count handcrafted DOM mocks as real XML interoperability coverage.

### State and integration coverage

Extend `photoSession.test.mjs`, `photoImportLayers.test.mjs`, and `photoResetIntegration.test.mjs`; add `tests/photoSpatialIntegration.test.mjs` if separating larger scenarios improves clarity.

- Complete EXIF before/after thumbnail success/failure and before/after GML layer creation; no lost candidates/current. Complete an old job after remove/cancel/delete/reset; no resurrection. Transfer jobs to a layer, then begin/cancel another draft; transferred work survives.
- GML-first and photos-first import, staged replacement success/failure, re-curation, appending duplicate names, source ledger transfer, and layer deletion with unmatched rows. Old immutable snapshots remain unchanged.
- Selection does not affect layer inclusion. All photo assets have exactly one owner. GML rows without photos are diagnostics, not assets.
- Reset/delete release original references, thumbnail URLs, queued metadata/GML work, private source rows, map feature/cache references, original inspection URLs, and pending locate targets; repeat operations safely. Other layers/drafts survive scoped deletion.
- Reopening layer inspection reads live current/candidate state; session changes notify the viewer and map; hard reload restores no photo layer or photo source/request state from localStorage.
- Survey upload/error/delete, table inspection, validation, popup, hyperlinks, and survey highlight/order behavior remain unchanged in coexistence.

### Browser acceptance using the real corpus

Use a production build and the established browser tooling, with Testmodus for survey coexistence checks. Use the real files through the native picker or a browser File-based fixture harness; do not fake 148 identical JPEGs. Keep originals outside the repo and obtain before/after hashes. Small anonymized synthetic GML/GPS fixtures may be committed in implementation, but do not copy this full private corpus into git.

| Scenario | Required result |
| --- | --- |
| All 148 JPEGs plus matching GML | 148 included photos, 148 confident matches, 148 viable GML candidates, 148 current positions, zero unplaced; draft selection does not affect inclusion |
| EXIF completion on that layer | 148 viable EXIF candidates; current still references the GML candidate even though coordinates agree |
| Normal map without surveys | Map visible and initially fitted to current FOTO positions; 148 marker records at 136 distinct coordinates; no deduplication |
| Individual/shared visibility | Hide/show all corresponding markers; retain counts, source data, and photos; map remains mounted when all are hidden |
| Reopen/click marker/locate | Correct photo inspected, current and both sources inspectable; zoom uses that photo/candidate geography independent of active survey CRS; candidate zoom does not change current |
| Explicit candidate use | Accept EXIF, then return to GML; current basis changes and both candidates remain; no date/direction/source-file write |
| Photo-only import without GML | Initially 148 unplaced and zero permanent markers despite 148 viable EXIF candidates; only explicitly accepted photos become placed |
| Remove one during curation | 147 included/current photos, 147 associated GML candidates; removed source row shown unmatched; no orphan marker or resurrected photo |
| Synthetic no-GPS photo, no GML | Photo remains included and unplaced; honest no-GPS status; no marker |
| Synthetic wrong EXIF with valid GML | Both candidates retained; GML remains current regardless of task completion order; wrong EXIF only used after explicit action |
| Synthetic missing/ambiguous reference | Visible diagnostics; no guessed candidate/current association; unmatched photos remain included |
| Delete/reset while work pending | Only intended owner released; no later thumbnails/candidates/markers return; map requests cleared; application-owned URLs return to the correct baseline |
| Hard reload | No FOTO Files, layers, candidates, source ledgers, or requests restored; existing settings behavior unchanged |
| Original integrity | GML and all 148 JPEG content hashes unchanged before/after; source files never re-encoded or written |
| Coexistence | Existing synthetic GMI/SOSI/KOF acceptance fixtures render and retain survey visibility, selection, highlighting, zoom, table/validator, and popup/link actions |

Check responsiveness while decoding the 190 MB corpus, bounded readers, original URL lifecycle, close/reopen cycles, and retained references after deletion. Verify keyboard marker/viewer actions and summaries on desktop, short viewport, and narrow layout. Source-level regex assertions in existing tests may need small updates to reflect new MapView props; they are not a substitute for rendered marker/visibility/zoom checks.

Run focused existing/new tests, targeted ESLint, `npm.cmd run build`, and `git diff --check` after implementation. Add `mapPaneToolbar`, `layerHighlightPanel`, `layerHighlightHalo`, `mapBackgroundControl`, `featurePopupContent`, `hyperlinkFilenames`, and relevant table tests as bounded regression checks. The accepted report documents pre-existing LayerPanel hook lint errors and one AppInfo assertion failure; this planning pass did not re-audit or fix those unrelated issues.

## 11. Risks/edge cases

- **Concurrent writers:** the existing captured-record thumbnail write is the main implementation hazard. Latest-record merges and race tests are required before adding metadata updates.
- **Terrain envelope-only CRS:** preserve explicit compatibility provenance; do not generalize the sibling-envelope fallback to arbitrary GML or assume guessed geometry is valid.
- **Height semantics:** raw 0 is preserved, but is not established as a measured NN2000 height. Current/map positions are horizontal; no geoid conversion or altitude authority is implied.
- **GPS trust:** this corpus's perfect agreement cannot test conflict policy. Numerically valid GPS may be wrong or derived; source evidence is never silently ranked by presence alone.
- **Format claims:** PNG metadata needs the selected full bundle; WebP decoding and GPS extraction support are separate. Unsupported extraction must not masquerade as absent GPS.
- **Matching collisions:** case/Unicode normalization and repeated File imports create ambiguity. Distinguishing path evidence is optional and must be real. Never match across layer owners or using photo-selection dots.
- **Coincident markers:** accepted limitation is gallery access to covered photos; retain all IDs and exact coordinates. Clustering, jitter, and location merging are not part of the first milestone.
- **Modal/map interaction:** a native modal makes the background inert. Zoom must close layer inspection before acting, without accidentally canceling a draft or losing original URL cleanup/focus behavior.
- **Source privacy/memory:** use IDs in features, plain GPS/GML fields in snapshots, private Files, bounded reads, and scoped source ledgers. Do not persist GPS in Zustand UI or retain decoded images/DOMs after deletion.
- **Reimport semantics:** repeated photo imports create new assets; repeated draft GML import replaces the staged document explicitly. Later additive layer sources need their own policy, already described above.
- **Date/direction semantics:** preserve timestamp text without guessing a timezone; zero raw direction is not an operational heading. No edit controls or EXIF date-source investigation is needed.
- **Map lifecycle:** empty/hidden FOTO layers must not unmount the map; explicit candidate zoom must not be transformed using whatever survey is active. Keep automatic photo fitting isolated from survey fitting.

No blocking product question remains for the recommended boundary. Implementation checks remain: pin/verify the GPS-only library options and PNG fixtures, measure full-bundle lazy-load size and corpus responsiveness, and verify photo pane/focus behavior in coexistence. These are bounded verification tasks, not reasons to widen the architecture review.

## 12. Explicitly deferred work

- Full-screen collection/map/inspector workspace and its resizable/collapsible panes.
- User-facing manual place/move interactions, drag/cancel/commit, undo/history, and placement-tool conflicts. Preserve the current-position contract now; implement the controls next.
- Post-creation GML attachment/reconciliation UI, manual resolution of ambiguous links, multiple positioning-document management, and source removal workflows.
- Direction extraction/controls/acceptance and direction-dependent symbols; future missing direction stays null regardless of export fallbacks.
- Batch photographer/date editing, EXIF date-source analysis, and timestamp-source reconciliation.
- GML export, schema validation/export compatibility, attachment packaging/ZIP, and original image mutation.
- VA-object association, GMI/hyperlink/DFOT ingestion, candidate derivation from survey objects, and shared asset ownership.
- All GML schema versions/geometry types/CRSs, vertical/datum-epoch precision transformations, and unsupported EXIF container expansion including WebP.
- Thumbnail symbols on the normal map, clustering/spiderfying, a colocated-photo chooser, cross-type layer reordering, FOTO validation/table integration, and 3D photo features.
- Persistence across hard reload, server uploads, collaboration, and generic application architecture/styling/validation changes.

## 13. Recommended milestone boundary

**Deliver a session-only spatial FOTO layer with optional draft GML positioning, independent EXIF GPS evidence, explicitly accepted current positions, camera markers, working visibility, compact placed/unplaced counts, inspectable provenance, and candidate zoom/acceptance in the existing viewer.**

Use GML as the initial current basis only for a confident unique association with a viable transformed point and no existing current position. EXIF never sets current automatically, including when GML is absent, late, invalid, or unmatched. Keep the initial policy visible in the import summary.

The following answers make the twenty planning decisions explicit:

| # | Decision |
| --- | --- |
| 1 | Canonical asset is the private photoSession record; add spatial metadata there, not to preview state |
| 2 | Keep spatial authority in external session; no new Zustand photo slice or UI persistence |
| 3 | Immutable source candidates/rows plus nullable replaceable current-position record with basis/acceptance |
| 4 | Pure photo feature adapter with `kind`, layerId, photoId, geographic Point; no survey dataset |
| 5 | Dedicated keyed Leaflet camera markers within the existing map, filtered by FOTO visibility/current |
| 6 | Display EPSG:3857; GeoJSON/proj4 geography lon/lat; Leaflet lat/lon; current survey zoom requests have different assumptions |
| 7 | Preserve EPSG:5972 E/N/H raw; use existing zone-32 horizontal definition for map geography; no vertical transformation |
| 8 | Namespace-aware, narrow browser DOMParser ingestion, explicit Terrain envelope fallback, no schema/network fetch |
| 9 | GML/projection/map need no new dependency |
| 10 | Read original File through bounded GPS-only extraction; preserve decoded source tags and exact private original |
| 11 | Recommend exifr for robust GPS parsing; browser bytes/preview APIs and current dependencies do not provide an EXIF reader |
| 12 | Separate comparison keys: Windows separators, real relative paths, NFC, conservative unique basename/case fallback |
| 13 | Owner-scoped immutable GML rows plus match ledger/diagnostics; unmatched photos remain assets, unresolved rows are not guessed |
| 14 | Yes, viable confident one-to-one GML positions initialize current at layer creation |
| 15 | No automatic EXIF placement under any first-milestone condition |
| 16 | Manual place/move later calls the same current writer with manual basis; candidates remain intact |
| 17 | Reset clears everything; scoped deletion releases its owner; visibility only renders/hides; reopen reads preserved session state |
| 18 | Pure matching/model/projection and actual-library tests, asynchronous ownership/race integration, rendered browser acceptance |
| 19 | Real corpus: 148 matches/GML currents/EXIF candidates, 136 locations, lifecycle/visibility/inspection/hash checks; synthetic failures supplement it |
| 20 | Defer full-screen/manual placement, late-source reconciliation, direction/date editing, export, object links/DFOT/GMI sources, persistence |

This is useful immediately for the real project while establishing the data and map boundaries the placement workspace will consume. No placeholder manual buttons or pretend full editor are needed.

## 14. Recommended implementation order

1. **Define spatial/source ownership contracts and fix latest-record updates.** Add immutable candidate/current helpers and tests for source preservation and concurrent thumbnail/metadata/current updates. Keep preview and spatial failures independent.
2. **Add strict explicit-CRS horizontal projection.** Verify EPSG:5972 provenance/axis handling with the first real point; preserve current survey APIs and tests.
3. **Implement the narrow GML parser and pure matching ledger.** Prove namespace/envelope interoperability, all 148 exact matches, and collision/error handling before connecting automatic acceptance.
4. **Add the GPS adapter/dependency and bounded session tasks.** Test JPEG/PNG, raw spatial tags, errors/support states, cancellation/owner transfer, and that extraction never changes current.
5. **Integrate optional GML into the existing draft flow.** Recompute after curation, retain diagnostics, and finalize GML candidates/current positions atomically when all remaining photos become a layer. Keep generic Bilder/new-owner behavior.
6. **Add map features, markers, FOTO-aware mounting, and initial photo-only fitting.** Verify counts, visibility, empty/hidden layers, overlap, and unchanged survey rendering.
7. **Add compact inspector provenance and explicit zoom/acceptance.** Use a dedicated geographic photo controller and page-owned ephemeral requests; preserve original URL/focus/cleanup behavior.
8. **Run real-corpus browser acceptance and bounded regression checks.** Measure responsiveness/resources, compare source hashes, verify reload/session semantics, run build/lint/diff checks, and document limitations.
9. **Next increment: full-screen placement workspace.** Reuse the tested registry/candidates/current adapter and add deliberate manual place/move, then late GML reconciliation if needed. Do not re-home asset ownership or reinterpret raw source data.

