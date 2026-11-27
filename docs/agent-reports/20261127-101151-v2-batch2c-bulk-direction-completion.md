# GMI Validator 2.0 — Batch 2C follow-up: FOTO bulk direction delivery (completion)

2026-11-27. `feature/photo-workspace`, HEAD `b2b1b09` (unchanged); the uncommitted [Batch 2C](20261127-091953-v2-batch2c-completion.md) work is kept, and its report is not modified. Agent: Claude Opus. No subagents.

## Outcome

«Fyll inn manglende» with a direction now applies the same delivery rule as an Edit-mode rotation, through the same planner. Automated checks pass. **Manual acceptance is outstanding**: it needs real GMI-linked photos and the exported GML.

## Root cause

`photoSession.fillMissingPhotoValues` wrote `direction` straight into the record and never called the delivery planner. The planner is `positionDeliveryEffects` → `photoPositionDeliveryEffect`, which Batch 2C extended with `rotated`. GMI-linked photos normally carry only the **default placeholder** direction: 0°, `basis.kind === 'default'`, used when no source gives one. «Fyll inn manglende» targets exactly those photos (`planManualPhotoFill`). The filled value was therefore saved, but the occurrence kept its automatic GMI default, and a GMI hyperlink cannot carry the direction.

**Workflow facts.**
- The direction is proposed in `PhotoCompletionDirectionPanel` («Samme retning for valgte plasseringer»: selected rows and one value) and written by `fillMissingPhotoValues`.
- There is no draft. The submit is the confirmation, and closing the hub without submitting writes nothing.
- The value is validated before any write. The write is synchronous and publishes once.
- There is no undo for a direction fill (only estimated capture times have an undo token).
- An occurrence counts as GMI-linked through the existing delivery entry (`linked`, `canTransfer` from a confident association).

## Delivery decision

| Photo before the fill | Before the fix | After |
|---|---|---|
| Untouched automatic GMI default, transferable | Stays GMI; the direction is dropped from the delivery | **Automatic GML transfer**, in the same write and publish |
| Explicit GMI choice | GMI | GMI (kept; the direction is still saved) |
| Explicit or stored GML, or Ikke | Unchanged | Unchanged |
| GMI link not transferable (association not confident) | GMI | GMI |
| No GMI link | Unchanged | Unchanged |
| Protected by an active hyperlink transfer (Rettinger) | Unchanged | Unchanged (excluded from the delivery effect, like every other delivery write under the lock) |
| Real direction already present | Not a target | Not a target (unchanged) |

The GMI object relationship (occurrence key), the GMI candidate and the accepted position record are kept as they are. The fill does not touch position.

## Shared rule (one helper, one planner)

- **New `photoDirectionChangeIsMeaningful(current, degrees)`** in `photoDeliveryChoice.mjs`, used by both `applyPhotoEdits` (Edit mode) and `fillMissingPhotoValues`. A missing direction or the default placeholder counts as no direction, so any value is a change, including 0°, which then means north. The same value as a real saved direction is not a change.
- **Both workflows** pass `rotated: true` to the same `positionDeliveryEffects`. The rule for whether a transfer is proposed is unchanged: only an «untouched GMI default» qualifies (`photoRotationProposesTransfer`).
- **A bulk-filled direction** has `basis.kind === 'manual'` (`mode: 'bulk'`). A later move back to the GMI point therefore does not restore GMI and drop the direction; the Batch 2C guard covers this.
- **One change to Batch 2C behaviour:** confirming 0° in Edit mode for a photo whose 0° was only the default placeholder is now a direction, and so GML. Edit mode cannot actually stage that case, because the staged value equals the baseline and is removed. It is reachable only through the session API, and the bulk fill depends on the same rule. The 2C test that assumed «no rotation» here was reworded to state the new rule. The «same real direction again changes nothing» check is kept, now on a photo with a real direction.

**UI.** The hub's status line adds «n plasseringer overføres til GML, fordi retningen ikke kan leveres i GMI.» only when a transfer happened. Pills, markers and counts follow the published state.

**Explicit GMI with a direction.** There is no existing message saying that an explicit GMI choice cannot deliver the direction, so there was nothing to preserve. None was added, to stay within scope. *Recommendation:* if wanted, add a short note in the inspector's «Samlet levering» section for an explicit GMI occurrence with a manual direction.

## Changed files (this follow-up)

- `src/lib/photos/photoDeliveryChoice.mjs`: `photoDirectionChangeIsMeaningful`, plus the `isDefaultPhotoDirection` import.
- `src/lib/photos/photoSession.mjs`: `applyPhotoEdits` uses the shared helper; `fillMissingPhotoValues` plans and applies the delivery effects and returns `transferIds` and `delivery`.
- `src/components/photos/PhotoCompletionDirectionPanel.js`: the transfer note in the status line.
- `tests/photoDeliveryDefaults.test.mjs`: one new session test, helper assertions in the pure test, and the 2C rotation test restated (see above).
- `tests/photoDeliveryDefaultsUi.test.mjs`: the bulk fill in the real hub.
- Report: this file and [screenshot](20261127-101151-v2-batch2c-bulk-direction/defaults-bulk-direction-1366x768.png).

Not changed: import errors, export naming, version information, layer marking, styling, export code, GMI bytes, identifiers and fixtures.

## Tests

The new session test (`bulk direction: …`) covers:
- **Several photos in one operation**, with a mixed selection: two untouched defaults → GML; explicit GMI, explicit GML and unlinked unchanged; the direction is written to all five.
- **Failure:** values 400, −1, «nord» and `null` are refused with no write and no delivery change.
- **No-op:** an empty selection changes nothing.
- **Other fields:** photographer and capture-time fills have no delivery effect.
- **Repeat:** filling again adopts 0, transfers nothing and leaves the delivery `stateKey` unchanged.
- **Provenance:** the occurrence key and position record are unchanged.
- **Move rules:** a move back to the GMI point after the fill keeps GML. A move away of an untouched photo still transfers, and its plain return still restores.
- **Export:** `gemini-legacy2019` GML of the transferred occurrences gives `retningsverdi` 45, 45, 45.

Pure assertions cover the helper: missing or default → change; the same real value → no change; an exact bulk value against its rounding; invalid input.

The existing Batch 2C manual tests still cover rotation-only, move-only, combined and explicit cases, and their GML output now gives 0, 123 and 200.

**Cancellation:** the panel has no draft. Not submitting, or closing the hub, never calls the session; this is shown by the existing hub tests and by the absence of any write path.

| Check | Result |
|---|---|
| `photoDeliveryDefaults` + `photoInspectorPresentation` | 23 passed |
| FOTO, delivery, export, GMI-photo, hyperlink and wizard-transaction Node set (all non-browser files matching those areas) | First run: 1,118 tests, 1 failed (my doc comment named session write functions, which `photoInspectorPresentation` forbids in that module; the comment was reworded, the test is unchanged), 8 skipped. After the fix both affected files pass; the rest of the set had passed |
| ESLint on the four changed files | 0 errors, 0 warnings |
| Isolated production build `%TEMP%/gmi-2c-build` (sources synced, `.next` removed), `npm run build -- --webpack` | Exit 0; `src/` identical to the working tree |
| `photoDeliveryDefaultsUi` (with the bulk case), port 3221 | 1 passed |
| Escalated browser set, 38 files (`deliveryWizardUi`, all `photo*Ui` including `photoCompletionUi` and `photoLoadedGmiUi`, `photoDialogLayout`, `gmiPhoto*Ui`, `layerAnalysisUi`, `gmiEditDraftGuardUi`, `wizardNavigationUi`) | **201 tests: 190 passed, 0 failed, 11 skipped** (private corpus, `next dev`, optional fixture) |
| `git diff --check` | Exit 0 |

**Omitted:** the full Node suite; the shell, import, version and Gemini WFS browser suites (not touched by this follow-up; they passed in 2C); real files; Gemini VA. The bulk test was not run against pre-fix code, but before the fix the bulk path had no delivery call, so the transfer assertions could not hold.

## Remaining risks

1. Photos protected by an active hyperlink transfer still receive a bulk direction (existing behaviour) but keep their delivery state. Whether a bulk direction should be refused for them, as Edit mode does, is a separate pre-existing question and is not changed here.
2. A bulk fill has no undo. Its delivery transfer is undone only by choosing GMI explicitly; that choice is then kept, and the direction is not delivered.
3. Users who fill 0° to «confirm» a default will now get GML for untouched GMI defaults. This follows from treating 0° as north, as the form already states.

## Manual acceptance

With a real GMI-linked photo layer:
1. In «Fullfør opplysninger» → Retning, select some standard-0° placements, give a direction and apply. Check the status line, the pills (GMI → GML), and that unselected photos and explicit GMI photos stay as they were.
2. Repeat the fill (nothing changes). Move one of the filled photos back onto its GMI point and save (it stays GML).
3. Export «Samlet levering»: the GML contains the filled direction, and the GMI link is removed only for the transferred photos. Import into Gemini.

## Git

Nothing was staged, committed, pushed, reset, restored, stashed or cleaned. The Batch 2C changes, its report and its screenshots are intact. `tests/photoDeliveryDefaults.test.mjs` was returned to CRLF after a `sed` edit; the index stays LF. The task-owned server on port 3221 (`%TEMP%/gmi-2c-build`) was checked by command line and stopped; no other server was touched.
