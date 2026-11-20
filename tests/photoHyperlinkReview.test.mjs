import assert from 'node:assert/strict';
import test from 'node:test';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { createGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { validateGmiDataset, createGmiSourceDocument, getGmiSourceBytes, createGmiEditSession } from '../src/lib/gmi-edit/index.mjs';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';
import { detectPhotoLinkReview, photoLinkReviewCandidates, photoLinkReviewDataset, photoLinkReviewHandoffIsCurrent,
  preparePhotoLinkReviewHandoff, emptyPhotoLinkReviewChoices, reducePhotoLinkReviewChoices, photoLinkReviewProposal } from '../src/lib/photos/photoHyperlinkReview.mjs';
import { gmiText, gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { saveStagedSource } from './helpers/photoSourceDraft.mjs';

const link = (name = 'a.jpg', ordinal = 1) => `h:${ordinal}(link:"${name}" sign:"synthetic") `;
function context(objects, transform = (text) => text) {
  const text = transform(gmiText(objects));
  const parser = new GMIParser(text), dataset = parser.toObject();
  const source = { ...createGmiPhotoSource(parser, 'synthetic-fingerprint'), id: 'source' };
  return { source, dataset, text, layerId: 'survey' };
}
const baseObjects = [
  { tema: 'LOK', label: 'shared-label', hyperlink: link() + link('a.jpg', 2), xyz: '581930 6566000 7' },
  { tema: 'TOP', label: 'cover B', hyperlink: link('missing.jpg'), xyz: '581932 6566000 8' },
  { tema: 'KUM', label: 'shared-label', hyperlink: link(), xyz: '581933 6566004 2' },
  { tema: 'KUM', label: 'other', hyperlink: link('existing.jpg'), xyz: '581926 6566003 3' },
];
const asset = (id = 'a', name = 'a.jpg') => ({ id, assetId: id, originalFilename: name, sourceRelativePath: name,
  spatial: { candidates: [], current: null }, preview: { state: 'ready' } });

test('pure detection retains exact references, complete duplicate groups, missing assets, equal-distance KUM and raw Z', () => {
  const input = context(baseObjects), before = JSON.stringify(input);
  const model = detectPhotoLinkReview({ ...input, photos: [asset()] });
  assert.equal(model.rows.length, 2); assert.equal(model.targets.length, 2);
  assert.equal(model.rows[0].groups.length, 1); assert.equal(model.rows[0].groups[0].references.length, 2);
  assert.equal(model.rows[0].groups[0].sharedObjectKeys.length, 2);
  assert.equal(model.rows[1].references[0].resolution.status, 'unmatched');
  const candidates = photoLinkReviewCandidates(model, model.rows[0]);
  assert.deepEqual(candidates.map((entry) => entry.distanceMetres), [5, 5]);
  assert.deepEqual(candidates[0].sameIdentifiers, ['AnleggsID']);
  assert.deepEqual(candidates[0].reusedAssets, ['a']); assert.equal(candidates[0].deltaZ, -5);
  assert.equal(candidates[1].target.references[0].referenceRaw, 'existing.jpg');
  assert.deepEqual(emptyPhotoLinkReviewChoices(), { targets: {}, groups: {} });
  assert.equal(JSON.stringify(input), before);
});

test('all same-source KUM stay candidates, including distant and coincident targets; no radius or automatic choice', () => {
  const model = detectPhotoLinkReview(context([baseObjects[0], { tema: 'KUM', xyz: '581930 6566000 50' },
    { tema: 'KUM', xyz: '681930 6566000 3' }]));
  const candidates = photoLinkReviewCandidates(model, model.rows[0]);
  assert.deepEqual(candidates.map((entry) => entry.distanceMetres), [0, 100000]);
  assert.equal(photoLinkReviewProposal(model, model.rows[0], emptyPhotoLinkReviewChoices()).proposed, null);
});

test('raw identifier evidence does not equate numeric-coerced or whitespace-distinct AnleggsID values', () => {
  const input = context([{ tema: 'LOK', label: '001', hyperlink: link() }, { tema: 'KUM', label: '1' },
    { tema: 'KUM', label: '001' }, { tema: 'KUM', label: '001 ' }]);
  assert(input.dataset.points.every((object) => object.attributes.AnleggsID === 1), 'the existing parser coerces all four values');
  const model = detectPhotoLinkReview(input), row = model.rows[0], candidates = photoLinkReviewCandidates(model, row);
  assert.equal(row.rawAttributes.AnleggsID, '001'); assert.equal(row.label, 'AnleggsID: 001');
  assert.deepEqual(candidates.map((candidate) => candidate.sameIdentifiers), [[], ['AnleggsID'], []]);
  assert.equal(candidates[0].target.rawAttributes.AnleggsID, '1');
  assert.equal(candidates[2].target.rawAttributes.AnleggsID, '001 ');
  const missingRaw = { ...row, rawAttributes: {} };
  assert(photoLinkReviewCandidates(model, missingRaw).every((candidate) => !candidate.sameIdentifiers.length), 'missing lexical evidence cannot establish equal identifiers');
});

test('case-normalized Tema is resolved through V2; conflicting Tema/S_FCODE and lexical disagreements stay unresolved', () => {
  for (const transform of [(text) => text.replaceAll('S_FCODE', 'Tema'), (text) => text.replaceAll('S_FCODE', 'tEmA')]) {
    const model = detectPhotoLinkReview(context(baseObjects, transform));
    assert.equal(model.rows.length, 2); assert.equal(model.targets.length, 2);
    assert.equal(model.rows[0].temaIdentity.state, 'RESOLVED');
  }
  const input = context([baseObjects[0], baseObjects[2]], (text) => text.replaceAll('S_FCODE;Type', 'Tema;S_FCODE;Type')
    .replace('LOK;;', 'LOK;TOP;;').replace('KUM;;', 'KUM;LOK;;'));
  const model = detectPhotoLinkReview(input);
  assert.equal(model.targets.length, 0); assert.equal(model.rows[0].temaIdentity.state, 'CONFLICT');
  assert(model.rows[0].issues.some((issue) => issue.includes('Tema er uavklart')));
  const detached = detectPhotoLinkReview({ source: input.source });
  assert.equal(detached.rows[0].temaIdentity.state, 'CONFLICT', 'FOTO-only adapter preserves raw Tema evidence');
});

for (const [raw, shape] of [
  ['a.jpg', 'bare'], ['h:1(link:"a.jpg"', 'malformed'], ['h:1(link:"a.jpg" link:"b.jpg") ', 'multi-member'],
  ['h:1(link:"a.jpg"), h:2(link:"b.jpg") ', 'mixed-separators'], ['h:1(sign:"only") ', 'no-link'], [link('report.pdf'), 'whole-wrappers'],
]) test(`unsupported/non-photo evidence remains visible: ${shape}`, () => {
  const model = detectPhotoLinkReview(context([{ tema: 'LOK', hyperlink: raw }]));
  assert.equal(model.rows.length, 1); assert.equal(model.rows[0].cells[0].shape, shape);
  if (raw.includes('.pdf')) assert.equal(model.rows[0].references[0].resolution.status, 'invalid');
  assert.equal(model.targets.length, 0);
});

test('ambiguous imported copies cannot become confident from basename equality', () => {
  const model = detectPhotoLinkReview({ ...context(baseObjects), photos: [asset('a'), asset('b')] });
  assert.equal(model.rows[0].references[0].resolution.status, 'ambiguous');
  assert.equal(model.rows[0].groups[0].assetId, null);
  assert.equal(model.rows[0].groups[0].photos.length, 2, 'both ambiguous copies can be inspected without accepting an association');
  assert.equal(model.rows[0].relatedPhotos.length, 0, 'ambiguous copies establish no accepted placement');
  assert.equal(photoLinkReviewCandidates(model, model.rows[0])[0].reusedAssets.length, 0);
});

test('duplicate and missing GUIDs retain exact source-index identity and warnings', () => {
  const input = context(baseObjects, (text) => text.replaceAll('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001'));
  const model = detectPhotoLinkReview(input);
  assert.equal(model.rows[0].objectKey, 'point:0'); assert.equal(model.rows[1].objectKey, 'point:1');
  assert(model.rows[0].issues.some((issue) => issue.includes('GUID')));
});

for (const crs of ['COSYS_EPSG 4326', 'COSYS_EPSG 999999', '']) test(`distance respects declared CRS: ${crs || 'missing'}`, () => {
  const input = context([{ tema: 'LOK', hyperlink: link(), xyz: '10 60 7' }, { tema: 'KUM', xyz: '10.001 60 2' }],
    (text) => text.replace('COSYS_EPSG 25832', crs));
  const model = detectPhotoLinkReview(input), candidate = photoLinkReviewCandidates(model, model.rows[0])[0];
  if (crs.includes('4326')) { assert(candidate.distanceMetres > 50 && candidate.distanceMetres < 60); }
  else { assert.equal(candidate.distanceMetres, null); assert.equal(candidate.target.placement.position, null); }
  assert.equal(candidate.deltaZ, -5, 'raw Z never transformed');
});

test('temporary explicit target and complete-group selections are pure, reject foreign targets, and clear on cancellation', () => {
  const model = detectPhotoLinkReview({ ...context(baseObjects), photos: [asset()] }), row = model.rows[0];
  const before = JSON.stringify(model);
  let state = emptyPhotoLinkReviewChoices();
  assert.strictEqual(reducePhotoLinkReviewChoices(state, { type: 'target', objectKey: row.objectKey, targetKey: 'foreign' }, model), state);
  state = reducePhotoLinkReviewChoices(state, { type: 'target', objectKey: row.objectKey, targetKey: model.targets[1].objectKey }, model);
  state = reducePhotoLinkReviewChoices(state, { type: 'group', objectKey: row.objectKey, groupKey: row.groups[0].key, selected: true }, model);
  const proposal = photoLinkReviewProposal(model, row, state);
  assert.equal(proposal.referenceIds.length, 2); assert.equal(proposal.targetObjectKey, model.targets[1].objectKey);
  assert.equal(proposal.writable, false); assert.equal(JSON.stringify(model), before);
  assert.deepEqual(reducePhotoLinkReviewChoices(state, { type: 'clear' }, model), emptyPhotoLinkReviewChoices());
});

function handoffContext(count = 65) {
  const input = context([...Array.from({ length: count }, (_, index) => ({ tema: index % 2 ? 'TOP' : 'LOK', hyperlink: link(), label: `Cover ${index}` })), { tema: 'KUM' }]);
  const layer = { id: input.layerId, data: input.dataset };
  const binding = { layerId: layer.id, inputId: 'input', datasetRevision: getDatasetRevision(input.dataset) };
  const run = validateGmiDataset(input.dataset, { layerId: layer.id, referenceDate: '2026-11-20' });
  const ruleIds = run.ruleResults.filter((entry) => entry.rule.canonicalFieldId === 'attachmentLink').map((entry) => entry.rule.ruleId);
  return { ...input, layer, binding, run, ruleIds, datasetKind: 'original' };
}

test('Validator handoff uses all 65 detailed findings and exact identities; focused model can show all same-source cases', () => {
  const input = handoffContext(), prepared = preparePhotoLinkReviewHandoff(input);
  assert(prepared.ok); assert.equal(prepared.request.refs.length, 65); assert.equal(prepared.request.findings.length, 65);
  assert(photoLinkReviewHandoffIsCurrent(prepared.request, input));
  const model = detectPhotoLinkReview({ ...input, focusRefs: prepared.request.refs.slice(40) });
  assert.equal(model.rows.length, 65); assert.equal(model.rows.filter((row) => row.focused).length, 25);
  assert.equal(model.targets.length, 1);
});

test('handoff rejects stale revision, replaced source, tampered/capped refs, wrong binding, reference date ownership and proposed session', () => {
  const input = handoffContext(3), { request } = preparePhotoLinkReviewHandoff(input);
  for (const changed of [
    { binding: { ...input.binding, inputId: 'replaced' } }, { layer: { ...input.layer, data: { ...input.dataset } } },
    { dataset: { ...input.dataset } }, { session: {} },
  ]) assert.equal(photoLinkReviewHandoffIsCurrent(request, { ...input, ...changed }), false);
  assert.equal(photoLinkReviewHandoffIsCurrent({ ...request, refs: request.refs.slice(0, 1) }, input), false);
  assert.equal(preparePhotoLinkReviewHandoff({ ...input, binding: { ...input.binding, datasetRevision: 'stale' } }).ok, false);
  assert.equal(preparePhotoLinkReviewHandoff({ ...input, run: { ...input.run, datasetRevision: 'stale' } }).ok, false);
  assert.equal(preparePhotoLinkReviewHandoff({ ...input, dataset: null }).ok, false);
  assert.equal(photoLinkReviewHandoffIsCurrent({ ...request, binding: null }, input), false);
  const run = { ...input.run, ruleResults: input.run.ruleResults.map((entry) => ({ ...entry, findings: entry.findings.map((finding) => ({ ...finding, objectRef: { ...finding.objectRef, key: 'forged' } })) })) };
  assert.equal(preparePhotoLinkReviewHandoff({ ...input, run }).ok, false);
});

test('proposed Tema controls source and candidate eligibility with original identity/geometry retained', () => {
  const input = handoffContext(3), session = {};
  const proposed = { ...input.dataset, points: input.dataset.points.map((point, index) => index === 1 ? { ...point, attributes: { ...point.attributes, S_FCODE: 'KUM' } } : point) };
  // The real proposed engine reparses lexical evidence; use a fresh parser to represent that verified dataset.
  const parser = new GMIParser(input.text.replace('_FIELDVALUES TOP;', '_FIELDVALUES KUM;'));
  Object.assign(proposed, parser.toObject());
  const run = validateGmiDataset(proposed, { layerId: input.layerId, referenceDate: '2026-11-20' });
  const prepared = preparePhotoLinkReviewHandoff({ ...input, dataset: proposed, run, datasetKind: 'proposed', session });
  assert(prepared.ok); assert.equal(prepared.request.refs.length, 2);
  assert(photoLinkReviewHandoffIsCurrent(prepared.request, { ...input, dataset: proposed, session }));
  const model = detectPhotoLinkReview({ ...input, dataset: proposed, focusRefs: prepared.request.refs });
  assert.equal(model.rows.length, 2); assert.equal(model.targets.length, 2);
  assert.deepEqual(model.targets[0].rawGeometry, Object.values(input.source.objectsByKey)[1].rawGeometry);
});

test('live FOTO session, source bytes, correction history, accepted alternatives, delivery/export snapshots remain identical through review/clear/reopen', async () => {
  let next = 0;
  const session = createPhotoSession({ createId: () => `test-${++next}`, yieldJob: () => Promise.resolve(),
    urls: { createObjectURL: () => `blob:${++next}`, revokeObjectURL() {} },
    createThumbnail: async () => ({ dimensions: { width: 2, height: 2 }, thumbnailBlob: new Blob(['thumb']) }),
    extractGps: async () => ({ state: 'no-gps' }) });
  session.importFiles([new File(['original-image-bytes'], 'a.jpg', { type: 'image/jpeg' })]);
  const layer = session.createLayer();
  const file = gmiFile(baseObjects), bytes = new Uint8Array(await file.arrayBuffer());
  const document = createGmiSourceDocument(bytes), history = createGmiEditSession(document, { layerId: 'survey' });
  const ticket = session.beginSourceWorkflow(layer.id);
  await session.stageLayerSource(layer.id, file, 'gmi');
  assert(saveStagedSource(session, ticket, session.getSnapshot().sourceReviews[layer.id]).ok);
  for (let attempt = 0; attempt < 30 && session.getLayerPhotos(layer.id).some((photo) => photo.preview.state === 'pending'); attempt++) await new Promise((resolve) => setImmediate(resolve));
  const photos = session.getLayerPhotos(layer.id), source = session.getLayer(layer.id).spatialSources[0];
  assert(session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [{ photoId: photos[0].id, position: { crs: 'EPSG:4326', longitude: 10, latitude: 60 } }]).ok);
  assert(session.setDeliveryIntent(layer.id, [photos[0].id], 'exclude').ok);
  assert(session.setDeliveryIntent(layer.id, [photos[1].id], 'transfer').ok);
  const snapshot = session.getSnapshot(), delivery = session.getPhotoDeliverySnapshot(layer.id), accepted = session.getLayerPhotos(layer.id);
  let publications = 0; const unsubscribe = session.subscribe(() => publications++);
  for (let round = 0; round < 3; round++) {
    const model = detectPhotoLinkReview({ source, photos: session.getLayerPhotos(layer.id), delivery: session.getLayerDelivery(layer.id) });
    const row = model.rows[0], candidate = photoLinkReviewCandidates(model, row)[0];
    assert(candidate.conflicts.some((issue) => issue.includes('Leveringsvalg')));
    assert(candidate.conflicts.some((issue) => issue.includes('akseptert plassering')));
    assert(candidate.conflicts.some((issue) => issue.includes('egen plassering')));
    let choices = reducePhotoLinkReviewChoices(emptyPhotoLinkReviewChoices(), { type: 'target', objectKey: row.objectKey, targetKey: candidate.target.objectKey }, model);
    assert.equal(photoLinkReviewProposal(model, row, choices).writable, false);
    choices = reducePhotoLinkReviewChoices(choices, { type: 'clear' }, model);
    assert.deepEqual(choices, emptyPhotoLinkReviewChoices());
  }
  assert.strictEqual(session.getSnapshot(), snapshot); assert.equal(publications, 0);
  assert(session.isPhotoDeliverySnapshotCurrent(delivery)); assert.deepEqual(session.getLayerPhotos(layer.id), accepted);
  assert.deepEqual(getGmiSourceBytes(document), bytes); assert.equal(history.changeSets.length, 0);
  unsubscribe(); session.clear();
});

test('detached adapter copies lexical evidence without writing original attributes', () => {
  const input = context(baseObjects), before = JSON.stringify(input.source);
  assert.equal(photoLinkReviewDataset(input.source).points.length, 4);
  assert.equal(JSON.stringify(input.source), before);
});

test('missing Z and malformed point geometry remain visible without invented height or distance', () => {
  const input = context([{ tema: 'LOK', hyperlink: link(), xyz: '581930 6566000' }, { tema: 'KUM', xyz: '581933 6566004' }]);
  const model = detectPhotoLinkReview(input), candidate = photoLinkReviewCandidates(model, model.rows[0])[0];
  assert.equal(candidate.deltaZ, null); assert.equal(candidate.distanceMetres, 5);
  const target = Object.values(input.source.objectsByKey)[1];
  const malformed = { ...input.source, objectsByKey: { ...input.source.objectsByKey, [target.objectKey]: { ...target, rawGeometry: [...target.rawGeometry, ...target.rawGeometry] } } };
  const invalid = detectPhotoLinkReview({ ...input, source: malformed });
  const blocked = photoLinkReviewCandidates(invalid, invalid.rows[0])[0];
  assert.equal(blocked.distanceMetres, null); assert(blocked.conflicts.some((issue) => issue.includes('sikker posisjon')));
});

test('alias and composed hyperlink values stay read-only with actionable shape/column evidence', () => {
  const alias = context([{ tema: 'LOK', hyperlink: link() }], (text) => text.replaceAll('S_HYPERLINK', 'S_HYPERLINK_punkt'));
  const model = detectPhotoLinkReview(alias);
  assert.equal(model.rows.length, 1); assert.equal(model.rows[0].cells[0].canonical, false);
  assert(model.rows[0].issues.some((issue) => issue.includes('lenkekolonner')));
  const original = context([{ tema: 'LOK', hyperlink: link() }]);
  const object = Object.values(original.source.objectsByKey)[0];
  const source = { ...original.source, objectsByKey: { [object.objectKey]: { ...object, rawFields: { ...object.rawFields, S_HYPERLINK: [link(), link('b.jpg')] } } } };
  assert.equal(detectPhotoLinkReview({ ...original, source }).rows[0].cells[0].shape, 'non-string');
});

test('raw duplicate references remain identifiable with no assets; array-index and source guards fail closed', () => {
  const input = context(baseObjects), model = detectPhotoLinkReview(input);
  assert.equal(model.rows[0].references[0].identicalRawReferenceIds.length, 3);
  assert.equal(model.rows[0].groups[0].assetId, null, 'raw reference repetition is not asset equivalence');
  const dataset = { ...input.dataset, points: input.dataset.points.slice(1) };
  assert.throws(() => detectPhotoLinkReview({ ...input, dataset }), /endret/);
  const moved = { ...input.dataset, points: [...input.dataset.points].reverse() };
  assert.throws(() => detectPhotoLinkReview({ ...input, dataset: moved }), /endret/);
});

test('a confidently matched unlinked asset retains its accepted alternative in review, without creating an occurrence', () => {
  const photo = asset();
  photo.spatial.current = { position: { crs: 'EPSG:4326', longitude: 10, latitude: 60 }, acceptance: 'manual' };
  const model = detectPhotoLinkReview({ ...context(baseObjects), photos: [photo] }), row = model.rows[0];
  assert.equal(row.photos.length, 0); assert.equal(row.relatedPhotos.length, 1);
  assert.strictEqual(row.relatedPhotos[0].spatial.current, photo.spatial.current);
  const proposal = photoLinkReviewProposal(model, row, emptyPhotoLinkReviewChoices());
  assert.deepEqual(proposal.current[0].current.position, photo.spatial.current.position);
  assert.equal(photo.occurrence, undefined);
});
