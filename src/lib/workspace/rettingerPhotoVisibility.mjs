// Validator and Rettinger hide FOTO markers for one visit. The override only
// affects rendering, so the Layer Manager stays authoritative for visibility.

export function createWorkspacePhotoOverride(visitKey = null) {
  return { visitKey, shown: false };
}

export function reconcileWorkspacePhotoOverride(override, visitKey = null) {
  return override?.visitKey === visitKey ? override : createWorkspacePhotoOverride(visitKey);
}

export function toggleWorkspacePhotoOverride(override) {
  return override?.visitKey ? { ...override, shown: !override.shown } : override;
}

export function workspacePhotosSuppressed(override) {
  return Boolean(override?.visitKey && !override.shown);
}

// «Vis bilder» only applies to layers with placed photos and user visibility enabled.
export function workspacePhotoToggleAvailable(photoLayers, visitKey) {
  return Boolean(visitKey) && (photoLayers || []).some((layer) => layer?.visible && layer.placedCount > 0);
}
