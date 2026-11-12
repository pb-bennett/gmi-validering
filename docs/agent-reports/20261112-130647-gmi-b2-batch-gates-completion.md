# B2 — Batch confirmation gates and current-finding split: completion

Date: 2026-11-12, Europe/Oslo. Branch `feature/photo-workspace`; starting and final HEAD `f62a287632d654b2dfdc070532c64526253b6129` (B1 committed). The work is uncommitted.

## Scope and outcome

Implemented B2 from [the unified workflow plan](20261111-085500-gmi-validator-rettinger-unified-workflow-planning.md) (§4.4 b–c and the B2 entry in §9). It builds on the [B1 profile](20261112-124445-gmi-b1-selection-profile-completion.md), the batch preview and staging code in `GmiBatchInspector`, and `GmiConfirmDialog`.

1. **Current findings («Nå på SDR: 3 FEIL · 1 SJEKK · 0 uten funn»).**
   - **Where:** the line appears after a valid preview, between the proposed-correction box and the profile.
   - **Categories:** each selected, previewed object gets exactly one category. FEIL beats SJEKK, which beats «uten funn». An object whose source cell was refused, so it has no preview findings, is shown as «ikke vurdert» and is never counted as clean.
   - **Narrowing:** «Behold bare FEIL (N)» narrows through the existing shrink-only reducer path from B1 (`narrowSelection` → `changeGmiEditSelection` `remove`). Focus moves to the split label afterwards.
   - **Explanation:** a short note says that a missing value on existing infrastructure may only be SJEKK and need not be corrected.
   - **Keeping in step:** counts follow the selection, because they are re-filtered from the same preview rows. The line disappears whenever the preview is stale, for example after undo/redo, a session change or widening.
2. **Confirmation gates.**
   - **Mixed columns:** staging now also needs the existing risk dialog when the objects that actually change are mixed on any B1 profile column (Tema, Material, Dimensjon, Stedfestingsårsak and the rule context). The dialog names each mixed column with its distribution, for example «Material: PE (3) · PVC (1)», under the existing «Blandet blant objektene som endres: …» sentence.
   - **New FEIL:** the trigger is unchanged (`dryRun.diff.newCounts.fail`). The dialog keeps listing the new or worsened FEIL with their objects.
   - **Direct staging:** a selection that is uniform and introduces no new FEIL (and has no other existing reason) still stages directly.

Unchanged and not done: eligibility, Validator rules, the ChangeSet engine, source bytes and export. B3, H5 and other slices were not started.

## Implementation decisions

- **Which findings count as "for the selected field".**
  - `gmiCurrentFindingSplit(preview, selection)` in `gmiBatchInspectorView.mjs` counts only findings from rules whose `canonicalFieldId` equals the edited column's canonical field. The rule-to-field map comes from `VALIDATION_RULES`.
  - It reads `row.currentFindings`, which both preview paths already compute: the Validator on the current working copy, including staged corrections.
  - Example of what this prevents: an SDR batch does not count Material-required or Ringstivhet findings.
  - A column without a Validator field gets no split.
  - Checked against the real Validator on a synthetic file: missing SDR on NYTT → FEIL, on UENDR → SJEKK, not-applicable (SP) or valid → uten funn, invalid value → FEIL.
- **The mix is computed over the objects that change, not the whole selection.** This keeps G4's deliberate S1 contract that skipped or unchanged objects do not make a batch mixed, and matches the plan's wording "Samme verdi legges på…".
  - The profile is rebuilt with B1's `buildGmiSelectionProfile` over the checked ChangeSet's object keys, on `checked.dryRun.current.dataset`.
  - «(tom)» counts as a value.
  - Absent or ambiguous columns are never mixed.
  - A single changing object is never mixed.
  - G4's existing Tema/edited-field names are kept, and the profile labels are added to them without duplicates.
- **Risk predicate.** `gmiBatchRiskReasons(...)` returns `manual`, `overwrite`, `new-fail`, `mixed` and `unvalidated` reasons. The dialog is required if any reason is present. Manual-override, overwrite/replacement and unvalidated-field reasons are the same as before.
- **Approval tokens.**
  - The existing exact check (`approval.plan !== plan || approval.selection !== selection`) and the live `getGmiFieldBatchApproval` recheck are unchanged.
  - New: before those checks, an approval whose selection is no longer the store's selection is refused with «Utvalget er endret. Se gjennom og godkjenn på nytt.»
  - Why: during a full rerun of the dry run for the changed selection, the old order refused the approval through the generic «Forhåndsvisningen er utdatert» path instead.
  - This adds a refusal; it removes none.
  - Field/value changes still clear the review and risk through `invalidate()`. Session changes still make the preview stale.
- **B1 correction: rule context.**
  - The B1 profile took every `diagnosticFacts.context` entry, which is the whole policy context. So a Merknad batch showed «Rørform» because pipe shape happened to differ, and B2 then gated on it.
  - Rule-context rows now include only the fields the rule itself explains with (`explanationContextFieldIds`; for example SDR → tema, material).
  - Hydraulic class is unchanged.
  - A Node test covers this.
- **Presentation.** The split chips use a new class, `gmi-split-count`, with the same styles as the severity chips. The R4 suite counts `gmi-severity-count` elements as the preview's new-finding counts, and the split counts are a different kind of number.

## Changed files

| File | Change |
| --- | --- |
| `src/lib/gmiBatchInspectorView.mjs` | `gmiCurrentFindingSplit`, `gmiBatchRiskReasons`, `GMI_CURRENT_FINDING_CATEGORIES`. |
| `src/lib/gmiSelectionProfile.mjs` | `gmiProfileMixedColumns`, `gmiProfileDistributionText`; rule context limited to `explanationContextFieldIds`. |
| `src/components/gmi-edit/GmiSelectionProfile.js` | `GmiCurrentFindingSplit` component. |
| `src/components/gmi-edit/GmiBatchInspector.js` | Split memo and render; changing-object profile mix in the gate; dialog distribution list; early stale-selection approval refusal. |
| `src/components/gmi-edit/gmiEdit.css` | Split, `gmi-split-count` and mixed-list styles. |
| `tests/gmiBatchRiskGate.test.mjs` | New: 8 Node tests. |
| `tests/gmiBatchRiskGateUi.test.mjs` | New: production browser suite (3 subtests). |
| `tests/gmiBatchInspectorUi.test.mjs`, `tests/gmiBatchFieldValueInputUi.test.mjs`, `tests/gmiSelectionProfileUi.test.mjs` | Deliberate contract updates, below. |
| This report. | |

### Deliberate test contract updates

Each of these cases now has objects that change and differ on a B1 profile column, which is exactly B2's new gate. No safety assertion was removed.

- **`gmiBatchInspectorUi`, G4 «Merknad set».** The dialog previously had to name only `Merknad`. It now expects «Merknad, Dimensjon» and the distribution «Dimensjon: 160 (1) · 200 (1)». The overwrite assertion just before it is unchanged.
- **`gmiBatchFieldValueInputUi`, G5 «SDR 11 / 11,0 / 11.0».** Staging previously went directly to step 3. It now waits for the risk dialog, asserts that it names Dimensjon, approves, and then continues with the unchanged exact-byte export checks.
- **`gmiSelectionProfileUi`, the B1 «narrow to Tema SP» case.**
  - It previously asserted that the optional dialog contained no «Blandet» at all.
  - The two SP lines still differ in Dimensjon and Stedfestingsårsak, so it now asserts that Tema is not among the mixed columns. That is what the B1 narrowing resolves.
  - The new-FEIL approval in the same dialog is unchanged.

## Checks

| Check | Result |
| --- | --- |
| `node --test tests/gmiBatchRiskGate.test.mjs tests/gmiSelectionProfile.test.mjs` | **15 passed, 0 failed.** |
| Node regression gate (plan §10 set, plus `gmiFieldBatchPlan`, `gmiValidatorSelectionHandoff`, B1 and B2) | **309 total: 296 passed, 3 failed, 10 skipped.** The 3 failures are the documented `validationV2WorkspaceInspector` baseline (sidebar width; workspace-shell placement; map/3D resize). They assert `src/app/page.js` source text, which this task did not change, and the same 3 failed at the B1 baseline. |
| ESLint (all changed/new JS/MJS files) | **0 errors, 0 warnings.** |
| `npm run build` (fresh, after the last source edit) | **Passed.** |
| New B2 browser suite, standalone | **4 passed (1 test + 3 subtests).** |
| Serial production browser gate (22 suites) | First run: **148 total, 133 passed, 15 failed**. Causes (see triage). After the fixes, a rebuild and a full rerun: **148 passed, 0 failed, 0 skipped.** |
| `git diff --check` | **Passed.** The new untracked files were also checked for trailing whitespace. Line endings are consistent (CRLF) in every touched file. |

Triage of the first gate run, kept for transparency:
- **Screenshot directory missing:** the gate's screenshot directory did not exist, so the B2 suite failed to write a screenshot and its third subtest cascaded. Environment only.
- **R4 polish (5 subtests, cascading):** the split chips reused `gmi-severity-count`. Fixed in the source with the new class; the R4 test is unchanged.
- **G4 Merknad, G5 SDR export, B1 SP narrowing:** the intended new mixed gate. Contracts updated as above, after removing the false «Rørform» trigger at its source (rule-context correction).

New Node coverage:
- split precedence, rule-to-field filtering, unselected objects and «ikke vurdert»;
- the split on real preview findings (NYTT → FEIL, UENDR → SJEKK, not-applicable or valid → none);
- «Behold bare FEIL» through the reducer only removing, with counts following the narrowed selection;
- the split after staging and undo, recomputed through a fresh preview, with source bytes unchanged;
- mixed-column distributions, including «(tom)» and absent columns;
- the risk-reason matrix;
- real gate inputs: Material, Dimensjon and Stedfestingsårsak mixed over the changing objects, with a skipped SP line ignored; narrowing to two identical lines gives no reasons, so staging is direct;
- rule-context filtering;
- a source contract that the approval token check is unchanged.

What the B2 browser suite exercised, with synthetic data at 1366×768 and 1280×720:
- **Uniform:** two VL/PE/110/NYTT lines, SDR 11 → split 2 FEIL, no FEIL-narrowing offer, and **direct staging**.
- **Mixed:**
  - four lines → split 3 FEIL · 1 SJEKK.
  - The dialog lists «Material: PE (3) · PVC (1)», «Dimensjon: 110 (3) · 160 (1)» and «Stedfestingsårsak: NYTT (3) · UENDR (1)», and stays within the viewport at both sizes.
  - Cancel stages nothing.
  - «Behold bare FEIL (3)» → 3 selected, split 3 · 0 · 0, focus on the split label, preview still valid.
- **Stale approval refused:** with the dialog open (now only Material and Dimensjon), a line is unticked → «Godkjenn og legg til» is refused with «Utvalget er endret…» and nothing is staged.
- **Shrunk to uniform:** the two remaining identical lines stage **directly**, with no mixed warning.
- **New FEIL:** a custom Material code on two identical lines gets the confirmation without «Blandet», listing the FEIL with objects. Approving stages it.
- **Preview invalidation:** an undo of an earlier correction makes the preview stale, hides the split and disables staging. Redo does not revive the old preview. «Oppdater forhåndsvisning» restores the split.
- The input file is unchanged, and no runtime exceptions occurred.
- Screenshots of the dialog and split at both sizes were inspected. Everything is reachable and there is no horizontal overflow.

Existing manual-override, overwrite/replacement, unvalidated-field, expansion and stale-preview confirmations are covered by the unchanged G4/R4/M5C browser cases in the gate.

Browser gate suites (serial, task-owned `http://localhost:3197`):
- New: `gmiBatchRiskGateUi`
- B1: `gmiSelectionProfileUi`
- H4, H3 and H2: `gmiValidatorReturnUi`, `gmiValidatorSelectionHandoffUi`, `gmiValidatorSelectionUi`
- T1 and G5: `layerTableRevealUi`, `gmiBatchFieldValueInputUi`, `gmiFieldValueInputUi`
- Rettinger standing gate: `gmiEditWorkspaceUi`, `gmiEditDraftGuardUi`, `gmiEditValidationUi`, `gmiValidatorEditingUi`, `gmiLayerFiltersUi`, `gmiEditSelectionUi`, `gmiBatchInspectorUi`, `gmiR4UxPolishUi`, `gmiEditBatchUi`, `layerDataTableGeometryUi`, `layerDataTableKeyboardUi`, `gmiRettingerSidebarUi`
- S5 and Validator counts: `gmiS5FocusContinuityUi`, `validationV2RuleCountsBrowser`

## Remaining risks and manual acceptance

- **Behaviour change to accept consciously:** on real deliveries, Dimensjon and Stedfestingsårsak commonly vary. Most SDR/Trykklasse/Ringstivhet batches over several pipes will therefore now need the risk approval. This is the plan's intent (§4.4c), but it adds one click to batches that used to stage directly.
- **Manual acceptance on the real delivery has not been done** (plan §9 B2: pipes with different Material/Dimensjon, some not NYTT). Automation used synthetic data only, and no contractor or private corpus was opened.
- **Not run:** a `next dev` (Strict Mode) pass, and the full serial Node suite (`tests/*.test.mjs`). B2 does not touch `store.js`, Validator rules or shared editing logic.
- **Possible follow-ups, not done:**
  - The split offers narrowing only for FEIL, as specified. Narrowing to SJEKK or «uten funn» was not added.
  - The mixed-column list in the dialog is not capped. With many columns and many distinct values it could grow long, but the dialog body is the existing scrolling `GmiConfirmDialog`.

## Git and resources

- No staging, commit, push, branch or ref change.
- The three pre-existing untracked planning reports are untouched.
- Task-owned production server on port 3197: started and stopped for each build. The "failed, exit code 127" launcher notifications came from stopping the process.
- Logs: `%TEMP%/gmi-b2-build.log`, `%TEMP%/gmi-b2-server.log`, `%TEMP%/gmi-b2-browser-gate.log`.
- Screenshots: `%TEMP%/gmi-b2-screenshots/`, `%TEMP%/gmi-b2-gate-screenshots/`.
- Not touched: the pre-existing `node --test` process (PID 22704) and the Codex process.
