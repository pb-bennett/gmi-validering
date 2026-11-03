import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
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
    assert.equal(session.completeImport({ placement, preview }).ok, false);
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
  assert.equal(session.getLayerPhotos(first.layer.id)[0].spatial.current, current); session.clear();
});
test('safe position refusal retains valid imported layer', async () => {
  const session = await setup(), placement = { kind: 'exif' };
  session.applySourceWorkflowPositions = () => ({ ok: false, error: 'review-changed' });
  const result = session.completeImport({ placement, preview: session.previewImport({ placement }) });
  assert(result.ok); assert(result.placementError); assert.equal(result.outcome.placed, 0); assert(session.getLayer(result.layer.id)); session.clear();
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
