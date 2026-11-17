# FOTO M2: GML capture-time reconciliation planner

**IMPLEMENTED — M2 only, uncommitted**

Date: 2026-11-17, Europe/Oslo. Branch `feature/photo-workspace`, HEAD `6a99112`, clean working tree at start. Plan: `20261117-135049-foto-capture-date-filename-gml-reconciliation-planning.md` §4, §6, §8, §11 (M2) and §12.1; M1 report `20261117-173852-foto-filename-capture-dates-m1-implementation.md`. No subagents. Nothing staged, committed, pushed or deployed.

## 1. Outcome

A pure, deterministic planner states what one GML source's capture times could do to each photo asset's accepted value. It writes nothing and nothing calls it yet. Untouched: `photoAutoMetadata.mjs`, GML attachment and automatic adoption, both wizards, the session, export serialization and readiness, filename parsing, «Anslått dato» and LOK/TOP → KUM. M3/M4 are not started.

## 2. Files changed

| File | Change |
|---|---|
| `src/lib/photos/photoGmlCaptureReconciliation.mjs` (new) | `planGmlCaptureTimeReconciliation(assets, source, ledger?)` and `captureTimeProtectionClass(metadata)` |
| `tests/photoGmlCaptureReconciliation.test.mjs` (new) | 29 tests |
| `docs/agent-reports/20261117-174943-foto-gml-capture-reconciliation-m2-implementation.md` (new) | This report |

The planner reuses existing helpers. It does not add a second implementation of any of them:

- `normalizeCaptureTime`, `captureTimesAgree`, `completeCaptureValue` and `gmlCaptureEvidence` from `photoCaptureMetadata.mjs`;
- `isEstimatedCaptureTime` from `photoEstimatedDates.mjs`;
- `matchPhotoReferences` from `photoReferenceMatching.mjs`.

## 3. Input/output contract

### 3.1 Inputs

**`assets`** is an array of assets or occurrences: `{ id, assetId?, originalFilename, sourceRelativePath?, captureMetadata, spatial? }`.

- Each item is folded to `assetId || id`, so there is one decision per physical asset.
- `photoIds` lists every occurrence id. `occurrenceCount` gives the number of occurrences.

**`source`** is a parsed GML source: `{ id, filename, entries }`.

- Without an `entries` array, for example a GMI source, the planner returns an empty plan.

**`ledger`** is optional. It is a `matchPhotoReferences` result whose `photoId`s are asset ids.

- When it is omitted, the planner computes one over the unique assets, sorted by id, just as `attachSource` does.
- A supplied ledger is never trusted further than the safety rules allow:
  - An edge naming an unknown asset or entry is counted in `counts.stale` and ignored.
  - An asset with more than one matched edge is treated as ambiguous.

### 3.2 Output

The output is a frozen object, and every list is sorted by `assetId`:

```js
{ sourceId,
  fill, fillPartial, completions, reviewRows, conflicts,   // decisions for the wizard
  unchanged, ambiguous, pending,                           // informational, never proposals
  counts: { assets, fill, fillPartial, completions, reviewRows, conflicts, unchanged, ambiguous, pending, stale,
            optionComplete, optionPartial },
  options: { complete, partial, partialHasMinute } }
```

**Common row fields:**

- `assetId`, `photoIds`, `occurrenceCount`, `filename`, `entryId`, `sourceId`, `sourceFilename`.
- `current: { class, value, provenance, acceptance, comparedAs }`. `comparedAs` is `'date'` for estimates.
- `incoming: { value, raw, evidenceId, complete }`.

**Proposal rows** also carry:

- `rule` (`R1`–`R4`).
- `evidence`: the `gmlCaptureEvidence` item, so M3 can build `evidenceProvenance(...)` together with `via`.
- `proposedValue`: the GML value exactly as recorded.

**Category-specific fields:**

| Category | Extra fields |
|---|---|
| `fill`, `fillPartial`, `completions` | `option`: `'complete'` or `'partial'` |
| `reviewRows` | `reason`: `can-complete` or `can-replace-estimate`; `defaultDecision: 'keep'` |
| `conflicts` | `reason: 'capture-time-differs'`; `defaultDecision: 'keep'` |
| `unchanged` | `reason`: `agrees`, `already-accepted`, `capture-time-cleared`, `no-gml-capture-time`, `invalid-gml-capture-time` or `unreadable-current-capture-time` |
| `ambiguous` | `reason` (`duplicate-gml-reference` or `duplicate-photo-reference`) and `entryIds` |
| `pending` | `reason: 'pending-exif'` |

**Option counts:**

- `options.complete` = complete fills + complete completions. This is option 1, «Bruk opptakstid fra GML».
- `options.partial` = partial fills + partial completions. This is option 2.
- `partialHasMinute` selects the option 2 label described in §7.2.

Photos that no GML entry references produce no row.

## 4. Reconciliation rules

### 4.1 Protection classes

`captureTimeProtectionClass` sorts the current value into one class:

| Class | Value |
|---|---|
| `none` | No value and no removal record |
| `removed` | `captureTimeCleared` |
| `exif-auto` | EXIF, `acceptance: 'auto'` |
| `exif-chosen` | EXIF chosen by a person |
| `filename` | Filename-derived |
| `gml` | GML, either automatic (today) or explicit |
| `estimated` | Manual, `estimated: true` |
| `manual` | Manual, including bulk. Any unknown kind is also treated as manual |

Only `none`, `exif-auto` and `filename` can change under an ordinary option.

### 4.2 Order of evaluation, per asset

1. **Ambiguity.** If any ambiguous edge names the asset, or more than one matched edge does, the row goes to `ambiguous` with no proposal.
2. **Unmatched.** No matched edge: no row.
3. **R0.** The GML gives no time, or an invalid one: `unchanged`.
4. **Pending.** The class is `none` and EXIF is still pending: `pending`.
5. **R5.** The value was removed: `unchanged`, reason `capture-time-cleared`.
6. **R1.** The class is `none`: a complete GML value goes to `fill`, a partial one to `fillPartial`. Nothing is padded.
7. **Already accepted.** The current value is unreadable, or its `evidenceId` equals the incoming evidence: `unchanged`. This makes a repeated plan a no-op.
8. **R4.** `captureTimesAgree(current, incoming)` is false: `conflicts`, with default `keep`. Estimates are compared at date precision here.
9. **R2.** The incoming precision is not strictly higher than the current one: `unchanged`. Precision ranks are `date < minute < second = fraction`.
10. **Estimated, partial GML.** `unchanged`. This follows §6.2: a minute value would make an export-complete estimate incomplete.
11. **R3.**
    - An `exif-auto` or `filename` value goes to `completions`, with option `complete` or `partial`.
    - Any other value goes to `reviewRows`, with default `keep`.

### 4.3 Time zones

- Nothing is converted, and the host zone is never read.
- A known offset is **not** a precision gain, so GML `+02:00` against an EXIF value without an offset is `agrees`.
- An offset is never copied onto an existing value. A proposal carries the GML value exactly as recorded.
- Different known offsets, or the same instant written as different wall clocks, are conflicts.

### 4.4 Interpretations and deviations from the §6.2 table

These need confirmation.

1. **Earlier GML or chosen EXIF at partial precision.** The table lists "No change" for partial GML that agrees. The planner applies the general R3 rule instead: a strictly more precise value gives a review row. Example: current GML date-only, incoming GML minute. The table cell still holds for its implied case, a complete earlier value. A review row defaults to keep, so nothing changes silently.
2. **"Differs" means differs at the lower precision.** A date-only filename or manual value *agrees* with any time on the same date. So `2026-10-14` against GML `2026-10-14T15:33:02` is a completion or a review row, not a conflict. This follows from `captureTimesAgree`.
3. **Pending EXIF.** The plan does not specify this. A photo with no accepted value and a pending EXIF read goes to `pending`, not `fill`, because the read might still produce a value that conflicts.
4. **Unknown provenance kinds** are protected like manual values (fail closed).
5. **The current automatic GML value**, from today's policy, is in the `gml` class and is protected. Under M3, GML no longer becomes automatic.

## 5. Tests

`tests/photoGmlCaptureReconciliation.test.mjs` uses synthetic values only. It covers:

- **The matrix.**
  - One test per §6.2 row: none; EXIF automatic and chosen; filename at second, minute and date; earlier GML at second and minute; manual at second, minute and date; estimated.
  - Each row is checked against five columns: complete agrees, complete differs, date agrees, date differs, and minute agrees.
  - The removed row is checked against every column.
- **Row contents.** Conflict rows carry both values, the source and the default.
- **Option grouping.** `partialHasMinute` is checked, and no padding is applied.
- **Protection.**
  - Manual, chosen and GML-explicit values never enter an option.
  - A conflict with a typed time.
- **Estimates.** A GML noon is treated as more precise than an estimated date, any clock on the same date agrees, a different date conflicts, and a minute value causes no change.
- **Second GML source.** It conflicts, a fraction is not a precision gain, and re-planning the same source is `already-accepted`.
- **Date-only agreement.** A date-only value agrees with any time on its date.
- **Time zones.** Unknown and known offsets, differing offsets, the same instant written with different clocks, and `Z`/`+00:00`. No offset is borrowed.
- **Invalid input.** Missing, empty and invalid GML text.
- **Duplicates.**
  - Occurrences of one asset are folded together.
  - A duplicate GML reference, including one with differing values, gives no proposal.
  - Assets with the same basename are both ambiguous.
- **Ledger handling.** A supplied ledger gives the same plan as a computed one. Doubled and stale edges fail closed.
- **Other states.** Pending EXIF; unmatched photos; a non-GML source.
- **Determinism.** The plan is the same when assets and entries are reversed, inputs are not mutated, and the output is frozen.
- **Idempotence.** Applying every option proposal and planning again gives nothing.
- **Protection classes** themselves.

## 6. Commands and results

| Check | Result |
|---|---|
| `node --test tests/photoGmlCaptureReconciliation.test.mjs` | 29/29 pass |
| Regression: `photoCaptureMetadata`, `photoCaptureAgreement`, `photoEvidenceAdoption`, `photoEstimatedDates`, `photoManualFill`, `photoImportComplete`, `photoImportWizardState`, `photoImportOutcome`, `photoSourceWorkflow`, `exifGps`, `photoAutoMetadata`, `photoFilenameCaptureTime`, `photoCaptureSuggestions`, `photoReferenceMatching`, `photoCaptureEvidenceCorpus` | 254 tests: 253 pass, 0 fail, 1 skipped (`photoCaptureEvidenceCorpus` private corpus; `PHOTO_GML_FIXTURE` not set) |
| `npx --no-install eslint` on both new JS files | Clean |
| `npm run build` | Pass. The module is not imported by the app yet, so this only confirms the build is unaffected |
| `git diff --check`, plus `git diff --no-index --check` for the untracked files | Clean (only the generic autocrlf LF→CRLF notice, the same as the M1 files) |

**Not run:**

- The full serial suite.
- Browser tests. This change has no user-facing behaviour.

M1 recorded one pre-existing, unrelated failure in `validationV2GmiA7.test.mjs`. It was not re-checked here.

## 7. Integration considerations for M3

1. **Where the planner runs.**
   - In the positioning wizard, `saveSourceWorkflowSource` plans with `assetPhotos(review.includedIds)` and `review.source`.
   - In the import wizard, «Fra GML-fil» plans with the incoming assets and `positioning.source`.
   - M3 must re-plan against live assets at commit time and compare per-asset `captureMetadata` identity with the planned set (`review-changed`).
2. **Write shape.**

   ```js
   { value: row.proposedValue, provenance: { ...evidenceProvenance(row.evidence, agreeing), via }, acceptedAt }
   ```

   - No `acceptance` field.
   - The write must land after `attachSource` and before the single `publish`.
   - `planAutoCaptureTime` must drop GML (D1) in the same change. Otherwise publication would still auto-accept GML for declined rows.
3. **Group decisions.**
   - Option 1 applies `fill` plus `completions` where `option === 'complete'`.
   - Option 2 applies the partial ones.
   - The «Ved avvik» choice applies to `conflicts` and `reviewRows` together.
   - `unchanged`, `ambiguous` and `pending` are never written.
4. **Import with pending EXIF.** `completeImport` should refuse (`pending-exif`) while GML choices are on and `pending` is non-empty. This matches M1.
5. **Disjoint sets.** In the import wizard, the M1 filename set and this plan's `fill` set are disjoint by construction. M3 should assert this, not assume it.
6. **Existing tests.** The contract tests listed in plan §12.3 still pin automatic GML adoption. M3 must rewrite them on purpose.
7. **Decisions to confirm:** the interpretations in §4.4, especially 1 and 3.

## 8. Git

Branch `feature/photo-workspace`, HEAD `6a99112`, unchanged. Nothing staged, committed or pushed. Untracked: the two files in §2 and this report.
