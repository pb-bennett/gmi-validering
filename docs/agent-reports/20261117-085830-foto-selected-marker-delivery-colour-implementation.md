# FOTO selected marker delivery colour ? implementation

- Date: 2026-11-17.
- Repository: `C:/GitHub/gmi-validering-test`.
- Branch/HEAD verified at start: `feature/photo-workspace`, `6151d4013e41b5a0e57ef886c15fbf8badc66eb7`.
- Starting status: ahead of origin by 1; only the supplied diagnosis report was untracked. It was read and left untouched.
- Scope: implement the user-approved minimal presentation change from [the diagnosis](20261117-084313-foto-marker-colour-regression-diagnosis.md). No broad reinvestigation, legend changes, import/export implementation changes, new colours or unrelated refactoring.

## Result and changed files

- `src/lib/photos/photoMarkerPresentation.mjs`: added the pure `photoStackMarkerDelivery` decision helper. The aggregate stack state and selected occurrence fill are separate. `stackMixed` preserves the existing dashed camera outline/thumbnail border independently of fill, and participates in icon cache keys. Provenance mode ignores this delivery cue, as before.
- `src/components/photos/PhotoMarkersLayer.js`: selected stack tops use their own delivery status; unselected stack tops use the aggregate. Mixed accessible descriptions and stack counts remain. Stack membership, top selection, z-order and event handling are unchanged.
- `src/components/photos/PhotoEditLayer.js`: the selected edit target derives the same mixed flag from its existing stack IDs and current delivery entries. It keeps its own delivery fill and count, gains the matching dashed cue and mixed accessible description. Gesture freezing and positioning are unchanged.
- `tests/deliveryPolish.test.mjs`: focused pure regressions for selected/unselected stacks, the full delivery cycle, Browse/Edit rendering, marker/thumbnail cues and counts, uniform stacks in every destination, isolated occurrences, provenance invariance and cache-key distinction.
- `tests/deliveryWizardUi.test.mjs`: deliberately updated the selected-grey assertion to selected GML green plus the existing mixed cue/description. Added stacked preview cycling, sibling isolation, Browse/Edit parity at both laptop sizes, and explicit unselected-main-map neutral-grey coverage. Existing navigation/export checks still run.
- This report records implementation, verification and remaining hosted acceptance.

In delivery mode, a selected occurrence shows GMI `#60A5FA`, GML `#4ADE80` or Ikke `#CBD5E1`, even within a mixed stack. Mixed stacks retain the dashed outline, count badge and ?Ulike leveringsvalg p? samme sted? description. Unselected mixed stack tops retain `#64748b`. Uniform stacks and isolated photos keep their previous fills. No palette or legend changes were made.

## Verification ? passed

Commands ran from the repository root in PowerShell. No dependencies changed.

1. `node --test tests/deliveryPolish.test.mjs tests/photoMarkerPresentation.test.mjs tests/photoDeliveryPlanning.test.mjs` ? **31 passed, 0 failed, 0 skipped**, including the final uniform-stack additions.
2. `node --test --test-concurrency=1 tests/photoMapInteractionSlice2.test.mjs tests/photoWorkspace.test.mjs tests/photoEditSession.test.mjs tests/photoEditCommit.test.mjs tests/photoDeliveryIntent.test.mjs tests/photoDeliveryDefaults.test.mjs tests/photoDeliveryExclusion.test.mjs` ? **63 passed, 0 failed, 0 skipped**.
3. `npx.cmd --no-install eslint src/lib/photos/photoMarkerPresentation.mjs src/components/photos/PhotoMarkersLayer.js src/components/photos/PhotoEditLayer.js tests/deliveryPolish.test.mjs tests/deliveryWizardUi.test.mjs` ? **passed**, no diagnostics, after final edits.
4. `npm.cmd run build` ? **passed**; rerun successfully after the final source edit. Next.js compiled, checked TypeScript and generated all routes. Non-blocking Browserslist age and Node module-type warnings were observed; no dependency changes were made.
5. Browser environment: `PHOTO_UI_URL=http://127.0.0.1:3097`; `DELIVERY_SCREENSHOT_DIR` and `PHOTO_SCREENSHOT_DIR` set to `$env:TEMP/gmi-marker-fix-20261117`.
   `node --test --test-concurrency=1 tests/deliveryWizardUi.test.mjs tests/photoMapInteractionSlice2Ui.test.mjs` ? final unsandboxed run: **17 passed, 0 failed, 0 skipped**. Suites ran serially against the fresh production build. Existing keyboard navigation, delivery changes, positioning lifecycle and export byte checks also passed.
6. Inspected `selected-mixed-browse-1280x720.png`, `selected-mixed-edit-1280x720.png`, `selected-mixed-browse-1366x768.png` and `selected-mixed-edit-1366x768.png` in the temporary screenshot directory: selected GML green, count 2 and mixed outline remain visible in both modes; affected controls fit the laptop layouts.
7. `git diff --check` ? **passed**.

## Verification ? failed attempts and recovery

- Plain `npx` was blocked by PowerShell execution policy for `npx.ps1`; the equivalent installed `npx.cmd` command passed. No policy was changed.
- Initial sandboxed browser run: **3 failed**, all timing out at Chrome `Runtime.enable`, before app navigation. Running the unchanged harness outside the sandbox resolved startup.
- An intermediate diagnostic M10-only browser launch was interrupted before results; it provides no acceptance evidence.
- First unsandboxed run: **16 passed, 1 failed**. The filename test could not find the initial dialog because the local server was restarted too late for its first navigation. This was a verification setup error. After the server was ready, the complete serial rerun passed all 17 tests.

## Skipped/unperformed checks and uncertainties

- No tests were skipped in the final selected unit/browser runs. The full repository suite was not run; broader focused photo/edit/delivery regression coverage and the production build were used for this small presentation change.
- No private corpus was read; all automated fixtures are synthetic. No real-file, manual Vercel or Gemini acceptance was performed.
- Thumbnail mixed-state rendering is covered by pure presentation tests; the new stacked browser scenario uses camera markers. Real-data readability and hosted rendering still need manual acceptance.
- No known implementation failure remains in the exercised scope. Existing legend ambiguity is intentionally unchanged.

## Manual Vercel acceptance still required

1. On a deployment containing this change, load an authorized real dataset with multiple photo occurrences at identical coordinates. Confirm the stack badge and mixed description.
2. Select a stacked occurrence and use the preview pill through GMI ? GML ? Ikke ? GMI. Confirm blue ? green ? light grey ? blue, unchanged siblings, and dashed mixed indication whenever choices differ.
3. Enter and exit Edit mode while mixed. Confirm own fill, dashed cue and count remain consistent. Check marker selection, stack cycling, z-order, positioning, undo/cancel/save and delivery updates.
4. Select another location (leaving the mixed stack unselected), and inspect the main map too: the mixed stack must remain neutral grey. Check uniform stacks and isolated photos.
5. Check camera/thumbnail modes and Plasseringskilde mode at 1280?720 and 1366?768. Provenance colours and the legend should retain their established behaviour.

## Git and publication

No staging, commits, pushes, branch changes or deployments. Branch remains ahead of origin by the existing one commit. The task's local production server used free port 3097 and was stopped at completion; no other server was stopped. Screenshots remain outside the repository in the temporary directory.

Complete changed/untracked file list at completion:

```text
 M src/components/photos/PhotoEditLayer.js
 M src/components/photos/PhotoMarkersLayer.js
 M src/lib/photos/photoMarkerPresentation.mjs
 M tests/deliveryPolish.test.mjs
 M tests/deliveryWizardUi.test.mjs
?? docs/agent-reports/20261117-084313-foto-marker-colour-regression-diagnosis.md  (pre-existing, untouched)
?? docs/agent-reports/20261117-085830-foto-selected-marker-delivery-colour-implementation.md
```
