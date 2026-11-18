# GMI Validator acceptance corrections, Batch C

18 November 2026, Europe/Oslo. Implemented S6 followed by S7 on `feature/photo-workspace` at `45c0eb2`. The checkout was clean at the start. Scope follows the [acceptance plan](20261118-085516-real-data-acceptance-corrections-planning.md) and the Batch C instructions.

## S6 — Validator dataset switching (B3)

The workspace tracks the last survey layer and dataset revision. On a same-layer revision change, the controller drops the old result and keeps the selected geometry if the new revision has objects in that scope. It falls back to the default geometry otherwise. The existing Validator runs for the new revision. `DATASET_CHANGED` preserves search, status and sort and keeps the expansion when its field still has a presentation in the selected geometry.

The active field inspector re-resolves the canonical field and exact rule ID in the new result for that geometry. It updates the rule group and revision before the inspector can show the new result or request objects. Validator-owned object inspections close before reuse of the view, since their object references were derived from the old revision. An independent ordinary Data Table keeps its existing lifecycle.

A different survey layer takes the full reset path, including default geometry and sort, clearing search, status, expansion and field selection. Sorting had carried across layers at baseline. This batch includes sorting in the requested full reset. Validation rules, severity calculations, Rettinger corrections and source bytes retain their existing paths.

Application files — `src/components/validation-v2/ValidationV2Workspace.js`, `src/lib/validation-v2/validationViewController.js` and `src/lib/validation-v2/resultPresentation.js`.

Regression files — `tests/validationV2GmiA81ResultsWorkflow.test.mjs`, `tests/gmiEditValidationUi.test.mjs` and `tests/gmiValidatorEditingUi.test.mjs`. Chrome verified **Ledninger**, search, status, sort, expansion and inspection closure in the Original/Foreslått workflow. At 1366×768 it also verified that the docked inspector followed the active rule in both directions and could open a new proposed inspection. The 1280×720 workflow follows the existing modal behavior, where opening the object table dismisses the modal.

## S7 — Temporary FOTO visibility in Validator (B4, D6)

The existing render-time override uses `validator` for a continuous Validator visit and `rettinger:<layerId>` for a Rettinger visit. Entry and either direct workspace transition reconcile to a hidden state before rendering the map. **Vis bilder** changes that visit's choice. A Validator survey layer switch keeps it. A Rettinger layer switch keeps its existing reset behavior. Exit restores the map from the user's FOTO layer preferences.

The shared map toolbar control, marker filtering and legend use the effective visibility. The control is offered when a user-visible FOTO layer has placed photos. FOTO preferences, session records and delivery choices stay under their existing owners.

Application files — `src/app/page.js` and `src/lib/workspace/rettingerPhotoVisibility.mjs`. Kept the existing toolbar markup and selector.

Regression files — `tests/rettingerPhotoVisibility.test.mjs` and `tests/rettingerPhotoVisibilityUi.test.mjs`. Chrome exercised entry, exit, reveal, hide, hidden layer settings, Validator layer switching, both direct transitions, Rettinger keyboard behavior, map and legend visibility, and toolbar fit at both laptop sizes.

## Verification

| Gate | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Clean HEAD combined Node baseline | 301 | 0 | 0 |
| Clean HEAD production browser suites | 79 | 0 | 1 |
| Clean HEAD standalone rule-card browser | 1 | 0 | 0 |
| S6 focused Node | 49 | 0 | 0 |
| S7 focused Node and inspector contract | 34 | 0 | 0 |
| Final combined Node | 304 | 0 | 0 |
| Final combined browser, including standalone rule-card suite | 82 | 0 | 1 |
| Separate A7 close-label suite, clean HEAD | 9 | 1 | 0 |
| Separate A7 close-label suite, final | 9 | 1 | 0 |

- Combined Node ran `node --test --test-concurrency=1` over `validationV2*.test.mjs`, `validatorDataTableSlice3.test.mjs` and `rettingerPhotoVisibility.test.mjs`. The A7 and standalone browser files ran separately from that count. S6 focused on A81, A6, workspace inspector, rule presentation and Data Table. S7 focused on FOTO visibility, map features, map pane presentation, Validator editing and handoff, and the inspector contract.
- Fresh `npm.cmd run build` passed at baseline and on the completed application. The production browser suites ran serially with `PHOTO_UI_URL` pointed at `next start` on free local ports. The baseline used 56429 and 52192, and the final run used 62499. The test runner stopped its servers. The standalone rule-card suite used its own local server.
- Production browser suites covered `validatorDataTableSlice3Ui`, `rettingerPhotoVisibilityUi`, `gmiEditValidationUi`, `gmiValidatorEditingUi`, `gmiValidatorSelectionUi`, `gmiValidatorSelectionHandoffUi`, `gmiEditDraftGuardUi`, `photoImportWizardUi`, `photoPositioningUi`, `photoMapFitUi` and `deliveryWizardUi`. These also exercised previously accepted import, source rebinding, positioning, map fit, shared sidebar and GMI/GML delivery behavior.
- Affected-file `npx.cmd --no-install eslint` and `git diff --check` passed. The opt-in real 148-photo case was skipped in both production runs.

### Separate baseline failure, deviations and limits

- `tests/validationV2GmiA7.test.mjs:421` still fails its source match for literal `aria-label="Lukk Validator"`, with the same assertion at clean `45c0eb2` and on the final checkout. The workspace supplies the name through `PhotoIconButton`, and Chrome exercised closing Validator by that accessible name. The source assertion was left as found.
- The initial combined Node command picked up the standalone rule-card browser test. Chrome timed out initializing its debugging connection under the restricted runner. The standalone clean baseline passed when rerun with local Chrome debugging access and also passed in the final serial browser gate.
- A first S6 test stub lacked the geometry summary required by the controller. The focused run passed after adding that fixture data. The first combined Node run also caught a changed source assertion around the sidebar branch. Restoring the existing branch kept the S7 change in the visibility path and the follow-up gate passed.
- Browser verification used synthetic survey and photo fixtures in local Chrome. The existing modal and docked inspector layouts were exercised at 1280×720 and 1366×768 respectively.

### Screenshot evidence

| State | 1280×720 | 1366×768 |
| --- | --- | --- |
| Foreslått after rev switch with Ledninger, search, status and expanded Dimensjon | [Screenshot](assets/20261118-123721-acceptance-batch-c/batch-c-dataset-1280x720.png) | [Screenshot with docked rule inspector](assets/20261118-123721-acceptance-batch-c/batch-c-dataset-1366x768.png) |
| Validator after switching survey layers with the FOTO reveal active | [Screenshot](assets/20261118-123721-acceptance-batch-c/batch-c-validator-photos-1280x720.png) | [Screenshot](assets/20261118-123721-acceptance-batch-c/batch-c-validator-photos-1366x768.png) |

### Remaining manual acceptance

Manual real-data acceptance is deferred. With a real corrected survey layer, repeat Original/Foreslått in both directions with a line rule, filters and a diagnostic table. Check that any table reopened after switching only uses objects from the current revision. Repeat Validator and Rettinger visits with both visible and user-hidden FOTO layers, including direct transitions and a Validator layer switch, then compare the Layer Manager visibility settings on exit.

## Git

HEAD remains `45c0eb2`. `git status -sb` reports `feature/photo-workspace` four commits ahead of `origin/feature/photo-workspace`. The ten application and test files listed above are unstaged. This report and four screenshots are untracked. No staging, commits, pushes, deployments or subagent work took place.
