import assert from 'node:assert/strict';
import test from 'node:test';
import { corpusGmlPath, readPhotoCorpus } from './helpers/photoCorpusFixtures.mjs';
import { acceptGmlPositions, attachGml, evidenceSession, settleExif } from './helpers/photoEvidenceFixtures.mjs';
import { diagnosticKey } from './helpers/photoExportMatrix.mjs';
import { buildPhotoExportPlan, capturePhotoExportSnapshot } from '../src/lib/photos/export/photoExportPlan.mjs';
import { photoExportReadiness } from '../src/lib/photos/export/photoExportReadiness.mjs';

const skip = !corpusGmlPath && 'PHOTO_GML_FIXTURE is not set; the private corpus is opt-in.';
const NOW = Date.UTC(2026, 10, 5);

// Counts only, so no private value reaches test output.
test('private corpus: readiness tells the same story as the plan at each step', { skip, timeout: 300000 }, async (t) => {
  const { photos, gml } = await readPhotoCorpus();
  const session = evidenceSession();
  try {
    session.importFiles(photos);
    const layer = session.createLayer();
    await settleExif(session, layer.id);
    await attachGml(session, layer.id, gml);
    const total = photos.length, gemini = { profile: 'gemini-legacy2019', now: NOW };
    const readiness = (configuration = gemini) => photoExportReadiness(session.getLayerPhotos(layer.id), configuration);
    const keys = (items) => items.map(diagnosticKey).sort();
    const parity = async (configuration = gemini) => assert.deepEqual(keys(readiness(configuration).blocking),
      keys((await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layer.id), configuration)).errors));

    assert.equal(readiness().counts.excluded, total); assert.deepEqual(readiness().blocking.map((item) => item.code), ['no-placed-photos']);
    await parity();

    assert.equal(acceptGmlPositions(session, layer.id).length, total);
    const finished = readiness();
    assert.equal(finished.status, 'ready', 'every value came from the sources, with nothing to adopt');
    assert.deepEqual(finished.blocking, []);
    assert.equal(finished.levels.generation, 'possible'); assert.equal(finished.levels.schema.met, true);
    assert.equal(finished.tasks.captureTime.counts.accepted, total);
    assert.equal(finished.tasks.direction.counts.accepted, total);
    assert.equal(finished.tasks.direction.counts.defaulted, 0);
    assert.deepEqual(finished.recommendations, []);
    await parity();
    await parity({ profile: 'legacy2019', crs: 'EPSG:25832' });
    t.diagnostic(`${total} photos: readiness and plan agree at every step`);
  } finally { session.clear(); }
});
