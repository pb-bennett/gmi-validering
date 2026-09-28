# Validator V2: existing objects and missing-field audit

Audit date: 2026-09-28. Branch: `feature/styling-overhaul-integrated`. Starting HEAD: `93d407f8f6c5e3e5643655d723144ee066b3da37`.

## Existing-object logic

Validator V2 has **no general predicate for “object existed before this project but was discovered or measured now.”** It has no separate field for discovery date or current-project status in the audited rules. The nearest proxy is the common field `Stedfestingsårsak`: the evaluator checks for a *valid* value of `UENDR` in three line-field missing-value branches. `NYTT` is used separately by the Anleggsår rule. This is an inference from a positioning-cause code, not a verified object-age classification. It applies to lines only for missing `Tykkelse`, conditionally required `SDR`, and conditionally required `Ringstivhet`; it does not soften invalid supplied values or any point rule. Sources: `src/lib/validation-v2/fieldPolicy.js`, `src/lib/validation-v2/validationRunner.js`, `tests/validationV2RealDataPolish.test.mjs`.

The tables cover active rules whose missing value can produce FEIL or SJEKK. “All” means all objects in that geometry family, regardless of Tema. `UENDR` in the special-handling column means a valid `Stedfestingsårsak = UENDR`.

## Table 1 — Points / punkter

| Field | Applicable Tema / object types | Missing currently produces | Rule/helper/source owner | Existing-object special handling today? | Present-but-invalid severity | Notes |
|---|---|---|---|---|---|---|
| Høydereferanse | All points | FEIL | `common.height-reference.valid` / `heightReference` | No | FEIL for unlisted code | `UKJENT` is valid but SJEKK. |
| Anleggsår | All points | FEIL with `NYTT`; otherwise SJEKK | `common.installation-year.required` / `installationYear` | Only the `NYTT` distinction; no existing-object predicate | FEIL for bad YYYY or future year | `0000` and years before 1900 give SJEKK. |
| Målemetode | All points | FEIL | `common.measurement-method.required` / `measurementMethod` | No | FEIL for unlisted code | Some valid codes give SJEKK. |
| MålemetodeHøyde | All points | FEIL | `common.height-measurement-method.required` / `heightMeasurementMethod` | No | FEIL for unlisted code | Some valid codes give SJEKK. |
| Vertikalnivå | All points | FEIL | `common.vertical-level.required` / `verticalLevel` | No | FEIL for unlisted code | Some valid codes give SJEKK. |
| Datafangstdato | All points | FEIL | `common.capture-date.required` / `captureDate` | No | FEIL for invalid/future date or date before usable Anleggsår | Old valid dates give SJEKK. |
| Innmålt_av | All points | FEIL | `common.surveyed-by.required` / `surveyedBy` | No | No code-list check; placeholder text gives SJEKK | A placeholder is supplied information, not missing. |
| Nøyaktighet XY | All points | FEIL | `common.horizontal-accuracy.required` / `horizontalAccuracy` | No | FEIL for format/negative; zero or above preferred limit SJEKK | |
| Nøyaktighet høyde Z | All points | FEIL | `common.vertical-accuracy.required` / `verticalAccuracy` | No | FEIL for format/negative; zero or above preferred limit SJEKK | |
| Maksavvik horisontalt | All points | FEIL | `common.max-horizontal-deviation.required` / `maxHorizontalDeviation` | No | FEIL for format/negative/above allowed limit; zero SJEKK | |
| Maksavvik vertikalt | All points | FEIL | `common.max-vertical-deviation.required` / `maxVerticalDeviation` | No | FEIL for format/negative/above allowed limit; zero SJEKK | |
| Stedfestingsforhold | All points | FEIL | `common.positioning-condition.valid` / `positioningCondition` | No | FEIL for unlisted code | Some valid codes give SJEKK. |
| Stedfestingsårsak | All points | FEIL | `common.positioning-cause.valid` / `positioningCause` | No | FEIL for unlisted code | A valid non-`NYTT` code can separately get SJEKK for sharing a `NYTT` Anleggsår. |
| Tema | All points | FEIL | `point.tema.required` / `tema` identity | No | FEIL for unlisted Tema; conflicting identity is unresolved/SJEKK | Tema can come from the supported identity sources. |
| Type | `DIV`: required; other Tema with known Type mappings: expected | `DIV` FEIL; known mappings SJEKK; otherwise PASS | `point.type.valid` / `type` | No | FEIL for unlisted Type; incompatible Type–Tema FEIL under separate rule | Unresolved Tema suppresses the missing conclusion. |
| Kumform | Point Tema marked applicable by explicit policy | FEIL when applicable; otherwise PASS | `point.manhole-shape.valid` / `manholeShape` | No | FEIL for unlisted code | Depends on resolved Tema. |
| Byggemetode | Point Tema marked applicable | FEIL when applicable; otherwise PASS | `point.construction-method.valid` / `constructionMethod` | No | FEIL for unlisted code | Valid `UK` gives SJEKK. |
| Kjegle | Point Tema marked applicable | FEIL when applicable; otherwise PASS | `point.cone.valid` / `cone` | No | FEIL for unlisted code | |
| InnvendigUtvendig | All points | FEIL | `point.inside-outside.valid` / `insideOutside` | No | FEIL unless `ID` or `OD` | |
| Bredde | Point Tema marked applicable, including `LOK`; `INR` is optional | FEIL when applicable; otherwise PASS | `point.width.integer` / `width` | No | FEIL for malformed/negative; low valid values SJEKK | |
| Tykkelse | Point Tema marked applicable | FEIL when applicable; otherwise PASS | `point.wall-thickness.integer` / `wallThickness` | No | FEIL for non-integer/negative; zero SJEKK | The older unconditional `point.wall-thickness.required` owner is **inactive**. |
| Avst_BunnInnvUnderUtv | Point Tema marked applicable | FEIL when applicable; otherwise PASS | `point.bottom-distance.decimal` / `bottomDistance` | No | FEIL for malformed/negative; zero SJEKK | No `UENDR` exception. |
| Eier | All points | SJEKK | `point.owner.valid` / `owner` | No | FEIL for unlisted code; valid `AN` SJEKK | Same owner also runs on lines. |
| Adkomst | `KUM` | SJEKK for `KUM`; otherwise PASS | `point.access.valid` / `access` | No | FEIL for unlisted code | A valid supplied value outside the expected context gets SJEKK. |
| S_HYPERLINK | Point Tema whose Byggemetode policy is applicable | SJEKK when expected; otherwise PASS | `point.attachment-link.policy` / `attachmentLink` | No | On `LOK`/`TOP`, a supplied link is FEIL | Presented as expected images, rather than a hard requirement. |

For the six applicability-controlled point fields—Kumform, Byggemetode, Kjegle, Bredde, Tykkelse, and Avst_BunnInnvUnderUtv—the applicable Tema set is `KUM, SAN, SLS, SLU, KUMI, SANI, SLI, SLG, KOTREKUM, MKS, MKV, PMK, PMKAF, PMKOV, PMKSP, PMKVL, RED`. `LOK` additionally requires Byggemetode and Bredde. Other explicit or unresolved cells follow `src/lib/validation-v2/registry/pointFieldApplicability.js`; an unresolved Tema prevents a contextual missing-field finding.

## Table 2 — Lines / pipes / ledninger

| Field | Applicable Tema / object types | Missing currently produces | Rule/helper/source owner | Existing-object special handling today? | Present-but-invalid severity | Notes |
|---|---|---|---|---|---|---|
| Høydereferanse | All lines | FEIL | `common.height-reference.valid` / `heightReference` | No | FEIL for unlisted code | |
| Anleggsår | All lines | FEIL with `NYTT`; otherwise SJEKK | `common.installation-year.required` / `installationYear` | Only the `NYTT` distinction | FEIL for bad YYYY or future year | Same policy as points. |
| Målemetode | All lines | FEIL | `common.measurement-method.required` / `measurementMethod` | No | FEIL for unlisted code | |
| MålemetodeHøyde | All lines | FEIL | `common.height-measurement-method.required` / `heightMeasurementMethod` | No | FEIL for unlisted code | |
| Vertikalnivå | All lines | FEIL | `common.vertical-level.required` / `verticalLevel` | No | FEIL for unlisted code | |
| Datafangstdato | All lines | FEIL | `common.capture-date.required` / `captureDate` | No | FEIL for invalid/future date or date before usable Anleggsår | |
| Innmålt_av | All lines | FEIL | `common.surveyed-by.required` / `surveyedBy` | No | Placeholder text SJEKK | |
| Nøyaktighet XY | All lines | FEIL | `common.horizontal-accuracy.required` / `horizontalAccuracy` | No | FEIL for format/negative; zero or above preferred limit SJEKK | |
| Nøyaktighet høyde Z | All lines | FEIL | `common.vertical-accuracy.required` / `verticalAccuracy` | No | FEIL for format/negative; zero or above preferred limit SJEKK | |
| Maksavvik horisontalt | All lines | FEIL | `common.max-horizontal-deviation.required` / `maxHorizontalDeviation` | No | FEIL for format/negative/above allowed limit; zero SJEKK | |
| Maksavvik vertikalt | All lines | FEIL | `common.max-vertical-deviation.required` / `maxVerticalDeviation` | No | FEIL for format/negative/above allowed limit; zero SJEKK | |
| Stedfestingsforhold | All lines | FEIL | `common.positioning-condition.valid` / `positioningCondition` | No | FEIL for unlisted code | |
| Stedfestingsårsak | All lines | FEIL | `common.positioning-cause.valid` / `positioningCause` | No | FEIL for unlisted code | Valid `UENDR` enables only the three exceptions described above. |
| Tema | All lines | FEIL | `line.tema.required` / `tema` identity | No | FEIL for unlisted Tema; conflicting identity is unresolved/SJEKK | |
| Eier | All lines | SJEKK | `point.owner.valid` / `owner`, expanded to both geometries | No | FEIL for unlisted code; valid `AN` SJEKK | |
| InnvendigUtvendig | All lines | FEIL | `line.inside-outside.valid` / `insideOutside` | No | FEIL unless `ID` or `OD` | |
| Tykkelse | All lines | FEIL; **SJEKK with valid `UENDR`** | `line.wall-thickness.required` / `lineWallThickness` | Yes | FEIL for malformed/negative; zero or excess decimal precision SJEKK | The exception changes missing only. |
| Dimensjon | All lines | FEIL | `line.dimension.required` / `dimension` | No | FEIL for malformed/negative; 0–31 SJEKK | The `UENDR` test expressly keeps this as FEIL. |
| VertikalDimensjon | Non-circular valid `Rørform` | FEIL when non-circular; PASS for `S` | `line.vertical-dimension.valid` / `verticalDimension` | No | FEIL for malformed, zero, or negative | Unresolved/invalid Rørform suppresses the dependent missing finding. |
| Material | All lines | FEIL | `line.material.required` / `material` | No | FEIL for unlisted code | Some valid codes give SJEKK. |
| Nett_type | All lines | FEIL | `line.network-type.valid` / `networkType` | No | FEIL for unlisted code | Some valid codes give SJEKK. |
| Rørform | All lines | FEIL | `line.pipe-shape.valid` / `pipeShape` | No | FEIL for unlisted code | Valid `A`/`X` give SJEKK. |
| SDR | Pressure-class Tema and approved SDR material family | FEIL when required; **SJEKK with valid `UENDR`**; SPECIAL Tema SJEKK; other cases PASS | `line.sdr.valid` / `sdr` | Yes, only in the required branch | FEIL for invalid supplied number/code | Unresolved Tema or Material suppresses the dependent missing finding. |
| Ringstivhet | Gravity-class Tema and approved material family | FEIL when required; **SJEKK with valid `UENDR`**; SPECIAL Tema SJEKK; other cases PASS | `line.ring-stiffness.valid` / `ringStiffness` | Yes, only in the required branch | FEIL for invalid supplied code | Same dependency suppression. |
| Trykklasse | Pressure-class Tema; SPECIAL Tema is expected | SJEKK for pressure or SPECIAL; PASS for gravity | `line.pressure-class.valid` / `pressureClass` | No | FEIL for invalid supplied code | It is never FEIL merely for being missing. |

The line attachment-link owner also executes on lines, but its missing result is PASS for the approved line Tema contexts; the test explicitly covers that case. Optional missing values such as `Saksnummer`, `Merknad`, `NOBB-VAVVS-nr`, `Lengde`, `Utvendig_høyde`, `AnleggsID`, and retired `Synbarhet` likewise produce PASS rather than a missing-field finding. Sources: `src/lib/validation-v2/registry/rules.js`, `src/lib/validation-v2/fieldPolicy.js`, `tests/validationV2GmiA8.test.mjs`.

## Missing FEIL candidates for human review

These are the current FEIL cases, not proposed policy changes. There are **22 point fields** and **23 line fields** with a missing-value FEIL path: **45 geometry–field candidates** in total. The remaining three point rows and two line rows in the matrices have only SJEKK/PASS missing outcomes.

### Points

- The shared measurement/history fields (Høydereferanse, Målemetode, MålemetodeHøyde, Vertikalnivå, Datafangstdato, Innmålt_av, the four accuracy/deviation fields, Stedfestingsforhold, and Stedfestingsårsak) are required for every measured point. Values describing *this measurement* may be available when an old object is surveyed now; old installation details need a different judgment. `Anleggsår` already shows a selective SJEKK precedent for non-`NYTT`.
- Tema and InnvendigUtvendig are unconditional identity/dimension-code requirements; Type (`DIV`) and Kumform, Byggemetode, Kjegle, Bredde, Tykkelse, and Avst_BunnInnvUnderUtv are conditional requirements. Whether an existing object's construction details or bottom distance can always be established needs field-by-field review. Adkomst and expected images already use SJEKK for missing contextual information; point Tykkelse and Avst do not.

### Lines / pipes

- The same shared FEIL fields and Tema/InnvendigUtv need review on their own merits. Material, Nett_type, Rørform, Dimensjon, and non-circular VertikalDimensjon are FEIL when missing. Some properties may be observable now; concealed material, dimensions, or pipe shape may not always be knowable. `UENDR` already softens missing line Tykkelse, SDR, and Ringstivhet, but **not** these fields.

## Three requested findings

- **Anleggsår:** Identical for points and lines, with no Tema variation: missing plus valid `NYTT` is FEIL; missing with any other cause, including `UENDR` or absent/invalid cause, is SJEKK. This is a `NYTT` test, not an existing-object test. The FEIL message is “*N objekter mangler Anleggsår. Feltet er påkrevd.*” The SJEKK message uses “*Feltet er ønskelig i denne konteksten og bør kontrolleres.*” The history regression test locks both outcomes. Sources: `src/lib/validation-v2/fieldPolicy.js`, `src/lib/validation-v2/diagnostics.js`, `tests/validationV2GmiV32Batch2Completion.test.mjs`.
- **Tykkelse:** Point missing is FEIL only for applicable Tema, with no `UENDR` handling; non-applicable/unknown missing is PASS. Line missing is normally FEIL on every line, but SJEKK for valid `UENDR`. A bad supplied point or line value remains FEIL. Sources: `src/lib/validation-v2/fieldPolicy.js`, `tests/validationV2GmiA8.test.mjs`, `tests/validationV2RealDataPolish.test.mjs`.
- **Avst_BunnInnvUnderUtv:** Point-only, FEIL if missing for an applicable Tema; otherwise PASS. There is no `UENDR` exception. A malformed or negative supplied number is FEIL; zero is SJEKK. Sources: `src/lib/validation-v2/fieldPolicy.js`, `tests/validationV2GmiV32Batch2.test.mjs`.

## Missing versus invalid; presentation and downstream effects

The evaluator distinguishes missing/blank input from a supplied invalid code, contradiction, or malformed/out-of-range value. Contextual absence typically uses `APPLICABILITY_REQUIRED_MISSING`; supplied invalid values retain codes such as `VALUE_NOT_ALLOWED`, `VALUE_NOT_INTEGER`, `VALUE_NOT_DECIMAL`, or range/relationship codes. Conflicting Tema identity is an unresolved identity case, and Type–Tema incompatibility is a separate relationship failure. A schema or binding problem is not reliable evidence that an object value is missing. Sources: `src/lib/validation-v2/fieldPolicy.js`, `src/lib/validation-v2/objectFieldValue.js`.

Severity is assigned by the evaluators as `FAIL`, `CHECK`, or `PASS`; the registry's `severity: ERROR` metadata does not by itself make every missing result FEIL. The runner creates findings and outcome counts. Diagnostics groups them and writes the Norwegian result text; field-detail cards display those diagnostics. Sources: `src/lib/validation-v2/validationRunner.js`, `src/lib/validation-v2/diagnostics.js`, `src/components/validation-v2/ValidationV2FieldDetailContent.js`.

Coverage such as “11 av 16 aktuelle objekter har Tykkelse” counts applicability and raw presence, independently of FEIL/SJEKK. A future severity-only change would leave that factual presence count unchanged **if applicability and presence remain unchanged**. It would move outcomes/findings from fail to check counts, change rule/field and geometry status, result headings, sorting and status filters, and the status passed to an opened diagnostic object table. V2 is run within its workspace; the inspected map and Stats paths do not consume V2 result state, so no current map highlighting or Stats effect was found. Sources: `src/lib/validation-v2/diagnostics.js`, `src/lib/validation-v2/resultPresentation.js`, `src/components/validation-v2/ValidationV2Workspace.js`.

## Tests and source of truth

The principal severity locks are:

- `tests/validationV2GmiV32Batch1.test.mjs`: shared fields, owner and InnvendigUtvendig.
- `tests/validationV2GmiV32Batch2Completion.test.mjs`: Anleggsår and point numeric boundaries.
- `tests/validationV2GmiV32Batch2.test.mjs`: Avst_BunnInnvUnderUtv.
- `tests/validationV2GmiA8.test.mjs`: exact active inventory and point Tykkelse.
- `tests/validationV2GmiV32Batch3.test.mjs`: line requiredness.
- `tests/validationV2GmiV32Batch4.test.mjs`: hydraulic conditions.
- `tests/validationV2RealDataPolish.test.mjs`: the `UENDR` exception.
- `tests/validationV2PointFieldApplicability.test.mjs`: Tema cells.
- `tests/validationV2Diagnostics.test.mjs`: wording and coverage.

These tests were inspected, not run, for this read-only audit.

The active registry cites Innmålingsinstruks Vedlegg A by rule and page. `docs/validation-v2/innmalingsinstruks-rule-source-map.json` is explicitly documentation-only, and `docs/validation-v2/validator-v2-v32-manual-decisions.md` records Validator severity policy. They must not be conflated: for example, the source map classifies line Tykkelse as optional, while current Validator policy requires it, subject to the `UENDR` SJEKK exception. The source map calls Anleggsår mandatory and Avst conditional; their present FEIL/SJEKK behavior comes from the evaluator and domain decisions. The map references bundled PDFs at `src/data/1701350286-innmalingsinstruks_rev_lrf_v3-1.pdf` and `src/data/1701350380-innmalingsinstruks_rev_lrf_v3-1_vedlegg_a.pdf`; this audit relied on the repository's trace map and registry citations, not a fresh reading of those PDFs.

**Exact files inspected:** `src/lib/validation-v2/{contracts.js,objectFieldValue.js,ruleEvaluation.js,fieldPolicy.js,validationRunner.js,diagnostics.js,resultPresentation.js,fieldData.js,uiIntegration.js}`, `src/lib/validation-v2/registry/{rules.js,fields.js,fieldInformation.js,pointFieldApplicability.js,hydraulicTemaClassification.js}`, `src/components/validation-v2/{ValidationV2Workspace.js,ValidationV2RuleList.js,ValidationV2FieldDetailContent.js}`, `src/components/{MapView.js,MapInner.js,StatsModal.js,WorkspaceShell.js}`, `src/app/{page.js,api/stats/route.js}`, the nine test files listed above, and `docs/validation-v2/{innmalingsinstruks-rule-source-map.json,legacy-rule-provenance-map.json,validator-v2-v32-manual-decisions.md}`. Some of these were checked by targeted search rather than read end-to-end.

At audit completion, `git status --short` returned no output; no files were changed during the audit. This report was added only upon the subsequent explicit request.
