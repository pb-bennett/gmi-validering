import { isPhotoPosition } from './photoSpatial.mjs';

export function buildPhotoMapFeatures(layers, getLayerPhotos) {
  return layers.filter((layer) => layer.visible).flatMap((layer) => getLayerPhotos(layer.id).flatMap((photo) => {
    const position = photo.spatial?.current?.position;
    return isPhotoPosition(position) ? [{
      type: 'Feature', id: `photo:${layer.id}:${photo.id}`,
      properties: { kind: 'photo', layerId: layer.id, photoId: photo.id },
      geometry: { type: 'Point', coordinates: [position.longitude, position.latitude] },
    }] : [];
  }));
}

export function resolvePhotoLocate(session, request) {
  if (request?.kind !== 'photo') return null;
  const layer = session.getLayer(request.layerId);
  if (!layer?.photoIds.includes(request.photoId)) return null;
  const photo = session.getPhoto(request.photoId);
  const candidate = request.candidateId ? photo.spatial.candidates.find((item) => item.id === request.candidateId) : null;
  const position = request.candidateId ? (candidate?.status === 'viable' ? candidate.position : null) : photo.spatial.current?.position;
  return isPhotoPosition(position) ? position : null;
}
