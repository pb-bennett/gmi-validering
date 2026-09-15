export const MapToolbarMode = Object.freeze({
  NORMAL: 'normal',
  CONSTRAINED: 'constrained',
  NARROW: 'narrow',
});

export const MAP_TOOLBAR_NARROW_WIDTH = 580;
export const MAP_TOOLBAR_CONSTRAINED_WIDTH = 860;
export const MAP_LEGEND_COMPACT_WIDTH = 1100;

export function getMapToolbarMode(width) {
  if (width < MAP_TOOLBAR_NARROW_WIDTH) return MapToolbarMode.NARROW;
  if (width < MAP_TOOLBAR_CONSTRAINED_WIDTH) return MapToolbarMode.CONSTRAINED;
  return MapToolbarMode.NORMAL;
}

export function isMapLegendCompact(width) {
  return width < MAP_LEGEND_COMPACT_WIDTH;
}

export function isMapPaneConstrained(width) {
  return getMapToolbarMode(width) !== MapToolbarMode.NORMAL;
}

export function createMapPanePresentationState() {
  return {
    mode: null,
    legendCompact: null,
    legendCollapsed: false,
  };
}

export function reduceMapPanePresentation(state, action) {
  if (action.type === 'legend-toggled') {
    return { ...state, legendCollapsed: !state.legendCollapsed };
  }

  if (
    action.type !== 'pane-measured' ||
    (state.mode === action.mode && state.legendCompact === action.legendCompact)
  ) return state;

  const enteringLegendCompact = action.legendCompact && state.legendCompact !== true;
  return {
    mode: action.mode,
    legendCompact: action.legendCompact,
    legendCollapsed: enteringLegendCompact ? true : state.legendCollapsed,
  };
}

export function getActiveBottomSurface({
  layerDataTableOpen,
  analysisOpen,
  otherBottomSurface = null,
}) {
  if (otherBottomSurface) return otherBottomSurface;
  if (layerDataTableOpen) return 'layer-table';
  if (analysisOpen) return 'profile-analysis';
  return null;
}

export function mapOwnsWorkspaceBottomRight({
  rightSurfaceOpen = false,
  bottomSurface = null,
}) {
  return rightSurfaceOpen === false && bottomSurface === null;
}
