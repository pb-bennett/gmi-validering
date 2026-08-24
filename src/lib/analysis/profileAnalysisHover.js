import { projectCoordinateToWgs84 } from '../map/coordinateProjection';

export const selectAnalysisActiveData = (state) => {
  const layerId = state.analysis.layerId;
  return layerId !== null
    ? state.layers[layerId]?.data
    : state.data;
};

export const getHoveredTerrainLatLng = (
  hoveredTerrainPoint,
  lineCoords,
  activeData,
) => {
  const target = hoveredTerrainPoint;
  if (!target || !lineCoords || lineCoords.length < 2) return null;

  const targetDist =
    target.lineDist !== undefined ? target.lineDist : target.dist;

  let distSoFar = 0;
  for (let i = 0; i < lineCoords.length - 1; i++) {
    const p1 = lineCoords[i];
    const p2 = lineCoords[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (segLen < 0.0001) continue;

    if (targetDist <= distSoFar + segLen) {
      const t = (targetDist - distSoFar) / segLen;
      const x = p1.x + (p2.x - p1.x) * t;
      const y = p1.y + (p2.y - p1.y) * t;
      const [lng, lat] = projectCoordinateToWgs84(activeData, x, y);
      return [lat, lng];
    }

    distSoFar += segLen;
  }

  return null;
};
