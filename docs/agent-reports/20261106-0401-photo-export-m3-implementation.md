# FOTO export M3 — Fullfør opplysninger

Date: 2026-11-06, Europe/Oslo. **Nothing was committed, pushed or deployed.**

Specification: `20261104-1823-photo-export-overhaul-planning.md`, decisions D1–D7. Only M3 was implemented.

Norwegian text in `«…»` is UI copy.

**Updated in a resume pass, same date.** The resume brief assumed this report did not exist and that verification was unfinished. In fact a first version existed, but no logs had been kept. The pass reviewed M3 against the plan again and reran everything with saved logs. **The review found two blockers that the first version had passed: both let a double-click accept direction values the user did not choose (§7).** Both are fixed. Every result in §11 comes from this pass.

---

## 1. Summary

**`Fullfør opplysninger…` now works as a standalone tool.** It opens from `Verktøy` through `requestWorkspaceAction`, independently of export, and covers all five tasks for all three export profiles.

**The real corpus can now be completed in the UI.** With the 148-photo Ekenesstokken corpus and its GML, in Chrome against a production build:

| Step | Result |
|---|---|
| Open the tool | `148 må rettes før eksport`; `Kildene stemmer overens for 148 bilder`; 0 conflicts |
| Ordinary direction actions | None offered, because all 148 GML directions are `0°` |
| `Bruk EXIF-tid for 148 bilder` | 148 accepted |
| `Godta GML-retning 0°` | Accepted for 1 selected placement (double-clicked, stays at 1), then the other 147 by their own action; the `direction-all-zero` recommendation appears |
| Downloaded Gemini ZIP | 148 features; every time matches the JPEG clock, read independently of the app; 148 directions of `0` |

**Export output is unchanged.** `photoExportPlan`, `photoExportRules`, `photoExportXml`, `photoExportPackage`, `attachmentNames`, `exportContract` and the golden fixtures have no diff. Requirements and blocking policies are unchanged.

**Three things need your attention:**

1. **The existing export dialog shares only the AsBuilt context with the tool, not the target** (§10). A browser test pins that the dialog asks for its profile every time, so a target chosen in the hub does not preselect it. M6 removes this gap.
2. **A direction conflict can only be settled by typing a value** (§6). No domain mutation accepts one source over another for direction, and you asked me to use existing mutations.
3. **Accepted direction cannot be changed in the hub, including GML `0°`** (§6). There is no undo. It has to be corrected on the map.

---

## 2. Starting state

Clean worktree on `feature/photo-workspace` at `4dab238`, as expected. HEAD is unchanged.

---

## 3. Files changed

**Created**

| File | Purpose |
|---|---|
| `src/lib/photos/photoCompletion.mjs` | Pure model over readiness: tasks, rows, groups, selection scope, status line, plural handling |
| `src/lib/photos/photoExportConfig.mjs` | Transient per-layer configuration |
| `src/components/photos/PhotoCompletionDialog.js` | The hub: frame, target, task navigation, nested dialog, status |
| `src/components/photos/PhotoCompletionTimePanel.js` | `Opptakstid` |
| `src/components/photos/PhotoCompletionDirectionPanel.js` | `Retning` |
| `src/components/photos/PhotoCompletionDetailsPanels.js` | `Fotograf`, `Plassering`, `Leveranseopplysninger` |
| `src/components/photos/PhotoCompletionRows.js` | Shared rows, groups, counts, `Ferdig` |
| `src/components/photos/photoCompletion.css` | Layout |
| `tests/photoCompletion.test.mjs` | 28 domain tests, one using the corpus |
| `tests/photoCompletionUi.test.mjs` | 12 browser tests, one using the corpus |
| `tests/helpers/photoCompletionFixtures.mjs` | Fixtures |

**Modified**

| File | Change |
|---|---|
| `src/app/page.js` | Real routing through `requestWorkspaceAction`, `photoExportConfigs` state, reconciliation on publish, mounting the hub |
| `src/components/photos/PhotoCaptureMetadataDialog.js` | `:00` confirmation, `exportProfile` help text, native `close` handling |
| `src/components/photos/PhotoCaptureTimeField.js` | `help` prop; default text unchanged |
| `src/components/photos/PhotoExportDialog.js` | AsBuilt context seeded from, and written to, the shared configuration |
| `src/lib/photos/photoCaptureTimeInput.mjs` | `requireSeconds`, `captureTimeHelp`, `CAPTURE_TIME_ERRORS` moved here so both forms share the copy |
| `src/lib/photos/export/photoExportReadiness.mjs` | `sourcePending` added to direction items. Additive, two lines |
| `tests/photoWorkspaceEditUi.test.mjs` | The only existing test changed. It asserted that the placeholder opens nothing; it now asserts that the tool opens and focus returns |

---

## 4. UI architecture

```
Verktøy → requestWorkspaceAction → photoDialog === 'complete'
PhotoCompletionDialog
  photoExportReadiness(photos, config, now)      M2, the only classifier
  photoCompletionModel(photos, readiness)        rows and groups, no new rules
  ├─ Mål select · task navigation with outstanding counts
  ├─ active panel: counts → recommendations → source actions → 0° → manual → groups → Ferdig
  ├─ footer: delivery status line, last action, Lukk
  └─ PhotoCaptureMetadataDialog                  nested native dialog
```

- **Frame.** It reuses `.photo-collection-dialog`, `-frame`, `-header` and `.photo-import-footer`.
- **Task order.** The tool opens on the first blocking task, then anything outstanding. With nothing placed it opens on `Plassering`.
- **Requirement labels.** `Påkrevd`, `Anbefalt`, `Valgfritt` and `Tas ikke med i denne leveransen` come from M2 requirements. An omitted photographer moves under `Andre opplysninger` and never counts as work left.
- **Long lists.** A group over 25 rows starts folded when other groups exist, so a few conflicts are not buried. A sample row keeps real values visible.
- **Status line.** It uses M2's status: `{n} må rettes før eksport`, `Kan eksporteres, men følger ikke {skjema}-skjemaet`, `Kan eksporteres, men {n} kan forbedres`, or `Ingen opplysninger mangler for dette målet`. It never says `klar`. This surfaces F17 inside the hub, though the export dialog still does not show it.

**Focus and Escape.** Escape in the nested dialog closes only that dialog, and focus returns to the row action. If the save moved that row to `Ferdig`, focus goes to the panel heading. Closing the hub returns focus to `Verktøy`. Both dialogs also listen for native `close`, because Chrome skips `cancel` on a second Escape with no user action between. Without this, the hub would be closed but still mounted, and could not be reopened. A browser test covers this.

---

## 5. How M2 readiness is reused

`photoExportReadiness` is the only classifier. The hub adds no rule of its own about what blocks, what is required or what counts as accepted.

| Hub element | Readiness output it reads |
|---|---|
| Rows and their states | `tasks.captureTime.items`, `tasks.direction.items` |
| Which source buttons exist | `adoptableKinds`, `zeroNeedsReview`, `sourcePending` |
| Task labels and notes | `requirement`, `schemaRequired` |
| Scope, and the "left out" note | `counts.excluded`, `tasks.placement` |
| AsBuilt field messages | `blocking` items with code `invalid-context` |
| `Bør kontrolleres` notes | `recommendations` |
| Status line | `status`, `blocking`, `levels.schema` |

`photoCompletionModel` turns this into rows and groups, and it is pure. A test confirms that reading the model changes nothing, and another reads the source to confirm capture-time and direction states are not reclassified. Readiness is recalculated from canonical photos on every session publish, so the hub has no refresh step.

The only change to readiness is the additive `sourcePending` on direction items. The one direct rule call is noted in §6.

---

## 6. Data ownership, mutations and readiness

Tests confirm that readiness follows each action below without a separate refresh step.

| Data | Owner | Written by |
|---|---|---|
| Capture time, photographer | Asset | `adoptSourceEvidence`, `fillMissingPhotoValues`, `setCaptureMetadata` (nested dialog) |
| Direction | Occurrence | `adoptSourceEvidence`, `fillMissingPhotoValues` |
| Placement | Occurrence | Not written here |
| AsBuilt context | Delivery, per layer | `photoExportConfigs` only, never on photos |

No new setters were added. Source evidence is not altered; a test asserts it keeps its identity after adoption. Task scope follows the plan: placed occurrences and their assets. Each task states how many photos without a position are left out.

The photographer rows are the one place the model asks a rule directly (`evidenceEligibility`), because readiness only counts photographers and M2 pins that shape with `deepEqual`. Capture-time and direction states are read from readiness and never reclassified, and a test checks the source for this.

### Capture time

| State | Shown | Action |
|---|---|---|
| Adoptable | Each source value; `EXIF og GML stemmer overens` where true | `Bruk EXIF-tid for {n} bilder`, `Bruk GML-tid for {n} bilder` |
| Conflict | Both values | `Velg verdi…`, nested dialog |
| Partial | `Har tid uten sekunder`, plus `Erstatter godtatt verdi` when it would replace one | `Rediger…` |
| Unusable | Raw value | `Rediger…` |
| Pending | `Leser bildedata …` | None; updates live |
| Missing | `Ingen kildeverdi` | `Rediger…`, or bulk manual |
| Accepted | Value, source, and all source values under `Ferdig` | `Rediger…` |

No source is favoured: EXIF and GML buttons have equal weight.

**The `:00` fix.** When the time field still shows a minute-precision prefill, `Lagre` still refuses with `Kilden har ikke sekunder. Oppgi sekunder.` A checkbox now appears: `Sekundene er 00`, with `Kilden oppgir bare minutter. Dette lagres som din manuelle verdi, ikke som kildens.` Saving with it ticked records provenance `Manuell`, and the GML line stays `14:33 · uten sekunder`. It also removes the M1 limitation that an accepted minute value could not gain a timezone without changing the time.

### Direction

| Case | Behaviour |
|---|---|
| EXIF | `Bruk EXIF-retning for {n} plasseringer` |
| Non-zero GML | `Bruk GML-retning for {n} plasseringer` |
| GML `0°` | Separate warned action (below) |
| Real EXIF heading beside GML `0°` | EXIF stays adoptable; the zero is neither offered nor counted against it |
| EXIF and GML disagree | Both values shown; resolved by manual entry on selected rows |
| Magnetic or unknown reference | Listed, never adopted |
| Shared original | One row per placement, labelled `Plassering {i} av {n}`, with the existing caution |
| Accepted | Read-only under `Ferdig`, with source |

### GML `0°`

- `Godta GML-retning 0° for {n} plasseringer` sits in its own warning block, with your exact warning text. It is an outlined button, not a primary one.
- `{ includeZero: true }` appears in exactly two places: that action and the eligibility check for it. A test enforces this.
- The action ignores the second click of a double-click, so it can only be reached by a deliberate click (§7).
- The ordinary GML action adopts nothing even when pointed directly at a zero row.
- The manual field has no default. Entering `0` or `360` shows `0° betyr nord, ikke ukjent retning.`
- No copy suggests entering `0°`.

---

## 7. Bulk and selection

- **Nothing selected:** a source action covers every eligible row. Its label states the exact count.
- **Rows selected:** the action narrows to eligible rows in the selection, and the label changes, for example `Bruk EXIF-tid for 1 valgt bilde`. A selection with nothing eligible disables the button.
- **A used selection keeps narrowing.** Accepted rows leave the `Valgt` count, but actions stay limited to the selection until it is cleared. The strip then reads `Ingen av de valgte gjenstår. Fjern valg for å bruke handlingene på alle.` and the button reads `… for 0 valgte bilder`, disabled. Choosing new rows replaces the used selection. When nothing is left to act on, it is dropped.
- **Manual fill needs an explicit selection.** One typed value can never reach every photo by default.
- **Accepted values** cannot be selected, so ordinary bulk actions cannot overwrite them. They are replaced one photo at a time in the nested dialog.
- **Counts strip:** `Kan brukes`, `Valgt`, `Godtatt`, `I konflikt`, `Må vurderes`.

**While EXIF is still reading,** those rows cannot be selected and are held out of source actions, with a note saying how many are waiting. This includes GML adoption and GML `0°`, because EXIF might still disagree or supply a real heading. It goes beyond the plan (§13).

### Two double-click blockers found in the resume pass

Both were reproduced with real mouse events before any fix, and both matter most for direction, which cannot be undone in the hub.

| | Defect | Evidence before the fix | Fix |
|---|---|---|---|
| 1 | The selection emptied after the first click, so the same button relabelled to every eligible row. The second click accepted them | Corpus: double-clicking `Godta GML-retning 0° for 1 valgt plassering` accepted **all 148**. Synthetic: `Ferdig (2)`, expected `Ferdig (1)` | A used selection keeps narrowing (above), through `selectionScope` |
| 2 | When the last ordinary source action finished, its block disappeared and the `0°` button moved up under the cursor | Measured at 1680, 1366, 1280 and 1024 px wide: the `0°` button covered 24% of `Bruk GML-retning`, its lower 8.5 px. A double-click there accepted `0°` with the warning unread. No overlap at 390 px | The `0°` action ignores `event.detail > 1`. Keyboard and single clicks are unaffected |

The first version of this report said a selection "never falls back to everything". That was only true before the first click, and it was the only condition the tests checked.

Fix 1 also covers holding Enter on a selection-scoped button, by construction; that was not tested separately. Fix 2 protects only the `0°` action. Elsewhere, a second click landing on moved content can at most fold a group or tick a row.

---

## 8. Photographer, delivery information and placement

- **Fotograf:** `Bruk EXIF-fotograf for {n} bilder`, manual entry with names already used in the layer as suggestions, and `Rediger…` per photo. For Gemini and AsBuilt the panel says `Fotograf eksporteres ikke til dette målet. Verdiene blir i appen.`
- **Leveranseopplysninger:** the seven existing fields, using `EXPORT_CONTEXT_FIELDS`, `ASBUILT_CODES` and M2's `invalid-context` messages. `Datafangstdato` is never prefilled, and a test confirms an accepted capture time does not supply it.
- **Plassering:** shows the count and names each unplaced occurrence. It offers one route, `Koble og posisjoner bilder…`, using the same close-and-open pattern as `Kilder og koblinger`. There is no return flow, and the panel says the tool will close. Placing single photos is explained in text and has no button.

---

## 9. Session state

`photoExportConfigs` is a `Map(layerId → { profile, crs, context })` in `page.js`. It is reconciled on every session publish, which covers both layer deletion and `clear()`. It keeps its identity when nothing is removed, so ordinary publishes cause no extra renders. A browser test confirms nothing reaches `localStorage` or `sessionStorage`. `label` was left out as it is not needed until M5/M6.

---

## 10. The existing export dialog

My first version shared profile, CRS and context, so a profile chosen anywhere was remembered. The full browser run caught this: `photoLoadedGmiUi` pins that the dialog opens with no profile selected. That is existing behaviour, so I narrowed the change rather than the test.

- **Shared:** AsBuilt context only, in both directions. Without this, values entered under `Leveranseopplysninger` would not reach an export.
- **Not shared:** profile and CRS. They are chosen in the dialog each time, as before.

One visible change remains: AsBuilt context entered in the export dialog now survives closing it, where it used to be lost.

---

## 11. Verification

**Everything below was rerun on the final code, on a production build of it, with saved logs.** No result is carried over from the first version. Runs set `PHOTO_UI_URL=http://localhost:3110` and `PHOTO_GML_FIXTURE`, with `--test-concurrency=1` for browser suites.

| Check | Covers | M2 baseline | Final |
|---|---|---|---|
| New M3 domain tests | Hub model, selection, corpus | n/a | **28 of 28 pass** |
| New M3 browser tests | Hub in real Chrome, corpus to ZIP | n/a | **12 of 12 pass** |
| Domain selection (138 files) | Everything without a browser, including M3 | 1,439: 1,429 pass, 6 fail, 4 skip | **1,471: 1,461 pass, 6 fail, 4 skip** |
| Export gate (16 files) | M3, M0 goldens, M1 capture time and evidence, M2 readiness and parity, serializers, package, Gemini compatibility | n/a | **264: 263 pass, 0 fail, 1 skip** |
| Photo/GMI browser selection (19 files) | FOTO workspace regressions, including M3 | 85: 84 pass, 1 skip | **93: 92 pass, 0 fail, 1 skip**, 357 s |
| Gemini browser + `geminiWorkflowUi` (6 files) | Gemini WFS regressions | 107 of 107 | **107 of 107** |
| `terrainPhotoGml` | n/a, see below | 1 fail | 1 fail, same error |
| Production build | | Pass | Pass, exit 0 |
| ESLint, 17 changed and new files | | 0 errors | 0 errors, 0 warnings, empty output |
| `git diff --check` | | Clean | Clean |

**Comparing these with earlier reports.** Counts differ from the first version of this report (1,467 domain, 90 browser) for two reasons, and I checked each one per file:

- **Two new browser tests**, for the double-click blockers.
- **A different split of the same files.** `statsChartUi` (5 tests, previously in no group) is now in domain, and `photoDialogLayout` (1 test) moved from domain to browser. Domain: 1,467 + 5 − 1 = 1,471. Browser: 90 + 2 + 1 = 93.

The M2 browser baseline of 85 also counted `geminiWorkflowUi`'s 5 tests, which now sit only in the Gemini group. The export gate has 16 files because the first version's list of 15 could not be recovered, so its 244 is not comparable.

**The M1 corpus result holds:** 148 eligible EXIF times with matching GML and zero false conflicts, in Node and in the real app. The ZIP check passes after the double-click steps.

**Not run:** the external XSD harness. No serializer or plan code changed and the goldens pass, so it would be comparing identical output, but this is inferred rather than re-measured. Browser suites were not run on a clean `4dab238`.

### Existing failures, new regressions and skips

**No new regressions.**

- **6 domain failures, all existing:** three `validationV2WorkspaceInspector`, two `statsUiContract`, one `appInfoUiContract`. Rerun on a pristine `git archive` of `4dab238` in this pass: those three files gave 22 tests, 16 pass, and the same 6 fail by name.
- **`terrainPhotoGml`, existing:** it fails with `Failed to fetch dynamically imported module` before any check runs, so **it gives no coverage**. The M2 report records the same failure; it was not rerun on `4dab238`.
- **4 domain skips:** three GMI corpus tests that need `GMI_PHOTO_CORPUS` or `GMI_PHOTO_EKENES`, and the `REF_FILES` comparator. The comparator is also the export gate's 1 skip.
- **1 browser skip:** the private G01/G04 suite.

### Defects found during verification

| Found by | Defect | Fix |
|---|---|---|
| Screenshot | `Lukk` was invisible: white on white, from two competing background classes. The assertions passed | Primary button styling; a legibility check added |
| Screenshot | `1 uplasserte bilder` | Reworded so it reads correctly for any count |
| Layout test | 3 px of hidden overflow at 390 px from an `sr-only` span escaping the nav scroller | `position: relative` on the task button |
| Full browser run | Export dialog remembered its profile (§10) | Sharing narrowed to context |
| Full browser run | Focus tooltip on `Verktøy` after the hub closes interfered with the next test step | Test now asserts the focus return, then blurs. This is intended behaviour, matching the menu's Escape path |
| Resume review | Double-click widened a selection to every row (§7) | Used selection keeps narrowing; browser test, corpus step, domain assertions |
| Resume review | Double-click could reach the `0°` action through a layout shift (§7) | `0°` ignores a second click; browser test |

One assertion in the M3 capture-time browser test changed with the first fix. It pinned the old behaviour, where the strip vanished after use; it now checks that `Valgt` is 0 and clears the selection.

---

## 12. Browser acceptance still needed

Automated at 1920×1080, 1366×768, 1280×720, 1024×600 and 390×844: the dialog stays inside the viewport, there is no horizontal overflow, the header and footer stay in view, and the panel keeps at least 150 px. At phone width the task list runs along the top, and the nested dialog fits.

I reviewed screenshots of the main screens, including the corpus at 1366×768, but they predate the last copy and sharing changes and the used-selection strip. **No person has reviewed this.** Please check:

| Where | Check |
|---|---|
| Whole flow | One manual corpus run: complete, then export |
| Used selection | Whether `Ingen av de valgte gjenstår…` and the disabled `0 valgte` button make the next step clear, especially at phone width |
| Focus and Escape | Keyboard-only run through the hub and nested dialog, including Save/Discard entry from Edit mode |
| `Sekundene er 00` | Whether the checkbox and its wording read clearly |
| `0°` block | Whether one deliberate click is enough protection for 148 placements, given there is no undo |
| Repeated `0° kan bety…` rows | Accurate, but repetitive at 148 rows |
| Phone width | The task list scrolls sideways, so later tasks start out of view |

---

## 13. Decisions beyond the approved plan

| # | Decision | Why |
|---|---|---|
| 1 | `sourcePending` added to direction items in readiness | `tasks.direction` did not expose it, and reading it elsewhere would duplicate the rule |
| 2 | Source actions wait for pending EXIF, including GML and `0°` | Accepting GML first could hide a conflict or a real heading |
| 3 | Manual fill requires a selection | The plan's label says `valgte`; prevents one value silently reaching all photos |
| 4 | `Plassering` is always listed, with a check when done | The brief lists it as a task; the plan showed it only when needed |
| 5 | Only context is shared with the export dialog | §10 |
| 6 | Native `close` handled on both dialogs | §4 |
| 7 | Status line in the footer | Shows schema gaps without building the M6 level block |
| 8 | No `Gå til eksport` button | The brief asks only for closing and returning to the workspace; it fits M6 |
| 9 | No CRS control in the hub | Nothing in completion depends on it; the default keeps readiness valid |
| 10 | Counts label is `Må vurderes`, not `…enkeltvis` | The `0°` group can be accepted together, so "individually" would be wrong |
| 11 | A used selection keeps narrowing until cleared | §7. Costs one extra click when moving from a selection to everything |
| 12 | The `0°` action ignores a double-click | §7. No undo exists for accepted direction in the hub |

---

## 14. Known limitations

- **Target does not reach the export dialog** (§10). M6.
- **Direction conflicts need typed values** (§6). Choosing one source would need a new domain action.
- **No in-hub change or undo of accepted direction**, including GML `0°`. Only the map's Edit mode can replace it.
- **Manual direction on one row is recorded as bulk** (`Manuell (samme verdi for flere)`), because `fillMissingPhotoValues` is the only existing non-Edit route. The `direction-bulk` recommendation still needs 2+ matching values, so it does not misfire.
- **Unplaced photos are out of scope for time, direction and photographer** until placed, as in the plan. A layer with nothing placed shows `Ingen plasserte bilder ennå.` Each panel says how many are left out.
- **Rows are not virtualized.** Fine at 148. Much larger layers have not been measured.
- **F17 is shown in the hub only.** The export dialog still allows a schema-gap download without saying so, until M6.
- **Pending EXIF in the browser test is held by patching `FileReader`**, which simulates a slow read through the real path.
- **Offsets and EXIF direction are still proven on synthetic files only**, because the corpus has neither.
- **The photographer task says `Ingen kildeverdi` while EXIF is still being read**, because readiness does not classify photographers. It corrects itself when the read finishes. Manual entry stays possible meanwhile.

---

## 15. Remaining responsibilities for M4

- `photoExportFlow`, with filter save and restore.
- `Plasser på kartet` and `Angi på kartet` routes from the hub: close, set the filter, select the first match, and enter Edit mode through `requestWorkspaceAction(enterPhotoEditMode)`.
- Command-bar context: `Mangler retning: {n}`, `Neste`, `Tilbake`.
- Return through the Save/Discard boundary, reopening the hub on the same task.
- Positioning wizard return through its `onClose`. Today `Koble og posisjoner bilder…` closes the hub and stays closed.
- Replacing the text pointer in `Plassering`, and the accepted-direction correction route, with those handoffs.

M4 can use `model.placement.rows`, and `model.direction.rows` for missing directions. Staged values stay invisible to readiness, and the boundary test in `photoCompletionUi` already protects the entry side.

The real Gemini gates G1–G3 are unchanged and still need someone with Gemini VA access.

---

## 16. Reproduction

```
npm run build
npx next start -p 3110

$env:PHOTO_UI_URL='http://localhost:3110'
$env:PHOTO_GML_FIXTURE='C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml'

node --loader ./tests/esmJsLoader.mjs --test tests/photoCompletion.test.mjs
node --test --test-concurrency=1 tests/photoCompletionUi.test.mjs
```

Set `PHOTO_SCREENSHOT_DIR` to keep screenshots of each screen and viewport.

---

## 17. Conclusion

**M3 is ready for Git review.**

- All areas of the resume brief were reviewed against the plan. The two blockers found are fixed and have regression tests.
- There are no new regressions. The only failures are the six domain failures and `terrainPhotoGml`, all existing (§11).
- No M4–M6 work was added. Protected export files are unchanged, apart from the additive `sourcePending` in readiness.
- Nothing was committed, pushed or deployed.

Git review does not replace the human browser checks in §12 or the real Gemini gates G1–G3.
