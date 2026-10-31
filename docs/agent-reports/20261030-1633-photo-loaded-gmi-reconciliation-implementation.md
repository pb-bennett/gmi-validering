# Loaded-GMI photo-folder import and reconciliation

Date: 2026-10-30, Europe/Oslo. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`. Starting HEAD: **`1eba6af3cd9b2085048e5cbee78b50525aa4dc10` — Document current photo workflow state**.

## Preflight and result

Verified repository root, branch, exact required HEAD and clean worktree before changes. Read the current-state audit and the relevant unified-source, GMI placement-correction and defaults/marker-order reports, then inspected current upload, store, layer, photo domain and UI code. The actual starting checkout includes workspace-wide WFS, unlike the older executable boundary recorded in the audit. No agents, model change, commit or push were used.

**Implemented:** ordinary loaded GMI layer → Legg til bilder → folder/files → reference reconciliation → create/append FOTO and source associations → existing explicit positioning review → FOTO workspace. The GMI file is never requested again in this path. Ordinary independent Bilder import remains available.

No photo export, metadata date/photographer editor, source heading adoption, persistence, arbitrary object picker, clustering, Validator duplicate-reference rule, topology, 3D or WFS behavior change was added.

## Architecture and loaded-source identity

The new `src/lib/photos/loadedGmiSource.mjs` is a session-only source-input registry. Original browser Files and parser-derived evidence stay outside Zustand and its persistence. Each registration has an opaque input ID, the initiating survey layer ID, the application's dataset revision and the exact in-memory dataset identity. Filename is display metadata, not identity.

The real survey upload path now reads GMI bytes through the existing production decoder. It uses the same `GMIParser` instance for ordinary survey parsing and `createGmiPhotoSource()` evidence capture, before any operational/user-assumed CRS substitution. This preserves original raw geometry, declared CRS, lexical S_HYPERLINK fields and source-scoped object identity. KOF's existing text path remains; SOSI continues receiving bytes.

`addLayer` accepts a transient `sourceInput` argument, registers it before publishing the new layer, and constructs its ordinary persisted layer exactly as before without that argument. No original File, parser instance or source-input registry enters the survey store. Tests verify the input field is absent from stored layers.

The photo source factory is shared with the existing independently selected GMI-source adapter. The loaded-source action hashes the captured original File on demand, using the existing SHA-256/exact-byte fallback and 10 MiB photo-source limit. It does not parse the GMI a second time. Registry-issued tickets authenticate reads; exact input/dataset ownership is checked before and after async completion. Same filename/GUID/geometry is insufficient to substitute another source.

The registry subscribes narrowly to changes of the survey `layers` object. Removal, dataset replacement or reset drops unavailable inputs and invalidates an unconfirmed loaded import. Display/visibility changes that preserve the dataset do not invalidate the binding. Source Files are immutable browser inputs; registering replacement bytes creates a new input identity. Dataset revisions follow the application's existing object-lifetime revision convention.

Session-restored or programmatically constructed survey metadata without a captured original input cannot silently reconstruct one. Its GMI photo action is disabled with an explanation to reload the source into this session. This is consistent with the milestone's absence of cross-reload persistence.

## Entry and selection behavior

`LayerPanel` renders **Legg til bilder** only for ordinary GMI survey types. Explicit FOTO, WMS, external/reference types, SOSI, KOF and unknown layers do not receive it. Page callbacks are threaded through the existing Sidebar/LayerManager path; there is no new independent panel or event bus.

The existing `PhotoCollectionDialog` has a loaded-source mode. It identifies the loaded GMI, allows a new or existing FOTO target, and adds **Velg leveransemappe** using a browser directory input (`webkitdirectory`/`directory`, multiple Files). `webkitRelativePath` is retained by the existing asset model. Normal multi-file selection/drop remains the fallback. The review states how many eligible assets have relative paths and explains that files selected without a folder supply filename evidence only.

The importer never reads arbitrary disk paths. Directory selection supplies ordinary browser Files. Existing non-image rejection, thumbnail/EXIF scheduling, curation, optional GML input and filename-collision skip/override behavior are reused. A canceled browser picker adds nothing; canceling the modal releases its draft and pending resources.

Relative paths are visible in selected-image facts and thumbnail filename tooltips. No general filesystem browser, path rewriting or manual association editor was added.

## Reconciliation and terminology

`reviewLoadedGmiImport()` uses `reviewGmiPhotoSource()` and the existing resolver/ledger. New-layer scope is the selected eligible assets. Append scope explicitly includes the target's existing assets plus eligible incoming assets; skipped duplicate Files do not compete as new matching candidates.

Matching remains collision-checked relative path/suffix, then defensible unique basename, with existing case/NFC behavior. Remote/traversal/unsafe references remain diagnostic; they are not fetched. Multiple eligible matches remain unresolved. Previously confirmed endpoints remain stable during append/recheck.

`PhotoGmiReconciliation` presents:

| Category | Meaning/count unit |
| --- | --- |
| Koblet (referanser) | Confident reference occurrences resolved to one eligible asset. Several references may belong to one asset. |
| Gjentatt referanse | Number of matched images used by more than one distinct GMI object, not number of duplicated Files. Existing repeated-source details retain all object/reference evidence. |
| Uavklart | Ambiguous reference occurrences. Candidate relative paths/names can be inspected; none is selected automatically. |
| Ikke funnet i valgte bilder | No match in the chosen import/target scope. This makes no claim about files elsewhere on disk. Unsafe references are also excluded from matching, with their unsafe reason visible in source details. |
| Ikke referert i GMI | Eligible new images with no possible reference match. Existing target images are not removed by this decision. |
| Ugyldig referanse | Existing parser/target validity diagnostics, such as unsupported attachment targets. |

The review reuses `PhotoGmiSummary` for full raw reference/object/repeat diagnostics. Source details now also explain unsafe-reference exclusion and live/detached loaded-source status.

**Ta med bilder som ikke er referert i GMI** defaults to checked. Unchecking excludes only eligible new assets with no possible reference endpoint. Ambiguous candidate images remain in the unresolved category, preventing exclusion from turning two ambiguous copies into an invented confident match. The UI shows the resulting incoming asset count. Unreferenced included assets receive no invented GMI edge; EXIF/GML/manual positioning remain available later.

This is intentionally a compact review, not an ambiguity-resolution or database-management screen.

## Atomic source checkpoint and repeated occurrences

The canonical implementation remains `photoSession.mjs`. Its loaded-import draft contains a private source operation/liveness callback and public metadata only. Reviews are session-issued objects authenticated in a private WeakMap. Apply checks the exact operation, live source binding, target identity/membership/source set, incoming membership, duplicate-eligibility set and optional GML review before writing.

The existing occurrence construction was extracted into shared `planGmiAssociations()`/`commitGmiPlan()` helpers, used by both the old source workflow and the new loaded-import checkpoint. This avoids a second association or placement model. Planning constructs the complete source/member/occurrence update before commit; optional GML candidate construction is preflighted first. Ownership transfer, retained source/ledger, POINT evidence and occurrences publish once. Invalid/stale review writes no retained source, FOTO layer, candidate subset or new occurrence.

Source confirmation creates **zero accepted current positions**. An imported asset already owns one draft File and thumbnail job; ownership transfers into the FOTO layer. Distinct referring POINT objects create distinct occurrences of that asset, with exact source/object/reference provenance and independent current/direction state. Coincident POINT coordinates remain distinct placements. LINE references create association edges only and infer no point or bearing. Repeated members on one object retain lexical evidence without multiplying its object/asset edge.

One original image referenced by two points and a line therefore has one asset, one preview/EXIF job pair, two spatial occurrences, two point candidates and three association edges. The last occurrence removal releases the original/thumbnail; removing the first occurrence leaves sibling resources and source evidence intact.

## Create, append and recheck

The target selector offers **Nytt FOTO-lag** and current FOTO layers. New creation uses the same private asset/record/layer maps. Append preserves all target assets, occurrence IDs, accepted/manual positions and direction.

The established filename/case/NFC append policy remains authoritative: incoming target-name collisions are skipped by default; per-photo override imports a distinct asset. Skipped originals/jobs are released, while the target's existing asset participates in reconciliation. This does not equate filenames with content identity or silently merge two separately imported originals.

An attached source with the same exact-byte fingerprint is rechecked using its retained source/reference IDs and confirmed endpoints. Newly available assets can resolve formerly unmatched references, while existing edges and occurrence keys remain stable. Repeated append/recheck does not multiply associations/occurrences. An append with no new eligible assets may still confirm/recheck the selected source against the target; it does not create a second source with the same fingerprint. Optional GML remains candidate-only and shared at asset scope across repeated occurrences.

## Position checkpoint and workspace handoff

After successful source confirmation, Home enters the resulting FOTO workspace and opens the existing `PhotoPositioningWizard` at **Posisjoner**, with the saved-source notice. Native dialog handoff occurs directly on the confirmation action; no second GMI selection or custom position dialog is involved. The wizard initializes its session-issued position plan on its native modal-open event.

The unchanged rules remain: placed occurrences default to keep current; a unique occurrence-specific usable GMI point may be proposed; other usable GML/EXIF options remain available; source arrival never accepts coordinates; final mixed position apply is explicit and atomic. Closing the position review retains the already-confirmed assets/links and leaves unaccepted positions unchanged. Manual placement, direction and original/lightbox inspection remain in the existing workspace.

## Lifecycle and loaded-layer removal

Before confirmation, source removal/replacement, changed input registration, full reset, target deletion/membership change, canceled/replaced import, altered eligible incoming set or a forged/old plan cannot commit. Removing a live initiating survey releases the draft and shows an unavailable-source explanation; late source reads, thumbnail or EXIF completion cannot recreate it. Changing target discards the displayed review and requires a fresh one.

After confirmation, removing/replacing the survey marks retained `source.loadedBinding.live` false and releases the survey-input registry entry. **Original photo resources, association ledger, occurrence provenance, candidates, accepted positions and direction remain.** Retained source details show that the original live GMI layer is no longer available. No later layer with the same display name is automatically bound. An explicit subsequent import/recheck of exact source bytes can establish its own new live binding.

This preserves the established distinction between live survey ownership and historical retained photo-source evidence. Removing a retained source through the existing source controls still follows the existing semantics; this milestone does not delete accepted photo coordinates as a side effect of survey removal.

## WFS and ordinary hyperlink isolation

No Gemini WFS production file, map pane constant, current-map getter, popup/hover handler or automatic coverage predicate was changed. Photos remain in the dedicated photo session, outside ordinary survey `layers`/`layerOrder`. The new source registry observes survey ownership but issues no service requests and does not bind the WFS map getter.

Actual-store tests connect workspace-wide WFS, perform loaded-GMI photo import, manual position/direction, append and visibility changes, and assert the original two synthetic requests remain the only requests. The production-app test connects through the actual WFS form/client with synthetic transport, then verifies the photo workflow and ordinary Bilder import do not add requests. FOTO remains excluded from automatic coverage.

The final WFS browser suites exercise reference coverage, panes, source visibility, photo and survey popups, hover/tool ownership, manual photo/direction suppression, zoom intent/current viewport binding, disconnect and reset. Existing S_HYPERLINK Data Table/map popup extraction and copy code was not redesigned; its focused extraction/popup/hover regressions pass.

## Files changed

Production:

- `src/components/FileUpload.js`: shared-byte decoding/evidence capture from the original parser.
- `src/lib/store.js`: transient source-input registration and source-lifecycle binding, without new persisted fields.
- New `src/lib/photos/loadedGmiSource.mjs`: exact session input/tickets/revision/liveness registry.
- `src/lib/photos/gmiPhotoSource.mjs`: shared evidence factory and fingerprint helper; matching semantics unchanged.
- `src/lib/photos/photoSession.mjs`: loaded draft/review/atomic confirmation, detach status and shared occurrence preflight.
- `src/app/page.js`, `Sidebar.js`, `LayerManager.js`, `LayerPanel.js`: GMI-only action, importer context, FOTO/position handoff.
- `src/components/photos/PhotoCollectionDialog.js`: directory/fallback selection, target/review/apply stages.
- New `PhotoGmiReconciliation.js` and additive `photoCollectionPanel.css`: compact reference/category review.
- `PhotoCollectionPanel.js`: relative-path facts/tooltips.
- `PhotoGmiSummary.js`: unsafe-reference and loaded-source status presentation.
- `PhotoPositioningWizard.js`: direct saved-source position-review entry using its existing plan/apply path.

Tests:

- New `tests/photoLoadedGmi.test.mjs`: **21 cases**, actual parser/factory and injected photo jobs. Covers identity, same-name replacement/bytes, paths/case/NFC, unique basename and ambiguity, unsafe/missing/unreferenced cases, include/exclude, POINT/LINE/repeats, atomicity, GML preflight, current/direction, skip/override/recheck, source/target/cancel/reset and late work/resource ownership.
- New `tests/photoLoadedGmiStore.test.mjs`: **3 cases** through actual survey/photo/WFS singletons, input non-persistence, visibility/revision/reset lifecycle and no WFS request side effects.
- New `tests/photoLoadedGmiUi.test.mjs`: **8 counted tests** (parent plus seven subtests), actual production app and generated source/images. No private corpus or hidden session mutation establishes product state. Simulates browser File selection with delivery-relative paths; checks directory-input attributes and real upload/action/form/confirmation controls.

Documentation: this report and an appended dated continuation in the existing current-state audit. Historical implementation reports remain unchanged. Package manifests/lockfile are unchanged.

## Validation: exact final results

Final disjoint selections, counting Node nested subtests:

| Selection | Files | Tests | Pass | Fail | Skip | Cancelled / todo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Photo/domain, actual store, shared map/layer/hyperlink and WFS source/session contracts, including synthetic Terrain browser parser integration | 38 | 364 | 361 | 0 | 3 | 0 / 0 |
| Production-app synthetic photo browser selection | 6 | 15 | 13 | 0 | 2 | 0 / 0 |
| WFS map/workflow/popup browser selection | 3 | 51 | 51 | 0 | 0 | 0 / 0 |
| **Total** | **47** | **430** | **425** | **0** | **5** | **0 / 0** |

The three domain skips are external GMI corpus tests (one association corpus, two placement corpus roots). The two app-browser skips are private G01/G04 and 148-photo acceptance. No expected private environment was configured or guessed. Ekenesstokken counts are not renewed claims on this HEAD.

The domain selection is reproducible with:

```powershell
$auditTests = @(Get-ChildItem tests -File | Where-Object {
  $_.Name -match '^(photo|gmiPhoto|terrainPhotoGml|exifGps|hyperlinkFilenames|layerPresentation|layerOrder|layerHighlight|mapPaneToolbar|mapBackgroundControl|featurePopupContent|featureHoverTooltip|geminiExtent|geminiSession|geminiStoreLifecycle|geminiReferencePresentation|geminiWorkflowUi).*\.test\.mjs$' -and
  ($_.Name -notmatch 'Ui\.test\.mjs$' -or $_.Name -eq 'geminiWorkflowUi.test.mjs') -and
  $_.Name -ne 'photoDialogLayout.test.mjs'
} | ForEach-Object { $_.FullName })
node --test --test-concurrency=1 @auditTests
```

Browser commands:

```powershell
$env:PHOTO_UI_URL = 'http://127.0.0.1:3100'
node --test --test-concurrency=1 tests/photoLoadedGmiUi.test.mjs tests/photoDialogLayout.test.mjs tests/photoDirectionUi.test.mjs tests/photoPositioningUi.test.mjs tests/gmiPhotoAssociationsUi.test.mjs tests/gmiPhotoPlacementsUi.test.mjs
node --test --test-concurrency=1 tests/geminiReferenceBrowser.test.mjs tests/geminiWorkflowBrowser.test.mjs tests/geminiPopupBrowser.test.mjs
```

App tests used the fresh production build on a local temporary acceptance server. New-path review/selection/append/ordinary import all passed; existing synthetic GMI association, repeated placement, direction, unified mixed sources and import-layout cases passed. The actual browser Terrain test passed seven internal synthetic XML/EXIF/session checks. Existing real-only manual/workspace/spatial/append browser suites remain opt-in; manual/lightbox/resource/source behavior also receives the synthetic direction/repeated-placement and domain coverage, without claiming a fresh private-corpus run.

Synthetic screenshots were captured to `%TEMP%\photo-loaded-gmi-acceptance` and visually inspected at **1920×1080** and **1280×720**. Summary, paths/ambiguity disclosure, inclusion checkbox, independent inspector scrolling and footer actions fit. The image fixture is a generated tiny PNG, not a customer photo. Screenshots are not committed.

### Build, lint and diff

- `npm.cmd run build -- --webpack`: **passed, exit 0**, final source; Next 16.1.6, static pages/routes generated. Existing Browserslist-age notice remains.
- The initial installation lacked the already-declared `@xmldom/xmldom`. Restored the **existing lockfile** with `npm ci --ignore-scripts --no-audit --no-fund --prefer-offline ...`; no dependency version or manifest/lockfile edit. An intermediate run during dependency restoration had module-resolution errors and was not treated as code-regression evidence. Final tests ran after the locked tree was restored.
- Focused ESLint evaluated **all 17 changed/new JS/MJS files**. **Zero new findings against HEAD.** Raw whole-file ESLint retains **four pre-existing `react-hooks/rules-of-hooks` errors in LayerPanel.js and one existing exhaustive-deps warning in FileUpload.js**. The comparison matched rule/severity/full message multiplicities against `git show HEAD:<file>` using the same ESLint configuration; no rule was disabled and no unrelated lint debt was repaired. This is a passing no-new-findings check, **not a claim of clean raw whole-file ESLint**.
- `git diff --check`: passed. New/untracked text files were separately checked for whitespace. Final worktree contains only the milestone's production files, three tests and two report changes. No package, private fixture, telemetry data or WFS production file change.

### Intermediate failures and reruns

During development, corrected a test fixture's Unicode encoding and a new browser test's selector quoting/thumbnail readiness wait. These were test setup issues, not weakened assertions. The final tests retain the intended case/NFC, shared-thumbnail and real-control checks.

The first combined WFS browser run had **51 tests: 48 pass, 3 fail, 0 skip**. Popup reopening immediately after the drag scenario timed out, followed by a dependent request-count failure and the failed parent. Without WFS code/test changes, the popup suite reran **16/16**, then the entire final WFS selection reran **51/51**. Both failed and successful logs are retained; no product regression is inferred from a timeout that did not reproduce. Final totals above count only the final disjoint invocations.

Logs outside git:

- `%TEMP%\photo-loaded-domain-final.log`
- `%TEMP%\photo-loaded-browser-final.log`
- `%TEMP%\photo-loaded-wfs-browser-final.log`
- `%TEMP%\photo-loaded-wfs-browser.log` and `photo-loaded-wfs-popup-rerun.log` (earlier run/rerun)
- `%TEMP%\photo-loaded-build-final.log`
- `%TEMP%\photo-loaded-lint-final.log` and `photo-loaded-lint-check.cjs`
- `%TEMP%\photo-loaded-locked-install.log`

## Remaining limits and recommended next milestone

This closes the missing loaded-GMI/folder entry and explicit bidirectional delivery review. Ambiguity remains unresolved rather than manually editable; filename-based append collisions still need an explicit per-file override when legitimate different files share a name. Folder capability depends on the browser; fallback files lose directory evidence, honestly disclosed. Assets outside the chosen import/target namespace are unknown. Binding is session-only, and an input restored from survey metadata alone is unavailable. The existing photo-source adapter size limit still applies.

Exact-overlap map interaction, source-removal/history semantics and general metadata/export limitations remain. Ordinary photos can be imported, manually positioned, given manual direction and inspected without any loaded GMI. No new delivery schema or export-readiness claim is made.

**Recommended next milestone: accepted photo metadata for capture date and photographer.** Add a small canonical metadata/provenance model, explicit per-photo and batch setters, validation and EXIF/source-date evidence distinctions while retaining asset-versus-occurrence semantics. This supplies useful delivery information before a separate export/schema/attachment-packaging milestone. Keep output format selection, ZIP/GML export, source-heading adoption, persistence, WFS-object association and the Validator duplicate-reference warning deferred.

## Closeout

Implementation, synthetic acceptance, focused regression, production build and reports are complete. No commit/push, sub-agents, private-corpus access or WFS behavior change. Raw pre-existing whole-file ESLint debt is explicitly recorded rather than fixed or hidden.
