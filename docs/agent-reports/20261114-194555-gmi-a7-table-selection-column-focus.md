# A7 completion: Data Table selection and column priority

## Scope and outcome

Implemented A7 only, from slice A7 and §4.5 of `20261114-160730-rettinger-export-ux-consolidation-plan.md`.
Repository: `C:/GitHub/gmi-validering-test`; branch `feature/photo-workspace`; starting HEAD `f95ec4ff207873f44c2c303a42e10f28e608a0cb`. The only initial working-tree entries were the three untracked planning reports named in the task; all remain untouched.

Selected and active rows now carry their existing cyan fill across every ordinary cell and opaque sticky cell. The column-priority indicator checks the applied field order rather than treating a retained request as proof that its columns are visible. The recurring ellipsis failure was an outdated test selector; no truncation CSS change was needed.

## Root causes and implementation

### Row fill

The checkbox cell had a permanent white background. Sticky zoom, identity and pinned cells considered only active-object state, ignoring selection; their group-hover class also replaced active fill with the neutral hover surface. Ordinary cells inherited the row background.

`LayerDataTable.js` now computes one `rowFill` for each row and applies it to the row, checkbox cell and all non-status cells. Selected or active rows use `bg-gmi-cyan-soft` without a hover replacement. Neutral cells retain the existing surface/hover recipe. Contextual status cells retain their original inline FEIL/SJEKK/OK backgrounds. No palette decision or global stylesheet change was made.

### Column-priority truthfulness

Reproduced against an isolated production build containing the HEAD version of `LayerDataTable.js`: choose point field `InnvendigUtvendig` in the batch inspector, then switch the Data Table to Ledninger. The field is absent from the line schema, so `applyColumnFocus` filters it out and displays the ordinary line order. The old indicator still reports `aria-pressed=true`, because it checks only the focus request and the local off signature.

The fixed table separates enabled focus intent from applied focus state. Enabled intent continues to drive field discovery and temporary ordering. The indicator and header focus marker activate only when all requested fields exist in `orderedFields` and applying the requested priority to that order leaves it unchanged. Missing fields therefore produce an unpressed indicator, and returning to the original geometry reapplies focus. Local off choices and signatures remain intact.

Original/Foreslått switches, batch preview/staging, new-batch setup, field changes and undo/redo were investigated with the S5 production workflow. These operations alone did **not** reproduce a separate stale-order failure against HEAD: the focused order remained applied. They continue to pass with the fix, including an explicit off choice across staging. An empty search also retains focused headers, so it correctly leaves the indicator pressed. The regression test explicitly preserves that behavior.

No change was needed in `GmiBatchInspector.js` or `GmiChangeSetDetail.js`. Their S5 focus ownership remains unchanged. The demonstrated missing-field case explains a concrete mismatch; reproducing every real-file acceptance sequence remains manual work.

### Text overflow investigation

The original R4 browser assertion failed against the baseline build. Computed styles and DOM inspection showed:

| Element | Computed text-overflow | Actually clipped |
| --- | --- | --- |
| `.gmi-outcome-detail` | `ellipsis` | yes |
| First `.gmi-review-finding > span` (`.gmi-review-severity`) | `clip` | no |
| `.gmi-review-finding > .truncate` (finding prose) | `ellipsis` | yes |

`ReviewFindings` renders the severity wrapper before the prose. The old selector targeted that wrapper, whose role is to keep the severity icon and label together. Its child strong and the separate prose use `truncate`. The relevant `.gmi-review-finding`/`.gmi-review-severity` CSS controls flex layout and sizing; no sticky-cell cascade overrides the prose truncation.

The test now selects the finding prose directly. It still requires computed ellipsis, actual overflow and a FEIL tooltip; status ellipsis and tooltip checks remain. This corrects the asserted element without removing or weakening the rendering contract. No application rendering regression was found for this failure.

## Exact files changed

- `src/components/LayerDataTable.js`: shared row fill and applied-order indicator state.
- `tests/helpers/layerTableStateAssertions.mjs`: new computed-style/real-pointer-hover assertions.
- `tests/gmiA7ColumnFocusUi.test.mjs`: new missing-field regression, retained headers, local off choice and saved point-order checks.
- `tests/gmiCheckboxSoftFocusUi.test.mjs`: selected, active, combined and hover fills; keyboard cursor outline.
- `tests/layerTableRevealUi.test.mjs`: row fill during existing reveal workflow.
- `tests/gmiValidatorSelectionUi.test.mjs`: selected contextual/pinned cells, preserving status backgrounds.
- `tests/gmiS5FocusContinuityUi.test.mjs`: indicator versus visible priority order throughout existing lifecycle checks, including return to setup/preview and view switches after redo.
- `tests/gmiTableReviewUi.test.mjs`: corrected prose selector and computed row fill across frozen S_FCODE/identity and scrolling cells at both sizes.
- This completion report.

## Verification

### Passed

- Focused Node command: `node --test tests/gmiR4UxPolish.test.mjs tests/gmiEditWorkspace.test.mjs tests/objectTableInspection.test.mjs tests/gmiCheckboxSoftFocus.test.mjs tests/layerTableReveal.test.mjs tests/gmiValidatorSelection.test.mjs` — **65/65**.
- Additional Node command: `node --test tests/layerTableRows.test.mjs tests/gmiTableReviewPresentation.test.mjs tests/gmiValidatorSelectionHandoff.test.mjs` — **21/21**.
- `npx --no-install eslint` on all eight changed JS/MJS files — **0 errors**, one TanStack `react-hooks/incompatible-library` warning in `LayerDataTable.js`.
- `npm run build` in `%TEMP%/gmi-a7-production` — passed. The built application file's SHA-256 matches the repository file. The copy uses a node_modules junction and a copy-only Turbopack root override (`C:/`); repository configuration/build output was untouched. Build emitted the Browserslist data-age advisory.
- Serial production browser command, with `PHOTO_UI_URL=http://localhost:3297`: `node --test --test-concurrency=1 tests/gmiA7ColumnFocusUi.test.mjs tests/gmiCheckboxSoftFocusUi.test.mjs tests/gmiS5FocusContinuityUi.test.mjs tests/gmiTableReviewUi.test.mjs tests/gmiValidatorSelectionUi.test.mjs tests/layerTableRevealUi.test.mjs tests/gmiValidatorSelectionHandoffUi.test.mjs` — **28/28**. After adding explicit return-to-setup/preview assertions, the changed S5 suite was rerun — **4/4**.
- `git diff --check` — passed.

Computed checks cover opaque backgrounds on sticky and ordinary cells before and during real pointer hover, selected/active/both states, checkbox teal and membership, status-fill exceptions, active inset marker, 28px rows, 32px selection cells and the 2px keyboard outline. Existing browser checks retain sticky offsets/header alignment, horizontal and vertical scrolling, compact widths, map halos, draft guards, source-byte identity, undo/redo and Original/Foreslått handoff contracts. Saved point-column preferences are compared before and after temporary focus/geometry/toggle operations.

Screenshots were inspected at 1280×720 and 1366×768, including `%TEMP%/gmi-a7-shots/h2-selected-1280x720.png` and `t3-dirty-1366x768.png`. Further screenshots are in that directory; R4 and S5 captures use their existing `%TEMP%/gmi-table-review-*.png` and `gmi-s5-staged-*.png` paths. No screenshots or fixture data were tracked.

### Failed checks and investigation results

- Baseline A7 geometry-switch test: expected failure (`true` versus required `false`); passes after the fix.
- Baseline T3 row-fill assertions at both sizes: expected failures (white sticky cells versus cyan); pass after the fix.
- Baseline original R4 overflow assertion: reproduced `clip` versus `ellipsis`; corrected selector passes.
- During test development, assumptions that an empty search removed headers and that every Validator selection had the same active-object state were disproved. Assertions now follow the actual headers and existing active-object ownership; T3 separately asserts all three known row states. An attempted status-token substitution was reverted before final verification to preserve the existing contextual colors.
- No unresolved final check failures.

### Skipped / not performed

No tests were skipped in the reported focused Node or production-browser runs. Full repository regression and private-corpus/real-file manual acceptance were not run. No claim of real-file acceptance is made.

## Preserved behavior and remaining acceptance

The patch does not alter row geometry, sticky offsets, column sizing/drag ownership, scrolling, selection/active ARIA semantics, checkbox behavior, contextual status colors, saved-order writes, inspector guards, batch staging, validation or source-preserving export engines. Existing manual column-order behavior is unchanged; no new resizing mechanism was added.

Manual acceptance checklist:

1. In the real acceptance file, select rows and inspect the checkbox, frozen identity/pinned and ordinary cells while scrolling horizontally and hovering. Repeat for an active row and selected+active row; check FEIL/SJEKK/OK readability.
2. Choose `InnvendigUtvendig`, preview, return to setup, stage, switch Original/Foreslått, undo and redo. Compare the indicator with the actual headers at every step.
3. Switch to a geometry without the chosen field: indicator must be unpressed. Return, toggle ordinary order, change field and confirm saved layout remains intact.
4. Check keyboard navigation, Space selection, active-object marker and outline at both laptop sizes.

No other slice, FOTO exclusion, legacy retirement or styling-audit decision was implemented. Remaining risk: synthetic fixtures cannot establish the exact sequence behind every reported real-file mismatch.

## Final Git / publication state

Six tracked files modified (one application file and five tests); three new task files (two test/helper files and this report). The three pre-existing untracked planning reports remain untouched. No stage, commit, push, branch/ref change or deployment. Only task-owned production servers on ports 3297 and 3298 were started and stopped; other listeners were left alone.
