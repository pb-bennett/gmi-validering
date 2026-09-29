# SOSI canonical field mapping — Phase 2

## Scope

Implemented evidenced `EGS_PUNKT` projection for the municipality/database SOSI export profile. This is additive browser attribute parity with GMI. Phase 1 line, quality, GUID, and shared metadata behavior remains in place. The ignored municipality exports were read for verification only.

## Architecture

`src/lib/parsing/sosiCanonicalAttributes.js` continues to own SOSI-specific projection. `SOSIParser` still orchestrates parsing and object-name inference, and `normalizeFeature` still owns browser feature and geometry shape. A declarative `pointMappings` table uses the existing path lookup, fill, and normalization helpers. No mapping logic was added to GMI, UI, 3D, or Validator code.

## Point object shapes handled

Rich structures (such as Kum, Sluk, and Pumpestasjon) receive only the exact fields present under `EGS_PUNKT`. Compact equipment (such as Stengeventil and Brannventil) can receive `S_FCODE` from `P_TEMA` without acquiring absent structure fields. `VADriftsdata`, `VASymbol`, and `VAPåskrift` remain sparse. For these three annotation/operation names, object-name inference does not invent `S_FCODE` when a source theme is absent; a present `P_TEMA` or supplied top-level `S_FCODE` still works. Other point types retain object-name inference as the last identity fallback.

## Canonical mappings implemented

| Exact source path | Canonical key | Conversion |
|---|---|---|
| `EGS_PUNKT.P_TEMA` | `S_FCODE` | Preserve string |
| `EGS_PUNKT.TYPE` | `Type` | Preserve string |
| `EGS_PUNKT.KUMBREDDE` | `Bredde` | Finite number, mm |
| `EGS_PUNKT.KUMFORM` | `Kumform` | Preserve string |
| `EGS_PUNKT.INNVUTV_DIM` | `InnvendigUtvendig` | Preserve string |
| `EGS_PUNKT.ANLEGGSÅR` | `Anleggsår` | Finite number |
| `EGS_PUNKT.BYGGEMET` | `Byggemetode` | Preserve string |
| `EGS_PUNKT.TYKK` | `Tykkelse` | Finite number |
| `EGS_PUNKT.KJEGLE` | `Kjegle` | Preserve string |
| `EGS_PUNKT.ADKOMST` | `Adkomst` | Preserve string |
| `EGS_PUNKT.PUNKTIDANL` | `AnleggsID` | Preserve string |
| `EGS_PUNKT.VERT_NIVÅ` | `Vertikalnivå` | Preserve string |

The Phase 1 shared quality, GUID, `datafangstdato`, `STEDF_FORH`, `STEDF_ÅRSA`, and `HØYDEREFERANSE` mappings still apply to points when present.

## Precedence and normalization

An existing top-level canonical value wins unless it is `undefined`, `null`, or an empty string. Thus `0`, `false`, and populated strings remain supplied values. A valid exact `EGS_PUNKT` alias fills an empty value. For `S_FCODE`, object-name inference is last and is suppressed for the three annotation/operation classes without a source theme. Numeric conversion applies only to `KUMBREDDE`, `ANLEGGSÅR`, and `TYKK`; unknown codes and anomalous numeric years pass through according to those narrow conversions. No `Tema` alias or object-name `Type` is synthesized.

## Source preservation

The adapter shallow-copies source properties, then adds verified canonical scalars. The original `EGS_PUNKT`, `kvalitet`, `GUID`, unknown source children, top-level unknown fields, dates, and raw numeric strings retain their original values and references. `SOURCE_FORMAT: 'SOSI'` remains set. Missing paths do not create canonical null/default keys.

## Sparse / annotation safety

Synthetic tests cover a rich structure, compact equipment, `VADriftsdata`, `VASymbol`, and `VAPåskrift`. Equipment with only `P_TEMA` receives only `S_FCODE`; symbols behave likewise. Operational and text annotation records without a verified theme receive no canonical structure fields or inferred `S_FCODE`. Shared quality is present only when its source `kvalitet` children exist.

## Explicitly deferred mappings

No mapping was added for point `Lengde`, `Avst_BunnInnvUnderUtv`, `Utvendig_høyde`, `DYBDE_BER`, `TOPPLOKKH`, `HBUNN`, `INNV_BREDDE_1` or `UTV_BREDDE_1` as `Bredde`, generic `DIMENSJON` as `Bredde`, top-Z quality as general height quality, `SID` as `AnleggsID`, ownership (`geodataeier` or `DRIFTSANSV`) as `Eier`, edit/extraction dates as `Datafangstdato`, or unknown code translations. These remain source-only pending semantic evidence.

## Downstream effects

The mapped scalars are on the shared `attributes` object. Datautforsker exposes them in the point attribute JSON/raw view; its existing highlight list emphasizes a subset, including `S_FCODE`, `InnvendigUtvendig`, `Anleggsår`, `Tykkelse`, and `Vertikalnivå`. `LayerDataTable` discovers top-level attribute keys, map popups enumerate scalar properties, and Sidebar counts use `S_FCODE` and `Type`. No consumer code changed. A parser-to-3D integration test confirms a mapped `KUM` with `Bredde: 1200` uses cylinder radius `0.6` metres and retains its mapped `Type`.

After automated tests passed, all four ignored exports were parsed without errors. Across them, 270 Kum records show evidenced combinations of width, type, shape, construction method, dimensions, cone, thickness, facility ID, and access; 58 Sluk and four Pumpestasjon records also show present fields. There are 57 Stengeventil and 22 Brannventil compact records with theme only, four VASymbol with theme only, 318 VADriftsdata with no projected canonical point fields, and 173 VAPåskrift with none. The exports contain 373 point `ANLEGGSÅR` source values and all 373 become canonical `Anleggsår`; seven point `Vertikalnivå` values were observed. Counts describe the loaded files, not a universal SOSI schema.

## Validator boundary

Validator V2 remains GMI-only. A parser integration test passes a SOSI point with canonical-looking `S_FCODE`, `Type`, `Bredde`, and `AnleggsID` to `createValidationV2Input` and confirms `null`. No validation contract, eligibility check, registry, rule, or UI file changed.

## Tests

- Focused adapter/parser/popup/table selection: 40 passed, 0 failed, using the repository ESM loader. A first plain Node invocation passed 25 tests but could not load the table test's extensionless import; rerunning with the loader passed all 40.
- Broader parser/map/inspector/Validator selection: 70 passed, 0 failed.
- Runtime verification parsed all four ignored exports without errors and checked field presence by object class. No municipality records were written to tests or tracked files.
- `npm.cmd run build` failed because `next/font` could not fetch Roboto from Google Fonts in this network-restricted environment. Font configuration was untouched.
- `git diff --check` passed. Git printed line-ending notices for tracked files, including the pre-existing local runtime data file; there were no whitespace errors.

## Manual acceptance targets

Upload an ignored SOSI export in a browser and inspect a Kum or Sluk with present values. Confirm canonical `S_FCODE`, `Type`, `Bredde`, `Kumform`, `InnvendigUtvendig`, `Anleggsår`, `Byggemetode`, `Tykkelse`, `Kjegle`, `Adkomst`, `AnleggsID`, and `Vertikalnivå` appear only where supplied. Inspect original `EGS_PUNKT` under raw data. Confirm a valve has only its genuine mapped fields, and operational, symbol, and text records remain sparse. Where a structure has `Bredde` and `Type`, compare its existing 3D presentation with the mapped values. This browser check was not performed in this task.

## Files changed

- `src/lib/parsing/sosiCanonicalAttributes.js` — point mapping table and annotation/operation inference guard.
- `tests/sosiCanonicalAttributes.test.mjs` — rich, sparse, precedence, preservation, and forbidden-fallback coverage.
- `tests/richerUsageTelemetryParserIntegration.test.mjs` — parser-to-3D and Validator boundary coverage.
- `docs/agent-reports/20260929-sosi-canonical-field-mapping-phase2.md` — this report.

## Final repository state

Working branch: `feature/sosi-canonical-mapping`, starting HEAD `361c61f`. The pre-existing local modification to `data/usage/aggregates.json` was left untouched. The municipality exports were read only. Nothing was staged, committed, pushed, reset, restored, stashed, cleaned, or switched. Final `git diff --check` and `git status --short` are reported in the terminal response.
