# FOTO M4 — metadata presentation and export readiness

18 November 2026, Europe/Oslo. Implemented M4 only on `feature/photo-workspace`, HEAD `8731e45e2358cc7919f17c23f6bac3d25bc51c68`. Repository, branch, expected HEAD and clean working tree verified before work. No subagents, staging, commits, pushes, deployment or ref changes.

Read root AGENTS.md and development documentation, the [original plan](20261117-135049-foto-capture-date-filename-gml-reconciliation-planning.md), [M1](20261117-173852-foto-filename-capture-dates-m1-implementation.md), [M2](20261117-174943-foto-gml-capture-reconciliation-m2-implementation.md), [M3](20261117-205436-foto-gml-capture-approval-m3-implementation.md) and the subsequent [S1 filename correction](20261118-091015-foto-filename-counter-guard-s1-implementation.md). Accounted for the accepted S5/S9/S10 refinements already present in HEAD. No architecture investigation was repeated.

## Outcome and presentation decisions

### Filename provenance

`photoMetadataOrigin` is the shared presentation classifier. Accepted filename values now have origin `filename` in readiness and completion, separate from `source`. Completion's existing count strip shows **Filnavn**; per-photo accepted values retain their existing source suffix. Inspector and popup already used the approved `photoSourceLabel`/`photoMetadataSourceLabel` path from M1, so no extra source label was added there. Browser checks verify the inspector's existing **Opptakstid fra → Filnavn** disclosure.

The metadata dialog now preserves the formatter's precision notes alongside its accepted value and source choices. Date-only values remain **bare dato** and minute values **uten sekunder**, with no invented components. Completion no longer repeats the partial-value precision in a second row note or suggests that an accepted partial value has already been replaced.

### Accepted values and unaccepted GML

The old priority claim is removed. For retained automatic EXIF with conflicting GML evidence, the accepted row still names **EXIF DateTimeOriginal** and shows its exact time; its note says **Kildene oppgir ulike tider.** Readiness says **N bilder har ulik opptakstid i kildene. Godtatt opptakstid er brukt.** Explicitly accepted EXIF/GML values remain settled under the existing policy and do not gain a new conflict recommendation simply because another source differs.

An adoptable time is no longer universally labelled **Fjernet av deg**. That group is **Opptakstid i kilde**, using the existing **Rediger…** action. Readiness now covers usable unaccepted evidence in partial and conflicting states as well as complete adoptable values, while excluding photographs that already have an accepted time. It says **N bilder har opptakstid i GML som ikke er godtatt.** Mixed sources use **kildene**; EXIF-only availability uses **EXIF**.

The completion row says **GML-verdien er ikke godtatt.** A genuinely cleared value retains its own **Fjernet av deg.** note. The metadata dialog says **Ingen kildeverdi er godtatt. Velg en verdi nedenfor, eller angi tiden under «Annen verdi».** Its existing GML radio remains unchecked until selected. Choosing it and saving updates the existing accepted-value display and removes the unaccepted note. No new adoption action, step, wizard or automatic write was introduced.

The affected capture-time notes use the approved compact SJEKK token. Visual inspection caught their inherited green note style; a scoped warning-tone override corrects only these notes. No global base styles or unrelated module styling changed.

### Filename export advisory

New diagnostic `capture-time-filename`, label **Opptakstid fra filnavn**, uses the existing readiness recommendation and export-plan warning infrastructure. Its message is:

> N bilder har godtatt opptakstid fra filnavnet, ikke fra opptaksmetadata. GML-eksporten tar ikke med kildeopplysningen.

One shared helper counts unique affected asset IDs after existing delivery selection and placement filtering. It records complete and incomplete asset subsets separately. Repeated occurrences never inflate the image count; excluded and unplaced assets produce no advisory. The completion count strip supplies provenance there, so the export advisory is not repeated in completion's recommendation list.

The advisory describes provenance only. Existing row precision notes, missing/full-time warnings, schema gaps and precision blockers retain responsibility for incomplete timestamps. Thus a mixed set shows **3** filename-derived originals while the existing schema warning independently identifies **2** incomplete times after the waiting GML value is explicitly accepted. There is no second missing-time or precision warning. Gemini delivery remains possible where it already was; Legacy/AsBuilt still block incomplete values.

No timestamp value, XML serializer, schema property, compatibility requirement, filename generation, JPEG bytes, capture approval default, EXIF adoption, reconciliation rule, position, direction, estimate functionality, Validator/Rettinger workflow or recent S5/S9/S10 refinement changed.

## Exact files changed

| File | Change |
| --- | --- |
| `src/lib/photos/photoPresentation.mjs` | Shared metadata-origin classifier including filename |
| `src/lib/photos/photoCompletion.mjs` | Filename origin/count; factual conflict/unaccepted/cleared notes; source group; scoped note tone |
| `src/lib/photos/export/photoExportReadiness.mjs` | Origin and cleared presentation facts; truthful conflict/source-availability text; filename advisory |
| `src/lib/photos/export/photoExportDiagnostics.mjs` | Shared unique-asset filename advisory and diagnostic label |
| `src/lib/photos/export/photoExportPlan.mjs` | Add advisory after existing selected/placed asset filtering |
| `src/components/photos/PhotoCaptureMetadataDialog.js` | Preserve precision notes; clarify no source value is accepted |
| `src/components/photos/PhotoCompletionRows.js` | Render the supplied note tone |
| `src/components/photos/PhotoCompletionTimePanel.js` | Correct obsolete automatic-adoption comment only |
| `src/components/photos/photoCompletion.css` | Capture-time warning-note token override scoped to the completion dialog |
| `tests/photoCompletion.test.mjs` | Update intended M4 wording and redundant-note expectations |
| `tests/photoExportReadiness.test.mjs` | Update factual source-availability expectations |
| `tests/photoCompletionUi.test.mjs` | Correct conflict expectation; add M4 laptop flow, tone, precision, provenance, explicit adoption, export and screenshot checks |
| `tests/photoMetadataPresentationM4.test.mjs` (new) | Five focused session/readiness/plan/package regression tests |

Additional new files: this report and the twelve screenshots linked below. No dependencies, fixtures or private corpus files changed.

## Verification

| Gate | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Clean-HEAD focused Node baseline | 104 | 0 | 1 |
| Clean-HEAD production completion browser baseline | 12 | 0 | 1 |
| Final focused metadata/completion/readiness/export/delivery Node regression union | 423 | 0 | 1 |
| Final fresh-production Chrome regression union | 33 | 0 | 2 |
| Affected-file ESLint | clean | 0 | — |
| Final `npm.cmd run build` | pass | 0 | — |
| `git diff --check` and new-test whitespace check | clean | 0 | — |

Node regression command:

```text
node --test --test-concurrency=1 tests/photoCaptureMetadata.test.mjs tests/photoCaptureAgreement.test.mjs tests/photoAutoMetadata.test.mjs tests/photoGmlCaptureApproval.test.mjs tests/photoGmlCaptureReconciliation.test.mjs tests/photoCaptureSuggestions.test.mjs tests/photoEvidenceAdoption.test.mjs tests/photoEvidenceExportChain.test.mjs tests/photoCompletion.test.mjs tests/photoExportReadiness.test.mjs tests/photoExportRules.test.mjs tests/photoExportParity.test.mjs tests/photoExportPlan.test.mjs tests/photoExportPackage.test.mjs tests/photoExportSerializers.test.mjs tests/photoExportWizard.test.mjs tests/photoMetadataPresentationM4.test.mjs tests/deliveryPlan.test.mjs tests/deliveryWizard.test.mjs
```

Browser command, with `PHOTO_UI_URL=http://127.0.0.1:3192` and `PHOTO_SCREENSHOT_DIR` configured:

```text
node --test --test-concurrency=1 tests/photoCompletionUi.test.mjs tests/photoGmlCaptureApprovalUi.test.mjs tests/photoEvidenceUi.test.mjs tests/deliveryWizardUi.test.mjs
```

All modified/new JS/MJS files were linted with `npx.cmd --no-install eslint`. CSS was verified by production compilation, browser rendering and the computed warning-token assertion. Fresh builds were used for production checks. Task-owned `next start --hostname 127.0.0.1 --port 3192` servers were stopped before rebuilding and after final verification; the port was checked after cleanup.

New tests cover unique filename origins, date/minute/full precision, retained conflicting EXIF, unaccepted complete/date/minute GML, explicitly accepted GML of all three precisions, cleared values, selected-occurrence filtering, repeated originals, unplaced exclusion, Gemini omissions and Legacy/AsBuilt blockers. The same metadata with manual versus filename provenance produces byte-identical serialized Legacy XML; the ZIP's JPEG bytes equal the original input bytes. Browser regressions also retain existing export byte, stale-plan, download, draft and approval checks.

**Failed attempts corrected:** the first new unit run retained one obsolete note expectation and passed `occurrenceIds` in the wrong test argument; both tests were corrected. The first new browser flow used an optional-chain expression as an assignment target in screenshot preparation; corrected without an application change. The final suites pass. Visual inspection then prompted the scoped SJEKK-tone fix, followed by a fresh build and complete scoped browser rerun.

**Unrelated failures:** none observed in the suites run. Historical Validator/marker/stack failures were not repaired or claimed reproduced. The full serial repository suite was not run.

**Skipped:** the Node completion corpus case and browser completion/evidence corpus cases require opt-in private files. No private data was opened. Existing Browserslist age, Node module-type and checkout line-ending notices remained non-failing; no dependency or line-ending policy changes were made.

## Screenshot evidence and visual observations

Inspected actual Chrome PNGs at 1280×720 and 1366×768. The count strip separates **Filnavn** from **Fra kilde**; partial accepted values keep their precision beside their source; unaccepted GML and accepted EXIF occupy distinct rows; the GML radio starts unselected. Dialogs retain their existing controls and visible footers. The export advisory sits in the existing **Bør kontrolleres** group, apart from the existing incomplete-time/schema warning. Inspector source information stays in its existing disclosure.

| Surface | 1280×720 | 1366×768 |
| --- | --- | --- |
| Completion overview/count strip | [PNG](assets/20261118-173012-foto-m4/m4-completion-1280x720.png) | [PNG](assets/20261118-173012-foto-m4/m4-completion-1366x768.png) |
| Completion values, retained EXIF and unaccepted GML | [PNG](assets/20261118-173012-foto-m4/m4-completion-values-1280x720.png) | [PNG](assets/20261118-173012-foto-m4/m4-completion-values-1366x768.png) |
| Filename minute-precision metadata dialog | [PNG](assets/20261118-173012-foto-m4/m4-filename-dialog-1280x720.png) | [PNG](assets/20261118-173012-foto-m4/m4-filename-dialog-1366x768.png) |
| Unaccepted GML metadata dialog | [PNG](assets/20261118-173012-foto-m4/m4-unaccepted-gml-1280x720.png) | [PNG](assets/20261118-173012-foto-m4/m4-unaccepted-gml-1366x768.png) |
| Export advisory and existing schema warning | [PNG](assets/20261118-173012-foto-m4/m4-export-advisory-1280x720.png) | [PNG](assets/20261118-173012-foto-m4/m4-export-advisory-1366x768.png) |
| Inspector filename provenance | [PNG](assets/20261118-173012-foto-m4/m4-inspector-1280x720.png) | [PNG](assets/20261118-173012-foto-m4/m4-inspector-1366x768.png) |

The minimal synthetic JPEG metadata fixtures do not supply normal photo previews; placeholders/read-error presentation in these screenshots is fixture-related. This is metadata/layout evidence, not real-image acceptance.

## Deviations and remaining manual acceptance

- `SourceStages` already has M3's accurate explicit-approval count and source-save wording; it needed no further change. Inspector/popup filename labels were already implemented by M1 and were reused rather than repeated.
- The M3-follow-up requirement extends source-availability presentation to partial/conflicting evidence and separates actual removals from unaccepted GML. Readiness classification states and eligibility rules themselves remain unchanged.
- Filename advisories cover accepted complete and incomplete timestamps, with separate affected-asset subsets. Precision is displayed through the existing row/schema/contract diagnostics, avoiding duplicate precision copy in the advisory.
- No M5, legacy cleanup or app-wide styling work was undertaken.

Real-file acceptance remains outstanding. With a representative contractor set, check complete/date/minute filename values, retained EXIF against conflicting GML, declined GML with no accepted time, explicit per-photo GML adoption, repeated occurrences and delivery exclusions. Verify counts and source recognition at both laptop sizes. Check the produced package in the intended Gemini VA setup, especially the already-unconfirmed omission of incomplete times; M4 provides no new compatibility evidence. Confirm original attachments against the real input files. No known scoped automated gate remains failed.

## Git inventory and publication

HEAD and branch unchanged. Twelve tracked files modified and unstaged, one new test, this report and twelve screenshot files untracked. All are enumerated above. No staging, commit, push, deploy or subagent work occurred.
