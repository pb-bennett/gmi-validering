# FOTO export final acceptance refinements

Completed 2026-11-13. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, starting and finishing HEAD `828f27b`.

## Implementation

- Removed delivery-arrow badges entirely. Normal markers retain the accepted provenance palette. Delivery selection defaults to decision colours: blue for retained GMI links, green for transfer/inclusion in GML, neutral for excluded unlinked placements, amber for review. The compact legend selector switches between **Plasseringskilde** and **Leveringsvalg** without changing decisions. Leaving delivery selection restores provenance. Camera fills and thumbnail borders use the same palette; directions, anchors, counters, existing outlines and batch checks remain independent.
- Mixed overlapping destinations use neutral colour with a dashed camera outline/thumbnail border. The entire stack is compared by occurrence destination, so a top member cannot colour a mixed group as a single destination. Tooltips/accessibility retain the exact occurrence decision and identify mixed positions. Unplaced photos still have no marker.
- Added **Massevalg** / **Leveringsvalg** popup tabs, native buttons with tab/tabpanel semantics, roving focus and Arrow/Home/End navigation. Massevalg contains occurrence checkboxes and brief decision labels; existing sidebar batch actions remain the only batch action area. Leveringsvalg reuses existing per-occurrence controls with compact presentation. Eligibility and review explanations remain available. The active tab and colour view live in the existing transient workspace reducer; no browser storage or second decision/selection owner was introduced. Closing one popup and opening another preserves the tab.
- Package step uses approximately 95dvh with responsive margins. Header, steps and footer retain the existing fixed frame; the body is the single main scrolling area. Summary rows flow into the requested two groups of three on wider screens and return to one column below 700px. Summary values, warnings, reviewed plans and download guards are unchanged.
- Added right-aligned inline **GMI**, **GML**, **GMI + GML** badges to reviewed attachment rows, visible with or without thumbnails. Blue/green/neutral treatments match the map palette. Destinations derive from M9's retained-path flags (issued only for surviving GMI references) and exact GML attachment paths with actual exported occurrences. A retained alias of a shared image does not acquire GML status merely because the asset is referenced elsewhere. The tree remains read-only; filenames, paths, counts, previews, resource cleanup, staleness and the separate TXT report are preserved.

No M8 decision semantics, M9 planner/package/patch code, M10 download guards, serializers, identifiers, timestamps, geometry, links, Validator or Rettinger engines changed. No dependencies added. This supersedes the rejected delivery-badge design in the previous polish report; other accepted behavior is preserved.

## Exact files changed

Updated:

- `src/app/page.js`
- `src/components/MapView.js`
- `src/components/photos/PhotoMapDisplayCard.js`
- `src/components/photos/PhotoMarkersLayer.js`
- `src/components/photos/PhotoDeliveryControls.js`
- `src/components/photos/photoWorkspace.css`
- `src/lib/photos/photoMarkerPresentation.mjs`
- `src/lib/photos/photoWorkspaceState.mjs`
- `src/components/delivery/DeliveryWizard.js`
- `src/components/delivery/DeliveryInventory.js`
- `src/components/delivery/deliveryWizard.css`
- `src/lib/delivery/deliveryInventory.mjs`
- `tests/deliveryPolish.test.mjs`
- `tests/deliveryWizardUi.test.mjs`
- `tests/photoMarkerProvenanceUi.test.mjs`
- `tests/photoWorkspace.test.mjs`

New: `src/components/photos/PhotoDeliveryMapPopup.js`, this report, and the 16 synthetic PNGs linked below under `docs/agent-reports/assets/20261113-final-export-refinements/`.

## Verification results

Passed:

- Relevant serial Node regression selection: **1,018 passed, 0 failed, 13 skipped**. Covers FOTO/export, M7 hyperlink removal, M8 decisions, M9 package/source integrity and M10 wizard behavior. Command:

```powershell
$tests = @(Get-ChildItem tests -Filter '*.test.mjs' | Where-Object {
  $_.Name -match '^(photo|gmiEdit|gmiPhoto|geminiGmlParser|delivery)' -and
  -not (Select-String -LiteralPath $_.FullName -Pattern 'chromeHarness|PHOTO_UI_URL|PHOTO_WORKSPACE_UI_URL|GMI_EDIT_UI_URL' -Quiet)
} | ForEach-Object { $_.FullName })
node --test --test-concurrency=1 @tests
```

- Focused follow-up `node --test tests/deliveryPolish.test.mjs tests/photoMarkerPresentation.test.mjs tests/photoWorkspace.test.mjs`: **35 passed**. Includes colour/default/selection independence, shared and mixed occurrence colours, actual-plan destinations across modes, exact-path aliases and the existing 500-file/nested inventory checks.
- Final fresh production build followed by `node --test --test-concurrency=1 --test-force-exit tests/deliveryWizardUi.test.mjs tests/photoMarkerProvenanceUi.test.mjs`: **21 passed, 0 failed, 0 skipped**. Includes keyboard tab operation, remembered tab across markers, sidebar/map synchronization, normal mode restoration, all four delivery modes, GMI/GML/both badges, thumbnail on/off/failure/cleanup, stale and unreadable attachments, source-byte/download protection, compact legend height, package height/footer and two-column/single-column summary at 1280×720, 1366×768 and 390×844.
- Existing workflow browser regressions: **46 passed, 0 failed, 0 skipped**, using `node --test --test-concurrency=1 --test-force-exit tests/photoDeliveryIntentUi.test.mjs tests/photoWorkspaceStacksUi.test.mjs tests/photoExportReturnUi.test.mjs tests/photoExportLayoutUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs`. Includes six-occurrence stack behavior, normal opening/editing, completion journeys, draft guards, repeated-click/late-download protection and narrow layout checks.
- `npx.cmd --no-install eslint` on all changed/new JS/MJS files listed above: passed, repeated for the final browser-test changes.
- Final `npm.cmd run build`: passed compilation, TypeScript and static generation.
- `git diff --check`: passed, repeated after this report.

Browser runs used `PHOTO_UI_URL=http://127.0.0.1:3239`, the existing local headless Chrome harness and serial shared-server tests. `DELIVERY_SCREENSHOT_DIR` targeted the new asset directory; provenance screenshots were captured temporarily via `PHOTO_SCREENSHOT_DIR` and copied selectively. Only this task's production servers were started/stopped; the final server is stopped. Temporary logs/downloads remained outside the repository.

Failures and skips, separately:

- Initial sandboxed build could not fetch the existing Roboto Google font. Network-enabled production builds passed without a font/dependency workaround. Existing module-type/Browserslist age warnings remain.
- Initial focused browser run had **19 passes and 2 failures** (one tab-memory subtest and its parent). The assertion inspected Leaflet's old popup during its closing animation. Waiting for that popup to leave the DOM preserved the exact one-occurrence/tab assertion; subsequent wizard and final two-suite runs passed. No application baseline failure is claimed.
- Intentional contract updates replaced rejected overlay assertions with colour-mode assertions and changed the expected legend control count from two to three for the new selector. Existing compact-height, byte-integrity, selection, lifecycle and safety assertions were retained.
- The 13 Node skips are existing opt-in/private-corpus tests. No unresolved failures remain in the selected checks. No claim is made about unrelated repository-wide failures not exercised here.

## Screenshots / visual review

Reviewed laptop and narrow layouts for readable filenames, inline badges, compact tabs/legend, independent selection checks, summary grouping, fixed footer and usable scrolling. Synthetic images/GMI objects only; no private corpus content was used.

- Provenance mode: [1280](assets/20261113-final-export-refinements/final-provenance-mode-1280x720.png), [1366](assets/20261113-final-export-refinements/final-provenance-mode-1366x768.png).
- Delivery colours: [1280](assets/20261113-final-export-refinements/polish-provenance-delivery-1280x720.png), [1366](assets/20261113-final-export-refinements/polish-provenance-delivery-1366x768.png).
- Mixed stack / Massevalg: [1280](assets/20261113-final-export-refinements/polish-map-overlap-selection-1280x720.png), [1366](assets/20261113-final-export-refinements/polish-map-overlap-selection-1366x768.png).
- Leveringsvalg tab: [1280](assets/20261113-final-export-refinements/final-popup-decisions-1280x720.png), [1366](assets/20261113-final-export-refinements/final-popup-decisions-1366x768.png).
- Summary and shared-file badge: [1280](assets/20261113-final-export-refinements/m10-combined-package-1280x720.png), [1366](assets/20261113-final-export-refinements/m10-combined-package-1366x768.png), [390](assets/20261113-final-export-refinements/m10-combined-package-390x844.png).
- Verified thumbnails / GML badge: [1280](assets/20261113-final-export-refinements/polish-tree-thumbnails-1280x720.png), [1366](assets/20261113-final-export-refinements/polish-tree-thumbnails-1366x768.png).
- [Retained-only GMI badge](assets/20261113-final-export-refinements/final-package-retained-gmi.png), [keyboard focus](assets/20261113-final-export-refinements/polish-tree-keyboard-focus-1280x720.png), [collapsed folder](assets/20261113-final-export-refinements/polish-tree-collapsed-1366x768.png).

## Manual acceptance / limitations

1. With approved photo copies, inspect provenance colours, enter delivery selection, then switch colour views. Check retained/transferred/included/excluded/review and mixed overlaps; confirm selection and decisions stay independent. Verify normal pan/zoom/opening after leaving the mode.
2. Open a shared/overlapping photograph. Select exact occurrences on Massevalg and verify sidebar/count/batch actions. Use keyboard tabs/arrows; change one decision on Leveringsvalg, close, open another marker and verify remembered tab and independent siblings. Check larger groups scroll inside the popup.
3. Review all four delivery modes at both laptop sizes and mobile width. Inspect two-column/single-column summary, header/steps/footer, full filenames, folder expansion and read-only destination badges with previews on/off. Compare badge references with actual exported GMI/GML, including retained aliases and shared originals.
4. On synthetic copies, exercise stale review, missing/unreadable attachments and failed previews. Confirm obsolete inventory/previews disappear, download guards remain, filenames survive preview failures, and TXT remains separate from ZIP.

Remaining limitations: automated synthetic evidence does not replace real-file/manual or assistive-technology acceptance. Hundreds-of-full-size-JPEG browser performance, full XSD certification and Gemini database import were not performed. Their existing acceptance status is unchanged; no database import was attempted.

## Git and publication

All task changes remain unstaged/uncommitted. No stage, commit, push, deployment, branch/ref change, synchronization or new milestone. The three pre-existing untracked planning reports dated `20261111-085500`, `20261111-092840` and `20261111-093345` were left untouched.
