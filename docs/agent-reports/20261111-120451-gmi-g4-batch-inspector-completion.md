# G4 — Batch inspector for points and lines: completion

Date: 2026-11-11, Europe/Oslo. Scope: G4 in §8 of [the architecture plan](20261111-092840-gmi-general-batch-editing-architecture.md). Initial and final branch/HEAD: `feature/photo-workspace`, `4599e15c189b16492d17a335befd5bc58ced0adb`.

## Outcome and changed files

The integrated Rettinger inspector now edits one general field on an explicit selection of points or lines. Four synthetic LOK points received `InnvendigUtvendig = OD` in one reviewed ChangeSet; undo/redo retained its identity, and the downloaded GMI differed only in the four approved source spans.

- `src/components/gmi-edit/GmiBatchInspector.js`: G1 capability picker with no default field; disabled/absent fields with explanations; effective empty-value count; **Fyll manglende verdier** and **Sett verdi**; G2 per-object previews; G3 full dataset validation; exact-candidate staging and all six confirmation gates. Existing selection, draft, table-focus and inspection behavior is reused.
- `src/components/gmi-edit/GmiFieldValueInput.js` (new): native permitted-value dropdowns for every enumeration, including SDR/Trykklasse/Ringstivhet; text controls with existing format and numeric hints otherwise. Options come directly from G1 domains. No out-of-list entry option.
- `src/components/gmi-edit/useGmiBatchValidation.js` (new): isolated asynchronous dry-run lifecycle, four-phase progress, cancel/retry, live session/date checks and cleanup that revokes obsolete evidence. Approval queries G3 again immediately before staging the same ChangeSet object.
- `src/lib/gmiBatchInspectorView.mjs`: additive generic presentation adapters for point/line rows, exclusions and manual inclusion; basic mixed-selection check on effective Tema and the edited field; localized dataset findings, cached per dry run/rule/scope. Existing hydraulic helpers and their tests remain available.
- `src/components/gmi-edit/GmiEditWorkspace.js`: removes the obsolete field-preselection prop; the existing Validator entry also starts with an empty field choice. No selection/handoff mechanism changed.
- `tests/gmiBatchInspector.test.mjs`: capability/no-default, general presentation, manual applicability and hydraulic populated-fill exclusion regressions.
- `tests/gmiBatchInspectorUi.test.mjs`: new G4 production scenarios plus updated existing integrated-inspector coverage. Covers the four-point export, one ChangeSet, undo/redo, line Material fill, Merknad overwrite/conflict replacement, manual applicability, unvalidated fields, mixed Tema/values, new FEIL, unsafe text, cancellation and stale history.
- `tests/gmiLayerFiltersUi.test.mjs`, `tests/gmiR4UxPolishUi.test.mjs`, `tests/gmiValidatorEditingUi.test.mjs`: explicit field selection, native dropdown interaction/listed SDR lexemes, mandatory-validation waits and new-FEIL approval where required by G4.
- This completion report.

SDR, Trykklasse and Ringstivhet still use G2's unchanged M2 eligibility-token path. Generic UI code does not recreate applicability rules or bypass source/editability gates. In hydraulic fill mode, populated values remain skipped and cannot be manually included, even if they equal the selected listed value. The existing engine still accepts its established numeric spellings; the new dropdown offers authoritative listed spellings.

No G5+, Validator checkbox handoff, linked Tema operation, dependency/style change, source/verifier change, fixture/hash/manifest update or legacy batch-dialog change. The object editor is unchanged. The basic mixed gate deliberately remains limited to Tema and the edited field; the full profile belongs to G7.

## Verification

Passed:

- Final production build: `npm.cmd run build`.
- Final serial production-browser gate: **93 passed, 0 failed, 0 skipped**. Fresh production server on verified-free port **3140**, with `PHOTO_UI_URL=http://localhost:3140` and `GMI_EDIT_SCREENSHOT_DIR=%TEMP%/gmi-g4-screenshots`:

  ```powershell
  node --test --test-concurrency=1 tests/gmiEditWorkspaceUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/gmiEditValidationUi.test.mjs tests/gmiValidatorEditingUi.test.mjs tests/gmiLayerFiltersUi.test.mjs tests/gmiEditSelectionUi.test.mjs tests/gmiBatchInspectorUi.test.mjs tests/gmiR4UxPolishUi.test.mjs tests/gmiEditBatchUi.test.mjs tests/layerDataTableGeometryUi.test.mjs tests/layerDataTableKeyboardUi.test.mjs tests/gmiRettingerSidebarUi.test.mjs
  ```

- Viewed screenshots at **1280×720** and **1366×768**. Inspector, table, approval action and workspace footer remain usable without horizontal page overflow. Existing browser tests also check expanded-table layouts. Native keyboard controls and surrounding table keyboard/draft guards are exercised.
- The standing Node gate plus G2 planning tests completed with **255 tests: 242 passed, 3 failed, 10 skipped**. All seven inspector tests and all executed editing, planning, dry-run, hydraulic and source-safety tests passed:

  ```powershell
  node --test --test-concurrency=1 tests/gmiRettingerSidebar.test.mjs tests/gmiLayerFilters.test.mjs tests/statusBrowsing.test.mjs tests/layerTableRows.test.mjs tests/tableSearch.test.mjs tests/objectTableInspection.test.mjs "tests/gmiEdit*.test.mjs" tests/gmiBatchInspector.test.mjs tests/gmiFieldBatchPlan.test.mjs tests/gmiR4UxPolish.test.mjs tests/gmiValidatorEditing.test.mjs "tests/validationV2Workspace*.test.mjs"
  ```

- `npx.cmd --no-install eslint` on all ten changed/added JS/MJS files: passed.
- `git diff --check`: passed. Git reports its configured LF→CRLF notices for two text files; byte-exact fixtures were untouched.

Failed / established baseline:

- The three Node failures are `validationV2WorkspaceInspector` assertions for normal sidebar width, workspace-shell placement and map/3D resize composition. Archived the starting HEAD's tracked `src`, `tests`, `public` and `package.json` into a temporary directory and ran that unchanged test file against it with the existing dependencies: **7 tests, 4 passed, the identical 3 failed**. No assertion was relaxed.
- Initial restricted build/browser attempts could not fetch the configured Roboto font or enable Chromium debugging. They were rerun with permitted network/process access; final build and browser checks passed. Intermediate test failures were corrected before the final runs, including the hydraulic populated-row presentation regression.

Skipped / remaining acceptance:

- Node skips: **five unconfigured production-browser entry tests**, covered separately by the configured browser gate above, and **five opt-in private-corpus checks**. `GMI_EDIT_CORPUS` is not configured; no private/reference corpus was searched or opened. Largest-real-file performance is unmeasured.
- Architecture §10.5's real-delivery manual acceptance, including a complete keyboard-only pass and downstream Gemini VA acceptance, remains outstanding. Synthetic automation and screenshots do not establish those results. Numeric/year/date/text planner regression tests passed; no G5 date picker or object-editor control work was added.
- Cancellation operates at existing G2 chunk/G3 phase boundaries; individual synchronous verification/Validator calls cannot be interrupted midway.

Logs: `%TEMP%/gmi-g4-node-gate-final.log`, `gmi-g4-head-baseline.log`, `gmi-g4-browser-gate-final.log`, `gmi-g4-build.log`. G4 point screenshots: `%TEMP%/gmi-g4-1280x720.png` and `gmi-g4-1366x768.png`; broader screenshots are in `%TEMP%/gmi-g4-screenshots/`.

## Git and process state

Preserved the three existing untracked planning reports (`20261111-085500-…`, `20261111-092840-…`, `20261111-093345-…`) without edits. Only the ten implementation/test files above and this report belong to this task. Nothing staged, committed, pushed, synchronized, deployed or changed in Git refs. The test server was stopped and port 3140 was verified free. No unrelated process was stopped.
