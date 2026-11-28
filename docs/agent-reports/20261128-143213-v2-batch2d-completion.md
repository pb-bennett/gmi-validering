# GMI Validator 2.0 — Batch 2D completion

28 November 2026 · `feature/photo-workspace` · HEAD `5ebee27`

Batch 2D closes the four findings in the [Batch 2C report](20261127-091953-v2-batch2c-completion.md). The accepted [bulk-direction behavior](20261127-101151-v2-batch2c-bulk-direction-completion.md) and the [release-planning scope](20261120-154700-final-functional-reconciliation-release-planning.md#narrow-accepted-follow-ups) form the baseline.

## Findings and resolutions

| Finding | Before | After |
| --- | --- | --- |
| Automatic delivery effects missing from the FOTO import receipt | The receipt counted images and positioned images. The result from the shared positioning core already contained the delivery effects. | Kontroll previews delivery effects from the shared planner. On create or append, the receipt uses the effects returned by the successful atomic commit. It counts placements and omits zero-value lines. One original with two transferred placements counts as two. Cancel, stale review and rollback return no successful receipt. |
| Direction reference counted as a warning | The geographic-north convention appeared in «Bør kontrolleres», contributed a package note, and appeared under «Advarsler» in the TXT report. | The same text appears under expandable «Informasjon» in Kontroll and under «Informasjon» in TXT. It contributes zero warning notes. Direction recommendations and validation blockers retain their existing classification and handling. |
| Incomplete capture time described like a missing time | The advance model used «Fortsett uten opptakstid» for both cases. The live shared wizard used «Kontroller leveransen» with a generic readiness warning. | Innhold and Kontroll distinguish images with missing capture time from images with a valid capture date and an incomplete clock time. The advance model has a separate label for partial time. The live wizard keeps «Kontroller leveransen». The Gemini-compatible profile still omits incomplete timestamps and explains the schema gap. Skråfoto 2019 (standard) still blocks. |
| Export messages used developer vocabulary | Messages referred to «forekomst-features», «hashes», and time-zone suffixes. | Messages distinguish original images, accepted placements, image-to-GMI-object links, and GML records. The unreadable-original message tells the user how to act. Expandable information keeps the GML mapping, Gemini VA import instructions, direction codes, CRS and Z placeholder available. |

The receipt shares the existing positioning delivery formatter. FOTO positioning, delivery choices, and the export package continue to use their existing planners and writers. Synthetic regression tests cover the accepted rotation and bulk-fill rules, GMI link removal and retention, original image bytes, Gemini IDs and GML output. The reported 76 images, 77 placements, 74 GMI links and 3 GML records describe the earlier acceptance dataset.

## Verification

Level **Expanded**. Node ran in the working tree. The production build and Chrome harness ran from an isolated archive of `5ebee27` with the same task sources, using a dedicated server at `127.0.0.1:3227`.

| Check | Result |
| --- | --- |
| `node --test --test-reporter=tap` over 79 non-browser `photo*`, `delivery*`, `exportName*`, `gmiPhoto*` and `wizardTransaction*` files | 1,098 passed, 0 failed, 9 skipped |
| `npx --no-install eslint` over the 25 JS/MJS files listed below | Passed |
| `npm run build -- --webpack` | Passed. Browserslist reported its local data age. |
| `node --test --test-concurrency=1 --test-reporter=tap` over `deliveryWizardUi`, `photoAcceptanceRenderingUi`, `photoCompletionUi`, `photoDeliveryDefaultsUi`, `photoExportFlowUi`, `photoExportWizardUi`, `photoGmlCaptureApprovalUi`, `photoImportWizardUi`, `photoLoadedGmiUi` and `photoPositioningUi` | 70 passed, 0 failed, 3 skipped |
| `git diff --check` | Passed |

**Earlier failed checks.** The first Node run after editing copy found a stale import-guidance text assertion. The first Chrome run found a stale technical-details text assertion and a new check that tried to serialize a DOM element through the harness. The final assertions verify the new wording and return a boolean where needed. The export fixtures and safety assertions were preserved.

**Skipped and omitted.** Nine Node cases and three browser cases require absent private fixtures or the optional read-only reference corpus. The full repository Node and browser suites, optional development-only workflows, hosted checks and screen-reader testing were outside the selected expanded run.

## Browser evidence

| Behavior | 1280×720 | 1366×768 |
| --- | --- | --- |
| Import Kontroll with two proposed GML placements | [Preview](20261128-143213-v2-batch2d/final-review-footer-1280x720.png) | [Preview](20261128-143213-v2-batch2d/final-review-footer-1366x768.png) |
| Committed receipt with two GML placements | [Receipt](20261128-143213-v2-batch2d/committed-delivery-receipt-1280x720.png) | [Receipt](20261128-143213-v2-batch2d/committed-delivery-receipt-1366x768.png) |
| Export Kontroll with missing time and a date-only image | [Capture-time wording](20261128-143213-v2-batch2d/export-capture-gap-1280x720.png) | [Capture-time wording](20261128-143213-v2-batch2d/export-capture-gap-1366x768.png) |

## Manual acceptance still open

1. With approved real files, review a new import and an append with automatic GML delivery. Cancel one draft and confirm another. Compare the placement count in Kontroll, the saved receipt and the delivery states in FOTO.
2. Review a combined delivery in the wizard and the downloaded TXT. Check that the direction convention is under «Informasjon» and genuine findings remain visible in their respective categories.
3. Review a missing date and an accepted date-only photo in both Gemini-compatible and standard Skråfoto 2019. Import the Gemini-compatible package into Gemini VA and check the GMI hyperlinks, GML records and omission of the incomplete capture timestamp. No contractor files or live Gemini VA application were used in this batch.

## Changed files

### Application

- `src/app/page.js`
- `src/components/delivery/DeliveryWizard.js`
- `src/components/photos/PhotoImportReviewStep.js`
- `src/components/photos/PhotoPositioningWizard.js`
- `src/lib/delivery/deliveryWizard.mjs`
- `src/lib/photos/photoCompletion.mjs`
- `src/lib/photos/photoExportWizard.mjs`
- `src/lib/photos/photoPositionDeliveryPresentation.mjs`
- `src/lib/photos/photoSession.mjs`
- `src/lib/photos/export/photoExportDiagnostics.mjs`
- `src/lib/photos/export/photoExportPlan.mjs`

### Tests

- `tests/deliveryWizard.test.mjs`
- `tests/deliveryWizardUi.test.mjs`
- `tests/photoAcceptanceRenderingUi.test.mjs`
- `tests/photoCompletion.test.mjs`
- `tests/photoCompletionUi.test.mjs`
- `tests/photoExportFlowUi.test.mjs`
- `tests/photoExportNaming.test.mjs`
- `tests/photoExportRules.test.mjs`
- `tests/photoExportWizard.test.mjs`
- `tests/photoExportWizardUi.test.mjs`
- `tests/photoGmlCaptureApprovalUi.test.mjs`
- `tests/photoImportComplete.test.mjs`
- `tests/photoImportWizardUi.test.mjs`
- `tests/photoLoadedGmiUi.test.mjs`

The report and its six linked PNGs are the Batch 2D documentation artifacts.

## Git inventory

The local branch started at `b2b1b09`, one commit behind the requested baseline. The user authorized a fast-forward to `5ebee27`. Git advanced to the existing commit and the Batch 2D edits were applied to the working tree. The index is clean. No Batch 2D files were staged or committed. No push or deployment occurred.

The five pre-existing modified files (`tests/gmiBatchInspectorUi.test.mjs`, `tests/gmiCheckboxSoftFocusUi.test.mjs`, `tests/gmiFieldValueInputUi.test.mjs`, `tests/gmiFieldValueSearchUi.test.mjs`, `tests/gmiTableReviewUi.test.mjs`) and two pre-existing untracked reports (`20261125-081855-v2-prerelease-functionality-legacy-audit.md`, `20261125-122023-gemini-wfs-filtering-investigation.md`) were each verified by SHA-256 before and after the branch update and patch application.

## ChatGPT review summary

Batch 2D reports committed automatic delivery effects, moves the direction-reference note to information, distinguishes incomplete time from missing time, and uses Norwegian delivery terminology. The confirmation boundary and export contracts remain covered by synthetic regression tests. Real-file and Gemini VA acceptance remain open.
