# Batch 1B.4B progress — post-acceptance usability refinements

Branch `feature/photo-workspace`, HEAD `aa943ba` (verified at start and end). Pre-existing status-only paths: the five `tests/gmi*Ui.test.mjs` files (untouched, no content diff).

| Item | State |
|---|---|
| 1. History → Data Table geometry | Done (`gmiChangeSetTableScope`, `showChangeSet`); unit and browser tests |
| 2. Kun endrede columns | Done (`schemaItems`, changed-field priority); unit and browser tests; the M4 contract conflict is documented |
| 3. Kontroll/TXT field-correction count | Done (`deliveryFieldCorrectionCount`); unit and browser tests |
| 4. FOTO Kontroll layout | Done (review cards); browser tests and screenshots |
| 5. Marker-layout intermittent | Reproduced and explained (test-harness state race from subtest 4); left open with a recommendation |
| 6. Gemini/test-message cleanup (added mid-task) | Done in source and tests |
| Verification | Full Node 2,403/0/157; build ok; complete browser 495/1/11, then the corrected file 12/0/1; ESLint 0 errors; diff-check ok |

Completion report: [20261122-183732-hyperlink-usability-batch1b4b-completion.md](20261122-183732-hyperlink-usability-batch1b4b-completion.md).

## Follow-up: browser-test isolation (2026-11-22)

Item 5 continued; not a new implementation stage. HEAD `aa943ba` verified at start and end.

| Step | State |
|---|---|
| Reproduce | Original test: 2 failures in 12 plain probe runs. Forcing the observed (−30, −23) view made it fail 3/3 on marker bounds; a real pointer resting on «Manuell» made it fail 3/3 on the hover preview. |
| Fix | Done, test only (`tests/photoMarkerProvenanceUi.test.mjs`). `startView`: explicit viewport, pointer off the page, wait for any pan to finish, Leaflet `reset` view to the placements' centre at zoom 14. Used by subtests 5, 6 (each viewport) and 7. Assertions and waits unchanged; no production change. |
| Verification | Fixed test under both forced states 3/3 each; tracked file 20/20; full browser 496/0/11; ESLint clean; `git diff --check` exit 0 |
| Report | Completion report updated: §5.1, outcome row 5, file inventory, verification, remaining issues and Git state |
