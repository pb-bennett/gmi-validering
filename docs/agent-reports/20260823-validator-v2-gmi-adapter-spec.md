# Validator 2.0 non-executable GMI adapter specification

- Date: 2026-08-23
- Branch: `planning/validator-v2-gmi-adapter-spec`
- Status: planning specification only
- Runtime status: not executable and not imported by application code

## 1. Executive summary

This specification defines how Validator 2.0 should resolve literal attributes from exactly one selected GMI layer into canonical field evidence. It does not implement the adapter, validate requiredness, classify hydraulic regime, change the parser, or modify the frozen legacy validator.

The proposed registry contains exactly **41 canonical semantic fields** and exactly **41 direct GMI mappings**. Every direct key is the Innmålingsinstruks-backed property observed in the 182-file structural corpus. The nine legacy `_punkt`/`_led` keys are rejected as delivered source identities. Geometry is retained on bindings and rules, not encoded into canonical IDs.

The adapter has two phases:

1. **Layer schema binding**, once per selected layer and point/line context, discovers literal keys and creates provenance-bearing `LayerFieldBinding` records.
2. **Object value extraction**, using those bindings and an already constructed layer-qualified `ObjectRef`, returns `ObjectFieldValue` records that distinguish `FIELD_ABSENT`, `VALUE_MISSING`, and `VALUE_PRESENT` without repeating header discovery.

Direct `Tema` is preferred. Delivered `S_FCODE` is the sole accepted non-direct GMI fallback. If both contain usable matching values, Tema resolves with both provenance records retained. If they disagree, identity is `CONFLICT`. Exact `PTEMA`, `LTEMA`, and `FCODE` remain disabled. Observed `.P_TEMA` and `.L_TEMA` remain diagnostic-only with semantic authority `UNRESOLVED`.

Case handling is conservative: compare Unicode-NFC keys by case only, require a unique semantic target, retain the literal key, and never transliterate, remove punctuation, change separators, expand abbreviations, or infer semantics. `Bredde` maps only to point `width`; `Dimensjon` maps only to line `dimension`. `DIM` remains unresolved.

## 2. Scope and non-goals

### In scope

- one explicit `{ layerId, dataset }` GMI input;
- 41 canonical field definitions and direct GMI bindings;
- safe case-only key normalization;
- Tema/S_FCODE precedence and identity states;
- schema-level versus object-level resolution;
- source provenance, authority, confidence, ambiguity, and conflict;
- stable layer-qualified object references;
- synthetic future test vectors;
- boundaries for future V2 rules, classification, table integration, and other formats.

### Non-goals

- no required, optional, allowed-value, range, format, severity, or applicability evaluation;
- no hydraulic classification inside the adapter;
- no inference from SDR, Ringstivhet, Trykklasse, Material, or Nett_type;
- no SOSI or KOF crosswalk;
- no production parser changes or recovery of lexical values already coerced by the parser;
- no UI, map, store, runtime registry, legacy, test-runner, dependency, or deployment change.

## 3. Evidence baseline

This specification follows, in order, the architecture audit, PDF source map, legacy provenance audit, 46-record/41-canonical field census, and privacy-safe GMI header evidence pass.

| Evidence | Accepted conclusion |
|---|---|
| Architecture audit | V2 is independent, one run validates one explicit selected layer, and legacy remains frozen. |
| Source audit | Appendix A supplies canonical property identity; aliases and `_punkt`/`_led` are not source names. |
| Provenance audit | Suffixes are database/logical identities; generic aliases and numeric normalization cannot become source truth. |
| Field census | 46 legacy records reduce to 41 canonical fields; nine suffix keys and all 41 legacy alias candidates are known. |
| GMI evidence | All 41 direct properties occur; no suffix key occurs; direct four-field XY/Z names occur; broad H_* and DIM mappings remain unsafe. |
| Domain decisions | Direct Tema is preferred; delivered S_FCODE is an accepted GMI fallback; point width is Bredde; line dimension is Dimensjon. |

The corpus covers 182 structurally parsed GMI version-2 files. Non-observation is not universal impossibility, and occurrence is not semantic authority.

## 4. Core architectural principles

1. **One run, one selected layer.** The input integration proves that `dataset` belongs to `layerId`; the adapter reads no other dataset.
2. **Canonical identity answers what.** A field ID names one semantic property and contains no geometry or format suffix.
3. **A format mapping answers how.** It records the literal GMI key, mapping kind, source kind, authority, and confidence.
4. **Applicability answers where.** Point/line/object scope is owned by rules and classification consumers.
5. **Evaluation answers whether.** Requiredness, allowed values, ranges, and severity are outside this adapter.
6. **Classification consumes resolved identity.** It never manufactures identity from fields it will validate.
7. **Provenance is never discarded.** Literal keys, competing candidates, parser values, and mapping kinds remain visible.
8. **Absence is evidence-sensitive.** `FIELD_ABSENT` is returned only when a schema was established.
9. **Uncertainty remains explicit.** Unsupported and unresolved candidates cannot satisfy a canonical field.
10. **No mutation.** Parser output, layer records, legacy state, and permanent profiles are read-only.

## 5. 41-field canonical registry specification

A canonical entry defines identity and the default GMI key. It may document expected rule scopes, but those scopes do not restrict discovery or become part of the ID.

Required registry properties:

```text
CanonicalFieldMapping
  canonicalFieldId
  displayLabel
  sourceProperty
  directGmiSourceKey
  legacyFieldKeys[]             provenance only
  expectedRuleScopes[]          documentation; rules own applicability
  caseNormalizationPolicy
  acceptedFallbackKeys[]
  disabledLegacyAliases[]
  recognizedUnresolvedKeys[]
  sourceAuthority
  mappingEvidenceConfidence
  notes
```

Registry guards must prove unique canonical IDs, unique direct semantic targets, known enums, exactly one canonical entry per concept, and no `_punkt`/`_led` direct key.

## 6. Full GMI direct mapping matrix

`UNIQUE_CASE_ONLY` means the key may differ only by Unicode letter case after NFC comparison. It does not authorize transliteration or another alias. Authority refers to field identity evidence, not whether any validation rule is applicable or passed.

| # | Canonical field | Direct GMI key | Expected rule scope | Case policy | Accepted fallback | Disabled/unresolved candidates | Authority / confidence | Special note |
|---:|---|---|---|---|---|---|---|---|
| 1 | `access` | `Adkomst` | point | UNIQUE_CASE_ONLY | — | — | source / HIGH | Requiredness is outside adapter. |
| 2 | `attachmentLink` | `S_HYPERLINK` | point, line | UNIQUE_CASE_ONLY | — | reject suffixed point key | source / HIGH | Gemini-only condition belongs to rules. |
| 3 | `captureDate` | `Datafangstdato` | point, line | UNIQUE_CASE_ONLY | — | Dato group inert | source / HIGH | Date syntax is a later rule. |
| 4 | `caseNumber` | `Saksnummer` | point, line | UNIQUE_CASE_ONLY | — | — | source / HIGH | Direct only. |
| 5 | `cone` | `Kjegle` | point | UNIQUE_CASE_ONLY | — | — | source / HIGH | Object-code scope is separate. |
| 6 | `constructionMethod` | `Byggemetode` | point | UNIQUE_CASE_ONLY | — | — | source / HIGH | Object-code scope is separate. |
| 7 | `dimension` | `Dimensjon` | line | UNIQUE_CASE_ONLY | — | `DIM` unresolved | source / HIGH | Uppercase `DIMENSJON` is case-only; no point-width crosswalk. |
| 8 | `externalHeight` | `Utvendig_høyde` | point | UNIQUE_CASE_ONLY | — | — | source / HIGH | Applicability remains unresolved. |
| 9 | `facilityId` | `AnleggsID` | point | UNIQUE_CASE_ONLY | — | SID not approved | source / HIGH | Conditional semantics are separate. |
| 10 | `heightMeasurementMethod` | `MålemetodeHøyde` | point, line | UNIQUE_CASE_ONLY | — | H_* disabled | source / HIGH | Z method remains distinct. |
| 11 | `heightReference` | `Høydereferanse` | point, line | UNIQUE_CASE_ONLY | — | `HOYDEREFERANSE` disabled; `HREF` unresolved | source / HIGH | HREF occurrence is not authority. |
| 12 | `horizontalAccuracy` | `Nøyaktighet` | point, line | UNIQUE_CASE_ONLY | — | ASCII/H_* disabled | source / HIGH | XY accuracy remains distinct. |
| 13 | `innerBottomToOuterUndersideDistance` | `Avst_BunnInnvUnderUtv` | point | UNIQUE_CASE_ONLY | — | — | source / HIGH | Applicability is a rule. |
| 14 | `insideOutside` | `InnvendigUtvendig` | point, line | UNIQUE_CASE_ONLY | — | both suffix keys rejected | source / HIGH | Shared unsuffixed property. |
| 15 | `installationYear` | `Anleggsår` | point, line | UNIQUE_CASE_ONLY | — | — | source / HIGH | Parser number coercion does not define format validity. |
| 16 | `length` | `Lengde` | point | UNIQUE_CASE_ONLY | — | — | source / HIGH | Not computed line length. |
| 17 | `manholeShape` | `Kumform` | point | UNIQUE_CASE_ONLY | — | `Rørform` rejected | source / HIGH | Separate from line pipe shape. |
| 18 | `material` | `Material` | line | UNIQUE_CASE_ONLY | — | `MATERIALE`, `MATR` disabled | source / HIGH | Never a hydraulic classifier input here. |
| 19 | `maxHorizontalDeviation` | `MaksAvvikHorisontalt` | point, line | UNIQUE_CASE_ONLY | — | — | source / HIGH | Range rule separate. |
| 20 | `maxVerticalDeviation` | `MaksAvvikVertikalt` | point, line | UNIQUE_CASE_ONLY | — | — | source / HIGH | Range rule separate. |
| 21 | `measurementMethod` | `Målemetode` | point, line | UNIQUE_CASE_ONLY | — | `MALEMETODE`, `METODE` disabled | source / HIGH | XY method remains distinct. |
| 22 | `networkType` | `Nett_type` | line | UNIQUE_CASE_ONLY | — | `NETTTYPE` disabled | source / HIGH | `NETT_TYPE` is only a case form. |
| 23 | `nobbVavvsFrameNumber` | `NOBB-VAVVS-nr-ramme` | point | UNIQUE_CASE_ONLY | — | — | source / HIGH | Punctuation is significant. |
| 24 | `nobbVavvsNumber` | `NOBB-VAVVS-nr` | point, line | UNIQUE_CASE_ONLY | — | both suffix keys rejected | source / HIGH | Shared unsuffixed property. |
| 25 | `note` | `Merknad` | point, line | UNIQUE_CASE_ONLY | — | — | source / HIGH | No global trim. |
| 26 | `owner` | `Eier` | point, line | UNIQUE_CASE_ONLY | — | — | source / HIGH | `EIER` is case-only. |
| 27 | `pipeShape` | `Rørform` | line | UNIQUE_CASE_ONLY | — | `Kumform` rejected | source / HIGH | Separate from point manhole shape. |
| 28 | `positioningCause` | `Stedfestingsårsak` | point, line | UNIQUE_CASE_ONLY | — | — | source / HIGH | Direct only. |
| 29 | `positioningCondition` | `Stedfestingsforhold` | point, line | UNIQUE_CASE_ONLY | — | — | source / HIGH | Direct only. |
| 30 | `pressureClass` | `Trykklasse` | line | UNIQUE_CASE_ONLY | — | `PN`, `TRYKKKLASSE` disabled | source / HIGH | Never classifies hydraulics. |
| 31 | `ringStiffness` | `Ringstivhet` | line | UNIQUE_CASE_ONLY | — | `SN` disabled | source / HIGH | Never classifies hydraulics. |
| 32 | `sdr` | `SDR` | line | UNIQUE_CASE_ONLY | — | — | source / HIGH | No generic numeric equivalence. |
| 33 | `surveyedBy` | `Innmålt_av` | point, line | UNIQUE_CASE_ONLY | — | — | source / HIGH | Underscore is significant. |
| 34 | `tema` | `Tema` | point, line | UNIQUE_CASE_ONLY | `S_FCODE` | compact P/L/FCODE disabled; dotted P/L unresolved | source + accepted practice / HIGH | Tema wins; conflicts remain visible. |
| 35 | `type` | `Type` | point | UNIQUE_CASE_ONLY | — | — | source / HIGH | Applicability/value rules separate. |
| 36 | `verticalAccuracy` | `NøyaktighetHøyde` | point, line | UNIQUE_CASE_ONLY | — | `H_NOYAKTIGHET` disabled | source / HIGH | Z accuracy remains distinct. |
| 37 | `verticalDimension` | `VertikalDimensjon` | line | UNIQUE_CASE_ONLY | — | — | source / HIGH | Applicability is a rule. |
| 38 | `verticalLevel` | `Vertikalnivå` | point, line | UNIQUE_CASE_ONLY | — | — | source / HIGH | Value-set policy separate. |
| 39 | `visibility` | `Synbarhet` | point, line | UNIQUE_CASE_ONLY | — | — | source / HIGH | Preserve code representation evidence. |
| 40 | `wallThickness` | `Tykkelse` | point, line | UNIQUE_CASE_ONLY | — | both suffix keys rejected | source / HIGH | Point/line format rules may differ. |
| 41 | `width` | `Bredde` | point | UNIQUE_CASE_ONLY | — | `DIAMETER`, `DIMENSJON`, `DIM`, `Dimensjon` disabled | source / HIGH | Only point Bredde maps to width. |

Completeness proof: 41 rows, 41 unique canonical IDs, 41 unique direct GMI source mappings. The five concepts duplicated in legacy point/line records appear once canonically.

## 7. Legacy alias disposition matrix

This table accounts for all 12 legacy alias groups and all 41 configured candidates. Repeated Tema candidates are retained because the legacy point and line logical keys each configured them.

| # | Legacy logical key | Candidate | V2 disposition | Canonical target | Rationale |
|---:|---|---|---|---|---|
| 1 | `Tema_punkt` | `S_FCODE` | ACCEPTED_GMI_FALLBACK | `tema` | Delivered practical fallback; Tema wins. |
| 2 | `Tema_punkt` | `Tema` | DIRECT | `tema` | Exact source property. |
| 3 | `Tema_punkt` | `TEMA` | SAFE_CASE_NORMALIZATION | `tema` | Case-only form, not semantic alias. |
| 4 | `Tema_punkt` | `FCODE` | DISABLED_UNSUPPORTED | `tema` | Not observed or approved. |
| 5 | `Tema_led` | `S_FCODE` | ACCEPTED_GMI_FALLBACK | `tema` | Delivered practical fallback; Tema wins. |
| 6 | `Tema_led` | `Tema` | DIRECT | `tema` | Exact source property. |
| 7 | `Tema_led` | `TEMA` | SAFE_CASE_NORMALIZATION | `tema` | Case-only form, not semantic alias. |
| 8 | `Tema_led` | `FCODE` | DISABLED_UNSUPPORTED | `tema` | Not observed or approved. |
| 9 | `Høydereferanse` | `Høydereferanse` | DIRECT | `heightReference` | Exact source property. |
| 10 | `Høydereferanse` | `HOYDEREFERANSE` | DISABLED_UNSUPPORTED | `heightReference` | Transliteration is not case-only. |
| 11 | `Høydereferanse` | `HREF` | OBSERVED_UNRESOLVED | `heightReference` | Observed; semantic authority unproven. |
| 12 | `Målemetode` | `Målemetode` | DIRECT | `measurementMethod` | Exact source property. |
| 13 | `Målemetode` | `MALEMETODE` | DISABLED_UNSUPPORTED | `measurementMethod` | Transliteration is not case-only. |
| 14 | `Målemetode` | `METODE` | DISABLED_UNSUPPORTED | `measurementMethod` | Generic and unobserved. |
| 15 | `Nøyaktighet` | `Nøyaktighet` | DIRECT | `horizontalAccuracy` | Exact XY property. |
| 16 | `Nøyaktighet` | `NOYAKTIGHET` | DISABLED_UNSUPPORTED | `horizontalAccuracy` | Transliteration is not case-only. |
| 17 | `Nøyaktighet` | `H_MÅLEMETODE` | DISABLED_AMBIGUOUS | `horizontalAccuracy` | Suggests a different Z concept. |
| 18 | `Nøyaktighet` | `H_NOYAKTIGHET` | DISABLED_AMBIGUOUS | `horizontalAccuracy` | Suggests Z accuracy. |
| 19 | `Dato` | `Dato` | INERT_LEGACY | — | No effective canonical field requests Dato. |
| 20 | `Dato` | `DATO` | INERT_LEGACY | — | No effective canonical field requests Dato. |
| 21 | `Dato` | `DATOREG` | INERT_LEGACY | — | No effective canonical field requests Dato. |
| 22 | `Dato` | `REGDATO` | INERT_LEGACY | — | No effective canonical field requests Dato. |
| 23 | `Trykklasse` | `Trykklasse` | DIRECT | `pressureClass` | Exact source property. |
| 24 | `Trykklasse` | `TRYKKLASSE` | SAFE_CASE_NORMALIZATION | `pressureClass` | Unique case-only form. |
| 25 | `Trykklasse` | `PN` | DISABLED_UNSUPPORTED | `pressureClass` | Not observed or approved. |
| 26 | `Trykklasse` | `TRYKKKLASSE` | DISABLED_UNSUPPORTED | `pressureClass` | Extra-K spelling is not case-only. |
| 27 | `Ringstivhet` | `Ringstivhet` | DIRECT | `ringStiffness` | Exact source property. |
| 28 | `Ringstivhet` | `RINGSTIVHET` | SAFE_CASE_NORMALIZATION | `ringStiffness` | Unique case-only form. |
| 29 | `Ringstivhet` | `SN` | DISABLED_UNSUPPORTED | `ringStiffness` | Not observed or approved. |
| 30 | `SDR` | `SDR` | DIRECT | `sdr` | Exact source property; redundant alias. |
| 31 | `Nett_type` | `Nett_type` | DIRECT | `networkType` | Exact source property. |
| 32 | `Nett_type` | `NETT_TYPE` | SAFE_CASE_NORMALIZATION | `networkType` | Unique case-only form. |
| 33 | `Nett_type` | `NETTTYPE` | DISABLED_UNSUPPORTED | `networkType` | Separator-changing variant is unobserved. |
| 34 | `Material` | `Material` | DIRECT | `material` | Exact source property. |
| 35 | `Material` | `MATERIALE` | DISABLED_UNSUPPORTED | `material` | Not a case-only form. |
| 36 | `Material` | `MATR` | DISABLED_UNSUPPORTED | `material` | Unsupported abbreviation. |
| 37 | `Bredde (diameter)` | `Bredde` | DIRECT | `width` | Exact point-width property. |
| 38 | `Bredde (diameter)` | `BREDDE` | SAFE_CASE_NORMALIZATION | `width` | Unique case-only form. |
| 39 | `Bredde (diameter)` | `DIAMETER` | DISABLED_UNSUPPORTED | `width` | Domain decision rejects it for point width. |
| 40 | `Bredde (diameter)` | `DIMENSJON` | DISABLED_AMBIGUOUS | `width` | Primarily line dimension evidence. |
| 41 | `Bredde (diameter)` | `DIM` | DISABLED_AMBIGUOUS | `width` | Observed only in line schemas; meaning unresolved. |

Disposition totals: 11 DIRECT, 6 SAFE_CASE_NORMALIZATION, 2 ACCEPTED_GMI_FALLBACK, 13 DISABLED_UNSUPPORTED, 4 DISABLED_AMBIGUOUS, 1 OBSERVED_UNRESOLVED, and 4 INERT_LEGACY.

## 8. Tema identity resolution contract

### Accepted schema candidates

| Priority | Source key | Mapping kind | Authority | Use |
|---:|---|---|---|---|
| 1 | exact `Tema` | DIRECT | authoritative | Preferred identity. |
| 1b | unique case-only Tema form | CASE_NORMALIZED | authoritative | Same direct semantic field; retain literal key. |
| 2 | exact `S_FCODE` | ACCEPTED_FALLBACK | authoritative for accepted GMI practice | Use when direct Tema has no usable object value. |
| 2b | unique case-only S_FCODE form | ACCEPTED_FALLBACK + lexical case evidence | authoritative for accepted GMI practice | Same fallback, literal key retained. |

`PTEMA`, `LTEMA`, and `FCODE` are disabled. `.P_TEMA` and `.L_TEMA` are recognized structural candidates with `validationAuthoritative: null`; they may support a diagnostic but never canonical identity.

### Object identity states

| State | Meaning | Consumer consequence |
|---|---|---|
| RESOLVED | One usable accepted identity, or multiple accepted candidates that agree | Classification may consume canonical Tema. |
| MISSING | No accepted or unresolved candidate supplies a usable identity | Future missing-Tema rule issues once; object-specific rules skip. |
| CONFLICT | Usable accepted candidates disagree | Future identity-conflict handling; no guessed classification. |
| UNRESOLVED_SOURCE | Only a supplied unsupported/unresolved candidate is available | Explain unsupported evidence; object-specific rules skip. |

When both fields are bound, resolution is per object. A null direct Tema may fall back to a usable S_FCODE. When both are present and exact-code-equal, Tema is selected and S_FCODE remains secondary evidence. When they differ, neither wins.

Hydraulic consumers use only `RESOLVED` canonical Tema. Confirmed later classification is SP/OV → gravity and VL/SPP → pressure. Unsupported values yield UNKNOWN. SDR, Ringstivhet, and Trykklasse are never identity or classification inputs.

## 9. Layer schema binding model

The binding phase runs once per layer and geometry context.

```text
GmiLayerAdapterInput
  layerId                 required, non-empty
  dataset                 exact parsed dataset owned by layerId
  datasetRevision         opaque ownership/staleness token
  sourceFormat            gmi

LayerFieldBinding
  layerId
  datasetRevision
  sourceFormat
  geometryScope           point | line
  canonicalFieldId
  state                   binding-state enum
  preferredSourceKey?
  mappingKind?
  sourceKind
  validationAuthoritative true | false | null
  authorityState
  confidence
  candidates[]            accepted and recognized unsupported literals
  conflicts[]             schema ambiguity only
```

Schema key sources, in order:

1. own keys of `dataset.fieldAnalysis.points` or `.lines`, which preserve the parser's section field names even if every value is null;
2. otherwise, the union of own enumerable `feature.attributes` keys for that geometry inside this exact dataset;
3. if no objects and no field-analysis metadata exist, `SCHEMA_UNAVAILABLE`—not `FIELD_ABSENT`.

The adapter must not infer a schema from another geometry or layer. A field may bind separately in point and line contexts of the same selected dataset, but both bindings reference one canonical field ID.

Binding states:

- `BOUND`: one accepted literal key;
- `MULTIPLE_ACCEPTED`: accepted direct/case/fallback candidates coexist;
- `FIELD_ABSENT`: schema is known and no accepted or recognized candidate exists;
- `AMBIGUOUS`: matching cannot identify one safe semantic target;
- `UNRESOLVED_SOURCE`: only recognized unsupported candidates exist;
- `SCHEMA_UNAVAILABLE`: schema absence cannot be established.

## 10. Object value resolution model

Object extraction reuses a precomputed binding and never rediscovers headers. A fully constructed, layer-qualified `ObjectRef` is a hard prerequisite: no `ObjectFieldValue` may exist without one.

```text
ObjectFieldValue
  objectRef
  canonicalFieldId
  state
  bindingState
  sourceKey?
  mappingKind?
  sourceKind
  validationAuthoritative true | false | null
  sourceValue             exact parser attribute value
  sourceLexeme            original text or UNAVAILABLE
  normalizedValue?        absent unless field-specific later logic supplies it
  lexicalFlags[]          non-validating observations
  candidates[]
  conflicts[]
```

Base value states:

- `null`, `undefined`, or `""` → `VALUE_MISSING` when the field is bound;
- numeric `0` and boolean `false` → `VALUE_PRESENT`;
- whitespace-only text → `VALUE_PRESENT` plus `WHITESPACE_ONLY`; no global trim;
- no binding in a known schema → `FIELD_ABSENT`;
- ambiguous/unresolved/schema-unavailable bindings propagate their distinct state.

The current parser trims and coerces numeric-looking source text before the adapter sees it. Therefore `sourceValue` means “unaltered parser attribute value,” not “original GMI lexeme.” `sourceLexeme` must be `UNAVAILABLE` unless a future input boundary genuinely supplies it.

## 11. Resolution states and precedence

General precedence:

1. exact direct property;
2. safe case-only form of that property;
3. explicitly accepted format fallback;
4. unsupported/unresolved candidates retained but never selected.

For multiple accepted candidates:

- preserve all candidates and their values;
- choose the highest-authority usable candidate only if every other usable accepted candidate is equal under the field's explicit equivalence;
- default equivalence is strict same primitive type and value;
- if values disagree or equivalence is undefined, return conflict/ambiguity;
- a missing lower-priority candidate does not conflict with a present higher-priority candidate;
- no lower-authority candidate is silently discarded from evidence.

Messages, insertion order, object index, or legacy alias array order are never precedence mechanisms.

## 12. Provenance and authority model

Every candidate carries:

```text
sourceFormat: gmi
sourceKey: literal delivered key
sourceKind:
  DELIVERED_GMI_PROPERTY
  PARSER_DERIVED
  SYNTHETIC
  UNKNOWN
mappingKind:
  DIRECT
  CASE_NORMALIZED
  ACCEPTED_FALLBACK
  UNSUPPORTED_CANDIDATE
  DERIVED
validationAuthoritative: true | false | null
authorityState:
  AUTHORITATIVE
  NON_AUTHORITATIVE
  UNRESOLVED
confidence: HIGH | MEDIUM | LOW
```

Direct GMI keys are delivered, source-backed, and authoritative for field identity. `S_FCODE` is delivered and authoritative only under the explicit accepted GMI fallback decision; its provenance remains PRAKSIS-like rather than being relabelled as the Appendix A field name. Dotted candidates are delivered but unresolved. Parser-derived values in future adapters must use `DERIVED` and cannot masquerade as delivered GMI evidence.

## 13. Case-normalization policy

Algorithm:

1. Retain each literal schema key unchanged.
2. For comparison only, Unicode-normalize both direct key and literal key to NFC.
3. Apply deterministic Unicode default uppercase to both comparison strings.
4. A match is case-only only when punctuation, whitespace, underscores, spelling, and code points other than case/composition remain unchanged.
5. If one literal candidate matches, bind as `CASE_NORMALIZED`.
6. If multiple accepted case forms coexist, return `MULTIPLE_ACCEPTED` and resolve object values under the conflict policy.
7. If a literal could match more than one semantic target, return `AMBIGUOUS` and do not select.

This permits `Material`/`MATERIAL`, `Dimensjon`/`DIMENSJON`, `Trykklasse`/`TRYKKLASSE`, and `Bredde`/`BREDDE`. It does not permit `Høydereferanse`/`HOYDEREFERANSE`, `Nett_type`/`NETTTYPE`, `Trykklasse`/`PN`, or `Bredde`/`DIM`.

## 14. Value preservation and coercion policy

- Keep the parser-supplied primitive unchanged in `sourceValue`.
- Never run global `parseFloat`, numeric tolerance, universal stringification, case folding, or trimming.
- Never assume `11` equals `11.0`; original lexical form may already be unavailable.
- Never strip leading zeroes from a string code.
- Never mark zero missing.
- Never reconstruct a lexical value that the parser discarded.
- Add `normalizedValue` only through a separately specified, field-specific contract.
- Preserve candidate conflicts before validation.
- Treat whitespace-only data as present-but-flagged at adapter level; a specific identity or validation consumer may define unusable text explicitly.

For Tema identity, a usable code must be a non-null, non-empty primitive. Code equivalence is exact string representation with no numeric normalization. Raw candidates remain available even when identity cannot resolve.

## 15. Point/line applicability separation

Canonical fields contain no geometry suffix. A layer may produce scoped bindings because GMI point and line sections have distinct schemas, but the binding does not become a different field.

```text
canonical: insideOutside
GMI mapping: InnvendigUtvendig -> insideOutside
point rule: fieldId=insideOutside, appliesTo=point
line rule:  fieldId=insideOutside, appliesTo=line
```

The same applies to `tema`, `wallThickness`, `nobbVavvsNumber`, and `attachmentLink`. Point and line rules may have different requiredness, allowed values, formats, or conditions without duplicating the canonical field.

Within one selected layer dataset containing both geometry arrays, point bindings read only point schema/attributes and line bindings read only line schema/attributes. Nothing is borrowed across contexts.

## 16. ObjectRef contract

```text
ObjectRef
  key                     layer-qualified ephemeral key
  layerId                 mandatory
  datasetRevision         mandatory staleness guard
  geometryType            point | line
  sourceIndex             index inside this exact immutable run dataset
  localIdentity
    kind                   guid | parser-id | index
    value
  parserId?
  guid?
```

Identity preference is GUID, parser ID, then source index. The internal key still includes `layerId`, geometry, identity kind/value, and source index so duplicate source IDs cannot collide. Index is a local dereference fallback only within the exact `datasetRevision`; it is never global or cross-layer.

Map/table synchronization later must verify current layer ownership and dataset revision before dereferencing. Failure disables navigation; it never searches another layer or falls back to a bare `punkter-3`/`ledninger-3` ID.

## 17. Missing field versus missing value semantics

| Condition | Binding | Object value | Meaning |
|---|---|---|---|
| Known schema lacks any candidate | FIELD_ABSENT | FIELD_ABSENT | The layer does not carry the property. |
| Schema contains accepted key; object has null/undefined/empty | BOUND | VALUE_MISSING | Column exists; this object lacks a value. |
| Schema contains accepted key; object has zero/false/non-empty | BOUND | VALUE_PRESENT | Value exists; validity is not decided here. |
| Only unsupported candidate exists | UNRESOLVED_SOURCE | UNRESOLVED_SOURCE | Data may exist under an unapproved representation. |
| Multiple accepted values disagree | MULTIPLE_ACCEPTED | BINDING_AMBIGUOUS or identity CONFLICT | Evidence conflicts; do not guess. |
| Empty dataset and no schema metadata | SCHEMA_UNAVAILABLE | SCHEMA_UNAVAILABLE | Absence cannot be asserted. |

This distinction is mandatory for future virtual required columns. A table can render a virtual column for `FIELD_ABSENT`, while cells in a real bound column can show `VALUE_MISSING` or `VALUE_PRESENT`.

## 18. GMI-first and SOSI boundary

GMI is the full/source-oriented target because direct Appendix A properties are observed and the parser exposes literal keys. This specification defines no SOSI or KOF mapping.

A later SOSI adapter may reuse the 41 canonical IDs but must declare partial coverage. Current parser-derived `S_FCODE` is `mappingKind: DERIVED`, `sourceKind: PARSER_DERIVED`, and `validationAuthoritative: false`; it is not equivalent to delivered GMI S_FCODE. Native SOSI mappings require a standards-backed crosswalk and synthetic/representative tests.

A later KOF adapter must similarly declare limited capability. Synthetic grouping values cannot establish Tema compliance. The validation engine should consume the same evidence contract, including non-authoritative and unresolved states, without assuming every format has 41 bindings.

## 19. Future data-table integration requirements

The adapter contract supports the planned **Vis påkrevde felt** feature without implementing UI:

- layer bindings tell the table which canonical fields are truly absent from the selected layer schema;
- object values tell the table which existing fields are empty per row;
- virtual columns reference canonical IDs and rule requirements, never fabricated source keys;
- cells retain source key/provenance for diagnostics;
- one selected layer is the only table and adapter scope;
- a virtual column must not mutate parser attributes or make a missing field appear delivered;
- ambiguity/unresolved source needs a distinct indicator from ordinary missing data.

## 20. Future validation-engine consumer contract

The engine receives immutable adapter evidence plus rules. It does not rerun header discovery.

Consumer sequence:

1. create one validated layer input;
2. bind the GMI schema per geometry;
3. create layer-qualified ObjectRefs;
4. extract canonical values from precomputed bindings using those ObjectRefs;
5. resolve Tema identity;
6. if identity is not RESOLVED, object-specific consumers skip with structured reason;
7. if resolved, classification consumes canonical Tema;
8. rules decide applicability and evaluate expectations;
9. sparse issues reference ObjectRef, canonical field, source key, mapping kind, and authority.

For hydraulics, classification maps SP/OV to gravity and VL/SPP to pressure. Unknown Tema produces UNKNOWN. `sdr`, `ringStiffness`, and `pressureClass` are validation targets only. The adapter neither classifies nor emits missing/conflict validation issues.

## 21. Synthetic adapter test-vector inventory

The planning companion contains 40 non-executable vectors.

| IDs | Family | Coverage |
|---|---|---|
| GMI-TV-001 | Direct | Exact source key and provenance. |
| GMI-TV-002–004 | Case/coexistence | Unique case form, equal duplicates, conflicting duplicates. |
| GMI-TV-005–009 | Presence | FIELD_ABSENT, null, empty, whitespace, zero. |
| GMI-TV-010 | Parser value | Numeric-looking value with unavailable source lexeme. |
| GMI-TV-011–015 | Tema accepted paths | Direct, fallback, equal coexistence, conflict, object-level fallback. |
| GMI-TV-016–020 | Tema rejected paths | PTEMA, LTEMA, dotted P/L, FCODE. |
| GMI-TV-021 | Suffixes | All nine legacy geometry-suffixed keys rejected. |
| GMI-TV-022–023 | Shared fields | Unsuffixed direct properties in point and line contexts. |
| GMI-TV-024–028 | Width/dimension | Direct Bredde/Dimensjon and rejected/unresolved DIM family. |
| GMI-TV-029–031 | XY/Z | H_* rejection and four independent canonical fields. |
| GMI-TV-032–033 | Other aliases | HREF unresolved; unsupported alias family disabled. |
| GMI-TV-034 | Geometry context | Point and line bindings remain separate in one selected dataset. |
| GMI-TV-035–036 | Layer isolation | No binding/value borrowing; ObjectRefs differ across layers. |
| GMI-TV-037 | Consumer boundary | Hydraulic target fields cannot manufacture identity/classification. |
| GMI-TV-038–040 | Schema provenance | All-null schema, empty known schema, empty unknown schema. |

Future executable tests should parameterize the 41 direct mappings from the registry in addition to implementing these scenario vectors. Test data must stay synthetic and browser-local.

## 22. Explicit unresolved questions

Eight decisions remain open:

1. Is `HREF` an approved GMI representation of Høydereferanse?
2. What do `.P_TEMA` and `.L_TEMA` mean?
3. Do rare `DIM` or geometry-atypical `DIMENSJON` headers have an approved semantic use beyond case-normalized line Dimensjon?
4. Should any currently disabled abbreviations/transliterations be enabled in a separately evidenced GMI profile?
5. How should a future input boundary preserve original source lexemes lost to parser coercion?
6. Do GMI export versions other than observed version 2 require different mappings?
7. Which SOSI mappings are validation-authoritative?
8. Which, if any, KOF fields can support canonical validation?

Safe defaults are: leave aliases disabled, retain dotted/HREF evidence as unresolved, do not reconstruct lexemes, declare untested versions unsupported, and use separate non-authoritative/partial adapters for SOSI and KOF.

## 23. Recommended implementation sequence

| Slice | Objective | Acceptance emphasis |
|---|---|---|
| GMI-A0 | Contracts/types and registry guards only | One-layer input, enums, 41 unique fields, no legacy/runtime coupling. |
| GMI-A1 | 41-field direct layer binding | Exact and unique case-only schema resolution once per geometry. |
| GMI-A2 | Tema/S_FCODE resolution | Preferred direct, accepted fallback, provenance, MISSING/CONFLICT/UNRESOLVED_SOURCE. |
| GMI-A3 | ObjectRef and layer isolation | Mandatory `layerId`; `datasetRevision` ownership/staleness guard; stable local identity; `sourceIndex` only as a layer-local fallback; no cross-layer identity or borrowing. |
| GMI-A4 | Per-object canonical value extraction | Requires an existing `ObjectRef`; consumes precomputed `LayerFieldBinding`; distinguishes FIELD_ABSENT, VALUE_MISSING, and VALUE_PRESENT; no generic coercion. |
| GMI-A5 | Synthetic adapter tests | Implement all vectors and parameterized 41-field registry tests. |
| GMI-A6 | V2 engine-foundation integration | Classification/rules consume evidence; legacy remains independent. |

Refinement from the earlier generic V2 slices: schema binding precedes object work, Tema conflict handling is isolated before classification, and ObjectRef/layer guards are implemented before per-object extraction or any UI/map integration.

## 24. Legacy migration and non-migration statement

This specification does not migrate, fix, replace, or reinterpret the running legacy validator. It must not be imported by runtime code. Specifically, it authorizes no changes to:

- `src/lib/validation/fieldValidation.js`;
- `src/data/fields.json`;
- `src/lib/validation/validator.js`;
- GMI/SOSI/KOF parsers;
- existing validation UI, status, severity, aliases, filters, or map behavior.

The legacy `_punkt`/`_led` defects and unsafe aliases remain frozen until a separate production bugfix is explicitly approved. Validator 2.0 should implement this specification independently and later compare outcomes through synthetic fixtures and explicit same-layer comparison tooling.

Machine-readable planning artifacts:

- `docs/validation-v2/gmi-adapter-spec.json`
- `docs/validation-v2/gmi-adapter-test-vectors.json`

Both are documentation-only and must not become runtime imports.
