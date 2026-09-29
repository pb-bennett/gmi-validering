# Overflow line symbology

## Root cause and owner

`MapInner.js` owns Leaflet 2D line colour and dash settings. Its colour fallback made `SPO` green, while `AFO` fell through to the purple unknown colour; only drainage codes received a dash. `MapLegend.js` rendered a separate fixed list of line samples without overflow variants. The two views had no shared line-style declaration.

3D does **not** use this 2D style mapping: `transformGMIData.js` calls the independent `src/lib/3d/colorMapping.js`, and 3D pipes are solid tubes. Its existing AF family is purple, unlike the 2D red AF family. The 3D mapping and legend were left unchanged because this request concerns dashed 2D strokes and 3D has no equivalent dash presentation.

## Files changed

- `src/lib/map/lineStyle.mjs`: declares AFO→AF and SPO→SP parent relationships and variant dashes; provides 2D stroke and legend sample helpers.
- `src/components/MapInner.js`: applies the helper in normal and analysis rendering. Overflow dashes remain visible on selected and faded analysis lines.
- `src/components/MapLegend.js`: renders the line entries from the shared declaration, including AFO and SPO.
- `tests/lineStyle.test.mjs`: checks exact colours, dashes, legend entries and samples, unchanged drainage styling, and component wiring.
- This report.

## Before and after

| Code | Before 2D | After 2D |
|---|---|---|
| AF | red, solid | red, solid |
| AFO | purple, solid | AF red, dashed `5, 5` |
| SP | green, solid | green, solid |
| SPO | green, solid | SP green, dashed `5, 5` |

The legend previously showed only solid AF and SP samples; it now shows separate dashed AFO and SPO samples in the parent colours. Existing VL/OV samples and drainage's dashed sample remain. Other map styling and validation logic were not changed.

## Tests and build

Focused style, map legend, map timeline, and parser integration tests: **29 passed, 0 failed**. `git diff --check` passed with line-ending notices. `npm.cmd run build` was attempted but failed while `next/font` fetched Roboto from Google Fonts; this is an external font-fetch failure, so the build did not complete. No font architecture was changed.

## Follow-up considerations

The 3D colour table differs from the 2D scheme for AF and its variants. If unified 2D/3D symbology is desired, that should be a separate decision covering the 3D colour legend and whether overflow needs a visible 3D treatment.

## Dimension-aware dash refinement

The initial `5, 5` runtime dash stayed constant as Leaflet increased stroke width from `Dimensjon`. On a 600 mm pipe the final line weight is 8 (or 12 when the normal highlight treatment adds four), so each five-pixel gap was smaller than the stroke thickness and visually closed up.

The shared `getOverflowDashArray(fcode, strokeWeight)` now computes dash and gap as `clamp(strokeWeight × 2.5, 5, 24)`. The same bounded length is used for each dash and gap. This keeps thin lines at the original `5, 5`, scales up with the actual rendered weight, and preserves a gap at least twice the largest current map weight (12), without unbounded lengths. `getLineStyle` receives the actual final width from each MapInner branch: dimension-based base width, highlighted width, selected width 8, or faded width 2. Dimension-to-weight logic is unchanged. AF/SP stay solid, their colours are unchanged, and drainage keeps its existing fixed `5, 5` pattern.

The legend has no feature dimension, so AFO/SPO continue to use a fixed representative five-pixel dashed sample, independent of map stroke weight. Focused line-style, map toolbar, timeline, and popup tests passed: **24 passed, 0 failed**. `git diff --check` passed. The full build was not rerun for this narrow helper change; recent attempts in this work session are already known to fail intermittently while fetching Roboto through Google Fonts.
