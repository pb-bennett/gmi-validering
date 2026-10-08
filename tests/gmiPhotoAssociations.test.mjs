import assert from 'node:assert/strict';
import test from 'node:test';
import { extractHyperlinkFilenames, extractHyperlinkSourceParts, extractHyperlinkOccurrences } from '../src/lib/hyperlinkFilenames.mjs';
import { parseGmiPhotoSource, reviewGmiPhotoSource, pruneGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { createPhotoCandidate } from '../src/lib/photos/photoSpatial.mjs';
import { realGrammarFamilies, sevenGuid, sharedFilename, sharedGuids, gmiFile } from './helpers/gmiPhotoFixtures.mjs';

const link = (path) => `h:1(link:"${path}") `;
const asset = (id, name, path = null, hash = null) => ({ id, originalFilename: name, sourceRelativePath: path, hash });
const source = async (objects, id = 'source-A') => ({ ...await parseGmiPhotoSource(gmiFile(objects)), id });
const edges = (ledger) => Object.values(ledger.associationsById);

test('all 12 pinned real grammar families retain every member, source span and exact reconstruction', () => {
  assert.equal(realGrammarFamilies.length, 12);
  for (const [index, raw] of realGrammarFamilies.entries()) {
    const evidence = extractHyperlinkOccurrences(raw);
    const filenames = extractHyperlinkFilenames(raw);
    assert.equal(evidence.occurrences.length, filenames.length, `F${index + 1}`);
    assert.deepEqual(evidence.diagnostics, []);
    assert.equal(extractHyperlinkSourceParts(raw).map((part) => part.text).join(''), raw);
    assert(raw.endsWith(' '));
    for (const [order, occurrence] of evidence.occurrences.entries()) {
      assert.equal(occurrence.sourceOrder, order);
      assert.equal(occurrence.wrapperOrdinal, order);
      assert.equal(occurrence.wrapperNumber, order + 1);
      assert.equal(raw.slice(occurrence.rawStart, occurrence.rawEnd), occurrence.rawMember);
      assert.equal(raw.slice(occurrence.wrapperStart, occurrence.wrapperEnd), occurrence.rawWrapper);
      assert.equal(occurrence.filename, filenames[order]);
      assert(occurrence.targetValid);
      assert.equal(occurrence.normalizedKey, filenames[order].normalize('NFC').toLowerCase());
    }
  }
  // Five wrappers are not observed in the corpus; pinned as a synthetic sequence.
  assert.equal(extractHyperlinkOccurrences(realGrammarFamilies[11].split(' h:6')[0] + ' ').occurrences.length, 5);
  for (const raw of [link('Pictures\\Kum\\SPK1.JPEG'), link('IMG_3957.jpeg'),
    link('Attachments\\Skjøte hull.jpg'), 'h:1(link:"a.jpg"\nsign:"NOSEVIE") ']) {
    assert.equal(extractHyperlinkOccurrences(raw).occurrences.length, 1);
    assert.equal(extractHyperlinkSourceParts(raw).map((part) => part.text).join(''), raw);
  }
});

test('occurrence ledger does not deduplicate links; copy actions do, and invalid grammar stays rejected', () => {
  const raw = 'h:1(link:"A/a.jpg" sign:"person") h:2(link:"B/a.jpg") ';
  const evidence = extractHyperlinkOccurrences(raw);
  assert.equal(evidence.occurrences.length, 2);
  assert.deepEqual(evidence.occurrences[0].metadata, [{ key: 'sign', value: 'person', raw: 'sign:"person"' }]);
  assert.deepEqual(extractHyperlinkFilenames(raw), ['a.jpg']);
  assert.equal(extractHyperlinkSourceParts(raw).map((part) => part.text).join(''), raw);
  for (const value of ['h :1(link:"a.jpg")', 'h:1(link:"a.jpg" sign:broken)', 'h:1(link:"a.jpg") junk', "h:1(link:'a.jpg')"]) {
    assert.equal(extractHyperlinkOccurrences(value).occurrences.length, 0);
    assert.deepEqual(extractHyperlinkFilenames(value), []);
  }
  const invalid = extractHyperlinkOccurrences(String.raw`h:1(link:"Attachments\") `).occurrences[0];
  assert.equal(invalid.filename, null);
  assert.equal(invalid.targetValid, false);
  assert.deepEqual(invalid.diagnostics, ['directory-target']);
  assert.deepEqual(extractHyperlinkFilenames(String.raw`h:1(link:"Attachments\")`), []);
  const array = [raw, [link('b.jpg')]]; array.push(array);
  assert.deepEqual(extractHyperlinkOccurrences(array).occurrences.map((ref) => ref.sourceIndex), [0, 0, 1]);
});

test('real G04 seven-image object yields seven distinct edges, retaining sparse parser ID and source lexeme', async () => {
  const gmi = await source([{ guid: sevenGuid, parserId: 257, tema: 'LOK', hyperlink: realGrammarFamilies[11] }]);
  const photos = gmi.references.map((reference, index) => asset(`photo-${index}`, reference.filename, reference.referenceRaw));
  const ledger = reviewGmiPhotoSource(gmi, photos);
  assert.equal(edges(ledger).length, 7);
  assert.equal(ledger.summary.matchedReferenceCount, 7);
  assert.equal(ledger.reverseIndexes.byObjectKey[`guid:${sevenGuid}`].length, 7);
  assert.equal(gmi.objectsByKey[`guid:${sevenGuid}`].sourceIndex, 0);
  assert.equal(gmi.objectsByKey[`guid:${sevenGuid}`].parserId, 257);
  assert.equal(gmi.objectsByKey[`guid:${sevenGuid}`].hyperlinkRaw, realGrammarFamilies[11]);
  assert.equal(gmi.objectsByKey[`guid:${sevenGuid}`].rawFields.S_HYPERLINK, realGrammarFamilies[11]);
  assert(!('entries' in gmi));
});

test('real G01 two-GUID/single-photo evidence retains both objects; repeated members group without evidence loss', async () => {
  const gmi = await source(sharedGuids.map((guid, index) => ({ guid, parserId: index ? 22 : 20, hyperlink: link(`Attachments\\${sharedFilename}`) })));
  const ledger = reviewGmiPhotoSource(gmi, [asset('shared', sharedFilename)]);
  assert.equal(edges(ledger).length, 2);
  assert.equal(ledger.reverseIndexes.byPhotoId.shared.length, 2);
  assert.equal(ledger.summary.matchedPhotoCount, 1);
  const repeated = await source([{ hyperlink: link('a.jpg') + link('a.jpg') }]);
  const grouped = reviewGmiPhotoSource(repeated, [asset('p', 'a.jpg')]);
  assert.equal(edges(grouped).length, 1);
  assert.equal(edges(grouped)[0].referenceIds.length, 2);
  assert.equal(repeated.references.length, 2);
});

test('same GUID across revisions preserves changed metadata, geometry, parser ID and distinct association IDs', async () => {
  const a = await source([{ guid: sevenGuid, hyperlink: link('a.jpg'), parserId: 257, tema: 'LOK' }]);
  const b = await source([{ guid: sevenGuid, hyperlink: link('a.jpg'), parserId: 11, type: 'DOVG', tema: 'KRN', xyz: '581827 6565721 1' }], 'source-B');
  assert.notEqual(a.fingerprint, b.fingerprint);
  const photos = [asset('p', 'a.jpg')];
  assert.notEqual(edges(reviewGmiPhotoSource(a, photos))[0].id, edges(reviewGmiPhotoSource(b, photos))[0].id);
  assert.notDeepEqual(a.objectsByKey[`guid:${sevenGuid}`].rawGeometry, b.objectsByKey[`guid:${sevenGuid}`].rawGeometry);
});

test('empty/DFOT/DOVG/arbitrary Type and point/line geometry are metadata only', async () => {
  for (const type of ['', 'DFOT', 'DOVG', 'supplied-arbitrary']) for (const scope of ['point', 'line']) {
    const gmi = await source([{ type, scope, tema: '', hyperlink: link('a.jpg') }]);
    assert.equal(edges(reviewGmiPhotoSource(gmi, [asset('p', 'a.jpg')])).length, 1);
    assert.equal(Object.values(gmi.objectsByKey)[0].geometryScope, scope);
    assert(!('entries' in gmi));
  }
  // Associations follow FOTO image eligibility independently of preview support.
  const unsupportedPreview = await source([{ hyperlink: link('document.svg') }, { hyperlink: link('document.pdf') }]);
  const ledger = reviewGmiPhotoSource(unsupportedPreview, [asset('svg', 'document.svg')]);
  assert.equal(ledger.resolutions[0].status, 'confident');
  assert.equal(ledger.resolutions[1].status, 'invalid');
  assert.equal(ledger.resolutions[1].reason, 'non-image-target');
});

test('owner-layer collision-checked path, suffix, flattened basename and case/NFC fallback', async () => {
  const cases = [
    ['Attachments\\a.jpg', [asset('p', 'a.jpg', 'Attachments/a.jpg'), asset('other', 'a.jpg', 'Other/a.jpg')], 'exact-relative-path'],
    ['Attachments\\a.jpg', [asset('p', 'a.jpg', 'Delivery/Attachments/a.jpg')], 'relative-path-suffix'],
    ['Delivery\\Attachments\\a.jpg', [asset('p', 'a.jpg', 'Attachments/a.jpg')], 'relative-path-suffix'],
    ['Pictures\\Kum\\SPK1.JPEG', [asset('p', 'SPK1.JPEG')], 'exact-basename'],
    ['a.jpg', [asset('p', 'a.jpg')], 'exact-basename'],
    ['Attachments\\SKJØTE.JPG', [asset('p', 'skjøte.jpg')], 'case-insensitive-basename'],
    ['Attachments\\å.jpg', [asset('p', 'a\u030a.jpg')], 'nfc-basename'],
    ['Attachments\\å.jpg', [asset('p', 'a\u030a.jpg', 'Delivery/Attachments/a\u030a.jpg')], 'nfc-relative-path-suffix'],
  ];
  for (const [path, photos, method] of cases) {
    const ledger = reviewGmiPhotoSource(await source([{ hyperlink: link(path) }]), photos);
    assert.equal(ledger.resolutions[0].status, 'confident', path);
    assert.equal(ledger.resolutions[0].method, method, path);
    assert.equal(ledger.resolutions[0].photoId, 'p');
  }
});

test('duplicate imported assets remain ambiguous despite exact spelling, equal hash, or differing contents', async () => {
  for (const photos of [
    [asset('a', 'a.jpg', null, 'same'), asset('b', 'a.jpg', null, 'same')],
    [asset('a', 'a.jpg', null, 'one'), asset('b', 'a.jpg', null, 'two')],
    [asset('a', 'a.jpg'), asset('b', 'A.JPG')],
    [asset('a', 'å.jpg'), asset('b', 'a\u030a.jpg')],
    [asset('a', 'a.jpg', 'Attachments/a.jpg'), asset('b', 'a.jpg', 'attachments/A.JPG')],
  ]) {
    const name = photos[0].originalFilename;
    const gmi = await source([{ hyperlink: link(`Attachments\\${name}`) }]);
    assert.equal(reviewGmiPhotoSource(gmi, photos).resolutions[0].status, 'ambiguous');
  }
  for (const [reference, name] of [['a.jpg', 'renamed.jpg'], ['a.jpg', 'a.jpeg'], ['a(1).jpg', 'a.jpg'], ['aa.jpg', 'a.jpg']]) {
    const ledger = reviewGmiPhotoSource(await source([{ hyperlink: link(reference) }]), [asset('p', name, null, 'same-content')]);
    assert.equal(ledger.resolutions[0].status, 'unmatched');
  }
});

function setup(options = {}) {
  let id = 0;
  return createPhotoSession({ createId: () => String(++id), extractGps: async () => ({ state: 'absent', candidate: null }),
    createThumbnail: async () => ({ dimensions: { width: 1, height: 1 }, thumbnailBlob: new Blob(['preview']) }),
    yieldJob: () => new Promise((resolve) => setImmediate(resolve)), ...options });
}
const photoFile = (name) => new File(['image'], name, { type: 'image/jpeg' });
const attach = async (session, layerId, file) => {
  await session.stageLayerSource(layerId, file, 'gmi');
  const review = session.getSnapshot().sourceReviews[layerId];
  return session.applyGmiAssociations(layerId, { confirmed: true, sourceId: review.source.id,
    memberIds: review.memberIds, associationLedger: review.associationLedger });
};

test('association-only confirmation/cancel are atomic and leave current, direction, candidates, preview and File refs identical', async () => {
  const session = setup();
  const original = photoFile('a.jpg'), photoId = session.importFiles([original]).acceptedIds[0], layer = session.createLayer();
  await new Promise((resolve) => setTimeout(resolve, 20));
  session.applyManualPlacement(session.beginManualPlacement(layer.id, photoId), { crs: 'EPSG:4326', latitude: 59, longitude: 10 });
  session.applyDirectionEdit(session.beginDirectionEdit(layer.id, photoId), 123);
  const before = session.getPhoto(photoId);
  const file = gmiFile([{ hyperlink: link('a.jpg') }]);
  await session.stageLayerSource(layer.id, file, 'gmi');
  const review = session.getSnapshot().sourceReviews[layer.id];
  assert.equal(session.applyLayerSource(layer.id), false, 'position attachment cannot consume GMI');
  assert.equal(session.applyGmiAssociations(layer.id, { sourceId: review.source.id, memberIds: review.memberIds, associationLedger: review.associationLedger }).ok, false);
  assert.equal(session.getLayer(layer.id).spatialSources.length, 0);
  session.cancelLayerSourceReview(layer.id);
  assert.equal(session.getGmiPhotoAssociations(layer.id, photoId).length, 0);
  assert((await attach(session, layer.id, file)).ok);
  const after = session.getPhoto(photoId);
  for (const key of ['spatial', 'direction', 'preview', 'dimensions']) assert.strictEqual(after[key], before[key]);
  assert.strictEqual(session.getFile(photoId), original);
  assert.equal(session.getGmiPhotoAssociations(layer.id, photoId).length, 1);
  const wrongLayer = session.importFiles([photoFile('a.jpg')]);
  const other = session.createLayer();
  assert.equal(session.getGmiPhotoAssociations(other.id, wrongLayer.acceptedIds[0]).length, 0);
  session.clear();
});

test('unmatched/invalid sources attach with no photos; append alone does not attach; explicit recheck is idempotent', async () => {
  const session = setup();
  const seed = session.importFiles([photoFile('seed.jpg')]).acceptedIds[0], layer = session.createLayer();
  session.removeLayerPhotos(layer.id, [seed], { confirmed: true });
  assert((await attach(session, layer.id, gmiFile([{ hyperlink: link('later.jpg') }, { hyperlink: link('Attachments\\') }]))).ok);
  let retained = session.getLayer(layer.id).spatialSources[0];
  assert.equal(retained.associationLedger.summary.unmatchedCount, 1);
  assert.equal(retained.associationLedger.summary.invalidCount, 1);
  session.beginImport(layer.id);
  const added = session.importFiles([photoFile('later.jpg')]).acceptedIds[0];
  session.appendImport();
  assert.equal(session.getGmiPhotoAssociations(layer.id, added).length, 0);
  const recheck = () => {
    session.recheckLayerSource(layer.id, retained.id);
    const review = session.getSnapshot().sourceReviews[layer.id];
    assert(session.applyGmiAssociations(layer.id, { confirmed: true, sourceId: retained.id, memberIds: review.memberIds, associationLedger: review.associationLedger }).ok);
  };
  recheck();
  const first = session.getLayer(layer.id).spatialSources[0];
  recheck();
  retained = session.getLayer(layer.id).spatialSources[0];
  assert.deepEqual(retained.associationLedger, first.associationLedger);
  assert.strictEqual(retained.objectsByKey, first.objectsByKey);
  assert.strictEqual(retained.references, first.references);
  assert.equal(session.getGmiPhotoAssociations(layer.id, added).length, 1);
  session.clear();
});

test('manual move, GML/EXIF acceptance and direction edits preserve both source revision edges; source/photo/reset clean indexes', async () => {
  const position = { crs: 'EPSG:4326', longitude: 10, latitude: 59 };
  const session = setup({ extractGps: async () => ({ state: 'ready', candidate: createPhotoCandidate({ id: 'exif', kind: 'exif', status: 'viable', position }) }),
    parseGml: async () => ({ entries: [{ id: 'gml-a', kind: 'gml', status: 'viable', reference: 'a.jpg', position }] }) });
  const photoId = session.importFiles([photoFile('a.jpg')]).acceptedIds[0], layer = session.createLayer();
  await new Promise((resolve) => setTimeout(resolve, 20));
  for (const xyz of ['581930 6566000 1', '581931 6566001 1']) assert((await attach(session, layer.id, gmiFile([{ guid: sevenGuid, hyperlink: link('a.jpg'), xyz }]))).ok);
  const originalEdges = session.getGmiPhotoAssociations(layer.id, photoId);
  assert.equal(originalEdges.length, 2);
  await session.stageLayerSource(layer.id, new File(['gml'], 'positions.gml'));
  session.applyLayerSource(layer.id);
  for (const kind of ['gml', 'exif']) {
    const candidate = session.getPhoto(photoId).spatial.candidates.find((item) => item.kind === kind);
    session.acceptCandidates(layer.id, [{ photoId, candidateId: candidate.id }]);
    assert.deepEqual(session.getGmiPhotoAssociations(layer.id, photoId), originalEdges);
  }
  session.applyManualPlacement(session.beginManualPlacement(layer.id, photoId), position);
  session.applyDirectionEdit(session.beginDirectionEdit(layer.id, photoId), 90);
  assert.deepEqual(session.getGmiPhotoAssociations(layer.id, photoId), originalEdges);
  assert(session.removeGmiSource(layer.id, originalEdges[0].sourceId, { confirmed: true }));
  assert.equal(session.getGmiPhotoAssociations(layer.id, photoId).length, 1);
  session.removeLayerPhotos(layer.id, [photoId], { confirmed: true });
  const retained = session.getLayer(layer.id).spatialSources.find((item) => item.kind === 'gmi');
  assert.equal(retained.associationLedger.resolutions[0].status, 'unmatched');
  assert.deepEqual(retained.associationLedger.reverseIndexes.byPhotoId, {});
  assert.equal(retained.references.length, 1);
  session.clear();
  assert.equal(session.getSnapshot().photoLayers.length, 0);
  assert.equal(session.getGmiPhotoAssociations(layer.id, photoId).length, 0);
});

test('ambiguous removal needs recheck; confirmed edges stay stable after a duplicate append', async () => {
  const gmi = await source([{ hyperlink: link('a.jpg') }]);
  const photos = [asset('a', 'a.jpg'), asset('b', 'a.jpg')];
  const ambiguous = { ...gmi, associationLedger: reviewGmiPhotoSource(gmi, photos) };
  const pruned = pruneGmiPhotoSource(ambiguous, ['a']);
  assert.equal(pruned.associationLedger.resolutions[0].status, 'ambiguous');
  assert.equal(reviewGmiPhotoSource(pruned, photos.slice(0, 1)).resolutions[0].status, 'confident');
  const attached = { ...gmi, associationLedger: reviewGmiPhotoSource(gmi, photos.slice(0, 1)) };
  assert.equal(reviewGmiPhotoSource(attached, photos).resolutions[0].photoId, 'a');
});

test('membership change, source removal, cancelled late reads and full reset cannot apply stale evidence', async () => {
  let finish;
  const parsed = await parseGmiPhotoSource(gmiFile([{ hyperlink: link('a.jpg') }]));
  const session = setup({ sourceAdapters: { gmi: () => new Promise((resolve) => { finish = () => resolve(parsed); }) } });
  const id = session.importFiles([photoFile('a.jpg')]).acceptedIds[0], layer = session.createLayer();
  const reading = session.stageLayerSource(layer.id, gmiFile([]), 'gmi');
  session.cancelLayerSourceReview(layer.id); finish();
  assert.equal(await reading, false);
  assert.equal(session.getLayer(layer.id).spatialSources.length, 0);
  const pending = session.stageLayerSource(layer.id, gmiFile([]), 'gmi'); finish(); await pending;
  const review = session.getSnapshot().sourceReviews[layer.id];
  session.removeLayerPhotos(layer.id, [id], { confirmed: true });
  assert.equal(session.applyGmiAssociations(layer.id, { confirmed: true, sourceId: review.source.id, memberIds: review.memberIds, associationLedger: review.associationLedger }).ok, false);
  const resetRead = session.stageLayerSource(layer.id, gmiFile([]), 'gmi');
  session.clear(); finish(); assert.equal(await resetRead, false);
  assert.deepEqual(session.getSnapshot().sourceReviews, {});
});

test('same bytes under another filename are a duplicate source; missing/duplicate GUIDs never collapse objects', async () => {
  const session = setup();
  session.importFiles([photoFile('a.jpg')]); const layer = session.createLayer();
  const objects = [{ guid: sevenGuid, hyperlink: link('a.jpg') }, { guid: sevenGuid, scope: 'line', hyperlink: link('a.jpg') }];
  assert((await attach(session, layer.id, gmiFile(objects))).ok);
  const retained = session.getLayer(layer.id).spatialSources[0];
  assert.equal(Object.keys(retained.objectsByKey).length, 2);
  assert.equal(edges(retained.associationLedger).length, 2);
  assert(retained.issues.some((issue) => issue.code === 'duplicate-guid'));
  assert.equal(await session.stageLayerSource(layer.id, gmiFile(objects, 'renamed.gmi'), 'gmi'), false);
  assert.equal(session.getSnapshot().sourceReviews[layer.id].errorCode, 'duplicate-source');
  const noGuid = await parseGmiPhotoSource(new File([await gmiFile([{ hyperlink: link('a.jpg') }]).text().then((text) => text.replace(/^GUID .*\n/m, ''))], 'missing.gmi'));
  assert.equal(Object.keys(noGuid.objectsByKey)[0], 'point:0');
  assert(noGuid.issues.some((issue) => issue.code === 'missing-guid'));
  session.clear();
});

test('a source with exclusively ambiguous/unmatched evidence can attach; assets in another owner never resolve it', async () => {
  const session = setup();
  session.importFiles([photoFile('outside.jpg')]); const outside = session.createLayer();
  session.importFiles([photoFile('duplicate.jpg'), photoFile('duplicate.jpg')]); const owner = session.createLayer();
  assert((await attach(session, owner.id, gmiFile([{ hyperlink: link('duplicate.jpg') }, { hyperlink: link('outside.jpg') }]))).ok);
  const retained = session.getLayer(owner.id).spatialSources[0];
  assert.equal(retained.associationLedger.summary.ambiguousCount, 1);
  assert.equal(retained.associationLedger.summary.unmatchedCount, 1);
  assert.equal(retained.associationLedger.summary.associationCount, 0);
  assert.equal(session.getLayer(outside.id).spatialSources.length, 0);
  session.recheckLayerSource(owner.id, retained.id);
  session.removeGmiSource(owner.id, retained.id, { confirmed: true });
  assert.deepEqual(session.getSnapshot().sourceReviews, {});
  assert.equal(session.getLayer(owner.id).spatialSources.length, 0);
  session.clear();
});

test('exact-byte GMI fallback is collision-free without Web Crypto; size/format guards use the production parser', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    const file = gmiFile([{ hyperlink: link('a.jpg') }]);
    const gmi = await parseGmiPhotoSource(file);
    assert.equal(gmi.fingerprint, `exact-bytes:${Buffer.from(await file.arrayBuffer()).toString('hex')}`);
    assert.notEqual(gmi.fingerprint, (await parseGmiPhotoSource(gmiFile([{ hyperlink: link('a.jpg'), xyz: '1 2 3' }]))).fingerprint);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else delete globalThis.crypto;
  }
  await assert.rejects(parseGmiPhotoSource({ size: 10 * 1024 * 1024 + 1 }), { code: 'gmi-too-large' });
  await assert.rejects(parseGmiPhotoSource(new File(['not GMI'], 'invalid.gmi')), { code: 'invalid-gmi' });
});
