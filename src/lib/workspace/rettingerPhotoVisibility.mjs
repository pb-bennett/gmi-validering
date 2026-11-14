// Rettinger hides FOTO markers on the map for the duration of one visit. This is a render-time presentation override
// only: it never writes photoSession layer visibility, so the layer cards and the Layer Manager stay authoritative and
// leaving Rettinger restores the previous map exactly. The override is bound to one Rettinger layer; a layer switch or
// a new visit starts hidden again, whatever the user chose during the previous visit.

export function createRettingerPhotoOverride(editLayerId = null) {
  return { layerId: editLayerId ?? null, shown: false };
}

// The override that applies to the current Rettinger layer: the stored one when it belongs to that layer, otherwise a
// fresh hidden one (entry, layer switch) or an inactive one (no Rettinger layer).
export function reconcileRettingerPhotoOverride(override, editLayerId = null) {
  const layerId = editLayerId ?? null;
  return override?.layerId === layerId ? override : createRettingerPhotoOverride(layerId);
}

export function toggleRettingerPhotoOverride(override) {
  return override?.layerId ? { ...override, shown: !override.shown } : override;
}

// Markers are suppressed only while Rettinger actually owns the workspace and the user has not chosen «Vis bilder».
export function rettingerPhotosSuppressed(override, rettingerActive) {
  return Boolean(rettingerActive && override?.layerId && !override.shown);
}

// The «Vis bilder» control is offered only when there is something it could show: a FOTO layer that is visible by its
// own (persistent) setting and has placed photos. Layers the user hid stay hidden.
export function rettingerPhotoToggleAvailable(photoLayers, rettingerActive) {
  return Boolean(rettingerActive) && (photoLayers || []).some((layer) => layer?.visible && layer.placedCount > 0);
}
