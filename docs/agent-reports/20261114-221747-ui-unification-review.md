# Application-wide UI unification review (PLANNING DRAFT)

**Status: review and planning only. Nothing in this report is implemented.** Written 2026-11-14 (Europe/Oslo) in `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `091f92d` (as expected). No application code, CSS, tests, `AGENTS.md` or existing reports were changed. No subagents were used.

## 1. Executive assessment

- **The newest surfaces are good and mutually consistent.** The delivery wizard, the Rettinger batch inspector (A1/A2), the FOTO tools menu, the exclusion confirmation and the Data Table row states (A7) behaved as their reports describe on a fresh production build. They should be treated as the reference patterns, not reworked.
- **The application is not yet one product visually.** It is three generations of UI side by side: the pre-overhaul overlay modals and analysis panels, the S1–S12 shell, and the November FOTO/Rettinger/wizard work. The seams show in four places: dialogs, primary and selected-state colours, module entry/exit, and map chrome.
- **Three findings are functional, not cosmetic:**
  1. Escape in the FOTO «Fjern fra laget» confirmation leaves the destructive dialog open and armed while it silently cancels the mode behind it (reproduced; the photos were then removed with one click).
  2. Six older modals have no dialog semantics: Escape does nothing and focus is neither moved in nor contained (four reproduced in the browser).
  3. Map controls overlap at laptop widths: «Inspiser data» covers «Gemini WFS» at 1280 and 1366, and in Rettinger at 1366×768 the toolbar's right cluster covers the «3D-visning» tab.
- **Most remaining inconsistency comes from four undecided recipes**, not from many independent defects: primary colour, selected-control colour, disabled state and native-control accent. Deciding them once removes three scoped override blocks and most per-module restyling.
- **Recommended shape of the work:** several small slices after real-file acceptance (section 6), not one pass. One slice (the removal-dialog Escape fix) is isolated enough to do before acceptance if you want it.

## 2. Method and evidence labels

- **Read:** root `AGENTS.md`; the styling consolidation report (`20261114-130507`); the UX consolidation plan (`20261114-160730`); the roadmap reconciliation (`20261113-182754`); completion reports A1–A7 and FOTO exclusion slices 1–3.
- **Source inspection:** `globals.css`, `photoTheme.css`, `gmiEdit.css`, `photoWorkspace.css`, `deliveryWizard.css`, `page.js`, `MapPaneToolbar.js`, `TabSwitcher.js`, `WorkspaceShell.js`, `ProductHeader.js`, `LayerPanel.js`, `ValidationV2RuleList.js`, `ValidationV2Workspace.js`, `GmiConfirmDialog.js`, `RemovePhotosConfirmation.js`, `PhotoWorkspaceCollection.js`, `PhotoExclusionActions.js`, `PhotoIconButton.js`, `photoIconTooltip.js`, `photoDeliveryIntent.mjs`, `photoMarkerPresentation.mjs`, plus repository-wide greps for dialogs, Escape handlers, native controls, close controls, icons and colour literals.
- **Browser inspection:** an isolated production build of HEAD (`git archive HEAD` into the session scratch directory, own `.next`, port 3391), driven in headless Chrome over CDP with synthetic fixtures only: one generated GMI (26 lines, 34 points, deliberate gaps) and ten generated 1×1 px PNGs with EXIF GPS. Viewports 1280×720, 1366×768 and 1920×1080.
- **Walked through:** landing; main view and layer card; Validator rule list, expansion, field inspector and contextual table; selection handoff to Rettinger; batch Oppsett → Forhåndsvis → risk dialog → Lagt til; change list; delivery wizard (Kun GMI all three steps, Samlet levering to a blocked Kontroll); photo import wizard; FOTO workspace, tools menu, removal mode, exclusion mode, delivery planning mode; legend and Lagmarkering; four older modals.
- **Evidence labels used below:**
  - **[B]** observed in the browser on that build;
  - **[C]** confirmed in source;
  - **[H]** hypothesis that needs the real file or a decision.

Limits are listed in section 9. In short: synthetic data only, no screen reader, no numeric contrast measurement, hover states checked in source only.

Screenshots (synthetic fixtures; public Kartverket basemap) are in [`assets/20261114-221747-ui-unification-review/`](assets/20261114-221747-ui-unification-review/).

## 3. Findings

### P0: functional, accessibility or safety

#### F1. Escape does not cancel the FOTO removal confirmation, and the dialog stays armed [B][C]

- **Where:** FOTO → Verktøy → «Fjern bilder fra laget…» → select photos → «Fjern … fra laget» → confirmation.
- **Observed:** with focus on «Avbryt», Escape left the dialog open. Behind it the workspace switched from `remove` to `browse` mode and the checkboxes disappeared. Clicking «Fjern fra lag» afterwards still removed both photos (11 rows → 9). Screenshot: [`27-foto-removal-after-escape-1366.png`](assets/20261114-221747-ui-unification-review/27-foto-removal-after-escape-1366.png).
- **Cause:** the dialog is rendered inside the collection `<section>`, whose `onKeyDown` handles Escape for the selection modes and calls `preventDefault()` (`PhotoWorkspaceCollection.js:157`). Preventing the keydown suppresses the native `cancel` event, so `RemovePhotosConfirmation`'s `onCancel` (`RemovePhotosConfirmation.js:14`) never runs. The newer exclusion confirmation avoids this by stopping Escape propagation (`PhotoExclusionActions.js:28`).
- **Second defect in the same dialog [B][C]:** «Fjern fra lag» carries the class `photo-remove-confirm`, but no CSS rule exists for it. The destructive action renders exactly like «Avbryt» (computed `color rgb(49,65,88)`, transparent background, neutral border).
- **Consequence:** the universal cancel key does not cancel a destructive confirmation, and the confirmation no longer matches the state behind it.
- **Recommendation:** stop Escape propagation in `RemovePhotosConfirmation` as the exclusion dialog does (or skip the section handler while `confirmRemoval` is set), and give the confirm button the red destructive treatment. Add a browser assertion: Escape closes the dialog, the mode and selection are unchanged, focus returns to the opener.
- **Risk:** low. Two small edits in a file that is not part of A1–A7 or slices 1–3.

#### F2. Older modals have no dialog semantics, Escape or focus management [B][C]

- **Where:** «Inspiser data» (`DataDisplayModal.js`), WMS settings (`WmsLayerModal.js`), «Del app» (`ShareQrModal.js`), «Legg til nytt lag» (`page.js:1085-1113`). Same construction in `ZValidationModal.js` and `StandardsInfoModal.js` (source only).
- **Observed [B]:** all four are `div.fixed.inset-0` overlays with no `role="dialog"`. Escape left every one open. Focus stayed on the element behind the overlay in three of four; Tab left the overlay in «Inspiser data» and «Legg til nytt lag». Screenshot: [`37-modal-inspiser-data-1366.png`](assets/20261114-221747-ui-unification-review/37-modal-inspiser-data-1366.png).
- **Source [C]:** none of the six files contains `role="dialog"`, `aria-modal` or an Escape handler. By contrast, fourteen newer components call `showModal()` on a native `<dialog>`, with `onCancel` and opener restoration.
- **Consequence:** keyboard users can tab into the page behind an open modal and cannot dismiss it with Escape. This breaks the `AGENTS.md` rule "Dialogs keep Escape, focus containment and focus restoration", and it is the largest behavioural difference between old and new surfaces.
- **Recommendation:** migrate these six to native `<dialog>` through one shared helper (see C1 in section 5). Start with the three small ones.
- **Risk:** low for add-layer, share and WMS; medium for `DataDisplayModal` (835 lines; `dataInspectorStacking` and `dataInspectorConstrainedHeight` tests are contracts).

#### F3. Map controls overlap at laptop widths [B][C]

Measured in normal mode (not test mode):

| View | Viewport | Map pane | Overlap |
|---|---|---|---|
| Main | 1280×720 | 900 px | «Inspiser data» covers 81 px of «Gemini WFS» |
| Main | 1366×768 | 986 px | «Inspiser data» covers all of «Gemini WFS» (101 px) and 19 px of «WMS» |
| Main | 1920×1080 | 1540 px | none |
| Rettinger | 1280×720 | 540 px (narrow) | none |
| Rettinger | 1366×768 | 599 px (constrained) | «Del app» (643–681) and «Nullstill og åpne ny fil» (687–846) lie over «3D-visning» (635–750) |
| Rettinger | 1920×1080 | 990 px | none |

- **Screenshots:** [`35-main-normal-1366.png`](assets/20261114-221747-ui-unification-review/35-main-normal-1366.png), [`10-rettinger-batch-setup-1366.png`](assets/20261114-221747-ui-unification-review/10-rettinger-batch-setup-1366.png).
- **Cause, bottom-left [C]:** three independently positioned siblings in `page.js:1020-1075`. The zoom box is `left-4`, the Gemini/WMS pair is `left-28`, and «Inspiser data» is `left: calc(50% - 320px)` with `-translate-x-1/2`. The magic offset collides with the fixed cluster whenever the pane is narrower than about 1000 px.
- **Cause, toolbar [C]:** `MapPaneToolbar.js` places three clusters absolutely (`left-11`, `left-1/2`, `right-0`), so nothing prevents them meeting. Compact tab labels apply only in `NARROW` mode (`compact = paneMode === MapToolbarMode.NARROW`); `CONSTRAINED` keeps the full «Kartoversikt / 3D-visning» labels and the 159 px «Nullstill og åpne ny fil» button. The A5 report measured the same overlap at 1600×900.
- **Also observed [B]:** the expanded «Tegnforklaring» covers Leaflet's basemap selector ([`34-main-legend-highlight-1366.png`](assets/20261114-221747-ui-unification-review/34-main-legend-highlight-1366.png)). In test mode the Testmodus control also covers the tab switcher; that affects testers only.
- **Consequence:** at the two laptop target sizes a control is partly or wholly unreachable by mouse: «Gemini WFS» in the main view, «3D-visning» in Rettinger at 1366.
- **Recommendation:**
  - Bottom-left: one flex row owned by one element (zoom, Gemini WFS, WMS, Inspiser data) instead of three absolute siblings.
  - Toolbar: lay the bar out as a three-column grid (`auto 1fr auto`) so clusters cannot overlap, use compact tab labels in `CONSTRAINED` as well, and move «Nullstill og åpne ny fil» into the existing overflow menu in `CONSTRAINED`.
- **Risk:** low to medium. `mapPaneToolbar.test.mjs` and `rettingerPhotoVisibilityUi` assert toolbar structure; the A5 toggle position must be preserved.

### P1: significant cross-workflow inconsistencies

#### F4. The three modules are entered, named and left in three different ways [B][C]

| | Entry | Name shown | Header | Exit |
|---|---|---|---|---|
| Validator | Unlabelled icon in the layer's «Analyse» row, native `title` «Feltvalidering» (`LayerPanel.js:222`) | «Validator · Original» (`ValidationV2Workspace.js:414`) | Title + `XIcon` at right | «Lukk Validator» (X) |
| Rettinger | Icon-only pencil in the layer row, custom tooltip «Rettinger: rett feltverdier» (`LayerPanel.js:557`) | Kicker «RETTINGER» + layer name | Bordered back arrow at left | «Tilbake til appen» |
| FOTO | Labelled button «Bildemodul» on the photo layer card | Layer name only; «Bildemodul» in labels, «FOTO» in badge and copy | Bordered back arrow at left | «Tilbake til appen» |

- **Consequence:** the Validator is the application's core function but has the least visible entry, a different name at the entry than in the header, and a close affordance that differs from the other two workspaces. A new user cannot predict where a module starts or how to leave it.
- **Recommendation:** make the Rettinger/FOTO workspace header the standard (back arrow at left, kicker with the module name, title, status line) and apply it to the Validator. Use one name per module everywhere: «Validator» (retire «Feltvalidering» as a label), «Rettinger», and either «FOTO» or «Bildemodul» (decision D5). Keep the entry icons, but give all three the same control type and tooltip behaviour (F10).
- **Risk:** low to medium. `gmiValidatorEditingUi` U1 asserts the aligned Lag/Datasett/Kontrolldato header; tests select «Lukk Validator» by label.

#### F5. Selected state has five visual treatments, two of them side by side [B][C]

| Treatment | Where |
|---|---|
| Grey fill (`.gmi-selected-control`, `globals.css`) | Validator Punkter/Ledninger, field inspector Resultat/Regel, Data Table Punkter/Ledninger and Utvalg/Alle, map Kart/3D |
| Solid teal fill | Data Table Original/Foreslått/Kun endrede and Filtrert visning/Bare valgte |
| Teal underline | Rettinger Filter/Endringer (`gmiEdit.css:54-56`), wizard steps |
| Cyan-soft fill + teal edge | FOTO Markører/Miniatyrer, radio cards in both wizards, «Vis bilder» toggle (`photoTheme.css`) |
| Delivery colour fill | FOTO GMI / GML / Ikke med |

- **Observed [B]:** in the Rettinger table bar «Punkter» is grey-selected and, 10 px to its right, «Original» is teal-selected ([`10-rettinger-batch-setup-1366.png`](assets/20261114-221747-ui-unification-review/10-rettinger-batch-setup-1366.png)). The solid teal segments also read as primary buttons.
- **Recommendation:** two patterns only.
  - *Segmented choice inside a bar:* cyan-soft fill, teal edge, navy text. This is what `AGENTS.md` already names as the selection surface and what `photoTheme.css` implements.
  - *Panel tabs that swap a panel's content:* teal underline (Rettinger, wizard steps).
  - The delivery toggle keeps its semantic colours (it shows a destination, not a selection style).
- **Decision needed (D2):** redefining `.gmi-selected-control` is a global recipe change.
- **Risk:** medium. Computed-colour assertions exist for some of these controls.

#### F6. Four action colours compete for "primary" [B][C]

- **Navy** (global `.gmi-primary-control`): landing «Velg fil», Sidebar (5 uses), LayerManager, MapView, WMS, Standards, Contact, 3D, Gemini.
- **Teal** by scoped override: FOTO (`photoTheme.css:13`), Rettinger inspector and table selection bar (`gmiEdit.css:106`), legacy batch dialog (`gmiEdit.css:192`), delivery wizard; also the floating «Statistikk» button.
- **Orange-800** «Godkjenn og legg til» in the Rettinger risk dialog (`gmiEdit.css:389`), an undocumented variant ([`13-rettinger-risk-dialog-1366.png`](assets/20261114-221747-ui-unification-review/13-rettinger-risk-dialog-1366.png)).
- **Consequence:** the same user meets a navy primary on the landing page and teal primaries in every workflow after it.
- **Recommendation:** settle open decision 1 now: teal as the single primary, implemented in the global recipe with the existing `color-mix` hover and pressed shades, then delete the three scoped overrides. Keep the risk-approval button as a deliberate, documented variant (it is approval of a flagged risk, tested, and visually distinct from destructive red); add it to `AGENTS.md` so it stops being an exception nobody recorded.
- **Decision needed (D1).** **Risk:** low to medium (computed `rgb(0, 117, 149)` assertions already expect teal in FOTO and Rettinger; navy assertions, if any, must be found first).

#### F7. Confirmation dialogs are five separate implementations [B][C]

- `GmiConfirmDialog` (Rettinger, Data Table): 8 px radius, no header or close control, Cancel focused, red or risk-orange confirm.
- `RemovePhotosConfirmation`: own CSS (`photoWorkspace.css:222`), 8 px radius, unstyled destructive button, broken Escape (F1).
- Exclusion confirmation (`PhotoExclusionActions.js`): header with `XIcon`, own class, own focus trap.
- `PhotoEditBoundaryDialog`, and an inline `<dialog>` in `GeminiReferenceCard.js:118`.
- Also `window.confirm` / `window.alert` in `FileUpload.js:184,277`.
- The two measured (Rettinger confirmation, FOTO removal) use an 8 px radius, while the wizard dialogs use 16 px, which is the `AGENTS.md` value for dialogs.
- **Consequence:** F1 exists because each confirmation re-implements Escape and focus. Visual differences (radius, header, destructive colour) make the same question look different in each module.
- **Recommendation:** one shared confirmation component (C2 in section 5), adopted by the four custom ones. Leave `window.confirm` for the coordinate-zone question until the upload flow is touched.
- **Risk:** low to medium; tests address `data-gmi-confirm`, `.photo-remove-confirmation` and `.photo-exclusion-confirmation`, so keep those hooks.

#### F8. «Ikke med» means two different things [B][C]

- **Observed [B]:** with two unlinked photos not selected for GML, the FOTO list shows two «Ikke med» pills and the planning bar counts «Ikke med 2». The wizard's Innhold step for the same layer says «0 er valgt Ikke med i leveransen».
- **Source [C]:** the pill and legend map both `not-selected` and `exclude` to «Ikke med» / «Ikke med i leveransen» (`photoMarkerPresentation.mjs:118-126`). The filter labels already distinguish them: «Ikke valgt», «Ikke med i leveransen», and the aggregate «Ikke med» (`photoDeliveryIntent.mjs:38-40`).
- **Consequence:** the user cannot tell "I took this placement out of the delivery" from "this photo was never part of it", and the counts in FOTO and in the wizard do not reconcile.
- **Recommendation:** use the existing filter vocabulary in pills, legend and planning counts: «Ikke valgt» for unlinked photos that are not selected, «Ikke med» only for an explicit exclusion. Presentation only; no model change.
- **Risk:** low in code, but it changes text asserted by slice 1–3 tests. After acceptance.

#### F9. Removing a photo from the layer is not explained as different from excluding it [B][H]

- **Observed [B]:** I removed a photo that a GMI line links to. Samlet levering was then blocked at Kontroll: «En bildelenke som beholdes i GMI mangler en entydig originalfil. Last inn riktig bilde …» ([`32-wizard-samlet-review-1280.png`](assets/20261114-221747-ui-unification-review/32-wizard-samlet-review-1280.png)). The removal confirmation had only said «Originalfilene på disken endres ikke».
- **What already works:** the tools menu separates «Velg bilder som ikke skal med…» (Eksport group) from the red «Fjern bilder fra laget…»; the exclusion bar says «Leveringsvalg er forskjellig fra Fjern fra laget».
- **Gap:** the warning is on the non-destructive side only. The removal dialog does not say that GMI links to the removed photo stay in the file and will need the photo again at delivery.
- **[H]:** whether a removed *point*-linked placement blocks delivery the same way was not tested; slice 1 says removed-placement links take part in asset derivation, so it is likely.
- **Recommendation:** when the removal selection includes GMI-linked placements, add one line to the confirmation: the links stay in the GMI file, and «Ikke med» is the way to leave a photo out of the delivery. No behaviour change.
- **Risk:** low.

#### F10. Two tooltip and naming systems for icon-only controls, mixed in the same row [B][C]

- **Observed [B]:** the GMI layer row has two `PhotoIconButton` controls (custom tooltip, `aria-label`, no `title`) followed by three bare buttons with native `title`. The «Analyse» row below has seven icon-only buttons with native `title`; five have no `aria-label` at all. The map toolbar mixes native-`title` buttons with the `PhotoIconButton` photo toggle.
- **Source [C]:** `title=` occurs 24 times in `LayerDataTable.js`, 12 in `LayerPanel.js`. `AGENTS.md` names `PhotoIconButton` as the standard and forbids native `title` on icon-only controls.
- **Consequence:** tooltips appear at different delays and positions for adjacent buttons; keyboard focus shows a tooltip for some and none for others.
- **Recommendation:** move `PhotoIconButton` and its tooltip to a neutral shared folder (C3) and convert the layer row, the «Analyse» row and the map toolbar. Leave `title` on truncated table cells; that is a different purpose.
- **Risk:** low; some tests select by `button[title=…]` and need stable `data-*` hooks first.

### P2: worthwhile unification and usability

#### F11. Destructive and reset actions are styled by habit, not by consequence [B][C]

- «Forkast» (one correction) is a red link with a trash icon; «Forkast alle» (all corrections) is a plain navy underlined link ([`15-rettinger-changes-1366.png`](assets/20261114-221747-ui-unification-review/15-rettinger-changes-1366.png)).
- «Fjern fra lag» (confirm removal) is neutral (F1). «Fjern lag» is a trash icon with red hover.
- «Nullstill og åpne ny fil» discards the whole session but is a neutral toolbar button with `ArrowClockwiseIcon`; «Nullstill filtre» uses `ArrowCounterClockwiseIcon` (open decision 10).
- **Recommendation:** promote `.gmi-edit-destructive` to a global `gmi-` recipe and apply it by consequence: anything that discards work or removes data is red; resets of view state are neutral. Do not rename the verbs (see section 8).
- **Risk:** low.

#### F12. Validator: seven rules visible at 1366×768, and «Pass» where the rest of the app says «OK» [B][C]

- **Observed [B]:** Lag, Datasett, Kontrolldato, the Foreslått hint, the geometry tabs, the summary line, the Tema/S_FCODE notice and the filter row take about 340 px before the first rule; the list starts at y ≈ 413 of 768 ([`05-validator-1366.png`](assets/20261114-221747-ui-unification-review/05-validator-1366.png)).
- **Vocabulary [C]:** the expanded rule shows «Pass» (`ValidationV2RuleList.js:97`) and the status filter offers «Pass» (`ValidationV2Workspace.js:576`), while the same row's `aria-label` says «OK», and Rettinger, the Data Table and `AGENTS.md` use FEIL / SJEKK / OK.
- **Recommendation:** show Lag · Datasett · Kontrolldato as one compact summary row that expands to the three fields (they change rarely); show «OK» wherever a user sees the outcome. Internal keys such as `Pass` in `fieldData.js` can stay.
- **Risk:** medium for the header (U1 alignment contract, Kontrolldato naming); low for the label.

#### F13. Rettinger at laptop sizes: three stacked bars above three table rows [B]

- **Observed [B]:** at 1366×768 the table dock is 292 px. The table header bar, the selection sentence («Tilbake til Validator · … 3 objekter valgt i Validator. 3 valgt · 3 vises · 3 treffer filter/søk/visning · 0 utenfor»), the Filtrert/Bare valgte segment, «Fjern utvalg» and a separate full-width «Masseendring pågår · se panelet til høyre» button leave room for three to four rows.
- «Masseendring pågår» is still shown after the batch is staged ([`15-rettinger-changes-1366.png`](assets/20261114-221747-ui-unification-review/15-rettinger-changes-1366.png)).
- **Recommendation:** show only non-zero counts, put the batch-status control in the selection row, and hide or reword it once the batch is staged.
- **Risk:** medium; this is `LayerDataTable.js` selection-bar code from H2/H3/B1 with many browser contracts. After acceptance.

#### F14. Density differs between surfaces that share one shell [B][C]

- **Wizards [B]:** the photo import wizard renders 16 px body text, a 24 px/700 heading and 40 px buttons; the delivery wizard in the same `.photo-collection-dialog` shell is visibly more compact (about 13 px text; judged from the screenshots, not measured) ([`21-foto-import-files-1366.png`](assets/20261114-221747-ui-unification-review/21-foto-import-files-1366.png) against [`18-wizard-package-1280.png`](assets/20261114-221747-ui-unification-review/18-wizard-package-1280.png)). `AGENTS.md` puts wizards in the compact density. «Velg alle / Fjern valg / Fjern valgte (0)» in the import wizard look like plain text, not buttons.
- **FOTO inspector [B]:** «Ta ut alle plasseringer av bildet» renders at 16 px among 12–13 px siblings, because the link inherits the inspector's 16 px base ([`23-foto-workspace-1366.png`](assets/20261114-221747-ui-unification-review/23-foto-workspace-1366.png)).
- **FOTO exclusion mode at 1280×720 [B]:** the mode bar and the action panel leave 269 px (about four rows) for the photo list ([`28-foto-exclusion-mode-1280.png`](assets/20261114-221747-ui-unification-review/28-foto-exclusion-mode-1280.png)).
- **Recommendation:** fix the inspector link size (one rule, slice 2 code, so after acceptance); bring the import wizard's steps to the delivery wizard's type scale; tighten the exclusion action panel (counts on one line).
- **Risk:** low for the link; medium for the import wizard (`photoDialogLayout` contracts).

#### F15. Warning has at least four hues [B][C]

- Validation orange (`--gmi-validation-warning-*`: panels, Validator notice), compact yellow-700 (counts, SJEKK icons), Rettinger amber literals (`#e5c07b`, `#fff8e6`, `#7a4f00`, dashed `#b7791f`: «Ikke lastet ned», «Overskrev verdi»), and the wizard's amber «Eksperimentell» panel.
- This is open decision 4 from the styling report; the browser pass confirms all four are visible within one export task.
- **Recommendation:** do not add a hue. Decide whether Rettinger's amber pills and the wizard note map onto the validation warning tokens (D4), then change them in one token-only slice.
- **Risk:** low in code; it is a visible colour change and needs approval.

#### F16. No shared disabled state for secondary buttons [C]

- `.gmi-compact-button` has a hover rule but no `:disabled` rule (`globals.css`). Disabled looks are re-implemented per module (`.gmi-bar-button:disabled`, the FOTO theme, `.gmi-individual-selection`) or absent.
- **Recommendation:** add `:disabled` (and `[aria-disabled='true']`) to the global recipe: reduced opacity, `cursor: not-allowed`, no hover change. Global base change, so it needs authorization (D3). Bundle it with the global `accent-color` rule from open decision 2: removal-mode row checkboxes in FOTO compute `accent-color: auto` (native blue) today **[B]**, while exclusion-mode checkboxes compute teal.
- **Risk:** low.

#### F17. Large-screen empty states are bare [B]

- At 1920×1080 the Rettinger inspector is a 590×670 px white pane with one line of body text at the top ([`36-rettinger-normal-1920.png`](assets/20261114-221747-ui-unification-review/36-rettinger-normal-1920.png)).
- **Recommendation:** one shared empty-state block (Phosphor icon, short heading, one or two lines on what to select) for the Rettinger inspector, the Validator inspector and the FOTO inspector. Not a layout change.
- **Risk:** low.

### P3: optional cosmetic refinements

- **F18. Hard-coded literals that duplicate tokens [C].** `gmiEdit.css` 86, `photoWorkspace.css` 80, `photoImageViewer.css` 33. Recurring values: `#dce3ea` and `#c4ced8` (borders), `#24364b` (text), `#e6f6f9` (teal tint), `#9b2c23` / `#7f1d1d` / `#fdf3f2` (destructive), `#15233566` (backdrop). At most three aliases are needed: `--gmi-interactive-tint`, a destructive text/border pair, and a backdrop.
- **F19. Text glyphs and hand-drawn icons [C].** `⚠` in `PhotoImportReviewStep.js:9`; `✓` in `Sidebar.js:305,339,348,462`; inline stroke SVGs for Kart/3D in `TabSwitcher.js`. Replace with Phosphor Regular when those files are touched.
- **F20. «Kontakt» footer [B].** A large centred button with icon in the main sidebar, a small left-aligned teal link in the Validator, absent in Rettinger and FOTO.
- **F21. Wizard copy [B].** Kun GMI shows «Den legges ikke i ZIP-filen» although there is no ZIP, and «Utvid alle / Lukk alle» for a one-file list (4 px radius, no hover: `deliveryWizard.css:32`). The import review says «1 bilder brukes av flere objekter».
- **F22. «Lagmarkering» opens far from its trigger [B]** (trigger at the left edge, panel at x ≈ 840 on a 986 px pane).
- **F23. Dialog radius [C].** Confirmations use 8 px; `AGENTS.md` says 16 px for dialogs. Resolve inside C2.

## 4. Workflow consistency summary

| Task | Consistent today | Inconsistent today |
|---|---|---|
| Selecting objects | Checkbox + `aria-selected` in Data Table (Validator and Rettinger hosts); row fill on all cells (A7) | FOTO browse uses a pressed row, FOTO modes use checkboxes; removal-mode checkboxes are native blue (F16) |
| Entering and leaving a mode | Rettinger and FOTO share the back-arrow header; FOTO modes have a bar with Avbryt/Ferdig and Escape | Validator closes with X (F4); removal-mode Escape breaks its dialog (F1) |
| Preview → confirm → undo | Batch stages (A1), risk dialog, «Angre»/«Gjør om», contextual redo | Individual editor and batch now share «Forhåndsvis»; legacy «Masseendringer» dialog still says «Se gjennom» (retires with C2) |
| Returning to a previous step | Wizard step links, «Tilbake til oppsett», «Tilbake til Validator» all use a leading arrow | Wizard footer says «Tilbake til Innhold» from Pakke, skipping Kontroll, while the step link «2. Kontroll» and «Se kontrollen» go to Kontroll |
| Opening and closing dialogs | Fourteen native dialogs: Escape, focus restore, named close control | Six overlay modals (F2); five confirmation implementations (F7) |
| Searchable field selection | One combobox in `GmiFieldValueInput` for object and batch editors | None found |
| Warnings and blocked actions | Wizard Kontroll (Må rettes / Bør kontrolleres); stale preview; refusal details in exclusion | Warning hues (F15); `window.alert` in upload |
| Export and download | One wizard from Rettinger and FOTO, one primary per step | «Last ned revidert GMI» in Rettinger and «Eksporter…» in FOTO name the same wizard differently (acceptable: each names the user's goal) |

## 5. Consolidation opportunities

| # | Duplicated today | Proposal | Benefit | Regression risk |
|---|---|---|---|---|
| C1 | The `showModal()` + remember opener + `close()` + restore-focus effect is written out in fourteen components; six overlay modals have none of it | A small `useModalDialog(ref, onClose)` hook next to the existing dialogs. New and migrated dialogs call it; existing native dialogs adopt it only when touched | Fixes F2 with one tested behaviour; prevents the next F1 | Low. Behaviour is already the native one |
| C2 | Five confirmation dialogs (F7) | Move `GmiConfirmDialog` to a shared location as the one confirmation component (tone: neutral, destructive, risk; optional details slot). `RemovePhotosConfirmation`, the exclusion confirmation and `PhotoEditBoundaryDialog` become callers or thin wrappers that keep their class hooks | One Escape/focus/destructive implementation; consistent radius and buttons | Low to medium. The exclusion confirmation has a richer body and its own focus trap; migrate it last, after acceptance |
| C3 | `PhotoIconButton` and `photoIconTooltip` live under `photos/` but serve Rettinger, the table, layer cards and the map toolbar | Move to a neutral folder with a neutral name; keep a re-export so imports can change gradually | Makes the standard discoverable; unblocks F10 | Low (mechanical) |
| C4 | Primary, selected, destructive, disabled and link styles are re-declared per module (`gmiEdit.css:106,192,199,230`, `photoTheme.css:13-33`) | After D1–D3, define them once in `globals.css` and delete the scoped copies | Removes the cause of F5, F6, F11, F16 | Medium: global recipes; computed-colour tests are contracts |
| C5 | Workspace header (back arrow, kicker, title, status line) exists twice (Rettinger, FOTO) and the Validator has a third form | One small `WorkspaceHeader` component used by all three | Fixes F4 structurally | Low to medium (header DOM is referenced by tests) |

**Looks similar but should stay separate:**

- The **FOTO delivery toggle** and ordinary segmented controls: the toggle is a radiogroup that writes delivery decisions and shows destination colours.
- The **photo import wizard** and the **delivery wizard**: they share a shell but have different state machines and gates. Unify their type scale and step indicator styling, not their components.
- **`GmiBatchInspector`** and **`GmiObjectEditor`**: different approval gates; they already share `GmiFieldValueInput` and `GmiSeverityIcon`, which is the right level.
- **Validator rule rows** and **Rettinger change-list rows**: both are disclosure lists, but one presents evidence and the other presents staged work.
- **Layer cards for GMI and FOTO layers**: different actions; share the row frame and icon button only.

## 6. Recommendations, priorities and slices

### 6.1 Classification

| ID | Finding | Priority | User impact | Complexity | Regression risk | Depends on | Before or after acceptance |
|---|---|---|---|---|---|---|---|
| F1 | Removal confirmation Escape + neutral destructive button | P0 | High (data removed after a cancel gesture) | Small | Low | — | May go before (isolated file); otherwise first slice after |
| F2 | Older modals without dialog behaviour | P0 | Medium–high (keyboard) | Medium | Low–medium | C1 | After |
| F3 | Map control overlaps | P0 | High at laptop sizes | Small–medium | Low–medium | — | After (A5 toggle shares the toolbar) |
| F4 | Module entry/name/exit | P1 | High (orientation) | Medium | Low–medium | D5, C5 | After |
| F5 | Selected-state treatments | P1 | Medium | Medium | Medium | D2 | After |
| F6 | Primary colours | P1 | Medium | Small | Low–medium | D1 | After |
| F7 | Confirmation dialogs | P1 | Medium | Medium | Low–medium | C2 | After |
| F8 | «Ikke med» ambiguity | P1 | Medium–high (delivery meaning) | Small | Low (text contracts) | — | After |
| F9 | Removal vs exclusion explanation | P1 | Medium | Small | Low | Acceptance observation | After |
| F10 | Icon button/tooltip systems | P1 | Medium | Medium | Low | C3 | After |
| F11 | Destructive styling by consequence | P2 | Medium | Small | Low | C4 | After |
| F12 | Validator header height, «Pass» | P2 | Medium | Medium | Medium | — | After |
| F13 | Rettinger table bars | P2 | Medium at laptop sizes | Medium | Medium | — | After |
| F14 | Density differences | P2 | Low–medium | Small to medium | Low–medium | — | After |
| F15 | Warning hues | P2 | Low–medium | Small | Low | D4 | After |
| F16 | Disabled state, global accent | P2 | Low–medium | Small | Low | D3 | After |
| F17 | Empty states | P2 | Low | Small | Low | — | After |
| F18–F23 | Literals, glyphs, footer, copy, panel position, radius | P3 | Low | Small each | Low | — | After; when the file is touched |

### 6.2 The five changes with the highest expected benefit

1. **F1**: make Escape cancel the removal confirmation and make its confirm button red.
2. **F3**: remove the map-control overlaps at 1280 and 1366.
3. **F2 with C1/C2**: one dialog behaviour for every modal and confirmation.
4. **F6 + F5 + F16 (decisions D1–D3)**: one primary, one selected look, one disabled look, defined globally.
5. **F4**: one workspace header and one name per module, with the Validator brought in line.

### 6.3 Suggested slices (each small and separately reviewable)

| Slice | Content | Files (main) | Gate |
|---|---|---|---|
| U0 (optional, before acceptance) | F1 only | `RemovePhotosConfirmation.js`, `photoWorkspace.css`, one browser test | `photoWorkspaceUi`, `photoDeliveryExclusionUi`; screenshots at both laptop sizes |
| U1 | F3: bottom-left control row; toolbar grid and constrained mode | `page.js`, `MapPaneToolbar.js`, `TabSwitcher.js` | `mapPaneToolbar`, `rettingerPhotoVisibilityUi`, `mapTeardownUi`; overlap measurement at 1280, 1366, 1600, 1920 in main, Validator, Rettinger and with test mode |
| U2a | C1 hook; migrate add-layer, share and WMS modals | `page.js`, `ShareQrModal.js`, `WmsLayerModal.js`, new hook | New browser test: Escape, focus in, containment, restore |
| U2b | Migrate `DataDisplayModal`, `ZValidationModal`, `StandardsInfoModal` | those files | `dataInspectorStacking`, `dataInspectorConstrainedHeight` unchanged |
| U3 | C2 shared confirmation; adopt in removal and edit-boundary dialogs first, exclusion last | `GmiConfirmDialog.js` (moved), FOTO dialogs | `gmiEditDraftGuardUi`, `gmiBatchRiskGateUi`, `photoDeliveryExclusionUi` |
| U4 | D1–D3 recipes in `globals.css`; delete scoped overrides; F11 destructive recipe | `globals.css`, `gmiEdit.css`, `photoTheme.css` | Computed-colour tests; screenshots of every module |
| U5 | F4 + F10: `WorkspaceHeader`, Validator header, shared icon button in layer rows and map toolbar | `ValidationV2Workspace.js`, `LayerPanel.js`, `PhotoLayerCard.js`, `MapPaneToolbar.js` | `gmiValidatorEditingUi` U1, `validationV2RuleCountsBrowser`, layer-card tests |
| U6 | Vocabulary and copy: F8, F9, «Pass» → «OK», F21 | `photoMarkerPresentation.mjs`, `RemovePhotosConfirmation.js`, `ValidationV2RuleList.js`, `DeliveryWizard.js` | Text-contract updates explained one by one |
| U7 | Laptop density: F12 header, F13 bars, F14 | `ValidationV2Workspace.js`, `LayerDataTable.js`, FOTO CSS | Geometry contracts unchanged; row counts measured before and after |
| U8 | Tokens: F15 after D4, F18 | module CSS | Computed-colour tests |
| U9 (after legacy retirement C1/C2) | Remove dead UI and its styles | see section 7 | Usage check, build |

Order: U0 → acceptance → U1 → U2a → U3 → U4 → U5 → U6 → U2b → U7 → U8 → U9. U1–U3 are independent of the design decisions and can start as soon as acceptance is done.

### 6.4 Decisions needed from you

- **D1. Primary colour.** Recommendation: teal everywhere; risk approval stays orange and is documented.
- **D2. Selected control.** Recommendation: cyan-soft + teal edge for segmented choices, teal underline for panel tabs, grey retired.
- **D3. Global base rules.** Recommendation: authorize `:disabled` on `.gmi-compact-button` and a global `accent-color` for checkbox, radio and range.
- **D4. Warning hue.** Recommendation: map Rettinger amber pills and the wizard note onto the validation warning tokens; keep yellow-700 for compact text only.
- **D5. Module name.** «FOTO» or «Bildemodul», used consistently. Recommendation: «FOTO» (already in the badge, the wizard copy and the reports), with «Bildemodul» removed from labels.
- **D6. Timing of U0.** Fix F1 before tomorrow's acceptance, or test with explicit «Avbryt» and fix it first afterwards.

## 7. Legacy removal: UI implications (known entry points, not new defects)

- **«Masseendringer» footer button** sits directly above the primary download action and has almost the same name as the inspector's «Masseendring». Removing it (C2 of the UX plan) removes the most confusing duplicate control in Rettinger and frees the footer for undo/redo and «Forkast alle».
- **`GmiBatchDialog`** carries the last «Se gjennom» wording and its own teal override (`gmiEdit.css:192`); both go with it.
- **«Lag retting…»** was not reachable with my point-field scenario; no new observation.
- **Unreferenced components [C]:** `DataDisplay.js`, `DetailedStatsSection.js` and `ThemeSwitcher.js` have no importer. With the five dormant `--color-*` theme blocks in `globals.css` they account for a large share of the "legacy colour" counts. Removing them is cheaper than restyling them.
- **Still referenced:** `FieldDetailModal.js` and `MissingFieldsReport.js` are imported by `FieldValidationSidebar.js`. Check whether they are still reachable before spending styling effort on their 80 legacy colour utilities.

## 8. Explicit non-recommendations

- **No new design system or component library.** Tokens, recipes and Phosphor cover every need found; the gaps are undecided recipes and unshared components.
- **No single big styling pass.** The findings touch protected surfaces (table geometry, wizard gates, delivery text contracts); small slices keep each contract change explainable.
- **Do not restyle A1–A7 or FOTO slices 1–3 before acceptance,** including the small items found in them (F8, F13, the 16 px inspector link).
- **Do not rename the Norwegian verbs wholesale** (Fjern / Forkast / Nullstill / Tøm / Ta ut). They are used consistently enough by meaning; 14–15 test files select by these labels. Fix emphasis and the two real ambiguities (F8, «Pass») only.
- **Do not unify the two wizards or the two editors into one component** (section 5).
- **Do not remove every native `title`.** Titles on truncated table cells and filenames are legitimate; only icon-only controls should move to the shared tooltip.
- **Do not load Roboto 600 or sweep `font-semibold`.** Weight 600 is requested about 240 times and renders as 700 because 600 is not loaded (`layout.js:7`). The result is uniform; changing it would alter every heading for no user benefit.
- **Do not normalise information colours** (FCODE symbology, delivery pills and markers, provenance colours, Gemini indigo).
- **Do not change Data Table geometry, sticky offsets or the selected/active fills now.** A7 works; the selected-versus-active tint stays an open decision and was readable in this pass (cyan fill plus leading teal bar).
- **Do not restyle the profile analysis, 3D, statistics and developer panels in this programme.** They were not reviewed here and are not on the correction workflow.
- **Do not replace `window.confirm` in the upload flow** until that flow is being changed anyway.

## 9. Risks, dependencies and limits of this review

- **Synthetic data only.** 60 objects and ten 1×1 px photos. Thumbnails were blank; long real filenames, hundreds of rows, many findings and real S_HYPERLINK grammar were not exercised.
- **Not reviewed in the browser:** 3D view, profile analysis, statistics, Gemini WFS/WMS flows, KOF/SOSI files, FOTO edit mode («Juster plassering og retning»), the positioning wizard, «Fullfør opplysninger», the individual object editor and «Rett én og én», map popups.
- **Not measured:** numeric contrast, screen-reader output, hover states (source only), a full keyboard-only pass. Focus rings were checked only where a step required focus.
- **Build deviation:** Turbopack refused a `node_modules` junction, so the scratch copy's `next.config.mjs` got `turbopack: { root: 'C:/' }`. The scratch copy only; the bundler and application code are those of HEAD. `.env.local` was not copied, so the build had no service credentials.
- **Test mode:** the main walkthrough used `?testmodus=1`; the overlap table in F3 was measured in normal mode.
- **Contract churn:** many browser suites select by visible label or class. Each slice should add `data-*` hooks first and explain every assertion change, as the UX plan already requires.
- **Global recipes (U4):** a change in `globals.css` reaches every module at once. It needs screenshots of every module at both laptop sizes, not only the suites.

## 10. Targeted observations for real-file acceptance

1. **Removal confirmation (F1):** press Escape in «Fjern … fra laget?». Expect the defect unless U0 is done; use «Avbryt». Do not click «Fjern fra lag» after an Escape.
2. **Map toolbar (F3):** in Rettinger at 1366×768, check whether «3D-visning» is reachable and where «Vis bilder» sits next to the zoom control. In the main view at 1280 and 1366, check whether «Gemini WFS» can be clicked.
3. **«Ikke med» counts (F8):** with a real layer that has both unlinked photos and explicit exclusions, compare the pills, the planning counts and the wizard's Innhold and Kontroll numbers. Note whether the difference is understood.
4. **Remove versus exclude (F9):** remove one point-linked photo from the layer, then open Samlet levering. Record whether delivery is blocked and whether the message tells you what to do.
5. **Rettinger table at laptop size (F13):** with a real selection of 12+ objects, count visible rows while the selection bar and «Masseendring pågår» are shown; note whether «pågår» after staging is misleading.
6. **Batch preview fold (A1 report):** «Sett verdi» with a conflict at 1280×720; is «Legg til masseendring» visible without scrolling?
7. **Risk dialog:** does the orange «Godkjenn og legg til» read as approval rather than danger? (Input to D1.)
8. **Selected versus active row (A7):** with real data and horizontal scroll, can you tell the active object from the selected ones on the sticky cells?
9. **Validator list length (F12):** with a real file's rule count, how much scrolling does a full review take at 1366×768?
10. **Wizard Kontroll in Samlet levering:** does it scroll at 1366×768, and are «Må rettes» items visible without scrolling?
11. **FOTO exclusion mode at 1280×720 (F14):** is a four-row list workable with 50+ photos?
12. **Keyboard:** one pass through wizard, risk dialog and exclusion confirmation (Tab order, Escape, focus return); try Escape in «Inspiser data» to see F2.

## 11. Final assessment

**A. How cohesive is the application today?** Moderately. Within Rettinger, FOTO and the delivery wizard it is cohesive and close to finished. Across the application it is not: the shell, the Validator and the older modals follow earlier conventions, so moving between modules changes button colours, selected-state colours, header layout and dialog behaviour.

**B. Largest remaining inconsistencies?** (1) Dialog behaviour and appearance (F2, F7). (2) Primary and selected-state colour (F5, F6). (3) How modules are entered, named and left (F4). (4) Map chrome layout at laptop widths (F3). (5) Delivery vocabulary: «Ikke med» and remove versus exclude (F8, F9).

**C. Which patterns should become the standard?**
- Dialogs: native `<dialog>` as in the delivery wizard; `GmiConfirmDialog` for confirmations (Cancel focused, explicit destructive or risk action).
- Workspace header: the Rettinger/FOTO back-arrow header.
- Icon-only controls: `PhotoIconButton` with its tooltip.
- Staged work: the batch inspector's Oppsett → Forhåndsvis → Lagt til, with one primary per stage.
- Menus of tools: the FOTO Verktøy menu (grouped, destructive item separated and red).
- Selection in lists: the Data Table's three row states.
- Selected segment: cyan-soft with teal edge. Primary: teal. Status: the validation palette with `GmiSeverityIcon`.

**D. Redundant or confusing controls to remove?**
- «Masseendringer» in the Rettinger footer (planned in C2).
- The separate «Masseendring pågår · se panelet til høyre» bar; fold into the selection row.
- Zero-value counts in the selection sentence.
- «Utvid alle / Lukk alle» when the package has one file.
- «Nullstill og åpne ny fil» as a permanent toolbar button in Rettinger at constrained width; move to the overflow menu.
- The floating «Inspiser data» button as a separately positioned control; keep the action, place it in the bottom-left row.
- Unreferenced `DataDisplay`, `DetailedStatsSection`, `ThemeSwitcher` and the dormant themes.

**E. One pass or several slices?** Several. U1–U3 fix behaviour and need no design decision. U4 applies decisions D1–D3 globally and needs a whole-app visual check. U5–U8 are local. A single pass would mix behaviour fixes, global recipes and text-contract changes in one diff across protected surfaces.

**F. What to inspect particularly carefully tomorrow?** Section 10, above all items 1–4: the removal Escape defect, the laptop-width overlaps, whether the «Ikke med» counts reconcile, and what happens to delivery after a photo is removed rather than excluded.

**G. What should remain untouched?**
- Delivery wizard structure, gating and copy hierarchy (A3/A4, slice 3).
- Batch inspector stage model and risk gates (A1/A2).
- Data Table geometry and row-state painting (A7).
- FOTO tools menu, delivery toggle, pill and marker colours, the exclusion confirmation's behaviour.
- `PhotoIconButton` and tooltip behaviour (move, do not rewrite).
- Status palette and `GmiSeverityIcon`.
- The A5 render-time photo override and its toolbar toggle position.
- `GmiFieldValueInput` combobox behaviour (A6).

## 12. Commands, files and Git

- **Read-only repository commands:** `git rev-parse`, `git status --short`, `git archive HEAD` (to the scratch directory), `git ls-files`, `grep`, `sed`, `wc`.
- **Isolated build:** `next build` and `next start -p 3391` inside the session scratch directory only. First build attempt failed (Turbopack rejected the dependency junction); second passed with the scratch-only root setting.
- **Browser:** headless Chrome started for this task on debugging port 9391, driven by scratch scripts. One navigation stalled and the browser was restarted; no finding depends on that run.
- **Processes:** the task's own server (3391) and Chrome were stopped, and the dependency junction was removed. The pre-existing servers on ports 3110–3113 and the repository `.next` were not touched.
- **Not run (review only):** unit tests, browser suites, lint, repository build.
- **Files added:**
  - `docs/agent-reports/20261114-221747-ui-unification-review.md` (this report);
  - `docs/agent-reports/assets/20261114-221747-ui-unification-review/` (18 screenshots, 6.8 MB, synthetic fixtures).
- **Git status at the end:** branch `feature/photo-workspace`, HEAD `091f92d`, no tracked changes. Untracked: the three pre-existing planning reports (untouched), this report and its asset folder. Nothing was staged, committed, pushed or deployed. `git diff --check` reports nothing (no tracked changes).
