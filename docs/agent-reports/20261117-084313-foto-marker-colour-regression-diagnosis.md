# FOTO marker colour regression: dark-grey marker after a delivery change

**DIAGNOSIS — NOT IMPLEMENTED.** This is a read-only investigation. No source, test, dependency or Git state was changed. The only new file is this report.

- Repository: `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `6151d40` (verified at start; tree clean, branch ahead of origin by 1).
- Date: 2026-11-17.
- Model: Opus, high effort.

## 1. Summary

The dark-grey marker is **not** a stale render, a cache miss or a CSS mismatch. It is the **"Ulike leveringsvalg" (mixed stack) state**, `PHOTO_DELIVERY_COLOURS.mixed = #64748b` with a dashed outline. The code applies it to an exact-coordinate stack whenever the stack's occurrences have different delivery states.

The behaviour the user sees comes from two deliberate rules working together:

1. **A stack is coloured by all of its members.** `PhotoMarkersLayer.js::markerModels` (line 90) gives the stack's top marker `deliveryColourState = photoStackDeliveryState(members, entries)`. That returns `'mixed'` as soon as two members differ (`photoMarkerPresentation.mjs:141-144`).
2. **The selected occurrence is always the stack top** (`markerModels`, line 72: `members.find((photo) => photo.id === workspace?.photoId) || …`).

So when the user changes the *selected* occurrence in the large map preview, their own marker stops showing its own status and switches to the stack aggregate. The status is changed by the `PhotoDeliveryCycleButton` in `PhotoWorkspaceMapPreview`, and the occurrence is the stack top because a marker click selects it. The list, the preview pill, the inspector and the counts all show the occurrence's own state (GML), so they look correct while the marker turns grey.

The first GMI → GML change makes this most visible. Every occurrence starts as `keep-link`, so every stack is uniformly blue until that first change. The first change on any stacked occurrence is the first time a stack becomes mixed.

The behaviour is **deterministic and depends on state, not on timing**. It appears only when all of the following hold:
- the occurrence shares exact coordinates with at least one other visible occurrence in the same FOTO layer;
- the other occurrences in that stack have a different delivery destination;
- the colour mode is «Leveringsvalg» (the default);
- the workspace is in browse mode, not Edit mode.

The same rules are currently **codified as the expected contract** by `tests/deliveryWizardUi.test.mjs:254-260` (`assert.equal(await fill(), '#64748b', 'mixed stack has no single destination colour')`). The decision was recorded in `docs/agent-reports/20261113-124810-foto-export-final-acceptance-refinements.md:8` and kept in `20261116-131928-foto-map-interactions-slice2-completion.md:19`. Under current code this is intended behaviour, not a regression. Real-data acceptance shows that it reads as a fault when the user is acting on the selected occurrence. Changing it is a **design decision** (see §5).

## 2. Delivery-state flow traced (confirmed from source)

| Step | Location | Notes |
|---|---|---|
| Pill click | `PhotoDeliveryCycleButton.js` → `onCycle(entry.photoId)`, `stopPropagation` | Rendered by `PhotoWorkspaceMapPreview.js:26` with `deliveryEntry = workspace.delivery.byPhotoId[previewPhoto.id]` (`PhotoMarkersLayer.js:316`). |
| Dispatch | `page.js:247 toggleWorkspaceDelivery` → `togglePhotoDelivery` (`photoDeliveryChoice.mjs:127`) | Reads the **fresh** session entry. A proposal overlay is handled from `shownDelivery`. |
| Write | `photoSession.mjs:873 setDeliveryIntent` | Writes exactly the one occurrence id, then `publish()`. No sibling or asset-level write. |
| Derivation | `photoDeliveryIntent.mjs::photoDeliveryEntry` / `photoLayerDelivery` | Each occurrence's status is derived separately. Siblings of the same asset are not affected. |
| Page state | `page.js:226 workspaceDelivery` (memo on `photoLayers`) → `shownDelivery` (line 232) → `photoWorkspace.delivery` (line 1006) | `photoLayers` is a new array on every publish, so this updates on the same render. |
| Map items | `MapInner.js:1141 photoItems` → `buildPhotoMapItems` | Feature id `photo:${layerId}:${photo.id}` is per occurrence (`photoMapFeatures.mjs:13`). |
| Model | `PhotoMarkersLayer.js:59 markerModels` | Builds stacks by `layerId|lat|lng`, chooses the top (line 72) and applies the stack aggregate colour to the top (line 90). |
| Icon | `photoMarkerIcons.js::photoMarkerIcon` → `photoMarkerIconKey` / `photoMarkerOptions` | The key includes `deliveryStatus`, `colourMode` and `deliveryColourState`, so a changed state always gets a new icon. |
| Render | React-Leaflet `Marker` `icon` prop → `setIcon` | `DivIcon.createIcon` reuses the marker's div and replaces `innerHTML` and `className`. |

## 3. Marker visual states (inventory)

| State | Source | Effect on fill |
|---|---|---|
| Delivery (default) | `photoMarkerOptions` → `PHOTO_DELIVERY_COLOURS[state].color` | GMI `#60a5fa`, GML `#4ade80`, Ikke `#cbd5e1`, review `#b06a08`, **mixed `#64748b` + dashed outline** |
| Provenance («Plasseringskilde») | `PHOTO_POSITION_SOURCES` | EXIF/GMI/GML/Manuell colours; unknown provenance is `#64748b` |
| Selected | `photoCameraGlyph(selected)` → white and `#172b3a` **ring only**, size 22; thumbnail: navy box-shadow | **None.** Selection does not override the delivery fill. |
| Sibling (same asset, other place) | Dashed `#64748b` ring / thumbnail outline | None |
| Staged / editing | Teal dot, `photo-marker-editing` | None. In Edit mode `EditableMarker` uses the target's **own** status. |
| Stack | Badge with count; top gets `deliveryColourState` | **Replaces** the own status with the aggregate (`mixed` when members differ) |
| Hover (thumbnails) | Imperative `setZIndexOffset(800)` | None |

## 4. Findings

### Confirmed

- **C1. The dark grey is the mixed-stack colour applied to the selected occurrence.** Reproduced (§6): after GMI → GML on a selected occurrence stacked with one GMI sibling, the rendered glyph fill is `#64748b` with `stroke-dasharray="2 2"` and class `photo-delivery-mixed`. An isolated occurrence in the same transition turns `#4ade80`.
- **C2. Selection does not override delivery colour.** `photoCameraGlyph` draws the selection ring as a stroke only. In provenance mode the same state keeps `#2463b5`.
- **C3. No stale-state, closure, memoisation, React key or Leaflet cache defect was found on this path.** Writes publish synchronously. `shownDelivery` and `photoItems` follow `photoLayers`. The icon key covers every input that `photoMarkerOptions` uses. Marker keys are per occurrence.
- **C4. Edit mode shows the opposite colour for the same state.** `PhotoEditLayer.js:232` builds the edit target's icon without `deliveryColourState`, so the same selected occurrence is green (`#4ade80`) in Edit mode and grey in browse mode. In Edit mode, `markerModels` also skips the stack top for a stack that contains the hidden target (line 71). Entering and leaving Edit mode therefore toggles the colour, which adds to the "sometimes" impression.
- **C5. The grey can also hide a correctly coloured marker when nothing is selected.** With no selection, the top is `members.at(-1)` (or the last staged member). The occurrence that was changed is drawn underneath it with `zIndexOffset` 0 and is covered by the grey top (scenario 3).
- **C6. How stacks arise.** `gmiPointPosition` (`gmiPhotoSource.mjs:78`) projects the GMI object's single raw coordinate. Every photo linked from one GMI point object becomes a separate occurrence ([planning report, line 23](20261116-194458-lok-top-kum-photo-hyperlink-transfer-planning.md)), and all of them get bit-identical coordinates. A point with several photos, which is common in real data, is therefore always a stack. Two objects that share exact XY also form a stack.
- **C7. Multiple GMI objects referencing the *same* photograph** create independent occurrences with the same `assetId`. At different coordinates they are siblings: each marker keeps its own fill and carries a dashed sibling ring. Only at identical coordinates do they form a stack and hit C1. LOK/TOP and KUM coordinates differ in the approved model ([planning report, line 11](20261116-194458-lok-top-kum-photo-hyperlink-transfer-planning.md)), so that pairing is **not** by itself a stack source.
- **C8. Test coverage gap.** `tests/photoMapInteractionSlice2Ui.test.mjs` exercises the preview pill GMI → GML → Ikke → GMI and asserts the marker fill. Its two shared-photo objects are at **different** coordinates (`581930 6566000` and `582030 6566100`), so no stack is involved. The only stacked browser case (`deliveryWizardUi.test.mjs:241-260`) changes the status through the inspector radio and asserts the grey. No test covers the preview pill on a stacked occurrence, or checks consistency between browse and Edit mode.

### Hypotheses (not verified with the real data)

- **H1.** The acceptance data most likely contains GMI point objects with more than one linked photo, or objects with identical XY. This follows from C6, but the private corpus was not inspected (out of scope under `docs/privacy.md`).
- **H2.** The user reads `#64748b` as a broken "Ikke" or as "selected", for three reasons:
  - until the 2026-11-16 Slice 2 palette, `#64748b` **was** the «Ikke med» colour (`20261115-093631-foto-direct-delivery-interaction.md:17`);
  - the legend draws **«Valgt»** and **«Samme bilde»** swatches with `sourceKind: 'unknown'`, so they also have a `#64748b` fill (`PhotoMapDisplayCard.js:64-65`; reproduced in §6, item 9);
  - the 1.5 px dashed outline is hard to see at 16–22 px.

## 5. Proposed fix (minimal and targeted; needs design approval)

This changes an accepted presentation rule and the browser contract at `deliveryWizardUi.test.mjs:258`. Under AGENTS.md ("A new colour or variant is a design decision… Tests that assert computed colours… are contracts"), it should be approved before it is implemented.

**Recommended: the selected occurrence keeps its own colour and signals the mixed stack without changing the fill.**

1. In `PhotoMarkersLayer.js::markerModels`, compute `stackState = photoStackDeliveryState(members, entries)` for the top as now. If the top is the **selected** workspace occurrence, pass `deliveryColourState: null`, so the fill comes from its own `deliveryStatus`. Also pass a new boolean, e.g. `stackMixed: stackState === 'mixed'`. Unselected stack tops, including all main-map stacks, keep the current `mixed` neutral, so the overview rule "a mixed group never takes its top member's colour" still holds where no occurrence is being acted on.
2. In `photoMarkerOptions` (`photoMarkerPresentation.mjs:173`), set `mixedDelivery: delivery === 'mixed' || Boolean(options.stackMixed)`. This keeps the existing dashed camera outline and thumbnail border cue with no new colour. Add `stackMixed` to `photoMarkerIconKey` so the cache separates the variants.
3. Keep the existing aria-label suffix `· Ulike leveringsvalg på samme sted` (`PhotoMarkersLayer.js:105`). It already states the own status first.
4. Optionally make `EditableMarker` pass the same `stackMixed` flag, so browse and Edit mode match exactly (fill and dashed outline).

The change is about 6 lines in two files. Selection, stacking, z-order, provenance mode, icon caching and the per-occurrence write path are untouched.

*Alternatives considered:*
- (a) Keep the rule and only fix the legend swatches. This does not address the reported confusion.
- (b) Give "mixed" a new colour. That is a palette decision and still overrides the state the user just chose.
- (c) Colour every stack top by its own status. This loses the approved overview cue for unselected stacks.

**Related fix, separate decision:** draw the legend «Valgt» and «Samme bilde» swatches with a neutral delivery fill, or as ring-only samples, so that they no longer share `#64748b` with «Ulike leveringsvalg» (`PhotoMapDisplayCard.js:64-65`).

## 6. Verification performed

- **Repository state:** `git rev-parse` / `git log` / `git status -sb` confirmed `feature/photo-workspace` at `6151d40` with a clean tree.
- **Focused unit tests (unchanged code):** `node --test tests/deliveryPolish.test.mjs tests/photoMarkerPresentation.test.mjs tests/photoDeliveryPlanning.test.mjs`: **30 passed, 0 failed, 0 skipped.**
- **Reproduction (scratch script outside the repo, synthetic data only):** the script extracts the real `markerModels` source text from `PhotoMarkersLayer.js` at runtime and runs it with the real `photoMarkerPresentation.mjs` helpers. Only `L.divIcon` creation and the label helper are stubbed. Fixture: occurrences `occ-kum` and `occ-lok` of asset X at identical coordinates, plus an isolated `occ-solo`. Results:

| # | State | Marker drawn on top | Fill |
|---|---|---|---|
| 1 | All GMI, `occ-kum` selected | `occ-kum` (stack 2) | `#60a5fa` |
| 2 | `occ-kum` GMI → GML, selected | `occ-kum` (stack top, `mixed`, dashed) | **`#64748b`** |
| 3 | Same, nothing selected | `occ-lok` top (`mixed`, z 100); `occ-kum` green underneath (z 0) | **`#64748b`** |
| 4 | `occ-kum` GML → Ikke, selected | `occ-kum` (`mixed`) | **`#64748b`** |
| 5 | Both stacked occurrences GML | `occ-kum` (`gml`) | `#4ade80` |
| 6 | Control: isolated `occ-solo` GMI → GML | `occ-solo` | `#4ade80` |
| 7 | State 2, «Plasseringskilde» | `occ-kum` | `#2463b5` |
| 8 | State 2, Edit-mode target (`EditableMarker` options) | `occ-kum` | `#4ade80` |
| 9 | Legend «Valgt» / «Samme bilde» / «Ulike leveringsvalg» swatches | — | `#64748b` / `#64748b` / `#64748b` (Ikke = `#cbd5e1`) |

- **Not run:** production build and browser suites. No test was changed, and `deliveryWizardUi.test.mjs:258` already asserts the observed grey against the running app. No real-data or Vercel reproduction was performed. No private corpus was read.
- **`git diff --check`:** not applicable. No tracked file was modified.

## 7. Regression tests to add with the fix

1. **Unit (`tests/deliveryPolish.test.mjs` or `tests/photoMarkerPresentation.test.mjs`).** Test `photoMarkerOptions('markers' | 'thumbnails', { colourMode: 'delivery', deliveryStatus: 'transfer', stackMixed: true, selected: true })`:
   - the fill or `--photo-source` is `#4ade80` (not `#64748b`);
   - the camera glyph has `stroke-dasharray`, and the thumbnail has class `photo-delivery-mixed`;
   - `photoMarkerIconKey` differs with and without `stackMixed`.
2. **Unit for the stack decision.** Move the top-colour rule into a pure exported helper, for example `photoStackMarkerDelivery({ members, entries, photo, top, selected })` in `photoMarkerPresentation.mjs`, so that it can be tested without Leaflet. Then assert:
   - a selected top in a mixed stack shows its own colour with the mixed flag;
   - an unselected top in a mixed stack shows `mixed`;
   - a uniform stack shows the uniform colour;
   - a single occurrence shows its own colour.

   The scratch reproduction in §6 is a ready template for this.
3. **Browser (`tests/photoMapInteractionSlice2Ui.test.mjs`).** Add a third GMI point at the **same XY** as an existing one, with a different photo. Select it by marker click and cycle the **preview pill** GMI → GML → Ikke → GMI. After each step, assert that the marker's fill matches the pill (`HEX[key]`) and that the dashed outline is present while the stack is mixed. Then close the preview, clear the selection and assert that the unselected stack top is `#64748b`.
4. **Browser (`tests/deliveryWizardUi.test.mjs:258`).** Update the contract deliberately: assert the selected marker's own colour plus the dashed outline and the `Ulike leveringsvalg på samme sted` label. Keep an equivalent `#64748b` assertion for the unselected stack, so that the mixed overview cue stays covered.
5. **Browse/Edit parity.** In the same stacked fixture, enter Edit mode on the changed occurrence and assert that the fill and dashed state are the same as in browse mode.

## 8. Related observations (separate from the primary issue)

- **R1. Legend ambiguity:** «Valgt», «Samme bilde» and «Ulike leveringsvalg» share the `#64748b` fill (`PhotoMapDisplayCard.js:64-65`). The main-map legend (`MapLegend.js:199`) lists `mixed` but not «Valgt».
- **R2. Colour reuse:** `#64748b` is at the same time the mixed delivery colour (`--gmi-delivery-neutral`), `PHOTO_SIBLING_COLOR`, the unknown provenance colour, and the former «Ikke» colour. This is worth recording for the styling audit. No change is proposed here.
- **R3. Visibility:** the mixed cue on an unselected 16 px camera is a 1.5 px dashed dark stroke, which is hard to see at map zoom levels. Consider this when the design decision in §5 is made.
- **R4. Label versus fill on a mixed top:** the top's accessible name gives its *own* planned status first (for example «Planlagt: Beholdes i GMI»), while the fill shows the aggregate. This is consistent with C5, but in scenario 3 the text describes a different occurrence from the one the user just changed.

## 9. Outstanding uncertainties and manual acceptance

- The private acceptance data was not inspected. Before the fix is approved, confirm on Vercel that the affected markers carry a stack badge (a number) and the label suffix «Ulike leveringsvalg på samme sted». If an affected marker has **no** stack badge, a different cause exists and this diagnosis does not cover it.
- Check whether any affected marker is in Edit mode (C4) or in «Plasseringskilde» mode, where an unknown provenance is also `#64748b`.
- The product owner must decide whether a selected occurrence should show its own colour (the recommendation) or the aggregate.

## 10. Git status and publication

No commits, staging, pushes or branch changes. The only new file is this untracked report, `docs/agent-reports/20261117-084313-foto-marker-colour-regression-diagnosis.md`. The scratch reproduction script is outside the repository, in the session scratchpad.
