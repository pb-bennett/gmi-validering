# Batch 1A completion record — LOK/TOP → KUM read-only review

2026-11-20, Europe/Oslo. **Safe stopping checkpoint at the user's request: implementation present; verification incomplete.** Final production-browser collection finished with failures. No regression is running. This record supersedes the earlier in-progress entries below. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, unchanged HEAD `4511c39590609119f80cf758e926a1763fdab78c` (expected `4511c39`). No subagents, private corpus inspection, staging, commits, pushes, deployments, branch changes or dependency changes.

## Outcome and boundary

Implemented Stage 1 of the [original transfer plan](20261116-194458-lok-top-kum-photo-hyperlink-transfer-planning.md), following Batch 1A of the [approved roadmap](20261120-154700-final-functional-reconciliation-release-planning.md). The pre-existing untracked roadmap is preserved.

FOTO **Verktøy → Gjennomgå bildelenker på LOK/TOP…** opens a functional review, with source/revision/photo-layer choice, searchable source cases, complete hyperlink evidence, file previews, all same-source KUM candidates, XY/Z evidence, existing target references, conflicts, and explicit temporary target/reference-group choices. The native dialog has focus containment/restoration, Escape, a named close control and independently scrollable panes. No save, execute, transfer or add-correction control is provided.

Validator's point S_HYPERLINK control offers **Gjennomgå i FOTO** for its relevant LOK/TOP findings. It passes full detailed findings and complete V2 ObjectRefs, not grouped display samples. The same dialog initially limits source cases to that exact set, with a checkbox for the full source. KUM candidates remain complete within the same source. No photo import is required to see missing-file cases. Line diagnostics do not offer this point-only action. Existing Rettinger routing stays intact.

Opening, searching, selecting, previewing, navigating and cancelling have no accepted-data write path. Choices live only in the review component; close, source/revision changes, accepted-position/delivery changes and workspace transitions discard them. The navigation request is ephemeral and outside persisted settings. Existing workspace draft guards remain with their existing owners.

## Implementation details

- `photoHyperlinkReview.mjs` is a pure detector and candidate/review projection. It uses V2 schema binding, `resolveGmiTemaIdentity`, opaque dataset revisions and exact `createObjectRef` identities. Original and proposed datasets can be inspected; original geometry and lexical evidence remain the source of positions and raw cells. FOTO-only sources use a read-only V2 adapter restoring lexical evidence, without reconstructing any export.
- Source/binding, original dataset pointer/revision, proposed dataset/session, exact finding refs and ID/GUID/source-order guards fail closed on stale or mismatched handoffs. The receiving dialog checks the live loaded binding, current revision/session and Validator reference date again.
- Matching of photographs reuses the collision-checked existing GMI photo resolver/ledger. Confident references on one object/asset are visibly grouped with every reference ID retained. Exact raw-reference repetition is separately exposed even without assets; it is not treated as file equivalence. Shared object edges remain separate. Ambiguous imported copies can each be previewed without accepting an association.
- Every resolved KUM in the same source is available. Candidates sort by XY distance, including ties, coincident and distant objects; search and 20-row candidate pagination do not cap the population. No radius is defined. Equal AnleggsID/S_OBJID/point labels are labelled supporting evidence only, using exact current raw lexemes. Numeric parser coercion never equates `001`, `1` or whitespace-distinct identifiers; missing raw evidence establishes no equality. All attributes remain inspectable as text; no unknown parent column is assigned semantics. Topplok heuristics do not establish a relationship and are not reused as an acceptance rule.
- Raw original X/Y/Z, declared CRS, header vertical evidence and object attributes are inspectable. Original and proposed geographic positions retain eight decimal places. Metric declared source coordinates provide planar XY distances; supported geographic coordinates use the existing photo-distance approximation. Missing/unsupported CRS and invalid point geometry produce no invented metric distance. Z/delta-Z remain raw evidence without transformation or a datum-comparability claim.
- Current accepted placements are shown independently, including confidently matched unlinked assets and sibling occurrences. GMI, GML and Ikke decisions are read only. Existing alternative positions, differing delivery intentions, target sibling placements, duplicate GUIDs, missing targets/assets, unsafe paths, aliases and unsupported hyperlink shapes receive explicit explanations. Intended future KUM relocation stays distinct from automatic GMI → GML positioning/delivery behavior.
- The evidence map uses the existing React-Leaflet stack and original/current/proposed points without changing the main map or selection owners. It requests no basemap. Image preview reuses `PhotoImportPreview` and session-owned original Files. Untrusted attributes and hyperlinks render as text.
- Chrome uses shared tokens, compact control recipes, Phosphor icons and Norwegian labels. The review scopes its CSS, uses teal native controls and selected edges, and the approved compact-warning token. No global styling change or new palette/primary variant was introduced.

## Exact file inventory

Application files:

- `src/lib/photos/photoHyperlinkReview.mjs` — new pure model, exact handoff validation and temporary-choice reducer/proposal.
- `src/components/photos/PhotoHyperlinkReviewDialog.js` — new shared read-only dialog and source/session orchestration.
- `src/components/photos/PhotoHyperlinkReviewMap.js` — new evidence-only map using the existing stack.
- `src/components/photos/photoHyperlinkReview.css` — new scoped layout and token styling.
- `src/components/photos/PhotoWorkspaceToolsMenu.js` — FOTO entry.
- `src/components/validation-v2/ValidationV2RuleList.js` — contextual action presentation.
- `src/components/validation-v2/ValidationV2Workspace.js` — detailed finding handoff and point-only applicability.
- `src/app/page.js` — dialog host, existing draft boundary integration, navigation disposal and drop suppression while reviewing.
- `src/lib/store.js` — ephemeral navigation request only.

Tests:

- `tests/photoHyperlinkReview.test.mjs` — new synthetic domain/read-only tests (25 cases).
- `tests/photoHyperlinkReviewUi.test.mjs` — new production workflow, exact restricted/full-source populations, laptop layout/map/token and cancellation/workspace tests.
- `tests/photoInspectorPresentation.test.mjs` and `tests/photoWorkspaceEditUi.test.mjs` — retain exact menu inventory assertions, adding the authorized review entry.
- `tests/gmiBatchFieldValueInputUi.test.mjs` — explicit table, geometry and row readiness before interaction.
- `tests/gmiEditSelectionUi.test.mjs` and `tests/gmiR4UxPolishUi.test.mjs` — wait for the actual ordinary-table entry, table and workspace before interaction.
- `tests/gmiLayerFiltersUi.test.mjs` — wait for the actual table-entry button after layer expansion.
- `tests/helpers/chromeHarness.mjs` — narrowly retry missing-parent `querySelector`/`querySelectorAll` errors inside polling predicates; preserve deadlines and propagate unrelated errors. Catching inside the browser prevents test-predicate errors being recorded as application runtime errors. No application assertions were removed.
- `tests/chromeHarness.test.mjs` — new helper regression covering delayed parents, deadline/diagnostic retention, runtime-event separation and propagation of syntax/intentional errors.

Inventory total: nine application files (including one CSS file), ten test/helper files, this report and eight PNGs. There are 18 affected JS/MJS files. Earlier individual polling changes in `tests/gmiBatchInspectorUi.test.mjs`, `tests/gmiCheckboxSoftFocusUi.test.mjs`, `tests/gmiFieldValueInputUi.test.mjs`, `tests/gmiFieldValueSearchUi.test.mjs` and `tests/gmiTableReviewUi.test.mjs` were removed in favor of the shared helper fix. Git status still lists those five paths as modified, but `git diff --name-only` and `git diff --numstat` show no content changes for them. They are not feature changes; no reset/restore/index refresh was used to clear those flags.

Documentation/artifacts: this report and the PNGs in `20261120-164243-lok-top-kum-batch1a/` listed below. The approved roadmap is not task-owned and was not edited.

## Verification

Passed, failed and skipped results are distinct. Synthetic checks do not close real-file or recipient acceptance. The last full Node run and production build cover the current application source, including the raw-identifier correction. The shared browser-poller change and its new regression were finalized later: only their focused test and lint have run since. Neither complete suite has been rerun on that final test/helper inventory.

| Check | Result |
|---|---|
| Focused synthetic detector/choice/read-only suite | 25 passed, 0 failed, 0 skipped |
| Full serial Node, current app source before final helper consolidation | 2,319 passed, 0 failed, 156 skipped (2,475 cases, 181.563 s) |
| Fresh isolated production build | Passed, `npm run build -- --webpack` |
| Focused production run (review + four Rettinger suites, earlier checkpoint) | 29 passed, 0 failed, 0 skipped |
| Additional focused navigation/review run, earlier checkpoint | 26 passed, 0 failed, 0 skipped |
| Focused batch-field and ordinary-table selection suites | 7/7 and 7/7 passed, separately |
| Complete final-app-build production browser regression | **479 passed, 6 failed, 11 skipped** (496 cases, 732.037 s); details below |
| New shared browser-poller regression, after full run | 1 passed, 0 failed, 0 skipped; approximately 1.14 s |
| Affected JS/MJS lint, final consolidated inventory | All 18 files passed, exit 0, no diagnostics |
| `git diff --check` | Passed, including final checkpoint; only Git line-ending notices |

Commands (PowerShell; temporary output paths omitted only where immaterial):

```powershell
node --test tests/photoHyperlinkReview.test.mjs
node --test --test-concurrency=1 --test-reporter=tap "tests/*.test.mjs"
# In the isolated source copy; all nine affected application files were SHA-256 compared with the repository.
npm run build -- --webpack
# Last full browser run: PHOTO_UI_URL=http://localhost:3152; private/dev opt-ins unset. Server now stopped.
node --test --test-concurrency=1 --test-reporter=tap "tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"
node --test tests/chromeHarness.test.mjs
# Final current inventory (18 JS/MJS files).
npx --no-install eslint src/app/page.js src/lib/store.js src/lib/photos/photoHyperlinkReview.mjs src/components/photos/PhotoWorkspaceToolsMenu.js src/components/photos/PhotoHyperlinkReviewDialog.js src/components/photos/PhotoHyperlinkReviewMap.js src/components/validation-v2/ValidationV2RuleList.js src/components/validation-v2/ValidationV2Workspace.js tests/photoInspectorPresentation.test.mjs tests/photoWorkspaceEditUi.test.mjs tests/photoHyperlinkReview.test.mjs tests/photoHyperlinkReviewUi.test.mjs tests/gmiBatchFieldValueInputUi.test.mjs tests/gmiR4UxPolishUi.test.mjs tests/gmiEditSelectionUi.test.mjs tests/gmiLayerFiltersUi.test.mjs tests/helpers/chromeHarness.mjs tests/chromeHarness.test.mjs
git diff --check
```

The read-only session test checks zero photo-session publications, identical snapshot identity, accepted placements/provenance, unchanged delivery/export snapshot, unchanged source bytes and empty correction history across selection, clearing and reopening. Production tests additionally compare workspace rows/delivery pills, markers, inspector and history before/after close, Escape and workspace transitions. The synthetic Validator example has 66 affected findings, 67 full-source review cases including an unresolved Tema case, and separate point/line geometry. Unit coverage also checks a 65-finding handoff, restricted subsets, stale/tampered identities, proposed Tema, absent/ambiguous/multiple targets, duplicates/shared assets, existing target links, malformed/bare/multi-member/separator/alias/composed grammar, unsafe/unsupported positioning, missing Z and accepted-position/delivery conflicts.

### Outstanding production-browser failures

The six reported failures comprise three root cases, one subsequent marker subtest and two failing parent tests. They are not established as pre-existing and are not waived:

1. `tests/gmiObjectLinkedTemaUi.test.mjs:86`: G8 linked-Tema production test encounters `TypeError: Cannot read properties of null (reading 'querySelector')` during an initial wait. This test had loaded the old helper before the final polling fix. The new helper regression passes, but **G8 itself has not been rerun** against it.
2. `tests/photoMarkerProvenanceUi.test.mjs:288`: “Pass 1D” compares workspace and main-map thumbnail geometry after leaving FOTO. Expected size `44`; actual main-map EXIF thumbnail bounding width `43.99993896484375`. Its exact protected-geometry assertion remains unchanged. The next subtest then reports unavailable “Juster plassering og retning” after the preceding failure prevented normal workspace restoration; the parent also fails. Inspect layout/Leaflet transition settling before diagnosing; no rounding or relaxed assertion was introduced.
3. `tests/photoWorkspaceStacksUi.test.mjs:434`: main-map Miniatyrer/stack-popup subtest times out after 45 seconds waiting for `.photo-map-popup.dataset.photoId` to match the selected synthetic photo. The parent also fails. Cause remains unverified; no fix was attempted at this stopping checkpoint.

The new Batch 1A review UI cases passed in the last full run, including both laptop sizes, explicit choices, cancellation, workspace transitions and restricted Validator handoff. That does not make the complete browser gate green. Earlier full browser runs were 467/8/11, 469/6/11 and 482/1/11 (passed/failed/skipped); narrower readiness fixes resolved observed setup paths in focused reruns, and later full runs passed the formerly failing export keyboard path. Historical green cases do not exempt the current failures.

The helper regression initially used about:blank and timed out during setup; it now explicitly navigates a data URL and passes. It verifies unrelated errors propagate instead of merely matching timeout text. Five redundant per-file poller changes were removed after centralizing this behavior; four genuine navigation/action waits remain. The final helper change is consequential test infrastructure and requires the focused and complete continuation checks below.

Turbopack refused an isolated node_modules junction pointing outside its filesystem root. Production builds therefore used Next's webpack option, with the unchanged installed dependencies and repository configuration. Existing servers on ports 3110–3113 were left alone. A self-copy command in task scratch was rejected without changing source; the corrected absolute source copy was hash-checked before the verified build. Standard module-type and stale Browserslist-data warnings did not require dependency changes.

Scratch evidence/logs (local, not tracked): `%TEMP%/gmi-batch1a-node-final-source.log` and `%TEMP%/gmi-batch1a-browser-final-source.log` contain the final full-suite TAP results. The last verified build log is `%TEMP%/gmi-batch1a-20261120-final/build-final-source.log`; production captures are under that directory's `shots/`. Earlier logs use `%TEMP%/gmi-batch1a-*.log`; isolated source snapshots are under `%TEMP%/gmi-batch1a-20261120/` and `%TEMP%/gmi-batch1a-20261120-final/`. These are temporary local continuation aids, not durable report attachments. No private data is present in these task fixtures.

## Screenshot evidence

Inspected synthetic production captures; the supplied synthetic EXIF image is 1×1, so this proves file/preview binding, not real-photograph visual acceptance.

| View | 1280×720 | 1366×768 |
|---|---|---|
| Explicit KUM/reference choices | [Capture](20261120-164243-lok-top-kum-batch1a/foto-selected-1280x720.png) | [Capture](20261120-164243-lok-top-kum-batch1a/foto-selected-1366x768.png) |
| Original/current/proposed positions and conflicts | [Capture](20261120-164243-lok-top-kum-batch1a/foto-position-evidence-1280x720.png) | [Capture](20261120-164243-lok-top-kum-batch1a/foto-position-evidence-1366x768.png) |
| Evidence map | [Capture](20261120-164243-lok-top-kum-batch1a/foto-map-evidence-1280x720.png) | [Capture](20261120-164243-lok-top-kum-batch1a/foto-map-evidence-1366x768.png) |

[Initial restricted Validator review](20261120-164243-lok-top-kum-batch1a/validator-initial-1366x768.png) and [missing-file review](20261120-164243-lok-top-kum-batch1a/validator-missing-assets-1280x720.png). The map captures show the separate original ring, accepted dashed ring, KUM candidates and proposed movement line. Layout checks require bounded dialog/content width, a reachable footer and usable scrolling at both laptop sizes; native accent and compact warning colour are computed-style assertions.

## Decisions still required before Batch 1B

| Decision | Evidence available now; still undecided |
|---|---|
| Relationship and candidate matching | Every same-source KUM is inspectable, with XY/Z and equal-identifier evidence. Confirm actual parent/reference semantics and any calibrated proximity aid using authorized examples. No radius, parent schema or AnleggsID equivalence has been established. |
| Hyperlink grammar and recovery | Readable whole wrappers and blocked bare/malformed/multi-member/separator/alias/missing-column cases are visible. Agree the initial writable grammar, metadata/ordinal rules and recovery process. Classification here is not a write whitelist; structural column creation remains out of scope. |
| Duplicate/reference grouping | Review follows confident object/asset ledger groups and retains all reference IDs; raw duplicate strings and ambiguous files remain distinct evidence. Confirm grouping and whether independent member selection is needed. No deduplication or merge occurs. |
| Existing target hyperlink reuse | Same confident asset on KUM is labelled “Finnes allerede på KUM”; existing paths/wrappers remain inspectable. Decide explicit source-only-removal approval, metadata/path equivalence and uncertain-collision handling. No reuse or removal is implemented. |
| Accepted positions and delivery intentions | Independent current positions and GMI/GML/Ikke choices are shown; alternatives, sibling placements and differing intentions are flagged. Decide the explicit reconciliation interaction and retained provenance/history rules before applying any relocation. Intentional KUM relocation must remain separate from GMI → GML. |
| Z evidence and recipient interpretation | Source/current raw evidence, target Z, raw delta-Z and vertical attributes/header are inspectable. Establish comparability and recipient interpretation through the later recipient trial; no height transformation or invented height is allowed. |

No Batch 1B planner, paired patch/verifier, ownership mutation, coupled history, export composition or recipient compatibility claim is implemented or authorized here.

## Concise real-data acceptance workflow

1. Load the authorized original GMI and desired photo assets locally using existing workflows. Record counts, accepted positions/provenance, GMI/GML/Ikke choices, correction history, Validator state and export readiness before opening review; keep identifying values out of reports.
2. Open FOTO Verktøy and the review. Confirm the source/photo layer and Original/Foreslått basis. Inspect exact cells, wrapper/reference counts, GUID/source index, shared references, missing files and ambiguous copies.
3. On representative LOK and TOP cases, compare all KUM candidates, equal identifiers, source/current/proposed XY, available Z/reference attributes, existing target links and the map. Domain-confirm a tentative recipient; do not treat nearest distance as proof.
4. Select reference groups and proposed KUM explicitly, including duplicate/shared and already-on-KUM cases. Check a saved alternative position and conflicting GMI/GML/Ikke intentions. Record which Batch 1B decision each case informs.
5. Close by the footer, X and Escape; revisit FOTO and leave/return to its workspace. Confirm accepted state/history/Validator/export readiness stayed unchanged and proposals were discarded. No transfer can be executed.
6. From actual point S_HYPERLINK findings, open “Gjennomgå i FOTO” on both available revisions. Check the complete restricted population and full-source toggle, missing-assets visibility, point-only applicability and stale/unloaded-source explanation.
7. Return the six bounded contract decisions above with observations. Real ownership/undo/export/reimport and recipient acceptance belong to separately authorized Batch 1B; this batch cannot close those gates.

## Persistent progress and Git record

- Start: verified branch, HEAD and tree; only pre-existing change was the untracked approved roadmap. Read AGENTS.md, development/security/privacy instructions and both task plans. No private/reference data was inspected.
- Implemented the pure detector, complete V2 handoff and shared read-only review. Expanded synthetic domain coverage from 20 to 25 tests as identity, position and reference evidence gaps were closed.
- Initial full Node was 2,313 passed / 1 failed / 155 skipped because the exact tools-menu inventory needed the authorized entry. Retained the assertion and updated its inventory. Later full runs passed 2,317/0/156 and 2,318/0/156.
- Used isolated source copies/builds rather than the four existing application servers. Focused browser checks exposed and corrected exact-menu, point-only routing and table/geometry mounting assumptions while retaining behavioral, source-safety and export assertions. Full browser outcomes and outstanding failures are recorded above.
- Corrected a material domain issue: parsed numeric IDs would equate raw `001`, `1` and `001 `. Current labels and identifier evidence now use retained lexical strings; missing raw evidence establishes no equality. Its focused regression passes. The final application source has a passing fresh build and 2,319/0/156 full Node result.
- Final full browser collection finished at 479/6/11. Narrow shared-poller consolidation and its focused regression followed; G8 and full-suite validation of that final test/helper change remain unrun. Marker geometry and stack-popup failures remain unresolved.
- User requested a safe stopping report before allowance exhaustion. Stopped further regression work, completed this checkpoint and stopped the task-owned production server on port 3152. Read-only listening-port verification found no listener on 3152. Earlier task servers on 3147–3150 had already been stopped. Servers originally present on 3110–3113 were not stopped or changed.
- Final observed branch and full HEAD match the start. Staged diff is empty. No staging, commits, pushes, deployment, refs, cleanup, later milestones, usage statistics or user documentation were performed. Git continues to show the task changes plus the preserved untracked roadmap; five status-only paths without content differences are identified in the exact inventory.
- Approved roadmap SHA-256 remains `7E101955B0FA6106EFA8F9C5CBA262D7897135ED6B1EA183D63FE5AE1C4F1C63`.

## Precise continuation instructions

This is a handoff, not an instruction to start another full run in the current turn. The user's latest instruction prohibits another full regression now. Batch 1A cannot be reported fully verified until the unresolved browser cases and final helper integration are checked.

1. Recheck repository, branch, HEAD, tree and this report. Preserve the untracked approved roadmap and every task file. Do not stage, commit, push, reset, restore, clean or change branches. Do not interpret the five status-only paths as content changes or overwrite unrelated work.
2. Start with the current source and the isolated final production snapshot at `%TEMP%/gmi-batch1a-20261120-final/`. Compare its nine affected application files with the repository before reusing the build. The last build matches the current application source; test/helper changes do not require an app rebuild. If the snapshot is missing or any application file changes, create a new isolated copy and fresh production build; do not use an existing server or stale build. Check a free port, then start `node node_modules/next/dist/bin/next start -p <free-port>` from that copy. Keep its PID/session and stop only that server. Configure `PHOTO_UI_URL=http://localhost:<free-port>` for the tests; keep private/dev opt-ins unset.
3. Run focused checks serially against that shared server first:

   ```powershell
   node --test --test-concurrency=1 tests/chromeHarness.test.mjs tests/gmiObjectLinkedTemaUi.test.mjs tests/photoMarkerProvenanceUi.test.mjs tests/photoWorkspaceStacksUi.test.mjs tests/photoHyperlinkReviewUi.test.mjs
   ```

   G8 must actually pass the new poller. For marker provenance, inspect the exact 44-pixel geometry before/after leaving FOTO and whether pending layout/map transitions explain the fractional bounding rectangle. Preserve the geometry contract; do not round or relax assertions to manufacture a pass. For stacks, inspect the selected photo, visible stack/popup, preference and map state at the existing line-434 timeout. Capture focused failure evidence before deciding whether code or harness needs correction. A historical pass is not proof that either failure is pre-existing.
4. After focused failures are resolved, perform the required complete verification in a later authorized continuation: full serial Node (the new helper regression is not included in the last full count), fresh build if application source changed, complete production browser serially on that matching build, affected-file lint and diff checks. Avoid concurrent builds/heavy runs while collecting browser results. Do not predict a passing total or count skipped/private checks as passes.
5. Refresh laptop screenshots if behavior/layout changes, inspect them and update this report with exact commands/results, file inventory, unresolved limits and final process/Git state. Close only task-owned processes. The six Batch 1B decisions and real-data acceptance workflow above remain outstanding; no writable transfer work is authorized by this continuation.

## Final checkpoint checks

2026-11-20 18:11 Europe/Oslo: all 18 current affected JS/MJS files passed the exact ESLint command above (exit 0, no diagnostics). `git diff --check` passed; Git printed LF/CRLF notices only. All ten relative report links resolve, including the eight named PNGs; report trailing-whitespace check passed. Port 3152 has zero listeners. The roadmap hash, branch, HEAD and empty staged diff were rechecked immediately before this final checkpoint. No further regression was started after the user's stopping instruction.

Remaining verification is explicit: rerun G8 against the final helper, resolve/recheck marker geometry and stack-popup failures, then complete the final integrated Node/browser gates in a later continuation. Real-data/manual and recipient acceptance remain separate. This checkpoint does not claim Batch 1A is fully verified or ready for Batch 1B implementation.
