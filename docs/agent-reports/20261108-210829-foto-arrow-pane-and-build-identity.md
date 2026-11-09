# FOTO direction-arrow pane and build identity in the info dialog

Date: 2026-11-08, Europe/Oslo. Branch `feature/photo-workspace`, HEAD `cfa84ca`. **Nothing was committed or pushed.** This follows `20261108-202553-foto-visual-acceptance-follow-up.md` §4 (Option A approved) and §2 (show the running commit).

Norwegian text in `«…»` is UI copy. The two parts touch disjoint files (§6) and can be reviewed separately.

---

## 1. Summary

| Part | Result |
|---|---|
| A. Arrows behind every photo | Every direction arrow is now its own non-interactive Leaflet marker in a new pane, `photo-directions` (z 615). That pane sits under the photo-marker pane (620) and the edit pane (640). No arrow can paint over any photo, including the selected or edited photo's own arrow. **No exception for the edit target** (§3) |
| A. Editing | The edit target's arrow lives in the same lower pane. It follows a drag live and returns on Escape. It follows knob, numeric, undo, redo, Save and Discard changes through the same edit state as its photo. While the knob turns, only the knob's live arrow shows, as before |
| B. Build identity | The info dialog header shows `Versjon: <7-char SHA>` and `Miljø: Produksjon / Preview / Lokal utvikling`. Vercel's `VERCEL_GIT_COMMIT_SHA` and `VERCEL_ENV` are inlined at build time. No request is made and nothing else is exposed |

| Gate | Result |
|---|---|
| Browser, all 25 suites (24 earlier ones plus the new `photoDirectionLayerUi`), 148-photo corpus included | Clean rerun: **145 tests, 144 pass, 0 fail, 1 skip** (the known G01/G04 fixture skip). All corpus browser tests ran and passed (§7.1) |
| Non-browser, 152 files | 1,718 tests: 1,706 pass, 5 skip, **7 fail: exactly the established baseline** at the same files and lines |
| `next build`, direct ESLint, `git diff --check` | Clean. One ESLint error in `tests/photoDirection.test.mjs:59` already exists at HEAD, on a line I did not touch |

---

## 2. Part A: architecture

### Why a separate pane

Leaflet gives each marker icon its own stacking context, through its `translate3d` transform and inline `z-index`. An arrow inside a photo's `divIcon` could therefore only ever sit under its own photo. A Leaflet pane is also a stacking context, with an absolute position and a `z-index`. Everything in pane 615 paints below everything in pane 620, whatever the per-marker z-indices are.

### Pane order (`src/lib/photos/photoMapPanes.mjs`)

| Pane | z | Holds |
|---|---|---|
| Leaflet `markerPane` | 600 | GMI survey markers (unchanged) |
| **`photo-directions`** (new) | **615** | Every photo direction arrow, ordinary and edit target. `pointer-events: none` |
| `photo-markers` | 620 | Every ordinary photo marker and thumbnail (unchanged) |
| `photo-placement` | 640 | The edit target photo, the rotation knob and connectors (unchanged) |
| Leaflet tooltips, popups | 650, 700 | Unchanged |

Arrows stay above survey markers, as they were before. No other layer moved.

### Rendering

- **Presentation** (`photoMarkerPresentation.mjs`):
  - `cameraMarkerOptions` and `thumbnailMarkerOptions` no longer draw an arrow.
  - The new `photoDirectionMarkerOptions(mode, …)` wraps the unchanged `photoDirectionArrow` SVG in a zero-size `divIcon` (`iconSize`/`iconAnchor` `[0,0]`). CSS centres the SVG on the anchor with `left:0; top:0; translate(-50%,-50%)`. The arrow therefore turns about exactly the point its photo is centred on.
  - `photoDirectionIconKey` is the cache key. Unknown direction returns `null`, so no arrow is drawn.
- **Geometry is untouched.** The SVG is byte-identical to before, and a unit test asserts this. That covers the 8 px (camera) and 10 px (thumbnail) tip gap, the box-aware reach for diagonals and corners, the ring and sibling allowances, the white casing, the staged dash and 80 % opacity. The drop shadows are the same as before: 1 px, or 2 px for a selected camera.
- **Ordinary arrows** (`PhotoMarkersLayer.js`):
  - The existing per-render marker model now also carries a `directionIcon`. It comes from the same occurrence, mode, selection and sibling state as the photo.
  - One memoised `PhotoDirectionMarker` per model, keyed by the occurrence's `feature.id`, with `interactive={false}` and `keyboard={false}`.
  - Hidden photos, unplaced photos and photos with unknown direction produce no model or no icon, so there is nothing to orphan.
  - Repeated references to one original are separate occurrences, so each has its own arrow.
  - The arrow also gets its photo's `zIndexOffset`, so among arrows the selected one is on top.
- **Attribute names.** Arrow elements carry `data-direction-photo-id`, `-layer-id`, `-mode` and `-edit-target`. They never carry `data-photo-id` or `data-edit-target`. The arrow pane comes before the photo pane in the DOM, so reusing those names would have made every existing `.leaflet-marker-icon[data-photo-id=…]` selector find the arrow first.
- **Icon cache** (`photoMarkerIcons.js`): arrow icons have their own cache. Photo icon keys no longer include direction. As a result, turning a photo replaces only its arrow icon and never the photo icon. Before, every direction change re-rendered the thumbnail.

---

## 3. Part A: editing

The edit target is drawn by `PhotoEditLayer`'s `EditableMarker` in pane 640, as before. Its arrow is a `PhotoDirectionMarker` in the **lower** pane, rendered by the same component from the same `photo` prop. So it is under neighbouring photos like every other arrow. `PhotoMarkersLayer` already drops the edit target from its models (`hiddenPhotoId`), so there are never two arrows for one photo. The browser test asserts exactly one arrow per photo in every state.

| Action | How the arrow follows |
|---|---|
| Drag | The existing Leaflet `drag` handler, which already moves the knob and the connector, also calls `arrowRef.setLatLng(event.latlng)`. No new event lifecycle and no separate edit transaction |
| Escape mid-drag | The existing cancel path restores the photo and calls `arrowRef.setLatLng(start)` |
| Drag end, or a gesture that stages nothing | The existing reset effect (`if (!frozen) setLatLng(position)`) now resets the arrow as well. The arrow can never stay where the drag left it, or at the old saved spot |
| Knob rotation | Unchanged rule: while rotating, the knob draws the live heading and the photo's arrow is hidden (`.photo-edit-rotating … .photo-direction-marker-editing { visibility: hidden }`). On release the staged heading is shown, dashed |
| Numeric entry, arrow keys, undo, redo, Save, Discard, «Fortsett redigering» | All change `photo.direction` or `photo.spatial` in the edit state, so the arrow re-renders from props. Nothing extra was needed |
| «Flytt med klikk» | The arrow dims with its photo (`opacity: .55`) and follows the staged position |

**Consequence to know about:** in a dense cluster the edit target's arrow can be fully hidden under a neighbour, as in the corpus screenshot. The rotation knob's teal guide and handle in pane 640 still show the heading, and the knob is the editing control. I judged this to be what "all arrows behind all photographs" asks for, so I made no exception. If you want the edit target's arrow above everything, it is a one-line pane change for that one marker.

---

## 4. Screenshots

### Synthetic fixture (in the repo)

These are in `docs/agent-reports/assets/20261108-foto-arrow-layer/`. The fixture is six solid-colour photos 1 m apart at zoom 21, each with a different GML heading. `a` is just south of `b`, so Leaflet stacks `a` above `b`, and `a` points east into `b`.

| File | Shows |
|---|---|
| `zoom-compare.png` | Four crops. **Top left:** new, thumbnails, `a` selected; every arrow is under its neighbours. **Top right:** the negative control, the same view with the arrow pane lifted above the photos (the old behaviour); arrows paint over neighbours. **Bottom left:** Edit mode; only the knob guide is above the photos. **Bottom right:** camera markers |
| `arrow-layer-01-markers-cluster.png` | Camera markers, the full map |
| `arrow-layer-02-thumbnails-cluster-selected.png` | Dense thumbnail cluster, selected photo |
| `arrow-layer-02b-control-arrows-above.png` | Control, arrows above (for comparison only) |
| `arrow-layer-03-edit-target-cluster.png` | Edit mode in the cluster |
| `arrow-layer-04-edit-dragging.png` | Mid-drag: the arrow travels with the photo, `«Flyttes ca. 3,3 m»` |
| `arrow-layer-05-edit-staged-direction.png` | Staged 225°, dashed |
| `arrow-layer-06-saved.png` | After Save. The hover preview is open because the cursor ended over the photo |
| `info-dialog-preview.png`, `info-dialog-local.png` | Part B: the dialog header on a simulated Vercel preview build, and on a local build |

### Private corpus (local only, not in the repo)

These are in `C:\Users\furr_\AppData\Local\Temp\claude\48e85b8705b14ab6\f15f05c2-e8c1-473e-b3c4-ffcc2fbb03f0\scratchpad\shots148\`. Each view of the densest corpus cluster was captured with HEAD (`head-*`) and with this change (`new-*`): thumbnails at z18, z19 and z20, Edit mode, and Edit mode with markers.

`compare-corpus.png` puts HEAD on the left and the new build on the right. In HEAD, the north arrows of the cluster paint over the thumbnails above them. In the new build they are under them.

---

## 5. Performance, 148-photo corpus

The HEAD build ran in a temporary worktree, and the new build was the gate build. Both used the same script and machine, with two full runs each. Each figure is the median of repeated operations: 5 mode switches each way, 8 zoom steps and 10 selections. Main-thread time comes from CDP `Performance.getMetrics` `TaskDuration`.

| Measure | HEAD | New |
|---|---|---|
| Photo-pane DOM nodes (markers mode) | 1,492 | 752 + 888 = 1,640 (+148 arrow `div`s, +10 %) |
| Switch to Miniatyrer, main-thread ms | 58 / 52 | 63 / 56 |
| Switch to Markører, ms | 50 / 55 | 47 / 49 |
| One zoom step in thumbnails, ms (wall time ≈ 750 ms, unchanged) | 118 / 117 | 160 / 148 |
| Select a photo, ms | 22 / 22 | 28 / 35 |

- **Mode switching:** no measurable change.
- **Zoom:** about +35 ms of main-thread work per zoom step, mostly style recalculation for 148 more positioned markers. It is spread over the 750 ms zoom animation, and wall time did not change.
- **Selection:** about +6–12 ms, because the selected arrow's icon changes to its selected geometry.
- **Turning a photo** is now cheaper, because the photo icon is no longer replaced. I did not time this separately.
- Heap readings were noisy (16–35 MB) and showed no trend.
- All 148 corpus photos have a direction, so this is the worst case for the arrow count.

---

## 6. Changed files

### Part A: arrow pane

| File | Change |
|---|---|
| `src/lib/photos/photoMapPanes.mjs` | `PHOTO_DIRECTION_PANE` and `PHOTO_DIRECTION_Z_INDEX = 615` |
| `src/lib/photos/photoMarkerPresentation.mjs` | Arrow removed from the photo icon options and key. New `photoDirectionMarkerOptions` and `photoDirectionIconKey` |
| `src/components/photos/photoMarkerIcons.js` | `photoDirectionIcon` with its own cache. Shared cache helper |
| `src/components/photos/PhotoMarkersLayer.js` | Lower pane. Exported `PhotoDirectionMarker`. `directionIcon` in the model |
| `src/components/photos/PhotoEditLayer.js` | The edit target's arrow, wired into drag, Escape and reset |
| `src/app/globals.css` | Arrow marker rules (zero-size, centred, shadow, no pointer events). The old in-icon rule is gone |
| `src/components/photos/photoWorkspace.css` | Old in-thumbnail arrow rule removed |
| `src/components/photos/photoEdit.css` | Rotation-hide and click-move dim now target the arrow pane |
| `tests/helpers/photoWorkspace.mjs` | `DIRECTION_PANE`, `arrowOf(markerExpr)` and `editArrow`: an arrow found by its photo marker |
| `tests/photoDirectionLayerUi.test.mjs` | **New** browser suite (§7.2) |
| `tests/photoMarkerPresentation.test.mjs`, `tests/photoDirection.test.mjs` | Assertions moved from the photo icon to the arrow options. Added: 0/45/90/135/180/225° heading geometry, 8 px past the selection ring, the sibling allowance, the zero-size anchor, class names, the cache key, and pane order |
| `tests/photoWorkspaceEditUi.test.mjs`, `photoDirectionUi`, `photoMarkerProvenanceUi`, `gmiPhotoPlacementsUi`, `gmiPhotoAssociationsUi` | Selector migration (§7.3) |

### Part B: build identity

| File | Change |
|---|---|
| `next.config.mjs` | `env: { GMI_BUILD_COMMIT_SHA: VERCEL_GIT_COMMIT_SHA \|\| '', GMI_BUILD_ENV: VERCEL_ENV \|\| '' }` |
| `src/lib/buildInfo.mjs` | **New.** `describeBuild` and `BUILD_INFO` |
| `src/components/AppInfoModal.js` | `BuildIdentity` in the header, after the `v1.2.0` pill |
| `tests/buildInfo.test.mjs` | **New** (§8) |

**Untouched:** `src/lib/photos/export/`, `photoSession`, `photoEditSession`, `photoAutoMetadata`, `photoPositioning.mjs`, `photoPositionSources`, `photoCaptureMetadata`, `photoDirection.mjs`, `photoSpatial`, `gmiPhotoSource`, `loadedGmiSource`, `store.js` and `page.js`. `git diff` names none of them. Coordinate transformations, accepted directions, GML/EXIF priority, the export data and the provenance colours are therefore unchanged. Their suites pass, including the export goldens and the corpus export.

---

## 7. Tests

### 7.1 Browser gate

```
npx next build && npx next start -p 3110
PHOTO_UI_URL=http://localhost:3110 PHOTO_GML_FIXTURE='C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml' \
  node --test --test-concurrency=1 <25 files that read PHOTO_UI_URL>
```

- **First run: 141 tests, 138 pass, 1 skip** (the known G01/G04 fixture skip), **2 fail**.
  - Both failures were caused by me. Partway through the run I ran `git stash` for about two seconds, to check whether a lint error already existed at HEAD. The tracked test files and helper reverted for that window.
  - `photoDirectionLayerUi` failed to import (123 ms).
  - `photoDirectionUi` ran its HEAD version, which looks for the arrow inside the marker.
  - Rerun on their own, both pass. `photoDirectionUi` passed three times in a row.
- **Clean rerun of all 25 suites, with nothing else touched: 145 tests, 144 pass, 0 fail, 1 skip.** The count rose from 141 because the new suite now counts its 4 subtests; on the first run it failed at import.
- All corpus browser tests ran.

### 7.2 New suite: `tests/photoDirectionLayerUi.test.mjs`

It is opt-in through `PHOTO_UI_URL`, and saves screenshots when `PHOTO_SCREENSHOT_DIR` is set. In every state checked, it asserts these invariants:

- The panes are in the order surveys < arrows < photos < edit.
- No `.photo-direction-indicator` exists outside the arrow pane.
- No arrow is interactive or focusable.
- There is exactly one arrow per photo with a direction, with no orphans and no duplicates.
- Each arrow is within 0.6 px of its photo icon's centre.
- Each arrow's mode matches its photo's mode.
- Each arrow has its expected heading.

**Pixel proof.** `a`'s east arrowhead crosses `b`'s thumbnail.

- A screenshot strip there must contain only `b`'s photo colours, never navy or the white casing.
- The strip lies just off the axis. That keeps it clear of `a`'s 4 px selection ring and of the knob's 1.5 px guide.
- **Negative control:** with the arrow pane lifted to z 630, the same check must fail. It does, which shows the check can detect the old behaviour.

| Subtest | Covers (task list) |
|---|---|
| Ordinary viewing | 1, 2 (0, 45, 90, 135, 180 and 270° in the fixture), 3, 4, 5. Zoom in and out. A hovered thumbnail comes to the front, and hit testing reaches the photo, never an arrow |
| Edit mode | 6, 7: one edit arrow and no ordinary `a`. Pixel proof under `b` while editing. Mid-drag the arrow is within 1 px of the dragged photo. Escape restores both. A real drag stages, with the arrow on the new spot. While the knob turns the arrow is hidden and the knob head is drawn; on release the arrow shows ≈200°, staged. Numeric 225. 8: undo ×3 back to the original heading and position, and redo ×3. «Tilbake til appen» then «Fortsett redigering» keeps the state |
| Discard and Save | 8: Discard returns `a` to its saved position, an ordinary arrow and solid. Then Save at 300°: solid, at the new position. Then markers mode |
| Main map and removal | 9: the arrows follow onto the main map, and removing the layer leaves 0 markers and 0 arrows |

10 (repeated references) is covered in `gmiPhotoPlacementsUi`. Two placements of one original keep independent directions (0° and 75°). Each is now checked through its own arrow in the arrow pane, found by its own marker.

### 7.3 Selector migration

About 20 selectors read `.photo-direction-indicator` inside a marker icon. They now use `arrowOf(<the same marker expression>)`, which finds that marker's arrow by photo and layer id, or the edit arrow for the edit target. **Every behavioural assertion is unchanged:** heading, staged flag, stroke colour, the anchor geometry check in `photoDirectionUi`, and the count in the markers fallback.

Two assertions became stricter:

- After the zoom-out fallback there must be exactly 2 arrows in the pane, with marker geometry.
- The thumbnail arrows must use thumbnail geometry.

The reload check now also requires that no arrow marker remains.

### 7.4 Non-browser

`PHOTO_GML_FIXTURE=<same> node --test <152 files>` gives 1,718 tests: 1,706 pass, 5 skip and 7 fail. The 7 are the baseline at the same lines: `appInfoUiContract` :90, `statsUiContract` :8 and :129, `terrainPhotoGml` :12, and `validationV2WorkspaceInspector` :7, :34 and :103. The +4 tests over the previous 1,714 are the new build-info tests.

### 7.5 Lint and whitespace

Direct ESLint on all 18 changed `.js`/`.mjs` files: clean, apart from the error at `tests/photoDirection.test.mjs:59` (`no-assign-module-variable`), which is identical at HEAD. `git diff --check`: clean.

---

## 8. Part B: build identity

- **Mechanism.**
  - Vercel sets `VERCEL_GIT_COMMIT_SHA` and `VERCEL_ENV` during every Git deployment build.
  - `next.config.mjs` copies only those two into `env`. Next.js inlines them where `buildInfo.mjs` reads `process.env.GMI_BUILD_COMMIT_SHA` and `process.env.GMI_BUILD_ENV` literally.
  - No runtime request, no API route and no secret are involved. Both values are public facts about the build.
- **Display.**
  - The info dialog header, visible on every tab, shows: `GMI Validator  [v1.2.0]  Versjon: cfa84ca   Miljø: Preview`.
  - It is set in 11 px muted text, as a `<dl>`. The full SHA is in the `title`.
  - Environments: `production` → `Produksjon`, `preview` → `Preview`, and anything else (no metadata, or `vercel dev`) → `Lokal utvikling`.
  - Without a valid hex SHA (7–40 characters), the `Versjon` row is left out. Local builds therefore show only `Miljø: Lokal utvikling`.
- **Verification.**
  - The local production bundle contains `«Lokal utvikling»` and no raw `process.env.GMI_BUILD_*` reference, so the values were inlined.
  - Simulated Vercel build: `VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD) VERCEL_ENV=preview next build`. The client chunk then contains the full SHA and `"preview"`. The rendered dialog reads **`Versjon: cfa84ca  Miljø: Preview`**, with the full SHA as the tooltip (`assets/20261108-foto-arrow-layer/info-dialog-preview.png`).
  - A plain local build contains no SHA and renders `Miljø: Lokal utvikling` (`info-dialog-local.png`).
  - I rebuilt `.next` plainly afterwards.
- **Tests** (`tests/buildInfo.test.mjs`, 4 tests):
  - The short SHA and both environments.
  - Two SHAs give two values.
  - Every local fallback, including `development` and the prototype key `toString`.
  - Rejection of non-hex, short, overlong and non-string SHAs.
  - `next.config` maps exactly the two variables, and gives empty values without them.
  - `BUILD_INFO` reads the inlined values.
  - The dialog header renders `<BuildIdentity />`.
  - No hard-coded SHA and no `fetch` in the module or the dialog.
- **The existing info dialog is unchanged:** tabs, focus handling, layout and the `v1.2.0` pill. `appInfoUiContract` keeps only its baseline failure at :90.

---

## 9. Remaining limitations

1. **Dense clusters can hide arrows completely.** With 44 px thumbnails about 1 m apart, most arrows end under neighbours. That follows directly from "all arrows behind all photos" (see `zoom-compare.png` and the corpus crops). Hovering brings a thumbnail to the front, but not its arrow. Markører mode, or zooming in, shows them.
2. **The edit target's arrow can also be hidden** under a neighbour (§3). The knob still shows the heading.
3. **Arrows among themselves.** The selected arrow is above other arrows, and otherwise Leaflet's latitude order applies. One arrow can cross another arrow, but never a photo.
4. **Cost.** There are +148 marker `div`s, and about +35 ms of main-thread work per zoom step at 148 photos (§5). I did not measure larger layers. A single SVG overlay (Option B) would scale better if that ever matters.
5. **Leftover directory.** The temporary HEAD worktree used for §5 is unregistered from Git, but Windows kept a lock on part of its folder in my scratchpad. It is outside the repository.

## 10. Manual acceptance checklist

1. Open a FOTO layer and choose Miniatyrer. Zoom to a cluster where thumbnails overlap. No arrow is drawn on top of any thumbnail, including the selected one's arrow.
2. Choose Markører. The same holds for camera markers. Arrows still emerge from behind their own photo, at diagonals too.
3. `Juster plassering og retning`, then drag a photo slowly. Its arrow moves with it, and nothing stays at the old spot. Press Escape mid-drag: both return.
4. Turn the knob. Only the knob's arrow shows while turning. Release: a dashed arrow at the new heading. Type a heading in `Retning`. Use undo and redo.
5. `Forkast endringer`: the arrow returns, solid. Change again, then `Lagre endringer`: a solid arrow at the new place.
6. With unsaved changes, `Tilbake til appen` then `Fortsett redigering`: nothing changes, and there is one arrow.
7. Remove the FOTO layer: no arrows remain.
8. Open `Om appen` on two Vercel deployments of different commits. `Versjon` differs and `Miljø` says `Preview` or `Produksjon`. A local `npm run dev` shows `Miljø: Lokal utvikling`.

No commits or pushes were made. Stopping for review.
