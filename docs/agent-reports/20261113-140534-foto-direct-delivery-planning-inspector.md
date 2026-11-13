# FOTO direct-click delivery planning, delivery colours and inspector refinement

Completed 2026-11-13 in `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`. Starting and finishing HEAD: `163243d`. The task replaces the batch-selection interaction from [20261113-115933](20261113-115933-foto-export-ux-polish.md) and [20261113-124810](20261113-124810-foto-export-final-acceptance-refinements.md) (Massevalg/Leveringsvalg tabs, checkboxes, batch actions). All other accepted behaviour is preserved.

## Implementation summary

1. **Direct-click planning («Fordel bilder til GMI/GML»).** The Verktøy item is renamed and opens a planning mode with the guidance «Klikk på et bilde for å endre leveringsvalg.», per-occurrence counts (GMI/GML, plus «Ikke med»/«Gjennomgå» when present), a polite live status («a.png · KUM …: Overføres til GML») and «Ferdig». In this mode:
   - A **row click** (or Enter/Space) toggles that occurrence's destination at once and shows it in the inspector, without panning. Arrow keys still move through the list.
   - An **isolated marker click** (or Enter/Space) toggles that occurrence. No popup opens and there is no selection step.
   - An **exact-coordinate stack** opens a compact occurrence chooser. It shows a summary («2 plasseringer · 1 GMI · 1 GML») and one row per placement with filename, object context and its own toggle. There is no group action. Marker colour and summary update immediately.
   - Removed: delivery checkboxes, selected count, «Velg alle viste», bulk buttons, the Massevalg/Leveringsvalg popup tabs, batch check badges, and the `deliveryIds`/`deliveryPopupTab` reducer state. The removal-selection workflow (`removalIds`) and the import wizard's own `batchSelectedIds` are separate features and were kept.
   - Outside planning, row and marker clicks select and open photos as before. Stack cycling and pan/zoom are unchanged.
2. **Delivery colours by default.** «Farge etter: Leveringsvalg» is now the default in every workspace mode. Entering or leaving planning never changes the colour mode. An explicit choice lasts for the workspace session, including re-entry of the same layer (for example after adding photos). A new workspace session starts from the default.
   - Palette: GMI `#1e40af` (deep blue), GML `#22c55e` (bright green), «Ikke med» `#64748b`, review uses the existing amber, and mixed stacks are neutral with a dashed outline. Blue and green now differ strongly in lightness (≈4:1), compared with ≈1.2:1 for the replaced pair.
   - Tokens `--gmi-delivery-*` in `globals.css` mirror `PHOTO_DELIVERY_COLOURS`, and a test keeps them equal. Markers, thumbnail borders (3px in delivery mode), legend swatches, list pills, the inspector toggle, chooser toggles and package-tree pills all use this one palette.
   - «Plasseringskilde» restores the accepted provenance palette. Provenance stays on each marker as data, in the tooltip and in the list/inspector source dots. Camera shape, direction arrows, counters, positions and sizes are unchanged, and no badge overlays were reintroduced.
3. **Inspector.** Layout from top to bottom:
   - Preview and status chips, with «Zoom til bildet» moved into the status row so it stays visible.
   - **Samlet levering** as a compact rounded GMI/GML two-position radiogroup. The active option is filled, check-marked and `aria-checked`. Arrow keys work. Unlinked placements get «Ikke med»/GML instead. Line-only links show a fixed, disabled GMI.
   - The long link-removal paragraphs and the sibling list are removed. Each switcher button now shows its own destination pill and states it in its accessible name.
   - Genuine notes remain as one-liners linked by `aria-describedby`: review, blocked transfer, ambiguous reference, and «Mangler for GML: …».
   - **Opptak**: facts, conflict warning, «Rediger opptaksdata…» first, then nested sources.
   - **Plassering og koblinger**: expandable, open by default. It holds Koordinater, then nested «Kilde, grunnlag og retning» (which contains «Tekniske kildedata» and «Retningsdata fra kilder»), «Andre mulige posisjoner» and «Koblinger».
   - **Filinformasjon**: expandable, collapsed by default.
   - Expansion choices are remembered for the page session across photo switches. Only explicit user choices are stored, so defaults are respected. All data fields and actions are retained.
4. **Export tree.** The destination pill now sits inside the same inline label directly after the filename (`.delivery-file-label`). It is fully rounded, uses the shared palette and has a split blue/green style for «GMI + GML». Long names wrap and the pill follows the last line. Destinations still come from M9's actual retained-path flags and exact GML paths (`deliveryAttachmentDestinations`, unchanged). The tree is still read-only. Nothing else in the wizard changed.

No changes were made to M8 decision semantics or the session API, M9 planner/packaging/link patching, M10 download guards, serializers, UUID/time/geometry handling, source bytes, Validator or Rettinger. No dependencies were added.

## Design decisions

- **One write path.** `src/lib/photos/photoDeliveryChoice.mjs` derives the valid options, the toggle target and the unavailable reason, and dispatches exactly one occurrence through `setDeliveryIntent` or `setCombinedDeliveryInclusion`. Toggles read the current entry from the session, not a rendered copy, so repeated clicks cannot act on stale state. Failures surface as a toast and nothing is written.
- **Review states.** One click resolves a review to its safe default (GMI for a linked occurrence; clearing a stale inclusion for a line-linked photo). A stale transfer whose GMI link disappeared (`link-removed`) can only be replaced by an inclusion, because the existing session API cannot clear that decision. In that case «Ikke med» is shown disabled with an explanation.
- **Row click** both toggles and makes the row active without panning, so the inspector confirms the change. **Map click** toggles only, so the selection ring and stack top do not move under the pointer.
- The **chooser** width is bounded by the map (minimum 280px when available) so filenames do not break mid-word.

## Files

Updated: `src/app/globals.css`, `src/app/page.js`, `src/components/delivery/DeliveryInventory.js`, `src/components/delivery/deliveryWizard.css`, `src/components/photos/PhotoDeliveryControls.js`, `src/components/photos/PhotoDeliveryMapPopup.js`, `src/components/photos/PhotoMapDisplayCard.js`, `src/components/photos/PhotoMarkersLayer.js`, `src/components/photos/PhotoWorkspaceCollection.js`, `src/components/photos/PhotoWorkspaceInspector.js`, `src/components/photos/PhotoWorkspaceToolsMenu.js`, `src/components/photos/photoWorkspace.css`, `src/lib/photos/photoMarkerPresentation.mjs`, `src/lib/photos/photoWorkspaceState.mjs`; tests `tests/deliveryPolish.test.mjs`, `tests/deliveryWizardUi.test.mjs`, `tests/helpers/photoSourceWorkflow.mjs`, `tests/photoDeliveryIntentUi.test.mjs`, `tests/photoInspectorPresentation.test.mjs`, `tests/photoMarkerProvenanceUi.test.mjs`, `tests/photoSpatialUi.test.mjs`, `tests/photoWorkspace.test.mjs`, `tests/photoWorkspaceEditUi.test.mjs`, `tests/photoWorkspaceUi.test.mjs`.

New: `src/lib/photos/photoDeliveryChoice.mjs`, `src/components/photos/PhotoDeliveryToggle.js`, `tests/photoDeliveryPlanning.test.mjs`, this report and the PNGs in `docs/agent-reports/assets/20261113-direct-delivery-planning/`.

Reused: the M8 session decisions and `getLayerDelivery`, `photoDeliveryColourState`/`photoStackDeliveryState`, the marker icon cache and stacks, the workspace reducer, inspector disclosure memory, the toast, M9 `deliveryAttachmentDestinations`/`deliveryInventory`, and the existing wizard and its guards.

## Verification

Passed:

- **New focused Node tests.** `node --test tests/photoDeliveryPlanning.test.mjs tests/deliveryPolish.test.mjs tests/photoWorkspace.test.mjs tests/photoMarkerPresentation.test.mjs tests/photoDeliveryIntent.test.mjs tests/photoInspectorPresentation.test.mjs`: **61 passed, 0 failed**. These cover:
  - one-click GMI→GML→GMI toggling with a real M8 session;
  - shared-photo independence and M9 snapshot removal selections;
  - unlinked «Ikke med»↔GML toggling, the fixed line-linked GMI, and blocked or review states (`source-not-live`);
  - the single write path;
  - stack summary and mixed colour;
  - token/JS palette equality and WCAG lightness/contrast checks;
  - the default colour mode, which survives mode changes and same-layer re-entry;
  - removal of the batch-selection state, plus source contracts for the planning bar, chooser, inspector order and inline tree pill.
- **Serial Node regression selection.** Same command as the previous reports: **1,038 tests, 1,025 passed, 0 failed, 13 skipped** (existing opt-in/private-corpus tests). It covers M7 hyperlink removal, M8, M9 package/byte integrity, M10 wizard, shared-photo and positioning behaviour.
- **Production builds.** `npm.cmd run build` passed twice (initial build, and the final build after the chooser-width change). The network-enabled run was needed for the existing Google font.
- **ESLint.** `npx --no-install eslint` on every changed or new JS/MJS file passed. `git diff --check` passed.
- **Browser runs.** All used the existing Chrome harness against this task's own production server at `http://127.0.0.1:3241`, serially; the server has been stopped.
  - **Final build, focused suites:** `photoDeliveryIntentUi` 1/1 (includes 390×844), `deliveryWizardUi` 12/12, `photoMarkerProvenanceUi` 8/8 subtests, and `photoWorkspaceEditUi` 21/21. The last needed one rerun after I corrected my own new assertion: Koblinger was correctly remembered as open.
  - **Broad FOTO run:** `deliveryWizardUi`, `gmiEditDraftGuardUi`, `gmiPhotoAssociationsUi`, `gmiPhotoPlacementsUi`, `mapTeardownUi`, every `photo*Ui` suite and `photoDialogLayout`. Result: **171 tests, 154 passed, 6 failed, 11 skipped**. The 11 skips are private-corpus or dev-only suites.

The broad run's failures, separately:

- **`photoWorkspaceStacksUi`** «inspector: portrait and landscape…» (plus its parent). This is caused by this task: it looked for `section[aria-label=Fil]`, which was renamed «Filinformasjon» as specified. The selector is now updated, with no other change to the assertion. **The suite was not re-run after the fix, because the session ended at the user's request.**
- **`photoAcceptanceRenderingUi`** «rendered hub…» (`.dataset` of a missing export-heading tone icon) and «rendered done screen…» (expects «ZIP-pakken er klar», got «Nedlastingen er startet»), plus **`photoLoadedGmiUi`** «experimental dual export…» (expects the export summary text «4 features · 3 vedlegg · 1 delt originalbilde») and its parent. All three assert legacy FOTO export-dialog wording and icons that this task did not touch. They were not part of the previous reports' broad runs. **They are not verified as pre-existing:** a baseline run on `163243d` was started and abandoned before completion. Treat them as open until they are checked against the baseline.

## Screenshots

All in [assets/20261113-direct-delivery-planning/](assets/20261113-direct-delivery-planning/), synthetic data only. They were reviewed for colour separation on light and dark backdrops, toggle legibility, nested layout, pill placement and absence of overflow.

- Delivery-coloured map, normal navigation: `refine-delivery-normal-navigation.png`, `refine-delivery-map-normal.png` (mixed stack, dashed). Provenance mode: `final-provenance-mode-1366x768.png`.
- Direct-click planning: `refine-planning-map-1280x720.png`, `refine-planning-map-1366x768.png`, `refine-planning-map-dark-1366x768.png`, `direct-planning-list.png`.
- Overlapping-occurrence chooser: `refine-overlap-chooser-1280x720.png`, `refine-overlap-chooser-1366x768.png`. These were captured before the final chooser-width fix and show filenames breaking mid-word; the fixed layout was not re-captured.
- Simplified inspector: `m8-inspector-1280x720.png`, `m8-inspector-1366x768.png`, `m8-inspector-390x844.png`. Nested details: `03-inspector-nested-details.png`.
- Export tree with inline pills: `polish-tree-thumbnails-1280x720.png`, `polish-tree-expanded-1366x768.png`, `m10-combined-package-1366x768.png` and `m10-combined-package-390x844.png` (GMI + GML), `final-package-retained-gmi.png`, `refine-tree-long-name-390x844.png` (wrapped long name).

## Known issues and deferred acceptance

- Synthetic data only. No real-file manual acceptance, assistive-technology session, XSD certification or Gemini import was performed. Large real stacks and many-JPEG performance were not measured.
- `photoWorkspaceUi` and `photoSpatialUi` are private-corpus suites that skip here. Their small edits (opening the now-nested «Tekniske kildedata») were linted but not executed.
- GML green markers on dark-green aerial imagery rely on the white casing for separation. They were checked on the synthetic dark backdrop only, not on real orthophotos.
- Planning-mode feedback for blocked occurrences (line-only links, uncertain transfers) uses the existing error-tone toast. Product may prefer a neutral tone.
- The edit scripts left some working copies with LF line endings. The index is LF, so the diffs contain no line-ending changes; Git will normalise them to CRLF on checkout.

## Manual browser acceptance checklist

1. Open a layer with GMI-linked, shared, unlinked and line-linked photos (1280×720, 1366×768, 390 px). Confirm that markers, thumbnails, list pills and legend use blue GMI / green GML by default on the real basemap and orthophoto. Switch to «Plasseringskilde» and back; enter and leave «Fordel bilder til GMI/GML»; confirm the choice persists.
2. In planning: click rows and isolated markers (mouse and Enter/Space). Each click changes only that placement, its colour, the counts and the live status. Shared siblings stay unchanged. Line-only links explain why they cannot change.
3. Click an overlapping stack. Toggle each occurrence in the chooser and confirm that the summary, mixed/dashed colour and list update, with no group change.
4. Leave planning. Row and marker clicks open photos and stack cycling works. Use the inspector toggle (mouse and arrow keys), the occurrence switcher pills, «Rediger opptaksdata…», nested disclosures (remembered across photos), the fullscreen viewer and locate.
5. Export every delivery mode. Verify inline pills directly after filenames (GMI, GML, GMI + GML) with thumbnails on and off, long names, nested paths, stale-plan hiding and the separate TXT report. Compare against the downloaded GMI/GML.

## Git and publication

All changes are unstaged and uncommitted. No stage, commit, push, deploy, branch change or synchronisation was performed. The three pre-existing untracked planning reports (`20261111-085500`, `20261111-092840`, `20261111-093345`) were not touched.
