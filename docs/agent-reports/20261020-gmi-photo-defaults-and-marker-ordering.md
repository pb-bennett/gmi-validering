# GMI photo defaults and marker ordering

Date: 2026-10-20. Workspace: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`. Starting HEAD: `3fa1417`.

## 1. Task and scope

Focused functional UX correction to the existing unified source workflow and FOTO map stacking. No commits, pushes, delegated agents, dependency changes, fixture edits, or broad UI redesign.

## 2. Manual acceptance findings

Valid GMI occurrence candidates and explicit apply already worked, but multiple-source rows defaulted to unplaced, all bulk-source controls appeared regardless of evidence, and source confirmation required another navigation action before position review. The FOTO pane at 590 sat below ordinary survey point markers in Leaflet's marker pane at 600.

## 3. Proposal-default rule

An unplaced occurrence with exactly one usable occurrence-specific GMI option defaults to **GMI – objektposisjon**, including when EXIF and/or GML alternatives exist. Multiple GMI candidates for one occurrence require review. Unusable geometry/CRS, absent occurrence provenance, removed sources and mismatched source fingerprints do not supply GMI options. Existing parser/projection checks remain authoritative.

Proposals never write accepted positions. Source checkpoint A still writes no current positions; summary also writes none. Only the existing guarded final apply accepts selected candidates.

## 4. Existing-position preservation

Manual, EXIF, GML and existing GMI current positions all default to **Behold gjeldende**, preserving current object identity. Direction is independent. Users may deliberately choose a replacement before explicit final apply.

## 5. Multi-source behavior

GMI is the initial proposal for an unplaced occurrence with one usable GMI candidate, irrespective of EXIF/GML alternatives. Alternatives remain selectable, coordinate comparisons and discrepancy warnings remain, and the UI makes no accuracy claim. Without usable GMI, existing single-option defaults and conservative multiple-option behavior remain.

## 6. Repeated occurrences

Each occurrence retains its exact point candidate, selection identity and provenance. Every unplaced repeated occurrence receives its own GMI proposal; no choose-one-point step or collapse is introduced. Existing repeat warnings remain. Tests cover two through thirty distinct referring points sharing one asset, as well as thirty unplaced photo rows. Accepted positions, manual movement and direction remain occurrence-scoped.

## 7. Source-action visibility

Bulk GMI/GML/EXIF actions derive from usable options in the visible reviewed rows, the same options rendered in the selectors. Absent sources have no button. One usable option anywhere in that set is sufficient to render its source action. Existing source buttons remain useful for restoring proposals or an explicit batch override.

## 8. Common-flow simplification

Confirming GMI source/links now immediately enters **Posisjoner** in the same dialog. Straightforward GMI placements are already selected and counted. The user reviews exceptions, enters **Oppsummer**, and explicitly applies. The four-stage structure and source-saved status remain; no extra GMI bulk click is needed. GML source confirmation retains the existing multi-source navigation behavior.

Focused inspector entry continues to avoid selecting unrelated photos.

## 9. Refresh and recheck

The wizard retains its prior review when navigating back, staging another source, rechecking or removing a source. Refresh rebuilds the authenticated session plan while preserving exact valid choices, including deliberate keep/unplaced choices. Candidates are compared by complete immutable evidence and current identity, rather than ID alone; removed/changed evidence clears the affected choice for review.

EXIF async arrival does not mutate frozen review choices. Refresh exposes its alternative without replacing a GMI proposal. GML attachment likewise preserves valid GMI proposals. GMI recheck retains valid reviewed choices.

The wizard tracks explicit row/bulk edits. Confirming a new GMI source may replace an earlier *automatic* EXIF proposal with the new GMI default; a valid deliberate EXIF or unplaced choice survives. Refresh alone does not invoke this source-confirmation behavior.

## 10. Map pane and z-order change

`photoMapPanes.mjs` defines stable FOTO marker and manual-placement panes. Explicit pane props bind camera markers, proposal markers and connector paths to them.

| Content | Pane z-index |
| --- | ---: |
| Survey highlight casing | 390, unchanged |
| Ordinary survey vectors | 400, unchanged |
| Ordinary survey point markers and existing survey selection behavior | 600, unchanged |
| FOTO camera markers, selected cameras and their direction SVG | 620 |
| Manual FOTO proposal and connector | 640 |
| Leaflet tooltips | 650, unchanged |
| Popups | 700, unchanged |

Selected FOTO retains its existing marker offset within the FOTO pane. Survey selection/hover rendering is otherwise untouched. Popup pane and camera popup anchor are unchanged. Map controls and modal UI are not moved or elevated by these changes.

## 11. Files changed

Production:

- `src/lib/photos/photoPositioning.mjs`: guarded GMI proposal defaults, usable bulk-source projection and choice reconciliation.
- `src/lib/photos/photoMapPanes.mjs`: new shared pane ordering constants.
- `src/components/photos/PhotoPositioningWizard.js`: immediate GMI review, evidence-driven actions, preserved review choices and explicit-edit tracking.
- `src/components/photos/PhotoMarkersLayer.js`: explicit FOTO pane at 620.
- `src/components/photos/PhotoManualPlacementLayer.js`: explicit proposal/connector pane at 640.

Tests:

- `tests/photoGmiDefaults.test.mjs`: new focused projection, visibility, stale/malformed evidence, ambiguity and refresh tests.
- `tests/gmiPhotoPlacements.test.mjs`: defaults, thirty occurrences, accepted-current kinds, source combinations and async/recheck behavior.
- `tests/gmiPhotoPlacementCorpus.test.mjs`: real-corpus default counts and exact source-action assertions.
- `tests/gmiPhotoPlacementsUi.test.mjs`: direct source-to-position flow, initial choices/count, absent GML control, explicit apply, loaded survey pane order, repeated marker selection, proposal/direction panes and existing lightbox/manual lifecycle.
- `tests/photoPositioningUi.test.mjs`: corrected initial count and explicit deselection before its intentionally mixed two-position batch.

This report is the eleventh changed/new file. Original fixture files remain external to the repository.

## 12. Tests

Final domain/source/corpus/lifecycle selection: **227 tests, 223 passed, four known baseline failures, zero skipped/cancelled**. The four failures are exactly the contracts listed in section 16. The focused final proposal/placement/source selection also passed **80/80**, including the defensive missing-occurrence-and-provenance case. All newly added cases pass.

Coverage includes all requested categories: default proposals, thirty rows/occurrences, all four accepted-current bases, repeated placement identities, GMI with each source combination, absent/present bulk sources, EXIF arrival, GML attachment, deliberate-choice preservation, unusable/stale/malformed evidence, inconsistent multiple GMI candidates, both explicit checkpoints, map ordering, selection, direction, manual movement and lightbox.

## 13. Browser acceptance

Verification uses the existing Chrome CDP harness and a local production Webpack server. No hidden session mutation is used to establish product state. The GMI placement flow uploads synthetic decodable GPS images and a GMI source, confirms checkpoint A, verifies initial proposals/alternatives/counts, reviews and applies, loads that same GMI as an ordinary survey layer, then checks actual DOM pane parents/computed z-indices and repeated marker selection. It also verifies manual proposal ordering, accepted direction SVG, shared original URL/lightbox, recheck and removal.

Initial sandbox browser startup timed out at `Runtime.enable`; reviewed execution outside the sandbox succeeds. An intermediate regression run against an older running server overlapped the final build and failed two welcome-dialog waits. A fresh server and the complete final selection are used for authoritative final acceptance; the earlier failed run is retained in the logs.

The complete production browser selection passed **12/12 tests, zero failed/skipped/cancelled**, in approximately 144 seconds. This includes the GMI placement case, two unified position cases, synthetic and private GMI associations, manual placement, direction, survey coexistence, workspace/lightbox, append, dialog layouts and actual browser XML/EXIF/session integration. After the final defensive provenance guard, the affected GMI placement and unified position cases passed **3/3 again** against the final rebuilt production server, with zero failures/skips. All verification servers were stopped afterwards.

## 14. Real-fixture acceptance

`C:\temp\gmi examples`: 12 sources, 391 owner-scoped imported asset identities, **302 usable unplaced point occurrences and 302 automatic GMI proposals**. Two repeated assets account for four separately proposed point occurrences. No unusable CRS/geometry among matched point occurrences; no unmatched or ambiguous references. One invalid directory reference remains association diagnostics, not a placement.

Bulk actions exactly match usable reviewed evidence: GMI only for nine point-contributing sources, no bulk-source action for three sources without usable matched photo points. Corpus identity-only reconciliation intentionally does not decode EXIF or attach GML; actual image/EXIF/GML browser checks provide that separate coverage. All **585 fixture file hashes** remained unchanged.

`C:\temp\gmi-photo-test\Ekenesstokken`: one GMI source, 148 delivered asset identities, **zero matched usable GMI occurrences and zero GMI proposals**, with 53 unmatched GMI references and no bulk-source action. All **150 fixture file hashes** remained unchanged. The separate real 148-photo GML/EXIF browser case verifies those alternatives and explicit acceptance.

Private G01/G04 browser cases also exercise delivered images and GMI sources: 92 assets/94 matched references and 31 assets/31 matched references respectively. Marker stacking is tested using loaded GMI geometry in the synthetic product flow; the corpus reconciliation itself does not render a browser map.

## 15. Build, lint and diff

Production `npm.cmd run build -- --webpack` passed with exit 0. Touched-file ESLint passed with exit 0. `git diff --check` passed; untracked text files are also checked separately. Existing Browserslist age notice remains. Final terminal summary records the completed checks.

Verification logs outside git:

- `%TEMP%\gmi-defaults-domain-final.tap`
- `%TEMP%\gmi-defaults-provenance-final.tap`
- `%TEMP%\gmi-defaults-browser-final.tap`
- `%TEMP%\gmi-defaults-browser-smoke-final.tap`
- `%TEMP%\gmi-defaults-build-final.log`
- `%TEMP%\gmi-defaults-eslint.log`

The sandbox startup and intermediate server/rebuild failure logs remain in `%TEMP%\gmi-defaults-browser-first.tap` and `%TEMP%\gmi-defaults-browser-regressions.tap`. They do not represent additional unresolved product failures.

## 16. Known baseline failures

The broader selected regression suite retains exactly four known stale source-pattern contracts: `appInfoUiContract.test.mjs`'s old sidebar condition, and `validationV2WorkspaceInspector.test.mjs`'s old sidebar, dock/MapView and MapView/Viewer3D patterns. They were not changed or weakened.

Unrelated shared-file lint findings remain outside scope. The known default Turbopack Google Fonts problem was not repaired; production verification uses Webpack.

## 17. Remaining issues

No new functional defect is currently identified in the focused correction. Coincident occurrences retain independent markers and collection selection but can visually overlap, as before. Unsupported evidence still requires review; missing links are not guessed. The repository is not globally green because the four baseline contracts remain failing.

## 18. Deferred final UI pass

Broader spacing, typography, inspector proportions, wizard hierarchy, cards and copy polish remain deferred. Only functional defaults, relevant source actions, direct GMI review and map visibility changed.

## 19. Slice 2 was not implemented

**Slice 2 was NOT implemented.** No survey-layer photo-import entry, loaded-source byte registry, GMI-layer binding, GMI-context folder picker, derived FOTO creation, source/map navigation, persistence or export work was added. No commit or push was performed.
