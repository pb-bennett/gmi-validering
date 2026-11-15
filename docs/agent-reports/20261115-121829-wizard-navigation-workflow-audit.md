# Wizard navigation and workflow audit (REVIEW / PLANNING DRAFT)

**Status: review only. Nothing in this report is implemented.** Written 2026-11-15 (Europe/Oslo) in `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `56f0ea6`. The tracked tree was clean at start and is clean at the end. No application code, CSS, tests, `AGENTS.md` or existing reports were changed. No subagents were used.

## 1. Summary

- **There are four live wizards and one legacy wizard.** Three are modal dialogs that already share one frame, one step indicator and one footer (export, photo import, photo positioning). The fourth, Masseendring, lives in the Rettinger inspector and has no footer at all. The legacy «Masseendringer» dialog is a second implementation of the same job.
- **The agreed footer standard fits all four without a new framework.** The three dialog wizards need small corrections. Masseendring needs a real footer and a simpler back/forward model. I recommend applying the contract in place, file by file.
- **Three navigation defects change what the user gets, not only how it looks:**
  1. Masseendring has two back paths and a retained preview that the user must reason about (your known findings, confirmed in code).
  2. In the export wizard, «Tilbake» on the download step skips Kontroll and throws away the completed check.
  3. In «Koble og posisjoner bilder», «Tilbake» from Plassering skips a numbered step, and forward from Kilder skips the same step.
- **The FOTO removal Escape defect is still present at this HEAD** (source only; not re-run in a browser). It is the same class of problem as wizard cancellation: a mode-level Escape handler that fires underneath an open dialog. Fix it first, separately, because the delivery-mode cleanup edits the same handler.
- **Four decisions are needed from you before the last slices** (section 8): forward-button wording, final-action treatment, where «Rett én og én» goes, and what a map marker click does once the delivery mode is gone.

## 2. Method and limits

- **Read:** `AGENTS.md`; the UI unification review (`20261114-221747`); the FOTO direct delivery report (`20261115-093631`); the A3/A4 wizard report for the reasons behind «Se kontrollen».
- **Source inspected at HEAD `56f0ea6`:** `GmiBatchInspector.js`, `GmiEditWorkspace.js`, `GmiObjectEditor.js`, `GmiBatchDialog.js`, `GmiConfirmDialog.js`, `gmiEdit.css`, `DeliveryWizard.js`, `deliveryWizard.mjs`, `PhotoImportWizard.js`, `photoImportWizardState.mjs`, `PhotoImportPlacementStep.js`, `PhotoImportReviewStep.js`, `PhotoPositioningWizard.js`, `PhotoWizardSteps.js`, `PhotoSourceOption.js`, `PhotoCompletionDialog.js`, `PhotoWorkspaceCollection.js`, `photoWorkspaceState.mjs`, `PhotoWorkspaceToolsMenu.js`, `PhotoEditCommandBar.js`, `PhotoExclusionActions.js`, `RemovePhotosConfirmation.js`, `PhotoEditBoundaryDialog.js`, `PhotoMarkersLayer.js`, the photo and Rettinger parts of `page.js`, the source-workflow part of `photoSession.mjs`, `FileUpload.js`, and repository greps for Escape handlers and for the labels that tests select.
- **Everything below is confirmed in source.** No browser session, test run, build or lint was done (review only). Behaviour that depends on layout (for example whether a footer fits at 1280×720) is marked as needing a browser check.
- **Prior screenshots that remain valid for this audit:** `10-rettinger-batch-setup-1366.png`, `12-rettinger-batch-preview-1280.png`, `13-rettinger-risk-dialog-1366.png`, `18-wizard-package-1280.png`, `21-foto-import-files-1366.png`, `32-wizard-samlet-review-1280.png` in `assets/20261114-221747-ui-unification-review/`. `28-foto-exclusion-mode-1280.png` shows a mode that has since been removed.

## 3. A. Inventory

### 3.1 Genuine wizards

| ID | Workflow | Host | Files | Stages |
|---|---|---|---|---|
| W1 | Masseendring | Rettinger inspector panel (not modal) | `src/components/gmi-edit/GmiBatchInspector.js`; mounted from `GmiEditWorkspace.js:398`; risk approval in `GmiConfirmDialog.js` | Velg objekter → Oppsett → Forhåndsvis → Lagt til |
| W2 | Eksporter leveranse | Modal `<dialog>` | `src/components/delivery/DeliveryWizard.js`; reducer in `src/lib/delivery/deliveryWizard.mjs:16-43`; entries `GmiExportDialog.js`, `PhotoExportWizard.js` | Innhold → Kontroll → Pakke / Last ned |
| W3 | Legg til bilder | Modal `<dialog>` | `src/components/photos/PhotoImportWizard.js`; `src/lib/photos/photoImportWizardState.mjs` | Bilder → Plassering → Kontroll (two of these in some contexts) |
| W4 | Koble og posisjoner bilder | Modal `<dialog>` | `src/components/photos/PhotoPositioningWizard.js` | Kilder → Koblinger → Plassering → Kontroll |
| W5 | Masseendringer (legacy) | Modal `<dialog>` | `src/components/gmi-edit/GmiBatchDialog.js`; opened from `GmiEditWorkspace.js:384` | Velg verdi → Se gjennom og bekreft |

W2, W3 and W4 share `.photo-collection-dialog`, `PhotoWizardSteps.js` and `.photo-import-footer` (`globals.css:51`).

### 3.2 Not wizards (and should not become wizards)

| Surface | Kind | Why it is not a wizard | Files |
|---|---|---|---|
| Object editor (form → Forhåndsvis → Legg til retting) | Two-stage staged editor | One object, one preview gate. Already follows the back/forward model W1 should adopt | `GmiObjectEditor.js:247-356` |
| «Rett én og én» itinerary | Pager over a selection | Forrige/Neste move between objects, not stages | `GmiEditWorkspace.js:404-413` |
| FOTO «Juster plassering og retning» | Editing mode with staged values | Explicit Lagre/Forkast and a boundary dialog; no stage order | `PhotoEditCommandBar.js`, `page.js:266-332` |
| FOTO «Fjern bilder fra laget» | Selection mode + confirmation | Multi-select needs a mode; one confirmation | `PhotoWorkspaceCollection.js:217-253`, `RemovePhotosConfirmation.js` |
| FOTO «Fordel bilder til GMI/GML» | Mode with no state of its own | Every click writes one decision at once (`photoWorkspaceState.mjs:27`). See finding N5 | `PhotoWorkspaceCollection.js:222-230`, `PhotoMarkersLayer.js:98-101,150-156` |
| «Fullfør opplysninger» | Task hub | Non-linear task list, immediate saves; it hands off to the map or to W4 and returns | `PhotoCompletionDialog.js`, `page.js:402-433` |
| Validator → Rettinger handoff and return | Cross-module journey | Two workspaces, no stages | `LayerDataTable.js:1102`, `GmiEditWorkspace.js:132-139` |
| GMI/KOF/SOSI import | Single action | Choose or drop a file; one `window.confirm` for a missing CRS | `FileUpload.js:184` |
| Confirmations and ordinary dialogs | Prompts | `GmiConfirmDialog`, `RemovePhotosConfirmation`, exclusion confirmation, `PhotoEditBoundaryDialog`, `PhotoCaptureMetadataDialog`, `PhotoSourcesInfoDialog`, `AppInfoModal`, the six older overlay modals | — |

No GMI onboarding wizard exists. The import is one step, and I do not recommend adding stages to it.

## 4. B. Stage and action matrices

Columns: what the user decides; the actions and where they are; what Back, Forward and Cancel really do.

### W1 Masseendring (`GmiBatchInspector.js`)

| Stage | User decides | Actions and location | Back | Forward | Cancel |
|---|---|---|---|---|---|
| Velg objekter (always shown as done) | Which objects, in the Data Table | None in the inspector | — | — | — |
| Oppsett | Field, value, mode (and the value to replace) | Header: «Rett én og én», «Avslutt» (`:337-340`). In the form: «Forhåndsvis endringer» and, when a preview is retained, «Tilbake til forhåndsvisningen» (`:320-321`). A note «Forhåndsvisningen er beholdt …» (`:360`) | None | `calculate()` builds a new preview from the current inputs and the live selection (`:180-203`) | «Avslutt» → draft guard if a value, a match or a preview exists (`GmiEditWorkspace.js:399`, `:107-117`), then the inspector closes; the selection is kept |
| Forhåndsvis | Whether to add the correction; optional manual inclusion; whether to replace earlier corrections | Header as above. In the proposal box: «Tilbake til oppsett» (`:372`). After the options: «Legg til masseendring» (`:426`). When stale: «Oppdater forhåndsvisning» inside the alert (`:386`) | `backToSetup` shows the form but **keeps** the preview (`:287`). Any input change then discards it (`invalidate`, `:179`) | `stage()` re-checks session, selection and plan, opens the risk dialog when needed, then stages (`:204-245`) | As Oppsett |
| Risk dialog | Approve a flagged change | «Tilbake til utvalget», «Godkjenn og legg til» (`:463-465`) | Closes the dialog; returns to Forhåndsvis | Stages after re-checking that plan and selection are the approved ones (`:206-217`) | Escape = «Tilbake til utvalget» |
| Lagt til | Start another, or leave | ChangeSet details with Angre; «Ny masseendring for utvalget» (`:354`) | None (Angre in the details undoes the correction) | Returns to Oppsett with an empty form | «Avslutt», no guard (the form is clean) |

Escape does nothing in the inspector. That is correct for a non-modal panel.

### W2 Eksporter leveranse (`DeliveryWizard.js`)

| Stage | User decides | Footer (left to right) | Back | Forward | Cancel |
|---|---|---|---|---|---|
| Innhold | Delivery type, layers, label, photo settings, acknowledgement that field corrections are left out | status · «Avbryt» · «Kontroller leveransen» | — | `build()` captures a fresh snapshot of the current inputs and builds a plan (`:178-190`) | `close()` invalidates running work and unmounts (`:211`) |
| Kontroll | Whether the findings are acceptable | «Avbryt» · «Tilbake til Innhold» · «Til pakke» | Reducer `back`: resets to the start state and **drops the plan** (`deliveryWizard.mjs:19-20`). Inputs are component state and are kept | `package`: navigation only, same plan | As Innhold |
| Pakke / Last ned | Download | «Avbryt» (or «Lukk» after download) · «Tilbake til Innhold» · «Last ned rapport» · «Last ned ZIP» / «Last ned GMI» | The same `back`: **skips Kontroll and drops the plan**. The step link «2. Kontroll» and the in-content «Se kontrollen» go to Kontroll and keep the plan (`:98`, `:221-223`) | `download()` re-asserts the plan, builds the package, saves it and records the download (`deliveryWizard.mjs:180-191`) | Closing during packaging stops before the file is saved and before anything is recorded (`isActive`, `:183`) |
| Stale (any stage after Kontroll) | — | «Tilbake og kontroller på nytt» replaces Back; forward is disabled | To Innhold | — | As above |

Escape and the header X both call `close()`.

### W3 Legg til bilder (`PhotoImportWizard.js`)

| Stage | User decides | Footer | Back | Forward | Cancel |
|---|---|---|---|---|---|
| Bilder | Which photos | status · «Avbryt» · «Neste» | — | Next step | `photoSession.cancelImport()`; the whole draft is discarded without a question (`page.js:445-448`) |
| Plassering (not in the GMI-layer context) | Position source | status · «Avbryt» · «Tilbake» · «Neste», or the final action when «Uten plassering» is chosen | Previous step; choices kept (`photoImportWizardState.mjs:10-12`) | Next step | As Bilder |
| Kontroll | Whether the outcome is right; two optional inclusions | status · «Avbryt» · «Tilbake» · «Opprett fotolag» / «Legg til i fotolaget» | Previous step | `completeImport` re-validates the preview; a changed source is refused with a message (`:126-127`) | As Bilder |

This wizard already meets the standard for footer order, back behaviour and final-action naming.

### W4 Koble og posisjoner bilder (`PhotoPositioningWizard.js`)

| Stage | User decides | Footer | Back | Forward | Cancel |
|---|---|---|---|---|---|
| 1 Kilder | Add, re-check or remove a source | «Avbryt» · «Kontroller tilgjengelige posisjoner» | — | Goes to **step 3** (`positions()`, `:204-209`) | Unmount; an unsaved source review is cleared (`photoSession.mjs:616-622`) |
| 2 Koblinger (only has content while a source is being reviewed or was just saved) | Whether to keep the source and its links | «Avbryt» · «Tilbake» · «Behold kilde og koblinger» / «Behold GML-kilden» / «Oppdater …»; then «Kontroller tilgjengelige posisjoner» | To step 1 | **Commits the source to the layer** (`keepSource`, `:198-203`). GMI then goes on to step 3; GML stays on step 2 | After a commit the label becomes «Fullfør uten å endre posisjoner»; the saved source stays (`:352`) |
| 3 Plassering | A position per photo | status · cancel · «Tilbake» · «Neste» | To **step 1** (`goBack(step === 4 ? 3 : 1)`, `:353`) | To step 4 | As above; all per-row choices are lost without a question |
| 4 Kontroll | Confirm | status · cancel · «Tilbake» · «Bruk valgte posisjoner for N bilder» | To step 3 | `applySourceWorkflowPositions`; a changed plan is refused and the user is sent to step 3 (`:210-215`) | As above |

In-content navigation: «Se uspart kilde» (step 1 → 2, `:275`), «Legg til en kilde» (step 2 → 1, `:290`), «Forkast uspart kilde» (`:289`), and an inline «Avbryt fjerning» / «Fjern GMI-kilde» pair (`:251-260`).

### W5 Masseendringer, legacy (`GmiBatchDialog.js`)

Footer «Avbryt» · «Tilbake» · «Beregn utvalg» / «Legg til masseendring» (`:177-183`). Back drops the preview and recalculates on forward. Cancel asks before discarding a dirty form (`:57`, `:196`). It already matches the standard; its stage names differ from W1.

## 5. C. Findings

Ranked by user impact. All are confirmed in source at HEAD `56f0ea6`.

### P0: safety

#### N1. Escape in the FOTO removal confirmation still leaves the dialog armed

- **Evidence:** the confirmation is rendered inside the collection `<section>` (`PhotoWorkspaceCollection.js:247`). The section's `onKeyDown` handles Escape for `removal || deliveryMode` and calls `preventDefault()` (`:142`), which suppresses the dialog's native `cancel` event, so `onCancel` (`RemovePhotosConfirmation.js:14`) never runs. The mode switches to `browse`, but the dialog holds its own copy of the ids (`:242`) and still removes them. `RemovePhotosConfirmation.js` has not changed since commit `8d61232`.
- **Relation to navigation:** this is the general hazard for every cancel pattern in the app: an Escape handler on a mode surface that also hosts a modal. The page-level handler already guards against it (`page.js:492`: it returns when a `dialog[open]` exists). The section handler does not.
- **Other instances checked:** none found. The wizards are mounted at the page root, the exclusion confirmation stops propagation itself (`PhotoExclusionActions.js:26`), and the Rettinger inspector has no Escape handler.
- **Recommendation:** keep the remediation independent (slice U0 of the earlier review), but do it **before** the delivery-mode cleanup, which edits the same line.

### P1: navigation that changes the outcome or misleads

#### N2. Masseendring: three navigation locations, two back paths and a retained preview

- **Evidence:** navigation sits in the header (`:337-340`), in the proposal box (`:372`) and in the form (`:320-321`). «Tilbake til oppsett» keeps the preview (`editingSetup`, `:70`, `:287`); «Tilbake til forhåndsvisningen» returns to it (`:288`); a note explains that it was kept (`:360`). The primary action is in a different place in each stage (form, after the options, after the details).
- **What is safe today:** the retained preview is never wrong for the *setup*: any input change calls `invalidate()`. It can be stale for the *selection or session*; that case is detected (`:99-100`), flagged and cannot be staged.
- **User impact:** the user is asked to track whether a preview "still exists", which is an internal caching decision. At 1280×720 the stage action can be below the fold (open item from the A1 report).
- **Recommendation:** section 7, W1.

#### N3. Export wizard: «Tilbake» on the download step discards the check and skips a step

- **Evidence:** both back buttons dispatch `back` (`DeliveryWizard.js:275`, `:191`), which returns `DELIVERY_WIZARD_START` (`deliveryWizard.mjs:19-20`). The reducer already has a `review` action that goes from Pakke to Kontroll with the same plan (`:26-27`); the step link and «Se kontrollen» use it.
- **User impact:** one click on the button next to «Last ned ZIP» removes a completed check; returning costs a full rebuild. Three controls on one screen lead backwards to two different places.
- **Recommendation:** footer «Tilbake» always goes one step back. No reducer change is needed.

#### N4. Positioning wizard: back and forward skip a numbered step, and a commit happens mid-wizard

- **Evidence:** forward from Kilder goes to step 3 (`:354`, `:204-209`). Back from Plassering goes to step 1 (`:353`). Step 2 is always numbered in the indicator but has content only during a source review. `keepSource` writes the source to the layer at step 2 (`:198-203`), after which «Avbryt» is renamed.
- **What is safe today:** cancelling clears an unsaved review (`photoSession.mjs:616-622`); a saved source stays by design; positions change only at step 4; a changed plan is refused.
- **User impact:** the step numbers do not predict where Back and Forward lead. The two-commit model is explained with a two-item stage list (`SourceStages`, `:42-56`), a lead paragraph (`:236`) and a saved notice, which is a lot of text about internal staging. The word «uspart» is used for "not saved".
- **Recommendation:** fix the step sequence and remove the duplicate in-content navigation. Do **not** restructure the two commitments now; the source ticket and review model are safety contracts.

#### N5. FOTO delivery planning is a mode that gates almost nothing

- **Evidence:** the mode has no state of its own (`photoWorkspaceState.mjs:27`). It changes three things:
  1. the list pill becomes a cycle button (`PhotoWorkspaceCollection.js:53`, `:59`);
  2. a click on an isolated map marker changes its delivery choice instead of selecting the photo, and a stacked marker opens a chooser (`PhotoMarkersLayer.js:98-101`, `:150-156`);
  3. a bar shows the title, «Ferdig», a permanent instruction and the counts (`:222-230`).
- The inspector's three-way control works in every mode. Any tool, and Escape, already leaves the mode silently (`page.js:326`, `:503`).
- **Implication of removing the mode:** items 1 and 3 are simple (always show the cycle button; keep the counts in the existing summary line, `:158`). Item 2 is a real decision: without a mode, a marker click must keep selecting the photo, otherwise ordinary map navigation would change delivery choices. See question Q4.
- **Risk to note:** with the button always live, one mis-click changes a delivery choice with no undo. It is a three-state cycle, the change is announced, and Kontroll shows the counts, so I consider this acceptable.

#### N6. Forward, back and cancel are named and placed differently in every wizard

| | Cancel | Back | Forward (not final) | Final |
|---|---|---|---|---|
| W1 | «Avslutt», header | «Tilbake til oppsett», in content | «Forhåndsvis endringer», in the form | «Legg til masseendring», in content |
| W2 | «Avbryt» / «Lukk», footer | «Tilbake til Innhold», footer | «Kontroller leveransen», «Til pakke» | «Last ned ZIP» / «Last ned GMI» |
| W3 | «Avbryt», footer | «Tilbake», footer | «Neste» | «Opprett fotolag» / «Legg til i fotolaget» |
| W4 | «Avbryt» / «Fullfør uten å endre posisjoner», footer | «Tilbake», footer | «Kontroller tilgjengelige posisjoner», «Behold …», «Neste» | «Bruk valgte posisjoner for N bilder» |

- Final actions are all teal primaries and look exactly like «Neste». Final-action names are accurate everywhere.
- Footer sizes: dialogs use a 40 px primary and `px-3 py-2` secondaries; the inspector uses 30–32 px (`gmiEdit.css:342-348`). The difference follows the compact inspector density and should stay.

### P2: consistency and comprehension

- **N7. «Tilbake til utvalget» means two things.** In the risk dialog it closes the dialog and returns to Forhåndsvis (`GmiBatchInspector.js:465`); in the itinerary it returns to the batch inspector (`GmiEditWorkspace.js:405`). The first is a leftover from the legacy dialog, where the step was called the selection.
- **N8. «Rett én og én» is the only entry to the itinerary.** `data-gmi-individual-entry` exists only in the batch header (`:337`). With the inspector open, a row click only inspects (`GmiEditWorkspace.js:163-168`). The setup text also refers to the button by name (`:298`). Removing it from the header without a new home removes the B3 feature. See Q3.
- **N9. Removing a GMI source inside W4 is destructive, immediate and styled neutral.** Both inline buttons use the same neutral class (`:253-259`). It is not undone by «Avbryt». Escape while the inline question is open closes the whole wizard (nothing is removed, so this is the safe direction).
- **N10. Export wizard footer and content.** «Last ned rapport» sits between «Tilbake» and the final action (`:278`). After N3 is fixed, «Se kontrollen» duplicates the footer «Tilbake» and the step link. On Innhold, «Fullfør opplysninger…» can be styled as a second primary while the footer primary is disabled (`:253`).
- **N11. Cancelling W4 at Plassering or Kontroll silently loses per-row choices.** W1 asks before discarding typed values; W4 can hold dozens of manual choices and does not. W2 and W3 hold nothing that is expensive to redo.
- **N12. GMI import: «Avbryt» in the CRS question selects UTM 33** (`FileUpload.js:184-190`). The text says so, but Cancel and Escape do not cancel. The earlier review deferred replacing `window.confirm`; I only record that it breaks the cancel rule.
- **N13. «Tilbake til masseendringen» is a close action, not navigation** (`GmiBatchInspector.js:449`). The object detail is appended below the wizard, which stays visible.
- **N14. The header X of W3 is named «Lukk bilder»** although it cancels the import and discards the draft (`PhotoImportWizard.js:99`). W4 names its X by effect («Avbryt kildekontroll» / «Lukk kildekontroll»).
- **N15. Two step-indicator styles.** Dialogs use `PhotoWizardSteps` (numbered text, earlier steps are back links). W1 uses numbered circles with check marks, not clickable (`gmiEdit.css:281-286`). Both are clear in their host; I do not recommend merging them.
- **N16. W5 duplicates W1** with other stage names and is opened by a button named almost the same as the inspector («Masseendringer» / «Masseendring»). The UX plan already retires it (C2).

## 6. D. Recommended navigation contract

No new framework. The contract is a set of rules that each wizard applies in its own file; the three dialog wizards already share the footer class, the button classes and the step indicator.

**Footer anatomy** (one row, fixed at the bottom of the wizard, same in every stage):

`[status or reason text, left] … [Avbryt] [Tilbake] [Neste or final action]`

| Control | Rule |
|---|---|
| Avbryt | Always present, first in the button group, neutral, low emphasis. Same handler as the header X and (in modal wizards) Escape. Labelled «Lukk» once the final action has been carried out, or once something has been saved mid-wizard |
| Tilbake | Neutral secondary with the strong border, immediately left of the forward button. Absent on the first stage (not disabled). Goes to the immediately preceding **visible** step. Keeps every input. Silently drops derived results (preview, check) |
| Neste | Teal primary, rightmost. When disabled, the reason is in the status text, connected with `aria-describedby` |
| Final action | Same slot as Neste. Names the verb and the object, with a count where it helps. Distinct treatment per Q2 |
| Other actions | Not between Tilbake and the forward button. Secondary downloads and tools sit in the content next to what they act on |

**State rules**

1. Back keeps inputs. Forward always recomputes derived data from the current inputs. A derived result from earlier inputs is never reachable by navigation.
2. Staleness checks stay as they are and fail closed. A stale result is shown in place with one action («Oppdater …»); it is not a place the user can navigate to.
3. Approvals (risk approval, manual inclusion, "replace earlier corrections", the field-exclusion acknowledgement) belong to one derived result and are never carried to a new one.
4. Cancel leaves nothing half-done. Running work is invalidated by token. If the wizard has already committed something, the cancel control says «Lukk» and the status text says what was saved.
5. Cancel asks first only when it would discard entered work that cannot be rebuilt cheaply (typed values, many manual choices). It does not ask otherwise.

**Keyboard**

1. On a stage change, focus moves to the stage heading (already done in W2–W4; W1 focuses the proposal).
2. Escape: in a modal wizard it is Avbryt, with the same guard. In a panel-hosted wizard (W1) it does not leave the wizard. Menus, comboboxes and nested dialogs consume Escape first.
3. A mode-level or page-level Escape handler must do nothing while a `dialog[open]` exists (the rule already used at `page.js:492`).
4. Closing returns focus to the opener (already done everywhere).
5. Busy: `aria-busy`, the control disabled, progress in the label. Tilbake is disabled while the final action runs; Avbryt stays available.

**Stage indicator:** numbered list with `aria-current="step"`. Earlier steps may be links that do exactly what repeated Tilbake does. No forward jumps. A conditional step is left out of the list while it does not apply (as W3 already does).

**Text:** no paragraph that explains how the navigation works. Warnings, blocked-action reasons, staleness messages and "nothing is changed until you confirm" statements stay.

## 7. E. Changes per wizard

### W1 Masseendring

**Essential**

- Add a footer to the inspector with «Avbryt», «Tilbake» (Forhåndsvis only) and the forward or final action. Use `position: sticky; bottom: 0` on a footer inside the section, as the object editor already does (`gmiEdit.css:141`). The scroll owner (`.gmi-edit-inspector`) stays unchanged. Pinning the footer to the pane bottom when the content is short needs a small layout rule on `.gmi-batch-inspector` and a browser check.
- Move «Avslutt» into the footer as «Avbryt», with the same `onRequestClose` handler and draft guard. In Lagt til it reads «Lukk».
- Remove the in-content «Tilbake til oppsett», «Tilbake til forhåndsvisningen» and the note about the retained preview.
- Back drops the preview: replace `editingSetup` with a call that clears the review and keeps field, value, mode and match. `invalidate()` already does exactly this.
- Forward always calls `calculate()`.
- When the preview is stale, the footer primary is «Oppdater forhåndsvisning» and the stage action is absent. The alert text stays.
- Put the blocked-action reason (`:427-429`) in the footer status area so it is visible with the button.

**Technical and safety implications of these changes**

| Effect | Assessment |
|---|---|
| The Data Table loses the preview rows and the «Endring» column when the user goes back, because `gmiBatchTableReview` follows `review` (`:139-146`) | Correct: the table no longer shows a proposal that the form may not match. The edited field keeps column focus through `focusChoice` (`:149-150`) |
| Manual inclusions, «Tillat manuelt utvalg» and «Erstatt tidligere rettinger» are reset on every recalculation (`:186`) | Intended (rule 3). Today they survive a round trip to Oppsett |
| Back then forward without changes repeats the preview and the four-phase full control | Cost only. Do not add a hidden cache; it would bring back the staleness reasoning this change removes. Measure with a large selection |
| In «Tøm verdi» mode with no value, the form is not a draft after Back (`dirty`, `:82`) | Consistent with the A1 rule that a field or mode choice alone is no draft |
| `stage()` gates (`:204-217`), the stale checks and the risk dialog | Unchanged |
| «Avbryt forhåndsvisning» (`:445`) cancels a running calculation, not the wizard | Keep it out of the footer, next to the progress text, so two controls named Avbryt never sit together |

**Consistency**

- Risk dialog cancel label: «Avbryt» (the component default) instead of «Tilbake til utvalget».
- «Tilbake til masseendringen» on the object detail becomes a close control for the detail.
- «Rett én og én»: per Q3.

**Optional:** shorten the field-policy paragraph (`:298`) once «Rett én og én» has its new home.

**Unchanged:** stage model and names; `calculate`, `stage`, approval and stale logic; the risk dialog content and its orange approve button; selection profile and narrowing; Lagt til content; focus handling after staging; the draft guard.

### W2 Eksporter leveranse

**Essential**

- Footer «Tilbake» goes one step back: Pakke → Kontroll with the existing `review` action, Kontroll → Innhold with `back`. Label «Tilbake» in both.
- Keep the stale case as it is: «Tilbake og kontroller på nytt» to Innhold. Kontroll has nothing to show for a stale plan, and the acknowledgement may need renewing.

**Consistency**

- Move «Last ned rapport» out of the navigation group, next to the sentence that explains the report (`:101`).
- Remove «Se kontrollen» once the footer does the same (your decision; it was added deliberately in A4 and three test files use it).

**Optional:** keep «Fullfør opplysninger…» neutral in the content and let the footer status carry the reason.

**Unchanged:** the reducer; build, download and close logic; «Avbryt» → «Lukk» after download; Kontroll and Pakke content; the acknowledgement checkbox; the hub round trip.

### W3 Legg til bilder

**Essential:** none.

**Consistency:** name the header X by its effect («Avbryt import»).

**Optional:** none. Do not add a cancel confirmation.

**Unchanged:** everything else, including the dynamic step list and the «Neste» label.

### W4 Koble og posisjoner bilder

**Essential**

- Make the sequence linear. Leave «Koblinger» out of the step list unless a source is being reviewed or was saved in this session (the pattern `importSteps` uses in W3). «Tilbake» then always goes to the previous listed step.

**Consistency**

- Remove «Se uspart kilde» and «Legg til en kilde»; the footer and the step list cover both.
- Style «Fjern GMI-kilde» as destructive.
- After a save, label the cancel control «Lukk»; the existing saved notice already states that positions are unchanged.
- Replace «uspart» with «ikke lagret».

**Optional**

- Ask before cancelling when the user has changed per-row choices (N11).
- Shorten the staging explanation at steps 1 and 2 to one line each.

**Unchanged:** the ticket and review model; the separate source commit; «Oppdater kontrollen» and the rule that new evidence never widens the selection by itself; the apply refusal; all Kontroll content.

### W5 Masseendringer (legacy)

No navigation work. Retire it as already planned (C2).

### FOTO delivery planning (adjacent cleanup, N5)

- Remove the `delivery` mode, the tools-menu item, the bar, «Ferdig» and the instruction.
- Always render the list cycle button for occurrences that have a delivery entry.
- Keep the counts in the existing summary line.
- Marker behaviour per Q4.
- Removal mode, edit mode and the inspector control stay as they are.

## 8. Open design questions

| # | Question | Recommendation | Evidence |
|---|---|---|---|
| Q1 | Should every non-final forward button read «Neste»? | Use «Neste» for plain navigation. Keep a verb where advancing runs a check whose result is the next stage («Forhåndsvis endringer», «Kontroller leveransen»). «Til pakke» becomes «Neste» | «Forhåndsvis endringer» is selected by label in 25 test files, «Kontroller leveransen» in 11, «Til pakke» in 10 |
| Q2 | How is the final action made distinct with the existing palette? | Navy fill (`--gmi-navy`, the unscoped `.gmi-primary-control` look) with a leading Phosphor icon; «Neste» stays teal without an icon. This settles the open primary-colour item as "teal proceeds, navy commits" and must be recorded in `AGENTS.md`. Fallback if you prefer no colour decision now: teal with a leading icon | `AGENTS.md` forbids a third primary variant and forbids status colours for actions; navy and teal are the two existing primaries |
| Q3 | Where does «Rett én og én» go? | One low-emphasis link in the Oppsett content, replacing the policy sentence that names it. Alternative: next to «Rediger valgte» in the Data Table selection bar, which is more logical but touches a protected, crowded bar (F13 of the earlier review) | Only entry to the itinerary; selected by label in 3 test files |
| Q4 | What does a map marker click do without the delivery mode? | It selects the photo, as in browse mode. Delivery changes are made in the list and the inspector. The stacked-marker chooser (`PhotoDeliveryMapPopup`) is then unused and can be removed | Marker cycling exists only inside the mode (`PhotoMarkersLayer.js:150-156`) and is asserted in `deliveryWizardUi` and `photoMarkerProvenanceUi` |
| Q5 | Remove «Se kontrollen»? | Yes, after N3 | Three test files; added on purpose in A4 |

## 9. F. Implementation sequence

| Slice | Content | Main files | Depends on |
|---|---|---|---|
| S0 | N1: Escape in the removal confirmation; destructive style on its confirm button | `RemovePhotosConfirmation.js`, `photoWorkspace.css` | — |
| S1 | W1 footer, back/forward model, stale primary, risk-dialog cancel label | `GmiBatchInspector.js`, `gmiEdit.css` | — |
| S2 | W2 footer back, report button placement, «Se kontrollen» | `DeliveryWizard.js`, `deliveryWizard.css` | Q5 |
| S3 | FOTO delivery mode removal | `PhotoWorkspaceCollection.js`, `photoWorkspaceState.mjs`, `PhotoWorkspaceToolsMenu.js`, `PhotoMarkersLayer.js`, `page.js`, `photoWorkspace.css` | S0 (same handler), Q4 |
| S4 | W4 linear steps, duplicate navigation, destructive style, wording | `PhotoPositioningWizard.js` | — |
| S5 | Forward labels and final-action treatment in W1–W4; W3 close name; «Rett én og én» relocation | the four wizard files, one scoped CSS rule | S1, S2, S4; Q1, Q2, Q3 |

- S0, S1, S2 and S4 are independent of each other and of the decisions (except Q5 in S2, which can be left out of the slice).
- In each slice, add stable `data-*` hooks for cancel, back and forward first, so later label changes do not touch tests again.
- Retirement of W5 stays in the existing plan and is not part of this sequence.

## 10. G. Risks, regression tests and acceptance

### Risks

- **Test churn in W1.** «Avslutt» is selected by label in about 13 Rettinger browser suites; «Tilbake til oppsett» in 4; «Tilbake til forhåndsvisningen» in 2 (`gmiBatchInspectorUi:334,369`, `gmiS5FocusContinuityUi:158`). `gmiBatchInspectorUi` asserts the retained-preview behaviour directly; those assertions describe the behaviour being removed and must be replaced, not relaxed.
- **Sticky footer in the inspector.** It must not change the scroll owner or cover the last content row. Check at 1280×720 and 1366×768 with a conflict and with a stale preview.
- **Recalculation cost.** Back then forward repeats the full control. Measure with a large real selection before deciding anything further.
- **S3 removes tested behaviour.** Seven test files reference the delivery bar or the tool label; two assert marker cycling.
- **W4 step numbering.** `data-step` values and step labels are used by `photoPositioningUi`, `gmiPhotoPlacementsUi`, `photoManualPlacementUi` and `photoAcceptanceRenderingUi`. Keep `data-step` values stable and change only which steps are listed.
- **No source-safety surface is touched.** None of the slices changes `src/lib/gmi-edit/`, `src/lib/delivery/`, `photoSession.mjs` or the export path. The `deliveryWizard.mjs` reducer is used as it is.

### Regression tests to add

| Slice | Assertions |
|---|---|
| S0 | Escape closes the confirmation; the mode and the selection are unchanged; focus returns to the opener; nothing is removed |
| S1 | Footer present in Oppsett, Forhåndsvis and Lagt til with the same position and button order at both laptop sizes; the final action is visible without scrolling when a conflict is shown; Back keeps field, value, mode and match; Back, change value, forward shows the new value; Back and forward without changes yields a fresh preview; manual inclusion does not survive Back and forward; no `[data-gmi-batch-back-preview]` and no retained note; stale shows one «Oppdater forhåndsvisning» and no stage action; Avbryt with a draft opens the guard; Lagt til shows «Lukk» |
| S2 | Pakke → Tilbake shows Kontroll with the same filename and no rebuild; Kontroll → Tilbake shows Innhold with inputs kept; a changed input gives a new plan on forward; stale still returns to Innhold; download after a round trip to Kontroll still works |
| S3 | No mode bar and no tool item; the cycle button works in browse mode with mouse, Enter and Space; Escape in browse changes nothing; marker click selects; removal mode unchanged |
| S4 | Back from Plassering goes to the previous listed step; the step list has three entries without a source review and four with one; cancel with an unsaved review leaves no review on reopening; cancel after a save leaves the source and no position changes |
| S5 | One primary per stage; computed colour of forward and final buttons; accessible names |

### Existing suites to reuse

- **W1:** `gmiBatchInspectorUi`, `gmiBatchRiskGateUi`, `gmiS5FocusContinuityUi`, `gmiEditDraftGuardUi`, `gmiIndividualSelectionUi`, `gmiSelectionProfileUi`, `gmiTableReviewUi`.
- **W2:** `deliveryWizard.test.mjs` (reducer, unchanged), `deliveryWizardUi`, `photoExportWizardUi`, `photoExportLayoutUi`.
- **W3:** `photoImportWizardUi`, `photoImportAcceptanceFixesUi`.
- **W4:** `photoPositioningUi`, `gmiPhotoPlacementsUi`, `photoManualPlacementUi`.
- **FOTO modes:** `photoWorkspaceUi`, `photoDeliveryExclusionUi`, `photoDeliveryIntentUi`, `photoMarkerProvenanceUi`, `photoWorkspaceEditUi`.

### Manual acceptance (kept small)

- W1: one batch with a conflict and one with a stale preview at 1280×720.
- W2: one round trip Pakke → Kontroll → Pakke and a download.
- W4: one GMI source added and one cancel after saving.
- FOTO: one delivery change in the list without a mode, and one removal with Escape.
- W3, the completion hub, edit mode and the object editor are not changed and need no re-acceptance.

## 11. Commands, files and Git

- **Commands (read-only):** `git rev-parse`, `git status --short`, `git log --oneline -- <file>`, `wc`, `sed -n`, `grep`, `cat`, `ls`, `date`.
- **Not run:** unit tests, browser suites, lint, build (review only, no code changed).
- **File added:** `docs/agent-reports/20261115-121829-wizard-navigation-workflow-audit.md` (this report).
- **Git status at the end:** branch `feature/photo-workspace`, HEAD `56f0ea6`, no tracked changes. Untracked: this report and the four pre-existing untracked reports and the asset folder, all untouched. Nothing was staged, committed or pushed. `git diff --check` reports nothing.
