# InnvendigUtvendig conditional on Bredde

Timestamp: 2026-11-10 13:42:08 Europe/Oslo.
Repository: `C:\GitHub\gmi-validering-test`; branch `feature/photo-workspace`; starting HEAD `f9bb779`. Working tree was clean. No commit or push performed.

## Root cause and implementation

The shared Validator V2 `insideOutside` policy previously passed through generic mandatory-field evaluation before inspecting any related dimension. Consequently, an absent point qualifier always produced `FAIL / REQUIRED_VALUE_MISSING`, including objects without Bredde.

The existing point rule now evaluates normalized Bredde evidence before deciding whether the qualifier is required. It uses the existing field binding, exact ID/OD code list, missing-value detection, Tema identity resolution, severity states, diagnostic reason codes and finding owner `innmaling.point.inside-outside.valid`. No parallel rule or framework was added. Rettinger's local `createGmiObjectValidator` uses the same policy context and evaluator, so it receives the correction without UI or editing-engine changes.

| Point Bredde | Qualifier | Result |
| --- | --- | --- |
| Missing/blank | Missing/blank | PASS, no qualifier finding |
| Populated | Missing/blank | FEIL / REQUIRED_VALUE_MISSING |
| Missing/blank | ID or OD | SJEKK / APPLICABILITY_UNEXPECTED_VALUE |
| Populated | ID or OD | PASS, except Tema recommendations below |
| Either | Unsupported supplied code | FEIL / VALUE_NOT_ALLOWED |

Numeric zero and string `0` are populated dimensions. Invalid dimensions also remain populated for this dependency; the independent Bredde rule assesses their validity. Structural ambiguity/unavailable bindings retain existing review handling. Qualifier code validation takes precedence over an additional missing-dimension warning, preventing duplicate findings for that problem.

Bredde applicability and numeric policies are unchanged: missing KUM/LOK Bredde remains FEIL; missing GUT Bredde remains SJEKK. These objects no longer receive an additional missing-qualifier finding without Bredde. Line qualifier requirements and exact allowed-code handling are unchanged.

## Tema conventions and evidence

With Bredde supplied, KUM normally reports its internal dimension: ID passes, OD receives SJEKK. LOK normally reports its external dimension: OD passes, ID receives SJEKK. Norwegian diagnostics ask the user to check the actual measurement. These are project/domain recommendations, not automatic proof of an error; no contractor values are assigned or corrected. Other Tema receive neither recommendation. Missing, invalid or conflicting Tema identities do not trigger an inferred recommendation; S_FCODE fallback uses the existing resolved identity.

`src/data/validation-v2/authoritative-value-tables.js` defines ID as “Punktets bredde er innvendig” and OD as “Punktets bredde er utvendig”. This supports the dimension dependency. The earlier deliberate validator policy in section 23 of `docs/validation-v2/validator-v2-v32-manual-decisions.md` explicitly required the field on all points and lines. That older project decision contradicts the newly agreed conditional point requirement, and has been explicitly superseded in that section. No inspected evidence established an opposing mandatory KUM/LOK code convention; the recommendations are recorded as project/domain policy rather than attributed to the code list.

## Changed files

- `src/lib/validation-v2/fieldPolicy.js`: conditional point policy and KUM/LOK review recommendations.
- `src/lib/validation-v2/validationRunner.js`: normalized width evidence in shared policy context and Tema context for qualifier diagnostics.
- `src/lib/validation-v2/diagnostics.js`: Norwegian qualifier diagnostics and separate grouping of the two Tema recommendations.
- `src/lib/validation-v2/registry/rules.js`: revised point rule description; existing ID retained.
- `src/lib/validation-v2/registry/fieldInformation.js`: corrected field guidance.
- `tests/validationV2InsideOutsideWidth.test.mjs`: targeted presence/code/Tema matrix, numeric zero and invalid-width controls, unique-case binding, Tema fallback/conflict controls, local/full parity, source preservation, duplicate-finding checks, diagnostics and date/vertical-level controls.
- `tests/validationV2GmiV32Batch1.test.mjs`: supply Bredde for the accepted point qualifier control; retain mandatory line control.
- `tests/validationV2NonNewMissingPolicy.test.mjs`: update obsolete unconditional qualifier expectations while retaining independent required-field checks.
- `tests/validationV2FieldDataPresentation.test.mjs`: supply Bredde in the existing presentation fixture so it continues testing genuine missing-qualifier errors and accepted ID values.
- `docs/validation-v2/validator-v2-v32-manual-decisions.md`: supersede section 23's universal point requirement.
- This report.

## Verification

| Check | Result |
| --- | --- |
| New focused rule tests | 4 passed, 0 failed; nested matrices cover all requested combinations |
| Focused existing/new regression group | 80 passed, 0 failed |
| All `tests/validationV2*.test.mjs` | 291 total: 288 passed, 3 known baseline failures |
| `tests/gmi*Editing*.test.mjs` and `tests/gmiEdit*.test.mjs` | 151 total: 141 passed, 0 failed, 10 skipped |
| Production `npm.cmd run build` | Passed with network access; initial restricted attempt failed fetching Roboto from Google Fonts |
| Targeted ESLint on all 9 changed/new JS and test files | Passed, no findings |
| `git diff --check` | Passed; Git may emit LF/CRLF conversion notices |

Focused regression command:

```powershell
node --test tests/validationV2InsideOutsideWidth.test.mjs tests/validationV2ContractorRuleCorrections.test.mjs tests/validationV2PointFieldApplicability.test.mjs tests/validationV2GmiV32Batch1.test.mjs tests/validationV2GmiV32Batch2.test.mjs tests/validationV2Diagnostics.test.mjs tests/validationV2RealDataCorrections.test.mjs tests/validationV2NonNewMissingPolicy.test.mjs tests/validationV2FieldDataPresentation.test.mjs
```

The focused group includes existing GUT/KUM/LOK applicability, Datafangstdato and Vertikalnivå tests. The integration group includes local object evaluation, editing/revalidation and original/proposed Validator comparisons. The skipped tests require optional browser conditions; browser acceptance was not performed.

Known baseline failures are all in unchanged `tests/validationV2WorkspaceInspector.test.mjs`, also documented in `docs/agent-reports/20261107-132524-validator-contractor-rule-corrections.md`:

1. `normal sidebar width is preserved and shared by the Validator and docked inspector`.
2. `workspace shell places a full-height left list beside a shared upper row and full-width bottom dock`.
3. `2D map resize invalidation and parent-sized 3D canvas remain in place`.

These are source/layout assertions against unchanged UI files. The final broad run has exactly those three failures. An initial additional field-presentation failure reflected its old unconditional test fixture; supplying Bredde fixed the fixture without changing presentation code.

Logs are in the machine's temporary directory: `innvendig-focused-tests.log`, `innvendig-validator-final.log`, `innvendig-integration-tests.log`, `innvendig-build-retry.log`, and `innvendig-before-after.log`.

## Reproducible before/after comparison

An eight-point synthetic fixture produced **8 → 3** `REQUIRED_VALUE_MISSING` qualifier failures when compared with the actual policy source from `f9bb779`. Five objects (KUM, LOK, DIV, GRN, GUT) have neither field; three (KUM, LOK, DIV) have Bredde `1000` and no qualifier. Only the latter three remain qualifier errors. Existing Bredde findings on the first group remain independent.

Run from the repository in PowerShell; the script loads the historical evaluator in memory and does not change files:

```powershell
@'
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runGmiValidationV2, bindGmiLayerSchema, extractGmiObjectFieldValue } from './src/lib/validation-v2/index.js';
import { getDatasetRevision } from './src/lib/validation-v2/datasetRevision.js';
const source = execFileSync('git', ['show', 'f9bb779:src/lib/validation-v2/fieldPolicy.js'], { encoding: 'utf8' })
  .replace(/from '(\.\/[^']+)'/g, (_, relative) => `from '${pathToFileURL(path.resolve('src/lib/validation-v2', relative)).href}'`);
const baseline = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const records = [
  ...['KUM', 'LOK', 'DIV', 'GRN', 'GUT'].map(Tema => ({ Tema })),
  ...['KUM', 'LOK', 'DIV'].map(Tema => ({ Tema, Bredde: '1000' })),
];
const dataset = { points: records.map(attributes => ({ attributes })), lines: [],
  fieldAnalysis: { points: { Tema: {}, Bredde: {}, InnvendigUtvendig: {} }, lines: {} } };
const input = { layerId: 'comparison', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-11-10' };
const result = runGmiValidationV2(input), schemaBinding = bindGmiLayerSchema(input);
const owner = result.ruleResults.find(r => r.rule.ruleId === 'innmaling.point.inside-outside.valid');
const after = result.outcomes.filter(o => o.ruleId === owner.rule.ruleId);
const before = after.map(outcome => baseline.evaluateFieldPolicy(extractGmiObjectFieldValue({
  ...input, schemaBinding, objectRef: outcome.objectRef, canonicalFieldId: 'insideOutside',
}), 'insideOutside', owner.rule));
const count = values => values.filter(v => v.state === 'FAIL' && v.reasonCode === 'REQUIRED_VALUE_MISSING').length;
console.log({ missingQualifierBefore: count(before), missingQualifierAfter: count(after) });
'@ | node --input-type=module
```

## Remaining uncertainty and manual Preview acceptance

The real `20261109 Som bygget-VA ledninger_Øvre Smidsrødvei.gmi` was not found in the repository, including ignored/hidden workspace files. No real-file contents or counts were assumed and no external-file dependency was added. Its observed approximate 67/73 count is user-provided background, not a verified result of this run.

1. In Preview, import the actual delivery and open Validator. Inspect DIV/GRN and other points without either field: no missing-InnvendigUtvendig finding should appear.
2. Inspect KUM/LOK with Bredde and no qualifier: confirm FEIL and the instruction to supply ID/OD. Confirm absent KUM/LOK Bredde still produces its own FEIL without an additional missing qualifier error.
3. Inspect KUM with ID/OD and LOK with OD/ID when Bredde exists: expected combinations pass; opposite combinations give SJEKK with the relevant Norwegian measurement question.
4. Using disposable synthetic input or an existing review draft, inspect qualifier-only ID/OD, unsupported codes and Bredde zero. Expect SJEKK, FEIL and a populated-width dependency respectively. Do not assign codes automatically or overwrite contractor source files.
5. Inspect the same objects in Rettinger's local Validator and compare statuses/messages. Confirm one finding per qualifier problem and that KUM/LOK review groups remain distinguishable.
6. Confirm missing GUT Bredde remains SJEKK and previously accepted Datafangstdato/Vertikalnivå values remain accepted. Record actual missing-qualifier counts before/after against the same delivery for final acceptance.

No Rettinger UI, editing engine, Data Table, FOTO/export behavior, GMI source files or unrelated validation rules were modified.
