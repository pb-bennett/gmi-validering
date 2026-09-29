// UI order is front to back; Leaflet paints later paths above earlier paths.
export function getLayerPaintOrder(layerOrder) {
  return [...layerOrder].reverse();
}

export function moveLayerInOrder(layerOrder, layerId, direction) {
  const index = layerOrder.indexOf(layerId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layerOrder.length) return layerOrder;
  const next = [...layerOrder];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Leaflet marker z-index starts at the marker's screen Y coordinate. Reserve
// enough distance between datasets for ordinary viewport-height differences.
const MARKER_LAYER_STEP = 10000;

export function getLayerMarkerZIndexOffset(layerOrder, layerId, selected = false) {
  const index = layerOrder.indexOf(layerId);
  const rank = index < 0 ? 0 : layerOrder.length - index;
  const selectionOffset = selected ? (layerOrder.length + 1) * MARKER_LAYER_STEP : 0;
  return rank * MARKER_LAYER_STEP + selectionOffset;
}
