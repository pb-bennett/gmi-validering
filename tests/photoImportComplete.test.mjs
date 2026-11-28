import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { completionGml } from './helpers/photoCompletionFixtures.mjs';
import { evidenceSession } from './helpers/photoEvidenceFixtures.mjs';
const tick = () => new Promise((resolve) => setImmediate(resolve));
const position = { crs: 'EPSG:4326', latitude: 60, longitude: 10 };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
async function setup(options = {}) {
  let id = 0;
  const session = createPhotoSession({ createId: () => String(++id), yieldJob: tick,
    createThumbnail: async () => ({ thumbnailBlob: new Blob(['x']), dimensions: { width: 2, height: 2 } }),
    extractGps: async () => ({ state: 'viable', candidate: { status: 'viable', position } }),
    parseGml: async () => ({ entries: [{ id: 'g', reference: 'a.jpg', status: 'viable', position }], issues: [] }), ...options });
  session.beginImport(); session.importFiles([new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);
  for (let i = 0; i < 100 && session.getSnapshot().photos.some((p) => p.spatial.exifRead.state === 'pending'); i++) await tick();
  return session;
}
test('switching GMI to GML and GML to EXIF preserves photos and invalidates pending reads', async () => {
 const lateGmi = deferred(), lateGml = deferred();
 const session = await setup({ parseGml: (file) => file.name === 'late.gml' ? lateGml.promise : { entries: [], issues: [] } });
 const photos = session.getSnapshot().photos.map((photo) => photo.id), file = session.getFile(photos[0]);
 const pendingGmi = session.setDraftGmiSource({ read: () => lateGmi.promise });
 session.clearDraftGmiSource(); session.clearDraftPositioningGml();
 assert(await session.importPositioningGml(new File(['x'], 'chosen.gml')));
 lateGmi.resolve({ references: [] }); assert.equal(await pendingGmi, false);
 assert.equal(session.getSnapshot().loadedImport, null);
 assert.equal(session.getSnapshot().positioning.source.filename, 'chosen.gml');
 const pendingGml = session.importPositioningGml(new File(['x'], 'late.gml'));
 session.clearDraftGmiSource(); session.clearDraftPositioningGml();
 lateGml.resolve({ entries: [], issues: [] }); assert.equal(await pendingGml, false);
 assert.equal(session.getSnapshot().positioning.state, 'empty');
 assert.deepEqual(session.getSnapshot().photos.map((photo) => photo.id), photos); assert.equal(session.getFile(photos[0]), file);
 const placement = { kind: 'exif' }, preview = session.previewImport({ placement });
 assert.equal(session.completeImport({ placement, preview }).ok, true); session.clear();
});
for (const kind of ['gmi', 'gml']) test(`replacement ${kind.toUpperCase()} wins over an older pending read`, async () => {
 const late = deferred();
 const session = await setup({ parseGml: (file) => file.name === 'late.gml' ? late.promise : { entries: [], issues: [] } });
 const before = session.getSnapshot().photos.map((photo) => photo.id);
 const pending = kind === 'gmi' ? session.setDraftGmiSource({ read: () => late.promise }) : session.importPositioningGml(new File(['x'], 'late.gml'));
 if (kind === 'gmi') await session.setDraftGmiSource({ file: gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }], 'replacement.gmi') });
 else await session.importPositioningGml(new File(['x'], 'replacement.gml'));
 const chosen = kind === 'gmi' ? session.getSnapshot().loadedImport.source : session.getSnapshot().positioning.source;
 late.resolve({ references: [], entries: [], issues: [] }); assert.equal(await pending, false);
 assert.equal((kind === 'gmi' ? session.getSnapshot().loadedImport.source : session.getSnapshot().positioning.source), chosen);
 assert.equal(chosen.filename, `replacement.${kind}`); assert.deepEqual(session.getSnapshot().photos.map((photo) => photo.id), before);
 assert.equal(session.getSnapshot().photoLayers.length, 0); session.clear();
});
for (const kind of ['none', 'exif', 'gml', 'gmi']) test(`${kind}: preview/commit parity and workspace-owned files`, async () => {
  const session = await setup();
  if (kind === 'gml') await session.importPositioningGml(new File(['x'], 'p.gml'));
  if (kind === 'gmi') await session.setDraftGmiSource({ file: gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }, { hyperlink: 'h:1(link:"a.jpg") ' }]) });
  const loadedReview = kind === 'gmi' ? session.reviewLoadedGmiImport() : null;
  const placement = { kind };
  const preview = session.previewImport({ loadedReview, placement });
  const result = session.completeImport({ loadedReview, placement, preview });
  assert(result.ok); assert.equal(result.outcome.placed, preview.outcome.placed); assert.equal(result.outcome.total, preview.outcome.total);
  assert.equal(result.outcome.placed, kind === 'none' ? 0 : 1);
  assert.equal(result.delivery?.gml ?? 0, preview.delivery?.gml ?? 0);
  assert.equal(result.delivery?.gml ?? 0, ['exif', 'gml'].includes(kind) ? 1 : 0);
  assert(session.getFile(result.layer.photoIds[0]));
  if (kind === 'gmi') assert.equal(result.layer.photoIds.length, 2);
  session.clear();
});
test('attach and switch draft sources preserve files; stale review, cancel and reset cannot write', async () => {
  for (const change of ['selection', 'cancel', 'reset', 'source']) {
    const session = await setup(); const ids = session.getSnapshot().photos.map((p) => p.id);
    await session.setDraftGmiSource({ file: gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }]) });
    assert.deepEqual(session.getSnapshot().photos.map((p) => p.id), ids);
    session.clearDraftGmiSource(); assert(session.getFile(ids[0]));
    const placement = { kind: 'exif' }, preview = session.previewImport({ placement });
    if (change === 'selection') session.importFiles([new File(['b'], 'b.jpg', { type: 'image/jpeg' })]);
    if (change === 'cancel') session.cancelImport();
    if (change === 'reset') session.clear();
    if (change === 'source') await session.importPositioningGml(new File(['g'], 'p.gml'));
    const result = session.completeImport({ placement, preview });
    assert.equal(result.ok, false);
    assert.equal('delivery' in result, false);
    assert.equal(session.getSnapshot().photoLayers.length, 0); session.clear();
  }
});
test('append preserves already placed occurrences and applies positions only to unplaced occurrences', async () => {
  const session = await setup(); const placement = { kind: 'exif' };
  const first = session.completeImport({ placement, preview: session.previewImport({ placement }) });
  const current = session.getLayerPhotos(first.layer.id)[0].spatial.current;
  session.beginImport(first.layer.id); session.importFiles([new File(['b'], 'b.jpg', { type: 'image/jpeg' })]);
  for (let i = 0; i < 100 && session.getSnapshot().photos[0].spatial.exifRead.state === 'pending'; i++) await tick();
  const preview = session.previewImport({ placement });
  const result = session.completeImport({ placement, preview });
  assert(result.ok); assert(result.append); assert.equal(result.outcome.placed, preview.outcome.placed);
  assert.deepEqual(result.delivery, preview.delivery);
  assert.equal(result.delivery.gml, 1, 'only the new placement changes delivery');
  assert.equal(session.getLayerPhotos(first.layer.id)[0].spatial.current, current); session.clear();
});
test('import delivery counts the two linked placements of one original when both transfer', async () => {
  const session = await setup();
  try {
    assert(await session.setDraftGmiSource({ file: gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }, { hyperlink: 'h:1(link:"a.jpg") ' }]) }));
    const placement = { kind: 'exif' };
    const loadedReview = session.reviewLoadedGmiImport();
    const preview = session.previewImport({ loadedReview, placement });
    assert.equal(preview.outcome.total, 1);
    assert.equal(preview.rows[0].occurrences, 2);
    assert.equal(preview.delivery.gml, 2);
    assert.equal(preview.delivery.ids.transfer.length, 2);
    assert.equal(session.getSnapshot().photoLayers.length, 0);

    const result = session.completeImport({ loadedReview, placement, preview });
    assert(result.ok);
    assert.deepEqual(result.outcome, { total: 1, placed: 1, unplaced: 0 });
    assert.equal(result.delivery.gml, preview.delivery.gml);
    assert.deepEqual(result.delivery.ids.transfer, result.layer.photoIds);
    const delivery = session.getLayerDelivery(result.layer.id);
    assert(result.layer.photoIds.every((id) => delivery.byPhotoId[id].status === 'transfer'));
  } finally { session.clear(); }
});

test('GML import rolls back at every write, then publishes selected times, direction, positions and delivery together', async () => {
  let failAt = 0, reached = 0;
  const session = evidenceSession({ commitFault(index) { reached = index; if (index === failAt) throw new Error('injected fault'); } });
  const names = ['a.jpg', '20260513_101010.jpg'];
  session.beginImport();
  const files = names.map((name) => new File(['synthetic'], name, { type: 'image/jpeg' }));
  const { acceptedIds: ids } = session.importFiles(files);
  try {
    await session.importPositioningGml(completionGml([{ name: names[0], time: '2026-05-12T10:10:11', direction: 45 }]));
    await waitForExif(session);
    const placement = { kind: 'gml' }, preview = session.previewImport({ placement });
    const request = { placement, preview, captureSuggestions: { complete: true }, gmlCaptureTime: { complete: true } };
    const before = session.getSnapshot();
    const published = [];
    const unsubscribe = session.subscribe(() => published.push(session.getSnapshot()));
    for (failAt = 1; ; failAt++) {
      reached = 0;
      const result = session.completeImport(request);
      if (result.ok) {
        assert.equal(reached, failAt - 1);
        assert(reached >= 5, 'layer, assets, record and delivery writes were faulted');
        assert.deepEqual(published, [session.getSnapshot()]);
        assert.deepEqual(result.outcome, { total: 2, placed: 1, unplaced: 1 });
        assert.deepEqual(result.delivery, preview.delivery);
        assert.equal(result.delivery.gml, 1);
        assert.equal(result.layer.spatialSources[0].kind, 'gml');
        assert.equal(result.layer.placedCount, 1);
        assert.deepEqual(session.getLayerPhotos(result.layer.id).map((photo) => photo.captureMetadata.captureTime.provenance.kind), ['gml', 'filename']);
        assert.equal(session.getPhoto(ids[0]).direction.current.degrees, 45);
        assert.equal(session.getLayerDelivery(result.layer.id).byPhotoId[ids[0]].status, 'include');
        assert.equal(session.getSnapshot().photos.length, 0);
        assert.equal(session.getFile(ids[0]), files[0]);
        break;
      }
      assert.equal(result.error, 'commit-failed');
      assert.equal('delivery' in result, false);
      assert.equal(reached, failAt);
      assert.equal(published.length, 0);
      assert.strictEqual(session.getSnapshot(), before);
      for (const [index, id] of ids.entries()) {
        assert.strictEqual(session.getFile(id), files[index]);
        assert.strictEqual(session.getPhoto(id).spatial, before.photos[index].spatial);
        assert.strictEqual(session.getPhoto(id).captureMetadata, before.photos[index].captureMetadata);
        assert.strictEqual(session.getPhoto(id).direction, before.photos[index].direction);
      }
    }
    unsubscribe();
  } finally { session.clear(); }
});

async function waitForExif(session) {
  for (let i = 0; i < 100 && session.getSnapshot().photos.some((photo) => photo.spatial.exifRead.state === 'pending'); i++) await tick();
  assert(session.getSnapshot().photos.every((photo) => photo.spatial.exifRead.state !== 'pending'));
}

test('GMI append rolls back association, occurrence and discarded file writes without touching an accepted layer', async () => {
  const revoked = [];
  let failAt = 0, reached = 0;
  const session = await setup({ commitFault(index) { reached = index; if (index === failAt) throw new Error('injected fault'); },
    urls: { createObjectURL: URL.createObjectURL, revokeObjectURL(url) { revoked.push(url); URL.revokeObjectURL(url); } } });
  try {
    const existing = session.createLayer(), [id] = existing.photoIds;
    assert(session.setCombinedDeliveryInclusion(existing.id, [id], false).ok);
    session.beginImport(existing.id);
    const files = ['a.jpg', 'b.jpg'].map((name) => new File(['synthetic'], name, { type: 'image/jpeg' }));
    const { acceptedIds: [duplicate, incoming] } = session.importFiles(files);
    await session.setDraftGmiSource({ file: gmiFile([
      { hyperlink: 'h:1(link:"a.jpg") ' }, { hyperlink: 'h:1(link:"b.jpg") ' }, { hyperlink: 'h:1(link:"b.jpg") ' },
    ]) });
    await waitForExif(session);
    while (session.getSnapshot().photos.some((photo) => photo.preview.state === 'pending')) await tick();
    const placement = { kind: 'gmi' };
    const loadedReview = session.reviewLoadedGmiImport();
    const preview = session.previewImport({ loadedReview, placement });
    const before = session.getSnapshot(), beforeLayer = session.getLayer(existing.id);
    const beforePhoto = session.getPhoto(id), beforeDelivery = session.getLayerDelivery(existing.id);
    const excludedUrl = session.getPhoto(duplicate).preview.thumbnailUrl;
    let publications = 0;
    const unsubscribe = session.subscribe(() => publications++);
    for (failAt = 1; ; failAt++) {
      reached = 0;
      const result = session.completeImport({ loadedReview, placement, preview });
      if (result.ok) {
        assert.equal(reached, failAt - 1);
        assert.equal(publications, 1);
        assert.deepEqual(result.outcome, { total: 2, placed: 2, unplaced: 0 });
        assert.equal(result.layer.spatialSources[0].kind, 'gmi');
        assert.equal(result.layer.photoIds.length, 3);
        assert(session.getLayerPhotos(existing.id).every((photo) => photo.occurrence && photo.spatial.current));
        assert.equal(session.getGmiPhotoAssociations(existing.id, id).length, 1);
        assert.equal(session.getFile(duplicate), null);
        assert.equal(session.getFile(incoming), files[1]);
        assert.deepEqual(revoked, [excludedUrl]);
        break;
      }
      assert.equal(result.error, 'commit-failed');
      assert.equal('delivery' in result, false);
      assert.equal(reached, failAt);
      assert.equal(publications, 0);
      assert.strictEqual(session.getSnapshot(), before);
      assert.strictEqual(session.getLayer(existing.id), beforeLayer);
      assert.strictEqual(session.getPhoto(id).spatial, beforePhoto.spatial);
      assert.strictEqual(session.getPhoto(id).captureMetadata, beforePhoto.captureMetadata);
      assert.deepEqual(session.getLayerDelivery(existing.id), beforeDelivery);
      assert.equal(session.getFile(duplicate), files[0]);
      assert.equal(session.getFile(incoming), files[1]);
      assert.deepEqual(revoked, []);
    }
    unsubscribe();
  } finally { session.clear(); }
});

test('cancelled and replaced GMI reviews leave an existing layer intact and a fresh review can publish', async () => {
  const session = await setup();
  try {
    const existing = session.createLayer(), [id] = existing.photoIds;
    const addDraft = async () => {
      session.beginImport(existing.id);
      session.importFiles([new File(['b'], 'b.jpg', { type: 'image/jpeg' })]);
      await session.setDraftGmiSource({ file: gmiFile([{ hyperlink: 'h:1(link:"b.jpg") ' }]) });
      await waitForExif(session);
    };
    await addDraft();
    const placement = { kind: 'gmi' };
    const loadedReview = session.reviewLoadedGmiImport();
    const preview = session.previewImport({ loadedReview, placement });
    const confirm = (review, plan) => session.completeImport({ loadedReview: review, placement, preview: plan });
    assert.equal(confirm(session.reviewLoadedGmiImport(), preview).error, 'review-changed');
    session.cancelImport();
    assert.equal(confirm(loadedReview, preview).error, 'review-changed');
    assert.strictEqual(session.getLayer(existing.id), existing);
    assert.equal(session.getPhoto(id).spatial.current, null);
    await addDraft();
    const refreshed = session.reviewLoadedGmiImport();
    assert(confirm(refreshed, session.previewImport({ loadedReview: refreshed, placement })).ok);
  } finally { session.clear(); }
});
test('loaded GMI append recheck with all draft collisions can commit without adding assets', async () => {
 const session=await setup();const placement={kind:'gmi'};const file=gmiFile([{hyperlink:'h:1(link:"a.jpg") '}]);
 await session.setDraftGmiSource({file});let loadedReview=session.reviewLoadedGmiImport();let preview=session.previewImport({loadedReview,placement});const first=session.completeImport({loadedReview,placement,preview});assert(first.ok);
 session.beginImport();session.importFiles([new File(['x'],'a.jpg',{type:'image/jpeg'})]);await session.setDraftGmiSource({file});session.setLoadedGmiTarget(first.layer.id);
 loadedReview=session.reviewLoadedGmiImport();preview=session.previewImport({loadedReview,placement});const result=session.completeImport({loadedReview,placement,preview});assert(result.ok,JSON.stringify(result));assert.equal(result.layer.photoIds.length,1);session.clear();
});
for (const scenario of ['line','missing-crs','ambiguous','unreferenced-exclude','fallback','zero-gps','gml-unmatched','gml-invalid']) test(`outcome/parity: ${scenario}`,async()=>{
 const zero=scenario==='zero-gps';
 const session=await setup(zero?{extractGps:async()=>({state:'viable',candidate:{status:'viable',position:{crs:'EPSG:4326',latitude:0,longitude:0},issues:['questionable-zero-gps']}})}:{});
 const kind=scenario.startsWith('gml')?'gml':zero?'exif':'gmi';
 if(kind==='gmi') {
  if(scenario==='ambiguous') {
   const file=new File(['y'],'a.jpg',{type:'image/jpeg'});session.importFiles([file]);
  }
  let file=gmiFile([{hyperlink:`h:1(link:"${scenario==='unreferenced-exclude'?'missing.jpg':'a.jpg'}") `,...(scenario==='line'||scenario==='fallback'?{scope:'line'}:{})}]);
  if(scenario==='missing-crs')file=new File([(await file.text()).replace('COSYS_EPSG 25832','')],'source.gmi');
  await session.setDraftGmiSource({file});
 }
 if(kind==='gml') {
  session.clear();
  // A second session supplies source entries through the production adapter seam.
  const other=await setup({parseGml:async()=>({entries:[{id:'x',reference:scenario==='gml-unmatched'?'other.jpg':'a.jpg',status:'invalid',position:null}],issues:[]})});
  await other.importPositioningGml(new File(['x'],'p.gml'));
  const placement={kind},preview=other.previewImport({placement});const result=other.completeImport({placement,preview});assert(result.ok);assert.equal(result.outcome.placed,0);assert.equal(result.outcome.placed,preview.outcome.placed);other.clear();return;
 }
 for(let i=0;i<100&&session.getSnapshot().photos.some(p=>p.spatial.exifRead.state==='pending');i++)await tick();
 const placement={kind,exifFallback:scenario==='fallback'},loadedReview=kind==='gmi'?session.reviewLoadedGmiImport({includeUnreferenced:scenario!=='unreferenced-exclude'}):null;
 const preview=session.previewImport({placement,loadedReview});
 if(scenario==='unreferenced-exclude'){assert.equal(preview.outcome.total,0);assert.equal(session.completeImport({placement,loadedReview,preview}).ok,false);}
 else {const result=session.completeImport({placement,loadedReview,preview});assert(result.ok);assert.equal(result.outcome.placed,preview.outcome.placed);assert.equal(result.outcome.placed,scenario==='fallback'?1:0);}
 session.clear();
});
test('completeImport retains loaded binding liveness and rejects a vanished initiating source before Commit A',async()=>{
 const {parseGmiPhotoSource}=await import('../src/lib/photos/gmiPhotoSource.mjs');
 for(const liveAtCommit of [true,false]){
  const session=await setup();let live=true;
  await session.setDraftGmiSource({binding:{filename:'loaded.gmi'},read:()=>parseGmiPhotoSource(gmiFile([{hyperlink:'h:1(link:"a.jpg") '}])) ,isLive:()=>live});
  const placement={kind:'gmi'},loadedReview=session.reviewLoadedGmiImport(),preview=session.previewImport({loadedReview,placement});live=liveAtCommit;
  const result=session.completeImport({loadedReview,placement,preview});assert.equal(result.ok,liveAtCommit);assert.equal(session.getSnapshot().photoLayers.length,liveAtCommit?1:0);session.clear();
 }
});
