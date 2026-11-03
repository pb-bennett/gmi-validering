# Photo import wizard acceptance fixes

Date: 2026-11-03, Europe/Oslo.

## Starting state and scope

Repository: `C:/GitHub/gmi-validering-test`. Preflight `git status -sb` showed a clean `feature/photo-workspace`, ahead of origin by one commit. `git log -1 --oneline` returned `d59b636 Overhaul photo import wizard`. Continued from that accepted implementation without resetting, reverting or redesigning it. No sub-agents, commits or pushes were used.

This pass addresses native picker dismissal, recoverable source choices, source/footer button appearance, EXIF terminology and backward stage navigation. The existing wizard architecture and import/domain commits remain intact.

## Picker cancellation root cause and correction

The wizard dialog's React `onCancel` handler previously called `onClose` for every cancel event it received. File inputs emit a bubbling `cancel` event when their native picker is dismissed. Those events reached the dialog handler, which treated them as cancellation of the entire import. `page.js` then followed its normal wizard-close path and cancelled the draft.

The handler now closes the wizard only when `event.target === event.currentTarget`: a cancel directed at the dialog itself, such as Escape. Cancels originating from nested photo, folder, GMI or GML inputs leave the wizard alone. Dialog Escape and the explicit close/cancel controls retain their previous behavior.

Empty photo/folder selections return before calling `importFiles` or changing the wizard error state. Source handlers already changed session state only when a file was present; their FileList reads are now optional-safe as well. Dismissing a picker does not navigate, create a layer, replace a source or release photos.

## Source switching

Retained the existing source-switch handler and session APIs. Changing source type clears draft GMI and GML state without clearing photos. GMI attachment uses operation identity to reject superseded reads; GML attachment uses its existing request number and draft token. Selecting another file replaces the source through those same guarded methods. Clearing each source invalidates pending reads. Input values are reset after selection, so a file can also be selected again.

No production session/domain changes or guard relaxations were needed. Added tests verify GMI to GML, GML to EXIF, and replacement GMI/GML sources, including older reads completing after their replacements. The browser test verifies that returning to Bilder and Plassering retains photo IDs, selected source type and valid source evidence. New selection/review state continues to use the existing session snapshot and review invalidation rules.

## Navigation, copy and controls

- Added pure `canNavigateBack` and a guarded `back` reducer action. Only an earlier step in the actual context's derived step list is accepted. Backward navigation changes the step, preserving source choices and include/fallback settings.
- Earlier stage labels render as keyboard-accessible buttons with Norwegian accessible names. Current/future stages remain text; the current stage retains `aria-current="step"` and its distinct visual styling. Stage controls cannot skip forward validation. The footer Tilbake control uses the same backward action. Initiating GMI still has no Plassering stage.
- GMI/GML source actions, including available loaded GMI choices, now use the existing compact-button/focus recipes plus a visible border, surface background and padding below the card heading. The selected source card remains highlighted.
- Tilbake has a secondary border and surface; Avbryt has a quieter border/text treatment. Both have visible button bounds and retain focus rings. The filled primary completion/progression action remains dominant.
- EXIF source label: **Fra EXIF-data i bildene**. Supporting copy uses **{n} av {N} bilder har GPS-posisjon**, with concise pending/unavailable variants. Kontroll now says **posisjon fra EXIF-data**. The underlying source kind is still `exif`.

## Files changed

Production:

- `src/components/photos/PhotoImportWizard.js`: distinguish picker/dialog cancel, ignore empty acquisition, add backward stage controls and footer styling.
- `src/components/photos/PhotoImportPlacementStep.js`: source button styling, EXIF wording and optional-safe empty source selection.
- `src/components/photos/PhotoImportReviewStep.js`: EXIF outcome wording.
- `src/components/photos/photoCollectionPanel.css`: align stage controls and space source actions below headings.
- `src/lib/photos/photoImportWizardState.mjs`: pure backward-navigation policy and reducer action.

Tests/report:

- `tests/photoImportComplete.test.mjs`: source switching and out-of-order replacement-read tests.
- `tests/photoImportWizardState.test.mjs`: backward-only navigation, preserved state and initiating-GMI step restrictions.
- `tests/photoImportAcceptanceFixesUi.test.mjs` (added): focused cancellation, source recovery, copy, button semantics/style, keyboard navigation and screenshot coverage, using existing browser/wizard helpers.
- This report (added).

## Validation

All browser runs used the production build served at `http://127.0.0.1:3022`, with synthetic image/GMI/GML fixtures. Chrome commands ran outside the sandbox, matching the established working DevTools setup from the overhaul.

| Command/selection | Result |
|---|---|
| `node --test tests/photoImportComplete.test.mjs tests/photoImportOutcome.test.mjs tests/photoImportWizardState.test.mjs` | 28 passed, 0 failed, 0 skipped |
| `node --test tests/photoImportWizardState.test.mjs tests/photoImportOutcome.test.mjs tests/photoImportComplete.test.mjs tests/photoLoadedGmi.test.mjs tests/photoAppendDuplicates.test.mjs tests/photoSourceWorkflow.test.mjs` | 80 passed, 0 failed, 0 skipped |
| `PHOTO_UI_URL=... node --test tests/photoImportAcceptanceFixesUi.test.mjs` | 1 passed, 0 failed, 0 skipped |
| Existing browser selection with `--test-concurrency=1`: photoImportWizardUi, photoLoadedGmiUi, photoDialogLayout, photoPositioningUi, gmiPhotoAssociationsUi, gmiPhotoPlacementsUi | 17 tests: 15 passed, 0 failed, 2 optional private-fixture skips |
| `npm.cmd run build` | Passed: optimized compilation, TypeScript, static page generation and route output |
| `npx.cmd eslint` on all four changed source JS/MJS files | Passed: 0 findings |
| `git diff --check` | Passed |

The focused browser test dispatches a bubbling, non-cancelable native-shaped input `cancel` event followed by an empty `change`, exercising the actual React handlers. It covers all four inputs, checks that the wizard and photos remain, verifies that no layer is created, and confirms that cancelling replacement selection retains the previously chosen GMI/GML source. It also checks replacement review counts, source-type changes, backward stage navigation by click/keyboard, absence of forward navigation buttons, the EXIF label/GPS copy and visible bordered button semantics/focus classes. The existing wizard browser regression confirms actual dialog Escape still cancels and initiating GMI still skips source selection.

The build emitted the existing Browserslist database freshness warning; Node tests emitted the existing module-type warning. No regressions or baseline failures were encountered in this pass's selected checks. The two browser skips require private GMI/photo fixtures; those unrelated private suites were not configured or broadened. Previously documented toolbar/statistics baseline findings are outside these changed files and were not rerun or altered.

## Rendered acceptance

Temporary screenshots are outside the repository at `C:/Users/Gemini-Backup/AppData/Local/Temp/photo-import-acceptance-fixes` and are not commit artifacts.

Visually inspected:

| Viewport | State | Result |
|---|---|---|
| 1920x1080 | Plassering, Fra GMI selected | Pass: white bordered source action below heading, active card clear |
| 1920x1080 | Plassering, Fra GML-fil selected | Pass: source action visibly interactive and subordinate to the footer |
| 1920x1080 | Plassering, EXIF selected | Pass: new label/GPS availability clear; primary action dominant |
| 1920x1080 | Kontroll with stage controls and footer | Pass: earlier steps read as links/buttons, current step distinct, footer hierarchy clear |
| 1280x720 | Plassering, GML selected | Pass: no horizontal overflow or problematic action wrapping; footer remains visible |
| 1280x720 | Kontroll with stage controls and footer | Pass: outcome and all footer actions remain accessible without scrolling |

The browser check also asserts dialog overflow/bounds and button bounds for the screenshot states. Technical details remain collapsed, import metadata remains read-only, and no old import or automatic positioning flow was reintroduced.

## Remaining concerns and manual follow-up

No known implementation blockers remain. Headless Chrome cannot operate the Windows OS picker itself in this harness; the cancellation regression reproduces its DOM event path instead. A short manual check using the actual Windows file/folder dialogs is still recommended to confirm dismissal behavior in the deployment browser, especially cancelling a replacement after a valid source is selected. All four inputs should leave the wizard open and retain its draft.

FOTO workspace, inspector, map editing, export/readiness, WFS, 3D, persistence and statistics remain outside this correction pass.
