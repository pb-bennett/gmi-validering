# GMI Validator 2.0 — legacy cleanup L2a: «Lag retting…» retired (completion)

2026-11-28, Europe/Oslo. `feature/photo-workspace`, HEAD `c9ec119` (unchanged). Agent: Claude Opus. No subagents.

Source: [investigation report](20261128-165647-legacy-workflow-cleanup-investigation.md), §4.1 (V-1, V-2), §5 (L2a), §6 (Q1) and §7.

## Outcome

- The Validator «Lag retting…» workflow and its restricted «R5» selection have been removed.
- The integrated route is now the only way from a Validator finding to Rettinger: «Vis» → object table → select → «Åpne i Rettinger (n)». It is unchanged.
- **Automated checks:**
  - expanded Node set: 696 passed, 0 failed, 8 skipped;
  - expanded browser set (29 suites): 180 passed, 0 failed, 0 skipped;
  - production build passes;
  - lint: no new findings;
  - `git diff --check` passes.
- **Still to do:** manual acceptance on a real GMI file (below). It is required before commit.

**Not changed:**
- «Masseendringer» (L2b) and the draft-guard wording;
- FOTO, import and export;
- styling;
- the five protected test files and the earlier reports.

## Removed

| Removed | Where |
|---|---|
| Button «Lag retting…» in an expanded Validator rule, with its `canCorrect`/`onCorrect` props | `ValidationV2RuleList.js` |
| `currentCorrectionSource`, `correctable`, `startCorrection` (async session open, basis-race check, correction preparation and handoff) and their imports | `ValidationV2Workspace.js` |
| `CORRECTABLE_RULES`, `isCorrectableMissingFinding`, `prepareValidatorCorrection`, `VALIDATOR_CORRECTION_BASIS_CHANGED`, `validatorCorrectionBasisCurrent`, `validatorCorrectionSelection`; the `evaluateGmiBatchEligibility` import | `gmiValidatorEditing.mjs` |
| The store's non-handoff `correction` branch: the `validatorCorrectionSelection` call, `gmiEditWorkspace.correction`, and the forced `'original'` table view | `store.js` `openGmiEditWorkspace` |
| Shrink-only selection semantics (`origin.kind === 'validator'`): the `restricted` checks, the `make-ordinary` action, and «clear keeps an empty locked selection» | `gmiEditSelection.mjs` `reduceGmiEditSelection` |
| «Fra Validator: n objekter · bare fjerning tillatt», the button «Gjør om til vanlig utvalg», the cross-geometry lock, and the bar shown with zero objects for R5 | `LayerDataTable.js` |
| The `correction` selector, the `enterCorrection` effect, and `correction` in the initial `batchInspector` and table-tab defaults | `GmiEditWorkspace.js` |
| The unused `correction` prop and its dead branches («Fra Validator: n eksakte objekter …», the field lock, the target override, the stale-correction check). The dialog was always mounted without it | `GmiBatchDialog.js` |

`openGmiEditWorkspace(layerId, request)` now accepts only `null` (ordinary Rettinger) or a `kind: 'validator-selection'` request. **Any other request now fails closed:**
- it returns `{ ok: false, code: 'stale-session', message: VALIDATOR_CORRECTION_STALE }`;
- it sets `gmiEditHandoffError`;
- it publishes nothing else.

The parameter is renamed from `correction` to `request` inside that one function. The `validator-selection` checks, their order, and the committed keys are unchanged.

Selections are not persisted (`partialize` in `store.js`), so no old `origin.kind === 'validator'` can come back after a reload.

## Kept (verified callers)

**In `gmiValidatorEditing.mjs`:**
- `validatorSelectionHandoff`, `VALIDATOR_CORRECTION_STALE`;
- `gmiValidatorReturnTarget`, `gmiValidatorDefaultDataset`, `GMI_VALIDATOR_DATASET_BY`;
- `buildGmiValidationComparison`, `isCurrentGmiComparison`, `validatorCheckCount`;
- `validatorInspectionLayer`, `compareGmiValidationRuns`.

**Workflow unchanged:**
- the H3 store handoff, guard and post-guard recheck;
- the H4 return paths: «Tilbake til Validator», «Kontroller i Validator (Foreslått)», «Åpne Validator»;
- `GmiBatchInspector`, the object editor, and «Rett én og én»;
- full comparison and revalidation;
- `correctionError` and its rendering in `ValidationV2Workspace`, which «Gjennomgå i FOTO» uses;
- ordinary Rettinger entry (`LayerPanel` → `openGmiEditWorkspace(layerId)`);
- «Masseendringer» / `GmiBatchDialog` (L2b).

## Changed files

**Application (8 files; +34/−155 lines):**
- `src/components/validation-v2/ValidationV2RuleList.js`
- `src/components/validation-v2/ValidationV2Workspace.js`
- `src/lib/gmiValidatorEditing.mjs`
- `src/lib/store.js`
- `src/lib/gmiEditSelection.mjs`
- `src/components/LayerDataTable.js`
- `src/components/gmi-edit/GmiEditWorkspace.js`
- `src/components/gmi-edit/GmiBatchDialog.js`

**Tests (10 files):**
- `tests/gmiValidatorEditingUi.test.mjs` (M5C, migrated)
- `tests/gmiValidatorEditing.test.mjs`
- `tests/gmiEditWorkspace.test.mjs`
- `tests/gmiEditSelection.test.mjs`
- `tests/gmiSelectionProfile.test.mjs`
- `tests/gmiIndividualSelection.test.mjs`
- `tests/validationV2GmiA7.test.mjs`
- `tests/validationV2RuleCountsBrowser.test.mjs`
- `tests/browser/validationRuleCountsApp.js`
- `tests/rettingerPhotoVisibilityUi.test.mjs`

**Report:** this file and [screenshots](20261128-174818-legacy-cleanup-l2a/).

Each file kept its existing line endings.

## Test migration

### Browser: M5C (`gmiValidatorEditingUi`)

Every case was kept or re-pointed. The entry was «Lag retting…». It is now «Vis detaljer: SDR» → the SJEKK diagnostic «… mangler SDR. Objektene er ikke registrert som NYTT …» → header «Velg alle» → «Åpne i Rettinger (3)».

On the M5C fixture this diagnostic gives exactly lines 0, 6 and 7, the same three that «Lag retting…» seeded. So the downstream assertions are unchanged: two staged lines, «Nye FEIL: 1», «Løste SJEKK: 2».

| Old case and property | Now |
|---|---|
| U1 header layout and date | Unchanged |
| A reference-date change during the async session open → «Validator-grunnlaget endret seg»; no Rettinger; Validator stays | **Equivalent property on the new route.** Select all three lines, then change the reference date. The object table and its selection close, so no «Åpne i Rettinger» remains. No workspace or inspector opens, and Validator stays open. The race itself no longer exists: the H3 handoff is synchronous and rechecks after the guard |
| Exact scope [0, 6, 7]; empty field and value; field enabled; fill-missing default; no staging action at setup; no counts; line geometry; Foreslått/Kun endrede disabled and cannot change the selection | Unchanged assertions. «Fra Validator: 3 objekter» is replaced by «Tilbake til Validator · SDR · 3 objekter valgt i Validator» |
| — | **Added:** «Lag retting…», «Gjør om til vanlig utvalg», «Fra Validator» and «bare fjerning» are absent. This is checked in the expanded SDR rule, where HEAD shows the button, and in the selection bar |
| «Filtrert visning»: checkbox, header and «Velg alle» cannot widen (shrink-only) | **Deliberately inverted** (the behaviour was removed). A new case shows that the selection widens to 4 and narrows back to [0, 6, 7]. Provenance is kept and nothing is staged |
| Review, excluding one line, staging behind the risk approval, full comparison «Nye FEIL: 1 / Løste SJEKK: 2», layout at both sizes | Unchanged (shots renamed `l2a-handoff-inspector-*`) |
| Undo and redo invalidate the full result | Unchanged |
| Foreslått/Original inspection, the guarded «Åpne Validator», H4 Foreslått default | Unchanged |
| Remaining exact target on Foreslått via «Lag retting…» → «Fra Validator: 1» → «Gjør om til vanlig utvalg» → widen | On Foreslått the diagnostic lists only line 7, and «Åpne i Rettinger (1)» opens the object editor for `line:7`. Asserted:<br>• the table view stays Foreslått;<br>• provenance «SDR · 1 objekt valgt i Validator»;<br>• the editor shows the original lexeme (a lone space) with no draft or review;<br>• no batch inspector;<br>• another object can be added with no conversion step;<br>• the ChangeSet count is unchanged |
| New comparison problem opens its rule in Foreslått | Unchanged |
| Another layer: no proposed state, no «Lag retting…» | Kept. Also asserts that no selection bar carries over |
| Input bytes unchanged; no page exceptions | Unchanged |

### Node and browser contract tests

| Retired test (behaviour removed) | Where the safety property lives now |
|---|---|
| `gmiValidatorEditing`: allow-list of three rules; exact targets; no value chosen; current eligibility excludes a staged fill | `gmiValidatorSelectionHandoff` H3 (exact keys and order; no `canonicalFieldId`, lexeme, preview or ChangeSet). `gmiEditBatch.test.mjs:216` («populated earlier proposal»). `gmiBatchInspector.test.mjs:197,261` (populated skips) |
| `gmiValidatorEditing`: scope stays narrow through the preview | `gmiSelectionProfile.test.mjs` («preview stays valid for the narrowed subset and rebuilds exactly that subset») |
| `gmiValidatorEditing`: a missing column or populated value cannot seed the shortcut | `gmiFieldBatchPlan.test.mjs:166` and `gmiEditBatch.test.mjs:117` (`field-absent`); `gmiBatchInspectorUi` («Finnes ikke i filen» disabled); populated skips as above |
| `gmiValidatorEditing`: read-only → `document-not-editable` | **New test:** the H3 handoff refuses a read-only source. A control shows that the same request is accepted on the editable source, so only `editable` differs. This was not covered before |
| `gmiValidatorEditing`: R5 identity refusal matrix | The H3 refusal matrix (`gmiValidatorSelectionHandoff`) covers layer, session, document, fingerprint, indices, duplicates, id and GUID, empty data, and source bytes |
| `gmiValidatorEditing`: «Lag retting…» session-open race | Behaviour removed. Replaced by the M5C date-change case above |
| — | **New:** a check that the six retired helpers are no longer exported and the ten kept ones still are |
| `gmiEditWorkspace`: R5 store handoff, atomic behind the guard, recheck after the guard | H3 store tests: `:765` (one atomic transition, exact keys, no staging, automatic view, ordinary selection); `:806` (the guard publishes nothing while waiting; the recheck covers session, source, selection and inspection) |
| — | **New:** an L2a store test. The old R5 request shape and `kind: 'validator'` fail closed, with and without a mounted workspace, and change no workspace, selection, UI or view state. An H3 handoff waiting behind the guard is refused when the layer is removed |
| `gmiEditWorkspace`: M5C store navigation set `.correction` | Re-pointed to ordinary `openGmiEditWorkspace(id)`, which gives `{ layerId }`. Session and staged edit are retained (rest of the case unchanged) |
| `gmiEditSelection`: R5 shrink-only test | **Inverted:** a handed-off selection widens, shrinks, clears, ranges, selects 80 objects and switches geometry. Provenance survives membership changes, and `make-ordinary` is no longer an action. The old `validator` kind has no special meaning |
| `gmiEditSelection` H1 host test | Sample origin is now `validator-selection`; `make-ordinary` removed from the action loop |
| `gmiSelectionProfile`, `gmiIndividualSelection` | Fixture origin changed to `validator-selection` (no special handling either before or after). The profile test also asserts that provenance survives the narrowing |
| `validationV2GmiA7` source anchor `canCorrect?.(presentation)` | Anchored on `canReviewPhotoLinks?.(presentation)`, plus a check that `canCorrect`, `onCorrect` and «Lag retting» are gone. The sibling-button rule is unchanged |
| `validationV2RuleCountsBrowser` and harness: second action «Lag retting» → «Retting: …» | The second contextual action is now «Gjennomgå i FOTO» → «FOTO: …», plus a check that «Lag retting» is absent |
| `rettingerPhotoVisibilityUi`: direct Validator → Rettinger via «Lag retting…» | The same transition via «Vis detaljer: SDR» → diagnostic → one row → «Åpne i Rettinger (1)». The FOTO-visibility assertions are unchanged |

**Proof that the new assertions detect the old workflow.** The changed tests were also run against an untouched build of HEAD.

| Run on HEAD | Result |
|---|---|
| Node | 4 failed, 72 passed. The failures are exactly the new L2a cases: the export check, the ordinary-selection reducer, the fail-closed store request, and the A7 absence check. The fixture-only updates pass on both |
| Migrated M5C | Fails at the «Lag retting…» absence check in the expanded SDR rule (`expected: false, actual: true`); later cases cascade from it |
| Migrated M5C, first version | Passed on HEAD. The absence check was then only called where the button cannot render. I moved it into the expanded rule before accepting the suite |

## Verification

Level: **Expanded**, because the change touches shared editing and store state.

- Isolated build trees:
  - `%TEMP%/gmi-l2a-base`: `git archive c9ec119`, the baseline;
  - `%TEMP%/gmi-l2a-build`: the same archive plus this task's changed files.

  Both use a `node_modules` junction and have no `.env.local`.
- Task-owned servers ran on ports 3231 (baseline) and 3232 (task build).

| Check | Result |
|---|---|
| HEAD baseline, browser: M5C, `rettingerPhotoVisibilityUi`, `validationV2RuleCountsBrowser`, `gmiValidatorReturnUi`, `gmiValidatorSelectionHandoffUi` | 38 passed, 0 failed |
| `npm run build -- --webpack`, task tree | Exit 0. `diff -rq --strip-trailing-cr src`: identical to the working tree, and all changed tests identical |
| Node, serial, working tree. 70 files: every `gmiEdit*`, `gmiBatch*`, `gmiValidator*`, `gmiSelection*`, `gmiIndividual*`, `gmiField*`, `validationV2*`, `wizardTransaction*`, `objectTable*`, `validatorRettinger*`, `gmiRettinger*`, `gmiR4*`, `gmiTable*`, `gmiObject*`, `layerTable*`, `gmiPhoto*` and `rettinger*` file without the `Ui`/`Browser` suffix | **704 tests: 696 passed, 0 failed, 8 skipped** |
| Browser, serial, task build. 29 files: all `gmiValidator*Ui`, `gmiEdit*Ui` (including `gmiEditDraftGuardUi` and `gmiEditBatchUi`), `gmiBatch*Ui` (including the protected `gmiBatchInspectorUi`, unchanged), `gmiSelection*Ui`, `gmiIndividualSelectionUi`, `gmiTableReviewUi`, `gmiCheckboxSoftFocusUi`, `gmiFieldValue*Ui`, `gmiR4UxPolishUi`, `gmiRettingerSidebarUi`, `validatorDataTableSlice3Ui`, `layerDataTableGeometryUi`, `layerDataTableKeyboardUi`, `layerTableRevealUi`, `rettingerPhotoVisibilityUi`, `validationV2RuleCountsBrowser`, `wizardNavigationUi`, `photoHyperlinkReviewUi` («Gjennomgå i FOTO») | **180 passed, 0 failed, 0 skipped** (105 s) |
| ESLint on the 18 changed JS/MJS files | 0 errors, 1 warning. The warning (`react-hooks/incompatible-library`, `LayerDataTable.js:726`) is identical on HEAD for the same files |
| `git diff --check` | Exit 0 |
| Screenshots at 1280×720 and 1366×768 | Expanded SDR rule: HEAD offers `["Vis","Lag retting…"]`, L2a offers `["Vis"]`. Handoff inspector and selection bar fit both sizes. [Folder](20261128-174818-legacy-cleanup-l2a/) |

**Skipped and omitted:**
- The 8 Node skips need the private or optional real corpus. They are not passes.
- Not run: the full Node and full browser suites, FOTO, export, Gemini and import suites (not touched), real files, screen readers and hosted checks.

## Remaining risks and observations

1. **Workflow change for users.** The SDR, Trykklasse and Ringstivhet missing-value fix now takes «Vis» → diagnostic → «Velg alle» → «Åpne i Rettinger», about three more clicks. Neither route preselected the field.
2. **The missing values are SJEKK, not FEIL.** On a line not registered as NYTT, missing SDR is reported as SJEKK. Users must open that diagnostic, not a FEIL one. This is a manual-acceptance point.
3. **`correctionError` is no longer cleared by anything.** Only «Gjennomgå i FOTO» sets it (on failure), and `startCorrection` used to be the only thing that cleared it. A FOTO handoff error therefore stays until Validator remounts. This is the same as before for anyone who did not use «Lag retting…». It was left unchanged to keep FOTO behaviour identical. A one-line reset in `reviewPhotoLinks` is a possible follow-up.
4. **Not caused by L2a:** the 2A residual is still visible. A Rettinger data table stays open, labelled with its file, when Validator switches to another layer (seen in `m5c-other-layer-unavailable`).
5. **L2b dependencies are unchanged:** «Masseendringer», the guard wording, and the protected `gmiBatchInspectorUi` case.

## Manual acceptance (real GMI file) — required before commit

Use an approved real delivery that has lines with missing SDR, Trykklasse or Ringstivhet.

1. Open Validator on that layer, Original. Expand SDR. Confirm that only «Vis» is offered (no «Lag retting…»).
2. «Vis» → open the missing-value diagnostic (SJEKK or FEIL, whichever the file has). Confirm that the table lists the expected lines. Select all, then «Åpne i Rettinger (n)».
3. In Rettinger, confirm:
   - the selection bar shows «Tilbake til Validator · SDR · n objekter valgt i Validator»;
   - there is no «Fra Validator … bare fjerning» and no «Gjør om til vanlig utvalg»;
   - the field and value are empty;
   - «Fyll manglende verdier» is the default.
4. Add one more line with «Filtrert visning», then remove it again. Choose SDR and a value, then «Forhåndsvis», exclude one line, «Legg til endringer» (approve the risk if asked), and «Kontroller endringer».
5. Use «Kontroller i Validator (Foreslått)», then «Tilbake til Validator». Confirm that the corrected lines are gone from the diagnostic on Foreslått.
6. Undo and redo once; the full check must become outdated. Change Kontrolldato with a selection open in Validator; the table and selection must close.
7. Repeat steps 2–3 with a single point finding, which opens the object editor.
8. Export «Last ned revidert GMI» and check the changed values. The original file must be unchanged.
9. Check at 1280×720 and 1366×768.

## Git and processes

- Branch `feature/photo-workspace`, HEAD `c9ec119`, the same at start and end. The index is empty.
- Nothing was staged, committed, pushed, reset, restored, stashed or deleted.
- These files are byte-identical by SHA-256 before and after:
  - the five status-only test files;
  - the two earlier untracked reports;
  - the investigation report.
- New untracked: this report and `docs/agent-reports/20261128-174818-legacy-cleanup-l2a/` (5 PNG files).
- Servers on ports 3231 and 3232 were mine, confirmed by command line before stopping. Both are stopped and the ports are free. No other server was touched.
- `%TEMP%/gmi-l2a-base` (including copies of the migrated tests, `tests/l2a-*`) and `%TEMP%/gmi-l2a-build` remain. In both, `node_modules` is a junction to the repository.

## Summary for ChatGPT review

L2a retires «Lag retting…» and its restricted R5 selection:
- the button;
- `startCorrection`;
- six exclusive helpers;
- the store's non-handoff branch, which now fails closed;
- the shrink-only reducer;
- «Fra Validator … bare fjerning» and «Gjør om til vanlig utvalg»;
- the workspace `correction` entry;
- the dead `correction` prop in `GmiBatchDialog`.

The integrated H3/H4 route is unchanged. On the M5C fixture it reaches the same three lines.

The M5C browser suite is migrated to that route with all its safety assertions. The stale-basis race becomes «a changed reference date closes the selection». Shrink-only is deliberately inverted to «ordinary selection».

New Node tests cover:
- fail-closed foreign requests;
- refusal after layer removal;
- read-only refusal on the H3 route, with a control;
- the retired exports.

On HEAD the new assertions fail. On the change they pass: Node 696/0/8 and browser 180/0/0 (expanded), build OK, no new lint findings.

**Manual acceptance on a real GMI file is outstanding and required before commit.**
