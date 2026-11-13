# G8 follow-up completion: linked Tema/S_FCODE in the individual object editor

Completed 2026-11-13, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`.

**Git state:**
- **Start:** HEAD `c96bcc4`. The laptop-layout correction was already committed. The only untracked file was the [roadmap audit](20261113-182754-rettinger-roadmap-reconciliation.md), which was read but not modified.
- **End:** HEAD is still `c96bcc4`.
- **Publication:** nothing was staged, committed, pushed or deployed.

## 1. Root cause and outcome

**Root cause.** `GmiObjectEditor` built one form row per physical column. It never consulted G1's `linkedSourceKeys`, so Tema and S_FCODE were edited independently, including through B3 «Rett én og én».

An edit to one of the two columns produces `TEMA_CONFLICT`, which is classified as SJEKK. The editor's only review gate checked for new FEIL, so such an edit could be staged without any confirmation. A Node test now demonstrates this: a lone `S_FCODE` edit introduces `TEMA_CONFLICT` only as a new SJEKK.

A second, related gap: when the pair is ambiguous (for example a duplicated `S_FCODE` column), the `Tema` column alone was still reported as editable `linked-tema`. It could therefore be edited alone.

**Outcome.** When G1 identifies the accepted pair, the object editor shows one logical **Tema** row with one control:
- The control offers only the geometry's authoritative Tema code list.
- Neither physical column has its own control.
- Staging writes one ChangeSet covering both cells. The ChangeSet is verified to be complete, or it is refused.
- The review always requires explicit linked consent, in addition to the unchanged new-FEIL gate.

Files whose schema has only Tema or only S_FCODE keep the existing single-column behaviour.

## 2. Implementation

### Shared G8 code (one safety policy, not two)

Two helpers in `src/lib/gmiEditFields.mjs` are now used by both the G8 batch planner and the object editor:

- **`gmiLinkedTemaPair(view, scope)`** resolves the accepted pair from `describeGmiEditColumns`.
  - It returns `null` when the schema has no pair.
  - It fails closed with `field-binding-unresolved` unless exactly two unique columns are bound, each editable, `linked-tema` and not `AMBIGUOUS`.
  - It replaces the planner's former inline check. That check only lacked the extra `AMBIGUOUS` guard; everything else is equivalent.
- **`gmiLinkedTemaChangeSetComplete(changeSet, keys, objectCount)`** is the fail-closed post-build check.
  - Every linked physical cell must be accounted for as changed or unchanged; none may be skipped.
  - Both cells of each object must end with the same lexeme.
  - It replaces the planner's former count-only check, which was weaker: it did not verify equal values.

`gmiFieldBatchPlan.mjs` changed in these two places only. Its behaviour, tests and assertions are otherwise unchanged; the G8 Node and production suites still pass.

### Object form

- **`gmiLinkedTemaGroup(rows, pair)`** (`gmiEditView.mjs`) is a pure helper that builds the logical field over the object's physical rows. It provides:
  - the physical originals and effective values
  - whether either set disagrees
  - changed/touched state, and a deduplicated history ordered by ChangeSet
  - the domain
  - a refusal reason when a partner is missing, ambiguous or uneditable
- **`planGmiObjectForm(rows, drafts, encodingClass, linked = null)`** has a new optional fourth argument. For the linked group:
  - Both physical drafts must be present and identical. Otherwise it reports `linked-tema-split` and requests nothing.
  - An uneditable group reports its reason and requests nothing.
  - The value must be in the geometry's code list (`restrictEnumeration: true`). The only exception is the common delivered original, which allows «Bruk original» when the two originals agree.
  - Both physical keys are always placed in `values`, including a partner that is already correct. The ChangeSet then reports that partner as `unchanged` instead of omitting it.
  - The pair counts as one logical edit. For example, the button reads «Se gjennom (1)».
  - Overwrite is required only for partners that actually change and whose delivered value is populated.
  - An earlier correction on **either** cell requires «Erstatt tidligere rettinger». This is G8's whole-object conflict policy, and it applies even when that cell is a no-op.

### Component (`GmiObjectEditor.js`)

**One logical «Tema» row,** labelled «Tema + S_FCODE»:
- **Control.** One existing `GmiFieldValueInput` (object variant, `strictListed`). For points the code list is longer than 12 entries, so it is the existing searchable combobox. Its value is the common value. When the values disagree it starts empty, so no value is invented.
- **Values shown.**
  - Original column: both physical originals.
  - Value column: both current («nå») values whenever the pair is staged or disagrees, plus a «Ulike verdier» badge when they disagree.
- **Existing conventions are kept:** «Ikke lagt til», «Foreslått · cs-N», «Vis retting», «Bruk original» and «Angre skrivingen».
- **Explanation.** «Tema og S_FCODE oppdateres sammen med samme kode.» is shown and linked through `aria-describedby`.
- **FOTO warning.** While a draft exists, the exact existing G8 FOTO warning is shown.
- **Ordinary fields** render and plan exactly as before.

**`buildReview`** refuses with «Tema og S_FCODE kan ikke rettes sammen sikkert for dette objektet. Ingen av feltene ble endret.» when:
- a linked value was requested but the group is not editable, or
- either key is missing from the request, or
- the built ChangeSet fails `gmiLinkedTemaChangeSetComplete`.

That last check covers M2's skip outcomes: `conflict`, `populated` and the pre-skipped `object-not-editable`. Identity mismatches are already rejected by M2 for every request.

**Review:**
- **Changed cells.** The existing table lists the changed physical cells.
- **No-op partner.** A no-op linked partner appears as an extra row marked «Allerede riktig».
- **Linked section:**
  - The atomic/undo sentence and the FOTO warning.
  - **Løser N funn i Validator** (for example `TEMA_CONFLICT`).
  - **Forslaget gir N nye SJEKK i Validator.**
  - A one-line count of Tema-dependent checks that can now be assessed.
  - The consent checkbox «Sett både Tema og S_FCODE til «X»».
- **Gating.** «Legg til retting» requires linked consent **and** the existing new-FEIL consent when there are new FEIL. Neither consent substitutes for the other.

**Consent invalidation:**
- Consent is part of the review object.
- «Tilbake» discards the review. Any change of value creates a new, unchecked review.
- Staging, undo or redo changes `stateKey`, which makes the review stale through the existing mechanism.
- The editor is keyed by object, session and form revision, so changing object or session remounts it.

### Validator consequences (`gmiEditValidation.mjs`)

**`gmiEditObjectReviewConsequences`** reuses `gmiEditObjectDiagnostics` and returns:
- `newErrors` and `newChecks`, computed per severity with exactly the previous semantics
- `resolved`: rule findings, excluding deferred cross-object rules
- `unblocked`: a count of disappearing «cannot be assessed» dependency notes

`gmiEditObjectReviewErrors` now delegates to it and returns the identical `newErrors`. A test asserts the equality.

No Validator rule, FOTO code, export engine, B3 navigation code or batch inspector UI changed.

## 3. Exact files changed

Application (modified):
1. `src/lib/gmiEditFields.mjs` — `gmiLinkedTemaPair`, `gmiLinkedTemaChangeSetComplete`.
2. `src/lib/gmiFieldBatchPlan.mjs` — uses the two shared helpers (import plus two call sites).
3. `src/lib/gmiEditView.mjs` — `gmiLinkedTemaGroup`, linked planning in `planGmiObjectForm`, four Norwegian messages.
4. `src/lib/gmiEditValidation.mjs` — `gmiEditObjectReviewConsequences`; `gmiEditObjectReviewErrors` delegates.
5. `src/components/gmi-edit/GmiObjectEditor.js` — the logical row, atomic refusal, review consequences and linked consent.
6. `src/components/gmi-edit/gmiEdit.css` — four small layout rules for the linked values, note and review section.

Tests (new):
7. `tests/gmiObjectLinkedTema.test.mjs` — 7 Node tests.
8. `tests/gmiObjectLinkedTemaUi.test.mjs` — production Chrome workflow with 4 subtests.

Documentation (new): this report and six PNGs in `assets/20261113-g8-object/`. No existing test, fixture, expected hash or dependency changed.

## 4. Atomicity and refusal behaviour (tested)

| Case | Behaviour |
|---|---|
| Disagreeing pair, valid code | One ChangeSet with both cells. `objectCount` 1. Byte-exact output. `TEMA_CONFLICT` reported as resolved (point and line) |
| One partner already correct | Changed cell plus `unchanged` partner. Overwrite is requested only for the changing cell |
| Draft for only one column, or different drafts | `linked-tema-split`; nothing requested |
| Partner has no value slot | Group uneditable; nothing requested |
| Duplicated `S_FCODE` (ambiguous) | Pair `field-binding-unresolved`. Tema cannot be edited alone either |
| Wrong `objectId` | Whole request rejected by M2 |
| Skipped, missing or mismatched linked cell in a ChangeSet | Completeness check fails, so the review is refused |
| Earlier correction on either cell, skip policy | Partner skipped as conflict, so refused. With «Erstatt» approval both cells are written. A touched no-op partner still requires approval |
| ChangeSet built before another staged correction | Staging refused (`stale-change-set`) |
| Point code on a line, or line code on a point | `value-out-of-domain`; nothing requested |
| Tema-only or S_FCODE-only file | No pair. Ordinary planning; an out-of-list value is still allowed and Validator-reviewed |
| Undo/redo | Restores and reapplies both cells together; byte-identical to the original or redone output |

Byte verification compares every byte outside the approved value spans with the original, plus trailing bytes, and checks that the source bytes are unchanged. It uses the same independent span check as the G8 tests.

## 5. Verification (final code, fresh production build)

### Passed

- **Focused Node:** `node --test tests/gmiObjectLinkedTema.test.mjs tests/gmiEditWorkspace.test.mjs tests/gmiEditFields.test.mjs` — **50/50**. Also the earlier G8/G5/B3 group: `gmiLinkedTema`, `gmiEditFields`, `gmiFieldBatchPlan`, `gmiBatchReplaceClear`, `gmiEditValidation`, `gmiEditWorkspace` and `gmiIndividualSelection` — **84/84**.
- **Full serial Node** (`node --test --test-concurrency=1 "tests/*.test.mjs"`), rerun after the final code change: **2,224 tests, 2,094 passed, 130 skipped, 0 failed**. The previous report's count was 2,216 / 2,087 / 129. The difference is the 7 new Node tests plus the new browser test, which skips without `PHOTO_UI_URL`.
- **ESLint:** `npx --no-install eslint` over all 7 changed or new JS/MJS files — 0 problems.
- **`npm run build`:** passed («Compiled successfully»), on the final code.
- **Production Chrome gate:** final build, task-owned server on port 3291, `PHOTO_UI_URL=http://127.0.0.1:3291`, serial run — **103 tests, 103 passed, 0 failed, 0 skipped**. Suites:
  - New: `gmiObjectLinkedTemaUi`
  - Previously failing: `gmiR4UxPolishUi`, `gmiValidatorEditingUi`
  - G8: `gmiLinkedTemaUi`
  - B3: `gmiIndividualSelectionUi`
  - G5: `gmiFieldValueInputUi`, `gmiBatchFieldValueInputUi`
  - Object editor and related: `gmiEditValidationUi`, `gmiS5FocusContinuityUi`, `gmiCheckboxSoftFocusUi`, `gmiRettingerSidebarUi`, `gmiValidatorSelectionHandoffUi`, `layerTableRevealUi`
  - Batch: `gmiBatchInspectorUi`, `gmiBatchReplaceClearUi`, `gmiBatchRiskGateUi`, `gmiSelectionProfileUi`
- **`git diff --check`:** passed.

### What `gmiObjectLinkedTemaUi` verifies

1. **One logical control** (point with Tema `LOK` and S_FCODE `ANB`):
   - Exactly one linked row, no S_FCODE row and one control, labelled «Tema».
   - Both originals and both «nå» values are shown, with the disagreement badge, and no common value is invented.
   - Keyboard typing (focus, `Input.insertText "lok"`, Escape) produces `LOK` as a draft and shows the exact FOTO warning.
   - Laptop layout checks and screenshots at 1280×720 and 1366×768.
   - The review shows the S_FCODE change, Tema «Allerede riktig», the FOTO warning, one resolved finding, the dependency count and one new SJEKK, and no new FEIL. Even so, «Legg til retting» stays disabled until the consent checkbox is set with the Space key.
   - After staging, both physical values are `LOK`, the original `ANB` is still shown, and the disagreement badge disappears.
2. **Separate gates:**
   - `KUM` introduces a Kumform FEIL, and each consent alone leaves staging disabled.
   - After «Tilbake», changing the value to `ANB` gives a new, unchecked consent whose label names «ANB».
3. **B3 «Rett én og én»** from a three-point table selection:
   - The compact header is kept: «Rett én og én» and «Avslutt» are on the same row.
   - Every stepped object shows only the linked control.
   - The draft guard: «Avbryt» keeps the draft, and «Forkast skjemaet» advances to the next object.
   - A linked correction is staged with consent, and the object identity is retained.
   - The step navigation stays pointer-reachable, with screenshots at both sizes.
   - «Tilbake til utvalget» keeps all three rows selected.
4. **Undo/redo and download:**
   - Undo restores `LOK/LOK` with no proposed state; redo reapplies `ANB/ANB`.
   - Downloaded through the M10 wizard, verified with `verifyCellChanges` against exactly the five approved cells.
   - The contractor file is unchanged, and there are no runtime exceptions.

### Failures observed during the task (resolved, with evidence)

- **First version of the new browser test.** It expected no new FEIL for `LOK`. Resolving the conflict legitimately unmasks LOK's Bredde requirement (FEIL) and a Byggemetode SJEKK. The Validator behaviour is correct, so I changed the synthetic fixture to include `Bredde=1000`. While investigating, I also found that the resolved list included 10 «cannot be assessed» dependency notes. These are now counted on one line instead of listed.
- **Intermediate grouped gate (pre-final build):** 96/103. All 7 failures were in `gmiValidatorEditingUi` (M5C). The first subtest timed out at `:74` waiting for `batchStep === '1'` after the legacy «Lag retting…», and the dependent subtests failed with it.
  - This matches the intermittent timeout the [layout report](20261113-191035-rettinger-laptop-layout-correction.md) §2.3/§6 recorded before and after its fix, with an unproven cause.
  - That path opens the batch inspector from the Validator. It does not render `GmiObjectEditor`, and my planner change only affects linked Tema requests.
  - On the final build the suite then passed **3/3 standalone** and **8/8 inside the final 103/103 grouped run**.
  - I did not reproduce it at `c96bcc4` in this task, so "pre-existing" rests on the earlier report's evidence, not a new baseline run.
- **History ordering bug, found during self-review.** The «Foreslått · cs-N» pill used the last entry of the concatenated per-cell histories, which might not be the newest ChangeSet. The history is now deduplicated per ChangeSet and ordered. A test is added, and the fix is included in the final build and runs.

### Skipped or not performed

- The 130 Node skips are existing opt-in, private-corpus and environment prerequisites, plus browser suites without `PHOTO_UI_URL`. The selected browser suites were run separately, as listed above.
- No private or contractor data was opened. Synthetic Chrome automation and screenshot review are not real-file acceptance.
- No development-mode (Strict Mode) pass.

## 6. Screenshots (final build, synthetic file)

| View | 1280×720 | 1366×768 |
|---|---|---|
| Linked Tema row with keyboard draft, both physical values, FOTO warning | [form](assets/20261113-g8-object/g8o-form-1280x720.png) | [form](assets/20261113-g8-object/g8o-form-1366x768.png) |
| Review: both cells, resolved/new findings, explicit consent | [review](assets/20261113-g8-object/g8o-review-1280x720.png) | [review](assets/20261113-g8-object/g8o-review-1366x768.png) |
| B3 «Rett én og én», staged linked correction, step navigation | [b3](assets/20261113-g8-object/g8o-b3-1280x720.png) | [b3](assets/20261113-g8-object/g8o-b3-1366x768.png) |

All six were inspected:
- At both sizes there is no horizontal page overflow, and the form footer is reachable.
- The linked row is taller than an ordinary row: it shows two value lines, the note and, while drafting, the FOTO warning.

## 7. Remaining risks and manual acceptance

- **Real-file acceptance (not done).** Use a delivered point/line file that has both columns. Cover:
  - a disagreeing pair, an already-agreeing pair, and an earlier single-column staged correction (replace approval)
  - review wording, undo/redo, M10 export, and independent inspection of the intended spans
  - opening FOTO from the same file to confirm the grouping is unchanged
- **Keyboard-only and screen-reader pass.** The combobox label «Tema», the `aria-describedby` note and the consent checkbox wording.
- **Restoring an out-of-domain original.** «Bruk original» is offered only when both originals agree. With disagreeing out-of-list originals, the user must choose a listed code. This is intentional and fails closed; confirm that it is acceptable in practice.
- **Legacy correction paths are unchanged.** «Masseendringer» (`GmiBatchDialog`) and «Lag retting…» were not changed (H5/R7 out of scope). The batch dialog's hydraulic path does not edit Tema.
- **Intermittent M5C/«Lag retting…» timeout.** It recurred once in this task and its cause is still unproven. It warrants a separate investigation, as the layout report recommends.

## 8. Resources

- **Shared build output.** `.next` was rebuilt in place three times; the final build has the final code. Pre-existing `next start` listeners from earlier tasks were left running and not stopped. As in the layout report, these were 3110, 3112 and 3113 (this repository) and 3111 (a scratch folder). The repository servers now serve the rebuilt `.next`.
- **Task-owned server.** Only port 3291 was started by this task; it has been stopped and the port is free.
- **Logs** (`%TEMP%`):
  - Builds: `g8o-build.log`, `g8o-build2.log`, `g8o-build-final.log`
  - Browser gate: `g8o-browser.log` (intermediate), `g8o-browser-final.log`
  - M5C reruns: `g8o-m5c-1.log` to `g8o-m5c-3.log`
  - Node: `g8o-node-full.log`, `g8o-node-final.log`
