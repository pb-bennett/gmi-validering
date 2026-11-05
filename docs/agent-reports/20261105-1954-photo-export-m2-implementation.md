# FOTO export M2 — shared rules and readiness

Date: 2026-11-05, Europe/Oslo. **Nothing was committed, pushed or deployed.**

Specification: `20261104-1823-photo-export-overhaul-planning.md`, decisions D1–D7. Only M2 was implemented.

Norwegian text in `«…»` is UI copy.

---

## 1. Summary

**Shared readiness and export-plan blocking errors agree.** Across 1,806 scenarios, the two produce identical sets of `{code, assetId, occurrenceId, field}`. The only differences are the checks only the plan can make, listed in §5.

**The planner refactor changed no export output.** Compared with `aab2b84` over the same 1,806 scenarios:

- All errors, warnings, order, counts and context match, apart from three intended differences (§3).
- All 389 exportable scenarios serialize to the same normalized bytes.
- All 7 Gemini goldens and the Legacy and AsBuilt baselines are unchanged.

**Two things need your attention:**

1. **The brief contained a conflict.** §6 asked to extend `PHOTO_EXPORT_PROFILES`, which lives in `exportContract.mjs`, and §8 forbids modifying that file. I kept the strict boundary, so `tier` is in `PHOTO_EXPORT_PROFILE_METADATA` in `photoExportRules.mjs`. Moving it is a small change if you prefer the original location.
2. **F17 is computed but not yet shown.** Readiness now reports Gemini schema gaps correctly, but the existing dialog does not display them, and that display is M6. A user can still download schema-invalid Gemini output with no explicit warning.

---

## 2. Starting state and files

Started from a clean worktree on `feature/photo-workspace` at `aab2b84`, as expected.

**Created**

| File | Purpose |
|---|---|
| `src/lib/photos/export/photoExportRules.mjs` | Requirement, schema, evidence and tier tables; `evaluatePhotoExportRules` |
| `src/lib/photos/export/photoExportReadiness.mjs` | `photoExportReadiness`, `classifyCaptureTime` |
| `tests/helpers/photoExportMatrix.mjs` | Parity matrix vocabulary and fixtures |
| `tests/photoExportRules.test.mjs` | Tables, rule behaviour, labels, wording |
| `tests/photoExportReadiness.test.mjs` | Levels, classification, recommendations, purity |
| `tests/photoExportParity.test.mjs` | Readiness/plan parity, ownership, order, documented differences |
| `tests/photoExportReadinessCorpus.test.mjs` | Opt-in corpus parity at each workflow step |

**Modified**

| File | Change |
|---|---|
| `src/lib/photos/export/photoExportPlan.mjs` | Validation extraction, plus the F14 wording |
| `src/lib/photos/export/photoExportDiagnostics.mjs` | Labels for all codes; `photoExportDiagnosticLabel` |
| `src/components/photos/PhotoExportDialog.js` | One note line and one wording correction |
| `tests/photoEvidenceUi.test.mjs` | Additions only: F3 note, label and F9 checks in the real app |

**Not modified:** `photoExportXml.mjs`, `photoExportPackage.mjs`, `attachmentNames.mjs`, `exportContract.mjs`. Their `git diff` is empty.

---

## 3. Rule architecture and planner integration

```
photoExportRules.mjs            tables + evaluatePhotoExportRules (sync, the one implementation)
   ▲ called by                                ▲ called by
photoExportPlan.mjs                    photoExportReadiness.mjs
(adds files, naming, projection,       (adds evidence, recommendations,
 stale-plan)                            schema and import levels, tasks)
```

`evaluatePhotoExportRules({ profile, crs, context, assets, occurrences })` returns `{ errors, warnings }`. It covers:

| Scope | Rules |
|---|---|
| Layer | `invalid-profile`, `invalid-crs`, `invalid-context`, `no-placed-photos`, `unplaced-excluded` |
| Asset, once each | `capture-time-required`, `capture-time-precision`, `invalid-xml-text`, `photographer-omitted` |
| Occurrence, each | `invalid-direction`, `direction-required` |

Only placed occurrences and the assets they refer to are evaluated.

**Planner change.** The planner calls the evaluator once and groups results by owner. It then inserts each owner's diagnostics where it reaches that owner: `applyRules('layer')`, `applyRules('asset:…')`, `applyRules('occurrence:…')`. The established order around file and projection checks is therefore exact. IDs, coordinates, serialization and package code are untouched, and the diff is confined to the validation lines plus one warning message.

### Equivalence proof

Before changing the planner, I recorded every error, warning, excluded row, count, context and normalized XML hash from `aab2b84` across the matrix, then diffed the refactor against it.

| Result | Scenarios |
|---|---|
| Compared | 1,806 |
| Byte-identical records | 977 |
| Unexplained differences | **0** |

The remaining records differ only in these intended ways:

| Difference | Occurrences | Reason |
|---|---|---|
| `direction-required` message | 514 | F9 |
| `compatibility-time` message | 584 | F14 and F3 |
| `invalid-xml-text` gained `assetId` | 108 | Beyond plan: needed for ownership (§12) |

**This check caught a real defect in my first version.** An unrepeated photo's occurrence ID equals its asset ID, so grouping by bare ID applied those diagnostics twice. The first comparison showed 985 unexplained differences. Owner keys now carry their kind, and an explicit order test protects this.

### Preserved error codes

Every existing code is preserved, with its existing owner: `invalid-profile`, `invalid-crs`, `invalid-context`, `no-placed-photos`, `attachment-naming`, `missing-file`, `file-read-failed`, `capture-time-required`, `capture-time-precision`, `invalid-xml-text`, `projection-failed`, `invalid-direction`, `direction-required`, `stale-plan`. Warning codes are also unchanged, and `data-diagnostic-code` still works.

---

## 4. Readiness API

```js
photoExportReadiness(photos, { profile, crs, context, now }) → {
  status: 'blocked' | 'schema-gap' | 'recommendations' | 'ready',
  levels: {
    generation: 'possible' | 'blocked',
    pendingChecks: ['original-files', 'attachment-names', 'projection'],
    schema: { name, method: 'rules', assessed, met, gaps },
    importEvidence: { profile, deviations, recorded },
  },
  counts: { total, placed, excluded, assets, readyOccurrences },
  blocking, recommendations, excluded, notes,
  tasks: { captureTime, direction, photographer, placement, context },
}
classifyCaptureTime(photo, requirement) → { state, requirement, blocking, accepted, evidence,
  adoptableKinds, sourcesAgree, sourcePending, replacesAccepted }
```

Status order is blocked, then schema gap, then recommendations, then ready.

### Example results

The real 148-photo corpus at each step of the workflow, for Gemini:

| Step | `status` | Generation | Schema gaps | Detail |
|---|---|---|---|---|
| GML attached, positions accepted | `blocked` | blocked | time 148, direction 148 | 148 `direction-required`; 148 adoptable times; 148 `zero-review`; note `148 bilder mangler opptakstid, men tiden finnes i EXIF.` |
| GML `0°` explicitly accepted | `schema-gap` | possible | time 148 | Deviation: time `unconfirmed`, reference-only. Recommendation: `direction-all-zero` (148) |
| EXIF times adopted | `recommendations` | possible | none | `schema.met: true`; `direction-all-zero` remains |

The critical case, Gemini without capture times:

```js
{ status: 'schema-gap', levels: { generation: 'possible',
    schema: { name: 'Skråfoto 2019', method: 'rules', assessed: true, met: false,
      gaps: [{ field: 'captureTime', count: 2, missing: 2, insufficientPrecision: 0 }] },
    importEvidence: { profile: 'imported',
      deviations: [{ field: 'captureTime', state: 'unconfirmed', count: 2, referenceOnly: true }] } },
  blocking: [] }
```

### Capture-time states

| State | When |
|---|---|
| `accepted` | Accepted value with seconds |
| `partial` | Accepted without seconds (`replacesAccepted: true`), or usable evidence without seconds |
| `conflict` | Sources disagree, using the M1 agreement rule |
| `adoptable` | At least one source eligible; `adoptableKinds` and `sourcesAgree` say which |
| `pending` | EXIF still reading and nothing adoptable yet |
| `unusable` | Evidence present, none interpretable; raw values are returned |
| `none` | No evidence |

Unaccepted evidence never counts as accepted. If EXIF is still pending but GML is adoptable, the state is `adoptable` with `sourcePending: true`. A recommended time is never `blocking`.

### Purity

Tests run readiness on deep-frozen input, with `crypto.randomUUID`, `Date.now`, `Blob.arrayBuffer`, `text` and `slice` all mocked to throw. They also confirm the session snapshot is unchanged and that the source contains no clock, hashing, session or `async` use.

Effective photos from Edit mode are mapped back to their `saved` values, so staged positions and directions are ignored. A test uses the real `effectivePhoto`.

---

## 5. Parity matrix

**Coverage: 1,806 unique scenarios**, with an exact set comparison in each.

| Grid | Dimensions |
|---|---|
| Primary, full product (504) | 3 profiles × 7 times × 4 directions × 6 layouts |
| Interactions | 3 profiles × 3 photographers × 3 contexts × 3 CRS × 2 times × 2 directions × 4 layouts |
| No profile (54) | 3 layouts × 3 times × 2 directions × 3 CRS |

- **Times:** none, date, minute, second, fraction, offset, `Z`.
- **Directions:** none, 0, 359.875, invalid.
- **Layouts:** single, two assets, repeated, repeated with one placed, one of two placed, none placed.

**Outcome: readiness and plan agree in all scenarios.** Each also asserts that no rule reports twice, that `generation` and `status` match the plan's result, that excluded rows and placed counts match, and that no message uses a banned word.

### Legitimate differences

These are the only cases where the plan blocks and readiness does not. Each has a dedicated test.

| Error | Why it is plan-only |
|---|---|
| `missing-file`, `file-read-failed` | Need the original file |
| `attachment-naming` | Runs during async planning |
| `projection-failed` | Needs the projection |
| `stale-plan` | Needs a built plan |

Readiness declares these through `levels.pendingChecks`. So `generation: 'possible'` means no synchronous rule blocks, not that a package is certain.

One more case: with an invalid CRS, both sides report `invalid-crs`, and the plan additionally reports `projection-failed` for each placed occurrence. The test requires exactly that and nothing else.

`attachment-naming` is the only plan-only code without a dedicated scenario, because I did not find a practical way to force it from a fixture.

---

## 6. Requirements and evidence

Requirements match the table in the brief, and a test pins them exactly. Gemini capture time stays `recommended` and Gemini direction stays `required` (D1). Neither policy changed.

The evidence table reflects only what real imports showed:

| Profile | Recorded |
|---|---|
| `gemini-legacy2019` | `profile: 'imported'`, `missingCaptureTime: 'unconfirmed'`, `missingDirection: 'untested'`, `renamedGml: 'untested'`, `referenceOnly: ['missingCaptureTime']` |
| `legacy2019`, `asbuilt52` | `profile: 'none'` |

`referenceOnly` keeps the contractor observation separate from app output: missing time worked in that file, which does not confirm it for this exporter. `renamedGml` appears in `recorded` but not in `deviations`, because output is still `photos.gml` until M5.

The schema level always carries `method: 'rules'`, so it cannot be read as a validator result.

---

## 7. Recommendations and thresholds

| Code | Trigger | Boundaries tested |
|---|---|---|
| `capture-time-utc` | Gemini, accepted full time at UTC | Not for Legacy; not for unknown or other offsets; not for unaccepted evidence; not for a minute value, which is omitted |
| `capture-time-implausible` | Accepted time before 2000, or after `now` | `1999-12-31T23:59:59` and `2000-01-01T00:00:00`; exactly `now` and one second after; offset equivalents; unknown offset; no `now` supplied |
| `capture-time-bulk` | Bulk provenance, same value on 2+ assets | One photo; equal EXIF values; individual manual values; different bulk values; one asset counted once; unplaced |
| `direction-all-zero` | 5+ placed, at least half exactly `0°` | 4 and 5 placed; 2, 3 of 5; exactly half; just under half; unknown stays in the denominator; near-north values; unaccepted GML `0°` not counted |
| `direction-bulk` | Bulk provenance, same value on 2+ occurrences | Same as `capture-time-bulk`, counted per occurrence |
| `evidence-pending` | Placed asset still reading EXIF | Counted once per asset; unplaced excluded |

Recommendations never block, and a test confirms they leave accepted values untouched. Unknown timezone is never treated as UTC.

### Wording

| Item | Change |
|---|---|
| F3 | `compatibility-time` now says omitted times get no time in the GML. Readiness note `capture-time-in-source` names the source, and the existing preview shows it |
| F9 | `godtatt retning kreves for denne eksportprofilen`, with no profile named and no value suggested |
| F10 | All 33 codes have Norwegian labels. A test scans the source so a new code without a label fails |
| F14 | Removed `lokal klokketid`. It now says the clock is unchanged and a UTC time stays UTC with no timezone. Nothing is converted |

---

## 8. Compatibility confirmation

| Protection | Result |
|---|---|
| 7 Gemini golden fixtures | Unchanged (SHA-256) and passing |
| M0 and M1 gate tests (6 files) | Unchanged (SHA-256) and passing |
| Legacy and AsBuilt SHA-256 baselines | Passing, assertions unchanged |
| Legacy and AsBuilt synthetic XSD output | Byte-identical to `aab2b84` (5 documents) |
| Matrix serialization | 389 of 389 normalized hashes identical |

UUID generation, namespace, geometry, CRS, Z placeholder, attachment paths, feature order, time serialization and ZIP layout are untouched.

---

## 9. Verification

All runs used the final code and a production build of it. Corpus runs set `PHOTO_UI_URL=http://localhost:3110` and `PHOTO_GML_FIXTURE`, with `--test-concurrency=1` for browser suites.

| Check | Baseline `aab2b84` | Final |
|---|---|---|
| New M2 tests | n/a | **75 of 75 pass** (run before one final tidy; included in the domain run below) |
| Domain selection | 1,364: 1,353 pass, 6 fail, 5 skip | **1,439: 1,429 pass, 6 fail, 4 skip** |
| Photo/GMI browser selection | n/a | **85: 84 pass, 0 fail, 1 skip**, 337 s |
| Gemini browser + `geminiWorkflowUi` | n/a | **107 of 107 pass** |
| `terrainPhotoGml` | 1 fail | 1 fail, same error |
| Production build | n/a | Pass |
| ESLint, 11 changed and new files | n/a | 0 errors, 0 warnings |
| `git diff --check` | n/a | Clean |
| XSD harness | 12 of 12 as expected | 12 of 12 as expected |

The XSD harness ran offline on the 57 cached schema files. Gemini with full times is valid. Gemini with missing, date-only or minute times is invalid at `fotograferingstidspunkt`, as expected. Standards output is valid. The harness validates synthetic output and does not check `levels.schema` directly; the rule table was derived from the same results.

Browser suites were not run at `aab2b84` in this session. The M1 report records them passing on the M1 code, and no browser test failed here.

### Existing versus new failures

**No new failures.**

- The 6 domain failures match the `aab2b84` run by name: three `validationV2WorkspaceInspector`, two `statsUiContract`, one `appInfoUiContract`.
- `terrainPhotoGml` fails with `Failed to fetch dynamically imported module` before any check runs, on the final code and on a clean `aab2b84` export. **It gives no coverage.**

The skip count fell by one only because the final run set `PHOTO_UI_URL`. The remaining domain skips are three GMI corpus tests and the `REF_FILES` comparator. The browser skip is the private G01/G04 suite. `GMI_PHOTO_CORPUS` and `GMI_PHOTO_EKENES` were not set.

---

## 10. Known limitations

- **F17 is not surfaced yet** (see §1). The level block is M6.
- **The dialog still has stale copy (F8).** `Gemini-kompatibilitet er ikke verifisert` contradicts the evidence table, and a browser test pins it. That belongs to M7.
- **`generation: 'possible'` is provisional.** File, naming and projection failures appear only at plan time.
- **Schema rules cover time, direction and context only.** They are not a complete model of the XSD.
- **Copy is not pluralized.** `1 bilder` can appear. M3 should handle this where it renders.
- **`direction-all-zero` counts occurrences but says `bilder`,** following the plan's copy.
- **`associations-omitted` counts photos with links,** while the plan's warning counts unique links. Readiness has only `repeatGroup` counts available.
- **Evidence for missing direction stays `untested` and is listed as a deviation even though that output is blocked.** It describes the gap, not an export that could happen.

### M3 integration

- Read `tasks.captureTime.items` and `tasks.direction.items` rather than reclassifying.
- Act with the existing `adoptSourceEvidence`, using `includeZero` only behind the explicit `0°` action.
- Pass `now` from outside render. Without it the future-date check is skipped rather than reading the clock, which is what the existing dialog relies on.
- Pass canonical or effective photos. Staged edits are ignored either way.
- Use `levels.schema.gaps[].missing` and `insufficientPrecision` for the `«Hvis du fortsetter:»` rows.
- Use `tasks.direction.items[].zeroNeedsReview` for the separate `0°` group. A real EXIF heading stays adoptable beside it.
- Read `PHOTO_EXPORT_PROFILE_METADATA` for tiers.

---

## 11. Browser acceptance

Only the existing export dialog changed. Please check:

| Where | Check |
|---|---|
| Eksportforhåndsvisning | New line, e.g. `148 bilder mangler opptakstid, men tiden finnes i EXIF.` |
| Gemini profile text | `Manglende opptakstid stopper ikke eksporten, men skjemaet krever den; retning kreves.` |
| Diagnostic groups | Labels instead of raw codes, such as `Opptakstid i Gemini-filen` |

Automated browser runs cover the first and third. No screenshots were taken. Pass 1D UI was not changed, and its suites passed.

---

## 12. Decisions beyond the approved plan

| # | Decision | Why |
|---|---|---|
| 1 | `tier` in `PHOTO_EXPORT_PROFILE_METADATA`, not `PHOTO_EXPORT_PROFILES` | Resolves the conflict in the brief in favour of the strict boundary |
| 2 | `context` added to `PHOTO_EXPORT_SCHEMA_REQUIREMENTS` | Otherwise AsBuilt without context would report the schema as met |
| 3 | `referenceOnly` added to the evidence table | The brief asks to keep reference observations distinct |
| 4 | `invalid-xml-text` now carries `assetId` | It is an asset rule, and ownership needs it. Additive |
| 5 | `pendingChecks`, `schema.method`, `schema.assessed` added | Make the limits of each level explicit |
| 6 | No placed photos gives `assessed: false, met: false` | With no features, claiming the schema is met would be false |
| 7 | `capture-time-utc` also matches `+00:00`, and only for full times | Same exported result; a minute value is omitted entirely |
| 8 | Unknown offset is "after `now`" only if later everywhere (UTC+14) | Avoids reading the host timezone and flagging a photo taken moments ago |
| 9 | Bulk rules need the same value on at least 2 items | The brief says "repeated", and the copy says `samme` |
| 10 | Invalid direction counts as a schema gap | It cannot be exported as given. It also blocks |
| 11 | Added note `capture-time-in-source` and one dialog line | F3 asks for available evidence, and the plan has no code for it |
| 12 | Replaced `Opptakstid er valgfri` in the dialog | It contradicts D7 |
| 13 | Unknown profile keeps the old capture-time check | Preserves existing plan behaviour exactly |
| 14 | `classifyDirection` added, internal to readiness | `tasks.direction` needs it |

The planner's `compatibility-time` wording change goes slightly beyond validation extraction, but it is the F14 correction you asked for.

**Readiness:** M2 is ready for Git review. Shared readiness and the plan agree on blocking errors. The only failures are the seven baseline failures above. The browser checks in §11 are still pending.
