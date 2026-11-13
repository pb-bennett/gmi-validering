# Validator / Rettinger U1, U2, U3, U5, U6 completion

Scope: implementation on feature/photo-workspace, starting HEAD 8ec0c25. No Git refs changed, staging, commit, push or deployment. The three pre-existing untracked planning reports were left untouched.

## Outcome and decisions

- U1: Lag, Datasett and Kontrolldato use aligned label/control grids and consistent field typography/padding. The explanatory Norwegian title is on the date label; the accessible Referansedato input name and date handler remain intact. Full validation uses the same Kontrolldato wording and explanation.
- U2: verified and reused the existing GmiSeverityIcon mapping (XCircle / Warning / CheckCircle, Regular). Individual editor, inspector/risk groups and table review already consume this component at the starting commit. No duplicate implementation added.
- U3: the existing presentation reducer snapshots legend collapse state on workspace entry, collapses once, allows manual toggles and restores the snapshot on exit. Validator-to-Rettinger is one continuous workspace interval. Pane measurements preserve the snapshot; compact and profile actions retain their existing behavior.
- U5: verified and retained the existing contextual notice and Endringer redo actions. The notice checks the exact next redo ChangeSet id, and Endringer uses the live session summary. Existing browser coverage verifies identity, keyboard activation, draft guards and disappearance after new staging.
- U6: one transient store map and small shared hook now own section, geometry-tab and geometry-specific Felt group disclosures. Explicit null (closed) is distinguished from an absent preference. Both hosts reuse this state; layer removal and global reset clear it. The map is outside persisted ui and excluded from partialize. Filter membership actions are unchanged.

No Validator rules, eligibility, ChangeSet engine, source bytes, FOTO or export code changed. Existing H2-H4, B1-B3 and T1-T3 paths were exercised by relevant regression coverage, with baseline limitations below.

## Changed files

Application: src/app/page.js; src/components/LayerPanel.js; LayerFilterSections.js; MapPanePresentationProvider.js; gmi-edit/GmiLayerFilters.js; gmi-edit/GmiFullValidation.js; validation-v2/ValidationV2Workspace.js; src/lib/store.js; src/lib/useLayerFilterDisclosure.js (new); src/lib/workspace/mapPanePresentation.mjs.

Tests: tests/mapPaneToolbar.test.mjs; gmiLayerFilters.test.mjs; gmiLayerFiltersUi.test.mjs; gmiValidatorEditingUi.test.mjs; validatorRettingerRefinements.test.mjs (new).

## Verification

Passed:

- Focused Node: node --test tests/validatorRettingerRefinements.test.mjs tests/mapPaneToolbar.test.mjs tests/gmiLayerFilters.test.mjs: 16 passed, zero failures/skips. Includes nested workspace entry, toggles, compact measurement, exit restoration, layer/geometry separation, unchanged layer filters, persistence exclusion and removal/reset cleanup.
- ESLint on every changed JS/MJS application and test file passed (npx.cmd --no-install eslint). PowerShell blocks npx.ps1, so the Windows cmd shim was used.
- Fresh npm.cmd run build passed after permitting Google Fonts access. Initial sandboxed build failed fetching Roboto; no font/dependency/configuration changes made.
- Production browser shared-filter workflow passed all five subtests, including new cross-host disclosure assertions and legend collapse/manual reopen/exit restoration.
- Production batch suites passed, including exact source-byte downloads, risk confirmation, shared severity icons and laptop layouts. Rettinger sidebar suite passed all eight subtests, including contextual redo ChangeSet identity and keyboard/draft behavior.
- Focused isolated U1 browser run passed: node --test --test-skip-pattern="defaults to Original|exact scope preserved|undo and redo invalidate|verified Foresl|new full-comparison|another layer" tests/gmiValidatorEditingUi.test.mjs (PHOTO_UI_URL set). Existing workflow subtests were explicitly skipped here because their baseline failures are separately recorded below. Controls align and have equal heights at 1280x720 and 1366x768; date edits/restoration pass.
- Additional production editing/draft/selection/Validator-selection/geometry/keyboard browser regression batch: 54 passed, 6 failed (Validator suite and its dependent subtests, reproduced on baseline).
- Screenshots inspected for header at 1280x720 and shared filters at both 1280x720 and 1366x768. Headers align; table, inspector and filter content retain scrolling. Screenshots retained in the OS temp gmi-u-screenshots directory.
- git diff --check passed.

Failed / baseline evidence:

- Relevant Node regression command (Rettinger sidebar, layer filters, status browsing, layer rows/search, inspection, gmiEdit*, batch inspector, R4, Validator editing/workspace and map toolbar): 286 tests, 272 passed, 4 failed, 10 skipped. All four failures reproduced against an untouched git archive of HEAD: sidebar source contract plus three workspace inspector contracts. No assertions weakened.
- Full serial suite: node --test --test-concurrency=1 "tests/*.test.mjs": 2148 tests, 2015 passed, 8 failed, 125 skipped. All eight reproduced using tests from the untouched starting commit: appInfoUiContract (1), gmiRettingerSidebar (1), statsUiContract (2), terrainPhotoGml optional external corpus (1), validationV2WorkspaceInspector (3). Browser subprocesses in the initial sandboxed attempt timed out; that attempt was interrupted and the complete suite rerun with Chrome access.
- Production browser first batch: 46 tests, 37 passed, 9 failed (including failed parent suites). R4 preview-summary visibility assertion and Validator workflow failures remain. An untouched baseline was built separately in OS temp and served on port 3124: R4 reproduces the same summary visibility failure; Validator reproduces preview/staging and subsequent missing-state failures (baseline total 16 tests, 8 passed, 8 failed). One initial current run additionally timed out on initial handoff; the repeat passed that step and then matched baseline staging failure. Do not treat this as successful H4 manual acceptance.
- Baseline Turbopack could not resolve a temporary node_modules junction; the isolated baseline used a fresh Webpack production build. Main implementation production build used normal Turbopack. This is a validation-environment deviation, not an application configuration change.

Skipped / manual acceptance remaining:

- Full suite skips include browser suites requiring explicit app variables and private/optional corpus gates. Dedicated production runs above supplied PHOTO_UI_URL and used synthetic fixtures only.
- No private delivery or manual real-file acceptance performed. Remaining manual checks: screen-reader announcement/title discoverability for Kontrolldato, keyboard-only cross-host filter disclosure use, real-delivery FEIL/SJEKK recognition without color, and undo/redo via both contextual locations. Baseline workflow/layout failures remain for separate investigation.

Logs are in OS temp gmi-u-*.log; no private file contents were included. Tests used serial shared-server execution, ports 3123/3124, and only servers started for this task were stopped. No other task's server/build output was used. Final working tree contains only the application/test changes listed here, this completion report and the three original untracked planning reports. Work stops here; FOTO exports were not started.
