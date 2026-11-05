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
    const before = readiness();
    assert.equal(before.status, 'blocked');
    assert.equal(before.blocking.filter((item) => item.code === 'direction-required').length, total, 'unaccepted GML 0° does not pass');
    assert.equal(before.tasks.captureTime.counts.adoptable, total);
    assert.equal(before.tasks.captureTime.items.filter((item) => item.sourcesAgree).length, total);
    assert.equal(before.tasks.direction.counts['zero-review'], total);
    assert.equal(before.notes.find((note) => note.code === 'capture-time-in-source').message, `${total} bilder mangler opptakstid, men tiden finnes i EXIF.`);
    assert.deepEqual(before.levels.schema.gaps.map((gap) => [gap.field, gap.count]), [['captureTime', total], ['direction', total]]);
    await parity();
    await parity({ profile: 'legacy2019', crs: 'EPSG:25832' });

    assert.equal(session.adoptSourceEvidence(layer.id, 'direction', 'gml', null, { includeZero: true }).counts.adopted, total);
    const directed = readiness();
    assert.equal(directed.status, 'schema-gap', 'generation is possible, and the schema gap is reported');
    assert.equal(directed.levels.generation, 'possible');
    assert.deepEqual(directed.levels.importEvidence.deviations, [{ field: 'captureTime', state: 'unconfirmed', count: total, referenceOnly: true }]);
    assert.equal(directed.recommendations.find((item) => item.code === 'direction-all-zero').count, total);
    await parity();

    assert.equal(session.adoptSourceEvidence(layer.id, 'captureTime', 'exif').counts.adopted, total);
    const finished = readiness();
    assert.equal(finished.status, 'recommendations'); assert.equal(finished.levels.schema.met, true);
    assert.equal(finished.tasks.captureTime.counts.accepted, total);
    assert.deepEqual(finished.recommendations.map((item) => item.code), ['direction-all-zero']);
    await parity();
    t.diagnostic(`${total} photos: readiness and plan agree at every step`);
  } finally { session.clear(); }
});
