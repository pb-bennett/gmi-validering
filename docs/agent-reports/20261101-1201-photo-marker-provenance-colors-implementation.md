# Photo marker position provenance colors

Implementation date: 2026-11-01, Europe/Oslo. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`.

## Preflight and scope

- Confirmed repository root and branch before editing.
- Starting HEAD: `150b15552a1cf0e0accaebc7144b0302497e223f` — `Document photo UI control audit`.
- Starting worktree was clean. No applicable ancestor/root `AGENTS.md` was present.
- Reviewed the UI control audit, marker presentation and CSS, map feature projection, page/workspace/map wiring, ordinary legend, manual placement layer, and direction/selection tests.
- The UI control audit is unchanged. This milestone adds no buttons or filters and does not reorganize the surrounding photo UI.
- No sub-agents, commit, or push. HEAD remains unchanged.

## Architecture and accepted provenance

The public occurrence snapshot already contains everything needed. `photoMarkerPresentation.mjs` now owns:

- `photoPositionSourceKind(photo)`: derives the semantic source from the current accepted occurrence position.
- `photoPositionSourcePresentation(kind)`: resolves one central mapping containing key, Norwegian label, and color, including a neutral fallback.
- `PHOTO_POSITION_SOURCES`: the four supported legend entries.
- `photoCameraGlyph(...)`: the camera SVG shared by markers and legend swatches.

The actual model uses `{ kind: 'candidate', candidateId }` for accepted EXIF/GMI/GML positions and `{ kind: 'manual' }` for accepted manual positions. The classifier follows the exact accepted candidate ID in that occurrence's candidates. It does not choose a candidate by availability, preference, asset ID, or shared EXIF evidence. Direct recognized source kinds are also handled safely. Unrecognized or missing basis and dangling candidate references resolve to `unknown` / `Ukjent`, never to EXIF or manual.

The marker layer reads the current occurrence snapshot on render and selects a cached normal/selected icon for that semantic source. Selected directional icons use the same presentation API. No color state is stored. Source replacement immediately changes presentation. A provenance change also changes the React marker key because React Leaflet does not update initialized title/alt options when only the icon changes. This keeps the accessible source description current.

`buildPhotoMapFeatures` remains unchanged: only valid current positions on visible layers produce features; evidence alone produces none. Each occurrence retains its own feature identity, even when it shares the original file with another occurrence.

## Palette and selection

| Accepted source | Label | Fill |
|---|---|---|
| EXIF camera GPS | EXIF | `#19785b` |
| GMI photo/object placement | GMI | `#2463b5` |
| Imported photo GML | GML | `#7946b5` |
| Manual accepted placement/movement | Manuell | `#b06a08` |
| Unknown/internal fallback | Ukjent | `#64748b` |

These are restrained green/teal, blue, violet, and amber hues. They avoid the bright red/yellow/green status treatment and are presented as camera symbols with source text rather than Feil/Sjekk/Pass status indicators. The camera silhouette is unchanged. Every accepted camera uses its source fill with a white outer casing, dark `#172b3a` contour, and white lens. The two outlines provide separation on light and dark map backgrounds.

Selection uses a larger camera (22 instead of 16 SVG pixels), a dark ring with white casing, the existing selected shadow, and the existing z-index lift. It never substitutes a selected fill. The existing 30×30 hit target, centered anchor, keyboard events, focus styling, popup behavior, and occurrence-selection behavior remain. Hover has no replacement source fill.

Marker title/alt include `· plassering: EXIF/GMI/GML/Manuell/Ukjent` after the existing filename and repeated-occurrence context. The text supplies provenance independently of color.

## Proposal and direction boundaries

The orange manual proposal retains its existing crosshair/circle SVG and `photo-proposed-marker` class. It has no accepted-source classification and remains visually different from the filled amber camera. Proposals do not change accepted marker color. Cancel preserves the existing accepted source/color; explicit `Bruk plassering` changes it to Manual.

The selected accepted-direction arrow retains its independent blue `#075e9a` stroke and 5-pixel white casing; direction-edit proposals retain `#a34c00`. Its white casing remains readable beside all source fills, so no arrow styling change was necessary. Position provenance is not encoded in arrow color. Unknown direction still has no arrow; north remains an explicit accepted direction.

The existing direction browser test initially failed with a clipped connector endpoint because the accepted marker was off-screen. The same failure, including its endpoint error, was reproduced after temporarily restoring all changed existing production files from starting HEAD; the implementation files were then restored. The test now focuses the accepted marker and waits for layout before measuring connector endpoints. Leaflet's existing focus pan establishes the on-screen geometry precondition. No assertion was removed and no production map navigation behavior was changed. The complete direction browser test passes, including cardinal geometry, selected/proposal centers, connector endpoints, slider/keyboard editing, commits/cancellation, and lifecycle checks.

## Legend switching

`MapView` renders `PhotoPositionLegend` when its existing `photoWorkspaceSelection` prop is present, otherwise the existing dynamically loaded `MapLegend`. The page supplies that prop only for a live dedicated photo workspace layer. No additional workspace or legend state was added.

The compact informational section is headed `Bildeplassering`. It always shows the four supported text labels with the same camera glyph and source fills used by markers. It has no buttons, inputs, links, toggles, or click handlers. The ordinary survey legend implementation and its collapse state ownership are unchanged. Browser acceptance verifies normal survey mode, entry, three repeated exit/re-entry cycles, layer visibility, and reset without stale photo-legend state.

## Files changed

| File | Change |
|---|---|
| `src/lib/photos/photoMarkerPresentation.mjs` | Accepted-source classifier, central palette/fallback, shared source-colored camera glyph, selected ring |
| `src/components/photos/PhotoMarkersLayer.js` | Occurrence-derived source icons, current accessible labels, source-change remount |
| `src/components/photos/PhotoPositionLegend.js` | Four-entry informational camera legend |
| `src/components/MapView.js` | Conditional legend using existing workspace prop |
| `src/app/globals.css` | Remove obsolete normal/selected marker color overrides |
| `tests/photoMarkerPresentation.test.mjs` | Source/fallback/evidence, selection/direction/proposal, transitions, visibility, and legend contracts |
| `tests/gmiPhotoPlacements.test.mjs` | Real session shared-asset occurrences: GMI versus Manual, cancel, and explicit GMI replacement |
| `tests/photoMarkerProvenanceUi.test.mjs` | Synthetic full-app provenance and legend acceptance, both viewport sizes, deterministic contrast backdrops |
| `tests/photoDirectionUi.test.mjs` | Establish on-screen connector geometry precondition using existing marker focus pan |
| `tests/photoSpatialUi.test.mjs` | Parse filename separately from the enriched marker title |
| `tests/photoWorkspaceUi.test.mjs` | Parse filename separately from the enriched marker title |
| This report | Persistent implementation and validation record |

## Validation

Final, non-overlapping test groups (Node totals include parent tests and subtests):

| Group | Pass | Fail | Skip |
|---|---:|---:|---:|
| Focused presentation/domain/workspace/shared-map tests, 16 files | 165 | 0 | 0 |
| Full-app photo browser tests, 8 files | 21 | 0 | 4 |
| Shared React/Leaflet WFS browser regressions, 3 files | 51 | 0 | 0 |
| **Total** | **237** | **0** | **4** |

Focused command:

```powershell
node --test tests/photoMarkerPresentation.test.mjs tests/photoMapFeatures.test.mjs tests/photoManualPlacement.test.mjs tests/photoDirection.test.mjs tests/photoSpatial.test.mjs tests/photoSpatialProjection.test.mjs tests/photoWorkspace.test.mjs tests/photoWorkspaceUx.test.mjs tests/photoResetIntegration.test.mjs tests/gmiPhotoPlacements.test.mjs tests/geminiReferencePresentation.test.mjs tests/geminiSemanticPresentation.test.mjs tests/geminiPopupContent.test.mjs tests/geminiWorkflowUi.test.mjs tests/mapPaneToolbar.test.mjs tests/mapBackgroundControl.test.mjs
```

Photo browser command, against the actual app started with `npm run dev -- --hostname 127.0.0.1 --port 3000`:

```powershell
$env:PHOTO_UI_URL='http://127.0.0.1:3000'
$env:PHOTO_SCREENSHOT_DIR=Join-Path $env:TEMP 'photo-marker-provenance-20261101'
node --test --test-concurrency=1 tests/photoMarkerProvenanceUi.test.mjs tests/photoDirectionUi.test.mjs tests/gmiPhotoPlacementsUi.test.mjs tests/photoLoadedGmiUi.test.mjs tests/photoPositioningUi.test.mjs tests/photoWorkspaceUi.test.mjs tests/photoSpatialUi.test.mjs tests/photoManualPlacementUi.test.mjs
```

WFS browser command:

```powershell
node --test --test-concurrency=1 tests/geminiWorkflowBrowser.test.mjs tests/geminiReferenceBrowser.test.mjs tests/geminiPopupBrowser.test.mjs
```

The four skips require `PHOTO_GML_FIXTURE` and the private 148-photo corpus: the large-corpus positioning, spatial, workspace, and manual-placement tests. That fixture was deliberately not enabled. Generated fixtures cover manual proposals/commits/cancellation, all four sources, shared occurrences, visibility, workspace lifecycle, accepted direction, and source replacement in the passing browser runs. No private corpus was accessed.

Focused ESLint: **passed, 0 errors, 0 warnings**, on all 10 changed JavaScript/MJS production and test files:

```powershell
npx eslint src/lib/photos/photoMarkerPresentation.mjs src/components/photos/PhotoMarkersLayer.js src/components/photos/PhotoPositionLegend.js src/components/MapView.js tests/photoMarkerPresentation.test.mjs tests/photoMarkerProvenanceUi.test.mjs tests/gmiPhotoPlacements.test.mjs tests/photoDirectionUi.test.mjs tests/photoSpatialUi.test.mjs tests/photoWorkspaceUi.test.mjs
```

`npm run build`: **passed**, including compilation, TypeScript checks, and static page generation. The existing stale Browserslist database notice remains; no dependency update was attempted. `git diff --check`: **passed**. Git emits its existing LF-to-CRLF normalization notices, without whitespace errors.

## Rendered acceptance and evidence

Inspected the actual full-app photo workspace at **1920×1080** and **1280×720**, with generated PNG images and synthetic GMI/GML records. The four camera markers are simultaneously in view. One original has two independently positioned occurrences, one GMI and one Manual. The Manual occurrence is selected with an accepted north direction arrow. All four fills remain distinct; the selected ring remains obvious and the arrow stays readable. The legend is approximately 110×130 pixels and clears map controls at both sizes. Browser geometry assertions independently check its bounds, lack of overlaps, exact labels/fills, absence of controls, and all four markers being inside the map.

Screenshot directory, outside Git:

`C:\Users\furr_\AppData\Local\Temp\photo-marker-provenance-20261101`

Primary inspected screenshots:

- `photo-provenance-1920x1080.png`
- `photo-provenance-1280x720.png`
- `photo-provenance-dark-1920x1080.png`
- `photo-provenance-dark-1280x720.png`

Public tiles did not reliably render in the initial acceptance run. The new browser fixture therefore substitutes deterministic light cartographic-style and dark green/gray map tiles, with transparent external overlay tiles, entirely in the test browser. The dark captures wait for tile fading to settle. These are contrast and layout checks, not geographic or real aerial-imagery validation. Production basemap configuration is unchanged. The same directory also contains synthetic direction/layout screenshots generated by the existing regression harness.

Detailed execution logs remain outside Git in `%TEMP%`: `photo-marker-unit-final.txt`, `photo-marker-ui-final.txt`, `photo-marker-wfs-browser.txt`, `photo-marker-lint-final.txt`, and `photo-marker-build.txt`. The baseline direction failure is recorded in `photo-marker-direction-baseline.txt`.

## Boundaries and limitations

No data model, session ownership, persistence, matching, source ranking, acceptance policy, export serializer/package behavior, WFS requests/styling, or ordinary survey legend semantics changed. No filtering, clickable legend entries, new buttons, clustering, 3D support, source automation, or wider UI overhaul was introduced. Unknown sources are neutral and accessible as `Ukjent`; the normal legend intentionally lists only the four supported categories. Color is supplemented by interactive marker titles and textual legend labels; no claim of universal color-vision accessibility or exhaustive real aerial-background validation is made.
