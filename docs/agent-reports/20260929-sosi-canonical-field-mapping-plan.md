# SOSI canonical field mapping plan — 2026-09-29

## Objective

Map already parsed SOSI VA attributes onto the same literal browser attribute keys that GMI supplies, while retaining every original SOSI property. The intended object shape is the existing browser shape:

```text
dataset.points[] / dataset.lines[]
  -> { id, type, extent, attributes, guid, coordinates }
  -> attributes contains canonical scalar keys plus original SOSI properties
```

This is display and shared-tool parity. It is not a redesign of SOSI parsing and it does not make SOSI input eligible for Validator V2.

Audit basis: branch `feature/sosi-canonical-mapping` at `1db4b3f` (`Refine workspace Stats trigger`), current source and tests, the controlled field registry/value tables, the initially supplied `EGS_LEDNING` object, and all four ignored municipality/database exports under `REF_FILES/SOSI-eksempler/`. The repository still contains no tracked `.sos`/`.sosi` fixture and no current SOSI attribute-mapping regression test.

## Raw exports inspected

All four declared `ISO8859-1` exports were inspected in place and parsed through the installed `sosijs` version. No source file was changed or copied into tracked storage.

| Export | Raw/parsed objects | Line object types | Point/structure object types |
|---|---:|---|---|
| `20260924_VA_Løkkeåsveien-Dreggveien.sos` | 1,084: 566 curves, 454 points, 64 text objects | Vannledning, Spillvannsledning, Overvannsledning, AvløpFelles, Drensledning | Kum, Sluk, Fettutskiller, Kran, Oljeutskiller, AnnetPunktVA, Grenpunkt, Pumpestasjon, Utslipp, Inntak, Utviser, Brannventil, Lufteventil, AnnetUtstyrVA, Stengeventil, plus VADriftsdata and VAPåskrift |
| `20260924_VA_Wilhelmsenhallen.sos` | 580: 224 curves, 287 points, 69 text objects | Vannledning, Overvannsledning, Spillvannsledning, AvløpFelles, Drensledning | Kum, Slamavskiller, Sluk, TrasepunktLedn, Kran, Sandfangskum, Grenpunkt, Pumpestasjon, Utslipp, AnnetPunktVA, Gategutt, Brannventil, Utviser, AnnetUtstyrVA, Stengeventil, VADriftsdata, VAPåskrift, VASymbol |
| `20260924_VA_Øvre-Smidsrødvei.sos` | 333: 161 curves, 148 points, 24 text objects | Vannledning, AvløpFelles, Spillvannsledning, Overvannsledning | Kum, Sluk, Grenpunkt, Septiktank, Kran, Pumpestasjon, Fordrøyningsbasseng, Brannventil, Lufteventil, Stengeventil, AnnetUtstyrVA, VADriftsdata, VAPåskrift, VASymbol |
| `20260928_VA_TørkoppPS-eksisterende.sos` | 104: 48 curves, 40 points, 16 text objects | Vannledning, Spillvannsledning, AvløpFelles, Overvannsledning, Drensledning, Signalkabeltrase | Kum, Grenpunkt, Pumpestasjon, Overløp, Kran, Sluk, Utslipp, Utviser, Brannventil, AnnetUtstyrVA, Stengeventil, VADriftsdata, VAPåskrift |

Raw group counts match the parsed structure: every curve has exactly one `EGS_LEDNING`; every raw point has exactly one `EGS_PUNKT`; text objects have neither. No object contains a repeated `EGS_*` or `KVALITET` group. `sosijs` represents curves as `LineString`, raw points and text objects as `Point`, and retains `objekttypenavn` so callers can distinguish domain points from annotation objects.

Across all files there are 999 lines and 1,102 parsed Point geometries. All lines have `EGS_LEDNING`, `kvalitet`, `GUID`, and `datauttaksdato`. Of the Point geometries, 929 have `EGS_PUNKT`, 514 have standard `kvalitet`, and 607 have `GUID`. The exact difference is explained by export-only annotation/operations records: 318 `VADriftsdata` and four `VASymbol` records have `EGS_PUNKT` but no GUID, while 173 `VAPåskrift` text records have no `EGS_PUNKT` or GUID.

## Standard/common vs export-specific properties

| Category | Observed properties | Mapping implication |
|---|---|---|
| Broad SOSI/GeoJSON properties | `objekttypenavn`, `kvalitet`, `datafangstdato`, `datauttaksdato`, `geodataprodusent`, `GUID`, coordinates | Prefer these paths when their meaning matches a canonical field. Treat `datafangstdato` and parsed quality as common metadata; do not equate extraction date with capture date. |
| Database export profile | `EGS_LEDNING`, `EGS_PUNKT` and their children; mixed casing is stable across these four files | Use an explicit adapter profile. These fields are well supported for this exporter, but are not universal SOSI fields. |
| Object-specific point structures | Common VA structures carry rich `EGS_PUNKT`; valves/hydrants/equipment carry small identity records; `VADriftsdata`, `VASymbol`, and `VAPåskrift` have separate minimal/annotation shapes | Scope mappings to an exact present path. Never assume every Point geometry is a physical point object or has quality/dimensions. |

No casing aliases were observed between the four exports. Container names are exactly `EGS_LEDNING` and `EGS_PUNKT`; identity children are exactly `L_TEMA` and `P_TEMA`; most database children are uppercase, while `geodataeier`, `status`, and line `lengde` are lowercase. Standard properties use the exact lower-camel spellings emitted by `sosijs`. This consistency supports explicit paths, not recursive case-insensitive searching.

## Current GMI data path

1. `src/components/FileUpload.js` detects GMI, decodes bytes, constructs `GMIParser`, and calls `toObject()`.
2. `src/lib/parsing/gmiParser.js` reads the `_FIELDNAMES` declarations separately for point and line sections. `_parseFieldValues()` assigns values directly to those exact names, turns empty text into `null`, and coerces integer, decimal, and boolean lexemes. GMI `GUID` is stored as `feature.guid`, outside `feature.attributes`.
3. The parser returns `{ format: 'GMI', header, points, lines, fieldAnalysis, ... }`. Each feature already has the browser object shape; there is no later general canonicalization pass.
4. `FileUpload` stores that object unchanged in both the layer store (`addLayer`) and legacy data state (`setData`). `src/lib/store.js` immediately runs outlier, incline, and Z analyses for the layer.
5. `src/components/MapInner.js` spreads `line.attributes` or `point.attributes` into GeoJSON `properties`. Styling, filtering, labels, and popups therefore see literal top-level attribute keys. `src/lib/map/featurePopupContent.mjs` enumerates those properties and renders scalar values.
6. `src/components/LayerDataTable.js` reads the same layer rows. It discovers columns from `Object.keys(item.attributes)` (up to its sampling limitation) and uses `row.attributes[field]` directly.
7. Profile/incline and 3D code use the same objects. `src/lib/analysis/incline.js` consumes `Tema`/`S_FCODE`, `Dimensjon`, and coordinate Z values. `src/lib/3d/transformGMIData.js` consumes `S_FCODE`, `Dimensjon`, `Høydereferanse`, point `Type`, and point widths. Z validation consumes coordinates and identity fields. Outlier analysis carries `feature.guid`.
8. Validator V2 has a separate semantic field registry and GMI adapter under `src/lib/validation-v2`. Its canonical IDs resolve to literal GMI source properties, but that adapter is not the browser normalization layer.

GMI's practical browser canonicalization is therefore its field-name contract: if `_FIELDNAMES` says `Material`, the browser object has `attributes.Material`. There is no GMI post-parse rename stage.

## Current SOSI data path

1. `FileUpload` passes raw SOSI bytes to `SOSIParser.parse()` so `sosijs` can apply the declared charset.
2. `src/lib/parsing/sosiParser.js` calls `sosijs.Parser.parse()` and `dumps('geojson')`.
3. For every GeoJSON feature, it copies `feature.properties` wholesale into `attributes`, infers a GMI-like `S_FCODE` from `objekttypenavn`/`OBJEKTTYPENAVN`/`OBJTYPE`/`TYPE`, and adds `SOURCE_FORMAT: 'SOSI'`.
4. `src/lib/parsing/normalizeFeature.js` converts GeoJSON coordinate arrays to `{x, y, z}` and returns the same browser feature shape used by GMI. Point geometry stays point; `LineString` stays line; a polygon outer ring is intentionally represented as a line.
5. The resulting dataset follows the same store, map, table, inspector, analysis, and 3D paths as GMI.

The paths diverge while attributes are constructed. GMI field names become top-level browser attributes. SOSI keeps values under source groups such as `EGS_LEDNING`, and the only current semantic projection is `S_FCODE` inference. `normalizeFeature` is common shape normalization for geometry and feature structure; it does not normalize attributes. There is no common attribute normalization layer, parser-specific SOSI field table, or reusable browser alias helper. The legacy validator has aliases, and Validator V2 has a GMI-only adapter, but neither transforms stored browser objects.

For the supplied line, the useful data is already in the parsed SOSI object. The popup and table see `EGS_LEDNING` as one object-valued top-level field; scalar rendering turns that object into `[object Object]`. They cannot discover `EGS_LEDNING.MATERIAL`, `DIMENSJON`, and peers as columns or popup rows.

## Canonical browser field model

The exact browser properties are the literal `sourceProperty`/`directGmiSourceKey` names in `src/lib/validation-v2/registry/fields.js`, corroborated by GMI fixtures and direct consumers. Geometry aliases such as `Tema_led`, `Tema_punkt`, `InnvendigUtvendig_led`, and `InnvendigUtvendig_punkt` are legacy rule metadata keys; stored GMI objects use the unsuffixed properties.

| Browser property | GMI construction | Current non-validator consumers |
|---|---|---|
| `Tema` / `S_FCODE` | Direct GMI headers; `S_FCODE` is accepted identity fallback | Map color/style/filter/legend, Sidebar counts, popup code, incline classification, 3D color/type |
| `Type` | Direct point header | Sidebar type distribution, point 3D metadata, generic popup/table/inspector |
| `Material` | Direct line header | Incline detail plus generic popup/table/inspector |
| `Dimensjon` | Direct line header | Map line weight, incline thresholds/detail, 3D pipe radius; generic displays |
| `VertikalDimensjon` | Direct line header | Generic displays; point top/lid sizing uses it only as a late fallback |
| `Rørform` | Direct line header | Generic displays |
| `InnvendigUtvendig` | Direct point/line header | Generic displays |
| `Nett_type` | Direct line header | Incline detail plus generic displays |
| `Anleggsår` | Direct point/line header | Generic displays |
| `Lengde` | Direct GMI header; registry and field metadata scope it to points and describe millimetres | Generic displays; line profile length is computed from coordinates, not this property |
| `Byggemetode` | Direct point header | Generic displays |
| `Tykkelse` | Direct point/line header | Generic displays |
| `SDR`, `Ringstivhet`, `Trykklasse` | Direct line headers | Generic displays |
| `Målemetode`, `Nøyaktighet`, `Synbarhet`, `MålemetodeHøyde`, `NøyaktighetHøyde` | Direct point/line headers | Generic displays |
| `Stedfestingsforhold`, `Stedfestingsårsak` | Direct point/line headers | Generic displays; contextual table gives `Stedfestingsårsak` priority |
| `GUID` / `guid` | GMI parses `GUID` to feature-level `guid`; it is not a normal GMI attribute | `feature.guid` is carried into outlier results; map/table IDs remain layer/index based |
| Elevation | Z on each `coordinates[]` entry | Z validation, incline/profile, terrain comparison, and 3D geometry |

Other established canonical properties in the same registry include `Høydereferanse`, `Datafangstdato`, `Innmålt_av`, `Eier`, `Vertikalnivå`, `MaksAvvikHorisontalt`, `MaksAvvikVertikalt`, `Bredde`, `Kumform`, `AnleggsID`, `Utvendig_høyde`, `Avst_BunnInnvUnderUtv`, `Adkomst`, `Kjegle`, `Merknad`, and `Saksnummer`. They should only be projected from SOSI when a source path with verified equivalent meaning exists.

## SOSI attribute groups already parsed

The parser does not enumerate SOSI groups. `...props` retains every group that `sosijs` emits, including nested objects, without cleanup. The four exports establish this inventory:

| Container | Observed scope | Important observed children/current result |
|---|---|---|
| `EGS_LEDNING` | All 999 lines | Stable identity/core paths plus sparse technical fields: `L_TEMA`, `MATERIAL`, `DIMENSJON`, `INNVUTV_DIM`, `INNV_DIM_1`, `UTV_DIM_1`, `FORM`, `NETTYPE`, `ANLEGGSÅR`, `TYKK`, `RINGSTIVH`, `TRYKKLAS`, `VERT_NIVÅ`, owner/responsibility, IDs, dates, and numeric `lengde`. Fully preserved; no child is currently promoted. |
| `EGS_PUNKT` rich structure shape | 514 physical database objects with quality | `P_TEMA`, `TYPE`, `KUMBREDDE`, `KUMFORM`, `INNVUTV_DIM`, `ANLEGGSÅR`, `BYGGEMET`, `TYKK`, `KJEGLE`, `ADKOMST`, `PUNKTIDANL`, elevations/depth, functions, owner/responsibility, IDs, and dates. Child presence varies by object type. |
| `EGS_PUNKT` equipment shape | 93 valves/hydrants/indicators/other equipment | Primarily `P_TEMA`, `PSID` or `LSID`, `identifikasjon`; stengeventiler may also have `POSITION`. No standard `kvalitet`. |
| `EGS_PUNKT` operations/symbol shape | 318 `VADriftsdata` plus four `VASymbol` | Operations records contain `BKODE`, `DBID`, `LSID`, `MDATO`, `UDATO`; symbols contain only `P_TEMA`. These are not full physical-object schemas. |
| `kvalitet` | Every line and 514 physical database points | Exactly five children: `målemetode`, `nøyaktighet`, `synbarhet`, `målemetodeHøyde`, `nøyaktighetHøyde`. Missing raw values are emitted as numeric `NaN`, not `null`. No child is currently promoted. |
| `GUID` | Every line and 607 physical/equipment points | Preserved as `attributes.GUID`; `feature.guid` remains `null` because SOSIParser does not pass it to `normalizeFeature`. Annotation/operations records lack GUID. |
| Standard top-level optional metadata | Both geometries | `datafangstdato`, `geodataprodusent`, `STEDF_FORH`, `STEDF_ÅRSA`; lines also have `HØYDEREFERANSE`. Dates are emitted as JavaScript `Date` objects. |
| `objekttypenavn` | All 2,101 parsed features | Preserved and used by current `inferSosiFcode()`. |
| `S_FCODE` | Synthesized by SOSIParser | Top-level and already consumed across the UI/tools, but currently ignores source `L_TEMA`/`P_TEMA`. |
| `datauttaksdato` | Every `EGS_*` feature | Parsed as a `Date`; preserved. It is export/extraction time and is not `Datafangstdato`. |
| geometry coordinates | All objects | Normalized to `{x,y,z}`; missing Z becomes `0` in `normalizeFeature`. |

No other `EGS_*` container occurs in these four exports. Line and point group layouts are demonstrably different, and point subshapes differ further by object class.

### Observed line structures

`EGS_LEDNING`, `L_TEMA`, `lengde`, `geodataeier`, `REGDATO`, top-level `GUID`, `datauttaksdato`, and standard `kvalitet` occur on every one of the 999 lines. Optional canonical candidates vary by record and export:

| Export (line count) | Material | Dimension | In/out | Shape | Network | Year | Thickness / ring / pressure | Height reference |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Løkkeåsveien–Dreggveien (566) | 483 | 449 | 479 | 436 | 564 | 482 | 8 / 0 / 10 | 18 |
| Wilhelmsenhallen (224) | 196 | 197 | 195 | 199 | 220 | 205 | 5 / 3 / 7 | 40 |
| Øvre Smidsrødvei (161) | 118 | 122 | 118 | 125 | 161 | 159 | 4 / 2 / 6 | 11 |
| TørkoppPS (48) | 43 | 42 | 42 | 45 | 46 | 44 | 4 / 9 / 3 | 0 |

The paths and casing are identical wherever values occur. Omission, rather than an alternate alias, is the observed variation. The exports also contain sparse `INNV_DIM_1`, `UTV_DIM_1`, `VERT_NIVÅ`, and maximum-deviation fields, plus database identity/edit metadata.

### Observed point / structure groups

The Point total includes text objects. Counts below show exact `EGS_PUNKT` child presence and demonstrate both sparse and export-specific coverage:

| Export (Point geometries) | EGS group | Theme | Type | Width | Shape | Year | Build method | Facility ID |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Løkkeåsveien–Dreggveien (518) | 454 | 284 | 69 | 30 | 25 | 189 | 24 | 0 |
| Wilhelmsenhallen (356) | 287 | 190 | 16 | 29 | 80 | 109 | 28 | 68 |
| Øvre Smidsrødvei (172) | 148 | 103 | 6 | 11 | 11 | 58 | 8 | 1 |
| TørkoppPS (56) | 40 | 34 | 1 | 7 | 11 | 17 | 7 | 6 |

The rich structure shape is used by kummer, sluk, separators, pump stations, outlets/inlets, basins, and related physical points. Valves, hydrants, indicators, and other equipment use a compact identity shape. `VADriftsdata`, `VAPåskrift`, and `VASymbol` must remain outside rich-structure assumptions even though they become GeoJSON Points.

## Mapping matrix

Status terms: **mapped** means available now at the browser canonical path; **proposed direct** means source meaning and code align in current evidence; **unresolved** means retain only until evidence establishes equivalence.

### Line objects

| Canonical field | GMI source/path | SOSI source/path | Applies to | Current SOSI status | Mapping class | Normalization / notes |
|---|---|---|---|---|---|---|
| `S_FCODE` | `attributes.S_FCODE` (or GMI `Tema` for identity consumers) | `EGS_LEDNING.L_TEMA`; current fallback from `objekttypenavn` | All 999 lines | Mapped only by name inference | **Confirmed direct with precedence** | Exact path/casing occurs on every line. Preserve string code. Existing non-empty top-level `S_FCODE` wins, then `L_TEMA`, then inference. Ten of 11 observed codes are canonical; retain exporter code `HK` without translation. Do not also synthesize `Tema`. |
| `Material` | `attributes.Material` | `EGS_LEDNING.MATERIAL` | 840 lines | Unmapped | **Confirmed direct** | Preserve string code. Eighteen of 19 observed codes are canonical; retain unknown `10P` as supplied and do not translate it. |
| `Dimensjon` | `attributes.Dimensjon` | `EGS_LEDNING.DIMENSJON` | 810 lines | Unmapped | **Confirmed direct** | Numeric string in millimetres -> number. In all 774 records with the applicable inner/outer detail, `DIMENSJON` equals that selected dimension numerically. |
| `InnvendigUtvendig` | `attributes.InnvendigUtvendig` | `EGS_LEDNING.INNVUTV_DIM` | 834 lines | Unmapped | **Confirmed direct** | Preserve `ID`/`OD`; both are canonical. |
| `VertikalDimensjon` | `attributes.VertikalDimensjon` | No observed equivalent | Line | Unmapped | **Resolved as no mapping** | `UTV_DIM_1` is explicitly the outer dimension and occurs only alongside `DIMENSJON`; it is not vertical dimension. All observed pipes with `FORM` use circular `S`, so no independent vertical dimension is present. |
| `Rørform` | `attributes.Rørform` | `EGS_LEDNING.FORM` | 805 lines | Unmapped | **Confirmed direct** | Preserve code; all observed values are canonical `S`. |
| `Nett_type` | `attributes.Nett_type` | `EGS_LEDNING.NETTYPE` | 991 lines | Unmapped | **Confirmed direct** | Preserve code; observed `F`, `H`, `O`, and `S` are canonical. |
| `Anleggsår` | `attributes.Anleggsår` | `EGS_LEDNING.ANLEGGSÅR` | 890 lines | Unmapped | **Confirmed direct** | Numeric string -> number. Retain values such as `0` rather than treating mapping as validation. |
| `Lengde` | `attributes.Lengde` | `EGS_LEDNING.lengde` | All 999 SOSI lines; GMI canonical field is point scoped | Unmapped | **Meaning resolved, target remains unresolved** | Source is numeric geometric line length in metres: all 999 values match XY polyline length within 0.01 m. GMI `Lengde` means point-object length in millimetres, so do not promote this value under that canonical name without a product contract. Profile already computes metres. |
| `Tykkelse` | `attributes.Tykkelse` | `EGS_LEDNING.TYKK` | 21 lines | Unmapped | **Confirmed export alias** | Decimal numeric string in millimetres -> number; matches canonical line wall thickness semantics and units. |
| `SDR` | `attributes.SDR` | No observed source path | Line | Unmapped | Unresolved | No SDR child occurs in any export. Do not derive it from material/dimensions/thickness. |
| `Ringstivhet` | `attributes.Ringstivhet` | `EGS_LEDNING.RINGSTIVH` | 14 lines | Unmapped | **Confirmed export alias** | Preserve string; all observed values are canonical `SN8`. |
| `Trykklasse` | `attributes.Trykklasse` | `EGS_LEDNING.TRYKKLAS` | 26 lines | Unmapped | **Confirmed field alias; mixed value vocabulary** | Preserve string. `PN10`, `PN12.5`, and `PN16` are canonical; `KL25` is not in the current table and must remain untranslated. |
| `Høydereferanse` | `attributes.Høydereferanse` | top-level `HØYDEREFERANSE` | 69 lines | Unmapped | **Confirmed case alias** | Preserve string. `BUNN_INNVENDIG`, `TOPP_UTVENDIG`, and `UKJENT` are canonical; retain `BUNN_RENNE` and `UGYLDIG_VERDI` unchanged. This field affects 3D Z offset. |
| `Eier` | `attributes.Eier` | Candidate `EGS_LEDNING.geodataeier`; separate `DRIFTSANSV` | All 999 lines | Unmapped | **Semantically unresolved** | Values (`K`, `P`, `P1`) fit the canonical owner table, but geodata ownership is not proven identical to infrastructure ownership. `DRIFTSANSV` is operational responsibility and disagrees on one line. Keep both source-only pending schema confirmation. |
| `Datafangstdato` | `attributes.Datafangstdato` | top-level `datafangstdato` | 23 lines | Unmapped | **Confirmed case alias** | `sosijs` returns a `Date`; canonical copy should be ISO string to match GMI/browser scalar shape. Do not use `REGDATO`, `ENDREDATO`, or `datauttaksdato`. |
| `Stedfestingsforhold` | Exact GMI property | top-level `STEDF_FORH` | 9 lines | Unmapped | **Confirmed explicit alias** | Preserve code; observed `ÅPEN_GRØ` is canonical. |
| `Stedfestingsårsak` | Exact GMI property | top-level `STEDF_ÅRSA` | 9 lines | Unmapped | **Confirmed explicit alias** | Preserve code; observed `NYTT` is canonical. |
| `Vertikalnivå` | Exact GMI property | `EGS_LEDNING.VERT_NIVÅ` | 8 lines | Unmapped | **Confirmed export alias** | Preserve code; observed `UNDER_GRUNN` is canonical. |
| Feature `guid` | GMI `line.guid` from a `GUID` record | top-level `properties.GUID` | All 999 lines | Only `attributes.GUID` is present | **Confirmed structural mapping** | Pass primitive `GUID` to `normalizeFeature({ guid })` while retaining `attributes.GUID`. This improves stable identity available to analysis without changing map/index identity. |
| Elevations | `line.coordinates[].z` | GeoJSON coordinate Z | Line | Mapped | Existing direct structure | No attribute projection needed. Confirm whether SOSI missing Z should remain `0`; current normalization makes it indistinguishable from an explicit zero. |

Other `EGS_LEDNING` children remain source-only. `SID` is not an approved GMI alias for `AnleggsID`; `REGDATO`/`ENDREDATO` are compact database timestamps for different events; `datauttaksdato` is extraction time; `DRIFTSANSV` is distinct from ownership; `INNV_DIM_1`/`UTV_DIM_1` preserve measured inner/outer details behind selected `DIMENSJON`; status, node IDs, zone, registration signatures, and edit metadata have no established browser canonical target. `MAKS3DAVK_HORIS` and `MAKS3DAVK_VERT` look related to canonical maximum deviations but occur only twice each and have no verified unit, so remain unresolved.

### Point / structure objects

| Canonical field | GMI source/path | SOSI source/path | Applies to | Current SOSI status | Mapping class | Normalization / notes |
|---|---|---|---|---|---|---|
| `S_FCODE` | `attributes.S_FCODE` / identity fallback | `EGS_PUNKT.P_TEMA`; current `objekttypenavn` inference | 611 Point geometries | Mapped only by inference | **Confirmed direct with precedence** | Existing non-empty top-level value wins, then `P_TEMA`, then inference. `P_TEMA` covers 607 GUID-bearing domain/equipment points plus four symbols. Preserve all strings, including 13 exporter codes outside the current canonical point table; never translate them by object name. |
| `Type` | `attributes.Type` | `EGS_PUNKT.TYPE` | 92 physical points | Unmapped | **Confirmed direct** | Preserve string. Nine observed codes are canonical; `UTS_LOD` and `UTS_LTV` remain untranslated exporter values. `objekttypenavn` is not a fallback for `Type`. |
| `Bredde` | `attributes.Bredde` | `EGS_PUNKT.KUMBREDDE` | 77 structures | Unmapped | **Confirmed exporter mapping** | Numeric millimetre string -> number. In all 12 objects with `INNVUTV_DIM` plus an applicable inner/outer width, `KUMBREDDE` equals the selected detail. Do not use point `DIMENSJON` as a fallback. |
| `Kumform` | `attributes.Kumform` | `EGS_PUNKT.KUMFORM` | 127 structures | Unmapped | **Confirmed direct** | Preserve `F`/`R`; both are canonical. Do not use line `FORM`. |
| `InnvendigUtvendig` | `attributes.InnvendigUtvendig` | `EGS_PUNKT.INNVUTV_DIM` | 12 structures | Unmapped | **Confirmed direct** | Preserve canonical `ID`/`OD`. |
| `Anleggsår` | `attributes.Anleggsår` | `EGS_PUNKT.ANLEGGSÅR` | 373 physical points | Unmapped | **Confirmed direct** | Numeric string -> number; retain anomalous years (for example `1190`) as data, not validation findings. |
| `Lengde` | `attributes.Lengde` | No observed equivalent | Point | Unmapped | Unresolved | Neither `DYBDE_BER` nor `TOPPLOKKH - HBUNN` is the canonical object length in millimetres. Do not derive it. |
| `Byggemetode` | Exact GMI property | `EGS_PUNKT.BYGGEMET` | 67 structures | Unmapped | **Confirmed export alias** | Preserve code; observed `B`, `E`, `G`, `V`, and `W` are canonical. |
| `Tykkelse` | Exact GMI property | `EGS_PUNKT.TYKK` | One kum | Unmapped | **Confirmed export alias, sparse** | `100.00` -> numeric `100` mm. Keep geometry-specific mapping separate from line `TYKK`. |
| `Avst_BunnInnvUnderUtv` | Exact GMI property | No observed equivalent | Point | Unmapped | Unresolved | `DYBDE_BER` is calculated depth and does not establish this inside-bottom to outside-underside distance. |
| `Kjegle` | Exact GMI property | `EGS_PUNKT.KJEGLE` | 37 structures | Unmapped | **Confirmed direct** | Preserve canonical `R`, `S`, and `U`. |
| `Adkomst` | Exact GMI property | `EGS_PUNKT.ADKOMST` | 12 structures | Unmapped | **Confirmed direct** | Preserve canonical `DO`, `NG`, `ST`, and `UTENST`. |
| `AnleggsID` | Exact GMI property | `EGS_PUNKT.PUNKTIDANL` | 75 points | Unmapped | **Confirmed primary exporter path** | Preserve string. Do not fall back to `SID`: 74 of 75 co-present values differ, and `SID` is the database row identity. |
| `Eier` | Exact GMI property | Candidate `EGS_PUNKT.geodataeier`; separate `DRIFTSANSV` | 514 physical database points | Unmapped | **Semantically unresolved** | Codes fit the canonical table, but geodata ownership is not proven to be object ownership. `DRIFTSANSV` occurs on only 63 and is a different concept. Keep both source-only pending schema confirmation. |
| `Datafangstdato` | Exact GMI property | top-level `datafangstdato` | 116 Point geometries | Unmapped | **Confirmed case alias** | Convert parsed `Date` to ISO string in the canonical copy. |
| `Stedfestingsforhold` | Exact GMI property | top-level `STEDF_FORH` | 15 points | Unmapped | **Confirmed explicit alias** | All four observed codes are canonical. |
| `Stedfestingsårsak` | Exact GMI property | top-level `STEDF_ÅRSA` | 18 points | Unmapped | **Confirmed explicit alias** | Both observed codes are canonical. |
| `Vertikalnivå` | Exact GMI property | `EGS_PUNKT.VERT_NIVÅ` | 7 points | Unmapped | **Confirmed export alias** | Preserve source code. |
| Feature `guid` | GMI `point.guid` | top-level `properties.GUID` | 607 physical/equipment points | Only attribute if present | **Confirmed structural mapping** | Same dual preservation as lines. Do not invent GUIDs for annotation/operations records. |
| Elevation | `point.coordinates[0].z` | GeoJSON point Z | Point | Mapped | Existing direct structure | Used by Z checks and 3D. |

Point mappings must be presence-based. `VAPåskrift`, `VADriftsdata`, and `VASymbol` are Point geometries in GeoJSON but do not share the physical-object schema. `TOPPLOKKH` and `HBUNN` are elevations, `DYBDE_BER` is calculated depth, `UTV_BREDDE_1`/`INNV_BREDDE_1` are detail dimensions, and `MÅLEMETODE_TOPPZ`/`NØYAKTIGHET_TOPPZ` describe top elevation. None is a fallback for the similarly named canonical size/quality fields without an explicit semantic rule.

### Quality / metadata

| Canonical field | GMI source/path | SOSI source/path | Applies to | Current SOSI status | Mapping class | Normalization / notes |
|---|---|---|---|---|---|---|
| `Målemetode` | `attributes.Målemetode` | `kvalitet.målemetode` | All lines; 514 physical points | Unmapped | **Confirmed direct** | Finite number stays number; `NaN` -> canonical `null`. Observed finite method codes share the canonical numeric vocabulary. |
| `Nøyaktighet` | `attributes.Nøyaktighet` | `kvalitet.nøyaktighet` | Same quality-bearing objects | Unmapped | **Confirmed direct** | Finite number stays number; `NaN` -> canonical `null`. Do not change units or unusual values. |
| `Synbarhet` | `attributes.Synbarhet` | `kvalitet.synbarhet` | Same quality-bearing objects | Unmapped | **Confirmed direct field identity** | Finite number stays number; `NaN` -> canonical `null`. Preserve the numeric representation. |
| `MålemetodeHøyde` | `attributes.MålemetodeHøyde` | `kvalitet.målemetodeHøyde` | Same quality-bearing objects | Unmapped | **Confirmed direct** | Finite number stays number; `NaN` -> canonical `null`. Keep distinct from XY method. |
| `NøyaktighetHøyde` | `attributes.NøyaktighetHøyde` | `kvalitet.nøyaktighetHøyde` | Same quality-bearing objects | Unmapped | **Confirmed direct** | Finite number stays number; `NaN` -> canonical `null`. Keep distinct from horizontal accuracy. |
| `Stedfestingsforhold` | Exact GMI property | top-level `STEDF_FORH` | Sparse both | Unmapped | **Confirmed explicit alias** | This is outside `kvalitet`; do not infer it when absent. |
| `Stedfestingsårsak` | Exact GMI property | top-level `STEDF_ÅRSA` | Sparse both | Unmapped | **Confirmed explicit alias** | This is outside `kvalitet`; do not infer it when absent. |
| `Datafangstdato` | Exact GMI property | top-level `datafangstdato` | Sparse both | Unmapped | **Confirmed case alias** | Convert valid `Date` to ISO string. `datauttaksdato`, `REGDATO`, and `ENDREDATO` remain separate source events. |
| `GUID` / feature `guid` | GMI feature structural field | top-level `GUID` | All lines; 607 points | Attribute only | **Confirmed direct structural mapping** | Retain both original attribute and structural copy. Do not change index-based UI IDs in this slice. |
| `SOURCE_FORMAT` | GMI dataset `format`, no normal GMI attribute requirement | Parser-added top-level attribute | Both | Mapped | Existing direct | Keep `SOSI`; consumers and debugging rely on provenance. |

## Aliases / fallback paths

The exporter profile needs explicit path aliases, but no generic recursive lookup and no observed casing variants within a path.

| Canonical target | Primary SOSI path | Supported fallback | Scope / normalization |
|---|---|---|---|
| `S_FCODE` | Existing non-empty top-level `S_FCODE` | Line `EGS_LEDNING.L_TEMA`; point `EGS_PUNKT.P_TEMA`; finally current object-name inference | Geometry-specific string precedence |
| `Type` | Existing non-empty top-level `Type` | `EGS_PUNKT.TYPE` | Point only; string; no object-name fallback |
| `Material`, `Dimensjon`, `InnvendigUtvendig`, `Rørform`, `Nett_type`, `Anleggsår` | Existing same-name canonical scalar | Exact `EGS_LEDNING` child documented above | Line only; declared string/number policy |
| `Bredde`, `Kumform`, `Byggemetode`, `Tykkelse`, `Kjegle`, `Adkomst`, `AnleggsID` | Existing same-name canonical scalar | Exact `EGS_PUNKT` child documented above | Point only; no dimension/ID cross-fallbacks |
| `Tykkelse`, `Ringstivhet`, `Trykklasse`, `Vertikalnivå` | Existing same-name canonical scalar | Exact geometry-specific `EGS_*` alias | Keep line/point declarations separate even when the child name matches |
| Quality fields | Existing non-empty same-name canonical scalar | Exact `kvalitet` child | Both; finite numbers only, `NaN -> null` |
| `Høydereferanse`, `Datafangstdato`, positioning fields | Existing non-empty same-name canonical scalar | Exact top-level uppercase/lowercase alias | Both where present; ISO conversion only for date |
| Feature `guid` | Existing non-empty feature `guid` | Primitive top-level `GUID` | Both; retain `attributes.GUID` |

Do not add fallbacks from `UTV_DIM_1`/`INNV_DIM_1` to `Dimensjon`, from `KUMBREDDE` detail fields to missing `Bredde`, from `SID` to `AnleggsID`, from either owner/responsibility candidate to `Eier` before semantic approval, from database dates to `Datafangstdato`, or from point top-Z quality fields to general quality.

## Precedence and conflicts

The original four-step proposal remains valid with geometry-specific source paths:

1. A non-empty existing canonical top-level value wins. Treat `undefined`, `null`, and `''` as fillable; treat `0` and `false` as supplied.
2. Otherwise use the verified exact nested/top-level alias for that geometry.
3. For `S_FCODE` only, use current object-name inference as the final fallback after `L_TEMA`/`P_TEMA`.
4. Preserve every original property and nested group unchanged.

The real exports reveal three conflicts that need explicit handling:

- `geodataeier` and `DRIFTSANSV` disagree on one line. Their meanings also differ by name, so neither receives canonical precedence until `geodataeier -> Eier` is approved from schema evidence.
- `PUNKTIDANL` and `SID` differ on 74 of 75 co-present points. Use only `PUNKTIDANL` for `AnleggsID`; never use `SID` as silent fallback.
- Five `UTV_DIM_1` values differ from `DIMENSJON` because the record declares `INNVUTV_DIM = ID`; in every case `DIMENSJON` equals `INNV_DIM_1`. This confirms `DIMENSJON` as the selected canonical dimension and rules out unconditional outer-dimension precedence.

If a future object supplies conflicting canonical top-level and verified alias values, keep the top-level canonical value, preserve the nested source, and optionally return non-enumerable/debug conflict information from the adapter or a parser warning. Do not add user-facing provenance fields to `attributes` in Phase 1.

## Code/value translations

### Direct mappings

The observed field aliases map into canonical code fields without translating the values. Controlled tables confirm these shared vocabularies:

| Source field | Canonical target | Observed code result |
|---|---|---|
| `L_TEMA` | `S_FCODE` | AF/AFO/DR/OV/OVO/OVP/SP/SPO/SPP/VL pass through; exporter code HK is retained as unknown |
| `P_TEMA` | `S_FCODE` | Known point Tema codes pass through; 13 legacy/exporter codes outside the current table remain unchanged |
| `MATERIAL` | `Material` | 18 known codes pass through; `10P` remains unchanged and unresolved |
| `INNVUTV_DIM` | `InnvendigUtvendig` | `ID` and `OD` are canonical on both geometries |
| `FORM` | `Rørform` | Observed `S` is canonical circular |
| `NETTYPE` | `Nett_type` | Observed `F`, `H`, `O`, `S` are canonical |
| `KUMFORM`, `BYGGEMET`, `KJEGLE`, `ADKOMST` | Exact canonical code field | All observed values occur in the corresponding canonical tables |
| `RINGSTIVH` | `Ringstivhet` | Observed `SN8` is canonical |
| `STEDF_FORH`, `STEDF_ÅRSA` | Exact canonical positioning field | All observed codes occur in the corresponding canonical tables |

The implementation must not replace codes with display meanings. Existing browser fields and tools expect the code itself.

### Explicit translations required

No explicit value translation table is justified by these exports. `TRYKKLAS` includes `KL25`, `HØYDEREFERANSE` includes `BUNN_RENNE` and `UGYLDIG_VERDI`, point `TYPE` includes `UTS_LOD`/`UTS_LTV`, and Tema/Material include exporter codes absent from current controlled tables. Pass those values through for faithful display and mark them unknown; do not guess canonical replacements. Keep an explicit per-field translator hook in the declarative mapping shape so a future authoritative crosswalk can be added without scattered logic.

### Newly resolved mappings

Real exports resolve line `TYKK -> Tykkelse`, `RINGSTIVH -> Ringstivhet`, `TRYKKLAS -> Trykklasse`, top-level `HØYDEREFERANSE -> Høydereferanse`, lower-case `datafangstdato -> Datafangstdato`, the two positioning aliases, and `VERT_NIVÅ -> Vertikalnivå`. They also resolve the point paths for `P_TEMA`, `TYPE`, `KUMBREDDE`, `KUMFORM`, `INNVUTV_DIM`, `ANLEGGSÅR`, `BYGGEMET`, `TYKK`, `KJEGLE`, `ADKOMST`, `PUNKTIDANL`, positioning fields, quality, and GUID. `geodataeier` is now an evidenced candidate but remains semantically unresolved.

The dimension evidence resolves `UTV_DIM_1` negatively: it is neither `VertikalDimensjon` nor the preferred canonical `Dimensjon`. The selected `DIMENSJON` already reflects `INNV_DIM_1` for ID records and `UTV_DIM_1` for OD records.

### Unresolved mappings

- `EGS_LEDNING.lengde -> Lengde`: source meaning and metre unit are now verified, but the target conflicts with GMI's point-object millimetre field.
- `VertikalDimensjon`: no equivalent field occurs; `UTV_DIM_1` is explicitly not it.
- `SDR`: no candidate source path occurs.
- Point `Lengde`, `Avst_BunnInnvUnderUtv`, and `Utvendig_høyde`: no direct equivalents occur; do not derive them from depth or elevations.
- `SID -> AnleggsID`: values demonstrably differ from `PUNKTIDANL`; do not use as fallback.
- `DRIFTSANSV -> Eier`: operational responsibility is semantically distinct and has one observed conflict with `geodataeier`.
- `geodataeier -> Eier`: code values are compatible, but geodata ownership versus infrastructure ownership requires exporter/schema confirmation.
- `REGDATO`, `ENDREDATO`, `MDATO`, `UDATO`, or `datauttaksdato -> Datafangstdato`: event semantics differ.
- `MAKS3DAVK_HORIS`/`MAKS3DAVK_VERT`: names suggest canonical maximum deviations, but the source unit is not established.
- EGS point `MÅLEMETODE_TOPPZ`/`NØYAKTIGHET_TOPPZ`: describe top elevation and are not fallbacks for the general quality group.
- Unknown codes (`HK`, `10P`, `KL25`, `BUNN_RENNE`, point exporter Tema/Type codes) have no approved translations.

## Type normalization

The browser model does not have a formal runtime schema, but GMI parser behavior provides the compatibility target:

- empty GMI field -> `null`;
- integer lexeme -> JavaScript number;
- decimal lexeme -> JavaScript number;
- boolean lexeme -> boolean;
- other text and codes -> string;
- coordinates -> numeric `{x,y,z}`;
- GMI dates remain strings because they do not match numeric-only parsing.

Real exporter forms require field-declared normalization:

- `DIMENSJON`, `KUMBREDDE`, `ANLEGGSÅR`, and `TYKK` are numeric strings; canonical copies become numbers.
- `UTV_DIM_1`, `INNV_DIM_1`, `UTV_BREDDE_1`, and `INNV_BREDDE_1` are decimal strings retained only in their source groups.
- Tema, material, type, shape, ownership, network, pressure, ring-stiffness, construction, access, and other code values remain strings.
- `datafangstdato` and `datauttaksdato` are JavaScript `Date` objects from `sosijs`; mapped `Datafangstdato` becomes a valid ISO string. Retained source dates remain untouched.
- Missing members are usually omitted. Missing values inside an emitted `kvalitet` group are numeric `NaN`; canonical quality copies convert non-finite numbers to `null`.
- `lengde` is already a number in metres but remains source-only under the current decision.

Do not recursively normalize the retained `EGS_*` or `kvalitet` objects. This preserves exact source strings such as `"32.00"`, compact database dates such as `YYYYMMDDhhmmss`, and `NaN` evidence while providing GMI-like canonical scalars.

The mapping declaration should carry an explicit normalization kind (`number`, `finiteNumberOrNull`, `code`, `dateToIso`, `identity`) rather than call a universal coercer. For SDR, if a future path appears, GMI coercion currently loses lexical `.0`; test that decision before mapping.

Do not convert ISO dates to `Date` objects. Do not replace `null` with defaults. Do not flatten unknown nested objects.

## Source-data preservation

The intended additive result fits the current architecture:

```text
attributes = {
  ...originalSosiProperties,
  S_FCODE: resolvedCode,
  Material: mappedScalar,
  Dimensjon: mappedScalar,
  Anleggsår: mappedScalar,
  ...verified canonical scalars,
  EGS_LEDNING or EGS_PUNKT: originalNestedObject,
  kvalitet: originalNestedObject,
  GUID: originalGuid,
  SOURCE_FORMAT: 'SOSI'
}
feature.guid = originalGuid
```

The mapper should construct a new top-level attributes object and must not mutate or delete `props`, `EGS_LEDNING`, `EGS_PUNKT`, `kvalitet`, unknown fields, or unknown `EGS_*` groups. Original strings such as `"32.00"`, parsed `Date` objects, and quality `NaN` values remain available at their source paths even when canonical numeric/string/null copies are created. Source preservation is needed for inspection, future mapping work, troubleshooting, and conflict evidence. If conflict provenance is useful during development, return it separately or emit a parser warning; do not add enumerable user-facing metadata to `attributes`.

## Downstream features that gain data automatically

| Mapping | Existing automatic benefit supported by code |
|---|---|
| All promoted scalar fields | Map popup lists them because it enumerates GeoJSON properties; LayerDataTable discovers them as columns; Sidebar field inventory/counts includes them; DataDisplayModal/object inspector JSON contains both canonical and source values |
| `S_FCODE` from `L_TEMA`/`P_TEMA` | More source-backed map styling, legend/category filtering, Sidebar theme counts, 3D colors/types, Z labels, and incline classification; current name inference remains fallback |
| `Dimensjon` | Map line weight, incline minimum-threshold calculation/detail, and 3D pipe radius use the real value instead of aliases/default 200 mm |
| Point `Bredde` | 3D cylinders/lids use observed structure width instead of the default; generic displays also gain it |
| `Material` | Incline detail displays the canonical value; popup/table/inspectors gain it |
| `Nett_type` | Incline detail rows gain it; it does not currently determine gravity classification in `incline.js` despite the comment |
| `Høydereferanse` | 3D pipe vertical offset uses the supplied reference for mapped lines; unknown codes retain the existing zero-offset fallback |
| `GUID -> feature.guid` | Outlier result records receive stable source identity; map/table object IDs remain index-based |
| Quality, year, shape, inside/outside | Popup/table/inspector/field inventory only in current non-validator code |
| Coordinate Z (already mapped) | Z validation, incline/profile plots, terrain/cover work, and 3D already benefit independently of attribute promotion |

`Rørform`, `Anleggsår`, `InnvendigUtvendig`, `Type`, point construction fields, positioning metadata, and the quality fields otherwise gain generic inspection/comparison only. No label/tooltip code beyond popup and analysis detail was found consuming the other proposed fields.

## Validator boundary

Validator V2 remains GMI-only. `src/lib/validation-v2/uiIntegration.js` requires `layer.data.format === 'GMI'` and creates runner input with `sourceFormat: 'gmi'`; lower contracts also enforce that source format. The SOSI mapping must not loosen `isGmiLayer`, call the GMI adapter for SOSI, create Validator inputs for SOSI, or treat promoted fields as validation-authoritative.

Canonical browser-field parity is for display, inspection, comparison, analysis, map/3D behavior, and other shared downstream tools. Any future SOSI validation requires a separate project decision, source authority, adapter, rules, and tests.

## Recommended implementation architecture

### Option A — assignments inside `SOSIParser.parse()`

This has the smallest file count, but mixes decoding, geometry dispatch, identity inference, normalization, precedence, and dozens of field rules in the feature loop. It will become difficult to test without executing parser setup and will encourage line/point rules to blur together.

### Option B — SOSI post-parse normalization layer

Add a small pure SOSI attribute adapter, for example `src/lib/parsing/sosiCanonicalAttributes.js`, called by `SOSIParser` after `sosijs` returns GeoJSON properties and before `normalizeFeature`. It should accept `{ geometryType, properties }` and return `{ attributes, guid, mappingConflicts? }`. Keep declarative line, point, and quality mapping tables separate; share only safe primitives for nested lookup, presence checks, precedence, and typed scalar normalization.

This is the recommended lowest-risk owner. It matches the actual divergence point, keeps SOSI knowledge out of common consumers, preserves GMI behavior exactly, and is easy to unit test with plain property objects. `SOSIParser` remains responsible for calling the adapter and `normalizeFeature` remains responsible only for geometry/browser feature shape.

### Option C — shared canonical feature-normalization layer with format adapters

A shared adapter boundary can be a good later architecture if KOF or another format needs broad parity. It is unnecessary for this slice: GMI already emits the desired property names, KOF has a deliberately limited model, and moving GMI through a new layer increases regression area without solving the current nesting problem. Do not route GMI through a new canonicalizer as part of this work.

Use a mapping object rather than scattered assignments. A suitable shape is `{ target, sourcePath, geometry, objectTypes?, normalization, translate }`. Line and point maps must remain distinct even where target names match. Quality and standard top-level metadata maps can be shared across both geometries because their observed shapes are common. Apply mappings only for present paths; `finiteNumberOrNull` is the deliberate exception that turns present `NaN` quality values into canonical `null`. Do not create every possible canonical key on every object.

## Phased implementation plan

### Phase 1 — verified line and common metadata parity

1. Add the pure SOSI attribute adapter and explicit precedence rules.
2. Map the high-coverage line core: `L_TEMA`, `MATERIAL`, `DIMENSJON`, `INNVUTV_DIM`, `FORM`, `NETTYPE`, and `ANLEGGSÅR`.
3. Include evidenced sparse line aliases in the same declarative table: `TYKK`, `RINGSTIVH`, `TRYKKLAS`, `VERT_NIVÅ`, top-level `HØYDEREFERANSE`, `STEDF_FORH`, `STEDF_ÅRSA`, and lower-case `datafangstdato`. Keep both ownership fields source-only.
4. Map the five standard `kvalitet` children for both geometries with `NaN -> null`; copy primitive top-level `GUID` to feature `guid` while preserving `attributes.GUID`.
5. Implement exact precedence and no-fallback decisions (`DIMENSJON` over axis details; owner over operational responsibility; capture date over database/extraction dates).
6. Keep `UTV_DIM_1`, `INNV_DIM_1`, line `lengde`, `SDR`, and unknown code translation source-only.
7. Add focused pure-adapter tests derived from observed structures and extend the injected-parser integration test. Manually verify popup/table, line weight, profile/incline detail, and 3D height reference after implementation.

### Phase 2 — point and structure parity from evidence

1. Add the now-evidenced `P_TEMA`, `TYPE`, `KUMBREDDE`, `KUMFORM`, `INNVUTV_DIM`, `ANLEGGSÅR`, `BYGGEMET`, `TYKK`, `KJEGLE`, `ADKOMST`, `PUNKTIDANL`, `VERT_NIVÅ`, positioning/date metadata, quality, and GUID mappings. Keep both ownership fields source-only.
2. Use minimal synthetic objects representing the observed rich structure, equipment, operations, symbol, and text shapes; do not copy municipality records wholesale.
3. Assert that operations/annotation Point geometries do not acquire unrelated physical-object canonical fields and that equipment without quality remains sparse.
4. Test `P_TEMA` precedence against name inference, sparse field presence, noncanonical value pass-through, and the deliberate absence of `SID`, depth/elevation, and dimension-detail fallbacks.
5. Verify point popup/table output and 3D width/type behavior.

### Phase 3 — additional export variants and unresolved fields

1. Sample other municipalities/exporters for different group names, casing, standard-only SOSI, and code-system differences; treat this four-file mapping as an explicit EGS export profile.
2. Resolve ownership semantics, canonical line-length presentation, missing point length/height/distance fields, SDR, maximum-deviation units, and unknown code translations only with authoritative evidence.
3. Add lightweight conflict diagnostics if real data begins supplying both canonical top-level and alias values.
4. Consider a shared format-adapter interface only if another parser now needs the same breadth of canonical projection.

## Test plan

Do not rely on UI snapshots alone. The main contract belongs at the pure mapper/parser boundary.

### Existing coverage to extend

- `tests/richerUsageTelemetryParserIntegration.test.mjs` already injects a fake `sosijs` parser and verifies SOSI CRS, coordinate order, normalized Z, map projection, and 3D reachability. Extend its SOSI stub or add a sibling parser test for full attributes.
- `tests/featurePopupContent.test.mjs` verifies scalar popup fields and actions. Add a compact assertion that canonical SOSI scalar fields render and nested source data remains harmless/preserved.
- `tests/objectTableInspection.test.mjs` verifies attribute-backed column access and table contracts. A mapper/parser assertion is sufficient for most columns; add a focused field-discovery test only if extraction is refactored into a testable helper.
- Validation V2 tests already enforce GMI contracts. Add a direct `createValidationV2Input` assertion for a `format: 'SOSI'` layer returning `null` if no existing test covers it.

### New regression cases

1. A line core object produces `S_FCODE`, `Material`, numeric `Dimensjon`, numeric `Anleggsår`, `Nett_type`, `Rørform`, and `InnvendigUtvendig`; missing optional children remain absent.
2. An ID dimension record selects `DIMENSJON` and does not project conflicting `UTV_DIM_1`; an OD record behaves likewise. Neither creates `VertikalDimensjon`, and numeric metre `lengde` does not create canonical `Lengde`.
3. Sparse aliases map independently: numeric `TYKK`, string `RINGSTIVH`/`TRYKKLAS`, `HØYDEREFERANSE`, `VERT_NIVÅ`, positioning fields, and valid capture date. Unknown codes pass through unchanged; owner candidates remain source-only.
4. `kvalitet` maps all five fields without mixing XY and height fields; finite numbers survive, while the actual `sosijs` missing form `NaN` becomes canonical `null`.
5. A rich kum-style point maps `P_TEMA`, `TYPE`, numeric `KUMBREDDE -> Bredde`, `KUMFORM`, `INNVUTV_DIM`, year, construction, wall thickness, cone, access, `PUNKTIDANL`, quality, and GUID where present; owner candidates remain nested only.
6. Equipment, `VADriftsdata`, `VASymbol`, and `VAPåskrift` synthetic shapes remain sparse. They do not gain `Type`, dimensions, owner, dates, quality, or GUID when paths are absent.
7. `PUNKTIDANL` maps to `AnleggsID`; differing `SID` never overrides or fills it. `geodataeier` and `DRIFTSANSV` both remain preserved and neither creates `Eier` pending semantic approval.
8. Existing non-empty canonical top-level values win; `L_TEMA`/`P_TEMA` beat name inference; inference remains the final `S_FCODE` fallback. Zero is treated as supplied, while undefined/null/empty canonical values can be filled.
9. Original `EGS_LEDNING`, `EGS_PUNKT`, `kvalitet`, dates, GUID, unknown children, and unknown groups remain referentially or deeply unchanged as the implementation contract chooses. Only additive top-level canonical scalars are created.
10. Numeric strings, decimal strings, numbers, `Date`, invalid date, `NaN`, `null`, empty string, and absent paths follow their declared normalization policies.
11. A representative GMI fixture parses to deep-equal feature attributes before and after the SOSI-only change.
12. Popup and LayerDataTable expose promoted scalars; DataDisplayModal retains original nested groups; a SOSI layer remains rejected by `createValidationV2Input`.

Manual verification after implementation should upload one sanitized real line file and one point/structure file, then inspect map popup, LayerDataTable, object inspector, theme filters, line weight, incline detail, profile, and 3D sizing. The audit task itself runs no tests or build.

## Risks / open questions

- The four ignored files provide strong evidence for one EGS municipality/database export profile, not universal SOSI. Other exporters may omit or rename these groups.
- No real SOSI fixture can be committed automatically; synthetic tests must preserve structure without reproducing municipality data. A later sanitized fixture needs an explicit data-handling decision.
- `sosijs` emits missing quality as `NaN` and standard dates as `Date`, while JSON serialization hides those distinctions (`NaN -> null`, Date -> ISO). Tests must operate on parser objects before JSON serialization.
- Current `inferSosiFcode` mappings are heuristic and broad. Source `L_TEMA`/`P_TEMA` improves identity, but unknown source codes must remain visible rather than coerced into a known category.
- The canonical property model is informal for browser consumers, while Validator V2's canonical semantic IDs are formal and GMI-specific. Reuse exact property spellings without reusing Validator authority.
- `Lengde` has a concrete semantic/unit collision: supplied SOSI line metres versus GMI point millimetres.
- Missing SOSI Z becomes numeric zero in `normalizeFeature`, which Z validation treats as missing. This behavior predates the mapping and should not be altered in this slice, but tests should preserve awareness of it.
- LayerDataTable discovers new fields from only the first 100 rows, then checks later rows only for already known keys. Sparse mappings first appearing after row 100 may remain undiscovered; this is an existing table limitation, not part of the parser mapping change.
- Popup/table scalar renderers stringify nested objects poorly. Promoted scalars solve access to known fields while preserving source groups; redesigning nested-object presentation is outside this plan.
- Copying GUID to `feature.guid` benefits analysis but does not make map/table identity stable because those paths currently use layer/index IDs. Changing identity strategy is separate work.
- Collision policy must distinguish absent, empty, explicit `null`, zero, false, and `NaN`. The recommended precedence above fills null/empty canonical slots, retains zero/false, and normalizes present non-finite quality to canonical null.

## Files likely to change

Phase 1 implementation should be limited to:

- `src/lib/parsing/sosiParser.js` — invoke the SOSI attribute adapter and pass mapped `guid` to `normalizeFeature`.
- `src/lib/parsing/sosiCanonicalAttributes.js` (new) — own mapping declarations, precedence, and narrow type normalization.
- `tests/richerUsageTelemetryParserIntegration.test.mjs` and/or a new focused `tests/sosiCanonicalAttributes.test.mjs` — parser/adapter regression coverage.
- `tests/featurePopupContent.test.mjs` — only if an explicit end-to-end popup assertion is desired.
- A sanitized SOSI fixture under `tests/fixtures` when licensing/privacy permits; until then, use injected GeoJSON properties.

No changes should be needed in MapInner, LayerDataTable, Sidebar, analysis, 3D, GMI parser, store, or Validator V2 for Phase 1. Their direct property access is the reason parser-side canonical projection has broad benefit.

## Final repository state

This audit intentionally changes only this report. It does not modify source or tests, run tests/build, switch branches, stage, commit, push, reset, restore, stash, or clean. The pre-existing runtime modification `data/usage/aggregates.json` is left untouched.

Final verification:

- `git diff --check`: exit 0; Git emitted only the existing line-ending warning for `data/usage/aggregates.json`.
- `git status --short`: ` M data/usage/aggregates.json` and `?? docs/agent-reports/20260929-sosi-canonical-field-mapping-plan.md`.
