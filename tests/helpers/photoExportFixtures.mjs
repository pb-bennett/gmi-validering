import assert from 'node:assert/strict';
import { createPhotoSession } from '../../src/lib/photos/photoSession.mjs';
import { capturePhotoExportSnapshot, buildPhotoExportPlan } from '../../src/lib/photos/export/photoExportPlan.mjs';
import { gmiFile } from './gmiPhotoFixtures.mjs';
import { gpsPng } from './photoGpsFixtures.mjs';

// Invented export context only. Not defaults or suggested truthful project data.
export const syntheticContext = { surveyDate: '2026-05-12', datasetName: 'Synthetic & dataset', projectName: 'Synthetic <project>',
  horizontalMethod: '99', verticalMethod: '99', surveyReason: 'nytt', surveyConditions: 'åpenGrøft' };

export async function exportFixture({ files = null, names = ['Grøft æ image.png'], repeated = false, unplaced = false, direction = 0, time = '2026-05-12T14:33:02', photographer = 'Synthetic & <Artist>', ...options } = {}) {
  let id = 0;
  const session = createPhotoSession({ createId: () => `export-${++id}`, yieldJob: () => new Promise((resolve) => setImmediate(resolve)),
    createThumbnail: async () => ({ thumbnailBlob: new Blob(['preview']), dimensions: { width: 1, height: 1 } }),
    // A direction is only ever unknown while EXIF is still being read, so that is the state `direction: null` asks for.
    extractGps: direction === null ? () => new Promise(() => {}) : async () => ({ state: 'no-gps', candidate: null }),
    urls: { createObjectURL: () => 'blob:synthetic', revokeObjectURL() {} }, ...options });
  session.importFiles(files || names.map((name) => new File([gpsPng()], name, { type: 'image/png' })));
  const layer = session.createLayer();
  // The read can change accepted values, so a finished fixture must not have one still running.
  if (direction !== null) while (session.getLayerPhotos(layer.id).some((photo) => photo.spatial.exifRead.state === 'pending')) await new Promise((resolve) => setImmediate(resolve));
  if (repeated) {
    await session.stageLayerSource(layer.id, gmiFile([{ hyperlink: `h:1(link:"${names[0]}") ` }, { hyperlink: `h:1(link:"${names[0]}") ` }]), 'gmi');
    const review = session.getSnapshot().sourceReviews[layer.id];
    assert(session.applyGmiAssociations(layer.id, { confirmed: true, sourceId: review.source.id, memberIds: review.memberIds, associationLedger: review.associationLedger }).ok);
  }
  const ids = session.getLayer(layer.id).photoIds;
  if (!unplaced) for (const [index, photoId] of ids.entries()) {
    assert(session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [{ photoId: photoId, position: { crs: 'EPSG:4326', longitude: 10.43555 + index * .001, latitude: 59.2251222222 } }]).ok);
    if (direction !== null) assert(session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [{ photoId: photoId, degrees: direction }]).ok);
  }
  if (time !== null) session.setCaptureMetadata(layer.id, ids, 'captureTime', time);
  if (photographer !== null) session.setCaptureMetadata(layer.id, ids, 'photographer', photographer);
  const plan = (configuration = {}, hooks) => buildPhotoExportPlan(capturePhotoExportSnapshot(session, layer.id),
    { profile: 'legacy2019', crs: 'EPSG:25832', context: syntheticContext, ...configuration }, hooks);
  return { session, layerId: layer.id, ids, plan };
}
