# Validator 2.0 v3.2 Slice 9 — applicability/classification foundation

**Date:** 2026-09-04

**Branch:** `feature/validator-v2-v32-baseline`

**Design baseline:** `186dc5e`

**Scope:** design and source review only; no classifier, conditional field rule, test, registry, UI, production configuration, commit, push, or deployment change

## 1. Source investigation result

The provisional zero-mapping conclusion is **confirmed**.

The reviewed v3.2 sources establish the conditional field concepts:

- Vedlegg A p. 5 says `SDR` is required for pressure lines, `Ringstivhet` is required for plastic gravity/self-flow lines, and `Trykklasse` is optional/desired for pressure lines.
- Vedlegg A pp. 21–22 repeats that `SDR` is obligatory for pressure lines and says `Ringstivhet` is obligatory for gravity/self-flow lines.
- Main instruction p. 18 distinguishes pressure lines from gravity/self-flow lines for height measurement and measurement at manholes.
- Vedlegg A pp. 16–19 lists and describes 108 current line Tema values.

None of those locations, or the rest of the reviewed v3.2 rebaseline evidence, assigns an individual line Tema value to the pressure or gravity/self-flow regime. The Tema descriptions name objects such as `pumpeledning`, `sugeledning`, `vannledning`, `kanal`, `renne`, and `varerør`, but the source does not state that those names are a Tema-to-regime mapping. Converting them into pressure or gravity classes would require domain inference expressly excluded from this slice.

Consequently, v3.2 alone supports no executable hydraulic classification. This is consistent with the rebaseline report's finding that no mapping in the PDFs is explicit enough to implement without domain review.

The following are not authority for filling the gap:

- code prefixes or suggestive Tema descriptions;
- Material or Nett_type;
- SDR, Ringstivhet, Trykklasse, or any target field's presence/value;
- current dataset frequency or observed production data;
- the legacy validator's default-to-gravity, substring, alias, normalization, or target-field-presence heuristics.

## 2. Auditable v3.2 hydraulic Tema mapping

### Classification summary

| Hydraulic domain outcome | Current v3.2 line Tema count | Tema values | Source conclusion |
|---|---:|---|---|
| Source-backed pressure | **0** | None | v3.2 defines pressure-conditioned fields but supplies no Tema→pressure mapping. |
| Source-backed gravity/self-flow | **0** | None | v3.2 defines gravity/self-flow-conditioned fields but supplies no Tema→gravity mapping. |
| Source-backed outside both target domains | **0** | None | Some descriptions look unrelated to hydraulics, but v3.2 does not provide a classification relation suitable for this validator. Names alone are not used. |
| Hydraulic regime `UNKNOWN` | **108** | All current line Tema below | Each value is current and source-described, but its hydraulic regime is not established by reviewed authority. |
| Hydraulic domain conflict | **0** | None | No source location assigns contradictory regimes to a Tema because no source location supplies such assignments. Tema identity conflict remains a separate runtime evidence state. |

### Complete 108-value UNKNOWN table

This table is the auditable current-v3.2 mapping. Page grouping follows the physical pages in Vedlegg A. Every listed value has classification state `UNKNOWN`, reason `CLASSIFICATION_NOT_ESTABLISHED`, and `resolvedDomain: null`.

| Vedlegg A page | Count | Current line Tema values | Hydraulic classification |
|---:|---:|---|---|
| 16 | 20 | `AF`, `AFBO`, `AFD`, `AFK`, `AFLU`, `AFO`, `AFP`, `AFS`, `AFT`, `AFVAR`, `AFX`, `DR`, `I2`, `I2D`, `I2I`, `I2O`, `I2P`, `I2S`, `I3`, `LEBEKXX500` | All `UNKNOWN` |
| 17 | 37 | `LEBEKXX510`, `LEBEKXX511`, `LEBO`, `LEBRO`, `LEBUNT`, `LEBYGLIN`, `LEDIV`, `LEELKABJOR`, `LEELKABLUF`, `LEELKABRØR`, `LEFIBEKAB`, `LEFJ`, `LEFJRETUR`, `LEFJTUR`, `LEFUNDKANT`, `LEGAS`, `LEGASP`, `LEGASS`, `LEGLYSKAB`, `LEGRØ`, `LEGRØXX500`, `LEHJELIN`, `LEISOL`, `LEKA`, `LEKAXX500`, `LEKU`, `LEKULD`, `LELYTKAB`, `LEOPIKANAL`, `LESIGNKAB`, `LESLISS`, `LESPUNT`, `LESTIKKB`, `LESTØTMUR`, `LETRA`, `LETRE`, `LETREMKAB` | All `UNKNOWN` |
| 18 | 37 | `LETREUKAB`, `LETRYKLUFT`, `LETU`, `LETUADK`, `LEVANNBVARM`, `LEVAR`, `LEVARAF`, `LEVARGAMAF`, `LEVARGAMOV`, `LEVARGAMSP`, `LEVARGAMVL`, `LEVAROV`, `LEVARSP`, `LEVARVL`, `OV`, `OVBO`, `OVF`, `OVI`, `OVK`, `OVKU`, `OVO`, `OVP`, `OVR`, `OVS`, `OVT`, `OVU`, `OVVAR`, `OVX`, `SP`, `SPBO`, `SPD`, `SPGRÅ`, `SPI`, `SPK`, `SPLU`, `SPO`, `SPP` | All `UNKNOWN` |
| 19 | 14 | `SPS`, `SPT`, `SPVAR`, `SPX`, `VL`, `VLBO`, `VLI`, `VLK`, `VLLU`, `VLP`, `VLSPR`, `VLT`, `VLU`, `VLVAR` | All `UNKNOWN` |
| **Total** | **108** | Exact current line-Tema set | **108 `UNKNOWN`; 0 pressure; 0 gravity/self-flow** |

The five values marked `foreløpig kode` by the source remain current values in this table and remain hydraulically `UNKNOWN`; provisional status does not establish a regime. Legacy values omitted from v3.2 are not silently mapped, normalized, or treated as replacements.

## 3. Applicability state contract

Applicability is target-specific. A definition identifies a classification (for example `LINE_HYDRAULIC_REGIME`) and the later rule requests a target domain (for example `PRESSURE` or `GRAVITY`). The result carries both the target and any independently resolved domain.

`ApplicabilityState` should be a contract separate from the existing validation `EvaluationState`:

```text
APPLICABLE
NOT_APPLICABLE
UNKNOWN
CONFLICT
```

Exact precedence and semantics:

| Tema/classification evidence | Applicability state | Reason code | `resolvedDomain` | Meaning |
|---|---|---|---|---|
| Resolved Tema has explicit authoritative membership in the requested target domain | `APPLICABLE` | `SOURCE_BACKED_APPLICABLE` | Requested domain | The conditional rule may evaluate its field. |
| Resolved Tema has explicit authoritative membership in another mutually exclusive domain or is explicitly documented outside the target domain | `NOT_APPLICABLE` | `SOURCE_BACKED_NOT_APPLICABLE` | Other/outside domain | The conditional rule does not apply. Absence from a positive list is never enough for this state. |
| Resolved current Tema has no authoritative domain membership | `UNKNOWN` | `CLASSIFICATION_NOT_ESTABLISHED` | `null` | Current identity is known; applicability is not. This is the result for all 108 current v3.2 line Tema today. |
| Resolved non-current/unrecognized Tema has no reviewed membership | `UNKNOWN` | `CLASSIFICATION_NOT_ESTABLISHED` | `null` | Resolution of a delivered value is not proof of a hydraulic class. The line-Tema value rule, if any, owns list validity. |
| Tema field absent or all accepted candidates missing/null/empty | `UNKNOWN` | `TEMA_IDENTITY_MISSING` | `null` | The classifier does not own Tema requiredness and must not use `REQUIRED_*` as if it created a validation finding. |
| Tema binding ambiguous | `UNKNOWN` | existing `BINDING_AMBIGUOUS` | `null` | Structural uncertainty; no candidate is selected. |
| Tema source unresolved | `UNKNOWN` | existing `UNRESOLVED_SOURCE` | `null` | Unsupported candidates do not become aliases or fallback sources. |
| Schema unavailable | `UNKNOWN` | existing `SCHEMA_UNAVAILABLE` | `null` | No structural basis for classification. |
| Direct `Tema` and accepted `S_FCODE` disagree | `CONFLICT` | existing `TEMA_CONFLICT` | `null` | Conflicting identity evidence must never produce a definite domain. |

Hard invariants:

- `UNKNOWN` is not an alias for `NOT_APPLICABLE`.
- `CONFLICT` cannot degrade to `UNKNOWN`, `APPLICABLE`, or `NOT_APPLICABLE` through fallback or execution order.
- An unmapped identity cannot become `NOT_APPLICABLE` by closed-world complement.
- A later conditional rule cannot return `PASS` merely because classification is `UNKNOWN` or `CONFLICT`.
- The line classifier is line-only. A point ObjectRef is rejected by the classifier contract or never dispatched to it; point Tema is not treated as hydraulically non-applicable.

Direct Tema, sole `S_FCODE` fallback, and direct/fallback agreement all enter the same resolved branch after conservative Tema identity resolution. The classifier does not distinguish them semantically, but preserves their provenance.

## 4. Reason and evidence model

### Stable reason codes

Add classifier-specific reason codes only where existing structural codes are not truthful:

| Reason code | State(s) | Purpose |
|---|---|---|
| `SOURCE_BACKED_APPLICABLE` | `APPLICABLE` | Exact resolved identity has an explicit source-backed membership in the target domain. |
| `SOURCE_BACKED_NOT_APPLICABLE` | `NOT_APPLICABLE` | Exact resolved identity has an explicit source-backed membership outside the target domain. |
| `CLASSIFICATION_NOT_ESTABLISHED` | `UNKNOWN` | Identity is resolved, but reviewed evidence does not establish a domain. |
| `TEMA_IDENTITY_MISSING` | `UNKNOWN` | No usable Tema value exists; requiredness remains owned by the Tema rule. |
| `BINDING_AMBIGUOUS` | `UNKNOWN` | Reuse existing structural reason. |
| `UNRESOLVED_SOURCE` | `UNKNOWN` | Reuse existing structural reason. |
| `SCHEMA_UNAVAILABLE` | `UNKNOWN` | Reuse existing structural reason. |
| `TEMA_CONFLICT` | `CONFLICT` | Reuse existing direct/fallback disagreement reason. |

`REQUIRED_FIELD_ABSENT`, `REQUIRED_VALUE_MISSING`, and `VALUE_NOT_ALLOWED` should not be emitted by the classifier. They belong to validation rules, not classification evidence.

### Classification result

A frozen result should contain only the evidence later rules need:

```js
{
  classificationId,       // e.g. LINE_HYDRAULIC_REGIME
  targetDomain,           // PRESSURE or GRAVITY
  state,                  // APPLICABLE | NOT_APPLICABLE | UNKNOWN | CONFLICT
  reasonCode,
  resolvedIdentity,       // exact sanitized Tema scalar, or null
  resolvedDomain,         // PRESSURE | GRAVITY | OUTSIDE_DOMAIN | null
  identityEvidence: {
    canonicalFieldId: 'tema',
    identityState,
    bindingState,
    preferredSourceKey,
    mappingKind,
  },
  provenance,             // exact mapping-entry authority, or reviewed source-gap record
  layerId,
  datasetRevision,
  sourceFormat: 'gmi',
  objectRef,
}
```

The result must retain exact layer, dataset revision, geometry, and ObjectRef ownership and be immutable under the same policy as existing Validator 2.0 evidence/results. It may expose the resolved Tema code and sanitized source-key/mapping-kind metadata. It must not expose a raw GMI row, unrelated attributes, coordinates, hidden lexical evidence, customer/case data, or target-field values. It must not enter telemetry.

For an explicit mapping, `provenance` identifies the exact versioned authority, page/section or decision record, and mapping entry. For `CLASSIFICATION_NOT_ESTABLISHED`, provenance records the reviewed source set and the absence of an authorized mapping; it must not pretend that `UNKNOWN` is a positive source classification.

The classifier itself creates no finding. A later active conditional rule owns any `INDETERMINATE` result/finding caused by unresolved applicability.

## 5. Recommended architecture

Use a small pure, data-driven applicability classifier over existing Tema identity evidence. Do not create an active classification validation rule.

Conceptually:

```js
classifyApplicability({
  definition,
  targetDomain,
  temaIdentityEvidence,
  layerId,
  datasetRevision,
  objectRef,
}) -> ApplicabilityResult
```

The immutable definition should declare:

- `classificationId` and supported geometry (`line`);
- identity owner (`tema`);
- target domains and whether they are mutually exclusive;
- explicit exact identity-to-domain entries only;
- per-entry source/provenance;
- no default domain and no prefix/pattern matcher.

An identity absent from the explicit mapping returns `UNKNOWN`, never the complement domain. Registry/definition validation should reject duplicate identities, contradictory domain assignments, unsupported geometry, missing provenance, non-exact match policies, and mapped Tema values outside the separately reviewed current identity set. Partial authoritative mappings are acceptable: mapped values can classify while every omitted value remains `UNKNOWN`.

The clean separation is:

1. existing binding and `resolveGmiTemaIdentity()` establish conservative identity evidence;
2. the pure classifier maps that evidence through explicit reviewed metadata;
3. a future conditional evaluator translates applicability plus target-field evidence into existing validation `EvaluationState` values.

The classification definition should live outside `VALIDATION_RULES` (for example, a dedicated classification registry/module). It is executable policy metadata, but not a user-visible validation requirement. This avoids a result row, finding stream, Field Info pseudo-field, Fildata distribution, severity, or active-rule count for classification alone.

### Relationship architecture boundary

Do not redesign or repurpose Slice 8's `FIELD_RELATIONSHIP` / `ALLOWED_PAIRS` mechanism. That mechanism compares two supplied field identities and owns a definite compatibility mismatch. Hydraulic classification instead derives reusable applicability evidence from one resolved identity and may remain unknown without being a validation failure.

Both mechanisms should reuse the runner's per-field/per-ObjectRef evidence cache and must not consume aggregate `RuleResult` objects or depend on registry order. A future conditional evaluator may be a new narrow evaluator kind, but that belongs to the later conditional-rule design, not Slice 9.

## 6. Integration with `resolveGmiTemaIdentity()`

There must be exactly one Tema identity path:

- direct `Tema` is preferred;
- `S_FCODE` is the sole accepted fallback;
- direct/fallback agreement resolves normally;
- direct/fallback disagreement remains `CONFLICT / TEMA_CONFLICT`;
- ambiguous, unresolved, and schema-unavailable binding remains structural uncertainty;
- no `PTEMA`, `LTEMA`, `FCODE`, `.P_TEMA`, `.L_TEMA`, alias, normalization, trimming, case rewrite, prefix logic, or migration is introduced.

The classifier should accept the Tema evidence already obtained by the runner's existing field-plus-ObjectRef path. It must not reread raw attributes or call a second resolver. If implementation later factors the current unavailable-Tema wrapper into a shared helper, that refactor must preserve existing resolver behavior and carry the caller's layer/revision/ObjectRef ownership; it must not broaden accepted sources.

Before classifying, assert that the evidence, ObjectRef, selected layer, dataset revision, source format, and `line` geometry have the same owner. Cache classification, if needed, by classification ID + target domain + full ObjectRef identity; never by local source index or Tema value alone.

## 7. Later conditional-rule handoff

A future conditional evaluator should consume an `ApplicabilityResult` directly, not reconstruct classification and not inspect aggregate results.

Common handoff:

| Applicability | Conditional validation behavior |
|---|---|
| `APPLICABLE` | Evaluate the target field using that rule's own requiredness/value policy. A field can then `PASS` or `FAIL`. |
| `NOT_APPLICABLE` | Return `NOT_EVALUATED` with a conditional-not-applicable reason and no finding. This state is allowed only from explicit outside-domain evidence. |
| `UNKNOWN` | Never return `PASS` and never translate to not applicable. A required conditional rule becomes `INDETERMINATE` with the classifier reason; the active rule, not the classifier, owns the finding. |
| `CONFLICT` | Return `INDETERMINATE / TEMA_CONFLICT`; never choose a domain. |

### SDR

After an authoritative pressure mapping exists, the SDR rule requests target domain `PRESSURE`:

- `APPLICABLE`: evaluate required presence and, only after its separate lexical/code policy is agreed, the 13 allowed values;
- `NOT_APPLICABLE`: `NOT_EVALUATED`, no SDR finding;
- `UNKNOWN` or `CONFLICT`: `INDETERMINATE`, never `PASS`, regardless of whether SDR itself is populated.

SDR presence/value must never feed classification.

### Trykklasse

After an authoritative pressure mapping exists, an optional-if-present Trykklasse rule also requests `PRESSURE`:

- `APPLICABLE` and supplied: validate under its separately agreed optional value policy;
- `APPLICABLE` and absent: `NOT_EVALUATED` as optional, not `PASS`;
- `NOT_APPLICABLE`: `NOT_EVALUATED`; source does not establish that supplied values outside the domain should be a separate error;
- `UNKNOWN`/`CONFLICT` and supplied: `INDETERMINATE`, never `PASS`;
- `UNKNOWN`/`CONFLICT` and absent: it may remain `NOT_EVALUATED` because no optional value was supplied, but the details must preserve unknown applicability and must not label it source-backed non-applicability. The exact optional-rule presentation belongs to the Trykklasse slice.

Trykklasse presence/value must never feed classification.

### Ringstivhet

Do not activate or fully design a Ringstivhet rule from hydraulic classification alone. Even after an authoritative gravity mapping exists, the official source-scope conflict must be resolved first. Hydraulic `GRAVITY` evidence cannot silently decide the separate material qualifier.

## 8. Ringstivhet source conflict

The conflict remains open and blocks the rule:

- Vedlegg A p. 5: required for plastic gravity/self-flow lines;
- Vedlegg A p. 22: obligatory for gravity/self-flow lines, without the plastic qualifier.

The classification foundation may eventually establish `GRAVITY`, but it must not classify material and must not choose which Ringstivhet scope controls. Material may only participate in a later, separately reviewed applicability step if an authority resolves the p. 5/p. 22 conflict in favor of a plastic qualification. Material must never establish hydraulic regime.

An acceptable resolution is a publisher clarification or an explicit domain-owner policy selecting and documenting precedence/scope. Until then, Ringstivhet remains deferred even if a Tema→gravity mapping is supplied.

## 9. Should executable Slice 9 implementation proceed now?

**Recommendation: DEFER EXECUTABLE FOUNDATION.** Treat this report as the completed Slice 9 architecture/design foundation and do not add classifier code yet.

With zero source-backed pressure entries and zero source-backed gravity entries, production classification would return `UNKNOWN` for every current line Tema. Such infrastructure cannot safely enable SDR, Trykklasse, pressure-height, or Ringstivhet rules. Activating required conditional rules over it would turn all relevant lines indeterminate; treating those lines as not applicable would violate the state contract.

Implementing an unused empty classifier now would add contracts, registry metadata, APIs, and maintenance surface without an executable domain decision to validate. The smallest coherent implementation slice is the classifier plus at least one reviewed mapping source and its independent oracle. Deferral also prevents an apparently complete classifier from being mistaken for meaningful hydraulic coverage.

This recommendation does not discard the design. The state, result, provenance, ownership, and handoff contracts above should be used unchanged unless the future authority requires a genuinely different domain model.

## 10. Exact evidence needed to unblock classification

Any one of the following can authorize a mapping if it is versioned, reviewable, and explicit:

1. an official Innmålingsinstruks revision/addendum mapping exact line Tema values to pressure, gravity/self-flow, or explicitly outside-domain status;
2. another authoritative Gemini VA/GMI specification that defines the same exact Tema identities and their hydraulic regimes for the relevant Gemini VA 5.15/v3.2 delivery profile; or
3. a domain-owner-approved project policy adopted as executable validator authority.

A domain-owner policy is sufficient only if it records:

- exact case-sensitive Tema values, not prefixes, patterns, descriptions, or families;
- one explicit outcome per reviewed value: `PRESSURE`, `GRAVITY`, `OUTSIDE_DOMAIN`, or intentionally `UNKNOWN`;
- geometry/profile/version scope and effective date;
- author/owner, approval/review record, and stable decision identifier;
- supporting source references and rationale per entry or coherent reviewed group;
- treatment of provisional and legacy Tema values without silent normalization;
- whether domains are mutually exclusive and how actual source conflicts are represented;
- change/version policy so future Tema-list changes do not inherit classifications automatically.

The mapping may be partial. Partial evidence unblocks only the exact listed values; all others remain `UNKNOWN`. Dataset frequency, legacy implementation behavior, and expert intuition not captured in an approved policy are insufficient.

Separately, Ringstivhet needs a source or domain-owner decision resolving plastic-only versus all-gravity scope. That decision does not itself provide a Tema→gravity mapping.

## 11. Independent-oracle test strategy

No tests are changed in this planning slice. When authoritative mapping and implementation are approved, use these tests.

### Mapping oracle

- Create a test-only literal transcription of the approved mapping. It must not import, derive, invert, complement, or iterate production classification data to manufacture expectations.
- Keep an independently transcribed exact 108-value v3.2 line-Tema fixture. Assert production/current-list parity separately from hydraulic mapping parity.
- Assert every explicitly mapped pressure Tema and every explicitly mapped gravity Tema.
- Assert every reviewed outside-domain Tema produces `NOT_APPLICABLE` only for the appropriate target.
- Assert every current Tema omitted from the authoritative mapping remains `UNKNOWN / CLASSIFICATION_NOT_ESTABLISHED`.
- Until a mapping exists, the independent source oracle is exactly 0 pressure, 0 gravity, and all 108 current values `UNKNOWN`; do not create executable production metadata merely to mirror that empty result.

### Pure state-contract tests

Use a test-only synthetic classification definition to exercise `APPLICABLE` and `NOT_APPLICABLE` without pretending those identities are v3.2 mappings. Test resolved target membership, resolved different/outside membership, unmapped current identity, unmapped non-current identity, missing Tema, ambiguous binding, unresolved source, schema unavailable, and conflict.

Assert:

- `UNKNOWN` never becomes `NOT_APPLICABLE`;
- `CONFLICT` never becomes a definite classification;
- absence from a positive mapping is not treated as a negative mapping;
- exact case-sensitive identity is required; no prefix, substring, alias, or normalization path exists;
- the result and nested evidence are immutable and ownership fields are preserved.

### Tema resolution tests

- direct Tema;
- sole `S_FCODE` fallback;
- direct/fallback agreement;
- direct/fallback disagreement → `CONFLICT / TEMA_CONFLICT`;
- no `PTEMA`, `LTEMA`, `FCODE`, `.P_TEMA`, or `.L_TEMA` fallback;
- missing accepted values, ambiguous binding, unresolved source, and schema unavailable.

### Prohibited-input invariance

For an otherwise identical line/ObjectRef and Tema identity, vary independently:

- target-field presence/value;
- Material;
- Nett_type;
- SDR;
- Ringstivhet;
- Trykklasse.

The classification result must remain identical. Include legacy-heuristic counterexamples whose suggestive prefix/name would previously have changed class.

### Geometry and ownership

- point versus line isolation: no point ObjectRef can be classified by the line definition;
- mixed geometry: only line refs are dispatched and point attributes cannot influence line evidence;
- two-layer isolation with identical local source indices;
- dataset-revision/ObjectRef mismatch rejection;
- evidence/cache keys preserve layer, revision, geometry, object, classification ID, and target domain;
- no raw rows, unrelated attributes, coordinates, or operational identifiers in evidence/findings/telemetry.

### Future conditional-rule tests

- required SDR: applicable routes to normal evaluation, not applicable to `NOT_EVALUATED`, unknown/conflict to `INDETERMINATE`;
- optional Trykklasse: absence never becomes `PASS`, supplied unknown/conflict never becomes `PASS`, and unknown is never labelled not applicable;
- Ringstivhet remains absent from the active registry until both gravity mapping and source-scope conflict are resolved;
- per-rule reconciliation and selected-layer/ObjectRef invariants continue to hold;
- conditional evaluation uses per-object evidence, not aggregate RuleResults or registry order.

## 12. Registry and count impact

This design-only Slice 9 makes no registry or presentation change:

| Count | Before Slice 9 | Slice 9 change | After design-only Slice 9 |
|---|---:|---:|---:|
| Active rules | 26 | 0 | **26** |
| Point-applicable rules/rows | 19 | 0 | **19** |
| Line-applicable rules/rows | 21 | 0 | **21** |

A future classifier foundation should also change these counts by zero because it is evidence infrastructure, not an active rule. Counts should change only when a separately approved conditional field rule is activated. Classification alone needs no result row, finding, severity, Field Info concept, Fildata view, or summary total.

## 13. Recommended later slices

1. **Hydraulic authority decision.** Obtain and approve a versioned exact Tema-domain mapping. Keep partial/unknown entries explicit and independently reviewed.
2. **Classifier implementation.** In one bounded slice, add the state/reason/result contracts, immutable classification definition, pure helper, Tema-evidence integration, ownership/privacy assertions, and independent oracle. Add no active rule and keep counts 26/19/21.
3. **SDR plan and implementation.** Only after pressure mappings exist; settle decimal lexical/code behavior separately. Add the pressure-conditional required/value rule without using SDR as classifier evidence.
4. **Trykklasse plan and implementation.** Only after pressure mappings and optional code-value policy exist. Keep the field optional.
5. **Ringstivhet authority decision, then separate rule slice.** Resolve p. 5 versus p. 22 scope before designing material refinement or activating a rule.

Pressure-line height rules remain a separate later consumer of the same classification evidence. This plan does not authorize them.

## 14. Unresolved source/domain issues

1. No reviewed source maps any of the 108 current line Tema values to pressure or gravity/self-flow.
2. No reviewed source defines which Tema are explicitly outside each hydraulic target domain for validator purposes.
3. The source does not state whether suggestive Tema descriptions are intended as formal hydraulic classifications; this plan correctly does not assume they are.
4. Ringstivhet scope conflicts between plastic gravity lines (p. 5) and gravity lines generally (p. 22).
5. Legacy line Tema and five provisional current values have no approved hydraulic treatment or migration policy.
6. A future authoritative mapping must define its version/change relationship to the current 108-value Tema list; newly added values must default to `UNKNOWN`, not inherit a prefix/family class.
7. Optional Trykklasse presentation for absent field plus unknown applicability needs a narrow rule-level decision, but it does not block the classifier contract and may never produce `PASS` or source-backed non-applicability.

Until items 1–2 are resolved by acceptable authority, executable hydraulic classification and all rules requiring a definite pressure/gravity decision remain deferred.
