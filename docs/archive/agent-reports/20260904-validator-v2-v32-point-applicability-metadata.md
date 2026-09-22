# Validator 2.0 v3.2 point-field applicability metadata

## Scope

Implemented the approved metadata-only point-field applicability slice. No active validation rules, result rows, requiredness, validation wiring, UI behavior, or Tema resolver behavior was added or changed.

## Representation

The policy is a frozen JavaScript registry artifact at `src/lib/validation-v2/registry/pointFieldApplicability.js`, exported through the Validator 2.0 index. A direct exact-key accessor returns the explicit cell or an UNKNOWN default. This is intentionally policy-specific and avoids a generic applicability engine before there is a second approved policy consumer.

## Exact approved mapping

Using canonical field IDs `constructionMethod`, `manholeShape`, `cone`, and `width` (the established canonical identity for `Bredde`):

- `KUM`, `SAN`, `SLS`, `SLU`: all four fields are `APPLICABLE`.
- `LOK`: `constructionMethod` and `width` are `APPLICABLE`; `manholeShape` and `cone` are `UNKNOWN`.

No `NOT_APPLICABLE` cell is present.

## Authority and provenance

Policy ID: `validator-2-point-field-applicability`; policy version `3.2.0`; revision `2026-09-04.1`; effective and decision date `2026-09-04`. Authority is `PROJECT/DOMAIN POLICY`, explicitly distinguished from `NOT_STANDARD_INNMALINGSINSTRUKS_BEHAVIOR`. Legacy behavior is retained as separate `PRAKSIS` provenance, with rationale on each explicit cell.

## UNKNOWN/default semantics

Lookup is exact and performs no alias, case, whitespace, Type, geometry, presence, frequency, prefix, or related-object inference. Unlisted current or unsupported Tema/field combinations return `UNKNOWN`, never an inferred `NOT_APPLICABLE`. LOK’s two unresolved cells are explicitly recorded as UNKNOWN.

`APPLICABLE` is not `REQUIRED`; requiredness remains a separate concern.

## Files changed

- `src/lib/validation-v2/registry/pointFieldApplicability.js`
- `src/lib/validation-v2/index.js`
- `tests/validationV2PointFieldApplicability.test.mjs`
- `docs/agent-reports/20260904-validator-v2-v32-point-applicability-metadata.md`

## Tests and counts

Focused tests cover the approved cells, LOK UNKNOWN cells, unrelated/unknown Tema behavior, no NOT_APPLICABLE inference, exact identity, policy authority/provenance, and the unchanged active registry/result shape.

Registry counts remain **29 active / 22 point / 21 line**.

## Unchanged and deferred

Validation execution, missing-field findings, Field Info requiredness, Fildata acceptance, result summaries, UI, and Tema resolution are unchanged. Deferred work includes any applicability consumer, requiredness policy, NOT_APPLICABLE decisions, and review of other Tema families.

## Review-finding remediation

The Sol review findings were corrected before commit:

- Finding 1: corrected only the `LOK` × `width` rationale. It now identifies the field as `width / Bredde`, records that LOK was included in the legacy Bredde applicability subset as PRAKSIS evidence, states that LOK × Bredde is explicitly approved by PROJECT/DOMAIN POLICY, and states that it is not STANDARD Innmålingsinstruks behavior. The state remains `APPLICABLE`.
- Finding 2: strengthened `tests/validationV2PointFieldApplicability.test.mjs` with an independent, test-owned literal inventory of all 20 explicit Tema/field/state triples, including exact inventory, uniqueness, duplicate-pair, and no-additional-cell assertions.

Explicit policy counts remain **18 APPLICABLE / 2 UNKNOWN / 0 NOT_APPLICABLE**.

Files changed:

- `src/lib/validation-v2/registry/pointFieldApplicability.js`
- `tests/validationV2PointFieldApplicability.test.mjs`
- `docs/agent-reports/20260904-validator-v2-v32-point-applicability-metadata.md`

Verification:

- Focused test: `node --test tests/validationV2PointFieldApplicability.test.mjs` — **8/8 passed**.
- Full repository suite: `node --test` over all `tests/*.test.mjs` files — **293/293 passed**.
- `npm run build` — **passed**.
- `git diff --check` — **passed**.
