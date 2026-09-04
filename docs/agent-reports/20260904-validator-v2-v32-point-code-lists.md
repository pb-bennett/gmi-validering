# Validator 2.0 v3.2 point code-list validation

## Implementation scope

Implemented only the safe executable point-only, optional-if-present exact
code-list slice for `Kumform`, `Byggemetode`, and `Kjegle`. The existing direct
canonical bindings and generic `ALLOWED_VALUE` evaluator remain in use.

The exact independent oracle lists are:

- `Kumform`: `AN`, `F`, `FK`, `FR`, `N`, `R`, `X` (7)
- `Byggemetode`: `B`, `BU`, `E`, `E0`, `E1`, `G`, `K`, `M`, `MU`, `P`, `S`, `SU`, `UK`, `V`, `W` (15)
- `Kjegle`: `E`, `R`, `S`, `T`, `U` (5)

## Semantics and presentation

Absent, null, and exact empty-string values are `NOT_EVALUATED` and produce no
required-field finding. Current exact codes pass. Whitespace-only,
whitespace-padded, case-changed, unknown, legacy, and explanatory values fail;
there is no trimming, folding, rewriting, aliasing, substitution, or migration.

Each rule is an ordinary point result row. Field Info now documents point-only
scope, optionality for this automated slice, exact current values, strict
current-code policy, and active rule provenance. Sources are Vedlegg A p. 14
for `Kumform` and p. 15 for `Byggemetode` and `Kjegle`. Ordinary Fildata remains
available; its acceptance display now also supports optional `ALLOWED_VALUE`
rules.

## Independent oracle and tests

`tests/fixtures/validationV2GmiV32DomainValues.mjs` contains literal,
test-owned 7/15/5 lists and tests assert exact set/count parity against
production lists. Focused validation covered every current code, all optional
states and strict failures, ambiguous binding, point-only dispatch,
line-only/mixed isolation, result reconciliation, Field Info, and Fildata.

Focused result: **59/59 passed**.

## Registry counts

- Active: **29**
- Point-applicable: **22**
- Line-applicable: **21**

## Verification

- Full test suite: **284/285 passed; 1 failed**. The focused Validator 2.0 suite is green; the remaining failure is recorded as an unresolved full-suite verification issue.
- `npm run build`: **passed**.
- `git diff --check`: **passed** (normal LF/CRLF normalization warnings only).

## Scope confirmation and unresolved issues

No universal requiredness, applicability inference, shape/circular
classification, prefabrication classification, polygon or companion-GML
logic, GUID ownership, hydraulic classification, SDR/Ringstivhet/Trykklasse,
Bredde/Lengde, height, topology/stikkledning, Testmodus, deployment, or
production configuration changes were added.

The unresolved source/domain issues documented in the point-representation
plan remain unresolved, including semantic point scope and all conditional
requiredness/classification work.

## Remediation and final verification

The original full-suite failure was:
`tests/validationV2GmiA7.test.mjs` — “one result drives both geometry tabs
without rerunning and uses geometry-specific summaries”. The cause was a
stale point result-universe expectation containing the pre-slice 19 point
rule IDs. The implementation correctly returned the approved 22 point rows.
This was classification **B: stale test expectation**, not a production
regression.

Remediation changed only `tests/validationV2GmiA7.test.mjs`, adding the three
approved point rule IDs to that expected result universe. The `fieldData.js`
change was inspected and remains limited to ordinary Fildata acceptance for
optional `ALLOWED_VALUE` rules; required rules, relationships, line rules, and
unrelated fields retain their prior behavior.

- Targeted failing-file result: **8/8 passed**.
- Final focused point-slice result: **59/59 passed**.
- Final full-suite result: **285/285 passed**.
- Final build status: **passed** at the prior implementation checkpoint; no
  production/test code changed after that build, so it was not rerun.
- Final `git diff --check`: **passed**.

## Review-finding remediation

The Sol review found mojibaked Norwegian metadata in the three new point
code-list rules and masking assertions in `tests/validationV2GmiA8.test.mjs`.
The exact corrections were `nÃ¥r` → `når`, `vÃ¦re` → `være`, and
`InnmÃ¥lingsinstruks` → `Innmålingsinstruks` in the affected rule titles,
descriptions, and source-document strings.

The A8 expectations now use the exact Norwegian production titles:
`Kumform er gyldig når den er oppgitt`, `Byggemetode er gyldig når den er
oppgitt`, and `Kjegle er gyldig når den er oppgitt`. The skip for these three
rules was removed, and the source-document assertion now requires exactly
`Innmålingsinstruks Vedlegg A`; corrupted alternatives are rejected. Expected
metadata remains literal and is not derived from the production registry.

Files changed for this remediation:

- `src/lib/validation-v2/registry/rules.js`
- `tests/validationV2GmiA8.test.mjs`
- this implementation report

Remediation verification:

- Combined targeted `tests/validationV2GmiV32PointCodeLists.test.mjs` and
  `tests/validationV2GmiA8.test.mjs`: **31/31 passed** (6 point-code-list
  tests and 25 A8 tests).
- Full repository suite: **285/285 passed**.
- `npm run build`: **passed**.
- `git diff --check`: **passed**.

Registry counts remain **29 active**, **22 point-applicable**, and **21
line-applicable**. No semantic rule, Field Info, Fildata, presentation, or
unrelated registry metadata was changed.
