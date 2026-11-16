# Outstanding planning reports: implementation reconciliation

Reviewed 2026-11-16 (Europe/Oslo), `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `8e40cfcdc7ce661897441892a1e93ea853d36ff3` (`8e40cfc`). Repository, branch and expected HEAD match. This is a read-only investigation except for this new report. No application, test, existing report or screenshot was changed; no staging, commit, push, deployment, ref change or subagent work occurred.

## Executive summary

Most proposed functional implementation is present. The roadmap's two immediate defects were addressed by `c96bcc4` (laptop layout) and `a50eb62` (individual linked Tema/S_FCODE). UX slices A1–A7, FOTO exclusion slices 1–3 and revision-based filenames all have current implementation and regression coverage. They should not be scheduled again from their original drafts.

Several original prescriptions have subsequently been replaced: batch Back now invalidates the review; FOTO has no dedicated delivery or bulk-exclusion mode; ordinary row/marker clicks select, while explicit pills cycle destinations; workspace exits use top-right X controls; and delivery colours use the approved light palette with dark ink. These are intentional later decisions, not missing work.

The meaningful remaining functional work is acceptance and regression closure, plus existing keyboard/modal and map-control access defects. H5/R7 legacy retirement remains unimplemented. The final application-wide styling audit remains outstanding, although focused consistency work and substantial AGENTS.md rules already exist. Preserve the agreed sequence: **functional implementation and real-data acceptance → redundant legacy workflow removal → final styling audit and approved-rule updates**. Do not turn the historical UI review into an immediate redesign programme.

## Evidence and interpretation

Read root `AGENTS.md`, `docs/development.md`, `SECURITY.md`, `docs/privacy.md`, all five requested reports, relevant later reports, owning source/tests and recent Git history. Inspected three original screenshots directly: removal after Escape, main-map overlap and Rettinger batch setup (see assets below). Other screenshot-dependent visual findings remain historical observations, not fresh measurements.

**Implemented** below means the relevant code and tests exist and implement the proposal; it does not mean every suite passes at this HEAD or that real files/Gemini have been accepted. **Needs verification** identifies acceptance or evidence gaps. Test results quoted from completion reports were not rerun here. No build, browser, lint or test suite was started; this documentation task needed content/link/whitespace checks only. Private/reference data was not opened or reproduced.

Evidence keys below link to the principal completion reports. Paths in matrix cells are repository-relative, and function/component names identify the inspected implementation.

| Key | Later evidence and implementation commit |
|---|---|
| E1 | [Laptop layout correction](20261113-191035-rettinger-laptop-layout-correction.md), `c96bcc4`; [individual linked Tema](20261113-200235-gmi-g8-object-editor-linked-tema-completion.md), `a50eb62` |
| E2 | [A1/A2 batch stages and concise review](20261114-174413-rettinger-batch-a1-a2-implementation.md), `81fa103`; [Batch 2 navigation](20261115-132711-rettinger-batch2-wizard-completion.md), `41c1d16` |
| E3 | [A3/A4 report identity and wizard](20261114-182247-export-report-identity-and-wizard-a3-a4.md), `d5e6ce3`; [Batch 3 navigation](20261115-141537-batch3-wizard-navigation-completion.md), `a185dbb` |
| E4 | [A5 marker override](20261114-184935-a5-rettinger-foto-marker-visibility.md), `f40e08b`; [A6 search/editor navigation](20261114-192016-rettinger-a6-editor-input-navigation.md), `f95ec4f`; [A7 table states](20261114-194555-gmi-a7-table-selection-column-focus.md), `6304749` |
| E5 | [Exclusion slice 1](20261114-201859-foto-delivery-exclusion-slice1.md), `c828733`; [slice 2](20261114-205117-foto-delivery-exclusion-slice2.md), `cbe3233`; [slice 3](20261114-213843-foto-delivery-exclusion-slice3.md), `091f92d` |
| E6 | [Direct delivery cycle](20261115-093631-foto-direct-delivery-interaction.md), `56f0ea6`; [S0/S3 removal safety and browsing](20261115-125227-foto-safety-delivery-s0-s3-completion.md), `94e1bf5` |
| E7 | [Buttons and workspace exits](20261115-144136-button-workspace-consistency-completion.md), `d839ea7` |
| E8 | [FOTO defaults/positioning/filter correctness](20261116-124320-foto-correctness-slice1-completion.md), `c7c2241`; [map interactions/palette](20261116-131928-foto-map-interactions-slice2-completion.md), `c66937a` |
| E9 | [Validator/Data Table follow-up](20261116-150610-validator-datatable-slice3.md), `9877925` |
| E10 | [Revision filename completion](20261116-165829-export-revision-filename-completion.md), `8e40cfc` |
| E11 | [Styling policy consolidation](20261114-130507-ui-styling-policy-consolidation.md), `8bb6f07`; current `AGENTS.md` and `src/app/globals.css` |

## Per-report assessment

### 1. Rettinger roadmap reconciliation — 20261113-182754

The milestone inventory remains useful historical context, but its immediate next steps and blanket lack-of-real-file-acceptance statement are stale. E1 implements both proposed slices. The later [UX plan](20261114-160730-rettinger-export-ux-consolidation-plan.md) §2 records 14 November manual acceptance of handoff, individual editing, B3, batch fill/replace/clear, linked batch Tema, verified field export and combined delivery. This is documentary acceptance evidence, not a rerun or acceptance of subsequent changes. That same record explicitly leaves individual linked Tema and Gemini acceptance open.

The old claim that two production suites are still red from B3 must not be carried forward as a current diagnosis. E1 records the corrective browser gate; later work changes the layout again. E4 also establishes that one later R4 truncation failure targeted the wrong span, rather than proving a rendering regression. Current-suite confidence still needs a fresh gate because later reports record other failures (see verification uncertainties).

### 2. FOTO delivery exclusion plan — 20261114-090612

The model and source-preserving export design substantially shipped in E5. The draft's “Nothing … implemented” header describes its creation date only. Canonical decisions, occurrence identity, atomic mixed commands, derived shared-photo states, M7 removals, purpose accounting, retained attachments, staleness and standalone-mode notes are implemented.

The UI plan is no longer the specification. E6 deliberately removed the separate exclusion-selection mode, then the delivery-planning mode. E8 added the current map preview cycle and palette. Keep the core exclusion/export safety cases, but rewrite any future acceptance checklist around ordinary browsing, inspector/whole-photo actions and preview pills. Do not reintroduce a 50-photo selection UI merely because it appears in the original plan. Optional slice 4, for links without FOTO occurrences, remains absent and safely refused.

### 3. Rettinger/export UX consolidation — 20261114-160730

A1–A7 are implemented, with meaningful later navigation revisions. A6 used a threshold of eight rather than the illustrative six and demonstrated ranking as the actual search problem. A7 reproduced missing-field/geometry focus mismatch; the hypothesised undo/view-change causes were not reproduced as separate defects. These are evidence-based refinements, not incomplete slices.

Phase B is implemented at the model/export level with a replacement UI. Phase C is still pending. Phase D remains the final audit, not an invitation to restyle accepted workflows now. The plan's conditional legacy-removal recommendation should be carried forward with updated acceptance and parity evidence. Its “remove Lag retting” decision is recorded in that plan; this investigation does not execute it.

### 4. UI unification review — 20261114-221747

This is a historical synthetic-data review at `091f92d`, not a current screenshot baseline. F1 is fixed. F4, F8, F10, F14 and F16 have partial or replacement implementations. F2 and F3 remain relevant functional/accessibility defects in source. Most remaining colour, density and shared-component proposals belong after legacy consolidation. The review's recommendation to standardise back-arrow workspace exits is superseded by E7. Its global primary/selection proposals remain proposals: current AGENTS.md still marks key decisions open.

The review also predates the approved E8 palette. Its advice to preserve old delivery colours cannot override that later implementation and current AGENTS.md. Its exclusion-mode screenshots and acceptance steps describe a removed UI.

### 5. Revision filename plan — 20261116-161830

Implemented by the expected HEAD itself, E10. The completion report records approval of D1–D8; current code follows those choices, including underscores, wider revision numbers, optional reset, source/per-mode hints, removal of browser counters only, rev-only recognition, no photos-only suggestion and the existing field label. These decisions are no longer waiting for planning approval. Real-file and recipient checks remain, and the explicit 1–4 digit recognition limit remains a known boundary.

## Consolidated status matrix

Buckets: **Functional** = functional implementation and acceptance; **Legacy** = legacy workflow consolidation; **Audit** = final UI/styling audit; **Backlog** = lower-priority backlog. “—” means no new implementation slice recommended. Evidence is current source/test inspection unless explicitly described as reported/manual.

### Rettinger roadmap, acceptance and UX slices

| Item | Status | Evidence / what remains | Bucket |
|---|---|---|---|
| G1 field capabilities/value domains | Implemented | `src/lib/gmiEditFields.mjs::describeGmiEditColumns`, `src/lib/validation-v2/fieldValueDomain.js`; `tests/gmiEditFields.test.mjs` | — |
| G2 fill/set planning and intent metadata | Implemented | `src/lib/gmiFieldBatchPlan.mjs`, `src/lib/gmi-edit/changeSet.mjs`; `tests/gmiFieldBatchPlan.test.mjs` | — |
| G3 dataset dry run / new-finding gates | Implemented | `src/lib/gmi-edit/dryRun.mjs`, batch approval helpers; `tests/gmiEditDryRun.test.mjs` | — |
| G4 inspector; G5 field controls; G6 exact replace/clear | Implemented | `GmiBatchInspector.js`, `GmiFieldValueInput.js`, batch planner; `gmiBatchInspectorUi`, `gmiFieldValueInputUi`, `gmiBatchReplaceClearUi` tests; E2/E4 | — |
| G7 separate selection-profile milestone | Superseded | B1/B2 own profile, narrowing and risk reasons (`gmiSelectionProfile.mjs`, `GmiSelectionProfile.js`); intent metadata already belongs to G2. Avoid reusing G7 for both | — |
| G8 batch plus individual Tema/S_FCODE coupling | Implemented | `gmiEditFields.mjs::gmiLinkedTemaPair/gmiLinkedTemaChangeSetComplete`, `GmiObjectEditor.js` single control and linked consent; `gmiLinkedTema` / `gmiObjectLinkedTema` Node and UI tests; `b9173ba`, E1 | — |
| H1 selection host; H2 Validator checkbox selection | Implemented | `gmiEditSelection.mjs`, `LayerDataTable.js`, store host binding; `gmiEditSelection`, `gmiValidatorSelectionUi` tests | — |
| H3 handoff; H4 return | Implemented | `gmiValidatorEditing.mjs::validatorSelectionHandoff/gmiValidatorReturnTarget`, store return action; `gmiValidatorSelectionHandoff` and `gmiValidatorReturnUi` tests. Nov14 acceptance recorded in UX plan | — |
| B1/B2 profiles and gates; B3 individual itinerary | Implemented | `gmiSelectionProfile.mjs`, `gmiBatchInspectorView.mjs`, workspace itinerary; `gmiSelectionProfile`, `gmiBatchRiskGate`, `gmiIndividualSelection` Node/UI tests | — |
| U1 aligned header; U2 severity icons; U3 legend restore | Implemented | `ValidationV2Workspace.js`, `GmiSeverityIcon.js`, `mapPanePresentation.mjs`; `gmiValidatorEditingUi`, `validatorRettingerRefinements` tests. Header semantics retained by E7 | — |
| U4 meaningful table modes; U5 contextual redo; U6 shared filter disclosure | Implemented | `gmiEditView.mjs::gmiTableViewControls`, `GmiChangeList.js`/workspace redo hooks, `useLayerFilterDisclosure.js`; corresponding table/sidebar/focus tests | — |
| T1 reveal/Vis i Foreslått; T2 proposed view after staging; T3 soft checkbox focus | Implemented | `layerTableReveal.mjs`, staging view helper, `gmiEditSelection.mjs::gmiCheckboxSoftFocus`; `layerTableReveal`, `gmiS5FocusContinuityUi`, `gmiCheckboxSoftFocusUi` tests | — |
| Roadmap slice 1 laptop regression fix | Implemented | E1 `c96bcc4`; subsequent E2 sticky footer and stage layout. Old below-fold staging-button allowance is superseded | — |
| Roadmap slice 2 individual coupling / warning-only alternative | Superseded | Full linked implementation shipped (row above); warning-only fallback is unnecessary | — |
| A1 exclusive stages, truthful progress, nontrivial draft guard | Implemented | `GmiBatchInspector.js` derives setup/preview/staged and `dirty = Boolean(lexeme || match !== null || review)`; E2 and `gmiBatchInspectorUi`/draft-guard coverage | — |
| A1 retain preview on Back and offer return without recalculation | Superseded | E2 Batch 2 uses `backToSetup → invalidate()`, retains inputs but clears preview/approvals; footer Forward recalculates | — |
| A2 concise profile/details/risk copy, no raw attribute dump | Implemented | `GmiSelectionProfile.js`, inspector collapsed details/risk groups and clear-mode wording; E2; `gmiBatchRiskGateUi`, `gmiSelectionProfileUi`, replace/clear tests | — |
| A2 reduce mixed-characteristic risk trigger | Outstanding | Original D1 was an optional policy relaxation, not A2 acceptance scope. Current inspector still calculates mixed profile columns across changing objects. Keep safeguard unless explicitly approved | Backlog |
| A3 actual object numbers/GUIDs and separate hyperlink report | Implemented | `deliveryWizard.mjs::deliveryReportChanges`, `describeGmiObject`; exported-byte cross-checks in `deliveryWizard.test.mjs`; E3 | — |
| A3 investigate Validator positional labels | Implemented | Investigation completed in E3; current `sampleRefs`/`getValidationV2ObjectLabel` have no external `src/` consumer found. No current user-visible defect established; no speculative rewrite | — |
| A4 separate Kontroll and Pakke | Implemented | `DeliveryWizard.js::ReviewDetails/PackageDetails`, diagnostic/package assertions in `deliveryWizard` Node/UI tests; E3 | — |
| A4 package “Se kontrollen” link | Superseded | E3 Batch 3 removes duplicate in-content navigation; footer Back goes Pakke → Kontroll → Innhold. Verified review retained for first Back, discarded for content | — |
| A5 temporary photo suppression and per-visit toggle | Implemented | `src/lib/workspace/rettingerPhotoVisibility.mjs`, page render override; `rettingerPhotoVisibility` Node/UI tests; E4. Does not write layer visibility or decisions | — |
| A6 search ranking, preview wording and itinerary icons | Implemented | `gmiEditFields.mjs::rankGmiFieldValueOptions`, field combobox threshold `strictListed || options.length > 8`, object editor/navigation; `gmiFieldValueSearchUi` and input tests; E4 | — |
| A7 sticky-cell state fill and truthful column priority | Implemented | `LayerDataTable.js::rowFill/columnFocusActive`; `gmiA7ColumnFocusUi`, `gmiCheckboxSoftFocusUi`, `gmiValidatorSelectionUi`; E4. Same cyan fill; protected geometry retained | — |
| H4 history-level Validator action | Outstanding | `GmiChangeSetDetail` has optional control, but workspace passes it only for `variant === 'staged'`, not history. Component existence alone does not complete this proposal | Backlog |
| H4 batch-specific guard wording | Partially implemented | Some workspace transitions pass “masseendringen”; default guard, exit and legacy batch opening still use “objektet” | Legacy |
| B2 narrow to SJEKK / uten funn | Outstanding | `GmiCurrentFindingSplit` displays these counts but only offers “Behold bare FEIL” | Backlog |
| H5/C1 remove Lag retting entry and correction-only plumbing | Outstanding | `ValidationV2RuleList.js:110`, workspace `startCorrection`, `CORRECTABLE_RULES` and store correction path remain. It enters the modern inspector; remove redundant entry/plumbing without deleting H3/H4 helpers | Legacy |
| R7/C2 remove Masseendringer and legacy dialog | Outstanding | `GmiEditWorkspace.js` still mounts `GmiBatchDialog`; dialog retains whole-layer review/search/paging. Preserve shared `gmiEditBatchView.mjs` users; parity decision and coverage migration first | Legacy |
| X1–X3 / M6 structural column insertion | Outstanding | Planner accepts only fill/set/replace/clear and refuses absent columns. Roadmap's X1–X3 = M6 mapping remains an assumption because original milestone definitions were unavailable | Backlog |
| Current real-file/keyboard/large-selection and private-corpus acceptance | Needs verification | Nov14 acceptance exists for listed older flows; later E1–E10 synthetic tests do not establish acceptance of final workflow. Individual linked Tema, large-selection performance and assistive technology remain unclosed in reviewed evidence | Functional |

### FOTO exclusions and filename proposals

| Item | Status | Evidence / replacement or gap | Bucket |
|---|---|---|---|
| Slice 1 one occurrence decision map, exclude intent and derived asset states | Implemented | `photoDeliveryIntent.mjs` exclusions/assets/state keys; `photoSession.mjs` validates writers; `photoDeliveryIntent`/`photoDeliveryExclusion` tests; E5 | — |
| Stale exclusion review, link-removed resolution, independent siblings | Implemented | Entry derivation/session inclusion writer; stale/atomicity tests in same suites; E5 | — |
| Temporary export block until integration | Superseded | E5 slice 3 removes `exclusions-not-supported-yet` and applies verified M7 removal in combined/split exports | — |
| Slice 2 atomic whole-photo and selected-occurrence helper | Implemented | `photoDeliveryChoice.mjs::planPhotoExclusion`, `photoSession.mjs::setPhotoDeliveryExclusion`; mixed-kind, hidden-placement and refusal tests; inspector whole-photo caller remains | — |
| Slice 2 separate checkbox exclusion mode / select 50 / bulk restoration UI (D1/D4) | Superseded | E6 intentionally removes mode, tool, selection state/bar and bulk branches. Atomic helpers remain; ordinary destination cycles plus confirmed inspector whole-photo action replace user flow | — |
| Original included-marker GMI↔GML; excluded-marker click restores | Superseded | E6 first adds three-state cycling; S3 then makes marker click selection-only. E8 browse preview offers explicit GMI→GML→Ikke→GMI pill; unlinked has only GML/Ikke | — |
| Old dedicated delivery-planning mode/popup | Superseded | E6 normal browsing, then E8 `PhotoWorkspaceMapPreview.js`; no checkbox reintroduction or implicit marker mutation | — |
| Slice 3 exclusions remove references without GML feature | Implemented | `photoDeliveryIntent.mjs::removalSelections`, `deliveryPlan.mjs` M7 authorization; `deliveryExclusion`, `deliveryPlan`, hyperlink-removal tests; E5 | — |
| Partial assets/retained attachments; inventory, counts, report and restoration | Implemented | `deliveryPlan.mjs` attachment-derived facts, `deliveryWizard.mjs` purpose/accounting/report; `deliveryExclusion`/`deliveryWizard` tests including original-byte comparisons; E5 | — |
| No-op identity, intended-span verification and stale export refusal | Implemented | Existing M7/field patch/verifier/package path reused; `gmiEditHyperlinkRemoval`, `deliveryExclusion`, `deliveryPlan` tests. Recipient acceptance separate | — |
| D2 safe restore and D3 independent standalone modes | Implemented | Linked exclude restores GMI; bulk restore preserves already included transfers. Kun GMI retains links; Kun GML uses standalone selection; explicit exclusion notes in wizard/report; E5 | — |
| Slice 4 / D5 line or removed-placement link exclusion | Outstanding | `planPhotoExclusion` refuses whole-photo exclusion when `linksWithoutOccurrence` remain. Those references still require files. No `link:<occurrenceKey>` decision namespace implemented | Backlog |
| Original pill/marker palette and fine-grained filter UI | Superseded | E8/current AGENTS.md light-blue/light-green/light-grey with dark ink; aggregate GMI/GML/Ikke filters and provenance separation. Palette parity test in `photoDeliveryPlanning` | — |
| Real M7 grammar/refusal rate, empty cells, renumbering, retained paths/Gemini G4 | Needs verification | E5 explicitly retains `gemini-g4-unverified`; no later recipient acceptance found. Real corpus may hit refusal cases synthetic fixtures cannot quantify | Functional |
| Revision helper, timestamp/counter stripping, rev increment/width/length | Implemented | `photoExportNaming.mjs::suggestRevisionLabel`; E1–E20 and added edge cases in `photoExportNaming.test.mjs`; E10 | — |
| Revision D1 underscore sanitizer contract | Implemented | Same naming module preserves underscores and safe separators; deliberately updated safety/idempotence tests. Hyphen-only alternative superseded by approved underscore choice | — |
| Live-source suggestion, manual/empty override, reset and config ownership | Implemented | `DeliveryWizard.js` uses descriptor filename and `labelEdited`; `photoExportConfig.mjs`; source-switch/manual/navigation tests in `deliveryWizardUi`; E10 | — |
| Revision D4–D8 hints/counters/rev-only/photos-only/label | Implemented | `PhotoExportDeliveryStep.js::FilenameHint`, wizard effective label; existing naming pipeline yields shared GMI/GML/ZIP/report basename; Node/combined UI assertions; E10 | — |
| Real filename round trip and Gemini underscore acceptance | Needs verification | E10 reports three synthetic byte-identical revision cycles, not real recipient acceptance. Retain two real export/reimport cycles in acceptance | Functional |
| Revision beyond four input digits | Needs verification | Regex recognises 1–4 digits: rev9999 produces rev10000, but the next import no longer recognises that suffix. Documented intentional bound, not a missing D1–D8 feature; decide only if such inputs matter | Backlog |

### UI review F1–F23 and consolidation proposals

| Item | Status | Current evidence / disposition | Bucket |
|---|---|---|---|
| F1 removal Escape and destructive confirmation | Implemented | Collection Escape yields while `dialog[open]`; native cancel/restoration retained; removal uses destructive class and 16px radius. `photoRemovalConfirmationUi`, E6/E7 | — |
| F2 six older overlays lack modal keyboard behaviour | Outstanding | `DataDisplayModal`, `WmsLayerModal`, `ShareQrModal`, `ZValidationModal`, `StandardsInfoModal` and add-layer overlay in `page.js` remain div overlays without the proposed dialog lifecycle. Fix as focused accessibility work, preserve geometry | Functional |
| F3 map toolbar/bottom-left/legend/test-mode overlaps | Outstanding | Page still has separate `left-28` and `calc(50% - 320px)` clusters; toolbar absolute clusters and NARROW-only compact mode remain. E7 explicitly leaves overlap. Current pixel extents need reproduction, not copied historical numbers | Functional |
| F4 workspace entry/name/exit consistency | Partially implemented | E7 aligns all three exit controls; E8 gives FOTO icon entry. Validator analysis still says Feltvalidering; FOTO tooltip still says bildemodul while accessible name says Åpne FOTO. Header/entry unification remains a decision, not required component extraction | Audit |
| F4/C5 back-arrow header standard / one WorkspaceHeader | Superseded | Top-right shared X treatment chosen by E7; no WorkspaceHeader extraction. Do not undo accepted exits merely to follow historical C5 | — |
| F5/D2 selected-control recipes and selected vs active distinction | Outstanding | Global `.gmi-selected-control` remains grey; scoped variants remain. Sticky fills are fixed (A7), exact selected/active tint remains open in AGENTS.md | Audit |
| F6/D1 one teal primary everywhere | Superseded | Later E2/E3/E7 explicitly use teal forward and navy final wizard actions, warning-toned risk approval, and retain navy global primary. Global policy still open; original blanket teal proposal is no longer an implementation specification | Audit |
| F7/C2 one confirmation implementation | Outstanding | GMI, removal, exclusion, boundary and Gemini confirmations remain separate. F1 and some radii fixed without component consolidation. Retain special bodies/guards and test hooks if later consolidating | Audit |
| F8 distinguish not-selected from explicit exclusion everywhere | Partially implemented | Collection/planning summaries distinguish “Ikke valgt”; wizard keeps purpose-aware counts. Pills deliberately map both states to neutral “Ikke”, and E8 consolidates visible filters. Reconcile user understanding during acceptance; do not mechanically split the accepted three-state UI | Functional |
| F9 removal versus delivery exclusion explanation | Outstanding | `RemovePhotosConfirmation.js` still says originals are unchanged, without explaining retained GMI references or pointing to exclusion. Verify actual point/line removal outcomes, then add concise consequence-specific copy | Functional |
| F10/C3 shared icon-tooltip location and adoption | Partially implemented | E7 map toolbar/workspace exits use shared tooltip; `LayerPanel.js` retains native-title analysis controls. `PhotoIconButton` still lives under photos. Moving it is optional mechanical consolidation, not a blocker | Audit |
| F11/C4 destructive semantics/shared recipe | Partially implemented | Removal/source danger corrected (E6/E3), shared secondary interactions improved (E7); destructive recipe still module-specific and session-discard emphasis remains inconsistent | Audit |
| F12 compact Validator header and Pass→OK | Outstanding | Current `ValidationV2Workspace.js` and `ValidationV2RuleList.js` still render Pass; no compact-header proposal implemented. Preserve Kontrolldato naming/alignment; new row-count evidence required | Audit |
| F13 table bars, zero counts, staged “pågår” | Partially implemented | E2 moves individual entry into existing selection bar; old full-width indicator button is now a span. Counts still include zeros and indicator tests inspector-open state rather than staging. Final density/state-copy improvement remains | Audit |
| F14 import density/whole-photo link/exclusion-mode height | Partially implemented | E7 aligns import footer controls; no whole wizard type-scale reconciliation established. Old exclusion-mode height issue superseded by mode removal. Link/density need fresh computed-style review | Audit |
| F15/D4 warning hues | Partially implemented | Shared validation/compact warning tokens exist; gmiEdit CSS still has amber history pills/literals and hover shades, photo CSS has repeat-warning literals. No broad warning-normalisation decision established | Audit |
| F16/D3 shared disabled state and global accent | Partially implemented | E7 adds disabled/ARIA-disabled opacity/cursor and disabled hover exclusion to global button recipes. Removal/object controls now explicitly teal. No universal checkbox/radio/range accent rule; Leaflet-specific rule is not universal | Audit |
| F17 shared inspector empty states | Needs verification | No shared component introduced; visual adequacy at large widths was not remeasured. Optional visual improvement rather than a functional acceptance condition | Backlog |
| F18 literal/token cleanup | Outstanding | Chrome literals remain in `gmiEdit.css`, `photoWorkspace.css`; old counts are stale. Review only live surfaces after removals; no automatic new tint/destructive tokens | Audit |
| F19 glyphs/hand-drawn icons | Partially implemented | E7 replaces map/3D graphics with Phosphor; warning glyph in `PhotoImportReviewStep.js` and check glyphs in `Sidebar.js` remain | Audit |
| F20 Contact footer consistency | Needs verification | Historical visual finding; no later consolidation identified. Reassess relevance/current reachability in final audit; no functional requirement established | Backlog |
| F21 ZIP-only copy/one-file tree actions/import plural | Outstanding | Package report note still says “Den legges ikke i ZIP-filen” in shared branch; `DeliveryInventory` controls and import “1 bilder” wording remain. Fix concise copy during audit | Audit |
| F22 Lagmarkering popup distance | Needs verification | Historical screenshot/position finding, no later targeted fix found; current usable placement needs browser measurement | Audit |
| F23 dialog radius | Partially implemented | Removal/exclusion confirmations now 16px; other confirmation implementations still differ. Audit remaining live dialogs rather than assuming all retain 8px | Audit |
| C1 shared modal lifecycle hook | Outstanding | No `useModalDialog` found; repeated native-dialog effects remain. Optional way to implement F2, not a requirement to migrate every working dialog | Functional |
| C4 global primary/selected/destructive recipe consolidation | Partially implemented | E7 centralises interaction feedback/disabled rules; primary/selection/destructive policy and scoped owners remain. Requires approved decisions before global changes | Audit |
| UI review U6 broad vocabulary / U9 unused components and dormant themes | Outstanding | Only targeted vocabulary changes shipped; `DataDisplay.js`, `DetailedStatsSection.js`, `ThemeSwitcher.js` still present with no import found. Dormant theme blocks remain; `FieldDetailModal`/`MissingFieldsReport` still imported by `FieldValidationSidebar`—reachability needs checking | Legacy |
| Full contrast, screen reader, all-module visual acceptance | Needs verification | Original review explicitly omitted numeric contrast/full keyboard/assistive technology. E8 measures delivery-pill contrast only. No evidence of complete application audit | Audit |

## Contradictions, duplication and superseding decisions

1. **Completion versus draft status:** all three implementation plans still say nothing was implemented. Preserve that as historical authorship context; use this report and E1–E10 for current status. Completion reports often describe the starting HEAD and uncommitted changes; the implementation commits in the evidence table avoid confusing those starting hashes with delivery commits.
2. **Acceptance:** the roadmap's universal “no real-file acceptance” statement is superseded by the later UX plan's recorded Nov14 session for specific flows. It does not close the individual-linked, later-workflow or Gemini gaps. Do not reset accepted FOTO import/position/export workflows, or label newer synthetic checks as real-data acceptance.
3. **Navigation:** A1's retained-preview detour was explicitly removed in Batch 2. A4's “Se kontrollen” shortcut was explicitly removed in Batch 3 in favour of adjacent footer Back. Current footer/status/commit hierarchy supersedes old screenshots and one-colour proposals.
4. **FOTO:** exclusion-plan D1/D4 UI was implemented and then removed by direct-cycle work. S3 removed the delivery mode too. E8 adds an explicit cycle pill inside the browse preview; it does not restore click-to-mutate markers. The model/export safety requirements remain applicable.
5. **Colours and exits:** UI-review back-arrow standard is replaced by E7 X controls; E8/current AGENTS.md replace old delivery colours. Global primary and selected-state policies remain unresolved. Existing AGENTS.md design rules were added before the final audit; “update AGENTS.md last” now means reconcile approved final decisions, not recreate that section.
6. **Naming overlap:** roadmap H5/R7 = UX C1/C2 = UI-review legacy-removal section. UI review C1/C2 instead mean modal hook/shared confirmation. Use names, not bare C numbers, in future tasks. G7 also has inconsistent historic meanings; X1–X3 lacks original definitions.
7. **Repeated audit proposals:** primary/selected/hover/disabled/accent/radius/warning/token/icon findings recur in the styling policy, UX Phase D and UI F4–F23. Maintain one remaining audit list; do not schedule three audits. Similarly, M7/Gemini acceptance is one shared obligation across exclusion, editing and export plans.

## Deduplicated outstanding work and recommended slices

### 1. Functional implementation and acceptance

1. **Establish a fresh scoped regression baseline at the reviewed HEAD**, using an isolated production build if shared servers remain. Triage the known stale Validator close-label assertion, legacy M5B reason test, FOTO stack counts/Pass 1B and map-preview flakiness before interpreting “all green”. These are documented failure reports, not newly reproduced findings in this investigation. Preserve safety and geometry assertions when updating deliberately changed contracts.
2. **Close small functional/accessibility defects:** reproduce and resolve map control collisions at both laptop sizes, including main/Validator/Rettinger/test mode and legend overlap. Separately migrate the six deficient overlays to modal semantics/Escape/focus containment/restoration with focused tests. This is usable access, not a large visual redesign. Use an existing/shared lifecycle only where helpful; keep table/modal geometry.
3. **Complete representative real-data acceptance of current workflows:** preserve prior accepted import/position/export behaviour while checking later changes. Include H2→H4 point and line handoffs, linked single/batch Tema, replace/clear, conflicts, undo/redo, new footer navigation, draft guards, shared-photo exclusion/restoration, mixed GMI/GML/Ikke, movement/GML defaults, delivery filters, map preview and source staleness. Include one keyboard-only run and large selections at 1280×720 and 1366×768. Reconcile “Ikke valgt” versus exclusion counts and removal consequences (F8/F9) with the user; add targeted explanation if needed.
4. **Finish export/recipient acceptance:** compare source-preserving delivered copies, retained references/attachments, intended field/hyperlink spans, report object numbers/GUIDs and count meanings. Exercise real M7 grammar/refusals, empty cells and wrapper renumbering in Gemini VA. Test underscore filenames and two real revision round trips. Do not remove experimental warnings before recipient evidence exists.

These are recommendations for future authorised work; no workflow or source data is changed here. Record acceptance per feature/version rather than treating one historical pass as acceptance of every later commit.

### 2. Legacy workflow consolidation

5. **Retire Lag retting only after the replacement is accepted.** Migrate Original-default and viewport contracts from `gmiValidatorEditingUi` to H2/H3, then remove only the correction entry/button/state/helpers. Retain modern selection/handoff/return and comparison code.
6. **Retire Masseendringer/GmiBatchDialog with a parity note.** Decide whether whole-layer hydraulic review, Bare nye feil, search and paging are covered by table/inspector or explicitly dropped. Port meaningful tests before removing the dialog. Review shared-helper consumers; do not delete the whole module. Resolve residual batch guard wording with this slice.
7. **Inventory genuinely unreachable UI/styles**, including the three no-import components, dormant themes and the reachable legacy field sidebar chain. Confirm reachability before removal. This is lower urgency than workflow parity; do not restyle code intended for retirement.

### 3. Final UI/styling audit

8. After functional acceptance and legacy consolidation, reassess current screens, not old screenshots. Decide global primary/final/risk hierarchy, selected control versus active row, warning shades and whether a global native-control accent rule is desired. Then address live tooltip/name coverage, modal/confirmation consistency, density, table-bar state copy, tokens/glyphs and small wording defects. Keep approved delivery palette, source/provenance colours, information colours and protected geometry. Update AGENTS.md with approved final decisions and retire contradictory open notes only with evidence/approval.

Lower-priority backlog: structural column insertion (separate engine/recipient contract), line-link exclusion if real deliveries need it, history Validator shortcut, SJEKK/clean narrowing, optional mixed-risk policy relaxation, shared empty states/Contact presentation and extreme revision-width policy. None should delay acceptance unless a representative delivery demonstrates a need.

## Handling original reports and screenshots

No file should be deleted or rewritten during this review. Recommended future disposition, subject to review together:

| Original artifact | Recommended handling |
|---|---|
| Roadmap reconciliation | Commit as historical documentation and retain. Its dated inventory explains milestone lineage; link to this reconciliation as the current index. Do not treat its old next-slice instructions as active |
| FOTO exclusion plan | Retain/commit as historical architecture and safety rationale. Consolidate only genuinely outstanding acceptance and optional link-only exclusion into future tasks. Mark UI slices superseded by E6/E8 through a future index/status note |
| Rettinger/export UX plan | Retain/commit as historical A1–A7 specification. Consolidate Phase C and acceptance dependencies into one current legacy task; Phase D into the eventual final audit |
| UI unification review | Retain/commit as dated historical review with its assets. Use its F identifiers for traceability; refresh findings before any implementation. Archive logically via index/status rather than moving files and breaking links |
| Revision filename plan | Commit as historical approved plan paired with E10. No further implementation plan needed; carry only real-file/recipient acceptance and explicit bounds |
| UI-review screenshot directory | Preserve all 18 PNGs and relative links. Recommend committing alongside the historical review after confirming its documented synthetic provenance. No regeneration, deletion or claim that it shows current UI |

The committed completion reports already reference some untracked plans; committing the historical bundle would make those links available in a clean checkout. This is a documentation recommendation, not authorisation to stage or commit now.

Directly inspected historical assets: [removal after Escape](assets/20261114-221747-ui-unification-review/27-foto-removal-after-escape-1366.png) shows the old neutral confirmation and absent selection controls; [main map](assets/20261114-221747-ui-unification-review/35-main-normal-1366.png) shows the colliding Inspiser data/Gemini controls; [batch setup](assets/20261114-221747-ui-unification-review/10-rettinger-batch-setup-1366.png) shows old back-arrow exit, inline preview action and stacked table bars. The Escape sequence itself cannot be proved by a still image; that finding rests on the original browser account plus source. Current code supersedes the removal/exit/navigation appearances, while overlap source remains.

## Remaining uncertainties and verification record

- **Acceptance versus evidence:** Nov14 manual acceptance is recorded in a planning report, without rerunning the files here. Later completions repeatedly leave real-data/Gemini acceptance open. Individual linked Tema and wide real tables still need explicit sign-off; assistive-technology and large-file performance evidence is incomplete.
- **Regression status:** E10 reports focused Node 156 passed/1 skipped and production browser 67 passed, with a later 15-test wizard rerun. Its full Node run reports 2149 passed, 1 failed, 142 skipped; the stale Validator literal was independently reproduced there. E9 reports additional baseline browser failures for legacy batch/FOTO stacks and a flaky map-interaction test. Those narrower successes do not establish a fully green current application. No current failure is newly classified as pre-existing here.
- **Unsettled decisions:** legacy hydraulic parity; actual need for line-only exclusions/column insertion; global primary/selected/warning rules; whether F8 aggregation is understood in real deliveries; and whether four-digit revision recognition needs extending. Already shipped filename D1–D8, X exits and E8 palette should not be reopened as unresolved plan questions.
- **Limits:** static inspection cannot establish current overlap dimensions, full contrast or screen-reader output. Fine-grained source status filters remain valid programmatically despite simplified visible choices. No performance/private-corpus pass or recipient import was attempted.

Checks passed for this task: repository/branch/HEAD/status match; targeted `rg`, UTF-8 file reads and Git log/show completed; three screenshot inspections; all 24 relative report links resolve; all 18 original screenshot assets remain; `git diff --check` is clean and the new report has no trailing whitespace. Application tests/build/lint/browser checks were **not run** (documentation-only investigation); no such check is claimed passed or failed by this task.

Final verified Git state: unchanged `feature/photo-workspace` / `8e40cfc`, no tracked modifications or staging. The five original untracked reports and their untracked asset directory remain, plus this one new untracked reconciliation report. No publication actions.
