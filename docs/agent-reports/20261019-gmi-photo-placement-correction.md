# GMI photo placement correction

Date: 2026-10-19. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`. HEAD: `3cf7ef1`.

## 1. Reason for correction

Manual testing of Slice 1 established that delivered photos should be placeable at the GMI POINT objects referencing them. Association-only treatment prevented the intended workflow even when the source contained usable point coordinates. This correction extends the existing FOTO workflow; it does not implement Slice 2.

## 2. Previous assumption

Slice 1 deliberately suppressed all GMI geometry from position review. That assumption was too conservative: a valid photo reference on a point supplies both association evidence and a potential spatial occurrence. A line reference still supplies association evidence only. Repeated point references express multiple placements of one image, not an ambiguity requiring selection of one object.

## 3. Final domain model

`photoSession` now has a private asset registry and a private occurrence registry. Assets own the original File, immutable original-file identity and metadata, preview/dimensions, EXIF read state, and shared EXIF/GML candidates. Occurrences reference `assetId` and own current position, direction, and optional exact referring-point provenance/GMI candidate. Existing photo IDs remain occurrence IDs for selection, map features, manual editing and deletion.

Public occurrence views share preview, dimensions and candidate objects. They contain no File. New GMI occurrences are built from shared asset metadata and empty local working state; entire photo records with File/resource ownership are not cloned. The first available ordinary occurrence is reused, preserving its accepted current position and direction. Additional occurrences start unplaced with unknown direction.

## 4. Asset versus occurrence semantics

One imported file creates one asset and one ordinary occurrence. N distinct referring GMI points create N occurrences of that asset. Each occurrence can independently accept GMI, EXIF, GML or a manual position. An accepted/manual occurrence defaults to **Behold gjeldende**. No source takes precedence by arrival order.

Layers expose `assetCount`, existing `photoCount` as occurrence count, and `assetIdsByPhotoId`. Public photos expose `assetId`, `occurrence` and `repeatGroup` with occurrence count/index, distinct referring-point count, total source-scoped referring-object count, and repeated status. The stable repeat-group identity is the asset ID within its owner layer.

## 5. GMI point positioning rule and coordinate safety

A confident image match on a parsed POINT contributes one occurrence and one occurrence-specific GMI candidate. Type/TEMA do not gate eligibility. Multiple hyperlink members on the same object pointing to the same asset retain all raw member evidence but create one object/asset occurrence.

The production GMI parser stores source coordinates as `{ x, y, z }[]`; they have not been projected to browser/map display coordinates. The adapter retains `parser.toObject().crsContext`, from the same source-header CRS classifier used by the map pipeline. Only a declared, supported source CRS and exactly one parsed source coordinate qualify. `projectPhotoCoordinate` supplies strict horizontal transformation to EPSG:4326. No filename, coordinate magnitude, map projection fallback or displayed geometry supplies a CRS.

Tests compare EPSG:25832/25833/4326 results against the map transformation, including a pinned numerical EPSG:25832 result. Missing/invalid/unsupported CRS and missing/multiple coordinates retain associations and unavailable candidate diagnostics. Position review explains why GMI cannot be used. Coordinates are never guessed or averaged; height is not transformed.

## 6. GMI line rule

LINE references create/retain asset associations and no GMI position candidate or extra spatial occurrence. No midpoint, first vertex, nearest point or centroid is calculated. Point-plus-line references retain all edges while only point edges create spatial occurrences.

## 7. Repeated-reference semantics

Each distinct source-scoped referring point retains its own occurrence, including identical coordinates. Multiple objects reusing a photo remain confident matches to one underlying asset. Genuine filename collisions between separately imported files remain ambiguous under the existing matching rules.

**Flere plasseringer**, **Samme bilde**, occurrence number/count, and referring-object context distinguish repeated placements. Association-only repeats use **Gjentas**. Removing a placement does not erase the fact that the delivered file was referenced by multiple objects.

Recheck reuses existing occurrence identities. Explicitly removed occurrences are recorded in owner-scoped `dismissedGmiPlacements` so a recheck does not recreate them. Removing and reattaching identical source bytes reuses surviving occurrences and refreshes their source connection/candidate. Different byte revisions remain distinct, even with the same GUID.

## 8. EXIF interaction

EXIF extraction/read state and candidate evidence belong to the asset. One JPEG used by N objects still schedules one EXIF job and one preview job. Every occurrence exposes the same EXIF candidate object. Applying EXIF changes selected occurrence positions only; it never merges/deletes GMI occurrences. New EXIF evidence arriving during review requires refresh to appear in the reviewed choices.

Delayed metadata completion patches shared evidence while retaining every live occurrence's current position, direction and GMI provenance, even when the original occurrence ID has been removed.

## 9. GML interaction

The current GML matcher resolves photo references to delivered assets, not GMI objects/occurrences. Source matching, evidence attachment and append duplicate checks therefore deduplicate occurrence views by asset ID before matching. A single GML candidate is shared across all occurrences. Neither one GML position nor one EXIF position reduces the number of GMI occurrences.

The unified review validates GML matches at asset scope, then offers shared evidence separately for each occurrence. Legacy positioning plans/apply also resolve GML by asset identity. Existing ambiguity, CRS and source-fingerprint policy remains intact.

## 10. Map and workspace behavior

After explicit apply, each placed occurrence produces a distinct feature/marker ID through the existing layer ID + photo/occurrence ID convention. Coincident points remain separate records/markers and are individually selectable in the collection, even if markers overlap visually.

Collection rows share the image/thumbnail and display repeat state plus compact referring-object labels. Inspector and wizard details show AnleggsID (or another available object identifier), TEMA, Type, GUID and source filename. The inspector also retains all point/line association evidence. Popup and repeated-marker accessible titles identify the placement of the shared photo. Full-size viewing uses the inspector's existing original URL.

Collection/layer counters distinguish assets from placements when they differ. Placed/unplaced counters count occurrences; EXIF availability counts assets. Repeated selection/application summaries use “plasseringer”. Active selection, manual placement and direction remain occurrence-scoped.

## 11. Resource ownership and removal

Only assets own File and thumbnail URL resources. Job queues are asset-scoped. Shared asset updates fan out immutable evidence/metadata views without replacing occurrence-local state.

**Fjern fra lag** removes selected occurrences. **Fjern hele bildet med alle plasseringer** expands selected asset groups into all their occurrences before the same confirmation/removal path. `removeLayerAssets` provides the corresponding owner-scoped domain operation. Batch removal, layer deletion, cancelled import and reset release each asset exactly once after its final occurrence disappears. Removing the first/original occurrence does not cancel jobs or revoke resources still needed by a sibling.

The workspace inspector is keyed by asset ID and its original URL effect depends on asset identity. Switching occurrences of the same asset reuses the original URL; the viewer creates none. Switching assets or deleting the last occurrence unmounts/cleans up that inspector resource. Original files on disk are never modified.

Append compares incoming files with existing assets once, including assets whose original occurrence ID was removed. Default duplicate-name skipping, explicit override and genuine separately imported copies retain their existing policy.

## 12. Source identity and provenance

Each occurrence retains owner FOTO layer ID, asset ID, GMI source ID and full-byte fingerprint, source filename, source-scoped object key, GUID, point geometry scope, parser ID/source index, raw geometry/attributes/lexemes, all contributing raw references/member evidence, and matching methods. Candidate provenance carries the same source evidence. Retained source registries keep the complete many-to-many ledger, including unmatched, invalid and ambiguous references and additional line associations.

Occurrences are reconciled by exact source fingerprint + object key + asset identity, never globally by GUID. Removing an occurrence prunes asset association endpoints only when the asset has no surviving occurrences. Source removal preserves accepted positions, direction and historical occurrence provenance, but its GMI candidates are no longer offered in unified review.

## 13. Transactions and cancellation

Before checkpoint A, staging/cancellation writes no retained source or occurrence state. Checkpoint A preflights the complete occurrence/source update, retains source/associations/point evidence, and publishes once with **zero accepted-current writes**. Existing accepted current objects remain identical; added occurrences have null current.

The existing authenticated operation tracks its reviewed membership in a private WeakMap. Only its own successful source checkpoint may advance that membership when reviewed occurrences are added. External append/removal/reset or replacement operations invalidate it. The dialog stays open after its authorized membership expansion.

Checkpoint B preflights every request against the registered immutable plan, exact live current and candidate identities, source set and owner membership before writing any accepted positions. One stale request rejects the whole batch. Closing after checkpoint A retains source, links and unplaced occurrence evidence; it does not imply rollback of the saved checkpoint. Manual positions/direction change only through their existing explicit controls or selected position apply.

## 14. UI changes and files

The existing **Koble og posisjoner bilder** dialog now offers **GMI – objektposisjon** alongside EXIF GPS and retained GML choices. It provides explicit bulk GMI proposals, shared-image/repeat context, referring-object details, unavailable-coordinate explanations, and placement-aware summaries. No broad layout redesign or extra workflow/dialog was introduced.

Production changes (15 files):

- `src/lib/photos/photoSession.mjs`, `gmiPhotoSource.mjs`, `photoPositioning.mjs`, `photoSpatial.mjs`.
- `src/components/photos/PhotoOccurrenceContext.js` (new), `PhotoPositioningWizard.js`, `PhotoGmiSummary.js`, `PhotoSpatialInspector.js`, `PhotoWorkspaceCollection.js`, `PhotoCollectionPanel.js`, `PhotoMapPopup.js`, `PhotoMarkersLayer.js`, `PhotoLayerCard.js`, `photoWorkspace.css`.
- `src/app/page.js` (inspector asset identity only).

Tests (eight files): new `gmiPhotoPlacements.test.mjs`, `gmiPhotoPlacementCorpus.test.mjs`, `gmiPhotoPlacementsUi.test.mjs`; updated `gmiPhotoAssociations.test.mjs`, `gmiPhotoAssociationsUi.test.mjs`, `photoSourceWorkflow.test.mjs`, `photoPositioningUi.test.mjs`, `photoDirectionUi.test.mjs`. The last adds an explicit workspace-mount wait after clicking Bildemodul, preventing its source helper from racing entry and trying to click that action twice. This report is the 24th changed/new file. No dependency/configuration or fixture changes.

## 15. Domain tests and requirement coverage

`gmiPhotoPlacements.test.mjs` adds **34 focused domain cases**. The corpus file adds two acceptance cases and the UI file adds one browser case: **37 new tests** in total.

| Requested coverage | Evidence |
| --- | --- |
| 1–5: point option, transform, missing CRS, line-only, mixed geometry | Point cases; three CRS comparisons; three unusable-CRS cases; line/mixed-reference cases. |
| 6–9: two/N occurrences, warning state, asset identity | Parameterized 1/2/3/7/20 points, real group reconciliation, repeat presentation/browser assertions. |
| 10–13: preview ownership and shared EXIF/GML without collapse | Single thumbnail/EXIF counters, strict shared object/File equality, EXIF/GML acceptance across surviving occurrences, browser URL audit/viewer. |
| 14–16: explicit apply, zero checkpoint-current writes, direction unchanged | Source-save null/identical current checks, marker counts before/after apply, accepted manual/default-keep test. |
| 17–21: occurrence/last/batch/reset/append lifecycle | Original-occurrence removal; last asset release; whole-asset/batch/layer/reset cases; append skip after original-ID removal; existing append suites. |
| 22–24: idempotent recheck, stale operations, revision identity | Three repeated rechecks, dismissed occurrence, same-byte reattachment, five stale-position cases, stale source checkpoint, repeated GUID revisions. |
| 25–28: many-to-many, seven images/object, real repeats, no geometry heuristic | Pinned real grammar case and corpus suites; line-only and malformed POINT coordinate-count tests. |
| 29–34: independent editing, keep current, markers/inspector/counts, one job/asset | Independent current/direction assertions, distinct map IDs, browser provenance/counts and shared URL, delayed shared evidence after original occurrence removal, job counters. |

Final domain/source/corpus/hyperlink/baseline comparison: **227 tests, 223 passed, four known baseline failures, zero skipped/cancelled**. Additional table/app-info/release regressions: **24/24 passed**. All new domain/corpus cases pass. Existing source workflow, GMI association, position/CRS, import/append, manual, direction, preview, reset/lifecycle and hyperlink regressions pass.

## 16. Browser acceptance

**All 12 distinct production browser cases pass after the focused correction/recheck.** The final full selection passed 11/12; the direction test raced workspace entry during setup, before its direction assertions. An explicit workspace-mount wait fixes that test setup. Its complete real 148-photo case then passed 1/1 on the same final production build. Both the original full-run result and successful targeted rerun are retained in `gmi-correction-browser-final.tap` and `gmi-correction-direction-final.tap`. There is no remaining failed browser case; this is not a claim that the earlier 12-case invocation exited zero.

The new product-control test covers A–M: upload; open central workflow; stage GMI; cancel before checkpoint; retain associations/occurrences with zero markers; see GMI alongside EXIF; apply GMI; multiple markers; repeat warning; distinct exact object provenance with the same original image URL; manual move and direction independent per occurrence; close/reopen; keep-current default; idempotent recheck; one/last occurrence removal and resource cleanup. It also checks 1366×768 and 1024×620 content bounds.

The existing browser selection covers real G01/G04 source files/photos, 148-photo Ekenesstokken GML/EXIF/import/append, popup/selection/lightbox, direction, manual placement, reset/removal and dialog layouts. An ordinary-photo empty provenance wrapper found during validation was removed, preserving existing inspector candidate counts/layouts.

The initial sandbox attempt timed out enabling Chrome Runtime. The existing harness succeeds with reviewed local browser access and isolated temporary profiles. A concurrent multi-suite run exposed image-import timing contention; sequential runs are used for final acceptance. No unrelated browser infrastructure was changed. One old association assertion was updated to permit GMI evidence while still asserting unchanged shared evidence/current/direction/File resources. The mixed-source browser assertion now uses placement wording when repeated occurrences are present.

## 17. Real-corpus acceptance

Fixtures were read in place and never edited. The new acceptance traverses the actual sources, derives matches from delivered filenames/relative paths, creates lightweight in-memory asset identities without decoding/copying fixture image bytes, saves through checkpoint A, reconciles every occurrence against source object evidence, explicitly applies eligible GMI positions, and rechecks without multiplication. Existing corpus/browser suites additionally exercise actual delivered File data, EXIF and images.

| Result | `C:\temp\gmi examples` | Ekenesstokken |
| --- | ---: | ---: |
| GMI sources | 12 | 1 |
| Owner-scoped imported asset identities | 391 | 148 |
| Matched GMI point placements | 302 | 0 |
| Assets with distinct-object repeated references | 2 | 0 |
| Repeated point groups / placements in those groups | 2 / 4 | 0 / 0 |
| Line-only repeat groups | 0 | 0 |
| Unusable CRS/geometry among matched point placements | 0 | 0 |
| Unmatched / ambiguous / invalid references | 0 / 0 / 1 | 53 / 0 / 0 |
| File hashes checked unchanged | 585 | 150 |

The 391 identities are summed per GMI owner/delivery directory, including revision deliveries; they are not a claim of 391 distinct physical JPEGs. All repeat groups reconcile exactly with source-scoped object/asset edges. Four repeated placements mean two placements per shared asset, adding two occurrences relative to one per asset.

An additional source-level audit, including unmatched references, verified all 13 GMI files declare EPSG:25832. All 249 source-scoped objects carrying valid image references are POINT objects with usable single-coordinate source geometry; zero are LINE and zero have unusable coordinates. Synthetic tests supply the missing/unsupported-CRS, malformed POINT and LINE cases absent from these delivered references.

Both discovered repeat groups are in `20260903/1200 Asbuild VA Leveranse Lerkeveien.gmi`:

- `101d5fa875f346637177fa67f0bac8.jpg`: GUIDs `52fe0ed8-d4d6-4a00-b1e7-9e026e827ca9` and `e70f78d8-c484-4e72-ae28-74d72fae248d`; both POINT.
- `2026-02-20-14-34-36_f1ea8a41a3e3fb77de80703e30920e_KG1._.jpg`: GUIDs `b82604fa-abdb-40e2-acec-017788834274` and `cf6a001b-89ce-43a8-9450-bfbb97ada492`; both POINT.

Existing corpus invariants still pass: 1,386 objects; 303 references, 302 confident and one invalid directory target; 271 relative-path/31 basename matches; two source revisions with the seven-photo object; 95 repeated-GUID groups across sources, including two with changed geometry. None of those GUID groups is globally merged into an occurrence.

Ekenesstokken's supplied GMI has 53 references unmatched to its 148 delivered photos; no matching or positions are fabricated. Its real GML still matches/positions all 148 photos, and actual EXIF evidence remains available. Missing delivered attachments are fixture diagnostics, not permission to guess file identities.

Before/after SHA-256 manifests and source-derived findings are retained outside git in `%TEMP%\gmi-placement-correction\{corpus,Ekenesstokken}-{before,after,findings}.json`.

## 18. Build, lint and diff

**Production build passed, exit 0:** `npm.cmd run build -- --webpack` on the final production source, including placement-count copy. Compilation, TypeScript checks, static page generation and route generation completed. This follows the previously validated Webpack path. The existing Browserslist age warning is unrelated. No package or build configuration was changed.

**Touched-file ESLint passed, exit 0**, including every changed/new JavaScript/module/test file and the final direction-test mount wait. **`git diff --check` passed**; new/untracked files were also checked separately for trailing whitespace. HEAD remains `3cf7ef1`, with 24 local changed/new files and no commit/push.

Logs outside git: `%TEMP%\gmi-correction-validation-final.tap`, `gmi-correction-extra-regression.tap`, `gmi-correction-focused-final.tap`, `gmi-correction-browser-final.tap`, `gmi-correction-direction-final.tap`, `gmi-correction-build-final.log`, `gmi-correction-eslint-final.log`.

## 19. Known baseline failures

The unchanged four baseline source-contract failures are `appInfoUiContract.test.mjs:88` and `validationV2WorkspaceInspector.test.mjs:7`, `:34`, `:103`. They concern old sidebar/dock/MapView source patterns, were already documented in the Slice 1 report, and were not modified to accommodate this task.

The final domain comparison reports exactly those failures and no new failures. This is not a repository-wide clean-test/lint claim. The prior default Turbopack/Google Fonts issue remains outside scope; successful production verification uses Webpack.

## 20. Remaining issues and intentional limits

Session-only assets/sources require no persistence migration. Missing/unsupported CRS or malformed source points remain association-only position evidence until usable source data is supplied. Line positioning is intentionally unsupported. Coincident occurrences can overlap on the map; their collection identities and provenance remain separate. Source removal preserves historical accepted/occurrence state. Ekenesstokken's 53 unmatched references remain visible diagnostics.

No new implementation defect remains known from the completed domain, corpus, browser, production-build and touched-file lint checks. Final browser rerun details are recorded in section 16; the four baseline source-contract failures remain. A raw reference reused across separate source revisions remains source-scoped and is not globally merged by GUID.

## 21. Deferred Validator TODO

**Do not implement here:** later, the Validator section should warn when the same photo filename/reference is used by multiple distinct GMI objects. It should report filename/raw reference, repeat count, involved objects/GUIDs and source GMI, including references that have no imported photo asset.

`gmiPhotoSource.mjs` has an explicit TODO beside `gmiRepeatedPhotoReferences`, which currently supports confident asset-association presentation only. The retained `source.references`, raw members and `objectsByKey` provide the evidence for later validation independent of photo import/matching. No speculative validator API, Validator UI or validation policy was added.

## 22. Slice 2 was NOT implemented

No loaded-GMI-layer Add photos action, loaded-source byte registry, map-layer/source fingerprint binding, GMI-context folder picker, GMI-derived FOTO creation/target selection or photo-to-GMI navigation was added. Survey/Validator APIs and UI, exports, dependencies and persistence remain outside this correction.

No commit, push or sub-agent/background/delegated agent was used. The work remains local and reviewable on `feature/photo-workspace`; HEAD stays `3cf7ef1`.
