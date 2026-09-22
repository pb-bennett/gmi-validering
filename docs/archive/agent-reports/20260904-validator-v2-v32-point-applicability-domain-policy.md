# Validator 2.0 v3.2 point-field applicability domain-policy review

**Review date:** 2026-09-04

**Current policy revision:** `2026-09-04.3`

**Scope:** planning and domain review only; no production code, tests, registry, commit, push, deployment, or production-configuration changes

**Repository checkpoint:** `feature/validator-v2-v32-baseline` at `2da5429`

**Current registry baseline:** 29 active rules; 22 point-applicable; 21 line-applicable

## Executive decision

The old validator did have the four reported Tema subsets. It treated missing values as failures for objects inside each subset and treated supplied values outside the subset as unexpected warnings/failing objects. The predicates were introduced in commit `2d2a2685` after analysis of 51 Færder Kommune GMI files (4,659 features). Neither the commit nor the analysis records why each boundary was chosen, and v3.2 supplies no exact Tema-to-field applicability map.

All five legacy Tema identities remain exact current v3.2 executable identities: `KUM`, `LOK`, `SAN`, `SLS`, and `SLU`. No alias or migration crosswalk is needed for those five. The legacy subsets remain useful PRAKSIS evidence, not STANDARD behavior. The domain owner has now approved the partial mapping below as PROJECT/DOMAIN POLICY, including `LOK` → `Byggemetode`.

The approved policy is explicit but remains deliberately limited to applicability:

- record `APPLICABLE` for `KUM`, `SAN`, `SLS`, and `SLU` for all four fields under the approved project policy;
- record `APPLICABLE` for `LOK` for `Byggemetode` and `Bredde` under the approved project policy;
- The earlier planning position for the two remaining LOK fields is superseded by policy revision `2026-09-04.3`: `Kumform` and `Kjegle` are now explicit positive `NOT_APPLICABLE` decisions.
- apply the additional explicit domain-owner decisions recorded below;
- retain `UNKNOWN` where no positive decision exists; and
- treat `NOT_APPLICABLE` as an explicit positive policy state, never as the complement of `APPLICABLE`.

This is an approved partial applicability policy only. It does not make any field required. This batch is the first approved `NOT_APPLICABLE` policy set. The current optional-if-present allowed-value rules for `Kumform`, `Byggemetode`, and `Kjegle` remain independent and unchanged. `Bredde` has no active format or requiredness rule.

The architecture decision remains **A: explicit, versioned point-field applicability metadata only**, with no requiredness rules and no generic helper until a concrete consumer requires one. The approved policy is now encoded in the completed 88-cell metadata extension; applicability remains metadata-only and is not wired into validation behavior.

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

### Pre-batch identity review queue and superseded state (historical context)

Before the batch decision, current descriptions identified the following as explicit kum/sluk variants or specializations. The state column records the pre-batch review position only and is superseded by the approved section 6 policy; it is not the current field state.

Everything in this subsection is historical pre-batch review context. It is superseded by the current approved policy in section 6 and must not be read as current executable metadata.

| Current Tema | Current description | Why it was in the pre-batch review queue | Pre-batch field state |
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

The pre-batch assessment could not justify additions as `APPLICABLE` from v3.2 or the preserved domain-owner statement. The subsequent explicit domain-owner batch decision now approves the exact additions recorded in section 6; they must not be generated from substrings such as `KUM` or `SL`.

Other plausible-sounding objects such as `KMR` (Kammer), `STR` (Stakerør), and `SUMP` (Sump) remain outside even that explicit-name queue unless the domain owner identifies them. `STR`'s observed field population is a review prompt, not authority.

## 5. Field-by-field assessment

### Byggemetode

- **Legacy:** `KUM/LOK/SAN/SLS/SLU`; missing values failed, outside supplied values were unexpected.
- **Provenance:** PRAKSIS, medium confidence. Introduced beside the Færder analysis with no exact rationale.
- **V3.2:** the 15 allowed values and the field's semantic point-table presence are STANDARD; the Tema subset is not.
- **Domain input:** positively supports `KUM`, sluk identities, and similar construction objects. The earlier input did not settle `LOK`; the explicit owner decision recorded in section 11 now does.
- **Current assessment:** `APPLICABLE` for `KUM`, `LOK`, `SAN`, `SLS`, `SLU`, `KUMI`, `SANI`, `SLI`, `SLG`, `KOTREKUM`, `MKS`, `MKV`, `PMK`, `PMKAF`, `PMKOV`, `PMKSP`, `PMKVL`, and `RED`; `NOT_APPLICABLE` for `STR` and `KRN`; `UNKNOWN` for `KMR` and `SUMP`. The additional mappings are explicit domain-owner policy, not STANDARD Innmålingsinstruks behavior.

### Kumform

- **Legacy:** `KUM/SAN/SLS/SLU`; missing values failed, outside supplied values were unexpected.
- **Provenance:** PRAKSIS, medium confidence. The apparent intent was to suppress false positives on objects for which chamber shape was not considered meaningful.
- **V3.2:** the seven allowed values and partial shape meaning are STANDARD; no Tema scope is supplied.
- **Current assessment:** approved project-policy `APPLICABLE` for `KUM`, `SAN`, `SLS`, `SLU`, and all 13 newly approved Tema in section 6; `LOK` is `NOT_APPLICABLE` for `Kumform`; `STR` and `KRN` are explicitly `NOT_APPLICABLE`. Do not infer applicability from a Tema name.

### Kjegle

- **Legacy:** `KUM/SAN/SLS/SLU`; missing values failed, outside supplied values were unexpected.
- **Provenance:** PRAKSIS, medium confidence. No comment or commit message resolves required versus advisory semantics.
- **V3.2:** the five allowed values, including `U` (no cone), are STANDARD; no Tema scope is supplied.
- **Current assessment:** approved project-policy `APPLICABLE` for `KUM`, `SAN`, `SLS`, `SLU`, and all 13 newly approved Tema in section 6; `LOK` is `NOT_APPLICABLE` for `Kjegle`; `STR` and `KRN` are explicitly `NOT_APPLICABLE`. The existence of a "no cone" value does not make applicability equivalent to requiredness.

### Bredde

- **Legacy:** `KUM/LOK/SAN/SLS/SLU`; missing values failed, outside supplied values were unexpected.
- **Provenance:** PRAKSIS, medium confidence. `LOK`, `SAN`, and `STR` had 100% presence in the corpus, but `STR` was excluded.
- **V3.2:** `Bredde` is a direct point property and the point overview says it is required except for polygon delineation. V3.2 does not provide the exact Tema scope, and current input cannot establish the polygon exception.
- **Current assessment:** approved project-policy `APPLICABLE` for `KUM`, `LOK`, `SAN`, `SLS`, `SLU`, and all 13 newly approved Tema, plus `STR`; `KRN` is explicitly `NOT_APPLICABLE`, while `KMR` and `SUMP` remain `UNKNOWN`. Applicability must not be confused with unconditional requiredness.

## 6. Proposed explicit policy table

This table is the approved partial PROJECT/DOMAIN POLICY artifact and is represented in the completed 88-cell metadata implementation. `APPLICABLE` means the field belongs to the Tema's domain; it does **not** mean required on every object. This batch contains the first approved `NOT_APPLICABLE` cells. `NOT_APPLICABLE` is always an explicit positive `PROJECT/DOMAIN POLICY` decision and is never inferred as the complement of `APPLICABLE`.

| Current v3.2 Tema | Byggemetode | Kumform | Kjegle | Bredde | Authority/rationale |
|---|---|---|---|---|---|
| `KUM` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | Approved PROJECT/DOMAIN POLICY; legacy PRAKSIS and delivery evidence preserved |
| `SAN` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | Approved PROJECT/DOMAIN POLICY; legacy PRAKSIS and delivery evidence preserved |
| `SLS` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | Approved PROJECT/DOMAIN POLICY; legacy PRAKSIS and delivery evidence preserved |
| `SLU` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | Approved PROJECT/DOMAIN POLICY; legacy PRAKSIS and delivery evidence preserved |
| `LOK` | `APPLICABLE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `APPLICABLE` | Explicit domain-owner decisions; `Kumform` and `Kjegle` are positive `NOT_APPLICABLE` policy states, not inferences from absent fields or complements; legacy `Byggemetode` inclusion is PRAKSIS evidence, not STANDARD behavior |
| `KUMI`, `KOTREKUM`, `MKS`, `MKV`, `PMK`, `PMKAF`, `PMKOV`, `PMKSP`, `PMKVL`, `RED`, `SANI`, `SLG`, `SLI` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | `APPLICABLE` | Explicit domain-owner `PROJECT/DOMAIN POLICY`; not STANDARD Innmålingsinstruks mapping |
| `STR` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `APPLICABLE` | Explicit domain-owner `PROJECT/DOMAIN POLICY`; historical population is PRAKSIS evidence only |
| `KRN` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | Explicit domain-owner `PROJECT/DOMAIN POLICY`; historical Byggemetode population is PRAKSIS evidence only |
| `KMR` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Explicitly unresolved; no positive policy decision |
| `SUMP` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Explicitly unresolved; no positive policy decision |
| Every other current point Tema | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | No positive mapping decision; no closed-world complement |

The policy should be versioned independently from the v3.2 STANDARD list, for example with a stable policy ID, revision, effective date, approving role, decision record, and per-cell rationale. Changing a cell from `UNKNOWN` to `APPLICABLE` or `NOT_APPLICABLE` must be an explicit policy revision.

## 7. STANDARD, domain-policy, PRAKSIS, and UNKNOWN classification

| Claim | Classification |
|---|---|
| Current allowed values for `Kumform`, `Byggemetode`, and `Kjegle` | `STANDARD`; already implemented optional-if-present |
| Direct current `Bredde` field identity and its polygon-qualified source statement | `STANDARD`; format/requiredness not implemented |
| Exact Tema applicability for any of the four fields | Not supplied by `STANDARD` |
| Historical hardcoded subsets and Færder prevalence | `PRAKSIS` evidence |
| Approved explicit cells in section 6 | `PROJECT/DOMAIN POLICY`; encoded in the completed 88-cell metadata extension, with no validation consumer |
| Omitted cells | `UNKNOWN`, not `NOT_APPLICABLE` |
| Legacy warning for a supplied value outside a subset | `UNKNOWN`/provisional legacy behavior; do not restore automatically |

## 8. Allowed-value validation versus applicability and requiredness

These are separate questions:

1. **Allowed-value validation:** already active for `Kumform`, `Byggemetode`, and `Kjegle` as point-only, exact, optional-if-present STANDARD rules. Missing/null/empty values are not evaluated; an exact supplied current code passes; an invalid supplied value fails.
2. **Applicability:** the approved partial table answers whether a field is semantically relevant to an exact current Tema. It must return an explicit state and provenance.
3. **Requiredness:** not decided or implemented here. `APPLICABLE` is not `REQUIRED`. A later rule would need an independent authority for whether absence is a failure, advisory, or indeterminate and how exceptions such as `Bredde` polygon delineation are evaluated.

Target-field presence must never promote an `UNKNOWN` applicability cell. Supplied fields on an `UNKNOWN` Tema must not be treated as unexpected merely because applicability is unknown. Likewise Type, geometry, frequency, neighboring objects, or a name substring must not fill a cell.

## 9. Unknown and unresolved cases

1. `KMR` remains `UNKNOWN` for all four fields and requires future owner review; no policy is inferred from its name.
2. `SUMP` remains `UNKNOWN` for all four fields and requires future owner review; no policy is inferred from its name.
3. Whether an applicable field is required, recommended, or merely allowed for each Tema. This remains a separate unresolved concern.
4. How `Bredde` requiredness should handle polygon delineation once applicability is known; the current GMI-only model cannot establish the exception.

## 10. Approved decisions and future domain-owner review

### Already approved

1. `KUM`, `SAN`, `SLS`, and `SLU` are `APPLICABLE` for each of `Byggemetode`, `Kumform`, `Kjegle`, and `Bredde`.
2. `LOK` is `APPLICABLE` for `Byggemetode` and `Bredde`, and is explicitly `NOT_APPLICABLE` for `Kumform` and `Kjegle` by the superseding revision recorded below.
3. The batch approval covers all four fields for the 13 Tema listed in section 6; `STR` is `NOT_APPLICABLE` for the first three fields and `APPLICABLE` for `Bredde`; `KRN` is `NOT_APPLICABLE` for all four fields.

### Still requiring future owner review

The following decisions remain open:

1. Review `KMR` and `SUMP`, retaining `UNKNOWN` unless the domain owner makes an explicit positive decision; do not infer policy from their names.
2. Confirm field-specific requiredness separately; applicability alone creates no missing-field finding.
3. Confirm how `Bredde` polygon-requiredness handling should work where relevant; the current GMI-only model cannot establish the exception.

## 11. Decision and audit history

- **Decision date:** 2026-09-04
- **Decision:** `LOK` → `Byggemetode` changed from proposed `UNKNOWN` to approved `APPLICABLE`.
- **Authority:** domain-owner project policy (`PROJECT/DOMAIN POLICY`), not STANDARD Innmålingsinstruks behavior.
- **Supporting evidence:** preserved legacy PRAKSIS subset plus explicit owner approval.
- **Requiredness:** remains unresolved and separate from applicability.
- **Batch decision:** the domain owner approved all four fields for `KUMI`, `SANI`, `SLI`, `SLG`, `KOTREKUM`, `MKS`, `MKV`, `PMK`, `PMKAF`, `PMKOV`, `PMKSP`, `PMKVL`, and `RED`; approved `STR` as `NOT_APPLICABLE` for the first three fields and `APPLICABLE` for `Bredde`; and approved `KRN` as `NOT_APPLICABLE` for all four fields.
- **Batch authority:** explicit `PROJECT/DOMAIN POLICY`, not STANDARD Innmålingsinstruks mapping. This is the first approved `NOT_APPLICABLE` policy set. Historical STR and KRN population remains PRAKSIS evidence and does not override these decisions.

### Later refinement — policy revision 2026-09-04.3

The domain owner explicitly decided that LOK has no `Kumform` or `Kjegle`. These two cells are now positive `NOT_APPLICABLE` PROJECT/DOMAIN POLICY decisions, superseding the earlier `UNKNOWN` state; they are not inferred from absent fields, legacy behavior, or a complement of `APPLICABLE`. KMR and SUMP remain `UNKNOWN` for all four fields.

## 12. Current metadata state and future work

The explicit, versioned point-field applicability metadata slice is complete at policy revision `2026-09-04.3`: 88 explicit cells comprising 71 `APPLICABLE`, 9 `NOT_APPLICABLE`, and 8 `UNKNOWN` states. The frozen policy table and exact lookup preserve the historical architecture decision **A: metadata only**, with omitted or unapproved combinations defaulting to `UNKNOWN` and no inference of `NOT_APPLICABLE`.

Future work, if approved, would consume the completed applicability metadata or address separate requiredness and representation concerns. Do not wire applicability into validation casually. Do not add missing-field findings, requiredness behavior, or other consumers without separate authority and an explicit design for severity, exceptions, and `UNKNOWN` handling. `APPLICABLE` is not `REQUIRED`, and `NOT_APPLICABLE` remains an explicit positive policy state only.

The existing optional-if-present allowed-value rules remain unchanged. Applicability remains metadata-only, with no validation consumer, requiredness consumer, or result-row impact; registry counts remain **29 active / 22 point / 21 line**.

## 13. Expected registry and count impact

Extending the existing versioned applicability metadata only adds no active validation rule and no result row:

| Completed metadata slice | Active-rule delta | Point delta | Line delta | Resulting active / point / line |
|---|---:|---:|---:|---:|
| Versioned point-field applicability metadata only | `+0` | `+0` | `+0` | **29 / 22 / 21** |

A pure lookup/helper extracted later would also have `+0 / +0 / +0` impact. No requiredness count is assigned because no requiredness rule is authorized or designed. Any future active advisory or requiredness slice must state its actual evaluator/rule shape and recalculate counts from the 29/22/21 baseline rather than treating metadata cells as rules.

The approved table contains **71 `APPLICABLE` cells, 9 `NOT_APPLICABLE` cells, and 8 `UNKNOWN` cells** across the explicitly listed Tema rows (88 cells total). The `UNKNOWN` total consists of the deliberately reviewed-but-unresolved `KMR` and `SUMP` cells. These are metadata cells, not executable rules. Future active advisory or requiredness work must recalculate counts from the 29/22/21 baseline.

## 14. Final recommendation

The batch additionally makes `KMR` and `SUMP` explicitly unresolved (`UNKNOWN` for all four fields). The approved `STR` and `KRN` states are positive policy decisions rather than conclusions drawn from historical population. The versioned metadata extension is now complete at 88 explicit cells. Future work, if approved, would consume the applicability metadata; applicability must not be wired into validation casually, and it still has no validation or requiredness consumer. No missing-field behavior is driven by applicability.

Preserve the old subsets as named PRAKSIS provenance and use the approved section 6 table as the project/domain-policy baseline. `LOK` → `Byggemetode` is approved `APPLICABLE` by explicit owner decision, while the previous planning report's `UNKNOWN` state remains documented as the superseded pre-approval assessment. Do not label the mapping STANDARD, do not infer additions from current names, do not infer a negative complement, and do not implement requiredness. The remaining unapproved cells stay `UNKNOWN`.
