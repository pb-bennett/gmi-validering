# SOSI canonical field mapping — Phase 1

## Scope

Implemented additive browser attribute parity for verified EGS line fields and common SOSI metadata. The committed mapping plan is the source for field paths and deferred decisions. SOSI decoding, GeoJSON geometry normalization, GMI parsing, and Validator V2 contracts remain unchanged. No reference export was edited or copied into tracked files.

## Architecture implemented

`src/lib/parsing/sosiCanonicalAttributes.js` is a pure adapter called by `SOSIParser` after `sosijs` emits GeoJSON properties and before `normalizeFeature`. It accepts geometry type, original properties, and the current object-name inferred `S_FCODE`; it returns a new top-level attributes object and a structural `guid`. Exact path declarations separate EGS line mappings from common top-level and quality mappings. The adapter is never called by GMI.

## Line mappings

| SOSI path under `EGS_LEDNING` | Browser property | Conversion |
|---|---|---|
| `L_TEMA` | `S_FCODE` | string code |
| `MATERIAL` | `Material` | string code |
| `DIMENSJON` | `Dimensjon` | finite number |
| `INNVUTV_DIM` | `InnvendigUtvendig` | string code |
| `FORM` | `Rørform` | string code |
| `NETTYPE` | `Nett_type` | string code |
| `ANLEGGSÅR` | `Anleggsår` | finite number |
| `TYKK` | `Tykkelse` | finite number |
| `RINGSTIVH` | `Ringstivhet` | string code |
| `TRYKKLAS` | `Trykklasse` | string code |
| `VERT_NIVÅ` | `Vertikalnivå` | string code |

The adapter maps these only on line-like `LineString` or `Polygon` features, matching the parser's existing outer-ring treatment for polygons. Unknown string codes, including `10P`, `KL25`, and `HK`, are retained verbatim.

## Shared metadata and quality

Exact top-level aliases map `HØYDEREFERANSE` to `Høydereferanse`, `STEDF_FORH` to `Stedfestingsforhold`, `STEDF_ÅRSA` to `Stedfestingsårsak`, and `datafangstdato` to `Datafangstdato`. A valid source `Date` becomes an ISO string; an invalid source `Date` becomes canonical `null`; a non-Date source value is not projected. The original date remains untouched.

The five exact `kvalitet` children map to `Målemetode`, `Nøyaktighet`, `Synbarhet`, `MålemetodeHøyde`, and `NøyaktighetHøyde`. Finite numbers retain their value. Present non-finite or missing members represented by `NaN` become canonical `null`; absent paths create no key. The source `kvalitet` object, including `NaN`, is retained. A primitive top-level `GUID` remains in `attributes.GUID` and is also passed to `feature.guid`; absent or non-primitive GUID leaves the existing structural `null` default.

Shared paths are presence-based for point features. No `EGS_PUNKT` fields are promoted. Operations, symbol, and annotation points therefore remain sparse unless they actually carry one of these common paths.

## Precedence and normalization

An existing canonical value is retained unless it is `undefined`, `null`, or an empty string. Thus `0`, `false`, non-empty strings, and finite numbers are not overwritten. On lines, `S_FCODE` resolves from existing top-level value, then `EGS_LEDNING.L_TEMA`, then the existing object-name inference. Points keep their prior inference fallback without a `P_TEMA` mapping. No `Tema` duplicate is synthesized.

Each declaration uses narrow code, number, finite-number-or-null, or Date conversion. Number conversion accepts finite numbers and non-empty numeric strings; invalid numeric inputs do not create canonical values. No code lists are validated and no display labels are substituted.

## Source preservation

The adapter shallow-copies the source top level, then adds canonical scalars. Original `EGS_LEDNING`, `EGS_PUNKT`, `kvalitet`, unknown top-level fields, unknown nested children, source `Date` objects, numeric strings, and `NaN` values remain at their original paths and retain their references. The adapter does not recursively normalize or mutate them. Existing parser-owned `SOURCE_FORMAT: 'SOSI'` remains present.

## Explicitly deferred mappings

No mapping was added for line `lengde` to `Lengde`, `UTV_DIM_1` to `VertikalDimensjon`, `INNV_DIM_1`, `SDR`, ownership fields to `Eier`, `SID` to `AnleggsID`, `REGDATO`/`ENDREDATO`/`datauttaksdato` to `Datafangstdato`, or maximum-deviation fields. All `EGS_PUNKT` canonical fields listed for Phase 2 remain source-only, including `P_TEMA`, type, width, shape, construction, and point dimensions.

## Validator boundary

Validator V2 still checks `layer.data.format === 'GMI'`. The parser integration test supplies a SOSI dataset containing canonical-looking fields and confirms `createValidationV2Input` returns `null`. No Validator file, policy, source-format contract, or input creation path was changed.

## Tests

- Focused adapter, parser integration, and Validator suite: 26 passed, 0 failed.
- Broader parser/map/popup/table/Validator selection with `--experimental-loader ./tests/esmJsLoader.mjs`: 50 passed, 0 failed. The first plain Node invocation passed 35 tests but the table test process could not resolve an extensionless import without that loader. Rerunning with the repository loader resolved the test invocation issue.
- The GMI parser integration test remained green. Popup and table code were not changed; their existing regressions passed. Synthetic objects exercise canonical scalar output and source preservation without copying municipality records.
- `npm.cmd run build` succeeded, including compilation, type check, and static page generation. Browserslist emitted an age notice only.
- `git diff --check` succeeded; Git emitted line-ending notices for already modified runtime data and touched source/test files.

## Manual retest targets

Using an ignored real SOSI export under `REF_FILES/SOSI-eksempler/`, upload it in the app without changing the file. Open a Vannledning line popup and data table row. Confirm top-level `S_FCODE`, `Material`, `Dimensjon`, `InnvendigUtvendig`, `Rørform`, `Nett_type`, and `Anleggsår` appear as scalar fields and `EGS_LEDNING` remains inspectable with original strings. Check a line with sparse technical fields and a point with quality to verify presence-based behavior.

Compare line widths for lines with different mapped `Dimensjon` values. Open incline detail and verify it sees `Material`, `Nett_type`, and `Dimensjon`. Inspect 3D pipes with dimension and `HØYDEREFERANSE` present; verify sizing and vertical reference use the mapped fields. Confirm a SOSI layer is still absent from Validator V2 eligibility. These are manual retest instructions; no browser-based real-export retest was performed during this implementation.

## Files changed

- `src/lib/parsing/sosiCanonicalAttributes.js` — new pure adapter and declarations.
- `src/lib/parsing/sosiParser.js` — adapter invocation and structural GUID pass-through.
- `tests/sosiCanonicalAttributes.test.mjs` — focused adapter contracts.
- `tests/richerUsageTelemetryParserIntegration.test.mjs` — parser and Validator boundary integration.
- `docs/agent-reports/20260929-sosi-canonical-field-mapping-phase1.md` — this report.

## Final repository state

Working branch: `feature/sosi-canonical-mapping`. The pre-existing modification to `data/usage/aggregates.json` was left untouched. New adapter, tests, and this report are untracked; parser and integration test are modified. Nothing was staged, committed, pushed, reset, restored, stashed, cleaned, or switched. `REF_FILES/` was not changed.
