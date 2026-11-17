# FOTO capture date: filename suggestions and GML reconciliation

**PLANNING — NOT IMPLEMENTED**

Date: 2026-11-17, Europe/Oslo. Branch `feature/photo-workspace`, HEAD `4cd9b19`, clean working tree at start. Read-only pass: no application code, tests, configuration or other documentation changed. Nothing staged, committed or pushed. No subagents.

Norwegian text in `«…»` is proposed UI copy.

---

## 1. Summary

**Two findings shape the plan:**

1. **GML capture times are adopted automatically, before positions are confirmed.** Saving a GML source in the positioning wizard attaches its `fotograferingstidspunkt` evidence to the asset. The publication that follows runs `autoAcceptMetadata()`, which accepts any complete GML time over an empty or automatic EXIF value, including a *different* one. Import with «Fra GML-fil» does the same when the layer is created. Neither route offers a choice. That conflicts with the approved requirement for an explicit option and no silent replacement.
2. **Date-only values are already representable.** `normalizeCaptureTime()` returns `precision: 'date'` with no invented time, and the individual metadata dialog can already store a date-only manual value. What is missing is a filename source, a reconciliation rule and wizard integration. Only the separate, approved «Anslått dato» feature stores `12:00:00`, and it stays unchanged.

**Recommendation: staged implementation in four milestones.**

- **M1:** filename suggestions in the import wizard.
- **M2:** a pure reconciliation planner.
- **M3:** GML capture time becomes an explicit choice in both wizards.
- **M4:** presentation and export polish.

M1 is safe on its own. An approved filename value is not `acceptance: 'auto'`, so today's automatic GML policy cannot overwrite it either.

**M3 changes an approved contract.** GML capture time leaves automatic adoption, and several existing tests that pin that behaviour must be rewritten on purpose (§12.3). It needs your approval (D1).

---

## 2. Confirmed current architecture

| Concern | Where | Behaviour established from code |
|---|---|---|
| Canonical value | `photoCaptureMetadata.mjs:7` `normalizeCaptureTime` | `{ iso, precision: date\|minute\|second\|fraction, timezoneKnown, offset }`. Strict calendar validation and offsets of ±14:00 or less. The host timezone is never read. |
| Agreement | `photoCaptureMetadata.mjs:30` `captureTimesAgree`, `:38` `allCaptureTimesAgree` | The two wall clocks agree at the lower of their precisions, and known offsets must be equal. Subseconds never decide. Agreement is not transitive, so every pair is checked. |
| EXIF evidence | `photoCaptureMetadata.mjs:67`, `exifGps.mjs` | `DateTimeOriginal`, `SubSecTimeOriginal` and `OffsetTimeOriginal` give `kind: 'exif'` evidence on the **asset**. The read is asynchronous (`drainMetadata`, `photoSession.mjs:300`). |
| GML evidence | `terrainPhotoGml.mjs:54` (`photographedAtText`), `photoCaptureMetadata.mjs:78` | Raw text is normalized as above, so a date-only or minute value parses (precision `date`/`minute`). The value is `null` when the text is invalid. |
| Accepted value | `asset.captureMetadata.captureTime` | `{ value, provenance, acceptance?, acceptedAt }`, owned by the asset and shared by every occurrence. `captureTimeCleared` records a removal. |
| Automatic policy | `photoAutoMetadata.mjs:9–20` | Only `acceptance: 'auto'` is replaceable. The rule picks complete GML first, then complete EXIF. Partial values stay as evidence. |
| Where it runs | `photoSession.mjs:220` `autoAcceptMetadata`, called from `publish` (`:242`) | Runs on **layer members only**, so draft import assets are untouched until a layer exists. A layer with an open Edit session is skipped. |
| GML attachment | `photoSession.mjs:162` `attachSource` | Called by `createLayer` (`:1227`), `appendImport` (`:1248`), `applyLayerSource` (`:1032`, through `saveSourceWorkflowSource` `:641`) and `applyPhotoPositioning` (`:1079`). |
| Manual writes | `setCaptureMetadata` (`:756`), `fillMissingPhotoValues` (`:783`), `adoptSourceEvidence` (`:832`) | Provenance is `manual`, optionally with `estimated`/`mode: 'bulk'`, or the evidence provenance. No `acceptance` field is written, so the value is protected from automatic writes. |
| Manual input | `photoCaptureTimeInput.mjs:37` `composeCaptureTime` | An individual entry can be date-only. Bulk fill requires seconds (`photoManualFill.mjs:7`). |
| Estimates | `photoEstimatedDates.mjs:8` | A noon `12:00:00` technical default with `provenance.estimated`. Approved separately (`20261109-foto-estimated-capture-dates.md`). |
| Display | `photoPresentation.mjs:26` `formatPhotoCaptureTime` | Shows the value exactly as recorded, with notes `bare dato`, `uten sekunder` and `tidssone ukjent`. `photoSourceLabel` (`:4`) has no `filename` label yet. |
| Completion origin | `photoCompletion.mjs:43` `originOf` | Classifies values as `estimated`, `default`, `manual` or `source`. A filename value would fall into «Fra kilde». |
| Matching | `photoReferenceMatching.mjs:54`, `:78` | Two GML entries naming the same photo are both marked `ambiguous` (`duplicate-gml-reference`) and give **no** evidence. |
| Import wizard | `PhotoImportWizard.js:36` (`final`), `:126` (`completeImport`); `photoImportWizardState.mjs` | Steps are Bilder → Plassering → Kontroll. Plassering is the final step when the choice is «Uten plassering». A GMI layer uses Bilder → Kontroll. `completeImport` (`photoSession.mjs:511`) guards on the preview identity, then creates the layer and applies positions. |
| Positioning wizard | `PhotoPositioningWizard.js`; `SourceStages` | Kilder → Koblinger → Plassering → Kontroll. «Behold GML-kilden» in Koblinger commits the source, its evidence, and through publication the automatic time and direction adoption. Positions are committed separately in Kontroll. |
| Export | `exportContract.mjs:26` `fullCaptureTime`; `photoExportXml.mjs:28/34/48`; `photoExportRules.mjs:18–20` | Only second or fraction precision is serialized. Gemini omits the element and strips offsets and fractions. Legacy and AsBuilt block with `capture-time-precision`/`capture-time-required`. |
| Persistence | — | FOTO layers are session-only («Fotolaget finnes bare i denne økten»). The only `localStorage` use is the map display preference. |

---

## 3. Answers to the architecture questions

1. **Representation.** The accepted value, its provenance kind (`exif`/`gml`/`manual`) and the raw evidence live on the asset. `acceptance: 'auto'` alone marks a value as replaceable. A removal is remembered with `captureTimeCleared`.
2. **Date-only without midnight.** Already possible: `precision: 'date'` with `iso: 'YYYY-MM-DD'`. No component adds `00:00`. Only the estimate feature adds noon, explicitly.
3. **Preservation.** Date-only values are kept in the session and displayed as `bare dato`. There is no saved state. No export can carry a date-only value (Q4); the GML omits it or the export blocks, and nothing is padded.
4. **Schema.** Every inspected photo time is `xs:dateTime`, and lexical seconds are required (`20261031-0937-photo-export-contract-audit.md`, §190). A date-only or minute value is therefore **not schema-valid**. A Gemini package without the time is also XSD-invalid (`Expected is ( fotograferingstidspunkt )`), and Gemini VA acceptance is `unconfirmed`, based on a contractor reference only (`photoExportRules.mjs:33`). An input GML with a date-only value is schema-invalid too, but the parser tolerates it, which is correct for evidence.
5. **GML timestamps.** They are parsed in `terrainPhotoGml.mjs`, associated in `attachSource` through `matchPhotoReferences`, and applied by `autoAcceptMetadata` on the next publication.
6. **Repeated references.** Within one GML, two references to the same photo give no evidence at all. Across several GML sources, one asset can hold evidence from each. GMI occurrences carry no time. Decisions must therefore be made per asset (§8).
7. **Time zones.** EXIF without `OffsetTimeOriginal`, GML `xs:dateTime` without an offset, and filename times are all **local wall clocks with an unknown zone**. They are compared and exported as recorded. Nothing converts through UTC or the host zone, and an offset is never borrowed from another source. Agreement already treats an unknown offset as compatible.
8. **Transactions.** See §9.
9. **Declines and conflicts.** See §6 and §9. Under the recommended model, a declined GML value remains evidence and can still be chosen per photo later, through the existing dialog or a recheck. No decline record is needed.
10. **Later manual edits.** These already produce `kind: 'manual'` and are protected. Touching and saving a filename-derived value in the dialog turns it into a manual value, which counts as the user's confirmation. That is correct.
11. **Tests and fixtures.** See §12. Synthetic JPEGs come from `gpsJpeg({ captureTime, subsecond, offsetTime })`, with test-chosen filenames. Synthetic GML comes from `completionGml` and `photoEvidenceFixtures`.

---

## 4. Proposed metadata representation

The accepted shape stays as it is. New provenance variants are added, with no new storage mechanism:

```js
// Filename (M1). No evidence item is stored: the suggestion can be recomputed from the immutable filename.
{ value: { iso: '2026-10-14', precision: 'date', timezoneKnown: false, offset: null },
  provenance: { kind: 'filename', raw: '20261014_KUM12.jpg', token: '20261014', pattern: 'ymd-compact', via: 'import-suggestion' },
  acceptedAt }

// GML chosen in a wizard (M3): the existing evidenceProvenance(...) plus `via`.
{ value, provenance: { ...evidenceProvenance(evidence, agreeing), via: 'positioning-wizard' | 'import-wizard' }, acceptedAt }
```

- **No `acceptance` field on either.** The value is then not replaceable, through the existing `replaceable()`. After M3, `acceptance: 'auto'` means automatic EXIF only.
- **Precision is preserved exactly.** Date-only stays `date` and HHmm stays `minute`. Nothing is padded, and the offset is always `null` for filename values.
- **Precision rank** for reconciliation is `date < minute < complete`, where `second` and `fraction` count as equal. This follows the existing rule that subseconds never decide.
- **Estimates** keep their noon storage, but reconciliation compares them at **date** precision. Noon is not an observation.
- **Protection classes** used by the planner (§6) are:

| Class | Values |
|---|---|
| automatic | EXIF `acceptance: 'auto'` |
| approved low priority | `filename` |
| explicit source | GML via a wizard, or a source chosen by hand |
| manual | `manual`, including `estimated` |
| removed | `captureTimeCleared` |

- **Filename values are not added to `metadataEvidence` in M1.** That list feeds conflict detection in adoption, readiness and the inspector (`evidenceValuesConflict`). Adding weak filename evidence there would create new `capture-time-sources-differ` notes and block explicit EXIF adoption as `conflicting`. Declined filename suggestions therefore leave no trace.

---

## 5. Filename parser (pure module, M1)

**Proposed module:** `src/lib/photos/photoFilenameCaptureTime.mjs`. It exports a `parseFilenameCaptureTime(filename, { today })` function and a pattern table. Each pattern has an id and test vectors, so it can be extended.

### 5.1 Input and tokenisation

- Input is `asset.originalFilename`, the basename. Folder names are not used (D7).
- The final extension is stripped. Original bytes and the filename are never changed.
- A date token must be **digit-bounded**, meaning start/end or a non-digit on each side. A digit run longer than its pattern is rejected, so `KUM12320261014` gives nothing.
- A time is used **only when it directly follows the date**, with exactly one separator from `_`, `-`, space or `T`. Digits elsewhere in the name never become a time.
- If a name contains two date tokens that differ, it gets no suggestion. Identical repeats are allowed.

### 5.2 Recognised patterns

| Id | Example | Precision |
|---|---|---|
| `ymd-hms-compact` | `20261014_143302`, `IMG_20261014_143302`, `IMG_20261014_143302_1` | second |
| `ymd-hms-14` | `20261014143302` (exactly 14 digits) | second |
| `ymd-hms-separated` | `2026-10-14_14-33-02`, `2026-10-14 14.33.02`, `WP_20261014_14_33_02_Pro` | second |
| `dmy-hms` | `14.10.2026_143302`, `14.10.2026 14.33.02` | second |
| `ymd-hm-compact` | `20261014_1433` | minute (D4) |
| `ymd-hm-separated` | `2026-10-14_14-33` | minute |
| `dmy-hm` | `14.10.2026_1433` | minute |
| `ymd-compact` | `20261014`, `KUM12_20261014` | date |
| `ymd-separated` | `2026-10-14`, `2026_10_14` | date |
| `dmy-dotted` | `14.10.2026` | date |

The separator inside a separated time must be consistent: `14-33-02` is accepted, `14-33.02` is not.

### 5.3 Rejected

- Two-digit years, such as `261014`.
- Hyphen or underscore day-first or month-first forms (`14-10-2026`, `10-14-2026`), because they are ambiguous. Only the dotted, Norwegian day-first form is accepted.
- A 12-digit run (`YYYYMMDDHHmm`), which collides with other numbering.
- `PXL_…`: Pixel filenames are commonly UTC, so a local reading would shift the time (D7).
- WhatsApp `IMG-YYYYMMDD-WA…`: that date is the transfer date, not the capture date.
- iOS `IMG_1234` and every other name without a date token.

### 5.4 Validation

- Year 2000–2099, which matches the existing `capture-time-implausible` threshold.
- A real calendar day, including leap years.
- HH 00–23, mm 00–59 and ss 00–59. No leap second.
- The date must not be later than the import day plus one. `today` is passed in as a calendar date, for plausibility only; it is never used to convert a value.

### 5.5 Output

```js
{ value /* normalizeCaptureTime(...) */, precision, pattern, token, raw }
```

The output never carries an offset or invented seconds, and `timezoneKnown` is always `false`.

### 5.6 Counter guard (D4)

`20261014_0001` is a valid `00:01`, but it is usually a sequence counter. A batch-level guard downgrades `ymd-hm-*` matches to date-only when at least three files with the same date carry 4-digit suffixes that form a consecutive integer run.

---

## 6. Reconciliation rules and matrix

### 6.1 Priority and rules

Source priority is **GML > EXIF > filename**.

**A manual, explicitly chosen or removed value is never changed without a per-photo or group choice made in the wizard. Each choice defaults to keeping the current value.**

| Rule | Behaviour |
|---|---|
| R0 | No usable incoming value: no change. |
| R1 Fill | No accepted value and not removed: a complete value fills under option 1, a partial value under option 2. |
| R2 Agree, no gain | Values agree and the incoming value is not strictly more precise: **no change**. Existing EXIF stays, and the evidence remains visible. |
| R3 Completion | Values agree and a higher-priority incoming value is strictly more precise. Automatic or filename values: under the option, which defaults to its own state. Manual, estimated or explicit values: a review row that defaults to «Behold». |
| R4 Conflict | Values disagree: a SJEKK row shows both values and an explicit choice, defaulting to «Behold gjeldende» (D3). |
| R5 Removed | `captureTimeCleared`: not offered and not counted. A per-photo choice is still possible later. |
| R6 Asset | One decision per asset. Counts are unique originals («bilder»). |

**Stage 1, filename against EXIF:** a suggestion is offered only when the asset has **no usable EXIF time at all** and **no usable time from a selected draft GML**. So filename values never conflict with EXIF or GML at import. An EXIF value without seconds or with only a date still wins, and remains evidence for later explicit use.

### 6.2 GML incoming, Stage 2

Agreement is tested with `captureTimesAgree`, and estimates are compared at date precision.

| Current accepted value | GML complete, agrees | GML complete, differs | GML partial, agrees | GML partial, differs |
|---|---|---|---|---|
| None | **Fill** (option 1) | — | **Fill partial** (option 2) | — |
| Removed by a person | No change | No change | No change | No change |
| EXIF, automatic, complete | No change | Conflict, «Behold» | No change | Conflict, «Behold» |
| EXIF, chosen by a person | No change | Conflict, «Behold» | No change | Conflict, «Behold» |
| Filename, second | No change | Conflict, «Behold» | No change | Conflict, «Behold» |
| Filename, minute | **Complete** (option 1) | Conflict, «Behold» | No change | Conflict, «Behold» |
| Filename, date-only | **Complete** (option 1) | Conflict, «Behold» | Minute: **complete** (option 2); date: no change | Conflict, «Behold» |
| GML from an earlier source | Strictly more precise: review row, «Behold»; otherwise no change | Conflict, «Behold» | No change | Conflict, «Behold» |
| Manual, precise | No change | Conflict, «Behold» | No change | Conflict, «Behold» |
| Manual, date-only or minute | Review row «Kan fullføres», «Behold» | Conflict, «Behold» | Review row only if strictly more precise | Conflict, «Behold» |
| Manual, estimated (`Anslått`, compared as a date) | Same date: review row, «Behold» | Other date: conflict, «Behold» | No change | Conflict, «Behold» |

**What the GML options can change, by construction:**

- Option 1 and option 2 only **fill empty values** or **complete approved filename values**.
- They never replace EXIF, never replace a manual value, and never replace an explicit choice.
- Anything else needs a visible row choice.

**Filename completed by EXIF (Stage 1):** not applicable, because filename suggestions are only made where EXIF has no usable value.

**Lower-priority refinement:** an agreeing EXIF complete value stays when GML has only a date (R2). This is the more precise value confirming a coarser one, not a lower source overriding a higher one.

---

## 7. Wizard UI: minimal changes and integration points

Both wizards already run inside `.photo-collection-dialog`. `photoTheme.css:42` turns every native checkbox and radio in that scope teal, and the new controls must also carry `accent-gmi-interactive`, as the standard requires. The SJEKK panel reuses `data-validation-tone="warning"` with `.gmi-validation-panel`, and the review list reuses the `<details>` pattern from the import Kontroll step.

The wizards get **no new steps and no help paragraphs.**

### 7.1 Stage 1: import wizard

**New component:** `PhotoImportCaptureTimeChoices`. It renders on whichever step is **final**:

- the review step, `PhotoImportReviewStep`;
- or Plassering, when «Uten plassering» is chosen (`PhotoImportPlacementStep`, under the options).

`PhotoImportWizard.js:36` already computes `final`. The block renders only when at least one suggestion exists.

```
┌ SJEKK ───────────────────────────────────────────────────────────┐
│ 12 bilder mangler opptakstid. Filnavnene gir dato og klokkeslett │
│ for 7 bilder, og kun dato for 3.                                 │
│ ☐ Bruk dato og klokkeslett fra filnavn (7)                       │
│ ☐ Bruk kun dato fra filnavn (3)                                  │
│ ▸ Vis forslag (10)                                               │
└──────────────────────────────────────────────────────────────────┘
```

- The sentence is left out when there are no suggestions. A count clause is left out when its count is zero, together with its checkbox.
- «Vis forslag» lists one row per original: filename, then the `formatPhotoCaptureTime` text. Its existing notes (`uten sekunder`, `bare dato`, `tidssone ukjent`) already flag minute and date values, so no extra sentence is needed.
- While any incoming photo is still being read for EXIF, the block shows only `«Leser opptakstid fra bildene …»`, without checkboxes.

**State and commit:**

- The choices live in `importWizardReducer`: `captureSuggestions: { complete: false, dateOnly: false }`. They survive back navigation and placement changes.
- The plan is recomputed from the snapshot, so counts follow placement, the draft GML and added or removed photos.
- `completeImport` receives `{ captureSuggestions }` and re-plans against live assets.

**Scope by context:**

- Applies to new or appendable assets only. A target layer's existing photos are never touched.
- The GMI-layer context behaves the same way.

### 7.2 Stage 2: positioning wizard (Koblinger)

The choice belongs to the step that already commits the GML source: Koblinger, through `saveSourceWorkflowSource`. That is where evidence is attached today. Capture time does not depend on which positions are later chosen in Kontroll, which may be none (D5).

**New component:** `PhotoGmlCaptureTimeChoices`. It is rendered under `PhotoGmlSummary` when `review.source.kind === 'gml'` and the plan has at least one row.

```
☑ Bruk opptakstid fra GML (14)
☐ Bruk kun dato fra GML (2)
┌ SJEKK ───────────────────────────────────────────────────────────┐
│ 4 bilder har en annen opptakstid i GML-filen.                    │
│ Ved avvik: (•) Behold gjeldende  ( ) Bruk GML                    │
│ ▾ Vis avvik (4)                                                  │
│   IMG_0412.jpg  Gjeldende 14.10.2026 14:33:02 · EXIF             │
│                 GML      14.10.2026 15:33:02                     │
└──────────────────────────────────────────────────────────────────┘
```

- **Option 1** covers R1 fills of complete values and R3 completions of automatic or filename values (D2).
- **Option 2** covers partial fills and completions. It is labelled `«Bruk kun dato fra GML (n)»`, or `«Bruk ufullstendig opptakstid fra GML (n)»` when any value has minute precision. It is unchecked by default.
- **Review rows.** R3 completions of manual, estimated or explicit values join the same list, with the reason `«Kan fullføres»` on each row. The group choice applies to them as well.
- **Per-row overrides** are deferred (D9).
- **No-op agreements** are neither listed nor counted.
- **Ambiguous references** are already counted as «tvetydige» in `PhotoGmlSummary`, so they are not repeated.

**Commit and copy:**

- `saveSourceWorkflowSource(ticket, review, { captureTime })` re-plans against live assets. It validates, attaches, writes the chosen values and publishes **once**.
- The recheck path offers the same choice. That gives a natural later opportunity inside the existing wizard, with no new synchronization feature.
- The saved `SourceStages` text currently says `«Filen og treffene er beholdt. Ingen posisjoner er endret.»`. When times were written, it gains `«Opptakstid er brukt for n bilder.»`. The pre-save line `«Ingen posisjoner eller retninger endres.»` must stop implying that nothing else changes (§13, side finding 1).

### 7.3 Stage 2 inside the import wizard

When the placement is «Fra GML-fil», the same `PhotoGmlCaptureTimeChoices` renders in Kontroll under the filename block, from the draft source (`positioning.source`). Under M3 this is **required**: otherwise an import with GML would no longer adopt any GML times. The filename and GML candidate sets are disjoint by the Stage 1 rule.

---

## 8. Duplicate references

- Decisions, counts and writes are keyed by **asset**, never by occurrence. The model already enforces this, and the planner deduplicates as `planManualPhotoFill` does.
- **One GML that names a photo twice** gives no evidence for it. It is not offered, and positions are equally unaffected.
- **Several GML sources:** each wizard run stages exactly one source. A value accepted from an earlier GML is the «GML from an earlier source» state in the matrix, so a second GML never displaces it silently. This matches the existing «a second GML does not displace the first».
- **Repeated GMI objects** share the asset's single value. Rows can reuse `PhotoOccurrenceContext` if the occurrence count is worth showing.
- **Identical basenames in different folders** are separate assets, parsed separately. Their GML matching stays governed by the existing ambiguity rule.

---

## 9. Transactional behaviour

| Event | Import wizard | Positioning wizard |
|---|---|---|
| Before commit | Choices exist only in reducer state, and nothing is written | Choices exist only in component state, and nothing is attached |
| Back or forward | Choices kept, plan recomputed | Choices kept while the review is the same object, reset when a different source is staged |
| Cancel or Escape | `clearImport` releases the draft, so nothing remains | Unsaved review discarded. A source saved earlier keeps its committed times (current lifecycle) |
| Stale state | The preview guard already compares `records.spatial` identities, which change with every EXIF read through `updateAsset`. Add the per-asset `captureMetadata` identity to the guard | Add the plan's per-asset `captureMetadata` identities to the save guard. On mismatch, return `review-changed` and show the existing «Bildene eller kilden er endret …» message |
| EXIF pending | `completeImport` refuses while a filename choice is on and any incoming EXIF is pending (`pending-exif`) | Not applicable: layer assets are read before positioning |
| Commit atomicity | Validate first. Pass the writes into `createLayer`/`appendImport`/`applyLoadedGmiImport` so they land **before** that method's single `publish` | Validate every target first, then attach, write and publish once |

**Writing before `publish` is also what makes M1 safe today.** `autoAcceptMetadata` sees the approved filename values, which are non-automatic, and skips those assets.

Declining a GML value leaves it as evidence. The asset then shows `«Opptakstid i kilde»`, readiness classifies it as `adoptable`, and the metadata dialog offers it as a source choice. Nothing is lost and nothing comes back by itself.

---

## 10. Import and export compatibility

- **Gemini.** A date-only or minute value is omitted, exactly as a missing time is today. The `compatibility-time` warning already counts these as «uten full opptakstid». Such a package is XSD-invalid against Skråfoto 2019, and Gemini VA acceptance is `unconfirmed`.
- **Legacy 2019 and AsBuilt 5.2.** These block with `capture-time-precision`, «godtatt opptakstid med sekunder kreves». That is correct.
- **Filename-derived complete times** are exported like any other wall-clock time, without an offset. The provenance is not carried in GML. M4 adds a plan warning in the style of `capture-time-estimated` (D6).
- **Estimates and date-only values interact.** A date-only filename value counts as *accepted*, so the «Bruk foreslått dato» estimate action (`planManualPhotoFill`) skips it. A user could end up with fewer Gemini-exportable times than if they had estimated (D8).
- **What never changes:** original JPEG bytes, EXIF, filenames and the package attachment names. The existing original-byte tests in `photoEstimatedDates.test.mjs` cover this pattern.
- **Input GML** with a date-only value is schema-invalid but tolerated as evidence. This is documented, with no new warning.
- **Uncertain:** whether Gemini VA treats a missing time differently when the delivered set mixes complete and missing times. This needs real acceptance (§12.3).

---

## 11. Staged implementation

| Milestone | Scope | Boundary and tests |
|---|---|---|
| **M1: filename suggestions** | Parser module. Planner `planFilenameCaptureSuggestions(importAssets, draftGml)`. Reducer state, `PhotoImportCaptureTimeChoices`, and the `completeImport` argument with guarded writes before publish. `photoSourceLabel`/`photoMetadataSourceLabel` gain «Filnavn» | No change to the GML policy. Parser vectors, planner, session commit and stale guard, plus one import-wizard browser case. Independently shippable |
| **M2: reconciliation planner** | Pure `planGmlCaptureTimeReconciliation(assets, source, ledger)` returning `{ fill, fillPartial, completions, reviewRows, conflicts, counts }` per §6 | Exhaustive matrix tests. No session or UI change |
| **M3: explicit GML time (contract change, D1)** | Remove GML from `planAutoCaptureTime`, leaving EXIF automatic. The `captureTime` decision on `saveSourceWorkflowSource` and `completeImport`. `PhotoGmlCaptureTimeChoices` in Koblinger and in import Kontroll | Rewrite the pinned tests (§12.3). Positioning and import browser cases. Direction and photographer policy unchanged |
| **M4: presentation and export** | Completion origin and label for filename. Plan warning for filename provenance. `SourceStages` copy. Inspector and popup source label | Readiness, plan and inspector unit tests, plus the existing completion browser suite |
| **M5 (optional, D8)** | Let «Anslått dato» convert date-only accepted values to the technical noon on their own date | Separate approval. Extends `photoEstimatedDates` tests |

---

## 12. Tests

### 12.1 Unit and session tests (`node --test`)

**New `tests/photoFilenameCaptureTime.test.mjs`:**

- Each pattern, positive.
- Boundaries: digit runs, a non-adjacent time, two different dates.
- Invalid values: Feb 29 in a non-leap year, 24:00, 23:60, seconds 60, year 1999, a future date.
- Rejected forms: `PXL_`, WhatsApp, `IMG_1234`, ambiguous day/month, 12-digit runs.
- Output: offset is always `null`, no seconds are added, and the counter guard works.

**New `tests/photoCaptureSuggestions.test.mjs` (session):**

- Suggestions only for assets with no usable EXIF time or draft-GML time.
- Both choices off writes nothing.
- Complete-only and date-only choices are independent.
- Writes land before the auto pass and stay `kind: 'filename'`.
- Precision is preserved: `date` keeps its `iso`, with no `T`.
- EXIF pending refuses the commit, and stale guards fail closed.
- Cancel leaves no metadata. Append mode leaves existing layer assets untouched.
- Repeated occurrences give one write per asset.
- Original bytes are unchanged.

**New `tests/photoGmlCaptureReconciliation.test.mjs`:** every cell of §6.2, both argument orders where symmetric, estimates compared as dates, no offset borrowing, and asset deduplication with a duplicate GML reference.

**Regression to run unchanged:** `photoCaptureMetadata`, `photoCaptureAgreement`, `photoEvidenceAdoption`, `photoEstimatedDates`, `photoManualFill`, `photoImportComplete`, `photoImportWizardState`, `photoImportOutcome`, `photoSourceWorkflow`, `exifGps`, `photoExportReadiness`, `photoExportPlan`, `photoExportSerializers` and `photoGeminiCompatibility`. Baseline at `4cd9b19`: the first ten files plus `photoAutoMetadata` gave **194/194 pass** in this pass.

### 12.2 Browser tests (existing harness, production build, serial, free port)

- **`photoImportWizardUi`:**
  - Six JPEGs, either without EXIF time or with EXIF, named by pattern.
  - Check the SJEKK text and counts, the checkboxes unchecked by default with a computed teal accent, «Vis forslag» rows, back navigation keeping the choices, cancel leaving nothing, and commit giving inspector source «Filnavn» and `bare dato`.
  - Check layouts at 1280×720 and 1366×768.
- **`photoPositioningUi`:**
  - A GML with a time that fills, a time that conflicts with EXIF, a date-only value, a duplicate reference, and a photo with a manual date-only value.
  - Check the option counts, the default «Behold gjeldende», that keeping the default leaves EXIF and manual values unchanged, that «Bruk GML» replaces only conflicts, and that recheck offers the declined values again.
  - Check keyboard access and Escape.
- Import wizard with «Fra GML-fil»: both blocks visible, and the candidate sets disjoint.

### 12.3 Contract tests that M3 must change deliberately

These are likely affected; confirm by running them.

- **`photoAutoMetadata.test.mjs`:**
  - `capture time priority…` (l. 62) and `…automatic ones give way to GML` (l. 77).
  - `initial import…` (l. 116, 130) and `appended photos…` (l. 145).
  - `late GML matching…` (l. 161, 177).
  - `contractor shape…` (l. 425).
  - The capture-time assertions in these tests move to the explicit wizard decision. Direction assertions stay.
- **`photoPositioningUi.test.mjs:121`**, which asserts the GML source after saving.
- **Corpus suites** (`photoCaptureEvidenceCorpus`, `photoExportReadinessCorpus`, `photoEvidenceExportChain`) wherever they rely on automatic GML time.
- **Equivalent safety coverage must remain:** no silent replacement, manual values survive, removed values stay removed, and a repeated run is a no-op.

### 12.4 Gemini VA acceptance (manual, after M3 and M4)

1. Import a real contractor set with mixed EXIF, filename and missing times. Accept the complete and date-only suggestions, then load the matching GML and keep the defaults.
2. Export a Gemini package. Confirm that complete times appear with seconds and no offset, and that date-only photos have no element.
3. **Import into Gemini VA.** Record the result in `PHOTO_EXPORT_IMPORT_EVIDENCE.missingCaptureTime`.
4. Repeat with one EXIF/GML conflict resolved each way, and inspect the exported clock.

---

## 13. Outstanding decisions

| # | Decision | Recommendation |
|---|---|---|
| **D1** | How GML capture time is accepted | **Option A:** remove GML from automatic adoption and accept it only through the explicit wizard decision. EXIF stays automatic. *Option B:* keep automatic fills of empty values and add persistent per-evidence decline records. A has no decline storage and no window between attaching and deciding, at the cost of rewriting the tests in §12.3 |
| **D2** | Default for «Bruk opptakstid fra GML» | **Checked.** It only fills empty values or completes filename values the user approved as lowest priority, and it keeps today's outcome for uncontested photos. Option 2 (partial values) stays unchecked. *Alternative:* unchecked, mirroring Stage 1 |
| **D3** | Default for conflicts | **«Behold gjeldende»** for every class, which honours "no silent replacement of EXIF, filename or manual values". *Alternative:* preselect GML only against automatic EXIF |
| **D4** | HHmm filename times | **Offer them** in «dato og klokkeslett», flagged `uten sekunder` in the review list, with the counter guard of §5.6. *Alternative:* exclude them in M1 |
| **D5** | Where the GML choice sits in the positioning wizard | **Koblinger**, committed with «Behold GML-kilden», where evidence is attached. *Alternative:* Kontroll, but that ties times to confirming at least one position |
| **D6** | Filename provenance in readiness and export | A separate completion origin «Filnavn» and a plan warning that GML does not carry the source. *Alternative:* keep it under «Fra kilde» |
| **D7** | Pattern scope | Exclude `PXL_` (UTC) and WhatsApp, and do not read folder names, in M1. Revisit with counts-only evidence from real deliveries |
| **D8** | Date-only values against the estimated noon | Defer to M5: let «Anslått dato» lift date-only values to the technical noon on their own date, after approval |
| **D9** | Per-row overrides | Group-level choices only in M1 and M3. Per-row choices can be added if real conflict lists prove mixed |

### Side findings (recorded, not in scope)

1. The `SourceStages` pre-save text says `«Ingen posisjoner eller retninger endres.»`. From the code, saving a GML source also adopts GML directions automatically, through `planAutoDirection` on publish. Verify in the browser before changing the copy.
2. `PhotoImportReviewStep` uses the text glyph `⚠` for attention rows, which breaks the icon standard. Fix it if M1 edits that row; otherwise record it for the styling audit.
3. `photoPositioningWizard.css:51–55` uses hex literals for the review group. Record it for the styling audit, and do not copy it into new rows.

---

## 14. Sol Medium brief: M1 filename suggestions

**Goal:** optional filename-derived capture times in the FOTO import wizard, applied only on approval when the layer is created or photos are appended.

**Read first:** this report §4–§5, §6.1, §7.1, §9 and §12.1; root `AGENTS.md`.

**Implement:**

1. **`src/lib/photos/photoFilenameCaptureTime.mjs`** (pure). `parseFilenameCaptureTime(filename, { today })` per §5, plus `planFilenameCaptureSuggestions(photos, { draftGmlEvidenceByAsset, today })`. The planner returns `{ missing, complete: [...], dateOnly: [...] }`, keyed by `assetId` and deduplicated. Each item is `{ assetId, filename, value, pattern, token }`.
   - An asset is a candidate only when it has no `captureTime` evidence with a value from EXIF or the draft GML, no accepted value, and no removal record.
   - Minute values go into `complete`.
2. **`photoImportWizardState.mjs`:** add `captureSuggestions: { complete: false, dateOnly: false }` and a `captureSuggestions` action. The state must persist across steps and placement changes.
3. **`photoSession.mjs`:**
   - `previewImport` also returns `captureSuggestions`, computed from the incoming assets and the draft GML.
   - `completeImport({ …, captureSuggestions })` re-plans against live assets. It refuses with `pending-exif` when a choice is on and EXIF is pending, and extends the guard with per-asset `captureMetadata` identity.
   - It passes the writes into `createLayer`/`appendImport`/`applyLoadedGmiImport`, which apply them **before** their own `publish`.
   - Each write is `{ value, provenance: { kind: 'filename', raw, token, pattern, via: 'import-suggestion' }, acceptedAt }`, with **no** `acceptance` field.
   - Do not add filename items to `metadataEvidence`.
4. **`PhotoImportCaptureTimeChoices.js`:** the SJEKK panel (`data-validation-tone="warning"`, `.gmi-validation-panel`), with two checkboxes and teal `accent-gmi-interactive`.
   - The «Vis forslag (n)» list shows each row's `formatPhotoCaptureTime` text.
   - While EXIF is pending, show the `«Leser opptakstid fra bildene …»` status only.
   - Render it on the final step only: `PhotoImportReviewStep`, or `PhotoImportPlacementStep` when «Uten plassering» is chosen.
   - Use the exact copy in §7.1. Add no other text.
5. **`photoPresentation.mjs`:** `photoSourceLabel` and `photoMetadataSourceLabel` return «Filnavn» for `kind: 'filename'`.

**Do not:**

- change `photoAutoMetadata.mjs`, GML attachment, direction, export serializers, export naming, the positioning wizard or LOK/TOP → KUM;
- write EXIF or image bytes;
- invent seconds, times or offsets.

**Tests:**

- New `tests/photoFilenameCaptureTime.test.mjs` and `tests/photoCaptureSuggestions.test.mjs`, per §12.1.
- Extend `photoImportWizardState.test.mjs`.
- One `photoImportWizardUi` case, per §12.2.
- Run the §12.1 regression list, which had a 194/194 baseline.
- Run ESLint on the touched files, `npm run build` (a shared session change), `git diff --check`, and browser checks at 1280×720 and 1366×768.

**Report:** a completion report in `docs/agent-reports/` with commands and results. Deliver it uncommitted.

---

## 15. This pass

**Commands:**

- Focused baseline: `node --test` over `photoCaptureMetadata`, `photoAutoMetadata`, `photoImportComplete`, `photoSourceWorkflow`, `photoEstimatedDates`, `photoImportWizardState`, `photoCaptureAgreement`, `photoEvidenceAdoption`, `exifGps` and `photoImportOutcome`. Result: **194 tests, 194 pass, 0 fail, 0 skipped**.
- No browser tests, build or lint were run. No code changed.

**Not examined:** private contractor corpora. Filename pattern frequencies in real deliveries are therefore unverified (D7).

**Git:** branch `feature/photo-workspace`, HEAD `4cd9b19`. The only change is this untracked report. Nothing staged, committed or pushed.
