import assert from 'node:assert/strict';
import test from 'node:test';
import { assertGeminiConventions } from './helpers/geminiPhotoConventions.mjs';
import { corpusGmlPath, readPhotoCorpus } from './helpers/photoCorpusFixtures.mjs';
import { acceptGmlPositions, attachGml, evidenceSession, exifClockToSecond, exportedTimes, placeAll, settleExif } from './helpers/photoEvidenceFixtures.mjs';
import { buildPhotoExportPlan, capturePhotoExportSnapshot } from '../src/lib/photos/export/photoExportPlan.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';

const skip = !corpusGmlPath && 'PHOTO_GML_FIXTURE is not set; the private corpus is opt-in.';
const plan = (session, layerId, profile) => buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), { profile, crs: 'EPSG:25832' });

test('private corpus: EXIF times reach Gemini XML after explicit adoption when no GML is attached', { skip, timeout: 300000 }, async () => {
  const { photos } = await readPhotoCorpus();
  const session = evidenceSession();
  try {
    const ids = session.importFiles(photos).acceptedIds, layer = session.createLayer();
    await settleExif(session, layer.id);
    const live = () => session.getLayerPhotos(layer.id);
    assert.equal(live().filter((photo) => photo.metadataEvidence.some((item) => item.kind === 'exif' && item.field === 'captureTime' && item.value)).length, photos.length);
    assert.equal(live().filter((photo) => photo.captureMetadata.captureTime).length, 0);
    placeAll(session, layer.id, ids, 90);

    const before = await plan(session, layer.id, 'gemini-legacy2019');
    assert.deepEqual(before.errors, []);
    assert.equal(before.counts.missingTimestampCount, photos.length);
    assert.equal((await plan(session, layer.id, 'legacy2019')).errors.filter((error) => error.code === 'capture-time-required').length, photos.length);

    assert.equal(session.adoptSourceEvidence(layer.id, 'captureTime', 'exif').counts.adopted, photos.length);
    const xml = serializePhotoExport(await plan(session, layer.id, 'gemini-legacy2019'));
    assertGeminiConventions(xml);
    const times = exportedTimes(xml);
    assert.equal(times.size, photos.length);
    assert.equal(live().filter((photo) => times.get(photo.originalFilename) !== exifClockToSecond(photo)).length, 0);
  } finally { session.clear(); }
});

test('private corpus: attaching the GML keeps EXIF and GML time evidence and accepts nothing', { skip, timeout: 300000 }, async () => {
  const { photos, gml } = await readPhotoCorpus();
  const session = evidenceSession();
  try {
    session.importFiles(photos);
    const layer = session.createLayer();
    await settleExif(session, layer.id);
    await attachGml(session, layer.id, gml);
    const live = () => session.getLayerPhotos(layer.id);
    const kinds = (photo) => photo.metadataEvidence.filter((item) => item.field === 'captureTime' && item.value).map((item) => item.kind).sort().join('+');
    assert.equal(live().filter((photo) => kinds(photo) === 'exif+gml').length, photos.length);
    assert.equal(live().filter((photo) => photo.captureMetadata.captureTime || photo.direction.current || photo.spatial.current).length, 0);
    assert.equal(acceptGmlPositions(session, layer.id).length, photos.length);
    assert.equal(live().filter((photo) => photo.spatial.current).length, photos.length);
  } finally { session.clear(); }
});
