import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceSession, readRealExif, settleExif, tick } from './helpers/photoEvidenceFixtures.mjs';
import { completionGml, completionLayer, jpeg } from './helpers/photoCompletionFixtures.mjs';
import { EMPTY_GML_CAPTURE_DECISION } from '../src/lib/photos/photoGmlCaptureReconciliation.mjs';
import { saveStagedSource } from './helpers/photoSourceDraft.mjs';

// M3 of the FOTO capture-time plan: GML capture time is adopted only through the explicit decision made in the
// positioning wizard (Koblinger) or the import wizard (Kontroll with «Fra GML-fil»). Synthetic files only.
const exif = (clock) => ({ captureTime: clock });
const decision = (overrides = {}) => ({ ...EMPTY_GML_CAPTURE_DECISION, ...overrides });
const byName = (session, layerId) => Object.fromEntries(session.getLayerPhotos(layerId).map((photo) => [photo.originalFilename, photo]));
const timeOf = (photo) => photo.captureMetadata.captureTime;

// The wizard route: one ticket, a staged review, the plan the step rendered and the decision staged with «Ta med kilden» and saved with «Lagre endringer».
async function koblinger(session, layerId, features, filename = 'kilde.gml') {
  const ticket = session.beginSourceWorkflow(layerId);
  assert(await session.stageLayerSource(layerId, completionGml(features, filename)));
  const review = session.getSnapshot().sourceReviews[layerId];
  const plan = session.planLayerSourceCaptureTimes(layerId);
  return { ticket, review, plan, save: (choice = EMPTY_GML_CAPTURE_DECISION, usedPlan = plan) =>
    saveStagedSource(session, ticket, review, { captureTime: { ...choice, plan: usedPlan } }) };
}
const layerOf = (files) => completionLayer(files, { place: false });

test('positioning: saving a GML source with both options unchecked adopts no GML time, EXIF stays and directions follow GML', async () => {
  const { session, layerId } = await layerOf([jpeg('a.jpg', exif('2026:05:12 14:33:02')), jpeg('b.jpg'), jpeg('c.jpg')]);
  try {
    const before = byName(session, layerId);
    const step = await koblinger(session, layerId, [{ name: 'a.jpg', time: '2026-05-12T15:00:00', direction: '45' },
      { name: 'b.jpg', time: '2026-05-12T10:00:00', direction: '90' }, { name: 'c.jpg', time: '2026-05-12' }]);
    assert.deepEqual(step.plan.options, { complete: 1, partial: 1, partialHasMinute: false });
    assert.deepEqual(step.plan.conflicts.map((row) => row.filename), ['a.jpg']);
    assert.deepEqual(byName(session, layerId)['a.jpg'].metadataEvidence, before['a.jpg'].metadataEvidence, 'planning attaches nothing');
    assert.deepEqual(step.save(), { ok: true, captureTimeCount: 0 });
    const after = byName(session, layerId);
    assert.strictEqual(timeOf(after['a.jpg']), timeOf(before['a.jpg']));
    assert.deepEqual([timeOf(after['a.jpg']).provenance.kind, timeOf(after['a.jpg']).acceptance], ['exif', 'auto']);
    assert.equal(timeOf(after['b.jpg']), null); assert.equal(timeOf(after['c.jpg']), null);
    for (const name of ['a.jpg', 'b.jpg', 'c.jpg']) assert(after[name].metadataEvidence.some((item) => item.kind === 'gml' && item.field === 'captureTime'), `${name} keeps GML evidence`);
    assert.deepEqual([after['a.jpg'].direction.current.degrees, after['b.jpg'].direction.current.degrees], [45, 90], 'the direction policy is unchanged');
    assert.equal(session.getLayer(layerId).spatialSources.length, 1);
    // The declined values come back on a recheck as the same proposals; nothing became accepted in between.
    assert(session.recheckLayerSource(layerId, session.getLayer(layerId).spatialSources[0].id));
    const again = session.planLayerSourceCaptureTimes(layerId);
    assert.deepEqual([again.options.complete, again.options.partial, again.conflicts.length], [1, 1, 1]);
    session.endSourceWorkflow(step.ticket);
  } finally { session.clear(); }
});

test('positioning: complete and partial options are independent, and precision is kept exactly', async () => {
  for (const [choice, expected] of [
    [{ complete: true }, { 'b.jpg': '2026-05-12T10:00:00', 'c.jpg': null, 'd.jpg': null }],
    [{ partial: true }, { 'b.jpg': null, 'c.jpg': '2026-05-12', 'd.jpg': '2026-05-12T10:30' }],
    [{ complete: true, partial: true }, { 'b.jpg': '2026-05-12T10:00:00', 'c.jpg': '2026-05-12', 'd.jpg': '2026-05-12T10:30' }],
  ]) {
    const { session, layerId } = await layerOf([jpeg('b.jpg'), jpeg('c.jpg'), jpeg('d.jpg')]);
    try {
      const step = await koblinger(session, layerId, [{ name: 'b.jpg', time: '2026-05-12T10:00:00' }, { name: 'c.jpg', time: '2026-05-12' }, { name: 'd.jpg', time: '2026-05-12T10:30' }]);
      assert.deepEqual(step.plan.options, { complete: 1, partial: 2, partialHasMinute: true });
      assert(step.save(decision(choice)).ok);
      const photos = byName(session, layerId);
      for (const [name, iso] of Object.entries(expected)) assert.equal(timeOf(photos[name])?.value.iso ?? null, iso, `${name} ${JSON.stringify(choice)}`);
      for (const photo of Object.values(photos).filter(timeOf)) {
        assert.deepEqual([timeOf(photo).provenance.kind, timeOf(photo).provenance.via, timeOf(photo).acceptance, timeOf(photo).value.offset],
          ['gml', 'positioning-wizard', undefined, null], 'an explicit choice, with no offset invented');
        assert.equal(timeOf(photo).provenance.sourceFilename, 'kilde.gml');
      }
      if (expected['c.jpg']) assert.equal(timeOf(photos['c.jpg']).value.precision, 'date');
      if (expected['d.jpg']) assert.equal(timeOf(photos['d.jpg']).value.precision, 'minute');
      session.endSourceWorkflow(step.ticket);
    } finally { session.clear(); }
  }
});

test('positioning: an approved filename date is completed by a compatible GML time only after approval, and a different date is a conflict', async () => {
  const session = evidenceSession();
  try {
    session.beginImport();
    session.importFiles([jpeg('KUM12_20260512.jpg'), jpeg('KUM13_20260513.jpg')]);
    while (session.getSnapshot().photos.some((photo) => photo.spatial.exifRead.state === 'pending')) await tick();
    const placement = { kind: 'none' };
    const preview = session.previewImport({ placement });
    const { layer } = session.completeImport({ placement, preview, captureSuggestions: { complete: false, dateOnly: true } });
    const filename = timeOf(byName(session, layer.id)['KUM12_20260512.jpg']);
    assert.deepEqual([filename.provenance.kind, filename.value.iso], ['filename', '2026-05-12']);
    const features = [{ name: 'KUM12_20260512.jpg', time: '2026-05-12T14:33:02' }, { name: 'KUM13_20260513.jpg', time: '2026-05-14T08:00:00' }];
    const declined = await koblinger(session, layer.id, features);
    assert.deepEqual(declined.plan.completions.map((row) => [row.filename, row.option]), [['KUM12_20260512.jpg', 'complete']], 'a date → time transition is a completion, not a conflict');
    assert.deepEqual(declined.plan.conflicts.map((row) => row.filename), ['KUM13_20260513.jpg']);
    session.cancelLayerSourceReview(layer.id); session.endSourceWorkflow(declined.ticket);
    const step = await koblinger(session, layer.id, features);
    assert.deepEqual(step.save(decision({ complete: true })), { ok: true, captureTimeCount: 1 });
    const photos = byName(session, layer.id);
    assert.deepEqual([timeOf(photos['KUM12_20260512.jpg']).value.iso, timeOf(photos['KUM12_20260512.jpg']).provenance.kind], ['2026-05-12T14:33:02', 'gml']);
    assert.equal(timeOf(photos['KUM13_20260513.jpg']).provenance.kind, 'filename', 'the conflict keeps the current value by default');
    session.endSourceWorkflow(step.ticket);
  } finally { session.clear(); }
});

test('positioning: manual, estimated, earlier-GML and removed values are protected; only «Bruk GML» replaces, and never a removal', async () => {
  for (const conflicts of ['keep', 'gml']) {
    const { session, layerId, ids: [manual, partial, estimated, earlier, cleared] } = await layerOf(['manual', 'partial', 'estimated', 'earlier', 'cleared'].map((name) => jpeg(`${name}.jpg`)));
    try {
      session.setCaptureMetadata(layerId, [manual], 'captureTime', '2026-05-12T09:00:00');
      session.setCaptureMetadata(layerId, [partial], 'captureTime', '2026-05-12');
      session.setCaptureMetadata(layerId, [estimated], 'captureTime', '2026-05-12', { estimated: true });
      session.setCaptureMetadata(layerId, [cleared], 'captureTime', null);
      const first = await koblinger(session, layerId, [{ name: 'earlier.jpg', time: '2026-05-12T07:00:00' }], 'first.gml');
      assert(first.save(decision({ complete: true })).ok);
      session.endSourceWorkflow(first.ticket);
      const before = Object.fromEntries([manual, partial, estimated, earlier, cleared].map((id) => [id, session.getPhoto(id).captureMetadata]));
      const step = await koblinger(session, layerId, ['manual', 'partial', 'estimated', 'earlier', 'cleared'].map((name) => ({ name: `${name}.jpg`, time: '2026-05-12T14:33:02' })), 'second.gml');
      assert.deepEqual([step.plan.options.complete, step.plan.options.partial], [0, 0], 'no protected value is reachable through an option');
      assert.deepEqual(step.plan.conflicts.map((row) => row.assetId).sort(), [manual, earlier].sort());
      assert.deepEqual(step.plan.reviewRows.map((row) => [row.assetId, row.reason]).sort(), [[estimated, 'can-replace-estimate'], [partial, 'can-complete']].sort());
      assert.deepEqual(step.plan.unchanged.find((row) => row.assetId === cleared).reason, 'capture-time-cleared');
      assert(step.save(decision({ complete: true, partial: true, conflicts })).ok);
      for (const id of [manual, partial, estimated, earlier]) {
        if (conflicts === 'keep') assert.strictEqual(session.getPhoto(id).captureMetadata, before[id], `${id} is kept`);
        else assert.deepEqual([timeOf(session.getPhoto(id)).value.iso, timeOf(session.getPhoto(id)).provenance.sourceFilename], ['2026-05-12T14:33:02', 'second.gml']);
      }
      assert.strictEqual(session.getPhoto(cleared).captureMetadata, before[cleared], 'a removal is never undone');
      assert.equal(session.getPhoto(cleared).captureMetadata.captureTimeCleared, true);
      session.endSourceWorkflow(step.ticket);
    } finally { session.clear(); }
  }
});

test('positioning: ambiguous references propose nothing and change no time', async () => {
  const { session, layerId, ids: [a] } = await layerOf([jpeg('a.jpg')]);
  try {
    const step = await koblinger(session, layerId, [{ name: 'a.jpg', time: '2026-05-12T10:00:00' }, { name: 'a.jpg', time: '2026-05-12T11:00:00' }]);
    assert.deepEqual(step.plan.ambiguous.map((row) => [row.assetId, row.reason]), [[a, 'duplicate-gml-reference']]);
    assert.deepEqual([step.plan.options.complete, step.plan.options.partial, step.plan.conflicts.length], [0, 0, 0]);
    assert.deepEqual(step.save(decision({ complete: true, partial: true, conflicts: 'gml' })), { ok: true, captureTimeCount: 0 });
    assert.equal(timeOf(session.getPhoto(a)), null);
    session.endSourceWorkflow(step.ticket);
  } finally { session.clear(); }
});

test('positioning: pending EXIF holds a GML time back, and the EXIF value is adopted after the read', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const session = evidenceSession({ extractGps: async (file) => { await gate; return readRealExif(file); } });
  try {
    const [id] = session.importFiles([jpeg('a.jpg', exif('2026:05:12 14:33:02'))]).acceptedIds;
    const layerId = session.createLayer().id;
    const step = await koblinger(session, layerId, [{ name: 'a.jpg', time: '2026-05-12T15:00:00' }]);
    assert.deepEqual([step.plan.pending.length, step.plan.options.complete], [1, 0]);
    assert.deepEqual(step.save(decision({ complete: true, partial: true })), { ok: true, captureTimeCount: 0 });
    assert.equal(timeOf(session.getPhoto(id)), null);
    release();
    await settleExif(session, layerId);
    assert.deepEqual([timeOf(session.getPhoto(id)).provenance.kind, timeOf(session.getPhoto(id)).value.iso], ['exif', '2026-05-12T14:33:02']);
    session.endSourceWorkflow(step.ticket);
  } finally { session.clear(); }
});

test('positioning: stale or foreign plans are refused with review-changed and nothing is attached', async () => {
  const { session, layerId, ids: [a, b] } = await layerOf([jpeg('a.jpg'), jpeg('b.jpg')]);
  try {
    const features = [{ name: 'a.jpg', time: '2026-05-12T10:00:00' }, { name: 'b.jpg', time: '2026-05-12T11:00:00' }];
    const step = await koblinger(session, layerId, features);
    session.setCaptureMetadata(layerId, [b], 'captureTime', '2026-05-12T11:00:05');
    assert.deepEqual(step.save(decision({ complete: true })), { ok: false, error: 'review-changed' });
    assert.equal(session.getLayer(layerId).spatialSources.length, 0, 'the source is not saved either');
    assert.equal(timeOf(session.getPhoto(a)), null);
    // A decision without the plan it was made from, or a plan for another review, is refused too.
    assert.deepEqual(saveStagedSource(session, step.ticket, step.review, { captureTime: decision({ complete: true }) }), { ok: false, error: 'review-changed' });
    const forged = { ...step.plan };
    assert.deepEqual(step.save(decision({ complete: true }), forged), { ok: false, error: 'review-changed' });
    session.cancelLayerSourceReview(layerId); session.endSourceWorkflow(step.ticket);
    const fresh = await koblinger(session, layerId, features);
    assert.deepEqual(fresh.save(decision({ complete: true }), step.plan), { ok: false, error: 'review-changed' }, 'a plan for a discarded review');
    assert.deepEqual(fresh.save(decision({ complete: true })), { ok: true, captureTimeCount: 1 });
    assert.equal(timeOf(session.getPhoto(a)).value.iso, '2026-05-12T10:00:00');
    assert.equal(timeOf(session.getPhoto(b)).provenance.kind, 'manual');
    session.endSourceWorkflow(fresh.ticket);
  } finally { session.clear(); }
});

test('positioning: repeated saves and rechecks are idempotent, and original bytes and filenames never change', async () => {
  const { session, layerId, ids: [a] } = await layerOf([jpeg('a.jpg')]);
  try {
    const bytes = new Uint8Array(await session.getFile(a).arrayBuffer()), file = session.getFile(a);
    const step = await koblinger(session, layerId, [{ name: 'a.jpg', time: '2026-05-12T10:00:00' }]);
    assert(step.save(decision({ complete: true })).ok);
    const accepted = session.getPhoto(a).captureMetadata;
    for (let turn = 0; turn < 2; turn++) {
      assert(session.recheckLayerSource(layerId, session.getLayer(layerId).spatialSources[0].id));
      const plan = session.planLayerSourceCaptureTimes(layerId);
      assert.deepEqual(plan.unchanged.map((row) => row.reason), ['already-accepted']);
      assert.deepEqual(saveStagedSource(session, step.ticket, session.getSnapshot().sourceReviews[layerId],
        { captureTime: { ...decision({ complete: true, partial: true, conflicts: 'gml' }), plan } }), { ok: true, captureTimeCount: 0 });
      assert.strictEqual(session.getPhoto(a).captureMetadata, accepted);
    }
    assert.strictEqual(session.getFile(a), file);
    assert.deepEqual(new Uint8Array(await session.getFile(a).arrayBuffer()), bytes);
    assert.equal(session.getPhoto(a).originalFilename, 'a.jpg');
    session.endSourceWorkflow(step.ticket);
  } finally { session.clear(); }
});

// Import wizard, «Fra GML-fil»
async function importDraft(files, features, options = {}, targetLayerId = null) {
  const session = options.session || evidenceSession(options);
  session.beginImport(targetLayerId);
  const ids = session.importFiles(files).acceptedIds;
  assert(await session.importPositioningGml(completionGml(features)));
  return { session, ids };
}
const settled = async (session) => { while (session.getSnapshot().photos.some((photo) => photo.spatial.exifRead.state === 'pending')) await tick(); };
const gmlPlacement = { kind: 'gml', exifFallback: false };
const finish = (session, gmlCaptureTime, preview = session.previewImport({ placement: gmlPlacement })) =>
  ({ preview, result: session.completeImport({ placement: gmlPlacement, preview, gmlCaptureTime }) });

test('import: unchecked keeps EXIF and leaves empty values empty; each choice applies only its own rows before the first publication', async () => {
  for (const [choice, a, b, c] of [
    [null, 'exif', null, null],
    [decision(), 'exif', null, null],
    [decision({ complete: true }), 'exif', '2026-05-12T10:00:00', null],
    [decision({ partial: true }), 'exif', null, '2026-05-12'],
    [decision({ conflicts: 'gml' }), 'gml', null, null],
  ]) {
    const { session } = await importDraft([jpeg('a.jpg', exif('2026:05:12 14:33:02')), jpeg('b.jpg'), jpeg('c.jpg')],
      [{ name: 'a.jpg', time: '2026-05-12T15:00:00', direction: '45' }, { name: 'b.jpg', time: '2026-05-12T10:00:00' }, { name: 'c.jpg', time: '2026-05-12' }]);
    try {
      await settled(session);
      const seen = [];
      const unsubscribe = session.subscribe(() => { const layer = session.getSnapshot().photoLayers[0]; if (layer && !seen.length) seen.push(byName(session, layer.id)); });
      const { preview, result } = finish(session, choice);
      unsubscribe();
      assert.deepEqual(preview.gmlCaptureTimes.conflicts.map((row) => [row.filename, row.current.class]), [['a.jpg', 'exif-auto']], 'EXIF is compared as it will be kept');
      assert(result.ok);
      const photos = byName(session, result.layer.id);
      assert.equal(timeOf(photos['a.jpg']).provenance.kind, a);
      if (a === 'gml') assert.equal(timeOf(photos['a.jpg']).value.iso, '2026-05-12T15:00:00');
      assert.equal(timeOf(photos['b.jpg'])?.value.iso ?? null, b);
      assert.equal(timeOf(photos['c.jpg'])?.value.iso ?? null, c);
      for (const photo of Object.values(photos).filter((item) => timeOf(item)?.provenance.kind === 'gml')) assert.equal(timeOf(photo).provenance.via, 'import-wizard');
      assert.equal(photos['a.jpg'].direction.current.degrees, 45);
      assert.deepEqual(Object.fromEntries(Object.entries(seen[0]).map(([name, photo]) => [name, timeOf(photo)?.provenance.kind ?? null])),
        Object.fromEntries(Object.entries(photos).map(([name, photo]) => [name, timeOf(photo)?.provenance.kind ?? null])), 'the first publication already has the chosen values');
    } finally { session.clear(); }
  }
});

test('import: filename and GML choices never write the same photo, and both apply together', async () => {
  const { session } = await importDraft([jpeg('20260512_101010.jpg'), jpeg('20260513_101010.jpg')], [{ name: '20260512_101010.jpg', time: '2026-05-12T10:10:11' }]);
  try {
    await settled(session);
    const preview = session.previewImport({ placement: gmlPlacement });
    assert.deepEqual(preview.captureSuggestions.complete.map((item) => item.filename), ['20260513_101010.jpg']);
    assert.deepEqual(preview.gmlCaptureTimes.fill.map((row) => row.filename), ['20260512_101010.jpg']);
    const result = session.completeImport({ placement: gmlPlacement, preview, captureSuggestions: { complete: true, dateOnly: true }, gmlCaptureTime: decision({ complete: true }) });
    assert(result.ok);
    const photos = byName(session, result.layer.id);
    assert.deepEqual([timeOf(photos['20260512_101010.jpg']).provenance.kind, timeOf(photos['20260512_101010.jpg']).value.iso], ['gml', '2026-05-12T10:10:11']);
    assert.equal(timeOf(photos['20260513_101010.jpg']).provenance.kind, 'filename');
  } finally { session.clear(); }
});

test('import: pending EXIF refuses a GML choice, a changed draft is review-changed, and cancelling leaves nothing', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pending = await importDraft([jpeg('a.jpg')], [{ name: 'a.jpg', time: '2026-05-12T10:00:00' }], { extractGps: async (file) => { await gate; return readRealExif(file); } });
  try {
    const preview = pending.session.previewImport({ placement: { kind: 'none' } });
    assert.equal(preview.gmlCaptureTimes.pending.length, 1);
    assert.deepEqual(pending.session.completeImport({ placement: { kind: 'none' }, preview, gmlCaptureTime: decision({ complete: true }) }), { ok: false, error: 'pending-exif' });
    assert.equal(pending.session.getSnapshot().photoLayers.length, 0);
    release(); await settled(pending.session);
  } finally { pending.session.clear(); }

  const { session, ids: [a] } = await importDraft([jpeg('a.jpg'), jpeg('b.jpg')], [{ name: 'a.jpg', time: '2026-05-12T10:00:00' }, { name: 'b.jpg', time: '2026-05-12T11:00:00' }]);
  try {
    await settled(session);
    const preview = session.previewImport({ placement: gmlPlacement });
    session.setCaptureMetadata(null, [a], 'captureTime', '2026-05-12T09:00:00');
    assert.deepEqual(finish(session, decision({ complete: true }), preview).result, { ok: false, error: 'review-changed' });
    assert.equal(session.getSnapshot().photoLayers.length, 0);
    session.cancelImport();
    assert.equal(session.getSnapshot().photos.length, 0);
    assert.equal(session.getSnapshot().photoLayers.length, 0);
  } finally { session.clear(); }
});

test('import: appending changes only the new photos, and ambiguous references write nothing', async () => {
  const { session, layerId, ids: [existing] } = await layerOf([jpeg('a.jpg', exif('2026:05:12 14:33:02'))]);
  try {
    const before = session.getPhoto(existing).captureMetadata;
    await importDraft([jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')], [{ name: 'a.jpg', time: '2026-05-12T15:00:00' }, { name: 'b.jpg', time: '2026-05-12T10:00:00' },
      { name: 'c.jpg', time: '2026-05-12T10:00:00' }, { name: 'c.jpg', time: '2026-05-12T11:00:00' }], { session }, layerId);
    await settled(session);
    const { preview, result } = finish(session, decision({ complete: true, partial: true, conflicts: 'gml' }));
    assert.deepEqual(preview.gmlCaptureTimes.ambiguous.map((row) => row.filename), ['c.jpg']);
    assert(result.ok && result.append);
    const photos = session.getLayerPhotos(layerId);
    assert.strictEqual(session.getPhoto(existing).captureMetadata, before, 'a photo already in the layer is never touched');
    assert.equal(timeOf(photos.find((photo) => photo.originalFilename === 'b.jpg')).value.iso, '2026-05-12T10:00:00');
    assert.equal(timeOf(photos.find((photo) => photo.originalFilename === 'c.jpg')), null);
  } finally { session.clear(); }
});
