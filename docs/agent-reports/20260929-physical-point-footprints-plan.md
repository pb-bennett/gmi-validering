# Physical point footprints plan — 2026-09-29

## Objective

Show a point structure's reported plan size at true map scale while retaining its normal screen sized marker as the interaction target. At close zoom, a pipe crossing the reported boundary should remain visible. This is an audit and implementation proposal; no source or test files were changed.

## Current point data model

- GMI `src/lib/parsing/gmiParser.js` reads point field names and `_FIELDVALUES` directly into `point.attributes`. It coerces plain integers and dot decimals to numbers; comma decimal text remains a string. Coordinates are stored as projected `{x,y,z}` values.
- SOSI `src/lib/parsing/sosiParser.js` uses `sosijs`, then `mapSosiCanonicalAttributes`, then `normalizeFeature`. The mapper preserves source properties and `EGS_PUNKT`, adds canonical aliases, and records `SOURCE_FORMAT: 'SOSI'`. Point identity comes from `EGS_PUNKT.P_TEMA` first, with object-name inference only as fallback. Annotation/operations records do not gain a fabricated theme from inference.
- Canonical SOSI point fields are `Eier`, `S_FCODE`, `Type`, `Bredde`, `Kumform`, `InnvendigUtvendig`, `Anleggsår`, `Byggemetode`, `Tykkelse`, `Kjegle`, `Adkomst`, `AnleggsID`, and `Vertikalnivå`, plus shared positional/quality metadata. `Bredde` maps only from `EGS_PUNKT.KUMBREDDE`; `Lengde` has no SOSI point mapping. GMI has a direct point `Lengde` field, but width alone cannot define a rectangle.
- The canonical field registry (`src/lib/validation-v2/registry/fields.js`) authorizes GMI `Bredde` for point width and explicitly disables `DIAMETER`, `DIMENSJON`, `DIM`, and line `Dimensjon` as fallback aliases. A legacy validation resolver mentions broader aliases; it should not drive new footprint logic.
- `src/components/MapInner.js` converts each source point with `projectCoordinateToWgs84` into GeoJSON `[longitude, latitude]`, copies its canonical attributes, and assigns `featureType`, per-layer ID, and hidden-field metadata. `pointToLayer` renders each as a custom SVG `L.marker`; the SVG size is in screen pixels. Symbol category/semantic colour comes from `S_FCODE`, not `Kumform`. The layer-colour ring is part of the marker SVG.

## GMI Bredde semantics

- `src/data/rules/points.json` describes `Bredde (diameter)` as construction width, specifically the dimension of a round kum. The field format is integer. The controlled source map (`docs/validation-v2/innmalingsinstruks-rule-source-map.json`, Appendix A pages 5 and 14) states integer **millimetres** and the exception when a polygon already defines the boundary. `Lengde` is a separate point field in millimetres.
- `InnvendigUtvendig` codes are `ID` (inside dimension) and `OD` (outside dimension), as listed in `points.json` and the source map. Point `Tykkelse` describes wall thickness; legacy metadata says exterior width can be derived by adding twice that thickness. No automatic exterior conversion should be inferred from width alone.
- The current point-field applicability policy (`src/lib/validation-v2/registry/pointFieldApplicability.js`) approves width for `KUM`, `SAN`, `SLS`, `SLU`, and several newer manhole-like themes; `LOK` is approved; `INR` and `PSP` are optional supported; `KRN` and `STR` are explicitly not applicable; `KMR` and `SUMP` are unresolved. This is project/domain validation policy, **not** proof that every approved value is the exterior plan extent. Source documentation's polygon exception differs from the legacy fixed theme subset. The new renderer needs its own conservative physical-geometry rule and should not copy the full validator applicability list.
- The exact meaning of a width on pump station, equipment, inlet, cover, or other less familiar themes needs domain review. Absence of a width is common and does not imply a default size.

## SOSI canonical mapping

Exact point paths in `src/lib/parsing/sosiCanonicalAttributes.js`: `P_TEMA → S_FCODE`, `TYPE → Type`, `KUMBREDDE → Bredde` (finite number), `KUMFORM → Kumform`, `INNVUTV_DIM → InnvendigUtvendig`, `ANLEGGSÅR → Anleggsår`, and `VERT_NIVÅ → Vertikalnivå`. The source group remains in attributes. The mapper does not validate theme eligibility, positivity, a maximum width, or shape codes; those are rendering decisions. A direct pre-existing canonical `Bredde` wins over the source alias. `tests/sosiCanonicalAttributes.test.mjs` covers a 1200 mm point, `R`, `ID`, zero year, source preservation, and nonphysical point handling.

The audit below covers only the four ignored `REF_FILES/SOSI-eksempler/*.sos` files and their exporter profile. It counts `.PUNKT` records and reads their exact `EGS_PUNKT` fields; it does not extrapolate to other SOSI exporters. The observed source fields map to the canonical keys above. No reference file was modified or copied.

## Real-data Bredde distribution

| Export | Points | With `KUMBREDDE` |
| --- | ---: | ---: |
| Løkkeåsveien-Dreggveien | 454 | 30 |
| Wilhelmsenhallen | 287 | 29 |
| Øvre-Smidsrødvei | 148 | 11 |
| TørkoppPS-eksisterende | 40 | 7 |
| **Total** | **929** | **77** |

Of the 77 width-bearing points, 72 have `P_TEMA=KUM` and source object name `Kum` (11 `TYPE=KSTA`, 3 `KDRE`, 58 without `TYPE`); 4 have `P_TEMA=SLS` and object name `Sluk`; 1 has `P_TEMA=UTS`, `TYPE=UTS_LTV`, object name `Utslipp`. The last is evidence that a width-bearing record is not automatically a manhole footprint. These are raw records, not deduplicated structures; exact overlap across exports has not been established.

Width values, in mm, are `110×4`, `315×15`, `400×1`, `425×28`, `450×1`, `650×5`, `1000×10`, `1200×4`, and `1600×9`. Minimum 110; lower middle/median 425; 90th percentile 1600; maximum 1600. All 77 are positive numeric values; no zero, negative, obvious placeholder, or extreme outlier appears. The 110 mm values are small for a chamber and deserve object-level review; the distribution itself does not justify silently rejecting them. Values align with millimetres, consistent with controlled GMI documentation. These exports contain no 2000+ mm example; a large manual scenario must come from another GMI fixture or a deliberately created local example.

Among width-bearing points, 65 also have `KUMFORM=R` (61 `KUM`, 3 `SLS`, 1 `UTS`), and 12 lack `KUMFORM` (11 `KUM`, 1 `SLS`). Only 12 width-bearing points have `INNVUTV_DIM`: 11 `OD` and 1 `ID`, all `KUM`; 65 have no inside/outside code. Across all 929 points, there are 126 `R` and one `F` shape; the `F` is a `FET` without width. These sparse attributes should not be filled from symbol shape.

## Applicable point categories

| Classification | Recommendation and evidence |
| --- | --- |
| Strong candidate | `KUM`, `SLS`, `SLU`, `SAN` when canonical `Bredde` is valid **and** `Kumform=R`. GMI construction-width description, validator applicability, and the 3D cylinder set agree. Reference exports directly confirm 61 `KUM` and 3 `SLS` records with both width and `R`; they contain no width-bearing `SLU` or `SAN`. |
| Possible, review first | `KUM`/`SLS` with width but missing `Kumform` (12 records); newer manhole themes in the applicability policy; `LOK` covers; `INR` and `PSP` optional widths; pump stations and rectangular forms. A circular boundary would imply an unreported shape. For `LOK`, a cover disc may overlap the host structure and represent a different physical object. Review semantics and overlaps before expanding. |
| Do not draw in Phase 1 | `UTS` despite one 315 mm, `KRN`, `STR`, valves, branches, other equipment, symbols, annotations, operations, unknown themes, and any point with missing or invalid width. `KRN`/`STR` have explicit non-applicability policy; the others lack proven structure-footprint semantics. |

This deliberately yields 64 eligible circles in the four exports, prior to visibility filters. If the product objective requires the 12 shape-missing records, seek a domain decision on an explicitly labelled approximate width radius rather than quietly assuming round form.

## Kumform / shape findings

The controlled code list in `src/data/rules/points.json` is `R` round; `FK` square; `FR` rectangular; `F` four-sided; `AN` other; `N` separate network kum; `X` special volume. `F` must not be translated as square. The exports only show `R` and one widthless `F`. Choose **C for Phase 1: draw only explicit `R`**, for the eligible structure themes. Phase 2 may use an axis-aligned square for `FK` after orientation conventions are checked; `FR` needs `Lengde` and orientation to make an honest polygon. A rectangle from width alone would misrepresent the data. Unknown shapes remain unrendered until a deliberate approximate display is agreed.

## InnvendigUtvendig implications

`ID` is internal and `OD` is external. A 1200 mm `ID` width gives a 0.6 m **reported inner radius**, not the physical outside wall boundary. Mark the visualization in the UI/help as **reported size**, not an exact external collision boundary. For Phase 1, draw the canonical reported dimension for `ID`, `OD`, or missing code, with a restrained style; do not derive external width without verified `Tykkelse` and units. The one explicit `ID` versus 11 `OD` among 77 widths does not justify a second ring yet. If precise external connection checks become a requirement, add a distinct `ID` treatment or derive the outer radius only where source fields and rules support it. Missing code must remain unknown.

## Map-scale geometry calculation

For verified round structure width in millimetres: `radiusMeters = Bredde / 2000`. Thus 1200 → 0.6 m, 2500 → 1.25 m. Read only the canonical `Bredde`, not nested SOSI source fields or broad dimension aliases. A pure helper should take canonical point properties, check theme/shape/number, and return radius metres or no footprint. This avoids parser duplication and gives GMI/SOSI parity.

## Rendering architecture

Use React Leaflet `Circle`/Leaflet `L.Circle` with `center={[latitude, longitude]}` and radius in **metres**. Official [Leaflet Circle documentation](https://leafletjs.com/reference) specifies metre radii; [`CircleMarker`](https://leafletjs.com/reference) uses pixels. React Leaflet [documents `Circle` pane and path options](https://react-leaflet.js.org/docs/api-components/). A generated GeoJSON polygon would require geodesic/projection work and shape approximation without a current need. Do not use `CircleMarker` for the footprint.

`MapInner` already projects source `x,y` to WGS84 GeoJSON `[longitude, latitude]` via `src/lib/map/coordinateProjection.js`. Convert that pair once to Leaflet `[latitude, longitude]`; never pass source UTM `x,y` directly as `center`. The source CRS converter supports the known UTM EPSG definitions and WGS84. Its fallback returns untransformed coordinates when the CRS is unknown or conversion fails, so the footprint should follow only a point with a valid geographic center; the same uncertainty affects the existing marker. `L.Circle` uses its map CRS to compute a metre radius; do not apply the source projected unit again or pass millimetres unchanged. The app's default Leaflet map uses Web Mercator; slight circular distortion follows Leaflet's documented approximation, especially away from the equator, but is appropriate for local Norwegian metre-scale context.

## Pane and draw order

Current layers: base map and WMS tiles in tile pane (default 200); layer highlight line casings in `layer-highlight-casing` z=390; semantic lines in overlay pane (default 400); normal `L.marker` SVGs in marker pane (default 600) with dataset offsets; tooltips in tooltip pane (default 650); map controls around z=1000. Analysis circles and polylines use marker or overlay pane. The custom Gemini WMS sets GridLayer z-index 450 **inside the tile pane**, so that value orders tiles within their pane and does not lift them above the vector overlay pane. `src/components/AuthenticatedWmsLayer.js` does not specify a custom pane.

Add one footprint pane at about z=395, with `pointerEvents: 'none'`. Order: basemap/WMS tiles → line casing → footprint → semantic lines → central markers/analysis → tooltips/controls. Place the footprint rendering inside the Data overlay's lifecycle so hiding Data also hides footprints. Keep the pane below z=400 regardless of dataset order, so crossing semantic pipes remain crisp.

## Visual design

Start with a thin 1 px outline at roughly 0.5 opacity and fill opacity around 0.06–0.10, then check against colour and grayscale basemaps at close zoom. Use a neutral dark gray outline/fill initially: semantic meaning is already carried by the central marker, and layer identity by its ring and line casing. A semantic tint can be evaluated if neutral boundaries disappear against particular basemaps, but never make the layer highlight colour the footprint colour. No glow or blur. A selected/hovered point can retain its existing marker treatment; avoid a stronger footprint until usability evidence warrants it. Do not encode `ID` or unknown outer extent as a precise survey boundary.

## Interaction model

Set `interactive: false` on every circle and `pointerEvents: 'none'` on the pane. Do not attach popup, compact tooltip, selection, or measurement handlers. The normal marker remains the only point target; hovering it works even with a large footprint underneath. Clicking uncovered footprint area should pass to the map/underlying actual feature, so measurement mode and map click handling continue normally. Existing `onEachFeature` popup and hover code remains on actual GeoJSON features only.

## Visibility and filtering

Build candidates from `geoJsonData.features` with `featureType='Point'`; that source already excludes hidden datasets and points without coordinates. Apply the **same effective visibility decision** as `pointToLayer`: global/per-layer theme and type hiding, field-value filters, field-validation override, `filteredFeatureIds`, and `outlierFeatureIds` when hide-outliers is active. The current point renderer returns an invisible dummy marker for excluded points rather than removing all GeoJSON features, so merely iterating `geoJsonData` is insufficient. Extract a shared pure `isPointVisible(feature, state)` selector or derive an explicit visible-point collection from the same predicates to prevent divergence. Also couple the footprint to `mapOverlayVisibility.data`; verify filter changes cause circles to recompute without depending only on the stable GeoJSON key.

## Layer ordering

`getLayerPaintOrder` reverses the UI's front-to-back `layerOrder`; later paths appear on top. Render eligible circles in that same back-to-front order **within the footprint pane**, so a foreground GMI footprint paints over a background SOSI footprint. Do not reorder per-feature by width or source format. The semantic lines remain above every circle because their pane is higher, and normal markers retain existing `getLayerMarkerZIndexOffset` ordering. Exact coincident GMI/SOSI point records can produce stacked circles; keep both consistently with dataset order for Phase 1, and assess deduplication only if real data demonstrates a problem. Dataset IDs plus point IDs should form stable React keys.

## Toggle / UX recommendation

Provide one global, independent `Vis objektstørrelse` toggle, default **off** for initial rollout so existing overview maps remain familiar. The use case is an intentional close inspection. Put it near the existing map measure control or within a compact map-display control; store a boolean in `ui` alongside `mapOverlayVisibility` or its own display setting, and preserve it with the same workspace-state path if persistence is desired. Keep Data overlay as the master visibility switch. A per-layer toggle adds complexity without evidence; one global toggle suffices for GMI/SOSI comparisons. The label should indicate physical size rather than only width, while help text states that the boundary is the reported dimension and may be internal.

## Zoom and clutter

Keep true geographical radius at all zooms. These exports contain at most 1600 mm and only 64 Phase 1 circles across four files, so far-zoom circles naturally become very small. A separate zoom threshold or screen-pixel suppression is unnecessary initially and could make footprints vanish unpredictably while zooming. The global toggle handles optional display. Revisit only if a larger project shows dense or unusually large structures. Do not enlarge a tiny footprint merely to remain visible; the marker already provides overview visibility.

## Performance

At most 64 Phase 1 `L.Circle` SVG paths would be added for all four reference exports combined; a broader shape-agnostic `KUM`/`SLS` rule would create 76. The current 929 point markers and many line paths are already present. Tens to a few hundred simple SVG circles should be acceptable under the existing SVG renderer; this is an engineering estimate, not a benchmark. Path geometry recomputes on pan/zoom, while candidates should be memoized for data, order, filter, and toggle changes. Layer reorder changes paint order, and filters may remount or restyle the GeoJSON layer; the separate circles must stay synchronized. If real projects reach thousands of eligible circles, profile pan/zoom and filter latency before considering Canvas or viewport culling. No renderer switch is justified by this sample.

## 3D consistency

`src/lib/3d/transformGMIData.js` already reads canonical `Bredde` (after legacy `Bredde (diameter)` and before `Dimensjon`) and uses `bredde / 2000` as radius for `KUM`, `SLU`, `SLS`, `SAN` cylinders and `LOK` discs. Thus 1200 mm → 0.6 m is consistent for the relevant cylinder structures. Its default 800 mm and minimum radii are 3D display fallbacks, not reported geometry; do **not** copy them into 2D. 3D does not use `Kumform` to switch cylinder shape, so it should not be treated as proof that unknown forms are round. No 3D changes are part of this plan.

## Edge cases

- Missing, blank, zero, negative, `NaN`, infinity, booleans, and malformed widths: no circle. Use a finite positive numeric value; reject a comma decimal string for this integer-mm field unless an approved parser/validation rule normalizes it first. No `parseFloat` partial acceptance.
- Very small reported widths: retain valid values initially, since 110 mm occurs four times; inspect those objects before setting a numeric floor. Width validation's current `0–19` warning and `≥20` pass are useful quality signals but are not physical category proof. No source-backed maximum was found. Treat extraordinary values as review candidates and consider a provisional visual cap only after an agreed domain bound; do not silently shrink a drawn footprint.
- Unknown/nonround form: no Phase 1 circle. `FK`/`FR` need their own geometry rules. `F` is only four-sided, not necessarily square.
- `ID`: radius describes inner extent; `OD`: reported outside extent; missing code: unspecified. Never relabel all as outside wall bounds.
- Nonphysical points: no circle despite width. Duplicate/coincident structures: preserve separate feature IDs and foreground order; avoid footprint-specific selection.
- A source polygon already representing a structure boundary should not receive an additional inferred point footprint unless its point-to-polygon relationship is known.

## Implementation phases

1. **Phase 1 — accurate round structures.** Add pure canonical applicability/size helper for `KUM/SLS/SLU/SAN` with explicit `Kumform=R` and finite positive integer `Bredde`; use `Circle` with metre radius. Add z=395 non-interactive pane, restrained neutral style, and a global `Vis objektstørrelse` toggle. Refactor or share effective point visibility so circles follow markers, Data overlay, dataset order, filters, and outliers. No change to 3D.
2. **Phase 2 — reviewed shapes and themes.** Investigate widthless/missing-form cases, `FK`, `FR`, `F`, `Lengde`, orientation, covers, inlets, pump stations, and newer manhole themes. Add only shapes/categories supported by domain guidance and representative GMI/SOSI records. Consider a clearly labelled approximate circle mode only if users need it.
3. **Phase 3 — observed refinements.** Evaluate `ID` styling or exterior derivation with verified thickness, dense overlap handling, and performance/zoom tuning on larger projects. Keep map-scale semantics throughout.

## Test plan

Focused implementation tests should cover: `1200 → 0.6 m`, `2500 → 1.25 m`; eligible round `KUM`/`SLS` and negative valve/equipment/annotation/`UTS` cases; absent/zero/negative/nonfinite/malformed widths; `R` versus `FK`/`FR`/missing; GMI and SOSI with identical canonical props yielding the same result; `ID`/`OD` not silently converted. Component/contract checks should verify non-interactive circles and pane z-order, only actual marker popup/tooltip, Data/layer/filter/outlier visibility parity, deterministic dataset order, and semantic lines above footprints. A map-level zoom/pan check should confirm the geometry remains geographically 1.2 m wide while marker pixel size remains fixed. Existing `tests/sosiCanonicalAttributes.test.mjs`, `tests/layerOrder.test.mjs`, `tests/layerHighlightHalo.test.mjs`, and `tests/featureHoverTooltip.test.mjs` are useful ownership patterns. No tests were run for this planning task.

## Manual acceptance scenarios

1. A 1200 mm round kum with connecting pipes: the circle radius is 0.6 m, pipes stay visible across fill, marker remains screen sized.
2. A 2000+ mm structure from an appropriate GMI/sample fixture: confirm larger radius without pixel scaling; the four audited SOSI exports do not contain one.
3. New GMI structures over an existing SOSI network: equivalent canonical dimensions render equivalently.
4. A pipe terminates just inside versus just outside reported boundary; at close zoom the difference is legible, subject to data positional accuracy and `ID`/`OD` meaning.
5. Close neighboring structures and exact overlaps: circles and markers remain distinguishable.
6. Switch GMI/SOSI layer order: foreground footprint and marker follow established order; every pipe remains above footprints.
7. Enable layer highlighting: the dataset ring/casing and neutral size footprint remain distinct.
8. Hover/click/measure: only central marker owns point tooltip and popup; empty footprint area does not intercept.
9. Compare close and overview zoom, and toggle on/off: size stays geographic; overview remains manageable.
10. Inspect known `ID`, `OD`, and missing inside/outside codes, including the one `ID` reference point: avoid interpreting inner width as outside collision boundary.

## Risks / open questions

- Domain review is needed before showing missing-form widths, nonround structures, optional PSP/INR widths, covers, or other validator-approved themes. Validation applicability alone does not establish physical footprint meaning.
- The four reference exports have narrow observed values and sparse `ID`/`OD`; they cannot establish a universal maximum or prevalence in other exporters. The source instruction's polygon exception needs a concrete point/polygon linkage before automation.
- The present map independently repeats point-visibility logic in `pointToLayer` and `onEachFeature`, with a field-validation override in the former. A shared selector is essential to avoid orphan circles.
- Both existing WMS layers live in the tile pane; confirm the footprint remains above their imagery and that their opacity permits a useful background during manual acceptance.
- `tests/validationV2PointFieldApplicability.test.mjs` contains historical expectations for some cells (for example `STR`) that differ from the current policy file; new footprint tests should assert against the current intended rule, not inherit stale expectations.
- A width circle is a contextual aid. It does not establish construction wall thickness, survey precision, pipe invert connection, or confirmed physical intersection.

## Files likely to change

- `src/lib/map/pointFootprint.mjs` (new pure candidate/size and perhaps visibility selector), with focused tests under `tests/`.
- `src/components/MapInner.js` for the pane, circles, visibility derivation, dataset draw order, and compact toggle placement or map-control wiring.
- `src/lib/store.js` if the global toggle is persisted; existing map toolbar/control component if the button is placed outside `MapInner`.
- Possibly a small shared visibility helper in `src/lib/map/` so normal markers and footprints cannot diverge. No parser or 3D edit should be required for Phase 1.

## Final repository state

Audit performed on branch `feature/physical-point-footprints` at `dc03532` (`Map SOSI owner to canonical Eier`). The pre-existing local modification to `data/usage/aggregates.json` was left untouched. `REF_FILES/` was read only. This report is the only new file. `git diff --check` exits 0; Git emits only a line-ending warning about the pre-existing runtime data file. `git status --short` shows ` M data/usage/aggregates.json` and `?? docs/agent-reports/20260929-physical-point-footprints-plan.md`. No build or tests were run; no commit or push was made.
