# FOTO workspace Pass 1C — UI polish

Date: 2026-11-05, Europe/Oslo. Branch: `feature/photo-workspace`. Starting HEAD: `66fcaa7` (`Refine photo workspace and layer controls`). Read the Pass 1B acceptance report before editing. The sole initial working-tree entry, `docs/agent-reports/20261104-1823-photo-export-overhaul-planning.md`, was untracked and has been preserved. Nothing committed, pushed or deployed.

## Four changes

1. **Stable inspector width.** Added `scrollbar-gutter: stable` to `.photo-workspace-inspector`, the actual `overflow: auto` scrolling container. Kept overflow automatic, avoiding a forced scrollbar track. The inner inspector remains non-scrolling. The mobile layout, which uses page scrolling, resets the gutter. Existing image aspect-ratio, height limits, disclosures and preview controls are unchanged.
2. **Edit command bar.** Grouped mode/count, Undo/Redo, and Save/Discard into a clear first row. A separated second group holds movement and direction controls; shorter instructions follow in smaller muted text. Controls use consistent 32 px sizing, shared tokens and Phosphor Regular icons. Container queries shorten visible Save/Discard wording while preserving complete accessible names, reduce secondary control spacing, and permit deliberate wrapping on very narrow maps. Kept the overlay anchor and overlay-aware pan implementation. No reducer, transaction boundary, keyboard handler or gesture code changed.
3. **Thumbnail source badges.** Retained the 44 px size and existing EXIF/GMI/GML/manual border colours. Added an inset bottom-left 17 px white-backed badge: Camera (EXIF), Cube (GMI), FileCode (GML), Hand (manual), with Question for unknown sources. These are static Phosphor Regular SVG paths in the shared DOM-free marker presentation module; icon caching and session URL ownership remain unchanged. Badges have source descriptions such as `Plassering fra GML` and `Manuelt plassert`. Their position leaves the outer selection ring, top-right stack/staged badges, direction arrow, centre anchor and rotation knob clear. The workspace thumbnail legend uses the same glyphs. Ordinary camera-marker rendering is unchanged.
4. **Photo-first main-map popup.** Restyled the existing `PhotoMapPopup` and its Leaflet wrapper, with a 340 px target width, uncropped image, compact filename/source/direction/object context, same-position pager and full-width `Åpne i bildemodul`. A discreet icon closes it. Dimensions, photographer and technical occurrence identity are available through `Bildedetaljer`; accepted capture time remains visible when present. Retained `PhotoOccurrenceContext` to distinguish unique assets from repeated placements, and retained exact occurrence IDs for module navigation. Styles are scoped to the photo popup, including an explicit override of Leaflet paragraph margins. Width/scroll height follow the actual map size. Image loads, paging, disclosures and map resizes update Leaflet layout/autopan. Opening a photo popup cancels the hover tooltip, and hover previews stay suppressed until it closes.

## Files changed

Application:

- `src/components/photos/photoWorkspace.css`
- `src/components/photos/PhotoEditCommandBar.js`
- `src/components/photos/photoEdit.css`
- `src/components/photos/PhotoMapDisplayCard.js`
- `src/components/photos/PhotoMapPopup.js`
- `src/components/photos/PhotoMarkersLayer.js`
- `src/lib/photos/photoMarkerPresentation.mjs`

Tests:

- `tests/photoMarkerPresentation.test.mjs`
- `tests/photoMarkerProvenanceUi.test.mjs`
- `tests/photoWorkspaceStacksUi.test.mjs`
- `tests/photoManualPlacementUi.test.mjs` (close-control selector migration only)

Plus this report. Existing browser assertions were retained. The sized synthetic stack PNGs now also contain identical GPS evidence, allowing the real acceptance workflow to exercise all four stack provenance kinds without session injection.

## Verification

Browser checks use the existing headless Chrome/CDP harness against `next start -p 3110` after a production build. Corpus runs use the local Ekenesstokken 148-photo fixture. Screenshots are local QA artifacts outside Git: `%TEMP%/photo-pass1c-ui-polish`.

- **Inspector:** portrait and landscape, disclosures closed/open at heights 1200, 1080, 900, 768 and 720. Asserted identical preview x/width/height, `object-fit: contain`, and a real fitting-to-overflowing transition for each orientation.
- **Command bar:** 1920×1080, 1366×768, 1280×720 and 1024×620. All controls fit and pass centre-point hit tests; the selected photo remains reachable outside overlays. Button Undo/Redo and discard pass. Existing suites also cover Save, shortcuts, rotation, numeric direction, centre placement, click move through another marker and Escape cancellation.
- **Badges:** all four sources, selected/unselected, ordinary/stacked, staged, direction and Edit anchor cases in marker unit tests. Browser checks cover all four unstacked sources, shared renderer equivalence, retained direction/selection, and six-photo stacks for each source on both map surfaces, with no source/count overlap.
- **Popup:** portrait and landscape through all six stack members at 1920×1080, 1366×768, 1280×720 and 768×620; popup stays inside the map, details expand within its height budget, preview is wider than hover preview, and paragraph margins remain zero. Tests retain paging context and opening the displayed member. Added close/reopen/hover checks and both occurrences of a shared asset, checking repeated-placement information and exact module selection. Screenshots are visually reviewed in addition to geometry checks.

Results:

| Check | Result |
| --- | --- |
| Production build | Pass, final build compiled in 14.7 s |
| ESLint on all changed JS/MJS application files | Pass, no errors or warnings |
| Domain/source selection (all root tests except `Ui`, `Browser`, `terrainPhotoGml`) | 1,229 tests: 1,221 pass, 3 baseline failures, 5 skips |
| Gemini WFS reference/workflow/popup/presentation regression selection | 64/64 pass |
| Final photo/GMI browser selection (all 14 matching `*Ui.test.mjs` files, concurrency 2) | 64 tests: 63 pass, 1 private-corpus skip after the selector migration and isolated rerun described below |
| Final Gemini popup recheck | 16/16 pass |
| `git diff --check` | Clean; Git emits normal LF→CRLF working-copy notices |

The three domain failures are the documented `validationV2WorkspaceInspector` contracts: sidebar width, shell/dock layout, and 2D/3D map markup. Their inspected files (`Sidebar.js`, `page.js`, `MapView.js`) are unchanged from HEAD; these are baseline failures, not Pass 1C regressions. The build also reports the existing stale Browserslist dataset notice. No dependency files were changed.

The broad browser run initially reported 62 pass, 1 failure and 1 skip in 150.1 s. The failure was the manual-placement suite querying the removed native `.leaflet-popup-close-button`. Migrated that one interaction to the existing accessible-name click helper (`Lukk bildeforhåndsvisning`), retaining both Enter/Space reopen checks and all URL/transaction/ownership assertions. Its complete real-148-photo rerun passed in 30.0 s. No application changes were required. Earlier new-test issues (an encoded button label, restoring selection after a workspace round-trip, and allowing Leaflet's normal tooltip fade to finish) were corrected without removing assertions. Logs: `%TEMP%/photo-pass1c-browser-final.log`, `photo-pass1c-manual-final.log`, `photo-pass1c-domain.log`, `photo-pass1c-gemini.log`, and `photo-pass1c-gemini-popup-final.log`.

## Boundaries and unresolved items

No changes to import/positioning workflows, viewer navigation, Edit state/transaction logic, Gemini authentication/WFS integration, GMI selection, export serializers/packages/compatibility, capture-time conflict handling, evidence acceptance, `Fullfør opplysninger…`, or the export wizard. The popup layout callbacks only manage Leaflet presentation.

No known implementation issues. Live authenticated WFS and touch interactions were not separately exercised; WFS regressions use synthetic responses. The private G01/G04 association corpus is unavailable on this machine, as in Pass 1B.

## Manual browser acceptance checklist

- [ ] At 1366×768 and 1280×720, open real portrait/landscape construction photos. Expand and collapse metadata until scrolling appears; confirm preview width and horizontal position stay fixed.
- [ ] Stage position/direction changes for several photos. Check grouped actions, count, Undo/Redo, Save, Discard, keyboard shortcuts and the direction handle.
- [ ] On a crowded stack, use `Flytt med klikk`, cancel with Escape, then move through another marker. Confirm the selected image stays clear of the bar.
- [ ] Check source badges against light/dark and busy photographs for EXIF/GMI/GML/manual, including stacks and selected thumbnails. Confirm source/count/direction/rotation cues remain separate.
- [ ] On the main map, hover and click a thumbnail. Confirm the larger uncropped popup, compact spacing, source/identity and discreet close control; close it and hover again.
- [ ] Navigate a same-location stack in both directions. Open the current member in the module. Check multiple placements of the same asset retain their occurrence identity.
- [ ] Resize while the popup is open, including portrait images and expanded `Bildedetaljer`. Confirm it remains inside the map and can scroll when needed.
- [ ] Click normal GMI and Gemini WFS objects alongside photo thumbnails; verify normal popups, selection, visibility and map navigation.

Automated/CDP and screenshot checks above are completed separately from these human acceptance boxes.
