# Validator 2.0 v3.2 point code-list review

## Verdict

**CHANGES REQUESTED — not approved for commit.**

The validation behavior for `Kumform`, `Byggemetode`, and `Kjegle` matches the implemented contract, and the shared `fieldData.js` change is appropriately narrow. One commit-blocking presentation/provenance defect remains: the three new registry entries contain mojibaked Norwegian text, and the A8 registry test was changed to tolerate that corruption instead of detecting it.

## Findings ordered by severity

### Medium — New rule metadata is mojibaked and the registry test masks it

`src/lib/validation-v2/registry/rules.js` contains `nÃ¥r`, `vÃ¦re`, and `InnmÃ¥lingsinstruks` in the titles, descriptions, and source document names of all three new rules (around lines 450–482). These strings are carried into ordinary result presentation and audit provenance, so users would see corrupted Norwegian even though evaluation results are correct.

`tests/validationV2GmiA8.test.mjs` compounds the issue around lines 267 and 296 by skipping the full inventory assertion for exactly these three rules and accepting either the correct or corrupted source document spelling. The three new `POINT` expectations also use English titles that do not match production, but the skip prevents that mismatch from failing.

Before commit, encode the three registry entries as proper UTF-8 (`når`, `være`, `Innmålingsinstruks`) and make the registry test require the exact production metadata, including the single correct source document name. No validation semantics need to change.

No high-severity or additional medium/low findings were identified in the requested slice.

## Optional-semantics assessment

The three rules correctly use ordinary `ALLOWED_VALUE` evaluation. For each field:

- absent, null, and exact `""` produce `NOT_EVALUATED` and no finding;
- every exact current code passes;
- whitespace-only, whitespace-padded, case-changed, unknown, legacy-like, and explanatory values fail;
- values are not trimmed, case-folded, punctuation-rewritten, aliased, migrated, or substituted; and
- missing values do not produce required-field findings.

The rules are not represented as `REQUIRED` or `REQUIRED_ALLOWED_VALUE`, and composed Field Info reports `required: false` / `requiredness: NOT_REQUIRED`.

## Source-list/oracle assessment

`tests/fixtures/validationV2GmiV32DomainValues.mjs` contains independently literal arrays and imports nothing from production. Exact production/oracle parity is present:

- `Kumform`: 7 — `AN`, `F`, `FK`, `FR`, `N`, `R`, `X`
- `Byggemetode`: 15 — `B`, `BU`, `E`, `E0`, `E1`, `G`, `K`, `M`, `MU`, `P`, `S`, `SU`, `UK`, `V`, `W`
- `Kjegle`: 5 — `E`, `R`, `S`, `T`, `U`

The dedicated test iterates each oracle array through `runGmiValidationV2`, so every one of the 27 authoritative values is exercised through production validation. It also asserts exact order, set, count, and uniqueness parity.

## Registry/count assessment

The registry has exactly three new ordinary point-only `ALLOWED_VALUE` rules with `EXACT` comparison and no required semantics. Their objects contain no applicability predicate, shape/circularity metadata, prefabrication metadata, polygon/GUID logic, or relationship configuration.

Counts are correct:

- 29 active rules
- 22 point-applicable rules
- 21 line-applicable rules

The registry behavior and counts are acceptable apart from the metadata encoding finding above.

## Field Info assessment

The existing canonical concepts and direct bindings remain unchanged: `manholeShape`/`Kumform`, `constructionMethod`/`Byggemetode`, and `cone`/`Kjegle`. Field Info is point-only, documents optionality for this automated slice, exposes the exact 7/15/5 lists, and does not claim universal semantic-point requiredness or solved shape/prefabrication applicability.

Runtime provenance resolves to Vedlegg A p. 14 for `Kumform` and p. 15 for `Byggemetode` and `Kjegle`, with the appropriate rule ID attached to each field and value list. The registry rule source document text itself is affected by the encoding finding.

## `fieldData.js` / Fildata shared-change assessment

**Approved.** The sole semantic change extends `getRuleAcceptance` from `REQUIRED_ALLOWED_VALUE` to the already-existing ordinary `ALLOWED_VALUE` evaluator and selects the matching evaluator. It does exactly what is needed to show truthful Fildata acceptance for optional code-list rules.

The required path still calls `evaluateRequiredAllowedValue` with the same evidence, allowed values, and comparison policy. `REQUIRED`, `REQUIRED_ALLOWED_VALUE`, `FIELD_RELATIONSHIP`, Type↔Tema compatibility, line geometry selection, unrelated fields, result/current-revision ownership, one-field aggregation, and sanitization/limited evidence display are otherwise unchanged. Relationship rows remain rejected through the existing `fieldDataEnabled === false` gate. Existing Fildata and Type↔Tema targeted tests passed.

## A7 remediation assessment

The A7 remediation is legitimate. Its literal point-rule universe changed from the pre-slice 19 to the approved 22 by adding exactly:

- `innmaling.point.manhole-shape.valid`
- `innmaling.point.construction-method.valid`
- `innmaling.point.cone.valid`

The A7 expectation remains a literal ordered list and is not derived from the production registry. Its assertions still prove one validation run, shared result identity across point/line tabs, geometry-specific result universes and summaries, stable result ownership, and ObjectRef reuse. Targeted A7 result: 8/8 passed.

## Scope/isolation assessment

Line-only datasets do not evaluate the three point rules, and mixed datasets ignore line values for them. The generic evaluator preserves ambiguous binding as `INDETERMINATE`. Existing layer, ObjectRef, dataset-revision, result/count reconciliation, and Type↔Tema relationship paths were not changed. Fildata remains bound to one requested canonical field, geometry, rule, current result, layer, and revision.

No implementation was found for universal requiredness, Tema-based point applicability, circular/non-circular classification, prefabrication classification, polygon ownership, companion GML, GUID joins, `Bredde`/`Lengde`, `Utvendig_høyde`, `Avst_BunnInnvUnderUtv`, hydraulic classification, SDR/Ringstivhet/Trykklasse, topology/stikkledning, Testmodus, or production/deployment configuration.

## Targeted tests run

Command:

```text
node --test tests/validationV2GmiV32PointCodeLists.test.mjs tests/validationV2GmiA7.test.mjs tests/validationV2GmiA81FieldInfo.test.mjs tests/validationV2GmiTypeTemaCompatibility.test.mjs
```

Result: **35/35 passed, 0 failed**.

This covers the dedicated point-code-list tests, A7 presentation/reuse, existing Field Info/Fildata behavior, and Type↔Tema relationship isolation. The full suite and build were not rerun because inspection found no behavioral issue warranting repetition; the identified defect is a directly inspected string/test-expectation problem.

## Existing implementation verification

The implementation report records the completed checkpoint as:

- targeted A7: 8/8 passed
- focused suite: 67/67 passed
- full suite: 285/285 passed
- `npm run build`: passed
- `git diff --check`: passed

Those recorded results are consistent with the inspected implementation and the additional 35/35 targeted run. They do not invalidate the metadata encoding finding because A8 was explicitly changed to accept the corrupted spelling.

## Commit readiness

**Not ready for commit.** Correct the three new registry entries' UTF-8 metadata and restore exact A8 assertions for their titles/source provenance. After that narrow correction, rerun the dedicated point-code-list test and the affected A8 registry test; no broader implementation change is indicated by this review.

## Final closure

### Finding status

**CLOSED.**

The previous Medium finding is fully remediated. The three new rule entries now
use proper UTF-8 Norwegian metadata: `når`, `være`, and
`Innmålingsinstruks`. No mojibaked variant remains in their titles,
descriptions, or source-document names.

### What was verified

- `Kumform`, `Byggemetode`, and `Kjegle` have the exact corrected Norwegian
  production titles and descriptions.
- All three sources require exactly `Innmålingsinstruks Vedlegg A`.
- A8's literal `POINT` inventory contains the exact Norwegian titles.
- All three rules pass through the normal exact metadata assertion loop; the
  former rule-specific skip is gone.
- A8 accepts no alternative corrupted source spelling and derives no expected
  metadata from the production registry.
- The remediation changed metadata and assertions only. Rule IDs, the exact
  7/15/5 lists, point-only `ALLOWED_VALUE` evaluators, `EXACT` comparison,
  optional semantics, and registry counts remain unchanged.
- No Field Info or Fildata production behavior changed during remediation.
- Counts remain 29 active, 22 point-applicable, and 21 line-applicable.

### Targeted closure tests

```text
node --test tests/validationV2GmiV32PointCodeLists.test.mjs tests/validationV2GmiA8.test.mjs
```

Result: **31/31 passed, 0 failed** (6 point-code-list tests and 25 A8 tests).

The implementation remediation also records full-suite **285/285 passed**,
`npm run build` passed, and `git diff --check` passed. The full suite and build
were not rerun during closure because inspection and targeted tests identified
no concrete issue warranting repetition.

### Final verdict and commit readiness

**APPROVED FOR COMMIT.** No findings remain in this targeted review. The point
code-list slice is commit-ready at the reviewed working-tree state.
