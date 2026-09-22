# Validator 2.0 v3.2 synthetic GMI test suite

## Executive summary

This pass adds nine parseable, entirely fabricated GMI fixtures and three parser-behavior fixtures. `tests/fixtures/gmi-v32/manifest.json` is the public-safe future v3.2 oracle: it records hashes, parser structure, stable source-index references, scenario IDs, expected manual outcomes, dependency suppression, and all 41 reviewed fields. No Validator 2.0 rules were changed.

The suite is intentionally grouped by coherent delivery type instead of using one file per field: clean point and line controls; common/text/date boundaries; Tema/applicability; line shape/dimensions; hydraulic relationships; and a parseable adverse delivery. This keeps manual upload testing understandable while preserving deterministic headless coverage.

## Fixture architecture

| Category | Fixtures | Purpose |
|---|---|---|
| Clean controls | point-clean-modern, line-clean-modern | Modern-looking successful point, pressure-line and gravity-line controls. |
| Boundary/cross-field | point-boundaries, point-text-placeholders, point-applicability-tema, installation-history, line-dimensions-shapes, line-hydraulic | Exact manual rule, source-resolution, dependency and hydraulic coverage. |
| Parseable adverse | comprehensive-bad | Deliberately many independent defects without structural corruption. |
| Parser behavior | parser-no-signature, parser-no-geometry, parser-truncated-object | Current parser throws and partial-record behavior. |

All fixture IDs and SHA-256 values are in the manifest. Hashes are identity metadata only; upload recognition and telemetry changes are explicitly deferred.

## Full 41-field coverage matrix

The manifest is the machine-readable source of detailed object/field assertions. `P/S/F` below means deterministic Pass/Sjekk/Feil oracle coverage; `P` means the specification only defines a non-failing treatment.

| Field | Fixtures/scenario | Coverage |
|---|---|---|
| Anleggsår | installation-history / installation-year-boundaries | P/S/F |
| Datafangstdato | installation-history / capture-date-boundaries | P/S/F |
| Innmålt_av | point-text-placeholders / text-placeholder-classes | P/S/F |
| Saksnummer | point-text-placeholders / text-placeholder-classes | P/S |
| Høydereferanse | point-boundaries / common-boundaries-pass-check-fail | P/S/F |
| Målemetode | point-boundaries / common-boundaries-pass-check-fail | P/S/F |
| Nøyaktighet | point-boundaries / common-boundaries-pass-check-fail | P/S/F |
| MålemetodeHøyde | point-boundaries / common-boundaries-pass-check-fail | P/S/F |
| NøyaktighetHøyde | point-boundaries / common-boundaries-pass-check-fail | P/S/F |
| Stedfestingsforhold | point-boundaries / common-boundaries-pass-check-fail | P/S/F |
| Stedfestingsårsak | installation-history / positioning-cause-dataset-check | P/S/F |
| Synbarhet | point-text-placeholders / synbarhet-retired | P |
| Merknad | point-boundaries / text-unicode-boundaries | P/F |
| Eier | point-boundaries / common-boundaries-pass-check-fail | P/S/F |
| Vertikalnivå | point-boundaries / common-boundaries-pass-check-fail | P/S/F |
| MaksAvvikVertikalt | point-boundaries / common-boundaries-pass-check-fail | P/S/F |
| MaksAvvikHorisontalt | point-boundaries / common-boundaries-pass-check-fail | P/S/F |
| Tema/S_FCODE | point-applicability-tema / tema-source-modes | P/S/F |
| Type | point-applicability-tema / type-tema-compatibility | P/S/F |
| Kumform | point-applicability-tema / point-applicability-states | P/S/F |
| Bredde | point-applicability-tema / point-applicability-states | P/S/F |
| Lengde | point-boundaries / common-boundaries-pass-check-fail | P/S/F |
| InnvendigUtvendig | point-applicability-tema / point-applicability-states | P/F |
| Tykkelse | point-applicability-tema and line-dimensions-shapes | P/S/F; line decimal unresolved |
| Utvendig_høyde | point-boundaries / common-boundaries-pass-check-fail | P/S/F |
| Avst_BunnInnvUnderUtv | point-applicability-tema / point-applicability-states | P/S/F |
| Byggemetode | point-applicability-tema / point-applicability-states | P/S/F |
| Adkomst | point-applicability-tema / point-applicability-states | P/S/F |
| Kjegle | point-applicability-tema / point-applicability-states | P/S/F |
| AnleggsID | point-boundaries / common-boundaries-pass-check-fail | P/S |
| S_HYPERLINK | point-applicability-tema / hyperlink-exceptions | P/S/F |
| NOBB-VAVVS-nr | point-boundaries / common-boundaries-pass-check-fail | P/F |
| NOBB-VAVVS-nr-ramme | point-boundaries / common-boundaries-pass-check-fail | P/F |
| Nett_type | line-dimensions-shapes / line-dimension-boundaries | P/S/F |
| Material | line-dimensions-shapes / line-dimension-boundaries | P/S/F |
| Dimensjon | line-dimensions-shapes / line-dimension-boundaries | P/S/F |
| VertikalDimensjon | line-dimensions-shapes / line-shape-vertical-dependency | P/S/F |
| Rørform | line-dimensions-shapes / line-shape-vertical-dependency | P/S/F |
| SDR | line-hydraulic / sdr-classification | P/S/F |
| Ringstivhet | line-hydraulic / ringstivhet-classification | P/S/F |
| Trykklasse | line-hydraulic / trykklasse-classification | P/S/F |

## Cross-field and boundary coverage

`point-applicability-tema` carries S_FCODE-only, Tema-only, both agreeing, both conflicting, neither, invalid identity, and schema coexistence. Its conflict object declares Tema unresolved and marks downstream Type/applicability judgement suppressed. It also covers KUM, LOK, STR and an unknown Tema with supplied/missing fields.

`installation-history` uses the manifest's fixed oracle reference date, `2026-09-09`, for current, five-year, six-year, 1900, 1899, future, missing, invalid and cross-object construction-year cases. `point-boundaries` and `point-text-placeholders` cover lexical numeric forms, 96/97/invalid methods, zero/range/malformed accuracy and deviations, all specified text placeholders, missing text, and 255/256-code-point notes.

`line-dimensions-shapes` covers 0/1/31/32 dimensions, circular and non-circular vertical dimensions, A/X, invalid Rørform suppression, material/network categories, and integer/zero/malformed Tykkelse. Its decimal Tykkelse object is deliberately marked `UNRESOLVED`.

## Hydraulic fixture coverage

`line-hydraulic` classifies only from Tema plus Material. It includes plastic water pressure, pumped wastewater pressure, gravity PVC, GRP, GUP, non-plastic pressure, and suction. It provides supplied/missing/invalid SDR, SN and PN combinations. A valid pressure line and gravity line also appear in `line-clean-modern`.

The fixture does not invent the manual's unresolved complete gravity Tema inventory. It uses the conservative ordinary self-fall `AF` examples and marks suction as manual uncertainty.

## Dependency/suppression oracle

The manifest explicitly records: Tema conflict suppresses Type/applicability classification; invalid Material owns material failure and prevents a guessed SDR/Ringstivhet classification; invalid Rørform owns the failure and prevents a vertical-dimension shape conclusion; and Anleggsår owns missing/old `NYTT` concerns before Stedfestingsårsak performs only separate dataset-level plausibility.

## Parser, manual, and headless usage

The parser test verifies documented point/line counts and headers for every parseable fixture, verifies two throws, and records truncated input's current successful partial parse. Users can upload fixtures whose manifest has `manualUpload: true`. Headless tests load bytes, verify the SHA-256, parse through `GMIParser`, use `point:<sourceIndex>` or `line:<sourceIndex>`, then later assert the manifest's v3.2 oracle against the implemented runner.

Current Validator 2.0 is intentionally only a partial baseline. This pass did not compare its incomplete rule set to the future oracle or alter it to obtain green outcomes. Existing V2 tests remain the regression guard; the new fixture test asserts parser/structure/hash/oracle integrity only.

## Unresolved policy items and implementation readiness

The complete confidently-gravity Tema inventory for Ringstivhet and line Tykkelse integer-versus-decimal policy remain unresolved. The suite exposes both without deciding them. It is ready for an implementation plan of four or fewer substantial batches: common/Tema foundation; point applicability and conditional fields; line dimensions/common lists; hydraulic relationships plus final integration and oracle tests.
