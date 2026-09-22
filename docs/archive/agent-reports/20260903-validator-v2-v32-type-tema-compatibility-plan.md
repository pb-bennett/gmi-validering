# Validator 2.0 v3.2 Slice 8 — Type ↔ Tema compatibility plan

**Date:** 2026-09-03  
**Branch:** `feature/validator-v2-v32-baseline`  
**Design baseline:** `0f31647`  
**Scope:** one point-only Type/Tema compatibility rule; design only

## Recommended design

Add one active point-only rule:

- rule ID: `innmaling.point.type-tema.compatible`;
- primary canonical field: `type`;
- input fields: `type` and `tema`;
- evaluator kind: new generic `FIELD_RELATIONSHIP`;
- category: new `FIELD_COMPATIBILITY`;
- relationship kind: `ALLOWED_PAIRS`;
- severity: `ERROR` for a definite incompatible pair;
- source: Innmålingsinstruks Vedlegg A pp. 12–14;
- comparison: exact identity only; no normalization, migration, aliases,
  substitutions, case folding, punctuation rewriting, or trimming.

The relationship rule must be separate from
`innmaling.point.type.valid` and `innmaling.point.tema.required`. The two list
rules continue to own missing/invalid-list failures. Compatibility only decides
whether two already-current codes form an allowed source-backed pair.

The rule should retain `canonicalFieldId: "type"` as its primary UI and finding
concept, while declaring both inputs explicitly (for example,
`inputFieldIds: ["type", "tema"]`). Do not create a synthetic canonical field.
The contract and runner should gain a small generic relationship-rule path,
rather than embedding Type/Tema special cases into the ordinary one-field
allowed-value evaluator.

## Source-backed mapping

The authoritative relationship from Appendix A pp. 12–14 is:

| Tema | Allowed Type values |
|---|---|
| `BAS` | `BBAK`, `BFJE`, `BNOD`, `BRED`, `BSPY`, `BSTR`, `BTRN` |
| `BFD` | `BSPY`, `DAM`, `KAS`, `SBA`, `STM`, `TAN` |
| `DRO` | `DAN`, `DANODE`, `DDAM`, `DPORT`, `DTAN`, `DTERSK` |
| `DIV` | `DB11`, `DB15`, `DB22`, `DB30`, `DB45`, `DB90`, `DBJUST410`, `DBJUST420`, `DBJUST430`, `DEND`, `DFOT`, `DOVG`, `DPPT`, `DREPMUF`, `DST`, `DVPR` |
| `FNT` | `DVF` |
| `FORAKONSTR` | `FORAKLOSS`, `FORAPLATE`, `FORASPUNT` |
| `GRØKONSTR` | `GRØSTENG`, `GRØSTENG01`, `GRØSTENG06`, `GRØSTENG10` |
| `KUM` | `KBRE`, `KDRE`, `KFDL`, `KINS`, `KKAB`, `KLV`, `KMIN`, `KPPK`, `KPRØVFET`, `KPRØVOIL`, `KSDM`, `KSTA`, `KSTF`, `KTRY`, `KUMINLØP`, `KUMPEILGRV`, `KUMUTJEV`, `KUMUTLØP`, `KVIPP`, `XLOK` |
| `PAF`, `POV`, `PSP`, `PST`, `PMK` | `PSNK`, `PTOR` |
| `RSP`, `RVA` | `RBIO`, `RMEK`, `RMKJ` |
| `ROV` | `RSDM` |
| `SLA` | `SLAPUMP` |
| `SAN` | `SMIN` |
| `SLG`, `SLS`, `SLU` | `SSTA` |
| `TNK` | `TTAN` |

This represents **72 unique Type codes and 86 allowed Type/Tema pairs**. The
multi-Tema Types are:

- `BSPY`: `BAS`, `BFD`;
- `PSNK`, `PTOR`: each of `PAF`, `POV`, `PSP`, `PST`, `PMK`;
- `RBIO`, `RMEK`, `RMKJ`: each of `RSP`, `RVA`;
- `SSTA`: `SLG`, `SLS`, `SLU`.

Every listed combination must pass. No reverse one-to-one assumption may be
made, and no additional or legacy combination may be added.

## Exact rule-state contract

The compatibility evaluator should use the outcomes of the existing Type and
point-Tema validity semantics as prerequisite gates. It must not infer validity
from membership in the compatibility table alone.

Precedence is deterministic:

1. optional Type not supplied makes the relationship not applicable;
2. after Type is supplied, any definite prerequisite list failure makes the
   relationship `NOT_EVALUATED` because that list rule owns the failure;
3. if there is no definite prerequisite failure, unresolved or conflicting
   identity evidence makes the relationship `INDETERMINATE`;
4. only two current, valid, resolved codes reach pair comparison.

This precedence means a definite invalid Type or Tema suppresses a compatibility
finding even if the other input is unresolved. There is no valid pair to compare,
and the corresponding list rule already gives the actionable failure.

| Type evidence / Type list state | Tema evidence / point-Tema list state | Compatibility state | Reason code | Contract |
|---|---|---|---|---|
| Field absent, `null`, or empty string `""` / `NOT_EVALUATED` | Any | `NOT_EVALUATED` | `OPTIONAL_TYPE_NOT_SUPPLIED` | Type remains optional-if-present; compatibility must not make it required. |
| Supplied, resolved, but not one of the 72 current Type codes / `FAIL` | Any | `NOT_EVALUATED` | `RELATIONSHIP_PREREQUISITE_FAILED` with blocking rule `innmaling.point.type.valid` | Type list rule owns the invalid-value failure; no mismatch finding. |
| Supplied current Type / `PASS` | Tema absent, `null`, or `""` / `FAIL` | `NOT_EVALUATED` | `RELATIONSHIP_PREREQUISITE_FAILED` with blocking rule `innmaling.point.tema.required` | Required Tema/list rule owns the missing-value failure. |
| Supplied current Type / `PASS` | Tema resolves to an unlisted/non-current value / `FAIL` | `NOT_EVALUATED` | `RELATIONSHIP_PREREQUISITE_FAILED` with blocking rule `innmaling.point.tema.required` | Tema list rule owns the invalid-value failure; no mismatch finding. |
| Definite prerequisite `FAIL` on either input | Other prerequisite is also `FAIL` or is indeterminate | `NOT_EVALUATED` | `RELATIONSHIP_PREREQUISITE_FAILED`; record all known blocking rule IDs in evaluator detail | A definite prerequisite failure takes precedence and avoids a duplicate compatibility finding. |
| Type binding ambiguous | Tema prerequisite `PASS` | `INDETERMINATE` | `BINDING_AMBIGUOUS` | The supplied Type identity cannot be established conservatively. |
| Type binding unresolved | Tema prerequisite `PASS` | `INDETERMINATE` | `UNRESOLVED_SOURCE` | Unsupported/suspected Type headers are not aliases. |
| Type schema unavailable | Tema prerequisite `PASS` | `INDETERMINATE` | `SCHEMA_UNAVAILABLE` | Preserve the existing structural uncertainty. |
| Type prerequisite `PASS` | Tema binding ambiguous | `INDETERMINATE` | `BINDING_AMBIGUOUS` | Do not create another Tema identity path. |
| Type prerequisite `PASS` | Tema unresolved | `INDETERMINATE` | `UNRESOLVED_SOURCE` | Includes an unresolved Tema source; no PTEMA/LTEMA/FCODE fallback. |
| Type prerequisite `PASS` | Direct `Tema` and `S_FCODE` disagree | `INDETERMINATE` | `TEMA_CONFLICT` | Reuse the existing conservative Tema resolver and its conflict evidence. |
| No prerequisite `FAIL`, but both inputs have different indeterminate causes | Indeterminate | `INDETERMINATE` | `RELATIONSHIP_INPUT_INDETERMINATE`, with per-input reason details | Generic deterministic fallback when one reason code cannot accurately describe both inputs. |
| Current valid Type / `PASS` | Current valid resolved Tema / `PASS` | `PASS` | `null` | Pair occurs in the 86-pair source mapping, including every multi-Tema combination. |
| Current valid Type / `PASS` | Current valid resolved Tema / `PASS` | `FAIL` | `TYPE_TEMA_INCOMPATIBLE` | Pair is absent from the mapping. This is the only definite compatibility failure. |

`isMissingValue()` currently defines missing as `undefined`, `null`, or `""`
without trimming. Preserve that contract. A whitespace-only Type such as `" "`
is supplied, fails the strict Type list rule, and therefore makes compatibility
`NOT_EVALUATED`; it is not treated as absent.

Direct Tema and accepted `S_FCODE` fallback are semantically identical after the
existing resolver returns `RESOLVED`. Agreement between both accepted candidates
also resolves normally. Disagreement remains `TEMA_CONFLICT`.

## Evaluator and rule architecture

### Rule contract

Extend the rule contract generically enough for later cross-field rules, but
only implement the `ALLOWED_PAIRS` relationship needed by this slice. A suitable
shape is conceptually:

```js
{
  ruleId: 'innmaling.point.type-tema.compatible',
  canonicalFieldId: 'type',
  inputFieldIds: ['type', 'tema'],
  geometryScopes: ['point'],
  evaluatorKind: 'FIELD_RELATIONSHIP',
  category: 'FIELD_COMPATIBILITY',
  relationship: {
    kind: 'ALLOWED_PAIRS',
    prerequisiteRuleIds: [
      'innmaling.point.type.valid',
      'innmaling.point.tema.required',
    ],
    // One immutable source-backed mapping, represented in either direction.
  },
  severity: 'ERROR',
  source: { document: 'Innmålingsinstruks Vedlegg A', pages: '12–14' },
}
```

The exact property spelling is an implementation detail. Registry validation
must nevertheless enforce that relationship inputs exist, apply to the same
geometry, prerequisite rule IDs are unique and compatible, all pair members are
current values from their owning list rules, the mapping has no duplicate pairs,
and this rule uses no ordinary `allowedValues`/single-field comparison policy.

### Evidence and evaluation

For each point ObjectRef, collect both inputs under the same layer, dataset
revision, geometry, and source index:

- Type through the existing canonical-field binding and object-value extractor;
- Tema only through `resolveGmiTemaIdentity()` and the existing unavailable-Tema
  evidence path.

Refactor the runner only as far as needed to request/cache multiple canonical
inputs for one rule. Do not add a second resolver or read raw Tema attributes in
the compatibility evaluator. Evidence cache keys must remain field + ObjectRef
specific, so the relationship rule can reuse evidence already needed by the list
rules without crossing layer, revision, geometry, or object boundaries.

The relationship evaluator should reuse the same Type and Tema list evaluator
semantics (or a shared prerequisite-validity helper), not inspect aggregate
RuleResults and not depend on registry order. Aggregate results lose per-object
state and would make rule ordering a hidden contract.

The generic evaluator should return the existing four `EvaluationState` values.
Optional evaluation details may carry `blockingRuleIds` for
`RELATIONSHIP_PREREQUISITE_FAILED` and per-input reasons for
`RELATIONSHIP_INPUT_INDETERMINATE`. Only `FAIL` and `INDETERMINATE` create
findings, preserving current runner behavior.

### Findings and counts

A mismatch finding should contain sanitized evidence for both inputs under
named keys, rather than pretending the finding observed only Type. It may expose
the allowed Tema values for the observed Type (or allowed Type values for the
observed Tema) as structured expected relationship data. It must not flatten the
86 pairs into ordinary `allowedValues`.

`evaluatedObjectCount` continues to mean points visited by the rule. For every
rule and geometry:

`evaluatedObjectCount = passCount + failCount + notEvaluatedCount + indeterminateCount`.

Missing optional Type contributes to `notEvaluatedCount`, not `passCount`.
Definite mismatches contribute one `FAIL` finding. Indeterminate relationship
inputs contribute one `INDETERMINATE` finding. A dataset in which all Types are
missing therefore has no applicable compatibility evaluations and must retain
the existing neutral/`NO_APPLICABLE_EVALUATIONS` presentation behavior.

## Reason-code and result semantics

Add these relationship-specific reason codes:

- `TYPE_TEMA_INCOMPATIBLE`: both identities are current and valid, but the pair
  is not source-backed; this is the sole mismatch finding;
- `OPTIONAL_TYPE_NOT_SUPPLIED`: compatibility is not applicable because Type is
  absent/null/empty; no finding;
- `RELATIONSHIP_PREREQUISITE_FAILED`: one or both owning list rules have a
  definite failure; no compatibility finding;
- `RELATIONSHIP_INPUT_INDETERMINATE`: multiple input uncertainties cannot be
  represented truthfully by one existing reason code.

Reuse `BINDING_AMBIGUOUS`, `UNRESOLVED_SOURCE`, `SCHEMA_UNAVAILABLE`, and
`TEMA_CONFLICT` when one clear indeterminate cause exists. `PASS` has no reason
code. Do not use `VALUE_NOT_ALLOWED` for an incompatible pair; that code belongs
to one-field list membership and would imply that either current code is itself
invalid.

The current finding grouping path only extracts an observed value for
`VALUE_NOT_ALLOWED` and Tema conflict. Add explicit grouping for
`TYPE_TEMA_INCOMPATIBLE` using the ordered `(Type, Tema)` pair so distinct
mismatches are not collapsed into one null-valued group. UI text should say that
the supplied Type does not apply to the supplied Tema, not that either value is
unknown or invalid.

## Field Info approach

Keep one canonical Field Info entry for `type` and attach a compatibility section
to it. Do not invent a `typeTemaCompatibility` field-information record: the
relationship is a rule, not a delivered field, and the Field Info registry is
currently keyed by canonical fields.

The Type entry should document:

- optional-if-present Type semantics;
- the existing exact 72-code Type list;
- the exact Tema compatibility set for each Type (including all multi-Tema
  values);
- Appendix A pp. 12–14 provenance for each relationship; and
- both audit source rule IDs: the Type list rule and compatibility rule.

The compatibility rule still needs its own result row because it has independent
counts and findings. Since result presentation currently derives every row name
from the canonical field display name, provide a relationship-specific row label
such as **“Type passer til Tema”** from rule metadata/presentation composition;
otherwise the Type list and compatibility rows would both appear simply as
“Type”. Opening Field Info from either row should land on the same Type concept,
with the relevant rule/relationship subsection selected.

Fildata is currently a single-field distribution and cannot truthfully show
pair acceptance for a relationship rule. Slice 8 should either leave Fildata
disabled for the compatibility row or add a narrowly scoped pair view. It must
not label a Type value globally valid/invalid based on one Tema distribution.
No general cross-field analytics redesign is required for this slice.

## Expected registry and presentation counts

Current Slice 7 + Type baseline:

| Group | Current | Slice 8 change | After Slice 8 |
|---|---:|---:|---:|
| Common active rules | 14 | 0 | 14 |
| Point-only active rules | 4 | +1 compatibility | 5 |
| Line-only active rules | 7 | 0 | 7 |
| **Active registry** | **25** | **+1** | **26** |
| **Point-applicable rules / rows** | **18** | **+1** | **19** |
| **Line-applicable rules / rows** | **21** | **0** | **21** |

The compatibility rule is point-only even in a mixed dataset. It receives no
line ObjectRefs and adds no line presentation row.

## Test plan

### Independent source oracle

Add a test-only compatibility fixture independently transcribed from Appendix A
pp. 12–14. It must not import, derive, invert, or iterate the production mapping
to generate expected pairs. Assert independently that the fixture has 72 unique
Type codes, 86 unique pairs, only current point-Tema values, and exact parity
with the production relationship after canonical pair sorting.

Keep the existing independent 72-Type and 81-point-Tema fixtures as separate
oracles. Production list membership must not be treated as proof that a pair is
allowed.

### Mapping coverage

- Parameterize all 86 source-backed pairs and assert compatibility `PASS`.
- Explicitly assert every multi-Tema Type combination:
  `BSPY` (2), `PSNK`/`PTOR` (5 each), `RBIO`/`RMEK`/`RMKJ` (2 each), and
  `SSTA` (3).
- Assert at least one representative definite mismatch where both values are
  current, for example `Type=DB11`, `Tema=BAS`: Type list `PASS`, Tema list
  `PASS`, compatibility `FAIL/TYPE_TEMA_INCOMPATIBLE`.
- Include a reverse-looking mismatch proving the mapping is not inferred from
  prefixes or descriptions.

### State contract

- Type property absent, `undefined`, `null`, and `""`:
  `NOT_EVALUATED/OPTIONAL_TYPE_NOT_SUPPLIED`; the Type list remains neutral and
  compatibility creates no finding.
- Whitespace-only Type: Type list fails and compatibility is
  `NOT_EVALUATED/RELATIONSHIP_PREREQUISITE_FAILED`.
- Invalid/unlisted Type with valid Tema: Type list fails; compatibility has no
  mismatch finding.
- Valid Type with missing and invalid/unlisted Tema: Tema list owns each failure;
  compatibility is not evaluated.
- Both list prerequisites fail, and one definite failure plus one unresolved
  input: verify prerequisite-failure precedence and no compatibility finding.
- Direct `Tema`: valid compatible and incompatible cases.
- `S_FCODE` fallback with no direct Tema: valid compatible and incompatible
  cases.
- Direct/fallback agreement: normal resolved evaluation.
- Direct/fallback disagreement: `INDETERMINATE/TEMA_CONFLICT`, with no definite
  mismatch.
- Ambiguous Type binding (for example direct/case-collision schema evidence):
  `INDETERMINATE/BINDING_AMBIGUOUS` when Tema is valid.
- Unresolved Type source and schema-unavailable Type: preserve the corresponding
  indeterminate reason.
- Ambiguous/unresolved/schema-unavailable Tema: preserve corresponding
  indeterminate state without bypassing `resolveGmiTemaIdentity()`.
- Multiple simultaneous indeterminate causes: use
  `RELATIONSHIP_INPUT_INDETERMINATE` and retain per-input reason evidence.

### Geometry, ownership, and reconciliation

- Point-only dataset: evaluate every point and reconcile all four states.
- Line-only dataset: compatibility rule has zero evaluated objects and no row in
  the line presentation universe.
- Mixed point/line dataset: only points contribute; line Type/Tema values cannot
  affect point compatibility.
- Two selected layers with identical local source indices: no binding, evidence,
  finding, pair, or ObjectRef crosses layer or dataset revision.
- Stale revision/ObjectRef ownership checks continue to reject reuse.
- Empty point collection and all-missing-Type collection preserve neutral
  zero-applicable presentation.
- Assert registry totals `26/19/21`, exact rule order/inventory, summary
  `totalRules`, geometry presentation counts, scale equations, finding counts,
  affected ObjectRefs, and per-rule reconciliation.
- Assert mismatch grouping uses the exact ordered pair and does not merge
  different pairs.
- Assert Type Field Info compatibility parity/provenance and that no synthetic
  compatibility field entry exists.
- Assert Fildata does not claim single-field acceptance for the relationship row.

Run focused relationship/evaluator, A5 runner, A8 registry/count, and A8.1
results/Field Info tests during implementation, then run the full repository
suite and build once at the requested checkpoint.

## Implementation boundaries

- Implement exactly one new active point-only compatibility rule.
- Do not change the 72 Type values or 81 point-Tema values.
- Do not make Type required.
- Do not add aliases, normalization, migration, substitution, suggestions, or
  legacy acceptance.
- Do not add any Tema resolver or fallback. Direct `Tema`, accepted `S_FCODE`,
  and their existing conflict behavior remain authoritative.
- Do not report a mismatch unless both prerequisite list evaluations pass.
- Do not merge compatibility into either allowed-value rule; users need separate
  ownership, counts, and findings.
- Do not infer relationships from names, prefixes, current data frequency, old
  catalogs, or the production mapping itself.
- Do not design or implement the hydraulic classifier, conditional hydraulic
  fields, topology, polygon logic, or any Slice 9+ rule.
- Preserve selected-layer, dataset-revision, ObjectRef, geometry, immutable
  result, privacy, and no-telemetry invariants.
- Do not modify Testmodus, production configuration, deployment, or unrelated
  Field Info content.

## Unresolved decisions

No product/domain-owner decision remains for Slice 8 under the agreed policy in
the task. The source mapping, current-code closure, optional Type behavior,
conflict handling, mismatch severity, and duplicate-suppression policy are all
sufficiently specified.

The exact JavaScript property names for the generic relationship contract and
whether the compatibility row disables Fildata or receives a narrow pair view
are implementation/UI design choices, not domain-policy blockers. The minimum
safe Slice 8 choice is to disable Fildata for that row while retaining Type Field
Info and the independent compatibility result row.
