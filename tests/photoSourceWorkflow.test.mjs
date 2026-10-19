import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { photoSourceEvidenceSignature, selectedPhotoSourcePositions } from '../src/lib/photos/photoPositioning.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';

const point = (longitude = 10) => ({ crs: 'EPSG:4326', longitude, latitude: 60 });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const image = (name) => new File(['original'], name, { type: 'image/jpeg' });
const gml = (names = ['a.jpg', 'b.jpg'], longitude = 11, name = 'positions.gml') => new File([JSON.stringify({ issues: [],
  entries: names.map((reference, index) => ({ id: `entry-${index}`, reference, kind: 'gml', status: 'viable',
    position: point(longitude), raw: { fotolink: reference } })) })], name);
async function setup(options = {}, names = ['a.jpg', 'b.jpg', 'c.jpg']) {
  let id = 0;
  const session = createPhotoSession({ createId: () => String(++id), yieldJob: tick,
    createThumbnail: async () => ({ dimensions: { width: 1, height: 1 }, thumbnailBlob: new Blob(['thumb']) }),
    extractGps: async () => ({ state: 'viable', candidate: { status: 'viable', position: point(), raw: { GPSLatitude: 60 } } }),
    parseGml: async (file) => JSON.parse(await file.text()), ...options });
  const ids = session.importFiles(names.map(image)).acceptedIds, layer = session.createLayer();
  for (let i = 0; i < 100 && session.getLayerPhotos(layer.id).some((photo) => photo.spatial.exifRead.state === 'pending'); i++) await tick();
  return { session, layer, ids };
}
async function save(session, layer, ticket, file, kind = 'gml') {
  await session.stageLayerSource(layer.id, file, kind);
  const review = session.getSnapshot().sourceReviews[layer.id];
  assert.equal(session.saveSourceWorkflowSource(ticket, review).ok, true);
  return session.getLayer(layer.id).spatialSources.at(-1);
}

test('GMI checkpoint then EXIF batch in the same operation preserves direction, evidence and originals', async () => {
  const { session, layer, ids } = await setup();
  session.applyDirectionEdit(session.beginDirectionEdit(layer.id, ids[0]), 0);
  const before = ids.map((id) => session.getPhoto(id)), files = ids.map((id) => session.getFile(id));
  const ticket = session.beginSourceWorkflow(layer.id);
  const source = await save(session, layer, ticket, gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }, { hyperlink: 'h:1(link:"a.jpg") h:2(link:"missing.jpg") ' }]), 'gmi');
  assert.equal(source.associationLedger.summary.associationCount, 2);
  assert.equal(source.associationLedger.summary.unmatchedCount, 1);
  ids.forEach((id, index) => {
    const photo = session.getPhoto(id);
    for (const field of ['direction', 'preview', 'dimensions']) assert.strictEqual(photo[field], before[index][field]);
    assert.strictEqual(photo.spatial.current, before[index].spatial.current);
  });
  const plan = session.reviewSourceWorkflowPositions(ticket);
  assert.equal(plan.rows[0].objectCount, 2);
  assert.equal(plan.rows.length, 4);
  assert.equal(plan.rows.filter((row) => row.options.some((option) => option.kind === 'gmi')).length, 2);
  const requests = plan.rows.map((row) => ({ photoId: row.photoId, candidateId: row.options.find((option) => option.kind === 'exif').id }));
  let publications = 0; const unsubscribe = session.subscribe(() => publications++);
  assert.equal(session.applySourceWorkflowPositions(ticket, plan, requests).ok, true);
  assert.equal(publications, 1); unsubscribe();
  ids.forEach((id, index) => {
    const photo = session.getPhoto(id);
    assert.equal(photo.spatial.current.basis.candidateId, `${id}:exif`);
    for (const field of ['direction', 'preview', 'dimensions']) assert.strictEqual(photo[field], before[index][field]);
    assert.strictEqual(photo.spatial.candidates.find((candidate) => candidate.kind === 'exif'), before[index].spatial.candidates[0]);
    assert.strictEqual(session.getFile(id), files[index]);
  });
  assert.equal(session.getPhoto(ids[0]).direction.current.degrees, 0);
  assert.equal(session.getPhoto(ids[1]).direction.current, null);
  assert.strictEqual(session.getLayer(layer.id).spatialSources[0], source);
  session.clear();
});

test('GML checkpoint retains evidence only; mixed source apply preserves an accepted manual current by default', async () => {
  const { session, layer, ids } = await setup();
  session.applyManualPlacement(session.beginManualPlacement(layer.id, ids[2]), point(12));
  const manual = session.getPhoto(ids[2]).spatial.current;
  const ticket = session.beginSourceWorkflow(layer.id);
  await save(session, layer, ticket, gml());
  assert.equal(session.getPhoto(ids[0]).spatial.current, null);
  assert.equal(session.getPhoto(ids[1]).spatial.current, null);
  assert.strictEqual(session.getPhoto(ids[2]).spatial.current, manual);
  const plan = session.reviewSourceWorkflowPositions(ticket);
  assert.equal(plan.rows[0].options.length, 2);
  assert.equal(plan.rows[0].defaultChoice, '', 'multiple sources do not establish authority');
  assert.equal(plan.rows[2].defaultChoice, '', 'manual current is kept');
  const requests = [
    { photoId: ids[0], candidateId: plan.rows[0].options.find((item) => item.kind === 'gml').id },
    { photoId: ids[1], candidateId: `${ids[1]}:exif` },
  ];
  assert(session.applySourceWorkflowPositions(ticket, plan, requests).ok);
  assert.equal(session.getPhoto(ids[0]).spatial.current.position.longitude, 11);
  assert.equal(session.getPhoto(ids[1]).spatial.current.position.longitude, 10);
  assert.strictEqual(session.getPhoto(ids[2]).spatial.current, manual);
  session.clear();
});

test('several retained GML sources stay distinguishable; same-position basis changes require a choice', async () => {
  const { session, layer, ids } = await setup();
  const ticket = session.beginSourceWorkflow(layer.id);
  const first = await save(session, layer, ticket, gml(['a.jpg'], 10));
  const second = await save(session, layer, ticket, gml(['a.jpg'], 11));
  session.acceptCandidates(layer.id, [{ photoId: ids[0], candidateId: `${ids[0]}:exif` }]);
  const plan = session.reviewSourceWorkflowPositions(ticket), row = plan.rows[0];
  assert.equal(row.options.length, 3); assert.equal(row.defaultChoice, '');
  assert.notEqual(first.id, second.id);
  const choice = row.options.find((option) => option.sourceId === first.id);
  const selected = selectedPhotoSourcePositions(plan, { [ids[0]]: choice.id });
  assert.equal(selected[0].action, 'same');
  assert(session.applySourceWorkflowPositions(ticket, plan, [{ photoId: ids[0], candidateId: choice.id }]).ok);
  assert.equal(session.getPhoto(ids[0]).spatial.current.basis.candidateId, choice.id);
  session.clear();
});

test('import and append retain GML without accepting current; existing accepted photos stay identical', async () => {
  const { session, layer, ids } = await setup();
  session.acceptCandidates(layer.id, [{ photoId: ids[0], candidateId: `${ids[0]}:exif` }]);
  const previous = session.getPhoto(ids[0]);
  session.beginImport(layer.id);
  const [added] = session.importFiles([image('new.jpg')]).acceptedIds;
  await session.importPositioningGml(gml(['new.jpg']));
  session.appendImport();
  assert.equal(session.getPhoto(added).spatial.current, null);
  assert.equal(session.getPhoto(added).spatial.candidates.filter((item) => item.kind === 'gml').length, 1);
  assert.strictEqual(session.getPhoto(ids[0]).spatial, previous.spatial);
  session.beginImport();
  const [created] = session.importFiles([image('fresh.jpg')]).acceptedIds;
  await session.importPositioningGml(gml(['fresh.jpg']));
  const newLayer = session.createLayer();
  assert.equal(newLayer.placedCount, 0);
  assert.equal(session.getPhoto(created).spatial.current, null);
  session.clear();
});

for (const phase of ['before-source-save', 'after-source-save', 'position-review', 'summary']) test(`cancel/close at ${phase} never accepts positions`, async () => {
  const { session, layer } = await setup();
  const ticket = session.beginSourceWorkflow(layer.id);
  await session.stageLayerSource(layer.id, gml());
  if (phase !== 'before-source-save') assert(session.saveSourceWorkflowSource(ticket, session.getSnapshot().sourceReviews[layer.id]).ok);
  if (['position-review', 'summary'].includes(phase)) assert(session.reviewSourceWorkflowPositions(ticket));
  session.endSourceWorkflow(ticket);
  assert.equal(session.getLayer(layer.id).spatialSources.length, phase === 'before-source-save' ? 0 : 1);
  assert(session.getLayerPhotos(layer.id).every((photo) => photo.spatial.current === null && photo.direction.current === null));
  assert.equal(session.getSnapshot().sourceReviews[layer.id], undefined);
  assert.equal(session.reviewSourceWorkflowPositions(ticket), null);
  session.clear();
});

for (const change of ['current', 'membership', 'source-removal', 'source-recheck', 'reset', 'delete', 'new-operation', 'duplicate-request', 'foreign-plan', 'wrong-candidate']) {
  test(`mixed batch rejects ${change} atomically`, async () => {
    const { session, layer, ids } = await setup();
    const ticket = session.beginSourceWorkflow(layer.id);
    const source = await save(session, layer, ticket, gml());
    const plan = session.reviewSourceWorkflowPositions(ticket);
    const requests = [{ photoId: ids[0], candidateId: plan.rows[0].options.find((item) => item.sourceId === source.id).id },
      { photoId: ids[1], candidateId: `${ids[1]}:exif` }];
    if (change === 'current') session.applyManualPlacement(session.beginManualPlacement(layer.id, ids[1]), point(15));
    if (change === 'membership') session.removeLayerPhotos(layer.id, [ids[2]], { confirmed: true });
    if (change === 'source-removal') { const gmi = await save(session, layer, ticket, gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }]), 'gmi'); session.removeGmiSource(layer.id, gmi.id, { confirmed: true }); }
    if (change === 'source-recheck') session.recheckLayerSource(layer.id, source.id);
    if (change === 'reset') session.clear();
    if (change === 'delete') session.deleteLayer(layer.id);
    if (change === 'new-operation') session.beginSourceWorkflow(layer.id);
    if (change === 'duplicate-request') requests.push(requests[0]);
    if (change === 'wrong-candidate') requests[1].candidateId = requests[0].candidateId;
    const before = ids.map((id) => session.getPhoto(id)?.spatial.current);
    const result = session.applySourceWorkflowPositions(ticket, change === 'foreign-plan' ? { ...plan } : plan, requests);
    assert.equal(result.ok, false);
    assert.deepEqual(ids.map((id) => session.getPhoto(id)?.spatial.current), before);
    session.clear();
  });
}

test('metadata arriving during review cannot expand its choices; reviewed choices still apply', async () => {
  let finish;
  const { session, layer, ids } = await setup({ extractGps: () => new Promise((resolve) => { finish = resolve; }) }, ['a.jpg']);
  const ticket = session.beginSourceWorkflow(layer.id);
  await save(session, layer, ticket, gml(['a.jpg']));
  const plan = session.reviewSourceWorkflowPositions(ticket);
  const choice = plan.rows[0].defaultChoice;
  assert(choice); assert.equal(plan.rows[0].options.length, 1);
  finish({ state: 'viable', candidate: { status: 'viable', position: point(), raw: {} } });
  await tick(); await tick();
  assert.notEqual(plan.evidenceSignature, photoSourceEvidenceSignature(session.getLayerPhotos(layer.id)));
  assert.equal(plan.rows[0].options.length, 1);
  assert.equal(session.reviewSourceWorkflowPositions(ticket).rows[0].options.length, 2);
  assert(session.applySourceWorkflowPositions(ticket, plan, [{ photoId: ids[0], candidateId: choice }]).ok);
  session.clear();
});

test('ambiguous GML never offers a position; GMI associations remain independent and recheck stable', async () => {
  const { session, layer, ids } = await setup({}, ['a.jpg', 'a.jpg']);
  const ticket = session.beginSourceWorkflow(layer.id);
  await save(session, layer, ticket, gml(['a.jpg']));
  assert(session.reviewSourceWorkflowPositions(ticket).rows.every((row) => row.options.every((option) => option.kind === 'exif')));
  const source = await save(session, layer, ticket, gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }]), 'gmi');
  assert.equal(source.associationLedger.summary.ambiguousCount, 1);
  session.removeLayerPhotos(layer.id, [ids[1]], { confirmed: true });
  const next = session.beginSourceWorkflow(layer.id);
  session.recheckLayerSource(layer.id, source.id);
  assert(session.saveSourceWorkflowSource(next, session.getSnapshot().sourceReviews[layer.id]).ok);
  assert.equal(session.getGmiPhotoAssociations(layer.id, ids[0]).length, 1);
  assert.equal(session.getPhoto(ids[0]).spatial.current, null);
  session.clear();
});

test('source save rejects a replaced review and late source work cannot survive close', async () => {
  let finish;
  const { session, layer } = await setup();
  const ticket = session.beginSourceWorkflow(layer.id);
  await session.stageLayerSource(layer.id, gml());
  const previous = session.getSnapshot().sourceReviews[layer.id];
  await session.stageLayerSource(layer.id, gml(['a.jpg'], 13));
  assert.equal(session.saveSourceWorkflowSource(ticket, previous).ok, false);
  assert.equal(session.getLayer(layer.id).spatialSources.length, 0);
  session.endSourceWorkflow(ticket);
  const deferred = await setup({ parseGml: () => new Promise((resolve) => { finish = resolve; }) });
  const operation = deferred.session.beginSourceWorkflow(deferred.layer.id);
  const reading = deferred.session.stageLayerSource(deferred.layer.id, gml());
  deferred.session.endSourceWorkflow(operation);
  finish({ issues: [], entries: [] });
  assert.equal(await reading, false);
  assert.equal(deferred.session.getSnapshot().sourceReviews[deferred.layer.id], undefined);
  session.clear(); deferred.session.clear();
});

test('a new workflow invalidates the previous operation and removes its staged review from the public snapshot', async () => {
  const { session, layer } = await setup();
  const previous = session.beginSourceWorkflow(layer.id);
  await session.stageLayerSource(layer.id, gml());
  const stale = session.getSnapshot().sourceReviews[layer.id];
  const current = session.beginSourceWorkflow(layer.id);
  assert.equal(session.sourceWorkflowIsLive(previous), false);
  assert.equal(session.getSnapshot().sourceReviews[layer.id], undefined);
  assert.equal(session.saveSourceWorkflowSource(previous, stale).ok, false);
  assert(session.reviewSourceWorkflowPositions(current));
  session.endSourceWorkflow(previous);
  assert(session.sourceWorkflowIsLive(current), 'old cleanup cannot cancel the current operation');
  session.clear();
});

test('an invalid later GML entry aborts the source checkpoint before any candidate is attached', async () => {
  const { session, layer, ids } = await setup();
  const ticket = session.beginSourceWorkflow(layer.id);
  const parsed = JSON.parse(await gml().text());
  parsed.entries[1].position.latitude = 901;
  await session.stageLayerSource(layer.id, new File([JSON.stringify(parsed)], 'invalid.gml'));
  const before = ids.map((id) => session.getPhoto(id));
  assert.equal(session.saveSourceWorkflowSource(ticket, session.getSnapshot().sourceReviews[layer.id]).ok, false);
  assert.equal(session.getLayer(layer.id).spatialSources.length, 0);
  ids.forEach((id, index) => {
    assert.strictEqual(session.getPhoto(id).spatial, before[index].spatial);
    assert.strictEqual(session.getPhoto(id).direction, before[index].direction);
  });
  session.clear();
});

test('product UI has one source workflow and inspector has no direct source acceptance', async () => {
  const read = (file) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const [page, workspace, inspector, wizard] = await Promise.all([read('app/page.js'), read('components/photos/PhotoWorkspaceCollection.js'),
    read('components/photos/PhotoSpatialInspector.js'), read('components/photos/PhotoPositioningWizard.js')]);
  assert.equal((page.match(/<PhotoPositioningWizard\b/g) || []).length, 1);
  assert.match(workspace, /Koble og posisjoner bilder/);
  assert.match(workspace, /onOpenSources\(\{ sourceId: source.id \}\)/);
  assert.doesNotMatch(workspace + page, /PhotoGmiDialog|Koble GMI-referanser/);
  assert.doesNotMatch(inspector, /acceptCandidates|Bruk .*?-posisjon/);
  assert.match(inspector, /Kontroller kilder og posisjon/);
  assert.match(inspector, /PhotoManualPlacementControls/);
  assert.match(inspector, /PhotoDirectionControls/);
  assert.match(page, /cancelPhotoEditing\(\);\s*setPhotoSourceWorkflow/);
  assert.match(wizard, /\['Kilder', 'Koblinger', 'Posisjoner', 'Oppsummer'\]/);
  assert.match(wizard, /Oppdater kontrollen/);
  assert.doesNotMatch(wizard, /acceptCandidates|applyPhotoPositioning\(/);
});
