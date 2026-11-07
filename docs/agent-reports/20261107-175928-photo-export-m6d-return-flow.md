# FOTO export M6d — Wizard navigation and return flow

Date: 2026-11-07, Europe/Oslo. Branch `feature/photo-workspace`, starting commit `17cdfd2`. **Nothing was committed or pushed.** Implements §6 M6d, §2.5 and §4.4 of `20261107-162116-photo-export-m6-wizard-planning.md`.

Norwegian text in `«…»` is UI copy. "Hub" means `Fullfør opplysninger…`. "Journey" means a trip that started at the export wizard and has not yet returned to it.

---

## 1. Summary

**The round trip works.** `Export wizard → hub → map or positioning wizard → hub → export wizard` keeps format, CRS and label, always lands on `Leveranse`, and recalculates readiness. The M4 transaction model is unchanged: `photoExportFlow.mjs`, the command bar, the boundary dialog and the positioning wizard all have an empty diff.

| Gate | Result |
|---|---|
| All 22 browser suites, with the real 148-photo corpus | 129 tests: **128 pass, 0 fail, 1 skip** |
| New `photoExportReturnUi` suite (part of the above) | **18 of 18** |
| Export and completion domain, 17 files, including goldens and Gemini compatibility | 309: **308 pass, 0 fail, 1 skip** |
| Non-browser suite, 150 files | 1,704: 1,693 pass, **7 fail**, 4 skip. All seven also fail without this work (§6) |
| `next build`, direct ESLint, `git diff --check` | Clean |
| Mutation checks | 18 runs, see §4 |

**Four things to review:**

1. **The close guard fixes a real bug in `next dev`, not in production** (§3). Without it, both dialogs vanish by themselves in dev. In a production build React already drops the late event, so production tests cannot show the guard working.
2. **The clear points overlap** (§4). Removing any single one changes nothing a user can see, because opening the hub clears the state too. I had to remove them in combination to prove the tests can fail.
3. **The same dev bug probably exists in `PhotoCaptureMetadataDialog`** (§7, item 1). It has the same `onClose={onClose}`. I did not test or change it.
4. **Layer removal and reset cannot be reached by a person during a journey** (§5). Tests run the real click handlers, captured before entering the workspace.

---

## 2. Changed files

| File | Change |
|---|---|
| `src/app/page.js` | `photoExportReturn`, `photoExportResumed`, `openCompletionFromExport`, `openExportFromCompletion`, `endPhotoExportTrip`, and the clear points |
| `src/components/photos/PhotoCompletionDialog.js` | `fromExport` and `onOpenExport` props, footer buttons, close guard, heading focus on arrival from export |
| `src/components/photos/PhotoExportWizard.js` | `resumed` prop, return note, close guard |
| `tests/photoExportReturnUi.test.mjs` | **New.** 18 browser tests |
| `tests/helpers/photoExportWizard.mjs` | Adds `returnToExport`. Comment on `openCompletionFromExport` updated |
| `tests/photoExportWizardUi.test.mjs` | Two scenarios use the way back (§5) |
| `tests/photoLoadedGmiUi.test.mjs` | Two scenarios use the way back (§5) |

**Protected paths.** `git diff HEAD` is empty for all of `src/lib`, `tests/fixtures`, `PhotoEditCommandBar.js`, `PhotoEditBoundaryDialog.js` and `PhotoPositioningWizard.js`. That covers the serializers, plan, package, naming, metadata policy and `photoExportFlow.mjs`. `src/lib/photos/photoExportWizard.mjs` also has no diff.

---

## 3. Decisions

### State

`photoExportReturn: { layerId } | null` lives in `page.js`, separate from `photoExportFlow`, as planned. It is set only by `openCompletionFromExport`, and the hub treats it as live only for the matching layer.

| Trap in §4.4 | How it was handled |
|---|---|
| 1. `requestWorkspaceAction` also wraps hub → map | Clears only when `closePhotoExportFlow()` returns a live handoff, as the plan proposed |
| 2. Explicit clears at every other exit | `openCompletePhotoDetails`, `runWorkspaceTool('export')`, `enterPhotoLayer`, `exitPhotoWorkspace`, `handleReset`, both failed-commit paths, `onPhotoFlowInvalid`, and the session subscriber when the layer has gone |
| 3. Late native `close` | See below |

### Late `close` events

The plan expected React to drop the event after unmount, and listed that as unverified. **Now verified: it does, in a production build.** Dispatching `close` by hand to the old, unmounted element does nothing, even with the guard removed.

**But dev is different.** Strict mode runs each effect, its cleanup, then the effect again. The cleanup's `dialog.close()` queues a `close` event, which arrives at the same element after it has reopened, and `onClose` then closes it. Measured on `next dev`, with two scenarios from the new suite:

| Code | Result |
|---|---|
| With the guard | 2 of 2 pass |
| Guard removed from both dialogs | **0 of 2**, failing because the dialog is missing |

The failure mode is inferred from the code and the error, which was a `null` dialog. I did not trace the event itself. This was already the case in M6c's code, so `next dev` would have shown it. Nothing in the suites runs on dev, which is why it was not seen.

Both dialogs now use:

```js
onClose={(event) => { if (live.current && !event.currentTarget.open) onClose(); }}
```

- `!open` handles the dev case: the dialog is open again, so this was not a real close.
- `live` means the check does not rest on React's internal cleanup order. It is not needed today, and I kept it because the hub's `onClose` now opens another screen. A stray call on the way to the map would put the wizard over Edit mode. It is one ref, and removing it is defensible.

A close the browser makes by itself still counts. The suite closes both dialogs natively, and the hub goes to Leveranse while the wizard closes.

### Small decisions the plan left open

| Decision | Why |
|---|---|
| `Tilbake til eksport` and `Gå til eksport` share `openExportFromCompletion` | The same transition. They differ only in the note |
| A journey's hub shows only `Tilbake til eksport`, with no `Lukk` | §2.5 gives every exit the same result, so a second button would add nothing |
| The standalone hub shows `Gå til eksport` as secondary, `Lukk` as primary | Closing stays the default. Existing suites find `Lukk` as the primary button |
| ✕ keeps its name `Lukk Fullfør opplysninger` during a journey | The action is still closing the hub. Worth a look in M6e |
| Hub focuses its heading on arrival from export | **Not in the plan.** Otherwise a held Enter lands on the first control, the `Mål` select |
| `«Kontrollen er oppdatert.»` goes before the footer status | Wording from §3.5. It shows only after a return, not after `Gå til eksport` or a tool opening. It uses the footer, so layout is unchanged |
| Hub ✕, footer and Escape share `onClose` | Consistency by construction, with no per-exit logic |

---

## 4. Mutation checks

Each fault was applied alone, followed by a fresh production build and the new suite. Files were restored and confirmed by checksum, then rebuilt.

| Fault | Result |
|---|---|
| A. Clear on every workspace action (trap 1) | Caught by 6 tests |
| C. No double-click guard, wizard to hub | Caught |
| D. No double-click guard, hub to wizard | Caught |
| G. Hub does not take focus from export | Caught by 2 tests |
| H. Tool opening keeps the return note | Caught |
| E, F. Close guard removed, hub or wizard | **Not caught in production.** Caught on dev, §3 |
| B. No clear when a handoff ends | **Not caught alone** |
| I. No clear in the subscriber | **Not caught alone** |
| J. No clear in `enterPhotoLayer` | **Not caught alone** |
| K. No clear in `exitPhotoWorkspace` | **Not caught alone** |
| L. No clear in `handleReset` | **Not caught alone** |
| M. No clear in `openCompletePhotoDetails` | **Not caught alone** |
| N. I + J + layer check | **Not caught**, because M still clears |

**Why those were missed.** The stale state is only visible in the hub, and the only route to a hub with no journey is `openCompletePhotoDetails`, which clears it. So my `assertEnded` checks could not fail on their own. That is a limit of the tests, and it also shows real overlap. I kept each clear because §4.4 asks for them and stale state should not depend on one distant line.

**Proof with the masking clear removed too:**

| Fault | Result |
|---|---|
| O. M + B | Caught by the tools test |
| P. M + K + J | Caught by the leaving test |
| Q. M + J + I + layer check | Caught by the live removal test |
| R. M + J + I + L + layer check | Caught by 4 tests, including 3 live reset tests |

**Limit.** Each clear point is shown to matter only as part of a group, not alone.

---

## 5. Test changes and navigation cases

### Existing tests changed

No test was removed or skipped.

| Test | Before | After |
|---|---|---|
| `photoExportWizardUi`, swap and double-click | `Lukk` from the hub, focus on `Verktøy` | `Tilbake til eksport`, then close, focus on `Verktøy` |
| `photoExportWizardUi`, pending EXIF | Close hub, reopen export | `Tilbake til eksport`, and the read still holds |
| `photoLoadedGmiUi`, bulk readiness | Close hub, reopen export | `returnToExport` |
| `photoLoadedGmiUi`, AsBuilt | Close hub, reopen export | `returnToExport` |

### Navigation cases verified

| Case | Scenario |
|---|---|
| Wizard → hub → wizard | Footer, focus, no return note on arrival, time filled in the hub clears the schema gap, label, format and CRS kept |
| Target changed in the hub | Comes back as the wizard's format, and readiness follows |
| Outdated plan | A finished plan stays discarded, the next one has a new name. A build still running when the user leaves finishes without effect, in the hub and after returning |
| Map, Save | Back to the hub first, way back kept, `Plassering: 0 gjenstår.`, then the placement counts, and a plan builds with the label |
| Map, Discard | No change: `1 plassering mangler posisjon…` and `2 bilder i pakken` remain |
| Map, Fortsett redigering | Staged value and journey kept, by the button and by Escape |
| Map, Save at the boundary | Same result as the bar's Save |
| Map, other ways back | Escape, and the `Fullfør opplysninger…` tool, keep the journey |
| Positioning wizard | `Avbryt` changes nothing. Applying a new GML position counts on return |
| Late `close` | Wizard → hub, hub → wizard, hub → map, hub → positioning wizard, each with an 800 ms wait, then an event sent by hand to the old element |
| Native close | `dialog.close()` on the hub reaches Leveranse, and on the wizard closes it |
| Double-click | Second click aimed at the real control, asserted by `elementFromPoint`: `Fullfør opplysninger…` → `Tilbake til eksport`, `Tilbake til eksport` → `Neste`, `Gå til eksport` → `Neste`. No file read. A later single click on `Neste` works |
| Hub exits | Footer, ✕ and Escape all reach Leveranse with focus on its heading |
| Repeated Escape | Hub, then wizard, then nothing. Focus ends on `Verktøy` |
| Wizard exits after a return | ✕ and `Avbryt`, focus on `Verktøy` |
| Keyboard | Whole trip by key, a second Enter does nothing on either screen, Tab stays inside the dialog |
| Standalone hub | `Gå til eksport` and `Lukk`, also after a map trip. `Lukk`, ✕ and Escape do not lead to export. A wizard reached this way behaves normally |
| Another tool | `Eksporter…`, `Kilder og koblinger`, `Koble og posisjoner bilder…` end the journey. With staged changes, only after the boundary, and `Fortsett redigering` keeps it |
| Leaving FOTO | From the hub by script, and from the map through the boundary |
| Removal and reset, after leaving | Second layer has its own settings, removal leaves nothing open, and reset leaves no settings |
| Removal and reset, live | Six tests: remove and reset, on the hub, map and positioning wizard. Everything closes, and a new layer starts clean |

**About the live tests.** Inside FOTO the layer card and reset button are not rendered, so a person must leave first, and that ends the journey. To test the subscriber itself, the suite reads the real `onClick` handlers from React's props before entering. No test hook was added to the product. This simulates a late session change and is not a user path.

**Failed commits are not covered.** The two failed-commit paths are not tested in the browser. The change there replaces `closePhotoExportFlow()` with `endPhotoExportTrip()`. The `edit-conflict` branch is unchanged.

---

## 6. Verification

Production build on `http://localhost:3110`, `PHOTO_GML_FIXTURE` set to the Ekenesstokken corpus, `--test-concurrency=1` for browser suites. Source restored after the mutation runs was confirmed identical by checksum. Return, wizard and flow suites were run again on the final build: 38 of 38.

**Counts differ from M6c's report for two reasons.** "22 browser suites" is every file that uses `PHOTO_UI_URL`, which is more than M6c's 19 FOTO suites. My 150 non-browser files are every other test file, so that list is wider than M6c's 142. My 17 domain files are also my own selection and may differ from M6c's. **I did not reconcile those lists.** The wider non-browser run covers the rest.

The one browser skip is `private G01/G04 browser`, unchanged from M6c.

### Failures not caused by this work

The same six as M6a to M6c, by name and line:

| File | Line | Test |
|---|---|---|
| `validationV2WorkspaceInspector.test.mjs` | 7 | normal sidebar width is preserved and shared by the Validator and docked inspector |
| `validationV2WorkspaceInspector.test.mjs` | 34 | workspace shell places a full-height left list beside a shared upper row and full-width bottom dock |
| `validationV2WorkspaceInspector.test.mjs` | 103 | 2D map resize invalidation and parent-sized 3D canvas remain in place |
| `statsUiContract.test.mjs` | 8 | statistics UI exposes the Norwegian uptake and kommune controls |
| `statsUiContract.test.mjs` | 129 | Stats trigger visibility follows table, docked inspector, and profile ownership only |
| `appInfoUiContract.test.mjs` | 90 | working header stays above one conditional feature branch with full-height normal resize reach |

**A seventh appears because my file list was wider:** `terrainPhotoGml.test.mjs:12`, `Failed to fetch dynamically imported module … tests/browser/photoSpatialChecks.mjs`. It also fails on a clean `17cdfd2` in a temporary worktree with the fixture variable set, and on this working tree without it. I did not look into why.

### Not run

- No person has reviewed this. I took no screenshots, so **the new hub footer has not been seen on screen**. `photoDialogLayout` passes.
- The whole suite was not run on `next dev`, only two scenarios.
- The XSD harness and a real Gemini VA import. V1 stays open.

`npm run lint` still does not work, as earlier reports noted, so ESLint was run directly on all changed files.

---

## 7. Remaining issues

**New findings:**

1. **`PhotoCaptureMetadataDialog.js:93` has the same unguarded `onClose={onClose}`.** I expect it closes itself in `next dev`, but did not test it. It is outside this brief. If so, it is a one-line fix, and the guard could become a shared helper.
2. **Suites never run on dev**, so a strict-mode problem like this one stays invisible. One dev smoke test would catch it.
3. **Held Escape walks out step by step.** From the map it can go on to the hub and the wizard. Each step is correct, but a user who holds the key may leave the wizard too. I left this alone.

**Deferred to M6e, as you listed, and unchanged:**

- The false `må rettes før eksport` in the hub while EXIF is being read. A journey makes it easier to reach.
- Final layout and styling, including the hub footer.
- Singular and plural wording.
- Q7 compatibility warning.
- Final 125% zoom acceptance.

Bulk editing of unplaced photographs was not restored, as agreed.

---

## 8. Manual checks

Use the contractor delivery of 40 photos and the 148-photo corpus.

1. `Eksporter…`, set a label, `Fullfør opplysninger…`. The hub shows only `Tilbake til eksport`.
2. Fill one time, then `Tilbake til eksport`. The count falls, `Kontrollen er oppdatert.` shows, and the label remains.
3. Choose Legacy with times missing, go to the hub, and change `Mål` to Gemini. Check that it is clear the format changed on return.
4. Hub, `Angi på kartet`, change a direction, Save. You land on the hub, not export. Then return.
5. The same with Discard. Nothing changes.
6. The same with `Fortsett redigering`, then leave properly.
7. Hub, `Koble og posisjoner bilder…`, cancel, return.
8. During a map trip, choose `Eksporter…` from `Verktøy`, with and without staged changes.
9. Open the hub from `Verktøy`. It shows `Gå til eksport` and `Lukk`. Try both.
10. Double-click `Fullfør opplysninger…`, `Tilbake til eksport` and `Gå til eksport`. Each goes one step.
11. Keyboard only: the whole trip, including Escape from the hub, then Escape from the wizard. Focus ends on `Verktøy`.
12. Read both hub footers at a small window size, and judge whether ✕ during a journey is clear enough.
13. Run once on `next dev`. Both dialogs should stay open.

No commits or pushes were made. Stopping here for review.
