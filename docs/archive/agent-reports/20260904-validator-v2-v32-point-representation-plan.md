# Validator 2.0 — v3.2 point applicability and representation foundation

**Plan date:** 2026-09-04

**Scope:** source review and architecture planning only; no production code, tests, registry, commit, push, deployment, or production-configuration changes

**Repository checkpoint:** `feature/validator-v2-v32-baseline` at `19ae771`

**Baseline registry:** 26 active rules; 19 point-applicable; 21 line-applicable

## Executive decision

The seven fields are present as canonical, point-only Validator 2.0 concepts, but v3.2 and the current parsed GMI model do not support the complete conditional rules implied by point representation.

Three narrow allowed-value rules are source-safe now under the settled strict-current-code policy: optional-if-present exact-list validation for `Kumform`, `Byggemetode`, and `Kjegle`. This does **not** establish that those fields are required for every parsed point. Appendix A pp. 4–5 labels all three `Ja`, but the table defines its semantic point object as a construction functioning as a collection point for water-bearing lines, while the 81-value point Tema list includes a broader range and supplies no Tema-to-table-scope mapping. Validator geometry `point` is therefore not sufficient evidence of that semantic scope.

Shape and construction classification are only partially executable. Appendix A p. 14 explicitly maps `R` to round and `F`, `FK`, and `FR` to non-circular named shapes. Appendix A p. 15 explicitly marks nine construction codes as `Prefabr.`. It does not authorize closed-world complements: the remaining shape and construction codes stay `UNKNOWN`, including codes whose ordinary-language descriptions may look suggestive.

Polygon-supplied classification is not executable in the current input model. Main pp. 27–29 place non-round point polygons in a companion LAGS GML delivery and require corresponding GML and GMI VA points/pits to have the same GUID. The current parser exposes only GMI `points` and `lines`; it parses no polygon geometry, companion GML, delivery manifest, or cross-file ownership relation. Absence of a polygon in current parsed data is therefore `UNKNOWN`, not `POLYGON_NOT_SUPPLIED`.

`Utvendig_høyde` remains blocked by an unresolved official-source conflict. `Avst_BunnInnvUnderUtv` remains blocked for conditional requiredness, but its directly supplied value does not need a derived Z graph merely to test presence or, after a numeric lexical policy exists, its decimal-metre format. Any calculation or cross-height relationship does require explicit surveyed-measurement provenance.

## 1. Source findings

### Reviewed authority

- Main instruction v3.2, August 2026: pp. 2, 5, 13–15, 25, and 27–29.
- Vedlegg A v3.2, 01.08.2026: pp. 2, 4–5, 9, and 14–15.
- The main p. 2 revision note says only that v3.2 was revised for Gemini VA 5.15, extends code lists, and changes the stikkledning endpoint procedure. Vedlegg A p. 2 says only that it was revised to Gemini VA 5.15. Neither note gives precedence for the p. 5/p. 9 height wording.
- Main p. 25 says instruction codes are used and explanatory text may occupy the same field when no suitable code exists. For Validator 2.0, the product decision supplied for this task controls automated current-list validation: a supplied value outside the current v3.2 list fails. This plan does not reopen that decision.

### Verified field statements

| Field | v3.2 statement | Finding |
|---|---|---|
| `Kumform` | Point overview p. 4: `Ja`; p. 14: seven codes | Code list explicit. Exact Tema/object applicability absent. |
| `Bredde` | Point overview p. 4: `Ja, men ikke ved polygon-avgrensning`; p. 9: integer mm; main pp. 14–15 discuss width and non-round polygon representation | Conditional requirement explicit in overview, but polygon evidence is unavailable in current input. No dimension alias is authorized. |
| `Lengde` | Combined `Bredde (/ Lengde)` overview row has the same polygon qualification; p. 9 says integer mm; main p. 15 says a square cannot be described by length and width alone because rotation is unknown | Length is a distinct delivered point property. The text supports its role for non-round objects but does not provide a total object/shape applicability map. |
| `Utvendig_høyde` | Overview p. 5: `Valgfritt`; detail p. 9: integer mm and obligatory for non-circular prefabricated installations | First-class source conflict; no precedence note. |
| `Avst_BunnInnvUnderUtv` | Overview p. 5: `Ja`, defined as inner-bottom height minus outer-underside height; detail p. 9: decimal metres from centre-bottom survey point down to outer underside, obligatory for circular prefabricated installations; main p. 14 says the distance shall be supplied/measured | Direct field semantics are explicit. Universal versus conditional scope is not safely resolved. |
| `Byggemetode` | Point overview p. 5: `Ja`; p. 15: 15 codes | Code list explicit. Exact Tema/object applicability absent. Nine values explicitly say `Prefabr.`. |
| `Kjegle` | Point overview p. 5: `Ja`; p. 15: five codes, including `U` = no cone | Code list explicit. Exact Tema/object applicability absent. |

### Source-backed mapping classification

| Requested mapping | Classification | Exact result |
|---|---|---|
| A. point identity/Tema → object class requiring these fields | **No authoritative mapping** | Neither document maps any exact point Tema to the semantic scope of `Kumform`, `Byggemetode`, `Kjegle`, dimensions, or height fields. The point overview alone is not an identity map. |
| B. `Kumform` → circular/non-circular | **Partial mapping** | `R` (`Rund`) → circular. `F` (`Firkantet`), `FK` (`Kvadratisk`), and `FR` (`Rektangulær`) → non-circular. `AN`, `N`, and `X` remain unknown. |
| C. `Byggemetode` → prefabricated/non-prefabricated | **Partial mapping** | `B`, `BU`, `E`, `E0`, `E1`, `G`, `K`, `P`, and `V` explicitly contain `Prefabr.` and may map to prefabricated. No code is explicitly labelled non-prefabricated. `M`, `MU`, `S`, `SU`, `UK`, and `W` remain unknown. |
| D. polygon supplied/not supplied | **Partial mapping** | A parsed, qualifying polygon on the corresponding companion GML object can establish supplied. Current GMI-only absence cannot establish not supplied. A complete-delivery negative-evidence contract is not defined. |
| E. point → owned polygon relation | **Partial mapping** | Main p. 28 requires corresponding LAGS GML and GMI VA points/pits to use the same GUID. This is an explicit cross-file correspondence key, but the reviewed source does not itself define the complete polygon feature/schema contract, and the current parser preserves neither side of the relation as a graph. |

No row authorizes a manufactured complement. In particular, “not explicitly round” is not non-circular, and “not explicitly prefabricated” is not non-prefabricated.

## 2. Field-by-field decision table

`Yes later` means source-safe in isolation but dependent on a missing evaluator or agreed lexical policy. `Deferred` means the validator cannot safely decide the result from current source and data.

| Field | Required presence now | Optional-if-present validation | Allowed-value validation | Conditional requiredness | Relationship validation |
|---|---|---|---|---|---|
| `Kumform` | **Deferred** — no exact point-scope map | **Yes now** for exact supplied value | **Yes now**: `AN,F,FK,FR,N,R,X` | **Deferred** | **Deferred**; only partial shape evidence exists |
| `Bredde` | **Deferred** — polygon exception cannot be evaluated | **Yes later**: direct integer-mm lexical validation | N/A | **Deferred** pending polygon state and semantic point scope | **Deferred**; do not derive from geometry or aliases |
| `Lengde` | **Deferred** — polygon and non-round applicability unresolved | **Yes later**: direct integer-mm lexical validation | N/A | **Deferred** | **Deferred**; do not copy/infer from width or line length |
| `Utvendig_høyde` | **Deferred** — source conflict | **Yes later**: direct integer-mm lexical validation is independent of requiredness | N/A | **Deferred** pending publisher/domain decision plus shape/construction evidence | **Deferred** |
| `Avst_BunnInnvUnderUtv` | **Deferred** — overview/detail scope mismatch | **Yes later**: direct decimal-metre lexical validation is independent of derivation | N/A | **Deferred** pending scope decision plus shape/construction evidence | **Deferred** pending surveyed-measurement provenance |
| `Byggemetode` | **Deferred** — no exact point-scope map | **Yes now** for exact supplied value | **Yes now**: `B,BU,E,E0,E1,G,K,M,MU,P,S,SU,UK,V,W` | **Deferred** | **Deferred**; only partial prefabrication evidence exists |
| `Kjegle` | **Deferred** — no exact point-scope map | **Yes now** for exact supplied value | **Yes now**: `E,R,S,T,U` | **Deferred** | No source-backed relationship rule identified |

For `Bredde`, current binding is already correct and must remain unchanged: direct `Bredde`, with only a unique Unicode case-only match. `DIM`, `DIMENSJON`, `Dimensjon`, and `DIAMETER` must not satisfy it. `Lengde` similarly remains a direct point property and is never computed line length.

The `Ja` cells on pp. 4–5 are meaningful source evidence, but they do not close the gap between the Appendix's semantic point-object definition and every `[P_]` record accepted by the current parser. A domain decision could choose universal parsed-point enforcement; v3.2 does not supply the exact identity bridge needed to make that choice automatically.

## 3. Shape/circularity evidence assessment

Use a target-specific value plus evidence status, not a Boolean:

```text
shape = CIRCULAR | NON_CIRCULAR | UNKNOWN | CONFLICT
```

The minimum current source map is:

- `R` → `CIRCULAR`, because p. 14 says `Rund`.
- `F`, `FK`, `FR` → `NON_CIRCULAR`, because p. 14 says square/quadratic/rectangular forms.
- `AN`, `N`, `X` → `UNKNOWN`; none states circularity.
- missing, ambiguous, unresolved, or invalid `Kumform` → `UNKNOWN` with its structural/value reason, not a negative class.
- `CONFLICT` is reserved for future independent authoritative evidence that genuinely disagrees; it should not be synthesized from an invalid value.

This is an explicitly authorized semantic use of the p. 14 descriptions. It does not mean `Kumform` presence proves that the object belongs to a conditional rule's domain. Width, length, point coordinates, nearby lines, and target-field presence must not supplement this map.

Geometry alone is not a trustworthy circularity oracle in the current model. A centre point has no outline, and a line ring is not an owned point polygon. Even a future polygon should preserve surveyed representation evidence; circle-fitting tolerances would be product heuristics unless a source authorizes them.

## 4. Prefabrication evidence assessment

Use:

```text
construction = PREFABRICATED | NON_PREFABRICATED | UNKNOWN | CONFLICT
```

Appendix p. 15 explicitly establishes `PREFABRICATED` for `B`, `BU`, `E`, `E0`, `E1`, `G`, `K`, `P`, and `V`, because each description says `Prefabr.`.

It establishes no `NON_PREFABRICATED` entries. Do not convert `Murt`, `Murt u/bunn`, `Støpt`, `Støpt u/bunn`, `Ukjent`, or `PP polypropylen` into non-prefabricated/prefabricated classes from trade knowledge or wording implication. Thus `M`, `MU`, `S`, `SU`, `UK`, and `W` remain `UNKNOWN`. Absence from the positive set is not a complement.

As for shape, construction classification should consume separately validated exact field evidence and preserve ObjectRef ownership. The presence or value of either height target must never classify construction.

## 5. Polygon ownership assessment

### What v3.2 establishes

- Main p. 15 requires an surveyed outer-boundary polygon when a non-round point object cannot be described simply by a dimension from the centre point. The polygon carries boundary and heights; normally its height reference is outer underside. The centre/bottom construction point supplies bottom height.
- Main pp. 27–29 put VA points/pits with polygons in a companion LAGS GML step.
- Main p. 28 requires the corresponding VA point/pit in LAGS GML to have the same GUID as the GMI object before update/import.

### What the current model preserves

`GMIParser.toObject()` returns `points` and `lines`. Each feature has a parser-local numeric ID, type, extent, attributes, optional GUID, and coordinates. It has no polygon collection, GML parser, delivery manifest, geometry collection, source-file identity, relation edge, or point-owned polygon. Validator 2.0 ObjectRefs identify layer, dataset revision, geometry (`point`/`line`), and source index only. They correctly prevent cross-layer/revision/geometry leakage but cannot represent the cross-file relation.

### Minimum evidence needed

The preferred minimum is:

1. a parser-preserved companion GML feature with polygon/multipolygon geometry and source provenance;
2. the exact stable GUID from both the GMI point and GML feature;
3. an explicit relation edge created by exact GUID equality within one declared delivery/revision;
4. schema/profile evidence that the GML geometry is the point object's qualifying outer delineation, not an unrelated geometry sharing a textual attribute;
5. polygon geometry validity and the required height-reference/coordinate evidence kept separately from ownership; and
6. a delivery completeness signal before absence can mean `POLYGON_NOT_SUPPLIED`.

An explicit polygon object ID plus explicit point reference, or a schema-defined geometry member owned by the same feature, would also be sufficient. A shared stable identifier is useful only when the parser preserves its normative relation and delivery scope.

Nearest polygon, containment, intersection, centroid coincidence, proximity, coordinate equality, line closure, matching dimensions, or visual plausibility are not acceptable ownership evidence. A nearby or closed line remains a line. Without a complete-delivery contract, polygon state is `UNKNOWN`, not `POLYGON_NOT_SUPPLIED`.

## 6. `Utvendig_høyde` source-conflict analysis

Vedlegg A p. 5 places `Utvendig_høyde` in the point overview with `Påkrevd = Valgfritt`. Vedlegg A p. 9 defines it as integer millimetres from top cover to outer bottom and says it is obligatory for all non-circular prefabricated installations.

One can linguistically harmonize the rows by reading p. 5 as a general/default status and p. 9 as a narrower mandatory exception. That is plausible, but the document does not say that the detail overrides or qualifies the overview, and the overview does not mark a conditional requirement. The same official appendix therefore supplies two different requirement dispositions. Neither revision table nor main instruction resolves precedence.

The validator must retain `SOURCE_CONFLICT`; it must not silently choose optional, universally required, or conditionally required. The exact unblock is either:

- a publisher clarification/corrected appendix saying which statement controls and defining the intended logical condition; or
- a domain-owner-approved, versioned product policy that explicitly selects one of: globally optional; required exactly when non-circular **and** prefabricated; required under some other stated Boolean condition; or universally required.

If conditional scope is selected, the decision must also say how `UNKNOWN` shape/construction affects validation. This plan recommends `INDETERMINATE`, never not applicable or pass.

## 7. `Avst_BunnInnvUnderUtv` measurement/provenance analysis

The GMI attribute itself is first-class delivered evidence. Current canonical binding can safely answer whether the exact field is supplied and can retain its original lexeme. After a dedicated decimal-metre lexical policy is approved, the validator can validate the supplied field's format without reconstructing any heights.

Conditional requiredness is different. P. 5 says `Ja`; p. 9 specifically calls it obligatory for circular prefabricated installations. P. 9 does not explicitly say it is optional outside that subset, so the two statements are not a clean logical complement. A publisher/domain decision must state whether p. 9 narrows p. 5 or merely emphasizes a guaranteed subset.

Relationship or derived-value validation is not possible from current coordinates. Main pp. 13–15 distinguish separate lid and pit points, centre-bottom height, outer-underside polygon height, and values Gemini VA computes. The parser has raw point/line coordinates but no measurement-role node, height-reference-to-coordinate assertion, lid↔pit relation, point↔polygon relation, or observation provenance. Arbitrary Z subtraction would therefore mix potentially unrelated measurements.

To validate the distance as a relationship, future input must preserve at least:

- the owning installation and exact related survey observations;
- each observation's role (`centre bottom`, `outer underside`, and, if used, `top cover`);
- its height reference, units, source feature/file, and measured-versus-derived status;
- exact point/lid/polygon ownership edges and shared delivery revision; and
- the authorized equation, sign convention, and tolerance/rounding policy.

This is provenance/ownership architecture, not a generic two-field compatibility table.

## 8. Recommended architecture

### Pure evidence helpers and registry

Add no active classifier rule. A future point-representation registry outside `VALIDATION_RULES` should contain versioned, exact, source-cited entries for shape and construction. Pure helpers should consume existing point ObjectRef field evidence and return immutable evidence with:

- classification ID and source version;
- value (`CIRCULAR`/`NON_CIRCULAR`, or `PREFABRICATED`/`NON_PREFABRICATED`);
- `UNKNOWN`/`CONFLICT` state and stable reason;
- exact source field/key/value and mapping entry;
- layer ID, dataset revision, source format, geometry, and ObjectRef; and
- no raw row, unrelated attributes, coordinates, target-field values, or telemetry payload.

Partial registries are valid. Every omitted current code remains `UNKNOWN`.

### Relation/provenance model

Extend the parsed delivery model before polygon-dependent rules. Keep source features and geometry distinct from Validator ObjectRefs, then add immutable typed edges such as `SAME_DELIVERY_OBJECT`/`OWNS_OUTER_BOUNDARY`, justified by exact GUID plus profile/schema evidence. Model companion file identity and delivery completeness explicitly.

Add a surveyed-observation/provenance model only for relationship calculations. Do not overload `FIELD_RELATIONSHIP`: that evaluator compares supplied field identities and is not a geometry owner, cross-file join, or measurement graph.

### Evidence handoff

A later conditional evaluator should treat:

- established applicable evidence → evaluate the target rule;
- explicitly established not-applicable evidence → `NOT_EVALUATED`;
- `UNKNOWN` or `CONFLICT` → `INDETERMINATE`, never `PASS` or not applicable.

No current source-backed construction mapping can establish non-prefabricated, and no current input can establish polygon not supplied. Consumers must account for that asymmetry.

## 9. Safe executable work available now

The safest next implementation slice is one point-code-list slice containing three independent optional-if-present exact-list rules:

1. `Kumform`: seven current codes.
2. `Byggemetode`: 15 current codes.
3. `Kjegle`: five current codes.

These rules use direct canonical point binding, the existing settled strict-current-code policy, exact lexical comparison, and no applicability inference from field presence. Missing values are not pass and do not produce a required-field failure; they remain optional/not evaluated in this slice.

A separate architecture-only implementation could add the partial shape and prefabrication registries/helpers with no active rules and no count change. It is executable today because the positive mappings are explicit, but it does not by itself unblock polygon exceptions or either height rule. It should follow the list slice so classifier inputs can rely on reviewed current-value evidence.

Direct integer/decimal optional-if-present format validation is also source-safe in principle for `Bredde`, `Lengde`, `Utvendig_høyde`, and `Avst_BunnInnvUnderUtv`. It is not the recommended immediate slice because the current evaluator has no dedicated reviewed numeric-format contract, and parser coercion must not define source lexical validity.

## 10. Blocked work and exact unblock evidence

| Blocked work | Exact evidence/decision needed |
|---|---|
| Universal requiredness for `Kumform`, `Byggemetode`, `Kjegle` | Exact point Tema/object-class scope from publisher, authoritative Gemini profile, or approved domain policy; alternatively an explicit policy that all parsed GMI `[P_]` objects are within the Appendix point-table scope. |
| `Bredde`/`Lengde` polygon exception | Companion GML parsing; qualifying polygon geometry; exact cross-file GUID relation in one complete delivery; schema/profile ownership; and a trustworthy supplied/not-supplied state. |
| Exact `Lengde` applicability | Source/domain rule defining which shapes/object classes require length, including treatment of partially mapped and unknown shape codes. |
| `Utvendig_høyde` requiredness | Publisher correction or approved precedence/Boolean policy resolving pp. 5 and 9, plus usable shape/construction evidence. |
| `Avst_BunnInnvUnderUtv` requiredness | Decision whether p. 9 narrows or emphasizes p. 5, plus usable shape/construction evidence. |
| Derived height/distance checks | Typed survey-observation roles, ownership graph, source provenance, units, measured/derived status, equation, tolerance, and rounding policy. |
| Complete circular/non-circular classification | Explicit treatment of `AN`, `N`, and `X`; no complement inference. |
| Complete prefab/non-prefab classification | Explicit treatment of `M`, `MU`, `S`, `SU`, `UK`, and `W`, including affirmative non-prefabricated entries; no complement inference. |
| Numeric format rules | Field-specific lexical policies for integer millimetres and decimal metres, including signs, separators, exponent notation, whitespace, coercion, range, and precision. |

## 11. Independent test strategy

No tests change in this planning slice. Future tests must use test-owned literal oracles, never production lists inverted or iterated to manufacture expectations.

### Code-list rules

- Independently transcribe all 7 `Kumform`, 15 `Byggemetode`, and 5 `Kjegle` values from pp. 14–15.
- Assert every listed code passes exactly and representative non-current, case-changed, whitespace-padded, punctuation-changed, numeric-coerced, and explanatory-text values fail under the settled policy.
- Assert absent optional values are `NOT_EVALUATED`, not `PASS`, and no required finding is emitted.
- Assert point-only dispatch, direct key plus unique case-only behavior, ambiguity handling, and no line-field fallback.

### Classification oracles

- Independently transcribe `R` as circular and `F/FK/FR` as non-circular.
- Independently transcribe the nine explicit `Prefabr.` values.
- Assert every omitted current value remains `UNKNOWN`; do not test it as a complement.
- Assert invalid/missing/ambiguous evidence remains unknown and source conflicts remain conflict/indeterminate.

### Prohibited inference

- A nearby polygon or closed line does not establish ownership.
- Containment, centroid coincidence, or proximity alone does not establish ownership.
- `Bredde`/`Lengde` values do not establish shape.
- `Kumform` establishes circularity only for the explicit p. 14 mapping.
- `Byggemetode` establishes prefabrication only for descriptions explicitly saying `Prefabr.`.
- Target-field presence never establishes applicability.
- Absence of a parsed polygon in GMI-only input remains `UNKNOWN`, not not supplied.
- Shape/construction/polygon `UNKNOWN` never becomes `NOT_APPLICABLE`.
- The p. 5/p. 9 `Utvendig_høyde` conflict remains unresolved; no test silently chooses a side.
- No arbitrary point, lid, line, or polygon Z values are subtracted without typed provenance.

### Ownership and isolation

- Reject cross-layer, cross-dataset-revision, and ObjectRef ownership mismatches.
- Reject point/line mixing even when source indices, GUID-like values, or coordinates coincide.
- A same GUID in a different delivery/revision does not join.
- Point `Bredde` does not bind `DIM`, `DIMENSJON`, `Dimensjon`, or `DIAMETER`.
- Point `Lengde` is unchanged when line geometry/length changes.
- Cache keys include layer, revision, geometry, object, classifier ID, and source profile.
- Evidence/findings expose no raw rows, unrelated fields, coordinates, case/customer data, or telemetry additions.

## 12. Expected registry/count effects by future slice

Counts below are derived from the verified baseline of 26/19/21. Infrastructure and parser work are not validation rules and must not create presentation rows.

| Future slice | Defined active-rule delta | Active / point / line after that slice if applied in order |
|---|---:|---:|
| 1. Three optional-if-present code-list rules (`Kumform`, `Byggemetode`, `Kjegle`) | `+3 / +3 / +0` | **29 / 22 / 21** |
| 2. Partial shape/construction evidence registry and pure helpers | `+0 / +0 / +0` | **29 / 22 / 21** |
| 3. Companion GML/parser, delivery, GUID relation, polygon ownership foundation | `+0 / +0 / +0` | **29 / 22 / 21** |
| 4. Four independently approved optional-if-present numeric-format rules | `+4 / +4 / +0` | **33 / 26 / 21** |
| 5. Conditional required-presence rules for `Bredde` and `Lengde`, once their conditions are authoritative and executable | `+2 / +2 / +0` | **35 / 28 / 21** |
| 6. Resolved conditional requiredness for `Utvendig_høyde` | `+1 / +1 / +0` | **36 / 29 / 21** |
| 7. Resolved conditional requiredness for `Avst_BunnInnvUnderUtv` | `+1 / +1 / +0` | **37 / 30 / 21** |

Slices 4–7 are count scenarios for precisely defined one-rule-per-field slices, not authorization to implement. If a later design combines requiredness and numeric format in one rule rather than two, that plan must recalculate from its actual registry shape and must not stack the rows above mechanically. Derived relationship validation has no count assigned because no authoritative equation/tolerance rule or evaluator shape is yet approved; guessing one would violate the requested count discipline.

## 13. Recommended implementation order

1. Implement the three optional-if-present exact code-list rules with independent source oracles. This is the recommended next slice.
2. Implement the partial shape/construction evidence registry and pure helpers as non-rule infrastructure; preserve unknown complements and ObjectRef provenance.
3. Obtain publisher/domain decisions for semantic point scope, `Utvendig_høyde`, `Avst_BunnInnvUnderUtv`, and unmapped classification values.
4. Extend delivery parsing/modeling for companion LAGS GML, exact GUID correspondence, completeness, and typed polygon ownership. Add no active validation rule in that architecture slice.
5. Agree and implement direct numeric lexical policies, independently from conditional requiredness.
6. Add `Bredde`/`Lengde` conditional rules only when polygon evidence and exact length/point scope are executable.
7. Add resolved height requiredness rules. Add derived measurement relationships only after the surveyed provenance graph and calculation policy exist.

## 14. Unresolved source/domain/data-model issues

1. No exact Tema/object-class map defines which of the 81 current point Tema values are governed by each representation field.
2. It is not explicit that every parser `[P_]` record belongs to the Appendix's narrower semantic point-object definition.
3. `AN`, `N`, and `X` have no authoritative circular/non-circular outcome.
4. No `Byggemetode` value is explicitly designated non-prefabricated; six values have no authorized prefab outcome.
5. `Utvendig_høyde` is optional on p. 5 and conditionally obligatory on p. 9, with no stated precedence.
6. It is unresolved whether the p. 9 circular-prefabricated statement narrows the p. 5 universal `Avst_BunnInnvUnderUtv` requirement.
7. `Lengde` has no complete shape/Tema applicability rule independent of the combined overview row and narrative example.
8. The current GMI parser has no companion GML or polygon representation.
9. Same-GUID correspondence is source-backed, but a full schema-defined polygon ownership and delivery-completeness contract is not preserved or reviewed in Validator 2.0.
10. Current ObjectRefs cannot represent cross-file feature ownership; parser-local source index cannot substitute for GUID.
11. Current data has no typed lid↔pit, point↔polygon, or surveyed-measurement provenance graph.
12. Numeric lexical, range, precision, sign, and tolerance policies remain separate product decisions.

Until these issues are resolved, polygon classification is not executable; shape and prefabrication are only partially executable; and all polygon-, shape-, construction-, or provenance-dependent requiredness remains deferred.
