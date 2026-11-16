# Validator and Data Table corrections (Slice 3): completion report

- Date: 2026-11-16
- Branch: `feature/photo-workspace`, baseline HEAD `c66937a`
- Status: implemented and verified. Nothing staged, committed or pushed.

## Scope and outcome

1. **Byggemetode on LOK/TOP.** Byggemetode is no longer required on LOK or TOP. A missing value gives neither Feil nor Sjekk, including for NYTT objects. A supplied value is still validated normally: a valid code passes, UK gives Sjekk and an invalid code gives Feil. Requirements on KUM/SAN/SLS/SLU/KUMI etc. are unchanged. Other LOK rules still report, for example Bredde, which stays applicable on LOK, and the LOK/TOP S_HYPERLINK policy.
2. **Blocked VertikalDimensjon navigation.** The Rørform Feil is unchanged. VertikalDimensjon stays `NOT_EVALUATED` / `PIPE_SHAPE_UNRESOLVED` (shown as Sjekk) and still has no finding of its own, so the same defect does not produce a second Feil. The dependency note in the Resultat tab now has the same "Vis N objekt(er)" action as finding diagnostics. It opens the shared Validator object table focused on the exact blocked pipes. From there, row inspection, checkbox selection, map halo and "Åpne i Rettinger" work as before. This also applies to every other dependency note: SDR/Ringstivhet blocked by Material, Tema-dependent rules and Type blocked by Tema.
3. **Nr. in the standard Data Table.** The ordinary table now shows the existing Rettinger "Nr." column for GMI layers whose current geometry has parser object numbers (`:P n` / `:L n`). It uses the same source as Rettinger (`gmiObjectNumber`, which reads the parser `id`), so gaps and separate point/line numbering are kept. The tooltip says "Punkt 3" or "Ledning 3", and the search accepts `p3` / `l3`. Non-GMI layers, and GMI geometries without numbers, get no column, so no numbers are invented.

## Changed files

Source:
- `src/lib/validation-v2/registry/pointFieldApplicability.js`: LOK × constructionMethod changed from APPLICABLE to OPTIONAL_SUPPORTED; new TOP × constructionMethod OPTIONAL_SUPPORTED cell; `policyRevision` `2026-11-16.1` (133 cells).
- `src/lib/validation-v2/registry/fieldInformation.js`: Byggemetode summary and qualification state the LOK/TOP exemption and that Byggemetode is not cover material.
- `src/lib/validation-v2/registry/rules.js`: Byggemetode rule description now matches the actual applicability.
- `src/lib/validation-v2/diagnostics.js`: dependency notes carry runtime-only `exactObjectRefs` / `hasCompleteExactObjectRefs`, as finding diagnostics already do.
- `src/lib/validation-v2/tableInspection.js`: outcomes blocked by a prerequisite (`DEPENDENT_TEMA_UNRESOLVED` or a suppression) join the inspected population as `CHECK`, matching the rule-list status. Other `NOT_EVALUATED` outcomes are still excluded.
- `src/components/validation-v2/ValidationV2FieldDetailContent.js`: shared `OpenObjectsButton` used by diagnostic blocks and dependency notes. The note gets `data-dependency-note`.
- `src/components/validation-v2/ValidationV2Workspace.js`: when a dependency note opens the table, the context status is `CHECK` and the reason is the dependency summary.
- `src/lib/gmiEditView.mjs`: new `hasNativeGmiObjectNumbers(dataset, scope)`.
- `src/components/LayerDataTable.js`: split `inRettinger` (Rettinger-only behaviour: column focus, layer-name hiding, table-size toggle, proposed label) from `showObjectNumber` (Rettinger or native GMI numbers).

Tests:
- New: `tests/validatorDataTableSlice3.test.mjs` (Node), `tests/validatorDataTableSlice3Ui.test.mjs` (production browser).
- Updated contract tests (deliberate policy change, with equivalent coverage kept): `validationV2PointFieldApplicability`, `validationV2GmiV32Batch2`, `validationV2GmiV32PointCodeLists`, `validationV2RulePresentation`.
- `gmiR4UxPolishUi.test.mjs`: the old "ordinary table has no Nr." assertion now asserts exactly one Nr. column. The Rettinger-only table-size toggle is still asserted absent.
- `gmiObjectLinkedTemaUi.test.mjs`: the fixture's one "new SJEKK after Tema→LOK" used to come from LOK's missing Byggemetode. It now comes from `Vertikalnivå=UNDER_GRUNN`, which is a Tema-dependent Sjekk on LOK, so the gate is still tested with the same assertion.

## Implementation decisions

- LOK/TOP use `OPTIONAL_SUPPORTED`, the same state as PSP. This means "not required, validated when supplied", unlike `NOT_APPLICABLE`, which would flag any supplied value. TOP had no cell before (UNKNOWN). It now has an explicit cell, so its behaviour is a recorded decision. One consequence: a valid Byggemetode supplied on TOP now passes, where it used to give an applicability Sjekk.
- No value is copied, derived or filled in. Byggemetode and cover material stay separate.
- Prerequisite-blocked objects are not turned into findings. Navigation reuses `buildValidatorFieldInspectionRequest`, then `openObjectTable` and the existing selection/handoff path.
- The Nr. column reuses the Rettinger column definition, sticky offset and 32px zoom width. No new styles or colours.

## Verification

- Focused Node: `tests/validatorDataTableSlice3.test.mjs`: 11/11 pass. Validation-v2, inspection, table-row and validator suites: 383 tests, 381 pass, 1 skip, 1 fail (the known stale "Lukk Validator" source-literal assertion; HEAD source has no `aria-label="Lukk Validator"` literal either).
- Production build: `next build` passes in an isolated copy (other agents' `next start` servers were using the repository `.next` on 3110/3112/3113, so it was left alone). Servers ran on free ports 3120 (changes) and 3121 (HEAD baseline). Both were stopped afterwards.
- New browser test `validatorDataTableSlice3Ui`: 4/4 pass. It covers the standard-table Nr. (nonconsecutive 3…35 and 1…5, sorting both ways, search, Punkt/Ledning tooltips), 28px rows, a sticky opaque Nr. cell directly after the zoom cell, and no page overflow at 1280×720 and 1366×768. It also covers the Byggemetode diagnostic (only the KUM is flagged) and VertikalDimensjon: dependency note, "Vis 1 objekt", exactly Ledning 4, `aria-current`, selected and active row fill, map halo, and "Åpne i Rettinger (1)" to `line:3` with VertikalDimensjon provenance. Screenshots were inspected.
- Related browser suites (16 files, serial): 81/82 pass before the R4 contract update; R4 passes after it.
- Full serial suite with production URL (`node --test --test-concurrency=1 "tests/*.test.mjs"`): 2525 tests, 2489 pass, 25 skipped, 11 failing tests reported:
  - Fixed in this task: `gmiObjectLinkedTemaUi` (5 entries). It passed at HEAD and failed only because of the intended Byggemetode change. It passes after the fixture update.
  - Also fail against the HEAD baseline build with HEAD tests, so they predate this task: M5B/"actual M2 reasons" (`gmiEditBatchUi`), the FOTO stacks count "7 bilder · 8 plasseringer" and Pass 1B (`photoWorkspaceStacksUi`), and FOTO Slice 2 (`photoMapInteractionSlice2Ui`, which also passed once on a rerun, so it is flaky). The known stale Validator close-label assertion is also in this group.
- ESLint on all touched files: 0 errors. Two pre-existing warnings on unchanged lines (`useReactTable` incompatible-library, an unnecessary `fieldDataRetry` dependency).
- `git diff --check`: clean.

## Remaining limitations and risks

- The standard Data Table is 36px wider for GMI layers (Nr. 40px, zoom 36→32px). It was checked at both laptop sizes with a small synthetic file, not with a wide real delivery.
- Dependency notes for non-line rules (for example Tema-blocked point rules) get the same action. They are covered by Node tests but not separately browser-tested.
- Not done (out of scope): LOK/TOP→KUM hyperlink transfer, `_revXX` filenames, and the pre-existing failures listed above.

## Minimal manual acceptance

1. Load the accepted real delivery. Under Validator, Punkter, Byggemetode, no LOK/TOP objects should be listed. KUM objects without Byggemetode should still be listed.
2. Under Ledninger, open VertikalDimensjon for the pipe without Rørform. Click "Vis 1 objekt" in the grey note and confirm that the table and map show that pipe. Select it, click "Åpne i Rettinger (1)" and confirm the editor opens on it.
3. Open the ordinary Data Table. Punkter should show Nr. 3, 4, 5, 6, 11, … and Ledninger 1–5. Sort, search and select, and confirm the numbers stay with their objects at 1280×720 and 1366×768.

## Git

No staging, commit, push or ref changes. Pre-existing untracked reports in `docs/agent-reports/` were left untouched.
