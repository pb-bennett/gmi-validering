# Executive summary

On branch `feature/validator-v2-v32-baseline`, the exact complete command

`node --loader ./tests/esmJsLoader.mjs --test tests/validationV2*.test.mjs`

reproduced the prior result: **194 tests, 130 passed, 64 failed**, with no skipped, cancelled, or todo tests. The totals did not change. The experimental-loader warning is informational and did not prevent discovery or execution.

Of the 64 failures, 57 are stale Batch 1/2-era assertions, 5 are legitimate Batch 3 expectations, and 2 expose genuine Batch 1/2 defects. There are no Batch 4, test-infrastructure, or unclassified failures. The genuine defects are narrow: whitespace-only `Merknad` longer than 255 code points is treated as missing/Pass, and composed Field Info incorrectly presents optional `Lengde` as required. The locked point/history/Type-Tema evaluator behavior otherwise appears runtime-complete. Batch 2 can be closed after those two defects are corrected, the stale tests are migrated, and the real F07/F08 coverage gaps listed below are filled; Batch 3/4 implementation is not needed for that closure.

# Classification totals

| Classification | Count |
|---|---:|
| STALE_BATCH_2 | 57 |
| BATCH_3 | 5 |
| BATCH_4 | 0 |
| GENUINE_BATCH_1_2_DEFECT | 2 |
| TEST_INFRASTRUCTURE | 0 |
| UNCLASSIFIED | 0 |

The counts sum to 64.

# Failure migration matrix

| # | Test file | Test name | Failure | Classification | Authority/reason | Exact Terra action |
|---:|---|---|---|---|---|---|
| 1 | `validationV2GmiA5.test.mjs` | Batch 1 registry contains only active independent common and identity policies | Expected 19 rules; actual 36. | STALE_BATCH_2 | The test freezes the Batch 1 milestone after Batch 2 activation. Global rule totals are not policy. | Rename to active Batch 1/2 registry ownership; assert the exact canonical owner IDs expected through Batch 2, unique IDs, valid registry, no Batch 3 line owners, and no Batch 4 hydraulic owners. Remove the literal 19. |
| 2 | `validationV2GmiA6.test.mjs` | zero-applicable rules are not passed, while A5 status precedence and neutral states remain intact | Expected presentation label `Delvis oppfylt`; actual `Sjekk`. | STALE_BATCH_2 | Approved user-facing vocabulary is Pass/Sjekk/Feil. The zero-applicable and precedence concepts remain valid. | Keep the constructed rule-state cases, but assert `Sjekk` for structural/manual-review state, `Pass`/`Feil` for the other branches, and that a zero-applicable rule is not reported as Pass. Update source-string assertions to the new labels only. |
| 3 | `validationV2GmiA7.test.mjs` | active beta registry retains A7 rules and the combined Høydereferanse rule | Expected category `REQUIRED_ALLOWED_VALUE`; actual `VALUE_FORMAT` after the owner became `FIELD_POLICY`. | STALE_BATCH_2 | The canonical Høydereferanse owner remains, but the old evaluator/category contract was superseded by compact field-policy outcomes. | Assert exact owner `innmaling.common.height-reference.valid`, field `heightReference`, both geometries, allowed-value list and `policy: heightReference`; do not assert the retired evaluator/category pair. |
| 4 | `validationV2GmiA7.test.mjs` | combined Høydereferanse semantics keep missing and invalid FAIL reasons distinct | Expected schema absence reason `REQUIRED_FIELD_ABSENT`; actual findings use `REQUIRED_VALUE_MISSING`. | STALE_BATCH_2 | Compact field-policy outcomes consolidate absent-property and missing-value requiredness while preserving Feil ownership. | Assert two Feil outcomes owned by the Høydereferanse rule with the correct point/line ObjectRefs and `REQUIRED_VALUE_MISSING`; retain separate invalid-code assertions as `VALUE_NOT_ALLOWED`. If low-level A4 absence distinction remains important, test it at extraction level, not as a user outcome. |
| 5 | `validationV2GmiA7.test.mjs` | common Høydereferanse and geometry-specific Tema results reconcile by geometry | Expected breakdown objects omit `checkCount`; actual adds `checkCount: 0` to point and line. | STALE_BATCH_2 | CHECK is an explicit evaluation state. Geometry ownership/reconciliation remains required. | Add `checkCount` to expected breakdowns and assert `evaluatedCount = passCount + checkCount + failCount`; retain geometry isolation, finding/ObjectRef reconciliation, and structural state ownership. |
| 6 | `validationV2GmiA7.test.mjs` | one result drives both geometry tabs without rerunning and uses geometry-specific summaries | Expected old 38-row point owner list; actual current 34-row list removes duplicate required/format owners and adds retired visibility, AnleggsID, and attachment owners. | STALE_BATCH_2 | One-run/two-tabs is still mandatory; the literal historic owner list is obsolete. | Retain `runCount === 1`, shared result identity and ObjectRef identity. Replace the old row list with exact active Batch 1/2 owner IDs derived from an independent expected list; verify each point/line view contains precisely owners whose scope includes that geometry and excludes Batch 3/4 owners. |
| 7 | `validationV2GmiA8.test.mjs` | A8 registry includes the Slice 8 Type/Tema compatibility inventory | Expected 45 total; actual 36. | STALE_BATCH_2 | The A8 inventory combines retired duplicate owners with deferred Batch 3 rules. The old 45/38/21 snapshot is explicitly superseded. | Split the test: exact active Batch 1/2 owner inventory now; separate skipped/pending Batch 3 inventory for Material/Nett_type/Dimensjon/line Tykkelse/Rørform/VertikalDimensjon. Assert unique canonical control ownership, not 45/38/21. |
| 8 | `validationV2GmiA8.test.mjs` | measurement fields retain required presence and enforce current v3.2 codes | Expected absent-schema reason `REQUIRED_FIELD_ABSENT`; actual `REQUIRED_VALUE_MISSING`. | STALE_BATCH_2 | Required field-policy owners use compact missing outcomes. | Replace absent-vs-null reason split with one Feil/`REQUIRED_VALUE_MISSING` integration assertion per field and geometry; retain low-level extraction tests for `FIELD_ABSENT` versus `VALUE_MISSING`, and retain invalid-code Feil. |
| 9 | `validationV2GmiA8.test.mjs` | vertical level accepts exactly the v3.2 codes without normalization or geometry leakage | Expected every listed value to Pass; `OVER_GRUNN` actual has zero passes because it is Sjekk. | STALE_BATCH_2 | Only `UNDER_GRUNN` and `PÅ_GRUNN_VANNOVERF` Pass; other valid values Sjekk. | Partition the exact list: assert Pass for the two preferred codes, Sjekk/`UNUSUAL_VALID_VALUE` for every other valid code, Feil for near-misses, and preserve point/line isolation. |
| 10 | `validationV2GmiA8.test.mjs` | measurement numeric code lexical evidence rejects near misses and keeps XY/Z 97 distinct | Expected height-method `97` to fail once; actual fail count 0 because it is Sjekk. | STALE_BATCH_2 | Height `97` is an explicit valid Sjekk exception; XY `97` is also a valid official XY code and Sjekk. | Assert both `97` cases as Sjekk with `UNUSUAL_VALID_VALUE`; retain exact lexical Feil cases (`01`, spaces, sign, decimal). |
| 11 | `validationV2GmiA8.test.mjs` | measurement lists cover every authoritative value in both geometries without cross-binding | Expected every allowed method to Pass; actual first ordinary code (`10`) has zero passes because it is Sjekk. | STALE_BATCH_2 | For both method fields only `96` Passes; other valid codes Sjekk, with height `97` as the extra exception. | Keep exact authoritative list and both geometries, but assert `96` Pass, each other official code Sjekk, height `97` Sjekk, and unlisted values Feil. Preserve geometry non-borrowing. |
| 12 | `validationV2GmiA8.test.mjs` | line Material retains required presence and enforces the current v3.2 list | Expected `innmaling.line.material.required`; actual rule is absent. | BATCH_3 | Material and line Tykkelse policy are intentionally deferred to Batch 3. | Mark this whole test pending Batch 3. When activated, split Material partition behavior from line Tykkelse boundaries and retain point/line ownership checks. Do not add either owner in Batch 2. |
| 13 | `validationV2GmiA8.test.mjs` | production domain rules exactly match the independent v3.2 authoritative lists | Material rule is undefined when reading `allowedValues`; test expected a 45-value Material owner. | BATCH_3 | Material activation is Batch 3; exact point/line Tema inventories already have an independent passing oracle. | Move the Material portion to the Batch 3 test group. Keep Tema list parity in its existing independent test and avoid one mixed test whose first deferred field masks implemented Tema checks. |
| 14 | `validationV2GmiA8.test.mjs` | Tema requiredness, direct preference, S_FCODE fallback, conflicts, and geometry isolation remain unchanged | Expected `REQUIRED_FIELD_ABSENT`; actual `TEMA_MISSING` (later conflict expectation is old INDETERMINATE). | STALE_BATCH_2 | Tema gate now owns missing as Feil/`TEMA_MISSING`, valid disagreement as Sjekk/`TEMA_CONFLICT`, and never chooses a winner. | Assert exact current Tema outcomes for direct only, S_FCODE only, agreeing dual source, valid conflict, invalid-over-conflict, and missing. Retain geometry isolation and schema coexistence as a schema finding. |
| 15 | `validationV2GmiA8.test.mjs` | mixed point/line datasets never borrow Tykkelse values across geometry | Expected retired point owner `innmaling.point.wall-thickness.required`; actual owner absent. | STALE_BATCH_2 | Point Tykkelse is now one contextual `wall-thickness.integer` owner. Line Tykkelse is deferred Batch 3. | Replace the point half with the current owner and assert KUM missing Feil plus exact point ObjectRef. Leave the line half explicitly pending Batch 3. Preserve the no-cross-geometry invariant in both eventual halves. |
| 16 | `validationV2GmiA8.test.mjs` | real GMI exact enum lexemes preserve whitespace failures and exact passes | Expected active `innmaling.line.network-type.valid`; actual owner absent. | BATCH_3 | Nett_type and Rørform are Batch 3. | Split common/point lexical cases into a Batch 1/2 test now. Move Nett_type and Rørform exact/whitespace cases to a pending Batch 3 test, still using real GMI lexical evidence. |
| 17 | `validationV2GmiA8.test.mjs` | real GMI measurement lexemes control numeric-code validation | Expected height `97` Feil; actual fail count 0. | STALE_BATCH_2 | Approved policy makes height `97` Sjekk. Raw lexical evidence remains important. | Change height `97` to Sjekk, retain exact raw lexeme assertions, and continue asserting malformed/space/sign/decimal near-misses as Feil. |
| 18 | `validationV2GmiA8.test.mjs` | v3.2 retires Synbarhet and makes all NOBB fields optional | Expected no visibility rule; actual retired visibility owner is present. | STALE_BATCH_2 | Synbarhet is retained as a Pass-only retired owner; NOBB absence is Pass, not NOT_EVALUATED. | Assert one `visibility.retired` Pass for present and missing values, no visibility findings, and NOBB/NOBB-ramme Pass on absence plus Feil on malformed supplied values. |
| 19 | `validationV2GmiA8.test.mjs` | v3.2 Nett_type accepts exactly all eight authoritative values | Expected active network-type owner; actual owner absent. | BATCH_3 | Nett_type is deferred to Batch 3. | Mark pending Batch 3 unchanged in policy intent; when activated assert Pass for F/H/O/S, Sjekk for O1/O2/S6/S7, and Feil for invalid lexemes. |
| 20 | `validationV2GmiA8.test.mjs` | v3.2 Type uses an independent exact 72-value optional-if-present list | Missing Type expected NOT_EVALUATED count 1; actual 0 because KUM missing Type is Sjekk. | STALE_BATCH_2 | Type missingness is contextual: DIV Feil, mapped Tema Sjekk, unused Tema Pass. | Keep the exact 72-value validity oracle, but replace blanket optionality with the three missingness contexts and independently invalid Type Feil. Do not infer compatibility from list validity. |
| 21 | `validationV2GmiA8.test.mjs` | Type remains point-only, isolated, and ambiguous binding is indeterminate | Reconciliation expected findings = fail + indeterminate; actual has two additional Sjekk findings. | STALE_BATCH_2 | Sjekk outcomes may have findings. Point-only ownership remains valid. | Update reconciliation to include `checkCount`; retain zero line evaluation, exact point ObjectRefs, and low-level ambiguous binding evidence. At integration level assert the current owning Sjekk/NOT_EVALUATED behavior. |
| 22 | `validationV2GmiA8.test.mjs` | every new A8 practical rule implements the required state matrix | Expected installation-year sample to Pass; actual pass count 0 (numeric `2020` lacks exact four-digit lexical form), and the test assumes every field is unconditionally required/Pass when valid. | STALE_BATCH_2 | Batch 1/2 policies have field-specific Pass/Sjekk/Feil and contextual missingness; no universal matrix exists. | Delete only the generic loop concept. Replace it with field-family tables: common policy partitions, point applicability, optional informational fields, Type/Tema, and history/date boundaries. Use string year/date lexemes and explicit Tema prerequisites. |
| 23 | `validationV2GmiA8.test.mjs` | binding uncertainty is indeterminate and unsupported aliases never satisfy A8 fields | Expected active line dimension owner; actual owner absent. | BATCH_3 | Dimensjon is Batch 3. The A1/A4 binding invariants are already independently covered. | Move the Dimensjon/DIM part to pending Batch 3. Keep schema-unavailable and disabled-alias checks for currently active Batch 1/2 owners, asserting their current compact CHECK/NOT_EVALUATED states. |
| 24 | `validationV2GmiA8.test.mjs` | common and geometry-specific rules stay isolated by geometry | Expected line Anleggsår Pass; actual 0 because fixture supplies numeric `2020` rather than exact lexical `"2020"`. | STALE_BATCH_2 | Exact four-digit grammar is locked; the geometry-isolation invariant remains important. | Change fixture years to strings, assert common point/line outcomes independently, retain InnvendigUtvendig isolation, and move the Dimensjon alias assertion to Batch 3. |
| 25 | `validationV2GmiA8.test.mjs` | all-pass, fail, indeterminate, mixed, and empty datasets preserve count equations | Expected findings = fail + indeterminate; actual has two extra Sjekk findings. | STALE_BATCH_2 | CHECK is now an explicit finding-bearing state; old fixtures are not policy-clean. | Build explicit policy-clean point/line attributes. Assert per-rule `evaluated = pass + check + fail`, outcome composition with NOT_EVALUATED, and `findings = check + fail` for current compact outcomes; preserve empty-dataset behavior. |
| 26 | `validationV2GmiA8.test.mjs` | one run drives both geometry tabs, uses dynamic rule count, and preserves identity | Expected summary total 45; actual 36. | STALE_BATCH_2 | One-run/two-tabs remains valid; 45 is obsolete. | Retain run count/result/revision/ObjectRef identity. Replace 45 with equality to the independently expected active owner set and verify each geometry view filters that set by scope. |
| 27 | `validationV2GmiA8.test.mjs` | two layers do not share bindings, values, ObjectRefs, findings, counts, or results | Expected clean layer B to have zero findings; actual 13 because the old sparse fixture triggers current contextual checks/requirements. | STALE_BATCH_2 | Layer isolation remains mandatory; the old “clean” fixture is no longer clean. | Supply a genuinely policy-clean Batch 1/2 point fixture or compare only the deliberately varied owner. Retain distinct result/schema binding/ObjectRef/revision assertions and assert no cross-layer key reuse. |
| 28 | `validationV2GmiA8.test.mjs` | unknown fields remain informational | Expected zero findings; actual 13 from unrelated missing/contextual fields. | STALE_BATCH_2 | Unknown-field diagnostics remain informational, but sparse data can legitimately have validation findings. | Compare a clean baseline run with the same run plus `UNKNOWN_A8_FIELD`: outcomes and findings must be identical, while exactly one source-field diagnostic identifies the unknown key. Do not assert globally zero findings. |
| 29 | `validationV2GmiA8.test.mjs` | representative multi-thousand-object run completes with bounded finding shape | Expected 45 total rules; actual 36. | STALE_BATCH_2 | Bounded shape/performance remains valuable; fixed total and old “clean” data are obsolete. | Assert summary total equals the independent active owner set, 1,500 point/line counts, reconciliation including CHECK, bounded per-rule findings, and use policy-clean attributes. Do not introduce a wall-clock threshold. |
| 30 | `validationV2GmiTypeTemaCompatibility.test.mjs` | direct Tema, S_FCODE fallback, agreement, and conflict reuse the existing resolver | Conflict expected one INDETERMINATE; actual zero because compatibility is NOT_EVALUATED under unresolved Tema. | STALE_BATCH_2 | Tema conflict is owned once as Sjekk; dependent Type compatibility is suppressed. | Keep direct, fallback and agreement Pass/Feil compatibility cases. For conflict assert Tema Sjekk plus compatibility NOT_EVALUATED/`DEPENDENT_TEMA_UNRESOLVED`, with no compatibility finding duplicating the conflict. |
| 31 | `validationV2GmiTypeTemaCompatibility.test.mjs` | runner preserves ambiguous, unresolved, and schema-unavailable input evidence | Expected compatibility INDETERMINATE count 1 for `BINDING_AMBIGUOUS`; actual 0 (suppressed/prerequisite-not-evaluated). | STALE_BATCH_2 | Structural evidence remains at binding/extraction owners; contextual compatibility does not emit a second conclusion when prerequisites fail. | Retain low-level evidence assertions. At runner level assert the owning Type/Tema outcome plus compatibility NOT_EVALUATED with the exact suppression/prerequisite reason and no duplicate finding. |
| 32 | `validationV2GmiTypeTemaCompatibility.test.mjs` | registry and presentation totals are exactly 41 / 34 / 21 | Expected 45/38/21 in assertions despite title; actual first total 36. | STALE_BATCH_2 | Historic fixed totals are superseded. The independent 72-Type/86-pair oracle is still valid. | Remove all three fixed totals; assert one Type validity owner, one compatibility owner, exact point scope, no duplicate owner, Field Info compatibility provenance, and current geometry-view filtering. |
| 33 | `validationV2GmiV32Batch2.test.mjs` | Batch 2 owns exactly four point-only rules and final result counts | Expected 45 total; actual 36. | STALE_BATCH_2 | This is the pre-contextual four-format milestone. Year/date moved to common policy owners, Avst became contextual, and totals changed. | Replace with exact Batch 2 owner inventory and canonical ownership. Assert geometry scopes and policies, then assert empty-run composition semantically; do not retain 45/38/21. |
| 34 | `validationV2GmiV32Batch2.test.mjs` | decimal format accepts only the source-backed plain signed grammar | For `0`, expected Pass tuple `[1,0,0,0]`; actual `[0,0,1,0]` because no Tema resolves. Old test also expects unresolved notation for malformed forms. | STALE_BATCH_2 | Avst is contextual; KUM 0 is Sjekk, unresolved Tema suppresses valid-value context, malformed supplied values Feil. | Split into (A) low-level plain-decimal grammar tests and (B) integration tests with explicit KUM/STR/KMR/conflict Tema. Assert 0 Sjekk, positive KUM Pass, valid unexpected Sjekk, malformed/negative Feil, conflict suppression. |
| 35 | `validationV2GmiV32Batch2.test.mjs` | year format is four digits without invented ranges or padding | Expected old `innmaling.point.installation-year.format`; actual no such rule result. | STALE_BATCH_2 | One common history owner now composes lexical, cause, future and plausibility policy across point/line. | Retain `evaluateYearFormat` as a low-level lexical unit if useful, but integration must target `innmaling.common.installation-year.required` and cover the full F07 year matrix with fixed reference date. |
| 36 | `validationV2GmiV32Batch2.test.mjs` | date format is lexical DD.MM.YYYY only and intentionally not calendar validation | Expected old capture-date format owner; actual absent. The concept says impossible dates Pass. | STALE_BATCH_2 | Locked policy requires real calendar validity, future/date-age/year ordering, and one common owner. | Keep lexical helper tests for exact shape, and add contextual integration against `capture-date.required`: impossible/future/malformed/before-year Feil; exact five years Pass; older Sjekk. Remove the assertion that `31.02.2026` is acceptable validation behavior. |
| 37 | `validationV2GmiV32Batch2.test.mjs` | note length counts Unicode code points, whitespace, and original lexemes | Fildata expected `Gyldig`; actual `Pass`. | STALE_BATCH_2 | The actual failing assertion is only retired presentation vocabulary. Unicode/lexeme coverage remains valuable and later cases should expose the whitespace defect in row 38. | Replace Fildata labels with Pass/Sjekk/Feil and keep exact 255/256 Unicode and raw-lexeme assertions. Ensure the loop reaches whitespace cases after the label migration. |
| 38 | `validationV2GmiV32Batch2.test.mjs` | real-parser note evidence keeps cross-object whitespace outcomes distinct and reconciled | Expected counts `[1 Pass,1 Fail,0,0]`; actual `[2 Pass,0 Fail,0,0]` for 255 versus 256 spaces. | GENUINE_BATCH_1_2_DEFECT | Manual Merknad policy counts Unicode code points including whitespace; 256 supplied spaces must Feil. Runtime `missing()` trims the lexeme before optional-text length evaluation. | Retain this regression. After the runtime fix assert 255-space Pass, 256-space Feil/`TEXT_LENGTH_EXCEEDED`, order independence, two distinct Fildata rows and Pass/Feil labels. |
| 39 | `validationV2GmiV32Batch2.test.mjs` | real-parser mixed ordinary and whitespace note candidates remain ambiguous in either order | Expected INDETERMINATE tuple; actual tuple is all zero because current structural result is CHECK, which the old helper does not count. | STALE_BATCH_2 | Structural uncertainty maps to Sjekk; the ambiguity and order-independence concepts remain valid. | Add CHECK to the helper tuple, assert one Sjekk/`BINDING_AMBIGUOUS`, unresolved Fildata bucket with Sjekk, and both source lexemes preserved in either order. |
| 40 | `validationV2GmiV32Batch2.test.mjs` | Batch 2 preserves duplicate lexical ambiguity, point scope, and completed-result Fildata ownership | Avst valid value expected Pass; actual NOT_EVALUATED because test supplies no Tema. | STALE_BATCH_2 | Avst now needs resolved applicability context; year/date are common geometry rules, not point-only format rules. | Split by owner. For Avst add KUM and assert contextual state; for year/date assert both geometries; for Merknad assert both geometries. Retain duplicate-candidate evidence, immutable completed-result Fildata, and stale-result rejection with Pass/Sjekk/Feil labels. |
| 41 | `validationV2GmiV32Batch2.test.mjs` | Batch 2 never consumes applicability as validation | Expected 45 result rows; actual 36. Later expectations freeze revision `.3` and 88 cells. | STALE_BATCH_2 | Applicability is now deliberately consumed by six contextual fields; it remains metadata, not a separate result-row owner. | Rename to “applicability creates no standalone owner.” Assert no rule ID contains `applicability`, exact current contextual owners consume the table, policy revision `.4`, and exact canonical 128-cell table parity; remove 45 and old 88/71/9/8 totals. |
| 42 | `validationV2GmiV32PointCodeLists.test.mjs` | registry has exactly three optional point code-list rules and expected counts | Expected 45 total; actual 36. | STALE_BATCH_2 | Kumform/Byggemetode/Kjegle remain exact code lists but are no longer globally optional format-only rules. | Remove global counts and `ALLOWED_VALUE` evaluator assertion. Assert exact three canonical owners, exact allowed lists, point scope, FIELD_POLICY, distinct applicability policies, and no duplicate owners. |
| 43 | `validationV2GmiV32PointCodeLists.test.mjs` | Kumform accepts only exact supplied current codes and remains optional | For valid `AN`, expected one Pass; actual zero because Tema is unresolved and contextual judgement is suppressed. | STALE_BATCH_2 | Exact validity is independent, but outcome depends on APPLICABLE/NOT_APPLICABLE/UNKNOWN Tema. | Keep `evaluateAllowedValue` as low-level exact-list coverage. Integration must use KUM (valid Pass/missing Feil), LOK or STR (valid Sjekk/missing Pass), KMR (valid Sjekk/missing Pass), conflict (valid supplied suppressed; invalid supplied Feil). |
| 44 | `validationV2GmiV32PointCodeLists.test.mjs` | Byggemetode accepts only exact supplied current codes and remains optional | For valid `B`, expected one Pass; actual zero due unresolved Tema. | STALE_BATCH_2 | Byggemetode is contextual; LOK is APPLICABLE and `UK` is Sjekk. | Keep low-level exact-list test; integration asserts KUM/LOK valid Pass, UK Sjekk, applicable missing Feil, STR valid Sjekk/missing Pass, UNKNOWN behavior, conflict suppression, invalid Feil. |
| 45 | `validationV2GmiV32PointCodeLists.test.mjs` | Kjegle accepts only exact supplied current codes and remains optional | For valid `E`, expected one Pass; actual zero due unresolved Tema. | STALE_BATCH_2 | Kjegle is contextual; LOK/STR/KRN are NOT_APPLICABLE. | Keep low-level exact-list test; integration asserts KUM valid Pass/missing Feil, LOK/STR/KRN valid Sjekk/missing Pass, KMR UNKNOWN behavior, conflict suppression, invalid Feil. |
| 46 | `validationV2GmiV32PointCodeLists.test.mjs` | ordinary Fildata remains available for each point code-list rule | Expected `Gyldig`; actual `Pass`. | STALE_BATCH_2 | Fildata uses Pass/Sjekk/Feil completed contextual outcomes. | Supply explicit KUM Tema and assert Pass rows; add at least one identical value under a non-applicable Tema to verify one bucket can have mixed Pass/Sjekk breakdown. Replace all old acceptance labels. |
| 47 | `validationV2GmiV32PointNumericLexical.test.mjs` | registry exposes Bredde/Lengde point-only integer contracts and 45/38/21 totals | Expected 45; actual 36. | STALE_BATCH_2 | Both owners are FIELD_POLICY; Bredde contextual and Lengde informational-on-presence. | Remove totals and old evaluator/category assertions. Assert exact canonical owner, point scope, integer grammar policy, Bredde applicability ownership, and Lengde optional/informational semantics. |
| 48 | `validationV2GmiV32PointNumericLexical.test.mjs` | Bredde preserves direct, preferred-direct, unique-case and ambiguous binding semantics | Expected direct `1000` Pass; actual zero Pass because no Tema resolves. | STALE_BATCH_2 | Binding semantics remain valid; contextual Bredde is suppressed without resolved Tema. | Keep binding assertions at A1/A4 level. For runner assertions add `Tema: KUM`; expect valid width Pass, ambiguous supplied binding Sjekk at owning structural control, and exact ObjectRef. |
| 49 | `validationV2GmiV32PointNumericLexical.test.mjs` | Bredde independently enforces the exact source-lexeme integer grammar | Expected `1000` Pass; actual zero Pass due unresolved Tema. | STALE_BATCH_2 | Lexical coverage must not be lost, but contextual integration needs Tema. | Move accepted/rejected lexemes to direct integer-helper unit coverage; add KUM integration for representative valid/decimal/malformed/negative cases. Keep a conflict case proving malformed still Feil while valid is suppressed. |
| 50 | `validationV2GmiV32PointNumericLexical.test.mjs` | Bredde uses the exact no-lexeme runtime fallback | Expected numeric `1000` Pass; actual zero Pass due unresolved Tema. | STALE_BATCH_2 | Same missing prerequisite; safe-integer fallback remains useful. | Test no-lexeme integer conversion directly, then run representative values with KUM. Assert unsafe precision via the low-level helper and contextual outcome ownership without relying on a global count. |
| 51 | `validationV2GmiV32PointNumericLexical.test.mjs` | Lengde preserves direct, preferred-direct, unique-case and ambiguous binding semantics | Expected valid supplied Lengde Pass; actual zero Pass because valid presence is Sjekk. | STALE_BATCH_2 | Any valid supplied Lengde is informational Sjekk regardless of Tema. | Keep binding assertions; change valid direct/case-only outcomes to Sjekk/`UNUSUAL_VALID_VALUE`, ambiguous binding to owning Sjekk, malformed to Feil, and missing to Pass. |
| 52 | `validationV2GmiV32PointNumericLexical.test.mjs` | Lengde is optional for absent schema/property and undefined/null/empty values | Expected NOT_EVALUATED count 1; actual zero because missing Lengde produces Pass. | STALE_BATCH_2 | Optional/irrelevant absence is explicitly Pass in the approved model. | Assert one Pass compact outcome and no finding for each missing representation; preserve extraction-level distinctions separately. |
| 53 | `validationV2GmiV32PointNumericLexical.test.mjs` | Lengde independently enforces the exact source-lexeme integer grammar | Expected valid `1000` Pass; actual zero Pass because it is Sjekk. | STALE_BATCH_2 | Grammar remains integer-only, but valid presence is highlighted. | Keep helper lexical accepted/rejected matrix; integration expects valid/zero Sjekk, negative/malformed Feil, and missing Pass. |
| 54 | `validationV2GmiV32PointNumericLexical.test.mjs` | Lengde uses the exact no-lexeme runtime fallback | Expected numeric `1000` Pass; actual zero Pass because it is Sjekk. | STALE_BATCH_2 | Same informational-presence policy. | Assert conversion in the helper and Sjekk for valid runtime values; assert Feil for unsafe/malformed/negative according to current policy. |
| 55 | `validationV2GmiV32PointNumericLexical.test.mjs` | forbidden width aliases and length near-matches never become canonical bindings | Length near-match expected NOT_EVALUATED 1; actual zero because missing canonical Lengde is Pass. | STALE_BATCH_2 | Alias non-binding remains important; only the compact missing outcome changed. | Retain exact FIELD_ABSENT binding assertions and no alias acceptance. Change runner assertion to canonical Lengde Pass/no finding and Bredde suppression when Tema is unresolved. |
| 56 | `validationV2GmiV32PointNumericLexical.test.mjs` | new rules are point-only in line-only and mixed datasets | Mixed Bredde expected Pass 1; actual 0 because point has no Tema. | STALE_BATCH_2 | Point-only geometry invariant remains valid. | Add KUM to the point object, keep malformed point Lengde Feil, and continue asserting zero line evaluation even when line attributes contain same keys. |
| 57 | `validationV2GmiV32PointNumericLexical.test.mjs` | Lengde is never geometry-derived and malformed supplied point Lengde stays failed | Missing expected NOT_EVALUATED 1; actual zero because missing is Pass. | STALE_BATCH_2 | No geometry derivation remains required; optional absence is Pass. | Assert missing point Lengde Pass irrespective of line coordinates, then separately assert malformed supplied point Lengde Feil and point ObjectRef ownership. |
| 58 | `validationV2GmiV32PointNumericLexical.test.mjs` | findings retain exact rule, field, layer, revision and point ObjectRef ownership | Ownership assertions pass; final expected 45 rows, actual 36. | STALE_BATCH_2 | Architecture is intact; only global count is obsolete. | Delete the final count assertion. Retain every exact rule/field/layer/revision/geometry/sourceIndex assertion and add uniqueness of the two owner outcomes if desired. |
| 59 | `validationV2GmiV32PointNumericLexical.test.mjs` | Bredde Field Info and Fildata expose partial optional format coverage | Expected `required: false`; actual `true`. | STALE_BATCH_2 | Bredde is conditionally required by Tema, so the old globally optional metadata expectation is obsolete. | Assert explicit conditional requiredness/applicability wording rather than `false`; update stale format-only qualifications; use KUM and STR/UNKNOWN objects and assert Fildata Pass/Sjekk/Feil breakdowns. |
| 60 | `validationV2GmiV32PointNumericLexical.test.mjs` | Lengde Field Info and Fildata expose partial optional format coverage | Expected `required: false`; actual `true`. | GENUINE_BATCH_1_2_DEFECT | Manual says missing Lengde Pass and any valid presence Sjekk. Field Info must not describe it as required. | Retain `required === false` and `requiredness === NOT_REQUIRED`; update Fildata labels to Pass/Sjekk/Feil and assert missing Pass, valid Sjekk, malformed Feil. Fix composition metadata, not the evaluator. |
| 61 | `validationV2PointFieldApplicability.test.mjs` | production policy has exactly the independent explicit 88-cell inventory | Expected 88; actual 128. | STALE_BATCH_2 | Tykkelse and Avst were added to the explicit applicability table. Current exact composition is 128 cells: 104 applicable, 12 not applicable, 12 unknown. | Extend the independent oracle with `wallThickness` and `innerBottomToOuterUndersideDistance`; change STR width to NOT_APPLICABLE; assert exact 128 unique keyed cells and full set equality, not merely `>=`. |
| 62 | `validationV2PointFieldApplicability.test.mjs` | every expected explicit lookup returns its independent literal state | Expected STR/Bredde APPLICABLE; actual NOT_APPLICABLE. | STALE_BATCH_2 | Locked policy explicitly says STR Bredde NOT_APPLICABLE. | Change that exact cell, add LOK Bredde APPLICABLE, and add Tykkelse/Avst cells: core 17 APPLICABLE, STR NOT_APPLICABLE, KMR/SUMP UNKNOWN; LOK and KRN fall back UNKNOWN for those two fields. |
| 63 | `validationV2PointFieldApplicability.test.mjs` | policy metadata identifies project/domain authority and separate provenance | Expected revision `2026-09-04.3`; actual `2026-09-09.4`. | STALE_BATCH_2 | The approved Batch 2 table revision changed with added fields and locked LOK/STR decisions. | Replace revision/effective/decision dates with exact current `.4` metadata and retain authority/provenance/immutability assertions. |
| 64 | `validationV2PointFieldApplicability.test.mjs` | metadata-only slice adds no active rule or result row and preserves counts | Expected 45 rules; actual 36. | STALE_BATCH_2 | Applicability still has no standalone result row, but contextual owners now consume it and global counts are obsolete. | Assert no standalone applicability rule, all six expected consumers reference the policy, and each result has at most one compact outcome per object/owner. Remove 45/38/21 and result-row count literals. |

# Fixed-count migration

Every historic rule/view count occurrence was reviewed. None of the 45/38/21 assertions remains meaningful as an acceptance criterion after owner consolidation and Batch 3 deferral.

| File/assertion | Status | Exact replacement |
|---|---|---|
| `validationV2GmiA5.test.mjs`: 19 active rules | Obsolete milestone count | Exact independent Batch 1/2 rule-ID set; unique IDs; no Batch 3/4 IDs. |
| `validationV2GmiA8.test.mjs`: 45 total, 38 point, 21 line, 45 unique; summary 45 in tabs and 3,000-object test | Obsolete | Exact owner set plus `view IDs = expected owners filtered by geometry`; summary total equals that set's size. Keep 3,000-object and one-run invariants. |
| `validationV2GmiTypeTemaCompatibility.test.mjs`: 45/38/21 | Obsolete | Exactly one Type validity owner and one Type/Tema compatibility owner, point-only, with exact 72-value/86-pair oracle parity. |
| `validationV2GmiV32Batch2.test.mjs`: registry/empty/view/result 45/38/21 | Obsolete | Exact Batch 2 canonical ownership; outcome composition and geometry filtering; no duplicate owner and no standalone applicability row. |
| `validationV2GmiV32PointNumericLexical.test.mjs`: registry 45/38/21 and final 45 | Obsolete | Exact width/length owner contracts; keep ObjectRef ownership; remove unrelated global count. |
| `validationV2GmiV32PointCodeLists.test.mjs`: 45/38/21 | Obsolete | Exact three owner IDs/lists/scopes/policies and no duplicate owner. |
| `validationV2PointFieldApplicability.test.mjs`: runtime 45/38/21 | Obsolete | No standalone applicability owner; exact six contextual consumers and one compact outcome per object/owner. |
| `validationV2PointFieldApplicability.test.mjs`: 88 cells and 71/9/8 states | Obsolete old policy inventory, but exact table parity remains meaningful | Independent exact keyed 128-cell oracle: 104 APPLICABLE, 12 NOT_APPLICABLE, 12 UNKNOWN, including the two new fields and corrected STR width. |

The literal `45` in `validationV2GmiA8.test.mjs` for the **Material code-list cardinality** is not a rule-count assertion. It remains a meaningful exact Batch 3 domain oracle and should be retained when Batch 3 activates. Likewise, 41 canonical fields and the 72 Type values/86 Type-Tema pairs are independent exact domain/registry invariants and are still meaningful.

# Format-only migration

| Existing test area | Modern form | Required split |
|---|---|---|
| `validationV2GmiV32PointNumericLexical.test.mjs` Bredde | Both | Keep low-level integer lexeme/no-lexeme coverage. Integration must provide KUM/LOK/STR/KMR/conflict Tema and assert threshold/applicability/suppression. |
| Same file, Lengde | Both | Keep integer grammar helper tests. Integration asserts missing Pass, every valid presence Sjekk, negative/malformed Feil, no geometry derivation. |
| `validationV2GmiV32Batch2.test.mjs` Avst | Both | Keep strict plain decimal helper grammar (`12`, dot/comma decimals, no exponent/incomplete/grouping/spaces). Integration adds Tema and zero/negative/applicability behavior. |
| Historic A8 point Tykkelse checks | Both | Add/retain low-level integer grammar; contextual test covers KUM requiredness, NOT_APPLICABLE/UNKNOWN presence, unresolved suppression, and independent malformed/negative Feil. Do not mix with deferred line Tykkelse. |
| `validationV2GmiV32PointNumericLexical.test.mjs` and current Field Info, Utvendig_høyde | Both | Low-level integer grammar plus contextual optional semantics: missing Pass, valid/zero Sjekk, negative/malformed Feil. |
| `validationV2GmiV32Batch2.test.mjs` year | Both | Low-level exact four-ASCII-digit helper; common-owner integration for cause-dependent missingness, future and plausibility. |
| Same file, date | Both | Low-level exact `DD.MM.YYYY` grammar and calendar parser; common-owner integration for impossible/future/five-year/leap/year-order policy. |
| `validationV2GmiV32PointCodeLists.test.mjs` | Both | Exact allowed-list helper tests plus contextual applicability integration for each field. |

Contextual suppression must never replace direct lexical coverage. In particular, a malformed or negative supplied contextual value must still Feil even when Tema is unresolved.

# Applicability migration

The locked matrix is:

| Field | APPLICABLE | NOT_APPLICABLE | UNKNOWN/fallback |
|---|---|---|---|
| Kumform | Core 17 | LOK, STR, KRN | KMR, SUMP and unclassified Tema |
| Bredde | Core 17 plus LOK | STR, KRN | KMR, SUMP and unclassified Tema |
| point Tykkelse | Core 17 | STR | KMR, SUMP; LOK/KRN and other unlisted combinations fall back UNKNOWN |
| Avst_BunnInnvUnderUtv | Core 17 | STR | KMR, SUMP; LOK/KRN and other unlisted combinations fall back UNKNOWN |
| Byggemetode | Core 17 plus LOK | STR, KRN | KMR, SUMP and unclassified Tema |
| Kjegle | Core 17 | LOK, STR, KRN | KMR, SUMP and unclassified Tema |

For each field: APPLICABLE missing is Feil; APPLICABLE valid is Pass except field-specific Sjekk partitions; NOT_APPLICABLE valid presence is Sjekk and absence Pass; UNKNOWN valid presence is Sjekk and absence Pass. Invalid/malformed/negative supplied values are Feil independently.

The stale assertions are the old 88-cell inventory, STR Bredde APPLICABLE, the assumption LOK's Bredde applicability transfers to Tykkelse/Avst, globally optional code/numeric tests with no Tema, and assertions that absence is NOT_EVALUATED. Unresolved Tema is not an UNKNOWN matrix lookup: the dependent contextual outcome is NOT_EVALUATED/`DEPENDENT_TEMA_UNRESOLVED`; independently invalid supplied values still Feil. Direct probes of all listed F08 values found no evaluator contradiction.

# Type/Tema review

No additional Type/Tema runtime defect remains after the FIELD_POLICY prerequisite correction.

Verified behavior:

- DIV + missing Type: Type Feil; compatibility NOT_EVALUATED due failed prerequisite.
- mapped Tema + missing Type: Type Sjekk; compatibility NOT_EVALUATED.
- valid Tema not using Type + missing: Type Pass; compatibility NOT_EVALUATED.
- compatible valid pair: both Type validity and compatibility Pass.
- incompatible valid pair: Type validity Pass; compatibility Feil.
- invalid Type: Type Feil independently; compatibility NOT_EVALUATED.
- unresolved Tema: valid/missing Type contextual judgement and compatibility are suppressed.
- unresolved Tema + invalid Type: Type still Feil independently; compatibility suppressed.

The independent exact 72-Type/86-pair oracle is green and must remain unchanged. The three failing Type/Tema tests are stale suppression/count assertions, not a new compatibility defect.

# A6/A7/A8 migration plan

## A6

This suite came from the beta UI milestone. Preserve V1 default/isolation, explicit layer selection, stale-result rejection, revision identity, format gating, workspace isolation, geometry-local labels and zero-applicable behavior. Only the old `Oppfylt/Delvis oppfylt/Ikke oppfylt` vocabulary is obsolete; migrate it to Pass/Sjekk/Feil without weakening status precedence.

## A7

This suite came from the compact geometry-tabs milestone. Preserve the combined Høydereferanse owner, geometry reconciliation, one-run/two-tabs, stable finding grouping, signed-zero/conflict evidence, compact rows, accessibility and V1 isolation. Migrate evaluator/category assertions to FIELD_POLICY ownership, consolidate missing reasons at the outcome layer, add `checkCount`, and replace the old point/line owner arrays with exact current Batch 1/2 arrays. Do not discard identity or ObjectRef checks.

## A8

This suite came from required-field/domain expansion before the approved v3.2 contextual policy. Perform these file-local changes:

1. Split active Batch 1/2 assertions from deferred Batch 3 line assertions.
2. Replace all-valid-codes-Pass assumptions with current Pass/Sjekk partitions.
3. Replace Tema missing/conflict and Type blanket-optionality assumptions with the gate/context matrix.
4. Replace separate point Tykkelse required owner with the compact contextual owner; leave line Tykkelse pending Batch 3.
5. Update Synbarhet and NOBB absence to Pass outcomes.
6. Replace the universal state-matrix loop with explicit family tables.
7. Add CHECK to reconciliation equations and make baseline data genuinely policy-clean.
8. Preserve raw lexical evidence, canonical binding, geometry/layer/revision isolation, unknown-field informational behavior, one-run/two-tabs, bounded 3,000-object shape, immutable result identity, and V1 isolation.

No architecture regression was observed in those preserved invariants; failures occur before or because of obsolete policy/count assertions.

# F07 coverage audit

Only executable assertions against the locked owner/state count as coverage. A value merely present in `installation-history.gmi` or named by the manifest scenario catalogue is not counted without an exact runtime assertion.

| Area/case | Covered? | Test file | Test name | Form / missing coverage |
|---|---|---|---|---|
| Anleggsår current year | No | `validationV2GmiV32Batch2Completion.test.mjs` contains the value but does not assert its year outcome | contextual boundary test | Add focused owner assertion: 2026 + NYTT = Pass. |
| Anleggsår current year -5 | No | — | — | Add focused unit/integration: 2021 + NYTT = Pass at reference 2026-09-09. |
| Anleggsår current year -6 | No | — | — | Add: 2020 + NYTT = Sjekk/`YEAR_PLAUSIBILITY`. |
| Anleggsår 1900 | No | — | — | Add non-NYTT 1900 Pass. |
| Anleggsår 1899 | No | Completion fixture uses it but only cause is asserted | NYTT cross-geometry test | Add direct year Sjekk and retain usability in relationship. |
| Anleggsår 0000 | Yes | `validationV2GmiV32Batch2Completion.test.mjs` | Batch 2 contextual point and history policy has deterministic boundary behavior | Focused in-memory; Sjekk asserted. |
| Anleggsår future | No | — | — | Add 2027 Feil/`YEAR_FUTURE`. |
| Anleggsår malformed | No | Historic format test targets retired owner | year format is four digits… | Migrate/add current-owner Feil assertion. |
| NYTT missing year | No | — | — | Add Feil/`REQUIRED_VALUE_MISSING`. |
| non-NYTT missing year | No | — | — | Add Sjekk/`REQUIRED_VALUE_MISSING`. |
| unresolved cause + missing year | No | — | — | Add Sjekk and assert cause owner separately. |
| Datafangstdato recent | Yes | `validationV2GmiV32Batch2Completion.test.mjs` | Batch 2 contextual point and history policy has deterministic boundary behavior | Focused in-memory Pass. |
| exact five years | No | — | — | Add 09.09.2021 at reference 09.09.2026 = Pass. |
| one day older | Yes | `validationV2GmiV32Batch2Completion.test.mjs` | Batch 2 contextual point and history policy has deterministic boundary behavior | 08.09.2021 = Sjekk. |
| future date | No | — | — | Add 10.09.2026 Feil. |
| malformed date | No | Historic test targets retired owner | date format is lexical… | Migrate/add current-owner Feil. |
| impossible date | No | Historic test explicitly expected Pass | date format is lexical… | Replace with `31.02.2026` Feil. |
| leap-day convention | No | — | — | Add reference 29.02.2024 and 28.02.2019 exact-anniversary Pass, plus prior day Sjekk. |
| before usable Anleggsår | No | — | — | Add 31.12.2025 with Anleggsår 2026 = Feil/`DATE_BEFORE_INSTALLATION`. |
| isolated old-date Sjekk | Yes | `validationV2GmiV32Batch2Completion.test.mjs` | Batch 2 contextual point and history policy has deterministic boundary behavior | 0000 is unusable; old date independently Sjekk. |
| Stedfestingsårsak ordinary valid | No | — | — | Add ordinary valid Pass with no shared NYTT year. |
| invalid cause | No | — | — | Add Feil/`VALUE_NOT_ALLOWED`. |
| missing cause | No | — | — | Add Feil/`REQUIRED_VALUE_MISSING`. |
| shared NYTT year | Yes | `validationV2GmiV32Batch2Completion.test.mjs` | NYTT years compare across geometry without traversal dependence | UENDR receives Sjekk. |
| cross-geometry | Yes | same | same | Point UENDR compared with line NYTT. |
| traversal order | Yes | same | same | Earlier point outcome depends on NYTT encountered in the later line collection, proving precollection. |

**F07 real gaps: 19.** Direct diagnostic probes matched all locked expected states, but probes are not regression coverage.

# F08 coverage audit

| Field/case | Covered? | Test file | Test name | Form / missing coverage |
|---|---|---|---|---|
| Bredde 0 | No | — | — | Add KUM 0 Sjekk. |
| Bredde 1 | No | — | — | Add KUM 1 Sjekk. |
| Bredde 19 | Yes | `validationV2GmiV32Batch2Completion.test.mjs` | Batch 2 contextual point and history policy has deterministic boundary behavior | LOK 19 Sjekk. |
| Bredde 20 | Yes | same | same | KUM 20 Pass; STR 20 Sjekk also asserted. |
| Bredde negative | No | Historic lexical test expected negative as format-valid | Bredde independently enforces… | Add contextual negative Feil. |
| Bredde decimal | Yes | `validationV2GmiV32PointNumericLexical.test.mjs` | Bredde format outcome is independent of Tema applicability and resolution | Current owner asserts 1.5 Feil across contexts. |
| Bredde malformed | Yes | same file | findings retain exact rule… | `bad` Feil and ownership assertions execute before obsolete final count. |
| point Tykkelse positive | No | Completion supplies 10 but does not assert it | contextual boundary test | Add KUM positive Pass. |
| point Tykkelse 0 | No | — | — | Add KUM 0 Sjekk. |
| point Tykkelse negative | No | — | — | Add Feil. |
| point Tykkelse decimal | No | — | — | Add 1.5 Feil. |
| point Tykkelse malformed | No | — | — | Add malformed Feil. |
| point Tykkelse contextual missingness | No | A8 targets retired separate required owner | mixed point/line Tykkelse… | Add KUM missing Feil, STR/UNKNOWN missing Pass, conflict suppression. |
| Avst 12 | No | — | — | Add KUM Pass. |
| Avst 12.5 | No | — | — | Add KUM Pass. |
| Avst 12,5 | No | Completion supplies but does not assert | contextual boundary test | Add exact Pass assertion. |
| Avst 0 | No | Historic test stops on stale expectation | decimal format accepts… | Add KUM Sjekk. |
| Avst 0.0 | No | — | — | Add KUM Sjekk. |
| Avst 0,0 | No | — | — | Add KUM Sjekk. |
| Avst negative | No | Historic format-only expectation conflicts with range policy | decimal format accepts… | Add Feil. |
| Avst .5 | No | Historic test expected indeterminate | decimal format accepts… | Add strict-grammar Feil. |
| Avst 1. | No | same | same | Add strict-grammar Feil. |
| Avst 1e2 | No | same | same | Add Feil. |
| Avst 1E2 | No | same | same | Add Feil. |
| Avst spaces/grouping | No | same | same | Add representative leading/trailing space and internal grouping Feil cases. |
| Avst malformed | No | same test does not reach the branch | same | Add malformed Feil. |
| Lengde missing | No | Existing test expects NOT_EVALUATED and fails | Lengde is optional… | Migrate to Pass. |
| Lengde 0 | No | — | — | Add Sjekk/`NUMERIC_ZERO`. |
| Lengde positive | No | Existing test expects Pass and fails | direct/binding semantics | Migrate to Sjekk. |
| Lengde negative | No | — | — | Add Feil. |
| Lengde malformed | Yes | `validationV2GmiV32PointNumericLexical.test.mjs` | Lengde format outcome is independent of Tema applicability and resolution | 1.5 Feil across contexts. |
| Utvendig_høyde missing | No | — | — | Add Pass. |
| Utvendig_høyde 0 | No | — | — | Add Sjekk. |
| Utvendig_høyde positive | No | — | — | Add Sjekk. |
| Utvendig_høyde negative | No | — | — | Add Feil. |
| Utvendig_høyde malformed | No | — | — | Add Feil. |

**F08 real gaps: 32.** Direct diagnostic probes of every listed value matched policy; the gaps are automated regression coverage, not newly observed evaluator failures.

# Genuine defects

## 1. Whitespace-only Merknad bypasses the 255-code-point limit

- Likely runtime location: `src/lib/validation-v2/fieldPolicy.js`, `missing()` and the early optional-policy branch in `evaluateFieldPolicy()`.
- Violated policy: supplied Merknad counts Unicode code points including whitespace; 256 spaces must Feil.
- Smallest recommended fix: for `optionalText`, distinguish truly absent/empty from a supplied raw source lexeme and run the code-point length check before whitespace-trimmed missing handling. Do not change common missing semantics for other fields.
- Required regression: retain 255 spaces Pass, 256 spaces Feil, reversed object order, raw lexemes, distinct Fildata buckets and ObjectRefs.

## 2. Optional Lengde is presented as required in composed Field Info

- Likely runtime location: `src/lib/validation-v2/registry/fieldInformation.js`, `composeFieldInformation()` FIELD_POLICY default-required expression.
- Violated policy: Lengde missing is Pass; the UI must not present global requiredness.
- Smallest recommended fix: encode explicit requiredness metadata/policy rather than treating every non-excluded FIELD_POLICY as required. At minimum make `length` non-required while preserving contextual requiredness for Bredde/Tykkelse/Avst and exact-KUM advisory behavior for Adkomst.
- Required regression: `composeFieldInformation(...length...).required === false`, `requiredness === NOT_REQUIRED`, plus runtime missing Pass, positive Sjekk, malformed Feil.

The same default-required expression should be audited narrowly for `externalHeight` and `nobbVavvsFrameNumber`, which are also optional by policy; current inspection shows `externalHeight` is reported required. This is the same metadata design defect, not an additional failing-test classification. Field-information prose for migrated contextual fields is also still format-only and should be updated during the same test migration.

# Batch 3 deferred failures

Exactly five current failures are Batch 3:

1. `validationV2GmiA8.test.mjs` — line Material retains required presence and enforces the current v3.2 list.
2. `validationV2GmiA8.test.mjs` — production domain rules exactly match the independent v3.2 authoritative lists (Material portion).
3. `validationV2GmiA8.test.mjs` — real GMI exact enum lexemes preserve whitespace failures and exact passes (Nett_type/Rørform portion).
4. `validationV2GmiA8.test.mjs` — v3.2 Nett_type accepts exactly all eight authoritative values.
5. `validationV2GmiA8.test.mjs` — binding uncertainty is indeterminate and unsupported aliases never satisfy A8 fields (Dimensjon portion).

The mixed point/line Tykkelse failure is classified STALE_BATCH_2 because its first/current failure targets the retired point required owner; its line half must remain pending Batch 3. No line Tykkelse integer-versus-decimal decision is made here.

# Batch 4 deferred failures

There are **zero** current failing tests fundamentally about pressure/gravity/suction classification, SDR, Ringstivhet, Trykklasse, gravity Tema inventory, or hydraulic uncertainty. Those scenarios exist in the manifest catalogue but are not active failing assertions in this 194-test suite. No Batch 4 policy is resolved here.

# Terra execution order

1. Fix and retain the focused whitespace-Merknad regression in `validationV2GmiV32Batch2.test.mjs`; do not alter unrelated missing-value semantics.
2. Fix explicit Field Info requiredness for Lengde and audit the same expression for Utvendig_høyde and NOBB-ramme; add focused composed-metadata assertions.
3. Migrate `validationV2PointFieldApplicability.test.mjs` to the exact 128-cell independent oracle, including STR Bredde and Tykkelse/Avst.
4. Migrate `validationV2GmiV32PointCodeLists.test.mjs` to low-level exact lists plus contextual Tema matrices and Pass/Sjekk/Feil Fildata.
5. Split `validationV2GmiV32PointNumericLexical.test.mjs` into lexical helper coverage and contextual Bredde/Lengde integration; preserve binding and ObjectRef assertions.
6. Migrate `validationV2GmiV32Batch2.test.mjs`: replace retired year/date owner IDs, add CHECK-aware helpers, retain raw lexical/Fildata/stale-result checks, and remove historic counts.
7. Add the 19 missing F07 focused cases using a fixed reference date; they need not be added to the manifest.
8. Add the 32 missing F08 focused cases, preferably table-driven helper plus contextual integration tests; do not involve line Tykkelse.
9. Migrate A5/A6/A7 exactly as listed, preserving ownership, V1 isolation, stale-result rejection and one-run/two-tabs.
10. Split A8 into active Batch 1/2 assertions and explicitly pending Batch 3 tests; update CHECK reconciliation, clean fixtures and semantic owner invariants. Do not activate Batch 3 rules.
11. Migrate the three Type/Tema stale suppression/count tests while leaving the independent 72/86 oracle unchanged.
12. Run focused Batch 1/2 fixture/oracle, F07/F08, applicability, Type/Tema and A6/A7/A8 migration groups.
13. Run the complete `node --loader ./tests/esmJsLoader.mjs --test tests/validationV2*.test.mjs` suite once at the checkpoint and reconcile every remaining failure to the pending Batch 3 markers; do not start Batch 3/4 runtime work.

# Completion assessment

The core locked Batch 2 evaluator behavior for Tema resolution, applicability, numeric boundaries, history/date relationships, dataset-level cause checks, hyperlink exceptions and Type/Tema compatibility appears complete. Batch 2 is not yet fully complete because two genuine Batch 1/2 defects remain and the F07/F08 regression inventory is materially incomplete. After the two narrow fixes, exact stale-test migrations, and missing focused coverage are completed, Batch 2 can be considered complete without implementing Batch 3 or Batch 4.

This review changed no runtime code, tests, fixtures, manifest, production configuration or external system. The only repository write is this report.
