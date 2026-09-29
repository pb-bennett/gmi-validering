# Layer highlight halo visual tuning

## Manual observation

Browser review of a new GMI layer alongside an existing SOSI layer found the casing and point-ring concept useful. Fuchsia was easy to distinguish. Cyan was hard to see around bright green SP pipes. Line casings could be slightly more visible, while point rings already read well and should not grow with the line casing.

## Palette adjustment

Updated the upload-time default palette in `src/lib/map/layerHighlight.mjs` to fuchsia `#D946EF`, amber/gold `#F59E0B`, cyan `#00BFD8`, violet `#8B5CF6`, teal `#14B8A6`, and slate `#64748B`. The common GMI/SOSI pair now receives fuchsia and amber. Cyan remains available third. Palette colors are still assigned and stored when a layer is added; hiding/removing an earlier layer does not recolour survivors, and a later upload can reuse a freed slot.

## Opacity adjustment

Changed `DEFAULT_HIGHLIGHT_OPACITY` from 0.55 to 0.65. This value affects only the layer casing and SVG point ring. Semantic stroke opacity is unchanged. The existing proportional analysis rule remains `configured opacity × min(1, semantic opacity / 0.9)`, so a faded 0.3 analysis line receives about 0.217 casing opacity at the new default.

## Spread adjustment

Changed `DEFAULT_HIGHLIGHT_SPREAD` from 4 to 6 px total. Casing width remains `semantic weight + spread`: 3 px becomes 9 px, 8 px becomes 14 px, and 12 px becomes 18 px. Dimension-to-weight logic and semantic line widths are unchanged.

## Point ring constraint

Kept point-specific exposure at `clamp(spread / 2, 1, 2)`. The default spread of 6 therefore remains capped at 2 px per side; increasing line casing width does not make LOK and other small symbols heavy. Ring opacity follows the new 0.65 configured layer opacity, while the inner symbol remains untouched.

## Preserved semantic/dash behavior

The semantic colour table and `getLineStyle`/`getOverflowDashArray` were not changed. Casing continues to copy the final semantic dash array exactly, rather than calculating dashes from casing width. Tests retain 600 mm AFO/SPO `20, 20`, selected 12 px overflow `24, 24`, and drainage `5, 5`; the current line-cap treatment is unchanged.

## Tests

Updated `tests/layerHighlightHalo.test.mjs` to assert fuchsia and amber first, cyan third, 0.65 opacity, 6 px spread, 9/14/18 px casing examples, proportional faded casing opacity, and the 2 px point-ring cap. Existing checks continue to cover assigned-colour stability through visibility changes and removal, palette-slot reuse, missing-style fallback, AFO/SPO adaptive dashes, drainage dashes, and point silhouettes.

Focused command: `node --test tests/layerHighlightHalo.test.mjs tests/lineStyle.test.mjs tests/testMode.test.mjs` — **17 passed, 0 failed**. No production build was run for this constants/style tuning pass.

## Files changed

- `src/lib/map/layerHighlight.mjs`
- `tests/layerHighlightHalo.test.mjs`
- `docs/agent-reports/20260929-layer-highlight-halo-visual-tuning.md`

The existing core implementation and report remain intact. `data/usage/aggregates.json` was pre-existing local runtime data and was not touched.

## Final repository state

Branch remains `feature/layer-highlight-halo`; no reset, restore, stash, clean, branch switch, commit, or push was performed. `git diff --check` and `git status --short` results are recorded in the final response.
