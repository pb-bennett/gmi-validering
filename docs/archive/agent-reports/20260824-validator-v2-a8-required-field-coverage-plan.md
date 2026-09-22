# Validator 2.0 A8 required-field coverage plan

- Date: 2026-08-24
- Branch: `feature/validator-v2-a8-required-field-coverage`
- Scope: planning only; no application, production configuration, Validator 1.0, deployment, or rule implementation changes
- Target: broad, source-backed required-field coverage for one selected GMI layer

## 1. Decision

A8 should finish with **23 active practical rules: 12 common, 5 point, and 6 line**. Three are the existing A7 rules and **20 are additions**. They cover **20 canonical fields** because Tema, InnvendigUtvendig, and NOBB/VAVVS-nummer have separate point/line rule applicability while retaining geometry-neutral canonical identities.

The recommended set is intentionally limited to requirements for which all four questions have a safe answer:

1. Is the field mandatory in the bundled Innmålingsinstruks source?
2. Does the current GMI adapter resolve its canonical field directly and conservatively?
3. Is its point/line applicability unconditional and understood?
4. If the rule checks a restricted code set, is that set source-confirmed and executable without unsafe generic normalization?

The resulting A8 set is a large step beyond A7 without importing legacy heuristics. It excludes conditional construction fields, polygon-dependent dimensions, hydraulic fields, uncertain aliases, optional fields, and code tables that the prior research marks for verification or domain review.

## 2. Evidence and implementation baseline reviewed

The recommendation follows these reports, in evidence order:

- `20260820-validation-module-audit-and-plan.md`
- `20260820-innmalingsinstruks-rule-source-mapping.md`
- `20260821-validator-v2-field-resolution-census.md`
- `20260821-validator-v2-gmi-header-evidence.md`
- `20260821-validator-v2-legacy-rule-provenance-audit.md`
- `20260823-validator-v2-gmi-adapter-spec.md`
- GMI A0 through A6 implementation reports
- `20260823-validator-v2-a7-compact-geometry-tabs.md`

The runtime inspection covered `contracts.js`, the 41-field canonical registry, schema binder, Tema resolver, generic field extractor, rule registry, evaluators, runner, UI integration, A7 finding grouping, workspace rendering, and A0-A7 tests.

Relevant established facts are:

- Appendix A marks the recommended fields unstarred/mandatory in the stated geometry scope.
- All 41 direct source property names were observed in the privacy-safe 182-file GMI-v2 header corpus.
- The implemented adapter resolves direct names, unique case-only forms, and the one approved Tema fallback without accepting semantic lookalikes.
- Direct Tema is preferred, delivered `S_FCODE` is fallback only, and disagreement is `CONFLICT`.
- `Bredde` is point width only; `Dimensjon` is line dimension; case-only `DIMENSJON` may resolve; `DIM` remains unresolved.
- The four XY/Z measurement concepts are already distinct canonical fields.
- Unknown source fields are informational diagnostics and never validation failures.
- One run validates exactly one selected layer; the geometry tabs are filtered views over that immutable result.

## 3. A8 evaluation contract

### 3.1 Practical-rule profiles

The matrix below references these complete behavior profiles. A profile is not a second user-facing rule; it defines the stages inside one practical rule.

| Profile | Exact PASS | Exact FAIL | Exact INDETERMINATE | NOT_EVALUATED | FIELD_ABSENT | VALUE_MISSING | Allowed-value behavior |
|---|---|---|---|---|---|---|---|
| `REQ` | Accepted canonical binding and a `VALUE_PRESENT` raw value | `FIELD_ABSENT` or `VALUE_MISSING` | `BINDING_AMBIGUOUS`, `UNRESOLVED_SOURCE`, or `SCHEMA_UNAVAILABLE` | Not used for an applicable object | FAIL / `REQUIRED_FIELD_ABSENT` | FAIL / `REQUIRED_VALUE_MISSING` | None in A8; value format/range is outside this required-presence rule |
| `REQ_ENUM_EXACT` | `VALUE_PRESENT` and raw value exactly matches a source-authorized code with `Object.is` | Absent, missing, or present with a non-listed value | Same three binding/schema uncertainty states | Not used for an applicable object | FAIL / `REQUIRED_FIELD_ABSENT` | FAIL / `REQUIRED_VALUE_MISSING` | FAIL / `VALUE_NOT_ALLOWED`; no trim, case fold, transliteration, or numeric equivalence in V2 |
| `REQ_ENUM_INTEGER_CODE` | `VALUE_PRESENT` and a field-scoped comparison maps parser integer `0`–`3` to the exact source code strings `"0"`–`"3"` | Absent, missing, non-integer, or code outside `0`–`3` | Same three binding/schema uncertainty states | Not used for an applicable object | FAIL / `REQUIRED_FIELD_ABSENT` | FAIL / `REQUIRED_VALUE_MISSING` | FAIL / `VALUE_NOT_ALLOWED`; this is only for `visibility`, not a generic stringify/parseFloat policy |
| `TEMA_REQ` | A3 Tema identity is `RESOLVED`, including approved object-level fallback from absent/missing direct Tema to delivered `S_FCODE` | A3 identity is `MISSING`; binding absence selects absent reason, otherwise missing-value reason | Tema `CONFLICT`, `UNRESOLVED_SOURCE`, schema ambiguity, or unavailable schema | Not used for an object in the rule's geometry | FAIL / `REQUIRED_FIELD_ABSENT` | FAIL / `REQUIRED_VALUE_MISSING` | No Tema closure check in A8; unknown supplied Tema remains present/UNKNOWN for later classification |

Zero objects in a geometry is not an object-level `NOT_EVALUATED` result: the rule simply has `evaluatedCount = 0` for that geometry and the UI shows `Ikke kontrollert`. Geometry-specific rules never evaluate opposite-geometry refs.

### 3.2 Reason codes and user messages

A8 needs no new finding reason code. The rule title supplies field context; the existing concise Norwegian reason translations remain suitable:

| Reason code | Message | State |
|---|---|---|
| `REQUIRED_FIELD_ABSENT` | `Feltet mangler i datasettet` | FAIL |
| `REQUIRED_VALUE_MISSING` | `Verdi mangler på objektet` | FAIL |
| `VALUE_NOT_ALLOWED` | `Verdien er ikke tillatt` (group title may show `Ugyldig verdi: …`) | FAIL |
| `BINDING_AMBIGUOUS` | `Feltkoblingen er tvetydig` | INDETERMINATE |
| `UNRESOLVED_SOURCE` | `Feltkilden kan ikke tolkes sikkert` | INDETERMINATE |
| `SCHEMA_UNAVAILABLE` | `Feltstrukturen kunne ikke fastslås` | INDETERMINATE |
| `TEMA_CONFLICT` | `Tema-kilder inneholder motstridende verdier` | INDETERMINATE |

`FIELD_ABSENT` must remain distinct from a bound column whose object value is null/empty. A suspected alias, misspelling, unknown field, or unresolved candidate cannot turn either outcome into PASS.

## 4. A. INCLUDE IN A8

Every included rule is unconditional for every object in its listed geometry scope. “All” below means all objects in the selected layer's applicable geometry, not all layers and not a separate run.

### 4.1 Common rules — 12

| Proposed rule ID | Norwegian display label | Canonical field | Applicability | Requirement | Source/provenance; confidence | Profile / allowed values | Dependencies | A8 disposition |
|---|---|---|---|---|---|---|---|---|
| `innmaling.common.height-reference.valid` | Høydereferanse er gyldig | `heightReference` | common; all points and lines | Required for all | STANDARD; Appendix A pp. 5, 7; main pp. 10, 13, 18; HIGH | `REQ_ENUM_EXACT`: `BUNN_INNVENDIG`, `PÅ_BAKKEN`, `SENTER`, `TOPP_INNVENDIG`, `TOPP_UTVENDIG`, `UKJENT`, `UNDERKANT_UTVENDIG` | None; pressure-specific reference is separate/deferred | Keep existing A7 rule |
| `innmaling.common.installation-year.required` | Anleggsår er oppgitt | `installationYear` | common; all points and lines | Required for all | STANDARD; Appendix A pp. 5–6; requiredness HIGH | `REQ`; `YYYY` syntax is deferred, not silently treated as checked | None | Add in A8 |
| `innmaling.common.capture-date.required` | Datafangstdato er oppgitt | `captureDate` | common; all points and lines | Required for all | STANDARD; Appendix A pp. 5–6; requiredness HIGH | `REQ`; date pattern/calendar validity deferred | None | Add in A8 |
| `innmaling.common.surveyed-by.required` | Innmålt av er oppgitt | `surveyedBy` | common; all points and lines | Required for all | STANDARD; Appendix A pp. 5–6; HIGH | `REQ`; no source-backed syntax beyond supplied text | None | Add in A8 |
| `innmaling.common.case-number.required` | Saksnummer er oppgitt | `caseNumber` | common; all points and lines | Required for all | STANDARD; Appendix A pp. 5–6; HIGH | `REQ`; no additional syntax asserted | None | Add in A8 |
| `innmaling.common.horizontal-accuracy.required` | Nøyaktighet XY er oppgitt | `horizontalAccuracy` | common; all points and lines | Required for all | STANDARD; Appendix A pp. 5, 8; presence HIGH, range policy deferred | `REQ`; integer/≤3 cm/exception policy not claimed by A8 | None; remains distinct from Z accuracy | Add in A8 |
| `innmaling.common.vertical-accuracy.required` | Nøyaktighet høyde Z er oppgitt | `verticalAccuracy` | common; all points and lines | Required for all | STANDARD; Appendix A pp. 5, 8; presence HIGH, range policy deferred | `REQ`; integer/≤5 cm/exception policy not claimed by A8 | None; remains distinct from XY accuracy | Add in A8 |
| `innmaling.common.max-horizontal-deviation.required` | Maksavvik horisontalt er oppgitt | `maxHorizontalDeviation` | common; all points and lines | Required for all | STANDARD; Appendix A pp. 5, 10; presence HIGH, range policy deferred | `REQ`; integer/20 cm interpretation not claimed by A8 | None | Add in A8 |
| `innmaling.common.max-vertical-deviation.required` | Maksavvik vertikalt er oppgitt | `maxVerticalDeviation` | common; all points and lines | Required for all | STANDARD; Appendix A pp. 5, 10; presence HIGH, range policy deferred | `REQ`; integer/30 cm interpretation not claimed by A8 | None | Add in A8 |
| `innmaling.common.positioning-condition.valid` | Stedfestingsforhold er gyldig | `positioningCondition` | common; all points and lines | Required for all | STANDARD; Appendix A pp. 5, 8–9; requiredness and exact set HIGH | `REQ_ENUM_EXACT`: `DELV_LUKK_GRØ`, `I_TUNNEL`, `I_VANN`, `IKKE_STEDF`, `LUKK_GRØ`, `OVERFL_VANN`, `POS_FRA_KUM`, `PÅVI`, `ÅPEN_GRØ`, `ÅPEN_KUM` | None | Add in A8 |
| `innmaling.common.positioning-cause.valid` | Stedfestingsårsak er gyldig | `positioningCause` | common; all points and lines | Required for all | STANDARD; Appendix A pp. 5, 9; requiredness and exact set HIGH | `REQ_ENUM_EXACT`: `FJERN`, `FLYTT_DELV`, `FLYTT_HELT`, `NYTT`, `PÅVI`, `UENDR` | None | Add in A8 |
| `innmaling.common.visibility.valid` | Synbarhet er gyldig | `visibility` | common; all points and lines | Required for all | STANDARD; Appendix A pp. 5, 9; requiredness and exact set HIGH | `REQ_ENUM_INTEGER_CODE`: source codes `0`, `1`, `2`, `3` | None; field-scoped parser representation only | Add in A8 with narrow comparison policy |

For every row in this table, exact PASS/FAIL/INDETERMINATE/NOT_EVALUATED, absent/missing treatment, and reason codes are those of the named profile in section 3. No row has a Tema/classification dependency.

### 4.2 Point rules — 5

| Proposed rule ID | Norwegian display label | Canonical field | Applicability | Requirement | Source/provenance; confidence | Profile / allowed values | Dependencies | A8 disposition |
|---|---|---|---|---|---|---|---|---|
| `innmaling.point.tema.required` | Punktobjekt har Tema | `tema` | point; all points | Required for all points | STANDARD; Appendix A pp. 5, 11–13; presence HIGH; GMI fallback is accepted format practice | `TEMA_REQ`; no closed Tema value set | A3 identity only; no downstream classification in this rule | Keep existing A7 rule |
| `innmaling.point.inside-outside.valid` | Punktets innvendig/utvendig-kode er gyldig | `insideOutside` | point; all points | Required for all points | STANDARD; Appendix A pp. 5, 15; requiredness/set HIGH; direct unsuffixed binding HIGH | `REQ_ENUM_EXACT`: `ID`, `OD` | None; geometry is rule scope, not field suffix | Add in A8 |
| `innmaling.point.wall-thickness.required` | Punktets tykkelse er oppgitt | `wallThickness` | point; all points | Required for all points | STANDARD; Appendix A pp. 5, 15; requiredness HIGH; direct unsuffixed binding HIGH | `REQ`; integer/mm format deferred | None; line Tykkelse is optional and is not covered | Add in A8 |
| `innmaling.point.nobb-vavvs-number.required` | Punktets NOBB/VAVVS-nummer er oppgitt | `nobbVavvsNumber` | point; all points | Required for all points | STANDARD; Appendix A pp. 5, 17; HIGH; direct unsuffixed binding HIGH | `REQ`; integer/“usually seven digits” is not asserted as a strict A8 rule | None | Add in A8 |
| `innmaling.point.nobb-vavvs-frame-number.required` | Rammens NOBB/VAVVS-nummer er oppgitt | `nobbVavvsFrameNumber` | point; all points | Required for all points | STANDARD; Appendix A pp. 5, 18; HIGH | `REQ`; integer/“usually seven digits” is not asserted as a strict A8 rule | None | Add in A8 |

All point rows use the section 3 profile exactly. Opposite-geometry line refs are excluded rather than counted as NOT_EVALUATED.

### 4.3 Line rules — 6

| Proposed rule ID | Norwegian display label | Canonical field | Applicability | Requirement | Source/provenance; confidence | Profile / allowed values | Dependencies | A8 disposition |
|---|---|---|---|---|---|---|---|---|
| `innmaling.line.tema.required` | Ledning har Tema | `tema` | line; all lines | Required for all lines | STANDARD; Appendix A pp. 6, 19–21; presence HIGH; GMI fallback is accepted format practice | `TEMA_REQ`; no closed Tema value set | A3 identity only; no hydraulic classification in this rule | Keep existing A7 rule |
| `innmaling.line.dimension.required` | Ledningens dimensjon er oppgitt | `dimension` | line; all lines | Required for all lines | STANDARD; Appendix A pp. 6, 23; HIGH; direct/case-only `Dimensjon` binding HIGH | `REQ`; integer/mm format deferred | None; `DIMENSJON` may resolve as case-only, `DIM` cannot | Add in A8 |
| `innmaling.line.network-type.valid` | Nett-type er gyldig | `networkType` | line; all lines | Required for all lines | STANDARD; Appendix A pp. 6, 21–22; requiredness/set HIGH | `REQ_ENUM_EXACT`: `F`, `H`, `O`, `S`, `S6` | None; Nett_type does not classify pressure/gravity | Add in A8 |
| `innmaling.line.inside-outside.valid` | Ledningens innvendig/utvendig-kode er gyldig | `insideOutside` | line; all lines | Required for all lines | STANDARD; Appendix A pp. 6, 23; requiredness/set HIGH; direct unsuffixed binding HIGH | `REQ_ENUM_EXACT`: `ID`, `OD` | None | Add in A8 |
| `innmaling.line.pipe-shape.valid` | Rørform er gyldig | `pipeShape` | line; all lines | Required for all lines | STANDARD; Appendix A pp. 6, 23–24; requiredness/set HIGH | `REQ_ENUM_EXACT`: `A`, `E`, `F`, `R`, `S`, `T`, `X` | None; distinct from point Kumform | Add in A8 |
| `innmaling.line.nobb-vavvs-number.required` | Ledningens NOBB/VAVVS-nummer er oppgitt | `nobbVavvsNumber` | line; all lines | Required for all lines | STANDARD; Appendix A pp. 6, 25; HIGH; direct unsuffixed binding HIGH | `REQ`; integer/“usually seven digits” is not asserted as a strict A8 rule | None | Add in A8 |

All line rows use the section 3 profile exactly. Opposite-geometry point refs are excluded rather than counted as NOT_EVALUATED.

## 5. B. DEFER

Deferred means the concept is plausible or source-backed but is not safe for A8. None of these fields may satisfy an A8 rule indirectly, and none should appear as a new active failure until its prerequisite is resolved.

### 5.1 Deferred practical-rule behavior

For the static deferred rules below, eventual behavior should match `REQ_ENUM_EXACT` or `REQ` after the stated value/format question is settled. For conditional rules:

- predicate true + valid supplied evidence -> PASS;
- predicate true + `FIELD_ABSENT`/`VALUE_MISSING` -> FAIL with the usual distinct reasons;
- predicate true + invalid restricted value -> FAIL / `VALUE_NOT_ALLOWED`;
- predicate false -> NOT_EVALUATED, not PASS and not an “unexpected value” failure unless a source explicitly forbids the value;
- missing/unknown/conflicting prerequisite Tema or classification -> NOT_EVALUATED with a future applicability reason, not a fabricated downstream failure;
- ambiguous/unresolved/unavailable binding after applicability is known true -> INDETERMINATE.

The current result model counts NOT_EVALUATED but does not retain a reason for it. A later conditional-rule milestone should decide whether a compact non-finding applicability reason is needed.

### 5.2 Deferred rule matrix

| Candidate rule ID | Norwegian label | Canonical field | Class / exact intended applicability | Requiredness / allowed-value behavior | Source/provenance; confidence | Dependency and reason to defer | Safe stage |
|---|---|---|---|---|---|---|---|
| `innmaling.common.measurement-method.valid` | Målemetode XY er gyldig | `measurementMethod` | common; all points/lines | Required; absent/missing/invalid fail; full Appendix code list, not legacy four-value subset | STANDARD; Appendix A pp. 5, 7, 26–29; mandatory HIGH, complete executable list MEDIUM | Complete code-table transcription/version and parser numeric-code comparison need review; XY stays independent | A9 typed code/value pass |
| `innmaling.common.height-measurement-method.valid` | Målemetode høyde Z er gyldig | `heightMeasurementMethod` | common; all points/lines | Required; absent/missing/invalid fail; full Appendix code list | STANDARD; Appendix A pp. 5, 8, 29–30; mandatory HIGH, complete executable list MEDIUM | Same as above; Z stays independent and H_* aliases remain disabled | A9 typed code/value pass |
| `innmaling.common.vertical-level.valid` | Vertikalnivå er gyldig | `verticalLevel` | common; all points/lines | Source appears required with seven codes | STANDARD; Appendix A pp. 5, 10; MEDIUM pending source-version verification | Legacy says optional and has `!_VANNSØYLEN`; source appears mandatory and says `I_VANNSØYLEN` | A9 source decision |
| `innmaling.line.material.valid` | Material er gyldig | `material` | line; all lines | Required; absent/missing/invalid fail against reviewed complete list | STANDARD; Appendix A pp. 6, 22–23; mandatory HIGH, exact list MEDIUM | `PVC-O` source versus legacy `PVC-0` must be formally resolved; Material cannot classify hydraulics | A9 source decision |
| `innmaling.point.construction-method.valid` | Byggemetode er gyldig | `constructionMethod` | point; actual applicable object classes unknown | Source list is unstarred and code set is exact, but all-point versus class-specific requiredness is unresolved | STANDARD plus possible PRAKSIS profile; MEDIUM | Legacy subset `KUM/LOK/SAN/SLS/SLU` is unsupported by source | After applicability decision |
| `innmaling.point.manhole-shape.valid` | Kumform er gyldig | `manholeShape` | point; qualifying structures unknown | Required when applicable; seven exact codes | STANDARD plus possible PRAKSIS profile; MEDIUM | Legacy subset is unsupported; must not apply to every point blindly | After applicability decision |
| `innmaling.point.cone.valid` | Kjegle er gyldig | `cone` | point; qualifying structures unknown | Required when applicable; five exact codes | STANDARD plus possible PRAKSIS profile; MEDIUM | Legacy subset is unsupported; exact point/Tema predicate not approved | After applicability decision |
| `innmaling.point.width.required-unless-polygon` | Bredde er oppgitt når polygon ikke avgrenser objektet | `width` | point; non-polygon boundary objects | Required only when boundary is not supplied as polygon | STANDARD; Appendix A p. 5 and main pp. 14–15; condition HIGH, executable predicate MEDIUM | Parsed point layer does not yet expose a proven polygon-boundary relationship; only `Bredde` may satisfy it | Conditional/geometry milestone |
| `innmaling.point.length.required-unless-polygon` | Lengde er oppgitt når polygon ikke avgrenser objektet | `length` | point; exact relation to Bredde and polygon unresolved | Possibly required as the second planar dimension | STANDARD; Appendix A pp. 5, 15; MEDIUM | Source expression `Bredde (/ Lengde)` does not justify the legacy universal separate rule | Conditional/geometry milestone |
| `innmaling.point.external-height.required` | Utvendig høyde er oppgitt når nødvendig | `externalHeight` | point; selected non-circular/prefabricated objects | Conditional | STANDARD; Appendix A pp. 5, 16; LOW/MEDIUM | Appendix list marks optional while prose suggests conditional necessity | After source/domain decision |
| `innmaling.point.inner-bottom-distance.required-circular-prefab` | Avstand bunn innvendig til underkant utvendig er oppgitt | `innerBottomToOuterUndersideDistance` | point; circular prefabricated installations | Required when predicate true | STANDARD; Appendix A p. 16 and main p. 14; condition HIGH | No approved circular/prefabricated classification model | Conditional classification milestone |
| `innmaling.point.facility-id-or-sid.required` | Punktobjekt har AnleggsID eller SID | `facilityId` plus unresolved SID concept | point; intended all/available semantics conflict | Cross-field alternative, not two required rules | STANDARD; main p. 25 versus Appendix A pp. 5, 17; conflicting | Source says both “where available” and AnleggsID-or-SID; SID has no approved canonical GMI mapping | After source/cross-field decision |
| `innmaling.point.attachment-link.required-gemini-terreng` | Vedleggslenke finnes for Gemini Terreng | `attachmentLink` | point; only Gemini Terreng suppliers | Conditional generated field | STANDARD; Appendix A pp. 5, 17; condition HIGH | Input says GMI, not whether supplier/workflow is Gemini Terreng; generated-field semantics unresolved | Profile/workflow milestone |
| `innmaling.line.attachment-link.required-gemini-terreng` | Vedleggslenke finnes for Gemini Terreng | `attachmentLink` | line; only Gemini Terreng suppliers | Conditional generated field | STANDARD; Appendix A pp. 6, 25; condition HIGH | Same missing workflow predicate | Profile/workflow milestone |
| `innmaling.line.vertical-dimension.required-noncircular` | Vertikal dimensjon er oppgitt for ikke-sirkulært rør | `verticalDimension` | line; non-circular pipes | Conditional | STANDARD; Appendix A p. 23; condition HIGH | Exact relation to Rørform and horizontal Dimensjon needs a reviewed predicate | Conditional classification milestone |
| `innmaling.line.pressure.sdr.valid` | Trykkledning har gyldig SDR | `sdr` | line; only Tema/classification-proven pressure lines (known mapping VL/SPP) | Required when pressure; source lexical decimal codes; absence/missing/invalid fail | STANDARD; Appendix A pp. 6, 24; condition HIGH, full classification/value execution incomplete | Tema-first hydraulic classifier and typed lexical code handling are prerequisites; never infer class from SDR | A9 classification/value foundation or later |
| `innmaling.line.gravity.ring-stiffness.valid` | Selvfallsledning av plast har gyldig ringstivhet | `ringStiffness` | line; Tema/classification-proven gravity (known SP/OV) **and plastic** | Required when both predicates true; exact codes | STANDARD; Appendix A pp. 6, 24; condition HIGH, classifier/material predicate incomplete | Tema-first hydraulic classifier plus a reviewed plastic-material predicate; never infer class from Ringstivhet | A9 classification foundation or later |
| `innmaling.line.pressure.height-reference.valid` | Trykkledning har topp utvendig som høydereferanse | `heightReference` | line; classification-proven pressure | Required value `TOPP_UTVENDIG` | STANDARD; main p. 18; condition HIGH, classifier incomplete | Must not be folded into the unconditional A8 height-reference rule before classification succeeds | After hydraulic classification |
| `innmaling.point.type.valid-when-supplied` | Type er gyldig når den er oppgitt | `type` | point; supplied/“where available” | Missing is NOT_EVALUATED; invalid supplied value could fail after list correction | STANDARD; Appendix A pp. 5, 13–14; MEDIUM | `DB*` source tokens are mistranscribed as `D8*`; legacy object subset unsupported | A9 source/value review; not required coverage |
| `innmaling.line.pressure-class.valid-when-supplied` | Trykklasse er gyldig når den er oppgitt | `pressureClass` | line; optional pressure property when supplied | Missing is NOT_EVALUATED; exact allowed set only when supplied | STANDARD; Appendix A pp. 6, 25; value set HIGH, applicability depends on classification | Trykklasse is explicitly optional and cannot classify hydraulics; no source-backed rule forbids it elsewhere | Later optional-value validation |

Known deferred code sets must remain attached to the eventual practical rules, not become separate user-facing allowed-value cards:

- Byggemetode: `B`, `BU`, `E`, `E0`, `E1`, `G`, `K`, `M`, `MU`, `P`, `S`, `SU`, `UK`, `V`, `W` (source-exact set; applicability unresolved).
- Kumform: `AN`, `F`, `FK`, `FR`, `N`, `R`, `X` (source-exact set; applicability unresolved).
- Kjegle: `E`, `R`, `S`, `T`, `U` (source-exact set; applicability unresolved).
- Vertikalnivå: `UNDER_GRUNN`, `PÅ_GRUNN_VANNOVERF`, `OVER_GRUNN`, `PÅ_BUNN`, `I_VANNSØYLEN`, `SLISSING`, `UNDER_BUNN`; the legacy `!_VANNSØYLEN` must not be copied.
- Ringstivhet: `SN2`, `SN4`, `SN5`, `SN6`, `SN8`, `SN10`, `SN16` once both hydraulic and plastic applicability are established.
- SDR: the twelve source lexical codes `6.0`, `7.4`, `7.5`, `9.0`, `11.0`, `13.6`, `17.0`, `17.6`, `21.0`, `26.0`, `33.0`, `41.0`; parser numeric coercion must not erase the code policy.
- Trykklasse when supplied: `PN1`, `PN2`, `PN2.5`, `PN3.2`, `PN4`, `PN5`, `PN6`, `PN6.3`, `PN8`, `PN10`, `PN12`, `PN12.5`, `PN16`, `PN20`, `PN25`.
- Material: use the reviewed Appendix A 39-code set only after formally resolving source `PVC-O` versus legacy `PVC-0`.
- Type: use corrected Appendix A `DB*` tokens (`DB11`, `DB15`, `DB22`, `DB30`) rather than legacy `D8*`; the full list and “where available” semantics remain deferred.
- Målemetode XY/Z: transcribe the complete Appendix A pp. 26–30 lists; the current four-value subsets are explicitly insufficient.

### 5.3 Deferred format/range stages for A8-included fields

These should not become duplicate required rules. They are later validation stages or separately named format/quality requirements:

- `installationYear`: exact `YYYY` handling after deciding how parser-number input represents lexical format;
- `captureDate`: `DD.MM.YYYY` pattern versus calendar-valid date and leading-zero policy;
- `horizontalAccuracy` / `verticalAccuracy`: integer syntax, ≤3 cm / ≤5 cm, and the “unless otherwise agreed” exception mechanism;
- `maxHorizontalDeviation` / `maxVerticalDeviation`: integer syntax and correct relationship between the instruction's 20/30 cm policy and area-dependent LAGS rules;
- point/line NOBB fields: integer syntax only; “usually seven digits” must not be promoted to a strict length rule without authority;
- point wall thickness and line dimension: integer/mm syntax.

## 6. C. DO NOT IMPLEMENT

The following are not merely waiting for A8 capacity; they are contradicted, defective, unsupported, optional, or technical/UI behavior and must not be copied as universal STANDARD failures:

| Behavior | Classification | Decision |
|---|---|---|
| Unknown source fields fail validation | Unsupported | Keep A1 diagnostics informational only; do not read unknown values to infer compliance |
| Misspellings/lookalikes silently satisfy canonical fields | Adapter defect | Reject; unresolved candidates remain INDETERMINATE evidence, not PASS |
| Point width satisfied by `DIM`, `DIMENSJON`, `Dimensjon`, or `DIAMETER` | Contradicted/ambiguous mapping | Reject; only direct/case-only `Bredde` supplies point width |
| Line dimension satisfied by `DIM` | Unresolved alias | Reject; direct/case-only `Dimensjon`/`DIMENSJON` only |
| H_* fields routed to XY Nøyaktighet or collapsed XY/Z measurement semantics | Unsupported/semantic collision | Reject; preserve four independent canonical concepts |
| `_punkt`/`_led` logical keys treated as delivered GMI field names | Confirmed legacy defect | Reject; geometry belongs to rules |
| Adkomst required for every point | Contradicts source star marking | Do not implement as required; it is optional but desired |
| Merknad or Eier required | Contradicts source optional marking | Do not implement as required |
| Line Tykkelse required | Contradicts source optional marking | Do not implement as required |
| Trykklasse required | Contradicts source optional marking | Do not invent; optional value validation is deferred |
| Default unknown Tema/hydraulic identity to gravity | Legacy defect | Reject; UNKNOWN remains UNKNOWN |
| Determine hydraulic class from SDR, Ringstivhet, Trykklasse, Material, or Nett_type presence | Circular/unsupported classifier | Reject; Tema/object identity is first |
| Universal pressure/gravity rule before Tema resolves | Unsafe downstream behavior | Reject; missing Tema is primary and class-dependent rules do not pretend success |
| Legacy hardcoded Tema subsets for Bredde, Byggemetode, Kumform, Kjegle, or Type as universal source policy | Unsupported PRAKSIS heuristic | Do not implement as STANDARD; only a later sourced/profile rule may use a reviewed subset |
| Any supplied value outside a guessed applicability predicate automatically fails | Source not found | Reject unless a named source says the value is forbidden |
| Universal `parseFloat`, trimming, case folding, punctuation removal, transliteration, or stringify comparison for codes | Legacy technical defect/policy gap | Reject; use exact or narrowly declared field-type comparison only |
| `Z = 0` means missing | Source not found and potentially false | Do not implement; valid finite zero must remain possible |
| Prevalence changes severity (all missing = error, some missing = warning) | Legacy UI policy | Reject; keep fixed rule severity and independent counts |
| One validation run per Punkter/Ledninger tab | Architecture contradiction | Reject; both tabs remain views over the same completed selected-layer run |
| Validator 1.0 rule/config changes as part of A8 | Out of scope | Do not touch |

## 7. Evaluator and registry design

### 7.1 Evaluators

The existing evaluator categories are sufficient:

- `REQUIRED` for the plain A8 presence rules;
- `REQUIRED_ALLOWED_VALUE` for the combined practical code rules;
- the specialized Tema required path for existing Tema identity semantics.

No conditional evaluator and no new public category is needed for the recommended A8 set. The runner already caches evidence by canonical field/ObjectRef, so point and line rules sharing `insideOutside`, `nobbVavvsNumber`, or `tema` do not cross geometry and do not require duplicate extraction logic.

One narrowly scoped evaluator enhancement is required for `Synbarhet`. The source codes are lexical `"0"`–`"3"`, while the unchanged GMI parser turns integer-looking field values into numbers and A4 correctly reports `sourceLexeme: UNAVAILABLE`. A8 should add an explicit comparison policy such as:

```text
valueComparison: EXACT | INTEGER_CODE_STRING
```

`INTEGER_CODE_STRING` must accept only safe integer raw numbers whose canonical base-10 string exactly belongs to the declared source list, plus exact string codes for direct synthetic/unit evidence. It must reject decimals, signs not present in the list, booleans, leading-zero guesses, prefix parses, and every unrelated field. It is not generic numeric equivalence and must not be reused for SDR or measurement-method codes without separate review.

### 7.2 Registry metadata

The rule registry already has the necessary identity, canonical field, geometry scope, evaluator kind, category, Norwegian title/description, severity, STANDARD provenance, document/pages, and allowed values.

Only the explicit `valueComparison` metadata above is needed. Registry guards should require:

- `NONE` for `REQUIRED` rules;
- `EXACT` for Høydereferanse, Stedfestingsforhold, Stedfestingsårsak, point/line InnvendigUtvendig, Nett_type, and Rørform;
- `INTEGER_CODE_STRING` only for `visibility` in A8;
- a non-empty, duplicate-free source list for combined value rules;
- no hardcoded rule-count invariant (`rules.length === 3` must become structural validation, while A8 tests assert the reviewed expected inventory).

No canonical-field registry extension, alias change, schema-binder change, extractor change, classification metadata, conditional applicability DSL, profile system, or new provenance class is required for A8.

## 8. Counts and one-run geometry reconciliation

The current A7 model remains correct as rule count grows. For every rule result, tests must enforce:

```text
evaluatedObjectCount = point.evaluatedCount + line.evaluatedCount
passCount = point.passCount + line.passCount
failCount = point.failCount + line.failCount
notEvaluatedCount = point.notEvaluatedCount + line.notEvaluatedCount
indeterminateCount = point.indeterminateCount + line.indeterminateCount
findings.length = failCount + indeterminateCount
point.findingCount + line.findingCount = findings.length
```

Additional invariants:

- common rules evaluate both geometry collections from the same run;
- point rules have zero line counts and line rules have zero point counts;
- `summary.evaluatedPointCount` and `summary.evaluatedLineCount` remain object counts, not sums across rules;
- geometry-tab FAIL/INDETERMINATE totals are sums of rule findings in that geometry and therefore represent issues, not unique affected objects;
- switching tabs never invokes the runner or changes layer/revision/result identity;
- a field present in one geometry schema cannot satisfy the other geometry in the same layer;
- no layer can borrow a binding or object from another layer.

## 9. Finding grouping and A8 usability boundary

A7 grouping remains adequate for A8:

- rule rows are collapsed by default;
- only the active geometry's common and geometry-specific rules are shown;
- findings are grouped within a rule by stable reason and safe observed value;
- the first 15 object positions remain bounded until the user expands the group;
- exact ObjectRef identity and source-index display behavior stay unchanged.

The one UI defect that **must** change in A8 is the hardcoded header text `Beta · GMI · 3 regler`. It must derive the count from the active reviewed registry before a run or `result.summary.totalRules` after a run. The registry validator's hardcoded “exactly 3” invariant must also be removed.

No redesign, search/filter panel, map navigation, table integration, severity redesign, virtual required-field columns, or new summary cards are required for A8. Long-list virtualization/pagination and schema-wide finding compaction should become an A9 scale task if representative performance tests show that 23 rules over large layers make materialized finding arrays or `Vis alle` rendering unacceptable. A8 should at least add a representative synthetic scale regression so this decision is evidence-based.

## 10. Test strategy

### 10.1 Rule-level matrix tests

Use parameterized tables driven by the reviewed expected rule IDs, not by importing documentation JSON. For every new rule test:

- registry identity, title, canonical field, exact scopes, category, source pages, severity, and provenance;
- expected allowed list and comparison mode;
- present valid value -> PASS;
- absent schema field -> FAIL / `REQUIRED_FIELD_ABSENT` for each applicable object;
- bound field with null, undefined, or empty string -> FAIL / `REQUIRED_VALUE_MISSING`;
- invalid present enum -> FAIL / `VALUE_NOT_ALLOWED`;
- unique case-only direct header -> same semantic result with literal provenance retained.

### 10.2 Binding uncertainty

For at least one common, point, and line A8 rule, cover:

- competing case forms/targets -> INDETERMINATE / `BINDING_AMBIGUOUS`;
- only recognized unresolved key -> INDETERMINATE / `UNRESOLVED_SOURCE`;
- no trustworthy schema metadata and no attribute fallback -> INDETERMINATE / `SCHEMA_UNAVAILABLE`;
- suspected/disabled aliases do not satisfy requiredness;
- unknown source fields create diagnostics only and never FAIL.

Retain the Tema-specific direct/fallback agreement, direct preference, object-level fallback, missing, unresolved, and conflict tests.

### 10.3 Value semantics

- preserve `0`, `false`, and other non-empty primitive values as present;
- preserve the current explicit no-V2-trim/no-case-fold evaluator contract;
- prove exact code matching for all A8 enumerations;
- prove `visibility` accepts parser numbers `0`–`3` and exact strings in isolated evaluator tests;
- prove `visibility` rejects `-0`, `4`, the string `"1.0"`, booleans, text prefixes/suffixes, and unrelated numeric normalization;
- prove the new comparison mode does not change Høydereferanse or any other exact-code rule;
- do not assert date/year/range/length validity in A8 required-only tests.

### 10.4 Applicability and geometry

- common rule with points and lines reconciles both breakdowns;
- common field absent in point schema but present in line schema fails only points;
- each point rule reads point attributes only and has zero line evaluations;
- each line rule reads line attributes only and has zero point evaluations;
- point `Bredde` aliases cannot satisfy any A8 rule; line `DIM` cannot satisfy `dimension`;
- shared unsuffixed `InnvendigUtvendig` and NOBB fields resolve independently in point and line schemas;
- empty point, empty line, point-only, line-only, and fully empty datasets retain A7 status behavior.

### 10.5 Aggregation, UI, and scale

- all top-level/per-geometry equations in section 8 for PASS, FAIL, INDETERMINATE, and mixed evidence;
- both tabs consume one runner result and do not rerun on tab changes;
- common rules appear in both tabs, point/line rules only in their own tab;
- displayed beta rule count is dynamic and equals 23 for the A8 registry;
- grouping remains stable for every existing/new reason and numeric visibility values;
- unknown-field disclosure counts stay informational;
- representative multi-thousand-object synthetic run records runtime/result-size baselines and ensures the UI keeps bounded initial rendering.

### 10.6 Isolation and regression

- two-layer tests prove no cross-layer binding, value, ObjectRef, count, or result leakage;
- selected-layer change and dataset replacement continue invalidating stale results;
- runner reads only fields referenced by active rules and never arbitrary metadata/coordinates;
- full A0-A7 contract suite remains green after updating only assertions that intentionally hardcode the old three-rule inventory/header;
- Validator 1.0 default mode/path remains unchanged;
- GMI-only gate remains unchanged; SOSI/KOF still do not run V2;
- full Node test suite, changed-file ESLint, frontend build, and `git diff --check` pass.

## 11. Expected A8 implementation files

Expected production/runtime changes are limited to:

- `src/lib/validation-v2/contracts.js` — explicit value-comparison enum/JSDoc only;
- `src/lib/validation-v2/registry/rules.js` — 20 new rules, reviewed code sets, comparison metadata, and structural rather than three-rule count validation;
- `src/lib/validation-v2/ruleEvaluation.js` — narrow comparison-mode support inside the existing combined evaluator;
- `src/lib/validation-v2/validationRunner.js` — pass declared comparison policy to the evaluator; no run-scope or aggregation redesign;
- `src/components/validation-v2/ValidationV2Workspace.js` — dynamic rule count instead of `3 regler`.

Expected tests/documentation:

- `tests/validationV2GmiA5.test.mjs` — registry/evaluator expectations generalized while retaining A5 contracts;
- `tests/validationV2GmiA7.test.mjs` — intentional count/header assertions updated; one-run/tab/grouping behavior retained;
- `tests/validationV2GmiA8.test.mjs` — new complete rule matrix, geometry, reconciliation, isolation, UI count, and scale coverage;
- an A8 implementation report under `docs/agent-reports/`.

No change is expected in the canonical field registry, GMI schema binder, Tema resolver, object extractor, parser, stores, production configuration, legacy rule JSON, Validator 1.0 modules, map, or data table.

## 12. Proposed A9 follow-up

A9 should be a **typed values and conditional-applicability foundation**, not another indiscriminate rule batch.

Recommended A9 order:

1. verify/transcribe complete Målemetode XY/Z and corrected Vertikalnivå/Material code sets and add field-specific comparison policies without global coercion;
2. add format/range stages for A8 fields where exception policy is resolved;
3. introduce an explainable Tema-first classification result with `RESOLVED`, `UNKNOWN`, and conflict/unavailable behavior;
4. use that model to decide the deferred SDR/Ringstivhet rules, including the plastic condition and explicit NOT_EVALUATED behavior;
5. define reviewed conditional predicates for point construction/dimension fields and Gemini-only generated fields;
6. measure and, if needed, compact/paginate large finding sets without changing one-run geometry semantics.

Trykklasse remains optional. Tema code-list closure remains deferred until the free-text fallback is interpreted. Unknown Tema remains UNKNOWN. No hydraulic rule may use SDR, Ringstivhet, Trykklasse, Material, or Nett_type to classify the line it is validating.

## 13. Final A8 acceptance criteria

A8 is complete only when:

- the active immutable registry contains exactly the reviewed 23 rules (12 common, 5 point, 6 line);
- the 20 new rules implement the exact section 3 behavior and no deferred field is activated;
- all restricted A8 code fields are one combined practical rule, not separate existence/value cards;
- FIELD_ABSENT and VALUE_MISSING remain separate FAIL reasons;
- ambiguous/unresolved/unavailable schema evidence remains INDETERMINATE;
- unknown fields remain informational;
- point/line/common applicability and every reconciliation equation hold;
- one selected-layer run continues to drive both geometry tabs;
- the visible count is dynamic and no three-rule hardcoding remains;
- A0-A7 contracts, Validator 1.0 behavior, GMI-only gating, and cross-layer isolation remain intact;
- no production configuration, merge, push, or deployment occurs as part of implementation.
