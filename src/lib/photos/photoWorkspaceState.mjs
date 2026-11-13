export const PHOTO_WORKSPACE_MODES = Object.freeze(['browse', 'edit', 'remove', 'delivery']);
export const PHOTO_COLOUR_MODES = Object.freeze(['delivery', 'provenance']);
export const DEFAULT_PHOTO_FILTER = Object.freeze({ placement: 'all', missingDirection: false, missingCaptureTime: false, repeated: false, changed: false, delivery: 'all' });
export const DEFAULT_PHOTO_SORT = 'filename-asc';
// Map colouring defaults to delivery destination (Leveringsvalg) throughout the workspace; the user's choice lasts for the
// workspace session and no mode change overrides it.
export const emptyPhotoWorkspace = Object.freeze({ layerId: null, activePhotoId: null, photoIds: Object.freeze([]),
  mode: 'browse', colourMode: 'delivery', removalIds: Object.freeze([]), filter: DEFAULT_PHOTO_FILTER, sort: DEFAULT_PHOTO_SORT });

const FILTER_PLACEMENTS = ['all', 'placed', 'unplaced', 'exif', 'gmi', 'gml', 'manual', 'unknown'];
const FILTER_FLAGS = ['missingDirection', 'missingCaptureTime', 'repeated', 'changed'];
const FILTER_DELIVERY = ['all', 'keep-link', 'transfer', 'include', 'not-selected', 'review'];

function normalizeFilter(filter, patch) {
  const next = { ...filter };
  if (patch.placement !== undefined && FILTER_PLACEMENTS.includes(patch.placement)) next.placement = patch.placement;
  for (const flag of FILTER_FLAGS) if (patch[flag] !== undefined) next[flag] = Boolean(patch[flag]);
  if (patch.delivery !== undefined && FILTER_DELIVERY.includes(patch.delivery)) next.delivery = patch.delivery;
  // A fixed work list from Fullfør opplysninger ({ ids, label }). Only present while one is set.
  if (patch.work) next.work = patch.work;
  else if (patch.work === null) delete next.work;
  return Object.freeze(next);
}

// UI selection is independent of ownership, layer inclusion, and survey highlights.
// Filter and sort are transient workspace presentation; they never change selection.
// Delivery planning (mode 'delivery') has no selection of its own: each click writes one occurrence's M8 decision.
export function photoWorkspaceReducer(state, action) {
  if (action.type === 'exit') return emptyPhotoWorkspace;
  // Re-entering the open layer (after adding photos, say) is the same workspace session and keeps the colour choice.
  if (action.type === 'enter') return { ...emptyPhotoWorkspace, layerId: action.layerId, photoIds: action.photoIds,
    colourMode: state.layerId && state.layerId === action.layerId ? state.colourMode : emptyPhotoWorkspace.colourMode,
    activePhotoId: action.photoIds.includes(action.photoId) ? action.photoId : action.photoIds[0] || null };
  if (action.type === 'reconcile') {
    const layer = action.layers ? action.layers.find((item) => item.id === state.layerId) : action.layer;
    if (!layer) return emptyPhotoWorkspace;
    const photoIds = layer.photoIds;
    if (photoIds === state.photoIds) return state;
    const oldIndex = state.photoIds.indexOf(state.activePhotoId);
    const activePhotoId = photoIds.includes(state.activePhotoId) ? state.activePhotoId
      : state.photoIds.slice(oldIndex + 1).find((id) => photoIds.includes(id))
        || state.photoIds.slice(0, oldIndex).reverse().find((id) => photoIds.includes(id)) || photoIds[0] || null;
    return { ...state, photoIds, activePhotoId, removalIds: state.removalIds.filter((id) => photoIds.includes(id)) };
  }
  if (action.type === 'active') return state.photoIds.includes(action.photoId) && state.activePhotoId !== action.photoId
    ? { ...state, activePhotoId: action.photoId } : state;
  if (action.type === 'mode' && PHOTO_WORKSPACE_MODES.includes(action.mode) && state.layerId) {
    if (state.mode === action.mode) return state;
    // The "changed" filter only exists inside Edit mode; the removal selection only inside its mode. The colour choice stays.
    return { ...state, mode: action.mode, removalIds: [],
      filter: action.mode !== 'edit' && state.filter.changed ? normalizeFilter(state.filter, { changed: false }) : state.filter };
  }
  if (action.type === 'map-colour' && PHOTO_COLOUR_MODES.includes(action.value)) return state.colourMode === action.value ? state : { ...state, colourMode: action.value };
  if (action.type === 'filter') {
    const patch = action.filter?.changed && state.mode !== 'edit' ? { ...action.filter, changed: false } : action.filter || {};
    return { ...state, filter: normalizeFilter(state.filter, patch) };
  }
  if (action.type === 'sort' && typeof action.sort === 'string') return { ...state, sort: action.sort };
  if (action.type === 'reset-view') return { ...state, filter: DEFAULT_PHOTO_FILTER, sort: DEFAULT_PHOTO_SORT };
  if (action.type === 'toggle-removal' && state.mode === 'remove' && state.photoIds.includes(action.photoId)) return { ...state,
    removalIds: state.removalIds.includes(action.photoId) ? state.removalIds.filter((id) => id !== action.photoId) : [...state.removalIds, action.photoId] };
  if (action.type === 'select-removal' && state.mode === 'remove') return { ...state,
    removalIds: action.photoIds.filter((id) => state.photoIds.includes(id)) };
  return state;
}

export const photoFilterIsDefault = (filter) => !filter.work && Object.keys(DEFAULT_PHOTO_FILTER).every((key) => filter[key] === DEFAULT_PHOTO_FILTER[key]);
