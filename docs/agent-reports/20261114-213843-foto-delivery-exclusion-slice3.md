# FOTO delivery exclusion — Slice 3 completion

Completed 2026-11-14, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `cbe3233` verified before and after implementation.

## Outcome and scope

Combined and split deliveries now apply existing occurrence exclusions through M7. An excluded occurrence loses its approved S_HYPERLINK references in the delivered copy, creates no GML feature, and requires no photograph attachment of its own. Retained GMI references and selected GML placements continue to determine which original files are required. The temporary `exclusions-not-supported-yet` block is removed.

Only Slice 3 was implemented. M7 rewriting, independent verification, attachment planning/writing, GML generation, ZIP creation and inventory destination logic are unchanged. No standalone-mode policy, line-link exclusion, legacy retirement, workspace interaction changes, dependencies or global styling changes were introduced. No subagents were used.

## Exact files changed

- `src/lib/photos/photoDeliveryIntent.mjs`: removal selections include transfers and exclusions; source readiness considers both; snapshot also exposes sorted not-selected occurrences.
- `src/lib/delivery/deliveryPlan.mjs`: complete removal-set authorization, exclusion-source validation, per-occurrence diagnostic context, verified purpose accounting and standalone exclusion-note evidence.
- `src/lib/delivery/deliveryWizard.mjs`: summary/count distinctions, removal-purpose report sections, standalone notes, contextual diagnostics and Norwegian safety messages.
- `src/components/delivery/DeliveryWizard.js`: compact Kontroll facts, folded exclusion details, explicit standalone notes and distinct-photo counts.
- `tests/deliveryExclusion.test.mjs` (new): seven synthetic export/safety tests covering the composed exclusion path.
- `tests/deliveryPlan.test.mjs`: replaces temporary-block expectations with verified combined/split exclusion, retention and restoration assertions.
- `tests/deliveryWizard.test.mjs`: updated purpose-aware summary contracts while preserving A3 identity and A4 package separation assertions.
- `tests/deliveryWizardUi.test.mjs`: production exclusion/report/inventory/download/restoration and standalone-note workflow at both laptop sizes.
- `tests/photoDeliveryExclusion.test.mjs`: whole-photo commands now produce verified exclusion packages; existing atomicity and immutability assertions remain.
- `tests/photoDeliveryIntent.test.mjs`: exclusion removal selections must exactly match occurrence identity and reference evidence.
- `docs/agent-reports/20261114-213843-foto-delivery-exclusion-slice3.md` (this report).

## Export pipeline and safety evidence

1. `deliveryDecisions` remains the sole decision owner. Transfers, exclusions, retained occurrences and inclusions remain separate snapshot lists. `removalSelections` is the deterministic union of transfers and exclusions, using the existing occurrence keys and complete reference-ID sets.
2. The M7 planner receives that full set. Authorization contains exactly its approved snapshot keys; M7's existing authorization checks and independent verifier remain unchanged. Purpose accounting is derived outside M7 from its verified removed references.
3. Only transfers and included unlinked occurrences enter GML selection. Exclusions never enter that list. Retained GMI links, including supported line references without FOTO occurrences, still require their original attachment.
4. The existing attachment planner resolves retained links and GML requirements, preserves retained paths and deduplicates attachments. Inventory destinations already derive from those actual planned paths, so no parallel inventory logic was needed.
5. Source verification, GML validation and selected-record checks still precede M7 application. A failed plan exposes no GMI bytes and cannot produce a package. Package creation rechecks plan liveness, source bytes and attachment checksums.
6. Synthetic byte comparisons verify only the intended cells change, including safe wrapper renumbering and empty cells. Tests compose hyperlink removal with a Rettinger field correction and compare the entire expected GMI. Original GMI and photograph bytes remain identical. Existing M7 regressions additionally exercise encoding, line endings, unknown data, authorization, duplicate ownership and independent verification.
7. Rebuilding identical decisions produces identical package bytes. Any decision change invalidates an old plan. Restoring exclusions to GMI and rebuilding restores the expected original delivery bytes and attachments.

Unsupported multi-link wrappers and separators block the whole delivery with filename/object context and actionable Norwegian messages. Non-confident/ambiguous associations, stale evidence, missing references, unsafe paths, unreadable attachments, source changes, GML failures and ZIP verification gates retain their existing fail-closed behavior. No unrelated hyperlink can be authorized through purpose accounting.

## Counts, reporting and UI

Kontroll distinguishes physical photographs, attachment files, GMI placements, GML placements, retained hyperlink references, transfer removals, exclusion removals, fully excluded assets, partially excluded assets, not-selected/not-required assets and unresolved/blocked occurrences. Multiple references grouped into one object/asset occurrence count as one placement but multiple references. Multiple attachment aliases count as files while distinct assets count as photographs.

Fully/partially excluded delivery counts use explicit linked exclusions and actual attachment requirements. Unlinked not-selected assets are reported separately; the existing model does not invent a separate flag distinguishing default non-selection from a later deselection. A retained line link keeps the photograph delivered even when all its FOTO point occurrences are excluded.

The folded “Ikke med i leveransen” detail uses the same lines as the TXT report. Each excluded occurrence identifies the filename, actual GMI object number plus GUID, verified reference-removal count, and whether/where the file is still delivered. Transfer and exclusion removals have separate report sections. Blocked reports explicitly say links were not removed. TXT remains outside the ZIP. The unchanged inventory continues to show the actual GMI/GML attachment destinations.

Kun GMI retains hyperlinks and attaches no photograph files. Kun GML keeps its independent selection rules. Content, Kontroll and TXT explicitly explain that combined-delivery exclusion choices do not apply to these modes, including unresolved exclusion choices. GMI-only wording avoids suggesting its retained photo links disappeared.

The existing A3/A4 division remains: Kontroll owns findings and detailed facts; Pakke owns the inventory and download. Existing scoped styles/tokens are reused. No new colors, controls or workspace selection mechanisms were introduced.

## Verification results

### Passed

- Focused Node: `node --test tests/deliveryExclusion.test.mjs tests/deliveryPlan.test.mjs tests/deliveryWizard.test.mjs tests/photoDeliveryIntent.test.mjs tests/photoDeliveryExclusion.test.mjs` — **61 passed, 0 failed, 0 skipped**.
- Serial Node selection: all root `tests/*.test.mjs` starting with `delivery`, `photo`, `gmiPhoto`, or `gmiEditHyperlinkRemoval`, excluding `Ui.test.mjs`/`DevUi.test.mjs`, run with `--test-concurrency=1` — **887 total; 876 passed, 0 failed, 11 skipped**.
- ESLint: `npx --no-install eslint` on all four changed application JS/MJS files and all six changed/new test files — exit 0, no diagnostics.
- Production build: `npm run build --prefix %TEMP%/gmi-foto-exclusion-slice3-build -- --webpack` — exit 0. Fresh isolated output; repository `.next` was not used or modified. The temporary copy uses the repository's existing node_modules through a junction. Builds completed before starting the production server.
- Serial production browser: `PHOTO_UI_URL=http://localhost:3124 node --test --test-concurrency=1 tests/deliveryWizardUi.test.mjs tests/photoDeliveryExclusionUi.test.mjs tests/photoDeliveryIntentUi.test.mjs tests/photoMarkerProvenanceUi.test.mjs tests/photoWorkspaceStacksUi.test.mjs tests/photoWorkspaceEditUi.test.mjs` — **59 passed, 0 failed, 0 skipped**.
- New browser coverage downloads and reads the separate TXT and ZIP, verifies partial/complete exclusion, retained original photo bytes, exact GMI changes, inventory destinations, restoration, and standalone notes. Kontroll and inventory were captured at **1280×720** and **1366×768**. Existing planning, selection, inspector, map, keyboard, removal and Edit-mode regressions passed.
- `git diff --check` — exit 0.
- Diff inspection confirms no changes to M7, attachment planning, package service or photo-export generator/writer modules.

Screenshot artifacts are local under `%TEMP%/foto-slice3-screenshots/`: `slice3-kontroll-partial-1280x720.png`, `slice3-kontroll-partial-1366x768.png`, `slice3-inventory-partial-1280x720.png`, `slice3-inventory-partial-1366x768.png`. Visual inspection found readable facts/details and visible footers without horizontal overflow. Other browser screenshots remain in the same temporary directory.

Logs are local `%TEMP%/foto-slice3-{focused-final,regressions-final,browser-final,eslint-final,build-final}.log`. The task-owned port 3124 server was stopped. Existing servers on 3110, 3112 and 3113 were left running with the same process IDs.

### Skipped and failed checks

The 11 serial Node skips are opt-in private/reference-corpus checks (GMI_EDIT_CORPUS/PHOTO_GML_FIXTURE or unavailable reference folders) and one browser-gated dialog layout check. The dedicated production-browser run was enabled and had no skips. Private-corpus and real-recipient acceptance are not claimed.

Initial checks failed where old Slice 1/2 assertions required the temporary export block; those were replaced by stronger verified-output assertions. Two new test mistakes (the inspector destination selector and synchronous capture-refusal assertion) were corrected. No final check failed and no existing safety assertion was weakened. Build output notes outdated Browserslist data; Node reports existing module-type warnings. No dependency changes were made.

## Remaining risks and manual acceptance

- **Gemini G4 remains unverified.** The `gemini-g4-unverified` warning remains for changed hyperlink cells. Browser/XML/byte verification does not establish Gemini recipient acceptance.
- Unsupported removal grammar still blocks delivery. Existing line links without FOTO occurrences are retained; whole-photo exclusion involving such links remains refused by Slice 2. Slice 4 was not implemented.
- Real contractor-file/manual acceptance and Gemini import should be performed separately using authorized read-only inputs and delivered copies.

Short manual acceptance checklist:

- Exclude one shared placement; confirm Kontroll shows partial exclusion and ZIP keeps the file for remaining GMI/GML placements.
- Exclude all supported placements; confirm no GML feature or attachment remains for the excluded photo and only intended S_HYPERLINK values change.
- Mix transfer/exclusion, download TXT separately, and reconcile object identifiers, purposes and counts with the ZIP/inventory.
- Restore to GMI; rebuild and confirm original hyperlink/file behavior returns.
- Verify unsafe/stale decisions block download and Kun GMI/Kun GML explain their independent behavior.
- Import a reviewed delivered copy in Gemini VA and record G4 results before claiming recipient acceptance.

## Final Git status and publication

Branch/HEAD remain `feature/photo-workspace` / `cbe3233`. Nine tracked files are modified: the four application files and five existing test files listed above. Two task files are untracked: the new `tests/deliveryExclusion.test.mjs` and this report.

These three pre-existing untracked reports remain untouched:

- `docs/agent-reports/20261113-182754-rettinger-roadmap-reconciliation.md`
- `docs/agent-reports/20261114-090612-foto-delivery-exclusion-plan.md`
- `docs/agent-reports/20261114-160730-rettinger-export-ux-consolidation-plan.md`

Nothing was staged, committed, pushed or deployed. No Git refs were changed. Work stops after Slice 3.
