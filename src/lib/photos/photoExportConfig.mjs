// Export choices for each photo layer, held by the page for the session and never persisted.
export const DEFAULT_PHOTO_EXPORT_CONFIG = Object.freeze({ profile: 'gemini-legacy2019', crs: 'EPSG:25832', context: Object.freeze({}), label: '' });

export const photoExportConfigFor = (configs, layerId) => configs.get(layerId) || DEFAULT_PHOTO_EXPORT_CONFIG;

export function updatePhotoExportConfig(configs, layerId, patch) {
  return new Map(configs).set(layerId, Object.freeze({ ...photoExportConfigFor(configs, layerId), ...patch }));
}

// Runs on every session publish, so an unchanged set keeps its identity and renders nothing.
export function reconcilePhotoExportConfig(configs, liveLayerIds) {
  const live = new Set(liveLayerIds);
  return [...configs.keys()].every((id) => live.has(id)) ? configs : new Map([...configs].filter(([id]) => live.has(id)));
}
