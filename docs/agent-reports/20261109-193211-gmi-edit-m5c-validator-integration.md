# M5C - Validator / Rettinger integration and full revalidation

2026-11-09, Europe/Oslo. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, starting HEAD **c4c271d**, verified with a clean starting working tree. No commit or push.

## Delivered behavior

Validator defaults to **Original**, the existing imported layer dataset. An open, live matching Rettinger session exposes **Foreslått**, obtained from M2's cached M1-verified reparsed output. The header, summary, field inspection title and contextual object table identify the selected dataset. Foreslått includes the banner "Du kontrollerer den foreslåtte kopien. Originalleveransen er uendret." No selection changes source data or stages anything.

**Kontroller endringer** in Rettinger explicitly evaluates the original source document and the verified current proposed dataset through M2. It shows actual FEIL/SJEKK counts, new and resolved counts, unchanged findings and a separate severity-change count. New problems precede resolved findings, with current FEIL first. Expand the compact disclosure to open the relevant field/rule in the corresponding Validator dataset and geometry. The two table headings also open Original or Foreslått directly. Ordinary "Åpne Validator" retains the layer's previous dataset selection, defaulting to Original.

The expanded hydraulic field rows offer **Lag retting…** only for allow-listed missing-value findings with a bound existing column. This opens the existing two-step M5B dialog with an exact object scope and fixed field, with **Ny verdi empty**. Review, exclusion, advanced override, independent overwrite/conflict permissions, staging, history and export remain M5B/M2 implementations.

## Files changed

| File | Purpose |
|---|---|
| `src/lib/gmiValidatorEditing.mjs` | Allow-list, exact missing-finding handoff, comparison identity/transition semantics, current-comparison check and live proposed inspection resolution. |
| `src/components/gmi-edit/GmiFullValidation.js` | Explicit full check, compact original/proposed counts, stale/error states and links to relevant Validator rule views. |
| `src/components/gmi-edit/GmiEditWorkspace.js` | Full-check entry and seeded M5B dialog, using the existing draft guard. |
| `src/components/gmi-edit/GmiBatchDialog.js` | Optional fixed field/exact targets; no initial value; live source/session checks; ordinary M5B behavior retained. |
| `src/components/validation-v2/ValidationV2Workspace.js` | Dataset/date controls, cached Validator execution, dataset-labelled findings, allow-listed correction handoff and focused return navigation. |
| `src/components/validation-v2/ValidationV2RuleList.js` | Correction action inside an expanded eligible field row. |
| `src/components/validation-v2/ValidationV2FieldInspector.js` | Explicit dataset label in docked field heading. |
| `src/components/validation-v2/ValidationV2FieldInfoModal.js` | Same label for the existing compact-screen modal; field semantics remain unchanged. |
| `src/components/LayerDataTable.js` | Exact proposed object inspections resolve against the live verified dataset, and close after history/source invalidation. |
| `src/lib/store.js` | Transient dataset/date preferences and scoped navigation; proposed contextual table provenance; removal/reset cleanup. |
| `src/lib/gmi-edit/proposed.mjs` | Resolve the reference date once before both validation calls, also protecting default-date execution across UTC midnight. |
| `tests/gmiValidatorEditing.test.mjs` | Twelve focused computed/API tests. |
| `tests/gmiValidatorEditingUi.test.mjs` | Production-browser acceptance with six scenarios plus parent, synthetic inputs only. |
| `tests/gmiEditWorkspace.test.mjs` | Actual store/registry navigation and proposed-inspection provenance regression. |
| `tests/validationV2GmiA6.test.mjs` | Update runner source contract to the existing cached A5 runner wrapper. |
| `tests/validationV2GmiA7.test.mjs` | Dataset/date header contract and a correct sibling-button nesting check for the additional action. |
| This report and `assets/20261109-gmi-edit-m5c/` | Verification and synthetic screenshot evidence. |

No validation rule, parser, M1 patch/verification policy, ChangeSet compiler, applicability classification, FOTO business logic or export semantics were changed.

## Explicit rule allow-list

| Actual rule ID | Field | Why eligible |
|---|---|---|
| `innmaling.line.sdr.valid` | SDR (`sdr`) | Existing M2 eligibility uses the shared validated Tema, hydraulic and material applicability. Only applicable missing original/current cells seed the shortcut. |
| `innmaling.line.pressure-class.valid` | Trykklasse (`pressureClass`) | Existing shared pressure applicability and source-column binding; same missing-value/editability restrictions. |
| `innmaling.line.ring-stiffness.valid` | Ringstivhet (`ringStiffness`) | Existing M2 rule contract supports the correct hydraulic/material applicability; gravity/material cases are tested through that API. |

Missing reasons include the shared required/non-NYTT/expected-missing outcomes. These are candidate identification only: **M2 re-evaluates current applicability and physical editability** before producing targets. EXPECTED, unresolved, inapplicable, populated and unsafe targets are excluded from the shortcut. Originally populated values cleared by a proposal are also excluded. A missing/ambiguous physical column is blocked. Read-only sessions cannot seed corrections.

Relationship, geometry, structural and contradictory Tema/material findings have no correction action. No general autofix engine or additional code-list shortcut was introduced. The SDR/Ringstivhet exclusivity rule remains informational and can be inspected from a full comparison.

## Validation architecture and comparison semantics

Validator uses `validateGmiDataset`, which caches the unchanged `runGmiValidationV2` result by dataset identity, layer ID and reference date. Original retains `layer.data`; Foreslått uses `gmiEditSessions.proposed(handle).dataset`, never a draft attribute overlay. A proposed parse/verification failure disables Foreslått with an explicit explanation; it is not labelled as successful proposed validation.

The full check calls `gmiEditSessions.revalidate(handle, { referenceDate })`, reusing `revalidateGmiEditSession` and its verified-output/validation caches. Original and proposed share one explicit date. The compact date control in Validator sets that same transient date for Rettinger. Full checking is explicit; object selection, keystrokes, exclusions and paging do not run this comparison. Selecting a Validator dataset/date runs its ordinary full dataset inspection through the cache.

The comparison flattens actual rule findings plus schema findings. SJEKK follows the existing UI convention of CHECK plus INDETERMINATE; NOT_EVALUATED is not invented as an error. A finding's identity is rule plus source object/geometry; schema identity includes its schema reason. Unique GUIDs are matched independently of object enumeration order. Otherwise M1's immutable geometry/sourceIndex identity is authoritative: structural reordering is outside this milestone. Identity maps are built once per dataset, avoiding quadratic GUID scans.

For the same rule/object, a severity change is recorded separately, **never as resolved merely because severity changed**. New/resolved counters exclude these separate transitions. With unchanged severity, a changed reason is a resolved previous issue plus a new issue; unchanged rule/reason/severity is an unchanged finding even when its observed invalid value differs. Genuine absence from the proposed findings resolves a previous finding. Newly introduced FEIL are sorted first; escalated severity findings also precede current SJEKK in the detail list.

A displayed comparison captures the exact immutable session object, original document fingerprint, effective proposed key and date. Every stage/undo/redo/discard/batch transition creates a different immutable session, immediately removing obsolete counts and replacing them with an outdated notice. Undo+redo to identical effective bytes is still a new review basis, while M2 may reuse the computation. Source replacement/removal invalidates the registry handle. Navigation away drops the local comparison rather than reviving obsolete results on return. A failed proposed verification yields no successful comparison or substitute Original report.

Full checking is advisory and excludes unstaged object/batch drafts. It neither stages corrections nor blocks source-safe export. The NYTT-year test demonstrates a newly introduced finding on a different object after an installation-year edit; the SDR/Ringstivhet test demonstrates a new shared relationship FEIL. These are full-dataset results, distinct from M5A/M5B local draft diagnostics.

## Navigation, exact targets and drafts

The handoff uses the selected layer's current result and owned Validator ObjectRefs, not displayed labels. After opening the retained source, it rechecks the selected layer/result/date and current imported-layer identity. It filters the finding's exact refs through current M2 eligibility, then carries the layer ID, immutable session/document fingerprint, session ID, field and exact geometry/source-index targets into Rettinger. M1 forbids structural object edits, so these source identities remain stable.

The existing session is reused; staged ChangeSets are retained. The batch field is fixed for this shortcut. Every calculation receives `targets`, and final M5B construction receives only the reviewed subset. Search, paging, select-all and advanced selection cannot silently expand beyond that supplied scope. The user must supply a value and review/approve it. A source/session replacement blocks the seeded calculation; history changes invalidate existing previews and require the established recalculation/review. Ordinary, unseeded Masseendringer remains available after the shortcut closes.

Rettinger-to-Validator navigation passes through the existing combined dirty-draft guard. Production tests cancel that guard and verify the entered draft survives, then explicitly discard the draft to navigate. Staged corrections survive both paths.

Proposed object inspection carries an exact session/dataset basis through the existing contextual table request. Store and table resolve it against the live registry, so rows use the verified proposed values. Another layer, changed session or failed proposed result is rejected. The imported layer is never replaced. The screenshot shows a one-object proposed inspection with staged SDR 11 and the existing Ringstivhet SN8.

## Verification

| Check | Result |
|---|---|
| New computed/API suite | **12/12 pass**. |
| Actual store/registry workspace suite | **11/11 pass**, including the new M5C navigation/inspection lifecycle case. |
| New production-browser workflow | **7/7 pass** (parent plus six scenarios). |
| Production GMI-edit + FOTO regression, final serial run | **190 tests: 184 pass, 0 fail, 6 expected skips**. |
| Complete serial suite, without PHOTO_UI_URL | **1,944 tests: 1,835 pass, 7 existing baseline failures, 102 skips**. |
| Targeted ESLint | Clean with `--max-warnings 0`; existing TanStack `react-hooks/incompatible-library` compiler warning disabled only for `LayerDataTable.js`. No newly introduced lint warning. |
| Final production build | Success. |
| `git diff --check` | Clean. |

The seven full-suite failures are the established baseline: `appInfoUiContract` (1), `statsUiContract` (2), `terrainPhotoGml` optional external real-corpus integration (1), and `validationV2WorkspaceInspector` (3). No new regression remains. Existing source-shape contracts were updated only where M5C intentionally adds the cached runner wrapper, dataset/date header or a sibling correction action.

Production regression selection: all `gmiEdit*` and `gmiValidator*` tests, plus `photoLoadedGmiUi`, `photoImportWizardUi`, `mapTeardownUi`, `photoWorkspacePass1dUi`, `gmiPhotoAssociationsUi` and `photoWorkspaceUi`, against `next start` on port 3123. It includes M5B advanced/manual-override, populated-value and conflict protections, source-safe downloads and FOTO association/import/workspace regressions. The full suite also runs the Validator rule and FOTO node suites. Optional private corpus tests remain opt-in.

Focused tests cover verified reparsed numeric values and byte preservation; unchanged Original findings and cache reuse; identical reference dates; new FEIL/SJEKK; genuine resolutions versus severity changes; shifted GUID identities; cross-object NYTT-year and schema findings; every history transition/date mismatch; actual M2 verification failure; read-only sources; each allow-listed applicability contract; exact subset handoff without a value or staging; absent/populated source targets; foreign/stale proposed inspections; source/session retention and removal/reset cleanup.

Browser tests cover default Original and initially unavailable Foreslått; field-only eligible action; exact three-object scope reduced by exclusion; user-supplied value and one M5B staging; actual comparison counts; stale undo/redo; both laptop layouts; dirty-draft cancellation; verified proposed contextual object rows; unchanged original counts; retained dataset selection; new-problem-to-rule navigation; a second GMI layer with no session and missing columns; unchanged synthetic source bytes and no runtime exceptions.

Logs are in `%TEMP%/m5c-*.log`. An early browser assertion compared Buffer and Uint8Array container types rather than bytes; it was corrected to compare equal Buffer contents. Other intermediate failures were test selectors/source contracts or development issues resolved before final verification; none is reported as a baseline failure.

## Screenshot evidence

All GMI content is synthetic. Files were rendered and visually inspected at 1366×768 and 1280×720. Footer actions remained in the viewport and page width did not overflow.

- [Exact M5B scoped review and exclusion](assets/20261109-gmi-edit-m5c/m5c-exact-batch-review.png)
- [Full comparison at 1366×768](assets/20261109-gmi-edit-m5c/m5c-comparison-1366x768.png)
- [Full comparison at 1280×720](assets/20261109-gmi-edit-m5c/m5c-comparison-1280x720.png)
- [Foreslått dataset controls and banner](assets/20261109-gmi-edit-m5c/m5c-validator-proposed.png)
- [Verified proposed exact-object inspection](assets/20261109-gmi-edit-m5c/m5c-proposed-object-inspection.png)
- [Introduced finding before resolved findings](assets/20261109-gmi-edit-m5c/m5c-introduced-findings.png)
- [Comparison-to-rule navigation](assets/20261109-gmi-edit-m5c/m5c-rule-handoff.png)
- [Another layer has no proposed session](assets/20261109-gmi-edit-m5c/m5c-other-layer-unavailable.png)

## Remaining limitations and manual acceptance

Sessions remain in memory and export remains experimental. A closed full-comparison panel must be run again after returning to Rettinger; cached computations can be reused. The detailed change list is scroll-bounded but not paginated. Full validation runs synchronously after yielding to paint its busy state; large deliveries may temporarily occupy the main thread. GUID-less comparison identities rely on M1's fixed object order. The initial correction shortcut is intentionally limited to the three hydraulic missing-value contracts. No structural columns, hyperlinks, FOTO delivery intent, combined export, replacement suggestions or new validation rules were added.

M5B's outstanding real-browser acceptance remains a manual gate; this milestone's synthetic tests do not claim that acceptance or Gemini VA import acceptance. No new real contractor data was added to the repository.

Manual checklist:

1. Open a real imported GMI in Validator. Verify Original is the default and note its counts. Open Rettinger, then return and choose Foreslått; verify the explicit banner and selected-layer identity.
2. Expand an eligible missing SDR/Trykklasse/Ringstivhet result and choose Lag retting…. Verify the field, exact objects and empty replacement value; enter a value, exclude one object, review and stage using M5B.
3. Run Kontroller endringer. Inspect new FEIL/SJEKK, resolved findings and severity changes separately; open an important new problem in Validator and inspect its rule/affected proposed objects.
4. Switch Original/Foreslått and inspect the same objects. Confirm the original values/counts remain unchanged. Switch to another GMI layer and confirm its own session governs Foreslått availability.
5. Undo, redo, discard and change the reference date. Confirm stale comparisons disappear and both reports use the new explicit date when rechecked.
6. Try navigation with a dirty object/batch draft; cancel and verify its value/selection survives. Repeat with absent columns and read-only files; no misleading editable batch should open.
7. Repeat at 1366×768 and 1280×720, then download a reviewed proposal and verify source preservation/Gemini VA behavior as appropriate. Recheck existing FOTO operations.

Nothing was committed or pushed. The temporary production server was stopped after verification.
