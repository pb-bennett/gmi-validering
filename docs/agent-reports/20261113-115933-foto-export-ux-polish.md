# FOTO export UX polish completion

Completed 2026-11-13 in `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, starting and finishing HEAD `04d9bdb`.

## Outcome and decisions

1. **Map delivery selection.** Kept the accepted camera/thumbnail provenance palette, directions, geographic anchors, selection ring and normal workspace/main-map interactions. Added small, shape-distinct delivery badges: retained link, planned transfer, unlinked inclusion/exclusion and review. A separate circular check shows temporary batch selection. Accessible marker names describe planned decisions and change to “Velg plassering” in delivery mode; pressed state follows the canonical selection.
   Single-occurrence marker clicks toggle M8 `deliveryIds`. Exact-coordinate stacks retain their grouping and open a scrollable occurrence chooser instead of selecting every member. Its independent checkboxes synchronize with the sidebar. Embedded existing `PhotoDeliveryControls` provide per-occurrence map actions; the existing sidebar applies batch actions to the same selection, with unchanged eligibility/count/notification behavior. Selecting never changes a decision. Shared assets retain independent occurrence decisions.
   The provenance and delivery legend sections remain separate. Delivery help is collapsible and opens automatically in delivery-selection mode. This preserves the existing compact legend height in normal navigation; expanded help can scroll at laptop sizes.
2. **Terminology.** All four delivery choices, explanations, reviewed summaries and the separately downloaded report now describe GMI/GML artifacts. Internal mode identifiers, scope and delivery semantics are unchanged. FOTO still names the workspace/layer and established technical profile terminology remains intact.
3. **Package contents.** A presentational tree derives paths and attachment identities from the existing reviewed M9 inventory. It supports nested/outside-`Attachments` paths, complete filenames, folder counts, individual folders and expand/collapse-all. Directories start collapsed. GMI-only shows its standalone file; other modes show the actual ZIP root. No archive path is invented or renamed.
   Optional thumbnails default off. Only expanded rows near the viewport request previews. Requests use M9's checksum-verified `readDeliveryAttachment`, then the existing bounded `createPhotoThumbnail`; decoding is serial. Cleanup aborts queued/active work and releases created URLs on collapse, toggle, navigation, close or stale-review unmount. A failed preview retains its filename and fallback. No preview can introduce an excluded attachment. The TXT report remains visibly separate and outside the ZIP.
4. **Control wording.** Kontroll says “Eksportkontroll fullført”; generation availability and merknader remain separate. Existing timestamp/schema, direction, Gemini import and hyperlink-removal notices remain. UI/report text explicitly avoids implying XSD certification or Gemini acceptance.

No changes to the delivery planner/package engine, Gemini serializer, UUID/time/geometry/link serialization, ChangeSet engine, Validator, immutable source bytes or export verification gates. No new dependencies.

## Exact changed/new files

Updated:

- `src/app/page.js`
- `src/components/MapView.js`
- `src/components/photos/PhotoMapDisplayCard.js`
- `src/components/photos/PhotoMarkersLayer.js`
- `src/components/photos/photoWorkspace.css`
- `src/lib/photos/photoMarkerPresentation.mjs`
- `src/components/delivery/DeliveryWizard.js`
- `src/components/delivery/deliveryWizard.css`
- `src/lib/delivery/deliveryWizard.mjs`
- `tests/deliveryWizard.test.mjs`
- `tests/deliveryWizardUi.test.mjs`
- `tests/photoMarkerProvenanceUi.test.mjs`

New:

- `src/components/delivery/DeliveryInventory.js`
- `src/lib/delivery/deliveryInventory.mjs`
- `tests/deliveryPolish.test.mjs`
- This report and 17 PNGs in `docs/agent-reports/assets/20261113-export-polish/` (listed below).

Reused M8 session decisions and workspace reducer, collection bulk actions, existing per-occurrence controls, marker caches/provenance/direction models, M9 review/liveness/read/download/package APIs, thumbnail decoder, wizard reducer/draft/download guards and native dialog/focus behavior.

## Verification

Passed:

- Relevant serial Node regression selection: **1,015 passed, 0 failed, 13 skipped**. Includes new polish tests, M7 hyperlink removal, M8 decisions, M9 package/source integrity, M10 wizard, shared assets, positioning and Gemini/golden export tests.
- Focused follow-up `node --test tests/deliveryPolish.test.mjs tests/deliveryWizard.test.mjs tests/photoMarkerPresentation.test.mjs`: **27 passed**. Final presentation/polish rerun: **19 passed** for the first and third of those files. Large-tree coverage uses 500 attachments plus nested/outside paths; all-mode inventory tests use actual M9 plans.
- Production-browser broad run, serial on port 3237: **74 passed, 2 failed** (the legend-height subtest and its parent). The real layout regression was corrected by collapsing delivery help outside selection mode; the original `<280px` compact-height assertion was retained.
- Final fresh production build, followed by `node --test --test-concurrency=1 --test-force-exit tests/deliveryWizardUi.test.mjs tests/photoMarkerProvenanceUi.test.mjs`: **21 passed, 0 failed, 0 skipped**, including the formerly failing height assertion. Final additional wizard rerun after adding trusted map-keyboard/accessibility assertions: **12 passed, 0 failed**.
- Other broad browser suites passed: `photoDeliveryIntentUi`, `photoWorkspaceStacksUi`, `photoExportWizardUi`, `photoExportReturnUi`, `photoExportLayoutUi`, `gmiEditDraftGuardUi`. These cover M8 bulk behavior, normal stack cycling, placement/editing, draft guards, completion journeys, download protection and responsive layout.
- `npx.cmd --no-install eslint` on every changed/new JS/MJS file listed above: passed; repeated on the last changed browser test.
- Final `npm.cmd run build`: passed compilation, TypeScript and static generation.
- `git diff --check`: passed, including after completion report creation.

Node selection command:

```powershell
$tests = @(Get-ChildItem tests -Filter '*.test.mjs' | Where-Object {
  $_.Name -match '^(photo|gmiEdit|gmiPhoto|geminiGmlParser|delivery)' -and
  -not (Select-String -LiteralPath $_.FullName -Pattern 'chromeHarness|PHOTO_UI_URL|PHOTO_WORKSPACE_UI_URL|GMI_EDIT_UI_URL' -Quiet)
} | ForEach-Object { $_.FullName })
node --test --test-concurrency=1 @tests
```

Browser commands used `PHOTO_UI_URL=http://127.0.0.1:3237`, the existing Chrome harness, `DELIVERY_SCREENSHOT_DIR=docs/agent-reports/assets/20261113-export-polish` and, for provenance capture, `PHOTO_SCREENSHOT_DIR` in the task's temporary directory. Broad command used the eight suites named above with `--test-concurrency=1 --test-force-exit`. Only this task's production server was started/stopped; it is stopped. Logs/downloads remained temporary.

Initial failures/limitations, separately:

- Sandbox build could not fetch the existing Google font; network-enabled builds passed without configuration/dependency changes. Sandboxed Chrome timed out at `Runtime.enable`; authorized local Chrome runs passed.
- Early editing introduced text-encoding mismatches, corrected before the successful regression run. Existing summary assertions were migrated from the intentionally renamed FOTO label to GML, retaining their value/count assertions.
- An early keyboard test sent Enter without text and did not trigger native activation in this harness. Trusted Space activation verified actual folder toggling; no keyboard behavior assertion was removed. Map Space selection is also verified.
- No unresolved application failure remains in the selected checks. No failure is claimed pre-existing. The repository-wide unrelated terrain-GML baseline was not investigated or claimed resolved.
- The 13 Node skips are opt-in/private-corpus tests. No real-file manual acceptance, assistive-technology session, hundreds-of-real-JPEG browser performance benchmark, full XSD certification or Gemini database import was performed. Synthetic checks do not close those acceptance gates. The 500-file inventory check is a model test, not a browser performance measurement.

## Screenshots and visual review

Synthetic photographs/GMI objects only. Inspected map provenance/delivery combinations, overlap chooser, batch checks, expanded/collapsed tree, visible JPEG preview, focus outline and laptop scrolling/footer access at both requested sizes. No clipped filenames or horizontal overflow observed in the exercised layouts; long content scrolls inside its existing pane/modal. Preview colors match the included synthetic JPEG.

Under [assets/20261113-export-polish/](assets/20261113-export-polish/):

- [Provenance + decisions, 1280](assets/20261113-export-polish/polish-provenance-delivery-1280x720.png), [1366](assets/20261113-export-polish/polish-provenance-delivery-1366x768.png).
- [Overlapping occurrence selection, 1280](assets/20261113-export-polish/polish-map-overlap-selection-1280x720.png), [1366](assets/20261113-export-polish/polish-map-overlap-selection-1366x768.png).
- [Collapsed tree, 1280](assets/20261113-export-polish/polish-tree-collapsed-1280x720.png), [1366](assets/20261113-export-polish/polish-tree-collapsed-1366x768.png).
- [Expanded tree, 1280](assets/20261113-export-polish/polish-tree-expanded-1280x720.png), [1366](assets/20261113-export-polish/polish-tree-expanded-1366x768.png).
- [JPEG thumbnail, 1280](assets/20261113-export-polish/polish-tree-thumbnails-1280x720.png), [1366](assets/20261113-export-polish/polish-tree-thumbnails-1366x768.png).
- [Keyboard focus, 1280](assets/20261113-export-polish/polish-tree-keyboard-focus-1280x720.png), [1366](assets/20261113-export-polish/polish-tree-keyboard-focus-1366x768.png).
- Additional wizard captures: `m10-gmi-content-1366x768.png`, `m10-split-review-1366x768.png`, `m10-combined-package-1280x720.png`, `m10-combined-package-1366x768.png`, `m10-blocked-review.png`.

## Manual browser acceptance checklist / follow-up

1. At 1280×720 and 1366×768, load an approved GMI with its photographs and shared placements. Inspect each provenance marker and delivery badge in markers/miniatures, with direction arrows; expand/collapse delivery help and check contrast/focus with the intended basemap.
2. Enter delivery selection. Click one isolated marker twice; check sidebar/count/availability and unchanged decisions. Use keyboard Space. Open an overlapping stack; select individual named occurrences, never the group. Apply transfer/retain on one occurrence, then existing bulk actions on mixed selections. Verify siblings and unlinked inclusion/exclusion independently; exit and verify normal opening/selection/stack cycling and map pan/zoom.
3. Stage a correction and review every delivery mode. Verify Norwegian descriptions, split exclusion acknowledgement, correction/reference counts, warnings and “Eksportkontroll fullført” versus generation status. Inspect all schema/direction/timestamp/Gemini/hyperlink notices without treating them as certification.
4. For each mode inspect the package hierarchy, full long filenames, nested/outside paths and counts. Confirm standalone GMI has no ZIP wrapper. With a large approved image set, expand individual directories/all, collapse all, enable previews and scroll; confirm responsiveness, every filename remains readable and shared images appear once per actual packaged path.
5. Enable previews, collapse/toggle/navigate/close/reopen. With synthetic copies simulate preview failure and stale decisions/source changes; confirm fallback filenames, hidden stale inventory and disabled stale downloads. Check keyboard Tab/Space, visible focus and screen-reader names/expansion state.
6. Download ZIP and separate TXT. Compare ZIP entries/bytes to reviewed inventory, retained/transferred links and GML records; confirm no report/manifest inside ZIP. Verify only successful applicable package initiation clears captured correction download state. Keep originals immutable.
7. Recipient/XSD and actual Gemini import compatibility, including hyperlink removal, remain the existing separate acceptance work. Do not perform database import as part of this pass.

## Git/publication

All task files are unstaged/uncommitted. No stage, commit, push, deployment, branch/ref change or synchronization. The only starting changes were the three untracked planning reports dated `20261111-085500`, `20261111-092840`, `20261111-093345`; they were left untouched. No later milestone was implemented.
