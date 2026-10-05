const SURVEY_TYPES = new Set(['GMI', 'SOSI', 'KOF']);

export function getLayerType(layer) {
  if (layer?.type === 'FOTO') return 'FOTO';
  for (const format of [layer?.file?.format, layer?.data?.format]) {
    const type = typeof format === 'string' ? format.toUpperCase() : null;
    if (SURVEY_TYPES.has(type)) return type;
  }
  return null; // Never guess a survey format from a filename.
}

// Presentation seam only. Photo layers never enter survey selectors or feature pipelines.
// Photo imports are newest-first; the existing authoritative survey order is unchanged.
export function getWorkspaceLayerEntries(surveyLayers, surveyOrder, photoLayers) {
  return [
    ...photoLayers.map((layer) => ({ id: layer.id, kind: 'photo', layer })),
    ...surveyOrder.filter((id) => surveyLayers[id]).map((id) => ({ id, kind: 'survey', layer: surveyLayers[id] })),
  ];
}
