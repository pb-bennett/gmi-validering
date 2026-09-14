export const MapToolbarMode = Object.freeze({
  NORMAL: 'normal',
  CONSTRAINED: 'constrained',
  NARROW: 'narrow',
});

export function getMapToolbarMode(width) {
  if (width < 580) return MapToolbarMode.NARROW;
  if (width < 860) return MapToolbarMode.CONSTRAINED;
  return MapToolbarMode.NORMAL;
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
