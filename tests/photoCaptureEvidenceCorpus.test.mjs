import assert from 'node:assert/strict';
import test from 'node:test';
import { assertGeminiConventions } from './helpers/geminiPhotoConventions.mjs';
import { corpusGmlPath, readPhotoCorpus } from './helpers/photoCorpusFixtures.mjs';
import { acceptGmlPositions, attachGml, evidenceSession, exifClockToSecond, exportedTimes, settleExif } from './helpers/photoEvidenceFixtures.mjs';
import { photoCaptureTimeStatus, photoMetadataConflict } from '../src/lib/photos/photoPresentation.mjs';
import { buildPhotoExportPlan, capturePhotoExportSnapshot } from '../src/lib/photos/export/photoExportPlan.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';

const skip = !corpusGmlPath && 'PHOTO_GML_FIXTURE is not set; the private corpus is opt-in.';

// Every assertion is a count, so no private filename or time can reach the test output.
test('private corpus: with the GML attached, times and directions are accepted on their own and reach Gemini XML to the second', { skip, timeout: 300000 }, async (t) => {
  const { photos, gml } = await readPhotoCorpus();
  const session = evidenceSession();
  try {
    // 1. Parse the JPEGs. 2. Attach the GML.
    session.importFiles(photos);
    const layer = session.createLayer();
    await settleExif(session, layer.id);
    await attachGml(session, layer.id, gml);
    const live = () => session.getLayerPhotos(layer.id);
    const total = photos.length;
    assert.equal(live().filter((photo) => photo.metadataEvidence.filter((item) => item.field === 'captureTime' && item.value).length === 2).length, total);
    assert.equal(live().filter((photo) => photo.metadataEvidence.some((item) => item.kind === 'exif' && item.field === 'captureTime' && item.value.precision === 'fraction')).length, total,
      'the corpus still exercises subseconds against whole seconds');

    // 3. No false conflicts, in acceptance or in the inspector.
    assert.equal(live().filter((photo) => photoMetadataConflict(photo, 'captureTime')).length, 0);
    // 4. All of them are accepted from GML, and both sources stay as evidence.
    assert.equal(live().filter((photo) => photo.captureMetadata.captureTime?.provenance.kind === 'gml'
      && photo.captureMetadata.captureTime.provenance.evidence.length === 2).length, total);
    assert.equal(live().filter((photo) => photoCaptureTimeStatus(photo) === 'Opptakstid kjent').length, total);

    // 5. GML direction: all zero in this corpus, which is an ordinary value.
    assert.equal(live().filter((photo) => photo.directionEvidence.filter((item) => item.kind === 'gml').length === 1).length, total);
    assert.equal(live().filter((photo) => photo.direction.current?.degrees === 0 && photo.direction.current.basis.kind === 'gml').length, total);

    // 6. Generate the export.
    assert.equal(acceptGmlPositions(session, layer.id).length, total);
    const plan = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layer.id), { profile: 'gemini-legacy2019' });
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.counts.features, total); assert.equal(plan.counts.missingTimestampCount, 0);
    const xml = serializePhotoExport(plan);
    assertGeminiConventions(xml);

    // 7. Every feature has the JPEG's own clock, read from the raw tag.
    assert.equal(xml.match(/<app:fotograferingstidspunkt>/g).length, total);
    const times = exportedTimes(xml);
    assert.equal(times.size, total);
    assert.equal(live().filter((photo) => times.get(photo.originalFilename) === exifClockToSecond(photo)).length, total);
    t.diagnostic(`${total} photos: 0 false conflicts, ${total} adoptable, ${total} exported times matching EXIF to the second`);
  } finally { session.clear(); }
});
