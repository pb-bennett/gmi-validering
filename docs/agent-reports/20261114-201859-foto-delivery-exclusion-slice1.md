# FOTO delivery exclusion - Slice 1 completion

Implemented 2026-11-14 on `feature/photo-workspace`, HEAD `6304749`. Branch and HEAD matched the request. Initial working tree contained only the three protected untracked planning reports; none was edited. No subagents were launched.

## Scope and outcome

Occurrence-level exclusion is implemented in the existing M8 decision map. Linked inspector choices are GMI, GML and `Ikke med`. Whole-photo exclusion, bulk commands, actual exclusion export removal, report/inventory integration, line-linked exclusions and mode-policy D3 remain outside this slice.

### Data model and safety

- Linked exclusion is `{kind: 'gmi', occurrenceKey, intent: 'exclude'}` in `deliveryDecisions`. Photo records and original files are unchanged.
- The existing identity and confident-association gate apply equally to transfer and exclusion. Session selections validate before any write and publish once. Repeated decisions are no-ops; unsafe or stale selections cannot partially write.
- Restoring a linked exclusion deletes its decision and returns to GMI. Unlinked inclusion/not-selected semantics remain unchanged.
- Stale source/occurrence/association evidence produces review, retaining the original exclusion intent in diagnostics. Review blocks delivery. `setCombinedDeliveryInclusion(false)` can now clear a `link-removed` stale GMI decision; the unlinked `Ikke med` option is enabled for that resolution.
- Snapshots include exclusions, derived asset states (`included`, `excluded`, `partial`, or `review`), asset exclusion lists and counts. Retained line links and removed-workspace-placement links participate in asset derivation. One occurrence never modifies its siblings. State keys include the new snapshot information.
- `removalSelections` remains transfers-only. Combined/split planning stops with `exclusions-not-supported-yet` while resolved linked exclusions exist. No blocked plan exposes revised bytes or permits package generation. Existing unresolved-decision blocking remains in force. GMI-only and photos-only semantics are unchanged.
- M7, the GML generator, attachment writer and ZIP implementation were not modified.

### UI and interactions

- The inspector uses the existing radiogroup, check marks, keyboard arrows, mouse controls and GMI/GML/neutral palette. Tooltip text explains delivery exclusion and keeping the photograph in FOTO.
- Shared-photo exclusion explains that the file remains delivered through other placements or GMI links. Exclusion of an entire asset is derived; there is no whole-photo action.
- Excluded pills/markers restore their occurrence. Normal included linked pills/markers continue GMI <-> GML and never exclude.
- The overlapping-marker popup explicitly disables creation of linked exclusions, keeping exclusion an inspector choice. It can show an existing exclusion and offer restoration.
- Destination counts, the compact summary, exclusion filter and marker/legend labels include the new status. The general label is `Ikke med i leveransen`.
- Existing row navigation, selection, map location, workspace removal and direct-click planning without checkboxes remain intact.
- Existing neutral fill now uses an existing white ink token, and disabled toggle options have reduced opacity. No new colour token, global styling or visual variant was introduced.

## Exact files changed

Application:

- `src/lib/photos/photoDeliveryIntent.mjs`
- `src/lib/photos/photoSession.mjs`
- `src/lib/photos/photoDeliveryChoice.mjs`
- `src/lib/photos/photoMarkerPresentation.mjs`
- `src/lib/photos/photoWorkspaceState.mjs`
- `src/lib/delivery/deliveryPlan.mjs`
- `src/lib/delivery/deliveryWizard.mjs`
- `src/components/photos/PhotoDeliveryControls.js`
- `src/components/photos/PhotoDeliveryToggle.js`
- `src/components/photos/PhotoDeliveryMapPopup.js`
- `src/components/photos/PhotoWorkspaceCollection.js`
- `src/components/photos/PhotoWorkspaceInspector.js`
- `src/components/photos/photoWorkspace.css`

Tests:

- `tests/photoDeliveryIntent.test.mjs`
- `tests/photoDeliveryPlanning.test.mjs`
- `tests/photoDeliveryIntentUi.test.mjs`
- `tests/photoMarkerProvenanceUi.test.mjs`
- `tests/deliveryPlan.test.mjs`

Report: this file. `photoWorkspaceView.mjs` already derives status filters/counts from the shared registry, so it needed no change.

## Verification

Passed:

- Focused `node --test tests/photoDeliveryIntent.test.mjs tests/photoDeliveryPlanning.test.mjs tests/deliveryPlan.test.mjs`: **44 passed, 0 failed, 0 skipped**. Subsequent final serial regression also includes these tests.
- Serial selection from `rg --files tests -g '*.test.mjs'`, restricted to root-level `photo*`, `delivery*`, `gmiPhoto*`, `gmiHyperlink*`, run with `node --test --test-concurrency=1`: **848 passed, 0 failed, 95 skipped**, 943 tests total. Final log: `%TEMP%/foto-slice1-regression-final.log`.
- `npx --no-install eslint` on every changed JS/MJS file: passed without diagnostics. Log: `%TEMP%/foto-slice1-eslint-final.log`.
- Fresh isolated production build: `npm run build --prefix <temporary-copy> -- --webpack`: passed compilation, type checks, page-data collection and prerendering. Log: `%TEMP%/foto-slice1-build-webpack-final.log`.
- Production browser suites, serial, using `PHOTO_UI_URL=http://127.0.0.1:3248`: `photoDeliveryIntentUi`, `deliveryWizardUi`, `photoMarkerProvenanceUi`, `photoWorkspaceStacksUi`, `photoWorkspaceEditUi`: **56 passed, 0 skipped across the passing suite runs**. The final focused rerun of inspector and provenance suites passed all 10 tests; the other 46 passed in the preceding serial run.
- Browser evidence covers the three inspector destinations and keyboard navigation, independent shared-photo choices, exclusion/restoration via pills and isolated markers, unchanged included-marker toggles, unchanged stack chooser, status/count/filter presentation, existing export workflows, editing and navigation. Synthetic Node tests verify all stale reasons, unsafe refusal, exclusion state keys, combined/split package refusal, restoration, standalone modes and original GMI/photo-byte preservation.
- Visually inspected exclusion screenshots at **1280x720** and **1366x768**. The three-option control and shared-file explanation fit without horizontal overflow. Screenshots: `%TEMP%/foto-slice1-screenshots/slice1-partial-exclusion-1280x720.png` and `slice1-partial-exclusion-1366x768.png`.
- `git diff --check`: passed. Git emitted line-ending conversion notices for a few edited files, with no whitespace errors.

Failed attempts and corrections:

- Default isolated Turbopack build refused the dependency junction because it points outside its filesystem root. The isolated webpack production build passed; no repository build configuration was changed.
- Initial browser run: 53 passed, 3 failed (including the provenance parent test). One assertion retained the old legend label; it now expects the requested label. The new colour assertion sampled during the existing transition; it now waits 200 ms and still asserts exact computed colours. A subsequent new marker assertion incorrectly used the deliberately unplaced inspector fixture; marker restoration is instead exercised in the placed provenance fixture. Corrected inspector/provenance rerun: 10 passed, 0 failed.

Skipped and manual acceptance:

- The 95 serial-selection skips include browser tests without their required environment and optional/private-fixture gates. The five relevant synthetic production-browser suites were separately enabled and executed. Skips are not real-file acceptance.
- No contractor corpus or Gemini recipient acceptance was performed. No claim is made that synthetic automation replaces either.
- Builds warned about old Browserslist data; Node reported existing package module-type warnings. Dependencies were not changed.

## Isolation, remaining issues and manual checklist

Several existing Next servers used the repository checkout. Builds ran in `%TEMP%/gmi-foto-exclusion-slice1-build`, with an isolated `.next` and a junction to the installed dependencies. The task server on port 3248 was stopped; other servers and the repository `.next` were untouched. Logs, screenshots and the isolated copy remain in temporary storage.

Remaining restriction: combined/split exports with linked exclusions are intentionally unavailable until Slice 3. Broader mode policy, bulk/whole-photo actions, line exclusion and actual hyperlink removal are not implemented. The legacy `link-removed` review is covered with synthetic derivation and choice tests; real workflow acceptance remains part of the checklist below.

Manual acceptance checklist:

1. With read-only originals, exclude one linked placement in the inspector. Check its sibling, the partial-delivery explanation, counts and exclusion filter.
2. Restore by pill/marker and verify GMI. Verify ordinary GMI/GML marker clicks and row selection still behave as before.
3. Exercise stale/lost-link review and explicitly resolve to `Ikke med` or an allowed destination; verify unresolved decisions block delivery.
4. Confirm combined/split exclusion exports show the temporary blocking explanation, then restore exclusions and confirm normal export. Confirm GMI-only/photos-only retain their current scope.
5. Repeat keyboard-only use at both laptop sizes. Verify original files remain unchanged. Gemini G4 recipient verification belongs to later export acceptance.

## Final Git status and publication

18 tracked files modified, plus this new untracked completion report. The three original untracked reports remain untouched:

- `20261113-182754-rettinger-roadmap-reconciliation.md`
- `20261114-090612-foto-delivery-exclusion-plan.md`
- `20261114-160730-rettinger-export-ux-consolidation-plan.md`

Branch and HEAD remain `feature/photo-workspace` / `6304749`. Nothing staged, committed, pushed or deployed. Stopped after Slice 1.
