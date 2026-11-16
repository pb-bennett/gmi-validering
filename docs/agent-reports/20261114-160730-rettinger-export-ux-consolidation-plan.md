# Rettinger and export workflow UX consolidation — implementation plan (PLANNING DRAFT)

**Status: planning draft. Nothing in this report is implemented.** Written 2026-11-14, Europe/Oslo, in `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `8bb6f07`. Browser acceptance was run on build `a50eb62`. `8bb6f07` adds only the AGENTS.md styling standards on top of it, so the findings apply to HEAD.

**Starting state:** two untracked reports, `20261113-182754-rettinger-roadmap-reconciliation.md` and `20261114-090612-foto-delivery-exclusion-plan.md`. Both were read and left untouched.

**What this task did:** it read code and reports only. No application code, CSS, tests, AGENTS.md or existing reports were changed. No builds, tests or browser runs were executed. This report is the only new file.

## 1. Sources and method

- **Read:**
  - Root `AGENTS.md`, including the UI standards.
  - The roadmap reconciliation and the FOTO exclusion plan.
  - The laptop-layout correction (`20261113-191035`), G8 object editor (`20261113-200235`), B2 gates (`20261112-130647`) and styling consolidation (`20261114-130507`) reports.
- **Inspected the owning source:**
  - Rettinger: `GmiBatchInspector.js`, `GmiEditWorkspace.js`, `GmiFieldValueInput.js`, `GmiSelectionProfile.js`, `gmiBatchInspectorView.mjs`, `gmiSelectionProfile.mjs`.
  - Export: `DeliveryWizard.js`, `deliveryWizard.mjs`, `deliveryPlan.mjs`, `exportGmi.mjs`, `diff.mjs`, `gmiEditView.mjs`.
  - Table and map: `LayerDataTable.js`, `MapInner.js`, `photoMapFeatures.mjs`, `photoSession.mjs`, `mapPanePresentation.mjs`, `page.js`.
  - Legacy: `ValidationV2RuleList.js`, `ValidationV2Workspace.js`, `gmiValidatorEditing.mjs`.
- **Evidence labels:** statements marked **observed** come from reading the code. Statements marked **hypothesis** still need reproducing in a browser before or during implementation.

## 2. Acceptance findings and status

Legend: **Accepted** = passed manual browser acceptance on 14 November. **Defect** = confirmed by acceptance and/or code. **Open** = not established.

| Area | Status | Notes |
|---|---|---|
| Validator → Rettinger handoff (single and batch), H2–H4 | Accepted | Closes the roadmap's H3 real-delivery gap |
| Single-object edit, stage, undo/redo | Accepted | |
| Multi-select and «Rett én og én» (B3) | Accepted | |
| Batch fill / replace / clear (G4, G6) | Accepted | Presentation problems: §4.1 |
| Conflicting-correction replacement with undo/redo | Accepted | |
| Batch S_FCODE SP → VL plus Validator revalidation (G8 batch) | Accepted | |
| Revised GMI export (9 field edits, byte comparison clean) | Accepted | |
| Combined GMI/GML export (9 edits + 1 transfer; ZIP with GMI, GML, 117 attachments) | Accepted | |
| GMI/GML destination change and restore; shared photo with two placements | Accepted | |
| Individual S_FCODE / linked Tema in the object editor (G8 follow-up) | **Open** | Not tested manually |
| Gemini VA recipient acceptance (G4) | **Open** | Not established by these tests |
| Batch workflow information overload (Finding 1) | Defect | §4.1 |
| Export wizard repetition (Finding 2) | Defect | §4.2 |
| Report object identifiers (Finding 3) | Defect | Root cause found, §4.3 |
| FOTO markers visible in Rettinger (Finding 4) | Defect (UX) | §4.4 |
| Smaller UX issues (Finding 5) | Mixed | Classified in §4.5 |
| Package tree starts collapsed | Not a defect | Excluded, as instructed |

## 3. Reconciliation with existing roadmap and report decisions

- **Roadmap Slice 1 is done.** The laptop-layout correction (`c96bcc4`, 53/53 browser gate) restored the inspector layout.
- **Roadmap Slice 2 is implemented, not accepted.** The individual linked Tema editor shipped (`a50eb62`) but still lacks manual acceptance.
- **Roadmap stopping point:** the combined acceptance session has now been run. It covered the roadmap's items 1–6, except individual Tema/S_FCODE.
- **H5 / R7 (legacy retirement):** the roadmap required H2–H4 and inspector-path acceptance first. That acceptance now exists, but this plan has just found UX defects in the replacement workflow. Retirement therefore stays after slices A1–A2 are accepted (Phase C). This matches the agreed sequence.
- **Roadmap H5 asked whether to remove or re-point «Lag retting…».** Your brief settles it: remove it. Note that «Lag retting…» already opens the modern batch inspector through `gmiEditWorkspace.correction` (`GmiEditWorkspace.js:56,124-131`). Removing it therefore removes an entry point, not a separate editor.
- **The B2 mixed gate is deliberate.** B2 made any profile column that is mixed across the changing objects trigger the risk dialog. The profile columns are Tema, Material, Dimensjon, Stedfestingsårsak and the rule context (`gmiSelectionProfile.mjs:7-12`; B2 report §16, §36). Your "unrelated characteristics in confirmation dialogs" finding is the visible effect of that decision. This plan changes only how it is presented. Whether it should still *trigger* is decision **D1** (§7).
- **The laptop-layout report left «Legg til masseendring» below the fold in step 2.** It records this as acceptable. Slice A1 resolves it as a side effect.
- **FOTO exclusion plan.** It is not rewritten here, and its decisions D1–D5 are not settled. Sequencing interactions:
  - Its slice 3 changes `deliveryWizard.mjs` (`deliverySummary`, `deliveryReport`) and `DeliveryWizard.js` Kontroll texts. Slices A3 and A4 below touch the same functions, so **A3 and A4 should land before exclusion slice 3**. Exclusion texts then go into the consolidated Kontroll step, and its report section (§5.3 of that plan) reuses the object-identity helper from A3.
  - Exclusion slices 1–2 touch only `photo*` modules and are independent of Phase A.
  - Slice A5 (FOTO hidden in Rettinger) must not write `photoSession` layer visibility or delivery decisions. It therefore cannot conflict with the exclusion model.
- **UI standards (AGENTS.md):** every Phase A slice must follow them on the surfaces it touches. Specifically:
  - teal native controls;
  - hover, focus and disabled states on touched buttons;
  - Phosphor icons;
  - one primary action per step, which A1 and A4 enforce structurally.

  Open items are not settled here: primary colour, selected/active fill and close-control shape.

## 4. Source ownership and analysis per finding

### 4.1 Finding 1 — Rettinger batch workflow (`GmiBatchInspector.js`)

Observed:

- **Stages are not exclusive.** The render shows the proposal block whenever `review` exists (`:322`). It shows the configuration whenever `!review || configOpen` (`:364`). The options, dry-run status and the «Legg til masseendring» block render below both, unconditionally outside the staged state (`:366-397`). Setup and preview therefore coexist, and the staging button is visible (disabled) during setup.
- **«Endre oppsett» is a disclosure, not a stage change.** It toggles `configOpen` (`:325`) and appends the form under the proposal. It does not return to a setup stage.
- **The progress indicator lies.** The step is computed as `stagedChangeSet ? 3 : review && !stale ? 2 : 1` (`:242`). It shows «Forhåndsvis» as current while the setup form is open, and «Oppsett» as current while a stale proposal is still on screen.
- **The panel repeats what the table already shows.**
  - `GmiSelectionProfile` always lists all four profile fields, including uniform ones shown as «(alle)» (`GmiSelectionProfile.js:20-25`).
  - The inspected-object detail dumps every attribute as a `<dl>` (`:413`). The Data Table already shows those columns.
  - The current-finding split carries a permanent explanatory paragraph (`GmiSelectionProfile.js:76`).
  - Linked notes (`:360-363`), «Slik leser du tabellen», the advanced checkbox and the dataset-findings disclosure all stack in one scrolling column.
- **The confirmation dialog repeats characteristics.** It lists the mixed profile distributions (`:431-435`) and «Eksisterende funn» even when the edit concerns a different field. The copy «Bekreft at samme verdi skal brukes på disse objektene» (`:432`) is wrong for «Tøm verdi».
- **The draft guard fires on trivial changes.** The guard condition is `dirty = Boolean(lexeme || review || mode !== 'fill-missing')` (`:74`). Picking a mode radio alone therefore arms the guard and `beforeunload`.
- **Naming and back navigation:**
  - The individual «Se gjennom (N)» lives in `GmiObjectEditor.js:352`, with matching texts at `:247-248` and `GmiChangeList.js:37`.
  - The back controls «Tilbake til masseendringen» (`:401`) and «Tilbake til utvalget» (`GmiEditWorkspace.js:405`) are text-only.

### 4.2 Finding 2 — export wizard (`DeliveryWizard.js`)

- **Observed:** the Kontroll and Pakke steps share one render branch (`:324-354`). Every item below therefore renders on **both** steps:
  - the summary `<dl>`, the verification sentence and the experimental note;
  - `PhotoExportStatus`, the counts and the format profile;
  - the full `Diagnostics`, the excluded notes and «Tekniske detaljer»;
  - the eksportkontroll disclaimer.

  Pakke only adds the inventory (`:331-334`). This is the repetition seen in acceptance.
- **Unaffected:** state, gating and transitions live in `deliveryWizardReducer` / `deliveryWizardStatus` (`deliveryWizard.mjs:15-42`), so a presentation change cannot touch them.

### 4.3 Finding 3 — report object identifiers (`deliveryWizard.mjs:112`)

- **Root cause (observed):** `deliveryReport` writes ``${item.scope === 'line' ? 'Ledning' : 'Punkt'} ${item.sourceIndex + 1}``. `sourceIndex` is the array position. This explains exactly the observed mismatches: Punkt 267 reported as 140, Ledning 38 as 35, Ledning 43 as 39.
- **The data needed for the fix is already present.** Both summary shapes carry the real identity:
  - In `gmi-only`, `exported.summary.changes` includes `objectId` and `guid` (`exportGmi.mjs:143-146`).
  - In `combined`/`split`, `gmiSummary.diff = diffGmiDatasets(original, result.document)` (`deliveryPlan.mjs:123-126`), and `diff.mjs:72-74` emits `objectId: a.id` (the parser's `:L n` / `:P n` number) and `guid`.
- **The established labeller already exists.** `describeGmiObject(scope, sourceIndex, objectId)` (`gmiEditView.mjs:220`) gives «Ledning 38», or «Ledning nr. N i filen» when the file has no number. The Data Table and Rettinger already use it (`gmiObjectNumber`, `:230`). The report is the only consumer that bypasses it.
- **Side effect:** in combined mode the diff also lists `S_HYPERLINK` changes from M7 removals. These are correct, but they are printed under «Feltendringer». The A3 fix should label them.
- **Related, out of scope (hypothesis):** the Validator also labels some objects by position.
  - `validation-v2/diagnostics.js:106-108` writes «Linje/Punkt sourceIndex+1» into `affectedObjects.sampleRefs`.
  - `uiIntegration.js:26-31` `getValidationV2ObjectLabel` does the same, but has no consumer outside its own file.

  Whether these labels reach a user-visible report was not established. It is listed as an item to check (§8), not included in A3.

### 4.4 Finding 4 — FOTO visibility in Rettinger

- **Persistent visibility:** `photoSession` layer `visible` (`photoSession.mjs:1213-1222`). It is written by the layer card, the FOTO workspace eye button, LayerManager show/hide all, and FOTO edit mode (`page.js:263`).
- **Map rendering:** `buildPhotoMapItems` filters `layers.filter((layer) => layer.visible)` (`photoMapFeatures.mjs:6`), called from `MapInner.js:1138`. `MapLegend.js:24` gates the photo display modes on the same flag.
- **Rettinger activity:** `page.js:152` reads `gmiEditLayerId`, and `page.js` already passes photo props into the map (`photoDisplay`, `:986`).
- **Pattern to reuse:** U3's legend collapse saves the previous value on `workspace-changed` and restores it on exit (`mapPanePresentation.mjs:38-42`). Note that `workspaceActive` also covers Validator field validation (`page.js:954`). Rettinger therefore needs its own flag.
- **Conclusion:** writing `setLayerVisibility(false)` and restoring it later would be a persistent side effect. It would also make the layer cards misreport, and it would race with the user's own toggles. A **render-time override** leaves `layer.visible` untouched, so restoration is exact by construction.

### 4.5 Finding 5 — smaller issues, classified

| # | Issue | Class | Owner (observed) | Slice |
|---|---|---|---|---|
| a | Selected-row fill does not reach sticky columns | **Behaviour/state visibility.** AGENTS.md already settles it: the fill must be painted on every cell | `LayerDataTable.js:1285` (selection cell is always `bg-gmi-surface`) and `:1306` (sticky cells take cyan only for the active object; `group-hover` replaces the fill) | A7 |
| b | Selected vs active row hard to tell apart | **Visual.** The exact fills are an Open decision (styling report decision 3) | same | Deferred (D) |
| c | Column-priority indicator stays active after the columns revert | **Behaviour** (hypothesis; reproduce first) | Indicator `LayerDataTable.js:979-983`; local `columnFocusOff` (`:231,363-372`); writers `GmiBatchInspector.js:141-149` (`focusChoice` deliberately outlives staging, S5) and `GmiChangeSetDetail.js:28-29` | A7 |
| d | Batch setup shows an unavailable staging action | **Workflow** | `GmiBatchInspector.js:391-397` | A1 |
| e | «Tøm verdi» confirmation says «samme verdi» | **Workflow copy** | `GmiBatchInspector.js:432` | A2 |
| f | Draft guard arms on trivial setup changes | **Behaviour** | `GmiBatchInspector.js:74` | A1 |
| g | Module close/navigation inconsistent | **Mixed.** The back icons in touched surfaces are workflow; the shared close-control shape/size is Open (styling decision 6) | Rettinger `ArrowLeftIcon` back (`GmiEditWorkspace.js:347`), inspector text «Avslutt», wizard `XIcon` | Back icons: A1/A6. Rest deferred (D) |
| h | Controls without obvious hover feedback | **Visual** (audit) | Styling report class D list | Deferred (D); touched buttons must comply |
| i | S_FCODE suggestions do not filter while typing | **Behaviour** (hypothesis on cause) | `GmiFieldValueInput.js:30`: `searchable = enumerated && options.length > 12`. Shorter code lists render a native `<select>`, which has no type-to-filter. Longer lists filter by substring over code + meaning + long meaning (`:32`), which can leave many weak matches | A6 |

### 4.6 Finding 6 — legacy entry points (inventory, nothing removed)

| Item | Location | Safe to remove? |
|---|---|---|
| Validator «Lag retting…» button | `ValidationV2RuleList.js:110` | Yes, after Phase A acceptance |
| Correction start / eligibility | `ValidationV2Workspace.js:366-382` (`correctable`, `startCorrection`), prop at `:598` | Yes, with the button. This also removes the intermittent «Lag retting…» timeout recorded in `20261113-191035` §6 |
| Correction helpers | `gmiValidatorEditing.mjs`: `CORRECTABLE_RULES`, `isCorrectableMissingFinding`, `prepareValidatorCorrection`, `validatorCorrectionSelection`, `VALIDATOR_CORRECTION_STALE` | **Partly.** The same module owns `validatorSelectionHandoff`, `gmiValidatorReturnTarget`, `gmiValidatorDefaultDataset` and `buildGmiValidationComparison` (H3/H4). Remove only the correction exports, after a usage check |
| Rettinger correction entry | `GmiEditWorkspace.js:56,124-131` (`correction`, `enterCorrection`); the store `gmiEditWorkspace.correction` | Yes, with the above |
| Footer «Masseendringer» | `GmiEditWorkspace.js:384-385`, plus `batchOpen` state and the `:418-419` mount | Yes |
| `GmiBatchDialog.js` (239 lines) | Imports `gmiEditBatchView.mjs` | Yes. But `gmiEditBatchView.mjs` is **shared**: it is also used by `gmiBatchInspectorView.mjs` and `gmiFieldBatchPlan.mjs`. Keep the module; remove only the exports nothing else imports |
| «Rediger valgte (N)» / «Åpne i Rettinger (N)» | `LayerDataTable.js:1118-1124` | **Retain** (the modern path) |
| `GmiExportDialog.js` | A wrapper around `DeliveryWizard` | Not legacy; retain |

Tests that depend on the legacy paths and must be migrated or retired with them:
- `gmiValidatorEditingUi` (the R5 «Lag retting…» suite, which also carries the M5C viewport-bounds contract);
- `validationV2RuleCountsBrowser` (one reference);
- `gmiValidatorEditing.test.mjs`;
- `gmiEditBatchUi` (dialog based);
- `gmiBatchInspectorUi`, `gmiEditWorkspace.test.mjs` and `gmiRettingerSidebar.test.mjs` (dialog references).

## 5. Implementation slices, in priority order

Phase A covers functionality and workflow. Phase B is the FOTO exclusion plan. Phase C retires the legacy workflows. Phase D is the styling audit (last).

Every slice follows the AGENTS.md verification rules:
- focused `node --test` runs;
- `npx --no-install eslint` on changed JS/MJS;
- `git diff --check`;
- for UI slices, a fresh `npm run build`, a free port and serial production-browser suites, with screenshots at 1280×720 and 1366×768.

Browser tests that select by visible label will need deliberate updates. Each slice should first add stable `data-*` hooks to the elements whose labels change, so tests keep their selectors.

---

### A1 (RECOMMENDED FIRST): batch inspector — one active stage

- **Objective:** a batch correction moves through **Oppsett → Forhåndsvis → Lagt til**, with only one stage's content and one primary action on screen. Selection stays in the Data Table.
- **Scope:** `GmiBatchInspector.js` and `gmiEdit.css` only. Covers Finding 1 (setup/preview coexistence, «Endre oppsett», the progress indicator, the staging action during setup, back iconography) and Findings 5d and 5f.
- **Changes:**
  1. **Derive one stage:** `stage = stagedChangeSet ? 'staged' : review && !editingSetup ? 'preview' : 'setup'`. `editingSetup` replaces the `configOpen` disclosure.
     - **Setup** shows the configuration form, with «Forhåndsvis endringer» as the only primary action. It does not render the proposal, options, dry-run status or the «Legg til masseendring» block.
     - **Preview** shows the proposal, the approval-relevant counts, the options (replace/advanced), the full-control status and «Legg til masseendring» as the only primary action. «Tilbake til oppsett» is a secondary control with a leading Phosphor `ArrowLeftIcon`. A stale preview stays in this stage and shows the existing stale alert and «Oppdater forhåndsvisning».
     - **Staged** is unchanged: `renderChangeSet` plus «Ny masseendring for utvalget».
  2. **«Tilbake til oppsett» / «Endre oppsett»** switches to Setup with the current field, value, mode and match retained.
     - If nothing changes, a secondary «Tilbake til forhåndsvisningen» returns to the still-valid preview.
     - Any setup input still calls the existing `invalidate()`, which drops the review exactly as today.
  3. **Progress `<ol>`:**
     - Keep the four labels («Velg objekter» is the Data Table step, shown done).
     - Set `aria-current="step"` and `data-done` from `stage`, not from `review`.
     - Add a non-colour «ugyldig» cue on Forhåndsvis when `stale`.
  4. **Draft guard:** `dirty = Boolean(lexeme || match !== null || review)`. A mode or field choice alone no longer arms the guard or `beforeunload`. A typed value, a chosen match or any preview still does.
- **Must remain unchanged:**
  - `calculate`/`stage` logic, generation tokens and `isLive`;
  - stale/expanded detection and the B2 approval-selection identity checks (`:188-201`);
  - risk-dialog triggers (`gmiBatchRiskReasons`), conflict/replace handling and the full-control requirement (`stageBlocked`);
  - `gmiBatchTableReview` publication to the Data Table (still published whenever a review exists);
  - S5 column focus and «Ny masseendring» focus continuity;
  - narrowing actions and selection state;
  - the workspace guard (`GmiEditWorkspace.guard`), the «Rett én og én» entry and the header layout.
- **Tests:**
  - **New browser assertions:**
    - in Setup, `[data-gmi-batch-counts]` and the stage button are absent;
    - in Preview, `[data-gmi-batch-config]` is absent;
    - «Tilbake til oppsett» → «Tilbake til forhåndsvisningen» keeps the same proposal without recomputing; changing the value invalidates it;
    - `aria-current` matches the visible stage, including stale;
    - the mode radio alone does not open «Forkaste endringer i skjemaet?» when leaving; a typed value does;
    - at 1280×720 and 1366×768 the proposal top stays < 140 px (the R4 contract, unchanged) and «Legg til masseendring» is visible without scrolling for a single-field fill.
  - **Updated suites:** update deliberately the tests that expect the proposal and form together, or «Endre oppsett» as a disclosure: `gmiBatchInspectorUi`, `gmiR4UxPolishUi`, `gmiS5FocusContinuityUi`, `gmiBatchReplaceClearUi`, `gmiLinkedTemaUi`, `gmiSelectionProfileUi`, `gmiBatchRiskGateUi`, `gmiValidatorEditingUi`, `gmiBatchFieldValueInputUi`, `gmiValidatorReturnUi`. Each change must be explained in the report, with equivalent safety coverage. No threshold may be relaxed.
  - **Node:** `gmiBatchInspector`, `gmiIndividualSelection`, `gmiRettingerSidebar`.
  - **Production-browser gate:** the 53-test set from `20261113-191035` plus `gmiEditDraftGuardUi`.
- **Browser acceptance:**
  - fill, replace, clear and linked-Tema batches, each moving cleanly through the three stages;
  - a stale preview after expanding the selection;
  - conflict replacement;
  - undo of the staged batch returns to Setup;
  - one keyboard-only pass.
- **Dependencies:** none.
- **Risk:** medium, from the number of browser contracts. The logic risk is low because gating code is not touched.
- **Model:** Opus, high effort.

### A2: batch inspector — concise findings, details on demand

- **Objective:** the inspector and the risk dialog show only what affects approval. Diagnostics and object characteristics are one click away.
- **Scope:** `GmiBatchInspector.js`, `GmiSelectionProfile.js`, `gmiEdit.css`. Covers Finding 1 (irrelevant properties, long panel, repetitive dialogs) and Finding 5e.
- **Changes:**
  1. **Inspected-object detail** (`:400-414`):
     - drop the full attribute `<dl>`, because the Data Table owns it;
     - keep the object label, Original → Foreslått for the edited field, the outcome, new and resolved findings, and «Eksisterende funn» inside its existing `<details>`;
     - give «Tilbake til masseendringen» a leading `ArrowLeftIcon`.
  2. **Selection profile:**
     - collapsed by default to one summary line, «Utvalget: 12 ledninger · ulike verdier i Material, Dimensjon»;
     - uniform rows appear only inside the disclosure;
     - «Behold bare disse» narrowing is unchanged inside it.
  3. **Current-finding split:** keep the one count line. The explanatory paragraph moves into a `<details>` «Hvorfor SJEKK?».
  4. **Linked Tema notes:** show once, in Setup only. «Tema og S_FCODE: original og foreslått nå» stays a preview disclosure.
  5. **Preview footer:** group «Slik leser du tabellen» and «Se nye og løste funn i hele datasettet» under one «Detaljer» disclosure. The full-control status line stays visible, because it gates approval.
  6. **Risk dialog:**
     - lead with the operation and object count, then one short bullet per triggering reason (new FEIL, overwrite, manual, mixed, unvalidated, linked);
     - keep new and worsened FEIL listed in full, because they are approval-material;
     - move SJEKK lists, improved findings, mixed-column distributions and «Eksisterende funn» into `<details>`;
     - operation-specific copy: «Bekreft at verdien skal tømmes for disse objektene» (clear), «…erstattes…» (replace), and the existing set/fill wording otherwise.
- **Must remain unchanged:**
  - which reasons open the dialog, including the B2 mixed reason (see D1);
  - `diff.newCounts` gating;
  - the narrowing semantics;
  - the confirm and cancel actions and the focus restoration of `GmiConfirmDialog`.
- **Tests:**
  - Update `gmiBatchRiskGateUi`, `gmiSelectionProfileUi`, `gmiBatchReplaceClearUi` and `gmiLinkedTemaUi` for the collapsed disclosures, opening them where a test inspects distributions.
  - Add a clear-mode copy assertion.
  - Add an assertion that the inspected detail has no attribute list.
  - Node tests for any helper extracted for the summary line.
- **Browser acceptance:**
  - the SP → VL S_FCODE batch: the dialog fits without scrolling at 1280×720 for the acceptance selection, and the mixed details are reachable;
  - the risk dialog keeps Escape handling, focus containment and focus restore.
- **Dependencies:** A1. Same component; avoids merge conflicts.
- **Risk:** low to medium (presentation only).
- **Model:** Opus, medium effort.

### A3: delivery report object identity (small, independent)

- **Objective:** report lines name objects by their GMI object number and GUID, consistent with the exported GMI.
- **Scope:** `deliveryWizard.mjs` (`deliveryReport`) and `tests/deliveryWizard.test.mjs`.
- **Changes:**
  1. Format each change with `describeGmiObject(item.scope, item.sourceIndex, item.objectId)`, plus ` (GUID …)` when `item.guid` is set. Files without object numbers fall back to «nr. N i filen».
  2. List `S_HYPERLINK` changes separately from field changes, under «Bildelenker endret:».
  3. Do not change `diffGmiDatasets`, `exportGmi` or the plan shape. The identity fields already exist.
- **Must remain unchanged:** export bytes, plan, ZIP content, report location (outside the ZIP), the summary lines and all gates.
- **Tests:**
  - A synthetic fixture whose object numbers differ from array positions (for example points `:P 101`, `:P 7`), with GUIDs, in `gmi-only` and `combined` modes. The report must name «Punkt 101 (GUID …)» and never the position.
  - Cross-check every report identity against the **exported** bytes: parse `getGmiExportBytes` / the plan's GMI and look up `id`/`guid` at `sourceIndex`.
  - A no-number fallback case.
  - The existing `deliveryWizard` tests stay green.
- **Browser acceptance:** repeat the acceptance export. The report must show Punkt 267, Ledning 38 and Ledning 43.
- **Dependencies:** none. It can run before or right after A1, and must land before FOTO exclusion slice 3.
- **Risk:** low.
- **Model:** Sonnet, medium effort.

### A4: export wizard — Innhold / Kontroll / Pakke without repetition

- **Objective:** Kontroll is the single place for findings. Pakke shows the package and the download actions.
- **Scope:** `DeliveryWizard.js`, `deliveryWizard.css`. Only if needed, a pure presentation helper in `deliveryWizard.mjs` (for example, a count of notes).
- **Changes:**
  1. **Split the shared branch (`:324-354`) into separate Kontroll and Pakke renders.**
  2. **Kontroll:**
     - the status heading and the summary `<dl>`;
     - «Må rettes» (errors) and «Bør kontrolleres» (warnings) expanded;
     - «Informasjon (N)» collapsed;
     - the experimental Gemini note (one line, safety-relevant);
     - photo readiness;
     - one «Tekniske detaljer» disclosure with the format/profile compatibility, unique images and occurrences, and the excluded-asset counts;
     - the eksportkontroll disclaimer once.
  3. **Pakke:**
     - the heading «Klar til nedlasting»;
     - one compact line: filename, files, photos and GML records;
     - one status line, «Kontroll fullført · N merknader», with a link-style «Se kontrollen» that uses the existing `review` action;
     - `DeliveryInventory` (still collapsed);
     - the report note;
     - after download, the existing started/SHA-256/unrecorded messages.
     - It renders **no** `Diagnostics`, `PhotoExportStatus` or format block.
  4. **Innhold:** unchanged apart from consistent copy. Its photos-only readiness block gates «Kontroller leveransen» and stays.
- **Must remain unchanged:**
  - the reducer, `deliveryWizardStatus`, `canBuild`, `build`/`download`/`report`, `isLive`/`assertDeliveryPlan` and stale invalidation;
  - focusing the heading on step change, the dialog Escape/close behaviour and the field-exclusion acknowledgement;
  - all generated bytes.
- **Tests:**
  - Update `deliveryWizardUi`, `photoExportWizardUi`, `photoExportLayoutUi`, `photoExportFlowUi`, `photoExportReturnUi` and `deliveryPolish`.
  - Add assertions:
    - the Pakke step contains no `.delivery-diagnostics`;
    - Kontroll shows errors and warnings without interaction;
    - «Se kontrollen» returns to Kontroll with the same review;
    - a stale review on Pakke still blocks download.
  - Node: `deliveryWizard`, `deliveryPlan`.
- **Browser acceptance:**
  - Kun GMI, Samlet and Kun GML at both laptop sizes;
  - a blocked delivery, which stops at Kontroll with an actionable message;
  - the footer has one primary action per step.
- **Dependencies:** none technically. It must land before FOTO exclusion slice 3. Doing it after A3 avoids touching the same file twice in parallel.
- **Risk:** low to medium. Many UI tests assert step content.
- **Model:** Opus, medium effort.

### A5: hide FOTO map markers while Rettinger is active

- **Objective:** entering Rettinger hides photo markers temporarily. The user can show them, and leaving restores exactly the previous map.
- **Scope:** `page.js` (state owner, since it already holds `gmiEditLayerId` and passes photo props to the map), `MapInner.js` (filter), `MapLegend.js` (photo-mode gating), one map-pane control. Add a pure helper and its test.
- **Changes:**
  1. **Page-level override `{ layerId, shown }`:**
     - It is created when `gmiEditLayerId` becomes non-null, with `shown: false`.
     - It is cleared when Rettinger closes or the layer changes.
     - It never calls `photoSession.setLayerVisibility` and is never persisted.
  2. **Rendering:** `MapInner` passes `photoLayers.filter(...)` to `buildPhotoMapItems` only when the override is not active, or treats the layers as not visible while suppressed. Hover, popups and the active-photo highlight for hidden markers close. `MapLegend` photo modes follow the effective visibility.
  3. **Manual control:** a `PhotoIconButton` in the map pane toolbar, «Vis bilder» / «Skjul bilder» with `aria-pressed`. It is shown only in Rettinger, and only when at least one FOTO layer is `visible` and has placed photos. The legend is not used, because U3 collapses it on workspace entry.
  4. **Layer cards** keep showing the persistent setting.
- **Must remain unchanged:**
  - `photoSession` layer state, records and `deliveryDecisions` (the snapshot `stateKey` stays identical);
  - FOTO workspace and edit-mode visibility rules;
  - U3 legend behaviour;
  - Validator field validation, which does not hide photos.
- **Tests:**
  - **Node:** the helper covers entering, show, hide, exit, a layer switch and a re-entry (re-entry hides again).
  - **Browser:**
    - entering Rettinger leaves no photo markers in the DOM;
    - the layer card checkbox is unchanged;
    - «Vis bilder» shows them;
    - leaving restores them when the layer was visible, and keeps them hidden when it was hidden;
    - `photoSession.getSnapshot()` visibility and the delivery summary are identical before and after;
    - FOTO opened through the page guard still behaves as today.
- **Browser acceptance:** enter Rettinger from Validator and from the layer panel; toggle; edit; exit; open FOTO; check that the markers and the delivery choices are intact.
- **Dependencies:** none. It is independent of the FOTO exclusion slices.
- **Risk:** low to medium. The map render path is shared.
- **Model:** Opus, medium effort.

### A6: value input filtering, individual-editor naming, back navigation

- **Objective:** typing filters S_FCODE/Tema codes, the individual review uses the same vocabulary as batch, and backward navigation is recognisable.
- **Scope:** `GmiFieldValueInput.js`, `GmiObjectEditor.js`, `GmiChangeList.js`, `GmiEditWorkspace.js` (the individual navigation bar only).
- **Changes:**
  1. **Reproduce first:** on the acceptance file, record the domain size and the control type for S_FCODE / linked Tema.
  2. **Live filtering:**
     - Use the existing combobox whenever `strictListed` is true or the list has more than a small threshold (for example 6), instead of only above 12.
     - Rank code-prefix matches before label and long-meaning matches.
     - Keep the exact-lexeme rules, upper-casing of typed drafts only, `strictListed` refusal and the keyboard behaviour.
  3. **Rename:** «Se gjennom (N)» → «Forhåndsvis endringer (N)», with the matching heading and hint texts («Forhåndsvis før du legger til», `GmiChangeList.js:37`). The `gmiEditView.mjs:119` stale message wording follows.
  4. **Back navigation:** «Tilbake til utvalget» gets a leading `ArrowLeftIcon`. «Forrige»/«Neste» get `CaretLeftIcon`/`CaretRightIcon`. Labels and handlers are unchanged.
- **Must remain unchanged:**
  - G5 value semantics (Validator owns verdicts);
  - the G8 linked staging and consent in `GmiObjectEditor`;
  - the B3 itinerary and guards.
- **Tests:**
  - `gmiFieldValueInputUi` and `gmiBatchFieldValueInputUi`: typing «V» filters to codes starting with V; ArrowDown/Enter still choose; Escape closes.
  - Update the label in `gmiEditWorkspaceUi`, `gmiEditDraftGuardUi`, `gmiIndividualSelectionUi`, `gmiObjectLinkedTemaUi` and the other suites listed in §4.5i.
  - **Individual linked Tema acceptance** (still open in §2) is part of this slice's manual run.
- **Dependencies:** none. It can be scheduled after A1 to avoid churn in the label tests.
- **Risk:** low.
- **Model:** Sonnet, medium effort.

### A7: Data Table state visibility on sticky cells; column-focus indicator truthfulness

- **Objective:** a selected or active row is visibly in that state across every cell, and the «… først» indicator is pressed only while the focused order is actually applied.
- **Scope:** `LayerDataTable.js`. If the cause is there, also `GmiBatchInspector.js:141-149` / `GmiChangeSetDetail.js:28-29`.
- **Changes:**
  1. **Compute one row-state fill** and apply it to the selection cell (`:1285`) and to every sticky zoom, identity and pinned cell (`:1306`), using the existing `--gmi-cyan-soft`. Hover must not replace a state fill. Use the `color-mix` hover recipe on the state colour, or no hover change on state rows. Do **not** introduce a new selected-versus-active tint (Open decision; Phase D).
  2. **Column focus:** first reproduce the stale indicator after an Original/Foreslått switch and after undo/redo, then fix the source. Candidates:
     - (a) `focusChoice` survives an undo while the form field is reset;
     - (b) `columnFocusOff` keyed by a signature that no longer matches;
     - (c) the indicator renders from `columnFocus` while `focusFields` is not applied in the current view.

     The rule is: `aria-pressed` equals "the focused order is in effect".
- **Must remain unchanged:**
  - 28 px rows, the 32 px selection column, sticky offsets, opaque sticky cells and horizontal scroll;
  - `aria-selected` / `aria-current` / keyboard-outline semantics;
  - contextual status cell fills;
  - the user's saved column order;
  - S5 focus ownership.
- **Tests:**
  - **Browser:** computed background of the sticky cells equals the row's state fill for selected, active, both, and hover over each; status cells stay readable.
  - **Node or browser:** the column-focus indicator is unpressed or absent after undo, Original view and mode change, whenever the order is not applied.
  - **Updated suites:** `layerTableRevealUi`, `gmiCheckboxSoftFocusUi`, `gmiValidatorSelectionUi`.
- **Dependencies:** none. It touches the table only.
- **Risk:** medium. The table is a protected-geometry surface.
- **Model:** Opus, medium effort.

---

### Phase B: FOTO delivery exclusion (separate plan, unchanged)

- Implement slices 1–3 (and optionally 4) of `20261114-090612-foto-delivery-exclusion-plan.md` after you decide its D1–D5. This plan does not settle them.
- **Ordering constraint:** exclusion slice 3 goes after A3 and A4. Exclusion slices 1–2 may run in parallel with Phase A.

### Phase C: legacy retirement (after A1, A2 and A6 are accepted, and after Phase B)

- **C1: remove Validator «Lag retting…».**
  - Remove the items listed in §4.6: button, `correctable`/`startCorrection`, the correction-only exports from `gmiValidatorEditing.mjs`, `gmiEditWorkspace.correction`, and `enterCorrection`.
  - **Before removing,** migrate `gmiValidatorEditingUi`'s R5 viewport-bounds and Original-default contracts onto the H2/H3 «Åpne i Rettinger» path, so equivalent coverage remains.
  - Remove or adjust the `validationV2RuleCountsBrowser` reference.
  - Opus, medium effort.
- **C2: remove the «Masseendringer» footer action and `GmiBatchDialog.js`.**
  - First produce a parity note. The dialog's whole-layer hydraulic review with «Bare nye feil», search and paging (roadmap R7) must be covered by table selection plus the inspector, or explicitly dropped by you.
  - Retire `gmiEditBatchUi` dialog cases or port them to the inspector.
  - Remove only the `gmiEditBatchView.mjs` exports that nothing else imports.
  - Run the full serial Node suite and the Rettinger browser gate.
  - Opus, medium effort.
- **Rule:** remove only after the replacement path is verified on a real file. The modern «Rediger valgte (N)» path stays.

### Phase D: app-wide styling audit (last; not started here)

Run one Opus high-effort pass after Phase C, per AGENTS.md and the styling consolidation report. The items are listed in §6.

## 6. Explicitly deferred styling items

These are recorded and not planned for Phase A, except where a slice touches the control and AGENTS.md already settles the rule.

1. **Selected vs active row fills.** Both are `--gmi-cyan-soft` today. This is styling open decision 3. A7 only extends the existing fill to the sticky cells.
2. **Hover feedback gaps** (styling report class D):
   - `.delivery-tree-controls button`;
   - the Rettinger Filter/Endringer tabs (`GmiEditWorkspace.js:370-371`);
   - the selection-view toggle (`LayerDataTable.js:1105-1107`);
   - dialog close buttons outside `.photo-collection-header`.

   A4 and A1 must give hover states to the buttons they touch.
3. **Close-control shape and size, and module navigation consistency** (open decision 6). This covers the Rettinger back arrow, the inspector's «Avslutt» text button and the wizard's `XIcon` 22 px.
4. **Primary colour:** navy global vs teal module overrides (open decision 1). Phase A matches the host module.
5. **Global teal `accent-color` base rule** (open decision 2). Phase A surfaces already have `.gmi-batch-inspector input` and `.delivery-exclusion input` teal. Known unstyled controls (`GmiObjectEditor` confirmation checkboxes, `PhotoWorkspaceCollection` filters) are audit items. A6 touches `GmiObjectEditor` and should add `accent-gmi-interactive` there, because AGENTS.md treats a touched native-blue control as a defect.
6. **Other items:** contextual result-cell hex literals (`#fef2f2`, `#fffbeb`, `#f0fdf4`); the warning hue set; the teal tint token; error-red literals; radii; font-weight 600; the reset-icon meaning; legacy `--color-*` themes; and the `PhotoIconButton` location.

## 7. Outstanding decisions (only where genuinely needed)

- **D1. Scope of the B2 «mixed» confirmation trigger.**
  - Today, any mixed Tema/Material/Dimensjon/Stedfestingsårsak value across the changing objects forces the risk dialog, whichever field is edited.
  - **Recommendation:** keep the trigger unchanged in A2 and make it concise (presentation only).
  - If you want fewer dialogs, a later small slice could limit `mixed` to the edited field plus its governing rule's context columns. That relaxes a deliberate safeguard, so it needs your explicit approval.
- **D2. FOTO override on re-entry (A5).**
  - **Recommendation:** every entry into Rettinger hides photos again; the «Vis bilder» choice lasts for that visit only.
  - Alternative: remember the choice for the browser session.
- **D3. Legacy dialog capabilities (C2).** Confirm that the `GmiBatchDialog` whole-layer hydraulic review («Bare nye feil», search, paging) may be dropped in favour of table selection. Otherwise it must be ported first.

No other decision blocks Phase A. A1, A3 and A4 can start immediately.

## 8. Risks and unverified items

- **Browser-contract churn (A1, A2, A4, A6).** Many suites select by visible label (`Endre oppsett`/`Legg til masseendring`: 14 files; `Se gjennom`: 15 files). Add `data-*` hooks first, change labels second, and explain every assertion change. Never relax the geometry or safety thresholds.
- **Hypotheses needing reproduction:**
  - the cause of the stale column-focus indicator (A7);
  - the cause of the S_FCODE filtering problem, whether select threshold or weak substring ranking (A6);
  - whether the Validator's position-based labels (`diagnostics.js:106-108`) reach any user-facing report. Check this during A3 and report it; do not fix it there.
- **Draft-guard change (A1)** narrows when the guard arms. Coverage must prove that no typed value or preview can be lost silently.
- **Map override (A5)** touches the shared map render. Verify that the hover/popup controllers tolerate markers disappearing mid-hover.
- **Not covered by automation:**
  - individual S_FCODE acceptance (manual, during A6);
  - Gemini VA (G4) recipient acceptance (manual, external; unchanged by this plan);
  - the real-file pass at both laptop sizes with one keyboard-only run, after A1, A2 and A4.

## 9. Commands, files and Git

- **Commands run:**
  - `git rev-parse --abbrev-ref HEAD` → `feature/photo-workspace`; `git rev-parse --short HEAD` → `8bb6f07`;
  - `git status --short` → the two untracked reports named above;
  - read-only `cat`/`sed`/`grep`/`wc` over the files cited;
  - `date`.

  No tests, lint, builds or browser runs (planning only). `git diff --check` is not applicable: the only change is this untracked report.
- **Files changed:** `docs/agent-reports/20261114-160730-rettinger-export-ux-consolidation-plan.md` (new, this report).
- **Git status at the end:** three untracked reports (the two pre-existing ones, unchanged, and this one). Nothing was staged, committed, pushed or deployed.
