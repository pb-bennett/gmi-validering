# Hover tooltip Stedfestingsårsak and map-control positioning

## Scope

Adjusted the map-level Lagmarkering trigger placement and appended canonical Stedfestingsårsak to compact hover labels. Existing tooltip delay, styling, colour dot, map selector behavior, popup content, and highlight colors remain unchanged.

## Lagmarkering trigger overlap

The trigger was positioned at right-4 top-14, while the native Leaflet base-layer selector is in the topright control corner. The selector's existing margin-top: 58px reserves the same toolbar row, so their horizontal footprints could overlap.

## Positioning change

The trigger now uses right-[14rem] top-14, placing it left of the native selector with a clear horizontal gap. The selector remains at the far right, and the trigger's existing z-index remains unchanged. The floating panel keeps its current right-4 top-26 placement, including its constrained-height styling. The fixed trigger offset applies in tall and constrained desktop layouts and no constrained-height rule moves it back into the selector footprint.

## Tooltip field addition

The shared formatter appends top-level Stedfestingsårsak after all current line or point identity segments. Lines retain identity/dimension, material, and year order. Points retain their existing compact identity order.

## Exact-value handling

The formatter accepts valid strings without trimming or shortening them and accepts finite numeric values. Empty text and existing placeholder values are omitted. No labels, translations, abbreviations, source-specific paths, or separators are added when the field is missing. Both GMI and SOSI benefit through the same canonical property.

## Tests

node --test tests/featureHoverTooltip.test.mjs tests/layerHighlightPanel.test.mjs tests/layerOrder.test.mjs tests/layerHighlightHalo.test.mjs tests/featurePopupContent.test.mjs passed 28 tests. Added formatter checks cover absent, empty, and placeholder causes, exact string preservation, line and point order, and identical canonical property handling for GMI/SOSI. Layout coverage checks the trigger's left offset from the top-right control, unchanged panel placement, and constrained-height rules. Existing tests continue to cover hover delay/cancellation, non-interactivity, popup attachment, colours, and layer ordering. git diff --check passed.

## Files changed

- src/components/LayerHighlightPanel.js: offset the trigger left.
- src/lib/map/featureHoverLabel.mjs: append exact canonical cause to line and point labels.
- tests/layerHighlightPanel.test.mjs: assert trigger/control positioning contract.
- tests/featureHoverTooltip.test.mjs: cover cause order and exact-value behavior.
- docs/agent-reports/20260929-hover-tooltip-stedfestingsarsak-and-map-control-position.md: this report.

## Final repository state

Changes remain uncommitted on feature/compact-hover-tooltip. No build, commit, or push was performed. The pre-existing data/usage/aggregates.json modification remains untouched; REF_FILES/ was not accessed.
