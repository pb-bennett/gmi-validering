# FOTO connection-only completion and positioning wording (S3)

18 November 2026, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `4e9e20a`. The worktree was clean at the start.

## Outcome

- `src/components/photos/PhotoPositioningWizard.js` shows primary **Fullfør** with the Phosphor Regular check icon in Plassering after a source save with zero selected changes. The footer keeps **Tilbake** and hides its separate **Lukk** button. **Fullfør** uses the existing close callback directly, preserving the saved checkpoint without applying a position batch. Selecting a change restores **Neste** and the existing confirmation workflow. The header close and Escape retain their existing behavior.
- Plassering uses «Entydige posisjoner er forhåndsvalgt. Manuelle posisjoner beholdes.» for GMI, GML and EXIF. The application change is limited to the positioning wizard presentation and completion action.
- `tests/photoSourceWorkflow.test.mjs` checks the action wiring. Its existing loaded-GMI fixture now includes the dataset revision S2 requires and expects a ready recheck of the identical source. The original liveness and stale-read assertions still run.
- `tests/photoPositioningUi.test.mjs` covers GMI recheck, zero selections, restoring **Neste** when a change is selected, and closing with **Fullfør** after clearing the selection. It compares the photo rows, inspector details and marker count before and after completion, and checks the existing disabled **Neste** state when no source was saved in the current wizard.
- `tests/deliveryWizardUi.test.mjs` now completes the S2 manual verified rebinding case using **Fullfør**, compares photo rows and markers across the save and close, and verifies that the retained binding still works in combined export.

## Verification

- **Baseline.** The four focused Node suites had 89 passes and one failure at clean HEAD. The failing loaded-GMI test used a fixture without `datasetRevision`, which S2 requires before review. Its duplicate-source expectation also predated S2. The fixture and asserts were updated to match the current binding contract. A fresh baseline production build passed, and the existing synthetic positioning browser case passed.
- **Passed.** `node --test tests/photoPositioning.test.mjs tests/photoSourceWorkflow.test.mjs tests/photoGmiSourceRebinding.test.mjs tests/gmiPhotoPlacements.test.mjs` passed 90/90. Affected-file `npx.cmd --no-install eslint`, the final `npm.cmd run build`, and `git diff --check` passed.
- **Browser.** `node --test --test-concurrency=1 tests/photoPositioningUi.test.mjs tests/deliveryWizardUi.test.mjs` passed 18 cases and subtests against a fresh production build on port `51725`. At 1280×720 and 1366×768 the connection-only footer had one primary, the check icon, and two 40 px buttons within the viewport. Screenshots at both sizes were inspected. The baseline and final test servers were stopped.
- **Skipped.** The existing 148-photo case was skipped in both browser runs because `PHOTO_GML_FIXTURE` was unset. Real-data and manual browser acceptance remain deferred to the consolidated session.

## Remaining acceptance and Git

During the consolidated session, verify the zero-selection completion and the return to **Neste** with a selected change at both laptop sizes. Confirm the retained links, accepted position, direction, metadata and delivery choice after completing an S2 binding with a real dataset.

HEAD remains `4e9e20a`, one commit ahead of `origin/feature/photo-workspace`. The worktree has four modified files listed above and this untracked report. No staging, commit, push or deployment took place.
