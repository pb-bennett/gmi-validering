# GMI Validator M5A — Validator rules inside Rettinger

Date: 2026-11-09. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, starting commit `7eba472`. The initial working tree was clean. No commit or push.

## Outcome

Rettinger now shows shared Validator diagnostics beside object fields, including staged corrections and local form drafts. Red exclamation icons indicate FEIL; orange indicates SJEKK. An additional `+` marks introduced findings; a green check marks resolved original findings. Hover/focus tooltips identify the transition, rule description, existing Validator explanation and rule ID. Unchanged findings are identified as present in the original delivery. Findings for columns absent from the editor are available in a compact disclosure below the form.

Warnings remain advisory. A browser test stages an SDR/Ringstivhet conflict, then resolves it through another correction. The existing overwrite/replace choices, encoding restrictions, structural restrictions and source-preserving export checks still apply.

The export remains **Eksperimentell**. The user's Gemini VA import-wizard evidence confirms recognition of the revised GMI and Merknad, but a full database import remains unverified.

## Files changed

| File | Purpose |
|---|---|
| `src/lib/validation-v2/validationRunner.js` | New `createGmiObjectValidator`; small shared-context seam for selected-object evaluation without enumerating the dataset; supplies Ringstivhet evidence to the shared policy context. |
| `src/lib/validation-v2/index.js` | Exports the object validator. |
| `src/lib/validation-v2/registry/rules.js` | Registers the shared exclusivity rule and its related field metadata; validates related field references. |
| `src/lib/validation-v2/fieldPolicy.js` | Shared exclusivity evaluation; explicitly defers the cross-object part of Stedfestingsårsak in local mode. |
| `src/lib/validation-v2/contracts.js` | Adds `SDR_RING_STIFFNESS_CONFLICT` and `DATASET_CONTEXT_REQUIRED` reason codes. |
| `src/lib/validation-v2/diagnostics.js` | Maps those reasons and provides the shared Norwegian exclusivity explanation. |
| `src/lib/validation-v2/registry/fieldInformation.js` | Documents the new relation in ordinary Validator field information without presenting it as a required SDR value. |
| `src/lib/gmiEditValidation.mjs` (new) | Transient effective-value/draft overlay, cached original diagnostics, source-column association and original/introduced/resolved comparison. |
| `src/components/gmi-edit/useGmiObjectValidation.js` (new) | Debounced selected-object feedback; cancels superseded work and hides stale findings. |
| `src/components/gmi-edit/GmiObjectEditor.js` | Compact warning/check icons and shared tooltips; missing-column disclosure and local-scope explanation. |
| `src/components/gmi-edit/GmiEditWorkspace.js` | Synchronizes selected geometry with the associated Data Table after the draft decision. |
| `src/components/gmi-edit/gmiEdit.css` | Warning styles and 6 px spacing above draft/proposed status pills. |
| `tests/helpers/gmiEditValidationFixture.mjs` (new) | Fabricated in-memory M5A GMI fixture shared by node/browser tests. |
| `tests/gmiEditValidation.test.mjs` (new) | Six focused engine/overlay/parity/isolation/performance-path tests. |
| `tests/gmiEditValidationUi.test.mjs` (new) | Six production-browser scenarios, seven tests including parent. |
| `tests/validationV2Diagnostics.test.mjs` | Updates the explicit active-owner count from 45 to 46. |
| `tests/validationV2GmiA8.test.mjs` | Adds the new rule to the exact registry inventory oracle. |
| This report | Implementation, evidence, verification and acceptance instructions. |

No M1/M2/M3 editing library, parser, imported layer data, store, FOTO source, committed GMI fixture or manifest was changed. M4 reports and the separate handover were preserved.

## Shared rule evaluation and local scope

`runGmiValidationV2`, `evaluateGmiRuleApplicability` and the new object validator share the existing schema binding, evidence extraction, policy context, `createRuleResult`, evaluator functions and immutable registry. Rettinger contains no material, hydraulic-class, code-list or applicability conditions.

The new factory binds the delivered schema once. Each evaluation constructs refs only for the selected geometry/source index and reads only that object. The selected object's transient attribute overlay combines its current effective proposed lexemes with local draft values. The existing lexical-evidence symbol preserves exact validation lexemes; empty/whitespace values retain missing-value semantics. The overlay cannot create columns and never enters the edit registry or export path.

Original diagnostics are cached per document/layer/object. Draft feedback uses a **180 ms debounce**, cancelling pending work on further typing, object changes or unmount. Stale feedback is hidden until the current values have been checked. There is no call to `runGmiValidationV2`, `getGmiProposedState` or M2 revalidation in the typing path. A proxy-based test throws on reads of unrelated objects and successfully evaluates 30 drafts. Tests also compare local outcomes with full Validator outcomes and with M1's verified proposed reparse after a staged Material correction.

M2's existing `getGmiProposedState` and `revalidateGmiEditSession` remain unchanged: explicit full revalidation still validates the byte-verified proposed dataset and can be exposed in a later milestone. The local overlay is inspection feedback, not a replacement for that export verification.

| Rule family | Local evaluation |
|---|---|
| Required values, approved codes, numeric/format/range checks, optional text and informational fields | Existing per-object evaluators. |
| Tema/S_FCODE identity and schema coexistence | Existing identity resolver and schema evidence; both source columns receive relevant indicators. |
| Type/Tema compatibility; point-field applicability | Existing relationship/policy rules using effective object context. |
| VertikalDimensjon/Rørform; hydraulic SDR/Ringstivhet/Material/Tema; Trykklasse/Tema | Existing contextual policy rules, unchanged. |
| Anleggsår/Stedfestingsårsak; Datafangstdato/Anleggsår/reference date | Existing object-level checks. |
| SDR/Ringstivhet mutual exclusivity | New shared object-level rule, described below. |
| Stedfestingsårsak versus usable NYTT years in other objects | **Requires dataset evaluation.** Local mode still detects missing/invalid Stedfestingsårsak, but returns `NOT_EVALUATED / DATASET_CONTEXT_REQUIRED` where the cross-object comparison is needed. It does not claim a pass or a resolution. |

The editor explicitly states: “NYTT-år på tvers av objekter vurderes ikke lokalt.” No full-dataset revalidation button was added. Unsupported/ambiguous source evidence retains the Validator's existing SJEKK/dependency explanations rather than guessed conclusions.

## SDR/Ringstivhet evidence and implementation

Before M5A, `innmaling.line.sdr.valid` and `innmaling.line.ring-stiffness.valid` each evaluated their own supplied value against Tema, material family and hydraulic applicability. They did not compare the two properties with each other. The existing Batch 4 tests confirmed the separate policies and their lexical equivalents; those tests remain passing unchanged.

Added `innmaling.line.sdr-ring-stiffness.exclusive`, a shared line-only `FIELD_POLICY` rule with primary field `sdr` and related field `ringStiffness`. The registry source metadata explicitly names the M5A acceptance requirement (§3), rather than inventing a standards citation. Its evaluation is independent of whether Material or Tema is valid:

- Both properties populated: **FAIL / FEIL**, reason `SDR_RING_STIFFNESS_CONFLICT`.
- Either property empty or missing: no mutual-exclusivity error.
- Ambiguous/unresolved schema evidence: the existing structural-evidence SJEKK behaviour applies.

The ordinary Validator and Rettinger use the same evaluator and explanation:

> Både SDR og Ringstivhet er utfylt. Disse egenskapene skal ikke brukes samtidig på samme ledning.

SP/PVC with SN8 and empty SDR passes this relationship check. Supplying SDR introduces FEIL on both field labels; clearing Ringstivhet removes that relationship error. Other existing applicability findings can remain independently. Invalid populated SDR/Ringstivhet values still produce their existing value-domain findings as well as the relationship error.

## UI details

- FEIL uses a red exclamation; SJEKK uses orange. Original and introduced findings retain severity; resolved original findings use a green check. Tooltips carry readable transition text, so colour is not the only distinction.
- Uses the established `PhotoIconButton` hover/focus tooltip behaviour, with accessible names and Escape handling. No large warning panels or repeated explanatory paragraphs were added beside inputs. Duplicate description/reason text is removed from each tooltip.
- Exact original/proposed values and M4 form/review/stage flow are unchanged. Local warnings do not set the safety-validation error state or disable review.
- Both `Ikke lagt til` and `Foreslått · cs-n` have `margin-top: 6px; margin-bottom: 0`.
- Selection synchronizes the Data Table to `ledninger` or `punkter`, including reselecting the current object. It runs after the existing draft guard, so cancellation keeps selection and table type. An open table pinned to another layer or a Validator inspection returns to the selected Rettinger layer's ordinary browser on explicit object selection. Closed tables remain closed. No behaviour outside Rettinger is changed.
- Production-browser checks at 1366×768 and 1280×720 found no page/inspector horizontal overflow. Screenshots were visually inspected from `%TEMP%`; the download control remained visible and experimental.

## Verification

| Check | Result |
|---|---|
| `node --test tests/gmiEditValidation.test.mjs` | **6/6 pass**. |
| `node --test tests/validationV2*.test.mjs tests/gmiEdit*.test.mjs` without browser URL | **383 tests: 374 pass, 3 known baseline fail, 6 skip**. All new tests and existing business-rule tests pass. |
| Production browser: all `gmiEdit*.test.mjs` plus `photoLoadedGmiUi`, `photoImportWizardUi`, `mapTeardownUi`, `photoWorkspacePass1dUi`, `gmiPhotoAssociationsUi`, serial execution with `PHOTO_UI_URL=http://localhost:3123` | **147 tests: 142 pass, 0 fail, 5 expected skips**. |
| Final production browser after the table synchronization refinement: `gmiEditValidationUi`, `gmiEditWorkspaceUi`, `gmiEditDraftGuardUi`, serial execution | **27/27 pass**. Includes all M5A scenarios and existing M4 reset/export/history safeguards. |
| Final focused node rerun: `gmiEditWorkspace` + `gmiEditValidation` | **16/16 pass**. |
| `node --test --test-concurrency=1 tests/*.test.mjs` | **1914 tests: 1807 pass, 7 known baseline fail, 100 skip**. |
| Targeted ESLint `--max-warnings 0` on every changed JS/MJS source/test file, including all Rettinger components | **Clean**. |
| `npm run build` after final application changes | **Success**. Browser rerun used this production build with `next start` on port 3123. |
| `git diff --check` | **Clean**. |

The seven full-suite baseline failures are unchanged:

- `appInfoUiContract` — 1.
- `statsUiContract` — 2.
- `terrainPhotoGml` optional external real-corpus browser integration — 1.
- `validationV2WorkspaceInspector` — 3.

The initial concurrent full-suite run also hit `photoEditCommit`'s “repeated GMI occurrences of one asset are committed independently”: its sibling direction was already automatically accepted as 0° rather than null when the assertion ran. That unchanged test passed **6/6** when rerun in isolation and passed in the complete serial run. No FOTO code was changed for this timing-sensitive failure. The final serial run has exactly the seven documented baseline failures; no additional persistent failure was found.

## Remaining limitations and manual acceptance

Local feedback intentionally omits cross-object NYTT-year comparisons and does not claim that the entire revised delivery has been revalidated. Missing columns are shown as findings, but cannot be created. Draft validation uses a transient lexical overlay; byte-level safety and final parser verification remain M1's responsibility. No batch editing, Validator-generated ChangeSets, hyperlink removal or combined export was implemented.

Recommended M5A browser acceptance:

1. Open a real GMI in Rettinger. Select objects with known FEIL and SJEKK. Hover and keyboard-focus the red/orange icons; compare explanations and rule IDs with the ordinary Validator. Expand missing-column findings if present.
2. Select an SP/PVC pipe with Ringstivhet SN8 and empty SDR. There should be no mutual-exclusivity error. Enter SDR 11 (or 11.0), pause briefly, and expect red `+` indicators on both fields with the shared explanation.
3. Clear Ringstivhet. The exclusivity error disappears. If the original already had both populated, clearing either shows the original conflict as resolved (green check). Other applicability warnings remain governed by their existing rules.
4. Stage a Material correction, then draft a related SDR/Ringstivhet change. Confirm feedback uses the staged Material. Undo/redo and verify the feedback follows effective values.
5. Review and stage a correction while FEIL exists; verify the warning is advisory. Resolve the problem in a later correction. Prohibited semicolons/encoding or structural edits must still be refused.
6. Select a Punkt, then a Ledning. Verify Data Table geometry follows selection. With a draft, cancel object navigation and verify both the original selection and table remain. Check same-object reselection after manually changing the table tab.
7. At laptop widths, inspect the space above both status pills, compact warnings, scrolling and download control. Export must still say **Eksperimentell**. Inspect a revised file in Gemini VA as appropriate; full database-import acceptance remains a separate manual gate.

M5A is ready for manual browser acceptance. The final working tree contains only the intended M5A files above. Test logs/screenshots are outside the repository in `%TEMP%`. Temporary browser/test processes and the production server were stopped after verification. Nothing was committed or pushed.
