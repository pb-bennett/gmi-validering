export const emptyPhotoWorkspace = Object.freeze({ layerId: null, activePhotoId: null, selectedIds: Object.freeze([]), photoIds: Object.freeze([]) });

// UI selection is independent of ownership, layer inclusion, and survey highlights.
export function photoWorkspaceReducer(state, action) {
  if (action.type === 'exit') return emptyPhotoWorkspace;
  if (action.type === 'enter') return { layerId: action.layerId, photoIds: action.photoIds,
    activePhotoId: action.photoIds.includes(action.photoId) ? action.photoId : action.photoIds[0] || null, selectedIds: [] };
  if (action.type === 'reconcile') {
    const layer = action.layers ? action.layers.find((item) => item.id === state.layerId) : action.layer;
    if (!layer) return emptyPhotoWorkspace;
    const photoIds = layer.photoIds;
    const oldIndex = state.photoIds.indexOf(state.activePhotoId);
    const activePhotoId = photoIds.includes(state.activePhotoId) ? state.activePhotoId
      : state.photoIds.slice(oldIndex + 1).find((id) => photoIds.includes(id))
        || state.photoIds.slice(0, oldIndex).reverse().find((id) => photoIds.includes(id)) || photoIds[0] || null;
    return { ...state, photoIds, activePhotoId, selectedIds: state.selectedIds.filter((id) => photoIds.includes(id)) };
  }
  if (action.type === 'active' && state.photoIds.includes(action.photoId)) return { ...state, activePhotoId: action.photoId };
  if (action.type === 'toggle' && state.photoIds.includes(action.photoId)) return { ...state,
    selectedIds: state.selectedIds.includes(action.photoId) ? state.selectedIds.filter((id) => id !== action.photoId) : [...state.selectedIds, action.photoId] };
  if (action.type === 'select-many') return { ...state, selectedIds: action.photoIds.filter((id) => state.photoIds.includes(id)) };
  return state;
}
