# Validator 2.0 A8 required-field coverage implementation

- Date: 2026-08-24
- Branch: `feature/validator-v2-a8-required-field-coverage`
- Scope: A8 implementation plus the narrowly scoped parser lexical-evidence correction; no commit, push, merge, deploy, or Validator 1.0 changes

## Result

The active immutable Validator 2.0 registry now contains exactly 23 practical rules:

- 12 common rules
- 5 point rules
- 6 line rules

### Common rules

1. `innmaling.common.height-reference.valid` — Høydereferanse er gyldig (`heightReference`)
2. `innmaling.common.installation-year.required` — Anleggsår er oppgitt (`installationYear`)
3. `innmaling.common.capture-date.required` — Datafangstdato er oppgitt (`captureDate`)
4. `innmaling.common.surveyed-by.required` — Innmålt av er oppgitt (`surveyedBy`)
5. `innmaling.common.case-number.required` — Saksnummer er oppgitt (`caseNumber`)
6. `innmaling.common.horizontal-accuracy.required` — Nøyaktighet XY er oppgitt (`horizontalAccuracy`)
7. `innmaling.common.vertical-accuracy.required` — Nøyaktighet høyde Z er oppgitt (`verticalAccuracy`)
8. `innmaling.common.max-horizontal-deviation.required` — Maksavvik horisontalt er oppgitt (`maxHorizontalDeviation`)
9. `innmaling.common.max-vertical-deviation.required` — Maksavvik vertikalt er oppgitt (`maxVerticalDeviation`)
10. `innmaling.common.positioning-condition.valid` — Stedfestingsforhold er gyldig (`positioningCondition`)
11. `innmaling.common.positioning-cause.valid` — Stedfestingsårsak er gyldig (`positioningCause`)
12. `innmaling.common.visibility.valid` — Synbarhet er gyldig (`visibility`)

### Point rules

1. `innmaling.point.tema.required` — Punktobjekt har Tema (`tema`)
2. `innmaling.point.inside-outside.valid` — Punktets innvendig/utvendig-kode er gyldig (`insideOutside`)
3. `innmaling.point.wall-thickness.required` — Punktets tykkelse er oppgitt (`wallThickness`)
4. `innmaling.point.nobb-vavvs-number.required` — Punktets NOBB/VAVVS-nummer er oppgitt (`nobbVavvsNumber`)
5. `innmaling.point.nobb-vavvs-frame-number.required` — Rammens NOBB/VAVVS-nummer er oppgitt (`nobbVavvsFrameNumber`)

### Line rules

1. `innmaling.line.tema.required` — Ledning har Tema (`tema`)
2. `innmaling.line.dimension.required` — Ledningens dimensjon er oppgitt (`dimension`)
3. `innmaling.line.network-type.valid` — Nett-type er gyldig (`networkType`)
4. `innmaling.line.inside-outside.valid` — Ledningens innvendig/utvendig-kode er gyldig (`insideOutside`)
5. `innmaling.line.pipe-shape.valid` — Rørform er gyldig (`pipeShape`)
6. `innmaling.line.nobb-vavvs-number.required` — Ledningens NOBB/VAVVS-nummer er oppgitt (`nobbVavvsNumber`)

Every rule retains `STANDARD` provenance, `ERROR` severity, and the document/page references from the approved A8 matrix. Combined code checks remain one `REQUIRED_ALLOWED_VALUE` practical rule. Plain presence checks use `REQUIRED`.

## Implementation

Changed files:

- `src/lib/validation-v2/contracts.js`
  - Added the explicit `ValueComparisonPolicy` contract with `NONE`, `EXACT`, and `INTEGER_CODE_STRING`.
  - Added the policy to the rule definition contract.
- `src/lib/validation-v2/index.js`
  - Exported `ValueComparisonPolicy`.
- `src/lib/validation-v2/registry/rules.js`
  - Added the 20 A8 rules and exact approved code sets.
  - Added comparison metadata to all 23 rules: `NONE` for required-only rules, `EXACT` for exact combined rules, and `INTEGER_CODE_STRING` only for Synbarhet.
  - Replaced the hardcoded three-rule check with structural validation.
  - Structural guards require exact comparison for plain/standalone exact rules and permit integer-code comparison only for the approved Synbarhet rule.
- `src/lib/validation-v2/ruleEvaluation.js`
  - Added field-declared comparison handling inside the combined required/value evaluator, with source lexeme precedence when available.
- `src/lib/parsing/gmiLexicalEvidence.js`
  - Added the private symbol used to attach parser-owned source lexemes without creating a normal attribute.
- `src/lib/parsing/gmiParser.js`
  - Preserves pre-trim/pre-coercion `_FIELDVALUES` lexemes in non-enumerable symbol metadata while keeping existing normalized attributes unchanged.
- `src/lib/validation-v2/objectFieldValue.js`
  - Carries parser-provided `sourceLexeme` alongside normalized `sourceValue`; synthetic evidence remains `UNAVAILABLE`.
- `src/lib/validation-v2/validationRunner.js`
  - Passes each rule's declared comparison policy to the evaluator.
- `src/components/validation-v2/ValidationV2Workspace.js`
  - Derives the header rule count from `result.summary.totalRules` after a run and the active registry before a run.
- `tests/validationV2GmiA5.test.mjs`
  - Generalized old three-rule assertions while retaining A5 behavior checks.
- `tests/validationV2GmiA6.test.mjs`
  - Generalized the stale hardcoded UI header assertion.
- `tests/validationV2GmiA7.test.mjs`
  - Updated intentional A7 inventory/view assertions for the reviewed A8 registry.
- `tests/validationV2GmiA8.test.mjs`
  - Added the table-driven A8 inventory, state, value, uncertainty, geometry, count, UI, isolation, unknown-field, parser-to-runner lexical, and scale coverage.
- `docs/agent-reports/20260824-validator-v2-a8-required-field-coverage-implementation.md`
  - This implementation report.

The approved planning report remains present at `docs/agent-reports/20260824-validator-v2-a8-required-field-coverage-plan.md`.

## Lexical Evidence And Synbarhet

### Root cause

The GMI parser intentionally normalizes field values for existing application consumers: it trims text, converts integer-looking text to numbers, and converts decimal-looking text to numbers. That made evaluator-only strictness insufficient for uploaded GMI data because prohibited source spellings such as `01`, `1.0`, and surrounding whitespace were already lost.

### Representation

The parser now stores a frozen map of original `_FIELDVALUES` segments on each parsed `attributes` object under a private, non-enumerable `Symbol`. The parser removes only the structural separator immediately following `_FIELDVALUES`; all remaining field whitespace is retained as source evidence. The metadata is not an ordinary property, is absent from `Object.keys`, `JSON.stringify`, `fieldAnalysis`, schema binding, unknown-field diagnostics, and telemetry payload serialization. The existing normalized `attributes` values remain unchanged.

`objectFieldValue.js` reads this metadata only for the selected canonical source key and returns both `sourceValue` and `sourceLexeme`. Parsed values have authoritative lexemes; synthetic/direct evidence without metadata continues to report `sourceLexeme: 'UNAVAILABLE'` and uses the existing evaluator fallback.

### Comparison behavior

`Synbarhet` declares `INTEGER_CODE_STRING` and allowed values `"0"`, `"1"`, `"2"`, and `"3"`.

- Exact strings pass.
- With source lexeme evidence, only exact lexical strings `"0"` through `"3"` pass. `"01"`, `"1.0"`, `"-0"`, whitespace-padded values, decimals, out-of-range values, booleans, prefixes, and suffixes fail with `VALUE_NOT_ALLOWED`.
- Without source lexeme evidence, safe integer numbers `0` through `3` may map to their canonical base-10 source strings for synthetic/internal evidence only.
- All other A8 code rules retain exact source-lexeme comparison when parsed evidence exists and exact runtime `Object.is` comparison otherwise. There is no trim, case folding, punctuation normalization, transliteration, `parseFloat`, stringify equivalence, or generic numeric coercion.

Plain required rules and Tema-required rules now declare the non-applicable `NONE` comparison policy. Exact combined enum rules declare `EXACT`.

## Geometry and counts

The existing one-run architecture is unchanged:

- One selected GMI layer produces one immutable result.
- Common rules evaluate point and line ObjectRefs independently.
- Point rules have zero line evaluations.
- Line rules have zero point evaluations.
  - Tabs remain filtered views of the same result and never invoke the runner.
- Shared canonical fields resolve independently in each geometry schema.
- No cross-layer bindings, values, ObjectRefs, findings, counts, or result reuse occurs.
- Opposite-geometry applicability remains zero evaluations, not object-level `NOT_EVALUATED` results.

The A8 tests enforce, for every rule result:

```text
evaluatedObjectCount = point.evaluatedCount + line.evaluatedCount
passCount = point.passCount + line.passCount
failCount = point.failCount + line.failCount
notEvaluatedCount = point.notEvaluatedCount + line.notEvaluatedCount
indeterminateCount = point.indeterminateCount + line.indeterminateCount
findings.length = failCount + indeterminateCount
point.findingCount + line.findingCount = findings.length
```

`evaluatedPointCount` and `evaluatedLineCount` remain object counts.

## Checks

Passed:

- `node --test tests/validationV2GmiA5.test.mjs`
- `node --test tests/validationV2GmiA7.test.mjs`
- `node --test tests/validationV2GmiA8.test.mjs`
- `node --test tests/validationV2GmiA6.test.mjs`
- `node --test "tests/*.test.mjs"` — 239 tests passed
- Focused ESLint on all touched source and test files
- `npm run build`
- `git diff --check`

The scale regression runs 1,500 points and 1,500 lines through all 23 rules. It completed successfully in approximately 0.7 seconds in this environment, produced 23 rule results, 3,000 evaluated objects, and zero findings for valid synthetic data. Finding arrays remain empty for the all-pass case, and the UI retains the existing collapsed grouping/15-object initial display boundary. No quadratic result-shape growth was observed.

## Deferred scope confirmation

No deferred or prohibited A9 behavior was activated. In particular, the change does not implement measurement-method rules, Vertikalnivå, Material, construction/structure conditionals, polygon-dependent dimensions, external height, AnleggsID/SID alternatives, attachments, vertical dimension, SDR, Ringstivhet, pressure-specific Høydereferanse, Type, Trykklasse, date/year format checks, range limits, NOBB digit-length checks, or dimension/thickness format checks.

The canonical field registry, schema binder, Tema resolver, Validator 1.0, GMI gate, SOSI/KOF behavior, map, data table, and production configuration were not changed. The extractor was changed only to consume the private parser evidence; no canonical binding semantics changed.

## Sol Defect Correction

The parser-to-runner A8 regressions now use the production `GMIParser` and public `runGmiValidationV2` path. They verify:

- exact Synbarhet source strings `0`, `1`, `2`, and `3` pass while normalized runtime values remain numbers;
- `01`, `1.0`, `-0`, `1.5`, `4`, whitespace-padded values, and prefix/suffix variants fail with `VALUE_NOT_ALLOWED` without parser errors;
- exact Høydereferanse, Stedfestingsforhold, Stedfestingsårsak, point/line InnvendigUtvendig, Nett_type, and Rørform values pass;
- surrounding whitespace on representative common, point, and line enum values fails with `VALUE_NOT_ALLOWED`;
- raw lexical metadata is not visible to ordinary attributes, schema binding, unknown-field diagnostics, JSON serialization, or telemetry-visible data;
- `sourceValue` remains the normalized parser value while `sourceLexeme` retains the original delivered field segment.

## A9 handoff

A9 should retain the plan's typed-values and conditional-applicability order: complete and review Målemetode/Vertikalnivå/Material code policies, add approved format/range stages, establish explainable Tema-first classification, then address deferred hydraulic and conditional construction rules. Scale compaction or virtualization should be considered only if later evidence shows the existing grouped finding presentation is insufficient.
