# B1 — Selection profile and narrowing in the batch inspector: completion

Date: 2026-11-12, Europe/Oslo. Branch `feature/photo-workspace`; starting and final HEAD `58de9e3557d19a3983384410e40c443f56ba54f6`. The work is uncommitted.

## Scope and outcome

Implemented B1 from [the unified workflow plan](20261111-085500-gmi-validator-rettinger-unified-workflow-planning.md) (§4.4(a), §7 and the B1 entry in §9). Before editing I read the [H4](20261112-122918-gmi-h4-validator-return-completion.md) and [G5 D3](20261112-092604-gmi-g5-d3-completion.md) reports and the current batch inspector, selection reducer and batch view helpers.

The batch inspector now opens with a compact **Utvalget: N ledninger/punkter · Foreslått nå** profile:

- **Fields:** one row each for Tema, Material, Dimensjon and Stedfestingsårsak, resolved through the existing schema binding. Fields the binding does not expect for the geometry are left out. An expected field missing from the file shows «Finnes ikke i filen», and an ambiguous binding shows «Feltkoblingen er tvetydig».
- **Rule context:** after a valid preview, the profile adds rows from the governing rule's own `diagnosticFacts`: «Hydraulisk klasse» (Trykk / Selvfall / Spesiell / usikker), plus any context field not already listed (for example Rørform). It notes that these rows come from the preview. They disappear when the preview becomes stale.
- **Uniform field:** shown as «PE (alle)», with no action.
- **Mixed field:** a one-line summary, for example «PE (2) · PVC (1) · (tom) (2)». With more than three values it reads «N ulike verdier · M tomme». The summary is a `<details>` that opens a list of value, count and **«Behold bare disse (n)»**.
- **Missing values:** empty and whitespace-only values form one explicit «(tom)» group, always listed last.
- **Narrowing:** narrowing removes the other objects through the existing `changeGmiEditSelection` → `reduceGmiEditSelection` `remove` action. Focus moves to the profile heading, and a polite status line reports «Utvalget er innsnevret til N ledninger (Felt: verdi).»

Not done: B2 (confirmation gates, current-finding split), B3 (step-through), H5, and no change to eligibility, Validator rules, ChangeSets, source bytes or export.

## Implementation decisions

- **Pure module `src/lib/gmiSelectionProfile.mjs`.**
  - `gmiSelectionProfileSources(view, scope)` reads source columns only through `describeGmiEditColumns` (the cached `bindGmiLayerSchema` result). It keeps bound columns with `validatorKind === 'bound'`, ordered DIRECT → CASE_NORMALIZED → ACCEPTED_FALLBACK. With Tema plus an accepted S_FCODE fallback, the delivered Tema is therefore used first, and S_FCODE only when Tema is empty.
  - `buildGmiSelectionProfile({ dataset, scope, keys, sources, ruleRows })` groups the exact proposed lexeme, read from `GMI_SOURCE_LEXEMES` and falling back to the attribute value. It trims only for grouping and never normalises case. Sorting: most frequent first, «(tom)» last.
  - `gmiSelectionNarrowing(selection, keep)` returns only keys to **remove**. Keys outside the selection are ignored. It returns null when nothing would be removed or the selection would become empty. There is no add path.
- **Proposed dataset.** The profile uses `getGmiProposedState(view.session).dataset`, the same memo the inspector already used for «tom i N av M». Staged corrections are therefore included, and undo/redo (a new `view.session`) recomputes it. The selection itself is unaffected by undo/redo, as before.
- **Rule context from a valid preview only.** Rule context is read only when `review && !stale`. Objects without a preview row are counted as «(tom)», never inferred. Before a preview, no rule is evaluated just for the profile.
- **Preview validity.** A narrowing is a shrink, so the existing logic keeps the preview valid: `stale` is only `expanded` for added keys, and the store subscription flags only additions. The candidate ChangeSet, table rows and full dry run are rebuilt for exactly the remaining subset through the existing paths.
  - Narrowing clears any pending risk state (`setRisk(null)`).
  - The exact-approval token check (`approval.plan !== plan || approval.selection !== selection`) is unchanged.
  - Narrowing is disabled while a preview is being calculated, so the existing "Utvalget eller økten er endret" path is not triggered needlessly.
- **Identity and provenance.** The dispatch passes the selection's own `binding` and `host`. The reducer keeps `origin`, `binding` and `host` on `remove`, and the H3/H4 workspace handoff (`gmiEditWorkspace.handoff`) is not touched. The restricted R5 origin accepts the shrink.
- **Placement.** The profile appears in the configuration and preview views, not in the staged-ChangeSet view. Before a preview it comes first. Once a preview exists, it sits directly below the «Foreslått retting» box. The other values stay collapsed by default. The list scrolls inside a 132 px cap, so a field with many values cannot push the inspector off-screen.

## Regression found and fixed

The first gate run failed `gmiR4UxPolishUi` → «icon table-size toggle and laptop layouts with a live preview». The assertion "the proposed correction is visible without scrolling" requires the proposal summary to start less than 140 px below the top of the inspector, and B1 had placed the profile above the proposal. The profile now renders after the proposal box. The R4 contract was kept and not relaxed. The rerun passed, and the B1 screenshots at 1280×720 show the proposal first and the profile below it, with nothing cut off.

## Changed files

| File | Change |
| --- | --- |
| `src/lib/gmiSelectionProfile.mjs` | New: profile sources, distributions, rule context, shrink-only narrowing. |
| `src/components/gmi-edit/GmiSelectionProfile.js` | New: compact profile presentation, «Behold bare disse», focus/status handling. |
| `src/components/gmi-edit/GmiBatchInspector.js` | Computes the profile; narrowing dispatch through the existing store action; renders the profile. |
| `src/components/gmi-edit/gmiEdit.css` | Scoped `.gmi-selection-profile` / `.gmi-profile-*` styles using existing tokens. |
| `tests/gmiSelectionProfile.test.mjs` | New: 7 Node tests. |
| `tests/gmiSelectionProfileUi.test.mjs` | New: production browser suite (2 subtests). |
| This report. | |

No existing tests were modified.

## Checks

| Check | Result |
| --- | --- |
| `node --test tests/gmiSelectionProfile.test.mjs` | **7 passed, 0 failed, 0 skipped.** |
| Node regression gate (plan §10 set, plus `gmiFieldBatchPlan`, `gmiValidatorSelectionHandoff` and the new file) | **301 total: 288 passed, 3 failed, 10 skipped.** The 3 failures are the documented `validationV2WorkspaceInspector` baseline (sidebar width; workspace-shell placement; map/3D resize). They assert `src/app/page.js` source text, which this task did not change, and H3/H4 recorded the same three. The CRLF `gmiRettingerSidebar` artefact named in the plan did not fail in this run. |
| ESLint (5 changed/new JS/MJS files) | **0 errors, 0 warnings.** |
| `npm run build` (fresh, after all source edits) | **Passed.** |
| New browser suite `gmiSelectionProfileUi` (production, port 3197) | **3 passed (1 test + 2 subtests), 0 failed.** |
| Serial production browser gate (21 suites, below) | First run: **144 total, 142 passed, 2 failed**. The failure was one real regression: an R4 assertion plus its parent test (see «Regression found and fixed»). After the fix, a fresh build and a full rerun: **144 passed, 0 failed, 0 skipped.** |
| `git diff --check` | **Passed.** The new untracked files were also checked for trailing whitespace. |

New Node coverage:
- binding-resolved sources;
- distributions with missing and whitespace-only values;
- absent fields, and the Tema/S_FCODE fallback;
- original vs proposed values after a staged Material correction, through undo and redo, with source bytes unchanged;
- narrowing that only removes, ignores foreign keys, and treats keep-all and keep-none as no action;
- reducer `remove` preserving `origin`/`binding`, including the restricted R5 origin;
- a hydraulic preview staying valid after narrowing (`gmiBatchScopeState` null), with `planGmiInspectorBatch` limited to the subset, while widening is still `expanded`;
- rule context (hydraulic class) from the preview, with missing context explicit;
- 4,000 selected lines profiled and narrowed in under 1 s;
- a source contract that the inspector uses the existing reducer and that the approval token check is unchanged.

What the browser suite exercised, with a synthetic file:
- Five lines → profile distributions per field, including «(tom)».
- SDR 11 preview → «Hydraulisk klasse» row appears.
- Layout at 1280×720 and 1366×768: the collapsed profile is under 170 px tall; collapsed and expanded, it has no horizontal overflow and stays inside the inspector. Screenshots were inspected.
- **Keyboard:** Enter on «Behold bare Material PE» narrows the selection to 2 and moves focus to the profile heading. The table has 2 ticked rows, Material/Tema show «(alle)», the preview stays `valid` and is rebuilt as «av 2 ledninger endres», and the uniform field offers no action.
- Widening via the table invalidates the preview («Utvalget er utvidet…», staging disabled) and removes the stale rule context.
- **Mixed-selection gate retained:** Material fill on VL+SP lines → the risk dialog lists «Blandet … Tema». Cancel, «Behold bare Tema SP» → preview still valid, 2 of 2 change, and staging shows no mixed warning.
- **Undo/redo:** after staging, the profile shows the proposed «PE (alle)». Undo → «(tom) (alle)»; redo → «PE (alle)». The selection stays at 2 objects.
- The input file is unchanged, and no runtime exceptions occurred.

Browser gate suites (serial, `PHOTO_UI_URL=http://localhost:3197`):
- New: `gmiSelectionProfileUi`
- H4, H3 and H2: `gmiValidatorReturnUi`, `gmiValidatorSelectionHandoffUi`, `gmiValidatorSelectionUi`
- T1 and G5: `layerTableRevealUi`, `gmiBatchFieldValueInputUi`, `gmiFieldValueInputUi`
- Rettinger standing gate: `gmiEditWorkspaceUi`, `gmiEditDraftGuardUi`, `gmiEditValidationUi`, `gmiValidatorEditingUi`, `gmiLayerFiltersUi`, `gmiEditSelectionUi`, `gmiBatchInspectorUi`, `gmiR4UxPolishUi`, `gmiEditBatchUi`, `layerDataTableGeometryUi`, `layerDataTableKeyboardUi`, `gmiRettingerSidebarUi`
- S5 and Validator counts: `gmiS5FocusContinuityUi`, `validationV2RuleCountsBrowser`

## Remaining risks and manual acceptance

- **Not run:**
  - the full serial Node suite (`tests/*.test.mjs`): B1 does not touch `store.js`, the Validator or shared editing logic;
  - a `next dev` (Strict Mode) pass.
- **Manual acceptance on the real delivery has not been done** (the SDR case with mixed Material/Dimensjon, some not NYTT). Automation used synthetic data only, and no contractor or private corpus was opened.
- **Tema with both Tema and S_FCODE:** the profile shows the delivered Tema first and S_FCODE only when Tema is empty. If the two disagree, the Validator's own Tema identity resolution may treat the object differently (for example as a conflict). This only affects the profile's presentation. The existing mixed gate still applies.
- **Rule context needs a preview,** by design, so that no rule is evaluated just for the profile. Before a field is chosen, only the four physical fields are shown.
- **The profile is hidden in the staged-ChangeSet view.** It returns with «Ny masseendring for utvalget» or after undo.

## Git and resources

- No staging, commit, push, branch or ref change.
- The three pre-existing untracked planning reports are untouched.
- Task-owned production server on port 3197: started twice (before and after the fix) and stopped both times. The "failed, exit code 127" notification for the background launcher came from stopping the process.
- Logs: `%TEMP%/gmi-b1-build.log`, `%TEMP%/gmi-b1-server.log`, `%TEMP%/gmi-b1-browser-gate.log`.
- Screenshots: `%TEMP%/gmi-b1-screenshots/`, `%TEMP%/gmi-b1-gate-screenshots/`.
- Not touched: the pre-existing `node --test` process (PID 22704) and the Codex process.
