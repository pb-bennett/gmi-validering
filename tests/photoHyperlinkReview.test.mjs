import assert from 'node:assert/strict';
import test from 'node:test';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { createGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { validateGmiDataset, createGmiSourceDocument, getGmiSourceBytes, createGmiEditSession } from '../src/lib/gmi-edit/index.mjs';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';
import { detectPhotoLinkReview, photoLinkReviewCandidates, photoLinkReviewDataset, photoLinkReviewHandoffIsCurrent,
  preparePhotoLinkReviewHandoff, emptyPhotoLinkReviewChoices, reducePhotoLinkReviewChoices, photoLinkReviewDecisions,
  photoLinkReviewProgress, photoLinkDecisionKey, PHOTO_LINK_REVIEW_WRITABLE } from '../src/lib/photos/photoHyperlinkReview.mjs';
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
  assert.equal(model.rows.length, 2); assert.equal(model.targets.length, 4, 'every point object is a possible recipient');
  assert.equal(model.rows[0].groups.length, 1); assert.equal(model.rows[0].groups[0].references.length, 2);
  assert.equal(model.rows[0].groups[0].sharedObjectKeys.length, 2);
  assert.equal(model.rows[1].references[0].resolution.status, 'unmatched');
  const candidates = photoLinkReviewCandidates(model, model.rows[0]);
  assert.deepEqual(candidates.map((entry) => [entry.target.tema, entry.distanceMetres]), [['TOP', 2], ['KUM', 5], ['KUM', 5]]);
  assert(!candidates.some((entry) => entry.target.objectKey === model.rows[0].objectKey), 'the source itself is never a recipient');
  assert.deepEqual(candidates[1].sameIdentifiers, ['AnleggsID']);
  assert.deepEqual(candidates[1].reusedAssets, ['a']); assert.equal(candidates[1].deltaZ, -5);
  assert(candidates[1].conflicts.some((entry) => entry.code === 'target-reuse' && entry.blocking));
  assert.equal(candidates[2].target.references[0].referenceRaw, 'existing.jpg');
  assert.deepEqual(emptyPhotoLinkReviewChoices(), { decisions: {} });
  assert.equal(JSON.stringify(input), before);
});

test('all same-source point objects stay candidates, including distant and coincident targets; no radius or automatic choice', () => {
  const model = detectPhotoLinkReview(context([baseObjects[0], { tema: 'KUM', xyz: '581930 6566000 50' },
    { tema: 'KUM', xyz: '681930 6566000 3' }]));
  const candidates = photoLinkReviewCandidates(model, model.rows[0]);
  assert.deepEqual(candidates.map((entry) => entry.distanceMetres), [0, 100000]);
  assert.equal(photoLinkReviewDecisions(model, emptyPhotoLinkReviewChoices()).length, 0, 'nothing is selected or paired automatically');
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
    assert.equal(model.rows.length, 2); assert.deepEqual(model.targets.map((target) => target.tema), ['LOK', 'TOP', 'KUM', 'KUM']);
    assert.equal(model.rows[0].temaIdentity.state, 'RESOLVED');
  }
  const input = context([baseObjects[0], baseObjects[2]], (text) => text.replaceAll('S_FCODE;Type', 'Tema;S_FCODE;Type')
    .replace('LOK;;', 'LOK;TOP;;').replace('KUM;;', 'KUM;LOK;;'));
  const model = detectPhotoLinkReview(input);
  assert.equal(model.targets.length, 2); assert.equal(model.targets[1].tema, null, 'a conflicting recipient Tema stays unresolved');
  assert.equal(model.rows[0].temaIdentity.state, 'CONFLICT');
  assert(model.rows[0].issues.some((issue) => issue.text.includes('Tema er uavklart') && issue.blocking));
  assert(photoLinkReviewCandidates(model, model.rows[0])[0].conflicts.some((entry) => entry.code === 'target-tema' && !entry.blocking));
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
  assert.equal(photoLinkReviewCandidates(model, model.rows[0]).length, 0, 'a lone source has no other point object');
  assert.equal(model.rows[0].issues.some((issue) => issue.code === 'link-shape'), shape !== 'whole-wrappers');
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
  assert(model.rows[0].issues.some((issue) => issue.text.includes('GUID')));
});

for (const crs of ['COSYS_EPSG 4326', 'COSYS_EPSG 999999', '']) test(`distance respects declared CRS: ${crs || 'missing'}`, () => {
  const input = context([{ tema: 'LOK', hyperlink: link(), xyz: '10 60 7' }, { tema: 'KUM', xyz: '10.001 60 2' }],
    (text) => text.replace('COSYS_EPSG 25832', crs));
  const model = detectPhotoLinkReview(input), candidate = photoLinkReviewCandidates(model, model.rows[0])[0];
  if (crs.includes('4326')) { assert(candidate.distanceMetres > 50 && candidate.distanceMetres < 60); }
  else { assert.equal(candidate.distanceMetres, null); assert.equal(candidate.target.placement.position, null); }
  assert.equal(candidate.deltaZ, -5, 'raw Z never transformed');
});

test('temporary decisions are pure, exact per reference group, reject foreign/self recipients, and clear on cancellation', () => {
  const model = detectPhotoLinkReview({ ...context(baseObjects), photos: [asset()], liveSource: true }), row = model.rows[0], group = row.groups[0];
  const before = JSON.stringify(model.rows);
  const act = (state, action) => reducePhotoLinkReviewChoices(state, { objectKey: row.objectKey, groupKey: group.key, ...action }, model);
  let state = emptyPhotoLinkReviewChoices();
  assert.strictEqual(act(state, { type: 'target', targetKey: model.targets[3].objectKey }), state, 'no recipient before an explicit selection');
  state = act(state, { type: 'select', selected: true });
  assert.deepEqual(state.decisions[group.decisionKey], { outcome: 'move', targetKey: null });
  assert.equal(group.decisionKey, photoLinkDecisionKey(row.objectKey, group.key));
  for (const targetKey of ['foreign', row.objectKey]) assert.strictEqual(act(state, { type: 'target', targetKey }), state);
  assert.strictEqual(act(state, { type: 'outcome', outcome: 'invented' }), state);
  state = act(state, { type: 'target', targetKey: model.targets[3].objectKey });
  const [decision] = photoLinkReviewDecisions(model, state);
  assert.deepEqual(decision.referenceIds, group.references.map((reference) => reference.id));
  assert.equal(decision.referenceIds.length, 2, 'repeated references keep both exact identities');
  assert.equal(decision.target.objectKey, model.targets[3].objectKey);
  // Batch 1B.4A (deliberate contract update): the review is writable; save-readiness follows resolution, nothing else.
  assert.equal(PHOTO_LINK_REVIEW_WRITABLE, true);
  const progress = photoLinkReviewProgress(model, [decision]);
  assert.deepEqual([progress.saveReady, progress.saveBlocker], decision.resolved ? [true, null] : [false, 'unresolved']);
  const gml = act(state, { type: 'outcome', outcome: 'gml' });
  assert.equal(gml.decisions[group.decisionKey].targetKey, null, 'another outcome never keeps a hidden recipient');
  assert.strictEqual(act(gml, { type: 'target', targetKey: model.targets[3].objectKey }), gml, 'only a move takes a recipient');
  assert.deepEqual(act(state, { type: 'select', selected: false }), emptyPhotoLinkReviewChoices(), 'deselecting leaves the references unchanged');
  assert.equal(JSON.stringify(model.rows), before);
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
  assert.equal(model.targets.length, 66, 'restricted Validator entry keeps the complete same-source recipient population');
  const focusedRow = model.rows.find((row) => row.focused);
  assert.equal(photoLinkReviewCandidates(model, focusedRow).length, 65);
  assert(photoLinkReviewCandidates(model, focusedRow).some((candidate) => !model.rows.find((row) => row.objectKey === candidate.target.objectKey)?.focused));
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
  assert.equal(model.rows.length, 2); assert.deepEqual(model.targets.map((target) => target.tema), ['LOK', 'KUM', 'LOK', 'KUM']);
  assert.deepEqual(model.targets[1].rawGeometry, Object.values(input.source.objectsByKey)[1].rawGeometry);
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
    const model = detectPhotoLinkReview({ source, photos: session.getLayerPhotos(layer.id), delivery: session.getLayerDelivery(layer.id), liveSource: true });
    const row = model.rows[0], group = row.groups[0], kum = model.targets.find((target) => target.sourceIndex === 2);
    const act = (state, action) => reducePhotoLinkReviewChoices(state, { objectKey: row.objectKey, groupKey: group.key, ...action }, model);
    let choices = act(act(emptyPhotoLinkReviewChoices(), { type: 'select', selected: true }), { type: 'target', targetKey: kum.objectKey });
    const [move] = photoLinkReviewDecisions(model, choices);
    assert.deepEqual(move.blocking.map((entry) => entry.code).sort(), ['accepted-position', 'delivery-conflict', 'target-placement-same-photo', 'target-reuse']);
    assert.equal(move.resolved, false);
    const [excluded] = photoLinkReviewDecisions(model, act(choices, { type: 'outcome', outcome: 'exclude' }));
    assert.equal(excluded.deliveryEntry.status, 'exclude', 'Ikke reuses the existing occurrence delivery decision');
    assert.equal(excluded.resolved, true);
    const progress = photoLinkReviewProgress(model, [excluded]);
    assert.deepEqual([progress.selected, progress.resolved, progress.unresolved, progress.saveReady], [1, 1, 0, false]);
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
  assert.equal(blocked.distanceMetres, null); assert(blocked.conflicts.some((issue) => issue.text.includes('sikker posisjon') && issue.blocking));
});

test('alias and composed hyperlink values stay read-only with actionable shape/column evidence', () => {
  const alias = context([{ tema: 'LOK', hyperlink: link() }], (text) => text.replaceAll('S_HYPERLINK', 'S_HYPERLINK_punkt'));
  const model = detectPhotoLinkReview(alias);
  assert.equal(model.rows.length, 1); assert.equal(model.rows[0].cells[0].canonical, false);
  assert(model.rows[0].issues.some((issue) => issue.text.includes('lenkekolonner') && issue.blocking));
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
  assert.deepEqual(row.relatedPhotos[0].spatial.current.position, photo.spatial.current.position);
  assert.equal(row.groups[0].occurrencePhoto, null, 'no FOTO occurrence exists on the object, so GML/Ikke cannot be proposed');
  const choices = reducePhotoLinkReviewChoices(reducePhotoLinkReviewChoices(emptyPhotoLinkReviewChoices(),
    { type: 'select', objectKey: row.objectKey, groupKey: row.groups[0].key, selected: true }, model),
  { type: 'outcome', objectKey: row.objectKey, groupKey: row.groups[0].key, outcome: 'gml' }, model);
  assert(photoLinkReviewDecisions(model, choices)[0].blocking.some((entry) => entry.code === 'delivery-unavailable'));
  assert.equal(photo.occurrence, undefined);
});

// Batch 1A.2: all point objects as recipients, exact per-reference decisions and the Kontroll progression contract.
const occurrence = (photo, objectKey) => ({ ...photo, occurrence: { sourceFingerprint: 'synthetic-fingerprint', objectKey } });
// Batch 1B.2B: a move needs the FOTO occurrence of exactly that source object (the transaction moves it), so fixtures that
// expect an «Avklart» move give the photograph its occurrence on the source object (unplaced: nothing to replace).
const occurrencesOn = (input, pairs) => pairs.map(([photo, index]) => occurrence(photo, Object.values(input.source.objectsByKey)[index].objectKey));
const linkedEntry = (status = 'keep-link') => ({ status, linked: true, canTransfer: true, association: { state: 'confident' } });
function decide(model, steps) {
  let state = emptyPhotoLinkReviewChoices();
  for (const [row, group, action] of steps) state = reducePhotoLinkReviewChoices(state, { objectKey: row.objectKey, groupKey: group.key, ...action }, model);
  return state;
}

test('a LOK at Punkt 293 offers the SLU 0.18 m away before more distant KUM, GUT and other point types, without a Tema whitelist', () => {
  const input = context([
    { tema: 'KUM', parserId: 10, xyz: '581944 6566000 1' },
    { tema: 'LOK', parserId: 293, hyperlink: link('lok.jpg'), xyz: '581930 6566000 7' },
    { tema: 'SLU', parserId: 294, label: 'SLU-1', xyz: '581930.18 6566000 6.5' },
    { tema: 'GUT', parserId: 295, xyz: '581930 6566003 5' },
    { tema: 'XYZ', parserId: 296, xyz: '581930 6566009 5' },
    { tema: 'KUM', parserId: 297, xyz: '582930 6566000 1' },
    { scope: 'line', tema: 'VL', guid: '00000000-0000-4000-8000-000000009999', hyperlink: link('line.jpg') },
  ]);
  const model = detectPhotoLinkReview(input), row = model.rows[0];
  assert.equal(row.pointName, 'Punkt 293'); assert.equal(row.tema, 'LOK');
  const candidates = photoLinkReviewCandidates(model, row);
  assert.deepEqual(candidates.map(({ target }) => [target.tema, target.pointName]),
    [['SLU', 'Punkt 294'], ['GUT', 'Punkt 295'], ['XYZ', 'Punkt 296'], ['KUM', 'Punkt 10'], ['KUM', 'Punkt 297']]);
  assert(Math.abs(candidates[0].distanceMetres - 0.18) < 1e-6); assert.equal(candidates[3].distanceMetres, 14);
  assert.equal(candidates[4].distanceMetres, 1000, 'distant objects stay in the searchable population');
  assert.equal(candidates[0].target.anleggsId, 'SLU-1'); assert.equal(candidates[0].target.photoReferenceCount, 0);
  assert(!candidates.some(({ target }) => target.geometryScope !== 'point'), 'line objects are never point recipients');
  assert.equal(photoLinkReviewDecisions(model, emptyPhotoLinkReviewChoices()).length, 0, 'the nearest object is not selected');
});

test('ascending XY order is exact: ties keep source order and objects without a safe distance follow in source order', () => {
  const model = detectPhotoLinkReview(context([
    { tema: 'KUM', xyz: '581930 6566000 1\n581931 6566000 1' },
    { tema: 'SLU', xyz: '581935 6566000 1' },
    { tema: 'LOK', hyperlink: link(), xyz: '581930 6566000 1' },
    { tema: 'KUM', xyz: '581933 6566004 1' },
    { tema: 'GUT', xyz: '581931 6566000 1' },
    { tema: 'KUM', xyz: '581926 6566003 1\n581927 6566003 1' },
  ]));
  const candidates = photoLinkReviewCandidates(model, model.rows[0]);
  assert.deepEqual(candidates.map((entry) => [entry.target.sourceIndex, entry.distanceMetres]), [[4, 1], [1, 5], [3, 5], [0, null], [5, null]]);
  assert(candidates.slice(3).every((entry) => entry.conflicts.some((conflict) => conflict.code === 'target-placement' && conflict.blocking)));
});

test('independent pairings for several source objects; a recipient never spreads to unrelated references and can be changed later', () => {
  const input = context([
    { tema: 'LOK', hyperlink: link('a.jpg') + link('b.jpg', 2), xyz: '581930 6566000 1' },
    { tema: 'TOP', hyperlink: link('c.jpg'), xyz: '581940 6566000 1' },
    { tema: 'SLU', xyz: '581930.5 6566000 1' },
    { tema: 'KUM', xyz: '581941 6566000 1' },
  ]);
  const model = detectPhotoLinkReview({ ...input, photos: occurrencesOn(input, [[asset('a', 'a.jpg'), 0], [asset('b', 'b.jpg'), 0], [asset('c', 'c.jpg'), 1]]), liveSource: true });
  const [lok, top] = model.rows, [slu, kum] = model.targets.slice(2);
  assert.equal(lok.groups.length, 2);
  let state = decide(model, [[lok, lok.groups[0], { type: 'select', selected: true }], [lok, lok.groups[0], { type: 'target', targetKey: slu.objectKey }],
    [lok, lok.groups[1], { type: 'select', selected: true }], [top, top.groups[0], { type: 'select', selected: true }],
    [top, top.groups[0], { type: 'target', targetKey: kum.objectKey }]]);
  let decisions = photoLinkReviewDecisions(model, state);
  assert.deepEqual(decisions.map((entry) => [entry.row.objectKey, entry.group.assetId, entry.target?.objectKey ?? null]),
    [[lok.objectKey, 'a', slu.objectKey], [lok.objectKey, 'b', null], [top.objectKey, 'c', kum.objectKey]]);
  assert(decisions[1].blocking.some((entry) => entry.code === 'recipient-missing'), 'a selected move without a recipient stays unresolved');
  const progress = photoLinkReviewProgress(model, decisions);
  assert.deepEqual([progress.selected, progress.resolved, progress.unresolved, progress.unchangedReferences], [3, 2, 1, 0]);
  state = reducePhotoLinkReviewChoices(decide(model, [[lok, lok.groups[0], { type: 'select', selected: true }], [lok, lok.groups[0], { type: 'target', targetKey: slu.objectKey }],
    [top, top.groups[0], { type: 'select', selected: true }], [top, top.groups[0], { type: 'target', targetKey: kum.objectKey }]]),
  { type: 'target', objectKey: lok.objectKey, groupKey: lok.groups[0].key, targetKey: kum.objectKey }, model);
  decisions = photoLinkReviewDecisions(model, state);
  assert.deepEqual(decisions.map((entry) => entry.target.objectKey), [kum.objectKey, kum.objectKey], 'returning to an earlier pairing changes only that decision');
  assert.equal(photoLinkReviewProgress(model, decisions).unchangedReferences, 1, 'the unselected b.jpg reference stays unchanged');
});

test('repeated references and shared photographs keep exact occurrence identities; a duplicate recipient photo blocks', () => {
  const model = detectPhotoLinkReview({ ...context([
    { tema: 'LOK', hyperlink: link('a.jpg') + link('a.jpg', 2), xyz: '581930 6566000 1' },
    { tema: 'TOP', hyperlink: link('a.jpg'), xyz: '581931 6566000 1' },
    { tema: 'SLU', xyz: '581932 6566000 1' },
  ]), photos: [asset('a', 'a.jpg')], liveSource: true });
  const [lok, top] = model.rows, slu = model.targets[2];
  assert.notEqual(lok.groups[0].decisionKey, top.groups[0].decisionKey, 'one decision per object occurrence of a shared photo');
  const state = decide(model, [[lok, lok.groups[0], { type: 'select', selected: true }], [lok, lok.groups[0], { type: 'target', targetKey: slu.objectKey }],
    [top, top.groups[0], { type: 'select', selected: true }], [top, top.groups[0], { type: 'target', targetKey: slu.objectKey }]]);
  const decisions = photoLinkReviewDecisions(model, state);
  assert.deepEqual(decisions.map((entry) => entry.referenceIds.length), [2, 1]);
  assert.equal(new Set(decisions.flatMap((entry) => entry.referenceIds)).size, 3);
  assert(decisions.every((entry) => entry.blocking.some((issue) => issue.code === 'duplicate-recipient-photo')));
  const differing = photoLinkReviewDecisions(model, reducePhotoLinkReviewChoices(state, { type: 'outcome', objectKey: top.objectKey, groupKey: top.groups[0].key, outcome: 'keep' }, model));
  assert(differing[0].warnings.some((issue) => issue.code === 'shared-photo-differs'));
  assert.equal(differing[1].resolved, true, 'Behold uendret is always resolved');
});

test('recipients that already contain hyperlinks: other links warn, the same photo or an unsupported cell blocks', () => {
  const input = context([
    { tema: 'LOK', hyperlink: link('a.jpg'), xyz: '581930 6566000 1' },
    { tema: 'KUM', hyperlink: link('other.jpg') + link('more.jpg', 2), xyz: '581931 6566000 1' },
    { tema: 'KUM', hyperlink: link('a.jpg'), xyz: '581932 6566000 1' },
    { tema: 'SLU', hyperlink: 'h:1(link:"broken.jpg"', xyz: '581933 6566000 1' },
  ]);
  const model = detectPhotoLinkReview({ ...input, photos: occurrencesOn(input, [[asset('a', 'a.jpg'), 0]]), liveSource: true });
  const [lok] = model.rows, [, withLinks, samePhoto, malformed] = model.targets;
  const outcome = (target) => photoLinkReviewDecisions(model, decide(model, [[lok, lok.groups[0], { type: 'select', selected: true }],
    [lok, lok.groups[0], { type: 'target', targetKey: target.objectKey }]]))[0];
  const kept = outcome(withLinks);
  assert.equal(kept.resolved, true); assert.equal(withLinks.photoReferenceCount, 2);
  assert(kept.warnings.some((issue) => issue.code === 'target-existing-links' && issue.text.includes('2 eksisterende')));
  assert(outcome(samePhoto).blocking.some((issue) => issue.code === 'target-reuse'));
  assert(outcome(malformed).blocking.some((issue) => issue.code === 'target-link-shape'));
});

test('missing assets, unsupported grammar, conflicting delivery decisions and FOTO-only sources stay unresolved', () => {
  const objects = [
    { tema: 'LOK', hyperlink: link('missing.jpg'), xyz: '581930 6566000 1' },
    { tema: 'TOP', hyperlink: 'h:1(link:"a.jpg" link:"b.jpg") ', xyz: '581931 6566000 1' },
    { tema: 'LOK', hyperlink: link('c.jpg'), xyz: '581932 6566000 1' },
    { tema: 'SLU', xyz: '581933 6566000 1' },
  ];
  const input = context(objects), c = occurrence(asset('c', 'c.jpg'), Object.values(input.source.objectsByKey)[2].objectKey);
  const delivery = { byPhotoId: { c: linkedEntry('transfer') } };
  for (const liveSource of [true, false]) {
    const model = detectPhotoLinkReview({ ...input, photos: [c], delivery, liveSource }), slu = model.targets[3];
    const steps = model.rows.flatMap((row) => [[row, row.groups[0], { type: 'select', selected: true }], [row, row.groups[0], { type: 'target', targetKey: slu.objectKey }]]);
    const decisions = photoLinkReviewDecisions(model, decide(model, steps));
    const codes = decisions.map((entry) => entry.blocking.map((issue) => issue.code));
    assert(codes[0].includes('asset-missing')); assert(codes[1].includes('link-shape')); assert(codes[2].includes('delivery-conflict'));
    assert.equal(codes.every((list) => list.includes('foto-only')), !liveSource);
    assert.equal(photoLinkReviewProgress(model, decisions).unresolved, 3);
    // GML reuses the existing occurrence delivery eligibility instead of a parallel decision.
    const gml = photoLinkReviewDecisions(model, decide(model, [...steps, [model.rows[2], model.rows[2].groups[0], { type: 'outcome', outcome: 'gml' }]]))[2];
    assert.equal(gml.resolved, true); assert.equal(gml.deliveryEntry.status, 'transfer');
    const unavailable = { byPhotoId: { c: { ...linkedEntry(), canTransfer: false, association: { state: 'source-not-live' } } } };
    const blocked = detectPhotoLinkReview({ ...input, photos: [c], delivery: unavailable, liveSource });
    const excluded = photoLinkReviewDecisions(blocked, decide(blocked, [[blocked.rows[2], blocked.rows[2].groups[0], { type: 'select', selected: true }],
      [blocked.rows[2], blocked.rows[2].groups[0], { type: 'outcome', outcome: 'exclude' }]]))[0];
    assert(excluded.blocking.some((issue) => issue.code === 'delivery-unavailable' && issue.text.includes('ikke lenger lastet')));
  }
});

// Batch 1B.4A (deliberate contract update): with the review writable, a resolved chain of moves is save-ready.
test('a recipient that is itself a changing source is flagged; a resolved chain of moves is save-ready', () => {
  const input = context([
    { tema: 'LOK', hyperlink: link('a.jpg'), xyz: '581930 6566000 1' },
    { tema: 'TOP', hyperlink: link('b.jpg'), xyz: '581931 6566000 1' },
    { tema: 'SLU', xyz: '581932 6566000 1' },
  ]);
  const model = detectPhotoLinkReview({ ...input, photos: occurrencesOn(input, [[asset('a', 'a.jpg'), 0], [asset('b', 'b.jpg'), 1]]), liveSource: true });
  const [lok, top] = model.rows, slu = model.targets[2];
  const decisions = photoLinkReviewDecisions(model, decide(model, [[lok, lok.groups[0], { type: 'select', selected: true }],
    [lok, lok.groups[0], { type: 'target', targetKey: top.objectKey }], [top, top.groups[0], { type: 'select', selected: true }],
    [top, top.groups[0], { type: 'target', targetKey: slu.objectKey }]]));
  assert(decisions[0].warnings.some((issue) => issue.code === 'recipient-also-changes'));
  const progress = photoLinkReviewProgress(model, decisions);
  assert.deepEqual([progress.selected, progress.resolved, progress.allResolved, progress.saveReady, progress.moves], [2, 2, true, true, 2]);
  assert(Object.isFrozen(decisions) && Object.isFrozen(decisions[0]) && Object.isFrozen(decisions[0].blocking));
  assert.equal(photoLinkReviewProgress(model, []).allResolved, false, 'no selection is never a resolved review');
});
