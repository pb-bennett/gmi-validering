# Unified FOTO source workflow — Slice 1 implementation

Date: 2026-10-19. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`. Baseline and final HEAD: `7ae55f1`.

## 1. Task / scope

Implemented Slice 1 from [the planning report](20261019-photo-unified-source-workflow-planning.md): one central source/link/position workflow for an existing FOTO collection. The pre-existing untracked planning report was read first and preserved. Current implementation governed the migration.

No commit, push, delegated/background agent, dependency change, private-fixture modification or Slice 2 implementation was performed. `data/usage/aggregates.json` was left alone; no task command edited it or changed its index flags.

## 2. Implementation summary

**Koble og posisjoner bilder** replaces the independent positioning and GMI-association dialogs and direct inspector source-position apply buttons. Its stages are **Kilder → Koblinger → Posisjoner → Oppsummer**.

The workflow has two explicit checkpoints: save a source/its associations or position evidence, then optionally accept selected current positions. The dialog stays open after source confirmation. GMI-only use can finish there. Another external source can be added/rechecked without returning to the workspace, with one unsaved external source at a time.

Position review combines retained usable GML and EXIF evidence, offers an explicit choice per photo, keeps existing current positions by default and applies mixed-source selections atomically. Source attachment and metadata arrival never choose current positions. Manual placement and direction remain separate workspace operations.

## 3. Files changed

| Area | Files and responsibility |
| --- | --- |
| Page/controller | [src/app/page.js](../../src/app/page.js): one workflow context, inspector/workspace entry, owner deletion cleanup, existing edit cancellation, updated unplaced-photo guidance. |
| Central dialog | [PhotoPositioningWizard.js](../../src/components/photos/PhotoPositioningWizard.js), [photoPositioningWizard.css](../../src/components/photos/photoPositioningWizard.css): four stages, source management, both checkpoints, combined comparison/selection and constrained layouts. |
| Workspace / inspector | [PhotoWorkspaceCollection.js](../../src/components/photos/PhotoWorkspaceCollection.js), [PhotoSpatialInspector.js](../../src/components/photos/PhotoSpatialInspector.js), [PhotoCollectionPanel.js](../../src/components/photos/PhotoCollectionPanel.js): one entry, combined history and focused inspector navigation; direct acceptance removed. |
| Import | [PhotoCollectionDialog.js](../../src/components/photos/PhotoCollectionDialog.js): GML described as retained source data, with explicit instructions to review positions centrally after import. |
| Retired workflow | `src/components/photos/PhotoGmiDialog.js` deleted. Existing GMI summary/inspector components are reused. |
| Domain / presentation | [photoSession.mjs](../../src/lib/photos/photoSession.mjs), [photoPositioning.mjs](../../src/lib/photos/photoPositioning.mjs), [exifGps.mjs](../../src/lib/photos/exifGps.mjs): operation tickets, source checkpoint, guarded mixed apply, position projection, candidate-only import/append and ordinary GPS wording. |
| New tests / helper | [photoSourceWorkflow.test.mjs](../../tests/photoSourceWorkflow.test.mjs), [photoSourceWorkflow.mjs](../../tests/helpers/photoSourceWorkflow.mjs): 24 focused domain/contract cases and browser interactions through actual product controls. |
| Updated domain regressions | `tests/photoSpatial.test.mjs`, `photoWorkspace.test.mjs`, `photoAppendDuplicates.test.mjs`: new import semantics and explicit setup of already accepted positions where required by the original regression. |
| Browser / real parser integration | `tests/photoPositioningUi.test.mjs`, `gmiPhotoAssociationsUi.test.mjs`, `photoAppendDuplicatesUi.test.mjs`, `photoDirectionUi.test.mjs`, `photoManualPlacementUi.test.mjs`, `photoSpatialUi.test.mjs`, `photoWorkspaceUi.test.mjs`, `tests/browser/photoSpatialChecks.mjs`: new checkpoints and explicit source acceptance, retaining the previous domain/lifecycle coverage. |
| Report | This implementation report. |

The shared hyperlink parser/copy implementation, GMI association adapter/matching policy, survey upload/store/layer actions, manual-placement and direction controls/hooks, lightbox implementation, package manifests and lockfile are unchanged.

## 4. Workflow architecture

The page owns a single `photoSourceWorkflow` context: owner layer plus optional retained source/photo focus. Collection actions, retained-source recheck and inspector entry all open this same dialog. There are no independent GMI/positioning modal booleans in the collection.

The dialog owns navigation, a saved-checkpoint notice, selected position choices and an immutable review projection. Authoritative assets, sources, candidates, current positions, links and direction stay in `photoSession`. Session operation tickets contain operation ID, generation, layer ID and exact membership identity. A newer workflow invalidates the previous ticket; an old cleanup cannot cancel its replacement.

Kilder shows built-in EXIF availability and retained source inventory. Koblinger reviews one staged external source and its contribution. Existing-evidence/EXIF-only review can go straight to Posisjoner. Oppsummer confirms the chosen current-position changes, not another source attachment.

## 5. Source checkpoint behavior

`saveSourceWorkflowSource(ticket, expectedReview)` checks live operation/membership and the exact immutable reviewed source. GMI delegates to the existing association-only confirmation, including its exact ledger guard. GML validates every prospective attachment before writing, then uses candidate-only source attachment.

After success the dialog remains open and displays:

> Kilder og koblinger er lagret. Posisjoner er ikke endret.

Before this checkpoint the controls say **Avbryt**. Afterwards the header says **Lukk**, and the footer offers **Fullfør uten å endre posisjoner**. Closing cancels only pending reads/reviews/proposals; confirmed sources and links remain retained. An additional source can be selected within the same dialog after the previous source is saved or explicitly discarded.

## 6. Mixed position apply behavior

`reviewSourceWorkflowPositions(ticket)` creates a session-registered plan from retained evidence. `applySourceWorkflowPositions(ticket, plan, requests)` accepts different GML/EXIF choices in one batch.

All requests are validated before the first write: live session-issued operation, unchanged owner membership/source set, session-issued plan, unique photo requests, exact reviewed current identity, exact retained candidate identity, valid position and a retained GML source where applicable. A stale or invalid request rejects the whole batch. The successful operation changes only `spatial.current` using the latest live records and publishes once.

The reviewed source set is never attached as a side effect of final position apply. Direction, preview, dimensions, source evidence, GMI links, original File identity and outside selection remain intact. A same-coordinate selection can explicitly switch accepted source basis; it is shown as **Samme posisjon** in the summary.

## 7. GMI integration

The existing source/object/member identities, full-byte source fingerprints, many-to-many association implementation and owner-scoped matching are reused unchanged. The unified source checkpoint retains matched, unmatched, ambiguous and invalid references.

GMI supplies no position entry, candidate or current-position request, regardless of Type/TEMA/point/line geometry. It writes no direction. Position rows show referring-object counts only as context, for example **GMI: koblet til 2 objekter**. The explanatory copy states that GMI links photos to objects and supplies no photo positions.

The real seven-photo object, shared photo with two referring objects, repeated source GUIDs, invalid directory target and append/recheck provenance behavior remain covered by the existing domain/corpus/browser regressions.

## 8. GML behavior changes

The GML source checkpoint retains matched position evidence and diagnostics without changing any current position, including for an unplaced photo. Recheck also remains evidence-only.

The combined plan recalculates owner-scoped GML matching and only offers viable, unambiguous retained evidence. Multiple retained GML sources remain distinguishable through filename and source-list number, including sources sharing a filename. No source receives authority from arrival order, matching distance or GMI object links.

The existing parser, CRS/projection behavior, raw provenance, duplicate-reference rules and fingerprint semantics are unchanged. Lower-level legacy APIs remain for internal callers/tests, but product controls use the central guarded workflow.

## 9. EXIF behavior

EXIF remains photo-owned evidence and needs no external-file selection or removable layer source. Availability, pending metadata reads, absent GPS and unusable GPS states are shown. Questionable 0°/0° evidence retains its warning.

A frozen review does not acquire newly arrived EXIF options or silently expand its apply set. The dialog announces new evidence/status and offers **Oppdater kontrollen**. Refresh preserves valid existing exact-ID choices and leaves newly available choices unselected. Previously reviewed choices can still be applied if their candidate/current identities remain valid.

An unplaced photo with one usable option can have it proposed, but explicit final acceptance remains necessary. Several usable options require a choice. Already positioned photos default to **Behold gjeldende**.

## 10. Import / append migration

The implicit-accept branch was removed from `attachSource`. `createLayer` and `appendImport` now retain supplied GML evidence without making it current. This changes new operations only; no already accepted record is migrated or rewritten.

Ordinary image-only import, incoming-only append curation, duplicate-name skip/override policy, metadata jobs, File ownership and cleanup remain intact. Existing target photos/current positions are preserved on append.

The importer still supports optional GML selection/drop **as source-data retention**, explicitly labelled **Legg til GML-kildedata**. Import confirmation can retain that evidence with the curated collection, but it provides no position apply operation. Its copy directs the user to **Koble og posisjoner bilder** afterwards. This retains the supported import capability without a second position-acceptance UI.

The append browser regression now demonstrates 142 already placed photos plus six unplaced additions after import; only a subsequent explicit central apply returns the marker count to 148.

## 11. Inspector / UI migration

The collection has one primary **Koble og posisjoner bilder** action and one collapsed **Kilder og koblinger** history. **Kontroller på nytt** opens the exact retained source in the central dialog.

Direct per-photo **Bruk EXIF-posisjon / Bruk GML-posisjon** mutation buttons were removed. **Kontroller kilder og posisjon** opens the same dialog with the inspected photo context. That photo appears first in position review; a focused entry does not preselect unrelated photos. Explicit bulk proposal actions remain available within the wizard.

Inspector current position/basis, GML/EXIF evidence, source details, GMI associations, direction, metadata and navigation-only zoom controls remain. The old GMI dialog and its parallel entry are removed. No new wizard is embedded in the inspector.

## 12. Manual placement boundary

Manual placement/movement remains in the normal FOTO workspace with the same controls, map proposal and apply/cancel behavior. No manual click/drag/coordinate editor was added to the source dialog.

Opening the central workflow calls the existing page-owned manual/direction cancellation lifecycle. Accepted manual positions and known/unknown direction remain. A manual current defaults to keep-current and can be replaced only by a newly reviewed explicit source-position confirmation.

The existing manual and direction browser suites passed after changing their source-acceptance setup to use the actual central UI. Their click/drag/keyboard, anchor geometry, cancellation, unknown-versus-north and source-independence checks remain.

## 13. Recheck / removal behavior

Both GMI and GML recheck use the same dialog and exact retained source ID; no file picker is required. Duplicate-file analysis offers/reuses the retained source via existing duplicate-source handling.

GMI confirmed endpoints remain stable across append/recheck. Append alone creates no GMI links; newly resolvable references require explicit recheck. Photo removal prunes live endpoints while retaining the reference evidence and diagnostics.

GMI source removal is available in the central inventory with inline confirmation. It uses existing safe removal, affects only that owner source/links and does not change photo position/direction. It introduces no nested modal.

**GML removal was not added.** No fake or disabled GML removal affordance is rendered. EXIF is not treated as a removable external source.

## 14. Transaction / stale-state guards

The operation registry validates session generation, session-issued ticket identity and the exact owner membership array. Deletion/reset invalidates tickets. A replacement operation invalidates the old one, clears its pending review and publishes the cleared public snapshot immediately.

Source confirmation validates the immutable source/recheck context; GMI retains its original exact-ledger and membership guards. GML preflights all matched candidate constructions so an invalid later entry cannot leave earlier candidates partially attached.

Position confirmation validates every selected current/candidate and the retained source-set identity before publishing any changes. Plans from another operation, fabricated plans, duplicate requests, wrong/foreign candidate IDs, source changes, member removal, current changes, reset and deletion are rejected with no partial current writes. Consumed plans cannot be replayed.

Cancellation invalidates outstanding source reads using existing request counters. Pending metadata/preview completion patches only its owned fields and cannot revive a cancelled/deleted owner or replace accepted direction/current state. A late cleanup from an older workflow cannot cancel a newer ticket.

## 15. Tests added / changed

`photoSourceWorkflow.test.mjs` adds **24 tests**, including parameterized stale-operation cases. Coverage includes GMI → EXIF in one operation, zero GMI spatial/direction writes, GML evidence-only save, mixed GML/EXIF apply, manual keep-current defaults, distinguishable GML sources, same-position basis changes, candidate-only import/append, cancellation on both sides of the checkpoint, EXIF arrival, ambiguous matching, source recheck, old/new operation isolation, invalid GML attachment atomicity and product UI contracts.

The existing spatial/workspace/append regressions now assert the new import behavior. Where a regression specifically tests an already accepted position surviving async work/removal, it performs explicit acceptance as setup rather than relying on import-time placement.

Browser helpers operate through real dialog controls, not hidden session mutations. Existing suites were migrated away from retired labels, source radios and inspector apply buttons. The positioning browser suite now covers the complete two-checkpoint product flow and a real 148-photo comparison/apply flow.

Final selected domain/production regression run: **293 tests; 289 passed, four known baseline failures, zero skipped/cancelled**. All 24 new workflow cases passed. The passing set includes hyperlink/table/popup copy, GMI, photo session/positioning/import/append, manual, direction, preview/reset/lifecycle, AppInfo/release metadata and object-table inspection/grouping regressions.

## 16. Browser acceptance

The full production browser selection passed **11 tests across nine files, zero failed/skipped**, approximately 133 seconds:

- `gmiPhotoAssociationsUi`: synthetic/pinned real grammar plus private G01/G04 association cases.
- `photoAppendDuplicatesUi`, `photoDialogLayout`, `photoDirectionUi`, `photoManualPlacementUi`.
- `photoPositioningUi`: unified workflow and real 148-photo evidence/explicit acceptance.
- `photoSpatialUi`, `photoWorkspaceUi`, `terrainPhotoGml`.

After the final lifecycle/focus audit, rebuilt production source and reran the two affected positioning browser tests: **2/2 passed**, zero skipped. This final check also verifies focused inspector entry, source removal without position changes, and FOTO → AppInfo → Nytt 1.2.0 → close retaining the active photo and all markers.

Layout checks cover 1680×900, 1366×768, 1280×720, 1024×768 and 1024×620. Content overflow and footer bounds are asserted. Screenshots at all five sizes are outside git in `%TEMP%\source-slice1-screenshots`; 1680×900 and 1024×620 were visually inspected. The dialog retains one content scroller and reachable fixed actions, without a permanent internal three-pane redesign.

Chrome used the existing CDP harness with isolated profiles and the local production server. Browser execution required reviewed access outside the sandbox, as in baseline acceptance. Profiles and temporary synthetic fixtures were cleaned up by the tests; the verification server was stopped afterwards.

## 17. Real-fixture acceptance

Inputs remained outside the repository:

- `C:\temp\gmi examples`.
- `C:\Temp\gmi-photo-test\Ekenesstokken\20251120-bilder\20251120-Ekenesstokken-bilder.gml` and sibling Attachments.

The GMI corpus acceptance retained **12 files, 1,386 objects, 303 occurrences, 302 matched valid references and one invalid directory target**. The 95 repeated-GUID groups and two changed-geometry groups remain source-scoped. Matching methods remain 271 exact relative paths and 31 exact basenames. The corpus test checked all 585 file hashes unchanged.

Private G01/G04 browser cases passed with 94 and 31 matched reference occurrences respectively, including shared-photo object inspection and seven-photo behavior.

Ekenesstokken retained 148 GML matches, independent EXIF evidence and 136 distinct geographic locations. The new import/browser path starts with zero accepted source positions, then explicitly applies reviewed GML and EXIF batches. The actual browser DOMParser/File/EXIF/session acceptance also passed its eight internal checks and 148-photo resource/lifecycle section.

A separate recursive inventory/hash manifest covered both fixture roots: **734 paths and SHA-256 hashes unchanged** after acceptance. No original GMI, GML or photo was edited or copied into git.

## 18. Build / lint / diff results

- **Production build passed:** `npm.cmd run build -- --webpack`, final source; TypeScript checks, static pages and route generation completed. No package/configuration changes. Existing Browserslist age notice remains.
- **Targeted ESLint passed, exit 0:** every touched surviving JavaScript/module/test file plus the two new test/helper files. This is not a repository-wide clean-lint claim.
- **`git diff --check` passed.** New report/test/helper files were separately checked for trailing whitespace because untracked files do not appear in ordinary diff checks.
- HEAD remains `7ae55f1`. Work remains uncommitted/unstaged. The initial planning artifact remains present. No unrelated production files were changed.

Temporary logs, outside git:

```text
%TEMP%\source-slice1-domain-final.tap
%TEMP%\source-slice1-browser.tap
%TEMP%\source-slice1-ui-final.tap
%TEMP%\source-slice1-build-final.log
%TEMP%\source-slice1-eslint-final.log
%TEMP%\source-slice1-fixture-hashes.json
%TEMP%\source-slice1-screenshots\
```

## 19. Known baseline failures

The four persistent failures match the known pre-slice source-pattern contracts:

1. `tests/appInfoUiContract.test.mjs:88`: old conditional-sidebar pattern.
2. `tests/validationV2WorkspaceInspector.test.mjs:7`: old sidebar source pattern.
3. The same file at line 34: old unconditional bottom-dock/MapView source pattern.
4. The same file at line 103: old MapView source pattern.

They already failed at the merged baseline and were not weakened or rewritten for this slice. All other selected production/domain regressions passed.

Untouched shared-file ESLint findings in LayerPanel/MapInner/TanStack integration remain baseline issues; touched-file lint is clean. Default Turbopack Google Fonts resolution had failed in prior verification. This slice used the previously validated production Webpack path and does not claim that the default Turbopack path is repaired.

## 20. Remaining issues

No new implementation defect remains from focused domain, real-fixture, browser, layout, build or touched-file lint verification. The repository is not globally green because the four baseline contracts remain failing.

Intentional boundaries: GML removal is absent; sources/photos remain session-only; unsupported/invalid evidence cannot be applied; unresolved matching is not manually guessed; no accuracy or authority is inferred from close coordinates. A source retained during ordinary import is not a position acceptance. Source file/CRS/profile limits remain unchanged.

The two-save model deliberately preserves a confirmed source when position review is closed. Product wording and saved-status visibility are important manual acceptance points, not an all-or-nothing rollback promise.

## 21. Manual checks recommended

1. In an existing collection, add GMI, save links, then add/use GML or EXIF and accept a mixed selection without leaving the dialog. Check that saved versus unsaved cancellation feels clear.
2. Review the main labels and source summaries with ordinary users, including source-only completion, missing/ambiguous references and multiple GML files sharing a name.
3. Open from a photo near the end of a large collection; confirm its focused row is first and unrelated photos are not preselected by inspector entry.
4. Compare a manual current with GML/EXIF, preserve it, then explicitly replace one selected current position. Confirm direction and source history remain.
5. Import/append with GML, verify new photos remain unplaced, then apply their chosen positions centrally. Review the extra explicit action as an intentional product change.
6. Recheck/remove GMI, close after saving, and reopen. Inspect both spacious and short desktop layouts and keyboard/Escape/focus behavior.

## 22. Slice 2 was NOT implemented

No loaded-GMI-layer Add photos action, loaded-source byte/evidence registry, exact map-layer GMI fingerprint binding, GMI-context folder picker, GMI-derived FOTO creation/target selection, or photo-to-GMI map navigation was added.

Survey loading, map-layer identity and validation ObjectRef contracts remain untouched. GMI geometry still supplies no photo position. Export and persistence were not added. This delivery is the FOTO-side unified workflow only, ready for manual product acceptance before a separately authorized Slice 2.
