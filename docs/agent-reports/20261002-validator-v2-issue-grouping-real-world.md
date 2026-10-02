# Validator V2 issue grouping — real-world review

## Scope

Presentation-only review of Validator V2 finding identity, missing-value wording, counts and object selection. Work performed in one context without delegation. Before editing, verified branch `feature/real-world-validator-map-polish` and `git merge-base --is-ancestor dc03532 HEAD` succeeded. HEAD is `dc03532` (Map SOSI owner to canonical Eier).

The pre-existing modified `data/usage/aggregates.json` was left untouched. No reference material was edited, moved, staged or copied. No reset, restore, stash, clean, branch switch, commit or push was performed.

## Observed SDR problem

Created a focused dataset with three VL pressure pipes: PE100 without SDR, PVC without SDR, and PE100 with SDR `17`. All are registered UENDR. These materials and SDR value are supported by the existing rule data. Before editing production code, the new SDR assertion failed with actual diagnostic count **2**, expected **1**. Thus the fixture reproduced the observed separate Material cards through the actual validation runner and presentation owner.

## Existing architecture

Actual owners traced in this repository:

- `registry/rules.js`: canonical field, rule ID, evaluator policy and approved values.
- `registry/hydraulicTemaClassification.js`: pressure/gravity/SPECIAL Tema and approved SDR/Ringstivhet material families.
- `registry/pointFieldApplicability.js`: point Tema/field applicability cells.
- `fieldPolicy.js`: severity and structured reason assignment, including shared `constructionValueMissing` and `NON_NEW_REQUIRED_VALUE_MISSING`.
- `validationRunner.js`: builds policy contexts, evaluates each object, creates diagnostic facts and outcomes, and uses `createFinding` to retain object references, evidence, reason and per-object context. `createDiagnosticFacts` attaches Tema, Material, Rørform and Stedfestingsårsak context as appropriate.
- `diagnostics.js`: maps reasons to diagnostic categories; `createGroup`, `contextKey`, `addFinding` and `finalize` own visible diagnostic identity and object sets. `buildFieldDiagnosticsForRules` composes independent rule-owner models without erasing their identities.
- `fieldData.js` / `fieldDataPresentation.js`: value distribution and contextual outcome groups for the diagnostic detail table. This separate context-sensitive grouping is useful evidence, not the top-level issue-card identity.
- `ValidationV2FieldDetailContent.js`: Resultat coverage, diagnostic cards, `Detaljer` value distribution, and Regel tab. `DiagnosticBlock` uses diagnostic count for the card and complete `exactObjectRefs` for `Vis N objekter`.
- `ValidationV2Workspace.js`: passes the clicked diagnostic to `buildValidatorFieldInspectionRequest` in `tableInspection.js`.
- `tableInspection.js`: constructs evaluated field scope and the diagnostic's exact focus subset.
- `store.js` and `objectTableInspection.js`: create the contextual inspection, validate/deduplicate owned references and resolve the focused source rows. Existing map/table interaction receives the same object identities through this pathway.

No UI layout, tab, color or interaction code needed alteration.

## Root cause

The presentation ID was:

`canonicalFieldId | geometryScope | diagnosticType | state | ruleId | reasonCode | contextKey`

For contextual diagnostics, `contextKey` serialized the explanatory context values selected by `explanationContextFieldIds`. SDR and Ringstivhet select Tema and Material, so PE100 and PVC necessarily produced separate cards even with the same missing field, CHECK state, rule and reason. Trykklasse selects Tema and could similarly fragment identical missing findings across pressure Tema values.

Most other diagnostic categories already hide applicability values in their identity. The defect concerned contextual missing-value presentation rather than evaluation or coverage computation.

## Applicability context vs finding identity

Applicability remains owned by existing policies. Its source values are retained in immutable runner findings/outcomes and the detail-table model. Removing a value from card identity does not remove its evidence.

Merged groups also union their `contextFacts.context` values, so contextual wording for required missing findings does not accidentally describe all affected objects using just the first object's context. Source findings retain the full per-object association. The compact non-NYTT message deliberately uses field and count; Material remains available through source-object inspection and contextual diagnostic details.

## Revised grouping model

For these structured missing reasons:

- `NON_NEW_REQUIRED_VALUE_MISSING`
- `REQUIRED_VALUE_MISSING`
- `APPLICABILITY_REQUIRED_MISSING`

the context portion of identity now contains only `requirement` and `coverageApplicability`. These preserve required versus expected populations, including hydraulic SPECIAL versus applicable pressure pipes, while removing incidental Tema/Material/Rørform values.

Field, geometry, diagnostic category, normalized presentation severity, rule ID and reason code remain in the identity. Keeping rule IDs is conservative: independent validation owners can retain different corrective meanings. Identity never compares rendered messages. Other reason families retain their existing context handling.

`addFinding` now deduplicates known object-reference keys for every diagnostic group, rather than only the existing image-link special case. Counts and exact focus sets consequently agree. Findings without object references (such as schema-level findings) retain their existing counting behavior.

## SDR behavior

The observed fixture now produces one CHECK diagnostic with count 2 and exact refs for indexes 0 and 1. Its field summary remains `1 av 3 aktuelle trykkledninger har SDR`, with 2 missing and 33% coverage. The supplied-value object is outside the focused selection.

Tests also establish separate NYTT missing FEIL, non-NYTT missing SJEKK and supplied-invalid FEIL. Two NYTT pipes with PE100/PVC and VL/VLP consolidate into one missing FEIL without absorbing the non-NYTT SJEKK. Singular/plural wording is verified exactly.

## Ringstivhet behavior

Confirmed affected by the same Tema/Material key. Regression uses AF/PVC and OV/PP, all supported by the gravity Tema and Ringstivhet material rules. Their missing values consolidate into one SJEKK with count 2 and one exact selection. A supplied BAD value remains a separate FEIL. Duplicate finding evidence does not inflate the card count or selected set.

The existing non-new policy regression suite continues to verify NYTT missing Ringstivhet is FEIL, non-NYTT is SJEKK, non-applicable values retain their existing policy and unresolved dependencies remain unevaluated.

## Trykklasse behavior

Confirmed affected across Tema, not Material: the explanatory context includes Tema only and pressure-class policy does not require material resolution. Missing VL and SPP values now consolidate into one CHECK group, while an invalid supplied code remains a separate FEIL.

Trykklasse does **not** use the construction-value non-NYTT reason: missing applicable pressure values are CHECK under its existing policy even for NYTT. Its existing contextual wording remains. A SPECIAL AFS missing value remains separate from applicable pressure missing despite sharing `REQUIRED_VALUE_MISSING` and CHECK: `coverageApplicability` distinguishes EXPECTED from APPLICABLE. No uniform SDR policy was imposed on Trykklasse.

## Other conditional fields audited

| Field/rule family | Classification | Result |
| --- | --- | --- |
| SDR, Ringstivhet | Affected and fixed | Equivalent Tema/Material missing branches consolidate; reasons and severity remain separate. |
| Trykklasse | Affected and fixed | Equivalent pressure Tema branches consolidate; SPECIAL remains separate. |
| VertikalDimensjon | Affected and fixed | Missing required values for supported E/R shapes consolidate; S behavior and unresolved Rørform retain current evaluation. Regression includes invalid supplied input separately. |
| Point Byggemetode, Kjegle, Tykkelse, Avst_BunnInnvUnderUtv | Affected and fixed | KUM/SAN equivalent non-NYTT missing branches consolidate. Tests include separate NYTT missing and invalid supplied results. |
| Point Kumform and Bredde | Affected and fixed | KUM/SAN equivalent applicable missing results consolidate as FEIL. These strict fields remain FEIL regardless of NYTT status. |
| Line Tykkelse | Reviewed, already safe for differing applicability context | Unconditional missing policy has no explanatory context dimensions in its old key. Receives shared wording and general count deduplication; regression confirms invalid-value separation. |
| Material, Nett_type, Dimensjon, Rørform, Innvendig/Utvendig | Reviewed, already safe | Their own missing/invalid findings do not use differing contextual values as card identity. Their validation and allowed values are unchanged. Material and Rørform still determine applicability of other audited fields. |
| Adkomst | Reviewed, already safe | Missing review applies to KUM only, so no multiple applicable Tema branches currently fragment it. Unexpected supplied values retain context-sensitive handling. |
| Bilder / attachmentLink | Reviewed, already safe | Existing EXPECTED missing grouping already consolidates Tema; LOK/TOP supplied-image policy retains its explicit shared identity and action. |
| Type required on DIV | Reviewed, already safe | Required missing applies to DIV only. Its context wording remains supported. |
| Type optional missing / Type–Tema compatibility | Intentionally separate / retained | Optional Type findings retain existing Tema identities, explicit repository tests and Tema-dependent guidance/domain meaning. Compatibility retains its relationship-pair reporting and existing dedicated aggregation. This task does not collapse these into required/non-NYTT missing findings. |
| Anleggsår and date/cause relationships | Reviewed, already safe or intentionally separate by reason | Existing infrastructure missing uses its separate review reason; supplied date/year constraints and relationship reasons remain distinct. |
| Other ordinary supplied-value diagnostics | Reviewed, already safe | Existing hidden-context aggregation retains reason/rule distinctions and supplied-value evidence. |
| Unresolved prerequisites, binding/schema/source diagnostics | Intentionally separate | Existing dependency/schema presentation remains; it is not equivalent to a resolved applicable missing value. |

No uncertain rule-policy decisions required changes. The audit stays within Validator V2 and does not redesign its engine or optional Type guidance.

## Non-NYTT wording

One reusable `nonNewMissingText(count, name)` formatter is used by the structured shared reason. It uses the existing `objectCountText` and a dynamic display name.

Singular: `1 objekt mangler SDR. Objektet er ikke registrert som NYTT, og opplysningen kan derfor mangle for eksisterende anlegg. Kontroller dersom verdien er kjent.`

Plural: `2 objekter mangler SDR. Objektene er ikke registrert som NYTT, og opplysningen kan derfor mangle for eksisterende anlegg. Kontroller dersom verdien er kjent.`

The same explanation now applies to other fields using the reason, including point construction metadata and line Tykkelse. Existing presentation assertions were updated for this intentional wording change.

## Preserved validation policy

No changes to runner evaluation, field policies, parsing, NYTT detection, applicability tables, hydraulic classification, rule registry, code tables, required/optional decisions or supplied-value validation. Grouping operates only after outcomes and reasons are assigned.

NYTT SDR/Ringstivhet required missing remains FEIL; selected non-NYTT missing remains SJEKK. Supplied invalid remains its original FEIL. Strict point missing, Trykklasse's CHECK policy, SPECIAL behavior and unresolved dependencies are preserved by regression coverage.

## Object counts and selection

Each known object key contributes once per semantic group. `exactObjectRefs` unions both affected objects, `count` equals the unique count and `hasCompleteExactObjectRefs` stays true. Display samples remain bounded; exact runtime selection is not truncated.

New regression assertions run the same `buildValidatorFieldInspectionRequest` pathway as the button, then create a contextual object inspection and resolve its actual focused source rows. They assert exact indexes and unique keys, including exclusion of the SDR object with a supplied value and exclusion of invalid/other-severity findings. Existing object-table tests also pass.

Field coverage still comes from original outcomes, independent of card aggregation. Per-object evaluation counts and result severity calculations are unchanged. The evaluated field population remains available as table scope while the card selects only its affected focus subset.

## Tests

All commands redirect detailed logs to the temporary directory and print only summary results.

- New regression file: **14/14 passed**. Covers SDR A–F, NYTT consolidation, Ringstivhet, Trykklasse, line Tykkelse, VertikalDimensjon, six applicable point fields, duplicate findings and actual focused-row selection.
- Focused set: **84/84 passed, 0 failed**, across seven files: IssueGrouping, Diagnostics, NonNewMissingPolicy, WorkspaceInspector, FieldDetailExtraction, FieldDataPresentation and objectTableInspection.
- Full Validator V2: **279/279 passed, 0 failed**, across all 32 `tests/validationV2*.test.mjs` files.
- Runner: `node --loader ./tests/esmJsLoader.mjs --test --test-reporter=tap` followed by the focused files or the expanded full Validator file list.
- An initial focused run without the repository loader could not load extensionless imports used by objectTableInspection. Re-running with the existing loader resolved this; no production import changes were needed. No unrelated existing failures remained in the requested suites. The unrelated AppInfo contract was not changed.
- `git diff --check`: passed. Git emits existing LF/CRLF conversion notices, not whitespace errors.
- Production build: not run; optional for this Validator-focused pass.

## Manual acceptance

Reasoned from the actual card consumer and exercised diagnostic/selection data; no browser session is claimed.

SDR now feeds one `DiagnosticBlock`: SJEKK · 2 OBJEKTER, the exact plural explanation above, and one `Vis 2 objekter` button. Both source indexes 0 and 1 resolve from the button's focus subset. Coverage remains 1/3. PE100/PVC are retained in original object attributes and per-object diagnostic facts.

Ringstivhet equivalently feeds one SJEKK card with two missing objects and `Vis 2 objekter`, while any supplied invalid Ringstivhet remains a separate FEIL card. Resultat/Regel/Detaljer layout and colors are unchanged.

## Files changed

- `src/lib/validation-v2/diagnostics.js`: semantic missing identity, unique counts, context union and shared wording formatter.
- `tests/validationV2IssueGrouping.test.mjs`: focused real-world and conditional-field regressions.
- `tests/validationV2Diagnostics.test.mjs`: updated intentional shared non-NYTT wording assertions.
- `tests/validationV2NonNewMissingPolicy.test.mjs`: updated policy-message assertion.
- `docs/agent-reports/20261002-validator-v2-issue-grouping-real-world.md`: this report.

## Remaining issues

No failing Validator V2 tests or known unresolved grouping issue within the audited missing-value families. Browser visual acceptance and production build were not performed. Optional Type per-Tema grouping deliberately remains its established product behavior, and separate rule owners remain separate rather than assuming identical corrective actions.

## Final repository state

Branch remains `feature/real-world-validator-map-polish`; HEAD remains `dc03532`. No staging, commit or push.

Expected `git status --short`:

```text
 M data/usage/aggregates.json
 M src/lib/validation-v2/diagnostics.js
 M tests/validationV2Diagnostics.test.mjs
 M tests/validationV2NonNewMissingPolicy.test.mjs
?? docs/agent-reports/20261002-validator-v2-issue-grouping-real-world.md
?? tests/validationV2IssueGrouping.test.mjs
```

The runtime-data modification existed before this task and is not part of the implementation.
