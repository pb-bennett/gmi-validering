# FOTO export M10 — unified export wizard

Completed 2026-11-13 on `feature/photo-workspace`, starting HEAD `9fff41915fecc22f870ff6339140037fefd02b20`. M10 only; no stage, commit, push, deployment or M11 work.

## Outcome and entry points

Implemented one native-modal wizard: **Innhold → Kontroll → Pakke / Last ned**. Both existing entry points now use it:

- FOTO **Verktøy → Eksporter…**, initially **Kun FOTO**.
- Rettinger **Last ned revidert GMI**, initially **Kun GMI**.

The former dialog components are thin adapters. They no longer call separate export builders. FOTO retains its existing transient configuration owner, format/CRS choices, filename label and Fullfør opplysninger return journey. Returning from that journey never restores a built plan. There is no competing download flow and no second delivery engine.

Before editing, verified repository/branch/HEAD/status; read root `AGENTS.md` (no directory-specific files found), development/privacy/security documentation, relevant combined-delivery/M6 plans, M7/M8 completion material and the primary M9 report; inspected the existing services, dialogs, draft guards and tests.

## Specification reconciliation

- This task's explicit M10 three-step structure supersedes the older M6 standalone two-screen layout. Its useful conventions remain: settings before planning, discard review on returning to settings, wait for pending photo reads, preserve completion handoffs and focus, and suppress follow-up double-clicks.
- M9's implemented strict blockers supersede the earlier proposal to warn about missing retained photographs. The wizard never offers an override for those blockers.
- Existing timestamp/label filenames remain `<basename>.gmi`, `<basename>.gml`, `<basename>.zip`; the logical Foto.gml artifact is not renamed or reserialized.
- Existing Gemini UUIDv4 identifiers, timestamp handling, geometry and attachment links are unchanged. No Validator rules, correction eligibility, ChangeSet engine, attachment naming algorithm or source patching behavior changed.

## Delivery-mode semantics

| Choice | UI behavior |
|---|---|
| Kun GMI | Select a safely editable loaded GMI; apply staged field corrections; preserve every photo reference; download a standalone `.gmi`. FOTO is not required. |
| Kun FOTO | Select a FOTO layer; preserve the established all-placed-occurrences scope, independently of M8 decisions. Show unplaced exclusions, metadata blockers, schema warnings and existing format options. GMI is not modified/exported. |
| Delt levering | Use M8 transfer/include decisions and M9's coordinated ZIP. Exclude staged field corrections. Any active ChangeSets require an explicit exclusion checkbox before control. The acknowledgement is tied to the selected survey and session state, so later edits/undo/redo require renewed acknowledgement. |
| Samlet levering | Same M8 selection and M9 ZIP composition, with staged field corrections included. Only specifically transferred references represented in the accepted GML plan are removed. |

Layer choices use the existing live owners. M9 still requires the same loaded survey input/fingerprint for split/combined delivery and blocks foreign, stale or ambiguous associations. No photo selection model was added.

Kontroll displays the selected mode, included/excluded field corrections, retained/transferred reference counts, FOTO record count, attachment count, actual output filename and export-check results. Errors, warnings and information are separate Norwegian sections, with known file/occurrence names where available and actionable explanations. Combined readiness is scoped to the selected occurrences, rather than unrelated FOTO records.

Pakke displays the reviewed GMI/GML/attachment paths before technical notices. It omits GML when M9 has no selected records. A separate UTF-8 TXT **leveranserapport** contains the reviewed summary, inventory, diagnostics and field/reference diffs; it never enters the ZIP. No reusable generic delivery-report facility was found, so this small presentation formatter reads the M9 result. It explicitly distinguishes export checks from a new Validator run, XSD certification or Gemini acceptance.

## Reuse and download safety

- Calls existing `captureDeliverySnapshot`, `buildDeliveryPlan` and `buildDeliveryPackage`. M7's GML-before-removal gate, exact occurrence authorization and source-preserving composition remain in M9.
- Added only two small M9 integration capabilities: a public revised-GMI fingerprint for display/integrity evidence, and `recordDeliveryDownload(plan)` using the private captured effective field key and existing registry `markDownloaded`.
- Planning, packaging, failed initiation and report downloads never mark Rettinger fields downloaded. Only successful browser-anchor initiation of Kun GMI / Samlet levering records the captured field state. Kun FOTO / Delt levering cannot clear those guards.
- The UI says **Nedlastingen er startet**, accurately distinguishing browser handoff from confirmation that the user saved the file. If the field state changes during handoff, the new state remains unsaved.
- Current-plan checks run again immediately before handoff, after M9's source/file rechecks. Source/hash/read failures invalidate the review and require renewed control; browser initiation errors offer retry without claiming success.
- Owner publications/visibility return expose stale previews. Download/report controls are disabled for stale plans and obsolete inventory is hidden. M9's mode-specific independence is preserved: standalone FOTO ignores M8 intent for export scope, and GMI-only does not require a FOTO snapshot.
- Returning to Innhold discards review. It can abandon an asynchronous control run; tokens prevent its late result or cleanup from replacing a newer run. During actual packaging, backward navigation is disabled; close/cancel/Escape still suppress any late download.
- Rettinger's export entry now passes through the existing draft guard. Cancelling preserves the unsubmitted form. FOTO continues through its existing workspace/edit boundary.
- Native dialog focus containment, heading focus on step changes, focus restoration, native keyboard controls, existing follow-up-click protection and independently scrollable body/fixed footer are preserved. Kontroll is reachable from Pakke without changing the reviewed plan.
- No imported GMI bytes, FOTO records, M8 decisions or ChangeSet history are mutated by export/report generation.

## Files changed

New:

- `src/components/delivery/DeliveryWizard.js`
- `src/components/delivery/deliveryWizard.css`
- `src/lib/delivery/deliveryWizard.mjs` — presentation/reducer/report/download coordination; no serialization or patch engine
- `tests/deliveryWizard.test.mjs`
- `tests/deliveryWizardUi.test.mjs`
- This report and five synthetic screenshots under `docs/agent-reports/assets/20261113-m10/`.

Updated:

- `src/components/photos/PhotoExportWizard.js` — FOTO adapter preserving config and completion journey.
- `src/components/gmi-edit/GmiExportDialog.js` — Rettinger adapter.
- `src/components/photos/PhotoExportDeliveryStep.js` — existing settings extracted for reuse.
- `src/components/gmi-edit/GmiEditWorkspace.js` — export draft guard.
- `src/components/gmi-edit/gmiEdit.css` — contextual Gjør om only: 600/11px → 400/12px; pointer/hover/focus/redo behavior preserved.
- `src/lib/delivery/{deliveryPlan,index}.mjs` — fingerprint and post-initiation recording seam.
- `tests/gmiEditWorkspaceUi.test.mjs`, `tests/helpers/photoExportWizard.mjs`, `tests/photoExportLayoutUi.test.mjs`, `tests/photoExportReturnUi.test.mjs`, `tests/photoExportWizard.test.mjs`, `tests/photoExportWizardUi.test.mjs` — migrate intentional three-step contract changes while retaining source-integrity, modal, async, metadata, handoff and download assertions. Pointer tests now scroll their targets into view in the taller Innhold content.

No dependencies, fixture bytes, manifests or expected hashes changed. Removed unintended BOMs from the two rewritten adapters and preserved the edited existing files' line-ending convention.

## Verification

Passed:

- Final relevant serial Node regression selection: **1,010 passed, 0 failed, 13 skipped**, across 71 files. Includes FOTO/export/golden/Gemini serialization, GML parsing, Rettinger/GMI export, M7/M8/M9 and eight new M10 Node tests.
- Eight production-browser suites, with final successful coverage across the initial six passing suites and the corrected two-suite rerun: **77 passed, 0 remaining failures, 1 skipped**. Includes M10, existing Rettinger workspace and draft guards, M8 decisions, completion return/map/source journeys, export wizard and layout checks.
- Re-ran M10 alone against the final fresh production build: **11 passed, 0 failed, 0 skipped** (parent test plus ten subtests). Verified actual downloaded bytes for all modes, shared-photo decisions, source immutability, exclusion acknowledgement, separate report, download failure/retry/unsaved flags, changed-file invalidation, late-download suppression, native Tab/Escape, both contextual redo styles and required laptop sizes.
- `npx.cmd --no-install eslint` on all added/changed JS/MJS implementation and test files: passed.
- Final `npm.cmd run build`: passed (compile, TypeScript, page generation). Used authorized network access for the existing Google font fetch; no build workaround or dependency change.
- `git diff --check`: passed, repeated after report.

Reproducible Node selection:

```powershell
$tests = @(Get-ChildItem tests -Filter '*.test.mjs' | Where-Object {
  $_.Name -match '^(photo|gmiEdit|gmiPhoto|geminiGmlParser|delivery)' -and
  -not (Select-String -LiteralPath $_.FullName -Pattern 'chromeHarness|PHOTO_UI_URL|PHOTO_WORKSPACE_UI_URL|GMI_EDIT_UI_URL' -Quiet)
} | ForEach-Object { $_.FullName })
node --test --test-concurrency=1 @tests
```

Browser commands used `PHOTO_UI_URL=http://127.0.0.1:3221` and the existing headless Chrome harness, serially against a fresh production server. Suites: `deliveryWizardUi`, `gmiEditWorkspaceUi`, `gmiEditDraftGuardUi`, `photoDeliveryIntentUi`, `photoExportReturnUi`, `photoExportWizardUi`, `photoExportLayoutUi`, `photoExportFlowUi`. Broader browser runs used `--test-force-exit`; each fixture still closes its Chrome instance. Only this task's production server was started/stopped. Screenshots were captured with `DELIVERY_SCREENSHOT_DIR` and inspected at 1280×720 and 1366×768. Existing automated layout coverage also passed down to 390px width, including keyboard visibility.

Initial failures and their disposition:

- Existing two-screen/title/selector expectations failed after the deliberate M10 replacement. Updated those expectations to Innhold/Kontroll/Pakke, keeping meaningful byte, source, metadata, navigation and async assertions.
- Existing return tests exposed omitted resumed feedback/package counts and inability to abandon a pending control run; restored that accepted behavior and verified all 22 return scenarios.
- One completion pointer test targeted an off-screen button in the taller content; fixed its trusted-click helper to scroll first. Its complete suite passed afterward.
- One earlier broad run had a Chrome `Input.dispatchMouseEvent` timeout in the export-handoff scenario. The unchanged scenario passed a targeted retry and the full two-suite rerun without application changes. This is an observed transient failure, **not a proven baseline failure**.
- Final selected checks have no unresolved failures. The M9 report's separately established terrain-GML module-serving baseline failure was not rerun or claimed resolved by M10.

Skipped / not claimed:

- 13 opt-in/private-corpus Node tests and one private-corpus production-browser case. These skips are separate from the successful synthetic coverage.
- No real delivery was imported into Gemini. Automated browser tests and synthetic screenshots do not constitute M11 real-file/manual acceptance.
- Existing module-type and Browserslist age warnings remain; no unrelated dependency/configuration changes were made.

## Precise manual acceptance and remaining M11 work

1. Use an approved GMI and its photograph copies. Stage one field correction in Rettinger. Leave another form draft unsubmitted, click export and cancel the draft confirmation; verify the draft is intact. Then explicitly resolve the draft and open export.
2. Confirm Innhold opens on Kun GMI. Select the intended GMI and label, control, inspect Pakke, download. Check the reviewed filename/SHA-256, corrected value and unchanged photo references. Keep the imported source file unchanged.
3. Link photographs through the existing loaded-GMI import path. In FOTO, transfer one occurrence of a shared photograph and keep its sibling; optionally include an unlinked photograph using the existing M8 control. Open Eksporter… and confirm Kun FOTO is initially selected for a new configuration.
4. Kun FOTO: inspect all-placed scope, unplaced exclusions and any missing-time schema warning. Verify the downloaded ZIP has GML plus original photographs, no GMI, and no report/manifest. Check the completion handoff and chosen profile/CRS/label survive return without restoring a plan.
5. Delt levering: verify control is unavailable until explicit field-exclusion acknowledgement. Download; confirm field corrections are absent, exactly the chosen occurrence's reference is removed, its GML record exists, the sibling link remains, and the shared image is included once. Rettinger's correction remains unsaved.
6. Samlet levering: verify the same transfers plus staged field corrections. Inspect the displayed inventory before download. Download the TXT report separately and confirm this alone does not clear the unsaved flag. Check the ZIP has only the reviewed GMI/GML/attachment entries. Successful initiation clears only the included field state; cancelling or a failed initiation does not.
7. At 1280×720 and 1366×768, use only keyboard navigation through mode/layer/format/label controls and all steps. Check visible focus, body scrolling, reachable footer, earlier-step navigation and Escape/opener restoration. Verify both Gjør om actions remain pointer/focus accessible and actually redo.
8. With **synthetic copies**, exercise missing/unreadable originals, unplaced selected transfers, stale/foreign associations, filename collisions and a file changed between control and download. Confirm errors explain the action required, blocked/stale plans offer no download, renewed control is necessary, and closing during generation causes no late download. Do not mutate contractor/reference originals for this exercise.
9. M11 remains: import an approved combined package into the actual Gemini VA/FME/GeoFoto workflow, record versions and import order, verify corrected attributes, every retained/transferred link, shared-photo opening/record behavior, UUIDv4, timestamps, geometry and filename compatibility. M7 hyperlink-removal/renumbering and combined-import acceptance remain explicitly unverified. XSD/recipient certification is separate from the export checks shown here.

## Git/publication

Branch and HEAD unchanged. All task edits remain unstaged/uncommitted. No stage, commit, push, merge, Git ref change or deployment. The three pre-existing untracked planning reports dated `20261111-085500`, `20261111-092840` and `20261111-093345` were left untouched. Temporary logs/downloads stayed outside the repository; only the five intended synthetic screenshots were retained. M10 stops here.
