# Executive summary

Reviewed 2026-09-09 on `feature/validator-v2-v32-baseline`, HEAD `0aaded2`.

Authority: [manual decisions](../validation-v2/validator-v2-v32-manual-decisions.md). Reviewed test inputs: [manifest](../../tests/fixtures/gmi-v32/manifest.json), [fixture README](../../tests/fixtures/gmi-v32/README.md), [integrity test](../../tests/validationV2SyntheticGmiFixtures.test.mjs), [synthetic report](20260909-validator-v2-v32-synthetic-gmi-test-suite.md), and [real-corpus report](20260909-validator-v2-real-gmi-corpus-test-investigation.md).

The 41-field manual baseline is sufficiently settled to start shared infrastructure and most rules, but **not yet a fully unambiguous implementation contract**. Finish in **four substantial batches**, then one thorough Sol review. Extend the existing engine; a rewrite is unnecessary.

The synthetic files are useful, small, apparently entirely fabricated parser inputs. They are **not yet a trustworthy executable oracle**. The manifest is primarily a scenario catalogue: combined fields, reference ranges, and slash-separated outcomes cannot establish individual expected results. This review identifies **12 grouped fixture/oracle issues**, including a malformed clean control, unsupported coverage claims, and an upload-encoding mismatch. Correct these from the manual policy, never from baseline runtime output.

Main architectural recommendations:

- Preserve canonical bindings, raw lexemes, ObjectRefs, layer/revision ownership, geometry isolation, and immutable results.
- Add explicit Sjekk evaluations and compact per-object outcomes; distinguish valid-but-unusual values from unavailable prerequisites. Make Fildata consume completed contextual outcomes.
- Extend the existing Tema resolver into a shared validated identity gate. It already rejects disagreement without choosing a winner. Add schema coexistence reporting and suppress duplicate dependent findings.
- Consume one applicability table and share explicit year/date, pipe-shape, and hydraulic facts. Do not build a generic dependency scheduler.
- Activate exact assertions progressively; finish all resolved-policy assertions by batch 4.

The two known domain decisions remain: the complete gravity Tema inventory and integer versus decimal line Tykkelse. Additional narrow clarification is needed for Bredde applicability, invalid-plus-conflicting Tema sources, uncertain construction years, and unspecified hydraulic/decimal cases. These block affected cells, not all implementation.

## Inspection and verification

Read the complete manual, both supplied research reports, README, complete manifest, all twelve GMI files, and the fixture integrity test. Inspected the V2 modules, parser and upload entry, UI/Fildata consumers, every relevant V2 test file's coverage and affected assertions, and the local manifest's structure and safe scenario metadata. No real GMI contents were copied or needed for this review.

Initial worktree: `.gitignore` is the only modified tracked file; its existing change ignores `/local-research/`. Untracked work includes the manual, both September 9 reports, the synthetic directory/test, the corpus research script/test, and two unrelated September 7 architecture reports. Existing runtime and V2 tests are tracked. The local real manifest is ignored and lists 17 distinct paths. Recent commits include the Merknad consistency fix, point batches 1/2, integer lexical validation, and applicability refinements. All are preserved.

Checks run:

- `node --test tests/validationV2SyntheticGmiFixtures.test.mjs`: 3/3 passed.
- Focused V2 suite using `node --loader ./tests/esmJsLoader.mjs --test --test-reporter=dot` with all `validationV2*.test.mjs` paths: passed.
- Read-only parser probes confirmed counts, zero parser warnings/errors for the success fixtures, the clean LOK field placement, and truncated-record padding.
- Reproduced the upload decoding mismatch with the same Latin-1 decoder used by the app.
- No full repository suite/build was necessary for a planning-only change. `git diff --check` is the final document check.

# Current architecture assessment

The current route is `FileUpload.js` → `GMIParser.toObject()` → selected layer → `createValidationV2Input()` → `bindGmiLayerSchema()` / `createGmiObjectRefs()` → A3 Tema resolution or A4 extraction → runner/evaluators → immutable rule results → geometry presentation and lazy Fildata.

| Existing component | Reuse and necessary adjustment |
|---|---|
| `parsing/gmiParser.js`, `gmiLexicalEvidence.js` | Parser preserves literal field names, converts ordinary values, and retains original `_FIELDVALUES` spellings under a non-enumerable Symbol. Keep lexemes authoritative for exact codes, integers, dates, and text length. Do not validate numeric spelling from coerced floats. Address fixture byte encoding before upload QA. |
| `registry/fields.js`, `registry/registry.js` | Exactly 41 canonical fields, independent geometry scopes, explicit accepted and unsupported sources. Keep identity and alias policy. Header case matching is distinct from forbidden value normalization. |
| `gmiLayerSchemaBinding.js` | Uses explicit `fieldAnalysis`, with same-geometry attribute-key fallback. Retains all accepted candidates and structural ambiguity. Reuse; do not make binding decide applicability. |
| `objectRef.js`, `datasetRevision.js` | Collision-resistant layer/revision/geometry/index ownership; immutable refs and dataset-instance revision. Keep. Never use GMI IDs, names, coordinates, or hashes as object identity. |
| `objectFieldValue.js`, `valueSemantics.js` | Preserves absent schema versus missing value, lexical conflicts, unsupported aliases, and evidence ownership. Keep low-level missing semantics; handle whitespace-only text deliberately at policy level. Preserve the recent whitespace-Merknad fix. |
| `temaIdentity.js` | Already returns `CONFLICT`, null resolved value, and no preferred key on disagreement. A preferred provenance key on agreement is harmless. Resolution itself does not establish code-list validity: add a validated fact above it. |
| `registry/rules.js`, `ruleEvaluation.js` | 45 rules, 38 point scopes and 21 line scopes. Lists and pure lexical evaluators are useful. Many active rules are presence-only or format-only and must become full policy evaluations. Current registry only admits severity ERROR and provenance STANDARD; project policy needs truthful provenance. |
| `validationRunner.js` | Owns evidence cache and result projection. Currently loops rules and retains findings only for FAIL/INDETERMINATE. Add CHECK, compact outcomes for every evaluated object, run date/policy identity, and layer/schema findings. |
| Relationship evaluator | Only supports two-input allowed pairs and re-evaluates list prerequisites. It suppresses failed prerequisites but repeats indeterminate Tema conflicts as relationship findings. Reuse Type pair data; extend through small shared facts rather than forcing dates and three-field hydraulics into this pair contract. |
| `resultPresentation.js`, `uiIntegration.js`, V2 components | Existing aggregation is Oppfylt/Delvis oppfylt/Ikke oppfylt; mixed passes and errors become amber. Rule details explicitly say “Må rettes”, “Må vurderes”, and “Ikke kontrollert”. Replace validation outcomes consistently with Pass/Sjekk/Feil. |
| `fieldData.js`, `registry/fieldInformation.js`, `data/validation-v2/field-information.json` | Lazy, bounded, ownership-checked value counts are useful. Fildata currently re-evaluates one field and chooses the first acceptance for a value bucket. That is unsafe when the same value has different outcomes by Tema or year. Requiredness is inferred from evaluator kind, so conditional requiredness needs explicit metadata. |

Keep V1 as the existing default, V2 GMI-only and selected-layer-only, and geometry-tab changes free of reruns. There is no reason to add map/table navigation or validation of other formats.

Recommended result design: add `CHECK` alongside existing engine states, and retain `NOT_EVALUATED` internally for suppressed judgments with an owner/reason. Optional absence is a real Pass. `INDETERMINATE` can remain an internal structural-evidence state projected to Sjekk at its owning control. Do not equate every Sjekk with an unusable prerequisite. A valid uncommon Material or Rørform A/X is still usable.

Use one practical field-policy owner per object/geometry where possible, composing lexical, requiredness and relationship checks. Existing helper tests can remain even when standalone format rows are consolidated. Preserve rule IDs when semantics remain compatible; document retired IDs and update Field Info references when consolidation changes ownership. Do not retain duplicate rows merely to preserve historic 45/38/21 totals.

Store compact outcome records with ObjectRef, state, reason and suppression ownership; keep raw evidence out of the general outcome matrix. This gives exact Pass assertions and Fildata a shared source. Count equations must include CHECK and internal suppression. Schema findings belong to the layer/revision, with affected schema scopes, not an invented ObjectRef or an error copied to every object.

Recommended aggregate semantics: any Feil → Feil; otherwise any owning Sjekk → Sjekk; otherwise evaluated policy passes → Pass. Empty geometries have an empty view. Suppressed-only dependent controls should point to the upstream owner without a new status badge or repeated warning. Do not present suppression as a successful validation.

# Manual-spec review findings

The exact listed code partitions, integer boundaries, optional fields, informational Sjekk, line/point scope and main dependency ownership are clear. The following need explicit treatment:

1. **Applicability authority drift.** Current metadata makes `STR × Bredde` APPLICABLE; the consolidated manual's shared set says STR is NOT_APPLICABLE. The manual takes precedence: record this as a deliberate policy migration, not an incidental test edit. `LOK × Bredde` is also APPLICABLE in existing metadata, while the manual names LOK overrides only for Byggemetode/Kumform/Kjegle and calls unclassified combinations UNKNOWN. Confirm whether the old width exception survives. Tykkelse/Avst can follow the manual's core set, STR/KRN exclusions and UNKNOWN default; do not inherit LOK width applicability into them.
2. **Invalid Tema plus disagreement.** “Supplied invalid → Feil” and “both disagree → Sjekk” overlap for `KUM/BAD` or two different invalid codes. Confirm precedence. Proposal: Tema owns invalid-source Feil, remains unresolved, retains conflict evidence; two valid disagreeing sources produce Sjekk. No dependent compatibility findings in either case. Equal invalid codes must still fail.
3. **Usable installation years.** Clarify whether an exact non-future year with a plausibility Sjekk, such as old NYTT, 1899 or 0000, is a usable year for date ordering and the delivery-year set. “Valid year” versus “missing/uncertain” does not define that boundary. Also specify missing/invalid Stedfestingsårsak plus missing Anleggsår: do not silently equate an invalid cause with a valid non-NYTT code. Proposal: keep validity separate from age warnings, but treat 0000 as uncertain for relationships; this is a proposal, not implemented policy.
4. **Uncertain hydraulic states.** The full gravity list remains open. Special Tema outcomes for SDR/Trykklasse are not fully specified; Ringstivhet says Sjekk “where” confirmation is needed without an exact absent/present/material matrix. Proposal: valid supplied or absent hydraulic field under suction/special uncertainty yields Sjekk; supplied invalid codes still Feil. Confirm particularly special SDR/PN absence and uncertain Tema with non-plastic material.
5. **Numeric spelling beyond settled grammar.** Existing integer spelling permits signs/leading zeros and checks domain separately. Keep this unless changed: NOBB has no positivity or digit-length restriction. Avst explicitly accepts integer, dot and comma decimals; existing evaluator leaves `.5`, `1.`, exponent notation and padded numbers indeterminate. The manual calls malformed values Feil but does not expressly settle those spellings. Confirm whether to restrict to the existing plain signed decimal grammar and fail other supplied forms. Do not silently broaden it through `Number()`.
6. **Dates and time.** Capture one reference date at run start, injected as `2026-09-09` in fixtures. Production must be dynamic. Define five years as a calendar anniversary, not 5×365 days; choose/document a leap-day anniversary convention. Clarify the year-validity question above before relationship edge cases. Date ordering Feil takes precedence over age Sjekk.
7. **Source wording is not policy authority.** Keep line Tykkelse integer pending the explicit decision, point Utvendig_høyde optional, InnvendigUtvendig required in both geometries, and height method 97 as an approved Sjekk exception outside the official height list. Do not relabel that exception as an official code.

# Synthetic-suite review

## Design and actual inventory

There are 12 files: nine validator fixtures, two throwing parser fixtures and one successful truncated parser fixture. Thus ten parser-success inputs, not nine if the truncated input is counted. The manifest contains **30 scenario IDs**, of which 27 are validator scenarios and three parser scenarios; the request's “28” is stale.

The nine validator fixtures contain 33 points and 19 lines. The truncated file adds one point. All documented parser counts match. Simple two-vertex lines, regular synthetic coordinates, reserved `.invalid` URLs, invented names/text and small source IDs make the files understandable and privacy-safe on inspection. The blacklist test alone is not proof of privacy.

Sparse schemas in boundary fixtures intentionally cause other required-field findings. They are useful only with explicitly scoped expectations; they cannot be treated as whole-file clean deliveries. `comprehensive-bad` has two points/two lines, coherent independent faults and useful missing-data stress. Preserve it, but distinguish independent invalid hydraulic/vertical values from suppressed relationship judgments.

## Twelve corrections / coverage issues

| ID | Finding and proposed correction |
|---|---|
| F01 | **Oracle is not executable.** Ranges such as `point:0-3`, fields such as “common fields”, and `Pass/Sjekk/Feil` do not identify outcomes. Add explicit fixture ownership and arrays of exact object/canonical-field expectations, reasons, schema expectations and forbidden dependent findings. Keep scenario IDs as grouping metadata. Never generate expected values by running the current validator. |
| F02 | **Clean point control is not clean.** Parsed `point-clean-modern/point:1` has `Byggemetode=null`, `Adkomst=E`; these are respectively Feil for LOK and an invalid Adkomst code. `point:0` KUM lacks Type, requiring Sjekk. The literal `clean-point-sfcode` Tema Pass is correct; a whole-file Pass claim is not. Correct the LOK columns and either add a compatible Type for KUM or document the deliberate Sjekk. Resolve LOK Bredde before declaring the LOK row clean. |
| F03 | **Upload byte decoding differs from test decoding.** Fixture tests read UTF-8; `FileUpload.js` reads GMI as ISO-8859-1. The same bytes produce `AnleggsÃ¥r` rather than `Anleggsår`, breaking canonical bindings. Choose and document a canonical interoperable fixture encoding and test the actual upload decode path. Smallest fixture-only proposal: Latin-1-compatible GMI bytes, explicit manifest encoding, regenerated hashes, and retain astral Unicode tests in the existing in-memory parser suite. Alternatively approve a shared UTF-8/legacy decoding improvement; that would require upload regression coverage. Do not hide the discrepancy with field aliases. |
| F04 | **Tema coverage overclaimed.** The applicability file has direct-only object values in a dual-source schema, agreement at point:6, valid conflict at point:7 and missing identity at point:8. It has no invalid identity, no object with only S_FCODE populated, and no machine assertion for schema coexistence. Other clean fixtures supply S_FCODE-only schemas. Add invalid-only/equal-invalid/mixed-invalid cases after precedence is agreed, object fallback in a dual schema, and line identity conflict with hydraulic suppression. |
| F05 | **Applicability/Type coverage incomplete.** No KRN or TOP appears despite README KRN claims; KMR is supplied-only, not UNKNOWN+missing. Add absent/supplied NOT_APPLICABLE and UNKNOWN combinations and field-specific LOK assertions. Existing `LOK/XLOK` at point:2 is a useful **incompatible Feil**: the approved mapping has XLOK→KUM, not LOK. The named Type scenario does not itself include INVALID_TYPE or missing DIV Type; those exist in point-boundaries and need explicit links. |
| F06 | **Hyperlink oracle contradicts actual coverage.** `hyperlink-exceptions` says Pass/Feil over point:0–3; point:1 is KUM with no link, hence Sjekk. LOK has no link, STR has no link, and TOP is absent. There is no LOK/TOP supplied-link Feil anywhere. Add both forbidden-presence cases, TOP absence and unrelated valid supply; encode KUM missing as Sjekk. |
| F07 | **History scenario claims and ownership are inaccurate.** Installation-history contains no malformed or future capture date; point:8 is date-before-installation Feil, so it cannot prove an independent old-date Sjekk. `positioning-cause-dataset-check` labels point:0,8 Sjekk, but point:0 NYTT must Pass and only point:8 UENDR gets Sjekk. Add exact five-year date / day-before / day-after, future date and an isolated old-date case. Invalid dates exist elsewhere but are not referenced here. Add 0000, malformed years, and mixed point/line delivery-year matching. |
| F08 | **Boundary coverage is field presence, not full partitions.** Missing exact accuracy 3/5, width 0/1 and malformed/decimal-width cases, several negative/decimal line dimensions, vertical 30, circular supplied vertical, and shape T. Negative width does exist in BAD. ASCII X/Y at 255/256 cannot distinguish UTF-16 units from Unicode code points; retain existing astral/combining/whitespace tests. Add focused unit boundaries plus a few representative GMI rows, not a file per value. Full enum sets belong in independent unit oracles. |
| F09 | **Hydraulic uncertainty is masked.** `line-hydraulic/line:7` is AFS/PE100 with BAD in all three hydraulic fields: each supplied code should Feil, even though the classifier is uncertain. Its `suction-uncertainty` Sjekk can only describe an internal class, not the actual field outcomes. Add separate suction rows with approved values and absent values; add special Tema after policy confirmation. Pressure PN missing is not tested. Keep invalid-code precedence explicit. |
| F10 | **Suppression expectations are prose and stress cases cannot isolate them.** `comprehensive-bad/line:0` has BAD Material, BAD SDR/SN/PN, BAD Rørform and bad VertikalDimensjon. Independent invalid supplied fields must still Feil; suppress only material/shape-dependent conclusions. Add prerequisite-invalid cases with valid or absent dependents and exact forbidden reason assertions. `line-dimensions-shapes/line:6` already usefully tests invalid shape with missing vertical dimension. Do not require zero SDR/SN findings for the existing BAD values. |
| F11 | **Integrity test validates too little.** It checks 41 unique labels, one-way fixture→scenario links, hashes, selected headers, counts and throws. It never checks oracle refs are in range, canonical field IDs, reverse ownership, status grammar, actual covered partitions, forbidden findings, or the truncated field value. Assert these structures. Verify the expected parser error family, and pin truncated Bredde=null plus empty coordinates. Keep this a small manifest validator, not a schema framework. |
| F12 | **Documentation/count/hash lifecycle needs reconciliation.** Correct 30 scenario count and the report's claim of detailed deterministic per-field assertions. Clarify `valid/` means parseable rather than all-Pass. The truncated parser-warning file currently has zero parser warnings and succeeds; document that as current behavior. Record encoding and canonical newline policy; prevent Git checkout conversion from silently changing hashes. Hash raw bytes, not decoded/re-serialized text. |

No fixture, manifest, test or prior report was changed in this pass. F01–F03 are prerequisites for trusting clean-control/integration claims. Other corrections should be made and reviewed against policy in the batch that activates the affected family.

## Complete 41-field comparison

P/S/F below mean Pass/Sjekk/Feil. References are zero-based parser refs. Abbreviations: PC=point-clean-modern, PB=point-boundaries, PT=point-text-placeholders, PA=point-applicability-tema, IH=installation-history, LC=line-clean-modern, LD=line-dimensions-shapes, LH=line-hydraulic, BAD=comprehensive-bad. The manifest currently gives family-level expectations; the outcomes below are manual-policy deductions from actual rows, not baseline runtime results. Gaps supplement F01–F12 rather than increasing the issue count.

| # / field | Manual policy versus supplied data and oracle |
|---|---|
| 1 Anleggsår | IH points 0/1: 2026/2021 NYTT P; 2:2020 S; 3:1900 UENDR P; 4:1899 S; 5:2027 F; 6:missing NYTT F; 7:missing UENDR S; 8:2026 UENDR P. Missing 0000 and malformed-year case in this scenario; BAD contains `bad`. |
| 2 Datafangstdato | IH 0–7 dates independently P if unusable future installation year is excluded; 8 F before installation. PB 0 leap date is calendar-valid but F before 2026 installation; PB 1 is exactly five years old, hence P; PB 2/3 invalid F. Claimed old S/future date missing. |
| 3 Innmålt_av | PT ordinary P, placeholder rows 1–5 S, whitespace row 6 F. Eight spellings are spread across the two text fields; not independently tested for both, and trimmed mixed-case variants need unit coverage. |
| 4 Saksnummer | PT ordinary P, placeholder rows S, whitespace/empty P. PB numeric 100 P. Remove baseline requiredness. No project-number format validation. |
| 5 Høydereferanse | PB 0 UKJENT S; 1/3 approved P; 2 BAD_REF F. Missing via BAD; keep full seven-code unit set. |
| 6 Målemetode | PB 0 96 P; 1 97 S; 2 999 F; 3 missing F. All other official codes S; exact list already independently tested. |
| 7 Nøyaktighet | PB 0 zero S; 1 four S; 2 negative F; 3 malformed F. PC positive P. Add exact 3 and decimal/missing cases. |
| 8 MålemetodeHøyde | PB 0 97 S despite official-list exclusion; 1 code 10 S; 2 999 F; 3 missing F. PC 96 P. Existing height-97 FAIL assertions are superseded. |
| 9 NøyaktighetHøyde | PB zero S, six S, negative/malformed F; PC/LC positives P. Add exact 5 and decimal/missing cases. |
| 10 Stedfestingsforhold | PB I_TUNNEL S, ÅPEN_GRØ/ÅPEN_KUM P, BAD_POS F. Sparse BAD proves absence; all other approved codes S. |
| 11 Stedfestingsårsak | IH 0–7 valid codes P; 8 matching UENDR S. PB BAD_CAUSE/missing F. Year-owned old/missing issues must not create cause findings. Fix point:0 oracle attribution. |
| 12 Synbarhet | PT JA/absence and PB HISTORIC/whitespace all P, with no value findings. Preserve display and retirement notice in both geometries; no need for a failure-producing rule. |
| 13 Merknad | PB 1 255 X characters P; 2 256 Y characters F; absence P. These are ASCII, not a discriminating Unicode test. Extend active point-only rule to lines; retain existing astral/whitespace evidence tests. |
| 14 Eier | PB AN/missing S, K P, BAD_OWNER F. Extend current point-only value rule to lines and remove default optional-skip outcome. |
| 15 Vertikalnivå | PB OVER_GRUNN/PÅ_BUNN S, UNDER_GRUNN P, BAD_LEVEL F. PC PÅ_GRUNN_VANNOVERF P. Required absence F. |
| 16 MaksAvvikVertikalt | PB 0 S, 30 P, 31 F, bad F. PC/LC positive P. Missing, negative and decimal require exact cases; never derive geometry deviation. |
| 17 MaksAvvikHorisontalt | PB 0 S, 20 P, 21 F, bad F. Same lexical/requiredness gaps and no geometry calculation. |
| 18 Tema/S_FCODE | PC/LC S_FCODE-only P; PA agreement 6 P; conflict 7 S unresolved; neither 8 F. Schema coexistence S separate. Invalid-code and line-conflict coverage missing. |
| 19 Type | PA KUM/KBRE P; LOK/XLOK F; STR/KMR missing P; conflict 7 compatibility suppressed. PB INVALID_TYPE F and DIV missing F; PC KUM missing S. Map these across fixtures explicitly. |
| 20 Kumform | PA KUM/R P, applicable missing F, BAD F, LOK/STR/KMR valid supply S. Add UNKNOWN missing and KRN cases. |
| 21 Bredde | PA KUM 20 P, missing F, 19 S; STR 20 S under consolidated manual, conflicting with old metadata. KMR supplied S. BAD negative F independently of Tema conflict. LOK 20 needs policy clarification; zero/decimal/malformed coverage absent. |
| 22 Lengde | PB 0/25 S, -1/bad F; absence P. There is no valid-supplied P branch despite fieldCoverage saying P/S/F without explaining P is absence. |
| 23 InnvendigUtvendig | PA ID/OD P and BAD F; BAD omissions F. LC ID/OD P, LD BAD/missing F. Required in both geometries independently of Tema. |
| 24 Tykkelse | PA KUM positive P, missing F, zero S; KMR supplied S; BAD negative F. LD 10 P, zero S, bad/missing F, line:3 1.5 explicitly unresolved pending decision (integer baseline would F). |
| 25 Utvendig_høyde | PB 0/25 S, -1/bad F; absence P. Never add requiredness. |
| 26 Avst_BunnInnvUnderUtv | PA KUM 0.5 and 0,5 P, missing F, zero S, KMR supplied S; BAD bad F independently of Tema conflict. Add negative, malformed-on-nonapplicable and UNKNOWN missing cases. |
| 27 Byggemetode | PA KUM/LOK B P; KUM missing F; UK S; STR/KMR B S; BAD invalid F. PC LOK missing is unintended F. |
| 28 Adkomst | PA KUM DO P, KUM missing S, LOK/STR/KMR DO S, non-KUM missing P; BAD invalid F. PC LOK E is F, not informational S. |
| 29 Kjegle | PA KUM E P, missing/BAD F, LOK/STR/KMR E S. No unapproved code such as UK is accepted; keep five-code unit list. |
| 30 AnleggsID | PB supplied SYN-ID values S, absence P; no value Feil ever. Add wording test that this is informational and does not suggest a wrong identifier. |
| 31 S_HYPERLINK | PA KUM supplied P, missing S; LOK absent P; conflict suppresses Tema-dependent conclusion. No LOK/TOP supplied F exists. Lines with valid other Tema accept presence/absence. |
| 32 NOBB-VAVVS-nr | PC/LC integers P; PB abc/1.5 F; missing P. Extend integer validation to line scope. Signed integers/long digit strings remain format-valid; preserve exact digits for links. |
| 33 NOBB-VAVVS-nr-ramme | Same, point-only. PB bad/1.5 F, PC integer P, absence P. Clickable display still absent. |
| 34 Nett_type | LD F/H/S P, O1/S6 S, BAD F; missing in BAD F. Add O/O2/S7 partition tests using existing exact eight-code oracle. |
| 35 Material | LD PVC P, AN S, BAD F; LH GRP/GUP S but still valid for Ringstivhet. Missing F. Keep all 45 values; common Pass set is exactly nine values. |
| 36 Dimensjon | LD 32/200 P, 31/0/1 S, bad/missing F. Negative/decimal not supplied in LD; add exact unit boundaries. |
| 37 VertikalDimensjon | LD S+missing P, E+31 P, F+0 F, R+1 S, A+bad F, X+missing F; invalid shape 6 suppresses missingness judgment. Missing circular-supplied, 30 and decimal/negative coverage. |
| 38 Rørform | LD S/E/F/R P, A/X S, BAD F; no T. Missing F. A/X remain valid prerequisites despite Sjekk. |
| 39 SDR | LH VL/PE100/11.0 P; AFP/PVC missing F; AF/PVC supplied S; gravity absence P; VL/BET supplied S. AFS/BAD F, not a field S. Exact 13-code list and both material families must be independent tests. |
| 40 Ringstivhet | LH AF/PVC SN8 P, missing F; GRP/GUP approved SN P despite Material S; VL/BET supplied S; AFS/BAD F. Conservative AF examples do not settle the 108-code classifier. |
| 41 Trykklasse | LH pressure PN10/PN16 P; AF supplied PN10 S; AF absent P; AFS/BAD F. Missing-pressure S and valid/absent suction S not demonstrated. Full 15-code list needs unit coverage. |

# Tema/S_FCODE plan

Keep A3 as the evidence resolver. Build one per-run, per-ObjectRef validated Tema fact combining its state and the geometry-specific exact list. A usable fact requires agreement (or a single supplied source) **and** allowed-code validity. Missing, invalid, structurally ambiguous and conflicting sources must remain distinct internal reasons.

Detect coexistence from accepted Tema and S_FCODE schema candidates even when a column is all empty. Do not confuse two case-only variants of Tema with Tema plus S_FCODE. Emit one layer-owned coexistence Sjekk containing the affected point/line schemas, shown once in the workspace. Proposal for “same file/schema”: inspect both schemas of the selected delivery, retain which source appears in which schema, and coalesce the notification; never compare a point value with a line value. Confirm any narrower same-geometry-only interpretation before finalizing this edge case.

Agreement and one-empty-source cases remain usable. Preserve both observations as provenance; `preferredSourceKey` must not imply a conflict winner. Tema-dependent Type, applicability, hyperlink and hydraulic checks consume the shared fact. They must not call legacy fallback heuristics or repeat `TEMA_CONFLICT`.

Add exact tests for schema coexistence without object conflict, object conflict with valid dependent fields, equal invalid sources, invalid singleton sources, line conflicts, geometry separation and source ordering. Retain existing A3 ownership, alias rejection and lexical-disagreement tests.

# Applicability plan

Extend `registry/pointFieldApplicability.js` from four fields to the six shared-policy fields: Kumform, Bredde, Tykkelse, Avst, Byggemetode and Kjegle. Reuse one core Tema set plus explicit field exceptions and UNKNOWN default. Version the policy update and cite the consolidated manual as project/domain authority.

Use a reusable composition of `valueValidity`, `requiredWhenApplicable`, applicability and field-specific value partitions. Invalid supplied values fail independently; zero and small but valid values retain their specified Sjekk. Applicable missing required fields fail; NOT_APPLICABLE or UNKNOWN absence passes; valid unexpected/uncertain presence checks. Keep Adkomst's exact-KUM missing-Sjekk behavior as a small policy configuration, not a second infrastructure.

UNKNOWN for a valid unclassified Tema is **not** unresolved identity. If identity is blocked, do not assert requiredness or unexpected presence based on guessed applicability. Still reject independently malformed/negative/unlisted supplied values. Handle no dependent badge through suppression ownership, rather than converting blocked identity into UNKNOWN and generating six Sjekk findings.

# Cross-field/dependency plan

Create small pure helpers for parsed numeric/date facts and named relationship/classification evaluations. Cache evidence and prerequisite facts once per object; build delivery-year facts once per selected layer. Helpers return validity and usable values separately from presentation outcomes. No topological scheduler or rule-to-rule recursive execution is needed.

| Upstream condition | Ownership and downstream behavior |
|---|---|
| Tema missing/invalid/conflict | Tema owns the issue; suppress Tema-dependent requiredness/compatibility/classification. Independently invalid supplied Type or point numeric/code values can still fail. |
| Material missing/invalid | Material owns failure; no guessed plastic classification. Independently unlisted SDR/SN still fail. Trykklasse does not depend on Material. Pressure-only conclusions may proceed only if they do not need Material. |
| Rørform missing/invalid | Shape owns the prerequisite issue; suppress shape-dependent vertical presence/range conclusions. A supplied zero/negative/non-integer vertical value is independently invalid under the manual. |
| Valid Rørform A/X | Usable shape, despite Sjekk; non-circular vertical requiredness continues. |
| Anleggsår missing/invalid | Year owns its issue; capture date validates independently; cause list still validates but does not duplicate NYTT-year concerns. |
| Valid uncommon Material | Material Sjekk does not suppress SDR/SN; use the exact family membership. |

Dataset comparison must include points **and** lines of the same parsed delivery, never other selected/visible layers. Build a Set of usable NYTT years, then check valid non-NYTT objects for membership. Attribute Sjekk to the non-NYTT object's Stedfestingsårsak. Make traversal order irrelevant; test reversed arrays and a cross-geometry match. Capture date-before-year belongs to Datafangstdato, not a duplicate Anleggsår finding.

Fildata must join completed outcomes by rule/field and ObjectRef. For identical delivered values in different contexts, keep one unique-value total with a Pass/Sjekk/Feil breakdown (plus explanatory suppression ownership), or split displayed rows by outcome/reason while retaining a true distinct-value total. Do not copy the first object's acceptance to all matching values. Include completed-run identity/reference date and policy version in caching, because the same dataset can be rerun on another date without a new dataset revision.

# Hydraulic classifier plan

Use one small line classifier with two independent outputs: Tema hydraulic class and material-family membership. It must accept **validated** Tema/Material facts. No decision depends on whether SDR, SN or PN is populated.

- Pressure: approved line codes in the `VL` family, plus AFP/I2P/OVP/SPP. Current inventory yields VL, VLBO, VLI, VLK, VLLU, VLP, VLSPR, VLT, VLU, VLVAR plus those four pumped codes. Validate membership before prefix matching so `VL_BAD` cannot become usable.
- Suction: AFS/I2S/SPS are explicit. Do not treat every trailing S as suction: OVS is not approved as such by the manual.
- Gravity: **proposal requiring approval: AF, OV, SP**. AF is the synthetic conservative example; `field-resolution-census.json` records earlier domain decisions for OV/SP. All three exist in the reviewed 108-value list. This is a conservative proposed starting inventory, not a claim that only these can be gravity.
- Remaining valid codes stay special/uncertain until classified. Ask the user whether the proposed set is complete for this release and to enumerate additions. In particular, do not automatically include DR, I2, AF/OV/SP variants, overflow/ventilation/culvert/special codes, or non-VA LE codes. The research scanner's broad prefix-based gravity heuristic is selection evidence only and must not be copied into runtime.
- Keep the manual's 14-value SDR PE/PVC family separate from its 20-value Ringstivhet polymer family. PP/ABS/GRP/GUP membership in the latter does not establish SDR applicability. Keep Material validity/commonness as a third independent fact.

Each field first checks exact supplied-code validity. Then apply its own requiredness and relationship policy: SDR required for confirmed PE/PVC pressure; Ringstivhet required for confirmed polymer gravity; PN optional/desirable for pressure regardless of Material. Special/suction presence and absence must follow the approved uncertainty matrix, not a binary inverse of pressure.

Line Tykkelse needs no architecture split beyond a geometry-specific format policy. Integer baseline reuses the integer helper; a one-decimal decision requires exact scale/separator rules and independent tests, without changing point Tykkelse. Keep LD line:3 excluded with an explicit unresolved-decision reason until approved. Do not make runtime emit a fourth user-facing UNRESOLVED status.

# Test/oracle activation plan

Use the existing manifest with modest additions; no custom expression language. Each expectation should identify its fixture, exact ref, canonical field ID, one outcome, and stable policy reason. Schema expectations have layer/schema scope. Suppression entries identify the owner and forbidden dependent reason families. An explicit unresolved entry carries the policy question and is counted visibly by the harness.

For example, IH point:0 Stedfestingsårsak is Pass; IH point:8 is Sjekk for shared NYTT year. PA point:7 Tema is Sjekk/CONFLICT and Type compatibility is suppressed, while independently invalid values are asserted separately. Store original scenario ranges only as descriptions, not runtime selectors. Freeze the test clock at the manifest date. Verify exact Pass outcomes from outcome records, not merely absence of findings.

Scope assertions by explicit fields/reasons for sparse fixtures, with a documented background-finding policy. For corrected clean controls assert the complete expected outcome set and absence of unexpected findings. For BAD assert expected independent owners and suppression, not just “at least one Feil”. Add one counterexample for each dependency that proves it would run when its prerequisite is usable.

Retain independent list fixtures in `tests/fixtures/validationV2GmiV32DomainValues.mjs`, Type/Tema pairs, and point code-list fixtures. Test all approved values, near misses and exact threshold neighbors in small units. A manifest copied from production lists is not an independent oracle.

## Existing test disposition

| Tests | Treatment |
|---|---|
| A0, A1, A2, A3, A4 | Preserve canonical 41 fields, explicit-schema precedence, all-null headers, unsupported aliases, ownership rejection, raw values/lexemes, multiple-candidate ambiguity, no mutation and geometry isolation. Existing conflict-without-winner tests already support the policy. A3 stays evidence-only; add validated gate tests above it. Update fallback wording if misleading, not the invariant. |
| A5, A6, A7 | Preserve runner ownership, safe evidence projection, immutability, V1 isolation/default, stale-result checks, compact UI and one-run/two-tabs behavior. Extend count equations for CHECK/suppression/schema findings. Replace old labels/empty-geometry status expectations. |
| A8 | Preserve independent exact domain sets and measurement lexical near misses. Supersede all-valid-codes-Pass, height-97-Feil, Saksnummer-required, unconditional year-required and partial line-presence-only assertions. Retain geometry/layer and 3,000-object bounded-result tests; update their synthetic policy prerequisites intentionally. |
| TypeTemaCompatibility | Preserve independent 72 Type / 86 pair oracle and mismatch ownership. Replace universally optional Type and duplicate conflict INDETERMINATE findings with policy missingness and suppression. Keep multi-Tema pairs and lexical evidence precedence. |
| PointFieldApplicability | Preserve exact lookups, UNKNOWN default, immutable cells and provenance. Replace metadata-only assertions and old STR width cell under manual authority; settle LOK width. Extend to six fields and runtime composition. |
| V32PointCodeLists, V32PointNumericLexical, V32Batch1/2 | Retain exact lists, low-level integer/decimal grammar, raw-lexeme precedence, no cross-binding and detailed Merknad regression cases. Runtime optional-all, negative-Pass, zero-Pass, lexical-calendar-only and no-applicability assertions are superseded. Low-level format success can remain distinct from final policy Feil. |
| A81FieldInfo, A81ResultsWorkflow | Preserve lazy bounded counts, stale ownership, accessibility, filtering, stable sort and one-open behavior. Replace old severity vocabulary and aggregate truth table. Add contextual equal-value outcome grouping, run-date cache freshness, explicit conditional requiredness, schema notice and NOBB links. |
| Synthetic fixture test | Extend integrity checks, then add a separate small runtime-oracle harness. Keep parser-only tests separate from policy outcomes. |

Historic active-rule totals repeated across tests are redundant after policy consolidation: replace repeated 45/38/21 snapshots with one reviewed inventory assertion and general reconciliation checks. Do not delete useful unit, lexical, ownership or UI tests simply because integration exists.

# Real-corpus regression plan

The ignored manifest has 17 unique selected paths and useful geometry/scenario tags. A local opt-in headless script can read it, decode bytes consistently with the supported upload path, parse, run V2 for one explicit layer and assert completion, expected geometry, count reconciliation and bounded ownership. Only print safe test IDs, aggregate counts and pass/fail reasons; avoid raw parser errors or findings containing operational values.

There is one report/manifest mismatch to reconcile before choosing per-ID assertions: the report assigns missing identity to `real-verybad-02` and minimal S_FCODE to `real-verybad-03`, but the manifest tags 02 as `sfcode_only` and 03 as `tema_neither`. Treat those report labels as unverified until a limited local probe confirms them. No real values need to enter tracked documentation.

Reuse manifest loading and privacy conventions from `scripts/research/inspect_real_gmi_corpus.js`, but **not** its value normalization or hydraulic prefix classifier as validator authority. Choose a few broad predicates per ID: dual-source conflict for real-edge-02, method 97 for real-legacy-03, zero accuracy for real-legacy-02, sparse-schema robustness for verybad cases. Do not assert every research tag or exact result totals.

Use a structural upper bound: no duplicate `(objectRef, field owner, reason)` findings; at most the documented number of field-owner outcomes per object plus a bounded layer/schema set. Do not fail merely because an adverse delivery legitimately has many independent errors. Confirm blocked identities do not multiply dependent Sjekk findings. Missing local corpus should explicitly skip local-only tests, while the public synthetic suite remains mandatory. No copies, snapshots, operational filenames in tracked code, or corpus-wide re-audit.

# Maximum-four-batch implementation plan

These are the only four substantial batches. Fixture/oracle correction is included within them, not an extra implementation phase. Before editing existing test data, accept the relevant corrections above and any needed domain decisions. Terra self-tests each batch; Sol reviews once after all four.

## Batch 1 — Shared outcomes, Tema gate and independent common policy

**Purpose:** establish one consistent Pass/Sjekk/Feil result path and deliver the independent common rules in both geometries.

**Architecture/rule families:** add CHECK and compact object outcomes, layer/schema finding ownership, run reference date, and reusable exact numeric/code/text policy helpers. Add validated Tema gate and schema coexistence; suppress the existing duplicate Type conflict. Implement Innmålt_av/Saksnummer, height reference and measurement/accuracy rules, deviations, Eier, Vertikalnivå, Stedfestingsforhold, common InnvendigUtvendig, Merknad both geometries, and common NOBB integer behavior. Preserve Synbarhet as non-validating display data. Establish Fildata outcome consumption and base UI status/count plumbing now.

**Likely modules:** contracts, runner, evaluators, Tema gate, registry rules/provenance, resultPresentation, uiIntegration, fieldData, fieldInformation/data, RuleList/Workspace. Keep binding/ObjectRef modules stable. A small policy-values/helper module is reasonable. Resolve F01–F03 and basic integrity issues without altering policy to fit runtime; avoid an upload subsystem rewrite.

**Tests/scenarios:** A0–A8 ownership/aggregation and lexical tests, A81 base status/Fildata, independent domain lists, fixture integrity and runtime harness. Activate `clean-point-sfcode`, `text-unicode-boundaries`, `text-placeholder-classes`, `synbarhet-retired`, `tema-source-modes`, and all three `parser-*` IDs. Activate common-field portions of `common-boundaries-pass-check-fail` and `common-missing-invalid`, plus Tema ownership/Type-conflict suppression assertions; do not claim the entire point-dependency scenario is complete yet.

**Dependencies/risks:** first batch; settle invalid-plus-conflict precedence for those cells. Highest risk is inconsistent result counts or Fildata/context caching, plus encoding mismatches. Existing unsupported aliases and structural uncertainty must remain conservative.

**Non-goals:** point applicability/Type missingness, year/date relationships, line dimensions, hydraulics, telemetry, V1 changes.

**Completion:** targeted suites pass; precise outcomes are inspectable headlessly; common rules cover both geometries; optional absence is Pass; one coexistence notice and one Tema conflict owner; UI has no “Må rettes” severity. Partial family activation is explicitly enumerated, not silently skipped.

**Terra Medium prompt scope:** “Implement batch 1 of this report only, using the accepted F01–F03 corrections and approved Tema precedence. Reuse A0–A4, deliver the result/Fildata contract and independent common policy end to end. Keep an explicit list of remaining oracle families; preserve unrelated work; no commit/push/deploy.”

## Batch 2 — Point policy and delivery history relationships

**Purpose:** finish point behavior and common temporal relationships using the shared context.

**Architecture/rule families:** runtime applicability for six fields; Type list/pair/missingness composition; Adkomst, informational Lengde/Utvendig_høyde/AnleggsID, point Tykkelse/Avst, hyperlink exceptions in both relevant geometries, and NOBB ramme display/validation. Implement dynamic Anleggsår/Datafangstdato and cross-geometry Stedfestingsårsak year matching. Add their final Field Info wording, unique text counts and contextual Fildata breakdowns.

**Likely modules:** pointFieldApplicability, point policy evaluator/helper, temporal fact helper, runner context, rules, fieldInformation/data, FieldInfoModal/fieldData. No per-field applicability infrastructure.

**Tests/scenarios:** PointFieldApplicability, TypeTemaCompatibility, V32PointCodeLists/NumericLexical/Batch1/2 and A81 context tests. Complete `clean-point-optional-absence`, both common-boundary groups, `tema-conflict-suppression`, `point-applicability-states`, `type-tema-compatibility`, `hyperlink-exceptions`, `installation-year-boundaries`, `capture-date-boundaries`, `positioning-cause-dataset-check`. Add precise corrected rows/assertions within existing fixture groups for F02/F04–F08. Complete point portions of `robustness-many-independent-errors`.

**Dependencies/risks:** batch 1; settle LOK width, year usability/invalid-cause behavior, and decimal edge grammar. Risks are interpreting missing identity as UNKNOWN applicability, stale time-dependent results, and duplicate year/cause findings.

**Non-goals:** line shape/dimensions or hydraulic implementation; parent-installation linking, attribute editing, URL/path syntax validation.

**Completion:** corrected point fixtures have exact accepted outcomes; all point/common temporal assertions run; reversal and cross-geometry date-set tests pass; Sjekk explanations distinguish information from suspected errors; no prerequisite cascade. Tests explicitly preserve signs/precision/Unicode behavior where policy permits.

**Terra Medium prompt scope:** “Implement batch 2 as one point/history pass using batch 1 outcomes and approved applicability/year decisions. Activate all listed scenario groups, correct the documented fixture gaps from policy, and finish their Fildata/Field Info behavior. Do not add hydraulic heuristics or operational side effects.”

## Batch 3 — Complete independent line policy and shape relationships

**Purpose:** finish line dimensions, requiredness and code partitions, ready for shared hydraulic classification.

**Architecture/rule families:** Material validity/commonness, Nett_type partitions, Dimensjon threshold, line Tykkelse, Rørform and VertikalDimensjon composition. Reuse common rules from earlier batches; ensure common Merknad/Eier/NOBB coverage does not regress. Expose validated Material and shape facts independently of warning severity.

**Likely modules:** line policy/fact helper, rules/evaluators, small runner context extension, fieldInformation/data; minimal FieldInfo presentation adjustments.

**Tests/scenarios:** independent line lists/numeric boundaries, shape dependency tests, A8 geometry and A81 Fildata. Activate `line-dimension-boundaries`, `line-shape-vertical-dependency`, `invalid-pipe-shape-suppression`; activate `line-tykkelse-decimal-policy` only after the explicit decision. Complete non-hydraulic portions of both clean-line groups and BAD. Fill F08/F10 shape coverage with existing groups and focused units.

**Dependencies/risks:** batches 1/2 common infrastructure; line integer/decimal decision. Risks: A/X Sjekk mistakenly blocks vertical rules, invalid shape hides independent invalid vertical values, material warnings treated as invalid, or numeric coercion accepts a forbidden decimal.

**Non-goals:** hydraulic requiredness/classification, pipe engineering calculations, inferred dimensions, changing point Tykkelse format.

**Completion:** all resolved line independent and shape assertions pass, Material facts are usable for valid uncommon codes, malformed shapes suppress only dependent conclusions, and field/rule/geometry counts reconcile. An unresolved decimal cell remains visibly tracked and is not marked green.

**Terra Medium prompt scope:** “Implement batch 3: complete line policy and shape relationships using the shared facts/outcomes. Follow the recorded Tykkelse decision, retain point format semantics, and activate exact line/shape assertions with suppression ownership. Do not infer hydraulic classes.”

## Batch 4 — Hydraulics, complete oracle and final presentation/regression checkpoint

**Purpose:** complete Validator v3.2 and make the accepted oracle executable end to end.

**Architecture/rule families:** shared pressure/gravity/suction/special classifier, two material families, SDR/SN/PN policies and invalid-code precedence. Finish all contextual explanations, schema notice placement, retired Synbarhet order, prominent Merknad/AnleggsID, NOBB links and hyperlink exception wording. Complete the local opt-in corpus runner and final test inventory.

**Likely modules:** hydraulic classifier/policy helper, rules/runner, Field Info data, fieldData/resultPresentation, Workspace/RuleList/FieldInfoModal, fixture runtime harness and a small local regression script. Raw NOBB digits must survive link construction; use fixed `nobb.no` origin and an approved item-route format, not arbitrary supplied URLs or catalogue validation. Verify the item route before implementation if no existing repository helper establishes it.

**Tests/scenarios:** activate `sdr-classification`, `ringstivhet-classification`, `trykklasse-classification`, `suction-uncertainty`, `invalid-material-suppression`, and complete `clean-line-pressure`, `clean-line-gravity`, `robustness-many-independent-errors`. Finish line Tema suppression and F09/F10 cases. Run every corrected resolved expectation across all 30 current IDs (and any accepted additions), with no family allowlist silently leaving work untested.

**Dependencies/risks:** batches 1–3; approved gravity inventory and uncertainty matrix. Risks are treating every non-pressure code as gravity, merging material families, allowing invalid-code uncertainty to downgrade Feil, duplicate findings, and UI silently downgrading mixed errors to amber.

**Non-goals:** fixture telemetry/Stats implementation, hydraulic calculations, source aliases, V1 migration/default changes, deployment or production configuration.

**Completion:** all resolved oracle assertions pass; any genuinely undecided cells are listed as exclusions with the decision required, never concealed by green scenario labels. All 17 available local files complete bounded smoke checks. One full repository suite and build at this completion checkpoint, plus targeted UI/manual fixture checks through the actual upload path, pass. Hand off to Sol with changes, policy-to-test traceability and any residual limitations.

**Terra Medium prompt scope:** “Implement batch 4 using the approved exact hydraulic inventory/matrix, finish oracle activation and UI reconciliation, and run the final local/full-suite/build checkpoint. Produce a Sol handoff listing any explicit unresolved exclusions. No telemetry, production action or commit.”

# Deferred tiny fixture-statistics change

Do this after core validation, outside the four core batches. Current hashes are suitable exact byte identities once fixture contents, encoding and newline handling are final. They are not privacy-sensitive, authentication, or fuzzy identification. A renamed exact file should still match; a byte-modified file should not. Include explicit eligibility if only successful manual-upload fixtures should count.

Minimum later change: ship a small hash allowlist derived from the canonical manifest; hash original upload bytes before decoding; propagate only bounded boolean `is_test_fixture` through the existing upload telemetry path; exclude true rows from normal usage aggregation; optionally expose one aggregate test-upload count. Do not send the hash, fixture ID, scenario ID or filename as additional analytics dimensions. Existing test-mode behavior should be inspected for compatibility, not replaced by a second subsystem. Backend persistence/Stats changes need their own explicit authorization; nothing in this report authorizes Supabase/Vercel or production changes.

# Final Sol review checklist

- Read the manual and recorded decisions, then compare every field and exact code partition against implementation and independent tests. Check both geometries and optional/retired fields.
- Run the complete corrected synthetic oracle at its fixed date; inspect exclusions and ensure no expected outcome was generated from runtime. Verify true clean controls, encoding/hash parity and all suppression counterexamples.
- Review Tema coexistence, validity/conflict precedence and no direct-source winner; retain layer/revision ownership and geometry isolation.
- Confirm valid uncommon Material and shape facts remain usable; verify exact pressure/gravity/suction sets and separate SDR/SN families. Never infer class from dependent-field presence.
- Check dynamic time, leap dates, five-year boundaries, usable-year policy, cross-geometry/cross-object matching and no cross-layer comparisons.
- Check owner/reason uniqueness, independent invalid-value precedence and bounded performance on sparse/adverse objects and the 17-file local smoke set. Reconcile the verybad report/manifest IDs first.
- Compare runtime outcomes, row summaries, filters, Fildata and Field Info. Only Pass/Sjekk/Feil validation outcomes; informational Sjekk wording, conditional requiredness, prominent notes, retired Synbarhet and safe exact-digit NOBB links.
- Ensure Fildata caches bind to the completed run/reference date and equal values with different contexts do not share a false acceptance.
- Preserve V1 default/isolation, error boundaries, raw-lexeme privacy, stale-result rejection, accessibility and bounded evidence. Check browser upload, not only parsed-object tests.
- If fixture recognition was separately implemented, test raw-byte identities and a boolean-only analytics path with normal-statistics exclusion. No per-fixture analytics or operational data copied into tracked tests/reports.
- Review the full diff, targeted test evolution, full repository suite/build results, `git diff --check`, and unrelated worktree preservation. No commit/push/merge/deploy without separate user instruction.

# Remaining user decisions

1. **Gravity inventory:** approve or amend the proposed `{AF, OV, SP}` release set; enumerate additional confidently gravity codes from the current 108-value list. Confirm whether all remaining non-pressure/non-suction codes should stay uncertain.
2. **Line Tykkelse:** retain integer (1.5→Feil), or allow one decimal? If decimal, confirm dot/comma and maximum fractional precision. Point Tykkelse remains integer.
3. **Bredde:** confirm LOK APPLICABLE versus UNKNOWN; acknowledge STR changes from old APPLICABLE metadata to manual NOT_APPLICABLE.
4. **Tema edge precedence:** confirm invalid supplied identity outranks disagreement, and whether coexistence means either schema in the same delivery or only both keys in the same geometry schema.
5. **Year relationship usability:** settle 0000/old-Sjekk years and missing/invalid cause with missing year. Approve the calendar-anniversary convention for date age.
6. **Uncertainty/notation:** confirm special SDR/PN absence and uncertain/non-plastic SN outcomes, and whether non-plain Avst notation is Feil rather than the old indeterminate result.

Before Terra starts, accept the fixture/oracle correction direction, including the canonical byte-encoding choice. The unambiguous outcome/common-rule foundation can proceed while later domain answers are pending. No validator implementation, fixture edits, telemetry changes, commit, push, merge or deployment occurred in this planning pass.
