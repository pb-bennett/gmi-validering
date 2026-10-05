# SOSI Status support

## Scope

Implemented additive canonical lifecycle Status for verified database-export SOSI records, code/label presentation in existing field filters, and code-only compact hover segments. Completed in one context without delegated agents. No commit, push, branch switch, reset, restore, stash, or clean was performed.

Before editing, verified branch `feature/sosi-status-support` and HEAD `b82b7f0` (`Polish map background controls`). The only initial modification was `data/usage/aggregates.json`; it was not read, edited, restored, staged, or cleaned by this task. Ignored reference exports were read in place only.

## Existing architecture

- `src/lib/parsing/sosiParser.js` parses raw bytes through sosijs, consumes its GeoJSON property structure, calls the pure canonical mapper, and passes attributes to `normalizeFeature`.
- `src/lib/parsing/sosiCanonicalAttributes.js` shallow-copies source properties, fills canonical fields from exact geometry-specific paths, and retains source groups unchanged. Existing canonical values take precedence.
- `Sidebar.js` and `LayerPanel.js` discover filterable fields dynamically from `Object.keys(item.attributes)`, separately for points and lines. There is no fixed browser filter field registry to extend. `src/data/fields.json` supplies metadata and is also consumed by legacy validation, so it was deliberately left unchanged.
- Sidebar discovery collects the union of fields, puts S_FCODE first, and counts missing values across that union. LayerPanel discovery counts fields actually present on each object. Both retain distinct values using their string identity.
- Store filtering uses existing global and per-layer hidden-value state. MapInner checks geometry scope and exact value equality; table and 3D consumers use the same missing-value/string conventions. Layer visibility and other filters continue to compose normally.
- Compact hover formatting is owned by `src/lib/map/featureHoverLabel.mjs` and consumes canonical top-level properties.

## Real SOSI audit

Audited all four available files under `REF_FILES/SOSI-eksempler/` before production edits. Parsed raw bytes using the installed sosijs Parser, traversed every property tree for status-like names, and counted geometries, exact paths, types, codes, and missing-record subtypes. No entire source objects were printed or copied into tests.

| Export | Total lines | Lines with Status / codes | Total points | Points with Status / codes |
| --- | ---: | --- | ---: | --- |
| 20260924_VA_Løkkeåsveien-Dreggveien.sos | 566 | 566: D 545, N 19, I 1, EF 1 | 518 | 244: D 239, N 5 |
| 20260924_VA_Wilhelmsenhallen.sos | 224 | 224: D 185, N 26, EN 3, EF 10 | 356 | 155: D 146, N 8, E 1 |
| 20260924_VA_Øvre-Smidsrødvei.sos | 161 | 161: D 146, N 14, EF 1 | 172 | 87: D 84, N 3 |
| 20260928_VA_TørkoppPS-eksisterende.sos | 48 | 48: D 47, N 1 | 56 | 28: D 28 |

| Source shape | Parsed Status path | Count with Status | Observed codes |
| --- | --- | ---: | --- |
| LineString | properties.EGS_LEDNING.status | 999 / 999 (100%) | D 923, N 60, EF 12, EN 3, I 1 |
| Point | properties.EGS_PUNKT.status | 514 / 1,102 (46.64%) | D 497, N 16, E 1 |

Missing Status occurs on 588 points: VADriftsdata 318, VAPåskrift 173, Stengeventil 57, Brannventil 22, AnnetUtstyrVA 6, Utviser 4, Lufteventil 4, and VASymbol 4. These counts describe this exporter profile, not universal subtype requirements. No source Status is inferred for these records.

## Verified source paths

The raw SOSI attribute is `...STATUS`, nested within `..EGS_LEDNING` or `..EGS_PUNKT`. sosijs exposes the child name as lowercase `status`, with string values. The exact adapter paths are therefore `EGS_LEDNING.status` for lines and `EGS_PUNKT.status` for points.

No top-level Status/status/STATUS source alias or other status-like property path was observed in any export. No uppercase parsed child alias is mapped. A pre-existing top-level canonical `Status` is retained by the source copy and normal precedence rules. Polygon behavior follows the existing line mapping architecture, but these four references contain no polygons.

## Observed Status values

Across all records with Status: D 1,420; N 76; EF 12; EN 3; I 1; E 1. Every observed code belongs to the supplied source domain. No discrepancy or unexpected code was found. R, P, UB, F, UK, MIDL, and MIDLUTED are supplied domain values that are not observed in these references. They are supported without inventing real-data coverage.

## Canonical mapping

Added exact Status entries to both geometry mapping lists. Canonical top-level `Status` stores the source code verbatim. Existing canonical values other than undefined, null, or empty string win, matching established fillability rules. Absent/null/empty/whitespace-only nested source values do not create Status. A narrow `nonBlankCode` normalization kind prevents blank source Status while leaving normalization of all existing aliases unchanged.

Unknown string codes survive unchanged. No membership validation, label translation, case conversion, geometry/theme/date inference, or Drift default is applied. Source groups and their `status` values retain the same identity and contents. Ordinary GMI parsing was not changed; generic consumers can use a top-level Status already provided by any source.

## Status domain

`src/lib/statusDomain.mjs` defines the single frozen lookup and pure label/choice helpers:

| Code | Label |
| --- | --- |
| D | Drift |
| R | Reserve |
| I | Ikke i bruk |
| P | Prosjektert |
| UB | Under bygging |
| N | Nedlagt |
| E | Erstattet |
| EF | Erstattet fjernet |
| EN | Erstattet nedlagt |
| F | Fjernet |
| UK | Ukjent |
| MIDL | Midlertidig (provisorisk) |
| MIDLUTED | Midlertidig ute av drift |

`getStatusLabel` returns a known label, the raw unknown string, or null for missing/blank input. `formatStatusChoice` returns `CODE · Label` for known codes and raw code for unknown codes. Own-property lookup also safely handles future strings such as `constructor` and `__proto__`. Neither helper validates a file or writes canonical data.

## Filter integration

Canonical Status is automatically discovered in both existing field lists for either geometry whenever present in the dataset/layer. Both value rows now use the shared choice formatter for Status only. Missing-value display stays on its existing path. Keys, counts, toggle callbacks, hover highlighting, persisted state, and equality matching continue to use raw code values. For example, displaying `EF · Erstattet fjernet` still toggles only `EF`.

The filter UI is an exclusion/visibility system: checked rows remain visible and unchecked values are hidden. Isolating D requires hiding other Status rows, and explicitly hiding `(Mangler)` when missing objects should also be excluded. N never matches EN, and F never matches EF. Unknown future strings are discovered and filterable normally. No separate Status-only filtering mechanism was added.

Existing missing-value behavior is preserved: no Status filter hides a missing object by default; an explicit `(Mangler)` hidden-value rule can hide it. Sidebar includes a missing bucket across discovered fields. LayerPanel counts only properties actually present, so completely absent properties are not counted in its value rows; this is an existing generic limitation, not a new Status rule. Label text is presentation only; the existing Sidebar value search still searches raw codes. No filter UI redesign was performed.

## Hover tooltip integration

Both line and point formatters read only canonical top-level Status using existing exact-value omission rules. The final order is:

- Lines: `S_FCODE [Dimensjon] · Material · Anleggsår · Eier · Status · Stedfestingsårsak`.
- Points: `S_FCODE or Type · distinct Type · Bredde · Material · Anleggsår · Eier · Status · Stedfestingsårsak`.

Missing parts disappear without blank separators. Example: `VL 160 · PE100 · 2020 · K · D`. Eier remains present alongside Status. Status displays the code without a prefix or Norwegian label. Explicit UK is shown; absent Status does not become UK. Unknown XYZ is shown. Existing annotation/symbol suppression and the final contextual cause position are preserved.

## Generic data surfaces

The parser's normalized `attributes` contains canonical Status. Existing dynamic field inspection therefore receives it normally. LayerDataTable discovers attribute keys and creates ordinary attribute columns; the shared `createAttributeColumnAccessors` reads Status exactly and returns undefined when absent. The generic popup enumerates top-level properties and shows `Status: D` alongside Eier without a Status-specific branch. The compact tooltip remains code-only. No duplicate inspector or details component was introduced.

## Validator V2 preservation

No validation implementation, registry, policy, rules, GMI field requirements, or GMI parser files changed. `src/data/fields.json` is unchanged. Status is not required, checked for domain validity, or assigned a missing-field warning. Existing GMI and Validator regression suites ran as part of the broader run. Explicit source UK remains distinct from missing Status.

## Tests

Focused command:

```text
node --experimental-loader ./tests/esmJsLoader.mjs --test --test-reporter=tap tests/sosiCanonicalAttributes.test.mjs tests/statusBrowsing.test.mjs tests/featureHoverTooltip.test.mjs tests/featurePopupContent.test.mjs tests/richerUsageTelemetryParserIntegration.test.mjs tests/objectTableInspection.test.mjs tests/validationV2WorkspaceInspector.test.mjs
```

Final focused result: **67 passed, 0 failed**. Coverage includes verified line/point paths, canonical precedence/fillability, missing and blank sources, unknown codes, unchanged nested source identity, domain labels and fallback, dynamic field discovery and distinct counts, actual map predicates for geometry/global/layer scopes, missing bucket handling, parser normalization, generic table accessors, popup attributes, Eier plus Status hover order, explicit UK, unknown codes, and final contextual field behavior.

The filter tests execute the existing embedded pure discovery blocks and map predicate extracted from their component sources, without mounting React or introducing a parallel implementation. Small synthetic parser objects use only paths verified in real exports. No ignored exports were copied into tracked tests.

Broader command: all `tests/*.test.mjs` files supplied to `node --experimental-loader ./tests/esmJsLoader.mjs --test --test-reporter=tap`. Result: **557 tests, 556 passed, 1 failed**. The sole failure is the known `tests/appInfoUiContract.test.mjs:154` source contract, `AppInfo reclaims desktop height only in constrained viewports`, asserting `compactStart > 0 && compactEnd > compactStart`. It is unrelated and was left unchanged. The focused run after the final table-accessor assertion passed; that assertion adds no production change or test count.

Read-only real-reference verification after implementation used SOSIParser on all four raw-byte exports: **zero errors**, 999 lines and 1,102 points parsed, all 1,513 source-backed Status values matched canonical values, and all 588 source-missing points retained absent canonical Status.

`git diff --check` passed. Production build was not run; it is optional for this feature pass. No browser session was executed. Detailed test logs were redirected to temporary files rather than printed in full.

## Manual acceptance

The following browser checks are documented for manual execution; they are not claimed as completed:

1. Load a representative database-export SOSI, such as Wilhelmsenhallen.
2. Inspect a D-coded object and confirm canonical `Status: "D"` plus the unchanged nested source `status`.
3. Hover it and confirm code D appears alongside Eier, before Stedfestingsårsak when present.
4. Open the field list for both line and point scopes; confirm Status and useful code/label choices.
5. Isolate D using existing value visibility toggles; hide other codes and explicitly hide the missing bucket if only D objects should remain.
6. Isolate N or EF from real data; verify N/EN and F/EF remain distinct. Use synthetic F if testing it, since these exports have no F.
7. Repeat across multiple loaded layers while retaining other visibility/filter selections.
8. Clear field filters and confirm all otherwise-visible objects return.
9. Inspect a source-missing equipment/annotation object; confirm no Status was invented and no blank hover segment appears.
10. Load ordinary new-innmåling/GMI and confirm no missing Status validation finding or invented code.

## Files changed

- `src/lib/parsing/sosiCanonicalAttributes.js`: exact additive aliases and nonblank source-code handling.
- `src/lib/statusDomain.mjs`: shared source-code domain and display helpers.
- `src/components/Sidebar.js`: Status choice presentation in existing global field list.
- `src/components/LayerPanel.js`: Status choice presentation in existing layer field list.
- `src/lib/map/featureHoverLabel.mjs`: compact canonical Status segment after Eier.
- `tests/sosiCanonicalAttributes.test.mjs`: focused mapping/source-preservation cases.
- `tests/statusBrowsing.test.mjs`: domain, dynamic filtering, parser normalization and table coverage.
- `tests/featureHoverTooltip.test.mjs`: code/order/omission/unknown coverage.
- `tests/featurePopupContent.test.mjs`: generic canonical Status and Eier visibility.
- `docs/agent-reports/20261005-sosi-status-support.md`: this report.

## Remaining issues

Known unrelated AppInfo source-contract failure remains. Manual browser acceptance remains unexecuted. Existing per-layer absent-property counting and raw-code value search are preserved as described above. No unexpected real-data status code was found.

## Final repository state

Branch remains `feature/sosi-status-support`, HEAD remains `b82b7f0`. No staging, commit, or push. Reference material was read only and remained ignored. The pre-existing runtime modification remains untouched.

Expected final `git status --short`:

```text
 M data/usage/aggregates.json
 M src/components/LayerPanel.js
 M src/components/Sidebar.js
 M src/lib/map/featureHoverLabel.mjs
 M src/lib/parsing/sosiCanonicalAttributes.js
 M tests/featureHoverTooltip.test.mjs
 M tests/featurePopupContent.test.mjs
 M tests/sosiCanonicalAttributes.test.mjs
?? docs/agent-reports/20261005-sosi-status-support.md
?? src/lib/statusDomain.mjs
?? tests/statusBrowsing.test.mjs
```
