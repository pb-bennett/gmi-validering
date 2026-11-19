// One photo-map visibility model for every map workspace (A8.1). It only affects rendering, so the Layer Manager stays
// authoritative for each layer's own visible flag.
// - `hidden` is the user's global choice from the map toolbar «Vis bilder» control. It applies in the main map and FOTO,
//   and it survives workspace transitions.
// - Validator and Rettinger hide photos for one visit (`visitKey`), whatever the global choice. `shown` is the visit's
//   temporary choice; leaving the visit discards it and the global choice applies again.

export function createWorkspacePhotoOverride(visitKey = null, hidden = false) {
  return { visitKey, shown: false, hidden: hidden === true };
}

export function reconcileWorkspacePhotoOverride(override, visitKey = null) {
  return override?.visitKey === visitKey ? override : createWorkspacePhotoOverride(visitKey, override?.hidden);
}

export function toggleWorkspacePhotoOverride(override) {
  if (!override) return override;
  return override.visitKey ? { ...override, shown: !override.shown } : { ...override, hidden: !override.hidden };
}

export function workspacePhotosSuppressed(override) {
  if (!override) return false;
  return override.visitKey ? !override.shown : override.hidden === true;
}

// With no photo layer left (reset, last layer removed) the global choice is forgotten, so a later import starts shown.
export function forgetPhotoVisibilityWithoutPhotos(override, photoLayers) {
  return override?.hidden && !(photoLayers || []).length ? { ...override, hidden: false } : override;
}

// «Vis bilder» is offered whenever a layer with user visibility enabled has placed photos. In FOTO the workspace layer
// counts as visible (`workspaceLayerId`): FOTO always shows the layer it opened, subject only to this control.
export function workspacePhotoToggleAvailable(photoLayers, workspaceLayerId = null) {
  return (photoLayers || []).some((layer) => (layer?.visible || (workspaceLayerId && layer?.id === workspaceLayerId)) && layer.placedCount > 0);
}
