# FOTO export M4 — Edit-mode and dialog handoff

Date: 2026-11-07, Europe/Oslo. **Nothing was committed, pushed or deployed.**

Specification: `20261104-1823-photo-export-overhaul-planning.md`, §6, §7.2, §7.3, §8, §10, §11 and decisions D1–D7. Only M4 was implemented.

Norwegian text in `«…»` is UI copy.

---

## 1. Summary

**`Fullfør opplysninger…` now hands off to the map and to the positioning wizard, and comes back to the same task.** It reuses the existing Edit mode. There is no second map editor.

| Route | From | Comes back to |
|---|---|---|
| `Angi på kartet` | Retning | Retning |
| `Kontroller 0° på kartet`, `Rett på kartet` | Retning, for accepted values | Retning |
| `Plasser på kartet` | Plassering | Plassering |
| `Koble og posisjoner bilder…` | Plassering | Plassering |

**The Save/Discard transaction is unchanged.** Every way out of Edit mode still goes through `requestWorkspaceAction` and the same boundary dialog. Staged values stay out of `photoSession`, so readiness and export cannot see them. The hub recalculates from canonical photos each time it opens.

**Real corpus, in Chrome on a production build, 148 photos:** `Mangler retning: 148` → stage one value → Discard → hub still shows 148. Then accept GML `0°` for all 148 → `Kontroller 0° på kartet` → correct two → Save → hub reports 146 accepted GML `0°`, and the `direction-all-zero` warning falls to 146.

**No new regressions.** Export code, goldens and all existing tests are unchanged. The only failures are the same seven baseline ones as M3 (§10).

**Three things need your attention:**

1. **Save returns to the hub.** Saving ends the Edit session, as it always has, so in a handoff it also takes you back. There is no "save and carry on" (§14, decision 2).
2. **A genuine `0°` cannot be marked as checked.** It stays in `Kontroller 0° på kartet` until changed. I added no review state, because that would be a new acceptance policy (§12).
3. **I added a double-click guard you did not ask for** (§9). Testing showed the second click of a double-click could otherwise place a photo on the map or accept an EXIF direction in the hub.

---

## 2. Starting state

Clean worktree on `feature/photo-workspace` at `a2d6e08`, as expected. HEAD is unchanged.

---

## 3. Files changed

**Created**

| File | Purpose |
|---|---|
| `src/lib/photos/photoExportFlow.mjs` | Pure flow model: create, work filter, progress and navigation, liveness |
| `src/components/photos/photoFollowUpClick.js` | Ignores the second click of a double-click across a handoff |
| `tests/photoExportFlow.test.mjs` | 15 domain tests |
| `tests/photoExportFlowUi.test.mjs` | 13 browser tests, one using the corpus |

**Modified**

| File | Change |
|---|---|
| `src/app/page.js` | Flow state, entry and return, `keepFlow` on `requestWorkspaceAction`, wizard `onClose`, command-bar props |
| `src/components/photos/PhotoEditCommandBar.js` | `PhotoEditFlowRow`, shown only during a handoff |
| `src/components/photos/photoEdit.css` | Styles for that row |
| `src/components/photos/PhotoCompletionDialog.js` | `entry` prop: task, selection, return note, heading focus |
| `src/components/photos/PhotoCompletionDirectionPanel.js` | `Angi på kartet`, `Kontroller 0° på kartet`, `Rett på kartet` |
| `src/components/photos/PhotoCompletionDetailsPanels.js` | `Plasser på kartet`, replacing the text pointer |
| `src/components/photos/PhotoWorkspaceCollection.js` | Clear and show the work filter |
| `src/lib/photos/photoCompletion.mjs` | `canSetOnMap`, `canReviewOnMap`, one hint reworded |
| `src/lib/photos/photoWorkspaceState.mjs`, `photoWorkspaceView.mjs` | Optional `filter.work` |

**No existing test was changed.** `PhotoPositioningWizard.js`, `src/lib/photos/export/*`, `photoSession.mjs` and all golden fixtures have no diff.

---

## 4. Flow-state architecture

`photoExportFlow` is `useState` in `page.js`, with a ref beside it. Nothing reaches browser storage or a backend.

```js
{ origin: 'complete',                    // where it returns to; M6 can add 'export'
  layerId, task: 'direction' | 'placement',
  route: 'edit' | 'positioning', scope: 'missing' | 'review',
  workIds: [...], focusId,               // fixed on entry, in workspace sort order
  restore: { filter, activePhotoId, selections } }
```

**It holds identities and view choices only.** It has no values, readiness or plan, so it cannot go stale. A test pins the exact keys, and another confirms the module imports no readiness or plan code and writes nothing.

**Why the ref.** A Save/Discard continuation is created before the boundary dialog opens and runs later. It has to read what is current at that moment, not what its closure captured.

**Why a work filter, not the plan's flags.** The plan said to set `missingDirection` or `placement: 'unplaced'`. Those filters read effective photos, so an occurrence would vanish from the list and the map as soon as it was staged, and `Forrige` could not reach it. Flags also cannot express accepted `0°` values, invalid directions or a narrowed selection. `filter.work` is `{ ids, label }`:

- The sidebar still reads `Viser 5 av 6 · Mangler retning` or `Uplassert`.
- It appears as a checkbox in the filter panel, and `Fjern filter` clears it.
- It combines with other filters, and is an optional key, so the existing filter tests are untouched.

---

## 5. Edit-mode entry and return paths

**Entry (`openPhotoCompletionMap`), through `requestWorkspaceAction`:** create the flow, enter Edit mode on the first occurrence, close the hub, set the filter, select the occurrence. If there is nothing to work on or no ticket, nothing changes and the hub stays open.

| Action | Work list |
|---|---|
| `Angi på kartet` | Rows without an accepted, valid direction, narrowed by any selection |
| `Plasser på kartet` | Unplaced occurrences |
| `Kontroller 0° på kartet` | Accepted GML `0°` rows |
| `Rett på kartet`, on a `Ferdig` row | That row, or all accepted GML `0°` rows if it is one |

**Return.** A handoff has one rule: **leaving Edit mode goes back to the hub.**

| Way out | Result |
|---|---|
| `Tilbake til opplysninger`, Escape, `Fullfør opplysninger…` in Verktøy | Boundary if anything is staged, then hub |
| `Lagre endringer` | Commit, then hub |
| `Forkast endringer` | Confirm, then hub |
| Any other tool, or `Tilbake til appen` | Boundary, then the handoff ends: filter and selection restored, **no hub** |
| Layer removed, session cleared, Edit ended externally | Handoff ends, **no hub** |

On return the order is: settle the boundary, restore filter and selection, reopen the hub on the same task with its row selection, recalculate.

---

## 6. Save/Discard transaction handling

| Requirement | How it is met |
|---|---|
| Edits stay staged | Unchanged: staging stays in the `photoEdit` reducer |
| Save publishes | Unchanged `applyPhotoEdits`; the return is passed as its existing `then` |
| Discard restores | Unchanged; the hub reads canonical photos |
| Cancelling loses nothing | `Fortsett redigering` and Escape run no continuation. The handoff is only closed inside the continuation, so it also survives |
| Return cannot bypass the boundary | `leavePhotoEditMode` is `requestWorkspaceAction(returnToPhotoCompletion, { keepFlow: true })` |
| Conflict | `then` is kept through `Lagre de øvrige`, as before |
| Failed commit | The handoff ends and the existing error is shown |
| Value still being typed | Leaving blurs the field, which stages it, so the boundary asks. Tested |

Ordinary Edit mode is unchanged, because with no handoff the return does nothing. A browser test confirms there is no extra row, `Avslutt redigering` remains, and Save opens nothing. Undo/redo, gestures, shortcuts and the order of Escape handling were not touched. Escape only passes a continuation.

---

## 7. Readiness recalculation

The hub keeps no results across a handoff. It unmounts on the way out and on return computes `photoExportReadiness(photos, …)` from `workspacePhotos`, which is always canonical, using a fresh `now`. The export dialog has its own plan, which unmounts with it.

- After Save, the hub's count equals the bar's `outstanding`. A domain test asserts this.
- After Discard, it equals `outstanding + staged`, which is the original.
- A browser test builds an export preview after a Discard (5 × `direction-required`) and after a Save (4).
- The footer shows `Retning: 3 gjenstår.`, derived from the same model.

---

## 8. Command bar and positioning wizard

### Command bar

Shown only during a handoff, as one row in the existing bar:

```
Mangler retning: 4 · 1 ulagret   1 av 5        ‹   Neste ›   ← Tilbake til opplysninger
```

- **Counts.** The large number has no staged values in it, and `ulagret` is shown apart. The accessible name says they are not accepted yet. Labels: `Mangler retning`, `Mangler plassering`, `Kontroller retning`.
- **`Neste`** goes to the next occurrence still needing work, wrapping round. **`Forrige`** walks the whole list, so a staged value can be looked at again. Both only change the selection, and only within the layer's own work list.
- **`Avslutt redigering` is replaced by `Tilbake til opplysninger`,** because they would do the same thing. All other controls stay.
- **Layout.** Checked at 1920×1080, 1366×768, 1280×720 and 1024×600: no horizontal overflow, controls stay inside the bar, and at least 120 px of map remains below it. `Tilbake` shortens on narrow maps; its accessible name stays complete.

### Positioning wizard

**`PhotoPositioningWizard.js` has no diff.** `page.js` passes `closePhotoSources` as its `onClose`, which also runs the return. All its exits use that one callback: `Avbryt`, Escape, the header button and a successful apply. The wizard's ticket, kept sources and accepted positions work as before. Tests confirm that a kept source alone leaves `Plassering` at 1, and that an applied position completes it.

---

## 9. Keyboard, focus and double-click safety

| Moment | Behaviour |
|---|---|
| Entering Edit mode | Focus moves to the handoff row, so Tab reaches `Forrige`, `Neste`, `Tilbake` |
| `Neste` | Focus stays on it, and the filename is announced |
| `Forrige` at the first item | Stays focusable with `aria-disabled`, and the tooltip says why |
| Boundary opens | `Fortsett redigering` has focus; Escape keeps editing and focus returns to `Tilbake` |
| Hub returns | Focus goes to the task heading |
| Hub closes | Focus returns to `Verktøy` |

Only one workspace dialog is open at a time. Tests assert this for the map and the wizard, and that the hub does not reappear over the export dialog.

**M3 safety fixes are preserved.** The used-selection rule and the `0°` double-click rule are unchanged, and M3's tests pass. New map buttons also ignore `event.detail > 1`. A selection that was used up stays narrow after a return, so the bar's actions read `0 valgte` rather than widening to everything.

### The double-click guard

A handoff swaps what is under the cursor, so M3's class of bug appears in a new form. `ignoreFollowUpClick` drops clicks with `detail > 1` for 600 ms after a handoff. Single clicks and the keyboard are unaffected.

**My first tests for this proved nothing.** I disabled the guard to check them and they still passed, because at that viewport the second click happened to land on the command bar. I replaced them with a test that aims the second click at the map and at a hub action, and confirms the target is really there. With the guard off:

| Second click lands on | Result with the guard off | Result with it on |
|---|---|---|
| The map, 150 ms later | **Photo placed** | Nothing |
| `Bruk EXIF-retning` in the hub | **Direction accepted** | Nothing |

A second mutation, removing the code that ends a handoff when another tool opens, also failed a test as it should.

---

## 10. Test results

All results are from the final code on a production build. Runs set `PHOTO_UI_URL=http://localhost:3110` and `PHOTO_GML_FIXTURE`, with `--test-concurrency=1` for browser suites.

| Check | Covers | M3 | Final |
|---|---|---|---|
| New M4 domain tests | Flow, filter, counts, navigation, Save/Discard parity, `0°`, repeats | n/a | **15 of 15** |
| New M4 browser tests | Every route, boundary, keyboard, layout, corpus | n/a | **13 of 13** |
| Domain selection (139 files) | Everything without a browser | 1,471: 1,461 pass, 6 fail, 4 skip | **1,486: 1,476 pass, 6 fail, 4 skip** |
| Export gate (18 files) | M3, M4, M0 goldens, M1, M2 readiness and parity, serializers, package, Gemini compatibility | 264: 263 pass, 1 skip (16 files) | **311: 310 pass, 0 fail, 1 skip** |
| Photo/GMI browser selection (20 files) | FOTO workspace, Edit mode, M3 hub, M4 | 93: 92 pass, 1 skip | **106: 105 pass, 0 fail, 1 skip**, 497 s |
| Gemini browser + `geminiWorkflowUi` (6 files) | Gemini WFS | 107 of 107 | **107 of 107** |
| `terrainPhotoGml` | n/a, see below | 1 fail | 1 fail, same error |
| Production build | | Pass | Pass, exit 0 |
| ESLint, all changed and new files | | 0 errors | 0 errors, 0 warnings |
| `git diff --check` | | Clean | Clean |

The counts reconcile exactly: 1,471 + 15 = 1,486, and 93 + 13 = 106. The export gate is a list I rebuilt and it includes M4, so its total is not directly comparable with M3's.

**Corpus runs passing:** M1 EXIF adoption to package, M3 hub to package, and M4 map handoff, all with the real 148 photos.

**Protected code:** `git diff` is empty for `src/lib/photos/export/`, `tests/helpers/` and all golden fixtures. The M0 goldens pass unchanged.

**Not run:** the external XSD harness. No plan or serializer code changed, so it would compare identical output, but that is inferred rather than re-measured.

### Baseline failures, regressions and skips

**No new regressions.**

- **6 domain failures, all baseline:** three `validationV2WorkspaceInspector`, two `statsUiContract`, one `appInfoUiContract`. Since these tests read source files and I changed `page.js`, I reran them on a pristine `git archive` of `a2d6e08`: both give 22 tests, 16 pass, and the same 6 fail by name.
- **`terrainPhotoGml`, baseline:** fails with `Failed to fetch dynamically imported module` before any check runs, so **it gives no coverage**. It was not rerun on `a2d6e08`.
- **4 domain skips:** three GMI corpus tests needing `GMI_PHOTO_CORPUS` or `GMI_PHOTO_EKENES`, and the `REF_FILES` comparator, which is also the gate's 1 skip.
- **1 browser skip:** the private G01/G04 suite.

### Requested coverage

| Area | Test |
|---|---|
| Entry to Edit mode; Save with updated readiness; filter and selection restored; Next/previous | Browser 1 |
| Discard; cancel at the boundary, three ways; typed value | Browser 2 |
| Placement editing | Browser 3 |
| Correcting accepted GML `0°`, with Discard and Save | Browser 4, corpus |
| Positioning wizard return | Browser 5 |
| Stale plans and staged data; other tools | Browser 6, domain |
| Layer switching, deletion, reset | Browser 7, domain |
| Selection narrowing; M3 protection | Browser 8 |
| Double-click across a handoff | Browser 9 |
| Keyboard, focus, ordinary Edit mode | Browser 10 |
| Layout | Browser 11 |
| Repeated photographs | Browser 12, domain |

---

## 11. Browser acceptance still required

**No person has reviewed M4.** The M3 acceptance and the EXIF capture-time acceptance also remain incomplete. Passing automated coverage does not replace them, and I am not claiming they have happened.

I reviewed screenshots at 1680, 1366 and 1024 px wide. Please check:

| Where | Check |
|---|---|
| Whole flow | One manual corpus run: hub → map → Save → hub, then Discard |
| `Plasser på kartet` | The filter hides placed photos, so there is little on the map to place against. Is `Fjern filter` enough? |
| Save returning to the hub | Does this suit someone working through many photos? |
| `Mangler retning: 4 · 1 ulagret` | Is the wording clear? |
| `Neste` and `Forrige` | Do the different behaviours feel natural? |
| 1024×600 | The bar takes much of a small map. Check the selected photo stays visible |
| Keyboard | A real keyboard-only run with a screen reader |
| `0°` block | Still open from M3: is one deliberate click enough for 148 placements? **Unchanged here** |

---

## 12. Known limitations

- **A genuine `0°` cannot be marked as checked.** Staging the same value is a no-op, so it stays in the review list. Confirming it would need a new state and a policy decision.
- **`Kontroller 0°` covers GML only.** Other questionable accepted values, such as `direction-bulk`, are corrected one row at a time from `Ferdig`.
- **Layer deletion and reset during an open handoff are not reachable in the UI.** The workspace has to be left first, which ends the handoff. Browser tests cover that real order. The direct path, a session publish with the layer gone, is covered only by a domain test of `photoExportFlowIsLive`.
- **Edit conflicts and failed commits inside a handoff have no browser test.** No UI route produces them. The code keeps the continuation on a conflict and ends the handoff on failure.
- **Other tools end the handoff.** Opening `Rediger opptaksdata…` from the inspector in Edit mode ends it, and closing that dialog does not return to the hub.
- **A hidden layer stays visible after the trip,** as with any Edit session.
- **The work list is fixed on entry.** Nothing can add to it during an Edit session, but a new trip is needed to see fresh work.
- **M3's other limitations stand:** direction conflicts need a typed value, and rows are not virtualized.

---

## 13. Remaining M5 and M6 responsibilities

**M5:** `photoExportNaming.mjs`, the `gmlFilename` option, and gate G1. Nothing here touches them.

**M6:**
- Add `returnTo: 'export'`. The flow's `origin` field exists for this, but only `'complete'` is implemented, and return always goes to the hub.
- `«Tilbake til eksport»` in the bar; the row takes its label from there.
- Discard any built plan on return, and show F17 in the three-level block.
- Replace `PhotoExportDialog`, and fix the target not reaching it.

G1–G3 still need someone with Gemini VA access.

---

## 14. Decisions beyond the approved plan

| # | Decision | Why |
|---|---|---|
| 1 | `filter.work` instead of the plan's flags | §4. Flags lose staged occurrences and cannot express review or selection |
| 2 | Save and Discard return to the hub | Save already ends the session, and the brief lists Save → return. A dangling handoff would be worse |
| 3 | Every exit from Edit mode returns, including Escape | One rule, and Escape handling itself is unchanged |
| 4 | `Tilbake til opplysninger` replaces `Avslutt redigering` | They would do the same thing |
| 5 | `Forrige` added beside `Neste` | The brief's verification list asks for it. Icon-only, with tooltip and aria-label |
| 6 | `Neste` skips handled items; `Forrige` does not | One moves work on, the other allows review |
| 7 | Hub selection narrows the work list and is restored | Matches M3's rule that a selection only ever narrows |
| 8 | `Kontroller 0° på kartet` and `Rett på kartet` | The brief needs a route to accepted values, and they do not count as missing |
| 9 | Bulk review covers GML `0°` only | A person chose a manual `0°`, and EXIF `0°` from true north is ordinary evidence (D2) |
| 10 | `ignoreFollowUpClick` | §9. A real, reproduced hazard |
| 11 | `Fullfør opplysninger…` in Verktøy during a handoff counts as a return | Otherwise the task would be lost |
| 12 | The hub's selection restores, not only the workspace's | The brief lists "previously selected occurrence"; both are kept |

No metadata adoption, `0°` acceptance, EXIF, export or profile rule changed.

---

## 15. Reproduction

```
npm run build
npx next start -p 3110

$env:PHOTO_UI_URL='http://localhost:3110'
$env:PHOTO_GML_FIXTURE='C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml'

node --loader ./tests/esmJsLoader.mjs --test tests/photoExportFlow.test.mjs
node --test --test-concurrency=1 tests/photoExportFlowUi.test.mjs
```

Set `PHOTO_SCREENSHOT_DIR` to keep screenshots.

---

## 16. Conclusion

**M4 is ready for Git review.**

- All areas of the brief are implemented, and every requested scenario has a test, apart from the two unreachable paths in §12.
- There are no new regressions. The seven failures are the same baseline ones, and the six domain failures were confirmed by name on a pristine `a2d6e08`.
- No M5–M7 work was added. Export code, goldens and existing tests are unchanged.
- Nothing was committed, pushed or deployed.

Git review does not replace the human checks in §11 or the real Gemini gates G1–G3.
