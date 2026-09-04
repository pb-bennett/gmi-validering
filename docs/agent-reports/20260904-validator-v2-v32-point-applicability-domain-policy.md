# Validator 2.0 v3.2 point-field applicability domain-policy review

**Review date:** 2026-09-04

**Scope:** planning and domain review only; no production code, tests, registry, commit, push, deployment, or production-configuration changes

**Repository checkpoint:** `feature/validator-v2-v32-baseline` at `2f82989`

**Current registry baseline:** 29 active rules; 22 point-applicable; 21 line-applicable

## Executive decision

The old validator did have the four reported Tema subsets. It treated missing values as failures for objects inside each subset and treated supplied values outside the subset as unexpected warnings/failing objects. The predicates were introduced in commit `2d2a2685` after analysis of 51 Færder Kommune GMI files (4,659 features). Neither the commit nor the analysis records why each boundary was chosen, and v3.2 supplies no exact Tema-to-field applicability map.

All five legacy Tema identities remain exact current v3.2 executable identities: `KUM`, `LOK`, `SAN`, `SLS`, and `SLU`. No alias or migration crosswalk is needed for those five. The legacy subsets remain useful PRAKSIS evidence, not STANDARD behavior. The domain owner has now approved the partial mapping below as PROJECT/DOMAIN POLICY, including `LOK` → `Byggemetode`.

The recommended policy candidate is deliberately partial:

- record `APPLICABLE` for `KUM`, `SAN`, `SLS`, and `SLU` for all four fields under the approved project policy;
- record `APPLICABLE` for `LOK` for `Byggemetode` and `Bredde` under the approved project policy;
- leave `LOK` → `Kumform` and `Kjegle` `UNKNOWN`, rather than restoring the old behavior wholesale;
- leave every other current Tema/field combination `UNKNOWN`; and
- define no `NOT_APPLICABLE` entry until affirmative domain evidence supports one.

This is an approved partial applicability policy only. It does not make any field required. The current optional-if-present allowed-value rules for `Kumform`, `Byggemetode`, and `Kjegle` remain independent and unchanged. `Bredde` has no active format or requiredness rule.

The architecture decision remains **A: explicit, versioned point-field applicability metadata only**, with no requiredness rules and no generic helper until a concrete consumer requires one. No executable metadata is added by this documentation update.

## 1. Evidence and decision rules

This review uses the following evidence classes:

- **STANDARD:** explicit v3.2 source statement.
- **PRAKSIS:** preserved legacy behavior or real-delivery evidence without formal policy authority.
- **DOMAIN-OWNER INPUT:** the supplied statement that `Byggemetode` is generally delivered on objects such as `KUM`, probably sluk, and similar construction objects. This identifies a question to formalize; it is not an exact approved code list.
- **PROJECT/DOMAIN POLICY:** an exact, versioned mapping approved by the responsible domain owner.
- **UNKNOWN:** evidence is insufficient to assert either applicable or not applicable.

Presence and prevalence are corroborating evidence only. Neither can establish applicability, requiredness, or non-applicability. Tema descriptions can establish what the current identity is called and can place it in a review queue, but a name that sounds related does not establish that one of these fields applies.

## 2. What the legacy validator actually did

### Exact predicates

Commit `2d2a2685` added these checks to `isApplicable(feature)`:

| Legacy field key | Exact predicate after Tema normalization | Effect when true |
|---|---|---|
| `Bredde (diameter)` | uppercased resolved `Tema_punkt` is exactly one of `KUM`, `LOK`, `SAN`, `SLS`, `SLU` | Missing value counted as missing/failing; supplied value validated |
| `Byggemetode` | uppercased resolved `Tema_punkt` is exactly one of `KUM`, `LOK`, `SAN`, `SLS`, `SLU` | Missing value counted as missing/failing; supplied value validated against the legacy list |
| `Kumform` | uppercased resolved `Tema_punkt` is exactly one of `KUM`, `SAN`, `SLS`, `SLU` | Missing value counted as missing/failing; supplied value validated against the legacy list |
| `Kjegle` | uppercased resolved `Tema_punkt` is exactly one of `KUM`, `SAN`, `SLS`, `SLU` | Missing value counted as missing/failing; supplied value validated against the legacy list |

Tema was resolved through legacy `Tema_punkt` aliases in this order: exact `Tema_punkt`, then `S_FCODE`, `Tema`, `TEMA`, `FCODE`, then a generic case-insensitive lookup for `Tema_punkt`. The resulting value was converted to text and uppercased. The subset comparison itself was exact equality, not substring matching.

When the predicate was false, a supplied target value incremented `unexpectedCount`, produced a warning-level aggregate path, and was added to `failingIds`. The introducing code explicitly described that treatment as provisional ("include them for now"). Therefore the old implementation encoded both positive applicability and an implicit closed-world negative complement. The latter is not safe to carry forward.

The `fields.json` states do not fully describe runtime behavior. At the introducing commit, `Byggemetode` still said `required: always` and `Bredde (diameter)` said `polygonExcluded`, while `Kumform` and `Kjegle` had been changed from `always` to `conditional`. The runtime nevertheless applied the hardcoded Tema predicates to all four because `isApplicable` did not gate those branches on the metadata state.

### Why the predicates were introduced

- **Git fact:** `7cbee015` added `analyze_gmi_relationships.js`, its relationship report, and the first active field validator.
- **Git fact:** `2d2a2685`, titled `Implement Missing Fields Report feature and fix SDR validation`, added all four hardcoded subsets and the missing-field object IDs.
- **Git fact:** `2d2a2685` contains only short comments ("Required for ...") and UI labels (`Kum/Lokk/Sluk` and `Kum/Sluk`). It records no standard citation, field-by-field rationale, municipality authorization, or explanation of inclusions/exclusions.
- **Supported inference:** the predicates were intended to reduce irrelevant missing-field findings and focus completion reporting on common physical structures in the analyzed deliveries.
- **Limit:** that inference does not establish why `LOK` was included for two fields but omitted for two, why `STR` and `KRN` were excluded, or whether the intended status was mandatory, advisory, Gemini practice, or Færder policy.

## 3. Real-delivery evidence

The repository's aggregate analysis covers 51 Færder GMI files and 4,659 features. Relevant stored figures are:

| Legacy/current Tema | Objects | Bredde | Kjegle | Byggemetode | Kumform |
|---|---:|---:|---:|---:|---:|
| `KUM` | 389 | 63.8% | 57.8% | 57.8% | 59.1% |
| `LOK` | 292 | 100% | 8.6% | 27.7% | 16.4% |
| `SAN` | 30 | 100% | 73.3% | 100% | 100% |
| `SLS` | 16 | 93.8% | 93.8% | 93.8% | 75% |
| `SLU` | 33 | 69.7% | 63.6% | 100% | 69.7% |
| `STR` | 22 | 100% | 0% | 13.6% | 100% |
| `KRN` | 209 | 0.5% | 0% | 51.2% | 10.5% |

This evidence explains why the five historical identities attracted attention and strongly supports retaining the old predicates as review evidence. It does not derive their boundaries:

- `STR` had `Bredde` and `Kumform` on every analyzed object but was excluded.
- `KRN` had `Byggemetode` on 51.2% of analyzed objects but was excluded.
- `LOK` was included for `Byggemetode` despite only 27.7% presence, while omitted for `Kumform` despite 16.4% presence.
- `KUM` had each field on only 57.8–63.8% of analyzed objects, showing that legacy "required" behavior was not simply copied from universal delivery presence.

Frequency therefore neither proves a requirement nor proves that an omitted identity is non-applicable. The corpus is PRAKSIS evidence from one municipality's deliveries, not a formal STANDARD or approved municipal profile.

## 4. Current v3.2 identity crosswalk

The executable vocabulary is `POINT_TEMA_VALUES` in the current Validator 2.0 registry. The five historical identities are all present exactly and require no production alias:

| Legacy identity | Current v3.2 executable identity | Current description | Crosswalk result |
|---|---|---|---|
| `KUM` | `KUM` | Kum | Exact identity; no alias |
| `LOK` | `LOK` | Kumlokk | Exact identity; no alias |
| `SAN` | `SAN` | Sandfangskum | Exact identity; no alias |
| `SLS` | `SLS` | Sluk m/sandfang | Exact identity; no alias |
| `SLU` | `SLU` | Sluk | Exact identity; no alias |

None is obsolete, renamed, removed, or ambiguous in v3.2. Any future policy must store these current identities, not legacy aliases.

There is separate casing drift outside the old subset: older field metadata spells infiltration manhole as `KUMi`, while the current executable v3.2 identity is `KUMI`. A future policy entry must use `KUMI`. This is a documentation crosswalk only and does not authorize `KUMi` as an accepted production alias.

### Current identities requiring semantic-family review

Current descriptions identify the following as explicit kum/sluk variants or specializations. That is enough to ask about them individually, but not enough to set applicability:

| Current Tema | Current description | Why it is in the review queue | Current field state |
|---|---|---|---|
| `KUMI` | Infiltrasjonskum | Explicit kum identity; legacy spelling drift noted above | All four `UNKNOWN` |
| `KOTREKUM` | Trekkekum | Explicit kum identity | All four `UNKNOWN` |
| `MKS` | Målekum spillvann | Explicit kum identity | All four `UNKNOWN` |
| `MKV` | Målekum vann | Explicit kum identity | All four `UNKNOWN` |
| `PMK`, `PMKAF`, `PMKOV`, `PMKSP`, `PMKVL` | Pumpekum variants | Explicit pumpekum identities | All four `UNKNOWN` |
| `RED` | Reduksjonskum | Explicit kum identity | All four `UNKNOWN` |
| `SANI` | Sandfangskum med infiltrasjon | Direct specialization of current `SAN` description | All four `UNKNOWN` |
| `SLG` | Gatesluk | Explicit sluk identity | All four `UNKNOWN` |
| `SLI` | Sluk m/sandfang og infiltrasjon | Direct specialization of current sluk descriptions | All four `UNKNOWN` |

No addition above can yet be justified as `APPLICABLE` from v3.2 or the preserved domain-owner statement. V3.2 lists the identities but does not map them to these fields; the owner input says "such as", "probably", and "similar", not which exact codes and fields. The exact list must be approved rather than generated from substrings such as `KUM` or `SL`.

Other plausible-sounding objects such as `KMR` (Kammer), `STR` (Stakerør), and `SUMP` (Sump) remain outside even that explicit-name queue unless the domain owner identifies them. `STR`'s observed field population is a review prompt, not authority.

## 5. Field-by-field assessment

### Byggemetode

- **Legacy:** `KUM/LOK/SAN/SLS/SLU`; missing values failed, outside supplied values were unexpected.
- **Provenance:** PRAKSIS, medium confidence. Introduced beside the Færder analysis with no exact rationale.
- **V3.2:** the 15 allowed values and the field's semantic point-table presence are STANDARD; the Tema subset is not.
- **Domain input:** positively supports `KUM`, sluk identities, and similar construction objects. The earlier input did not settle `LOK`; the explicit owner decision recorded in section 11 now does.
- **Assessment:** approved project-policy `APPLICABLE` for `KUM`, `LOK`, `SAN`, `SLS`, and `SLU`. The `LOK` decision is explicit domain-owner policy, not STANDARD Innmålingsinstruks behavior. The previous planning assessment deliberately left it `UNKNOWN` pending this approval; the legacy inclusion remains PRAKSIS evidence.

### Kumform

- **Legacy:** `KUM/SAN/SLS/SLU`; missing values failed, outside supplied values were unexpected.
- **Provenance:** PRAKSIS, medium confidence. The apparent intent was to suppress false positives on objects for which chamber shape was not considered meaningful.
- **V3.2:** the seven allowed values and partial shape meaning are STANDARD; no Tema scope is supplied.
- **Assessment:** approved project-policy `APPLICABLE` for `KUM`, `SAN`, `SLS`, and `SLU`. Keep `LOK`, `STR`, and all additions `UNKNOWN` for this field; do not infer applicability for every identity whose description contains "kum" or "sluk".

### Kjegle

- **Legacy:** `KUM/SAN/SLS/SLU`; missing values failed, outside supplied values were unexpected.
- **Provenance:** PRAKSIS, medium confidence. No comment or commit message resolves required versus advisory semantics.
- **V3.2:** the five allowed values, including `U` (no cone), are STANDARD; no Tema scope is supplied.
- **Assessment:** approved project-policy `APPLICABLE` for `KUM`, `SAN`, `SLS`, and `SLU`. The existence of a "no cone" value does not prove that every construction Tema must carry `Kjegle`. `LOK` and all additions remain `UNKNOWN`.

### Bredde

- **Legacy:** `KUM/LOK/SAN/SLS/SLU`; missing values failed, outside supplied values were unexpected.
- **Provenance:** PRAKSIS, medium confidence. `LOK`, `SAN`, and `STR` had 100% presence in the corpus, but `STR` was excluded.
- **V3.2:** `Bredde` is a direct point property and the point overview says it is required except for polygon delineation. V3.2 does not provide the exact Tema scope, and current input cannot establish the polygon exception.
- **Assessment:** approved project-policy `APPLICABLE` for `KUM`, `LOK`, `SAN`, `SLS`, and `SLU`. Applicability must not be confused with unconditional requiredness: even an approved Tema row cannot make `Bredde` required until the polygon exception is executable or a separate owner policy resolves it. All additions remain `UNKNOWN`.

## 6. Proposed explicit policy table

This table is the approved partial PROJECT/DOMAIN POLICY artifact; it is not current executable metadata. `APPLICABLE` means the field belongs to the Tema's domain; it does **not** mean required on every object. No `NOT_APPLICABLE` state is approved.

| Current v3.2 Tema | Byggemetode | Kumform | Kjegle | Bredde | Authority/rationale |
|---|---|---|---|---|---|
| `KUM` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | Approved PROJECT/DOMAIN POLICY; legacy PRAKSIS and delivery evidence preserved |
| `SAN` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | Approved PROJECT/DOMAIN POLICY; legacy PRAKSIS and delivery evidence preserved |
| `SLS` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | Approved PROJECT/DOMAIN POLICY; legacy PRAKSIS and delivery evidence preserved |
| `SLU` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | Approved PROJECT/DOMAIN POLICY; legacy PRAKSIS and delivery evidence preserved |
| `LOK` | `APPLICABLE` | `UNKNOWN` | `UNKNOWN` | `APPLICABLE` | `Byggemetode` and `Bredde` explicitly approved; legacy `Byggemetode` inclusion is PRAKSIS evidence, not STANDARD behavior |
| `KUMI`, `KOTREKUM`, `MKS`, `MKV`, `PMK`, `PMKAF`, `PMKOV`, `PMKSP`, `PMKVL`, `RED`, `SANI`, `SLG`, `SLI` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Current descriptions establish a reviewable kum/sluk identity family, not field applicability |
| Every other current point Tema | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | No positive mapping evidence reviewed; no closed-world complement |

The policy should be versioned independently from the v3.2 STANDARD list, for example with a stable policy ID, revision, effective date, approving role, decision record, and per-cell rationale. Changing a cell from `UNKNOWN` to `APPLICABLE` or `NOT_APPLICABLE` must be an explicit policy revision.

## 7. STANDARD, domain-policy, PRAKSIS, and UNKNOWN classification

| Claim | Classification |
|---|---|
| Current allowed values for `Kumform`, `Byggemetode`, and `Kjegle` | `STANDARD`; already implemented optional-if-present |
| Direct current `Bredde` field identity and its polygon-qualified source statement | `STANDARD`; format/requiredness not implemented |
| Exact Tema applicability for any of the four fields | Not supplied by `STANDARD` |
| Historical hardcoded subsets and Færder prevalence | `PRAKSIS` evidence |
| Approved explicit cells in section 6 | `PROJECT/DOMAIN POLICY`; no executable metadata added yet |
| Omitted cells | `UNKNOWN`, not `NOT_APPLICABLE` |
| Legacy warning for a supplied value outside a subset | `UNKNOWN`/provisional legacy behavior; do not restore automatically |

## 8. Allowed-value validation versus applicability and requiredness

These are separate questions:

1. **Allowed-value validation:** already active for `Kumform`, `Byggemetode`, and `Kjegle` as point-only, exact, optional-if-present STANDARD rules. Missing/null/empty values are not evaluated; an exact supplied current code passes; an invalid supplied value fails.
2. **Applicability:** the approved partial table answers whether a field is semantically relevant to an exact current Tema. It must return an explicit state and provenance.
3. **Requiredness:** not decided or implemented here. `APPLICABLE` is not `REQUIRED`. A later rule would need an independent authority for whether absence is a failure, advisory, or indeterminate and how exceptions such as `Bredde` polygon delineation are evaluated.

Target-field presence must never promote an `UNKNOWN` applicability cell. Likewise Type, geometry, frequency, neighboring objects, or a name substring must not fill a cell.

## 9. Unknown and unresolved cases

1. Whether `LOK` is positively not applicable or merely unknown for `Kumform` and `Kjegle`; no positive non-applicability evidence was found.
2. Whether current explicit kum/sluk specializations (`KUMI`, `KOTREKUM`, `MKS`, `MKV`, `PMK*`, `RED`, `SANI`, `SLG`, `SLI`) belong in any field's domain.
3. Whether `Kjegle` applies to all such structures or only a narrower structural subset.
4. Whether observed `STR` width/shape data represents valid applicability, adapter/export convention, or incidental population.
5. Whether `KRN` construction-method data represents a legitimate object-class rule or a delivery-specific convention.
6. What affirmative evidence would justify any `NOT_APPLICABLE` cell.
7. Whether an applicable field is required, recommended, or merely allowed for each Tema. This must be decided separately per field or policy family.
8. How `Bredde` requiredness should handle polygon delineation once applicability is known; the current GMI-only model cannot establish the exception.

## 10. Approved decisions and future domain-owner review

### Already approved

1. `KUM`, `SAN`, `SLS`, and `SLU` are `APPLICABLE` for each of `Byggemetode`, `Kumform`, `Kjegle`, and `Bredde`.
2. `LOK` is `APPLICABLE` for `Byggemetode` and `Bredde`, and remains `UNKNOWN` for `Kumform` and `Kjegle`.

### Still requiring future owner review

The following decisions remain open:

1. For each of `KUMI`, `KOTREKUM`, `MKS`, `MKV`, `PMK`, `PMKAF`, `PMKOV`, `PMKSP`, `PMKVL`, `RED`, `SANI`, `SLG`, and `SLI`, approve an explicit state separately for all four fields. Group approval is acceptable only if the owner explicitly defines and owns the group membership.
2. Decide whether `STR`, `KRN`, `KMR`, and `SUMP` require explicit review despite not being safe additions from the current evidence.
3. Confirm that applicability alone creates no missing-field finding and that requiredness remains a separate future decision.
4. Confirm that no omitted Tema is automatically `NOT_APPLICABLE` and that supplied values on `UNKNOWN` objects do not reproduce the legacy unexpected-value warning unless a separate advisory policy is approved.

## 11. Decision and audit history

- **Decision date:** 2026-09-04
- **Decision:** `LOK` → `Byggemetode` changed from proposed `UNKNOWN` to approved `APPLICABLE`.
- **Authority:** domain-owner project policy (`PROJECT/DOMAIN POLICY`), not STANDARD Innmålingsinstruks behavior.
- **Supporting evidence:** preserved legacy PRAKSIS subset plus explicit owner approval.
- **Requiredness:** remains unresolved and separate from applicability.

## 12. Recommended next implementation slice

Choose **A: explicit point-field applicability metadata only**:

- store exact current v3.2 Tema values only;
- store every approved cell explicitly as `APPLICABLE`, `NOT_APPLICABLE`, or `UNKNOWN` with authority and rationale;
- default unlisted/unsupported combinations to an explicit `UNKNOWN` result, never inferred `NOT_APPLICABLE`;
- version the project policy independently from the STANDARD registry;
- do not alter the three optional-if-present allowed-value rules;
- do not add missing-field findings or requiredness rules; and
- do not restore warnings for values supplied outside applicability.

Do not start with **B**, a generic reusable point-applicability helper. A frozen policy table and direct lookup are sufficient for the first metadata-only slice. Extract a reusable helper only when a second approved policy family or evaluator demonstrates shared state/provenance behavior. Do not choose **C** until field-specific requiredness, severity, exception behavior, and `UNKNOWN` handling have separately approved authority.

## 13. Expected registry and count impact

An applicability-metadata-only slice adds no active validation rule and no result row:

| Future slice | Active-rule delta | Point delta | Line delta | Resulting active / point / line |
|---|---:|---:|---:|---:|
| Versioned point-field applicability metadata only | `+0` | `+0` | `+0` | **29 / 22 / 21** |

A pure lookup/helper extracted later would also have `+0 / +0 / +0` impact. No requiredness count is assigned because no requiredness rule is authorized or designed. Any future active advisory or requiredness slice must state its actual evaluator/rule shape and recalculate counts from the 29/22/21 baseline rather than treating metadata cells as rules.

## 14. Final recommendation

Preserve the old subsets as named PRAKSIS provenance and use the approved section 6 table as the project/domain-policy baseline. `LOK` → `Byggemetode` is approved `APPLICABLE` by explicit owner decision, while the previous planning report's `UNKNOWN` state remains documented as the superseded pre-approval assessment. Do not label the mapping STANDARD, do not infer additions from current names, do not infer a negative complement, and do not implement requiredness. The remaining unapproved cells stay `UNKNOWN`.
