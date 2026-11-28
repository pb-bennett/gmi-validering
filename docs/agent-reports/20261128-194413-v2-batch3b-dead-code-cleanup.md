# GMI Validator 2.0 Batch 3B dead-code cleanup

2026-11-28, Europe/Oslo. Baseline and final branch `feature/photo-workspace`, commit `469374a5ac0956f5b1e6b20ebe0fb92ec7fafbb5`. The index was empty. The baseline had four modified tests and three untracked reports, listed in the Git inventory below.

The review used the Batch 3B inventory and the L2a and L2b completion reports. It checked direct imports, re-exports, dynamic imports, page rendering and navigation, store state and persistence, CSS consumers, and test imports and source-text assertions. [Investigation](20261128-165647-legacy-workflow-cleanup-investigation.md) · [L2a completion](20261128-174818-legacy-cleanup-l2a-completion.md) · [L2b completion](20261128-185642-legacy-cleanup-l2b.md)

## Reachability and disposition

| Item | Evidence at the baseline and disposition |
| --- | --- |
| L-04 compatibility state | Retained. Datautforsker, the map, terrain and 3D have live readers of the single-file compatibility state. `FileUpload` still writes the compatibility data and file metadata. Retained the store's existing data, file, terrain, outlier, profile analysis and height-validation paths. |
| L-05 single-file sidebar | The page is the sole `Sidebar` host. The legacy branch requires both data and the absence of multilayer mode, survey layers and photo layers. `FileUpload` adds the survey layer before `setData`, so the nonempty layer order is sufficient even when the compatibility write resets UI defaults. The upload rollback restores previously held data only for an add-to-workspace request and records an import error. Removing the last layer clears compatibility data, reset clears layer and data state together, and persistence does not hydrate survey data. Removed the branch, its overview/Tema/Felt/analysis components, its private handlers and calculations, and the unused reset prop. The multilayer guard, layer controls, resize element/effect, CSS classes, scroll container structure and Kontakt footer remain. Shared profile, height, topplok, outlier and map field-filter logic still have active callers. |
| L-06 legacy field validation | The exported `FieldValidationSidebar` renders V2 directly. The local `LegacyFieldValidationSidebar` had no render site. Its only child consumers of `FieldDetailModal`, `MissingFieldsReport` and `validateFields` were internal to that removed tree. Removed them and their exclusive filter setter. Kept `fieldValidationOpen`, active navigation and the V2 error boundary/Kontakt footer. Kept the persisted `fieldValidationFilterActive` key and map readers, including their interaction with highlight IDs and hidden-feature rules. |
| L-07 standalone components | `DataDisplay`, `DetailedStatsSection` and `ThemeSwitcher` had no production import, dynamic load or render site. The first two were referenced by source-text tests only. The theme switcher was the only `data-theme` writer. Removed the alternate attribute selectors and retained the default root declarations and token mappings. `DataDisplayModal`, the statistics modal and the page-owned reset remain live. |
| L-08 retired FOTO export steps | Both export entry points render `DeliveryWizard`. `PhotoExportPackageStep`, the old wizard start object, reducer and package state/contents functions had consumers only in the retired step and its tests. The default export of `PhotoExportDeliveryStep` had no caller. Removed those pieces, the model fields used solely by the old step (`advance.label` and `completionPrimary`), and CSS selectors with no remaining markup consumers. Retained the named settings and filename controls, readiness/model functions, status components, active CSS, delivery reducer, planner, packaging and download paths. Active markup and CSS use `data-export-*` attributes independently of the deleted class names. |
| L-09 JSON Validator | `validateGmiData` had no import or invocation. The two rule JSON files and their two custom JS modules were referenced only by its implementation. Removed the five files and updated current repository documentation. V2's layout, registry, rules, evaluator, field data and comparison code remain. The A0–A4 tests mention the old paths in import bans and retain their existing assertions. |
| L-10 field detail panels | `LegacyResultPanel` and `LegacyRulePanel` were local declarations with no call sites. Both docked and modal field details use the same content, which renders `DiagnosticResultPanel` or `ModernRulePanel`. Removed the two unused declarations and kept their shared row, source-link and presentation helpers used by the live panels. |
| L-11 source-review count and V2 barrel | `photoSourceReviewPresentation.mjs` was imported only by one test of its counter. No view read that counter. Removed the helper and its isolated test. Retained the V2 barrel, which is an entry point for the active Validator regression suites. |
| L-12 package reference | Retained `photoExportPackage.mjs`. Package, baseline, parity and other tests use it to protect attachment names, bytes, checksums, stale-input rejection and repeatability. Removing it would require migrating safety coverage across packaging paths. |
| L-13 direct FOTO session writers | Retained `applyLayerSource`, `applyGmiAssociations`, `removeGmiSource`, `applyPhotoPositioning` and `applySourceWorkflowPositions`. Although the UI uses the transactional workflow, numerous tests use these methods for real session behavior and fixtures. Deferred per the inventory's post-release decision. Transactional core functions remain. |
| L-14 obsolete height state and profile action | `missingHeightPromptOpen`, `missingHeightDetailsOpen` and `missingHeightLines` had store writes/defaults only. Removed them, the unused actions and their dedicated line scan. The distinct layer-owned `analyzeZValues` result and load prompt remain. `selectLayerAnalysisPipe` had no callers. Removed it while keeping live profile selection and layer analysis state. Old stored UI objects may still contain unused keys until an ordinary reset. The storage version and merge policy were left intact. |

The accepted Validator to Rettinger handoff, batch inspector, ChangeSets, FOTO import/positioning/direction/metadata/delivery, Gemini WFS, GMI/GML parsing and serialization, and byte-preserving export services retain their existing owners. The diff changes no application dependencies, visible copy, active CSS declarations, fixture bytes or expected fixture hashes.

The compatibility-slice actions `clearFeltFilter`, `setFeltSearchText`, `setSidebarOpenSection`, `toggleFeltHiddenValue`, `toggleHiddenCode`, `toggleHiddenType`, `setOutlierResults` and `setZValidationResults` have no remaining call sites. They were kept with the L-04 compatibility state and its persisted UI defaults. The field-validation filter setter was specific to L-06 and was removed while preserving the data the map can still read.

## Test migration

| Modified test | Coverage disposition |
| --- | --- |
| `appInfoUiContract.test.mjs` | The old Validator shell envelope assertion matched only the unreachable field-validation body. The test now checks the actual text button, dialog semantics and shared Kontakt callback. Normal sidebar, page-owned dialog and focus checks remain. |
| `deliveryWizard.test.mjs` | Moved the relevant old reducer guarantees to the live reducer. Frozen inputs, repeated commands and results, stale success and failure completions, blocked plans, failed-build recovery, no download during review, and inability to replace the plan while packaging are checked. Existing review/navigation, retry, stale-plan, final verification and download recording tests remain. |
| `gmiEditWorkspace.test.mjs` | Removed the source check against the unused `DataDisplay` reset. The actual page reset and layer removal paths still require explicit confirmation before discard. The same test checks the production caller inventory, and the behavioral reset and draft-guard tests remain. |
| `mapPaneToolbar.test.mjs` | Moved the endpoint of the live modern rule layout assertion to the next surviving function declaration. The test still checks rule spacing, panel selection and width/overflow contracts. |
| `photoExportLayoutUi.test.mjs` | Removed retired selectors from the scroll owner probe. The same measurements and bounds now resolve the live delivery body or completion panel. |
| `photoExportWizard.test.mjs` | Removed the old reducer/state tests and the obsolete button label and primary treatment assertions. Active navigation, pending reads, async refusal, validation, retry, exact bytes and staleness are covered by `deliveryWizard`, `deliveryWizardUi`, `photoExportWizardUi`, `photoExportReturnUi` and package tests. The old contents tests now assert the real plan's attachment/feature counts, shared originals, excluded placements, byte totals and rename flags. Readiness across formats, capture-time precision and warning copy, model immutability, package repeatability, profile configuration and the shared wizard's write/storage/naming boundaries remain. Added a check of the live delivery review wording when replacing the old component in the wording coverage. |
| `photoWorkspaceUx.test.mjs` | Removed the unused presentation counter test, including its hypothetical count of invalid matched entries. The production matching and write paths retain separate coverage for ambiguous and invalid sources, stale/missing targets, duplicate evidence and atomic publication in `photoSourceWorkflow`, `photoSourceWorkflowDraft`, `photoPositioning` and `photoGmlDirectionEvidence`. Image sizing, panning and zoom assertions remain. |
| `statsUiContract.test.mjs` | Removed positive source assertions for the unused detailed statistics placeholder and the old Validator field modal. Kept absence checks, active statistics controls, map, trigger positioning and workspace visibility assertions. V2 modal and dock behavior remains covered by the active field-detail and browser tests. |
| `statusBrowsing.test.mjs` | Removed the dynamically extracted single-file field analysis. The active layer field list now checks discovery, exact status values and the missing-value count for points and lines. Map filtering and parser assertions remain. |
| `validationV2GmiA6.test.mjs` | Replaced positive legacy implementation assertions with a direct V2 render assertion and legacy absence guard. Layer qualification and the rest of the active Validator checks remain. |

No test file was deleted. No fixture was changed.

## Verification

Selected full Node regression plus expanded production-browser coverage because the removals cross the sidebar, Validator, FOTO, export and shared store. The production checks used a fresh isolated webpack build with all 378 `src/` files verified byte for byte against the working tree. Next.js ran on a free loopback port. Shared-server browser suites ran serially with `PHOTO_UI_URL`, and delivery screenshots went to a temporary directory.

| Check | Result |
| --- | --- |
| `npm run build -- --webpack` | Passed. Next.js 16.1.6 compiled, generated the static pages and traced the API routes. Browserslist reported its existing database-age warning. |
| Scoped `npx --no-install eslint` on the seven modified application JS/MJS files and ten modified test files | Passed with zero errors. The `fieldDataRetry` exhaustive-deps warning in `ValidationV2FieldDetailContent.js` also appears when linting the same file from HEAD. |
| `node --test --test-concurrency=1` on the nine modified non-browser tests | 134 passed, zero failed, zero skipped. |
| `node --test --test-concurrency=1 "tests/*.test.mjs"`, without a production application URL | 2,443 passed, 3 failed, 175 skipped. The failures counted two subtests and their M6 Gemini popup parent. After a map drag, the first subtest waited 30 seconds for a popup. The next subtest then saw two requests instead of four because the earlier refresh never ran. The other checks, including the migrated Status and Kontakt contracts, passed. |
| `node --test tests/geminiPopupBrowser.test.mjs`, standalone | The working tree initially reproduced the same timeout and follow-on assertion. The two latest working-tree attempts each passed all 16 cases. Three standalone runs from an untouched `469374a` archive also each passed all 16. The popup failure was intermittent on the working tree. It was not reproduced on HEAD in these attempts. |
| Production Chrome, `node --test --test-concurrency=1` on the 26 files below | The intermediate build passed 183 cases with zero failed and 3 skipped. On the final build, 182 passed, 1 failed and 3 skipped. The filename capture-time suggestion case missed the date-only details after selecting a photo. Its isolated rerun on the same final build passed, including the date-only, minute-precision and EXIF assertions. |
| `git diff --check` and reference review | Passed. Build resolution and searches over application and test files found no dangling imports or selectors. Remaining old Validator paths are negative import assertions. Report links resolve. All seven protected files matched their baseline SHA-256 hashes. |

The 26 production-browser test files cover the shared shell and layer controls, Validator and Rettinger, Gemini WFS, layer analysis, FOTO import and map interactions, delivery choices, export and wizard navigation. The exact suite names are `shellAccessibilityUi`, `sessionLossUi`, `shellAnalysisCorrectnessUi`, `gmiLayerFiltersUi`, `layerAnalysisUi`, `mapTeardownUi`, `photoMapFitUi`, `photoMapInteractionSlice2Ui`, `geminiWorkflowBrowser`, `validationV2RuleCountsBrowser`, `gmiValidatorEditingUi`, `gmiValidatorReturnUi`, `gmiValidatorSelectionHandoffUi`, `gmiBatchInspectorUi`, `gmiEditDraftGuardUi`, `photoWorkspaceUi`, `photoWorkspacePass1dUi`, `photoImportWizardUi`, `photoLoadedGmiUi`, `photoPositioningUi`, `photoDeliveryIntentUi`, `photoExportLayoutUi`, `photoExportWizardUi`, `photoExportReturnUi`, `deliveryWizardUi` and `wizardNavigationUi`.

Inspected delivery review and package screenshots at 1280×720 and 1366×768. The dialog controls, scrollable content and footer fit both viewports. The build logs and screenshots are in the local temporary verification directory. Both production test servers were stopped.

### Remaining acceptance and risks

- The 175 skips in the full invocation include suites requiring a production URL and opt-in corpus or environment checks. Three skips in the production selection require the private FOTO fixture, including the real EXIF orientation check.
- The Gemini popup and FOTO filename-capture failures passed on isolated reruns. Their causes were not established. The raw full and expanded suite exit codes remain failures and are recorded above.
- The complete browser suite, dev-only and deployed-site checks, external Gemini providers and manual real-file acceptance were outside this verification. There is no added manual acceptance gate for the deletion batch.

## Git inventory

Deleted 13 files.

- `src/components/{DataDisplay,DetailedStatsSection,FieldDetailModal,MissingFieldsReport,ThemeSwitcher}.js`
- `src/components/photos/PhotoExportPackageStep.js`
- `src/data/rules/{lines,points}.json`
- `src/data/rules/custom/{line-logic,point-logic}.js`
- `src/lib/validation/{fieldValidation,validator}.js`
- `src/lib/photos/photoSourceReviewPresentation.mjs`

Modified nine application files.

- `src/app/{globals.css,page.js}`
- `src/components/{FieldValidationSidebar,Sidebar}.js`
- `src/components/photos/{PhotoExportDeliveryStep.js,photoExportWizard.css}`
- `src/components/validation-v2/ValidationV2FieldDetailContent.js`
- `src/lib/photos/photoExportWizard.mjs`
- `src/lib/store.js`

Modified the ten test files listed above and the current documentation in `README.md` and `docs/development.md`. This completion report is the only new file.

The baseline tracked status entries were `tests/gmiCheckboxSoftFocusUi.test.mjs`, `tests/gmiFieldValueInputUi.test.mjs`, `tests/gmiFieldValueSearchUi.test.mjs` and `tests/gmiTableReviewUi.test.mjs`. The baseline untracked reports were `20261125-081855-v2-prerelease-functionality-legacy-audit.md`, `20261125-122023-gemini-wfs-filtering-investigation.md` and `20261128-165647-legacy-workflow-cleanup-investigation.md`. Both groups retained their baseline contents and status. No Git refs or index entries changed. Nothing was staged, committed or pushed.
