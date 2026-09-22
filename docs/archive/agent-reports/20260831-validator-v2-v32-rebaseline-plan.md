# Validator 2.0 — Innmålingsinstruks v3.2 requirements re-baseline

**Audit date:** 2026-08-31  
**Scope:** planning and specification only; no implementation, commit, push, deployment, production configuration, Testmodus reconciliation, or A8.1C work  
**Repository checkpoint:** `feature/validator-v2-a8-results-workflow` at `76e3894` (`Refine Testmodus developer controls`)  
**Required next action:** agree the minimum correction baseline before assigning an implementation slice

## 1. Executive summary

The repository was clean and exactly at the requested branch and HEAD, so the audit proceeded. Both August 2026 source PDFs were read in full: all 29 pages of the main instruction and all 27 pages of Vedlegg A. Ambiguous tables were checked against rendered PDF pages rather than inferred from extracted text.

The active Validator 2.0 registry contains **23 rules**: 12 common, 5 point-only and 6 line-only. This gives **17 point-applicable** and **18 line-applicable** rules. The minimum safe v3.2 correction is deliberately smaller than the full v3.2 backlog:

1. deactivate the common `Synbarhet` rule because the v3.2 overview marks the field `Utgått – Ikke relevant for VA`;
2. deactivate the point and line `NOBB-VAVVS-nr` required rules and the point `NOBB-VAVVS-nr-ramme` required rule because v3.2 marks all three uses `Valgfritt`;
3. add `O1`, `O2` and `S7` to the active line `Nett_type` values; and
4. refresh all surviving executable provenance and all current Field Info source metadata to v3.2.

That baseline produces **19 active rules**, **14 point-applicable rules** and **16 line-applicable rules**. It fixes demonstrable current false positives without enabling any new conditional or geometry rule.

The v3.2 source also establishes new work that should not be smuggled into the baseline. The five `NEW` fields are the two measurement-method fields, `Vertikalnivå`, line `Material`, and line `Tykkelse`. Their explicit `Ja` requiredness safely supports **required-presence** rules in later agreed slices. That does not yet authorize strict list closure. Main p. 25 code-text fallback scope/policy must be resolved before any newly introduced allowed-value rule whose correctness could depend on it. Field-specific numeric lexical policy and the 69/35 measurement lists therefore belong to the later allowed-value decision, not to presence validation. Tema/Type/Material/Vertikalnivå list closure, Type↔Tema compatibility, SDR, Ringstivhet, point dimension/polygon conditions, pressure-line height rules, and the changed stikkledning endpoint procedure remain later work.

Two official-source inconsistencies are material:

- Vedlegg A p. 5 calls `Utvendig_høyde` optional, while p. 9 calls it obligatory for non-circular, prefabricated installations.
- Vedlegg A p. 5 limits `Ringstivhet` to plastic gravity lines, while p. 22 says it is obligatory for gravity lines without the plastic qualifier.

No validator rule should silently choose between those formulations.

Across the decision ledger in sections 7 and 8 there are **18 UNCHANGED, 1 MODIFY, 4 REMOVE, 5 NEW and 36 DEFERRED items**. Classification concerns executable requirement disposition; a source-version/page refresh does not turn otherwise unchanged rule semantics into `MODIFY`.

## 2. Audit methodology

The audit used this order to avoid allowing current code to shape the specification reading:

1. verified the requested Git checkpoint and stopped mutation before inspecting domain material;
2. verified the actual local filenames, hashes and page counts;
3. read the complete main instruction, including revision history and procedural sections;
4. read the complete Vedlegg A, including all overview tables, formats and full code lists;
5. visually inspected rendered pages where extraction could merge columns or confuse `I`, `1`, `O`, `0`, diacritics or row applicability;
6. inventoried the active registry, canonical-field registry, runner, binding, Tema, ObjectRef, lexical-evidence, result-presentation, Field Info/Fildata and UI paths;
7. inspected the A0–A8/A8.1 tests, prior architecture reports and the relevant commits, treating them only as evidence of current intent;
8. compared source requirements with executable behavior; and
9. ran the current Validator 2.0 test set as a read-only baseline: **139/139 tests passed**.

The audit did not use legacy rules, old planning reports, or the preliminary leads in the task as authority for v3.2. `src/data/fields.json` is referenced below only to identify stale legacy/informational lists; it is not an executable Validator 2.0 source.

### Source-discipline labels

- **EXPLICIT:** stated directly by one or both v3.2 documents.
- **INTERPRETATION:** a reasonable executable consequence, but not itself written as validator logic.
- **DESIGN:** a product/implementation policy not mandated by the documents.
- **UNRESOLVED:** source or data-model evidence is insufficient for a safe decision.

## 3. Source documents and authority hierarchy

### Verified source files

The logical filenames match the requested documents. On disk, `Innmåling` uses a decomposed `å` Unicode sequence; implementations and scripts must use the actual filesystem name rather than assuming normalization.

| Authority | Actual local file | Pages | Bytes | SHA-256 |
|---|---|---:|---:|---|
| Primary | `REF_FILES/innmalingsinstruks/2026-v3.2/Innmålingsinstruks 2026.pdf` | 29 | 1,758,417 | `36273756BBFBBB14D2C449CCF32CF5AEB9579C10A099783A790AF662B3DED81F` |
| Primary | `REF_FILES/innmalingsinstruks/2026-v3.2/Innmålingsinstruks 2026 vedlegg-a.pdf` | 27 | 703,468 | `669F4C1AC0D4943BD70F1D4C78C9DDE4C5346823060EFBCCD9ABA93D307086D5` |

`REF_FILES/` is untracked reference material and must remain uncommitted.

### Version and authority findings

- Main instruction cover: v3.2, August 2026. Revision table p. 2 calls the revision `3.20`, revised for Gemini VA 5.15.
- Vedlegg A cover/revision: v3.2, August 2026 / 01.08.2026 (pp. 1–2).
- Vedlegg A p. 1 says its code lists are extracted from Gemini VA 5.15 revision 4040 dated 24.04.2026.
- Main pp. 5 and 25 make Vedlegg A necessary to the instruction: it specifies what is registered and the available codes. The main instruction governs measurement and delivery procedure; Vedlegg A governs field requiredness, formats and lists.
- If the two official documents conflict, neither current code nor an old report resolves the conflict. The ledger marks the item `DEFERRED` or recommends an explicit domain decision.

### Page convention

References are physical PDF page numbers printed in the documents, not extracted-text offsets.

## 4. Current Validator 2.0 architecture relevant to this audit

The inspected architecture supports retaining the invariants in the task.

| Concern | Confirmed current behavior | Evidence and consequence |
|---|---|---|
| One selected layer | `createValidationV2Input(selectedLayer)` passes only the selected layer's dataset and stable revision. | `src/lib/validation-v2/uiIntegration.js`; no `getVisibleLayersData()` or global merged-data path is used by V2. Preserve. |
| One dataset, two geometry views | The runner creates point and line ObjectRefs once for the selected dataset. The view controller changes `geometryTab` without invoking the runner. | `validationRunner.js`, `validationViewController.js`, `ValidationV2Workspace.js`. Preserve. |
| Result identity | `layerId` and `datasetRevision` bind completed results and Fildata. A dataset/layer change makes the old result stale. | `datasetRevision.js`, `uiIntegration.js`, `fieldData.js`. Preserve. |
| Object identity | ObjectRefs include layer, dataset revision, geometry and source index; ownership assertions reject cross-layer/revision/geometry reuse. | `objectRef.js`, `objectFieldValue.js`, `temaIdentity.js`. Preserve. |
| Binding | Direct canonical GMI property wins; one unique Unicode case-only match can bind; suspected aliases remain disabled/unresolved. | `registry/fields.js`, `gmiLayerSchemaBinding.js`. Preserve. |
| Tema | Direct `Tema` is preferred; `S_FCODE` is the sole approved fallback; disagreement is `CONFLICT`. | `registry/fields.js`, `temaIdentity.js`. Preserve for Type/classification work. |
| Width/dimension | Point `Bredde` cannot bind `DIM`, `DIMENSJON`, `Dimensjon` or `DIAMETER`. Line `Dimensjon` permits unique case-only `DIMENSJON`; `DIM` is unresolved. | `registry/fields.js` and A0/A1 tests. Preserve. |
| Measurement concepts | `Målemetode`, `Nøyaktighet`, `MålemetodeHøyde`, and `NøyaktighetHøyde` are four canonical fields. | 41-field registry and A0 tests. Preserve. |
| Lexical evidence | The parser keeps original field lexemes in a frozen non-enumerable symbol while retaining ordinary typed attributes. Exact rules do not trim or coerce. | `gmiParser.js`, `gmiLexicalEvidence.js`, `ruleEvaluation.js`. New numeric code rules need field-specific policies. |
| Conditional evaluation | The active engine supports required, allowed-value, and combined required/allowed-value rules only. It has no reviewed applicability classifier. | `contracts.js`, `rules.js`, `ruleEvaluation.js`. Conditional domain rules require architecture first. |
| Hydraulic classification | No V2 classifier exists. Canonical metadata explicitly says Material, SDR, Ringstivhet and Trykklasse must not classify their own applicability. | `registry/fields.js`. Preserve. |
| Privacy and decision support | Result/Fildata structures are layer-local; lexical evidence is hidden from ordinary enumeration; UI statuses are per-rule summaries, not delivery approval. | A8/A8.1 tests and presentation code. Do not add raw-data telemetry or whole-delivery `Godkjent/Avvist`. |
| Geometry model | Parsed V2 input exposes only `points` and `lines`; it has no first-class polygon-to-point ownership relation or surveyed-measurement provenance graph. | `gmiParser.js`. Polygon and stikk endpoint procedure cannot be inferred safely. |

The canonical registry already contains all **41** Appendix A field concepts. A canonical mapping is not an active validation requirement; it only makes a later rule possible.

## 5. Current executable rule inventory

Current registry: `src/lib/validation-v2/registry/rules.js`.

| Group | Rule IDs | Count | Point-applicable | Line-applicable |
|---|---|---:|---:|---:|
| Common | height reference; installation year; capture date; surveyed by; case; XY accuracy; Z accuracy; max horizontal deviation; max vertical deviation; positioning condition; positioning cause; visibility | 12 | 12 | 12 |
| Point | Tema; inside/outside; wall thickness; NOBB number; NOBB frame number | 5 | 5 | 0 |
| Line | Tema; dimension; network type; inside/outside; pipe shape; NOBB number | 6 | 0 | 6 |
| **Total / applicable** |  | **23** | **17** | **18** |

The current registry contains no active rule for measurement methods, vertical level, Tema allowed values, Type, material, line thickness, SDR, ring stiffness, pressure class, point width/length, point shape/construction, or main-instruction geometry procedures.

## 6. Full v3.2 field requirement inventory

This table covers every Appendix A field and points to the classified ledger item. `Kode` means an enumerated or Gemini code field; a code list does not by itself settle strict-closure behavior because main p. 25 permits explanatory text in the same field when a suitable code is absent.

| Field / canonical ID | Scope | Format | v3.2 requiredness and condition | Source | Ledger |
|---|---|---|---|---|---|
| Anleggsår / `installationYear` | P+L | `YYYY` | Ja | App. pp. 4, 6 | C02 |
| Datafangstdato / `captureDate` | P+L | `DD.MM.YYYY` | Ja | App. pp. 4, 6 | C03 |
| Innmålt_av / `surveyedBy` | P+L | name/text | Ja | App. pp. 4, 6 | C04 |
| Saksnummer / `caseNumber` | P+L | text | Ja | App. pp. 4, 6 | C05 |
| Høydereferanse / `heightReference` | P+L | Kode | Ja; 7 values | App. pp. 4, 6; Main pp. 10, 13–18 | C01 |
| Målemetode / `measurementMethod` | P+L | Kode | Ja; 69-code full list | App. pp. 4, 6–7, 23–25 | N01 |
| Nøyaktighet / `horizontalAccuracy` | P+L | integer cm | Ja | App. pp. 4, 6; Main p. 10 | C06, N28 |
| MålemetodeHøyde / `heightMeasurementMethod` | P+L | Kode | Ja; 35-code full list | App. pp. 4, 7, 25–27 | N02 |
| NøyaktighetHøyde / `verticalAccuracy` | P+L | integer cm | Ja | App. pp. 4, 6; Main p. 10 | C07, N28 |
| Stedfestingsforhold / `positioningCondition` | P+L | Kode | Ja; 10 values | App. pp. 4, 7–8 | C10 |
| Stedfestingsårsak / `positioningCause` | P+L | Kode | Ja; 6 values | App. pp. 4, 8; Main pp. 9–10, 18 | C11 |
| Synbarhet / `visibility` | P+L | retired code | **Utgått – Ikke relevant for VA**; old list remains printed later | App. pp. 4, 8 | C12 |
| Merknad / `note` | P+L | text, max 255 chars | Valgfritt | App. pp. 4, 6 | N03 |
| Eier / `owner` | P+L | Kode | Valgfritt; 13 values | App. pp. 4, 8–9 | N04 |
| Vertikalnivå / `verticalLevel` | P+L | Kode | Ja; 7 values | App. pp. 4, 9 | N05 |
| MaksAvvikVertikalt / `maxVerticalDeviation` | P+L | integer cm | Ja | App. pp. 4, 6; Main pp. 5, 10 | C09, N31 |
| MaksAvvikHorisontalt / `maxHorizontalDeviation` | P+L | integer cm | Ja | App. pp. 4, 6; Main pp. 5, 10 | C08, N31 |
| Tema / `tema` | P | Kode | Ja; 81 listed codes | App. pp. 4, 10–12 | C13, N06 |
| Type / `type` | P | Kode | **Der tilgjengelig**; 72 types with Tema applicability | App. pp. 4, 12–14 | N07–N08 |
| Kumform / `manholeShape` | P | Kode | Ja; 7 values | App. pp. 4, 14 | N09 |
| Bredde / `width` | P | integer mm | Ja, but not when polygon delineation is supplied | App. pp. 4, 9; Main pp. 14–15 | N10 |
| Lengde / `length` | P | integer mm | paired with Bredde; same polygon qualification | App. pp. 4, 9; Main p. 15 | N11 |
| InnvendigUtvendig / `insideOutside` | P | Kode | Ja; `ID`, `OD` | App. pp. 4, 14 | C14 |
| Tykkelse / `wallThickness` | P | integer mm | Ja | App. pp. 5, 9 | C15 |
| Utvendig_høyde / `externalHeight` | P | integer mm | Overview: Valgfritt; detail: obligatory for non-circular prefabricated installations | App. pp. 5, 9 | N12 |
| Avst_BunnInnvUnderUtv / `innerBottomToOuterUndersideDistance` | P | decimal metres | Overview: Ja; detail: obligatory for circular prefabricated installations | App. pp. 5, 9 | N13 |
| Byggemetode / `constructionMethod` | P | Kode | Ja; 15 values | App. pp. 5, 15 | N14 |
| Adkomst / `access` | P | Kode | Valgfritt, ønskes utfylt; 5 values | App. pp. 5, 15 | N15 |
| Kjegle / `cone` | P | Kode | Ja; 5 values | App. pp. 5, 15 | N16 |
| AnleggsID / `facilityId` | P | text | Der tilgjengelig; detailed text also permits SID | App. pp. 5, 9; Main p. 25 | N17 |
| S_HYPERLINK / `attachmentLink` | P | generated | Kun ved Gemini Terreng | App. pp. 5, 9 | N18 |
| NOBB-VAVVS-nr / `nobbVavvsNumber` | P | integer | Valgfritt | App. pp. 5, 10 | C16 |
| NOBB-VAVVS-nr-ramme / `nobbVavvsFrameNumber` | P | integer | Valgfritt | App. pp. 5, 10 | C17 |
| Tema / `tema` | L | Kode | Ja; 108 listed codes | App. pp. 5, 16–19 | C18, N19 |
| Nett_type / `networkType` | L | Kode | Ja; 8 values | App. pp. 5, 19 | C20 |
| Material / `material` | L | Kode | Ja; 45 values | App. pp. 5, 19–21 | N20–N21 |
| Dimensjon / `dimension` | L | integer mm | Ja | App. pp. 5, 16 | C19 |
| VertikalDimensjon / `verticalDimension` | L | integer mm | used for non-circular pipes; paired in overview | App. pp. 5, 16 | N22 |
| InnvendigUtvendig / `insideOutside` | L | Kode | Ja; `ID`, `OD` | App. pp. 5, 21 | C21 |
| Tykkelse / `wallThickness` | L | number mm, one decimal | **Ja** | App. pp. 5, 16 | N23 |
| Rørform / `pipeShape` | L | Kode | Ja; 7 values | App. pp. 5, 21 | C22 |
| SDR / `sdr` | L | decimal code | Ja for pressure lines; 13 values | App. pp. 5, 21–22 | N24 |
| Ringstivhet / `ringStiffness` | L | Kode | Overview: plastic gravity lines; detail: gravity lines; 7 values | App. pp. 5, 22 | N25 |
| Trykklasse / `pressureClass` | L | Kode | Valgfritt, ønskes utfylt, for pressure lines; 15 values | App. pp. 5, 22 | N26 |
| S_HYPERLINK / `attachmentLink` | L | generated | Kun ved Gemini Terreng | App. pp. 5, 16 | N27 |
| NOBB-VAVVS-nr / `nobbVavvsNumber` | L | integer | Valgfritt | App. pp. 5, 16 | C23 |

## 7. Current-rule re-baseline matrix

### Dependency notation

- **B1:** direct canonical key, with only an existing unique case-only match.
- **B2:** conservative Tema identity: direct `Tema`, else `S_FCODE`; conflict stays indeterminate.
- **G0:** both collections in the same selected layer; no cross-layer or cross-geometry fallback.
- **L1:** exact delivered lexical value; no trim/case/punctuation/coercion.
- **L2:** required presence only; format/range is not evaluated.

All current rows retain current selected-layer/ObjectRef/privacy behavior. UI implication for any retained/modified row is one presentation row per applicable geometry over the same completed result. Test implication includes registry contract, state matrix, mixed layer, zero-applicable geometry, binding ambiguity and result-count equations.

| ID | Field / current rule | Scope | Current behavior | Exact v3.2 requirement, source and condition | Proposal and classification | Discipline; dependencies; UI/tests; slice/questions |
|---|---|---|---|---|---|---|
| C01 | `heightReference`; `innmaling.common.height-reference.valid` | P+L | required + exact 7 values | Ja; same 7 values. App. pp. 4, 6; Main pp. 10, 13–18 | Retain behavior; refresh source. **UNCHANGED** | EXPLICIT. B1/G0/L1. Baseline metadata/test pages. Pressure-specific reference is separate N35. |
| C02 | `installationYear`; `...installation-year.required` | P+L | required only | Ja; `YYYY`. App. pp. 4, 6 | Retain presence. **UNCHANGED** | EXPLICIT. B1/G0/L2. Format validation remains unimplemented/incomplete. |
| C03 | `captureDate`; `...capture-date.required` | P+L | required only | Ja; `DD.MM.YYYY`. App. pp. 4, 6 | Retain presence. **UNCHANGED** | EXPLICIT. B1/G0/L2. Date parsing is a later design decision. |
| C04 | `surveyedBy`; `...surveyed-by.required` | P+L | required only | Ja; person/contractor name information. App. pp. 4, 6 | Retain presence. **UNCHANGED** | EXPLICIT. B1/G0/L2. Do not validate personal-name content or transmit it. |
| C05 | `caseNumber`; `...case-number.required` | P+L | required only | Ja; text. App. pp. 4, 6 | Retain presence. **UNCHANGED** | EXPLICIT. B1/G0/L2. Customer/case values remain non-telemetry data. |
| C06 | `horizontalAccuracy`; `...horizontal-accuracy.required` | P+L | required only | Ja; integer cm; normally ≤3 cm unless otherwise agreed. App. pp. 4, 6; Main p. 10 | Retain presence. **UNCHANGED** | EXPLICIT presence; threshold is N28. B1/G0/L2. |
| C07 | `verticalAccuracy`; `...vertical-accuracy.required` | P+L | required only | Ja; integer cm; normally ≤5 cm unless otherwise agreed. App. pp. 4, 6; Main p. 10 | Retain presence. **UNCHANGED** | EXPLICIT presence; threshold is N28. Keep distinct from C06. |
| C08 | `maxHorizontalDeviation`; `...max-horizontal-deviation.required` | P+L | required only | Ja; integer cm; maximum outer-boundary deviation. App. pp. 4, 6; Main pp. 5, 10 | Retain presence. **UNCHANGED** | EXPLICIT. B1/G0/L2. Semantic/range work is N31. |
| C09 | `maxVerticalDeviation`; `...max-vertical-deviation.required` | P+L | required only | Ja; integer cm. App. pp. 4, 6; Main pp. 5, 10 | Retain presence. **UNCHANGED** | EXPLICIT. B1/G0/L2. Semantic/range work is N31. |
| C10 | `positioningCondition`; `...positioning-condition.valid` | P+L | required + exact 10 values | Ja; list unchanged. App. pp. 4, 7–8 | Retain. **UNCHANGED** | EXPLICIT. B1/G0/L1. Keep whitespace/case failures. |
| C11 | `positioningCause`; `...positioning-cause.valid` | P+L | required + exact 6 values | Ja; list unchanged. App. pp. 4, 8 | Retain. **UNCHANGED** | EXPLICIT. B1/G0/L1. |
| C12 | `visibility`; `innmaling.common.visibility.valid` | P+L | required + integer-code lexical values `0–3` | Overview marks `Synbarhet` `Utgått – Ikke relevant for VA`; p. 8 still prints the historical list. App. pp. 4, 8 | Remove from active registry; retain canonical/retired documentation. **REMOVE** | EXPLICIT retirement. Deactivation is DESIGN. Removes UI row and special integer-code exception. Update A8/A8.1 lexical/count tests. Baseline. |
| C13 | point `tema`; `innmaling.point.tema.required` | P | required only | Ja; 81-code list. App. pp. 4, 10–12 | Retain presence only. **UNCHANGED** | EXPLICIT. B2/G0/L2. Allowed-value policy is N06, not inferred here. |
| C14 | point `insideOutside`; `...point.inside-outside.valid` | P | required + `ID`,`OD` | Ja; list unchanged. App. pp. 4, 14 | Retain. **UNCHANGED** | EXPLICIT. B1/G0/L1. |
| C15 | point `wallThickness`; `...point.wall-thickness.required` | P | required only | Ja; integer mm. App. pp. 5, 9 | Retain. **UNCHANGED** | EXPLICIT. B1/G0/L2. Line thickness is separate N23. |
| C16 | point `nobbVavvsNumber`; `...point.nobb-vavvs-number.required` | P | required only | Valgfritt. App. pp. 5, 10 | Remove required rule. **REMOVE** | EXPLICIT optionality. No optional-field format rule is mandated. Retain optional info. Baseline count/UI/tests. |
| C17 | point `nobbVavvsFrameNumber`; `...point.nobb-vavvs-frame-number.required` | P | required only | Valgfritt. App. pp. 5, 10 | Remove required rule. **REMOVE** | EXPLICIT optionality. B1. Retain optional info. Baseline. |
| C18 | line `tema`; `innmaling.line.tema.required` | L | required only | Ja; 108-code list. App. pp. 5, 16–19 | Retain presence only. **UNCHANGED** | EXPLICIT. B2/G0/L2. Allowed/legacy/provisional policy is N19. |
| C19 | `dimension`; `innmaling.line.dimension.required` | L | required only | Ja; integer mm. App. pp. 5, 16 | Retain. **UNCHANGED** | EXPLICIT. B1: direct `Dimensjon`, case-only `DIMENSJON`; `DIM` unresolved. L2. |
| C20 | `networkType`; `innmaling.line.network-type.valid` | L | required + exact `F,H,O,S,S6` | Ja; authoritative list is `F,H,O,O1,O2,S,S6,S7`. App. pp. 5, 19 | Add `O1`,`O2`,`S7`; refresh descriptions/source. **MODIFY** | EXPLICIT. B1/G0/L1. Immediate baseline; add exact-pass and near-miss tests; no hydraulic-class inference. |
| C21 | line `insideOutside`; `...line.inside-outside.valid` | L | required + `ID`,`OD` | Ja; list unchanged. App. pp. 5, 21 | Retain. **UNCHANGED** | EXPLICIT. B1/G0/L1. |
| C22 | `pipeShape`; `innmaling.line.pipe-shape.valid` | L | required + exact 7 values | Ja; `A,E,F,R,S,T,X`, unchanged. App. pp. 5, 21 | Retain. **UNCHANGED** | EXPLICIT. B1/G0/L1. `Kumform` cannot satisfy it. |
| C23 | line `nobbVavvsNumber`; `...line.nobb-vavvs-number.required` | L | required only | Valgfritt. App. pp. 5, 16 | Remove required rule. **REMOVE** | EXPLICIT optionality. Retain optional info. Baseline. |

Current-rule classifications: **18 UNCHANGED + 1 MODIFY + 4 REMOVE = 23**.

## 8. New/deferred requirement matrix

`NEW` means a source-backed executable requirement can be planned without inventing domain applicability, although it is not part of the immediate correction baseline. `DEFERRED` includes optional/no-rule outcomes, unresolved source conflicts, missing classification/geometry architecture, and design choices that need agreement.

| ID | Concept / canonical ID | Scope and current behavior | v3.2 source requirement / codes / applicability | Proposed behavior and classification | Discipline, dependencies, lexical/UI/test implications, unresolved question |
|---|---|---|---|---|---|
| N01 | `measurementMethod` | P+L; canonical binding exists, no rule | Ja; all 69 codes, App. pp. 4, 23–25 | First add a required-presence-only rule. Enable allowed-value validation only after N41 is resolved. **NEW** | EXPLICIT requiredness. B1/G0/L2 for presence. The later list rule must preserve numeric source lexemes and use an approved field-specific policy, not generic coercion. Presence adds one row to both tabs without enforcing the 69-code list. |
| N02 | `heightMeasurementMethod` | P+L; no rule | Ja; all 35 codes, App. pp. 4, 25–27; **97 is absent** | First add an independent required-presence-only rule. Enable its allowed-value validation only after N41 is resolved. **NEW** | EXPLICIT requiredness. B1/G0/L2 for presence. XY-vs-Z code 97 behavior belongs only to the later list-validation slice. Do not copy retired Synbarhet policy generically. |
| N03 | `note` | P+L; no rule | Valgfritt, text ≤255, App. pp. 4, 6 | Informational metadata only; no executable rule now. **DEFERRED** | EXPLICIT optionality. A length warning would be DESIGN and is not needed for v3.2 correction. |
| N04 | `owner` | P+L; no rule | Valgfritt; 13 codes, App. pp. 4, 8–9 | Update informational list; do not require. Optional allowed-value rule waits for code-fallback policy. **DEFERRED** | EXPLICIT list/optionality; strict closure is INTERPRETATION. New `L` is documented in section 9. |
| N05 | `verticalLevel` | P+L; canonical direct binding, no rule | Ja; 7 codes, App. pp. 4, 9 | First add a required-presence-only rule. Strict seven-value validation waits for N41. **NEW** | EXPLICIT requiredness. B1/G0/L2 for presence. If list validation is later enabled, the exact source token is `I_VANNSØYL`; do not inherit legacy `!_VANNSØYLEN`. |
| N06 | point Tema values | P; current rule checks presence only | 81 listed codes, App. pp. 10–12 | Keep value validation off until p. 25 fallback and legacy handling are agreed. **DEFERRED** | EXPLICIT list; strict closure/severity is DESIGN/UNRESOLVED. B2 and exact lexical evidence mandatory. |
| N07 | `type` values | P; no rule | Der tilgjengelig; 72 codes, App. pp. 4, 12–14 | If present, validate only after absence semantics and code fallback are agreed. **DEFERRED** | EXPLICIT list/availability. Missing Type must not fail. Exact code policy; UI requires conditional wording. |
| N08 | Type↔Tema relationship | P; no relation evaluator | Each Type row states applicable Tema(s), App. pp. 12–14 | Future compatibility rule over conservative Tema + Type identity. **DEFERRED** | EXPLICIT mapping; executable mismatch handling is INTERPRETATION. Needs B2, conflict/unknown states and no broad Tema aliases. |
| N09 | `manholeShape` | P; no rule | Ja; 7 codes, App. pp. 4, 14 | Do not require for every point until applicable Tema set is confirmed. **DEFERRED** | EXPLICIT table requiredness but object applicability is UNRESOLVED. Presence on unrelated Tema must not classify applicability. |
| N10 | `width` | P; no rule | Ja except when polygon delineation is supplied; App. pp. 4, 9; Main pp. 14–15 | Conditional rule only after point↔polygon ownership exists. **DEFERRED** | EXPLICIT condition. Current dataset has no reliable polygon association. `DIM*`/`DIAMETER` remain disabled. |
| N11 | `length` | P; no rule | Paired with width for non-round objects; polygon qualification, App. pp. 4, 9; Main p. 15 | Same architecture as N10. **DEFERRED** | EXPLICIT/INTERPRETATION. Do not compute from line geometry or infer from width. |
| N12 | `externalHeight` | P; no rule | p. 5 optional; p. 9 obligatory for non-circular prefabricated installations | No rule until publisher/domain clarification or a formally agreed precedence profile. **DEFERRED** | UNRESOLVED official inconsistency plus shape/construction classification dependency. |
| N13 | `innerBottomToOuterUndersideDistance` | P; no rule | p. 5 says Ja; p. 9 narrows to circular prefabricated installations and defines the height difference | Conditional presence/relationship rule after object classification and measurement semantics. **DEFERRED** | EXPLICIT but internally different granularity. Do not compute from unrelated Z values without provenance. |
| N14 | `constructionMethod` | P; no rule | Ja; 15 codes, App. pp. 5, 15 | Applicability and strict code closure need agreement. **DEFERRED** | EXPLICIT. Do not use presence/value to decide whether another field applies. |
| N15 | `access` | P; no rule | Valgfritt, desired; 5 codes, App. pp. 5, 15 | Metadata only now. **DEFERRED** | EXPLICIT optionality. Optional invalid-value behavior awaits p. 25 policy. |
| N16 | `cone` | P; no rule | Ja; 5 codes, App. pp. 5, 15 | Confirm applicable Tema before requiring. **DEFERRED** | EXPLICIT table, UNRESOLVED applicability. |
| N17 | `facilityId` | P; no rule | Der tilgjengelig; p. 9 says AnleggsID or SID; Main p. 25 requires one of those identifiers | Do not make SID an alias for AnleggsID; design an explicit alternative-identity rule only with source binding evidence. **DEFERRED** | EXPLICIT alternative concept, binding UNRESOLVED. Privacy-sensitive; never telemetry. |
| N18 | point `attachmentLink` | P; no rule | Kun ved Gemini Terreng; App. pp. 5, 9 | No rule until source-application provenance is available in the selected layer. **DEFERRED** | EXPLICIT condition. Field presence must not be used to infer Gemini Terreng. |
| N19 | line Tema values | L; current rule checks presence only | 108 listed codes, including 5 provisional; App. pp. 16–19 | No strict rule until legacy/provisional and p. 25 fallback policy is agreed. **DEFERRED** | EXPLICIT list. B2/G0/L1. Do not hard-error old X codes based only on omission. |
| N20 | line `material` presence | L; trustworthy direct binding, no rule | Ja; App. p. 5 | Add a required-presence rule in a small post-baseline slice. **NEW** | EXPLICIT. B1/G0/L2. Material must not classify pressure/gravity. Adds one line row. |
| N21 | line Material allowed values | L; no rule; legacy metadata has 39 values | 45 values, App. pp. 19–21 | Strict value check waits for same-field text fallback policy. **DEFERRED** | EXPLICIT list; closure is UNRESOLVED. Preserve exact `PVC-O` and `PE100-RC-PP0`. |
| N22 | `verticalDimension` | L; direct binding, no rule | Used for non-circular pipes; overview pairs it with Dimensjon. App. pp. 5, 16 | Conditional rule after pipe-shape semantics and whether horizontal dimension remains independently required are agreed. **DEFERRED** | EXPLICIT/UNRESOLVED. Do not let it satisfy `dimension` automatically. |
| N23 | line `wallThickness` | L; canonical binding supports L, active rule is point-only | **Ja**, numeric mm with one decimal; App. pp. 5, 16 | Add a line required-presence rule after baseline. **NEW** | EXPLICIT. B1/G0/L2. Update geometry-specific Field Info text; no point/line value borrowing. |
| N24 | `sdr` | L; no rule | Required for pressure lines; 13 codes, App. pp. 5, 21–22 | Conditional rule after authoritative Tema-based hydraulic classification. **DEFERRED** | EXPLICIT condition. SDR presence must not classify the line. Decimal lexemes need a field-specific policy. |
| N25 | `ringStiffness` | L; no rule | p. 5: plastic gravity lines; p. 22: gravity lines; 7 codes | No rule until the official scope conflict is resolved. **DEFERRED** | UNRESOLVED. A future classifier may use Tema for gravity then Material only to refine “plastic”; never Material to classify hydraulics. |
| N26 | `pressureClass` | L; no rule | Valgfritt, desired, for pressure lines; 15 codes, App. pp. 5, 22 | Do not require. Optional allowed-value behavior waits for classification/code policy. **DEFERRED** | EXPLICIT optionality. Presence cannot classify pressure. |
| N27 | line `attachmentLink` | L; no rule | Kun ved Gemini Terreng; App. pp. 5, 16 | Same as N18. **DEFERRED** | EXPLICIT condition; application provenance unavailable. |
| N28 | XY/Z accuracy thresholds | P+L; only presence checked | Normally ≤3 cm XY and ≤5 cm Z; worse measurements rejected unless otherwise agreed. Main p. 10 | Keep threshold rule off until an explicit agreement/override input and numeric-unit policy exist. **DEFERRED** | EXPLICIT threshold and exception. A hard rule without agreement context creates false positives. |
| N29 | CRS / height-system header | Dataset header; parser exposes header/crs context | EPSG coordinate system in file; EUREF89 UTM zones by region; orthometric NN2000 heights. Main p. 10 | Dataset-level validator needs project geography and agreed CRS context. **DEFERRED** | EXPLICIT, but regional applicability and header semantics are not object rules. |
| N30 | Open-trench measurement | No evidence of physical survey state beyond reported fields | Measurement should always occur in open trench and condition must be reported. Main p. 10 | Retain `Stedfestingsforhold` code check; do not claim physical compliance. **DEFERRED** | EXPLICIT procedure; machine validation from self-reported GMI cannot prove it. |
| N31 | Maximum 3D deviation semantics | Presence only | Every measured object reports maximum outer-boundary deviation; p. 5 cites LAGS 20 cm plan/30 cm height as guiding content. Main pp. 5, 10 | Defer range/relationship rule pending unit, exception and object-boundary semantics. **DEFERRED** | EXPLICIT reporting; executable thresholds are INTERPRETATION/UNRESOLVED. |
| N32 | Point lid, bottom and TOP-object measurement relations | No spatial/provenance rule | Main pp. 13–17 distinguish lid/structure points, bottom centre, objects without lids and TOP objects | Requires related-object identity, height references and measured-point provenance. **DEFERRED** | EXPLICIT procedure; current flat point/line data is insufficient. |
| N33 | Non-round point polygon geometry | No polygon relation | Outer boundary and heights must be supplied when a centre dimension is insufficient. Main p. 15 | Requires first-class polygon geometry and point ownership. **DEFERRED** | EXPLICIT. Current points/lines cannot safely prove polygon representation. |
| N34 | Stikkledning endpoint on own top pipe | No endpoint provenance/topology rule | Endpoint measured on the service line's own top; bottom derived from service-line top, not main-line top. Revision p. 2 and procedure p. 16 | No executable rule now. **DEFERRED** | EXPLICIT and materially changed from 3.1. Needs service/main classification, topology, source measurement node, Z/reference, own dimensions and conversion semantics. |
| N35 | Line heights/top-external pressure rule | Only Høydereferanse list checked | Top external recommended for all; pressure-line height always top external. Main p. 18 | Conditional pressure rule after classifier; recommendation must not become error. **DEFERRED** | EXPLICIT distinction. Needs Tema-domain mapping; field presence cannot classify pressure. |
| N36 | Line continuity, construction endpoints, main not split at branches | No topology validator | Lines run construction-to-construction; ends at manholes are measured; mains are not split at service branches. Main pp. 18–20 | Requires reviewed topology and tolerances. **DEFERRED** | EXPLICIT procedure; current geometry alone cannot distinguish intended nodes/objects safely. |
| N37 | Vertices, 8 m spacing and curve approximation | No spatial rule | Measure direction changes/couplings/branches; normally ≤8 m; straight segments; curve deviation ≤20 cm; borehole exception. Main p. 19 | Requires coordinate-quality, carrier/borehole applicability and tolerance architecture. **DEFERRED** | EXPLICIT. Avoid broad geometry errors from simplified parsed lines. |
| N38 | Carrier, culvert, borehole, spunt and tunnel geometry | No classifier/spatial rule | Separate lines/outer edges/centre lines and heights vary by construction. Main pp. 19–22 | Requires Tema classification, multi-geometry relationships and provenance. **DEFERRED** | EXPLICIT. Not reducible to a field-presence rule. |
| N39 | New/existing/affected object coverage | Validator sees only delivered dataset | Affected new and existing constructions/lines must be measured/documented. Main pp. 9, 18 | Cannot detect omitted real-world objects from a GMI file alone. **DEFERRED** | EXPLICIT delivery scope; needs external project/as-built reference. |
| N40 | Inaccessible measurement, reports, photos, filenames and delivery workflow | Object validator has no project document bundle | Main pp. 24–29 prescribe methods/documentation, Gemini templates, photos and delivery formats | Keep outside object-rule engine until a separate delivery-package contract exists. **DEFERRED** | EXPLICIT, but not reliably available in selected-layer GMI. Gemini-only statements remain conditional. |
| N41 | Same-field explanatory text when a code is unavailable | Current enum rules are strict exact lists | Main p. 25 permits explanatory text in the same field if no suitable Appendix code exists | Obtain publisher/product decision on affected fields and representation before adding **any newly introduced strict allowed-value rule whose correctness could depend on this fallback**, including Målemetode, MålemetodeHøyde, Vertikalnivå, Material, Tema and Type. **DEFERRED** | EXPLICIT wording, scope UNRESOLVED. Existing strict lists remain unchanged in the minimum baseline because no safe executable alternative is specified. Required-presence rules do not depend on list closure and may proceed separately. |

New/deferred classifications: **5 NEW + 36 DEFERRED = 41**. For all five `NEW` fields, `NEW` presently authorizes required presence only. Their documented formats and lists remain source inventory until the relevant comparison/list policy is deliberately enabled after N41.

## 9. Complete relevant code-list change analysis

### Lists used by active V2 rules

| List | v3.2 authoritative values | Change from active V2 | Immediate action |
|---|---|---|---|
| Høydereferanse | `BUNN_INNVENDIG, PÅ_BAKKEN, SENTER, TOPP_INNVENDIG, TOPP_UTVENDIG, UKJENT, UNDERKANT_UTVENDIG` | none | source refresh only |
| Stedfestingsforhold | `DELV_LUKK_GRØ, I_TUNNEL, I_VANN, IKKE_STEDF, LUKK_GRØ, OVERFL_VANN, POS_FRA_KUM, PÅVI, ÅPEN_GRØ, ÅPEN_KUM` | none | source refresh only |
| Stedfestingsårsak | `FJERN, FLYTT_DELV, FLYTT_HELT, NYTT, PÅVI, UENDR` | none | source refresh only |
| Synbarhet | historical `0,1,2,3` still printed, but field is obsolete | active rule is now wrong | deactivate rule; keep retired metadata |
| InnvendigUtvendig | `ID, OD` | none | source refresh only |
| Rørform | `A, E, F, R, S, T, X` | none | source refresh only |
| Nett_type | `F, H, O, O1, O2, S, S6, S7` | add `O1,O2,S7` to current 5 | immediate MODIFY |

### Full measurement method lists

**Målemetode (69 codes; App. pp. 23–25):**

`10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 24, 30, 31, 32, 33, 34, 35, 36, 37, 38, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 77, 78, 79, 80, 81, 82, 90, 91, 92, 93, 94, 95, 96, 97, 99`.

**MålemetodeHøyde (35 codes; App. pp. 25–27):**

`10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 24, 36, 60, 61, 62, 63, 64, 66, 67, 68, 69, 70, 74, 78, 79, 90, 91, 92, 93, 94, 95, 96, 99`.

The 2026 source is unambiguous about code 97: it appears in the XY list and in the XY “most used” summary on p. 7, but does **not** appear in either the height summary or the complete height list. The legacy catalog currently includes height code 97; Validator 2.0 must not copy it. This distinction becomes executable only if/when measurement allowed-value validation is deliberately enabled after the p. 25 policy decision; it is not part of required-presence validation.

### Other complete lists and changes from current repository metadata

- **Eier (13, App. pp. 8–9):** `AN,F,I,K,K1,K2,L,P,P1,S,S1,S2,S3`. `L` (`Samvirkeforetak (SA)`) is added relative to the 12-value legacy catalog.
- **Vertikalnivå (7, App. p. 9):** `UNDER_GRUNN, PÅ_GRUNN_VANNOVERF, OVER_GRUNN, PÅ_BUNN, I_VANNSØYL, SLISSING, UNDER_BUNN`. The PDF visually confirms `I_VANNSØYL`. The legacy catalog's `!_VANNSØYLEN` is not authoritative.
- **Kumform (7, App. p. 14):** `AN,F,FK,FR,N,R,X`.
- **Byggemetode (15, App. p. 15):** `B,BU,E,E0,E1,G,K,M,MU,P,S,SU,UK,V,W`.
- **Adkomst (5, App. p. 15):** `DO,NG,NT,ST,UTENST`.
- **Kjegle (5, App. p. 15):** `E,R,S,T,U`.
- **Material (45, App. pp. 19–21):** `AAS,ABS,AN,ATF,BET,FJE,GRP,GSE,GUP,ICO,KISVEIT,KOMPOS,LER,MCU,MGA,MRS,MSF,MST,PE,PE32,PE50,PE80,PE100,PE100-RC-PP0,PEH,PEH_PEM,PEL,PEM,PERC,PLAST,PP,PVC,PVC-O,PVC-U,RDEL,SJ,SJG,SJK,STA,STF,STG,TEG,TNA,TRE,UK`. Relative to the 39-value legacy catalog: add `ABS,ATF,KISVEIT,PLAST,PVC-O,RDEL,TRE`; remove the typo-like `PVC-0` (zero).
- **SDR (13, App. pp. 21–22):** `6.0,7.4,7.5,9.0,11.0,13.6,17.0,17.6,21.0,26.0,33.0,34.0,41.0`. Add `34.0` relative to the 12-value legacy catalog. Decimal lexical equivalence is not yet defined.
- **Ringstivhet (7, App. p. 22):** `SN2,SN4,SN5,SN6,SN8,SN10,SN16`; list unchanged, applicability unresolved.
- **Trykklasse (15, App. p. 22):** `PN1,PN2,PN2.5,PN3.2,PN4,PN5,PN6,PN6.3,PN8,PN10,PN12,PN12.5,PN16,PN20,PN25`; list unchanged, optional.

### Point Tema — complete v3.2 list

There are **81** codes (App. pp. 10–12):

`ANB,BAS,BERGROM,BFD,BRN,DAM,DIV,DRO,FET,FNT,FORAKONSTR,GRN,GRØKONSTR,GUT,GVT,HFO,HYD,I2B,I2C,I2K,I2O,I2P,I2R,I2T,INB,INR,INT,KMR,KNP,KOELSKAP,KOGLYSMAS,KONSTROMRIS,KOTREKUM,KRN,KUM,KUMI,LOK,MAS,MKS,MKV,OFFENTOAL,OIL,OVL,PAF,PMK,PMKAF,PMKOV,PMKSP,PMKVL,POV,PSP,PST,PSTVL,PSU,RED,RES,ROV,RSP,RVA,SAN,SANI,SEP,SLA,SLAMKIOSK,SLG,SLI,SLS,SLU,SPR,STR,SUMP,SVB,TNK,TOP,TØKSTVL,TØMSTBOBIL,UTS,VANNPOST,VKI,VPK,VST`.

Compared case-sensitively with the 72-value legacy catalog:

- additions: `DAM,FORAKONSTR,I2B,I2C,I2K,I2O,I2P,I2R,I2T,KUMI,OFFENTOAL`;
- old tokens absent: `FORAKONST,KUMi`.

Current V2 validates point Tema presence only, so no immediate executable list change is required. The spelling/case differences must not be hidden by generic normalization.

### Line Tema — complete v3.2 list

There are **108** codes (App. pp. 16–19):

`AF,AFBO,AFD,AFK,AFLU,AFO,AFP,AFS,AFT,AFVAR,AFX,DR,I2,I2D,I2I,I2O,I2P,I2S,I3,LEBEKXX500,LEBEKXX510,LEBEKXX511,LEBO,LEBRO,LEBUNT,LEBYGLIN,LEDIV,LEELKABJOR,LEELKABLUF,LEELKABRØR,LEFIBEKAB,LEFJ,LEFJRETUR,LEFJTUR,LEFUNDKANT,LEGAS,LEGASP,LEGASS,LEGLYSKAB,LEGRØ,LEGRØXX500,LEHJELIN,LEISOL,LEKA,LEKAXX500,LEKU,LEKULD,LELYTKAB,LEOPIKANAL,LESIGNKAB,LESLISS,LESPUNT,LESTIKKB,LESTØTMUR,LETRA,LETRE,LETREMKAB,LETREUKAB,LETRYKLUFT,LETU,LETUADK,LEVANNBVARM,LEVAR,LEVARAF,LEVARGAMAF,LEVARGAMOV,LEVARGAMSP,LEVARGAMVL,LEVAROV,LEVARSP,LEVARVL,OV,OVBO,OVF,OVI,OVK,OVKU,OVO,OVP,OVR,OVS,OVT,OVU,OVVAR,OVX,SP,SPBO,SPD,SPGRÅ,SPI,SPK,SPLU,SPO,SPP,SPS,SPT,SPVAR,SPX,VL,VLBO,VLI,VLK,VLLU,VLP,VLSPR,VLT,VLU,VLVAR`.

Relative to the 73-token legacy catalog, 45 tokens are added and these 10 old tokens are absent: literal `12,12D,121,120,12P` and `XF,XG,XGP,XGS,XK`. The digit-leading legacy tokens visually resemble the authoritative `I2` family but must not be silently normalized. The source does not publish a migration table.

## 10. Conditional applicability analysis

### Hydraulic fields

The source explicitly makes `SDR` conditional on pressure lines. It makes `Ringstivhet` conditional on gravity lines, with an unresolved plastic qualifier, and makes `Trykklasse` optional/desired for pressure lines. A safe implementation therefore needs a separate classifier that:

1. resolves conservative Tema identity using the existing direct/S_FCODE/conflict architecture;
2. maps documented Tema object semantics to `PRESSURE`, `GRAVITY`, `UNKNOWN` or `CONFLICT` through an independently reviewed domain table;
3. never uses SDR, Ringstivhet, Trykklasse, Material or Nett_type to decide hydraulic class;
4. only after gravity is established may use Material to decide whether the additional “plastic” qualifier applies; and
5. produces indeterminate/not-applicable outcomes instead of guessing.

No such mapping is explicit enough in the PDFs to implement without domain review. It must not be inferred from populated fields.

### Point shape and representation

The main instruction pp. 14–15 describes round and non-round representation, while Vedlegg A links `Bredde/Lengde`, `Utvendig_høyde` and `Avst_BunnInnvUnderUtv` to geometry/construction properties. The current GMI dataset model does not preserve a first-class polygon object attached to one point, nor does it prove circularity or prefabrication from geometry. `Kumform`, `Byggemetode`, Bredde or the target field's own presence must not be used as a circular classifier without an agreed domain model.

### Gemini Terreng

`S_HYPERLINK` is explicitly Gemini Terreng-only. A selected GMI layer has no reviewed, trustworthy producer/profile flag. The field's presence is not acceptable evidence of applicability because that would be circular. These checks remain deferred.

### Type and “Der tilgjengelig”

Missing Type is not an error under v3.2. If Type is supplied, the Appendix list and Tema mapping are relevant, but missing/blank/binding-unavailable states must be distinct. A future Type rule cannot turn “Der tilgjengelig” into universal requiredness.

## 11. Tema / Type analysis

Vedlegg A pp. 12–14 explicitly maps every Type to one or more Tema codes. Grouped without losing entries:

| Applicable Tema | Type values |
|---|---|
| `BAS` | `BBAK,BFJE,BNOD,BRED,BSPY,BSTR,BTRN` |
| `BFD` | `BSPY,DAM,KAS,SBA,STM,TAN` |
| `DRO` | `DAN,DANODE,DDAM,DPORT,DTAN,DTERSK` |
| `DIV` | `DB11,DB15,DB22,DB30,DB45,DB90,DBJUST410,DBJUST420,DBJUST430,DEND,DFOT,DOVG,DPPT,DREPMUF,DST,DVPR` |
| `FNT` | `DVF` |
| `FORAKONSTR` | `FORAKLOSS,FORAPLATE,FORASPUNT` |
| `GRØKONSTR` | `GRØSTENG,GRØSTENG01,GRØSTENG06,GRØSTENG10` |
| `KUM` | `KBRE,KDRE,KFDL,KINS,KKAB,KLV,KMIN,KPPK,KPRØVFET,KPRØVOIL,KSDM,KSTA,KSTF,KTRY,KUMINLØP,KUMPEILGRV,KUMUTJEV,KUMUTLØP,KVIPP,XLOK` |
| `PAF,POV,PSP,PST,PMK` | `PSNK,PTOR` |
| `RSP,RVA` | `RBIO,RMEK,RMKJ` |
| `ROV` | `RSDM` |
| `SLA` | `SLAPUMP` |
| `SAN` | `SMIN` |
| `SLG,SLS,SLU` | `SSTA` |
| `TNK` | `TTAN` |

This is a source-backed compatibility relationship, not merely a heuristic. Executing it still requires design decisions for direct-vs-fallback Tema conflict, unknown/provisional values, optional Type, and severity. The rule should depend on the existing Tema resolver, not create a second identity path.

The complete Type list has **72** codes. The old 22-value catalog uses `D811,D815,D822,D830`; v3.2 uses `DB11,DB15,DB22,DB30` and adds 54 other values. No current V2 Type rule exists, so the change belongs to a later slice, not the immediate baseline.

## 12. Legacy and provisional-code analysis

Five line Tema descriptions are labelled `foreløpig kode`:

- `LEBEKXX500` — open stream;
- `LEBEKXX510` — stream in culvert;
- `LEBEKXX511` — stream in tunnel;
- `LEGRØXX500` — open road ditch; and
- `LEKAXX500` — open canal.

The only safe source conclusion is that they are present in the official Gemini VA 5.15 revision 4040 available-code list and carry provisional descriptions. The source does not prescribe warning severity, sunset, rejection, or migration behavior. If a future rule accepts the official list, these values are accepted; a warning badge would be a product design decision.

The old `XF/XG/XGP/XGS/XK` descriptions resemble new `LEFJ/LEGAS/LEGASP/LEGASS/LEKULD` descriptions. That is useful migration evidence, but the source does not call them replacements or state what validators should do with old deliveries. Therefore:

- do not hard-error the old codes now;
- do not silently rewrite them;
- do not claim an authoritative one-to-one replacement map;
- retain current Tema-presence behavior; and
- obtain a domain/product policy before a closed-list rule chooses invalid, legacy-accepted, warning, suggestion or other treatment.

## 13. Main-instruction machine-validatable requirements

The main document contains more than Appendix field checks. The relevant requirements and present feasibility are:

| Main requirement | Page(s) | Machine-validation assessment |
|---|---:|---|
| all mandatory fields and official codes | 5, 25 | Appendix rules can cover this, but p. 25 same-field text fallback prevents an unqualified closed-list assumption |
| affected new/existing constructions and lines | 9, 18 | cannot detect omitted real-world objects from delivered GMI alone |
| independent XY/Z quality fields; open trench; height reference; maximum deviations | 10 | presence mostly active; physical survey compliance cannot be proven; threshold/semantic rules need context |
| EPSG/UTM zone and NN2000 | 10 | potentially dataset-level, but needs project geography and header contract |
| point lid/bottom/outer dimensions and non-round polygons | 13–15 | needs related geometry and measurement provenance not present in current V2 model |
| objects without lids and TOP objects | 16–17 | needs object relationships and Tema-based applicability |
| changed stikkledning endpoint procedure | 2, 16 | **material v3.1→v3.2 change; not safely evaluable**; see below |
| line top/external height, always for pressure | 18 | conditional classifier needed; recommendation vs mandate must remain distinct |
| lines construction-to-construction and ends measured at manholes | 18–20 | topology, tolerances and related construction identity needed |
| vertices, 8 m spacing, straight segments and ≤20 cm curve approximation | 19 | spatially possible only after exceptions/geometry semantics are represented |
| carrier, culvert, borehole, spunt and tunnel representation | 19–22 | multi-geometry and Tema/classification architecture needed |
| inaccessible points, reports, photos, naming and delivery | 24–29 | belongs to a future delivery-package validator, not current object rules |

### Stikkledning endpoint change

Revision p. 2 explicitly identifies the change from 3.1 to 3.2. Procedure p. 16 and Figure 4 place the last service-line measurement where the service meets the main, on the service line's own top pipe. The bottom is derived from the service-line top, not from the main-line top; this prevents a dimension difference from corrupting the hydraulic model.

This is a materially different requirement. Validator 2.0 currently has line vertices and attributes, but not enough evidence to know which vertex is a surveyed endpoint, which line is the main, which is the service, whether its Z is top external, which pipe's dimension/wall conversion was applied, or whether a coordinate was derived rather than measured. A safe future check needs:

- conservative service/main Tema classification;
- explicit topology and junction association;
- per-measurement-point provenance, not only final line coordinates;
- height-reference evidence at the endpoint;
- service-line dimension/wall/material conversion semantics; and
- agreed tolerances and treatment of incomplete/conflicting data.

It is classified `DEFERRED`, not `NEW`, because inventing a geometric proxy would create false confidence.

## 14. Field-information v3.2 migration analysis

`src/data/validation-v2/field-information.json` has **20 entries**. Every top-level source still says `3.1 / intern revisjon 3.0` and uses old page references. `composeFieldInformation()` correctly derives executable requiredness and allowed values from the active rule, so informational JSON is not currently authoritative validation logic; that separation must remain.

### Minimum-baseline metadata changes

1. change source version/title/revision references to v3.2 and physical v3.2 pages for every surviving active field;
2. update `Nett_type` descriptions and add `O1`, `O2`, `S7` value info from p. 19;
3. mark `Synbarhet` as retired/obsolete, explain that pp. 4 and 8 conflict only because the historical list is still printed, and remove its active-rule audit link;
4. change NOBB number/frame wording to optional for point/line and remove audit links to deactivated required rules;
5. make `wallThickness.byGeometry` explicit: point integer thickness is documented on p. 9; line numeric thickness with one decimal is documented on p. 16 and is a later required rule;
6. update Tema pages to point pp. 10–12 and line pp. 16–19, while clearly saying active validation checks presence only;
7. update all shared value-source pages (`insideOutside` point p. 14/line p. 21, pipe shape p. 21, etc.); and
8. adjust `REQUIRED_FIELD_INFORMATION` in `registry/fieldInformation.js` to the 17 unique active fields after baseline, while retaining optional/retired entries as documentation if desired.

The UI currently opens Field Info only from an active rule row. After rule removal, retired/optional entries will no longer appear as active rows. That is correct for the baseline and does not justify a UI redesign. Adding informational entries for the remaining 21 canonical fields should follow the slice that introduces or exposes them, with the full source inventory in this report as the specification.

### Authority guardrail

- `rules.js` remains executable authority for requiredness, allowed values and comparison policy.
- `field-information.json` supplies descriptions, value explanations and source links only.
- Documented v3.2 lists may be shown informationally before list validation is enabled, but they must not become an implicit closed-list evaluator.
- Fildata must continue reusing the active rule evaluator and current selected-layer binding; it must not read informational value lists to decide pass/fail.

## 15. False-positive / false-negative analysis

### Demonstrable current false positives under v3.2

1. Any point or line missing `Synbarhet`, or with a non-`0–3` value, can fail even though v3.2 retires the field.
2. Any point missing `NOBB-VAVVS-nr` can fail even though it is optional.
3. Any point missing `NOBB-VAVVS-nr-ramme` can fail even though it is optional.
4. Any line missing `NOBB-VAVVS-nr` can fail even though it is optional.
5. A line with authoritative `Nett_type` `O1`, `O2` or `S7` fails the current five-value rule.

Potential strict-code false positives under main p. 25 are acknowledged but not called demonstrable because the scope and representation of the explanatory-text exception are unresolved.

### Current false negatives from missing v3.2 rules

- missing line `Tykkelse` is not reported;
- missing line `Material` is not reported;
- missing/invalid `Målemetode`, `MålemetodeHøyde` and `Vertikalnivå` are not reported;
- invalid or incompatible supplied Type is not reported;
- absent conditional SDR/Ringstivhet and invalid conditional values are not reported where applicability is known externally;
- point shape/dimension/construction requirements are not reported for applicable objects; and
- main-document geometry/procedure violations are not reported.

Only the first five are candidates for near-term field-rule work. The others are potential false negatives in their applicable domain, not authorization to guess applicability.

### Incomplete but not technically wrong

- Anleggsår, date, accuracy, max deviation, point thickness and line dimension rules check presence but not documented format/range.
- Point and line Tema rules check presence but not list membership.
- Optional/desired fields have no rule.
- Current result presentation is per active rule and correctly neutral for zero applicable objects.

### Not safely evaluable today

- polygon-dependent point requirements;
- circular/prefabricated object classification;
- Gemini Terreng-only applicability;
- hydraulic classification and its SDR/Ringstivhet/pressure-height consequences;
- stikkledning endpoint measurement provenance;
- topology, missing real-world objects, project documentation and delivery-package completeness.

## 16. Minimum safe v3.2 correction baseline

This slice corrects only the existing active set.

### Deactivate/remove from `VALIDATION_RULES`

- `innmaling.common.visibility.valid`
- `innmaling.point.nobb-vavvs-number.required`
- `innmaling.point.nobb-vavvs-frame-number.required`
- `innmaling.line.nobb-vavvs-number.required`

Keep the four canonical field definitions. Keep retired/optional informational descriptions without executable authority.

### Modify

- `innmaling.line.network-type.valid`: allowed values become exactly `F,H,O,O1,O2,S,S6,S7`; comparison remains exact and whitespace/case-sensitive.

### Source and informational metadata

- update all 19 surviving rule sources to v3.2 physical pages;
- complete the Field Info changes in section 14;
- do not add measurement, Tema list, Type, material, line thickness or conditional rules in this slice.

### Associated test changes

- replace the reviewed 23-rule inventory with the reviewed 19-rule inventory;
- remove active Synbarhet/NOBB rows from fixtures, labels and state-matrix parameterization;
- retain parser lexical-evidence tests, but move them away from making retired Synbarhet the only proof of hidden lexemes; use a remaining exact code and dedicated parser evidence tests;
- prove `O1`,`O2`,`S7` pass exactly and near-misses/whitespace still fail;
- update point/line presentation universes to 14/16;
- update total-rule and scale-test equations to 19;
- update Field Info version/page/value tests and ensure retired metadata cannot drive execution; and
- re-run all A0–A8.1 architecture tests.

## 17. Expected counts after the baseline

| Equation | Current | Change | Proposed |
|---|---:|---:|---:|
| Common active rules | 12 | −1 Synbarhet | 11 |
| Point-only active rules | 5 | −2 NOBB | 3 |
| Line-only active rules | 6 | −1 NOBB | 5 |
| **Active registry** | **12+5+6 = 23** | **−4** | **11+3+5 = 19** |
| **Point-applicable** | **12+5 = 17** | **−3** | **11+3 = 14** |
| **Line-applicable** | **12+6 = 18** | **−2** | **11+5 = 16** |

Changing `Nett_type` values does not change counts. The equations match the geometry tabs and one-result architecture.

## 18. Required test and regression changes

### Tests encoding old v3.1 behavior

- `tests/validationV2GmiA8.test.mjs`: exact 23-rule array; 17/18 counts; Synbarhet integer-code tests; NOBB all-pass fixtures; five-value Nett_type list; total/count/scale assertions and old source pages.
- `tests/validationV2GmiA81ResultsWorkflow.test.mjs`: 20 active display labels including Synbarhet/NOBB and 17/18 presentation universes.
- `tests/validationV2GmiA81FieldInfo.test.mjs`: Synbarhet lexical Fildata scenario and the current 20-entry active-metadata contract.
- `src/lib/validation-v2/registry/fieldInformation.js` contract tests indirectly assume retired fields are required Field Info entries.

A5–A7 mostly use dynamic registry counts and should continue to pass, but must be rerun because registry shape changes flow through result equations and geometry breakdowns.

### Baseline regression set

- missing/invalid retired or optional fields produces no active finding;
- `Nett_type` eight exact values pass; lowercase, punctuation variants and padded lexemes fail;
- point-only, line-only, mixed point/line and empty datasets preserve count reconciliation;
- a geometry with zero applicable objects remains neutral, never “passed” by absence;
- one run still drives both tabs with the same result, revision and ObjectRefs;
- two selected layers never share binding, values, findings or Fildata;
- direct/case-only binding, ambiguous binding and absent schema states remain distinct;
- direct Tema/S_FCODE conflict remains indeterminate and no PTEMA/LTEMA/FCODE fallback appears;
- point Bredde and line Dimensjon alias boundaries remain intact;
- source lexemes remain non-enumerable and no raw values/identities enter telemetry; and
- Field Info continues deriving allowed values/requiredness from executable rules.

### Real-GMI scenarios to rerun

- mixed point/line selected layer with absent Synbarhet/NOBB;
- line layers containing `O1`, `O2`, and `S7`;
- direct and case-only `Nett_type`, including ambiguous duplicate-case headers;
- direct Tema, S_FCODE fallback and direct/fallback disagreement;
- point-only, line-only and schema-present/all-null layers;
- current real examples that use `DIM`, `DIMENSJON`, `Bredde`, and the four measurement headers, verifying bindings remain conservative.

### Later-slice tests

- required-presence slices: missing/null/empty vs present behavior for Målemetode, MålemetodeHøyde, Vertikalnivå, line Material and line Tykkelse, without rejecting any present code value;
- measurement allowed-value slice, only after p. 25 policy: every authoritative code, numeric lexeme preservation, `01`, whitespace, signs/decimals and especially XY 97 vs Z 97;
- vertical-level allowed-value slice, only after p. 25 policy: exact `I_VANNSØYL` and rejection of the legacy malformed token;
- material allowed-value slice, only after p. 25 policy: all 45 codes, including `PVC-O` vs `PVC-0`;
- Type: all 72 codes and every grouped Tema mapping, plus missing Type, unknown Tema and conflict;
- classifier: no target-field-presence classification, unknown/conflict paths, and documented Tema mapping only;
- conditional rules: applicable/non-applicable/unknown counts and no cross-geometry fallback;
- geometry: synthetic and real provenance fixtures before any stikk/topology rule is enabled.

## 19. Later implementation slices ordered by dependency and risk

Every slice should follow: plan/agreement → Luna Medium implementation → focused tests → diff inspection → Sol Medium review/debug. Luna High is not justified until the geometry/provenance slices, and only if the agreed design is genuinely difficult.

1. **Baseline v3.2 correction (Luna Medium).** Four deactivations, Nett_type expansion, v3.2 source/Field Info migration, tests and count equations. No new rule.
2. **Simple line required presence (Luna Medium).** Add independent required-presence rules for line `Tykkelse` and line `Material`; update geometry-specific Field Info. Do not validate the Material list or infer hydraulics.
3. **Common required presence (Luna Medium).** Add distinct required-presence-only rules for `Målemetode`, `MålemetodeHøyde` and `Vertikalnivå`. Use `REQUIRED`/no-comparison semantics; do not attach the 69/35/7 lists or introduce numeric lexical equivalence.
4. **Code-text fallback policy (plan/agreement before new list rules).** Resolve main p. 25 scope, representation, severity and legacy treatment. This is a gate before newly enabling strict Målemetode, MålemetodeHøyde, Vertikalnivå, Material, Tema or Type list closure.
5. **Measurement allowed values and lexical policy (Luna Medium, only after slice 4).** Deliberately enable the two independent lists using the complete 69/35 values and approved field-specific numeric lexical semantics. Explicitly test XY-vs-Z code 97 behavior.
6. **Vertikalnivå allowed values (Luna Medium, only after slice 4).** Deliberately enable the seven-value list and preserve exact `I_VANNSØYL`.
7. **Non-hydraulic domain lists (separate small slices after slice 4).** Consider Material, point Tema and line Tema allowed values separately, then optional-if-present Type values. Do not combine all lists in one implementation.
8. **Type and Tema compatibility (after Type list policy).** Add Tema↔Type compatibility separately and reuse the conservative Tema resolver.
9. **Applicability/classification foundation (design review before code).** Define explicit Tema-domain mapping and `APPLICABLE/NOT_APPLICABLE/UNKNOWN/CONFLICT`; do not use SDR, Ringstivhet, Trykklasse, Material or Nett_type as hydraulic classifiers.
10. **Hydraulic conditional fields.** Add SDR only after pressure classification. Add Ringstivhet only after the plastic-scope conflict is resolved. Keep Trykklasse optional.
11. **Point applicability/representation foundation.** Represent polygon ownership, circularity/prefabrication evidence and related heights before Bredde/Lengde/Utvendig_høyde/distance rules.
12. **Spatial/topology and stikkledning provenance.** Only after a measurement-provenance and topology model exists should 8 m/curve/endpoints or the new stikk endpoint procedure be considered. This is the first likely Luna High candidate.
13. **Delivery-package validation.** Separate future product surface for reports, images, filenames and project completeness; do not overload the selected-layer object engine.

This sequence intentionally supersedes automatic continuation of the historical A9 roadmap.

## 20. Unresolved domain questions

1. Does main p. 25's same-field explanatory-text fallback apply only to Tema/object codes, or to every Appendix code field? What machine representation distinguishes an intentional description from an invalid code?
2. Which treatment is desired for old line codes `XF/XG/XGP/XGS/XK` and digit-like `12/12D/121/120/12P`: accepted legacy, warning, replacement suggestion, error, or no closed-list rule?
3. Should the five `foreløpig kode` values be accepted silently, labelled informationally, or warned? The source supplies no severity.
4. Which statement controls `Utvendig_høyde`: optional overview (p. 5) or obligatory non-circular/prefabricated detail (p. 9)?
5. Is Ringstivhet required for every gravity line (p. 22) or only plastic gravity lines (p. 5)?
6. What reviewed Tema mapping defines pressure, gravity, unknown and conflict? The answer must not use the fields being validated.
7. Does `Kumform`, `Byggemetode`, and `Kjegle` truly apply to every point Tema, or only a documented subset not printed in the overview?
8. How is polygon delineation represented and linked to its point object in delivered GMI?
9. Is `AnleggsID` or SID delivered through one canonical field, alternative headers, or related object metadata? No alias should be added without evidence.
10. How are project-specific agreements that allow accuracy worse than 3/5 cm represented to the validator?
11. What data/provenance identifies the measured stikk endpoint, its own top-pipe Z and the related main line?
12. Should optional code fields be checked when supplied, and at what severity, given the p. 25 fallback?

## 21. Risks and things implementation agents must not infer

- Do not touch, port or reconcile Testmodus; production main is newer and out of scope.
- Do not merge/rebase main, implement on main, deploy, push or modify production configuration.
- Do not commit `REF_FILES/` or temporary PDF extracts/renders.
- Do not treat field-information JSON, legacy `src/data/fields.json`, old reports or current code lists as v3.2 authority.
- Do not broaden field binding, Tema aliases, point Bredde aliases, line DIM binding, trimming, case folding, punctuation normalization, transliteration or numeric coercion.
- Do not reuse the retired Synbarhet integer policy as a generic numeric-code policy.
- Do not attach a new strict allowed-value list to Målemetode, MålemetodeHøyde, Vertikalnivå, Material, Tema or Type before the main p. 25 fallback policy is explicitly resolved; required presence is a separate rule concern.
- Do not infer hydraulic class from SDR, Ringstivhet, Trykklasse, Material or Nett_type, or from whether any target field is populated.
- Do not make Type universally required; it is `Der tilgjengelig`.
- Do not make Trykklasse required; it is optional/desired.
- Do not hard-error absent old Tema tokens merely because they are not in the new list.
- Do not invent warnings for provisional codes.
- Do not choose silently between the Utvendig_høyde or Ringstivhet source conflicts.
- Do not infer a point polygon from nearby lines or dimensions.
- Do not turn a recommended top-external measurement for all lines into a mandatory error; only pressure lines have explicit mandatory wording.
- Do not implement the changed stikk procedure using a geometry proximity proxy.
- Do not rerun validation on geometry-tab changes or change result/ObjectRef identity.
- Do not transmit or persist raw GMI values, lexemes, coordinates, ObjectRefs, filenames, case/customer identifiers or other operational data in telemetry.
- Do not present per-rule results as an automatic whole-delivery approval/rejection.
- Do not call A8.1 production-ready merely because it exists. A8.1A+B is checkpointed on this branch but final independent implementation review is not established; A8.1C is outside this audit.

## 22. Recommended next step

Approve or amend only the **minimum safe v3.2 correction baseline** in sections 16–17, including the exact 19/14/16 count contract and Field Info migration. Then hand that bounded slice to Luna Medium. Require focused A8/A8.1 tests, full Validator 2.0 regression, diff inspection and an independent Sol Medium review before considering any `NEW` rule.

After the baseline, the five `NEW` fields may proceed as required-presence-only slices. In parallel, obtain domain answers for p. 25 code fallback, Ringstivhet scope, Utvendig_høyde scope and legacy Tema treatment. The p. 25 answer is an explicit gate before the new allowed-value slices; it does not block presence rules.
