# Independent review — Validator 2.0 A8 required-field coverage

- Date: 2026-08-24
- Branch: `feature/validator-v2-a8-required-field-coverage`
- Review type: independent working-tree review
- Scope: review only; no application code, configuration, commit, push, merge, or deployment changes

## Original verdict (superseded by the focused correction re-review below)

**CHANGES REQUIRED — NOT APPROVED FOR COMMIT.**

The 23-rule inventory, requiredness state mapping, geometry isolation, counts, deferred-scope boundary, one-run architecture, dynamic count, build, lint, and regression suites are otherwise in good shape. One major domain-validation defect remains: the new exact-value guarantees are evaluated after the unchanged GMI parser has already discarded lexical information. As a result, prohibited Synbarhet spellings and whitespace-normalized enum values can incorrectly PASS in the actual parser-to-runner path, even though the evaluator-only A8 tests pass.

## Findings

### MAJOR — A8 exact-value and Synbarhet guarantees are not true end to end

The A8 evaluator is strict for the value it receives, but the production GMI parser first performs lossy normalization:

- `gmiParser.js:129` applies `raw.trim()` to every field;
- `gmiParser.js:138-141` converts integer- and decimal-looking strings with `parseInt`/`parseFloat`;
- `objectFieldValue.js:202` explicitly reports `sourceLexeme: 'UNAVAILABLE'`;
- `ruleEvaluation.js:11-21` therefore sees only the normalized value and maps any safe integer to its base-10 string for `INTEGER_CODE_STRING`.

This produces false PASS results in the real parser representation:

| Delivered lexical value | Parser value | A8 result | Approved result |
|---|---:|---|---|
| Synbarhet `01` | `1` | PASS | FAIL — leading-zero guess |
| Synbarhet `1.0` | `1` | PASS | FAIL — decimal/string code not exact |
| Høydereferanse ` TOPP_INNVENDIG ` | `TOPP_INNVENDIG` | PASS | FAIL — no trim |
| Stedfestingsforhold ` I_VANN ` | `I_VANN` | PASS | FAIL — no trim |
| Stedfestingsårsak ` NYTT ` | `NYTT` | PASS | FAIL — no trim |

The independent probe used the production `_parseFieldValues` method and then the public `runGmiValidationV2` path. Observed output was:

```text
{"lexeme":"01","parsed":1,"pass":1,"fail":0}
{"lexeme":"1.0","parsed":1,"pass":1,"fail":0}
{"lexeme":"1.5","parsed":1.5,"pass":0,"fail":1,"reason":"VALUE_NOT_ALLOWED"}
```

The A8 test at `validationV2GmiA8.test.mjs:272-297` injects post-parser values directly into `evaluateRequiredAllowedValue`. It proves the evaluator rejects the strings `"01"`, `"1.0"`, and a whitespace-suffixed Høydereferanse, but it never proves those lexemes survive parsing. Consequently, this test remains green while production wiring violates the behavior it claims to protect.

This is a major issue because it creates source-code false negatives in domain validation and directly contradicts the requested no-trim, no-generic-normalization, leading-zero, and decimal behavior. Before commit, the implementation needs a reviewed lexical-evidence solution or must narrow/defer the affected value checks. The fix should include a real GMI parser-to-runner regression for `01`, `1.0`, surrounding whitespace, valid `0`–`3`, `-0`, non-integer decimals, and the exact nonnumeric enum sets. Merely adding more direct evaluator tests will not close the gap.

### MINOR — plain REQUIRED rules declare `EXACT` instead of the plan's non-applicable comparison metadata

The approved plan says plain `REQUIRED` rules should use `NONE`, while exact enum rules use `EXACT`. The implementation defines only `EXACT` and `INTEGER_CODE_STRING`, assigns `EXACT` to all plain required and Tema-required rules, and structurally requires it in `rules.js`.

This does not currently change results because `validationRunner.js` ignores `valueComparison` on the `REQUIRED` path. It is nevertheless misleading metadata and differs from the approved registry design. Either add a non-applicable/`NONE` policy for required-only rules or explicitly revise the approved contract and report why comparison metadata is mandatory-but-unused there.

### NOTE — the scale test is safe but narrower than its name suggests

The 3,000-object test exercises 1,500 points and 1,500 lines through all 23 rules without a brittle time limit. That is a useful all-pass throughput/regression case, and it confirms empty finding arrays and all count equations.

However:

- `elapsedMilliseconds >= 0` is intentionally non-gating and adds no regression protection;
- `findings.length <= 3000` is trivial in the all-pass fixture after zero findings were already asserted;
- it does not exercise a 3,000-object failing/indeterminate result shape;
- the UI's 15-item boundary is checked by source matching, not component rendering.

No virtualization requirement is justified by current evidence. Rename/clarify the test as an all-pass scale smoke test, or later add a bounded failing-result case if result-size behavior becomes an acceptance concern.

### NOTE — dynamic-count UI coverage is source-based, not rendered behavior

Production code correctly computes:

```text
result?.summary?.totalRules ?? getValidationRules().length
```

and renders `visibleRuleCount`. The before-run and after-run behavior is correct by inspection. The A8 test only regex-matches the source, so it would remain green if the calculation remained in the file but stopped being rendered. This is a test-quality limitation, not a current runtime defect.

## 1. Rule inventory

**PASS.** The immutable active registry contains exactly the approved 23 IDs in approved order:

- 12 common;
- 5 point;
- 6 line;
- 3 retained A7 rules plus 20 additions.

The independent A8 manifest duplicates the approved IDs, titles, canonical fields, scopes, evaluator kinds, categories, source document/pages, severity, provenance, allowed values, and comparison policies rather than deriving expected values from the production registry.

No unexpected or deferred rule is active. No duplicate rule ID or split required/allowed pair exists. Høydereferanse, Stedfestingsforhold, Stedfestingsårsak, Synbarhet, point/line InnvendigUtvendig, Nett_type, and Rørform remain one visible `REQUIRED_ALLOWED_VALUE` practical rule each.

All rules are deeply frozen through the existing registry freeze path. `STANDARD` provenance and `ERROR` severity are consistent throughout.

## 2. Requiredness semantics

**PASS.** `evaluateRequiredField` retains the approved mapping:

- `VALUE_PRESENT` -> PASS;
- `FIELD_ABSENT` -> FAIL / `REQUIRED_FIELD_ABSENT`;
- `VALUE_MISSING` -> FAIL / `REQUIRED_VALUE_MISSING`;
- `BINDING_AMBIGUOUS` -> INDETERMINATE / `BINDING_AMBIGUOUS`;
- `UNRESOLVED_SOURCE` -> INDETERMINATE / `UNRESOLVED_SOURCE`;
- `SCHEMA_UNAVAILABLE` -> INDETERMINATE / `SCHEMA_UNAVAILABLE`.

The unconditional A8 rules do not emit object-level NOT_EVALUATED outcomes. Null, undefined, and empty string remain missing. The unchanged shared presence contract treats `0` and `false` as present.

Tema continues through the specialized A3 path: RESOLVED passes, missing fails with the correct absent/missing distinction, and conflict/unresolved/schema uncertainty remains indeterminate.

## 3. Required plus allowed-value semantics

**PASS at evaluator boundary; FAIL end to end because of the MAJOR finding.**

At the evaluator boundary:

- absent and missing fail with distinct required reasons;
- invalid present values fail `VALUE_NOT_ALLOWED`;
- exact valid values pass;
- ambiguity, unresolved evidence, and unavailable schema remain indeterminate;
- no evaluator trim, case folding, punctuation normalization, transliteration, or `parseFloat` exists;
- every non-Synbarhet combined rule uses `Object.is` exact comparison.

The production parser nevertheless trims/coerces before this boundary, so the overall A8 guarantee is not exact for uploaded GMI input.

## 4. Synbarhet

**FAIL — MAJOR.** The policy is registry-scoped to the single rule `innmaling.common.visibility.valid`, and it cannot affect other active rules through the registry. The direct evaluator correctly accepts exact strings and safe integers 0–3 and rejects `-0`, non-integer decimals, out-of-range integers, booleans, prefixes/suffixes, and direct strings `01`/`1.0`.

However, actual GMI lexemes `01` and `1.0` are both converted to numeric `1` before A4 and therefore PASS. The implementation report's claim that leading-zero guesses and `1.0` fail is not true for the parser-to-runner path.

Høydereferanse and other enum evaluators remain exact for their received values, but parser trimming similarly prevents end-to-end lexical exactness.

## 5. Reviewed code sets

**PASS.** Registry membership and spelling match the plan exactly:

- Høydereferanse: 7 codes;
- Stedfestingsforhold: 10 codes, including Norwegian `GRØ`, `PÅVI`, and `ÅPEN_*` spellings;
- Stedfestingsårsak: 6 codes;
- point and line InnvendigUtvendig: `ID`, `OD`;
- Nett_type: `F`, `H`, `O`, `S`, `S6`;
- Rørform: `A`, `E`, `F`, `R`, `S`, `T`, `X`;
- Synbarhet source set: strings `0`, `1`, `2`, `3`.

The defect is loss of source lexemes before comparison, not registry membership.

## 6. Geometry and shared fields

**PASS.** Production still gathers refs strictly from each rule's declared geometry scopes:

- common rules evaluate point and line refs independently;
- point rules have zero line evaluations;
- line rules have zero point evaluations;
- the opposite geometry does not create NOT_EVALUATED objects;
- field absence in one geometry cannot borrow the field from the other geometry.

`tema`, `insideOutside`, and `nobbVavvsNumber` share canonical identity while bindings and extraction remain geometry-local. A8 tests exercise independent point/line InnvendigUtvendig results and a common field absent only on points. Existing A1-A5 tests retain broader geometry and ownership coverage.

## 7. Deferred/domain scope

**PASS.** The exact active inventory proves that no A9 candidate became active. No runtime diff adds rules or predicates for Målemetode XY/Z, Vertikalnivå, Material, Byggemetode, Kumform, Kjegle, width/length conditions, Utvendig høyde, circular/prefabricated fields, AnleggsID/SID, hyperlinks, Vertikal dimensjon, SDR, Ringstivhet, pressure-specific Høydereferanse, Type, Trykklasse, syntax/format checks, ranges, NOBB length, or dimension/thickness format.

No hydraulic classifier or hydraulic-class inference was introduced. Nett_type remains only an exact required code field. Unknown Tema behavior and all Tema fallback/conflict behavior are unchanged.

## 8. Field resolution and regression boundary

**PASS.** The working-tree diff does not modify:

- `gmiParser.js` (although its pre-existing lossy behavior causes the major integration defect);
- the canonical field registry;
- `gmiLayerSchemaBinding.js`;
- `objectFieldValue.js`;
- `temaIdentity.js`;
- ObjectRef or dataset-revision code.

Direct canonical binding, unique case-only binding, the sole approved Tema fallback, direct Tema preference, disagreement -> CONFLICT, Bredde point-only mapping, Dimensjon line-only mapping, unresolved DIM, disabled aliases, and informational unknown fields remain unchanged.

The diff also does not touch Validator 1.0, maps, Profile Analysis, the data table, telemetry/statistics, production configuration, stores, or the GMI-only V2 gate. SOSI/KOF behavior is unchanged.

## 9. One-run architecture

**PASS.** One selected GMI layer still produces one immutable result. The view controller changes geometry without invoking the runner. DatasetRevision and ObjectRefs remain stable, and two-layer tests retain distinct bindings, results, refs, findings, and counts. No global/all-layer fallback was added.

## 10. Counts

**PASS.** `createRuleResult` increments one geometry bucket from each evaluated ObjectRef and creates findings only for FAIL/INDETERMINATE. A8 independently tests all required equations over all-pass, fail, indeterminate, mixed, and empty datasets:

```text
evaluatedObjectCount = point.evaluatedCount + line.evaluatedCount
passCount = point.passCount + line.passCount
failCount = point.failCount + line.failCount
notEvaluatedCount = point.notEvaluatedCount + line.notEvaluatedCount
indeterminateCount = point.indeterminateCount + line.indeterminateCount
findings.length = failCount + indeterminateCount
point.findingCount + line.findingCount = findings.length
```

Summary point/line counts still come directly from ObjectRef collection lengths and are not summed across rules.

## 11. Dynamic rule count

**PASS.** The runtime three-rule registry invariant is removed. Structural validation covers rule shape, unique IDs, canonical fields, geometry, evaluator/category agreement, severity, provenance, source metadata, allowed-value shape, and comparison policy. The independent A8 test pins the actual reviewed inventory to 23.

Before a run, the UI reads `getValidationRules().length`; after a run, it prefers `result.summary.totalRules`. The actual JSX renders that value. No runtime `3 regler` text remains, and updated A5-A7 tests do not conceal another production hardcoding.

## 12. Test quality

**CHANGES REQUIRED.** Strengths:

- the 23-row inventory and exact code sets are independently encoded;
- every new rule receives pass/absent/null/undefined/empty and, where applicable, invalid/all-allowed-value coverage;
- generic A5 evaluator tests cover all uncertainty states;
- A8 adds representative ambiguity, unresolved, unavailable-schema, disabled-alias, geometry, count, layer, unknown-field, tab, identity, and scale coverage;
- A0-A7 tests retain adapter, Tema, extraction, one-run, immutability, and isolation contracts.

The critical blind spot is that code-value tests bypass the real parser. They would remain green if parser normalization destroys a prohibited lexeme—which is exactly the current behavior. Add parser-to-runner fixtures before approval.

The dynamic-count source regex would also remain green if the variable stopped being rendered, and the scale test's two final “bounds” assertions are weak, but the current production behavior for those areas is correct by inspection.

## 13. Scale test

**PASS WITH NOTE.** It meaningfully exercises 52,500 applicable rule/object evaluations for 3,000 valid objects, has no machine-speed threshold, produces zero findings, and reconciles all counts. It is safe for CI. The existing UI still limits initial visible object positions to 15. No evidence currently requires virtualization.

It is an all-pass scale smoke test, not a finding-volume or rendered-component scale test.

## 14. Checks run

| Check | Result |
|---|---|
| `node --test tests/validationV2GmiA5.test.mjs` | PASS — 21/21 |
| `node --test tests/validationV2GmiA6.test.mjs` | PASS — 8/8 |
| `node --test tests/validationV2GmiA7.test.mjs` | PASS — 8/8 |
| `node --test tests/validationV2GmiA8.test.mjs` | PASS — 10/10 |
| `node --test "tests/*.test.mjs"` | PASS — 235/235 |
| Focused ESLint on all touched source/test files | PASS |
| `npm run build` | PASS; only the existing Browserslist age notice |
| `git diff --check` | PASS |
| Independent GMI parser-to-runner Synbarhet/enum probe | **FAIL acceptance** — demonstrated false PASS cases above |

## 15. Required follow-up before re-review

1. Resolve how Validator 2.0 receives validation-authoritative lexical evidence for code fields, or narrow/defer checks whose approved behavior cannot be recovered after parser coercion.
2. Add real GMI parser-to-runner regressions for Synbarhet `0`–`3`, `01`, `1.0`, `-0`, non-integer decimals, booleans, prefixes/suffixes, and surrounding whitespace.
3. Add at least one real GMI parser-to-runner exact enum regression for each comparison family, particularly whitespace around Høydereferanse and the new A8 exact code fields.
4. Align required-only `valueComparison` metadata with the plan (`NONE`) or record and approve a deliberate contract revision.

Because the major false-PASS issue remains, this review does **not** end with `APPROVE FOR COMMIT`.

---

## Focused correction re-review

- Date: 2026-08-24
- Scope: only the A8 corrections and their regression boundary
- Review constraints: report update only; no application code, commit, push, merge, or deployment changes

### Re-review verdict

**APPROVE FOR COMMIT.**

The previous **MAJOR lexical-evidence finding is CLOSED** and the previous **MINOR NONE-metadata finding is CLOSED**. No new BLOCKER, MAJOR, or MINOR finding was identified in the correction or its regression boundary.

### 1. Lexical-evidence representation

**PASS.** `gmiLexicalEvidence.js` creates one module-scoped `Symbol('gmiSourceLexemes')`; it does not use `Symbol.for` or a string property. The parser attaches the per-attributes lexeme map with `Object.defineProperty` and `enumerable: false`, `writable: false`, and `configurable: false`; the map itself is frozen.

The symbol must be exported between the parser and V2 extractor modules, but it is not re-exported from the parser or Validator 2.0 public index. It therefore remains an implementation token rather than an ordinary GMI source field or globally registered symbol.

Code inspection and the A8 regression establish that the metadata:

- is absent from `Object.keys`, `Object.entries`, ordinary spreads, attribute tables/maps, and `JSON.stringify`;
- cannot collide with an enumerable string field of the same description;
- is ignored by explicit `fieldAnalysis` and by the schema binder's `Object.keys` fallback;
- does not become an unknown-field diagnostic or finding;
- leaves normalized enumerable `attributes` unchanged for legacy consumers;
- does not change Validator 1.0, map, table, Profile Analysis, or statistics behavior.

### 2. Metadata lifecycle and supported boundary

**PASS for the normal supported V2 path.** The production lifecycle was traced as follows:

```text
GMIParser._parseFieldValues
→ feature.attributes carrying the non-enumerable Symbol
→ GMIParser.toObject points/lines arrays
→ FileUpload top-level CRS/warning-summary spreads (nested feature/attributes references retained)
→ store addLayer stores data directly
→ selectedLayer.data
→ createValidationV2Input passes that dataset directly
→ bindGmiLayerSchema inventories ordinary keys only
→ extractGmiObjectFieldValue reads the private Symbol from the original attributes
→ runGmiValidationV2 evaluates sourceLexeme before normalized fallback
```

No production handoff on this path spreads or assigns an individual `attributes` object, calls `structuredClone`, or performs a JSON serialize/deserialize round trip. Layer updates spread layer containers but retain the same `data` reference. Store persistence deliberately excludes both `layers` and `data`.

Boundary: copying an individual attributes object with object spread/`Object.assign`, structured cloning it, or JSON round-tripping it will discard this non-enumerable Symbol. Those are not used by a normal V2 run. Derived map/GeoJSON copies may omit the metadata without affecting V2 because validation continues to use the original selected-layer dataset. Direct/synthetic datasets without the Symbol intentionally take the documented unavailable-lexeme fallback.

### 3. Normalized parser compatibility

**PASS.** The parser still trims for its ordinary exposed value and applies the same null, integer, float, boolean, and string normalization. Numeric-looking fields remain numbers, strings remain the same normalized strings, and point/line feature shapes are unchanged under ordinary enumeration and JSON serialization.

The `_FIELDVALUES` change retains the raw line only long enough to remove one structural separator after the marker. Normalized consumers still receive the same values as before; leading/trailing field whitespace is preserved only in hidden lexical evidence. Existing parser/telemetry regression coverage and the full suite pass. Validator 1.0 continues to consume the unchanged enumerable normalized attributes.

### 4. Source-lexeme semantics and fallback

**PASS.** `sourceLexeme` is captured directly from the semicolon-delimited delivered field segment before `trim`, `parseInt`, `parseFloat`, or boolean normalization. It is not reconstructed from `sourceValue`.

When metadata is absent, extraction reports `sourceLexeme: 'UNAVAILABLE'`. Direct evaluator coverage confirms that:

- `EXACT` falls back to strict `Object.is` comparison against `sourceValue`;
- `INTEGER_CODE_STRING` accepts exact strings or safe non-negative-zero integers whose canonical string is allowed;
- `-0`, unsafe/non-integer numbers, booleans, altered strings, and out-of-range codes fail;
- when a real parser lexeme exists, it takes precedence over the normalized value, so `01`/`1.0` cannot be rescued by normalized numeric `1`.

### 5. Synbarhet end to end

**PASS.** The A8 fixture builds an actual GMI document with `_FIELDNAMES` and `_FIELDVALUES`, constructs the production `GMIParser`, calls `toObject`, and sends the parsed dataset through public `runGmiValidationV2`. It does not attach lexical metadata manually.

Observed coverage:

- PASS: `0`, `1`, `2`, `3`;
- FAIL / `VALUE_NOT_ALLOWED`: `01`, `1.0`, `-0`, `1.5`, `4`, leading/trailing whitespace, `x1`, and `1x`;
- parser errors remain empty for the rejected lexical forms;
- ordinary parsed `Synbarhet` remains numeric for existing consumers.

These parser-to-runner assertions would fail on the previously reviewed implementation: `01`, `1.0`, and padded exact values were normalized before evaluation and incorrectly passed.

### 6. Exact enums end to end

**PASS.** The real parser-to-runner test confirms exact legitimate values pass for:

- Høydereferanse;
- Stedfestingsforhold;
- Stedfestingsårsak;
- point and line InnvendigUtvendig;
- Nett_type;
- Rørform.

Leading/trailing whitespace on representative common, point, and line enum values produces FAIL / `VALUE_NOT_ALLOWED`, not a parser failure. This closes the original exact-enum integration gap and covers more than the requested minimum geometry-specific family.

### 7. NONE metadata correction

**PASS — previous MINOR CLOSED.** All plain `REQUIRED` rules, including both Tema-required rules, declare `ValueComparisonPolicy.NONE`. Exact enum rules declare `EXACT`, and only Synbarhet declares `INTEGER_CODE_STRING`.

Registry structural validation enforces:

- `REQUIRED` → `NONE` with an empty allowed-value list;
- `ALLOWED_VALUE` → `EXACT` with a non-empty allowed-value list;
- `REQUIRED_ALLOWED_VALUE` → `EXACT` or `INTEGER_CODE_STRING` with a non-empty list;
- `INTEGER_CODE_STRING` → only `innmaling.common.visibility.valid`.

The runner dispatches required-only rules without calling an allowed-value evaluator. A combined rule using `NONE` is rejected during registry validation, so NONE cannot enter the production combined evaluator and create an accidental pass.

### 8. Privacy and unknown-field boundary

**PASS.** The correction adds no network, upload, statistics, or tracking call. Upload telemetry remains a fixed thirteen-key categorical payload derived from format/count/coordinate/warning classifications; legacy tracking remains coordinate-only. Neither path enumerates or transmits source attributes or lexemes.

The raw lexeme map remains client-local and non-serializable through ordinary JSON. Unknown-field inventory remains based only on delivered enumerable field names. V2 finding projection deliberately excludes `sourceLexeme`, and tables/maps use ordinary key/entry enumeration or JSON, so hidden metadata is not user-visible.

### 9. Regression scope

**PASS.** The correction does not activate deferred A9 rules, modify canonical mappings, alter Tema fallback/conflict behavior, change geometry applicability, change the one-run/two-tab architecture, alter the V2 GMI-only gate, or change SOSI/KOF parsing. It does not change Validator 1.0 rules, maps, data tables, statistics, or Profile Analysis. The only parser-visible addition is hidden evidence; normalized parser output remains compatible.

### 10. Test quality

**PASS for the correction.** The new tests protect the actual integration seam rather than only helper behavior. They exercise production parsing and the public runner, inspect normalized and lexical evidence together, verify source precedence and privacy boundaries, and retain direct evaluator tests for the intentional metadata-unavailable fallback.

The earlier non-blocking notes about source-based UI count coverage and the all-pass nature of the scale smoke test remain historical notes; the correction does not worsen either boundary, so they are not reopened as new findings.

### 11. Re-review checks

| Check | Result |
|---|---|
| `node --test tests/validationV2GmiA8.test.mjs tests/richerUsageTelemetryParserIntegration.test.mjs` | PASS — 22/22 |
| A0–A8 Validator tests | PASS — 125/125 |
| `node --test "tests/*.test.mjs"` | PASS — 239/239 |
| Focused ESLint on all touched source/test files, including the new lexical module and A8 test | PASS |
| `npm run build` | PASS; only the existing Browserslist age notice |
| `git diff --check` before report update | PASS |

### 12. Finding status

- MAJOR lexical-evidence finding: **CLOSED**.
- MINOR NONE-metadata finding: **CLOSED**.
- New findings: **none**.
- Final verdict: **APPROVE FOR COMMIT**.
