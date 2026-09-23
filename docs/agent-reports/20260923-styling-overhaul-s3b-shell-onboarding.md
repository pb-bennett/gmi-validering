# S3B shell and onboarding appearance

Date: 2026-09-23. Starting SHA: `03ae23709ed4f653f12ef02ecd779fb0ffee19ea` on `feature/styling-overhaul-integrated`, tracking `origin/feature/styling-overhaul-integrated`. The repository root matched `C:/GitHub/gmi-validering-test` and the starting working tree was clean.

## Surfaces and files

- `src/app/page.js`: initial page surface and upload card, error panel framing, initial Om/Kontakt controls, and the add-file dialog frame and close control.
- `src/components/FileUpload.js`: the shared initial/add-file upload target, drag state, text hierarchy, and file-selection label.
- `src/components/GlobalFileDrop.js`: the viewport drag overlay and drop target.
- `src/components/WorkspaceShell.js`: the working shell's soft background only.
- `src/components/TabSwitcher.js`: the shell-level Kartoversikt/3D-visning switch.
- `src/components/TestModeControl.js`: the Testmodus trigger capsule and its two compact actions, on both initial and working screens.
- `docs/agent-reports/20260923-styling-overhaul-s3b-shell-onboarding.md`: this record.

The S2 map toolbar buttons and overflow surface already use the shared semantic recipes, so their source required no S3B change. The add-file dialog reuses `FileUpload`; no separate uploader was introduced.

## Appearance

The page and working shell now use Soft surface. The upload and add-file cards use Surface, Border, restrained elevation, and 12px corners. The initial Om/Kontakt controls use the S2 compact neutral button and Interactive focus recipes while retaining their existing text, icons, dimensions, callbacks, and modal access. The upload target uses Strong border over Soft surface, a Navy heading, Subtle supporting text, an Interactive/Cyan-soft drag state, and the S2 Navy primary control for file selection. The global drop overlay uses Ink translucency and the same surface/drag vocabulary. Error copy and icon remain red; only the error panel's radius and elevation changed.

The map/3D switch uses Surface and Border with a restrained shadow, the S2 neutral selected-control recipe, Muted-to-Navy unselected text, and the Interactive focus recipe. The Testmodus capsule keeps its amber semantic state; its actions now use the S2 neutral compact button and focus recipes. No new canonical warning, error, GIS, chart, or data colours were assigned.

The initial screen retains its centered composition at ordinary sizes. Its existing container can scroll vertically at short heights; auto vertical margins keep the content centered when it fits. This is a presentation-only adjustment to avoid clipping the existing upload and error controls. No working-shell dimensions or map-pane layout rules were changed.

## Preserved contracts and deferred work

The accepted BrandWordmark, approved SVG, ProductHeader composition and 76px height are unchanged. WorkspaceShell still owns the same conditional feature slot; the 380px default sidebar, 200–800px normal resize bounds, normal-only resize handle, Validator remount/lifecycle, feature scrolling, footer access, table split, inspector sizing, portals, stacking, Stats predicate, and map toolbar 580/860px thresholds are unchanged. File input type/accept list, click and drag/drop handlers, parsing, retry/reset, Testmodus activation and telemetry suppression, and Om/Kontakt AppInfo ownership and focus path are unchanged.

The known Kartoversikt/3D-visning overlap with Leaflet zoom controls is pre-existing and deferred to S7. Its position and geometry were not edited here. LayerManager and legacy sidebar content (S4), Validator (S5), table (S6), map chrome and diagnostics panel (S7), analysis/profile (S8), 3D scene/chrome (S9), AppInfo/Contact (S10), and Stats (S11) remain deliberately unmigrated. S10 should place an existing canonical BrandWordmark variant in AppInfo's top-level modal identity/header; S3B does not implement that future requirement.

## Verification and browser review

- `git diff --check`: passed.
- `npm.cmd run build`: passed; Next.js production compile and page generation completed. Browserslist reported old local data; dependencies were not updated.
- `node --test tests/appInfoUiContract.test.mjs tests/mapPaneToolbar.test.mjs tests/statsUiContract.test.mjs tests/testMode.test.mjs tests/validationV2WorkspaceInspector.test.mjs`: 34/34 passed.
- `node --test tests/richerUsageTelemetryParserIntegration.test.mjs tests/richerUsageTelemetrySlice1.test.mjs`: 17/17 passed.
- No tests were added or weakened; the existing source/behavior contracts remain valid after appearance-only class changes.

Browser review is still required; source and build checks do not establish visual acceptance. Check the initial upload at ordinary desktop, narrow width, and short height; the upload target and viewport drag overlay; initial Om/Kontakt and Testmodus; upload parsing and error/retry; the add-file dialog; the loaded normal workspace; the map/3D switch at all existing toolbar modes; working Testmodus; normal/Validator switching; and that the pre-existing Leaflet overlap is no worse than baseline.

## Final status

No commit, push, deploy, branch switch, dependency change, or S4+ work was made. Final `git status --short`:

```text
 M src/app/page.js
 M src/components/FileUpload.js
 M src/components/GlobalFileDrop.js
 M src/components/TabSwitcher.js
 M src/components/TestModeControl.js
 M src/components/WorkspaceShell.js
?? docs/agent-reports/20260923-styling-overhaul-s3b-shell-onboarding.md
```
