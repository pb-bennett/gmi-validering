import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptPhotoCandidate, createPhotoCandidate, emptySpatial, immutable, photoSpatialCounts } from '../src/lib/photos/photoSpatial.mjs';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';

const position = { crs: 'EPSG:4326', longitude: 10.43, latitude: 59.22 };
const candidate = (id, kind = 'gml') => createPhotoCandidate({ id, kind, status: 'viable', position, raw: { coordinates: [1, 2, 0] } });
const until = async (condition) => { for (let i = 0; i < 500; i++) { if (condition()) return; await new Promise((resolve) => setImmediate(resolve)); } assert.fail('Timed out'); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const gps = { state: 'viable', errorCode: null, candidate: { status: 'viable', position: { ...position, longitude: 12 }, raw: { GPSLatitude: [59, 0, 0] } } };
const source = { entries: [{ ...candidate('entry-1'), raw: { fotolink: 'Attachments/a.jpg', coordinates: [1, 2, 0] } }], issues: [] };
function setup(options = {}) {
  let index = 0;
  return createPhotoSession({ createId: () => `id-${++index}`, createThumbnail: async () => ({ dimensions: { width: 10, height: 10 }, thumbnailBlob: new Blob(['thumb']) }), extractGps: async () => gps, parseGml: async () => source, yieldJob: () => new Promise((resolve) => setImmediate(resolve)), ...options });
}
const image = () => new File(['source'], 'a.jpg', { type: 'image/jpeg' });

test('candidate evidence is deeply immutable; acceptance changes only current and keeps both sources', () => {
  const input = { ...emptySpatial(), candidates: Object.freeze([candidate('g'), candidate('e', 'exif')]) };
  assert.equal(input.current, null);
  const accepted = acceptPhotoCandidate(input, 'e', 'explicit-candidate', 123);
  assert.strictEqual(accepted.candidates, input.candidates);
  assert.equal(accepted.current.basis.candidateId, 'e');
  assert.equal(accepted.current.acceptedAt, 123);
  assert.throws(() => { accepted.candidates[0].raw.coordinates[0] = 99; }, TypeError);
  assert.equal(acceptPhotoCandidate(input, 'missing'), null);
  assert.throws(() => createPhotoCandidate({ id: 'x', kind: 'gml', status: 'viable', position: { ...position, latitude: 900 } }));
  assert.deepEqual(photoSpatialCounts([{ spatial: input }, { spatial: accepted }]), { placedCount: 1, unplacedCount: 1, exifCandidateCount: 2 });
});

for (const order of ['gps-first', 'thumbnail-first']) for (const thumbnailError of [false, true]) {
  test(`latest-record merges preserve GML/current and EXIF with ${order}, thumbnail error=${thumbnailError}`, async () => {
    const thumb = deferred(), metadata = deferred();
    let thumbStarted = false, gpsStarted = false;
    const session = setup({ createThumbnail: () => { thumbStarted = true; return thumb.promise; }, extractGps: () => { gpsStarted = true; return metadata.promise; } });
    const id = session.importFiles([image()]).acceptedIds[0];
    await until(() => thumbStarted && gpsStarted);
    await session.importPositioningGml(new File(['gml'], 'p.gml'));
    const layer = session.createLayer();
    assert.equal(session.getPhoto(id).spatial.current.basis.candidateId.includes('entry-1'), true);
    const finishThumb = () => thumbnailError ? thumb.reject(new Error('decode')) : thumb.resolve({ dimensions: { width: 10, height: 10 }, thumbnailBlob: new Blob(['thumb']) });
    if (order === 'gps-first') {
      metadata.resolve(gps);
      await until(() => session.getPhoto(id).spatial.exifRead.state === 'viable');
      session.acceptCandidates(layer.id, [{ photoId: id, candidateId: `${id}:exif` }]);
      finishThumb();
    } else {
      finishThumb();
      await until(() => session.getPhoto(id).preview.state !== 'pending');
      metadata.resolve(gps);
    }
    await until(() => session.getPhoto(id).preview.state !== 'pending' && session.getPhoto(id).spatial.exifRead.state === 'viable');
    const photo = session.getPhoto(id);
    assert.equal(photo.spatial.candidates.length, 2);
    assert.equal(photo.spatial.current.basis.candidateId, order === 'gps-first' ? `${id}:exif` : photo.spatial.candidates.find((item) => item.kind === 'gml').id);
    assert.equal(photo.preview.state, thumbnailError ? 'error' : 'ready');
    assert.equal(session.getLayer(layer.id).placedCount, 1);
    session.clear();
  });
}

test('EXIF-only remains unplaced; batch-ready owner-scoped API accepts once and preserves originals', async () => {
  const session = setup();
  const original = image();
  const ids = session.importFiles([original, image()]).acceptedIds;
  const layer = session.createLayer();
  await until(() => session.getLayer(layer.id).exifCandidateCount === 2);
  assert.equal(session.getLayer(layer.id).placedCount, 0);
  const oldCandidates = session.getPhoto(ids[0]).spatial.candidates;
  const accepted = session.acceptCandidates(layer.id, ids.map((photoId) => ({ photoId, candidateId: `${photoId}:exif` })));
  assert.deepEqual(accepted, ids);
  assert.equal(session.getLayer(layer.id).placedCount, 2);
  assert.strictEqual(session.getPhoto(ids[0]).spatial.candidates, oldCandidates);
  assert.strictEqual(session.getFile(ids[0]), original);
  assert.deepEqual(session.acceptCandidates('other-owner', [{ photoId: ids[0], candidateId: `${ids[0]}:exif` }]), []);
  session.clear();
});

for (const action of ['remove', 'cancel', 'delete', 'clear']) test(`late EXIF cannot resurrect after ${action}`, async () => {
  const metadata = deferred(); let started = false;
  const session = setup({ extractGps: () => { started = true; return metadata.promise; } });
  const id = session.importFiles([image()]).acceptedIds[0];
  await until(() => started);
  if (action === 'remove') { session.toggleBatchSelection(id); session.removeSelected(); }
  if (action === 'cancel') session.cancelImport();
  if (action === 'delete') session.deleteLayer(session.createLayer().id);
  if (action === 'clear') session.clear();
  metadata.resolve(gps);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.getPhoto(id), null);
  session.clear();
});

test('metadata is bounded, transfer survives another draft cancel, deleted work does not block future jobs', async () => {
  let active = 0, maximum = 0;
  const pending = [];
  const session = setup({ extractGps: () => { maximum = Math.max(maximum, ++active); return new Promise((resolve) => pending.push(() => { active--; resolve(gps); })); } });
  const ids = session.importFiles([image(), image()]).acceptedIds;
  await until(() => pending.length === 1);
  const layer = session.createLayer();
  session.beginImport(); session.importFiles([image()]); session.cancelImport();
  pending.shift()();
  await until(() => pending.length === 1);
  pending.shift()();
  await until(() => session.getLayer(layer.id).exifCandidateCount === 2);
  assert.equal(maximum, 1);
  assert(ids.every((id) => session.getPhoto(id).spatial.current === null));
  session.clear();
});

test('staged GML replacement is transactional; creation waits; owner invalidates a late parse', async () => {
  const old = immutable(source), parse = deferred();
  const session = setup({ parseGml: (file) => file.name === 'old.gml' ? Promise.resolve(old) : parse.promise });
  session.importFiles([image()]);
  await session.importPositioningGml(new File(['x'], 'old.gml'));
  const pending = session.importPositioningGml(new File(['x'], 'new.gml'));
  assert.equal(session.createLayer(), null);
  parse.reject(Object.assign(new Error('bad'), { code: 'invalid-xml' }));
  assert.equal(await pending, false);
  assert.equal(session.getSnapshot().positioning.source.filename, 'old.gml');
  assert.equal(session.createLayer(), null);
  session.discardPositioningError();
  const layer = session.createLayer();
  assert.equal(layer.placedCount, 1);
  assert.equal(layer.spatialSources[0].filename, 'old.gml');
  session.clear();

  const late = deferred();
  const other = setup({ parseGml: () => late.promise });
  const request = other.importPositioningGml(new File(['x'], 'late.gml'));
  other.cancelImport(); late.resolve(source);
  assert.equal(await request, false);
  assert.equal(other.getSnapshot().positioning.source, null);
});

test('curation rematches sources; unresolved rows transfer as diagnostics without photo assets', async () => {
  const session = setup();
  await session.importPositioningGml(new File(['x'], 'source.gml'));
  assert.equal(session.getSnapshot().positioning.ledger.summary.unmatchedCount, 1);
  const ids = session.importFiles([image(), image()]).acceptedIds;
  assert.equal(session.getSnapshot().positioning.ledger.summary.ambiguousCount, 1);
  session.toggleBatchSelection(ids[0]); session.removeSelected();
  assert.equal(session.getSnapshot().positioning.ledger.summary.matchedCount, 1);
  const layer = session.createLayer();
  assert.deepEqual(layer.photoIds, [ids[1]]);
  assert.equal(layer.placedCount, 1);
  session.deleteLayer(layer.id);
  assert.equal(session.getLayer(layer.id), null);
  assert.equal(session.getPhoto(ids[1]), null);
});
