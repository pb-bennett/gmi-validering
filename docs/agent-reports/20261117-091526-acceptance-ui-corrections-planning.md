# Acceptance UI corrections: planning (six items)

> **PLANNING — NOT IMPLEMENTED.** This pass was read-only. No application source, tests, configuration or `AGENTS.md` were changed. Nothing was staged, committed, pushed or deployed. No subagents were used. No browser or build was run.

- **Date:** 2026-11-17, Europe/Oslo
- **Repository:** `C:/GitHub/gmi-validering-test`
- **Branch:** `feature/photo-workspace`
- **HEAD:** `a50c7b0` (as expected; the tree was clean at the start)
- **Inputs:** the five accepted corrections, plus a sixth item added during the pass (a positioning-editor button in the FOTO preview)
- **Reports read:**
  - [FOTO Slice 2 completion](20261116-131928-foto-map-interactions-slice2-completion.md)
  - [Validator/Data Table Slice 3](20261116-150610-validator-datatable-slice3.md)
  - [Rettinger laptop layout correction](20261113-191035-rettinger-laptop-layout-correction.md)
  - [Pass 1d hover preview](20261105-1241-photo-workspace-pass1d-ui-refinements.md)

Line numbers below refer to HEAD `a50c7b0`.

## Summary

| # | Correction | Root cause | Status |
|---|---|---|---|
| 1 | Rettinger sidebar width | The shell width is hard-coded to 330 px while Rettinger is active | Confirmed |
| 2 | VertikalDimensjon SJEKK box | Dependency notes render with neutral chrome, but every other surface already treats them as SJEKK | Confirmed |
| 3 | Hover thumbnail missing | The hover tooltip exists only in Miniatyrer mode at zoom ≥ 16. The new persistent preview sits in a pane above the tooltip pane and never closes on a map click | Mechanism confirmed; whether it explains the observation is an assumption (see D1) |
| 4 | Preview dismissal | `closeOnClick={false}` and no map-click handler. This was a deliberate Slice 2 rule ("no map click closes it") | Confirmed |
| 5 | "Samlet levering: …" line | A conditional `<p>` under the counts row | Confirmed |
| 6 | Positioning editor from the preview | New entry point to existing behaviour. The Tools-menu path can be reused unchanged | Feasible |

---

## 1. Rettinger sidebar width

### Findings (confirmed)

- `src/app/page.js:118`: `const [sidebarWidth, setSidebarWidth] = useState(380)` is the shared state. Only the Layer Manager `Sidebar` resizes it, through `Sidebar.js:805-811`, for drag widths between 200 and 800 px.
- `src/app/page.js:945`: `sidebarWidth={workspaceLayer ? 316 : gmiEditActive ? 330 : sidebarWidth}`.
  - The Layer Manager and the Validator (`FieldValidationSidebar`, page.js:956) both use `sidebarWidth`.
  - **Rettinger is pinned to 330 px.** Going from Layer Manager or Validator (380 px by default) into Rettinger therefore narrows the left column by 50 px and moves the map and Data Table left. This comes from `7eba472`.
- `src/components/WorkspaceShell.js:16` applies the width inline to `.workspace-left`. FOTO overrides it in CSS (`photoWorkspace.css:2`, `clamp(292px, 23vw, 316px) !important`). FOTO is not part of this correction and stays as it is.
- The Rettinger right inspector is `clamp(380px, 32vw, 600px)` (`gmiEdit.css:95`). The Data Table bottom dock spans the full `main` width.
- **Contract test:** `tests/validationV2WorkspaceInspector.test.mjs:20` asserts the exact expression, including `gmiEditActive ? 330`.

### Recommendation

Change page.js:945 to `sidebarWidth={workspaceLayer ? 316 : sidebarWidth}`. Rettinger then inherits the current shared width, including any width the user has set by dragging. Rettinger has no resize handle; neither does the Validator, so the two behave the same way.

Do not add a minimum clamp: a clamp would bring back the shift for users who have narrowed the sidebar below the clamp value. See D2.

### Risks

At 1280×720 with the default 380 px:
- The map between the sidebar and the inspector shrinks from about 540 to about 490 px (1280 − 380 − 410).
- The Rettinger table bar gets 900 px instead of 950 px.

The batch inspector content is unchanged, because its width is set independently. The Rettinger sidebar content gets wider, which is low risk. The table bar row (`.gmi-bar-button`) must be checked for wrapping or overflow at 1280×720 and 1366×768.

### Tests

- **Node:** update `validationV2WorkspaceInspector.test.mjs:20` to the new expression. This is a deliberate contract change. Also assert that `gmiEditActive ? 330` is absent.
- **Browser:** at 1280×720 and 1366×768, record the `.workspace-left` width and the `.leaflet-container` left edge in three states: Layer Manager, Validator, and Rettinger (entered through "Åpne i Rettinger"). All three must be equal.
  - Repeat once after dragging the Layer Manager to about 300 px.
  - Rettinger table bar and footer: no horizontal overflow and a single row height.
  - Rerun `gmiR4UxPolishUi`, `gmiValidatorEditingUi` and `validatorDataTableSlice3Ui`.

---

## 2. Validator SJEKK presentation for dependency notes

### Findings (confirmed)

- **Shared mechanism.** `data-validation-tone` plus `.gmi-validation-panel` and `.gmi-validation-accent` (`globals.css:33,35`). `DiagnosticBlock` (`ValidationV2FieldDetailContent.js:293-312`) uses `data-validation-tone={isFail ? 'error' : 'warning'}` with `gmi-validation-panel`, so `Stedfestingsårsak` and other CHECK diagnostics are yellow.
- **The VertikalDimensjon case** (pipe without valid Rørform) produces no finding diagnostic. It produces a `DEPENDENCY_UNRESOLVED` note with `state: null` (`src/lib/validation-v2/diagnostics.js:288-323`).
- **The note is rendered separately.** It appears at `ValidationV2FieldDetailContent.js:417-429` as `<section data-dependency-note=… className="rounded-lg border border-gmi-border bg-gmi-surface-soft … text-gmi-text-muted">`. That is neutral grey chrome.
- **Every other surface already calls it SJEKK:**
  - the rule list status is `CHECK` (`validatorDataTableSlice3.test.mjs`, the `presentation.status.enum === 'CHECK'` assertion);
  - the heading reads "… bør kontrolleres" (`diagnostics.js:607`);
  - the table context sets `status: isDependencyNote ? 'CHECK' : …` (`ValidationV2Workspace.js:304-313`, commented "A prerequisite-blocked result is presented as Sjekk; it is never a Feil");
  - the Slice 3 browser test checks for `/Sjekk/` in the rule button label (`validatorDataTableSlice3Ui.test.mjs:155`).

  The grey box is the only inconsistency.

### Recommendation

Restyle only the note's container, using the existing recipe:
- `data-validation-tone="warning"`
- `className="gmi-validation-panel rounded-lg border px-2 py-1.5"`, the same as `DiagnosticBlock`
- body text `text-gmi-text`, with `text-gmi-text-muted` kept only for guidance, as in `DiagnosticBlock`

Keep `data-dependency-note`, the summary, detail lines, guidance and `OpenObjectsButton` (`Vis N objekt(er)`) unchanged.

**Non-colour cue.** Recommended: reuse `DiagnosticBlock`'s existing header line `Sjekk · N objekt(er)` (`.gmi-validation-accent`), so colour is not the only status indicator. This is a status label, not explanatory text. See D3 if this should be tone-only.

No new colour, tone or special case: the change applies to all dependency notes (Rørform, Material, Tema, and Type blocked by Tema), which are all SJEKK.

### Risks

- The note can now carry `data-validation-tone`. Selectors such as `section[data-validation-tone]` will also match it. The Slice 3 test at `:144` (`closest(...).dataset.validationTone === 'error'`) and `:150` (counts `error` sections only) still hold.
- Any other test that counts `warning` sections on a field with dependency notes would change. Search for `data-validation-tone="warning"` in `tests/validation*` and `tests/validator*` before editing.

### Tests

- **Node:** a source-contract assertion that the `data-dependency-note` section carries `data-validation-tone="warning"` and `gmi-validation-panel`.
- **Browser (extend `validatorDataTableSlice3Ui` "blocked VertikalDimensjon"):**
  - The note has tone `warning`.
  - Its computed background and border equal a CHECK `DiagnosticBlock` on another field, such as `Stedfestingsårsak` or the existing Byggemetode case.
  - It still has no `error` sections.
  - `Vis 1 objekt` still opens exactly Ledning 4.
- **Screenshot:** at 1366×768.

---

## 3. FOTO marker hover thumbnail

### Findings

**Confirmed from code:**
- **Hover exists only in Miniatyrer mode.** The hover preview is a single shared `L.tooltip` (`PhotoMarkersLayer.js:251-257`, class `photo-thumb-preview`, 220 px, `direction: 'top'`, 250 ms delay). It is wired only for markers in **Miniatyrer mode** (`:169`, `if (mode !== 'thumbnails' || !interactive) return`).
  - Miniatyrer applies only at zoom ≥ 16 (`PHOTO_THUMBNAIL_MIN_ZOOM`, `photoMarkerPresentation.mjs:13,212`).
  - In **Markører** mode, which is the default (`usePhotoMapDisplayPreference.js`, fallback `'markers'`), a hover shows only the native `title`.
  - This guard has existed since `8d61232` and was not changed by Slice 2 or `a50c7b0`. The existing hover browser tests (`photoWorkspacePass1dUi`, `photoWorkspaceStacksUi`, `photoWorkspaceEditUi`, `photoDirectionLayerUi`) passed in the Slice 2 run.
- **The persistent preview covers the hover area.** Slice 2 added `WorkspacePreviewPopup` (`:198-228`) in Leaflet's `popupPane` (z 700). The hover tooltip is in `tooltipPane` (z 650), and the photo markers are at z 620 (`photoMapPanes.mjs`). Both open upwards from their marker. The preview is up to 320 px wide (`:315`) and stays open until X or Escape (`closeOnClick={false}`, `:223`). As a result:
  - hovering the selected marker opens its tooltip entirely beneath the preview;
  - tooltips of nearby markers are painted partly or wholly under it;
  - markers physically under the preview cannot receive `mouseenter` at all.
- **The hover is torn down on click.** A marker click calls `clearPreview()` (`:282`), so the hovered marker loses its tooltip when the large preview opens. This is intended ("the transient hover thumbnail gives way to the opened preview").
- **Main map.** Hover is suppressed while a main-map viewer popup is open (`:263`, `.photo-map-viewer-popup`). This is accepted behaviour and unchanged.
- **Hover never selects or changes anything.** `mouseenter` only raises the z-index and schedules the tooltip (`:173`). Stacks show the hovered (top) member.

**Assumption, to be reproduced first:** the observed disappearance is the occlusion by the persistent preview in Miniatyrer mode. If the tester was in Markører mode, nothing regressed: that mode never had a hover thumbnail, and adding one is a new behaviour (D1).

### Recommendation (if the reproduction confirms the occlusion)

1. **Raise the hover tooltip above the preview.** Give it its own pane above `popupPane`:
   - add a constant in `photoMapPanes.mjs`, such as `PHOTO_HOVER_PREVIEW_PANE` with z 710 and `pointer-events: none`;
   - create the pane once in the effect at `:253`;
   - pass `pane` to `L.tooltip`.

   This changes stacking only, with no new visual variant.

   Also extend the edit-mode rule `photoWorkspace.css:201` (`.photo-edit-placing .leaflet-tooltip-pane { visibility: hidden }`) to the new pane. Without that, hover would reappear during click placement.
2. **Skip the hover for the photo the persistent preview already shows.** Pass `photoId` in the hover target, and return early in `open()` when it equals the open preview's photo. This avoids a small copy painted over the large one.
3. **Leave the rest unchanged:** the 250 ms delay, the main-map suppression and the no-selection rule.
4. **Rely on item 4 for markers under the preview.** An empty-map click is now a quick way to clear it.

### Risks

- The pane order is cross-cutting. The Node contract (`photoMapInteractionSlice2.test.mjs:101-102`) asserts that the hover rule is unchanged. Update it only to add the pane.
- A Leaflet tooltip pane created per map must not be created twice under React StrictMode. Guard with `map.getPane(name) || map.createPane(name)`.

### Tests

- **Node:** the tooltip uses the hover pane. `open()` skips the preview's photo. The edit-placing CSS rule covers both panes.
- **Browser (FOTO, Miniatyrer, zoom ≥ 16, 1366×768):**
  - Open the preview on Kum 1, then hover a neighbour: `.photo-thumb-preview` appears, and `document.elementFromPoint` at its centre lies inside the tooltip, not the popup.
  - Hover the selected marker: no hover tooltip.
  - After hovering, the selection (`aria-pressed`), delivery pills, marker `data-lat`/`data-lng` and colours are unchanged.
  - A stack hover shows the top member.
  - In Markører mode, behaviour is unchanged (title only, unless D1 decides otherwise).
  - Main map: hover still works, and is still suppressed while a viewer popup is open.
- **Rerun:** `photoWorkspacePass1dUi`, `photoWorkspaceStacksUi` (one known pre-existing "counts" failure), `photoWorkspaceEditUi` and `photoDirectionLayerUi`.

---

## 4. FOTO large preview dismissal on an empty-map click

### Findings (confirmed)

**Current behaviour:**
- `WorkspacePreviewPopup` sets `closeOnClick={false} closeOnEscapeKey={false}` (`PhotoMarkersLayer.js:223`). Its comment and the Node contract (`photoMapInteractionSlice2.test.mjs:97-99`, "no map-click close") make this a deliberate Slice 2 rule. This correction reverses it; that is an approved change.
- `PhotoMarkersLayer` already has `useMapEvents({ zoomend, resize })` (`:236`). The preview's state is local: `previewOpen` (`:246-249`).

**Why Leaflet's own `closeOnClick` is not enough** (Leaflet 1.9.4):
- `Popup.js:181-182`: `closeOnClick` closes on the map's **`preclick`**.
- `preclick` fires for every click, including marker clicks (`Map.js:1408-1417`). It reaches the map because markers do not listen for `preclick`.
- Turning on `closeOnClick` would therefore close the preview on a marker click. The `remove` → `setTimeout` handler (`:209-212`) would then reset `previewOpen`, so clicking another marker would close the preview instead of moving it. **Do not use `closeOnClick`.**

**How the map's `click` event propagates:**
- Markers have `bubblingMouseEvents: false` (`Marker.js:78`), so a marker click never reaches map `click` listeners (`Map.js:1353-1379` and the target loop).
- Popup content is `disableClickPropagation` (`Popup.js:201`). The preview's X, pill and image never produce a map click.
- The zoom control (`Control.Zoom.js:94`) and the layers control are also `disableClickPropagation`.
- Map drags do not fire `click` (`_draggableMoved`).
- `PhotoMapDisplayCard` and `MapLegend` are rendered outside `MapInner` (`MapView.js:51-54`), so they are not Leaflet events.
- Survey vector clicks bubble to the map but mark `originalEvent._featureClicked` (`MapInner.js:2142-2167`). The existing `MapClickHandler` (`MapInner.js:498-507`) already uses that flag to tell "empty map" from "feature". Measure clicks set `_measureClick`.
- The sidebar list pills are outside the map entirely.

### Recommendation

Extend the existing `useMapEvents` in `PhotoMarkersLayer` with:

```js
click: (event) => { if (!event.originalEvent?._featureClicked && !event.originalEvent?._measureClick) setPreviewOpen(false); }
```

- When the preview is already closed, this is a React no-op.
- It closes only the preview. The selection, list and inspector stay as they are, and focus is not moved.
- Keep `closeOnClick={false}`, X with focus restore, Escape and the edit/filter/selection closes unchanged.
- Update the comments at `:195-197` and `:243-245`.

### Edge cases

| Case | Result | Note |
|---|---|---|
| Double-click zoom on empty map | Closes | It is an empty-map click |
| Measure button | Closes | Inside `MapContainer` without propagation guard; measure mode already calls `map.closePopup()` |
| Gemini WFS feature | Closes | No `_featureClicked` flag; it opens its own popup anyway |
| Survey feature | Stays open | `_featureClicked` |

See D4.

### Tests

- **Node:** the markers layer has a map `click` handler that checks `_featureClicked` and keeps `closeOnClick={false}`. Update the Slice 2 contract comment and assertion.
- **Browser (extend `photoMapInteractionSlice2Ui` §4):**
  - These keep the preview open: zoom `+`/`−`, a preview pill click, a map drag, a click on another marker (the preview moves), a click on a survey line.
  - A click on empty map closes it, with `aria-pressed` still `true` on the row and no delivery or position change.
  - X and Escape still behave as before.
  - Run in both Markører and Miniatyrer modes.

---

## 5. FOTO delivery-summary line

### Findings (confirmed)

- **The line.** `PhotoWorkspaceCollection.js:66-75` defines `photoDeliverySummaryText`. It is computed at `:92` and rendered at `:160` as `<p className="photo-delivery-summary" title="Valgene brukes når …">` only when something is transferred, excluded, included or under review. That is why the list jumps when choices change.
  - Styling: `photoWorkspace.css:61`.
  - No other source file imports the function.
- **The information stays visible.** The counts row (`:157`, `photoDestinationCounts`, built on `photoDeliveryDestinationCounts` in `photoDeliveryChoice.mjs:184-188`) already shows GMI and GML always, and Ikke, Ikke valgt and Gjennomgå when non-zero. Every category in the summary maps into those counts: transfer and include → GML, exclude → Ikke, review → Gjennomgå. The asset-count suffix and the tooltip are lost, as intended.
- **Tests asserting the line:**
  - `photoDeliveryDefaultsUi.test.mjs:85,121,145`
  - `photoDeliveryIntentUi.test.mjs:71,84,104,201`

### Recommendation

- Delete the `<p>`, the `deliverySummary` constant, `photoDeliverySummaryText`, and the `.photo-delivery-summary` CSS rule.
- Add no replacement.
- Keep `deliveryAnnouncement` (the live region) and the counts unchanged.

### Residual risk (not in scope)

The counts row is `flex-wrap`. When "Ikke n", "Ikke valgt n" or "Gjennomgå n" first appears in the 292–316 px FOTO sidebar, the row could wrap onto a second line and still shift the list. Measure this. If it happens, record it for a decision; do not restyle the counts in this slice.

### Tests

- Update the 7 assertions: `.photo-delivery-summary` is absent, and the existing `.photo-delivery-counts` text carries the expected numbers (for example `GML 1`).
- **New browser check:** the photo list's top edge is identical before and after cycling GMI → GML → Ikke → GMI, at 1280×720 and 1366×768.

---

## 6. Positioning editor from the preview

### Findings (confirmed)

- **The preview component** is `src/components/photos/PhotoWorkspaceMapPreview.js`. It renders:
  - the image;
  - X (`PhotoIconButton`, `XIcon`, class `photo-map-popup-close`, absolutely positioned top-right over the image, `photoWorkspace.css:243-245`);
  - the filename and "plassering i av n";
  - `PhotoDeliveryCycleButton`.

  `PhotoMarkersLayer` mounts it through `WorkspacePreviewPopup` (`:314-317`) with `workspace.onToggleDelivery`. The `workspace` object is built in `page.js:1001-1006`.
- **The existing entry point:**
  - Tools menu item `edit` ("Juster plassering og retning", `ArrowsOutCardinalIcon`, `PhotoWorkspaceToolsMenu.js:12`)
  - → `runWorkspaceTool('edit')` (`page.js:448-450`)
  - → `requestWorkspaceAction(enterPhotoEditMode)` (`:338-344`). This leaves removal mode, closes any export handoff, and shows the boundary dialog if unsaved edits exist.
  - → `enterPhotoEditMode()` (`:287-301`). It defaults to `photoWorkspace.activePhotoId`: it makes the layer visible if needed, begins the edit ticket, and pans the selected photo clear of the command bar.
  - `PhotoEditCommandBar.js:51` takes focus on mount.
- **The exact occurrence is already targeted.** The preview always shows `workspace.photoId` (= `activePhotoId`, `PhotoMarkersLayer.js:247-250`), including after stack cycling and for repeated assets. No new state is needed.
- **The preview closes itself on entry.** Entering Edit mode closes it (`previewModel` requires `!workspace.editing`), and the hover tooltip is cleared as the markers remount (`interactive` key change). Entering Edit mode changes neither delivery, position nor metadata; GML proposals arise only from an actual move (`photoMoveProposesTransfer`).
- **Delivery status does not matter.** Editability does not depend on delivery status, so GMI, GML and Ikke all behave the same.

### Recommendation

1. Add an `onEditPlacement` field to the `workspace` object in `page.js:1001-1006`:
   - its value is `() => runWorkspaceTool('edit')`, the same path as the Tools menu;
   - pass it through `WorkspacePreviewPopup` to `PhotoWorkspaceMapPreview`.
2. In the preview, add `<PhotoIconButton icon={ArrowsOutCardinalIcon} label="Juster plassering og retning" tooltip="Juster plassering og retning" onClick={onEditPlacement} className="photo-workspace-map-preview-edit" />` before X. It uses Phosphor Regular, the icon already established for this concept, and gets the tooltip on hover delay and immediately on focus from `PhotoIconButton`.
3. **Position it with the existing overlay recipe.** Add `.photo-workspace-map-preview-edit.photo-icon-button` to the selector lists at `photoWorkspace.css:243-245`, with its own `right: 40px` (8 + 28 + 4 px gap).
   - Do not change `.photo-map-popup-close` positioning: the main-map viewer popup shares that class.
   - Add no new colours.
4. **Event propagation.** Popup content is already `disableClickPropagation`, so the click cannot dismiss the preview (item 4) or select a marker. No extra `stopPropagation` is needed. Keyboard access is a native button, and Tab order is the edit button, X, then the pill.
5. Render it only when `onEditPlacement` is provided. The preview only exists in FOTO browse mode.

### Risks

- The Slice 2 Node contract ("image, filename, close and the shared delivery cycle pill only", `photoMapInteractionSlice2.test.mjs:92-104`) must be updated deliberately to allow exactly this one extra control.
- With an export handoff open ("Fullfør opplysninger"), the button closes the flow, exactly as the Tools-menu item does. This keeps the shared guard and adds no new rule.

### Tests

- **Node:** the preview contains the edit button with that icon and label. The page passes `onEditPlacement` built from `runWorkspaceTool('edit')`, not a second `enterPhotoEditMode` path.
- **Browser:**
  - From the preview on Kum 1 (a repeated asset) and on a non-top stack member, reached through stack cycling: the button enters Edit mode with `[data-edit-target]` = that photo id.
  - The preview has closed, the command bar has focus, and the delivery pill text and marker position are unchanged.
  - Repeat with the occurrence set to GMI, GML and Ikke.
  - Discard restores the state.
  - Keyboard: Tab to the button, the tooltip shows on focus, and Enter enters Edit mode.
  - The button row does not overlap the image edge at 1280×720 and 1366×768, and the preview stays within the map.

---

## Implementation boundaries and order

**One focused Sol Medium slice is safe**, provided D1 is answered first. Use **four commits** so that each contract change is reviewable on its own:

1. `fix(foto): remove redundant delivery summary line` (item 5): Collection, CSS and the two delivery UI tests.
2. `fix(validator): present dependency notes as Sjekk` (item 2): FieldDetailContent and the Slice 3 tests.
3. `fix(rettinger): keep the shared sidebar width` (item 1): page.js:945 and the inspector contract test.
4. `feat(foto): preview dismissal, hover above preview and edit entry` (items 4, 3, 6): these share `PhotoMarkersLayer.js`, the preview and the Slice 2 contract test, so they belong together.

Optionally, item 3 can be moved to a fifth commit if the reproduction turns out differently.

The FOTO sidebar width, the counts row, main-map popups, edit-mode internals, delivery logic and Validator rule semantics are out of scope.

## Verification strategy

- **Node (targeted):** `node --test tests/photoMapInteractionSlice2.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/validatorDataTableSlice3.test.mjs tests/photoDeliveryPlanning.test.mjs`, plus any new contract test. Then the full serial `node --test --test-concurrency=1 "tests/*.test.mjs"`.
- **Expected pre-existing failures:**
  - `validationV2GmiA7` "Validator exposes only the automatic V2 workflow";
  - `photoWorkspaceStacksUi` "counts";
  - CRLF checkout: one extra source-contract failure (see memory notes).

  Confirm that these failures are pre-existing before calling them so.
- **Lint:** ESLint on touched JS/MJS. `MapInner.js` is not expected to be touched; it has known pre-existing errors.
- **Build:** `npm run build` (shared map, page and Validator code).
- **Browser:** a fresh production build on a free task-owned port, serial. Run:
  - `photoMapInteractionSlice2Ui` (extended), `photoDeliveryDefaultsUi`, `photoDeliveryIntentUi`
  - `photoWorkspacePass1dUi`, `photoWorkspaceStacksUi`, `photoWorkspaceEditUi`, `photoDirectionLayerUi`
  - `validatorDataTableSlice3Ui`, `gmiR4UxPolishUi`, `gmiValidatorEditingUi`, `deliveryWizardUi`

  Inspect screenshots at 1280×720 and 1366×768 for the Rettinger shift, the note tone, the preview button row and the list stability.
- **Checks:** `git diff --check`.
- **Manual acceptance (real files, after deploy):**
  - Layer Manager ↔ Validator ↔ Rettinger: no horizontal shift.
  - VertikalDimensjon note shown in yellow.
  - Miniatyrer hover with the preview open.
  - Empty-map click closes the preview.
  - Edit button on a GMI, a GML and a stacked photo.
  - The list does not jump when delivery choices change.

## Outstanding decisions and risks

- **D1 (needed before item 3): which display mode was the tester in?**
  - If **Miniatyrer**, the occlusion fix above restores the hover.
  - If **Markører** (the default), there has never been a hover thumbnail there. Adding one for camera markers is a new behaviour. Recommendation: confirm with the user. Keep it out of scope unless approved; if approved, reuse the same tooltip by removing the `mode !== 'thumbnails'` guard and dropping the native `title` in both modes.
- **D2: no minimum width for Rettinger.** If the shared width is very small, the Validator and Rettinger are both cramped; this is an existing condition. Recommendation: accept it and record it.
- **D3: the "Sjekk · N objekt(er)" accent header on dependency notes.** Recommended for a non-colour cue. The alternative is tone-only.
- **D4: double-click zoom and Gemini WFS clicks close the preview.** Recommendation: accept, as consistent with "empty map / not a survey feature".
- **Risk: the counts row may wrap** at FOTO widths after item 5. Measure it; do not fix it here.
- **Risk: contract tests change deliberately:** `validationV2WorkspaceInspector:20`, the Slice 2 preview contract, and the 7 delivery-summary UI assertions. Each needs equivalent coverage.

## AGENTS.md: redundant UI text

`AGENTS.md` does **not** cover this explicitly. The closest rules are "Show hierarchy", "Keep the three densities separate" and "Fail closed with an explanation". Recommended addition, to be made in the implementation slice under *UI design and styling standards → Implementation*:

> - Do not add helper text, explanatory paragraphs, placeholders or summary lines that restate information already visible (counts, labels, status, tooltips). State each fact once, where it applies. Required safety, blocking and fail-closed explanations are exempt.

## Sol Medium implementation brief

> **GMI Validator — Acceptance UI corrections (implementation).** Model: Sol Medium. Branch `feature/photo-workspace`, expected HEAD `a50c7b0` (verify branch, HEAD and clean tree first). Plan: `docs/agent-reports/20261117-091526-acceptance-ui-corrections-planning.md` (read it; line references are at `a50c7b0`). Read root `AGENTS.md`. No subagents. Commit only if authorised; do not push or deploy.
>
> **Before item 3:** confirm D1 with the user (Miniatyrer occlusion versus Markører hover). Implement the occlusion fix only, unless Markører hover is approved.
>
> 1. **Item 5.** Remove `photoDeliverySummaryText`, `deliverySummary` and the `<p className="photo-delivery-summary">` from `PhotoWorkspaceCollection.js`, and the CSS rule at `photoWorkspace.css:61`. No replacement. Update `photoDeliveryDefaultsUi` (85, 121, 145) and `photoDeliveryIntentUi` (71, 84, 104, 201) to assert absence and use the counts. Add a list-top stability check while cycling delivery.
> 2. **Item 2.** In `ValidationV2FieldDetailContent.js:417-429`, give the dependency-note section `data-validation-tone="warning"` and the `DiagnosticBlock` container classes (`gmi-validation-panel rounded-lg border px-2 py-1.5`, body `text-gmi-text`). Add the existing `Sjekk · N objekt(er)` accent line (D3). Keep `data-dependency-note`, the text and `Vis N objekt(er)`. Extend `validatorDataTableSlice3Ui` with tone and computed-colour parity against a CHECK diagnostic.
> 3. **Item 1.** `page.js:945` → `sidebarWidth={workspaceLayer ? 316 : sidebarWidth}`. Update `validationV2WorkspaceInspector.test.mjs:20`. Browser: equal `.workspace-left` width and map left edge across Layer Manager, Validator and Rettinger at 1280×720 and 1366×768; Rettinger table bar without overflow.
> 4. **Item 4.** In `PhotoMarkersLayer`, add a map `click` handler to the existing `useMapEvents`. It calls `setPreviewOpen(false)` unless `originalEvent._featureClicked` or `_measureClick` is set. Keep `closeOnClick={false}`; do not use Leaflet's `closeOnClick`, which would close on marker clicks through `preclick`. Selection and focus stay unchanged. Update comments and the Slice 2 contract.
> 5. **Item 3 (after D1).** Create a `PHOTO_HOVER_PREVIEW_PANE` (z 710, `pointer-events: none`, `getPane || createPane`) and give the hover `L.tooltip` that pane. Skip the hover for the photo the open preview shows. Extend `photoWorkspace.css:201` to hide the new pane while placing. Keep the delay, the main-map suppression and the no-selection rule.
> 6. **Item 6.** Add `onEditPlacement: () => runWorkspaceTool('edit')` to the workspace object (`page.js:1001-1006`) and pass it to `PhotoWorkspaceMapPreview`. Add a `PhotoIconButton` (`ArrowsOutCardinalIcon`, label and tooltip "Juster plassering og retning") before X. Position it by adding `.photo-workspace-map-preview-edit` to the `photoWorkspace.css:243-245` selectors with `right: 40px`; do not move `.photo-map-popup-close`. No other workflow, no state copies. Browser: the exact occurrence (repeated asset and stack member), GMI/GML/Ikke, delivery and position unchanged, command bar focused, keyboard and tooltip, no overlap at both laptop sizes.
> 7. Add the AGENTS.md bullet on redundant UI text (see the plan).
>
> **Verification:** targeted Node tests, the full serial Node run, ESLint on touched files, `npm run build`, and the listed browser suites serially on a fresh production build on your own port, with screenshots at 1280×720 and 1366×768. Run `git diff --check`. Report passed, failed (with pre-existing evidence) and skipped separately. Suggested commits: item 5; item 2; item 1; items 4+3+6. Write a timestamped completion report in `docs/agent-reports/`.

## Git status

At the end of this pass, `feature/photo-workspace` at `a50c7b0`. The only change is this new untracked report.
