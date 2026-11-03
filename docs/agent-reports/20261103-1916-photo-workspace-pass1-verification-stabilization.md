# FOTO workspace Pass 1 — verification and targeted stabilization

Date: 2026-11-03, Europe/Oslo. Branch: `feature/photo-workspace`. HEAD remains `4707f22`.

Continues `20261103-1845-photo-workspace-edit-mode-overhaul-implementation.md`, especially §8. The existing unstaged implementation was preserved. Nothing was committed, staged, pushed or deployed.

**Decision: Pass 1 is ready for a test-branch deployment.** The four outstanding corpus suites now pass against a fresh production build. The confirmed production Leaflet teardown exception is fixed, with a browser regression that fails before the fix. Remaining repository failures were reproduced on untouched HEAD and are listed below; this is not a claim that the repository's entire test/lint baseline is green.

## 1. Environment and preservation

- Installed Next.js: 16.1.6; installed Leaflet: 1.9.4; installed Chrome through the existing CDP harness, headless with GPU disabled.
- Production build commands: `npm.cmd run build`, initially served with `node node_modules/next/dist/bin/next start -p 3100`. The final rebuilt app was started afresh on port **3102**. No development server was used for acceptance.
- Corpus configuration:

  ```powershell
  $env:PHOTO_UI_URL='http://localhost:3102'
  $env:PHOTO_GML_FIXTURE='C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml'
  ```

- The suites confirmed **148 JPEGs** in the sibling `Attachments` directory. SHA-256 inventories of the wider Ekenesstokken directory contained **197 files before and after, with zero path/hash differences**. No private fixture was modified or copied into the repository.
- Original tracked diff and status, raw logs, performance data and scratch probes are outside Git at `C:\Users\furr_\AppData\Local\Temp\gmi-pass1-verification\`.
- HEAD comparison used `git archive` into that temporary directory and the same installed dependencies. Its temporary Next config required `turbopack: { root: 'C:/' }` to resolve the dependency junction. That adjustment did not touch the working tree.

## 2. Final production browser results

Exact final command, with the configuration above:

```powershell
node --test --test-concurrency=1 tests/photoWorkspaceUi.test.mjs tests/photoSpatialUi.test.mjs tests/photoPositioningUi.test.mjs tests/photoAppendDuplicatesUi.test.mjs tests/mapTeardownUi.test.mjs
```

**6 tests passed, 0 failed, 0 skipped; 158.1 seconds.** Raw log: `four-final.log`.

| Case | Final result | Duration |
|---|---|---:|
| `photoWorkspaceUi` | Pass, including its unchanged runtime-exception assertion, append/remove, preview resources, layouts, final-layer deletion and reload | 42.6 s |
| `photoSpatialUi` | Pass, including 148 markers, source switching, locate/visibility, GMI/SOSI/KOF coexistence, reset and reload | 30.7 s |
| `photoPositioningUi`, synthetic | Pass, including manual-current preservation, source review, repeated occurrence and metadata checks | 2.8 s |
| `photoPositioningUi`, real 148 | Pass; GML/EXIF evidence stays candidate-only until explicit acceptance | 15.8 s |
| `photoAppendDuplicatesUi` | Pass; six-only append, cancel, zero-new block, explicit override and original identity/thumbnail preservation | 63.7 s |
| New `mapTeardownUi` | Pass; actual zoom/deletion controls, final layer removed during animation, then a new map mounted | 2.1 s |

Also ran:

```powershell
node --test --test-concurrency=1 tests/photoSpatialUi.test.mjs tests/photoWorkspaceEditUi.test.mjs tests/photoWorkspaceUi.test.mjs
```

The production **Edit suite passed all 21 reported tests, including 20 nested acceptance checks**, in 17.2 s. It covers staging, drag/rotation, keyboard direction, click versus pan, independent occurrences, undo/redo, Escape, boundaries, save/discard, thumbnails, stack cycling and laptop layout. That earlier combined run still had two thumbnail-wait failures in the corpus suites; those were subsequently diagnosed and resolved in the test helper, and both corpus suites passed in the final command above. Raw log: `photo-final.log`.

## 3. Confirmed Leaflet bug and narrowly scoped fix

The initial production `photoWorkspaceUi` run passed, so the original exception was intermittent. A controlled probe then deleted the final FOTO layer immediately after a real animated zoom began. It reproduced this stack on **both** the current production build and the isolated **HEAD production build**:

```text
TypeError: Cannot read properties of undefined (reading '_leaflet_pos')
  _getMapPanePos → _getNewPixelOrigin → _move → _onZoomTransitionEnd
```

Both probes recorded `unloaded: true` and `animatingAtUnload: true`. This establishes a **pre-existing production race**, not a Pass 1 regression or a development StrictMode-only problem.

Leaflet 1.9.4 schedules a 250 ms fallback for `_onZoomTransitionEnd()`. `remove()` deletes `_mapPane` without clearing `_animatingZoom` or cancelling that fallback. The late callback then tries to calculate a pixel origin against the removed pane.

Added `MapLifecycleGuard`, mounted inside the shared `MapContainer`. It marks the zoom animation finished on `unload` and effect cleanup. It changes no live-map zoom behavior, marker behavior or export logic. This deliberately small workaround depends on Leaflet's private `_animatingZoom` flag and should be revisited when upgrading Leaflet.

The new permanent `tests/mapTeardownUi.test.mjs` uses the actual zoom and layer-deletion controls, verifies deletion occurs during animation, remounts a map, and asserts **zero runtime exceptions**. It **failed against the pre-fix production build with the exact stack above** and passed after rebuilding. No exception assertion was removed, filtered or weakened.

Relevant commands/logs:

```powershell
# Scratch production/HEAD comparison; PHOTO_UI_URL was 3100, then 3101:
node $env:TEMP\gmi-pass1-verification\teardown.mjs
# Permanent regression, first against pre-fix 3100, then rebuilt 3102:
node --test tests/mapTeardownUi.test.mjs
```

Logs: `teardown-current-before.log`, `teardown-baseline.log`, `teardown-regression-red.log`, `teardown-regression-green.log`.

## 4. Thumbnail timeout investigation

The first four-suite production run returned **3 pass / 2 fail**: append and real positioning passed; synthetic positioning had an outdated default-selection assertion; spatial timed out during its second 148-file import. Workspace completed without exceptions. The append suite itself passed in **53.2 s**, including repeated 148-file selections, without increasing any timeout.

A subsequent production run reproduced spatial's second-import timeout, and workspace also encountered a later import timeout. The problem therefore cannot honestly be described as development-server-only.

Instrumented the exact spatial flow with wrappers around `HTMLImageElement.decode()` and `HTMLCanvasElement.toBlob()`, plus visibility tracking:

- First 148-photo thumbnail wait: **13.699 s**.
- During the slow second import, JPEG decoding still completed in roughly **20–50 ms**.
- Canvas callbacks instead took approximately **1,023–1,040 ms per photo**, steadily progressing rather than deadlocking. The document remained `visible`.
- Starting a `requestAnimationFrame` loop in that same live browser brought subsequent canvas callbacks down to roughly **20–45 ms**; about 100 queued photos completed in eight seconds. The second wait completed in **53.140 s**, inside its original 60 s deadline, after the diagnostic intervention.
- A simpler HEAD double-import comparison was fast (13.187 s initially; 12.391 s on the second import). It did **not** reproduce the exact slow spatial sequence and is not claimed as proof that the whole sequence is equally fast at HEAD.

The evidence identifies **headless canvas idle-encoding scheduling** as the immediate bottleneck. It does not establish an application throughput regression. No thumbnail production code, queue, concurrency, image quality or zoom threshold was changed.

`waitForThumbnails()` now supplies rendering frames only while waiting, then cancels the frame request in `finally`. It still requires actual pending work to reach zero within **the same 60 seconds**. This is a test-environment stabilization, not a retry or a replacement of real decoding with mocks. The final four-suite command then passed, including all repeated imports.

The investigation used bounded suite deadlines and a bounded instrumented run; no automatic retry loop or increased timeout was added. Logs: `four-production.log`, `photo-final.log`, `spatial-diagnostic.log`, `baseline-thumbnails.log`.

## 5. Test migration corrections

These corrections retain intentional Pass 1 behavior rather than changing production behavior to satisfy old tests:

- **Synthetic positioning:** the removed inspector shortcut supplied `focusedPhotoId`, which restricted default proposals. The layer-wide Tools entry intentionally reviews the entire layer. The unplaced second `a.png` occurrence therefore has one GMI proposal. The test now verifies exactly that occurrence is proposed and manually placed `c.png` remains `keep`, rather than asserting zero proposals. No positioning implementation was changed. The focused rerun passed in 2.5 s and the final combined run passed too.
- **Spatial reset:** creating the replacement layer opens the FOTO workspace. The normal layer card is consequently absent. The test now asserts the new workspace contains exactly one occurrence, then retains the hard-reload checks.
- **Gemini fixture setup:** two browser entry files still invoked removed `beginManualPlacement` / `applyManualPlacement` APIs. Their equivalent setup now uses `beginPhotoEdits` / `applyPhotoEdits` with the same photo and coordinates.
- **Gemini inspection ownership:** migrated the browser test and source assertion from separate placement/direction props to `photoEdit`. The browser still verifies popup closure, no inspection popup during Edit mode, placement owning the click exactly once, restored inspection afterward and no additional WFS requests.

## 6. Gemini and repository regressions

Exact WFS selection:

```powershell
node --test --test-concurrency=1 tests/geminiReferenceBrowser.test.mjs tests/geminiWorkflowBrowser.test.mjs tests/geminiPopupBrowser.test.mjs tests/geminiReferencePresentation.test.mjs
```

**64 passed, 0 failed, 0 skipped; 38.3 s.** Actual React/Leaflet components with synthetic WFS responses; no live-service acceptance or credentialed network requests were performed. Covers reference layers/sidebar, retrieval/refresh/disconnect, measurement and Edit-mode ownership, hover/popups, visibility, source removal/reset, credential isolation and shared map behavior. Log: `gemini-final.log`.

Full initial repository run:

```powershell
$env:PHOTO_UI_URL=$null
$env:PHOTO_GML_FIXTURE=$null
$tests=Get-ChildItem tests -File -Filter *.test.mjs | ForEach-Object FullName
node --test --test-concurrency=1 $tests
```

**1,320 reported tests: 1,288 pass, 11 fail, 21 skip; 131.8 s.** This ran the repository, not only the photo selection. The skipped opt-in app-browser/private-corpus cases are separate from the production cases above. Four failures were the missed Gemini migrations, fixed and rerun successfully. The other seven were independently reproduced at HEAD as described below. Log: `full-regression.log`.

Final domain/source regression selection, avoiding another run of already completed browser suites:

```powershell
$env:PHOTO_UI_URL=$null
$env:PHOTO_GML_FIXTURE=$null
$tests=Get-ChildItem tests -File -Filter *.test.mjs |
  Where-Object { $_.Name -notmatch 'Ui|Browser' -and $_.Name -ne 'terrainPhotoGml.test.mjs' } |
  ForEach-Object FullName
node --test --test-concurrency=1 $tests
```

**1,224 tests: 1,216 pass, 3 fail, 5 skip; 35.9 s.** The three failures are the HEAD-baseline `validationV2WorkspaceInspector` source contracts. There were no new domain failures. This selection includes photo/GMI, export/compatibility and WFS domain regressions; counts are not additive with the other selections. Log: `domain-final.log`.

### Independently confirmed baseline failures

Ran this exact command from the isolated HEAD checkout:

```powershell
node --test --test-concurrency=1 tests/appInfoUiContract.test.mjs tests/statsUiContract.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/terrainPhotoGml.test.mjs
```

**23 tests: 16 pass, 7 fail.** The same seven cases fail in the working tree:

- `statsUiContract`: the two already documented failures.
- `appInfoUiContract`: one old source regex expects the pre-FOTO sidebar branch.
- `validationV2WorkspaceInspector`: three old source regexes expect the pre-FOTO sidebar/bottom-dock/MapView markup.
- `terrainPhotoGml`: its standalone browser module fails to load (`Failed to fetch dynamically imported module`). It fails at HEAD too, before its checks execute. This standalone parser/File harness remains unverified in this environment; the real corpus production app suites above did execute.

These unrelated baseline contracts and the baseline module-loading problem were not rewritten or suppressed. Log: `baseline-source-regression.log`.

## 7. 148-photo thumbnail density and performance

Command, against the production app with the same corpus configuration:

```powershell
node $env:TEMP\gmi-pass1-verification\density.mjs
```

At 1680×900, sampled 60 animation frames at each zoom with thumbnail display selected. All 148 records remained rendered; zoom 15 correctly fell back to camera markers with the zoom-16 explanatory note.

| Zoom | Thumbnail icons | Icons intersecting viewport | Overlapping icon-bound pairs* | Frame median / p95 / max | Long tasks |
|---:|---:|---:|---:|---|---:|
| 15 | 0 (148 regular markers) | 148 | 2,420 | 16.7 / 16.7 / 16.8 ms | 0 |
| 16 | 148 | 148 | 1,684 | 16.7 / 16.7 / 16.8 ms | 0 |
| 18 | 148 | 111 | 277 | 16.7 / 16.8 / 16.8 ms | 0 |

*Bounding rectangles include transparent icon/arrow space; these counts are a density indicator, not counts of hidden photos or clipped thumbnail pixels.*

- Initial thumbnail generation: **13.630 s**. All 148 canvas callbacks completed; maximum callback latency **88.5 ms** in this clean run.
- Drag and rotation with 24 pointer steps each: **1.176 s** including interaction/settling; **zero long tasks**. No runtime exceptions.
- Sampled JS heap grew approximately 22.0 → 24.2 → 25.9 MB across the zoom samples; this is not a leak measurement.
- **Retained `PHOTO_THUMBNAIL_MIN_ZOOM = 16`.** Rendering was responsive; zoom 16 is visually dense as expected. No clustering, fan-out or architecture change was introduced. These headless measurements do not substitute for human usability checks or measurements on low-end hardware.

Raw data: `density.json`; log: `density.log`.

## 8. Additional browser checks

- **Other FOTO layers, production build:** imported two layers through the UI. Two contextual markers became non-interactive and non-focusable during Edit mode; a pointer click neither changed the active occurrence nor opened a popup. Leaving Edit mode restored keyboard focus and the normal popup. Zero runtime exceptions. Command: `node $env:TEMP\gmi-pass1-verification\other-layers.mjs`; log: `other-layers.log`.
- **Conflict dialog, actual page in a test-only browser harness:** staged directions on two occurrences, then used the public `fillMissingPhotoValues` API to simulate an external accepted value on one. Save wrote neither staged value; Continue had default focus; Escape preserved edits; retrying with “Lagre de øvrige 1” committed only the non-stale occurrence and preserved the external value.
- **Session-ended toast, same harness:** superseding the edit session and publishing a layer change ended editing and displayed `Redigeringen ble avsluttet fordi fotolaget ble endret.` Zero runtime exceptions. Command: `node $env:TEMP\gmi-pass1-verification\boundaries.mjs`; log: `boundaries-final.log`.

The conflict/session-end harness mounts the real `page.js`, components and singleton session, exposing the public session only in a temporary entry point. It is not the optimized Next production bundle and adds no production route, hook or window global to the app.

## 9. Final build, lint and scope gates

- `npm.cmd run build`: **passed initially and after the only production-source fix**. Final compilation 21.2 s, all static pages generated. A pre-existing stale Browserslist-data warning remains. Log: `build-final.log`.
- `npm.cmd run lint`: fails because the existing script is `next lint`, unsupported by installed Next 16 (`Invalid project directory ...\lint`). Package files were not changed.
- Direct ESLint on all changed/new `.js`/`.mjs` source files:

  ```powershell
  $files=@(git diff --name-only --diff-filter=ACM -- src | Where-Object { $_ -match '\.(js|mjs)$' })
  $files+=@(git ls-files --others --exclude-standard -- src | Where-Object { $_ -match '\.(js|mjs)$' })
  node node_modules/eslint/bin/eslint.js --format json $files
  ```

  **Only MapInner: 8 errors and 4 warnings. All other 31 files: zero findings.** Directly linting HEAD's MapInner produced the same 8 errors / 4 warnings. The new lifecycle guard has no findings. Logs: `lint-final.json`, `lint-baseline.json`.
- `git diff --check`: **passed** after stabilization. Index remains empty; branch and HEAD unchanged.
- No diff in Gemini implementation/compatibility files, photo export serializers/plan/package/dialog, `package.json` or lockfile. Existing implementation changes outside the listed stabilization files were preserved.
- No export wizard, Fullfør opplysninger workflow, EXIF comparison or reverse geocoding was implemented.

## 10. Files changed by this verification pass

Incremental changes relative to the supplied working tree, not the complete Pass 1 diff:

1. `src/components/MapLifecycleGuard.js` — new, narrowly scoped Leaflet teardown workaround.
2. `src/components/MapInner.js` — mount the guard; preserve the supplied workspace implementation.
3. `tests/mapTeardownUi.test.mjs` — new production browser regression.
4. `tests/helpers/photoImportWizard.mjs` — rendering frames during the existing bounded thumbnail wait.
5. `tests/photoPositioningUi.test.mjs` — assert the intentional layer-wide proposal and manual-current preservation.
6. `tests/photoSpatialUi.test.mjs` — assert the replacement layer in its workspace after reset.
7. `tests/browser/geminiReferenceApp.js` — migrate fixture setup to the edit API.
8. `tests/browser/geminiWorkflowApp.js` — same fixture migration.
9. `tests/geminiPopupBrowser.test.mjs` — verify ownership through the consolidated Edit props.
10. `tests/geminiReferencePresentation.test.mjs` — update the matching source contract.
11. This report.

## 11. Remaining limits and deployment recommendation

- The seven confirmed repository baseline failures, unsupported lint script and twelve baseline MapInner lint findings remain. This pass does not repair unrelated baseline problems.
- The five final-selection skips comprise three private-corpus cases, one optional contractor reference-folder comparator and one opt-in rendered dialog-layout case (the final selection intentionally had `PHOTO_UI_URL` unset). The configured 148-photo production acceptance cases did not skip, and their suites exercised responsive layouts.
- Human acceptance remains useful for zoom-16 density, a representative low-end laptop, touch/keyboard/screen-reader behavior, and final visual sign-off on the deployed test branch.
- The persistent invalid-placement/error toast was not forced through a natural production-browser failure path. Conflict handling and the external-session-ended toast were browser-checked as described above; invalid values remain covered by domain tests.
- Live authenticated Gemini WFS service acceptance was not repeated. The requested shared-component browser regression selection passed with synthetic service responses.
- The frame workaround addresses measured headless test scheduling. No claim is made that every device/browser will import 148 originals in the measured time.

**Ready for test-branch deployment with these baseline limitations documented.** The intended Pass 1 architecture is preserved, required production/browser verification is complete, and the only production fix addresses a confirmed pre-existing teardown race. Deployment itself was not performed.
