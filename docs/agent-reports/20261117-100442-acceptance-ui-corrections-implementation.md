# Acceptance UI corrections — implementation

- Completed: 2026-11-17, Europe/Oslo.
- Repository: `C:/GitHub/gmi-validering-test`; branch `feature/photo-workspace`; HEAD `a50c7b089ea2a1d1521ebc2d7f742828cb2213e4`.
- Implemented the [approved plan](20261117-091526-acceptance-ui-corrections-planning.md) with the user's D1–D4 decisions. No subagents, staging, commits, pushes, branch changes or deployment.
- Initial working tree: only the untracked planning report. That report is preserved unchanged.

## Outcome

1. Removed the conditional collection delivery-summary line, its helper and CSS. Counts and the live announcement remain. Browser checks measure an unchanged list top through GMI → GML → Ikke → GMI at both laptop sizes.
2. Dependency diagnostics use the existing warning panel, accent and `Sjekk · N objekt(er)` pattern. Existing text and exact-object navigation remain. Computed background, border and accent match an ordinary Material CHECK diagnostic.
3. Rettinger inherits the shared sidebar width without a new minimum. Layer Manager, Validator and Rettinger have matching sidebar widths and map left edges at 1280×720 and 1366×768; the tested default is 380 px. The Rettinger table bar fits.
4. Empty-map clicks dismiss only the persistent FOTO preview. The handler preserves survey/measure flags and keeps Leaflet `closeOnClick={false}`. Tests cover marker switching, delivery-pill clicks, zoom controls, actual map drags, empty clicks, double-click zoom and survey-popup coexistence.
5. Both Markører and Miniatyrer use the existing delayed hover preview. The reusable, non-interactive pane is above popups and is created with `getPane || createPane`. Native marker titles are removed while accessible names remain. The open photograph is suppressed by occurrence and asset identity, including another placement of that image. Other photographs retain hover previews. Edit-mode and main-map viewer suppression remain.
6. The persistent preview has a Phosphor Regular placement button beside X, using `PhotoIconButton` and `runWorkspaceTool('edit')`. Repeated occurrences and a cycled non-top stack member target the exact active photo. Browser checks cover native keyboard activation, tooltip, command-bar focus, all three delivery destinations and unchanged delivery/position on entry and clean exit.

Added only the approved redundant-UI-text bullet to root `AGENTS.md`. No filename-editor, timestamp-import, LOK/TOP transfer, legend-redesign, dependency or validation-policy changes were made.

## Changed files

| File | Change |
|---|---|
| `AGENTS.md` | Approved redundant-text rule only |
| `src/app/page.js` | Shared Rettinger width; existing edit-tool callback |
| `src/components/photos/PhotoWorkspaceCollection.js` | Remove redundant summary |
| `src/components/photos/photoWorkspace.css` | Remove summary rule; hover-pane suppression; shared overlay-button recipe |
| `src/components/validation-v2/ValidationV2FieldDetailContent.js` | Established SJEKK presentation |
| `src/components/photos/PhotoMarkersLayer.js` | Hover modes/suppression/pane; guarded dismissal; survey-popup coexistence; edit callback |
| `src/lib/photos/photoMapPanes.mjs` | Hover pane name and z-index |
| `src/components/photos/PhotoWorkspaceMapPreview.js` | Placement button |
| `src/components/photos/PhotoEditCommandBar.js` | Accessible focus destination on ordinary edit entry |
| `tests/photoDeliveryDefaultsUi.test.mjs` | Summary absence and destination counts |
| `tests/photoDeliveryIntentUi.test.mjs` | Summary absence and destination counts |
| `tests/photoMapInteractionSlice2.test.mjs` | Updated preview, dismissal, hover and edit contracts |
| `tests/photoMapInteractionSlice2Ui.test.mjs` | Both hover modes; duplicate suppression; gestures/survey popup; keyboard edit; laptop list stability |
| `tests/photoWorkspaceStacksUi.test.mjs` | Exact cycled stack-member edit target |
| `tests/validationV2WorkspaceInspector.test.mjs` | Shared-width contract |
| `tests/validatorDataTableSlice3Ui.test.mjs` | Computed SJEKK parity; sidebar/map-edge equality; laptop table bar |
| This report | Completion evidence and remaining acceptance |

## Necessary implementation adjustments

- The plan assumed the ordinary edit command bar already focused itself. Inspection showed that only its export-handoff row did. The existing command-bar root now receives focus with an accessible name and shared focus recipe; the handoff row retains its own focus behavior.
- Ignoring survey clicks in the map handler alone does not preserve the preview: Leaflet also automatically closes the previous popup when a survey popup opens. `autoClose={false}` on the FOTO preview allows that coexistence. WFS/empty-map dismissal still uses the guarded map-click handler.
- Duplicate-hover suppression also checks asset identity so another placement cannot repeat the photograph already displayed.
- The existing overlay colours were expressed with tokens/color-mix when sharing the recipe with the new button; established white control text and positioning were preserved.

## Verification

### Passed

- `node --test tests/photoMapInteractionSlice2.test.mjs tests/validationV2WorkspaceInspector.test.mjs tests/validatorDataTableSlice3.test.mjs tests/photoDeliveryPlanning.test.mjs`: **34 passed**, no failures/skips.
- Affected-file `npx.cmd --no-install eslint ...`: **0 errors**; one confirmed baseline hook-dependency warning described below.
- `npm.cmd run build`: **passed** on the final application source. The restricted first attempt could not fetch Roboto; the network-enabled retry succeeded. No build configuration or font changes were made in the repository.
- `git diff --check`: passed.
- All eleven requested production browser files were run with `--test-concurrency=1` against a fresh build on task-owned port 3147. Final outcomes:

| Browser file | Final result |
|---|---|
| `photoMapInteractionSlice2Ui` | Passed; final focused rerun |
| `photoDeliveryDefaultsUi` | Passed |
| `photoDeliveryIntentUi` | Passed |
| `photoWorkspacePass1dUi` | Passed, with private EXIF subtest skipped |
| `photoWorkspaceStacksUi` | New exact-stack-target check and other behavior passed; existing counts assertion failed |
| `photoWorkspaceEditUi` | Passed |
| `photoDirectionLayerUi` | Passed |
| `validatorDataTableSlice3Ui` | Passed; final focused rerun |
| `gmiR4UxPolishUi` | Passed |
| `gmiValidatorEditingUi` | Passed on final combined run |
| `deliveryWizardUi` | Passed |

The final rerun of the two expanded acceptance files reports **5 passed, 0 failed, 0 skipped**, including their nested tests. Earlier acceptance-test failures from fixture positioning, missing map-mount waits, popup fades and native Enter dispatch were corrected. These were not classified as baseline failures. An initial Validator handoff timeout passed on subsequent diagnostic and original-suite reruns; unchanged HEAD also passed that suite. No unrelated application change was made for that intermittent result.

Inspected screenshots at **1280×720 and 1366×768** for the preview controls, Rettinger layout and dependency panel, plus both hover modes. The preview controls remain inside the map; the list top remains stable. Screenshots and logs are outside the repository under `%TEMP%/gmi-acceptance-shots` and `%TEMP%/gmi-acceptance-*.log`.

### Confirmed baseline failures/warning

- Full serial `node --test --test-concurrency=1 "tests/*.test.mjs"`: **2,293 tests; 2,151 passed, 1 failed, 141 skipped**. The failure is `validationV2GmiA7` → “Validator exposes only the automatic V2 workflow”, expecting a literal `aria-label="Lukk Validator"`. Reproduced by running that test against an isolated archive of unchanged HEAD `a50c7b0`.
- `photoWorkspaceStacksUi` → counts expects exactly `7 bilder · 8 plasseringer`; actual text also contains the existing `GMI 8` and `GML 0` counts. Reproduced against an unchanged-HEAD production build. This unrelated assertion was preserved.
- ESLint's unnecessary `fieldDataRetry` dependency warning in `ValidationV2FieldDetailContent.js` was reproduced against unchanged HEAD (baseline line 464; current line 467).

Baseline artifacts were isolated in `%TEMP%/gmi-acceptance-baseline-a50c7b0`, with a shared dependency junction. Only that temporary build received a Turbopack filesystem-root setting to resolve the junction. No repository configuration or Git refs changed.

### Skipped and remaining manual acceptance

- The full-run skips include environment-gated browser/private checks. The requested browser suites were separately enabled with `PHOTO_UI_URL`; the private EXIF orientation browser subtest remained skipped. Synthetic automation is not real-file/manual acceptance.
- No live Gemini WFS account/session was used. Its unflagged click path is handled by the same dismissal guard; direct live-reference interaction remains a manual check.
- Before publication, repeat with representative real files: shared sidebar transitions, yellow VertikalDimensjon note, both hover modes with a neighbouring large preview, WFS dismissal, stacked/repeated placement editing in each destination, and delivery cycling without list movement.
- The counts-row wrapping risk noted in the plan did not occur in the tested laptop cycle. Other category combinations remain outside that measurement; no counts restyling was introduced.

## Git and publication

No files were staged, committed, pushed or deployed. Branch and HEAD remain unchanged. The task changed 16 tracked files and added this report; the original untracked planning report is retained. Task-owned production servers were stopped after verification. Temporary logs, screenshots and the baseline archive remain available for review outside the repository.
