# Validator V2 real-data corrections — 2026-09-28

## Scope

Correct the three confirmed false positives from hosted GMI data: PSP with Byggemetode, PSP with Bredde, and decimal point Tykkelse. This pass changes the point applicability registry, the two affected value paths, and their displayed rule descriptions. It does not change release content, UI styling, data files, or the accepted missing-field policy.

Repository starting state: branch `feature/styling-overhaul-integrated`, HEAD `9b2df18 Prepare GMI Validator 1.2.0 release content`. `data/usage/aggregates.json` was already modified locally and was not edited.

## Finding 1 — PSP / Byggemetode

- **Previous behavior:** With `Tema=PSP`, `Byggemetode=G`, a supplied valid code produced `APPLICABILITY_UNEXPECTED_VALUE` / SJEKK and the contextual “feltet gjelder ikke normalt” message.
- **Root cause:** `getPointFieldApplicability('PSP', 'constructionMethod')` returned the default `UNKNOWN` because PSP had no explicit cell. The `constructionMethod` policy turned every valid supplied value outside `APPLICABLE` into that contextual SJEKK.
- **Source/applicability conclusion:** The [controlled v3.2 decisions](../validation-v2/validator-v2-v32-manual-decisions.md) list the approved applicable Tema subset and leave unclassified Tema unknown; they do not prove PSP requiredness or prohibit a PSP value. The [source map](../validation-v2/innmalingsinstruks-rule-source-map.json) calls the legacy subset unsupported by the instruction. The explicit real-data domain correction supplied for this task establishes **may be present** for PSP. It does not establish **required when missing**. The controlled code list establishes **value validity** independently.
- **New behavior:** PSP has an `OPTIONAL_SUPPORTED` Byggemetode cell. Valid `G` passes; invalid codes still fail with `VALUE_NOT_ALLOWED`; valid `UK` keeps its unusual-value SJEKK. Missing PSP Byggemetode passes, while existing applicable Tema retain the NYTT/non-NYTT missing split. STR with supplied valid Byggemetode still receives contextual SJEKK.

## Finding 2 — PSP / Bredde

- **Previous behavior:** `Tema=PSP`, `Bredde=1600` produced the same contextual applicability SJEKK.
- **Root cause:** PSP also had no `width` cell; a valid supplied integer was classified as unexpected for an `UNKNOWN` Tema.
- **Source/applicability conclusion:** The [source map](../validation-v2/innmalingsinstruks-rule-source-map.json) describes Bredde as a point integer measurement with a polygon exception, but gives no exact PSP requiredness decision. The explicit real-data correction establishes **may be present**. It does not establish **required when missing**. Integer format, nonnegative range, and the existing 20 mm plausibility threshold remain the **value validity** rules.
- **New behavior:** PSP has an `OPTIONAL_SUPPORTED` Bredde cell. `1600` passes, malformed/negative values fail, and `0–19` retains SJEKK for the value itself. Missing PSP Bredde passes. A supplied valid Bredde on explicitly non-applicable STR still produces contextual SJEKK. The optional numeric path now applies the existing zero and width threshold checks to supplied optional values, including INR, instead of returning PASS before those checks.

## PSP applicability audit

The runtime point matrix in `pointFieldApplicability.js` has six field IDs. Before this pass all six PSP lookups were `UNKNOWN`, so a valid supplied value for any of them could produce the generic contextual SJEKK. The decisions file has no approved PSP row. The source map does not supply an exact PSP applicability or requiredness ruling for the other four.

| Field | Prior PSP state | Current PSP state | Presence | Missing | Supplied value |
| --- | --- | --- | --- | --- | --- |
| Byggemetode (`constructionMethod`) | UNKNOWN | OPTIONAL_SUPPORTED | Allowed by explicit real-data correction | Not newly required | Existing code list and `UK` review |
| Bredde (`width`) | UNKNOWN | OPTIONAL_SUPPORTED | Allowed by explicit real-data correction | Not newly required | Existing integer and range policy |
| Kumform (`manholeShape`) | UNKNOWN | UNKNOWN | Unresolved | Existing unknown behavior | Existing code list; contextual review if valid |
| Kjegle (`cone`) | UNKNOWN | UNKNOWN | Unresolved | Existing unknown behavior | Existing code list; contextual review if valid |
| Tykkelse (`wallThickness`) | UNKNOWN | UNKNOWN | Unresolved | Existing unknown behavior | Updated decimal validity; contextual review if valid |
| Avst_BunnInnvUnderUtv (`innerBottomToOuterUndersideDistance`) | UNKNOWN | UNKNOWN | Unresolved | Existing unknown behavior | Existing decimal validity; contextual review if valid |

Other point policies were checked separately: PSP Adkomst may still receive a contextual review because the existing policy accepts KUM/SLU; no controlled PSP decision supports changing it. `Type` uses an allowed Type/Tema pair relation; S_HYPERLINK uses the Byggemetode **APPLICABLE** set to decide whether a missing attachment is expected. The two new `OPTIONAL_SUPPORTED` PSP cells do not make PSP attachments expected. Lengde and Utvendig_høyde produce supplied-value reviews regardless of Tema, rather than a PSP mapping. No additional PSP applicability mapping changed.

`OPTIONAL_SUPPORTED` means a supplied value is legitimate, while absence does not fail. `APPLICABLE` remains the existing requiredness-bearing state. Value validation runs for both. Diagnostic required coverage continues to exclude optional cells, preserving the meaning and counts of “applicable” coverage.

## Finding 3 — decimal Tykkelse

- **Previous parser/contract:** The point rule was titled and based on integer format; the point `wallThickness` field policy called `integer()`, so `26,5` failed with `VALUE_NOT_INTEGER`. Line Tykkelse already accepts plain comma and point decimals. The [controlled manual decisions](../validation-v2/validator-v2-v32-manual-decisions.md) and [source map](../validation-v2/innmalingsinstruks-rule-source-map.json) explicitly described point Tykkelse as integer-only / `Heltall`. The supplied real-data domain correction supersedes that restriction for point measurements.
- **Root cause and fix:** Point Tykkelse now uses its own `pointThicknessDecimal()` lexical check and numeric conversion. The source lexeme remains in the existing evidence and diagnostic pipeline; parsing only produces a number for comparison. The stable rule ID is retained for existing consumers, while its title, description, and field information now describe decimal support.
- **Accepted forms:** ASCII digits as an integer (`26`) or digits on both sides of one comma (`26,5`) or point (`26.5`). Point notation is retained from established line Tykkelse and point distance conventions. The prior integer form with a leading plus (`+26`) remains valid, while `+26,5` is not introduced. Negative plain numbers parse and then fail the existing range check. Zero retains SJEKK. Text, whitespace, exponent, repeated separators, incomplete decimals, and integers beyond the prior safe numeric range fail format validation. No new decimal-place cap was inferred for point Tykkelse from the line-only two-decimal policy.
- **Parser scope:** The shared `integer()` helper and generic `evaluateIntegerFormat()` were not changed. Bredde, Lengde, Utvendig_høyde, Nøyaktighet, the other accuracy/deviation fields, dimension, and numeric looking NOBB identifiers remain integer-only or code/string fields under their existing owners. `Avst_BunnInnvUnderUtv`, line Tykkelse, and SDR already have dedicated decimal policies. The source proves line Tykkelse decimal support and the existing controlled decisions prove point distance decimal support; neither justifies broadening unrelated point fields here.

## Preserved behavior

- For applicable points, missing Byggemetode, Kjegle, Tykkelse, and Avst_BunnInnvUnderUtv remain FEIL when explicitly NYTT and SJEKK otherwise. PSP's two optional cells do not inherit that requirement.
- Missing line Tykkelse, SDR, and Ringstivhet retain their accepted NYTT/non-NYTT behavior. Strict missing fields and Anleggsår are unchanged.
- Invalid supplied Byggemetode and Bredde values retain FEIL. Negative point Tykkelse retains FEIL; zero retains SJEKK. STR still demonstrates a genuinely non-applicable contextual warning.
- Required coverage, diagnostic grouping, and list/detail presentation were not altered. The full Validator V2 test group covers their existing behavior.

## Tests

- Added `tests/validationV2RealDataCorrections.test.mjs` for both PSP presence cases, invalid values, non-applicable STR controls, missing-field separation, comma/point/integer Tykkelse, malformed and range failures, and an integer-only measurement control.
- Updated the exact applicability inventory from 129 to 131 cells and the policy revision metadata. Updated older Tykkelse expectations for decimal point notation. Two older code-list tests had expected FEIL for missing non-NYTT construction fields; those expectations were aligned with the already accepted SJEKK policy, with explicit NYTT FEIL assertions retained.
- Full `node --test tests/validationV2*.test.mjs`: **265 passed, 0 failed**. This includes the focused tests and policy/applicability tests.
- `git diff --check`: passed; Git emitted only LF/CRLF conversion warnings for working-copy files.

## Build

`npm.cmd run build` was attempted because runtime policy code changed. Next/Turbopack could not fetch Roboto from Google Fonts in this environment; the build stopped at `src/app/layout.js` font loading. No font architecture was changed. The first `npm` invocation encountered PowerShell script execution policy, so `npm.cmd` was used for the actual build attempt.

## Files changed

- `src/lib/validation-v2/registry/pointFieldApplicability.js`
- `src/lib/validation-v2/fieldPolicy.js`
- `src/lib/validation-v2/registry/rules.js`
- `src/lib/validation-v2/registry/fieldInformation.js`
- `tests/validationV2RealDataCorrections.test.mjs`
- `tests/validationV2PointFieldApplicability.test.mjs`
- `tests/validationV2GmiA8.test.mjs`
- `tests/validationV2GmiV32Batch2.test.mjs`
- `tests/validationV2GmiV32Batch2Completion.test.mjs`
- `tests/validationV2GmiV32PointCodeLists.test.mjs`
- This report.

## Manual retest targets

1. Point `Tema=PSP`, `Stedfestingsårsak=NYTT`, `Byggemetode=G`: no contextual applicability SJEKK; supplied value passes.
2. Point `Tema=PSP`, `Bredde=1600`: no contextual applicability SJEKK; supplied value passes.
3. Applicable point such as `Tema=KUM`, `Tykkelse=26,5`: no format FEIL; positive value passes. Repeat with `26.5` if point notation appears in actual GMI deliveries.
4. PSP with invalid Byggemetode/Bredde still fails, and PSP without those fields does not acquire a new missing finding.

## Final repository state

No commit or push was made. The pre-existing local modification to `data/usage/aggregates.json` remains untouched. The listed source, test, and report files are the changes from this pass. Branch and HEAD remain as recorded under Scope.
