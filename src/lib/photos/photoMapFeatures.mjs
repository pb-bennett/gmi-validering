import { isPhotoPosition } from './photoSpatial.mjs';
import { photoPositionDistance } from './photoPositioning.mjs';

// One pass per visible layer. photosByLayer supplies already-derived (e.g. staged/effective) photos,
// so the map never re-reads the session per marker. include restricts one layer to the workspace view; include.visible
// draws that layer even when its own visible flag is off (FOTO shows the layer it opened).
export function buildPhotoMapItems(layers, getLayerPhotos, { photosByLayer = null, include = null } = {}) {
  return layers.filter((layer) => layer.visible || (include?.visible && include.layerId === layer.id)).flatMap((layer) => {
    const photos = photosByLayer?.get(layer.id) ?? getLayerPhotos(layer.id);
    const allowed = include?.layerId === layer.id ? include.ids : null;
    return photos.flatMap((photo) => {
      const position = photo.spatial?.current?.position;
      if (allowed && !allowed.has(photo.id)) return [];
      return isPhotoPosition(position) ? [{ layerId: layer.id, photo, feature: {
        type: 'Feature', id: `photo:${layer.id}:${photo.id}`,
        properties: { kind: 'photo', layerId: layer.id, photoId: photo.id },
        geometry: { type: 'Point', coordinates: [position.longitude, position.latitude] },
      } }] : [];
    });
  });
}

export function buildPhotoMapFeatures(layers, getLayerPhotos, options) {
  return buildPhotoMapItems(layers, getLayerPhotos, options).map((item) => item.feature);
}

export function photoLayerMapFit(photos) {
  const southWest = { crs: 'EPSG:4326', latitude: Infinity, longitude: Infinity };
  const northEast = { crs: 'EPSG:4326', latitude: -Infinity, longitude: -Infinity };
  for (const photo of photos) {
    const position = photo.spatial?.current?.position;
    if (!isPhotoPosition(position)) continue;
    southWest.latitude = Math.min(southWest.latitude, position.latitude);
    southWest.longitude = Math.min(southWest.longitude, position.longitude);
    northEast.latitude = Math.max(northEast.latitude, position.latitude);
    northEast.longitude = Math.max(northEast.longitude, position.longitude);
  }
  const span = photoPositionDistance(southWest, northEast);
  if (span === null) return null;
  const bounds = [[southWest.latitude, southWest.longitude], [northEast.latitude, northEast.longitude]];
  return span < 10 ? { bounds, zoom: 18 } : { bounds, maxZoom: 20 };
}

export function resolvePhotoLocate(session, request) {
  if (request?.kind !== 'photo') return null;
  const layer = session.getLayer(request.layerId);
  if (!layer?.photoIds.includes(request.photoId)) return null;
  // Edit mode locates the staged (effective) position it displays; canonical state is not read for it.
  if (!request.candidateId && isPhotoPosition(request.position)) return request.position;
  const photo = session.getPhoto(request.photoId);
  const candidate = request.candidateId ? photo.spatial.candidates.find((item) => item.id === request.candidateId) : null;
  const position = request.candidateId ? (candidate?.status === 'viable' ? candidate.position : null) : photo.spatial.current?.position;
  return isPhotoPosition(position) ? position : null;
}
