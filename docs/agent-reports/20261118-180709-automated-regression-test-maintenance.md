# Automated regression test maintenance

Date: 2026-11-18. Repository: `C:/GitHub/gmi-validering-test`. Branch: `feature/photo-workspace`. Starting HEAD: `4bc35e9dea87a3b6d1d525ecb26947d46915f88e`; starting working tree clean.

## Scope and evidence

Test maintenance only. No application, styling, dependency, private-corpus requirement or Git-ref changes. No staging, commits, pushes or deployment. No subagents.

Read root `AGENTS.md`, `docs/development.md`, the existing Chrome harness and relevant workflow helpers. Approved behavior was checked against these reports:

- `20261117-100442-acceptance-ui-corrections-implementation.md`: accessible marker names and visual previews replace native marker titles.
- `20261118-103245-acceptance-batch-a-s4-s8-s5-implementation.md`: eligible accepted EXIF positions default to GML; collection and delivery counts remain distinct; shared sidebar changes available toolbar width.
- `20261118-112250-acceptance-batch-b-s12-s9-implementation.md`: report download moved to the package footer; unified filename field structure.
- `20261118-123721-acceptance-batch-c-s6-s7-implementation.md`: automatic Validator controller runs and preserved revision/filter behavior.
- `20261118-135500-acceptance-batch-d-s10-s11-implementation.md` and `20261118-170741-final-acceptance-refinements-s5-s9-s10.md`: current controls, tooltips, map fitting and filename editor.
- `20261118-173012-foto-m4-metadata-presentation-readiness.md`: current metadata/readiness presentation.
- `20261115-144136-button-workspace-consistency-completion.md`, `20261116-150610-validator-datatable-slice3.md`, and `20261116-180853-outstanding-plans-implementation-reconciliation.md`: established controls and retained legacy batch workflow.

Environment: Windows PowerShell, Node 24.19.0, npm 11.14.1, Chrome 155.0.8059.85, Next.js 16.1.6. Fresh production build passed; production server bound to `127.0.0.1:3193`. Production sources stayed unchanged throughout verification.

## Baseline and final results

| Check | Baseline | Final |
| --- | --- | --- |
| Full serial Node | 2,400 total; 2,249 passed; 1 failed; 150 skipped | 2,400 total; 2,250 passed; 0 failed; 150 skipped |
| Complete configured production/browser selection | 492 total; 463 passed; 18 failed; 11 skipped | 478 total; 464 passed; 3 failed; 11 skipped (complete first post-correction run; see intermittent failure below) |
| Production build | Passed | Same fresh build; no production edits |
| Affected-file ESLint | ? | Passed |
| `git diff --check` | ? | Passed |

Node/browser totals include parent tests. The baseline browser failures represent 15 leaf failures and three failed parents, rather than 18 independent defects. No tests were deleted, newly skipped or given longer timeouts.

The initial nine-file focused browser run had 44 passes and five failures (three leaves, two parents). It confirmed the footer defect and exposed EXIF defaults and hover-preview setup assumptions previously masked by early failures. After the remaining justified corrections, the provenance suite passed 9/9; A7 passed 10/10. Final complete runs are authoritative above.

## Original failures and corrections

| Original failure | Diagnosis and exact correction | Retained coverage |
| --- | --- | --- |
| `validationV2GmiA7`: ?Validator exposes only the automatic V2 workflow? | Source assertion expected a literal `aria-label` instead of the shared `PhotoIconButton` label. The following assertion also expected obsolete `runValidation()` rather than the S6 `controller.run({ ...input, referenceDate })` effect. Match the current component, close handler, workspace identity and automatic effect/dependencies. | Automatic-only V2 workflow, safe close, no clearing source data, revision and reference-date triggers, geometry exclusion. Production Validator suites also exercise the actual control. |
| `buttonConsistencyUi`: workspace close family | Narrow map toolbar moves reset into ?Flere kartverkt?y?. Open its existing overflow before inspecting reset. | Geometry, hover, focus, pressed/disabled states, tooltips and unchanged exit destinations. |
| `gmiEditBatchUi`: empty configuration/draft cancellation | Same responsive-toolbar selector issue; reveal reset through the existing overflow. | Unsafe values, overwrite acknowledgement, beforeunload and navigation draft guards. |
| `gmiEditBatchUi`: actual M2 reasons/bounded rows | Genuine offscreen footer; assertion retained. Capture screenshots before asserting, wait for two resize paint frames, collect both viewport geometries and include measured bounds in failure text. | Eligibility reasons, paging/search, individual exclusions/all/none and viewport containment. |
| `gmiPhotoPlacementsUi`: two checkpoints/shared image | Marker lookup used removed native `title`. Select the exact occurrence using existing `data-photo-id`; assert its accessible object name and absence of native title. | Independent checkpoint selection, shared asset/source identity, placement and direction changes, recheck/removal. |
| `photoAcceptanceRenderingUi`: M10 done screen | Approved footer now includes ?Last ned rapport?. Include it in the exact ordered action list. | Download initiation, generated filename, schema warning, available actions and unchanged repeat download. |
| `photoDeliveryExclusionUi`: direct delivery cycle | S4 intentionally includes two accepted EXIF photos. Expect one unselected photo rather than three; assert the single-photo pill is solid, included and GML. | Independent choices, shared placements, keyboard access, exclusion and layer-removal boundaries. |
| `photoExportLayoutUi`: missing times/blocked formats | Helper read the whole composite filename label (including generated sections). Resolve the field?s actual `aria-labelledby` before the enclosing label fallback. | Exact meaningful keyboard-stop names, focus containment/indicators and viewport visibility, blockers and completion navigation. |
| `photoExportWizardUi`: normal path | Same approved report-download footer action. Update exact ordered list. | Default Gemini format, wizard agreement, package generation and identical repeat ZIP download. |
| `photoMarkerProvenanceUi`: discard/save/shared GMI | Removed title lookup returned no shared occurrences, aborting before manual placement. Use exact shared occurrence IDs. | Both GMI occurrences retain provenance through discard/save; only the moved occurrence changes delivery; manual placement remains genuinely manual. |
| `photoMarkerProvenanceUi`: delivery colours/defaults | Initially cascaded from absent manual marker; subsequent focused run exposed pre-S4 EXIF expectations. Assert GML default, then explicitly exclude through existing inspector before exercising the unchanged exclusion/GML cycle; restore the current GML default. | Exact palette, independent sibling decisions, map selection never changing delivery, explicit actions and both map backdrops/laptop sizes. |
| `photoMarkerProvenanceUi`: selection/hover/direction | Removed title assertion; old synthetic `mouseover` did not test current preview listeners. Assert accessible provenance/no native title, dismiss the prior persistent preview with Escape, exercise `mouseenter`/`mouseleave` visual previews for every source, and verify delayed neighbor hover plus immediate keyboard preview without changing selection. | All four accepted provenance fills, visible source labels, selection safety and accepted direction transaction. |
| `photoMarkerProvenanceUi`: both viewport layouts | Cascaded from the early shared-title failure leaving only four markers. No viewport/count assertion removed or relaxed. | Established display card geometry, map-control separation and full source collection. |
| `photoMarkerProvenanceUi`: Pass 1D source dots | Same cascade: manual placement never ran. No unrelated assertion change. | Source dots in workspace/main-map thumbnails, selected ring and direction. |
| `photoMarkerProvenanceUi`: hidden layer/re-entry/reset | Same cascade. No lifecycle assertion change. | Hidden layer behavior, repeated visits, source replacement and display-card cleanup. |
| `photoWorkspaceStacksUi`: unique asset/placement counts | Whole-container text now includes approved delivery totals. Assert the exact identity-count span separately and explicitly assert `GMI 8`/`GML 0`. | Seven unique assets, eight occurrences and both delivery counts; all stack/edit/navigation tests retained. |

The three baseline failed parents were legacy M5B, synthetic provenance and workspace stacks. They follow their leaf outcomes.

Two opt-in private suites also contained the same obsolete marker-title lookups: `photoSpatialUi` and `photoWorkspaceUi`. Replace only those lookups with the unchanged accessible names. Corpus gates, hashes, data, real-file requirements and all behavioral assertions remain unchanged. Their private bodies were not executed; these corrections are statically checked, not claimed as real-file acceptance.

## Remaining genuine defect

`gmiEditBatchUi` reproduces the retained legacy ?Masseendringer? review footer outside the viewport. With the existing synthetic 129-object fixture, choose SDR `11.0`, continue to review, exclude one eligible row, exercise paging and resize to 1366?768. Expected: confirmation/navigation footer remains visible within the viewport. Observed in the focused rerun: footer top `939.84375`, bottom `994.84375` in a 768px viewport; dialog width and horizontal scroll width are both 1078px. Retained screenshots: [1280?720](assets/20261118-180709-automated-regression-test-maintenance/m5b-review-1280x720.png), [1366?768](assets/20261118-180709-automated-regression-test-maintenance/m5b-review-1366x768.png). Both were inspected and visibly clip the content before the confirmation footer.

Likely cause: `src/components/gmi-edit/gmiEdit.css:416` broadly overrides `.gmi-batch-content` with `display: grid; flex: 1 0 auto`, superseding the legacy dialog?s shrinkable scroll-content rule at line 161. This can push its nonshrinking footer beyond the fixed-height, overflow-hidden dialog. A focused follow-up should scope the inspector recipe and restore the legacy dialog scroll/height contract, then rerun this unchanged assertion at both laptop sizes. No production fix or legacy cleanup was attempted here.

## Additional intermittent failure

The first complete post-correction browser run reported 478 tests: 464 passed, three failed (two leaves and one parent), 11 skipped. Besides the retained batch footer leaf/parent, `deliveryWizardUi.test.mjs:437` failed in ?M10 production wizard: modes, M9 bytes, split acknowledgement, shared intent, safety, downloads, keyboard and laptop layouts?. Immediately after setting Merknad to the synthetic correction, the `.gmi-edit-inspector .gmi-edit-editor` lookup was null when querying the overwrite checkbox. Its 14 nested M10 cases were consequently never registered, explaining the smaller total. The original baseline passed this same unchanged test.

Ten fresh-browser diagnostic replays of the same import, point selection and draft input all observed the editor, exact entered value and overwrite checkbox both immediately and after 500ms. A MutationObserver recorded no editor removals in those successful replays. The subsequent confirmation run passed the unchanged M10 setup and all 14 nested cases before the user requested an immediate wrap-up. That second confirmation run was stopped during the H3 production suite; it has no final totals and is not counted as a complete run. It also reproduced the same batch-footer leaf/parent failure. All other checks reported up to interruption passed or met their existing skip gates. No timeout, assertion or production-code correction was made for this failure.

Classification: observed intermittent browser/editor-lifecycle failure, cause unresolved; not established as an obsolete assertion or confirmed persistent application regression. It must remain visible in the baseline history. Recommended follow-up: instrument editor/portal-root and selected-object changes around draft entry under load (`GmiEditWorkspace.js` portal, `GmiObjectEditor.js` draft/dirty effects, `page.js` inspector root). Determine whether selection or the draft is actually lost before adding any synchronization condition. Merely waiting for a remounted editor could conceal data loss. The first post-correction Node and production runs overlapped, with independent harnesses/ports; the confirmation production run ran alone. This is context, not proof of a load-related cause.

## Skips, warnings and limits

- Full Node?s 150 existing skips are configuration gates: production-app browser cases without `PHOTO_UI_URL`, the separate next-dev case without `PHOTO_DEV_UI_URL`, and opt-in private corpora. These are not 150 executed passing checks.
- Production/browser selection has 11 expected skips: nine top-level private-corpus cases, the nested real-JPEG EXIF-orientation case, and the next-dev-only StrictMode dialog case. No Chrome initialization or missing-production-server skip occurred. Private data requirements were not changed or bypassed.
- The private browser cases cover G01/G04 associations, append duplicates, completion hub, source/export reconciliation, capture-time correction, manual placement, real source import, spatial markers and real workspace lifecycle. Exact original requirements remain in their existing suites.
- Development StrictMode is not exercised by a production build; this task?s production baseline does not certify that separate environment.
- Existing build/test diagnostics include outdated Browserslist data, module-type reparsing warnings and storage-unavailable messages in Node store tests. Build succeeds; no dependency/config changes made to suppress them.
- Synthetic automation is not contractor-file/manual acceptance. No private files were copied or changed.

## Reproduction commands

Run from the repository root in PowerShell. Leave opt-in private-corpus and next-dev variables unset to reproduce these totals.

```powershell
node --test --test-concurrency=1 "tests/*.test.mjs"
npm.cmd run build
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3193
```

In a second PowerShell, after the server is ready:

```powershell
$env:PHOTO_UI_URL='http://127.0.0.1:3193'
$env:PHOTO_SCREENSHOT_DIR="$env:TEMP/gmi-regression-final-artifacts"
$env:GMI_EDIT_SCREENSHOT_DIR=$env:PHOTO_SCREENSHOT_DIR
$env:PHOTO_FIXES_SCREENSHOT_DIR=$env:PHOTO_SCREENSHOT_DIR
$env:DELIVERY_SCREENSHOT_DIR=$env:PHOTO_SCREENSHOT_DIR
node --test --test-concurrency=1 --test-reporter=tap "tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"
```

This selects all 69 `*Ui` files (including their two non-production-app unit-style suites and the gated dev case), `photoDialogLayout`, and six self-contained `*Browser` suites. The complete Node run also includes those self-contained browser suites. Each command runs files serially; shared production-browser runs were never concurrent with one another. Node?s independent harnesses use their own ports.

Focused corrections were checked with:

```powershell
node --test tests/validationV2GmiA7.test.mjs
node --test --test-concurrency=1 --test-reporter=tap tests/buttonConsistencyUi.test.mjs tests/gmiEditBatchUi.test.mjs tests/gmiPhotoPlacementsUi.test.mjs tests/photoAcceptanceRenderingUi.test.mjs tests/photoDeliveryExclusionUi.test.mjs tests/photoExportLayoutUi.test.mjs tests/photoExportWizardUi.test.mjs tests/photoMarkerProvenanceUi.test.mjs tests/photoWorkspaceStacksUi.test.mjs
node --test --test-reporter=tap tests/photoMarkerProvenanceUi.test.mjs
$files = git diff --name-only -- '*.mjs'
npx.cmd --no-install eslint $files
git diff --check
```

Task execution redirected baseline/final output to `$env:TEMP/gmi-regression-node-{baseline,final}.log`, `$env:TEMP/gmi-regression-browser-{baseline,final}.log` and `$env:TEMP/gmi-regression-build.log`; the final confirmation used `$env:TEMP/gmi-regression-browser-confirmation.log` and screenshot root `$env:TEMP/gmi-regression-confirmation-artifacts`. Windows PowerShell wrote UTF-16 logs. Baseline browser used the default reporter; final used TAP for immediate failure diagnostics. The exact test selection is unchanged. Screenshots remain synthetic.

## Complete changed/new file inventory

Modified tests:

- `tests/buttonConsistencyUi.test.mjs`
- `tests/gmiEditBatchUi.test.mjs`
- `tests/gmiPhotoPlacementsUi.test.mjs`
- `tests/photoAcceptanceRenderingUi.test.mjs`
- `tests/photoDeliveryExclusionUi.test.mjs`
- `tests/photoExportLayoutUi.test.mjs`
- `tests/photoExportWizardUi.test.mjs`
- `tests/photoMarkerProvenanceUi.test.mjs`
- `tests/photoSpatialUi.test.mjs`
- `tests/photoWorkspaceStacksUi.test.mjs`
- `tests/photoWorkspaceUi.test.mjs`
- `tests/validationV2GmiA7.test.mjs`

New report/evidence:

- `docs/agent-reports/20261118-180709-automated-regression-test-maintenance.md`
- `docs/agent-reports/assets/20261118-180709-automated-regression-test-maintenance/m5b-review-1280x720.png`
- `docs/agent-reports/assets/20261118-180709-automated-regression-test-maintenance/m5b-review-1366x768.png`

## Outstanding work and final state

The requested complete baseline and one complete post-correction production-browser run were finished. A second confirmation run was intentionally stopped at the user's request to conserve usage; do not treat its partial results as a green full run.

1. Investigate and fix the confirmed legacy batch-dialog footer defect in a separately authorized production implementation. Rerun `tests/gmiEditBatchUi.test.mjs` at both laptop sizes afterward; keep its containment assertions.
2. Investigate the intermittent missing-editor event in `tests/deliveryWizardUi.test.mjs:437`. Baseline and the partial confirmation passed the unchanged test, and ten diagnostic replays retained the draft, but one complete run failed. Its cause remains unresolved. Do not hide it with an unconditional wait or retry.
3. Run the complete serial production-browser command again when usage permits, without overlapping other test runs. The complete post-correction baseline remains 464 passed / 3 failed / 11 skipped across 478 registered tests; 14 M10 children did not register after that setup failed. The partial confirmation did execute and pass those 14 cases but did not finish the rest of the suite.
4. Opt-in private-corpus and next-dev checks remain unexecuted in their required environments. Their requirements and manual real-file acceptance are unchanged.

Task-owned production server and remaining confirmation test/browser process tree were stopped. No Git publication actions were taken. HEAD remains `4bc35e9`; all changes are unstaged. The complete inventory above consists of 12 modified tests, this report and two synthetic screenshots.
