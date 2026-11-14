# A6: Rettinger editor input and navigation — completion report

- **Task:** IMPLEMENTATION of slice A6 only (`20261114-160730-rettinger-export-ux-consolidation-plan.md`, A6 and §4.5i/g).
- **Repository / branch / start HEAD:** `C:/GitHub/gmi-validering-test`, `feature/photo-workspace`, `f40e08b` (verified at start; the three untracked planning reports were left untouched).
- **Not done (out of scope):** A7, FOTO delivery exclusion, legacy retirement, batch-inspector and legacy `GmiBatchDialog` wording.

## 1. Outcome

1. Typing in the S_FCODE/Tema value combobox now ranks the exact code and code-prefix matches ahead of description matches, and the list visibly narrows. In the acceptance domain, «VL» is now the first offer for both «V» and «VL».
2. The individual editor uses «Forhåndsvis endringer (N)», with a matching heading, region name, empty-list hint and stale-preview message.
3. B3 «Rett én og én» navigation carries Phosphor Regular icons: `ArrowLeftIcon` on «Tilbake til utvalget», `CaretLeftIcon` on «Forrige» and `CaretRightIcon` on «Neste». It also has visible hover and disabled states.

## 2. Cause of the S_FCODE filtering problem (reproduced)

I reproduced this with the authoritative domains (`getGmiFieldValueDomain`), using a synthetic fixture. No real file was used.

| Domain | Options | Control before A6 |
|---|---|---|
| Tema (linked Tema/S_FCODE), line | 108 | searchable combobox (already above the threshold of 12) |
| Tema, point | 81 | searchable combobox |

- **The control-type hypothesis does not explain the report.** The linked S_FCODE/Tema field already rendered the combobox. The `> 12` threshold only affected short lists.
- **Cause: unranked substring matching.** The list was filtered by substring over «code – meaning – long meaning» and kept the authoritative alphabetical order. The Norwegian word «a**vl**øp» contains «vl», so in line Tema:
  - «VL» matched 25 options, with `VL` in 16th place behind every `AF*` «Avløp …» entry.
  - «V» matched 89 of 108, with `VL` in 80th place.
- The list technically filtered, but its visible top did not change, so it looked as if typing did nothing.
- **Second possible contributor (not changed, see §7):** focusing a combobox that already holds a value opens the full list. Typing then appends to the existing value, for example `SP` + `VL` → `SPVL`, which gives «Ingen treff». The real-file manual check should confirm whether this happened during acceptance.

## 3. Implementation decisions

- **Ranking** (`rankGmiFieldValueOptions` in `src/lib/gmiEditFields.mjs`, the existing owner of field domains):
  - The match set is unchanged: the same substring rule over code, meaning and long meaning. The new code only orders it.
  - Tier order: exact code, then code prefix, then a word in the meaning starting with the query, then the code containing the query, then a word in the long meaning starting with the query, then any other substring match.
  - Ties keep the authoritative order. An empty query returns the original array.
  - It returns only the original frozen option objects, so lexemes are never rewritten.
  - I placed it in a `.mjs` library so it can be unit-tested in Node. `gmiFieldValueOptionLabel` moved there as well, so the component and the ranking share one label definition.
- **Combobox threshold:** `searchable = enumerated && (strictListed || options.length > 8)`. It was previously `> 12`.
  - `strictListed` always gets the combobox. Today that is only linked Tema, which is large anyway.
  - Lists of 9–12 options now get the combobox. Today that is only Stedfestingsforhold (10).
  - Lists of 8 or fewer stay native selects. They fit an open select without scrolling, and the select's type-ahead already jumps by the leading code.
  - This is narrower than the plan's example (6). It avoids churn for the 7-option fields (Kumform, Ringstivhet, Rørform, VertikalNivå, Høydereferanse). Their select contracts are asserted in existing suites, for example `gmiEditValidationUi` Ringstivhet `select`.
  - No new component was added. The existing combobox and its keyboard handling are unchanged.
- **Terminology** (individual editor only):

  | Element | Before | After |
  |---|---|---|
  | Submit button | `Se gjennom (N)` | `Forhåndsvis endringer (N)` (`Forhåndsvis endringer` when nothing is edited) |
  | Heading | `Se gjennom før du legger til` | `Forhåndsvis før du legger til` |
  | Region `aria-label` | `Se gjennom retting` | `Forhåndsvisning av retting` |
  | Empty change-list hint | «Se gjennom» | «Forhåndsvis endringer» |
  | `stale-change-set` message | … Se gjennom endringen på nytt. | … Forhåndsvis endringen på nytt. |

  - The `stale-change-set` message is shared with batch staging, which already uses «Forhåndsvis».
  - I added stable hooks: `data-gmi-object-preview`, `data-gmi-object-review`, `data-gmi-individual-back` and `data-gmi-individual-step`.
- **Navigation:** labels, handlers, `disabled` logic and DOM order are unchanged. The icons are `aria-hidden` at 14 px, so each accessible name is still the visible label. The icon sits before the label, except on «Neste», where it trails to show direction.
  - Scoped CSS in `gmiEdit.css` under `.gmi-individual-selection`:
    - `inline-flex` with a 4 px gap;
    - link hover: `--gmi-navy` and a thicker underline;
    - compact-button hover: `--gmi-interactive` border;
    - disabled: `opacity .5` and `cursor: not-allowed`.
  - No new colours were added.
- **Teal checkboxes:** I added `accent-gmi-interactive` to the four native confirmation checkboxes in `GmiObjectEditor`: overwrite, replace, linked consent and new FEIL. AGENTS.md and plan §6.5 treat a touched native-blue control as a defect. The computed teal `accentColor` is verified in the browser for the linked consent box.

## 4. Behaviour preserved

- Typed drafts are still upper-cased only when the domain is upper-case. List selection, mount and external resets keep exact lexemes. The `strictListed` refusal is unchanged: an unlisted value shows «Ingen treff. Velg en verdi fra kodelisten.», the `value-out-of-domain` problem appears and preview is blocked.
- There are no changes to field validation, `checkGmiFieldDraft`, the linked Tema/S_FCODE engine, preview calculation, staging, consent gates or approval.
- The B3 itinerary, selection preservation and draft guards are unchanged. Batch field inputs share the same control and pick up the ranking. The batch threshold for `strictListed` is unchanged in effect, because linked Tema was already above 12.

## 5. Files changed

Application:
- `src/components/gmi-edit/GmiFieldValueInput.js`: threshold, ranked matches, shared label import.
- `src/components/gmi-edit/GmiObjectEditor.js`: preview terminology, hooks, teal checkboxes.
- `src/components/gmi-edit/GmiChangeList.js`: empty-list hint.
- `src/components/gmi-edit/GmiEditWorkspace.js`: B3 navigation icons and hooks.
- `src/components/gmi-edit/gmiEdit.css`: scoped B3 navigation states.
- `src/lib/gmiEditFields.mjs`: `gmiFieldValueOptionLabel` and `rankGmiFieldValueOptions`.
- `src/lib/gmiEditView.mjs`: `stale-change-set` wording.

Tests:
- New: `tests/gmiFieldValueSearchUi.test.mjs`, the A6 production browser acceptance for line linked Tema/S_FCODE.
- `tests/gmiEditFields.test.mjs`: Node ranking test.
- `tests/gmiBatchFieldValueInputUi.test.mjs`: new batch Tema search subtest.
- Label-only updates from `Se gjennom (` to `Forhåndsvis endringer (`. No other assertion changed:
  - `deliveryWizardUi`, `gmiCheckboxSoftFocusUi`, `gmiEditDraftGuardUi`, `gmiEditSelectionUi`
  - `gmiEditValidationUi`, `gmiEditWorkspaceUi` (also `buttonState` prefix), `gmiFieldValueInputUi`, `gmiIndividualSelectionUi`
  - `gmiObjectLinkedTemaUi`, `gmiRettingerSidebarUi`, `gmiS5FocusContinuityUi`, `gmiValidatorSelectionHandoffUi`
  - `layerTableRevealUi`
- The batch texts «Se gjennom og godkjenn på nytt» and legacy «Se gjennom og bekreft» belong to the batch surfaces, which are out of scope, and are unchanged.

## 6. Commands and results

| Check | Result |
|---|---|
| `npx --no-install eslint` on the 7 changed source files and 3 test files | pass |
| `node --test --test-concurrency=1` with `gmiEditFields`, `gmiEditWorkspace`, `gmiObjectLinkedTema`, `gmiLinkedTema`, `gmiIndividualSelection`, `gmiEditChangeSets`, `gmiBatchInspector`, `photoDeliveryPlanning` | 102 tests: 101 pass, 0 fail, 1 skipped (private-corpus M2 test; `GMI_EDIT_CORPUS` not set) |
| `next build` (production, isolated copy) | pass |
| `tests/gmiFieldValueSearchUi.test.mjs` (new; production server) | 7/7 pass |
| Serial production browser run of 18 affected suites | 124 tests: 124 pass, 0 fail, 0 skipped. Suites: `gmiFieldValueInputUi`, `gmiBatchFieldValueInputUi`, `gmiObjectLinkedTemaUi`, `gmiLinkedTemaUi`, `gmiIndividualSelectionUi`, `gmiEditDraftGuardUi`, `gmiEditWorkspaceUi`, `gmiEditValidationUi`, `gmiCheckboxSoftFocusUi`, `gmiEditSelectionUi`, `gmiRettingerSidebarUi`, `gmiS5FocusContinuityUi`, `gmiValidatorSelectionHandoffUi`, `layerTableRevealUi`, `deliveryWizardUi`, `gmiBatchInspectorUi`, `gmiBatchRiskGateUi`, `gmiBatchReplaceClearUi` |
| Full serial Node suite `node --test --test-concurrency=1 "tests/*.test.mjs"` (browser suites skip without `PHOTO_UI_URL`) | 2237 tests: 2105 pass, 0 fail, 132 skipped (browser suites without `PHOTO_UI_URL`, plus private-corpus tests) |
| `git diff --check` | pass (only the usual LF→CRLF notices; file EOLs are unchanged LF) |

**Isolated build:** `next start` processes on ports 3110, 3112 and 3113 were serving this repository's `.next` and were not touched.
- The build ran in a scratchpad copy (`src`, `public`, `data` and configs, with a `node_modules` junction to the repository).
- Turbopack rejects a junction outside its root. In the copy only, `next.config.mjs` was given `turbopack: { root: 'C:/' }`. The repository config is unchanged.
- I served the build on port 3296 and stopped that server when testing finished.

**New browser acceptance** (synthetic line fixture: Tema+S_FCODE `SP/SP`, `AF/SP`, `SP/SP`; 1280×720 and 1366×768):
- Linked Tema renders one `combobox`, with no separate S_FCODE row.
- Typing «v» upper-cases to `V` and live-filters to exactly `rankGmiFieldValueOptions(…, 'V')`, with `VL` first. Typing «l» narrows to the 25 «VL» matches, `VL – Vannledning` first, and every `VL*` code ahead of description-only matches.
- ArrowDown, ArrowDown and ArrowUp move `aria-activedescendant`. Enter, sent with real key text, chooses `VL`, closes the list and does not submit the form.
- Escape closes only the list. The value, the editor and the dialogs are unaffected.
- A real pointer click on the third offer chooses it and keeps focus in the control.
- `VLX` gives no offers and «Ingen treff …», and preview stays disabled after the overwrite gate is satisfied.
- «Forhåndsvis endringer (1)» opens the preview, with heading «Forhåndsvis før du legger til» and region «Forhåndsvisning av retting». Tema and S_FCODE both go SP → VL. Linked consent is required and the checkbox is teal. The change stages.
- B3:
  - three controls named `Tilbake til utvalget`, `Forrige` and `Neste`, each with one `aria-hidden` SVG and no `title`;
  - «Forrige» is disabled at 1 of 3, with `cursor: not-allowed` and opacity 0.5;
  - hover gives «Neste» a teal border and changes the back link colour;
  - keyboard Enter and Space activate «Neste»/«Forrige», with a visible `:focus-visible` ring;
  - the draft guard (`Avbryt`) keeps the `VLP` draft;
  - the controls are reachable and share one row height at both sizes;
  - «Tilbake til utvalget» goes through the guard back to the batch inspector with selection `[0, 1, 2]` intact.
- The verified download changes only line 0 `Tema` and `S_FCODE` to `VL`. The contractor file is unchanged and there were no runtime exceptions.

Screenshots (local, not tracked), in `C:\Users\furr_\AppData\Local\Temp\claude\48e85b8705b14ab6\df5ab8b0-a30f-49e9-9ac7-2b31bb4e4878\scratchpad\shots\`:
- `a6-linked-search-1280x720.png`, `a6-linked-search-1366x768.png`: ranked «VL» list fits the inspector.
- `a6-preview-1280x720.png`
- `a6-b3-nav-1280x720.png`, `a6-b3-nav-1366x768.png`: icon navigation, one row, no page overflow.

## 7. Remaining issues and risks (observed; not changed)

- **Focus-opened list ignores the current value** (existing behaviour). Focusing or refocusing a combobox with a value, for example after a guard dialog restores focus, opens the unfiltered list, and typing appends to the existing text. Selecting the text on focus would make «type to replace» easier, but it changes caret behaviour, so I left it as a recommendation. It may be part of the original acceptance observation.
- A single-character query in large domains still matches many entries («V» gives 89 of 108). They are correctly ranked, but the list is long.
- Batch-inspector («Se gjennom og godkjenn på nytt») and legacy `GmiBatchDialog` wording still use «Se gjennom». These are out of A6 scope, and C2 retires the legacy dialog.
- Stedfestingsforhold (10 options) is now a combobox. No existing suite edits it in Rettinger; covered only by the shared control tests.

## 8. Manual acceptance checklist (real file; not covered by automation)

1. In the real acceptance file, open an object with Tema/S_FCODE in Rettinger. Clear the field, type «V», then «VL»: `VL` is first and the list narrows. Repeat with an existing value in the field, to check the append behaviour in §7.
2. Choose by keyboard (↓, Enter) and by mouse. Check that Escape closes only the list.
3. «Forhåndsvis endringer (1)» → consent «Sett både Tema og S_FCODE til «VL»» → «Legg til retting». Both «nå» values show VL, and the export changes both fields only.
4. Select several objects → «Rett én og én». Check the icons, hover, Tab focus ring, Forrige/Neste, the draft guard on Neste, and that «Tilbake til utvalget» keeps the selection.
5. Repeat steps 1 and 4 at 1280×720 and 1366×768, with one keyboard-only pass.

## 9. Git status

No staging, commit, push or deploy. Working tree: the 7 application files and 16 test files listed above, plus this report. The three pre-existing untracked planning reports are unchanged.
