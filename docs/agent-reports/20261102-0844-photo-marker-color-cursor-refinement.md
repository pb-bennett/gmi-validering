# Photo marker color and cursor refinement

Date: 2026-11-02. Repository: C:\GitHub\gmi-validering-test. Branch: feature/photo-workspace.

## Preflight and scope

Starting HEAD: `1c56be24e2ce46eaf85912a439a79f3afe5c42fd` (`Color photo markers by position source`). Root and branch matched; worktree was clean. No AGENTS.md was found in the repository; the previous report also records no ancestor instructions. Read the preceding provenance implementation report, central presentation, marker/legend components, placement controls/layer/hook/CSS, page cancellation wiring, and relevant tests. No sub-agents, commit, or push.

## Changes

GML changes from `#7946b5` to `#a03b82` in the central presentation mapping. Its warmer magenta separates it from GMI blue at ordinary 16-pixel camera size. EXIF `#19785b`, GMI `#2463b5`, Manual `#b06a08`, and neutral unknown are unchanged. Markers and legend still consume the same mapping/glyph. White casing, dark contour, selection ring/size, proposal symbol and independent direction arrow are unchanged. No production color literals are duplicated.

The existing placement transaction already owns map click/Enter handling and toggles `photo-placement-active` in an effect with cleanup. The old single-class crosshair selector lost to Leaflet's two-class grab selector. The new `.leaflet-container.photo-placement-active` selector wins without global state or an important override. Proposal grab/grabbing selectors likewise now beat Leaflet's marker pointer selector. No map classes or JavaScript lifecycle logic changed.

Crosshair begins when placement owns map clicks, remains before/after proposal, and disappears on apply/cancel or transaction/layer unmount. Existing cancellation on hidden layers, workspace exit, reset and stale session tickets remains authoritative. Direction editing alone never activates this class.

Files changed:

- `src/lib/photos/photoMarkerPresentation.mjs`: central GML fill.
- `src/components/photos/photoManualPlacement.css`: cursor specificity.
- `tests/photoMarkerPresentation.test.mjs`: exact palette contract; existing tests cover selected/unselected GMI/GML fills and shared legend mapping.
- `tests/photoMarkerProvenanceUi.test.mjs`: computed cursors, click/Enter proposals, proposal grab, apply/cancel, hidden-layer interruption, repeated active workspace exits, post-reset cleanup, direction-only state, and selected GMI/GML captures at both sizes.
- This report.

## Validation

Final results:

| Check | Result |
|---|---|
| Focused Node tests, 16 files listed below | 166 passed, 0 failed, 0 skipped |
| Final synthetic provenance browser | 7 passed, 0 failed, 0 skipped |
| Synthetic direction browser | 1 passed |
| Corpus manual-placement/workspace/spatial browsers | 3 skipped: private corpus not configured |
| Shared-map WFS browser regressions | 51 passed, 0 failed, 0 skipped |
| Focused ESLint | passed, no diagnostics |
| Production build | passed (network-enabled retry; final build logged separately) |
| git diff --check | passed |

Commands:

```powershell
node --test tests/photoMarkerPresentation.test.mjs tests/photoMapFeatures.test.mjs tests/photoManualPlacement.test.mjs tests/photoDirection.test.mjs tests/photoSpatial.test.mjs tests/photoSpatialProjection.test.mjs tests/photoWorkspace.test.mjs tests/photoWorkspaceUx.test.mjs tests/photoResetIntegration.test.mjs tests/gmiPhotoPlacements.test.mjs tests/geminiReferencePresentation.test.mjs tests/geminiSemanticPresentation.test.mjs tests/geminiPopupContent.test.mjs tests/geminiWorkflowUi.test.mjs tests/mapPaneToolbar.test.mjs tests/mapBackgroundControl.test.mjs
$env:PHOTO_UI_URL='http://127.0.0.1:3000'
$env:PHOTO_SCREENSHOT_DIR=Join-Path $env:TEMP 'photo-refinement'
node --test --test-concurrency=1 tests/photoMarkerProvenanceUi.test.mjs tests/photoDirectionUi.test.mjs tests/photoManualPlacementUi.test.mjs tests/photoWorkspaceUi.test.mjs tests/photoSpatialUi.test.mjs
node --test tests/photoMarkerProvenanceUi.test.mjs
node --test --test-concurrency=1 tests/geminiWorkflowBrowser.test.mjs tests/geminiReferenceBrowser.test.mjs tests/geminiPopupBrowser.test.mjs
npx.cmd eslint src/lib/photos/photoMarkerPresentation.mjs tests/photoMarkerPresentation.test.mjs tests/photoMarkerProvenanceUi.test.mjs
npm.cmd run build
git diff --check
```

Initial sandbox Chrome commands timed out; rerunning outside the sandbox worked. Initial build could not fetch Google Roboto; network-enabled retry passed. Browser assertions exposed the existing proposal pointer specificity issue, which was fixed within scope. Two newly added test labels required an encoding correction; existing Norwegian UI text is unchanged. Final focused provenance run passes after these fixes. No unrelated debt repaired.

Logs are outside Git in `%TEMP%`: `photo-refinement-unit.txt`, `photo-refinement-ui-retry.txt` (direction pass, corpus skips, intermediate provenance failures), `photo-refinement-provenance-final.txt`, `photo-refinement-wfs-retry.txt`, `photo-refinement-build-retry.txt`, and `photo-refinement-build-final.txt`.

## Rendered acceptance

Inspected full-app synthetic light and dark map screenshots at 1920x1080 and 1280x720. GMI blue and GML magenta are readily distinguishable beside EXIF and Manual. Selected GML and GMI retain source identity; ordinary camera size and the shared legend remain readable. Inspected active placement and proposal states; existing direction browser also exercises proposal dragging/keyboard interaction and connector geometry. Computed-style assertions verify the native crosshair and proposal grab; native OS cursors are not included in CDP screenshots.

Evidence directory: `C:\Users\Gemini-Backup\AppData\Local\Temp\photo-refinement`. Captures include `photo-provenance-*`, `photo-provenance-selected-gmi-*`, `photo-provenance-selected-gml-*`, `photo-provenance-dark-*`, `photo-placement-active-*`, and `photo-placement-proposal-*` at both requested sizes. Backgrounds are deterministic synthetic contrast fixtures, not real aerial imagery. Reset cleanup is checked after leaving the workspace; active interruption is directly checked for layer hiding and workspace exit. No private corpus used.

No photo domain, acceptance policy, persistence, export, WFS, map navigation, controls, or semantic source categories changed. No wider UI overhaul.
